-- requests 테이블: purpose_id nullable로 변경 + custom_purpose 컬럼 추가
ALTER TABLE public.requests
  ALTER COLUMN purpose_id DROP NOT NULL;

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS custom_purpose VARCHAR(20);

-- purpose_id 또는 custom_purpose 중 하나는 반드시 있어야 함
ALTER TABLE public.requests
  ADD CONSTRAINT purpose_required CHECK (
    purpose_id IS NOT NULL OR (custom_purpose IS NOT NULL AND custom_purpose <> '')
  );
