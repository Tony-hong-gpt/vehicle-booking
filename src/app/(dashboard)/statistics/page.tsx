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

const DAY_KO = ['일','월','화','수','목','금','토'];

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}분`;
  if (h < 24) return `${Math.round(h)}시간`;
  const days = Math.floor(h / 24);
  const hrs  = Math.round(h % 24);
  return hrs > 0 ? `${days}일 ${hrs}시간` : `${days}일`;
}

const STEP_LABEL: Record<number, string> = { 3: '총무', 4: '부위원장', 5: '위원장' };

function getWeekDates(weekValue: string): { from: Date; to: Date } {
  const [yearStr, weekStr] = weekValue.split('-W');
  const year = parseInt(yearStr);
  const week = parseInt(weekStr);
  const jan4 = new Date(year, 0, 4);
  const dow  = jan4.getDay() || 7;
  const weekOne = new Date(jan4.getTime() - (dow - 1) * 86400000);
  const from = new Date(weekOne.getTime() + (week - 1) * 7 * 86400000);
  const to   = new Date(from.getTime() + 6 * 86400000);
  return { from, to };
}

function getISOWeekString(date: Date): string {
  const tmp = new Date(date.valueOf());
  tmp.setHours(0, 0, 0, 0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const week1 = new Date(tmp.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${tmp.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function periodLabel(p: PeriodState): string {
  if (p.mode === 'week') {
    const [y, w] = p.value.split('-W');
    const { from, to } = getWeekDates(p.value);
    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}(${DAY_KO[d.getDay()]})`;
    return `${y}년 ${parseInt(w)}주차 · ${fmt(from)}~${fmt(to)}`;
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
      {period.mode === 'week' && (() => {
        const { from, to } = getWeekDates(period.value);
        const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}(${DAY_KO[d.getDay()]})`;
        const [y, w] = period.value.split('-W');
        return (
          <label className="relative flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 bg-white cursor-pointer hover:bg-gray-50 transition-colors">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm text-gray-700 whitespace-nowrap">
              {y}년 {parseInt(w)}주차&nbsp;&nbsp;
              <span className="text-gray-500">{fmt(from)} ~ {fmt(to)}</span>
            </span>
            <input type="date"
              className="absolute inset-0 opacity-0 w-full cursor-pointer"
              onChange={e => {
                if (e.target.value) onChange({ mode: 'week', value: getISOWeekString(new Date(e.target.value + 'T12:00:00')) });
              }} />
          </label>
        );
      })()}
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

      {/* 월간/연간은 별도 라벨 */}
      {period.mode !== 'week' && (
        <span className="text-sm font-semibold text-gray-700">{periodLabel(period)}</span>
      )}
    </div>
  );
}

// ── 차량 현황 스냅샷 바 ───────────────────────────────────────────────
interface VehicleSnapshot {
  total: number; available: number; booked: number; in_use: number; maintenance: number;
}
function VehicleSnapshotBar({ vehicles, loadedAtStr }: { vehicles: VehicleSnapshot; loadedAtStr: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-3 flex items-center gap-5 flex-wrap">
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-sm font-bold text-gray-700">🚗 차량 현황</span>
        <span className="flex items-center gap-1 text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          LIVE
        </span>
        {loadedAtStr && <span className="text-[10px] text-gray-400">{loadedAtStr} 기준</span>}
      </div>
      <div className="flex items-center gap-4 flex-1 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">전체</span>
          <span className="text-sm font-bold text-gray-900">{vehicles.total}</span>
        </div>
        <div className="w-px h-3 bg-gray-200 flex-shrink-0" />
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
          <span className="text-xs text-gray-500">사용가능</span>
          <span className="text-sm font-bold text-green-600">{vehicles.available ?? 0}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
          <span className="text-xs text-gray-500">배차완료</span>
          <span className="text-sm font-bold text-blue-600">{vehicles.booked ?? 0}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex-shrink-0 w-2 h-2">
            <span className="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-60" />
            <span className="relative block w-2 h-2 rounded-full bg-indigo-500" />
          </span>
          <span className="text-xs text-gray-500">운행중</span>
          <span className="text-sm font-bold text-indigo-600">{vehicles.in_use ?? 0}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
          <span className="text-xs text-gray-500">정비중</span>
          <span className="text-sm font-bold text-orange-600">{vehicles.maintenance ?? 0}</span>
        </div>
      </div>
    </div>
  );
}

// ── 개요 탭 ───────────────────────────────────────────────────────────
function OverviewTab({ period }: { period: PeriodState }) {
  const [data, setData]         = useState<any>(null);
  const [vgData, setVgData]     = useState<any>(null);
  const [procData, setProcData] = useState<any>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    setLoading(true);
    const { from, to, granularity } = periodToRange(period);
    const p = `from=${from}&to=${to}`;
    Promise.all([
      fetch(`/api/stats?type=overview&${p}&granularity=${granularity}`).then(r => r.json()),
      fetch(`/api/stats?type=vehicle_groups&${p}`).then(r => r.json()),
      fetch(`/api/stats?type=processors&${p}`).then(r => r.json()),
    ]).then(([ov, vg, pr]) => {
      setData(ov.data ?? null);
      setVgData(vg.data ?? null);
      setProcData(pr.data ?? null);
      setLoadedAt(new Date());
      setLoading(false);
    });
  }, [period]);

  if (loading) return <Loader />;
  if (!data)   return null;

  const { kpi, requests, dispatches, vehicles, time_series, top_depts, top_purposes } = data;
  const totalDept    = top_depts.reduce((s: number, d: any) => s + d.count, 0);
  const totalPurpose = top_purposes.reduce((s: number, d: any) => s + d.count, 0);

  // Row 4 데이터
  const avgProcessHours: number | null = data.avg_process_hours ?? null;
  const procDist    = data.process_distribution ?? null;
  const vgGroups    = vgData?.groups ?? [];
  const vgTotal     = vgData?.total  ?? 0;
  const maxVgCount  = vgGroups[0]?.count ?? 1;
  const sortedProcs = ((procData?.processors ?? []) as any[])
    .slice().sort((a, b) => b.step - a.step || b.count - a.count);
  const loadedAtStr = loadedAt
    ? `${String(loadedAt.getHours()).padStart(2, '0')}:${String(loadedAt.getMinutes()).padStart(2, '0')}`
    : '';

  return (
    <div className="space-y-4">
      {/* ── 차량 현황 스냅샷 바 ── */}
      <VehicleSnapshotBar vehicles={vehicles} loadedAtStr={loadedAtStr} />

      {/* ── Row 1: KPI 4개 ── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: '총 신청 건수', value: kpi.total_requests.value,   unit: '건', diff: kpi.total_requests.diff,  color: 'text-blue-600' },
          { label: '신청 승인율',  value: kpi.approval_rate.value,    unit: '%',  diff: undefined,                color: kpi.approval_rate.value >= 80 ? 'text-green-600' : 'text-orange-500', sub: '취소·반려 제외' },
          { label: '운행 완료',    value: kpi.completed_trips.value,  unit: '건', diff: kpi.completed_trips.diff, color: 'text-purple-600' },
          { label: '차량 가동률',  value: kpi.utilization_rate.value, unit: '%',  diff: undefined,                color: kpi.utilization_rate.value >= 60 ? 'text-green-600' : 'text-orange-500', sub: '운행일수 기준' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400">{card.label}</p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className={`text-3xl font-bold ${card.color}`}>{card.value}</span>
                <span className="text-sm text-gray-400">{card.unit}</span>
              </div>
              {card.sub && <p className="text-xs text-gray-400 mt-1">{card.sub}</p>}
            </div>
            {card.diff != null && (
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${card.diff > 0 ? 'bg-blue-50 text-blue-500' : card.diff < 0 ? 'bg-red-50 text-red-400' : 'bg-gray-100 text-gray-400'}`}>
                {card.diff > 0 ? '▲' : card.diff < 0 ? '▼' : '─'} {Math.abs(card.diff)}%
              </span>
            )}
          </div>
        ))}
      </div>

      {/* ── Row 2: 시계열(좌) + 신청·배차현황(우) ── */}
      <div className="grid grid-cols-5 gap-3">
        {/* 시계열 차트 */}
        <div className="col-span-3 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-bold text-gray-500 mb-3">
            {period.mode === 'week' ? '요일별' : period.mode === 'month' ? '주별' : '월별'} 신청·배차 추이
          </p>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={time_series} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} width={28} />
              <Tooltip />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="requests"   name="신청" fill="#3b82f6" radius={[4,4,0,0]} />
              <Bar dataKey="dispatches" name="배차" fill="#8b5cf6" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 신청현황 + 배차현황 세로 배치 */}
        <div className="col-span-2 flex flex-col gap-3">
          {/* 신청 현황 */}
          <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-bold text-gray-500 mb-3">신청 현황</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              {[
                { label: '총 신청',   value: requests.total,     color: 'bg-blue-500' },
                { label: '승인완료',  value: requests.approved,  color: 'bg-green-500' },
                { label: '반려',      value: requests.rejected,  color: 'bg-rose-500' },
                { label: '처리 대기', value: requests.pending,   color: 'bg-orange-400' },
                { label: '취소',      value: requests.cancelled, color: 'bg-red-400' },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${row.color}`} />
                    <span className="text-sm text-gray-500">{row.label}</span>
                  </div>
                  <span className="text-sm font-bold text-gray-700">{row.value}건</span>
                </div>
              ))}
            </div>
            {requests.total > 0 && (
              <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden flex">
                <div className="bg-green-400 h-full" style={{ width: `${(requests.approved / requests.total) * 100}%` }} />
                <div className="bg-rose-400 h-full" style={{ width: `${((requests.rejected ?? 0) / requests.total) * 100}%` }} />
                <div className="bg-orange-300 h-full" style={{ width: `${(requests.pending / requests.total) * 100}%` }} />
                <div className="bg-red-300 h-full" style={{ width: `${(requests.cancelled / requests.total) * 100}%` }} />
              </div>
            )}
          </div>

          {/* 배차 현황 */}
          <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-bold text-gray-500 mb-3">배차 현황</p>
            <div className="space-y-2.5">
              {[
                { label: '총 배차',  value: dispatches.total,     color: 'bg-blue-500' },
                { label: '반납완료', value: dispatches.completed, color: 'bg-green-500' },
                { label: '배차완료', value: dispatches.scheduled, color: 'bg-blue-400' },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${row.color}`} />
                    <span className="text-sm text-gray-500">{row.label}</span>
                  </div>
                  <span className="text-sm font-bold text-gray-700">{row.value}건</span>
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
        </div>
      </div>

      {/* ── Row 3: 차량운용(좌) + 부서 TOP5(중) + 사용목적 TOP5(우) ── */}
      <div className="grid grid-cols-5 gap-3">
        {/* 차량 운용 */}
        <div className="col-span-1 bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col items-center justify-center">
          <p className="text-xs font-bold text-gray-500 mb-4 self-start">차량 운용 (가동률)</p>
          <div className="relative w-28 h-28">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f3f4f6" strokeWidth="3.5" />
              <circle cx="18" cy="18" r="15.9" fill="none"
                stroke={kpi.utilization_rate.value >= 60 ? '#10b981' : '#f59e0b'} strokeWidth="3.5"
                strokeDasharray={`${kpi.utilization_rate.value} ${100 - kpi.utilization_rate.value}`}
                strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-2xl font-bold ${kpi.utilization_rate.value >= 60 ? 'text-green-600' : 'text-orange-500'}`}>
                {kpi.utilization_rate.value}%
              </span>
              <span className="text-[11px] text-gray-400">가동률</span>
            </div>
          </div>
          <div className="mt-3 text-center space-y-0.5">
            <p className="text-[11px] text-gray-400">운행일수 기준</p>
            <p className="text-[11px] text-gray-400">전체 {vehicles.total}대 대상</p>
          </div>
        </div>

        {/* 부서 TOP 5 */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-bold text-gray-500 mb-3">부서별 운행 현황 (TOP 5)</p>
          {top_depts.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">데이터가 없습니다</p>
          ) : (
            <div className="space-y-3">
              {top_depts.map((d: any, i: number) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className={`text-xs font-bold w-4 text-center flex-shrink-0 ${i < 3 ? 'text-blue-500' : 'text-gray-300'}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700 truncate">{d.name}</span>
                      <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{d.count}건 ({totalDept > 0 ? Math.round(d.count / totalDept * 100) : 0}%)</span>
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
        <div className="col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-bold text-gray-500 mb-3">사용목적별 현황 (TOP 5)</p>
          {top_purposes.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">데이터가 없습니다</p>
          ) : (
            <div className="space-y-3">
              {top_purposes.map((d: any, i: number) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className={`text-xs font-bold w-4 text-center flex-shrink-0 ${i < 3 ? 'text-blue-500' : 'text-gray-300'}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700 truncate">{d.name}</span>
                      <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{d.count}건 ({totalPurpose > 0 ? Math.round(d.count / totalPurpose * 100) : 0}%)</span>
                    </div>
                    <div className="bg-gray-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{ width: `${top_purposes[0].count > 0 ? (d.count / top_purposes[0].count) * 100 : 0}%`, backgroundColor: COLORS[i] }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* ── Row 4: 처리소요시간 + 차량군별배차 + 담당자별처리 ── */}
      <div className="grid grid-cols-3 gap-3 items-stretch">

        {/* 처리 소요시간 */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col">
          <p className="text-xs font-bold text-gray-500 mb-4">처리 소요시간</p>
          {avgProcessHours !== null ? (
            <div className="flex flex-col flex-1">
              {/* 평균 시간 */}
              <div className="pb-4 border-b border-gray-100">
                <p className="text-3xl font-bold text-blue-600">{formatHours(avgProcessHours)}</p>
                <p className="text-xs text-gray-400 mt-1">평균 처리 소요시간 (신청 → 최종 승인)</p>
              </div>
              {/* 분포 */}
              {procDist && (procDist.fast + procDist.mid + procDist.slow) > 0 && (() => {
                const tot = procDist.fast + procDist.mid + procDist.slow;
                return (
                  <div className="flex flex-col justify-around flex-1 pt-4 space-y-3">
                    {[
                      { label: '빠름 (1일 미만)',  value: procDist.fast, barColor: 'bg-green-500',  textColor: 'text-green-700' },
                      { label: '보통 (1~3일)',     value: procDist.mid,  barColor: 'bg-blue-500',   textColor: 'text-blue-700' },
                      { label: '느림 (3일 초과)',  value: procDist.slow, barColor: 'bg-orange-500', textColor: 'text-orange-700' },
                    ].map(s => (
                      <div key={s.label}>
                        <div className="flex justify-between mb-1.5">
                          <span className="text-xs text-gray-500">{s.label}</span>
                          <span className={`text-xs font-bold ${s.textColor}`}>{s.value}건</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${s.barColor}`}
                            style={{ width: `${tot > 0 ? (s.value / tot) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-sm text-gray-400">처리된 건수 없음</p>
                <p className="text-xs text-gray-300 mt-1">최종 승인된 신청이 없습니다</p>
              </div>
            </div>
          )}
        </div>

        {/* 차량군별 배차 현황 */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold text-gray-500">차량군별 배차 현황</p>
            {vgGroups.length > 0 && (
              <span className="text-[10px] text-gray-400">총 {vgTotal}회</span>
            )}
          </div>
          {vgGroups.length > 0 ? (
            <div className="flex flex-col flex-1 justify-around space-y-3">
              {vgGroups.map((g: any, i: number) => (
                <div key={g.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center text-white flex-shrink-0 ${
                        i === 0 ? 'bg-blue-600' : i === 1 ? 'bg-blue-400' : i === 2 ? 'bg-sky-400' : 'bg-gray-300'
                      }`}>{i + 1}</span>
                      <span className="text-sm font-medium text-gray-800 truncate max-w-[110px]">{g.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-gray-400">{g.percent}%</span>
                      <span className="text-sm font-bold text-gray-700">{g.count}회</span>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full"
                      style={{ width: `${Math.round((g.count / maxVgCount) * 100)}%`, backgroundColor: COLORS[i] || COLORS[4] }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-gray-400">배차 내역 없음</p>
            </div>
          )}
        </div>

        {/* 담당자별 처리 현황 */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col">
          <p className="text-xs font-bold text-gray-500 mb-4">담당자별 처리 현황</p>
          {sortedProcs.length > 0 ? (
            <div className="flex flex-col flex-1 justify-around space-y-2">
              {sortedProcs.map((p: any) => (
                <div key={p.id} className="flex items-center gap-3 py-2.5 px-3 bg-gray-50 rounded-lg">
                  <div className={`flex-shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                    p.step === 3 ? 'bg-blue-100 text-blue-700' :
                    p.step === 4 ? 'bg-violet-100 text-violet-700' :
                    'bg-purple-100 text-purple-700'
                  }`}>
                    {STEP_LABEL[p.step] || '-'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                    {p.avg_hours !== null && (
                      <p className="text-[10px] text-gray-400">평균 {formatHours(p.avg_hours)}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-base font-bold text-gray-800">{p.count}</p>
                    <p className="text-[10px] text-gray-400">건</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-gray-400">처리 내역 없음</p>
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
    <div className="space-y-4">
      {/* 요약 + 다운로드 한 줄 */}
      <div className="flex items-center gap-3">
        {[
          { label: '총 신청',  value: sr.total,       color: 'text-blue-600',  bg: 'bg-blue-50',   dot: 'bg-blue-500' },
          { label: '승인완료', value: sr.approved,     color: 'text-green-600', bg: 'bg-green-50',  dot: 'bg-green-500' },
          { label: '취소',     value: sr.cancelled,    color: 'text-red-500',   bg: 'bg-red-50',    dot: 'bg-red-400' },
          { label: '총 배차',  value: sd.total,        color: 'text-blue-600',  bg: 'bg-blue-50',   dot: 'bg-blue-500' },
          { label: '반납완료', value: sd.completed,    color: 'text-green-600', bg: 'bg-green-50',  dot: 'bg-green-500' },
        ].map(c => (
          <div key={c.label} className={`flex-1 flex items-center justify-between rounded-xl border border-gray-100 shadow-sm px-4 py-3 bg-white`}>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${c.dot}`} />
              <span className="text-xs text-gray-500">{c.label}</span>
            </div>
            <span className={`text-xl font-bold ${c.color}`}>{c.value}</span>
          </div>
        ))}
        <DownloadBtn onClick={handleDownload} />
      </div>

      {/* 두 차트 좌우 배치 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>월별 신청 건수 추이</SectionTitle>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={monthly} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} width={28} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const ORDER = ['requests', 'approved', 'cancelled'];
                  const sorted = ORDER.map(k => payload.find((p: any) => p.dataKey === k)).filter(Boolean);
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm min-w-[120px]">
                      <p className="font-semibold text-gray-700 mb-2">{label}</p>
                      {sorted.map((p: any) => (
                        <p key={p.dataKey} className="text-xs mb-0.5" style={{ color: p.fill }}>
                          {p.name} : {p.value}
                        </p>
                      ))}
                    </div>
                  );
                }}
              />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="requests"  name="총 신청"  fill="#3b82f6" radius={[4,4,0,0]} />
              <Bar dataKey="approved"  name="승인완료" fill="#10b981" radius={[4,4,0,0]} />
              <Bar dataKey="cancelled" name="취소"     fill="#f87171" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>월별 배차 건수 추이</SectionTitle>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} width={28} />
              <Tooltip />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="dispatches" name="배차 건수" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 상세 테이블 (스크롤) */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <SectionTitle>월별 상세 데이터</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-24" />
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr className="border-b border-gray-100">
                {[
                  { label: '월',     color: 'text-gray-500' },
                  { label: '총 신청', color: 'text-gray-500' },
                  { label: '승인완료', color: 'text-gray-500' },
                  { label: '취소',    color: 'text-gray-500' },
                  { label: '배차',    color: 'text-gray-500' },
                ].map(h => (
                  <th key={h.label} className={`text-left py-2.5 px-4 text-xs font-semibold ${h.color}`}>{h.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthly.map((row: any) => (
                <tr key={row.month} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2.5 px-4 font-medium text-gray-700">{row.month}</td>
                  <td className="py-2.5 px-4 text-blue-600 font-semibold">{row.requests}</td>
                  <td className="py-2.5 px-4 text-green-600">{row.approved}</td>
                  <td className="py-2.5 px-4 text-red-400">{row.cancelled}</td>
                  <td className="py-2.5 px-4 text-purple-600">{row.dispatches}</td>
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
  const [data, setData]       = useState<any>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [loading, setLoading]   = useState(true);

  const { from, to } = periodToRange(period);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats?type=utilization&from=${from}&to=${to}`)
      .then(r => r.json()).then(j => { setData(j.data); setLoadedAt(new Date()); setLoading(false); });
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
      ['순위', '차량명', '번호판', '차량군', '가동률(%)', '운행일수', '배차건수'],
      ...data.vehicles.map((v: any, i: number) => [i + 1, v.name, v.license_plate, v.group, v.rate, v.operating_days, v.count]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(vehicleRows), '차량별가동률');
    XLSX.writeFile(wb, `차량가동률_${label}.xlsx`);
  }

  if (loading) return <Loader />;
  if (!data)   return null;

  const { monthly, vehicles, period_days, snapshot } = data;
  const periodDays: number = period_days ?? 1;

  // 평균 가동률 = 차량별 가동률의 평균
  const avgRate = vehicles.length > 0
    ? Math.round(vehicles.reduce((s: number, v: any) => s + v.rate, 0) / vehicles.length)
    : 0;
  const maxRate = Math.max(...vehicles.map((v: any) => v.rate), 1);

  const usedCount   = vehicles.filter((v: any) => v.operating_days > 0).length;
  const unusedCount = vehicles.filter((v: any) => v.operating_days === 0).length;

  const loadedAtStr = loadedAt
    ? `${String(loadedAt.getHours()).padStart(2, '0')}:${String(loadedAt.getMinutes()).padStart(2, '0')}`
    : '';

  return (
    <div className="space-y-4">
      {/* ── 차량 현황 스냅샷 바 ── */}
      {snapshot && <VehicleSnapshotBar vehicles={snapshot} loadedAtStr={loadedAtStr} />}

      {/* 요약 + 다운로드 한 줄 */}
      <div className="flex items-center gap-3">
        {[
          { label: '평균 가동률',   value: `${avgRate}%`,       color: avgRate >= 60 ? 'text-green-600' : 'text-orange-500', dot: avgRate >= 60 ? 'bg-green-500' : 'bg-orange-400', sub: '운행일수 기준' },
          { label: '운행 차량',     value: `${usedCount}대`,    color: 'text-blue-600',  dot: 'bg-blue-500',  sub: `전체 ${vehicles.length}대` },
          { label: '미운행 차량',   value: `${unusedCount}대`,  color: 'text-gray-400',  dot: 'bg-gray-300',  sub: '기간 내 운행 없음' },
          { label: '기간 총 일수',  value: `${periodDays}일`,   color: 'text-gray-700',  dot: 'bg-gray-400',  sub: '가동률 분모 기준' },
        ].map(c => (
          <div key={c.label} className="flex-1 flex items-center justify-between bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${c.dot}`} />
              <div>
                <p className="text-xs text-gray-500">{c.label}</p>
                {c.sub && <p className="text-[11px] text-gray-400">{c.sub}</p>}
              </div>
            </div>
            <span className={`text-xl font-bold ${c.color}`}>{c.value}</span>
          </div>
        ))}
        <DownloadBtn onClick={handleDownload} />
      </div>

      {/* 차트(좌) + 차량별 가동률 바 리스트(우) */}
      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>월별 가동 차량 추이</SectionTitle>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 12 }} width={36} />
              <Tooltip formatter={(v: any) => `${v}%`} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="rate" name="가동 차량 비율" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="col-span-3 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>차량별 가동률 (운행일수 / 기간일수)</SectionTitle>
          <div className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: 300 }}>
            {vehicles.map((v: any, i: number) => (
              <div key={v.id} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-4 text-right flex-shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-medium text-gray-700 truncate">{v.name}</span>
                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                      <span className="text-[11px] text-gray-400 font-mono">{v.license_plate}</span>
                      <span className="text-[11px] text-gray-400">{v.operating_days}일</span>
                      <span className={`text-xs font-bold w-10 text-right ${v.rate >= 60 ? 'text-green-600' : v.rate > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                        {v.rate}%
                      </span>
                    </div>
                  </div>
                  <div className="bg-gray-100 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full transition-all"
                      style={{
                        width: `${maxRate > 0 ? (v.rate / maxRate) * 100 : 0}%`,
                        backgroundColor: v.rate === 0 ? '#e5e7eb' : v.rate >= 60 ? '#10b981' : COLORS[i % COLORS.length],
                      }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 상세 테이블 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <SectionTitle>차량별 상세 가동 현황</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[580px]">
            <thead>
              <tr className="border-b border-gray-100">
                {['순위','차량명','번호판','차량군','가동률','운행일수','배차건수'].map(h => (
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
                  <td className="py-2 px-3 whitespace-nowrap">
                    <span className={`font-bold ${v.rate >= 60 ? 'text-green-600' : v.rate > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                      {v.rate}%
                    </span>
                  </td>
                  <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{v.operating_days}일</td>
                  <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{v.count}건</td>
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
  const [data, setData]         = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [selectedDept, setSelectedDept] = useState(''); // '' = 전체

  const { from, to } = periodToRange(period);

  useEffect(() => {
    setLoading(true);
    setSelectedDept('');
    fetch(`/api/stats?type=departments&from=${from}&to=${to}`)
      .then(r => r.json()).then(j => { setData(j.data); setLoading(false); });
  }, [from, to]);

  function handleDownload() {
    if (!data) return;
    const label = periodLabel(period);
    const wb = XLSX.utils.book_new();
    if (selectedDept) {
      // 선택 부서 월별 데이터
      const rows = [
        ['월', '운행건수'],
        ...data.monthly.map((m: any) => [m.month, m[selectedDept] ?? 0]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), selectedDept);
    } else {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['순위', '부서명', '운행건수'],
        ...data.ranking.map((d: any, i: number) => [i + 1, d.name, d.count]),
      ]), '부서별순위');
      const monthHeaders = ['월', ...data.top_depts];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        monthHeaders,
        ...data.monthly.map((m: any) => [m.month, ...data.top_depts.map((d: string) => m[d] || 0)]),
      ]), '월별부서현황');
    }
    XLSX.writeFile(wb, `부서별현황_${selectedDept || '전체'}_${label}.xlsx`);
  }

  if (loading) return <Loader />;
  if (!data)   return null;

  const { ranking, monthly, top_depts } = data;
  const total = ranking.reduce((s: number, d: any) => s + d.count, 0);

  // 선택 부서 데이터
  const deptInfo    = selectedDept ? ranking.find((d: any) => d.name === selectedDept) : null;
  const deptRank    = selectedDept ? ranking.findIndex((d: any) => d.name === selectedDept) + 1 : 0;
  const deptMonthly = monthly.map((m: any) => ({ month: m.month, 건수: m[selectedDept] ?? 0 }));
  const deptAvg     = deptInfo ? Math.round((deptInfo.count / (monthly.length || 1)) * 10) / 10 : 0;

  return (
    <div className="space-y-4">
      {/* 헤더: 부서 선택 + 다운로드 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-sm font-semibold text-gray-600 whitespace-nowrap">부서 선택</span>
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setSelectedDept('')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                selectedDept === '' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600'
              }`}
            >전체</button>
            {ranking.map((d: any, i: number) => (
              <button
                key={d.name}
                onClick={() => setSelectedDept(d.name)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  selectedDept === d.name
                    ? 'text-white shadow-sm'
                    : 'bg-white border border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600'
                }`}
                style={selectedDept === d.name ? { backgroundColor: COLORS[i % COLORS.length] } : {}}
              >
                {d.name}
                <span className={`ml-1 ${selectedDept === d.name ? 'opacity-80' : 'text-gray-400'}`}>{d.count}</span>
              </button>
            ))}
          </div>
        </div>
        <DownloadBtn onClick={handleDownload} />
      </div>

      {selectedDept && deptInfo ? (
        /* ── 단일 부서 상세 뷰 ── */
        <>
          {/* KPI 3개 */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: '기간 총 운행건수', value: `${deptInfo.count}건` },
              { label: '전체 비율', value: `${total > 0 ? Math.round(deptInfo.count / total * 100) : 0}%` },
              { label: `월 평균 / 순위`, value: `${deptAvg}건`, sub: `전체 ${ranking.length}개 부서 중 ${deptRank}위` },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs font-medium text-gray-400 mb-1">{k.label}</p>
                <p className="text-2xl font-bold text-gray-900">{k.value}</p>
                {k.sub && <p className="text-xs text-gray-400 mt-1">{k.sub}</p>}
              </div>
            ))}
          </div>

          {/* 월별 추이 라인차트 */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <SectionTitle>{selectedDept} — 월별 운행 건수 추이</SectionTitle>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={deptMonthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} width={28} />
                <Tooltip formatter={(v: any) => [`${v}건`, selectedDept]} />
                <Line type="monotone" dataKey="건수" stroke="#3b82f6" strokeWidth={2.5}
                  dot={{ fill: '#3b82f6', r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 월별 상세 테이블 */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <SectionTitle>월별 상세 현황</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['월', '운행건수'].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deptMonthly.map((m: any) => (
                    <tr key={m.month} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-3 text-gray-600">{m.month}</td>
                      <td className="py-2 px-3 font-semibold text-blue-600">{m.건수}건</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* ── 전체 보기 ── */
        <>
          <div className="grid grid-cols-9 gap-4">
            {/* 순위 리스트 — 클릭으로 해당 부서 선택 */}
            <div className="col-span-3 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <SectionTitle>부서별 운행 건수 순위 <span className="text-gray-400 font-normal text-xs ml-1">(클릭하면 상세보기)</span></SectionTitle>
              <div className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: 340 }}>
                {ranking.map((d: any, i: number) => (
                  <button key={d.name} onClick={() => setSelectedDept(d.name)}
                    className="w-full flex items-center gap-2 hover:bg-blue-50 rounded-lg px-1 py-0.5 transition-colors group">
                    <span className={`text-xs font-bold w-4 text-center flex-shrink-0 ${i < 3 ? 'text-blue-600' : 'text-gray-400'}`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="text-sm font-medium text-gray-800 truncate group-hover:text-blue-700">{d.name}</span>
                        <span className="text-xs text-gray-500 ml-2 flex-shrink-0">{d.count}건 ({total > 0 ? Math.round(d.count / total * 100) : 0}%)</span>
                      </div>
                      <div className="bg-gray-100 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full" style={{ width: `${ranking[0].count > 0 ? (d.count / ranking[0].count) * 100 : 0}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 파이차트 */}
            <div className="col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <SectionTitle>부서별 비중</SectionTitle>
              <ResponsiveContainer width="100%" height={340}>
                <PieChart>
                  <Pie data={ranking.slice(0, 8)} cx="50%" cy="38%" innerRadius={45} outerRadius={80}
                    dataKey="count" nameKey="name" labelLine={false}
                    onClick={(entry: any) => setSelectedDept(entry.name)}
                    style={{ cursor: 'pointer' }}>
                    {ranking.slice(0, 8).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any, name: any) => [`${v}건`, name]} />
                  <Legend iconType="circle" iconSize={9}
                    formatter={(value) => <span className="text-xs text-gray-600">{value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* 월별 추이 */}
            <div className="col-span-4 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <SectionTitle>월별 부서 운행 추이 (상위 5개)</SectionTitle>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={monthly} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} width={28} />
                  <Tooltip />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                  {top_depts.slice(0, 5).map((dept: string, i: number) => (
                    <Bar key={dept} dataKey={dept} name={dept} fill={COLORS[i % COLORS.length]} radius={[3,3,0,0]} stackId="a"
                      onClick={() => setSelectedDept(dept)} style={{ cursor: 'pointer' }} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 상세 테이블 */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <SectionTitle>부서별 상세 현황</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['순위','부서명','운행건수','비율'].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((d: any, i: number) => (
                    <tr key={d.name} className="border-b border-gray-50 hover:bg-blue-50 cursor-pointer"
                      onClick={() => setSelectedDept(d.name)}>
                      <td className="py-2 px-3 text-gray-400 whitespace-nowrap">{i + 1}</td>
                      <td className="py-2 px-3 font-medium whitespace-nowrap text-blue-700">{d.name}</td>
                      <td className="py-2 px-3 text-blue-600 font-semibold whitespace-nowrap">{d.count}건</td>
                      <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{total > 0 ? Math.round(d.count / total * 100) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
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
    <div className="space-y-4">
      <div className="flex justify-end"><DownloadBtn onClick={handleDownload} /></div>

      {/* Row 1: 파이(좌) + 목적지 TOP10(중) + 요일별(우) */}
      <div className="grid grid-cols-9 gap-4">
        {/* 사용목적 파이 */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>사용목적별 비중</SectionTitle>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={purposes} cx="50%" cy="38%" innerRadius={45} outerRadius={75}
                dataKey="count" nameKey="name" labelLine={false}>
                {purposes.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: any, n: any) => [`${v}건`, n]} />
              <Legend iconType="circle" iconSize={9}
                formatter={(value) => <span className="text-xs text-gray-600">{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 목적지 TOP 10 */}
        <div className="col-span-3 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>주요 목적지 TOP 10</SectionTitle>
          {destinations.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">데이터가 없습니다</p>
          ) : (
            <div className="space-y-1.5 overflow-y-auto pr-1" style={{ maxHeight: 300 }}>
              {destinations.map((d: any, i: number) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className={`text-xs font-bold w-4 text-center flex-shrink-0 ${i < 3 ? 'text-blue-600' : 'text-gray-400'}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-xs font-medium text-gray-700 truncate">{d.name}</span>
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

        {/* 요일별 출발 */}
        <div className="col-span-4 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>요일별 출발 건수</SectionTitle>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={by_day}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 13 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} width={28} />
              <Tooltip />
              <Bar dataKey="count" name="출발 건수" radius={[5,5,0,0]}>
                {by_day.map((_: any, i: number) => <Cell key={i} fill={i === 0 || i === 6 ? '#ef4444' : '#3b82f6'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 2: 월별 추이(좌) + 사용목적 상세 테이블(우) */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>월별 운행 건수 추이</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} width={28} />
              <Tooltip />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="count" name="운행 건수" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="col-span-1 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>사용목적 상세</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['순위','사용목적','건수','비율'].map(h => (
                    <th key={h} className="text-left py-1.5 px-2 text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {purposes.map((d: any, i: number) => (
                  <tr key={d.name} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-1.5 px-2 text-gray-400 whitespace-nowrap text-xs">{i + 1}</td>
                    <td className="py-1.5 px-2 font-medium whitespace-nowrap text-xs">{d.name}</td>
                    <td className="py-1.5 px-2 text-blue-600 font-semibold whitespace-nowrap text-xs">{d.count}건</td>
                    <td className="py-1.5 px-2 text-gray-500 whitespace-nowrap text-xs">
                      {totalPurpose > 0 ? Math.round(d.count / totalPurpose * 100) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">통계</h1>
          <p className="text-gray-500 mt-0.5 text-xs">차량 운영 현황을 분석합니다</p>
        </div>
        <PeriodSelector period={period} onChange={setPeriod} />
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4 w-fit">
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
