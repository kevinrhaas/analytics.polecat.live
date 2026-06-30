-- ============================================================================
-- DATA VOLUME MULTIPLIER FUNCTION
-- ============================================================================
-- Set this to 1 for actual data, or higher values to inflate metrics for demos
-- Example: Set to 10 to show 10x the actual storage/counts
-- Change this one value and refresh materialized views to adjust data volume
-- ============================================================================

DO $$
BEGIN
  -- Create or replace the multiplier function
  CREATE OR REPLACE FUNCTION get_data_multiplier() RETURNS numeric AS $func$
    SELECT 1::numeric;  -- Change this value: 1=actual, 10=10x, 100=100x, etc.
  $func$ LANGUAGE sql IMMUTABLE;
END $$;
