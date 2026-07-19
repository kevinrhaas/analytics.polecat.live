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

  // ---- Schema browser (post-overhaul backlog item 5, "dataset delight" —
  // the schema-browser half) --------------------------------------------------
  // List tables/columns for a connection via the SAME engine.query() bridge
  // queryData already uses: a plain ANSI information_schema.columns SELECT,
  // grouped client-side into a table→columns tree. Wired for Snowflake,
  // Databricks, Redshift and PostgREST already; BigQuery joins them here —
  // its INFORMATION_SCHEMA is dataset-qualified (a default dataset makes it
  // reachable unqualified; otherwise a project.region-qualified view lists
  // every dataset in that region). The remaining adapters (generic SQL/HTTP,
  // DuckDB, SQLite) each have their own introspection story — follow-ups,
  // tracked in STATUS.md rather than guessed at here.
  function groupSchemaRows(cols, rows) {
    var idx = {};
    (cols || []).forEach(function (c, i) { idx[String(c).toLowerCase()] = i; });
    var need = ["table_schema", "table_name", "column_name", "data_type"];
    var hasAll = need.every(function (k) { return idx[k] != null; });
    if (!hasAll) return [];
    var byKey = {}, order = [];
    (rows || []).forEach(function (r) {
      var schema = r[idx.table_schema], table = r[idx.table_name];
      var key = schema + " " + table;
      if (!byKey[key]) { byKey[key] = { schema: schema, name: table, columns: [] }; order.push(key); }
      byKey[key].columns.push({ name: r[idx.column_name], type: r[idx.data_type] });
    });
    return order.map(function (k) { return byKey[k]; });
  }
  function ansiListSchema(engine, sqlFn) {
    return function (cfg) {
      return engine.query(cfg, sqlFn(cfg)).then(function (r) {
        return { tables: groupSchemaRows(r.cols, r.rows) };
      }).catch(function (e) {
        return { tables: [], error: (e && e.message) || String(e) };
      });
    };
  }
  var SCHEMA_ORDER = " ORDER BY table_schema, table_name, ordinal_position";
  function quoteDouble(s) { return '"' + String(s).replace(/"/g, '""') + '"'; }
  function quoteBacktick(s) { return "`" + String(s).replace(/`/g, "``") + "`"; }
  function snowflakeSchemaSql(cfg) {
    var db = (cfg && cfg.database || "").trim();
    var scope = (db ? quoteDouble(db) + "." : "") + "information_schema.columns";
    return "SELECT table_schema, table_name, column_name, data_type FROM " + scope + SCHEMA_ORDER;
  }
  function databricksSchemaSql(cfg) {
    var cat = (cfg && cfg.catalog || "").trim();
    var scope = (cat ? quoteBacktick(cat) + "." : "") + "information_schema.columns";
    return "SELECT table_schema, table_name, column_name, data_type FROM " + scope + SCHEMA_ORDER;
  }
  function redshiftSchemaSql() {
    return "SELECT table_schema, table_name, column_name, data_type FROM information_schema.columns" +
      " WHERE table_schema NOT IN ('pg_catalog', 'information_schema')" + SCHEMA_ORDER;
  }
  // A default dataset makes INFORMATION_SCHEMA.COLUMNS reachable unqualified (runQuery already
  // sends {defaultDataset} whenever cfg.dataset is set — same trick the query preview relies on).
  // With no default dataset, fall back to the project.region-qualified view that lists every
  // dataset in that region: `project`.`region-<location>`.INFORMATION_SCHEMA.COLUMNS.
  function bigquerySchemaSql(cfg) {
    var dataset = (cfg && cfg.dataset || "").trim();
    if (dataset) {
      return "SELECT table_schema, table_name, column_name, data_type FROM INFORMATION_SCHEMA.COLUMNS" + SCHEMA_ORDER;
    }
    var project = (cfg && cfg.project || "").trim();
    var region = "region-" + ((cfg && cfg.location) || "US").trim().toLowerCase().replace(/\s+/g, "-");
    var scope = quoteBacktick(project) + "." + quoteBacktick(region) + ".INFORMATION_SCHEMA.COLUMNS";
    return "SELECT table_schema, table_name, column_name, data_type FROM " + scope + SCHEMA_ORDER;
  }

  function dataAdapter(def, engine, schemaSql) {
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
    if (schemaSql) def.listSchema = ansiListSchema(engine, schemaSql);
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
  }, Studio.Snowflake, snowflakeSchemaSql);

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
  }, Studio.Databricks, databricksSchemaSql);

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
  }, Studio.BigQuery, bigquerySchemaSql);

  dataAdapter({
    id: "redshift", label: "Amazon Redshift", icon: "redshift", accent: "#8C4FFF",
    blurb: "Query a Redshift cluster or Serverless workgroup via the Data API — SigV4-signed requests straight from the browser, no backend/proxy; async statement execution with automatic polling.",
    fields: [
      { key: "region", label: "AWS region", placeholder: "us-east-1", type: "text" },
      { key: "accessKeyId", label: "Access key ID", placeholder: "AKIA…", type: "text" },
      { key: "secretAccessKey", label: "Secret access key", placeholder: "…", type: "password" },
      { key: "sessionToken", label: "Session token", placeholder: "optional — for temporary/STS credentials", type: "password" },
      { key: "database", label: "Database", placeholder: "dev", type: "text" },
      { key: "clusterIdentifier", label: "Cluster identifier", placeholder: "my-cluster (provisioned clusters)", type: "text" },
      { key: "dbUser", label: "Database user", placeholder: "awsuser (provisioned clusters, temporary credentials)", type: "text" },
      { key: "workgroupName", label: "Workgroup name", placeholder: "my-workgroup (Serverless — leave Cluster identifier blank)", type: "text" },
      { key: "endpoint", label: "Custom endpoint", placeholder: "optional — VPC PrivateLink URL", type: "text" }
    ],
    docsUrl: "https://docs.aws.amazon.com/redshift-data/latest/APIReference/Welcome.html"
  }, Studio.Redshift, redshiftSchemaSql);

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
