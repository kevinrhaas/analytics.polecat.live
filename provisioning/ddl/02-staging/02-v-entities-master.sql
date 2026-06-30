-- =====================================================================
-- 02-staging / 02-v-entities-master.sql
-- The catalog OVERLAY view: live PDC source (entities_master_view, via FDW) UNIONed
-- with the durable synthetic demo overlay (entities_master_demo). EVERY entity-side
-- dim/fact reads THIS view instead of entities_master_view directly, so real source
-- data + curated demo data flow through together and the dashboards stay rich no
-- matter how sparse the live source is.
--
-- Must be created BEFORE mv_stg_entity_term (and the entity dims/facts) which read it.
-- Column order/types match because entities_master_demo is created `LIKE
-- entities_master_view`, so SELECT * UNION ALL SELECT * lines up.
-- =====================================================================
\if :{?BIDB_EXT_SCHEMA_NAME}
\else
\set BIDB_EXT_SCHEMA_NAME 'bidb_ext_dev'
\endif
SET search_path TO :"BIDB_EXT_SCHEMA_NAME", public;

CREATE OR REPLACE VIEW v_entities_master AS
  SELECT * FROM entities_master_view
  UNION ALL
  SELECT * FROM entities_master_demo;
