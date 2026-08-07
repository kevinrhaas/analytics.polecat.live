/* Analytics — © 2026 Polecat.live. See LICENSE. */
/* Z4 slice 4 — Generic SQL/HTTP connector: query ANY JSON API that accepts a SQL string and
   returns rows, straight from the browser, no backend/proxy. This is the "escape hatch" connector
   for in-house query services, serverless functions, or any provider not yet covered by a named
   connector (Redshift/Synapse/etc. can all go through this until they earn a dedicated slice).
   Studio.GenericSql is a small façade, same shape as Snowflake/Databricks/BigQuery:
     testConnection(cfg) — sends a "SELECT 1" probe to prove the endpoint + auth work
     query(cfg, sql)     — sends an arbitrary SQL string, returns the parsed rows
   cfg = { url, method, authHeader, paramName }
     url        — the HTTP endpoint that runs the query and answers with JSON
     method     — "POST" (default, JSON body) or "GET" (query string)
     authHeader — optional raw Authorization header value, e.g. "Bearer xyz" or "Basic xyz…"
     paramName  — the body key / query-string key carrying the SQL text (default "sql")
   Accepts three response shapes, so it fits most home-grown "run this SQL" endpoints without
   requiring the endpoint to match Studio's own {cols,rows} convention:
     [{"col":1,...}, ...]              — array of row objects (columns inferred from the first row)
     {"data":[{"col":1,...}, ...]}     — same, nested under "data"
     {"columns":[...],"rows":[[...]]}  — already column/row shaped */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  function rowsFromObjects(arr) {
    var cols = arr.length ? Object.keys(arr[0]) : [];
    var rows = arr.map(function (o) { return cols.map(function (c) { return o[c]; }); });
    return { cols: cols, rows: rows, columns: cols.map(function (name) { return { name: name, type: "STRING" }; }) };
  }

  function toResult(json) {
    if (Array.isArray(json)) return rowsFromObjects(json);
    if (json && Array.isArray(json.rows) && Array.isArray(json.columns)) {
      return { cols: json.columns, rows: json.rows, columns: json.columns.map(function (name) { return { name: name, type: "STRING" }; }) };
    }
    if (json && Array.isArray(json.data)) return rowsFromObjects(json.data);
    throw new Error("Unexpected response shape — expected an array of row objects, {data:[...]}, or {columns,rows}.");
  }

  function runQuery(cfg, sql) {
    var url = String((cfg && cfg.url) || "").trim();
    if (!url) return Promise.reject(new Error("Enter an endpoint URL first."));
    var method = ((cfg && cfg.method) || "POST").toUpperCase();
    var paramName = ((cfg && cfg.paramName) || "sql").trim() || "sql";
    var headers = { "Accept": "application/json" };
    if (cfg.authHeader) headers.Authorization = cfg.authHeader;

    var req;
    if (method === "GET") {
      var sep = url.indexOf("?") >= 0 ? "&" : "?";
      req = fetch(url + sep + encodeURIComponent(paramName) + "=" + encodeURIComponent(sql), { method: "GET", headers: headers });
    } else {
      headers["Content-Type"] = "application/json";
      var body = {}; body[paramName] = sql;
      req = fetch(url, { method: "POST", headers: headers, body: JSON.stringify(body) });
    }

    return Studio.withTimeout(
      req.then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (json) {
          if (!res.ok) throw new Error((json && (json.error || json.message)) || res.statusText || ("HTTP " + res.status));
          return toResult(json);
        });
      }),
      30000, "Querying the endpoint"
    );
  }

  Studio.GenericSql = {
    // Never rejects — resolves {ok:false, error} on any failure (bad URL, CORS, auth, unexpected
    // response shape) so the inspector shows a clear message instead of a stuck spinner.
    testConnection: function (cfg) {
      return runQuery(cfg, "SELECT 1 AS ok").then(function (result) {
        return { ok: true, columns: result.columns, cols: result.cols, rows: result.rows };
      }).catch(function (e) {
        return { ok: false, error: Studio.friendlyConnectorError((e && e.message) || String(e)) };
      });
    },

    // Rejects on failure (mirrors Snowflake/Databricks/BigQuery's .query() contract) so callers
    // reuse the same .then/.catch pattern as the existing "Run live" preview.
    query: function (cfg, sql) {
      return runQuery(cfg, (sql && sql.trim()) || "SELECT 1 AS ok");
    }
  };
})();
