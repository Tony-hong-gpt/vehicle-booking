import { createClient, createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    if (user.role !== 'admin') {
      return Response.json({ data: null, error: '차량위원회 승인 권한이 없습니다' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const comment = body.comment?.trim() || null;

    const supabase = await createClient();
    const { data: req } = await supabase.from('requests').select('status').eq('id', id).single();
    if (!req) return createErrorResponse('신청을 찾을 수 없습니다', 404);

    // 강제 처리: pending 상태에서도 admin은 강제 승인 가능 (사유 필수)
    const isForce = req.status === 'pending';
    if (isForce && !comment) {
      return Response.json({ data: null, error: '강제 처리 시 사유를 입력해주세요' }, { status: 400 });
    }
    if (!['upper_approved', 'on_hold', 'pending'].includes(req.status)) {
      return Response.json({ data: null, error: '승인할 수 없는 상태입니다' }, { status: 400 });
    }

    const adminSupabase = await createAdminClient();
    const { data: existing } = await adminSupabase
      .from('approvals')
      .select('id')
      .eq('request_id', id)
      .eq('step', 2)
      .maybeSingle();

    const approvalPayload = {
      approver_id: user.id,
      status: 'approved',
      comment: isForce ? `[강제처리] ${comment}` : comment,
      approved_at: new Date().toISOString(),
    };

    if (existing) {
      await adminSupabase.from('approvals').update(approvalPayload).eq('id', existing.id);
    } else {
      await adminSupabase.from('approvals').insert({ request_id: id, step: 2, ...approvalPayload });
    }

    const { data, error } = await supabase
      .from('requests')
      .update({ status: 'approved' })
      .eq('id', id)
      .select()
      .single();

    if (error) return createErrorResponse(error.message);
    return Response.json({ data, error: null, message: isForce ? '강제 승인되었습니다' : '승인되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
