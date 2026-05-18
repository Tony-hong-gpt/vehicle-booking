'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import LogoutButton from '@/components/mobile/LogoutButton';

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  pending:        { label: '승인 대기',    color: 'bg-yellow-100 text-yellow-700' },
  upper_approved: { label: '차량위원회 대기', color: 'bg-blue-100 text-blue-700' },
  approved:       { label: '승인',         color: 'bg-green-100 text-green-700' },
  rejected:       { label: '반려',         color: 'bg-red-100 text-red-700' },
  dispatched:     { label: '배차완료',     color: 'bg-indigo-100 text-indigo-700' },
  returned:       { label: '반납완료',     color: 'bg-gray-100 text-gray-600' },
};

export default function ManagerHomePage() {
  const router = useRouter();
  const [user, setUser]           = useState<any>(null);
  const [requests, setRequests]   = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/auth/me').then(r => r.json()),
      fetch('/api/requests?page_size=200').then(r => r.json()),
    ]).then(([me, reqs]) => {
      setUser(me.data);
      setRequests(reqs.data || []);
      setLoading(false);
    });
  }, []);

  const pending   = requests.filter(r => r.status === 'pending');
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthReqs = requests.filter(r => r.created_at?.slice(0, 7) === thisMonth);
  const approved  = requests.filter(r => ['upper_approved', 'approved', 'dispatched', 'returned'].includes(r.status));
  const rejected  = requests.filter(r => r.status === 'rejected');

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col min-h-full pb-4">
      {/* 헤더 */}
      <div className="bg-[#02AA4B] px-5 pt-12 pb-7 relative">
        <div className="absolute top-4 right-4">
          <LogoutButton />
        </div>
        <p className="text-emerald-100 text-xs mb-0.5">
          {format(new Date(), 'yyyy년 MM월 dd일 EEEE', { locale: ko })}
        </p>
        <h1 className="text-white text-2xl font-bold tracking-tight">
          안녕하세요, {user?.name}님
        </h1>
        <p className="text-emerald-100 text-xs mt-1.5">부서관리자 · {user?.departments?.[0]?.name ?? ''}</p>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* 승인 대기 알림 */}
        {pending.length > 0 && (
          <button onClick={() => router.push('/m/manager/approvals')}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-4 flex items-center justify-between shadow-sm active:scale-[0.98] transition-transform">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-white font-bold text-base">승인 대기 {pending.length}건</p>
                <p className="text-white/80 text-xs mt-0.5">즉시 처리가 필요합니다</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {pending.length === 0 && (
          <div className="bg-green-50 border border-green-100 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-green-800">처리 완료</p>
              <p className="text-xs text-green-600 mt-0.5">대기 중인 승인 요청이 없습니다</p>
            </div>
          </div>
        )}

        {/* 이번달 요약 카드 */}
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 px-1">이번달 현황</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: '전체 신청',  count: monthReqs.length, color: 'text-gray-800',  bg: 'bg-white',       border: 'border border-gray-100' },
              { label: '승인 완료',  count: approved.filter(r => r.created_at?.slice(0,7) === thisMonth).length, color: 'text-green-700', bg: 'bg-green-50', border: '' },
              { label: '반려',       count: rejected.filter(r => r.created_at?.slice(0,7) === thisMonth).length, color: 'text-red-600',   bg: 'bg-red-50',   border: '' },
            ].map(s => (
              <div key={s.label} className={`${s.bg} ${s.border} rounded-2xl p-3.5 text-center shadow-sm`}>
                <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
                <p className="text-xs text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 최근 신청 목록 */}
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">최근 신청</p>
            <button onClick={() => router.push('/m/manager/approvals')}
              className="text-xs text-blue-600 font-medium">전체 보기</button>
          </div>
          <div className="space-y-2">
            {requests.slice(0, 5).map((req: any) => {
              const badge = STATUS_BADGE[req.status] ?? { label: req.status, color: 'bg-gray-100 text-gray-600' };
              return (
                <div key={req.id}
                  onClick={() => router.push('/m/manager/approvals')}
                  className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 flex items-center justify-between shadow-sm active:bg-gray-50">
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-sm font-semibold text-gray-900 truncate">{req.destination}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {req.requester?.name} · {req.start_datetime ? format(new Date(req.start_datetime), 'MM.dd HH:mm') : '-'}
                    </p>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${badge.color}`}>
                    {badge.label}
                  </span>
                </div>
              );
            })}
            {requests.length === 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 px-4 py-8 text-center text-gray-400 text-sm">
                신청 내역이 없습니다
              </div>
            )}
          </div>
        </div>

        {/* 바로가기 */}
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 px-1">바로가기</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: '승인 관리', desc: '신청 승인 · 반려', icon: '✅', href: '/m/manager/approvals' },
              { label: '부서 통계', desc: '이용 현황 분석',   icon: '📊', href: '/m/manager/stats' },
            ].map(item => (
              <button key={item.href} onClick={() => router.push(item.href)}
                className="bg-white rounded-2xl border border-gray-100 p-4 text-left shadow-sm active:bg-gray-50 transition-colors">
                <span className="text-2xl">{item.icon}</span>
                <p className="text-sm font-bold text-gray-900 mt-2">{item.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
