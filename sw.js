/* sw.js — N-DIST: installable, offline-capable app shell (repo root, registered by index.html).
   Network-first, cache-fallback: every request tries the network first (so an actively-developed
   app pushed to `main` every hour never serves stale JS while online) and only falls back to the
   cached copy when the network is unreachable — that's what makes the Studio usable offline/
   flaky-connection without risking "stuck on an old build" while online. Bump CACHE_NAME whenever
   the precache list changes materially; the activate handler deletes any older studio-shell-* cache. */
"use strict";
var CACHE_NAME = "studio-shell-v12"; /* v12: geo module — vendored topojson-client + region geometry */
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
  "vendor/geo/topojson-client.min.js",
  "vendor/geo/counties-albers-10m.json",
  "vendor/geo/states-albers-10m.json",
  "vendor/geo/us-crd-counties.json",
  "vendor/geo/us-huc8-cornbelt-albers.json",
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
  "app/sources/sync.js",
  "app/sampledata.js",
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
