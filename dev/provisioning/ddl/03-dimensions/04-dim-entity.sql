-- ============================================================================
-- DIMENSION: dim_entity (EXTENDED)
-- ============================================================================
-- Entity master dimension with all attributes including:
--   - Original structural attributes (path, owner, type, hierarchy levels)
--   - NEW: cost / currency (DataSourceCostPerTb*)
--   - NEW: data profile / quality (RowCount, NullCount, Cardinality, Hll, etc.)
--   - NEW: structured key flags (IsPrimaryKey, IsForeignKey, IsNullable)
--   - NEW: document metadata (Title, Author, Application, Company, PageCount)
--   - NEW: data source category (datasource_category_mapping)
--   - NEW: custom entity category (entities_custom_categorization)
-- ============================================================================

CREATE MATERIALIZED VIEW dim_entity AS
SELECT
  md5(stg.entity_nk) AS entity_key,
  stg.entity_nk,
  stg.entity_fqdn,
  stg.entity_name,
  stg.entity_type,
  stg.resource_type,
  stg.path,
  stg.parent_path,
  stg.owner_name,
  stg.group_name,
  stg.filetype,
  stg.file_extension,
  stg.path_type,
  stg.unstructured_level_1,
  stg.unstructured_level_2,
  stg.unstructured_level_3,
  stg.unstructured_level_4,
  stg.unstructured_level_5,
  stg.unstructured_level_6,
  stg.unstructured_leaf,
  stg.structured_schema,
  stg.structured_table,
  stg.structured_column,
  stg.structured_fqdn,
  stg.url,
  stg.physicallocation,
  stg.datasource_nk,
  COALESCE(emv."DataSourceCostPerTbCurrency",'USD') AS cost_currency,
  emv."DataSourceCostPerTbPrice"::numeric            AS cost_per_tb_native,
  emv."CostPerTbFrequency"                           AS cost_per_tb_frequency,
  -- Cost in USD with sparsity fallback: entity-level → DataSourceType avg → global avg
  -- (NULLIF treats explicit 0 as missing so the fallback can kick in)
  COALESCE(
    (NULLIF(emv."DataSourceCostPerTbPrice"::numeric, 0) * COALESCE(fx."ConversionRateToUSD", 1.0))::numeric(18,4),
    cost_dst.avg_cost_usd,
    cost_global.avg_cost_usd,
    0
  )::numeric(18,4)                                   AS cost_per_tb_usd,
  emv."DataProfileStatus"                            AS data_profile_status,
  CASE WHEN lower(COALESCE(emv."DataProfiled",'')) IN ('true','t','yes','1','y') THEN 1 ELSE 0 END
                                                     AS data_profiled_flag,
  emv."RowCount"      AS row_count,
  emv."NullCount"     AS null_count,
  emv."BlankCount"    AS blank_count,
  emv."Cardinality"   AS cardinality,
  emv."Hll"           AS hll,
  emv."AvgValue"      AS avg_value,
  emv."MinWidth"      AS min_width,
  emv."MaxWidth"      AS max_width,
  emv."AvgWidth"      AS avg_width,
  emv."ColumnsCount"  AS columns_count,
  COALESCE(emv."IsPrimaryKey", false) AS is_primary_key,
  COALESCE(emv."IsForeignKey", false) AS is_foreign_key,
  COALESCE(emv."IsNullable",   true)  AS is_nullable,
  emv."OrdinalPosition"               AS ordinal_position,
  emv."DataType"                      AS column_data_type,
  emv."Title"        AS document_title,
  emv."Author"       AS document_author,
  emv."Subject"      AS document_subject,
  emv."Application"  AS document_application,
  emv."Producer"     AS document_producer,
  emv."Company"      AS document_company,
  emv."PageCount"    AS document_page_count,
  emv."Words"        AS document_word_count,
  emv."Language"     AS document_language,
  emv."Sensitivity"  AS sensitivity,
  emv."Selectivity"  AS selectivity,
  emv."Uniqueness"   AS uniqueness,
  emv."Density"      AS density,
  COALESCE(dsc.category, '99. Uncategorized')        AS datasource_category,
  COALESCE(ecc."EntityCategory", '99. Uncategorized') AS entity_category,
  ecc."GlossaryName"  AS custom_glossary_name,
  ecc."GlossaryType"  AS custom_glossary_type
FROM (
  SELECT DISTINCT ON (entity_nk)
    entity_nk, entity_fqdn, entity_name, entity_type, resource_type,
    path, parent_path, owner_name, group_name, filetype, file_extension, path_type,
    unstructured_level_1, unstructured_level_2, unstructured_level_3,
    unstructured_level_4, unstructured_level_5, unstructured_level_6, unstructured_leaf,
    structured_schema, structured_table, structured_column, structured_fqdn,
    url, physicallocation, datasource_nk
  FROM mv_stg_entity_term
  WHERE entity_nk IS NOT NULL
  ORDER BY entity_nk
) stg
LEFT JOIN v_entities_master           emv ON emv._id = stg.entity_nk
LEFT JOIN datasource_category_mapping    dsc ON dsc."DataSourceType" = stg.entity_type
LEFT JOIN currency_exchange_rates        fx  ON fx.currency_symbol  = COALESCE(emv."DataSourceCostPerTbCurrency",'USD')
LEFT JOIN entities_custom_categorization ecc ON ecc._id            = stg.entity_nk
-- Per-DataSourceType average cost in USD (fallback #1)
LEFT JOIN LATERAL (
  SELECT AVG((e."DataSourceCostPerTbPrice")::numeric * COALESCE(fx2."ConversionRateToUSD",1.0))::numeric(18,4) AS avg_cost_usd
  FROM v_entities_master e
  LEFT JOIN currency_exchange_rates fx2 ON fx2.currency_symbol = COALESCE(e."DataSourceCostPerTbCurrency",'USD')
  WHERE e."DataSourceType" = emv."DataSourceType"
    AND (e."DataSourceCostPerTbPrice")::numeric > 0
) cost_dst ON true
-- Global average cost in USD (fallback #2)
CROSS JOIN LATERAL (
  SELECT AVG((e."DataSourceCostPerTbPrice")::numeric * COALESCE(fx2."ConversionRateToUSD",1.0))::numeric(18,4) AS avg_cost_usd
  FROM v_entities_master e
  LEFT JOIN currency_exchange_rates fx2 ON fx2.currency_symbol = COALESCE(e."DataSourceCostPerTbCurrency",'USD')
  WHERE (e."DataSourceCostPerTbPrice")::numeric > 0
) cost_global;

CREATE INDEX IF NOT EXISTS idx_dim_entity_key                  ON dim_entity(entity_key);
CREATE INDEX IF NOT EXISTS idx_dim_entity_type                 ON dim_entity(entity_type);
CREATE INDEX IF NOT EXISTS idx_dim_entity_resource_type        ON dim_entity(resource_type);
CREATE INDEX IF NOT EXISTS idx_dim_entity_filetype             ON dim_entity(filetype);
CREATE INDEX IF NOT EXISTS idx_dim_entity_path                 ON dim_entity(path);
CREATE INDEX IF NOT EXISTS idx_dim_entity_parent_path          ON dim_entity(parent_path);
CREATE INDEX IF NOT EXISTS idx_dim_entity_unstructured_level_1 ON dim_entity(unstructured_level_1);
CREATE INDEX IF NOT EXISTS idx_dim_entity_unstructured_leaf    ON dim_entity(unstructured_leaf);
CREATE INDEX IF NOT EXISTS idx_dim_entity_structured_schema    ON dim_entity(structured_schema);
CREATE INDEX IF NOT EXISTS idx_dim_entity_structured_table     ON dim_entity(structured_table);
CREATE INDEX IF NOT EXISTS idx_dim_entity_owner                ON dim_entity(owner_name);
CREATE INDEX IF NOT EXISTS idx_dim_entity_datasource_category  ON dim_entity(datasource_category);
CREATE INDEX IF NOT EXISTS idx_dim_entity_entity_category      ON dim_entity(entity_category);
CREATE INDEX IF NOT EXISTS idx_dim_entity_data_profile_status  ON dim_entity(data_profile_status);
CREATE INDEX IF NOT EXISTS idx_dim_entity_sensitivity          ON dim_entity(sensitivity);
