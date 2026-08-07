-- ============================================================================
-- DROP ALL OBJECTS (Dependency Order)
-- ============================================================================
-- Drop all materialized views in dependency order
-- (Facts first, then dimensions, then staging)
-- ============================================================================

-- Lineage facts (drop first — not the physical stg_ tables, those are ETL-managed)
DROP MATERIALIZED VIEW IF EXISTS fact_lineage_connection CASCADE;
DROP MATERIALIZED VIEW IF EXISTS fact_lineage_event CASCADE;

-- Lineage dimensions
DROP MATERIALIZED VIEW IF EXISTS dim_lineage_endpoint CASCADE;
DROP MATERIALIZED VIEW IF EXISTS dim_lineage_job CASCADE;
DROP MATERIALIZED VIEW IF EXISTS dim_lineage_event_type CASCADE;

-- Other fact tables
DROP MATERIALIZED VIEW IF EXISTS fact_temperature_daily CASCADE;
DROP MATERIALIZED VIEW IF EXISTS fact_extension_daily CASCADE;
DROP MATERIALIZED VIEW IF EXISTS fact_pipeline_run CASCADE;
DROP MATERIALIZED VIEW IF EXISTS fact_duplicate CASCADE;
DROP MATERIALIZED VIEW IF EXISTS fact_entity_application CASCADE;
DROP MATERIALIZED VIEW IF EXISTS fact_entity_policy CASCADE;
DROP MATERIALIZED VIEW IF EXISTS fact_entity_term CASCADE;
DROP MATERIALIZED VIEW IF EXISTS fact_entity_snapshot CASCADE;

-- Dimension tables
DROP MATERIALIZED VIEW IF EXISTS dim_pipeline_status CASCADE;
DROP MATERIALIZED VIEW IF EXISTS dim_currency CASCADE;
DROP MATERIALIZED VIEW IF EXISTS dim_temperature CASCADE;
DROP MATERIALIZED VIEW IF EXISTS dim_extension CASCADE;
DROP MATERIALIZED VIEW IF EXISTS dim_application CASCADE;
DROP MATERIALIZED VIEW IF EXISTS dim_policy CASCADE;
DROP MATERIALIZED VIEW IF EXISTS dim_term CASCADE;
DROP MATERIALIZED VIEW IF EXISTS dim_glossary_term CASCADE;
DROP MATERIALIZED VIEW IF EXISTS dim_leaf_flag CASCADE;
DROP MATERIALIZED VIEW IF EXISTS dim_filetype CASCADE;
DROP MATERIALIZED VIEW IF EXISTS dim_entity CASCADE;
DROP MATERIALIZED VIEW IF EXISTS dim_date CASCADE;
DROP MATERIALIZED VIEW IF EXISTS dim_datasource CASCADE;

-- Staging MV (last, since dimensions depend on it)
DROP MATERIALIZED VIEW IF EXISTS mv_stg_entity_term CASCADE;
