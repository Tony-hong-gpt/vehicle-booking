'use client';

import { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899'];

const PERIOD_OPTIONS = [
  { label: '주간', value: 'week' },
  { label: '월간', value: 'month' },
  { label: '연간', value: 'year' },
];

// 기간에 따라 다른 탭의 months 결정
const PERIOD_MONTHS: Record<string, number> = { week: 4, month: 6, year: 12 };

const TABS = [
  { key: 'overview',    label: '개요' },
  { key: 'monthly',     label: '신청/배차 현황' },
  { key: 'utilization', label: '차량 가동률' },
  { key: 'departments', label: '부서별 현황' },
  { key: 'purposes',    label: '목적/목적지 분석' },
];

function Loader() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-bold text-gray-600 mb-3">{children}</h2>;
}

// KPI 카드 — 전기간 대비 증감 표시
function KpiCard({
  label, value, unit = '', diff, color = 'text-gray-900', sub,
}: {
  label: string; value: number | string; unit?: string; diff?: number | null; color?: string; sub?: string;
}) {
  const diffColor = diff == null ? '' : diff > 0 ? 'text-blue-500' : diff < 0 ? 'text-red-400' : 'text-gray-400';
  const diffIcon  = diff == null ? '' : diff > 0 ? '▲' : diff < 0 ? '▼' : '─';
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-medium text-gray-400 mb-2">{label}</p>
      <div className="flex items-end gap-2">
        <span className={`text-3xl font-bold ${color}`}>{value}</span>
        {unit && <span className="text-lg font-semibold text-gray-400 mb-0.5">{unit}</span>}
      </div>
      {diff != null && (
        <p className={`text-xs mt-1.5 font-medium ${diffColor}`}>
          {diffIcon} 전기간 대비 {Math.abs(diff)}%
        </p>
      )}
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function StatCard({ label, value, color = 'text-gray-900', sub }: { label: string; value: number | string; color?: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-medium text-gray-400 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── 개요 탭 ───────────────────────────────────────────────────────
function OverviewTab({ period }: { period: string }) {
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats?type=overview&period=${period}`)
      .then(r => r.json()).then(j => { setData(j.data); setLoading(false); });
  }, [period]);

  if (loading) return <Loader />;
  if (!data)   return null;

  const { kpi, requests, dispatches, vehicles, time_series, period_label } = data;

  return (
    <div className="space-y-6">
      {/* KPI 4개 */}
      <div>
        <SectionTitle>{period_label} 핵심 지표</SectionTitle>
        <div className="grid grid-cols-4 gap-3">
          <KpiCard
            label="총 신청 건수"
            value={kpi.total_requests.value}
            diff={kpi.total_requests.diff}
            color="text-blue-600"
          />
          <KpiCard
            label="신청 승인율"
            value={kpi.approval_rate.value}
            unit="%"
            color={kpi.approval_rate.value >= 80 ? 'text-green-600' : 'text-orange-500'}
            sub="취소·반려 제외"
          />
          <KpiCard
            label="운행 완료"
            value={kpi.completed_trips.value}
            diff={kpi.completed_trips.diff}
            color="text-purple-600"
            unit="건"
          />
          <KpiCard
            label="차량 가동률"
            value={kpi.utilization_rate.value}
            unit="%"
            color={kpi.utilization_rate.value >= 60 ? 'text-green-600' : 'text-orange-500'}
            sub={`${vehicles.used}/${vehicles.total}대 운행`}
          />
        </div>
      </div>

      {/* 시계열 차트 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionTitle>
          {period === 'week' ? '요일별' : period === 'month' ? '주별' : '월별'} 신청·배차 추이
        </SectionTitle>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={time_series} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Bar dataKey="requests"   name="신청" fill="#3b82f6" radius={[4,4,0,0]} />
            <Bar dataKey="dispatches" name="배차" fill="#8b5cf6" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 신청·배차·차량 현황 */}
      <div className="grid grid-cols-3 gap-4">
        {/* 신청 현황 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>신청 현황</SectionTitle>
          <div className="space-y-3">
            {[
              { label: '총 신청',   value: requests.total,     color: 'bg-blue-500' },
              { label: '승인완료',  value: requests.approved,  color: 'bg-green-500' },
              { label: '처리 대기', value: requests.pending,   color: 'bg-orange-400' },
              { label: '취소',      value: requests.cancelled, color: 'bg-red-400' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${row.color}`} />
                  <span className="text-sm text-gray-600">{row.label}</span>
                </div>
                <span className="text-sm font-bold text-gray-800">{row.value}건</span>
              </div>
            ))}
          </div>
          {requests.total > 0 && (
            <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden flex">
              <div className="bg-green-400 h-full" style={{ width: `${(requests.approved / requests.total) * 100}%` }} />
              <div className="bg-orange-300 h-full" style={{ width: `${(requests.pending / requests.total) * 100}%` }} />
              <div className="bg-red-300 h-full" style={{ width: `${(requests.cancelled / requests.total) * 100}%` }} />
            </div>
          )}
        </div>

        {/* 배차 현황 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>배차 현황</SectionTitle>
          <div className="space-y-3">
            {[
              { label: '총 배차',   value: dispatches.total,       color: 'bg-blue-500' },
              { label: '반납완료',  value: dispatches.completed,   color: 'bg-green-500' },
              { label: '배차완료',  value: dispatches.scheduled,   color: 'bg-blue-400' },
              { label: '운행 중',   value: dispatches.in_progress, color: 'bg-purple-500' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${row.color}`} />
                  <span className="text-sm text-gray-600">{row.label}</span>
                </div>
                <span className="text-sm font-bold text-gray-800">{row.value}건</span>
              </div>
            ))}
          </div>
          {dispatches.total > 0 && (
            <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden flex">
              <div className="bg-green-400 h-full" style={{ width: `${(dispatches.completed / dispatches.total) * 100}%` }} />
              <div className="bg-blue-400 h-full" style={{ width: `${(dispatches.scheduled / dispatches.total) * 100}%` }} />
              <div className="bg-purple-400 h-full" style={{ width: `${(dispatches.in_progress / dispatches.total) * 100}%` }} />
            </div>
          )}
        </div>

        {/* 차량 운용 현황 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>차량 운용 현황</SectionTitle>
          <div className="flex items-center justify-center my-2">
            <div className="relative w-28 h-28">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f3f4f6" strokeWidth="3.5" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#3b82f6" strokeWidth="3.5"
                  strokeDasharray={`${kpi.utilization_rate.value} ${100 - kpi.utilization_rate.value}`}
                  strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-gray-900">{kpi.utilization_rate.value}%</span>
                <span className="text-xs text-gray-400">가동률</span>
              </div>
            </div>
          </div>
          <div className="space-y-2 mt-2">
            {[
              { label: '전체 차량',   value: `${vehicles.total}대`,  color: 'bg-gray-300' },
              { label: '운행한 차량', value: `${vehicles.used}대`,   color: 'bg-blue-500' },
              { label: '미운행 차량', value: `${vehicles.unused}대`, color: 'bg-gray-200' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${row.color}`} />
                  <span className="text-sm text-gray-600">{row.label}</span>
                </div>
                <span className="text-sm font-bold text-gray-800">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 월별 신청/배차 현황 탭 ─────────────────────────────────────────
function MonthlyTab({ period }: { period: string }) {
  const months = PERIOD_MONTHS[period];
  const [data, setData]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats?type=monthly&period=${period}&months=${months}`)
      .then(r => r.json()).then(j => { setData(j.data || []); setLoading(false); });
  }, [period, months]);

  if (loading) return <Loader />;

  const total     = data.reduce((s, d) => s + d.requests, 0);
  const approved  = data.reduce((s, d) => s + d.approved, 0);
  const cancelled = data.reduce((s, d) => s + d.cancelled, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="기간 내 총 신청" value={total}     color="text-blue-600" />
        <StatCard label="승인완료"         value={approved}  color="text-green-600" />
        <StatCard label="취소"             value={cancelled} color="text-red-400" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionTitle>월별 신청 건수 추이</SectionTitle>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Bar dataKey="requests"  name="총 신청"  fill="#3b82f6" radius={[4,4,0,0]} />
            <Bar dataKey="approved"  name="승인완료" fill="#10b981" radius={[4,4,0,0]} />
            <Bar dataKey="cancelled" name="취소"     fill="#f87171" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionTitle>월별 배차 건수 추이</SectionTitle>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="dispatches" name="배차 건수" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 차량 가동률 탭 ────────────────────────────────────────────────
function UtilizationTab({ period }: { period: string }) {
  const months = PERIOD_MONTHS[period];
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats?type=utilization&period=${period}&months=${months}`)
      .then(r => r.json()).then(j => { setData(j.data); setLoading(false); });
  }, [period, months]);

  if (loading) return <Loader />;
  if (!data)   return null;

  const { monthly, vehicles } = data;
  const avgRate = monthly.length > 0 ? Math.round(monthly.reduce((s: number, m: any) => s + m.rate, 0) / monthly.length) : 0;
  const maxUsed = Math.max(...vehicles.map((v: any) => v.count), 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="평균 가동률"  value={`${avgRate}%`}                                             color={avgRate >= 60 ? 'text-green-600' : 'text-orange-500'} />
        <StatCard label="운행 차량 수" value={vehicles.filter((v: any) => v.count > 0).length}          sub={`전체 ${vehicles.length}대`} />
        <StatCard label="미사용 차량"  value={vehicles.filter((v: any) => v.count === 0).length}        color="text-gray-400" sub="기간 내 운행 없음" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionTitle>월별 가동률 추이</SectionTitle>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v: any) => `${v}%`} />
            <Legend />
            <Line type="monotone" dataKey="rate" name="가동률" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionTitle>차량별 운행 건수 (기간 합계)</SectionTitle>
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {vehicles.map((v: any, i: number) => (
            <div key={v.id} className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-5 text-right">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-medium text-gray-800 truncate">{v.name}</span>
                  <span className="text-xs text-gray-400 font-mono ml-2 flex-shrink-0">{v.license_plate}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="h-2 rounded-full transition-all"
                      style={{ width: `${(v.count / maxUsed) * 100}%`, backgroundColor: v.count === 0 ? '#e5e7eb' : COLORS[i % COLORS.length] }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-600 w-8 text-right">{v.count}건</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 부서별 현황 탭 ────────────────────────────────────────────────
function DepartmentsTab({ period }: { period: string }) {
  const months = PERIOD_MONTHS[period];
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats?type=departments&period=${period}&months=${months}`)
      .then(r => r.json()).then(j => { setData(j.data); setLoading(false); });
  }, [period, months]);

  if (loading) return <Loader />;
  if (!data)   return null;

  const { ranking, monthly, top_depts } = data;
  const total = ranking.reduce((s: number, d: any) => s + d.count, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>부서별 운행 건수 순위</SectionTitle>
          <div className="space-y-2.5">
            {ranking.slice(0, 10).map((d: any, i: number) => (
              <div key={d.name} className="flex items-center gap-3">
                <span className={`text-xs font-bold w-5 text-center ${i < 3 ? 'text-blue-600' : 'text-gray-400'}`}>{i + 1}</span>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-sm font-medium text-gray-800">{d.name}</span>
                    <span className="text-xs text-gray-500">{d.count}건 ({total > 0 ? Math.round(d.count / total * 100) : 0}%)</span>
                  </div>
                  <div className="bg-gray-100 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full" style={{ width: `${ranking[0].count > 0 ? (d.count / ranking[0].count) * 100 : 0}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>부서별 비중</SectionTitle>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={ranking.slice(0, 8)} cx="50%" cy="45%" innerRadius={50} outerRadius={85} dataKey="count" nameKey="name" labelLine={false}>
                {ranking.slice(0, 8).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: any, name: any) => [`${v}건`, name]} />
              <Legend iconType="circle" iconSize={10} formatter={(value) => <span className="text-xs text-gray-600">{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionTitle>월별 부서 운행 추이 (상위 5개)</SectionTitle>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={monthly} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip />
            <Legend />
            {top_depts.slice(0, 5).map((dept: string, i: number) => (
              <Bar key={dept} dataKey={dept} name={dept} fill={COLORS[i % COLORS.length]} radius={[3,3,0,0]} stackId="a" />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 목적/목적지 분석 탭 ───────────────────────────────────────────
function PurposesTab({ period }: { period: string }) {
  const months = PERIOD_MONTHS[period];
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats?type=purposes&period=${period}&months=${months}`)
      .then(r => r.json()).then(j => { setData(j.data); setLoading(false); });
  }, [period, months]);

  if (loading) return <Loader />;
  if (!data)   return null;

  const { purposes, destinations, by_day, monthly } = data;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>사용목적별 비중</SectionTitle>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={purposes} cx="50%" cy="42%" innerRadius={55} outerRadius={85} dataKey="count" nameKey="name" labelLine={false}>
                {purposes.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: any, n: any) => [`${v}건`, n]} />
              <Legend iconType="circle" iconSize={10} formatter={(value) => <span className="text-xs text-gray-600">{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>요일별 출발 건수</SectionTitle>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={by_day}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 13 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="출발 건수" radius={[5,5,0,0]}>
                {by_day.map((_: any, i: number) => <Cell key={i} fill={i === 0 || i === 6 ? '#ef4444' : '#3b82f6'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionTitle>주요 목적지 TOP 10</SectionTitle>
        {destinations.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">데이터가 없습니다</p>
        ) : (
          <div className="space-y-2">
            {destinations.map((d: any, i: number) => (
              <div key={d.name} className="flex items-center gap-3">
                <span className={`text-xs font-bold w-5 text-center ${i < 3 ? 'text-blue-600' : 'text-gray-400'}`}>{i + 1}</span>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-sm text-gray-800 truncate">{d.name}</span>
                    <span className="text-xs text-gray-500 flex-shrink-0 ml-2">{d.count}건</span>
                  </div>
                  <div className="bg-gray-100 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-blue-400" style={{ width: `${(d.count / destinations[0].count) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionTitle>월별 운행 건수 추이</SectionTitle>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="count" name="운행 건수" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────
export default function StatisticsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [period, setPeriod]       = useState('month');

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">통계</h1>
          <p className="text-gray-500 mt-1 text-sm">차량 운영 현황을 분석합니다</p>
        </div>
        {/* 기간 선택 */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {PERIOD_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setPeriod(opt.value)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                period === opt.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview'    && <OverviewTab    period={period} />}
      {activeTab === 'monthly'     && <MonthlyTab     period={period} />}
      {activeTab === 'utilization' && <UtilizationTab period={period} />}
      {activeTab === 'departments' && <DepartmentsTab period={period} />}
      {activeTab === 'purposes'    && <PurposesTab    period={period} />}
    </div>
  );
}
