// supabase/functions/polecat-admin/sql.ts
//
// The DDL/RLS the relay runs, inlined as string constants so the deployed
// function has NO runtime filesystem dependency. Reading these off disk with
// Deno.readTextFile(new URL("./x.sql", import.meta.url)) failed in the Supabase
// Edge Runtime ("path not found: /var/tmp/sb-compile-edge-runtime/.../x.sql")
// because only the module graph is bundled at deploy time, not sibling .sql
// files. Inlining them here makes `provision`/`go-live` deploy-proof — the
// function is self-contained TypeScript with nothing to read at runtime.
//
// These are the CONDENSED runtime copies. Keep them in sync with the canonical,
// fully-annotated versions at /tools/supabase-bootstrap.sql and
// /tools/supabase-rls-real.sql (the documented source of truth for the manual
// Path A/B runbook). Both blocks are idempotent — safe to re-run.
//
// "Keep them in sync" is no longer an honour-system comment (N2 slice 2,
// 2026-08-07): `tests/rls.mjs` installs BOTH constants below — the real
// `go-live` sequence, BOOTSTRAP_DDL then RLS_REAL_SQL — into a throwaway schema
// and runs the SAME 27 checks it runs against the canonical /tools files. If
// this file drifts from that posture again, that test goes red. It had drifted:
// until this change an in-app Admin → Go live installed a WEAKER posture than a
// manual `supabase-rls-real.sql` paste (no admin arm, no `TO authenticated`, no
// `users` email-claim arm, no `polecat_meta` policy, no legacy-policy drop
// loop). Any edit here belongs in /tools/supabase-rls-real.sql and
// /tools/supabase-deploy.sql too.

export const BOOTSTRAP_DDL = `-- Bootstrap DDL for the \`provision\` and \`go-live\` actions.
-- Idempotent: safe to run on every \`provision\`/\`go-live\` call.

CREATE TABLE IF NOT EXISTS "polecat_meta" (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS "connections" (id TEXT PRIMARY KEY, "name" TEXT, "adapter" TEXT, "updatedAt" BIGINT, data TEXT);
CREATE TABLE IF NOT EXISTS "datasets" (id TEXT PRIMARY KEY, "name" TEXT, "connectionId" TEXT, "kind" TEXT, "updatedAt" BIGINT, data TEXT);
CREATE TABLE IF NOT EXISTS "dashboards" (id TEXT PRIMARY KEY, "name" TEXT, "title" TEXT, "updatedAt" BIGINT, data TEXT);
CREATE TABLE IF NOT EXISTS "analyses" (id TEXT PRIMARY KEY, "name" TEXT, "datasetId" TEXT, "chartType" TEXT, "updatedAt" BIGINT, data TEXT);
CREATE TABLE IF NOT EXISTS "jobs" (id TEXT PRIMARY KEY, "name" TEXT, "sourceDatasetId" TEXT, "updatedAt" BIGINT, data TEXT);
CREATE TABLE IF NOT EXISTS "users" (id TEXT PRIMARY KEY, "name" TEXT, "role" TEXT, "updatedAt" BIGINT, data TEXT);

ALTER TABLE "connections" ALTER COLUMN "updatedAt" TYPE BIGINT;
ALTER TABLE "datasets"    ALTER COLUMN "updatedAt" TYPE BIGINT;
ALTER TABLE "dashboards"  ALTER COLUMN "updatedAt" TYPE BIGINT;
ALTER TABLE "analyses"    ALTER COLUMN "updatedAt" TYPE BIGINT;
ALTER TABLE "jobs"        ALTER COLUMN "updatedAt" TYPE BIGINT;
ALTER TABLE "users"       ALTER COLUMN "updatedAt" TYPE BIGINT;

INSERT INTO "polecat_meta"(key, value) VALUES ('app', 'analytics')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
INSERT INTO "polecat_meta"(key, value) VALUES ('schema_version', '4')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;

-- Demo "allow all" posture — \`go-live\` immediately replaces this with the
-- per-user policies in RLS_REAL_SQL; \`provision\` alone (no go-live yet) leaves
-- it in place so the app keeps working pre-go-live, same as today.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['polecat_meta','connections','datasets','dashboards','analyses','jobs','users'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS polecat_anon_all ON %I', t);
    EXECUTE format('CREATE POLICY polecat_anon_all ON %I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
`;

export const RLS_REAL_SQL = `-- Real per-user Row-Level Security for the \`go-live\` action. Idempotent.
-- The condensed mirror of tools/supabase-rls-real.sql: same section order, same
-- policy names, same predicates. The prose lives in that file; read it there.

-- 0) RLS ON + retire every legacy open policy, on ALL seven tables. Postgres
--    PERMISSIVE policies OR together, so one surviving allow-all (the demo
--    \`polecat_anon_all\` from BOOTSTRAP_DDL above, or \`polecat_open_rw\` from the
--    app's older remedy SQL) silently defeats everything below.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dashboards','connections','datasets','analyses','jobs','users','polecat_meta'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS polecat_open_rw ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS polecat_anon_all ON public.%I', t);
  END LOOP;
END $$;

-- 0.5) The admin helper — DEFINED FIRST, because every policy below calls it.
--      (A fresh project has no such function yet; defining it later made the
--      very first CREATE POLICY fail. SECURITY DEFINER avoids the self-recursion
--      a naive EXISTS-over-users check inside the policy would hit.)
CREATE OR REPLACE FUNCTION public.polecat_is_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE (data::jsonb->>'gotrueId') = auth.uid()::text AND "role" = 'admin'
  );
$$;

-- 1) The five owner/private workspace tables. Visible to a signed-in user when
--    the row is not private, or they own it (datasets stamp acctOwner), or they
--    are an admin; writes are owner-or-admin. The admin arm is NOT optional —
--    the app pushes the WHOLE workspace snapshot, so owner-only WITH CHECK 403s
--    every admin device's push.
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

-- 2) \`users\` — its own stricter shape (self-row + admin), because it holds every
--    account's password hash. Own row = gotrueId OR the sign-in email claim
--    (GATE-FIX-2: gotrueId-only was circular — a row missing its stamp was
--    invisible to its own verified user). INSERT/DELETE are admin-only.
DROP POLICY IF EXISTS polecat_select ON public.users;
DROP POLICY IF EXISTS polecat_insert ON public.users;
DROP POLICY IF EXISTS polecat_update ON public.users;
DROP POLICY IF EXISTS polecat_delete ON public.users;

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
CREATE POLICY polecat_insert ON public.users FOR INSERT TO authenticated WITH CHECK (public.polecat_is_admin());
CREATE POLICY polecat_delete ON public.users FOR DELETE TO authenticated USING (public.polecat_is_admin());

-- 3) \`polecat_meta\` — workspace identity + app singletons. RLS is on, so no
--    policy would mean deny-all and the app could not read its own metadata.
DROP POLICY IF EXISTS polecat_meta_auth ON public.polecat_meta;
CREATE POLICY polecat_meta_auth ON public.polecat_meta
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
`;
