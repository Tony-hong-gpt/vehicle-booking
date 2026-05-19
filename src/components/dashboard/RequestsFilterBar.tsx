'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';

type Period = '' | 'week' | 'month' | 'year' | 'custom';

function toStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekRange(anchor: Date): [string, string] {
  const day = anchor.getDay();
  const mon = new Date(anchor);
  mon.setDate(anchor.getDate() - (day === 0 ? 6 : day - 1));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return [toStr(mon), toStr(sun)];
}

function getMonthRange(anchor: Date): [string, string] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last  = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return [toStr(first), toStr(last)];
}

function getYearRange(anchor: Date): [string, string] {
  const y = anchor.getFullYear();
  return [`${y}-01-01`, `${y}-12-31`];
}

function shiftAnchor(period: Period, from: string, dir: number): Date {
  const d = new Date(from + 'T12:00:00');
  if (period === 'week')  { d.setDate(d.getDate() + dir * 7); }
  if (period === 'month') { d.setMonth(d.getMonth() + dir); }
  if (period === 'year')  { d.setFullYear(d.getFullYear() + dir); }
  return d;
}

function periodLabel(period: Period, from: string, to: string): string {
  if (!from) return '';
  if (period === 'week')  return `${from.replace(/-/g, '.')} ~ ${to.replace(/-/g, '.')}`;
  if (period === 'month') { const [y, m] = from.split('-'); return `${y}년 ${parseInt(m)}월`; }
  if (period === 'year')  return `${from.split('-')[0]}년`;
  return '';
}

interface Props {
  status: string;
}

export default function RequestsFilterBar({ status }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const currentPeriod = (sp.get('period') ?? '') as Period;
  const currentFrom   = sp.get('date_from') ?? '';
  const currentTo     = sp.get('date_to') ?? '';

  const [customFrom, setCustomFrom] = useState(currentFrom);
  const [customTo,   setCustomTo]   = useState(currentTo);

  useEffect(() => {
    if (currentPeriod === 'custom') {
      setCustomFrom(currentFrom);
      setCustomTo(currentTo);
    }
  }, [currentPeriod, currentFrom, currentTo]);

  function buildUrl(period: Period, from: string, to: string) {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (period)             p.set('period', period);
    if (period && from)     p.set('date_from', from);
    if (period && to)       p.set('date_to', to);
    return `/requests?${p.toString()}`;
  }

  function selectPeriod(period: Period) {
    if (period === '') { router.push(buildUrl('', '', '')); return; }
    if (period === 'custom') { router.push(buildUrl('custom', customFrom, customTo)); return; }
    const now = new Date();
    const [from, to] =
      period === 'week'  ? getWeekRange(now) :
      period === 'month' ? getMonthRange(now) :
                           getYearRange(now);
    router.push(buildUrl(period, from, to));
  }

  function navigate(dir: number) {
    const anchor = shiftAnchor(currentPeriod, currentFrom || toStr(new Date()), dir);
    const [from, to] =
      currentPeriod === 'week'  ? getWeekRange(anchor) :
      currentPeriod === 'month' ? getMonthRange(anchor) :
                                  getYearRange(anchor);
    router.push(buildUrl(currentPeriod, from, to));
  }

  function applyCustom() {
    if (!customFrom || !customTo) return;
    router.push(buildUrl('custom', customFrom, customTo));
  }

  const PERIODS: { key: Period; label: string }[] = [
    { key: '',       label: '전체' },
    { key: 'week',   label: '주간' },
    { key: 'month',  label: '월간' },
    { key: 'year',   label: '연간' },
    { key: 'custom', label: '직접 설정' },
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap mb-4">
      {/* 기간 버튼 */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
        {PERIODS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => selectPeriod(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              currentPeriod === key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 네비게이션 + 레이블 (주간/월간/연간) */}
      {(['week', 'month', 'year'] as Period[]).includes(currentPeriod) && (
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-2 py-1.5 shadow-sm">
          <button
            onClick={() => navigate(-1)}
            className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-gray-700 px-2 min-w-[120px] text-center">
            {periodLabel(currentPeriod, currentFrom, currentTo)}
          </span>
          <button
            onClick={() => navigate(1)}
            className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}

      {/* 직접 설정 입력 */}
      {currentPeriod === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-gray-400 text-sm">~</span>
          <input
            type="date"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={applyCustom}
            disabled={!customFrom || !customTo}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
          >
            적용
          </button>
        </div>
      )}

      {/* 현재 필터 표시 (직접설정 적용된 경우) */}
      {currentPeriod === 'custom' && currentFrom && currentTo && (
        <span className="text-xs text-gray-500 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg">
          {currentFrom.replace(/-/g, '.')} ~ {currentTo.replace(/-/g, '.')}
        </span>
      )}
    </div>
  );
}
