import React, { useState, useMemo } from 'react';
import { groundwaterData } from './data/groundwaterData';
import { 
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, Legend, ReferenceLine, Label 
} from 'recharts';
import { 
  Activity, AlertTriangle, CheckCircle, Database, HelpCircle, 
  Info, TrendingDown, ShieldAlert, Cpu, Layers, Calendar, 
  Gauge, CloudRain, Sliders, Download, ChevronLeft, ChevronRight
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
      alertColor = 'bg-red-600';
      bgIcon = <ShieldAlert className="w-8 h-8 text-red-600 animate-pulse" />;
      desc = `[경고] 미래 5일 이내에 AI 예측 수위 변위량(${absPeakDelta.toFixed(2)}m)이 3차 관리 기준치(${lv3}m)를 초과할 가능성이 매우 높습니다. 굴착 하부 차수 보강공사 검토가 즉시 요구됩니다.`;
    } else if (absPeakDelta >= lv2) {
      level = '주의 (2차 초과)';
      colorClass = 'text-orange-800 bg-orange-50 border-orange-300';
      alertColor = 'bg-orange-600';
      bgIcon = <AlertTriangle className="w-8 h-8 text-orange-600" />;
      desc = `[알림] 누적 수위 변위량이 2차 관리 기준치(${lv2}m) 이상으로 내려앉고 있습니다. 공사 구역 배수 펌프 및 인접 지하 구조물의 연약 지반 침하 여부를 검사하십시오.`;
    } else if (absPeakDelta >= lv1) {
      level = '관심 (1차 초과)';
      colorClass = 'text-amber-800 bg-amber-50 border-amber-300';
      alertColor = 'bg-amber-600';
      bgIcon = <Info className="w-8 h-8 text-amber-600" />;
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
                <span className="font-bold text-gray-950 text-right">{currentInstrument.displayName}</span>
                
                <span className="text-gray-600">계측기명</span>
                <span className="font-bold text-gray-950 text-right">지하수위계 (WL)</span>
                
                <span className="text-gray-600">설치일자</span>
                <span className="font-bold text-gray-950 text-right">{currentInstrument.installDate}</span>
                
                <span className="text-gray-600">초기치 측정일</span>
                <span className="font-bold text-gray-950 text-right">{currentInstrument.initialMeasureDate}</span>
                
                <span className="text-gray-600">설치위치</span>
                <span className="font-bold text-gray-955 text-right">{currentInstrument.location.split(' ')[0]}</span>
              </div>
              <div className="border-t border-slate-200 pt-3">
                <p className="text-[11px] font-bold text-slate-600 leading-relaxed">
                  ⓘ 본선환기구#15 굴착영향범위 내 상시 모니터링 수계 대상
                </p>
              </div>
            </div>

            {/* 중간: 안전관리기준 임계치 */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-black text-slate-800 tracking-wider uppercase border-b border-slate-200 pb-1.5 mb-3.5">안전 관리 기준</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-300 text-[10px] text-gray-600 font-extrabold uppercase">
                        <th className="pb-2 font-black">관리 지표</th>
                        <th className="pb-2 font-black text-center text-yellow-700 bg-yellow-100/50 px-2 rounded-t">1차 (관심)</th>
                        <th className="pb-2 font-black text-center text-orange-700 bg-orange-100/50 px-2 rounded-t">2차 (주의)</th>
                        <th className="pb-2 font-black text-center text-red-700 bg-red-100/50 px-2 rounded-t">3차 (경계)</th>
                        <th className="pb-2 text-right">단위</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-bold text-gray-800">
                      <tr>
                        <td className="py-3 text-gray-700 font-bold">누적변화량</td>
                        <td className="text-center font-black text-yellow-750 bg-yellow-100/50 px-2">{currentInstrument.thresholds.deltaInit.level1}</td>
                        <td className="text-center font-black text-orange-750 bg-orange-100/50 px-2">{currentInstrument.thresholds.deltaInit.level2}</td>
                        <td className="text-center font-black text-red-750 bg-red-100/50 px-2">{currentInstrument.thresholds.deltaInit.level3}</td>
                        <td className="text-right text-gray-650">m</td>
                      </tr>
                      <tr>
                        <td className="py-3 text-gray-700 font-bold">일간변위</td>
                        <td className="text-center font-black text-yellow-750 bg-yellow-100/50 px-2">{currentInstrument.thresholds.rate1D.level1}</td>
                        <td className="text-center font-black text-orange-750 bg-orange-100/50 px-2">{currentInstrument.thresholds.rate1D.level2}</td>
                        <td className="text-center font-black text-red-750 bg-red-100/50 px-2">{currentInstrument.thresholds.rate1D.level3}</td>
                        <td className="text-right text-gray-650">m/d</td>
                      </tr>
                    </tbody>
                  </table>
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

            {/* 기간 및 조건 필터 */}
            <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-xl text-xs border border-gray-250">
              <button
                onClick={() => setFilterPeriod('3')}
                className={`px-4 py-2 rounded-lg font-extrabold transition-all ${
                  filterPeriod === '3' ? 'bg-white text-blue-700 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-950'
                }`}
              >
                3개월
              </button>
              <button
                onClick={() => setFilterPeriod('6')}
                className={`px-4 py-2 rounded-lg font-extrabold transition-all ${
                  filterPeriod === '6' ? 'bg-white text-blue-700 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-950'
                }`}
              >
                6개월
              </button>
              <button
                onClick={() => setFilterPeriod('all')}
                className={`px-4 py-2 rounded-lg font-extrabold transition-all ${
                  filterPeriod === 'all' ? 'bg-white text-blue-700 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-950'
                }`}
              >
                전체 기간
              </button>
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
                
                {/* 좌측 Y축: 누적변화량(m) */}
                <YAxis 
                  yAxisId="left" 
                  stroke="rgba(0,0,0,0.6)" 
                  fontSize={11} 
                  fontWeight="bold"
                  tickLine={true}
                  domain={['dataMin - 0.2', 0.1]}
                >
                  <Label 
                    value="누적변화량 (m)" 
                    angle={-90} 
                    position="insideLeft" 
                    style={{ textAnchor: 'middle', fill: 'rgba(0,0,0,0.7)', fontSize: 11, fontWeight: 'black' }} 
                  />
                </YAxis>

                {/* 우측 Y축: 굴착고 깊이(m) */}
                <YAxis 
                  yAxisId="right" 
                  orientation="right" 
                  stroke="rgba(0,0,0,0.6)" 
                  fontSize={11} 
                  fontWeight="bold"
                  tickLine={true}
                  domain={['dataMin - 3', 0.5]}
                >
                  <Label 
                    value="굴착고 (GL-m)" 
                    angle={90} 
                    position="insideRight" 
                    style={{ textAnchor: 'middle', fill: 'rgba(0,0,0,0.7)', fontSize: 11, fontWeight: 'black' }} 
                  />
                </YAxis>

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

                {/* 1. 기상청 강수 데이터 연동 시 시뮬레이션 막대 그래프 (배경) */}
                {weatherImpact && (
                  <Bar 
                    yAxisId="right"
                    dataKey="precipitation"
                    fill="rgba(37, 99, 235, 0.08)"
                    stroke="rgba(37, 99, 235, 0.25)"
                    barSize={12}
                    name="일강수량 (mm)"
                  />
                )}

                {/* 2. 관리기준 수평 임계선 */}
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

                {/* 3. 굴착고 라인 그래프 (우측 Y축, 점선) */}
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
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-bold pt-2 border-t border-gray-100">
            <span className="flex items-center gap-2"><span className="w-4 h-1 bg-blue-600 rounded inline-block"></span>실제 계측 누적변화량</span>
            <span className="flex items-center gap-2"><span className="w-4 h-0.5 border-t-2 border-dashed border-orange-500 inline-block"></span>ARIMA 예측 (5일)</span>
            <span className="flex items-center gap-2"><span className="w-4 h-0.5 border-t-2 border-dashed border-purple-500 inline-block"></span>LSTM 예측 (5일)</span>
            <span className="flex items-center gap-2"><span className="w-4 h-1 bg-pink-500 rounded inline-block"></span>Transformer 예측 (5일)</span>
            <span className="flex items-center gap-2"><span className="w-4 h-0.5 border-t border-dashed border-sky-500 inline-block"></span>현장 굴착 깊이 (G.L)</span>
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
                />
                
                {/* 일간변위 기준 임계선 표시 */}
                <ReferenceLine y={0.50} stroke="#d97706" strokeDasharray="3 3" strokeWidth={1.5} />
                <ReferenceLine y={0.75} stroke="#ea580c" strokeDasharray="3 3" strokeWidth={1.5} />
                <ReferenceLine y={1.00} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1.8} />
                <ReferenceLine y={-0.50} stroke="#d97706" strokeDasharray="3 3" strokeWidth={1.5} />

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
            <h2 className="text-lg font-black text-gray-900">시계열 AI 예측 알고리즘 상세 명세</h2>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-slate-800">
            
            {/* ARIMA 상세 */}
            <div className="bg-orange-50/60 border border-orange-200 rounded-2xl p-5 space-y-3 shadow-sm">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-orange-650" />
                <h3 className="font-extrabold text-gray-950 text-sm">ARIMA (선형 추세 분석)</h3>
              </div>
              <p className="text-xs leading-relaxed text-gray-700 font-medium">
                자기회귀(AR) 성질과 이동평균(MA) 필터를 융합한 전통 시계열 통계 모델입니다. 지하수위의 선형적 연속 흐름을 연장하여 단기 예측치를 안정적으로 생성합니다.
              </p>
              <div className="bg-white p-3 rounded-xl border border-orange-200 text-[11px] font-bold text-orange-900 leading-tight">
                <strong>고도화 방안 (ARIMAX):</strong><br />
                강수량과 외부 굴착 일정을 외생변수(X)로 주입하는 다변량 ARIMAX로 고도화하여 기상 영향을 반영합니다.
              </div>
            </div>

            {/* LSTM 상세 */}
            <div className="bg-purple-50/60 border border-purple-200 rounded-2xl p-5 space-y-3 shadow-sm">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-purple-650" />
                <h3 className="font-extrabold text-gray-950 text-sm">LSTM (순환 신경망)</h3>
              </div>
              <p className="text-xs leading-relaxed text-gray-700 font-medium">
                셀 상태(Cell State)와 게이트 제어를 통해 계측 데이터의 장단기 시계열 패턴을 기억하는 딥러닝 아키텍처입니다. 굴착고 증가에 따른 누적 수위 하강 비선형성을 효과적으로 모델링합니다.
              </p>
              <div className="bg-white p-3 rounded-xl border border-purple-200 text-[11px] font-bold text-purple-900 leading-tight">
                <strong>고도화 방안 (Multivariate LSTM):</strong><br />
                수위 변화 이력에 최근 3일간 누적 강수 및 일일 굴착 속도 피처를 병렬 투입해 학습 효율을 높입니다.
              </div>
            </div>

            {/* Transformer 상세 */}
            <div className="bg-pink-50/60 border border-pink-200 rounded-2xl p-5 space-y-3 shadow-sm">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-pink-650" />
                <h3 className="font-extrabold text-gray-950 text-sm">Transformer (어텐션 딥러닝)</h3>
              </div>
              <p className="text-xs leading-relaxed text-gray-700 font-medium">
                Self-Attention 가중치 계산을 통해, 먼 시점의 굴착 활동이나 급격한 지반 거동 이벤트를 현재 및 미래 예측 시점에 직접 연결해 가중치를 부여하는 최첨단 모델입니다.
              </p>
              <div className="bg-white p-3 rounded-xl border border-pink-200 text-[11px] font-bold text-pink-900 leading-tight">
                <strong>고도화 방안 (Temporal Fusion):</strong><br />
                기온/강수 및 계절적 주기(주/월 단위) 마스킹 레이어를 융합하여 기상 이상 기후 시의 강하 방지력을 예측합니다.
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
