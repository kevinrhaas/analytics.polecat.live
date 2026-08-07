-- ============================================================================
-- DIMENSION: dim_date
-- ============================================================================
-- Complete date dimension with continuous date range
-- Includes Unknown date (1900-01-01) for missing values
-- ============================================================================

CREATE MATERIALIZED VIEW dim_date AS
WITH date_range AS (
  -- Get min/max dates from all timestamp fields
  SELECT 
    LEAST(
      MIN(created_ts::date),
      MIN(modified_ts::date),
      MIN(accessed_ts::date),
      MIN(scanned_ts::date),
      MIN(last_update_ts::date),
      MIN(last_update_statistics_ts::date)
    ) AS min_date,
    GREATEST(
      MAX(created_ts::date),
      MAX(modified_ts::date),
      MAX(accessed_ts::date),
      MAX(scanned_ts::date),
      MAX(last_update_ts::date),
      MAX(last_update_statistics_ts::date),
      CURRENT_DATE
    ) AS max_date
  FROM mv_stg_entity_term
),
all_dates AS (
  -- Generate complete date range
  SELECT generate_series(
    (SELECT min_date FROM date_range),
    (SELECT max_date FROM date_range),
    '1 day'::interval
  )::date AS d
  
  UNION
  
  -- Add Unknown date
  SELECT '1900-01-01'::date
)
SELECT
  to_char(d, 'YYYYMMDD')::int AS date_key,
  d AS full_date,
  extract(year FROM d)::int AS year,
  to_char(d, 'YYYY-MM') AS year_month_number,
  to_char(d, 'YYYY') || '-' || to_char(d, 'Mon') AS year_month_name,
  to_char(d, 'Mon') AS month_name,
  extract(month FROM d)::int AS month,
  extract(day FROM d)::int AS day,
  extract(dow FROM d)::int AS day_of_week,
  CASE WHEN d = '1900-01-01'::date THEN true ELSE false END AS is_unknown
FROM all_dates;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_dim_date_key ON dim_date(date_key);
