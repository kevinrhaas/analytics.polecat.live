-- ============================================================================
-- DIMENSION: dim_datasource
-- ============================================================================
-- Data source dimension (type, name, id)
-- ============================================================================

CREATE MATERIALIZED VIEW dim_datasource AS
SELECT
  md5(datasource_nk) AS datasource_key,
  datasource_nk,
  datasource_name,
  datasource_type
FROM mv_stg_entity_term
WHERE datasource_nk IS NOT NULL
GROUP BY 1, 2, 3, 4;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_dim_datasource_key ON dim_datasource(datasource_key);
