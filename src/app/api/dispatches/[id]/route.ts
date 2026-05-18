import { createClient, createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';
import { updateDispatchSchema } from '@/lib/validators';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    const { id } = await params;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('dispatches')
      .select(`
        *,
        request:requests(*, requester:users!requester_id(name, phone), department:departments(name), purpose:purposes(name)),
        vehicle:vehicles(id, name, model, license_plate, fuel_type, current_mileage),
        driver:drivers(id, user:users(name, phone)),
        dispatcher:users!dispatcher_id(id, name),
        return_info:returns(*)
      `)
      .eq('id', id)
      .single();
    if (error) return createErrorResponse('배차를 찾을 수 없습니다', 404);
    return Response.json({ data, error: null });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    if (!['admin', 'manager'].includes(user.role)) {
      return Response.json({ data: null, error: '권한이 없습니다' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = updateDispatchSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    // 기존 배차 조회 (차량 변경 감지)
    const { data: existing } = await adminSupabase
      .from('dispatches').select('vehicle_id, is_rental').eq('id', id).single();

    const { data, error } = await adminSupabase
      .from('dispatches').update(parsed.data).eq('id', id).select().single();
    if (error) return createErrorResponse(error.message);

    // 차량이 변경된 경우 vehicle.status 교체
    if (parsed.data.vehicle_id !== undefined && existing) {
      const oldId = existing.vehicle_id;
      const newId = parsed.data.vehicle_id;
      if (oldId && oldId !== newId && !existing.is_rental) {
        await adminSupabase.from('vehicles').update({ status: 'available' }).eq('id', oldId);
      }
      if (newId && !parsed.data.is_rental) {
        await adminSupabase.from('vehicles').update({ status: 'in_use' }).eq('id', newId);
      }
    }

    return Response.json({ data, error: null, message: '수정되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
