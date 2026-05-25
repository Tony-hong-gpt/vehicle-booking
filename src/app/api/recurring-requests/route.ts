import { createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

const SELECTS = `
  *,
  requester:users!requester_id(id, name, employee_no),
  department:departments(id, name),
  purpose:purposes(id, name),
  vehicle_group:vehicle_groups(id, name),
  recurring_approvals(*, approver:users!approver_id(id, name, role))
`;

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = Number(searchParams.get('page') || 1);
    const pageSize = Math.min(Number(searchParams.get('page_size') || 20), 100);

    const supabase = createAdminClient();
    let query = supabase
      .from('recurring_requests')
      .select(SELECTS, { count: 'exact' })
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const from = (page - 1) * pageSize;
    query = query.range(from, from + pageSize - 1);

    const { data, error, count } = await query;
    if (error) return createErrorResponse(error.message);

    return Response.json({
      data,
      total: count || 0,
      page,
      page_size: pageSize,
      total_pages: Math.ceil((count || 0) / pageSize),
      error: null,
    });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    if (!['admin', 'committee_secretary', 'committee_vice', 'committee_chair'].includes(user.role)) {
      return Response.json({ data: null, error: '권한이 없습니다' }, { status: 403 });
    }

    const body = await request.json();

    // 필수값 검증
    const required = ['title', 'department_id', 'vehicle_group_id', 'destination',
                      'pattern_type', 'start_time', 'end_time', 'period_start', 'period_end'];
    for (const field of required) {
      if (!body[field]) {
        return Response.json({ data: null, error: `${field} 필드가 필요합니다` }, { status: 400 });
      }
    }
    if (!body.purpose_id && !body.custom_purpose) {
      return Response.json({ data: null, error: '사용목적을 선택하거나 직접 입력해주세요' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('recurring_requests')
      .insert({
        title: body.title,
        requester_id: user.id,
        department_id: body.department_id,
        purpose_id: body.purpose_id || null,
        custom_purpose: body.custom_purpose || null,
        vehicle_group_id: body.vehicle_group_id,
        destination: body.destination,
        passengers: body.passengers || 1,
        driver_name: body.driver_name || null,
        driver_phone: body.driver_phone || null,
        pattern_type: body.pattern_type,
        weekdays: body.weekdays || null,
        monthly_dates: body.monthly_dates || null,
        week_of_month: body.week_of_month ?? null,
        weekday: body.weekday ?? null,
        start_time: body.start_time,
        end_time: body.end_time,
        period_start: body.period_start,
        period_end: body.period_end,
        reason: body.reason || null,
        status: 'upper_approved',  // 관리자 등록 → 바로 위원회 대기
      })
      .select(SELECTS)
      .single();

    if (error) return createErrorResponse(error.message);
    return Response.json({ data, error: null, message: '장기 신청이 등록되었습니다' }, { status: 201 });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
