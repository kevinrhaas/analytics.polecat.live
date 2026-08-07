-- ============================================================================
-- REFRESH ALL MATERIALIZED VIEWS
-- ============================================================================
-- Run this to update data after source views change
-- Execution order: staging → dimensions → facts
-- ============================================================================

-- Refresh staging
REFRESH MATERIALIZED VIEW mv_stg_entity_term;

-- Refresh dimensions
REFRESH MATERIALIZED VIEW dim_entity;
REFRESH MATERIALIZED VIEW dim_term;
REFRESH MATERIALIZED VIEW dim_glossary_term;
REFRESH MATERIALIZED VIEW dim_leaf_flag;
REFRESH MATERIALIZED VIEW dim_datasource;
REFRESH MATERIALIZED VIEW dim_date;
REFRESH MATERIALIZED VIEW dim_filetype;
REFRESH MATERIALIZED VIEW dim_policy;
REFRESH MATERIALIZED VIEW dim_application;
REFRESH MATERIALIZED VIEW dim_extension;
REFRESH MATERIALIZED VIEW dim_temperature;
REFRESH MATERIALIZED VIEW dim_currency;
REFRESH MATERIALIZED VIEW dim_pipeline_status;

-- Refresh facts
REFRESH MATERIALIZED VIEW fact_entity_snapshot;
REFRESH MATERIALIZED VIEW fact_entity_term;
REFRESH MATERIALIZED VIEW fact_entity_policy;
REFRESH MATERIALIZED VIEW fact_entity_application;
REFRESH MATERIALIZED VIEW fact_duplicate;
REFRESH MATERIALIZED VIEW fact_pipeline_run;
REFRESH MATERIALIZED VIEW fact_extension_daily;
REFRESH MATERIALIZED VIEW fact_temperature_daily;

-- Refresh lineage dimensions (depend only on stg_ physical tables, not on other MVs)
REFRESH MATERIALIZED VIEW dim_lineage_event_type;
REFRESH MATERIALIZED VIEW dim_lineage_job;
REFRESH MATERIALIZED VIEW dim_lineage_endpoint;

-- Refresh lineage facts (depend on lineage dims + stg_ physical tables)
REFRESH MATERIALIZED VIEW fact_lineage_event;
REFRESH MATERIALIZED VIEW fact_lineage_connection;
