/* Analytics Dashboard Studio — © 2026 Polecat.live. See LICENSE. */
/* Z14 slice 3 — SQLite-WASM + HTTP-VFS connector: query a `.sqlite` file hosted anywhere over
   plain HTTP by intercepting SQLite's page reads and turning them into HTTP Range Requests, so
   an indexed lookup on a multi-GB file transfers only the handful of ~4KB pages it touches.
   Entirely client-side — no backend, no proxy, no saved credentials. Best fit for relational /
   indexed-lookup workloads (vs. Z14 slice 1's DuckDB-Wasm, tuned for columnar aggregation).
   The engine (sql.js-httpvfs) is lazy-loaded from a CDN only the first time a "sqlite" data
   source is tested or queried, so the base app stays small for everyone who never touches this
   connector. sql.js-httpvfs ships as a UMD bundle (no ESM build), so it's loaded via a classic
   <script> tag rather than dynamic import() (see app/duckdb.js for the ESM-import equivalent).
   Studio.SQLiteHttp is a small façade over its worker/wasm boot sequence:
     ensureEngine()        — lazy-load the sql.js-httpvfs UMD bundle (global createDbWorker)
     testConnection(cfg)   — probe a file URL: table list, schema (PRAGMA), and a 5-row sample
     query(cfg, sql)       — run an arbitrary SQL string against the opened database
   cfg = { fileUrl, tableName }  — tableName is optional; testConnection auto-picks the first
   table in the file when omitted, and query() defaults to "SELECT * FROM <tableName> LIMIT 200"
   when no explicit sql is given. */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  var CDN_BASE = "https://cdn.jsdelivr.net/npm/sql.js-httpvfs@0.8.12/dist/";

  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error((label || "Operation") + " timed out — check the URL and your network connection.")); }, ms);
      promise.then(
        function (v) { clearTimeout(timer); resolve(v); },
        function (e) { clearTimeout(timer); reject(e); }
      );
    });
  }

  function quoteIdent(name) { return '"' + String(name).replace(/"/g, '""') + '"'; }

  // array-of-plain-objects (sql.js-httpvfs's row shape) -> {cols, rows}, the same shape
  // sampleRows()/doQuery()/DuckDB.query() already return, so callers don't need to branch.
  function objectsToResult(objs, fallbackCols) {
    var cols = (objs.length ? Object.keys(objs[0]) : fallbackCols) || [];
    var rows = objs.map(function (o) { return cols.map(function (c) { return o[c]; }); });
    return { cols: cols, rows: rows };
  }

  var _scriptPromise = null;
  // Injects the sql.js-httpvfs UMD bundle as a classic <script> tag (it has no ESM build, so
  // dynamic import() isn't an option — see file header) and waits for the global createDbWorker
  // function it attaches to window. Cached so repeated Test/Run-live clicks reuse the same load.
  function ensureEngine() {
    if (_scriptPromise) return _scriptPromise;
    _scriptPromise = withTimeout((function () {
      if (typeof window.createDbWorker === "function") return Promise.resolve(window.createDbWorker);
      return new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = CDN_BASE + "index.js"; s.async = true;
        s.onload = function () {
          if (typeof window.createDbWorker !== "function") { reject(new Error("sql.js-httpvfs loaded but createDbWorker is missing.")); return; }
          resolve(window.createDbWorker);
        };
        s.onerror = function () { reject(new Error("Failed to load the SQLite engine script.")); };
        document.head.appendChild(s);
      });
    })(), 20000, "Loading the SQLite engine").catch(function (e) { _scriptPromise = null; throw e; });
    return _scriptPromise;
  }
  Studio.SQLiteHttp_ensureEngine = ensureEngine; // exposed so tests can stub/observe it

  var _dbCache = {}; // fileUrl -> Promise<WorkerHttpvfs> — one open httpvfs worker per distinct file
  // Opens (or reuses) a worker-backed connection to cfg.fileUrl over HTTP Range Requests, then
  // hands its `db` handle to `fn`. The shared entry point for both testConnection() and query().
  function withDb(cfg, fn) {
    var fileUrl = String((cfg && cfg.fileUrl) || "").trim();
    if (!fileUrl) return Promise.reject(new Error("Enter a file URL first."));
    if (!_dbCache[fileUrl]) {
      _dbCache[fileUrl] = ensureEngine().then(function (createDbWorker) {
        var config = { from: "inline", config: { serverMode: "full", url: fileUrl, requestChunkSize: 4096 } };
        return withTimeout(createDbWorker([config], CDN_BASE + "sqlite.worker.js", CDN_BASE + "sql-wasm.wasm"), 20000, "Opening the SQLite database");
      }).catch(function (e) { delete _dbCache[fileUrl]; throw e; });
    }
    return _dbCache[fileUrl].then(function (worker) { return fn(worker.db); });
  }

  // Probes a file: table list + PRAGMA schema for the chosen (or first) table + a small sample.
  // Never rejects — resolves {ok:false, error} on any failure (bad URL, no CORS/Range support,
  // network unreachable, engine load failure, no tables) so the UI shows a clear message instead
  // of a stuck spinner.
  Studio.SQLiteHttp = {
    ensureEngine: ensureEngine,

    testConnection: function (cfg) {
      return withDb(cfg, function (db) {
        return db.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").then(function (tableRows) {
          var tables = tableRows.map(function (r) { return r.name; });
          var table = (cfg && cfg.tableName) || tables[0];
          if (!table) throw new Error("No tables found in this SQLite file.");
          return db.query("PRAGMA table_info(" + quoteIdent(table) + ")").then(function (info) {
            var columns = info.map(function (r) { return { name: r.name, type: r.type || "TEXT" }; });
            return db.query("SELECT * FROM " + quoteIdent(table) + " LIMIT 5").then(function (sampleRows) {
              var res = objectsToResult(sampleRows, columns.map(function (c) { return c.name; }));
              return { ok: true, table: table, tables: tables, columns: columns, cols: res.cols, rows: res.rows };
            });
          });
        });
      }).catch(function (e) {
        return { ok: false, error: (e && e.message) || String(e) };
      });
    },

    // Runs `sql` (defaults to "SELECT * FROM <tableName> LIMIT 200") against the opened database.
    // Rejects on failure (mirrors Studio.PentahoClient().doQuery()'s / Studio.DuckDB.query()'s
    // contract) so callers reuse the same .then/.catch pattern as the existing "Run live" preview.
    query: function (cfg, sql) {
      return withDb(cfg, function (db) {
        var q = (sql && sql.trim()) || ("SELECT * FROM " + quoteIdent((cfg && cfg.tableName) || ""));
        return db.query(q).then(function (rows) { return objectsToResult(rows); });
      });
    }
  };
})();
