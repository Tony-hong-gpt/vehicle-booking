import { createClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createForbiddenResponse, createErrorResponse } from '@/lib/server/auth';
import { z } from 'zod';

const createPurposeSchema = z.object({
  name: z.string().min(1, '목적명을 입력해주세요').max(50, '50자 이내로 입력해주세요'),
});

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const supabase = await createClient();
    const { data, error } = await supabase.from('purposes').select('*').order('name');
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
    const parsed = createPurposeSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('purposes')
      .insert({ name: parsed.data.name, is_active: true })
      .select()
      .single();
    if (error) return createErrorResponse(error.message);
    return Response.json({ data, error: null, message: '사용목적이 등록되었습니다' }, { status: 201 });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
