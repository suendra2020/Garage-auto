-- 0002_rls_policies.sql
-- Strict Row Level Security (RLS), role helpers, and auth profile triggers for GARAGE-CONNECT-APP.
-- Never trusts garage_id from client payloads without verifying authenticated membership in public.garage_users.

-- 1. Automatic profile sync from auth.users (never allows client metadata to self-assign super_admin)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email, ''), '@', 1)),
    COALESCE(NEW.email, ''),
    'garage_staff'
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 2. Prevent non-super-admins from escalating their own profile role
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF auth.role() <> 'service_role' AND NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Only platform super admins can modify profile roles.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- 3. Security-definer membership & role helper functions
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_garage_member(target_garage_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.garage_users gu
    WHERE gu.garage_id = target_garage_id
      AND gu.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_garage_admin(target_garage_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.garage_users gu
    WHERE gu.garage_id = target_garage_id
      AND gu.user_id = auth.uid()
      AND gu.role = 'garage_admin'
  );
$$;

-- 4. Atomic garage workspace onboarding RPC for authenticated users
CREATE OR REPLACE FUNCTION public.create_garage_workspace(
  p_garage_name TEXT,
  p_address TEXT DEFAULT NULL,
  p_phone_number TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_subscription_plan TEXT DEFAULT 'plan_starter'
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

REVOKE ALL ON FUNCTION public.create_garage_workspace(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_garage_workspace(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- 5. Enable and FORCE Row Level Security on ALL 9 tables
ALTER TABLE public.garages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garages FORCE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.garage_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garage_users FORCE ROW LEVEL SECURITY;

ALTER TABLE public.job_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_cards FORCE ROW LEVEL SECURITY;

ALTER TABLE public.excel_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.excel_imports FORCE ROW LEVEL SECURITY;

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_templates FORCE ROW LEVEL SECURITY;

ALTER TABLE public.whatsapp_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.customer_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_consents FORCE ROW LEVEL SECURITY;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions FORCE ROW LEVEL SECURITY;

-- 6. RLS Policies: garages
DROP POLICY IF EXISTS garages_select_authorized ON public.garages;
CREATE POLICY garages_select_authorized ON public.garages
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.is_garage_member(id));

DROP POLICY IF EXISTS garages_insert_super_admin ON public.garages;
CREATE POLICY garages_insert_super_admin ON public.garages
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS garages_update_authorized ON public.garages;
CREATE POLICY garages_update_authorized ON public.garages
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.is_garage_admin(id))
  WITH CHECK (public.is_super_admin() OR public.is_garage_admin(id));

DROP POLICY IF EXISTS garages_delete_super_admin ON public.garages;
CREATE POLICY garages_delete_super_admin ON public.garages
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- 7. RLS Policies: profiles
DROP POLICY IF EXISTS profiles_select_self_or_admin ON public.profiles;
CREATE POLICY profiles_select_self_or_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.garage_users gu_target
      JOIN public.garage_users gu_actor
        ON gu_actor.garage_id = gu_target.garage_id
      WHERE gu_target.user_id = profiles.id
        AND gu_actor.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS profiles_update_self_or_super_admin ON public.profiles;
CREATE POLICY profiles_update_self_or_super_admin ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_super_admin())
  WITH CHECK (id = auth.uid() OR public.is_super_admin());

-- 8. RLS Policies: garage_users (supports multiple garages per authorized user)
DROP POLICY IF EXISTS garage_users_select_scoped ON public.garage_users;
CREATE POLICY garage_users_select_scoped ON public.garage_users
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR public.is_garage_member(garage_id)
  );

DROP POLICY IF EXISTS garage_users_insert_admin ON public.garage_users;
CREATE POLICY garage_users_insert_admin ON public.garage_users
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR public.is_garage_admin(garage_id));

DROP POLICY IF EXISTS garage_users_update_admin ON public.garage_users;
CREATE POLICY garage_users_update_admin ON public.garage_users
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.is_garage_admin(garage_id))
  WITH CHECK (public.is_super_admin() OR public.is_garage_admin(garage_id));

DROP POLICY IF EXISTS garage_users_delete_admin ON public.garage_users;
CREATE POLICY garage_users_delete_admin ON public.garage_users
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.is_garage_admin(garage_id));

-- 9. RLS Policies: job_cards (strictly garage-member scoped; Super Admin cannot inspect private customer cards)
DROP POLICY IF EXISTS job_cards_select_member ON public.job_cards;
CREATE POLICY job_cards_select_member ON public.job_cards
  FOR SELECT TO authenticated
  USING (public.is_garage_member(garage_id));

DROP POLICY IF EXISTS job_cards_insert_member ON public.job_cards;
CREATE POLICY job_cards_insert_member ON public.job_cards
  FOR INSERT TO authenticated
  WITH CHECK (public.is_garage_member(garage_id));

DROP POLICY IF EXISTS job_cards_update_member ON public.job_cards;
CREATE POLICY job_cards_update_member ON public.job_cards
  FOR UPDATE TO authenticated
  USING (public.is_garage_member(garage_id))
  WITH CHECK (public.is_garage_member(garage_id));

DROP POLICY IF EXISTS job_cards_delete_admin ON public.job_cards;
CREATE POLICY job_cards_delete_admin ON public.job_cards
  FOR DELETE TO authenticated
  USING (public.is_garage_admin(garage_id));

-- 10. RLS Policies: excel_imports
DROP POLICY IF EXISTS excel_imports_select_member ON public.excel_imports;
CREATE POLICY excel_imports_select_member ON public.excel_imports
  FOR SELECT TO authenticated
  USING (public.is_garage_member(garage_id));

DROP POLICY IF EXISTS excel_imports_insert_member ON public.excel_imports;
CREATE POLICY excel_imports_insert_member ON public.excel_imports
  FOR INSERT TO authenticated
  WITH CHECK (public.is_garage_member(garage_id));

-- 11. RLS Policies: whatsapp_templates
DROP POLICY IF EXISTS whatsapp_templates_select_member ON public.whatsapp_templates;
CREATE POLICY whatsapp_templates_select_member ON public.whatsapp_templates
  FOR SELECT TO authenticated
  USING (public.is_garage_member(garage_id));

DROP POLICY IF EXISTS whatsapp_templates_insert_member ON public.whatsapp_templates;
CREATE POLICY whatsapp_templates_insert_member ON public.whatsapp_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_garage_member(garage_id));

DROP POLICY IF EXISTS whatsapp_templates_update_member ON public.whatsapp_templates;
CREATE POLICY whatsapp_templates_update_member ON public.whatsapp_templates
  FOR UPDATE TO authenticated
  USING (public.is_garage_member(garage_id))
  WITH CHECK (public.is_garage_member(garage_id));

DROP POLICY IF EXISTS whatsapp_templates_delete_admin ON public.whatsapp_templates;
CREATE POLICY whatsapp_templates_delete_admin ON public.whatsapp_templates
  FOR DELETE TO authenticated
  USING (public.is_garage_admin(garage_id));

-- 12. RLS Policies: whatsapp_logs
DROP POLICY IF EXISTS whatsapp_logs_select_member ON public.whatsapp_logs;
CREATE POLICY whatsapp_logs_select_member ON public.whatsapp_logs
  FOR SELECT TO authenticated
  USING (public.is_garage_member(garage_id));

DROP POLICY IF EXISTS whatsapp_logs_insert_member ON public.whatsapp_logs;
CREATE POLICY whatsapp_logs_insert_member ON public.whatsapp_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_garage_member(garage_id));

-- 13. RLS Policies: customer_consents
DROP POLICY IF EXISTS customer_consents_select_member ON public.customer_consents;
CREATE POLICY customer_consents_select_member ON public.customer_consents
  FOR SELECT TO authenticated
  USING (public.is_garage_member(garage_id));

DROP POLICY IF EXISTS customer_consents_insert_member ON public.customer_consents;
CREATE POLICY customer_consents_insert_member ON public.customer_consents
  FOR INSERT TO authenticated
  WITH CHECK (public.is_garage_member(garage_id));

DROP POLICY IF EXISTS customer_consents_update_member ON public.customer_consents;
CREATE POLICY customer_consents_update_member ON public.customer_consents
  FOR UPDATE TO authenticated
  USING (public.is_garage_member(garage_id))
  WITH CHECK (public.is_garage_member(garage_id));

-- 14. RLS Policies: subscriptions (platform super admin manages; garage members can read their own subscription)
DROP POLICY IF EXISTS subscriptions_select_authorized ON public.subscriptions;
CREATE POLICY subscriptions_select_authorized ON public.subscriptions
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.is_garage_member(garage_id));

DROP POLICY IF EXISTS subscriptions_insert_super_admin ON public.subscriptions;
CREATE POLICY subscriptions_insert_super_admin ON public.subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS subscriptions_update_super_admin ON public.subscriptions;
CREATE POLICY subscriptions_update_super_admin ON public.subscriptions
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS subscriptions_delete_super_admin ON public.subscriptions;
CREATE POLICY subscriptions_delete_super_admin ON public.subscriptions
  FOR DELETE TO authenticated
  USING (public.is_super_admin());
