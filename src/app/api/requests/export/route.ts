import { createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

const EXPORT_STATUSES = ['pending', 'upper_approved', 'approved', 'rejected', 'dispatched'];

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get('from');
    const toParam   = searchParams.get('to');

    const supabase = createAdminClient();

    // 1) requests 조회
    let reqQuery = supabase
      .from('requests')
      .select(`
        id, request_no, destination, status, start_datetime, end_datetime,
        passengers, driver_name, driver_phone, created_at,
        requester:users!requester_id(name, employee_no),
        department:departments(name),
        purpose:purposes(name),
        vehicle_group:vehicle_groups(name)
      `)
      .in('status', EXPORT_STATUSES)
      .order('start_datetime', { ascending: true });

    if (fromParam) reqQuery = reqQuery.gte('start_datetime', fromParam);
    if (toParam)   reqQuery = reqQuery.lte('start_datetime', toParam + 'T23:59:59');

    const { data: requests, error: reqError } = await reqQuery;
    if (reqError) return createErrorResponse(reqError.message);
    if (!requests || requests.length === 0) return Response.json({ data: [], error: null });

    // 2) 해당 request_id 들의 dispatches + vehicle 별도 조회
    const requestIds = requests.map((r: any) => r.id);
    const { data: dispatches, error: dispError } = await supabase
      .from('dispatches')
      .select('request_id, vehicle:vehicles(name, model, license_plate)')
      .in('request_id', requestIds);

    if (dispError) return createErrorResponse(dispError.message);

    // 3) request_id 기준으로 dispatch map 생성
    const dispatchMap = new Map<string, any>();
    for (const d of dispatches ?? []) {
      dispatchMap.set(d.request_id, d);
    }

    // 4) requests에 dispatch 정보 병합
    const data = requests.map((r: any) => ({
      ...r,
      dispatch: dispatchMap.get(r.id) ?? null,
    }));

    return Response.json({ data, error: null });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
