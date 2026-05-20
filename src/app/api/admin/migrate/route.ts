/**
 * 차량위원회 역할/상태 DB 마이그레이션 엔드포인트
 * Authorization: Bearer MIGRATE_SECRET_2026 헤더 필요
 *
 * Supabase Management API를 통해 SQL을 실행합니다.
 * 환경변수 SUPABASE_MANAGEMENT_API_TOKEN 이 필요합니다.
 * (Supabase 대시보드 → Account → Access Tokens 에서 발급)
 */

const MIGRATE_SECRET = 'MIGRATE_SECRET_2026';

// Supabase 프로젝트 ref 추출 (URL에서)
function getProjectRef(supabaseUrl: string): string {
  // https://mytagewdsoskxgcrzmb.supabase.co → mytagewdsoskxgcrzmb
  const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match?.[1] ?? '';
}

const MIGRATION_SQL = `
-- ① users.role CHECK 제약 확장 (차량위원회 3개 role 추가)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%role%'
  ) LOOP
    EXECUTE 'ALTER TABLE public.users DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'admin', 'manager', 'employee', 'driver',
    'committee_secretary', 'committee_vice', 'committee_chair'
  ));

-- ② requests.status CHECK 제약 확장 (위원회 결재 단계 추가)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.requests'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%'
      AND pg_get_constraintdef(oid) NOT LIKE '%end_datetime%'
      AND pg_get_constraintdef(oid) NOT LIKE '%purpose%'
  ) LOOP
    EXECUTE 'ALTER TABLE public.requests DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

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

SELECT 'Migration completed: committee roles and statuses added' AS result;
`;

export async function POST(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${MIGRATE_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const managementToken = process.env.SUPABASE_MANAGEMENT_API_TOKEN;

  if (!supabaseUrl) {
    return Response.json({ error: 'Missing NEXT_PUBLIC_SUPABASE_URL' }, { status: 500 });
  }

  if (!managementToken) {
    // Management API 토큰이 없으면 SQL을 반환해 수동 실행 안내
    return Response.json({
      error: 'SUPABASE_MANAGEMENT_API_TOKEN 환경변수가 없습니다',
      instruction: 'Supabase 대시보드 → SQL Editor에서 아래 SQL을 직접 실행해주세요',
      sql: MIGRATION_SQL,
    }, { status: 500 });
  }

  const projectRef = getProjectRef(supabaseUrl);
  if (!projectRef) {
    return Response.json({ error: 'Supabase URL에서 프로젝트 ref를 추출할 수 없습니다' }, { status: 500 });
  }

  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${managementToken}`,
      },
      body: JSON.stringify({ query: MIGRATION_SQL }),
    });

    const json = await res.json();

    if (!res.ok) {
      return Response.json({ error: json, sql: MIGRATION_SQL }, { status: 500 });
    }

    return Response.json({
      success: true,
      message: '마이그레이션 완료: 차량위원회 role/status가 DB에 추가되었습니다',
      detail: json,
    });
  } catch (e: any) {
    return Response.json({ error: e.message, sql: MIGRATION_SQL }, { status: 500 });
  }
}

/** DB 마이그레이션 상태 확인 */
export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${MIGRATE_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return Response.json({
    message: 'Supabase SQL Editor에서 실행할 마이그레이션 SQL입니다',
    sql: MIGRATION_SQL,
  });
}
