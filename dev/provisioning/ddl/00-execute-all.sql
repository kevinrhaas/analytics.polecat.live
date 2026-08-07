-- ============================================================================
-- PDC BUSINESS INTELLIGENCE DATABASE - MASTER DDL EXECUTION SCRIPT
-- ============================================================================
-- This script executes all modular DDL scripts in the correct order
-- Schema: bidb_ext_dev
-- Prerequisites: 
--   - Foreign data wrapper configured (remote_bidb server)
--   - entities_master_view and terms_view available
--   - glossary_summary_view available
-- ============================================================================

\echo ''
\echo '============================================================================'
\echo 'PDC BIDB - DIMENSIONAL MODEL DEPLOYMENT'
\echo '============================================================================'
\echo ''

-- ============================================================================
-- PHASE 1: SETUP
-- ============================================================================
\echo '>>> PHASE 1: Setup - Load Variables'
\ir 01-setup/00-psql-variables.sql

\echo '>>> PHASE 1: Setup - Foreign Data Wrapper'
\ir 01-setup/01-fdw-setup.sql

\echo '>>> PHASE 1: Setup - Set search_path'
SET search_path TO :"BIDB_EXT_SCHEMA_NAME", public;

\echo '>>> PHASE 1: Setup - Data Multiplier Function'
\ir 01-setup/02-data-multiplier-function.sql

\echo '>>> PHASE 1: Setup - Drop All Objects'
\ir 01-setup/03-drop-all-objects.sql

\echo '>>> PHASE 1: Setup - Lineage Staging Tables'
\ir 01-setup/04-lineage-tables-setup.sql

\echo '>>> PHASE 1: Setup - Entity Demo Overlay Table (durable synthetic catalog)'
\ir 01-setup/06-entity-demo-tables.sql

\echo '>>> PHASE 1: Setup - Policy/Governance Demo Overlay Tables'
\ir 01-setup/07-policy-demo-tables.sql

\echo '>>> PHASE 1: Setup - Glossary/Terms Demo Overlay Tables'
\ir 01-setup/08-term-demo-tables.sql

\echo '>>> PHASE 1: Setup - Application/Access Demo Overlay Tables'
\ir 01-setup/09-application-demo-tables.sql

\echo '>>> PHASE 1: Setup - Extension/Temperature Demo Overlay Tables'
\ir 01-setup/10-extension-temp-demo-tables.sql

-- ============================================================================
-- PHASE 2: STAGING
-- ============================================================================
\echo ''
\echo '>>> PHASE 2: Staging - Catalog overlay view (live source UNION demo overlay)'
\ir 02-staging/02-v-entities-master.sql

\echo '>>> PHASE 2: Staging - Governance overlay views (policies + assignments)'
\ir 02-staging/03-v-policies.sql

\echo '>>> PHASE 2: Staging - Glossary/terms overlay views'
\ir 02-staging/04-v-terms.sql

\echo '>>> PHASE 2: Staging - Application/access overlay views'
\ir 02-staging/05-v-applications.sql

\echo '>>> PHASE 2: Staging - Extension/temperature overlay views'
\ir 02-staging/06-v-extension-temp.sql

\echo '>>> PHASE 2: Staging - Create mv_stg_entity_term'
\ir 02-staging/01-mv-stg-entity-term.sql

-- ============================================================================
-- PHASE 3: DIMENSIONS
-- ============================================================================
\echo ''
\echo '>>> PHASE 3: Dimensions - Creating dimension tables...'
\ir 03-dimensions/01-dim-date.sql
\ir 03-dimensions/02-dim-term.sql
\ir 03-dimensions/03-dim-glossary-term.sql
\ir 03-dimensions/04-dim-entity.sql
\ir 03-dimensions/05-dim-datasource.sql
\ir 03-dimensions/06-dim-filetype.sql
\ir 03-dimensions/07-dim-leaf-flag.sql
\ir 03-dimensions/08-dim-policy.sql
\ir 03-dimensions/09-dim-application.sql
\ir 03-dimensions/10-dim-extension.sql
\ir 03-dimensions/11-dim-temperature.sql
\ir 03-dimensions/12-dim-currency.sql
\ir 03-dimensions/13-dim-pipeline-status.sql
\ir 03-dimensions/14-dim-lineage-event-type.sql
\ir 03-dimensions/15-dim-lineage-job.sql
\ir 03-dimensions/16-dim-lineage-endpoint.sql

-- ============================================================================
-- PHASE 4: FACTS
-- ============================================================================
\echo ''
\echo '>>> PHASE 4: Facts - Creating fact tables...'
\ir 04-facts/01-fact-entity-snapshot.sql
\ir 04-facts/02-fact-entity-term.sql
\ir 04-facts/03-fact-entity-policy.sql
\ir 04-facts/04-fact-entity-application.sql
\ir 04-facts/05-fact-duplicate.sql
\ir 04-facts/06-fact-pipeline-run.sql
\ir 04-facts/07-fact-extension-daily.sql
\ir 04-facts/08-fact-temperature-daily.sql
\ir 04-facts/09-fact-lineage-event.sql
\ir 04-facts/10-fact-lineage-connection.sql

-- ============================================================================
-- PHASE 5: REFRESH
-- ============================================================================
\echo ''
\echo '>>> PHASE 5: Refresh - Refreshing all materialized views...'
\ir 05-refresh/01-refresh-all.sql

-- ============================================================================
-- COMPLETION
-- ============================================================================
\echo ''
\echo '============================================================================'
\echo 'DEPLOYMENT COMPLETE'
\echo '============================================================================'
\echo ''
\echo 'Summary:'
\echo '  - Staging:    1 MV + 2 physical tables (lineage)'
\echo '  - Dimensions: 16 tables'
\echo '  - Facts:      10 tables'
\echo ''
\echo 'Next steps:'
\echo '  1. Verify row counts: SELECT COUNT(*) FROM fact_entity_snapshot;'
\echo '  2. Verify row counts: SELECT COUNT(*) FROM fact_entity_term;'
\echo '  3. Publish Mondrian schema to Pentaho Server'
\echo '  4. Clear Mondrian cache'
\echo ''
