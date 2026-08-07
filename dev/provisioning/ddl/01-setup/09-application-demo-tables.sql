-- =====================================================================
-- 01-setup / 09-application-demo-tables.sql
-- Durable overlay tables for the synthetic APPLICATION/ACCESS demo: an application
-- master list + entity->application access. UNIONed via v_applications_summary /
-- v_entities_applications so dim_application + fact_entity_application stay rich.
-- Created AFTER 01-fdw-setup.sql (LIKE mirrors imported views). Idempotent;
-- seeded by 06-seed/07-application-demo-seed.sql.
-- =====================================================================
\if :{?BIDB_EXT_SCHEMA_NAME}
\else
\set BIDB_EXT_SCHEMA_NAME 'bidb_ext_dev'
\endif
SET search_path TO :"BIDB_EXT_SCHEMA_NAME", public;

CREATE TABLE IF NOT EXISTS applications_summary_view_demo (LIKE applications_summary_view);
CREATE TABLE IF NOT EXISTS entities_applications_view_demo (LIKE entities_applications_view);

CREATE INDEX IF NOT EXISTS idx_asvd_id  ON applications_summary_view_demo ("_id");
CREATE INDEX IF NOT EXISTS idx_eavd_ent ON entities_applications_view_demo ("EntityId");
CREATE INDEX IF NOT EXISTS idx_eavd_app ON entities_applications_view_demo ("ApplicationId");
