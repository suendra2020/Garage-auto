-- Migration 0007: Live WhatsApp Cloud API verification state, template metadata, and webhook status tracking

-- 1. Persistent live verification state on garages (never updated to 'connected' without real API verification)
ALTER TABLE public.garages
  ADD COLUMN IF NOT EXISTS whatsapp_connection_status TEXT NOT NULL DEFAULT 'not_connected'
    CHECK (whatsapp_connection_status IN ('not_connected', 'pending_setup', 'connected')),
  ADD COLUMN IF NOT EXISTS whatsapp_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_verified_phone_number TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_verified_name TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_last_test_error TEXT;

-- 2. Meta template language & update audit on whatsapp_templates
ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS meta_language_code TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 3. Full outbound dispatch + Meta webhook status lifecycle on whatsapp_logs
ALTER TABLE public.whatsapp_logs
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS meta_template_name TEXT,
  ADD COLUMN IF NOT EXISTS rendered_message TEXT,
  ADD COLUMN IF NOT EXISTS sent_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS webhook_payload JSONB;

-- Fast lookup index for Meta webhook status callbacks by wamid
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_wamid
  ON public.whatsapp_logs (whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_garage_jobcard
  ON public.whatsapp_logs (garage_id, job_card_id, sent_at DESC);
