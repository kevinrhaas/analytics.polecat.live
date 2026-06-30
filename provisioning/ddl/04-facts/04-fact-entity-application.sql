-- ============================================================================
-- FACT: fact_entity_application
-- ============================================================================
-- Grain: one row per (entity, application)
-- Measures:
--   - access_count        : 1 per row (app reach)
--   - accessed_size_tb    : entity size in TB
--   - accessed_cost_usd   : entity size * cost_per_tb_usd
-- Source: v_entities_applications ⨯ dim_entity
-- ============================================================================

CREATE MATERIALIZED VIEW fact_entity_application AS
SELECT
  md5(eav."EntityId") || '|' || md5(eav."ApplicationId")       AS entity_app_nk,
  md5(eav."EntityId")                                           AS entity_key,
  COALESCE(md5(de.datasource_nk),'unknown')                     AS datasource_key,
  md5(eav."ApplicationId")                                      AS application_key,
  1                                                             AS access_count,
  GREATEST(COALESCE(emv."Size",0)::bigint, COALESCE(emv."TotalChildFileSize",0)::bigint, COALESCE(emv."ChildFileSize",0)::bigint) * get_data_multiplier()        AS accessed_bytes,
  (GREATEST(COALESCE(emv."Size",0)::bigint, COALESCE(emv."TotalChildFileSize",0)::bigint, COALESCE(emv."ChildFileSize",0)::bigint) * get_data_multiplier()) / 1099511627776.0  AS accessed_size_tb,
  ROUND(
    ((GREATEST(COALESCE(emv."Size",0)::bigint, COALESCE(emv."TotalChildFileSize",0)::bigint, COALESCE(emv."ChildFileSize",0)::bigint) * get_data_multiplier()) / 1099511627776.0)::numeric
    * COALESCE(de.cost_per_tb_usd, 0)::numeric, 4
  )                                                             AS accessed_cost_usd
FROM v_entities_applications eav
LEFT JOIN dim_entity           de  ON de.entity_nk = eav."EntityId"
LEFT JOIN v_entities_master emv ON emv._id      = eav."EntityId"
WHERE eav."EntityId" IS NOT NULL
  AND eav."ApplicationId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fea_entity      ON fact_entity_application(entity_key);
CREATE INDEX IF NOT EXISTS idx_fea_application ON fact_entity_application(application_key);
CREATE INDEX IF NOT EXISTS idx_fea_datasource  ON fact_entity_application(datasource_key);
