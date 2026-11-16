-- Migration 0006: Garage public connection page settings, unique slugs, and anonymous-safe lookup RPC

ALTER TABLE public.garages
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS customer_welcome_text TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_waba_id TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_display_name TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_default_message TEXT;

-- Backfill clean unique slugs for any existing garages without a slug
WITH normalized AS (
  SELECT
    id,
    COALESCE(
      NULLIF(trim(BOTH '-' FROM regexp_replace(lower(garage_name), '[^a-z0-9]+', '-', 'g')), ''),
      'garage'
    ) AS base_slug,
    row_number() OVER (
      PARTITION BY COALESCE(
        NULLIF(trim(BOTH '-' FROM regexp_replace(lower(garage_name), '[^a-z0-9]+', '-', 'g')), ''),
        'garage'
      )
      ORDER BY created_at, id
    ) AS rn
  FROM public.garages
  WHERE slug IS NULL OR trim(slug) = ''
)
UPDATE public.garages g
SET slug = CASE
  WHEN n.rn = 1 THEN n.base_slug
  ELSE n.base_slug || '-' || left(g.id::text, 6)
END
FROM normalized n
WHERE g.id = n.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_garages_slug_lower
  ON public.garages (lower(slug))
  WHERE slug IS NOT NULL;

-- Secure public lookup RPC returning ONLY non-sensitive public connection details
-- for the exact requested active garage slug. Never exposes API IDs, job cards, or other garages.
CREATE OR REPLACE FUNCTION public.get_public_garage_connection_page(p_slug TEXT)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  garage_name TEXT,
  logo_url TEXT,
  address TEXT,
  phone_number TEXT,
  customer_welcome_text TEXT,
  google_review_url TEXT,
  instagram_url TEXT,
  youtube_url TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    g.id,
    g.slug,
    g.garage_name,
    g.logo_url,
    g.address,
    g.phone_number,
    g.customer_welcome_text,
    g.google_review_url,
    g.instagram_url,
    g.youtube_url
  FROM public.garages g
  WHERE lower(g.slug) = lower(trim(p_slug))
    AND g.account_status = 'active'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_garage_connection_page(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_garage_connection_page(TEXT) TO anon, authenticated;
