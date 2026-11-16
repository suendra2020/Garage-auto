-- Migration 0005: Delivery confirmation audit metadata on job_cards
-- Records which authorized garage staff/admin confirmed handover and exact confirmation timestamp.

ALTER TABLE public.job_cards
  ADD COLUMN IF NOT EXISTS delivered_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_confirmed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_job_cards_garage_delivery_date
  ON public.job_cards (garage_id, delivery_date DESC);

CREATE INDEX IF NOT EXISTS idx_job_cards_delivered_by
  ON public.job_cards (garage_id, delivered_by);
