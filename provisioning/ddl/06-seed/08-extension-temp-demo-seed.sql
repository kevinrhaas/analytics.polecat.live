-- =====================================================================
-- 06-seed / 08-extension-temp-demo-seed.sql
-- Synthetic UNSTRUCTURED demo: monthly file-extension counts + temperature (Hot/Warm/Cold)
-- counts per data source, over the last ~16 months with growth toward recent. Written to
-- the durable overlay tables UNIONed via v_entities_extension_count /
-- v_entities_temperature_count. Drives Files-by-Extension, File-Type Treemap, Scan-Volume
-- Trend, FILE EXTENSIONS / FILES SCANNED KPIs, Data Temperature + Temperature Trend.
-- DataSourceFqdnId matches the unstructured demo data-source ids so it joins dim_datasource.
-- Idempotent. After running, REFRESH fact_extension_daily + fact_temperature_daily.
-- =====================================================================
\set ON_ERROR_STOP on
\if :{?BIDB_EXT_SCHEMA_NAME}
\else
\set BIDB_EXT_SCHEMA_NAME 'bidb_ext_dev'
\endif
SET search_path TO :"BIDB_EXT_SCHEMA_NAME", public;
SET statement_timeout = '300s';

TRUNCATE entities_extension_count_view_demo;
TRUNCATE entities_temperature_count_view_demo;

-- file-extension counts: 2 sources x 10 extensions x 16 monthly snapshots (grows recent)
INSERT INTO entities_extension_count_view_demo ("_id","Date","DataSourceFqdnId","Extension","FileCount")
SELECT 'DEMO-EXT-'||md5(ds||ext||mo::text),
       (date_trunc('month', now()) - (mo || ' months')::interval + interval '14 days'),
       ds, ext,
       GREATEST(15, ((320 - mo*16) * (60 + abs(hashtext(ds||ext||mo::text)) % 90) / 100))::int
FROM (VALUES ('demo-s3-lake'),('demo-az-docs')) d(ds)
CROSS JOIN (VALUES ('parquet'),('csv'),('json'),('xlsx'),('pdf'),('log'),('avro'),('txt'),('orc'),('png')) e(ext)
CROSS JOIN generate_series(0,15) mo;

-- temperature counts: cold-heavy, with a trend
INSERT INTO entities_temperature_count_view_demo ("_id","Date","DataSourceFqdnId","Temperature","FileCount")
SELECT 'DEMO-TMP-'||md5(ds||temp||mo::text),
       (date_trunc('month', now()) - (mo || ' months')::interval + interval '14 days'),
       ds, temp,
       (base * (60 + abs(hashtext(ds||temp||mo::text)) % 80) / 100)::int
FROM (VALUES ('demo-s3-lake'),('demo-az-docs')) d(ds)
CROSS JOIN (VALUES ('Hot',180),('Warm',430),('Cold',920)) t(temp, base)
CROSS JOIN generate_series(0,15) mo;

SELECT 'demo_extension_rows' k, count(*) v, SUM("FileCount") files FROM entities_extension_count_view_demo
UNION ALL SELECT 'demo_temperature_rows', count(*), SUM("FileCount") FROM entities_temperature_count_view_demo
ORDER BY 1;
