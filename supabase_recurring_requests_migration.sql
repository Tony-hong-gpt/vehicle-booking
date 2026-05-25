-- =============================================
-- 장기 차량 신청(recurring_requests) 마이그레이션
-- Supabase 대시보드 → SQL Editor에서 실행
-- =============================================

-- 1. 장기 신청 그룹 테이블
CREATE TABLE IF NOT EXISTS public.recurring_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,                        -- 장기 신청 제목 (예: "임원 정기 운행")
  requester_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  purpose_id UUID REFERENCES public.purposes(id) ON DELETE SET NULL,
  custom_purpose TEXT,
  vehicle_group_id UUID NOT NULL REFERENCES public.vehicle_groups(id) ON DELETE RESTRICT,
  destination TEXT NOT NULL,
  passengers INTEGER NOT NULL DEFAULT 1,
  driver_name TEXT,
  driver_phone TEXT,

  -- 반복 패턴
  -- 'weekly'         : 매주 특정 요일 (weekdays 사용)
  -- 'biweekly'       : 격주 특정 요일 (weekdays 사용, period_start 기준 홀짝 주)
  -- 'monthly_date'   : 매월 특정 날짜들 (monthly_dates 사용)
  -- 'monthly_weekday': 매월 N번째 특정 요일 (week_of_month + weekday 사용)
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('weekly', 'biweekly', 'monthly_date', 'monthly_weekday')),
  weekdays INTEGER[],       -- 요일 배열 0=일 1=월 2=화 3=수 4=목 5=금 6=토 (weekly/biweekly)
  monthly_dates INTEGER[],  -- 날짜 배열 1~31 (monthly_date)
  week_of_month INTEGER,    -- N번째 주 1~5, -1=마지막 (monthly_weekday)
  weekday INTEGER,          -- 요일 0~6 (monthly_weekday)

  -- 시간 (HH:MM 형식)
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,

  -- 적용 기간
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- 승인 상태 (committee 결재 흐름 동일 적용, admin 등록 시 upper_approved로 시작)
  status TEXT NOT NULL DEFAULT 'upper_approved' CHECK (status IN (
    'upper_approved',
    'committee_reviewing',
    'committee_vice_reviewing',
    'approved',
    'rejected',
    'on_hold',
    'cancelled'
  )),

  reason TEXT,
  generated_count INTEGER DEFAULT 0,  -- 최종 승인 시 생성된 개별 신청 수

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_period CHECK (period_end >= period_start),
  CONSTRAINT valid_time_format CHECK (
    start_time ~ '^\d{2}:\d{2}$' AND end_time ~ '^\d{2}:\d{2}$'
  )
);

-- 2. 장기 신청 결재 이력 테이블
CREATE TABLE IF NOT EXISTS public.recurring_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recurring_request_id UUID NOT NULL REFERENCES public.recurring_requests(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  step INTEGER NOT NULL,
  -- step 3: 총무(committee_secretary)
  -- step 4: 부위원장(committee_vice)
  -- step 5: 위원장(committee_chair)
  -- step 99: 관리자 직권 승인
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  comment TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. requests 테이블에 recurring_request_id 컬럼 추가 (어느 장기 신청에서 생성됐는지 추적)
ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS recurring_request_id UUID
  REFERENCES public.recurring_requests(id) ON DELETE SET NULL;

-- 4. custom_purpose 컬럼 (이미 있을 경우 무시)
ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS custom_purpose TEXT;

-- 5. driver_name / driver_phone (이미 있을 경우 무시)
ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS driver_name TEXT;
ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS driver_phone TEXT;

-- 6. 인덱스
CREATE INDEX IF NOT EXISTS idx_recurring_requests_status ON public.recurring_requests(status);
CREATE INDEX IF NOT EXISTS idx_recurring_requests_requester_id ON public.recurring_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_recurring_approvals_recurring_request_id ON public.recurring_approvals(recurring_request_id);
CREATE INDEX IF NOT EXISTS idx_requests_recurring_request_id ON public.requests(recurring_request_id);

-- 7. updated_at 자동 갱신 트리거
CREATE TRIGGER update_recurring_requests_updated_at
  BEFORE UPDATE ON public.recurring_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 8. RLS 활성화
ALTER TABLE public.recurring_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON public.recurring_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.recurring_approvals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 9. 결과 확인
SELECT 'recurring_requests 마이그레이션 완료' AS result;
