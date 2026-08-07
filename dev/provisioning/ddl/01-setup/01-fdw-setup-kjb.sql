-- ============================================================================
-- FOREIGN DATA WRAPPER SETUP (Kettle SQL Job Entry)
-- ============================================================================
-- Uses Kettle variable substitution (${...}) and standard SQL (no psql meta)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgres_fdw;

CREATE SERVER IF NOT EXISTS remote_bidb
  FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (host '${BIDB_HOST}', dbname '${BIDB_DB_NAME}', port '${BIDB_PORT}');

ALTER SERVER remote_bidb
  OPTIONS (SET host '${BIDB_HOST}', SET dbname '${BIDB_DB_NAME}', SET port '${BIDB_PORT}');

CREATE USER MAPPING IF NOT EXISTS FOR CURRENT_USER
  SERVER remote_bidb
  OPTIONS (user '${BIDB_USERNAME}', password '${BIDB_PASSWORD}');

ALTER USER MAPPING FOR CURRENT_USER
  SERVER remote_bidb
  OPTIONS (SET user '${BIDB_USERNAME}', SET password '${BIDB_PASSWORD}');

DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schemaname, c.relname AS tablename
    FROM pg_foreign_table ft
    JOIN pg_class c      ON c.oid = ft.ftrelid
    JOIN pg_namespace n  ON n.oid = c.relnamespace
    WHERE n.nspname = '${BIDB_EXT_SCHEMA_NAME}'
  LOOP
    EXECUTE format('DROP FOREIGN TABLE IF EXISTS %I.%I CASCADE', r.schemaname, r.tablename);
  END LOOP;
END 
$do$;

IMPORT FOREIGN SCHEMA ${BIDB_SCHEMA_NAME}
  FROM SERVER remote_bidb
  INTO ${BIDB_EXT_SCHEMA_NAME};
