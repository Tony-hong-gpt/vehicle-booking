import { createAdminClient } from '@/lib/server/supabase';

const TOKEN = 'sync-depts-2026-once';

export async function POST(request: Request) {
  const { token } = await request.json().catch(() => ({}));
  if (token !== TOKEN) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createAdminClient();

  const { data: users } = await supabase
    .from('users')
    .select('id, department_id')
    .not('department_id', 'is', null);

  if (!users || users.length === 0) {
    return Response.json({ message: '동기화할 사용자 없음', synced: 0 });
  }

  let synced = 0;
  for (const u of users) {
    // 기존 항목 삭제 후 재삽입 (덮어쓰기)
    await supabase.from('user_departments').delete().eq('user_id', u.id);
    await supabase.from('user_departments').insert({ user_id: u.id, department_id: u.department_id });
    synced++;
  }

  return Response.json({ message: '동기화 완료', synced });
}
