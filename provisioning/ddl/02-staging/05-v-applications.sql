-- =====================================================================
-- 02-staging / 05-v-applications.sql
-- Application overlay views: live PDC source UNIONed with the demo overlay.
-- dim_application reads v_applications_summary; fact_entity_application reads
-- v_entities_applications. Created before those matviews.
-- =====================================================================
\if :{?BIDB_EXT_SCHEMA_NAME}
\else
\set BIDB_EXT_SCHEMA_NAME 'bidb_ext_dev'
\endif
SET search_path TO :"BIDB_EXT_SCHEMA_NAME", public;

CREATE OR REPLACE VIEW v_applications_summary AS
  SELECT * FROM applications_summary_view
  UNION ALL
  SELECT * FROM applications_summary_view_demo;

CREATE OR REPLACE VIEW v_entities_applications AS
  SELECT * FROM entities_applications_view
  UNION ALL
  SELECT * FROM entities_applications_view_demo;
