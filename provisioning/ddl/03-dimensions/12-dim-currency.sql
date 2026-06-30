-- ============================================================================
-- DIMENSION: dim_currency
-- ============================================================================
-- Currency lookup with USD conversion rate (small reference dim).
-- ============================================================================

CREATE MATERIALIZED VIEW dim_currency AS
SELECT
  md5(currency_symbol) AS currency_key,
  currency_symbol,
  "ConversionRateToUSD"::numeric(18,8) AS conversion_rate_to_usd
FROM currency_exchange_rates
WHERE currency_symbol IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dim_currency_key ON dim_currency(currency_key);
