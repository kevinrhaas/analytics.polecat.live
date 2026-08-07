-- =====================================================================
-- 06-seed / 01-lineage-demo-seed.sql
-- DURABLE demo data for the lineage analytics suite.
--
-- Writes ONLY to the persistent overlay tables stg_lineage_event_demo /
-- stg_lineage_connection_demo (created by 01-setup/05-lineage-demo-tables.sql).
-- These are UNIONed into the lineage MVs via v_stg_lineage_* views, so the
-- demo SURVIVES the lineage ETL's truncate-reload of the real staging tables.
--
-- Idempotent: TRUNCATE + re-INSERT. After running, refresh the lineage MVs
-- (06-seed/02-refresh-lineage-mvs.sql) and the Mondrian cache.
--
-- Generates a realistic multi-platform estate: 7 integrations, volume/byte
-- trends (throughput), a reliability mix (COMPLETE/FAIL/ABORT), parent/child
-- orchestration, and a governance subset (sensitive sources -> ungoverned
-- targets). Sensitivity is classified downstream in dim_lineage_endpoint.
-- =====================================================================
\set ON_ERROR_STOP on
\if :{?BIDB_EXT_SCHEMA_NAME}
\else
\set BIDB_EXT_SCHEMA_NAME 'bidb_ext_dev'
\endif
SET search_path TO :"BIDB_EXT_SCHEMA_NAME", public;
SET statement_timeout = '300s';

TRUNCATE stg_lineage_event_demo;
TRUNCATE stg_lineage_connection_demo;

DROP TABLE IF EXISTS _seed_runs;
CREATE TEMP TABLE _seed_runs AS
WITH jobs(jno, integ, integ_abbr, job_type, proc_type, job_name,
          src_ns, src_name, dest_ns, dest_name,
          base_krows, cadence, fail_pct, abort_pct, parent_job, parent_ns) AS (VALUES
  (1,'Fivetran','FT','connector','STREAMING','salesforce_accounts_sync','fivetran://salesforce','salesforce.accounts','s3://raw-zone','raw.salesforce_accounts', 1200, 3, 4, 1, NULL,NULL),
  (2,'Fivetran','FT','connector','STREAMING','stripe_payments_sync','fivetran://stripe','stripe.payments_pci','s3://raw-zone','raw.stripe_payments_pci', 800, 2, 6, 1, NULL,NULL),
  (3,'Fivetran','FT','connector','BATCH','zendesk_tickets_sync','fivetran://zendesk','zendesk.tickets','s3://raw-zone','raw.zendesk_tickets', 300, 7, 3, 0, NULL,NULL),
  (4,'Fivetran','FT','connector','BATCH','workday_hr_sync','fivetran://workday','workday.employees_ssn','s3://raw-zone','raw.workday_employees_ssn', 90, 14, 2, 0, NULL,NULL),
  (5,'Kafka Connect','KC','connector','STREAMING','clickstream_ingest','kafka://events','events.clickstream','s3://raw-zone','raw.clickstream', 50000, 2, 7, 2, NULL,NULL),
  (6,'Kafka Connect','KC','connector','STREAMING','orders_cdc','kafka://oltp-cdc','oltp.orders','s3://raw-zone','raw.orders_cdc', 9000, 2, 5, 1, NULL,NULL),
  (7,'Kafka Connect','KC','connector','STREAMING','user_events_pii','kafka://events','events.user_emails','s3://raw-zone','raw.user_events_pii', 30000, 2, 6, 2, NULL,NULL),
  (8,'Apache Spark','SP','application','BATCH','curate_orders','s3://raw-zone','raw.orders_cdc','s3://curated','curated.orders', 9000, 3, 5, 1, NULL,NULL),
  (9,'Apache Spark','SP','application','BATCH','sessionize_clickstream','s3://raw-zone','raw.clickstream','s3://curated','curated.sessions', 50000, 3, 8, 2, NULL,NULL),
  (10,'Apache Spark','SP','application','BATCH','enrich_customers_pii','crm://prod','crm.customers_pii','s3://curated','curated.customers_360', 1500, 5, 4, 1, NULL,NULL),
  (11,'Apache Spark','SP','application','BATCH','ml_feature_export','s3://curated','curated.customers_360','s3://sandbox','sandbox.ds_features_pii', 1500, 7, 6, 1, NULL,NULL),
  (12,'dbt','DBT','model','BATCH','stg_orders','s3://curated','curated.orders','snowflake://warehouse','analytics.stg_orders', 9000, 1, 3, 0, 'dbt_daily_run','dbt://cloud'),
  (13,'dbt','DBT','model','BATCH','fct_revenue','snowflake://warehouse','analytics.stg_orders','snowflake://warehouse','analytics.fct_revenue', 9000, 1, 4, 0, 'dbt_daily_run','dbt://cloud'),
  (14,'dbt','DBT','model','BATCH','dim_customer','s3://curated','curated.customers_360','snowflake://warehouse','analytics.dim_customer', 1500, 1, 3, 0, 'dbt_daily_run','dbt://cloud'),
  (15,'dbt','DBT','model','BATCH','mart_finance','snowflake://warehouse','analytics.fct_revenue','snowflake://warehouse','marts.finance_summary', 1200, 1, 2, 0, 'dbt_daily_run','dbt://cloud'),
  (16,'dbt','DBT','model','BATCH','mart_customer_export','snowflake://warehouse','analytics.dim_customer','external_share','external.partner_feed_pii', 400, 7, 5, 1, 'dbt_weekly_run','dbt://cloud'),
  (17,'Apache Airflow','AF','dag','BATCH','load_reporting_bigquery','snowflake://warehouse','marts.finance_summary','bigquery://reporting','reporting.finance_daily', 1200, 1, 4, 1, 'platform_orchestrator','airflow://prod'),
  (18,'Apache Airflow','AF','dag','BATCH','reverse_etl_salesforce','snowflake://warehouse','analytics.dim_customer','salesforce://prod','salesforce.customer_scores', 800, 2, 6, 1, 'platform_orchestrator','airflow://prod'),
  (19,'Apache Airflow','AF','dag','BATCH','adhoc_analyst_extract','snowflake://warehouse','analytics.fct_revenue','adhoc://personal','adhoc.analyst_dump', 2000, 5, 9, 3, 'platform_orchestrator','airflow://prod'),
  (20,'Apache Airflow','AF','dag','BATCH','gdpr_export_health','health://ehr','health.patient_phi','external_share','external.research_extract_phi', 60, 14, 7, 2, 'platform_orchestrator','airflow://prod'),
  (21,'Snowflake Tasks','SF','task','STREAMING','refresh_revenue_rollup','snowflake://warehouse','analytics.fct_revenue','snowflake://warehouse','reporting.revenue_rollup', 1200, 1, 2, 0, NULL,NULL),
  (22,'Snowflake Tasks','SF','task','STREAMING','refresh_customer_360','snowflake://warehouse','analytics.dim_customer','snowflake://warehouse','reporting.customer_360', 1500, 2, 3, 0, NULL,NULL),
  (23,'Snowflake Tasks','SF','task','STREAMING','aggregate_sessions','s3://curated','curated.sessions','snowflake://warehouse','analytics.session_daily', 50000, 1, 4, 1, NULL,NULL),
  (24,'PDI','PDI','transformation','BATCH','t_load_payments_dwh','s3://raw-zone','raw.stripe_payments_pci','postgres://dwh','dwh.payments_pci', 800, 2, 5, 1, 'j_finance_nightly','pdi://server'),
  (25,'PDI','PDI','transformation','BATCH','t_load_hr_dwh','s3://raw-zone','raw.workday_employees_ssn','postgres://dwh','dwh.employees_ssn', 90, 7, 4, 0, 'j_hr_nightly','pdi://server'),
  (26,'PDI','PDI','transformation','BATCH','t_build_sales_fact','s3://curated','curated.orders','postgres://dwh','dwh.fact_sales', 12000, 1, 4, 1, 'j_nightly_dwh','pdi://server'),
  (27,'PDI','PDI','transformation','BATCH','t_build_customer_dim','s3://curated','curated.customers_360','postgres://dwh','dwh.dim_customer', 1800, 1, 3, 0, 'j_nightly_dwh','pdi://server'),
  (28,'PDI','PDI','transformation','BATCH','t_load_inventory','mysql://erp','erp.inventory','postgres://dwh','dwh.fact_inventory', 6000, 2, 5, 1, 'j_nightly_dwh','pdi://server'),
  (29,'PDI','PDI','job','BATCH','t_aggregate_marketing','s3://raw-zone','raw.clickstream','postgres://dwh','dwh.mart_marketing', 40000, 2, 6, 2, 'j_nightly_dwh','pdi://server'),
  (30,'PDI','PDI','transformation','BATCH','t_export_finance_report','postgres://dwh','dwh.fact_sales','bigquery://reporting','reporting.finance_pdi', 9000, 1, 3, 0, 'j_finance_nightly','pdi://server')
),
gen AS (
  SELECT j.*, gs::date AS run_date,
         (j.integ_abbr || '-' || lpad(j.jno::text,2,'0') || '-' || to_char(gs,'YYYYMMDD')) AS run_key
  FROM jobs j
  CROSS JOIN LATERAL generate_series(DATE '2025-07-17', DATE '2026-06-13', (j.cadence || ' days')::interval) gs
),
runs AS (
  SELECT g.*,
         'SEED:' || run_key AS run_id,
         (EXTRACT(YEAR FROM run_date)::int - 2025) * 12 + EXTRACT(MONTH FROM run_date)::int - 7 AS months_since,
         (abs(hashtext(run_key)) % 100) AS roll,
         (60 + abs(hashtext(run_key || 'b')) % 340) AS row_bytes,
         (1 + abs(hashtext(run_key || 'i')) % 3) AS in_cnt
  FROM gen g
),
runs2 AS (
  SELECT r.*,
         CASE WHEN roll < r.fail_pct THEN 'FAIL'
              WHEN roll < r.fail_pct + r.abort_pct THEN 'ABORT'
              ELSE 'COMPLETE' END AS term_type,
         ( r.base_krows * 1000.0 * (1.0 + 0.05 * GREATEST(0, months_since))
           * (0.55 + (abs(hashtext(run_key || 'v')) % 90) / 100.0) )::bigint AS out_rows
  FROM runs r
)
SELECT *,
       CASE WHEN term_type='COMPLETE' THEN out_rows ELSE 0 END AS final_out_rows,
       CASE WHEN term_type='COMPLETE' THEN (out_rows * (1.0 + (abs(hashtext(run_key||'ir'))%120)/100.0))::bigint
            ELSE (out_rows * (abs(hashtext(run_key||'fr'))%60)/100.0)::bigint END AS final_in_rows
FROM runs2;

-- Events: START + terminal per run
INSERT INTO stg_lineage_event_demo
  (event_nk, event_time, event_type, run_id, job_name, processing_type, integration, job_type,
   in_namespace, in_names, out_namespace, out_names, input_count, output_count, record_count,
   event_date, input_rows, output_rows, input_bytes, output_bytes,
   parent_run_id, parent_job_name, parent_namespace)
SELECT 'SEED-'||run_key||'-START', run_date + time '02:00', 'START', run_id, job_name, proc_type, integ, job_type,
       src_ns, src_name, dest_ns, dest_name, in_cnt, 1, 0, run_date, 0,0,0,0,
       CASE WHEN parent_job IS NOT NULL THEN 'SEED:'||parent_job||':'||to_char(run_date,'YYYYMMDD') END, parent_job, parent_ns
FROM _seed_runs
UNION ALL
SELECT 'SEED-'||run_key||'-END', run_date + time '02:30', term_type, run_id, job_name, proc_type, integ, job_type,
       src_ns, src_name, dest_ns, dest_name, in_cnt, 1, final_out_rows, run_date,
       final_in_rows, final_out_rows, (final_in_rows*row_bytes)::bigint, (final_out_rows*row_bytes)::bigint,
       CASE WHEN parent_job IS NOT NULL THEN 'SEED:'||parent_job||':'||to_char(run_date,'YYYYMMDD') END, parent_job, parent_ns
FROM _seed_runs;

-- Connections: source -> destination for each run
INSERT INTO stg_lineage_connection_demo
  (connection_nk, event_nk, run_id, orig_namespace, orig_name, orig_db, orig_schema, orig_table,
   dest_namespace, dest_name, dest_db, dest_schema, dest_table)
SELECT 'SEEDC-'||run_key, 'SEED-'||run_key||'-END', run_id,
       src_ns,  src_name,  split_part(src_ns,'://',1),  split_part(src_name,'.',1),  COALESCE(NULLIF(split_part(src_name,'.',2),''), split_part(src_name,'.',1)),
       dest_ns, dest_name, split_part(dest_ns,'://',1), split_part(dest_name,'.',1), COALESCE(NULLIF(split_part(dest_name,'.',2),''), split_part(dest_name,'.',1))
FROM _seed_runs;

DROP TABLE _seed_runs;

SELECT 'demo_events' t, count(*) c FROM stg_lineage_event_demo
UNION ALL SELECT 'demo_connections', count(*) FROM stg_lineage_connection_demo
UNION ALL SELECT 'demo_distinct_integration', count(DISTINCT integration) FROM stg_lineage_event_demo
ORDER BY 1;
