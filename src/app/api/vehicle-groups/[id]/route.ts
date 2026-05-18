import { createClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createForbiddenResponse, createErrorResponse } from '@/lib/server/auth';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    if (!['admin', 'manager'].includes(user.role)) return createForbiddenResponse();

    const { id } = await params;
    const supabase = await createClient();

    // 1. 차량군에 속한 차량 조회
    const { data: vehicles } = await supabase
      .from('vehicles')
      .select('id, status')
      .eq('vehicle_group_id', id);

    const vehicleIds = (vehicles ?? []).map((v: { id: string }) => v.id);

    // 2. 운행 중인 차량 확인
    const hasInUse = (vehicles ?? []).some((v: { status: string }) => v.status === 'in_use');
    if (hasInUse) {
      return Response.json({ data: null, error: '운행 중인 차량이 있어 삭제할 수 없습니다' }, { status: 400 });
    }

    // 3. 이 차량군을 사용하는 신청(requests) 조회
    const { data: requests } = await supabase
      .from('requests')
      .select('id')
      .eq('vehicle_group_id', id);

    const requestIds = (requests ?? []).map((r: { id: string }) => r.id);

    if (requestIds.length > 0) {
      // 4. 신청에 연결된 배차 조회
      const { data: dispatches } = await supabase
        .from('dispatches')
        .select('id')
        .in('request_id', requestIds);

      const dispatchIds = (dispatches ?? []).map((d: { id: string }) => d.id);

      if (dispatchIds.length > 0) {
        // 진행 중인 배차가 있으면 삭제 불가
        const { count: activeCount } = await supabase
          .from('dispatches')
          .select('*', { count: 'exact', head: true })
          .in('id', dispatchIds)
          .in('status', ['scheduled', 'in_progress']);

        if ((activeCount ?? 0) > 0) {
          return Response.json({ data: null, error: '배차가 진행 중인 신청이 있어 삭제할 수 없습니다' }, { status: 400 });
        }

        // 5. 반납 기록 삭제
        await supabase.from('returns').delete().in('dispatch_id', dispatchIds);
        // 6. 주행일지 삭제 (dispatch_id 기준)
        await supabase.from('mileage_logs').delete().in('dispatch_id', dispatchIds);
        // 7. 배차 삭제
        await supabase.from('dispatches').delete().in('id', dispatchIds);
      }

      // 8. 신청 삭제 (approvals CASCADE 삭제됨)
      await supabase.from('requests').delete().in('id', requestIds);
    }

    // 9. 차량 관련 이력 삭제 (vehicle_id 기준 남은 것들)
    if (vehicleIds.length > 0) {
      const { data: vehicleDispatches } = await supabase
        .from('dispatches')
        .select('id')
        .in('vehicle_id', vehicleIds);

      const vehicleDispatchIds = (vehicleDispatches ?? []).map((d: { id: string }) => d.id);
      if (vehicleDispatchIds.length > 0) {
        await supabase.from('returns').delete().in('dispatch_id', vehicleDispatchIds);
        await supabase.from('mileage_logs').delete().in('dispatch_id', vehicleDispatchIds);
        await supabase.from('dispatches').delete().in('id', vehicleDispatchIds);
      }

      await supabase.from('mileage_logs').delete().in('vehicle_id', vehicleIds);
      await supabase.from('maintenances').delete().in('vehicle_id', vehicleIds);
      // 10. 차량 삭제
      await supabase.from('vehicles').delete().in('id', vehicleIds);
    }

    // 11. 차량군 삭제
    const { error } = await supabase.from('vehicle_groups').delete().eq('id', id);
    if (error) return createErrorResponse(error.message);

    return Response.json({ data: null, error: null, message: '차량군이 삭제되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
