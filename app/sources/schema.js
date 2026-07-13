/* app/sources/schema.js — the backend-agnostic description of THIS app's
   workspace (dashboards, datasets, connections), ported from the fleet's
   reference implementation in manager.polecat.live/js/sources/schema.js.

   This is the single source of truth every adapter builds against, so adding
   a backend is "map these tables onto your storage" and nothing more. It is
   deliberately free of any Store/DOM dependency.

   ── The adapter contract (every entry in Studio.SOURCES) ────────────────────
   A source adapter is a PLAIN OBJECT exposing:

     id          'local' | 'turso' | 'supabase' | 'firebase' | 'snowflake' | …
     label       human name for the picker
     blurb       one line describing the backend
     icon        Studio icon name
     accent      brand color for the card/dot
     caps        { meta:bool, data:bool } — what this adapter can DO:
                   meta: can host the app's own workspace (dashboards/datasets/
                         connections metadata) — the "repo backend" plane
                   data: can run dataset queries for dashboards — the data plane
     browserProvision  can it CREATE its objects from the browser? (meta plane;
                       false → provision() returns a paste-me `sql` script)
     local       optional bool — true only for the local adapter
     fields      [{ key, label, placeholder, type:'text'|'password', hint? }]
                 connection inputs; their values become `cfg`
     docsUrl     where to get those values

   META-plane methods (required when caps.meta; all async, and they NEVER throw
   for an expected condition — bad creds/empty DB/foreign DB come back in the
   result so the connect flow can branch; a throw means a genuine fault):

     test(cfg)      → { ok, error? }                    reachable + authed?
     probe(cfg)     → { state:'empty'|'polecat'|'foreign', app?, schemaVersion?,
                        tables:[{name,count}] }
     provision(cfg, snapshot) → { ok, error? }          create all objects
                       (browserProvision:false → { ok:false, manual:true, sql })
     summarize(cfg) → { tables:[{name,count}], app?, schemaVersion? }
     drop(cfg)      → { ok, error? }                    destroy everything
     load(cfg)      → snapshot                          read whole workspace
     save(cfg, snapshot) → { ok, error? }               write whole workspace

   DATA-plane methods (required when caps.data):

     testData(cfg)  → { ok, error?, note? }             reachable for queries?
     queryData(cfg, dataset, params) → { columns:[names], rows:[[cells]] }
                       dataset: a dataset definition ({ kind:'sql', sql, … } —
                       kinds vary by adapter); params: {key:value} already
                       applied to the definition via Studio.WS.applyParams.
   ──────────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";
  window.Studio = window.Studio || {};
  var WS = {};

  // Bump when the shape below changes in a way an older client couldn't read.
  WS.SCHEMA_VERSION = 1;

  // The app that owns a workspace. probe() uses it to tell "my repo" from
  // "another Polecat app's repo" (manager, relay, …) from "a foreign database".
  WS.APP_ID = "analytics";

  // The marker table every provisioned workspace carries.
  WS.META_TABLE = "polecat_meta";

  // Entity tables that make up THIS app's workspace, in dependency order
  // (connections before datasets before dashboards, so a relational restore
  // never violates a foreign-key-shaped expectation). `columns` are promoted
  // to real, indexed DB columns; every other field rides in a `data` JSON
  // blob, so the schema never migrates when a row grows a new attribute.
  // `id` + `data` are implicit on every table.
  WS.WORKSPACE_TABLES = [
    { name: "connections", columns: ["name", "adapter", "updatedAt"] },
    { name: "datasets",    columns: ["name", "connectionId", "kind", "updatedAt"] },
    { name: "dashboards",  columns: ["name", "title", "updatedAt"] }
  ];
  WS.TABLE_NAMES = WS.WORKSPACE_TABLES.map(function (t) { return t.name; });

  function sqlType(col) {
    return col === "updatedAt" ? "INTEGER" : "TEXT";
  }

  // A promoted column's value, normalised for a scalar SQL cell. updatedAt is
  // stored as epoch-ms (rows may carry ISO strings — coerce).
  WS.columnValue = function (table, col, row) {
    var v = row[col];
    if (v == null) return null;
    if (col === "updatedAt") { var t = +new Date(v); return isNaN(t) ? null : t; }
    if (typeof v === "object") return null;
    return v;
  };

  WS.tableDDL = function (table) {
    var def = WS.WORKSPACE_TABLES.filter(function (t) { return t.name === table; })[0];
    var cols = ['id TEXT PRIMARY KEY']
      .concat(def.columns.map(function (c) { return '"' + c + '" ' + sqlType(c); }))
      .concat(['data TEXT']);
    return 'CREATE TABLE IF NOT EXISTS "' + table + '" (' + cols.join(", ") + ')';
  };

  WS.provisionDDL = function () {
    return ['CREATE TABLE IF NOT EXISTS "' + WS.META_TABLE + '" (key TEXT PRIMARY KEY, value TEXT)']
      .concat(WS.TABLE_NAMES.map(WS.tableDDL));
  };

  // The rows written into polecat_meta at provision time — workspace identity
  // plus the app-level singletons (settings/meta) so the whole workspace is
  // captured relationally without a bespoke table each.
  WS.metaRows = function (snapshot) {
    return [
      { key: "app",            value: WS.APP_ID },
      { key: "schema_version", value: String(WS.SCHEMA_VERSION) },
      { key: "settings",       value: JSON.stringify((snapshot && snapshot.settings) || {}) },
      { key: "meta",           value: JSON.stringify((snapshot && snapshot.meta) || {}) }
    ];
  };

  // A snapshot is the portable, adapter-neutral form of a whole workspace:
  //   { app, schemaVersion, tables:{ connections:[…rows], … }, settings, meta }
  WS.emptySnapshot = function () {
    var tables = {};
    WS.TABLE_NAMES.forEach(function (t) { tables[t] = []; });
    return { app: WS.APP_ID, schemaVersion: WS.SCHEMA_VERSION, tables: tables, settings: {}, meta: {} };
  };

  WS.isOwnApp = function (app) { return app === WS.APP_ID; };

  // ---- SQL-shaped adapter helpers (from the fleet base.js) ----------------
  // Split a row into { cols:{promoted→cell}, data:JSON-of-the-whole-row }.
  // The full row always survives in `data` — promoted columns are a queryable
  // projection, never the source of truth.
  WS.rowToCells = function (table, row) {
    var def = WS.WORKSPACE_TABLES.filter(function (t) { return t.name === table; })[0];
    var cols = {};
    def.columns.forEach(function (c) { cols[c] = WS.columnValue(table, c, row); });
    return { id: row.id, cols: cols, data: JSON.stringify(row) };
  };

  WS.cellsToRow = function (dataText) {
    try { var r = JSON.parse(dataText); return (r && r.id) ? r : null; }
    catch (e) { return null; }
  };

  WS.snapshotToRows = function (snapshot) {
    var out = {};
    WS.TABLE_NAMES.forEach(function (t) {
      out[t] = (snapshot.tables[t] || []).map(function (row) { return WS.rowToCells(t, row); });
    });
    return out;
  };

  WS.describeContents = function (res) {
    var tbls = (res.tables || []).filter(function (t) { return t.count > 0; });
    if (!tbls.length) return "no rows yet";
    return tbls.map(function (t) { return t.count + " " + t.name; }).join(", ");
  };

  // ---- dataset parameter substitution --------------------------------------
  // Dashboard-level template variables flow into dataset definitions as
  // {{key}} placeholders (same syntax the dashboards already use), e.g.
  //   SELECT * FROM {{schema}}.orders WHERE region = '{{region}}'
  // Values are substituted as plain text; unmatched placeholders are left
  // intact so the adapter's own error surfaces them clearly.
  WS.applyParams = function (text, params) {
    if (!text || !params) return text;
    return String(text).replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, function (m, key) {
      return Object.prototype.hasOwnProperty.call(params, key) && params[key] != null ? String(params[key]) : m;
    });
  };

  Studio.WS = WS;
}());
