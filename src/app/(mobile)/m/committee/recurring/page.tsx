'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { describePattern, RECURRING_STATUS_CONFIG } from '@/lib/recurring-utils';

/** 역할별 처리 가능 상태 */
const ROLE_FROM: Record<string, string> = {
  committee_secretary: 'upper_approved',
  committee_vice:      'committee_reviewing',
  committee_chair:     'committee_vice_reviewing',
  admin:               '*',
};

const ROLE_ACTION_LABEL: Record<string, string> = {
  committee_secretary: '총무 검토 완료',
  committee_vice:      '부위원장 결재',
  committee_chair:     '위원장 최종 승인',
  admin:               '승인',
};

export default function CommitteeRecurringPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'done'>('pending');

  // 상세 모달
  const [selected, setSelected] = useState<any | null>(null);
  const [comment, setComment] = useState('');
  const [rejectComment, setRejectComment] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, rrRes] = await Promise.all([
        fetch('/api/auth/me').then(r => r.json()),
        fetch('/api/recurring-requests?page_size=100').then(r => r.json()),
      ]);
      setUser(meRes.data);
      setItems(rrRes.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const role = user?.role ?? '';
  const fromStatus = ROLE_FROM[role] ?? '';

  const pendingItems = items.filter(r =>
    fromStatus === '*'
      ? !['approved', 'rejected', 'cancelled'].includes(r.status)
      : r.status === fromStatus
  );
  const doneItems = items.filter(r =>
    ['approved', 'rejected', 'cancelled'].includes(r.status)
  );

  const displayItems = tab === 'pending' ? pendingItems : doneItems;

  async function handleApprove() {
    if (!selected) return;
    setActionLoading(true); setActionError('');
    try {
      const res = await fetch(`/api/recurring-requests/${selected.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment }),
      });
      const json = await res.json();
      if (!res.ok) { setActionError(json.error); return; }
      showToast('✅ ' + json.message);
      setSelected(null); setComment('');
      load();
    } finally { setActionLoading(false); }
  }

  async function handleReject() {
    if (!selected) return;
    if (!rejectComment.trim()) { setActionError('반려 사유를 입력해주세요'); return; }
    setActionLoading(true); setActionError('');
    try {
      const res = await fetch(`/api/recurring-requests/${selected.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: rejectComment }),
      });
      const json = await res.json();
      if (!res.ok) { setActionError(json.error); return; }
      showToast('반려 처리되었습니다');
      setSelected(null); setShowReject(false); setRejectComment(''); setComment('');
      load();
    } finally { setActionLoading(false); }
  }

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.back()} className="p-1">
          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-gray-900">장기 신청 결재</h1>
      </div>

      {/* 탭 */}
      <div className="bg-white border-b border-gray-100 px-4">
        <div className="flex gap-0">
          {(['pending', 'done'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${
                tab === t ? 'border-violet-600 text-violet-600' : 'border-transparent text-gray-400'
              }`}>
              {t === 'pending' ? `처리 대기 ${pendingItems.length > 0 ? `(${pendingItems.length})` : ''}` : '처리 완료'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : displayItems.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            {tab === 'pending' ? '처리 대기 중인 장기 신청이 없습니다' : '처리 완료된 장기 신청이 없습니다'}
          </div>
        ) : (
          displayItems.map(item => {
            const cfg = RECURRING_STATUS_CONFIG[item.status];
            const pattern = describePattern({
              pattern_type: item.pattern_type,
              weekdays: item.weekdays,
              monthly_dates: item.monthly_dates,
              week_of_month: item.week_of_month,
              weekday: item.weekday,
              start_time: item.start_time,
              end_time: item.end_time,
              period_start: item.period_start,
              period_end: item.period_end,
            });
            return (
              <button key={item.id} onClick={() => { setSelected(item); setComment(''); setShowReject(false); setActionError(''); }}
                className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-left active:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-bold text-gray-900 flex-1">{item.title}</p>
                  {cfg && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color} flex-shrink-0`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500">{item.department?.name} · {item.vehicle_group?.name}</p>
                  <p className="text-xs text-gray-500">{item.destination}</p>
                  <p className="text-xs text-violet-600 font-medium">{pattern} · {item.start_time}~{item.end_time}</p>
                  <p className="text-xs text-gray-400">{item.period_start} ~ {item.period_end}</p>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-gray-900/90 text-white text-sm px-4 py-2.5 rounded-2xl shadow-lg z-50 whitespace-nowrap">
          {toast}
        </div>
      )}

      {/* 상세 & 처리 모달 */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="w-full bg-white rounded-t-3xl max-h-[85vh] overflow-y-auto pb-8">
            <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">{selected.title}</h2>
              <button onClick={() => setSelected(null)} className="p-1">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-4 py-4 space-y-4">
              {/* 기본 정보 */}
              <div className="bg-gray-50 rounded-2xl divide-y divide-gray-100">
                {[
                  { label: '소속', value: selected.department?.name || '-' },
                  { label: '차량군', value: selected.vehicle_group?.name || '-' },
                  { label: '목적지', value: selected.destination },
                  { label: '사용목적', value: selected.purpose?.name || selected.custom_purpose || '-' },
                  { label: '탑승 인원', value: `${selected.passengers}명` },
                  ...(selected.driver_name ? [{ label: '운전기사', value: selected.driver_name }] : []),
                ].map(row => (
                  <div key={row.label} className="px-4 py-2.5 flex justify-between items-center gap-3">
                    <span className="text-xs text-gray-500 flex-shrink-0">{row.label}</span>
                    <span className="text-sm font-medium text-gray-800 text-right">{row.value}</span>
                  </div>
                ))}
              </div>

              {/* 패턴 정보 */}
              <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4">
                <p className="text-xs font-bold text-violet-700 mb-2">반복 패턴</p>
                <p className="text-sm font-semibold text-violet-900">
                  {describePattern({
                    pattern_type: selected.pattern_type,
                    weekdays: selected.weekdays,
                    monthly_dates: selected.monthly_dates,
                    week_of_month: selected.week_of_month,
                    weekday: selected.weekday,
                    start_time: selected.start_time,
                    end_time: selected.end_time,
                    period_start: selected.period_start,
                    period_end: selected.period_end,
                  })}
                </p>
                <p className="text-xs text-violet-600 mt-1">
                  {selected.start_time}~{selected.end_time} · {selected.period_start} ~ {selected.period_end}
                </p>
              </div>

              {/* 배차 안내 */}
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3">
                <p className="text-xs text-blue-600">
                  💡 승인 완료 시 개별 신청이 자동 생성되며, 각 건의 <strong>사용 시작일 3일 전부터</strong> 배차 가능합니다.
                </p>
              </div>

              {actionError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-600">{actionError}</div>
              )}

              {/* 결재 처리 (처리 가능한 경우) */}
              {tab === 'pending' && (fromStatus === '*' || selected.status === fromStatus) && (
                <>
                  {!showReject ? (
                    <div className="space-y-3">
                      <textarea value={comment} onChange={e => setComment(e.target.value)}
                        placeholder="의견 (선택)" rows={2}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
                      <div className="flex gap-2">
                        <button onClick={handleApprove} disabled={actionLoading}
                          className="flex-1 py-3 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors disabled:opacity-60">
                          {actionLoading ? '처리 중...' : ROLE_ACTION_LABEL[role] || '승인'}
                        </button>
                        <button onClick={() => setShowReject(true)} disabled={actionLoading}
                          className="flex-1 py-3 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors">
                          반려
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <textarea value={rejectComment} onChange={e => setRejectComment(e.target.value)}
                        placeholder="반려 사유를 입력해주세요 *" rows={3}
                        className="w-full px-3 py-2.5 border border-red-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
                      <div className="flex gap-2">
                        <button onClick={() => { setShowReject(false); setRejectComment(''); }}
                          className="flex-1 py-3 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
                          취소
                        </button>
                        <button onClick={handleReject} disabled={actionLoading}
                          className="flex-1 py-3 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-60">
                          {actionLoading ? '처리 중...' : '반려 확인'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
