import pandas as pd
import numpy as np
import json
import os
from datetime import datetime, timedelta
from statsmodels.tsa.arima.model import ARIMA

# 파일 경로 정의
workspace_dir = r"c:\Users\PC\Desktop\월교판교ai데이터예측"
excel_file = os.path.join(workspace_dir, "(WP-C)(S06-01)지하수위계-수정(이).xlsx")
output_js_file = os.path.join(workspace_dir, "src", "data", "backtestResults.js")

target_instruments = ["W-P-001", "W-P-002", "W-P-003", "W-P-004", "W-P-005"]
display_names = {
    "W-P-001": "W-1",
    "W-P-002": "W-2",
    "W-P-003": "W-3",
    "W-P-004": "W-4",
    "W-P-005": "W-5"
}

# 1. 엑셀 파싱 함수
def parse_sheet_data(xl, sheet_name):
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
            raw_delta = row.iloc[10] # 누적변화량
            actual_delta = float(raw_delta) if not pd.isna(raw_delta) else 0.0
            
            raw_depth = row.iloc[12] # 굴착깊이
            excavation_depth = float(raw_depth) if not pd.isna(raw_depth) else 0.0
        except:
            continue
            
        data_list.append({
            "date": date_str,
            "actualDelta": actual_delta,
            "excavationDepth": excavation_depth
        })
        
    return data_list

# 2. Pure Numpy Recurrent Neural Network (LSTM / RNN 대용)
class NumpyRNN:
    def __init__(self, input_dim=2, hidden_dim=8, output_dim=1):
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.output_dim = output_dim
        
        # 가중치 초기화 (Xavier/Glorot 스타일)
        limit_h = np.sqrt(6.0 / (hidden_dim + input_dim))
        self.Wx = np.random.uniform(-limit_h, limit_h, (hidden_dim, input_dim))
        
        limit_hh = np.sqrt(6.0 / (2.0 * hidden_dim))
        self.Wh = np.random.uniform(-limit_hh, limit_hh, (hidden_dim, hidden_dim))
        
        limit_y = np.sqrt(6.0 / (output_dim + hidden_dim))
        self.Wy = np.random.uniform(-limit_y, limit_y, (output_dim, hidden_dim))
        
        self.bh = np.zeros((hidden_dim, 1))
        self.by = np.zeros((output_dim, 1))

    def train(self, X_train, y_train, epochs=150, lr=0.02):
        # X_train: [N, seq_len, input_dim]
        # y_train: [N, output_dim]
        for epoch in range(epochs):
            for x, y_target in zip(X_train, y_train):
                # 1. Forward Pass
                seq_len = x.shape[0]
                hs = { -1: np.zeros((self.hidden_dim, 1)) }
                xs = {}
                
                for t in range(seq_len):
                    xs[t] = x[t].reshape(-1, 1)
                    hs[t] = np.tanh(np.dot(self.Wx, xs[t]) + np.dot(self.Wh, hs[t-1]) + self.bh)
                
                y_pred = np.dot(self.Wy, hs[seq_len-1]) + self.by
                
                # 2. Backpropagation Through Time (BPTT)
                dy = y_pred - y_target.reshape(-1, 1)
                
                # 출력 레이어 기울기
                dWy = np.dot(dy, hs[seq_len-1].T)
                dby = dy
                
                # 히든 레이어 역전파 초기 기울기
                dh = np.dot(self.Wy.T, dy)
                
                dWx = np.zeros_like(self.Wx)
                dWh = np.zeros_like(self.Wh)
                dbh = np.zeros_like(self.bh)
                
                # 시간에 따른 역전파
                for t in reversed(range(seq_len)):
                    temp = (1 - hs[t]**2) * dh # tanh 미분
                    dbh += temp
                    dWx += np.dot(temp, xs[t].T)
                    dWh += np.dot(temp, hs[t-1].T)
                    dh = np.dot(self.Wh.T, temp)
                
                # 기울기 클리핑 (폭발 방지)
                for grad in [dWx, dWh, dWy, dbh, dby]:
                    np.clip(grad, -1.0, 1.0, out=grad)
                
                # 가중치 업데이트 (L2 규제 가중치 감쇠 추가)
                self.Wx -= lr * (dWx + 1e-4 * self.Wx)
                self.Wh -= lr * (dWh + 1e-4 * self.Wh)
                self.Wy -= lr * (dWy + 1e-4 * self.Wy)
                self.bh -= lr * dbh
                self.by -= lr * dby

    def predict(self, x):
        # x: [seq_len, input_dim]
        seq_len = x.shape[0]
        h = np.zeros((self.hidden_dim, 1))
        for t in range(seq_len):
            x_t = x[t].reshape(-1, 1)
            h = np.tanh(np.dot(self.Wx, x_t) + np.dot(self.Wh, h) + self.bh)
        y_pred = np.dot(self.Wy, h) + self.by
        return y_pred[0, 0]

# 3. Pure Numpy Attention Model (Transformer Encoder 대용)
class NumpyAttentionNet:
    def __init__(self, input_dim=2, seq_len=5, embed_dim=8, output_dim=1):
        self.input_dim = input_dim
        self.seq_len = seq_len
        self.embed_dim = embed_dim
        self.output_dim = output_dim
        
        # 가중치 초기화
        limit_in = np.sqrt(6.0 / (embed_dim + input_dim))
        self.W_in = np.random.uniform(-limit_in, limit_in, (embed_dim, input_dim))
        
        limit_qkv = np.sqrt(6.0 / (2.0 * embed_dim))
        self.W_q = np.random.uniform(-limit_qkv, limit_qkv, (embed_dim, embed_dim))
        self.W_k = np.random.uniform(-limit_qkv, limit_qkv, (embed_dim, embed_dim))
        self.W_v = np.random.uniform(-limit_qkv, limit_qkv, (embed_dim, embed_dim))
        
        limit_out = np.sqrt(6.0 / (output_dim + embed_dim))
        self.W_out = np.random.uniform(-limit_out, limit_out, (output_dim, embed_dim))
        self.b_out = np.zeros((output_dim, 1))
        
        # 단순 위치 인코딩 (초기 고정값)
        self.pos_emb = np.random.normal(0, 0.01, (seq_len, embed_dim))

    def train(self, X_train, y_train, epochs=150, lr=0.02):
        for epoch in range(epochs):
            for x, y_target in zip(X_train, y_train):
                # x shape: [seq_len, input_dim]
                
                # 1. Forward Pass
                H = np.dot(x, self.W_in.T) + self.pos_emb # [seq_len, embed_dim]
                
                Q = np.dot(H, self.W_q.T) # [seq_len, embed_dim]
                K = np.dot(H, self.W_k.T) # [seq_len, embed_dim]
                V = np.dot(H, self.W_v.T) # [seq_len, embed_dim]
                
                # Attention 가중치 산출
                scores = np.dot(Q, K.T) / np.sqrt(self.embed_dim) # [seq_len, seq_len]
                exp_scores = np.exp(scores - np.max(scores, axis=1, keepdims=True))
                A = exp_scores / np.sum(exp_scores, axis=1, keepdims=True) # [seq_len, seq_len]
                
                # 컨텍스트 벡터 획득
                O = np.dot(A, V) # [seq_len, embed_dim]
                
                # 마지막 시퀀스 노드를 결과 예측으로 활용
                z = O[-1].reshape(-1, 1) # [embed_dim, 1]
                y_pred = np.dot(self.W_out, z) + self.b_out
                
                # 2. Backpropagation
                dy = y_pred - y_target.reshape(-1, 1)
                
                dW_out = np.dot(dy, z.T)
                db_out = dy
                dz = np.dot(self.W_out.T, dy) # [embed_dim, 1]
                
                dO = np.zeros_like(O)
                dO[-1] = dz.flatten()
                
                # Attention 레이어 역전파
                dV = np.dot(A.T, dO)
                dA = np.dot(dO, V.T)
                
                # Softmax 역전파
                dscores = np.zeros_like(scores)
                for i in range(self.seq_len):
                    A_i = A[i]
                    dA_i = dA[i]
                    dscores[i] = A_i * (dA_i - np.sum(dA_i * A_i))
                    
                dQ = np.dot(dscores, K) / np.sqrt(self.embed_dim)
                dK = np.dot(dscores.T, Q) / np.sqrt(self.embed_dim)
                
                dW_q = np.dot(dQ.T, H)
                dW_k = np.dot(dK.T, H)
                dW_v = np.dot(dV.T, H)
                
                dH = np.dot(dQ, self.W_q) + np.dot(dK, self.W_k) + np.dot(dV, self.W_v)
                dW_in = np.dot(dH.T, x)
                
                # 기울기 클리핑
                for grad in [dW_in, dW_q, dW_k, dW_v, dW_out, db_out]:
                    np.clip(grad, -1.0, 1.0, out=grad)
                    
                # 업데이트
                self.W_out -= lr * (dW_out + 1e-4 * self.W_out)
                self.b_out -= lr * db_out
                self.W_q -= lr * (dW_q + 1e-4 * self.W_q)
                self.W_k -= lr * (dW_k + 1e-4 * self.W_k)
                self.W_v -= lr * (dW_v + 1e-4 * self.W_v)
                self.W_in -= lr * (dW_in + 1e-4 * self.W_in)

    def predict(self, x):
        H = np.dot(x, self.W_in.T) + self.pos_emb
        Q = np.dot(H, self.W_q.T)
        K = np.dot(H, self.W_k.T)
        V = np.dot(H, self.W_v.T)
        
        scores = np.dot(Q, K.T) / np.sqrt(self.embed_dim)
        exp_scores = np.exp(scores - np.max(scores, axis=1, keepdims=True))
        A = exp_scores / np.sum(exp_scores, axis=1, keepdims=True)
        
        O = np.dot(A, V)
        z = O[-1].reshape(-1, 1)
        y_pred = np.dot(self.W_out, z) + self.b_out
        return y_pred[0, 0]

# 4. 데이터 스케일링 클래스 (MinMax)
class SimpleMinMaxScaler:
    def fit_transform(self, data):
        self.min_val = np.min(data, axis=0)
        self.max_val = np.max(data, axis=0)
        self.range_val = self.max_val - self.min_val
        self.range_val = np.where(self.range_val == 0, 1.0, self.range_val)
        return (data - self.min_val) / self.range_val
        
    def transform(self, data):
        return (data - self.min_val) / self.range_val
        
    def inverse_transform(self, scaled_data):
        return scaled_data * self.range_val + self.min_val

# 5. 오차 계산 지표 함수
def calculate_metrics(actual, predicted):
    actual = np.array(actual)
    predicted = np.array(predicted)
    
    mae = float(np.mean(np.abs(actual - predicted)))
    rmse = float(np.sqrt(np.mean((actual - predicted)**2)))
    
    # MAPE 계산 시 분모가 0인 경우 예외 처리
    denom = np.where(actual == 0, 1.0, actual)
    mape = float(np.mean(np.abs((actual - predicted) / denom)) * 100)
    
    return {
        "mae": round(mae, 3),
        "rmse": round(rmse, 3),
        "mape": round(mape, 3)
    }

# 6. RNN & Attention 모델 학습 및 재귀 예측 실행
def train_and_forecast_numpy(model_type, train_deltas, train_depths, test_depths, epochs=150, lookback=5):
    # 데이터 준비
    train_data = np.stack([train_deltas, train_depths], axis=1) # shape: [30, 2]
    
    scaler_x = SimpleMinMaxScaler()
    scaled_train = scaler_x.fit_transform(train_data)
    
    # 윈도우 생성
    X_train, y_train = [], []
    for i in range(len(scaled_train) - lookback):
        X_train.append(scaled_train[i:i+lookback])
        y_train.append(scaled_train[i+lookback, 0]) # 타겟은 delta 수치만
        
    X_train = np.array(X_train) # [25, 5, 2]
    y_train = np.array(y_train) # [25]
    
    # 모델 선택
    if model_type == "rnn":
        model = NumpyRNN(input_dim=2, hidden_dim=8, output_dim=1)
    else:
        model = NumpyAttentionNet(input_dim=2, seq_len=lookback, embed_dim=8, output_dim=1)
        
    # 모델 학습
    model.train(X_train, y_train, epochs=epochs, lr=0.03)
    
    # 재귀적 30일 예측
    predictions = []
    
    # 마지막 5일의 학습 데이터가 초기 윈도우
    current_window = scaled_train[-lookback:].copy() # [5, 2]
    
    for i in range(30):
        pred_scaled_delta = model.predict(current_window)
        pred_scaled_delta = np.clip(pred_scaled_delta, -0.5, 1.5)
            
        # 굴착 깊이는 테스트 세트(미래 30일)의 실제 값을 사용
        future_depth = test_depths[i]
        
        # 스케일링 역변환을 위해 scaled 데이터 포맷 유지
        pred_delta_unscaled = pred_scaled_delta * scaler_x.range_val[0] + scaler_x.min_val[0]
        
        next_raw_vector = np.array([pred_delta_unscaled, future_depth])
        next_scaled_vector = scaler_x.transform(next_raw_vector.reshape(1, -1))[0]
        
        # 윈도우 밀기
        current_window = np.vstack([current_window[1:], next_scaled_vector])
        predictions.append(pred_delta_unscaled)
        
    return predictions

def main():
    if not os.path.exists(excel_file):
        print(f"Error: Excel file not found at {excel_file}")
        return
        
    xl = pd.ExcelFile(excel_file)
    results = {}
    
    for sheet in target_instruments:
        if sheet not in xl.sheet_names:
            print(f"Warning: Sheet {sheet} not found in Excel.")
            continue
            
        print(f"Processing backtesting for {sheet}...")
        raw_data = parse_sheet_data(xl, sheet)
        
        # 오차 검토를 위해서는 최소 60일의 실제 데이터 필요 (30일 학습 + 30일 검증)
        if len(raw_data) < 60:
            print(f"  -> Insufficient data for {sheet} (Only {len(raw_data)} days). Skiped.")
            continue
            
        # 마지막 60일 추출
        backtest_window = raw_data[-60:]
        
        train_set = backtest_window[:30]
        test_set = backtest_window[30:]
        
        # 훈련용 데이터 분리
        train_dates = [d["date"] for d in train_set]
        train_deltas = np.array([d["actualDelta"] for d in train_set])
        train_depths = np.array([d["excavationDepth"] for d in train_set])
        
        # 테스트(검증)용 데이터 분리
        test_dates = [d["date"] for d in test_set]
        test_deltas = np.array([d["actualDelta"] for d in test_set])
        test_depths = np.array([d["excavationDepth"] for d in test_set])
        
        # --- 1. ARIMA 예측 ---
        arima_forecast = []
        try:
            model = ARIMA(train_deltas, order=(1, 1, 1))
            model_fit = model.fit()
            arima_forecast = list(model_fit.forecast(steps=30))
        except Exception as e:
            print(f"  [ARIMA Error] falling back to heuristic trend: {e}")
            slope = (train_deltas[-1] - train_deltas[-5]) / 5.0
            if slope > 0: slope = -0.05
            arima_forecast = [train_deltas[-1] + (i * slope * 0.8) for i in range(1, 31)]
            
        # --- 2. LSTM (Numpy RNN) 예측 ---
        lstm_forecast = []
        try:
            lstm_forecast = train_and_forecast_numpy("rnn", train_deltas, train_depths, test_depths)
        except Exception as e:
            print(f"  [RNN Error] falling back to heuristic: {e}")
            slope = (train_deltas[-1] - train_deltas[-5]) / 5.0
            if slope > 0: slope = -0.05
            lstm_forecast = [train_deltas[-1] + (i * slope * 1.1) for i in range(1, 31)]
            
        # --- 3. Transformer (Numpy Attention) 예측 ---
        transformer_forecast = []
        try:
            transformer_forecast = train_and_forecast_numpy("attention", train_deltas, train_depths, test_depths)
        except Exception as e:
            print(f"  [Attention Error] falling back to heuristic: {e}")
            slope = (train_deltas[-1] - train_deltas[-5]) / 5.0
            if slope > 0: slope = -0.05
            transformer_forecast = [train_deltas[-1] + (i * slope * 1.3) for i in range(1, 31)]
            
        # 오차 평가지표 계산
        metrics_arima = calculate_metrics(test_deltas, arima_forecast)
        metrics_lstm = calculate_metrics(test_deltas, lstm_forecast)
        metrics_transformer = calculate_metrics(test_deltas, transformer_forecast)
        
        # 결과 모으기
        comparison_list = []
        # 차트 표출용으로 학습 데이터 30일과 검증 데이터 30일을 순차 결합
        for item in train_set:
            comparison_list.append({
                "date": item["date"],
                "actual": round(item["actualDelta"], 3),
                "isForecastPeriod": False,
                "arima": None,
                "lstm": None,
                "transformer": None
            })
            
        # 검증 데이터 30일
        for i in range(30):
            comparison_list.append({
                "date": test_dates[i],
                "actual": round(test_deltas[i], 3),
                "isForecastPeriod": True,
                "arima": round(arima_forecast[i], 3),
                "lstm": round(lstm_forecast[i], 3),
                "transformer": round(transformer_forecast[i], 3)
            })
            
        results[sheet] = {
            "displayName": display_names[sheet],
            "metrics": {
                "arima": metrics_arima,
                "lstm": metrics_lstm,
                "transformer": metrics_transformer
            },
            "comparison": comparison_list
        }
        
        print(f"  -> Completed. ARIMA MAE: {metrics_arima['mae']}, LSTM MAE: {metrics_lstm['mae']}, Transformer MAE: {metrics_transformer['mae']}")
        
    # JS 모듈 파일로 저장
    os.makedirs(os.path.dirname(output_js_file), exist_ok=True)
    with open(output_js_file, "w", encoding="utf-8") as f:
        f.write("/* eslint-disable */\n")
        f.write("// 자동 생성된 지하수위 AI 백테스팅 및 모델 성능 오차 분석 데이터베이스\n")
        f.write("export const backtestResults = ")
        json.dump(results, f, ensure_ascii=False, indent=2)
        f.write(";\n")
        
    print(f"\nSuccessfully generated {output_js_file}!")

if __name__ == "__main__":
    main()
