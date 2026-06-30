-- =====================================================================
-- 06-seed / 06-term-demo-seed.sql
-- Synthetic GLOSSARY + TERM-ASSIGNMENT demo, written to the durable overlay tables
-- (glossary_summary_view_demo / terms_view_demo) UNIONed in via v_glossary_summary /
-- v_terms. Builds a small business glossary (PII / Financial / Health / Confidential /
-- Operational, each with leaf terms) and assigns terms to the demo COLUMN entities by
-- column name -- so a realistic share of assets become "governed" (term-tagged) and the
-- glossary / sensitive-domains / term-stewardship / adoption dashboards populate.
-- Idempotent (TRUNCATE + regenerate). After running, REFRESH mv_stg_entity_term + the
-- entity/term/glossary dims & facts (or 05-refresh/01-refresh-all.sql).
-- =====================================================================
\set ON_ERROR_STOP on
\if :{?BIDB_EXT_SCHEMA_NAME}
\else
\set BIDB_EXT_SCHEMA_NAME 'bidb_ext_dev'
\endif
SET search_path TO :"BIDB_EXT_SCHEMA_NAME", public;
SET statement_timeout = '300s';

TRUNCATE glossary_summary_view_demo;
TRUNCATE terms_view_demo;

-- ---- glossary taxonomy: 5 domains (root) + leaf terms --------------------
-- roots
INSERT INTO glossary_summary_view_demo ("_id","Name","Type","Parent","Fqdn")
SELECT 'DEMO-GL-'||md5(name), name, 'glossary', NULL, name
FROM (VALUES ('PII'),('Financial'),('Health'),('Confidential'),('Operational')) g(name);
-- leaf terms (Parent = its glossary root)
INSERT INTO glossary_summary_view_demo ("_id","Name","Type","Parent","Fqdn")
SELECT 'DEMO-GT-'||md5(term), term, 'term', 'DEMO-GL-'||md5(glossary), glossary||'/'||term
FROM (VALUES
  ('PII - Email Address','PII'),('PII - Phone Number','PII'),('PII - Home Address','PII'),('PII - Date of Birth','PII'),('PII - SSN','PII'),
  ('PII - Passport','PII'),('PII - IP Address','PII'),('PII - Full Name','PII'),
  ('PCI - Credit Card','Financial'),('PCI - Account Number','Financial'),('Financial - Tax ID','Financial'),
  ('Confidential - Salary','Confidential'),
  ('PHI - Patient Record','Health'),
  ('Order Status','Operational'),('Product Code','Operational')
) t(term, glossary);

-- ---- term assignments: map demo COLUMN entities (by Name) to a term ------
INSERT INTO terms_view_demo ("EntityId","TermName","GlossaryId","TermId","FqdnDisplay")
SELECT e."_id", m.term, 'DEMO-GL-'||md5(m.glossary), 'DEMO-GT-'||md5(m.term), e."FqdnDisplay"
FROM entities_master_demo e
JOIN (VALUES
  ('email','PII - Email Address','PII'),
  ('phone','PII - Phone Number','PII'),
  ('home_address','PII - Home Address','PII'),
  ('date_of_birth','PII - Date of Birth','PII'),
  ('credit_card','PCI - Credit Card','Financial'),
  ('account_no','PCI - Account Number','Financial'),
  ('salary','Confidential - Salary','Confidential'),
  ('ssn','PII - SSN','PII'),
  ('passport_no','PII - Passport','PII'),
  ('ip_address','PII - IP Address','PII'),
  ('first_name','PII - Full Name','PII'),
  ('last_name','PII - Full Name','PII'),
  ('tax_id','Financial - Tax ID','Financial'),
  ('status','Order Status','Operational'),
  ('product_code','Product Code','Operational')
) m(col, term, glossary) ON m.col = e."Name"
-- per-source governance maturity: how much of the matchable data actually gets classified
JOIN (VALUES
  ('demo-rs-dw',95),('demo-sf-analytics',92),('demo-ora-fin',90),('demo-pg-prod',82),
  ('demo-mssql-crm',80),('demo-bq-mkt',60),('demo-dbx-lake',55),('demo-td-edw',50),
  ('demo-mysql-app',45),('demo-kafka-stream',30)
) g(ds_id, gate) ON g.ds_id = e."DataSourceId"
WHERE e."Type" = 'COLUMN' AND (abs(hashtext(e."_id")) % 100) < g.gate;

-- ---- FILE classification by domain (so file/lake sources are governed, not stuck at 0%) ----
INSERT INTO terms_view_demo ("EntityId","TermName","GlossaryId","TermId","FqdnDisplay")
SELECT e."_id", fm.term, 'DEMO-GL-'||md5(fm.glossary), 'DEMO-GT-'||md5(fm.term), e."FqdnDisplay"
FROM entities_master_demo e
JOIN (VALUES
  ('finance','PCI - Account Number','Financial'),
  ('payments','PCI - Credit Card','Financial'),
  ('hr','Confidential - Salary','Confidential'),
  ('sales','Order Status','Operational'),
  ('marketing','PII - Email Address','PII'),
  ('clickstream','PII - IP Address','PII')
) fm(dom, term, glossary) ON e."ParentPath" LIKE '%/'||fm.dom||'%'
JOIN (VALUES ('demo-s3-lake',38),('demo-az-docs',58),('demo-gcs-lake',48)) fg(ds_id, gate) ON fg.ds_id = e."DataSourceId"
WHERE e."Type" = 'FILE' AND (abs(hashtext(e."_id")) % 100) < fg.gate;

SELECT 'demo_glossary_nodes' k, count(*) v FROM glossary_summary_view_demo
UNION ALL SELECT '  roots', count(*) FROM glossary_summary_view_demo WHERE "Type"='glossary'
UNION ALL SELECT '  terms', count(*) FROM glossary_summary_view_demo WHERE "Type"='term'
UNION ALL SELECT 'demo_term_assignments', count(*) FROM terms_view_demo
UNION ALL SELECT 'demo_governed_entities', count(DISTINCT "EntityId") FROM terms_view_demo
ORDER BY 1;
