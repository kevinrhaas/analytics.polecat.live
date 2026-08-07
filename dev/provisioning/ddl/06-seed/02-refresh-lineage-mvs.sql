-- =====================================================================
-- 06-seed / 02-refresh-lineage-mvs.sql
-- Refresh the lineage star-schema MVs after (re)seeding staging data.
-- Run in dependency order: dimensions before facts.
-- NOTE: if the dim/fact DDL itself changed (new columns), run the matching
-- 03-dimensions/04-facts .sql files instead (they DROP + CREATE). This script
-- is for steady-state refresh after a data-only reseed.
-- =====================================================================
\set ON_ERROR_STOP on
\if :{?BIDB_EXT_SCHEMA_NAME}
\else
\set BIDB_EXT_SCHEMA_NAME 'bidb_ext_dev'
\endif
SET search_path TO :"BIDB_EXT_SCHEMA_NAME", public;
SET statement_timeout = '300s';

REFRESH MATERIALIZED VIEW dim_lineage_event_type;
REFRESH MATERIALIZED VIEW dim_lineage_job;
REFRESH MATERIALIZED VIEW dim_lineage_endpoint;
REFRESH MATERIALIZED VIEW fact_lineage_event;
REFRESH MATERIALIZED VIEW fact_lineage_connection;

SELECT 'dim_lineage_job'        t, count(*) c FROM dim_lineage_job
UNION ALL SELECT 'dim_lineage_endpoint',  count(*) FROM dim_lineage_endpoint
UNION ALL SELECT 'fact_lineage_event',    count(*) FROM fact_lineage_event
UNION ALL SELECT 'fact_lineage_connection', count(*) FROM fact_lineage_connection
ORDER BY 1;
