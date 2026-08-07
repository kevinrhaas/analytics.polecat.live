-- ============================================================================
-- DIMENSION: dim_application
-- ============================================================================
-- One row per discovered application that touches catalog data.
-- Source: v_applications_summary
--   UsersWithAccess is jsonb (array) — count cardinality.
-- ============================================================================

CREATE MATERIALIZED VIEW dim_application AS
SELECT
  md5(a._id)                                AS application_key,
  a._id                                     AS application_nk,
  a."Name"                                  AS application_name,
  COALESCE(a."Type",   'Unspecified')       AS application_type,
  COALESCE(a."Parent", '(root)')            AS application_parent,
  a."Fqdn"                                  AS application_fqdn,
  CASE
    WHEN a."UsersWithAccess" IS NULL THEN 0
    WHEN jsonb_typeof(a."UsersWithAccess") = 'array'
      THEN jsonb_array_length(a."UsersWithAccess")
    ELSE 0
  END                                       AS users_with_access_count
FROM v_applications_summary a
WHERE a._id IS NOT NULL
UNION ALL
SELECT 'unknown','(unknown)','(No Application)','(unknown)','(root)',NULL,0;

CREATE INDEX IF NOT EXISTS idx_dim_application_key  ON dim_application(application_key);
CREATE INDEX IF NOT EXISTS idx_dim_application_name ON dim_application(application_name);
CREATE INDEX IF NOT EXISTS idx_dim_application_type ON dim_application(application_type);
