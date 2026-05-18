import { createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';
import { updateUserSchema } from '@/lib/validators';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    const { id } = await params;
    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase
      .from('users')
      .select('id, name, email, phone, role, is_active, department_id, employee_no')
      .eq('id', id)
      .single();
    if (error) return createErrorResponse('사용자를 찾을 수 없습니다', 404);
    const { data: udRows } = await adminSupabase
      .from('user_departments')
      .select('department_id')
      .eq('user_id', id);
    return Response.json({
      data: { ...data, department_ids: (udRows || []).map((r: any) => r.department_id) },
      error: null,
    });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const { id } = await params;
    if (user.id !== id && user.role !== 'admin') {
      return Response.json({ data: null, error: '권한이 없습니다' }, { status: 403 });
    }

    const body = await request.json();
    const { department_ids, ...rest } = body;
    const parsed = updateUserSchema.safeParse(rest);
    if (!parsed.success) {
      return Response.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    // users 테이블 업데이트 (department_id = 첫 번째 선택 부서)
    const primaryDeptId = Array.isArray(department_ids) && department_ids.length > 0
      ? department_ids[0]
      : null;
    const updatePayload = { ...parsed.data, ...(Array.isArray(department_ids) ? { department_id: primaryDeptId } : {}) };
    const { data, error } = await adminSupabase
      .from('users')
      .update(updatePayload)
      .eq('id', id)
      .select('id, name, email, phone, role, is_active, department_id, employee_no')
      .single();
    if (error) return createErrorResponse(error.message);

    // user_departments 동기화
    if (Array.isArray(department_ids)) {
      await adminSupabase.from('user_departments').delete().eq('user_id', id);
      if (department_ids.length > 0) {
        await adminSupabase.from('user_departments').insert(
          department_ids.map((dept_id: string) => ({ user_id: id, department_id: dept_id }))
        );
      }
    }

    return Response.json({ data, error: null, message: '수정되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    if (user.role !== 'admin') {
      return Response.json({ data: null, error: '권한이 없습니다' }, { status: 403 });
    }

    const { id } = await params;
    const adminSupabase = createAdminClient();
    const { error } = await adminSupabase.from('users').update({ is_active: false }).eq('id', id);
    if (error) return createErrorResponse(error.message);
    return Response.json({ data: null, error: null, message: '비활성화되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
