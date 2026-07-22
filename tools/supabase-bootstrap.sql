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
