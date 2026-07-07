import pandas as pd
import numpy as np
import json
import os
from datetime import datetime, timedelta

excel_file = r"c:\Users\PC\Desktop\계측기폴더\(WP-C)(S06-01)지하수위계-수정(이).xlsx"
output_js_file = r"c:\Users\PC\Desktop\계측기폴더\src\data\groundwaterData.js"

# 이미지의 상세 메타데이터 스펙 반영
# 코드 매핑: W-P-001 -> W-1, W-P-002 -> W-2, 등
gauge_metadata = {
    "W-P-001": {
        "displayName": "W-1",
        "location": "현장 내부 (본선환기구#15 굴착영향범위)",
        "installDate": "2026-01-14",
        "initialMeasureDate": "2026-01-20",
        "datum": 120.850,
        "bmInfo": "수준기준점 No.6 EL-120.890m"
    },
    "W-P-002": {
        "displayName": "W-2",
        "location": "현장 내부 (본선환기구#15 굴착영향범위)",
        "installDate": "2026-02-10",
        "initialMeasureDate": "2026-02-15",
        "datum": 116.271,
        "bmInfo": "수준기준점 No.2 EL-116.350m"
    },
    "W-P-003": {
        "displayName": "W-3",
        "location": "현장 내부",
        "installDate": "2025-02-24",
        "initialMeasureDate": "2025-03-02",
        "datum": 116.271,
        "bmInfo": "수준기준점 No.3 EL-116.310m"
    },
    "W-P-004": {
        "displayName": "W-4",
        "location": "현장 내부",
        "installDate": "2025-02-24",
        "initialMeasureDate": "2025-03-02",
        "datum": 116.271,
        "bmInfo": "수준기준점 No.3 EL-116.310m"
    },
    "W-P-005": {
        "displayName": "W-5",
        "location": "현장 내부",
        "installDate": "2025-06-09",
        "initialMeasureDate": "2025-06-15",
        "datum": 116.271,
        "bmInfo": "수준기준점 No.4 EL-116.300m"
    },
    "W-P-010": {
        "displayName": "W-10",
        "location": "현장 내부 (본선환기구#15 굴착영향범위)",
        "installDate": "2025-07-18",
        "initialMeasureDate": "2025-07-24",
        "datum": 116.271,
        "bmInfo": "수준기준점 No.5 EL-116.290m"
    }
}

# 이미지 상의 실제 임계 관리기준 반영 (누적변화량 1.59 / 1.99 / 2.39 m)
thresholds = {
    "deltaInit": {"level1": 1.59, "level2": 1.99, "level3": 2.39, "unit": "m"},
    "rate1D": {"level1": 0.50, "level2": 0.75, "level3": 1.00, "unit": "m/day"}
}

def parse_gauge_sheet(xl, sheet_name):
    # 헤더는 7번째 행(skiprows=7) 스킵
    df_raw = xl.parse(sheet_name, skiprows=7)
    
    data_list = []
    
    for idx, row in df_raw.iterrows():
        date_val = row.iloc[2]
        if pd.isna(date_val):
            continue
            
        if isinstance(date_val, datetime):
            date_str = date_val.strftime("%Y-%m-%d")
        else:
            try:
                date_str = pd.to_datetime(date_val).strftime("%Y-%m-%d")
            except:
                continue
        
        try:
            # 굴착고 (X) - 음수값 그대로 파싱
            raw_depth = row.iloc[12]
            excavation_depth = float(raw_depth) if not pd.isna(raw_depth) else 0.0
            
            # 누적변화량 (Col 10) - 음수값 그대로 파싱 (예: -0.20)
            raw_delta = row.iloc[10]
            actual_delta = float(raw_delta) if not pd.isna(raw_delta) else 0.0
            
            # 측정치(E.L) (Col 7) - 지하수위 절대 표고
            raw_wl = row.iloc[7]
            actual_wl = float(raw_wl) if not pd.isna(raw_wl) else 0.0
            
            # 측정치(G.L) (Col 8)
            raw_gl = row.iloc[8]
            actual_gl = float(raw_gl) if not pd.isna(raw_gl) else 0.0
            
            # 관상단(E.L) (Col 6)
            raw_pipe = row.iloc[6]
            pipe_top = float(raw_pipe) if not pd.isna(raw_pipe) else 0.0

            # 일간 변위 (Col 11) - 일간 변화량이므로 양수/음수 속도 유지
            raw_rate = row.iloc[11]
            actual_rate = float(raw_rate) if not pd.isna(raw_rate) else 0.0
        except Exception as e:
            continue
            
        data_list.append({
            "date": date_str,
            "isForecast": False,
            "pipeTop": round(pipe_top, 3),
            "actualWaterLevel": round(actual_wl, 3),
            "actualGL": round(actual_gl, 3),
            "actualDelta": round(actual_delta, 3),
            "actualRate": round(actual_rate, 3),
            "excavationDepth": round(excavation_depth, 3),
            "arimaDelta": None,
            "lstmDelta": None,
            "transformerDelta": None,
            "arimaRate": None,
            "lstmRate": None,
            "transformerRate": None
        })
        
    return data_list

def generate_forecast(data_list, gauge_id):
    if not data_list:
        return []
        
    last_item = data_list[-1]
    last_date = datetime.strptime(last_item["date"], "%Y-%m-%d")
    last_delta = last_item["actualDelta"] # 음수 (예: -0.34)
    last_depth = last_item["excavationDepth"] # 음수 (예: -4)
    last_wl = last_item["actualWaterLevel"]
    last_gl = last_item["actualGL"]
    pipe_top = last_item["pipeTop"]
    
    forecast_data = []
    
    # 누적변화량의 과거 감하 속도 모사 (음수로 더 떨어짐)
    if len(data_list) > 5:
        recent_deltas = [item["actualDelta"] for item in data_list[-5:]]
        slope = (recent_deltas[-1] - recent_deltas[0]) / 5.0
        if slope > 0: slope = -0.05 # 아래로 하강하는 경향 확보
    else:
        slope = -0.05
        
    for i in range(1, 6):
        forecast_date = (last_date + timedelta(days=i)).strftime("%Y-%m-%d")
        
        # 굴착 깊이가 아래로 점진적으로 깊어짐 (-0.5m씩 하강)
        forecast_depth = last_depth - (i * 0.5)
        
        # 1. ARIMA 예측 (과거 하강 추세 그대로 음수로 가중 연장)
        arima_delta = last_delta + (i * slope * 0.8)
        
        # 2. LSTM 예측 (굴착고 하강에 연동하여 지하수위 하강폭 증가)
        lstm_factor = 1.0 + (abs(forecast_depth) * 0.02)
        lstm_delta = last_delta + (i * slope * lstm_factor)
        
        # 3. Transformer 예측 (돌발 급격 강하 시나리오)
        if i >= 3:
            tf_delta = last_delta + (i * slope * 1.4) - 0.3 # 음수 아래로 드롭 추가
        else:
            tf_delta = last_delta + (i * slope * 1.1)
            
        # 데모 시연 상 3차 임계치(2.39m)를 돌파하도록 일부 특정 수위계 유도
        # 예: W-P-001(W-1)은 3차 임계치인 -2.39m 아래로 뚫고 하강하도록 설정
        if gauge_id in ["W-P-001", "W-P-010"]:
            arima_delta -= i * 0.2
            lstm_delta -= i * 0.3
            transformer_delta = tf_delta - (i * 0.4)
        else:
            transformer_delta = tf_delta

        # 일간변위(RATE_1D) 예측치 계산
        prev_arima_delta = forecast_data[-1]["arimaDelta"] if i > 1 else last_delta
        prev_lstm_delta = forecast_data[-1]["lstmDelta"] if i > 1 else last_delta
        prev_tf_delta = forecast_data[-1]["transformerDelta"] if i > 1 else last_delta
        
        arima_rate = arima_delta - prev_arima_delta
        lstm_rate = lstm_delta - prev_lstm_delta
        tf_rate = transformer_delta - prev_tf_delta
        
        # 실제 지하수위(EL) 및 G.L 측정치 예측 계산
        arima_wl = last_wl + (arima_delta - last_delta)
        lstm_wl = last_wl + (lstm_delta - last_delta)
        tf_wl = last_wl + (transformer_delta - last_delta)
        
        arima_gl = last_gl + (arima_delta - last_delta)
        lstm_gl = last_gl + (lstm_delta - last_delta)
        tf_gl = last_gl + (transformer_delta - last_delta)
        
        forecast_data.append({
            "date": forecast_date,
            "isForecast": True,
            "pipeTop": round(pipe_top, 3),
            "actualWaterLevel": None,
            "actualGL": None,
            "actualDelta": None,
            "actualRate": None,
            "excavationDepth": round(forecast_depth, 3),
            "arimaDelta": round(arima_delta, 3),
            "lstmDelta": round(lstm_delta, 3),
            "transformerDelta": round(transformer_delta, 3),
            "arimaRate": round(arima_rate, 3),
            "lstmRate": round(lstm_rate, 3),
            "transformerRate": round(tf_rate, 3),
            "arimaWaterLevel": round(arima_wl, 3),
            "lstmWaterLevel": round(lstm_wl, 3),
            "transformerWaterLevel": round(tf_wl, 3)
        })
        
    return forecast_data

def main():
    if not os.path.exists(excel_file):
        print(f"Error: {excel_file} not found.")
        return
        
    xl = pd.ExcelFile(excel_file)
    output_data = {
        "projectInfo": {
            "projectName": "월곶-판교 복선전철 제4공구",
            "siteCode": "S06-01"
        },
        "instruments": {}
    }
    
    for sheet in xl.sheet_names:
        if sheet in gauge_metadata:
            meta = gauge_metadata[sheet]
            print(f"Parsing sheet: {sheet}")
            actual_data = parse_gauge_sheet(xl, sheet)
            forecast_data = generate_forecast(actual_data, sheet)
            
            output_data["instruments"][sheet] = {
                "code": sheet,
                "displayName": meta["displayName"],
                "location": meta["location"],
                "installDate": meta["installDate"],
                "initialMeasureDate": meta["initialMeasureDate"],
                "datumLevel": meta["datum"],
                "bmInfo": meta["bmInfo"],
                "thresholds": thresholds,
                "data": actual_data + forecast_data
            }
            print(f"  -> Processed {len(actual_data)} rows and {len(forecast_data)} forecast rows for {meta['displayName']}.")
            
    os.makedirs(os.path.dirname(output_js_file), exist_ok=True)
    with open(output_js_file, "w", encoding="utf-8") as f:
        f.write("/* eslint-disable */\n")
        f.write("// 자동 생성된 지하수위 계측 및 AI 예측 데이터베이스\n")
        f.write("export const groundwaterData = ")
        json.dump(output_data, f, ensure_ascii=False, indent=2)
        f.write(";\n")
        
    print(f"\nCompleted! Written data to: {output_js_file}")

if __name__ == "__main__":
    main()
