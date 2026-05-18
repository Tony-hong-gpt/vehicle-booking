import { createClient } from '@/lib/server/supabase';
import { getCurrentUser } from '@/lib/server/auth';
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_COLORS } from '@/lib/constants';
import Link from 'next/link';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import RequestsExportBtn from '@/components/dashboard/RequestsExportBtn';

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const pageSize = 10;
  const status = params.status;

  let query = supabase
    .from('requests')
    .select(`
      id, request_no, destination, status, start_datetime, end_datetime, passengers, created_at,
      driver_name, driver_phone,
      requester:users!requester_id(name, employee_no),
      department:departments(name),
      purpose:purposes(name),
      vehicle_group:vehicle_groups(name)
    `, { count: 'exact' });

  if (user?.role === 'employee') query = query.eq('requester_id', user.id);
  if (user?.role === 'manager' && user.department_id) query = query.eq('department_id', user.department_id);
  if (status) query = query.eq('status', status);
  query = query.order('created_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);

  const { data: requests, count } = await query;
  const totalPages = Math.ceil((count || 0) / pageSize);

  const statusOptions = [
    { value: '',               label: '전체' },
    { value: 'pending',        label: '상위승인대기' },
    { value: 'upper_approved', label: '위원회대기' },
    { value: 'on_hold',        label: '대기' },
    { value: 'approved',       label: '승인' },
    { value: 'rejected',       label: '반려' },
    { value: 'dispatched',     label: '배차완료' },
    { value: 'in_use',         label: '운행중' },
    { value: 'returned',       label: '반납완료' },
    { value: 'cancelled',      label: '취소' },
  ];

  return (
    <div className="p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">신청 관리</h1>
          <p className="text-gray-400 mt-1 text-sm">총 <span className="font-semibold text-gray-600">{count ?? 0}건</span></p>
        </div>
        <div className="flex items-center gap-2">
          <RequestsExportBtn />
          <Link
            href="/requests/new"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            신규 신청
          </Link>
        </div>
      </div>

      {/* 상태 필터 */}
      <div className="flex gap-1.5 mb-5 flex-wrap">
        {statusOptions.map(opt => {
          const isActive = (status || '') === opt.value;
          return (
            <Link
              key={opt.value}
              href={opt.value ? `/requests?status=${opt.value}` : '/requests'}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {opt.label}
            </Link>
          );
        })}
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/70">
              <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500">신청번호</th>
              <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500">신청자</th>
              <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500">목적지</th>
              <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500">목적</th>
              <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500">출발 / 반납</th>
              <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500">상태</th>
              <th className="px-5 py-3.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(!requests || requests.length === 0) && (
              <tr>
                <td colSpan={7} className="px-5 py-14 text-center text-gray-400 text-sm">
                  신청 내역이 없습니다
                </td>
              </tr>
            )}
            {requests?.map((req: any) => (
              <tr key={req.id} className="hover:bg-gray-50/70 transition-colors group">
                <td className="px-5 py-4 font-mono text-xs text-gray-400">{req.request_no}</td>
                <td className="px-5 py-4">
                  <div className="font-semibold text-gray-900 text-sm">{req.requester?.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{req.department?.name}</div>
                </td>
                <td className="px-5 py-4 font-semibold text-gray-900 text-sm">{req.destination}</td>
                <td className="px-5 py-4 text-gray-500 text-sm">{req.purpose?.name}</td>
                <td className="px-5 py-4 text-sm whitespace-nowrap">
                  <div className="text-gray-900 font-medium">{format(new Date(req.start_datetime), 'yy.MM.dd(EEE) HH:mm', { locale: ko })}</div>
                  <div className="text-gray-400 text-xs mt-0.5">~ {format(new Date(req.end_datetime), 'yy.MM.dd(EEE) HH:mm', { locale: ko })}</div>
                </td>
                <td className="px-5 py-4">
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${REQUEST_STATUS_COLORS[req.status]}`}>
                    {REQUEST_STATUS_LABELS[req.status]}
                  </span>
                </td>
                <td className="px-5 py-4 text-right">
                  <Link
                    href={`/requests/${req.id}`}
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    상세
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-1.5 mt-6">
          {page > 1 && (
            <Link
              href={`/requests?${status ? `status=${status}&` : ''}page=${page - 1}`}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-gray-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
          )}
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <Link
              key={p}
              href={`/requests?${status ? `status=${status}&` : ''}page=${p}`}
              className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                page === p
                  ? 'bg-gray-900 text-white'
                  : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {p}
            </Link>
          ))}
          {page < totalPages && (
            <Link
              href={`/requests?${status ? `status=${status}&` : ''}page=${page + 1}`}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-gray-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
