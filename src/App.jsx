import React, { useState, useMemo } from 'react';
import { groundwaterData } from './data/groundwaterData';
import { 
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, Legend, ReferenceLine, Label 
} from 'recharts';
import { 
  Activity, AlertTriangle, CheckCircle, Database, HelpCircle, 
  Info, TrendingDown, ShieldAlert, Cpu, Layers, Calendar, ArrowRight, Gauge
} from 'lucide-react';

function App() {
  const { projectInfo, instruments } = groundwaterData;
  const instrumentIds = Object.keys(instruments);
  
  // W-P-001을 기본 선택으로 지정
  const [selectedId, setSelectedId] = useState(instrumentIds[0] || 'W-P-001');
  const currentInstrument = instruments[selectedId];
  const chartData = currentInstrument.data;

  // 실시간 수위 및 예측 위험도 진단
  const safetyStatus = useMemo(() => {
    // 실제 데이터의 마지막 행 추출
    const actualRows = chartData.filter(d => !d.isForecast);
    const lastActual = actualRows[actualRows.length - 1] || {};
    
    // 예측 데이터 추출
    const forecastRows = chartData.filter(d => d.isForecast);
    const lastForecast = forecastRows[forecastRows.length - 1] || {};

    const maxActualDelta = Math.max(...actualRows.map(d => d.actualDelta || 0));
    const maxForecastDelta = Math.max(
      ...forecastRows.map(d => Math.max(d.arimaDelta || 0, d.lstmDelta || 0, d.transformerDelta || 0))
    );
    
    const peakDelta = Math.max(maxActualDelta, maxForecastDelta);
    
    // 임계값 매핑 (5.84m, 7.30m, 8.76m)
    const lv1 = currentInstrument.thresholds.deltaInit.level1;
    const lv2 = currentInstrument.thresholds.deltaInit.level2;
    const lv3 = currentInstrument.thresholds.deltaInit.level3;
    
    let level = '안전';
    let colorClass = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    let bgIcon = <CheckCircle className="w-8 h-8 text-emerald-400 animate-pulse" />;
    let desc = '모든 지하수위 변동 및 예측치가 관리 기준치 이내로 안전하게 유지되고 있습니다.';
    
    if (peakDelta >= lv3) {
      level = '경계 (위험)';
      colorClass = 'text-rose-400 bg-rose-500/10 border-rose-500/20';
      bgIcon = <ShieldAlert className="w-8 h-8 text-rose-400 animate-bounce" />;
      desc = `[경고] 미래 5일 이내에 AI 예측 수위 변위량이 3차 관리 기준치(${lv3}m)를 초과하여, 지반 변형 및 붕괴 위험성이 고조됩니다. 즉각 차수 보강 대책을 강구하십시오.`;
    } else if (peakDelta >= lv2) {
      level = '주의';
      colorClass = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      bgIcon = <AlertTriangle className="w-8 h-8 text-amber-400" />;
      desc = `[알림] 누적 수위 변위량이 2차 관리 기준치(${lv2}m) 이상으로 상승 중입니다. 현장 모니터링 주기를 단축하고 유출수 점검을 수행하십시오.`;
    } else if (peakDelta >= lv1) {
      level = '관심';
      colorClass = 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20';
      bgIcon = <Info className="w-8 h-8 text-yellow-300" />;
      desc = `[정보] 1차 관리 기준치(${lv1}m)를 미세하게 초과했거나 근접했습니다. 추가 변동 추이를 관찰하십시오.`;
    }
    
    return {
      level,
      colorClass,
      bgIcon,
      desc,
      lastActualDelta: lastActual.actualDelta || 0,
      lastDepth: lastActual.excavationDepth || 0,
      lastWL: lastActual.actualWaterLevel || 0,
      lastDate: lastActual.date || '',
      forecastStartIdx: actualRows.length,
      forecastStartDate: forecastRows[0]?.date || ''
    };
  }, [chartData, currentInstrument]);

  // 차트 툴팁 커스터마이징
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="p-4 rounded-xl border border-white/10 glass-panel text-xs space-y-2">
          <p className="font-bold text-gray-300 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            {data.date} {data.isForecast && <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">AI 예측</span>}
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-gray-400">굴착 깊이 (G.L):</span>
            <span className="font-semibold text-sky-400 text-right">{data.excavationDepth} m</span>
            
            {!data.isForecast ? (
              <>
                <span className="text-gray-400">실제 누적 변위량:</span>
                <span className="font-semibold text-emerald-400 text-right">{data.actualDelta} m</span>
                <span className="text-gray-400">실제 지하수위 (E.L):</span>
                <span className="font-semibold text-teal-400 text-right">{data.actualWaterLevel} m</span>
              </>
            ) : (
              <>
                <span className="text-gray-400">ARIMA 예측 변위:</span>
                <span className="font-semibold text-orange-400 text-right">{data.arimaDelta} m</span>
                <span className="text-gray-400">LSTM 예측 변위:</span>
                <span className="font-semibold text-purple-400 text-right">{data.lstmDelta} m</span>
                <span className="text-gray-400">Transformer 예측:</span>
                <span className="font-semibold text-pink-400 text-right">{data.transformerDelta} m</span>
              </>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-gray-100 flex flex-col">
      {/* 1. 상단 관제실 정보 헤더 */}
      <header className="border-b border-white/5 bg-[#0f1424] px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-600/10 border border-indigo-500/20">
              <Gauge className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                AI 모니터링 시스템
              </span>
              <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2 mt-0.5">
                {projectInfo.projectName}
                <span className="text-xs font-normal text-gray-400">관리지점: {projectInfo.siteCode}</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs bg-black/20 px-4 py-2.5 rounded-xl border border-white/5">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-gray-400">실시간 관제 서버 정상 구동 중</span>
          </div>
        </div>
      </header>

      {/* 2. 대시보드 콘텐츠 영역 */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        
        {/* 상단 탭 셀렉터 */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-white/5">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2 shrink-0">지하수위계 목록 :</span>
          {instrumentIds.map((id) => (
            <button
              key={id}
              onClick={() => setSelectedId(id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border shrink-0 ${
                selectedId === id
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/20'
                  : 'bg-[#12182b] text-gray-400 border-white/5 hover:bg-[#1a223d] hover:text-white'
              }`}
            >
              {id}
            </button>
          ))}
        </div>

        {/* 3. 요약 지표 카드 및 위험 분석 */}
        <section className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* 주요 지표 1: 누적 변위량 */}
          <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <p className="text-xs font-semibold text-gray-400">최종 누적 변위량</p>
              <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs">
                <TrendingDown className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-4">
              <h3 className="text-3xl font-black text-white">{safetyStatus.lastActualDelta} <span className="text-sm font-medium text-gray-400">m</span></h3>
              <p className="text-[10px] text-gray-500 mt-1 flex items-center gap-1">
                최종 계측일: {safetyStatus.lastDate}
              </p>
            </div>
          </div>

          {/* 주요 지표 2: 현재 지하수위(EL) */}
          <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <p className="text-xs font-semibold text-gray-400">최종 지하수위 (E.L)</p>
              <span className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400 text-xs">
                <Database className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-4">
              <h3 className="text-3xl font-black text-white">{safetyStatus.lastWL} <span className="text-sm font-medium text-gray-400">EL.m</span></h3>
              <p className="text-[10px] text-gray-500 mt-1">
                기준표고 (GL): {currentInstrument.datumLevel} m
              </p>
            </div>
          </div>

          {/* 주요 지표 3: 최종 굴착 깊이 */}
          <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <p className="text-xs font-semibold text-gray-400">현장 굴착 깊이 (G.L)</p>
              <span className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 text-xs">
                <Layers className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-4">
              <h3 className="text-3xl font-black text-white">{safetyStatus.lastDepth} <span className="text-sm font-medium text-gray-400">m</span></h3>
              <p className="text-[10px] text-gray-500 mt-1">
                설치위치: {currentInstrument.location}
              </p>
            </div>
          </div>

          {/* 주요 지표 4: 안전 관리 경보 알림 카드 */}
          <div className={`border p-5 rounded-2xl flex items-start gap-4 col-span-1 lg:col-span-1 ${safetyStatus.colorClass}`}>
            <div className="shrink-0 mt-1">{safetyStatus.bgIcon}</div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">안전 등급 진단</span>
              <h4 className="text-lg font-black mt-0.5">{safetyStatus.level}</h4>
              <p className="text-[10px] leading-relaxed mt-1 opacity-80">{safetyStatus.level === '안전' ? safetyStatus.desc : '예측 구간 임계초과 주의가 요구됩니다.'}</p>
            </div>
          </div>
        </section>

        {/* 4. 실시간 위험 침범 가이드 문구 배너 */}
        {safetyStatus.level !== '안전' && (
          <div className={`p-4 rounded-xl border flex items-center gap-3 text-xs leading-relaxed ${safetyStatus.colorClass}`}>
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p className="font-semibold">{safetyStatus.desc}</p>
          </div>
        )}

        {/* 5. 메인 모니터링 시계열 차트 영역 */}
        <section className="glass-panel p-5 rounded-3xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-400" />
                지하수위 누적 변위량 - 굴착고 통합 분석 모니터링
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                실제 수위량 변동 및 미래 5일 동안의 ARIMA / LSTM / Transformer 예측 수치 통합 그래프
              </p>
            </div>
            
            {/* 차트 가이드 레전드 */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-400 inline-block"></span>실제 변위량</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 border-t border-dashed border-orange-400 inline-block"></span>ARIMA 예측</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 border-t-2 border-double border-purple-400 inline-block"></span>LSTM 예측</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-pink-500 inline-block"></span>Transformer 예측</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-sky-500/20 border border-sky-400/30 inline-block"></span>굴착 깊이</span>
            </div>
          </div>

          <div className="w-full h-[400px] mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis 
                  dataKey="date" 
                  stroke="rgba(255,255,255,0.3)" 
                  fontSize={10} 
                  tickLine={false} 
                />
                
                {/* Y축 1 (좌측): 누적 변위량 */}
                <YAxis 
                  yAxisId="left" 
                  stroke="rgba(255,255,255,0.3)" 
                  fontSize={10} 
                  tickLine={false}
                  domain={[0, 'dataMax + 2']}
                >
                  <Label 
                    value="누적 변위량 (m)" 
                    angle={-90} 
                    position="insideLeft" 
                    style={{ textAnchor: 'middle', fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} 
                  />
                </YAxis>

                {/* Y축 2 (우측): 굴착 깊이 */}
                <YAxis 
                  yAxisId="right" 
                  orientation="right" 
                  stroke="rgba(255,255,255,0.3)" 
                  fontSize={10} 
                  tickLine={false}
                  domain={[0, 'dataMax + 5']}
                  reversed={true} // 굴착이 깊어지는 물리적 느낌 구현
                >
                  <Label 
                    value="굴착 깊이 (G.L - m)" 
                    angle={90} 
                    position="insideRight" 
                    style={{ textAnchor: 'middle', fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} 
                  />
                </YAxis>

                <Tooltip content={<CustomTooltip />} />

                {/* 1. 굴착고 배경 막대 그래프 (우측 Y축) */}
                <Bar 
                  yAxisId="right" 
                  dataKey="excavationDepth" 
                  fill="rgba(56, 189, 248, 0.08)" 
                  stroke="rgba(56, 189, 248, 0.2)"
                  strokeWidth={1}
                  barSize={12}
                  name="굴착 깊이"
                />

                {/* 2. 관리기준 임계치 수평 기준선 표시 */}
                <ReferenceLine 
                  yAxisId="left" 
                  y={currentInstrument.thresholds.deltaInit.level1} 
                  stroke="#fbbf24" 
                  strokeDasharray="4 4" 
                  strokeWidth={1}
                >
                  <Label value="1차 기준 (5.84m)" position="insideBottomLeft" fill="#fbbf24" fontSize={9} />
                </ReferenceLine>
                <ReferenceLine 
                  yAxisId="left" 
                  y={currentInstrument.thresholds.deltaInit.level2} 
                  stroke="#f97316" 
                  strokeDasharray="4 4" 
                  strokeWidth={1.2}
                >
                  <Label value="2차 기준 (7.30m)" position="insideBottomLeft" fill="#f97316" fontSize={9} />
                </ReferenceLine>
                <ReferenceLine 
                  yAxisId="left" 
                  y={currentInstrument.thresholds.deltaInit.level3} 
                  stroke="#ef4444" 
                  strokeDasharray="4 4" 
                  strokeWidth={1.5}
                >
                  <Label value="3차 기준 (8.76m)" position="insideBottomLeft" fill="#ef4444" fontSize={9} />
                </ReferenceLine>

                {/* 3. AI 예측 시작 지점 수직선 가이드 */}
                {safetyStatus.forecastStartDate && (
                  <ReferenceLine 
                    yAxisId="left" 
                    x={safetyStatus.forecastStartDate} 
                    stroke="rgba(99, 102, 241, 0.6)" 
                    strokeWidth={2} 
                    strokeDasharray="3 3"
                  >
                    <Label 
                      value="AI 예측 구간" 
                      position="top" 
                      fill="rgba(129, 140, 248, 1)" 
                      fontSize={10} 
                      fontWeight="bold"
                    />
                  </ReferenceLine>
                )}

                {/* 4. 실제 지하수위 누적변위량 (실선) */}
                <Line 
                  yAxisId="left" 
                  type="monotone" 
                  dataKey="actualDelta" 
                  stroke="#34d399" 
                  strokeWidth={3} 
                  dot={{ r: 2 }}
                  activeDot={{ r: 6 }}
                  name="실제 변위량"
                  connectNulls
                />

                {/* 5. ARIMA 예측 수평/점선 */}
                <Line 
                  yAxisId="left" 
                  type="monotone" 
                  dataKey="arimaDelta" 
                  stroke="#fb923c" 
                  strokeWidth={2} 
                  strokeDasharray="4 4"
                  dot={{ r: 3 }}
                  name="ARIMA 예측"
                  connectNulls
                />

                {/* 6. LSTM 예측 이중선 형태 모사 */}
                <Line 
                  yAxisId="left" 
                  type="monotone" 
                  dataKey="lstmDelta" 
                  stroke="#c084fc" 
                  strokeWidth={2}
                  strokeDasharray="7 2"
                  dot={{ r: 3 }}
                  name="LSTM 예측"
                  connectNulls
                />

                {/* 7. Transformer 예측 굵은 실선 */}
                <Line 
                  yAxisId="left" 
                  type="monotone" 
                  dataKey="transformerDelta" 
                  stroke="#f472b6" 
                  strokeWidth={3} 
                  dot={{ r: 4 }}
                  name="Transformer 예측"
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* 6. AI 시점 분석 & 모델별 속성 비교 패널 */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* ARIMA 모델 카드 */}
          <div className="glass-panel p-5 rounded-2xl border-l-4 border-orange-500/50 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-orange-400" />
                ARIMA (통계 모델)
              </h4>
              <span className="text-[10px] text-orange-400 px-2 py-0.5 bg-orange-500/10 rounded">선형적 단기추세</span>
            </div>
            <p className="text-[11px] leading-relaxed text-gray-400">
              이전 계측 데이터의 변동 속도 및 자기회귀(AR)적 변위 분석을 반영합니다. 돌발적인 공사 환경 변화보다는 기존의 평시 지하수위 감쇠 트렌드를 점진적으로 외삽(Extrapolate)하여 도출해 냅니다.
            </p>
          </div>

          {/* LSTM 모델 카드 */}
          <div className="glass-panel p-5 rounded-2xl border-l-4 border-purple-500/50 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-purple-400" />
                LSTM (순환 딥러닝)
              </h4>
              <span className="text-[10px] text-purple-400 px-2 py-0.5 bg-purple-500/10 rounded">다변량 시퀀스 학습</span>
            </div>
            <p className="text-[11px] leading-relaxed text-gray-400">
              과거 시계열 데이터의 장기 및 단기 종속성을 보존하면서, 외생 변수인 <strong>굴착 깊이(Depth)</strong>가 증가함에 따라 지하수 유입로가 차단/개방되는 비선형적인 물리 반응을 학습하고 모사합니다.
            </p>
          </div>

          {/* Transformer 모델 카드 */}
          <div className="glass-panel p-5 rounded-2xl border-l-4 border-pink-500/50 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-pink-400" />
                Transformer (어텐션 딥러닝)
              </h4>
              <span className="text-[10px] text-pink-400 px-2 py-0.5 bg-pink-500/10 rounded">어텐션 맥락 추출</span>
            </div>
            <p className="text-[11px] leading-relaxed text-gray-400">
              Self-Attention 메커니즘을 적용하여 시계열 내에서 급격한 굴착고 변동 및 수위 강하 시점에 높은 인지적 가중치를 부여합니다. 미래 공정 스케줄 속 수위 변동 임계 돌파 가능성을 가장 정밀히 진단합니다.
            </p>
          </div>
        </section>

      </main>

      {/* 7. 하단 푸터 */}
      <footer className="border-t border-white/5 bg-[#0f1424] py-4 px-6 text-center text-[10px] text-gray-500 mt-12">
        <p>© 2026 월곶-판교 복선전철 제4공구 현장 계측 시스템. All Rights Reserved. (AI Groundwater Level Prediction Dashboard Demo)</p>
      </footer>
    </div>
  );
}

export default App;
