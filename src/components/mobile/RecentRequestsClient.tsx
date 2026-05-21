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
  request_no?: string;
}

interface Props {
  requests: RequestItem[];
}

export default function RecentRequestsClient({ requests }: Props) {
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  useEffect(() => {
    const hidden: string[] = JSON.parse(localStorage.getItem('hidden_request_ids') || '[]');
    setHiddenIds(hidden);
  }, []);

  const visible = requests.filter(r => !hiddenIds.includes(r.id));

  if (visible.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <p className="text-gray-400 text-sm">신청 내역이 없습니다</p>
        <Link href="/m/request" className="mt-3 inline-block text-blue-600 text-sm font-semibold">
          첫 신청하기 →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {visible.map((req) => (
        <Link key={req.id} href={`/m/requests/${req.id}`}
          className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 active:scale-[0.98] transition-all shadow-sm">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 truncate text-sm mb-1">{req.destination}</p>
            <p className="text-xs text-gray-400">
              {format(new Date(req.start_datetime), 'MM/dd(EEE) HH:mm', { locale: ko })}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${REQUEST_STATUS_COLORS[req.status] || 'bg-gray-100 text-gray-500'}`}>
              {EMPLOYEE_STATUS_LABELS[req.status] || req.status}
            </span>
            <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
      ))}
    </div>
  );
}
