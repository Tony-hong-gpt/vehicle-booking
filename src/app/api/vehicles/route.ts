import { createClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';
import { createVehicleSchema, paginationSchema } from '@/lib/validators';
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
      .from('vehicles')
      .select('*, vehicle_group:vehicle_groups(id, name)', { count: 'exact' });

    const status = searchParams.get('status');
    if (status) query = query.eq('status', status);

    const groupId = searchParams.get('vehicle_group_id');
    if (groupId) query = query.eq('vehicle_group_id', groupId);

    if (pagination.search) {
      query = query.or(`name.ilike.%${pagination.search}%,license_plate.ilike.%${pagination.search}%`);
    }

    query = query.order(pagination.sort_by || 'created_at', { ascending: pagination.sort_order === 'asc' });

    const from = (pagination.page - 1) * pagination.page_size;
    query = query.range(from, from + pagination.page_size - 1);

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
    if (!['admin'].includes(user.role)) {
      return Response.json({ data: null, error: '관리자만 차량을 등록할 수 있습니다' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createVehicleSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('vehicles')
      .insert(parsed.data)
      .select('*, vehicle_group:vehicle_groups(id, name)')
      .single();

    if (error) {
      if (error.code === '23505') {
        return Response.json({ data: null, error: '이미 등록된 차량번호입니다' }, { status: 409 });
      }
      return createErrorResponse(error.message);
    }
    return Response.json({ data, error: null, message: '차량이 등록되었습니다' }, { status: 201 });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
