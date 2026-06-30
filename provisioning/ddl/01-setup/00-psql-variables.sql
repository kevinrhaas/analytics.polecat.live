-- ============================================================================
-- PSQL VARIABLES (loaded by 00-execute-all.sql)
-- ============================================================================
-- Generated from: pdc-analysis/data/properties/pdc_analysis.properties
-- Keep in sync with that file if values change.
-- ============================================================================

\set BIDB_HOST '10.80.230.241'
\set BIDB_DB_NAME 'pentaho_bidb'
\set BIDB_PORT '5432'
\set BIDB_USERNAME 'bidb_ro'
\set BIDB_PASSWORD '4aU94t8v+4d+W'
\set BIDB_SCHEMA_NAME 'bidb'
\set BIDB_EXT_HOST 'airlinesample.cyj079bqebpx.us-west-2.rds.amazonaws.com'
\set BIDB_EXT_DB_NAME 'postgres'
\set BIDB_EXT_PORT '5432'
\set BIDB_EXT_USERNAME 'postgres'
\set BIDB_EXT_PASSWORD 'Password1'
\if :{?BIDB_EXT_SCHEMA_NAME}
\else
\set BIDB_EXT_SCHEMA_NAME 'bidb_ext_dev'
\endif
