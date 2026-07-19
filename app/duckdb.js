/* Analytics — © 2026 Polecat.live. See LICENSE. */
/* Z14 slice 1 — DuckDB-Wasm connector: query a remote Parquet/CSV file directly over HTTP
   Range Requests, entirely client-side — no backend, no proxy, no saved credentials. The
   ~3–5MB wasm engine is lazy-loaded from a CDN only the first time a "duckdb" data source is
   tested or queried, so the base app stays small for everyone who never touches this connector.
   Studio.DuckDB is a small façade over @duckdb/duckdb-wasm's worker/wasm boot sequence:
     ensureEngine()        — lazy-load + cache a single AsyncDuckDB instance for this tab
     testConnection(cfg)   — probe a file URL: schema (DESCRIBE) + a 5-row sample
     query(cfg, sql)       — run an arbitrary SQL string against the file (view alias "t")
     queryRows(columns, rows, sql) — Viridis V8 slice 3: run arbitrary SQL against an
       IN-MEMORY {columns,rows} table (view alias "t", same convention), no file/network
       involved — the job engine's Custom SQL step registers the pipeline's current rows
       as CSV text via registerFileText() rather than a remote URL.
   cfg = { fileUrl, fileFormat }  — fileFormat is "auto" | "parquet" | "csv". */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  var CDN_BASE = "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.32.0/dist/";
  var VIEW_NAME = "t", FILE_ALIAS = "studio_src";

  // extension-sniffed default when fileFormat is "auto" or unset
  function detectFormat(url) {
    var u = String(url || "").split("?")[0].toLowerCase();
    if (/\.csv$/.test(u)) return "csv";
    return "parquet"; // DuckDB-Wasm's sweet spot; also our documented default
  }
  Studio.DuckDB_detectFormat = detectFormat; // exposed for tests / tooling

  function readerFn(format) { return format === "csv" ? "read_csv_auto" : "read_parquet"; }

  // Arrow Table -> plain {cols, rows}; bigint cells (COUNT, integer columns) become Numbers
  // so the result drops straight into the same {cols,rows} shape sampleRows()/doQuery() use.
  function arrowToResult(table) {
    var cols = table.schema.fields.map(function (f) { return f.name; });
    var rows = table.toArray().map(function (r) {
      return cols.map(function (c) {
        var v = r[c];
        return typeof v === "bigint" ? Number(v) : v;
      });
    });
    return { cols: cols, rows: rows };
  }

  var _enginePromise = null;
  // Loads the duckdb-wasm ESM bundle from jsDelivr, boots a Worker-backed AsyncDuckDB, and
  // caches the result so repeated Test/Run-live clicks reuse the same engine instance.
  function ensureEngine() {
    if (_enginePromise) return _enginePromise;
    _enginePromise = Studio.withTimeout((function () {
      return import(/* @vite-ignore */ CDN_BASE + "duckdb-browser.mjs").then(function (duckdb) {
        var bundles = duckdb.getJsDelivrBundles();
        return duckdb.selectBundle(bundles).then(function (bundle) {
          var workerScript = "importScripts(" + JSON.stringify(bundle.mainWorker) + ");";
          var workerUrl = URL.createObjectURL(new Blob([workerScript], { type: "text/javascript" }));
          var worker = new Worker(workerUrl);
          var logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
          var db = new duckdb.AsyncDuckDB(logger, worker);
          return db.instantiate(bundle.mainModule, bundle.pthreadWorker).then(function () {
            URL.revokeObjectURL(workerUrl);
            return { duckdb: duckdb, db: db };
          });
        });
      });
    })(), 20000, "Loading the DuckDB engine").catch(function (e) { _enginePromise = null; throw e; });
    return _enginePromise;
  }

  // Opens a connection, registers cfg.fileUrl as an HTTP-range-backed file, and (re)creates
  // a "t" view over it via read_parquet/read_csv_auto — the shared entry point for both
  // testConnection() and query().
  function withView(cfg, fn) {
    var fileUrl = String((cfg && cfg.fileUrl) || "").trim();
    if (!fileUrl) return Promise.reject(new Error("Enter a file URL first."));
    var format = (cfg.fileFormat && cfg.fileFormat !== "auto") ? cfg.fileFormat : detectFormat(fileUrl);
    return ensureEngine().then(function (eng) {
      return eng.db.registerFileURL(FILE_ALIAS, fileUrl, eng.duckdb.DuckDBDataProtocol.HTTP, false)
        .then(function () { return eng.db.connect(); })
        .then(function (conn) {
          return conn.query("CREATE OR REPLACE VIEW " + VIEW_NAME + " AS SELECT * FROM " + readerFn(format) + "('" + FILE_ALIAS + "')")
            .then(function () { return fn(conn); })
            .then(
              function (result) { return conn.close().then(function () { return result; }); },
              function (err) { return conn.close().then(function () { throw err; }, function () { throw err; }); }
            );
        });
    });
  }

  // Registers `csvText` as an in-memory virtual file (no network) and hands a connection
  // with a "t" view over it to `fn` — the in-memory counterpart to withView() above, shared
  // by queryRows(). Table alias and connection lifecycle match withView() exactly so both
  // paths behave identically to callers.
  function withTextView(csvText, fn) {
    return ensureEngine().then(function (eng) {
      return eng.db.registerFileText(FILE_ALIAS + ".csv", csvText)
        .then(function () { return eng.db.connect(); })
        .then(function (conn) {
          return conn.query("CREATE OR REPLACE VIEW " + VIEW_NAME + " AS SELECT * FROM read_csv_auto('" + FILE_ALIAS + ".csv')")
            .then(function () { return fn(conn); })
            .then(
              function (result) { return conn.close().then(function () { return result; }); },
              function (err) { return conn.close().then(function () { throw err; }, function () { throw err; }); }
            );
        });
    });
  }

  // Probes a file: schema via DESCRIBE + a small sample. Never rejects — resolves
  // {ok:false, error} on any failure (bad URL, no CORS/Range support, network unreachable,
  // engine load failure) so the inspector can show a clear message instead of a stuck spinner.
  Studio.DuckDB = {
    detectFormat: detectFormat,
    ensureEngine: ensureEngine,

    testConnection: function (cfg) {
      return withView(cfg, function (conn) {
        return conn.query("DESCRIBE SELECT * FROM " + VIEW_NAME).then(function (schema) {
          var columns = schema.toArray().map(function (r) { return { name: r.column_name, type: r.column_type }; });
          return conn.query("SELECT * FROM " + VIEW_NAME + " LIMIT 5").then(function (sample) {
            var res = arrowToResult(sample);
            return { ok: true, columns: columns, cols: res.cols, rows: res.rows };
          });
        });
      }).catch(function (e) {
        return { ok: false, error: Studio.friendlyConnectorError((e && e.message) || String(e)) };
      });
    },

    // Runs `sql` (defaults to "SELECT * FROM t LIMIT 200") against the registered file's view.
    // Rejects on failure (mirrors the shared query() contract) so callers reuse
    // the same .then/.catch pattern as the existing Pentaho "Run live" preview.
    query: function (cfg, sql) {
      return withView(cfg, function (conn) {
        return conn.query((sql && sql.trim()) || ("SELECT * FROM " + VIEW_NAME + " LIMIT 200")).then(arrowToResult);
      });
    },

    // Post-overhaul backlog item 5's schema-browser follow-up: unlike the SQL warehouses
    // (which catalog many tables via information_schema), a DuckDB connection is always
    // exactly one registered file, so the "tree" is a single table — named after the file,
    // not the internal "t" view alias — described via the same DESCRIBE query testConnection()
    // already runs. Goes through query() (not withView directly) so tests can monkey-patch it
    // the same way the rest of this connector's tests already do.
    listSchema: function (cfg) {
      var fileUrl = String((cfg && cfg.fileUrl) || "").trim();
      var name = fileUrl.split("/").pop().split("?")[0] || VIEW_NAME;
      return Studio.DuckDB.query(cfg, "DESCRIBE SELECT * FROM " + VIEW_NAME).then(function (r) {
        var idx = {}; (r.cols || []).forEach(function (c, i) { idx[String(c).toLowerCase()] = i; });
        var columns = (r.rows || []).map(function (row) {
          return { name: row[idx.column_name], type: row[idx.column_type] };
        });
        return { tables: [{ schema: null, name: name, columns: columns }] };
      }).catch(function (e) {
        return { tables: [], error: (e && e.message) || String(e) };
      });
    },

    // Runs `sql` (defaults to "SELECT * FROM t") against an in-memory table built from
    // `columns`/`rows` (a job pipeline's current state — the {columns, rows} shape every
    // adapter and the jobs engine already share). Rejects on failure, same contract as
    // query(); the job engine's Custom SQL step (Studio.runJobStepsAsync in
    // app/sources/jobs-engine.js) is the caller.
    queryRows: function (columns, rows, sql) {
      var csv = Studio.rowsToCsv(columns || [], rows || []);
      return withTextView(csv, function (conn) {
        return conn.query((sql && sql.trim()) || ("SELECT * FROM " + VIEW_NAME)).then(arrowToResult);
      }).then(function (res) { return { columns: res.cols, rows: res.rows }; });
    }
  };
})();
