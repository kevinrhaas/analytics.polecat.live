-- Polecat "analytics" workspace — REAL per-user Row-Level Security (M7).
--
-- ⚠ FRESH ENVIRONMENT? Use tools/supabase-deploy.sql instead — the complete
-- one-file deploy (tables + this posture + the ACTIVITY-1 log tables + first-
-- admin + verify). This file is the POSTURE-ONLY subset for re-tightening an
-- environment whose tables already exist; keep the two in sync.
--
-- ✅ APPLIED LIVE 2026-07-30 (Kevin): after running this script the anon-role
-- verify (§ VERIFY below) returned ZERO rows on all six workspace tables while
-- a signed-in admin still saw everything. This file is now the CANONICAL
-- security posture for any Polecat analytics workspace database — run it
-- top-to-bottom, bare (no begin/rollback wrapper — DO blocks and CREATE
-- POLICY must actually commit), in Supabase → SQL editor:
--   * on a FRESH project: right after the app's provision step creates the
--     tables (Settings → Workspace backend → connect wizard), run this ONCE.
--     Nothing else is needed — the script enables RLS, removes every legacy
--     open policy by name, and installs the authenticated-only policy set.
--   * on an EXISTING project: safe to re-run any time; every statement is
--     idempotent (drop-then-create, IF EXISTS, OR REPLACE).
--
-- WHY the drops matter (the 2026-07-30 incident): Postgres PERMISSIVE
-- policies OR together — one leftover allow-all policy silently defeats every
-- tighter policy beside it. Two legacy open policies have existed under
-- different names and BOTH are dropped on every table here:
--   * polecat_anon_all — the original demo "allow all" from
--     supabase-bootstrap.sql;
--   * polecat_open_rw  — created by the app's own RLS-no-write-policy remedy
--     SQL (WS.rlsPolicySQL, the "Copy SQL" on the sync-error card) back when
--     the app's posture was UX-level gating. That remedy is now auth-aware
--     (app/sources/schema.js): for a connection that signs into Supabase Auth
--     it emits an authenticated-only policy instead, so following the app's
--     own instructions can never reopen anon access again.
-- If a future verify ever shows anon reading rows again, the first move is:
--   select tablename, policyname, roles, cmd from pg_policies
--   where schemaname = 'public' order by tablename;
-- and drop whatever allow-all policy re-appeared.
--
-- History: design proven empirically against the real project 2026-07-24
-- (steward run) in an isolated `steward_test` schema — anon saw only public
-- rows; an authenticated user saw public + own-private rows, not another
-- user's; spoofed INSERTs claiming someone else's uid were rejected by WITH
-- CHECK; UPDATEs against another user's private row affected 0 rows. The two
-- app-side prerequisites shipped as M7 slices 2/3 (GoTrue sign-in on the
-- adapter; owner/acctOwner re-stamped from PolecatAuth usernames to GoTrue
-- UUIDs via migrateOwnerToGotrueId). 2026-07-30 (WORKSPACE-LOGIN): reads
-- tightened from implicit (auth.uid() is null for anon) to explicit
-- `TO authenticated`, because the anon key ships inside the app's packaged
-- workspace catalog (public repo) — the anon role must see NOTHING.
--
-- Policy shape (the five owner/private tables): a row is visible to a
-- signed-in user if it is NOT marked private, OR its stamped owner (datasets:
-- acctOwner — see the M4.2 note in STATUS.md) equals the caller's auth.uid(),
-- OR the caller is an admin. Write access is owner-or-admin. The admin arm is
-- NOT optional (2026-07-30, live): the app's sync pushes the WHOLE workspace
-- snapshot — including rows seeded by packs or owned by other accounts — so a
-- pure owner-only WITH CHECK 403s every admin device's push ("new row
-- violates row-level security policy for table connections"). Admin matches
-- the app's own contract too: private items are "visible to you and to admin
-- accounts". (A NON-admin device that holds rows it doesn't own still can't
-- push those rows — tracked as an M7 follow-up; provisioned non-admin users
-- currently work read-mostly or own what they create.) `users` and
-- `polecat_meta` have their own blocks below.

-- ---------------------------------------------------------------------------
-- 0) RLS ON + retire every legacy open policy, on ALL seven tables.
--    (ENABLE is idempotent; a table with RLS enabled and no matching policy
--    denies by default, which is why polecat_meta gets its own policy in § 3.)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dashboards','connections','datasets','analyses','jobs','users','polecat_meta'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS polecat_open_rw ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS polecat_anon_all ON public.%I', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 0.5) The admin helper — DEFINED FIRST, because every policy below calls it.
--
-- Ordering matters and used not to (fixed 2026-08-07, caught by tests/rls.mjs
-- on its first run against a fresh schema): this function used to live down in
-- § 2 with the `users` policies, so on a database that had never had it, § 1's
-- very first CREATE POLICY failed with "function public.polecat_is_admin() does
-- not exist" — the documented "run it top-to-bottom on a FRESH project" path
-- was broken, and only survived on THIS project because a 2026-07-24 run had
-- already left the function behind. Keep it above § 1.
--
-- Naive self-referencing admin check ("EXISTS (SELECT … FROM users …)" inside
-- the policy itself) hits Postgres' "infinite recursion detected in policy" —
-- the subquery's scan re-applies the same policy. Standard fix: a SECURITY
-- DEFINER helper owned by `postgres` (the table owner); Postgres does not
-- apply RLS to the table's owner unless FORCE ROW LEVEL SECURITY is set (it
-- isn't), so the helper's internal SELECT bypasses RLS and never recurses.
-- Row matching uses `gotrueId` (in the data jsonb blob) rather than the row
-- `id` column, which stays "user_<username>" — never a GoTrue uuid.

CREATE OR REPLACE FUNCTION public.polecat_is_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE (data::jsonb->>'gotrueId') = auth.uid()::text AND "role" = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- 1) The five owner/private workspace tables.
DO $$
DECLARE
  t text;
  owner_field text;
  spec jsonb := '{"connections":"owner","dashboards":"owner","analyses":"owner","jobs":"owner","datasets":"acctOwner"}'::jsonb;
BEGIN
  FOR t IN SELECT jsonb_object_keys(spec) LOOP
    owner_field := spec->>t;
    EXECUTE format('DROP POLICY IF EXISTS polecat_select ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS polecat_insert ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS polecat_update ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS polecat_delete ON %I', t);
    EXECUTE format(
      'CREATE POLICY polecat_select ON %I FOR SELECT TO authenticated USING (coalesce((data::jsonb->>%L)::boolean, false) = false OR (data::jsonb->>%L) = auth.uid()::text OR public.polecat_is_admin())',
      t, 'private', owner_field);
    EXECUTE format(
      'CREATE POLICY polecat_insert ON %I FOR INSERT TO authenticated WITH CHECK ((data::jsonb->>%L) = auth.uid()::text OR public.polecat_is_admin())',
      t, owner_field);
    EXECUTE format(
      'CREATE POLICY polecat_update ON %I FOR UPDATE TO authenticated USING ((data::jsonb->>%L) = auth.uid()::text OR public.polecat_is_admin()) WITH CHECK ((data::jsonb->>%L) = auth.uid()::text OR public.polecat_is_admin())',
      t, owner_field, owner_field);
    EXECUTE format(
      'CREATE POLICY polecat_delete ON %I FOR DELETE TO authenticated USING ((data::jsonb->>%L) = auth.uid()::text OR public.polecat_is_admin())',
      t, owner_field);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2) `users` — its own stricter shape (self-row + admin), because it holds
--    every account's SHA-256 password hash (app/auth.js). The
--    `polecat_is_admin()` helper these policies lean on is defined in § 0.5.

DROP POLICY IF EXISTS polecat_select ON public.users;
DROP POLICY IF EXISTS polecat_insert ON public.users;
DROP POLICY IF EXISTS polecat_update ON public.users;
DROP POLICY IF EXISTS polecat_delete ON public.users;

-- GATE-FIX-2 (2026-07-31): own row = gotrueId OR sign-in email (JWT claim) —
-- gotrueId-only was circular: a row missing its stamp was invisible to its own
-- verified user, and polecat_is_admin() needs the same stamp. See
-- tools/supabase-deploy.sql § 4 for the full incident note.
CREATE POLICY polecat_select ON public.users FOR SELECT TO authenticated USING (
  (data::jsonb->>'gotrueId') = auth.uid()::text
  OR lower(data::jsonb->>'u') = lower(coalesce(auth.jwt()->>'email',''))
  OR public.polecat_is_admin()
);
CREATE POLICY polecat_update ON public.users FOR UPDATE TO authenticated USING (
  (data::jsonb->>'gotrueId') = auth.uid()::text
  OR lower(data::jsonb->>'u') = lower(coalesce(auth.jwt()->>'email',''))
  OR public.polecat_is_admin()
) WITH CHECK (
  (data::jsonb->>'gotrueId') = auth.uid()::text
  OR lower(data::jsonb->>'u') = lower(coalesce(auth.jwt()->>'email',''))
  OR public.polecat_is_admin()
);
-- INSERT/DELETE: admin-only — provisioning is an admin action, and a brand-new
-- self-signup row can't satisfy an owner check on itself yet.
CREATE POLICY polecat_insert ON public.users FOR INSERT TO authenticated WITH CHECK (public.polecat_is_admin());
CREATE POLICY polecat_delete ON public.users FOR DELETE TO authenticated USING (public.polecat_is_admin());

-- ---------------------------------------------------------------------------
-- 3) `polecat_meta` — workspace identity + app singletons (settings/meta).
--    No policy would mean deny-all (the app couldn't read its own metadata),
--    so signed-in users get full access; anon gets nothing.
DROP POLICY IF EXISTS polecat_meta_auth ON public.polecat_meta;
CREATE POLICY polecat_meta_auth ON public.polecat_meta
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- VERIFY (run separately; expect ALL SIX ZEROS — confirmed live 2026-07-30):
--   begin;
--     set local role anon;
--     select
--       (select count(*) from public.dashboards)  dashboards_anon,
--       (select count(*) from public.connections) connections_anon,
--       (select count(*) from public.datasets)    datasets_anon,
--       (select count(*) from public.analyses)    analyses_anon,
--       (select count(*) from public.jobs)        jobs_anon,
--       (select count(*) from public.users)       users_anon;
--   rollback;
-- Then sign into the app as a provisioned admin and confirm dashboards load
-- and a test edit pushes cleanly (Settings → backend card → Recent sync
-- activity shows an ok push).
