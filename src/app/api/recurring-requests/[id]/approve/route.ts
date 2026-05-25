import { createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';
import { generateRecurringDates } from '@/lib/recurring-utils';

/** 역할별 처리 가능 상태와 승인 후 전환 상태 */
const ROLE_FLOW: Record<string, { from: string; to: string; step: number }> = {
  committee_secretary: { from: 'upper_approved',           to: 'committee_reviewing',      step: 3 },
  committee_vice:      { from: 'committee_reviewing',      to: 'committee_vice_reviewing', step: 4 },
  committee_chair:     { from: 'committee_vice_reviewing', to: 'approved',                 step: 5 },
  admin:               { from: '*',                        to: 'approved',                 step: 5 },
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const flow = ROLE_FLOW[user.role];
    if (!flow) return Response.json({ data: null, error: '권한이 없습니다' }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const supabase = createAdminClient();

    // 현재 장기 신청 조회
    const { data: rr, error: rrErr } = await supabase
      .from('recurring_requests')
      .select('*')
      .eq('id', id)
      .single();
    if (rrErr || !rr) return createErrorResponse('장기 신청을 찾을 수 없습니다');

    // 처리 가능한 상태인지 확인
    if (flow.from !== '*' && rr.status !== flow.from) {
      return Response.json({ data: null, error: '현재 상태에서 처리할 수 없습니다' }, { status: 400 });
    }

    // 결재 이력 저장
    await supabase.from('recurring_approvals').insert({
      recurring_request_id: id,
      approver_id: user.id,
      step: flow.step,
      status: 'approved',
      comment: body.comment || null,
      approved_at: new Date().toISOString(),
    });

    // 상태 업데이트
    await supabase
      .from('recurring_requests')
      .update({ status: flow.to, updated_at: new Date().toISOString() })
      .eq('id', id);

    // 위원장(또는 관리자)이 최종 승인하면 개별 requests 자동 생성
    if (flow.to === 'approved') {
      await generateIndividualRequests(supabase, { ...rr, id });
    }

    return Response.json({ data: { status: flow.to }, error: null, message: '승인되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}

async function generateIndividualRequests(supabase: any, rr: any) {
  const dates = generateRecurringDates({
    pattern_type: rr.pattern_type,
    weekdays: rr.weekdays,
    monthly_dates: rr.monthly_dates,
    week_of_month: rr.week_of_month,
    weekday: rr.weekday,
    start_time: rr.start_time,
    end_time: rr.end_time,
    period_start: rr.period_start,
    period_end: rr.period_end,
  });

  if (dates.length === 0) return;

  // 신청번호 생성 함수 호출용 - 순차적으로 insert
  const payloads = dates.map(d => ({
    requester_id: rr.requester_id,
    department_id: rr.department_id,
    purpose_id: rr.purpose_id || null,
    custom_purpose: rr.custom_purpose || null,
    vehicle_group_id: rr.vehicle_group_id,
    destination: rr.destination,
    passengers: rr.passengers,
    driver_name: rr.driver_name || null,
    driver_phone: rr.driver_phone || null,
    start_datetime: d.startISO,
    end_datetime: d.endISO,
    reason: rr.reason || null,
    status: 'approved',
    recurring_request_id: rr.id,
  }));

  // 배치 insert (50건씩 나눠서)
  const BATCH = 50;
  for (let i = 0; i < payloads.length; i += BATCH) {
    await supabase.from('requests').insert(payloads.slice(i, i + BATCH));
  }

  // generated_count 업데이트
  await supabase
    .from('recurring_requests')
    .update({ generated_count: dates.length, updated_at: new Date().toISOString() })
    .eq('id', rr.id);
}
