import { createClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createForbiddenResponse, createErrorResponse } from '@/lib/server/auth';
import { z } from 'zod';

const createVehicleGroupSchema = z.object({
  name: z.string().min(1, '차량군명을 입력해주세요').max(50, '50자 이내로 입력해주세요'),
});

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const supabase = await createClient();
    const { data, error } = await supabase.from('vehicle_groups').select('*').order('name');
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
    if (!['admin', 'manager'].includes(user.role)) return createForbiddenResponse();

    const body = await request.json();
    const parsed = createVehicleGroupSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('vehicle_groups')
      .insert({ name: parsed.data.name })
      .select()
      .single();
    if (error) return createErrorResponse(error.message);
    return Response.json({ data, error: null, message: '차량군이 등록되었습니다' }, { status: 201 });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
