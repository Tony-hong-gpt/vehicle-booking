import { createClient, createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

/**
 * 승인 처리
 * - admin: upper_approved / on_hold / committee_vice_reviewing / pending(강제) → approved
 * - committee_chair: committee_vice_reviewing → approved
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const ALLOWED_ROLES = ['admin', 'committee_chair'];
    if (!ALLOWED_ROLES.includes(user.role)) {
      return Response.json({ data: null, error: '승인 권한이 없습니다' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const comment = body.comment?.trim() || null;

    const adminSupabase = createAdminClient();
    const { data: req } = await adminSupabase.from('requests').select('status').eq('id', id).single();
    if (!req) return createErrorResponse('신청을 찾을 수 없습니다', 404);

    // 역할별 허용 상태
    const isChair = user.role === 'committee_chair';
    const isAdmin = user.role === 'admin';

    // 강제 처리 (admin + pending)
    const isForce = isAdmin && req.status === 'pending';
    if (isForce && !comment) {
      return Response.json({ data: null, error: '강제 처리 시 사유를 입력해주세요' }, { status: 400 });
    }

    // chair: committee_vice_reviewing만
    if (isChair && req.status !== 'committee_vice_reviewing') {
      return Response.json({ data: null, error: '부위원장 검토 완료 상태인 신청만 최종 승인할 수 있습니다' }, { status: 400 });
    }

    // admin: 허용 상태 목록
    if (isAdmin && !['upper_approved', 'on_hold', 'committee_reviewing', 'committee_vice_reviewing', 'pending'].includes(req.status)) {
      return Response.json({ data: null, error: '승인할 수 없는 상태입니다' }, { status: 400 });
    }

    // approval step 결정
    const step = isChair ? 5 : 2;

    const { data: existing } = await adminSupabase
      .from('approvals').select('id')
      .eq('request_id', id).eq('step', step).maybeSingle();

    const approvalPayload = {
      approver_id: user.id,
      status: 'approved',
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
      .update({ status: 'approved' })
      .eq('id', id)
      .select()
      .single();

    if (error) return createErrorResponse(error.message);
    return Response.json({
      data, error: null,
      message: isForce ? '강제 승인되었습니다' : '승인되었습니다',
    });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
