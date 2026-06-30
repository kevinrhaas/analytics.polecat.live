DROP MATERIALIZED VIEW IF EXISTS dim_lineage_job CASCADE;
CREATE MATERIALIZED VIEW dim_lineage_job AS
WITH jobs AS (
    SELECT DISTINCT
        COALESCE(NULLIF(TRIM(integration),    ''), 'Unknown')     AS integration,
        COALESCE(NULLIF(TRIM(job_type),       ''), 'Unknown')     AS job_type,
        COALESCE(NULLIF(TRIM(job_name),       ''), 'Unknown Job') AS job_name,
        COALESCE(NULLIF(TRIM(processing_type),''), 'Unknown')     AS processing_type
    FROM v_stg_lineage_event
    UNION ALL
    SELECT 'Unknown', 'Unknown', 'Unknown Job', 'Unknown'
)
SELECT
    md5(
        lower(trim(integration))      || '|' ||
        lower(trim(job_type))         || '|' ||
        lower(trim(job_name))         || '|' ||
        lower(trim(processing_type))
    )                   AS lineage_job_key,
    integration,
    job_type,
    job_name,
    processing_type
FROM jobs;

CREATE UNIQUE INDEX idx_dlj_key         ON dim_lineage_job (lineage_job_key);
CREATE        INDEX idx_dlj_integration ON dim_lineage_job (integration);
CREATE        INDEX idx_dlj_job_type    ON dim_lineage_job (job_type);
CREATE        INDEX idx_dlj_job_name    ON dim_lineage_job (job_name);
