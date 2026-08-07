-- ============================================================================
-- DIMENSION: dim_pipeline_status
-- ============================================================================
-- Status enumeration for pipeline runs with stable sort/order keys.
-- Built from observed values in pipeline_log + canonical list.
-- ============================================================================

CREATE MATERIALIZED VIEW dim_pipeline_status AS
WITH static_vals(status_name, status_sort) AS (
  VALUES
    ('STARTED',   '01. Started'),
    ('SUCCESS',   '02. Success'),
    ('SUCCEEDED', '02. Success'),
    ('COMPLETED', '02. Success'),
    ('FAILED',    '03. Failed'),
    ('ERROR',     '03. Failed'),
    ('SKIPPED',   '04. Skipped'),
    ('UNKNOWN',   '99. Unknown')
), observed AS (
  SELECT DISTINCT COALESCE(NULLIF(upper(trim(status)),''),'UNKNOWN') AS status_name
  FROM pipeline_log
), unioned AS (
  SELECT status_name FROM static_vals
  UNION
  SELECT status_name FROM observed
)
SELECT
  md5(status_name)                                            AS status_key,
  status_name,
  COALESCE(s.status_sort,'98. Other ('||status_name||')')     AS status_sort,
  CASE WHEN s.status_sort = '02. Success' THEN 1 ELSE 0 END   AS is_success_flag,
  CASE WHEN s.status_sort = '03. Failed'  THEN 1 ELSE 0 END   AS is_failure_flag
FROM unioned u
LEFT JOIN static_vals s USING (status_name);

CREATE INDEX IF NOT EXISTS idx_dim_pipeline_status_key  ON dim_pipeline_status(status_key);
CREATE INDEX IF NOT EXISTS idx_dim_pipeline_status_sort ON dim_pipeline_status(status_sort);
