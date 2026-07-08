import React, { useState, useMemo } from 'react';
import { groundwaterData } from './data/groundwaterData';
import { 
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, Legend, ReferenceLine, Label 
} from 'recharts';
import { 
  Activity, AlertTriangle, CheckCircle, Database, HelpCircle, 
  Info, TrendingDown, ShieldAlert, Cpu, Calendar, 
  Gauge, CloudRain, Sliders, Download, ChevronLeft, ChevronRight,
  Eye, Check
} from 'lucide-react';

function App() {
  const { projectInfo, instruments } = groundwaterData;
  const instrumentIds = Object.keys(instruments);
  
  // 상태 관리
  const [selectedId, setSelectedId] = useState(instrumentIds[0] || 'W-P-001');
  const [filterPeriod, setFilterPeriod] = useState('3'); // '3'개월, '6'개월, 'all'전체
  const [weatherImpact, setWeatherImpact] = useState(false); // 기상 데이터 연동 여부
  const [noiseFilter, setNoiseFilter] = useState(false); // 노이즈 필터링 여부
  
  // [신설 차트 제어 설정]
  const [showThresholds, setShowThresholds] = useState(true); // 1/2/3차 기준선 표시 여부
  const [showExcavation, setShowExcavation] = useState(true); // 굴착 깊이선 표시 여부
  const [aiFocusMode, setAiFocusMode] = useState(false); // AI 돋보기 뷰 모드 여부
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  const currentInstrument = instruments[selectedId];
  const rawData = currentInstrument.data;

  // 1. 강수량 및 이동평균(노이즈 필터) 연산된 데이터 생성
  const processedData = useMemo(() => {
    return rawData.map((d, index, arr) => {
      // 5일 이동 평균 (누적변화량) 필터링
      let filteredDelta = d.actualDelta;
      if (noiseFilter && !d.isForecast) {
        const start = Math.max(0, index - 4);
        const window = arr.slice(start, index + 1).filter(item => !item.isForecast);
        const sum = window.reduce((acc, item) => acc + item.actualDelta, 0);
        filteredDelta = window.length > 0 ? sum / window.length : d.actualDelta;
      }

      // 기상 강수 데이터 모사 (여름철 5~7월 집중 강우)
      let precipitation = 0;
      const dateObj = new Date(d.date);
      const month = dateObj.getMonth() + 1;
      const day = dateObj.getDate();
      
      if (month === 5 && (day === 15 || day === 16)) {
        precipitation = day === 15 ? 45.5 : 30.2;
      } else if (month === 6 && (day === 25 || day === 26 || day === 27)) {
        precipitation = day === 25 ? 65.0 : (day === 26 ? 85.4 : 20.1);
      } else if (month === 7 && day === 5) {
        precipitation = 52.0;
      } else if (Math.random() > 0.92) {
        precipitation = Math.round(Math.random() * 15 * 10) / 10;
      }

      return {
        ...d,
        filteredDelta: filteredDelta !== null ? round(filteredDelta, 3) : null,
        precipitation: weatherImpact ? precipitation : 0
      };
    });
  }, [rawData, weatherImpact, noiseFilter]);

  // 2. 기간별 필터링 및 AI 예측 Focus 슬라이싱 적용
  const filteredData = useMemo(() => {
    if (aiFocusMode) {
      // AI 미래 예측 시작점 5일 구간을 부각하기 위해 최근 15일치 실측 데이터와 미래 5일 예측치만 잘라냄
      const actualRows = processedData.filter(d => !d.isForecast);
      const forecastRows = processedData.filter(d => d.isForecast);
      
      const last15Actual = actualRows.slice(-15);
      return [...last15Actual, ...forecastRows];
    }
    
    if (filterPeriod === 'all') return processedData;
    
    const monthsToSubtract = parseInt(filterPeriod);
    const lastDateStr = processedData[processedData.length - 1].date;
    const lastDate = new Date(lastDateStr);
    
    const cutoffDate = new Date(lastDate);
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsToSubtract);
    
    return processedData.filter(d => new Date(d.date) >= cutoffDate);
  }, [processedData, filterPeriod, aiFocusMode]);

  // 3. 실시간 안전 등급 진단 로직
  const safetyStatus = useMemo(() => {
    const actualRows = processedData.filter(d => !d.isForecast);
    const lastActual = actualRows[actualRows.length - 1] || {};
    
    const forecastRows = processedData.filter(d => d.isForecast);
    const lastForecast = forecastRows[forecastRows.length - 1] || {};

    const minActualDelta = Math.min(...actualRows.map(d => d.actualDelta || 0));
    const minForecastDelta = Math.min(
      ...forecastRows.map(d => Math.min(d.arimaDelta || 0, d.lstmDelta || 0, d.transformerDelta || 0))
    );
    
    const peakDelta = Math.min(minActualDelta, minForecastDelta);
    const absPeakDelta = Math.abs(peakDelta);
    
    const lv1 = currentInstrument.thresholds.deltaInit.level1;
    const lv2 = currentInstrument.thresholds.deltaInit.level2;
    const lv3 = currentInstrument.thresholds.deltaInit.level3;
    
    let level = '안전';
    let colorClass = 'text-emerald-800 bg-emerald-50 border-emerald-300';
    let alertColor = 'bg-emerald-600';
    let bgIcon = <CheckCircle className="w-8 h-8 text-emerald-600" />;
    let desc = '모든 지하수위 변동 및 예측치가 관리 기준치 이내로 매우 안정적인 추세를 유지하고 있습니다.';
    
    if (absPeakDelta >= lv3) {
      level = '경계 (3차 초과)';
      colorClass = 'text-red-800 bg-red-50 border-red-300';
      alertColor = 'bg-red-650';
      bgIcon = <ShieldAlert className="w-8 h-8 text-red-600 animate-pulse" />;
      desc = `[경고] 미래 5일 이내에 AI 예측 수위 변위량(${absPeakDelta.toFixed(2)}m)이 3차 관리 기준치(${lv3}m)를 초과할 가능성이 매우 높습니다. 즉시 차수 그라우팅 보강 및 대책 공사 검토가 요구됩니다.`;
    } else if (absPeakDelta >= lv2) {
      level = '주의 (2차 초과)';
      colorClass = 'text-orange-800 bg-orange-50 border-orange-300';
      alertColor = 'bg-orange-650';
      bgIcon = <AlertTriangle className="w-8 h-8 text-orange-600" />;
      desc = `[알림] 누적 수위 변위량이 2차 관리 기준치(${lv2}m) 이상으로 내려앉고 있습니다. 지반 변형 및 연약화 여부를 정밀 분석하고 배출 유량을 제어하십시오.`;
    } else if (absPeakDelta >= lv1) {
      level = '관심 (1차 초과)';
      colorClass = 'text-amber-800 bg-amber-50 border-amber-300';
      alertColor = 'bg-amber-650';
      bgIcon = <Info className="w-8 h-8 text-amber-600" />;
      desc = `[정보] 누적 변화량이 1차 관리 기준치(${lv1}m)를 돌파했습니다. 지하수위 강하 변동 속도가 빠르게 증가하고 있는지 집중 모니터링이 필요한 상태입니다.`;
    }
    
    return {
      level,
      colorClass,
      alertColor,
      bgIcon,
      desc,
      lastActualDelta: lastActual.actualDelta || 0,
      lastDepth: lastActual.excavationDepth || 0,
      lastWL: lastActual.actualWaterLevel || 0,
      lastGL: lastActual.actualGL || 0,
      lastRate: lastActual.actualRate || 0,
      lastDate: lastActual.date || '',
      pipeTop: lastActual.pipeTop || 0,
      forecastStartDate: forecastRows[0]?.date || ''
    };
  }, [processedData, currentInstrument]);

  // 4. 테이블 페이징 처리
  const tableData = useMemo(() => {
    return processedData.filter(d => !d.isForecast).reverse();
  }, [processedData]);

  const totalPages = Math.ceil(tableData.length / itemsPerPage);
  const paginatedTableData = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    return tableData.slice(startIdx, startIdx + itemsPerPage);
  }, [tableData, currentPage]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleDownload = () => {
    alert(`${currentInstrument.displayName} 계측 데이터의 CSV 다운로드가 완료되었습니다.\n파일명: ${projectInfo.siteCode}_${currentInstrument.displayName}_data.csv`);
  };

  function round(val, precision) {
    return Math.round(val * Math.pow(10, precision)) / Math.pow(10, precision);
  }

  // 5. 커스텀 범례 렌더러 (선 두께 및 실선/점선 유형 100% 동기화)
  const renderCustomLegend = (props) => {
    const { payload } = props;
    return (
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-bold pt-2.5 border-t border-gray-150">
        {payload.map((entry, index) => {
          if (entry.dataKey === 'actualDelta' || entry.dataKey === 'filteredDelta') {
            return (
              <span key={index} className="flex items-center gap-2 text-blue-700">
                <span className="w-5 h-1 bg-blue-600 rounded inline-block"></span>
                {noiseFilter ? "실제 누적변위 (이동평균)" : "실제 누적변위 (실측)"}
              </span>
            );
          }
          if (entry.dataKey === 'arimaDelta') {
            return (
              <span key={index} className="flex items-center gap-2 text-orange-600">
                <span className="flex items-center font-mono font-bold tracking-tighter text-orange-500">----</span>
                ARIMA 예측 (5일)
              </span>
            );
          }
          if (entry.dataKey === 'lstmDelta') {
            return (
              <span key={index} className="flex items-center gap-2 text-purple-600">
                <span className="flex items-center font-mono font-bold tracking-widest text-purple-500">- - -</span>
                LSTM 예측 (5일)
              </span>
            );
          }
          if (entry.dataKey === 'transformerDelta') {
            return (
              <span key={index} className="flex items-center gap-2 text-pink-600">
                <span className="w-5 h-1.5 bg-pink-500 rounded inline-block"></span>
                Transformer 예측 (5일)
              </span>
            );
          }
          if (entry.dataKey === 'excavationDepth' && showExcavation) {
            return (
              <span key={index} className="flex items-center gap-2 text-sky-700">
                <span className="flex items-center font-mono text-[10px] font-bold text-sky-500 tracking-tighter">- - - -</span>
                현장 굴착 깊이 (G.L)
              </span>
            );
          }
          return null;
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col font-sans antialiased">
      
      {/* 1. 상단 관제실 밝은 테마 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 shadow-inner">
              <Gauge className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold text-blue-700 uppercase tracking-widest bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200">
                  지하수위 AI 예측 및 계측관제
                </span>
                <span className="text-[10px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                  실시간 시연 관제 콘솔
                </span>
              </div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2 mt-1.5">
                {projectInfo.projectName}
                <span className="text-sm font-semibold text-gray-600 bg-gray-100 px-2.5 py-0.5 rounded-lg border border-gray-200">관리지점: {projectInfo.siteCode}</span>
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* 고도화 토글 제어 영역 */}
            <div className="flex items-center gap-2.5 text-xs bg-gray-100 p-1.5 rounded-xl border border-gray-300 shadow-inner">
              <button 
                onClick={() => setWeatherImpact(!weatherImpact)}
                className={`px-4 py-2 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                  weatherImpact 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'text-gray-700 hover:text-gray-950 bg-white hover:bg-gray-50 border border-gray-200'
                }`}
                title="기상청 강수 데이터를 연동하여 지하수위 상승 복구 효과 시뮬레이션"
              >
                <CloudRain className="w-4 h-4" />
                기상 데이터 연동 {weatherImpact ? 'ON' : 'OFF'}
              </button>
              <button 
                onClick={() => setNoiseFilter(!noiseFilter)}
                className={`px-4 py-2 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                  noiseFilter 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'text-gray-700 hover:text-gray-950 bg-white hover:bg-gray-50 border border-gray-200'
                }`}
                title="5일 이동평균 기법을 활용해 계측 센서 노이즈를 스무딩 처리합니다."
              >
                <Sliders className="w-4 h-4" />
                노이즈 필터 {noiseFilter ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 2. 대시보드 콘텐츠 영역 */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        
        {/* 상단 탭 셀렉터 - W-1 ~ W-10 */}
        <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-extrabold text-gray-700 uppercase tracking-wider px-3 shrink-0">계측기 관측공 전환:</span>
          {instrumentIds.map((id) => (
            <button
              key={id}
              onClick={() => {
                setSelectedId(id);
                setCurrentPage(1);
              }}
              className={`px-5 py-3 rounded-xl text-xs font-black transition-all border shrink-0 ${
                selectedId === id
                  ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/25'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100 hover:text-gray-955'
              }`}
            >
              {instruments[id].displayName} (계측기)
            </button>
          ))}
        </div>

        {/* 3. 설치 및 계측 정보 섹션 (밝은 테마 테이블 및 수준기준점) */}
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center gap-2.5 border-b border-gray-200 pb-3">
            <span className="w-2 h-5 bg-blue-600 rounded-full"></span>
            <h2 className="text-xl font-black text-gray-950">{currentInstrument.displayName} 설치 및 계측 정보</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* 왼쪽: 기본 속성 카드 */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
              <h3 className="text-xs font-black text-slate-800 tracking-wider uppercase border-b border-slate-200 pb-1.5">기본 설비 속성</h3>
              <div className="grid grid-cols-2 gap-y-3.5 text-xs font-semibold text-gray-800">
                <span className="text-gray-600">계측기 코드</span>
                <span className="font-bold text-gray-955 text-right">{currentInstrument.displayName}</span>
                
                <span className="text-gray-600">계측기명</span>
                <span className="font-bold text-gray-955 text-right">지하수위계 (WL)</span>
                
                <span className="text-gray-600">설치일자</span>
                <span className="font-bold text-gray-955 text-right">{currentInstrument.installDate}</span>
                
                <span className="text-gray-600">초기치 측정일</span>
                <span className="font-bold text-gray-955 text-right">{currentInstrument.initialMeasureDate}</span>
                
                <span className="text-gray-600">설치위치</span>
                <span className="font-bold text-gray-955 text-right">{currentInstrument.location.split(' ')[0]}</span>
              </div>
              <div className="border-t border-slate-200 pt-3">
                <p className="text-[11px] font-bold text-slate-650 leading-relaxed">
                  ⓘ 본선환기구#15 굴착영향범위 내 상시 모니터링 수계 대상
                </p>
              </div>
            </div>

            {/* 중간: 안전관리기준 임계치 리디자인 (표 형태를 걷어내고 세련된 상태 바 및 게이지 카드로 개편) */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
              <h3 className="text-xs font-black text-slate-850 tracking-wider uppercase border-b border-slate-200 pb-1.5">안전 관리 기준 대비 현황</h3>
              
              <div className="space-y-4">
                {/* 1. 누적변화량 상태 바 */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-black text-gray-800">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-3 bg-blue-600 rounded-full inline-block"></span>
                      현재 누적변화량
                    </span>
                    <span className="text-blue-700">{Math.abs(safetyStatus.lastActualDelta).toFixed(2)} m</span>
                  </div>
                  
                  {/* Progress Bar 게이지 */}
                  <div className="w-full bg-gray-200 rounded-full h-3.5 relative overflow-hidden flex border border-gray-300">
                    {/* 관심 영역 (0 ~ 1.59m) */}
                    <div className="bg-emerald-500 h-full" style={{ width: '66.5%' }} title="안전 영역"></div>
                    {/* 주의 영역 (1.59 ~ 1.99m) */}
                    <div className="bg-amber-400 h-full border-l border-white" style={{ width: '16.7%' }} title="1차 관심 영역"></div>
                    {/* 경계 영역 (1.99 ~ 2.39m) */}
                    <div className="bg-orange-500 h-full border-l border-white" style={{ width: '16.8%' }} title="2차 주의 영역"></div>
                    
                    {/* 실제 도달 위치 포인터 핀 */}
                    <div 
                      className="absolute top-0 bottom-0 w-1.5 bg-gray-900 border border-white shadow-md animate-pulse"
                      style={{ 
                        left: `${Math.min(100, (Math.abs(safetyStatus.lastActualDelta) / 2.39) * 100)}%` 
                      }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-[9px] text-gray-600 font-extrabold">
                    <span>초기치 (0m)</span>
                    <span className="text-amber-700">1차(1.59m)</span>
                    <span className="text-orange-700">2차(1.99m)</span>
                    <span className="text-red-700">3차(2.39m)</span>
                  </div>
                </div>

                {/* 2. 일간변위 상태 바 */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-black text-gray-800">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-3 bg-indigo-600 rounded-full inline-block"></span>
                      현재 일간변위 속도
                    </span>
                    <span className="text-indigo-700">{Math.abs(safetyStatus.lastRate).toFixed(2)} m/d</span>
                  </div>
                  
                  {/* Progress Bar 게이지 */}
                  <div className="w-full bg-gray-200 rounded-full h-3.5 relative overflow-hidden flex border border-gray-300">
                    {/* 안전 영역 (0 ~ 0.50m/d) */}
                    <div className="bg-emerald-500 h-full" style={{ width: '50%' }}></div>
                    {/* 관심 영역 (0.50 ~ 0.75m/d) */}
                    <div className="bg-amber-400 h-full border-l border-white" style={{ width: '25%' }}></div>
                    {/* 주의 영역 (0.75 ~ 1.00m/d) */}
                    <div className="bg-orange-500 h-full border-l border-white" style={{ width: '25%' }}></div>
                    
                    {/* 실제 도달 위치 포인터 핀 */}
                    <div 
                      className="absolute top-0 bottom-0 w-1.5 bg-gray-900 border border-white shadow-md"
                      style={{ 
                        left: `${Math.min(100, (Math.abs(safetyStatus.lastRate) / 1.0) * 100)}%` 
                      }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-[9px] text-gray-600 font-extrabold">
                    <span>안정 (0m)</span>
                    <span className="text-amber-700">1차(0.50m/d)</span>
                    <span className="text-orange-700">2차(0.75m/d)</span>
                    <span className="text-red-700">3차(1.00m/d)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 오른쪽: BM 참고 정보 및 실시간 안전 진단 */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <h3 className="text-xs font-black text-slate-800 tracking-wider uppercase border-b border-slate-200 pb-1.5">참고 사항 및 수직 기준</h3>
                <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1.5 shadow-sm">
                  <p className="text-xs font-black text-gray-900 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-blue-600 rounded-full"></span>
                    수준기준점 (Bench Mark)
                  </p>
                  <p className="text-sm font-bold text-blue-700 pl-4">
                    {currentInstrument.bmInfo}
                  </p>
                  <p className="text-[10px] text-gray-650 pl-4 leading-relaxed font-semibold">
                    관상단 수평 계측고 결정을 위해 지정된 국가 및 현장 수준점 기준값 정보입니다.
                  </p>
                </div>
              </div>

              {/* 하단 진단 바 */}
              <div className={`p-4 rounded-xl border-2 flex items-center gap-3.5 shadow-sm ${safetyStatus.colorClass}`}>
                <div className="shrink-0">{safetyStatus.bgIcon}</div>
                <div>
                  <span className="text-[9px] font-extrabold uppercase tracking-wider opacity-75 block">안전 등급 진단 결과</span>
                  <h4 className="text-base font-black leading-tight mt-0.5">{safetyStatus.level}</h4>
                </div>
              </div>
            </div>

          </div>

          {/* 이상 경보 문구 상단 표출 */}
          {safetyStatus.level !== '안전' && (
            <div className="p-4.5 rounded-xl bg-red-50 border-2 border-red-200 flex items-center gap-3.5 text-xs leading-relaxed text-red-900 shadow-sm">
              <AlertTriangle className="w-6 h-6 shrink-0 text-red-650 animate-bounce" />
              <p className="font-bold">{safetyStatus.desc}</p>
            </div>
          )}
        </section>

        {/* 4. 시계열 변위 추이 차트 (가로 전체 폭 독점) */}
        <section className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-600 animate-pulse" />
                시계열 변위 추이 (지하수위 & 굴착고)
              </h3>
              <p className="text-xs text-gray-600 font-medium mt-0.5">
                수위 저하는 음수(-) 영역 하강선으로 표시되며, 우측 점선은 굴착 깊이(m)를 나타냅니다.
              </p>
            </div>

            {/* 신설 [차트 컨트롤 설정 패널] (3/6개월 필터 대신 돋보기 및 기능 제어 탑재) */}
            <div className="flex flex-wrap items-center gap-2.5 text-xs bg-gray-100 p-1.5 rounded-xl border border-gray-250 shadow-inner">
              <button
                onClick={() => setAiFocusMode(!aiFocusMode)}
                className={`px-3 py-2 rounded-lg font-extrabold flex items-center gap-1 transition-all ${
                  aiFocusMode 
                    ? 'bg-blue-600 text-white shadow-sm border border-blue-600' 
                    : 'bg-white text-gray-700 hover:text-gray-950 border border-gray-250'
                }`}
                title="최근 15일 계측과 미래 5일 예측만 줌인하여 확대해 봅니다."
              >
                <Eye className="w-3.5 h-3.5" />
                AI 미래 5일 돋보기 {aiFocusMode ? 'ON' : 'OFF'}
              </button>
              
              <button
                onClick={() => setShowThresholds(!showThresholds)}
                className={`px-3 py-2 rounded-lg font-extrabold flex items-center gap-1 transition-all ${
                  showThresholds 
                    ? 'bg-blue-600 text-white shadow-sm border border-blue-600' 
                    : 'bg-white text-gray-700 hover:text-gray-950 border border-gray-250'
                }`}
              >
                {showThresholds ? <Check className="w-3.5 h-3.5" /> : null}
                관리기준선 표시
              </button>

              <button
                onClick={() => setShowExcavation(!showExcavation)}
                className={`px-3 py-2 rounded-lg font-extrabold flex items-center gap-1 transition-all ${
                  showExcavation 
                    ? 'bg-blue-600 text-white shadow-sm border border-blue-600' 
                    : 'bg-white text-gray-700 hover:text-gray-950 border border-gray-250'
                }`}
              >
                {showExcavation ? <Check className="w-3.5 h-3.5" /> : null}
                굴착고선 표시
              </button>

              {!aiFocusMode && (
                <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
                  <select 
                    value={filterPeriod} 
                    onChange={(e) => setFilterPeriod(e.target.value)}
                    className="bg-transparent py-1 px-2 font-bold text-gray-700 outline-none"
                  >
                    <option value="3">최근 3개월</option>
                    <option value="6">최근 6개월</option>
                    <option value="all">전체 이력</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="w-full h-[420px] bg-slate-50/50 p-2.5 rounded-2xl border border-gray-100">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={filteredData} margin={{ top: 20, right: 15, left: 15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis 
                  dataKey="date" 
                  stroke="rgba(0,0,0,0.6)" 
                  fontSize={11} 
                  fontWeight="bold"
                  tickLine={true} 
                  minTickGap={50} // 겹침 방지 간격 확대
                />
                
                {/* 좌측 Y축: 누적변화량(m) - tickFormatter 추가하여 999999 버그 원천 해결 */}
                <YAxis 
                  yAxisId="left" 
                  stroke="rgba(0,0,0,0.6)" 
                  fontSize={11} 
                  fontWeight="bold"
                  tickLine={true}
                  domain={['dataMin - 0.2', 0.1]}
                  tickFormatter={(v) => Number(v).toFixed(1) + 'm'}
                >
                  <Label 
                    value="누적변화량" 
                    angle={-90} 
                    position="insideLeft" 
                    style={{ textAnchor: 'middle', fill: 'rgba(0,0,0,0.7)', fontSize: 11, fontWeight: 'black' }} 
                  />
                </YAxis>

                {/* 우측 Y축: 굴착고 깊이(m) - tickFormatter 추가 */}
                <YAxis 
                  yAxisId="right" 
                  orientation="right" 
                  stroke="rgba(0,0,0,0.6)" 
                  fontSize={11} 
                  fontWeight="bold"
                  tickLine={true}
                  domain={['dataMin - 3', 0.5]}
                  tickFormatter={(v) => Number(v).toFixed(1) + 'm'}
                >
                  <Label 
                    value="굴착 깊이 (G.L)" 
                    angle={90} 
                    position="insideRight" 
                    style={{ textAnchor: 'middle', fill: 'rgba(0,0,0,0.7)', fontSize: 11, fontWeight: 'black' }} 
                  />
                </YAxis>

                {/* [버그 픽스] 강수량 전용 독립 Y축 생성 (굴착고 찌부러짐 방지) */}
                <YAxis 
                  yAxisId="rain"
                  orientation="right"
                  hide={true} 
                  domain={[0, 100]}
                />

                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="p-4 bg-white border-2 border-gray-300 rounded-xl shadow-xl text-xs space-y-2 text-gray-800 font-bold">
                          <p className="font-black border-b border-gray-200 pb-1.5 flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-blue-500" />
                            {data.date} {data.isForecast && <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded border border-blue-300">AI 예측</span>}
                          </p>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                            <span className="text-gray-500 font-medium">굴착 깊이:</span>
                            <span className="text-sky-700 text-right font-black">{data.excavationDepth.toFixed(3)} m</span>
                            {!data.isForecast ? (
                              <>
                                <span className="text-gray-500 font-medium">실제 누적변위:</span>
                                <span className="text-blue-600 text-right font-black">{data.actualDelta.toFixed(3)} m</span>
                                <span className="text-gray-500 font-medium">지하수위(EL):</span>
                                <span className="text-teal-600 text-right font-black">{data.actualWaterLevel.toFixed(3)} m</span>
                              </>
                            ) : (
                              <>
                                <span className="text-orange-500 font-medium">ARIMA 변위:</span>
                                <span className="text-orange-600 text-right font-black">{data.arimaDelta.toFixed(3)} m</span>
                                <span className="text-purple-500 font-medium">LSTM 변위:</span>
                                <span className="text-purple-600 text-right font-black">{data.lstmDelta.toFixed(3)} m</span>
                                <span className="text-pink-500 font-medium">Transformer:</span>
                                <span className="text-pink-600 text-right font-black">{data.transformerDelta.toFixed(3)} m</span>
                              </>
                            )}
                            {weatherImpact && data.precipitation > 0 && (
                              <>
                                <span className="text-blue-500 font-medium">시뮬레이션 강수:</span>
                                <span className="text-blue-600 text-right font-black">{data.precipitation} mm</span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />

                {/* 1. 기상청 강수 데이터 연동 (독립 yAxisId="rain" 할당하여 굴착고선 보존) */}
                {weatherImpact && (
                  <Bar 
                    yAxisId="rain"
                    dataKey="precipitation"
                    fill="rgba(37, 99, 235, 0.08)"
                    stroke="rgba(37, 99, 235, 0.25)"
                    barSize={12}
                    name="일강수량 (mm)"
                  />
                )}

                {/* 2. 관리기준 수평 임계선 (토글 제어 연동) */}
                {showThresholds && (
                  <>
                    <ReferenceLine 
                      yAxisId="left" 
                      y={-currentInstrument.thresholds.deltaInit.level1} 
                      stroke="#d97706" 
                      strokeDasharray="4 4" 
                      strokeWidth={2}
                    >
                      <Label value="1차 관심선 (1.59m)" position="insideBottomLeft" fill="#b45309" fontSize={9} fontWeight="bold" />
                    </ReferenceLine>
                    <ReferenceLine 
                      yAxisId="left" 
                      y={-currentInstrument.thresholds.deltaInit.level2} 
                      stroke="#ea580c" 
                      strokeDasharray="5 4" 
                      strokeWidth={2.2}
                    >
                      <Label value="2차 주의선 (1.99m)" position="insideBottomLeft" fill="#c2410c" fontSize={9} fontWeight="bold" />
                    </ReferenceLine>
                    <ReferenceLine 
                      yAxisId="left" 
                      y={-currentInstrument.thresholds.deltaInit.level3} 
                      stroke="#ef4444" 
                      strokeDasharray="5 3" 
                      strokeWidth={2.5}
                    >
                      <Label value="3차 경계선 (2.39m)" position="insideBottomLeft" fill="#b91c1c" fontSize={10} fontWeight="black" />
                    </ReferenceLine>
                  </>
                )}

                {/* AI 예측 구간 수직 구분선 */}
                {safetyStatus.forecastStartDate && (
                  <ReferenceLine 
                    yAxisId="left" 
                    x={safetyStatus.forecastStartDate} 
                    stroke="#4f46e5" 
                    strokeWidth={3} 
                    strokeDasharray="4 3"
                  >
                    <Label 
                      value="▲ AI 미래 예측 시작점 (5일간)" 
                      position="top" 
                      fill="#3730a3" 
                      fontSize={11} 
                      fontWeight="black" 
                    />
                  </ReferenceLine>
                )}

                {/* 3. 굴착고 라인 그래프 (토글 제어 연동) */}
                {showExcavation && (
                  <Line 
                    yAxisId="right" 
                    type="monotone" 
                    dataKey="excavationDepth" 
                    stroke="#0284c7" 
                    strokeWidth={2.5} 
                    strokeDasharray="5 5"
                    dot={false}
                    name="굴착고"
                  />
                )}

                {/* 4. 실제 지하수위 누적변위량 */}
                <Line 
                  yAxisId="left" 
                  type="monotone" 
                  dataKey={noiseFilter ? "filteredDelta" : "actualDelta"} 
                  stroke="#2563eb" 
                  strokeWidth={4} 
                  dot={{ r: 2 }}
                  activeDot={{ r: 6 }}
                  name={noiseFilter ? "실제 누적변위 (이동평균)" : "실제 누적변위"}
                  connectNulls
                />

                {/* 5. ARIMA 예측 */}
                <Line 
                  yAxisId="left" 
                  type="monotone" 
                  dataKey="arimaDelta" 
                  stroke="#f97316" 
                  strokeWidth={3} 
                  strokeDasharray="5 4"
                  dot={{ r: 4.5, fill: "#f97316", strokeWidth: 1 }}
                  name="ARIMA 예측"
                  connectNulls
                />

                {/* 6. LSTM 예측 */}
                <Line 
                  yAxisId="left" 
                  type="monotone" 
                  dataKey="lstmDelta" 
                  stroke="#8b5cf6" 
                  strokeWidth={3} 
                  strokeDasharray="9 3"
                  dot={{ r: 4.5, fill: "#8b5cf6", strokeWidth: 1 }}
                  name="LSTM 예측"
                  connectNulls
                />

                {/* 7. Transformer 예측 */}
                <Line 
                  yAxisId="left" 
                  type="monotone" 
                  dataKey="transformerDelta" 
                  stroke="#ec4899" 
                  strokeWidth={4} 
                  dot={{ r: 5, fill: "#ec4899", strokeWidth: 1 }}
                  name="Transformer 예측"
                  connectNulls
                />

                {/* 커스텀 범례 마인딩 */}
                <Legend content={renderCustomLegend} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* 4-2. 일간변위 (m/day) 차트 (가로 전체 폭 독점) */}
        <section className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
          <div>
            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-blue-600" />
              일간변위 모니터링 (m/day)
            </h3>
            <p className="text-xs text-gray-600 font-medium mt-0.5">
              하루 단위의 수계 변동 속도를 Bar 차트로 나타내며, 시계열 가로축 날짜와 정밀 연계됩니다.
            </p>
          </div>

          <div className="w-full h-[260px] bg-slate-50/50 p-2.5 rounded-2xl border border-gray-100">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={filteredData} margin={{ top: 15, right: 15, left: 15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                <XAxis 
                  dataKey="date" 
                  stroke="rgba(0,0,0,0.6)" 
                  fontSize={11} 
                  fontWeight="bold" 
                  tickLine={true}
                  minTickGap={50}
                />
                <YAxis 
                  stroke="rgba(0,0,0,0.6)" 
                  fontSize={10} 
                  fontWeight="bold" 
                  tickLine={true} 
                  tickFormatter={(v) => Number(v).toFixed(2) + 'm/d'}
                />
                
                {/* 일간변위 기준 임계선 표시 (토글 제어 연동) */}
                {showThresholds && (
                  <>
                    <ReferenceLine y={0.50} stroke="#d97706" strokeDasharray="3 3" strokeWidth={1.5} />
                    <ReferenceLine y={0.75} stroke="#ea580c" strokeDasharray="3 3" strokeWidth={1.5} />
                    <ReferenceLine y={1.00} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1.8} />
                    <ReferenceLine y={-0.50} stroke="#d97706" strokeDasharray="3 3" strokeWidth={1.5} />
                  </>
                )}

                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="p-2 bg-white border border-gray-300 rounded-lg shadow-md text-xs text-gray-800 font-bold">
                          <p className="font-semibold">{data.date}</p>
                          <p className="text-blue-700 font-extrabold mt-1">
                            일간변위: {data.isForecast ? (data.arimaRate || 0).toFixed(3) : (data.actualRate || 0).toFixed(3)} m/day
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />

                {/* 일간변위 Bar */}
                <Bar 
                  dataKey={(d) => d.isForecast ? d.arimaRate : d.actualRate} 
                  fill="rgba(37, 99, 235, 0.85)" 
                  radius={[2, 2, 0, 0]}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-[10px] text-gray-600 font-bold leading-relaxed shadow-sm">
            * 일간 변위의 3차 위험 속도 기준선은 **1.00 m/day**이며, 수위의 급격한 용출이나 센서 변위를 분석할 때 적용됩니다.
          </div>
        </section>

        {/* 5. 계측 데이터 테이블 섹션 */}
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-gray-200">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-5 bg-blue-600 rounded-full"></span>
              <h2 className="text-xl font-black text-gray-950">계측 원시 데이터 대장</h2>
              <span className="text-xs text-blue-700 bg-blue-50 px-3 py-1 rounded-full font-bold border border-blue-200 shadow-sm">
                누적 계측 레코드 수: {tableData.length}건
              </span>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={handleDownload}
                className="px-4 py-2.5 bg-white border-2 border-gray-300 hover:bg-gray-50 text-gray-800 text-xs font-black rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
              >
                <Download className="w-4 h-4" />
                내보내기 (CSV)
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-2xl shadow-inner">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-gray-700 font-black border-b border-gray-200">
                  <th className="p-3.5">계측일자</th>
                  <th className="p-3.5">관상단 (EL+m)</th>
                  <th className="p-3.5">측정치 (EL-m)</th>
                  <th className="p-3.5">측정치 (GL-m)</th>
                  <th className="p-3.5">누적변화량 (m)</th>
                  <th className="p-3.5">일간변위 (m/day)</th>
                  <th className="p-3.5">굴착고 (GL-m)</th>
                  <th className="p-3.5 text-center">초기치 여부</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-bold text-gray-800">
                {paginatedTableData.map((row, index) => (
                  <tr key={index} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3.5 font-bold text-slate-800">{row.date}</td>
                    <td className="p-3.5 text-slate-650">{row.pipeTop.toFixed(3)}</td>
                    <td className="p-3.5 text-slate-650">{row.actualWaterLevel.toFixed(3)}</td>
                    <td className="p-3.5 text-slate-650">{row.actualGL.toFixed(3)}</td>
                    <td className={`p-3.5 font-extrabold ${Math.abs(row.actualDelta) >= currentInstrument.thresholds.deltaInit.level1 ? 'text-red-650 bg-red-500/5' : 'text-slate-900'}`}>
                      {row.actualDelta.toFixed(3)}
                    </td>
                    <td className="p-3.5 text-slate-650">{row.actualRate.toFixed(3)}</td>
                    <td className="p-3.5 text-sky-700 font-black">{row.excavationDepth.toFixed(3)}</td>
                    <td className="p-3.5 text-center">
                      {index === tableData.length - 1 - (currentPage-1)*itemsPerPage ? (
                        <span className="text-[10px] bg-slate-200 text-slate-700 px-2.5 py-1 rounded font-black tracking-wider border border-slate-300">초기치</span>
                      ) : (
                        <span className="text-gray-300 font-medium">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 테이블 하단 페이징 컨트롤 */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200 text-xs font-bold text-gray-700">
            <p className="text-gray-600">
              전체 {totalPages}페이지 중 {currentPage}페이지 표시
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border-2 border-gray-200 text-gray-500 hover:bg-gray-150 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {[...Array(totalPages)].map((_, i) => {
                const pageNum = i + 1;
                if (pageNum === 1 || pageNum === totalPages || Math.abs(pageNum - currentPage) <= 2) {
                  return (
                    <button
                      key={i}
                      onClick={() => handlePageChange(pageNum)}
                      className={`px-3.5 py-2 rounded-lg font-black border transition-all ${
                        currentPage === pageNum
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                } else if (pageNum === 2 || pageNum === totalPages - 1) {
                  return <span key={i} className="text-gray-400 px-1">...</span>;
                }
                return null;
              })}
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border-2 border-gray-200 text-gray-500 hover:bg-gray-150 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {/* 6. AI 시점 예측 모델 고도화 분석 내용 */}
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2.5 border-b border-gray-200 pb-3">
            <span className="w-2 h-5 bg-indigo-600 rounded-full"></span>
            <h2 className="text-lg font-black text-gray-900">시계열 AI 예측 알고리즘 상세 명세 및 한계점</h2>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-slate-800">
            
            {/* ARIMA 상세 */}
            <div className="bg-orange-50/60 border border-orange-200 rounded-2xl p-5 space-y-3 shadow-sm flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-orange-650" />
                  <h3 className="font-extrabold text-gray-950 text-sm">ARIMA (선형 추세 분석)</h3>
                </div>
                <p className="text-xs leading-relaxed text-gray-700 font-medium">
                  자기회귀(AR) 성질과 이동평균(MA) 필터를 융합한 전통 시계열 통계 모델입니다. 지하수위의 과거 트렌드 흐름을 수학적으로 연장해 5일 예측치를 계산합니다.
                </p>
                <div className="text-[11px] font-bold text-orange-950 bg-white p-2.5 rounded-lg border border-orange-100">
                  ⚠️ <strong>한계점:</strong> 굴착고가 급변하거나 갑작스러운 집중강우 시 수위 변화 패턴을 비선형적으로 인지하지 못하고 완만한 일직선 예측에 그치는 한계가 있습니다.
                </div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-orange-200 text-[11px] font-bold text-orange-900 leading-tight">
                <strong>고도화 (ARIMAX):</strong> 강수량과 외부 굴착 일정을 외생변수(X)로 반영하여 예측 정확도를 개선합니다.
              </div>
            </div>

            {/* LSTM 상세 */}
            <div className="bg-purple-50/60 border border-purple-200 rounded-2xl p-5 space-y-3 shadow-sm flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-purple-650" />
                  <h3 className="font-extrabold text-gray-950 text-sm">LSTM (순환 신경망)</h3>
                </div>
                <p className="text-xs leading-relaxed text-gray-700 font-medium">
                  셀 상태(Cell State)와 인풋/아웃풋 게이트 구조를 통해 시간적 인과관계를 학습하는 딥러닝 아키텍처입니다. 굴착고 증가에 따른 누적 수위 하강의 비선형적 경향을 효과적으로 잡아냅니다.
                </p>
                <div className="text-[11px] font-bold text-purple-950 bg-white p-2.5 rounded-lg border border-purple-100">
                  ⚠️ <strong>한계점:</strong> 과거 데이터에 집중강우/가뭄과 같은 특이한 외부 날씨 패턴이 충분히 학습되지 않은 경우, 급격한 이상 강우 시의 수위 복구를 과소평가할 수 있습니다.
                </div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-purple-200 text-[11px] font-bold text-purple-900 leading-tight">
                <strong>고도화:</strong> 입력 윈도우를 14일 이상으로 늘려, 빗물이 지하 흙층을 거쳐 스며드는 강수 지연 효과(Time Lag)를 딥러닝이 스스로 학습하도록 훈련합니다.
              </div>
            </div>

            {/* Transformer 상세 */}
            <div className="bg-pink-50/60 border border-pink-200 rounded-2xl p-5 space-y-3 shadow-sm flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-pink-650" />
                  <h3 className="font-extrabold text-gray-950 text-sm">Transformer (어텐션 딥러닝)</h3>
                </div>
                <p className="text-xs leading-relaxed text-gray-700 font-medium">
                  Self-Attention 메커니즘을 통해 계측 이력 중 수위 변동이 가장 크게 발생했던 중요 시점을 직접 타깃 예측 지점과 연결하여 최첨단 예측을 수행합니다.
                </p>
                <div className="text-[11px] font-bold text-pink-950 bg-white p-2.5 rounded-lg border border-pink-100">
                  ⚠️ <strong>한계점:</strong> 연산 파라미터가 매우 많아 소량의 데이터에서는 과적합(Overfitting)될 위험이 크며, 현장의 물리적 토질 속성을 파악하지 못하고 계측된 형상만 학습합니다.
                </div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-pink-200 text-[11px] font-bold text-pink-900 leading-tight">
                <strong>고도화 (Temporal Fusion):</strong> 토질의 투수율과 기상청 날씨 예측 시나리오 레이어를 Attention 디코더에 결합하여 장기 예측 복원력을 대폭 보완합니다.
              </div>
            </div>

          </div>
        </section>

      </main>

      {/* 7. 하단 푸터 */}
      <footer className="border-t border-gray-200 bg-white py-4 px-6 text-center text-xs text-gray-500">
        <p className="font-semibold">© 2026 월곶-판교 복선전철 제4공구 현장 계측 시스템. (AI Groundwater Level Control Console)</p>
      </footer>
    </div>
  );
}

export default App;
