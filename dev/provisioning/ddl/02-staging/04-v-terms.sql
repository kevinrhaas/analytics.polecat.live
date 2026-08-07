-- =====================================================================
-- 02-staging / 04-v-terms.sql
-- Glossary/terms overlay views: live PDC source UNIONed with the synthetic demo
-- overlay. mv_stg_entity_term + dim_glossary_term read these. Created before them.
-- =====================================================================
\if :{?BIDB_EXT_SCHEMA_NAME}
\else
\set BIDB_EXT_SCHEMA_NAME 'bidb_ext_dev'
\endif
SET search_path TO :"BIDB_EXT_SCHEMA_NAME", public;

CREATE OR REPLACE VIEW v_glossary_summary AS
  SELECT * FROM glossary_summary_view
  UNION ALL
  SELECT * FROM glossary_summary_view_demo;

CREATE OR REPLACE VIEW v_terms AS
  SELECT * FROM terms_view
  UNION ALL
  SELECT * FROM terms_view_demo;
