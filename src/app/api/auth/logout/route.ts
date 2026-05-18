import { createClient } from '@/lib/server/supabase';

export async function POST() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
    return Response.json({ data: null, error: null, message: '로그아웃 성공' });
  } catch {
    return Response.json({ data: null, error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}
