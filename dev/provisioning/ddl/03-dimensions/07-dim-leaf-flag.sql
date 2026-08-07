-- ============================================================================
-- DIMENSION: dim_leaf_flag
-- ============================================================================
-- Two-row dimension for leaf-term filtering (true/false)
-- ============================================================================

CREATE MATERIALIZED VIEW dim_leaf_flag AS
SELECT true AS leaf_flag_key, 'Leaf Term'::text AS leaf_flag_label
UNION ALL
SELECT false AS leaf_flag_key, 'Not Leaf Term'::text AS leaf_flag_label;

-- Create index
CREATE INDEX IF NOT EXISTS idx_dim_leaf_flag_key ON dim_leaf_flag(leaf_flag_key);
