import { createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    if (!['admin', 'committee_secretary'].includes(user.role)) {
      return Response.json({ data: null, error: '배차 권한이 없습니다' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { vehicle_id, notes } = body;

    if (!vehicle_id) {
      return Response.json({ data: null, error: '차량을 선택해주세요' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 장기 신청 확인 (approved 상태여야 함)
    const { data: rr, error: rrErr } = await supabase
      .from('recurring_requests')
      .select('id, status, vehicle_group_id, title')
      .eq('id', id)
      .single();

    if (rrErr || !rr) return createErrorResponse('장기 신청을 찾을 수 없습니다');
    if (rr.status !== 'approved') {
      return Response.json({ data: null, error: '승인 완료된 장기 신청만 배차할 수 있습니다' }, { status: 400 });
    }

    // 차량 확인 (같은 차량군 소속인지 검증)
    const { data: vehicle, error: vehicleErr } = await supabase
      .from('vehicles')
      .select('id, name, model, license_plate, vehicle_group_id')
      .eq('id', vehicle_id)
      .single();

    if (vehicleErr || !vehicle) return createErrorResponse('차량을 찾을 수 없습니다');
    if (vehicle.vehicle_group_id !== rr.vehicle_group_id) {
      return Response.json({ data: null, error: '해당 차량군에 속하지 않는 차량입니다' }, { status: 400 });
    }

    // 아직 배차되지 않은 개별 신청 조회 (status = 'approved')
    const { data: requests, error: reqErr } = await supabase
      .from('requests')
      .select('id, start_datetime, end_datetime')
      .eq('recurring_request_id', id)
      .eq('status', 'approved')
      .order('start_datetime', { ascending: true });

    if (reqErr) return createErrorResponse(reqErr.message);
    if (!requests || requests.length === 0) {
      return Response.json({ data: null, error: '배차할 신청이 없습니다 (이미 모두 배차되었거나 신청이 없습니다)' }, { status: 400 });
    }

    // 일괄 배차 생성 (50건씩 나눠서)
    const dispatchPayloads = requests.map((req: any) => ({
      request_id: req.id,
      vehicle_id,
      scheduled_start: req.start_datetime,
      scheduled_end: req.end_datetime,
      dispatcher_id: user.id,
      status: 'scheduled',
      notes: notes || null,
    }));

    const BATCH = 50;
    for (let i = 0; i < dispatchPayloads.length; i += BATCH) {
      const { error: insertErr } = await supabase
        .from('dispatches')
        .insert(dispatchPayloads.slice(i, i + BATCH));
      if (insertErr) return createErrorResponse(`배차 생성 오류: ${insertErr.message}`);
    }

    // 개별 신청 상태 → dispatched
    const requestIds = requests.map((r: any) => r.id);
    for (let i = 0; i < requestIds.length; i += BATCH) {
      await supabase
        .from('requests')
        .update({ status: 'dispatched' })
        .in('id', requestIds.slice(i, i + BATCH));
    }

    // 장기 신청 마스터 상태 → dispatched (배차 완료 표시)
    await supabase
      .from('recurring_requests')
      .update({ status: 'dispatched', updated_at: new Date().toISOString() })
      .eq('id', id);

    return Response.json({
      data: null,
      error: null,
      dispatched_count: requests.length,
      message: `${requests.length}건 일괄 배차가 완료되었습니다`,
    });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
