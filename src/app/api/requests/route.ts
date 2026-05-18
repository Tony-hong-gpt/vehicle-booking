import { createClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';
import { createRequestSchema, paginationSchema } from '@/lib/validators';
import { PAGE_SIZE } from '@/lib/constants';

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const pagination = paginationSchema.parse({
      page: searchParams.get('page') || 1,
      page_size: searchParams.get('page_size') || PAGE_SIZE,
      search: searchParams.get('search') || undefined,
      sort_by: searchParams.get('sort_by') || 'created_at',
      sort_order: searchParams.get('sort_order') || 'desc',
    });

    const supabase = await createClient();
    let query = supabase
      .from('requests')
      .select(`
        *,
        requester:users!requester_id(id, name, employee_no, email),
        department:departments(id, name),
        purpose:purposes(id, name),
        vehicle_group:vehicle_groups(id, name),
        approvals(*, approver:users!approver_id(id, name, role))
      `, { count: 'exact' });

    if (user.role === 'employee') {
      query = query.eq('requester_id', user.id);
    }
    if (user.role === 'manager' && user.department_id) {
      query = query.eq('department_id', user.department_id);
    }

    const status = searchParams.get('status');
    if (status) query = query.eq('status', status);

    const vehicleGroupId = searchParams.get('vehicle_group_id');
    if (vehicleGroupId) query = query.eq('vehicle_group_id', vehicleGroupId);

    // 달력용 월별 범위 필터 (해당 기간과 겹치는 신청 모두 반환)
    const monthStart = searchParams.get('month_start');
    const monthEnd = searchParams.get('month_end');
    if (monthStart && monthEnd) {
      query = query.lte('start_datetime', monthEnd).gte('end_datetime', monthStart);
    }

    if (pagination.search) {
      query = query.or(`destination.ilike.%${pagination.search}%,request_no.ilike.%${pagination.search}%`);
    }

    const sortBy = pagination.sort_by || 'created_at';
    query = query.order(sortBy, { ascending: pagination.sort_order === 'asc' });

    const from = (pagination.page - 1) * pagination.page_size;
    const to = from + pagination.page_size - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) return createErrorResponse(error.message);

    return Response.json({
      data,
      total: count || 0,
      page: pagination.page,
      page_size: pagination.page_size,
      total_pages: Math.ceil((count || 0) / pagination.page_size),
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

    const body = await request.json();
    const parsed = createRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const supabase = await createClient();
    // 모바일 신청자가 선택한 department_id 우선, 없으면 프로필 부서 사용
    const departmentId = (body.department_id as string) || user.department_id;

    const insertPayload: Record<string, unknown> = {
      ...parsed.data,
      requester_id: user.id,
      department_id: departmentId,
    };

    const { data, error } = await supabase
      .from('requests')
      .insert(insertPayload)
      .select(`*, requester:users!requester_id(id, name), department:departments(name), purpose:purposes(name), vehicle_group:vehicle_groups(name)`)
      .single();

    if (error) return createErrorResponse(error.message);
    return Response.json({ data, error: null, message: '신청이 접수되었습니다' }, { status: 201 });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
