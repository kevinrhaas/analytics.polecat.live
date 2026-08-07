-- =====================================================================
-- 01-setup / 07-policy-demo-tables.sql
-- Durable overlay tables for the synthetic GOVERNANCE demo: a policy master list
-- and entity->policy assignments. UNIONed into v_policies_summary / v_entities_policies
-- so dim_policy + fact_entity_policy stay rich (governed %) regardless of the live
-- source. Created AFTER 01-fdw-setup.sql so LIKE can mirror the imported views.
-- Idempotent; seeded by 06-seed/05-policy-demo-seed.sql.
-- =====================================================================
\if :{?BIDB_EXT_SCHEMA_NAME}
\else
\set BIDB_EXT_SCHEMA_NAME 'bidb_ext_dev'
\endif
SET search_path TO :"BIDB_EXT_SCHEMA_NAME", public;

CREATE TABLE IF NOT EXISTS policies_summary_view_demo (LIKE policies_summary_view);
CREATE TABLE IF NOT EXISTS entities_policies_view_demo (LIKE entities_policies_view);

CREATE INDEX IF NOT EXISTS idx_psvd_id   ON policies_summary_view_demo ("_id");
CREATE INDEX IF NOT EXISTS idx_epvd_ent  ON entities_policies_view_demo ("EntityId");
CREATE INDEX IF NOT EXISTS idx_epvd_pol  ON entities_policies_view_demo ("PolicyId");
