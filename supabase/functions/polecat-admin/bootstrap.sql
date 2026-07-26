-- Bootstrap DDL for the `provision` and `go-live` actions.
-- Condensed copy of the canonical, fully-annotated version at
-- /tools/supabase-bootstrap.sql (repo root) — keep the two in sync; that file
-- is the documented source of truth for the manual (Path A/B) runbook.
-- Idempotent: safe to run on every `provision`/`go-live` call.

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

-- Demo "allow all" posture — `go-live` immediately replaces this with
-- rls-real.sql's per-user policies; `provision` alone (no go-live yet) leaves
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
