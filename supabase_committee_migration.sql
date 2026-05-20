-- =============================================
-- 차량위원회 역할/상태 마이그레이션
-- Supabase 대시보드 → SQL Editor에서 실행
-- =============================================

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
    RAISE NOTICE 'Dropped constraint: %', r.conname;
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
    RAISE NOTICE 'Dropped constraint: %', r.conname;
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

-- ③ 결과 확인
SELECT
  '마이그레이션 완료' AS result,
  (SELECT string_agg(pg_get_constraintdef(oid), ' | ')
   FROM pg_constraint
   WHERE conrelid = 'public.users'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%role%') AS users_role_check,
  (SELECT string_agg(pg_get_constraintdef(oid), ' | ')
   FROM pg_constraint
   WHERE conrelid = 'public.requests'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%committee%') AS requests_status_check;
