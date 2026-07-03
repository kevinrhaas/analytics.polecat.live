/* Analytics Dashboard Studio — © 2026 Polecat.live. See LICENSE. */
/* Z4 slice 3 — BigQuery connector: query a BigQuery dataset directly from the browser via the
   jobs.query REST endpoint (https://bigquery.googleapis.com/bigquery/v2/projects/{project}/queries),
   no backend/proxy. Same credential-based shape as the Z4 Snowflake/Databricks connectors — an OAuth
   access token, never a service-account key file (that would leak a long-lived secret to the browser)
   — and Google's API already sends permissive CORS headers for this endpoint, so (unlike Snowflake/
   Databricks) there's no per-account network-policy step; the token itself is the only gate.
   Studio.BigQuery is a small façade over the REST calls, no engine to lazy-load:
     testConnection(cfg) — runs "SELECT 1" to prove project/token are valid
     query(cfg, sql)     — run an arbitrary GoogleSQL string against the configured project
   cfg = { project, token, location, dataset }
     project  — GCP project id, e.g. "my-analytics-project"
     token    — a short-lived OAuth 2.0 access token (Authorization: Bearer), never a key file
     location — optional job location, e.g. "US" (required for datasets outside the default region)
     dataset  — optional default dataset id (unqualified table names resolve against it) */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  var POLL_MS = 1000, POLL_MAX = 20; // jobComplete can come back false while the query is still running

  function baseUrl(project) { return "https://bigquery.googleapis.com/bigquery/v2/projects/" + encodeURIComponent(String(project || "").trim()) + "/queries"; }

  function authHeaders(cfg) {
    return { "Authorization": "Bearer " + (cfg.token || ""), "Content-Type": "application/json", "Accept": "application/json" };
  }

  // BigQuery's schema.fields / rows[].f[].v shape (values always come back as strings) -> the
  // {cols, rows} shape every other connector returns (sampleRows()/doQuery()/Snowflake.query()/
  // Databricks.query() all agree on this).
  function toResult(json) {
    var fields = (json.schema && json.schema.fields) || [];
    var cols = fields.map(function (f) { return f.name; });
    var rows = (json.rows || []).map(function (r) {
      return (r.f || []).map(function (cell) { return cell ? cell.v : null; });
    });
    return { cols: cols, rows: rows, columns: fields.map(function (f) { return { name: f.name, type: f.type || "STRING" }; }) };
  }

  // Fires the query job, then polls GET /queries/{jobId} while jobComplete is false, up to
  // POLL_MAX times. Rejects with a plain Error on any HTTP/network failure or job error.
  function runQuery(cfg, sql) {
    var project = String((cfg && cfg.project) || "").trim();
    if (!project) return Promise.reject(new Error("Enter a project id first."));
    if (!cfg.token) return Promise.reject(new Error("Enter an access token first."));
    var body = { query: sql, useLegacySql: false, timeoutMs: 10000 };
    if (cfg.location) body.location = cfg.location;
    if (cfg.dataset) body.defaultDataset = { projectId: project, datasetId: cfg.dataset };

    function handle(res, json) {
      if (!res.ok) throw new Error((json.error && json.error.message) || res.statusText || ("HTTP " + res.status));
      if (json.jobComplete) return toResult(json);
      return poll(json.jobReference && json.jobReference.jobId, 0);
    }
    function poll(jobId, attempt) {
      if (!jobId) throw new Error("BigQuery didn't return a job id to poll.");
      if (attempt >= POLL_MAX) throw new Error("Query is still running after " + (POLL_MAX * POLL_MS / 1000) + "s — try again or simplify the query.");
      return new Promise(function (resolve) { setTimeout(resolve, POLL_MS); }).then(function () {
        var url = baseUrl(project) + "/" + encodeURIComponent(jobId) + (cfg.location ? "?location=" + encodeURIComponent(cfg.location) : "");
        return fetch(url, { method: "GET", headers: authHeaders(cfg) })
          .then(function (res) { return res.json().catch(function () { return {}; }).then(function (json) { return handle(res, json); }); });
      });
    }

    return Studio.withTimeout(
      fetch(baseUrl(project), { method: "POST", headers: authHeaders(cfg), body: JSON.stringify(body) })
        .then(function (res) { return res.json().catch(function () { return {}; }).then(function (json) { return handle(res, json); }); }),
      30000, "Querying BigQuery"
    );
  }

  Studio.BigQuery = {
    // Never rejects — resolves {ok:false, error} on any failure (bad project/token, expired token,
    // network unreachable) so the inspector shows a clear message instead of a stuck spinner.
    testConnection: function (cfg) {
      return runQuery(cfg, "SELECT 1 AS ok").then(function (result) {
        return { ok: true, columns: result.columns, cols: result.cols, rows: result.rows };
      }).catch(function (e) {
        return { ok: false, error: Studio.friendlyConnectorError((e && e.message) || String(e)) };
      });
    },

    // Rejects on failure (mirrors Studio.Snowflake.query()'s / Studio.Databricks.query()'s contract)
    // so callers reuse the same .then/.catch pattern as the existing "Run live" preview.
    query: function (cfg, sql) {
      return runQuery(cfg, (sql && sql.trim()) || "SELECT 1 AS ok");
    }
  };
})();
