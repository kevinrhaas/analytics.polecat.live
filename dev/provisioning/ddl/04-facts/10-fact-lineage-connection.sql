DROP MATERIALIZED VIEW IF EXISTS fact_lineage_connection CASCADE;
CREATE MATERIALIZED VIEW fact_lineage_connection AS
WITH base AS (
    SELECT
        c.connection_nk                                             AS lineage_connection_nk,

        md5(
            lower(trim(COALESCE(NULLIF(TRIM(c.orig_namespace), ''), 'Unknown'))) || '|' ||
            lower(trim(COALESCE(NULLIF(TRIM(c.orig_name),      ''), 'Unknown')))
        )                                                           AS source_endpoint_key,
        md5(
            lower(trim(COALESCE(NULLIF(TRIM(c.dest_namespace), ''), 'Unknown'))) || '|' ||
            lower(trim(COALESCE(NULLIF(TRIM(c.dest_name),      ''), 'Unknown')))
        )                                                           AS dest_endpoint_key,

        md5(lower(trim(COALESCE(NULLIF(TRIM(c.orig_name), ''), 'Unknown'))))
                                                                    AS source_entity_key,
        md5(lower(trim(COALESCE(NULLIF(TRIM(c.dest_name), ''), 'Unknown'))))
                                                                    AS dest_entity_key,

        md5(lower(trim(COALESCE(NULLIF(TRIM(e.event_type), ''), 'UNKNOWN'))))
                                                                    AS event_type_key,
        md5(
            lower(trim(COALESCE(NULLIF(TRIM(e.integration),    ''), 'Unknown'))) || '|' ||
            lower(trim(COALESCE(NULLIF(TRIM(e.job_type),       ''), 'Unknown'))) || '|' ||
            lower(trim(COALESCE(NULLIF(TRIM(e.job_name),       ''), 'Unknown Job'))) || '|' ||
            lower(trim(COALESCE(NULLIF(TRIM(e.processing_type),''), 'Unknown')))
        )                                                           AS lineage_job_key,

        COALESCE(TO_CHAR(e.event_date, 'YYYYMMDD')::INT, 19000101) AS event_date_key,

        c.run_id,
        COALESCE(NULLIF(TRIM(c.orig_namespace), ''), 'Unknown')     AS orig_namespace,
        COALESCE(NULLIF(TRIM(c.orig_name),      ''), 'Unknown')     AS orig_name,
        COALESCE(NULLIF(TRIM(c.orig_db),        ''), 'Unknown')     AS orig_db,
        COALESCE(NULLIF(TRIM(c.orig_schema),    ''), 'Unknown')     AS orig_schema,
        COALESCE(NULLIF(TRIM(c.orig_table),     ''), 'Unknown')     AS orig_table,
        COALESCE(NULLIF(TRIM(c.dest_namespace), ''), 'Unknown')     AS dest_namespace,
        COALESCE(NULLIF(TRIM(c.dest_name),      ''), 'Unknown')     AS dest_name,
        COALESCE(NULLIF(TRIM(c.dest_db),        ''), 'Unknown')     AS dest_db,
        COALESCE(NULLIF(TRIM(c.dest_schema),    ''), 'Unknown')     AS dest_schema,
        COALESCE(NULLIF(TRIM(c.dest_table),     ''), 'Unknown')     AS dest_table,

        1                                                           AS connection_count,
        COALESCE(e.record_count, 0)::BIGINT                         AS record_count,
        -- Volume distributed per connection so summing edges does not multiply-count
        -- the event-level total (an event fans out to input_count x output_count edges).
        (COALESCE(e.output_bytes, 0)
           / GREATEST(COALESCE(e.input_count,1) * COALESCE(e.output_count,1), 1))::BIGINT  AS bytes_moved
    FROM v_stg_lineage_connection c
    LEFT JOIN v_stg_lineage_event e ON c.event_nk = e.event_nk
)
SELECT
    b.*,
    se.sensitivity      AS source_sensitivity,
    de.sensitivity      AS dest_sensitivity,
    de.governed_label   AS dest_governed_label,
    -- Flag measures for one-number KPI tiles (summed in the cube)
    CASE WHEN se.sensitivity = '1. Restricted'                          THEN 1 ELSE 0 END  AS sensitive_connection_count,
    CASE WHEN se.sensitivity = '1. Restricted' AND de.governed = false  THEN 1 ELSE 0 END  AS restricted_to_ungoverned_count,
    CASE WHEN COALESCE(se.governed,true) <> COALESCE(de.governed,true)
           OR split_part(b.orig_namespace,'://',1) <> split_part(b.dest_namespace,'://',1) THEN 1 ELSE 0 END AS cross_boundary_count
FROM base b
LEFT JOIN dim_lineage_endpoint se ON se.endpoint_key = b.source_endpoint_key
LEFT JOIN dim_lineage_endpoint de ON de.endpoint_key = b.dest_endpoint_key;

CREATE UNIQUE INDEX idx_flc_nk              ON fact_lineage_connection (lineage_connection_nk);
CREATE        INDEX idx_flc_source_endpoint ON fact_lineage_connection (source_endpoint_key);
CREATE        INDEX idx_flc_dest_endpoint   ON fact_lineage_connection (dest_endpoint_key);
CREATE        INDEX idx_flc_source_entity   ON fact_lineage_connection (source_entity_key);
CREATE        INDEX idx_flc_dest_entity     ON fact_lineage_connection (dest_entity_key);
CREATE        INDEX idx_flc_event_type      ON fact_lineage_connection (event_type_key);
CREATE        INDEX idx_flc_lineage_job     ON fact_lineage_connection (lineage_job_key);
CREATE        INDEX idx_flc_event_date      ON fact_lineage_connection (event_date_key);
CREATE        INDEX idx_flc_src_sens        ON fact_lineage_connection (source_sensitivity);
CREATE        INDEX idx_flc_dest_sens       ON fact_lineage_connection (dest_sensitivity);
