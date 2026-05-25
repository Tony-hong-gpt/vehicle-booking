import { createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

const SELECTS = `
  *,
  requester:users!requester_id(id, name, employee_no),
  department:departments(id, name),
  purpose:purposes(id, name),
  vehicle_group:vehicle_groups(id, name),
  recurring_approvals(*, approver:users!approver_id(id, name, role))
`;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const { id } = await params;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('recurring_requests')
      .select(SELECTS)
      .eq('id', id)
      .single();

    if (error) return createErrorResponse(error.message);
    return Response.json({ data, error: null });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    if (user.role !== 'admin') {
      return Response.json({ data: null, error: '관리자만 삭제할 수 있습니다' }, { status: 403 });
    }

    const { id } = await params;
    const supabase = createAdminClient();

    // 생성된 개별 신청 건수 확인 (삭제 안내용)
    const { count } = await supabase
      .from('requests')
      .select('id', { count: 'exact', head: true })
      .eq('recurring_request_id', id);

    // 1) requests.recurring_request_id → null (FK 제약 해제, 개별 신청 보존)
    await supabase
      .from('requests')
      .update({ recurring_request_id: null })
      .eq('recurring_request_id', id);

    // 2) recurring_approvals 삭제 (FK CASCADE 미설정 대비)
    await supabase
      .from('recurring_approvals')
      .delete()
      .eq('recurring_request_id', id);

    // 3) recurring_request 삭제
    const { error } = await supabase
      .from('recurring_requests')
      .delete()
      .eq('id', id);

    if (error) return createErrorResponse(error.message);

    return Response.json({
      data: null,
      error: null,
      preserved_count: count ?? 0,
      message: `장기 신청이 삭제되었습니다${count ? `. 생성된 개별 신청 ${count}건은 보존됩니다.` : ''}`,
    });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    if (user.role !== 'admin') {
      return Response.json({ data: null, error: '권한이 없습니다' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('recurring_requests')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(SELECTS)
      .single();

    if (error) return createErrorResponse(error.message);
    return Response.json({ data, error: null });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
