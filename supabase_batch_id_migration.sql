-- ================================================================
-- batch_id 마이그레이션: 동시 일괄 신청 묶음 식별
-- 실행 위치: Supabase SQL Editor
-- ================================================================

-- 1. batch_id 컬럼 추가
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS batch_id UUID;

-- 2. 인덱스 생성 (같은 batch_id 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_requests_batch_id
  ON requests(batch_id)
  WHERE batch_id IS NOT NULL;

-- 완료 확인
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'requests' AND column_name = 'batch_id';
