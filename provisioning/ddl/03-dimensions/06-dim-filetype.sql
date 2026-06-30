-- ============================================================================
-- DIMENSION: dim_filetype
-- ============================================================================
-- File type dimension
-- Includes default "No File Type Available" for entities without file types
-- ============================================================================

CREATE MATERIALIZED VIEW dim_filetype AS
SELECT
  md5(lower(trim(filetype))) AS filetype_key,
  filetype
FROM mv_stg_entity_term
WHERE filetype IS NOT NULL
GROUP BY 1, 2

UNION ALL

-- Default member for entities without file types
SELECT
  'unknown'::text AS filetype_key,
  'No File Type Available'::text AS filetype;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_dim_filetype_key ON dim_filetype(filetype_key);
