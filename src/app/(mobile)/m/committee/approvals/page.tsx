'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

/** 역할별 처리 대기 상태 */
const ROLE_PENDING_STATUSES: Record<string, string[]> = {
  committee_secretary: ['upper_approved', 'approved'],  // upper_approved=검토, approved=배차
  committee_vice:      ['committee_reviewing'],
  committee_chair:     ['committee_vice_reviewing'],
  admin:               ['upper_approved', 'committee_reviewing', 'committee_vice_reviewing', 'approved'],
};

/** 역할별 "처리완료" 탭에 표시할 상태 (pending 탭과 중복 없도록 역할별 분리) */
const ROLE_DONE_STATUSES: Record<string, string[]> = {
  // 총무: 상신한 건(committee_reviewing~) + 최종 처리 건. approved는 pending(배차대기)이므로 제외
  committee_secretary: [
    'committee_reviewing', 'committee_vice_reviewing',
    'rejected', 'on_hold', 'dispatched', 'in_use', 'returned', 'cancelled',
  ],
  // 부위원장: 결재 올린 건(committee_vice_reviewing) + 이후 처리 건
  committee_vice: [
    'committee_vice_reviewing', 'approved',
    'rejected', 'on_hold', 'dispatched', 'in_use', 'returned', 'cancelled',
  ],
  // 위원장: 본인 승인한 건(approved) + 반려/대기/이후
  committee_chair: [
    'approved',
    'rejected', 'on_hold', 'dispatched', 'in_use', 'returned', 'cancelled',
  ],
  // 관리자: 모든 처리 완료 상태
  admin: [
    'committee_reviewing', 'committee_vice_reviewing', 'approved',
    'rejected', 'on_hold', 'dispatched', 'in_use', 'returned', 'cancelled',
  ],
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  pending:                  { label: '부서승인대기',    color: 'text-yellow-700',  bg: 'bg-yellow-50',  dot: 'bg-yellow-400' },
  upper_approved:           { label: '차량위원회대기',  color: 'text-indigo-700',  bg: 'bg-indigo-50',  dot: 'bg-indigo-400' },
  committee_reviewing:      { label: '총무 검토완료',   color: 'text-violet-700',  bg: 'bg-violet-50',  dot: 'bg-violet-400' },
  committee_vice_reviewing: { label: '부위원장 결재완료', color: 'text-fuchsia-700', bg: 'bg-fuchsia-50', dot: 'bg-fuchsia-400' },
  approved:                 { label: '차량위원회 승인', color: 'text-green-700',   bg: 'bg-green-50',   dot: 'bg-green-500' },
  rejected:                 { label: '반려',           color: 'text-red-700',     bg: 'bg-red-50',     dot: 'bg-red-400' },
  on_hold:                  { label: '대기',           color: 'text-orange-700',  bg: 'bg-orange-50',  dot: 'bg-orange-400' },
  dispatched:               { label: '배차완료',       color: 'text-blue-700',    bg: 'bg-blue-50',    dot: 'bg-blue-400' },
  in_use:                   { label: '운행중',         color: 'text-purple-700',  bg: 'bg-purple-50',  dot: 'bg-purple-500' },
  returned:                 { label: '반납완료',       color: 'text-gray-600',    bg: 'bg-gray-50',    dot: 'bg-gray-300' },
  cancelled:                { label: '취소',           color: 'text-gray-500',    bg: 'bg-gray-50',    dot: 'bg-gray-300' },
};

/** 역할별 상태 라벨 오버라이드 (결재 카드 헤더 표시용) */
const ROLE_STATUS_LABEL_OVERRIDE: Record<string, Partial<Record<string, string>>> = {
  committee_secretary: {
    committee_reviewing:      '부위원장 검토중',
    committee_vice_reviewing: '위원장 검토중',
  },
  committee_vice: {
    committee_reviewing:      '총무 검토완료',
    committee_vice_reviewing: '위원장 검토중',
  },
  committee_chair: {
    committee_reviewing:      '총무 검토완료',
    committee_vice_reviewing: '부위원장 결재완료',
  },
  admin: {
    committee_reviewing:      '총무 검토완료',
    committee_vice_reviewing: '부위원장 결재완료',
  },
};

/** 결재 타임라인 단계 정의 */
const TIMELINE_STEPS = [
  { step: 3, label: '총무 검토',     role: '총무',    icon: '📋' },
  { step: 4, label: '부위원장 결재', role: '부위원장', icon: '✍️' },
  { step: 5, label: '위원장 최종',   role: '위원장',  icon: '🏛️' },
];

/** 결재 타임라인에서 각 스텝의 현재 상태 판별 */
function getStepState(step: number, requestStatus: string, approvals: any[]): 'done' | 'current' | 'pending' {
  const approval = approvals?.find((a: any) => a.step === step);
  if (approval?.approved_at) return 'done';
  // current step 판별 (아직 처리 전인데 이전 단계가 완료된 경우)
  const currentMap: Record<string, number> = {
    upper_approved:           3,
    committee_reviewing:      4,
    committee_vice_reviewing: 5,
  };
  const currentStep = currentMap[requestStatus];
  if (currentStep === step) return 'current';
  return 'pending';
}

export default function CommitteeApprovalsPage() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') === 'done' ? 'done' : 'pending') as 'pending' | 'done';

  const [user, setUser]         = useState<any>(null);
  const [tab, setTab]           = useState<'pending' | 'done'>(initialTab);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  /* 검색/필터 */
  const [searchQuery,       setSearchQuery]       = useState('');
  const [showFilter,        setShowFilter]        = useState(false);
  const [filterDept,        setFilterDept]        = useState('');
  const [filterDateFrom,    setFilterDateFrom]    = useState('');
  const [filterDateTo,      setFilterDateTo]      = useState('');

  /* 총무 검토 의견 모달 */
  const [secretaryModal,   setSecretaryModal]   = useState<any | null>(null);
  const [secretaryComment, setSecretaryComment] = useState('');
  const [secretaryError,   setSecretaryError]   = useState('');

  /* 부위원장 결재 모달 */
  const [viceModal,   setViceModal]   = useState<any | null>(null);
  const [viceComment, setViceComment] = useState('');
  const [viceError,   setViceError]   = useState('');

  /* 위원장 승인 모달 (optional comment) */
  const [approveModal,   setApproveModal]   = useState<any | null>(null);
  const [approveComment, setApproveComment] = useState('');

  /* 반려 모달 */
  const [rejectModal,   setRejectModal]   = useState<any | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [rejectError,   setRejectError]   = useState('');

  /* 대기 모달 */
  const [holdModal,   setHoldModal]   = useState<any | null>(null);
  const [holdComment, setHoldComment] = useState('');
  const [holdError,   setHoldError]   = useState('');

  /* 배차 모달 */
  const [dispatchModal,       setDispatchModal]       = useState<any | null>(null);
  const [dispatchVehicleGroups, setDispatchVehicleGroups] = useState<any[]>([]);
  const [dispatchVehicleGroupId, setDispatchVehicleGroupId] = useState('');
  const [allDispatchVehicles, setAllDispatchVehicles] = useState<any[]>([]);
  const [dispatchVehicles,    setDispatchVehicles]    = useState<any[]>([]);
  const [dispatchVehicleId,   setDispatchVehicleId]   = useState('');
  const [dispatchIsRental,    setDispatchIsRental]    = useState(false);
  const [dispatchDriverName,  setDispatchDriverName]  = useState('');
  const [dispatchDriverPhone, setDispatchDriverPhone] = useState('');
  const [dispatchNotes,       setDispatchNotes]       = useState('');
  const [dispatchError,       setDispatchError]       = useState('');
  const [loadingVehicles,     setLoadingVehicles]     = useState(false);

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
      const allRequests = reqRes.data || [];
      setRequests(allRequests);

      // ── 결재 페이지 진입 시 현재 대기 건 전체를 읽음 처리 ──
      const role        = meRes.data?.role ?? '';
      const pendingSts  = ROLE_PENDING_STATUSES[role] ?? [];
      const pendingIds  = allRequests
        .filter((r: any) => pendingSts.includes(r.status))
        .map((r: any) => r.id as string);
      if (pendingIds.length > 0) {
        const prev: string[] = JSON.parse(localStorage.getItem('committee_seen_requests') ?? '[]');
        const merged = [...new Set([...prev, ...pendingIds])];
        localStorage.setItem('committee_seen_requests', JSON.stringify(merged));
        window.dispatchEvent(new Event('committee-notification-seen'));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const role           = user?.role ?? 'committee_secretary';
  const pendingStatuses = ROLE_PENDING_STATUSES[role] ?? ROLE_PENDING_STATUSES.committee_secretary;

  /* 필터 옵션 */
  const deptOptions = useMemo(() =>
    [...new Set(requests.map((r: any) => r.department?.name).filter(Boolean))] as string[]
  , [requests]);

  const doneStatuses = ROLE_DONE_STATUSES[role] ?? ROLE_DONE_STATUSES.committee_chair;

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const targetStatuses = tab === 'pending' ? pendingStatuses : doneStatuses;
    const list = requests.filter((r: any) => {
      if (!targetStatuses.includes(r.status)) return false;
      if (filterDept && r.department?.name !== filterDept) return false;
      if (filterDateFrom && r.start_datetime && new Date(r.start_datetime) < new Date(filterDateFrom)) return false;
      if (filterDateTo && r.start_datetime) {
        const end = new Date(filterDateTo); end.setHours(23, 59, 59, 999);
        if (new Date(r.start_datetime) > end) return false;
      }
      if (q) {
        const nm  = r.requester?.name?.toLowerCase().includes(q);
        const dm  = r.department?.name?.toLowerCase().includes(q);
        const des = r.destination?.toLowerCase().includes(q);
        if (!nm && !dm && !des) return false;
      }
      return true;
    });
    const asc = tab === 'pending';
    return list.sort((a: any, b: any) => {
      const at = a.start_datetime ? new Date(a.start_datetime).getTime() : 0;
      const bt = b.start_datetime ? new Date(b.start_datetime).getTime() : 0;
      return asc ? at - bt : bt - at;
    });
  }, [requests, tab, pendingStatuses, doneStatuses, searchQuery, filterDept, filterDateFrom, filterDateTo]);

  // 탭별 카운트
  const pendingCount = requests.filter((r: any) => pendingStatuses.includes(r.status)).length;

  const hasFilter = !!(filterDept || filterDateFrom || filterDateTo);
  const hasSearch = searchQuery.trim().length > 0;
  const resetAll  = () => { setFilterDept(''); setFilterDateFrom(''); setFilterDateTo(''); setSearchQuery(''); };

  /* API 헬퍼 */
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

  /* ────────── 총무: 검토 의견 제출 ────────── */
  const handleSecretarySubmit = async () => {
    if (!secretaryModal) return;
    const comment = secretaryComment.trim();
    if (!comment) { setSecretaryError('검토 의견을 작성해주세요'); return; }
    setActionId(secretaryModal.id); setSecretaryError('');
    try {
      await apiCall(`/api/requests/${secretaryModal.id}/committee-review`, { comment });
      setSecretaryModal(null); setSecretaryComment('');
      showToast('✅ 검토 의견이 제출되었습니다. 부위원장 결재 단계로 이동합니다.');
      fetchAll();
    } catch (e: any) { setSecretaryError(e.message); }
    finally { setActionId(null); }
  };

  /* ────────── 부위원장: 결재 ────────── */
  const handleViceSubmit = async () => {
    if (!viceModal) return;
    setActionId(viceModal.id); setViceError('');
    try {
      await apiCall(`/api/requests/${viceModal.id}/committee-vice-review`, {
        comment: viceComment.trim() || null,
      });
      setViceModal(null); setViceComment('');
      showToast('✅ 결재가 완료되었습니다. 위원장 최종 결재 단계로 이동합니다.');
      fetchAll();
    } catch (e: any) { setViceError(e.message); }
    finally { setActionId(null); }
  };

  /* ────────── 위원장: 최종 승인 ────────── */
  const handleChairApprove = async () => {
    if (!approveModal) return;
    setActionId(approveModal.id);
    try {
      await apiCall(`/api/requests/${approveModal.id}/approve`, {
        comment: approveComment.trim() || null,
      });
      setApproveModal(null); setApproveComment('');
      showToast('✅ 최종 승인되었습니다');
      fetchAll();
    } catch (e: any) { alert(e.message); }
    finally { setActionId(null); }
  };

  /* ────────── 반려 ────────── */
  const handleReject = async () => {
    if (!rejectModal) return;
    if (!rejectComment.trim()) { setRejectError('반려 사유를 입력해주세요'); return; }
    setActionId(rejectModal.id); setRejectError('');
    try {
      await apiCall(`/api/requests/${rejectModal.id}/reject`, { comment: rejectComment.trim() });
      setRejectModal(null); setRejectComment('');
      showToast('반려 처리되었습니다');
      fetchAll();
    } catch (e: any) { setRejectError(e.message); }
    finally { setActionId(null); }
  };

  /* ────────── 대기 ────────── */
  const handleHold = async () => {
    if (!holdModal) return;
    if (!holdComment.trim()) { setHoldError('대기 사유를 입력해주세요'); return; }
    setActionId(holdModal.id); setHoldError('');
    try {
      await apiCall(`/api/requests/${holdModal.id}/hold`, { comment: holdComment.trim() });
      setHoldModal(null); setHoldComment('');
      showToast('대기 처리되었습니다');
      fetchAll();
    } catch (e: any) { setHoldError(e.message); }
    finally { setActionId(null); }
  };

  /* ────────── 배차 모달 열기 ────────── */
  const openDispatchModal = async (req: any) => {
    const initGroupId = req.vehicle_group_id || '';
    setDispatchModal(req);
    setDispatchVehicleGroupId(initGroupId);
    setDispatchVehicleId(''); setDispatchIsRental(false);
    setDispatchDriverName(''); setDispatchDriverPhone('');
    setDispatchNotes(''); setDispatchError('');
    setLoadingVehicles(true);
    try {
      const [vgRes] = await Promise.all([fetch('/api/vehicle-groups')]);
      const vgData = await vgRes.json();
      setDispatchVehicleGroups(vgData.data || []);

      if (req.start_datetime && req.end_datetime) {
        const start = new Date(req.start_datetime).toISOString();
        const end   = new Date(req.end_datetime).toISOString();
        const res   = await fetch(`/api/vehicles/available?start_datetime=${start}&end_datetime=${end}`);
        const json  = await res.json();
        const all   = json.data || [];
        setAllDispatchVehicles(all);
        setDispatchVehicles(initGroupId ? all.filter((v: any) => v.vehicle_group_id === initGroupId) : all);
      }
    } catch {
      setAllDispatchVehicles([]);
      setDispatchVehicles([]);
    } finally {
      setLoadingVehicles(false);
    }
  };

  /* ────────── 배차 차량군 변경 ────────── */
  const handleDispatchGroupChange = (groupId: string) => {
    setDispatchVehicleGroupId(groupId);
    setDispatchVehicleId('');
    setDispatchVehicles(groupId
      ? allDispatchVehicles.filter((v: any) => v.vehicle_group_id === groupId)
      : allDispatchVehicles
    );
  };

  /* ────────── 배차 제출 ────────── */
  const handleDispatchSubmit = async () => {
    if (!dispatchModal) return;
    if (!dispatchIsRental && !dispatchVehicleId) {
      setDispatchError('차량을 선택하거나 대차를 선택해주세요'); return;
    }
    setActionId(dispatchModal.id); setDispatchError('');
    try {
      const toIso = (dt: string | null | undefined) => {
        if (!dt) return null;
        try { return new Date(dt).toISOString(); } catch { return null; }
      };
      await apiCall('/api/dispatches', {
        request_id:      dispatchModal.id,
        vehicle_id:      dispatchIsRental ? null : dispatchVehicleId,
        scheduled_start: toIso(dispatchModal.start_datetime),
        scheduled_end:   toIso(dispatchModal.end_datetime),
        driver_name:     dispatchDriverName.trim() || null,
        driver_phone:    dispatchDriverPhone.trim() || null,
        notes:           dispatchNotes.trim() || null,
        is_rental:       dispatchIsRental,
      });
      setDispatchModal(null);
      showToast('🚗 배차가 완료되었습니다');
      fetchAll();
    } catch (e: any) { setDispatchError(e.message); }
    finally { setActionId(null); }
  };

  /* ────────── 결재 타임라인 렌더 ────────── */
  function ApprovalTimeline({ req }: { req: any }) {
    const approvals = req.approvals ?? [];
    return (
      <div className="bg-gray-50 rounded-xl p-3 space-y-2.5">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">결재 현황</p>
        {TIMELINE_STEPS.map(({ step, label, role: roleLabel, icon }) => {
          const approval  = approvals.find((a: any) => a.step === step);
          const state     = getStepState(step, req.status, approvals);
          const isApproved = approval?.status === 'approved' && !approval?.comment?.startsWith('[대기]');
          const isRejected = approval?.status === 'rejected';
          const isHold     = approval?.comment?.startsWith('[대기]');

          if (state === 'done') {
            const dotColor = isRejected ? 'bg-red-500' : isHold ? 'bg-orange-400' : 'bg-green-500';
            const txtColor = isRejected ? 'text-red-600' : isHold ? 'text-orange-600' : 'text-green-700';
            const bgColor  = isRejected ? 'bg-red-50'   : isHold ? 'bg-orange-50'   : 'bg-green-50';
            const border   = isRejected ? 'border-red-100' : isHold ? 'border-orange-100' : 'border-green-100';
            const statusIcon = isRejected ? '✗' : isHold ? '⏸' : '✓';
            const cleanComment = approval?.comment?.replace(/^\[대기\]\s*/, '').replace(/^\[강제처리\]\[대기\]\s*/, '').replace(/^\[강제처리\]\s*/, '');
            return (
              <div key={step} className={`rounded-lg border ${border} ${bgColor} overflow-hidden`}>
                <div className="flex items-center gap-2 px-2.5 py-1.5">
                  <span className={`w-4 h-4 rounded-full ${dotColor} flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0`}>
                    {statusIcon}
                  </span>
                  <span className={`text-[11px] font-bold ${txtColor}`}>{label}</span>
                  {approval?.approver?.name && (
                    <span className={`text-[10px] font-medium ${txtColor} ml-auto`}>
                      {approval.approver.name}
                    </span>
                  )}
                  {approval?.approved_at && (
                    <span className={`text-[10px] opacity-60 ${txtColor}`}>
                      {format(new Date(approval.approved_at), 'MM.dd HH:mm')}
                    </span>
                  )}
                </div>
                {cleanComment && (
                  <div className="px-2.5 pb-2">
                    <p className={`text-[11px] leading-relaxed ${txtColor} opacity-80`}>"{cleanComment}"</p>
                  </div>
                )}
              </div>
            );
          }

          if (state === 'current') {
            return (
              <div key={step} className="rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1.5 flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-purple-500 animate-pulse flex-shrink-0" />
                <span className="text-[11px] font-bold text-purple-700">{label}</span>
                <span className="text-[10px] text-purple-500 ml-auto">진행중</span>
              </div>
            );
          }

          return (
            <div key={step} className="px-2.5 py-1.5 flex items-center gap-2 opacity-40">
              <span className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
              <span className="text-[11px] text-gray-400">{label}</span>
              <span className="text-[10px] text-gray-300 ml-auto">{roleLabel}</span>
            </div>
          );
        })}
      </div>
    );
  }

  /* ────────── 역할별 액션 버튼 ────────── */
  function ActionButtons({ req }: { req: any }) {
    const isActing = actionId === req.id;
    const btnBase  = 'flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 transition-all flex items-center justify-center gap-1.5';

    /* 총무: 검토 의견 제출 */
    if (['committee_secretary', 'admin'].includes(role) && req.status === 'upper_approved') {
      return (
        <button
          onClick={() => { setSecretaryModal(req); setSecretaryComment(''); setSecretaryError(''); }}
          disabled={isActing}
          className="w-full py-3 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-700 active:scale-95 text-white disabled:opacity-60 transition-all flex items-center justify-center gap-2">
          {isActing
            ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <>
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                검토 의견 작성 및 상신
              </>}
        </button>
      );
    }

    /* 총무: 배차 등록 */
    if (['committee_secretary', 'admin'].includes(role) && req.status === 'approved') {
      return (
        <button
          onClick={() => openDispatchModal(req)}
          disabled={isActing}
          className="w-full py-3 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 active:scale-95 text-white disabled:opacity-60 transition-all flex items-center justify-center gap-2">
          {isActing
            ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <>
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                배차 등록
              </>}
        </button>
      );
    }

    /* 부위원장: 결재 또는 읽기 전용 */
    if (['committee_vice', 'admin'].includes(role) && req.status === 'committee_reviewing') {
      const step4 = req.approvals?.find((a: any) => a.step === 4 && a.approved_at);
      if (step4) {
        // 이미 다른 부위원장이 결재함 (상태가 committee_reviewing에서 바뀌었을 텐데 혹시 모를 경우 대비)
        return (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-fuchsia-50 border border-fuchsia-200 rounded-xl">
            <svg className="w-4 h-4 text-fuchsia-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span className="text-xs font-semibold text-fuchsia-700">
              {step4.approver?.name ?? '부위원장'}님이 결재하셨습니다
            </span>
          </div>
        );
      }
      return (
        <div className="flex gap-2">
          <button
            onClick={() => { setViceModal(req); setViceComment(''); setViceError(''); }}
            disabled={isActing}
            className={`${btnBase} bg-fuchsia-600 hover:bg-fuchsia-700 active:scale-95 text-white`}>
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
            className={`py-2.5 px-4 rounded-xl text-sm font-semibold border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 active:scale-95 transition-all disabled:opacity-60`}>
            반려
          </button>
        </div>
      );
    }

    /* 위원장: 최종 승인 / 반려 / 대기 */
    if (['committee_chair', 'admin'].includes(role) && req.status === 'committee_vice_reviewing') {
      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => { setApproveModal(req); setApproveComment(''); }}
              disabled={isActing}
              className={`${btnBase} bg-green-600 hover:bg-green-700 active:scale-95 text-white`}>
              {isActing
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    최종 승인
                  </>}
            </button>
            <button
              onClick={() => { setRejectModal(req); setRejectComment(''); setRejectError(''); }}
              disabled={isActing}
              className="py-2.5 px-4 rounded-xl text-sm font-semibold border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 active:scale-95 transition-all disabled:opacity-60">
              반려
            </button>
          </div>
          <button
            onClick={() => { setHoldModal(req); setHoldComment(''); setHoldError(''); }}
            disabled={isActing}
            className="w-full py-2 rounded-xl text-sm font-medium border border-orange-200 text-orange-600 bg-orange-50 hover:bg-orange-100 active:scale-95 transition-all disabled:opacity-60">
            ⏸ 대기
          </button>
        </div>
      );
    }

    return null;
  }

  /* 역할 레이블 */
  const roleLabel: Record<string, string> = {
    committee_secretary: '총무',
    committee_vice:      '부위원장',
    committee_chair:     '위원장',
    admin:               '관리자',
  };

  /* ────────── 렌더 ────────── */
  return (
    <div className="flex flex-col min-h-full bg-gray-50">

      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-4 pt-5 pb-0 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">결재 관리</h1>
            {user && (
              <p className="text-[11px] text-purple-600 font-medium mt-0.5">
                {roleLabel[role] ?? '위원회'} · {user.name}
              </p>
            )}
          </div>
          <button
            onClick={() => setShowFilter(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              hasFilter ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-500 border-gray-200'
            }`}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            {hasFilter ? '필터 적용중' : '필터'}
          </button>
        </div>

        {/* 검색 */}
        <div className="pb-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="신청자 · 부서 · 목적지 검색"
              className="w-full pl-9 pr-9 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-colors" />
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
        <div className="flex">
          {(['pending', 'done'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                tab === t ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}>
              {t === 'pending' ? '결재 대기' : '처리완료'}
              {t === 'pending' && pendingCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none min-w-[18px] text-center">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 토스트 */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-5 py-2.5 rounded-full shadow-2xl max-w-xs text-center whitespace-nowrap">
          {toast}
        </div>
      )}

      {/* 결과 수 */}
      {!loading && (
        <div className="px-4 pt-3 pb-1">
          <p className="text-xs text-gray-400">
            {(hasFilter || hasSearch) ? '검색 결과 ' : ''}
            <span className="font-bold text-gray-600">{filtered.length}건</span>
            <span className="ml-1 text-gray-300">· {tab === 'pending' ? '출발일 빠른 순' : '최신 순'}</span>
          </p>
        </div>
      )}

      {/* 목록 */}
      <div className="flex-1 px-4 py-2 space-y-3 pb-28">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400">불러오는 중...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm text-gray-400">
              {(hasFilter || hasSearch) ? '해당 조건의 신청이 없습니다' :
               tab === 'pending' ? '결재 대기 중인 신청이 없습니다' : '처리된 신청이 없습니다'}
            </p>
            {(hasFilter || hasSearch) && (
              <button onClick={resetAll} className="text-xs text-purple-600 font-medium underline">검색 초기화</button>
            )}
          </div>
        ) : (
          filtered.map((req: any) => {
            const baseCfg   = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.pending;
            const labelOverride = ROLE_STATUS_LABEL_OVERRIDE[role]?.[req.status];
            const cfg       = labelOverride ? { ...baseCfg, label: labelOverride } : baseCfg;
            const isPending = tab === 'pending';

            return (
              <div key={req.id}
                className={`bg-white rounded-2xl overflow-hidden shadow-sm ${
                  isPending ? 'border border-purple-200' : 'border border-gray-100'
                }`}>

                {/* 상태 헤더 */}
                <div className={`px-4 py-2.5 flex items-center justify-between ${cfg.bg}`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot} ${
                      ['committee_reviewing','committee_vice_reviewing'].includes(req.status) ? 'animate-pulse' : ''
                    }`} />
                    <span className={`text-xs font-bold ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-400">{req.request_no}</span>
                    <span className="text-gray-200 text-xs">·</span>
                    <span className="text-xs text-gray-400">
                      {req.created_at ? format(new Date(req.created_at), 'MM.dd HH:mm') : '-'}
                    </span>
                  </div>
                </div>

                <div className="px-4 pt-3 pb-4 space-y-3">

                  {/* ① 목적지 (가장 중요) */}
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-gray-900 text-[17px] leading-snug flex-1">{req.destination}</p>
                    {req.passengers != null && (
                      <span className="text-xs font-semibold text-gray-500 flex-shrink-0 mt-0.5">
                        {req.passengers}명
                      </span>
                    )}
                  </div>

                  {/* ② 신청자 · 부서 */}
                  <p className="text-sm text-gray-500">
                    {req.requester?.name}
                    {req.department?.name && <span className="text-gray-400"> · {req.department.name}</span>}
                  </p>

                  {/* ③ 일정 */}
                  <div className="flex items-center gap-3 py-2.5 px-3 bg-gray-50 rounded-xl">
                    <div className="flex-1">
                      <p className="text-[10px] font-bold text-gray-400 mb-0.5">출발</p>
                      <p className="text-sm font-bold text-gray-800">
                        {req.start_datetime ? format(new Date(req.start_datetime), 'MM.dd(EEE) HH:mm', { locale: ko }) : '-'}
                      </p>
                    </div>
                    <div className="w-px h-8 bg-gray-200 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-[10px] font-bold text-gray-400 mb-0.5">반납</p>
                      <p className="text-sm font-bold text-gray-800">
                        {req.end_datetime ? format(new Date(req.end_datetime), 'MM.dd(EEE) HH:mm', { locale: ko }) : '-'}
                      </p>
                    </div>
                  </div>

                  {/* ④ 목적 · 차량군 */}
                  {(req.purpose?.name || req.vehicle_group?.name) && (
                    <div className="flex gap-2 flex-wrap">
                      {req.purpose?.name && (
                        <span className="text-xs font-medium text-gray-600 bg-gray-100 px-3 py-1 rounded-lg">
                          {req.purpose.name}
                        </span>
                      )}
                      {req.vehicle_group?.name && (
                        <span className="text-xs font-medium text-gray-600 bg-gray-100 px-3 py-1 rounded-lg">
                          {req.vehicle_group.name}
                        </span>
                      )}
                    </div>
                  )}

                  {/* ⑤ 결재 현황 타임라인 */}
                  <ApprovalTimeline req={req} />

                  {/* ⑥ 취소 표시 (cancelled 건) */}
                  {req.status === 'cancelled' && (
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl">
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      <span className="text-xs font-semibold text-gray-500">취소된 신청입니다</span>
                    </div>
                  )}

                  {/* ⑦ 액션 버튼 */}
                  {isPending && (
                    <div className="pt-1">
                      <ActionButtons req={req} />
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ══════════════════════════════════════════
          총무 검토 의견 모달
      ══════════════════════════════════════════ */}
      {secretaryModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-end justify-center"
          onClick={e => { if (e.target === e.currentTarget) setSecretaryModal(null); }}>
          <div className="bg-white rounded-t-3xl w-full shadow-2xl flex flex-col" style={{ maxHeight: '85vh' }}>
            {/* 드래그 핸들 */}
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 flex-shrink-0" />
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-gray-100 flex-shrink-0">
              <div>
                <h3 className="text-base font-bold text-gray-900">검토 의견 작성</h3>
                <p className="text-xs text-violet-500 font-medium mt-0.5">부위원장 결재 상신용 · 의견 필수 입력</p>
              </div>
              <button onClick={() => setSecretaryModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* 스크롤 영역 */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="bg-violet-50 border border-violet-100 rounded-2xl px-4 py-3">
                <p className="text-sm font-bold text-gray-800">{secretaryModal.destination}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {secretaryModal.requester?.name}
                  {secretaryModal.department?.name && ` · ${secretaryModal.department.name}`}
                  {' · '}<span className="font-mono">{secretaryModal.request_no}</span>
                </p>
                {secretaryModal.start_datetime && (
                  <p className="text-xs text-violet-600 mt-1.5 font-medium">
                    출발 · {format(new Date(secretaryModal.start_datetime), 'yyyy.MM.dd(EEE) HH:mm', { locale: ko })}
                  </p>
                )}
              </div>
              {secretaryError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-600">{secretaryError}</div>
              )}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">
                  검토 의견 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={secretaryComment}
                  onChange={e => setSecretaryComment(e.target.value)}
                  placeholder="예) 차량 중복 여부 확인 완료, 대안 차량 검토 후 배차 가능, 일정 조정 필요 사항 등 상세한 검토 의견을 작성해주세요"
                  rows={5} autoFocus
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none leading-relaxed" />
                <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
                  ※ 총무는 직접 승인/반려할 수 없습니다. 검토 의견 작성 후 부위원장 결재를 요청합니다.
                </p>
              </div>
            </div>
            {/* 고정 푸터 */}
            <div className="flex gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0 bg-white pb-safe-or-4">
              <button onClick={() => setSecretaryModal(null)}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-sm text-gray-600 font-medium bg-gray-50">
                취소
              </button>
              <button
                onClick={handleSecretarySubmit}
                disabled={actionId === secretaryModal.id || !secretaryComment.trim()}
                className="flex-1 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-2xl text-sm font-bold disabled:opacity-50 transition-colors">
                {actionId === secretaryModal.id ? '제출 중...' : '결재 상신'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          부위원장 결재 모달
      ══════════════════════════════════════════ */}
      {viceModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-end justify-center"
          onClick={e => { if (e.target === e.currentTarget) setViceModal(null); }}>
          <div className="bg-white rounded-t-3xl w-full shadow-2xl flex flex-col" style={{ maxHeight: '85vh' }}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 flex-shrink-0" />
            <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-gray-100 flex-shrink-0">
              <div>
                <h3 className="text-base font-bold text-gray-900">부위원장 결재</h3>
                <p className="text-xs text-fuchsia-500 font-medium mt-0.5">추가 의견 선택 입력 후 결재 확인</p>
              </div>
              <button onClick={() => setViceModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="bg-fuchsia-50 border border-fuchsia-100 rounded-2xl px-4 py-3">
                <p className="text-sm font-bold text-gray-800">{viceModal.destination}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {viceModal.requester?.name}
                  {viceModal.department?.name && ` · ${viceModal.department.name}`}
                </p>
                {viceModal.start_datetime && (
                  <p className="text-xs text-fuchsia-600 mt-1.5 font-medium">
                    출발 · {format(new Date(viceModal.start_datetime), 'yyyy.MM.dd(EEE) HH:mm', { locale: ko })}
                  </p>
                )}
              </div>
              {(() => {
                const secApproval = viceModal.approvals?.find((a: any) => a.step === 3);
                return secApproval?.comment ? (
                  <div className="bg-violet-50 border border-violet-100 rounded-xl px-3 py-2.5">
                    <p className="text-[10px] font-bold text-violet-500 mb-1">총무 검토 의견</p>
                    <p className="text-xs text-violet-700 leading-relaxed">{secApproval.comment}</p>
                    {secApproval.approver?.name && (
                      <p className="text-[10px] text-violet-400 mt-1">{secApproval.approver.name} · {
                        secApproval.approved_at ? format(new Date(secApproval.approved_at), 'MM.dd HH:mm') : ''
                      }</p>
                    )}
                  </div>
                ) : null;
              })()}
              {viceError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-600">{viceError}</div>
              )}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">
                  추가 의견 <span className="text-gray-400 font-normal">(선택)</span>
                </label>
                <textarea
                  value={viceComment}
                  onChange={e => setViceComment(e.target.value)}
                  placeholder="추가 검토 의견이 있으면 작성해주세요 (없으면 비워두세요)"
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400 resize-none" />
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0 bg-white">
              <button onClick={() => setViceModal(null)}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-sm text-gray-600 font-medium bg-gray-50">
                취소
              </button>
              <button
                onClick={handleViceSubmit}
                disabled={actionId === viceModal.id}
                className="flex-1 py-3 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-2xl text-sm font-bold disabled:opacity-50 transition-colors">
                {actionId === viceModal.id ? '결재 중...' : '결재 확인'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          위원장 최종 승인 모달
      ══════════════════════════════════════════ */}
      {approveModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-end justify-center"
          onClick={e => { if (e.target === e.currentTarget) setApproveModal(null); }}>
          <div className="bg-white rounded-t-3xl w-full shadow-2xl flex flex-col" style={{ maxHeight: '85vh' }}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 flex-shrink-0" />
            <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-gray-100 flex-shrink-0">
              <div>
                <h3 className="text-base font-bold text-gray-900">최종 승인</h3>
                <p className="text-xs text-green-600 font-medium mt-0.5">위원장 최종 결재 · 배차 단계로 이동</p>
              </div>
              <button onClick={() => setApproveModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="bg-green-50 border border-green-100 rounded-2xl px-4 py-3">
                <p className="text-sm font-bold text-gray-800">{approveModal.destination}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {approveModal.requester?.name}
                  {approveModal.department?.name && ` · ${approveModal.department.name}`}
                </p>
                {approveModal.start_datetime && (
                  <p className="text-xs text-green-600 mt-1.5 font-medium">
                    출발 · {format(new Date(approveModal.start_datetime), 'yyyy.MM.dd(EEE) HH:mm', { locale: ko })}
                  </p>
                )}
              </div>
              {/* 부위원장 결재 내용 참고 */}
              {(() => {
                const viceApproval = approveModal.approvals?.find((a: any) => a.step === 4);
                return viceApproval?.comment ? (
                  <div className="bg-fuchsia-50 border border-fuchsia-100 rounded-xl px-3 py-2.5">
                    <p className="text-[10px] font-bold text-fuchsia-500 mb-1">부위원장 의견</p>
                    <p className="text-xs text-fuchsia-700 leading-relaxed">{viceApproval.comment}</p>
                  </div>
                ) : null;
              })()}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">
                  승인 의견 <span className="text-gray-400 font-normal">(선택)</span>
                </label>
                <textarea
                  value={approveComment}
                  onChange={e => setApproveComment(e.target.value)}
                  placeholder="승인 관련 추가 사항이 있으면 입력해주세요"
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none" />
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0 bg-white">
              <button onClick={() => setApproveModal(null)}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-sm text-gray-600 font-medium bg-gray-50">
                취소
              </button>
              <button
                onClick={handleChairApprove}
                disabled={actionId === approveModal.id}
                className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-2xl text-sm font-bold disabled:opacity-50 transition-colors">
                {actionId === approveModal.id ? '승인 처리 중...' : '✓ 최종 승인'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          반려 모달
      ══════════════════════════════════════════ */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center px-4"
          onClick={e => { if (e.target === e.currentTarget) setRejectModal(null); }}>
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900">반려 처리</h3>
                <p className="text-xs text-red-500 font-medium mt-0.5">신청자에게 반려 사유가 전달됩니다</p>
              </div>
              <button onClick={() => setRejectModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
                <p className="text-sm font-semibold text-gray-800">{rejectModal.destination}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {rejectModal.requester?.name} · <span className="font-mono">{rejectModal.request_no}</span>
                </p>
              </div>
              {rejectError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-600">{rejectError}</div>
              )}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">
                  반려 사유 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectComment}
                  onChange={e => setRejectComment(e.target.value)}
                  placeholder="신청자에게 전달할 반려 사유를 명확히 입력해주세요"
                  rows={4} autoFocus
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
              </div>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={() => setRejectModal(null)}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-sm text-gray-600 font-medium bg-gray-50">취소</button>
              <button
                onClick={handleReject}
                disabled={actionId === rejectModal.id}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-2xl text-sm font-bold disabled:opacity-60">
                {actionId === rejectModal.id ? '처리 중...' : '반려 확인'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          대기 모달
      ══════════════════════════════════════════ */}
      {holdModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center px-4"
          onClick={e => { if (e.target === e.currentTarget) setHoldModal(null); }}>
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900">대기 처리</h3>
                <p className="text-xs text-orange-500 font-medium mt-0.5">추후 재검토 대기 상태로 전환됩니다</p>
              </div>
              <button onClick={() => setHoldModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="bg-orange-50 border border-orange-100 rounded-2xl px-4 py-3">
                <p className="text-sm font-semibold text-gray-800">{holdModal.destination}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {holdModal.requester?.name} · <span className="font-mono">{holdModal.request_no}</span>
                </p>
              </div>
              {holdError && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 text-sm text-orange-700">{holdError}</div>
              )}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">
                  대기 사유 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={holdComment}
                  onChange={e => setHoldComment(e.target.value)}
                  placeholder="대기 처리 사유를 입력해주세요"
                  rows={4} autoFocus
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
              </div>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={() => setHoldModal(null)}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-sm text-gray-600 font-medium bg-gray-50">취소</button>
              <button
                onClick={handleHold}
                disabled={actionId === holdModal.id}
                className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl text-sm font-bold disabled:opacity-60">
                {actionId === holdModal.id ? '처리 중...' : '대기 확인'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          배차 등록 모달 (총무)
      ══════════════════════════════════════════ */}
      {dispatchModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-end justify-center"
          onClick={e => { if (e.target === e.currentTarget) setDispatchModal(null); }}>
          <div className="bg-white rounded-t-3xl w-full shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="flex-shrink-0 border-b border-gray-100">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-0" />
              <div className="flex items-center justify-between px-5 pt-3 pb-3">
                <div>
                  <h3 className="text-base font-bold text-gray-900">배차 등록</h3>
                  <p className="text-xs text-blue-500 font-medium mt-0.5">차량을 배정하고 배차를 완료합니다</p>
                </div>
                <button onClick={() => setDispatchModal(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* 신청 요약 */}
              <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
                <p className="text-sm font-bold text-gray-800">{dispatchModal.destination}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {dispatchModal.requester?.name}
                  {dispatchModal.department?.name && ` · ${dispatchModal.department.name}`}
                  {' · '}<span className="font-mono">{dispatchModal.request_no}</span>
                </p>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  {[
                    { label: '출발', val: dispatchModal.start_datetime },
                    { label: '반납', val: dispatchModal.end_datetime },
                  ].map(({ label, val }) => val && (
                    <div key={label}>
                      <p className="text-[9px] text-blue-400 font-semibold">{label}</p>
                      <p className="text-xs font-semibold text-blue-700">
                        {format(new Date(val), 'MM.dd(EEE) HH:mm', { locale: ko })}
                      </p>
                    </div>
                  ))}
                  {dispatchModal.vehicle_group?.name && (
                    <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full ml-auto">
                      신청: {dispatchModal.vehicle_group.name}
                    </span>
                  )}
                </div>
              </div>

              {/* 에러 */}
              {dispatchError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-600">{dispatchError}</div>
              )}

              {/* 대차 토글 */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                <div>
                  <p className="text-sm font-semibold text-gray-800">대차 사용</p>
                  <p className="text-xs text-gray-400 mt-0.5">외부 렌트카 등 내부 차량 미사용</p>
                </div>
                <button
                  onClick={() => { setDispatchIsRental(v => !v); setDispatchVehicleId(''); }}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    dispatchIsRental ? 'bg-blue-500' : 'bg-gray-200'
                  }`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    dispatchIsRental ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              {/* 차량군 선택 */}
              {!dispatchIsRental && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">차량군</label>
                  <select
                    value={dispatchVehicleGroupId}
                    onChange={e => handleDispatchGroupChange(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value="">전체 차량군</option>
                    {dispatchVehicleGroups.map((g: any) => (
                      <option key={g.id} value={g.id}>
                        {g.name}{g.id === dispatchModal?.vehicle_group_id ? ' (신청 차량군)' : ''}
                      </option>
                    ))}
                  </select>
                  {dispatchVehicleGroupId && dispatchVehicleGroupId !== dispatchModal?.vehicle_group_id && (
                    <p className="mt-1.5 text-xs text-amber-600 flex items-center gap-1">
                      <span>⚠</span> 신청자가 요청한 차량군과 다른 차량군입니다
                    </p>
                  )}
                </div>
              )}

              {/* 차량 선택 */}
              {!dispatchIsRental && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">
                    차량 선택 <span className="text-red-500">*</span>
                  </label>
                  {loadingVehicles ? (
                    <div className="flex items-center justify-center py-6 bg-gray-50 rounded-xl">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2" />
                      <span className="text-xs text-gray-400">가용 차량 조회 중...</span>
                    </div>
                  ) : dispatchVehicles.length === 0 ? (
                    <div className="py-4 bg-orange-50 border border-orange-100 rounded-xl text-center">
                      <p className="text-sm text-orange-600 font-medium">
                        {dispatchVehicleGroupId ? '해당 차량군에 가용 차량이 없습니다' : '해당 기간 가용 차량이 없습니다'}
                      </p>
                      <p className="text-xs text-orange-400 mt-0.5">차량군을 변경하거나 대차 사용을 선택해주세요</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                      {dispatchVehicles.map((v: any) => (
                        <button
                          key={v.id}
                          onClick={() => setDispatchVehicleId(v.id)}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${
                            dispatchVehicleId === v.id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}>
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            dispatchVehicleId === v.id ? 'bg-blue-500' : 'bg-gray-300'
                          }`} />
                          <div className="flex-1 text-left">
                            <p className="text-sm font-semibold text-gray-800">
                              {[v.name, v.model].filter(Boolean).join(' ')}
                            </p>
                            <p className="text-xs text-gray-400">{v.license_plate}</p>
                          </div>
                          {v.vehicle_group?.name && (
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">
                              {v.vehicle_group.name}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 기사 정보 */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-gray-700">기사 정보 <span className="text-gray-400 font-normal">(선택)</span></p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">기사 이름</label>
                    <input type="text" value={dispatchDriverName}
                      onChange={e => setDispatchDriverName(e.target.value)}
                      placeholder="홍길동"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">연락처</label>
                    <input type="tel" value={dispatchDriverPhone}
                      onChange={e => setDispatchDriverPhone(e.target.value)}
                      placeholder="010-0000-0000"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>
                </div>
              </div>

              {/* 비고 */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">
                  비고 <span className="text-gray-400 font-normal">(선택)</span>
                </label>
                <textarea
                  value={dispatchNotes}
                  onChange={e => setDispatchNotes(e.target.value)}
                  placeholder="특이사항, 주의사항 등을 입력해주세요"
                  rows={2}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
              </div>
            </div>

            <div className="flex gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0 bg-white">
              <button onClick={() => setDispatchModal(null)}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-sm text-gray-600 font-medium bg-gray-50">
                취소
              </button>
              <button
                onClick={handleDispatchSubmit}
                disabled={actionId === dispatchModal.id || (!dispatchIsRental && !dispatchVehicleId)}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-sm font-bold disabled:opacity-50 transition-colors">
                {actionId === dispatchModal.id ? '배차 처리 중...' : '🚗 배차 완료'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
