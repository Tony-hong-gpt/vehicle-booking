import { createClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const startMileage: number | null =
      typeof body.start_mileage === 'number' && body.start_mileage >= 0
        ? Math.round(body.start_mileage)
        : null;

    const supabase = await createClient();

    const { data: dispatch } = await supabase
      .from('dispatches')
      .select('status, vehicle_id, request_id, request:requests(requester_id)')
      .eq('id', id)
      .single();

    if (!dispatch) return createErrorResponse('배차를 찾을 수 없습니다', 404);
    if (dispatch.status !== 'scheduled') {
      return Response.json({ data: null, error: '이미 인수되었거나 완료된 배차입니다' }, { status: 400 });
    }

    // 신청자 본인 또는 admin/manager만 인수 가능
    const requesterId = (dispatch.request as any)?.requester_id;
    if (!['admin', 'manager'].includes(user.role) && user.id !== requesterId) {
      return Response.json({ data: null, error: '차량 인수 권한이 없습니다' }, { status: 403 });
    }

    const now = new Date().toISOString();
    await supabase
      .from('dispatches')
      .update({ status: 'in_progress', actual_start: now })
      .eq('id', id);

    // 인수(출발) 시점에 차량 상태를 in_use로 변경
    if (dispatch.vehicle_id) {
      await supabase.from('vehicles').update({ status: 'in_use' }).eq('id', dispatch.vehicle_id);
    }

    // 신청 상태를 in_use로 업데이트 (달력/현황 색상 정확히 반영)
    if (dispatch.request_id) {
      await supabase.from('requests').update({ status: 'in_use' }).eq('id', dispatch.request_id);
    }

    // 출발 주행거리 입력 시 mileage_log 생성
    if (startMileage !== null && dispatch.vehicle_id) {
      await supabase.from('mileage_logs').insert({
        dispatch_id: id,
        vehicle_id: dispatch.vehicle_id,
        start_mileage: startMileage,
        log_date: now.split('T')[0],
      });
    }

    return Response.json({ data: null, error: null, message: '차량 인수가 확인되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
