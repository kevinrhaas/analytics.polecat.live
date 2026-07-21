/* sw.js — N-DIST: installable, offline-capable app shell (repo root, registered by index.html).
   Network-first, cache-fallback: every request tries the network first (so an actively-developed
   app pushed to `main` every hour never serves stale JS while online) and only falls back to the
   cached copy when the network is unreachable — that's what makes the Studio usable offline/
   flaky-connection without risking "stuck on an old build" while online. Bump CACHE_NAME whenever
   the precache list changes materially; the activate handler deletes any older studio-shell-* cache. */
"use strict";
var CACHE_NAME = "studio-shell-v51"; /* v51: an Overview tour (M2) leads the
   tour chooser \u2014 walks the whole app down the rail (Home\u00b7Explore\u00b7Dashboards\u00b7
   Datasets\u00b7Connections\u00b7Jobs\u00b7Studio), introduces "widget", ends on Home
   (app/tutorial.js changed).
   v50: Conservation Insight quick wins —
   demo pack renamed Viridis->Conservation Insight (app/demopacks.js), geo
   sample data now spans 100+ real Corn Belt FIPS + real HUC8/CRD codes so
   choropleths demo richly (app/sampledata.js), and bundled examples get a
   first-class Home section (app/studio.js, app/studio.css).
   v49: color pickers show friendly
   labels (Accent/Series/Good...) instead of raw CSS tokens — the last visible
   "pentaho" is gone from the interface (app/model.js, app/studio.js changed).
   v48: samples curation (per Kevin) —
   data/cda-catalog.json rebuilt (67 stems/428 DAs -> 13/115, geo-first,
   no retired prefixes), sampledata.js gains huc8/crd/state/crop/acres kinds,
   studio.js: Explore repaints on hide-samples + geo datasets default to the
   map / provider trends to the Ensemble; retired CDF/CDE wording swept from
   app strings, the flagship example copy, and Help.
   v47: the tours grew up — a tour
   chooser with TWO guided walkthroughs (Quick analysis walks the real Explore
   flow: dataset -> table -> chart -> saved analysis -> pin/add; Build a
   dashboard is the modernized Studio loop, retired-term-free), the welcome
   tour rewritten around Explore/Home/Jobs with a take-the-tour CTA
   (app/tutorial.js, app/welcome.js, app/studio.js changed).
   v46: post-overhaul backlog item 7
   follow-up — the Datasets list gains a "by connection" filter pill strip
   (multi-select, saved-view aware) alongside the existing by-adapter and
   by-tag strips, so two connections on the same adapter (e.g. two Postgres
   DBs) can be narrowed to just one. app/studio.js changed.
   v45: post-overhaul backlog item 3
   follow-up — exported/deployed dashboards can now query the four
   credential-based direct connectors (Snowflake/Databricks/BigQuery/Generic
   SQL) live, joining DuckDB/SQLite's existing runtime path: exporters.js
   redacts each DA's secret field before it's ever embedded in the exported
   HTML, and studio-render.js's PDC.cda dispatch prompts for it at open time
   (in-memory only, never re-saved) — "credentials prompted at open, never
   embedded." app/exporters.js, app/model.js, app/studio.js, app/studio-render.js
   changed; app/snowflake.js/databricks.js/bigquery.js/genericsql.js were
   already precached but are now also bundled into exports that use them.
   v44: N-DESIGN theme studio follow-up —
   named custom-theme presets (save/apply/delete an authored custom theme by
   name, reuse across dashboards) — app/studio.js changed.
   v43: N-DESIGN theme studio first cut —
   a "Custom" dashboard-theme swatch lets the author pick 4 seed colors per
   light/dark mode and Studio.deriveCustomTheme() derives the rest, baked into
   the export exactly like a built-in preset — app/model.js, app/exporters.js,
   app/studio.js, app/studio.css changed.
   v42: post-overhaul backlog item 5
   follow-up — DuckDB and SQLite join the schema browser: DuckDB's listSchema()
   DESCRIBEs its single registered-file view (named after the file, not the "t"
   alias); SQLite's lists every table via sqlite_master then PRAGMA table_info
   per table — app/duckdb.js, app/sqlitehttp.js, app/sources/data-adapters.js
   changed. Generic SQL/HTTP is the last adapter without the button (no
   reliable dialect/catalog to introspect at all) — post-overhaul backlog item
   5 is now closed except for that explicitly-out-of-scope case.
   v41: post-overhaul backlog item 5
   follow-up — BigQuery joins Snowflake/Databricks/Redshift/PostgREST's schema
   browser: listSchema() queries INFORMATION_SCHEMA.COLUMNS unqualified when a
   default dataset is set, or the project.region-qualified view across every
   dataset in the region otherwise — app/sources/data-adapters.js changed.
   v40: post-overhaul backlog item 5
   follow-up — PostgREST joins Snowflake/Databricks/Redshift's schema browser:
   listSchema() reads the table/column list straight out of the OpenAPI
   document PostgREST already answers GET / with (no second query shape
   needed, unlike the ANSI-SQL adapters) — app/sources/postgrest.js changed.
   v39: Track L sweep (orphaned-key lens,
   round 3) — "Clear local data" was missing five real keys: studio-show-
   samples/studio-lib-samples-open/studio-dash-view (app/studio.js UI-
   preference flags) and analytics.datasource.v1/analytics.datasource.secret.v1
   (app/sources/sync.js's saved remote workspace connection + cached passphrase)
   — app/studio.js content changed, so precached copies need to roll.
   v38: post-overhaul backlog item 5 —
   the schema-browser half of "dataset delight": a "Browse schema" button in
   the Connections wizard (Snowflake/Databricks/Redshift) lists tables and
   columns via a new adapter.listSchema() capability, an ANSI
   information_schema.columns query through the same engine.query() bridge
   queryData already uses (app/sources/data-adapters.js, app/sources/
   schema.js, app/studio.js, app/studio.css changed).
   v37: post-overhaul backlog item 2 —
   a new Amazon Redshift data-source connector (Data API, SigV4-signed from the
   browser via the new app/sources/sigv4.js signer) — app/redshift.js and
   app/sources/sigv4.js added to the precache list.
   v36: post-overhaul backlog item 5 —
   "scheduled refresh hints" for Jobs (a Refresh reminder field + an overdue/
   due-in-N-days badge on the Jobs list, computed from lastRun; app/studio.js,
   app/studio.css changed).
   v35: post-overhaul item 4 continued —
   studio.css's chrome accent variable renamed from --pentaho to --brand (the
   shell's own canonical name), the bridge alias removed now that the two
   converge; the export/exported-dashboard --pentaho variable (pdc-ui.css,
   exporters.js, studio-charts.js, model.js DASHBOARD_THEMES) is untouched
   (app/studio.css changed).
   v34: pin/favorite toggle on Datasets and
   Connections catalog rows — pinned rows sort to the top of the list
   (post-overhaul backlog item 7, app/studio.js, app/studio.css changed).
   v33: drag a Datasets-catalog row onto
   Home's "Blank dashboard" tile to start a new dashboard seeded with it
   (app/studio.js, app/studio.css changed).
   v32: the DA inspector's Cache/Duration
   fields actually cache the last live result now instead of doing nothing
   (app/studio.js changed).
   v31: Connections list gains the same
   saved-views treatment as Datasets — a named, restorable search + adapter
   pill preset (app/studio.js changed).
   v30: Datasets catalog gains saved views —
   a named, restorable search + adapter/tag pill preset (app/studio.js changed).
   v29: UX sweep fixes — mobile hamburger
   (#mobileNavBtn) grown 40x40->44x44 to meet the thumb-target guideline, topbar left
   clearance bumped to match (app/studio.css changed); stale "Default passcode:
   pentaho-studio" gate doc comment corrected (app/gate-config.js changed).
   v28: Datasets catalog rows show a dataset-lineage
   badge (which dashboards use it) and the delete confirm warns about them (app/studio.js changed).
   v27: welcome tour (app/welcome.js) traps Tab focus
   inside the dialog and closes on Escape, so a keyboard user can no longer tab through into
   the header nav trigger hidden behind the backdrop (app/welcome.js changed).
   v26: fixed the dark/light theme toggle not reaching
   Home/Dashboards/Datasets/Connections/Jobs/Settings (app/studio.css changed).
   v25: Track L sweep — removed a dead orphaned function
   from app/studio.js (content changed, so precached copies need to roll).
   v24: V9 scientific-honesty polish slice 4 — "Last updated"
   surfaces in both the ensemble and choropleth Sources popovers, resolved from the panel's
   workspace dataset (app/exporters.js, app/studio-render.js, app/studio-charts.js changed).
   v23: V9 scientific-honesty polish slice 2 — a "Sources"
   provenance popover (which providers, how much coverage) on the ensemble and choropleth charts
   (app/studio-charts.js changed).
   v22: V9 scientific-honesty polish slice 1 — Download-CSV
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
