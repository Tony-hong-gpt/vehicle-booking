import { createClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';
import { updateVehicleSchema } from '@/lib/validators';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    const { id } = await params;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('vehicles')
      .select('*, vehicle_group:vehicle_groups(id, name)')
      .eq('id', id)
      .single();
    if (error) return createErrorResponse('차량을 찾을 수 없습니다', 404);
    return Response.json({ data, error: null });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    if (user.role !== 'admin') {
      return Response.json({ data: null, error: '권한이 없습니다' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = updateVehicleSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.from('vehicles').update(parsed.data).eq('id', id).select('*, vehicle_group:vehicle_groups(id, name)').single();
    if (error) return createErrorResponse(error.message);
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
    const supabase = await createClient();

    // 차량 존재 확인
    const { data: vehicle } = await supabase.from('vehicles').select('status, name').eq('id', id).single();
    if (!vehicle) return createErrorResponse('차량을 찾을 수 없습니다', 404);

    // 운행 중이면 삭제 불가
    if (vehicle.status === 'in_use') {
      return Response.json({ data: null, error: '현재 운행 중인 차량은 삭제할 수 없습니다' }, { status: 400 });
    }

    // 진행 중인 배차가 있으면 삭제 불가
    const { count: activeDispatchCount } = await supabase
      .from('dispatches')
      .select('*', { count: 'exact', head: true })
      .eq('vehicle_id', id)
      .in('status', ['scheduled', 'in_progress']);

    if ((activeDispatchCount ?? 0) > 0) {
      return Response.json({ data: null, error: '배차가 진행 중인 차량은 삭제할 수 없습니다' }, { status: 400 });
    }

    // 관련 이력 순서대로 삭제
    // 1. 배차 ID 목록 조회
    const { data: dispatches } = await supabase
      .from('dispatches')
      .select('id')
      .eq('vehicle_id', id);

    const dispatchIds = (dispatches ?? []).map((d: { id: string }) => d.id);

    if (dispatchIds.length > 0) {
      // 2. 반납 기록 삭제 (dispatch_id → RESTRICT)
      await supabase.from('returns').delete().in('dispatch_id', dispatchIds);
      // 3. 배차 삭제 (삭제 시 mileage_logs CASCADE 삭제됨)
      await supabase.from('dispatches').delete().eq('vehicle_id', id);
    }

    // 4. 남은 주행일지 삭제
    await supabase.from('mileage_logs').delete().eq('vehicle_id', id);
    // 5. 정비 기록 삭제
    await supabase.from('maintenances').delete().eq('vehicle_id', id);
    // 6. 차량 삭제
    const { error } = await supabase.from('vehicles').delete().eq('id', id);
    if (error) return createErrorResponse(error.message);

    return Response.json({ data: null, error: null, message: '차량이 삭제되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
