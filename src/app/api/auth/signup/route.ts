import { createAdminClient } from '@/lib/server/supabase';
import { signupSchema } from '@/lib/validators';

// 전화번호 → 내부 이메일 변환 (숫자만 추출 후 @member.local)
function phoneToEmail(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@member.local`;
}

// 자동 사번 생성
function generateEmployeeNo(): string {
  return `MBR${Date.now().toString().slice(-7)}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { name, phone, password, department_id } = parsed.data;
    const email = phoneToEmail(phone);
    const adminSupabase = await createAdminClient();

    // 전화번호 중복 확인
    const { data: existing } = await adminSupabase
      .from('users')
      .select('id')
      .eq('phone', phone.replace(/\D/g, '').replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3'))
      .maybeSingle();

    if (existing) {
      return Response.json({ data: null, error: '이미 가입된 전화번호입니다' }, { status: 409 });
    }

    // Supabase Auth 계정 생성
    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      if (authError.message.includes('already')) {
        return Response.json({ data: null, error: '이미 가입된 전화번호입니다' }, { status: 409 });
      }
      return Response.json({ data: null, error: authError.message }, { status: 400 });
    }

    // 전화번호 포맷 정규화 (010-0000-0000)
    const digits = phone.replace(/\D/g, '');
    const formattedPhone = digits.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');

    // users 테이블에 프로필 생성
    const { data: profile, error: profileError } = await adminSupabase
      .from('users')
      .insert({
        id: authData.user.id,
        employee_no: generateEmployeeNo(),
        name: name.trim(),
        email,
        phone: formattedPhone,
        ...(department_id ? { department_id } : {}),
        role: 'employee',
        is_active: true,
      })
      .select('*, department:departments(name)')
      .single();

    if (profileError) {
      await adminSupabase.auth.admin.deleteUser(authData.user.id);
      return Response.json({ data: null, error: profileError.message }, { status: 500 });
    }

    // 가입 시 선택한 부서를 user_departments 에도 저장
    if (department_id) {
      await adminSupabase
        .from('user_departments')
        .insert({ user_id: authData.user.id, department_id });
    }

    return Response.json({ data: profile, error: null, message: '가입이 완료되었습니다' }, { status: 201 });
  } catch {
    return Response.json({ data: null, error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}
