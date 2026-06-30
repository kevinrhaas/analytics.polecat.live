-- =====================================================================
-- 06-seed / 03-entity-storage-demo.sql
-- DURABLE storage / cost / redundancy demo overlay.
--
-- PDC did not capture object sizes in this environment (fact_entity_snapshot.bytes
-- is ~0), so the storage, cost-optimization and redundancy dashboards have no
-- volume to show. This physical table synthesizes a realistic per-entity size
-- (long-tail), monthly cost (by data-source tier), CO2e, and a duplicate flag.
-- It is a separate physical table (survives MV rebuilds) keyed by entity_key,
-- joined by the storage/cost/redundancy CDA queries. Drop it for real-data-only.
-- Idempotent.
-- =====================================================================
\set ON_ERROR_STOP on
\if :{?BIDB_EXT_SCHEMA_NAME}
\else
\set BIDB_EXT_SCHEMA_NAME 'bidb_ext_dev'
\endif
SET search_path TO :"BIDB_EXT_SCHEMA_NAME", public;
SET statement_timeout = '120s';

DROP TABLE IF EXISTS entity_storage_demo;
CREATE TABLE entity_storage_demo AS
SELECT
  s.entity_key,
  s.datasource_key,
  COALESCE(NULLIF(d.datasource_type,''),'Unknown')        AS datasource_type,
  COALESCE(NULLIF(e.resource_type,''),'Unknown')          AS resource_type,
  COALESCE(NULLIF(e.entity_type,''),'Unknown')            AS entity_type,
  COALESCE(NULLIF(e.owner_name,''),'(unowned)')           AS owner_name,
  COALESCE(NULLIF(e.sensitivity,''),'Unclassified')       AS sensitivity,
  sz.size_bytes,
  ROUND((sz.size_bytes/1e12::numeric) * rate.r, 2)        AS monthly_cost_usd,
  ROUND((sz.size_bytes/1e12::numeric) * 900, 1)           AS co2e_kg,
  (abs(hashtext(s.entity_key||'dup')) % 100 < 13)         AS is_duplicate,
  CASE WHEN abs(hashtext(s.entity_key||'dup')) % 100 < 13
       THEN (sz.size_bytes * (40 + abs(hashtext(s.entity_key)) % 50) / 100)::bigint
       ELSE 0 END                                         AS dup_savings_bytes
FROM fact_entity_snapshot s
LEFT JOIN dim_datasource d ON s.datasource_key = d.datasource_key
LEFT JOIN dim_entity      e ON s.entity_key     = e.entity_key
CROSS JOIN LATERAL (SELECT (POWER(10, 6.3 + (abs(hashtext(s.entity_key)) % 62)/10.0))::bigint AS size_bytes) sz
CROSS JOIN LATERAL (SELECT CASE
    WHEN d.datasource_type ILIKE '%snow%'                                   THEN 230
    WHEN d.datasource_type ILIKE '%oracle%'                                 THEN 180
    WHEN d.datasource_type ILIKE '%mssql%' OR d.datasource_type ILIKE '%postgres%' THEN 120
    WHEN d.datasource_type ILIKE '%gcs%'  OR d.datasource_type ILIKE '%bigquery%'  THEN 26
    WHEN d.datasource_type ILIKE '%aws%'  OR d.datasource_type ILIKE '%s3%'        THEN 23
    WHEN d.datasource_type ILIKE '%azure%'                                  THEN 21
    ELSE 80 END AS r) rate;

CREATE INDEX ix_esd_entity ON entity_storage_demo(entity_key);
CREATE INDEX ix_esd_ds     ON entity_storage_demo(datasource_key);

SELECT count(*) entities,
       ROUND(SUM(size_bytes)/1e12::numeric,1) total_tb,
       ROUND(SUM(monthly_cost_usd)::numeric,0) monthly_cost,
       count(*) FILTER (WHERE is_duplicate) dups,
       ROUND(SUM(dup_savings_bytes)/1e12::numeric,1) dup_savings_tb
FROM entity_storage_demo;
