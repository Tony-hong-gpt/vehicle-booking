import { createClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const startDatetime = searchParams.get('start_datetime');
    const endDatetime = searchParams.get('end_datetime');
    const vehicleGroupId = searchParams.get('vehicle_group_id');

    const supabase = await createClient();

    // 날짜 기준 조회: 정비/비운행 제외한 전체 차량 대상으로 실제 배차 겹침만 확인
    // (차량 DB status가 'in_use'여도 해당 날짜에 배차 없으면 가용으로 표시)
    let query = supabase
      .from('vehicles')
      .select('*, vehicle_group:vehicle_groups(id, name)')
      .not('status', 'in', '("maintenance","inactive")');

    if (vehicleGroupId) query = query.eq('vehicle_group_id', vehicleGroupId);

    let inProgressIds: string[] = [];

    // 해당 시간대에 실제 배차된 차량 제외 (겹침 조건: 배차시작 < 요청종료 AND 배차종료 > 요청시작)
    if (startDatetime && endDatetime) {
      const { data: busyVehicles } = await supabase
        .from('dispatches')
        .select('vehicle_id, status')
        .in('status', ['scheduled', 'in_progress'])
        .not('vehicle_id', 'is', null)
        .lt('scheduled_start', endDatetime)
        .gt('scheduled_end', startDatetime);

      const busyRows = busyVehicles || [];
      const busyIds = busyRows.map((d: any) => d.vehicle_id).filter(Boolean);

      // in_progress(운행 중) 차량 ID 별도 추출 → 클라이언트에서 배지 구분에 사용
      inProgressIds = busyRows
        .filter((d: any) => d.status === 'in_progress')
        .map((d: any) => d.vehicle_id)
        .filter(Boolean);

      if (busyIds.length > 0) {
        query = query.not('id', 'in', `(${busyIds.join(',')})`);
      }
    }

    const { data, error } = await query.order('name');
    if (error) return createErrorResponse(error.message);

    return Response.json({ data, in_progress_ids: inProgressIds, error: null });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
