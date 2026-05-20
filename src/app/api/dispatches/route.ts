import { createClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';
import { createDispatchSchema, paginationSchema } from '@/lib/validators';
import { PAGE_SIZE } from '@/lib/constants';

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const pagination = paginationSchema.parse({
      page: searchParams.get('page') || 1,
      page_size: searchParams.get('page_size') || PAGE_SIZE,
    });

    const supabase = await createClient();
    let query = supabase
      .from('dispatches')
      .select(`
        *,
        request:requests(id, request_no, destination, start_datetime, end_datetime, passengers,
          purpose:purposes(name), requester:users!requester_id(id, name)),
        vehicle:vehicles(id, name, model, license_plate, fuel_type, current_mileage),
        driver:drivers(id, user:users(name, phone))
      `, { count: 'exact' });

    const status = searchParams.get('status');
    if (status) query = query.eq('status', status);

    const vehicleId = searchParams.get('vehicle_id');
    if (vehicleId) query = query.eq('vehicle_id', vehicleId);

    const requestId = searchParams.get('request_id');
    if (requestId) query = query.eq('request_id', requestId);

    // my_trips=true: 현재 로그인 사용자의 배차만 조회 (모바일 운행 관리용)
    const myTrips = searchParams.get('my_trips');
    if (myTrips === 'true') {
      const { data: myRequests } = await supabase
        .from('requests')
        .select('id')
        .eq('requester_id', user.id);
      const myRequestIds = (myRequests || []).map((r: any) => r.id);
      if (myRequestIds.length === 0) {
        return Response.json({ data: [], total: 0, page: 1, page_size: pagination.page_size, total_pages: 0, error: null });
      }
      query = query.in('request_id', myRequestIds);
    }

    query = query.order('scheduled_start', { ascending: false });

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
    if (!['admin', 'manager', 'committee_secretary'].includes(user.role)) {
      return Response.json({ data: null, error: '배차 권한이 없습니다' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createDispatchSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const supabase = await createClient();

    // 대차가 아닌 경우 vehicle_id 필수
    if (!parsed.data.is_rental && !parsed.data.vehicle_id) {
      return Response.json({ data: null, error: '차량을 선택해주세요' }, { status: 400 });
    }

    const { data: req } = await supabase.from('requests').select('status').eq('id', parsed.data.request_id).single();
    if (!req) return createErrorResponse('신청을 찾을 수 없습니다', 404);
    if (req.status !== 'approved') {
      return Response.json({ data: null, error: '승인된 신청만 배차할 수 있습니다' }, { status: 400 });
    }

    const insertPayload: Record<string, unknown> = { ...parsed.data, dispatcher_id: user.id };

    let { data, error } = await supabase
      .from('dispatches')
      .insert(insertPayload)
      .select('*, vehicle:vehicles(id, name, license_plate), request:requests(id, request_no)')
      .single();

    // driver_name / is_rental 컬럼 미존재 시 해당 필드 제외 후 재시도
    if (error && (error.message?.includes('driver_name') || error.message?.includes('is_rental'))) {
      const retryPayload = { ...insertPayload };
      delete retryPayload.driver_name;
      delete retryPayload.is_rental;
      const retry = await supabase
        .from('dispatches')
        .insert(retryPayload)
        .select('*, vehicle:vehicles(id, name, license_plate), request:requests(id, request_no)')
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      if (error.code === '23505') {
        return Response.json({ data: null, error: '이미 배차된 신청입니다' }, { status: 409 });
      }
      return createErrorResponse(error.message);
    }

    await supabase.from('requests').update({ status: 'dispatched' }).eq('id', parsed.data.request_id);
    // 대차의 경우 내부 차량 상태 변경 없음
    if (!parsed.data.is_rental && parsed.data.vehicle_id) {
      await supabase.from('vehicles').update({ status: 'in_use' }).eq('id', parsed.data.vehicle_id);
    }

    return Response.json({ data, error: null, message: parsed.data.is_rental ? '대차 배차가 완료되었습니다' : '배차가 완료되었습니다' }, { status: 201 });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
