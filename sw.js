/* sw.js — N-DIST: installable, offline-capable app shell (repo root, registered by index.html).
   Network-first, cache-fallback: every request tries the network first (so an actively-developed
   app pushed to `main` every hour never serves stale JS while online) and only falls back to the
   cached copy when the network is unreachable — that's what makes the Studio usable offline/
   flaky-connection without risking "stuck on an old build" while online. Bump CACHE_NAME whenever
   the precache list changes materially; the activate handler deletes any older studio-shell-* cache. */
"use strict";
var CACHE_NAME = "studio-shell-v22"; /* v22: V9 scientific-honesty polish slice 1 — Download-CSV
   controls on the ensemble and choropleth charts (app/studio-charts.js changed).
   v21: Jobs (Viridis V8 slice 3) gains a Custom SQL step —
   app/sources/jobs-engine.js, app/duckdb.js and app/studio.js content changed, so precached
   copies need to roll. v20: Jobs (Viridis V8) gains join/union steps across
   datasets — app/sources/jobs-engine.js and app/studio.js content changed, so precached copies
   need to roll. v19: Jobs (Viridis V8 slice 1) — app/sources/jobs-engine.js added to the precache
   list. Also fixes a pre-existing gap: vendor/pdc-ui.css (fetched at boot by studio.js) was never
   precached even though its vendor/pdc-ui.js counterpart was, breaking the very first offline
   boot before the runtime cache had a chance to see it.
   vendor/maplibre/* and site/shots/*.png are deliberately NOT precached (~3.8MB combined
   would tax every SW install); the fetch handler runtime-caches them after first view. */
var SHELL_FILES = [
  "./",
  "index.html",
  "css/landing.css",
  "app/",
  "app/index.html",
  "site.webmanifest",
  "favicon.svg",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  /* vendor/geo/* is deliberately NOT precached: ~1.5MB that would tax every SW
     install (and every fresh test context). The fetch handler runtime-caches all
     same-origin GETs, so map dashboards work offline after their first view. */
  "vendor/polecat-shell/tokens.css",
  "vendor/polecat-shell/shell.js",
  "vendor/polecat-shell/catalog.js",
  "vendor/polecat-shell/icons.js",
  "vendor/polecat-shell/whatsnew.js",
  "vendor/polecat-shell/ui.js",
  "app/fleet.js",
  "app/studio.css",
  "app/gate-config.js",
  "app/gate.js",
  "app/model.js",
  "app/sources/schema.js",
  "app/sources/crypto.js",
  "app/sources/local.js",
  "app/sources/turso.js",
  "app/sources/supabase.js",
  "app/sources/firebase.js",
  "app/sources/registry.js",
  "app/sources/postgrest.js",
  "app/sources/localfile.js",
  "app/sources/gsheets.js",
  "app/sources/workspace.js",
  "app/sources/jobs-engine.js",
  "app/sources/sync.js",
  "app/sampledata.js",
  "app/demopacks.js",
  "app/duckdb.js",
  "app/sqlitehttp.js",
  "app/snowflake.js",
  "app/databricks.js",
  "app/bigquery.js",
  "app/genericsql.js",
  "app/sources/data-adapters.js",
  "app/exporters.js",
  "app/icons.js",
  "app/welcome.js",
  "app/tutorial.js",
  "js/changelog.js",
  "app/shell.js",
  "app/studio.js",
  "app/palette.js",
  "app/studio-render.js",
  "app/studio-charts.js",
  "vendor/pdc-ui.css",
  "vendor/pdc-ui.js",
  "data/cda-catalog.json",
  "data/examples/index.json"
];

self.addEventListener("install", function (evt) {
  evt.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // addAll fails the whole install on one bad URL; add individually so a single missing/
      // renamed asset can't break offline support for everything else.
      return Promise.all(SHELL_FILES.map(function (url) {
        return cache.add(url).catch(function () { /* ignore a single missing asset */ });
      })).then(function () {
        // Also precache every curated example spec (read from the index we just cached above)
        // so the Examples gallery genuinely works offline on the very first visit, not just
        // after the ordinary network-first fetch handler has opportunistically cached one.
        return cache.match("data/examples/index.json").then(function (res) {
          if (!res) return;
          return res.clone().json().then(function (list) {
            return Promise.all((list || []).map(function (ex) {
              return ex && ex.file ? cache.add("data/examples/" + ex.file).catch(function () {}) : null;
            }));
          }).catch(function () {});
        });
      });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (evt) {
  evt.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.filter(function (n) { return n.indexOf("studio-shell-") === 0 && n !== CACHE_NAME; })
        .map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (evt) {
  var req = evt.request;
  // Only handle same-origin GETs — never intercept cross-origin API calls (Pentaho/Snowflake/
  // Databricks/BigQuery/DuckDB-Wasm CDN/etc.), which must always hit the real network.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  evt.respondWith(
    fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); }).catch(function () {});
      return res;
    }).catch(function () {
      return caches.match(req).then(function (cached) {
        return cached || (req.mode === "navigate" ? caches.match("index.html") : undefined);
      });
    })
  );
});
