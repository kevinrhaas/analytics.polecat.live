-- ============================================================================
-- FOREIGN DATA WRAPPER SETUP
-- ============================================================================
-- Creates postgres_fdw, server, user mapping, and imports foreign schema
-- Uses variables loaded from 01-setup/00-psql-variables.sql
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgres_fdw;

CREATE SERVER IF NOT EXISTS remote_bidb
  FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (host :'BIDB_HOST', dbname :'BIDB_DB_NAME', port :'BIDB_PORT');

ALTER SERVER remote_bidb
  OPTIONS (SET host :'BIDB_HOST', SET dbname :'BIDB_DB_NAME', SET port :'BIDB_PORT');

CREATE USER MAPPING IF NOT EXISTS FOR CURRENT_USER
  SERVER remote_bidb
  OPTIONS (user :'BIDB_USERNAME', password :'BIDB_PASSWORD');

ALTER USER MAPPING FOR CURRENT_USER
  SERVER remote_bidb
  OPTIONS (SET user :'BIDB_USERNAME', SET password :'BIDB_PASSWORD');

-- Drop existing foreign tables in the target schema
SELECT format('DROP FOREIGN TABLE IF EXISTS %I.%I CASCADE;', n.nspname, c.relname)
FROM pg_foreign_table ft
JOIN pg_class c      ON c.oid = ft.ftrelid
JOIN pg_namespace n  ON n.oid = c.relnamespace
WHERE n.nspname = :'BIDB_EXT_SCHEMA_NAME'
\gexec

-- Re-import the foreign schema
IMPORT FOREIGN SCHEMA :"BIDB_SCHEMA_NAME"
  FROM SERVER remote_bidb
  INTO :"BIDB_EXT_SCHEMA_NAME";
