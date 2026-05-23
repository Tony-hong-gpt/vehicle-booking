'use client';

import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

type Period = 'month' | 'quarter' | 'year';

// toISOString()은 UTC 변환으로 KST(+9)에서 날짜가 하루 밀리는 문제가 있으므로
// 로컬 날짜를 직접 포맷하는 함수를 사용한다
function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getPeriodRange(period: Period): { from: string; to: string; label: string; granularity: string; chartLabel: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  if (period === 'month') {
    const from = new Date(y, m, 1);
    const to   = new Date(y, m + 1, 0);
    return { from: fmtDate(from), to: fmtDate(to),
      label: `${y}년 ${m + 1}월`, granularity: 'week', chartLabel: '주차별 신청 및 배차 추이' };
  }
  if (period === 'quarter') {
    const q = Math.floor(m / 3);
    const from = new Date(y, q * 3, 1);
    const to   = new Date(y, q * 3 + 3, 0);
    return { from: fmtDate(from), to: fmtDate(to),
      label: `${y}년 ${q + 1}분기`, granularity: 'month', chartLabel: '월별 신청 및 배차 추이' };
  }
  return { from: `${y}-01-01`, to: `${y}-12-31`,
    label: `${y}년`, granularity: 'month', chartLabel: '월별 신청 및 배차 추이' };
}

const PERIOD_TABS: { key: Period; label: string }[] = [
  { key: 'month',   label: '이번달' },
  { key: 'quarter', label: '이번분기' },
  { key: 'year',    label: '올해' },
];

const COLORS = ['#7C3AED', '#A78BFA', '#C4B5FD', '#DDD6FE', '#EDE9FE'];

function DiffBadge({ diff }: { diff: number | null }) {
  if (diff === null) return null;
  if (diff === 0) return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">─</span>;
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
      diff > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
    }`}>
      {diff > 0 ? '▲' : '▼'}{Math.abs(diff)}%
    </span>
  );
}

function EmptyCard({ icon = '📭', message = '데이터 없음', sub = '' }: { icon?: string; message?: string; sub?: string }) {
  return (
    <div className="py-8 flex flex-col items-center justify-center text-center">
      <p className="text-3xl mb-2">{icon}</p>
      <p className="text-sm font-semibold text-gray-500 mb-0.5">{message}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}분`;
  if (h < 24) return `${Math.round(h)}시간`;
  const days = Math.floor(h / 24);
  const hrs  = Math.round(h % 24);
  return hrs > 0 ? `${days}일 ${hrs}시간` : `${days}일`;
}

const STEP_LABEL: Record<number, string> = { 3: '총무', 4: '부위원장', 5: '위원장' };

export default function CommitteeStatsPage() {
  const [period, setPeriod]           = useState<Period>('month');
  const [overview, setOverview]       = useState<any>(null);
  const [vehicleGroups, setVehicleGroups] = useState<any>(null);
  const [deptRanking, setDeptRanking] = useState<any[]>([]);
  const [processors, setProcessors]   = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadedAt, setLoadedAt]       = useState<Date | null>(null);

  const range = useMemo(() => getPeriodRange(period), [period]);

  useEffect(() => {
    setLoading(true);
    const p = `from=${range.from}&to=${range.to}`;

    Promise.all([
      fetch(`/api/stats?type=overview&${p}&granularity=${range.granularity}`).then(r => r.json()),
      fetch(`/api/stats?type=vehicle_groups&${p}`).then(r => r.json()),
      fetch(`/api/stats?type=departments&${p}`).then(r => r.json()),
      fetch(`/api/stats?type=processors&${p}`).then(r => r.json()),
    ]).then(([ov, vg, dp, pr]) => {
      setOverview(ov.data ?? null);
      setVehicleGroups(vg.data ?? null);
      setDeptRanking(dp.data?.ranking ?? []);
      setProcessors(pr.data?.processors ?? []);
      setLoadedAt(new Date());
    }).finally(() => setLoading(false));
  }, [range]);

  // 데이터 추출
  const req = overview?.requests;
  const veh = overview?.vehicles;

  const totalReqs     = req?.total    ?? 0;
  const approvedReqs  = req?.approved ?? 0;  // 신청일 기준: approved+dispatched+in_use+returned
  const rejectedReqs  = req?.rejected ?? 0;
  const cancelledReqs = req?.cancelled ?? 0;
  const pendingReqs   = req?.pending  ?? 0;
  const onHoldReqs    = req?.on_hold  ?? 0;
  const approvalRate  = totalReqs > 0 ? Math.round((approvedReqs / totalReqs) * 100) : 0;
  const avgProcessHours: number | null = overview?.avg_process_hours ?? null;
  const procDist = overview?.process_distribution ?? null;

  const bottomKpis = [
    { label: '승인 완료', value: approvedReqs,  color: 'text-green-600',  bg: 'bg-green-50',  diff: req?.diffs?.approved ?? null },
    { label: '보류',      value: onHoldReqs,    color: 'text-amber-600',  bg: 'bg-amber-50',  diff: null },
    { label: '반려',      value: rejectedReqs,  color: 'text-red-500',    bg: 'bg-red-50',    diff: req?.diffs?.rejected ?? null },
    { label: '취소',      value: cancelledReqs, color: 'text-orange-500', bg: 'bg-orange-50', diff: null },
  ];

  // 차트 데이터 (time_series from overview)
  const chartData = (overview?.time_series ?? []).map((s: any) => ({
    name: s.label,
    신청: s.requests  ?? 0,
    배차: s.dispatches ?? 0,
  }));

  // 부서 TOP5
  const deptList = deptRanking.slice(0, 5);
  const maxDeptCount = deptList[0]?.count ?? 1;

  // 차량군
  const groupList = vehicleGroups?.groups ?? [];
  const maxGroupCount = groupList[0]?.count ?? 1;

  // 담당자 정렬: 위원장(step5) → 부위원장(step4) → 총무(step3)
  const sortedProcessors = [...processors].sort((a: any, b: any) => b.step - a.step || b.count - a.count);

  // 실시간 기준 시각 표시용
  const loadedAtStr = loadedAt
    ? `${String(loadedAt.getHours()).padStart(2, '0')}:${String(loadedAt.getMinutes()).padStart(2, '0')}`
    : '';

  if (loading) return (
    <div className="flex flex-col min-h-full pb-28">
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-900">통계</h1>
      </div>
      <div className="flex items-center justify-center flex-1">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">통계 불러오는 중...</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full pb-28 bg-gray-50">
      {/* 헤더 + 기간 탭 */}
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-0 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-900 mb-3">통계</h1>
        <div className="flex gap-1">
          {PERIOD_TABS.map(t => (
            <button key={t.key} onClick={() => setPeriod(t.key)}
              className={`flex-1 py-2 text-sm font-semibold border-b-2 transition-colors ${
                period === t.key ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-400'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 py-4 space-y-4">

        {/* 기간 표시 */}
        <p className="text-xs text-gray-400 font-medium px-1">
          📅 {range.from} ~ {range.to} · {range.label}
        </p>

        {/* KPI 카드 — 상단 2개 (전체 요약) */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-purple-50 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-gray-500 font-medium">총 신청</p>
              <DiffBadge diff={req?.diffs?.total ?? null} />
            </div>
            <p className="text-3xl font-bold text-purple-600">{totalReqs.toLocaleString()}</p>
          </div>
          <div className="bg-indigo-50 rounded-2xl p-4">
            <p className="text-xs text-gray-500 font-medium mb-1.5">승인률</p>
            <p className="text-3xl font-bold text-indigo-600">{approvalRate}<span className="text-base font-medium ml-0.5">%</span></p>
          </div>
        </div>

        {/* KPI 카드 — 하단 4개 한 줄 (상세 내역) */}
        <div className="grid grid-cols-4 gap-2">
          {bottomKpis.map(k => (
            <div key={k.label} className={`${k.bg} rounded-2xl p-3 flex flex-col items-center text-center`}>
              <p className="text-[10px] text-gray-500 font-medium mb-1 whitespace-nowrap">{k.label}</p>
              <p className={`text-xl font-bold ${k.color}`}>{k.value.toLocaleString()}</p>
              <DiffBadge diff={k.diff} />
            </div>
          ))}
        </div>

        {/* 데이터 없음 */}
        {totalReqs === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <EmptyCard icon="📭" message={`${range.label} 신청 내역 없음`} sub="해당 기간에 차량 신청이 없습니다" />
          </div>
        )}

        {/* 처리 소요시간 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">처리 소요시간</p>
          {avgProcessHours !== null ? (
            <>
              <div className="flex items-end gap-2 mb-3">
                <p className="text-2xl font-bold text-purple-600">{formatHours(avgProcessHours)}</p>
                <p className="text-xs text-gray-400 mb-1">평균 (신청 → 최종 승인)</p>
              </div>
              {procDist && (procDist.fast + procDist.mid + procDist.slow) > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: '빠름',  sub: '1일 미만', value: procDist.fast, color: 'text-green-600',  bg: 'bg-green-50' },
                    { label: '보통',  sub: '1~3일',    value: procDist.mid,  color: 'text-blue-600',   bg: 'bg-blue-50' },
                    { label: '느림',  sub: '3일 이상', value: procDist.slow, color: 'text-orange-600', bg: 'bg-orange-50' },
                  ].map(s => (
                    <div key={s.label} className={`${s.bg} rounded-xl p-2.5 text-center`}>
                      <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-[10px] text-gray-500 font-medium">{s.label}</p>
                      <p className="text-[9px] text-gray-400">{s.sub}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <EmptyCard icon="⏱️" message="처리된 건수 없음" sub="최종 승인된 신청이 없습니다" />
          )}
        </div>

        {/* 승인률 */}
        {totalReqs > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">승인률</p>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                <div className="h-3 rounded-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all duration-700"
                  style={{ width: `${approvalRate}%` }} />
              </div>
              <span className="text-sm font-bold text-purple-600 w-12 text-right">{approvalRate}%</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {[
                { dot: 'bg-purple-500', text: `승인 ${approvedReqs}건` },
                { dot: 'bg-red-400',    text: `반려 ${rejectedReqs}건` },
                { dot: 'bg-orange-300', text: `취소 ${cancelledReqs}건` },
                { dot: 'bg-gray-300',   text: `미결 ${pendingReqs + onHoldReqs}건` },
              ].map(s => (
                <div key={s.text} className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${s.dot}`} />
                  <span className="text-[10px] text-gray-500">{s.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 신청 추이 차트 (기간 연동) */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">{range.chartLabel}</p>
          {chartData.length > 0 && chartData.some((d: any) => d.신청 > 0 || d.배차 > 0) ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} barGap={4} barCategoryGap="30%">
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }} cursor={{ fill: '#F3F4F6' }} />
                  <Bar dataKey="신청" fill="#7C3AED" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="배차" fill="#C4B5FD" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 justify-center mt-2">
                <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-purple-600" /><span className="text-[10px] text-gray-500">신청</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-purple-300" /><span className="text-[10px] text-gray-500">배차</span></div>
              </div>
            </>
          ) : (
            <EmptyCard icon="📊" message="차트 데이터 없음" sub="해당 기간 신청 내역이 없습니다" />
          )}
        </div>

        {/* 차량군별 배차 현황 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">차량군별 배차 현황</p>
          {groupList.length > 0 ? (
            <div className="space-y-3">
              {groupList.map((g: any, i: number) => (
                <div key={g.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center text-white flex-shrink-0 ${
                        i === 0 ? 'bg-purple-600' : i === 1 ? 'bg-purple-400' : 'bg-gray-300'
                      }`}>{i + 1}</span>
                      <span className="text-sm font-medium text-gray-800">{g.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400">{g.percent}%</span>
                      <span className="text-sm font-bold text-gray-700">{g.count}회</span>
                    </div>
                  </div>
                  <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div className="h-1.5 rounded-full transition-all duration-700"
                      style={{ width: `${Math.round((g.count / maxGroupCount) * 100)}%`, backgroundColor: COLORS[i] || COLORS[4] }} />
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-gray-400 text-right pt-1">총 {vehicleGroups?.total ?? 0}회 배차</p>
            </div>
          ) : (
            <EmptyCard icon="🚌" message="배차 내역 없음" sub="해당 기간 배차된 차량이 없습니다" />
          )}
        </div>

        {/* 부서별 TOP5 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">부서별 신청 현황 TOP 5</p>
          {deptList.length > 0 ? (
            <div className="space-y-3">
              {deptList.map((dept: any, i: number) => (
                <div key={dept.name ?? i}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center text-white flex-shrink-0 ${
                        i === 0 ? 'bg-purple-600' : i === 1 ? 'bg-purple-400' : 'bg-gray-300'
                      }`}>{i + 1}</span>
                      <span className="text-sm font-medium text-gray-800 truncate max-w-[140px]">{dept.name || '미분류'}</span>
                    </div>
                    <span className="text-sm font-bold text-gray-700 flex-shrink-0">{dept.count}건</span>
                  </div>
                  <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div className="h-1.5 rounded-full transition-all duration-700"
                      style={{ width: `${Math.round((dept.count / maxDeptCount) * 100)}%`, backgroundColor: COLORS[i] || COLORS[4] }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyCard icon="🏢" message="부서 데이터 없음" sub="해당 기간 신청 내역이 없습니다" />
          )}
        </div>

        {/* 담당자별 처리 현황 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">담당자별 처리 현황</p>
          {sortedProcessors.length > 0 ? (
            <div className="space-y-3">
              {sortedProcessors.map((p: any) => (
                <div key={p.id} className="flex items-center gap-3 py-2.5 px-3 bg-gray-50 rounded-xl">
                  {/* 역할 배지 */}
                  <div className={`flex-shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold ${
                    p.step === 3 ? 'bg-blue-100 text-blue-700' :
                    p.step === 4 ? 'bg-violet-100 text-violet-700' :
                    'bg-purple-100 text-purple-700'
                  }`}>
                    {STEP_LABEL[p.step] || '-'}
                  </div>
                  {/* 이름 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                    {p.avg_hours !== null && (
                      <p className="text-[10px] text-gray-400 mt-0.5">평균 {formatHours(p.avg_hours)}</p>
                    )}
                  </div>
                  {/* 처리 건수 */}
                  <div className="flex-shrink-0 text-right">
                    <p className="text-lg font-bold text-gray-800">{p.count}</p>
                    <p className="text-[10px] text-gray-400">건</p>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <span className="text-xs text-gray-500">총 처리 건수</span>
                <span className="text-sm font-bold text-purple-600">
                  {sortedProcessors.reduce((s: number, p: any) => s + p.count, 0)}건
                </span>
              </div>
            </div>
          ) : (
            <EmptyCard icon="👤" message="처리 내역 없음" sub="해당 기간 위원회 처리 내역이 없습니다" />
          )}
        </div>

        {/* 차량 현재 상태 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          {/* 헤더 + 실시간 배지 */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">차량 현재 상태</p>
            <div className="flex items-center gap-2">
              {loadedAtStr && (
                <span className="text-[9px] text-gray-400">{loadedAtStr} 기준</span>
              )}
              <span className="flex items-center gap-1 text-[9px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                실시간
              </span>
            </div>
          </div>

          {veh ? (
            <>
              {/* 전체 (풀 너비) + 비례 컬러 바 */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-gray-500 font-medium">전체</span>
                  <span className="text-xl font-bold text-gray-900">{veh.total ?? 0}대</span>
                </div>
                {(veh.total ?? 0) > 0 && (
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden flex">
                    <div className="h-full bg-green-400"
                      style={{ width: `${((veh.available ?? 0) / veh.total) * 100}%` }} />
                    <div className="h-full bg-blue-400"
                      style={{ width: `${((veh.booked ?? 0) / veh.total) * 100}%` }} />
                    <div className="h-full bg-indigo-500"
                      style={{ width: `${((veh.in_use ?? 0) / veh.total) * 100}%` }} />
                    <div className="h-full bg-orange-400"
                      style={{ width: `${((veh.maintenance ?? 0) / veh.total) * 100}%` }} />
                  </div>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                  {[
                    { color: 'bg-green-400',  label: '사용가능' },
                    { color: 'bg-blue-400',   label: '배차완료' },
                    { color: 'bg-indigo-500', label: '운행중' },
                    { color: 'bg-orange-400', label: '정비중' },
                  ].map(l => (
                    <div key={l.label} className="flex items-center gap-1">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${l.color}`} />
                      <span className="text-[9px] text-gray-400">{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2×2 그리드 */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{veh.available ?? 0}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">사용 가능</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-blue-600">{veh.booked ?? 0}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">배차 완료</p>
                </div>
                <div className="bg-indigo-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-indigo-600">{veh.in_use ?? 0}</p>
                  <div className="flex items-center justify-center gap-1 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                    <p className="text-[10px] text-gray-500">운행 중</p>
                  </div>
                </div>
                <div className="bg-orange-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-orange-600">{veh.maintenance ?? 0}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">정비 중</p>
                </div>
              </div>
            </>
          ) : (
            <EmptyCard icon="🚗" message="차량 정보 없음" />
          )}
        </div>

      </div>
    </div>
  );
}
