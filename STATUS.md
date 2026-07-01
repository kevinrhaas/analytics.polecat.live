# Analytics Dashboard Studio — STATUS (hourly-loop resume anchor)

> **RESUME PROTOCOL:** An hourly cron (`17 * * * *`, fresh-session job) runs the improvement loop.
> On each fire: read THIS file first, continue from the top **NEXT** item, implement ~1–3 high-value
> improvements, keep the Playwright suite green, update DONE/NEXT here, and **commit + push** to
> `main` of `kevinrhaas/analytics.polecat.live` — main is the GitHub Pages deploy branch, so pushing
> publishes the live site at https://analytics.polecat.live. One commit per coherent improvement so
> progress survives.
>
> **REFINEMENT CADENCE:** roughly every ~5th run (or whenever the feature backlog is thin), do a
> **track H refinement pass** instead of a new feature — step back and make the app cleaner, more
> logical, more elegant, and more delightful (IA/menus, onboarding, visual polish, code health).
> Small, safe, well-tested slices; never a wild rewrite. This is ongoing, not one-and-done.

> **GOAL:** the best-in-class, sexy, first-class, comprehensive, joy-to-use visual builder for
> Pentaho **CDE & CDF** dashboards over existing **CDA** queries. CDF is the prettier/primary track.

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
  `app/changelog.js` (add new entries at the TOP); the publish CI stamps the real UTC deploy time into
  the footer via the `__BUILD_TS__` token (falls back to the latest entry's date locally). 91/91.
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
- v126: **F35: Ridgeline / joy plot (48th type) + H-track: Inspector expand all / collapse all** — Ridgeline (F35, Distribution group, CDF-only): horizontally stacked KDE density curves per category with configurable overlap ratio (0–0.9); shared value x-axis; category labels colored to match their ridge; Gaussian KDE (Silverman bandwidth, same as violin); fill + outline per ridge; hover tooltips (category, count, median); staggered animated entrance bottom-to-top; labelCol + valueCol binding; PDC.ridgeline extension (pdc-ui.js pristine); gallery SVG thumbnail in CHART_SVG and model.js thumb; 3 new F35 checks. Inspector expand/collapse-all: two compact buttons ("Expand all" / "Collapse all") below the search bar instantly expand or collapse all inspector sections; state persisted via _collapsedSects + localStorage; 3 new H126 checks. Test suite 689/689. 48 chart types total.
- v124: **F33: Pareto chart (46th type) + H-track: '/' keyboard shortcut for gallery search** — Pareto: Comparison group, CDF-only; bars sorted descending (largest leftmost), secondary right y-axis 0–100% with orange cumulative % line + dot markers, optional dashed 80% reference line; labelCol+valueCol binding; animated 2-phase entrance (bars staggered, then line fades in); PDC.pareto extension (pdc-ui.js pristine); gallery SVG thumbnails in CHART_SVG and model.js thumb; dispatch in studio-render.js; 4 new F33 checks. H-track '/' shortcut: pressing '/' when a panel is selected focuses .cg-search (chart-type gallery search); guards against input/textarea/select targets + modifier keys; listed in shortcuts modal (?); 2 new H-track checks. Test suite 675/675. 46 chart types total.
- v123: **F32: Icicle/partition chart (45th type) + H-track: series color palette presets** — Icicle: Composition group, CDF-only; two-level rectangular partition where parent groups appear as proportional column-strips across the top 36% and children fill the bottom 64% within each parent column; encodes both the parent-to-whole ratio (column width) and within-parent composition (sub-column width); labelCol+valueCol+groupCol binding; single-level mode when groupCol omitted; hover tooltips; staggered animated entrance (L→R); PDC.icicle extension in studio-charts.js (pdc-ui.js pristine); gallery SVG thumbnails in both CHART_SVG (studio.js) and model.js thumb; autoPickCols; 3 new F32 checks. Palette presets (H-track): 5 built-in series palettes (default/ocean/forest/sunset/dusk), each with separate light-mode and dark-mode ramps; 'Series palette' swatch row in dashboard inspector; selected palette injects --c1…--c10 CSS variable overrides into preview and CDF export; spec.paletteKey; Studio.PALETTE_PRESETS in model.js; paletteCss in exporters.js; 3 new H-palette checks. Test suite 669/669. 45 chart types total.

## NEXT (top = do first)

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
> **Z1 follow-ups (not yet done):** richer motion (panel slide-in, selection transitions — collapse/expand
> already animates); **simplify the TOP menu bar** now that the rail owns primary navigation — reorganize
> to consistent, best-practice IA (logical grouping, no redundancy, clear labels/icons: rail = "where am
> I", top bar = "what can I do here"); extend the rail to tablet width once Home/Repository/Settings have
> real content worth navigating to on a smaller screen.

**Z2 — Home.** ✓ slice 1 shipped v133: quick-create cards (Blank / Browse examples / Take the tour) +
a "Recent dashboards" grid, each card a live SVG thumbnail (`Studio.makeThumbnail`) that genuinely
reopens the exact dashboard (full spec captured on the auto-save debounce path, capped at 8,
`localStorage["studio-recents"]`). **Z2 follow-ups (not yet done):** favorites/pinning, folders/
organization, branding area, more lively motion + hover life on the cards (currently a simple lift +
border-glow), instructions/how-tos/tips beyond the existing tour link.

**Z3 — Repository (Data Sources + Workbooks).** One "repository" holding **data-source definitions** and
**workbook definitions** (a workbook = a named collection of HTML dashboards). Browse/search/organize into
folders; CRUD; stored locally; import/export the whole repository as JSON. Consolidates the old "data
source library" and "dashboard inventory" ideas into one place.

**Z4 — Data Source library + connectors.** Expand beyond CDA to direct querying of leading providers,
browser-only via each provider's REST/SQL API with locally-saved credentials. Priority connectors:
**Snowflake** (SQL REST API), **Databricks** (SQL Statement Execution API), **BigQuery + cloud
warehouses** (Redshift/Synapse as APIs allow), **generic SQL/HTTP**, and **keep Pentaho CDA** as one
connector among many. Per provider: a config form (account/host/warehouse/token/etc.), a **Test
connection** button, and **brand logos** — make the connector gallery sexy. Note CORS/security realities
(some providers need a token or a thin proxy); surface clear errors. A query authored against any
connector feeds the same dashboard model.

**Z5 — Settings.** App configuration: theme, default deploy target, gate/access, data-source defaults,
and **dashboard style defaults** (standard look/style applied to new dashboards). Support **collections
of named style presets** the user can pick from. Export/import settings as JSON.
> **Surface the app's mode toggles here as first-class, discoverable controls** — **Simple/Advanced mode**,
> **light/dark** (theme mode), **Focus mode**, **Demo mode**, etc. They're currently buried in the ⋯ More
> menu and hard to find (the user couldn't locate Simple mode at all). Use clear, nice toggle switches;
> optionally mirror the key toggles in a **left-menu drawer styled after polecat.live's left drawer** (pull
> that look/feel). Persist all in localStorage.

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
> **Naming model (relocate title editing).** Editing the dashboard name up in the **top bar** (`#dashTitle`)
> now feels out of place with the app shell — move name editing into the **panel/inspector and/or Settings**,
> not the topbar chip. Also separate the two names that are currently conflated: the **object/file name**
> (the stem, e.g. `studio-cost`, used for exports/repository) vs the **dashboard display title** (e.g.
> "Cost Optimization & Sustainability", shown in the header/banner) — they should be independently editable
> fields. Coordinate with the Z1 top-bar cleanup and the Z3 Repository (where objects are named/organized).

**Z7 — Analytics: forecasting + statistical functions.** Move toward standalone analytic apps: add
forecasting (moving average, exponential smoothing / Holt-Winters, linear & seasonal trend) and
statistical functions/variations (regression, percentiles, z-scores, correlation, distributions) as
chart options / derived series / KPI computations. Keep it light (vanilla-JS math, no heavy deps).

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

**Z9 — Mobile: fix the broken flows + a proper bottom nav (user-requested 2026-06-30).** Reported
regressions on small screens: the top button-bar scrolls/slides but **its dropdown menus don't open /
work** — fix that first (touch handlers, menu positioning, tap-outside-to-close). Add a **bottom
navigation** to switch between the Studio's **data-source / canvas / chart-object (inspector)** views on
phones (the three panes become swipeable/tabbed sections). Coordinate with the Z1 shell so the left rail
collapses into a sensible mobile pattern (bottom bar or hamburger sheet). Use **modern flows and
animations** — drawer/sheet motion, tab transitions, momentum — smooth, elegant, and modern (respect
prefers-reduced-motion). Verify with the mobile Playwright checks and ADD a regression test for
"dropdown opens on touch". (There is an older mobile track (B) too — this supersedes/extends it with the
specific bugs + the new-shell mobile behavior.)

**Z10 — App theme system: theme × light/dark (user-requested 2026-06-30).** The new Polecat warm-dark
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

**Z11 — In-app docs: discoverability + continuous upkeep (user-requested 2026-06-30).** The help docs
(`docs/index.html`) exist but are **hard to find** — buried as "Help docs ⓘ" in the ⋯ More menu (the user
couldn't find them). Make them **discoverable**: a **Help/Docs entry in the app shell** (left rail and/or
Home) and **contextual links from features into the relevant doc section** (e.g. a small ⓘ by a feature
deep-links to its docs anchor). And **keep the docs continuously current** — treat `docs/index.html` as a
living in-app reference: whenever a run adds or changes a user-facing feature, update the docs in the SAME
slice (standing responsibility — see Conventions). Style the docs to match the active app theme.

**Z12 — Branding & app identity: de-dup the logo, favicon, Settings option (user-requested; revised 2026-06-30).**
Design direction (best practice — the user wants it clean, not a redundant single letter):
- **Remove the redundant "P" square from the app title / content header.** A bare single-letter box next
  to the full "Analytics Dashboard Studio" wordmark (and next to the rail's own icons) reads as unfinished,
  not branded. Let the styled **wordmark be the identity** in the content header.
- **Anchor app identity at the TOP of the left rail** instead — a small, tasteful brand mark (a considered
  logomark or a compact wordmark lockup, NOT a giant letter), consistent with the Polecat design language.
  That's where persistent identity belongs (cf. Linear / VS Code / Notion); the content area then leads
  with the *dashboard* title.
- **Favicon (still needed — the tab is blank today).** Add a proper **SVG favicon** of the chosen mark
  (inline data-URI or `favicon.svg`), `<link rel="icon">` + `apple-touch-icon` + a tiny `site.webmanifest`
  + matching `theme-color`. Make it a considered themed mark, not a plain letter.
- **Make branding a Settings option (Z5).** A small **Branding** area: choose the default mark, upload a
  custom logo, or "none" — so identity isn't hardcoded and can flex in the future. Ties to the Z5/Z6 style
  presets. Light-weight, no build step; taste over cleverness.

**Z0 — Finish the terminology migration (Phase 2, started 2026-06-30).** Done so far: user-facing
CDA→"Data Access", CDF→"Dashboard Framework"; CDE export removed from the menu/inspector/bundle/push/CLI;
tour/docs/brand updated. Remaining cleanup (one safe slice per loop, keep tests green): delete the now-
unused CDE exporter code (`exportCDE` / `CDE_OK` / `cdeEmittable` / `brandHeaderRows` in exporters.js)
plus its 4 direct unit tests; relabel the Examples gallery "CDE" track badge; finish renaming remaining
user-visible CDF/CDE/CDA strings in `docs/index.html` and inspector/library labels. Keep internal
identifiers, file extensions (`.cda`/`.html`), the `.cdfde` import path, and Pentaho server connectivity intact.

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

## Quality bar
Every iteration: builds, `tests/run.js` green, UI cohesive, README/STATUS updated, commit + push.
Prefer several small, well-tested, shippable improvements over one big risky one.
