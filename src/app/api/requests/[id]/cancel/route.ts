import { createClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const { id } = await params;
    const supabase = await createClient();
    const { data: req } = await supabase.from('requests').select('requester_id, status').eq('id', id).single();
    if (!req) return createErrorResponse('신청을 찾을 수 없습니다', 404);

    if (req.requester_id !== user.id && user.role !== 'admin') {
      return Response.json({ data: null, error: '권한이 없습니다' }, { status: 403 });
    }
    if (!['pending', 'approved'].includes(req.status)) {
      return Response.json({ data: null, error: '취소할 수 없는 상태입니다' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('requests')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single();

    if (error) return createErrorResponse(error.message);
    return Response.json({ data, error: null, message: '취소되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
