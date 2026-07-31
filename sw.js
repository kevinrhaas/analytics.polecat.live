/* sw.js — N-DIST: installable, offline-capable app shell (repo root, registered by index.html).
   Network-first, cache-fallback: every request tries the network first (so an actively-developed
   app pushed to `main` every hour never serves stale JS while online) and only falls back to the
   cached copy when the network is unreachable — that's what makes the Studio usable offline/
   flaky-connection without risking "stuck on an old build" while online. Bump CACHE_NAME whenever
   the precache list changes materially; the activate handler deletes any older studio-shell-* cache. */
"use strict";
var CACHE_NAME = "studio-shell-v444"; /* v444: #103 AUTO-BACKEND — assigned
   backend ships with the account (provisioning.backend snapshot) + connects at
   sign-in; connectAdopt skipIfEmpty guard (studio.js, sources/sync.js + docs). */
/* v443: DURABLE-2 follow-up — Undo button
   on every bulk-delete toast (studio.js, datasets.js, connections.js, jobs.js,
   views.js, studio.css + docs changed). */
/* v442: Track H sweep — the canvas
   in-place editing overlay's icon-only ✕ buttons (remove-description-text-
   object, delete-KPI-tile) now carry an aria-label, and the KPI one names
   the tile it deletes instead of a bare "Delete KPI" for every tile alike
   (app/studio-render.js changed, so the precached copy needs to roll). */
/* v441: LIVE-d slice 6 — Views section
   multi-select + bulk move/delete (views.js, app/index.html + docs changed);
   LIVE-d track complete. */
/* v440: LIVE-d slice 5 — bulk "Move to
   folder…" on every section bulk bar (studio.js, datasets.js, connections.js,
   jobs.js + docs changed). */
/* v439: EXPORT-2 — export data-mode
   picker for live remote sources (snapshot / live-prompt / creds-embedded);
   studio.js + exporters.js + docs changed. */
/* v438: Track H sweep — the Inspector's
   shared delBtn() helper (KPIs/filters/panels/columns/params/calculated
   columns/output filters/sort rules/union members, plus versions.js's
   Builder notes) now names its target in both title and aria-label instead
   of a bare "Delete" (app/studio.js, app/versions.js changed, so precached
   copies need to roll). */
/* v437: #23 — the overview tour
   defines every domain term: adapter woven into the Connections step,
   workbooks into Dashboards, filters into the Dashboard Builder, plus a new
   one-line-each glossary step (tutorial.js, base 10\u219211 steps) and a matching
   Help Glossary section (docs/index.html #glossary). */
/* v436: #101 — Home Examples group by
   sample pack: >1 contributing pack renders a subheading per pack (short name,
   4 cards each, per-group "+N more"); one pack keeps the flat strip
   (studio.js examples()). */
/* v435: the overview ("Take the
   tour") walkthrough is now pack-aware too, same engine as welcome.js's
   computeSteps() — one acknowledgment step per installed sample pack
   splices in right after the intro (app/tutorial.js changed, so the
   precached copy needs to roll). */
/* v434: DURABLE-2 — deletion
   tombstones: Workspace.remove records meta.tombstones[table|id] (users
   excluded), put revokes, replaceAll merges local∪incoming (newest wins,
   30-day prune) and never resurrects a tombstoned row older than its stone;
   supabase save() deletes ONLY tombstoned ids — absence is not deletion, the
   ?select=id remote diff is retired, last-row deletes finally propagate
   (workspace.js + supabase.js). */
/* v433: SETTINGS-ROAM slice 2 — the
   per-user chrome roams as one prefs.ls blob on the account's users row
   (curated ROAM_LS_KEYS: simple mode, restore opt-in, panels default, sample
   visibility, pane/canvas sizes, view toggles); captured on a 60s interval +
   visibilitychange, applied at sign-in with curated-key filtering + live
   re-apply of already-painted chrome (studio.js saveUserPref/applyUserPrefs/
   applyRoamedChrome). */
/* v432: VB-DROP — drag a CSV/TSV/JSON
   anywhere onto the Build section: bdDropFile creates the same file-kind
   dataset LF24's Quick import writes, profiles columns via QuickMode, and the
   bdPickView ladder (geo→choropleth avg, temporal→line + small-category color
   split, categorical→bars, else table) opens the pick on the shelves
   (build.js configure dropzone + overlay; .bd-drop-ov CSS). */
/* v431: VB-14 — per-dataset drafts in
   the View Builder: bdSelectDataset stashes the outgoing dataset's shelves/
   filters/calcs/chart and restores the incoming one's draft (localStorage
   studio-bd-drafts, LRU 20, debounced persist from render()); draft dot in the
   outline; Clear canvas button in the chart strip resets only the current
   dataset (build.js + studio.css). */
/* v430: VB-13 — the View Builder
   datasets pane drag-resizes (200-480px via #bdLeftResize, persisted at
   studio-bd-lw) and collapses to a 40px vertical rail (#bdLeftRail, persisted
   at studio-bd-collapse) — setupBuildPane in studio.js, bd-rail/bd-left-resize
   CSS in studio.css, restructured .bd-left in app/index.html. */
/* v429: FILTERS-1 — pack dashboard filters
   genuinely filter: since<Col> range semantics + shared filterRowsByParams in
   mockRespond AND a new applyParamFilter on every real-engine dispatch result
   (studio-render.js); geo/KPI/provider DAs declare practice+sinceYear so
   paramsFor forwards flips to all 8 featured panels (demopacks.js +
   ensureConservationFilterParams heal, called from reconcilePackDashboards). */
/* v428: LF21 header alignment —
   Header inspector gains a Left/Center/Right Alignment picker (app/studio.js);
   exporters.js always emits a leading ".dk-header-lead" spacer next to the
   brand block and a conditional CSS override (headerAlignCss) so center/right
   apply identically in preview and every export; app/model.js carries
   spec.headerAlign through emptySpec/normalize/diffSpecs. */
/* v427: USER-ADD-DURABLE + SYNC-FRESH —
   mirrorUserRow change-detects and puts NON-silently so a new/changed account
   row schedules a push (Add-user also pushNow()s + verifies, studio.js);
   Sync.touch() lets silent status stamps (dataset lastRun/columns, job failed
   lastRun, connection lastTest) reach the mirror (sync.js + 3 call sites);
   quietPull background freshness — interval + tab-focus re-pull, adopt only
   when different, dirty/empty-remote guarded (sync.js). */
/* v426: DECLUTTER-1 + PACK-BLURB + SET-ROW-B —
   the Sample-packs group is out of the builder Data panel (Settings is the one
   install surface; buildDemoPacksLib call removed, studio.js) and the app
   footer is RETIRED (returns fleet-wide via polecat-shell later; What's-New
   stays on the topbar — app/index.html); Conservation pack copy halved
   (demopacks.js); .set-row-txt block-bold scoped to direct children so inline
   emphasis in descriptions stays inline (studio.css). */
/* v425: PANEL-H batch — dashboard panels drag
   taller via a bottom-edge handle (studio-render.js .sr-resize-h posts resizeH →
   studio.js writes chart.opts.height, the knob charts already draw to; card
   opts.h stretches table/richtext too; exporters.js handle CSS); PACK-FEATURED
   (demopacks.js featureConservationGeo — watershed auto-featured on install,
   never overriding a user choice); HOME-LAND (gate.js afterLogin → home);
   VB section gets the app-standard outer gutter + .da-name small grey meta
   (studio.css); hint-bar + docs copy. */
/* v424: XP-UPDATE — Quick Views' Update View
   preserves every analyses-row field the editor doesn't own (builder blob, kpi
   when still a KPI, private, owner) via a prev-spread instead of a bare rebuild
   — a builder-born map no longer blanks after Update; Quick View sections read
   Data/Chart/Mapping/Result (app/explore.js). */
/* v423: SETTINGS-ROAM slice 1 — branding lives
   in the SYNCED workspace settings (branding.js: workspace-first get/set, one-time
   local lift, re-apply on adopt); a signed-in account's theme prefs ride its own
   users row (studio.js saveUserPref/applyUserPrefs, applied in initAuthBoot; local
   accounts stay browser-local). Workspace-backend card action buttons wrap instead
   of crushing the name (studio.css). */
/* v422: USERS-DURABLE 2 — the users table is
   UPSERT-ONLY in sync (a stale admin mirror target-deleted the freshly-
   provisioned fntest row as "stale" minutes after v421); account removal is the
   Admin flow's explicit supabaseSource.deleteRows() at click time
   (supabase.js + studio.js). VB shelves column gains top padding to align
   COLUMNS with the DATASETS header (studio.css). */
/* v421: USERS-DURABLE + GATE-FIX-2 + ADMIN-LOCAL —
   the push is upsert-first with targeted stale-row deletes (never delete-all;
   an empty local table deletes nothing — the users-wipe class is dead,
   supabase.js); the gate adopts by verified sign-in email when the gotrueId
   stamp is missing and stamps it (gate.js); admin/admin joins demo/demo as the
   strictly-local demo accounts w/ self-healing seed (gate.js, auth.js);
   daHasRealEngine resolves connectionId so connection-bound DAs aren't
   shadowed by the EXPORT-1 snapshot (exporters.js). */
/* v420: EXPORT-1 — exported HTML carries a data
   snapshot for engine-less DAs: Studio.exportMock in exporters.js (shared engine
   classifier moved from viewer.js; genMock subset + Build.specMocks overlay),
   exportCDF/PDF pass it, the two embed paths warm the builder cache first
   (withSpecMocks). app/exporters.js, app/viewer.js, app/studio.js changed. */
/* v419: VB-12 — the View Builder preview canvas
   fills to the viewport bottom by default (JS-synced like .bd-left) and gains
   drag-resize handles on both axes (persisted at studio-bd-preview-size;
   double-click resets an axis to auto). app/build.js + app/studio.css changed;
   docs/index.html documents it. */
/* v418: HOTLINK-1 + BANNER-DISMISS + BACKEND-FUTURE —
   gate.js parses+scrubs a #ws=&user=&pass= invite fragment (workspace picked, fields
   prefilled); the DURABLE-1 sync-loss banner gains a ✕ (episode-scoped dismissal,
   studio.js/studio.css); the backend picker lists 3 greyed Future cards (PostgreSQL/
   D1/MongoDB Atlas); docs/index.html documents the hot-link format. */
/* v417: ACTIVITY-1 + BRAND-LINK — NEW app/activity.js
   (precached; loads after sources/sync.js): Studio.Activity logs sign-in/sign-out/
   session-end/dashboard-open/export to polecat_activity and the new topbar feedback
   button's reports to polecat_feedback (both via supabase.js insertRow with the
   user's session; local-only queues + flushes). branding.js suiteHref: the custom
   rail name can carry its own destination. index.html, studio.js, gate.js,
   icons.js changed (all precached). */
/* v416: BRAND v2 + polish — favicon/icon-192/512/
   apple-touch are the new vector coin mark; precache swaps polecat-mark-*.png for
   polecat-logo-coin-cream.svg + polecat-logo-black.svg; gate logo = coin; rail
   defaults EXPANDED on first desktop visit (shell.js); Admin go-live card is
   posture-aware (supabase.js anonProbe + studio.js refreshGoLiveCard); Data
   Management pack copy counts 12 (demopacks.js). All precached files rolled. */
/* v415: WORKSPACE-LOGIN fix — direct-auth stamps the
   verified credentials on the picker-bound connection (Sync.setAuthCredentials)
   BEFORE the adopting pull; without them the pull ran as anon and authenticated-only
   RLS read the workspace as empty ("isn't in your connected workspace" for a
   provisioned admin on a fresh browser). app/gate.js + app/sources/sync.js changed. */
/* v414: HOME-EX2 + EXPLORE-LAYOUT — the 4 pack-less
   examples are stamped demoPackId "datamanagement" in data/examples/index.json
   (precached; the strip only shows installed packs now); Home gains a per-user
   Clear-recents button (hide-only stamp, never a delete); Quick Views saved-rows
   wrap instead of crushing the name. app/studio.js, app/studio.css, docs changed. */
/* v413: WORKSPACE-LOGIN — the sign-in screen gains a
   Workspace picker fed by the NEW packaged catalog app/workspaces.js (precached; loads
   before gate.js) plus locally imported access files; picking a workspace BINDS the
   connection without pulling (Sync.bindConnection) so an unauthenticated device can't
   adopt an empty remote over local data; Settings backend card gains Export access file.
   app/gate.js, app/sources/sync.js, app/studio.js, docs/index.html changed (precached). */
/* v412: DURABLE-1 — the 8-unpinned-cap autosave
   eviction is REMOVED (it silently deleted dashboards once the table became durable
   objects); sync adoptions (boot pull / Refresh / connect) re-run the registered pack
   heals via Sync.onAdopt/healAfterAdopt and push the healed state; repeated push
   failures raise a persistent sync-loss banner (publicState pendingEdits/pushFails).
   Original v411: CONS-3 — new radarSectors "Metrics wheel"
   chart type (studio-charts.js extension: tinted category sector wedges, numbered rim,
   value polygon, grouped side legend; model.js CHARTS def + newPanel mapping;
   studio-render case), and the pack seeds the "Conservation System Metrics" dashboard
   over a curated 12-row metrics dataset via a builder-blob da (#118 real rows);
   ensureConservationMetricsWheel backfills existing installs. Docs now say 52 types.
   Original v410: CONS-4 — the Conservation pack's four
   per-practice analyses are View Builder-native (builder blobs over the raw provider
   dataset, authored via the pure Studio.Build.compute so seed and #118 live re-run
   agree; ensureConservationBuilderViews heals older installs preserving pins), and
   VIEWS-LAYOUT-1: View tile feet wrap so actions stay inside the card.
   Original v409: VB-10 — View Builder Map gets a Region-scale
   control in the type strip (Auto = inferred via the shared Studio.guessRegionScale;
   state before fips so state_fips means States; temporal names never value-shape-match),
   the map id role prefers the geo-looking field from either shelf (bdGeoDim, name
   evidence first), and bdPanelFor stamps the effective scale into saved panels.
   Original v408: CONS-2 — the Conservation pack seeds a
   dedicated Watershed Map dashboard (full-width HUC8 choropleth hero + provider bars,
   foldered, backfilled into existing installs by reconcilePackDashboards), the boot
   reconcile dedupes pack dashboards sharing demoPackId+source (keeps the foldered copy),
   and VB-9: [hidden] notice shells compute display:none (stray "(" artifact).
   Original v407: BOOT-FLASH follow-up — the standalone dashboard
   viewer (app/viewer.html/app/viewer.js) gets the same pre-paint theme stamp + boot veil
   #508 shipped for the main app, which had missed this second entry point; app/gate.js's
   now-fully-redundant async theme stamp (superseded by both entry points' own pre-paint
   scripts) is deleted. app/viewer.html, app/viewer.js, app/gate.js, docs/index.html, STATUS.md,
   js/changelog.js, tests/run.js.
   Original v406: QV-1 — Quick View choropleths default the
   Region scale from the Region-id column (name heuristics first, value shape fallback;
   explore.js xpGuessRegionScale inside xpGuessMapping — manual picks still win).
   Original v405: VB-8 — the add-to-dashboard picker pins a
   “+ New dashboard” choice above the list (blank spec + this View, the same
   xpAddAnalysisToNewDashboard path). Original v404: BOOT-FLASH + SIGNOUT-1 — app/index.html
   stamps the saved theme attributes pre-paint and veils #app (html.ps-booting) until the
   studio.js boot tail releases it with a short fade (4s failsafe; reduced-motion honored);
   the \u22ef menu's Sign out now calls PolecatAuth.logout() so the gate actually returns.
   Original v403: VB-7 — saved Views carry an independent
   panelTitle (Save-dialog field; defaults to and tracks the View name; wins in the builder
   preview, KPI labels, and both Explore dashboard-placement paths). Original v402: VB-6 — a numeric field on the View
   Builder's Columns shelf gets an aggregation dropdown even before it's summed, with a
   CATEGORY choice that flips it to a plain (grouped) dimension; id-like numeric columns
   (*_fips/*_id/id) default to CATEGORY instead of SUM on first drop. app/build.js,
   tests/run.js, STATUS.md, js/changelog.js.
   Original v401: CONS-0 — the sample engine pct metrics
   trend UP across the label axis (declining only for regressive columns like conventional_*),
   and 3+ pct columns in one data access renormalize row-wise to ~94% (shares of a whole) so
   practice-mix stacks stop reading 375%. Original v400: SAMPLE-DATA-1 — raw demo-DB sample tables are
   pack-gated (View Builder + Explore pickers list them only while the Data Management pack is
   installed, grouped under the pack name); every Conservation-pack object is filed in the
   Conservation Insight folder across all types, with a boot-reconcile backfill for existing
   installs. Original v399: STUDIO-PANELS — the Dashboard Builder opens
   clean (Data + Inspector panels closed) by default, applied on boot + every enterStudio;
   new Settings preference "Open the builder with side panels" (studio-panels-default).
   Original v398: LIVE-d slice 3 — Jobs gains the
   same Select / bulk-delete multi-select pattern Datasets/Connections proved in slices 1-2
   (checkbox overlay on every row/tile, a bulk bar with Select all/Clear/Delete; the delete
   confirmation notes that a job's output dataset is kept, same as deleting one individually).
   app/jobs.js, app/index.html, docs/index.html, STATUS.md, js/changelog.js, tests/run.js.
   v397: DESIGN-1 — Polecat design system light pass:
   Hanken Grotesk self-hosted (assets/fonts/*.woff2, weights 400/600/700/800, joins the
   precache) as the brand face across landing + app + docs, and the new Polecat mark
   (assets/brand/polecat-mark-*.png) on the landing nav/footer + the sign-in gate.
   Original v396: PDC-RENAME — the dashboard toolkit is now DashKit:
   vendor/pdc-ui.js|.css -> vendor/dashkit.js|.css (precache list updated), window.PDC ->
   window.DashKit, .pdc-* -> .dk-*, --pdc -> --dk (cssvar keeps a legacy --pdc alias so saved
   dashboards keep their colors). Historical comments below reference the old names — they
   describe past releases and are left as written.
   Original v395: KEVIN-LIVE emergency triple — ALSO SCORE-1
   (app/studio-render.js): interactive filters were DEAD against mock/sample data (the
   vendored mock branch ignored params) — PDC.cda's wrapper now column-match-filters mock
   rows or applies seeded deterministic variation for server-side params; and the builder's
   close overlays (sr-head-del/sr-desc-del/sr-kpi-del + header wiring) are idempotent across
   filter reloads (they used to append one more per filter change). Original pair — (1) the Settings
   Sample-packs card was gated on showSamples(), so hiding sample content removed the packs'
   only install surface; card now always shows, hidden mode gets a note, Install flips sample
   content back on. (2) "wildly flaky" root causes: pullNow (Refresh) did push-then-pull and
   adopted the remote EVEN WHEN THE PUSH FAILED, replaceAll-ing over the refused local edits
   (silent data loss); now it keeps local + the honest error while dirty. rest() surfaces the
   PostgREST body on 401/403 (RLS "new row violates row-level security policy" was hidden
   behind "rejected the API key"), and save() hands over WS.rlsPolicySQL() — idempotent
   enable-RLS + open read/write policy for every workspace table (matches the current
   UX-gating posture; M7 tightens later). app/studio.js, app/sources/sync.js,
   app/sources/supabase.js, app/sources/schema.js.
   v394: LIVE-e part 3 — the 8 hidden docs .fig-slot
   placeholders are FILLED with real-app captures (docs/img/*.png, produced by the new
   tools/snap-docs.mjs: seeded workspace, staged surfaces via the __studio* hooks, 2x region
   clips) plus a click-to-zoom lightbox (click/Esc dismisses). docs/index.html figures get
   has-img + img + updated dashtheme caption/comment. LIVE-e is now fully closed.
   v393: LIVE-d slice 2 — Connections gains the
   same Select / bulk-delete multi-select pattern slice 1 shipped on Datasets (checkbox
   overlay on every row/tile, a bulk bar with Select all/Clear/Delete; the delete
   confirmation calls out datasets that reference a selected connection). app/connections.js,
   app/index.html, docs/index.html, STATUS.md, js/changelog.js, tests/run.js.
   v392: #118 live re-run — builder-made Views render
   their REAL computed result everywhere: the basis pipeline in app/build.js is parameterized
   on an explicit state (st defaulting to BD), Studio.Build.runBlob recomputes a saved
   `builder` blob (source load + calcs + filters + basis, cached per blob JSON), bdSave stamps
   the blob on the da (analysisSpec/xpAddAnalysisToSpec heal legacy rows), and the preview
   mock paths overlay real rows: doRefresh (ensure-then-re-enter like geo), singlePanelHtml
   (zoom), homeLiveFrame (Home cards), and Quick Views' cross-open fallback previews the
   recomputed result live. Viewer + exported-HTML overlay is the documented follow-up.
   app/build.js, app/explore.js, app/studio.js, docs/index.html.
   v391: VB-5 cross-editor View opening (Kevin: "open any
   view in either quick view editor or the view builder… give a notification that this was
   built in the higher level editor… do your best to handle and render it") — any View opens
   in EITHER editor: Studio.Build.loadForeign reconstructs a Quick View's mapping onto the
   shelves best-effort (dims/measures/rollup fn/Color, nearest chart type); Quick Views opens
   builder-made Views best-effort (incl. a KPI spec branch in xpSpec) — both with a
   dismissible cross-editor notice (#buildNotice / .xp-cross-note). Both targets offered at
   every open point: Views rows (owner Open + other-editor button), Explore saved rows (▤),
   Home pinned cards (owner-routed overlay + header alt button), Repository (owner-routed
   repoOpenRow + quick-edit panel alt button). bdSave now preserves pinned/private/owner/
   createdAt on update (Workspace.put replaces rows wholesale). app/build.js, app/explore.js,
   app/views.js, app/studio.js, app/index.html, app/studio.css, docs/index.html.
   v390: LIVE-d slice 1 — Datasets gains the same
   Select / bulk-delete multi-select pattern LF59 shipped on Dashboards (checkbox overlay
   on every row/tile, a bulk bar with Select all/Clear/Delete). app/datasets.js,
   app/index.html, app/studio.css, docs/index.html, STATUS.md, js/changelog.js.
   v389: LIVE-e part 2 slice 2 (Kevin: "ALL of the docs
   should be reviewed for the walls of text") — the remaining 31 paragraphs >800 chars
   restructured into headings/bullets/numbered steps: welcome flow, export/import repo,
   workbooks+folders, Home, viewer eye, Quick Views intro, crosstab, share, version history,
   build progress/Checks, import-from-URL, slideshow, dashboard filters, template variables +
   date tokens, ⓘ Sources, live-after-export, connection-bound datasets, Redshift, schema
   browse, Google Sheets (+private), CSV/JSON, freshness, dataset pills, Supabase auth/add
   user/backends/go-live, hover Export, Dashboard defaults. Zero paragraphs >800 chars remain;
   all test-pinned anchors/strings verified. docs/index.html, STATUS.md, js/changelog.js.
   v388: LIVE-e part 2 slice 1 (Kevin: "massive
   paragraphs… so daunting!") — docs readability: the ~11 biggest walls of text rewritten
   into h3/h4 + bullets/sub-bullets (rail+topbar guide, Quick import, Dashboard theme,
   Repository, Views catalog, View Builder navigator, calculated columns, Color theme
   picker, folder filing, Edit JSON spec, how-syncing-works); hidden .fig-slot screenshot
   placeholders (HTML comments describe each wanted capture; display:none until an img +
   has-img lands). docs/index.html, STATUS.md, js/changelog.js.
   v387: LIVE-a slice 2 — the rest of the app's
   "Explore"/"Studio" strings sweep to the new rail terminology ("Quick Views"/"Dashboard
   Builder"): welcome tour, the six interactive tutorials, a saved View's open-button hints
   (now destination-aware), the command palette, the viewer's handoff link, a celebration
   toast, and the Jobs empty state. app/welcome.js, app/tutorial.js, app/explore.js,
   app/views.js, app/studio.js, app/palette.js, app/celebrations.js, app/viewer.html,
   app/index.html, tests/run.js, STATUS.md, js/changelog.js.
   v386: VB-6 (Kevin's overnight View Builder queue) — the
   Save View dialog gains a real Folder field (the same LF56 browse-a-folder-tree picker every
   other Folder field uses, seeded from the picked dataset's own folder) plus a name-suggest
   sparkle on the Name field, matching every other Save/editor dialog in the app. app/build.js,
   tests/run.js, STATUS.md, js/changelog.js.
   v385: VB-4 remaining major, KPI (Kevin's overnight View
   Builder queue, "hit major ones first") — KPI joins the chart-type strip. Structurally
   different from every other chart type here (spec.kpis, not spec.panels), so it gets its own
   bdKpiFor constructor (mirroring Studio's own newKpi + guessFmt convention) plus its own
   save shape (`kpi`, not `chart`) and its own add-to-dashboard/export wiring — Explore's
   analysisSpec and xpAddAnalysisToSpec both branch on chartType === "kpi".
   app/build.js, app/explore.js, app/studio.js, app/views.js, docs/index.html, tests/run.js,
   STATUS.md, js/changelog.js.
   v384: VB-4 remaining major, Scatter (Kevin's overnight
   View Builder queue, "hit major ones first") — Scatter joins the chart-type strip, a
   two-measure [dimension, measure1, measure2] basis (one point per dimension value) that lands
   directly on Studio.newPanel's existing scatter column mapping, no bdPanelFor wiring needed.
   app/build.js, docs/index.html, tests/run.js, STATUS.md, js/changelog.js.
   v383: VB-4 slice 2 (Kevin's overnight View Builder
   queue, "hit major ones first") — Stacked bars and Stacked area join the chart-type strip,
   riding the exact same multi-series basis engine Line already uses (Studio's own chart
   registry already treats them identically to line for column-order defaults). No new pivot
   logic. app/build.js, docs/index.html, tests/run.js, STATUS.md, js/changelog.js.
   v382: VB-4 (Kevin's overnight View Builder queue) —
   choropleth joins the View Builder's chart-type strip as "Map", reusing the bars/donut basis
   shape (idCol/valueCol) with no Color field and the heatmap long-form basis (idCol/seriesCol/
   valueCol) with one, plus the same lazy geometry-fetch path Studio's own dashboard preview
   uses. app/build.js, app/studio.js, docs/index.html, tests/run.js, STATUS.md, js/changelog.js.
   v381: VB-3 (Kevin's overnight View Builder queue) —
   a Color shelf splits Bars/Donut/Line into per-category colors, plus a series-palette picker
   reusing the Dashboards builder's own presets. app/build.js, app/studio-render.js,
   app/index.html, docs/index.html, tests/run.js, STATUS.md, js/changelog.js.
   v380: LIVE-e part 1 (Kevin: "help should respond to the
   theme settings and take out that back to studio button") — docs/index.html honors ALL
   seven app themes (added conservation/high-contrast/editorial/neon token variants), a
   postMessage listener applies LIVE theme changes (app posts studioDocsTheme from
   setTheme/setAppTheme + on docsFrame load), and the "Back to Studio" header button is
   removed. Part 2 (full readability rewrite + image placeholders) queued. docs/index.html,
   app/studio.js, tests/run.js, STATUS.md, js/changelog.js.
   v379: LIVE-b (Kevin: "start with the name of the
   dashboard… put it in a conservation insight folder") — sample-pack dashboards drop the
   shared "Conservation Insight — " title prefix (index.json + per-spec titles + the
   hand-built featured demo) and install into a pack folder (conservation → "Conservation
   Insight", datamanagement → "Data Management"); a boot reconcile heals pre-rename
   workspaces. data/examples/*, app/demopacks.js, app/studio.js, tests/run.js, STATUS.md,
   js/changelog.js.
   v378: VB-2 (Kevin's overnight View Builder queue) —
   shelf pills drag between Columns/Rows/Filters (converting shape per destination) and
   reorder within a shelf, not just via the ⇄ button. app/build.js, app/studio.css,
   docs/index.html, tests/run.js, STATUS.md, js/changelog.js.
   v377: LIVE-a slice 1 (Kevin: "fix the buttons… line up
   to terminology") — Home quick-action cards track the rail IA: a "New View" card (fresh
   View Builder) leads the grid, "Explore data" reads "New Quick View". app/studio.js,
   tests/run.js, STATUS.md, js/changelog.js.
   v376: sync anti-flake (Kevin: "supabase seems very
   flaky") — supabase rest() retries a single 429/5xx/network blip once in place (writes are
   idempotent); debounced pushes keep a 4s minimum spacing (pushNow/pagehide force-bypass);
   a rolling sync-activity log (last 12 attempts w/ error text) renders on the Settings
   backend card. Plus VB-1b live tweaks: alphabetical stable outline order + the datasets
   pane fills the viewport column. app/sources/supabase.js, app/sources/sync.js,
   app/build.js, app/studio.js, app/studio.css, docs/index.html, tests/run.js, STATUS.md,
   js/changelog.js.
   v375: #117 slice 5 — multi-dim series charting: the
   Line chart widens beyond one dimension + one measure, reusing the SAME pivot engine the
   table/heatmap already compute with — a Rows×Columns crosstab (one measure) charts one
   line per Columns value (the redundant Total column dropped), and one dimension + 2+
   measures (no Rows) charts one line per measure; bars/donut are untouched (no native
   multi-series form in this app). Save/reopen stamp the full series list on the panel map.
   app/build.js, docs/index.html, tests/run.js, STATUS.md, js/changelog.js.
   v374: VB-1 (Kevin's overnight View Builder queue) — the
   Build outline becomes a real navigator with Explore parity: folder tree (collapsible
   branches, "/" nesting), sample-set grouping (collapsed once you have your own), search box
   that flattens to matches, per-row inline-SVG icons, stacked readable name/sub labels with
   full-name tooltips, and ws manage ops on the pane (＋ New via the shared dataset editor,
   ✎ edit, ⧉ copy, ✕ delete). app/build.js, app/index.html, app/studio.css, app/studio.js,
   docs/index.html, tests/run.js, STATUS.md, js/changelog.js.
   v373: Kevin's rail IA + sync self-heal — rail regrouped
   (Workspace: Home/Views/Dashboards/Datasets/Connections/Repository; Build: Quick Views
   [ex-Explore]/Views [View Builder]/Dashboards [ex-Studio]; Manage: Jobs/Admin/backend
   indicator); the indicator reads state honestly (Local/Connected/Reconnecting…); a failed
   write-through now schedules a backoff retry (was frozen in error until manual Refresh) +
   one-time toast + Settings-card error block with copyable delta SQL + Retry now; the Views
   page ＋ New ▾ offers New View (builder) and New Quick View (Explore). app/index.html,
   app/shell.js, app/sources/sync.js, app/studio.js, app/views.js, app/studio.css,
   docs/index.html, tests/run.js, STATUS.md, js/changelog.js.
   v372: #117 slice 4 — calculated columns in the View
   Builder: the shared Studio.applyCalcCols/evalFormula engine ("=[a]/[b]", pctChange,
   movingAvg) extends the loaded rows once (memoized bdEff()), and from there calc columns
   behave like any field on the shelves/filters/charts; "＋ calc…" editor in the outline;
   name sanitizing + no shadowing real columns + deleting prunes dependent chips; persisted
   on the builder blob. app/build.js, app/studio.css, docs/index.html, tests/run.js,
   STATUS.md, js/changelog.js.
   v371: #117 slice 3 — the View Builder's Filters
   shelf: filters narrow the SOURCE rows before the pivot/charts/status compute ("in"
   value-checklist for text fields, min–max range for numerics; fresh filter = honest "all"
   no-op; active chips highlight; "N of M source rows (filtered)"); persisted on the
   builder blob and re-applied on reopen. app/build.js, app/index.html, app/studio.css,
   docs/index.html, tests/run.js, STATUS.md, js/changelog.js.
   v370: LF59 (3) — the Dashboards page toolbar
   cleanup: Export dashboards…/Import dashboards… tuck behind a new icon-only "More" (⋯)
   menu (dashMoreBtn/dashMoreMenu, same menu-wrap/menuToggle convention as every other
   dropdown), and a primary "+ New dashboard" button joins the toolbar, matching the
   [view toggle]…[+ New] pattern Datasets/Jobs/Connections/Views already use (role-gated
   via currentUserCanDevelop, same as Repository's New-menu entry) — LF59 is now fully
   done. app/index.html, app/studio.js, docs/index.html, tests/run.js, STATUS.md,
   js/changelog.js.
   v369: #117 slice 2 — the View Builder charts its
   pivots: a chart strip (Table/Bars/Line/Donut/Heatmap) renders the COMPUTED basis through
   the real dashboard renderer (buildHtml + PDC_MOCK srcdoc iframe, Explore's own preview
   plumbing); availability-gated buttons with reasons; Save stamps the chart type on the
   View + builder blob and reopen restores it. app/build.js, app/index.html, app/studio.js,
   app/studio.css, docs/index.html, tests/run.js, STATUS.md, js/changelog.js.
   v368: #117 slice 1 — the View Builder: a new "Build"
   rail section (app/build.js, precached) — dataset outline → Columns/Rows shelves (drag +
   click-to-add, SUM default on numerics, per-chip agg switch) → live table/crosstab via a
   pure pivot engine (Studio.Build.compute) → saved as a real View (analyses row with a
   `builder` blob; the Views catalog routes those back to Build). app/build.js,
   app/index.html, app/shell.js, app/studio.js, app/views.js, app/studio.css,
   docs/index.html, tests/run.js, STATUS.md, js/changelog.js.
   v367: LF63 slice 3 — live SQL sanity hints in the
   New-data-source builder (new pure Studio.sqlLint in model.js + a .dsb-lint warning strip):
   unclosed literals, unbalanced parens, non-SELECT/WITH statements, and declared-column
   drift surface as they're typed; Preview/Test stay the real verification. LF63 is now
   fully done. app/model.js, app/studio.js, app/studio.css, docs/index.html, tests/run.js,
   STATUS.md, js/changelog.js.
   v366: LF63 slice 2 — the New-data-source builder's
   credentialed kinds (Snowflake/Databricks/BigQuery/DuckDB/SQLite) gain the same "Browse
   schema" click-to-insert tree the Connections wizard + Dataset editor share; draft creds
   map onto the adapters' listSchema cfg shapes. app/studio.js, docs/index.html,
   tests/run.js, STATUS.md, js/changelog.js.
   v365: #28 (Kevin) — the marketing page gains a
   "Maps that speak your geography" section (#geo, between the chart gallery and Data
   sources; nav link "Maps"): the real watershed screenshot + all seven region scales,
   custom regions featured. index.html + css/landing.css are precached, hence the bump.
   index.html, css/landing.css, tests/run.js, STATUS.md, js/changelog.js.
   v364: LF65 — the legacy "Samples (115) · demo db"
   group is gone from Studio's Data panel; sample content comes only via Sample packs
   (one source of truth). Authored queries move to an always-visible "My queries" group
   (same collapsible chrome + historical class/storage names); #libCount now reports the
   cards actually rendered ("N items"). app/studio.js, docs/index.html, tests/run.js,
   STATUS.md, js/changelog.js.
   v363: LF57 follow-up — the Views catalog gains an
   Export action (app/views.js), downloading a tiny self-contained single-View .html straight
   from a saved View — no open dashboard needed — via a new studio.js exportAnalysisEmbed(a),
   exportPanelEmbed's twin fed from Studio.Explore.analysisSpec(a) instead of an in-canvas
   panel. The last of the three items LF57 slice 1's own DONE note left "genuinely still open"
   (Duplicate shipped v360, per-chart-type icons shipped v362) — LF57 is now fully done.
   app/views.js, app/studio.js, docs/index.html, STATUS.md, js/changelog.js, tests/run.js.
   v362: LF57 follow-up — Views rows/tiles show a
   themed per-chart-type icon (reusing Studio.CHART_SVG + studio.js's themedChartSvg, the same
   gallery-thumbnail art the chart-type picker draws from) instead of one generic glyph shared
   by every row; falls back to the generic icon for a type with no gallery thumbnail. The last
   of the three items LF57 slice 1's own DONE note left "genuinely still open" (Duplicate
   shipped v360; only a standalone export remains). app/views.js, app/studio.js,
   docs/index.html, STATUS.md, js/changelog.js.
   v361: LF50 (b) — the Settings "Quick import
   creativity" row is hidden for now (Kevin: "it's confusing things for now until we improve
   that"); the stored High default + all low/high build machinery stay, only the chrome is
   gone. app/studio.js, docs/index.html, tests/run.js, STATUS.md, js/changelog.js.
   v360: LF57 follow-up — the Views catalog gains a
   per-row Duplicate action (clones the persisted analysis row: chart/folder/private carried
   over, pinned reset, uniquified "(copy)" name via a new uniqueAnalysisName helper) — one of
   the three items LF57 slice 1's own DONE note left "genuinely still open." app/views.js,
   docs/index.html, STATUS.md, js/changelog.js.
   v359: LF57 slice 1 — a new "Views" rail section
   (app/views.js, Studio.ViewsCatalog) is a dedicated browse/manage catalog for saved Views
   (the analyses table Explore builds): list/tile toggle, folder + chart-type facets, search,
   and per-row Open/pin/private/Add-to-dashboard/Delete actions — reusing Studio.Explore's own
   pin/private/load/add-to-dashboard methods so state never drifts from Explore's own sidebar.
   New precached file (app/views.js). app/index.html, app/shell.js, app/studio.js,
   docs/index.html, STATUS.md, js/changelog.js.
   v358: Kevin live feedback — Explore's savebar reads
   "Save View"/"Update View" and the hero/tour/Help frame the saved result as a View (last
   "analysis" stragglers from LF52); Settings' connected-backend row wraps at phone width so
   the name stays readable and "Switch backend" stays on-screen. app/explore.js,
   app/index.html, app/tutorial.js, app/studio.css, docs/index.html.
   v357: LF55(4) — the job editor's approximate output
   preview and the real Preview-button result now share ONE result area (badged "Sample —
   approximate" vs the real ✓ result), with the Preview button pulsing (.btn-invite) whenever
   what's shown is approximate/stale. app/jobs.js, app/studio.css.
   v356: LF43 slice 2 — the Studio Examples ▾ menu is
   REMOVED (samples are real Dashboards rows + Home gallery tiles; Home's card reads "Sample
   dashboards"; "+N more" routes to the Dashboards Sample-packs view via the shared
   showPackDashboards(); ⌘K re-sourced; __studioLoadExample test hook replaces menu-click
   loading). app/index.html, app/studio.js, app/palette.js, docs/index.html.
   v355: LF55 (5) — the job editor's step-type <select>
   becomes a themed icon-panel picker: a trigger (current kind's glyph + label) expands a grid of
   all 9 kinds as icon tiles, select-and-see; picking one resets the step like the old onchange
   did. 3 new icons (funnel/wand/key). app/jobs.js, app/icons.js, app/sources/jobs-engine.js,
   app/studio.css.
   v354: LF67 follow-up — the "New dashboard" family
   (Home's Blank-dashboard card + its drag-a-dataset variant, the New ▾ menu's Blank dashboard,
   and its auto-build starters from a workspace dataset or a sample query set) now warns before
   silently replacing an unsaved Quick-import build, same guard openRecent already had.
   app/studio.js changed, so precached copies roll.
   v353: LF51 (Explore navigator) — the dataset picker is a
   multi-level tree: ws datasets group by folder (nested via "/", unfiled last), sample data
   groups by set (default-collapsed once you have your own datasets), branches collapse/expand,
   search flattens. app/explore.js, app/studio.css, docs/index.html.
   v352: LF51 (command center) — Repository gains a ＋ New ▾
   menu that creates EVERY object kind (dashboard / View / dataset / connection / job), each
   routing into that kind's own builder; "New dashboard" is role-gated like Home's card.
   app/index.html, app/studio.js, app/explore.js (startNew), app/studio.css, docs/index.html.
   v351: bugfix (Kevin) — the builder canvas drop hint +
   preview toolbar hint now say "drop a dataset" (what you actually drop from the Data panel),
   not the stale "query" wording. app/index.html only (precached).
   v350: LF60 (3) — Filter/Header inspector help badges
   deep-link to dedicated "dashboard-filters"/"dashboard-header" docs anchors instead of falling
   back to the whole generic "builder" section. docs/index.html gains the two anchors' content;
   app/studio.js changed, so precached copies roll.
   v349: LF60 slice 3 — contextual help badges deep-link into
   the IN-APP Docs view at their anchor (inspector "?" #inspHelpLink, per-section .sec-help,
   per-chart .ct-help, empty-canvas .k8-help-link): shell.js gains __studioOpenDocs(anchor) +
   a capture-phase delegated click handler; a plain click routes in-app, a modifier/middle click
   keeps the standalone new-tab href. app/shell.js only.
   v348: LF60 slice 5 — a workspace-backend comparison table
   (Local / Turso / Supabase / Firebase — data location, cross-device sync, per-user privacy,
   setup) opens the Admin & backend setup docs. docs/index.html only (precached content).
   v347: LF55 (2) — job editor Filter step's value field
   suggests the target column's known sample values via a <datalist> (the same "type or pick"
   pattern the Folder fields use), reusing the same live source-row query the previews already
   fetch. app/jobs.js, docs/index.html changed, so precached copies roll.
   v346: LF60 slice 2 (split) — Help splits User guides from
   Admin setup: the admin backend/provisioning topics (real Supabase Auth sign-in, in-app account
   provisioning, per-user provisioning defaults, managing backends, going live with per-user RLS)
   move out of Data sources into their own #admin-docs "Admin & backend setup" section; the docs
   nav gains User/Admin group labels + an Admin link. docs/index.html only (precached content).
   v345: LF60 slice 2 — docs search. docs/index.html gains
   a search box in the nav bar (embedded + standalone): indexes every section heading and chart-
   type card, matches title-first then body text, jumps + flashes the hit on click/Enter, "/" to
   focus. docs/index.html only (precached content, no app/*.js change).
   v344: LF39 item 2 / M7 — one-step GoTrue direct-auth at
   sign-in: new supabaseSource.authenticate(cfg,{email,password}) verifies FORM-supplied creds
   against GoTrue's password grant (reusing gotrueSignIn, no session-cache side effects); gate.js
   tryGotrueDirectAuth wires it in when the active backend is supabase + the username is an email,
   adopting the local account by gotrueId. app/sources/supabase.js, app/gate.js.
   v343: LF39 (polish) — on a fresh device, a failed sign-in
   for an unknown username with no backend connected now visually CUES the "Connect to your
   workspace" button (.g-connect-cue: promoted to a pulsing primary-outline button + scrolled into
   view), cleared on username edit or connect. app/gate.js.
   v342: LF60 (in-app Docs, slice 1) — the Help rail item now
   opens an embedded Docs SECTION (#secDocs) that iframes docs/index.html, with an "Open in new tab"
   pop-out to the standalone page; the ⌘K "Open Help & docs" command routes to the same in-app
   section. shell.js SECTIONS/labels gain "docs". app/index.html, app/shell.js, app/palette.js,
   app/studio.css.
   v341: LF40 (pack-aware tour engine) — the welcome carousel
   is computed at open() from a 5-step base PLUS one "curated content" step per installed sample
   pack (name/tagline pulled from demopacks.js, no hardcoded copy), so a provisioned user meets
   their curated dashboards/datasets in the welcome flow. app/welcome.js.
   v340: LF55 (1) — job editor column dropdowns: the Filter,
   Rename and Cast steps' column fields are now colSelect() dropdowns of the step's incoming
   columns (colsBeforeStep) instead of free-text inputs, extending LF13a's group-by/metric/join-key
   dropdowns to every column-naming field. Existing values stay selectable. app/jobs.js.
   v339: LF55 (3) — job editor stale-preview fix: editing
   steps (+ Step / op change / reorder / delete) now clears the last REAL Preview result
   (result + preview) in renderSteps, so the leftover duplicate table can't linger next to the
   live approximate preview. app/jobs.js.
   v338: LF34 — Style presets show which one is Active: a
   preset whose saved fields match the live defaults is derived as active (no new stored state,
   activeStylePresetId in defaults.js) and marked with an "Active" pill + highlighted row in
   Settings. app/defaults.js, app/studio.js, app/studio.css, docs/index.html.
   v337: LF66/LF59 — dashboard folder chip on the TILE: the
   Dashboards tile view now carries a persistent folder chip (.recent-folder-chip) reading the
   folder name (or "Add to folder" when unfiled) and wired to the same shared .recent-folder move
   handler / LF56 picker — previously the folder badge + move button were list-view only.
   app/studio.js, app/studio.css, docs/index.html.
   v336: LF66 — workbooks can also go into a folder: workbook
   records gain an optional `folder`; each workbook chip in the Dashboards section gets a
   move-to-folder button (LF56 picker) + an in-folder marker (setWorkbookFolder, renderDashboards
   wb-chip). app/studio.js, app/studio.css, docs/index.html.
   v335: LF66/LF59 — dashboard FOLDERS alongside workbooks:
   dashboards (which already carry the flat "/"-path `folder` field in the Repository tree) get a
   Folders chip facet on the Dashboards page (composes with the workbook chips), a per-row folder
   badge, and a move-to-folder button reusing the LF56 picker (renderDashboards + dashListRowHtml,
   _dashFolderFilter). app/studio.js, app/studio.css, docs/index.html.
   v334: LF63 slice 1 — the Dataset editor gains a "Browse
   schema" button (reusing the Connections wizard's already-shipped adapter.listSchema() tree)
   whenever the picked connection's adapter can introspect its own tables/columns; clicking a
   table/column drops it into the Table field or the SQL query at the cursor instead of typing it
   blind. app/connections.js (optional onPick on renderSchemaPanel, exported on Studio.Connections),
   app/studio.js (Studio.insertAtCursor exported), app/datasets.js, app/studio.css.
   v333: LF51 (d), last of the four workspace catalogs —
   the Repository section gains the same list ⇆ tile view toggle already shipped on Dashboards/
   Datasets/Connections/Jobs (#repoViewToggle, persisted at studio-repo-view). A tile renders
   inside whichever folder group it already belongs to; only the per-row markup (cx-row ⇆
   dsx-tile) and each group's contents wrapper (cx-list ⇆ dsx-grid) switch — the folder tree
   grouping itself is unchanged. app/studio.js, app/index.html, docs/index.html.
   v332: LF59 (2) — multi-select + bulk delete on the
   Dashboards page: a new "Select" toolbar button enters select mode (checkboxes on every
   tile/row, tap-to-select instead of open), with a bulk bar (Select all / Clear / Delete) above
   the grid/list. Sample-pack dashboards are selectable/deletable like any other row, per LF59's
   own SAMPLE-DELETE SEMANTICS note. app/studio.js, app/studio.css, app/index.html, docs/index.html.
   v331: LF59 (1) — selective export: "Export dashboards…"
   now opens a subset picker (collectRepositoryExport(dashIds) scopes the file to the chosen
   dashboards + the data sources they reference + relevant pins/workbooks; select-all keeps the
   historical full export). app/studio.js, app/studio.css, app/index.html wiring, docs/index.html.
   v330: LF56 (folder picker, slice 3) — the Browse button
   now also sits on Explore's compact "Folder" field, the last un-wired Folder surface, making LF56
   fully done. It's a sibling flex item next to the sparkle wrap rather than nested inside it — the
   sparkle wrap is a tight overlay (input padded for one absolute icon) sized to the savebar's
   compact slot, so cramming a second control into that same box overflowed it and pushed the Save
   button out of place in an earlier attempt; a sibling item just wraps to its own line at narrow
   widths like the savebar's other buttons already do. app/explore.js + docs/index.html changed, so
   precached copies roll.
   v329: LF54 (slice 2) — density tightening: the two
   off-scale 30px vertical gaps in the workspace catalogs (the toolbar→list `.repo-io` gap and the
   inter-subsection `.repo-sub2` gap) are now the 20px spacing-scale token, continuing slice 1's
   left-align density pass and putting both back on the --sp scale (app/studio.css).
   v328: LF56 (folder picker, slice 2) — the shared
   Studio.folderPickerButton (a "Browse" affordance opening openFolderPicker) is now wired next to
   the Folder field in the dataset (datasets.js), connection (connections.js) and job (jobs.js)
   editors, not just the Repository quick-edit — folder filing is the same picker across the editors.
   Explore's compact inline save bar is a deferred follow-up (needs a layout pass to fit a 3rd
   control next to its absolute-positioned sparkle). app/studio.js + those three files changed, so
   precached copies roll.
   v327: LF56 (folder picker, slice 1) — a shared
   openFolderPicker() modal (Studio.openFolderPicker) navigates the flat "/"-separated folder tree
   by breadcrumb, searches all filed paths, creates nested folders inline, or clears — over the same
   `folder` strings (no data change). folderPickerButton() adds a "Browse" affordance next to a
   Folder <input>; first wired into the Repository quick-edit. app/studio.js + app/studio.css changed,
   so precached copies roll. NEXT: the dataset/connection/job editors + Explore save bar.
   v326: LF52 (analysis→View, app-UI slice) — user-facing
   "analysis"/"Analyses" become "View"/"Views" across the app surfaces: Explore's save bar
   (placeholder/aria/toasts/confirm/preview), the Home "Pinned Views" section + card fallbacks, and
   the Repository object type label. Internal ids/keys (the `analyses` store, "analysis-"+id, data-*
   attrs) are unchanged. app/explore.js + app/studio.js changed, so precached copies roll. The tour/
   welcome/docs copy pass is a deliberate follow-up (needs per-string judgment; "Quick analysis" tour
   name stays).
   v325: LF64(3) a11y — the dataset builder's "Date token"
   insert menu is now fully keyboard-operable: trigger toggles aria-expanded (aria-haspopup=menu),
   ArrowDown/Enter/Space opens + focuses the first token, Up/Down/Home/End move, Escape closes and
   restores focus to the trigger (and stopPropagation so Escape no longer bubbles to the modal's own
   close), role=menu/menuitem semantics. app/studio.js changed, so precached copies roll.
   v324: LF69(c) — the Interactive GL choropleth renderer
   (a <canvas>, not an <svg>) can now export as PNG: studio-charts.js sets
   preserveDrawingBuffer:true on the MapLibre map, and both PNG rasterizers (studio-render.js's
   downloadPanelPng/addDownloadChrome — the on-panel Export ▾ menu — and studio.js's
   exportPanelPng — the Inspector's "Save chart as PNG") fall back to capturing the map's own
   canvas when no <svg> is found. app/studio-charts.js, app/studio-render.js, app/studio.js,
   docs/index.html changed, so precached copies roll.
   v323: LF45 (Save-as half) — the builder toolbar's "Save as"
   op now carries a VISIBLE "Save as" label next to Save (was icon-only, and its glyph collided with
   Duplicate's), so the two related save actions read as a pair. Desktop only — the phone ops cluster
   still folds behind ⋯ More, so no bar-width cost. app/studio.js changed, so precached copies roll.
   v322: LF32(a) — the dataset builder's offline Query Preview
   now carries an unmissable "SAMPLE — not your data" badge pinned above the sample table (the field
   label reinforces it), so fabricated shape-illustrating rows can never be mistaken for a live query
   result (the original LF32 report). app/studio.js + app/studio.css changed, so precached copies roll.
   v321: LF64 slice 3 — a "Date token" button on the dataset
   builder's query fields (SQL / Generic SQL-HTTP / BigQuery) drops the built-in dynamic tokens in at
   the cursor from a labeled pick-list (Studio.DATE_TOKENS), so relative-date filters are discoverable
   + typo-free. app/studio.js + app/studio.css + docs/index.html changed, so precached copies roll.
   v320: LF64 slice 2 — the dynamic date-token set grows to
   cover weeks + quarters: {{week_start}}/{{week_end}} (Monday-start, matching date_trunc('week'))
   and {{quarter_start}}/{{quarter_end}} (calendar Q1–Q4), resolved at run time by WS.dynamicParam.
   app/sources/schema.js + app/studio.js (Parameters hint) + docs/index.html changed, so precached
   copies roll.
   v319: LF64 slice 1 — built-in DYNAMIC date tokens usable
   in any dataset query with no parameter defined: {{today}}, {{yesterday}}, {{tomorrow}},
   {{today±N}}, {{month_start/end}}, {{year_start/end}} → ISO date, {{now}} → ISO timestamp,
   resolved fresh at run time via WS.applyParams → WS.dynamicParam; a real param of the same name
   still wins. app/sources/schema.js + app/studio.js (Parameters-section hint) + docs/index.html
   changed, so precached copies roll.
   v318: LF66 slice 3 (library reorg, part 6 cont.) — a
   dataset dropped on the canvas (or a blank dashboard) now AUTO-PICKS its best-fit chart via the
   shared chartForDA heuristic (time col → line, share-like → donut, else bars) instead of always a
   bare bars panel: addFromWorkspaceDataset auto-picks when no explicit type is given, and both
   {wsDataset} drop sites drop the hardcoded "bars". app/studio.js changed, so precached copies roll.
   v317: LF48 (LOCKED BUILD ORDER step 4, the last
   piece) — the Present-mode switcher entry point: Focus mode and Slideshow now share ONE
   segmented control (#modeSwitch) in ⋯ More instead of two look-alike flat buttons, and Focus
   mode's parallel Settings → Presentation toggle is retired (the switcher is its only entry
   point now, so nothing can drift out of sync). app/index.html, app/studio.js, app/studio.css,
   app/palette.js, docs/index.html changed, so precached copies roll.
   v316: UX sweep 2026-07-28 — KPI tiles without a
   Click-through URL now open the shared Detail drawer by default in the exported dashboard and
   the Viewer (app/studio-render.js's buildKpiDetailCfg), so every KPI tile links somewhere
   instead of some being dead numbers. app/studio-render.js changed, so precached copies roll.
   v315: LF66 slice 2 (library reorg, part 6) — dragging a
   library dataset card onto the canvas now lands as a panel: the preview iframe goes
   pointer-transparent while a drag is in progress (body.lib-dragging), so #canvas-stage's existing
   {wsDataset}/{analysis}/{da} drop handler + .dragover drop-hint fire instead of the iframe
   swallowing the drag. app/studio.js, app/studio.css changed, so precached copies roll.
   v314: LF52 (extend) — finish the widget/analysis→View
   terminology rename in the two named remaining surfaces: the panel inspector's "Export this
   panel…" button is now "Export this View…" (and the matching canvas Export▾ menu tooltip), and
   Explore's "Saved analyses" sidebar list + the Studio library's "Analyses" group are now "Saved
   Views" / "Views". app/studio.js, app/explore.js, app/studio-render.js changed, so precached
   copies roll.
   v313: LF66 slice 1 (library reorg) — the Studio data
   panel's "Workspace datasets" library group is renamed "Datasets" (buildLibrary), and its .da
   cards are compacted: the always-on column-chip wall + the +chart quick-add row now collapse
   (max-height:0) to name + meta, revealing on hover/focus (scoped .lib-wsds .da CSS in
   app/studio.css). app/studio.js, app/studio.css changed, so precached copies roll.
   v312: LF46 (⋯ teardown, slice 2) — Tour, Theme,
   Command palette, and the whole Help & power tools group (Keyboard shortcuts, Help docs,
   Interactive tutorial, Edit JSON spec) are gone from the Studio ⋯ menu; the palette gained
   a new "Edit JSON spec…" command as the sole remaining path to that one.
   app/index.html, app/studio.js, app/palette.js, docs/index.html changed, so precached
   copies roll.
   v311: LF51 slice 4 (nav IA spec (b), "right-aligned
   filter pills") — the folder + facet filter strips on Connections/Datasets/Jobs carry a new
   .cx-filter-strip class that right-aligns their pills at desktop widths (left-aligned on ≤640px).
   app/datasets.js, app/connections.js, app/jobs.js, app/studio.css changed, so precached copies roll.
   v310: LF51 slice 3 (nav IA spec (d)) — the list ⇆ tile
   view toggle now also lives on Connections (#connViewToggle / studio-conn-view) and Jobs
   (#jobsViewToggle / studio-jobs-view), reusing the .dsx-grid/.dsx-tile pattern from Datasets.
   app/connections.js, app/jobs.js, app/index.html, app/studio.js changed, so precached copies roll.
   v309: LF51 slice 2 (nav IA spec (d), "list + rich-tile
   views") — the Datasets section gained a #dsxViewToggle that swaps its compact list for a tile
   grid (studio-dsx-view persists the choice), mirroring the Dashboards list/tile toggle. Both
   layouts reuse the same data-dsx-* hooks. app/datasets.js, app/index.html, app/studio.css,
   app/studio.js changed, so precached copies roll.
   v308: LF51 spec (a) — row NAMES no longer
   ellipsis-truncate; they wrap and stay fully visible even when tag/folder badges squeeze
   the name column (Connections, Datasets, Jobs, Dashboards list, Repository all share
   .cx-name b). The <small> subtitle line is unchanged (still ellipsizes, single-line).
   app/studio.css, tests/run.js changed, so precached copies roll.
   v307: LF49 slice 3 upgrade — the PowerPoint (.pptx)
   export now renders each View as its real chart IMAGE (rasterized from the live preview panel)
   instead of a data table: a title slide, a KPI summary slide, then one image slide per View
   (<p:pic> picture shapes; full data still lives in the .xlsx export). app/exporters.js,
   app/studio.js, app/index.html, docs/index.html changed, so precached copies roll.
   v306: LF51 slice 1 (nav IA spec (c), "show a full
   date-time, not just a date") — every "cx-when" row badge (Connections, Datasets, Jobs,
   Dashboards list, Repository) now reads a full date-time via a new shared Studio.fmtWhen
   (app/model.js), instead of a bare toLocaleDateString(). app/model.js, app/connections.js,
   app/datasets.js, app/jobs.js, app/studio.js. */
/* v305: LF49 slice 3 — Export ▾ → "PowerPoint (.pptx)",
   the last of LF49's three formats (LF49 is now fully done): a dependency-free slide deck
   (Studio.pptxDeck in exporters.js, same OOXML-in-a-ZIP writer as the .xlsx/.docx) — a title
   slide, then a table slide per KPIs/Views/Filters block and per data source, each capped to
   what a single slide can hold with a truncation note (slides don't paginate). app/exporters.js,
   app/studio.js, app/index.html, docs/index.html changed, so precached copies roll.
   v304: LF50 — removed the stray in-builder Low/High
   "Creativity" live tuner (Quick import honors the Settings default instead); #qmTuner now only
   carries the LF67 "unsaved" reminder. app/index.html, app/studio.js, app/studio.css changed, so
   precached copies roll.
   v303: LF49 slice 2 — Export ▾ → "Word document (.docx)":
   a dependency-free Word report (Studio.docxDoc in exporters.js, same OOXML-in-a-ZIP writer as the
   .xlsx) — title + KPIs/Views tables + a table of each source's backend data. app/exporters.js,
   app/studio.js, app/index.html, docs/index.html changed, so precached copies roll.
   v302: LF62 slice 8 — the same ✨ sparkle
   name-suggest button now sits on Explore's own "Folder" field too (the last
   un-wired LF62 surface): a View picked over a workspace dataset suggests that
   dataset's own folder, one hop up the connections->datasets->jobs->views chain
   (app/explore.js, app/studio.css, tests/run.js changed), so precached copies roll.
   v301: LF62 slice 7 — the same ✨ sparkle
   name-suggest button now sits on the Folder field in the dataset, connection and
   job editors; the dataset/job kinds suggest the linked connection's/source
   dataset's own folder, the connection kind (nothing upstream to reuse) falls
   back to its first Tag (app/model.js, app/datasets.js, app/connections.js,
   app/jobs.js, tests/run.js changed), so precached copies roll.
   v300: LF62 slice 6 — the same ✨ sparkle
   name-suggest button now sits on both "preset name" fields (the per-dashboard
   custom-theme preset and the Settings-level style preset); neither has a bound
   source field, so each suggests from what it's actually captured FROM instead —
   the dashboard's own title, or the currently selected default dashboard theme's
   label (app/model.js, app/studio.js, app/studio.css, tests/run.js changed), so
   precached copies roll.
   v299: LF54 slice 1 — left-align workspace content
   (Home/Settings/Dashboards): the centered `margin:0 auto` wraps left a wide dead gutter next to
   the rail; now margin:0, wider max-width, tighter top padding. app/studio.css changed, so
   precached copies roll.
   v298: LF49 slice 1 — Export ▾ → "Excel workbook (.xlsx)":
   a dependency-free multi-sheet .xlsx (OOXML written into a hand-rolled stored ZIP, Studio.xlsxBook
   in exporters.js) — dashboard summary on tab 1, backend data per source after. app/exporters.js,
   app/studio.js, app/index.html, docs/index.html changed, so precached copies roll.
   v297: LF52 — the dashboard item "widget" is renamed to
   "View" across all user-facing text (builder chrome, inspector, canvas hints, keyboard shortcuts,
   toasts, Help docs); "Save to widget library" → "Save to View library". Text-only — spec keys,
   CSS classes, ids and stored data are untouched. app/studio.js, app/index.html, app/tutorial.js,
   app/versions.js, docs/index.html changed, so precached copies roll.
   v296: LF48 slice 1 — a shared .mode-exit "exit pill"
   component so Focus mode, Panel-zoom and the Slideshow all leave via the same affordance (icon +
   "Exit …" + Esc, consistent shape). app/studio.js + app/studio.css changed, so precached copies roll.
   v295: LF62 slice 5 — the same ✨ sparkle
   name-suggest button now sits on Explore's "Name this analysis" (View) field too,
   suggesting a titleized name from the picked dataset/sample's own display name, or
   the charted value column for a self-contained/orphaned analysis (app/explore.js,
   app/model.js, app/studio.js, app/studio.css, tests/run.js changed), so precached
   copies roll.
   v294: LF62 slice 4 — the same ✨ sparkle
   name-suggest button now sits on the Dashboard inspector's own "Title" field too,
   suggesting a titleized name from whichever panel source shows up most often across
   the spec's panels (app/studio.js, app/model.js, tests/run.js changed), so precached
   copies roll.
   v293: LF62 slice 3 — the same ✨ sparkle
   name-suggest button now sits on the connection wizard's "Connection name" field too,
   suggesting a titleized name from whichever identifying credential field (database/
   project/host/…) is already filled in (app/connections.js, app/model.js, tests/run.js
   changed), so precached copies roll.
   v292: LF45 — the "Open a dashboard" picker was a bare text
   list ("too light"); each row now carries the dashboard's layout thumbnail (Studio.makeThumbnail)
   and the list is keyboard-navigable (↑/↓ highlight, Enter opens). app/studio.js, app/studio.css
   changed, so precached copies roll.
   v291: LF46 (⋯ teardown) — "Demo mode" is no longer a
   duplicate button in the Studio ⋯ More menu; it lives only in Settings → Presentation (still
   reachable via the ⌘K command palette). app/index.html, app/studio.js, app/palette.js changed, so
   precached copies roll.
   v290: LF53 — de-jargoned the user-facing "CDF"/"Dashboard
   Framework" (legacy Pentaho) wording to plain "Dashboard" in the Recent-exports list + a few help
   tips; the stored "cdf" export kind and internal fn names are unchanged. app/studio.js changed, so
   precached copies roll.
   v289: LF62 slice 2 — the same ✨ sparkle
   name-suggest button now sits on the Jobs editor's "Job name" field too, suggesting the
   titleized source dataset's name (app/jobs.js, app/model.js, tests/run.js changed), so
   precached copies roll.
   v288: LF62 slice 1 — a ✨ sparkle button on the
   dataset editor's Name field suggests a name from the table/SQL/sheet/file source already
   filled in (app/model.js, app/studio.js, app/studio.css, app/datasets.js, tests/run.js
   changed), so precached copies roll.
   v287: LF69(d) — the per-panel PNG/CSV/standalone-HTML
   download buttons collapse into a single "Export ▾" trigger + popover menu instead of up to 3
   row buttons (app/studio-render.js, app/exporters.js, docs/index.html, tests/run.js changed), so
   precached copies roll.
   v286: LF69(a) — the panel action row now moves the
   destructive delete (✕) button to the far right, after the export/download chrome, instead of
   mid-row (app/studio-render.js changed, tests/run.js changed), so precached copies roll.
   v285: LF40 — a new pack-gated "Conservation Insight pack"
   guided tour (app/tutorial.js changed, tests/run.js changed), so precached copies roll.
   v284: LF61 — Studio's empty canvas gained an "Import a
   file" button + drop target (app/index.html, app/studio.js, app/studio.css, docs/index.html
   changed), so precached copies roll.
   v283: UX sweep 2026-07-28 #367 finding #2 — dropped the
   dead, always-empty "Badge" column from the docs Exporting-formats table, which was pushing the
   page ~7px past the viewport edge on phones (390px). docs/index.html changed, so precached
   copies roll.
   v282: the read-only Viewer bar (#viewerBar) is now
   responsive — at ≤640px it drops the "read-only" badge and collapses Back/Save-a-copy/Export/Edit
   to icon-only so the bar no longer overflows a phone (the added Export button had tipped it over).
   app/viewer.html + app/studio.css changed, so precached copies roll.
   v281: the DA inspector's Cache section (Enabled + Duration)
   now renders only for a data access with a live query path (connection or direct file/warehouse
   engine) — hidden for sample/authored SQL DAs where the cache never did anything (#121, Kevin live
   QA). app/studio.js changed, so precached copies roll.
   v280: the Studio widget + KPI editor's data-source field
   now reads "Dataset" instead of "Query (data access)" (#119, Kevin live QA). app/studio.js
   changed, so precached copies roll.
   v279: UX sweep 2026-07-28 #1 — added a phone-reachable
   "What's new" item to the ⋯More menu (#tbWhatsNew is hidden ≤640px, #btnChangelog only exists
   inside Studio) so mobile users can always open the feed. app/index.html, app/studio.js changed.
   v278: the offline sample generator now emits ONE row per
   distinct category for a bounded categorical first column (the 4 conservation practices, 4 crops,
   5 providers, …) instead of a flat 8 that duplicated each label — the conservation practice-shift
   dataset showed every practice twice (Kevin, live QA). app/sampledata.js changed, so precached
   copies roll.
   v277: LF70 — Home's "Browse examples" card now jumps
   straight to Dashboards filtered to the installed sample pack(s)' curated dashboards (a new
   "Sample packs" filter chip), instead of opening the old Examples dropdown of static demo-db
   specs. app/studio.js changed, so precached copies roll.
   v276: viewer mode (#106/#107) now renders SAMPLE-backed
   dashboards (bakes a local mock for data accesses with no real engine, so they no longer 404 on the
   retired CDA server — real connections still query live) and gained an Export button (HTML / PDF /
   editable spec). app/viewer.html, app/viewer.js, app/exporters.js, app/studio.css changed and
   app/viewer.html now also loads app/sampledata.js, so precached copies roll.
   v275: LF67 — a Quick-import build now warns before
   opening a different dashboard silently replaces it (openRecent confirm() guard), plus an
   "Unsaved — Save to keep" badge next to the creativity tuner while it's true. app/studio.js,
   app/index.html, app/studio.css changed, so precached copies roll.
   v274: the app Color-theme picker reaches parity with the
   dashboard theme list — High Contrast, Editorial and Neon app-chrome themes added (light + dark),
   lifted from their Studio.DASHBOARD_THEMES twins, so chrome + dashboard read as one system (#113).
   app/studio.css + app/studio.js changed, so precached copies roll.
   v273: LF68 — fixed a "sensitive_pct"-style KPI column
   sampling as a HIGH/MEDIUM/LOW label instead of a number (classify()'s /sens/ pattern matched
   before the /pct/ rule got a look), so the compliance-radar showcase's "Sensitive Data" KPI
   rendered NaN%. app/sampledata.js changed, so precached copies roll.
   v272: the "Restore unsaved work" banner is now opt-in — a new
   Settings > Mode toggle (off by default) gates it, so the banner no longer interrupts on entry unless
   you ask for it (#114). app/studio.js changed, so precached copies roll.
   v271: LF40 slice 1 — the welcome tour opens with an
   animated hero screen (theme-colored confetti, greet-by-name, quick tour / guided tour choice,
   quick-action shortcuts). app/welcome.js changed, so its precached copy rolls.
   v270: Settings copy cleanup — a one-line Color-theme blurb, a
   concise Sample-packs intro that names the data as synthetic, and crisp count-led per-pack descriptions
   that mention the data is embedded (#112/#115/#116). app/studio.js + app/demopacks.js changed, so
   precached copies roll.
   v269: Home's "Welcome back" greeting now personalizes to the
   signed-in account's display name, and the seeded demo account is renamed "Demonstration User" (#108).
   app/studio.js + app/auth.js changed, so precached copies roll.
   v268: sign-in polish — the password field gets the eye/eye-off
   reveal toggle (matching every masked field in the app), and the demo hint is a small muted demo/demo
   line tied to the Local workspace instead of the old "demo build" callout (#102/#105). app/gate.js
   changed, so precached copies roll.
   v267: LF41 slice 2 — Add/Edit user gains a "Copy my current
   Dashboard defaults" button (app/defaults.js snapshot/apply helpers, app/studio.js editor UI + first-
   sign-in apply). app/defaults.js and app/studio.js changed, so precached copies roll.
   v266: panel zoom fills the window (fill-CSS injected into the
   zoom iframe so the single widget stretches to the frame) and Exit always closes it — a double-open
   no longer orphans a stuck, un-closable overlay (#109/#110). app/studio.js changed, so precached copies roll.
   v265: Standard fleet topbar — Slice C: Studio's
   Save-as (from #dashbar) and Duplicate (from the #menuNew "New ▾" menu) join Undo/Redo/
   Open/Save/Export in the shared topbar's #tbSectionActions slot — LF47 is now fully done
   except Examples removal (tracked separately under LF43 slice 2). index.html, studio.js,
   studio.css, tests/run.js all changed, so precached copies roll.
   v264: connection self-heals on boot — initSync now
   auto-retries a flapping GoTrue sign-in with backoff (500/1500ms) instead of staying red until a
   manual Refresh (#111). app/sources/sync.js changed, so precached copies roll.
   v263: Standard fleet topbar — Slice B: Studio's
   dashboard-scoped Undo/Redo/Open/Save/Export move from #dashbar into the shared topbar's
   #tbSectionActions slot (only shown while Studio is the active section) — Slice A's
   scaffolding filled in. index.html, studio.js, shell.js, studio.css, docs/index.html all
   changed, so precached copies roll.
   v262: global standard topbar (Slice A) — #topbar is
   promoted out of Studio's #appMain into a persistent app frame; centered command-palette
   search + What's-new/What's-next/dark-mode cluster; #railCmdk removed. index.html, studio.js,
   shell.js, studio.css, palette.js, fleet.js, icons.js all changed, so precached copies roll.
   v261: LF42 slice 3 — Settings → Workspace backend's
   "Switch backend" now offers whatever backends an admin has already registered (Admin →
   Backends card) as one-click connect options, before falling back to entering credentials
   from scratch. app/studio.js and docs/index.html changed, so precached copies roll.
   v260: LF42 slice 2 — Add/Edit user gains an "Assigned
   backend" picker (once at least one backend is registered) recording which registered backend
   an account belongs to on its provisioning blob; surfaced as a count badge on each Backends row
   and a "→ Backend name" badge on the Users list. Reference metadata only — no auto-connect.
   app/studio.js, app/auth.js and docs/index.html changed, so precached copies roll.
   v259: durable Supabase reads — a read that hits a
   stale/expired GoTrue token now drops the cached session, re-signs-in and retries once, so
   Refresh + background sync self-heal instead of flapping to "not connected". app/sources/
   supabase.js changed, so precached copies need to roll.
   v258: first-admin bootstrap — Go live now seeds the
   caller's own admin row before it runs (fixing the "not an admin" chicken-and-egg), sign-in
   carries gotrueId onto the backend users row, and admin actions refresh the session.
   app/studio.js, app/sources/supabase.js and docs/index.html changed, so precached copies roll.
   v257: LF42 slice 1 — Admin "Backends" card lets an
   admin register multiple named backend configs ahead of connecting to one.
   app/studio.js and docs/index.html changed, so precached copies need to roll.
   v256: LF41 slice 1 — per-user provisioning defaults
   (default theme + Conservation sample pack), applied once at an account's first sign-in.
   app/auth.js and app/studio.js changed, so precached copies need to roll.
   v255: LF39 — cross-device sign-in no longer gives a
   flat "Incorrect username or password" for a teammate whose account only exists on a
   connected workspace backend, not yet in this browser's local store: the gate now tells
   "not found locally" apart from "wrong password", auto-pulls + adopts the backend's
   accounts once when a workspace is already connected (retrying sign-in), and points a
   never-connected browser at "Connect to your workspace" instead. app/gate.js changed
   (precached), app/auth.js unchanged. Real one-step GoTrue sign-in stays open (M7).
   v254: LF43 — installing a sample pack now
   materializes its example-gallery dashboards (data/examples/index.json entries tagged
   demoPackId) as real workspace "dashboards" rows, so they show up in Home/Dashboards
   instead of only unlocking in the Examples ▾ gallery; removing the pack's existing
   demoPackId sweep cleans them up again. app/studio.js and app/demopacks.js changed, so
   precached copies need to roll.
   v253: Quick import now defaults to High creativity
   (app/defaults.js) so a dropped file auto-builds the full map/treemap/slope/ensemble
   dashboard out of the box; precached copy needs to roll.
   v252: LF44 — Home's "New dashboard"/"Quick
   import"/"Browse examples"/"Take the tour" quick actions (and the example gallery tiles)
   all route through enterStudio(), which a viewer-role account can never pass — left
   visible, they were dead clicks. Now filtered out for accounts that can't develop
   (canDevelop() false), matching the rail's existing Studio gating. app/studio.js changed,
   so precached copies need to roll.
   v251: LF38 — app-wide password reveal toggle
   (app/studio.js, app/connections.js, app/icons.js, app/studio.css all changed), so
   precached copies need to roll.
   v250: Track L sweep (orphaned-key lens, round 6) — the PDF
   export dialog's remembered page size/orientation/scale choice (studio-pdf-export-opts) was never
   wiped by "Clear local data" — added to CLEAR_DATA_KEYS. app/studio.js changed, so precached
   copies need to roll.
   v249: modal outside-click dismiss now requires the
   press to BEGIN on the backdrop — a text-selection sweep (or a zoomed-chart drag) that starts
   inside a dialog and releases on the backdrop no longer closes it and discards your input.
   Shared dismissOnBackdrop() guards modal(), panel-zoom and the slideshow. app/studio.js changed.
   v248: N-DATA follow-up — the Checks section's collapsed
   header now shows a glanceable summary ("all clear" / "1 error, 2 warnings") via a new
   Studio.checksSummary() helper wired into its existing section() summaryFn hook — closes the
   last still-open half of the "dashboard health score" idea (every underlying check already
   existed; this adds the glanceable score itself). app/model.js, app/studio.js, docs/index.html
   changed, so precached copies need to roll.
   v247: Google Sheets FOLLOW-UP — private-sheet OAuth
   via the Sheets API v4 (Authorization: Bearer, the BigQuery pattern), closing the note left open
   since v593. A new optional `token` connection field switches queryData/testData onto
   sheets.googleapis.com's values.get endpoint instead of the public gviz path; exporters.js's
   CONN_ADAPTER_SECRET_FIELD gained a gsheets:"token" entry (optional, same shape as PostgREST's)
   so a private sheet's token is redacted + prompted-once-never-embedded on export instead of
   leaking into the static HTML; studio-render.js's CONN_ENGINES.gsheets.cfg now merges that
   secret in when resolved, same as turso/postgrest. A link-shared sheet with no token set is
   completely unaffected (still gviz, still no prompt). app/sources/gsheets.js, app/exporters.js,
   app/studio-render.js, docs/index.html changed, so precached copies need to roll.
   v246: Track H sweep (code-health lens) — the Viewer
   route's "Edit in Studio"/"Save a copy" buttons had a CSS rule that set `display:flex`
   unconditionally, silently defeating the browser's own `[hidden]{display:none}` default (author
   CSS always wins over user-agent CSS at equal specificity) — so a viewer-role account saw a
   fully-visible but dead `href="#"` "Edit in Studio" button the whole time. Added the missing
   `[hidden]{display:none}` override, same #appMain/.app-sec[hidden] convention already used
   elsewhere in this file. app/studio.css changed, so precached copies need to roll.
   v245: Track L sweep (performance-budget lens) —
   boxplot's row/col layout recomputed each category's index via stats.indexOf(st) inside the
   very stats.forEach that already hands back that index for free, an O(n^2) layout pass on
   every boxplot render/resize. app/studio-charts.js changed, so precached copies need to roll.
   v244: N-DESIGN follow-up — a third Card style,
   "Sketch / hand-drawn" (dashed border + wobbled asymmetric radius), alongside Raised/Flat.
   app/model.js, app/exporters.js, app/studio.js changed, so precached copies need to roll.
   v243: Track H sweep — myDACard's Duplicate/Delete
   buttons' hover title (not just their aria-label) now names the data source too, so a sighted
   mouse user with several data accesses can tell rows apart. app/studio.js changed, so
   precached copies need to roll.
   v242: Track L sweep (orphaned-key lens, round 5) —
   the Quick mode creativity-dial default (studio-default-qm-creativity) was missing from both
   "Clear local data" and Settings export/import. app/studio.js changed, so precached copies
   need to roll.
   v241: N-DIST follow-up — a diff-based "Share just my
   changes" link alongside the existing full "Copy shareable link" button, for handing off an
   edit to someone who already has the dashboard without re-encoding the whole spec every time.
   app/model.js, app/studio.js changed, so precached copies need to roll.
   v240: Track H sweep — row/card title buttons across
   Connections, Datasets, Jobs, Dashboards (tile + list view) and Repository now carry a
   native `title` attribute naming their own row/card, so a sighted mouse user hovering a
   CSS-truncated name (`.cx-name b`/`.recent-meta b` ellipsis) gets the full name — same
   escape-hatch gap v596 fixed for Explore's saved-analyses sidebar, closed everywhere else
   it recurs. The Dashboards list view's Pin button also gained the aria-label it was
   missing entirely (its tile-view sibling already had one). app/connections.js,
   app/datasets.js, app/jobs.js, app/studio.js changed, so precached copies need to roll.
   v239: Track L sweep (chart-extension API lens) — every
   Studio.CHARTS entry now explicitly declares a `cde` key (an object, or null for CDF-only
   types). choropleth/ensembleSeries/richtext/boxplot previously omitted the key outright;
   Studio.cdeUnsupported() happened to still return true for them (undefined is falsy too),
   so this was never a runtime bug, just an inconsistent registry contract that a future
   strict check could've silently mis-served. app/model.js changed, so precached copies
   need to roll.
   v238: N-DATA follow-up — KPI period-over-period gets
   an explicit Split point. A new optional k.periodSplit field (KPI Compare-to section,
   app/studio.js) lets a builder type an explicit boundary value instead of the default
   even chronological 50/50 split; rows before it count as "prior", it and after count as
   "current" (app/studio-render.js). Clearing Period column clears periodSplit too.
   app/studio-render.js, app/studio.js, docs/index.html content changed, so precached
   copies need to roll.
   v237: N-DATA innovation sweep — KPI period-over-
   period auto-compare. A new "Period column" field in the KPI Compare-to section
   (app/studio.js) sorts the bound DA's rows chronologically by a date/period
   column and splits them into two halves, computing the tile's value from the
   current half and its delta from the prior half (app/studio-render.js) — no
   second column or hand-built query needed, closing the "Period-over-period /
   compare mode" N-DATA backlog item's first, KPI-scoped cut. Takes priority
   over the existing manual Compare column when both would apply.
   app/studio-render.js, app/studio.js, docs/index.html content changed, so
   precached copies need to roll.
   v236: LF24 slice 3 — the creativity dial +
   "fun" chart tier. buildAutoSpec(profile, creativity) now mixes a map/treemap/
   slope/ensemble widget into the conservative base at creativity:'high', each
   gated on its own data-support guardrail (app/quickmode.js's guessGeoScale/
   pickSlopePair) rather than forced; a new Settings default (app/defaults.js)
   plus a live Low/High tuner under the dashboard title (app/index.html #qmTuner,
   app/studio.js) let it be set ahead of time or flipped in place after a Quick
   import, re-parsing the source dataset rather than a stale cached profile.
   app/quickmode.js, app/defaults.js, app/studio.js, app/studio.css,
   app/index.html, docs/index.html content changed, so precached copies need to
   roll.
   v235: LF24 slice 2 — the auto-build engine.
   Quick import (slice 1) now builds a real, unsaved dashboard from the profiled
   file instead of just landing in Explore: a new pure PLANNING function,
   Studio.QuickMode.buildAutoSpec (app/quickmode.js), turns a column profile into
   a widget plan (a KPI + straightforward bar/donut/line/table widgets only —
   conservative creativity default, no map/ensemble/etc, that's slice 3), and a
   new studio.js materializer (quickBuildDashboard) turns the plan into real
   panels/KPIs bound to DA clones carrying da.outputOptions.aggregate (the same
   rollup mechanism Explore's own analyses use) so every widget renders through
   the existing chart pipeline with no new render code. Guardrails: a dimension
   is capped to its top values (sorted desc + limit, never one bar per row); a
   line widget only appears with a REAL temporal column; with no usable measure,
   widgets fall back to COUNT. app/quickmode.js, app/studio.js, docs/index.html
   content changed, so precached copies need to roll.
   v234: LF24 slice 1 — Quick import. A new
   Home quick-create card ("Quick import") accepts a dropped/picked CSV or JSON
   file straight on Home: a new pure column-profiler module, app/quickmode.js
   (Studio.QuickMode.profileColumns/classifyColumn — geo/temporal/id/measure/
   categorical/text inference from column NAMES + VALUES, no DOM/Workspace
   deps), classifies the parsed file's columns, creates (or reuses) a "file"-
   adapter connection + a real dataset (same content-inline shape the dataset
   editor's own drop zone already writes), and opens it straight in Explore
   (Studio.Explore gained a public `selectDataset` wrapping the existing
   xpSelectDataset). Auto-BUILDING a dashboard from the profile is LF24 slice 2,
   deliberately not attempted here — this slice is just "drop → profile →
   dataset", per that item's own breakdown. app/quickmode.js (new),
   app/sources/localfile.js (Studio.parseJSONText exported, mirrors the
   existing parseCSVText sharing convention), app/explore.js, app/studio.js,
   app/index.html content changed, so precached copies need to roll.
   v233: Track H sweep — Explore's saved-
   analyses sidebar list truncates long names with CSS ellipsis, so several
   analyses sharing a common prefix (e.g. a demo pack's "Conservation Insight —
   …" set) rendered indistinguishably, and the open button's title was a
   hardcoded "Open in Explore" that told you nothing you didn't already know.
   Its title now carries the analysis's own full name (plus a matching
   aria-label), restoring the native-tooltip escape hatch. app/explore.js
   changed, so the precached copy needs to roll.
   v232: Post-overhaul backlog item 3, OTHER
   half, Redshift slice — CLOSES this backlog item out entirely: the sixth and last
   connection-bound adapter to get the exported-runtime treatment (after Turso,
   PostgREST, Supabase, Google Sheets and local files), and the first whose secret
   isn't a single field — AWS SigV4 needs an access key ID + secret access key
   (plus an optional session token for temporary/STS credentials), so
   exporters.js's CONN_ADAPTER_SECRET_FIELD carries an ARRAY of field names for
   redshift instead of one string; redactSecrets stamps da.needsSecret with just
   the subset actually set (sessionToken is optional). studio-render.js's
   resolveSecret() now handles an array da.needsSecret by prompting once per
   field and returning an object whose keys already match Studio.Redshift's own
   cfg shape, so CONN_ENGINES.redshift.cfg() merges it straight onto da.connCfg
   with no reshaping. app/redshift.js gained a self-contained queryData(cfg,
   dataset) (data-adapters.js's sqlBridge() bridge, duplicated because
   data-adapters.js itself is never bundled into an export). app/studio.js and
   app/viewer.js now also fetch app/sources/sigv4.js + app/redshift.js as export
   assets, bundled into the exported HTML only when a dashboard actually has a
   connAdapter:"redshift" DA. app/redshift.js, app/exporters.js,
   app/studio-render.js, app/studio.js, app/viewer.js, docs/index.html changed,
   so the precached copies need to roll.
   v231: Post-overhaul backlog item 3, other
   half, local-files slice — the same connection-bound exported-runtime treatment
   v226/v227/v229/v230 gave Turso/PostgREST/Supabase/Google Sheets, now for a dropped
   CSV/JSON file — the fifth adapter, and (like Google Sheets) the second with no
   secret field, but also the first with no cfg at all: a file dataset's "connection"
   is a bare grouping row (adapter:"file", cfg:{}); the real data (fileName/format/
   content) was already on the Workspace dataset row but dsToDA (app/studio.js) never
   threaded it onto da.dataset, so an exported file-backed dashboard had no way to
   reconstruct it post-export — fixed by adding those three fields to da.dataset's
   existing shape. exporters.js's CONN_ADAPTER_CFG_FIELDS gained a file:[] entry
   (empty cfg, still gates the connAdapter stamp same as gsheets); studio-render.js's
   CONN_ENGINES gained a file entry dispatching to Studio.fileSource.queryData with
   da.dataset passed straight through (no reshaping — unlike table/sheet-kind
   adapters, a file's def already IS the shape queryData expects). app/sources/
   localfile.js's top-level Studio.registerSource call is now guarded (same "never
   loads registry.js" fix already applied to postgrest.js/supabase.js/gsheets.js) and
   self-stamps Studio.fileSource. app/studio.js and app/viewer.js now also fetch
   app/sources/localfile.js as an export asset, bundled into the exported HTML only
   when a dashboard actually has a connAdapter:"file" DA. app/sources/localfile.js,
   app/exporters.js, app/studio-render.js, app/studio.js, app/viewer.js,
   docs/index.html changed, so the precached copies need to roll.
   v230: Post-overhaul backlog item 3, other
   half, Google Sheets slice — the same connection-bound exported-runtime treatment
   v226/v227/v229 gave Turso/PostgREST/Supabase, now for Google Sheets connections —
   the first of these with no secret field at all (link-shared sheets need no auth),
   so exporters.js's redactSecrets gating now keys off CONN_ADAPTER_CFG_FIELDS
   (always present for a wired adapter) rather than CONN_ADAPTER_SECRET_FIELD (absent
   on purpose for gsheets). studio-render.js's CONN_ENGINES gained a gsheets entry
   dispatching to Studio.gsheetsSource.queryData with a {sheet,query} def read from
   da.dataset — app/studio.js's dsToDA had to start threading ds.sheet onto da.dataset
   too (it only carried sql/table/query/collection before, never sheet). app/studio.js
   and app/viewer.js now also fetch app/sources/gsheets.js as an export asset, bundled
   into the exported HTML only when a dashboard actually has a connAdapter:"gsheets" DA.
   app/sources/gsheets.js, app/exporters.js, app/studio-render.js, app/studio.js,
   app/viewer.js, docs/index.html changed, so the precached copies need to roll.
   v229: Post-overhaul backlog item 3, other
   half, Supabase slice — the same connection-bound exported-runtime treatment v226/
   v227 gave Turso/PostgREST, now for Supabase connections (the third and final
   PostgREST-protocol adapter to get it). app/sources/supabase.js's queryData carried
   the exact same latent bug postgrest.js's did before v228 — it called
   Studio.WS.postgrestQueryData (app/sources/schema.js), which the exported bundle
   never loads — so it gained its own self-contained copy up front rather than
   shipping the bug and fixing it in a follow-up release. exporters.js's redactSecrets
   learned supabase's secret field (key, the anon/publishable key) + non-secret cfg
   fields (url); studio-render.js's CONN_ENGINES gained a supabase entry dispatching
   to Studio.supabaseSource.queryData with a {table,query} def read from da.dataset,
   same as PostgREST. app/studio.js and app/viewer.js now also fetch
   app/sources/supabase.js as an export asset, bundled into the exported HTML only
   when a dashboard actually has a connAdapter:"supabase" DA. app/sources/supabase.js,
   app/exporters.js, app/studio-render.js, app/studio.js, app/viewer.js, docs/index.html
   changed, so the precached copies need to roll. v228: REGRESSION FIX — the v227 PostgREST
   connection-bound exported-runtime feature actually threw in any real exported
   dashboard: app/sources/postgrest.js's queryData called Studio.WS.postgrestQueryData
   (app/sources/schema.js), but the exported bundle never loads schema.js (same
   "builder-only module, never inlined into the exported bundle" situation
   studio-render.js documents for its own local copies of applyTemplateVars/
   evalFormula/withTimeout) — masked by a test that stubbed out queryData before
   calling it, so the dispatch tests passed while the real code path crashed
   ("Cannot read properties of undefined (reading 'postgrestQueryData')"). Gave
   postgrest.js its own self-contained copy of the query-data logic (no Studio.WS
   dependency); added a real, unstubbed end-to-end test driving the actual exported
   bundle against a live mock PostgREST endpoint. app/sources/postgrest.js changed,
   so the precached copy needs to roll. v227: Post-overhaul backlog item 3, other
   half, PostgREST slice — the same connection-bound exported-runtime treatment v226
   gave Turso, now for PostgREST connections. exporters.js's redactSecrets learned
   postgrest's secret field (token, OPTIONAL — anonymous PostgREST access never gets
   a needsSecret stamp) + non-secret cfg fields (url, schema); studio-render.js's
   CONN_ENGINES gained a postgrest entry dispatching to Studio.postgrestSource.queryData
   with a {table,query} def (read from da.dataset, since a table-kind dataset's real
   PostgREST query string lives there, not on da.sql/da.query — those are always the
   SQL-editor fields, clobbered blank for a table-kind DA). app/sources/postgrest.js's
   own top-level Studio.registerSource(...) call is now guarded (it would throw in the
   exported bundle, which never loads registry.js) and always sets Studio.postgrestSource
   too, mirroring Studio.tursoSource's convention. app/exporters.js, app/studio-render.js,
   app/studio.js, app/viewer.js, app/sources/postgrest.js changed, so the precached
   copies need to roll. v226: Post-overhaul backlog item 3, other
   half — connection-bound dataset adapters (the connections → datasets model)
   had NO exported-runtime path at all: every such DA carries kind:"sql"
   regardless of its actual backend, so studio-render.js's PDC.cda dispatch
   had nothing to key off, and a shipped .html with one bound silently fell
   back to sample data forever. Started with Turso (the reference remote
   adapter): exporters.js's redactSecrets now also resolves da.connectionId
   against the live Workspace connection and stamps da.connAdapter/da.connCfg
   (redacting the one secret field the same way the four legacy direct
   connectors already are), and studio-render.js's PDC.cda gained a parallel
   CONN_ENGINES dispatch that prompts for that secret at open (never
   embedded) and runs the query through Studio.tursoSource.queryData. The
   Turso façade (app/sources/turso.js — already precached below) is now also
   bundled into an export, but only when a dashboard actually uses it (same
   lean-bundling convention as the direct connectors). app/exporters.js,
   app/studio-render.js, app/studio.js, app/viewer.js changed, so the
   precached copies need to roll. v225: Track L accessibility lens —
   a FOURTH instance of the "outline re-declared inside its own focus rule"
   bug shape (v286 .repo-search, v299 .dsb-sqb-inp, v333 .opt-hint): the rail's
   "back to polecat.live" link (#railNav .rail-suite) set outline:none on its
   combined :hover/:focus-visible rule, at higher specificity than the shared
   global keyboard-focus ring, so tabbing to it showed no ring at all. Split
   the rule so :focus-visible keeps its own outline. Pure CSS fix, no behavior
   change. app/studio.css changed, so the precached copy needs to roll.
   v224: Track L dedup — Connections/
   Datasets/Jobs's configure(deps) calls each carried an identical copy of
   the same 7 one-line passthrough closures ($, $$, el, modal, toast,
   isVisibleToMe, currentUserId); factored into one coreModuleDeps() builder.
   Pure refactor, no behavior change. app/studio.js changed, so precached
   copies need to roll.
   v223: post-overhaul backlog item 7's
   optional "by type" facet (kind: SQL query/Table/Collection/File/Sheet) on
   the Datasets list — same multi-select/saved-view pill strip as the
   existing by-adapter/by-connection/by-tag facets, keyed by d.kind. app/
   datasets.js, docs/index.html content changed, so precached copies need to
   roll.
   v222: M7 slice 7 (Conservation Insight
   product platform, per-user security track) — the polecat-admin Edge
   Function relay. New supabase/functions/polecat-admin/index.ts (deployed
   separately via the Supabase CLI, NOT part of this precache list) exposes
   named provision/go-live/create-user/reset-data actions. app/sources/
   supabase.js gains adminFnUrl + adminGoLive()/adminCreateUser() calling it;
   app/studio.js gains an Admin "Enable per-user security / Go live" card +
   modal, and Add user now prefers the relay over public self-signup once
   adminFnUrl is configured. Both precached files changed.
   v221: UX5 slice 4 (the 4px-base spacing
   rounding pass, TECH-DEBT/quality track) — app/studio.css content changed (every
   var(--sp-*) call site repointed to a rounded token), so the precached copy
   needs to roll.
   v220: UX8 slice 2 (UX-POLISH track) —
   converts the remaining non-button title= call sites in the catalog rows
   (folder/lineage/param badges in Datasets, the folder badge in Connections/
   Jobs/Explore, the workspace-capable + last-edited badges in Connections,
   and the refresh-due/reminder badges in Jobs) to the same data-tip=
   convention slice 1 proved on the status dots, so they're reachable on
   touch/keyboard too. Explore's renderExplore() gained its own
   Studio.Tooltip.hydrate(body) call (it had none before, unlike the other
   three subsystems). Every button's title= (usually backed by an existing
   aria-label already) remains a separate, lower-priority follow-up.
   app/connections.js, app/datasets.js, app/explore.js, app/jobs.js content
   changed, so precached copies need to roll.
   v219: UX8 slice 1 (UX-POLISH track) — a
   new Studio.Tooltip.hydrate() primitive (app/tooltip.js) turns any
   data-tip="..." element into a themed, focusable, touch-visible tooltip
   (generalizes the .opt-hint-pop pattern for the plain "one line of text"
   case) — a native title= attribute is mouse-hover only, invisible on touch
   and unreachable by keyboard. Converts the connection/dataset/job status
   dots (Never tested/tested OK/failed, Never run/run OK/failed) as the
   first proof; the many remaining title= call sites are follow-up slices.
   New precached file (app/tooltip.js) and app/connections.js,
   app/datasets.js, app/jobs.js, app/studio.css content changed, so
   precached copies need to roll.
   v218: UX5 slice 3 (quality track) — a
   `--sp-*` spacing scale (30 named steps, one per distinct padding px value already
   in use, from 0 to 60px) now lives in studio.css's token-bridge :root block, and
   every `padding`/`padding-(top|right|bottom|left)` declaration in the file (285
   call sites) reads `var(--sp-*)` instead of a raw literal — same pure-aliasing
   move as UX5 slice 1's type scale, so nothing renders differently. Rounding the
   odd values onto a clean 4px grid is a follow-up slice (needs real visual
   re-verification, not just a green suite). app/studio.css content changed, so the
   precached copy needs to roll.
   v217: UX5 slice 2 (quality track) — the 7
   half-step type-scale tokens (--fs-8-5/9-5/10-5/11-5/12-5/13-5/15-5) each round UP
   to their nearest whole step (--fs-9/10/11/12/13/14/16) and every call site (142
   references) repoints there, so the scale is now 12 real steps instead of 19
   near-duplicates; the half-step custom properties are removed as unused. Every
   affected element shifts by at most 0.5px. The 4px-base spacing half of UX5 is
   still a follow-up. app/studio.css content changed, so the precached copy needs
   to roll.
   v216: R5+ slice 9 (studio.js module extraction,
   tech-debt track — LAST slice, the whole R5+ track is now COMPLETE) — the Datasets
   subsystem (a named, {{param}}-substitutable query on top of a Connection) moves out
   of app/studio.js into its own module, app/datasets.js (Studio.Datasets), following the
   chart-thumbnails.js/branding.js/defaults.js/celebrations.js/versions.js/explore.js/
   jobs.js/connections.js extraction precedent (①-⑧): same ONE-bundled-
   Studio.Datasets.configure(deps) call shape as Connections (⑧). ONE exception: runDataset
   stays in studio.js (the shared live-data bridge the builder preview/Explore/Jobs all call
   via window.__studioRunDataset) and is injected INTO datasets.js instead, which exposes
   connOf/adapterOf/runnableDef back OUT as plain methods for studio.js's runDataset (and
   the Home favorites card + Repository browser's repoAllRows) to call directly. Pure
   refactor, no behavior change. New precached file (app/datasets.js) and app/studio.js/
   app/index.html content changed, so precached copies need to roll.
   v215: R5+ slice 8 (studio.js module extraction,
   tech-debt track) — the Connections subsystem (workspace-level connections to external
   sources, the first plane of the connections → datasets → dashboards model) moves out
   of app/studio.js into its own module, app/connections.js (Studio.Connections), following
   the chart-thumbnails.js/branding.js/defaults.js/celebrations.js/versions.js/explore.js/
   jobs.js extraction precedent (①-⑦): same ONE-bundled-Studio.Connections.configure(deps)
   call shape as VersionsUI (⑤), Explore (⑥), and Jobs (⑦), since this subsystem is just as
   entangled with studio.js's private DOM/modal + visibility/user + credential-field helpers.
   Pure refactor, no behavior change. New precached file (app/connections.js) and
   app/studio.js/app/index.html content changed, so precached copies need to roll.
   v214: UX5 slice 1 (quality track) — a named
   type-scale (--fs-8..--fs-25, 19 steps) now lives in app/studio.css's token bridge
   block; every font-size declaration in the file (300+ call sites, previously raw
   px values with no shared vocabulary) now reads var(--fs-*) instead. Pure aliasing,
   every token's value copied byte-for-byte from what it replaced, so nothing renders
   differently yet — consolidating the near-duplicate half-steps onto fewer real
   steps is the follow-up this enables. app/studio.css content changed, so the
   precached copy needs to roll.
   v213: R5+ slice 7 (studio.js module extraction,
   tech-debt track) — the Jobs "data-management-lite" subsystem (prep pipelines: rename/cast/
   derive/filter/aggregate/join/union/sql) moves out of app/studio.js into its own module,
   app/jobs.js (Studio.Jobs), following the chart-thumbnails.js/branding.js/defaults.js/
   celebrations.js/versions.js/explore.js extraction precedent (①-⑥): ONE bundled
   Studio.Jobs.configure(deps) call, same "bundle everything" shape as VersionsUI (⑤) and
   Explore (⑥) since this subsystem is just as entangled with studio.js's private DOM/modal +
   visibility/user helpers. Pure refactor, no behavior change. New precached file (app/jobs.js)
   and app/studio.js/app/index.html content changed, so precached copies need to roll. NEXT in
   this track: Connections → Datasets (Datasets last — runDataset/window.__studioRunDataset
   bridges back into the builder preview).
   v212: R5+ slice 6 (studio.js module extraction,
   tech-debt track) — the Explore "just show me a dashboard" subsystem (pick a dataset → chart →
   save as an analysis) moves out of app/studio.js into its own module, app/explore.js
   (Studio.Explore), following the chart-thumbnails.js/branding.js/defaults.js/celebrations.js/
   versions.js extraction precedent (①-⑤): ONE bundled Studio.Explore.configure(deps) call, same
   "bundle everything" shape as VersionsUI (⑤) since this subsystem is just as entangled with the
   builder's live spec/catalog/assets state. Pure refactor, no behavior change. New precached file
   (app/explore.js) and app/studio.js/app/index.html content changed, so precached copies need to
   roll.
   v211: LF18(b) — a fifth guided tour, "Connections &
   Datasets", walks the real Connections section (list, + New connection, search/folders) then
   switches to the real Datasets section (list, + New dataset, search/folders) — joins the tour
   chooser alongside Overview/Quick analysis/Build a dashboard/Prep data (Jobs); the Overview
   tour's own Connections step now points at it. LF18(b)'s "deeper per-feature tours" scope is
   now fully done. app/tutorial.js, tests/run.js changed, so the precached copy needs to roll.
   v210: LF18(b) — a fourth guided tour, "Prep data (Jobs)",
   walks the real Jobs section (the list, the + New job pipeline builder, and search/folders) and
   joins the tour chooser alongside Overview/Quick analysis/Build a dashboard; the Overview tour's
   own Jobs step now points at it. LF18's remaining scope ("deeper per-feature tours for Jobs and
   Connections/Datasets") is now half done — Connections/Datasets NEXT. app/tutorial.js,
   tests/run.js changed, so the precached copy needs to roll.
   v209: LF18(d) — Home's Examples section hint now names
   the sample pack(s) the visible cards are drawn from ("from Conservation Insight + Data
   Management & Governance · click to open in the builder") instead of a generic "sample
   dashboards" line, reading off the same demoPackId gate the cards themselves use so it stays
   truthful as packs toggle. app/studio.js, tests/run.js changed, so the precached copy needs to
   roll.
   v208: LF18(a) — Home's quick-action cards reworded to
   concrete jobs: New dashboard/Explore data/New connection/New dataset, each with a one-line
   description; the three new ones (explore/connection/dataset) route straight to their target
   (Explore section, the connection wizard, the dataset editor) with no Studio entry, unlike
   blank/examples/tour. app/studio.js, tests/run.js changed, so the precached copy needs to roll.
   v207: R5+ slice 5, part 2 (tech-debt track) — the
   versions/notes MODAL/RENDER UI (openNoteEditor, openJsonEditor, openVersionDiff,
   openCompareDashboards, restoreVersion, and the Inspector's Version-history/Builder-notes
   sections) moves out of app/studio.js into app/versions.js (Studio.VersionsUI), joining the
   data layer part 1 already extracted there — a one-time Studio.VersionsUI.configure(deps)
   call injects the ~20 private DOM/modal helpers this half needs (modal/el/hint/field/
   textarea/select2pairs/setIconBtn/noteEl/copyText/postThemeOnLoad/disambiguateLabels/
   loadRecents/isVisibleToMe/section/rowItem/compareBtn/delBtn/panelById/esc), the same
   "inject the callbacks" shape Celebrations/Defaults already use, just more of them. Pure
   refactor, no behavior change — every window.__studio* test hook and call site is
   byte-for-byte unchanged; suite unchanged at 2132/2132.
   app/studio.js, app/versions.js changed, so precached copies need to roll.
   v206: LF22 slice 4 — the counties→custom-region MAPPING
   IMPORTER, the fourth and last geography-expansion item: a new "custom" choropleth scale lets you
   Import a 2-column CSV (county FIPS, region name) right in the Inspector and merges the existing
   county polygons per region via the same topojson.merge grouping the built-in crd scale already
   uses — no new geometry ships, so unlike slices 1-3 there's no vendor/geo asset or build-geo.mjs
   change at all, and Studio.geoAssetKeys(custom) needs only county+state (the lookup itself rides
   inside the panel's own chart.opts.customMap, not a fetched asset — the one structural difference
   from crd, whose lookup is a vendored file). New pure Studio.parseCustomGeoCsv (app/model.js, backed
   by a newly-exported Studio.parseCSVText in app/sources/localfile.js) turns the CSV into the
   {fips:region} lookup; a new "customgeo" opt-field type (app/studio.js's optField) renders the
   Import/Clear-mapping control, only reachable from the full Studio Inspector (Explore's lighter
   quick map editor intentionally does NOT gain this scale — it has no room for the import affordance,
   and offering the option there with no way to fill it would be a dead end, unlike cd/zcta which
   Explore's picker was simply missing while fully working elsewhere). geoFeatures/geoFeaturesGL
   (app/studio-charts.js) merge per the CALLER's customMap instead of a cached vendored table — the
   custom branch is deliberately NOT cached by scale name, since different panels can carry different
   mappings. scaleNoun gained "custom regions"; geoNormalizeId needed no new branch (region ids are
   the user's own label, passed through like crd's district id already is).
   app/model.js, app/studio-charts.js, app/studio-render.js, app/studio.js, app/sources/localfile.js,
   docs/index.html, tests/run.js changed, so precached copies need to roll.
   v205: LF22 slice 3 — a new 5-digit ZIP (ZCTA) choropleth
   scale, the third geography-expansion item: tools/build-geo.mjs fetches all ~33.8k ZIP Code
   Tabulation Areas nationwide from Census TIGERweb (tigerWMS_Current/MapServer layer 2, which
   carries no STATE attribute, so territories are dropped via the existing null-projection filter
   instead of a server-side state clause), simplifies aggressively (maxAllowableOffset 0.08 — size
   plateaus past that point since the floor is polygon COUNT, not vertex detail) and commits
   vendor/geo/us-zcta-albers.json (33,642 features, ~4.4MB — not precached, same as the other
   vendor/geo assets, but meaningfully bigger than huc8/cd; per-state lazy load remains a real
   follow-up if export size becomes a problem — see STATUS.md NEXT). New "zcta" scale wired through
   geoFeatures/geoFeaturesGL/geoNormalizeId/scaleNoun (app/studio-charts.js), Studio.geoAssetKeys +
   the Region-scale dropdown (app/model.js) + Explore's own map-editor scale list (app/studio.js,
   which had also been missing "cd" since slice 2 — fixed here too), and the three duplicated
   GEO_FILES lookup tables (app/studio.js's ensureGeoAssets, app/viewer.js, tools/lib.js) — every
   place that already special-cases cd gained a twin zcta branch. app/studio-charts.js,
   app/studio.js, app/model.js, app/viewer.js, docs/index.html changed, so precached copies need
   to roll.
   v204: LF22 slice 2 — a new Congressional districts
   (119th Congress) choropleth scale, the second geography-expansion item after slice 1's
   nationwide watersheds: tools/build-geo.mjs fetches district boundaries from Census TIGERweb
   (Legislative/MapServer), reprojects onto the same AlbersUsa plane, and commits
   vendor/geo/us-cd-albers.json (436 districts, all 50 states + DC, ~333KB — not precached, same
   as the other vendor/geo assets). New "cd" scale wired through geoFeatures/geoFeaturesGL/
   geoNormalizeId/scaleNoun (app/studio-charts.js), Studio.geoAssetKeys + the Region-scale
   dropdown (app/model.js), and the two duplicated GEO_FILES lookup tables (app/studio.js's
   ensureGeoAssets, app/viewer.js) + the CLI export's own copy (tools/lib.js) — every place that
   already special-cases huc8 gained a twin cd branch. Districts split counties (unlike CRD,
   which merges county polygons), so cd ships its own vendored geometry rather than being
   derived; region ids are 4-digit GEOID (state FIPS + district number), the same shape
   geoNormalizeId already gives CRD ids. app/studio-charts.js, app/studio.js, app/model.js,
   app/viewer.js, docs/index.html changed, so precached copies need to roll.
   v203: LF22 slice 1 — HUC8 watersheds now cover the
   whole country (all 50 states + DC), not just the 12-state Corn Belt: tools/build-geo.mjs
   queries the USGS WBD MapServer for every state instead of a hardcoded subset and simplifies
   a bit harder (maxAllowableOffset 0.01°→0.02°) to keep the shipped asset reasonable (2,292
   watersheds, 1.26MB vs. the old 533KB/571-watershed Corn-Belt-only file); the asset itself is
   renamed vendor/geo/us-huc8-albers.json (was …-cornbelt-albers.json) and every reference
   (app/studio-charts.js, app/studio.js, app/viewer.js, tools/lib.js, tools/gen-shots.mjs)
   + the Scale dropdown label (app/model.js) + docs/index.html copy follow. app/studio-charts.js,
   app/studio.js, app/model.js changed, so precached copies need to roll (vendor/geo/* itself is
   deliberately NOT precached, per the note below).
   v202: LF19 slice 10 — every Inspector section's
   bottom gap is now the same regardless of what content type rendered last (a trailing-
   margin-stacking fix), closing out LF19 (the whole left+right panel IA/redesign track)
   fully done. app/studio.css, tests/run.js changed, so precached copies need to roll.
   v201: LF19 slice 9 — Advanced-mode inspector
   sections (advSection()) now default to COLLAPSED the first time, the last piece of
   LF19's right-panel pass (consistent spacing is the one remaining follow-up).
   app/studio.js, tests/run.js changed, so precached copies need to roll.
   v200: LF13(d) slice 3 — the job editor's
   rollup/join/stack steps each gain a small visual diagram (columns in, the operation,
   columns out), the last piece of the job-editor overhaul ask (LF13 is now fully done).
   app/studio.js, app/studio.css, docs/index.html.
   v199: LF13(d) slice 2 — the job editor gains a
   sample-source-rows table (real values from a small live query) and an approximate
   output-rows preview computed by running the pure Studio.runJobSteps engine over that
   cached sample, updating live as steps are edited instead of requiring a "Preview"
   click or a fresh query on every keystroke. app/studio.js, app/studio.css.
   v198: LF13(d) slice 1 — the job editor gains a
   source FIELD LIST (type icons/colors) above the step pipeline: a read-only legend of the
   source dataset's columns, each with a best-effort Numeric/Date/String icon guessed from
   the column name, so what's available is visible before building steps. New shared
   guessFieldKind() helper (also now backs the Data Adapter preview table's column-type
   badges, replacing its own local copy) and two new icons (hash, text). app/studio.js,
   app/icons.js, app/studio.css.
   v197: LF19 Inspector slice 8 — the Data Source
   inspector (renderDAInspector) gets the same header-glyph treatment as the other four
   Inspector renderers, completing the right-panel icon pass. app/studio.js.
   v196: LF16/LF2(c) — the generic showcase gallery (8
   examples: governance, platform ops, delivery, finance, marketing, reliability, compliance,
   feature tour) folded into a new toggleable "Data Management & Governance" sample pack,
   installed by default so the gallery is unchanged out of the box; Remove only hides those
   gallery entries (no workspace rows, unlike Conservation Insight). app/demopacks.js,
   app/studio.js, data/examples/index.json, docs/index.html, tests/run.js changed.
   v195: LF19 Inspector slice 7 — three more Inspector
   renderers gain the header-glyph treatment: Filter (Filter, Options preview), Header
   (Header), and KPI tile (KPI tile, Trend & delta, Compare to, Click-through) — 7 more
   section()/advSection() call sites now carry their own icon. Data Source (renderDAInspector,
   ~15 sections) is the largest of the four still-open renderers and stays its own future
   slice. app/studio.js, tests/run.js changed, so precached copies need to roll.
   v194: LF19 Inspector slice 6 — the Widget/Panel
   inspector (renderPanelInspector) gets the same header-glyph treatment as the Dashboard
   inspector: all 20 section()/advSection() call sites (Widget, Chart type, Data, Options,
   Drill-through, Detail drawer, Cross-filter, Animation, Downloads, Target line, Reference
   band, Callout arrow, Period highlight, Event markers, Point annotations, Conditional
   formatting, Color scale, Insight, Query preview, Content) now carry their own icon.
   advSection() gains the same optional iconName argument section() already had.
   app/studio.js, tests/run.js changed, so precached copies need to roll.
   v193: LF19 Inspector slice 1 — the right Inspector
   panel starts its own organize-and-simplify pass: every top-level Dashboard-inspector
   section (Checks, Dashboard, Template variables, KPI tiles, Filters, Shareable link, Share
   this dashboard, Version history, Builder notes, Panels) now carries its own header glyph,
   same "what kind of thing is this" scannability as the left Data panel's group icons.
   section() gains an optional iconName argument. app/studio.js, app/studio.css, tests/run.js
   changed, so precached copies need to roll.
   v192: LF19 next slice — the Data panel's search
   field no longer sits in its own fully-bordered "card" row that echoed the group boxes
   below it; at rest it's a plain filled field (border returns on focus). app/studio.css,
   tests/run.js changed, so precached copies need to roll.
   v191: LF19 next slice — the "+ New" shortcut on
   "This dashboard's datasets" is icon-only now (title/aria-label carry the accessible name),
   which stopped it crowding the group's own name into an ellipsis at the panel's default
   width. app/studio.js, app/studio.css changed, so precached copies need to roll.
   v189: LF19 slice 1 — the Studio library's "This
   dashboard's datasets" and "Sample packs" groups now collapse by default once they hold more
   than a handful of cards (progressive disclosure), remembering an explicit open/close choice
   from then on. app/studio.js, docs/index.html changed, so precached copies need to roll.
   v188: LF34 — the Settings "Style presets" name field +
   Save button (.sp-add-row) overflowed the card by 44px on desktop/tablet (a flex-basis/margin
   interaction, not the suspected contrast issue); fixed the sizing so the row stays flush inside
   the card. app/studio.css changed, so the precached copy needs to roll.
   v187: LF25(b) — the Inspector's generic select-type chart
   option renderer (optField) was silently dropping od.hint, so the choropleth Renderer/Zoom-pan-
   controls/Controls-position dropdowns never showed the explanatory text already authored in
   model.js — threaded od.hint through to field()'s existing hint-div support. No behavior change
   to the renderer choice itself (still persists on the panel + rides save/export, verified).
   app/studio.js, js/changelog.js changed. */
/* v185: LF25(a) — every widget can export itself as a
   standalone HTML file right from the canvas (app/studio-render.js's addDownloadChrome grows a
   third "Export as HTML" icon beside Download image/data, preview/builder-only, posting
   panel-export-embed to the parent's existing exportPanelEmbed). Download image/data/Export-as-
   HTML are now three independent per-panel toggles (app/studio.js's Downloads inspector section)
   instead of one combined "Allow downloads" switch. app/studio.js, app/studio-render.js,
   docs/index.html changed, so precached copies need to roll. */
/* v184: LF30 — a marketing chart-type gallery on the
   homepage (index.html): a filterable tile grid of every real chart type Studio draws, sourced
   from site/chart-gallery.js (new, built by the new tools/gen-chart-gallery.mjs from the app's
   own Studio.CHARTS/CHART_SVG registry via a new Studio.chartCatalog()/window.__studioChartCatalog
   hook in app/chart-thumbnails.js — index.html never loads the app, so the data is dumped ahead
   of time and committed like site/shots/*.png). A capped 18-tile default view with a "Show all"
   expand, category chips (All + the 9 chart groups) that filter the grid. index.html,
   css/landing.css changed, so precached copies need to roll. */
/* v183: LF21 — the dashboard title/header banner becomes
   a first-class selectable/deletable canvas object, like a widget or KPI tile. Clicking the
   header in the live preview (studio-render.js's wireHeaderEditing) now posts select{kind:header}
   (guarded so a click on any of the header's own buttons/links doesn't also select it), and a new
   ✕ (.sr-head-del) on the header posts header-delete — both preview-only, so the exported header
   markup stays byte-identical. studio.js's message handler and renderInspector() gained a
   "header" branch: a new Header inspector view (quick Title/Subtitle fields mirroring the
   existing canvas double-click-edit, and a Hide header button that sets the same hideHeader flag
   the Dashboard panel's "Show dashboard header" checkbox already used). Logo/link/light-dark stay
   on the Dashboard panel for now (a reasonable follow-up, not this slice). docs/index.html
   updated. app/studio-render.js, app/studio.js, app/exporters.js, docs/index.html, js/changelog.js,
   tests/run.js changed, so precached copies need to roll. */
/* v182: LF23 slice 2 — role gating + Edit-in-Studio +
   Save-a-copy. Studio's rail item (app/index.html) now carries data-develop-only, hidden for
   the viewer role by shell.js's applyRoleGating (a canDevelop() check mirroring the existing
   admin-only pattern); opening a dashboard card/row as a viewer (app/studio.js openRecent) now
   routes to the read-only viewer route instead of Studio, and a viewer landing on the "studio"
   section by any other means (stale history, a hand-edited hash) bounces to Home the same way
   the admin-only redirect already does. app/viewer.html gained two actions: "Save a copy"
   (everyone, including viewers — forks the dashboard's saved spec into a new dashboard the
   account owns) and "Edit in Studio" (developer/admin accounts only — hands off to
   app/index.html's new ?edit=<id> boot handling, app/studio.js, which re-checks canDevelop()/
   isVisibleToMe() itself). docs/index.html updated. app/index.html, app/shell.js, app/studio.js,
   app/studio.css, app/viewer.html, app/viewer.js, docs/index.html changed, so precached copies
   need to roll. */
/* v181: LF23 slice 1 — Viewer mode. A new standalone
   route, app/viewer.html (+ app/viewer.js), opens ONE saved dashboard read-only, full-page, in
   a new tab: Studio.buildHtml(spec, assets, {preview:false}) — the exact renderer a real export
   uses, so it's genuinely interactive (filters/cross-filter/provider toggles) and shows the
   dashboard's real saved data, no mock. No builder chrome ships (the page never loads
   app/studio.js/app/shell.js). A small eye-icon "Open in viewer" link was added to every
   dashboard card/row (Home's recentCardHtml, the Dashboards tile+list rows) alongside the
   existing pin/feature/private toggles; a private dashboard's link 404s (shows "not found") for
   anyone but its owner/an admin, mirroring the M4.2 privacy rule. app/viewer.html/app/viewer.js
   are deliberately NOT added to SHELL_FILES below (same "don't precache a rarely-visited page"
   convention as docs/index.html — the runtime fetch handler caches it after a first visit).
   app/studio.js, app/studio.css, docs/index.html changed, so precached copies need to roll. */
/* v180: UX6 icon migration — LAST slice. The chart-
   pagination "‹ Prev"/"Next ›" buttons (app/studio-charts.js, PDC.table's page bar) are now
   themed chevron SVGs; app/icons.js is bundled into every export (app/exporters.js's
   buildHtml, app/studio.js's boot asset fetch) so Studio.icon() resolves inside the preview
   iframe / exported CDF html too, not just builder chrome. This also surfaced (and fixed) a
   latent bug in app/icons.js itself: it assumed some earlier builder-only script had already
   set window.Studio, which held in app/index.html's script order but threw "Studio is not
   defined" the moment it became the FIRST Studio-namespace file loaded in an exported bundle
   — it now self-establishes window.Studio like every other Studio file. UX6 is now fully
   done. app/studio.js, app/studio-charts.js, app/exporters.js, app/icons.js changed, so
   precached copies need to roll. */
/* v179: UX6 icon migration — the first-run Welcome
   tour's five step tiles used to bake a raw Unicode letter glyph (P/◈/▥/⤓/⚙, a full-color-
   font miss) into the header; now a themed Studio.icon SVG per step. app/welcome.js changed,
   so precached copies need to roll. */
/* v178: M7 slice 6 — in-app account provisioning.
   When the workspace backend is Supabase, Admin's "+ Add user" form gains an Email field
   and self-signs-up a real Supabase Auth (GoTrue) account via the public signup endpoint,
   stamping the returned id as gotrueId — no dashboard visit needed for any user after the
   first admin. Surfaces "signups disabled" and "still needs email confirmation" clearly.
   app/sources/supabase.js, app/studio.js, docs/index.html changed, so precached copies
   need to roll. */
/* v177: LF16 — the Settings Account card's own
   standalone "Demo content" toggle is gone (folded into the Sample packs card, which already
   covered every pack); "Demo packs" relabeled "Sample packs" throughout. No new precached
   files, but app/studio.js, docs/index.html and js/changelog.js content changed, so precached
   copies need to roll. */
/* v176: UX6 (icon migration, carets slice) — the
   remaining "▾" dropdown-trigger carets (New/Export/Examples/+New) and the footer Changelog
   button's "▴" expand indicator are now themed chevron SVGs instead of raw text glyphs. No
   new precached files, but app/index.html and app/studio.js content changed, so precached
   copies need to roll. */
/* v175: LF13(b) — a second (or third) "aggregate" job
   step now shows group-by pills / metric-column dropdowns built from the PREVIOUS step's output
   columns (a schema-only pipeline simulation), not just the raw source dataset, so a real
   multi-level rollup is actually buildable through the UI. No new precached files, but
   app/studio.js, docs/index.html and js/changelog.js content changed, so precached copies need
   to roll. */
/* v174: UX6 (currentColor icon migration, slice 4) —
   the demo-mode "● LIVE" badge used to lead with a raw Unicode "●" glyph; it now renders a
   themed Studio.icon SVG dot (the badge's own pulse animation still provides the "blinking"
   motion). No new precached files, but app/index.html, app/icons.js and app/studio.js content
   changed, so precached copies need to roll. */
/* v173: LF13(c) — the job editor gains a "uniqueKey" step
   that stamps a stable row-id onto the pipeline's rows. No new precached files, but
   app/studio.js, app/sources/jobs-engine.js, docs/index.html and js/changelog.js content
   changed, so precached copies need to roll. */
/* v172: LF13(a) — the job editor's group-by/metric/
   join+union-key fields are now dropdowns of the dataset's real columns instead of free text.
   No new precached files, but app/studio.js, app/studio.css and js/changelog.js content
   changed, so precached copies need to roll. */
/* v171: UX6 (currentColor icon migration, slice 3) —
   Explore's "‹ Back to datasets" button and the Compare-dashboards picker's "⇄" arrow used to
   be raw Unicode glyphs; they now render themed Studio.icon SVGs. No new precached files, but
   app/studio.js and app/icons.js content changed, so precached copies need to roll. */
/* v170: UX6 (currentColor icon migration, slice 2) —
   the builder chrome's "⋯ More", "＋ New ▾", "☰ List view"/"▦ Tile view", "⇄ Compare dashboards…",
   the inspector's "‹ Dashboard" back-link, and the pane-rail expand/collapse chevrons ("‹"/"›")
   all used to be raw Unicode glyphs; they now render themed Studio.icon SVGs. No new precached
   files, but app/index.html, app/studio.js, and app/icons.js content changed, so precached
   copies need to roll. */
/* v168: LF20 — the builder toolbar's Open/Save as/Close
   buttons are now icon-only (title/aria-label carry the meaning), Save/Export keep an icon +
   label; a new "save" glyph was added to app/icons.js. app/index.html, app/icons.js, app/studio.js
   changed, so precached copies need to roll. */
/* v167: LF36 slice 2 — the PDF export's deferred "sizing/
   scale + page-size/orientation" follow-up. Choosing "PDF (print)" in the Export menu now opens a
   small options dialog (page size Letter/A4/Legal, orientation, and a Fit-to-page-width/Actual-
   size scale choice, app/studio.js openPdfExportModal) before the print tab opens; the choices
   thread into Studio.buildHtml (exporters.js) as opts.pdfPageSize/pdfOrientation/pdfAutoFit — the
   @page CSS gets a matching `size:` keyword, and "Fit to page width" adds a small beforeprint
   script that scales a dashboard wider than the printable area down uniformly so nothing gets
   cropped. The plain "cdf"/"spec"/"all" exports (Studio.exportCDF) never pass these opts, so their
   output stays byte-identical to before. app/studio.js, app/exporters.js, docs/index.html,
   tests/run.js changed, so precached copies need to roll. */
/* v166: LF35 slice 2 — the movable half of the choropleth
   GL map controls ask: a new per-panel "Controls position" option (app/model.js) docks the
   zoom+pan cluster in any of the four map corners instead of a fixed top-right (mapControlsPos,
   studio-charts.js addControl position arg; undefined stays top-right, so every map saved before
   this option existed renders identically). The Compact CSS (exporters.js) now scales+origins per
   corner instead of only top-right, so "Compact" still shrinks the cluster wherever it's docked.
   LF35's originally-scoped "movable/hideable... cluster" ask is now fully shipped (slice 1 was
   show/hide/compact). No new precached files, but app/model.js, app/studio-charts.js, and
   app/exporters.js content changed, so precached copies need to roll. */
/* v165: LF36 slice 1 — a new "PDF (print)" entry in the
   Export ▾ menu opens the same self-contained dashboard export (Studio.exportCDF, byte-identical
   to the .html export) in a new tab via a blob URL and starts the browser's print dialog there
   ("Save as PDF") once the tab has loaded — reuses the #printBtn/@media print machinery
   exporters.js already bakes into every export instead of duplicating it. Print CSS polish: a new
   @page{margin:12mm} rule for sane print margins, plus orphans/widows:3 on the description bar and
   richtext panel paragraphs/list items so print/PDF output doesn't strand a single line at a page
   break. break-inside:avoid on .card/.pdc-kpis (unchanged) already keeps a widget/KPI row from
   splitting across a page boundary. Sizing/scale + page-size/orientation controls are a
   deliberately deferred follow-up (STATUS.md LF36). app/index.html, app/studio.js,
   app/exporters.js, docs/index.html, tests/run.js changed, so precached copies need to roll. */
/* v163: R5+ slice 5 (tech-debt track) — the version-history
   ("time travel" checkpoints) + canvas-sticky-notes data layer moved out of app/studio.js into its
   own module, app/versions.js (Studio.Versions / Studio.CanvasNotes), following the chart-
   thumbnails.js/branding.js/defaults.js/celebrations.js extraction precedent (①/②/③/④). Every
   function is parameterized (spec/dashboard id passed in) rather than reading studio.js's private
   `S` state, so — unlike celebrations.js/defaults.js — this needed zero injected callbacks. The
   modal/render UI half of this subsystem (openNoteEditor, openVersionDiff, openCompareDashboards,
   the Inspector's Version-history/Builder-notes sections) stays in studio.js for a follow-up slice
   — it leans on a dozen-plus of studio.js's own private DOM/modal helpers that don't extract as
   cleanly as this data layer did. Pure refactor, no behavior change. New precached file
   (app/versions.js) and app/studio.js content changed, so precached copies need to roll. */
/* v162: LF37 — Home Examples "+N more" footer is now a real
   button (was inert text) that enters Studio and opens the Examples menu, same as the existing
   New ▾ → Examples card. No new precached files, but app/studio.js and app/studio.css content
   changed, so precached copies need to roll. */
/* v161: QA-04 slice 2 — duplicate-named dashboards/analyses/
   datasets/connections/jobs are now distinguishable in the Compare dashboards pickers, the "Open a
   dashboard"/"Add to which dashboard?" pickers, and Repository without opening each one — a shared
   disambiguateLabels() helper in app/studio.js appends a short id suffix only to rows whose visible
   label still collides with another row's. No new precached files, but app/studio.js content
   changed, so precached copies need to roll.
   v160: QA-06 — the restore-unsaved-work banner now reserves
   layout space instead of floating over other sections' controls. No new precached files, but
   app/studio.js and app/studio.css content changed, so precached copies need to roll.
   v159: QA-05 — icon-only action buttons (Explore's saved-
   analysis row, the Studio data rail's Duplicate/Delete, the Compare dashboards pickers) now carry
   object-specific accessible names instead of a bare symbol/verb. No new precached files, but
   app/studio.js content changed, so precached copies need to roll.
   v158: QA-04 — brand-new blank/duplicated dashboards no
   longer collide with a title already in the catalog ("two Untitled Dashboard entries" was the
   frontend QA report's concrete repro). New uniqueDashboardTitle()/newBlankSpec() helpers in
   app/studio.js suffix " 2", " 3", ... against the live catalog at creation time; "Duplicate
   current"'s "(copy)" title goes through the same helper. No new precached files, but
   app/studio.js content changed, so precached copies need to roll.
   v157: QA-03 — Explore's featured county demo now opens
   with a populated choropleth (was auto-mapping Value to the text `statecode` column instead of
   the numeric `pct` column). Fix lives in a new shared Studio.guessChoroplethCols() helper (app/
   model.js) used by both Studio.newPanel's choropleth default and studio.js's autoPickCols
   Auto-pick button, so the two never disagree again. No new precached files, but app/model.js
   and app/studio.js content changed, so precached copies need to roll.
   v156: QA-02 — credential-storage copy is now state-aware
   (Connections header, Settings "Workspace backend" card, tutorial) instead of unconditionally
   claiming browser-only storage; the connect wizard warns before a first plaintext credential
   sync. No new precached files, but app/studio.js, app/studio.css, app/index.html and
   app/tutorial.js content all changed, so precached copies need to roll.
   v155: QA-01 — connection credential inputs get a stable
   connector-specific id/name + autocomplete=new-password, and a brand-new connection's secret
   field renders empty/readonly until focus (blocks unrelated password-manager autofill). No new
   precached files, but app/studio.js content changed, so precached copies need to roll.
   v154: Branding is now an app-wide ADMIN card
   (moved out of personal Settings). It gained a customizable/hideable rail suite-name
   (default "polecat.live"), clearer square-icon guidance on the App mark, and a custom
   logo now also becomes the browser-tab favicon. app/branding.js, app/studio.js,
   docs/index.html changed, so precached copies need to roll.
   v153: LF2 — an 8th Conservation example, "The Story So
   Far" (data/examples/conservation-overview.studio.json, index.json entry): a richtext-led
   narrative rollup tying the other six Conservation showcases together, with a practice-mix trend
   line plus overall-adoption/enrolled-acres/return-score/provider-agreement rollup panels. New
   example file needs to roll into the precache (the SW reads index.json at install and caches
   each listed example file, so no separate precache-list entry is needed). docs/index.html
   changed too (names all 8 showcase dashboards). LF2(a) is now fully done.
   v152: LF2 — a 7th Conservation example, "Year-over-
   Year Practice Switching" (data/examples/conservation-switching.studio.json, index.json entry):
   a stacked-area view of the practice mix by year, a bump-chart ranking of adoption share (who
   rose, who fell), a 2015-vs-2025 slope per practice, and a switched-acres gauge, gated by a real
   Crop filter — first use of the areaStacked/bump/slope chart types in the Conservation set. New
   example file + updated index.json need to roll into the precache (the SW reads index.json at
   install and caches each listed example file, so no separate precache-list entry is needed).
   docs/index.html changed too (names all 7 showcase dashboards).
   v151: R5+ slice 4 (tech-debt track) — the N-FUN
   celebrations/milestones subsystem (sparkBurst, first-export toast, export/dashboard
   milestone counters, dashboard-health-zero celebration) extracted from studio.js into its
   own module, app/celebrations.js (Studio.Celebrations), following the chart-thumbnails.js/
   branding.js/defaults.js extraction precedent (①/②/③). Pure refactor, no behavior change.
   New precached file (app/celebrations.js) and app/studio.js content changed, so precached
   copies need refreshing. */
/* v150: LF9 slice 3 — Back also closes Explore's dataset/
   analysis editor back to the "pick a dataset" picker, staying in the Explore section. Explore
   swaps content in place (no overlay DOM to just re-show), so it reuses shell.js's existing
   pushOverlay/popOverlay stack from its own close path (xpCloseToList) instead of a new
   mechanism. Adds a "Back to datasets" button for the same manual-close path. LF9 is now
   feature-complete: every navigable state change in the app (sections, overlays, this swap)
   participates in Back/Forward. app/studio.js, app/studio.css changed. */
/* v149: LF9 slice 2 — Back now closes an open overlay
   (modal, panel-zoom, slideshow) instead of navigating sections, generalizing the LF8 zoom-trap
   fix to every overlay type. shell.js gains a small overlay-history stack (pushOverlay/popOverlay)
   that each overlay's open/close path wires into. app/shell.js, app/studio.js changed. */
/* v148: LF9 slice 1 — Back/Forward now walks section
   navigation instead of leaving the app: shell.js pushes a history entry on every real section
   change and a popstate listener re-drives setActive() from it (fromHistory=true skips a
   duplicate push). app/shell.js changed. */
/* v147: LF2 — a 6th Conservation example, "County-Level
   Outlier Detection" (data/examples/conservation-outliers.studio.json, index.json entry): a
   county-scale (FIPS) choropleth of the common estimate, a district-level diverging-bar ranking
   of adoption deviation from the regional baseline (with a real Practice filter), a histogram of
   the county-level deviation distribution, and a gauge for the share of counties flagged as
   outliers. New example file + updated index.json need to roll into the precache. docs/index.html
   changed too (names all 6 showcase dashboards).
   v146: LF2 — a 5th Conservation example, "Provider
   Agreement Over Time" (data/examples/conservation-agreement.studio.json, index.json entry): an
   ensemble trend against the common estimate, a year × provider agreement heatmap, a yearly-spread
   line, and a per-provider average-deviation bars ranking. New example file + updated index.json
   need to roll into the precache. docs/index.html changed too (names all 5 showcase dashboards).
   v145: LF2 — a 4th Conservation example, "Program
   Cost-Share ROI" (data/examples/conservation-costshare.studio.json, index.json entry): a
   cost-efficiency scatter (spend vs. adoption, bubble = acres), a cost-share-by-practice donut,
   a cost-per-acre trend responding to the same Since-year filter convention, and a return-score
   bars ranking. New example file + updated index.json need to roll into the precache.
   v144: M7 slice 3 — the data migration RLS needs before
   tools/supabase-rls-real.sql can safely go live. currentUserId() (app/studio.js) now prefers an
   account's gotrueId over its username once Supabase Auth sign-in has stamped one (M7 slice 2),
   so freshly-created rows already carry the id auth.uid() will compare against. A new
   migrateOwnerToGotrueId() walks connections/dashboards/analyses/jobs (owner) and datasets
   (acctOwner) and re-stamps any of THIS account's own rows still holding the old username —
   run once at boot (catching up rows a sync pull brought in from a device that hadn't signed in
   yet) and again right after a fresh GoTrue sign-in stamps a new gotrueId. Never touches another
   account's rows (this account has no way to know their gotrueId), and datasets' unrelated
   free-text `owner` field is left alone — only acctOwner is the identity field there. No new
   precached files, but app/studio.js content changed, so precached copies need to roll.
   v143: M7 slice 2 — optional Supabase Auth (GoTrue)
   sign-in. app/sources/supabase.js gains two optional connect-wizard fields (authEmail,
   authPassword); when set, every REST call signs in via the auth token endpoint first and
   sends that session's JWT instead of the anon key, so auth.uid() resolves to a real user.
   Leaving the fields blank keeps every existing connection anon-key-only, unchanged. A new
   signIn(cfg) adapter method reports the resulting user id; the connect wizard stamps it onto
   the signed-in local identity as a new PolecatAuth gotrueId field (app/auth.js). app/index.html
   already precaches app/auth.js and app/sources/supabase.js; app/studio.js and docs/index.html
   content changed too, so precached copies need to roll.
   v142: R5+ slice 3 (tech-debt module-extraction track) —
   the dashboard-defaults + preset-collection subsystem (the 8 default*() / setDefault*() pairs
   plus stylePresets/templateVarSets/customThemePresets) moved out of studio.js into its own
   app/defaults.js, following the branding.js (②) extraction precedent — pure config over
   localStorage, no DOM/spec dependency. defaultDashboardTheme()'s never-set fallback needs
   studio.js's own active-Color-theme state, so studio.js injects that one resolver via
   Studio.Defaults.configureDashboardThemeFallback() instead of the module reaching into private
   state or duplicating studio.js's theme-mapping table. studio.js's call sites are unchanged
   (aliased locally to Studio.Defaults.*). app/index.html gained the new script tag, so precached
   copies need to roll.
   v141: R5+ slice 2 (tech-debt module-extraction track) —
   the Z12 branding subsystem (BRAND_MAX_BYTES/getBranding/setBranding/applyBranding) moved out of
   studio.js into its own app/branding.js, following the chart-thumbnails.js (①) extraction
   precedent — pure config + one DOM write, no dependency on builder state. studio.js's call sites
   are unchanged (aliased locally to Studio.Branding.*); window.__studioBranding now lives in the
   new module. app/index.html gained the new script tag, so precached copies need to roll.
   v140: LF4(c) — the SVG choropleth renderer's "State
   border overlay" toggle never actually drew anything: geom2path() (app/studio-charts.js) only
   handled Polygon/MultiPolygon geometry, but topojson.mesh() (used to build the state-line
   overlay, and the GL renderer's own border layer) returns LineString/MultiLineString — an
   unhandled type that silently built an empty path string. Added line2path() (mirrors ring2path
   minus the closing Z, since a mesh segment is an open polyline, not a closed ring) and routed
   LineString/MultiLineString through it. The GL renderer was never affected (MapLibre consumes
   raw GeoJSON, no path-string step) — this closes the SVG/GL parity gap LF4(c) asked about.
   app/studio-charts.js changed, so the precached copy needs to roll.
   v139: LF20 — the dashboard's own light/dark render mode
   moves from a live in-header toggle button (confusing next to the app-level light/dark control)
   to a persisted per-dashboard Inspector "Appearance" option (spec.renderMode). exporters.js bakes
   data-theme onto <html> at build time instead of studio-render.js wiring up a themeBtn click
   handler at runtime; the now-dead PDC.initTheme/PDC.toggleTheme are removed from vendor/pdc-ui.js.
   app/model.js, app/exporters.js, app/studio-render.js, app/studio.js, vendor/pdc-ui.js changed,
   so precached copies need to roll.
   v138: LF2 — a 3rd Conservation example, "Watershed-Scale
   Adoption" (data/examples/conservation-watershed.studio.json, index.json entry): a HUC8
   choropleth colored by the provider common estimate, the ensemble trend behind it, an overall
   adoption gauge, and a by-provider bar, with a real "Since year" filter. data/examples/index.json
   and the new example file changed, so precached copies need to roll (same convention as v133's
   new example additions).
   v137: LF26 — "Save as…" + overwrite protection: a
   new Save-as button forks the working spec into a brand-new dashboard, and plain Save on a
   sample/demo dashboard (or, later, one you don't own) now opens that same Save-as prompt
   instead of silently overwriting the shared original. app/index.html, app/studio.js,
   docs/index.html changed, so precached copies need to roll.
   v136: LF6 slice 2 — folded the choropleth/ensemble-
   specific "Download CSV" legend buttons into the generic per-panel download chrome from v135
   instead of leaving both live side by side. The charts now register a "current selection" rows
   fn (PDC._panelCsvRows, keyed by panel id) that the chrome's Download-data button prefers over
   the raw bound query when present — still respects live provider-toggle state, just one control
   per panel instead of two. app/studio-charts.js, app/studio-render.js, docs/index.html changed,
   so precached copies need to roll.
   v135: LF6 — per-panel download chrome (image + data),
   on by default with a per-panel "Allow downloads" Inspector toggle. Lives in app/studio-render.js
   (not studio.js) so the SAME code renders it in the live preview iframe AND the exported/embedded
   HTML — verified against a real standalone bundle, not just the builder. app/studio-render.js,
   app/studio.js, app/exporters.js, docs/index.html changed, so precached copies need to roll.
   v134: UX7 (quality track) — mobile 44px touch targets
   across the whole ≤640px band. The 400-640px phone band rendered .btn at ~28-32px (font-size
   12px + 7px padding, no min-height at all — the 44px rule only existed for #topbar/#dashbar
   .btn at ≤400px); .da-act/.chip sat at 36px/40px. .btn (and .btn.icon) now carry min-height:44px
   via inline-flex centering (matching the existing rb-acts .btn convention) across the whole
   ≤640px band, so the narrower ≤400px-only rule is now redundant and removed. .da-act/.chip
   bumped to 44px too; .chip is a bare <span> (display:inline by default) so min-height alone was
   inert there — added inline-flex centering so the floor actually renders, not just declares.
   app/studio.css changed, so the precached copy needs to roll.
   v133: LF7 — the featured Conservation Insight dashboard
   (app/demopacks.js) and its two gated examples (data/examples/conservation-scorecard.studio.json,
   conservation-flow.studio.json) gained real filterDef filters (Practice/Since year/Practice/Crop)
   wired to actual panel query params, plus an explicit "providers" ensemble/choropleth cross-filter
   channel. app/demopacks.js changed (precached directly); the two example JSON files are re-fetched
   network-first regardless, but the content changed materially so the cache rolls with everything
   else in this slice.
   v132: LF28 — the GL choropleth's interactive pan/zoom
   now persists onto the panel spec (debounced, builder-only): reopening a dashboard, saving,
   or exporting restores the exact camera the user left the map at instead of re-fitting bounds
   to the data every time. Works in both Dashboard Studio and Explore's live preview.
   app/studio-render.js, app/studio-charts.js, app/studio.js changed, so precached copies need
   to roll.
   v131: UX4 (quality track, remainder) — a
   staggered fade-up entrance on the recent/dashboard/favorite/example card grids, and a
   distinct celebratory toast variant (trophy icon + brand gradient) for milestone moments
   (first export, round-number export/dashboard counts, zero-warnings). Both reduced-motion
   gated. app/studio.css, app/studio.js, app/icons.js changed, so precached copies need to
   roll.
   v130: LF27(b) — Studio gains a Close button
   (next to Save, mirrored in the phone More menu) that returns you to whichever section
   you opened the builder from, instead of leaving you stuck on the rail's Studio item.
   app/index.html, app/shell.js, app/studio.js, app/studio.css changed, so precached
   copies need to roll.
   v129: LF27(a) — a fresh boot (no saved section)
   now lands on Home instead of the Studio builder; Studio stays one click away on the
   rail, and a user's own last-visited section still wins. app/index.html, app/shell.js
   changed, so precached copies need to roll.
   v128: LF32 — a job-output rollup's "statecode"
   group-by column (no underscore) was misclassified by the offline sample engine as a
   workflow-status column, so the Inspector Query Preview and the Studio canvas preview
   showed Success/Failed/Aborted/Running instead of postal state codes, and a state-level
   choropleth preview read as all no-data. classify()'s state-code regex now also matches
   the unseparated form. app/sampledata.js, tests/run.js changed, so precached copies need
   to roll.
   v127: LF33 — the left rail's brand mark now
   centers against the whole "Analytics / polecat.live" lockup instead of just the
   top line, in the expanded rail, collapsed rail, and mobile drawer alike.
   app/studio.css changed, so precached copies need to roll.
   v126: ensemble chart contrast fix — the
   "common estimate" line + legend now use the dashboard theme's --text-primary ink
   instead of the un-themed --ink, so they stay readable on dark themed panels
   (the Conservation-dark invisibility bug). app/studio-charts.js changed.
   v125 (UX4, quality track): modals and the
   first-run welcome overlay now scale+fade in on open instead of snapping into view,
   disabled under prefers-reduced-motion. app/studio.css, app/welcome.js changed, so
   precached copies need to roll.
   v124: Datasets list row fix — a heavily
   tagged dataset (e.g. a job-output row with #demo #conservation #geo #job-output)
   no longer explodes vertically; the name subtitle ellipsizes instead of wrapping
   one character per line. app/studio.css changed, so precached copies need to roll.
   v123: left-rail regroup — Jobs + Admin
   now sit under a new "Manage" group below Build (Jobs moved out of Workspace).
   app/index.html rail markup changed, so precached copies need to roll.
   v122 (REVIEW-FIXES follow-up): a "+ New" button
   next to Explore's dataset search opens the same dataset editor the Datasets section
   uses; saving selects the new dataset immediately, no round-trip to Datasets and back.
   app/studio.js, app/studio.css, docs/index.html changed, so precached copies need to
   roll.
   v121 (UX10, quality track): the cold-load
   "Loading…" paragraph in Home/Settings/Admin's boot placeholder is now a small pulsing
   skeleton (role=status/aria-label keeps it announced without a visible string),
   prefers-reduced-motion disables the pulse. app/index.html, app/studio.css changed, so
   precached copies need to roll.
   v120 (M6 "favorites-with-thumbnails"): pinned
   Datasets/Connections (the existing catalog-row ★ toggle) now surface as cards in a new
   Home section, reusing the pinnedAnalyses card treatment. app/studio.js, app/studio.css
   and docs/index.html content changed, so precached copies need to roll.
   v119 (R5+ slice 1, tech-debt sweep): the
   ~225-line CHART_SVG gallery-thumbnail table moved out of app/studio.js into its
   own module, app/chart-thumbnails.js (Studio.CHART_SVG) — the first ES-module
   app/*.js extraction off studio.js, establishing the pattern R5+'s later slices
   follow. Pure refactor, no behavior change. New precached file added (app/
   chart-thumbnails.js) and app/studio.js content changed, so precached copies
   need to roll.
   v118 (R4, tech-debt sweep): Connections'
   toggleConnPin/connLoadViews/connSaveViews and Datasets' toggleDsxPin/dsxLoadViews/
   dsxSaveViews were duplicated logic differing only in which Workspace table/settings
   key they touch — now backed by two shared factories (makePinToggle/makeViewsStore).
   Pure refactor, no behavior change. app/studio.js content changed, so precached
   copies need to roll.
   v117: Explore's own dataset picker, its saved-analysis
   reload path, and its save path (xpDatasets/xpLoadAnalysis's haveDs check/xpDA) now all respect
   dataset privacy — closing an M4.2-class leak Explore was the last consumer left uncovered by
   (a viewer could pick, preview, and even re-persist another account's private dataset through
   Explore even though it was already hidden from the Datasets catalog itself).
   app/studio.js + tests/run.js changed, so precached copies need to roll.
   v116: "Clear local data" now also signs you out
   (analytics.session.v1 + the studio-gate-ok bypass) and resets per-section rail rights +
   Home's section order — closing the REVIEW-FIXES "start fresh" reset gap (Track L sweep
   round 4: three keys that three separate recent slices added but never wired into Clear-local-data).
   app/studio.js + tests/run.js changed, so precached copies need to roll.
   v115: UX11 — a fourth app Color theme,
   Conservation (CTIC olive/pine, reusing the dashboard Conservation theme's palette).
   app/studio.js + app/studio.css + docs/index.html changed, so precached copies need
   to roll.
   v114: R3 — the stylePresets/templateVarSets/
   customThemePresets list-CRUD triplets now share one makePresetStore(key) factory;
   pure refactor, no behavior change. app/studio.js changed, so precached copies need
   to roll.
   v113: M6 slice 2 — the most-recently-featured
   dashboard on Home renders as a full-width hero card. app/studio.js + app/studio.css
   + docs/index.html changed, so precached copies need to roll.
   v112: M6 slice 1 — Home's Featured/Pinned
   analyses/Examples/Dashboards sections gain move-up/down reorder controls, order
   persisted. app/studio.js + app/studio.css + docs/index.html changed, so precached
   copies need to roll.
   v111: R3 slice 1 — the 8 default-style config
   getter/setter pairs now share strDefault/setStrDefault; pure refactor, no behavior
   change. app/studio.js changed, so precached copies need to roll.
   v110: UX9 — bare .btn buttons inside modals (e.g.
   the export bundle modal's Copy button) get dark-on-light contrast instead of the
   faint white-on-translucent default. app/studio.css changed, so precached copies
   need to roll.
   v109: LF29a typography polish — object names/ids
   (dataset+connection lists, saved-source cards, dashboard id chip) move off the
   monospace face onto the app's sans font; dashboard title can grow wider on desktop.
   app/studio.css changed, so precached copies need to roll.
   v108: LF17 — Color theme picker is now palette
   cards, not a dropdown (Settings → Appearance). app/studio.js and app/studio.css
   changed, so precached copies need to roll.
   v107: LF4a — choropleth GL renderer gains a
   pan nudge-pad (up/down/left/right) next to its zoom control. app/studio-charts.js
   changed, so precached copies need to roll.
   v106: LF10 — chart palette now follows the
   app's Color theme (new dashboards/widgets + Explore's live preview default to the
   matching Studio.DASHBOARD_THEMES entry unless a Settings default is set explicitly);
   Explore's preview also now follows the app's light/dark mode. app/studio.js changed,
   so precached copies need to roll.
   v105: M5 NEXT — "drag-to-file", the last of
   the two documented subfolder affordances: dragging a Repository row onto a folder
   group's header refiles it there (drop on Unfiled to clear its folder), a desktop-
   mouse-only convenience on top of the folder text field, which stays the primary,
   mobile-capable way to file something. app/studio.js, app/studio.css content
   changed, so precached copies need to roll.
   v104: M5 NEXT — Repository gains a "+ New
   folder" action so an empty (even nested) folder can be created ahead of filing
   anything into it, with a small delete (✕) affordance while it stays empty —
   filing something real into it just makes it an ordinary folder. app/studio.js,
   app/studio.css content changed, so precached copies need to roll.
   v103: M5 NEXT — dashboards gain the same
   flat `folder` field as datasets/connections/jobs/analyses, so they group into
   Repository's folder tree too instead of always landing in Unfiled. Quick edit
   (the Repository row pencil button) now covers dashboards as well, folder-only
   (no name field — a dashboard's title stays Studio's own settings' job).
   app/studio.js content changed, so precached copies need to roll.
   v102: LF11 — Explore's ambiguous single
   "Add to dashboard" button is now two explicit buttons, "+ New dashboard" and
   "Existing dashboard…" (the latter opens a picker of saved dashboards). Docs
   updated to describe the split. app/studio.js, docs/index.html content
   changed, so precached copies need to roll.
   v101: M5 — Repository's folder groups
   become a real nested TREE: a "/" in any folder value (e.g. "Finance/2024")
   now nests a child group inside its parent instead of being treated as one
   flat name, with each folder's header count rolling up its subfolders. The
   dataset/connection/job/analysis folder-field hints across the app now
   mention the "/" nesting convention. app/studio.js, app/studio.css,
   docs/index.html content changed, so precached copies need to roll.
   v100: M5 NEXT — Repository rows for
   dataset/connection/job/analysis gain a quick-edit (pencil) button that opens
   a right-panel editor (rightPanel from the vendored shell) to rename or
   refile the object without leaving Repository or opening its full editor.
   app/studio.js, app/studio.css content changed, so precached copies need to
   roll.
   v99: M5 folder pilot slice 4 — Analyses
   gain the same flat Folder field (Explore savebar input + datalist), a
   folder chip facet above the saved-analyses list, and a row badge, same
   shape as the Datasets/Connections/Jobs folder pilot; Repository's rows
   pick up analyses' real folder too. app/studio.js, app/studio.css content
   changed, so precached copies need to roll.
   v98: M5 folder pilot slice 3 — Jobs gain
   a Folder field (editor input + datalist), the section's first search box,
   a folder chip facet, and a row badge, same shape as the Datasets/
   Connections folder pilot. app/index.html, app/studio.js, docs/index.html
   content changed, so precached copies need to roll.
   v97: M5 slice 2 — Repository's rows are
   now GROUPED under a collapsible header per folder (Unfiled last), the
   documented "real nested folder tree" step after slice 1's flat list.
   app/studio.js, app/studio.css, app/tutorial.js, docs/index.html content
   changed, so precached copies need to roll.
   v96: M5 slice 1 — new Repository section
   (flat cross-object search/browse over dashboards/datasets/connections/
   analyses/jobs, deep-linking into each object's own editor). app/index.html,
   app/shell.js, app/studio.js, app/icons.js, app/tutorial.js content changed,
   so precached copies need to roll.
   v95: LF5(b) — color-token pickers gain a
   live resolved-color swatch + per-option tinting, and the choropleth Ramp
   color option gains a gradient preview (app/studio.js, app/studio.css
   content changed, so precached copies need to roll).
   v94: FIX — candlestick + diverging-bar
   default colors pointed at undefined CSS tokens, silently rendering grey
   instead of green/red (app/model.js, app/studio-render.js, app/
   studio-charts.js content changed, so precached copies need to roll).
   v93: FIX — Parallel Coords no longer
   shows an inert per-series color picker in the Inspector (app/model.js,
   app/studio.js content changed, so precached copies need to roll).
   v92: Connections folder pilot (#21 org
   sub-item, "folder tree" step 2, slice 2) — the same single `folder` field
   + chip facet as Datasets' v91 slice, now on Connections (app/studio.js
   content changed, so precached copies need to roll).
   v91: Datasets folder pilot (#21 org
   sub-item, "folder tree" step 2) — a single d.folder field, editor field +
   datalist, chip filter, row badge (app/studio.js, app/studio.css content
   changed, so precached copies need to roll).
   v90: reword the per-panel dataset
   caption's tooltip from the jargon "View the CDA queries behind this
   dashboard" -> "View the dataset behind this widget" (vendor/pdc-ui.js — a
   user-facing string, inlined identically into preview + export).
   v89: polecat-shell v0.5.4 — brand-color
   app-switcher tiles (vendored catalog + shell + site-chrome changed).
   v88: FIX — clicking a panel's dataset
   caption (the "◴ <dataset>" footer) now opens the Datasets view FOCUSED on
   that panel's dataset instead of showing every dataset with nothing
   highlighted (studio-render passed no `query`/focusId to PDC.card). Also
   reworded the header info button's jargon "CDA queries" -> "datasets".
   app/studio-render.js + app/exporters.js.
   v87: faint polecat.live suite link in the rail
   (app/index.html + app/studio.css touched).
   v86: LF2 — 2 new Conservation-themed example
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
  "app/gate-config.js",
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
  "js/changelog.js",
  "app/shell.js",
  "app/chart-thumbnails.js",
  "app/branding.js",
  "app/defaults.js",
  "app/celebrations.js",
  "app/versions.js",
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
