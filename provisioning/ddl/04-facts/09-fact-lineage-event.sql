DROP MATERIALIZED VIEW IF EXISTS fact_lineage_event CASCADE;
CREATE MATERIALIZED VIEW fact_lineage_event AS
SELECT
    md5(lower(trim(e.event_nk)))                                AS lineage_event_nk,

    md5(lower(trim(COALESCE(NULLIF(TRIM(e.event_type), ''), 'UNKNOWN'))))
                                                                AS event_type_key,
    md5(
        lower(trim(COALESCE(NULLIF(TRIM(e.integration),    ''), 'Unknown'))) || '|' ||
        lower(trim(COALESCE(NULLIF(TRIM(e.job_type),       ''), 'Unknown'))) || '|' ||
        lower(trim(COALESCE(NULLIF(TRIM(e.job_name),       ''), 'Unknown Job'))) || '|' ||
        lower(trim(COALESCE(NULLIF(TRIM(e.processing_type),''), 'Unknown')))
    )                                                           AS lineage_job_key,

    COALESCE(TO_CHAR(e.event_date, 'YYYYMMDD')::INT, 19000101) AS event_date_key,

    e.run_id,
    e.in_namespace,
    e.out_namespace,

    -- Parent run / job hierarchy (from OpenLineage parent facet).
    -- Lets reports group child transformations under their parent job.
    e.parent_run_id,
    COALESCE(NULLIF(TRIM(e.parent_job_name),  ''), '(no parent)') AS parent_job_name,
    COALESCE(NULLIF(TRIM(e.parent_namespace), ''), '(no parent)') AS parent_namespace,

    1                                                           AS event_count,
    COALESCE(e.input_count,  0)                                 AS input_count,
    COALESCE(e.output_count, 0)                                 AS output_count,

    -- Row volumes from OL outputStatistics / inputStatistics facets
    COALESCE(e.record_count, 0)::BIGINT                         AS record_count,
    COALESCE(e.input_rows,   0)::BIGINT                         AS input_rows,
    COALESCE(e.output_rows,  0)::BIGINT                         AS output_rows,

    -- Byte volumes
    COALESCE(e.input_bytes,  0)::BIGINT                         AS input_bytes,
    COALESCE(e.output_bytes, 0)::BIGINT                         AS output_bytes,

    -- Run-lifecycle counters for reliability measures (success/failure rate, etc.)
    CASE WHEN upper(e.event_type) = 'START'    THEN 1 ELSE 0 END AS started_count,
    CASE WHEN upper(e.event_type) = 'COMPLETE' THEN 1 ELSE 0 END AS completed_count,
    CASE WHEN upper(e.event_type) = 'FAIL'     THEN 1 ELSE 0 END AS failed_count,
    CASE WHEN upper(e.event_type) = 'ABORT'    THEN 1 ELSE 0 END AS aborted_count,
    CASE WHEN upper(e.event_type) IN ('COMPLETE','FAIL','ABORT') THEN 1 ELSE 0 END AS terminal_count

FROM v_stg_lineage_event e;

CREATE UNIQUE INDEX idx_fle_nk          ON fact_lineage_event (lineage_event_nk);
CREATE        INDEX idx_fle_event_type  ON fact_lineage_event (event_type_key);
CREATE        INDEX idx_fle_lineage_job ON fact_lineage_event (lineage_job_key);
CREATE        INDEX idx_fle_event_date  ON fact_lineage_event (event_date_key);
CREATE        INDEX idx_fle_parent_run  ON fact_lineage_event (parent_run_id);
CREATE        INDEX idx_fle_parent_job  ON fact_lineage_event (parent_job_name);
