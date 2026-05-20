import { createClient } from '@/lib/server/supabase';
import { getCurrentUser } from '@/lib/server/auth';
import { EMPLOYEE_STATUS_LABELS, REQUEST_STATUS_COLORS } from '@/lib/constants';
import Link from 'next/link';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import LogoutButton from '@/components/mobile/LogoutButton';

export default async function MobileHomePage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: recentRequests } = await supabase
    .from('requests')
    .select('id, destination, status, start_datetime, end_datetime, request_no')
    .eq('requester_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(3);

  const { count: activeCount } = await supabase
    .from('requests')
    .select('*', { count: 'exact', head: true })
    .eq('requester_id', user!.id)
    .in('status', ['pending', 'upper_approved', 'on_hold', 'approved', 'dispatched', 'in_use']);

  const { count: pendingCount } = await supabase
    .from('requests')
    .select('*', { count: 'exact', head: true })
    .eq('requester_id', user!.id)
    .in('status', ['pending', 'upper_approved', 'on_hold']);

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
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 px-5 pt-7 pb-5 grid grid-cols-2 divide-x divide-gray-100">
          <div className="pr-4 flex flex-col items-center">
            <p className="text-xs text-gray-400 font-medium">진행 중인 신청</p>
            <p className="text-3xl font-bold text-blue-600 mt-1.5">{activeCount ?? 0}<span className="text-sm font-semibold ml-0.5">건</span></p>
          </div>
          <div className="pl-4 flex flex-col items-center">
            <p className="text-xs text-gray-400 font-medium">결재 대기</p>
            <p className="text-3xl font-bold text-amber-500 mt-1.5">{pendingCount ?? 0}<span className="text-sm font-semibold ml-0.5">건</span></p>
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

        {(!recentRequests || recentRequests.length === 0) ? (
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
        ) : (
          <div className="space-y-2.5">
            {recentRequests.map((req: any) => (
              <Link key={req.id} href={`/m/requests/${req.id}`}
                className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 active:scale-[0.98] transition-all shadow-sm">
                {/* 왼쪽: 목적지 + 날짜 */}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 truncate text-sm mb-1">{req.destination}</p>
                  <p className="text-xs text-gray-400">
                    {format(new Date(req.start_datetime), 'MM/dd(EEE) HH:mm', { locale: ko })}
                  </p>
                </div>
                {/* 오른쪽: 상태 배지 + 화살표 */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${REQUEST_STATUS_COLORS[req.status]}`}>
                    {EMPLOYEE_STATUS_LABELS[req.status]}
                  </span>
                  <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
