import { createClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

/**
 * GET /api/vehicles/mileage-history?date=YYYY-MM-DD
 *
 * 특정 날짜까지의 최종 주행거리를 차량별로 반환합니다.
 * Response: { data: Record<vehicle_id, number>, error: null }
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date'); // YYYY-MM-DD

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Response.json({ data: null, error: '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)' }, { status: 400 });
    }

    const supabase = await createClient();

    // 해당 날짜까지의 mileage_log 중 end_mileage가 있는 것만 조회 (최신 순)
    const { data: logs, error } = await supabase
      .from('mileage_logs')
      .select('vehicle_id, end_mileage, log_date')
      .lte('log_date', date)
      .not('end_mileage', 'is', null)
      .order('log_date', { ascending: false });

    if (error) return createErrorResponse(error.message);

    // 차량별 가장 최근 주행거리 추출
    const mileageMap: Record<string, number> = {};
    for (const log of (logs ?? [])) {
      if (log.vehicle_id && !(log.vehicle_id in mileageMap)) {
        mileageMap[log.vehicle_id] = log.end_mileage as number;
      }
    }

    return Response.json({ data: mileageMap, error: null });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
