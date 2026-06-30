-- ============================================================================
-- FACT: fact_entity_term
-- ============================================================================
-- Many-to-many associative fact: entity to classification term to glossary
-- Grain: entity + term
-- Includes storage metrics from most recent snapshot for term-based analysis
-- Includes glossary_term_key for hierarchical glossary navigation
-- ============================================================================

CREATE MATERIALIZED VIEW fact_entity_term AS
SELECT
  md5(stg.entity_nk) AS entity_key,
  md5(lower(trim(stg.term_name))) AS term_key,
  COALESCE(stg.glossary_term_key, 'unknown') AS glossary_term_key,
  COALESCE(gdim.is_leaf_term, false) AS is_leaf_term,
  md5(stg.datasource_nk) AS datasource_key,
  COALESCE(to_char(stg.created_ts::date, 'YYYYMMDD')::int, 19000101) AS created_date_key,
  COALESCE(to_char(stg.modified_ts::date, 'YYYYMMDD')::int, 19000101) AS modified_date_key,
  COALESCE(to_char(stg.accessed_ts::date, 'YYYYMMDD')::int, 19000101) AS accessed_date_key,
  COALESCE(to_char(stg.scanned_ts::date, 'YYYYMMDD')::int, 19000101) AS scanned_date_key,
  1 AS association_count,
  -- Storage metrics from most recent snapshot (enables "GB by Term" analysis)
  -- NOTE: These values are duplicated for each term assignment to the same entity
  (COALESCE(snap.bytes, 0) * get_data_multiplier())::bigint AS bytes,
  (COALESCE(snap.child_dirs, 0) * get_data_multiplier())::bigint AS child_dirs,
  (COALESCE(snap.child_files, 0) * get_data_multiplier())::bigint AS child_files,
  (COALESCE(snap.child_dir_bytes, 0) * get_data_multiplier())::bigint AS child_dir_bytes,
  (COALESCE(snap.child_file_bytes, 0) * get_data_multiplier())::bigint AS child_file_bytes,
  (COALESCE(snap.total_child_dirs, 0) * get_data_multiplier())::bigint AS total_child_dirs,
  (COALESCE(snap.total_child_files, 0) * get_data_multiplier())::bigint AS total_child_files,
  (COALESCE(snap.total_child_dir_bytes, 0) * get_data_multiplier())::bigint AS total_child_dir_bytes,
  (COALESCE(snap.total_child_file_bytes, 0) * get_data_multiplier())::bigint AS total_child_file_bytes
FROM mv_stg_entity_term stg
LEFT JOIN dim_glossary_term gdim ON gdim.glossary_term_key = stg.glossary_term_key
LEFT JOIN LATERAL (
  SELECT 
    bytes, child_dirs, child_files, child_dir_bytes, child_file_bytes,
    total_child_dirs, total_child_files, total_child_dir_bytes, total_child_file_bytes
  FROM fact_entity_snapshot fes
  WHERE fes.entity_key = md5(stg.entity_nk)
  ORDER BY fes.scanned_date_key DESC
  LIMIT 1
) snap ON true
WHERE stg.entity_nk IS NOT NULL
  AND stg.term_name IS NOT NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_fet_entity ON fact_entity_term(entity_key);
CREATE INDEX IF NOT EXISTS idx_fet_term ON fact_entity_term(term_key);
CREATE INDEX IF NOT EXISTS idx_fet_glossary ON fact_entity_term(glossary_term_key);
CREATE INDEX IF NOT EXISTS idx_fet_datasource ON fact_entity_term(datasource_key);
CREATE INDEX IF NOT EXISTS idx_fet_created_date ON fact_entity_term(created_date_key);
CREATE INDEX IF NOT EXISTS idx_fet_modified_date ON fact_entity_term(modified_date_key);
CREATE INDEX IF NOT EXISTS idx_fet_accessed_date ON fact_entity_term(accessed_date_key);
CREATE INDEX IF NOT EXISTS idx_fet_scanned_date ON fact_entity_term(scanned_date_key);
CREATE INDEX IF NOT EXISTS idx_fet_composite_grain ON fact_entity_term(entity_key, term_key);
CREATE INDEX IF NOT EXISTS idx_fet_is_leaf_term ON fact_entity_term(is_leaf_term);
