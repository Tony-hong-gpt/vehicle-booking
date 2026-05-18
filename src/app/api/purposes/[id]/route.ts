import { createClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createForbiddenResponse, createErrorResponse } from '@/lib/server/auth';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    if (!['admin', 'manager'].includes(user.role)) return createForbiddenResponse();

    const { id } = await params;
    const supabase = await createClient();

    // 해당 목적이 신청에 사용 중인지 확인
    const { count } = await supabase
      .from('requests')
      .select('*', { count: 'exact', head: true })
      .eq('purpose_id', id);

    if (count && count > 0) {
      return Response.json({ data: null, error: '사용 중인 목적은 삭제할 수 없습니다' }, { status: 400 });
    }

    const { error } = await supabase.from('purposes').delete().eq('id', id);
    if (error) return createErrorResponse(error.message);
    return Response.json({ data: null, error: null, message: '사용목적이 삭제되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
