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
-- NOTE ON SECURITY (RLS): this bootstrap deliberately does NOT add Row-Level
-- Security policies — the app currently connects anonymously with the publishable
-- (anon) key, so real per-user enforcement waits for the M7 slice (GoTrue auth +
-- RLS). Until then the publishable key has full access to these tables; keep only
-- demo / non-sensitive data here.

CREATE TABLE IF NOT EXISTS "polecat_meta" (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS "connections" (id TEXT PRIMARY KEY, "name" TEXT, "adapter" TEXT, "updatedAt" INTEGER, data TEXT);
CREATE TABLE IF NOT EXISTS "datasets" (id TEXT PRIMARY KEY, "name" TEXT, "connectionId" TEXT, "kind" TEXT, "updatedAt" INTEGER, data TEXT);
CREATE TABLE IF NOT EXISTS "dashboards" (id TEXT PRIMARY KEY, "name" TEXT, "title" TEXT, "updatedAt" INTEGER, data TEXT);
CREATE TABLE IF NOT EXISTS "analyses" (id TEXT PRIMARY KEY, "name" TEXT, "datasetId" TEXT, "chartType" TEXT, "updatedAt" INTEGER, data TEXT);
CREATE TABLE IF NOT EXISTS "jobs" (id TEXT PRIMARY KEY, "name" TEXT, "sourceDatasetId" TEXT, "updatedAt" INTEGER, data TEXT);
CREATE TABLE IF NOT EXISTS "users" (id TEXT PRIMARY KEY, "name" TEXT, "role" TEXT, "updatedAt" INTEGER, data TEXT);

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

-- Tell PostgREST to reload its schema cache so the new tables + grants are
-- picked up immediately (otherwise the REST API can lag behind the DDL).
NOTIFY pgrst, 'reload schema';
