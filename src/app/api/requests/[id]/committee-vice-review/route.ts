import { createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

/**
 * 부위원장(committee_vice) 검토 결재
 * - committee_reviewing 상태에서 각 부위원장이 개별 결재
 * - step 4a (첫 번째 부위원장), step 4b (두 번째 부위원장) 형태로 기록
 * - 두 명 모두 결재 완료 시 → committee_vice_reviewing (위원장 결재 단계)
 * - comment는 선택사항 (추가 검토의견 작성 가능)
 *
 * DB approvals 테이블: step=4로 저장, 동일 request_id에 여러 부위원장 기록 허용
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

    // 이미 이 부위원장이 결재했는지 확인
    const { data: myApproval } = await adminSupabase
      .from('approvals')
      .select('id')
      .eq('request_id', id)
      .eq('step', 4)
      .eq('approver_id', user.id)
      .maybeSingle();

    if (myApproval) {
      return Response.json({ data: null, error: '이미 결재하셨습니다' }, { status: 400 });
    }

    // 이 부위원장의 결재 기록 추가
    await adminSupabase.from('approvals').insert({
      request_id: id,
      step: 4,
      approver_id: user.id,
      status: 'approved',
      comment,
      approved_at: new Date().toISOString(),
    });

    // 부위원장 역할을 가진 전체 사용자 수 조회
    const { data: allVice } = await adminSupabase
      .from('users')
      .select('id')
      .eq('role', 'committee_vice')
      .eq('is_active', true);

    const totalVice = allVice?.length ?? 0;

    // 현재 이 신청에 step=4 결재한 수 조회
    const { data: doneApprovals } = await adminSupabase
      .from('approvals')
      .select('id, approver_id')
      .eq('request_id', id)
      .eq('step', 4)
      .eq('status', 'approved');

    const doneCount = doneApprovals?.length ?? 0;

    // 부위원장이 0명인 엣지 케이스 or 모두 결재 완료 → 위원장 단계로 진행
    const allDone = totalVice === 0 || doneCount >= totalVice;

    if (allDone) {
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
        message: '부위원장 검토가 완료되었습니다. 위원장 최종 결재 단계로 이동합니다.',
        allDone: true,
        doneCount,
        totalVice,
      });
    }

    // 아직 나머지 부위원장 결재 대기 중
    return Response.json({
      data: null,
      error: null,
      message: `검토 의견이 제출되었습니다. (${doneCount}/${totalVice}명 완료)`,
      allDone: false,
      doneCount,
      totalVice,
    });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
