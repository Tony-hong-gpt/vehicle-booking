import { createClient } from '@/lib/server/supabase';
import { getCurrentUser } from '@/lib/server/auth';
import Link from 'next/link';
import RequestListClient from '@/components/mobile/RequestListClient';

export default async function MobileRequestsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from('requests')
    .select('id, destination, status, start_datetime, end_datetime, created_at')
    .eq('requester_id', user!.id)
    .order('created_at', { ascending: false });

  const activeStatuses = ['pending', 'upper_approved', 'on_hold', 'approved', 'dispatched', 'in_use'];
  const activeRequests = requests?.filter((r: any) => activeStatuses.includes(r.status)) ?? [];
  const doneRequests   = requests?.filter((r: any) => !activeStatuses.includes(r.status)) ?? [];

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-900">신청 확인</h1>
        <p className="text-xs text-gray-400 mt-0.5">총 {requests?.length ?? 0}건</p>
      </div>

      <div className="flex-1 px-4 py-5">
        {(!requests || requests.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-gray-400 text-sm mb-4">신청 내역이 없습니다</p>
            <Link href="/m/request" className="bg-blue-600 text-white px-6 py-2.5 rounded-2xl text-sm font-semibold shadow-sm">
              첫 신청하기
            </Link>
          </div>
        ) : (
          <RequestListClient
            activeRequests={activeRequests as any}
            doneRequests={doneRequests as any}
          />
        )}
      </div>
    </div>
  );
}
