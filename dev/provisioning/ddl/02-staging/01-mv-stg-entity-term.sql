-- ============================================================================
-- STAGING: mv_stg_entity_term
-- ============================================================================
-- Unified staging view combining entities and terms
-- Source: v_entities_master + v_terms
-- ============================================================================

CREATE MATERIALIZED VIEW mv_stg_entity_term AS
 SELECT emv._id AS entity_nk,
    emv."FqdnDisplay" AS entity_fqdn,
    tv."TermName" AS term_name,
   COALESCE(g_leaf._id, tv."GlossaryId") AS glossary_term_key,
    emv."DataSourceId" AS datasource_nk,
    emv."DataSourceName" AS datasource_name,
    emv."DataSourceType" AS datasource_type,
    emv."Name" AS entity_name,
    emv."Type" AS entity_type,
    emv."ResourceType" AS resource_type,
    emv."Path" AS path,
    emv."ParentPath" AS parent_path,
    emv."PathType" AS path_type,
    CASE
        WHEN emv."ResourceType" = 'Unstructured'
          AND emv."Path" IS NOT NULL
          AND array_length(regexp_split_to_array(emv."Path", '/'), 1) >= 1
        THEN (regexp_split_to_array(emv."Path", '/'))[1]
    END AS unstructured_level_1,
    CASE
        WHEN emv."ResourceType" = 'Unstructured'
          AND emv."Path" IS NOT NULL
          AND array_length(regexp_split_to_array(emv."Path", '/'), 1) >= 2
        THEN (regexp_split_to_array(emv."Path", '/'))[2]
    END AS unstructured_level_2,
    CASE
        WHEN emv."ResourceType" = 'Unstructured'
          AND emv."Path" IS NOT NULL
          AND array_length(regexp_split_to_array(emv."Path", '/'), 1) >= 3
        THEN (regexp_split_to_array(emv."Path", '/'))[3]
    END AS unstructured_level_3,
    CASE
        WHEN emv."ResourceType" = 'Unstructured'
          AND emv."Path" IS NOT NULL
          AND array_length(regexp_split_to_array(emv."Path", '/'), 1) >= 4
        THEN (regexp_split_to_array(emv."Path", '/'))[4]
    END AS unstructured_level_4,
    CASE
        WHEN emv."ResourceType" = 'Unstructured'
          AND emv."Path" IS NOT NULL
          AND array_length(regexp_split_to_array(emv."Path", '/'), 1) >= 5
        THEN (regexp_split_to_array(emv."Path", '/'))[5]
    END AS unstructured_level_5,
    CASE
        WHEN emv."ResourceType" = 'Unstructured'
          AND emv."Path" IS NOT NULL
          AND array_length(regexp_split_to_array(emv."Path", '/'), 1) >= 6
        THEN (regexp_split_to_array(emv."Path", '/'))[6]
    END AS unstructured_level_6,
    CASE
        WHEN emv."ResourceType" = 'Unstructured'
          AND emv."Path" IS NOT NULL
          AND array_length(regexp_split_to_array(emv."Path", '/'), 1) >= 1
        THEN (regexp_split_to_array(emv."Path", '/'))[array_length(regexp_split_to_array(emv."Path", '/'), 1)]
    END AS unstructured_leaf,
    CASE
        WHEN emv."ResourceType" = 'Structured'
          AND emv."FqdnDisplay" IS NOT NULL
          AND array_length(string_to_array(emv."FqdnDisplay", '.'), 1) >= 3
        THEN (string_to_array(emv."FqdnDisplay", '.'))[array_length(string_to_array(emv."FqdnDisplay", '.'), 1) - 2]
    END AS structured_schema,
    CASE
        WHEN emv."ResourceType" = 'Structured'
          AND emv."FqdnDisplay" IS NOT NULL
          AND array_length(string_to_array(emv."FqdnDisplay", '.'), 1) >= 2
        THEN (string_to_array(emv."FqdnDisplay", '.'))[array_length(string_to_array(emv."FqdnDisplay", '.'), 1) - 1]
    END AS structured_table,
    CASE
        WHEN emv."ResourceType" = 'Structured'
          AND emv."FqdnDisplay" IS NOT NULL
          AND array_length(string_to_array(emv."FqdnDisplay", '.'), 1) >= 1
        THEN (string_to_array(emv."FqdnDisplay", '.'))[array_length(string_to_array(emv."FqdnDisplay", '.'), 1)]
    END AS structured_column,
    CASE
        WHEN emv."ResourceType" = 'Structured'
          AND emv."FqdnDisplay" IS NOT NULL
          AND array_length(string_to_array(emv."FqdnDisplay", '.'), 1) >= 3
        THEN (string_to_array(emv."FqdnDisplay", '.'))[array_length(string_to_array(emv."FqdnDisplay", '.'), 1) - 2]
          || '.' || (string_to_array(emv."FqdnDisplay", '.'))[array_length(string_to_array(emv."FqdnDisplay", '.'), 1) - 1]
          || '.' || (string_to_array(emv."FqdnDisplay", '.'))[array_length(string_to_array(emv."FqdnDisplay", '.'), 1)]
    END AS structured_fqdn,
    emv."FileExtension" AS file_extension,
    emv."Url" AS url,
    emv."PhysicalLocation" AS physicallocation,
    emv."Owner" AS owner_name,
    emv."Group" AS group_name,
    CASE
        WHEN (emv."FileType" ~~* 'parquet%'::text) THEN 'parquet'::text
        ELSE emv."FileType"
    END AS filetype,
    to_timestamp((emv."CreatedAt")::text, 'YYYY-MM-DD HH24:MI:SS'::text) AS created_ts,
    to_timestamp((emv."ModifiedAt")::text, 'YYYY-MM-DD HH24:MI:SS'::text) AS modified_ts,
    to_timestamp((emv."AccessedAt")::text, 'YYYY-MM-DD HH24:MI:SS'::text) AS accessed_ts,
    to_timestamp((emv."ScannedAt")::text, 'YYYY-MM-DD HH24:MI:SS'::text) AS scanned_ts,
    to_timestamp((emv."LastUpdate")::text, 'YYYY-MM-DD HH24:MI:SS'::text) AS last_update_ts,
    to_timestamp((emv."LastUpdateStatistics")::text, 'YYYY-MM-DD HH24:MI:SS'::text) AS last_update_statistics_ts,
    COALESCE(emv."Size", (0)::bigint) AS bytes
   FROM (v_entities_master emv
     LEFT JOIN v_terms tv ON ((emv."FqdnDisplay" = tv."FqdnDisplay"))
     LEFT JOIN v_glossary_summary g_root ON (g_root._id = tv."GlossaryId")
     LEFT JOIN LATERAL (
        SELECT g._id
        FROM v_glossary_summary g
        WHERE g."Type" = 'term'
          AND g."Name" = tv."TermName"
          AND (g_root."Name" IS NULL OR g."Fqdn" LIKE g_root."Name" || '/%')
        ORDER BY array_length(string_to_array(g."Fqdn", '/'), 1) DESC
        LIMIT 1
     ) g_leaf ON true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_stg_entity_nk ON mv_stg_entity_term(entity_nk);
CREATE INDEX IF NOT EXISTS idx_stg_datasource_nk ON mv_stg_entity_term(datasource_nk);
CREATE INDEX IF NOT EXISTS idx_stg_term_name ON mv_stg_entity_term(lower(trim(term_name)));
CREATE INDEX IF NOT EXISTS idx_stg_created_ts ON mv_stg_entity_term(created_ts);
CREATE INDEX IF NOT EXISTS idx_stg_modified_ts ON mv_stg_entity_term(modified_ts);
CREATE INDEX IF NOT EXISTS idx_stg_scanned_ts ON mv_stg_entity_term(scanned_ts);
CREATE INDEX IF NOT EXISTS idx_stg_entity_datasource ON mv_stg_entity_term(entity_nk, datasource_nk);
