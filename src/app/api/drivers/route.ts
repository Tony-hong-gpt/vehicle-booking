import { createClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const supabase = await createClient();

    let query = supabase.from('drivers').select('*, user:users(id, name, phone, email)');
    const available = searchParams.get('available');
    if (available === 'true') query = query.eq('is_available', true);

    const { data, error } = await query.order('created_at');
    if (error) return createErrorResponse(error.message);
    return Response.json({ data, error: null });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
