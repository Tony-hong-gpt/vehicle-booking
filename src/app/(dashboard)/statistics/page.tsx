'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import * as XLSX from 'xlsx';

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899'];

// ── 기간 상태 타입 ────────────────────────────────────────────────────
type PeriodMode = 'week' | 'month' | 'year';

interface PeriodState {
  mode: PeriodMode;
  value: string; // week: "2026-W20", month: "2026-05", year: "2026"
}

function getDefaultPeriod(): PeriodState {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = String(now.getMonth() + 1).padStart(2, '0');
  return { mode: 'month', value: `${y}-${m}` };
}

/** 기간 → { from, to, granularity } 변환 */
function periodToRange(p: PeriodState): { from: string; to: string; granularity: string } {
  if (p.mode === 'week') {
    // "2026-W20" → Mon~Sun
    const [yearStr, weekStr] = p.value.split('-W');
    const year = parseInt(yearStr);
    const week = parseInt(weekStr);
    // ISO week → date
    const jan4 = new Date(year, 0, 4);
    const dayOfWeek = jan4.getDay() || 7;
    const weekOne = new Date(jan4.getTime() - (dayOfWeek - 1) * 86400000);
    const from = new Date(weekOne.getTime() + (week - 1) * 7 * 86400000);
    const to   = new Date(from.getTime() + 6 * 86400000);
    return {
      from: formatDate(from),
      to:   formatDate(to),
      granularity: 'day',
    };
  }
  if (p.mode === 'month') {
    const [y, m] = p.value.split('-').map(Number);
    const from = new Date(y, m - 1, 1);
    const to   = new Date(y, m, 0); // last day of month
    return { from: formatDate(from), to: formatDate(to), granularity: 'week' };
  }
  // year
  const y = parseInt(p.value);
  return { from: `${y}-01-01`, to: `${y}-12-31`, granularity: 'month' };
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function periodLabel(p: PeriodState): string {
  if (p.mode === 'week') {
    const [y, w] = p.value.split('-W');
    return `${y}년 ${w}주차`;
  }
  if (p.mode === 'month') {
    const [y, m] = p.value.split('-');
    return `${y}년 ${parseInt(m)}월`;
  }
  return `${p.value}년`;
}

function prevPeriod(p: PeriodState): PeriodState {
  if (p.mode === 'week') {
    const [y, w] = p.value.split('-W').map(Number);
    if (w === 1) return { mode: 'week', value: `${y - 1}-W52` };
    return { mode: 'week', value: `${y}-W${String(w - 1).padStart(2, '0')}` };
  }
  if (p.mode === 'month') {
    const [y, m] = p.value.split('-').map(Number);
    if (m === 1) return { mode: 'month', value: `${y - 1}-12` };
    return { mode: 'month', value: `${y}-${String(m - 1).padStart(2, '0')}` };
  }
  return { mode: 'year', value: String(parseInt(p.value) - 1) };
}

function nextPeriod(p: PeriodState): PeriodState {
  if (p.mode === 'week') {
    const [y, w] = p.value.split('-W').map(Number);
    if (w >= 52) return { mode: 'week', value: `${y + 1}-W01` };
    return { mode: 'week', value: `${y}-W${String(w + 1).padStart(2, '0')}` };
  }
  if (p.mode === 'month') {
    const [y, m] = p.value.split('-').map(Number);
    if (m === 12) return { mode: 'month', value: `${y + 1}-01` };
    return { mode: 'month', value: `${y}-${String(m + 1).padStart(2, '0')}` };
  }
  return { mode: 'year', value: String(parseInt(p.value) + 1) };
}

// ── 공통 컴포넌트 ──────────────────────────────────────────────────────
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

function KpiCard({ label, value, unit = '', diff, color = 'text-gray-900', sub }: {
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

function StatCard({ label, value, color = 'text-gray-900', sub }: {
  label: string; value: number | string; color?: string; sub?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-medium text-gray-400 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function DownloadBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition-colors">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z" />
      </svg>
      엑셀 다운로드
    </button>
  );
}

// ── 기간 선택 컴포넌트 ──────────────────────────────────────────────────
function PeriodSelector({ period, onChange }: { period: PeriodState; onChange: (p: PeriodState) => void }) {
  const modes: { label: string; value: PeriodMode }[] = [
    { label: '주간', value: 'week' },
    { label: '월간', value: 'month' },
    { label: '연간', value: 'year' },
  ];

  function handleModeChange(mode: PeriodMode) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const defaultValues: Record<PeriodMode, string> = {
      week:  getISOWeekString(now),
      month: `${y}-${m}`,
      year:  String(y),
    };
    onChange({ mode, value: defaultValues[mode] });
  }

  function getISOWeekString(date: Date): string {
    const tmp = new Date(date.valueOf());
    tmp.setHours(0, 0, 0, 0);
    tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
    const week1 = new Date(tmp.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
    return `${tmp.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }

  const yearOptions = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - 2 + i));

  return (
    <div className="flex items-center gap-3">
      {/* 모드 선택 */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
        {modes.map(m => (
          <button key={m.value} onClick={() => handleModeChange(m.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              period.mode === m.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {m.label}
          </button>
        ))}
      </div>

      {/* 이전 버튼 */}
      <button onClick={() => onChange(prevPeriod(period))}
        className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* 날짜 입력 */}
      {period.mode === 'week' && (
        <input type="week" value={period.value}
          onChange={e => e.target.value && onChange({ mode: 'week', value: e.target.value })}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
      )}
      {period.mode === 'month' && (
        <input type="month" value={period.value}
          onChange={e => e.target.value && onChange({ mode: 'month', value: e.target.value })}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
      )}
      {period.mode === 'year' && (
        <select value={period.value} onChange={e => onChange({ mode: 'year', value: e.target.value })}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          {yearOptions.map(y => <option key={y} value={y}>{y}년</option>)}
        </select>
      )}

      {/* 다음 버튼 */}
      <button onClick={() => onChange(nextPeriod(period))}
        className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <span className="text-sm font-semibold text-gray-700 min-w-[100px]">{periodLabel(period)}</span>
    </div>
  );
}

// ── 개요 탭 ───────────────────────────────────────────────────────────
function OverviewTab({ period }: { period: PeriodState }) {
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const { from, to, granularity } = periodToRange(period);
    fetch(`/api/stats?type=overview&from=${from}&to=${to}&granularity=${granularity}`)
      .then(r => r.json()).then(j => { setData(j.data); setLoading(false); });
  }, [period]);

  if (loading) return <Loader />;
  if (!data)   return null;

  const { kpi, requests, dispatches, vehicles, time_series, top_depts, top_purposes } = data;
  const totalDept = top_depts.reduce((s: number, d: any) => s + d.count, 0);
  const totalPurpose = top_purposes.reduce((s: number, d: any) => s + d.count, 0);

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div>
        <SectionTitle>핵심 지표</SectionTitle>
        <div className="grid grid-cols-4 gap-3">
          <KpiCard label="총 신청 건수"   value={kpi.total_requests.value}   diff={kpi.total_requests.diff}   color="text-blue-600" />
          <KpiCard label="신청 승인율"    value={kpi.approval_rate.value}    unit="%" sub="취소·반려 제외"
            color={kpi.approval_rate.value >= 80 ? 'text-green-600' : 'text-orange-500'} />
          <KpiCard label="운행 완료"      value={kpi.completed_trips.value}  diff={kpi.completed_trips.diff}  unit="건" color="text-purple-600" />
          <KpiCard label="차량 가동률"    value={kpi.utilization_rate.value} unit="%" sub={`${vehicles.used}/${vehicles.total}대 운행`}
            color={kpi.utilization_rate.value >= 60 ? 'text-green-600' : 'text-orange-500'} />
        </div>
      </div>

      {/* 시계열 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionTitle>
          {period.mode === 'week' ? '요일별' : period.mode === 'month' ? '주별' : '월별'} 신청·배차 추이
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

        {/* 배차 현황 (운행중 제외) */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>배차 현황</SectionTitle>
          <div className="space-y-3">
            {[
              { label: '총 배차',   value: dispatches.total,     color: 'bg-blue-500' },
              { label: '반납완료',  value: dispatches.completed, color: 'bg-green-500' },
              { label: '배차완료',  value: dispatches.scheduled, color: 'bg-blue-400' },
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
              { label: '전체 차량',   value: `${vehicles.total}대`, color: 'bg-gray-300' },
              { label: '운행한 차량', value: `${vehicles.used}대`,  color: 'bg-blue-500' },
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

      {/* 부서별 + 사용목적 요약 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 부서 TOP 5 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <SectionTitle>부서별 운행 현황 (상위 5개)</SectionTitle>
          </div>
          {top_depts.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">데이터가 없습니다</p>
          ) : (
            <div className="space-y-3">
              {top_depts.map((d: any, i: number) => (
                <div key={d.name} className="flex items-center gap-3">
                  <span className={`text-xs font-bold w-4 ${i < 3 ? 'text-blue-600' : 'text-gray-400'}`}>{i + 1}</span>
                  <div className="flex-1">
                    <div className="flex justify-between mb-0.5">
                      <span className="text-sm font-medium text-gray-800">{d.name}</span>
                      <span className="text-xs text-gray-500">{d.count}건 ({totalDept > 0 ? Math.round(d.count / totalDept * 100) : 0}%)</span>
                    </div>
                    <div className="bg-gray-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{ width: `${top_depts[0].count > 0 ? (d.count / top_depts[0].count) * 100 : 0}%`, backgroundColor: COLORS[i] }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 사용목적 TOP 5 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>사용목적별 운행 현황 (상위 5개)</SectionTitle>
          {top_purposes.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">데이터가 없습니다</p>
          ) : (
            <div className="flex gap-4">
              <div className="flex-1 space-y-3">
                {top_purposes.map((d: any, i: number) => (
                  <div key={d.name} className="flex items-center gap-3">
                    <span className={`text-xs font-bold w-4 ${i < 3 ? 'text-blue-600' : 'text-gray-400'}`}>{i + 1}</span>
                    <div className="flex-1">
                      <div className="flex justify-between mb-0.5">
                        <span className="text-sm font-medium text-gray-800">{d.name}</span>
                        <span className="text-xs text-gray-500">{d.count}건</span>
                      </div>
                      <div className="bg-gray-100 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full" style={{ width: `${top_purposes[0].count > 0 ? (d.count / top_purposes[0].count) * 100 : 0}%`, backgroundColor: COLORS[i] }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="w-28">
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie data={top_purposes} cx="50%" cy="50%" innerRadius={28} outerRadius={48}
                      dataKey="count" nameKey="name" labelLine={false}>
                      {top_purposes.map((_: any, i: number) => <Cell key={i} fill={COLORS[i]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 신청/배차 현황 탭 ──────────────────────────────────────────────────
function MonthlyTab({ period }: { period: PeriodState }) {
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const { from, to } = periodToRange(period);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats?type=monthly&from=${from}&to=${to}`)
      .then(r => r.json()).then(j => { setData(j.data); setLoading(false); });
  }, [from, to]);

  function handleDownload() {
    if (!data) return;
    const label = periodLabel(period);
    const rows = [
      ['월', '총 신청', '승인완료', '취소', '배차'],
      ...data.monthly.map((d: any) => [d.month, d.requests, d.approved, d.cancelled, d.dispatches]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '신청배차현황');
    XLSX.writeFile(wb, `신청배차현황_${label}.xlsx`);
  }

  if (loading) return <Loader />;
  if (!data)   return null;
  const { monthly, summary_req: sr, summary_disp: sd } = data;

  return (
    <div className="space-y-5">
      <div className="flex justify-end"><DownloadBtn onClick={handleDownload} /></div>
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="기간 내 총 신청" value={sr.total}     color="text-blue-600" />
        <StatCard label="승인완료"         value={sr.approved}  color="text-green-600" />
        <StatCard label="취소"             value={sr.cancelled} color="text-red-400" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="총 배차"   value={sd.total}     color="text-blue-600" />
        <StatCard label="반납완료"  value={sd.completed} color="text-green-600" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionTitle>월별 신청 건수 추이</SectionTitle>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={monthly} barGap={4}>
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
          <LineChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="dispatches" name="배차 건수" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 상세 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionTitle>월별 상세 데이터</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['월','총 신청','승인완료','취소','배차'].map(h => (
                  <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthly.map((row: any) => (
                <tr key={row.month} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 px-3 font-medium whitespace-nowrap">{row.month}</td>
                  <td className="py-2 px-3 text-blue-600 font-semibold whitespace-nowrap">{row.requests}</td>
                  <td className="py-2 px-3 text-green-600 whitespace-nowrap">{row.approved}</td>
                  <td className="py-2 px-3 text-red-400 whitespace-nowrap">{row.cancelled}</td>
                  <td className="py-2 px-3 text-purple-600 whitespace-nowrap">{row.dispatches}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── 차량 가동률 탭 ────────────────────────────────────────────────────
function UtilizationTab({ period }: { period: PeriodState }) {
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const { from, to } = periodToRange(period);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats?type=utilization&from=${from}&to=${to}`)
      .then(r => r.json()).then(j => { setData(j.data); setLoading(false); });
  }, [from, to]);

  function handleDownload() {
    if (!data) return;
    const label = periodLabel(period);
    const wb = XLSX.utils.book_new();

    const monthRows = [
      ['월', '가동률(%)', '운행 차량', '전체 차량'],
      ...data.monthly.map((m: any) => [m.month, m.rate, m.used, m.total]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(monthRows), '월별가동률');

    const vehicleRows = [
      ['순위', '차량명', '번호판', '차량군', '운행건수'],
      ...data.vehicles.map((v: any, i: number) => [i + 1, v.name, v.license_plate, v.group, v.count]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(vehicleRows), '차량별운행건수');
    XLSX.writeFile(wb, `차량가동률_${label}.xlsx`);
  }

  if (loading) return <Loader />;
  if (!data)   return null;

  const { monthly, vehicles } = data;
  const avgRate = monthly.length > 0 ? Math.round(monthly.reduce((s: number, m: any) => s + m.rate, 0) / monthly.length) : 0;
  const maxUsed = Math.max(...vehicles.map((v: any) => v.count), 1);

  return (
    <div className="space-y-5">
      <div className="flex justify-end"><DownloadBtn onClick={handleDownload} /></div>
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="평균 가동률"  value={`${avgRate}%`}
          color={avgRate >= 60 ? 'text-green-600' : 'text-orange-500'} />
        <StatCard label="운행 차량 수" value={vehicles.filter((v: any) => v.count > 0).length}
          sub={`전체 ${vehicles.length}대`} />
        <StatCard label="미사용 차량"  value={vehicles.filter((v: any) => v.count === 0).length}
          color="text-gray-400" sub="기간 내 운행 없음" />
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

      {/* 상세 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionTitle>차량별 상세 운행 현황</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="border-b border-gray-100">
                {['순위','차량명','번호판','차량군','운행건수'].map(h => (
                  <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v: any, i: number) => (
                <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 px-3 text-gray-400 whitespace-nowrap">{i + 1}</td>
                  <td className="py-2 px-3 font-medium whitespace-nowrap">{v.name}</td>
                  <td className="py-2 px-3 font-mono text-gray-500 whitespace-nowrap">{v.license_plate}</td>
                  <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{v.group}</td>
                  <td className="py-2 px-3 font-bold text-blue-600 whitespace-nowrap">{v.count}건</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── 부서별 현황 탭 ────────────────────────────────────────────────────
function DepartmentsTab({ period }: { period: PeriodState }) {
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const { from, to } = periodToRange(period);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats?type=departments&from=${from}&to=${to}`)
      .then(r => r.json()).then(j => { setData(j.data); setLoading(false); });
  }, [from, to]);

  function handleDownload() {
    if (!data) return;
    const label = periodLabel(period);
    const wb = XLSX.utils.book_new();

    const rankRows = [
      ['순위', '부서명', '운행건수'],
      ...data.ranking.map((d: any, i: number) => [i + 1, d.name, d.count]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rankRows), '부서별순위');

    const monthHeaders = ['월', ...data.top_depts];
    const monthRows = [
      monthHeaders,
      ...data.monthly.map((m: any) => [m.month, ...data.top_depts.map((d: string) => m[d] || 0)]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(monthRows), '월별부서현황');
    XLSX.writeFile(wb, `부서별현황_${label}.xlsx`);
  }

  if (loading) return <Loader />;
  if (!data)   return null;

  const { ranking, monthly, top_depts } = data;
  const total = ranking.reduce((s: number, d: any) => s + d.count, 0);

  return (
    <div className="space-y-5">
      <div className="flex justify-end"><DownloadBtn onClick={handleDownload} /></div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>부서별 운행 건수 순위</SectionTitle>
          <div className="space-y-2.5 max-h-96 overflow-y-auto">
            {ranking.map((d: any, i: number) => (
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
              <Pie data={ranking.slice(0, 8)} cx="50%" cy="45%" innerRadius={50} outerRadius={85}
                dataKey="count" nameKey="name" labelLine={false}>
                {ranking.slice(0, 8).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: any, name: any) => [`${v}건`, name]} />
              <Legend iconType="circle" iconSize={10}
                formatter={(value) => <span className="text-xs text-gray-600">{value}</span>} />
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

      {/* 상세 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionTitle>부서별 상세 현황</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 whitespace-nowrap">순위</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 whitespace-nowrap">부서명</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 whitespace-nowrap">운행건수</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 whitespace-nowrap">비율</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((d: any, i: number) => (
                <tr key={d.name} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 px-3 text-gray-400 whitespace-nowrap">{i + 1}</td>
                  <td className="py-2 px-3 font-medium whitespace-nowrap">{d.name}</td>
                  <td className="py-2 px-3 text-blue-600 font-semibold whitespace-nowrap">{d.count}건</td>
                  <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{total > 0 ? Math.round(d.count / total * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── 목적/목적지 분석 탭 ───────────────────────────────────────────────
function PurposesTab({ period }: { period: PeriodState }) {
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const { from, to } = periodToRange(period);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats?type=purposes&from=${from}&to=${to}`)
      .then(r => r.json()).then(j => { setData(j.data); setLoading(false); });
  }, [from, to]);

  function handleDownload() {
    if (!data) return;
    const label = periodLabel(period);
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['사용목적', '건수'],
      ...data.purposes.map((d: any) => [d.name, d.count]),
    ]), '사용목적');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['목적지', '건수'],
      ...data.destinations.map((d: any) => [d.name, d.count]),
    ]), '목적지TOP10');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['요일', '출발건수'],
      ...data.by_day.map((d: any) => [d.label, d.count]),
    ]), '요일별');

    XLSX.writeFile(wb, `목적목적지분석_${label}.xlsx`);
  }

  if (loading) return <Loader />;
  if (!data)   return null;

  const { purposes, destinations, by_day, monthly } = data;
  const totalPurpose = purposes.reduce((s: number, d: any) => s + d.count, 0);

  return (
    <div className="space-y-5">
      <div className="flex justify-end"><DownloadBtn onClick={handleDownload} /></div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>사용목적별 비중</SectionTitle>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={purposes} cx="50%" cy="42%" innerRadius={55} outerRadius={85}
                dataKey="count" nameKey="name" labelLine={false}>
                {purposes.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: any, n: any) => [`${v}건`, n]} />
              <Legend iconType="circle" iconSize={10}
                formatter={(value) => <span className="text-xs text-gray-600">{value}</span>} />
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

      {/* 사용목적 상세 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SectionTitle>사용목적 상세</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['순위','사용목적','건수','비율'].map(h => (
                  <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {purposes.map((d: any, i: number) => (
                <tr key={d.name} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 px-3 text-gray-400 whitespace-nowrap">{i + 1}</td>
                  <td className="py-2 px-3 font-medium whitespace-nowrap">{d.name}</td>
                  <td className="py-2 px-3 text-blue-600 font-semibold whitespace-nowrap">{d.count}건</td>
                  <td className="py-2 px-3 text-gray-500 whitespace-nowrap">
                    {totalPurpose > 0 ? Math.round(d.count / totalPurpose * 100) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                    <div className="h-1.5 rounded-full bg-blue-400"
                      style={{ width: `${(d.count / destinations[0].count) * 100}%` }} />
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

// ── 메인 페이지 ──────────────────────────────────────────────────────
const TABS = [
  { key: 'overview',    label: '개요' },
  { key: 'monthly',     label: '신청/배차 현황' },
  { key: 'utilization', label: '차량 가동률' },
  { key: 'departments', label: '부서별 현황' },
  { key: 'purposes',    label: '목적/목적지 분석' },
];

export default function StatisticsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [period, setPeriod]       = useState<PeriodState>(getDefaultPeriod);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">통계</h1>
          <p className="text-gray-500 mt-1 text-sm">차량 운영 현황을 분석합니다</p>
        </div>
        <PeriodSelector period={period} onChange={setPeriod} />
      </div>

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
