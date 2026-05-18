import { createClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    const { id } = await params;
    const supabase = await createClient();
    const { data, error } = await supabase.from('drivers').select('*, user:users(id, name, phone, email)').eq('id', id).single();
    if (error) return createErrorResponse('운전기사를 찾을 수 없습니다', 404);
    return Response.json({ data, error: null });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
