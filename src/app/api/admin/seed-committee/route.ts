/**
 * 차량위원회 테스트 계정 생성 (일회성)
 * Authorization: Bearer MIGRATE_SECRET_2026
 */

const MIGRATE_SECRET = 'MIGRATE_SECRET_2026';

const TEST_ACCOUNTS = [
  {
    name: '홍총무',
    phone: '010-1111-0001',
    role: 'committee_secretary',
    employee_no: 'CMT-0001',
    label: '차량위원회 총무',
  },
  {
    name: '박부위원',
    phone: '010-1111-0002',
    role: 'committee_vice',
    employee_no: 'CMT-0002',
    label: '차량위원회 부위원장 1',
  },
  {
    name: '김부위원',
    phone: '010-1111-0003',
    role: 'committee_vice',
    employee_no: 'CMT-0003',
    label: '차량위원회 부위원장 2',
  },
  {
    name: '이위원장',
    phone: '010-1111-0004',
    role: 'committee_chair',
    employee_no: 'CMT-0004',
    label: '차량위원회 위원장',
  },
];

const DEFAULT_PASSWORD = 'test1234';

function phoneToEmail(phone: string): string {
  return `${phone.replace(/\D/g, '')}@member.local`;
}

export async function POST(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${MIGRATE_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { createAdminClient } = await import('@/lib/server/supabase');
  const adminSupabase = createAdminClient();

  const results: any[] = [];

  for (const account of TEST_ACCOUNTS) {
    const email = phoneToEmail(account.phone);

    try {
      // 이미 존재하는지 확인
      const { data: existing } = await adminSupabase
        .from('users')
        .select('id, name, role')
        .eq('employee_no', account.employee_no)
        .maybeSingle();

      if (existing) {
        results.push({ ...account, status: 'skipped', reason: '이미 존재', id: existing.id });
        continue;
      }

      // Auth 계정 생성
      const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
        email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
      });

      if (authError) {
        // 이미 auth에 존재하면 계속
        if (authError.message.includes('already')) {
          results.push({ ...account, status: 'skipped', reason: 'auth already exists' });
          continue;
        }
        results.push({ ...account, status: 'error', reason: authError.message });
        continue;
      }

      // users 테이블에 프로필 생성
      const { data: profile, error: profileError } = await adminSupabase
        .from('users')
        .insert({
          id: authData.user.id,
          employee_no: account.employee_no,
          name: account.name,
          email,
          phone: account.phone,
          role: account.role,
          is_active: true,
        })
        .select('id, name, email, phone, role, employee_no')
        .single();

      if (profileError) {
        await adminSupabase.auth.admin.deleteUser(authData.user.id);
        results.push({ ...account, status: 'error', reason: profileError.message });
        continue;
      }

      results.push({ ...account, status: 'created', id: profile.id });
    } catch (e: any) {
      results.push({ ...account, status: 'error', reason: e.message });
    }
  }

  const created = results.filter(r => r.status === 'created').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors  = results.filter(r => r.status === 'error').length;

  return Response.json({
    success: errors === 0,
    summary: `생성: ${created}명, 건너뜀: ${skipped}명, 오류: ${errors}명`,
    password: DEFAULT_PASSWORD,
    accounts: results.map(r => ({
      이름: r.name,
      역할: r.label,
      전화: r.phone,
      사번: r.employee_no,
      상태: r.status === 'created' ? '✅ 생성완료' : r.status === 'skipped' ? '⚠️ 이미존재' : `❌ ${r.reason}`,
    })),
  });
}
