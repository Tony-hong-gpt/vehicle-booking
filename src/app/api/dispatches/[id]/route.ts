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

    // 기존 배차 조회 (차량 변경·취소 감지)
    const { data: existing } = await adminSupabase
      .from('dispatches').select('vehicle_id, is_rental, status').eq('id', id).single();

    const { data, error } = await adminSupabase
      .from('dispatches').update(parsed.data).eq('id', id).select().single();
    if (error) return createErrorResponse(error.message);

    // 배차가 취소(cancelled)로 변경된 경우 → 차량 상태 복원 + 신청 재배차 대기 상태로 복원
    if (parsed.data.status === 'cancelled') {
      if (existing?.vehicle_id && !existing.is_rental) {
        await adminSupabase.from('vehicles').update({ status: 'available' }).eq('id', existing.vehicle_id);
      }
      const { data: dispatch } = await adminSupabase
        .from('dispatches').select('request_id').eq('id', id).single();
      if (dispatch?.request_id) {
        await adminSupabase.from('requests').update({ status: 'approved' }).eq('id', dispatch.request_id);
      }
    }
    // 차량이 변경된 경우 vehicle.status 교체 (취소가 아닌 경우에만)
    else if (parsed.data.vehicle_id !== undefined && existing) {
      const oldId = existing.vehicle_id;
      const newId = parsed.data.vehicle_id;
      if (oldId && oldId !== newId && !existing.is_rental) {
        await adminSupabase.from('vehicles').update({ status: 'available' }).eq('id', oldId);
      }
      if (newId && !parsed.data.is_rental) {
        // 배차 수정 시에도 scheduled 상태이므로 booked 처리 (in_use는 실제 인수 후)
        await adminSupabase.from('vehicles').update({ status: 'booked' }).eq('id', newId);
      }
    }

    return Response.json({ data, error: null, message: '수정되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    if (user.role !== 'admin') {
      return Response.json({ data: null, error: '권한이 없습니다' }, { status: 403 });
    }

    const { id } = await params;
    const adminSupabase = createAdminClient();

    const { data: existing } = await adminSupabase
      .from('dispatches').select('status').eq('id', id).single();
    if (!existing) return createErrorResponse('배차를 찾을 수 없습니다', 404);
    if (existing.status !== 'cancelled') {
      return Response.json({ data: null, error: '취소된 배차만 삭제할 수 있습니다' }, { status: 400 });
    }

    const { error } = await adminSupabase.from('dispatches').delete().eq('id', id);
    if (error) return createErrorResponse(error.message);

    return Response.json({ data: null, error: null, message: '삭제되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
