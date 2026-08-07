/* Analytics — © 2026 Polecat.live. See LICENSE. */
/* Z4 slice 2 — Databricks connector: query a Databricks SQL warehouse directly from the browser via
   the Statement Execution API (https://{host}/api/2.0/sql/statements), no backend/proxy. Credential-
   based like the Z4 slice 1 Snowflake connector — a personal access token, never a password — and the
   workspace must allow this origin (Databricks doesn't emit permissive CORS headers by default; some
   workspaces need an admin-configured CORS policy) or every call fails on CORS.
   Studio.Databricks is a small façade over the REST calls, no engine to lazy-load:
     testConnection(cfg) — runs "SELECT 1" to prove host/token/warehouse are all valid
     query(cfg, sql)     — run an arbitrary SQL string against the configured warehouse
   cfg = { host, token, warehouseId, catalog, schema }
     host        — workspace hostname, e.g. "dbc-a1b2c3d4-e5f6.cloud.databricks.com" (no protocol)
     token       — a personal access token (Settings → Developer → Access tokens), never a password
     warehouseId — the SQL warehouse id (Databricks SQL → Warehouses → the warehouse → Connection details) */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  var POLL_MS = 1000, POLL_MAX = 20; // statements often start PENDING/RUNNING; poll up to ~20s

  function baseUrl(host) { return "https://" + String(host || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "") + "/api/2.0/sql/statements"; }

  function authHeaders(cfg) {
    return { "Authorization": "Bearer " + (cfg.token || ""), "Content-Type": "application/json", "Accept": "application/json" };
  }

  // Databricks' manifest.schema.columns / result.data_array shape -> the {cols, rows} shape every
  // other connector returns (sampleRows()/doQuery()/DuckDB.query()/Snowflake.query() all agree on this).
  function toResult(json) {
    var cols = ((json.manifest && json.manifest.schema && json.manifest.schema.columns) || []);
    var names = cols.map(function (c) { return c.name; });
    var rows = ((json.result && json.result.data_array) || []).map(function (r) { return r.slice(); });
    return { cols: names, rows: rows, columns: cols.map(function (c) { return { name: c.name, type: c.type_name || c.type_text || "TEXT" }; }) };
  }

  // Fires the statement, then polls GET /statements/{id} while Databricks reports PENDING/RUNNING,
  // up to POLL_MAX times. Rejects with a plain Error on any HTTP/network failure or CANCELED/FAILED.
  function runStatement(cfg, sql) {
    var host = String((cfg && cfg.host) || "").trim();
    if (!host) return Promise.reject(new Error("Enter a workspace host first."));
    if (!cfg.warehouseId) return Promise.reject(new Error("Enter a SQL warehouse id first."));
    if (!cfg.token) return Promise.reject(new Error("Enter a personal access token first."));
    var body = { statement: sql, warehouse_id: cfg.warehouseId, wait_timeout: "30s", disposition: "INLINE", format: "JSON_ARRAY" };
    if (cfg.catalog) body.catalog = cfg.catalog;
    if (cfg.schema) body.schema = cfg.schema;

    function handleStatus(res, json) {
      if (!res.ok) throw new Error((json && json.message) || res.statusText || ("HTTP " + res.status));
      var state = json.status && json.status.state;
      if (state === "SUCCEEDED") return toResult(json);
      if (state === "FAILED" || state === "CANCELED" || state === "CLOSED") {
        var msg = (json.status && json.status.error && json.status.error.message) || ("Statement " + (state || "").toLowerCase());
        throw new Error(msg);
      }
      return poll(json.statement_id, 0); // PENDING / RUNNING
    }
    function poll(id, attempt) {
      if (attempt >= POLL_MAX) throw new Error("Statement is still executing after " + (POLL_MAX * POLL_MS / 1000) + "s — try again or simplify the query.");
      return new Promise(function (resolve) { setTimeout(resolve, POLL_MS); }).then(function () {
        return fetch(baseUrl(host) + "/" + encodeURIComponent(id), { method: "GET", headers: authHeaders(cfg) })
          .then(function (res) { return res.json().catch(function () { return {}; }).then(function (json) { return handleStatus(res, json); }); });
      });
    }

    return Studio.withTimeout(
      fetch(baseUrl(host), { method: "POST", headers: authHeaders(cfg), body: JSON.stringify(body) })
        .then(function (res) { return res.json().catch(function () { return {}; }).then(function (json) { return handleStatus(res, json); }); }),
      35000, "Querying Databricks"
    );
  }

  Studio.Databricks = {
    // Never rejects — resolves {ok:false, error} on any failure (bad host/token, CORS blocked by the
    // workspace, warehouse stopped, network unreachable) so the inspector shows a clear message
    // instead of a stuck spinner.
    testConnection: function (cfg) {
      return runStatement(cfg, "SELECT 1 AS ok").then(function (result) {
        return { ok: true, columns: result.columns, cols: result.cols, rows: result.rows };
      }).catch(function (e) {
        return { ok: false, error: Studio.friendlyConnectorError((e && e.message) || String(e)) };
      });
    },

    // Rejects on failure (mirrors Studio.Snowflake.query()'s contract) so callers reuse the same
    // .then/.catch pattern as the existing "Run live" preview.
    query: function (cfg, sql) {
      return runStatement(cfg, (sql && sql.trim()) || "SELECT 1 AS ok");
    }
  };
})();
