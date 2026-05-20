/**
 * 일회성 DB 마이그레이션 엔드포인트
 * 사용 후 반드시 삭제할 것
 * Authorization: Bearer MIGRATE_SECRET_2026 헤더 필요
 */

const MIGRATE_SECRET = 'MIGRATE_SECRET_2026';

const MIGRATION_SQL = `
-- ① 기존 운행 데이터 전체 삭제 (FK 순서대로)
DELETE FROM public.dispatches;
DELETE FROM public.approvals;
DELETE FROM public.requests;

-- ② users.role CHECK 제약 확장 (차량위원회 3개 role 추가)
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'admin', 'manager', 'employee', 'driver',
    'committee_secretary', 'committee_vice', 'committee_chair'
  ));

-- ③ requests.status CHECK 제약 확장 (위원회 결재 단계 추가)
ALTER TABLE public.requests
  DROP CONSTRAINT IF EXISTS requests_status_check;
ALTER TABLE public.requests
  ADD CONSTRAINT requests_status_check
  CHECK (status IN (
    'pending',
    'upper_approved',
    'committee_reviewing',
    'committee_vice_reviewing',
    'approved',
    'rejected',
    'cancelled',
    'dispatched',
    'in_use',
    'returned',
    'on_hold'
  ));
`;

export async function POST(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${MIGRATE_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Missing env vars' }, { status: 500 });
  }

  try {
    const res = await fetch(`${supabaseUrl}/pg/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ query: MIGRATION_SQL }),
    });

    const text = await res.text();
    if (!res.ok) {
      return Response.json({ error: text }, { status: 500 });
    }

    return Response.json({
      success: true,
      message: 'Migration completed successfully',
      detail: text,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
