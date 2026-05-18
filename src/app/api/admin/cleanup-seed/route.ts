import { createAdminClient } from '@/lib/server/supabase';

const CLEANUP_TOKEN = 'veh-cleanup-2026-once';

export async function POST(request: Request) {
  const { token } = await request.json().catch(() => ({}));
  if (token !== CLEANUP_TOKEN) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createAdminClient();

  // 시드 차량 목록
  const seedNames = [
    '현대 마이티', '현대 스타렉스', '기아 카니발', '현대 그랜드스타렉스',
    '현대 포터', '기아 봉고', '현대 쏠라티', '기아 레이', '현대 아반떼',
    '기아 K5', '현대 싼타페',
  ];

  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id')
    .in('name', seedNames);

  if (!vehicles || vehicles.length === 0) {
    return Response.json({ message: '삭제할 시드 차량이 없습니다', deleted: 0 });
  }

  const vIds = vehicles.map(v => v.id);

  // 연관 requests
  const { data: requests } = await supabase
    .from('requests')
    .select('id')
    .or(`vehicle_id.in.(${vIds.join(',')}),preferred_vehicle_id.in.(${vIds.join(',')})`);

  const rIds = (requests || []).map(r => r.id);

  // 연관 dispatches
  const dispQuery = supabase.from('dispatches').select('id');
  if (vIds.length) dispQuery.or(`vehicle_id.in.(${vIds.join(',')})`);
  const { data: dispatches } = rIds.length
    ? await supabase.from('dispatches').select('id').or(`vehicle_id.in.(${vIds.join(',')}),request_id.in.(${rIds.join(',')})`)
    : await supabase.from('dispatches').select('id').in('vehicle_id', vIds);

  const dIds = (dispatches || []).map(d => d.id);

  // 순서대로 삭제
  if (dIds.length) await supabase.from('returns').delete().in('dispatch_id', dIds);
  if (dIds.length) await supabase.from('dispatches').delete().in('id', dIds);
  if (rIds.length) await supabase.from('requests').delete().in('id', rIds);
  await supabase.from('vehicles').delete().in('id', vIds);

  return Response.json({
    message: '정리 완료',
    deleted_vehicles: vIds.length,
    deleted_requests: rIds.length,
    deleted_dispatches: dIds.length,
  });
}
