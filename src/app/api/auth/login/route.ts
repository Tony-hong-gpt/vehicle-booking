import { createClient, createAdminClient } from '@/lib/server/supabase';
import { loginSchema } from '@/lib/validators';

// 전화번호 입력 감지 후 내부 이메일로 변환 (숫자만 추출 후 @member.local)
function resolveEmail(input: string): string {
  if (input.includes('@')) return input;
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

    const email = resolveEmail(parsed.data.email.trim());
    const { password } = parsed.data;
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return Response.json({ data: null, error: '이메일 또는 비밀번호가 올바르지 않습니다' }, { status: 401 });
    }

    // adminClient로 RLS 우회 + 조인 없이 조회
    const adminSupabase = createAdminClient();
    const { data: profiles, error: profileError } = await adminSupabase
      .from('users')
      .select('id, name, email, phone, role, is_active, department_id, employee_no')
      .eq('id', data.user.id)
      .limit(1);

    const profile = profiles?.[0] ?? null;

    if (profileError || !profile) {
      await supabase.auth.signOut();
      return Response.json({ data: null, error: `프로필 조회 실패: ${profileError?.message ?? 'not found'}` }, { status: 500 });
    }

    if (!profile.is_active) {
      await supabase.auth.signOut();
      return Response.json({ data: null, error: '비활성화된 계정입니다' }, { status: 403 });
    }

    return Response.json({ data: profile, error: null, message: '로그인 성공' });
  } catch {
    return Response.json({ data: null, error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}
