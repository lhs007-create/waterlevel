import pandas as pd
import numpy as np
import json
import os
from datetime import datetime, timedelta

excel_file = r"c:\Users\PC\Desktop\계측기폴더\(WP-C)(S06-01)지하수위계-수정(이).xlsx"
output_js_file = r"c:\Users\PC\Desktop\계측기폴더\src\data\groundwaterData.js"

# 기준 정보 매핑
gauge_metadata = {
    "W-P-001": {"location": "환기구 #11 수직구", "datum": 116.498},
    "W-P-002": {"location": "환기구 #11 수직구", "datum": 116.271},
    "W-P-003": {"location": "환기구 #11 수직구", "datum": 116.271},
    "W-P-004": {"location": "환기구 #11 수직구", "datum": 116.271},
    "W-P-005": {"location": "환기구 #11 수직구", "datum": 116.271},
    "W-P-010": {"location": "환기구 #11 수직구", "datum": 116.271}
}

thresholds = {
    "deltaInit": {"level1": 5.84, "level2": 7.30, "level3": 8.76, "unit": "m"},
    "rate1D": {"level1": 0.50, "level2": 0.75, "level3": 1.00, "unit": "m/day"}
}

def parse_gauge_sheet(xl, sheet_name):
    # 헤더는 7번째 행(인덱스 7)에 걸쳐 있음
    df_raw = xl.parse(sheet_name, skiprows=7)
    
    # 컬럼 정의 (A열~M열)
    # 0: 플랫폼 반영구분 (COMMAND)
    # 1: 초기치 (INIT)
    # 2: 측정일자 (DATE)
    # 3: 경과일수
    # 4: 기간일수
    # 5: Unnamed (비어있음)
    # 6: 관상단(E.L) (A)
    # 7: 측정치(E.L) (B)
    # 8: 측정치(G.L) (V)
    # 9: 전회변화량
    # 10: 누적변화량
    # 11: 일간변위
    # 12: 굴착고 (X)
    
    data_list = []
    
    for idx, row in df_raw.iterrows():
        # 측정일자가 null이면 데이터가 끝난 것으로 판단
        date_val = row.iloc[2]
        if pd.isna(date_val):
            continue
            
        # 날짜 포맷 변환
        if isinstance(date_val, datetime):
            date_str = date_val.strftime("%Y-%m-%d")
        else:
            try:
                date_str = pd.to_datetime(date_val).strftime("%Y-%m-%d")
            except:
                continue
        
        # 굴착고와 누적변화량 등 주요 값 추출 (float 처리 및 안전장치)
        try:
            # 굴착고 (X): 엑셀에 음수(예: -3)로 표기되어 있다면 차트상 깊이 표현을 위해 절댓값으로 양수 변환
            raw_depth = row.iloc[12]
            excavation_depth = abs(float(raw_depth)) if not pd.isna(raw_depth) else 0.0
            
            # 누적변화량: 초기치 대비 하강량이므로 차트에 양수 트렌드로 표현하기 위해 절댓값 처리
            raw_delta = row.iloc[10]
            actual_delta = abs(float(raw_delta)) if not pd.isna(raw_delta) else 0.0
            
            # 측정치(E.L) - 실제 지하수위
            raw_wl = row.iloc[7]
            actual_wl = float(raw_wl) if not pd.isna(raw_wl) else 0.0
            
            # 일간 변위 (m/day)
            raw_rate = row.iloc[11]
            actual_rate = abs(float(raw_rate)) if not pd.isna(raw_rate) else 0.0
        except Exception as e:
            continue
            
        data_list.append({
            "date": date_str,
            "isForecast": False,
            "excavationDepth": round(excavation_depth, 3),
            "actualDelta": round(actual_delta, 3),
            "actualWaterLevel": round(actual_wl, 3),
            "actualRate": round(actual_rate, 3),
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
        
    # 마지막 데이터 기준정보
    last_item = data_list[-1]
    last_date = datetime.strptime(last_item["date"], "%Y-%m-%d")
    last_delta = last_item["actualDelta"]
    last_depth = last_item["excavationDepth"]
    last_wl = last_item["actualWaterLevel"]
    
    # 수위계의 기준표고
    datum = gauge_metadata[gauge_id]["datum"]
    
    forecast_data = []
    
    # 모델별 변동 패턴 설정 (시뮬레이션 가중치)
    # ARIMA: 과거 선형적 추세 연장 (기울기 계산)
    if len(data_list) > 5:
        recent_deltas = [item["actualDelta"] for item in data_list[-5:]]
        slope = (recent_deltas[-1] - recent_deltas[0]) / 5.0
        if slope < 0: slope = 0.05 # 하강 추세 기본값 보장
    else:
        slope = 0.1
        
    for i in range(1, 6):
        forecast_date = (last_date + timedelta(days=i)).strftime("%Y-%m-%d")
        
        # 굴착 깊이가 일 평균 0.6m씩 증가하는 시나리오
        forecast_depth = last_depth + (i * 0.6)
        
        # 1. ARIMA 예측 (안정적, 과거 추세 선형 반영 + 약간의 감쇄)
        arima_delta = last_delta + (i * slope * 0.9)
        
        # 2. LSTM 예측 (비선형 굴착고 영향 반영, 후반부 하강 가속)
        # 굴착 깊이가 깊어질수록 수위 저하(변위량 증가)폭을 더 키움
        lstm_factor = 1.0 + (forecast_depth * 0.015)
        lstm_delta = last_delta + (i * slope * lstm_factor)
        
        # 3. Transformer 예측 (돌발 드롭 시나리오 모사)
        # 3~4일차에 굴착고가 급격해지는 영향으로 지하수위가 크게 떨어지는 돌발 하강 패턴 연출
        if i >= 3:
            tf_delta = last_delta + (i * slope * 1.3) + 0.4
        else:
            tf_delta = last_delta + (i * slope * 1.1)
            
        # 임계 경보 테스트 시뮬레이션을 위해 일부 수위계는 임계치를 돌파하도록 설정
        # 3차 위험선이 8.76m 이므로 특정 ID(예: W-P-001, W-P-010)는 예측 기간 중 경보를 울리도록 유도
        if gauge_id in ["W-P-001", "W-P-010"]:
            arima_delta += i * 0.3
            lstm_delta += i * 0.5
            transformer_delta = tf_delta + (i * 0.7)
        else:
            transformer_delta = tf_delta

        # 일간변위(RATE_1D) 예측치 계산 (이전 예측치 대비 차이)
        prev_arima_delta = forecast_data[-1]["arimaDelta"] if i > 1 else last_delta
        prev_lstm_delta = forecast_data[-1]["lstmDelta"] if i > 1 else last_delta
        prev_tf_delta = forecast_data[-1]["transformerDelta"] if i > 1 else last_delta
        
        arima_rate = abs(arima_delta - prev_arima_delta)
        lstm_rate = abs(lstm_delta - prev_lstm_delta)
        tf_rate = abs(transformer_delta - prev_tf_delta)
        
        # 실제 지하수위(EL) 예측 계산 (기준표고 - 누적변위량)
        arima_wl = datum - arima_delta
        lstm_wl = datum - lstm_delta
        tf_wl = datum - transformer_delta
        
        forecast_data.append({
            "date": forecast_date,
            "isForecast": True,
            "excavationDepth": round(forecast_depth, 3),
            "actualDelta": None,
            "actualWaterLevel": None,
            "actualRate": None,
            "arimaDelta": round(arima_delta, 3),
            "lstmDelta": round(lstm_delta, 3),
            "transformerDelta": round(transformer_delta, 3),
            "arimaRate": round(arima_rate, 3),
            "lstmRate": round(lstm_rate, 3),
            "transformerRate": round(tf_rate, 3)
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
    
    # 각 수위계 시트 파싱 및 병합
    for sheet in xl.sheet_names:
        if sheet in gauge_metadata:
            print(f"Parsing sheet: {sheet}")
            actual_data = parse_gauge_sheet(xl, sheet)
            forecast_data = generate_forecast(actual_data, sheet)
            
            output_data["instruments"][sheet] = {
                "code": sheet,
                "location": gauge_metadata[sheet]["location"],
                "datumLevel": gauge_metadata[sheet]["datum"],
                "thresholds": thresholds,
                "data": actual_data + forecast_data
            }
            print(f"  -> Successfully processed {len(actual_data)} actual rows and {len(forecast_data)} forecast rows.")
            
    # JavaScript 파일로 쓰기 (React에서 import 하기 편하도록 export default 구성)
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
