/* sw.js — N-DIST: installable, offline-capable app shell (repo root, registered by index.html).
   Network-first, cache-fallback: every request tries the network first (so an actively-developed
   app never serves stale JS while online) and only falls back to the cached copy when the network
   is unreachable — that is what makes the Studio usable offline / on a flaky connection without
   risking "stuck on an old build" while online. The activate handler deletes any older
   studio-shell-* cache.

   BUMPING THE CACHE: change the number in CACHE_NAME whenever the precache list below changes
   materially — that is the whole ritual, no comment required. This file used to carry a release
   note per bump; 2,454 lines of them had accumulated ahead of the worker, so a ~5KB service
   worker shipped as ~190KB on every update check (AUD-08 / AUDIT-2026-08.md §1.4). They now live
   in docs/sw-history.md, and nothing needs appending to it: what shipped is js/changelog.js (the
   changelog users actually read) and which precached files rolled is right there in the commit
   diff. tools/validate.mjs holds this file to a byte budget so the history cannot creep back. */
"use strict";
var CACHE_NAME = "studio-shell-v515";

/* Precache conventions, worth knowing before you edit the list:
   - Rarely-visited pages are deliberately NOT precached (app/viewer.html + app/viewer.js,
     docs/index.html) — the runtime fetch handler caches them after a first visit instead.
   - vendor/maplibre/* and site/shots/*.png are NOT precached either (~3.8MB combined would tax
     every SW install); same runtime-cache-on-first-view treatment.
   - js/changelog.js is NOT precached (AUD-08): boot loads the generated js/changelog-head.js and
     the full history is fetched on demand by Studio.loadChangelog(). */
var SHELL_FILES = [
  "./",
  "index.html",
  "css/landing.css",
  "assets/fonts/hanken-grotesk-400.woff2",
  "assets/fonts/hanken-grotesk-600.woff2",
  "assets/fonts/hanken-grotesk-700.woff2",
  "assets/fonts/hanken-grotesk-800.woff2",
  "assets/brand/polecat-logo-coin-cream.svg",
  "assets/brand/polecat-logo-black.svg",
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
  "app/workspaces.js",
  "app/auth.js",
  "app/gate.js",
  "app/model.js",
  "app/sources/schema.js",
  "app/sources/crypto.js",
  "app/sources/sigv4.js",
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
  "app/activity.js",
  "app/sampledata.js",
  "app/demopacks.js",
  "app/duckdb.js",
  "app/sqlitehttp.js",
  "app/snowflake.js",
  "app/databricks.js",
  "app/bigquery.js",
  "app/redshift.js",
  "app/genericsql.js",
  "app/sources/data-adapters.js",
  "app/exporters.js",
  "app/icons.js",
  "app/tooltip.js",
  "app/welcome.js",
  "app/tutorial.js",
  /* AUD-08: js/changelog.js (~680KB) is deliberately NOT precached any more — only the
     generated head file boots, and the full history is fetched on demand by
     Studio.loadChangelog(). The fetch handler runtime-caches it after the first open,
     so an offline visitor who has opened the feed once still gets it. */
  "js/changelog-head.js",
  "app/shell.js",
  "app/chart-thumbnails.js",
  "app/branding.js",
  "app/defaults.js",
  "app/celebrations.js",
  "app/versions.js",
  "vendor/fflate.js",
  "app/xlsx.js",
  "app/explore.js",
  "app/jobs.js",
  "app/connections.js",
  "app/datasets.js",
  "app/views.js",
  "app/build.js",
  "app/quickmode.js",
  "app/studio.js",
  "app/palette.js",
  "app/studio-render.js",
  "app/studio-charts.js",
  "vendor/dashkit.css",
  "vendor/dashkit.js",
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
