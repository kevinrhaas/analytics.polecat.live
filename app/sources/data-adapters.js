/* app/sources/data-adapters.js — the existing browser-native query engines
   (Snowflake, Databricks, BigQuery, DuckDB-Wasm, SQLite-httpvfs, generic
   SQL-over-HTTP) wrapped into the source-adapter contract (see schema.js)
   and registered as DATA-plane adapters: you make a Connection with one of
   these, then define Datasets (SQL against that connection) that feed
   dashboards. The engines themselves are untouched — each adapter is a thin
   bridge over the Studio.<Engine>.testConnection/query façade every engine
   already exposes, so the proven CORS/error/lazy-load behavior carries over.

   These adapters are data-only (caps.meta:false): a warehouse is where
   dashboard data lives, not where the app's own workspace metadata goes —
   that plane belongs to local/turso/supabase/firebase (sources/*.js). */
(function () {
  "use strict";

  // engine.query(cfg, sql) → {cols, rows} bridged to the contract's
  // queryData(cfg, dataset) → {columns, rows}; errors come back in-band.
  function sqlBridge(engine) {
    return function (cfg, dataset) {
      var sql = (dataset && dataset.sql) || "";
      if (!sql.trim()) return Promise.resolve({ columns: [], rows: [], error: "Dataset has no SQL" });
      return engine.query(cfg, sql).then(function (r) {
        return { columns: r.cols || [], rows: r.rows || [] };
      }).catch(function (e) {
        return { columns: [], rows: [], error: (e && e.message) || String(e) };
      });
    };
  }
  function testBridge(engine) {
    return function (cfg) {
      return engine.testConnection(cfg).then(function (r) {
        return r.ok ? { ok: true } : { ok: false, error: r.error || "Connection test failed" };
      });
    };
  }
  function dataAdapter(def, engine) {
    def.icon = def.icon || "db";
    def.caps = { meta: false, data: true };
    def.browserProvision = false;
    def.testData = testBridge(engine);
    def.queryData = sqlBridge(engine);
    // data-only adapters satisfy the meta-plane surface with honest refusals,
    // so generic UI can call any method without existence checks
    def.test = def.testData;
    def.probe = function () { return Promise.resolve({ state: "foreign", tables: [] }); };
    def.provision = function () { return Promise.resolve({ ok: false, error: def.label + " holds dashboard data, not the app workspace — pick Local, Turso, Supabase or Firebase for the backend." }); };
    def.summarize = function () { return Promise.resolve({ tables: [] }); };
    def.drop = function () { return Promise.resolve({ ok: false, error: "Not a workspace backend" }); };
    def.load = function () { return Promise.resolve(Studio.WS.emptySnapshot()); };
    def.save = function () { return Promise.resolve({ ok: false, error: "Not a workspace backend" }); };
    Studio.registerSource(def);
  }

  dataAdapter({
    id: "snowflake", label: "Snowflake", icon: "snowflake", accent: "#29B5E8",
    blurb: "Query a Snowflake warehouse via the SQL API v2 — needs a programmatic access token and this origin CORS allow-listed on the account.",
    fields: [
      { key: "account", label: "Account identifier", placeholder: "xy12345.us-east-1", type: "text", hint: "The part before .snowflakecomputing.com." },
      { key: "token", label: "Access token", placeholder: "a Programmatic Access Token or OAuth token", type: "password", hint: "Never a username/password — create a PAT in Snowsight." },
      { key: "warehouse", label: "Warehouse", placeholder: "COMPUTE_WH (optional)", type: "text" },
      { key: "database", label: "Database", placeholder: "optional", type: "text" },
      { key: "schema", label: "Schema", placeholder: "optional", type: "text" },
      { key: "role", label: "Role", placeholder: "optional", type: "text" }
    ],
    docsUrl: "https://docs.snowflake.com/en/developer-guide/sql-api/intro"
  }, Studio.Snowflake);

  dataAdapter({
    id: "databricks", label: "Databricks", icon: "databricks", accent: "#FF3621",
    blurb: "Query a Databricks SQL warehouse via the Statement Execution API — needs a token and this origin CORS allow-listed on the workspace.",
    fields: [
      { key: "host", label: "Workspace host", placeholder: "adb-1234567890.12.azuredatabricks.net", type: "text" },
      { key: "token", label: "Access token", placeholder: "dapi… (a personal access token)", type: "password" },
      { key: "warehouseId", label: "SQL warehouse ID", placeholder: "1234567890abcdef", type: "text", hint: "SQL Warehouses → your warehouse → Connection details." },
      { key: "catalog", label: "Catalog", placeholder: "optional", type: "text" },
      { key: "schema", label: "Schema", placeholder: "optional", type: "text" }
    ],
    docsUrl: "https://docs.databricks.com/api/workspace/statementexecution"
  }, Studio.Databricks);

  dataAdapter({
    id: "bigquery", label: "BigQuery", icon: "bigquery", accent: "#4285F4",
    blurb: "Query a BigQuery dataset via the jobs.query REST API — needs a Google OAuth access token.",
    fields: [
      { key: "project", label: "Project ID", placeholder: "my-gcp-project", type: "text" },
      { key: "token", label: "OAuth access token", placeholder: "ya29.… (a Google OAuth token)", type: "password", hint: "e.g. `gcloud auth print-access-token` — short-lived." },
      { key: "location", label: "Location", placeholder: "US (optional)", type: "text" },
      { key: "dataset", label: "Default dataset", placeholder: "optional", type: "text" }
    ],
    docsUrl: "https://cloud.google.com/bigquery/docs/reference/rest/v2/jobs/query"
  }, Studio.BigQuery);

  dataAdapter({
    id: "duckdb", label: "DuckDB (remote file)", icon: "duckdb", accent: "#FFDE00",
    blurb: "Query a Parquet/CSV file straight from S3/HTTP in-browser via DuckDB-Wasm — no backend, no proxy, file needs CORS + Range requests.",
    fields: [
      { key: "fileUrl", label: "File URL", placeholder: "https://bucket.s3.amazonaws.com/data.parquet", type: "text" },
      { key: "fileFormat", label: "Format", placeholder: "auto | parquet | csv", type: "text", hint: "Leave 'auto' to sniff from the extension." }
    ],
    docsUrl: "https://duckdb.org/docs/api/wasm/overview"
  }, Studio.DuckDB);

  dataAdapter({
    id: "sqlite", label: "SQLite (remote .sqlite)", icon: "sqlite", accent: "#0F80CC",
    blurb: "Query a .sqlite file over HTTP Range Requests (sql.js-httpvfs) — indexed lookups without downloading the whole file.",
    fields: [
      { key: "fileUrl", label: "File URL", placeholder: "https://example.com/data.sqlite", type: "text" },
      { key: "tableName", label: "Table", placeholder: "optional — first table when blank", type: "text" }
    ],
    docsUrl: "https://github.com/phiresky/sql.js-httpvfs"
  }, Studio.SQLiteHttp);

  dataAdapter({
    id: "httpsql", label: "Generic SQL / HTTP", icon: "globe", accent: "#6b7688",
    blurb: "POST/GET a JSON API that runs SQL and returns rows — any in-house query service or provider without a dedicated adapter yet.",
    fields: [
      { key: "url", label: "Endpoint URL", placeholder: "https://api.example.com/query", type: "text" },
      { key: "method", label: "Method", placeholder: "POST (default) or GET", type: "text" },
      { key: "authHeader", label: "Authorization header", placeholder: "Bearer … (optional)", type: "password" },
      { key: "paramName", label: "SQL parameter name", placeholder: "sql (default)", type: "text", hint: "The JSON body / query-string key the endpoint expects the SQL in." }
    ],
    docsUrl: ""
  }, Studio.GenericSql);
}());
