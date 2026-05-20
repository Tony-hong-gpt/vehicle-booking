import { createClient, createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

/**
 * 대기 처리
 * - committee_chair: committee_vice_reviewing → on_hold (step 5)
 * - admin: upper_approved / on_hold / committee_* / pending(강제) → on_hold
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const ALLOWED_ROLES = ['admin', 'committee_chair'];
    if (!ALLOWED_ROLES.includes(user.role)) {
      return Response.json({ data: null, error: '대기 처리 권한이 없습니다' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const comment = body.comment?.trim();
    if (!comment) {
      return Response.json({ data: null, error: '대기 사유를 입력해주세요' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    const { data: req } = await adminSupabase.from('requests').select('status').eq('id', id).single();
    if (!req) return createErrorResponse('신청을 찾을 수 없습니다', 404);

    let step = 2;
    let isForce = false;

    if (user.role === 'committee_chair') {
      if (req.status !== 'committee_vice_reviewing') {
        return Response.json({ data: null, error: '부위원장 검토 완료 상태인 신청만 대기 처리할 수 있습니다' }, { status: 400 });
      }
      step = 5;
    } else if (user.role === 'admin') {
      const adminAllowed = ['upper_approved', 'on_hold', 'committee_reviewing', 'committee_vice_reviewing', 'pending'];
      if (!adminAllowed.includes(req.status)) {
        return Response.json({ data: null, error: '대기 처리할 수 없는 상태입니다' }, { status: 400 });
      }
      isForce = req.status === 'pending';
      step = 2;
    }

    const { data: existing } = await adminSupabase
      .from('approvals').select('id')
      .eq('request_id', id).eq('step', step).maybeSingle();

    const approvalPayload = {
      approver_id: user.id,
      status: 'on_hold',
      comment: isForce ? `[강제처리] ${comment}` : comment,
      approved_at: new Date().toISOString(),
    };

    if (existing) {
      await adminSupabase.from('approvals').update(approvalPayload).eq('id', existing.id);
    } else {
      await adminSupabase.from('approvals').insert({ request_id: id, step, ...approvalPayload });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('requests')
      .update({ status: 'on_hold' })
      .eq('id', id)
      .select()
      .single();

    if (error) return createErrorResponse(error.message);
    return Response.json({ data, error: null, message: isForce ? '강제 대기 처리되었습니다' : '대기 처리되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
