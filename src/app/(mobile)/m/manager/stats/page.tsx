'use client';

import { useState, useEffect } from 'react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ko } from 'date-fns/locale';

const MONTHS = Array.from({ length: 6 }, (_, i) => {
  const d = subMonths(new Date(), 5 - i);
  return { key: format(d, 'yyyy-MM'), label: format(d, 'M월', { locale: ko }) };
});

const STATUS_LABELS: Record<string, string> = {
  pending: '결재대기', upper_approved: '위원회대기',
  committee_reviewing: '총무검토', committee_vice_reviewing: '부위원장검토',
  on_hold: '보류', approved: '승인완료', dispatched: '배차완료',
  in_use: '운행중', returned: '반납완료', rejected: '반려', cancelled: '취소',
};

export default function ManagerStatsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));

  useEffect(() => {
    fetch('/api/requests?page_size=500')
      .then(r => r.json())
      .then(json => { setRequests(json.data || []); setLoading(false); });
  }, []);

  /* 월별 카운트 (6개월) */
  const monthlyData = MONTHS.map(m => ({
    ...m,
    count: requests.filter(r => r.created_at?.slice(0, 7) === m.key).length,
  }));
  const maxMonthly = Math.max(1, ...monthlyData.map(m => m.count));

  /* 선택 월 데이터 */
  const monthReqs  = requests.filter(r => r.created_at?.slice(0, 7) === selectedMonth);
  const total      = monthReqs.length;
  const approved   = monthReqs.filter(r => ['approved', 'dispatched', 'in_use', 'returned'].includes(r.status)).length;
  const onHold     = monthReqs.filter(r => r.status === 'on_hold').length;
  const rejected   = monthReqs.filter(r => r.status === 'rejected').length;
  const cancelled  = monthReqs.filter(r => r.status === 'cancelled').length;
  const pending    = monthReqs.filter(r => r.status === 'pending').length;
  const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;

  /* 상태별 분포 */
  const statusDist = Object.entries(
    monthReqs.reduce((acc: Record<string, number>, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  /* 목적지 TOP 5 — 취소 건 제외 */
  const destCount = monthReqs
    .filter(r => r.status !== 'cancelled')
    .reduce((acc: Record<string, number>, r) => {
      if (r.destination) acc[r.destination] = (acc[r.destination] || 0) + 1;
      return acc;
    }, {});
  const topDests = Object.entries(destCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxDest  = Math.max(1, ...topDests.map(d => d[1]));

  /* 목적별 분포 — 취소 건 제외 */
  const purposeCount = monthReqs
    .filter(r => r.status !== 'cancelled')
    .reduce((acc: Record<string, number>, r) => {
      const p = r.purpose?.name || '기타';
      acc[p] = (acc[p] || 0) + 1;
      return acc;
    }, {});
  const topPurposes = Object.entries(purposeCount).sort((a, b) => b[1] - a[1]).slice(0, 4);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-900">부서 통계</h1>
        <p className="text-xs text-gray-400 mt-0.5">차량 신청 및 이용 현황</p>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* 월 선택 */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {MONTHS.map(m => (
            <button key={m.key}
              onClick={() => setSelectedMonth(m.key)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedMonth === m.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-500'
              }`}>
              {m.label}
            </button>
          ))}
        </div>

        {/* 주요 지표 카드 — 상단 2개 (전체 요약) */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <p className="text-3xl font-bold text-gray-900">
              {total}<span className="text-base font-medium ml-0.5">건</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">전체 신청</p>
          </div>
          <div className="bg-blue-50 rounded-2xl p-4 shadow-sm">
            <p className="text-3xl font-bold text-blue-600">
              {approvalRate}<span className="text-base font-medium ml-0.5">%</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">승인률</p>
          </div>
        </div>

        {/* 주요 지표 카드 — 하단 4개 */}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-green-50 rounded-2xl p-3 shadow-sm text-center">
            <p className="text-xl font-bold text-green-700">{approved}</p>
            <p className="text-xs text-gray-500 mt-1">승인완료</p>
          </div>
          <div className="bg-amber-50 rounded-2xl p-3 shadow-sm text-center">
            <p className="text-xl font-bold text-amber-600">{onHold}</p>
            <p className="text-xs text-gray-500 mt-1">보류</p>
          </div>
          <div className="bg-red-50 rounded-2xl p-3 shadow-sm text-center">
            <p className="text-xl font-bold text-red-600">{rejected}</p>
            <p className="text-xs text-gray-500 mt-1">반려</p>
          </div>
          <div className="bg-orange-50 rounded-2xl p-3 shadow-sm text-center">
            <p className="text-xl font-bold text-orange-500">{cancelled}</p>
            <p className="text-xs text-gray-500 mt-1">취소</p>
          </div>
        </div>

        {/* 6개월 추이 바 차트 */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <p className="text-sm font-bold text-gray-700 mb-3">월별 신청 추이</p>
          <div className="flex items-end gap-2">
            {monthlyData.map(m => (
              <div key={m.key} className="flex-1 flex flex-col items-center">
                {/* 건수 레이블 */}
                <span className={`text-xs font-bold leading-none mb-1 ${
                  m.count > 0
                    ? m.key === selectedMonth ? 'text-blue-600' : 'text-gray-500'
                    : 'invisible'
                }`}>
                  {m.count}
                </span>
                {/* 바 */}
                <div className="w-full flex items-end justify-center" style={{ height: '64px' }}>
                  <div
                    className={`w-full rounded-t-lg transition-all ${
                      m.key === selectedMonth ? 'bg-blue-500' : 'bg-gray-200'
                    }`}
                    style={{ height: `${Math.max(4, (m.count / maxMonthly) * 100)}%` }}
                  />
                </div>
                {/* 월 레이블 */}
                <span className={`text-[10px] font-medium mt-1 ${
                  m.key === selectedMonth ? 'text-blue-600' : 'text-gray-400'
                }`}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 상태 분포 */}
        {statusDist.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <p className="text-sm font-bold text-gray-700 mb-3">상태별 현황</p>
            <div className="space-y-2.5">
              {statusDist.map(([status, count]) => (
                <div key={status} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-20 flex-shrink-0">
                    {STATUS_LABELS[status] ?? status}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${(count / total) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-gray-700 w-8 text-right">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 목적 분포 */}
        {topPurposes.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <p className="text-sm font-bold text-gray-700 mb-3">목적별 신청</p>
            <div className="grid grid-cols-2 gap-2">
              {topPurposes.map(([purpose, count], i) => {
                const colors = ['bg-blue-500', 'bg-indigo-400', 'bg-violet-400', 'bg-gray-300'];
                return (
                  <div key={purpose} className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`w-2 h-2 rounded-full ${colors[i]}`} />
                      <span className="text-xs text-gray-500 truncate">{purpose}</span>
                    </div>
                    <p className="text-xl font-bold text-gray-800">{count}<span className="text-xs font-normal text-gray-400 ml-0.5">건</span></p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 목적지 TOP 5 */}
        {topDests.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <p className="text-sm font-bold text-gray-700 mb-3">자주 방문하는 목적지 TOP 5</p>
            <div className="space-y-3">
              {topDests.map(([dest, count], i) => (
                <div key={dest} className="flex items-center gap-3">
                  <span className={`text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 ${
                    i === 0 ? 'bg-yellow-400 text-white' :
                    i === 1 ? 'bg-gray-300 text-white' :
                    i === 2 ? 'bg-orange-300 text-white' :
                              'bg-gray-100 text-gray-500'
                  }`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{dest}</p>
                    <div className="mt-1 bg-gray-100 rounded-full h-1.5">
                      <div className="bg-blue-400 h-1.5 rounded-full"
                        style={{ width: `${(count / maxDest) * 100}%` }} />
                    </div>
                  </div>
                  <span className="text-sm font-bold text-gray-600 flex-shrink-0">{count}건</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {total === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="text-4xl">📊</span>
            <p className="text-gray-400 text-sm">해당 월의 신청 데이터가 없습니다</p>
          </div>
        )}
      </div>
    </div>
  );
}
