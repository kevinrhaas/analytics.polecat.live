-- Polecat "analytics" workspace bootstrap for Supabase (Postgres).
-- Idempotent: every statement is CREATE TABLE IF NOT EXISTS / upsert, so it is
-- safe to run repeatedly. This mirrors EXACTLY what the app's Supabase adapter
-- generates (app/sources/supabase.js provision() -> WS.provisionDDL() +
-- WS.metaRows) so the live DB matches what the browser app reads/writes.
--
-- Schema model: every table is (id TEXT PK, <promoted indexed columns>, data TEXT).
-- All other row fields ride in the `data` JSON blob, so the schema never has to
-- migrate when a row grows a new attribute. See app/sources/schema.js.
--
-- ⚠ NOT THE FILE FOR A NEW ENVIRONMENT. Use tools/supabase-deploy.sql — "THE
-- one file to run", the superset (tables + the real RLS posture + the activity
-- log tables + first-admin + verify), and the only one whose header covers
-- creating the project itself (its § 0). tools/supabase-rls-real.sql is the
-- posture-only subset, for re-tightening an environment whose tables already
-- exist. THIS file is the legacy allow-all demo posture, kept for reference.
--
-- NOTE ON SECURITY (RLS): this bootstrap deliberately does NOT add Row-Level
-- Security policies, so the publishable (anon) key has full access to every
-- table it creates — keep only demo / non-sensitive data in a database
-- provisioned this way.
--
-- The prerequisites this header used to cite as unmet — GoTrue sign-in and the
-- owner-field data migration — SHIPPED with M7 slices 2/3, and the real
-- authenticated-only posture went live 2026-07-30. The paragraph warning
-- against running it outlived that by a week and misled a session on 2026-08-08
-- (N19). That posture is safe, it is canonical, and it is what dev, stage and
-- prod all run.

CREATE TABLE IF NOT EXISTS "polecat_meta" (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS "connections" (id TEXT PRIMARY KEY, "name" TEXT, "adapter" TEXT, "updatedAt" BIGINT, data TEXT);
CREATE TABLE IF NOT EXISTS "datasets" (id TEXT PRIMARY KEY, "name" TEXT, "connectionId" TEXT, "kind" TEXT, "updatedAt" BIGINT, data TEXT);
CREATE TABLE IF NOT EXISTS "dashboards" (id TEXT PRIMARY KEY, "name" TEXT, "title" TEXT, "updatedAt" BIGINT, data TEXT);
CREATE TABLE IF NOT EXISTS "analyses" (id TEXT PRIMARY KEY, "name" TEXT, "datasetId" TEXT, "chartType" TEXT, "updatedAt" BIGINT, data TEXT);
CREATE TABLE IF NOT EXISTS "jobs" (id TEXT PRIMARY KEY, "name" TEXT, "sourceDatasetId" TEXT, "updatedAt" BIGINT, data TEXT);
CREATE TABLE IF NOT EXISTS "users" (id TEXT PRIMARY KEY, "name" TEXT, "role" TEXT, "updatedAt" BIGINT, data TEXT);

-- Migrate already-provisioned tables: the first bootstrap created updatedAt as
-- INTEGER (int4), which OVERFLOWS on write — updatedAt holds epoch-milliseconds
-- (~1.78e12) and int4 maxes at ~2.1e9, so a push failed with "value … is out of
-- range for type integer" (22003). CREATE TABLE IF NOT EXISTS won't alter an
-- existing column, so widen it explicitly. Idempotent (int8→int8 is a no-op).
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

-- Grants: tables created over a DIRECT psql connection do NOT inherit the
-- anon/authenticated privileges that Supabase's SQL-editor path auto-applies,
-- so the browser's publishable (anon) key would see the tables but none of
-- their rows ("app: unknown"). Grant the API roles access explicitly. NOTE:
-- this is the no-RLS posture (the publishable key can read AND write these
-- tables) — fine for demo data; real per-user RLS is the M7 slice.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;

-- RLS + a permissive policy. Grants alone weren't enough: the publishable key
-- got HTTP 200 but ZERO rows back. Supabase's NEW API keys (sb_publishable_…)
-- are designed to be used WITH Row-Level Security — a table with no RLS policy
-- comes back EMPTY over the Data API. So enable RLS and add an allow-all policy
-- for the API roles, which makes the browser reads/writes work regardless of
-- whether RLS was already on. THIS IS THE DEMO POSTURE — "allow all" = no real
-- per-user isolation yet (the publishable key can read+write everything); real
-- per-user RLS (scoped to the signed-in GoTrue user) is the M7 slice. Idempotent
-- (DROP POLICY IF EXISTS before CREATE), so it is safe to re-run.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['polecat_meta','connections','datasets','dashboards','analyses','jobs','users'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS polecat_anon_all ON %I', t);
    EXECUTE format('CREATE POLICY polecat_anon_all ON %I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- Tell PostgREST to reload its schema cache so the new tables + grants + policies
-- are picked up immediately (otherwise the REST API can lag behind the DDL).
NOTIFY pgrst, 'reload schema';
