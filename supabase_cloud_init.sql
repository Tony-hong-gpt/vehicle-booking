-- =============================================
-- Supabase Cloud 초기화 통합 스크립트
-- =============================================

-- UUID 확장 활성화
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- 마스터 테이블
-- =============================================

CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  employee_no TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'manager', 'employee', 'driver')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.vehicle_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_group_id UUID NOT NULL REFERENCES public.vehicle_groups(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  license_plate TEXT UNIQUE NOT NULL,
  model TEXT,
  year INTEGER,
  capacity INTEGER,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'in_use', 'maintenance', 'inactive')),
  fuel_type TEXT NOT NULL DEFAULT 'gasoline' CHECK (fuel_type IN ('gasoline', 'diesel', 'electric', 'hybrid')),
  current_mileage INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  license_type TEXT,
  license_no TEXT UNIQUE,
  license_expiry DATE,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.purposes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.approval_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  step INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, step)
);

-- =============================================
-- 업무 테이블
-- =============================================

-- 신청번호 생성 함수
CREATE OR REPLACE FUNCTION public.generate_request_no()
RETURNS TEXT AS $$
DECLARE
  v_date TEXT;
  v_seq INTEGER;
  v_no TEXT;
BEGIN
  v_date := TO_CHAR(NOW(), 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO v_seq
  FROM public.requests
  WHERE request_no LIKE 'REQ-' || v_date || '-%';
  v_no := 'REQ-' || v_date || '-' || LPAD(v_seq::TEXT, 4, '0');
  RETURN v_no;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_no TEXT UNIQUE NOT NULL DEFAULT public.generate_request_no(),
  requester_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  purpose_id UUID REFERENCES public.purposes(id) ON DELETE RESTRICT,
  vehicle_group_id UUID NOT NULL REFERENCES public.vehicle_groups(id) ON DELETE RESTRICT,
  preferred_vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  destination TEXT NOT NULL,
  passengers INTEGER NOT NULL DEFAULT 1,
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ NOT NULL,
  reason TEXT,
  custom_purpose VARCHAR(20),
  driver_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'upper_approved', 'approved', 'rejected',
    'cancelled', 'dispatched', 'in_use', 'returned', 'on_hold'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_datetime CHECK (end_datetime > start_datetime),
  CONSTRAINT purpose_required CHECK (
    purpose_id IS NOT NULL OR (custom_purpose IS NOT NULL AND custom_purpose <> '')
  )
);

CREATE TABLE IF NOT EXISTS public.approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  step INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  comment TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.dispatches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID UNIQUE NOT NULL REFERENCES public.requests(id) ON DELETE RESTRICT,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  dispatcher_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ NOT NULL,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  driver_name TEXT,
  is_rental BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.returns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispatch_id UUID UNIQUE NOT NULL REFERENCES public.dispatches(id) ON DELETE RESTRICT,
  returned_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  return_datetime TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_mileage INTEGER NOT NULL,
  fuel_level TEXT NOT NULL DEFAULT 'half' CHECK (fuel_level IN ('empty', 'quarter', 'half', 'three_quarter', 'full')),
  condition TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mileage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispatch_id UUID NOT NULL REFERENCES public.dispatches(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  start_mileage INTEGER NOT NULL,
  end_mileage INTEGER,
  distance INTEGER GENERATED ALWAYS AS (CASE WHEN end_mileage IS NOT NULL THEN end_mileage - start_mileage ELSE NULL END) STORED,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  route TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.maintenances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  maintenance_type TEXT NOT NULL CHECK (maintenance_type IN ('inspection', 'repair', 'wash', 'tire', 'oil', 'other')),
  description TEXT,
  cost INTEGER,
  maintenance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  next_maintenance_date DATE,
  performed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  reference_id UUID,
  reference_type TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 인덱스
-- =============================================

CREATE INDEX IF NOT EXISTS idx_users_department_id ON public.users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_vehicles_vehicle_group_id ON public.vehicles(vehicle_group_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON public.vehicles(status);
CREATE INDEX IF NOT EXISTS idx_drivers_user_id ON public.drivers(user_id);
CREATE INDEX IF NOT EXISTS idx_approval_configs_department_id ON public.approval_configs(department_id);
CREATE INDEX IF NOT EXISTS idx_requests_requester_id ON public.requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_requests_department_id ON public.requests(department_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON public.requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_start_datetime ON public.requests(start_datetime);
CREATE INDEX IF NOT EXISTS idx_approvals_request_id ON public.approvals(request_id);
CREATE INDEX IF NOT EXISTS idx_approvals_approver_id ON public.approvals(approver_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_vehicle_id ON public.dispatches(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_driver_id ON public.dispatches(driver_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_status ON public.dispatches(status);
CREATE INDEX IF NOT EXISTS idx_mileage_logs_vehicle_id ON public.mileage_logs(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_maintenances_vehicle_id ON public.maintenances(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);

-- =============================================
-- Triggers
-- =============================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_requests_updated_at
  BEFORE UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_dispatches_updated_at
  BEFORE UPDATE ON public.dispatches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================
-- RLS 활성화 및 정책
-- =============================================

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purposes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mileage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON public.departments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.users FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.vehicle_groups FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.vehicles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.drivers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.purposes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.approval_configs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.approvals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.dispatches FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.returns FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.mileage_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.maintenances FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================
-- 시드 데이터
-- =============================================

INSERT INTO public.departments (id, name, code) VALUES
  ('00000000-0000-0000-0000-000000000001', '경영지원팀', 'MNG'),
  ('00000000-0000-0000-0000-000000000002', '영업팀', 'SAL'),
  ('00000000-0000-0000-0000-000000000003', '기술팀', 'TEC'),
  ('00000000-0000-0000-0000-000000000004', '총무팀', 'ADM')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.purposes (id, name, is_active) VALUES
  ('10000000-0000-0000-0000-000000000001', '업무방문', true),
  ('10000000-0000-0000-0000-000000000002', '출장', true),
  ('10000000-0000-0000-0000-000000000003', '행사지원', true),
  ('10000000-0000-0000-0000-000000000004', '관공서 방문', true),
  ('10000000-0000-0000-0000-000000000005', '물품 운반', true),
  ('10000000-0000-0000-0000-000000000006', '교육 참석', true)
ON CONFLICT DO NOTHING;

INSERT INTO public.vehicle_groups (id, name, description) VALUES
  ('20000000-0000-0000-0000-000000000001', '일반차량', '5인승 이하 승용차'),
  ('20000000-0000-0000-0000-000000000002', '승합차량', '6인승 이상 승합/미니밴'),
  ('20000000-0000-0000-0000-000000000003', '화물차량', '화물 운반용 차량')
ON CONFLICT DO NOTHING;

INSERT INTO public.vehicles (id, vehicle_group_id, name, license_plate, model, year, capacity, status, fuel_type, current_mileage) VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '현대 소나타', '서울12가1234', '소나타 DN8', 2022, 5, 'available', 'gasoline', 45200),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '기아 K5', '서울34나5678', 'K5 3세대', 2021, 5, 'available', 'gasoline', 62100),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '현대 아반떼', '서울56다9012', '아반떼 CN7', 2023, 5, 'available', 'gasoline', 18500),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '르노 SM6', '서울78라3456', 'SM6 페이스리프트', 2020, 5, 'maintenance', 'gasoline', 89300),
  ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', '쉐보레 말리부', '서울90마7890', '말리부 9세대', 2021, 5, 'available', 'gasoline', 55700),
  ('30000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000002', '현대 스타렉스', '서울12바1234', '스타렉스 밴', 2021, 12, 'available', 'diesel', 78400),
  ('30000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000002', '기아 카니발', '서울34사5678', '카니발 4세대', 2022, 9, 'available', 'diesel', 34200),
  ('30000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000002', '현대 그랜드스타렉스', '서울56아9012', '그랜드스타렉스', 2020, 15, 'available', 'diesel', 112000),
  ('30000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000003', '현대 포터', '서울78자3456', '포터2 일반형', 2022, 2, 'available', 'diesel', 67800),
  ('30000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000003', '기아 봉고', '서울90차7890', '봉고3 일반형', 2021, 2, 'available', 'diesel', 83500),
  ('30000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000003', '현대 마이티', '서울12카1234', '마이티 소형', 2020, 2, 'in_use', 'diesel', 145200)
ON CONFLICT (license_plate) DO NOTHING;
