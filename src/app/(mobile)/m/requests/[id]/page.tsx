'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { EMPLOYEE_STATUS_LABELS, REQUEST_STATUS_COLORS } from '@/lib/constants';
import { vehicleName } from '@/lib/vehicle-utils';

const STEP_LABELS: Record<number, string> = {
  1: '1단계 · 상위 승인',
  2: '2단계 · 차량위원회',
};

export default function MobileRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [id, setId] = useState('');
  const [req, setReq] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    params.then(p => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/requests/${id}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) setError(json.error);
        else setReq(json.data);
      })
      .catch(() => setError('데이터를 불러올 수 없습니다'))
      .finally(() => setLoading(false));
  }, [id]);

  // 승인완료·배차완료 신청을 열면 '읽음' 처리 → nav 배지 업데이트
  useEffect(() => {
    if (!req || !id) return;
    if (req.status === 'approved' || req.status === 'dispatched') {
      const seen: string[] = JSON.parse(localStorage.getItem('seen_notifications') || '[]');
      if (!seen.includes(id)) {
        seen.push(id);
        localStorage.setItem('seen_notifications', JSON.stringify(seen));
        window.dispatchEvent(new Event('notification-seen'));
      }
    }
  }, [req, id]);

  async function handleDelete() {
    if (!confirm('신청을 완전히 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.')) return;
    setDeleting(true);
    const res = await fetch(`/api/requests/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.error) {
      alert(json.error);
      setDeleting(false);
    } else {
      router.push('/m/requests');
    }
  }

  async function handleCancel() {
    if (!confirm('신청을 취소하시겠습니까?')) return;
    setCancelling(true);
    const res = await fetch(`/api/requests/${id}/cancel`, { method: 'POST' });
    const json = await res.json();
    if (json.error) {
      alert(json.error);
      setCancelling(false);
    } else {
      router.push('/m/requests');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400 text-sm">
        불러오는 중...
      </div>
    );
  }

  if (error || !req) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
        <p className="text-gray-500 text-sm">{error || '신청을 찾을 수 없습니다'}</p>
        <Link href="/m/requests" className="text-blue-600 text-sm font-medium">목록으로</Link>
      </div>
    );
  }

  const approvals = req.approvals || [];
  const dispatch = Array.isArray(req.dispatch) ? req.dispatch[0] : req.dispatch;

  // 반려/대기 approval 레코드
  const rejectedApproval = approvals.find((a: any) => a.status === 'rejected');
  const heldApproval     = approvals.find((a: any) => a.status === 'on_hold' || a.comment?.startsWith?.('[대기]'));

  // 매니저 반려인지 위원회 반려인지 구분
  const isManagerRejection   = req.status === 'rejected' && rejectedApproval && (rejectedApproval.step ?? 99) <= 2;
  const isCommitteeRejection = req.status === 'rejected' && rejectedApproval && (rejectedApproval.step ?? 99) >= 3;

  // 배너용 (manager 반려만 이름 표시, 위원회는 이름 숨김)
  const bannerApproval =
    req.status === 'rejected' ? rejectedApproval :
    req.status === 'on_hold'  ? heldApproval : null;

  const canCancel = ['pending', 'upper_approved', 'on_hold', 'approved'].includes(req.status);
  const canEdit   = ['pending', 'on_hold', 'rejected'].includes(req.status);
  const canDelete = req.status === 'cancelled';

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm shadow-gray-100/60">
        <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors -ml-1">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-gray-900 truncate">{req.destination}</h1>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{req.request_no}</p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold flex-shrink-0 ${REQUEST_STATUS_COLORS[req.status] || 'bg-gray-100 text-gray-500'}`}>
          {EMPLOYEE_STATUS_LABELS[req.status] || req.status}
        </span>
      </div>

      <div className="flex-1 px-4 py-5 space-y-4">
        {/* 대기/반려 배너 */}
        {req.status === 'on_hold' && bannerApproval && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3 mb-1.5">
              <p className="text-xs font-semibold text-orange-600">⏸ 대기 사유</p>
              {bannerApproval.approved_at && (
                <p className="text-xs text-orange-400 flex-shrink-0">
                  {format(new Date(bannerApproval.approved_at), 'MM.dd HH:mm')}
                </p>
              )}
            </div>
            <p className="text-sm text-orange-700">
              {bannerApproval.comment?.replace(/^\[대기\]\s*/, '').replace(/^\[강제처리\]\[대기\]\s*/, '')}
            </p>
          </div>
        )}
        {req.status === 'rejected' && bannerApproval && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3 mb-1.5">
              <p className="text-xs font-semibold text-red-600">✗ 반려 사유</p>
              <div className="text-right flex-shrink-0">
                {/* 상위 반려만 이름 표시, 위원회 반려는 이름 숨김 */}
                {isManagerRejection && bannerApproval.approver && (
                  <p className="text-xs text-red-500 font-medium">{bannerApproval.approver.name}</p>
                )}
                {bannerApproval.approved_at && (
                  <p className="text-xs text-red-400 mt-0.5">
                    {format(new Date(bannerApproval.approved_at), 'MM.dd HH:mm')}
                  </p>
                )}
              </div>
            </div>
            <p className="text-sm text-red-700">{bannerApproval.comment}</p>
          </div>
        )}

        {/* 신청 정보 */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-bold text-gray-800">신청 정보</p>
          </div>
          <div className="divide-y divide-gray-50">
            {[
              { label: '소속', value: req.department?.name || '-' },
              { label: '사용목적', value: req.purpose?.name || req.custom_purpose || '-' },
              { label: '차량군', value: req.vehicle_group?.name || '-' },
              { label: '탑승 인원', value: `${req.passengers}명` },
              { label: '출발', value: format(new Date(req.start_datetime), 'yyyy.MM.dd(EEE) HH:mm', { locale: ko }) },
              { label: '반납', value: format(new Date(req.end_datetime), 'MM.dd(EEE) HH:mm', { locale: ko }) },
              { label: '운전기사', value: req.driver_name || '-' },
              { label: '기사 연락처', value: req.driver_phone || '-' },
              { label: '신청일', value: format(new Date(req.created_at), 'yyyy.MM.dd HH:mm') },
              ...(req.reason ? [{ label: '사용 사유', value: req.reason }] : []),
            ].map(item => (
              <div key={item.label} className="px-4 py-3 flex justify-between gap-4">
                <span className="text-xs text-gray-400 flex-shrink-0 pt-0.5">{item.label}</span>
                <span className="text-sm font-semibold text-gray-900 text-right">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 결재 현황 — 신청자용 간소화 2블록 뷰 */}
        {(() => {
          const STATUS = req.status;
          const managerApproval = approvals.find((a: any) => a.step <= 2 && a.status === 'approved');

          // ── 블록 1: 상위승인 ──
          const block1 = (() => {
            if (isManagerRejection) return {
              icon: '✗', bg: 'bg-red-100 text-red-600',
              label: '상위 반려',
              date: rejectedApproval?.approved_at,
            };
            if (managerApproval) return {
              icon: '✓', bg: 'bg-green-100 text-green-600',
              label: '상위승인',
              date: managerApproval.approved_at,
            };
            return {
              icon: '…', bg: 'bg-gray-100 text-gray-400',
              label: '상위승인 대기',
              date: null,
            };
          })();

          // ── 블록 2: 차량위원회 ──
          const showCommittee = !isManagerRejection && STATUS !== 'pending';
          const committeeApproval = approvals.find((a: any) => a.step === 5 && a.status === 'approved')
            ?? approvals.find((a: any) => a.step >= 3 && a.status === 'approved');

          const block2 = (() => {
            if (!showCommittee) return null;
            if (STATUS === 'upper_approved') return {
              icon: '…', bg: 'bg-blue-100 text-blue-600', label: '차량위원회 대기', date: null, pulse: false,
            };
            if (STATUS === 'committee_reviewing' || STATUS === 'committee_vice_reviewing') return {
              icon: '◉', bg: 'bg-violet-100 text-violet-600', label: '차량위원회 검토중', date: null, pulse: true,
            };
            if (['approved', 'dispatched', 'in_use', 'returned'].includes(STATUS)) return {
              icon: '✓', bg: 'bg-green-100 text-green-600', label: '차량위원회 승인',
              date: committeeApproval?.approved_at ?? null, pulse: false, extra: null,
            };
            if (STATUS === 'cancelled') return {
              icon: '✓', bg: 'bg-green-100 text-green-600', label: '차량위원회 승인',
              date: committeeApproval?.approved_at ?? null, pulse: false,
              extra: { icon: '✗', bg: 'bg-gray-100 text-gray-500', label: '차량위원회 취소', date: null },
            };
            if (isCommitteeRejection) return {
              icon: '✗', bg: 'bg-red-100 text-red-600', label: '차량위원회 반려',
              date: rejectedApproval?.approved_at ?? null, pulse: false, extra: null,
            };
            if (STATUS === 'on_hold') return {
              icon: '⏸', bg: 'bg-orange-100 text-orange-600', label: '차량위원회 대기',
              date: heldApproval?.approved_at ?? null, pulse: false, extra: null,
            };
            return null;
          })();

          return (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-bold text-gray-800">결재 현황</p>
              </div>
              <div className="divide-y divide-gray-50">
                {/* 블록 1 */}
                <div className="px-4 py-3.5 flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${block1.bg}`}>
                    {block1.icon}
                  </div>
                  <div className="flex-1 min-w-0 flex justify-between items-center gap-2">
                    <p className="text-sm font-semibold text-gray-800">{block1.label}</p>
                    {block1.date && (
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {format(new Date(block1.date), 'MM.dd HH:mm')}
                      </span>
                    )}
                  </div>
                </div>
                {/* 블록 2 */}
                {block2 && (
                  <div className="px-4 py-3.5 flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${block2.bg}`}>
                      {block2.pulse
                        ? <span className="w-2.5 h-2.5 rounded-full bg-current animate-pulse" />
                        : block2.icon}
                    </div>
                    <div className="flex-1 min-w-0 flex justify-between items-center gap-2">
                      <p className="text-sm font-semibold text-gray-800">{block2.label}</p>
                      {block2.date && (
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {format(new Date(block2.date), 'MM.dd HH:mm')}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {/* 블록 3: 취소 (cancelled 시 차량위원회 승인 다음에 추가) */}
                {block2?.extra && (
                  <div className="px-4 py-3.5 flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${block2.extra.bg}`}>
                      {block2.extra.icon}
                    </div>
                    <div className="flex-1 min-w-0 flex justify-between items-center gap-2">
                      <p className="text-sm font-semibold text-gray-800">{block2.extra.label}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* 배차 정보 */}
        {dispatch && (dispatch.vehicle || dispatch.is_rental) && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-bold text-gray-800">배차 정보</p>
            </div>
            <div className="divide-y divide-gray-50">
              {[
                dispatch.is_rental
                  ? { label: '차량', value: '외부 대차' }
                  : dispatch.vehicle
                    ? { label: '차량', value: `${vehicleName(dispatch.vehicle)} (${dispatch.vehicle.license_plate})` }
                    : null,
                (dispatch.driver?.user?.name || dispatch.driver_name)
                  ? { label: '운전기사', value: dispatch.driver?.user?.name || dispatch.driver_name }
                  : null,
                dispatch.driver_phone
                  ? { label: '기사 연락처', value: dispatch.driver_phone }
                  : null,
                dispatch.scheduled_start
                  ? { label: '출발 예정', value: format(new Date(dispatch.scheduled_start), 'MM.dd(EEE) HH:mm', { locale: ko }) }
                  : null,
              ].filter(Boolean).map((item: any) => (
                <div key={item.label} className="px-4 py-3 flex justify-between gap-4">
                  <span className="text-xs text-gray-400 flex-shrink-0 pt-0.5">{item.label}</span>
                  <span className="text-sm font-semibold text-gray-900 text-right">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 수정 / 취소 버튼 */}
        <div className="space-y-2 pb-2">
          {canEdit && (
            <Link href={`/m/requests/${id}/edit`}
              className="w-full bg-blue-600 text-white py-3.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              신청 수정
            </Link>
          )}
          {canCancel && (
            <button onClick={handleCancel} disabled={cancelling}
              className="w-full border border-gray-300 text-gray-600 py-3.5 rounded-2xl text-sm font-medium disabled:opacity-60">
              {cancelling ? '취소 중...' : '신청 취소'}
            </button>
          )}
          {canDelete && (
            <button onClick={handleDelete} disabled={deleting}
              className="w-full border border-red-300 text-red-500 py-3.5 rounded-2xl text-sm font-medium disabled:opacity-60">
              {deleting ? '삭제 중...' : '신청 삭제'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
