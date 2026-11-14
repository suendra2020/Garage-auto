-- 0001_initial_schema.sql
-- Multi-tenant PostgreSQL schema for GARAGE-CONNECT-APP
-- Every garage-scoped table uses UUID foreign keys referencing public.garages(id).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. garages
CREATE TABLE IF NOT EXISTS public.garages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garage_name TEXT NOT NULL CHECK (char_length(trim(garage_name)) >= 2),
  logo_url TEXT,
  address TEXT,
  phone_number TEXT,
  email TEXT,
  google_review_url TEXT,
  instagram_url TEXT,
  youtube_url TEXT,
  whatsapp_phone_number_id TEXT,
  subscription_plan TEXT NOT NULL DEFAULT 'plan_starter',
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'pending', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. profiles (linked 1:1 with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'garage_staff' CHECK (role IN ('super_admin', 'garage_admin', 'garage_staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. garage_users (many-to-many membership supporting multiple garages per authorized user)
CREATE TABLE IF NOT EXISTS public.garage_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garage_id UUID NOT NULL REFERENCES public.garages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('garage_admin', 'garage_staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_garage_users_membership UNIQUE (garage_id, user_id)
);

-- 4. job_cards
CREATE TABLE IF NOT EXISTS public.job_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garage_id UUID NOT NULL REFERENCES public.garages(id) ON DELETE CASCADE,
  job_card_number TEXT NOT NULL CHECK (char_length(trim(job_card_number)) >= 1),
  customer_name TEXT NOT NULL CHECK (char_length(trim(customer_name)) >= 1),
  mobile_number TEXT,
  vehicle_number TEXT NOT NULL,
  vehicle_brand TEXT,
  vehicle_model TEXT,
  service_details TEXT,
  job_card_status TEXT NOT NULL DEFAULT 'Open',
  delivery_date TIMESTAMPTZ,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_job_cards_garage_number UNIQUE (garage_id, job_card_number)
);

-- 5. excel_imports
CREATE TABLE IF NOT EXISTS public.excel_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garage_id UUID NOT NULL REFERENCES public.garages(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  total_records INTEGER NOT NULL DEFAULT 0 CHECK (total_records >= 0),
  imported_records INTEGER NOT NULL DEFAULT 0 CHECK (imported_records >= 0),
  skipped_records INTEGER NOT NULL DEFAULT 0 CHECK (skipped_records >= 0),
  failed_records INTEGER NOT NULL DEFAULT 0 CHECK (failed_records >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. whatsapp_templates
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garage_id UUID NOT NULL REFERENCES public.garages(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL CHECK (char_length(trim(template_name)) >= 2),
  template_category TEXT NOT NULL CHECK (template_category IN ('delivery_notification', 'google_review_invite', 'social_follow_up')),
  template_content TEXT NOT NULL,
  meta_template_name TEXT,
  approval_status TEXT NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft', 'pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. whatsapp_logs
CREATE TABLE IF NOT EXISTS public.whatsapp_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garage_id UUID NOT NULL REFERENCES public.garages(id) ON DELETE CASCADE,
  job_card_id UUID REFERENCES public.job_cards(id) ON DELETE SET NULL,
  recipient_number TEXT NOT NULL,
  message_type TEXT NOT NULL,
  message_status TEXT NOT NULL DEFAULT 'draft_not_sent' CHECK (message_status IN ('draft_not_sent', 'queued', 'sent', 'delivered', 'read', 'failed')),
  whatsapp_message_id TEXT,
  sent_at TIMESTAMPTZ,
  error_message TEXT
);

-- 8. customer_consents
CREATE TABLE IF NOT EXISTS public.customer_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garage_id UUID NOT NULL REFERENCES public.garages(id) ON DELETE CASCADE,
  customer_mobile TEXT NOT NULL,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('whatsapp_delivery', 'google_review_invite', 'social_follow_up')),
  consent_status TEXT NOT NULL CHECK (consent_status IN ('opted_in', 'opted_out', 'pending')),
  consent_source TEXT NOT NULL DEFAULT 'job_card_import',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_customer_consents_garage_mobile_type UNIQUE (garage_id, customer_mobile, consent_type)
);

-- 9. subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garage_id UUID NOT NULL REFERENCES public.garages(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'cancelled')),
  start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  expiry_date TIMESTAMPTZ
);

-- Performance & tenant-isolation indexes
CREATE INDEX IF NOT EXISTS idx_garages_account_status ON public.garages (account_status);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);
CREATE INDEX IF NOT EXISTS idx_garage_users_user_id ON public.garage_users (user_id);
CREATE INDEX IF NOT EXISTS idx_garage_users_garage_id ON public.garage_users (garage_id);
CREATE INDEX IF NOT EXISTS idx_job_cards_garage_id ON public.job_cards (garage_id);
CREATE INDEX IF NOT EXISTS idx_job_cards_garage_status ON public.job_cards (garage_id, job_card_status);
CREATE INDEX IF NOT EXISTS idx_job_cards_garage_delivery ON public.job_cards (garage_id, delivery_date);
CREATE INDEX IF NOT EXISTS idx_excel_imports_garage_id ON public.excel_imports (garage_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_garage_id ON public.whatsapp_templates (garage_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_garage_id ON public.whatsapp_logs (garage_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_job_card_id ON public.whatsapp_logs (job_card_id);
CREATE INDEX IF NOT EXISTS idx_customer_consents_garage_mobile ON public.customer_consents (garage_id, customer_mobile);
CREATE INDEX IF NOT EXISTS idx_subscriptions_garage_id ON public.subscriptions (garage_id, status);
