import { createClient, createAdminClient } from '@/lib/server/supabase';
import { loginSchema } from '@/lib/validators';

// 전화번호 입력 감지 후 내부 이메일로 변환
function resolveEmail(input: string): string {
  if (input.includes('@')) return input;
  // 전화번호: 숫자만 추출 후 @member.local
  const digits = input.replace(/\D/g, '');
  return `${digits}@member.local`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const email = resolveEmail(parsed.data.email);
    const { password } = parsed.data;
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return Response.json({ data: null, error: '이메일 또는 비밀번호가 올바르지 않습니다' }, { status: 401 });
    }

    // adminClient로 RLS 우회하여 프로필 조회
    const adminSupabase = await createAdminClient();
    const { data: profile } = await adminSupabase
      .from('users')
      .select('*, department:departments(*)')
      .eq('id', data.user.id)
      .single();

    if (!profile?.is_active) {
      await supabase.auth.signOut();
      return Response.json({ data: null, error: '비활성화된 계정입니다' }, { status: 403 });
    }

    return Response.json({ data: profile, error: null, message: '로그인 성공' });
  } catch {
    return Response.json({ data: null, error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}
