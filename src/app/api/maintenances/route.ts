import { createClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const supabase = await createClient();

    let query = supabase
      .from('maintenances')
      .select('*')
      .order('maintenance_date', { ascending: false });

    const vehicleId = searchParams.get('vehicle_id');
    if (vehicleId) query = query.eq('vehicle_id', vehicleId);

    const from = searchParams.get('from');
    const to   = searchParams.get('to');
    if (from) query = query.gte('maintenance_date', from);
    if (to)   query = query.lte('maintenance_date', to);

    const limit = Number(searchParams.get('page_size') || 100);
    query = query.limit(limit);

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
    if (!['admin', 'manager'].includes(user.role)) {
      return Response.json({ data: null, error: '권한이 없습니다' }, { status: 403 });
    }

    const body = await request.json();
    const { vehicle_id, maintenance_type, description, cost, maintenance_date, next_maintenance_date, performed_by } = body;

    if (!vehicle_id)       return Response.json({ data: null, error: '차량을 선택해주세요' }, { status: 400 });
    if (!maintenance_type) return Response.json({ data: null, error: '정비 유형을 선택해주세요' }, { status: 400 });
    if (!maintenance_date) return Response.json({ data: null, error: '정비 일자를 입력해주세요' }, { status: 400 });

    const VALID_TYPES = ['inspection', 'repair', 'wash', 'tire', 'oil', 'other'];
    if (!VALID_TYPES.includes(maintenance_type)) {
      return Response.json({ data: null, error: '올바른 정비 유형이 아닙니다' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('maintenances')
      .insert({
        vehicle_id,
        maintenance_type,
        description: description || null,
        cost: cost ? Number(cost) : null,
        maintenance_date,
        next_maintenance_date: next_maintenance_date || null,
        performed_by: performed_by || null,
      })
      .select()
      .single();

    if (error) return createErrorResponse(error.message);
    return Response.json({ data, error: null, message: '정비 기록이 등록되었습니다' }, { status: 201 });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
