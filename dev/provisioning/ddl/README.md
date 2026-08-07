# PDC Business Intelligence Database - DDL Structure

## Overview
Modular SQL scripts for creating the PDC dimensional data model. Each script is self-contained with object creation and indexes together.

## Directory Structure

```
ddl/
├── 00-execute-all.sql              # Master script - executes all in order
├── 01-setup/
│   ├── 00-psql-variables.sql       # psql \set variables (psql-only, not used by Pentaho)
│   ├── 01-fdw-setup.sql            # FDW setup using psql variables
│   ├── 01-fdw-setup-kjb.sql        # FDW setup using Kettle ${VAR} variables
│   ├── 02-data-multiplier-function.sql
│   └── 03-drop-all-objects.sql
├── 02-staging/
│   └── 01-mv-stg-entity-term.sql
├── 03-dimensions/
│   ├── 01-dim-date.sql
│   ├── 02-dim-term.sql
│   ├── 03-dim-glossary-term.sql
│   ├── 04-dim-entity.sql
│   ├── 05-dim-datasource.sql
│   ├── 06-dim-filetype.sql
│   └── 07-dim-leaf-flag.sql
├── 04-facts/
│   ├── 01-fact-entity-snapshot.sql
│   └── 02-fact-entity-term.sql
├── 05-refresh/
│   └── 01-refresh-all.sql
├── archive/
└── tests/
```

## Execution Order

### Option 1: Execute All (Recommended for psql)
```bash
psql -h localhost -U postgres -d bidb_ext_demo -f 00-execute-all.sql
```

### Option 2: Execute via Pentaho (Recommended for BA Server)
Run `j-main-script.kjb` from the Pentaho repository. This uses `t-execute-repo-file.ktr` to dynamically fetch SQL files from the repo, substitute Kettle variables, split into individual statements, and execute against the database. See the main project README for details.

### Option 3: Execute Individual Phases
```bash
# Phase 1: Setup
psql -h localhost -U postgres -d bidb_ext_demo -f 01-setup/00-psql-variables.sql
psql -h localhost -U postgres -d bidb_ext_demo -f 01-setup/01-fdw-setup.sql
psql -h localhost -U postgres -d bidb_ext_demo -f 01-setup/02-data-multiplier-function.sql
psql -h localhost -U postgres -d bidb_ext_demo -f 01-setup/03-drop-all-objects.sql

# Phase 2: Staging
psql -h localhost -U postgres -d bidb_ext_demo -f 02-staging/01-mv-stg-entity-term.sql

# Phase 3: Dimensions
psql -h localhost -U postgres -d bidb_ext_demo -f 03-dimensions/01-dim-date.sql
psql -h localhost -U postgres -d bidb_ext_demo -f 03-dimensions/02-dim-term.sql
psql -h localhost -U postgres -d bidb_ext_demo -f 03-dimensions/03-dim-glossary-term.sql
psql -h localhost -U postgres -d bidb_ext_demo -f 03-dimensions/04-dim-entity.sql
psql -h localhost -U postgres -d bidb_ext_demo -f 03-dimensions/05-dim-datasource.sql
psql -h localhost -U postgres -d bidb_ext_demo -f 03-dimensions/06-dim-filetype.sql

# Phase 4: Facts
psql -h localhost -U postgres -d bidb_ext_demo -f 04-facts/01-fact-entity-snapshot.sql
psql -h localhost -U postgres -d bidb_ext_demo -f 04-facts/02-fact-entity-term.sql

# Phase 5: Refresh
psql -h localhost -U postgres -d bidb_ext_demo -f 05-refresh/01-refresh-all.sql
```

### Option 4: Execute Single Object
```bash
# Rebuild just one dimension
psql -h localhost -U postgres -d bidb_ext_demo -c "DROP MATERIALIZED VIEW IF EXISTS dim_term CASCADE;"
psql -h localhost -U postgres -d bidb_ext_demo -f 03-dimensions/02-dim-term.sql

# Refresh a single fact
psql -h localhost -U postgres -d bidb_ext_demo -c "REFRESH MATERIALIZED VIEW fact_entity_term;"
```

## Prerequisites

1. **Database**: PostgreSQL 17.7 with schema `bidb_ext_demo`
2. **Foreign Data Wrapper**:
  - psql variables in 01-setup/00-psql-variables.sql
  - Kettle SQL in 01-setup/01-fdw-setup-kjb.sql
3. **Source Views**:
   - `entities_master_view` (entity metadata)
   - `terms_view` (entity-term assignments with GlossaryId)
   - `glossary_summary_view` (business glossary hierarchy)

## Data Model Summary

### Staging Layer (1 materialized view)
- `mv_stg_entity_term`: Unified entity + term data

### Dimensions (7 materialized views)
- `dim_date`: Complete date dimension with Unknown date
- `dim_term`: Classification terms (Hot/Cold/PII) with default member
- `dim_glossary_term`: Business glossary (6-level hierarchy)
- `dim_entity`: Entity master with attributes
- `dim_datasource`: Data source metadata
- `dim_filetype`: File types with default member
- `dim_leaf_flag`: Leaf-term filter (true/false)
- `dim_leaf_flag`: Leaf-term filter (true/false)

### Facts (2 materialized views)
- `fact_entity_snapshot`: Daily entity snapshots (entity + date grain)
- `fact_entity_term`: Entity-term-glossary associations (entity + term grain)

## Key Features

### Data Multiplier
- Function: `get_data_multiplier()`
- Location: `01-setup/02-data-multiplier-function.sql`
- Default: Returns 1 (actual data)
- Demo mode: Change to 10, 100, or 1000 for inflated metrics
- All storage metrics use this multiplier

### Glossary Integration
- `fact_entity_term` includes `glossary_term_key`
- `dim_glossary_term` provides 6-level hierarchy from FQDN
- Links: Entity → Classification Term → Glossary Hierarchy
- Enables analysis like “Storage by Temperature Hierarchy”

### Default Members
- Term dimension: "No Term Available" (key='unknown')
- File Type dimension: "No File Type Available" (key='unknown')
- Enables drill-across in Virtual Cube

### Indexes
- Each script creates indexes immediately after object creation
- Foreign keys, natural keys, and composite grain indexes included
- Optimized for Mondrian OLAP queries

## Refresh Strategy

### Full Refresh (after source data changes)
```bash
psql -h localhost -U postgres -d bidb_ext_demo -f 05-refresh/01-refresh-all.sql
```

### Selective Refresh (specific views)
```sql
-- Refresh just dimensions (after glossary changes)
REFRESH MATERIALIZED VIEW dim_glossary_term;

-- Refresh just facts (after entity data updates)
REFRESH MATERIALIZED VIEW fact_entity_snapshot;
REFRESH MATERIALIZED VIEW fact_entity_term;
```

## Verification

### Row Counts
```sql
-- Check staging
SELECT 'mv_stg_entity_term' AS view_name, COUNT(*) FROM mv_stg_entity_term;

-- Check dimensions
SELECT 'dim_date' AS view_name, COUNT(*) FROM dim_date
UNION ALL SELECT 'dim_term', COUNT(*) FROM dim_term
UNION ALL SELECT 'dim_glossary_term', COUNT(*) FROM dim_glossary_term
UNION ALL SELECT 'dim_entity', COUNT(*) FROM dim_entity
UNION ALL SELECT 'dim_datasource', COUNT(*) FROM dim_datasource
UNION ALL SELECT 'dim_filetype', COUNT(*) FROM dim_filetype
UNION ALL SELECT 'dim_leaf_flag', COUNT(*) FROM dim_leaf_flag;

-- Check facts
SELECT 'fact_entity_snapshot' AS view_name, COUNT(*) FROM fact_entity_snapshot
UNION ALL SELECT 'fact_entity_term', COUNT(*) FROM fact_entity_term;
```

### Data Quality
```sql
-- Check for orphaned keys in facts
SELECT COUNT(*) 
FROM fact_entity_term f
LEFT JOIN dim_glossary_term d ON f.glossary_term_key = d.glossary_term_key
WHERE f.glossary_term_key IS NOT NULL AND d.glossary_term_key IS NULL;

-- Check glossary hierarchy depth distribution
SELECT hierarchy_depth, COUNT(*) 
FROM dim_glossary_term 
GROUP BY 1 ORDER BY 1;
```

## Integration with Pentaho

### Kettle Job (Current)
- Job file: `pdc-analysis/data/j-main-script.kjb`
- Variables: `pdc-analysis/data/j-set-global-var.kjb`
- SQL from files: `pdc-analysis/ddl/**`
- Legacy job archived: `pdc-analysis/data/deprecated/j-main.kjb`

### After DDL Execution
1. Verify row counts (see above)
2. Publish Mondrian schema: `analyzer-cubes/bidb_ext.xml`
3. Clear Mondrian cache:
```bash
cd pdc-analysis
./utility/push-cube.sh analyzer-cubes/bidb_ext.xml PDC-BIDB-EXT 10.80.230.193:80
```

### Mondrian Schema Alignment
- Virtual Cube: 01. Data Asset Analysis
- Cubes:
  - 71. Entity Snapshot (uses fact_entity_snapshot)
  - 72. Entity Term (uses fact_entity_term)
- Business Glossary dimension: 6 levels with nullParentValue

## Troubleshooting

### Foreign Data Wrapper Issues
```sql
-- Check FDW server
SELECT * FROM pg_foreign_server WHERE srvname = 'remote_bidb';

-- Test foreign tables
SELECT COUNT(*) FROM entities_master_view;
SELECT COUNT(*) FROM terms_view;
SELECT COUNT(*) FROM glossary_summary_view;
```

### Glossary Term Orphans
```sql
-- Find terms without parent
SELECT term_name, term_fqdn, parent_id
FROM dim_glossary_term
WHERE parent_id IS NOT NULL 
  AND NOT EXISTS (
    SELECT 1 FROM glossary_summary_view 
    WHERE _id = dim_glossary_term.parent_id
  );
```

### Performance Issues
```sql
-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'bidb_ext_demo'
ORDER BY idx_scan;

-- Rebuild indexes if needed
REINDEX TABLE fact_entity_term;
```

## Maintenance

### Update Data Multiplier (Demo Mode)
```sql
-- Edit this value in 01-setup/02-data-multiplier-function.sql
CREATE OR REPLACE FUNCTION get_data_multiplier() RETURNS numeric AS $func$
  SELECT 10::numeric;  -- Change to 10x, 100x, 1000x
$func$ LANGUAGE sql IMMUTABLE;

-- Then refresh facts
\ir 05-refresh/01-refresh-all.sql
```

### Add New Dimension
1. Create script in `03-dimensions/07-dim-newdim.sql`
2. Update `01-setup/03-drop-all-objects.sql` (add DROP statement)
3. Update `05-refresh/01-refresh-all.sql` (add REFRESH statement)
4. Update `00-execute-all.sql` (add \ir statement)

### Add New Fact
1. Create script in `04-facts/03-fact-newfact.sql`
2. Update `01-setup/03-drop-all-objects.sql` (add DROP statement)
3. Update `05-refresh/01-refresh-all.sql` (add REFRESH statement)
4. Update `00-execute-all.sql` (add \ir statement)

## Files Deprecated

The following files are now replaced by the modular structure:
- `bidb_dimensional_model.sql` (archived in ddl/archive/)
- `dim_glossary_term.sql` (now in 03-dimensions/)
- `fact_entity_glossary_term.sql` (merged into fact_entity_term)
- `mondrian_glossary_dimension_and_cube.xml` (integrated into bidb_ext.xml)
- `glossary_validation_queries.sql` (moved to ddl/tests/)

## Future Enhancement

Unify variable management so the same source (properties) feeds both:
- psql execution (00-execute-all.sql / 01-setup/00-psql-variables.sql)
- Kettle execution (j-set-global-var.kjb)

Goal: a single shared variables file for SQL and Kettle deployments.
