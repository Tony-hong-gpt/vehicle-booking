import { createClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';
import { createMileageLogSchema } from '@/lib/validators';

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const supabase = await createClient();

    let query = supabase
      .from('mileage_logs')
      .select('*, vehicle:vehicles(id, name, license_plate), driver:drivers(id, user:users(name))')
      .order('log_date', { ascending: false });

    const vehicleId = searchParams.get('vehicle_id');
    if (vehicleId) query = query.eq('vehicle_id', vehicleId);

    const dispatchId = searchParams.get('dispatch_id');
    if (dispatchId) query = query.eq('dispatch_id', dispatchId);

    const { data, error } = await query;
    if (error) return createErrorResponse(error.message);
    return Response.json({ data, error: null });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const body = await request.json();
    const parsed = createMileageLogSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.from('mileage_logs').insert(parsed.data).select().single();
    if (error) return createErrorResponse(error.message);
    return Response.json({ data, error: null, message: '주행일지가 등록되었습니다' }, { status: 201 });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
