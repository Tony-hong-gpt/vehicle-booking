import { createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

// 내 소속 목록 조회
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const adminSupabase = createAdminClient();

    // 1단계: user_departments에서 department_id 목록만 조회 (join 없이)
    const { data: udRows, error } = await adminSupabase
      .from('user_departments')
      .select('department_id')
      .eq('user_id', user.id);

    if (error) return createErrorResponse(error.message);

    let deptIds: string[] = (udRows || []).map((r: any) => r.department_id).filter(Boolean);

    // user_departments가 비어 있으면 users.department_id로 자동 복구
    if (deptIds.length === 0) {
      const { data: profile } = await adminSupabase
        .from('users')
        .select('department_id')
        .eq('id', user.id)
        .single();

      if (profile?.department_id) {
        await adminSupabase
          .from('user_departments')
          .insert({ user_id: user.id, department_id: profile.department_id });
        deptIds = [profile.department_id];
      }
    }

    if (deptIds.length === 0) {
      return Response.json({ data: [], error: null });
    }

    // 2단계: department_id 목록으로 departments 조회
    const { data: depts } = await adminSupabase
      .from('departments')
      .select('id, name')
      .in('id', deptIds);

    return Response.json({ data: depts || [], error: null });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}

// 내 소속 전체 교체 (PUT)
export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const body = await request.json();
    const { department_ids } = body;
    if (!Array.isArray(department_ids)) {
      return Response.json({ data: null, error: '잘못된 요청입니다' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    // 기존 소속 전체 삭제 후 새로 삽입
    await adminSupabase.from('user_departments').delete().eq('user_id', user.id);

    if (department_ids.length > 0) {
      const rows = department_ids.map((dept_id: string) => ({
        user_id: user.id,
        department_id: dept_id,
      }));
      const { error } = await adminSupabase.from('user_departments').insert(rows);
      if (error) return createErrorResponse(error.message);
    }

    return Response.json({ data: null, error: null, message: '소속이 저장되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
