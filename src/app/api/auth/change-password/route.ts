import { createClient, createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const body = await request.json();
    const { new_password } = body;

    if (!new_password || new_password.length < 6) {
      return Response.json({ data: null, error: '비밀번호는 최소 6자 이상이어야 합니다' }, { status: 400 });
    }

    const adminSupabase = await createAdminClient();
    const { error } = await adminSupabase.auth.admin.updateUserById(user.id, {
      password: new_password,
    });

    if (error) return createErrorResponse(error.message);
    return Response.json({ data: null, error: null, message: '비밀번호가 변경되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
