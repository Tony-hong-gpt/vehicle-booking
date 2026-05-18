import { createAdminClient } from '@/lib/server/supabase';

const TOKEN = 'sync-depts-2026-once';

export async function POST(request: Request) {
  const { token } = await request.json().catch(() => ({}));
  if (token !== TOKEN) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createAdminClient();

  // users 테이블에 department_id 있지만 user_departments에 없는 사용자 동기화
  const { data: users } = await supabase
    .from('users')
    .select('id, department_id')
    .not('department_id', 'is', null);

  if (!users || users.length === 0) {
    return Response.json({ message: '동기화할 사용자 없음', synced: 0 });
  }

  let synced = 0;
  for (const u of users) {
    const { data: existing } = await supabase
      .from('user_departments')
      .select('id')
      .eq('user_id', u.id)
      .eq('department_id', u.department_id)
      .maybeSingle();

    if (!existing) {
      await supabase.from('user_departments').insert({ user_id: u.id, department_id: u.department_id });
      synced++;
    }
  }

  return Response.json({ message: '동기화 완료', synced });
}
