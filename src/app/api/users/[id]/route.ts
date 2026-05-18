import { createClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';
import { updateUserSchema } from '@/lib/validators';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    const { id } = await params;
    const supabase = await createClient();
    const { data, error } = await supabase.from('users').select('*, department:departments(id, name)').eq('id', id).single();
    if (error) return createErrorResponse('사용자를 찾을 수 없습니다', 404);
    return Response.json({ data, error: null });
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
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.from('users').update(parsed.data).eq('id', id).select('*, department:departments(id, name)').single();
    if (error) return createErrorResponse(error.message);
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
    const supabase = await createClient();
    const { error } = await supabase.from('users').update({ is_active: false }).eq('id', id);
    if (error) return createErrorResponse(error.message);
    return Response.json({ data: null, error: null, message: '비활성화되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
