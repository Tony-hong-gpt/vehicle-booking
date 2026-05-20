'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  requestId: string;
  status: string;
  canUpperApprove: boolean;       // manager + pending
  canCommitteeProcess: boolean;   // admin + upper_approved | on_hold | committee_*
  canSecretaryReview: boolean;    // committee_secretary + upper_approved
  canViceReview: boolean;         // committee_vice + committee_reviewing
  canChairProcess: boolean;       // committee_chair + committee_vice_reviewing
  canForceProcess: boolean;       // admin + pending
  canCancel: boolean;
  canEdit: boolean;
  canDelete: boolean;
  userRole: string;
}

type InputMode = 'reject-upper' | 'reject-committee' | 'hold' | 'force-approve' | 'force-reject' | 'force-hold' | null;

export default function RequestActions({
  requestId, status,
  canUpperApprove, canCommitteeProcess,
  canSecretaryReview, canViceReview, canChairProcess,
  canForceProcess,
  canCancel, canEdit, canDelete, userRole,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>(null);
  const [reason, setReason] = useState('');
  const [showForce, setShowForce] = useState(false);

  function resetInput() { setInputMode(null); setReason(''); }

  async function callApi(endpoint: string, body: object) {
    const res = await fetch(`/api/requests/${requestId}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) { alert(json.error || '처리 중 오류가 발생했습니다'); return false; }
    return true;
  }

  async function handle(action: string, body: object, loadingKey: string) {
    setLoading(loadingKey);
    try {
      const ok = await callApi(action, body);
      if (ok) { resetInput(); setShowForce(false); router.refresh(); }
    } finally {
      setLoading('');
    }
  }

  async function handleDelete() {
    if (!confirm('이 신청을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
    setLoading('delete');
    try {
      const res = await fetch(`/api/requests/${requestId}`, { method: 'DELETE' });
      const json = await res.json();
      if (res.ok) router.push('/requests');
      else alert(json.error || '삭제에 실패했습니다');
    } finally { setLoading(''); }
  }

  return (
    <div className="flex flex-col items-end gap-2 min-w-[200px]">

      {/* ── 기본 액션 버튼 ── */}
      <div className="flex gap-2 flex-wrap justify-end">
        {canEdit && (
          <button onClick={() => router.push(`/requests/${requestId}/edit`)} disabled={!!loading}
            className="px-4 py-2 border border-blue-300 text-blue-600 hover:bg-blue-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-60">
            수정
          </button>
        )}
        {canCancel && (
          <button onClick={() => handle('cancel', {}, 'cancel')} disabled={!!loading}
            className="px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-60">
            {loading === 'cancel' ? '처리중...' : '취소'}
          </button>
        )}
        {canDelete && (
          <button onClick={handleDelete} disabled={!!loading}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60">
            {loading === 'delete' ? '삭제 중...' : '삭제'}
          </button>
        )}
      </div>

      {/* ── 1단계: 상위 승인 (manager + pending) ── */}
      {canUpperApprove && !inputMode && (
        <div className="flex gap-2">
          <button onClick={() => handle('upper-approve', {}, 'upper-approve')} disabled={!!loading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60">
            {loading === 'upper-approve' ? '처리중...' : '상위 승인'}
          </button>
          <button onClick={() => setInputMode('reject-upper')} disabled={!!loading}
            className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-sm font-medium transition-colors">
            반려
          </button>
        </div>
      )}

      {/* 상위 승인 단계 반려 입력 */}
      {inputMode === 'reject-upper' && (
        <div className="w-full space-y-2">
          <p className="text-xs text-gray-500 font-medium">반려 사유 입력</p>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
            placeholder="반려 사유를 입력하세요"
            className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
          <div className="flex gap-2 justify-end">
            <button onClick={resetInput} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">취소</button>
            <button onClick={() => handle('reject', { comment: reason }, 'reject')}
              disabled={!reason.trim() || !!loading}
              className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm disabled:opacity-60">
              {loading === 'reject' ? '처리중...' : '반려 확인'}
            </button>
          </div>
        </div>
      )}

      {/* ── 간사 검토 시작 (committee_secretary + upper_approved) ── */}
      {canSecretaryReview && !inputMode && (
        <div className="flex gap-2">
          <button onClick={() => handle('committee-review', {}, 'committee-review')} disabled={!!loading}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60">
            {loading === 'committee-review' ? '처리중...' : '간사 검토 시작'}
          </button>
          <button onClick={() => setInputMode('reject-committee')} disabled={!!loading}
            className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-sm font-medium">
            반려
          </button>
        </div>
      )}

      {/* ── 부위원장 검토 완료 (committee_vice + committee_reviewing) ── */}
      {canViceReview && !inputMode && (
        <div className="flex gap-2">
          <button onClick={() => handle('committee-vice-review', {}, 'committee-vice-review')} disabled={!!loading}
            className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60">
            {loading === 'committee-vice-review' ? '처리중...' : '부위원장 검토 완료'}
          </button>
          <button onClick={() => setInputMode('reject-committee')} disabled={!!loading}
            className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-sm font-medium">
            반려
          </button>
        </div>
      )}

      {/* ── 위원장 최종 결재 (committee_chair + committee_vice_reviewing) ── */}
      {canChairProcess && !inputMode && (
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={() => handle('approve', {}, 'approve')} disabled={!!loading}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60">
            {loading === 'approve' ? '처리중...' : '최종 승인'}
          </button>
          <button onClick={() => setInputMode('reject-committee')} disabled={!!loading}
            className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-sm font-medium">
            반려
          </button>
          <button onClick={() => setInputMode('hold')} disabled={!!loading}
            className="px-4 py-2 bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200 rounded-lg text-sm font-medium">
            대기
          </button>
        </div>
      )}

      {/* ── 2단계: 차량위원회 처리 (admin + upper_approved | on_hold | committee_*) ── */}
      {canCommitteeProcess && !inputMode && (
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={() => handle('approve', {}, 'approve')} disabled={!!loading}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60">
            {loading === 'approve' ? '처리중...' : '승인'}
          </button>
          <button onClick={() => setInputMode('reject-committee')} disabled={!!loading}
            className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-sm font-medium">
            반려
          </button>
          {status !== 'on_hold' && (
            <button onClick={() => setInputMode('hold')} disabled={!!loading}
              className="px-4 py-2 bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200 rounded-lg text-sm font-medium">
              대기
            </button>
          )}
        </div>
      )}

      {/* 차량위원회 반려 입력 */}
      {inputMode === 'reject-committee' && (
        <div className="w-full space-y-2">
          <p className="text-xs text-gray-500 font-medium">반려 사유 입력</p>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
            placeholder="반려 사유를 입력하세요"
            className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
          <div className="flex gap-2 justify-end">
            <button onClick={resetInput} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">취소</button>
            <button onClick={() => handle('reject', { comment: reason }, 'reject')}
              disabled={!reason.trim() || !!loading}
              className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm disabled:opacity-60">
              {loading === 'reject' ? '처리중...' : '반려 확인'}
            </button>
          </div>
        </div>
      )}

      {/* 대기 사유 입력 */}
      {inputMode === 'hold' && (
        <div className="w-full space-y-2">
          <p className="text-xs text-gray-500 font-medium">대기 사유 입력</p>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
            placeholder="대기 사유를 입력하세요"
            className="w-full px-3 py-2 border border-orange-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
          <div className="flex gap-2 justify-end">
            <button onClick={resetInput} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">취소</button>
            <button onClick={() => handle('hold', { comment: reason }, 'hold')}
              disabled={!reason.trim() || !!loading}
              className="px-4 py-1.5 bg-orange-500 text-white rounded-lg text-sm disabled:opacity-60">
              {loading === 'hold' ? '처리중...' : '대기 확인'}
            </button>
          </div>
        </div>
      )}

      {/* ── 강제 처리 (admin + pending, 상위 승인 미완료) ── */}
      {canForceProcess && (
        <div className="w-full">
          <button onClick={() => { setShowForce(v => !v); resetInput(); }}
            className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
              ${showForce ? 'bg-yellow-100 border-yellow-300 text-yellow-800' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-yellow-50 hover:border-yellow-200 hover:text-yellow-700'}`}>
            ⚡ 강제 처리 {showForce ? '▲' : '▼'}
          </button>

          {showForce && !inputMode && (
            <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg space-y-2">
              <p className="text-xs text-yellow-700 font-medium">⚠ 상위 승인 없이 강제 처리합니다. 사유 필수 입력.</p>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setInputMode('force-approve')}
                  className="flex-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">
                  강제 승인
                </button>
                <button onClick={() => setInputMode('force-reject')}
                  className="flex-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700">
                  강제 반려
                </button>
                <button onClick={() => setInputMode('force-hold')}
                  className="flex-1 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600">
                  강제 대기
                </button>
              </div>
            </div>
          )}

          {/* 강제 처리 사유 입력 */}
          {showForce && inputMode && inputMode.startsWith('force') && (
            <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg space-y-2">
              <p className="text-xs text-yellow-700 font-medium">
                {inputMode === 'force-approve' ? '⚡ 강제 승인' : inputMode === 'force-reject' ? '⚡ 강제 반려' : '⚡ 강제 대기'} — 사유 입력
              </p>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
                placeholder="강제 처리 사유를 입력하세요 (필수)"
                className="w-full px-3 py-2 border border-yellow-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none" />
              <div className="flex gap-2 justify-end">
                <button onClick={resetInput} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">취소</button>
                <button
                  onClick={() => {
                    if (inputMode === 'force-approve') handle('approve', { comment: reason }, 'force-approve');
                    else if (inputMode === 'force-reject') handle('reject', { comment: reason }, 'force-reject');
                    else handle('hold', { comment: reason }, 'force-hold');
                  }}
                  disabled={!reason.trim() || !!loading}
                  className="px-4 py-1.5 bg-yellow-600 text-white rounded-lg text-xs font-medium disabled:opacity-60">
                  {!!loading ? '처리중...' : '확인'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
