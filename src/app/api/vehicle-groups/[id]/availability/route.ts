import { createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const startDatetime = searchParams.get('start_datetime');
    const endDatetime = searchParams.get('end_datetime');

    const supabase = createAdminClient();

    // 1. 해당 차량군의 전체 활성 차량 목록 (정비·비운행 제외)
    const { data: vehicles, error: vErr } = await supabase
      .from('vehicles')
      .select('id, capacity')
      .eq('vehicle_group_id', id)
      .not('status', 'in', '("maintenance","inactive")');

    if (vErr) return createErrorResponse(vErr.message);

    const totalCount = (vehicles || []).length;
    const vehicleIds = (vehicles || []).map((v: any) => v.id);

    // 2. capacity_options: DB에서 동적 조회 (중복 제거, null 제외, 오름차순)
    const capacityOptions: number[] = [
      ...new Set(
        (vehicles || [])
          .map((v: any) => v.capacity)
          .filter((c: any) => c != null && c > 0)
      ),
    ].sort((a: number, b: number) => a - b);

    let dispatchedCount = 0;
    let approvedCount = 0;

    if (startDatetime && endDatetime && totalCount > 0) {
      // 3. 해당 기간과 겹치는 배차 수 (scheduled / in_progress)
      const { data: busyDispatches } = await supabase
        .from('dispatches')
        .select('id')
        .in('status', ['scheduled', 'in_progress'])
        .in('vehicle_id', vehicleIds)
        .lt('scheduled_start', endDatetime)
        .gt('scheduled_end', startDatetime);

      dispatchedCount = (busyDispatches || []).length;

      // 4. 해당 기간과 겹치는 approved 신청 수 (배차 미등록)
      const { count: approvedCnt } = await supabase
        .from('requests')
        .select('*', { count: 'exact', head: true })
        .eq('vehicle_group_id', id)
        .eq('status', 'approved')
        .lt('start_datetime', endDatetime)
        .gt('end_datetime', startDatetime);

      approvedCount = approvedCnt || 0;
    }

    const availableCount = Math.max(0, totalCount - dispatchedCount - approvedCount);

    return Response.json({
      data: {
        total_count: totalCount,
        dispatched_count: dispatchedCount,
        approved_count: approvedCount,
        available_count: availableCount,
        capacity_options: capacityOptions,
        has_capacity_variants: capacityOptions.length > 1,
      },
      error: null,
    });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
