import { createClient } from '@/lib/server/supabase';
import { getCurrentUser } from '@/lib/server/auth';
import Link from 'next/link';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import LogoutButton from '@/components/mobile/LogoutButton';
import RecentRequestsClient from '@/components/mobile/RecentRequestsClient';


export default async function MobileHomePage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: recentRequests } = await supabase
    .from('requests')
    .select('id, destination, status, start_datetime, end_datetime, request_no')
    .eq('requester_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(3);

  // 진행 중인 신청 전체 (최종 완료·취소·반려 제외)
  const { count: activeCount } = await supabase
    .from('requests')
    .select('*', { count: 'exact', head: true })
    .eq('requester_id', user!.id)
    .in('status', [
      'pending', 'upper_approved',
      'committee_reviewing', 'committee_vice_reviewing',
      'on_hold', 'approved', 'dispatched', 'in_use',
    ]);

  // 상위 결재 대기 (부서장 승인 전)
  const { count: managerPendingCount } = await supabase
    .from('requests')
    .select('*', { count: 'exact', head: true })
    .eq('requester_id', user!.id)
    .in('status', ['pending']);

  // 차량위원회 검토 중
  const { count: committeeCount } = await supabase
    .from('requests')
    .select('*', { count: 'exact', head: true })
    .eq('requester_id', user!.id)
    .in('status', ['upper_approved', 'committee_reviewing', 'committee_vice_reviewing', 'on_hold']);

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      {/* 헤더 */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-5 pt-12 pb-7 relative">
        <div className="absolute top-4 right-4">
          <LogoutButton />
        </div>
        <p className="text-blue-200 text-sm mb-0.5">안녕하세요 👋</p>
        <h1 className="text-white text-2xl font-bold tracking-tight">{user?.name}님</h1>
        <p className="text-blue-300 text-xs mt-1.5">
          {format(new Date(), 'yyyy년 MM월 dd일 EEEE', { locale: ko })}
        </p>
      </div>

      {/* 요약 카드 (헤더에 걸친 형태) */}
      <div className="px-4 -mt-5">
        <div className="grid grid-cols-3 gap-2.5">

          {/* 진행 중인 신청 */}
          <div className="bg-white border border-blue-100 rounded-2xl shadow-md p-3 flex flex-col items-center">
            <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center mb-2.5">
              <svg className="w-4.5 h-4.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-2xl font-bold text-blue-600 leading-none">{activeCount ?? 0}</p>
            <p className="text-[10px] text-gray-400 font-medium text-center mt-1.5 leading-tight">진행 중인<br/>신청</p>
          </div>

          {/* 상위 결재 대기 */}
          <div className="bg-white border border-amber-100 rounded-2xl shadow-md p-3 flex flex-col items-center">
            <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center mb-2.5">
              <svg className="w-4.5 h-4.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-2xl font-bold text-amber-500 leading-none">{managerPendingCount ?? 0}</p>
            <p className="text-[10px] text-gray-400 font-medium text-center mt-1.5 leading-tight">상위 결재<br/>대기</p>
          </div>

          {/* 차량위원회 검토 중 */}
          <div className="bg-white border border-violet-100 rounded-2xl shadow-md p-3 flex flex-col items-center">
            <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center mb-2.5">
              <svg className="w-4.5 h-4.5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-2xl font-bold text-violet-600 leading-none">{committeeCount ?? 0}</p>
            <p className="text-[10px] text-gray-400 font-medium text-center mt-1.5 leading-tight">차량위원회<br/>검토 중</p>
          </div>

        </div>
      </div>

      {/* 빠른 메뉴 */}
      <div className="px-4 mt-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">빠른 메뉴</p>
        <div className="grid grid-cols-2 gap-3">
          {/* 차량 신청 — 메인 CTA */}
          <Link href="/m/request"
            className="col-span-2 bg-blue-600 hover:bg-blue-700 rounded-2xl p-5 flex items-center gap-4 shadow-sm active:scale-[0.98] transition-all">
            <div className="w-12 h-12 bg-white/15 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <p className="text-white font-bold text-base">차량 신청</p>
              <p className="text-blue-200 text-xs mt-0.5">새 차량 이용 신청하기</p>
            </div>
            <svg className="w-5 h-5 text-blue-300 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>

          <Link href="/m/requests"
            className="bg-white rounded-2xl p-4 flex flex-col items-center gap-2.5 shadow-sm border border-gray-100 active:scale-[0.98] transition-all">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <span className="text-gray-700 text-sm font-semibold">신청 확인</span>
          </Link>

          <Link href="/m/profile"
            className="bg-white rounded-2xl p-4 flex flex-col items-center gap-2.5 shadow-sm border border-gray-100 active:scale-[0.98] transition-all">
            <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <span className="text-gray-700 text-sm font-semibold">내 정보</span>
          </Link>
        </div>
      </div>

      {/* 최근 신청 */}
      <div className="px-4 mt-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">최근 신청</p>
          <Link href="/m/requests" className="text-xs text-blue-600 font-medium flex items-center gap-0.5">
            전체 보기
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        <RecentRequestsClient requests={recentRequests ?? []} />
      </div>
    </div>
  );
}
