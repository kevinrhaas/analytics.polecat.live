-- staging tables for lineage data (loaded by PDI ETL, not FDW)
-- must exist before lineage dimension/fact MVs are created
-- these are NOT dropped by 03-drop-all-objects.sql — ETL data persists across DDL rebuilds

CREATE TABLE IF NOT EXISTS stg_lineage_event (
    event_nk            TEXT            NOT NULL,
    event_time          TIMESTAMP,
    event_type          TEXT,
    run_id              TEXT,
    job_name            TEXT,
    processing_type     TEXT,
    integration         TEXT,
    job_type            TEXT,
    in_namespace        TEXT,
    in_names            TEXT,
    out_namespace       TEXT,
    out_names           TEXT,
    input_count         INTEGER,
    output_count        INTEGER,
    record_count        DOUBLE PRECISION,
    event_date          DATE,
    load_ts             TIMESTAMP DEFAULT now()
);

-- Additional metric & parent-hierarchy columns (idempotent so existing data is preserved)
ALTER TABLE stg_lineage_event ADD COLUMN IF NOT EXISTS input_rows       BIGINT;
ALTER TABLE stg_lineage_event ADD COLUMN IF NOT EXISTS output_rows      BIGINT;
ALTER TABLE stg_lineage_event ADD COLUMN IF NOT EXISTS input_bytes      BIGINT;
ALTER TABLE stg_lineage_event ADD COLUMN IF NOT EXISTS output_bytes     BIGINT;
ALTER TABLE stg_lineage_event ADD COLUMN IF NOT EXISTS parent_run_id    TEXT;
ALTER TABLE stg_lineage_event ADD COLUMN IF NOT EXISTS parent_job_name  TEXT;
ALTER TABLE stg_lineage_event ADD COLUMN IF NOT EXISTS parent_namespace TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sle_event_nk  ON stg_lineage_event (event_nk);
CREATE        INDEX IF NOT EXISTS idx_sle_event_date ON stg_lineage_event (event_date);
CREATE        INDEX IF NOT EXISTS idx_sle_event_type ON stg_lineage_event (event_type);
CREATE        INDEX IF NOT EXISTS idx_sle_job_name   ON stg_lineage_event (job_name);

CREATE TABLE IF NOT EXISTS stg_lineage_connection (
    connection_nk       TEXT            NOT NULL,
    event_nk            TEXT            NOT NULL,
    run_id              TEXT,
    orig_namespace      TEXT,
    orig_name           TEXT,
    orig_db             TEXT,
    orig_schema         TEXT,
    orig_table          TEXT,
    dest_namespace      TEXT,
    dest_name           TEXT,
    dest_db             TEXT,
    dest_schema         TEXT,
    dest_table          TEXT,
    load_ts             TIMESTAMP DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_slc_connection_nk ON stg_lineage_connection (connection_nk);
CREATE        INDEX IF NOT EXISTS idx_slc_event_nk      ON stg_lineage_connection (event_nk);
CREATE        INDEX IF NOT EXISTS idx_slc_orig_name     ON stg_lineage_connection (orig_name);
CREATE        INDEX IF NOT EXISTS idx_slc_dest_name     ON stg_lineage_connection (dest_name);
