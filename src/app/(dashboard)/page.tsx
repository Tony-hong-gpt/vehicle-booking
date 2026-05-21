import { createClient } from '@/lib/server/supabase';
import { getCurrentUser } from '@/lib/server/auth';
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_COLORS, VEHICLE_STATUS_LABELS, VEHICLE_STATUS_COLORS } from '@/lib/constants';
import Link from 'next/link';
import { formatKST } from '@/lib/date-utils';
import RequestCalendar from '@/components/dashboard/RequestCalendar';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [
    { count: pendingRequests },
    { count: activeDispatches },
    { count: availableVehicles },
    { count: totalVehicles },
    { count: monthlyRequests },
  ] = await Promise.all([
    supabase.from('requests').select('*', { count: 'exact', head: true }).in('status', ['pending', 'upper_approved']),
    supabase.from('dispatches').select('*', { count: 'exact', head: true }).in('status', ['scheduled', 'in_progress']),
    supabase.from('vehicles').select('*', { count: 'exact', head: true }).eq('status', 'available'),
    supabase.from('vehicles').select('*', { count: 'exact', head: true }).neq('status', 'inactive'),
    supabase.from('requests').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth),
  ]);

  const { data: recentRequests } = await supabase
    .from('requests')
    .select('id, request_no, destination, status, start_datetime, created_at, requester:users!requester_id(name), purpose:purposes(name)')
    .order('created_at', { ascending: false })
    .limit(7);

  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, name, license_plate, capacity, status, vehicle_group:vehicle_groups(name)')
    .order('name')
    .limit(8);

  const stats = [
    {
      label: '이번달 신청',
      value: monthlyRequests ?? 0,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      iconColor: 'text-blue-500',
      icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    },
    {
      label: '결재 대기',
      value: pendingRequests ?? 0,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      iconColor: 'text-amber-500',
      icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    },
    {
      label: '배차 · 운행 중',
      value: activeDispatches ?? 0,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      iconColor: 'text-purple-500',
      icon: 'M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h2m6-12h3l3 4v4h-6V4z',
    },
    {
      label: '가용 차량',
      value: `${availableVehicles ?? 0} / ${totalVehicles ?? 0}`,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      iconColor: 'text-emerald-500',
      icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    },
  ];

  const VEHICLE_DOT: Record<string, string> = {
    available:   'bg-emerald-400',
    in_use:      'bg-blue-400',
    maintenance: 'bg-amber-400',
    inactive:    'bg-gray-300',
  };

  return (
    <div className="p-6 max-w-[1400px]">
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">대시보드</h1>
        <p className="text-gray-400 mt-1 text-sm">
          안녕하세요,&nbsp;<span className="font-semibold text-gray-600">{user?.name}</span>님
          &nbsp;·&nbsp;{formatKST(new Date(), 'yyyy년 MM월 dd일 EEEE')}
        </p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className={`w-12 h-12 ${s.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
              <svg className={`w-6 h-6 ${s.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={s.icon} />
              </svg>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium mb-0.5">{s.label}</p>
              <p className={`text-2xl font-bold tracking-tight ${s.color}`}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 달력 */}
      <div className="mb-6">
        <RequestCalendar />
      </div>

      {/* 최근 신청 + 차량 현황 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* 최근 신청 */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
            <h2 className="font-semibold text-gray-900">최근 신청</h2>
            <Link href="/requests" className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
              전체 보기
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {(!recentRequests || recentRequests.length === 0) && (
              <div className="px-6 py-10 text-center text-gray-400 text-sm">신청 내역이 없습니다</div>
            )}
            {recentRequests?.map((req: any) => (
              <Link key={req.id} href={`/requests/${req.id}`}
                className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50/80 transition-colors group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-400 font-mono">{req.request_no}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${REQUEST_STATUS_COLORS[req.status]}`}>
                      {REQUEST_STATUS_LABELS[req.status]}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-gray-800 truncate">{req.destination}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{req.requester?.name} · {req.purpose?.name}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-xs text-gray-400 whitespace-nowrap">
                    {formatKST(req.start_datetime, 'MM/dd HH:mm')}
                  </div>
                  <svg className="w-4 h-4 text-gray-200 group-hover:text-gray-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* 차량 현황 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
            <h2 className="font-semibold text-gray-900">차량 현황</h2>
            <Link href="/vehicles" className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
              전체 보기
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {vehicles?.map((v: any) => (
              <div key={v.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${VEHICLE_DOT[v.status] ?? 'bg-gray-300'}`} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{v.vehicle_group?.name ?? '-'}</div>
                    <div className="text-xs text-gray-400 flex items-center gap-1.5">
                      {v.license_plate && <span>{v.license_plate}</span>}
                      {v.license_plate && v.capacity && <span className="text-gray-300">·</span>}
                      {v.capacity && <span>{v.capacity}명</span>}
                    </div>
                  </div>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ml-2 flex-shrink-0 ${VEHICLE_STATUS_COLORS[v.status]}`}>
                  {VEHICLE_STATUS_LABELS[v.status]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
