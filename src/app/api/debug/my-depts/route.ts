import { createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser } from '@/lib/server/auth';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'not logged in' }, { status: 401 });

  const adminSupabase = createAdminClient();

  const [udResult, profileResult] = await Promise.all([
    adminSupabase.from('user_departments').select('*').eq('user_id', user.id),
    adminSupabase.from('users').select('id, name, department_id').eq('id', user.id).single(),
  ]);

  return Response.json({
    auth_user_id: user.id,
    users_row: profileResult.data,
    users_error: profileResult.error?.message,
    user_departments_rows: udResult.data,
    user_departments_error: udResult.error?.message,
  });
}
