import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SECRET = 'c38c548d330092511de8f32dafd392e9f3859d442cd5040e';

export async function POST(req: NextRequest) {
  const { token } = await req.json().catch(() => ({}));
  if (token !== SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const results: Record<string, string> = {};

  // FK 순서대로 삭제
  const tables = ['mileage_logs', 'returns', 'notifications', 'dispatches', 'approvals', 'requests'];
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    results[table] = error ? `ERROR: ${error.message}` : 'deleted';
  }

  // 운행중 차량 → 사용가능으로 초기화
  const { error: vErr } = await supabase
    .from('vehicles')
    .update({ status: 'available' })
    .eq('status', 'in_use');
  results['vehicles_reset'] = vErr ? `ERROR: ${vErr.message}` : 'reset to available';

  // 삭제 후 건수 확인
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
    counts[table] = count ?? -1;
  }

  return NextResponse.json({ results, counts });
}
