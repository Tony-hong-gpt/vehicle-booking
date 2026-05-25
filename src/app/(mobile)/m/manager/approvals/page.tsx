'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

const TAB_FILTERS = [
  { key: 'pending',   label: '대기',   status: ['pending'] },
  { key: 'done',      label: '처리완료', status: [
    'upper_approved', 'committee_reviewing', 'committee_vice_reviewing',
    'approved', 'rejected', 'on_hold', 'dispatched', 'returned',
  ]},
];

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  pending:                  { label: '승인 대기',      color: 'bg-yellow-100 text-yellow-700',   dot: 'bg-yellow-400' },
  upper_approved:           { label: '차량위원회 대기', color: 'bg-indigo-100 text-indigo-700',  dot: 'bg-indigo-400' },
  committee_reviewing:      { label: '차량위원회 검토중', color: 'bg-violet-100 text-violet-700',  dot: 'bg-violet-400' },
  committee_vice_reviewing: { label: '차량위원회 검토중', color: 'bg-violet-100 text-violet-700',  dot: 'bg-violet-400' },
  approved:                 { label: '차량위원회 승인', color: 'bg-green-100 text-green-700',    dot: 'bg-green-400' },
  rejected:                 { label: '반려',           color: 'bg-red-100 text-red-700',        dot: 'bg-red-400' },
  on_hold:                  { label: '대기',           color: 'bg-orange-100 text-orange-700',  dot: 'bg-orange-400' },
  dispatched:               { label: '배차완료',       color: 'bg-blue-100 text-blue-700',      dot: 'bg-blue-400' },
  returned:                 { label: '반납완료',       color: 'bg-gray-100 text-gray-600',      dot: 'bg-gray-300' },
};

export default function ManagerApprovalsPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<'pending' | 'done'>(
    () => searchParams.get('tab') === 'done' ? 'done' : 'pending'
  );
  const [requests, setRequests]   = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [actionId, setActionId]   = useState<string | null>(null);

  /* 필터 */
  const [filterVehicleGroup, setFilterVehicleGroup] = useState('');
  const [filterDept,         setFilterDept]         = useState('');
  const [filterDateFrom,     setFilterDateFrom]     = useState('');
  const [filterDateTo,       setFilterDateTo]       = useState('');
  const [searchQuery,        setSearchQuery]        = useState('');
  const [showFilter,         setShowFilter]         = useState(false);

  /* 반려 모달 */
  const [rejectModal, setRejectModal] = useState<any | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [rejectError, setRejectError]   = useState('');

  /* 성공 토스트 */
  const [toast, setToast] = useState('');
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/requests?page_size=200&exclude_recurring=true');
      const json = await res.json();
      setRequests(json.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  /* 필터 옵션 목록 (동적) */
  const vehicleGroupOptions = useMemo(() => {
    const names = requests
      .map(r => r.vehicle_group?.name)
      .filter(Boolean);
    return [...new Set(names)] as string[];
  }, [requests]);

  const deptOptions = useMemo(() => {
    const names = requests
      .map(r => r.department?.name)
      .filter(Boolean);
    return [...new Set(names)] as string[];
  }, [requests]);

  const tabConfig  = TAB_FILTERS.find(t => t.key === tab)!;
  const pendingCount = requests.filter(r => r.status === 'pending').length;

  /* 탭 + 필터 적용 */
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = requests.filter(r => {
      if (!tabConfig.status.includes(r.status)) return false;
      if (filterVehicleGroup && r.vehicle_group?.name !== filterVehicleGroup) return false;
      if (filterDept && r.department?.name !== filterDept) return false;
      if (filterDateFrom && r.start_datetime) {
        if (new Date(r.start_datetime) < new Date(filterDateFrom)) return false;
      }
      if (filterDateTo && r.start_datetime) {
        const toEnd = new Date(filterDateTo);
        toEnd.setHours(23, 59, 59, 999);
        if (new Date(r.start_datetime) > toEnd) return false;
      }
      if (q) {
        const nameMatch = r.requester?.name?.toLowerCase().includes(q);
        const deptMatch = r.department?.name?.toLowerCase().includes(q);
        const destMatch = r.destination?.toLowerCase().includes(q);
        if (!nameMatch && !deptMatch && !destMatch) return false;
      }
      return true;
    });
    // 대기: 출발일 빠른 순 / 처리완료: 출발일 최신 순
    const asc = tab === 'pending';
    return list.sort((a, b) => {
      const aTime = a.start_datetime ? new Date(a.start_datetime).getTime() : 0;
      const bTime = b.start_datetime ? new Date(b.start_datetime).getTime() : 0;
      return asc ? aTime - bTime : bTime - aTime;
    });
  }, [requests, tab, tabConfig, filterVehicleGroup, filterDept, filterDateFrom, filterDateTo, searchQuery]);

  const hasFilter = filterVehicleGroup || filterDept || filterDateFrom || filterDateTo;
  const hasSearch = searchQuery.trim().length > 0;

  const resetAll = () => {
    setFilterVehicleGroup('');
    setFilterDept('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSearchQuery('');
  };

  /* 상위 승인 */
  const handleApprove = async (req: any) => {
    if (!confirm(`"${req.destination}" 신청을 승인하시겠습니까?`)) return;
    setActionId(req.id);
    try {
      const res = await fetch(`/api/requests/${req.id}/upper-approve`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) { alert(json.error || '처리 실패'); return; }
      showToast('✅ 승인되었습니다');
      fetchRequests();
    } finally {
      setActionId(null);
    }
  };

  /* 반려 */
  const handleReject = async () => {
    if (!rejectModal) return;
    if (!rejectComment.trim()) { setRejectError('반려 사유를 입력해주세요'); return; }
    setActionId(rejectModal.id);
    setRejectError('');
    try {
      const res = await fetch(`/api/requests/${rejectModal.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: rejectComment.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setRejectError(json.error || '처리 실패'); return; }
      setRejectModal(null);
      setRejectComment('');
      showToast('반려 처리되었습니다');
      fetchRequests();
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="flex flex-col min-h-full">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-4 pt-5 pb-0 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-gray-900">승인 관리</h1>
          <button
            onClick={() => setShowFilter(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              hasFilter
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-500 border-gray-200'
            }`}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            필터{hasFilter ? ' 적용중' : ''}
          </button>
        </div>

        {/* 검색창 — 항상 표시 */}
        <div className="pb-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="신청자 이름 · 부서 · 목적지 검색"
              className="w-full pl-9 pr-9 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* 필터 패널 */}
        {showFilter && (
          <div className="pb-3 space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-[10px] font-semibold text-gray-400 mb-1">차량군</label>
                <select
                  value={filterVehicleGroup}
                  onChange={e => setFilterVehicleGroup(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">전체</option>
                  {vehicleGroupOptions.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-semibold text-gray-400 mb-1">신청부서</label>
                <select
                  value={filterDept}
                  onChange={e => setFilterDept(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">전체</option>
                  {deptOptions.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 mb-1">출발일 범위</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={e => setFilterDateFrom(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {!filterDateFrom && (
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none select-none">
                      시작일
                    </span>
                  )}
                </div>
                <span className="text-gray-400 text-xs flex-shrink-0">~</span>
                <div className="relative flex-1">
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={e => setFilterDateTo(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {!filterDateTo && (
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none select-none">
                      종료일
                    </span>
                  )}
                </div>
              </div>
            </div>
            {hasFilter && (
              <button
                onClick={resetAll}
                className="w-full py-1.5 text-xs text-red-500 font-medium border border-red-200 rounded-xl bg-red-50">
                필터 초기화
              </button>
            )}
          </div>
        )}

        {/* 탭 */}
        <div className="flex gap-1">
          {TAB_FILTERS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-400'
              }`}>
              {t.label}
              {t.key === 'pending' && pendingCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 토스트 */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-5 py-2.5 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      {/* 결과 수 */}
      {!loading && (
        <div className="px-4 pt-3 pb-0">
          <p className="text-xs text-gray-400">
            {(hasFilter || hasSearch) ? '검색 결과 ' : ''}<span className="font-bold text-gray-600">{filtered.length}건</span>
            {(hasFilter || hasSearch) && ` / 전체 ${requests.filter(r => tabConfig.status.includes(r.status)).length}건`}
            <span className="ml-1 text-gray-300">· {tab === 'pending' ? '출발일 빠른 순' : '출발일 최신 순'}</span>
          </p>
        </div>
      )}

      <div className="flex-1 px-4 py-3 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400">불러오는 중...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-gray-400 text-sm">
              {(hasFilter || hasSearch)
                ? '해당 조건의 신청이 없습니다'
                : tab === 'pending' ? '대기 중인 신청이 없습니다' : '처리된 신청이 없습니다'}
            </p>
            {(hasFilter || hasSearch) && (
              <button
                onClick={resetAll}
                className="text-xs text-blue-600 font-medium underline">
                검색 초기화
              </button>
            )}
          </div>
        ) : (
          filtered.map((req: any) => {
            const cfg = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.pending;
            const isPending = req.status === 'pending';
            const isActing  = actionId === req.id;
            return (
              <div key={req.id} className={`bg-white rounded-2xl overflow-hidden shadow-sm border ${
                isPending ? 'border-amber-200' : 'border-gray-100'
              }`}>
                {/* 상단 컬러 액센트 바 */}
                <div className={`h-1 ${isPending
                  ? 'bg-gradient-to-r from-amber-400 to-orange-400'
                  : 'bg-gradient-to-r from-gray-200 to-gray-100'}`} />

                <div className="px-4 pt-3 pb-4">
                  {/* 상태 칩 + 신청번호/시간 */}
                  <div className="flex items-center justify-between mb-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${cfg.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot} ${isPending ? 'animate-pulse' : ''}`} />
                      {cfg.label}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {req.created_at ? format(new Date(req.created_at), 'MM.dd HH:mm') : '-'}
                    </span>
                  </div>

                  {/* 목적지 + 탑승인원 */}
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="min-w-0">
                      <h3 className="text-[17px] font-bold text-gray-900 leading-tight truncate">{req.destination}</h3>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-sm font-medium text-gray-600">{req.requester?.name}</span>
                        {req.department?.name && (
                          <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-semibold">{req.department.name}</span>
                        )}
                      </div>
                    </div>
                    {req.passengers && (
                      <div className="flex-shrink-0 bg-gray-50 border border-gray-100 rounded-xl px-3 py-1.5 text-center">
                        <p className="text-base font-bold text-gray-800 leading-none">{req.passengers}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">명</p>
                      </div>
                    )}
                  </div>

                  {/* 일정 카드 */}
                  <div className="bg-gray-50 rounded-xl px-3 py-2.5 mb-3 space-y-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex items-center gap-1.5 w-12 flex-shrink-0">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                        <span className="text-[11px] text-gray-400 font-medium">출발</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-800">
                        {req.start_datetime ? format(new Date(req.start_datetime), 'yyyy.MM.dd(EEE) HH:mm', { locale: ko }) : '-'}
                      </span>
                    </div>
                    <div className="border-l-2 border-dashed border-gray-200 ml-1 h-2" />
                    <div className="flex items-center gap-2.5">
                      <div className="flex items-center gap-1.5 w-12 flex-shrink-0">
                        <span className="w-2 h-2 rounded-full bg-rose-400 flex-shrink-0" />
                        <span className="text-[11px] text-gray-400 font-medium">반납</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-800">
                        {req.end_datetime ? format(new Date(req.end_datetime), 'yyyy.MM.dd(EEE) HH:mm', { locale: ko }) : '-'}
                      </span>
                    </div>
                  </div>

                  {/* 태그 행: 목적 + 차량군 + 기사 */}
                  {(req.purpose?.name || req.vehicle_group?.name || req.driver_name) && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {req.purpose?.name && (
                        <span className="text-xs bg-violet-50 text-violet-600 px-2.5 py-1 rounded-full font-medium">{req.purpose.name}</span>
                      )}
                      {req.vehicle_group?.name && (
                        <span className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full font-medium">🚌 {req.vehicle_group.name}</span>
                      )}
                      {req.driver_name && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">👤 {req.driver_name}</span>
                      )}
                    </div>
                  )}

                  {/* 비고 */}
                  {req.notes && (
                    <div className="flex items-start gap-2 bg-sky-50 rounded-xl px-3 py-2 mb-3">
                      <span className="text-sky-400 text-sm flex-shrink-0">💬</span>
                      <p className="text-xs text-sky-700 leading-relaxed">{req.notes}</p>
                    </div>
                  )}

                  {/* 처리완료 탭 — 결재 이력 */}
                  {req.status !== 'pending' && (() => {
                    const approvals: any[] = req.approvals ?? [];
                    const managerReject = approvals.find((a: any) => a.step === 1 && a.status === 'rejected');
                    if (managerReject) {
                      return (
                        <div className="rounded-xl overflow-hidden border border-red-100 mb-3">
                          <div className="px-3 py-2 bg-red-50 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-white bg-red-400 px-1.5 py-0.5 rounded">반려</span>
                              {managerReject.approver && <span className="text-xs font-semibold text-red-600">{managerReject.approver.name}</span>}
                            </div>
                            {managerReject.approved_at && (
                              <span className="text-[10px] text-red-300">{format(new Date(managerReject.approved_at), 'MM.dd HH:mm')}</span>
                            )}
                          </div>
                          {managerReject.comment && (
                            <div className="px-3 py-2 bg-white">
                              <p className="text-xs text-gray-600 leading-relaxed">{managerReject.comment}</p>
                            </div>
                          )}
                        </div>
                      );
                    }

                    const chairApproval = approvals.find((a: any) => a.step === 5);
                    if (!chairApproval) {
                      return (
                        <div className="flex items-center gap-2 bg-violet-50 rounded-xl px-3 py-2.5 mb-3">
                          <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse flex-shrink-0" />
                          <span className="text-xs font-semibold text-violet-600">차량위원회 검토중</span>
                        </div>
                      );
                    }

                    const isOnHold   = chairApproval.comment?.includes('[대기]');
                    const isRejected = chairApproval.status === 'rejected';
                    const isApproved = !isOnHold && !isRejected;
                    const cleanComment = chairApproval.comment
                      ?.replace(/^\[강제처리\]\[대기\]\s*/, '').replace(/^\[대기\]\s*/, '').replace(/^\[강제처리\]\s*/, '');

                    const badgeBg   = isApproved ? 'bg-emerald-500' : isOnHold ? 'bg-orange-400' : 'bg-red-400';
                    const wrapBg    = isApproved ? 'bg-emerald-50'  : isOnHold ? 'bg-orange-50'  : 'bg-red-50';
                    const wrapBdr   = isApproved ? 'border-emerald-100' : isOnHold ? 'border-orange-100' : 'border-red-100';
                    const nameClr   = isApproved ? 'text-emerald-700'   : isOnHold ? 'text-orange-700'   : 'text-red-700';
                    const timeClr   = isApproved ? 'text-emerald-400'   : isOnHold ? 'text-orange-300'   : 'text-red-300';
                    const badgeLabel = isApproved ? '승인' : isOnHold ? '대기' : '반려';

                    return (
                      <div className={`rounded-xl overflow-hidden border mb-3 ${wrapBdr}`}>
                        <div className={`px-3 py-2 flex items-center justify-between ${wrapBg}`}>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-bold text-white px-1.5 py-0.5 rounded ${badgeBg}`}>{badgeLabel}</span>
                            {chairApproval.approver && <span className={`text-xs font-semibold ${nameClr}`}>{chairApproval.approver.name}</span>}
                          </div>
                          {chairApproval.approved_at && (
                            <span className={`text-[10px] ${timeClr}`}>{format(new Date(chairApproval.approved_at), 'MM.dd HH:mm')}</span>
                          )}
                        </div>
                        {(isRejected || isOnHold) && cleanComment && (
                          <div className="px-3 py-2 bg-white">
                            <p className="text-xs text-gray-600 leading-relaxed">{cleanComment}</p>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* 승인/반려 버튼 */}
                  {isPending && (
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleApprove(req)}
                        disabled={isActing}
                        className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-sm font-bold disabled:opacity-60 transition-colors flex items-center justify-center gap-2 shadow-sm shadow-blue-200">
                        {isActing
                          ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>승인</>}
                      </button>
                      <button
                        onClick={() => { setRejectModal(req); setRejectComment(''); setRejectError(''); }}
                        disabled={isActing}
                        className="flex-1 py-3 bg-white border-2 border-red-200 text-red-500 rounded-xl text-sm font-bold disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        반려
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 반려 사유 입력 모달 */}
      {rejectModal && (
        <div
          className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center px-4"
          onClick={e => { if (e.target === e.currentTarget) setRejectModal(null); }}>
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">반려 사유 입력</h3>
              <button
                onClick={() => setRejectModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 text-lg leading-none hover:bg-gray-200 transition-colors">
                ×
              </button>
            </div>

            {/* 모달 바디 */}
            <div className="px-5 py-4 space-y-4">
              {/* 신청 정보 요약 */}
              <div className="bg-gray-50 rounded-2xl px-4 py-3">
                <p className="text-sm font-semibold text-gray-800">{rejectModal.destination}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {rejectModal.requester?.name}{rejectModal.department?.name && ` · ${rejectModal.department.name}`}
                </p>
              </div>

              {rejectError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-600">
                  {rejectError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">
                  반려 사유 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectComment}
                  onChange={e => setRejectComment(e.target.value)}
                  placeholder="신청자에게 전달할 반려 사유를 입력해주세요"
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                  autoFocus
                />
              </div>
            </div>

            {/* 모달 푸터 */}
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={() => setRejectModal(null)}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-sm text-gray-600 font-medium bg-gray-50 hover:bg-gray-100 transition-colors">
                취소
              </button>
              <button
                onClick={handleReject}
                disabled={actionId === rejectModal.id}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-2xl text-sm font-bold disabled:opacity-60 transition-colors">
                {actionId === rejectModal.id ? '처리 중...' : '반려 확인'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
