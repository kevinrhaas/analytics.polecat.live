-- ============================================================================
-- DIMENSION: dim_term
-- ============================================================================
-- Classification terms (Hot, Cold, PII, etc.)
-- Includes default "No Term Available" for entities without term assignments
-- ============================================================================

CREATE MATERIALIZED VIEW dim_term AS
SELECT
  md5(lower(trim(term_name))) AS term_key,
  term_name
FROM mv_stg_entity_term
WHERE term_name IS NOT NULL
GROUP BY 1, 2

UNION ALL

-- Default member for entities without terms
SELECT
  'unknown'::text AS term_key,
  'No Term Available'::text AS term_name;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_dim_term_key ON dim_term(term_key);
