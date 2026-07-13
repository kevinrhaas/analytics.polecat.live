/* app/sources/local.js — the default workspace backend: this browser's
   localStorage. Ported from manager.polecat.live/js/sources/local.js.

   A first-class adapter like any other (so the rail's source indicator can
   say "Local" with the same machinery it uses for a remote), but special in
   one way: the Workspace store ALREADY persists the working copy to this same
   key on every mutation, so when Local is active the sync layer does no
   write-through — save() is a no-op and the store's own persist is the
   durable write. */
(function () {
  "use strict";
  var WS = Studio.WS;

  // The Workspace store's working-copy key (kept in sync with its LS_KEY).
  var LS_KEY = "analytics.workspace.v1";

  function readDb() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (e) { return null; }
  }

  // Convert the store's id-keyed _db into a portable snapshot.
  function dbToSnapshot(db) {
    if (!db || !db.tables) return null;
    var snap = WS.emptySnapshot();
    WS.TABLE_NAMES.forEach(function (t) {
      var tv = db.tables[t] || {};
      snap.tables[t] = Array.isArray(tv) ? tv : Object.keys(tv).map(function (k) { return tv[k]; });
    });
    snap.settings = db.settings || {};
    snap.meta = db.meta || {};
    return snap;
  }

  Studio.localSource = {
    id: "local",
    label: "Local (this browser)",
    blurb: "Data lives in this browser only. Fast, private, no setup — but it doesn't travel to other devices.",
    icon: "db",
    accent: "var(--pentaho)",
    caps: { meta: true, data: false },
    browserProvision: true,
    local: true,
    fields: [],
    docsUrl: "",

    test: function () { return Promise.resolve({ ok: true }); },

    probe: function () {
      var snap = dbToSnapshot(readDb());
      var tables = snap ? WS.TABLE_NAMES.map(function (t) { return { name: t, count: snap.tables[t].length }; }) : [];
      return Promise.resolve({ state: snap ? "polecat" : "empty", app: WS.APP_ID, schemaVersion: WS.SCHEMA_VERSION, tables: tables });
    },

    provision: function () { return Promise.resolve({ ok: true }); },  // the store seeds itself
    summarize: function () { return this.probe(); },
    drop: function () { try { localStorage.removeItem(LS_KEY); } catch (e) {} return Promise.resolve({ ok: true }); },

    load: function () { return Promise.resolve(dbToSnapshot(readDb()) || WS.emptySnapshot()); },
    save: function () { return Promise.resolve({ ok: true }); }        // store persist is the real write
  };
}());
