'use client';

import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

type Period = 'month' | 'quarter' | 'year';

function getPeriodRange(period: Period): { from: string; to: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  if (period === 'month') {
    const from = new Date(y, m, 1);
    const to   = new Date(y, m + 1, 0);
    return {
      from: from.toISOString().slice(0, 10),
      to:   to.toISOString().slice(0, 10),
      label: `${y}년 ${m + 1}월`,
    };
  }
  if (period === 'quarter') {
    const q = Math.floor(m / 3);
    const from = new Date(y, q * 3, 1);
    const to   = new Date(y, q * 3 + 3, 0);
    return {
      from: from.toISOString().slice(0, 10),
      to:   to.toISOString().slice(0, 10),
      label: `${y}년 ${q + 1}분기`,
    };
  }
  return {
    from: `${y}-01-01`,
    to:   `${y}-12-31`,
    label: `${y}년`,
  };
}

const PERIOD_TABS: { key: Period; label: string }[] = [
  { key: 'month',   label: '이번달' },
  { key: 'quarter', label: '이번분기' },
  { key: 'year',    label: '올해' },
];

const COLORS = ['#7C3AED', '#A78BFA', '#C4B5FD', '#DDD6FE', '#EDE9FE'];

export default function CommitteeStatsPage() {
  const [period, setPeriod]         = useState<Period>('month');
  const [overview, setOverview]     = useState<any>(null);
  const [chartSeries, setChartSeries] = useState<any[]>([]);
  const [deptRanking, setDeptRanking] = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);

  const range = useMemo(() => getPeriodRange(period), [period]);

  useEffect(() => {
    setLoading(true);
    const params = `from=${range.from}&to=${range.to}`;
    const y = new Date().getFullYear();
    const monthlyParams = `from=${y}-01-01&to=${y}-12-31`;

    Promise.all([
      fetch(`/api/stats?type=overview&${params}`).then(r => r.json()),
      fetch(`/api/stats?type=monthly&${monthlyParams}`).then(r => r.json()),
      fetch(`/api/stats?type=departments&${params}`).then(r => r.json()),
    ]).then(([ov, mo, dp]) => {
      setOverview(ov.data ?? null);
      setChartSeries((mo.data?.monthly ?? []).slice(-6));
      setDeptRanking(dp.data?.ranking ?? []);
    }).finally(() => setLoading(false));
  }, [range]);

  // 데이터 추출
  const req  = overview?.requests;
  const disp = overview?.dispatches;
  const veh  = overview?.vehicles;

  const totalReqs     = req?.total     ?? 0;
  const approvedReqs  = req?.approved  ?? 0;
  const rejectedReqs  = req?.rejected  ?? 0;
  const cancelledReqs = req?.cancelled ?? 0;
  const pendingReqs   = req?.pending   ?? 0;
  const dispTotal     = disp?.total    ?? 0;

  const approvalRate = totalReqs > 0 ? Math.round((approvedReqs / totalReqs) * 100) : 0;

  const kpis = [
    { label: '총 신청',   value: totalReqs,    color: 'text-purple-600', bg: 'bg-purple-50', icon: '📋' },
    { label: '승인 완료', value: approvedReqs, color: 'text-green-600',  bg: 'bg-green-50',  icon: '✅' },
    { label: '반려',      value: rejectedReqs, color: 'text-red-500',    bg: 'bg-red-50',    icon: '❌' },
    { label: '배차 완료', value: dispTotal,    color: 'text-blue-600',   bg: 'bg-blue-50',   icon: '🚗' },
  ];

  // 월별 차트 데이터
  const chartData = chartSeries.map((s: any) => ({
    name: s.month,
    신청: s.requests  ?? 0,
    배차: s.dispatches ?? 0,
  }));

  // 부서 TOP 5
  const deptList = deptRanking.slice(0, 5);
  const maxDeptCount = deptList[0]?.count ?? 1;

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
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-0 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-900 mb-3">통계</h1>
        <div className="flex gap-1">
          {PERIOD_TABS.map(t => (
            <button key={t.key} onClick={() => setPeriod(t.key)}
              className={`flex-1 py-2 text-sm font-semibold border-b-2 transition-colors ${
                period === t.key
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-400'
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

        {/* KPI 카드 2×2 */}
        <div className="grid grid-cols-2 gap-3">
          {kpis.map(k => (
            <div key={k.label} className={`${k.bg} rounded-2xl p-4`}>
              <span className="text-lg">{k.icon}</span>
              <p className={`text-3xl font-bold mt-2 ${k.color}`}>{k.value.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1 font-medium">{k.label}</p>
            </div>
          ))}
        </div>

        {/* 데이터 없음 안내 */}
        {overview && totalReqs === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-sm font-semibold text-gray-600 mb-1">{range.label} 신청 내역 없음</p>
            <p className="text-xs text-gray-400">해당 기간에 차량 신청이 없습니다</p>
          </div>
        )}

        {/* 승인률 */}
        {totalReqs > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">승인률</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                <div
                  className="h-3 rounded-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all duration-700"
                  style={{ width: `${approvalRate}%` }}
                />
              </div>
              <span className="text-sm font-bold text-purple-600 w-12 text-right">{approvalRate}%</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-purple-500" />
                <span className="text-[10px] text-gray-500">승인 {approvedReqs}건</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-[10px] text-gray-500">반려 {rejectedReqs}건</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-orange-300" />
                <span className="text-[10px] text-gray-500">취소 {cancelledReqs}건</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-gray-300" />
                <span className="text-[10px] text-gray-500">대기 {pendingReqs}건</span>
              </div>
            </div>
          </div>
        )}

        {/* 월별 신청 추이 (최근 6개월, 올해 기준) */}
        {chartData.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">월별 신청 추이 (최근 6개월)</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} barGap={4} barCategoryGap="30%">
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }}
                  cursor={{ fill: '#F3F4F6' }}
                />
                <Bar dataKey="신청" fill="#7C3AED" radius={[4, 4, 0, 0]} />
                <Bar dataKey="배차" fill="#C4B5FD" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 justify-center mt-2">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2 rounded-sm bg-purple-600" />
                <span className="text-[10px] text-gray-500">신청</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2 rounded-sm bg-purple-300" />
                <span className="text-[10px] text-gray-500">배차</span>
              </div>
            </div>
          </div>
        )}

        {/* 부서별 신청 현황 TOP 5 */}
        {deptList.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">부서별 신청 현황 TOP 5</p>
            <div className="space-y-3">
              {deptList.map((dept: any, i: number) => (
                <div key={dept.name ?? i}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center text-white flex-shrink-0 ${
                        i === 0 ? 'bg-purple-600' : i === 1 ? 'bg-purple-400' : 'bg-gray-300'
                      }`}>{i + 1}</span>
                      <span className="text-sm font-medium text-gray-800 truncate max-w-[140px]">
                        {dept.name || '미분류'}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-gray-700 flex-shrink-0">{dept.count}건</span>
                  </div>
                  <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-1.5 rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.round((dept.count / maxDeptCount) * 100)}%`,
                        backgroundColor: COLORS[i] || COLORS[4],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 차량 현재 상태 */}
        {veh && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">차량 현재 상태</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: '사용 가능', value: veh.available   ?? 0, color: 'text-green-600',  bg: 'bg-green-50' },
                { label: '운행 중',   value: veh.in_use      ?? 0, color: 'text-blue-600',   bg: 'bg-blue-50' },
                { label: '정비 중',   value: veh.maintenance ?? 0, color: 'text-orange-600', bg: 'bg-orange-50' },
                { label: '전체',      value: veh.total       ?? 0, color: 'text-gray-700',   bg: 'bg-gray-50' },
              ].map(s => (
                <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
