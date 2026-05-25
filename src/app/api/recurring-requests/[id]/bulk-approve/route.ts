import { createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';
import { generateRecurringDates } from '@/lib/recurring-utils';

/** 관리자 직권 일괄 승인 — 어떤 상태에서든 즉시 approved로 전환하고 requests 생성 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    if (user.role !== 'admin') {
      return Response.json({ data: null, error: '관리자만 직권 승인할 수 있습니다' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const supabase = createAdminClient();

    const { data: rr, error: rrErr } = await supabase
      .from('recurring_requests')
      .select('*')
      .eq('id', id)
      .single();
    if (rrErr || !rr) return createErrorResponse('장기 신청을 찾을 수 없습니다');

    if (rr.status === 'approved') {
      return Response.json({ data: null, error: '이미 승인된 신청입니다' }, { status: 400 });
    }

    // 직권 승인 이력 저장
    await supabase.from('recurring_approvals').insert({
      recurring_request_id: id,
      approver_id: user.id,
      step: 99,
      status: 'approved',
      comment: body.comment || '관리자 직권 승인',
      approved_at: new Date().toISOString(),
    });

    // 상태 업데이트
    await supabase
      .from('recurring_requests')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', id);

    // 개별 requests 생성
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

    if (dates.length > 0) {
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

      const BATCH = 50;
      for (let i = 0; i < payloads.length; i += BATCH) {
        await supabase.from('requests').insert(payloads.slice(i, i + BATCH));
      }

      await supabase
        .from('recurring_requests')
        .update({ generated_count: dates.length, updated_at: new Date().toISOString() })
        .eq('id', id);
    }

    return Response.json({
      data: { status: 'approved', generated_count: dates.length },
      error: null,
      message: `직권 승인 완료. ${dates.length}건의 신청이 생성되었습니다`,
    });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
