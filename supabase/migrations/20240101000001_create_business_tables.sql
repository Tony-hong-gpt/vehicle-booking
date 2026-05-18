-- =============================================
-- 업무 테이블 7개 생성
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

-- 1. 차량 사용 신청 (requests)
CREATE TABLE IF NOT EXISTS public.requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_no TEXT UNIQUE NOT NULL DEFAULT public.generate_request_no(),
  requester_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  purpose_id UUID NOT NULL REFERENCES public.purposes(id) ON DELETE RESTRICT,
  vehicle_group_id UUID NOT NULL REFERENCES public.vehicle_groups(id) ON DELETE RESTRICT,
  preferred_vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  destination TEXT NOT NULL,
  passengers INTEGER NOT NULL DEFAULT 1,
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'dispatched', 'in_use', 'returned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_datetime CHECK (end_datetime > start_datetime)
);

-- 2. 결재 (approvals)
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

-- 3. 배차 (dispatches)
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
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. 반납 (returns)
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

-- 5. 주행일지 (mileage_logs)
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

-- 6. 정비 기록 (maintenances)
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

-- 7. 알림 (notifications)
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

-- 인덱스
CREATE INDEX idx_requests_requester_id ON public.requests(requester_id);
CREATE INDEX idx_requests_department_id ON public.requests(department_id);
CREATE INDEX idx_requests_status ON public.requests(status);
CREATE INDEX idx_requests_start_datetime ON public.requests(start_datetime);
CREATE INDEX idx_approvals_request_id ON public.approvals(request_id);
CREATE INDEX idx_approvals_approver_id ON public.approvals(approver_id);
CREATE INDEX idx_dispatches_vehicle_id ON public.dispatches(vehicle_id);
CREATE INDEX idx_dispatches_driver_id ON public.dispatches(driver_id);
CREATE INDEX idx_dispatches_status ON public.dispatches(status);
CREATE INDEX idx_mileage_logs_vehicle_id ON public.mileage_logs(vehicle_id);
CREATE INDEX idx_maintenances_vehicle_id ON public.maintenances(vehicle_id);
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_is_read ON public.notifications(is_read);

-- Triggers
CREATE TRIGGER update_requests_updated_at
  BEFORE UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_dispatches_updated_at
  BEFORE UPDATE ON public.dispatches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS 활성화
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mileage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS 정책
CREATE POLICY "authenticated_all" ON public.requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.approvals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.dispatches FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.returns FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.mileage_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.maintenances FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);
