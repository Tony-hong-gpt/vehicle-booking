-- =============================================
-- 마스터 테이블 7개 생성
-- =============================================

-- UUID 확장 활성화
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. 부서 (departments)
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. 사용자 프로필 (users) - auth.users 확장
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

-- 3. 차량군 (vehicle_groups)
CREATE TABLE IF NOT EXISTS public.vehicle_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. 차량 (vehicles)
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

-- 5. 운전기사 (drivers)
CREATE TABLE IF NOT EXISTS public.drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  license_type TEXT,
  license_no TEXT UNIQUE,
  license_expiry DATE,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. 사용목적 (purposes)
CREATE TABLE IF NOT EXISTS public.purposes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. 결재 설정 (approval_configs)
CREATE TABLE IF NOT EXISTS public.approval_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  step INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, step)
);

-- 인덱스
CREATE INDEX idx_users_department_id ON public.users(department_id);
CREATE INDEX idx_users_role ON public.users(role);
CREATE INDEX idx_vehicles_vehicle_group_id ON public.vehicles(vehicle_group_id);
CREATE INDEX idx_vehicles_status ON public.vehicles(status);
CREATE INDEX idx_drivers_user_id ON public.drivers(user_id);
CREATE INDEX idx_approval_configs_department_id ON public.approval_configs(department_id);

-- updated_at 자동 갱신 함수
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS 활성화
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purposes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_configs ENABLE ROW LEVEL SECURITY;

-- RLS 정책 (인증된 사용자 전체 허용 - 추후 세분화)
CREATE POLICY "authenticated_all" ON public.departments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.users FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.vehicle_groups FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.vehicles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.drivers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.purposes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.approval_configs FOR ALL TO authenticated USING (true) WITH CHECK (true);
