-- =====================================================================
-- 06-seed / 05-policy-demo-seed.sql
-- Synthetic GOVERNANCE demo: a realistic policy catalog + entity->policy
-- assignments, written to the durable overlay tables (policies_summary_view_demo /
-- entities_policies_view_demo) that v_policies_summary / v_entities_policies UNION in.
-- Assignments are driven by each demo entity's Sensitivity so HIGH/MEDIUM assets are
-- well-governed and a realistic share of LOW assets are too -> a believable governed %.
-- Idempotent (TRUNCATE + regenerate). After running, REFRESH dim_policy + fact_entity_policy.
-- =====================================================================
\set ON_ERROR_STOP on
\if :{?BIDB_EXT_SCHEMA_NAME}
\else
\set BIDB_EXT_SCHEMA_NAME 'bidb_ext_dev'
\endif
SET search_path TO :"BIDB_EXT_SCHEMA_NAME", public;
SET statement_timeout = '300s';

TRUNCATE policies_summary_view_demo;
TRUNCATE entities_policies_view_demo;

-- ---- policy master --------------------------------------------------
INSERT INTO policies_summary_view_demo ("_id","Name","Type","Parent","Fqdn")
SELECT 'DEMO-POL-'||md5(name), name, ptype, ptype, 'Policies/'||ptype||'/'||name
FROM (VALUES
  ('GDPR','Regulatory'),
  ('HIPAA','Regulatory'),
  ('PCI-DSS','Regulatory'),
  ('SOX','Regulatory'),
  ('CCPA','Regulatory'),
  ('Data Residency (EU)','Regulatory'),
  ('Right to Erasure','Regulatory'),
  ('PII Masking','Security'),
  ('Encryption at Rest','Security'),
  ('Access Control','Security'),
  ('Audit Logging','Security'),
  ('Least Privilege','Security'),
  ('Data Classification','Internal'),
  ('Data Retention (7yr)','Internal'),
  ('Records Management','Internal'),
  ('Third-Party Sharing','Internal'),
  ('ISO 27001','Regulatory'),
  ('NIST CSF','Regulatory'),
  ('Data Masking','Security'),
  ('Tokenization','Security'),
  ('Data Loss Prevention','Security'),
  ('Backup & Recovery','Internal'),
  ('Data Quality SLA','Internal')
) p(name, ptype);

-- ---- entity -> policy assignments, by sensitivity -------------------
-- HIGH: PII Masking + Encryption + Access Control + a regulatory (GDPR/HIPAA/PCI-DSS by hash)
-- MED:  Data Classification + Access Control
-- LOW:  Data Retention (7yr) for ~55% (hash-gated) so governed% is realistic, not 100%
WITH ent AS (
  SELECT "_id" AS eid, "FqdnDisplay" AS fqdn,
         COALESCE("Sensitivity",'LOW') AS sens,
         abs(hashtext("_id")) AS h
  FROM entities_master_demo
),
rules(sens, policy_name) AS (VALUES
  ('HIGH','PII Masking'),('HIGH','Encryption at Rest'),('HIGH','Access Control'),('HIGH','Data Masking'),('HIGH','Data Loss Prevention'),
  ('MEDIUM','Data Classification'),('MEDIUM','Access Control'),('MEDIUM','Audit Logging'),
  ('LOW','Data Retention (7yr)')
),
assigned AS (
  -- rule-based assignments
  SELECT e.eid, 'DEMO-POL-'||md5(r.policy_name) AS pid, e.fqdn
  FROM ent e JOIN rules r ON r.sens = e.sens
  WHERE NOT (r.sens='LOW' AND e.h % 100 >= 55)
  UNION
  -- one rotating regulatory policy per HIGH entity (widened set)
  SELECT e.eid,
         'DEMO-POL-'||md5((ARRAY['GDPR','HIPAA','PCI-DSS','SOX','CCPA','ISO 27001','NIST CSF'])[1 + e.h % 7]),
         e.fqdn
  FROM ent e WHERE e.sens='HIGH'
  UNION
  -- backup & recovery on a ~35% hash-gated share of LOW (adds an Internal-policy spread without 100% governing)
  SELECT e.eid, 'DEMO-POL-'||md5('Backup & Recovery'), e.fqdn
  FROM ent e WHERE e.sens='LOW' AND e.h % 100 < 35
)
INSERT INTO entities_policies_view_demo ("EntityId","PolicyId","FqdnDisplay")
SELECT eid, pid, fqdn FROM assigned;

SELECT 'demo_policies' k, count(*) v FROM policies_summary_view_demo
UNION ALL SELECT 'demo_assignments', count(*) FROM entities_policies_view_demo
UNION ALL SELECT 'demo_governed_entities', count(DISTINCT "EntityId") FROM entities_policies_view_demo
ORDER BY 1;
