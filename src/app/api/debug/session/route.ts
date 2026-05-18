import { createClient, createAdminClient } from '@/lib/server/supabase';
import { cookies } from 'next/headers';

export async function GET() {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const cookieNames = allCookies.map(c => c.name);

  // Step 1: supabase.auth.getUser()
  let authUser: any = null;
  let authError: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    authUser = user ? { id: user.id, email: user.email } : null;
    authError = error?.message ?? null;
  } catch (e: any) {
    authError = e?.message ?? 'unknown error';
  }

  // Step 2: adminClient query on public.users
  let profile: any = null;
  let profileError: string | null = null;
  if (authUser?.id) {
    try {
      const adminSupabase = createAdminClient();
      const { data, error } = await adminSupabase
        .from('users')
        .select('id, name, role, is_active')
        .eq('id', authUser.id)
        .single();
      profile = data;
      profileError = error?.message ?? null;
    } catch (e: any) {
      profileError = e?.message ?? 'unknown error';
    }
  }

  return Response.json({
    cookieNames,
    hasSbCookies: cookieNames.some(n => n.startsWith('sb-')),
    authUser,
    authError,
    profile,
    profileError,
  });
}
