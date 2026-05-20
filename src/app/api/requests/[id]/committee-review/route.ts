import { createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

/**
 * 총무(committee_secretary) 검토 제출
 * - upper_approved → committee_reviewing
 * - 총무는 승인/반려 직접 불가, 검토 의견 필수 작성 후 부위원장에게 결재 올림
 * - comment 필수
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    if (!['admin', 'committee_secretary'].includes(user.role)) {
      return Response.json({ data: null, error: '총무 결재 권한이 없습니다' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const comment = body.comment?.trim();

    if (!comment) {
      return Response.json({ data: null, error: '검토 의견을 작성해주세요' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    const { data: req } = await adminSupabase
      .from('requests').select('status').eq('id', id).single();
    if (!req) return createErrorResponse('신청을 찾을 수 없습니다', 404);
    if (req.status !== 'upper_approved') {
      return Response.json({ data: null, error: '차량위원회 대기 상태인 신청만 처리할 수 있습니다' }, { status: 400 });
    }

    // approval 기록 (step 3 = 총무)
    const { data: existing } = await adminSupabase
      .from('approvals').select('id')
      .eq('request_id', id).eq('step', 3).maybeSingle();

    const approvalPayload = {
      approver_id: user.id,
      status: 'approved',
      comment,
      approved_at: new Date().toISOString(),
    };

    if (existing) {
      await adminSupabase.from('approvals').update(approvalPayload).eq('id', existing.id);
    } else {
      await adminSupabase.from('approvals').insert({ request_id: id, step: 3, ...approvalPayload });
    }

    const { data, error } = await adminSupabase
      .from('requests')
      .update({ status: 'committee_reviewing' })
      .eq('id', id)
      .select()
      .single();

    if (error) return createErrorResponse(error.message);
    return Response.json({ data, error: null, message: '검토 의견이 제출되었습니다. 부위원장 결재 단계로 이동합니다.' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
