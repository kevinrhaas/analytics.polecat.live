-- ============================================================================
-- FACT: fact_extension_daily
-- ============================================================================
-- Grain: one row per (data source, extension, date)
-- Source: v_entities_extension_count
-- Conformed FKs: datasource_key (dim_datasource), extension_key (dim_extension),
--                snapshot_date_key (dim_date)
-- DataSourceFqdnId in the source = datasource_nk in mv_stg_entity_term, so
-- md5(DataSourceFqdnId) = dim_datasource.datasource_key.
-- Measures:
--   - file_count : files of that extension on that day
-- ============================================================================

CREATE MATERIALIZED VIEW fact_extension_daily AS
SELECT
  md5(COALESCE(v."DataSourceFqdnId",'') || '|' ||
      COALESCE(NULLIF(trim(v."Extension"),''),'(none)') || '|' ||
      COALESCE(v."Date"::date::text,''))                             AS extension_daily_nk,
  md5(COALESCE(v."DataSourceFqdnId",'unknown'))                       AS datasource_key,
  md5(lower(trim(COALESCE(v."Extension",'(none)'))))                  AS extension_key,
  COALESCE(NULLIF(trim(v."Extension"),''),'(none)')                   AS extension_name,
  COALESCE(to_char(v."Date"::date,'YYYYMMDD')::int, 19000101)         AS snapshot_date_key,
  v."FileCount"::bigint                                               AS file_count
FROM v_entities_extension_count v
WHERE v."Date" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fed_extension  ON fact_extension_daily(extension_key);
CREATE INDEX IF NOT EXISTS idx_fed_date       ON fact_extension_daily(snapshot_date_key);
CREATE INDEX IF NOT EXISTS idx_fed_datasource ON fact_extension_daily(datasource_key);
