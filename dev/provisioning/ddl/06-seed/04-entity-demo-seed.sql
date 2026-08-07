-- =====================================================================
-- 06-seed / 04-entity-demo-seed.sql
-- DURABLE synthetic demo CATALOG for the entity-side dashboards.
--
-- Writes ONLY to the persistent overlay table entities_master_demo (created by
-- 01-setup/06-entity-demo-tables.sql). That table is UNIONed into the catalog via
-- v_entities_master (02-staging/02-v-entities-master.sql), which every entity dim/fact
-- reads -- so this demo data SURVIVES the FDW re-import + DDL rebuild and keeps the
-- dashboards rich no matter how sparse the live PDC source (241) is.
--
-- WHY: 241's real catalog is thin (~770 entities, only POSTGRES/AWS, NO sensitivity,
-- no terms/apps/policies). This generates a realistic multi-platform estate with the
-- variety the dashboards need: 10 data sources, structured (schema.table.column) AND
-- unstructured (path) assets, a HIGH/MEDIUM/LOW sensitivity mix, profiling stats,
-- key flags, sizes, owners and lifecycle timestamps. Deterministic (hashtext-seeded);
-- idempotent (TRUNCATE + regenerate).
--
-- After running: REFRESH mv_stg_entity_term, then the entity dims/facts (or re-run
-- 05-refresh/01-refresh-all.sql) + clear caches.
-- =====================================================================
\set ON_ERROR_STOP on
\if :{?BIDB_EXT_SCHEMA_NAME}
\else
\set BIDB_EXT_SCHEMA_NAME 'bidb_ext_dev'
\endif
SET search_path TO :"BIDB_EXT_SCHEMA_NAME", public;
SET statement_timeout = '300s';

TRUNCATE entities_master_demo;

-- ---- structured estate: data source x schema x table x column ----------------
WITH src(ds_id, ds_name, ds_type, host) AS (VALUES
  ('demo-pg-prod',     'prod-postgres',        'POSTGRES',            'pg-prod.internal'),
  ('demo-sf-analytics','analytics-snowflake',  'SNOWFLAKE',           'acme.snowflakecomputing.com'),
  ('demo-mssql-crm',   'crm-sqlserver',        'MSSQL',               'crm-sql.internal'),
  ('demo-ora-fin',     'finance-oracle',       'ORACLE',              'fin-ora.internal'),
  ('demo-mysql-app',   'app-mysql',            'MYSQL',               'app-mysql.internal'),
  ('demo-bq-mkt',      'marketing-bigquery',   'BIGQUERY',            'bigquery.googleapis.com'),
  ('demo-rs-dw',       'enterprise-redshift',  'REDSHIFT',            'dw.redshift.amazonaws.com'),
  ('demo-dbx-lake',    'lakehouse-databricks', 'DATABRICKS',          'dbx.cloud.databricks.com'),
  ('demo-td-edw',      'edw-teradata',         'TERADATA',            'teradata.internal'),
  ('demo-kafka-stream','streaming-kafka',      'KAFKA',               'kafka.internal:9092')
),
-- per-source PERSONA so every by-source chart varies coherently (moderate spread, ~5x):
--   sz   = size multiplier (storage/cost),  ntbl = tables/source (entity count + storage),
--   comp = metadata-completeness target % (gates optional fields),  sens = sensitivity skew (hi/md/lo/bal)
prof(ds_id, sz, ntbl, comp, sens) AS (VALUES
  ('demo-rs-dw',      2.1, 9, 95, 'bal'),   -- enterprise Redshift EDW: flagship, large, well-run
  ('demo-sf-analytics',1.8, 8, 90, 'bal'),  -- Snowflake analytics: large, modern, well-governed
  ('demo-ora-fin',    1.45,7, 88, 'hi'),    -- Oracle finance: regulated, HIGH-sensitivity heavy
  ('demo-dbx-lake',   1.5, 7, 58, 'bal'),   -- Databricks lakehouse: big but less curated
  ('demo-pg-prod',    1.15,6, 80, 'bal'),   -- Postgres prod OLTP: solid
  ('demo-td-edw',     1.05,6, 52, 'lo'),    -- legacy Teradata: aging, thin metadata
  ('demo-mssql-crm',  1.0, 6, 76, 'md'),    -- SQL Server CRM: PII-heavy, decent
  ('demo-bq-mkt',     1.0, 5, 64, 'md'),    -- BigQuery marketing: medium, mixed
  ('demo-mysql-app',  0.9, 5, 48, 'lo'),    -- small app MySQL: small, mediocre
  ('demo-kafka-stream',0.95,5, 34, 'lo')    -- Kafka streaming: sparse metadata, low governance, low sens
),
sch(schema_name) AS (VALUES ('sales'),('finance'),('hr'),('marketing'),('customer'),('billing'),('operations'),('product')),
tbl(table_name) AS (VALUES ('customers'),('orders'),('payments'),('invoices'),('employees'),
                           ('products'),('transactions'),('accounts'),('sessions'),('shipments')),
-- column dictionary with intrinsic sensitivity + key role
col(col_name, data_type, sens, is_pk, is_fk) AS (VALUES
  ('id','bigint','LOW',true,false),
  ('account_no','varchar','HIGH',false,false),
  ('ssn','varchar','HIGH',false,false),
  ('credit_card','varchar','HIGH',false,false),
  ('salary','numeric','HIGH',false,false),
  ('email','varchar','MEDIUM',false,false),
  ('phone','varchar','MEDIUM',false,false),
  ('home_address','varchar','MEDIUM',false,false),
  ('date_of_birth','date','MEDIUM',false,false),
  ('customer_id','bigint','LOW',false,true),
  ('amount','numeric','LOW',false,false),
  ('status','varchar','LOW',false,false),
  ('created_at','timestamp','LOW',false,false),
  ('product_code','varchar','LOW',false,false),
  ('passport_no','varchar','HIGH',false,false),
  ('tax_id','varchar','HIGH',false,false),
  ('ip_address','varchar','MEDIUM',false,false),
  ('first_name','varchar','MEDIUM',false,false),
  ('last_name','varchar','MEDIUM',false,false),
  ('region','varchar','LOW',false,false)
),
cols AS ( SELECT *, row_number() OVER () AS col_ord FROM col ),
-- pick ~5 schemas and ~6 tables per source deterministically (volume control)
grid AS (
  SELECT s.*, p.sz AS p_sz, p.comp AS p_comp, p.sens AS p_sens,
         sc.schema_name, t.table_name, c.*,
         (s.ds_id||'.'||sc.schema_name||'.'||t.table_name||'.'||c.col_name) AS fqdn
  FROM src s
  JOIN prof p ON p.ds_id = s.ds_id
  JOIN LATERAL (SELECT schema_name FROM sch ORDER BY hashtext(s.ds_id||schema_name) LIMIT 5) sc ON true
  JOIN LATERAL (SELECT table_name  FROM tbl ORDER BY hashtext(s.ds_id||sc.schema_name||table_name) LIMIT p.ntbl) t ON true
  CROSS JOIN cols c
),
calc AS (
  SELECT g.*,
         abs(hashtext(fqdn))            AS h,
         abs(hashtext(fqdn||'r'))       AS hr,
         abs(hashtext(fqdn||'m'))       AS hm,
         (s_rows) AS dummy
  FROM grid g, LATERAL (SELECT 1 s_rows) z
)
INSERT INTO entities_master_demo
  ("_id","Name","Type","ResourceType","FqdnDisplay",
   "DataSourceId","DataSourceName","DataSourceType",
   "DataSourceCostPerTbCurrency","DataSourceCostPerTbPrice","CostPerTbFrequency",
   "SchemaName","DatabaseName","TableName","DataType",
   "Owner","Group","OwnerEmail","OwnerFirstName","OwnerLastName",
   "RowCount","NullCount","BlankCount","Cardinality","Hll","ColumnsCount",
   "MinWidth","MaxWidth","AvgWidth","Size",
   "IsPrimaryKey","IsForeignKey","IsNullable","OrdinalPosition","DataProfileStatus","DataProfiled",
   "Sensitivity","Selectivity","Uniqueness","Density",
   "CreatedAt","ModifiedAt","AccessedAt","ScannedAt","LastUpdate","LastUpdateStatistics")
SELECT
  'DEMO-COL-'||md5(fqdn)                              AS "_id",
  col_name                                            AS "Name",
  'COLUMN'                                            AS "Type",
  'Structured'                                        AS "ResourceType",
  fqdn                                                AS "FqdnDisplay",
  ds_id, ds_name, ds_type,
  'USD',
  (40 + (h % 260))::int                               AS "DataSourceCostPerTbPrice",
  'monthly',
  schema_name, ds_name, table_name, data_type,
  -- completeness-gated optional fields: a low-comp source leaves owner/group/dates NULL more often
  CASE WHEN (h % 100) < p_comp THEN (ARRAY['dwh_team','platform','analytics','app_eng','finance_ops'])[1 + (h % 5)] ELSE NULL END  AS "Owner",
  CASE WHEN (hr % 100) < p_comp THEN 'data-engineering' ELSE NULL END,
  NULL,
  (ARRAY['Ava','Liam','Noah','Mia','Ethan','Zoe'])[1 + (h % 6)]                        AS "OwnerFirstName",
  (ARRAY['Patel','Nguyen','Garcia','Khan','Smith','Rossi'])[1 + (hr % 6)]              AS "OwnerLastName",
  (10000 + (h % 4000000))::bigint                     AS "RowCount",
  ((h % 18) * (10000 + (h % 4000000)) / 100)::bigint  AS "NullCount",
  ((hr % 6) * (10000 + (h % 4000000)) / 100)::bigint  AS "BlankCount",
  (1 + (h % 500000))::bigint                          AS "Cardinality",
  (1 + (h % 500000))::bigint                          AS "Hll",
  1                                                   AS "ColumnsCount",
  (1 + (hr % 8))::int                                 AS "MinWidth",
  (16 + (hr % 240))::int                              AS "MaxWidth",
  (8 + (hr % 64))::numeric                            AS "AvgWidth",
  (((h % 2000) * 1024::bigint * 1024 * 1024) * p_sz)::bigint   AS "Size",
  is_pk, is_fk,
  NOT is_pk                                           AS "IsNullable",
  col_ord::int                                        AS "OrdinalPosition",
  'COMPLETE', 'true',
  -- intrinsic column sensitivity, then skewed by the source persona (hi/lo shift the mix)
  CASE p_sens
    WHEN 'hi' THEN CASE sens WHEN 'HIGH' THEN 'HIGH'
                             WHEN 'MEDIUM' THEN (CASE WHEN h%100<50 THEN 'HIGH' ELSE 'MEDIUM' END)
                             ELSE (CASE WHEN h%100<30 THEN 'MEDIUM' ELSE 'LOW' END) END
    WHEN 'lo' THEN CASE sens WHEN 'HIGH' THEN (CASE WHEN h%100<55 THEN 'MEDIUM' ELSE 'HIGH' END)
                             WHEN 'MEDIUM' THEN (CASE WHEN h%100<55 THEN 'LOW' ELSE 'MEDIUM' END)
                             ELSE (ARRAY['LOW','LOW','LOW',NULL,NULL])[1 + (h % 5)] END
    ELSE CASE sens WHEN 'HIGH' THEN 'HIGH' WHEN 'MEDIUM' THEN 'MEDIUM'
                   ELSE (ARRAY['LOW','LOW','LOW',NULL])[1 + (h % 4)] END
  END                                                  AS "Sensitivity",
  ((h % 100)/100.0)::double precision                 AS "Selectivity",
  ((hr % 100)/100.0)::double precision                AS "Uniqueness",
  ((h % 80 + 20)/100.0)::double precision             AS "Density",
  -- wide, realistic lifecycle: created long ago; modified/accessed spread; scanned biased
  -- recent over ~18 months (so the growth trend climbs) but with a real stale/cold tail.
  (now() - ((1100 + h % 600) || ' days')::interval)                                            AS "CreatedAt",
  CASE WHEN (hm % 100) < p_comp THEN (now() - ((h % 730) || ' days')::interval) END            AS "ModifiedAt",
  CASE WHEN ((h/7) % 100) < p_comp THEN (now() - ((hr % 1000) || ' days')::interval) END       AS "AccessedAt",
  (now() - ((FLOOR(540 * power((h % 1000)::numeric/1000.0, 3))::int) || ' days')::interval)    AS "ScannedAt",
  CASE WHEN ((hr/7) % 100) < p_comp THEN (now() - ((h % 730) || ' days')::interval) END        AS "LastUpdate",
  CASE WHEN ((hm/7) % 100) < p_comp THEN (now() - ((FLOOR(540 * power((hr % 1000)::numeric/1000.0, 3))::int) || ' days')::interval) END   AS "LastUpdateStatistics"
FROM calc;

-- ---- one TABLE-grain row per distinct schema.table (rollup parents) ----------
INSERT INTO entities_master_demo
  ("_id","Name","Type","ResourceType","FqdnDisplay","DataSourceId","DataSourceName","DataSourceType",
   "SchemaName","DatabaseName","TableName","Owner","Group","ColumnsCount","RowCount","Size",
   "DataProfileStatus","DataProfiled","Sensitivity","ScannedAt","CreatedAt","ModifiedAt","AccessedAt")
SELECT 'DEMO-TBL-'||md5(d."DataSourceId"||d."SchemaName"||d."TableName"),
       d."TableName",'TABLE','Structured',
       d."DataSourceId"||'.'||d."SchemaName"||'.'||d."TableName",
       d."DataSourceId", d."DataSourceName", d."DataSourceType",
       d."SchemaName", d."DatabaseName", d."TableName",
       max(d."Owner"), 'data-engineering', count(*)::int, max(d."RowCount"), sum(d."Size"),
       'COMPLETE','true',
       CASE WHEN bool_or(d."Sensitivity"='HIGH') THEN 'HIGH'
            WHEN bool_or(d."Sensitivity"='MEDIUM') THEN 'MEDIUM' ELSE 'LOW' END,
       max(d."ScannedAt"), min(d."CreatedAt"), max(d."ModifiedAt"), max(d."AccessedAt")
FROM entities_master_demo d
WHERE d."Type"='COLUMN'
GROUP BY d."DataSourceId", d."DataSourceName", d."DataSourceType", d."SchemaName", d."DatabaseName", d."TableName";

-- ---- unstructured estate: data-lake files across folders --------------------
WITH usrc(ds_id, ds_name, ds_type, root, sz, comp) AS (VALUES
  ('demo-s3-lake',  'data-lake-s3',      'AWS',                's3://acme-data-lake',                                  0.50, 45),  -- raw lake: big, low curation
  ('demo-az-docs',  'corp-azure-blob',   'AZURE_BLOB_STORAGE', 'https://acmecorp.blob.core.windows.net/docs',          0.40, 62),  -- corp docs: medium
  ('demo-gcs-lake', 'analytics-gcs',     'GCS',                'gs://acme-analytics-lake',                             0.45, 55)   -- analytics lake: medium-big
),
zone(zone_name) AS (VALUES ('raw'),('curated'),('sandbox'),('archive'),('reports'),('exports')),
dom(domain) AS (VALUES ('sales'),('finance'),('hr'),('marketing'),('clickstream'),('payments')),
ext(file_ext, file_type, base_sens) AS (VALUES
  ('parquet','parquet','LOW'),('csv','csv','MEDIUM'),('json','json','LOW'),
  ('xlsx','excel','MEDIUM'),('pdf','pdf','MEDIUM'),('log','log','LOW')),
ufiles AS (
  SELECT u.*, z.zone_name, dm.domain, e.*, gs AS fno,
         (u.root||'/'||z.zone_name||'/'||dm.domain||'/part-'||lpad(gs::text,4,'0')||'.'||e.file_ext) AS path
  FROM usrc u
  CROSS JOIN zone z CROSS JOIN dom dm CROSS JOIN ext e
  CROSS JOIN generate_series(1,6) gs
)
INSERT INTO entities_master_demo
  ("_id","Name","Type","ResourceType","FqdnDisplay","DataSourceId","DataSourceName","DataSourceType",
   "Path","ParentPath","PathType","FileExtension","FileType","PhysicalLocation",
   "Owner","Group","Size","ColumnsCount","DataProfileStatus","DataProfiled","Sensitivity",
   "CreatedAt","ModifiedAt","AccessedAt","ScannedAt")
SELECT 'DEMO-FILE-'||md5(path),
       'part-'||lpad(fno::text,4,'0')||'.'||file_ext, 'FILE','Unstructured',
       replace(replace(replace(path,'://','/'),'/','.'),'.','.'),   -- nominal fqdn
       ds_id, ds_name, ds_type,
       zone_name||'/'||domain||'/part-'||lpad(fno::text,4,'0')||'.'||file_ext,
       zone_name||'/'||domain, 'file', file_ext, file_type, path,
       CASE WHEN (abs(hashtext(path)) % 100) < comp THEN (ARRAY['dwh_team','platform','analytics','app_eng'])[1 + (abs(hashtext(path)) % 4)] ELSE NULL END,
       CASE WHEN (abs(hashtext(path||'g')) % 100) < comp THEN 'data-engineering' ELSE NULL END,
       (((abs(hashtext(path)) % 5000) * 1024::bigint*1024*1024) * sz)::bigint, 0,
       'COMPLETE','true',
       CASE WHEN domain IN ('finance','hr','payments') THEN base_sens
            WHEN base_sens='LOW' THEN (ARRAY['LOW','LOW',NULL])[1+(abs(hashtext(path))%3)] ELSE base_sens END,
       (now() - ((1100 + abs(hashtext(path)) % 600)||' days')::interval),
       CASE WHEN (abs(hashtext(path||'m')) % 100) < comp THEN (now() - ((abs(hashtext(path)) % 730)||' days')::interval) END,
       CASE WHEN (abs(hashtext(path||'ac')) % 100) < comp THEN (now() - ((abs(hashtext(path||'a')) % 1000)||' days')::interval) END,
       (now() - ((FLOOR(540 * power((abs(hashtext(path||'s')) % 1000)::numeric/1000.0, 3))::int)||' days')::interval)
FROM ufiles;

SELECT 'demo_entities_total' k, count(*) v FROM entities_master_demo
UNION ALL SELECT 'demo_columns', count(*) FROM entities_master_demo WHERE "Type"='COLUMN'
UNION ALL SELECT 'demo_tables',  count(*) FROM entities_master_demo WHERE "Type"='TABLE'
UNION ALL SELECT 'demo_files',   count(*) FROM entities_master_demo WHERE "Type"='FILE'
UNION ALL SELECT 'demo_HIGH_sens', count(*) FROM entities_master_demo WHERE "Sensitivity"='HIGH'
UNION ALL SELECT 'demo_distinct_datasources', count(DISTINCT "DataSourceName") FROM entities_master_demo
ORDER BY 1;
