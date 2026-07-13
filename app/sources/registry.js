/* app/sources/registry.js — the adapter registry (ported from the fleet's
   sources/index.js). Adding a backend = write an adapter to the contract in
   schema.js and register it here (or call Studio.registerSource from the
   adapter's own file, for adapters that live outside app/sources/).

   Order = picker order. Everything else (pickers, connect wizard, rail
   indicator, sync) is generic over this list. */
(function () {
  "use strict";
  Studio.SOURCES = [
    Studio.localSource,
    Studio.tursoSource,
    Studio.supabaseSource,
    Studio.firebaseSource
  ];

  // Register an adapter defined elsewhere (e.g. the data connectors in app/*.js
  // once they adopt the contract). Idempotent by id; keeps first registration.
  Studio.registerSource = function (src) {
    if (!src || !src.id) return;
    if (Studio.SOURCES.some(function (s) { return s.id === src.id; })) return;
    Studio.SOURCES.push(src);
  };

  Studio.sourceById = function (id) {
    return Studio.SOURCES.filter(function (s) { return s.id === id; })[0] || null;
  };

  // The subsets each plane's UI iterates over.
  Studio.metaSources = function () { return Studio.SOURCES.filter(function (s) { return s.caps && s.caps.meta; }); };
  Studio.dataSources = function () { return Studio.SOURCES.filter(function (s) { return s.caps && s.caps.data; }); };
  Studio.remoteMetaSources = function () { return Studio.metaSources().filter(function (s) { return !s.local; }); };
}());
