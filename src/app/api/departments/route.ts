import { createClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

// GET: 공개 접근 허용 (회원가입 폼에서 부서 목록 필요)
export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from('departments').select('*').order('name');
    if (error) return createErrorResponse(error.message);
    return Response.json({ data, error: null });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    if (user.role !== 'admin') {
      return Response.json({ data: null, error: '관리자만 부서를 추가할 수 있습니다' }, { status: 403 });
    }

    const body = await request.json();
    const { name, code } = body;
    if (!name?.trim()) {
      return Response.json({ data: null, error: '부서명을 입력해주세요' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('departments')
      .insert({ name: name.trim(), code: code?.trim() || null })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') return Response.json({ data: null, error: '이미 존재하는 부서명 또는 코드입니다' }, { status: 409 });
      return createErrorResponse(error.message);
    }
    return Response.json({ data, error: null, message: '부서가 추가되었습니다' }, { status: 201 });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
