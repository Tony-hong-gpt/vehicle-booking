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
