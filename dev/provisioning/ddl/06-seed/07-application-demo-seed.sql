-- =====================================================================
-- 06-seed / 07-application-demo-seed.sql
-- Synthetic APPLICATION/ACCESS demo: an application catalog (BI / CRM / ERP / data
-- science / desktop tools) + entity->application access, written to the durable overlay
-- tables UNIONed via v_applications_summary / v_entities_applications. Drives the
-- Application & Access Reach dashboards. Idempotent (TRUNCATE + regenerate). After
-- running, REFRESH dim_application + fact_entity_application.
-- =====================================================================
\set ON_ERROR_STOP on
\if :{?BIDB_EXT_SCHEMA_NAME}
\else
\set BIDB_EXT_SCHEMA_NAME 'bidb_ext_dev'
\endif
SET search_path TO :"BIDB_EXT_SCHEMA_NAME", public;
SET statement_timeout = '300s';

TRUNCATE applications_summary_view_demo;
TRUNCATE entities_applications_view_demo;

-- ---- application catalog (UsersWithAccess = jsonb array, length drives reach) ----
INSERT INTO applications_summary_view_demo ("_id","Name","Type","Parent","Fqdn","UsersWithAccess")
SELECT 'DEMO-APP-'||md5(name), name, atype, atype, 'Applications/'||atype||'/'||name,
       to_jsonb(ARRAY(SELECT 'user'||g FROM generate_series(1, 6 + abs(hashtext(name)) % 45) g))
FROM (VALUES
  ('Tableau','BI'),('Power BI','BI'),('Looker','BI'),('Mode Analytics','BI'),('Snowsight','BI'),
  ('Sigma','BI'),('Metabase','BI'),('Qlik','BI'),('Sisense','BI'),
  ('Salesforce','CRM'),('HubSpot','CRM'),('SAP','ERP'),('NetSuite','ERP'),('Workday','HR'),
  ('Excel','Desktop'),('Jupyter','Data Science'),('Databricks Notebooks','Data Science'),('Hex','Data Science'),
  ('dbt','Transformation'),('Airflow','Transformation'),('Fivetran','Transformation')
) a(name, atype);

-- ---- entity -> application access (1-3 apps per demo entity) ----------------
INSERT INTO entities_applications_view_demo ("EntityId","ApplicationId","FqdnDisplay")
SELECT DISTINCT e."_id",
       'DEMO-APP-'||md5((ARRAY['Tableau','Power BI','Looker','Mode Analytics','Snowsight','Sigma','Metabase','Qlik','Sisense',
                               'Salesforce','HubSpot','Excel','Jupyter','Databricks Notebooks','Hex','dbt','Airflow','Fivetran'])[1 + (abs(hashtext(e."_id"||n::text)) % 18)]),
       e."FqdnDisplay"
FROM entities_master_demo e
CROSS JOIN LATERAL generate_series(1, 1 + abs(hashtext(e."_id")) % 3) n
WHERE e."Type" IN ('COLUMN','TABLE','FILE');

SELECT 'demo_applications' k, count(*) v FROM applications_summary_view_demo
UNION ALL SELECT 'demo_access_events', count(*) FROM entities_applications_view_demo
UNION ALL SELECT 'demo_entities_accessed', count(DISTINCT "EntityId") FROM entities_applications_view_demo
ORDER BY 1;
