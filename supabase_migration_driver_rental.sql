-- 운전기사 이름 (비버스 차량 신청 시 신청자가 입력)
ALTER TABLE requests ADD COLUMN IF NOT EXISTS driver_name TEXT;

-- 배차 운전기사 이름 (비버스: 텍스트, 버스: driver_id 사용)
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS driver_name TEXT;

-- 대차 여부 (외부 차량 임차)
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS is_rental BOOLEAN NOT NULL DEFAULT FALSE;
