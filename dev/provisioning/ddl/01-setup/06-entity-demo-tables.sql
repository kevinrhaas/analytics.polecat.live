-- =====================================================================
-- 01-setup / 06-entity-demo-tables.sql
-- Durable overlay table for the synthetic demo CATALOG (entity side), mirroring
-- the live source view's shape so it can be UNIONed in via v_entities_master.
--
-- Same idea as the lineage stg_*_demo tables: a persistent overlay that survives
-- the FDW re-import + DDL rebuild, so demo richness is never lost. Created AFTER
-- 01-fdw-setup.sql (which imports entities_master_view) so LIKE can mirror it.
-- Idempotent (IF NOT EXISTS) -- existing demo data is preserved across rebuilds.
-- Seeded by 06-seed/04-entity-demo-seed.sql.
-- =====================================================================
\if :{?BIDB_EXT_SCHEMA_NAME}
\else
\set BIDB_EXT_SCHEMA_NAME 'bidb_ext_dev'
\endif
SET search_path TO :"BIDB_EXT_SCHEMA_NAME", public;

CREATE TABLE IF NOT EXISTS entities_master_demo (LIKE entities_master_view);

CREATE INDEX IF NOT EXISTS idx_emd_id          ON entities_master_demo ("_id");
CREATE INDEX IF NOT EXISTS idx_emd_fqdn        ON entities_master_demo ("FqdnDisplay");
CREATE INDEX IF NOT EXISTS idx_emd_datasource  ON entities_master_demo ("DataSourceType");
CREATE INDEX IF NOT EXISTS idx_emd_sensitivity ON entities_master_demo ("Sensitivity");
