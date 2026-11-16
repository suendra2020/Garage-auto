-- 0004_flexible_excel_import.sql
-- Adds optional job card import fields (service advisor, invoice number, amount),
-- per-garage saved spreadsheet column mappings, and batch import summary counts.

ALTER TABLE public.garages
  ADD COLUMN IF NOT EXISTS saved_import_mapping JSONB;

ALTER TABLE public.job_cards
  ADD COLUMN IF NOT EXISTS service_advisor TEXT,
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.excel_imports
  ADD COLUMN IF NOT EXISTS updated_records INTEGER NOT NULL DEFAULT 0 CHECK (updated_records >= 0),
  ADD COLUMN IF NOT EXISTS duplicate_records INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_records >= 0);

CREATE INDEX IF NOT EXISTS idx_job_cards_garage_job_number
  ON public.job_cards (garage_id, job_card_number);
