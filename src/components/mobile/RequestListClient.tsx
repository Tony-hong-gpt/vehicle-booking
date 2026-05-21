'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { EMPLOYEE_STATUS_LABELS, REQUEST_STATUS_COLORS } from '@/lib/constants';

interface RequestItem {
  id: string;
  status: string;
  destination: string;
  start_datetime: string;
  end_datetime: string;
}

interface Props {
  activeRequests: RequestItem[];
  doneRequests: RequestItem[];
}

export default function RequestListClient({ activeRequests, doneRequests }: Props) {
  const [seenIds,   setSeenIds]   = useState<string[]>([]);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  useEffect(() => {
    const load = () => {
      const seen: string[] = JSON.parse(localStorage.getItem('seen_notifications') || '[]');
      setSeenIds(seen);
    };
    load();
    window.addEventListener('notification-seen', load);
    return () => window.removeEventListener('notification-seen', load);
  }, []);

  useEffect(() => {
    const hidden: string[] = JSON.parse(localStorage.getItem('hidden_request_ids') || '[]');
    setHiddenIds(hidden);
  }, []);

  const isNew = (req: RequestItem) =>
    (req.status === 'approved' || req.status === 'dispatched') && !seenIds.includes(req.id);

  function RequestCard({ req, dimmed = false }: { req: RequestItem; dimmed?: boolean }) {
    const _new = isNew(req);
    return (
      <Link
        href={`/m/requests/${req.id}`}
        className={`bg-white rounded-2xl border p-4 flex items-center gap-3 active:scale-[0.98] transition-all shadow-sm block ${
          _new ? 'border-blue-200' : 'border-gray-100'
        } ${dimmed ? 'opacity-60' : ''}`}
      >
        {/* 왼쪽: 목적지 + 날짜 */}
        <div className="flex-1 min-w-0">
          <p className={`font-bold truncate text-sm mb-1 ${dimmed ? 'text-gray-700' : 'text-gray-900'}`}>
            {req.destination}
          </p>
          <p className="text-xs text-gray-400">
            {format(new Date(req.start_datetime), 'MM/dd(EEE) HH:mm', { locale: ko })}
            {!dimmed && (
              <>
                {' ~ '}
                {format(new Date(req.end_datetime), 'MM/dd(EEE)', { locale: ko })}
              </>
            )}
          </p>
        </div>

        {/* 오른쪽: N 배지 + 상태 배지 + 화살표 */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* N 배지 — 미확인 배차완료 건에만 */}
          {_new && (
            <span className="min-w-[18px] h-[18px] bg-red-500 rounded-full flex items-center justify-center px-1">
              <span className="text-white text-[9px] font-bold leading-none">N</span>
            </span>
          )}
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${REQUEST_STATUS_COLORS[req.status]}`}>
            {EMPLOYEE_STATUS_LABELS[req.status]}
          </span>
          <svg
            className={`w-4 h-4 flex-shrink-0 ${dimmed ? 'text-gray-200' : 'text-gray-300'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </Link>
    );
  }

  const visibleActive = activeRequests.filter(r => !hiddenIds.includes(r.id));
  const visibleDone   = doneRequests.filter(r => !hiddenIds.includes(r.id));

  return (
    <div className="space-y-6">
      {/* 진행 중 */}
      {visibleActive.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            진행 중 · {visibleActive.length}건
          </p>
          <div className="space-y-2.5">
            {visibleActive.map(req => (
              <RequestCard key={req.id} req={req} />
            ))}
          </div>
        </div>
      )}

      {/* 완료 / 취소 */}
      {visibleDone.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            완료 · 취소 · {visibleDone.length}건
          </p>
          <div className="space-y-2.5">
            {visibleDone.map(req => (
              <RequestCard key={req.id} req={req} dimmed />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
