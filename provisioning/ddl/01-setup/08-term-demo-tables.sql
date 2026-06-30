-- =====================================================================
-- 01-setup / 08-term-demo-tables.sql
-- Durable overlay tables for the synthetic GLOSSARY/TERMS demo: a business glossary
-- taxonomy + entity->term assignments. UNIONed into v_glossary_summary / v_terms so
-- mv_stg_entity_term, dim_glossary_term, dim_term, fact_entity_term and the governed%
-- in fact_entity_snapshot all stay rich. Created AFTER 01-fdw-setup.sql (LIKE mirrors
-- the imported views). Idempotent; seeded by 06-seed/06-term-demo-seed.sql.
-- =====================================================================
\if :{?BIDB_EXT_SCHEMA_NAME}
\else
\set BIDB_EXT_SCHEMA_NAME 'bidb_ext_dev'
\endif
SET search_path TO :"BIDB_EXT_SCHEMA_NAME", public;

CREATE TABLE IF NOT EXISTS glossary_summary_view_demo (LIKE glossary_summary_view);
CREATE TABLE IF NOT EXISTS terms_view_demo (LIKE terms_view);

CREATE INDEX IF NOT EXISTS idx_gsvd_id   ON glossary_summary_view_demo ("_id");
CREATE INDEX IF NOT EXISTS idx_gsvd_name ON glossary_summary_view_demo ("Name");
CREATE INDEX IF NOT EXISTS idx_tvd_fqdn  ON terms_view_demo ("FqdnDisplay");
CREATE INDEX IF NOT EXISTS idx_tvd_term  ON terms_view_demo ("TermName");
