-- ============================================================================
-- FACT: fact_temperature_daily
-- ============================================================================
-- Grain: one row per (data source, temperature, date)
-- Source: v_entities_temperature_count
-- Conformed FKs: datasource_key (dim_datasource), temperature_key (dim_temperature),
--                snapshot_date_key (dim_date)
-- DataSourceFqdnId in the source = datasource_nk in mv_stg_entity_term.
-- Measures:
--   - file_count : files in that temperature band on that day
-- ============================================================================

CREATE MATERIALIZED VIEW fact_temperature_daily AS
SELECT
  md5(COALESCE(v."DataSourceFqdnId",'') || '|' ||
      COALESCE(NULLIF(trim(v."Temperature"),''),'Unknown') || '|' ||
      COALESCE(v."Date"::date::text,''))                             AS temperature_daily_nk,
  md5(COALESCE(v."DataSourceFqdnId",'unknown'))                       AS datasource_key,
  md5(lower(COALESCE(NULLIF(trim(v."Temperature"),''),'Unknown')))    AS temperature_key,
  COALESCE(NULLIF(trim(v."Temperature"),''),'Unknown')                AS temperature_name,
  COALESCE(to_char(v."Date"::date,'YYYYMMDD')::int, 19000101)         AS snapshot_date_key,
  v."FileCount"::bigint                                               AS file_count
FROM v_entities_temperature_count v
WHERE v."Date" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ftd_temperature ON fact_temperature_daily(temperature_key);
CREATE INDEX IF NOT EXISTS idx_ftd_date        ON fact_temperature_daily(snapshot_date_key);
CREATE INDEX IF NOT EXISTS idx_ftd_datasource  ON fact_temperature_daily(datasource_key);
