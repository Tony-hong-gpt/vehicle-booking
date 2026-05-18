import { createClient, createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    // 상위 승인은 manager(위원장/담당 목사님) 또는 admin만 가능
    if (!['admin', 'manager'].includes(user.role)) {
      return Response.json({ data: null, error: '상위 승인 권한이 없습니다' }, { status: 403 });
    }

    const { id } = await params;
    const supabase = await createClient();

    const { data: req } = await supabase.from('requests').select('status').eq('id', id).single();
    if (!req) return createErrorResponse('신청을 찾을 수 없습니다', 404);
    if (req.status !== 'pending') {
      return Response.json({ data: null, error: '상위승인대기 상태인 신청만 상위 승인할 수 있습니다' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    // 기존 상위 승인 레코드 확인 후 upsert
    const { data: existing } = await adminSupabase
      .from('approvals')
      .select('id')
      .eq('request_id', id)
      .eq('step', 1)
      .maybeSingle();

    const approvalPayload = {
      approver_id: user.id,
      status: 'approved',
      comment: null,
      approved_at: new Date().toISOString(),
    };

    if (existing) {
      await adminSupabase.from('approvals').update(approvalPayload).eq('id', existing.id);
    } else {
      await adminSupabase.from('approvals').insert({ request_id: id, step: 1, ...approvalPayload });
    }

    const { data, error } = await supabase
      .from('requests')
      .update({ status: 'upper_approved' })
      .eq('id', id)
      .select()
      .single();

    if (error) return createErrorResponse(error.message);
    return Response.json({ data, error: null, message: '상위 승인이 완료되었습니다. 차량위원회 처리 대기 중입니다.' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
