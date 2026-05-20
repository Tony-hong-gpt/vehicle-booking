'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

/**
 * 역할별 담당 상태 (처리 대기 탭에 보여줄 상태)
 */
const ROLE_PENDING_STATUSES: Record<string, string[]> = {
  committee_secretary: ['upper_approved'],
  committee_vice:      ['committee_reviewing'],
  committee_chair:     ['committee_vice_reviewing'],
  admin:               ['upper_approved', 'committee_reviewing', 'committee_vice_reviewing'],
};

const ROLE_DONE_STATUSES = [
  'approved', 'rejected', 'on_hold', 'dispatched', 'returned',
];

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  pending:                  { label: '상위승인대기',   color: 'bg-yellow-100 text-yellow-700',   dot: 'bg-yellow-400' },
  upper_approved:           { label: '차량위원회대기', color: 'bg-indigo-100 text-indigo-700',   dot: 'bg-indigo-400' },
  committee_reviewing:      { label: '총무검토중',     color: 'bg-violet-100 text-violet-700',   dot: 'bg-violet-400' },
  committee_vice_reviewing: { label: '부위원장검토중', color: 'bg-fuchsia-100 text-fuchsia-700', dot: 'bg-fuchsia-400' },
  approved:                 { label: '승인완료',       color: 'bg-green-100 text-green-700',     dot: 'bg-green-400' },
  rejected:                 { label: '반려',           color: 'bg-red-100 text-red-700',         dot: 'bg-red-400' },
  on_hold:                  { label: '대기',           color: 'bg-orange-100 text-orange-700',   dot: 'bg-orange-400' },
  dispatched:               { label: '배차완료',       color: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-400' },
  returned:                 { label: '반납완료',       color: 'bg-gray-100 text-gray-600',       dot: 'bg-gray-300' },
};

export default function CommitteeApprovalsPage() {
  const [user, setUser]         = useState<any>(null);
  const [tab, setTab]           = useState<'pending' | 'done'>('pending');
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  /* 필터 */
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilter,  setShowFilter]  = useState(false);
  const [filterVehicleGroup, setFilterVehicleGroup] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  /* 총무 검토 의견 모달 */
  const [secretaryModal,   setSecretaryModal]   = useState<any | null>(null);
  const [secretaryComment, setSecretaryComment] = useState('');
  const [secretaryError,   setSecretaryError]   = useState('');

  /* 부위원장 결재 모달 */
  const [viceModal,   setViceModal]   = useState<any | null>(null);
  const [viceComment, setViceComment] = useState('');
  const [viceError,   setViceError]   = useState('');

  /* 반려 모달 (위원장 / admin) */
  const [rejectModal,   setRejectModal]   = useState<any | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [rejectError,   setRejectError]   = useState('');

  /* 대기 모달 (위원장) */
  const [holdModal,   setHoldModal]   = useState<any | null>(null);
  const [holdComment, setHoldComment] = useState('');
  const [holdError,   setHoldError]   = useState('');

  /* 토스트 */
  const [toast, setToast] = useState('');
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, reqRes] = await Promise.all([
        fetch('/api/auth/me').then(r => r.json()),
        fetch('/api/requests?page_size=500').then(r => r.json()),
      ]);
      setUser(meRes.data);
      setRequests(reqRes.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const role = user?.role ?? 'committee_secretary';
  const pendingStatuses = ROLE_PENDING_STATUSES[role] ?? ROLE_PENDING_STATUSES.committee_secretary;

  const pendingCount = requests.filter(r => pendingStatuses.includes(r.status)).length;

  /* 필터 옵션 */
  const vehicleGroupOptions = useMemo(() => {
    return [...new Set(requests.map(r => r.vehicle_group?.name).filter(Boolean))] as string[];
  }, [requests]);
  const deptOptions = useMemo(() => {
    return [...new Set(requests.map(r => r.department?.name).filter(Boolean))] as string[];
  }, [requests]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const targetStatuses = tab === 'pending' ? pendingStatuses : ROLE_DONE_STATUSES;
    const list = requests.filter(r => {
      if (!targetStatuses.includes(r.status)) return false;
      if (filterVehicleGroup && r.vehicle_group?.name !== filterVehicleGroup) return false;
      if (filterDept && r.department?.name !== filterDept) return false;
      if (filterDateFrom && r.start_datetime && new Date(r.start_datetime) < new Date(filterDateFrom)) return false;
      if (filterDateTo && r.start_datetime) {
        const end = new Date(filterDateTo); end.setHours(23, 59, 59, 999);
        if (new Date(r.start_datetime) > end) return false;
      }
      if (q) {
        const nm = r.requester?.name?.toLowerCase().includes(q);
        const dm = r.department?.name?.toLowerCase().includes(q);
        const des = r.destination?.toLowerCase().includes(q);
        if (!nm && !dm && !des) return false;
      }
      return true;
    });
    const asc = tab === 'pending';
    return list.sort((a, b) => {
      const at = a.start_datetime ? new Date(a.start_datetime).getTime() : 0;
      const bt = b.start_datetime ? new Date(b.start_datetime).getTime() : 0;
      return asc ? at - bt : bt - at;
    });
  }, [requests, tab, pendingStatuses, searchQuery, filterVehicleGroup, filterDept, filterDateFrom, filterDateTo]);

  const hasFilter = !!(filterVehicleGroup || filterDept || filterDateFrom || filterDateTo);
  const hasSearch = searchQuery.trim().length > 0;
  const resetAll = () => {
    setFilterVehicleGroup(''); setFilterDept('');
    setFilterDateFrom(''); setFilterDateTo(''); setSearchQuery('');
  };

  /* API 호출 */
  async function apiCall(url: string, body?: object) {
    const res = await fetch(url, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '처리 실패');
    return json;
  }

  /* 총무: 검토 의견 제출 */
  const handleSecretarySubmit = async () => {
    if (!secretaryModal) return;
    const comment = secretaryComment.trim();
    if (!comment) { setSecretaryError('검토 의견을 작성해주세요'); return; }
    setActionId(secretaryModal.id);
    setSecretaryError('');
    try {
      await apiCall(`/api/requests/${secretaryModal.id}/committee-review`, { comment });
      setSecretaryModal(null);
      setSecretaryComment('');
      showToast('✅ 검토 의견이 제출되었습니다. 부위원장 결재 단계로 이동합니다.');
      fetchAll();
    } catch (e: any) {
      setSecretaryError(e.message);
    } finally { setActionId(null); }
  };

  /* 부위원장: 개별 결재 제출 */
  const handleViceSubmit = async () => {
    if (!viceModal) return;
    setActionId(viceModal.id);
    setViceError('');
    try {
      const json = await apiCall(`/api/requests/${viceModal.id}/committee-vice-review`, {
        comment: viceComment.trim() || null,
      });
      setViceModal(null);
      setViceComment('');
      const msg = json.allDone
        ? '✅ 부위원장 검토가 완료되었습니다. 위원장 최종 결재 단계로 이동합니다.'
        : `✅ 검토 의견이 제출되었습니다. (${json.doneCount}/${json.totalVice}명 완료)`;
      showToast(msg);
      fetchAll();
    } catch (e: any) {
      setViceError(e.message);
    } finally { setActionId(null); }
  };

  /* 위원장: 최종 승인 */
  const handleChairApprove = async (req: any) => {
    if (!confirm(`"${req.destination}" 신청을 최종 승인하시겠습니까?`)) return;
    setActionId(req.id);
    try {
      await apiCall(`/api/requests/${req.id}/approve`);
      showToast('✅ 최종 승인되었습니다');
      fetchAll();
    } catch (e: any) {
      alert(e.message);
    } finally { setActionId(null); }
  };

  /* 반려 */
  const handleReject = async () => {
    if (!rejectModal) return;
    if (!rejectComment.trim()) { setRejectError('반려 사유를 입력해주세요'); return; }
    setActionId(rejectModal.id);
    setRejectError('');
    try {
      await apiCall(`/api/requests/${rejectModal.id}/reject`, { comment: rejectComment.trim() });
      setRejectModal(null); setRejectComment('');
      showToast('반려 처리되었습니다');
      fetchAll();
    } catch (e: any) {
      setRejectError(e.message);
    } finally { setActionId(null); }
  };

  /* 대기 (위원장) */
  const handleHold = async () => {
    if (!holdModal) return;
    if (!holdComment.trim()) { setHoldError('대기 사유를 입력해주세요'); return; }
    setActionId(holdModal.id);
    setHoldError('');
    try {
      await apiCall(`/api/requests/${holdModal.id}/hold`, { comment: holdComment.trim() });
      setHoldModal(null); setHoldComment('');
      showToast('대기 처리되었습니다');
      fetchAll();
    } catch (e: any) {
      setHoldError(e.message);
    } finally { setActionId(null); }
  };

  /* 역할별 액션 버튼 렌더링 */
  function renderActionButtons(req: any) {
    const isActing = actionId === req.id;
    const btnBase = 'flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 transition-colors flex items-center justify-center gap-1.5';

    /* ── 총무: 검토 의견 작성 → 제출 (반려 불가) ── */
    if ((role === 'committee_secretary' || (role === 'admin' && req.status === 'upper_approved'))
        && req.status === 'upper_approved') {
      return (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => { setSecretaryModal(req); setSecretaryComment(''); setSecretaryError(''); }}
            disabled={isActing}
            className={`${btnBase} bg-violet-600 hover:bg-violet-700 text-white`}>
            {isActing
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  검토 의견 작성
                </>}
          </button>
        </div>
      );
    }

    /* ── 부위원장: 개별 결재 (선택적 의견 작성 가능) ── */
    if ((role === 'committee_vice' || (role === 'admin' && req.status === 'committee_reviewing'))
        && req.status === 'committee_reviewing') {
      // 현재 사용자가 이미 결재했는지 확인
      const myApproval = req.approvals?.find(
        (a: any) => a.step === 4 && a.approver_id === user?.id && a.status === 'approved'
      );
      // step=4 결재 완료 수
      const doneCount = req.approvals?.filter(
        (a: any) => a.step === 4 && a.status === 'approved'
      ).length ?? 0;

      if (myApproval) {
        return (
          <div className="pt-1">
            <div className="flex items-center gap-2 px-3 py-2.5 bg-fuchsia-50 border border-fuchsia-200 rounded-xl">
              <svg className="w-4 h-4 text-fuchsia-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <div className="flex-1">
                <p className="text-xs font-bold text-fuchsia-700">결재 완료</p>
                {myApproval.comment && (
                  <p className="text-xs text-fuchsia-600 mt-0.5 leading-relaxed">{myApproval.comment}</p>
                )}
              </div>
              {doneCount > 0 && (
                <span className="text-xs text-fuchsia-500 font-medium bg-fuchsia-100 px-2 py-0.5 rounded-full">
                  {doneCount}명 완료
                </span>
              )}
            </div>
          </div>
        );
      }

      return (
        <div className="space-y-2 pt-1">
          {doneCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-fuchsia-50 rounded-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400" />
              <p className="text-xs text-fuchsia-600 font-medium">{doneCount}명 결재 완료 · 내 결재 대기중</p>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => { setViceModal(req); setViceComment(''); setViceError(''); }}
              disabled={isActing}
              className={`${btnBase} bg-fuchsia-600 hover:bg-fuchsia-700 text-white`}>
              {isActing
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    결재
                  </>}
            </button>
            <button
              onClick={() => { setRejectModal(req); setRejectComment(''); setRejectError(''); }}
              disabled={isActing}
              className={`${btnBase} bg-white border border-red-300 text-red-600`}>
              반려
            </button>
          </div>
        </div>
      );
    }

    /* ── 위원장: 최종 승인 / 반려 / 대기 ── */
    if ((role === 'committee_chair' || (role === 'admin' && req.status === 'committee_vice_reviewing'))
        && req.status === 'committee_vice_reviewing') {
      return (
        <div className="space-y-2 pt-1">
          <div className="flex gap-2">
            <button onClick={() => handleChairApprove(req)} disabled={isActing}
              className={`${btnBase} bg-green-600 hover:bg-green-700 text-white`}>
              {isActing
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    최종 승인
                  </>}
            </button>
            <button onClick={() => { setRejectModal(req); setRejectComment(''); setRejectError(''); }} disabled={isActing}
              className={`${btnBase} bg-white border border-red-300 text-red-600`}>
              반려
            </button>
          </div>
          <button onClick={() => { setHoldModal(req); setHoldComment(''); setHoldError(''); }} disabled={isActing}
            className="w-full py-2 rounded-xl text-sm font-medium border border-orange-300 text-orange-600 bg-orange-50">
            대기
          </button>
        </div>
      );
    }

    return null;
  }

  /* 역할 레이블 */
  const roleLabel: Record<string, string> = {
    committee_secretary: '총무',
    committee_vice: '부위원장',
    committee_chair: '위원장',
    admin: '관리자',
  };

  const tabLabel = roleLabel[role] ?? '위원회';

  return (
    <div className="flex flex-col min-h-full">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-4 pt-5 pb-0 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-gray-900">{tabLabel} 결재</h1>
          <button
            onClick={() => setShowFilter(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              hasFilter ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-500 border-gray-200'
            }`}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            필터{hasFilter ? ' 적용중' : ''}
          </button>
        </div>

        {/* 검색 */}
        <div className="pb-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="신청자 이름 · 부서 · 목적지 검색"
              className="w-full pl-9 pr-9 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')}
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
                <select value={filterVehicleGroup} onChange={e => setFilterVehicleGroup(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-purple-500">
                  <option value="">전체</option>
                  {vehicleGroupOptions.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-semibold text-gray-400 mb-1">신청부서</label>
                <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-purple-500">
                  <option value="">전체</option>
                  {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 mb-1">출발일 범위</label>
              <div className="flex items-center gap-2">
                <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
                <span className="text-gray-400 text-xs">~</span>
                <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
            </div>
            {hasFilter && (
              <button onClick={resetAll}
                className="w-full py-1.5 text-xs text-red-500 font-medium border border-red-200 rounded-xl bg-red-50">
                필터 초기화
              </button>
            )}
          </div>
        )}

        {/* 탭 */}
        <div className="flex gap-1">
          {(['pending', 'done'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                tab === t ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-400'
              }`}>
              {t === 'pending' ? '결재 대기' : '처리완료'}
              {t === 'pending' && pendingCount > 0 && (
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
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-5 py-2.5 rounded-full shadow-lg max-w-xs text-center">
          {toast}
        </div>
      )}

      {/* 결과 수 */}
      {!loading && (
        <div className="px-4 pt-3 pb-0">
          <p className="text-xs text-gray-400">
            {(hasFilter || hasSearch) ? '검색 결과 ' : ''}
            <span className="font-bold text-gray-600">{filtered.length}건</span>
            <span className="ml-1 text-gray-300">· {tab === 'pending' ? '출발일 빠른 순' : '출발일 최신 순'}</span>
          </p>
        </div>
      )}

      {/* 목록 */}
      <div className="flex-1 px-4 py-3 space-y-3 pb-28">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
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
              {(hasFilter || hasSearch) ? '해당 조건의 신청이 없습니다' :
               tab === 'pending' ? '결재 대기 중인 신청이 없습니다' : '처리된 신청이 없습니다'}
            </p>
            {(hasFilter || hasSearch) && (
              <button onClick={resetAll} className="text-xs text-purple-600 font-medium underline">검색 초기화</button>
            )}
          </div>
        ) : (
          filtered.map((req: any) => {
            const cfg = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.pending;
            const isPending = tab === 'pending';

            /* 총무 검토 의견 (step=3) */
            const secretaryApproval = req.approvals?.find((a: any) => a.step === 3);

            return (
              <div key={req.id}
                className={`bg-white rounded-2xl border overflow-hidden shadow-sm ${
                  isPending ? 'border-purple-200' : 'border-gray-100'
                }`}>
                {/* 상태 바 */}
                <div className={`px-4 py-2 flex items-center justify-between ${isPending ? 'bg-purple-50' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                    <span className={`text-xs font-bold ${isPending ? 'text-purple-700' : 'text-gray-500'}`}>
                      {cfg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-mono">{req.request_no}</span>
                    <span className="text-xs text-gray-300">·</span>
                    <span className="text-xs text-gray-400">
                      {req.created_at ? format(new Date(req.created_at), 'MM.dd HH:mm') : '-'}
                    </span>
                  </div>
                </div>

                <div className="px-4 py-3.5">
                  {/* 목적지 + 신청자 */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <p className="font-bold text-gray-900 text-base">{req.destination}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {req.requester?.name}
                        {req.department?.name && ` · ${req.department.name}`}
                      </p>
                    </div>
                    {req.passengers && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full flex-shrink-0">
                        {req.passengers}명
                      </span>
                    )}
                  </div>

                  {/* 일정 */}
                  <div className="bg-gray-50 rounded-xl px-3 py-2.5 mb-3 space-y-1">
                    {[
                      { label: '출발', val: req.start_datetime },
                      { label: '반납', val: req.end_datetime },
                    ].map(({ label, val }) => (
                      <div key={label} className="flex items-center gap-2 text-xs">
                        <span className="text-gray-400 w-12">{label}</span>
                        <span className="font-medium text-gray-700">
                          {val ? format(new Date(val), 'yyyy.MM.dd(EEE) HH:mm', { locale: ko }) : '-'}
                        </span>
                      </div>
                    ))}
                    {req.purpose?.name && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-400 w-12">목적</span>
                        <span className="font-medium text-gray-700">{req.purpose.name}</span>
                      </div>
                    )}
                    {req.vehicle_group?.name && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-400 w-12">차량군</span>
                        <span className="font-medium text-gray-700">{req.vehicle_group.name}</span>
                      </div>
                    )}
                    {req.driver_name && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-400 w-12">기사</span>
                        <span className="font-medium text-gray-700">{req.driver_name}</span>
                      </div>
                    )}
                  </div>

                  {/* 총무 검토 의견 표시 (부위원장/위원장 화면에서 참고용) */}
                  {secretaryApproval?.comment && (role === 'committee_vice' || role === 'committee_chair') && (
                    <div className="bg-violet-50 border border-violet-100 rounded-xl px-3 py-2.5 mb-3">
                      <p className="text-[10px] font-bold text-violet-500 mb-1">총무 검토 의견</p>
                      <p className="text-xs text-violet-700 leading-relaxed">{secretaryApproval.comment}</p>
                    </div>
                  )}

                  {/* 처리 결과 이력 (처리완료 탭) */}
                  {tab === 'done' && req.approvals && req.approvals.length > 0 && (() => {
                    const last = [...req.approvals]
                      .filter((a: any) => a.approved_at)
                      .sort((a: any, b: any) => new Date(b.approved_at).getTime() - new Date(a.approved_at).getTime())[0];
                    if (!last) return null;
                    const isApproved = last.status === 'approved';
                    const isRejected = last.status === 'rejected';
                    const borderCls = isApproved ? 'border-green-100' : isRejected ? 'border-red-100' : 'border-orange-100';
                    const bgCls    = isApproved ? 'bg-green-50'    : isRejected ? 'bg-red-50'    : 'bg-orange-50';
                    const txtCls   = isApproved ? 'text-green-600' : isRejected ? 'text-red-600' : 'text-orange-600';
                    const lbl      = isApproved ? '승인' : isRejected ? '반려' : '대기';
                    const icon     = isApproved ? '✓' : isRejected ? '✗' : '⏸';
                    return (
                      <div className={`border rounded-xl overflow-hidden mb-3 ${borderCls}`}>
                        <div className={`px-3 py-2 flex items-center justify-between ${bgCls}`}>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs ${txtCls}`}>{icon}</span>
                            <span className={`text-xs font-semibold ${txtCls}`}>{lbl}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {last.approver?.name && (
                              <span className={`text-xs font-medium ${txtCls}`}>{last.approver.name}</span>
                            )}
                            {last.approved_at && (
                              <span className={`text-[10px] ${txtCls} opacity-70`}>
                                {format(new Date(last.approved_at), 'MM.dd HH:mm')}
                              </span>
                            )}
                          </div>
                        </div>
                        {last.comment && (
                          <div className="px-3 py-2 bg-white">
                            <p className="text-xs text-gray-600 leading-relaxed">{last.comment}</p>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* 액션 버튼 */}
                  {isPending && renderActionButtons(req)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ═══ 총무 검토 의견 모달 ═══ */}
      {secretaryModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
          onClick={e => { if (e.target === e.currentTarget) setSecretaryModal(null); }}>
          <div className="bg-white rounded-t-3xl w-full max-w-lg shadow-2xl overflow-hidden pb-safe">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900">검토 의견 작성</h3>
                <p className="text-xs text-gray-400 mt-0.5">부위원장 결재를 위한 검토 의견을 작성해주세요</p>
              </div>
              <button onClick={() => setSecretaryModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 text-lg">×</button>
            </div>
            <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="bg-violet-50 rounded-2xl px-4 py-3">
                <p className="text-sm font-semibold text-gray-800">{secretaryModal.destination}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {secretaryModal.requester?.name}
                  {secretaryModal.department?.name && ` · ${secretaryModal.department.name}`}
                  {' · '}{secretaryModal.request_no}
                </p>
                {secretaryModal.start_datetime && (
                  <p className="text-xs text-violet-600 mt-1 font-medium">
                    {format(new Date(secretaryModal.start_datetime), 'yyyy.MM.dd(EEE) HH:mm', { locale: ko })} 출발
                  </p>
                )}
              </div>
              {secretaryError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-600">{secretaryError}</div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">
                  검토 의견 <span className="text-red-500">*</span>
                  <span className="text-gray-400 font-normal ml-1">(필수 입력)</span>
                </label>
                <textarea
                  value={secretaryComment}
                  onChange={e => setSecretaryComment(e.target.value)}
                  placeholder="예) 차량 중복으로 협의 필요, 대차 가능 차량 확인 완료, 일정 변경 요청 등 검토 의견을 상세히 작성해주세요"
                  rows={5} autoFocus
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none" />
                <p className="text-[10px] text-gray-400 mt-1.5">
                  ※ 총무는 직접 승인/반려할 수 없습니다. 검토 의견을 작성하여 부위원장 결재를 요청합니다.
                </p>
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setSecretaryModal(null)}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-sm text-gray-600 font-medium bg-gray-50">취소</button>
              <button onClick={handleSecretarySubmit} disabled={actionId === secretaryModal.id || !secretaryComment.trim()}
                className="flex-1 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-2xl text-sm font-bold disabled:opacity-50 transition-colors">
                {actionId === secretaryModal.id ? '제출 중...' : '검토 의견 제출'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 부위원장 결재 모달 ═══ */}
      {viceModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
          onClick={e => { if (e.target === e.currentTarget) setViceModal(null); }}>
          <div className="bg-white rounded-t-3xl w-full max-w-lg shadow-2xl overflow-hidden pb-safe">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900">부위원장 결재</h3>
                <p className="text-xs text-gray-400 mt-0.5">검토 의견을 추가할 수 있습니다 (선택)</p>
              </div>
              <button onClick={() => setViceModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 text-lg">×</button>
            </div>
            <div className="px-5 py-4 space-y-4 max-h-[65vh] overflow-y-auto">
              <div className="bg-fuchsia-50 rounded-2xl px-4 py-3">
                <p className="text-sm font-semibold text-gray-800">{viceModal.destination}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {viceModal.requester?.name}
                  {viceModal.department?.name && ` · ${viceModal.department.name}`}
                  {' · '}{viceModal.request_no}
                </p>
                {viceModal.start_datetime && (
                  <p className="text-xs text-fuchsia-600 mt-1 font-medium">
                    {format(new Date(viceModal.start_datetime), 'yyyy.MM.dd(EEE) HH:mm', { locale: ko })} 출발
                  </p>
                )}
              </div>

              {/* 총무 검토 의견 참고 */}
              {(() => {
                const secApproval = viceModal.approvals?.find((a: any) => a.step === 3);
                return secApproval?.comment ? (
                  <div className="bg-violet-50 border border-violet-100 rounded-xl px-3 py-2.5">
                    <p className="text-[10px] font-bold text-violet-500 mb-1">총무 검토 의견</p>
                    <p className="text-xs text-violet-700 leading-relaxed">{secApproval.comment}</p>
                  </div>
                ) : null;
              })()}

              {viceError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-600">{viceError}</div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">
                  추가 검토 의견 <span className="text-gray-400 font-normal">(선택)</span>
                </label>
                <textarea
                  value={viceComment}
                  onChange={e => setViceComment(e.target.value)}
                  placeholder="추가 검토 의견이 있으면 작성해주세요 (없으면 비워두세요)"
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400 resize-none" />
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setViceModal(null)}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-sm text-gray-600 font-medium bg-gray-50">취소</button>
              <button onClick={handleViceSubmit} disabled={actionId === viceModal.id}
                className="flex-1 py-3 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-2xl text-sm font-bold disabled:opacity-50 transition-colors">
                {actionId === viceModal.id ? '결재 중...' : '결재 확인'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 반려 모달 (부위원장 / 위원장 / admin) ═══ */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4"
          onClick={e => { if (e.target === e.currentTarget) setRejectModal(null); }}>
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">반려 사유 입력</h3>
              <button onClick={() => setRejectModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 text-lg">×</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="bg-gray-50 rounded-2xl px-4 py-3">
                <p className="text-sm font-semibold text-gray-800">{rejectModal.destination}</p>
                <p className="text-xs text-gray-400 mt-0.5">{rejectModal.requester?.name} · {rejectModal.request_no}</p>
              </div>
              {rejectError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-600">{rejectError}</div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">반려 사유 <span className="text-red-500">*</span></label>
                <textarea value={rejectComment} onChange={e => setRejectComment(e.target.value)}
                  placeholder="신청자에게 전달할 반려 사유를 입력해주세요"
                  rows={4} autoFocus
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
              </div>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={() => setRejectModal(null)}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-sm text-gray-600 font-medium bg-gray-50">취소</button>
              <button onClick={handleReject} disabled={actionId === rejectModal.id}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-2xl text-sm font-bold disabled:opacity-60">
                {actionId === rejectModal.id ? '처리 중...' : '반려 확인'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 대기 모달 (위원장) ═══ */}
      {holdModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4"
          onClick={e => { if (e.target === e.currentTarget) setHoldModal(null); }}>
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">대기 사유 입력</h3>
              <button onClick={() => setHoldModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 text-lg">×</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="bg-gray-50 rounded-2xl px-4 py-3">
                <p className="text-sm font-semibold text-gray-800">{holdModal.destination}</p>
                <p className="text-xs text-gray-400 mt-0.5">{holdModal.requester?.name} · {holdModal.request_no}</p>
              </div>
              {holdError && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 text-sm text-orange-700">{holdError}</div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">대기 사유 <span className="text-red-500">*</span></label>
                <textarea value={holdComment} onChange={e => setHoldComment(e.target.value)}
                  placeholder="대기 사유를 입력해주세요"
                  rows={4} autoFocus
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
              </div>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={() => setHoldModal(null)}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-sm text-gray-600 font-medium bg-gray-50">취소</button>
              <button onClick={handleHold} disabled={actionId === holdModal.id}
                className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl text-sm font-bold disabled:opacity-60">
                {actionId === holdModal.id ? '처리 중...' : '대기 확인'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
