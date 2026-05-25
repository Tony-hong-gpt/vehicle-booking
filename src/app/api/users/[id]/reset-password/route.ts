import { createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    if (user.role !== 'admin') {
      return Response.json({ data: null, error: '관리자만 비밀번호를 초기화할 수 있습니다' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { password } = body;

    if (!password || password.length < 6) {
      return Response.json({ data: null, error: '비밀번호는 최소 6자 이상이어야 합니다' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    const { error } = await adminSupabase.auth.admin.updateUserById(id, { password });
    if (error) return createErrorResponse(error.message);

    return Response.json({ data: null, error: null, message: '비밀번호가 초기화되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
