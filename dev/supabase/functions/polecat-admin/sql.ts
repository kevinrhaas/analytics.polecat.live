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

-- \`users\` — a different shape (self-row + admin, not owner/private): a
-- SECURITY DEFINER helper avoids RLS-policy self-recursion.
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
`;
