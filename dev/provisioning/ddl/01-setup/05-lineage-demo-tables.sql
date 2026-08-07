-- =====================================================================
-- 01-setup / 05-lineage-demo-tables.sql
-- Persistent DEMO OVERLAY for lineage analytics.
--
-- The lineage ETL (j-lineage-main.kjb) TRUNCATE-reloads stg_lineage_event /
-- stg_lineage_connection from the live PDC API, which wipes any demo rows
-- inserted directly into those tables. To make the demo durable, demo data
-- lives in separate *_demo tables (never touched by the ETL) and is UNIONed
-- into the lineage MVs through two views. Refreshing the MVs (even from the
-- ETL) therefore always includes both real + demo data, and the demo
-- survives every reload.
--
-- To run a PRODUCTION (real-data-only) build, simply leave the _demo tables
-- empty (TRUNCATE them) — the views then return real data only.
--
-- Idempotent: safe to run repeatedly. Run before the lineage dim/fact MVs.
-- =====================================================================
\set ON_ERROR_STOP on
\if :{?BIDB_EXT_SCHEMA_NAME}
\else
\set BIDB_EXT_SCHEMA_NAME 'bidb_ext_dev'
\endif
SET search_path TO :"BIDB_EXT_SCHEMA_NAME", public;

CREATE TABLE IF NOT EXISTS stg_lineage_event_demo      (LIKE stg_lineage_event      INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS stg_lineage_connection_demo (LIKE stg_lineage_connection INCLUDING DEFAULTS);

-- Real + demo overlay. MVs read from these views instead of the base tables.
CREATE OR REPLACE VIEW v_stg_lineage_event AS
    SELECT * FROM stg_lineage_event
    UNION ALL
    SELECT * FROM stg_lineage_event_demo;

CREATE OR REPLACE VIEW v_stg_lineage_connection AS
    SELECT * FROM stg_lineage_connection
    UNION ALL
    SELECT * FROM stg_lineage_connection_demo;
