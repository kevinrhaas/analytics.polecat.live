# PDC Dashboard Studio — STATUS (hourly-loop resume anchor)

> **RESUME PROTOCOL:** An hourly cron (`37 * * * *`, session job) runs the improvement loop.
> On each fire: read THIS file first, continue from the top **NEXT** item, implement ~1–3 high-value
> improvements, keep the Playwright suite green, update DONE/NEXT here, and **commit + push** to
> `claude/dashboard-studio` (this loop's own branch — separated from the iteration/v2 loop to avoid
> shared-branch churn). One commit per coherent improvement so progress survives.
>
> **PROMPT LOG:** `PROMPTS.md` records the user prompts driving this project (the human-intent
> history). When working an interactive session, **append each new substantive user prompt** to it
> (verbatim + UTC timestamp + a one-line intent/outcome note). The autonomous loop won't receive new
> user prompts, but keep the file accurate if you touch it.
>
> **REFINEMENT CADENCE:** roughly every ~5th run (or whenever the feature backlog is thin), do a
> **track H refinement pass** instead of a new feature — step back and make the app cleaner, more
> logical, more elegant, and more delightful (IA/menus, onboarding, visual polish, code health).
> Small, safe, well-tested slices; never a wild rewrite. This is ongoing, not one-and-done.

> **GOAL:** the best-in-class, sexy, first-class, comprehensive, joy-to-use visual builder for
> Pentaho **CDE & CDF** dashboards over existing **CDA** queries. CDF is the prettier/primary track.

## Environment / how to work
- Project root: `dashboard-studio/`. Plain HTML/JS, no framework, no build step.
- Serve: `./serve.sh` (→ http://localhost:8000). Must be served (fetch); `file://` won't work.
- **Test:** `cd dashboard-studio && NODE_PATH=$(npm root -g) node tests/run.js` (Playwright, global at
  `/opt/node22/lib/node_modules`, Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`).
  Keep it **green**; add a check for each new feature.
- Regenerate catalog/examples from v2: `python3 tools/import-v2.py`.
- One spec drives all: `app/model.js` (registry+helpers) → `app/studio-render.js` (in-iframe render +
  in-canvas editing) ↔ `app/studio.js` (builder) → `app/exporters.js` (CDA/CDE/CDF). `SPEC.md` = schema.
- Preview iframe == exported CDF html (same toolkit inlined). Builder ↔ iframe talk via postMessage
  (`{studio:1,type:select|reorder|resize|...}`).

## Conventions (apply to ALL output, every run)
- **HTML + JS only, light dependencies.** No Java, no Python, no build step, no heavy frameworks, no
  package installs baked into exported artifacts. The vendored toolkit stays self-contained; new chart
  types/features go in `app/studio-charts.js`. Exported files (CDF .html / CDE / .cda / bundle) must
  stay small and dependency-light so the Pentaho team can drop them in anywhere.
- **CDF/CDE compatible.** Anything authored must export and round-trip through the existing exporters.
- **Clean code.** Cohesive modules (model/render/studio/exporters boundaries), consistent style, no dead
  code, no mess.
- **Documented for the Pentaho engineering team.** Add helpful, friendly, supportive comments where a
  human needs orientation — explain the *why* and any non-obvious technique. Concise, not verbose. If
  existing code is thin on comments and a reader would struggle, add brief contextual notes.
- **License.** The Studio is proprietary — see `dashboard-studio/LICENSE` (© Pentaho, created by
  Pentaho Solution Engineering; all rights reserved). Keep the notice intact; don't add OSS license
  headers that contradict it. New first-party source files may carry a one-line header
  (`/* Demonstration Dashboard Studio — © Pentaho (Pentaho Solution Engineering). See LICENSE. */`).
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
  via ⓘ Tour) framing it as a Pentaho SE demo, `CNAME`, `tools/publish-pages.sh` (mirror→own Pages
  repo), `PUBLISH.md` runbook (own-repo Pages + DNS + Cloudflare Access). 82/82.

- v22: **hosting model (user decision)** — source/dev stays in solution-engineering/dashboard-studio;
  the public gated site publishes to its **own repo** (so it doesn't take over solution-engineering's
  Pages). Removed the in-repo Pages workflow; `tools/publish-pages.sh` (mirror→own repo, auto-creates
  via gh) is the path; PUBLISH.md/README lead with it.

- v23: renamed user-facing brand → **Demonstration Dashboard Studio** (gate, welcome, topbar, title,
  export footer). Gate now accepts a **list of access codes** (issue/revoke several); `tools/gen-code.js`
  hashes a code for `app/gate-config.js`. 84/84. (Published live to dashboardstudio-pentaho-space repo.)

- v24: **resizable + collapsible side panels** (drag the handles; collapse to a labeled rail; widths/state persisted), **dark-mode fixes** (library cards & inputs no longer white; brighter accents), and the inspector list-row overlap fix.

- v25: **published live** to `dashboardstudio-pentaho-space` (main @ b0ef1aa) with the v23–v24 changes. `publish-pages.sh` now prefers **rsync** (clean verified `--delete` mirror) and keeps the tar copy only as a fallback (fixes the `tar: Write error` broken-pipe case). Publishing must run from a machine whose network scope reaches the target repo — this sandbox's git proxy is scoped to solution-engineering only.

- v26: **auto-publish CI** — `.github/workflows/publish-dashboard-studio.yml` in solution-engineering
  mirrors `dashboard-studio/` → the Pages repo (main) on every push to main or `claude/**` that
  touches `dashboard-studio/**`, so loop improvements deploy to https://dashboardstudio.pentaho.space
  automatically (needs a one-time `PAGES_DEPLOY_TOKEN` secret with write access to the target repo).
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

## NEXT (top = do first)

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
- **E3. Dashboard thumbnail** — auto-capture a screenshot of the live preview on each spec change; embed as a 100px thumbnail in the Save dialog and examples gallery.
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

### G. Visual data-source builders — author queries visually (user-requested; extends track A)
Goal: a **visual builder for each CDA source type**, plus link/import of existing artifacts, so users
build the data behind dashboards without hand-writing XML/SQL. Slots onto the v31–v38 CDA model.
  G1. **Visual SQL query builder** — pick table(s), columns, joins, WHERE filters, GROUP BY/aggregates,
      ORDER BY, row limit → generate the SQL string (kept editable); detect-columns wires into the
      existing column chips. Round-trips into the SQL DA editor.
  G2. **Basic Kettle (.ktr) transform builder** — a small visual step graph (input → transform → output)
      for the common case (table input → select/filter/calc → rows), emitting/round-tripping a minimal
      `.ktr` for `kettle.TransFromFile` DAs.
  G3. **Link / import existing transforms** — import a `.ktr` (or browse one from the active server) and
      reference it as a Kettle DA; show its steps read-only when full parse isn't feasible.
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

### I. Learn from the iteration/ lab — match & surpass those visuals (user-requested; RECURRING)
The `iteration/` tree (especially `iteration/v2/content/dashboards/` on `main`) is a living lab of
advanced hand-built CDF/CDE dashboards the sibling loop keeps pushing — e.g. network node-click
drill-to-detail (`PDC.openDetail`), info dots, rich CDF layouts and interactions. Periodically (≈ when
doing track-F/visual work) **study the newest examples there and port / improve upon the best
techniques** into Dashboard Studio, so the builder can generate dashboards at least as good as the
hand-built ones — then push past them. Keep everything CDF/CDE compatible and keep the exporters
emitting light, self-contained HTML/JS (see Conventions above — no new runtime deps). Each pass: pick
one technique, generalize it into the Studio model/render/exporters, add a Playwright check, document it
kindly for the Pentaho team, and note it in the changelog.
> **READ-ONLY boundary:** `iteration/**` is the sibling loop's domain — **read it for inspiration, never
> edit it.** This loop writes ONLY under `dashboard-studio/**` (the deploy/workflow files on its own
> branch aside). Never modify files outside `dashboard-studio/**`.

## Quality bar
Every iteration: builds, `tests/run.js` green, UI cohesive, README/STATUS updated, commit + push.
Prefer several small, well-tested, shippable improvements over one big risky one.
