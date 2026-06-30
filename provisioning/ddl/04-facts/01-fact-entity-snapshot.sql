-- ============================================================================
-- FACT: fact_entity_snapshot
-- ============================================================================
-- Daily entity snapshots with storage metrics
-- Grain: entity + scanned_date
-- Includes term_key and filetype_key pointing to default members
-- ============================================================================

CREATE MATERIALIZED VIEW fact_entity_snapshot AS
SELECT DISTINCT ON (stg.entity_nk, stg.scanned_ts::date)
  md5(stg.entity_nk) AS entity_key,
  md5(stg.datasource_nk) AS datasource_key,
  -- Add term_key pointing to "No Term Available" default member
  'unknown'::text AS term_key,
  -- Add glossary_term_key pointing to "No Glossary Available" default member
  'unknown'::text AS glossary_term_key,
  -- Add filetype_key (use actual if exists, otherwise default to "No File Type Available")
  COALESCE(md5(lower(trim(stg.filetype))), 'unknown'::text) AS filetype_key,
  -- Date foreign keys with Unknown handling
  COALESCE(to_char(stg.scanned_ts::date, 'YYYYMMDD')::int, 19000101) AS scanned_date_key,
  COALESCE(to_char(stg.created_ts::date, 'YYYYMMDD')::int, 19000101) AS created_date_key,
  COALESCE(to_char(stg.modified_ts::date, 'YYYYMMDD')::int, 19000101) AS modified_date_key,
  COALESCE(to_char(stg.accessed_ts::date, 'YYYYMMDD')::int, 19000101) AS accessed_date_key,
  COALESCE(to_char(stg.last_update_ts::date, 'YYYYMMDD')::int, 19000101) AS last_update_date_key,
  COALESCE(to_char(stg.last_update_statistics_ts::date, 'YYYYMMDD')::int, 19000101) AS last_update_statistics_date_key,
  -- Measures
  1 AS entity_count,
  (COALESCE(stg.bytes, 0) * get_data_multiplier())::bigint AS bytes,
  (COALESCE(emv."ChildDirs", 0) * get_data_multiplier())::bigint AS child_dirs,
  (COALESCE(emv."ChildFiles", 0) * get_data_multiplier())::bigint AS child_files,
  (COALESCE(emv."ChildDirSize", 0) * get_data_multiplier())::bigint AS child_dir_bytes,
  (COALESCE(emv."ChildFileSize", 0) * get_data_multiplier())::bigint AS child_file_bytes,
  (COALESCE(emv."TotalChildDirs", 0) * get_data_multiplier())::bigint AS total_child_dirs,
  (COALESCE(emv."TotalChildFiles", 0) * get_data_multiplier())::bigint AS total_child_files,
  (COALESCE(emv."TotalChildDirSize", 0) * get_data_multiplier())::bigint AS total_child_dir_bytes,
  (COALESCE(emv."TotalChildFileSize", 0) * get_data_multiplier())::bigint AS total_child_file_bytes,
  -- Age metrics at snapshot time
  COALESCE(
    date_part('year', age(stg.scanned_ts, stg.created_ts))::int * 12
    + date_part('month', age(stg.scanned_ts, stg.created_ts))::int,
    0
  ) AS created_age_months,
  COALESCE(date_part('year', age(stg.scanned_ts, stg.created_ts))::int, 0) AS created_age_years,
  COALESCE(
    date_part('year', age(stg.scanned_ts, stg.modified_ts))::int * 12
    + date_part('month', age(stg.scanned_ts, stg.modified_ts))::int,
    0
  ) AS modified_age_months,
  COALESCE(date_part('year', age(stg.scanned_ts, stg.modified_ts))::int, 0) AS modified_age_years,
  COALESCE(
    date_part('year', age(stg.scanned_ts, stg.accessed_ts))::int * 12
    + date_part('month', age(stg.scanned_ts, stg.accessed_ts))::int,
    0
  ) AS accessed_age_months,
  COALESCE(date_part('year', age(stg.scanned_ts, stg.accessed_ts))::int, 0) AS accessed_age_years,
  -- Freshness and lifecycle bands derived from existing catalog timestamps
  CASE
    WHEN stg.accessed_ts IS NULL THEN '00. Unknown'
    WHEN stg.accessed_ts::date >= stg.scanned_ts::date - INTERVAL '90 days' THEN '01. Active (0-90 days)'
    WHEN stg.accessed_ts::date >= stg.scanned_ts::date - INTERVAL '365 days' THEN '02. Cooling (91-365 days)'
    WHEN stg.accessed_ts::date >= stg.scanned_ts::date - INTERVAL '3 years' THEN '03. Cold (1-3 years)'
    ELSE '04. Frozen (3+ years)'
  END AS accessed_age_band,
  CASE
    WHEN stg.modified_ts IS NULL THEN '00. Unknown'
    WHEN stg.modified_ts::date >= stg.scanned_ts::date - INTERVAL '90 days' THEN '01. Recently Modified (0-90 days)'
    WHEN stg.modified_ts::date >= stg.scanned_ts::date - INTERVAL '365 days' THEN '02. Modified 91-365 days'
    WHEN stg.modified_ts::date >= stg.scanned_ts::date - INTERVAL '3 years' THEN '03. Modified 1-3 years'
    ELSE '04. Modified 3+ years ago'
  END AS modified_age_band,
  CASE
    WHEN stg.created_ts IS NULL THEN '00. Unknown'
    WHEN stg.created_ts::date >= stg.scanned_ts::date - INTERVAL '90 days' THEN '01. New (0-90 days)'
    WHEN stg.created_ts::date >= stg.scanned_ts::date - INTERVAL '365 days' THEN '02. Created 91-365 days'
    WHEN stg.created_ts::date >= stg.scanned_ts::date - INTERVAL '3 years' THEN '03. Created 1-3 years'
    ELSE '04. Created 3+ years ago'
  END AS created_age_band,
  CASE
    WHEN stg.scanned_ts IS NULL THEN '00. Unknown'
    WHEN CURRENT_DATE - stg.scanned_ts::date <= 7 THEN '01. Current (0-7 days)'
    WHEN CURRENT_DATE - stg.scanned_ts::date <= 30 THEN '02. Recent (8-30 days)'
    WHEN CURRENT_DATE - stg.scanned_ts::date <= 90 THEN '03. Aging (31-90 days)'
    ELSE '04. Stale (90+ days)'
  END AS scan_freshness_band,
  CASE
    WHEN stg.last_update_ts IS NULL THEN '00. Unknown'
    WHEN CURRENT_DATE - stg.last_update_ts::date <= 7 THEN '01. Current (0-7 days)'
    WHEN CURRENT_DATE - stg.last_update_ts::date <= 30 THEN '02. Recent (8-30 days)'
    WHEN CURRENT_DATE - stg.last_update_ts::date <= 90 THEN '03. Aging (31-90 days)'
    ELSE '04. Stale (90+ days)'
  END AS metadata_update_freshness_band,
  CASE
    WHEN stg.last_update_statistics_ts IS NULL THEN '00. Unknown'
    WHEN CURRENT_DATE - stg.last_update_statistics_ts::date <= 7 THEN '01. Current (0-7 days)'
    WHEN CURRENT_DATE - stg.last_update_statistics_ts::date <= 30 THEN '02. Recent (8-30 days)'
    WHEN CURRENT_DATE - stg.last_update_statistics_ts::date <= 90 THEN '03. Aging (31-90 days)'
    ELSE '04. Stale (90+ days)'
  END AS statistics_freshness_band,
  -- Governance and metadata quality indicators derived from existing entity metadata
  CASE WHEN EXISTS (
    SELECT 1
    FROM mv_stg_entity_term stg_terms
    WHERE stg_terms.entity_nk = stg.entity_nk
      AND stg_terms.term_name IS NOT NULL
  ) THEN '01. Tagged' ELSE '02. No Term Assignment' END AS governance_coverage_status,
  CASE WHEN EXISTS (
    SELECT 1
    FROM mv_stg_entity_term stg_terms
    WHERE stg_terms.entity_nk = stg.entity_nk
      AND stg_terms.term_name IS NOT NULL
  ) THEN 1 ELSE 0 END AS governed_entity_count,
  CASE WHEN EXISTS (
    SELECT 1
    FROM mv_stg_entity_term stg_terms
    WHERE stg_terms.entity_nk = stg.entity_nk
      AND stg_terms.term_name IS NOT NULL
  ) THEN 0 ELSE 1 END AS ungoverned_entity_count,
  CASE WHEN stg.owner_name IS NULL OR trim(stg.owner_name) = '' THEN 1 ELSE 0 END AS missing_owner_count,
  CASE WHEN stg.group_name IS NULL OR trim(stg.group_name) = '' THEN 1 ELSE 0 END AS missing_group_count,
  CASE WHEN stg.filetype IS NULL OR trim(stg.filetype) = '' THEN 1 ELSE 0 END AS missing_filetype_count,
  CASE WHEN stg.path IS NULL OR trim(stg.path) = '' THEN 1 ELSE 0 END AS missing_path_count,
  CASE WHEN stg.created_ts IS NULL THEN 1 ELSE 0 END AS missing_created_date_count,
  CASE WHEN stg.modified_ts IS NULL THEN 1 ELSE 0 END AS missing_modified_date_count,
  CASE WHEN stg.accessed_ts IS NULL THEN 1 ELSE 0 END AS missing_accessed_date_count,
  (
    CASE WHEN stg.owner_name IS NULL OR trim(stg.owner_name) = '' THEN 0 ELSE 1 END +
    CASE WHEN stg.group_name IS NULL OR trim(stg.group_name) = '' THEN 0 ELSE 1 END +
    CASE WHEN stg.filetype IS NULL OR trim(stg.filetype) = '' THEN 0 ELSE 1 END +
    CASE WHEN stg.path IS NULL OR trim(stg.path) = '' THEN 0 ELSE 1 END +
    CASE WHEN stg.created_ts IS NULL THEN 0 ELSE 1 END +
    CASE WHEN stg.modified_ts IS NULL THEN 0 ELSE 1 END +
    CASE WHEN stg.accessed_ts IS NULL THEN 0 ELSE 1 END +
    CASE WHEN stg.last_update_ts IS NULL THEN 0 ELSE 1 END +
    CASE WHEN stg.last_update_statistics_ts IS NULL THEN 0 ELSE 1 END
  ) AS metadata_completed_field_count,
  9 AS metadata_expected_field_count,
  CASE
    WHEN (
      CASE WHEN stg.owner_name IS NULL OR trim(stg.owner_name) = '' THEN 0 ELSE 1 END +
      CASE WHEN stg.group_name IS NULL OR trim(stg.group_name) = '' THEN 0 ELSE 1 END +
      CASE WHEN stg.filetype IS NULL OR trim(stg.filetype) = '' THEN 0 ELSE 1 END +
      CASE WHEN stg.path IS NULL OR trim(stg.path) = '' THEN 0 ELSE 1 END +
      CASE WHEN stg.created_ts IS NULL THEN 0 ELSE 1 END +
      CASE WHEN stg.modified_ts IS NULL THEN 0 ELSE 1 END +
      CASE WHEN stg.accessed_ts IS NULL THEN 0 ELSE 1 END +
      CASE WHEN stg.last_update_ts IS NULL THEN 0 ELSE 1 END +
      CASE WHEN stg.last_update_statistics_ts IS NULL THEN 0 ELSE 1 END
    ) = 9 THEN '01. Complete'
    WHEN (
      CASE WHEN stg.owner_name IS NULL OR trim(stg.owner_name) = '' THEN 0 ELSE 1 END +
      CASE WHEN stg.group_name IS NULL OR trim(stg.group_name) = '' THEN 0 ELSE 1 END +
      CASE WHEN stg.filetype IS NULL OR trim(stg.filetype) = '' THEN 0 ELSE 1 END +
      CASE WHEN stg.path IS NULL OR trim(stg.path) = '' THEN 0 ELSE 1 END +
      CASE WHEN stg.created_ts IS NULL THEN 0 ELSE 1 END +
      CASE WHEN stg.modified_ts IS NULL THEN 0 ELSE 1 END +
      CASE WHEN stg.accessed_ts IS NULL THEN 0 ELSE 1 END +
      CASE WHEN stg.last_update_ts IS NULL THEN 0 ELSE 1 END +
      CASE WHEN stg.last_update_statistics_ts IS NULL THEN 0 ELSE 1 END
    ) >= 7 THEN '02. Mostly Complete'
    WHEN (
      CASE WHEN stg.owner_name IS NULL OR trim(stg.owner_name) = '' THEN 0 ELSE 1 END +
      CASE WHEN stg.group_name IS NULL OR trim(stg.group_name) = '' THEN 0 ELSE 1 END +
      CASE WHEN stg.filetype IS NULL OR trim(stg.filetype) = '' THEN 0 ELSE 1 END +
      CASE WHEN stg.path IS NULL OR trim(stg.path) = '' THEN 0 ELSE 1 END +
      CASE WHEN stg.created_ts IS NULL THEN 0 ELSE 1 END +
      CASE WHEN stg.modified_ts IS NULL THEN 0 ELSE 1 END +
      CASE WHEN stg.accessed_ts IS NULL THEN 0 ELSE 1 END +
      CASE WHEN stg.last_update_ts IS NULL THEN 0 ELSE 1 END +
      CASE WHEN stg.last_update_statistics_ts IS NULL THEN 0 ELSE 1 END
    ) >= 5 THEN '03. Partially Complete'
    ELSE '04. Low Completeness'
  END AS metadata_completeness_band
FROM mv_stg_entity_term stg
LEFT JOIN v_entities_master emv ON stg.entity_nk = emv._id
WHERE stg.entity_nk IS NOT NULL
  AND stg.scanned_ts IS NOT NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_fes_entity ON fact_entity_snapshot(entity_key);
CREATE INDEX IF NOT EXISTS idx_fes_datasource ON fact_entity_snapshot(datasource_key);
CREATE INDEX IF NOT EXISTS idx_fes_term ON fact_entity_snapshot(term_key);
CREATE INDEX IF NOT EXISTS idx_fes_glossary ON fact_entity_snapshot(glossary_term_key);
CREATE INDEX IF NOT EXISTS idx_fes_filetype ON fact_entity_snapshot(filetype_key);
CREATE INDEX IF NOT EXISTS idx_fes_scanned_date ON fact_entity_snapshot(scanned_date_key);
CREATE INDEX IF NOT EXISTS idx_fes_created_date ON fact_entity_snapshot(created_date_key);
CREATE INDEX IF NOT EXISTS idx_fes_modified_date ON fact_entity_snapshot(modified_date_key);
CREATE INDEX IF NOT EXISTS idx_fes_accessed_date ON fact_entity_snapshot(accessed_date_key);
CREATE INDEX IF NOT EXISTS idx_fes_last_update_date ON fact_entity_snapshot(last_update_date_key);
CREATE INDEX IF NOT EXISTS idx_fes_last_update_stats_date ON fact_entity_snapshot(last_update_statistics_date_key);
CREATE INDEX IF NOT EXISTS idx_fes_composite_grain ON fact_entity_snapshot(entity_key, scanned_date_key);
CREATE INDEX IF NOT EXISTS idx_fes_accessed_age_band ON fact_entity_snapshot(accessed_age_band);
CREATE INDEX IF NOT EXISTS idx_fes_scan_freshness_band ON fact_entity_snapshot(scan_freshness_band);
CREATE INDEX IF NOT EXISTS idx_fes_statistics_freshness_band ON fact_entity_snapshot(statistics_freshness_band);
CREATE INDEX IF NOT EXISTS idx_fes_governance_status ON fact_entity_snapshot(governance_coverage_status);
CREATE INDEX IF NOT EXISTS idx_fes_metadata_completeness_band ON fact_entity_snapshot(metadata_completeness_band);
