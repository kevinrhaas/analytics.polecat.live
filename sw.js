/* sw.js — N-DIST: installable, offline-capable app shell (repo root, registered by index.html).
   Network-first, cache-fallback: every request tries the network first (so an actively-developed
   app pushed to `main` every hour never serves stale JS while online) and only falls back to the
   cached copy when the network is unreachable — that's what makes the Studio usable offline/
   flaky-connection without risking "stuck on an old build" while online. Bump CACHE_NAME whenever
   the precache list changes materially; the activate handler deletes any older studio-shell-* cache. */
"use strict";
var CACHE_NAME = "studio-shell-v86"; /* v86: LF2 — 2 new Conservation-themed example
   dashboards (conservation-scorecard.studio.json, conservation-flow.studio.json), gated
   behind the Conservation demo pack (demoPackId in data/examples/index.json); the SW's
   dynamic example precache picks up both new files automatically from the updated index.
   v85: new "developer"
   role — a third role between viewer and admin (viewer-mode groundwork). PolecatAuth gains
   ROLES/ROLE_LABELS + isAdmin()/canDevelop() capability helpers (canDevelop =
   admin OR developer, admin is a superset); the Admin user editor offers
   Developer in its role picker with a distinct badge. app/auth.js, app/studio.js,
   app/studio.css changed.
   v84: LF1 — the 5 ensemble providers'
   sample pct values now carry distinct offsets/slopes (a small per-provider
   offset used to be swamped by random jitter, so the lines bunched); the
   middle provider still tracks the plain baseline so the median reads as the
   consensus. app/sampledata.js changed.
   v83: UX3 — the toast and demo-mode
   badge no longer wear a hardcoded dark-navy/red regardless of theme; toast
   now uses --topbar-bg/--topbar-ink (matches the active app theme's rail
   surface) and both toast.err + .demo-badge darken --bad via color-mix so the
   hue tracks the theme while staying readable with white text. app/studio.css
   changed.
   v82: FIX — the job editor's "Remove
   step" and per-metric/mapping "✕" buttons were near-invisible (faint
   white-on-light) inside the modal, which sits on the light --pane surface
   rather than the dark rail/topbar the base .btn assumes (LF14). New
   .btn.danger class: dark-on-light by default, red on hover. app/studio.js,
   app/studio.css changed.
   v81: Calmer Data panel — the compound
   (join/union) data-access CREATE button is retired from the Studio pane (joins
   belong in the Datasets area); dataset cards are now a compact ~2-row layout
   (kind icon + id + badge, hover-reveal actions, capped column chips) and the
   section outlines are a light hairline instead of a loud brand box. studio.js
   + studio.css changed.
   v80: FIX — updatedAt is now typed BIGINT in
   the workspace provisioning DDL. It holds epoch-MILLISECONDS (~1.78e12), which
   overflows Postgres INTEGER (int4, ~2.1e9), so a Supabase "Overwrite with mine"
   push failed with "value … is out of range for type integer" (22003). BIGINT
   holds it; SQLite/Turso accept BIGINT too. app/sources/schema.js changed.
   v79: M4.2 per-section rights (the second
   half of M4.2, now complete) — an Admin "Section access" card can hide
   Explore/Dashboards/Datasets/Jobs/Connections/Studio from the viewer role;
   Home stays always-on as the safe landing section. shell.js's role gating
   reads the new list and bounces a viewer off a section an admin just hid.
   app/studio.js + app/shell.js changed.
   v78: FIX — an admin who just signed in
   was stuck on the Admin section's "administrators only" screen. The section
   renders once at boot (behind the sign-in overlay, before any identity), and
   the post-login hook re-applied rail gating but never RE-RENDERED the section;
   initAuthBoot now repaints Settings + Admin (and re-gates) after login.
   app/studio.js changed.
   v77: tags-filter parity slice 1 (#21
   org sub-item) — Connections now carry the same Tags field + tag filter
   pills/badges/saved-views as Datasets (adapter pill parity already existed;
   the tag axis was the missing piece). app/studio.js changed.
   v76: fixed the Supabase adapter's
   testData() connection test, which was misreporting valid new-format
   publishable keys as rejected (Supabase's REST root now demands a secret
   key for introspection). app/sources/supabase.js changed.
   v75: M4.2 slice 5 (last object type) — the
   same private/public lock toggle now on Jobs too (owner rides on the plain
   `owner` field, no collision), hides another account's private jobs from the
   Jobs list; also closed a related leak in the job editor's source/join/union
   dataset pickers, which weren't yet filtering out other accounts' private
   datasets. app/studio.js changed.
   v74: M4.2 slice 4 — the same private/public
   lock toggle now on Explore's saved analyses too (owner rides on the plain
   `owner` field, no collision like datasets' acctOwner), hides another
   account's private analyses from Explore's saved list, the Studio library,
   and Home's pinned-analyses section. app/studio.js, app/studio.css changed.
   v73: UX2 dead-token sweep — --fg/--sans/
   --canvas/--green were referenced but never defined; routed to the real
   bridge tokens --ink/--font/--field/--good (fixes the transparent changelog
   search box). app/studio.css changed.
   v72: M4.2 slice 3 — the same private/public
   lock toggle now on datasets rows too (owner rides on a new `acctOwner` field,
   since datasets already had an unrelated free-text `owner` field), hides
   another account's private datasets from the Datasets catalog. app/studio.js
   changed.
   v71: M4.2 slice 2 — the same private/public
   lock toggle now on connections rows too, hides another account's private
   connections from the Connections catalog and the dataset editor's connection
   picker. app/studio.js, app/studio.css changed.
   v70: M4.2 slice 1 — a private/public toggle
   (lock icon) on dashboards rows, hides another account's private dashboards from
   Home/Dashboards/pickers. app/studio.js, app/studio.css, app/icons.js changed.
   v69: M4 admin — a rail area (admins only)
   to list every account, add/edit/remove one, and set their role (admin/viewer);
   PolecatAuth.remove() refuses to drop the workspace's last admin. app/index.html,
   app/shell.js, app/gate.js, app/auth.js, app/icons.js, app/studio.js, app/studio.css
   changed.
   v68: M3.2 connect-to-backend from
   sign-in — the sign-in screen gets a "Connect to your workspace…" entry point
   that opens the same backend-connect wizard Settings uses (stacked above the
   gate overlay), mirrors the connected/adopted workspace's users table into the
   local sign-in store (PolecatAuth.importFromStore), and mirrors the local
   seed up first so provisioning a blank backend from this screen still carries
   real admin/demo accounts. app/gate.js, app/auth.js, app/studio.js changed.
   v67: UX1 a11y quick wins — #toast now
   announces to screen readers (role=status, aria-live=polite), the pulsing demo-mode
   badge respects prefers-reduced-motion, and the pane-rail expand/collapse icon
   buttons (Data/Inspector) carry aria-label. app/index.html, app/studio.css changed.
   v66: the dashboard header text objects are
   editable on the canvas — double-click the title, subtitle or description to edit
   inline, and the description (the free text object) carries a ✕ to remove it.
   Preview-only affordances (export header stays byte-identical). app/studio-render.js,
   app/studio.js, app/exporters.js changed.
   v65: choropleth hover no longer sticks —
   the highlight is now a single always-on-top overlay path that re-points to the
   hovered region, instead of raising the hovered data path with appendChild (which
   detached the path mid-hover and swallowed its own mouseleave on dense maps like
   HUC8). Exactly one outline can ever show. app/studio-charts.js changed.
   v64: the Conservation Insight featured
   demo dashboard is rebuilt as a maps-first story — four headline KPIs, then
   choropleths at THREE scales (county hero, HUC8 watershed, state rollup) at the
   TOP so they land in the thumbnail, the provider ensemble trends, and a
   by-provider bar. Wears the Conservation theme. app/demopacks.js changed.
   v63: new "Conservation" dashboard theme,
   styled after CTIC (ctic.org) — their field-green #72892b + deep-pine #10432e on
   natural paper-sage surfaces, light + dark, with a CVD-validated 10-color ramp.
   app/model.js (DASHBOARD_THEMES), docs/index.html changed.
   v62: Explore polish — clicking a saved
   analysis reopens it (the empty-state gate keyed on XP.dsId stranded self-
   contained sample analyses with no dataset id; now keyed on XP.run), and the
   Explore preview drops the dashboard header (hideHeader on the preview spec) to
   show just the widget. app/studio.js changed.
   v61: M3.1 — sign-in replaces the passcode.
   New app/auth.js (PolecatAuth: a local user store seeded with admin + demo,
   SHA-256 hashes, session in analytics.session.v1); gate.js becomes a
   username/password sign-in with an "Explore the demo" path; demo login
   auto-installs the sample workspace; Settings gains an Account card (identity,
   Sign out, demo-content toggle); schema adds an additive `users` table (v4)
   mirrored on boot. app/auth.js (new, precached), app/gate.js, app/index.html,
   app/sources/schema.js, app/studio.js changed.
   v60: fleet-standard topbar, step 1 — the
   top-left now shows the CURRENT SECTION name (Home/Explore/Dashboards/…), updated
   by shell.js setActive(); the app identity stays in the rail brand. Replaces the
   redundant topbar wordmark. app/index.html, app/shell.js, app/studio.css changed.
   v59: FIX — the Explore rollup was applied
   to scatter/heatmap (multi-measure) charts and collapsed their data to one dot;
   the control is now limited to single-measure category charts (bar/line/donut/
   treemap/table). app/studio.js changed.
   v58: FIX — faint secondary buttons on the
   light content sections (Dashboards/Explore/Datasets/Jobs/Connections toolbars)
   were white-on-translucent (the dark-rail base .btn) and hard to read; now
   dark-on-light inside .app-sec. app/studio.css changed.
   v57: FIX — choropleth hover highlights
   stuck/accumulated on dense maps (HUC8 watersheds). Bringing the hovered region
   to the front reorders the DOM and can swallow its own mouseleave; now a single
   tracked highlight clears the previous region on every mouseenter and on map
   mouseleave. app/studio-charts.js changed.
   v56: Explore rollups. A group-by
   aggregation control in Explore (Sum/Mean/Median/Min/Max/Count over one or two
   group-by dimensions), applied via Studio.aggregateRows in applyOutputOptions so
   a saved analysis re-aggregates everywhere (Home/dashboards/export). Dropped the
   internal SE demo tip from Help. app/model.js, app/studio.js, app/studio.css,
   docs/index.html changed.
   v55: canvas consistency + header-off. The
   KPI delete ✕ now uses the same rounded, hover-red control as widgets (was an
   always-on red circle); a new "Show dashboard header" toggle (dashboard
   inspector) hides the whole title banner + description bar in preview AND export
   via injected CSS, for embed-ready "just KPIs + widgets" HTML.
   app/exporters.js, app/studio.js, docs/index.html changed.
   v54: FIX — primary call-to-action buttons
   (Datasets/Jobs "+ New", Explore "Save analysis", the dataset/job editors) were
   rendering white-on-transparent on light section backgrounds — invisible, so the
   actions read as missing. `.btn.primary` is now a solid brand fill globally.
   app/studio.css changed.
   v53: M2c — richer demo workspace. The
   Conservation Insight demo pack now seeds two connections (a file store + an
   illustrative Supabase repo backend), four datasets (raw export + real county /
   HUC8 / state-rollup geo data), and a county->state acreage-weighted-mean job,
   alongside the four analyses + featured dashboard; sampledata exposes
   Studio.SAMPLE_GEO for reuse. app/demopacks.js, app/sampledata.js changed.
   v52: panel -> widget (M2b) — the
   dashboard item is called a "widget" in all UI text (inspector title, canvas
   hints, keyboard help, docs); layout PANES and internal identifiers
   (spec.panels, data-panel-id, kind:"panel", .panel-* css) unchanged.
   app/studio.js, app/index.html, docs/index.html changed.
   v51: an Overview tour (M2) leads the
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
