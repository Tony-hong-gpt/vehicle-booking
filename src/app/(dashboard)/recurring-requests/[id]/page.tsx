'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { describePattern, RECURRING_STATUS_CONFIG } from '@/lib/recurring-utils';

interface RecurringRequest {
  id: string;
  title: string;
  status: string;
  pattern_type: string;
  weekdays: number[] | null;
  monthly_dates: number[] | null;
  week_of_month: number | null;
  weekday: number | null;
  start_time: string;
  end_time: string;
  period_start: string;
  period_end: string;
  generated_count: number;
  reason: string | null;
  destination: string;
  passengers: number;
  driver_name: string | null;
  driver_phone: string | null;
  created_at: string;
  requester: { name: string; employee_no: string } | null;
  department: { name: string } | null;
  vehicle_group: { name: string } | null;
  purpose: { name: string } | null;
  custom_purpose: string | null;
  recurring_approvals: {
    id: string;
    step: number;
    status: string;
    comment: string | null;
    approved_at: string | null;
    approver: { name: string; role: string } | null;
  }[];
}

const STEP_LABELS: Record<number, string> = {
  3: '총무 검토',
  4: '부위원장 결재',
  5: '위원장 최종',
  99: '관리자 직권',
};

export default function RecurringRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [rr, setRr] = useState<RecurringRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [comment, setComment] = useState('');
  const [bulkComment, setBulkComment] = useState('');

  const [currentUser, setCurrentUser] = useState<{ role: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [rrRes, meRes] = await Promise.all([
        fetch(`/api/recurring-requests/${id}`),
        fetch('/api/me'),
      ]);
      const rrJson = await rrRes.json();
      const meJson = await meRes.json();
      setRr(rrJson.data);
      setCurrentUser(meJson.data || meJson);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function handleApprove() {
    setActionLoading(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/recurring-requests/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error); return; }
      setSuccess(json.message);
      setComment('');
      load();
    } finally { setActionLoading(false); }
  }

  async function handleReject() {
    if (!comment.trim()) { setError('반려 사유를 입력해주세요'); return; }
    setActionLoading(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/recurring-requests/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error); return; }
      setSuccess(json.message);
      setShowRejectModal(false);
      setComment('');
      load();
    } finally { setActionLoading(false); }
  }

  async function handleBulkApprove() {
    setActionLoading(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/recurring-requests/${id}/bulk-approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: bulkComment || '관리자 직권 승인' }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error); return; }
      setSuccess(json.message);
      setShowBulkModal(false);
      setBulkComment('');
      load();
    } finally { setActionLoading(false); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!rr) return <div className="p-6 text-gray-500">데이터를 찾을 수 없습니다</div>;

  const cfg = RECURRING_STATUS_CONFIG[rr.status] || RECURRING_STATUS_CONFIG['upper_approved'];
  const patternDesc = describePattern({
    pattern_type: rr.pattern_type as any,
    weekdays: rr.weekdays || undefined,
    monthly_dates: rr.monthly_dates || undefined,
    week_of_month: rr.week_of_month ?? undefined,
    weekday: rr.weekday ?? undefined,
    start_time: rr.start_time,
    end_time: rr.end_time,
    period_start: rr.period_start,
    period_end: rr.period_end,
  });

  const isAdmin = currentUser?.role === 'admin';

  // 현재 역할이 처리할 수 있는지 판단
  const ROLE_FROM: Record<string, string> = {
    committee_secretary: 'upper_approved',
    committee_vice: 'committee_reviewing',
    committee_chair: 'committee_vice_reviewing',
  };
  const canAct = currentUser
    ? (isAdmin ? rr.status !== 'approved' && rr.status !== 'rejected' : rr.status === (ROLE_FROM[currentUser.role] || ''))
    : false;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-1.5 rounded-xl hover:bg-gray-100 transition-colors">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{rr.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </span>
            {rr.status === 'approved' && (
              <span className="text-xs text-gray-500">{rr.generated_count}건 생성됨</span>
            )}
          </div>
        </div>
        {/* 관리자 직권 승인 버튼 */}
        {isAdmin && rr.status !== 'approved' && rr.status !== 'rejected' && rr.status !== 'cancelled' && (
          <button onClick={() => setShowBulkModal(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors">
            직권 일괄 승인
          </button>
        )}
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">{error}</div>}
      {success && <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700">{success}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 좌측: 신청 정보 */}
        <div className="lg:col-span-2 space-y-4">
          {/* 기본 정보 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-700">신청 정보</p>
            </div>
            <div className="divide-y divide-gray-50">
              {[
                { label: '등록자', value: rr.requester?.name || '-' },
                { label: '소속', value: rr.department?.name || '-' },
                { label: '사용목적', value: rr.purpose?.name || rr.custom_purpose || '-' },
                { label: '목적지', value: rr.destination },
                { label: '차량군', value: rr.vehicle_group?.name || '-' },
                { label: '탑승 인원', value: `${rr.passengers}명` },
                { label: '운전기사', value: rr.driver_name || '-' },
                ...(rr.driver_phone ? [{ label: '기사 연락처', value: rr.driver_phone }] : []),
                ...(rr.reason ? [{ label: '사용 사유', value: rr.reason }] : []),
                { label: '등록일', value: format(new Date(rr.created_at), 'yyyy.MM.dd HH:mm', { locale: ko }) },
              ].map(item => (
                <div key={item.label} className="px-5 py-3 flex justify-between items-start gap-4">
                  <span className="text-xs text-gray-500 flex-shrink-0 w-20">{item.label}</span>
                  <span className="text-sm text-gray-900 text-right">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 반복 패턴 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-700">반복 패턴</p>
            </div>
            <div className="divide-y divide-gray-50">
              {[
                { label: '패턴', value: patternDesc },
                { label: '시간', value: `${rr.start_time} ~ ${rr.end_time}` },
                { label: '적용 기간', value: `${rr.period_start} ~ ${rr.period_end}` },
              ].map(item => (
                <div key={item.label} className="px-5 py-3 flex justify-between items-start gap-4">
                  <span className="text-xs text-gray-500 flex-shrink-0 w-20">{item.label}</span>
                  <span className="text-sm text-gray-900 text-right">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 배차 안내 (승인 완료 시) */}
          {rr.status === 'approved' && (
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-blue-700">배차 안내</p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    {rr.generated_count}건의 신청이 생성되었습니다.
                    각 건은 <strong>사용 시작일 3일 전부터</strong> 배차가 가능합니다.
                    신청 관리 페이지에서 개별 배차를 진행해 주세요.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 우측: 결재 현황 + 처리 버튼 */}
        <div className="space-y-4">
          {/* 결재 이력 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-700">결재 현황</p>
            </div>
            <div className="p-4 space-y-3">
              {[3, 4, 5].map(step => {
                const approval = rr.recurring_approvals.find(a => a.step === step);
                return (
                  <div key={step} className="flex items-start gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5 ${
                      approval?.status === 'approved' ? 'bg-green-100 text-green-700'
                      : approval?.status === 'rejected' ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-400'
                    }`}>
                      {approval?.status === 'approved' ? '✓' : approval?.status === 'rejected' ? '✕' : step - 2}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-700">{STEP_LABELS[step]}</p>
                      {approval ? (
                        <>
                          <p className="text-xs text-gray-500">{approval.approver?.name || '-'}</p>
                          {approval.approved_at && (
                            <p className="text-xs text-gray-400">
                              {format(new Date(approval.approved_at), 'MM.dd HH:mm', { locale: ko })}
                            </p>
                          )}
                          {approval.comment && (
                            <p className="text-xs text-gray-500 mt-0.5 italic">"{approval.comment}"</p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-gray-400">대기 중</p>
                      )}
                    </div>
                  </div>
                );
              })}
              {/* 관리자 직권 승인 이력 */}
              {rr.recurring_approvals.filter(a => a.step === 99).map(a => (
                <div key={a.id} className="flex items-start gap-3 pt-2 border-t border-gray-100">
                  <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">
                    관
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-700">관리자 직권</p>
                    <p className="text-xs text-gray-500">{a.approver?.name || '-'}</p>
                    {a.comment && <p className="text-xs text-gray-400 italic">"{a.comment}"</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 처리 버튼 (역할별) */}
          {canAct && !isAdmin && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-700">결재 처리</p>
              <textarea value={comment} onChange={e => setComment(e.target.value)}
                placeholder="의견 (선택)" rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              <div className="flex gap-2">
                <button onClick={handleApprove} disabled={actionLoading}
                  className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-60">
                  {actionLoading ? '처리 중...' : '승인'}
                </button>
                <button onClick={() => setShowRejectModal(true)} disabled={actionLoading}
                  className="flex-1 py-2.5 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors disabled:opacity-60">
                  반려
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 반려 모달 */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-base font-bold text-gray-900 mb-3">반려 사유 입력</h3>
            <textarea value={comment} onChange={e => setComment(e.target.value)}
              placeholder="반려 사유를 입력해주세요 *" rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none mb-3" />
            <div className="flex gap-2">
              <button onClick={() => { setShowRejectModal(false); setComment(''); }}
                className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
                취소
              </button>
              <button onClick={handleReject} disabled={actionLoading}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-60">
                {actionLoading ? '처리 중...' : '반려 확인'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 직권 승인 모달 */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-base font-bold text-gray-900 mb-1">관리자 직권 일괄 승인</h3>
            <p className="text-sm text-gray-500 mb-3">
              결재 단계를 건너뛰고 즉시 승인합니다.<br />
              승인 시 개별 신청이 자동 생성됩니다.
            </p>
            <textarea value={bulkComment} onChange={e => setBulkComment(e.target.value)}
              placeholder="직권 승인 사유 (선택)" rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none mb-3" />
            <div className="flex gap-2">
              <button onClick={() => { setShowBulkModal(false); setBulkComment(''); }}
                className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
                취소
              </button>
              <button onClick={handleBulkApprove} disabled={actionLoading}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors disabled:opacity-60">
                {actionLoading ? '처리 중...' : '직권 승인'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
