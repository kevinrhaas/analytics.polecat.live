DROP MATERIALIZED VIEW IF EXISTS dim_lineage_event_type CASCADE;
CREATE MATERIALIZED VIEW dim_lineage_event_type AS
WITH observed AS (
    SELECT DISTINCT UPPER(COALESCE(NULLIF(TRIM(event_type), ''), 'UNKNOWN')) AS event_type_nk
    FROM v_stg_lineage_event
),
canonical AS (
    -- OpenLineage run lifecycle (what the PDC API actually emits)
    SELECT 'START'    AS event_type_nk UNION ALL
    SELECT 'RUNNING'              UNION ALL
    SELECT 'COMPLETE'             UNION ALL
    SELECT 'ABORT'                UNION ALL
    SELECT 'FAIL'                 UNION ALL
    SELECT 'OTHER'                UNION ALL
    -- Semantic categories (reserved for future ETL mapping)
    SELECT 'WRITE'                UNION ALL
    SELECT 'READ'                 UNION ALL
    SELECT 'DELETE'               UNION ALL
    SELECT 'UNKNOWN'
),
combined AS (
    SELECT event_type_nk FROM canonical
    UNION
    SELECT event_type_nk FROM observed
)
SELECT
    md5(lower(trim(event_type_nk)))     AS event_type_key,
    event_type_nk                       AS event_type_nk,
    CASE event_type_nk
        WHEN 'START'    THEN '01. Start'
        WHEN 'RUNNING'  THEN '02. Running'
        WHEN 'COMPLETE' THEN '03. Complete'
        WHEN 'ABORT'    THEN '04. Abort'
        WHEN 'FAIL'     THEN '05. Fail'
        WHEN 'WRITE'    THEN '11. Write'
        WHEN 'READ'     THEN '12. Read'
        WHEN 'DELETE'   THEN '13. Delete'
        WHEN 'UNKNOWN'  THEN '99. Unknown'
        ELSE '98. Other'
    END                                 AS event_type_label,
    CASE event_type_nk
        WHEN 'START'    THEN 1
        WHEN 'RUNNING'  THEN 2
        WHEN 'COMPLETE' THEN 3
        WHEN 'ABORT'    THEN 4
        WHEN 'FAIL'     THEN 5
        WHEN 'WRITE'    THEN 11
        WHEN 'READ'     THEN 12
        WHEN 'DELETE'   THEN 13
        WHEN 'UNKNOWN'  THEN 99
        ELSE 98
    END                                 AS event_type_sort,
    CASE WHEN event_type_nk IN ('COMPLETE')      THEN true ELSE false END AS is_complete_flag,
    CASE WHEN event_type_nk IN ('FAIL','ABORT')  THEN true ELSE false END AS is_failure_flag,
    CASE WHEN event_type_nk = 'WRITE'  THEN true ELSE false END AS is_write_flag,
    CASE WHEN event_type_nk = 'READ'   THEN true ELSE false END AS is_read_flag,
    CASE WHEN event_type_nk = 'DELETE' THEN true ELSE false END AS is_delete_flag
FROM combined;

CREATE UNIQUE INDEX idx_dlet_key  ON dim_lineage_event_type (event_type_key);
CREATE        INDEX idx_dlet_sort ON dim_lineage_event_type (event_type_sort);
