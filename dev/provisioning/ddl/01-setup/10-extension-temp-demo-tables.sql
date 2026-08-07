-- =====================================================================
-- 01-setup / 10-extension-temp-demo-tables.sql
-- Durable overlay tables for the synthetic UNSTRUCTURED demo: per-(source,extension,month)
-- file counts and per-(source,temperature,month) file counts. UNIONed via
-- v_entities_extension_count / v_entities_temperature_count so fact_extension_daily +
-- fact_temperature_daily (and the Document/Unstructured + Freshness/Temperature panels)
-- populate. Created AFTER 01-fdw-setup.sql; idempotent; seeded by 06-seed/08.
-- =====================================================================
\if :{?BIDB_EXT_SCHEMA_NAME}
\else
\set BIDB_EXT_SCHEMA_NAME 'bidb_ext_dev'
\endif
SET search_path TO :"BIDB_EXT_SCHEMA_NAME", public;

CREATE TABLE IF NOT EXISTS entities_extension_count_view_demo   (LIKE entities_extension_count_view);
CREATE TABLE IF NOT EXISTS entities_temperature_count_view_demo (LIKE entities_temperature_count_view);

CREATE INDEX IF NOT EXISTS idx_eecvd_dt ON entities_extension_count_view_demo ("Date");
CREATE INDEX IF NOT EXISTS idx_etcvd_dt ON entities_temperature_count_view_demo ("Date");
