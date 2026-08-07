-- ============================================================================
-- DIMENSION: dim_glossary_term
-- ============================================================================
-- Business glossary hierarchy (6 levels)
-- Parses FQDN path into levels for ragged hierarchy support
-- Source: v_glossary_summary
-- ============================================================================

CREATE MATERIALIZED VIEW dim_glossary_term AS
SELECT
  _id AS glossary_term_key,
  "Name" AS term_name,
  "Type" AS term_type,
  "Fqdn" AS term_fqdn,
  "Parent" AS parent_id,
  
  -- Parse FQDN into 6 levels (handles ragged hierarchies with NULLs)
  SPLIT_PART("Fqdn", '/', 1) AS level_1_glossary,
  NULLIF(SPLIT_PART("Fqdn", '/', 2), '') AS level_2,
  CASE
    WHEN lower(NULLIF(SPLIT_PART("Fqdn", '/', 2), '')) = 'frozen' THEN 1
    WHEN lower(NULLIF(SPLIT_PART("Fqdn", '/', 2), '')) = 'cold' THEN 2
    WHEN lower(NULLIF(SPLIT_PART("Fqdn", '/', 2), '')) = 'warm' THEN 3
    WHEN lower(NULLIF(SPLIT_PART("Fqdn", '/', 2), '')) = 'hot' THEN 4
    ELSE 999
  END AS level_2_sort,
  NULLIF(SPLIT_PART("Fqdn", '/', 3), '') AS level_3,
  NULLIF(SPLIT_PART("Fqdn", '/', 4), '') AS level_4,
  NULLIF(SPLIT_PART("Fqdn", '/', 5), '') AS level_5,
  NULLIF(SPLIT_PART("Fqdn", '/', 6), '') AS level_6,
  
  -- Calculate hierarchy depth
  ARRAY_LENGTH(STRING_TO_ARRAY("Fqdn", '/'), 1) AS hierarchy_depth,
  
  -- Flag for leaf terms
  CASE 
    WHEN "Type" = 'term' 
      AND NOT EXISTS (
        SELECT 1 FROM v_glossary_summary child 
        WHERE child."Parent" = v_glossary_summary._id
      )
    THEN true
    ELSE false
  END AS is_leaf_term,
  
  -- Get the leaf name (last segment of FQDN)
  SPLIT_PART("Fqdn", '/', ARRAY_LENGTH(STRING_TO_ARRAY("Fqdn", '/'), 1)) AS leaf_name
  
FROM v_glossary_summary

UNION ALL

-- Default member for missing glossary assignments
SELECT
  'unknown'::text AS glossary_term_key,
  'No Glossary Available'::text AS term_name,
  'unknown'::text AS term_type,
  NULL::text AS term_fqdn,
  NULL::text AS parent_id,
  'No Glossary'::text AS level_1_glossary,
  NULL::text AS level_2,
  999 AS level_2_sort,
  NULL::text AS level_3,
  NULL::text AS level_4,
  NULL::text AS level_5,
  NULL::text AS level_6,
  1 AS hierarchy_depth,
  true AS is_leaf_term,
  'No Glossary'::text AS leaf_name;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_dim_glossary_term_key ON dim_glossary_term(glossary_term_key);
CREATE INDEX IF NOT EXISTS idx_dim_glossary_fqdn ON dim_glossary_term(term_fqdn);
CREATE INDEX IF NOT EXISTS idx_dim_glossary_level1 ON dim_glossary_term(level_1_glossary);
CREATE INDEX IF NOT EXISTS idx_dim_glossary_parent ON dim_glossary_term(parent_id);
CREATE INDEX IF NOT EXISTS idx_dim_glossary_leaf ON dim_glossary_term(is_leaf_term) WHERE is_leaf_term = true;
