-- ============================================================================
-- DIMENSION: dim_temperature
-- ============================================================================
-- Static dimension: data temperature with sort order.
-- Built from distinct values seen in entities_temperature_count_view, plus
-- a known value list to ensure consistent membership across days with sparse data.
-- ============================================================================

CREATE MATERIALIZED VIEW dim_temperature AS
WITH static_vals(temperature_name, sort_order) AS (
  VALUES
    ('Hot',    '01. Hot'),
    ('Warm',   '02. Warm'),
    ('Cold',   '03. Cold'),
    ('Frozen', '04. Frozen'),
    ('Unknown','99. Unknown')
), observed AS (
  SELECT DISTINCT COALESCE(NULLIF(trim("Temperature"),''),'Unknown') AS temperature_name
  FROM entities_temperature_count_view
), unioned AS (
  SELECT temperature_name FROM static_vals
  UNION
  SELECT temperature_name FROM observed
)
SELECT
  md5(lower(temperature_name))                           AS temperature_key,
  temperature_name,
  COALESCE(s.sort_order, '98. Other ('||temperature_name||')') AS temperature_sort
FROM unioned u
LEFT JOIN static_vals s USING (temperature_name);

CREATE INDEX IF NOT EXISTS idx_dim_temperature_key  ON dim_temperature(temperature_key);
CREATE INDEX IF NOT EXISTS idx_dim_temperature_sort ON dim_temperature(temperature_sort);
