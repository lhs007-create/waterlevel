import React, { useState, useMemo } from 'react';
import { groundwaterData } from './data/groundwaterData';
import { 
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, Legend, ReferenceLine, Label 
} from 'recharts';
import { 
  Activity, AlertTriangle, CheckCircle, Database, HelpCircle, 
  Info, TrendingDown, ShieldAlert, Cpu, Layers, Calendar, ArrowRight, 
  Gauge, Sun, Moon, CloudRain, Sliders, ChevronDown, Download, ChevronLeft, ChevronRight, RefreshCw
} from 'lucide-react';

function App() {
  const { projectInfo, instruments } = groundwaterData;
  const instrumentIds = Object.keys(instruments);
  
  // 상태 관리
  const [selectedId, setSelectedId] = useState(instrumentIds[0] || 'W-P-001');
  const [filterPeriod, setFilterPeriod] = useState('3'); // '3'개월, '6'개월, 'all'전체
  const [weatherImpact, setWeatherImpact] = useState(false); // 강수 데이터 연동 여부
  const [noiseFilter, setNoiseFilter] = useState(false); // 노이즈 필터링 여부
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  const currentInstrument = instruments[selectedId];
  const rawData = currentInstrument.data;

  // 1. 강수량 시뮬레이션 및 이동평균(노이즈 필터) 연산된 데이터 생성
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

      // 기상청 강수 데이터 모사 (시뮬레이션)
      // 여름철인 5월, 6월, 7월 경에 강수 집중 배치
      let precipitation = 0;
      const dateObj = new Date(d.date);
      const month = dateObj.getMonth() + 1;
      const day = dateObj.getDate();
      
      // 장마철 강우 이벤트 모사
      if (month === 5 && (day === 15 || day === 16)) {
        precipitation = day === 15 ? 45.5 : 30.2;
      } else if (month === 6 && (day === 25 || day === 26 || day === 27)) {
        precipitation = day === 25 ? 65.0 : (day === 26 ? 85.4 : 20.1);
      } else if (month === 7 && day === 5) {
        precipitation = 52.0;
      } else if (Math.random() > 0.92) {
        // 평시 산발적 소량 강우
        precipitation = Math.round(Math.random() * 15 * 10) / 10;
      }

      return {
        ...d,
        filteredDelta: filteredDelta !== null ? round(filteredDelta, 3) : null,
        precipitation: weatherImpact ? precipitation : 0
      };
    });
  }, [rawData, weatherImpact, noiseFilter]);

  // 2. 기간별 필터링 적용
  const filteredData = useMemo(() => {
    if (filterPeriod === 'all') return processedData;
    
    const monthsToSubtract = parseInt(filterPeriod);
    const lastDateStr = processedData[processedData.length - 1].date;
    const lastDate = new Date(lastDateStr);
    
    const cutoffDate = new Date(lastDate);
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsToSubtract);
    
    return processedData.filter(d => new Date(d.date) >= cutoffDate);
  }, [processedData, filterPeriod]);

  // 3. 실시간 안전 등급 진단 로직 (음수 수치에 매핑)
  const safetyStatus = useMemo(() => {
    const actualRows = processedData.filter(d => !d.isForecast);
    const lastActual = actualRows[actualRows.length - 1] || {};
    
    const forecastRows = processedData.filter(d => d.isForecast);
    const lastForecast = forecastRows[forecastRows.length - 1] || {};

    // 엑셀은 누적변화량이 음수로 떨어지므로 최저치(절대값 기준 최대치)를 확인
    const minActualDelta = Math.min(...actualRows.map(d => d.actualDelta || 0));
    const minForecastDelta = Math.min(
      ...forecastRows.map(d => Math.min(d.arimaDelta || 0, d.lstmDelta || 0, d.transformerDelta || 0))
    );
    
    // 가장 하강폭이 큰 값 (즉, 가장 작은 음수값)
    const peakDelta = Math.min(minActualDelta, minForecastDelta);
    const absPeakDelta = Math.abs(peakDelta);
    
    // 임계값 매핑 (1.59m, 1.99m, 2.39m)
    const lv1 = currentInstrument.thresholds.deltaInit.level1;
    const lv2 = currentInstrument.thresholds.deltaInit.level2;
    const lv3 = currentInstrument.thresholds.deltaInit.level3;
    
    let level = '안전';
    let colorClass = 'text-emerald-600 bg-emerald-50 border-emerald-200';
    let alertColor = 'bg-emerald-500';
    let bgIcon = <CheckCircle className="w-8 h-8 text-emerald-500" />;
    let desc = '모든 지하수위 변동 및 예측치가 관리 기준치 이내로 매우 안정적인 추세를 유지하고 있습니다.';
    
    if (absPeakDelta >= lv3) {
      level = '경계 (3차 초과)';
      colorClass = 'text-red-700 bg-red-50 border-red-200';
      alertColor = 'bg-red-500';
      bgIcon = <ShieldAlert className="w-8 h-8 text-red-600 animate-pulse" />;
      desc = `[경고] 미래 5일 이내에 AI 예측 수위 변위량(${absPeakDelta.toFixed(2)}m)이 3차 관리 기준치(${lv3}m)를 초과할 가능성이 매우 높습니다. 굴착 하부 차수 보강공사 검토가 즉시 요구됩니다.`;
    } else if (absPeakDelta >= lv2) {
      level = '주의 (2차 초과)';
      colorClass = 'text-orange-700 bg-orange-50 border-orange-200';
      alertColor = 'bg-orange-500';
      bgIcon = <AlertTriangle className="w-8 h-8 text-orange-500" />;
      desc = `[알림] 누적 수위 변위량이 2차 관리 기준치(${lv2}m) 이상으로 내려앉고 있습니다. 공사 구역 배수 펌프 및 인접 지하 구조물의 연약 지반 침하 여부를 검사하십시오.`;
    } else if (absPeakDelta >= lv1) {
      level = '관심 (1차 초과)';
      colorClass = 'text-yellow-700 bg-yellow-50 border-yellow-200';
      alertColor = 'bg-yellow-500';
      bgIcon = <Info className="w-8 h-8 text-yellow-600" />;
      desc = `[정보] 누적 변화량이 1차 관리 기준치(${lv1}m)를 침범했습니다. 일간 변화율 속도를 점검해 하강 속도가 가속화되는지 예의주시 하시기 바랍니다.`;
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

  // 4. 테이블 페이징 처리 (실계측 데이터만 표시하도록 구성)
  const tableData = useMemo(() => {
    return processedData.filter(d => !d.isForecast).reverse(); // 최신순 정렬
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
    // CSV 가상 다운로드 알림
    alert(`${currentInstrument.displayName} 계측 데이터의 CSV 다운로드가 완료되었습니다.\n파일명: ${projectInfo.siteCode}_${currentInstrument.displayName}_data.csv`);
  };

  // 소수점 헬퍼 함수
  function round(val, precision) {
    return Math.round(val * Math.pow(10, precision)) / Math.pow(10, precision);
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 flex flex-col font-sans">
      
      {/* 1. 상단 관제실 밝은 테마 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-100 shadow-inner">
              <Gauge className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded border border-blue-200/50">
                  지하수위 AI 예측 및 계측관제
                </span>
                <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                  VITE-REACT 기반 시연 시스템
                </span>
              </div>
              <h1 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2 mt-0.5">
                {projectInfo.projectName}
                <span className="text-xs font-normal text-gray-500">지점코드: {projectInfo.siteCode}</span>
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* 고도화 토글 제어 영역 */}
            <div className="flex items-center gap-2 text-xs bg-gray-100 p-1 rounded-xl border border-gray-200">
              <button 
                onClick={() => setWeatherImpact(!weatherImpact)}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                  weatherImpact 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="기상청 강수 데이터를 연동하여 지하수위 상승 복구 효과 시뮬레이션"
              >
                <CloudRain className="w-3.5 h-3.5" />
                기상 데이터 연동 {weatherImpact ? 'ON' : 'OFF'}
              </button>
              <button 
                onClick={() => setNoiseFilter(!noiseFilter)}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                  noiseFilter 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="이동평균 기법을 활용해 수계 노이즈를 스무딩 처리합니다."
              >
                <Sliders className="w-3.5 h-3.5" />
                노이즈 필터 {noiseFilter ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 2. 대시보드 콘텐츠 영역 */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        
        {/* 상단 탭 셀렉터 - W-1 ~ W-10 */}
        <div className="bg-white p-2 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider px-3 shrink-0">계측기 관측공 전환:</span>
          {instrumentIds.map((id) => (
            <button
              key={id}
              onClick={() => {
                setSelectedId(id);
                setCurrentPage(1); // 관측공 이동시 페이지 초기화
              }}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all border shrink-0 ${
                selectedId === id
                  ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-500/20'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {instruments[id].displayName} (계측기)
            </button>
          ))}
        </div>

        {/* 3. 설치 및 계측 정보 섹션 (밝은 테마 테이블 및 수준기준점) */}
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <span className="w-1.5 h-4 bg-blue-600 rounded-full"></span>
            <h2 className="text-lg font-black text-gray-900">{currentInstrument.displayName} 설치 및 계측 정보</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* 왼쪽: 기본 속성 카드 */}
            <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 space-y-4">
              <h3 className="text-xs font-bold text-slate-700 tracking-wider uppercase">기본 설비 속성</h3>
              <div className="grid grid-cols-2 gap-y-3 text-xs">
                <span className="text-gray-500">계측기 코드</span>
                <span className="font-bold text-gray-900 text-right">{currentInstrument.displayName}</span>
                
                <span className="text-gray-500">계측기명</span>
                <span className="font-bold text-gray-900 text-right">지하수위계 (WL)</span>
                
                <span className="text-gray-500">설치일자</span>
                <span className="font-medium text-gray-900 text-right">{currentInstrument.installDate}</span>
                
                <span className="text-gray-500">초기치 측정일</span>
                <span className="font-medium text-gray-900 text-right">{currentInstrument.initialMeasureDate}</span>
                
                <span className="text-gray-500">설치위치</span>
                <span className="font-medium text-gray-900 text-right">{currentInstrument.location.split(' ')[0]}</span>
              </div>
              <div className="border-t border-slate-200/80 pt-3">
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  ⓘ 본선환기구#15 굴착영향범위 내 상시 모니터링 수계 대상
                </p>
              </div>
            </div>

            {/* 중간: 안전관리기준 임계치 */}
            <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-700 tracking-wider uppercase mb-3">안전 관리 기준</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] text-gray-500">
                        <th className="pb-2 font-medium">관리 지표</th>
                        <th className="pb-2 font-semibold text-center text-yellow-600 bg-yellow-500/5 px-2">1차 (관심)</th>
                        <th className="pb-2 font-semibold text-center text-orange-600 bg-orange-500/5 px-2">2차 (주의)</th>
                        <th className="pb-2 font-semibold text-center text-red-600 bg-red-500/5 px-2">3차 (경계)</th>
                        <th className="pb-2 text-right">단위</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      <tr>
                        <td className="py-2.5 text-gray-700">누적변화량</td>
                        <td className="text-center text-yellow-700 bg-yellow-500/5 px-2">{currentInstrument.thresholds.deltaInit.level1}</td>
                        <td className="text-center text-orange-700 bg-orange-500/5 px-2">{currentInstrument.thresholds.deltaInit.level2}</td>
                        <td className="text-center text-red-700 bg-red-500/5 px-2">{currentInstrument.thresholds.deltaInit.level3}</td>
                        <td className="text-right text-gray-500">m</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-gray-700">일간변위</td>
                        <td className="text-center text-yellow-700 bg-yellow-500/5 px-2">{currentInstrument.thresholds.rate1D.level1}</td>
                        <td className="text-center text-orange-700 bg-orange-500/5 px-2">{currentInstrument.thresholds.rate1D.level2}</td>
                        <td className="text-center text-red-700 bg-red-500/5 px-2">{currentInstrument.thresholds.rate1D.level3}</td>
                        <td className="text-right text-gray-500">m/d</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* 오른쪽: BM 참고 정보 및 실시간 안전 진단 */}
            <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 flex flex-col justify-between">
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-700 tracking-wider uppercase">참고 사항 및 수직 기준</h3>
                <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5">
                  <p className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                    수준기준점 (Bench Mark)
                  </p>
                  <p className="text-xs font-semibold text-blue-700 pl-3.5">
                    {currentInstrument.bmInfo}
                  </p>
                  <p className="text-[10px] text-gray-500 pl-3.5 leading-relaxed">
                    관상단 수평 계측고 결정을 위해 지정된 주변 수준점 절대 EL 수치 정보입니다.
                  </p>
                </div>
              </div>

              {/* 하단 진단 바 */}
              <div className={`mt-4 p-3.5 rounded-xl border flex items-center gap-3 ${safetyStatus.colorClass}`}>
                <div className="shrink-0">{safetyStatus.bgIcon}</div>
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-wider opacity-60">안전 등급 진단 결과</span>
                  <h4 className="text-sm font-black leading-tight mt-0.5">{safetyStatus.level}</h4>
                </div>
              </div>
            </div>

          </div>

          {/* 이상 경보 문구 상단 표출 */}
          {safetyStatus.level !== '안전' && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-100 flex items-center gap-3 text-xs leading-relaxed text-red-800">
              <AlertTriangle className="w-5 h-5 shrink-0 text-red-600" />
              <p className="font-semibold">{safetyStatus.desc}</p>
            </div>
          )}
        </section>

        {/* 4. 시계열 변위 추이 차트 및 일간 변위 차트 */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* 차트 1: 누적 변위량 - 굴착고 차트 (2칸 차지) */}
          <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm lg:col-span-2 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-600" />
                  시계열 변위 추이 (지하수위 & 굴착고)
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  누적변화량은 하강량이므로 음수 방향으로 그려집니다.
                </p>
              </div>

              {/* 기간 및 조건 필터 */}
              <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl text-xs">
                <button
                  onClick={() => setFilterPeriod('3')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    filterPeriod === '3' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  3개월
                </button>
                <button
                  onClick={() => setFilterPeriod('6')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    filterPeriod === '6' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  6개월
                </button>
                <button
                  onClick={() => setFilterPeriod('all')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    filterPeriod === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  전체 기간
                </button>
              </div>
            </div>

            {/* 차트 영역 */}
            <div className="w-full h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={filteredData} margin={{ top: 15, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                  <XAxis 
                    dataKey="date" 
                    stroke="rgba(0,0,0,0.4)" 
                    fontSize={10} 
                    tickLine={false} 
                  />
                  
                  {/* 좌측 Y축: 누적변화량(m) - 음수 하강 축 */}
                  <YAxis 
                    yAxisId="left" 
                    stroke="rgba(0,0,0,0.4)" 
                    fontSize={10} 
                    tickLine={false}
                    domain={['dataMin - 0.2', 0.1]} // 음수 범위 매핑
                  >
                    <Label 
                      value="누적변화량 (m)" 
                      angle={-90} 
                      position="insideLeft" 
                      style={{ textAnchor: 'middle', fill: 'rgba(0,0,0,0.5)', fontSize: 10, fontWeight: 'bold' }} 
                    />
                  </YAxis>

                  {/* 우측 Y축: 굴착고 깊이(m) - 아래로 굴착되도록 표현 */}
                  <YAxis 
                    yAxisId="right" 
                    orientation="right" 
                    stroke="rgba(0,0,0,0.4)" 
                    fontSize={10} 
                    tickLine={false}
                    domain={['dataMin - 3', 0.5]}
                  >
                    <Label 
                      value="굴착고 (GL-m)" 
                      angle={90} 
                      position="insideRight" 
                      style={{ textAnchor: 'middle', fill: 'rgba(0,0,0,0.5)', fontSize: 10, fontWeight: 'bold' }} 
                    />
                  </YAxis>

                  {/* 툴팁 */}
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="p-4 bg-white border border-gray-200 rounded-xl shadow-lg text-xs space-y-2 text-gray-700">
                            <p className="font-bold flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-gray-400" />
                              {data.date} {data.isForecast && <span className="text-[9px] px-1 bg-blue-100 text-blue-700 rounded border border-blue-200">AI 예측</span>}
                            </p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                              <span className="text-gray-500">굴착 깊이:</span>
                              <span className="font-bold text-gray-900 text-right">{data.excavationDepth} m</span>
                              {!data.isForecast ? (
                                <>
                                  <span className="text-gray-500">누적변화량:</span>
                                  <span className="font-bold text-blue-600 text-right">{data.actualDelta} m</span>
                                  <span className="text-gray-500">지하수위(EL):</span>
                                  <span className="font-bold text-teal-600 text-right">{data.actualWaterLevel} m</span>
                                </>
                              ) : (
                                <>
                                  <span className="text-orange-500">ARIMA 변위:</span>
                                  <span className="font-bold text-orange-600 text-right">{data.arimaDelta} m</span>
                                  <span className="text-purple-500">LSTM 변위:</span>
                                  <span className="font-bold text-purple-600 text-right">{data.lstmDelta} m</span>
                                  <span className="text-pink-500">Transformer:</span>
                                  <span className="font-bold text-pink-600 text-right">{data.transformerDelta} m</span>
                                </>
                              )}
                              {weatherImpact && data.precipitation > 0 && (
                                <>
                                  <span className="text-blue-500">시뮬레이션 강수:</span>
                                  <span className="font-bold text-blue-600 text-right">{data.precipitation} mm</span>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />

                  {/* 1. 기상청 강수 데이터 연동 시 시뮬레이션 막대 그래프 (배경) */}
                  {weatherImpact && (
                    <Bar 
                      yAxisId="right"
                      dataKey="precipitation"
                      fill="rgba(37, 99, 235, 0.08)"
                      stroke="rgba(37, 99, 235, 0.2)"
                      barSize={10}
                      name="일강수량 (mm)"
                    />
                  )}

                  {/* 2. 관리기준 수평 임계선 (음수 영역에 표시) */}
                  <ReferenceLine 
                    yAxisId="left" 
                    y={-currentInstrument.thresholds.deltaInit.level1} 
                    stroke="#eab308" 
                    strokeDasharray="4 4" 
                    strokeWidth={1}
                  >
                    <Label value="1차 (1.59m)" position="insideBottomLeft" fill="#d97706" fontSize={8} />
                  </ReferenceLine>
                  <ReferenceLine 
                    yAxisId="left" 
                    y={-currentInstrument.thresholds.deltaInit.level2} 
                    stroke="#f97316" 
                    strokeDasharray="4 4" 
                    strokeWidth={1.2}
                  >
                    <Label value="2차 (1.99m)" position="insideBottomLeft" fill="#ea580c" fontSize={8} />
                  </ReferenceLine>
                  <ReferenceLine 
                    yAxisId="left" 
                    y={-currentInstrument.thresholds.deltaInit.level3} 
                    stroke="#ef4444" 
                    strokeDasharray="4 4" 
                    strokeWidth={1.5}
                  >
                    <Label value="3차 (2.39m)" position="insideBottomLeft" fill="#dc2626" fontSize={8} />
                  </ReferenceLine>

                  {/* AI 예측 구간 경계선 */}
                  {safetyStatus.forecastStartDate && (
                    <ReferenceLine 
                      yAxisId="left" 
                      x={safetyStatus.forecastStartDate} 
                      stroke="#4f46e5" 
                      strokeWidth={1.5} 
                      strokeDasharray="3 3"
                    >
                      <Label value="AI 미래 예측 5일" position="top" fill="#4f46e5" fontSize={9} fontWeight="bold" />
                    </ReferenceLine>
                  )}

                  {/* 3. 굴착고 라인 그래프 (우측 Y축, 점선) */}
                  <Line 
                    yAxisId="right" 
                    type="monotone" 
                    dataKey="excavationDepth" 
                    stroke="#0284c7" 
                    strokeWidth={2} 
                    strokeDasharray="4 4"
                    dot={false}
                    name="굴착고"
                  />

                  {/* 4. 실제 지하수위 누적변위량 (실선) */}
                  <Line 
                    yAxisId="left" 
                    type="monotone" 
                    dataKey={noiseFilter ? "filteredDelta" : "actualDelta"} 
                    stroke="#2563eb" 
                    strokeWidth={3} 
                    dot={{ r: 1.5 }}
                    activeDot={{ r: 5 }}
                    name={noiseFilter ? "실제 누적변위 (이동평균)" : "실제 누적변위"}
                    connectNulls
                  />

                  {/* 5. ARIMA 예측 (점선) */}
                  <Line 
                    yAxisId="left" 
                    type="monotone" 
                    dataKey="arimaDelta" 
                    stroke="#ea580c" 
                    strokeWidth={2} 
                    strokeDasharray="4 4"
                    dot={{ r: 2 }}
                    name="ARIMA 예측"
                    connectNulls
                  />

                  {/* 6. LSTM 예측 (이중선 스타일) */}
                  <Line 
                    yAxisId="left" 
                    type="monotone" 
                    dataKey="lstmDelta" 
                    stroke="#9333ea" 
                    strokeWidth={2} 
                    strokeDasharray="7 2"
                    dot={{ r: 2 }}
                    name="LSTM 예측"
                    connectNulls
                  />

                  {/* 7. Transformer 예측 (굵은 실선) */}
                  <Line 
                    yAxisId="left" 
                    type="monotone" 
                    dataKey="transformerDelta" 
                    stroke="#db2777" 
                    strokeWidth={3} 
                    dot={{ r: 3 }}
                    name="Transformer 예측"
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 차트 2: 일간변위 (m/day) 차트 (1칸 차지) */}
          <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between space-y-4">
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-600" />
                일간변위 모니터링 (m/day)
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                하루 단위의 미세 변동량을 Bar 차트로 표시합니다.
              </p>
            </div>

            <div className="w-full h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={filteredData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.03)" />
                  <XAxis dataKey="date" hide />
                  <YAxis stroke="rgba(0,0,0,0.4)" fontSize={9} tickLine={false} />
                  
                  {/* 일간변위 기준 임계선 점선 */}
                  <ReferenceLine y={0.50} stroke="#eab308" strokeDasharray="3 3" strokeWidth={1} />
                  <ReferenceLine y={0.75} stroke="#f97316" strokeDasharray="3 3" strokeWidth={1} />
                  <ReferenceLine y={1.00} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} />
                  <ReferenceLine y={-0.50} stroke="#eab308" strokeDasharray="3 3" strokeWidth={1} />

                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="p-2 bg-white border border-gray-200 rounded-lg shadow-md text-xs text-gray-700">
                            <p className="font-semibold">{data.date}</p>
                            <p className="text-blue-600 font-bold mt-1">
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
                    fill="rgba(37, 99, 235, 0.75)" 
                    radius={[2, 2, 0, 0]}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            
            {/* 가이드 지침 */}
            <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl text-[10px] text-gray-500 leading-relaxed">
              * 일간 변위의 3차 위험선은 **1.00 m/day**이며, 수위의 급작스런 출렁임이나 누수 현상을 미세 진단할 때 활용됩니다.
            </div>
          </div>

        </section>

        {/* 5. 계측 데이터 테이블 섹션 */}
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-4 bg-blue-600 rounded-full"></span>
              <h2 className="text-lg font-black text-gray-900">계측 원시 데이터 대장</h2>
              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                계측 레코드 수: {tableData.length}건
              </span>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={handleDownload}
                className="px-3.5 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                내보내기 (CSV)
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-gray-500 font-semibold border-b border-gray-200">
                  <th className="p-3">계측일자</th>
                  <th className="p-3">관상단 (EL+m)</th>
                  <th className="p-3">측정치 (EL-m)</th>
                  <th className="p-3">측정치 (GL-m)</th>
                  <th className="p-3">누적변화량 (m)</th>
                  <th className="p-3">일간변위 (m/day)</th>
                  <th className="p-3">굴착고 (GL-m)</th>
                  <th className="p-3 text-center">초기치 여부</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium">
                {paginatedTableData.map((row, index) => (
                  <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-3 font-semibold text-slate-700">{row.date}</td>
                    <td className="p-3 text-slate-600">{row.pipeTop.toFixed(3)}</td>
                    <td className="p-3 text-slate-600">{row.actualWaterLevel.toFixed(3)}</td>
                    <td className="p-3 text-slate-600">{row.actualGL.toFixed(3)}</td>
                    <td className={`p-3 font-bold ${Math.abs(row.actualDelta) >= currentInstrument.thresholds.deltaInit.level1 ? 'text-red-600' : 'text-slate-900'}`}>
                      {row.actualDelta.toFixed(3)}
                    </td>
                    <td className="p-3 text-slate-600">{row.actualRate.toFixed(3)}</td>
                    <td className="p-3 text-sky-700 font-bold">{row.excavationDepth.toFixed(3)}</td>
                    <td className="p-3 text-center">
                      {index === tableData.length - 1 - (currentPage-1)*itemsPerPage ? (
                        <span className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold uppercase tracking-wider">초기치</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 테이블 하단 페이징 컨트롤 */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-100 text-xs">
            <p className="text-gray-500">
              전체 {totalPages}페이지 중 {currentPage}페이지 표시
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {[...Array(totalPages)].map((_, i) => {
                const pageNum = i + 1;
                // 페이징이 너무 많을 경우 현재 페이지 주변만 표시
                if (pageNum === 1 || pageNum === totalPages || Math.abs(pageNum - currentPage) <= 2) {
                  return (
                    <button
                      key={i}
                      onClick={() => handlePageChange(pageNum)}
                      className={`px-3 py-1.5 rounded-lg font-bold border transition-all ${
                        currentPage === pageNum
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
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
                className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {/* 6. AI 시점 예측 모델 고도화 분석 내용 */}
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <span className="w-1.5 h-4 bg-indigo-600 rounded-full"></span>
            <h2 className="text-lg font-black text-gray-900">시계열 AI 예측 알고리즘 상세 명세</h2>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* ARIMA 상세 */}
            <div className="bg-orange-50/40 border border-orange-100 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-orange-600" />
                <h3 className="font-bold text-gray-900">ARIMA (선형 추세 분석)</h3>
              </div>
              <p className="text-xs leading-relaxed text-gray-600">
                자기회귀(AR) 성질과 이동평균(MA) 필터를 융합한 전통 시계열 통계 모델입니다. 지하수위의 선형적 연속 흐름을 연장하여 단기 예측치를 안정적으로 생성합니다.
              </p>
              <div className="bg-white/80 p-2.5 rounded-xl border border-orange-200/50 text-[10px] font-mono text-orange-800 leading-tight">
                <strong>고도화 방안 (ARIMAX):</strong><br />
                강수량과 외부 굴착 일정을 외생변수(X)로 주입하는 다변량 ARIMAX로 고도화하여 기상 영향을 반영합니다.
              </div>
            </div>

            {/* LSTM 상세 */}
            <div className="bg-purple-50/40 border border-purple-100 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-gray-900">LSTM (순환 신경망)</h3>
              </div>
              <p className="text-xs leading-relaxed text-gray-600">
                셀 상태(Cell State)와 게이트 제어를 통해 계측 데이터의 장단기 시계열 패턴을 기억하는 딥러닝 아키텍처입니다. 굴착고 증가에 따른 누적 수위 하강 비선형성을 효과적으로 모델링합니다.
              </p>
              <div className="bg-white/80 p-2.5 rounded-xl border border-purple-200/50 text-[10px] font-mono text-purple-800 leading-tight">
                <strong>고도화 방안 (Multivariate LSTM):</strong><br />
                수위 변화 이력에 최근 3일간 누적 강수 및 일일 굴착 속도 피처를 병렬 투입해 학습 효율을 높입니다.
              </div>
            </div>

            {/* Transformer 상세 */}
            <div className="bg-pink-50/40 border border-pink-100 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-pink-600" />
                <h3 className="font-bold text-gray-900">Transformer (어텐션 딥러닝)</h3>
              </div>
              <p className="text-xs leading-relaxed text-gray-600">
                Self-Attention 가중치 계산을 통해, 먼 시점의 굴착 활동이나 급격한 지반 거동 이벤트를 현재 및 미래 예측 시점에 직접 연결해 가중치를 부여하는 최첨단 모델입니다.
              </p>
              <div className="bg-white/80 p-2.5 rounded-xl border border-pink-200/50 text-[10px] font-mono text-pink-800 leading-tight">
                <strong>고도화 방안 (Temporal Fusion):</strong><br />
                기온/강수 및 계절적 주기(주/월 단위) 마스킹 레이어를 융합하여 기상 이상 기후 시의 강하 방지력을 예측합니다.
              </div>
            </div>

          </div>
        </section>

      </main>

      {/* 7. 하단 푸터 */}
      <footer className="border-t border-gray-200 bg-white py-4 px-6 text-center text-[10px] text-gray-400">
        <p>© 2026 월곶-판교 복선전철 제4공구 현장 계측 시스템. (AI Groundwater Level Control Console)</p>
      </footer>
    </div>
  );
}

export default App;
