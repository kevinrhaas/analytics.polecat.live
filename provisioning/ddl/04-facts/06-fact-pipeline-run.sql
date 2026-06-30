-- ============================================================================
-- FACT: fact_pipeline_run
-- ============================================================================
-- Grain: one row per pipeline_log row (job_id × view_name × started_at)
-- Measures:
--   - run_count        : 1
--   - success_count    : 1 if status indicates success
--   - failure_count    : 1 if status indicates failure
--   - runtime_seconds  : completed_at - started_at (NULL when in-flight)
-- Foreign keys: status_key, started_date_key, completed_date_key
--               + degenerate dim view_name (analyzed via cube degenerate dim)
-- ============================================================================

CREATE MATERIALIZED VIEW fact_pipeline_run AS
SELECT
  md5(COALESCE(pl.job_id,'') || '|' || COALESCE(pl.view_name,'')
      || '|' || COALESCE(pl.started_at::text,''))                       AS pipeline_run_nk,
  md5(COALESCE(NULLIF(upper(trim(pl.status)),''),'UNKNOWN'))             AS status_key,
  pl.job_id                                                              AS job_id,
  pl.view_name                                                           AS view_name,
  COALESCE(NULLIF(upper(trim(pl.status)),''),'UNKNOWN')                  AS status_label,
  pl.started_at,
  pl.completed_at,
  COALESCE(to_char(pl.started_at::date, 'YYYYMMDD')::int, 19000101)      AS started_date_key,
  COALESCE(to_char(pl.completed_at::date,'YYYYMMDD')::int, 19000101)     AS completed_date_key,
  1                                                                      AS run_count,
  CASE WHEN upper(pl.status) IN ('SUCCESS','SUCCEEDED','COMPLETED') THEN 1 ELSE 0 END AS success_count,
  CASE WHEN upper(pl.status) IN ('FAILED','ERROR') THEN 1 ELSE 0 END     AS failure_count,
  CASE WHEN pl.completed_at IS NOT NULL AND pl.started_at IS NOT NULL
       THEN GREATEST(0, EXTRACT(EPOCH FROM (pl.completed_at - pl.started_at))::numeric)
       ELSE NULL END                                                     AS runtime_seconds
FROM pipeline_log pl
WHERE pl.started_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fpr_status    ON fact_pipeline_run(status_key);
CREATE INDEX IF NOT EXISTS idx_fpr_view      ON fact_pipeline_run(view_name);
CREATE INDEX IF NOT EXISTS idx_fpr_started   ON fact_pipeline_run(started_date_key);
CREATE INDEX IF NOT EXISTS idx_fpr_completed ON fact_pipeline_run(completed_date_key);
