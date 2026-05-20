import { createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

/**
 * 부위원장(committee_vice) 결재
 * - committee_reviewing 상태에서 부위원장 2명 중 1명이 결재하면 즉시 위원장 단계로 이동
 * - 먼저 결재한 사람의 기록이 남고, 나머지 부위원장은 결재 내용을 확인만 할 수 있음
 * - comment는 선택사항
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    if (!['admin', 'committee_vice'].includes(user.role)) {
      return Response.json({ data: null, error: '부위원장 결재 권한이 없습니다' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const comment = body.comment?.trim() || null;

    const adminSupabase = createAdminClient();

    const { data: req } = await adminSupabase
      .from('requests').select('status').eq('id', id).single();
    if (!req) return createErrorResponse('신청을 찾을 수 없습니다', 404);
    if (req.status !== 'committee_reviewing') {
      return Response.json({ data: null, error: '총무검토중 상태인 신청만 처리할 수 있습니다' }, { status: 400 });
    }

    // 이미 다른 부위원장(또는 본인)이 결재했는지 확인
    const { data: existingApproval } = await adminSupabase
      .from('approvals')
      .select('id, approver_id, status, comment, approved_at, approver:users!approver_id(name)')
      .eq('request_id', id)
      .eq('step', 4)
      .maybeSingle();

    if (existingApproval) {
      const approverName = (existingApproval.approver as any)?.name ?? '다른 부위원장';
      const isSelf = existingApproval.approver_id === user.id;
      return Response.json({
        data: null,
        error: isSelf
          ? '이미 결재하셨습니다'
          : `${approverName} 부위원장님이 이미 결재하셨습니다`,
      }, { status: 400 });
    }

    // 결재 기록 삽입
    await adminSupabase.from('approvals').insert({
      request_id: id,
      step: 4,
      approver_id: user.id,
      status: 'approved',
      comment,
      approved_at: new Date().toISOString(),
    });

    // 즉시 위원장 단계로 이동
    const { data, error } = await adminSupabase
      .from('requests')
      .update({ status: 'committee_vice_reviewing' })
      .eq('id', id)
      .select()
      .single();

    if (error) return createErrorResponse(error.message);
    return Response.json({
      data,
      error: null,
      message: '결재가 완료되었습니다. 위원장 최종 결재 단계로 이동합니다.',
    });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
