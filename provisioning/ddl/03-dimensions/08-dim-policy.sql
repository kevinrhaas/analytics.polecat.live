-- ============================================================================
-- DIMENSION: dim_policy
-- ============================================================================
-- One row per policy with its 3-level glossary hierarchy where present.
-- Source: v_policies_summary (master) + mv_policies_summary (level hierarchy)
-- ============================================================================

CREATE MATERIALIZED VIEW dim_policy AS
SELECT
  md5(p._id)                              AS policy_key,
  p._id                                   AS policy_nk,
  p."Name"                                AS policy_name,
  COALESCE(p."Type",   'Unspecified')     AS policy_type,
  COALESCE(p."Parent", '(root)')          AS policy_parent,
  p."Fqdn"                                AS policy_fqdn,
  COALESCE(h."Level1_Name", '(none)')     AS policy_level_1,
  COALESCE(h."Level2_Name", '(none)')     AS policy_level_2,
  COALESCE(h."Level3_Name", '(none)')     AS policy_level_3
FROM v_policies_summary p
LEFT JOIN LATERAL (
  SELECT "Level1_Name","Level2_Name","Level3_Name"
  FROM mv_policies_summary mps
  WHERE mps."Level3_Name" = p."Name"
     OR mps."Level2_Name" = p."Name"
     OR mps."Level1_Name" = p."Name"
  ORDER BY (mps."Level3_Name" = p."Name")::int DESC,
           (mps."Level2_Name" = p."Name")::int DESC
  LIMIT 1
) h ON true
WHERE p._id IS NOT NULL
UNION ALL
SELECT 'unknown','(unknown)','(No Policy)','(unknown)','(root)',NULL,'(none)','(none)','(none)';

CREATE INDEX IF NOT EXISTS idx_dim_policy_key  ON dim_policy(policy_key);
CREATE INDEX IF NOT EXISTS idx_dim_policy_name ON dim_policy(policy_name);
CREATE INDEX IF NOT EXISTS idx_dim_policy_l1   ON dim_policy(policy_level_1);
CREATE INDEX IF NOT EXISTS idx_dim_policy_l2   ON dim_policy(policy_level_2);
