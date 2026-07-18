# Analytics Dashboard Studio — STATUS (product playbook + resume anchor)

> **SHIP PROTOCOL (Polecat platform process, adopted 2026-07-15 — supersedes the old hourly loop):**
> This app is on the fleet flow — read `kevinrhaas/polecat-platform` → docs/FLEET-GUIDE.md; the
> migration row is docs/MIGRATION.md #6, **ASSIGNED to a dedicated session** (scheduled steward
> improve runs SKIP this app and its open `steward/*` PRs). The old hourly push-to-main routine is
> **RETIRED** (its trigger is kept disabled as zzARCHIVE — never re-enable it), which also retires
> the old ⛔ pause block that guarded it. The flow for EVERY unit of work now:
> 1. Check for open `steward/*` PRs and sweep-findings issues first (daily platform UX/tech sweeps
>    file them in this repo; fixing a top finding is a first-class unit of work). Don't collide.
> 2. Branch `steward/<topic>` off latest main. **Never push to main directly.**
> 3. Build ONE coherent unit of work (top NEXT item below, ★ items first). Keep the Playwright
>    suite green (`NODE_PATH=$(npm root -g) node tests/run.js`); add a check per feature; never
>    weaken assertions to pass.
> 4. Prepend a changelog entry (`ts: ''`) to `js/changelog.js` and run
>    `node tools/changelog-normalize.js` to stamp it YOURSELF — nothing stamps after merge;
>    Manager and the polecat.live launcher parse the file live (`tools/changelog-check.js`
>    verifies without writing).
> 5. Update THIS file (DONE/NEXT) in the same PR; update `docs/index.html` in the same slice as
>    any user-facing feature change; bump the `sw.js` cache name if precached files changed.
> 6. Open the PR and **merge it yourself when green — merge is ship** (`deploy.yml` publishes on
>    merge; never hard-gate deploy on CI — see the "CI / deploy" convention below). Guard main
>    (`.github/workflows/auto-revert.yml`) self-heals a broken main, and the platform janitor
>    re-tests and merges green `steward/*` PRs every 2h as a backstop. The ONLY way to park work
>    for Kevin is leaving the PR open with the **`hold` label** plus a written explanation.
>
> **SWEEPS:** the platform runs daily read-only UX + tech sweeps that file findings issues here —
> work those first. The old self-directed sweep rotation (H: UX/delight · L: architecture/code
> review · N: innovation/roadmap) remains a good instinct when the findings queue and the ★
> backlog are thin: same rules, one shippable, tested slice per sweep, logged in DONE.

> **GOAL / NORTH STAR:** build **Analytics Dashboard Studio** into a best-in-class, gorgeous, fun,
> industry-leading **analytics application** (analytics.polecat.live) — not just a dashboard builder.
> The app is a multi-section workspace (Home · Dashboards · Datasets · Connections · Studio · Settings)
> built on the **adapters → connections → datasets** model (2026-07-13 overhaul, user-directed):
> **Adapters** (app/sources/) implement one contract with two capability planes — `caps.meta` (can host
> the app's own workspace catalog) and `caps.data` (can run dataset queries). **Connections** are saved,
> credentialed instances of an adapter. **Datasets** are named, `{{param}}`-substitutable queries on a
> connection that dashboards bind to (imported into the spec as self-contained copies that stay LINKED
> via datasetId/connectionId for live runs). The **workspace backend** (Settings card, manager-pattern
> write-through sync, optional zero-knowledge secrets encryption) mirrors the whole catalog to
> Turso/Supabase/Firebase. **Pentaho is fully removed** (sources, Servers, CDA/CDE export, publish);
> the old CDA demo catalog now just feeds the built-in offline sample engine. Everything stays
> **pure HTML/JS, no build step**; local-first with the optional remote backend. Aesthetic: Polecat
> warm-dark (the DEFAULT app + dashboard theme), fun, clean, elegant, a little **game-like** —
> jobtracker-style filterable lists (multi-select pills, search, tiles/list), manager-style rail.
> The visual **dashboard builder** (Studio, exporting self-contained HTML) is the mature core.

## Environment / how to work
- Project root: the **repository root** of `kevinrhaas/analytics.polecat.live` (the app is the repo —
  no `dashboard-studio/` subfolder). Plain HTML/JS, no framework, no build step.
- Serve: `./serve.sh` (→ http://localhost:8000). Must be served (fetch); `file://` won't work.
- **Test:** from the repo root: `NODE_PATH=$(npm root -g) node tests/run.js` (Playwright, global at
  `/opt/node22/lib/node_modules`, Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`).
  Keep it **green**; add a check for each new feature.
- Regenerate catalog/examples from the reference suite: `python3 tools/import-v2.py` (reads
  `reference/dashboards/`).
- One spec drives all: `app/model.js` (registry+helpers) → `app/studio-render.js` (in-iframe render +
  in-canvas editing) ↔ `app/studio.js` (builder) → `app/exporters.js` (CDA/CDE/CDF). `SPEC.md` = schema.
- Preview iframe == exported CDF html (same toolkit inlined). Builder ↔ iframe talk via postMessage
  (`{studio:1,type:select|reorder|resize|...}`).

## Conventions (apply to ALL output, every run)
- **HTML + JS only, light dependencies.** No Java, no Python, no build step, no heavy frameworks, no
  package installs baked into exported artifacts. The vendored toolkit stays self-contained; new chart
  types/features go in `app/studio-charts.js`. Exported files (CDF .html / CDE / .cda / bundle) must
  stay small and dependency-light so the Pentaho team can drop them in anywhere.
- **Clean code.** Cohesive modules (model/render/studio/exporters boundaries), consistent style, no dead
  code, no mess.
- **Documented for the humans.** Add helpful, friendly, supportive comments where a
  human needs orientation — explain the *why* and any non-obvious technique. Concise, not verbose. If
  existing code is thin on comments and a reader would struggle, add brief contextual notes.
- **Keep the in-app docs current.** `docs/index.html` is the user-facing Help reference (linked from the
  app). Whenever you add or change a user-facing feature, **update the docs in the SAME slice** so they
  never drift, and make sure the app links to them discoverably (see Z11).
- **Changelog — fleet house style (user-requested 2026-07-02).** Lives at **`js/changelog.js`** in the shared
  Polecat fleet format so the **manager.polecat.live "Sync changelog" tool can fetch + parse it** (same shape
  as manager/relay). The file is an **ES module** — `export const CHANGELOG = [ … ]` + `export const
  LATEST_VERSION` exactly like relay (the manager imports the CHANGELOG export) — loaded via
  `<script type="module" src="js/changelog.js">`; KEEP the `export` keywords. It also sets
  `window.STUDIO_CHANGELOG = CHANGELOG` for the classic-script app shell. **CRITICAL — use relay's LITERAL
  style, NOT strict JSON:** the manager does NOT run the file; its `ingest.js` extracts the array as text and
  normalizes it with a single-quote-aware requoter, so **double-quoted JSON with raw apostrophes breaks it**
  (an apostrophe in "manager's"/"doesn't" gets read as a string delimiter). Each entry must be a JS object
  literal with **UNQUOTED keys and SINGLE-QUOTED strings, apostrophes escaped as `\'`** (double quotes inside
  stay raw), e.g.:
  `{ v: <INTEGER, +1 over top>, title: '…', kind: 'feature'|'polish'|'fix', ts: '<ISO-8601 UTC>', items: [ '…' ] }`.
  **HOW TO ADD AN ENTRY (do this exactly — the fleet's "push step" pattern, per games/relay):** prepend ONE
  entry at the TOP with **`ts: ''` (empty)** and rough content, then run **`node tools/changelog-normalize.js`**
  before committing. That script (1) stamps every empty `ts` with the REAL current UTC time from an
  **authoritative network source** (a live server's `Date` header — because these run containers have shown
  ~1-day clock skew, so `date -u`/`new Date()` are unreliable), (2) re-emits the WHOLE file in canonical
  single-quoted style (correct apostrophe escaping — no more parse breakage), and (3) self-verifies with the
  manager's EXACT parser, refusing to write (and telling you to remove a stray `//`) if it wouldn't sync. So
  you never hand-format quotes or timestamps. **Do NOT put the literal `//` in item text** (the manager strips
  line comments). The in-app footer + "What's new" sheet render `window.STUDIO_CHANGELOG`.
  **GUARD (belt-and-suspenders):** `tests/run.js` also runs the manager's EXACT parser against
  `js/changelog.js` (asserts it parses + yields every entry) — so even if you forget the normalizer, a
  breaking entry fails the suite before you commit.
- **CI / deploy — NEVER hard-gate the live deploy on the CI test suite.** `.github/workflows/deploy.yml`
  deploys the static site (concurrency group `pages`, cancel-in-progress). It has a **soft** `test` job with
  `continue-on-error: true`, and the `deploy` job **must NOT** `needs: test`. Reason (learned the hard way):
  a hard `needs: test` gate FROZE the live site for **~21 hours** — a flaky CI-only test (offline
  service-worker / PWA check → `catalogSize:0` on a cold runner, cascading into a FATAL) failed the test job,
  so deploy never ran and ~55 versions never went live. You already run the full suite **green before every
  merge** (SHIP PROTOCOL), so CI re-testing is redundant; keep it a visible signal only. If the CI test job is
  red, HARDEN the flaky test (the offline/SW test needs to await SW activation + tolerate cold-cache timing on
  the runner) — do not make it block deploys. Requires Settings → Pages → Source = "GitHub Actions".
  Since 2026-07-15 the fleet's **Guard main** pattern (`.github/workflows/auto-revert.yml`) is the safety
  net instead of a gate: on every push to main it runs a fast browser-free validation (syntax across
  first-party JS + the manager's exact changelog parser via `tools/changelog-check.js`) and, if main is
  broken, auto-reverts the offending commit and redeploys — self-healing beats gating.
- **License.** The Studio is proprietary — see `LICENSE` (© 2026 Polecat.live; all rights reserved).
  Keep the notice intact; don't add OSS license headers that contradict it. New first-party source
  files may carry a one-line header (`/* Analytics Dashboard Studio — © 2026 Polecat.live. See LICENSE. */`).
  Do NOT relicense or add notices to vendored third-party toolkit files.

## DONE
- v1: 3-pane builder (library · live-preview iframe · inspector); 67-CDA library; chart registry
  (bars/donut/line/stacked/treemap/scatter/gauge/heatmap/table/kpi); offline sample-data generator;
  exporters CDF .html / CDE .cdfde+.wcdf / .cda / bundle; 16 v2 CDE boards + flagship as examples;
  Playwright suite. CDE export matches v2 cde-*.cdfde 1:1.
- v2: drag-to-reorder (header grip) + drag-to-resize (right edge → span), live, postMessage-driven.
- v3: **cross-row drag** (insertion caret + cursor ghost + end-of-grid drop zone) and **inline
  rename** (double-click a panel title on the canvas).
- v4: **Undo/Redo** — snapshot history of settled spec states; ↶/↷ topbar buttons + Ctrl/Cmd-Z /
  Shift-Z (Y); ignores text-field edits.
- v5: **inline validation panel** (live Checks in the dashboard inspector — errors/warnings/info +
  "ready to export"), **KPI reorder** (↑/↓ parity with panels), **onboarding empty-state** (styled
  CTA on a blank/New dashboard).
- v6: **keyboard reorder/resize** — with a panel selected (builder focused): ↑/↓ reorder, Shift+←/→
  resize span; inspector hint added.
- v7: **builder dark mode** (theme toggle now themes the whole app + preview together, persisted) and
  **first-class export modal** (every export → modal with per-file size + copy-to-clipboard + download;
  bundle keeps Download-all).
- v8: **CLI exporter** `tools/export.js` + **`deploy.sh`** (generate .cda/.html/.cdfde/.wcdf from a
  .studio.json outside the browser, reusing app/exporters.js; `--all` exports every example) and
  **per-series color pickers** for line/stacked charts. Test suite now 36/36.

> **LOOP NOTE (env):** session-only cron does NOT survive container reclamation; a re-arm was needed
> after the gap. Crons only fire while a session is warm. Treat autonomous runs as best-effort; the
> STATUS backlog is the source of truth so any warm session can resume.

- v9: **visual chart gallery** — chart-type picker shows mini SVG thumbnails per type.
- v10: **deeper CDE round-trip** — treemap→cccTreemapChart, scatter→cccMetricDotChart,
  heatmap→cccHeatGridChart (real editable CCC components, no more bar-fallback/omit). Only gauge +
  table remain CDF-only. Test suite now 41/41.

- v11: **first-class filter builder** — filters now edit inline in the inspector (own selection kind,
  like panels/KPIs) with a **live options preview** (chips); helper-queries with no parsed alias fall
  back to the sample column so the value picker + preview always work. Test suite now 44/44.

- v12: **KPI extras** (delta indicator + sparkline column/color in the inspector; ✕ delete a KPI from
  the canvas) and **New ▾ → auto-build** a starter dashboard from any catalog query set (instant,
  editable: KPIs from a `kpi` da + a chart per chartable da, chart type inferred). Test suite now 51/51.

- v12: **KPI extras** (delta + sparkline; ✕ delete a KPI from the canvas) and **New ▾ → auto-build**
  a starter dashboard from any catalog query set.
- v13: **panel duplicate/delete** — hover ⧉/× actions on every canvas card + Duplicate/Delete buttons
  in the panel inspector.
- v14: **stacked-area chart** — new `areaStacked` type via a toolkit EXTENSION (`app/studio-charts.js`,
  keeps vendored pdc-ui.js a pristine v2 mirror); renders cumulative bands + hover tooltip in CDF and
  round-trips to CDE as `cccStackedAreaChart`. Exporters/CLI inline the extension. Test suite now 56/56.
  → 11 chart types; CDE covers 8 (bars/donut/line/stacked/areaStacked/treemap/scatter/heatmap).

- v15: **Pentaho server connections** — `app/pentaho.js`: Kettle `<slaveserver>` XML parse/serialize,
  `Studio.parseCDA` (CDA XML → catalog), `Studio.PentahoClient` (repo browse / getFile / doQuery /
  publishFile via standard Pentaho REST). Connections manager UI (⚙ Servers): CRUD, import/export
  Kettle XML, set active (persisted in localStorage). Active connection drives live preview;
  "Import sources…" pulls CDAs from the repo into the library; Export ▸ Push publishes all artifacts
  to the server. Offline-verifiable parts tested (62/62); **live network paths built but unverified
  here (no server)** — need reachable server + cookie/CORS auth.

- v16: **CDE import (round-trip edit)** — `Studio.parseCDE(.cdfde,.wcdf,cda)` rebuilds an editable
  studio spec (title/desc from wcdf, chart types reversed from CCC components, columns re-bound from
  the CDA, spans from the layout). Import modal now has Queries→library AND Dashboards→open&edit;
  "Open" pulls .cdfde+.cda+.wcdf and loads it. Verified by export→import round-trip. 65/65.

- v17: **combo (bar+line dual-axis)** chart [CDF-only] + **cascading filters** (parameterized filter
  options reload from upstream filter state, selection preserved) + **`tools/proxy.js`** dev proxy
  (serves Studio + forwards /pentaho/* → one origin, no CORS, cookie auth; preview iframe inherits it)
  so the user can test live against a local Pentaho. 13 chart types. Test suite 67/67.

- v18: **scheduling toolchain** — `tools/lib.js` (shared Node build, Node-safe Kettle parser),
  `tools/push.js` (build+publish via the publish API: --spec/--all/--dir, --server/--kettle/env auth,
  --deploy, **--interval** for scheduled deploy, **--dry-run**), `tools/schedule-job.js` (register a
  Pentaho /api/scheduler/job for run/email). export.js refactored onto lib.js. 70/70.

- v19: **CDF (.html) import** — `Studio.parseCDFHtml` recovers the full editable spec from any
  Studio-exported CDF (reads the embedded `window.STUDIO_SPEC` via brace-balanced scan). Open dialog
  now accepts `.html` as well as `.studio.json`. 71/71.

- v20: **polish** — duplicate/delete KPI from the inspector, **Ctrl/Cmd+D** duplicates the selected
  panel or KPI, combo gets a separate **line (right-axis) format**, and the filter inspector shows a
  **cascading hint** when its options query is parameterized. 75/75.

- v21: **publish + gate + welcome** — passcode gate (`app/gate.js`+`gate-config.js`, default code
  `pentaho-studio`, SHA-256 in config), first-run **welcome tour** (`app/welcome.js`, 5 steps, reopen
  via ⓘ Tour), `CNAME`, and the `PUBLISH.md` runbook (Pages + DNS + Cloudflare Access). 82/82.

- v22: **hosting model** (historical; superseded by the v60 standalone migration). The site originally
  published from a separate Pages repo via a mirror script; that indirection is gone now that this repo
  *is* the published site (GitHub Pages serves the repo root).

- v23: branding + access pass (gate, welcome, topbar, title, export footer). Gate now accepts a
  **list of access codes** (issue/revoke several); `tools/gen-code.js` hashes a code for
  `app/gate-config.js`. 84/84.

- v24: **resizable + collapsible side panels** (drag the handles; collapse to a labeled rail; widths/state persisted), **dark-mode fixes** (library cards & inputs no longer white; brighter accents), and the inspector list-row overlap fix.

- v25: **published live** (historical) with the v23–v24 changes via the old mirror-to-Pages-repo
  script. Superseded by the v60 migration — this repo now deploys directly through GitHub Pages with
  no mirror step.

- v26: **auto-publish CI** (historical — a separate-repo mirror workflow, superseded by the v60
  migration; this repo now auto-deploys from `main` via GitHub Pages).
  Plus **a11y keyboard focus rings** (`:focus-visible` outline themed via --pentaho; covered by a Tab
  test). 88/88.

- v27: **status-bar footer** pinned to the bottom with a “Last updated” build stamp + version, and a
  **collapsible Changelog** (newest revision first) opened from the footer. History lives in
  `js/changelog.js` (relocated from `app/changelog.js` in v195 — see the Changelog convention above; add new
  entries at the TOP with a REAL timestamp); the `__BUILD_TS__` token is legacy (no CI replaces it now), so
  the footer falls back to the latest entry's date. 91/91.
  NOTE: Playwright isn't installable on the author's Mac — the suite runs in the loop/CI, not locally;
  local validation here was node --check + a data/stamp sanity run.

- v28: **per-panel query peek** — “Query preview” section in the panel inspector shows the bound
  query's SQL snippet (truncated at 140 chars with Show/Collapse toggle), column headers, and 3
  offline sample rows in a compact scrollable table. Test suite now 95/95.

- v29: **lone `.cdfde` import** — `Studio.cdaFromCdfde` reconstructs an editable CDA (id, kind
  sql/mdx/mql/kettle/scripting/olap4j/xpath/compound, jndi/catalog, query, parameters, columns —
  declared `cdacolumns` or inferred from SQL `AS` aliases, calculated columns, cache) purely from a
  `.cdfde`'s embedded `datasources` section. `parseCDE(cdfde)` now works with NO `.wcdf`/`.cda`; the
  Open dialog accepts a bare `.cdfde` and renders it. (First step of the CDA-authoring track.)

- v30: **CI test gate** — the publish workflow now runs the Playwright suite in a `test` job that
  `publish` depends on, so a failing build (even an autonomous-loop commit) can never deploy to the
  live site. `tests/run.js` falls back to Playwright's own Chromium when the sandbox path is absent
  (CI install). Plus a standing **master access code** added to `app/gate-config.js` (hash only).

- v31: **data-source builder (CDA authoring — slice 1/8)** — “＋ New source” in the library opens a
  guided builder: visual **source-type cards** (SQL / MDX / Kettle / Metadata / Scripting), id + group +
  JNDI, a monospace query editor, **”Detect from query”** that reads `… AS alias` columns into editable
  chips (plus manual add), a parameters mini-editor, and a **live offline preview table** that updates
  as you type. Save writes the data source into the library (grouped); every card now has inline
  **✎ edit / 🗑 delete**. Authored sources are immediately usable by panels/KPIs and flow through the
  existing `.cda`/`.cdfde`/`.cdf` exporters. 100/100.

- v32: **CDA connections manager (slice 2/8)** — 7 named connection types (`sql.jndi`, `sql.jdbc`,
  `mondrian.jndi`, `olap4j`, `metadata`, `kettle.TransFromFile`, `scripting`) with type-specific fields
  in an editor modal. Dashboard inspector: “CDA Connections” section (＋/edit/delete); DA inspector:
  connection picker (shown when connections are defined). `exportCDA` now emits correct
  `<Connection type=…>` XML for all types + the right DA `type` attribute (sql/mdx/mql/kettle/scripting).
  `Studio.daAccessType`, `Studio.cdaConnectionXml` exposed for tooling. Test suite 119/119.

- v33: **per-kind query editors (slice 3/8)** — the data source builder and DA inspector now show
  type-aware query controls: SQL keeps textarea + detect; MDX adds catalog path; Kettle shows .ktr path
  + step name (no textarea); Metadata adds Domain ID; Scripting adds language selector. `exportCDA` emits
  `<KtrFile>/<Step>` for kettle DAs and `<Language>/<InitScript/>/<QueryScript>` for scripting DAs
  (previously all kinds emitted `<Query>`). Test suite 127/127.

- v34: **assisted column + parameter tooling (slice 4/8)** — calculated columns UI in both builder
  modal and DA inspector (name + formula `=[col1]+[col2]` + type picker); `exportCDA` now emits a proper
  `<CalculatedColumns>` block (or `<CalculatedColumns/>` when empty). Parameter type dropdown added to
  the DA inspector (was missing — builder already had it). `Studio.COLUMN_TYPES` constant (String /
  Integer / Numeric / Date / Boolean) shared across builder, inspector, and model. Test suite 134/134.

- v35: **joins / compound data access (slice 5/8)** — `⧈ Join` button in the library opens a guided
  builder for Pentaho CDA `<CompoundDataAccess>`: join (pick left/right DA + key columns) or union
  (stack rows from N DAs). `exportCDA` emits correct `<CompoundDataAccess type=”join|union”>` XML;
  `parseCDA` round-trips both kinds. Compound DA inspector shows join keys / union members inline.
  Test suite 146/146.

- v36: **output options (slice 6/8)** — “Output options” section in the DA inspector: filter rules
  (column + operator + value; 8 operators including text `contains`/`startsWith`), sort rules (column +
  direction), and a row limit. All rules applied client-side to offline sample data in preview and
  live-preview iframe; `exportCDA` emits an `<OutputOptions>` block (Filter/SortBy/RowLimit) for
  server-side post-processing where CDA supports it. `Studio.applyOutputOptions`, `Studio.DA_OPS`,
  `Studio.newOutputFilter`, `Studio.newOutputSort` exposed. Test suite 163/163.

- v37: **sophisticated DA preview (slice 7/8)** + **icon registry (I1)** —
  DA inspector: “Data preview” section auto-runs sample on open; parameter inputs (pre-filled from defaults); paginated table (10 rows/page, ‹/› nav); column type badges (String/Numeric/Date inferred from name + sample values); row+col status line; Copy-as-TSV button (whole result); optional “▶ Run live” button (doQuery via active server, graceful fallback).
  New `app/icons.js`: `Studio.icon(name[,size])` helper returns inline `<svg>` with `stroke:currentColor`, `fill:none`, 1.5px stroke, 24-box viewBox — 26 icons covering the full app vocabulary. Groundwork for I2+ adoption. Test suite 188/188.

- v38: **`.cda` round-trip parity (slice 8/8, CDA track complete)** — `parseCDA` now handles all 7 connection types (sql.jndi, sql.jdbc, mondrian.jndi, olap4j, metadata, kettle.TransFromFile, scripting) with type-specific fields; maps DA `type` attribute → `DA_KINDS` id (sql→sql.jndi, mdx→mondrian.jndi, mql→metadata, etc.); parses Kettle ktrPath/ktrStep, Scripting scriptLang/script body, CalculatedColumns, and OutputOptions (filter/sort/limit with operator reversal). Returns `connections[]` (full typed array); `parseCDE` propagates it into the spec for multi-connection imports. Each DA carries `connectionId`. Test suite 203/203 (15 new checks).

- v39: **responsive shell (M1)** — real breakpoints (≤900px tablet, ≤640px phone) replacing the stale 1100px @media rule. At ≤900px the topbar collapses secondary actions (Tour / Servers / Live / Theme) into a ⋯ More dropdown menu; brand + primary actions always visible. At ≤640px dash-id is hidden, brand tightened. The 3-pane workspace scrolls horizontally at tablet width. Test suite 208/208 (5 new phone-viewport checks).
- v40: **mobile drawers (M2)** — at ≤640px, Query Library and Inspector become slide-in off-canvas drawers; a bottom tab bar (Library · Canvas · Inspector) drives navigation; translucent scrim appears/closes on tap; viewport resize from phone→desktop auto-resets state. Test suite 220/220 (12 new checks).
- v41: **icon adoption across chrome (I2)** — all builder chrome now uses `Studio.icon()` SVG: delBtn, moveBtn (chevrons), section add (+), myDACard dup/del, daCard edit/del, DS_TYPES source-type cards (sql→db, mdx→cube, kettle→gear, mql→metadata, scripting→code), topbar undo/redo. Two new icons added (code, metadata). CSS flex-centering for .icobtn/.add/.da-act/.dsb-type .ic. Dark mode works for free. Test suite 231/231 (11 new I2 checks).
- v42: **icon adoption in canvas + modals (I3)** — completes the SVG icon sweep. Canvas sr-act panel buttons (⧉/×) replaced via `iSvg()` local helper in the iframe scope. KPI tile delete → SVG. Modal close → SVG (CSS updated to inline-flex). Toast → SVG check/warn + flex alignment. All secondary topbar buttons (Theme/Servers/Live/Tour) → setIconBtn() SVG. Inspector dup/del btn-wide → SVG duplicate/trash. DA preview buttons, pagination, chip/param/calc-col remove, addP/addCC/New/Join all → SVG. flashBtn() saves innerHTML (not textContent). `window.__fireToast` test hook added. Test suite 243/243 (12 new I3 checks).

- v43: **touch interactions + mobile modals (M3/M4)** — `setPointerCapture` + `pointercancel` on reorder/resize drag handlers for reliable touch tracking; `touch-action:none` on panel h3 + `.sr-resize` + `.resizer` to prevent scroll hijacking; ≥36/40px tap targets for `.da-act`/`.chip` at ≤640px; `.da-acts` always visible on mobile. Modals become bottom-sheet style on phone (full-width, anchored bottom, round top corners); `.modal-h` is `sticky`; `.dsb-foot` sticky at scroll-bottom; all modal inputs force `font-size:16px` (no iOS zoom); DS type cards stack 1-col. Test suite 252/252 (9 new M3/M4 checks).
- v44: **responsive exported dashboards (M5)** — `buildHtml` injects a `@media(max-width:640px)` block into every CDF export and preview iframe: header `flex-wrap:wrap`, subtitle hidden, `pdc-wrap` padding reduced, KPI gap reduced, brand font/logo scaled down. Chart grid was already 1-col at ≤720px via pdc-ui.css. SVGs use `width:100%` + `PDC.redrawAll` on window resize. Test suite 258/258 (6 new M5 checks).
- v45: **touch polish (M6)** — momentum scroll (`-webkit-overflow-scrolling:touch` + `overscroll-behavior:contain`) on all scrollable regions; `:active` states for touch devices mirror hover; inspector fonts bumped at ≤640px (heading 12.5px, labels 12px, row titles 13.5px); `overflow-x:hidden` on topbar/panes at phone width. Test suite 263/263 (5 new M6 checks).
- v46: **icon polish + a11y (I4)** — exported CDF HTML: `aria-label` added to `#qInfoBtn` and `#themeBtn`; `studio-render.js` boot now sets theme button to SVG moon/sun + dynamic `aria-label` instead of `☾`/`☀` unicode. Test suite 266/266 (3 new I4 checks).
- v47: **search highlighting + keyboard shortcuts modal** — library search wraps matches in `<mark class="hl">` (gold/amber per theme); `?` key + More ▸ "Keyboard shortcuts" opens a modal listing all shortcuts with `<kbd>` chips; `Escape` now closes any modal globally. Test suite 274/274 (8 new checks).

- v48: **focus trap + auto-save + Ctrl+S** — modals now trap Tab focus (first element auto-focused on open; Tab/Shift+Tab cycles within modal, WCAG 2.1 SC 2.1.2); auto-save writes spec to `localStorage` after each user edit (1.5 s debounce), shows a "Restore unsaved work?" banner on next session; Ctrl/Cmd+S downloads the spec (listed in shortcuts modal). Test suite 278/278 (4 new checks).

- v49: **restore-banner detail + export history (E1/E2)** — restore banner now shows panel/KPI/filter counts so user can decide without restoring; boot-time example load no longer clears autosave; Export menu shows last-5 "Recent exports" (format · name · time-ago, persisted in localStorage). 287/287.
- v50: **deep-link filter parameters (E4)** — URL hash `#filterId=value` pairs pre-select filters in exported CDF dashboards; `studio-render.js` patches `PDC.urlParams` to include hash params (lower priority than query string); dashboard inspector shows a "Shareable link" section with current filter defaults as a hash string + "Copy filter hash" button. **Changelog search (E6)** — live search input in the changelog popup filters entries dynamically with `<mark>` highlighting; `.cl-empty` no-match state. Test suite 296/296.

- v52: **radar / spider chart (F3, track F kickoff)** — new CDF-only chart type selectable in the gallery; concentric rings + labelled spokes + per-series polygons + vertex hover tooltips + legend + optional fill; theme-aware and animated (respects reduced-motion). model.js registry + studio-render dispatch + studio-charts.js renderer + gallery thumbnail + 2 Playwright checks. Test suite 309/309.
- v53: **sign out + clear local data (E8)** — "Sign out" and "Clear local data…" in ⋯ More menu; Sign out clears gate session flag + reloads; Clear local data confirms + wipes all Studio localStorage keys (autosave, export-history, theme, pane widths, connections, layout) + reloads. 5 new E8 tests. Test suite 314/314.
- v54: **waterfall chart (F4)** — CDF-only floating-bar chart: positive deltas green, negative red, optional Total bar in brand blue; dashed connectors; zero baseline when values straddle zero; hover tooltips (delta + running total); animation. Gallery thumbnail + 2 new F4 tests. Test suite 316/316.
- v55: **Sankey (F1) + Chord (F2)** — promotes existing PDC toolkit primitives to first-class chart types. Sankey: source→target ribbons scaled by value, hover shows value+%, Inspector options (srcCap/dstCap/fmt/height). Chord: circular arc diagram, hover highlights connections. Both CDF-only, same sourceCol/targetCol/valueCol binding, gallery SVG thumbnails, inspector labels, newPanel auto-mapping. Test suite 320/320 (4 new checks).
- v56: **Funnel chart (F5)** — stage-to-stage conversion visualization. Centred bars shrink by value; hover tooltips show value + conversion %; optional "Show conversion %" inspector toggle adds dim % annotations. PDC.funnel extension in studio-charts.js (pdc-ui.js pristine). Gallery thumbnail, registry, newPanel auto-map (labelCol/valueCol). Test suite 322/322 (2 new F5 checks).
- v57: **Sunburst chart (F6)** — hierarchical part-of-whole visualization (pairs with Treemap). Single-ring mode: arcs proportional to value + center total label. Two-ring mode: when a groupCol is bound, inner ring = groups (aggregate totals), outer ring = items within each group — hierarchy immediately visible. Hover tooltips (label + value + % of total); arc labels in wide arcs; animation. PDC.sunburst extension (pdc-ui.js pristine). Gallery SVG thumbnail. Test suite 325/325 (3 new F6 checks).
- v59: **legend toggles (F8)** — clickable legend chips for `areaStacked`, `combo`, and `radar`: click a chip to hide/show that series (0.22s fade; chip dims to 35%); click again to restore. `_toggleLegend` helper in studio-charts.js (pdc-ui.js pristine). Test suite 334/334 (4 new F8 checks).
- v58: **Bullet chart (F7a) + Calendar heatmap (F7b)** — two new CDF-only visual types. Bullet: KPI-vs-target track with red/amber/green quality-zone bands, animated actual bar, thick target tick, hover tooltip. CalHeatmap: GitHub-style day-grid density (weeks × Mon–Sun); cell opacity scaled to value; month labels; YYYY-MM-DD date column required; sampledata.js upgraded to produce isodate strings for `date`/`_date`/`_at` columns. Both: gallery SVG thumbnails, newPanel auto-map, model registry. Test suite 330/330 (5 new checks).
- v51: **examples gallery card grid (E5)** — Examples menu upgraded from a flat button list to a 2-column visual card gallery. Each example card shows a track badge (blue CDF / amber CDE), chart-type chips, bold title, and panel+KPI count. Featured CDF showcase gets its own section. Menu auto-widens; 1-column on phones. **Changelog time stamps (E7)** — changelog entries with an optional `time` field now show `date · HH:MM UTC` in the popout; entries without a time field still show date only. `index.json` enriched with `track`, `panels`, `kpis`, `types` metadata per example. Test suite 307/307 (11 new checks).
- v61: **SQL Builder — JOINs, GROUP BY, and aggregate expressions (G1b/G1c)** — SQL Builder accordion gains a JOIN section (type LEFT/INNER/RIGHT/FULL OUTER + table + ON condition; stackable), an AGG section (SUM/COUNT/AVG/MAX/MIN/COUNT DISTINCT + column + alias), and GROUP BY column chips. All sections integrate into the single "Generate SQL ▶" flow. Test suite 346/346 (7 new checks).
- v62: **Dashboard thumbnails (E3)** — `Studio.makeThumbnail(spec, theme)` in `app/model.js`: pure-SVG layout preview (240×140, no DOM/canvas) — header strip + KPI row + panel grid with per-chart-type accent colors; light/dark theme aware. Inspector shows thumbnail at dashboard level (auto-updates). Examples gallery cards get a mini layout thumbnail from index.json metadata (no spec load needed, CSS-var dark/light). Test suite 352/352 (6 new E3 checks).
- v63: **H-track UX refinement** — **collapsible inspector sections** (every `.insp-sec` section header is clickable to collapse/expand; SVG chevron indicator; `.sec-collapsed` class; state persists in `_collapsedSects` across `renderInspector()` re-renders) and **DA usage badges** (each authored DA card shows "Used in N panels · M KPIs" when referenced, helping identify active vs. orphaned sources). Test suite 357/357 (5 new H checks).
- v64: **Network / topology chart (F9)** — `PDC.network` promoted to a first-class chart type: radial node-link diagram, node size ∝ total flow volume, blast-radius highlight on hover (dims unrelated nodes/edges). Same sourceCol/targetCol/valueCol binding as Sankey/Chord. Gallery SVG thumbnail. **Panel drill-through (I-track)** — new "Drill-through" inspector section on every panel; set a Target URL + URL parameter name; clicking a bar or donut slice navigates to that URL with the clicked label as the parameter value, using `PDC.drill` (carries all active filter state). 15 chart types total. Test suite 362/362 (5 new checks).

- v65: **Detail drawer (I-track v2)** — new "Detail drawer" inspector section on every panel, complementing Drill-through. Powered by `PDC.openDetail`/`PDC.bindDetail` already in the vendored toolkit (same pattern as iteration/v2 lab). Configure: Detail DA, filter parameter (receives clicked label), title prefix, noun. Clicking a bar, donut slice, treemap tile, or table row opens a slide-in record drawer: queries the detail DA with the clicked label, shows a searchable table of rows (up to 2000), row-count badge, Escape/overlay-click to close. Works offline (sample data) and live (real CDA). `buildDetailCfg(p)` helper in studio-render.js; wired into PDC.bars, PDC.donut, PDC.treemap, PDC.table. Test suite 367/367 (5 new checks).

- v66: **H-track grouped chart gallery** — chart-type picker in panel inspector now groups 15 types under category headers (Comparison, Composition, Trend, Flow, Single value, Distribution, Detail). Group labels (`.cg-label`) span the full 3-column grid via `grid-column:1/-1`, styled as quiet 9px uppercase micro-text. Chart card tooltips show "Label (Group)" for extra context. Groups are derived dynamically from `Studio.CHARTS[t].group` so adding new types auto-categorizes. Test suite 369/369 (2 new H-track checks).

- v67: **Cross-filter — coordinated chart views (F8 remaining)** — clicking a bar, donut slice, or treemap tile broadcasts a named parameter to all other panels whose DA declares a matching parameter. Elements dim to 18% when not selected; click same element to clear. `_crossFilters` module-level state in studio-render.js; `paramsFor` checks cross-filters before filter-bar state. Inspector: "Cross-filter" section with "Emit as parameter" input. Works in preview and exported CDF. Test suite 374/374 (5 new F8 checks).

- v68: **H2 keyboard shortcuts polish + smart chart-type on library drop** — Delete/Backspace deletes selected panel or KPI; Escape deselects and returns to dashboard inspector; drag-drop from library infers chart type via chartForDA() instead of always defaulting to bars. Shortcuts panel (?) updated to list new Delete and Escape shortcuts. Test suite 377/377 (3 new H2 checks).

- v69: **G2 visual Kettle / PDI transform builder** — KTR Builder accordion in the Kettle DA editor (alongside existing .ktr path + step name fields). Pipeline form covers Table Input (FROM + JNDI + WHERE conditions), Select Values (column chips; blank = SELECT *), and configurable Output step. A step-flow diagram shows the three-step pipeline. Generate .ktr produces well-formed PDI XML with proper &lt;step&gt; nodes and &lt;hop&gt; wiring; SelectValues step only emitted when columns are specified. Download .ktr button saves the file. Test suite 382/382 (5 new G2 checks).
- v70: **G3: import existing .ktr — step picker** — "Import .ktr…" file button in the Kettle DA editor: select a local .ktr file → parsed in-browser (no upload) → all step names appear as clickable chips → click a chip to set it as the DA's output step in one click. `Studio.parseKtr(xmlStr)` in model.js (extracts transform name + step list from any .ktr; block-level parsing for accuracy). Auto-fills ktrPath if blank. Works alongside the v69 KTR Builder accordion. 5 new G3 tests. Test suite 387/387.
- v71: **H-track: Focus mode** — "Focus mode" in the ⋯ More menu collapses the Query Library and Inspector panes so the preview fills the full workspace. Perfect for SE demos: show the live dashboard to stakeholders without builder chrome. Exit via the frosted "Exit Focus" pill (bottom-right corner) or press Escape. Keyboard shortcuts modal updated. 5 new H71 tests. Test suite 392/392.
- v72: **F-track: Rich text annotation panels + Box plot chart** — two new panel types. Rich text: '¶ Text' button on the canvas bar adds a text panel; Markdown-subset content authored in the inspector textarea (# headings, **bold**, *italic*, `code`, lists, hr); mdToHtml() renders in both preview and exported CDF; no DA binding; inspector returns early skipping DA/options sections; richtextCss constant in exporters ensures styles travel in all builds. Box plot (Distribution): groups rows by labelCol, computes five-number summaries (min/Q1/median/Q3/max) per category via PDC.boxplot extension in studio-charts.js; horizontal by default; hover tooltip shows all five stats; gallery SVG thumbnails for both types. 6 new tests. Test suite 398/398.
- v73: **F10: Lollipop chart + H-track: panel section headers** — Lollipop chart (F10, Comparison group): horizontal dot-on-stem chart as a cleaner alternative to bar charts; bind labelCol + valueCol; dot color token, height, and value-format options; animated entrance; hover tooltips; CDF-only. Panel section headers (H-track): new "Section header" inspector field lets consecutive panels be grouped under a labeled row divider (.pdc-sec-hdr); visible in preview and exported CDF HTML; sectionCss constant in exporters.js; all existing dashboards unaffected (blank section = no divider). 7 new tests. Test suite 405/405.
- v74: **F11: Slope chart + H-track: smart panel titles + dashboard description bar** — Slope chart (F11, Trend group): before/after comparison with one sloping line per category connecting T1 to T2; risers green, fallers red; endpoint value annotations; configurable T1/T2 labels; animation; PDC.slope extension in studio-charts.js (pdc-ui.js pristine). Smart default panel titles: strips leading `da_`/`kpi_`/`query_`/`chart_`/`data_` prefix from DA id and appends chart type label ("Monthly Revenue · Line chart" instead of "Da Monthly Revenue"). Dashboard description bar: `spec.description` renders as a styled left-accented band below KPI tiles in both preview and exported CDF HTML; omitted when blank. 8 new tests. Test suite 413/413.

- v76: **F13: Beeswarm / strip plot + H-track: per-panel accent color** — Beeswarm plot (F13, Distribution group): CDF-only individual data points jittered along a horizontal axis (deterministic center-out packing); optional `categoryCol` groups into labeled horizontal strips for distribution comparison. PDC.beeswarm extension in studio-charts.js (pdc-ui.js pristine); gallery SVG thumbnail; model registry. Per-panel accent color (H-track): new 'Panel accent' color picker in the panel inspector; sets a colored left border (`.pdc-accent-panel` + `--pap-color` CSS variable) in preview and exported CDF HTML; `panelAccentCss` constant in exporters. 9 new tests. Test suite 430/430. 18 chart types total.
- v82: **F14: Histogram / frequency distribution chart** — new `histogram` type in the Distribution group; `PDC.histogram` extension in studio-charts.js auto-bins a numeric `valueCol` into N equal-width buckets (configurable bin count, default 10); bars touch (no gap); hover tooltips show bin range + count; x-axis labels from bin boundaries; column name shown as caption; CDF-only. Gallery SVG thumbnail. 3 new tests. Test suite 456/456.
- v83: **H-track: conditional formatting** — "Conditional formatting" section in every panel inspector; threshold rules (>=/>/<=/</=/!=, numeric value, color picker); rules apply top-to-bottom, first match wins; applies to bars, donut slices, treemap tiles, and lollipop dots via `cfData()`/`evalCondFmt()` helpers in studio-render.js (pdc-ui.js pristine); "Add rule" cycles green→amber→red for instant traffic-light setup; rules travel in `p.condFmt` through Open/Import/auto-save/undo-redo/CDF export. Test suite 461/461.
- v84: **H-track: callout arrow annotation** — "Callout arrow" section in every panel inspector: text label + X/Y sliders for the tip position + color picker + Clear; absolute SVG overlay (dashed leader line + filled arrowhead + colored text bubble) rendered by `studio-render.js` via PDC._reg; works on any chart type; `calloutCss` constant in exporters.js; `p.callout` travels in spec. Test suite 464/464.
- v85: **H-track: color scale / gradient encoding** — "Color scale" section in every panel inspector; two color pickers + live gradient swatch strip; maps continuous value range to smooth gradient across bars, donut slices, treemap tiles, and lollipop dots; condFmt rules override gradient for specific items; `hexInterp` + `csData` in studio-render.js (pdc-ui.js pristine); `p.colorScale` ({enabled, low, high}) travels in spec. Test suite 469/469.
- v86: **F15: Polar area (rose) chart + H-track: Period highlight** — new `polarArea` chart type (20th total, Composition group): equal-angle wedges, area ∝ √value, per-category palette, concentric guide rings, centre total label, arc labels toggle, animated entrance, hover tooltips; PDC.polarArea extension (pdc-ui.js pristine); gallery thumbnail. **Period highlight**: type-aware inspector section (shown for line/areaStacked/combo/stacked/bars only); semi-transparent vertical x-range band (label + Left/Right edge % sliders + color + Clear); `p.periodHighlight` ({label,xStart,xEnd,color}) in spec; `.pdc-period` + `.pdc-period-label` CSS in exporters.js; same defer+PDC._reg pattern. Test suite 476/476.

- v87: **H-track: event markers + scatter point annotations** — **Event markers**: type-aware "Event markers" inspector section for line/areaStacked/combo/stacked/bars charts; add multiple named vertical dashed tick lines at x% positions (`p.eventMarkers = [{label, xPct, color}]`); `.pdc-event-mark` CSS in exporters.js; same defer+PDC._reg pattern. Perfect for "Product launch", "Incident", "Campaign start" annotations that complement period highlights. **Scatter point annotations**: type-aware "Point annotations" inspector section for scatter charts only; add multiple text labels at visual (x%, y%) positions (`p.scatterAnnotations = [{text, xPct, yPct, color}]`); renders as colored dot + bordered text box; `.pdc-pt-annot` CSS in exporters.js. Both travel in spec through Open/Import/auto-save/undo-redo/CDF export. Test suite 484/484 (8 new checks).
- v89: **H-track: inspector section collapsed hints** — every collapsible panel inspector section shows a compact inline hint when collapsed so builders can see the current config at a glance. `section()` 4th-param `summaryFn` callback; `.sec-hint` span appended to h4 (hidden via CSS when expanded). Hint strings: Target line / Reference band / Period highlight → label in quotes or 'defined'; Callout arrow → text in quotes; Event markers → N marker(s); Point annotations → N annotation(s); Conditional formatting → N rule(s); Color scale → 'gradient enabled'; Drill-through → URL preview; Detail drawer → DA id; Cross-filter → emit param name. Test suite 493/493 (4 new checks).
- v92: **K2 + K3** — topbar **Simple mode badge** (pill indicator, CSS-only); dashboard inspector **welcome note** (.simple-welcome card with one-click "Switch to Advanced" link, rendered by renderDashboardInspector() when S.simpleMode is true); **streamlined library** (K3): four CSS rules hide `#btnNewDS`, `.mine-add`, `.da-mine-acts`, and `.da-acts` in Simple mode — library becomes read-only browse + drag-to-canvas. 5 new checks. Test suite 507/507.
- v91: **K-track: Simple mode** — "Simple mode" toggle in ⋯ More menu hides all advanced inspector sections (Drill-through, Detail drawer, Cross-filter, Target line, Reference band, Callout arrow, Period highlight, Event markers, Point annotations, Conditional formatting, Color scale, KPI Compare-to) and restricts the chart gallery to the 13 most universally understood types (bars, donut, line, stacked, area-stacked, combo, treemap, scatter, gauge, heatmap, table, KPI, rich text). `advSection()` helper tags outer `.insp-sec` with `.adv-sect`; `SIMPLE_CHART_TYPES` map tags `.adv-chart` in the gallery; CSS body.simple-mode selectors control visibility; state persists in localStorage. 5 new v91 checks. Test suite 502/502.
- v90: **H-track: KPI comparison mode** — "Compare to" section in every KPI inspector: Compare column picker (second numeric column from same DA), Display-as selector (% change / absolute delta / compare value), and Compare label text. Auto-computes delta direction (▲/▼) from the sign of current minus compare. Collapsed section shows compare column as hint. compareCol/compareMode/compareLabel travel in spec through Open/Import/auto-save/undo-redo/CDF export. 4 new v90 checks. Test suite 497/497.
- v88: **M7/M8: narrow-phone topbar accessibility + non-blocking restore banner** — M7: at ≤400px viewport, Examples/Open/Save move from the topbar into the ⋯ More menu as phone-only items; primary actions (Undo/Redo/New▾/Export▾/⋯More) remain; all topbar buttons ≥44px touch target; Examples menu uses fixed-position phone-pos overlay when opened from More. M8: restore banner gains `--mob-tabs-h` CSS variable (0px desktop / 52px phone); at ≤640px, banner is full-width, text wraps, and sits above the mobile tab bar with safe clearance. Test suite 489/489 (5 new checks).
- v81: **H-track: reference band annotation** — extends v80's annotation system with a shaded semi-transparent range overlay between two vertical % positions; "Reference band" section in every panel inspector (label + top%/bottom% sliders + fill color + Clear); `.pdc-ref-band` div with rgba fill + dashed borders + `.pdc-ref-label` in preview and exported CDF; `refBandCss` in exporters.js; same `setTimeout(0)` + `PDC._reg.push` pattern. 3 new tests. Test suite 453/453.
- v80: **H-track: chart annotation target lines** — "Target line" section in every panel inspector: label + position slider (0-100% from chart body top) + color picker; `.pdc-target-line` overlay in preview and exported CDF; CSS in `targetLineCss` constant in exporters.js; `setTimeout(0)` + `PDC._reg.push` pattern for reliable rendering after any chart type. 3 new tests. Test suite 450/450.
- v79: **H-track: panel tagging / grouping** — "Tags" field in the panel inspector (comma-separated → `p.tags` array); tag filter bar above the Panels list in the dashboard inspector (chips for all unique tags + "All"; click to filter/dim non-matching panels); per-panel tag chips shown inline on panel row items (click to toggle filter). `Studio.allTags(spec)` helper in model.js. 5 new tests. Test suite 447/447.
- v78: **H-track: per-panel animated chart entrance controls** — 'Animation' section in every panel inspector: "Animate entrance" toggle (default on) + "Duration (ms)" range slider (100–2000 ms, default 600 ms, step 50). studio-render.js sets PDC._anim / PDC._animD before each chart call; `canAnim()` + `animD(base)` helpers in studio-charts.js replace all `!RM` checks across all ten animation blocks. pdc-ui.js pristine; values travel in spec (p.animate, p.animDuration). 5 new tests. Test suite 442/442.
- v77: **H-track: KPI sparkline types + Inspector search** — KPI inspector 'Trend & delta' section now has a 'Sparkline type' picker (Line / Bar / Area); bar uses mini vertical bars, area uses a filled polygon beneath the trend line; `PDC.sparkSvgBar`/`PDC.sparkSvgArea` extensions in studio-charts.js (pdc-ui.js pristine); travels in `k.sparkType`, reproduced in exported CDF. Inspector search: persistent `.insp-search` input at top of inspector filters sections by visible text; query survives re-renders via `_inspSearch`; keydown stopPropagation prevents global shortcut conflicts. 7 new tests. Test suite 437/437.
- v75: **F12: Dot plot + H-track: panel-level notes / annotations** — Dot plot / Cleveland dot plot (F12, Distribution group): CDF-only pure-dots chart; sorted by value descending; optional `groupCol` adds a second dot per row for two-group comparison (e.g. budget vs actual) with a connector. PDC.dotplot extension in studio-charts.js (pdc-ui.js pristine); gallery SVG thumbnail; model registry. Panel-level notes (H-track): new "Note (visible)" single-line field in the panel inspector; renders as `.pdc-panel-note` italic annotation below the card title in preview and exported CDF HTML; `panelNoteCss` constant in exporters. 8 new tests. Test suite 421/421.

- v93: **K4 smart chart defaults in Simple mode** — `chartForDA()` enhanced with Simple-mode-aware heuristics: single numeric column → gauge, multiple numeric columns → line, time-series preserved, Advanced mode unchanged. `window.__chartForDA` test hook exposed. **K5 Simple mode DA inspector** — "Calculated columns" and "Output options" sections use `advSection()` and are hidden in Simple mode (essentials-only: ID/kind/query/columns/params/cache/preview). Test suite 514/514.
- v109: **M9–M12 mobile polish** — `html{overflow-x:hidden}` seals horizontal-scroll root (M9); Examples/Open/Save hidden from topbar at ≤640 px (all phones, not just ≤400 px) while staying accessible via ⋯ More (M10); restore-banner dismiss button renamed "No thanks" + tap-friendly 44 px height at phone (M11); changelog popup constrained to `min(96vw,380px)` + status bar tightened at phone (M12). Test suite 605/605.
- v110: **F23: Gantt / Timeline chart (30th chart type)** — horizontal floating-bar chart; labelCol/startCol/endCol binding; bars colored per-row via PDC.color(); hover tooltips (label + start + end + duration); animated entrance (bars scale in staggered); gallery SVG thumbnail; PDC.gantt extension in studio-charts.js (pdc-ui.js pristine). **H-track: persist inspector collapse state** — `_collapsedSects` now loaded from and saved to `localStorage["studio-insp-collapsed"]` on each toggle, so preferred inspector section expand/collapse survives page reloads. Included in Clear local data wipe. Test suite 611/611.
- v96: **H-track: canvas empty-state overlay** — dashed-circle + icon + headline + instruction + "Open library" button centred on the canvas when 0 panels + 0 KPIs; preview dimmed to 20% opacity; opens library drawer (phone) or focuses library search (desktop); toggled via `canvas-empty` CSS class in `doRefresh()`. 4 new H-CES tests. Test suite 531/531.
- v97: **K8: "What's next?" card + J-track slice 1: help docs page** — K8: dismissible next-steps card in Simple mode dashboard inspector when ≥1 panel exists; 3 actionable tips (configure chart / add panels / export) + docs link + "Got it ×" dismiss button (localStorage-persisted). J-track: `docs/index.html` self-contained Pentaho-style reference guide (getting started, chart types 20-entry grid, data sources, exporting table, keyboard shortcuts, Simple vs Advanced mode); sticky nav with active section highlighting; 'Help docs ⓘ' entry in ⋯ More menu; K8 card links to it. Test suite 539/539 (8 new checks).
- v95: **K7: Getting started checklist** — in Simple mode with 0 panels + 0 KPIs, a 3-step card appears at the top of the dashboard inspector: (1) Library ready [auto-checked], (2) Add a panel [CTA with "Open library" button], (3) Export your dashboard [end goal]. Disappears once ≥1 panel or KPI added. Never shown in Advanced mode. 5 new K7 tests. Test suite 527/527.
- v94: **K6: Guided panel setup in Simple mode** — `missingRequiredCols()` + `autoPickCols()` helpers; three-state guided card in the panel inspector Data section (no DA / 0-column DA / columns available); Auto-pick button assigns best-effort columns via name heuristics. **H-track: "Edit data source →"** jump link in the panel inspector (Advanced mode only, below the Query picker) — one click from a panel straight to its DA inspector. `__studioSelect` + `__studioRenderInspector` test hooks added. Test suite 522/522.

- v115: **F27: Candlestick / OHLC chart (40th type) + J-track: docs updated to 40 chart types** — Candlestick (Trend group, CDF-only): OHLC four-column binding (labelCol/openCol/highCol/lowCol/closeCol); green bullish bodies (close≥open) and red bearish bodies; wicks to high/low; y-axis grid + labels; hover tooltips (O/H/L/C + ▲/▼); animated entrance; Up/Down color pickers; PDC.candlestick in studio-charts.js (pdc-ui.js pristine); CHART_SVG and model.js thumb; autoPickCols and _lmap updated for OHLC columns. J-track: docs/index.html chart types section updated from 29 → 40 types — added 11 missing types (dumbbell, marimekko, divergingBar, parallelCoords, packedBubble, wordCloud, step, bump, streamgraph, candlestick, violin) each in the correct group with CDF badge and anchor id. Test suite 634/634.
- v114: **F26: Parallel coordinates chart (33rd type) + H-track: KPI subtitle text** — Parallel coordinates (Comparison group, CDF-only): multi-dimensional entity profiles across N vertical axes; each row = a polyline crossing every axis; axis min/max per-column; dot markers for ≤12 entities; hover highlights one polyline and dims all others; animated entrance; inspector options: Line opacity (%) + Height (px); PDC.parallelCoords in studio-charts.js (pdc-ui.js pristine); gallery SVG thumbnail. KPI subtitle (H-track): optional italic muted subline below each KPI value; 'Subtitle text' field in KPI inspector; k.subtitle post-processed into .kpi-sub div after PDC.kpis(); kpiSubCss in exporters.js; Studio.newKpi initializes subtitle to ''. 5 new checks. Test suite 631/631.
- v113: **H-track: interactive table chart** — live row-search filter bar (`.tbl-filter` + row-count badge `.tbl-cnt`; case-insensitive across all columns; keydown trapped); click-to-sort column headers (`.sortable-th`; ↑/↓/↕ indicator; 3-click cycle: ASC → DESC → none; numeric and text sort); alternating row stripes (`.tbl-stripe`). PDC.table overridden in studio-charts.js (pdc-ui.js pristine); original saved as PDC._tableBase; all existing cfg options (bar cells, badges, detail drawer, recordDetail) continue working — row-click uses visible-row index so sort+filter are respected. CSS injected via guarded style tag (iframe + exported CDF). 5 new H113 checks. Test suite 626/626.
- v112: **F25: Stream graph (32nd chart type) + H-track: gallery text search** — ThemeRiver stream graph (Trend group, CDF-only): same labelCol+series binding as areaStacked; baseline shifts to visually centre the stack → organic flowing ribbons; cardinal-spline smoothing; clickable toggle legend; staggered entrance animation; hover tooltip. Gallery text search: `.cg-search` input above group tabs in chart picker — filters by label+description; group headers suppressed during search; SVG × clear; keydown guard. 6 new checks. Test suite 621/621. 32 chart types total.
- v111: **F24: Diverging bar chart (31st chart type)** — horizontal bars extending right (positive, brand blue) or left (negative, accent red) from a shared zero baseline; perfect for budget variance, QoQ growth, sentiment scores; `PDC.divergingBar` extension in studio-charts.js (pdc-ui.js pristine); gallery SVG thumbnail in both CHART_SVG (studio.js) and model.js thumb; Comparison group; labelCol+valueCol binding; Positive/Negative color pickers in inspector; animated entrance (bars grow from zero, staggered 40ms); hover tooltips; value labels inside wide bars. 4 new F24 checks. Test suite 615/615.

- v117: **H-track: Demo mode** — '⋯ More → Demo mode ▶' toggle simulates live refreshing data for SE demos: preview re-renders every 4 s with numeric values varied by ±8% (deterministic tick-based, no Math.random); pulsing '● LIVE' badge in topbar; canvas status shows '· demo LIVE'; second click stops simulation and restores sample data. Also fixed a pre-existing E7 test regression (v116 entry was missing its  field). 645/645.

- v118: **H-track: Panel zoom** — ↗ maximize button appears on hover of each canvas panel; clicking opens a full-screen overlay containing just that panel re-rendered at full resolution (one-panel spec via buildHtml). 'Exit zoom' pill (bottom-right) and Escape close the overlay. Complements Focus mode (which collapses panes) by isolating a single chart. `window.__panelZoomOpen` / `window.__panelZoomActive` test hooks. 6 new H118 checks. Test suite 651/651.

- v119: **F28: Waffle chart (41st type)** — Composition group, CDF-only; 10×10 grid where each cell = 1% of total; labelCol+valueCol binding (same as donut); proportional cell allocation with largest-remainder rounding; per-category palette; legend with %; hover tooltips (category + count + %); staggered entrance animation; configurable cols; PDC.waffle extension (pdc-ui.js pristine); gallery SVG thumbnail in picker and model.js thumb. 3 new F28 checks. Test suite 654/654.
- v120: **F29: Timeline / milestone chart (42nd type)** — Trend group, CDF-only; classic "alternating timeline" layout with diamond markers positioned at even intervals on a horizontal baseline, labels alternating above/below so they never overlap; labelCol required (event name), optional dateCol (period label on opposite side of baseline), optional colorCol (category palette); hover tooltip on every diamond; animated entrance (stalks, diamonds, labels fade in left-to-right); PDC.timeline extension in studio-charts.js (pdc-ui.js pristine); gallery SVG thumbnails in both picker (studio.js CHART_SVG) and model.js thumb; autoPickCols assigns first string col as labelCol, second as dateCol; dateCol is an optional picker (blank allowed); docs/index.html updated to 42 types. 3 new F29 checks. Test suite 657/657.
- v121: **F30: Radial bar chart (43rd type)** — Comparison group, CDF-only; concentric arc tracks where arc length encodes value; data sorted largest→outermost (up to 12 tracks); 270° sweep on all tracks; animated entrance (ease-out-cubic per track, staggered by rank); legend grid below circular area; maxVal (0=auto) / fmt / height inspector options; PDC.radialBar extension in studio-charts.js (pdc-ui.js pristine); gallery SVG thumbnails in picker (studio.js CHART_SVG) and model.js thumb; waffle entry added to docs/index.html (had been missing). 3 new F30 checks. Test suite 660/660.
- v122: **F31: Population pyramid chart (44th type)** — Comparison group, CDF-only; mirrored horizontal bars from a shared centre axis (labelCol = category, leftCol = left measure, rightCol = right measure); bars animate from centre outward (ease-out-quad, staggered 35 ms/row); value labels inside wide bars; hover tooltips per bar; inspector options: Left/Right side labels (text), Left/Right bar colors (color tokens), format, height; PDC.pyramidBar extension in studio-charts.js (pdc-ui.js pristine); gallery SVG thumbnails in CHART_SVG and model.js thumb; autoPickCols maps first string → labelCol, first/second numeric → leftCol/rightCol; docs updated to 44 types; fixed stale "All 20 chart types" → "All 44 chart types" in docs Simple vs Advanced section. 3 new F31 checks. Test suite 663/663. 44 chart types total.
- v125: **F34: Grouped bar chart (47th type) + H-track: Slideshow mode** — F34: side-by-side multi-series bar chart per category (Comparison group, CDF-only); bars auto-centered in each group; labelCol + multi-series binding; Rotate/Format/Height options; clickable legend (_toggleLegend); staggered animated entrance; PDC.groupedBars extension (pdc-ui.js pristine); 4 new F34 checks. Slideshow: full-screen panel-by-panel presentation mode; ◀/▶ buttons + arrow keys; Escape/× to exit; same buildHtml+iframe pipeline as Panel zoom; test hooks; CSS in studio.css; 4 new H-track checks. Test suite 683/683. 47 chart types total.
- v127: **F36: 100% Normalized Stacked Bar chart (49th type) + J-track: docs updated to 49 types** — barNorm (F36, Composition group, CDF-only): every bar scaled to 100% and divided into proportional colour-coded segments; labelCol + multi-series binding; fixed 0–100% y-axis; clickable legend; column-by-column staggered animated entrance; hover tooltips (category, series, raw value, %); PDC.barNorm extension (pdc-ui.js pristine); gallery SVG thumbnails in CHART_SVG and model.js thumb; autoPickCols; 5 new F36/J checks. J-track: docs/index.html updated to 49 chart types (added ct-barNorm + ct-ridgeline cards, updated type counts). Test suite 694/694. 49 chart types total.
- v128: **F37: Area range / confidence band chart (50th type)** — `areaRange` (Trend group, CDF-only): shaded semi-transparent band between upper (solid) and lower (dashed) bound lines with an optional bolder centre/actual/forecast line. Band opacity configurable (5–60%, default 22%); animation: band fades in first, boundary lines next, centre line last. autoPickCols prefers low/min/floor for lowerCol and high/max/ceil for upperCol. centerCol is optional. PDC.areaRange extension (pdc-ui.js pristine); gallery SVG thumbnails in CHART_SVG and model.js thumb; docs updated to 50 chart types (ct-areaRange in Trend group). 5 new F37 tests. Test suite 699/699. 50 chart types total.
- v129: **F38: Quadrant chart (51st type)** — `quadrant` (Comparison group, CDF-only): scatter-style x/y plane divided into four labelled zones by configurable X split % and Y split % threshold sliders. Dots colour-coded by quadrant (blue=top-right, purple=top-left, red=bottom-left, green=bottom-right); subtle zone tints; dashed divider lines; italic corner labels (default: High Value / Explore / Low Priority / Quick Wins, all editable); short point labels; hover tooltips (label + x + y). Perfect for BCG matrix, effort/impact prioritisation, performance/potential, risk/probability. PDC.quadrant extension (pdc-ui.js pristine); gallery SVG thumbnails; autoPickCols; docs updated to 51 types (ct-quadrant in Comparison group). 5 new F38 checks. Test suite 704/704. 51 chart types total.
- v132: **Z1: App shell — collapsible left rail (Home · Repository · Studio · Settings)** — kicks off the analytics-app north star. `app/shell.js` + rail markup in `index.html`: a warm-dark left rail with single-color icons per section (amber Home / teal Repository / blue Studio / violet Settings); collapses to icons-only or expands to icon+label; both collapse state and active section persist in localStorage; roving ↑/↓ keyboard nav + `aria-current`. The existing 3-pane builder moves under Studio with **zero feature loss** — just wrapped in a new `#appMain`, nothing inside it changed. Home/Repository/Settings show friendly "coming soon" placeholders for now (real content in later Z-track slices). Scoped to desktop: rail hidden ≤900px and Studio always wins on narrow viewports, so mobile/tablet behavior (drawers, tab bar, MNAV) is untouched. 3 new icons (home/layers/grid) in `app/icons.js`. 8 new Z1 checks. Test suite 713/713.
- v133: **Z2: Home — a real landing page (quick-create + recents)** — replaces the Z1 Home placeholder with a working landing page: 3 quick-create cards (Blank dashboard / Browse examples / Take the tour) + a "Recent dashboards" grid. Recents are captured on the same debounce path as auto-save (`scheduleNoteRecent()` in `doRefresh()`); each entry stores a full spec clone (capped at 8, newest-first, `localStorage["studio-recents"]`) so a recent card genuinely reopens that exact dashboard. Cards render a live SVG thumbnail via the existing `Studio.makeThumbnail()`, theme-aware at paint time. Also fixed a Z1 CSS specificity bug (`.app-sec.has-content` vs `.app-sec[hidden]`, equal specificity, source-order win) that could leave a populated Home section visible while `hidden` — scoped to `:not([hidden])`. 5 new Z2 checks. Test suite 718/718.
- v134: **Z12 (slices 1–3): favicon + de-duped app identity** — added a real favicon (`favicon.svg`, terracotta-gradient bar-chart mark) wired via `<link rel="icon">` + `apple-touch-icon` + `site.webmanifest` + `theme-color` (the tab was blank before this). Removed the redundant single-letter "P" square from the topbar next to the full wordmark; the styled "Analytics Dashboard Studio" wordmark is now the sole identity in the content header. Anchored the app's persistent identity at the TOP of the left rail instead — a compact brand mark + "Dashboard Studio" label (`#railBrand` in `index.html`, wired in `app/shell.js`) that collapses to just the mark and jumps to Home on click, cf. Linear/VS Code/Notion. Exported dashboards and the passcode gate screen (their own separate `.pdc-logo`/`.g-logo` "P" marks) are untouched — out of scope, addressed separately under Z6. 5 new Z12 checks. Test suite 723/723.
- v136: **Z11: discoverable Help entry + Z5 follow-up: Settings export/import as JSON** — added a persistent **Help** link (`#railHelp`) at the bottom of the left rail (below Settings, above the collapse toggle) that opens `docs/index.html` in a new tab — the docs were previously buried in the ⋯ More menu, per the Z11 user report. Settings gained a **Data** card: **Export settings** downloads a `dashboard-studio-settings.json` with theme/mode/connections/layout preferences (not dashboard content — that stays on Save/Open); **Import settings** restores it (validated + confirmed before applying, then reloads). `applySettingsData()` factored out for testability. `docs/index.html` updated. 4 new checks. Test suite 733/733.
- v137: **Z9: fix invisible topbar dropdowns at tablet width** — found the root cause of a user-reported mobile regression ("the top button-bar scrolls/slides but its dropdown menus don't open/work"): at tablet widths (641–900px), `#topbar`/`.top-actions` need `overflow:hidden` to stop the button row from forcing page-level horizontal scroll, but that same clip box was also hiding every dropdown (New ▾ / Examples ▾ / Export ▾ / ⋯ More) since `.menu` is `position:absolute` and extends below the topbar's own box — the menu still gained `.open` and reported normal computed styles, so both a DOM check and Playwright's default click/tap actionability check reported success while it was genuinely unrendered on screen (confirmed via screenshot). Extended the same `position:fixed` escape hatch already used at ≤640px (phone) to the tablet range, anchored under its button instead of stretched full-width. Added an `elementFromPoint`-based regression test (the only kind that catches ancestor-overflow clipping) for New ▾/Export ▾/⋯ More at a tablet viewport; verified it fails on the old CSS and passes on the fix. 4 new checks. Test suite 737/737.
- v135: **Z5 slice 1: Settings — first-class mode toggle switches** — the Settings section (left rail) is no longer a placeholder: Dark mode / Simple mode / Demo mode / Focus mode now show as clear, labelled on/off switches grouped into Appearance / Mode / Presentation cards, instead of being buried in the ⋯ More menu (a user-reported pain point). Each switch wraps the existing mode function directly (setTheme/toggleSimpleMode/toggleDemoMode/enter·exitFocusMode) so there's no parallel state to drift — the switch, the ⋯ More item, and any shortcut always agree; toggling Focus mode from Settings jumps into Studio to show the effect immediately, and exiting via Escape is reflected back in the switch next time Settings is shown. New `.set-sw` toggle-switch component matches the warm-dark Home aesthetic. `docs/index.html` updated. 6 new Z5 tests. Test suite 729/729.
- v126: **F35: Ridgeline / joy plot (48th type) + H-track: Inspector expand all / collapse all** — Ridgeline (F35, Distribution group, CDF-only): horizontally stacked KDE density curves per category with configurable overlap ratio (0–0.9); shared value x-axis; category labels colored to match their ridge; Gaussian KDE (Silverman bandwidth, same as violin); fill + outline per ridge; hover tooltips (category, count, median); staggered animated entrance bottom-to-top; labelCol + valueCol binding; PDC.ridgeline extension (pdc-ui.js pristine); gallery SVG thumbnail in CHART_SVG and model.js thumb; 3 new F35 checks. Inspector expand/collapse-all: two compact buttons ("Expand all" / "Collapse all") below the search bar instantly expand or collapse all inspector sections; state persisted via _collapsedSects + localStorage; 3 new H126 checks. Test suite 689/689. 48 chart types total.
- v124: **F33: Pareto chart (46th type) + H-track: '/' keyboard shortcut for gallery search** — Pareto: Comparison group, CDF-only; bars sorted descending (largest leftmost), secondary right y-axis 0–100% with orange cumulative % line + dot markers, optional dashed 80% reference line; labelCol+valueCol binding; animated 2-phase entrance (bars staggered, then line fades in); PDC.pareto extension (pdc-ui.js pristine); gallery SVG thumbnails in CHART_SVG and model.js thumb; dispatch in studio-render.js; 4 new F33 checks. H-track '/' shortcut: pressing '/' when a panel is selected focuses .cg-search (chart-type gallery search); guards against input/textarea/select targets + modifier keys; listed in shortcuts modal (?); 2 new H-track checks. Test suite 675/675. 46 chart types total.
- v123: **F32: Icicle/partition chart (45th type) + H-track: series color palette presets** — Icicle: Composition group, CDF-only; two-level rectangular partition where parent groups appear as proportional column-strips across the top 36% and children fill the bottom 64% within each parent column; encodes both the parent-to-whole ratio (column width) and within-parent composition (sub-column width); labelCol+valueCol+groupCol binding; single-level mode when groupCol omitted; hover tooltips; staggered animated entrance (L→R); PDC.icicle extension in studio-charts.js (pdc-ui.js pristine); gallery SVG thumbnails in both CHART_SVG (studio.js) and model.js thumb; autoPickCols; 3 new F32 checks. Palette presets (H-track): 5 built-in series palettes (default/ocean/forest/sunset/dusk), each with separate light-mode and dark-mode ramps; 'Series palette' swatch row in dashboard inspector; selected palette injects --c1…--c10 CSS variable overrides into preview and CDF export; spec.paletteKey; Studio.PALETTE_PRESETS in model.js; paletteCss in exporters.js; 3 new H-palette checks. Test suite 669/669. 45 chart types total.
- v138: **Z8 slice 1: context-aware inspector** — `Studio.ANNOT_CAPS` capability map + `Studio.chartSupports(kind, type)` in `app/model.js` records which chart types the renderer actually wires each interaction feature into (mirrors the real per-type dispatch in `studio-render.js`: drill only for bars/donut, detail drawer for bars/donut/treemap/table, cross-filter + conditional formatting + color scale for bars/donut/treemap/lollipop). The panel inspector's Drill-through, Detail drawer, Cross-filter, Conditional formatting, and Color scale sections now only render when the selected chart type actually supports them — e.g. a Table panel no longer shows Cross-filter/Color scale/Conditional formatting/Drill-through (previously shown for every type with zero effect), but keeps Detail drawer (table rows do support it); a Line chart no longer shows Conditional formatting or Color scale. `docs/index.html` updated with a note on the context-aware behavior. 4 new tests. Test suite 741/741.
- v139: **Z8 slice 2: table-specific options — row limit + grand total row** — `Studio.CHARTS.table.opts` gains **Row limit** (0 = all) and **Show grand total row** (sums numeric columns over the currently visible/filtered rows, appended as a bold `<tfoot>` row). `PDC.table` override in `studio-charts.js` renders the total row; `studio-render.js` applies the row limit client-side before rendering. Same code path for preview + exported CDF (studio-charts.js is inlined into exports). `docs/index.html` Table card updated. 4 new tests. Test suite 745/745.
- v140: **Z8 slice 3: Table extras — paging, freeze header, row density** — three more Table-specific options: **Rows per page** (0 = all on one page; otherwise a Prev/Next `.tbl-page-bar`), **Freeze header row** (scrollable `.tbl-wrap.frz` with `position:sticky` thead — tall tables no longer just clip at the panel edge with no way to see all rows), and **Row density** (Comfortable/Compact). Paging resets on filter/sort change; bar-cell scaling + grand total still compute over the full filtered/sorted set, not just the current page. New `optField()` "select" opt type in `studio.js` (reuses `select2pairs`) — first inspector option backed by an arbitrary choice list. `docs/index.html` updated. 4 new Z8T tests. Test suite 749/749.
- v141: **Z8 slice 4: Gauge gets its own options** — `Studio.CHARTS.gauge.opts` gains a **Value format** picker (was always a raw rounded number) and **Warning/Good zone %** thresholds (were hardcoded 70/90 in the vendored toolkit, invisible to the builder). The gauge arc now shows a permanent red/amber/green zone track behind a bright value tick (mirrors the Bullet chart convention) instead of only recoloring once the value crosses an invisible line. `PDC.gauge` overridden in `studio-charts.js` (`PDC._gaugeBase` kept for reference); `studio-render.js` passes fmt/warnAt/goodAt through. `docs/index.html` updated. 4 new Z8G tests. Test suite 753/753.
- v142: **Z8 slice 5: Treemap gets its own options** — `Studio.CHARTS.treemap.opts` gains **Show tile labels** (toggle off the bold title+value text the base toolkit always drew on big-enough tiles) and **Show % of total, not value** (swap the value line for the tile's share of the whole). `PDC.treemap` overridden in `studio-charts.js` (`PDC._treemapBase` kept for reference, same pattern as Table/Gauge); tooltip unaffected (still shows both value and %). `docs/index.html` updated. 5 new Z8M tests. Test suite 758/758.
- v143: **Z8 slice 6: Scatter gets its own options** — `Studio.CHARTS.scatter.opts` gains **Value format** (axis ticks + tooltip were always `PDC.fmt.abbr`, no way to change) and **Show trend line (regression)** — an OLS regression line drawn through the plotted points. `PDC.scatter` overridden in `studio-charts.js` (`PDC._scatterBase` kept for reference, same pattern as Table/Gauge/Treemap); `studio-render.js` falls back to the chart's true `abbr` default (not the ambient plain fallback) so scatter panels saved before this option existed don't regress. `docs/index.html` updated. 4 new Z8SC tests. Test suite 762/762.
- v144: **Z8 slice 7: Line / area gets its own options** — `Studio.CHARTS.line.opts` gains **Smooth curve** (cubic-bezier interpolation between points, same midpoint-control-point technique as the Bump chart) and **Show data points** (hide the per-point dot markers; a transparent hover target keeps tooltips working even with dots hidden). `PDC.line` overridden in `studio-charts.js` (`PDC._lineBase` kept for reference, same pattern as Table/Gauge/Treemap/Scatter); `studio-render.js` passes smooth/showDots through. `docs/index.html` updated. 3 new Z8LN tests. Test suite 765/765.
- v147: **Z8 slice 10: Stacked bars gets its own options** — `Studio.CHARTS.stacked.opts` gains **Sort by
  total** (order categories by their stacked total, largest first, same convention as Bars/Donut) and
  **Show value labels** (per-segment value text centered in its band, shown only when the band is tall
  enough to hold it legibly). `PDC.stacked` overridden in `studio-charts.js` (`PDC._stackedBase` kept for
  reference, same pattern as Table/Gauge/Treemap/Scatter/Line/Donut/Bars); `studio-render.js` passes
  `sortStack`/`showValues` through; CDE export's `valuesVisible` now reflects the option. `docs/index.html`
  updated. 3 new Z8ST tests. Test suite 774/774.
- v148: **Z8 slice 11: Calendar heatmap gets its own options** — `Studio.CHARTS.calHeatmap.opts` gains
  **Cell color** (was hardcoded to the brand color) and **Week starts on** (Monday/Sunday — weeks always
  rolled over from Monday before with no way to change it). `PDC.calHeatmap` in `studio-charts.js` reads
  `cfg.color`/`cfg.weekStart` (weekday labels reorder to match); `studio-render.js` passes both through
  via the existing `color()` token helper. `docs/index.html` updated. 3 new Z8-11 tests. Test suite 777/777.
- v149: **Z8 slice 12: KPI tiles get click-through** — a new "Click-through" section in every KPI
  inspector (Target URL + URL parameter) lets a tile navigate to another dashboard when clicked, giving
  KPIs the same drill-out affordance bars/donut already have via panel Drill-through. Bound with the same
  shared `PDC.bindDrill` helper directly on the `.kpi` tile element (carries the tile's raw value as the
  drill label); works in the live preview and every exported CDF (studio-render.js is inlined into
  exports, so no exporter changes needed). `docs/index.html` KPI card updated. 4 new tests. Test suite
  781/781.
- v150: **Z8 slice 13: Stacked area gets its own options** — `Studio.CHARTS.areaStacked.opts` gains
  **Smooth curve** (cubic-bezier band edges via a new `_bandSeg` helper, same midpoint-control-point
  technique as Line/Bump) and **Show legend** (the renderer already supported hiding the legend
  internally via `cfg.legend`, but no inspector control ever exposed it). `studio-render.js` passes
  `smooth`/`legend` through to `PDC.areaStacked`. `docs/index.html` updated. 3 new Z8AS tests. Test suite
  784/784.
- v151: **Z8 slice 14: Stream graph gets its own options** — `Studio.CHARTS.streamgraph.opts` gains
  **Show legend** (the renderer already supported hiding the legend via `cfg.legend`, but the inspector
  never exposed a toggle) and **Band opacity** (was hardcoded to 78%, now adjustable 0–100%). `PDC.streamgraph`
  reads `cfg.opacity` for the ribbon fill-opacity; `studio-render.js` passes `showLegend`/`bandOpacity`
  through. `docs/index.html` updated. 3 new Z8SG tests. Test suite 786/786.
- v146: **Z8 slice 9: Bar chart gets its own options** — `Studio.CHARTS.bars.opts` gains **Sort by value**
  (largest-first, same convention as Donut's "Sort slices") and **Show value labels** (hide the always-on
  value text for a cleaner look on dense charts). `PDC.bars` overridden in `studio-charts.js`
  (`PDC._barsBase` kept for reference, same pattern as Table/Gauge/Treemap/Scatter/Line/Donut);
  `studio-render.js` passes `sortBars`/`showValues` through and extends `wireXFilter`'s bars branch to
  mirror the sort for cross-filter click mapping. CDE `valuesVisible` now reflects the option. `docs/index.html`
  updated. 3 new Z8BR tests. Test suite 771/771.
- v145: **Z8 slice 8: Donut gets its own options** — `Studio.CHARTS.donut.opts` gains **Sort slices by value** (largest-first), **Show legend** (hide the side legend so the ring fills the panel), and **Inner radius %** (adjustable ring thickness, 0 = full pie). `PDC.donut` overridden in `studio-charts.js` (`PDC._donutBase` kept for reference, same pattern as Table/Gauge/Treemap/Scatter/Line); `studio-render.js` passes sortSlices/legend/innerPct through and mirrors the sort in the cross-filter click-to-label wiring (`wireXFilter`) so slice clicks still map correctly when sorted. `docs/index.html` updated. 3 new Z8DN tests. Test suite 768/768.
- v152: **Z8 slice 15: Radar / spider gets its own options** — `Studio.CHARTS.radar.opts` gains **Show legend**
  (the renderer already supported hiding the legend via `cfg.legend`, but the inspector never exposed a
  toggle) and **Show vertex dots** (hide the per-vertex dot markers for a cleaner polygon-only look;
  invisible hover targets keep tooltips working with dots hidden, same convention as Line's "Show data
  points"). `PDC.radar` in `studio-charts.js` reads `cfg.showDots`; `studio-render.js` passes
  `legend`/`showDots` through. `docs/index.html` updated. 3 new Z8RD tests. Test suite 789/789.
- v154: **Z8 slice 17: Bump + Icicle get their own options** — `Studio.CHARTS.bump.opts` gains **Show rank
  numbers in dots** (declutters a chart with many entities/periods); `Studio.CHARTS.icicle.opts` gains
  **Show cell labels** + **Show % of total, not value**, mirroring Treemap's pattern (both are
  proportional-area partitions). These were the last two chart types with zero distinguishing options
  beyond fmt+height — every chart type now has at least one type-specific option. `PDC.bump`/`PDC.icicle`
  updated directly in `studio-charts.js` (both are pure extensions, no vendored base); `studio-render.js`
  passes the new keys through. 4 new Z8BI tests. Test suite 796/796.
- v155: **Z8 slice 18 (Z8 track complete): Grouped bars + 100% stacked get their own options** — the v154
  audit missed that `groupedBars`/`barNorm` were still on bare rotate+fmt+height (rotate is a generic
  option shared by many types, not a distinguishing one). `Studio.CHARTS.groupedBars.opts` gains **Show
  value labels** (formatted value above each bar, drawn only when wide enough); `Studio.CHARTS.barNorm.opts`
  gains **Show segment % labels** (rounded `NN%` centered in each band, drawn only when tall+wide enough).
  `PDC.groupedBars`/`PDC.barNorm` updated in `studio-charts.js`; labels fade in with their bar/segment's
  entrance animation; `studio-render.js` passes the new keys through; `docs/index.html` updated. Every
  chart type now genuinely carries at least one type-specific option. 4 new Z8GN tests. Test suite 800/800.
- v156: **Z13: new showcase example — "Data Platform Operations Center"** (`data/examples/ops-command.studio.json`),
  an 8-panel dashboard covering **8 chart types not used in any other bundled example**: Sankey (pipeline
  flow), Network (system→app dependency graph), Quadrant (risk vs. volume), Calendar heatmap (daily
  reliability), Bump (stage-runtime ranking over months), Sunburst (assets by source), Waffle (job outcome
  mix), Pareto (errors by source). Placed second in the gallery order (existing lead example unchanged, so
  the "most-spectacular-first, no single hero" regression test stays meaningful). `docs/index.html` example
  count corrected 6→7. 3 new Z13 tests (listed in bundle, all 8 types present, every panel renders real
  content). Test suite 803/803.
- v157: **Z13: 8th showcase example — "Product Delivery & Engineering Console"** (`data/examples/
  engineering-delivery.studio.json`), an 8-panel dashboard covering **8 more chart types not used in any
  other bundled example**: Table (backlog queue), Combo (velocity vs. defects), Grouped bars (points by
  team), Stacked bars (ticket mix by team), Dumbbell (planned vs. actual), Histogram (cycle time), Timeline
  (release milestones), Word cloud (tool mentions). Gallery coverage now 29/51 types. Also fixed a real,
  previously-latent bug found while validating the new histogram panel: `PDC.histogram`'s bar entrance
  animation used the invalid SVG-attribute syntax `setAttribute("transform","scaleY(0)")` (`scaleY()` is a
  CSS transform function, not part of the SVG transform-attribute dialect) — switched to `.style.transform`
  (CSS), matching every other animated chart. `docs/index.html` example count corrected 7→8. 3 new Z13
  tests. Test suite 806/806.
- v158: **Z13: 9th showcase example — "Finance & FP&A Command Center"** (`data/examples/
  finance-command.studio.json`), an 8-panel dashboard covering **8 more chart types not used in any other
  bundled example**: Candlestick (monthly revenue range), Area range (forecast confidence band), Diverging
  bars (budget variance by department), Radial bar (KPI attainment ranking), Icicle (two-level cost
  breakdown — first bundled use of icicle's `groupCol`), Chord (inter-department fund transfers), Parallel
  coordinates (regional performance profiles), Gantt (month-end close timeline). Gallery coverage now
  37/51 types. Found and fixed a real, previously-latent bug: the `icicle` case in `studio-render.js` read
  a bare `groupCol` identifier (undefined) instead of `m.groupCol`, so any icicle panel with a group column
  configured threw `ReferenceError` and rendered nothing — nothing had exercised two-level icicle until this
  example. Also added a `signed` classify kind to `app/sampledata.js` (variance/delta/diff/change column
  names → alternating +/- values) so diverging-bar-style panels actually diverge in the offline preview.
  `docs/index.html` example count corrected 8→9. 3 new Z13 tests. Test suite 809/809.
- v159: **Z13: 10th showcase example — "Marketing & Growth Performance Console"** (`data/examples/
  marketing-growth.studio.json`), a 10-panel dashboard covering **the last 10 non-distribution-limited
  chart types**: Streamgraph (channel traffic), Slope (campaign CTR before/after), Dot plot (planned vs.
  actual budget), Polar area (ad spend share), Step (subscriber tier migration), Marimekko (revenue mix),
  Packed bubbles (audience size), Population pyramid (age/gender split), 100% stacked bars (creative
  format mix), and Text/annotation (a guided intro panel). Gallery coverage now **47/51 types** — every
  chart type except boxplot/violin/ridgeline/beeswarm, which need a sample-data-generator change (see NEXT
  below) before they'll look like real distributions. Fixed the generic "all examples render every panel"
  Playwright check, which only counted `svg`/`table` elements — a richtext panel renders a `.sr-richtext`
  div instead, so the very first example using one would have silently failed; widened the selector rather
  than special-casing the new example. `docs/index.html` example count corrected 9→10. 3 new Z13 tests.
  Test suite 812/812.
- v160: **Z14 slice 1: DuckDB-Wasm connector** — new data-source type "DuckDB (remote file)" queries a
  Parquet/CSV file over plain HTTP (S3/any static host) entirely in the browser, no backend/proxy/
  credentials. `app/duckdb.js` (new, browser-only file, not loaded by the Node CLI tools): lazy-loads the
  duckdb-wasm engine from jsDelivr on first use (`ensureEngine`, cached), `testConnection(cfg)` registers
  the file + runs DESCRIBE + a 5-row sample (always resolves `{ok,...}`, never rejects, so a bad URL/CORS/
  network failure shows a clear inline error instead of a stuck spinner), `query(cfg, sql)` runs SQL
  against the file aliased as view `t`. New Source builder + DA inspector both get File URL/Format fields
  + a "Test connection & detect columns" button (mirrors SQL's "Detect from query" UX); Data preview's
  "Run live" button (previously Pentaho-only) now also appears for duckdb DAs and queries the real file.
  `exportCDA` excludes duckdb DAs from `.cda` XML (not a real Pentaho source); preview/CDF export need no
  changes since they already render any DA from its declared columns via offline sample data. `docs/
  index.html` updated. 12 new Z14 tests (stub `Studio.DuckDB` at the boundary — this sandbox's browser has
  no internet route, so a real network call would only prove "unreachable", not exercise the integration;
  the real jsDelivr URL + duckdb-wasm API surface were verified reachable via curl before shipping). Test
  suite 828/828.
- v161: **Z13 loose end: gauge double-percent defensive fix** — `studio-render.js`'s gauge case computed
  `unit: o.unit || "%"` unconditionally, so a gauge with Value format "pct" (which already appends its own
  `%` via `PDC.fmt.pct`) plus the default Unit field ("%") rendered "42.3%%". Now skips the default unit
  when `fmt === "pct"` and the unit is still the unmodified default. 1 new regression test drives the real
  inspector "Value format" select (not a standalone `PDC.gauge` call) so the fix in the panel-dispatch
  layer is actually exercised, not just the toolkit primitive. Test suite 829/829.
- v162: **Z13 loose end: `tools/import-v2.py` no longer clobbers the curated gallery** — the 17 retired
  v2 `cde-*` boards it converts from `reference/dashboards/*.cdfde` now write to a gitignored
  `data/legacy-v2-boards/` instead of `data/examples/`, so re-running the importer can never resurrect
  them into the curated gallery `index.json` reads from. Discovered (but deliberately did NOT fix in this
  slice — needs its own careful pass) that `data/cda-catalog.json`/`data/sample-data.json` are
  substantially stale vs. the current `reference/dashboards/*.cda` schema; see the Z13 NEXT note. No JS
  changed; Python-only, verified by running the script. Test suite unaffected (829/829, unchanged).
- v163: **Z2 follow-up: favorites/pinning on Home** — every recent-dashboard card gets a star toggle
  (`localStorage["studio-pins"]`); pinned cards render under a "Pinned" heading above "Recent dashboards"
  and are exempt from the 8-entry recents cap, so pinning protects a dashboard from being evicted by newer
  activity. `.recent-card` changed from a `<button>` to a `<div>` with a full-cover `.recent-open` button
  (opens the dashboard) plus a small overlaid `.recent-pin` toggle, avoiding an invalid button-in-button;
  updated the one existing test that read `data-recent` off the old element. New `star` icon in
  `app/icons.js`; both pin/unpin and the recents-cap-with-a-pin path get new tests. Test suite 833/833.
- v165: **Z0 complete: dead CDE exporter deleted + terminology cleanup** — removed `Studio.exportCDE`/
  `CDE_OK`/`Studio.cdeEmittable`/`brandHeaderRows` (unreachable since CDE export left the menu in the
  Phase-1 migration); `Studio.parseCDE` (CDE **import**) is unaffected. The CDE-import round-trip test now
  uses a captured static `.cdfde`/`.wcdf` fixture (`tests/fixtures/studio-cost.cde-fixture.json`) instead
  of generating one via the now-deleted exporter. Also cleaned up `bundleModal()`'s dead `omitted` param,
  a stale "CDE export will skip" inspector note, dead `.ex-badge-cdf`/`.ex-badge-cde` CSS, and several
  stale CDF/CDE strings + a wrong chart-type count (47→51) in `docs/index.html`. Test suite 827/827.
- v166: **Z14 slice 3: SQLite-WASM + HTTP-VFS connector** — "SQLite (remote .sqlite)" data-source type,
  `app/sqlitehttp.js` (new, browser-only, lazy-loads sql.js-httpvfs via a classic `<script>` tag since it
  has no ESM build), New Source builder + DA inspector wiring (File URL + optional Table name + Query +
  Test connection & detect columns), Run-live in the Data preview, `exportCDA` now excludes both
  `duckdb`/`httpvfs` kinds from `.cda`. 13 new tests. Test suite 840/840.
- v174: **Z2 follow-up: hover life on Home cards** — recent-dashboard cards lift further + gain a warm
  terracotta glow + their thumbnail zooms slightly on hover; quick-create cards get the same glow + an
  icon bump; all skipped under `prefers-reduced-motion`. Also fixed a flaky pre-existing test (Z8G gauge
  percent-sign check, v161): its 150ms wait after a live preview re-render wasn't always enough under this
  sandbox's current load, producing a stale empty read; bumped to 400ms (same assertion, confirmed via
  `git stash` that the flake pre-dates this session). 2 new hover tests. Test suite 873/873.
- v173: **Z14 track complete: distinct DuckDB/SQLite icons** — the two browser-native connector
  cards get their own monoline glyphs (`app/icons.js`: `duckdb`, `sqlite`) instead of sharing the
  generic `db` cylinder with every server-backed connector. 1 new test. Test suite 871/871.
- v172: **Z13 complete: multi-row sample-data mode + 11th example** — `Studio.sampleRows` gained an
  opt-in multi-row-per-label mode (jittered rows per group instead of one point per label) that
  `Studio.genMock` auto-applies to any DA feeding a boxplot/violin/ridgeline/beeswarm panel; new
  "Incident Response & Reliability Distributions" example covers those 4 previously-uncovered chart
  types. Gallery chart-type coverage now **51 of 51**. 4 new tests. Test suite 870/870.
- v171: **Z3 follow-up: whole-repository JSON export/import** — Repository page gains "Export repository…"/
  "Import repository…" buttons: export bundles authored data sources (not the bundled catalog) + the local
  dashboard inventory (recents/pins) into one JSON file; import merges additively (never deletes existing
  entries). `applyRepositoryData()` exposed as a test hook, mirroring the Z5 Settings export/import pattern.
  `docs/index.html` updated. 2 new tests — also fixed a test-authoring bug found along the way: an earlier
  Z3 test left the app on the Studio section for every subsequent test, silently testing hidden DOM instead
  of the real, visible Repository page. Test suite 866/866.
- v170: **Z14 slice 4: connector-gallery polish** — DuckDB (remote file) and SQLite (remote .sqlite)
  source-type cards in the New Source builder gain a small "Browser-only" badge; `Studio.friendlyConnectorError()`
  (shared, `app/model.js`) appends a plain-English, actionable hint to common raw connector failures
  (CORS/fetch-blocked, timeout, 404) instead of surfacing the raw browser error verbatim; wired into both
  `Studio.DuckDB.testConnection()` and `Studio.SQLiteHttp.testConnection()`'s failure path. `docs/index.html`
  updated. 8 new tests. Test suite 864/864.
- v167: **Z12 complete: Branding as a Settings option** — new **Branding** card on the Settings page:
  **Default** / **Custom logo** (upload PNG/JPG/SVG ≤200KB, stored as a `data:` URL in
  `localStorage["studio-branding"]`) / **None**, applied live to the `.rail-brand-mark` at the top of the
  left rail via `applyBranding()` (called at boot + on every change). Included in Settings export/import
  and "Clear local data" so a custom logo travels with your other preferences. 9 new tests, including a
  real `setInputFiles()` upload through the actual (hidden) file input. Test suite 849/849.
- v172: **Z13 complete: multi-row sample-data mode + 11th example** — `Studio.sampleRows` gained an
  opt-in multi-row-per-label mode (jittered rows per group instead of one point per label) that
  `Studio.genMock` auto-applies to any DA feeding a boxplot/violin/ridgeline/beeswarm panel; new
  "Incident Response & Reliability Distributions" example covers those 4 previously-uncovered chart
  types. Gallery chart-type coverage now **51 of 51**. 4 new tests. Test suite 870/870.
- v173: **Z14 track complete: distinct DuckDB/SQLite icons** — the two browser-native connector
  cards get their own monoline glyphs (`app/icons.js`: `duckdb`, `sqlite`) instead of sharing the
  generic `db` cylinder with every server-backed connector. 1 new test. Test suite 871/871.
- v174: **Z2 follow-up: hover life on Home cards** — recent/quick-create cards get a warm glow +
  lift on hover; fixed a flaky gauge percent-sign test. 2 new tests. Test suite 873/873.
- v176: **Z6 naming model** — the topbar dashboard title is now a jump-to-inspector button (focuses
  the Dashboard inspector's Title field, pre-selected) instead of a second, redundant inline editor
  duplicating the inspector's own Title field. 3 new tests. Test suite 881/881.
- v177: **Track N follow-up** — dynamic palette commands (Open example:/Open dashboard: entries rebuilt
  fresh on open) + a visible "Search ⌘K" rail item. 5 new tests, suite 883/883.
- v178: **Track N follow-up** — every static command palette entry now carries an icon. 1 new test,
  suite 884/884.
- v179: **Z7 kickoff** — Line/area charts gain a "Show moving average" toggle + window field: a dashed
  trailing simple-moving-average overlay per series, computed client-side, rendered through the same
  `_lineOpts` override and generic inspector `optField()` machinery (no exporter changes needed — CDF
  export and preview share the renderer). 3 new tests, suite 890/890.
- v180: **Track L (test health)** — hardened all 21 fixed-`setTimeout`-then-read-`#preview` sites in
  `tests/run.js` with a reusable poll helper (`window.__waitForPreview`); also hardened the
  panel-dup/delete count check with `page.waitForFunction`. Test-only, no product change. Suite
  unchanged at 890/890, closes the sweep target queued by the prior run.
- v181: **MOBILE (m-a)** — the app-shell left rail becomes a slide-in drawer on phones/tablets
  (hamburger + scrim, Relay-style) instead of `display:none` ≤900px; sections now switch full-screen on
  mobile. Verified visually at 390×844. 6 new tests, suite 895/895.
- v182: **MOBILE (m-b)** — fixed the "killer bug": `#app{height:100vh}` on iOS Safari measures the
  layout viewport (taller than what's visible while the toolbar shows), silently stranding
  `#mobile-tabs`/`#statusbar` below the fold with no way to scroll to them. Switched to
  `100dvh`/`100vh`-fallback, added `viewport-fit=cover`, and padded `#statusbar` with
  `env(safe-area-inset-bottom)`. New `tests/mobile-shot.js` screenshot helper for future mobile slices.
  3 new tests, suite 898/898. Still needs a real-device confirmation from the user.
- v183: **MOBILE (m-c)** — found the same "later same-selector CSS rule silently wins" bug pattern
  in three more spots: `#topbar` padding-left (hamburger clearance) clobbered back to 12px by a
  later rule (brand text rendered under the hamburger); `.home-wrap`/`.repo-wrap`/`.settings-wrap`
  padding-top clobbered back to 28px the same way (all three section H1s under the hamburger on
  phones). Pinned `#btnMore` to a fixed top-right position (opaque background) so the escape hatch
  to every other action is always on-screen instead of scrolling off-canvas. Fixed Repository
  data-source cards overflowing 17px past the phone viewport (missing `min-width:0` on a flex row
  blocked ellipsis truncation). 11 new tests, suite 906/906.
- v184: **MOBILE (m-d)** — `#mobile-tabs` had `z-index:25` but no `position` set, so the z-index
  never applied (no-op on static elements); the scrim (z-index:35, full-viewport when a drawer is
  open) intercepted every tap on the tab bar, forcing two taps to switch Library→Inspector instead
  of one. Fixed with `position:relative;z-index:37`. Confirmed panel touch ergonomics were already
  correct from prior M3 work. 3 new tests, suite 909/909.
- v185: **MOBILE (m-e)** — audited changelog/Help reachability on mobile; both were already mostly
  working after m-b's `100dvh` fix. Added the one real gap: an explicit ✕ Close button on the
  changelog/"What's new" popup (previously only tap-outside/Escape, awkward on a full-width phone
  sheet). 5 new tests, suite 914/914.
- v186: **MOBILE (m-e follow-up)** — the changelog now stretches into a true near-full-screen sheet
  on phones (clears topbar + tab bar/status bar) instead of a small floating box; outside-tap
  dismiss now also binds `touchstart` (mobile Safari doesn't reliably synthesize `mousedown` from a
  tap — headless Chromium always looked fine, masking it). 2 new tests. **All of m-a through m-e
  shipped — mobile track now needs a real-device confirmation from the user.**
- v187: **Z7 forecasting slice 2: linear trend / forecast line for line & area charts** — a **Show
  trend / forecast line** toggle + **Forecast periods ahead** field per line panel; per-series OLS
  regression drawn as a dashed line, extrapolated across a widened x-scale (with "+1/+2/…" forecast
  tick labels and a dashed "Forecast →" separator) when forecast periods > 0. `trendOf()` in
  studio-charts.js (pdc-ui.js pristine). 3 new tests. Test suite 919/919.
- v188: **Z3 follow-up: full CRUD from the Repository page** — every data-source card in Repository
  now has hover-revealed ✎ edit / 🗑 delete actions, wired to the same `dataSourceBuilder()`/
  `deleteDataSource()` the Studio library pane already uses (one source of truth). The card became a
  plain wrapping `<div>` with an inner `.repo-ds-open` button (a `<button>` can't nest another
  `<button>`). 3 new tests. Test suite 922/922.
- v189: **Z9 follow-up: dropdown-menu motion polish** — every topbar dropdown (New ▾/Examples ▾/
  Export ▾/⋯ More) fades + rises in (`opacity`/`transform`, `.14s ease`) instead of a hard
  `display:none`/`block` cut; genuinely non-interactive while closed (`pointer-events:none`,
  `visibility:hidden` after the fade-out) rather than merely invisible; respects
  `prefers-reduced-motion`. Desktop/tablet chrome only. 3 new tests. Test suite 925/925.
- v190: **Z5 follow-up: data-source defaults** — new "Data source defaults" Settings card with a
  **Default JNDI connection** field; pre-fills the Connection field on every brand-new data source
  (＋ New source) instead of the hardcoded "PDC-BIDB-EXT" placeholder. `defaultJndi()`/
  `setDefaultJndi()` in studio.js, persisted + included in Settings export/import. 3 new tests. Test
  suite 928/928.
- v191: **Z10 kickoff: app theme system (Classic Blue vs Polecat)** — the Z1 left rail's warm plum/
  terracotta look clashed with the rest of the builder chrome staying Pentaho blue. New `[data-app-theme]`
  attribute on `<html>` (`classic` default | `polecat`), orthogonal to the existing `[data-theme]`
  light/dark mode toggle — each color theme carries its own light **and** dark variant
  (`html[data-app-theme='polecat']` / `html[data-app-theme='polecat'][data-theme='dark']` in
  `studio.css`, overriding `--pentaho`/`--pdc`/`--ink`/`--bg`/`--pane`/`--line`/etc.), so all four
  combinations (Classic×Light, Classic×Dark, Polecat×Light, Polecat×Dark) are real, coherent palettes.
  Polecat reuses the exact rail palette (plum-black/cream/terracotta) so the whole builder now reads as
  one identity instead of two clashing ones — verified visually (screenshots) in both modes. New **Color
  theme** picker in the Settings → Appearance card (`appTheme()`/`setAppTheme()`, new `palette` icon);
  persisted to `localStorage["studio-app-theme"]`, included in Settings export/import + Clear local data.
  **Exported/preview dashboards are deliberately untouched** — `pdc-ui.css` never reads the attribute, so
  published artifacts stay decoupled from app chrome, per the Z10 design note. `docs/index.html` updated.
  4 new Z10 tests. Test suite 932/932. **Still open under Z10** (found while shipping): a few chrome
  surfaces are still hardcoded hex, not CSS variables, so they don't yet follow the app theme —
  `app/welcome.js` (first-run tour modal), and likely `app/tutorial.js`/`app/gate.js`/`app/palette.js` on
  inspection — worth a dedicated follow-up slice to convert those to `var(--pentaho)`/`var(--pdc)`/etc.
  so Polecat is fully coherent everywhere, not just the main 3-pane chrome + Settings/Home.
- v193: **Z6 kickoff: per-dashboard header logo** — new **Header logo** field in the Dashboard
  inspector (below Subtitle): upload a PNG/JPG/SVG (≤200KB) that replaces the default "P" mark in the
  banner, in both the live preview and the exported Dashboard Framework (`buildHtml` renders
  `<img class="pdc-logo">` instead of the default `<span>` when `spec.headerLogo` is set; lives in the
  spec itself, not localStorage, so it travels with Save/Open/Export/Import like any other content).
  Found and fixed **two real pre-existing bugs** while shipping this: (1) `normalize()` — the function
  every Open / restore-banner / example-load / drag-drop-open routes a loaded spec through — whitelisted
  only 7 top-level spec keys, silently **stripping `themeColor` (v103) and `paletteKey` (v123) back to
  defaults on every reopen**; a saved dashboard's custom accent color and series palette were being reset
  without warning. Fixed by adding `themeColor`/`paletteKey`/`headerLogo` to the whitelist. (2) the
  Dashboard inspector's own internal re-render calls (accent-color swatches, palette swatches, CDA
  connection delete, and now header-logo upload/remove) called `renderDashboardInspector(body)` directly,
  which never clears `body` itself — each of those interactions was **appending a second full copy** of
  every dashboard-inspector section on top of the first instead of replacing it (only invisible because
  no prior test asserted post-interaction DOM shape, only the underlying spec value). Fixed by routing
  those 6 call sites through the top-level `renderInspector()` (the existing, correct full-refresh entry
  point every other inspector type already uses for the same kind of self-triggered redraw). `docs/
  index.html` updated. 6 new tests (incl. a regression test driving a real file upload + verifying the
  normalize() fix). Test suite 940/940.
- v192: **Z10 follow-up: theme the welcome tour + tutorial + command palette** — converted
  `app/welcome.js`'s fixed-hex style block to the shared `--pentaho`/`--pdc`/`--ink`/`--pane`/etc custom
  properties, so the first-run tour now follows both light/dark mode and Classic Blue/Polecat instead of
  always rendering Classic-Blue-only. Found and fixed a **real latent bug** while doing the same pass on
  `app/tutorial.js`: its spotlight ring/tooltip had `body.dark-mode`/`body.dark` override rules that never
  matched anything — this app's dark mode is actually `[data-theme='dark']` on `<html>`, not a body class
  — so the interactive tutorial has rendered light-only in dark mode since it shipped (v101); replaced
  with the same shared CSS vars, fixing dark mode AND adding Polecat support in one pass. Also fixed
  `app/palette.js` (⌘K) referencing a nonexistent `--text` custom property (silently always falling back
  to its hardcoded default) — corrected to `--ink`/`--pane`. `app/gate.js` (passcode screen) deliberately
  left as its own fixed brand screen — reasonable given it renders before the app's saved theme
  preference is even loaded. 2 new tests (welcome header/card + tutorial ring/tooltip recolor across
  theme+mode). Test suite 934/934.
- v194: **Z6/Z5 follow-up: dashboard defaults (subtitle + accent color)** — new **Dashboard defaults**
  Settings card: a Default subtitle field and a Default accent color picker (reusing the per-dashboard
  Accent color swatches via a new shared `Studio.THEME_PRESETS` in model.js), applied to every brand-new
  Blank dashboard (Home quick-create or New ▾ → Blank dashboard). Settings' swatches use their own
  `.set-accent-swatch`/`.set-accent-presets` classes (same CSS look) so they can't collide with the
  document-wide `.accent-swatch` queries the per-dashboard picker and palette-preset tests already rely
  on. Found and fixed a real gap while wiring this up: "Clear local data" was missing several keys already
  tracked by Settings export/import (`studio-app-theme`, `studio-shell-section`, `studio-shell-expanded`,
  `studio-default-jndi`) — added those plus the two new default keys. `docs/index.html` updated. 3 new
  tests. Test suite 943/943.
- v195: **Track L architecture sweep** — consolidated the byte-identical `withTimeout()` helper
  duplicated in `app/duckdb.js`/`app/sqlitehttp.js` into `Studio.withTimeout()` (model.js); found and
  fixed a real DOM-duplication bug in the CDA Connection editor's Save handler (called
  `renderDashboardInspector(body)` directly instead of `renderInspector()` — the same bug class the v193
  Z6 kickoff fixed at three other call sites, this fourth one was missed). 1 new test. Test suite 944/944.
- v196: **N-FUN: Build-completeness meter** — a small, game-like progress ring + checklist at the top
  of the Dashboard inspector (title / panel / KPI / filter / a touch of style); purely encouraging,
  collapses to a "nice work" note once every milestone is met. `Studio.dashboardCompleteness(spec)` in
  model.js. `docs/index.html` updated. 3 new tests. Test suite 947/947.
- v197: **Changelog moved to `js/changelog.js`** (polecat house convention, matches relay/games) +
  real UTC timestamps going forward (no more hand-typed/guessed times). No app behavior change.
- v198: **Z10 follow-up: passcode gate now themed** — revisited the v193 call to leave `app/gate.js`
  fixed-hex ("renders before the saved theme loads"): gate.js now reads `studio-theme`/`studio-app-theme`
  from `localStorage` itself and sets the `data-theme`/`data-app-theme` attributes before its first paint,
  then uses the same shared `var(--pentaho/--pdc/--ink/...)` tokens as welcome/tutorial/palette — closing
  the one surface still Classic-Blue-only regardless of the picker. 1 new test. Test suite 948/948.
- v199: **Z7 forecasting slice 3: Holt exponential smoothing** — line/area's "Show trend / forecast line"
  gets a **Forecast method** choice (`Studio.CHARTS.line.opts`: `trendMethod` linear/holt, `alpha`, `beta`)
  alongside the existing OLS linear trend: Holt's level+trend smoothing tracks recent moves in the data
  (drawn as a multi-segment path over the fitted history) instead of one straight slope, then extrapolates
  the same way across `forecastPeriods`. `PDC.line`/`_lineOpts` in `studio-charts.js`; `docs/index.html`
  updated. 3 new tests. Test suite 951/951.
- v200: **Z6 follow-up: ¶ Text button relocated** — moved from the live-preview canvas bar into the
  Query Library pane header beside "＋ New source" (both are "add something to the dashboard"
  affordances). Same id/behavior, just relocated. Fixed a latent `--text-secondary` CSS var bug found
  along the way (nonexistent token, corrected to `--muted`). 1 new test. Test suite 952/952.

- v203: **N-FUN slice 4: command palette recent/frequent ranking** — see Z-track N entry above. 3 new
  tests, suite 955/955.
- v204: **Z7 slice 4: statistical KPI computations** — see Z7 entry above. 7 new tests, suite 962/962.
- v205: **Track L architecture sweep (accessibility): modal() close button aria-label** — see Track L
  findings log above. 2 new tests, suite 964/964.
- v234: **Z4 slice 2: Databricks connector** — see Z4 entry below. 15 new tests, suite 1092/1092.
- v235: **Z5 follow-up: Deploy target config in Settings** — see Z5 entry above. 5 new tests; merged with
  the concurrently-shipped v234 Databricks connector, combined suite 1096/1096.
- v236: **Z12 loose end: real PNG apple-touch-icon** — see Z12 entry below. 2 new tests, suite 1097/1097.
- v237: **Z4 slice 3: BigQuery connector** — see Z4 entry below. 15 new tests, suite 1112/1112.
- v238: **Z4 slice 4: Generic SQL/HTTP connector** — see Z4 entry below. 15 new tests, suite 1127/1127.
- v239: **Z3 follow-up: Workbooks** — see Z3 entry above. 7 new tests, suite 1134/1134.
- v240: **N-DIST: shareable dashboard links (#share=)** — see N-DIST entry below. 3 new tests, suite 1137/1137.
- v241: **Track L sweep: de-duplicated violin/ridgeline KDE math** — see Track L findings log below. Pure
  refactor, no new tests. Test suite 1137/1137, unchanged.
- v242: **Z3 follow-up: workbook rename (closes the last open Z3 item)** — every workbook chip on the
  Repository page gets a hover-revealed ✎ rename button beside the existing ✕ delete; click it to swap
  the chip label into an inline `<input>` (Enter saves, Escape cancels), same convention as panel/KPI
  rename. A bare native `dblclick` on the chip doesn't work here — each single click already re-renders
  the whole chip strip (to apply the filter), which resets Chromium's double-click target tracking since
  the "same" chip is technically a fresh DOM node after the first click — so this uses a dedicated button
  instead. 3 new tests, suite 1140/1140.
- v243: **N-DIST: installable, offline-capable app shell** — see N-DIST entry below. 4 new tests, suite
  1144/1144.
- v244: **Track L: restored the CI test gate lost in the v60 repo migration** — see Track L findings log
  below. CI-only, no app code changed; suite unaffected at 1144/1144.
- v245: **N-DIST follow-up: offline precache now covers the catalog + every example** — closes the "not
  yet done" note from v243. `sw.js` precaches `data/cda-catalog.json` + `data/examples/index.json` at
  install time, then reads that index to precache every listed example spec too, so a first-ever offline
  visit has a real, populated library and Examples gallery — not just a blank shell. Cache bumped to
  `studio-shell-v2`. 1 new test, suite 1145/1145.
- v246: **N-DIST follow-up: verified Home works fully offline (test-only)** — see N-DIST entry below.
  No app code changed. 1 new test, suite 1146/1146.
- v262: **Z1 follow-up: section-switch entrance motion** — see Z1 entry above. Caught + fixed a real bug
  along the way: the first cut used a `translateY` transform, but `#appMain` has `position:fixed`
  descendants (`#mobile-tabs`/`#statusbar` at phone width) and a *lingering* transform/animation on an
  ancestor becomes their containing block instead of the viewport — broke their fixed positioning on
  every real Studio-section switch (caught by the m-d regression test). Fixed: opacity-only animation +
  an `animationend` cleanup so the class never lingers. 3 new tests, suite 1191/1191.
- v263: **N-DATA: Auto-arrange — one-click panel layout** — see N-DATA entry below (closes the "smart
  auto-arrange layout" idea). 4 new tests, suite 1195/1195.
- v264: **N-DIST: Import dashboard from URL** — see N-DIST entry below (closes the "local template
  gallery via URL import" idea, first cut — single spec URL, not yet an index of several). 2 new tests,
  suite 1197/1197.
- v273: **N-AI: auto-placed callout markers on the notable point** — see N-AI entry below (closes the
  "auto-placed callout markers on the notable points" item). 5 new tests, suite 1231/1231.
- v274: **Track H sweep: ⋯ More menu grouped into labeled sections** — see Track H findings log below
  (closes the sweep-cadence gap — the dedicated H-track log hadn't been fed since v125/v126). Purely
  additive `.grp` section labels (Connect / Present / Help & power tools), no button id/behavior changed.
  2 new tests, suite 1231/1231.
- v283: **Visual refresh (A) follow-up: focus-visible rings + prefers-reduced-motion audit on the
  exported dashboard chrome** (`vendor/pdc-ui.css`, distinct from the app chrome Z10 already covers) —
  every button/link/select/input/tabindex element now gets a real keyboard focus ring, header controls
  get a white-tinted ring for contrast on the dark header gradient, and every hover/enter transition +
  the query-modal fade now respect the OS reduced-motion preference. Found and fixed a real bug along
  the way: the info-dot (`.pdc-i`, a genuine `tabIndex=0`/`role=button` element) and two form fields set
  `outline:none` on focus with no replacement, so keyboard users saw zero focus indicator. 8 new tests
  (CSS coverage + real keyboard-focus/emulated-reduced-motion checks against the live preview), suite
  1272/1272.
- v284: **N-DESIGN follow-up: glass-edge modal/drawer surfaces** — the CDA query inspector modal
  (`.pdc-qm`) and drill-to-detail drawer (`.pdc-dt`) now carry the same `--panel-glass` inset highlight
  KPI tiles/chart cards got in v280, closing the "modal/sheet surfaces" half of that item's "still open"
  note. 2 new tests, suite 1274/1274.
- v285: **N-DEV: shortcuts cheat-sheet now lists Ctrl/Cmd+K** — audited every document-level keydown
  listener against the "?" shortcuts modal's rows and found the command palette (the single most
  powerful shortcut) was the only one missing; added as the first row. 1 new test, suite 1275/1275.
- v286: **Track L (a11y lens): Repository search field keyboard focus ring restored** — see the Track L
  findings log below. 1 new test, suite 1276/1276.
- v289: **N-FUN: live "what-if" sliders for forecast knobs (first cut)** — the Line/area inspector's
  Holt-Winters forecast knobs (α/β/γ/season length/MA window/forecast periods) are now drag-to-animate
  range sliders with a live value badge, reusing the existing live-refresh wiring so the trend/forecast
  line re-shapes as you drag. New generic `type:"range"` option in `optField()` (`app/studio.js`) any
  chart's opts can reuse. 3 new tests, suite 1288/1288.
- v290: **N-FUN follow-up: range sliders on the rest of the percentage-shaped opts** — Donut's Inner
  radius %, Stream graph's Band opacity %, Parallel coordinates' Line opacity %, and Gauge's Warning/Good
  zone % thresholds. 2 new tests, suite 1290/1290.
- v291: **N-DATA: cross-filter extended to Lollipop** — `wireXFilter()` gains a lollipop branch (tags
  each `circle.dot`); `ANNOT_CAPS.crossFilter` includes lollipop so the inspector section appears. 2 new
  tests, suite 1293/1293.
- v292: **Track L sweep (dead-code lens): removed 3 orphaned `Studio.*` exports** —
  `DuckDB_ensureEngine`/`SQLiteHttp_ensureEngine`/`xmlEscape` had zero call sites anywhere in the repo.
  Pure deletion, no behavior change, suite unchanged at 1293/1293.
- v293: **N-DESIGN: chart "skins" first cut — Card style (Raised / Flat)** — a per-dashboard picker that
  strips the shadow/glass-edge/hover-lift on every chart card + KPI tile for a quieter, editorial-minimal
  mood. Pure additive CSS override, same pattern as headerBg/titleSize/subtitleStyle. 4 new tests, suite
  1297/1297.
- v294: **N-DESIGN follow-up: Settings default + style-preset parity for Card style** — plus a found-and-
  fixed pre-existing gap: `studio-default-dashboardtheme` (v281) had never been added to the "Clear local
  data" key list. 5 new tests, suite 1302/1302.
- v295: **N-DATA: cross-filter extended to Funnel** — `wireXFilter()` gains a funnel branch (tags each
  new `.funnel-bar` stage rect); `ANNOT_CAPS.crossFilter` includes funnel so the inspector section
  appears. 3 new tests, suite 1305/1305.
- v296: **Visual refresh (A) follow-up: Fleet Modern app-chrome theme** — Settings' Color theme picker
  gains a third option (Classic Blue / Polecat / **Fleet Modern**), reusing the exact
  jobtracker.polecat.live tokens already validated for the Fleet Modern DASHBOARD theme
  (`Studio.DASHBOARD_THEMES`, v281), additive alongside the existing two (exported dashboards
  untouched). Rail/hamburger get a matching navy palette; `docs/index.html` picks it up too.
  **Found + fixed a real bug**: the theme-label lookup was declared inside the wrong closure (a
  per-iteration `groups.map` callback instead of the enclosing `renderSettings`), so the Settings
  onchange handler threw a silent `ReferenceError` and the theme-switch confirmation toast never
  fired for ANY of the three options — caught by a test that asserts the toast's actual text, not
  just the `data-app-theme` attribute. 5 new tests, suite 1310/1310.
- v297: **N-DATA: cross-filter extended to Waterfall** — new `wf-bar` class on each step rect
  (synthetic "Total" bar gets `wf-total`, deliberately excluded); `ANNOT_CAPS.crossFilter` now
  includes waterfall. Fixed a pre-existing timing flake in the Z7 Holt-Winters test suite. 3 new
  tests, suite 1313/1313.
- v298: **N-DATA: cross-filter closes out the stacked/grouped bar family** — Stacked bars, Grouped
  bars, and 100% Normalized Stacked Bar all emit a cross-filter now (click anywhere in a
  stack/group filters to the whole category); `_stackedOpts`/`_groupedBars`/`_barNorm` self-tag
  every segment with `data-xf-label` directly at render time since these can render a variable
  segment count per category. **Found + fixed a real latent bug**: `wireXFilter()` re-added a
  fresh click listener on every redraw without removing the old one, so 2+ redraws made a single
  click double-fire and cancel the filter right back off — affected every cross-filter chart type;
  fixed with a one-time-attach guard. 11 new tests, suite 1324/1324. **N-DATA cross-filter track is
  now feature-complete.**
- v299: **Track L sweep (accessibility lens): SQL query builder fields regain their keyboard focus
  ring** — `.dsb-sqb-inp` (every FROM/JOIN/SELECT/AGG/WHERE field in the visual SQL/Kettle query
  builder) had the same "outline re-declared inside its own `:focus` rule" bug v286 fixed on
  `.repo-search`, silently killing the keyboard focus ring there too. Fixed by moving `outline:none`
  onto the base rule instead. 1 new test, suite 1325/1325.
- v300: **N-DIST: save a chart as a PNG image (first cut)** — panel inspector gains **Save chart as
  PNG**, rasterizing the panel's live `<svg>` (computed styles inlined onto a clone, so it's
  self-contained) via an SVG-blob → Image → canvas round-trip. Deliberately SVG-only — confirmed the
  "whole-card-in-a-foreignObject" route taints the canvas in Chromium. Visually verified on
  Bars/Donut/Line. 3 new tests, suite 1328/1328.
- v301: **N-DATA: data source freshness badge (innovation sweep + first slice)** — 4 new innovation
  ideas added to the N backlog; shipped the first: any DA with a **Run live** button shows a "Last
  verified live …" / "Never verified live" badge, stamped via the one shared `renderTable(...,
  "live")` call every connector kind already funnels through. 3 new tests, suite 1331/1331.
- v302: **N-DATA follow-up: freshness badge extended to Repository cards** — the "Last verified
  live …" badge now also shows on a data source's Repository card, scoped to the connector kinds
  that are always live-capable (DuckDB/SQLite/Snowflake/Databricks/BigQuery/Generic SQL-HTTP) so
  the hundreds of plain Pentaho catalog cards stay badge-free instead of noisy. 2 new tests, suite
  1333/1333.
- v303: **N-DESIGN follow-up: a broader elevation scale (closes that "still open" item)** — a third,
  deeper `--panel-shadow-xl` tier (light + dark) now sets the CDA query inspector modal (`.pdc-qm`) and
  the drill-to-detail drawer (`.pdc-dt`) apart from the shallower `--panel-shadow-lg` tier shared by
  hover-lifted cards/KPIs — floating surfaces now visibly out-elevate a merely-hovered panel instead of
  tying with it. Pure additive token + two selector swaps, `vendor/pdc-ui.css` only. 2 new tests, suite
  1335/1335.
- v304: **Track L sweep (duplication lens): deduped mean/std-dev/outlier/biggest-move math in
  `app/model.js`** — `Studio.computeInsights` and `Studio.notablePoint` independently rebuilt the same
  filtered numeric-points array and re-derived the same mean/population-std-dev/outlier/biggest-move
  logic byte-for-byte, risking silent drift between the prose insight and the callout marker it's
  supposed to match. Extracted shared `numericSeries()`/`findOutlier()`/`findBiggestMove()` helpers; both
  callers now compute from one source. Pure refactor, no behavior change — suite unchanged at 1335/1335.
- v305: **N-DATA follow-up: freshness badge extended to the library pane (closes that "still open"
  item — the freshness-badge track is now feature-complete across all three surfaces)** — the same
  "Last verified live …" / "Never verified live" badge (v301 DA inspector, v302 Repository) now also
  appears on a data source's card in the library pane's **My Data Sources** section, scoped to the same
  always-live-capable connector kinds. New `window.__studioBuildLibrary` test hook. 2 new tests, suite
  1337/1337.
- v306: **N-DATA follow-up: "Test connection" also counts as a freshness signal (closes the last "still
  open" question on this track)** — the DA inspector's own **Test connection & detect columns** runs a
  real probe against the live source (DESCRIBE/PRAGMA/sample query) for all six direct connectors
  (DuckDB/SQLite/Snowflake/Databricks/BigQuery/Generic SQL-HTTP) — just as strong a liveness signal as
  "Run live" — so each success handler now calls `markDaFreshness()` too, instead of only the shared
  `renderTable(..., "live")` path. 1 new test, suite 1338/1338.
- v307: **N-DATA: orphaned data-access check (dashboard health score, first slice)** — `Studio.validate()`
  now flags a declared data access that no panel or KPI actually references, an info-level "Data access
  “X” is declared but not used by any panel or KPI" note in the existing Checks section — dead config a
  builder would otherwise never notice. First slice of the "dashboard health score" innovation idea. 4 new
  tests, suite 1342/1342.
- v308: **Docs catch-up: freshness badge (library pane + Test connection) and the orphaned-DA Checks
  note** — `docs/index.html`'s "Data source freshness" paragraph now mentions the library pane surface
  (v305) and that Test connection also counts (v306); the Build progress paragraph now calls out the new
  "declared but not used" Checks note (v307). Docs-only, no behavior change — suite unchanged at
  1342/1342.
- v309: **N-DATA: data quality watchdog closes the dashboard health score track (+ two false-positive
  fixes)** — `Studio.validate()` now also runs the Data quality watchdog (v260/v261) over every bound
  (non-orphaned) DA's own sample rows, surfacing each issue as a warn-level Checks note — closes the
  "still open" half of the dashboard health score idea. Found + fixed two false positives in the v307
  "declared but not used" check: a DA bound only to a filter, or only feeding a compound (join/union)
  DA's leftId/rightId, was wrongly flagged unused. 4 new tests, suite 1346/1346.
- v310: **Track N: canvas sticky notes (first cut)** — new Dashboard inspector section "Builder
  notes": small colored, builder-only notes for team brainstorming/review while a dashboard is in
  progress, pinned to a specific panel or general. Deliberately never exported — pure scratch space
  in `localStorage["studio-canvas-notes"]`, keyed by dashboard id, wiped by Clear local data. 5 new
  tests, suite 1351/1351.
- v311: **N-DATA innovation sweep: compare dashboards side-by-side (first cut)** — a "Compare
  dashboards…" button on the Repository page opens a modal to pick any two saved dashboards and see
  a plain-English diff summary — distinct from the existing Version-history diff (which compares a
  dashboard against its OWN past checkpoint). Reuses `Studio.diffSpecs`/`diffSummary` (the same engine
  the version-history diff already established) rather than building a second comparison engine. 5
  new tests, suite 1356/1356.
- v312: **N-DATA follow-up: Compare dashboards gets a real live side-by-side preview (closes the
  "still open" live-preview half of the compare-dashboards idea)** — the modal now renders a genuine
  live preview of each picked dashboard side by side (`Studio.buildHtml` + mock data, the exact same
  render every export/preview iframe uses — not a static thumbnail), widened via a new reusable
  `modal-wide` option so both previews fit comfortably; the plain-English diff list is unchanged below
  them. Docs updated. 3 new tests, suite 1357/1357.
- v313: **Track L sweep (orphaned-state lens): fixed a real Clear-local-data gap** — found
  `studio-k8-dismissed` (the Simple-mode "What's next?" card's dismissal flag) was written on
  dismiss but never wiped by Clear local data, the same recurring "new key, forgot Clear local
  data" bug the v194/v235/v281 notes describe. Hoisted the key list out of the click handler into
  a module-level constant + test hook (`window.__studioClearDataKeys`) so it can be asserted
  against directly instead of via a second hardcoded copy in the test file. 1 test strengthened,
  suite 1357/1357.
- v314: **Track L sweep (accessibility lens): color-swatch pickers gain aria-pressed** — every
  color-swatch button (Dashboard theme, Accent color, Series palette, Builder-note color, Settings'
  default accent color) had `outline:none` and no `aria-pressed`, so only a visual `.active` border
  told you which swatch was selected — a keyboard/screen-reader user got no selection feedback at all.
  Fixed at the source in every swatch's creation/click path (including the one modal — Builder notes'
  color picker — that manually toggles `.active` instead of a full re-render, so its click handler now
  updates `aria-pressed` on all siblings too). Same family of gap the v286/v299 focus-ring fixes closed
  elsewhere. 5 new tests, suite 1363/1363.
- v315: **N-DATA: calculated columns now actually compute (formula-language first cut)** — see the
  Track N entry above. `Studio.evalFormula`/`Studio.applyCalcCols` (model.js), wired into
  `Studio.sampleRows`/`genMock` and `Studio.columnsOf`; live inline validation in the DA inspector.
  10 new tests, suite 1373/1373.
- v316: **(docs-only) Architecture finding: exported/deployed dashboards can't actually query the
  six direct connectors at runtime** — traced while scoping a v315 follow-up; see the ⚠️ writeup
  under Z14 and the updated Z4 "Still open" note. `PDC.cda()` (the exported bundle's only data-fetch
  path) only ever reads injected offline mock data or calls a real Pentaho CDA endpoint; nothing
  dispatches to duckdb.js/sqlitehttp.js/snowflake.js/databricks.js/bigquery.js/genericsql.js at
  runtime, so those connectors only ever work inside the builder's own authoring/preview flow today.
  No code changed — documented as a dedicated future decision (credential-in-static-file concerns
  for the four token-based kinds; DuckDB/SQLite are the safer, credential-free half to fix first).
  Corrected the docs' DuckDB/SQLite/connector paragraphs, which had implied the export falls back
  safely to offline sample data (it doesn't).
- v317: **N-DATA: dashboard Checks now warn about the v316 gap right where a builder can act on
  it** — `Studio.validate()` (model.js) flags any bound (non-orphaned) DuckDB/SQLite/Snowflake/
  Databricks/BigQuery/Generic-SQL data access with a warn-level note: "...has no live query path
  once this dashboard is exported/deployed — outside the builder it will only ever show the sample
  data it was authored against." Never fires for a real Pentaho SQL/MDX/etc. source or a DA already
  flagged orphaned. 3 new tests, suite 1376/1376.
- v318: **Z14 architecture-gap FIX: exported dashboards can now query DuckDB/SQLite live** — closes
  the credential-free half of the v316/v317 finding. `app/studio-render.js`'s `PDC.cda` is now
  wrapped: a spec DA of kind `duckdb`/`httpvfs` is answered by querying its file directly over HTTP
  Range Requests via `app/duckdb.js`/`app/sqlitehttp.js` instead of falling through to a Pentaho CDA
  fetch that has no server-side definition for these DAs (the mock-data preview path and real-Pentaho
  DAs are completely untouched — mock is checked first, same as before). `app/exporters.js` bundles
  each connector's small façade into the export **only when that dashboard actually has a DA of that
  kind**, so a dashboard using neither stays exactly as lean as before; `app/studio.js`'s boot fetch
  now loads both façade files alongside the existing css/js/render/charts bundle. `Studio.withTimeout`/
  `Studio.friendlyConnectorError` (app/model.js, a builder-only module never inlined into the export)
  get a small local fallback copy in studio-render.js — same "local copy of a pure helper" pattern
  already established there for `applyTemplateVars`. `Studio.validate()`'s "no live query path once
  exported" warning no longer fires for duckdb/httpvfs (verified via a real exported-bundle iframe +
  a stubbed `Studio.DuckDB`/`SQLiteHttp.query()`, not just a DOM check) — only the four credential-
  based connectors (Snowflake/Databricks/BigQuery/Generic SQL/HTTP) still need it; docs corrected to
  match. **Still genuinely open (Z4/Z14):** the four token-based connectors need a real design
  decision on shipping a live credential inside a static exported file before they can follow; a real
  hosted-file smoke test for both fixed connectors (needs a live/internet environment). 6 new tests,
  suite 1382/1382.
- v329: **Z7: trend/forecast overlay extended to Bar charts (vertical) and Stacked bars** — closes
  the "bars/stacked" half of the long-open Z7 note. Same `trendOf`/`holtOf`/`holtWintersOf` math
  (linear OLS / Holt / seasonal Holt-Winters) now available on `Studio.CHARTS.bars`/`.stacked` via
  new `showTrend`/`trendMethod`/`alpha`/`beta`/`gamma`/`seasonLength` opts; Bars fits across the raw
  category values (vertical layout only — horizontal bars have no left-to-right sequence), Stacked
  fits over each category's stack total. Wired through `studio-render.js`'s real dispatch (the same
  class of gap the v199 Holt-Winters bug exposed) so preview and every export agree. 9 new tests
  drive real inspector opts through a real panel + preview iframe. Docs updated. Suite 1431/1431.
- v330: **Z7: Combo chart gains a forecast tail** — closes the last open half of the Z7 "extend
  trend/forecast to bars/stacked/combo" note. Combo's line series now supports `forecastPeriods`
  (same field as Line), widening the bar-slot count so the trend/forecast line projects into new,
  bar-less slots past the real data, with matching "+1/+2/…" ticks and a dashed separator; the
  right-axis scale now accounts for forecasted values so a rising/falling projection isn't clipped.
  4 new tests. Docs updated. Suite 1435/1435.
- v331: **N-FUN: "what changed since your last visit" digest** — closes the innovation-backlog idea.
  A new `studio-last-viewed` map (stamped only by actually opening a dashboard, not by every
  autosave tick) plus the existing Version-history checkpoints feed `changesSinceLastView()`, which
  reuses `Studio.diffSpecs`/`diffSummary` (the same engine Version-history-restore and Compare-
  dashboards already share) to show a small "N changes since you were last here" hint on Home/
  Repository recent-dashboard cards. 6 new tests, suite 1441/1441.
- v332: **Z8: 'Show legend'/'Show data points' get real before/after thumbnails** — extends the
  v323 opt-in `.opt-hint-pop` popover to two more hint families. 4 new tests, suite 1445/1445.
- v333: **Track L a11y fix: `.opt-hint` keyboard focus ring was silently suppressed** — third
  instance of the "outline re-declared inside its own `:focus` rule" bug shape (v286/v299). 1 new
  test (a static CSS-source guard — a live focus simulation is unreliable for a non-form element
  once any mouse click has occurred on the page). Suite 1446/1446.
- v334: **N-DESIGN: "High Contrast" dashboard theme** — a third `Studio.DASHBOARD_THEMES` preset,
  true black/white extremes with its own `dataviz`-validated series palette. 5 new tests, suite
  1451/1451.
- v335: **Z8: 'Show value/label'/'Rotate labels' get real before/after thumbnails** — extends v332
  further; `showPct` stays tooltip-only, still proving the mechanism is opt-in. 4 new tests, suite
  1455/1455.
- v337: **N-DESIGN: "Editorial" dashboard theme + a shared banner-gradient fix** — a fourth
  dashboard theme (warm paper-and-ink mood); found + fixed a real gap shared by every non-Classic
  theme (`vendor/pdc-ui.css`'s `.pdc-header` gradient had a hardcoded second stop, leaving a stray
  navy sliver on Fleet Modern/High Contrast banners) with a themeable `--header-bg-2`. 7 new tests,
  suite 1464/1464. (v336, a concurrent run's Track H topbar-grouping polish, interleaved here too.)
- v338: **N-DESIGN: "Neon" dashboard theme** — a fifth `Studio.DASHBOARD_THEMES` preset (synthwave
  mood, near-black panels + cyan/magenta accents, header/sidebar stay near-black in both light and
  dark app mode); own `dataviz`-validated series palette. 6 new tests, suite 1476/1476.
- v339: **Track L: harden the flaky panel dup/delete test, round 2** — see Track L findings log
  below. Test-only, no product change. Suite 1476/1476.
- v375: **Fix: dark mode now reaches Home, Dashboards, Datasets, Connections, Jobs and Settings**
  — closes the worst-offender finding carried across two UX sweeps (#10 2026-07-16, #24
  2026-07-17). All five primary sections shared one base rule (`.app-sec` in `app/studio.css`)
  that hardcoded a dark background + cream text regardless of `[data-theme]`, so the light/dark
  toggle only ever reached the Studio builder/Inspector. Every hardcoded color in the Home/
  Dashboards/Datasets/Connections/Jobs/Settings chrome (surfaces, borders, text, the accent) now
  resolves through the same tokens (`--bg`/`--ink`/`--muted`/`--faint`/`--field`/`--pane`/
  `--pentaho`) already driving the rest of the app, so these sections follow both light/dark mode
  and all three app themes (Classic Blue/Polecat/Fleet Modern) — not just Polecat dark, which is
  what the literals happened to match. Left deliberately untouched: the permanently-dark left
  rail/`#mobileNavBtn` (by design, never follows `[data-theme]` — see the Z1 rail comment) and
  the story-mode screenshot overlay (`.ss-*`, its own fixed black canvas). SW cache → v26. Suite
  1542/1542, verified visually via Playwright screenshots of Home/Settings/Dashboards/Connections
  in both themes.
- v376: **Fix: the welcome tour traps keyboard focus, closes on Escape** — closes UX sweep finding
  #2 (carried across #10 2026-07-16 and #24 2026-07-17). `app/welcome.js`'s full-viewport overlay
  hides the header nav trigger behind it but had no focus trap, so a keyboard (Tab) user could
  tab straight past the tour's own Skip/Back/Next buttons into that hidden control instead of
  staying inside the dialog. Tab now cycles within the open tour, Escape closes it (same as
  Skip), and closing restores focus to whatever opened it — the same contract the vendored
  shell's `modal()`/`sheet()` already use elsewhere in the app (kept as a hand-rolled trap rather
  than switching to `modal()` outright, since the tour's `.sw-*` markup/CSS and existing tests are
  built around its own structure). SW cache → v27. 4 new tests, suite 1546/1546.
- v378: **Fix: 2px horizontal scroll on the mobile Help page** — closes UX sweep finding #4
  (carried across #10 2026-07-16 and #24 2026-07-17). `docs/index.html`'s Exporting table used
  auto table-layout, and unbreakable `<code>` tokens inside it (`.html`, `.studio.json`) forced
  the table's min-content a few px past the 390px viewport edge. Scoped `overflow-wrap:anywhere`
  to just those `<code>` tokens (in both the export and shortcut tables) rather than every cell —
  an earlier attempt at `table-layout:fixed` + a blanket cell-level `overflow-wrap` "fixed" the
  scroll but broke short headers like "FORMAT"/"CDF" into mid-word line breaks, worse than the
  bug. Verified no horizontal overflow at 390×780 (light + dark) and no regression at 1280×800.
  No product-code test coverage (static reference page, not exercised by `tests/run.js`) —
  verified via a one-off Playwright scrollWidth/screenshot check instead. Suite 1549/1549
  (unchanged, no new product surface).
- v379: **Fix: mobile hamburger button undersized, stale gate doc comment** — closes UX sweep
  finding #5 (2026-07-17 #24, new) and finding #3 (carried across #10 2026-07-16 and #24
  2026-07-17). `#mobileNavBtn` was 40×40px, under the 44×44px thumb-target guideline; grown to
  44×44 with `#topbar`'s left clearance bumped 52px→56px to match (m-c's overlap-avoidance
  pattern, still a single source of truth). `app/gate-config.js`'s "Default passcode:
  pentaho-studio" comment was stale — the live gate has rejected it since the access codes were
  rotated — corrected to point at the real rotated hashes in `STUDIO_GATE_SHA256`. SW cache →
  v29. 1 new regression check (hamburger ≥44×44px at 390px); suite 1550/1550.
- v382: **Fix: stale gate passcode in PUBLISH.md** — closes tech-sweep finding #2 (2026-07-18
  #40). v379 fixed the identical stale "Default passcode: pentaho-studio" claim inside
  `app/gate-config.js`'s own comment but missed the published runbook; `PUBLISH.md` now
  describes the rotated-hash model instead of a specific code. Doc-only, no product surface
  change; suite unchanged.

## NEXT (top = do first)

### ⬢ PLATFORM MIGRATION (2026-07-15, assigned — runs ALONGSIDE the product backlog, one slice per PR)
> The staged plan for bringing the Studio onto the Polecat platform (docs/MIGRATION.md #6 in
> kevinrhaas/polecat-platform). Product work (★ blocks below) continues between slices — the app
> doesn't stop for the migration.
> 1. ✓ **Process adoption (this slice):** steward/<topic> PR flow, CLAUDE.md agent guide, Guard
>    main auto-revert workflow, self-stamped changelog + verify-only `tools/changelog-check.js`,
>    this protocol rewrite.
> 2. ✓ **Vendor the shell (shipped):** `polecat-platform/lib/` v0.1.0 → `vendor/polecat-shell/`
>    (READ-ONLY; the suite now sha256-verifies every vendored file against MANIFEST.json).
>    Theming bridge: `tokens.css` loads before `studio.css` (the Studio wins every shared
>    name), a bridge block in studio.css expresses the shell's canonical tokens in Studio
>    values for all 6 theme combos, and `data-palette` mirrors `data-app-theme` (stamped
>    pre-paint in gate.js + in setAppTheme). Historical `studio-theme` / `studio-app-theme`
>    keys unchanged — no user state lost. SW cache bumped to studio-shell-v5. NOTE: the shell's
>    own theme.js stays unused for now (it wants ONE `palette:mode` storage key; the Studio
>    keeps its two historical keys and stamps the attributes itself — same contract, no loss).
> 3. ✓ **Fleet waffle app-switcher (shipped):** `app/fleet.js` (ES module) imports the vendored
>    `appSwitcher` + `publicFleet()` + icon registry and mounts the waffle in the app bar (left
>    of ＋New). The vendored shell.css is deliberately NOT loaded (it styles generic .btn/.chip/
>    .field and would fight the Studio's components) — ps-waffle-* is skinned in studio.css on
>    the bridged tokens. SW cache → studio-shell-v6. SHELL FIX TO UPSTREAM (platform PR, shell
>    v0.1.x): appSwitcher's outside-tap dismiss binds `mousedown` only — mobile Safari needs
>    `touchstart` too (the Studio's own m-e lesson); meanwhile Escape / re-tap / link-click all
>    close it fine.
> 4. ✓ **What's-New via the shell (shipped):** the footer Changelog button now opens the feed in
>    the vendored `rightPanel` (focus-trapped dialog, Escape/backdrop/✕ close, full-height phone
>    sheet), with the shell's seen-version contract (`hasUnseen`/`markSeen` from whatsnew.js, new
>    key `studio-whatsnew-seen`) driving an unseen dot on the button. DELIBERATE DEVIATION: the
>    shell's `initWhatsNew` feed BODY was not adopted — the Studio's own feed is richer (E6 live
>    search with <mark> highlighting; tests assert it) — so the shell contributes container +
>    seen-state, the app keeps its body. Old floating-popup code deleted. SW cache → v7. SECOND
>    UPSTREAM FIX for the same shell v0.1.x PR: rightPanel's backdrop dismiss also binds
>    `mousedown` only (needs `touchstart` for mobile Safari — the visible ✕ covers the gap).
> 5. **WAIT for shell v2** before touching the Studio three-pane workspace (in-grid views,
>    inspector-grade right panel). If a needed shell capability doesn't exist, build it in
>    `polecat-platform/lib/` via a platform PR (bump lib/VERSION + gen-manifest) — NEVER by
>    editing the vendored copy.
> Look-ahead noted for the roadmap: the `app/sources/` adapter architecture (schema.js contract,
> meta/data capability planes) is the platform's DataSource template — analytics is slated as the
> suite's cross-app reporting substrate, and Supabase (the planned main backend) is Postgres this
> app already speaks. Keep logging concrete cross-app reporting opportunities here as they appear.

### ★★★★ VIRIDIS VIEW / GEO-ANALYTICS TRACK (2026-07-16, user-directed — TOP priority)
> **The case:** CTIC's Viridis View RFP (bid due 7/31, $35–45K, launch Nov 18–19 at SAS) — a public
> tool showing county-level cover-crop + conservation-tillage adoption (2015–2025, annual updates
> to 2030) from FIVE providers (DTN, Indigo/Terion, Iowa State, Regrow, Terra Diagnostics), maps
> colored by the MEDIAN of user-selected providers, linked time-series charts with AgCensus
> reference points, at county/State/CRD/HUC8 scales, Corn Belt focus, embedded free on ctic.org.
> KEY FRAMING (per the office-hours prep): this is an ENSEMBLE — the median is the estimate, the
> provider spread is uncertainty information to show honestly, not noise to hide. Provenance,
> no-data handling and simplicity beat slick visuals for this audience. Static/client-side is the
> winning architecture (data is single-digit MB gzipped; geometry is the heavy asset).
> **Charter (user, 2026-07-16):** extend Analytics to support this case — non-expert-easy (Simple
> mode hides machinery; Home features live dashboards; pins/favorites/recents), a simpler
> dataset-first "Explore" designer feeding Studio, BOTH MapLibre GL JS and D3+TopoJSON attempted
> behind one geo API, multi-connection + file-type import with mapping, a Viridis demo/sample
> pack (a SECOND sample library, distinct from the CDA catalog), light data-management (jobs:
> mapping/aggregation/rollup/join/union → materialized datasets, repeatable loads), and a public
> marketing site at the root with the app at /app/ (fleet pattern).
>
> **The slices (one steward PR each, tests green, in order):**
> V1. ✓ **Marketing site + app moves to /app/ (shipped 2026-07-16).** Root = marketing page
>     (index.html + css/landing.css, warm-Polecat light/dark, hero + features + sources strip,
>     CTAs → /app/, NO shell per fleet convention). The app index moved INTO app/ with
>     `<base href="/">` so every historical relative path resolves unchanged (module imports
>     resolve against module URLs and were never affected). Legacy root #share=/#view hashes
>     forward to /app/ automatically; manifest start_url → /app/; SW precaches both pages
>     (cache → v11); test server learned directory-index resolution; docs back-link fixed;
>     THIRD-PARTY-NOTICES.md seeded (footer-linked) for the geo libraries to come.
> V2. ✓ **Geo foundation (shipped 2026-07-16) — lighter than planned:** us-atlas ships
>     PRE-PROJECTED AlbersUsa TopoJSON, so the ONLY runtime lib is topojson-client (~7KB, ISC);
>     d3-geo/d3-array are BUILD-TIME only (tools/build-geo.mjs, reproducible, commits outputs).
>     vendor/geo/: counties+states (us-atlas, ISC), county→CRD mapping (NASS, PD; CRD polygons
>     derived at runtime via topojson.merge), HUC8 Corn Belt (571 subbasins, USGS WBD via the
>     National Map REST w/ server-side generalization, reprojected onto the same 975×610 plane,
>     173KB gz). ALL FOUR SCALES SHIPPED (county/state/CRD/HUC8 — Kevin: CRD+HUC8 needed for the
>     demo). `choropleth` chart type: median-default duplicate aggregation, auto-zoom to data,
>     hatched no-data + legend, state-border overlay, hover tooltips, id normalization (4/5-digit
>     FIPS, postal/name/FIPS states, 7/8-digit HUCs), theme-aware computed ramp (license-free).
>     Exports inline topojson-client (ISC banner intact) + only the geometry the spec needs —
>     mapless dashboards carry zero geometry; CLI export (tools/lib.js) has parity. Sample engine
>     emits real Corn Belt FIPS for fips-ish columns so fresh map panels render colored. SW → v12.
>     Licensing: THIRD-PARTY-NOTICES.md updated (suite-asserted). Marketing site: one modest
>     clause added per Kevin ("also" feature, not a takeover).
>     ✚ RENAMED (Kevin, 2026-07-16, shipped same day): the product name is just **"Analytics"**
>     — "Dashboard Studio" dropped from the public site, app chrome (topbar/rail/gate/welcome/
>     status bar), site.webmanifest, docs, exported-dashboard titles, and file banners. The
>     shared-shell catalog tagline updated via platform PR #39 (shell v0.1.1; vendored copy
>     synced here in the same slice); carousel screenshots re-captured with the new name.
>     Internal module names (Studio.* API, studio-*.js, storage keys) deliberately unchanged.
>     ✚ V1 follow-up (Kevin, 2026-07-16, shipped same day): the landing page's single static
>     screenshot became an auto-playing hero CAROUSEL of six REAL app screens (JobTracker-style:
>     fade slides, captions, dots, arrows, hover/focus pause, reduced-motion + offscreen aware).
>     Screens: builder light (flagship) / builder dark (finance), exported flagship in dark, the
>     marketing-growth chart showcase, a Corn Belt county choropleth, the ensemble chart —
>     captured from the REAL app + real Studio.buildHtml exports by tools/gen-shots.mjs
>     (committed baselines in site/shots/, regenerate whenever showcased features change; the
>     Viridis screens keep "also"-feature billing: slides 4-5 of 6, general product first).
>     SW → v13 (shots deliberately NOT precached — runtime cache covers them).
> V3. **Ensemble views — THE MEDIAN IS THE PRODUCT (user, 2026-07-16):** the goal is a SINGLE
>     BEST COMMON ESTIMATE, not a comparison of providers — that's the whole point of the
>     collaborative ("gain a common view"). Design consequences, non-negotiable:
>     · Visual hierarchy: the median renders BOLD and first-class everywhere; provider series
>       are thin, muted supporting evidence (toggleable, but never co-equal stars).
>     · The choropleth ALWAYS colors from the median of the selected providers — never from a
>       single provider. Tooltips/KPIs report the median as THE value; providers appear as
>       provenance beneath it.
>     · The agreement band expresses CONFIDENCE IN the common estimate (tight band = high
>       confidence), not a compare-the-vendors affordance. Wording throughout: "common
>       estimate" / "consensus", never "compare providers". Neutrality is the brand.
>     ✓ SHIPPED 2026-07-16: `ensembleSeries` chart (bold 3px median line + dots; provider
>     series at 1.3px/50% opacity with hollow dots; translucent agreement band with a
>     confidence tooltip; refSeries (AgCensus) as hollow red squares NEVER in the median;
>     legend leads with "Common estimate"; provider on/off chips owned by the chart, exactly
>     the mock-ups' toggle column). Linkage via PDC.ensembleBus — a per-document pub-sub that
>     ships inside preview iframes AND exports (no filter-system surgery): toggles publish the
>     selected set on a channel (default "providers"); the choropleth's new seriesCol binding
>     joins the channel and re-aggregates via the SAME PDC.aggValues the chart uses (proven in
>     tests: legend domain shifts to the exact 4-provider median when a provider drops).
>     Empty-ensemble is prevented (last provider can't toggle off). NOTE: the dashboard-level
>     filter system was deliberately left untouched — V5's Explore can layer a filter-control
>     surface over the same bus later.
> V4. ✓ **MapLibre renderer (shipped 2026-07-16):** MapLibre GL JS v5.24.0 vendored
>     (vendor/maplibre/, BSD-3-Clause, LICENSE + notices row; NOT precached — runtime cache)
>     behind the SAME PDC.choropleth API via a per-panel `renderer` opt (svg default | gl).
>     KEY TRICK: no second geometry set — the pre-projected 975×610 plane maps into MapLibre's
>     mercator space exactly (x linear in lng, y linear in mercator-y, lat=gd(m)), so GL
>     re-projects onto the identical planar shape the SVG renderer draws. No basemap tiles ON
>     PURPOSE (tiles would phone external servers; exports stay self-contained/offline). GL
>     panels inline maplibre js+css into preview/export (~1MB, opt-in weight only; CLI parity);
>     ensureGeoAssets pulls it lazily; WebGL-less environments fall back to the SVG renderer
>     automatically (never a blank panel); ensemble-bus recolors preserve the user's camera.
>     VERDICT (side-by-side): keep BOTH. SVG = default (tiny exports, hatched no-data,
>     print-clean, zero GL contexts); GL = the demo/exploration mode (buttery pan/zoom on 3k+
>     counties even under SwiftShader, zoom buttons, hover highlight). Recommend GL for the
>     Viridis live demo dashboards, SVG for everything shipped wide. Suite exercises REAL GL
>     boot in CI (SwiftShader) + the fallback path + lean/inline export splits.
> V5. ✓ **Explore designer (shipped 2026-07-16):** dataset-first flow in a new rail section —
>     pick dataset (workspace first, samples below; live rows w/ typed-sample fallback) → table
>     preview → chart chips (everyday set + choropleth + ensembleSeries w/ scale + refSeries
>     options) → guessed column mappings (editable) → LIVE preview via the REAL Studio.buildHtml
>     in an iframe → SAVE as an "Analysis" (workspace `analyses` table; SCHEMA_VERSION 1→2,
>     additive: local store tolerates, Turso save() self-heals via ensure-DDL — tested — and
>     Supabase gets provisionDeltaSQL in its error hint; its save() also learned to FAIL LOUDLY
>     on non-ok writes instead of silently skipping). Analyses embed their da (self-contained,
>     survive dataset deletion), appear in the Studio library ("Analyses" group, click-add +
>     drag-to-canvas), pin to Home (★ → card → click-through re-opens in Explore), and
>     "Add to dashboard" pushes a panel + da into the current spec. Simple mode with no saved
>     section boots into Explore (Kevin-confirmed direction). Explore param/filter authoring
>     deferred to the V8 jobs layer (analyses inherit dataset {{params}} defaults).
>
> ── ★ HANDOFF (Kevin, 2026-07-16): the REST OF THIS TRACK (V6→V9, in order) is now the ──
> ── TOP PRIORITY for the HOURLY FOCUS RUNS. Complete the Viridis requirements FIRST,   ──
> ── before any other backlog: V6 Home-as-instant-analytics, V7 the demo pack (the RFP  ──
> ── demo itself), V8 prep/load jobs (the base DATA-MANAGEMENT INFRASTRUCTURE — jobs,   ──
> ── mappings, aggregation/rollups incl. acreage-weighted mean, joins/unions,           ──
> ── materialized datasets, repeatable loads), V9 scientific-honesty polish. Satisfy    ──
> ── ALL RFP requirements (bid due 7/31; see the GOAL block above). One slice per run,  ──
> ── same PR discipline; coordinate via open steward/* PRs.                             ──
> ── DESIGN BAR (Kevin, 2026-07-16): every Viridis slice (and supporting work) must     ──
> ── ALSO make the app USEFUL, EASY TO USE, ELEGANT, SIMPLE, and BEAUTIFUL — delight    ──
> ── is a requirement, not decoration (the platform design bar). Non-expert first:      ──
> ── plain-English labels, sensible defaults, empty states that teach, both themes,     ──
> ── mobile as a release gate. Prefer REMOVING complexity over adding controls; polish  ──
> ── ships IN the slice, never "later". If a slice works but feels clumsy, it isn't    ──
> ── done.                                                                              ──
> V6. ✓ **Home = instant analytics (shipped 2026-07-16):** per-dashboard "Feature on Home" flag
>     (house button on every card; rides the dashboards row like pinned). Home renders featured
>     dashboards LIVE — the REAL renderer (buildHtml + genMock) in scaled view-only iframes,
>     theme-following (same postMessage the builder preview uses), click-through opens in Studio.
>     Pinned analyses render as live chart widgets (banner cropped, chart-first) that reopen in
>     Explore. Hydration is LAZY via IntersectionObserver — fixes the hidden-section scale(0-width)
>     bug AND spares offscreen work. Simple-mode boot: featured content → Home, none → Explore,
>     user's own last section always wins (reconciles V5/V6 boot directions). Suite guards the
>     scale factor explicitly (never the hidden-section scale bug again).
> V7. ✓ **Viridis demo pack + sample-pack framework (shipped 2026-07-16):** a SECOND sample
>     library ("Demo packs", `app/demopacks.js`) separate from the CDA catalog — Settings and
>     the Studio library both gain a hide-samples-aware "Demo packs" group nested under the same
>     `showSamples()` toggle as the built-in Samples catalog. One-click **Install** writes ordinary,
>     tagged (`demoPackId`) workspace rows — a raw-column-named provider CSV (`kind:'file'`, the
>     file-connection + mapping demo: real live rows through the file adapter, raw headers like
>     `Provider_Name`/`Adoption_Pct` a user maps onto chart roles), 4 pinned Ensemble analyses (one
>     per practice: cover crops/no-till/reduced tillage/conventional), and 1 featured "Viridis
>     View" dashboard (4 Ensemble panels + 1 provider-colored county choropleth) — so it appears
>     live on Home the moment it's installed, via the EXACT V5/V6 pinned-analysis/featured-dashboard
>     machinery (zero new Home code). **Remove** deletes every row it wrote and clears the install
>     flag; nothing else touches workspace state. Synthetic content is labeled illustrative
>     throughout (Settings blurb, docs, dashboard subtitle) — it's a sales-demo fixture, not real
>     provider/AgCensus data.
>     ✚ **Sample-engine upgrade (shared, not pack-specific):** `classify()`/`valueFor()` learned
>     `provider`/`practice`/`year` columns (real names, not placeholder numbers/categories) — the
>     same precedent as V2's `geoid` heuristic. New `Studio.crossedRows(da, seriesCol)` crosses a
>     label domain (year or geoid) against the series domain instead of the flat engine's one row
>     per index, wired into `Studio.genMock` for any `ensembleSeries`/`choropleth` panel that sets
>     `map.seriesCol` — so ANY Ensemble or provider-colored map (ours or a user's own) renders a
>     believable multi-provider ensemble in every offline preview (Explore, the Studio canvas, Home
>     tiles), not a single point per label. AgCensus reference rows land sparsely on real release
>     years (2017, 2022) rather than every label. Backward compatible: only activates when
>     `map.seriesCol` is set, so existing single-series choropleth panels (V2's common case) are
>     unaffected. SW cache → v18. Test suite gains a "DEMO PACKS" block (unit tests for the sample-
>     engine heuristics/crossing + full install → verify-everywhere → remove flow).
> V8. ✓ **Prep / load processes (data-management-lite, feature-complete 2026-07-17):** new
>     workspace `jobs` table — a job =
>     ordered steps over datasets: field mapping/rename/cast/derive, filter, AGGREGATE/ROLLUP
>     (group-by + sum/avg/count/median/**acreage-weighted mean** — required for honest State/CRD/
>     HUC8 roll-ups of percent metrics), JOIN/UNION across datasets (the 5-provider normalize-and-
>     stack case), output → materialized workspace dataset; execute on demand, re-run for annual
>     updates; optional custom-SQL step via the existing engines. Client-side executor first.
>     ✓ **Slice 1 shipped (2026-07-17):** the single-dataset prep pipeline — `app/sources/
>     jobs-engine.js` (pure, unit-tested) runs ordered rename/cast/derive/filter/aggregate steps
>     over one source dataset's live rows; derive takes two explicit `{col}`/`{value}` operands
>     (no string-sniffing ambiguity); aggregate's `wmean` metric is the acreage-weighted mean
>     (skips rows missing either half of the value/weight pair rather than treating them as zero).
>     New **Jobs** rail section (list + editor: name, source dataset, reorderable step cards,
>     live Preview) mirrors the Datasets section's UX. Running a job materializes the result as an
>     ordinary `kind:'file'` dataset (tagged `job-output`, same shape localfile.js already speaks —
>     zero new dataset-kind code) and re-running the SAME job updates that dataset in place via
>     `job.outputDatasetId` (the annual-refresh case). Schema v2→v3 (additive: Turso self-heals via
>     the existing `WS.TABLE_NAMES` loop; `provisionDeltaSQL` now covers analyses+jobs together for
>     Supabase's paste-me path). SW cache → v19; docs gain a Jobs section.
>     ✓ **Slice 2 shipped (2026-07-17):** JOIN and UNION across datasets. The engine stays pure/
>     synchronous (`Studio.runJobSteps(input, steps, ctx)` now takes an optional `ctx.datasets`
>     map); `studio.js`'s new `resolveJobCtx` runs every dataset a job's join/union steps
>     reference through the real adapters BEFORE calling the engine, so join/union work against
>     live rows from any connection type. **join** (`{op:'join', datasetId, leftCol, rightCol,
>     type:'inner'|'left', prefix?}`) adds the right dataset's non-key columns onto matching left
>     rows (inner drops unmatched, left keeps them with blank added columns); a name collision with
>     an existing column gets an automatic `_2` suffix so a join can never silently overwrite data.
>     **union** (`{op:'union', datasetId, columnMap:[{to,from}]}`) is the normalize-and-stack case:
>     it reshapes the right dataset's rows onto the pipeline's EXISTING schema via an explicit
>     per-column mapping (falls back to a same-name match, else blank) — run once per additional
>     provider dataset, this is exactly the 5-provider case the Viridis rollups need. Job editor
>     gained dataset-picker + key/type fields for join and a column-mapping editor for union.
>     SW cache → v20; docs updated.
>     ✓ **Slice 3 shipped (2026-07-17): the Custom SQL step.** New `sql` op runs an arbitrary
>     query against the pipeline's CURRENT rows, table-aliased `t`, via DuckDB-Wasm (the same
>     engine Z14 slice 1 already vendors for remote-file querying) — `app/duckdb.js` gains
>     `queryRows(columns, rows, sql)`, which registers the rows as in-memory CSV text via
>     `registerFileText()` (no network) instead of `registerFileURL()`, so the query never
>     leaves the browser. The pure engine in `jobs-engine.js` stays synchronous and
>     DOM/engine-free — `Studio.runJobStepsAsync(input, steps, ctx, sqlRunner)` is the new
>     orchestrator that splits a job's steps at `sql` boundaries, runs each pipe segment
>     through the existing `runJobSteps`, and awaits `sqlRunner` (DuckDB in the app, a fake
>     function in tests) for each `sql` segment; a job with no `sql` step never touches the
>     engine, so the WASM load stays fully lazy. `runJob()` and the job editor's Preview both
>     switched from `runJobSteps` to `runJobStepsAsync`. Job editor gained a SQL textarea step
>     (monospace, table `t` hinted). V8 is now **feature-complete**. SW cache → v21; docs
>     updated.
> V9. **Scientific-honesty polish:** first-class no-data/coverage rendering, provenance popover
>     (which providers, coverage, last updated), CSV download of the current selection (the
>     RFP's deferred download question), docs + a "make the ensemble legible" help page.
>     ✓ **Slice 1 shipped (2026-07-17): CSV download of the current selection.** Both the
>     ensembleSeries and choropleth chart legends gain a "⬇ Download CSV" control,
>     self-contained inside `app/studio-charts.js` (no dependency on the app shell's own
>     download() helper, since this module ships standalone in every preview/export iframe).
>     Ensemble exports long-format label/series/value rows for EXACTLY the providers left
>     toggled on plus the computed common estimate and any reference series — a re-download
>     after a provider toggle reflects the new selection live (same `PDC.ensembleBus`-driven
>     re-render V3 already wired). Choropleth exports region id/name/value for what's
>     currently shown post-aggregation (works for both the plain single-series path and the
>     ensemble-channel-linked path; both the SVG and GL renderers call the same shared
>     `geoLegend`). Suite gains 3 checks driving the export end-to-end inside a real exported
>     iframe (intercepting the anchor's `click()` to read the Blob instead of triggering an
>     OS download). SW cache → v22.
>     ✓ **Slice 2 shipped (2026-07-17): the "ⓘ Sources" provenance popover** — which providers,
>     how much coverage — on both charts, next to the CSV button (`provenanceBtn()` in
>     `app/studio-charts.js`, a click-to-open popover that persists while read, unlike the
>     hover-only `_tip`; closes on outside click, Escape, or its own re-click, and only one stays
>     open across the dashboard at a time). Choropleth: "N of M counties/states/CRDs/HUC8
>     subbasins have data (P%)" plus, when a provider/series column is mapped, each provider's
>     own region count (struck through when toggled off elsewhere — computed from the FULL
>     `rowsSV`, not just the channel-filtered rows, so an excluded provider's coverage stays
>     visible instead of disappearing). Ensemble: "N of M providers currently selected" + "N of M
>     points have every selected provider reporting" (the full-coverage count — an honest signal
>     distinct from the agreement band) + a per-provider point count + the reference series'
>     point count with its "never part of the common estimate" reminder. Both popovers are pure
>     functions of data already in the render config — no new dataset-metadata plumbing, so this
>     slice stays self-contained. Suite gains 6 checks (open/content, only-one-open-at-a-time,
>     outside-click, Escape, and a live update when a provider toggle changes the selection).
>     SW cache → v23. "Last updated" (needs dataset/job timestamp plumbed through to the render
>     config — bigger lift than a single slice) and the docs/help page are next.
>     ✓ **Slice 3 shipped (2026-07-17): the "make the ensemble legible" help page.** New
>     `docs/index.html#ensembles` section ("Ensembles & scientific honesty") spells out the
>     design rules the Ensemble chart and choropleth map already implement — median renders
>     bold as the common estimate while providers stay thin supporting evidence, the agreement
>     band is a literal (not decorative) confidence signal, a reference series is context that
>     never joins the estimate, no-data is shown (hatched) rather than guessed — and documents
>     the ⓘ Sources popover + Download CSV controls from slices 1–2, with a pointer to the
>     Viridis View demo pack as a worked example. Linked from the docs nav bar. "Last updated"
>     (needs dataset/job timestamp plumbed through to the render config) remains, tracked
>     separately as it's a bigger lift than a doc slice.
>     ✓ **Slice 4 shipped (2026-07-17): "Last updated" in the Sources popover.** `Studio.buildHtml`
>     (`app/exporters.js`, the one place the live builder preview AND every static export funnel
>     through) resolves each data access's linked workspace dataset and stamps its `updatedAt`
>     into a sibling global, `window.STUDIO_DA_META` — kept OUT of `spec.cda.dataAccesses` itself
>     so this derived, point-in-time value never gets saved back into a dashboard's persisted
>     spec. A job run already bumps its materialized output dataset's `updatedAt` on every
>     mutation (existing `Workspace.put` behavior — no new plumbing there), so this is exactly
>     "when this panel's data was last (re)loaded," matching the annual-refresh model V8 built.
>     `studio-render.js`'s `renderPanel` reads it per panel (`daLastUpdated(ch.da)`) and passes
>     `lastUpdated` into both the choropleth and ensemble render configs; `studio-charts.js`
>     appends a shared "Last updated <date>" line to both Sources popover bodies, omitted
>     entirely when the DA has no linked dataset (samples, direct connectors, synthetic specs) —
>     same "omit rather than guess" convention as the no-data hatching. Docs updated
>     (`docs/index.html#ensembles`) to mention the line. **V9 is now feature-complete — the
>     Viridis View track (V6→V9) Kevin handed off on 2026-07-16 is DONE.**
>
> Open questions parked for Kevin: (a) confirm /app/ move + redirect posture; (b) MapLibre vendor
> size (~850KB) is fine as vendored no-build code?; (c) HUC8/CRD geometry sourcing priority;
> (d) whether Explore replaces "New dashboard" as the Simple-mode default entry.

### ★★★ POST-OVERHAUL BACKLOG (2026-07-13, user-directed — do these FIRST when the loop resumes)
> The adapters → connections → datasets overhaul (see GOAL block) landed its baseline in one long
> interactive session (Polecat default look · app/sources/ adapter layer · Connections/Datasets/
> Dashboards sections · manager-style rail · workspace-backend sync w/ secrets · full Pentaho removal).
> These are the follow-ons, in priority order:
> 1. ✓ **Dashboards into the workspace store (shipped 2026-07-15, steward PR).** The catalog now
>    lives in the Workspace `dashboards` table (rows keep the recents-entry shape {id, ts, spec,
>    workbookId?} + pinned/pinnedAt flags + promoted title/name columns); pins ride ON the row and
>    workbooks moved into workspace SETTINGS, so the remote backend mirrors the whole catalog.
>    One-time boot migration (meta-stamped so an emptied catalog is never re-imported; legacy
>    studio-recents/pins/workbooks kept untouched as a frozen local backup). Home/Dashboards
>    repaint on remote pulls via Workspace 'replaced'. Fixed alongside (recurring clear-data gap):
>    "Clear local data" never wiped `analytics.workspace.v1` (connections/datasets survived a
>    "full" reset since the overhaul!) nor `studio-whatsnew-seen` — both added + tested.
> 2. **More data adapters** (user: "we will add many more"): ✓ **PostgreSQL via PostgREST (shipped
>    2026-07-15** — `app/sources/postgrest.js`, data-only, url/token/Accept-Profile fields,
>    kind:'table' datasets like Supabase since it IS the same protocol; mock-served end-to-end
>    tests incl. the full connection→dataset→{{params}} run path). ✓ **CSV/JSON file-drop
>    (shipped 2026-07-16** — `app/sources/localfile.js`, kind:'file' datasets whose content
>    rides INSIDE the row (offline + mirrors with the workspace; ~2MB cap pointing bigger data
>    at DuckDB remote-file), drop-zone editor branch, RFC4180 CSV w/ delimiter sniff + typed
>    numbers, JSON array-of-objects w/ key-union columns; NOTE: went inline-content instead of
>    File System Access API handles — handles can't persist in localStorage, are Chromium-only,
>    and re-prompt permissions; an FSA "link live file" variant can layer on later). ✓ **Google
>    Sheets (shipped 2026-07-16** — `app/sources/gsheets.js` via the gviz endpoint for
>    link-shared sheets: kind:'sheet' datasets (tab + optional tq query, {{params}} flow into
>    where-clauses), formatted dates, friendly access_denied hint; mock-gviz end-to-end tests.
>    FOLLOW-UP: private-sheet OAuth via Sheets API v4 + bearer token, the BigQuery pattern).
>    Still to do: AWS Redshift (Data API), Azure SQL / Fabric, MotherDuck. Each = one file
>    implementing the contract in app/sources/schema.js + registerSource + wizard fields +
>    tests against a mock.
> 3. **Exported-runtime support for connection-bound datasets** — bundle the needed adapter engines
>    into exports (like duckdb/httpvfs already do) so a shipped .html can run live against Turso etc.,
>    with credentials prompted at open (never embedded).
> 4. **Terminology sweep**: ✓ "My Data Sources" → "This dashboard's datasets" (already shipped, landed
>    silently in the 2026-07-14 UX sprint's dataset-first Data panel work) and ✓ sample catalog groups
>    labeled "Samples" (already shipped, same era) — both confirmed still live in `app/studio.js` as of
>    2026-07-17. Still open: data-source builder → dataset editor naming (cosmetic, code-comment-only
>    today — low value). Still open, but **NOT as simple as it looks**: rename the internal `--pentaho`
>    CSS var → `--brand`. Investigated 2026-07-17 — `--pentaho` is actually TWO independent variables
>    that happen to share a name: (A) the Studio builder-chrome's own accent in `app/studio.css`
>    (~40 refs), already bridged to the shell's `--brand` token one line down (`--brand:var(--pentaho)`)
>    — safe, mechanical to fold together; (B) the exported-dashboard/preview content's own theming
>    primitive (`vendor/pdc-ui.js`/`.css` — PRISTINE, cannot rename — plus `exporters.js`,
>    `studio-charts.js`, `studio-render.js`, every static exported `.html`, and the `spec.themeColor`
>    → `:root --pentaho` contract tests around H103) which has nothing to do with the shell bridge and
>    must stay `--pentaho` forever (or get its own, much bigger, separately-scoped rename). Only (A)
>    (~40 of the ~252 total refs) is safe to fold into `--brand`; (B) is NOT "zero user impact" busywork,
>    it's product-critical export theming under RFP deadline pressure — do not attempt without care to
>    keep the two contexts separate, and ideally with a screenshot-diff of exported dashboards before/after.
> 5. **Dataset delight**: schema browser per connection (list tables/columns via adapter), scheduled
>    refresh hints. ✓ **Result caching with TTL shipped (2026-07-18, steward PR):** the DA
>    inspector's "Cache" section (Enabled checkbox + Duration seconds) dated back to the Pentaho
>    CDA model and was read by nothing — toggling it had zero effect anywhere. Wired it up in
>    `app/studio.js`: reopening a DA's inspector within its cache duration now shows the last
>    successful "Run live" result instantly (labeled "cached", in-memory/page-lifetime only — no
>    new localStorage key, so no "Clear local data" gap) instead of falling back to sample data;
>    an explicit "Run live" click always queries fresh and refreshes the cache. Cache key = DA id +
>    resolved params (dataset defaults ← dashboard template vars ← inspector param inputs), shared
>    via a new `resolveDsParams()` helper so all 7 live-query branches (connection-bound + duckdb/
>    sqlite/snowflake/databricks/bigquery/http) write the same cache their mount-time check reads.
>    Disabling Cache still falls back to sample on reopen. SW cache → v32. 2 new tests, suite
>    1562/1562. Still open: schema browser, scheduled refresh hints. ✓ **Dataset lineage chips
>    shipped (2026-07-17, steward PR):** each row in
>    the Datasets catalog now carries a "↪ N dashboards" badge (`dsxLineage()` in `app/studio.js`,
>    scans every saved workspace dashboard's `spec.cda.dataAccesses` for a matching `datasetId` —
>    the same link `dsToDA` stamps when a dataset is dropped onto the canvas) whose hover title
>    names the referencing dashboards — the "blast-radius view" the backlog asked for. Deleting a
>    dataset that's in use now says so in the confirm prompt (which dashboards, and that they fall
>    back to their own frozen self-contained copy rather than silently going stale — the real
>    behavior per `runData`'s `da.datasetId`-first resolution). 3 new tests. Test suite 1549/1549.
> 6. **Workspace polish**: ✓ **Saved views for the Datasets list shipped (2026-07-18, steward
>    PR).** A search + adapter/tag pill combination can be named and kept as a chip
>    (`dsxLoadViews`/`dsxSaveViews`/`dsxApplyView` in `app/studio.js`) — click the chip later to
>    restore the exact same search text + filters; each chip carries a small trash button
>    (mirrors the Dashboards section's `.wb-chip-wrap`/`.wb-chip-del` workbook-chip pattern
>    exactly, including its already mobile-tested CSS — no new styles needed). Storage rides in
>    Workspace SETTINGS (`datasetViews`, the same schemaless bag `workbooks` already uses), so
>    views sync with the rest of the workspace and need no new localStorage key or "Clear local
>    data" entry — sidesteps the exact "new key, forgot Clear local data" gap the Track L sweep
>    notes above found repeatedly. ✓ **Same treatment for the Connections list shipped
>    (2026-07-18, steward PR):** `connLoadViews`/`connSaveViews`/`connApplyView` in
>    `app/studio.js`, identical chip UX, one axis narrower (adapter pill only — connections
>    aren't tagged); own `connectionViews` key in the same Workspace SETTINGS bag. 5 new
>    regression checks; suite 1560/1560. Still open: drag a dataset card straight onto Home to
>    start a dashboard. (Palette entries for the new sections landed with the 2026-07-14 UX
>    sprint.)
> 7. **Organization at scale (user, 2026-07-14):** dashboards/datasets/connections "will start to
>    become very long lists" — needs favorites/pinning everywhere, grouping (maybe folders, maybe
>    tags — user unsure a tree is right), and cross-cutting views: see datasets by connection, by
>    adapter, by type; dashboards by group/workbook. Design one organizing model shared by all three
>    catalogs (the jobtracker pill/multiselect pattern is the seed) rather than three ad-hoc ones.
>
> **2026-07-14 UX sprint (interactive session, all landed, v349):** split topbar → slim app bar +
> dashboard toolbar above the preview; inline title rename (no phantom "Observability" group);
> Save/Open target the Dashboards catalog with .studio.json under Export; Data panel dataset-first
> (＋New menu: dataset/connection/dashboard-only query; ¶Text → canvas empty state; samples fold
> into one collapsible group); Settings toggle hides/reinstates ALL sample content (never deletes);
> Tour → Settings + ⋯More; renderer info popup lists Datasets; +Workbook empty-name feedback;
> command palette updated for the new sections.

### ★★★ TOP PRIORITY — MOBILE IS BROKEN, FIX IT FIRST (user-requested 2026-07-02, with screenshots)
> **Spend the next several consecutive runs on mobile — ahead of ALL Z-platform work — until the app is
> genuinely usable on a real iPhone.** The user reports (and a 390×844 probe confirms) that mobile is
> "wildly inoperable": no navigation, unreachable buttons, hidden panels, hidden footer. This is not a
> polish item; core flows are dead on a phone. Supersedes/expands **Z9**.
>
> **⚠️ WHY THIS STAYED BROKEN (process fix — read this):** the Playwright harness runs **headless Chromium,
> which has NO browser toolbar**, so bottom-fixed bars render fine in tests while being **hidden behind iOS
> Safari's bottom toolbar on a real phone**. DOM assertions passed; the app was still dead. So: (1) every
> mobile slice MUST **save a screenshot at 390×844 and actually VIEW it** (Read the PNG) — do not trust
> `display`/`classList` checks alone; (2) implement the standard iOS-safe patterns proactively (you can't
> see the Safari toolbar in-sandbox, so code defensively); (3) **final sign-off needs the USER on a real
> device** — after a coherent batch, ask them to re-check. Add a `tests/mobile-shot.js` helper that boots
> at 390×844 (unlock the gate via `sessionStorage["studio-gate-ok"]="1"` in an init script) and dumps a
> screenshot the loop reviews each run.
>
> **CONFIRMED ROOT CAUSES (from the 390×844 probe — start here, don't re-diagnose from scratch):**
> 1. **Left-rail section nav is `display:none` ≤900px** (Z1 scoped it desktop-only) → Home/Repository/
>    Studio/Settings are **unreachable on mobile**. FIX: make the rail a **slide-in left drawer** exactly
>    like the reference **relay.polecat.live** screenshot (brand at top; grouped section list; active item
>    highlighted; scrim over dimmed content; open via a hamburger button in the top bar AND edge-swipe;
>    close on scrim tap / Esc / section pick). This is the centerpiece the user explicitly asked for.
> 2. **Top-action buttons overflow the 390px bar** — `Examples/Open/Save` and even the `⋯ More` escape
>    hatch (`#btnMore`) render **off-screen to the right** (`onScreen:false`), so New/Examples/etc. "don't
>    work" because they can't be reached. FIX: on phones, keep the bar to a few essentials and move the
>    rest into the drawer and/or a **bottom action bar**; guarantee every action is reachable from an
>    on-screen control. (The M7 phone-More items exist but the button itself is off-canvas — fix that.)
> 3. **`#mobile-tabs` (Library·Canvas·Inspector bottom nav) AND `#statusbar` (footer/changelog) are
>    bottom-`fixed` and get hidden behind iOS Safari's toolbar** — they render on-screen in headless
>    Chromium but the user sees NEITHER on device. This is the killer bug behind "panels don't show" (the
>    Library/Inspector are off-canvas drawers reachable ONLY via those hidden tabs) and "can't see the
>    footer." FIX: use `100dvh` (not `100vh`), add `padding-bottom: env(safe-area-inset-bottom)` and
>    `bottom: env(safe-area-inset-bottom)` to the fixed bars, consider `-webkit-fill-available`, and make
>    sure the tab bar and status bar don't overlap each other (both currently sit at bottom:0).
> 4. **Surface the update footer/changelog on mobile** — per the user, if the left drawer is working, put
>    the "What's new"/changelog access there (see the reference relay/app.polecat.live "What's new" panel:
>    a clean full-screen sheet with search + Close). Fold the footer's changelog into the drawer or a
>    reachable sheet rather than the bottom-fixed strip that Safari hides.
>
> **TARGET UX (match the polecat family, per the attached screenshots):** a slide-in left drawer for
> section nav (Relay-style), a persistent reachable bottom bar (or drawer) for Library/Canvas/Inspector,
> every top action reachable, and a full-screen "What's new"/help sheet. Sequence it one shippable,
> screenshot-verified slice per run:
> **(m-a) ✓ DONE (v181):** rail → mobile slide-in drawer + hamburger + scrim, and sections
> now switch full-screen on mobile (shell.js no longer force-pins Studio). `app/shell.js` injects
> `#mobileNavBtn`; `app/studio.css` turns `#railNav` into a fixed off-canvas drawer ≤900px (Relay-style,
> full labels, safe-area padding); scrim / Esc / section-pick close it. Verified visually at 390×844
> (drawer open + Repository full-screen) + 6 tests. **NOTE for m-c:** the Repository section's data-source
> cards overflow horizontally on a phone — fix in the panel-ergonomics slice.
> **(m-b) ✓ DONE (v182):** root cause was `#app{height:100vh}` — iOS Safari's 100vh is the LAYOUT viewport
> (as if the toolbar were hidden), taller than the real visible area while the toolbar shows; with
> `body`/`html` overflow clipped and nothing to scroll, that gap silently stranded `#mobile-tabs` +
> `#statusbar` (the last two flex children of `#appMain`) below the fold. Fixed: `#app{height:100vh;
> height:100dvh}` (100dvh tracks the real visible area live as the toolbar shows/hides; 100vh stays as the
> no-dvh-support fallback), `viewport-fit=cover` added to `<meta viewport>` (required for
> `env(safe-area-inset-*)` to resolve), and `#statusbar` (the true bottom-most element) padded with
> `env(safe-area-inset-bottom)` at phone width. New `tests/mobile-shot.js` screenshot helper (390×844, iPhone
> UA) for future slices to actually view, not just DOM-assert. 3 new regression checks guard the fix's
> source (headless Chromium has no toolbar, so it can't reproduce the bug itself). **Still needs a real-device
> check from the user to fully close out.** Test suite 898/898.
> **(m-c) ✓ DONE (v183):** found and fixed the SAME "later same-selector media rule silently wins"
> pattern from m-b in three more places: (1) `#topbar{padding-left:52px}` (hamburger clearance) was
> clobbered back to `12px` by a later, unrelated `#topbar{padding:0 12px}` rule — the brand wordmark
> rendered UNDER the hamburger; fixed by folding the 52px clearance into that later rule instead of a
> separate earlier one (single source of truth). (2) Even after hiding secondary buttons, the remaining
> essentials still overflowed a 390px bar and `#btnMore` (escape hatch to every other action, including
> the phone-only Examples/Open/Save/Sign out/Clear-data items) scrolled fully off-canvas with zero
> on-screen cue — pinned it `position:fixed` top-right (mirrors `#mobileNavBtn`'s treatment) so it's
> ALWAYS reachable regardless of scroll position, with an opaque background so it doesn't go
> illegible over whatever's scrolled beneath it. (3) The SAME padding-top clobber hit `.home-wrap`,
> `.repo-wrap`, and `.settings-wrap` too — their `≤640px` rules reset `padding-top` back to `28px`,
> so **all three** section headings rendered under the hamburger on phones (not just tablets); fixed
> by keeping `padding-top:60px` in those phone rules. Also fixed **Repository data-source card
> horizontal overflow** (17px past the viewport edge) — a flex row with no `min-width:0` blocked
> `text-overflow:ellipsis` from ever kicking in on a long data-source id, forcing the whole
> 100%-wide card wider than its column. 11 new regression checks. Test suite 906/906.
> **(m-d) ✓ DONE (v184):** `#mobile-tabs` (Library·Canvas·Inspector) was styled `z-index:25` with
> no explicit `position` set — z-index is a no-op on statically positioned elements, so it never
> actually applied. `#mobile-scrim` (z-index:35, covers the full viewport whenever a drawer is
> open) sat on top and intercepted every tap on the tab bar, silently turning a one-tap
> Library→Inspector switch into two (dismiss, then re-tap) even though the tab-switch JS already
> supported jumping directly between drawers. Fixed with `position:relative;z-index:37`. Panel
> touch ergonomics (always-visible ⧉/×/zoom actions, 36-40px targets under `@media(pointer:coarse)`)
> were already handled by prior M3 work and shared by the live preview — verified still correct,
> no changes needed there. 3 new regression checks. Test suite 909/909.
> **(m-e) ✓ DONE (v185):** audited "What's new"/changelog + Help reachability on mobile — both were
> already largely working once m-b's `100dvh` fix landed (the footer/Changelog button is on-screen
> at 390px; Help is present and reachable in the m-a drawer). The one real gap against the reference
> "What's new" sheet design: the changelog popup had no explicit dismiss control (only tap-outside /
> Escape, awkward on a full-width phone sheet with no obvious "outside"). Added a visible ✕ Close
> button (36px tap target at ≤640px) wired to the same close path as tap-outside/Escape. 5 new
> regression checks (✕ present + closes it on desktop, footer button on-screen, ✕ on-screen + phone
> tap-target size, Help on-screen in the drawer — all at 390px). Test suite 914/914.
> **(m-e follow-up) ✓ DONE (v186):** went further on the same gap — the popup now stretches into a
> true near-full-screen sheet on phones (clears the topbar above and the tab bar/status bar below,
> instead of a small floating box that read as empty space) and the outside-tap dismiss now also
> binds `touchstart` (it previously only bound `mousedown`, which mobile Safari doesn't reliably
> synthesize from a touch tap — headless Chromium always looked fine, masking the gap). 2 new
> regression checks (sheet fills most of the viewport; ✕ actually dismisses it).
> **All of m-a through m-e are now shipped and code-level verified.** Per the process note above,
> headless Chromium cannot reproduce the original iOS-toolbar bug, so **the mobile track needs a
> real-device check from the user next** — ask them to reload analytics.polecat.live on an actual
> iPhone and confirm: the hamburger drawer, all bottom bars/footer visible without scrolling, every
> topbar action reachable, and the changelog/Help sheets. Only pick up further mobile polish (or a
> new m-f) once that confirms the fix actually lands on-device, or if the user reports something
> still broken.
> Keep the desktop experience untouched (scope changes to `≤900px` / touch). Update `docs` + STATUS each slice.

### ★★ HIGH PRIORITY — Visual refresh to the fleet's modern look + dashboard version history (user-requested 2026-07-02)
> Do this **right after the mobile track**, ahead of the general Z platform backlog. Two user asks:
>
> **(A) Kill the "blue cast" — align the DASHBOARD to the fleet's modern dark system (ref: jobtracker.polecat.live).**
> The app chrome has the Z10 theme system, but the **dashboards themselves** (preview + exported) still lean on
> the dated flat Pentaho blue (`--pentaho:#005bb5`) — bars, donut, header, KPI accents all read cool-blue. The
> user wants the fresh, cohesive, accessible look the rest of the fleet now uses. **jobtracker.polecat.live is
> the reference** — capture its token system and apply it as the new default dashboard palette (and align the
> app chrome's Polecat theme to it). Its actual tokens:
> - **Dark:** `--bg:#0a0f1a` · `--surface:#111a2b` · `--surface-2:#18243a` · `--border:#26344f` ·
>   `--text:#e9eff8` · `--text-2:#93a6c2` · `--text-3:#8496ac` · `--brand:#1a8fd6` · `--brand-2:#5bb3ea` ·
>   `--accent:#12a24f` · `--accent-2:#17b9a6`
> - **Light:** `--bg:#eef3f9` · `--surface:#fff` · `--surface-2:#e9f0f8` · `--border:#ccdcec` ·
>   `--text:#0c1c2e` · `--text-2:#48596f` · `--text-3:#586b88` · `--brand:#0071bc` · `--accent:#00964a`
> Note the deliberate **surface hierarchy** (bg → surface → surface-2) and **text hierarchy** (text/2/3) — adopt
> that structure, not just the hexes. Build a **categorical chart series palette** (the `--c1…--c10` ramp used by
> preview + export) that's harmonious in BOTH modes and colorblind-safe — this is chart-color work, so **load the
> `dataviz` skill first** and run its contrast validator (WCAG AA: ≥4.5:1 text, ≥3:1 large text / UI, ≥3:1
> adjacent categorical hues). Also: focus-visible rings on every control, honor `prefers-reduced-motion`. Z10
> already has the theme plumbing (`data-app-theme`, per-theme light/dark) + a `paletteKey` series-palette system
> (v123) — extend those; make the modern/Polecat palette the **default look** and keep Classic Blue as an option.
> Ship one screenshot-verified slice per run (view a 1200px preview + a phone shot); don't call a palette "done"
> off DOM checks — look at it. Coordinate with Z10.
> ✓ **Slice 1 shipped v281**: new `Studio.DASHBOARD_THEMES` — a **Dashboard theme** picker (top of the
> Dashboard inspector's style section) that swaps the WHOLE token system (bg/panel/text hierarchy, brand,
> and all ten `--c1..--c10` series colors) in one pick, for both preview and every export, on the additive-
> override architecture already used by themeColor/headerBg/paletteKey (vendor/pdc-ui.css untouched).
> **Classic Pentaho Blue** (unchanged) and **Fleet Modern** (mirrors jobtracker.polecat.live's bg → surface
> → surface-2 / text/2/3 / brand/accent hierarchy, light + dark). The 10-color series palette (light + dark)
> was built with the `dataviz` skill's `validate_palette.js` — all checks pass (lightness band, chroma
> floor, CVD ≥12 adjacent separation, ≥3:1 contrast) except one WARN-band amber slot, legal since the chart
> already carries direct-value labels. Visually verified via screenshot (dark-mode preview, Classic vs.
> Fleet Modern side by side — teal accent replaces purple, series blue lightens, panel/bg shift off navy),
> not just DOM checks. Wired into `normalize()`'s whitelist + the version-history diff field list so it
> round-trips and shows up in Compare-to-current. 7 new tests, suite 1259/1259.
> ✓ **Settings → Dashboard defaults picker shipped v282**: a **Default dashboard theme** row (Settings →
> Dashboard defaults) — same Classic Pentaho Blue / Fleet Modern choice as the per-dashboard picker,
> applied automatically to every brand-new blank dashboard, same seeding pattern as default accent
> color/header background/title size/subtitle style. Also wired into the Style presets snapshot
> (save/apply a preset now carries its dashboard theme) and Settings export/import. 6 new tests, suite
> 1264/1264.
> ✓ **Focus-visible + prefers-reduced-motion audit on the exported dashboard chrome shipped v283**:
> `vendor/pdc-ui.css` now carries the same `:focus-visible` keyboard-ring pattern as the app chrome
> (studio.css) — every button/link/select/input/tabindex element, with a white-tinted ring on header
> controls for contrast on the dark header gradient — and every hover/enter transition + the query-modal
> fade respects `prefers-reduced-motion`. Fixed a real bug in the process: the info-dot and two form
> fields set `outline:none` on focus with no replacement (zero keyboard focus indicator). 8 new tests,
> suite 1272/1272.
> ✓ **App chrome now offers the jobtracker tokens too, shipped v296**: Settings' Color theme picker gains
> a third **Fleet Modern** option (alongside Classic Blue / Polecat, additive — neither existing option
> changed) using the exact tokens already validated for the Fleet Modern dashboard theme; rail/hamburger/
> docs page all pick it up. Re-reads the original ask as "make the look available," not "force Polecat to
> become it" — Polecat's warm plum/terracotta identity (a deliberate Z-platform design-language choice,
> see the top of this ★ Z section) stays intact as its own option.
> **Follow-ups (not yet done):** make Fleet Modern the **default value** of both Settings pickers (app
> chrome + dashboard) once it's had a look from the user (today both exist but still default to Classic,
> opt-in).
>
> **(B) Version history — "switch back to earlier versions" ✓ ALREADY SHIPPED (v258 + v262).** The loop had
> already built this from the N-DIST backlog: the Dashboard inspector's **Version history** section keeps a
> capped, id-keyed ring of saved checkpoints in localStorage, each **Restore**-able (restore is itself undoable),
> plus a **⇄ Compare to current** plain-English diff. Feature-complete — so **(A) below is the one remaining
> active item in this block.** (Follow-ups if desired: mini thumbnail per checkpoint, a footer/⋯-More shortcut.)

### ★ Z. Analytics App platform — the new north star (user-requested 2026-06-30; build across many iterations)
> The studio is becoming a multi-section **analytics application**, not just a dashboard builder.
> Build this incrementally — one small, shippable, tested slice per loop. Keep it pure HTML/JS with all
> config saved **locally** (localStorage / file import-export); **NO backend/database/app-server for now**
> (revisit only if truly forced). Aesthetic: **fun, clean, elegant, a little game-like** (not corny) —
> "almost game-like in its fun-ness."

**Design language (pulled from polecat.live / app.polecat.live):**
- Warm-dark base: plum-black `#2E2A33` / `#3A2F3A` / `#0a0a0f` backgrounds, cream `#F5E9D6` text.
- Primary accent terracotta `#d4773b` / `#f55036`; playful multi-accent set for section icons:
  violet `#8b5cf6`, blue `#4285f4`, teal `#10a37f`, amber `#ffb000`, salmon `#F4A6A6`, bronze `#9C6B3F`.
- System font stack. Each left-rail section gets ONE accent color (single-color icon). Tasteful motion
  (respect `prefers-reduced-motion`); keep the existing light/dark toggle.

**Z1 — App shell with a collapsible left rail.** ✓ slice 1 shipped v132: `app/shell.js` + rail markup in
`index.html`. Vertical left nav of single-color icons (amber Home / teal Repository / blue Studio /
violet Settings); collapses to icons-only, expands to icon+label; persists collapsed/expanded + active
section in localStorage; roving ↑/↓ keyboard nav + `aria-current` a11y. **The rail WRAPS the Studio — it
does not replace the Studio's panes**: the existing 3-pane layout (Data Source Library · canvas ·
Inspector) is untouched inside the Studio section (wrapped in `#appMain`, zero feature loss). So there
are two nested "lefts" by design: the outer app-shell nav rail (section switcher) and, within Studio, the
existing library pane. Home/Repository/Settings currently show "coming soon" placeholders — real content
is Z2/Z3/Z5 below. Scoped to desktop for now: rail hidden ≤900px, Studio always wins on narrow viewports,
so mobile/tablet is completely unaffected (see Z9 for the dedicated mobile track). 8 new tests, suite
713/713.
> ✓ **Section-switch entrance motion shipped v262**: switching sections via the rail now plays a brief
> opacity fade-in on the section you switched to (disabled under prefers-reduced-motion). First cut used a
> `translateY` transform, but that made a lingering CSS animation on `#appMain` act as the containing block
> for its `position:fixed` descendants (`#mobile-tabs`/`#statusbar` at phone width) instead of the viewport,
> breaking their fixed positioning — fixed to opacity-only + an `animationend` cleanup. 3 new tests.
> **Z1 follow-ups:** **simplify the TOP menu bar** now that the rail owns primary navigation — reorganize
> to consistent, best-practice IA (logical grouping, no redundancy, clear labels/icons: rail = "where am
> I", top bar = "what can I do here"). ✓ **First slice shipped v336** (see the H-track entry below):
> subtle dividers now group the topbar into History / File / Connect & present clusters. **Still not yet
> done:** extend the rail to tablet width once Home/Repository/Settings have real content worth
> navigating to on a smaller screen; consider a deeper topbar consolidation if grouping alone isn't
> enough.

**Z2 — Home.** ✓ slice 1 shipped v133: quick-create cards (Blank / Browse examples / Take the tour) +
a "Recent dashboards" grid, each card a live SVG thumbnail (`Studio.makeThumbnail`) that genuinely
reopens the exact dashboard (full spec captured on the auto-save debounce path, capped at 8,
`localStorage["studio-recents"]`).
> ✓ **Favorites/pinning shipped v163**: a star toggle on every recent card (`localStorage["studio-pins"]`,
> array of dashboard ids). Pinned cards render under their own "Pinned" heading above "Recent dashboards"
> and are exempt from the 8-entry cap — pinning protects a dashboard from ever being evicted by newer
> activity (`noteRecent()` now caps only the unpinned tail). New `star` icon in `app/icons.js`.
> ✓ **More lively hover shipped v174**: recent-dashboard cards lift further + gain a warm glow + their
> thumbnail zooms slightly on hover; quick-create cards get the same glow + an icon bump. Reduced-motion
> respected. Small CSS-only polish — no new state.
**Z2 follow-ups (not yet done):** branding area.
> ✓ **Rotating tips card shipped v255 (closes "instructions/how-tos/tips beyond the existing tour
> link")**: a small card between the quick-create cards and Recents shows one real power-user tip
> (command palette, pinning, DuckDB file sources, Workbooks, Simple mode, inline setting hints, color
> themes, forecasting) with a → arrow that cycles through the list; starts on a day-of-month-based
> index so repeat visits don't always see the same tip. 2 new tests, suite 1167/1167.
> ✓ **Home Workbook filter shipped v321 (closes "folders/organization" — Home now has the same
> organizing power Repository already had)**: a Workbook filter chip strip (reusing the exact Z3
> `studio-workbooks` storage + counts, no new state) appears above Home's Pinned/Recent dashboards
> once at least one workbook exists; picking a chip narrows both lists to that workbook (or
> "Unfiled"). Deliberately lighter than Repository's strip — no add/rename/delete controls here,
> those stay Repository's job; Home is the quick-glance view. 3 new tests, suite 1398/1398.

**Z3 — Repository (Data Sources + Workbooks).** One "repository" holding **data-source definitions** and
**workbook definitions** (a workbook = a named collection of HTML dashboards). Browse/search/organize into
folders; CRUD; stored locally; import/export the whole repository as JSON. Consolidates the old "data
source library" and "dashboard inventory" ideas into one place.
> ✓ **Slice 1 shipped v168**: the Repository section is no longer a placeholder — it's a single searchable
> page listing **every catalog data source** (same data the Studio library pane browses) and **every local
> dashboard** (the same `studio-recents`/`studio-pins` Home already tracks), with one shared search box
> filtering both lists live. Clicking a data-source card jumps to Studio with the library search pre-filled
> to locate it; clicking a dashboard card reopens it (same behavior as Home's recent cards, reused via the
> existing `recentCardHtml`); pin/unpin works from Repository too (shared storage with Home). No new
> storage — this is a browsing surface over data that already existed in two separate corners of the app.
> 7 new Z3 tests. Test suite 856/856.
> ✓ **Whole-repository JSON export/import shipped v171**: "Export repository…"/"Import repository…" buttons
> on the Repository page. Export bundles every data source you personally authored (not the bundled catalog
> — that already ships with the app) plus the local dashboard inventory (recents+pins) into one JSON file;
> import merges it back in additively (never deletes existing entries; same-id entries are overwritten by
> the imported version). Mirrors the Z5 Settings export/import pattern.
> ✓ **Full CRUD from the Repository page shipped v188**: every data-source card in Repository now has
> hover-revealed ✎ edit / 🗑 delete actions (touch-always-visible), wired to the exact same
> `dataSourceBuilder()`/`deleteDataSource()` the Studio library pane uses — one source of truth, both
> views always agree. The card's outer element became a plain wrapping `<div>` (a `<button>` can't nest
> another `<button>`) with a `.repo-ds-open` inner button for the existing open-in-library action.
> ✓ **Workbooks — named collections of dashboards, shipped v239 (closes the "workbook" concept item)**:
> a Workbooks chip strip above the Dashboards grid — create one (name field + "+ Workbook"), filter by
> clicking a chip ("All"/named workbooks/"Unfiled"), delete via a hover ✕ (un-files its dashboards,
> never deletes them). Each dashboard card gains an inline Workbook `<select>` to file/move it.
> Filing is stored on the `studio-recents` entry (`workbookId`), not the dashboard spec, so it never
> travels into Save/Export. Found + fixed a real bug while building this: `noteRecent()` rebuilt each
> recents entry from scratch on every autosave tick, which would have silently un-filed a dashboard the
> moment it was edited again — now preserves `workbookId` across the rebuild. Travels with the existing
> whole-repository JSON export/import; included in Clear local data. 7 new tests, suite 1134/1134.
> ✓ **Workbook rename shipped v242**: a hover-revealed ✎ button on every workbook chip swaps its label
> into an inline rename `<input>` (Enter/Escape).
> ✓ **Data-source Group filter shipped v254 (closes "folders/organization for data sources")**: every
> data source already carries a "Group" field (the `stem` the Studio library pane sections by, set via
> the "Group" input in the New/Edit Source builder) — no new storage needed. Repository now shows a
> filter chip strip above the Data sources grid (`All` + one chip per group with a live count), mirroring
> the Workbooks chip strip already below it for dashboards; clicking a chip narrows the grid to that
> group. Chip strip only renders once there's more than one group (nothing to filter with just one). 2
> new tests, suite 1165/1165. **Z3 follow-ups (not yet done):** none currently open.

**Z14 — Browser-native, file-hosted SQL engines: DuckDB-Wasm + SQLite-WASM-HTTP (user-requested 2026-07-02).**
> ★ **PRIORITY: build this connector track BEFORE the Z4 warehouse providers** (user-requested 2026-07-02).
> These are backend-free, so they ship real querying without waiting on tokens/proxies/CORS — do Z14's
> slices first, then return to Z4 (Snowflake/Databricks/BigQuery).
Two connectors that query a **static file hosted on S3 / any HTTP host directly from the browser** — no
backend, no proxy, no credentials, no CORS token dance. This is the **first non-CDA connector track** (ahead
of Z4) because it fits our "pure HTML/JS, config saved locally, NO backend" constraint perfectly (unlike
Snowflake/Databricks/BigQuery, which need tokens and usually a thin proxy — those come later in Z4). Both work
by turning the engine's file reads into **HTTP Range Requests**, pulling only the bytes a query needs. Build
as two connector types in the Z3/Z4 Data-Source model; one shippable slice per loop; add Playwright checks.
- **Option 1 — DuckDB-Wasm (analytics / dashboards, our sweet spot).** Load the DuckDB-Wasm library, point it
  at a remote `.parquet` (columnar, compressed) or `.csv` URL, and run standard SQL against it. DuckDB does
  HTTP Range Requests under the hood — reads file metadata + only the columns a query touches, so it scans
  millions of rows / runs aggregations over a large remote file while transferring little. **Best fit for our
  chart/aggregation workload.** Connector config: file URL(s) (parquet/csv), optional table alias, a **Test
  connection** (HEAD/first-range probe + `DESCRIBE`), column detection from the file schema. A query authored
  here feeds the same dashboard model as any other data access.
- **Option 2 — SQLite-WASM + HTTP VFS (relational, indexed lookups).** For a traditional relational DB with
  indexes / PKs / complex joins: ship a prebuilt `.sqlite` file to S3 and query it with `sql.js-httpvfs` /
  `sqlite-wasm-http`, which intercept SQLite's disk reads and turn them into HTTP Range Requests. Because
  SQLite is a B-Tree, an indexed query downloads only the specific ~4 KB pages it needs — a lookup on a 1 GB
  DB can transfer a few KB. **Best fit for read-heavy relational apps / instant row lookups** without an RDS.
  Connector config: `.sqlite` URL, optional `serverMode`/page config, **Test connection** + schema
  introspection (`sqlite_master`), column detection.
- Cross-cutting: both are **light, self-contained** (lazy-load the wasm engine only when such a connector is
  used, so the base app stays tiny and dependency-free); surface clear errors when the host doesn't support
  Range Requests (`Accept-Ranges`) or CORS; note file-size/first-load cost; keep credentials out entirely
  (public/pre-signed URLs). Show them in the connector gallery with logos alongside the Z4 providers.
- Sequence (one slice each): (1) DuckDB-Wasm connector: config form + lazy loader + Test + column detect +
  query→model; (2) parquet & csv coverage + aggregation smoke test; (3) SQLite-WASM-HTTP connector: config +
  loader + Test + schema introspect; (4) polish — error surfacing, connector-gallery cards/logos, docs.
> ✓ **Slice 1 shipped v160**: DuckDB-Wasm connector — "DuckDB (remote file)" source type in both the New
> Source builder and the DA inspector (File URL + Format + Query fields), `app/duckdb.js` lazy-loads the
> engine from jsDelivr on first Test/Run-live click (cached across calls), `testConnection`/`query` never
> reject (always `{ok,...}`) so a bad URL/CORS/network failure surfaces a clear inline message instead of
> hanging; Data preview's "Run live" now works for duckdb DAs with no Pentaho connection needed; `exportCDA`
> excludes duckdb DAs from `.cda` (not a real Pentaho source) — preview/CDF export already handle any DA
> generically via its declared columns, so no other exporter changes were needed. 12 new tests (network
> boundary stubbed — this sandbox has no internet route to actually verify a live fetch; the CDN URL +
> duckdb-wasm API surface were confirmed reachable via curl first). **Still open for Z14**: (2) parquet/csv
> aggregation smoke test against a *real* hosted file (needs a live environment with internet — verify by
> hand once published), (4) connector-gallery cards/logos once Z3/Z4 have a real gallery UI to add them to
> (today the New Source builder is plain type-cards, no logo treatment yet).
> ✓ **Slice 3 shipped v164**: SQLite-WASM + HTTP-VFS connector — "SQLite (remote .sqlite)" source type in
> both the New Source builder and the DA inspector (File URL + optional Table name + Query fields),
> `app/sqlitehttp.js` lazy-loads sql.js-httpvfs from jsDelivr via a classic `<script>` tag (the package has
> no ESM build, unlike duckdb-wasm) on first Test/Run-live click; `testConnection` lists tables + runs
> `PRAGMA table_info` on the chosen/first table + a 5-row sample, `query` runs SQL against the opened
> database — neither ever rejects/hangs, same `{ok,...}` contract as DuckDB. `exportCDA` now excludes both
> `duckdb` and `httpvfs` kinds from `.cda`. 13 new tests (stubbed at the `Studio.SQLiteHttp` boundary, same
> no-internet-in-sandbox rationale as slice 1; the CDN package/asset URLs were confirmed reachable via curl
> first). **Still open for Z14**: (2) a real hosted-file smoke test for both connectors (needs a live
> environment with internet), (4) connector-gallery cards/logos.
> ✓ **Slice 4 (partial) shipped v170**: both source-type cards in the New Source builder now carry a
> "Browser-only" badge, and `Studio.friendlyConnectorError()` (shared by both connectors) appends a
> plain-English, actionable hint to common raw failures (CORS/fetch-blocked, timeout, 404) instead of
> surfacing the raw browser error. **Still open**: real connector-gallery logos (today it's still plain
> type-cards, no logo/brand-mark treatment — the badge covers the "why is this different" question but
> not the "make it sexy" visual-gallery ask), and (2) a real hosted-file smoke test once a live/internet
> environment is available to verify by hand.
> ✓ **Slice 4 finished, Z14 track complete, shipped v173**: DuckDB and SQLite source-type cards now carry
> their own distinct monoline icons (`app/icons.js`: `duckdb` a rubber-duck mark, `sqlite` a database
> inside a single file) instead of sharing the generic `db` cylinder every server-backed connector uses —
> same brand-neutral stroke style as the rest of the app's icon vocabulary, no external logo assets. This
> closes the "make the connector gallery sexy" ask within the app's no-images/no-deps constraint. **Still
> genuinely open (needs a live/internet environment, not buildable in this sandbox)**: (2) a real
> hosted-file smoke test against a public S3/GCS file for both connectors.
> ⚠️ **Architecture gap found (2026-07-04, while scoping an N-DATA calc-columns follow-up) —
> a real *exported/deployed* dashboard cannot actually query any of the six direct connectors.**
> Traced the runtime data path all the way down: the exported CDF's ONLY data-fetch mechanism is
> `PDC.cda(dataAccessId, params)` in `vendor/pdc-ui.js`, which either reads injected offline
> `window.PDC_MOCK` data (the **in-app preview only** — `Studio.buildHtml(..., {preview:true})`)
> or calls the real Pentaho endpoint `/pentaho/plugin/cda/api/doQuery` (`Studio.exportCDF`, the
> real `.html` export, and the `opts.liveBase` "live preview" override — both still just point at
> a Pentaho CDA server). There is **no code path anywhere in `studio-render.js`/`vendor/pdc-ui.js`
> that dispatches to `duckdb.js`/`sqlitehttp.js`/`snowflake.js`/`databricks.js`/`bigquery.js`/
> `genericsql.js`** — those modules are called ONLY from the builder page itself (`studio.js`'s
> "Test connection"/"Run live" handlers, for authoring-time verification). Since these six kinds
> are deliberately excluded from `.cda` (Z14/Z4 above), a dashboard exported/deployed with one of
> them bound to a panel would call `PDC.cda()` for a `dataAccessId` that has **no real CDA
> definition on the server** and fail outright once actually deployed — despite "Data source
> freshness"/"Run live" language implying these connectors are live end-to-end. **Why this
> probably was never wired (a real constraint, not just an oversight):** naively fixing it by
> inlining the connector JS + calling it at runtime would mean baking a live credential
> (Snowflake/Databricks/BigQuery access token) as **plaintext inside a static, exported HTML
> file** — a real secret-handling anti-pattern, not merely a nice-to-have gap, for the four
> credential-based kinds. DuckDB/SQLite (URL-only, no secret) don't have that problem, so they're
> the safer half to fix first. **Left as a documented, dedicated future decision rather than
> attempted here** — it needs its own careful design pass (at minimum: DuckDB/SQLite dispatch in
> `studio-render.js` for the two credential-free kinds; an explicit, loud warning in the Export
> modal / `Studio.validate()` Checks section for the four credential-based kinds until/unless a
> real answer exists for shipping a token in a static file) rather than a same-run patch. Docs and
> the in-app copy should stop implying full live-after-export parity for these connectors until
> this is resolved.
> ✓ **Docs corrected + a Checks-section warning shipped (v316/v317), same run as this finding.**
> The docs no longer imply the export falls back safely to offline data, and `Studio.validate()`
> now warns right in the Dashboard inspector whenever one of these six connectors is actually bound
> — the "explicit, loud warning" half of the plan above.
> ✓ **The real fix for the two credential-free kinds shipped (v318): DuckDB/SQLite runtime dispatch
> in `studio-render.js`.** A duckdb/httpvfs DA is now answered by querying its file live over HTTP
> Range Requests once exported/deployed (PDC.cda wrapper + façade bundled into the export only when
> used); `Studio.validate()`'s warning no longer fires for these two. **Still genuinely open:** the
> harder credential-in-static-file design decision for the four token-based kinds (Snowflake/
> Databricks/BigQuery/Generic SQL/HTTP) — they still have no runtime query path after export.

**Z4 — Data Source library + connectors.** Expand beyond CDA to direct querying of leading providers,
browser-only via each provider's REST/SQL API with locally-saved credentials. Priority connectors:
**Snowflake** (SQL REST API), **Databricks** (SQL Statement Execution API), **BigQuery + cloud
warehouses** (Redshift/Synapse as APIs allow), **generic SQL/HTTP**, and **keep Pentaho CDA** as one
connector among many. Per provider: a config form (account/host/warehouse/token/etc.), a **Test
connection** button, and **brand logos** — make the connector gallery sexy. Note CORS/security realities
(some providers need a token or a thin proxy); surface clear errors. A query authored against any
connector feeds the same dashboard model.
> **START HERE → do Z14 (immediately above) FIRST**: **DuckDB-Wasm** and **SQLite-WASM-HTTP** query a static
> file over HTTP Range Requests with **no backend/proxy/credentials**, so they're the prioritized first
> connectors. Build all of Z14's slices before the token-gated warehouse providers in this Z4 entry.
> ✓ **Slice 1 shipped v231 — Snowflake connector (first token-gated provider)**: `app/snowflake.js` calls
> the Snowflake SQL API v2 directly from the browser (`POST/GET .../api/v2/statements`, with async-statement
> polling for the 202 "still executing" case) — New Source builder + DA inspector both get a **Snowflake**
> source type with Account identifier / Access token (Programmatic Access Token or OAuth, never a password)
> / Token type / Warehouse / Database / Schema / Role fields, a query editor, and the same **Test connection
> & detect columns** / **Run live** pattern the Z14 file connectors use. Genuinely different from Z14 in one
> respect: this is **credential-based** (badge reads "Needs token", not "Browser-only") and the target
> Snowflake account must allow this origin via its `ALLOWED_HTTP_ORIGINS` network policy or every call fails
> on CORS — surfaced through the same `Studio.friendlyConnectorError` path, with an explicit inline hint
> about the network-policy requirement so the failure mode is self-explanatory instead of a stuck spinner.
> New monoline snowflake icon (`app/icons.js`); `exportCDA` excludes snowflake DAs from `.cda` (not a real
> Pentaho source), same as duckdb/httpvfs. Docs updated. 15 new tests (stubbed at the `Studio.Snowflake`
> boundary — this sandbox has no internet route, and a real check additionally needs a Snowflake account
> with CORS configured for this origin). Test suite 1066/1066.
> ✓ **Slice 2 shipped v234 — Databricks connector**: `app/databricks.js` calls the Databricks **Statement
> Execution API** directly from the browser (`POST/GET .../api/2.0/sql/statements`, polling while a
> statement reports `PENDING`/`RUNNING`) — New Source builder + DA inspector both get a **Databricks**
> source type with Workspace host / Access token (personal access token, never a password) / SQL warehouse
> id / optional Catalog+Schema fields, a query editor, and the same **Test connection & detect columns** /
> **Run live** pattern as Snowflake and the Z14 file connectors. Same credential-based shape as Snowflake
> (badge reads "Needs token") — the target workspace must allow this origin or every call fails on CORS,
> surfaced through `Studio.friendlyConnectorError` with the failure appearing inline instead of a stuck
> spinner. New monoline `databricks` icon (delta triangle over a lake line); `exportCDA` excludes
> databricks DAs from `.cda`, same as duckdb/httpvfs/snowflake. Docs updated. 15 new tests (stubbed at the
> `Studio.Databricks` boundary, same no-internet-in-sandbox rationale as Snowflake). Test suite 1092/1092.
> ✓ **Slice 3 shipped v237 — BigQuery connector**: `app/bigquery.js` calls the BigQuery **jobs.query**
> REST API directly from the browser (`POST .../bigquery/v2/projects/{project}/queries`, polling
> `GET .../queries/{jobId}` while `jobComplete` is false) — New Source builder + DA inspector both get
> a **BigQuery** source type with Project id / Access token (short-lived OAuth 2.0 token, never a
> service-account key file) / optional Location + Default dataset fields, a query editor, and the same
> **Test connection & detect columns** / **Run live** pattern as Snowflake and Databricks. Genuinely
> different from the other credential-based connectors: Google's API already sends permissive CORS
> headers for this endpoint, so there's **no per-account network-policy allow-list step** — the OAuth
> token itself is the only gate (still badge "Needs token", since a token is required). New monoline
> `bigquery` icon (magnifying glass over ascending bars — `app/icons.js`); `exportCDA` excludes bigquery
> DAs from `.cda`, same as duckdb/httpvfs/snowflake/databricks. Docs updated. 15 new tests (stubbed at
> the `Studio.BigQuery` boundary, same no-internet-in-sandbox rationale as Snowflake/Databricks). Test
> suite 1112/1112.
> ✓ **Slice 4 shipped v238 — Generic SQL/HTTP connector (the "generic SQL/HTTP" item closed)**:
> `app/genericsql.js` POSTs (or GETs) a SQL string to any JSON API you point it at — an in-house
> query service, a serverless function, or a provider not yet covered by a named connector — the
> escape hatch for everything Z4 doesn't have a dedicated slice for yet. New Source builder + DA
> inspector both get a **Generic SQL/HTTP** source type with Endpoint URL / Method (POST JSON body
> or GET query-string) / Param name (which JSON/query key carries the SQL, default `sql`) / an
> optional raw Auth header value, the same **Test connection & detect columns** / **Run live**
> pattern as Snowflake/Databricks/BigQuery. Genuinely different from the other Z4 connectors: no
> per-provider CORS/network-policy story (it's your own endpoint, so that's on you) and auth is
> optional, not required — badge reads "Needs endpoint" instead of "Needs token". Accepts three
> response shapes (array of row objects / `{data:[...]}` / `{columns,rows}`) so it fits most
> home-grown "run this SQL" endpoints with no extra glue. New monoline `globe` icon; `exportCDA`
> excludes `http` DAs from `.cda`, same as the other direct connectors. Docs updated. 15 new tests
> (stubbed at the `Studio.GenericSql` boundary, same no-internet-in-sandbox rationale as the other
> credential-based connectors). Test suite 1127/1127.
> ✓ **Connector-gallery brand treatment shipped v248 (closes that "still open" item)**: the New Source
> builder's type-picker cards now give each third-party provider its real brand color on the icon +
> a soft matching tint behind it (Snowflake `#29B5E8`, Databricks `#FF3621`, BigQuery `#4285F4`, DuckDB
> `#FFDE00`, SQLite `#0F80CC`, Generic SQL/HTTP a neutral slate) — the gallery now reads as a row of
> distinct connectors instead of one uniform blue set. The native Pentaho access types (SQL/MDX/Kettle/
> Metadata/Scripting) intentionally keep the app's own `--pentaho` accent since they aren't third-party
> brands. Same shared card gallery used by both New Source and Edit, so the treatment applies everywhere
> a connector type is picked. 2 new tests, suite 1149/1149.
> **Still open for Z4**: other cloud warehouses (Redshift/Synapse — can now go through Generic
> SQL/HTTP until they earn a dedicated slice), a real live-account smoke test for
> Snowflake/Databricks/BigQuery/Generic SQL/HTTP, and — the important one — **the exported/deployed
> dashboard still has no runtime query path for these four token-based connectors** (DuckDB/SQLite
> got theirs in v318 — see Z14 above): they need a real design decision on shipping a live credential
> in a static exported file before they can follow.

**Z5 — Settings.** App configuration: theme, default deploy target, gate/access, data-source defaults,
and **dashboard style defaults** (standard look/style applied to new dashboards). Support **collections
of named style presets** the user can pick from. Export/import settings as JSON.
> ✓ **Slice 1 shipped v135: mode toggles as first-class, discoverable controls.** The Settings section
> (left rail) now shows **Dark mode**, **Simple mode**, **Demo mode**, and **Focus mode** as labelled
> on/off switches (Appearance / Mode / Presentation cards) — each a thin wrapper over the existing mode
> function (single source of truth, stays in sync with the ⋯ More menu, which is unchanged/still present).
> 6 new Z5 tests, suite 729/729.
> ✓ **Settings export/import as JSON shipped v136**: a "Data" card on the Settings page exports theme/mode/
> connections/layout preferences to `dashboard-studio-settings.json` and imports them back (confirmed before
> applying; dashboard content itself is untouched — still Save/Open).
> ✓ **Data-source defaults shipped v190**: a new "Data source defaults" card with a **Default JNDI
> connection** field — pre-fills the Connection field on every brand-new data source (＋ New source)
> instead of the hardcoded "PDC-BIDB-EXT" placeholder. `defaultJndi()`/`setDefaultJndi()` in studio.js,
> persisted to `localStorage["studio-default-jndi"]` and included in Settings export/import.
> **Z5 follow-ups (not yet done):** gate/access management, and the optional polecat.live-style
> left-drawer mirror of key toggles.
> ✓ **Deploy target config shipped v235 (closes "deploy target config" above)**: a **Deploy** card
> in Settings surfaces the Deploy path (server folder that stamps CDA links in exports) and the
> Live data preview toggle, previously only reachable via the "Live data / deploy settings" modal
> behind the topbar Live/Sample button (that modal still works too — same underlying state, one
> `syncLiveButton()` helper keeps both entry points in sync). **Found a real gap while surfacing
> it**: `S.settings.{deployPath,live}` were in-memory-only — hardcoded defaults, silently reset on
> every reload — despite the Settings page's own header promising "saved locally on this device."
> Added `studio-deploy-path`/`studio-live-data` localStorage persistence (same getter/setter
> pattern as every other Settings default) and wired both into Settings export/import + Clear
> local data. 5 new tests, suite 1081/1081.
> ✓ **Left-drawer mirror of key toggles shipped v259 (closes that "still open" item; gate/access
> management remains genuinely open — see below)**: the mobile nav drawer (`#railNav` ≤900px) gains
> a compact **#railQuick** block above the Collapse button — Dark mode + Simple mode as the same
> `.set-sw` switches Settings uses, reusing `SETTINGS_TOGGLES` as the single source of truth so
> toggling from the drawer, the ⋯ More menu, or the Settings page all stay in sync (verified both
> directions). Desktop keeps the icon-only rail uncluttered — `.rail-quick{display:none}` outside the
> `≤900px` drawer, matching the relay.polecat.live reference the original ask cited. Demo/Focus modes
> deliberately excluded (Focus mode hides the rail itself, so surfacing it there is self-defeating).
> 5 new tests, suite 1179/1179. **Z5 follow-up still open:** gate/access management (deferred — the
> passcode gate is a single shared site-wide hash baked into `gate-config.js` at deploy time, not a
> per-browser preference, so it doesn't fit the Settings-page model without real backend/auth work).

**Z6 — Banner / header editor + naming model (user-requested; refined 2026-06-30).** Make the dashboard
header/banner (the "Cost Optimization & Sustainability · subtitle" bar in the preview) fully **editable
in-app** — title, subtitle, logo, colors, links, and full text formatting. Add **default headers** as
named presets defined in **Settings** (default colors/logo/formatting); when building a dashboard, offer
an **"include default header"** option that drops the preset in, then let the user **edit it per-dashboard**
with all formatting. Consider **integrating the header with the ¶ Text/annotation element** — the header
could be a special rich-text block (or the text element gains header-style options) so one editor covers
both. Tie into the Z5 style-preset collections. **Also reconsider the ¶ Text button's placement** — it sits
on the Live-preview/canvas bar and reads as cluttered/odd there; fold "add text/annotation" into a cleaner
add-element affordance (e.g. the **New / ＋** flow or an on-canvas insert), consistent with how panels are
added, and unified with this header/text-object work.
> ✓ **Naming model shipped v176**: `#dashTitle` in the topbar is no longer an inline text editor — it's a
> button that jumps to the Dashboard inspector with the **Title** field focused/pre-selected (the topbar
> still shows the live title with an edit-pencil affordance, staying in sync as you type). The two names
> were already independently editable fields in the inspector (**Title** = display name in the header/
> banner; **File name (stem)** = the lowercase-with-dashes name used for exports) — the actual fix here was
> removing the redundant second editor in the topbar so renaming happens in exactly one place. 3 new tests.
> Test suite 881/881.
> ✓ **Header logo shipped v193**: a **Header logo** field in the Dashboard inspector uploads a per-dashboard
> image (≤200KB) that replaces the default "P" mark in the banner, in preview and exported CDF alike; lives
> in `spec.headerLogo` so it travels with the dashboard itself (Save/Open/Export), distinct from the Z12
> app-wide rail branding. Along the way, fixed `normalize()` silently resetting `themeColor`/`paletteKey` on
> every reopen, and a DOM-duplication bug in the dashboard inspector's own self-redraw calls. **Still open
> under Z6**: colors beyond the existing accent-color picker, links, full text formatting for the banner,
> and the ¶ Text button placement.
> ✓ **¶ Text button relocated, shipped v200**: moved from the live-preview canvas bar (where it read as a
> cluttered one-off among preview hints, per the original ask) into the Query Library pane header, beside
> "＋ New source" — both buttons are "add something to the dashboard" affordances (a query-backed data
> panel vs. a query-less text/annotation panel) and now live together in the library instead of split
> across two different toolbars. Same button/behavior, just relocated; `#btnAddText` id unchanged so the
> ⌘K palette entry needed no changes. Also fixed a latent CSS bug found while moving it: `.btn-cb-text`
> referenced a nonexistent `--text-secondary` custom property (always silently falling back to inherited
> color) — corrected to the intended `--muted` token. 1 new test. Test suite 952/952.
> ✓ **Default subtitle + accent color shipped v194** (first slice of "default header presets in Settings"):
> a **Dashboard defaults** card on the Settings page (Default subtitle text + Default accent color, reusing
> the per-dashboard picker's swatches via a new shared `Studio.THEME_PRESETS`) is applied to every brand-new
> **Blank dashboard**. Found + fixed a real gap along the way: "Clear local data" was missing several keys
> already tracked by Settings export/import (`studio-app-theme`, `studio-shell-section`,
> `studio-shell-expanded`, `studio-default-jndi`) — added those plus the two new default keys. **Still open
> under Z6/Z5**: a full named-preset *collection* (more than one saved default set to choose from), logo
> defaults, and the rest of the v967 Z6 list above.
> ✓ **Header link shipped v209**: a **Header link URL** field (right below Header logo) wraps the banner's
> logo + title in an `<a target="_blank">` — click-through to a company site or portal — in both the live
> preview and exported Dashboard Framework; blank keeps the plain, non-clickable `<div>`. `spec.headerLink`
> added to `Studio.emptySpec()` + the `normalize()` whitelist (same pattern as `headerLogo`). Docs updated.
> 4 new tests, suite 972/972. **Still open under Z6**: colors beyond the existing accent-color picker, full
> text formatting for the banner, and the named-preset *collection* noted above.
> ✓ **Named style-preset collection shipped v213** (closes the "still open" item above): the Dashboard
> defaults card in Settings gains a **Style presets** list — a name field + "+ Save as preset" snapshots
> the current default subtitle + accent color under a name; each saved preset shows a swatch + name +
> **Apply** (restores its snapshot as the active default) + delete. Reuses the existing single
> default-subtitle/default-accent storage as the "active" slot, so `applyDashboardDefaults()` (which seeds
> every brand-new blank dashboard) needed no changes — presets are just a named library you switch between.
> `studio-style-presets` (JSON array) added to Settings export/import keys and Clear local data. 5 new
> tests, suite 988/988. **Still open under Z6**: colors beyond the existing accent-color picker, full text
> formatting for the banner, and logo defaults per preset.
> ✓ **Logo defaults per preset shipped v218** (closes that "still open" item): a **Default header logo**
> upload joins the Dashboard defaults card (same 200KB PNG/JPG/SVG rule as the per-dashboard Header logo
> field), seeding `spec.headerLogo` on every brand-new blank dashboard alongside subtitle + accent.
> `stylePresets()` now snapshots `logo` too, and a preset with one saved shows a small thumbnail
> (`.sp-logo`) instead of a plain color swatch. `studio-default-logo` added to Settings export/import and
> Clear local data. 6 new tests, suite 1001/1001.
> ✓ **Header background color shipped v225 (closes "colors beyond the accent-color picker")**: a
> **Header background color** picker (below Accent color) sets a flat fill for the banner itself —
> distinct from Accent color, which only tints the border + chart/button accents. Text auto-contrasts
> via the new `Studio.contrastFg(hex)` (WCAG relative luminance) so a light pick never goes white-on-white.
> "Reset to default" restores the standard navy gradient. `spec.headerBg` follows the same
> emptySpec/normalize/CSS-override pattern as `headerLogo`/`headerLink`/`themeColor`. 6 new tests, suite
> 1030/1030.
> ✓ **Default header background color + per-preset snapshot shipped v226 (closes "per-preset header
> background")**: Settings' Dashboard defaults card gains a **Default header background color** picker
> (same field as the per-dashboard Header background color setting), seeded onto every brand-new blank
> dashboard alongside subtitle/accent/logo. Style presets now snapshot it too, so Apply restores the full
> house look — subtitle + accent + logo + header background — in one click. `studio-default-headerbg`
> added to Settings export/import and Clear local data. 7 new tests, suite 1036/1036. **Still open under
> Z6**: full text formatting for the banner (bold/italic/size beyond the existing Title/Subtitle
> plain-text fields).
> ✓ **Banner title size + subtitle style shipped v228–v230 (closes the "still open" item above — Z6
> banner-editing track is now feature-complete)**: a **Title size** picker (Default/Small/Large/Extra
> large, v228) and a **Subtitle style** picker (Normal/Italic/Bold/Bold italic, v229) join the Dashboard
> inspector; both travel as `spec.titleSize`/`spec.subtitleStyle`, apply in the live preview and exported
> Dashboard Framework, and gained their own Settings defaults + Style-preset snapshot slots (v230) so a
> saved house style covers wording, logo, link, both colors, title size, and subtitle style in one Apply.
> Title/subtitle wording, logo, link, accent + background color, size, and weight/italics are now all
> editable — this STATUS entry was out of date (the code shipped, the note here didn't get updated at
> the time); fixed while auditing the Z-track backlog for open work.

**Z7 — Analytics: forecasting + statistical functions.** Move toward standalone analytic apps: add
forecasting (moving average, exponential smoothing / Holt-Winters, linear & seasonal trend) and
statistical functions/variations (regression, percentiles, z-scores, correlation, distributions) as
chart options / derived series / KPI computations. Keep it light (vanilla-JS math, no heavy deps).
> ✓ **Slice 1 shipped v179**: Line/area charts get a **Show moving average** toggle + window field — a
> dashed trailing simple-moving-average overlay per series, same per-type override pattern as Z8.
> ✓ **Slice 2 shipped v187**: Line/area charts get a **Show trend / forecast line** toggle + **Forecast
> periods ahead** field — a per-series OLS linear-regression line (dashed, series color) drawn across the
> real data; when forecast periods > 0 the x-scale widens to include a forecast tail (with "+1/+2/…" tick
> labels and a dashed "Forecast →" separator at the last real data point) and the trend line extrapolates
> across it. Distinct from the v179 moving average (a trailing smoother of the real data) — this is a true
> projection beyond the chart's own data. `trendOf()` helper in studio-charts.js (pdc-ui.js pristine).
> ✓ **Slice 3 shipped v199**: **Forecast method** select (linear / Holt) added alongside the v187 trend
> toggle. Holt's double exponential smoothing (`holtOf()` in studio-charts.js, no seasonality yet — that's
> "Holt-Winters"; this is plain Holt) tracks a smoothed level+trend through the real data (multi-segment
> line, reacts to recent moves) rather than one straight OLS slope, then extrapolates linearly across
> `forecastPeriods` the same way. Two new tuning fields, α (level) and β (trend), 0–100%.
> **Still open:** seasonal trend lines (the "-Winters" part of Holt-Winters), extending trend/forecast to
> bars/stacked/combo, and the statistical-functions half (regression beyond scatter's existing trend line,
> percentiles, z-scores, correlation, distributions) as KPI computations.
> ✓ **Doc correction (2026-07-04):** the "seasonal trend lines" half of the note above was stale —
> Holt-Winters (`holtWintersOf()` in `app/studio-charts.js`, a `trendMethod:"hw"` choice alongside
> `linear`/`holt`, with `gamma`/`seasonLength` fields) was already implemented and tested (search
> `Z7HW2` in `tests/run.js`) in an earlier slice that never updated this specific note. Genuinely
> still open: extending ANY trend/forecast overlay (linear/Holt/Holt-Winters alike) beyond the Line
> chart to bars/stacked/combo — today `showTrend`/`trendMethod` only exist in `Studio.CHARTS.line.opts`.
> ⚠️→✓ **Real bug found + fixed while starting that extension (2026-07-04):** every Z7HW/Z7TR test
> above calls `PDC.line(...)` directly on a scratch element, bypassing `studio-render.js`'s actual
> `renderPanel()` dispatch — the ONLY render path for both the live preview and every real export
> (`Studio.CHARTS` itself is never inlined here, see the v214 note in the DONE log). That dispatch's
> `"line"` case only ever forwarded `showTrend`/`forecastPeriods`, NOT `trendMethod`/`alpha`/`beta`/
> `gamma`/`seasonLength` — so picking "Seasonal (Holt-Winters)" (or any Holt tuning) in the real
> inspector silently rendered plain linear OLS regardless, on every dashboard, since Holt shipped in
> v199. Confirmed live (not just by reading code): reverting the fix reproduced a 2-point straight
> line with `trendMethod:"hw"` set; the fix produces a genuine multi-segment seasonal fit. Fixed by
> passing the missing fields through. **Extended the Line chart's trend overlay to Combo** in the
> same slice (closes the "combo" part of the "still open" note above — hoisted `trendOf`/`holtOf`/
> `holtWintersOf` out of `_lineOpts` to module scope first so Combo reuses the identical math rather
> than a second copy, the same "one source of truth" lesson v304 applied elsewhere): a **Show trend
> line** toggle + Forecast method/alpha/beta/gamma/seasonLength on Combo's own line series, fitted
> over the real data only (no forecast tail yet — Combo's fixed-width bars leave no room to widen
> without their own follow-up). New regression tests drive the REAL inspector controls / a REAL
> panel + preview iframe (not a direct `PDC.line`/`PDC.combo` call) specifically so this class of
> dispatch gap can't silently regress again. 6 new tests, suite 1412/1412. **Still open:** bars/
> stacked, and a forecast tail for Combo.
> ✓ **Bars/Stacked trend overlay shipped (2026-07-04, closes the "bars/stacked" half of the note
> above).** Same shared `trendOf`/`holtOf`/`holtWintersOf` math extended to the vertical **Bar
> chart** (trend across category values; horizontal bars skip it — no left-to-right sequence to
> follow there) and to **Stacked bars** (trend fitted over each category's stack TOTAL, the only
> single number per category a stack has). New `showTrend`/`trendMethod`/`alpha`/`beta`/`gamma`/
> `seasonLength` opts on both `Studio.CHARTS.bars`/`.stacked`; wired through `studio-render.js`'s
> real dispatch (the exact fields the v199/Holt-Winters bug above showed get silently dropped if
> forgotten) so preview and every export share the same fix. 9 new tests drive the real inspector
> options through a real panel + preview iframe (mirroring the Combo test's rigor) — off-by-default,
> single-segment linear, and multi-segment Holt-Winters all asserted; horizontal bars asserted to
> never draw the overlay even when explicitly requested. Docs updated. Suite 1431/1431. **Still
> open:** a forecast tail for Combo/Bars/Stacked (today only Line widens its x-scale for one).
> ✓ **Combo forecast tail shipped (2026-07-04, closes the "Combo" half of the note above).** Combo
> gains the same `forecastPeriods` field Line has; when set, the chart widens its bar-slot count
> (bars stay put, new bar-less slots appear at the right) so the trend/forecast line can project
> past the real data — same "+1/+2/…" forecast ticks + dashed separator as Line. `lmax` (the line's
> right-axis scale) now accounts for the forecasted values too, so a rising/falling forecast isn't
> clipped. 4 new tests (no-tail baseline, 3-period tail ticks/separator, trend line spans the tail).
> Docs updated. Suite 1435/1435. **Genuinely still open:** a forecast tail for Bars/Stacked (their
> fixed category axis has no obvious "future slot" the way a time-ordered Line/Combo does — would
> need its own design pass, not a copy-paste of this pattern).
> ✓ **Slice 4 shipped v204 — statistical KPI computations, first cut**: KPI inspector gets an
> **Aggregation** picker (First row / Sum / Average / Median / Min / Max / P90 / P95 / Std deviation);
> non-default choices recompute the tile's value across every row the bound query returns instead of only
> reading row 0. `Studio.aggregate(values, agg)` + `Studio.percentileOf(sorted, p)` in model.js are pure,
> independently-testable functions (standard R-7 linear-interpolation percentile). Stored as `k.agg`,
> omitted from the spec entirely when left at the default. 7 new tests, suite 962/962. **Still open:**
> z-score, correlation, and full regression/distribution KPI computations.
> ✓ **Slice 5 shipped v207**: **Z-score** added to the KPI Aggregation picker — how many standard
> deviations the most recent row sits from the bound query's mean (`Studio.aggregate(values,"zscore")`),
> a quick anomaly/outlier read without a separate query. Docs' KPI tile card now documents the whole
> Aggregation picker (was undocumented since v204). 2 new tests, suite 966/966. **Still open:**
> correlation and full regression/distribution KPI computations.
> ✓ **Bug fix shipped v214 — KPI Aggregation was crashing every export/preview.** Found while building an
> unrelated feature: `studio-render.js` (the runtime that ships inside every exported CDF + the live
> preview iframe) called `Studio.aggregate(...)`, but `Studio` (app/model.js) is a **builder-only module
> never inlined into the exported bundle** — `Studio.buildHtml` only embeds `vendor/pdc-ui.js` +
> `studio-charts.js` + `studio-render.js`. Any KPI with a non-"first" `agg` therefore threw
> `ReferenceError: Studio is not defined` inside `renderAll()`'s `_kTiles` map — silently breaking
> rendering for **every** KPI on the dashboard (not just the aggregated one), in the live preview AND in
> every real export, since the v204/v207 ship. Fixed by giving `studio-render.js` its own local
> `aggregateOf()`/`pctOf()` (same pure math, same convention `fmt()`/`color()` already use — go through
> `PDC`, never reach for `Studio`). Also fixed the Z7AGG-2 Playwright check itself: it was a **false
> positive** — its KPI happened to be bound to a pre-aggregated single-row DA, so "sum of one row"
> trivially equalled "first row," and the assertion only ever passed because the crash made the compared
> value `null` instead. Rebound the test to a real multi-row DA/column so it's a meaningful check, and
> added a dedicated regression test that loads a *real* built bundle (served over `http://`, not
> `about:blank`) and asserts zero console/page errors. Test suite 989/989.
> ✓ **Correlation KPI shipped v215 (closes the "still open" item above).** The Aggregation picker gains
> **Correlation (vs. Compare-to column)** — the one two-column option, so it reuses the KPI's existing
> **Compare to → Compare column** field as its second series instead of adding a new UI section; a hint
> note appears under Aggregation when "corr" is picked. `Studio.pearsonCorr(a, b)` in model.js (pairwise,
> drops rows where either side isn't numeric) plus, per the v214 lesson, its own local `pearsonCorrOf()`
> copy in studio-render.js (model.js is never inlined into the exported/preview bundle — see v214). When
> `agg==="corr"` the existing delta-comparison block is skipped (compareCol is repurposed, not a delta).
> 4 new tests (unit math + inspector hint + a self-correlated column rendering 1 with no crash, correctly
> outwaiting the KPI tile's 750ms count-up animation this time — the two prior attempts at this exact
> assertion were false failures from reading the tile mid-animation, not real bugs). Test suite 993/993.
> ✓ **Scatter correlation insight shipped v217 (independent take on correlation, built the same hour)**:
> rather than only a correlation *aggregation* on the single-column KPI picker, **Scatter / bubble**
> panels also get their own Insight narration — `Studio.computeCorrelation(cols, rows, xCol, yCol)`
> (Pearson's r, same plain-English strength/direction phrasing as `computeInsights`) replaces the
> single-series trend read for scatter panels specifically, reusing the v212 Insight section/UI. This is
> a builder-only inspector feature (not part of the exported/preview runtime), so it isn't subject to the
> v214 bug class. 3 new tests, suite 996/996 (at the time; the default header logo slice — Z6 entry
> above — landed the same hour, bringing the final total to 1001/1001).
> ✓ **Variance + range shipped v223 (closes the Z7 "still open" item)**: the KPI Aggregation picker
> gains **Variance** and **Range (max − min)**, alongside the existing Sum/Average/Median/percentiles/
> Std deviation/Z-score/Correlation. Same `Studio.aggregate()` (model.js) + its exported-runtime twin
> (`aggregateOf` in studio-render.js) pattern as every prior aggregation. 2 new tests, suite 1021/1021.
> **Z7 track is now feature-complete**: forecasting (moving average/linear/Holt trend), and a full
> statistical-KPI-aggregation set (sum/avg/median/min/max/percentiles/stddev/variance/range/zscore/corr).
> Remaining stretch ideas (not required): seasonal Holt-Winters, regression beyond scatter's trend line.
> ✓ **Seasonal Holt-Winters shipped v270 (closes the "seasonal Holt-Winters" stretch idea)**: Line/area's
> Forecast method picker gains a third choice, **Seasonal (Holt-Winters)** — `holtWintersOf()` in
> `studio-charts.js` layers a repeating additive seasonal offset on top of Holt's level+trend (two new
> tuning fields, **Smoothing seasonality γ** and **Season length**), so the forecast tail reproduces a
> recurring pattern (e.g. a quarterly spike) instead of a straight extrapolation through it. Needs at
> least 2 full seasons of real data (`seasonLength * 2` points) to fit initial seasonal indices; with
> less it quietly falls back to plain Holt rather than guessing. Shares the same builder-only vs.
> exported-runtime split every prior Z7 feature follows (`studio-charts.js` is inlined into both, so no
> separate render-side copy was needed here, unlike the KPI aggregations). `docs/index.html` updated. 3
> new tests, suite 1221/1221. **Remaining stretch idea (not required):** regression beyond scatter's
> existing trend line.

**Z8 — Context-aware inspector (per chart type) + visual setting hints (user-requested 2026-06-30).**
The panel inspector currently shows ALL setting sections regardless of chart type — e.g. a **Table**
panel shows chart-only sections (Callout Arrow, Color Scale, the area-band Top/Bottom-edge + Fill, etc.)
that don't apply. Make the inspector **adapt to the selected chart type**: show only relevant sections,
hide the rest, and add type-specific options where they're missing. Build a per-type capability map so
each chart type declares which inspector sections apply + its own extras. Examples: a **Table** should
have row limit, paging / page size, sort, column **subtotals / grand total**, freeze header, and row
density — but none of the callout/colour-scale/band controls. **Do this comprehensively for EVERY chart
type, not just tables** — go through all ~51 types and give each its own relevant section set plus any
missing type-specific options (e.g. KPIs, treemaps, line/area, scatter, gauge, sankey, calendar-heatmap
each surface only what applies to them). The goal is a much easier-to-consume, self-explanatory inspector.
Also, with so many settings now, add a small **inline visual hint** for each setting — a
tiny graphic / icon / before↔after thumbnail showing what it does — to make the dense inspector
self-explanatory. Keep it light (inline SVG / CSS, no image assets or deps). One slice per loop; tests green.
> ✓ **Slice 1 shipped v138**: `Studio.ANNOT_CAPS` capability map (+ `Studio.chartSupports(kind, type)`)
> now gates the 5 interaction sections whose usefulness genuinely varies by chart type — Drill-through
> (bars/donut only), Detail drawer (bars/donut/treemap/table), Cross-filter, Conditional formatting, and
> Color scale (bars/donut/treemap/lollipop) — hidden entirely when the selected type doesn't support them.
> Period highlight/Event markers/Point annotations were already type-gated (pre-Z8); Target line/Reference
> band/Callout arrow remain type-agnostic overlays (genuinely apply to any chart body) and are unchanged.
> ✓ **Slice 2 shipped v139**: Table gained its own `opts` — **Row limit** (cap rows shown, 0 = all) and
> **Show grand total row** (bold `<tfoot>` summing numeric columns over the currently visible/filtered
> rows). Table already had search/sort/stripes (v113).
> ✓ **Slice 3 shipped v140**: the rest of the "Table extras" wishlist — **paging** (rows-per-page +
> Prev/Next bar), **freeze header** (sticky thead in a scrollable wrap), and **row density**
> (comfortable/compact). Table's own option set is now feature-complete per the original wishlist.
> ✓ **Slice 4 shipped v141**: **Gauge** gets its own options — a **Value format** picker (was always a
> raw rounded number) and **Warning/Good zone %** thresholds (were hardcoded 70/90 in the vendored
> toolkit, invisible to the builder). The arc now shows a permanent red/amber/green zone track behind
> the value tick (same convention as Bullet), so thresholds are self-explanatory instead of only implied
> by the needle recoloring once it crosses an invisible line.
> ✓ **Slice 5 shipped v142**: **Treemap** gets its own options — **Show tile labels** (toggle off the
> bold title+value text the toolkit always drew on any big-enough tile) and **Show % of total, not
> value** (swap the value line for the tile's share of the whole — usually the actual question a
> treemap answers). Tooltip unaffected (still shows both). Same override pattern as Table/Gauge
> (`PDC._treemapBase` kept for reference).
> ✓ **Slice 6 shipped v143**: **Scatter / bubble** gets its own options — **Value format** (axis ticks +
> tooltip were always `PDC.fmt.abbr`) and **Show trend line (regression)** (least-squares regression
> line through the plotted points, clamped to the visible axis range). Same override pattern
> (`PDC._scatterBase` kept for reference); fmtX/fmtY fall back to true `abbr` default for panels saved
> before this option existed, so no existing dashboard regresses.
> ✓ **Slice 7 shipped v144**: **Line / area** gets its own options — **Smooth curve** (cubic-bezier
> interpolation between points instead of straight segments, same midpoint-control-point technique as
> the Bump chart) and **Show data points** (hide the per-point dot markers for a cleaner look on dense
> series; a transparent hover target keeps tooltips working even with dots hidden). Same override
> pattern (`PDC._lineBase` kept for reference).
> ✓ **Slice 8 shipped v145**: **Donut / pie** gets its own options — **Sort slices by value**
> (largest-first instead of row order), **Show legend** (hide the side legend so the ring fills the
> panel), and **Inner radius %** (adjustable ring thickness, 0 = full pie with no center hole/label).
> Same override pattern (`PDC._donutBase` kept for reference); cross-filter's click-to-label wiring
> (`wireXFilter` in studio-render.js) mirrors the sort so slice clicks still map to the right label.
> ✓ **Slice 9 shipped v146**: **Bar chart** gets its own options — **Sort by value** (largest-first,
> mirrors Donut's "Sort slices") and **Show value labels** (hide the always-on value text for a cleaner
> look on dense charts). Same override pattern (`PDC._barsBase` kept for reference); `wireXFilter`'s bars
> branch now mirrors the sort too, and CDE export's `valuesVisible` reflects the option.
> ✓ **Slice 10 shipped v147**: **Stacked bars** gets its own options — **Sort by total** (largest-first,
> mirrors Bars/Donut) and **Show value labels** (per-segment value text, shown only when the band is tall
> enough). Same override pattern (`PDC._stackedBase` kept for reference); CDE export's `valuesVisible`
> reflects the option.
> ✓ **Slice 11 shipped v148**: **Calendar heatmap** gets its own options — **Cell color** (was hardcoded
> to the brand color) and **Week starts on** (Monday/Sunday — weeks always rolled over from Monday
> before). Same per-type override pattern; weekday labels reorder to match the chosen start day.
> ✓ **Slice 12 shipped v149**: **KPI tiles** get a "Click-through" section (Target URL + URL parameter) —
> click a tile to navigate to another dashboard, using the same shared `PDC.bindDrill` helper bars/donut
> already use for Drill-through. First KPI-specific inspector addition under Z8.
> ✓ **Slice 13 shipped v150**: **Stacked area** gets its own options — **Smooth curve** (cubic-bezier
> band edges, same technique as Line/Bump) and **Show legend** (the renderer already supported hiding the
> legend via `cfg.legend`; the inspector never exposed a toggle until now).
> ✓ **Slice 14 shipped v151**: **Stream graph** gets its own options — **Show legend** (same story as
> Stacked area — the renderer already supported `cfg.legend` but nothing exposed it) and **Band opacity**
> (ribbon fill-opacity was hardcoded to 78%, now a 0–100% slider).
> ✓ **Slice 15 shipped v152**: **Radar / spider** gets its own options — **Show legend** (same story as
> Stacked area/Stream graph — `cfg.legend` was already supported internally but never exposed) and
> **Show vertex dots** (hide the per-vertex dot markers; invisible hover targets keep tooltips working,
> same convention as Line's "Show data points").
> ✓ **Slice 16 shipped v153**: **Chord / wheel** and **Network / topology** get their own options — both
> gain a **Show labels** toggle (arc labels for Chord, node labels for Network) to declutter a dense
> diagram. These were the last two Flow-group types still on generic fmt+height only; sankey already had
> its own source/destination captions (v55), waterfall/funnel/sunburst/combo already had type-specific
> options too (showTotal/showPct/showLabels/dual-axis fmt) so the actual gap was just these two.
> ✓ **Slice 17 shipped v154**: **Bump / ranking** gets **Show rank numbers in dots** and **Icicle /
> partition** gets **Show cell labels** + **Show % of total, not value** (mirrors Treemap's pattern) —
> the last two chart types still on bare fmt+height with zero distinguishing options. Audited every
> type's `opts` array to confirm: bars/donut/stacked/lollipop/dumbbell/slope/dotplot/beeswarm/histogram/
> polarArea/step/violin/marimekko/packedBubble/wordCloud/gantt/divergingBar/candlestick/waffle/timeline/
> pyramidBar/radialBar/pareto/groupedBars/ridgeline/barNorm/areaRange/quadrant/waterfall/funnel/sunburst/
> combo/bullet/sankey all already carry at least one genuine type-specific option alongside fmt+height.
> ✓ **Slice 18 shipped v155 (per-type option sweep now genuinely complete)**: **Grouped bars** gets
> **Show value labels** and **100% stacked bars** gets **Show segment % labels** — the v154 audit had
> miscounted these two as already-done because `rotate` (a generic option shared by many bar-family
> types) isn't actually type-specific. Every chart type now carries at least one real type-specific
> option beyond fmt+height.
> ✓ **Inline visual setting hints — first cut shipped v220.** A shared `OPT_HINTS` map in `studio.js`
> (keyed by option `key` regex, not per chart type) attaches a small SVG glyph + tooltip next to a
> bool-type option's checkbox in `optField()` — covers the **sort** family (sortBars/sortSlices/
> sortStack/sorted — "Reorders items largest-value-first…"), **showLegend** ("Shows a small key
> mapping…"), **smooth** ("Draws curved segments…"), and **showDots** ("Shows a marker dot at every
> point…") in one pass, since those exact keys repeat across a dozen+ chart types from the earlier Z8
> per-type slices. 4 new icons (`sort-desc`/`legend`/`curve`/`dots`) in `app/icons.js`. Docs updated.
> 6 new tests, suite 1015/1015.
> ✓ **Three more families shipped v221**: `showValues`/`showLabels` (both get a `tag` glyph — "shows the
> number/label directly on the chart, not just the tooltip") and `showPct` (a `percent` glyph — "shows the
> figure as a percentage… rather than its raw value"), covering bars/stacked/groupedBars,
> sunburst/chord/network/treemap/icicle/polarArea/packedBubble, and funnel/treemap/marimekko/icicle/barNorm
> respectively. 3 new tests, suite 1018/1018.
> ✓ **`rotate` family shipped v222 (Z8 inline-hint sweep now covers every sizeable repeated option
> family).** New `rotate-text` glyph ("Tilts the axis labels diagonally so long category names fit without
> overlapping.") on bars/stacked/groupedBars/barNorm. 1 new test, suite 1019/1019. **Z8 follow-ups (not
> yet done):** true before/after thumbnails (not just a glyph+tooltip) for the least-obvious remaining
> one-off options, and per-chart-type-specific hints beyond the shared-key families covered here.
> ✓ **Two more repeated families shipped v249**: new `trend-up` glyph ("Draws a straight regression/
> forecast line through the data, showing its overall direction.") on Scatter's `trend` and Line's
> `showTrend` toggles — the same underlying concept under two different key names, previously
> unhinted; new `sigma` glyph ("Adds a bold summary row at the bottom, totalling every numeric column
> over the visible rows.") on Table's `grandTotal` toggle. 2 new icons in `app/icons.js`, 3 new tests,
> suite 1152/1152.
> ✓ **Seven more one-off options hinted, shipped v252**: Line/Radar's `area`/`fill` ("Fills the shape
> with a soft color instead of drawing only its outline."), Line's `showMA` ("Overlays a smoothed
> moving-average line…"), Table's `freezeHeader` ("Keeps the header row pinned in place…"), Waterfall's
> `showTotal` ("Adds a bold final bar showing the running total…"), and two keys that duplicate an
> already-hinted concept under a different name — Heatmap's `showVals` and Bump's `showRankNumbers` —
> both reuse the existing `tag` glyph rather than mint a near-duplicate icon. 4 new icons (`area-fill`/
> `moving-avg`/`freeze-header`/`total-bar`) in `app/icons.js`. 7 new tests, suite 1159/1159.
> ✓ **The last four one-off options hinted, shipped v253 (Z8 inline-hint track now genuinely
> complete)**: bars/box plot's `horizontal` orientation toggle, Violin's `showBox` (IQR overlay),
> Pareto's `showRef` (80% reference line), and Area range's `showCenter` (band center line). 4 new
> icons (`swap-axis`/`iqr-box`/`ref-line`/`center-line`) in `app/icons.js`. 5 new tests, suite
> 1163/1163. **Z8 follow-ups (still not yet done):** true before/after thumbnails for the least-obvious
> options — every option now at least carries a glyph+tooltip hint.
> ✓ **True before/after thumbnails, first cut shipped v323 (closes the "still not yet done" item
> above for the two option families where it matters most)**: the `sort`/`smooth` hint icons now
> reveal a genuine **Off → On picture popover** on hover/focus (`.opt-hint-pop`, CSS-only
> `:hover`/`:focus`/`:focus-within` reveal, no JS show/hide race) instead of only a text tooltip —
> two tiny generic SVG diagrams (unsorted vs. sorted bars; straight polyline vs. the SAME
> midpoint-control-point cubic-bezier the real Line/Bump renderers use for "Smooth curve") labeled
> Off/On. Deliberately opt-in per hint family (via a new `thumb` fn on the `OPT_HINTS` entry) rather
> than a blanket change — families like `showLegend` keep the lighter tooltip-only treatment.
> `docs/index.html` updated. 5 new tests, suite 1404/1404. **Still open:** the remaining one-off hint
> families (legend/dots/labels/etc.) could get their own thumbs too if a future pass judges the
> picture genuinely clearer than the prose for them.
> ✓ **Two more families shipped v332 (extends the "still open" item above — legend/dots now also get a
> real picture)**: `showLegend` (a mini bar chart gaining a 3-row legend key on) and `showDots` (a line
> path gaining circle markers at each point on) join `sort`/`smooth` with the same opt-in `.opt-hint-pop`
> Off → On popover. The tag-glyph family (`showValues`/`showLabels`/etc.) deliberately stays tooltip-only
> — verified by a regression test — since it's a much less visual concept ("a number appears somewhere")
> than these four. `docs/index.html` updated. 4 new tests, suite 1445/1445. **Still open:** the tag/percent/
> rotate/etc. one-off families could still get their own thumbs if a future pass judges a picture clearer.
> ✓ **Two more families shipped v335 (extends the item above — 'Show value/label' and 'Rotate
> labels' now also get a real picture)**: the tag-glyph family (`showValues`/`showLabels`/`showVals`/
> `showRankNumbers` — all four share the same icon and concept, "a label appears on the element")
> gains a mini bar chart that sprouts label tags above each bar when on; `rotate` gains a mini bar
> chart whose axis-label ticks visibly tilt ~35° when on vs. stay upright when off — genuinely the
> single clearest case for a picture over prose in the whole hint set. `showPct` (percent-glyph)
> deliberately stays tooltip-only, still proving the mechanism is opt-in. `docs/index.html` updated.
> 4 new tests, suite 1455/1455. **Still open:** `showPct`/`horizontal`/etc. could still get their
> own thumbs if a future pass judges a picture clearer.

**Z9 — Mobile: fix the broken flows + a proper bottom nav (user-requested 2026-06-30).**
> ⚠️ **ESCALATED — see the ★★★ TOP PRIORITY — MOBILE block at the top of NEXT** (user re-reported 2026-07-02
> with screenshots; still "wildly inoperable"). Do that block's confirmed-root-cause sequence FIRST, ahead
> of all Z-platform work, with real 390×844 screenshot verification each slice. The notes below are the
> earlier, partial framing.
Reported
regressions on small screens: the top button-bar scrolls/slides but **its dropdown menus don't open /
work** — fix that first (touch handlers, menu positioning, tap-outside-to-close). Add a **bottom
navigation** to switch between the Studio's **data-source / canvas / chart-object (inspector)** views on
phones (the three panes become swipeable/tabbed sections). Coordinate with the Z1 shell so the left rail
collapses into a sensible mobile pattern (bottom bar or hamburger sheet). Use **modern flows and
animations** — drawer/sheet motion, tab transitions, momentum — smooth, elegant, and modern (respect
prefers-reduced-motion). Verify with the mobile Playwright checks and ADD a regression test for
"dropdown opens on touch". (There is an older mobile track (B) too — this supersedes/extends it with the
specific bugs + the new-shell mobile behavior.)
> ✓ **Root cause of the "dropdown menus don't open" report found + fixed, shipped v137**: at **tablet
> widths (641–900px)**, `#topbar`/`.top-actions` need `overflow:hidden` to stop the button row from
> forcing page-level horizontal scroll — but that same clip box was also hiding every dropdown (New ▾ /
> Examples ▾ / Export ▾ / ⋯ More), since `.menu` is `position:absolute` and extends below the topbar's
> own box. The menu still gained the `.open` class and reported normal computed styles, so it looked
> fine to a DOM check (and to Playwright's default click/tap actionability check) while being genuinely
> invisible/untappable on screen — confirmed visually via screenshot before fixing. Extended the same
> `position:fixed` escape hatch already used at ≤640px (phone) to the tablet range too, anchored under
> its button. Added an `elementFromPoint`-based regression test (the only kind that actually catches
> ancestor-overflow clipping — `.classList.contains("open")` alone does not) for New/Export/More at a
> tablet viewport; confirmed it fails without the fix and passes with it. **Still open under Z9**: the
> bottom-nav/drawer pattern already exists at phone width (M2, `#mobile-tabs`); a live-device pass
> across the true 641–900px tablet band remains.
> ✓ **Dropdown-menu motion polish shipped v189**: every topbar dropdown (New ▾/Examples ▾/Export ▾/⋯ More)
> now fades + rises in (opacity/transform, `.14s ease`) instead of a hard `display:none`/`block` cut,
> and is genuinely non-interactive while closed (`pointer-events:none`, `visibility:hidden` after the
> fade-out completes) rather than merely invisible. Respects `prefers-reduced-motion`. Desktop/tablet
> only — mobile drawers/sheets already have their own dedicated open/close motion.

**Z10 — App theme system: theme × light/dark (user-requested 2026-06-30).**
> ★ **See the ★★ HIGH PRIORITY visual-refresh block at the top of NEXT** (user-requested 2026-07-02): align the
> **default dashboard palette** to the fleet's modern dark system (jobtracker.polecat.live tokens) and kill the
> flat-blue cast — do that ahead of the remaining Z10 polish below.
The new Polecat warm-dark
rail (Z1) currently **clashes** with the Studio's original "classic blue" chrome + dark mode — two
palettes on screen at once. Introduce a real **theme system in Settings**, not a one-off recolor: a small
set of named color themes (e.g. **Classic Blue**, **Polecat** (warm plum/terracotta/cream), room for
more), each defined as a **coherent set of CSS custom properties** with BOTH a **light** and a **dark**
variant. The current dark mode becomes "Classic Blue · Dark"; **Polecat gets its own warm-dark** (plum/
charcoal bg, cream text, terracotta accents) — more visually pleasing and on-brand than the cool-blue
dark. Apply via `data-theme` + `data-mode` on the root so the **rail, top bar, panels, and all chrome
derive from the active theme together** (keep the per-section rail icon accents vivid). Persist theme+mode
in localStorage; the existing **Dark/Light** button becomes the **mode** toggle *within* the active theme.
Design decision to surface: whether the **exported dashboard** theme follows the app theme or stays
independent — recommend keeping export theming **separate/optional** so deployed artifacts aren't coupled
to app chrome. Build incrementally (theme tokens first, then the Polecat dark variant, then the Settings
picker); tests green. Coordinate with Z1 (rail) and Z5 (Settings).
> ✓ **Slice 1 shipped v191**: theme tokens (`[data-app-theme='polecat']` light + dark CSS variable
> blocks in `studio.css`, orthogonal to `[data-theme]` mode) + the Settings → Appearance **Color theme**
> picker (Classic Blue / Polecat), persisted + exportable. Exported-dashboard theming stays independent,
> as recommended above.
> ✓ **welcome/tutorial/palette themed, shipped v181**: `app/welcome.js` converted to the shared
> `--pentaho`/`--pdc`/`--pane`/etc vars; found + fixed a real latent bug in `app/tutorial.js` (dark-mode
> rules keyed off a nonexistent `body.dark-mode` class — this app's dark mode is `[data-theme='dark']` on
> `<html>`, so the interactive tutorial had rendered light-only in dark mode since it shipped) and a
> nonexistent `--text` var in `app/palette.js`. `app/gate.js` was deliberately left alone at the time
> ("renders before the saved theme loads").
> ✓ **gate.js themed too, shipped v198**: revisited that call — gate.js now reads
> `studio-theme`/`studio-app-theme` from `localStorage` itself and sets `data-theme`/`data-app-theme` on
> `<html>` before its own first paint, then uses the same shared vars. **Z10 track's chrome-theming pass is
> now complete** (welcome/tutorial/palette/gate all follow Classic Blue/Polecat × light/dark). **Still
> open:** the rail's own vars aren't Polecat-aware yet (`#railNav` always renders the warm Polecat palette
> regardless of `data-app-theme` — intentional since the rail was the Z1 foundation, but worth a design
> call on whether Classic Blue should get a "cool" rail variant too).
> ✓ **Rail theme-awareness shipped v247 (closes the "still open" design call above)**: `#railNav` (and its
> mobile-drawer hamburger, `#mobileNavBtn`) used to render the warm Polecat plum/cream palette under EVERY
> app theme, including Classic Blue — clashing with Classic Blue's cool blue accent. The rail is the app's
> permanent dark "shell" bar (it never follows light/dark `[data-theme]` mode, by design), so each app
> theme now gets its own dark rail palette instead: Polecat keeps the original warm plum/terracotta/cream,
> Classic Blue gets a cool navy/ink variant (`#0f1c33`/`#182c4d`) that reads as one coherent identity with
> its blue `--pentaho` accent. Per-section icon accents (amber/teal/blue/violet) stay vivid in both, per
> the design language. 1 new test. Test suite 1147/1147. **Z10 track is now feature-complete.**

**Z11 — In-app docs: discoverability + continuous upkeep (user-requested 2026-06-30).** ✓ **Rail Help
entry shipped v136**: a persistent `#railHelp` link at the bottom of the left rail opens `docs/index.html`
in a new tab — no longer buried solely in ⋯ More (which still has its own entry too). Contextual `.sec-help`/
`.ct-help` links (J2/J4) already exist per-section/per-chart-type.
> ✓ **Docs page now follows the active app theme, shipped v227 (closes "still open" above)**: `docs/index.html`
> reads `studio-theme`/`studio-app-theme` from `localStorage` and sets `data-theme`/`data-app-theme` on
> `<html>` before first paint (same pattern `app/gate.js` uses), so opening Help in a new tab no longer
> looks like a stray unstyled light page when the Studio itself is in dark mode or the Polecat theme.
> Classic Blue/Polecat × light/dark variants defined for the existing CSS custom properties plus the
> hardcoded CDF/CDE/CDA badge chip colors and the tip-card gradient. No saved preference (first-ever visit,
> or Help opened outside the app) keeps the original light default untouched. 2 new tests, suite 1038/1038.
> Keep treating docs as a living reference (standing responsibility, see Conventions).
> ✓ **Banner title size shipped v228 (first cut of "full text formatting")**: a **Title size** picker
> (Default / Small / Large / Extra large) in the Dashboard inspector, right below Subtitle —
> `spec.titleSize` → a `.pdc-title{font-size:…}` CSS override in the exported/preview banner
> (`Studio.TITLE_SIZE_PX` in model.js; same additive-override pattern as `headerBg`, vendor CSS stays
> pristine). Added to the `normalize()` whitelist (the exact bug class the v193 headerLogo fix caught —
> a new scalar field silently reset on every reopen if forgotten there). 4 new tests including a
> reopen-through-normalize() regression, suite 1042/1042.
> ✓ **Subtitle style shipped v229 (closes "full text formatting" — Z6 track now feature-complete)**: a
> **Subtitle style** picker (Normal / Italic / Bold / Bold italic) next to Title size — `spec.subtitleStyle`
> → a `.pdc-sub{font-weight/font-style:…}` CSS override, same additive-override + `normalize()`-whitelist
> pattern as titleSize/headerBg. 4 new tests, suite 1046/1046. **Z6 track (banner/header editor + naming
> model) is now feature-complete**: title/subtitle/naming, logo, link, accent + background color + title
> size + subtitle style, and a named style-preset collection covering all of it.
> ✓ **Default title size + subtitle style shipped v230 (Settings/preset parity follow-up)**: the two
> newest per-dashboard fields (titleSize/subtitleStyle, v228/v229) now have Settings defaults + style-preset
> snapshotting too, matching subtitle/accent/logo/headerBg — a house style saved as a preset now covers
> every banner field that exists. 5 new tests, suite 1051/1051.

**Z12 — Branding & app identity: de-dup the logo, favicon, Settings option (user-requested; revised 2026-06-30).**
Design direction (best practice — the user wants it clean, not a redundant single letter):
- ✓ **Remove the redundant "P" square from the app title / content header** — shipped v134: topbar now
  leads with the styled wordmark alone.
- ✓ **Anchor app identity at the TOP of the left rail** — shipped v134: `#railBrand` (favicon-glyph mark +
  "Dashboard Studio" label, collapses to just the mark, click → Home).
- ✓ **Favicon** — shipped v134: `favicon.svg` (terracotta-gradient bar-chart mark) + `apple-touch-icon` +
  `site.webmanifest` + `theme-color`. Note: `apple-touch-icon` points at the SVG (no PNG rasterizer in this
  toolchain) — iOS home-screen icons may not render until a real PNG variant is generated; revisit if that
  matters in practice.
- ✓ **Make branding a Settings option — shipped v167.** A **Branding** card on the Settings page: Default /
  Custom logo (upload, ≤200KB, stored locally) / None, applied live to the rail brand mark. **Z12 track
  complete.** Still open for a future pass: tying this into the Z5/Z6 style-preset collections once those
  exist.
- ✓ **Real PNG `apple-touch-icon` shipped v236 (closes the last Z12 loose end)**: `<link rel="apple-touch-icon">`
  pointed straight at `favicon.svg`, which iOS Safari does not reliably rasterize for "Add to Home Screen" —
  the app had no image-processing dependency to generate a real bitmap. `tools/gen-apple-touch-icon.js` is a
  one-off script that reuses the headless Chromium Playwright already vendors for `tests/run.js` (screenshot
  the SVG at 180×180, Apple's documented size) instead of adding a new dependency; `apple-touch-icon.png` is
  committed as a static asset, same as `favicon.svg` itself — not a runtime/build-step dependency of exported
  dashboards. 2 new tests (real PNG magic bytes + IHDR 180×180 dimensions, not just link-tag presence). Test
  suite 1097/1097.

**Z13 — Curated showcase examples: make them a COMPLETE, dazzling survey (user-requested 2026-06-30,
expanded).** Done so far: replaced the 17 legacy v2 boards with 6 curated examples; gallery glow-up (real
per-chart thumbnails, no CDF/CDE badges); one grid ordered **most-spectacular-first, no single hero**;
fixed KPI/gauge NaN/`0`/double-`%` (sample-data generator + example gauges).
> ✓ **7th example shipped v156**: "Data Platform Operations Center" (`ops-command.studio.json`, second in
> gallery order) covers **8 previously-missing types in one dashboard**: sankey, network, quadrant,
> calHeatmap, bump, sunburst, waffle, pareto. Gotcha learned along the way (worth remembering for future
> examples): `app/sampledata.js`'s `classify()` checks the **"name" keyword group before "count"** —
> a column literally named `job_count` gets misclassified as a **name** (string) column because it
> contains "job", producing non-numeric values and a silent "No data" empty state; renaming to e.g.
> `run_count` avoids the collision. Always sanity-check a new example's `Studio.genMock(spec)` output
> per DA before shipping, not just that panels render *something*.
> ✓ **8th example shipped v157**: "Product Delivery & Engineering Console" (`engineering-delivery.studio.json`,
> third in gallery order) covers **8 more previously-missing types**: table, combo, groupedBars, stacked,
> dumbbell, histogram, timeline, wordCloud. Gotcha learned along the way: any column name containing
> `day`/`date`/`period`/`month` classifies as the **"month" kind** (returns text like "Jan") even when the
> chart needs a real number (e.g. a histogram's numeric `valueCol`) — a column called `cycle_time_days`
> silently breaks a histogram; renamed to `cycle_time_hrs` to keep it numeric. Also confirmed (not a bug,
> just a known cosmetic limit): `sampleRows` always emits exactly 8 rows with **8 distinct** categorical
> labels, so any chart that groups multiple raw values per label for its visual (boxplot's quartile box,
> beeswarm's per-category jitter, violin/ridgeline's KDE curve) will only ever see **one value per group**
> in the offline preview — it renders without error but looks degenerate (a flat line, not a real spread).
> That's why boxplot/violin/ridgeline/beeswarm were skipped this round; a real fix would need the sample
> generator to support multiple rows per label, which is a separate, larger slice.
> ✓ **9th example shipped v158**: "Finance & FP&A Command Center" (`finance-command.studio.json`, fourth in
> gallery order) covers **8 more previously-missing types**: candlestick, areaRange, divergingBar,
> radialBar, icicle, chord, parallelCoords, gantt. Found + fixed a real latent bug: the `icicle` case in
> `studio-render.js` read a bare undefined `groupCol` instead of `m.groupCol`, so any icicle panel with a
> group column threw and rendered nothing — nothing had exercised two-level icicle mode until this example.
> `sampledata.js` gained a `signed` classify kind (variance/delta/diff/change column names) so diverging
> metrics actually diverge in the offline preview.
> ✓ **10th example shipped v159 — the "easy" batch is complete**: "Marketing & Growth Performance Console"
> (`marketing-growth.studio.json`, fifth in gallery order) covers the **last 10 non-distribution-limited
> types**: streamgraph, richtext (text/annotation), slope, dotplot, polarArea, step, marimekko,
> packedBubble, pyramidBar, barNorm. Fixed the generic "all examples render every panel" Playwright check,
> which only counted `svg`/`table` as evidence of render — a richtext panel renders a `.sr-richtext` div
> instead, now included in that selector. Gallery chart-type coverage is now **47 of 51**.
> ✓ **11th example + multi-row generator shipped v172 — "every chart type" goal COMPLETE (51 of 51)**:
> `Studio.sampleRows(da, valueOnly, multiRow)` gained an opt-in multi-row-per-label mode (5 labels × 6
> jittered rows instead of 8 single-row labels); `Studio.genMock()` auto-detects DAs feeding a
> boxplot/violin/ridgeline/beeswarm panel and switches them to it. "Incident Response & Reliability
> Distributions" (`reliability-distributions.studio.json`, 6th in gallery order) covers the last 4 types —
> boxplot (resolution time by team), violin (response time by severity), beeswarm (incident duration
> swarm), ridgeline (latency density by service). 4 new tests incl. a spread-regression check. Test suite
> 870/870. Gallery chart-type coverage: **51 of 51 — every type appears in at least one example.**
NEXT — turn the examples into a **broad, complete survey of everything the app can do**, built
**progressively simple → dazzling**:
- ✓ **Cover EVERY chart type at least once** — DONE (v172, see above), 51 of 51.
- ✓ **Show EVERY interaction/feature at least once** — DONE (v232, see below): filters + `#hash` deep-link,
  cross-filter, drill-through (panel + KPI), detail drawer, target lines, reference bands, callout arrows,
  period highlights, event markers, conditional formatting, color scales, KPI compare/sparkline — all in
  one guided-tour showcase (`feature-showcase.studio.json`), leading the gallery.
- **Progressive complexity**: keep a couple of simple “start here” boards, then ramp to the most complex,
  fully-annotated, cross-drilling, drawer-rich dashboards — really dazzle at the top of the list.
- Ordering: keep the gallery **most-spectacular-first** (index.json order); no single hero card.
- Each example: self-contained `.studio.json` on the existing catalog data, KPIs + panels, added to
  `data/examples/index.json`, and MUST pass the "all examples render every panel" test. Validate fast with
  `node tools/export.js <spec> /tmp/x /public`, then the suite. NOTE on sample data: KPI/gauge queries are
  value-only (first column kept numeric); chart queries put a categorical **label column first**; name
  numeric columns to hit the right synthetic kind (`*_pct/rate/coverage/score`→0–100, `count/runs/rows`→counts).
> ✓ **`tools/import-v2.py` loose end fixed (v162)**: the 17 retired `cde-*` v2 boards it converts from
> `reference/dashboards/*.cdfde` no longer regenerate into `data/examples/` (the curated gallery
> `index.json` reads from) — they now write to a separate, gitignored `data/legacy-v2-boards/` for
> inspection only. (It never actually wrote `index.json` itself — the original STATUS wording was
> slightly imprecise — but resurrecting 17 unwanted files into the curated directory on every regen was
> real repo-hygiene risk, now fixed.) **Follow-up discovered while fixing this, deliberately NOT done in
> the same slice**: running the script showed `data/cda-catalog.json`/`data/sample-data.json` (the
> committed, live-loaded Query Library data) are substantially stale vs. `reference/dashboards/*.cda` —
> e.g. several storage-cost queries still reference a retired `entity_storage_demo` table instead of the
> current `fact_entity_snapshot`/`dim_entity`/`dim_datasource` star schema, and at least one DA
> (`app_src_chord`) is missing entirely. A full regen is a ~2500-line diff across the whole catalog that
> needs its own careful review/test pass (not blindly regenerated here) — worth a dedicated future slice.
> ✓ **Gauge double-percent defensive fix shipped v161**: `studio-render.js`'s gauge case now skips the
> default Unit "%" when Value format is "pct" (`PDC.fmt.pct` already appends its own %), so a gauge left
> at fmt:"pct" + the implicit default unit no longer reads "42.3%%". 1 new regression test drives the real
> "Value format" inspector select (not a standalone PDC.gauge call) so the fix is exercised end-to-end.
> ✓ **"Show EVERY interaction/feature at least once" — DONE, shipped v232**: new `feature-showcase.studio.json`
> ("Interactive Feature Showcase", leads the gallery — most-spectacular-first) demonstrates every interaction
> the chart-type showcases never touched: two cascading **filters** with a working **`#` deep-link** (verified
> `#src=Oracle` pre-selects the Data Source filter), a **cross-filter** emitter on the donut panel, panel
> **drill-through** + the **detail drawer** on the bars panel, a **KPI drill-through** (click-through tile),
> **KPI compare** (delta vs. prior period) + **sparkline**, and all six overlay annotation kinds — target
> line, reference band, callout arrow, period highlight, event markers, and scatter point annotations — plus
> **conditional formatting** and a **color scale** (one panel combines both, showing condFmt wins ties).
> A richtext intro panel frames it as a guided tour. 11 new tests assert the actual DOM markup each feature
> produces (not just "it renders") — overlay CSS classes, filter `<select>` count, KPI delta/spark elements,
> `cursor:pointer` drill wiring, and the hash-deep-link pre-selection. Test suite 1077/1077. **Z13 track is
> now feature-complete**: every chart type (v172) and every interaction/annotation (this slice) each appear
> in at least one example, gallery stays most-spectacular-first, no single hero.

**Z0 — Finish the terminology migration (Phase 2, started 2026-06-30). ✓ DONE, shipped v163.** User-facing
CDA→"Data Access", CDF→"Dashboard Framework"; CDE export removed from the menu/inspector/bundle/push/CLI;
tour/docs/brand updated; the dead `exportCDE`/`CDE_OK`/`cdeEmittable`/`brandHeaderRows` code deleted from
exporters.js (parseCDE/CDE **import** kept); Examples gallery never carried a "CDE" badge post-v157
redesign, its dead CSS removed too; remaining stale CDF/CDE/CDA strings in `docs/index.html` reworded.
Internal identifiers, file extensions (`.cda`/`.html`), the `.cdfde` import path, and Pentaho server
connectivity are all intact.

### A. CDA authoring — the big track (user-requested; build across iterations, CDF stays primary)
> Slices 1–7 shipped in v31–v37. Continue with 8 below, one shippable slice/loop.
Goal: a sophisticated, assisted, user-friendly **CDA data-source builder** — define/manage the
queries behind dashboards across every CDA type, with rich preview, calculations, joins & filters.
Best practice: model a first-class `spec.cda` (connections[] + dataAccesses[] + compound) and make the
library pane + a new “Data source” inspector edit it; exporters already emit `.cda`, so authoring just
needs a real editor over the model. Sequence (one shippable slice per loop):
  1. ✓ **CDA model + library CRUD** — shipped v31.
  2. ✓ **Connections manager for CDA** — shipped v32.
  3. ✓ **Per-kind query editors** — shipped v33 (SQL/MDX/Kettle/Metadata/Scripting all have type-aware UI + correct CDA XML).
  4. ✓ **Assisted column + parameter tooling** — shipped v34 (calculated columns UI + CDA export; param type in inspector; COLUMN_TYPES constant).
  5. ✓ **Joins / compound data access** — shipped v35 (join/union builder; exportCDA + parseCDA round-trip; compound DA inspector).
  6. ✓ **Output options (filter/sort/limit)** — shipped v36 (filter rules with 8 operators; sort rules; row limit; CDA OutputOptions XML; genMock applies rules).
  7. ✓ **Sophisticated preview** — shipped v37 (param inputs, paging, column type badges, row count, Copy-as-TSV, optional live doQuery).
  8. ✓ **`.cda` round-trip parity** — shipped v38: all connection types, all DA kinds, calcColumns, outputOptions, connections[] propagation; 15 new tests.

### B. Mobile & touch friendliness — the second big track (user-requested; build across iterations)
Goal: the **builder** is usable and pleasant on phones/tablets, and **exported CDF/CDE dashboards**
render responsively. Observed today (iPhone screenshot): desktop 3-pane IDE is forced onto a phone —
topbar brand truncates/overlaps the action buttons, the collapsed Query Library + Inspector rails eat
horizontal space, no drag-by-touch, modals aren't full-screen. The lone `@media(max-width:1100px)` rule
is stale (it sets `grid-template-columns` but `#workspace` is now flexbox) — remove/replace it.
Sequence (one shippable slice per loop; add Playwright checks at a phone viewport e.g. 390×844):
  M1. ✓ **Responsive shell** — shipped v39: real breakpoints, ⋯ More menu, stale @media killed.
  M2. ✓ **Panes → drawers on phone** — shipped v40: Library/Inspector become slide-in drawers; bottom tab bar (Library · Canvas · Inspector); scrim closes on tap; resize resets state.
  M3. ✓ **Touch interactions** — shipped v43: setPointerCapture + pointercancel on drag handlers; touch-action:none on handles; ≥36/40px tap targets; da-acts always visible on mobile.
  M4. ✓ **Mobile modals & builder** — shipped v43: bottom-sheet modals (full-width, sticky header, round top corners); sticky dsb-foot; font-size:16px for all modal inputs; DS type cards 1-col.
  M5. ✓ **Responsive exported dashboards** — shipped v44: header flex-wrap + padding reduction; grid already 1-col at ≤720px; 6 new M5 tests.
  M6. ✓ **Polish & a11y on touch** — shipped v45: momentum scroll, :active states for touch, inspector fonts enlarged, overflow-x:hidden guard; 5 new checks.
  M7. ✓ **Topbar buttons accessible on phones** — shipped v88: Examples/Open/Save hidden at ≤400px; phone-only More menu items; ≥44px touch targets; phone-pos fixed overlay for Examples menu; 4 new M7 checks.
  M8. ✓ **Restore banner must not block UI on mobile** — shipped v88: --mob-tabs-h variable; full-width stacked banner above tab bar at ≤640px; 1 new M8 check.
  > **Mobile follow-ups — shipped v109.**
  M9.  ✓ **Horizontal overflow / white side bar** — shipped v109: `html{overflow-x:hidden}` seals the root scroll channel; 2 new checks (html overflowX + scrollWidth ≤ viewport).
  M10. ✓ **Top menus reachable on phones** — shipped v109: Examples/Open/Save hidden from topbar at ≤640 px, accessible via ⋯ More; cascade order fixed (.more-phone-only global before @media block).
  M11. ✓ **Restore banner Cancel** — shipped v109: dismiss button renamed "No thanks" + min-height:44px on phone; 1 new check.
  M12. ✓ **Footer changelog on mobile** — shipped v109: changelog popup constrained to min(96vw,380px); status bar font/gap/padding tightened; build stamp hidden on phone; 1 new check.
  > **RE-FIXED + locked v116 — the v109 fixes were marked done but did NOT actually work (user-confirmed
  > on a real phone). They hid/constrained instead of fixing the interaction, and one had a CSS
  > source-order bug. Verified now with real navigation tests, not presence checks.**
  M13. ✓ **Topbar genuinely reachable** — v116: `.top-actions` scrolls horizontally (swipe) instead of
       `overflow:hidden` clipping buttons off the right edge; dropdown menus float to a fixed full-width
       sheet (`.top-actions .menu{position:fixed}`) so the scroll container can't clip them.
  M14. ✓ **Changelog truly within viewport** — v116: `#changelogPop` is viewport-fixed (left/right 8px);
       the v109 `.changelog-pop` rule was silently overridden by the LATER base `.changelog-pop` rule
       (equal specificity, later wins) — fixed by using the `#id` selector.
  > **MOBILE GATE (P0):** the `MNAV:` tests in `tests/run.js` now assert real mobile *function* at 390px —
  > no horizontal overflow, topbar swipe-reachable (both ends), dropdowns + changelog in-view, and the
  > Library/Inspector drawers actually open ON-SCREEN. **Keep them green.** When a mobile bug is reported,
  > first add/extend an MNAV check that reproduces it, then fix — never mark a mobile item done on
  > presence/width alone; verify the interaction actually works at phone width.

### D. Icon system — replace emoji glyphs with an elegant inline-SVG set (user-requested)
Goal: swap the ad-hoc emoji/unicode indicators (✎ 🗑 ⧉ ✕ ＋ ⓘ ◴ ☾ ⚙ ↶ ↷ ↻ ▶ ‹ › ⛁ ◧ ❖ ⟨⟩ etc.)
for a small, cohesive, **fashionable line-icon set** that looks sharp and theme-aware.
Best practice: one `Studio.icon(name[,size])` helper returning inline `<svg>` with `stroke:currentColor`,
`fill:none`, 1.5px stroke, 24-box viewBox — so it inherits color and **dark mode works for free**; no
icon-font, no network. Define a single sprite/registry (edit, trash, duplicate, close, plus, info,
clock, moon/sun, gear, undo, redo, refresh, chevron, caret, grip, check, warn, and the source-type
marks db/cube/gear/metadata/script). Sequence (one slice per loop):
  I1. ✓ **Icon registry + helper** — shipped v37: `app/icons.js` with 26 paths + `Studio.icon()`; unit/DOM tests (11/11 checks).
  I2. ✓ **Adopt across chrome** — shipped v41: delBtn/moveBtn/section-add/daCard-edit-del/myDACard-dup-del/DS_TYPES-cards/undo-redo all use SVG; CSS flex-centering; 11 new tests; 231/231.
  I3. ✓ **Adopt in canvas + modals** — shipped v42: canvas sr-act (⧉/×), KPI del, modal close, toast, all secondary topbar buttons, inspector btn-wide, DA-preview/pagination/chips/params/addP/addCC/Join all SVG; flashBtn saves innerHTML; test hook added; 243/243 (12 new I3 checks).
  I4. ✓ **Polish icon consistency** — shipped v46: aria-label on qInfoBtn+themeBtn; theme button upgraded to SVG moon/sun in boot; 3 new tests.
Keep it tasteful and consistent (uniform stroke + corner radius); align with the M3/M4 touch sizes.

### C. Go-live + verify
12. **Go live**: enable Pages (Settings → Pages → main /root) → DNS CNAME `dashboardstudio` →
    `kevinrhaas.github.io`. (Publish + auto-deploy Action both done; `PAGES_DEPLOY_TOKEN` set.)
13. **Verify live** against a reachable Pentaho (CORS+HTTPS, or same-origin/proxy) — untestable here.
14. Polish: server-import `.html` section in the Import-from-Server modal (done: per-panel query peek);
    **Cloudflare Access** runbook for managed email/SSO codes.

### E. Next-wave polish (high-value quality-of-life improvements)
- ✓ **E1. Restore-banner improvements** — shipped v49: panel/KPI/filter count in banner; boot load no longer clears autosave.
- ✓ **E2. Export history** — shipped v49: last 5 exports in the Export menu, time-ago timestamps, one-click re-export.
- ✓ **E3. Dashboard thumbnail** — shipped v62: `Studio.makeThumbnail(spec, theme)` returns an SVG layout preview; inspector shows it at dashboard level; examples gallery cards each have a mini thumbnail. 6 new tests.
- ✓ **E4. Deep-link parameters** — shipped v50: URL hash `#filterId=value` pre-selects filters in exported CDF; inspector shows shareable hash + Copy button.
- ✓ **E5. Examples gallery card grid** — shipped v51: 2-column card gallery with track badge, chart-type chips, title, and P/K counts. Featured CDF section. `index.json` enriched with metadata.
- ✓ **E6. Changelog search** — shipped v50: live search input in changelog popup; match highlighting; empty state.
- ✓ **E7. Changelog date + time** — shipped v51: optional `time` field in changelog entries; rendered as `date · HH:MM UTC` in the popout.
- ✓ **E8. Sign out / clear session + clear cache** — shipped v53.

### F. Visual chart types & richness — make it world-class (user-requested; build across iterations)
Goal: a **rich, modern, elegant, interactive** chart vocabulary that follows the latest data-viz best
practices — make the whole experience sexier and more fun to use. Today's registry: bars/donut/line/
stacked/areaStacked/combo/treemap/scatter/gauge/heatmap/table/kpi (+ sparkline in KPIs); chord & sankey
primitives already live in the vendored toolkit. Add **more first-class chart types** beyond these,
each selectable in the chart-type gallery, rendered in CDF/preview, and (where a CCC equivalent exists)
round-tripped to CDE. Best practice: extend via `app/studio-charts.js` (keep vendored `pdc-ui.js` a
pristine v2 mirror); inline the extension in exporters/CLI; add a gallery thumbnail + a Playwright check
per type; respect theme + the responsive/touch breakpoints. Candidate types, one shippable slice/loop:
  F1. ✓ **Sankey** (flow) — shipped v55: source/target/value column mapping; ribbon width proportional to flow volume; hover tooltip shows value + % of total; srcCap/dstCap Inspector options.
  F2. ✓ **Chord / dependency wheel** — shipped v55: circular arc diagram; hover highlights connected arcs; same sourceCol/targetCol/valueCol binding.
  F3. ✓ **Radar / spider** — shipped v52: CDF-only type; rings + spokes + series polygons + vertex tooltips + legend + optional fill; theme-aware + animated; registry/render/gallery-thumb/test.
  F4. ✓ **Waterfall** — shipped v54: floating bars, dashed connectors, green/red/total colors, zero line, hover tooltips, animation.
  F5. ✓ **Funnel** — shipped v56: centred bars narrowing by value, conversion % annotations, hover tooltips, animation.
  F6. ✓ **Sunburst** — shipped v57: single-ring + two-ring (groupCol) modes; arc labels; hover tooltips; animation; gallery thumbnail; 3 new tests.
  F7. ✓ **Bullet + calendar heatmap** — shipped v58: KPI-vs-target track + day-grid density. Test suite 330/330.
  F8. ✓ **Interactivity polish — legend toggles** — shipped v59: clickable toggle legend for areaStacked / combo / radar; 4 new tests. Remaining F8 work: cross-highlight on hover, click-to-filter (CDF-side).
  F9. ✓ **Network / topology** — shipped v64: PDC.network as first-class chart type; radial node-link, blast-radius hover, same sourceCol/targetCol/valueCol binding as Sankey/Chord; gallery SVG thumbnail; 3 new tests. 15 chart types total.
  F10. ✓ **Lollipop chart** — shipped v73: horizontal dot-on-stem chart (Comparison group); animated entrance; hover tooltips; dot color + height + format options; CDF-only. 16 chart types total.
  + **I-track: Panel drill-through** — shipped v64: "Drill-through" inspector section on every panel; Target URL + URL parameter; clicking bar/donut slice calls PDC.drill → navigates to target URL with clicked label + filter state. Inspired by PDC.bindDrill pattern in iteration/v2 lab.
  + **I-track v2: Detail drawer** — shipped v65: "Detail drawer" section on every panel; Detail DA + filter parameter; clicking bar/donut/treemap/table opens PDC.detail slide-in drawer with record rows from the detail DA. Ported from PDC.openDetail/bindDetail pattern in iteration/v2 lab. 367/367.
  F11. ✓ **Slope chart** — shipped v74: before/after line per category; green/red rising/falling; T1/T2 labels; annotations at endpoints; animation; PDC.slope extension; CDF-only.
  F12. ✓ **Dot plot / Cleveland dot plot** — shipped v75: pure dots sorted by value; optional groupCol for two-group comparison (budget vs actual); row track lines; PDC.dotplot extension; CDF-only. 17 chart types total.
  F13. ✓ **Beeswarm / strip plot** — shipped v76: individual data points jittered along one axis (deterministic packing); optional categoryCol groups into labeled strips; PDC.beeswarm extension; CDF-only. 18 chart types total.
  F14. ✓ **Histogram** — shipped v82: auto-bins a numeric valueCol into N equal-width buckets; touching bars; hover tooltips; configurable bin count; PDC.histogram extension; CDF-only. 19 chart types total.
  F15. ✓ **Polar area / rose chart** — shipped v86: equal-angle wedges, radius ∝ √value (area encoding), per-category palette, guide rings, centre total, arc labels, animated entrance, hover tooltips; PDC.polarArea extension; CDF-only. 20 chart types total.
  F18. ✓ **Bump / ranking chart** — shipped v104: ranking over time (labelCol=period, series=entities); rank-1=highest; smooth bezier curves connect rank positions across periods; line crossings show competitive overtaking; rank dots; hover tooltips; animated entrance; PDC.bump extension; CDF-only. 23 chart types total.
  F19. ✓ **Marimekko / Mekko chart** — shipped v105: two-dimensional proportional stacked bars (width=category total share; height=composition segments); labelCol+groupCol+valueCol binding; % labels in cells; hover tooltips; animated entrance; PDC.marimekko extension; CDF-only. 24 chart types total.
  F20. ✓ **Dumbbell chart** — shipped v106: horizontal connected-dot chart (Comparison group, CDF-only); gray start dot + brand-color end dot + color-coded connector (green=improvement, red=decline); labelCol+startCol+endCol binding; animated entrance; adjacent value labels. 25 chart types total.
  F21. ✓ **Packed bubble chart** — shipped v107: force-directed bubble cluster (Composition group, CDF-only); circle area ∝ value; deterministic gravity+repulsion simulation; labels in bubbles; hover tooltips; animated entrance. 26 chart types total.
  F23. ✓ **Gantt / Timeline chart** — shipped v110: horizontal floating-bar chart (Comparison group, CDF-only); labelCol=task label, startCol=bar start value, endCol=bar end value; x-scale auto-derived; per-row colors; hover tooltips (label+start+end+duration); animated staggered entrance; PDC.gantt extension; 30 chart types total.
  F24. ✓ **Diverging bar chart** — shipped v111: positive/negative bars from shared zero baseline; Comparison group, CDF-only; labelCol+valueCol; Positive/Negative color pickers; animated entrance; 31 chart types total.
  F25. ✓ **Stream graph** — shipped v112: ThemeRiver centered-baseline stream ribbons; Trend group, CDF-only; same labelCol+series binding as areaStacked; cardinal-spline smoothing; toggle legend; 32 chart types total.
  F26. ✓ **Parallel coordinates chart** — shipped v114: multi-dimensional entity profiles across N vertical axes; Comparison group, CDF-only; labelCol + series column list binding; hover highlight; dot markers for ≤12 entities; animated entrance; 33 chart types total.
  F27. ✓ **Candlestick / OHLC chart** — shipped v115: Trend group, CDF-only; 4-column OHLC binding; green/red bullish/bearish bodies + wicks; y-axis grid; hover tooltips; animated entrance; 40 chart types total.
  F28. ✓ **Waffle chart** — shipped v119: Composition group, CDF-only; 10×10 grid (each cell = 1%); labelCol+valueCol binding; proportional allocation with largest-remainder rounding; palette-colored cells + legend; hover tooltips; staggered entrance animation; PDC.waffle extension; 41 chart types total.
  F29. ✓ **Timeline / milestone chart** — shipped v120: Trend group, CDF-only; horizontal baseline with alternating above/below diamond markers; labelCol (event name) + optional dateCol (period label on opposite side of baseline) + optional colorCol; hover tooltips; staggered animated entrance; PDC.timeline extension; 42 chart types total.
  F30. ✓ **Radial bar chart** — shipped v121: Comparison group, CDF-only; concentric arc tracks where arc length encodes value (up to 12 tracks, largest→outermost); animated entrance (ease-out-cubic, staggered rank delay); legend grid below circular area; maxVal/fmt/height inspector options; PDC.radialBar extension (pdc-ui.js pristine); gallery SVG thumbnail; 3 new F30 checks. Test suite 660/660. 43 chart types total.
  F31. ✓ **Population pyramid** — shipped v122: Comparison group, CDF-only; back-to-back mirrored horizontal bars (labelCol = category, leftCol = left measure, rightCol = right measure); bars grow from centre outward; value labels inside wide bars; hover tooltips; configurable side labels + colors (color tokens); PDC.pyramidBar extension (pdc-ui.js pristine); gallery SVG thumbnails; autoPickCols; docs updated to 44 types; 3 new F31 checks. Test suite 663/663. 44 chart types total.
  F32. ✓ **Icicle / partition chart** — shipped v123: Composition group, CDF-only; two-level rectangular partition (groupCol = parent strip at top 36%; child cells fill lower 64% within each parent column; encodes both parent share and within-parent composition); single-level mode (no groupCol = proportional strip); labelCol+valueCol+groupCol binding; hover tooltips; staggered animated entrance (L→R); PDC.icicle extension (pdc-ui.js pristine); gallery SVG thumbnails in CHART_SVG and model.js thumb; autoPickCols; 3 new F32 checks. Test suite 669/669. 45 chart types total.
  F33. ✓ **Pareto chart** — shipped v124: Comparison group, CDF-only; bars sorted descending (Pareto rule: largest category leftmost); secondary right y-axis 0–100% with orange cumulative % line; optional dashed 80% reference line (default on); 2-phase animated entrance (bars stagger, then line+dots fade); labelCol+valueCol binding; hover tooltips (label, value, cumulative%); PDC.pareto extension (pdc-ui.js pristine); gallery SVG thumbnails; 4 new F33 checks. Test suite 675/675. 46 chart types total.
  F34. ✓ **Grouped bar chart** — shipped v125: Comparison group, CDF-only; side-by-side multi-series bars per category for direct absolute comparison (vs Stacked bars for cumulative); bars auto-centered in each group, capped at 40 px; labelCol + multi-series binding (same as Stacked/AreaStacked); Rotate labels, Value format, Height options; clickable legend (shared _toggleLegend helper); animated entrance (staggered 25 ms per bar, ease-out-quad); hover tooltips; PDC.groupedBars extension (pdc-ui.js pristine); gallery SVG thumbnails in CHART_SVG and model.js thumb; 4 new F34 checks. Test suite 683/683. 47 chart types total.
  F35. ✓ **Ridgeline / joy plot** — shipped v126: Distribution group, CDF-only; horizontally stacked Gaussian KDE density curves per category with configurable overlap ratio (0–0.9); shared value x-axis; category labels coloured to match their ridge; fill + outline per ridge; hover tooltips (category, count, median); staggered animated entrance bottom-to-top; labelCol + valueCol binding; PDC.ridgeline extension (pdc-ui.js pristine); gallery SVG thumbnails in CHART_SVG and model.js thumb; autoPickCols; 3 new F35 checks. Test suite 689/689. 48 chart types total.
  F36. ✓ **100% Normalized Stacked Bar chart** — shipped v127: Composition group, CDF-only; every bar scaled to 100% and divided into proportional colour-coded segments for comparing compositional mix across categories; labelCol + multi-series binding (same as Stacked bars); fixed 0–100% y-axis with 25% gridlines; clickable legend (_toggleLegend); column-by-column staggered animated entrance (all segments per column animate together); hover tooltips (category, series, raw value, %); PDC.barNorm extension (pdc-ui.js pristine); gallery SVG thumbnails in CHART_SVG and model.js thumb; autoPickCols; docs updated to 49 types (added ct-barNorm + ct-ridgeline cards); 5 new F36/J checks. Test suite 694/694. 49 chart types total.
  F37. ✓ **Area range / confidence band chart** — shipped v128: Trend group, CDF-only; shaded band between upper (solid) and lower (dashed) bound lines; optional centre/actual/forecast line; band opacity configurable; autoPickCols heuristics for low/high column names; docs updated to 50 types (ct-areaRange in Trend group); 5 new F37 tests. Test suite 699/699. 50 chart types total.
  F38. ✓ **Quadrant chart** — shipped v129: Comparison group, CDF-only; x/y scatter plane with four labelled zones (configurable X/Y split % sliders); dots colour-coded by quadrant; zone tints; dashed dividers; italic corner labels; BCG/effort-impact/risk frameworks; PDC.quadrant extension; gallery thumbnails; autoPickCols; docs updated to 51 types; 5 new F38 checks. Test suite 704/704. 51 chart types total.

### G. Visual data-source builders — author queries visually (user-requested; extends track A)
Goal: a **visual builder for each CDA source type**, plus link/import of existing artifacts, so users
build the data behind dashboards without hand-writing XML/SQL. Slots onto the v31–v38 CDA model.
  G1. ✓ **Visual SQL query builder (slice 1/3)** — shipped v60: collapsible SQL Builder accordion in the SQL DA editor: FROM table, SELECT all/* or specific columns (chip-based), WHERE conditions (9 operators), ORDER BY ASC/DESC, LIMIT → "Generate SQL" writes aliased SELECT to textarea and triggers Detect Columns. 5 new G1 tests. Test suite 339/339.
  G1b. ✓ **Joins / multi-table SELECT** — shipped v61: JOIN section with type (LEFT/INNER/RIGHT/FULL OUTER) + table + ON condition; multiple JOINs stackable; clean SQL output. Test suite 346/346.
  G1c. ✓ **GROUP BY + aggregates** — shipped v61: AGG section (SUM/COUNT/AVG/MAX/MIN/COUNT DISTINCT + col + alias chips); GROUP BY column chips; both merge cleanly into generated SELECT. Test suite 346/346.
  G2. ✓ **Basic Kettle (.ktr) transform builder** — shipped v69: KTR Builder accordion (table input → select values → dummy output); step-flow diagram; Generate .ktr → well-formed PDI XML; Download .ktr. 5 new G2 tests.
  G3. ✓ **Link / import existing transforms** — shipped v70: "Import .ktr…" file button → parsed in-browser → step name chips → click to set output step. Studio.parseKtr in model.js. 5 new tests, suite 387/387. "Browse from server" (active-connection repo picker) remains as a possible G4 extension.
Keep each builder type-aware (mirror the per-kind editors from v33) and preview through the existing
offline sample-data path; CFD stays primary.

### H. Periodic UX / information-architecture refinement & best-practice cleanup (user-requested; RECURRING)
Goal: keep the whole app a **clean, logical, elegant, simple joy to use** — world-class, ahead of every
visual competitor, stunning and delightful, beginner-friendly with good helpers, fun and polished.
Forward-looking and genuinely innovative — press toward groundbreaking capability — but **evolve, don't
wildly rewrite**. This is an **ongoing** track: per the REFINEMENT CADENCE above, the loop should run a
refinement pass periodically (≈ every 5th run, or when the feature backlog is thin) instead of a feature.
A refinement pass = pick ONE small, shippable, well-tested slice from:
  - **IA / navigation** — review menus & grouping (topbar, ⋯ More, Export ▾, New ▾, Examples ▾,
    inspector sections); consolidate / rename / reorder for clarity; cut clicks; smart defaults;
    progressive disclosure (advanced options behind clear affordances so beginners aren't overwhelmed).
  - **Onboarding & guidance** — first-run clarity, empty states, inline hints/tooltips, helper text,
    the tour; goal: a newcomer is productive within minutes and delighted doing it.
  - **Visual polish** — spacing, typography, color, motion, density, consistency; modern best practices;
    tasteful (not noisy); full dark-mode parity; the "wow" on first open.
  - **Code health** — remove dead code/duplication, consistent naming, small behavior-preserving
    refactors, keep the model/render/studio/exporters boundaries cohesive.
Discipline: keep `tests/run.js` green (refactors must not regress — add/adjust checks), document the
rationale in the changelog, and prefer several small safe improvements over one risky overhaul. Each
pass should make the experience measurably simpler, cleaner, and more delightful than the last.
Recent H-track completions:
  - ✓ **Collapsible inspector sections** — v63. ✓ **DA usage badges** — v63. ✓ **Grouped chart gallery** — v66. ✓ **Focus mode** — v71. ✓ **Panel section headers** — v73 (new "Section header" field in panel inspector; .pdc-sec-hdr row dividers in preview + exported CDF). ✓ **Smart default panel titles** — v74. ✓ **Dashboard description bar** — v74. ✓ **Panel-level notes** — v75 ("Note (visible)" field; .pdc-panel-note italic annotation between header and chart body). ✓ **Per-panel accent color** — v76 ("Panel accent" color picker; .pdc-accent-panel colored left border; panelAccentCss in exporters).
Next H-track suggestions (pick the highest-value):
  - ✓ **Inspector search / filter** — shipped v77: `.insp-search` input at top of inspector; filters sections by visible text; query persists via `_inspSearch`.
  - ✓ **KPI sparkline types** — shipped v77: `sparkType` picker (Line/Bar/Area); `PDC.sparkSvgBar`/`PDC.sparkSvgArea` in studio-charts.js.
  - ✓ **Animated chart entrance controls** — shipped v78: "Animate entrance" toggle + "Duration (ms)" slider in every panel inspector; `canAnim()` / `animD()` helpers in studio-charts.js honour both prefers-reduced-motion and the per-panel flag; pdc-ui.js pristine.
  - ✓ **Panel tagging / grouping** — shipped v79: Tags field in panel inspector; tag filter bar in dashboard panel list; per-panel tag chips; Studio.allTags(spec).
  - ✓ **Chart annotation target lines** — shipped v80: horizontal dashed reference line overlay on any chart; label + position% + color in panel inspector; `.pdc-target-line` in preview + CDF export; `PDC._reg` for redraw persistence.
  - ✓ **Reference band** — shipped v81: shaded semi-transparent range band between two vertical % positions; label + top%/bottom% sliders + fill color; same defer+PDC._reg pattern as v80 target lines.
  - ✓ **Callout arrow** — shipped v84: text bubble + dashed leader line + arrowhead SVG overlay; x%/y% tip position; color picker; PDC._reg for redraw persistence; works any chart type.
  - ✓ **Conditional formatting** — shipped v83: threshold rules (>=/>/<=/</=/!=) color bars/donut/treemap/lollipop elements; top-to-bottom rule evaluation; green→amber→red default cycle; p.condFmt in spec.
  - ✓ **Color scales / gradient encoding** — shipped v85: smooth gradient from low→high color across bars/donut/treemap/lollipop; condFmt overrides gradient; `p.colorScale` in spec.
  - ✓ **Period highlight (line/area/bar charts)** — shipped v86: vertical x-range band with label + Left/Right edge % sliders + color; type-aware (shown only for line/areaStacked/combo/stacked/bars); `.pdc-period` CSS in exporters.
  - ✓ **Scatter point annotation** — shipped v87: "Point annotations" section in scatter chart inspector; `p.scatterAnnotations [{text,xPct,yPct,color}]`; colored dot + bordered label overlay; `.pdc-pt-annot` CSS in exporters.js.
  - ✓ **Line chart event markers** — shipped v87: "Event markers" section for line/area/combo/stacked/bars; `p.eventMarkers [{label,xPct,color}]`; vertical dashed tick lines; `.pdc-event-mark` CSS in exporters.js.
  - ✓ **Inspector section collapsed hints** — shipped v89: `.sec-hint` inline hint in h4 when section is collapsed; `summaryFn` 4th param to `section()`; shows label/count/url from current config; hidden via CSS when expanded.
  - ✓ **KPI comparison mode** — shipped v90: "Compare to" section in KPI inspector; compareCol picker + Display-as (% change / absolute delta / compare value) + Compare label; auto-computes delta from second column of same DA; collapsed hint shows compare column name; travels in spec (compareCol/compareMode/compareLabel). Test suite 497/497.
  - ✓ **Canvas empty-state overlay** — shipped v96: dashed-circle + headline + instruction + "Open library" CTA centred on canvas when 0 panels + 0 KPIs; preview dimmed; toggles via canvas-empty class.
  - ✓ **Duplicate dashboard** — shipped v107: '⧉ Duplicate current' in New ▾ menu; clones spec with new ID, "(copy)" title suffix, "-copy" name suffix; topbar flashes confirmation.
  - ✓ **Persist inspector collapse state** — shipped v110: `_collapsedSects` now loaded from/saved to `localStorage["studio-insp-collapsed"]` on each toggle; preferred section layout survives page reloads; key cleared by E8 Clear local data.
  - ✓ **KPI subtitle text** — shipped v114: 'Subtitle text' inspector field on each KPI tile; italic muted `.kpi-sub` subline rendered below the value; `kpiSubCss` in exporters.js; `k.subtitle` travels in spec through Open/Import/auto-save/undo-redo/CDF export.
  - ✓ **Series color palette presets** — shipped v123: 5 built-in palette groups (default/ocean/forest/sunset/dusk) with separate light+dark ramps; 'Series palette' swatch row in dashboard inspector; selected palette injects CSS variable overrides (--c1…--c10) into preview and exported CDF HTML; stored as `spec.paletteKey`; Studio.PALETTE_PRESETS in model.js; paletteCss generation in exporters.js; 3 new H-palette checks.
  - ✓ **'/' gallery search shortcut** — shipped v124: pressing '/' focuses .cg-search (chart-type gallery search) when a panel is selected and no text field is active; guards against input/textarea/select + modifier keys; listed in shortcuts modal (?); 2 new H-track checks.
  - ✓ **Slideshow mode** — shipped v125: '⋯ More → Slideshow ▶' cycles through all canvas panels one at a time in a full-screen overlay; each slide re-rendered via buildHtml + single-panel iframe (identical quality to CDF export); ◀/▶ nav buttons + keyboard arrows; Escape/× to exit; panel title + 1/N counter in header; test hooks: __slideshowOpen/__slideshowActive/__slideshowPanel; CSS: .ss-overlay/.ss-hdr/.ss-frame in studio.css; 4 new H-track checks. Test suite 683/683.
  - ✓ **⋯ More menu grouped into labeled sections** — shipped v274 (first dedicated Track H sweep since
    v125/v126 — this log had gone unfed even as IA-flavored work shipped under other track names in
    between). The menu had grown to 15 items across 4 visually-separated but unlabeled clumps; added
    "Connect" / "Present" / "Help & power tools" `.grp` section labels (same convention the Examples/Export
    menus already use). Purely additive — no button id/order/behavior changed. 2 new tests, suite
    1231/1231. **Next H-track candidate:** the Z1 follow-up "simplify the top menu bar" reorg (bigger,
    higher-risk given how much mobile CSS is tuned around today's topbar structure — needs its own
    dedicated, carefully-tested slice, not folded into a routine sweep).
  - ✓ **Home tip rotation surfaces the new cross-dashboard column search** — shipped v328 (second
    dedicated Track H sweep — last one was v274, ~50 versions ago). The Home tip card (Z2 follow-up)
    only ever shows real shipped features, and the just-shipped column-search idea (v327) is exactly
    the kind of "didn't know that existed" capability it's meant to surface — added it to the rotation.
    Purely additive (one new string in `HOME_TIPS`); 1 new test cycles every tip and confirms it's
    present. **Next H-track candidate unchanged:** the Z1 "simplify the top menu bar" reorg above.
  - ✓ **Topbar grouping dividers — first slice of the Z1 "simplify the top menu bar" reorg, shipped
    v336**: the 11-button desktop topbar row (Undo/Redo, New▾/Examples▾/Open/Save/Export▾, Tour/Servers/
    Sample/Theme) read as one undifferentiated strip with no visual cue for *why* buttons sat where they
    did. Added two subtle `.top-sep` dividers marking three logical clusters — **History** (Undo/Redo) |
    **File** (New/Examples/Open/Save/Export) | **Connect & present** (Tour/Servers/Sample/Theme) —
    matching the grouping the ⋯ More menu's `.grp` labels already use. Deliberately conservative per the
    risk this item was flagged with (see the v274 note above): plain `<span>` siblings, not wrapping
    group containers, so no button id/order/direct-child relationship to `.top-actions` changed — the
    MNAV mobile tests that walk `:scope > .btn` keep passing unmodified. The Connect & present divider
    hides at ≤900px alongside the `.btn-secondary` cluster it separates (both collapse into ⋯ More
    there); the History|File divider stays since both those groups remain visible down to phone width.
    4 new desktop tests + 2 new tablet-width tests. **Z1 follow-up still open:** the top bar's IA is
    only lightly grouped so far — a deeper pass (e.g. consolidating Open/Save/Export under one "File ▾"
    menu, or moving Tour/Servers/Sample/Theme into a labeled cluster button) remains a future slice if
    the grouping alone doesn't read as "simplified" enough.

### I. Learn from the reference/ lab — match & surpass those visuals (user-requested; RECURRING)
The `reference/dashboards/` tree is a library of advanced hand-built CDF/CDE dashboards (the original
iteration-v2 suite) — e.g. network node-click drill-to-detail (`PDC.openDetail`), info dots, rich CDF
layouts and interactions. Periodically (≈ when doing track-F/visual work) **study the newest examples
there and port / improve upon the best techniques** into the Studio, so the builder can generate
dashboards at least as good as the hand-built ones — then push past them. Keep everything compatible with
the existing exporters and keep them emitting light, self-contained HTML/JS (see Conventions above — no
new runtime deps). Each pass: pick one technique, generalize it into the Studio model/render/exporters,
add a Playwright check, document it kindly, and note it in the changelog.
> **READ-MOSTLY boundary:** `reference/**` (the dashboard lab) and `provisioning/**` (DDL/ETL/deploy)
> are **read for inspiration, not churned** — only touch them when an improvement specifically calls
> for it (e.g. regenerating the catalog from `reference/dashboards/`). The loop's normal output is the
> app itself at the repo root (`app/`, `index.html`, `data/`, `tests/`, docs).

### J. Documentation — user help in the Pentaho docs style (user-requested)
Goal: real product documentation for Dashboard Studio, written in the **style and structure of the
Pentaho docs** — task-oriented topics, clear headings, getting-started → concepts → how-to → reference.
Keep it **HTML/JS, light, self-contained** (no doc-site framework, no new deps) — a `docs/` area that
ships with the build, plus a Help panel in the app. Add contextual **help links** throughout the UI.
  - ✓ **J1: Help docs page + in-app link** — shipped v97: `docs/index.html` self-contained reference
    guide; sections: Getting started, The builder, Chart types (20-type grid), Data sources & CDA,
    Exporting (format comparison table), Keyboard shortcuts, Simple vs Advanced mode. Sticky nav with
    active-section highlighting. 'Help docs ⓘ' in ⋯ More menu. K8 card links to it.
  - ✓ **J2: Contextual help links** — shipped v98: `.sec-help` SVG info-icon badge on 13 section headers; `#inspHelpLink` pane-header badge updates per-selection; all open docs in a new tab; SVG preserves h4.textContent for existing tests. 4 new J2 checks.
  - ✓ **J4: Contextual `?` links from chart type cards** — shipped v99: `.ct-help` hover-reveal SVG link on each gallery card; opens `docs/index.html#ct-{type}`; docs chart-types section expanded to 29 types with group headers, CDF/CDE badges, and `id` anchors. 4 new J4 checks.
  Next J-track:
  - ✓ **J3: In-app contextual Quick help** — collapsed-by-default "Quick help" section at the top of each inspector type with 3 practical tips; shipped v100.
  - ✓ **J5: Chart type descriptions in the gallery** — `.lb-desc` subtitle on every gallery card from `Studio.CHARTS[t].desc`; shipped v100.
  - ✓ **J6: Interactive tutorial / walkthrough** — spotlight-based 6-step guided walkthrough (Welcome → Library → Canvas → Inspector → Export → Done!); shipped v101.

### K. Simple mode — an optional, friendlier baseline experience (user-requested)
Goal: a persisted **Simple ⇄ Advanced toggle** (topbar) that makes the app approachable for newcomers
without removing power. Simple mode = progressive disclosure: hide expert controls, surface the common
chart types, a streamlined inspector, more guidance/sensible defaults, lighter chrome — so it isn’t
daunting. Advanced mode keeps the full, feature-rich set. **Additive, never a code fork** — one codebase,
gated UI. Keep building awesome features regardless; Simple mode just curates what’s shown.
  - ✓ **K1: Toggle + hide advanced sections + chart gallery filter** — shipped v91.
  - ✓ **K2: Gentle first-run onboarding** — shipped v92: topbar simple-badge pill; .simple-welcome inspector note with "Switch to Advanced" link.
  - ✓ **K3: Streamlined library** — shipped v92: CSS hides #btnNewDS, .mine-add, .da-mine-acts, .da-acts in Simple mode; library is read-only browse + drag-to-canvas.
  - ✓ **K4: Smart defaults in Simple mode** — shipped v93: chartForDA() Simple-mode heuristics (single numeric → gauge; multi-numeric → line; date → line); Advanced mode unchanged.
  - ✓ **K5: Simple mode DA inspector** — shipped v93: Calculated columns + Output options use advSection(); hidden in Simple mode; essentials-only inspector for newcomers.
  - ✓ **K6: Guided panel setup in Simple mode** — shipped v94: missingRequiredCols() detects empty required mapping; three-state guided card: no DA → nudge to pick a query; DA with 0 columns → amber warning pointing to Detect Columns; columns available → Auto-pick button (autoPickCols() assigns by name-heuristic). __studioSelect / __studioRenderInspector test hooks. H-track: "Edit data source →" jump link in panel inspector Data section (Advanced mode only). Test suite 522/522.
  - ✓ **K7: Beginner-friendly "Getting started" checklist** — shipped v95: 3-step card in Simple mode dashboard inspector (0 panels + 0 KPIs); auto-checked step 1 (library ready); CTA step 2 (add panel + Open library action); end-goal step 3 (export). Disappears once panels/KPIs added; absent in Advanced mode.
  - ✓ **K8: Onboarding walkthrough integration** — shipped v97: "What's next?" card in Simple mode dashboard inspector when ≥1 panel; 3 actionable next-step tips (configure chart / add panels / export); docs link; dismissible. Links to J-track help docs. Pairs with track H (IA) + track J (help).
- v98: **J2: contextual help links** — `#inspHelpLink` badge in inspector pane header (updates per-selection to builder/chart-types/data-sources anchor); `.sec-help` SVG info-icon badges on 13 section headers across all inspector types; SVG icon keeps h4.textContent clean; both open docs in a new tab. Test suite 543/543.
- v99: **J4: per-chart-type docs links + expanded chart reference** — every chart type card in the gallery now has a `.ct-help` SVG info-icon that appears on hover and links to `docs/index.html#ct-{type}`; `stopsPropagation` so it doesn't change the type. `docs/index.html` chart types section expanded from 20 → 29 types (added Radar, Chord, Network, Bullet, Calendar heatmap, Box plot, Dot plot, Beeswarm, Histogram), now organised under h3 group headers matching the builder gallery, with CDF/CDE badges per card and `id="ct-{key}"` anchors on all 29 entries. Test suite 547/547.
- v101: **J6: interactive tutorial** — `app/tutorial.js`: spotlight-based 6-step guided walkthrough (Welcome → Library → Canvas → Inspector → Export → Done); 4-panel dim overlay + purple highlight ring + smart-positioned tooltip card; keyboard Escape/→/←; `StudioTutorial.open()` wired to ⋯ More → "Interactive tutorial ▶"; test hooks `__studioTutorialActive`/`__studioTutorialStep`; `StudioTutorial.isDone()` (localStorage). 6 new J6 tests. Test suite 559/559.
- v105: **F19: Marimekko / Mekko chart** — new 24th chart type (Comparison group, CDF-only). Two-dimensional proportional stacked bars: column WIDTH ∝ category's share of the grand total; HEIGHT segments ∝ within-category composition; each cell area ∝ its fraction of the grand total. labelCol = category (x-axis + width driver), groupCol = segment (stacks; required), valueCol = numeric cell. % labels inside large-enough cells; hover tooltip (segment · category · value · share of column · share of total); compact top legend; animated entrance. Auto-pick maps strCols[0]→labelCol, strCols[1]→groupCol, numCol→valueCol. PDC.marimekko extension in studio-charts.js (pdc-ui.js pristine); gallery SVG thumbnail; model registry. 4 new F19 Playwright checks. Test suite 581/581.
- v108: **F22: Word cloud chart (27th chart type)** — Composition group, CDF-only; text items sized by numeric value (log scale 11–52 px); Archimedean spiral placement with bounding-box overlap detection; PDC.wordCloud extension (pdc-ui.js pristine); animated entrance; hover tooltips; inspector options: value format / height / max words; gallery SVG thumbnail. **H-track: Auto-save state indicator** — `#saveState` span in topbar flashes "Saved ✓" for 2 s after each localStorage auto-save (opacity fade; green accent; at rest invisible; ARIA live region). 6 new checks. Test suite 599/599.
- v107: **F21: Packed bubble chart (26th chart type)** — CDF-only force-directed bubble cluster; circle area ∝ value; deterministic 60-iteration gravity+repulsion simulation packs bubbles compactly without overlap; labels centred in bubbles, value in large ones; hover tooltips; animated entrance; capped at 60 items; PDC.packedBubble extension (pdc-ui.js pristine); Composition group. **H-track: Duplicate dashboard** — '⧉ Duplicate current' in New ▾ menu clones current spec with a new ID, " (copy)" title, "-copy" name stem; topbar New button flashes confirmation. 6 new checks. Test suite 593/593.
- v106: **F20: Dumbbell chart (25th chart type)** — horizontal connected-dot chart; two dots (gray start + brand-color end) per row connected by a color-coded line (green=improvement, red=decline); labelCol+startCol+endCol binding; animated entrance; value labels adjacent to dots; inspector Start/End labels; PDC.dumbbell extension (pdc-ui.js pristine); gallery SVG thumbnail. **H-track: Print/PDF button** in exported CDF header (printer SVG, `window.print()`); @media print CSS (static header, hidden controls, clean card layout, break-inside:avoid); export-only (not in preview iframe). 6 new checks. Test suite 587/587.
- v104: **F18: Bump / ranking chart** — new 23rd chart type (Trend group, CDF-only). Same labelCol + multi-series binding as Line/Step. At each period, all series are ranked by value (rank 1 = highest; dense ranking); smooth cubic-bezier curves connect each entity's rank position; line crossings show competitive overtaking; rank number inside each dot; hover tooltip (name / period / rank / value); series labels at right edge; animated entrance. PDC.bump extension in studio-charts.js (pdc-ui.js pristine); gallery SVG thumbnail; model registry. 4 new F18 Playwright checks. Test suite 577/577.
- v103: **F17: Violin plot + H-track: dashboard accent color** — Violin plot (22nd chart type, Distribution group, CDF-only): Gaussian KDE per category produces a symmetric filled silhouette (wider = denser); Silverman bandwidth selection; optional IQR box + median line; hover tooltip (n, median, Q1/Q3, min/max); PDC.violin extension in studio-charts.js (pdc-ui.js pristine); gallery SVG thumbnail; model registry. Dashboard accent color (H-track): 'Accent color' field in dashboard inspector with 6 preset swatches + custom hex picker; stored as spec.themeColor; propagated to preview + exported CDF as :root{--pentaho:...} CSS override; empty = default Pentaho blue. Test suite 571/571.
- v102: **F16: Step chart + H-track: gallery group filter tabs** — F16: Step/staircase chart (21st type, Trend group, CDF-only): right-angle horizontal-then-vertical step transitions between discrete values; area fill option; animated stroke-dashoffset entrance; hover tooltips; PDC.step extension in studio-charts.js (pdc-ui.js pristine); gallery thumbnail; model registry + newPanel auto-mapping. H-track: chart gallery group filter pills (`.cg-filter`/`.cg-tab`): narrow the 21-type gallery to one category — clicking a pill shows only that group's cards; active pill in brand blue; cards tagged with `dataset.grp`; "All" pill resets. Test suite 565/565.
- v100: **J5: chart type descriptions in the gallery + J3: Quick help contextual tips** — J5: every chart gallery card now has a `.lb-desc` one-line subtitle (e.g. "Compare values across categories") from a new `desc` field in all 28 `Studio.CHARTS` entries; 8px faint text, 2-line clamp. J3: every inspector type (Dashboard, Panel, KPI, Filter, DA) gets a collapsed-by-default "Quick help" section with 3 contextual tips; `quickHelp(body, type)` helper in studio.js; `.qh-tips`/`.qh-tip` CSS. H-track collapse tests updated to pick an already-expanded section. Test suite 553/553.

### L. Architecture & code-review sweeps (RECURRING — sweep type 2; see SWEEP CADENCE)
Every ~5th run's architecture slot: review the codebase like a demanding senior engineer and fix **one**
concrete health issue behind green tests (no behavior change). Rotate the lens each time so the whole app
gets covered over time:
- **Module boundaries** — model/render/studio/exporters/shell should stay cohesive; catch cross-layer leaks
  and functions that have drifted into the wrong file. `studio.js` is the largest surface — watch for
  extract-worthy chunks (inspector, gallery, menus) as it grows.
- **Dead code & duplication** — unused helpers, copy-pasted logic (e.g. repeated SVG-embed / color-token /
  format code across chart extensions), stale CSS. The Z0 CDE-exporter removal lives here too.
- **Global-state creep** — the `Studio.*` namespace and `PDC._reg` redraw registry: keep them intentional,
  documented, and leak-free (listeners cleaned up, no orphaned iframes).
- **Performance budget** — track total JS/CSS size and preview render cost; lazy-load heavy/rare paths
  (this is the natural home for lazy-loading the Z14 wasm engines); avoid O(n²) in chart layout code.
- **Accessibility** — periodic keyboard-only + screen-reader pass; color-contrast in every theme×mode;
  focus management in modals/drawers/slideshow.
- **Chart-extension API** — 51 types now register through ad-hoc patterns; consider formalizing a tiny
  `Studio.defineChart({type, render, opts, thumb, autoPick})` contract so new types are uniform and testable.
- **Test health** — coverage per feature, flaky/slow checks, and a fast smoke subset for quick loops.
> **Findings log (append newest on top; keep short):**
> - **Fixed shipped v374 (dead-code lens, first use of this specific lens on a fresh audit):**
>   `setDeployPathPref` (`app/studio.js`) was the write-half of a get/set pair for the "deploy
>   path" Settings preference — but the Settings import feature (`applySettingsData`) writes
>   `localStorage["studio-deploy-path"]` directly via its generic `SETTINGS_DATA_KEYS` bulk-import
>   loop, and no Settings-UI field was ever wired to call the setter itself. Built a full inventory
>   of every top-level function across `app/*.js` + `app/sources/*.js` (749 functions) and grepped
>   the whole repo (excluding `vendor/` and `reference/`, which are pristine/historical) for each
>   name; `setDeployPathPref` was the only one with zero references anywhere outside its own
>   definition. The getter (`deployPathPref()`, still called at boot to seed `S.settings.deployPath`)
>   and the `"studio-deploy-path"` key itself are both still live — only the orphaned setter is
>   gone. Pure deletion, no behavior change, suite unchanged.
> - **Fixed shipped v339 (test-health lens, round 2 on the same test):** the panel dup/delete test
>   (already hardened once — see the v274-era "Track H sweep" note inline in `tests/run.js` — visible-
>   wait + `force:true`) still hit a live "Element is not visible" FATAL on a fresh run of unrelated
>   (Neon-theme) work, confirming the fix wasn't complete: `force:true` skips Playwright's actionability
>   *retry loop* entirely, so if the button's bounding box happens to sample as invisible for one frame
>   (the row can be mid-reflow right after the preceding `__studioLoad` fetch), a single bad sample
>   throws instead of getting a second try. Wrapped both the duplicate and delete clicks in a small
>   `retryForceClick()` helper (wait-visible → force-click, up to 3 attempts with a 250ms backoff) —
>   test-infra only, no app code touched, same exact-count assertions as before. Verified across 3
>   consecutive full suite runs post-fix (all green); did NOT manage to reproduce the original flake
>   to prove the fix directly catches it (it's a rare, load-dependent race), so this is a best-effort
>   hardening, not a proven root-cause fix — flag for a future Track L pass if it recurs a third time.
>   Suite 1476/1476 (no new tests — this is test-infra reliability, not new coverage).
> - **Fixed shipped v333 (accessibility lens, third instance of the same bug shape):** grepped every
>   `[a-z.#-]+:focus\{[^}]*\}` block in `app/studio.css` (vendor CSS has none) looking for the
>   "outline re-declared inside its own `:focus` rule" pattern already fixed twice before (v286
>   `.repo-search`, v299 `.dsb-sqb-inp`) — found a third live instance: `.opt-hint` (the Z8 setting-
>   hint glyph, `tabIndex=0` so it's a real keyboard stop) set `outline:none` inside its own `:focus`
>   rule, at the same (0,2,0) specificity as the shared `[tabindex]:focus-visible` ring but declared
>   LATER in source order, so it always won — for every input method, not just mouse. Fixed by
>   dropping the redundant `outline:none`. **Test-writing note for next time:** a live focus-
>   simulation check (`el.focus()` + read `getComputedStyle`) is NOT reliable for a plain `<span>`
>   here the way it is for `<input>`/`<textarea>` (the v286/v299 fixes) — Chromium's `:focus-visible`
>   heuristic gives text fields a permanent carve-out (always focus-visible on script `.focus()`),
>   but a non-form `[tabindex]` element's `:focus-visible` goes cold for the rest of the page the
>   moment ANY mouse click has occurred, which thousands of earlier clicks in this same suite
>   guarantee — confirmed by hand in an isolated fresh page (focus-visible fires correctly with zero
>   prior mouse activity) vs. inside the real suite (always false after prior tests' clicks). Guarded
>   with a static CSS-source assertion instead (the `.opt-hint:focus` rule text must not contain
>   `outline:none`) rather than a flaky live simulation. 1 new test, suite 1446/1446.
> - **Fixed shipped v322 (orphaned-state lens, round 2):** widened the v313 audit beyond `studio.js`
>   itself — grepped every `localStorage.setItem`/`getItem` call across ALL of `app/*.js` and diffed
>   the key set against `CLEAR_DATA_KEYS`. Found `app/welcome.js`'s `studio-welcome-seen` and
>   `app/tutorial.js`'s `studio-tutorial-done`, two first-run onboarding flags that live in their own
>   small modules (so eyeballing `studio.js` alone would never surface them) — neither was ever wiped
>   by "Clear local data," so a reset left a device permanently stuck "already onboarded," silently
>   skipping the welcome screen and interactive tutorial. Added both keys; 2 new tests assert the real
>   `CLEAR_DATA_KEYS`/`window.__studioClearDataKeys` list (not a second hardcoded copy) includes them.
>   Suite 1399/1399. **Lesson for the next orphaned-state sweep:** search ALL of `app/*.js`, not just
>   the file that owns the majority of Settings state.
> - **Fixed shipped v313 (orphaned-state lens):** `studio-k8-dismissed` (the Simple-mode "What's
>   next?" onboarding card's dismissal flag, `app/studio.js`) was written via `localStorage.setItem`
>   on dismiss but never included in the "Clear local data" key list — the exact recurring
>   "new key, forgot Clear local data" gap the v194/v235/v281 notes below already describe, just
>   for a one-shot dismissal flag rather than a Settings default this time. A user who dismissed the
>   card, then later used Clear local data expecting a full reset, would never see it reappear.
>   Fixed by adding the key, and hoisted the whole key list out of the click handler (it was rebuilt
>   inline on every click) into a module-level `CLEAR_DATA_KEYS` constant exposed as
>   `window.__studioClearDataKeys`, so the existing E8 test now asserts against the REAL list
>   directly instead of a second hardcoded copy in the test file that could silently drift out of
>   sync with it (as this bug itself proves it already had). Suite 1357/1357.
> - **Fixed shipped v304 (duplication lens):** `Studio.computeInsights` and `Studio.notablePoint`
>   (`app/model.js`) independently rebuilt the same filtered `{label,value}` points array from
>   `cols`/`rows`/`labelCol`/`valueCol` and re-derived byte-identical mean/population-std-dev math,
>   plus the same outlier-detection (z-score > 2) and biggest-point-to-point-move loops — `notablePoint`'s
>   own doc comment even calls out that it picks "the single most notable point `computeInsights`
>   already narrates," acknowledging the conceptual pairing without sharing the code, so a future tweak
>   to the z-score threshold or tie-break rule in one wouldn't propagate to the other and the callout
>   marker could silently stop matching the outlier/move the insight prose calls out for the same chart.
>   Extracted shared `numericSeries()` (points + mean + sd), `findOutlier()`, and `findBiggestMove()`
>   helpers; both callers now compute from the one source. Pure refactor, no behavior change — suite
>   unchanged at 1335/1335 (existing outlier/biggest-move/notablePoint coverage already exercises both
>   paths).
> - **Fixed shipped v299 (accessibility lens):** found a second instance of the exact "outline
>   re-declared inside `:focus`" bug shape the v286 finding below fixed on `.repo-search` —
>   `.dsb-sqb-inp` (every FROM/JOIN/SELECT/AGG/WHERE field in the visual SQL/Kettle query builder,
>   ~20 call sites) set `outline:0` inside its own `:focus` rule, whose specificity (class +
>   pseudo-class) beats the shared global `input:focus-visible` ring (tag + pseudo-class)
>   regardless of source order — every field in that builder showed a border-color change but
>   zero keyboard focus ring. Fixed by moving `outline:none` onto the field's unconditional base
>   rule instead (the pattern every other search/input field in `studio.css` already follows).
>   Worth a grep sweep for any other `[a-z-]+:focus\{[^}]*outline` occurrences the next time this
>   lens comes up, since this is now the second independent instance found. 1 new test, suite
>   1325/1325.
> - **Fixed shipped v298 (global-state-creep lens, found while shipping a feature, not a dedicated
>   sweep):** `wireXFilter()` (`app/studio-render.js`) called `body.addEventListener("click", …)`
>   on every invocation with no de-dup guard — and it's re-invoked on every `PDC.redrawAll()`
>   replay (debounced resize, theme change), so the SAME still-live panel body accumulated a new
>   listener on every redraw. A single click then fired the crossFilter toggle N times in one go;
>   for an even N that instantly cancelled the filter right back off. Affected every
>   cross-filter-capable chart type (bars/donut/treemap/lollipop/funnel/waterfall too, not just the
>   three added that slice) — never caught before because no prior test simulated an actual click,
>   only DOM-tagging assertions. Fixed with a one-time-attach guard (`body.__xfWired`).
> - **Fixed shipped v292 (dead-code lens, follow-up to the v276 pass):** `Studio.DuckDB_ensureEngine`/
>   `Studio.SQLiteHttp_ensureEngine` (each commented "exposed so tests can stub/observe it") and
>   `Studio.xmlEscape` had zero call sites anywhere in `app/*.js`/`docs/index.html`/`tests/run.js` — the
>   comments' own justification was never actually true. Same repo-wide `Studio.*`-definitions-vs-usage
>   diff technique as v276 (re-run periodically, not a one-off script) turned up exactly 3 candidates this
>   time, all genuine. Pure deletion of the dead export line in each of the three files; the underlying
>   local functions (`ensureEngine`/`xml`) are still very much alive and used internally. No behavior
>   change, suite unchanged at 1293/1293.
> - **Fixed shipped v286 (accessibility lens):** while auditing the exported-dashboard chrome's focus
>   rings (v283), spot-checked the app chrome (`studio.css`) for the same bug shape and found one:
>   `.repo-search:focus{outline:none;border-color:#d4773b}` — the Repository section's search field —
>   re-declared `outline:none` *inside its own `:focus` rule* (specificity `.class:focus` = (0,2,0)),
>   which beats the shared global `input:focus-visible{outline:2px solid var(--pentaho)}` ring
>   ((0,1,1)) regardless of source order. Every sibling search field (`.search`/`.insp-search`/
>   `.cg-search`/`.cl-search`) only sets `outline:none` on its unconditional base state, which the
>   focus-visible ring's higher tag+pseudo specificity correctly overrides — `.repo-search` was the one
>   outlier that actively suppressed it. Removed the redundant `outline:none`; the border-color change
>   still applies as a bonus on top of the ring. 1 new test, suite 1276/1276.
> - **Fixed shipped v276 (dead-code lens):** `Studio.fmtFn`, `Studio.PALETTE`, and `Studio.cdeFallback` in
>   `app/model.js` had zero call sites anywhere in `app/*.js`/`docs/index.html`/`tests/run.js` — a script
>   diffing every `Studio.*` top-level definition against a full-text search across the repo found 7
>   candidates; 3 turned out to be internal-only (used elsewhere in model.js, not dead), and a 4th
>   (`Studio.cdeUnsupported`) looked dead by the same test until a repo-wide grep (this time including
>   `tests/run.js`, which the first pass had skipped) showed the F-track chart-type tests assert against
>   it directly — restored it before the first test run confirmed the miss. The remaining three were
>   genuinely orphaned (the latter two leftover from the Z0 CDE-exporter removal this track's own
>   description calls out). Pure deletion, no behavior change, suite unchanged at 1235/1235. **Note for
>   next dead-code pass:** every `Studio.CHARTS[type].cde` metadata object (51 entries) is itself only
>   ever read by `cdeUnsupported`'s `!c.cde` truthiness check and the tests — a much bigger, riskier
>   removal than fit in one sweep slice; flagged, not touched.
> - **Fixed shipped v257 (accessibility lens):** ten icon-only "×" remove buttons had no `title` and no
>   `aria-label` at all — genuinely nameless to a screen reader, unlike sibling remove buttons elsewhere
>   (e.g. the panel-series "Remove series" button) that already set one. Found across the data-source
>   builder: parameter rows, calculated-column rows, the visual SQL builder's join/column/aggregate/
>   condition/group-by chips (both the SQL and Kettle variants), and the Table/KPI inspector's column
>   remove button. Each now gets a specific `title` + `aria-label` (e.g. "Remove parameter", "Remove
>   join", "Remove condition", "Remove column"). 2 new tests (covering the two most-reachable sites;
>   the rest share the identical fix pattern), suite 1169/1169.
> - **Fixed shipped v256 (duplication lens):** the "wire a mousemove → `PDC.showTip(e, html)` handler plus a
>   mouseout → `PDC.hideTip` handler" pair was hand-written verbatim (`node.addEventListener("mousemove",
>   function (e) { PDC.showTip(e, html); }); node.addEventListener("mouseout", PDC.hideTip);`) at **36 call
>   sites** across `app/studio-charts.js`'s chart-extension renderers (sunburst, bullet, calendar heatmap,
>   radar, boxplot, line/area, waterfall, funnel, chord, network, sankey, and more). Verified every site's
>   `mouseout` line immediately follows its `mousemove` line and targets the same element before touching
>   anything (a script matched + validated all 36 pairs first). Added one shared `_tip(node, html)` helper
>   next to `mkSVG`/`reg` and collapsed all 36 sites to one-line calls. Pure refactor — confirmed
>   byte-identical behavior with a live hover screenshot on the sankey chart (tooltip renders correctly) —
>   suite unchanged at 1167/1167.
> - **Fixed shipped v250 (duplication lens):** `app/studio-charts.js`'s module scope already aliases
>   `var S = PDC.S` (line 10) — the shared SVG-element-with-attrs(+optional text/kids) constructor every
>   chart renderer is meant to use. Three chart functions (`_marimekko`, `PDC.gantt`, `PDC.divergingBar`)
>   each locally redeclared their OWN byte-for-byte-equivalent `function S(tag, attrs[, text])`, shadowing
>   the outer alias for no reason — pure copy-paste boilerplate, confirmed every call site only ever passed
>   a plain-string 3rd arg (or omitted it), which `PDC.S`'s `kids` param already handles identically to
>   `textContent =`. Deleted all three local reimplementations; behavior is byte-identical (pure extraction,
>   no branching logic touched), so no new tests needed — verified 1152/1152 unchanged. **Follow-up
>   fixed the same run (v251):** the near-identical `function mk(tag, attrs)` noted below (same shape as
>   `S` minus the text/kids param) was separately re-declared, locally, in three OTHER chart functions
>   (`PDC.radialBar`, `PDC.pyramidBar`, `_icicle`). Confirmed every one of the ~34 call sites only ever
>   passed the 2 args `mk` supported (tag, attrs — none relied on the missing 3rd text/kids param `S`
>   also has), mechanically renamed `mk(` → `S(` at each site, then deleted the 3 now-dead local `mk`
>   definitions (and one now-orphaned `svgNS` var in `_icicle` that only that local `mk` had used). Pure
>   extraction, no behavior change — verified 1152/1152 unchanged again. Every chart renderer in
>   `studio-charts.js` now shares the one `S = PDC.S` SVG-element helper with no local shadow copies left.
> - **Fixed shipped v244 (test-health lens):** `.github/workflows/deploy.yml` deployed to GitHub Pages on
>   every push to `main` with **zero automated verification** — the pre-migration repo had a `test` job
>   gating `publish` (STATUS.md's own v30 entry: "a failing build ... can never deploy to the live site"),
>   but that gate never carried over when this became a standalone repo (v60): `deploy.yml` was rewritten
>   from scratch as concurrency-controlled Pages deploy with a single unconditional `deploy` job. A broken
>   push — including one from this very autonomous loop — could have gone live with nothing to catch it.
>   Restored a `test` job (installs Playwright globally + Chromium on the runner, runs `tests/run.js` via
>   the exact documented local command) that `deploy` now `needs`. No app code changed; verified the YAML
>   parses correctly, but the job itself only proves out for real on the next live push (can't run GitHub
>   Actions from this sandbox). Suite unaffected, still 1144/1144.
> - **Fixed shipped v241 (duplication lens):** `app/studio-charts.js`'s `_violin` and `_ridgeline` each
>   declared their own local `silverman(vals)` + `kde(vals, bw)` — byte-identical Gaussian-KDE math
>   (ridgeline's own comment even said "same Silverman-bandwidth Gaussian KDE as the violin chart"),
>   differing only in sample-point count (40 vs 48) and one cosmetic key name (`x` vs `xv`). Extracted
>   shared `silvermanBw()`/`kdeDensity()` module-level helpers (alongside `mkSVG`/`niceMax`); both chart
>   functions now call them, parameterized by point count. Zero behavior change (verified: 1137/1137
>   unchanged, no new tests needed for a pure extraction with no branching logic).
> - **Fixed shipped v233 (dead-code/duplication lens):** `app/studio.js` declared `function esc(s) {...}`
>   **twice** in the same top-level scope — once at line 327 (right next to `hlq()`, its obvious caller,
>   under the "status-bar footer + changelog" comment) and again, byte-identical in behavior, at line 5671
>   (in the inspector-helpers cluster next to `el()`/`labelEl()`). Function declarations hoist, so the
>   *lexically later* one wins for the ENTIRE file scope — every one of the 50+ `esc(...)` call sites
>   actually ran the line-5671 copy, silently shadowing the line-327 one from the first line of the file.
>   Both bodies happened to be equivalent so there was no live bug today, but it was a landmine: a future
>   edit to the line-327 copy (the one a reader would naturally find first, beside its caller) would have
>   had zero effect anywhere in the app. Deleted the redundant line-5671 declaration, kept the original.
>   No behavior change, no new tests needed (the fix removes dead code that was never actually executing).
>   Test suite unchanged at 1077/1077.
> - **Fixed shipped v216 (was an open finding from the v214 KPI-agg fix earlier the same run):**
>   `vendor/pdc-ui.js`'s default `PDC.cda()` (the live/non-mock query path) built its request URL with
>   `new URL(CDA_URL, location.origin)`. Inside the **builder's own live-preview iframe** (`#preview`,
>   populated via `srcdoc`), `location.origin` is the literal string `"null"` — `srcdoc` documents have an
>   opaque origin by spec, even though `location.href` correctly reads `"about:srcdoc"`. `new URL(x,
>   "null")` threw `TypeError: Failed to construct 'URL': Invalid base URL` whenever a DA was missing from
>   `window.PDC_MOCK` (so `PDC.cda` fell through to its real-fetch branch) while previewing — real exported
>   dashboards were unaffected (served from a real http(s) origin, never `srcdoc`). Fixed by swapping the
>   base for `document.baseURI`, which inherits the *parent* page's real URL inside a `srcdoc` iframe
>   (confirmed via a throwaway probe) and is identical to the old behavior everywhere else — one-line fix
>   in `PDC.cda`, the one narrow exception where touching vendor/pdc-ui.js (normally pristine) was
>   warranted since the bug lived in the vendored file itself. New regression test calls `PDC.cda()` in the
>   live `#preview` iframe against a DA id deliberately absent from mock data and asserts it doesn't throw
>   synchronously (verified it actually catches the regression by reverting the fix locally and re-running
>   — red as expected, green again after restoring it). Test suite 994/994.
> - **v205 (accessibility lens):** the shared `modal()` helper's × close button — the dialog-close pattern
>   every builder modal is built on (New data source, Connections manager, Join builder, Keyboard
>   shortcuts, KTR builder, …) — appended only an SVG icon with no `aria-label`, so a screen reader
>   announced it as a bare "button" with no indication of what it does. Every *other* close affordance in
>   the app (changelog popup, panel zoom, slideshow) already set a descriptive `aria-label` (found by
>   grepping for the pattern and noticing `modal()` was the one holdout) — fixed by labeling it
>   "Close {dialog title}" (plus an explicit `type="button"`, matching the rest of the codebase's
>   defensive convention). One fix in one function covers every dialog in the app. 2 new regression tests
>   (two independent `modal()` call sites, to prove the fix is generic and not a one-off patch). Test
>   suite 964/964.
> - **v195 (dead-code/duplication + a real bug, closes the sweep-cadence gap since v180):** two findings.
>   (1) `withTimeout()` was a byte-identical private helper duplicated in `app/duckdb.js` and
>   `app/sqlitehttp.js` — the exact same pair `Studio.friendlyConnectorError()` was already extracted
>   from in v170, just missed that round. Consolidated into `Studio.withTimeout()` in model.js.
>   (2) a genuine DOM-duplication bug: the CDA Connection editor's Save handler called
>   `renderDashboardInspector(body)` directly (never clears `body`) instead of the top-level
>   `renderInspector()` — the same append-duplicate-section bug class the v193 Z6 kickoff fixed at three
>   *other* self-redraw call sites, but this fourth one (Save in `openConnEditor`) was missed that round.
>   Fixed + dropped the now-dead `dashBody` param it was threading through. 1 new regression test. Test
>   suite 944/944. **Pattern worth remembering**: any inspector self-redraw call site should route through
>   `renderInspector()`, never call a `render*Inspector(body)` helper directly — it's an easy one-off to miss.
> - **v180 (test-health sweep, harden flaky fixed-timeout preview reads — closes the v174-queued target):**
>   added a reusable in-page poll helper (`window.__waitForPreview(test, timeout)`, installed once via
>   `page.addInitScript`) that re-reads a **fresh** `#preview` contentDocument on every tick (capturing the
>   iframe's document once before polling silently polls a stale/detached object once the iframe reloads)
>   until `test(doc)` returns truthy or a timeout elapses. Converted **all 21** fixed-`setTimeout`-then-read
>   `#preview` sites in `tests/run.js` to it, each with a predicate specific enough to skip past the
>   *previous* test's still-live content instead of matching on it (mostly "the new unique panel title has
>   appeared" — e.g. wait for `"Sankey"`/`"Bullet"`/`"Chord"` — with a few needing a value-specific predicate
>   instead: the gauge %-format check waits for a `"%"` in `.gauge-val`, the maxRows check waits for
>   `rows.length <= 3`, and the 3-step calendar-heatmap options test now tags each render's panel title
>   `"Activity 1/2/3"` so each step's wait can't accidentally match the *previous* step's still-live DOM). Also
>   hardened "canvas × deletes a panel" (not a `#preview` read but the same class of bug — a fixed wait racing
>   the postMessage round-trip from the preview iframe back to `window.__STUDIO_STATE`) with
>   `page.waitForFunction` polling for the exact expected panel count. Suite is unchanged at 890/890 (test-only,
>   no product change) but should no longer flake non-deterministically on a slower machine.
> - **v169 (dead code sweep, first architecture sweep):** wrote a script diffing every CSS class selector
>   in `app/studio.css` against a full-text search across all of `app/*.js` + `index.html` + `docs/index.html`
>   + `tests/run.js` — found only **2 genuinely orphaned rules** out of 341 classes (`.ex-cards-1`, a
>   never-wired single-column variant of the examples gallery grid; `.empty-insp`, an inspector empty-state
>   style with no caller) — removed both. The near-total absence of dead CSS/JS (a parallel scan for
>   zero-reference top-level `function` declarations across `app/studio.js`/`model.js`/`exporters.js`/
>   `studio-render.js`/`studio-charts.js`/`pentaho.js` found **zero** unused functions) says the codebase is
>   in genuinely good health for its size — future sweeps will likely find more in the **chart-extension
>   duplication** (repeated SVG-embed/tooltip/format boilerplate across the 51 `PDC.*` chart renderers in
>   `studio-charts.js`, ~5.4K lines) or **studio.js size** (5.2K lines, the largest single surface) buckets
>   instead of simple dead-code deletion.

### N. Innovation backlog — leading-edge concepts (RECURRING/GROWING — sweep type 3; see SWEEP CADENCE)
> This is the "look back + look forward, be exceptionally innovative" list (user-requested 2026-07-02).
> The north star is **meant to keep expanding.** On an innovation sweep: add 2–4 genuinely novel ideas here,
> then optionally ship the smallest delightful slice of one. Everything must still honor the constraints:
> **pure HTML/JS, no backend, config local, self-contained exports, game-like Polecat aesthetic.** Grouped
> by theme; not ordered — pull whatever is ripe. Promote an idea into a Z/lettered track once it's committed to.

**N-AI — Intelligence layer (bring-your-own-key, browser-side).**
- **Natural-language → dashboard:** describe what you want ("weekly revenue by region with a target line")
  and generate a starter spec — NL → chart type + column mapping + query. BYO API key stored locally.
- **NL query bar over a live source:** text → SQL → chart. Becomes real the moment Z14 DuckDB-Wasm lands
  (query a Parquet/CSV by asking in English). The killer combo with the connector track.
- **Voice command mode:** ✓ shipped v266, see below.
> ✓ **Voice command mode shipped v266 (closes the item above).** A mic button now sits inside the ⌘K
> palette's search field — shown only when `window.SpeechRecognition`/`webkitSpeechRecognition` actually
> exists (Chrome/Edge/Safari; silently absent on Firefox, typing still works everywhere). Click it, say a
> command ("add a bar chart", "go to settings"), and once recognition finalizes it fills the query and
> **runs the top match automatically** — hands-free, the same path pressing Enter would take. Pulses red
> while listening; auto-stops on its own. No API key, no backend, pure browser API — a genuinely novel,
> zero-dependency extension of the keyboard-first palette (`app/palette.js`). New `mic` icon
> (`app/icons.js`). 3 new tests (mic presence tracks API availability; a stubbed-`SpeechRecognition` page
> exercises the full listen→transcribe→auto-run flow), suite 1206/1206.
> ✓ **Auto-insight narration ("Explain this chart") — first cut shipped v212.** Any panel bound to a single
> value column gets an **Insight** section in its inspector (below Query preview): a plain-English
> paragraph covering overall trend direction (OLS slope sign/magnitude vs. flat), the single biggest
> point-to-point move, and any outlier beyond 2 std-deviations from the mean — all computed from the
> panel's own sample rows. `Studio.computeInsights(cols, rows, labelCol, valueCol)` in model.js (pure,
> no DOM/PDC dependency) + `Studio.abbrNum()` helper; `renderInsight()` in studio.js reuses the same
> `Studio.sampleRows(da)` the Query preview section already draws from. Falls back to the first `series[0]`
> column when a chart type has no direct `valueCol` (e.g. line/area); silently omitted for chart types with
> neither (tables, richtext, sankey/chord). 3 new tests, suite 983/983. **Still open:** seasonality
> detection, auto-placed callout markers on the notable points, and a smart chart-type recommender.
> ✓ **Seasonality detection shipped v271 (closes that "still open" item)**: `computeInsights()` now also
> checks for a repeating pattern — it detrends the series (subtracts the same OLS fit line used for the
> trend sentence, since a plain monotonic climb is trivially "autocorrelated" at every lag and would
> otherwise read as fake seasonality) then tests every candidate period from 2 up to n/2 (capped at 12)
> for the strongest lag autocorrelation on the residuals; a convincing hit (r > 0.6) adds "It also shows
> a repeating pattern roughly every N points (autocorrelation r)." Pure addition to the existing sentence
> list — no new UI, the Insight section already renders whatever `computeInsights()` returns. 3 new
> tests (a clear period-4 series is named correctly; a plain monotonic trend is NOT flagged, proving the
> detrend step earns its keep; a too-short series doesn't crash). Suite 1224/1224.
> ✓ **Auto-placed callout markers shipped v273 (closes that "still open" item — N-AI auto-insight
> narration track is now feature-complete)**: `Studio.notablePoint(cols, rows, labelCol, valueCol)` in
> model.js picks the same single point the narration was already talking about (the outlier if beyond 2
> std-dev, else the biggest single move) and converts it to an (x%, y%) chart-body position — x% from the
> point's index along the series, y% from where its value falls in the observed min/max range. An **"Add
> callout at '…'"** button appears below the Insight narration whenever one is found; clicking it drops
> the panel's existing Callout arrow overlay (v84) straight onto that point instead of eyeballing the x%/y%
> sliders. Pure/independently-testable, same offline-only spirit as `computeInsights`. 5 new tests, suite
> 1231/1231.
> ✓ **Smart chart recommender shipped v219 (closes the item below).** A "Recommended for this data" chip
> strip appears above the chart-type gallery once a panel has a query bound — `Studio.recommendCharts(cols,
> rows)` in model.js classifies columns (date-like / numeric / string) and cardinality, then suggests up to
> 3 fitting types (Line for a date+number, Bars+Donut for a low-cardinality category+number, Scatter for two
> numeric columns across ≥5 rows, Table for a wide query, KPI for a single row) each with a one-line "why"
> shown on hover; clicking a chip calls the existing `changeChartType()`. Pure, no API/network. 7 new tests,
> suite 1009/1009.
- **Smart chart recommender:** given a bound DA's shape (cardinality, types, row count), suggest the 3 best
  chart types with a why. Guides newcomers; upgrades the gallery from a menu to an assistant. ✓ shipped
  v219, see above.

**N-FUN — Engagement, delight & "game-like."**
- ✓ **Command palette (⌘K / Ctrl-K) — slice 1 shipped v175** (`app/palette.js`): fuzzy-searchable list of
  ~28 commands (section nav + new/open/save/export + add text/source + theme/live/focus/slideshow/demo/
  simple toggles + servers/tour/tutorial/shortcuts/docs). Keyboard-first (↑↓/↵/esc); ⋯ More entry;
  self-contained (drives existing controls, own CSS, no studio.css/studio.js edits); 5 tests.
> ✓ **Slice 2 shipped v177**: palette now includes **dynamic commands** — "Open example: <title>" for every
> curated gallery example and "Open dashboard: <title>" for every Home recent, rebuilt fresh each open by
> reading the existing DOM (no new storage). Added a **visible "Search ⌘K" rail item** (global chrome, all
> sections) as a discoverable affordance beyond ⋯ More/shortcuts-modal; new `search` icon. Docs updated.
> 5 new tests, suite 883/883.
> ✓ **Slice 3 shipped v178**: every static command now has an icon (was only the 5 nav rows) — a coherent,
> scannable icon-per-row menu. 1 new test, suite 884/884. **Still open:** include chart types
> (add-panel-of-type) as commands.
> ✓ **Slice 4 shipped v203**: recent/frequent command ranking — a small `studio-cmdk-usage` localStorage
> map (label→{count,last}) records every command actually run; an empty-query open now leads with your
> most-recently-used commands (classic command-palette pattern), and a non-empty query gives previously-run
> commands a small tie-breaking boost among equally-relevant matches. Included in Clear local data. 3 new
> tests, suite 955/955.
> ✓ **Slice 5 shipped v208 — chart types as commands (the "still open" item above)**: every entry in
> `Studio.CHARTS` (51 types) now gets its own dynamic **"Add panel: &lt;type&gt;"** command — it drives a
> catalog data-source card's existing quick-add chip (creates a panel) then, unless the type is the chip's
> own default (bars), clicks the fresh panel's own chart-type-gallery card (now tagged `data-t`) to switch
> it — two real clicks through existing wiring, zero duplicated business logic. Docs updated. 2 new tests,
> suite 968/968.
- **Story / scrollytelling mode:** author an ordered, annotated narrative through a dashboard (extends
  Slideshow) — each step pans/zooms/highlights and shows a caption. Present findings, not just charts.
> ✓ **First cut shipped v268 (closes the "caption" half; pan/zoom/highlight-per-step remains open for a
> future slice).** Panels gain an optional **Slide caption** field (panel inspector, below Note) —
> narration shown ONLY inside the existing Slideshow overlay (⋯ More → Slideshow ▶), a caption bar
> beneath the chart that updates per-slide as you navigate. Distinct from the always-visible **Note**
> field (shown everywhere); panels without a caption show no bar, so existing dashboards are unaffected.
> 4 new tests, suite 1215/1215. **Still open:** per-step pan/zoom/highlight choreography (today each
> slide is the panel at full width, same as before — only the caption is new).
> ✓ **Zoom/highlight choreography, first cut, shipped v272 (closes the "zoom"/"highlight" half; pan
> remains open)**: panels gain a **Slide emphasis** toggle (below Slide caption) — when on, that
> panel's slide plays a brief zoom + terracotta glow entrance the moment it appears in Slideshow,
> replaying every time you land back on it (`ifr.classList.remove/add("ss-zoom")` + forced reflow in
> `openSlideshow()`'s `showSlide()`, pure CSS `@keyframes` in `studio.css`, respects
> `prefers-reduced-motion`). Slideshow-only, like Slide caption — the normal preview/export is
> untouched. 2 new tests, suite 1226/1226. **Still open:** per-step **pan** (framing/zooming into a
> specific region of the chart itself, not just the whole panel).
> ✓ **Per-step pan shipped v275 (closes the "still open" item above — N-FUN Story/scrollytelling
> track now feature-complete: caption v268, zoom/glow v272, pan v275)**: when Slide emphasis is on, a
> panel gains **Pan X / Pan Y** sliders (0–100%, default 50/50 = center) that set the emphasis iframe's
> CSS `transform-origin` — the zoom-in entrance now pushes toward that chosen spot instead of always
> the panel's dead center, so a spike near an edge can be the actual focus of the push-in. The sliders
> are hidden until Slide emphasis is checked. 2 new tests, suite 1235/1235.
- **Live "what-if" parameter sliders:** on-canvas sliders that drive derived series / forecasts and animate
  the charts as you drag — analysis as play (pairs with Z7).
> ✓ **First cut shipped v289 (closes the item above)**: the Line/area inspector's Holt-Winters forecast
> knobs (Smoothing level α, Smoothing trend β, Smoothing seasonality γ, Season length, Moving avg window,
> Forecast periods ahead) render as drag-to-animate range sliders with a live value badge instead of plain
> number boxes — dragging one re-shapes the trend/forecast line in the live preview in real time. New
> generic `type:"range"` option in the shared `optField()` inspector-field builder (`app/studio.js`) any
> chart type's `opts` can opt into; reuses the existing live-refresh wiring (already fires on every
> keystroke), so no new event plumbing was needed. **Still open:** extending "range" sliders to other
> chart types' numeric knobs beyond Z7 forecasting (e.g. Callout/Reference band position %, Inner radius %
> on Donut — currently plain number/text inputs).
> ✓ **Extended to the other genuinely percentage-shaped opts, shipped v290**: Donut's **Inner radius %**,
> Stream graph's **Band opacity %**, Parallel coordinates' **Line opacity %**, and Gauge's **Warning/Good
> zone starts at %** thresholds are now range sliders too (same `type:"range"` + live badge). The overlay
> annotations (Target line, Reference band, Callout arrow, Period highlight, Point annotations, Slideshow
> duration) already used bespoke range sliders before this track existed, so this closes the gap in the
> generic per-chart-type `opts` system specifically. Left `height`/row-count/max-value fields as plain
> number inputs (not naturally 0–100%, a slider would mislead). 2 new tests, suite 1290/1290.
- ✓ **Build-completeness meter + gentle achievements — shipped v196.** A small progress ring + checklist
  at the top of the Dashboard inspector (title / panel / KPI / filter / a touch of style), purely
  encouraging (never a warning), collapses to a "nice work" note once complete.
  `Studio.dashboardCompleteness(spec)` in model.js. 3 new tests, suite 947/947. **Not yet done:** true
  "achievements" beyond the one meter (e.g. a first-export moment, a milestone toast).
> ✓ **First-export delight moment shipped v210** (first "achievement" + first "Delight moments" item):
> the very first time this browser ever exports a dashboard (any format, via `doExport()` — CDF/CDA/
> bundle/Push all funnel through it), a one-time celebratory toast + a brief, tasteful spark/confetti
> burst plays (`celebrateFirstExport()` in studio.js, CSS in studio.css); a `studio-first-export-done`
> localStorage flag (included in Clear local data) means it never repeats. Respects
> `prefers-reduced-motion` (toast still shows, burst is skipped). 4 new tests, suite 977/977.
- **Data-driven motion system:** spring-physics transitions between filter/data states so numbers *move*
  meaningfully; a coherent motion language across the app (respect reduced-motion).
- **Delight moments:** playful empty-states, easter-eggs, more milestone moments — small, rare, tasteful.
> ✓ **Export milestone toasts shipped v224** (first "more milestone moments" slice): a running
> `studio-export-count` (localStorage, any export kind — CDF/CDA/bundle/Push/panel-embed) celebrates
> round totals (10/25/50/100/250) with a toast + the same spark burst as the first-export moment —
> `sparkBurst()` extracted as a shared helper so both moments reuse one implementation. Non-milestone
> exports stay silent. Included in Clear local data. 3 new tests, suite 1024/1024.
> ✓ **Dashboards-created milestone toasts shipped v278** (second "more milestone moments" slice): a
> running `studio-dash-count` celebrates round totals (5/10/25/50) of brand-new **blank** dashboards
> started — Home's Blank quick-create card and New ▾ → Blank dashboard, the two call sites that both
> already funnel through `applyDashboardDefaults(Studio.emptySpec())`. Deliberately scoped to just those
> two: Open/Import/Examples/Duplicate all pick up an existing spec rather than starting fresh, so they
> don't count. Same `sparkBurst()` + toast convention as the export milestones. Included in Clear local
> data. 3 new tests, suite 1240/1240.
- **Dashboard health celebration (added 2026-07-04, innovation sweep):** the dashboard-health Checks
  section (build-completeness meter v196 + orphaned-DA/data-quality-watchdog notes v307/v309) only ever
  shows a neutral "ready to export" line even when a dashboard is genuinely spotless — pair it with the
  existing milestone-toast/spark-burst delight convention (v210/v224/v278) so reaching zero warnings for
  the first time on a dashboard gets a small, tasteful, one-time celebration instead of just silence.
> ✓ **Shipped v326 (closes this idea)**: the Checks section now calls a new `celebrateHealthZero(sp)`
> whenever `Studio.validate(sp)` returns zero issues — a one-time-per-dashboard toast ("All clear — this
> dashboard has zero warnings.") + the shared `sparkBurst()`, keyed by `spec.id` in
> `localStorage["studio-health-celebrated"]` so it never repeats for the same dashboard even across
> reloads (same "once, keyed, never again" convention as `celebrateFirstExport`). Included in Clear local
> data. 4 new tests.

**N-DATA — Analytical depth (toward standalone analytic apps).**
- **Data source freshness badge (added 2026-07-04, innovation sweep):** track each data access's last
  successful "Test connection"/"Run live" timestamp locally (`localStorage`, keyed by DA id) and surface a
  small "checked 2h ago" / "never verified" badge wherever a DA is browsed (library pane, Repository,
  DA inspector) — nudges a builder to re-check a dodgy live connector rather than silently trusting
  demo/mock data that quietly went stale. Pure client-side, no new connector work.
> ✓ **First cut shipped v301 (same run as the idea was added)**: any DA with a **Run live** button
> (DuckDB/SQLite/Snowflake/Databricks/BigQuery/Generic SQL/HTTP/Pentaho) shows a **"Last verified
> live …" / "Never verified live"** badge (`.daprev-freshness`) in its Data preview toolbar, stamped
> in `localStorage["studio-da-freshness"]` (keyed by DA id) via the ONE shared `renderTable(...,
> "live")` call every connector kind already funnels through — no per-connector wiring needed.
> Deliberately scoped to "Run live" (a real query), not "Test connection" (mere connectivity, and a
> dozen separate per-connector success handlers) — a smaller, safer first cut. Reuses the existing
> `timeAgo()` helper. Included in Clear local data. Visually verified (never-verified → "just now"
> after a live click). 3 new tests, suite 1331/1331. **Still open:** surfacing the badge in the
> library pane / Repository too (today it's DA-inspector-only), and whether "Test connection" should
> also count as a freshness signal.
> ✓ **Extended to Repository cards, shipped v302 (closes the Repository half of that "still open"
> item)**: the same badge now appears on a data source's card in the Repository — but ONLY for
> `duckdb`/`httpvfs`/`snowflake`/`databricks`/`bigquery`/`http` kinds (always live-capable
> regardless of the ambient active-connection setting); a plain Pentaho `sql`/`mdx`/etc. catalog
> card (the vast majority — hundreds of them) deliberately stays badge-free rather than showing
> "Never verified live" as noise everywhere. 2 new tests, suite 1333/1333. **Still open:** the
> library pane, and whether "Test connection" should also count as a freshness signal.
> ✓ **Extended to the library pane, shipped v305 (closes the last "still open" surface — the
> freshness-badge track is now feature-complete)**: the same badge now appears on a data source's
> card in the library pane's **My Data Sources** section (`myDACard`, `app/studio.js`), same
> always-live-capable-kind scoping as the Repository card. New `window.__studioBuildLibrary` test
> hook. 2 new tests, suite 1337/1337. **Still open:** whether "Test connection" should also count as
> a freshness signal (today only a real "Run live" query stamps it).
> ✓ **"Test connection" now also counts, shipped v306 (closes the last "still open" question — N-DATA
> freshness-badge track is now fully feature-complete)**: all six direct connectors' DA-inspector
> **Test connection & detect columns** success handlers now call `markDaFreshness()` too — a real probe
> against the live source (DESCRIBE/PRAGMA/sample query) is just as strong a liveness signal as "Run
> live". 1 new test, suite 1338/1338.
- **Dashboard health score (added 2026-07-04, innovation sweep):** the existing build-completeness meter
  (v196) only checks "did you fill things in" — extend it (or add a sibling score) that also runs the
  Data quality watchdog (v260/v261) across every bound DA, flags orphaned data accesses (declared but no
  panel/KPI/filter references them), and flags a drill-through/detail-drawer target that no longer
  resolves — one glanceable score + punch-list for "is this dashboard actually sound," not just "is it
  filled in."
> ✓ **First slice shipped v307**: `Studio.validate()` (the existing "Checks" section's data source,
> already rendered in the Dashboard inspector — no new UI needed) now flags any data access in
> `spec.cda.dataAccesses` that no panel or KPI references, as an info-level note. Deliberately scoped
> to the smallest real signal first; **still open:** wiring in the Data quality watchdog (v260/v261)
> and a broken drill-through/detail-drawer target check, plus a distinct glanceable "health score" UI
> if this grows beyond a Checks-section note. 4 new tests, suite 1342/1342.
> ✓ **Data quality watchdog wired in, shipped v309 (closes that "still open" half)**: `Studio.validate()`
> now also runs the watchdog over every bound (non-orphaned) DA's own sample rows, one warn-level Checks
> note per issue. Found + fixed two false positives in the v307 orphan check while wiring this up: a DA
> bound only to a filter, or only feeding a compound (join/union) DA's leftId/rightId, was wrongly
> flagged unused. 4 new tests, suite 1346/1346. **Still open:** a broken drill-through/detail-drawer
> target check — today `panel.drill`/`kpi.drill` only model an external URL (`{url,param}`), so there's
> no internal "target that can stop resolving" yet; a distinct glanceable "health score" UI beyond the
> Checks-section notes remains optional/not yet done too.
> ✓ **Broken Detail-drawer target check shipped v324 (closes the "still open" item above — health
> score track now feature-complete)**: re-examined the claim that there's "no internal target that
> can stop resolving" — that's true for `drill` (always an external URL) but NOT for the **Detail
> drawer** (`panel.detail.da`), which targets a DA id inside the very same spec. Deleting or
> renaming that DA after wiring up the drawer silently breaks it (`PDC.openDetail` just finds
> nothing and the click does nothing — no error, no console warning). `Studio.validate()` now
> flags this as a warn-level Checks note. 3 new tests, suite 1407/1407. **A distinct glanceable
> "health score" UI beyond the Checks-section notes remains optional/not yet done**, per the
> original note — every underlying check the idea asked for now exists.
- **Compare dashboards side-by-side (added 2026-07-04, innovation sweep):** pick any two saved dashboards
  from Home/Repository and view them in a synced-scroll split-screen — distinct from the existing
  per-dashboard Version-history diff (v262, which compares a dashboard against ITS OWN past checkpoint,
  not two different dashboards). Useful for "which of these two drafts is better" or a before/after across
  a redesign.
> ✓ **First cut shipped v311**: a **Compare dashboards…** button on the Repository page opens a modal
> with two dashboard pickers (populated from `studio-recents`) and a plain-English diff summary below
> them, reusing `Studio.diffSpecs`/`diffSummary` verbatim (the same engine the Version-history diff
> already established) — same `.vdiff-list`/`.vdiff-row` rows, one comparison engine powering both
> features. Picking the same dashboard twice shows a friendly note instead of a false "no differences."
> 5 new tests, suite 1356/1356. **Still open:** the actual side-by-side synced-scroll LIVE PREVIEW
> (today's first cut is diff-summary only, no rendered dashboards) — a real next slice, not just
> polish, since "which of these two looks better" was half the original ask.
> ✓ **Live side-by-side preview shipped v312 (closes that "still open" item)**: the modal now renders
> a real `Studio.buildHtml` preview of each picked dashboard side by side (same render as any
> export/preview iframe, not a static thumbnail) above the diff list, in a widened modal (new reusable
> `modal-wide` option on the shared `modal()` helper). "Synced-scroll" was descoped — each iframe
> scrolls independently, which is fine since the two previews are typically short enough to fit without
> scrolling; revisit only if a real dashboard turns out tall enough to need it. 3 new tests, suite
> 1357/1357. **N-DATA compare-dashboards track is now feature-complete.**
- **Canvas sticky notes (added 2026-07-04, innovation sweep):** small colored freehand notes a builder can
  pin to a specific panel or blank canvas area — for team brainstorming/review while a dashboard is in
  progress. Builder-only UI state (`localStorage`, keyed by dashboard id), deliberately never exported —
  scratch space, not a dashboard feature.
> ✓ **First cut shipped v310**: a new **Builder notes** Dashboard-inspector section — small colored
> notes (5 preset colors), each pinned to a specific panel (matched by its stable `id`) or left as a
> "General note" for the whole dashboard. Kept out of `spec`/export entirely — stored in
> `localStorage["studio-canvas-notes"]`, keyed by dashboard id, same shape as `studio-versions`; wiped
> by Clear local data. 5 new tests, suite 1351/1351. **Not yet done (scoped down from the original
> ask, on purpose):** true freehand/blank-canvas-area pinning — the canvas is literally the same
> preview iframe used for export, so a pixel-position overlay risks leaking builder scratch state
> into the render pipeline; today's "General note" covers the whole-dashboard case instead. Pinning to
> a KPI tile also isn't supported yet (KPIs have no stable id — see `diffSpecs`'s positional KPI
> comparison — so a KPI-targeted note would silently drift onto the wrong tile after a reorder).
- **Cross-filter / brushing everywhere:** click or brush any chart to filter the whole dashboard, with a
  visible active-filter bar and one-click clear. The feature that makes a dashboard feel *alive*.
> ✓ **Extended to Lollipop, shipped v291**: `wireXFilter()` (`app/studio-render.js`) gains a `lollipop`
> branch (tags each `circle.dot` with its label — lollipop has no "sort by value" option of its own, so
> data renders in the given order already, unlike bars/donut which mirror their own sort toggle);
> `Studio.ANNOT_CAPS.crossFilter` now includes `lollipop`, so the Cross-filter inspector section appears
> for it too. Bars/donut/treemap were the only three wired since Z8 shipped this section; Lollipop is the
> most structurally similar chart (one taggable element per category + a labelCol/valueCol binding), so
> the smallest safe next slice. **Still open:** stacked/grouped bar family (ambiguous — one category maps
> to multiple series segments, needs a real UX decision on what a click should filter to) and any chart
> without a clean one-element-per-category shape. 2 new tests, suite 1293/1293.
> ✓ **Extended to Funnel, shipped v295**: same pattern — a new `funnel-bar` class on each stage rect
> (`app/studio-charts.js`) lets `wireXFilter()` tag stages with their labels (Funnel also has no sort
> option, stages stay in given order); `Studio.ANNOT_CAPS.crossFilter` now includes `funnel`. **Still
> open:** stacked/grouped bar family and any chart without a clean one-element-per-category shape. 3 new
> tests, suite 1305/1305.
> ✓ **Extended to Waterfall, shipped v297**: a new `wf-bar` class on each step rect (`app/studio-charts.js`,
> the optional synthetic "Total" bar gets `wf-total` alongside it and is deliberately excluded — it isn't
> a real data label) lets `wireXFilter()` tag steps with their labels; `Studio.ANNOT_CAPS.crossFilter` now
> includes `waterfall`. Also fixed a pre-existing timing flake in the Z7 Holt-Winters test suite (a spec
> reload was missing the settle wait every other reload uses, so the preview-iframe search right after it
> could intermittently come up empty). **Still open:** stacked/grouped bar family and any chart without a
> clean one-element-per-category shape. 3 new tests, suite 1313/1313.
> ✓ **Stacked/grouped bar family shipped v298 (closes that "still open" item — N-DATA cross-filter/
> brushing track now covers every chart type with a clean per-category shape)**: Stacked bars, Grouped
> bars, and 100% Normalized Stacked Bar (`barNorm`) all emit a cross-filter now. UX call: since these bind
> labelCol+**series** (one category maps to multiple segments), a click anywhere in a stack/group filters
> to the WHOLE category, not one series — same semantics as every other cross-filter chart type here.
> `_stackedOpts`/`_groupedBars`/`_barNorm` (`app/studio-charts.js`) self-tag every segment with
> `data-xf-label` directly at render time (`stacked-seg`/`grouped-bar`/`barnorm-seg` classes) instead of
> `wireXFilter` re-deriving labels by render-order index — a stack/normalized-bar renders a variable
> segment count per category (zero-value series are skipped), so index reconstruction wasn't reliable
> there. **Found + fixed a real latent bug** while writing the first-ever real-click regression test for
> this feature: `wireXFilter()` re-added a fresh click listener onto the same panel body on every redraw
> (debounced resize, theme change) without removing the old one, so after 2+ redraws a single click fired
> the toggle twice and instantly cancelled the filter back off — affected every cross-filter chart type,
> just never caught since no prior test simulated an actual click. Fixed with a one-time-attach guard
> (`body.__xfWired`). 11 new tests, suite 1324/1324. **N-DATA cross-filter/brushing track is now
> feature-complete** for every chart type with a clean category shape.
- **Dashboard-wide formula language:** calculated fields across data sources (not just CDA calc columns) —
  a small safe expression engine (`[revenue] - [cost]`, `pctChange(...)`, `movingAvg(...)`).
> ✓ **First cut shipped v315**: found the real gap driving this idea — every DA's existing
> "Calculated columns" section (`da.calcColumns`, formula `=[col1] + [col2]`) only ever fed the
> real Pentaho `.cda` XML export; the builder itself never evaluated the formula, so the offline
> preview always showed nothing for a calc column and the whole section was a silent no-op for
> the six direct-query connectors (DuckDB/SQLite/Snowflake/Databricks/BigQuery/Generic SQL) —
> none of which go through a CDA server to compute it. New `Studio.evalFormula` (model.js) is a
> small, safe recursive-descent `+ - * / ( )` parser (no `eval()`/`Function()`) plus
> `Studio.applyCalcCols(cols, rows, calcColumns)`; wired into `Studio.sampleRows`/`genMock`
> (sampledata.js) so the offline preview now shows a real computed value, and into
> `Studio.columnsOf` so a valid calc column's name is offered everywhere a panel/KPI picks a
> column — mirroring how a real Pentaho server appends calc columns to the query's own output.
> The DA inspector's formula field now validates live against a probe row and shows a small
> inline error naming the problem (unknown column, divide-by-zero, malformed syntax) instead of
> failing silently. 10 new tests. **Also found while scoping a "wire it into the exported/live
> runtime too" follow-up — a much bigger, pre-existing gap, written up under Z14/Z4 below:** an
> *exported* dashboard has no live-query mechanism at all for the six direct connectors, so this
> stays a builder-preview-only feature for them until that's addressed (see "⚠️ direct connectors
> don't actually run once deployed" under Z14).
> ✓ **`pctChange()`/`movingAvg()` named functions shipped v319 (closes that "still open" item)**:
> `Studio.evalFormula` now recognizes `pctChange([col])` (percent change vs. the previous row, in
> percentage points; errors — becomes `null` — on the first row, no prior to compare against) and
> `movingAvg([col], n)` (trailing n-row average, default 3, partial window at the very start — the
> same convention as the line chart's own Show moving average overlay), alongside the existing
> arithmetic. Needed a real signature change: both functions need the row's *position* + the whole
> column's values, not just the current row, so `evalFormula(formula, rowObj, ctx)` grew an optional
> `ctx = {index, series(colName)}`; `applyCalcCols` builds a memoized per-column series lookup once,
> shared by every row. The DA inspector's live formula validator (a single dummy probe row) now
> builds a tiny 2-row dummy series too, so a real `pctChange()`/`movingAvg()` formula validates
> clean instead of always erroring on "no prior row" against what's otherwise a one-row probe. Docs
> updated with examples. **Found + documented (not fixed, scope creep) while updating the docs:** a
> calc column still isn't appended to the v318 DuckDB/SQLite **live runtime** query result (only the
> offline preview evaluates it) — same limitation those two connectors' own builder "Run live"
> button already has today, tracked as a distinct future follow-up rather than silently claimed
> fixed. 9 new tests, suite 1391/1391.
> ✓ **Live-runtime calc columns shipped v320 (closes that "distinct future follow-up" — the N-DATA
> formula-language track is now feature-complete)**: `app/studio-render.js` (the module that ships
> INSIDE every exported dashboard) now carries its own pure local copy of `Studio.evalFormula`/
> `applyCalcCols` — the same "builder-only module never inlined here" situation as the existing
> `applyTemplateVars`/`withTimeout` local copies in that file — and applies it to every duckdb/httpvfs
> live query result's `{cols, rows}` before handing them back through `PDC.cda`. A DA with no
> `calcColumns` pays zero extra cost (short-circuits to a plain copy); mock-data and real Pentaho CDA
> paths are untouched. 2 new tests, suite 1394/1394.
- **Period-over-period / compare mode:** pick two ranges or two sources and diff them across every panel.
- **Pivot / crosstab builder** and **anomaly + correlation explorer** as first-class analysis surfaces.
- **Data quality watchdog (added 2026-07-03):** scan a data access's own sample rows for common quality
  smells — blank/null values, a zero-variance ("always the same value") column, duplicate rows, an
  obviously-inconsistent type mix in one column — and surface them as a small inline note right where the
  DA is browsed/edited, *before* a chart is even built on top of it. Pure client-side profiling over data
  already fetched for the existing Query preview; no new connectors or backend involved.
> ✓ **First cut shipped v260**: `Studio.dataQualityIssues(cols, rows)` (model.js, pure) flags blank/missing
> values per column, a column that's the same value on every sampled row, and duplicate rows;
> `Studio.dataQualityMessage(issue)` renders each as one plain-English sentence. Wired into the existing
> **Query preview** section (`renderQueryPeek`, shared by the panel inspector and the DA/Data source
> inspector) — any issue found in that DA's own sample renders as a small amber `.note.warn` right below
> the sample table. The bundled offline demo data is deliberately clean (no naturally-occurring blanks/
> duplicates in the synthetic generator), so this mostly earns its keep once a builder points a DuckDB/
> SQLite/Snowflake/Databricks/BigQuery/Generic-SQL/CDA connector at *real* data.
> ✓ **Track complete, shipped v261**: `dataQualityIssues` now also flags an "inconsistent type mix" column
> (both number-looking and text-looking non-blank values in one column's sample — e.g. a quantity column
> with a stray "N/A"), closing the one remaining smell from the original list. The richer **"Data preview"**
> modal (`renderDAPreview` — live + paginated results, distinct from the inline Query preview the first cut
> covered) now runs the same watchdog over its own result sample (a `.daprev-quality` note wrap below the
> table), so live connector data gets flagged too, not just the offline sample. 3 new tests (the "mixed"
> type + message case, plus a wiring check that the Data preview modal's note count exactly matches
> `Studio.dataQualityIssues()` over its own result sample), suite 1188/1188. **N-DATA data quality
> watchdog track is now feature-complete.**
> ✓ **Auto-arrange shipped v263 (closes this idea)**: a one-click **Auto-arrange** button (next to Grid
> columns in the Dashboard inspector) reflows a dashboard's existing panels — `Studio.autoArrange()` in
> model.js gives wide chart types (Table, Text/annotation, Sankey, Chord, Calendar heatmap) a full-width
> span, everything else a single column, and clusters panels sharing a first tag together, using the
> existing `span` system. Pure rearrangement of what's already there — no new spec fields; KPIs are
> untouched (they already lay out in their own row). 4 new tests, suite 1195/1195.
- **"What changed since your last visit" digest (added 2026-07-04, innovation sweep):** Home/Repository's
  recent-dashboard cards already know when a dashboard was last opened (`studio-recents`) and Version
  history already captures a checkpoint on every meaningful edit — combine them into a small "3 changes
  since you were last here" line on a recent card, reusing the existing `diffSpecs`/`diffSummary` engine
  (the same one Version-history-restore and Compare-dashboards already share) rather than a new comparison
  path. Nudges a returning collaborator toward what actually moved instead of re-reading the whole spec.
> ✓ **Shipped (2026-07-04, closes this idea)**: a new `studio-last-viewed` map (dashboard id → ISO
> timestamp) is stamped only by actually OPENING a dashboard (`openRecent()`), distinct from
> `studio-recents`' `ts` which updates on every autosave tick and would reset the "since you were
> last here" clock on every keystroke. `changesSinceLastView(r)` finds the Version-history checkpoint
> at-or-before that timestamp (the dashboard's state as it stood at last open) and diffs it against
> the current spec via the exact same `Studio.diffSpecs`/`diffSummary` engine Version-history-restore
> and Compare-dashboards already share — null when there's no recorded last-view, no old-enough
> checkpoint, or a clean diff. Home/Repository cards show a small "N changes since you were last
> here" hint (hover for the actual diff lines) whenever it fires. Added to Clear local data. 6 new
> tests (real diff renders on the card, both null cases, and `openRecent()` genuinely resets the
> clock). Docs updated. Suite 1441/1441.
- **Cross-dashboard column search (added 2026-07-04, innovation sweep):** once a data source's schema
  changes (a column renamed/dropped upstream), there's no way today to ask "which of my saved dashboards
  actually use column X" — extend the Repository's existing search to also match against each recent
  dashboard's bound DA columns (not just title/DA name), so a schema change's blast radius is a search
  away instead of opening every dashboard to check.
> ✓ **Shipped v327 (closes this idea)**: Repository's dashboard search now falls back to matching each
> recent dashboard's bound `cda.dataAccesses[].columns` once title/desc don't match, AND surfaces WHICH
> column matched (a small terracotta "Matches column "…"" hint on the card) so a title-less hit isn't a
> silent mystery. Pure additive filter/render change — `renderRepository()`'s `dashCards` build +
> `recentCardHtml()`'s new optional `matchedCol`. 3 new tests.

**N-DIST — Distribution & platform reach (still backend-free).**
> ✓ **Import from URL shipped v264 (first cut of this idea — a single spec URL, not yet an index of
> several)**: **＋ Import from URL…** at the bottom of the Examples ▾ menu opens a small modal — paste a
> public link to a `.studio.json` file (a GitHub raw link, a gist, a static host) and it fetches,
> validates, and loads it the same way opening a local file would. Plain client-side `fetch()`, no
> backend/credentials; a failed or invalid fetch surfaces a clear inline error instead of hanging. 2 new
> tests, suite 1197/1197.
> ✓ **Index-of-several format shipped v269 (closes the "still open" item above)**: the same modal now also
> accepts an index URL — a JSON array, or `{templates:[...]}`, of `{title,url,description}` entries (same
> shape as the Examples gallery's own `index.json`) — and renders a browsable `rowItem` list to pick one
> from; entry URLs may be relative to the index URL (resolved via `new URL(entry.url, indexUrl)`). A single
> dashboard spec URL still imports directly as before — the modal auto-detects which shape it fetched. 4
> new tests, suite 1218/1218. **N-DIST template-exchange track now feature-complete.**
- ✓ **Embeddable single-chart widget shipped v211.** "Export this panel…" in the panel inspector (below
  Duplicate/Delete) reuses the full `Studio.exportCDF` on a spec pared down to just that one panel (no
  KPIs, no filters, no other panels) — same self-contained toolkit, tiny standalone `.html` widget, no
  separate embed code path to drift out of sync. Also counts toward the N-FUN first-export delight moment.
  Docs updated. 3 new tests, suite 980/980.
> ✓ **Installable PWA + offline shipped v243 (closes the item below).** `sw.js` (repo root) precaches the
> app shell (index.html + every `app/*.js`/css + `vendor/pdc-ui.js`) and serves network-first with a
> cache fallback — always prefers a fresh copy while online (safe for an app that redeploys hourly),
> only serves the cached copy when genuinely offline. `site.webmanifest` gained `start_url`/`scope` +
> real 192x192/512x512 PNG icons (`tools/gen-pwa-icons.js`, same favicon.svg-rasterizing technique as the
> Z12 apple-touch-icon) — most browsers require these beyond an SVG-only icon list for "Add to Home
> Screen"/"Install app" to appear. "Clear local data" also drops the SW cache. 4 new tests, incl. a real
> `context.setOffline(true)` reload that boots the cached shell. Suite 1144/1144.
> ✓ **Offline catalog + examples precache shipped v245 (closes the "not yet done" note above).** `sw.js`
> now precaches `data/cda-catalog.json` + `data/examples/index.json` at install time, then reads that
> index to precache every curated example spec it lists — a first-ever offline visit gets a real,
> populated query library and Examples gallery, not a blank shell. Cache bumped to `studio-shell-v2`.
> 1 new test (verifies the precache + a repopulated catalog after a real offline reload). Suite
> 1145/1145.
> ✓ **Home offline verified shipped v246 (closes the last "not yet done" note above).** Added a
> regression test proving Home's Recent dashboards grid (localStorage-backed, no network involved)
> genuinely renders with the network fully cut — it already worked, this proves it instead of assuming
> it. No app code changed. Suite 1146/1146. **N-DIST offline/PWA track is now feature-complete.**
- **Installable PWA + offline:** ✓ shipped v243/v245/v246, see above.
- **Client-side PNG/PDF export of a whole dashboard** (canvas/`html-to-image`-style, dependency-light) and
  print-perfect layouts — for sharing where a link won't do.
> ✓ **First cut shipped v300 (the single-chart PNG half)**: panel inspector gains **Save chart as
> PNG** — grabs the panel's live `<svg>` straight out of the preview, inlines every descendant's
> *computed* style onto a clone (fill/stroke/font/etc., so the exported image is self-contained),
> then rasterizes via an SVG-blob → `Image` → `canvas` round-trip at 2x scale. Deliberately
> SVG-only rather than a generic whole-dashboard screenshot: cloning the whole HTML card into an
> SVG `<foreignObject>` and drawing that to canvas **taints the canvas in Chromium**
> (`SecurityError` on `toDataURL`) the moment real HTML is involved — confirmed directly in this
> sandbox's headless Chromium rather than assumed. Table/Richtext panels (no `<svg>`) get a clear
> "not supported yet" toast instead of a silent no-op. Visually verified (not just DOM-checked) on
> Bars/Donut/Line — gradients, per-series colors, and even an in-SVG donut legend all reproduce
> correctly. **Still open:** a true whole-dashboard PNG (needs a different technique for the
> non-SVG chrome — KPI tiles/titles/legend divs — since the foreignObject route is a dead end in
> Chromium) and print-perfect PDF layouts. 3 new tests, suite 1328/1328.
> ✓ **Shareable state links shipped v240 (closes the item below).** Dashboard inspector's new "Share this
> dashboard" section — `Studio.encodeSpecToShareString`/`decodeSpecFromShareString` (model.js, pure/
> testable) encode the whole working spec into a `#share=…` URL; opening it (any browser/device) boots
> straight into that exact dashboard in the Studio builder, no file/server, distinct from the existing
> per-filter `#hash` deep-link (which only ever carries filter defaults for an *exported* CDF). A garbage
> or corrupted link fails safe into the normal boot flow instead of crashing. 3 new tests, suite 1137/1137.
- **Shareable state links / snapshots:** ✓ shipped v240, see above. Not yet done: a *diff*-based link for
  edits to an already-shared dashboard (today it's always the full spec).
- **Local version history & visual diff:** timeline of auto-saved spec snapshots with a side-by-side diff
  (beyond in-session undo) — "time travel" for a dashboard.
> ✓ **First cut shipped v258 (closes the "version history" half, diff still open):** the Dashboard
> inspector gains a **Version history** section (below Share this dashboard) — every explicit Save
> (topbar Save, ⋯ More → Save spec, or Ctrl/⌘+S) pushes a timestamped checkpoint into
> `localStorage["studio-versions"]`, keyed by dashboard id, newest-first, capped at 10 per dashboard.
> Clicking an entry restores it (confirm first); the restore itself pushes a fresh checkpoint, so a
> restore can be undone too — same convention as git checkout / Google Docs version history. Distinct
> from in-session Undo/Redo (memory-only, lost on reload) and `studio-autosave` (one unsaved draft).
> Version lists are pruned to only dashboards still tracked in `studio-recents` (reusing the existing
> `noteRecent()` debounce) so history can't grow unbounded once a dashboard falls off Home/Repository.
> Included in Clear local data. `docs/index.html` updated. 5 new tests, suite 1172/1172.
> ✓ **Side-by-side diff shipped v262 (closes the "still open" item above; N-DIST version-history track
> now feature-complete)**: every checkpoint gains a **⇄ Compare to current** button — opens a plain-
> English change list (`Studio.diffSpecs`/`Studio.diffSummary` in model.js, pure) between that checkpoint
> and the live working spec: scalar fields (title/subtitle/accent/header bg/etc.), panels/filters added/
> removed/changed (matched by stable `id`), KPIs added/removed/changed (positional — they carry no id).
> The modal also offers "Restore this version" so you can see what a restore would actually undo before
> committing. New `diff` icon (`app/icons.js`). 6 new tests, suite 1194/1194.
> ✓ **User-requested again 2026-07-02 — already shipped (v258 + v262 above); confirmed feature-complete.**

**N-DESIGN — Make it unmistakably sexy.**
- **Theme studio & gallery:** author/share custom themes (theme × light/dark, extends Z10); a few stunning
  presets (warm Polecat, neon, editorial, high-contrast); optional per-dashboard theme.
- **Chart "skins":** alternate render moods — hand-drawn/sketch, glass/depth, editorial-minimal — as a
  toggle, so the same data can feel playful or boardroom.
- **Depth & material polish:** tasteful gradients, soft shadows, glassmorphism accents pulled from
  polecat.live; a coherent elevation/spacing scale.
> ✓ **First cut shipped v277**: chart cards (`.card` in `vendor/pdc-ui.css` — the shared toolkit inlined
> into every live preview AND every exported Dashboard Framework, so this applies everywhere uniformly)
> now lift on hover — `translateY(-2px)` + `var(--panel-shadow-lg)` — the exact same treatment KPI tiles
> (`.kpi:hover`) already had. Chart panels previously read as static furniture next to visibly-tactile
> KPI tiles; now the whole dashboard's panel vocabulary feels like one coherent, alive material system.
> Pure CSS, both light/dark themes (via the existing `--panel-shadow-lg` variable, already themed). 2 new
> tests (CSS declaration present; a real hover in the live preview actually produces a non-identity
> transform), suite 1237/1237.
> ✓ **Glassmorphism inset highlight shipped v280 (closes the "glassmorphism accents" half of the "still
> open" item above)**: KPI tiles and chart cards (`.kpi`/`.card` in `vendor/pdc-ui.css`) now layer a
> `--panel-glass` inset top-highlight / bottom-shade under their existing drop shadow — a subtle "glass
> edge" (`inset 0 1px 0 …, inset 0 -1px 0 …`), tuned separately for light (soft white top edge) and dark
> (bright top edge / darker bottom edge, since dark panels show the effect more) app themes. Purely
> additive to the existing `box-shadow` chain (`var(--panel-shadow[,-lg]),var(--panel-glass)`) — no markup
> changes, applies everywhere the shared toolkit is used (live preview + every exported Dashboard
> Framework). 3 new tests (token declared; both `.kpi` and `.card` render an `inset` shadow layer in the
> live preview), suite 1252/1252.
> ✓ **Glass-edge extended to modal/drawer surfaces shipped v284 (closes the "modal/sheet surfaces" half
> of the "still open" item above)**: the CDA query inspector modal (`.pdc-qm`) and the drill-to-detail
> drawer (`.pdc-dt`) now carry the same `--panel-glass` inset highlight. 2 new tests, suite 1274/1274.
> ✓ **Chart "skins" first cut shipped v293 (closes the "alternate chart skins" half of the "still open"
> item above)**: a **Card style** picker (Dashboard inspector, below Subtitle style) — **Raised (default)**
> keeps the v277/v280 shadow + glass-edge + hover-lift; **Flat / minimal** strips all three (pure CSS
> override, `.card,.kpi{box-shadow:none;border:1px solid var(--panel-border)}` +
> `.card:hover,.kpi:hover{transform:none;box-shadow:none}`) for a quieter, editorial-minimal boardroom
> mood — same data/layout, applies uniformly in preview + every export, `vendor/pdc-ui.css` untouched.
> `spec.cardSkin` follows the established additive-override pattern (`Studio.CARD_SKINS`, `emptySpec`,
> `normalize()` whitelist). 4 new tests, suite 1297/1297. **Still open:** Settings default + style-preset
> snapshot parity (same "ship the field, then the defaults" sequencing titleSize/subtitleStyle followed —
> v228/v229 → v230), and further alternate moods (hand-drawn/sketch, deeper glass/depth) beyond
> Raised/Flat. **Still open (unrelated to this slice):** a broader elevation scale beyond hover + the one
> glass layer.
> ✓ **Settings default + style-preset parity shipped v294 (closes that "still open" item)**: a **Default
> card style** row joins Settings → Dashboard defaults (same Raised/Flat picker, seeds every brand-new
> blank dashboard); `stylePresets()`/`applyStylePreset()` now snapshot/restore `cardSkin` too, so a saved
> house style covers wording, logo, link, both colors, size, weight, dashboard theme, AND card style in
> one Apply. **Found + fixed a real pre-existing gap while wiring Clear local data**:
> `studio-default-dashboardtheme` (v281) had never been added to the "Clear local data" key list —
> folded it in alongside the new `studio-default-cardskin` key. 5 new tests, suite 1302/1302.
> ✓ **Broader elevation scale shipped v303 (closes the "still open" elevation-scale item above)**: a
> third, deeper `--panel-shadow-xl` tier now sets the CDA query inspector modal (`.pdc-qm`) and
> drill-to-detail drawer (`.pdc-dt`) apart from the shallower `--panel-shadow-lg` tier hover-lifted
> cards/KPIs share — floating surfaces now visibly out-elevate a merely-hovered panel. 2 new tests,
> suite 1335/1335. **Still open:** further alternate chart-skin moods (hand-drawn/sketch) beyond
> Raised/Flat.
> ✓ **"High Contrast" dashboard theme shipped v334 (first of the "a few stunning presets" idea —
> theme studio/gallery item)**: a third `Studio.DASHBOARD_THEMES` entry alongside Classic Pentaho
> Blue/Fleet Modern — true black/white extremes (not just a darker blue): `#ffffff` bg + solid
> `#000000` borders/text in light, `#000000` bg + solid `#ffffff` borders/text in dark, plus its
> OWN 10-color series palette re-validated (not reused from Fleet Modern) against these exact
> `#ffffff`/`#000000` surfaces via the `dataviz` skill's `validate_palette.js` (light: all six
> checks PASS with one legal WARN-band contrast slot; dark: all PASS except a legal floor-band CVD
> WARN — both mitigated the same way Fleet Modern's own WARN slot already is, direct-value labels
> the app ships by default). Uses the exact same additive-override architecture as Fleet Modern
> (`spec.dashboardTheme`), so the per-dashboard picker, Settings default picker, and Style-preset
> snapshot all pick it up with zero extra plumbing. Visually verified via cropped screenshots in
> both light and dark app mode (crisp black-on-white and white-on-black panel borders, not just a
> DOM/CSS-variable check). 5 new tests, suite 1451/1451. **Still open:** the remaining named
> presets from the original idea (neon, editorial) and true author/share custom themes.
> ✓ **"Editorial" dashboard theme shipped v337 (second of the "a few stunning presets" idea)**:
> a fourth `Studio.DASHBOARD_THEMES` entry — a warm, paper-and-ink boardroom mood (cream `#f7f3ea`
> bg / warm-black `#2b241c` ink in light, warm charcoal `#1c1712` bg / cream `#f2ece0` ink in dark),
> distinct from Fleet Modern's cool blue-gray and High Contrast's stark black/white. Its own
> earthy-but-saturated 10-color series ramp (terracotta/teal/ochre/moss/plum/slate/rust/berry/
> forest/gold) re-validated against the `#f7f3ea`/`#1c1712` surfaces it actually uses — light: all
> six checks PASS with one legal WARN-band contrast slot (same mitigation as Fleet Modern's own);
> dark: all six PASS outright. **Found + fixed a real gap shared by every prior theme while
> screenshotting this one**: `vendor/pdc-ui.css`'s `.pdc-header` banner gradient had its SECOND
> stop hardcoded (`linear-gradient(100deg,var(--header-bg),#163a6e)`) — so switching dashboardTheme
> only ever re-colored the first 0% of the banner, leaving a stray navy-blue tail on every non-
> Classic theme's banner (Fleet Modern and the just-shipped High Contrast both had this, unnoticed
> because no prior screenshot cropped in on the banner itself). Added a themeable `--header-bg-2`
> (defaults to the exact same `#163a6e` in both `:root` and `[data-theme='dark']`, so Classic is
> pixel-identical) and gave Fleet Modern/High Contrast/Editorial each their own matching second
> stop. Visually verified all four themes' banners via cropped screenshots (Classic unchanged;
> Fleet Modern, High Contrast, and Editorial now read as one coherent color end-to-end instead of
> a mismatched navy sliver). 7 new tests, suite 1464/1464. **Still open:** a "Neon" preset and true
> author/share custom themes.
> ✓ **"Neon" dashboard theme shipped v338 (third of the "a few stunning presets" idea — closes that
> "still open" item)**: a fifth `Studio.DASHBOARD_THEMES` entry — a synthwave/cyberpunk mood, near-
> black panels (`#050507` dark bg / `#fafafa` light bg) with electric cyan (`#22d3ee`/`#0891b2`) and
> magenta (`#ff3fd0`/`#c2185b`) brand accents. Unlike every prior theme, the header/sidebar stay
> near-black in BOTH light AND dark app mode (not just dark) — pushes the "keep header/sidebar dark
> regardless of mode" convention Fleet Modern established further, so "neon on black" reads as one
> consistent identity no matter the app's own light/dark toggle. Its own 10-color series ramp
> validated against the exact `#fafafa`/`#050507` surfaces it uses via the `dataviz` skill's
> `validate_palette.js` — dark: all six checks PASS outright; light: all six PASS with one legal
> WARN-band contrast slot (green), mitigated the same way every other theme's WARN slot is (the app
> already ships direct-value labels). Visually verified via screenshot (live preview in both light
> and dark app mode against a real 6-panel example, using the preview's own in-iframe theme toggle
> so the dashboardTheme's dark variant actually renders, not just the app chrome's) — the dark shot
> shows true near-black panels with vivid cyan bars and a magenta accent badge, distinct from Fleet
> Modern's blue-gray, High Contrast's stark black/white, and Editorial's warm cream. 6 new tests
> (registry/apply/header-gradient, same pattern as Fleet Modern/High Contrast/Editorial). Suite
> 1476/1476. **Still open:** true author/share custom themes.

**N-DEV — Power-user & authoring.**
- **Live JSON spec editor:** ✓ shipped v267, see below.
> ✓ **Live JSON spec editor shipped v267 (closes the item above).** **⋯ More → Edit JSON spec…** opens
> the whole working dashboard as raw, editable JSON (panels/KPIs/filters/style/everything) in a modal
> textarea — **Apply** validates it's well-formed JSON with a plausible spec shape (`panels` array,
> `cda.dataAccesses` array) before applying; an invalid edit shows an inline error and changes nothing.
> A **Version history** checkpoint of the pre-edit state is snapshotted first (reuses the N-DIST
> `snapshotVersion()` machinery), so any hand-edit is always one restore away from being undone — the
> same safety net a real Save gets. 5 new tests, suite 1211/1211.
- **Keyboard-first everything** (builds on the ⌘K palette + existing shortcuts) and a shortcuts cheat-sheet.
> ✓ **Shortcuts cheat-sheet exists** (`showShortcuts()`, `?` key / ⋯ More / ⌘K palette) and covers every
> global shortcut. **Gap found + fixed, shipped v285**: the command palette shortcut itself (Ctrl/Cmd+K)
> was missing from its own cheat-sheet — added as the first row. 1 new test, suite 1275/1275.
- **Dashboard templates/variables** — parameterized starting points beyond the examples.
> ✓ **First cut shipped v279**: `{{key}}` tokens anywhere in Title/Subtitle now resolve against a new
> **Template variables** list in the Dashboard inspector (below Subtitle style — key/value rows, +
> Add/remove, same list-editor convention as Scatter's Point annotations). `Studio.applyTemplateVars(str,
> vars)` (model.js, pure) runs once inside the shared `buildHtml` pipeline (the `<title>` tag AND the
> banner `.pdc-title` span both resolve through it), so the live preview and every export always agree
> with zero separate wiring; the editable `spec.title`/`spec.subtitle` fields themselves keep the raw
> `{{key}}` text, only the rendered output substitutes. An unmatched key is left as literal text (a typo
> stays visible instead of vanishing). `spec.templateVars` added to `Studio.emptySpec()` + the `normalize()`
> whitelist so it survives Open/Import/reload. 9 new tests, suite 1249/1249.
> ✓ **Panel Title/Note coverage shipped v287**: `{{key}}` now also resolves in any panel's Title and
> Note (previously the dashboard Title/Subtitle banner only), rendered by `studio-render.js`'s
> `renderGrid` — a small local copy of the substitution logic, since that file ships inside the
> exported/preview bundle where the builder-only `Studio` namespace isn't available (same convention
> as its existing `fmt()`/`color()`/`pctOf()` local copies). Double-click-to-rename on a panel title
> still starts from the RAW `{{key}}` string (stashed in a `data-raw-title` attribute), so renaming
> never silently bakes a resolved value back into the template. 4 new tests, suite 1280/1280.
> ✓ **Named, reusable variable sets shipped v288 (closes the "save/reuse a named variable set" item)**:
> the Template variables section can now "Save current as..." a named set and Apply a saved set to any
> dashboard in one click — same architecture as the existing named style-preset collection
> (`localStorage["studio-templatevar-sets"]`), travels with Settings export/import, wiped by Clear
> local data. 5 new tests, suite 1285/1285.

## Quality bar
Every iteration: builds, `tests/run.js` green, UI cohesive, README/STATUS updated, commit + push.
Prefer several small, well-tested, shippable improvements over one big risky one.
