import { createClient, createAdminClient } from '@/lib/server/supabase';
import { loginSchema } from '@/lib/validators';

function isPhone(input: string): boolean {
  return /^[0-9\-\s+]+$/.test(input.trim()) && !input.includes('@');
}

function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  // 010-0000-0000 형식으로 정규화
  if (digits.length === 11) return `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`;
  return digits;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const input = parsed.data.email.trim();
    const { password } = parsed.data;
    const adminSupabase = createAdminClient();
    const supabase = await createClient();

    let email: string;

    if (isPhone(input)) {
      // 전화번호로 입력된 경우 → DB에서 실제 이메일 조회
      const phone = normalizePhone(input);
      const { data: users } = await adminSupabase
        .from('users')
        .select('email')
        .or(`phone.eq.${phone},phone.eq.${input.replace(/\D/g,'')}`)
        .limit(1);

      if (!users || users.length === 0) {
        return Response.json({ data: null, error: '이메일 또는 비밀번호가 올바르지 않습니다' }, { status: 401 });
      }
      email = users[0].email;
    } else {
      email = input;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return Response.json({ data: null, error: '이메일 또는 비밀번호가 올바르지 않습니다' }, { status: 401 });
    }

    // adminClient로 RLS 우회 + 조인 없이 조회
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
