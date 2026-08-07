-- ============================================================================
-- FACT: fact_duplicate
-- ============================================================================
-- Grain: one row per duplicate group (GroupId)
-- Source: mv_duplicate_savings_by_original_view (already pre-aggregated upstream)
-- Adds: dim attributes by joining on the example entity through duplicate_files_view
--       (best-effort path → entity → datasource).
-- Measures:
--   - duplicate_group_count : 1 per row
--   - duplicate_file_count  : redundant file count
--   - savings_size_tb       : storage that could be freed
--   - savings_cost_usd      : annual cost that could be freed
-- ============================================================================

CREATE MATERIALIZED VIEW fact_duplicate AS
WITH ex AS (
  -- One example entity per duplicate group (used for FK joins)
  SELECT DISTINCT ON ("GroupId")
    "GroupId", "EntityId", "CreatedAt", "ModifiedAt"
  FROM duplicate_files_view
  WHERE "GroupId" IS NOT NULL
  ORDER BY "GroupId", "EntityId"
)
SELECT
  md5(d."GroupId")                                          AS duplicate_group_key,
  d."GroupId"                                               AS duplicate_group_nk,
  COALESCE(md5(ex."EntityId"), 'unknown')                   AS entity_key,
  COALESCE(md5(de.datasource_nk), 'unknown')                AS datasource_key,
  COALESCE(d."DataSourceType",'(unknown)')                  AS datasource_type_label,
  COALESCE(d."Type",'(unknown)')                            AS resource_type_label,
  COALESCE(d."Category",'(unknown)')                        AS category_label,
  COALESCE(to_char(ex."CreatedAt"::date, 'YYYYMMDD')::int, 19000101) AS created_date_key,
  COALESCE(to_char(ex."ModifiedAt"::date,'YYYYMMDD')::int, 19000101) AS modified_date_key,
  d.original_path,
  1                                                         AS duplicate_group_count,
  d.duplicate_file_count                                    AS duplicate_file_count,
  d.savings_size_tb                                         AS savings_size_tb,
  d.savings_cost_usd                                        AS savings_cost_usd
FROM mv_duplicate_savings_by_original_view d
LEFT JOIN ex          ON ex."GroupId" = d."GroupId"
LEFT JOIN dim_entity  de ON de.entity_nk = ex."EntityId"
WHERE d."GroupId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fd_group      ON fact_duplicate(duplicate_group_key);
CREATE INDEX IF NOT EXISTS idx_fd_entity     ON fact_duplicate(entity_key);
CREATE INDEX IF NOT EXISTS idx_fd_datasource ON fact_duplicate(datasource_key);
CREATE INDEX IF NOT EXISTS idx_fd_category   ON fact_duplicate(category_label);
CREATE INDEX IF NOT EXISTS idx_fd_dstype     ON fact_duplicate(datasource_type_label);
