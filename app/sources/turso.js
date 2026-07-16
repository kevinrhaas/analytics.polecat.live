/* app/sources/turso.js — Turso (libSQL / SQLite over HTTP). Ported from
   manager.polecat.live/js/sources/turso.js, extended with the data plane.

   The reference REMOTE adapter. Turso exposes a plain HTTP endpoint
   (`/v2/pipeline`) that accepts arbitrary SQL — DDL included — authenticated
   with a bearer token, so the whole flow works entirely from a static browser
   page with no server and no build step:
     probe → empty? provision (CREATE everything) → push local up → connected
     probe → ours?  load it → adopt as source of truth
     probe → foreign? warn; or summarise + offer to drop

   Because the same endpoint runs arbitrary SELECTs, this adapter is also
   DATA-capable: a dataset with kind:'sql' executes directly against the
   database, which makes Turso the first backend that can both host the
   workspace metadata AND feed dashboards. */
(function () {
  "use strict";
  var WS = Studio.WS;

  // Normalise a user-entered URL to the HTTP pipeline endpoint. Turso DB URLs
  // are often given as `libsql://name-org.turso.io` — the HTTP API is the same
  // host over https.
  function pipelineUrl(rawUrl) {
    var u = (rawUrl || "").trim();
    if (!u) throw new Error("Database URL is required");
    u = u.replace(/^libsql:\/\//i, "https://").replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return u + "/v2/pipeline";
  }

  // Run a batch of SQL statements in one pipeline request. Each stmt is
  // { sql } or { sql, args:[{type,value}] }. Resolves the array of results
  // (one per statement) or rejects with a useful message.
  function pipeline(cfg, statements) {
    var body = {
      requests: statements.map(function (s) { return { type: "execute", stmt: s }; }).concat([{ type: "close" }])
    };
    var url;
    try { url = pipelineUrl(cfg.url); } catch (e) { return Promise.reject(e); }
    return fetch(url, {
      method: "POST",
      headers: { "Authorization": "Bearer " + (cfg.token || "").trim(), "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).catch(function (e) {
      throw new Error("Could not reach Turso (network or CORS): " + e.message);
    }).then(function (res) {
      if (res.status === 401 || res.status === 403) throw new Error("Turso rejected the auth token (401/403)");
      if (!res.ok) throw new Error("Turso HTTP " + res.status);
      return res.json();
    }).then(function (json) {
      var results = json.results || [];
      // The pipeline reports per-statement errors inline rather than as HTTP codes.
      var failed = results.filter(function (r) { return r.type === "error"; })[0];
      if (failed) throw new Error("Turso SQL error: " + ((failed.error && failed.error.message) || "unknown"));
      return results.map(function (r) { return r.response && r.response.result; }).filter(Boolean);
    });
  }

  // Single-statement convenience → { cols:[names], rows:[[values]] }.
  function query(cfg, sql, args) {
    return pipeline(cfg, [args ? { sql: sql, args: args } : { sql: sql }]).then(function (results) {
      var result = results[0];
      if (!result) return { cols: [], rows: [] };
      var cols = (result.cols || []).map(function (c) { return c.name; });
      var rows = (result.rows || []).map(function (r) {
        return r.map(function (cell) { return cell && cell.value != null ? cell.value : null; });
      });
      return { cols: cols, rows: rows };
    });
  }

  function arg(v) {
    if (v == null) return { type: "null" };
    if (typeof v === "number") return { type: Number.isInteger(v) ? "integer" : "float", value: String(v) };
    return { type: "text", value: String(v) };
  }

  function listTables(cfg) {
    return query(cfg, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' AND name NOT LIKE 'libsql_%'")
      .then(function (r) { return r.rows.map(function (row) { return row[0]; }); });
  }

  function countRows(cfg, table) {
    return query(cfg, 'SELECT COUNT(*) FROM "' + table + '"')
      .then(function (r) { return Number((r.rows[0] || [])[0] || 0); })
      .catch(function () { return 0; });
  }

  Studio.tursoSource = {
    id: "turso",
    label: "Turso",
    blurb: "SQLite over HTTP. Creates every object itself from the browser, and can both host this workspace and run SQL datasets for dashboards.",
    icon: "db",
    accent: "#4ff8b0",
    caps: { meta: true, data: true },
    browserProvision: true,
    fields: [
      { key: "url", label: "Database URL", placeholder: "libsql://your-db-org.turso.io", type: "text",
        hint: "From the Turso dashboard or `turso db show <name> --url`." },
      { key: "token", label: "Auth token", placeholder: "eyJ… (a database auth token)", type: "password",
        hint: "`turso db tokens create <name>` — a token scoped to this one database." }
    ],
    docsUrl: "https://docs.turso.tech/sdk/http/reference",

    test: function (cfg) {
      return query(cfg, "SELECT 1").then(function () { return { ok: true }; })
        .catch(function (e) { return { ok: false, error: e.message }; });
    },

    probe: function (cfg) {
      return listTables(cfg).then(function (names) {
        var hasMeta = names.indexOf(WS.META_TABLE) >= 0;
        if (hasMeta) {
          var app = null, schemaVersion = null;
          return query(cfg, 'SELECT key, value FROM "' + WS.META_TABLE + "\" WHERE key IN ('app','schema_version')")
            .then(function (r) {
              r.rows.forEach(function (row) {
                if (row[0] === "app") app = row[1];
                if (row[0] === "schema_version") schemaVersion = Number(row[1]);
              });
            }).catch(function () {})
            .then(function () {
              var ours = WS.TABLE_NAMES.filter(function (t) { return names.indexOf(t) >= 0; });
              return Promise.all(ours.map(function (t) {
                return countRows(cfg, t).then(function (c) { return { name: t, count: c }; });
              }));
            }).then(function (tables) {
              return { state: "polecat", app: app, schemaVersion: schemaVersion, tables: tables };
            });
        }
        if (names.length === 0) return { state: "empty", tables: [] };
        // has tables, but none of them ours → a database in use for something else
        return Promise.all(names.map(function (t) {
          return countRows(cfg, t).then(function (c) { return { name: t, count: c }; });
        })).then(function (tables) { return { state: "foreign", tables: tables }; });
      });
    },

    provision: function (cfg, snapshot) {
      return pipeline(cfg, WS.provisionDDL().map(function (sql) { return { sql: sql }; }))
        .then(function () {
          var meta = WS.metaRows(snapshot);
          return pipeline(cfg, meta.map(function (m) {
            return { sql: 'INSERT OR REPLACE INTO "' + WS.META_TABLE + '"(key,value) VALUES(?,?)', args: [arg(m.key), arg(m.value)] };
          }));
        })
        .then(function () { return { ok: true }; })
        .catch(function (e) { return { ok: false, error: e.message }; });
    },

    summarize: function (cfg) { return this.probe(cfg); },

    drop: function (cfg) {
      return listTables(cfg).then(function (names) {
        if (!names.length) return null;
        return pipeline(cfg, names.map(function (n) { return { sql: 'DROP TABLE IF EXISTS "' + n + '"' }; }));
      }).then(function () { return { ok: true }; })
        .catch(function (e) { return { ok: false, error: e.message }; });
    },

    load: function (cfg) {
      var snap = WS.emptySnapshot();
      var reads = WS.TABLE_NAMES.map(function (t) {
        return query(cfg, 'SELECT data FROM "' + t + '"').then(function (r) {
          snap.tables[t] = r.rows.map(function (row) { return WS.cellsToRow(row[0]); }).filter(Boolean);
        }).catch(function () { /* table missing — leave empty */ });
      });
      return Promise.all(reads).then(function () {
        return query(cfg, 'SELECT key,value FROM "' + WS.META_TABLE + '"').then(function (r) {
          r.rows.forEach(function (row) {
            if (row[0] === "settings") { try { snap.settings = JSON.parse(row[1]); } catch (e) {} }
            if (row[0] === "meta") { try { snap.meta = JSON.parse(row[1]); } catch (e) {} }
          });
        }).catch(function () {});
      }).then(function () { return snap; });
    },

    // Full write-through: replace every table's contents with the snapshot in
    // one batched pipeline. Simple + robust for a metadata-sized workspace —
    // no per-row diffing to get subtly wrong across backends. DELETE-then-
    // INSERT inside the same batch is atomic on Turso.
    save: function (cfg, snapshot) {
      var byTable, stmts = [];
      try { byTable = WS.snapshotToRows(snapshot); } catch (e) { return Promise.resolve({ ok: false, error: e.message }); }
      WS.TABLE_NAMES.forEach(function (t) {
        // additive-schema self-heal: a workspace provisioned before a table
        // existed (e.g. v1 → v2 added analyses) gets it created on the next
        // save — idempotent DDL, no manual step for Turso users.
        stmts.push({ sql: WS.tableDDL(t) });
        stmts.push({ sql: 'DELETE FROM "' + t + '"' });
        byTable[t].forEach(function (rec) {
          var keys = Object.keys(rec.cols);
          var colList = ["id"].concat(keys.map(function (k) { return '"' + k + '"'; })).concat(["data"]).join(",");
          var ph = ["?"].concat(keys.map(function () { return "?"; })).concat(["?"]).join(",");
          var args = [arg(rec.id)].concat(keys.map(function (k) { return arg(rec.cols[k]); })).concat([arg(rec.data)]);
          stmts.push({ sql: 'INSERT INTO "' + t + '"(' + colList + ") VALUES(" + ph + ")", args: args });
        });
      });
      WS.metaRows(snapshot).forEach(function (m) {
        stmts.push({ sql: 'INSERT OR REPLACE INTO "' + WS.META_TABLE + '"(key,value) VALUES(?,?)', args: [arg(m.key), arg(m.value)] });
      });
      return pipeline(cfg, stmts).then(function () { return { ok: true }; })
        .catch(function (e) { return { ok: false, error: e.message }; });
    },

    // ---- data plane ---------------------------------------------------------
    testData: function (cfg) { return this.test(cfg); },

    // dataset: { kind:'sql', sql } — params were already substituted by the
    // caller (Studio.WS.applyParams); resolves { columns, rows }.
    queryData: function (cfg, dataset) {
      var sql = (dataset && dataset.sql) || "";
      if (!sql.trim()) return Promise.resolve({ columns: [], rows: [], error: "Dataset has no SQL" });
      return query(cfg, sql).then(function (r) {
        return { columns: r.cols, rows: r.rows };
      }).catch(function (e) { return { columns: [], rows: [], error: e.message }; });
    }
  };
}());
