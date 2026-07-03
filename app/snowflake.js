/* Analytics Dashboard Studio — © 2026 Polecat.live. See LICENSE. */
/* Z4 slice 1 — Snowflake connector: query a Snowflake warehouse directly from the browser via
   the SQL API v2 (https://{account}.snowflakecomputing.com/api/v2/statements), no backend/proxy.
   Unlike the Z14 file connectors (DuckDB-Wasm/SQLite-WASM), this one is credential-based and
   needs the target Snowflake account to explicitly allow the app's origin — Snowflake blocks
   cross-origin calls by default. The account admin must add this origin (or *) to the account's
   ALLOWED_HTTP_ORIGINS network policy before a live call will succeed; until then, every request
   fails with a CORS error surfaced through the same friendly-error path the file connectors use.
   Studio.Snowflake is a small façade over the REST calls, no engine to lazy-load:
     testConnection(cfg)   — runs "SELECT 1" to prove account/token/warehouse are all valid
     query(cfg, sql)       — run an arbitrary SQL string against the configured warehouse
   cfg = { account, token, tokenType, warehouse, database, schema, role }
     account   — account identifier, e.g. "xy12345.us-east-1" (the part before .snowflakecomputing.com)
     token     — a Programmatic Access Token or OAuth access token (never a username/password)
     tokenType — "PROGRAMMATIC_ACCESS_TOKEN" (default) or "OAUTH", sets the auth header Snowflake expects */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  var POLL_MS = 1000, POLL_MAX = 15; // statement execution can go async (202); poll up to ~15s

  function baseUrl(account) { return "https://" + String(account || "").trim() + ".snowflakecomputing.com/api/v2/statements"; }

  function authHeaders(cfg) {
    return {
      "Authorization": "Bearer " + (cfg.token || ""),
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-Snowflake-Authorization-Token-Type": cfg.tokenType || "PROGRAMMATIC_ACCESS_TOKEN"
    };
  }

  // Snowflake's SQL API v2 rowType/data shape -> the {cols, rows} shape every other connector
  // returns (sampleRows()/doQuery()/DuckDB.query()/SQLiteHttp.query() all agree on this shape).
  function toResult(json) {
    var meta = (json.resultSetMetaData && json.resultSetMetaData.rowType) || [];
    var cols = meta.map(function (c) { return c.name; });
    var rows = (json.data || []).map(function (r) { return r.slice(); });
    return { cols: cols, rows: rows, columns: meta.map(function (c) { return { name: c.name, type: c.type || "TEXT" }; }) };
  }

  // Fires the statement, then polls GET /statements/{handle} while Snowflake reports 202
  // (still executing) up to POLL_MAX times. Rejects with a plain Error on any HTTP/network failure.
  function runStatement(cfg, sql) {
    var account = String((cfg && cfg.account) || "").trim();
    if (!account) return Promise.reject(new Error("Enter an account identifier first."));
    if (!cfg.token) return Promise.reject(new Error("Enter an access token first."));
    var body = { statement: sql, timeout: 60, resultSetMetaData: { format: "json" } };
    if (cfg.warehouse) body.warehouse = cfg.warehouse;
    if (cfg.database) body.database = cfg.database;
    if (cfg.schema) body.schema = cfg.schema;
    if (cfg.role) body.role = cfg.role;

    function parse(res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (res.status === 202 && json.statementHandle) return poll(json.statementHandle, 0);
        if (!res.ok) throw new Error((json.message || res.statusText || ("HTTP " + res.status)));
        return toResult(json);
      });
    }
    function poll(handle, attempt) {
      if (attempt >= POLL_MAX) throw new Error("Statement is still executing after " + (POLL_MAX * POLL_MS / 1000) + "s — try again or simplify the query.");
      return new Promise(function (resolve) { setTimeout(resolve, POLL_MS); }).then(function () {
        return fetch(baseUrl(account) + "/" + encodeURIComponent(handle), { method: "GET", headers: authHeaders(cfg) })
          .then(function (res) {
            if (res.status === 202) return poll(handle, attempt + 1);
            return res.json().then(function (json) {
              if (!res.ok) throw new Error((json.message || res.statusText || ("HTTP " + res.status)));
              return toResult(json);
            });
          });
      });
    }

    return Studio.withTimeout(
      fetch(baseUrl(account), { method: "POST", headers: authHeaders(cfg), body: JSON.stringify(body) }).then(parse),
      25000, "Querying Snowflake"
    );
  }

  Studio.Snowflake = {
    // Never rejects — resolves {ok:false, error} on any failure (bad account/token, CORS blocked
    // by the account's network policy, warehouse suspended, network unreachable) so the inspector
    // shows a clear message instead of a stuck spinner.
    testConnection: function (cfg) {
      return runStatement(cfg, "SELECT 1 AS ok").then(function (result) {
        return { ok: true, columns: result.columns, cols: result.cols, rows: result.rows };
      }).catch(function (e) {
        return { ok: false, error: Studio.friendlyConnectorError((e && e.message) || String(e)) };
      });
    },

    // Rejects on failure (mirrors Studio.PentahoClient().doQuery()'s / Studio.DuckDB.query()'s
    // contract) so callers reuse the same .then/.catch pattern as the existing "Run live" preview.
    query: function (cfg, sql) {
      return runStatement(cfg, (sql && sql.trim()) || "SELECT 1 AS ok");
    }
  };
})();
