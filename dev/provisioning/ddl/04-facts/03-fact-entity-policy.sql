-- ============================================================================
-- FACT: fact_entity_policy
-- ============================================================================
-- Grain: one row per (entity, policy)
-- Measures:
--   - assignment_count   : 1 per row (governance breadth)
--   - governed_size_tb   : entity size in TB (governed-asset capacity)
--   - governed_cost_usd  : entity size * cost_per_tb_usd
-- Foreign keys: entity_key, datasource_key, policy_key
-- Source: v_entities_policies ⨯ dim_entity (size, cost)
-- ============================================================================

CREATE MATERIALIZED VIEW fact_entity_policy AS
SELECT
  md5(epv."EntityId") || '|' || md5(epv."PolicyId")            AS entity_policy_nk,
  md5(epv."EntityId")                                           AS entity_key,
  COALESCE(md5(de.datasource_nk), 'unknown')                    AS datasource_key,
  md5(epv."PolicyId")                                           AS policy_key,
  -- measures
  1                                                             AS assignment_count,
  GREATEST(COALESCE(emv."Size",0)::bigint, COALESCE(emv."TotalChildFileSize",0)::bigint, COALESCE(emv."ChildFileSize",0)::bigint) * get_data_multiplier()        AS governed_bytes,
  (GREATEST(COALESCE(emv."Size",0)::bigint, COALESCE(emv."TotalChildFileSize",0)::bigint, COALESCE(emv."ChildFileSize",0)::bigint) * get_data_multiplier()) / 1099511627776.0    AS governed_size_tb,
  ROUND(
    ((GREATEST(COALESCE(emv."Size",0)::bigint, COALESCE(emv."TotalChildFileSize",0)::bigint, COALESCE(emv."ChildFileSize",0)::bigint) * get_data_multiplier()) / 1099511627776.0)::numeric
    * COALESCE(de.cost_per_tb_usd, 0)::numeric, 4
  )                                                             AS governed_cost_usd
FROM v_entities_policies epv
LEFT JOIN dim_entity            de  ON de.entity_nk = epv."EntityId"
LEFT JOIN v_entities_master  emv ON emv._id      = epv."EntityId"
WHERE epv."EntityId" IS NOT NULL
  AND epv."PolicyId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fep_entity     ON fact_entity_policy(entity_key);
CREATE INDEX IF NOT EXISTS idx_fep_policy     ON fact_entity_policy(policy_key);
CREATE INDEX IF NOT EXISTS idx_fep_datasource ON fact_entity_policy(datasource_key);
