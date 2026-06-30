-- =====================================================================
-- 02-staging / 03-v-policies.sql
-- Governance overlay views: live PDC source UNIONed with the synthetic demo
-- overlay. dim_policy reads v_policies_summary; fact_entity_policy reads
-- v_entities_policies. Created before those matviews.
-- =====================================================================
\if :{?BIDB_EXT_SCHEMA_NAME}
\else
\set BIDB_EXT_SCHEMA_NAME 'bidb_ext_dev'
\endif
SET search_path TO :"BIDB_EXT_SCHEMA_NAME", public;

CREATE OR REPLACE VIEW v_policies_summary AS
  SELECT * FROM policies_summary_view
  UNION ALL
  SELECT * FROM policies_summary_view_demo;

CREATE OR REPLACE VIEW v_entities_policies AS
  SELECT * FROM entities_policies_view
  UNION ALL
  SELECT * FROM entities_policies_view_demo;
