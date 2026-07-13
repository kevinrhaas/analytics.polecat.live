/* app/sources/workspace.js — the unified local-first workspace store:
   connections, datasets, and saved dashboards, persisted as one localStorage
   blob and portable as a snapshot (see schema.js). Lean port of the fleet's
   store pattern (manager.polecat.live/js/store.js): every table is an id→row
   map, every row carries createdAt/updatedAt, every mutation persists and
   emits an event, and snapshot()/replaceAll() bridge to the source adapters
   so a remote backend can mirror the whole thing.

   The dashboard SPEC editor keeps its own in-session state (studio.js S.spec)
   — this store is the durable catalog those specs are saved into. */
(function () {
  "use strict";
  var WS = Studio.WS;
  var LS_KEY = "analytics.workspace.v1"; // kept in sync with sources/local.js

  function now() { return Date.now(); }
  function uid(p) { return (p || "id") + "-" + now().toString(36) + "-" + Math.random().toString(36).slice(2, 8); }

  var listeners = {};   // evt -> [fn]; '*' hears everything
  var db = null;

  function blank() {
    var tables = {};
    WS.TABLE_NAMES.forEach(function (t) { tables[t] = {}; });
    return { tables: tables, settings: {}, meta: { createdAt: now() } };
  }

  function persist() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(db)); } catch (e) { /* quota/blocked — stay in-memory */ }
  }

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      if (raw && raw.tables) {
        // tolerate array-shaped tables from an imported snapshot
        WS.TABLE_NAMES.forEach(function (t) {
          var tv = raw.tables[t];
          if (Array.isArray(tv)) {
            var m = {}; tv.forEach(function (r) { if (r && r.id) m[r.id] = r; });
            raw.tables[t] = m;
          } else if (!tv) raw.tables[t] = {};
        });
        db = raw;
        return;
      }
    } catch (e) {}
    db = blank();
  }

  function emit(evt, payload) {
    (listeners[evt] || []).concat(listeners["*"] || []).forEach(function (fn) {
      try { fn(payload || {}, evt); } catch (e) {}
    });
  }

  var Workspace = {
    uid: uid,

    on: function (evt, fn) {
      (listeners[evt] = listeners[evt] || []).push(fn);
      return function () { var a = listeners[evt]; var i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
    },

    all: function (table) {
      var tv = db.tables[table] || {};
      return Object.keys(tv).map(function (k) { return tv[k]; });
    },
    get: function (table, id) { return (db.tables[table] || {})[id] || null; },

    put: function (table, row, opts) {
      opts = opts || {};
      if (!row.id) row.id = uid(table.slice(0, 4));
      var prev = db.tables[table][row.id] || null;
      if (!prev) row.createdAt = row.createdAt || now();
      row.updatedAt = now();
      db.tables[table][row.id] = row;
      persist();
      if (!opts.silent) emit("change", { table: table, id: row.id, prev: prev, row: row });
      return row;
    },

    remove: function (table, id, opts) {
      opts = opts || {};
      var prev = db.tables[table][id];
      if (!prev) return null;
      delete db.tables[table][id];
      persist();
      if (!opts.silent) emit("change", { table: table, id: id, prev: prev, removed: true });
      return prev;
    },

    settings: function () { return db.settings; },
    setSetting: function (key, value) {
      db.settings[key] = value; persist();
      emit("change", { table: "settings", key: key });
    },
    meta: function () { return db.meta; },
    setMeta: function (key, value) { db.meta[key] = value; persist(); },

    // ---- data-source bridge (what sync pushes / adopts) ---------------------
    snapshot: function () {
      var snap = WS.emptySnapshot();
      WS.TABLE_NAMES.forEach(function (t) { snap.tables[t] = Workspace.all(t); });
      snap.settings = db.settings;
      snap.meta = db.meta;
      return snap;
    },

    // Adopt a loaded workspace wholesale (connect/pull). Re-keys arrays by id,
    // persists locally, and emits a whole-store change + 'replaced'.
    replaceAll: function (snapshot) {
      var next = blank();
      WS.TABLE_NAMES.forEach(function (t) {
        ((snapshot && snapshot.tables && snapshot.tables[t]) || []).forEach(function (r) {
          if (r && r.id) next.tables[t][r.id] = r;
        });
      });
      next.settings = (snapshot && snapshot.settings) || {};
      next.meta = (snapshot && snapshot.meta) || { createdAt: now() };
      db = next;
      persist();
      emit("change", { table: "*" });
      emit("replaced", {});
    },

    reset: function () { db = blank(); persist(); emit("change", { table: "*" }); emit("replaced", {}); }
  };

  load();
  Studio.Workspace = Workspace;
}());
