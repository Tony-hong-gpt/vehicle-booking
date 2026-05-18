import { createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

const EXPORT_STATUSES = ['pending', 'upper_approved', 'approved', 'rejected', 'dispatched'];

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    if (user.role !== 'admin' && user.role !== 'manager') {
      return createUnauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get('from');
    const toParam   = searchParams.get('to');

    const supabase = createAdminClient();

    let query = supabase
      .from('requests')
      .select(`
        id, request_no, destination, status, start_datetime, end_datetime,
        passengers, driver_name, driver_phone, notes, created_at,
        requester:users!requester_id(name, employee_no),
        department:departments(name),
        purpose:purposes(name),
        vehicle_group:vehicle_groups(name),
        dispatches(vehicle:vehicles(name, model, license_plate))
      `)
      .in('status', EXPORT_STATUSES)
      .order('start_datetime', { ascending: true });

    if (fromParam) query = query.gte('start_datetime', fromParam);
    if (toParam)   query = query.lte('start_datetime', toParam + 'T23:59:59');

    const { data, error } = await query;
    if (error) return createErrorResponse(error.message);

    return Response.json({ data: data ?? [], error: null });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
