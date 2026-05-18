import { createClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data, error } = await supabase.from('departments').select('*').eq('id', id).single();
    if (error) return createErrorResponse('부서를 찾을 수 없습니다', 404);
    return Response.json({ data, error: null });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    if (user.role !== 'admin') {
      return Response.json({ data: null, error: '관리자만 부서를 수정할 수 있습니다' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, code } = body;
    if (!name?.trim()) {
      return Response.json({ data: null, error: '부서명을 입력해주세요' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('departments')
      .update({ name: name.trim(), code: code?.trim() || null })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') return Response.json({ data: null, error: '이미 존재하는 부서명 또는 코드입니다' }, { status: 409 });
      return createErrorResponse(error.message);
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
      return Response.json({ data: null, error: '관리자만 부서를 삭제할 수 있습니다' }, { status: 403 });
    }

    const { id } = await params;
    const supabase = await createClient();

    // 해당 부서에 속한 사용자가 있는지 확인
    const { count } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('department_id', id);
    if ((count ?? 0) > 0) {
      return Response.json({ data: null, error: '해당 부서에 소속된 사용자가 있어 삭제할 수 없습니다' }, { status: 409 });
    }

    const { error } = await supabase.from('departments').delete().eq('id', id);
    if (error) return createErrorResponse(error.message);
    return Response.json({ data: null, error: null, message: '삭제되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
