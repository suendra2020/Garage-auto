-- 0003_auth_staff_security.sql
-- Hardens garage membership security, prevents unauthorized role changes,
-- supports staff invitations, and ensures garage registration sets owner profile name.

-- 1. Staff invitations table (allows garage_admin to invite staff by email even before signup)
CREATE TABLE IF NOT EXISTS public.garage_staff_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garage_id UUID NOT NULL REFERENCES public.garages(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'garage_staff' CHECK (role = 'garage_staff'),
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_garage_staff_invitation UNIQUE (garage_id, email)
);

CREATE INDEX IF NOT EXISTS idx_staff_invitations_email ON public.garage_staff_invitations (lower(email), status);

ALTER TABLE public.garage_staff_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garage_staff_invitations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_invitations_admin_select ON public.garage_staff_invitations;
CREATE POLICY staff_invitations_admin_select ON public.garage_staff_invitations
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_garage_admin(garage_id)
    OR lower(email) = lower(COALESCE(auth.jwt()->>'email', ''))
  );

DROP POLICY IF EXISTS staff_invitations_admin_insert ON public.garage_staff_invitations;
CREATE POLICY staff_invitations_admin_insert ON public.garage_staff_invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_garage_admin(garage_id)
    AND role = 'garage_staff'
  );

DROP POLICY IF EXISTS staff_invitations_admin_update ON public.garage_staff_invitations;
CREATE POLICY staff_invitations_admin_update ON public.garage_staff_invitations
  FOR UPDATE TO authenticated
  USING (public.is_garage_admin(garage_id) OR public.is_super_admin())
  WITH CHECK (public.is_garage_admin(garage_id) OR public.is_super_admin());

-- 2. Trigger preventing unauthorized users from changing their garage membership or role
CREATE OR REPLACE FUNCTION public.prevent_unauthorized_garage_membership_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_garage_admin(NEW.garage_id) THEN
      RAISE EXCEPTION 'Only an authorized garage admin can add members to this garage.';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.garage_id IS DISTINCT FROM OLD.garage_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Garage membership target cannot be reassigned.';
    END IF;
    IF NOT public.is_garage_admin(OLD.garage_id) THEN
      RAISE EXCEPTION 'Unauthorized role change blocked.';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_unauthorized_garage_membership_change ON public.garage_users;
CREATE TRIGGER trg_prevent_unauthorized_garage_membership_change
  BEFORE INSERT OR UPDATE ON public.garage_users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_unauthorized_garage_membership_change();

-- 3. Update create_garage_workspace RPC to also persist owner name on profiles
CREATE OR REPLACE FUNCTION public.create_garage_workspace(
  p_garage_name TEXT,
  p_address TEXT DEFAULT NULL,
  p_phone_number TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_subscription_plan TEXT DEFAULT 'plan_starter',
  p_owner_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_garage_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create a garage workspace.';
  END IF;

  IF p_owner_name IS NOT NULL AND char_length(trim(p_owner_name)) > 0 THEN
    UPDATE public.profiles
    SET full_name = trim(p_owner_name)
    WHERE id = v_user_id;
  END IF;

  INSERT INTO public.garages (
    garage_name,
    address,
    phone_number,
    email,
    subscription_plan,
    account_status
  )
  VALUES (
    trim(p_garage_name),
    p_address,
    p_phone_number,
    p_email,
    COALESCE(NULLIF(trim(p_subscription_plan), ''), 'plan_starter'),
    'active'
  )
  RETURNING id INTO v_garage_id;

  INSERT INTO public.garage_users (garage_id, user_id, role)
  VALUES (v_garage_id, v_user_id, 'garage_admin');

  INSERT INTO public.subscriptions (garage_id, plan_name, status)
  VALUES (v_garage_id, COALESCE(NULLIF(trim(p_subscription_plan), ''), 'plan_starter'), 'active');

  RETURN v_garage_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_garage_workspace(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_garage_workspace(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- 4. RPC allowing verified staff user to accept pending invitations matching their JWT email
CREATE OR REPLACE FUNCTION public.accept_pending_garage_invitations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_email TEXT := lower(COALESCE(auth.jwt()->>'email', ''));
  v_count INTEGER := 0;
  rec RECORD;
BEGIN
  IF v_user_id IS NULL OR v_email = '' THEN
    RETURN 0;
  END IF;

  FOR rec IN
    SELECT id, garage_id
    FROM public.garage_staff_invitations
    WHERE lower(email) = v_email
      AND status = 'pending'
  LOOP
    INSERT INTO public.garage_users (garage_id, user_id, role)
    VALUES (rec.garage_id, v_user_id, 'garage_staff')
    ON CONFLICT (garage_id, user_id) DO NOTHING;

    UPDATE public.garage_staff_invitations
    SET status = 'accepted'
    WHERE id = rec.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_pending_garage_invitations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_pending_garage_invitations() TO authenticated;
