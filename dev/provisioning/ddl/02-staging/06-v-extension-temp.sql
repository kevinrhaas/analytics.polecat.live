-- =====================================================================
-- 02-staging / 06-v-extension-temp.sql
-- Unstructured overlay views: live source UNIONed with demo overlay.
-- fact_extension_daily reads v_entities_extension_count; fact_temperature_daily reads
-- v_entities_temperature_count.
-- =====================================================================
\if :{?BIDB_EXT_SCHEMA_NAME}
\else
\set BIDB_EXT_SCHEMA_NAME 'bidb_ext_dev'
\endif
SET search_path TO :"BIDB_EXT_SCHEMA_NAME", public;

CREATE OR REPLACE VIEW v_entities_extension_count AS
  SELECT * FROM entities_extension_count_view
  UNION ALL
  SELECT * FROM entities_extension_count_view_demo;

CREATE OR REPLACE VIEW v_entities_temperature_count AS
  SELECT * FROM entities_temperature_count_view
  UNION ALL
  SELECT * FROM entities_temperature_count_view_demo;
