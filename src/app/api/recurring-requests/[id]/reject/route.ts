import { createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

const ROLE_STEPS: Record<string, number> = {
  committee_secretary: 3,
  committee_vice:      4,
  committee_chair:     5,
  admin:               99,
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const step = ROLE_STEPS[user.role];
    if (!step) return Response.json({ data: null, error: '권한이 없습니다' }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    if (!body.comment) {
      return Response.json({ data: null, error: '반려 사유를 입력해주세요' }, { status: 400 });
    }

    const supabase = createAdminClient();

    await supabase.from('recurring_approvals').insert({
      recurring_request_id: id,
      approver_id: user.id,
      step,
      status: 'rejected',
      comment: body.comment,
      approved_at: new Date().toISOString(),
    });

    await supabase
      .from('recurring_requests')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', id);

    return Response.json({ data: { status: 'rejected' }, error: null, message: '반려되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
