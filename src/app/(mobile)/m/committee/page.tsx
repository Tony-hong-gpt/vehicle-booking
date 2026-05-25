'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import LogoutButton from '@/components/mobile/LogoutButton';

/** 역할별 결재 대기 상태 (홈 → 결재탭 이동 시 탭 결정용) */
const ROLE_PENDING_MAP: Record<string, string[]> = {
  committee_secretary: ['upper_approved', 'approved'],
  committee_vice:      ['upper_approved', 'committee_reviewing'],
  committee_chair:     ['upper_approved', 'committee_reviewing', 'committee_vice_reviewing'],
  admin:               ['upper_approved', 'committee_reviewing', 'committee_vice_reviewing', 'approved'],
};

/** 역할별 담당 상태 */
const ROLE_CONFIG: Record<string, {
  label: string;
  pendingStatuses: string[];
  pendingLabel: string;
  color: string;
  bgFrom: string;
  bgTo: string;
}> = {
  committee_secretary: {
    label: '차량위원회 총무',
    pendingStatuses: ['upper_approved'],
    pendingLabel: '총무 검토 대기',
    color: '#7C3AED',
    bgFrom: 'from-violet-600',
    bgTo: 'to-violet-700',
  },
  committee_vice: {
    label: '차량위원회 부위원장',
    pendingStatuses: ['committee_reviewing'],
    pendingLabel: '부위원장 결재 대기',
    color: '#9333EA',
    bgFrom: 'from-fuchsia-600',
    bgTo: 'to-purple-700',
  },
  committee_chair: {
    label: '차량위원회 위원장',
    pendingStatuses: ['committee_vice_reviewing'],
    pendingLabel: '최종 결재 대기',
    color: '#6D28D9',
    bgFrom: 'from-purple-700',
    bgTo: 'to-indigo-700',
  },
  admin: {
    label: '시스템 관리자',
    pendingStatuses: ['upper_approved', 'committee_reviewing', 'committee_vice_reviewing'],
    pendingLabel: '위원회 처리 대기',
    color: '#6D28D9',
    bgFrom: 'from-purple-700',
    bgTo: 'to-indigo-700',
  },
};

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  pending:                   { label: '상위승인대기',    color: 'bg-yellow-100 text-yellow-700' },
  upper_approved:            { label: '차량위원회대기',  color: 'bg-indigo-100 text-indigo-700' },
  committee_reviewing:       { label: '총무 검토완료',   color: 'bg-violet-100 text-violet-700' },
  committee_vice_reviewing:  { label: '위원장 검토중',   color: 'bg-purple-100 text-purple-700' },
  approved:                  { label: '차량위원회 승인', color: 'bg-green-100 text-green-700' },
  rejected:                  { label: '반려',            color: 'bg-red-100 text-red-700' },
  on_hold:                   { label: '대기',            color: 'bg-orange-100 text-orange-700' },
  dispatched:                { label: '배차완료',        color: 'bg-blue-100 text-blue-700' },
  returned:                  { label: '반납완료',        color: 'bg-gray-100 text-gray-600' },
  cancelled:                 { label: '취소',            color: 'bg-gray-100 text-gray-500' },
};

/** 역할별 상태 라벨 오버라이드 (committee_reviewing / committee_vice_reviewing 한정) */
const ROLE_STATUS_OVERRIDE: Record<string, Partial<Record<string, { label: string; color: string }>>> = {
  committee_secretary: {
    committee_reviewing:      { label: '부위원장 검토중',  color: 'bg-fuchsia-100 text-fuchsia-700' },
    committee_vice_reviewing: { label: '위원장 검토중',    color: 'bg-purple-100 text-purple-700' },
  },
  committee_vice: {
    committee_reviewing:      { label: '총무 검토완료',    color: 'bg-violet-100 text-violet-700' },
    committee_vice_reviewing: { label: '위원장 검토중',    color: 'bg-purple-100 text-purple-700' },
  },
  committee_chair: {
    committee_reviewing:      { label: '총무 검토완료',    color: 'bg-violet-100 text-violet-700' },
    committee_vice_reviewing: { label: '부위원장 결재완료', color: 'bg-fuchsia-100 text-fuchsia-700' },
  },
  admin: {
    committee_reviewing:      { label: '총무 검토완료',    color: 'bg-violet-100 text-violet-700' },
    committee_vice_reviewing: { label: '부위원장 결재완료', color: 'bg-fuchsia-100 text-fuchsia-700' },
  },
};

export default function CommitteeHomePage() {
  const router = useRouter();
  const [user, setUser]         = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);

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

  const config = ROLE_CONFIG[user?.role] ?? ROLE_CONFIG.committee_secretary;
  const pending = requests.filter(r => config.pendingStatuses.includes(r.status));
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthReqs = requests.filter(r => r.created_at?.slice(0, 7) === thisMonth);

  // 이번달 현황 집계
  const monthInReview  = monthReqs.filter(r => ['pending', 'upper_approved', 'committee_reviewing', 'committee_vice_reviewing'].includes(r.status));
  const monthOnHold    = monthReqs.filter(r => r.status === 'on_hold');
  const monthApproved  = monthReqs.filter(r => ['approved', 'dispatched', 'in_use', 'returned'].includes(r.status));
  const monthRejected  = monthReqs.filter(r => r.status === 'rejected');

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col min-h-full pb-4">
      {/* 헤더 */}
      <div className={`bg-gradient-to-br ${config.bgFrom} ${config.bgTo} px-5 pt-12 pb-7 relative`}>
        <div className="absolute top-4 right-4">
          <LogoutButton />
        </div>
        <p className="text-white/70 text-xs mb-0.5">
          {format(new Date(), 'yyyy년 MM월 dd일 EEEE', { locale: ko })}
        </p>
        <h1 className="text-white text-2xl font-bold tracking-tight">
          안녕하세요, {user?.name}님
        </h1>
        <p className="text-white/70 text-xs mt-1.5">{config.label}</p>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* 처리 대기 알림 */}
        {pending.length > 0 ? (
          <button onClick={() => router.push('/m/committee/approvals')}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-4 flex items-center justify-between shadow-sm active:scale-[0.98] transition-transform">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-white font-bold text-base">{config.pendingLabel} {pending.length}건</p>
                <p className="text-white/80 text-xs mt-0.5">결재가 필요합니다</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <div className="bg-green-50 border border-green-100 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-green-800">처리 완료</p>
              <p className="text-xs text-green-600 mt-0.5">대기 중인 결재 요청이 없습니다</p>
            </div>
          </div>
        )}

        {/* 이번달 현황 */}
        <div>
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">이번달 현황</p>
              <p className="text-xs font-semibold text-gray-700">
                전체 <span className="text-base font-bold text-gray-900 ml-0.5">{monthReqs.length}</span>건
              </p>
            </div>
            {/* 4개 항목 */}
            <div className="grid grid-cols-4 divide-x divide-gray-100 py-3">
              <div className="flex flex-col items-center gap-1">
                <p className="text-xl font-bold text-indigo-600">{monthInReview.length}</p>
                <p className="text-[10px] text-indigo-400 font-medium">검토 중</p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <p className="text-xl font-bold text-amber-500">{monthOnHold.length}</p>
                <p className="text-[10px] text-amber-400 font-medium">보류</p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <p className="text-xl font-bold text-green-600">{monthApproved.length}</p>
                <p className="text-[10px] text-green-500 font-medium">승인완료</p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <p className="text-xl font-bold text-red-500">{monthRejected.length}</p>
                <p className="text-[10px] text-red-400 font-medium">반려</p>
              </div>
            </div>
          </div>
        </div>

        {/* 최근 신청 목록 */}
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">최근 신청</p>
            <button onClick={() => router.push('/m/committee/approvals')}
              className="text-xs text-purple-600 font-medium">전체 보기</button>
          </div>
          <div className="space-y-2">
            {requests.slice(0, 5).map((req: any) => {
              const roleBadge = ROLE_STATUS_OVERRIDE[user?.role]?.[req.status];
              const badge = roleBadge ?? STATUS_BADGE[req.status] ?? { label: req.status, color: 'bg-gray-100 text-gray-600' };
              const rolePending = ROLE_PENDING_MAP[user?.role] ?? ROLE_PENDING_MAP.committee_secretary;
              const tabParam = rolePending.includes(req.status) ? 'pending' : 'done';
              return (
                <div key={req.id}
                  onClick={() => router.push(`/m/committee/approvals?tab=${tabParam}`)}
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
          <button onClick={() => router.push('/m/committee/approvals')}
            className="w-full bg-white rounded-2xl border border-gray-100 p-4 text-left shadow-sm active:bg-gray-50 transition-colors">
            <span className="text-2xl">📋</span>
            <p className="text-sm font-bold text-gray-900 mt-2">결재 관리</p>
            <p className="text-xs text-gray-400 mt-0.5">신청 검토 · 승인 · 반려</p>
          </button>
        </div>
      </div>
    </div>
  );
}
