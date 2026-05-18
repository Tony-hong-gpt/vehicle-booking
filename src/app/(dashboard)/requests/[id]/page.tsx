import { createClient, createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser } from '@/lib/server/auth';
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_COLORS } from '@/lib/constants';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import RequestActions from './RequestActions';

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: req, error } = await supabase
    .from('requests')
    .select(`
      *,
      requester:users!requester_id(id, name, employee_no, email, phone, department:departments(name)),
      department:departments(name),
      purpose:purposes(name),
      vehicle_group:vehicle_groups(name),
      approvals(*, approver:users!approver_id(name, role)),
      dispatch:dispatches(*, vehicle:vehicles(name, license_plate, fuel_type), driver:drivers(id, user:users(name, phone)))
    `)
    .eq('id', id)
    .single();

  if (error || !req) notFound();

  // approvals는 RLS에 막힐 수 있으므로 admin client로 별도 조회
  const adminSupabase = createAdminClient();
  const { data: approvalsRaw } = await adminSupabase
    .from('approvals')
    .select('*, approver:users!approver_id(name, role, department:departments(name))')
    .eq('request_id', id)
    .order('approved_at', { ascending: false, nullsFirst: false });

  // 최신순 정렬 (approved_at 없는 pending은 맨 아래)
  const approvals = (approvalsRaw ?? []).sort((a: any, b: any) => {
    if (!a.approved_at && !b.approved_at) return 0;
    if (!a.approved_at) return 1;
    if (!b.approved_at) return -1;
    return new Date(b.approved_at).getTime() - new Date(a.approved_at).getTime();
  });

  // 반려 또는 대기 사유 표시용 approval 찾기
  const step1Approval = approvals?.find((a: any) => a.step === 1);
  const step2Approval = approvals?.find((a: any) => a.step === 2);
  const bannerApproval =
    req.status === 'rejected' ? (approvals?.find((a: any) => a.status === 'rejected')) :
    req.status === 'on_hold'  ? (approvals?.find((a: any) => a.status === 'on_hold'))  : null;

  // 1단계: 상위 승인 (manager가 pending 상태 건에 서명)
  const canUpperApprove = user?.role === 'manager' && req.status === 'pending';
  // 2단계: 차량위원회 처리 (admin이 upper_approved 또는 on_hold 건 처리)
  const canCommitteeProcess = user?.role === 'admin' && ['upper_approved', 'on_hold'].includes(req.status);
  // 강제 처리: admin이 pending 건을 상위 승인 없이 처리
  const canForceProcess = user?.role === 'admin' && req.status === 'pending';
  // 취소: 본인 또는 admin, 확정 전 상태
  const canCancel = (req.requester_id === user?.id || user?.role === 'admin') &&
    ['pending', 'upper_approved', 'on_hold'].includes(req.status);
  // 삭제: 취소 상태만
  const canDelete = req.status === 'cancelled' && (req.requester_id === user?.id || user?.role === 'admin');
  // 수정: admin은 모든 상태, 본인은 pending/rejected/on_hold만 가능
  const canEdit = user?.role === 'admin'
    ? true
    : req.requester_id === user?.id && ['pending', 'rejected', 'on_hold'].includes(req.status);

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <a href="/requests" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">← 목록으로</a>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{req.destination}</h1>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${REQUEST_STATUS_COLORS[req.status]}`}>
                {REQUEST_STATUS_LABELS[req.status]}
              </span>
            </div>
            <p className="text-gray-400 text-sm mt-1 font-mono">{req.request_no}</p>
          </div>
          <RequestActions
            requestId={id}
            status={req.status}
            canUpperApprove={canUpperApprove}
            canCommitteeProcess={canCommitteeProcess}
            canForceProcess={canForceProcess}
            canCancel={canCancel}
            canDelete={canDelete}
            canEdit={canEdit}
            userRole={user?.role || ''}
          />
        </div>
      </div>

      {/* 반려/대기 사유 배너 */}
      {req.status === 'on_hold' && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 mb-5">
          <div className="flex items-start gap-3">
            <span className="text-orange-500 text-lg leading-none mt-0.5">⏸</span>
            <div className="flex-1">
              <div className="flex items-start justify-between gap-4 mb-2">
                <p className="font-semibold text-orange-700">대기 사유</p>
                {bannerApproval?.approver && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-orange-600 font-medium">
                      {bannerApproval.approver.name}
                      {' '}
                      <span className="font-normal text-orange-400">
                        ({bannerApproval.approver.role === 'admin' ? '차량위원회' : bannerApproval.approver.role === 'manager' ? '상위 승인자' : bannerApproval.approver.role}
                        {bannerApproval.approver.department?.name ? ` · ${bannerApproval.approver.department.name}` : ''})
                      </span>
                    </p>
                    {bannerApproval.approved_at && (
                      <p className="text-xs text-orange-400 mt-0.5">
                        {format(new Date(bannerApproval.approved_at), 'yyyy.MM.dd HH:mm')}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <p className="text-sm text-orange-700 leading-relaxed">
                {bannerApproval?.comment
                  ? (bannerApproval.comment.includes('[CHANGES]')
                      ? bannerApproval.comment.slice(0, bannerApproval.comment.indexOf('[CHANGES]')).trim() || '대기 사유가 기록되지 않았습니다.'
                      : bannerApproval.comment)
                  : '대기 사유가 기록되지 않았습니다.'}
              </p>
            </div>
          </div>
        </div>
      )}
      {req.status === 'rejected' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-5">
          <div className="flex items-start gap-3">
            <span className="text-red-500 text-lg leading-none mt-0.5">✗</span>
            <div className="flex-1">
              <div className="flex items-start justify-between gap-4 mb-2">
                <p className="font-semibold text-red-700">반려 사유</p>
                {bannerApproval?.approver && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-red-600 font-medium">
                      {bannerApproval.approver.name}
                      {' '}
                      <span className="font-normal text-red-400">
                        ({bannerApproval.approver.role === 'admin' ? '차량위원회' : bannerApproval.approver.role === 'manager' ? '상위 승인자' : bannerApproval.approver.role}
                        {bannerApproval.approver.department?.name ? ` · ${bannerApproval.approver.department.name}` : ''})
                      </span>
                    </p>
                    {bannerApproval.approved_at && (
                      <p className="text-xs text-red-400 mt-0.5">
                        {format(new Date(bannerApproval.approved_at), 'yyyy.MM.dd HH:mm')}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <p className="text-sm text-red-700 leading-relaxed">
                {bannerApproval?.comment
                  ? (bannerApproval.comment.includes('[CHANGES]')
                      ? bannerApproval.comment.slice(0, bannerApproval.comment.indexOf('[CHANGES]')).trim() || '반려 사유가 기록되지 않았습니다.'
                      : bannerApproval.comment)
                  : '반려 사유가 기록되지 않았습니다.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 신청 정보 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-5">
        <h2 className="font-semibold text-gray-900 mb-4">신청 정보</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">신청자</span>
            <p className="mt-1 font-medium">{req.requester?.name} ({req.requester?.employee_no})</p>
          </div>
          <div>
            <span className="text-gray-500">부서</span>
            <p className="mt-1 font-medium">{req.department?.name}</p>
          </div>
          <div>
            <span className="text-gray-500">사용목적</span>
            <p className="mt-1 font-medium">{req.purpose?.name || req.custom_purpose || '-'}</p>
          </div>
          <div>
            <span className="text-gray-500">차량군</span>
            <p className="mt-1 font-medium">{req.vehicle_group?.name}</p>
          </div>
          <div>
            <span className="text-gray-500">탑승 인원</span>
            <p className="mt-1 font-medium">{req.passengers}명</p>
          </div>
          <div>
            <span className="text-gray-500">신청일시</span>
            <p className="mt-1 font-medium">{format(new Date(req.created_at), 'yyyy.MM.dd HH:mm')}</p>
          </div>
          <div className="col-span-2">
            <span className="text-gray-500">출발 ~ 반납</span>
            <p className="mt-1 font-medium">
              {format(new Date(req.start_datetime), 'yyyy.MM.dd(EEE) HH:mm', { locale: ko })}
              {' ~ '}
              {format(new Date(req.end_datetime), 'MM.dd(EEE) HH:mm', { locale: ko })}
            </p>
          </div>
          <div>
            <span className="text-gray-500">운전기사</span>
            <p className="mt-1 font-medium">{req.driver_name || '-'}</p>
          </div>
          <div>
            <span className="text-gray-500">기사 연락처</span>
            <p className="mt-1 font-medium">{req.driver_phone || '-'}</p>
          </div>
          {req.reason && (
            <div className="col-span-2">
              <span className="text-gray-500">사용 사유</span>
              <p className="mt-1">{req.reason}</p>
            </div>
          )}
        </div>
      </div>

      {/* 결재 현황 — 최신순 타임라인 */}
      {approvals && approvals.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">결재 현황</h2>
            <span className="text-xs text-gray-400">최신순</span>
          </div>
          <div className="space-y-2">
            {(() => {
              // 차량위원회(admin, step>=2) 처리 목록을 시간순으로 번호 매기기
              const committeeByTime = [...approvals]
                .filter((a: any) => a.step >= 2 && a.approver?.role === 'admin' && a.approved_at)
                .sort((a: any, b: any) => new Date(a.approved_at).getTime() - new Date(b.approved_at).getTime());
              const getCommitteeSeq = (id: string) => {
                const pos = committeeByTime.findIndex((a: any) => a.id === id);
                return pos >= 0 ? pos + 1 : null;
              };
              const totalCommittee = committeeByTime.length;

              return approvals.map((approval: any, idx: number) => {
              const isApproved = approval.status === 'approved';
              const isRejected = approval.status === 'rejected';
              const isOnHold   = approval.status === 'on_hold';
              const approverRole = approval.approver?.role;
              const approverDept = approval.approver?.department?.name;
              const isFirst  = idx === 0;
              const isLast   = idx === approvals.length - 1;

              // 차량위원회 처리 순번 (여러 번 처리된 경우 1차·2차 표시)
              const committeeSeq = getCommitteeSeq(approval.id);
              const isAdminDirectEdit = approval.step >= 2 && approverRole === 'admin';
              const isForced = approval.step === 1 && approverRole === 'admin';

              const stepLabel = isForced
                ? '강제 처리 (차량위원회)'
                : approval.step === 1
                  ? '1단계 · 상위 승인'
                  : totalCommittee > 1 && committeeSeq
                    ? `차량위원회 · ${committeeSeq}차 처리`
                    : '차량위원회';

              const roleLabel = approverRole === 'admin'
                ? '차량위원회'
                : approverRole === 'manager' ? '상위 승인자' : approverRole || '';

              // 상태별 색상
              const statusBadge = isApproved
                ? 'bg-green-100 text-green-700'
                : isRejected ? 'bg-red-100 text-red-700'
                : isOnHold   ? 'bg-orange-100 text-orange-700'
                : 'bg-gray-100 text-gray-500';
              const statusLabel = isApproved ? '승인' : isRejected ? '반려' : isOnHold ? '대기' : '미처리';
              const leftBorder = isApproved
                ? 'border-l-green-400'
                : isRejected ? 'border-l-red-400'
                : isOnHold   ? 'border-l-orange-400'
                : 'border-l-gray-200';
              const commentColor = isRejected
                ? 'text-red-600'
                : isOnHold ? 'text-orange-600'
                : 'text-gray-500';

              // comment에서 변경사항 줄과 메모 줄 분리 (줄바꿈 기준)
              const commentLines = approval.comment
                ? approval.comment.split('\n').map((l: string) => l.trim()).filter(Boolean)
                : [];

              return (
                <div key={approval.id}>
                  {/* 카드 */}
                  <div className={`border border-gray-100 border-l-4 ${leftBorder} rounded-lg overflow-hidden`}>
                    {/* 헤더 행 */}
                    <div className="px-4 py-2.5 bg-gray-50 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {isFirst && (
                          <span className="text-[10px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded-full leading-none flex-shrink-0">
                            최신
                          </span>
                        )}
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${statusBadge}`}>
                          {statusLabel}
                        </span>
                        <span className="text-xs text-gray-500 truncate">
                          {stepLabel}
                          {isForced && isApproved && ' ⚡'}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {approval.approved_at
                          ? format(new Date(approval.approved_at), 'yyyy.MM.dd HH:mm')
                          : '처리 전'}
                      </span>
                    </div>

                    {/* 바디 */}
                    <div className="px-4 py-3 bg-white">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">
                            {approval.approver?.name || '-'}
                          </p>
                          {(roleLabel || approverDept) && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {[roleLabel, approverDept].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* 코멘트 파싱: [CHANGES] 구분자 기준으로 메모 / 변경사항 분리 */}
                      {(() => {
                        if (!approval.comment) return null;
                        const raw: string = approval.comment;
                        const changesIdx = raw.indexOf('[CHANGES]');
                        const notePart   = changesIdx >= 0 ? raw.slice(0, changesIdx).trim() : raw.trim();
                        const changesPart = changesIdx >= 0
                          ? raw.slice(changesIdx + '[CHANGES]'.length).trim()
                          : '';
                        const changeLines = changesPart
                          ? changesPart.split('\n').map((l: string) => l.trim()).filter(Boolean)
                          : [];

                        return (
                          <div className="mt-2 space-y-2">
                            {/* 관리자 메모 */}
                            {notePart && (
                              <p className={`text-sm leading-relaxed ${commentColor}`}>{notePart}</p>
                            )}
                            {/* 변경 사항 블록 */}
                            {changeLines.length > 0 && (
                              <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5">
                                <p className="text-[11px] font-semibold text-blue-500 mb-1.5 flex items-center gap-1">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                  변경 사항
                                </p>
                                <ul className="space-y-0.5">
                                  {changeLines.map((line: string, li: number) => (
                                    <li key={li} className="text-xs text-blue-700 flex items-start gap-1.5">
                                      <span className="mt-1 w-1 h-1 rounded-full bg-blue-400 flex-shrink-0" />
                                      {line}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* 연결선 (마지막 제외) */}
                  {!isLast && (
                    <div className="flex justify-start ml-5 my-1">
                      <div className="w-px h-4 bg-gray-200" />
                    </div>
                  )}
                </div>
              );
            });
            })()}
          </div>
        </div>
      )}

      {/* 배차 정보 */}
      {req.dispatch && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-semibold text-gray-900">배차 정보</h2>
            {req.dispatch.is_rental && (
              <span className="px-2.5 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">
                🚐 외부 대차
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">배차 차량</span>
              <p className="mt-1 font-medium">
                {req.dispatch.is_rental
                  ? '외부 대차'
                  : req.dispatch.vehicle
                    ? `${req.dispatch.vehicle.name} (${req.dispatch.vehicle.license_plate})`
                    : '-'}
              </p>
            </div>
            <div>
              <span className="text-gray-500">운전기사</span>
              <p className="mt-1 font-medium">
                {req.dispatch.driver?.user?.name || req.dispatch.driver_name || '-'}
              </p>
            </div>
            {(req.dispatch.driver?.user?.phone || req.dispatch.driver_phone) && (
              <div>
                <span className="text-gray-500">기사 연락처</span>
                <p className="mt-1 font-medium">
                  {req.dispatch.driver?.user?.phone || req.dispatch.driver_phone}
                </p>
              </div>
            )}
            {req.dispatch.scheduled_start && (
              <div>
                <span className="text-gray-500">출발 예정</span>
                <p className="mt-1 font-medium">
                  {format(new Date(req.dispatch.scheduled_start), 'yyyy.MM.dd(EEE) HH:mm', { locale: ko })}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
