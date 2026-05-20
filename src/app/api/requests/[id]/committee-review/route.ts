import { createClient, createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

/**
 * 간사(committee_secretary) 검토 시작
 * upper_approved → committee_reviewing
 */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    if (!['admin', 'committee_secretary'].includes(user.role)) {
      return Response.json({ data: null, error: '간사 검토 권한이 없습니다' }, { status: 403 });
    }

    const { id } = await params;
    const supabase = await createClient();
    const adminSupabase = createAdminClient();

    const { data: req } = await adminSupabase
      .from('requests').select('status').eq('id', id).single();
    if (!req) return createErrorResponse('신청을 찾을 수 없습니다', 404);
    if (req.status !== 'upper_approved') {
      return Response.json({ data: null, error: '차량위원회 대기 상태인 신청만 처리할 수 있습니다' }, { status: 400 });
    }

    // approval 기록 (step 3 = 간사)
    const { data: existing } = await adminSupabase
      .from('approvals').select('id')
      .eq('request_id', id).eq('step', 3).maybeSingle();

    const approvalPayload = {
      approver_id: user.id,
      status: 'approved',
      comment: '간사 검토 시작',
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
    return Response.json({ data, error: null, message: '간사 검토가 시작되었습니다. 부위원장 검토 단계로 이동합니다.' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
