import { createClient, createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    if (!['admin', 'manager'].includes(user.role)) {
      return Response.json({ data: null, error: '반려 권한이 없습니다' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const comment = body.comment?.trim();
    if (!comment) {
      return Response.json({ data: null, error: '반려 사유를 입력해주세요' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: req } = await supabase.from('requests').select('status').eq('id', id).single();
    if (!req) return createErrorResponse('신청을 찾을 수 없습니다', 404);

    // manager: pending 상태에서 상위 승인 단계 반려
    // admin: upper_approved, on_hold 에서 차량위원회 반려 / pending에서 강제 반려
    const isManagerReject = user.role === 'manager' && req.status === 'pending';
    const isAdminReject = user.role === 'admin' && ['upper_approved', 'on_hold', 'pending'].includes(req.status);

    if (!isManagerReject && !isAdminReject) {
      return Response.json({ data: null, error: '현재 상태에서 반려할 수 없습니다' }, { status: 400 });
    }

    const isForce = user.role === 'admin' && req.status === 'pending';
    const step = isManagerReject ? 1 : 2;

    const adminSupabase = createAdminClient();
    const { data: existing } = await adminSupabase
      .from('approvals')
      .select('id')
      .eq('request_id', id)
      .eq('step', step)
      .maybeSingle();

    const approvalPayload = {
      approver_id: user.id,
      status: 'rejected',
      comment: isForce ? `[강제처리] ${comment}` : comment,
      approved_at: new Date().toISOString(),
    };

    if (existing) {
      await adminSupabase.from('approvals').update(approvalPayload).eq('id', existing.id);
    } else {
      await adminSupabase.from('approvals').insert({ request_id: id, step, ...approvalPayload });
    }

    const { data, error } = await supabase
      .from('requests')
      .update({ status: 'rejected' })
      .eq('id', id)
      .select()
      .single();

    if (error) return createErrorResponse(error.message);
    return Response.json({ data, error: null, message: isForce ? '강제 반려되었습니다' : '반려되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
