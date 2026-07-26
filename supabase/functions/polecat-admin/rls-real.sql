-- Real per-user Row-Level Security for the `go-live` action.
-- Condensed copy of the canonical, fully-annotated version at
-- /tools/supabase-rls-real.sql (repo root) — keep the two in sync; that file
-- documents the design proof and prerequisites in full. Idempotent.

DO $$
DECLARE
  t text;
  owner_field text;
  spec jsonb := '{"connections":"owner","dashboards":"owner","analyses":"owner","jobs":"owner","datasets":"acctOwner"}'::jsonb;
BEGIN
  FOR t IN SELECT jsonb_object_keys(spec) LOOP
    owner_field := spec->>t;
    EXECUTE format('DROP POLICY IF EXISTS polecat_anon_all ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS polecat_select ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS polecat_insert ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS polecat_update ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS polecat_delete ON %I', t);
    EXECUTE format(
      'CREATE POLICY polecat_select ON %I FOR SELECT USING (coalesce((data::jsonb->>%L)::boolean, false) = false OR (data::jsonb->>%L) = auth.uid()::text)',
      t, 'private', owner_field);
    EXECUTE format(
      'CREATE POLICY polecat_insert ON %I FOR INSERT WITH CHECK ((data::jsonb->>%L) = auth.uid()::text)',
      t, owner_field);
    EXECUTE format(
      'CREATE POLICY polecat_update ON %I FOR UPDATE USING ((data::jsonb->>%L) = auth.uid()::text) WITH CHECK ((data::jsonb->>%L) = auth.uid()::text)',
      t, owner_field, owner_field);
    EXECUTE format(
      'CREATE POLICY polecat_delete ON %I FOR DELETE USING ((data::jsonb->>%L) = auth.uid()::text)',
      t, owner_field);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- `users` — a different shape (self-row + admin, not owner/private): see
-- /tools/supabase-rls-real.sql for the full design proof (SECURITY DEFINER
-- helper avoids RLS-policy self-recursion).
CREATE OR REPLACE FUNCTION public.polecat_is_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE (data::jsonb->>'gotrueId') = auth.uid()::text AND "role" = 'admin'
  );
$$;

DROP POLICY IF EXISTS polecat_anon_all ON public.users;
DROP POLICY IF EXISTS polecat_select ON public.users;
DROP POLICY IF EXISTS polecat_insert ON public.users;
DROP POLICY IF EXISTS polecat_update ON public.users;
DROP POLICY IF EXISTS polecat_delete ON public.users;

CREATE POLICY polecat_select ON public.users FOR SELECT USING (
  (data::jsonb->>'gotrueId') = auth.uid()::text OR public.polecat_is_admin()
);
CREATE POLICY polecat_update ON public.users FOR UPDATE USING (
  (data::jsonb->>'gotrueId') = auth.uid()::text OR public.polecat_is_admin()
) WITH CHECK (
  (data::jsonb->>'gotrueId') = auth.uid()::text OR public.polecat_is_admin()
);
CREATE POLICY polecat_insert ON public.users FOR INSERT WITH CHECK (public.polecat_is_admin());
CREATE POLICY polecat_delete ON public.users FOR DELETE USING (public.polecat_is_admin());

NOTIFY pgrst, 'reload schema';
