-- ============================================================================
-- DIMENSION: dim_extension
-- ============================================================================
-- Distinct file extensions seen by the catalog (for trend cube grain).
-- ============================================================================

CREATE MATERIALIZED VIEW dim_extension AS
SELECT
  md5(lower(trim(COALESCE(ext."Extension",'(none)')))) AS extension_key,
  COALESCE(NULLIF(trim(ext."Extension"),''),'(none)')  AS extension_name,
  CASE
    WHEN ext."Extension" IS NULL OR trim(ext."Extension") = '' THEN '99. Other'
    WHEN lower(ext."Extension") IN ('csv','tsv','json','parquet','avro','orc') THEN '01. Tabular Data'
    WHEN lower(ext."Extension") IN ('xls','xlsx','xlsm') THEN '02. Spreadsheets'
    WHEN lower(ext."Extension") IN ('doc','docx','pdf','rtf','odt') THEN '03. Documents'
    WHEN lower(ext."Extension") IN ('ppt','pptx','key') THEN '04. Presentations'
    WHEN lower(ext."Extension") IN ('jpg','jpeg','png','gif','tif','tiff','bmp','svg') THEN '05. Images'
    WHEN lower(ext."Extension") IN ('mp4','mov','avi','mkv','wmv') THEN '06. Video'
    WHEN lower(ext."Extension") IN ('mp3','wav','flac','aac','ogg') THEN '07. Audio'
    WHEN lower(ext."Extension") IN ('zip','tar','gz','7z','rar','bz2') THEN '08. Archives'
    WHEN lower(ext."Extension") IN ('sql','py','java','js','ts','go','c','cpp','rb','sh') THEN '09. Source Code'
    WHEN lower(ext."Extension") IN ('log','out','err') THEN '10. Logs'
    ELSE '99. Other'
  END AS extension_category
FROM (SELECT DISTINCT "Extension" FROM entities_extension_count_view) ext;

CREATE INDEX IF NOT EXISTS idx_dim_extension_key  ON dim_extension(extension_key);
CREATE INDEX IF NOT EXISTS idx_dim_extension_name ON dim_extension(extension_name);
CREATE INDEX IF NOT EXISTS idx_dim_extension_cat  ON dim_extension(extension_category);
