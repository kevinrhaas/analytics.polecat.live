/* js/changelog.js — Analytics Dashboard Studio revision history.
   Published in the shared Polecat fleet format (relay/manager style) so the
   manager.polecat.live "Sync changelog" tool can fetch + parse it. Newest first.

   ── CHANGELOG CONVENTION (follow for EVERY new entry) ──
   • Prepend ONE entry at the TOP: integer `v` (+1 over current top), a friendly
     `title`, optional `kind` ("feature" | "polish" | "fix"), an ISO-8601 UTC
     `ts`, and 1–4 plain `items`.
   • This is an ES MODULE and MUST use relay's LITERAL style: UNQUOTED keys and
     SINGLE-QUOTED strings with apostrophes escaped as \'. The manager parses the
     text (it does NOT run the file) via a single-quote-aware normalizer, so
     double-quoted JSON with raw apostrophes breaks it — keep single quotes.
   • `ts` MUST be real (never fabricated): stamp the actual UTC commit time.
   • Avoid the literal sequence // in item text (the manager strips line comments).
   Exposed as window.STUDIO_CHANGELOG for the in-app footer + "What's new" panel. */
export const CHANGELOG = [
  {
    v: 224,
    title: 'Export milestone toasts',
    kind: 'feature',
    ts: '2026-07-03T01:32:39Z',
    items: [
      'Exporting a dashboard now counts toward a running lifetime total (any format, including single-panel embeds and Push) that quietly celebrates round numbers -- 10, 25, 50, 100, 250 exports -- with a toast and the same spark burst as the first-export moment.',
      'Non-milestone exports stay silent, and the counter is included in Clear local data.',
    ],
  },
  {
    v: 223,
    title: 'Variance + range join the KPI Aggregation picker',
    kind: 'feature',
    ts: '2026-07-03T01:26:25Z',
    items: [
      'A KPI tile bound to a multi-row query can now aggregate as Variance or Range (max minus min), alongside the existing Sum/Average/Median/percentiles/Std deviation/Z-score/Correlation — closes out the Z7 "distribution computations" backlog item.',
      'Same pure Studio.aggregate() math (model.js) plus its exported-runtime twin in studio-render.js, so the new aggregations work identically in the live preview and every exported Dashboard Framework file.',
    ],
  },
  {
    v: 222,
    title: 'Rotate-labels toggle gets a visual hint too',
    kind: 'polish',
    ts: '2026-07-03T00:43:56Z',
    items: [
      'The "Rotate labels" toggle (bars, stacked, groupedBars, barNorm) now carries a hint glyph — "Tilts the axis labels diagonally so long category names fit without overlapping." Closes out the Z8 inline-hint sweep\'s last sizeable option family.',
    ],
  },
  {
    v: 221,
    title: 'More option families get inline visual hints',
    kind: 'polish',
    ts: '2026-07-03T00:35:55Z',
    items: [
      'Extends the v220 hint map to Show value labels, Show \'element\' labels, and Show % toggles — three more families that repeat across a dozen+ chart types (bars/stacked/groupedBars, sunburst/chord/network/treemap/icicle/polarArea/packedBubble, funnel/treemap/marimekko/icicle/barNorm).',
      'Two new glyphs (tag, percent) in app/icons.js, reusing the same OPT_HINTS mechanism — no per-chart-type work needed.',
    ],
  },
  {
    v: 220,
    title: 'Inline visual hints for common chart-option toggles',
    kind: 'polish',
    ts: '2026-07-03T00:34:42Z',
    items: [
      'Sort by value, Show legend, Smooth curve, and Show data points toggles now carry a small glyph next to their label — hover it for a one-line plain-English explanation. These option keys repeat across a dozen-plus chart types, so one shared hint map covers most of the dense inspector at once.',
      'First cut of the Z8 "inline visual setting hints" follow-up; more option families can be added to the same map over time.',
    ],
  },
  {
    v: 219,
    title: 'Smart chart recommender',
    kind: 'feature',
    ts: '2026-07-03T00:28:27Z',
    items: [
      'Once a panel has a query bound, a "Recommended for this data" strip appears above the chart-type gallery with 1–3 suggested types — Line for a date column + a number, Donut for a low-cardinality category, Scatter for two numeric columns, Table for a wide query, and so on.',
      'Each recommendation chip explains its "why" on hover and switches the chart type with one click. Pure client-side heuristics, no API call — Studio.recommendCharts() in model.js.',
    ],
  },
  {
    v: 218,
    title: 'Style presets now carry a default header logo too',
    kind: 'feature',
    ts: '2026-07-02T23:43:40Z',
    items: [
      'The Settings "Dashboard defaults" card gains a Default header logo upload — seeds every new blank dashboard\'s Header logo field, same as the existing default subtitle + accent color.',
      'Style presets now snapshot the logo alongside subtitle + accent, and show a small thumbnail instead of a plain color swatch when one is saved. Closes the last "still open" item under the Z6 style-preset collection.',
    ],
  },
  {
    v: 217,
    title: 'Scatter charts now explain their own correlation',
    kind: 'feature',
    ts: '2026-07-02T23:29:55Z',
    items: [
      'A Scatter / bubble panel\'s "Insight" section now reports the Pearson correlation between its bound X and Y columns in plain English (e.g. "a strong positive correlation, r = 0.82") instead of the single-series trend narration other chart types get.',
      'Computed client-side, no API key or network call. (Landed alongside a second, independent take on correlation below — the KPI Aggregation picker\'s new "Correlation" option — since both were built the same hour; keeping both, they serve different panel types.)',
    ],
  },
  {
    v: 216,
    title: 'Fix: a rare live-preview crash when a query was missing sample data',
    kind: 'fix',
    ts: '2026-07-02T23:53:29Z',
    items: [
      'The in-app live preview could silently fail to render a chart or KPI whenever its query had no matching sample/mock data, because of how browsers report the address of a live preview window internally.',
      'This never affected real published dashboards, only the in-app preview while building.',
    ],
  },
  {
    v: 215,
    title: 'Correlation KPIs',
    kind: 'feature',
    ts: '2026-07-02T23:40:58Z',
    items: [
      'The KPI "Aggregation" picker gains a Correlation option — the Pearson correlation coefficient (-1..1) between the Value column and a second series.',
      'Reuses the existing Compare to section\'s Compare column field as that second series, so no new UI section was needed.',
    ],
  },
  {
    v: 214,
    title: 'Fix: KPI Aggregation could crash the whole dashboard preview',
    kind: 'fix',
    ts: '2026-07-02T23:23:20Z',
    items: [
      'Any KPI using the "Aggregation" picker (Sum / Average / Median / min / max / percentile / std deviation / Z-score, added a few versions back) referenced a builder-only helper that was never included in the actual exported/preview HTML — silently breaking rendering for every KPI on the dashboard, not just the aggregated one, in both the live preview and every real export.',
      'Fixed by giving the exported bundle its own self-contained copy of the aggregation math, matching how every other runtime helper in that file already works.',
    ],
  },
  {
    v: 213,
    title: 'Named style presets in Settings',
    kind: 'feature',
    ts: '2026-07-02T22:39:35Z',
    items: [
      'The Dashboard defaults card in Settings now has a "Style presets" list — save the current default subtitle + accent color as a named preset (e.g. one per client), then switch your active default with one click.',
      'Presets are included in Settings export/import and Clear local data, same as every other preference.',
    ],
  },
  {
    v: 212,
    title: 'Explain this chart: auto-insight narration',
    kind: 'feature',
    ts: '2026-07-02T22:32:20Z',
    items: [
      'Any chart panel bound to a value column now shows an "Insight" section in its inspector: a short, plain-English read on the trend direction, the single biggest point-to-point move, and any statistical outlier in that panel\'s own sample data.',
      'Computed entirely client-side with plain JS math — no API key, no network call, nothing to configure.',
    ],
  },
  {
    v: 211,
    title: 'Export a single panel as a standalone embed',
    kind: 'feature',
    ts: '2026-07-02T22:08:18Z',
    items: [
      'Every panel inspector now has an "Export this panel…" action that downloads a tiny, self-contained .html widget with just that one chart — no other panels, KPIs, or filters — using the exact same exporter as a full dashboard.',
      'Handy for embedding a single chart somewhere a full dashboard would be overkill.',
    ],
  },
  {
    v: 210,
    title: 'A small celebration for your first export',
    kind: 'polish',
    ts: '2026-07-02T22:02:17Z',
    items: [
      'The first time you ever export a dashboard from this browser — Dashboard Framework, Data Access, bundle, or Push — you get a one-time "First export!" toast and a brief, tasteful spark burst. It never repeats after that.',
      'Respects prefers-reduced-motion (the toast still shows, the burst is skipped) and is included in Settings\' "Clear local data" reset.',
    ],
  },
  {
    v: 209,
    title: 'Dashboard banner can now link out (Header link URL)',
    kind: 'feature',
    ts: '2026-07-02T21:55:26Z',
    items: [
      'A new "Header link URL" field in the Dashboard inspector (right below Header logo) wraps the banner\'s logo + title in a link that opens in a new tab — handy for pointing back to a company site or portal.',
      'Leave it blank and the banner stays plain, non-clickable text, exactly as before.',
    ],
  },
  {
    v: 208,
    title: 'Command palette can now add a panel of any chart type',
    kind: 'feature',
    ts: '2026-07-02T21:36:30Z',
    items: [
      'Every entry in the 51-type chart gallery (bars, waterfall, sankey, ridgeline, …) is now its own "Add panel: <type>" command in ⌘K/Ctrl-K — search for the type you want and it drops a new panel bound to a catalog query, already set to that type.',
      'It drives the exact same UI a click would (a data-source card\'s quick-add chip, then the panel\'s own chart-type gallery card) — no new business logic, so it can never drift out of sync with the builder.',
    ],
  },
  {
    v: 207,
    title: 'KPI tiles gain a Z-score aggregation',
    kind: 'feature',
    ts: '2026-07-02T21:36:30Z',
    items: [
      'The KPI "Aggregation" picker (Z7 statistical computations) adds Z-score: how many standard deviations the most recent row sits from the bound query\'s mean — a quick "is this normal?" read for anomaly-flavored tiles, no separate query needed.',
      'Docs updated to describe the full Aggregation picker (was undocumented since it shipped).',
    ],
  },
  {
    v: 206,
    title: 'Changelog now parses in the fleet manager — matched relay\'s exact literal style',
    kind: 'fix',
    ts: '2026-07-02T20:57:12Z',
    items: [
      'The manager.polecat.live "Sync changelog" tool kept reporting "couldn\'t parse its contents" even though our file was public, on main, an ES module, and served with open CORS. Root cause found by reading the manager\'s own ingest.js: it does not run the file — it extracts the CHANGELOG array as text and normalizes it to JSON with a single-quote-aware pass.',
      'Our entries were strict JSON (double-quoted) with raw apostrophes (manager\'s, doesn\'t, …); the manager\'s single-quote requoter mis-read those apostrophes as string delimiters and corrupted the JSON. Re-emitted the whole changelog in relay.polecat.live\'s exact literal style — unquoted keys, single-quoted strings with escaped apostrophes — which its normalizer expects.',
      'Verified by running the manager\'s actual parser (extractArrayLiteral + jsLiteralToJSON) locally against our file: all releases now parse cleanly. The in-app footer and "What\'s new" panel are unchanged.',
    ],
  },
  {
    v: 205,
    title: 'Accessibility fix: every dialog\'s × close button now has a name',
    ts: '2026-07-02T20:33:00Z',
    items: [
      'Screen readers previously announced the × close button on **every builder dialog** (New data source, Connections, Join builder, Keyboard shortcuts, and more) as just "button" — no indication of what it does. It now reads e.g. "Close New data source", matching the other close buttons in the app (changelog, panel zoom, slideshow) that already did this right.',
      'One shared fix in the `modal()` helper covers every dialog built on it — found during a periodic accessibility sweep (Track L).',
      '2 new tests. Test suite 964/964.',
    ],
  },
  {
    v: 204,
    title: 'KPIs can now show a real statistic, not just a raw value',
    ts: '2026-07-02T20:31:00Z',
    items: [
      'Every KPI tile gets a new **Aggregation** option: leave it on "First row" (unchanged default), or compute **Sum, Average, Median, Min, Max, 90th/95th percentile, or Standard deviation** across every row its query returns — bind a KPI straight to a detail-shaped query ("p90 response time", "median deal size") without writing a separate aggregate SQL query for it.',
      'First slice of Z7\'s "statistical functions" half (forecasting already covered moving-average/trend/Holt) — `Studio.aggregate()` is a small, independently testable pure function.',
      '7 new tests. Test suite 962/962.',
    ],
  },
  {
    v: 203,
    title: 'Command palette remembers what you actually use',
    ts: '2026-07-02T20:28:00Z',
    items: [
      '⌘K/Ctrl-K search now leads with your **most-recently-run commands** when you open it with an empty search — the classic command-palette pattern, so your go-to actions (New dashboard, Export, whichever section you live in) surface first instead of always starting at the top of a fixed list.',
      'When you do type a search, commands you\'ve run before get a small tie-breaking boost among equally-relevant matches — never enough to outrank a better text match, just enough to favor your habits.',
      'Nothing to configure — it\'s a small local usage history (`studio-cmdk-usage`), cleared by Settings\' "Clear local data".',
      '3 new tests. Test suite 955/955.',
    ],
  },
  {
    v: 202,
    title: 'Changelog is now an ES module (const CHANGELOG) so the manager can import it',
    kind: 'fix',
    ts: '2026-07-02T20:42:40Z',
    items: [
      'The fleet "Sync changelog" manager imports the CHANGELOG **export** (like relay.polecat.live), but our file only defined a bare `const` — so it still reported "couldn\'t parse its contents" even though the site was public, on main, and served with open CORS. js/changelog.js is now a proper ES module: `const CHANGELOG` + `const LATEST_VERSION`, loaded via `<script type="module">`.',
      'Verified it imports cleanly as an ES module (Node `import { CHANGELOG }` returns all entries), so the manager\'s importer can now read it. The in-app footer + "What\'s new" panel are unaffected — the module still sets window.STUDIO_CHANGELOG for the classic-script app shell, and it runs before the footer\'s async render.',
    ],
  },
  {
    v: 201,
    title: 'Changelog now matches the fleet format — syncable by the Polecat manager',
    ts: '2026-07-02T20:27:33Z',
    items: [
      'Reshaped js/changelog.js into the shared fleet format used by manager.polecat.live and relay.polecat.live so the manager\'s "Sync changelog" tool can fetch and parse it (it previously reported "found a CHANGELOG array but couldn\'t parse its contents").',
      'Each release is now a plain-JSON object with an integer `v`, a `title`, an optional `kind`, an ISO-8601 UTC `ts`, and `items[]` — exposed as a `CHANGELOG` array (aliased to window.STUDIO_CHANGELOG for the in-app panel). The in-app footer and "What\'s new" sheet render identically; only the data shape changed.',
      'Backfilled all prior entries into the new shape (integer versions, ISO timestamps) in one pass, and recorded the format as a standing convention so the hourly loop keeps every future entry syncable.',
    ],
  },
  {
    v: 200,
    title: 'A tidier toolbar: the ¶ Text button moved home',
    ts: '2026-07-02T19:39:00Z',
    items: [
      'The **¶ Text** button (adds a text/annotation panel) used to sit alone on the live-preview toolbar, next to hints like "drag to reorder" — it now lives in the **Query Library** header beside **＋ New source**, since both are really the same kind of action: adding something new to your dashboard.',
      'Same button, same shortcut, same behavior — just a cleaner home. The live-preview toolbar is simpler too.',
      'No new tests needed beyond a placement check (1 added). Test suite 952/952.',
    ],
  },
  {
    v: 199,
    title: 'Forecasting: Holt exponential smoothing joins the linear trend line',
    ts: '2026-07-02T19:29:00Z',
    items: [
      'Line/area charts\' **Show trend / forecast line** now offers a **Forecast method** choice: the existing linear regression, or **Holt\'s exponential smoothing** — a level + trend that tracks recent moves in the data instead of just fitting one straight slope across everything, then projects forward the same way for the forecast periods.',
      'Two new tuning fields (Holt only): **Smoothing level α** and **Smoothing trend β**, both 0–100%, controlling how quickly the forecast reacts to new data vs. staying stable.',
      'Third slice of the Z7 forecasting track (after moving-average and linear trend/forecast). 3 new tests. Test suite 951/951.',
    ],
  },
  {
    v: 198,
    title: 'Z10 follow-up: the passcode gate now follows your theme too',
    ts: '2026-07-02T19:22:00Z',
    items: [
      'The access-passcode screen (shown before you\'re signed in) was the one surface still stuck on fixed Classic-Blue-light colors even after the welcome tour, tutorial, and command palette were themed back in v181 — now it reads your saved Color theme (Classic Blue / Polecat) and light/dark mode before it even draws, so it matches the rest of the app from the very first paint instead of flashing the old look and re-theming after sign-in.',
      '1 new regression test. Test suite 948/948 at the time of this slice.',
    ],
  },
  {
    v: 197,
    title: 'Changelog now published the polecat way — /js/changelog.js + real timestamps',
    ts: '2026-07-02T18:55:00Z',
    items: [
      'The update history now lives at the conventional **/js/changelog.js** (matching relay.polecat.live and games.polecat.live) instead of app/changelog.js, so it sits alongside the rest of the Polecat family at a predictable URL.',
      'Adopted the house rule that **changelog timestamps are real, never fabricated** — each new entry is stamped with the actual UTC commit time (this entry\'s 18:55 UTC is the true time it was written), fixing the previously hand-typed/guessed times.',
      'No user-facing behavior change to the app itself — same in-app Changelog panel, just published in the shared convention. The full mobile-friendly "What\'s new" sheet (like relay\'s) is queued as mobile slice m-e.',
    ],
  },
  {
    v: 196,
    title: 'N-FUN: Build-completeness meter',
    ts: '2026-07-02T21:05:00Z',
    items: [
      'A small, game-like **Build progress** ring + checklist now sits at the top of the Dashboard inspector (below the layout thumbnail, above Checks): five gentle milestones — a real title, a panel, a KPI, a filter, and a touch of your own style (accent color, series palette, or header logo). Purely encouraging, never a warning (an empty dashboard is perfectly valid) — collapses to a one-line "nice work" note once every milestone is met, so it never nags a finished dashboard.',
      '`Studio.dashboardCompleteness(spec)` in model.js is a small pure function (5 checks in, `{done,total,items}` out) so the scoring logic is unit-testable on its own, separate from the DOM. Distinct from the existing `Studio.validate()` (Checks section) which only flags real problems.',
      'Theme-aware via the existing `--pentaho`/`--line-2`/`--ink`/`--faint` custom properties — the ring and text read correctly in all four Classic/Polecat × Light/Dark combinations for free.',
      'First slice from the Track N innovation backlog\'s N-FUN list ("Build-completeness meter + gentle achievements"). 3 new tests. Test suite 947/947.',
    ],
  },
  {
    v: 195,
    title: 'Track L: two real bugs found in an architecture sweep',
    ts: '2026-07-02T20:35:00Z',
    items: [
      '**Duplicated timeout helper** — `withTimeout()` was defined as a byte-identical private copy in both `app/duckdb.js` and `app/sqlitehttp.js`. Consolidated into `Studio.withTimeout()` in model.js, alongside `Studio.friendlyConnectorError()` (the same connector pair\'s other shared helper, extracted back in v170) — the two browser-native connectors can no longer drift on timeout-message wording.',
      '**Real DOM-duplication bug** — the CDA Connection editor\'s Save button called `renderDashboardInspector(body)` directly, which never clears `body` itself; saving a connection appended a second full copy of every dashboard-inspector section on top of the first instead of replacing it. This is the exact bug class the v193 Z6 kickoff already found and fixed at three other self-redraw call sites (accent-color swatches, palette swatches, connection delete) — this fourth call site was missed. Routed through the top-level `renderInspector()` instead, and dropped the now-dead `dashBody` parameter it was threading through `addCDAConnection()`/`openConnEditor()`.',
      '1 new regression test (save a connection, assert exactly one \'CDA Connections\' and one \'Dashboard\' section survive, not two). Test suite 944/944.',
    ],
  },
  {
    v: 194,
    title: 'Z6/Z5 follow-up: dashboard defaults (subtitle + accent color)',
    ts: '2026-07-02T20:05:00Z',
    items: [
      'New "Dashboard defaults" card on the Settings page: a **Default subtitle** field and a **Default accent color** picker (the same swatches used by the per-dashboard Accent color field). Both are applied automatically to every brand-new **Blank dashboard** (Home\'s quick-create card or New ▾ → Blank dashboard) — a first slice of the Z6/Z5 "style-preset" ask so a team\'s house tagline/brand color doesn\'t need retyping each time. Existing dashboards, examples, and imports are never touched.',
      'Factored the dashboard inspector\'s inline accent-color preset list out into a shared `Studio.THEME_PRESETS` (model.js) so the per-dashboard picker and the new Settings default picker can\'t drift apart. Settings\' own swatches use a distinct `.set-accent-swatch`/`.set-accent-presets` class pair (same look, shared CSS) rather than reusing `.accent-swatch` directly, so document-wide swatch queries elsewhere can\'t accidentally pick up Settings\' copies.',
      'Found and fixed a real pre-existing gap while wiring this up: "Clear local data" was missing several keys already tracked by Settings export/import (`studio-app-theme`, `studio-shell-section`, `studio-shell-expanded`, `studio-default-jndi`) — clearing local data left stale app-theme/rail-section/JNDI-default state behind. Added the missing keys, plus the two new default keys, to the clear list.',
      'New keys included in Settings export/import. 3 new regression checks (card renders + defaults empty, saving both persists + is exported, a brand-new blank dashboard actually picks them up). Test suite 943/943.',
    ],
  },
  {
    v: 193,
    title: 'Z6 kickoff: per-dashboard header logo',
    ts: '2026-07-02T18:07:00Z',
    items: [
      'New **Header logo** field in the Dashboard inspector (below Subtitle): upload a PNG/JPG/SVG (≤200KB) that replaces the default "P" mark in the banner, in both the live preview and the exported Dashboard Framework — lives in `spec.headerLogo` so it travels with the dashboard itself (Save/Open/Export/Import), distinct from the Z12 app-wide rail branding.',
      'Found and fixed two real pre-existing bugs while shipping this: `normalize()` (every Open / restore-banner / example-load route) whitelisted only 7 top-level spec keys, silently stripping a saved dashboard\'s `themeColor` and `paletteKey` back to defaults on every reopen; and several of the dashboard inspector\'s own self-triggered re-renders were appending a second full copy of every section instead of replacing it.',
      '6 new tests. Test suite 940/940.',
    ],
  },
  {
    v: 192,
    title: 'Z10 follow-up: theme the welcome tour + tutorial + command palette',
    ts: '2026-07-02T17:42:00Z',
    items: [
      'Converted `app/welcome.js`\'s fixed-hex style block to the shared `--pentaho`/`--pdc`/`--ink`/`--pane` custom properties, so the first-run tour now follows both light/dark mode and the Classic Blue/Polecat app theme instead of always rendering Classic-Blue-only.',
      'Found and fixed a real latent bug in `app/tutorial.js`: its spotlight ring/tooltip had `body.dark-mode`/`body.dark` override rules that never matched anything (this app\'s dark mode is `[data-theme=\'dark\']` on `<html>`, not a body class) — the interactive tutorial had rendered light-only in dark mode since it shipped. Also fixed `app/palette.js` (⌘K) referencing a nonexistent `--text` custom property.',
      '2 new tests. Test suite 934/934.',
    ],
  },
  {
    v: 191,
    title: 'Z10 kickoff: app theme system — Classic Blue vs Polecat',
    ts: '2026-07-02T17:33:00Z',
    items: [
      'New `[data-app-theme]` attribute on `<html>` (`classic` default | `polecat`), orthogonal to the existing light/dark mode toggle — each color theme carries its own light **and** dark variant, so all four combinations (Classic×Light, Classic×Dark, Polecat×Light, Polecat×Dark) are real, coherent palettes. Polecat reuses the plum-black/cream/terracotta rail palette so the whole builder reads as one identity.',
      'New **Color theme** picker in Settings → Appearance; persisted, included in Settings export/import + Clear local data. Exported/preview dashboards are deliberately untouched (decoupled from app chrome).',
      '4 new tests. Test suite 932/932.',
    ],
  },
  {
    v: 190,
    title: 'Z5 follow-up: data-source defaults',
    ts: '2026-07-02T19:35:00Z',
    items: [
      'New "Data source defaults" card on the Settings page with a **Default JNDI connection** field. Every brand-new data source you create (＋ New source in the library) now pre-fills its Connection field from this setting instead of the built-in "PDC-BIDB-EXT" placeholder — handy for teams with their own standard connection pool who\'d otherwise retype it every time.',
      '`defaultJndi()`/`setDefaultJndi()` helpers in studio.js persist the value to `localStorage["studio-default-jndi"]`, added to the existing Settings export/import key list so it travels with the rest of your preferences.',
      '3 new regression checks (field present and defaults correctly, changing it persists + is exported, a new data source actually pre-fills from it). Test suite 928/928.',
    ],
  },
  {
    v: 189,
    title: 'Z9 follow-up: dropdown-menu motion polish',
    ts: '2026-07-02T19:20:00Z',
    items: [
      'Every topbar dropdown (New ▾, Examples ▾, Export ▾, ⋯ More) used to hard-cut open/closed via `display:none`/`block`, which can\'t be animated. They now fade in and rise slightly (opacity + transform, .14s ease) instead — a small but real bit of the "modern flows and animations" the Z9 mobile/tablet track called for.',
      'Closed menus stay genuinely non-interactive: `pointer-events:none` while faded out, and `visibility:hidden` kicks in only after the fade-out finishes (via a delayed transition), so there\'s no invisible click-catcher sitting over whatever\'s behind it.',
      '`prefers-reduced-motion: reduce` disables the transition entirely, same convention as every other animation in the app. Desktop/tablet chrome only — the mobile drawers/sheets already have their own dedicated open/close motion.',
      '3 new regression checks (closed state is invisible + non-interactive but still has a transition, open state is fully visible + interactive after the transition settles, reduced-motion disables it). Test suite 925/925.',
    ],
  },
  {
    v: 188,
    title: 'Z3 follow-up: full CRUD from the Repository page',
    ts: '2026-07-02T19:05:00Z',
    items: [
      'Every data-source card in the Repository section now has hover-revealed ✎ edit / 🗑 delete actions (always-visible on touch devices) alongside its existing open-in-library button — previously editing/deleting an authored data source required switching to Studio\'s own library pane first.',
      'Both actions call the exact same `dataSourceBuilder()` and `deleteDataSource()` functions the Studio library already uses, so Repository and Studio never disagree about a data source\'s state — one source of truth, no parallel edit path.',
      'The card\'s outer element changed from a `<button>` to a plain wrapping `<div>` with an inner `.repo-ds-open` button, since a `<button>` can\'t nest another `<button>` once there are separate edit/delete actions to click independently.',
      '3 new regression checks (edit + delete actions present, edit opens the pre-filled builder modal, delete removes the source from the catalog and the card). Test suite 922/922.',
    ],
  },
  {
    v: 187,
    title: 'Z7 forecasting slice 2: linear trend / forecast line for line & area charts',
    ts: '2026-07-02T18:50:00Z',
    items: [
      'Line/area charts gain a **Show trend / forecast line** toggle + **Forecast periods ahead** field, alongside the existing v179 moving-average overlay. Where the moving average smooths the real data, this draws a genuine linear-regression (OLS) projection per series — useful for "where is this headed" at a glance.',
      'When forecast periods > 0, the chart\'s x-scale widens to make room for a forecast tail: real data points compress slightly, muted "+1/+2/…" tick labels appear past the last real point, and a dashed "Forecast →" separator marks where real data ends and the projection begins. With 0 forecast periods it\'s simply a trend line spanning the existing data.',
      '`trendOf()` helper in `studio-charts.js` computes the regression (pdc-ui.js stays pristine, same override pattern as the rest of the Z8/Z7 per-type option work). 3 new regression checks (off by default; on draws a dashed `.trend-line` with correct OLS endpoints; forecastPeriods extends it and adds the forecast ticks/separator). Test suite 919/919.',
    ],
  },
  {
    v: 186,
    title: 'MOBILE (m-e follow-up): changelog stretches into a true full-screen sheet + touch reliability fix',
    ts: '2026-07-02T18:10:00Z',
    items: [
      'Builds on v185\'s ✕ Close button with the rest of the reference "What\'s new" sheet treatment: on phones (≤640px) the changelog now stretches to a near-full-screen sheet (clearing the topbar above and the tab bar/status bar below) instead of a small floating box anchored above the tab bar, which read as easy-to-miss empty space.',
      'Also found a real reliability gap in the existing tap-outside-to-dismiss: it only bound `mousedown`, which mobile Safari doesn\'t reliably synthesize from a touch tap (headless Chromium always looked fine, masking it) — now also binds `touchstart`, so outside-tap dismiss works consistently on a real device, not just in the sandbox. Desktop\'s small anchored popover is unchanged.',
      '2 new regression checks (sheet fills most of the viewport height; the ✕ Close button actually dismisses it), plus a specificity fix found while verifying: the mobile close-button sizing rule needed to be scoped `#changelogPop .cl-close` to beat the later unconditional base `.cl-close` rule at equal specificity — the same "later same-selector rule silently wins" bug class m-b/m-c hit earlier. Test suite 916/916.',
    ],
  },
  {
    v: 185,
    title: 'MOBILE (m-e): changelog/Help reachability audit + explicit ✕ Close on the changelog sheet',
    ts: '2026-07-02T17:55:00Z',
    items: [
      'Audited the last item on the mobile TOP PRIORITY list — "What\'s new"/changelog + Help reachable on a phone. Good news: both were already mostly working once the m-b `100dvh` fix landed earlier this run — the footer\'s Changelog button sits on-screen at 390px (it was only ever hidden behind iOS Safari\'s toolbar, which m-b fixed at the root), and Help is present and reachable inside the m-a slide-in drawer.',
      'The one real gap against the reference "What\'s new" sheet design: the changelog popup had no visible dismiss control, relying only on tap-outside or Escape — awkward on a full-width phone sheet where there\'s no obvious "outside" to tap and no keyboard to press Escape on. Added an explicit ✕ Close button (36px tap target at phone width) wired to the exact same close path as tap-outside/Escape, so all three ways to dismiss stay in sync.',
      '**This closes out the mobile TOP PRIORITY track (m-a through m-e), all shipped and code-level verified this run.** Headless Chromium has no browser toolbar, so it can\'t reproduce the original iOS bug directly — the mobile track now needs a real-device check: reload analytics.polecat.live on an actual iPhone and confirm the drawer, bottom bars, every topbar action, and the changelog/Help sheets all work as expected.',
      '5 new regression checks. Test suite 914/914.',
    ],
  },
  {
    v: 184,
    title: 'MOBILE (m-d): tab bar was blocked by the drawer scrim — Library→Inspector took two taps',
    ts: '2026-07-02T17:45:00Z',
    items: [
      '`#mobile-tabs` (the Library · Canvas · Inspector bottom bar) was styled `z-index:25` but never given an explicit `position` — z-index is a no-op on statically-positioned elements, so that line did nothing. Whenever a drawer (Library or Inspector) was open, `#mobile-scrim` (z-index:35, covers the full viewport by design) sat visually and functionally on top of the tab bar, intercepting every tap on it.',
      'The tab-switch JS already fully supported jumping directly from one open drawer to the other in a single tap — the scrim\'s stacking order was the only thing in the way, silently turning that into two taps (tap the scrim to dismiss, then tap the tab you actually wanted). Fixed with `position:relative;z-index:37` on `#mobile-tabs`, placing it above the scrim; the scrim\'s own tap-to-close-to-Canvas behavior is unaffected.',
      'Also audited panel touch ergonomics on the canvas (⧉ duplicate / × delete / ↗ zoom buttons, drag handles) — already correctly handled by prior M3 work (`@media(pointer:coarse)` makes them always-visible with 36-40px targets, shared by the live preview and every export), so no changes were needed there.',
      '3 new regression checks (Library opens via tab, direct Library→Inspector switch with no intermediate dismiss tap, scrim-tap-to-close still works). Test suite 909/909.',
    ],
  },
  {
    v: 183,
    title: 'MOBILE (m-c): hamburger was covering the brand + 3 section headings, ⋯ More scrolled off-canvas',
    ts: '2026-07-02T17:35:00Z',
    items: [
      '**Found the same bug class as m-b in three more places** — a later CSS rule targeting the same selector was silently overwriting an earlier one\'s fix, because both rules have equal specificity and \'last in the file wins.\' `#topbar{padding-left:52px}` (clearance for the hamburger) was clobbered back to `12px` by an unrelated, later `#topbar{padding:0 12px}` rule, so the \'Analytics Dashboard Studio\' wordmark rendered partly UNDER the hamburger button. Fixed by folding the 52px clearance into that later rule instead of leaving it as a separate, earlier one — one source of truth per property.',
      '**The exact same clobber hit `.home-wrap`, `.repo-wrap`, and `.settings-wrap`** — their `≤640px` rules reset `padding-top` back to `28px` (from the `60px` an earlier `≤900px` rule set), so **Home**, **Repository**, and **Settings** all had their H1 heading rendered under the hamburger on phones specifically (tablets were fine, since only one rule applied there). All three now keep `padding-top:60px` at phone width too.',
      '**⋯ More was unreachable** — even after hiding secondary buttons, the topbar\'s remaining essentials (Undo/Redo/New/Export/More) still overflowed a 390px bar, and `#btnMore` — the escape hatch to every other action, including the phone-only Examples/Open/Save/Sign out/Clear-data items — scrolled fully off-canvas with no on-screen hint it existed. Pinned it `position:fixed` to the top-right corner (same treatment as the hamburger) with an opaque background (its normal translucent tint was nearly invisible floating over other scrolled content) so it\'s always on-screen, tap-away, regardless of scroll position.',
      '**Repository data-source cards overflowed 17px past the phone viewport** — a long data-source id inside a flex row with no `min-width:0` blocked `text-overflow:ellipsis` from ever engaging, forcing the whole 100%-wide card wider than its column and clipping the kind badge (SQL/MDX/etc.) off the right edge.',
      '11 new regression checks (brand/hamburger overlap, all three section headings, ⋯ More on-screen + clickable at both scroll extremes, card-fit). Test suite 906/906.',
    ],
  },
  {
    v: 182,
    title: 'MOBILE (m-b): fix the killer bug — bottom bars hidden behind the iOS Safari toolbar',
    ts: '2026-07-02T17:20:00Z',
    items: [
      '**Root-caused and fixed the mobile \'killer bug\':** `#app{height:100vh}` measures iOS Safari\'s LAYOUT viewport (as if the toolbar were hidden), which is taller than what\'s actually visible while the toolbar is showing. Since `body`/`html` clip overflow with nothing to scroll, that extra height pushed `#mobile-tabs` (Library·Canvas·Inspector) and `#statusbar` (footer/changelog) — the last two flex children of `#appMain` — below the real fold on a real phone, even though headless-Chromium tests (no toolbar) never saw a problem.',
      'Switched to `#app{height:100vh;height:100dvh}` — the `100vh` fallback stays first for browsers without `dvh` support, and `100dvh` (dynamic viewport height) tracks the actually-visible area live as the toolbar shows/hides. Added `viewport-fit=cover` to the `<meta viewport>` tag (required before any `env(safe-area-inset-*)` resolves to a nonzero value on iOS) and padded `#statusbar` — the true bottom-most element, below `#mobile-tabs` — with `env(safe-area-inset-bottom)` at phone width so it clears the home-indicator strip instead of running under it.',
      'Added `tests/mobile-shot.js`, a standalone screenshot helper (390×844, real-iPhone user agent) for the loop to actually **view** each mobile slice rather than trust DOM/`display` checks alone — the whole reason this bug shipped unnoticed. Since headless Chromium has no toolbar to hide behind, the 3 new regression checks guard the fix\'s *source* (viewport meta, the `100dvh` rule, the safe-area padding) rather than pixel positions headless can\'t reproduce; a real-device check from the user is still needed to fully close out m-b. Test suite 898/898.',
    ],
  },
  {
    v: 181,
    title: 'MOBILE (m-a): the left-nav rail becomes a slide-in drawer on phones/tablets',
    ts: '2026-07-02T17:05:00Z',
    items: [
      '**Fixes the #1 mobile complaint — there was no way to navigate on a phone.** The app-shell rail (Home · Repository · Studio · Settings) was `display:none` below 900px, so sections were unreachable. It\'s now a **slide-in left drawer** (Relay-style): a hamburger button (top-left, always reachable) slides it in over a dimmed scrim; tapping a section, the scrim, or Esc closes it. Full labels show in the drawer.',
      '**Sections now switch full-screen on mobile** — the shell no longer force-pins Studio at ≤900px, so Home / Repository / Settings actually open on a phone. `app/shell.js` injects `#mobileNavBtn` and manages open/close (reusing the shared `#mobile-scrim`); `app/studio.css` turns `#railNav` into a fixed off-canvas drawer with `env(safe-area-inset-bottom)` padding. Desktop is completely unchanged.',
      'Verified **visually at 390×844** (drawer open + Repository rendering full-screen), not just via DOM assertions — the process fix for mobile work, since headless Chromium can\'t see iOS Safari\'s chrome. 6 new tests (hamburger visible, drawer open/close, section switch, scrim-tap close); updated the now-obsolete Z1 phone test that asserted the old hidden-rail behavior. Test suite 895/895. **Next mobile slice (m-b): the iOS Safari toolbar hides the bottom tab bar + footer — needs `100dvh`/safe-area fixes and a real-device check.**',
    ],
  },
  {
    v: 180,
    title: 'Track L: harden flaky fixed-timeout preview-iframe reads in the test suite',
    ts: '2026-07-02T16:55:00Z',
    items: [
      'Test-only, no product change. Added a reusable in-page poll helper (`window.__waitForPreview`) that re-reads a fresh `#preview` contentDocument on every tick until a predicate matches or a timeout elapses, then converted all 21 sites in `tests/run.js` that used to `await` a fixed `setTimeout` before reading the preview iframe — those raced the async postMessage-driven re-render and could intermittently see stale or empty content on a slower machine, even though CI\'s faster machine usually masked it.',
      'Each converted predicate waits for something specific to the NEW render (a unique panel title, a value that only appears post-change) rather than \'any content\' — a naive \'element exists\' poll would have resolved instantly against the *previous* test\'s still-live DOM in several cases, which would have been a subtler regression than the fixed wait it replaced. Also hardened \'canvas × deletes a panel\' (same class of bug, a different async boundary) with `page.waitForFunction` polling the exact expected panel count instead of a fixed wait.',
      'Closes the specific next-sweep target queued by the prior run\'s Track L note. Suite unchanged at 890/890, now more resistant to flaking under load.',
    ],
  },
  {
    v: 179,
    title: 'Z7 kickoff: moving-average forecast overlay on Line / area charts',
    ts: '2026-07-02T16:45:00Z',
    items: [
      'First slice of the **Z7 (Analytics: forecasting + statistics)** track. Line / area charts gain a **\'Show moving average\'** toggle plus a **\'Moving avg window (points)\'** field: when on, each series draws a dashed trailing simple-moving-average overlay in its own color, computed client-side (no deps) directly from the same values already bound to the chart. Partial windows at the start average whatever points are available so the overlay always spans the full chart width.',
      'Same override pattern as the rest of the Z8 per-type option work — `_lineOpts` (the existing Z8-slice-7 override) gained the overlay, `Studio.CHARTS.line.opts` declares the two new fields, and they appear in the panel inspector automatically via the existing generic `optField()` renderer — no inspector-specific code needed. CDF export and the live preview share the same renderer, so the overlay round-trips through export with zero exporter changes.',
      '3 new tests (registry declares the fields, `showMA` off by default vs. one dashed `.ma-line` per series when on, inspector shows the fields). Test suite 890/890.',
    ],
  },
  {
    v: 178,
    title: 'Track N follow-up: an icon for every static command palette entry',
    ts: '2026-07-02T16:35:00Z',
    items: [
      'Every one of the palette\'s ~28 static commands (previously only the 5 section-navigation rows had one) now carries a themed inline-SVG icon, matching the visual polish the dynamic example/recent commands already had via their own icons — the command list now reads as a coherent, scannable menu instead of a mix of icon rows and bare text rows.',
      '1 new test asserts every command in `StudioPalette.commands` declares an `ic`. Test suite 884/884.',
    ],
  },
  {
    v: 177,
    title: 'Track N follow-up: dynamic palette commands (examples + recents) + a visible ⌘K hint',
    ts: '2026-07-02T16:25:00Z',
    items: [
      'The command palette now includes **dynamic commands rebuilt fresh on every open**: an \'Open example: <title>\' entry for every curated showcase in the Examples ▾ gallery, and an \'Open dashboard: <title>\' entry for every dashboard on your Home recents list — both read from the DOM the app already maintains (no new storage), so they can never drift and always reflect what\'s actually in the gallery / your recent history right now.',
      'Added a **visible \'Search ⌘K\' item** near the bottom of the left rail (global chrome, visible from every section) with a small keyboard-hint chip, so the shortcut is discoverable without opening ⋯ More or the shortcuts modal first. New `search` icon in `app/icons.js`; painted automatically by the rail\'s existing generic icon pass, no shell.js changes needed.',
      '`docs/index.html` keyboard-shortcuts section gained a Ctrl/⌘K row + a new \'Command palette\' explainer paragraph. 5 new tests (rail item + icon + hint, dynamic command presence, running a recent-dashboard command loads the exact spec, running an example command loads it) plus one existing Z1 icon-count assertion bumped from 6→7 for the new rail icon. Test suite 883/883.',
    ],
  },
  {
    v: 176,
    title: 'Z6 naming model: topbar title is now a jump-to-inspector button, not a duplicate editor',
    ts: '2026-07-02T16:20:00Z',
    items: [
      'The dashboard title in the topbar (`#dashTitle`) was an inline text input that edited `spec.title` directly — but the Dashboard inspector already had its own **Title** field doing the exact same thing, plus a separate **File name (stem)** field for the export filename. Two editors for the same value is exactly the kind of split-UI Z6 flagged. The topbar element is now a button: click it (or its pencil icon) to jump straight to the Dashboard inspector with the Title field focused and its text pre-selected, ready to retype.',
      'This makes the **naming model explicit**: Title (the display name shown in the dashboard\'s header/banner) and File name (stem) (the lowercase-with-dashes name used for exported files) are two clearly separate, independently-editable fields in one place — the inspector — instead of the title being editable from two different UIs. `docs/index.html` "The builder" section explains the new flow.',
      'The topbar button still shows the live title (with a subtle edit-pencil affordance) and stays in sync as you type in the inspector. 3 new tests covering the button\'s rendering, the click → focus handoff, and live sync back to the topbar. Test suite 881/881.',
    ],
  },
  {
    v: 175,
    title: 'Track N (innovation): command palette — ⌘K / Ctrl-K to jump anywhere',
    ts: '2026-07-02T16:05:00Z',
    items: [
      'New **command palette** (`app/palette.js`): press **⌘K / Ctrl-K** anywhere (or ⋯ More → \'Command palette\') to open a fuzzy-searchable list of ~28 commands — jump between sections (Home · Repository · Studio · Settings), create / open / save / export a dashboard, add a text panel or data source, toggle theme / sample-vs-live / focus / slideshow / demo / simple mode, manage servers, open the tour / tutorial / shortcuts / docs, and more. Keyboard-first: ↑↓ to navigate, ↵ to run, esc to close.',
      'Deliberately additive and self-contained — every command just drives the existing control the user would have clicked (or switches a rail section via the shell), so it reuses all existing wiring and can never drift out of sync. Injects its own theme-aware CSS (no `studio.css` edit) and adds its own ⋯ More entry (no `studio.js` edit). Respects `prefers-reduced-motion`. First slice of the Track N innovation backlog. 5 new tests.',
    ],
  },
  {
    v: 174,
    title: 'Z2 follow-up: hover life on Home cards + a flaky-test fix',
    ts: '2026-07-02T15:55:00Z',
    items: [
      '**More lively hover on Home**: recent-dashboard cards now lift a touch further, gain a warm terracotta glow (`box-shadow`), and their live SVG thumbnail zooms in slightly on hover; the three quick-create cards (Blank / Browse examples / Take the tour) get the same glow plus their icon bumps up. All motion is skipped under `prefers-reduced-motion`. Small, tasteful delight per the Z2 follow-up ask — no new state, pure CSS.',
      '**Test suite robustness fix**: while verifying this slice, found the pre-existing Z8G gauge percent-sign regression test (`v161`) was flaking under this sandbox\'s current load — it drives the real inspector \'Value format\' select and reads the live preview 150ms later, which wasn\'t always enough time for the preview iframe to finish re-rendering under load, producing an empty read (`texts:[]`) rather than a real failure. Confirmed via `git stash` that this flake pre-dates this session\'s changes. Bumped its wait to 400ms — same assertion, just enough headroom to observe the real render instead of a stale one.',
      '2 new hover tests (recent card + quick-create card, both asserting a real `box-shadow`/`transform` change on `:hover`). Test suite 873/873.',
    ],
  },
  {
    v: 173,
    title: 'Z14 track complete: distinct DuckDB/SQLite icons finish the connector-gallery polish',
    ts: '2026-07-02T15:35:00Z',
    items: [
      'The DuckDB (remote file) and SQLite (remote .sqlite) source-type cards in the ＋ New source builder now render their own distinct monoline glyphs — a rubber-duck mark for DuckDB, a database tucked inside a single file for SQLite\'s "just a file" model — instead of sharing the same generic cylinder `db` icon every server-backed connector (SQL/MDX/Kettle) also uses. Two new entries in `app/icons.js`\'s shared icon set, same stroke-based style (no brand colors/logos, dark mode works for free).',
      'This was the last open item under Z14 that didn\'t require a live internet-hosted fixture to verify (the real hosted-file smoke test and the true CORS live-network path both still need a live/internet environment to exercise by hand). Z14 (browser-native DuckDB-Wasm + SQLite-WASM-HTTP connectors) is now feature-complete for this sandbox.',
      '1 new test asserting both icons exist and are distinct from the generic `db` icon and from each other. Test suite 871/871.',
    ],
  },
  {
    v: 172,
    title: 'Z13 complete: multi-row sample-data mode + 11th example — gallery now covers all 51 chart types',
    ts: '2026-07-02T15:20:00Z',
    items: [
      '**Multi-row-per-label sample data** (`app/sampledata.js`): `Studio.sampleRows(da, valueOnly, multiRow)` gained an opt-in mode that emits 5 distinct labels with 6 jittered rows each (30 rows) instead of one row per label, so distribution-shaped charts see a real spread of values per group instead of a single flat point. Categorical columns repeat their group\'s label; numeric columns jitter ±35% around a per-group base. `Studio.genMock()` now auto-detects when a data access feeds a `boxplot`/`violin`/`ridgeline`/`beeswarm` panel and switches that DA to multi-row generation — no spec changes needed for existing dashboards.',
      '**11th example: "Incident Response & Reliability Distributions"** (`reliability-distributions.studio.json`) — the last 4 previously-uncovered chart types in one focused board: a quartile **box plot** of resolution time per team, a kernel-density **violin** of response time per severity, an individual-point **beeswarm** of incident duration, and horizontally-stacked **ridgeline** density curves of service latency. Gallery chart-type coverage is now **51 of 51** — every chart type appears in at least one bundled example.',
      '`docs/index.html` example-gallery count updated (10 → 11, notes full 51-type coverage). 4 new tests, including a regression check that the new example\'s distribution DAs get >8 rows with genuine per-row spread (not the degenerate one-point-per-label the flat generator would produce). Test suite 870/870.',
    ],
  },
  {
    v: 171,
    title: 'Z3 follow-up: whole-repository JSON export/import',
    ts: '2026-07-02T15:05:00Z',
    items: [
      'The Repository page gains **\'Export repository…\'** and **\'Import repository…\'** buttons next to its search box. Export downloads a single `dashboard-studio-repository.json` containing every data source you personally authored (via ＋ New source — the bundled catalog ships with the app itself, so it\'s deliberately excluded to keep the file small and meaningful) plus your local dashboard inventory (the same recents + pins Home and Repository already track).',
      'Import is **additive/merge, never destructive**: a data source with the same id overwrites the imported version into its group, and dashboards merge by id (last-write-wins on timestamp) — nothing already in your repository is ever deleted by an import. A confirm dialog states exactly how many data sources and dashboards are about to be merged before it happens.',
      '`Studio.friendlyConnectorError`-style separation of concerns: `applyRepositoryData()` (the actual merge logic) is exposed as a test hook independent of the file-picker/confirm dialog, mirroring the existing Settings export/import pattern. `docs/index.html` Getting started section explains the new buttons. 2 new tests (a real download + content check, and a merge-logic round trip) — while writing them, found and fixed a real test-authoring bug in the adjacent Z3 dashboard-reopen test: it silently left the app on the Studio section (not Repository) for every test after it, which would have made this new Repository-page test click a hidden button. Test suite 866/866.',
    ],
  },
  {
    v: 170,
    title: 'Z14 slice 4: connector-gallery polish — \'Browser-only\' badges + friendlier error hints',
    ts: '2026-07-02T14:10:00Z',
    items: [
      'The DuckDB (remote file) and SQLite (remote .sqlite) cards in the ＋ New source builder now carry a small teal **\'Browser-only\'** badge next to their name, visually calling out that these two connectors need no Pentaho server / proxy / saved credentials — the thing that sets them apart from the other five source types, previously only explained in prose in the docs.',
      '**Friendlier connector errors**: `Studio.friendlyConnectorError()` (new, in `app/model.js`, shared by both connectors) recognizes a handful of common raw failure signatures — fetch/CORS blocked, a network error, a timeout, a 404 — and appends one plain-English, actionable hint (e.g. "…this usually means the host doesn\'t allow cross-origin requests (CORS) or blocks HTTP Range Requests — try a public S3/GCS/R2 bucket with CORS enabled") instead of surfacing the raw browser error verbatim. Unrecognized messages pass through unchanged. Wired into both `Studio.DuckDB.testConnection()`\'s and `Studio.SQLiteHttp.testConnection()`\'s failure path.',
      '`docs/index.html` browser-native connectors section updated to mention the badge and the friendlier error hints. 8 new tests (3 badge-presence checks + 5 covering the error-hint helper\'s CORS/timeout/404/passthrough cases). Test suite 864/864.',
    ],
  },
  {
    v: 169,
    title: 'First architecture sweep (track L): dead CSS removed, codebase health audited',
    ts: '2026-07-02T13:05:00Z',
    items: [
      'The recurring architecture/code-review sweep (track L) had never actually run despite 168 prior revisions — this is its first pass. Wrote a small audit script comparing every CSS class selector in `app/studio.css` against a full-text search across all of `app/*.js`, `index.html`, `docs/index.html`, and `tests/run.js`: out of 341 classes, found and removed **2 genuinely dead rules** — `.ex-cards-1` (a single-column variant of the examples-gallery grid that was never actually applied by any code path) and `.empty-insp` (an inspector empty-state style with no caller anywhere).',
      'A parallel scan for zero-reference top-level `function` declarations across `app/studio.js`, `model.js`, `exporters.js`, `studio-render.js`, `studio-charts.js`, and `pentaho.js` found **zero** unused functions — a good sign for a codebase this size. Findings + a note on where the next sweep should look (chart-extension boilerplate duplication in `studio-charts.js`, and `studio.js`\'s size as the largest single module) logged in STATUS.md\'s track-L findings log for future sweeps to build on.',
      'Pure deletion, no behavior change. Test suite unaffected, 856/856.',
    ],
  },
  {
    v: 168,
    title: 'Z3 slice 1: Repository — data sources + dashboards, one searchable page',
    ts: '2026-07-02T12:45:00Z',
    items: [
      'The **Repository** section (left rail) is no longer a "coming soon" placeholder. It now lists **every catalog data source** — the same query-library data the Studio\'s library pane browses — as compact cards (id, kind badge, source table, first few columns), and **every local dashboard** — the same recents/pins Home\'s grid already tracks — as the familiar thumbnail cards. One shared search box (`#repoSearch`) filters both lists live as you type, without losing input focus (the results are rebuilt into a child container; the search field itself is never replaced).',
      'Click a data-source card to jump straight to Studio with the library search pre-filled to that data access, so it scrolls into view in the actual library pane. Click a dashboard card to reopen it — identical behavior to Home\'s recent cards (reuses the existing `recentCardHtml` renderer, so a dashboard opened from either page looks and behaves the same). Pin/unpin also works from Repository, sharing the same `studio-pins` storage Home reads — pin from either page and both stay in sync.',
      'No new storage or data model: this consolidates two things that already existed in separate corners of the app (the catalog and the recents/pins list) into one browsable, searchable surface, per the Z3 goal. Folders, full CRUD from the Repository page itself, the "workbook" grouping concept, and whole-repository JSON import/export remain open for future Z3 slices. `docs/index.html` Getting started section gained a paragraph introducing the left rail\'s four sections. 7 new Z3 tests. Test suite 856/856.',
    ],
  },
  {
    v: 167,
    title: 'Z12 complete: Branding as a Settings option',
    ts: '2026-07-02T12:15:00Z',
    items: [
      'New **Branding** card on the Settings page: **Default** mark, **Custom logo** (upload a PNG/JPG/SVG up to 200KB, converted to a `data:` URL and stored in `localStorage["studio-branding"]`), or **None**. Applied live to the `.rail-brand-mark` at the top of the left rail via a new `applyBranding()` — runs at boot alongside the theme init, and again on every mode/upload change, so the switch takes effect immediately without a reload.',
      '`studio-branding` is included in the Settings export/import key list (a custom logo travels with the rest of your preferences to another browser/device) and in ⋯ More → Clear local data.',
      '9 new tests, including a real upload through the actual `<input type=file>` via Playwright\'s `setInputFiles()` (works even though the input stays visually hidden until Custom logo mode is selected) — covers mode switching, the rail mark updating live, and the 200KB size guard rejecting an oversized file. `docs/index.html` Settings section gained a Branding paragraph. This closes out Z12 (the last remaining item was branding as a Settings option — favicon/rail/topbar identity all shipped earlier). Test suite 849/849.',
    ],
  },
  {
    v: 166,
    title: 'Z14 slice 3: SQLite-WASM + HTTP-VFS connector — indexed lookups over a remote .sqlite file',
    ts: '2026-07-02T11:45:00Z',
    items: [
      '**New data-source type: SQLite (remote .sqlite).** A 7th card in the ＋ New source builder queries a `.sqlite` file hosted anywhere over plain HTTP (S3, any static host) entirely inside the browser via sql.js-httpvfs — no proxy, no saved credentials, no CDA connection. It intercepts SQLite\'s page reads and turns them into HTTP Range Requests, so an indexed lookup or small join on a multi-GB file transfers only the ~4KB pages it actually touches — the relational/indexed-lookup counterpart to Z14 slice 1\'s DuckDB-Wasm (tuned for columnar aggregation).',
      '**Lazy-loaded engine** (`app/sqlitehttp.js`, new file, browser-only): `Studio.SQLiteHttp.ensureEngine()` loads the sql.js-httpvfs UMD bundle from jsDelivr the first time it\'s needed — via a classic `<script>` tag rather than dynamic `import()`, since the package ships no ESM build — and caches the running `createDbWorker` global. `testConnection(cfg)` lists the file\'s tables, runs `PRAGMA table_info` on the chosen (or first) table, and pulls a 5-row sample, resolving `{ok:false,error}` instead of rejecting so the UI always shows a clear message rather than a stuck spinner. `query(cfg, sql)` runs arbitrary SQL against the opened database, defaulting to `SELECT * FROM <table> LIMIT 200`.',
      '**Test connection & detect columns**: in both the New Source builder and the DA inspector, entering a File URL (and optional Table name — auto-detected from the file\'s first table if left blank) and clicking Test probes the file live and adds its real columns as chips, the same \'detect\' UX DuckDB and SQL DAs already have. The Data preview\'s \'Run live\' button queries the real file the same way, with no active Pentaho connection required.',
      'SQLite DAs aren\'t a real Pentaho data source, so `exportCDA` now excludes both `duckdb` and `httpvfs` kinds from the `.cda` XML; they render in the live preview and Dashboard Framework export the same way every DA does, via offline sample data keyed off the declared columns. `docs/index.html` Data sources section restructured to cover both browser-native connectors side by side. 13 new Z14 tests (stubbed at the `Studio.SQLiteHttp` boundary, same rationale as the DuckDB tests — this sandbox\'s browser has no route to the public internet). Test suite 840/840.',
    ],
  },
  {
    v: 165,
    title: 'Z0: delete the dead CDE exporter + finish the CDF/CDE/CDA terminology cleanup',
    ts: '2026-07-02T11:00:00Z',
    items: [
      'Deleted `Studio.exportCDE` / `CDE_OK` / `Studio.cdeEmittable` / `brandHeaderRows` from `app/exporters.js` — ~90 lines that had been unreachable since CDE export was pulled from the menu/inspector/bundle/push/CLI in the Phase-1 terminology migration. `Studio.parseCDE` (CDE **import**) is untouched and still works: existing Pentaho CDE dashboards open and become fully editable.',
      'The `.cdfde`/`.wcdf` fixture the CDE-import round-trip test used to generate live via `exportCDE()` is now a captured static fixture (`tests/fixtures/studio-cost.cde-fixture.json`) — a real externally-authored CDE dashboard would hand the importer exactly this shape, so the test still genuinely exercises `parseCDE` end-to-end without needing the deleted exporter.',
      'Also cleaned up two loose ends this surfaced: `bundleModal()`\'s dead `omitted` parameter (no caller has passed one since the CDE bundle option was removed) and a stale inspector note that told users "the CDE export will skip" text panels — export menu has no CDE option anymore.',
      '`docs/index.html`: corrected the stale chart-type count (47 → the actual 51), reworded the CDF/CDE badge legend now that CDE only round-trips on import, replaced the export walkthrough\'s CDE-download mention with what Export ▾ actually offers today (Dashboard Framework `.html` / Data Access `.cda` / bundle), and rewrote the export-format table to drop its now-fictional "CDE dashboard" row. Removed the matching dead `.ex-badge-cdf`/`.ex-badge-cde` CSS (the examples gallery card redesign in v157 already stopped rendering those badges; the rules just never got cleaned up).',
      'Pure cleanup, no user-facing behavior change to any existing export/import flow. Test suite 827/827 (6 tests that only asserted the deleted exporter\'s own output were removed; the CDE-import round-trip coverage that matters stayed and still passes against the new static fixture).',
    ],
  },
  {
    v: 163,
    title: 'Z2 follow-up: pin your favorite dashboards on Home',
    ts: '2026-07-02T10:50:00Z',
    items: [
      'Every card in Home\'s "Recent dashboards" grid now has a star toggle in its corner (shows on hover, or always when pinned). Pin a dashboard and it moves under a new "Pinned" heading above Recent dashboards — and, unlike a regular recent, it\'s never evicted as new activity pushes the list forward: the 8-entry cap now only applies to the unpinned tail.',
      'Restructured `.recent-card` from a `<button>` to a `<div>` wrapping a full-cover "open" button plus the small pin toggle, since a real `<button>` can\'t contain another interactive `<button>` — same click/keyboard behavior as before, just valid markup that also has room for the pin control. New `star` SVG icon in the shared icon set.',
      'New `localStorage["studio-pins"]` key (array of pinned dashboard ids); included in ⋯ More → Clear local data, alongside `studio-recents` which — a small pre-existing gap — wasn\'t actually being cleared before either. 4 new tests. Test suite 833/833.',
    ],
  },
  {
    v: 162,
    title: 'Z13 loose end: the v2-board importer no longer clobbers the curated example gallery',
    ts: '2026-07-02T10:15:00Z',
    items: [
      '`tools/import-v2.py` converts the 17 retired v2 `cde-*` boards from `reference/dashboards/*.cdfde` for reference — but was writing them straight into `data/examples/`, the same directory the curated showcase gallery (`index.json`) lives in. Re-running the importer (e.g. to refresh the Query Library catalog) would silently resurrect all 17 legacy boards there, even though they were deliberately retired in the v51 gallery curation. They now write to a separate, gitignored `data/legacy-v2-boards/` — still available for inspection, never touching the curated set.',
      'While verifying the fix, found that `data/cda-catalog.json` / `data/sample-data.json` (the Query Library data the live app actually fetches) are substantially out of date against the current `reference/dashboards/*.cda` files — several storage-cost queries still reference a retired table, and at least one data access is missing entirely. Left unregenerated here on purpose: it\'s a ~2500-line diff across the whole catalog that deserves a dedicated, carefully-tested slice rather than riding along with an unrelated fix. Flagged in STATUS.md for a future run.',
      'Python-only change (no app/JS touched); verified by running the importer. Test suite unaffected, 829/829.',
    ],
  },
  {
    v: 161,
    title: 'Z13 loose end: gauge no longer double-prints the percent sign',
    ts: '2026-07-02T09:45:00Z',
    items: [
      'Fixed a real, previously-latent bug: a Gauge panel with Value format set to "pct" (which already formats as e.g. "42.3%" via `PDC.fmt.pct`) combined with the Unit field left at its default "%" rendered "42.3%%" in the center readout — `studio-render.js`\'s gauge case was unconditionally defaulting `unit` to "%" regardless of the chosen format. Now the default unit is skipped when format is "pct" and the unit hasn\'t been changed from its default, so the two never stack; an explicit custom unit still works as before.',
      '1 new regression test drives the actual "Value format" `<select>` in the panel inspector (not a standalone `PDC.gauge()` call, which was already correct) so the fix in the panel-dispatch layer — where the bug actually lived — is exercised end-to-end via the real preview iframe. Test suite 829/829.',
    ],
  },
  {
    v: 160,
    title: 'Z14 slice 1: DuckDB-Wasm connector — query a remote Parquet/CSV file with zero backend',
    ts: '2026-07-02T09:00:00Z',
    items: [
      '**New data-source type: DuckDB (remote file).** A 6th card in the ＋ New source builder queries a Parquet or CSV file hosted anywhere over plain HTTP (S3, any static host) entirely inside the browser via DuckDB-Wasm — no proxy, no saved credentials, no CDA connection. DuckDB uses HTTP Range Requests under the hood, pulling only the bytes a query needs even from a large remote file. This kicks off Z14, the user-prioritized connector track that ships ahead of the token-gated Z4 warehouse providers (Snowflake/Databricks/BigQuery) specifically because it needs no backend.',
      '**Lazy-loaded engine** (`app/duckdb.js`, new file, browser-only): `Studio.DuckDB.ensureEngine()` dynamically imports the ~3–5MB duckdb-wasm bundle from jsDelivr only the first time it\'s needed and caches the running instance, so the base app stays small for everyone who never touches this connector. `testConnection(cfg)` registers the file and runs `DESCRIBE` + a 5-row sample, resolving `{ok:false,error}` instead of rejecting so the UI always shows a clear message rather than a stuck spinner on a bad URL, missing CORS/Range support, or no network. `query(cfg, sql)` runs arbitrary SQL against the file, aliased as view `t`.',
      '**Test connection & detect columns**: in both the New Source builder and the DA inspector, entering a File URL and clicking Test probes the file live and adds its real columns as chips — the same \'detect\' UX SQL DAs already have via \'Detect from query\', adapted for a connector with no query to parse. The optional Query field runs SQL against `t` (defaults to `SELECT * FROM t LIMIT 200`).',
      '**Query→model**: the Data preview\'s \'Run live\' button — previously shown only with an active Pentaho server connection — now also appears for any duckdb-kind DA and queries the real file via `Studio.DuckDB.query()`, landing in the exact same paginated preview table as a live Pentaho query.',
      'DuckDB DAs aren\'t a real Pentaho data source, so `exportCDA` now excludes them from the `.cda` XML; they render in the live preview and Dashboard Framework export the same way every DA does — via offline sample data keyed off the declared columns — so nothing else in the export pipeline needed to change. `docs/index.html` Data sources section updated. 12 new Z14 tests (stubbed at the `Studio.DuckDB` boundary — this sandbox\'s browser has no route to the public internet, so a real network call would only prove \'unreachable\', not exercise the integration). Test suite 828/828.',
    ],
  },
  {
    v: 159,
    title: 'Z13: 10th showcase example covers the last 10 CDF-only chart types — 47 of 51 now toured',
    ts: '2026-07-02T07:30:00Z',
    items: [
      '**Marketing & Growth Performance Console** (`data/examples/marketing-growth.studio.json`, fifth in gallery order) — a 10-panel funnel dashboard introducing **Streamgraph** (channel traffic ribbons), **Slope** (campaign CTR before/after), **Dot plot** (planned vs. actual budget), **Polar area** (ad spend share), **Step** (subscriber tier migration), **Marimekko** (revenue mix by region × product), **Packed bubbles** (audience segment size), **Population pyramid** (age/gender split), **100% stacked bars** (creative format mix), and **Text/annotation** (a guided intro panel) — none of which appeared in any of the 9 existing curated examples. Chart type coverage in the gallery is now 47 of 51 — everything except boxplot/violin/ridgeline/beeswarm, which the STATUS backlog already flags as needing a sample-data-generator change (multiple rows per label) before they\'ll look like real distributions rather than flat lines.',
      'Found and fixed a real gap while building the intro panel: the generic \'all examples render every panel\' Playwright check only counted `svg`/`table` elements as evidence a panel rendered — a **richtext (text/annotation)** panel renders neither (it\'s a `.sr-richtext` div), so the very first example to use one would have silently failed that check. Widened the selector to also count `.sr-richtext`, which is the correct fix (a text panel legitimately has no chart) rather than special-casing the new example.',
      '`docs/index.html` example count corrected 9 → 10. 3 new Z13 tests (listed in bundle, all 10 types present, every panel renders real content). Test suite 812/812.',
    ],
  },
  {
    v: 158,
    title: 'Z13: 9th showcase example covers 8 more chart types + a real icicle groupCol bug fix',
    ts: '2026-07-02T06:15:00Z',
    items: [
      '**Finance & FP&A Command Center** (`data/examples/finance-command.studio.json`, fourth in gallery order) — an 8-panel finance dashboard introducing **Candlestick** (monthly revenue range), **Area range** (forecast confidence band), **Diverging bars** (budget variance by department), **Radial bar** (KPI attainment ranking), **Icicle** (two-level cost-structure breakdown — the first bundled example to actually use icicle\'s optional `groupCol`), **Chord** (inter-department fund transfers), **Parallel coordinates** (regional performance across 4 metrics), and **Gantt** (month-end close timeline) — none of which appeared in any of the 8 existing curated examples. Chart type coverage in the gallery is now 37 of 51.',
      'Found and fixed a real, previously-latent bug while building the icicle panel: the `icicle` case in `studio-render.js` read a bare, undefined `groupCol` identifier instead of `m.groupCol` (the panel\'s actual column mapping) — so any icicle panel with a group column configured threw `ReferenceError: groupCol is not defined` and rendered nothing. Nothing had exercised icicle\'s two-level mode until this example (the one prior icicle usage was single-level, no groupCol). Fixed the one-line typo; the two-level render now works in preview and export.',
      '`app/sampledata.js` gained a `signed` classify kind for column names containing variance/delta/diff/change (e.g. `budget_variance_pct`) — generates alternating positive/negative values so diverging-bar and similar signed-metric panels actually diverge in the offline preview instead of always showing same-sign bars.',
      '`docs/index.html` example count corrected 8 → 9. 3 new Z13 tests (listed in bundle, all 8 types present, every panel renders real content). Test suite 809/809.',
    ],
  },
  {
    v: 157,
    title: 'Z13: 8th showcase example covers 8 more chart types + a real histogram entrance-animation bug fix',
    ts: '2026-07-02T05:00:00Z',
    items: [
      '**Product Delivery & Engineering Console** (`data/examples/engineering-delivery.studio.json`, third in gallery order) — an 8-panel delivery dashboard introducing **Table** (open backlog queue), **Combo** (sprint velocity vs. defects, dual-axis), **Grouped bars** (story points by team per sprint), **Stacked bars** (ticket-type mix by team), **Dumbbell** (planned vs. actual points by team), **Histogram** (cycle-time distribution), **Timeline** (release milestones), and **Word cloud** (most-mentioned tools) — none of which appeared in any of the 7 existing curated examples. Chart type coverage in the gallery is now 29 of 51 (up from 21).',
      'Found and fixed a real, previously-latent bug while sanity-checking the new histogram panel: `PDC.histogram`\'s bar entrance animation called `rect.setAttribute("transform", "scaleY(0)")` — `scaleY(...)` is a CSS transform function, not a valid SVG transform-attribute function (SVG1.1/2\'s attribute dialect only has matrix/translate/scale/rotate/skewX/skewY), so Chrome logged a console error on every bar and the animation silently no-opped. Nothing had exercised histogram\'s real render path with animation on until this example. Fixed by switching to `.style.transform`/`.style.transformOrigin` (CSS), the same convention every other animated chart in `app/studio-charts.js` already uses.',
      '`docs/index.html` example count corrected 7 → 8. 3 new Z13 tests (listed in bundle, all 8 types present, every panel renders real content). Test suite 806/806.',
    ],
  },
  {
    v: 156,
    title: 'Z13: new showcase example covers 8 chart types unused anywhere else in the gallery',
    ts: '2026-07-02T03:45:00Z',
    items: [
      '**Data Platform Operations Center** (`data/examples/ops-command.studio.json`) — an 8-panel operations dashboard introducing **Sankey** (pipeline flow by source), **Network** (system → consuming-app dependency graph), **Quadrant** (pipeline risk vs. volume), **Calendar heatmap** (daily reliability), **Bump** (stage-runtime ranking across months), **Sunburst** (assets by source), **Waffle** (job outcome mix), and **Pareto** (errors by source system) — none of which appeared in any of the 6 existing curated examples. Continues the Z13 goal of making the gallery a complete tour of every chart type.',
      'Placed second in the gallery order (right after the existing lead example) so the established \'most-spectacular-first\' regression coverage stays meaningful; `docs/index.html`\'s example count updated (6 → 7). 3 new Z13 tests verify the file is listed among the bundled examples, all 8 target types are present, and every panel renders real visual content (not a placeholder/empty state). Test suite 803/803.',
    ],
  },
  {
    v: 155,
    title: 'Z8 slice 18 (Z8 track complete): Grouped bars + 100% stacked get their own options',
    ts: '2026-07-02T02:30:00Z',
    items: [
      'Closes out the Z8 track\'s per-type option sweep: **Grouped bars** gains **Show value labels** (`showValues`, default off — a formatted value above each bar, only drawn when the bar is wide enough to hold text legibly) and **100% stacked bars** gains **Show segment % labels** (`showPct`, default off — a rounded `NN%` label centered in each segment, only drawn when the band is tall and wide enough). Both were the last two chart types still on bare rotate+fmt+height with no distinguishing option, flagged as a Z8 follow-up in v154.',
      '`PDC.groupedBars`/`PDC.barNorm` updated in `app/studio-charts.js` (both extensions, no vendored base to preserve); labels fade in alongside their bar/segment\'s grow-in animation. `studio-render.js` passes the new keys through to both the live preview and the exported CDF (inlined verbatim — no exporter changes needed, both types are CDF-only). `docs/index.html` cards updated. Every chart type in the registry now carries at least one genuine type-specific option beyond the generic fmt+height pair. 4 new Z8GN tests. Test suite 800/800.',
    ],
  },
  {
    v: 154,
    title: 'Z8 slice 17: Bump + Icicle get their own options (rank numbers / cell labels / % of total)',
    ts: '2026-07-02T01:30:00Z',
    items: [
      'Continues the Z8 track\'s per-type option sets (Table/Gauge/Treemap/Scatter/Line/Donut/Bars/Stacked/Calendar heatmap/KPI/Stacked area/Stream graph/Radar/Chord/Network in v139–v153) with the two remaining bare fmt+height types: **Bump / ranking** gets **Show rank numbers in dots** (`showRankNumbers`, default on — the tiny #1/#2/#3 text inside every dot was always drawn, with no way to declutter a chart with many entities/periods). **Icicle / partition** gets **Show cell labels** (`showLabels`, default on) and **Show % of total, not value** (`showPct`, default off), mirroring Treemap\'s proven pattern since both are proportional-area partitions — cells now show a second line (value or %) when the cell is tall enough.',
      '`PDC.bump`/`PDC.icicle` updated in `app/studio-charts.js` (both extensions, no vendored base to preserve); `studio-render.js` passes the new keys through to both the live preview and the exported CDF (inlined verbatim, so no exporter changes needed — icicle/bump are CDF-only). Fixed a latent test-fixture bug along the way: the icicle Playwright fixture passed `fmt: "plain"` (a raw string) instead of a formatter function, which only mattered once the render path started calling `fmt()` synchronously for the new value/% line. 4 new Z8BI tests. Test suite 796/796.',
    ],
  },
  {
    v: 153,
    title: 'Z8 slice 16: Chord + Network get their own options — arc/node label toggle',
    ts: '2026-07-02T00:30:00Z',
    items: [
      'Continues the Z8 track\'s per-type option sets (Table/Gauge/Treemap/Scatter/Line/Donut/Bars/Stacked/Calendar heatmap/KPI/Stacked area/Stream graph/Radar in v139–v152) with the last two Flow-group types still on generic fmt+height only: **Chord / wheel** and **Network / topology** each gain a **Show labels** toggle (`showLabels`, default on) to hide the per-arc / per-node text labels for a cleaner look on a dense diagram — the base toolkit always drew them with no way to turn them off.',
      '`PDC.chord`/`PDC.network` overridden in `app/studio-charts.js` (`PDC._chordBase`/`PDC._networkBase` keep the originals for reference, same override pattern as the other Z8 slices) — identical ring-allocation/blast-radius-hover geometry; `studio-render.js` passes `showLabels` through. `docs/index.html` Chord + Network cards updated. 3 new Z8CN tests. Test suite 792/792.',
    ],
  },
  {
    v: 152,
    title: 'Z8 slice 15: Radar / spider gets its own options — legend toggle + vertex dots',
    ts: '2026-07-01T22:15:00Z',
    items: [
      'Continues the Z8 track\'s per-type option sets (Table/Gauge/Treemap/Scatter/Line/Donut/Bars/Stacked/Calendar heatmap/KPI/Stacked area/Stream graph in v139–v151) with **Radar / spider**: `Studio.CHARTS.radar.opts` now includes **Show legend** (the renderer already supported hiding the legend internally via `cfg.legend`, but the inspector never exposed a toggle) and **Show vertex dots** (hide the per-vertex dot markers for a cleaner polygon-only look; invisible hover targets keep tooltips working with dots hidden, same convention as Line\'s \'Show data points\').',
      '`PDC.radar` in `app/studio-charts.js` reads `cfg.showDots` (pdc-ui.js untouched — radar has always lived entirely in the extension file); `studio-render.js` passes `legend`/`showDots` through. `docs/index.html` Radar card updated. 3 new Z8RD tests. Test suite 789/789.',
    ],
  },
  {
    v: 151,
    title: 'Z8 slice 14: Stream graph gets its own options — legend toggle + band opacity',
    ts: '2026-07-01T21:25:00Z',
    items: [
      'Continues the Z8 track\'s per-type option sets (Table/Gauge/Treemap/Scatter/Line/Donut/Bars/Stacked/Calendar heatmap/KPI/Stacked area in v139–v150) with **Stream graph**: `Studio.CHARTS.streamgraph.opts` now includes **Show legend** (the renderer already supported hiding the legend internally via `cfg.legend`, but the inspector never exposed a toggle) and **Band opacity** (was hardcoded to 78%, now adjustable 0–100%).',
      '`PDC.streamgraph` reads `cfg.opacity` for the ribbon fill-opacity (`app/studio-charts.js`, pdc-ui.js untouched — stream graph has always lived entirely in the extension file); `studio-render.js` passes `showLegend`/`bandOpacity` through. `docs/index.html` Stream graph card updated. 3 new Z8SG tests. Test suite 786/786.',
    ],
  },
  {
    v: 150,
    title: 'Z8 slice 13: Stacked area gets its own options — smooth curve + legend toggle',
    ts: '2026-07-01T20:10:00Z',
    items: [
      'Continues the Z8 track\'s per-type option sets (Table/Gauge/Treemap/Scatter/Line/Donut/Bars/Stacked/Calendar heatmap/KPI in v139–v149) with **Stacked area**: `Studio.CHARTS.areaStacked.opts` now includes **Smooth curve** (cubic-bezier band edges, same midpoint-control-point technique as Line/Bump) and **Show legend** (the renderer already supported hiding the legend internally via `cfg.legend`, but the inspector never exposed a toggle for it).',
      '`PDC.areaStacked`\'s band path builder now curves both the top and bottom edge of every band when `smooth` is on (`_bandSeg` helper in `app/studio-charts.js`, pdc-ui.js untouched — areaStacked has always lived entirely in the extension file); `studio-render.js` passes `smooth`/`legend` through. `docs/index.html` Stacked area card updated. 3 new Z8AS tests. Test suite 784/784.',
    ],
  },
  {
    v: 149,
    title: 'Z8 slice 12: KPI tiles get click-through',
    ts: '2026-07-01T19:30:00Z',
    items: [
      'Continues the Z8 track\'s per-type option sets (Table/Gauge/Treemap/Scatter/Line/Donut/Bars/Stacked/Calendar heatmap in v139–v148) with **KPI tiles**: a new \'Click-through\' section in the KPI inspector (Target URL + URL parameter) lets a tile navigate to another dashboard when clicked — mirroring the panel Drill-through feature bars/donut already have.',
      'Uses the same shared `PDC.bindDrill` helper as bars/donut/lollipop, bound directly to the `.kpi` tile element with the KPI\'s raw value as the carried label; works in the live preview and in exported CDF (studio-render.js is inlined into every export). `docs/index.html` KPI card updated. 4 new Z8 KPI tests. Test suite 781/781.',
    ],
  },
  {
    v: 148,
    title: 'Z8 slice 11: Calendar heatmap gets its own options — cell color + week start',
    ts: '2026-07-01T18:25:00Z',
    items: [
      'Continues the Z8 track\'s per-type option sets (Table/Gauge/Treemap/Scatter/Line/Donut/Bars/Stacked in v139–v147) with Calendar heatmap: `Studio.CHARTS.calHeatmap.opts` now includes **Cell color** (was hardcoded to the brand color) and **Week starts on** (Monday/Sunday — weeks always rolled over from Monday before, with no way to change it).',
      '`PDC.calHeatmap` in `app/studio-charts.js` reads `cfg.color` for the filled-cell color and `cfg.weekStart` to decide which weekday starts each row (weekday labels reorder to match); `studio-render.js` passes both through via the existing `color()` token-resolving helper. `docs/index.html` Calendar heatmap card updated. 3 new Z8-11 tests. Test suite 777/777.',
    ],
  },
  {
    v: 147,
    title: 'Z8 slice 10: Stacked bars gets its own options — sort by total + value-label toggle',
    ts: '2026-07-01T21:05:00Z',
    items: [
      'Continues the Z8 track\'s per-type option sets (Table/Gauge/Treemap/Scatter/Line/Donut/Bars in v139–v146) with Stacked bars: `Studio.CHARTS.stacked.opts` now includes **Sort by total** (order categories by their stacked total, largest first — the same convention as Bars\' \'Sort by value\' and Donut\'s \'Sort slices\') and **Show value labels** (per-segment value text centered in its band, shown only when the band is tall enough to hold it legibly).',
      '`PDC.stacked` overridden in `app/studio-charts.js` (`PDC._stackedBase` keeps the original for reference, same override pattern as Table/Gauge/Treemap/Scatter/Line/Donut/Bars) — identical band-stacking/gridline/tooltip logic; `studio-render.js` passes `sortStack`/`showValues` through. CDE export\'s `valuesVisible` now reflects the option instead of always being `false`. `docs/index.html` Stacked bars card updated. 3 new Z8ST tests. Test suite 774/774.',
    ],
  },
  {
    v: 146,
    title: 'Z8 slice 9: Bar chart gets its own options — sort by value + value-label toggle',
    ts: '2026-07-01T20:15:00Z',
    items: [
      'Continues the Z8 track\'s per-type option sets (Table/Gauge/Treemap/Scatter/Line/Donut in v139–v145) with the Bar chart: `Studio.CHARTS.bars.opts` now includes **Sort by value** (largest-first, the same convention as Donut\'s \'Sort slices\') and **Show value labels** (hide the always-on value text for a cleaner look on dense/crowded charts).',
      '`PDC.bars` overridden in `app/studio-charts.js` (`PDC._barsBase` keeps the original for reference, same override pattern as Table/Gauge/Treemap/Scatter/Line/Donut) — identical horizontal/vertical layout, gridlines, and tooltip logic; `studio-render.js` passes `sortBars`/`showValues` through and extends `wireXFilter`\'s bars branch to mirror the sort so a click on a bar still maps to the right cross-filter label when sorting is on. CDE export\'s `valuesVisible` now reflects the option instead of always being `true`. `docs/index.html` Bar chart card updated. 3 new Z8BR tests. Test suite 771/771.',
    ],
  },
  {
    v: 145,
    title: 'Z8 slice 8: Donut gets its own options — sort slices, legend toggle, inner radius',
    ts: '2026-07-01T19:05:00Z',
    items: [
      'Continues the Z8 track\'s per-type option sets (Table/Gauge/Treemap/Scatter/Line in v139–v144) with the Donut / pie chart: `Studio.CHARTS.donut.opts` now includes **Sort slices by value** (largest-first instead of always row order), **Show legend** (hide the side legend so the ring can use the panel\'s full width), and **Inner radius %** (adjustable ring thickness, 0 = a full pie with no center hole/label).',
      '`PDC.donut` overridden in `app/studio-charts.js` (`PDC._donutBase` keeps the original for reference, same override pattern as Table/Gauge/Treemap/Scatter/Line) — identical arc math, tooltip, and center-total label logic. `studio-render.js` passes `sortSlices`/`legend`/`innerPct` through and mirrors the sort in cross-filter\'s click-to-label wiring (`wireXFilter`) so a slice click still maps to the right label when sorting is on. `docs/index.html` Donut card updated. 3 new Z8DN tests. Test suite 768/768.',
    ],
  },
  {
    v: 144,
    title: 'Z8 slice 7: Line / area gets its own options — smooth curve + show data points',
    ts: '2026-07-01T17:55:00Z',
    items: [
      'Continues the Z8 track\'s per-type option sets (Table/Gauge/Treemap/Scatter in v139–v143) with the Line / area chart: `Studio.CHARTS.line.opts` now includes **Smooth curve** (cubic-bezier interpolation between points instead of straight segments, using the same midpoint-control-point technique as the Bump chart) and **Show data points** (hide the per-point dot markers for a cleaner look on dense series — a transparent hover target keeps tooltips working even with dots hidden).',
      '`PDC.line` overridden in `app/studio-charts.js` (`PDC._lineBase` keeps the original for reference, same override pattern as Table/Gauge/Treemap/Scatter) — identical axis/grid/area-gradient-fill logic; `studio-render.js` passes `smooth`/`showDots` through. `docs/index.html` Line/area card updated. 3 new Z8LN tests. Test suite 765/765.',
    ],
  },
  {
    v: 143,
    title: 'Z8 slice 6: Scatter gets its own options — value format + trend line',
    ts: '2026-07-01T16:45:00Z',
    items: [
      'Continues the Z8 track\'s per-type option sets (Table, Gauge, Treemap in v139–v142) with the Scatter / bubble chart: `Studio.CHARTS.scatter.opts` now includes **Value format** (axis ticks + tooltip were always `PDC.fmt.abbr` with no way to change it) and **Show trend line (regression)** — an ordinary least-squares regression line computed through every plotted point, clamped to the visible axis range, so a builder can reveal correlation direction/strength without leaving the tool.',
      '`PDC.scatter` overridden in `app/studio-charts.js` (`PDC._scatterBase` keeps the original for reference, same pattern as Table/Gauge/Treemap) — identical dot-plot layout and bubble-radius encoding; `studio-render.js` wires `fmtX`/`fmtY`/`trend` through, falling back to the chart\'s true `abbr` default (not the ambient plain/identity fallback) for scatter panels saved before this option existed, so no dashboard regresses. `docs/index.html` Scatter card updated. 4 new Z8SC tests. Test suite 762/762.',
    ],
  },
  {
    v: 142,
    title: 'Z8 slice 5: Treemap gets its own options — tile labels + % of total',
    ts: '2026-07-01T15:35:00Z',
    items: [
      'Continues the Z8 track\'s per-type option sets (Table in v139/v140, Gauge in v141) with the Treemap chart: `Studio.CHARTS.treemap.opts` now includes **Show tile labels** (the base toolkit always drew a bold title + raw-value label on any tile big enough to fit one, with no way to turn it off for a cleaner look) and **Show % of total, not value** (swaps the second label line to each tile\'s share of the whole — usually the actual question a treemap answers — instead of the raw number).',
      '`PDC.treemap` overridden in `app/studio-charts.js` (`PDC._treemapBase` keeps the original for reference, same override pattern as Table/Gauge) — identical squarified layout algorithm, tooltip still always shows both the value and the percentage regardless of the label setting. `studio-render.js` passes `showLabels`/`showPct` through. `docs/index.html` Treemap card updated. 5 new Z8M tests. Test suite 758/758.',
    ],
  },
  {
    v: 141,
    title: 'Z8 slice 4: Gauge gets its own options — value format + quality-zone thresholds',
    ts: '2026-07-01T14:20:00Z',
    items: [
      'Continues the Z8 track\'s per-type option sets (v139/v140 gave Table its own options) with the Gauge chart: `Studio.CHARTS.gauge.opts` now includes **Value format** (the same format picker every other chart type has — abbreviated/number/money/percent/etc. — instead of always showing a raw rounded number) and two **quality-zone thresholds**, Warning zone % and Good zone %, that were previously hardcoded (70%/90%) deep in the vendored toolkit and invisible in the inspector.',
      'The gauge arc itself now draws a **permanent red/amber/green zone track** behind a bright value tick, mirroring the Bullet chart\'s established quality-band convention — so *why* a gauge reads red is obvious at a glance, not just inferred from the needle\'s color once it crosses an invisible line. `PDC.gauge` overridden in `app/studio-charts.js` (`PDC._gaugeBase` keeps the original for reference, same pattern as the Table override); `studio-render.js` passes `fmt`/`warnAt`/`goodAt` through. `docs/index.html` Gauge card updated. 4 new Z8G tests. Test suite 753/753.',
    ],
  },
  {
    v: 140,
    title: 'Z8 slice 3: Table extras — paging, freeze header, row density',
    ts: '2026-07-01T13:00:00Z',
    items: [
      'Continues the Z8 track\'s Table-specific option set (v139 shipped row limit + grand total): three more type-specific options land in `Studio.CHARTS.table.opts` — **Rows per page** (0 = all on one page, otherwise a Prev/Next `.tbl-page-bar` with a \'Page X of Y\' label appears), **Freeze header row** (wraps the table in a scrollable `.tbl-wrap.frz` container with a `position:sticky` `<thead>`, so tall tables keep their column headers visible while scrolling instead of just clipping at the panel edge), and **Row density** (Comfortable / Compact, a new `select` inspector option type).',
      'Paging composes cleanly with the existing search filter and click-to-sort: filtering or re-sorting resets to page 1; bar-cell scaling and the grand-total row still compute over the full filtered/sorted result set (not just the current page), so numbers stay consistent as you page through.',
      'New `optField()` case for `type:"select"` in `app/studio.js` (reuses the existing `select2pairs` helper) — the first inspector option backed by an arbitrary choice list rather than a fixed bool/int/color/fmt. `PDC.table` (the `app/studio-charts.js` override) owns pagination state and the freeze/density wrapper classes; `studio-render.js` passes the three new `o.*` opts through. `docs/index.html` Table card updated. 4 new Z8T tests. Test suite 749/749.',
    ],
  },
  {
    v: 139,
    title: 'Z8: table-specific inspector options — row limit + grand total row',
    ts: '2026-07-01T11:30:00Z',
    items: [
      'Continues the Z8 track (context-aware inspector) with the first type-specific *option* set called out in the backlog: the Table chart now has its own `Studio.CHARTS.table.opts` — **Row limit** (cap rows rendered, 0 = show all) and **Show grand total row** (sums every numeric column and appends a bold, top-bordered total row).',
      'The grand total is computed over the currently *visible* rows — it recomputes live as you type in the table\'s search/filter bar, so the total always matches what\'s on screen, and it composes with the existing click-to-sort headers.',
      '`PDC.table` (the `app/studio-charts.js` override) grew a `cfg.grandTotal` flag; `studio-render.js` applies `o.maxRows` client-side before handing rows to the renderer and passes `o.grandTotal` through — both preview and exported CDF share this one code path since `studio-charts.js` is inlined into every export. `docs/index.html` Table card updated. 4 new Z8T tests. Test suite 745/745.',
    ],
  },
  {
    v: 138,
    title: 'Z8 slice 1: context-aware inspector — hide interaction sections a chart type can\'t use',
    ts: '2026-07-01T10:00:00Z',
    items: [
      'New `Studio.ANNOT_CAPS` capability map in `app/model.js` (+ `Studio.chartSupports(kind, type)` helper) records which chart types the renderer actually wires each interaction/formatting feature into — mirrors the real logic in `studio-render.js` (drill only for bars/donut, detail drawer for bars/donut/treemap/table, cross-filter + conditional formatting + color scale for bars/donut/treemap/lollipop).',
      'The panel inspector\'s Drill-through, Detail drawer, Cross-filter, Conditional formatting, and Color scale sections now only render for chart types that support them — e.g. a Table panel no longer shows Cross-filter or Color scale (settings that had no visible effect), while still showing Detail drawer (table rows do open one). A Line chart no longer shows Conditional formatting.',
      'First slice of the Z8 track ("context-aware inspector"); the type-agnostic overlay annotations (Target line, Reference band, Callout arrow) and the already-type-gated Period highlight / Event markers / Point annotations are unchanged. 4 new Z8 tests. Test suite 741/741.',
    ],
  },
  {
    v: 137,
    title: 'Z9: fix invisible topbar dropdowns at tablet width',
    ts: '2026-07-01T09:00:00Z',
    items: [
      'Found and fixed the root cause of a user-reported mobile regression: \'the top button-bar scrolls/slides but its dropdown menus don\'t open/work\'. At **tablet widths (641–900px)**, `#topbar`/`.top-actions` need `overflow:hidden` to stop the button row from forcing page-level horizontal scroll — but that same clip box was also hiding every dropdown (New ▾ / Examples ▾ / Export ▾ / ⋯ More), since each `.menu` is `position:absolute` and extends below the topbar\'s own box.',
      'The bug was invisible to a naive check: the menu still gained its `.open` class and reported normal computed styles, so both a DOM inspection and Playwright\'s default click/tap actionability check reported success — while the menu was genuinely unrendered on screen. Confirmed with a screenshot before fixing, then again after.',
      'Fix: extended the same `position:fixed` escape-hatch already used at ≤640px (phone) to the tablet range, anchored under its button instead of stretched full-width. Buttons row keeps its overflow clipping (still needed to prevent horizontal page scroll); only the opened dropdown escapes it.',
      'Added an `elementFromPoint`-based regression test for New ▾ / Export ▾ / ⋯ More at a tablet viewport (800×1024) — the only check that actually catches ancestor-overflow clipping, since `.classList.contains(\'open\')` alone does not. Verified it fails on the old CSS and passes on the fix. 4 new checks. Test suite 737/737.',
    ],
  },
  {
    v: 136,
    title: 'Z11: discoverable Help entry + Z5: Settings export/import as JSON',
    ts: '2026-07-01T07:30:00Z',
    items: [
      'Z11: the help docs were hard to find — buried as \'Help docs ⓘ\' inside the ⋯ More menu. Added a persistent **Help** link at the bottom of the left rail (below Settings, above the collapse toggle) that opens `docs/index.html` in a new tab. It\'s a plain link, not a shell section, so it doesn\'t disturb the Home/Repository/Studio/Settings switcher — just a clearly visible, always-there way in.',
      'Z5 follow-up: Settings gained a **Data** card with **Export settings** / **Import settings** — saves your theme, mode, server connections, and pane-layout preferences (not dashboard content — that\'s still Save/Open) as a `dashboard-studio-settings.json` file, and restores them from one. Handy before \'Clear local data\', or to carry your setup to another browser/device.',
      '`applySettingsData()` is factored out from the file-picker flow so it validates and rejects non-settings files independent of the browser\'s native file dialog. `docs/index.html` updated with a \'Backing up your settings\' note. 4 new checks. Test suite 733/733.',
    ],
  },
  {
    v: 135,
    title: 'Z5 slice 1: Settings — first-class mode toggle switches',
    ts: '2026-07-01T06:00:00Z',
    items: [
      'The Settings section (left rail) is no longer a placeholder: it now shows the app\'s mode toggles — Dark mode, Simple mode, Demo mode, Focus mode — as clear, labelled on/off switches, grouped into Appearance / Mode / Presentation cards. Previously these were buried and hard to find inside the ⋯ More menu (a user specifically couldn\'t locate Simple mode there).',
      'Each switch is a thin wrapper over the existing mode function (setTheme/toggleSimpleMode/toggleDemoMode/enter·exitFocusMode) — no parallel state was introduced, so the switch, the ⋯ More menu item, and any keyboard shortcut always agree. Flipping Focus mode from Settings jumps you into Studio so you immediately see the effect; exiting via Escape is reflected back in the switch next time Settings is shown.',
      '⋯ More menu keeps all four items too (nothing removed) — Settings is an additional, more discoverable home for them, not a replacement. `docs/index.html` updated to mention the new Settings location alongside the existing ⋯ More instructions.',
      'New warm-dark toggle-switch component (`.set-sw`) styled to match the Home section\'s plum/terracotta look. 6 new Z5 Playwright checks. Test suite 729/729.',
    ],
  },
  {
    v: 134,
    title: 'Z12: branding & app identity — de-dup the logo, add a favicon',
    ts: '2026-07-01T04:30:00Z',
    items: [
      'The tab was blank — added a real favicon: a small terracotta-gradient bar-chart mark (`favicon.svg`), wired via `<link rel="icon">` + `apple-touch-icon` + `site.webmanifest` + a matching `theme-color`, so the app finally shows up right in tabs, bookmarks, and \'Add to Home Screen\'.',
      'Removed the redundant single-letter \'P\' square from the topbar next to the full \'Analytics Dashboard Studio\' wordmark — a bare letter-box read as unfinished next to a full wordmark and the rail\'s own icons. The styled wordmark is now the sole identity in the content header.',
      'Anchored the app\'s persistent identity at the TOP of the left rail instead (cf. Linear / VS Code / Notion): a compact brand mark (the same favicon glyph) + \'Dashboard Studio\' label, above Home/Repository/Studio/Settings; clicking it jumps to Home. Collapses to just the mark when the rail is collapsed, matching the existing section-icon behavior.',
      'Exported dashboards (Dashboard Framework .html) and the passcode gate screen are untouched — this was scoped to the app\'s own chrome only, per the plan to keep exported-artifact branding independent. 5 new Z12 Playwright checks. Test suite 723/723.',
    ],
  },
  {
    v: 133,
    title: 'Z2: Home — a real landing page (quick-create + recents)',
    ts: '2026-07-01T01:30:00Z',
    items: [
      'The Home section (left rail) is no longer a placeholder: it now opens with a warm-dark, game-like landing page — a greeting, three quick-create cards (Blank dashboard, Browse examples, Take the tour), and a live \'Recent dashboards\' grid.',
      'Recents are captured automatically as you work: whenever the working spec settles (same debounce path as auto-save), a snapshot of the full dashboard is saved into a capped, newest-first localStorage list (`studio-recents`, 8 max) — so a recent card genuinely reopens that exact dashboard, not just a label.',
      'Each recent card renders a live SVG layout thumbnail via the existing `Studio.makeThumbnail()` (same helper used for the dashboard inspector and Examples gallery), plus title, relative \'time ago\', and panel/KPI counts. Thumbnails always match the current light/dark theme.',
      'Quick-create cards jump straight into Studio: Blank starts a fresh spec, Browse examples opens the existing Examples ▾ menu, and Take the tour launches the J6 interactive walkthrough — all reusing existing, well-tested code paths (additive wiring only).',
      'Fixed a Z1 CSS specificity bug uncovered while building this: `.app-sec.has-content` had the same specificity as `.app-sec[hidden]` and, being later in the stylesheet, silently won — meaning a populated Home section could stay visually \'display:block\' even while `hidden`. Scoped the rule to `:not([hidden])` so the hidden state always wins. 5 new Z2 Playwright checks. Test suite 718/718.',
    ],
  },
  {
    v: 132,
    title: 'Z1: App shell — a collapsible left rail (Home · Repository · Studio · Settings)',
    ts: '2026-07-01T00:00:00Z',
    items: [
      'The Studio is becoming a multi-section analytics app, not just a dashboard builder. A new left rail (`app/shell.js`) frames the whole app into four sections — Home, Repository, Studio, Settings — with single-color icons per section (amber Home, teal Repository, blue Studio, violet Settings) on a warm dark plum background, matching the polecat.live design language.',
      'The existing 3-pane builder moves under the Studio section with zero feature loss — every panel, chart, export, and keyboard shortcut works exactly as before; only its container changed (wrapped in a new `#appMain`, nothing inside it touched).',
      'The rail collapses to icons-only or expands to icon+label; both the collapsed state and the active section persist in localStorage across reloads. Keyboard roving nav (↑/↓) moves focus between rail buttons; the active section gets `aria-current="page"`.',
      'Home, Repository, and Settings currently show a friendly placeholder card describing what\'s coming (recents/favorites, data sources & workbooks, and app defaults respectively) — the real content for each lands in upcoming Z-track slices.',
      'Scoped to desktop for this slice: the rail is hidden below the existing 900px tablet breakpoint and the Studio section always wins on narrow viewports, so every mobile/tablet behavior (drawers, tab bar, MNAV checks) is completely unaffected. 8 new Z1 Playwright checks. Test suite 713/713.',
    ],
  },
  {
    v: 131,
    title: 'Generic terminology, a single empty-state, and Central-Time stamps',
    ts: '2026-06-30T19:00:00Z',
    items: [
      'Generic vocabulary: “CDA” → “Data Access” and “CDF” → “Dashboard Framework” across the export menu, export history, file-name hints, and the welcome tour. The CDE export was removed — the editable “.studio.json” is the source of truth. Internal file formats and Pentaho server connectivity are unchanged.',
      'Empty canvas now shows a single, clean empty-state: the builder’s “Canvas is empty” overlay, with the live preview fully hidden so its own “Your dashboard is empty” message no longer doubles up behind it.',
      'Changelog timestamps now display in US Central (CT) instead of UTC — entries authored in UTC convert automatically, and the conversion is CST/CDT aware.',
    ],
  },
  {
    v: 130,
    title: 'Standalone repo + Analytics Dashboard Studio rebrand',
    ts: '2026-06-30T00:00:00Z',
    items: [
      'The Studio is now its own standalone repository (analytics.polecat.live), served directly by GitHub Pages at that domain — the app lives at the repo root, with the original iteration-v2 suite preserved under reference/ (dashboards, analyzer reports, dash-build) and provisioning/ (warehouse DDL, ETL, deploy).',
      'Rebranded to Analytics Dashboard Studio (an analytics.polecat.live project): titles, header/footer brand, welcome tour, gate screen, help docs, and the exported-dashboard footer updated; license is © 2026 Polecat.live. Pentaho server connectivity (CDA/CDE/CDF, live preview, import, push) is unchanged.',
    ],
  },
  {
    v: 129,
    title: 'F38: Quadrant chart (51st chart type) — 2×2 matrix for BCG, effort/impact, and risk analysis',
    ts: '2026-06-29T15:00:00Z',
    items: [
      'Quadrant chart (F38, Comparison group, CDF-only): positions items on an x/y scatter plane divided into four distinctly labelled zones by two configurable threshold lines — a vertical divider at an adjustable X-split percentage and a horizontal divider at an adjustable Y-split percentage. Dots are automatically colour-coded by which quadrant they land in: brand blue for the top-right zone, purple for top-left, green for bottom-right, and red for bottom-left. The background behind each zone carries a very subtle matching tint (6% opacity) so the four areas are immediately distinguishable without overwhelming the data. A short italic label is anchored inside each corner to name the quadrant. Ideal for any 2×2 strategic analysis framework: BCG growth-share matrix (Market Growth Rate vs Relative Market Share), Effort vs Impact prioritisation (plot backlog items and see at a glance which are Quick Wins vs Low Priority), Performance vs Potential talent grids (top-right are Stars, bottom-left are Laggards), Risk Assessment (Probability vs Impact produces four risk categories), Urgency vs Importance (Eisenhower matrix), or Product Positioning maps. Column binding: xCol (the horizontal axis measure — e.g. market growth rate, effort estimate, impact score), yCol (the vertical axis measure), and optional labelCol (the point identity label shown next to each dot and in hover tooltips). Inspector options: X split (0–100%; draggable range slider; where the vertical divider sits along the x-axis range), Y split (0–100%; where the horizontal divider sits along the y-axis range), Top-right label (default \'High Value\'), Top-left label (default \'Explore\'), Bottom-left label (default \'Low Priority\'), Bottom-right label (default \'Quick Wins\'), X axis label, Y axis label, and Height (px). Point labels are truncated to 13 characters and nudged right of each dot so they never overlap it. Hover tooltip shows the point label, x value, and y value. Animated entrance: dots fade in staggered 35 ms apart using a CSS transition (respects prefers-reduced-motion and the per-panel animate toggle). Grid lines on both axes provide value context without distracting from the quadrant zones. PDC.quadrant extension in studio-charts.js (pdc-ui.js stays a pristine vendor mirror). Gallery SVG thumbnail in CHART_SVG (studio.js) and model.js thumb: four tinted quadrant zones + dashed dividers + eight coloured dots arranged across all four zones. autoPickCols in both model.js (newPanel) and studio.js (K6 Auto-pick): first string column → labelCol; first numeric column → xCol; second numeric column → yCol. docs/index.html updated to 51 chart types — ct-quadrant added under a new Comparison group heading. 5 new F38 Playwright checks. Test suite 704/704. 51 chart types total.',
    ],
  },
  {
    v: 128,
    title: 'F37: Area range / confidence band chart (50th chart type)',
    ts: '2026-06-29T14:00:00Z',
    items: [
      'Area range / confidence band chart (F37, Trend group, CDF-only): a shaded semi-transparent band between a lower bound line and an upper bound line, with an optional bold centre/actual line drawn through the middle. The upper bound is rendered as a solid polyline; the lower bound as a dashed polyline (visually distinct at a glance); the fill polygon between them uses a configurable opacity (default 22%). An optional centre line — e.g. a forecast median, a model prediction, or an actual measured value — overlays the band as a bolder solid line so the actual trajectory reads clearly against the range context. Ideal for: statistical confidence intervals (the 90%/95% band around a model prediction), min/max sensor or temperature ranges across time periods, budget corridors (floor/ceiling tracks for quarterly plans), weather forecast uncertainty bands, or any scenario where the meaningful story is \'the value should stay inside this envelope.\' Column binding: labelCol (x-axis labels / time periods) + lowerCol (lower bound numeric column) + upperCol (upper bound numeric column) + optional centerCol (centre/actual/forecast numeric column). Inspector options: Band opacity % (slider 5–60, default 22%), Show centre line toggle (default on), and Height (px). autoPickCols heuristics prefer column names containing low/min/floor/lower for the lower slot and high/max/ceil/upper for the upper slot. Hover tooltips show Upper, Lower, and Centre values per x-position. Animation: the shaded band fades in first (ease 450 ms), then the boundary lines appear slightly after (ease 380 ms, offset 100/120 ms), and the centre line fades in last (350 ms, offset 260 ms) — so the range context appears before the highlighted actual value, directing the eye correctly. PDC.areaRange extension in studio-charts.js (pdc-ui.js stays pristine). Gallery SVG thumbnail in both CHART_SVG picker (studio.js) and model.js thumb. centerCol marked optional in missingRequiredCols. autoPickCols in both model.js (newPanel) and studio.js (K6 Auto-pick). docs/index.html updated to 50 chart types with ct-areaRange card in the Trend group. 5 new F37 Playwright checks. 50 chart types total.',
    ],
  },
  {
    v: 127,
    title: 'F36: 100% Normalized Stacked Bar chart (49th chart type) + J-track: docs updated to 49 types',
    ts: '2026-06-29T13:00:00Z',
    items: [
      '100% Normalized Stacked Bar chart (F36, Composition group, CDF-only): every bar is scaled to 100% of its category total and divided into proportional colour-coded segments — ideal for comparing compositional mix across categories where absolute magnitudes matter less than relative share (market share by quarter, budget allocation by department, survey response breakdown by region). Data binding: labelCol (category axis) + multi-series (same as Stacked bars and Area stacked — each series maps a colour band and a numeric column). Inspector options: Rotate labels (tilts x-axis labels for long category names), Value format, Height (px). Fixed 0%–100% y-axis with 25% gridlines. Legend row below the chart maps colour dots to series names; clicking a legend chip toggles that series on/off (shared _toggleLegend helper). Animation: segments within each column animate simultaneously in a staggered column-by-column entrance (40 ms base + 45 ms × column index, ease-out, respecting prefers-reduced-motion and the per-panel Animate toggle). Hover: each segment shows category name, series name, raw formatted value, and percentage in a native tooltip. PDC.barNorm extension in studio-charts.js (pdc-ui.js stays pristine); gallery SVG thumbnail in both CHART_SVG picker (studio.js) and model.js thumb; autoPickCols maps first string column → labelCol and first two numeric columns → series. 5 new F36 Playwright checks. 49 chart types total.',
      'J-track: docs/index.html updated to 49 chart types — added ct-barNorm card (Composition group, CDF badge) and ct-ridgeline card (Distribution group, CDF badge) with descriptions and correct section anchors; tip text and Simple vs Advanced section count updated from 47 → 49.',
    ],
  },
  {
    v: 126,
    title: 'F35: Ridgeline / joy plot chart (48th chart type) + H-track: Expand all / Collapse all inspector sections',
    ts: '2026-06-29T12:00:00Z',
    items: [
      'Ridgeline / joy plot chart (F35, Distribution group, CDF-only): the iconic \'joy plot\' visualization that stacks horizontal density curves per category with a configurable overlap ratio, producing the signature mountain-ridge silhouette. Each category\'s numeric values are Gaussian-KDE-estimated (Silverman bandwidth, same as the violin chart) and drawn as a filled + outlined density curve sweeping left-to-right across a shared value axis. Categories stack bottom-to-top so distribution shapes are instantly comparable across groups — ideal for latency by service tier, sales by region, response times across teams, or any scenario where you want to compare both the shape and the centre of multiple distributions simultaneously. Data binding: labelCol (the category that produces each horizontal ridge) + valueCol (the numeric distribution). Multiple rows with the same labelCol value are all included in that category\'s density curve. The overlap ratio (0 = no overlap, 0.9 = heavy overlap) is a slider in the inspector — lower values give a clear separated view; higher values produce the dramatic overlapping \'joy plot\' effect. Faint vertical grid lines on the shared x-axis, category labels coloured to match their ridge, baseline rules per ridge, and hover tooltips showing category name, count, and median. Animated entrance: ridges fade in staggered from bottom to top (60 ms delay per ridge, respecting prefers-reduced-motion and the per-panel animation flag). PDC.ridgeline extension in studio-charts.js (pdc-ui.js stays pristine). Gallery SVG thumbnail in CHART_SVG picker and model.js thumb. autoPickCols: first string column → labelCol; first numeric column → valueCol. 48 chart types total.',
      'Inspector Expand all / Collapse all (H-track): two compact text buttons (\'Expand all\' and \'Collapse all\') appear below the inspector search bar, letting builders instantly open or shut every inspector section with a single click. Invaluable when navigating a panel with 10–15 sections: collapse all to get an overview, then expand the one you need; or expand all to compare settings across sections. Button state persists like individual section collapses (updates localStorage on click). Complements the existing per-section collapse via clicking the section header.',
    ],
  },
  {
    v: 125,
    title: 'F34: Grouped bar chart (47th chart type) + H-track: Slideshow mode',
    ts: '2026-06-29T11:00:00Z',
    items: [
      'Grouped bar chart (F34, Comparison group, CDF-only): the classic side-by-side multi-series bar chart for direct visual comparison across categories — ideal for Q1/Q2/Q3 by Region, Budget vs Actual vs Forecast by Department, or any scenario where absolute values matter more than cumulative totals (use Stacked bars for the latter). Each category occupies a group; within the group, one bar per series appears side-by-side with a small gap between bars. Bars are automatically centered within the group width and capped at 40 px each so wide charts stay readable. Data binding: labelCol (category axis) + multi-series (same as Stacked bars and Area stacked). Inspector options: Rotate labels (tilts x-axis labels -38° for long category names), Value format, Height (px). Legend row below the chart maps color dots to series names; clicking a legend chip toggles that series on/off (shared _toggleLegend helper). Animated entrance: each bar fades in staggered 25 ms × (category index + series index) using a quadratic ease-out, respecting prefers-reduced-motion and the per-panel Animate entrance toggle. Hover: each bar column shows a native tooltip (series name + formatted value). CDF-only (no CCC grouped-bar equivalent in the Studio CDE export). PDC.groupedBars extension in studio-charts.js (pdc-ui.js stays pristine); gallery SVG thumbnail in both CHART_SVG picker (studio.js) and model.js thumb. Dispatch case in studio-render.js. 4 new F34 Playwright checks. 47 chart types total.',
      'Slideshow mode (H-track): \'⋯ More → Slideshow ▶\' launches a full-screen presentation mode that cycles through all canvas panels one at a time. Each slide re-renders the selected panel at full resolution using the same buildHtml + single-panel iframe technique as Panel zoom (v118), so chart quality is identical to the CDF export. Navigation: ‹ Prev and Next › buttons in the slide header, or keyboard arrow keys (←/↑ = previous, →/↓ = next). The header also shows the panel title and a \'1 / N\' counter. Press Escape or click the \'× Close\' button to exit. Test hooks: window.__slideshowOpen (opens the overlay), window.__slideshowActive (boolean), window.__slideshowPanel() (current panel index). CSS: .ss-overlay / .ss-hdr / .ss-title / .ss-counter / .ss-nav / .ss-close / .ss-frame in studio.css. 4 new H-track Slideshow Playwright checks.',
    ],
  },
  {
    v: 124,
    title: 'F33: Pareto chart (46th chart type) + H-track: \'/\' keyboard shortcut for gallery search',
    ts: '2026-06-29T10:00:00Z',
    items: [
      'Pareto chart (F33, Comparison group, CDF-only): the classic 80/20 rule visualisation that pinpoints the vital few causes dominating the cumulative total. Vertical bars are automatically sorted largest-to-smallest (leftmost = most impactful), with a secondary right y-axis (0–100%) overlaid by an orange cumulative percentage line connecting dot markers at each category\'s running total. An optional dashed red 80% reference line (enabled by default) makes it immediately obvious which categories account for 80% of the total — the critical threshold in quality management, defect analysis, customer complaint prioritisation, and inventory optimisation. Data binding: labelCol (category name) + valueCol (numeric measure). Inspector options: \'80% reference line\' toggle, Value format, and Height (px). Colors: bars in the brand Pentaho blue (decreasing opacity right-to-left to reinforce the descending hierarchy); cumulative line in orange (#e67e22); reference line in red. Hover over any bar column to see the category name, formatted value, and cumulative percentage. Animated entrance: bars fade in staggered left-to-right (40 ms gap), then the cumulative line and dots appear after the last bar settles (phases 1 and 2 separated by 60 ms). PDC.pareto extension in studio-charts.js (pdc-ui.js stays pristine). Gallery SVG thumbnail in both CHART_SVG picker (studio.js) and model.js thumb. Dispatch case in studio-render.js. 4 new F33 Playwright checks. 46 chart types total.',
      '\'/\' keyboard shortcut for chart gallery search (H-track): pressing \'/\' anywhere in the builder when a panel is selected focuses the chart-type gallery search input (.cg-search), exactly as \'/\' focuses the search bar in GitHub, Jira, and Linear. The handler guards against input/textarea/select targets and modifier keys (Meta/Ctrl/Alt) so it never steals keystrokes from typing. The shortcut is listed in the keyboard shortcuts modal (? key) under the key \'/\' with description \'Focus chart-type gallery search (panel selected)\'. 2 new H-track Playwright checks. 675 tests total.',
    ],
  },
  {
    v: 123,
    title: 'F32: Icicle/partition chart (45th chart type) + H-track: series color palette presets',
    ts: '2026-06-29T00:00:00Z',
    items: [
      'Icicle / partition chart (F32, Composition group, CDF-only): a two-level rectangular partition layout where parent categories occupy a proportional strip across the top 36% of the chart, and child items fill the bottom 64% within their parent\'s column. The visual encodes both the parent-to-whole ratio (column width) and the within-parent composition (sub-column width), making it instantly clear which categories dominate and how each breaks down internally. Particularly effective when treemap packing feels too random and sunburst feels too hard to read numerically. Data binding: labelCol (child label), valueCol (numeric measure), groupCol (parent category — optional; when omitted, renders a single-level proportional strip). Options: Value format and Height. Colors from the brand palette; parent bars use full opacity while child cells use decreasing opacity left-to-right to emphasise rank within the group. Hover over any cell to see group, label, and formatted value in a tooltip. Animated entrance: cells fade in left-to-right with a 45 ms stagger (respects prefers-reduced-motion). PDC.icicle extension in studio-charts.js (pdc-ui.js stays pristine); gallery SVG thumbnail in both CHART_SVG picker (studio.js) and model.js thumb. autoPickCols: first string column → labelCol; first numeric column → valueCol; second string column → groupCol. 3 new F32 Playwright checks.',
      'Series color palette presets (H-track): a \'Series palette\' swatch row in the Dashboard inspector lets you swap the entire chart series palette with one click. Five built-in palette groups — default (Pentaho blue-family), Ocean (cool blues + cyans), Forest (greens + teals), Sunset (warm reds + oranges), and Dusk (purples + magentas) — each with separate light-mode and dark-mode colour ramps so charts look equally sharp in both themes. The selected palette injects CSS variable overrides (--c1…--c10) into both the live preview and exported CDF HTML, ensuring export fidelity. The active swatch is highlighted; clicking Default restores the standard Pentaho palette. Stored as spec.paletteKey (empty string = default). Palette presets are defined in Studio.PALETTE_PRESETS in model.js. 3 new H-palette Playwright checks. 45 chart types total, 669 tests.',
    ],
  },
  {
    v: 122,
    title: 'F31: Population pyramid — mirrored back-to-back bar chart (44th chart type)',
    ts: '2026-06-29T23:00:00Z',
    items: [
      'Population pyramid chart (F31, Comparison group, CDF-only): the classic \'butterfly\' or \'back-to-back\' bar chart where two groups of values are measured across the same set of categories, with one group\'s bars extending leftward and the other\'s extending rightward from a shared centre column of category labels. Originally developed for visualising age–sex population distributions (hence the name), the layout is equally effective for any two-group side-by-side comparison: male vs female, before vs after, Group A vs Group B, budget vs actual, approve vs disapprove, urban vs rural. The shared centre axis makes it immediately clear which categories have the largest imbalance between the two sides, and the mirrored symmetry reveals structural patterns that a conventional grouped bar chart would obscure. Data binding: labelCol (the shared category axis — e.g. age group, product line, region), leftCol (the numeric measure for the left side), and rightCol (the numeric measure for the right side). The column names auto-populate the side labels in inspector, but those can be overridden via the \'Left-side label\' and \'Right-side label\' text options. Inspector options: Left-side label, Right-side label, Left bar color (color token), Right bar color (color token), Value format, and Height (px). Configurable colors default to the secondary brand color (left) and primary Pentaho blue (right) — two visually distinct tones that work in both light and dark themes. Bars animate in from the centre outward using a quadratic ease-out curve, staggered 35 ms per row (respects prefers-reduced-motion and the per-panel animate toggle). Value labels appear inside bars wide enough to hold them. Hover over any bar to see the category name, side label, and formatted value. PDC.pyramidBar extension in studio-charts.js (pdc-ui.js stays pristine). Gallery SVG thumbnail in both CHART_SVG picker (studio.js) and model.js thumb field. autoPickCols: first string column → labelCol; first numeric column → leftCol; second numeric column → rightCol. Docs updated to 44 types. Also fixed stale \'All 20 chart types\' reference in the Simple vs Advanced mode docs section (now correctly reads \'All 44 chart types\'). 3 new F31 Playwright checks. 44 chart types total.',
    ],
  },
  {
    v: 121,
    title: 'F30: Radial bar chart — concentric arc tracks for ranking key metrics (43rd chart type)',
    ts: '2026-06-29T22:00:00Z',
    items: [
      'Radial bar chart (F30, Comparison group, CDF-only): a circular chart layout where each category is assigned a dedicated concentric arc track, and the arc length is proportional to that category\'s value. All arcs share the same start point (12 o\'clock / top) and sweep clockwise up to 270°, leaving a deliberate gap in the lower-left so the start/end reference is always visible. Categories are automatically sorted so the longest arc occupies the outermost (most visually prominent) track, producing an instant visual hierarchy. A compact legend row below the circular area maps color dots to category names. Value labels appear near the tip of each arc when the arc is wide enough to position the label without overlap. Hover over any arc to see the category name and formatted value in a native tooltip. Animated entrance: arcs grow from near-zero to their final angle, staggered 55 ms per track, using a cubic ease-out curve (respects prefers-reduced-motion and the per-panel animation toggle). Particularly effective for executive dashboards where a handful of key KPIs need to be compared quickly — the circular racetrack format is visually striking, compact, and immediately communicates ranking without a linear axis. Configurable options: Max value (overrides the auto-detected maximum to set a common scale across panels), Value format, and Height. Data binding: labelCol + valueCol (same simple two-column binding as Bar chart or Lollipop). PDC.radialBar extension in studio-charts.js (pdc-ui.js stays pristine); gallery SVG thumbnail in both CHART_SVG picker (studio.js) and model.js thumb field. autoPickCols falls through to the default two-column heuristic. Docs updated to 43 types with Waffle and Radial bar entries added. 3 new F30 Playwright checks. 43 chart types total.',
    ],
  },
  {
    v: 120,
    title: 'F29: Timeline / milestone chart — alternating horizontal timeline (42nd chart type)',
    ts: '2026-06-29T18:00:00Z',
    items: [
      'Timeline / milestone chart (F29, Trend group, CDF-only): a horizontal baseline with diamond markers positioned at equal intervals, alternating above and below the centreline — the classic \'alternating timeline\' layout used for product roadmaps, release trains, project milestones, and historical event sequences. Data binding: labelCol (event or milestone name, required) and dateCol (date or period label, optional — shown on the opposite side of the baseline from the event name so both are readable simultaneously). An optional colorCol paints each marker in a category-aware palette. Hover over any diamond to see the event name and date in a tooltip. Animated entrance: stalks, diamonds, and labels fade in left-to-right, staggered 38 ms apart (respects prefers-reduced-motion). PDC.timeline extension added to studio-charts.js (pdc-ui.js stays pristine); gallery SVG thumbnail in both picker (studio.js CHART_SVG) and model.js thumb; autoPickCols heuristics assign the first string column as labelCol and the second (if present) as dateCol; dateCol is an optional column picker (blank allowed). 3 new F29 Playwright checks. 42 chart types total.',
    ],
  },
  {
    v: 119,
    title: 'F28: Waffle chart — part-to-whole grid visualization (41st chart type)',
    ts: '2026-06-29T17:00:00Z',
    items: [
      'Waffle chart (F28, Composition group, CDF-only): a 10×10 grid of colored squares where each cell represents exactly 1% of the total. Ideal for \'X in every 100\' storytelling (e.g. \'73 of every 100 customers chose option A\') — audiences immediately grasp proportions from counting squares, unlike pie/donut where angle estimation is required. Data binding: labelCol + valueCol (same as donut). Cell counts are distributed across categories proportionally, with remainder cells allocated by largest fractional remainder so the grid always totals exactly 100. Colors from the brand palette; a compact legend on the right shows category names and percentages. Hover over any cell to see category name, cell count, and percentage. Animated entrance: cells fill in row-by-row, left-to-right (staggered 8ms per cell; respects prefers-reduced-motion). The grid columns count is configurable (default 10); a legend is always shown. PDC.waffle extension in studio-charts.js (pdc-ui.js stays pristine); gallery SVG thumbnail in both picker and model.js thumb. 3 new F28 Playwright checks. 41 chart types total.',
    ],
  },
  {
    v: 118,
    title: 'H-track: Panel zoom — full-screen single-panel viewer for SE demos',
    ts: '2026-06-29T16:00:00Z',
    items: [
      'Panel zoom (H-track): click the ↗ maximize button that appears on hover of any canvas panel to open it in a full-screen overlay. The panel is re-rendered standalone at full resolution — no library, no inspector, no other panels — so you can zoom in on a specific insight and present it to stakeholders without leaving the builder. An \'Exit zoom\' pill floats at the bottom-right corner; pressing Escape also closes the overlay. This complements Focus mode (which collapses the builder panes) by isolating a single chart at full viewport size. Uses the same buildHtml pipeline as the CDF exporter so the chart renders pixel-perfectly. 6 new H118 Playwright checks. Test suite 651/651.',
    ],
  },
  {
    v: 117,
    title: 'H-track: Demo mode — live data simulation for SE demos',
    ts: '2026-06-29T12:00:00Z',
    items: [
      'Demo mode (H-track): a new \'⋯ More → Demo mode ▶\' toggle makes the builder preview look like a live dashboard by refreshing numeric values every 4 seconds with small deterministic variations (±8% per column-row-tick). Perfect for SE demos — show stakeholders a dynamic, realistic dashboard without needing a live Pentaho server. A pulsing red \'● LIVE\' badge appears in the topbar while active; the canvas status bar shows \'· demo LIVE\'. Clicking the button again stops the simulation, removes the badge, and restores the original sample data. The genMockLive() function varies values using a tick counter (not Math.random) so it is deterministic and resumable. 5 new H117 Playwright checks. Test suite 644/644.',
    ],
  },
  {
    v: 116,
    title: 'Mobile navigation actually works now — topbar swipe-scroll + changelog fix + a real mobile-nav test gate',
    ts: '2026-06-29T00:00:00Z',
    items: [
      'Mobile topbar now scrolls horizontally — swipe to reach every menu and button. Previously the row was clipped (overflow:hidden), so buttons past the right edge were impossible to tap. Dropdown menus now float to a fixed full-width sheet below the topbar so they are never cut off.',
      'Changelog popout is pinned inside the phone viewport (no more spilling off the bottom-right). The earlier attempt was silently overridden by a later CSS rule; using the element id makes the phone rule win.',
      'Added a mobile core-navigation test suite (MNAV, phone 390px) that checks real function — no horizontal overflow, the topbar is swipe-reachable at both ends, dropdowns and the changelog open within the viewport, and the Library/Inspector drawers actually slide on-screen. These guard against mobile silently regressing again. Test suite now 640.',
    ],
  },
  {
    v: 115,
    title: 'F27: Candlestick / OHLC chart (40th type) + J-track: docs updated to 40 chart types',
    ts: '2026-06-29T09:00:00Z',
    items: [
      'F27 — Candlestick / OHLC chart (40th chart type, Trend group, CDF-only): a financial-style open-high-low-close candle chart where each period is represented by a candle body spanning [open, close] and thin wicks extending to the [high] and [low] extremes. Bullish candles (close ≥ open) are filled in a configurable \'up\' color (default green); bearish candles (close < open) are filled in a \'down\' color (default red). The body fill-opacity is slightly higher for bearish candles to make the direction immediately readable. A subtle grid lines + right-side y-axis label system gives value context without clutter. Hover tooltips show O/H/L/C values and a directional ▲/▼ indicator. Animated entrance: candle bodies fade in staggered (respects prefers-reduced-motion and per-panel animate flag). Inspector options: Up color, Down color, Value format, and Height (px). Auto-pick heuristic: first string column → labelCol; favors column names containing \'open\'/\'start\', \'high\'/\'max\', \'low\'/\'min\', \'close\'/\'end\' for the OHLC slots respectively, then falls back to positional numeric column order. The four OHLC fields are named descriptively in the inspector so the binding intent is always clear (\'Open column (period start value)\' etc.). Useful for revenue ranges across fiscal periods, daily/weekly price data, performance spread tracking, or any time-series scenario where the full range plus open/close marks communicates more than a single value. PDC.candlestick extension in studio-charts.js (pdc-ui.js stays pristine). Gallery SVG thumbnail in both CHART_SVG picker (studio.js) and model.js thumb field: 4 alternating green/red candles with wicks on a baseline. 3 new F27 Playwright checks. 40 chart types total.',
      'J-track — Docs chart reference updated to cover all 40 chart types: docs/index.html chart-types section now includes entries for all 11 chart types added since the last docs update (v99 — which documented 29 types). Added: Dumbbell, Marimekko/Mekko, Diverging bars, Parallel coordinates (Comparison group); Packed bubbles, Word cloud (Composition group); Step chart, Bump/ranking, Stream graph, Candlestick/OHLC (Trend group); Violin plot (Distribution group). Each entry has the correct CDF/CDE badge, a concise description, and an id=\'ct-{key}\' anchor matching the gallery \'?\' help link. The tip text updated from \'29 types\' to \'40 types\'. Test suite 634/634.',
    ],
  },
  {
    v: 114,
    title: 'F26: Parallel coordinates chart (33rd type) + H-track: KPI subtitle text',
    ts: '2026-06-29T06:00:00Z',
    items: [
      'F26 — Parallel coordinates chart (33rd chart type, Comparison group, CDF-only): a multi-dimensional profile chart that draws each entity as a polyline crossing a set of vertical parallel axes — one axis per numeric column. Ideal for comparing entities across many metrics simultaneously (e.g. comparing regions by Revenue, Cost, Margin, and Units). Each row in the query result becomes a colored polyline; entity labels are bound via labelCol and numeric axes via the standard series column list. Axis min/max are computed per-column; value ticks appear at the top and bottom of each axis; axis names are truncated to 13 characters with a bold heading above each axis. Lines are semi-transparent (default 70% opacity, configurable) and use the PDC palette; dot markers appear at each axis crossing for datasets with ≤12 entities. Hover highlights the hovered polyline (opacity 1, thicker stroke) while fading all others to near-invisible (7%), and shows a tooltip with all axis values. Animated entrance: lines and dots fade in staggered (respects prefers-reduced-motion). Inspector options: Line opacity (%) and Height (px). PDC.parallelCoords extension in studio-charts.js (pdc-ui.js stays pristine). Gallery SVG thumbnail in both CHART_SVG picker and model.js thumb. Studio.newPanel auto-binds the first column as labelCol and remaining columns as series. 3 new F26 Playwright checks. 33 chart types total.',
      'H-track — KPI subtitle text: each KPI tile now supports an optional subtitle line (italic, muted color, clipped to one line with ellipsis overflow) that appears below the main value. Added \'Subtitle text\' inspector field in the KPI inspector section (after \'Info tooltip\'). Subtitle is stored in k.subtitle and post-processed into a .kpi-sub div appended to the .kpi tile after PDC.kpis() renders (pdc-ui.js stays pristine). .kpi-sub CSS injected via kpiSubCss constant in exporters.js, so it appears in both the live builder preview and exported CDF HTML. Studio.newKpi initializes subtitle to \'\'. 2 new H114 Playwright checks. Test suite 631/631.',
    ],
  },
  {
    v: 113,
    title: 'H-track: interactive table chart — sortable columns + live row search',
    ts: '2026-06-28T10:00:00Z',
    items: [
      'H-track — Enhanced interactive table chart: the built-in table chart type now has two interactive features that make it dramatically more useful for SE demos and live presentations. (1) Live row search: a compact filter bar appears above every table with a search input (placeholder \'Filter rows…\') and a live row-count badge. As you type, rows are filtered case-insensitively across all columns simultaneously — so typing \'north\' in a regions table instantly hides every row that doesn\'t contain \'north\' anywhere. The count badge updates to show \'N / M\' when filtered, or \'N rows\' when unfiltered. The filter input traps keystrokes so typing letters like \'n\', \'f\', or \'?\' does not accidentally trigger global keyboard shortcuts. (2) Click-to-sort column headers: every column header now has a ↕ sort indicator. Click once to sort ascending (↑ highlighted in Pentaho blue), click again to sort descending (↓), click a third time to restore the original order (↕ dimmed). Numeric columns sort by value; text columns sort lexicographically. (3) Alternating row stripes (.tbl-stripe) use a light semi-transparent fill on every odd-indexed row, improving readability for wide tables without introducing a new color. Implementation: PDC.table is overridden in studio-charts.js (pdc-ui.js stays a pristine vendor mirror); the original is preserved as PDC._tableBase. All original cfg options work unchanged: bar cells, badge cells, custom fmt, col.num, col.title, detail drawer, and recordDetail record cards all continue to function — the override handles sorting/filtering by passing the visible (post-sort, post-filter) row set to the row-click handler so clicking always opens the correct record even after reordering. CSS is injected once per document context (iframe + exported CDF) via a guarded style tag, so the enhancements appear in both the live builder preview and every exported CDF .html file. 5 new H113 Playwright checks. Test suite 626/626.',
    ],
  },
  {
    v: 112,
    title: 'F25: Stream graph (32nd chart type) + H-track: gallery text search',
    ts: '2026-06-28T08:00:00Z',
    items: [
      'F25 — Stream graph (32nd chart type, Trend group, CDF-only): a variant of the stacked area chart where the baseline shifts at every data point so the entire stack is visually centred around a horizontal midline — producing organic, flowing ribbon shapes instead of a bottom-anchored floor. Each series becomes a filled band whose lower and upper edges are computed using the ThemeRiver layout (lower = −half-total + cumulative-below; upper = lower + own value). Edges are smoothed using a cardinal-spline approximation (cubic bezier, tension 0.35) for that characteristically fluid look. Result: layered river-of-data shapes ideal for evolving volume, market share, or composition-over-time datasets where the \'floor bias\' of a conventional stacked area would over-weight the bottom series. Same data binding as Stacked area (labelCol + multi-series columns). Inspector options: Value format and Height (px). Hover tooltip lists all series values + total at the x position under the cursor. Clickable legend chips toggle individual series on/off (same _toggleLegend helper as areaStacked / radar). Animated entrance: each ribbon fades in staggered at 80 ms per layer. Gallery SVG thumbnail: three flowing ribbon bands (blue/purple/teal) centred on a dashed midline. Included in the period-highlight and event-marker type-aware lists so those annotations are available on stream graphs. PDC.streamgraph extension in studio-charts.js; pdc-ui.js stays pristine. 4 new F25 Playwright checks. Test suite 619/619. 32 chart types total.',
      'H-track — Chart gallery text search: a search input (.cg-search) now appears above the group-filter tab row in the chart-type picker section of the panel inspector. As you type, card labels and descriptions are matched case-insensitively; non-matching cards are hidden and group-header labels are suppressed (the search result is a flat filtered list). An inline × clear button (SVG, accessible, aria-labeled) appears when the field is non-empty and restores the gallery to its current tab view on click. The search input blocks the keydown event from bubbling so typing letters like \'n\', \'f\', or \'?\' does not accidentally trigger the global keyboard shortcuts. Composing well with the group tabs: clearing the search returns to whichever group was last selected. Zero new dependencies; 2 new H112 Playwright checks.',
    ],
  },
  {
    v: 111,
    title: 'F24: Diverging bar chart (31st chart type)',
    ts: '2026-06-28T06:00:00Z',
    items: [
      'F24 — Diverging bar chart (31st chart type, Comparison group, CDF-only): a horizontal bar chart where each bar extends either right (positive values, brand blue) or left (negative values, accent red) from a shared zero baseline. Immediately reveals both direction and magnitude for mixed positive/negative datasets — budget surplus/deficit, quarter-on-quarter growth rates, temperature anomalies above/below seasonal average, Net Promoter Score components, approval vs. disapproval splits, or any measure where \'is this above or below zero?\' is the first question. Each row shows a category label right-aligned in a fixed label column on the left, and a colour-coded bar extending from the zero line. Positive bars are brand blue (#005bb5, configurable via \'Positive color\' inspector option); negative bars are accent red (configurable via \'Negative color\'). A dashed vertical zero baseline with subtle +/− tick labels orients the viewer instantly. Hover tooltips show the label and formatted value. Value labels appear inside bars wide enough to hold them (≥26 px). Animated entrance: bars grow from the zero baseline outward using a cubic-bezier ease, staggered 40 ms per row (respects prefers-reduced-motion and per-panel animate toggle). Inspector options: Positive color, Negative color, Value format, Height (px). Auto-pick: first column → labelCol, second column → valueCol (same two-column binding as Bar chart so existing CDA queries just work). PDC.divergingBar extension in studio-charts.js (pdc-ui.js stays pristine). Gallery SVG thumbnail in both the CHART_SVG picker (studio.js) and model.js thumb field: four horizontal bars — two positive (blue, right) + two negative (red, left) — centred on a dashed zero line. 4 new F24 Playwright checks. Test suite 615/615. 31 chart types total.',
    ],
  },
  {
    v: 110,
    title: 'F23: Gantt / Timeline chart (30th type) + H-track: persist inspector collapse state',
    ts: '2026-06-28T04:00:00Z',
    items: [
      'F23 — Gantt / Timeline chart (30th chart type, Comparison group, CDF-only): horizontal floating-bar chart where each row represents a task, phase, or event. Each bar starts at startCol and ends at endCol (any numeric values — days, percentages, indices, or ordinal measures). The x-scale is derived automatically from the full range of start and end values across all rows, so relative positioning is always correct without extra configuration. Each row bar is independently colored via PDC.color(), making overlapping or adjacent tasks easy to distinguish. Hover tooltip shows the task label, formatted start value, formatted end value, and formatted duration (end − start). Value annotations in the right end of bars wider than 30 units. Animated entrance: bars scale in from their left edge using a cubic-bezier ease-in-out, staggered 35 ms apart per row. Inspector options: Start column label (header above the start value in tooltips, default \'Start\'), End column label (default \'End\'), Value format, and Height (px). Auto-pick heuristic: first string column → labelCol, first numeric column → startCol, second numeric column → endCol. PDC.gantt extension in studio-charts.js (pdc-ui.js stays pristine). Gallery SVG thumbnail: 4 staggered horizontal floating bars with a dashed left-edge axis line. 4 new F23 Playwright checks. 30 chart types total.',
      'H-track — Persist inspector section collapse state to localStorage: the _collapsedSects object (which controls which inspector section headers are expanded vs collapsed) is now loaded from localStorage at startup and saved back after every toggle. This means the user\'s preferred inspector layout — e.g. \'I always want Quick help collapsed\' or \'I keep the animation section collapsed\' — survives page reloads and browser restarts. The localStorage key is \'studio-insp-collapsed\' (a JSON object mapping section title → bool). On first load the key is absent (defaults to {}), so all sections remain expanded as before. The key is included in the Clear local data wipe (E8) so it resets with everything else. 2 new H-collapse Playwright checks. Test suite 611/611.',
    ],
  },
  {
    v: 109,
    title: 'M9–M12: mobile overflow, topbar accessibility, restore-banner polish, footer',
    ts: '2026-06-28T02:00:00Z',
    items: [
      'M9 — Horizontal overflow / white sidebar fix: added html{overflow-x:hidden} globally. The body element already clipped its own scroll box with overflow:hidden, but the html root element was unconstrained, allowing any wider-than-viewport child to create a horizontal scroll channel at the document level (showing as a white gutter on the right on Android). Sealing the html root prevents this. Two new Playwright checks verify html overflowX === \'hidden\' and documentElement.scrollWidth ≤ viewport + 2 at 390 px.',
      'M10 — Top menus reachable on all phones: extended the threshold for hiding Examples, Open, and Save from the topbar from ≤400 px to ≤640 px. These three buttons are always accessible via the ⋯ More drawer (moreExamples / moreImport / moreSaveSpec). Previously, on phones between 400–640 px, the topbar had overflow:hidden which silently clipped those buttons — they were neither visible nor reachable. The global .more-phone-only{display:none} rule is placed BEFORE the @media(≤640px) block so the media-query display:block override wins in the same-specificity cascade. Two new Playwright checks verify the buttons are hidden from the topbar and accessible via More at 390 px.',
      'M11 — Restore-banner dismiss button polish: at ≤640 px, .restore-banner .rb-acts .btn now gets min-height:44 px + flex:1 + flex centering so each button fills a full-width touch-friendly row (≥ 36 px tappable height verified by test). The dismiss button text was renamed from \'Dismiss\' to \'No thanks\' so its intent is unambiguous next to \'Restore\'. One new Playwright check.',
      'M12 — Changelog popup fits phone viewport: .changelog-pop at ≤640 px is now constrained to width:min(96vw,380px) so it cannot overflow a narrow phone. The status-bar footer is tightened (font-size 10.5 px, gap 6 px, padding 0 8 px) and the build stamp is hidden at phone widths where it adds clutter without improving readability. One new Playwright check. Test suite 605/605.',
    ],
  },
  {
    v: 108,
    title: 'F22: Word cloud chart (27th chart type) + H-track: auto-save state indicator',
    ts: '2026-06-28T23:59:00Z',
    items: [
      'F22 — Word cloud (27th chart type, Composition group, CDF-only): a classic word-cloud visualization where each text item is rendered at a font size proportional to its numeric value via a log scale (ensuring very-large values do not completely drown out smaller ones). Items are placed on the canvas starting from the centre and spiraling outward along an Archimedean spiral; at each candidate position the algorithm checks bounding-box overlap with all already-placed words and advances along the spiral until a non-overlapping position is found or the canvas is exhausted. Font sizes scale from 11 px (smallest value) to 52 px (largest value); the three heaviest words use bold weight for visual hierarchy. Colors cycle through the PDC.color() brand palette, so dark mode works for free. Hover tooltip shows the label + formatted value for every word. Animated entrance: each word fades in with a staggered 22 ms delay (respects prefers-reduced-motion via canAnim()). Cap at 60 words for performance. Inspector options: Value format, Height (px), and Max words (default 60). Auto-pick maps the first string column to labelCol and the first numeric column to valueCol. PDC.wordCloud extension in studio-charts.js (pdc-ui.js stays pristine). Gallery SVG thumbnail: 6 words in varying sizes arranged in a cloud. 4 new F22 Playwright checks.',
      'H-track — Auto-save state indicator: the topbar now shows a subtle \'Saved ✓\' confirmation label (#saveState) after each successful localStorage auto-save. The label appears with a 0.25 s CSS opacity fade-in, stays visible for 2 s, then fades away. At rest the element is invisible (opacity 0) so it adds no visual noise during normal authoring; it only surfaces as positive feedback after the 1.5 s debounce fires and the spec is committed to localStorage. Implemented as a single <span> between the dash-id and the spacer; scheduleAutosave() sets the \'saved\' class on success and clears it via a second setTimeout. The green color uses var(--green, #27ae60) so it works in both light and dark themes. 2 new H-save Playwright checks. Test suite 599/599.',
    ],
  },
  {
    v: 107,
    title: 'F21: Packed bubble chart (26th chart type) + H-track: duplicate dashboard',
    ts: '2026-06-28T23:00:00Z',
    items: [
      'F21 — Packed bubbles (26th chart type, Composition group, CDF-only): a force-directed bubble cluster chart where each category becomes a circle whose AREA is proportional to its value. Unlike a scatter plot (which uses x/y position to encode two variables) or a treemap (rectangular tiling), the packed bubble layout arranges circles of varying sizes in a compact, non-overlapping cluster — perfect for comparing portfolio shares, segment sizes, category volumes, or any data where you want to visually convey \'which items are biggest?\' without a linear axis. Data binding: labelCol (one bubble per row) and valueCol (numeric value that drives circle area). Inspector options: Value format, Height (px), and Show labels toggle. Labels appear centred inside bubbles that are large enough to fit them; the formatted value is shown below the label in large bubbles. Hover tooltip shows label + formatted value for every bubble. Algorithm: a lightweight deterministic force-directed simulation (60 iterations) — gravity attracts all bubbles toward the container centre; repulsion pushes overlapping pairs apart; boundary clamping keeps all circles within the SVG. Deterministic (no Math.random), fast (<5ms for 30 bubbles), theme-aware (PDC.color() palette). Animated entrance: circles fade in and scale up staggered from index 0 (respects prefers-reduced-motion via canAnim()). Capped at 60 bubbles for performance. PDC.packedBubble extension in studio-charts.js (pdc-ui.js stays pristine). Gallery SVG thumbnail: 5 overlapping circles of varying sizes in brand palette. 4 new F21 Playwright checks.',
      'H-track — Duplicate dashboard: a new \'⧉ Duplicate current\' button added to the New ▾ menu, immediately below \'Blank dashboard\'. Clicking it clones the entire current spec (all panels, KPIs, filters, data sources, connections, grid settings, accent color, and tags), assigns a fresh unique ID, appends \' (copy)\' to the dashboard title, and appends \'-copy\' to the file-name stem — then loads the duplicate as the active spec. Useful when iterating on layouts for different stakeholders, creating template variations, or making a safe working copy before a risky structural change. Duplicate copies are immediately editable, exportable, and round-trippable (Open/Save). The topbar New button flashes \'Duplicated!\' for 1.2 s as visual confirmation. 2 new H-dup Playwright checks. Test suite 593/593.',
    ],
  },
  {
    v: 106,
    title: 'F20: Dumbbell chart (25th chart type) + H-track: print / PDF export',
    ts: '2026-06-28T22:00:00Z',
    items: [
      'F20 — Dumbbell chart (25th chart type, Comparison group, CDF-only): a horizontal connected-dot chart that makes the gap between two values immediately obvious. Each row shows a category label on the left, a muted gray dot at the \'start\' (baseline / before) value, a colored connector line, and a bold brand-colored dot at the \'end\' (current / after) value. The connector is green when end > start (improvement) and red when end < start (decline), so direction is decoded at a glance without reading numbers. Ideal for before-and-after comparisons (quarterly revenue growth), budget vs. actual, planned vs. achieved, target vs. performance, or any pair of measures where the gap tells the story. Data binding: labelCol (row label), startCol (baseline value), endCol (current value). Inspector options: Start label / End label (axis headers that appear above the value area, default \'Before\' / \'After\'), Value format, and Height. Compact value labels appear adjacent to each dot (the end value is bold to emphasize the current state). Animated entrance fades rows in sequentially. Auto-pick: cols[0]→labelCol, cols[1]→startCol, cols[2]→endCol. PDC.dumbbell extension in studio-charts.js (pdc-ui.js stays pristine). Gallery SVG thumbnail: 3 horizontal rows — green improvement and red decline connectors between gray start dots and blue end dots. Named \'Start value column (before / baseline)\' and \'End value column (after / target)\' in the inspector so the binding intent is always clear. 4 new F20 Playwright checks.',
      'H-track — Print / PDF export for CDF dashboards: exported CDF .html files now include a print button (🖨 SVG printer icon, id=\'printBtn\') in the dashboard header alongside the existing theme and query-info buttons. Clicking it calls window.print(), which triggers the browser\'s print dialog (Save as PDF on all modern browsers). A companion @media print stylesheet is injected into every exported CDF: makes the header position:static, hides interactive controls (#qInfoBtn, #themeBtn, #printBtn, #ctrls), sets a white background, removes card box-shadows, adds break-inside:avoid on cards and KPI rows, and tightens pdc-wrap padding — producing a clean, professional A4/letter layout. The print button and its CSS are excluded from the in-builder preview iframe (export-only) to avoid noise in the authoring view. 2 new H-print Playwright checks. Test suite 587/587.',
    ],
  },
  {
    v: 105,
    title: 'F19: Marimekko / Mekko chart (24th chart type)',
    ts: '2026-06-28T20:00:00Z',
    items: [
      'F19 — Marimekko chart (24th chart type, Comparison group, CDF-only): a two-dimensional proportional stacked bar chart where column WIDTH encodes the category\'s total share of the grand total and each column\'s HEIGHT segments encode within-category composition. The area of any single cell is therefore directly proportional to its value as a fraction of the grand total — the visual immediately answers both \'how big is this bucket?\' and \'what is it made of?\' simultaneously. Ideal for market share analysis (which regions are biggest? what products are inside each?), budget allocation breakdowns, customer segment profiles, and any dataset where you need a full hierarchical summary in one chart. Data binding: labelCol = x-axis category (drives column width), groupCol = stacking segment (required; drives stack heights), valueCol = numeric cell value. Inspector labels use descriptive names (\'Category column (drives column width)\' and \'Segment column (stacks within each category)\') so SE teams configure it without guessing. Optional % labels rendered inside each segment when the cell is large enough (≥18px tall, ≥22px wide) to fit — toggled via \'Show % labels\' inspector option. Hover tooltip shows segment name, category, value, share of column (%), and share of grand total (%). Compact top-positioned legend (group name + colour swatch). Animated entrance fades segments in left-to-right. Auto-pick assigns strCols[0]→labelCol, strCols[1]→groupCol, numCol→valueCol. groupCol is required (not optional) for marimekko — missingRequiredCols() enforces this. PDC.marimekko extension in studio-charts.js (pdc-ui.js stays pristine). Gallery SVG thumbnail: three variable-width stacked columns with blue/purple/teal segments. 4 new F19 Playwright checks. Test suite 581/581.',
    ],
  },
  {
    v: 104,
    title: 'F18: Bump / ranking chart + H-track: Ctrl+F library search',
    ts: '2026-06-28T18:00:00Z',
    items: [
      'F18 — Bump chart (23rd chart type, Trend group, CDF-only): shows how ranked positions change across periods — which entity is #1 this quarter vs. last quarter, who overtook whom. Uses the same labelCol + multi-series column binding as Line and Step charts (labelCol = the period/time axis; each series column = one entity\'s numeric value at each period). At each period, all series are ranked by their value (rank 1 = highest; dense ranking handles ties). Smooth cubic-bezier curves connect each entity\'s rank position across periods; lines crossing each other are immediately readable as competitive overtaking events. Each rank dot shows the rank number inside the dot in white; hovering reveals the entity name, period, rank, and raw value. Series labels with their final rank appear at the right edge. Animated entrance fades series lines in sequentially. Perfect for market share shifts, product performance tiers, regional rankings, vendor comparisons, and any competitive intelligence use case. PDC.bump extension in studio-charts.js (pdc-ui.js stays pristine). Gallery SVG thumbnail: three coloured lines (blue, purple, teal) crossing across 4 periods with dots at each point. 4 new F18 Playwright checks.',
      'H-track — Ctrl/Cmd+F library search: pressing Ctrl+F (or Cmd+F on Mac) anywhere in the builder now focuses the library search field (#libSearch) and selects any existing text, making it instant to filter the query library by name without reaching for the mouse. On phones (≤640px) the shortcut also opens the library drawer first, so the search is reachable before focusing it. The keyboard shortcuts modal (?) now lists this shortcut. 2 new H104 Playwright checks. Test suite 577/577.',
    ],
  },
  {
    v: 103,
    title: 'F17: Violin plot + H-track: dashboard accent color',
    ts: '2026-06-28T16:00:00Z',
    items: [
      'F17 — Violin plot (22nd chart type, Distribution group): for each category value (labelCol), all rows\' numeric values (valueCol) are grouped and kernel-density-estimated using a Gaussian KDE with Silverman\'s bandwidth selection rule. The density is rendered as a symmetric filled silhouette — wider where data is denser, narrowing toward the tails — giving an immediate read of the full distribution shape per category. An optional IQR box + median line (inspector toggle \'Show IQR box\', default on) sits inside each violin, so quartile reference is always available. Hover tooltip shows n · median · Q1/Q3 · min/max. PDC.violin extension in studio-charts.js (pdc-ui.js pristine). Gallery SVG thumbnail: three symmetric silhouettes per color with inner IQR boxes and white median lines. 3 new F17 Playwright checks. 22 chart types total.',
      'H-track — Dashboard accent color: a new \'Accent color\' field in the Dashboard inspector lets the SE team override --pentaho (the Pentaho brand color) for any dashboard. Six preset swatches offer one-click choices (Pentaho blue default, Ocean teal, Forest, Sunset, Royal, Coral rose) plus a custom hex color-picker for precise client branding. The selected color is stored as spec.themeColor and propagated to both the live preview iframe and the exported CDF HTML as a :root{--pentaho:...} CSS variable override appended after pdc-ui.css, so all chart colors, header accents, and link styles update automatically. Empty string restores the default Pentaho blue without changing pdc-ui.css. 3 new H103 Playwright checks. Test suite 571/571.',
    ],
  },
  {
    v: 102,
    title: 'F16: Step chart + H-track: gallery group filter tabs',
    ts: '2026-06-28T14:00:00Z',
    items: [
      'F16 — Step / staircase chart (Trend group): a new 21st chart type where each data-point transition is drawn as a horizontal run followed by a vertical jump, rather than a diagonal line. This right-angle path makes it unambiguous that the value jumps instantaneously at a precise point — rather than interpolating continuously between states. Ideal for pricing tiers, API quota levels, regulatory limits, SLA bands, budget allocations, and any step-function data. Uses the same labelCol + series column binding as Line / Stacked area charts. Inspector options: area fill (shaded below the step line; single-series only to avoid overlap), value format, and height. Animated entrance draws the step line left-to-right. Dots mark each data point with hover tooltips. Multi-series produces a stacked legend below the chart. CDF-only (no equivalent CCC/CDE chart type). PDC.step extension in studio-charts.js; pdc-ui.js stays pristine. Gallery SVG thumbnail: staircase path + semi-transparent area fill. 3 new F16 Playwright checks. 21 chart types total.',
      'H-track — Chart gallery group filter tabs: a row of clickable pill buttons (cg-filter / cg-tab) now appears above the chart-type grid in the panel inspector, making it fast to narrow the 21-type gallery to a single category without scrolling through all the group headers. Pills: All (default, shows everything), Comparison, Composition, Trend, Flow, Single value, Distribution, Detail, Content. Clicking a pill hides cards and group labels from all other categories; clicking All restores the full gallery. Active pill highlighted in brand blue. Each chart card carries a dataset.grp attribute (matching its group name) which the filter reads to toggle visibility. Filter is local to each panel-inspector render so switching between panels doesn\'t carry over an unexpected filter state. 3 new H102 Playwright checks: pill bar exists, tab count ≥ 8, clicking Trend filters to only Trend cards. Test suite 565/565.',
    ],
  },
  {
    v: 101,
    title: 'J6: interactive tutorial — step-by-step guided walkthrough',
    ts: '2026-06-28T12:00:00Z',
    items: [
      'J6 — Interactive tutorial (app/tutorial.js): a spotlight-based step-by-step guided walkthrough of the core builder workflow, distinct from the welcome tour (which is informational). Opens via ⋯ More → \'Interactive tutorial ▶\'. Six steps: (0) Welcome card — explains the format, no spotlight; (1) Query Library — spotlights the left pane and explains CDA data sources; (2) Canvas — spotlights the preview area and explains drag-to-add; (3) Inspector — spotlights the right pane and explains panel configuration; (4) Export — spotlights the Export button and explains the CDF/CDE/push options; (5) Done! — celebration card with next-step tip. Keyboard: → / ← advance/retreat steps, Escape closes. The active spotlight is rendered as 4 semi-transparent dim panels around the target element plus a purple highlight ring (PDC brand accent). Tooltip cards are positioned intelligently relative to each target (right, left, bottom, or centred) with overflow guards. StudioTutorial.isDone() checks completion (localStorage). StudioTutorial.currentStep() / .stepCount() and window.__studioTutorialActive / __studioTutorialStep hooks exposed for testing. 6 new J6 Playwright checks; test suite 559/559.',
    ],
  },
  {
    v: 100,
    title: 'J5: chart type descriptions + J3: Quick help contextual tips',
    ts: '2026-06-28T10:00:00Z',
    items: [
      'J5 — Chart type descriptions in the gallery: every chart type card in the panel inspector gallery now shows a one-line description subtitle (.lb-desc) beneath the chart name — e.g. \'Compare values across categories\' for Bar chart, \'Frequency distribution of a numeric column\' for Histogram. All 28 chart types in Studio.CHARTS received a concise, accurate desc property in model.js. The subtitle is styled in 8px faint text, capped at 2 lines, and does not affect card clickability or the existing .ct-help docs link. Helps builders choose the right chart at a glance without opening documentation. 3 new J5 Playwright checks.',
      'J3 — Quick help contextual tips in the inspector: every inspector type (Dashboard, Panel, KPI tile, Filter, Data Source) now includes a \'Quick help\' collapsible section with 3 practical tips relevant to the current view. The section is collapsed by default (low-clutter for experienced users) and can be expanded at any time; collapse state persists within the session via the existing _collapsedSects mechanism. Tips are rendered as a compact bullet list with branded dot markers. The H-track collapse tests updated to pick an expanded section (Quick help starts collapsed by default), keeping assertions intact. 3 new J3 Playwright checks. Test suite 553/553.',
    ],
  },
  {
    v: 99,
    title: 'J4: per-chart-type docs links + expanded chart reference',
    ts: '2026-06-28T08:00:00Z',
    items: [
      'J4 — Chart type gallery docs links: every chart type card in the panel inspector gallery now has a small SVG info-icon link (.ct-help) that appears on hover in the top-right corner of the card. Clicking it opens docs/index.html at the anchor for that specific chart type (e.g. #ct-bars, #ct-scatter, #ct-radar), so builders can jump straight to the relevant documentation without leaving the inspector. The link stopsPropagation so it does not also change the chart type. Styled with CSS: invisible at rest, 65% opacity on parent card hover, full opacity + accent color on direct hover. Zero impact on keyboard/screen-reader usage (aria-label set on each link).',
      'J4 — Expanded chart reference in docs/index.html: the Chart types section now documents all 29 types (up from 20 — the 9 previously undocumented types were: Radar/spider, Chord/wheel, Network/topology, Bullet chart, Calendar heatmap, Box plot, Dot plot, Beeswarm plot, Histogram). Cards are reorganised under h3 group headers (Comparison, Composition, Trend, Flow, Single value, Distribution, Detail) matching the gallery grouping in the builder. Each card now includes CDF/CDE badge indicators so readers can see at a glance whether a type round-trips to CDE. Every card has an id=\'ct-{key}\' anchor for deep-linking from the builder. The Simple mode tip updated from \'20 types\' to \'29 types\'. 4 new J4 Playwright checks. Test suite 547/547.',
    ],
  },
  {
    v: 98,
    title: 'J2: contextual help links in the inspector',
    ts: '2026-06-28T07:00:00Z',
    items: [
      'J2 — Contextual help links: every major section header in the inspector now shows a small SVG info-icon badge (class sec-help) that links directly to the most relevant section of the help documentation (docs/index.html#anchor). The badge reveals on hover of the section h4 and stays invisible otherwise — low-clutter, high-utility. Sections annotated: Dashboard, KPI tiles, Filters, Shareable link (→ exporting), Chart type, Data, Query preview (→ data-sources), KPI tile, Trend & delta, Data Source, SQL/MDX/Kettle/Metadata/Script query editors, Output columns, and Filter. All links open in a new tab. SVG icon (Studio.icon(\'info\')) is used so h4.textContent stays == the section title — no existing textContent-based tests broken.',
      'J2 — Inspector-level help link: a persistent \'?\' badge (#inspHelpLink, class insp-help-link) sits in the inspector pane header at all times, next to the Dashboard / Panel / Filter / Data Source / KPI tile title. Its href updates on every renderInspector() call to point to the best-matching docs anchor: builder (dashboard/filter/KPI), chart-types (panel/KPI inspector), or data-sources (DA inspector). Both light and dark themes covered via CSS custom properties. 4 new J2 Playwright checks. Test suite 543/543.',
    ],
  },
  {
    v: 97,
    title: 'K8: What\'s next? card + J-track: help docs page',
    ts: '2026-06-28T05:00:00Z',
    items: [
      'K8 — \'What\'s next?\' card (Simple mode): bridges the gap after the getting-started checklist is complete. Once the canvas has ≥1 panel or KPI, a compact next-steps card appears at the top of the dashboard inspector (Simple mode only). It shows three actionable tips: (1) Configure your chart — click a panel to select it and use the inspector to pick a chart type and bind columns. (2) Add more panels or KPIs — drag more queries from the library to expand your dashboard. (3) Export when ready — use Export ▾ to download a CDF HTML file; the action button directly triggers the Export menu. A \'View help docs\' link at the bottom opens the new documentation page. A \'Got it ×\' dismiss button hides the card and persists the dismissal to localStorage so it never reappears. The card is absent in Advanced mode (no beginner noise for expert users) and absent in Simple mode when the canvas is empty (checklist is shown instead). 5 new K8 Playwright checks.',
      'J-track slice 1 — Help docs page (dashboard-studio/docs/index.html): a self-contained, professionally styled reference guide for Analytics Dashboard Studio, written in a task-oriented documentation style. Sections: Getting started (3-step card grid + Auto-build tip), The builder (three panes, drag-and-drop, undo/redo, examples), Chart types (a full 20-type grid grouped by category with descriptions), Data sources & CDA (catalog queries, authoring SQL/MDX/Kettle/Metadata/Scripting, compound DAs/joins), Exporting (CDF/CDE/CDA format comparison table, save/load, push-to-server), Keyboard shortcuts (full table with kbd chips), and Simple vs Advanced mode (feature comparison). Sticky-scrolling nav bar with active section highlighting. Responsive (1-col mobile). A new \'Help docs ⓘ\' entry in the ⋯ More menu opens the page in a new tab. The K8 card also links to it. 3 new J-docs Playwright checks (button exists; HTTP 200; section anchors present). Test suite 539/539.',
    ],
  },
  {
    v: 96,
    title: 'H-track: canvas empty-state overlay',
    ts: '2026-06-28T04:30:00Z',
    items: [
      'Canvas empty state (H-track): when the dashboard has 0 panels and 0 KPIs, a welcoming overlay now appears centred on the canvas — a dashed-circle icon, a \'Canvas is empty\' headline, a short drag-to-add instruction, and an \'Open library\' button. On desktop, the button focuses the library search field; on phone (≤640px), it opens the library drawer. The preview iframe is dimmed to 20% opacity so the overlay is clearly the focus while the header ghost gives context. The overlay disappears automatically the moment a panel or KPI is added (doRefresh() toggles the canvas-empty CSS class). Themed and dark-mode aware. 4 new Playwright checks; test suite 531/531.',
    ],
  },
  {
    v: 95,
    title: 'K7: Getting started checklist in Simple mode',
    ts: '2026-06-28T04:00:00Z',
    items: [
      'K7 — Getting started checklist: in Simple mode, when the dashboard has 0 panels and 0 KPIs, a friendly 3-step checklist card now appears at the top of the dashboard inspector to guide first-time users through the core workflow. Step 1 (\'Library ready\') is auto-checked — the catalog query library is always available on first open. Step 2 (\'Add a panel to the canvas\') is the primary CTA: shows a brief instruction and an \'Open library\' action button that focuses the library search field on desktop or opens the library drawer on phone. Step 3 (\'Export your dashboard\') is shown as the end goal so users understand the full journey from data to deployment. The checklist disappears the moment the first panel or KPI is added, and is never shown in Advanced mode. Implemented via .gs-checklist / .gs-step / .gs-check / .gs-step-action CSS classes; themed and dark-mode aware.',
      'Tests: 5 new K7 checks — checklist shown in Simple mode with 0 panels + 0 KPIs; checklist has exactly 3 steps; first step is gs-done (library always ready), second step is not done (add panel pending); checklist absent in Advanced mode; checklist absent in Simple mode once ≥1 panel exists. Test suite 527/527.',
    ],
  },
  {
    v: 94,
    title: 'K6: guided panel setup in Simple mode + H-track: jump to data source',
    ts: '2026-06-28T03:00:00Z',
    items: [
      'K6 — Guided panel setup in Simple mode: when a panel\'s required column bindings are missing (newly dropped DA with no detected columns, or empty DA), Simple mode now shows a friendly inline guidance card in the Data section of the panel inspector. Three states: (1) No DA bound — nudges the user to drag a query from the library or pick one in the dropdown. (2) DA bound but 0 declared columns — an amber warning card explains how to detect columns from the query editor and reassures that the chart will appear once columns are known. (3) DA bound with columns available but mapping still empty (e.g. after a chart-type switch) — a \'Auto-pick columns ▶\' button assigns the best-effort columns using name-based heuristics (non-numeric names go to label slots, numeric-looking names go to value slots) and fires a toast confirming the assignment. missingRequiredCols() and autoPickCols() helpers in studio.js (pdc-ui.js pristine). All three states are invisible in Advanced mode — the feature is Simple-mode-only to avoid clutter for expert users. __studioSelect and __studioRenderInspector test hooks exposed on window for test suite coverage.',
      'H-track — \'Edit data source →\' jump link: the panel inspector\'s Data section now shows a small \'Edit data source →\' link (SVG edit icon + text) below the Query picker in Advanced mode. Clicking it navigates the inspector directly to that data source\'s inspector — no hunting through the library. Hidden in Simple mode (authoring controls are restricted there). Pairs naturally with the Query preview section to form a complete inspect-and-navigate flow.',
      'Tests: 8 new v94 checks — K6 (6): well-bound panel shows no guided-setup; panel with no DA shows guided-setup; 0-column DA shows gs-warn; columns-but-empty-map shows Auto-pick button; Auto-pick assigns labelCol+valueCol and banner disappears; guided-setup absent in Advanced mode. H-track (2): \'Edit data source\' jump link visible in Advanced mode; hidden in Simple mode. Test suite 522/522.',
    ],
  },
  {
    v: 93,
    title: 'K4: smart chart defaults in Simple mode + K5: streamlined DA inspector',
    ts: '2026-06-28T02:00:00Z',
    items: [
      'K4 — Smart chart defaults in Simple mode: chartForDA() is now Simple-mode aware, applying richer heuristics when the user is in Simple mode. A single column with a numeric-sounding name (value, total, count, revenue, cost, rate, etc.) is suggested as a gauge — perfect for KPI tiles. A DA with multiple numeric-named columns (e.g. revenue + cost + margin) is suggested as a line chart for easy comparison, rather than the default bars. The time-series heuristic (date/month column → line) is preserved. A new window.__chartForDA test hook exposes the function to the Playwright suite. In Advanced mode the existing behaviour is unchanged, so all current catalog scaffolding is unaffected.',
      'K5 — Simple mode DA inspector: the \'Calculated columns\' and \'Output options\' sections in the DA inspector are now tagged .adv-sect (via advSection() instead of section()) and are hidden when Simple mode is active — keeping the DA inspector focused on the essentials (ID, kind, query, output columns, parameters, cache, data preview) without confusing newcomers with formula columns, filter rules, sort rules, or row limits. Restoring Advanced mode reveals both sections immediately. This completes the Simple mode ↔ DA inspector integration.',
      'Tests: 7 new v93 checks — K4: chartForDA in Simple mode (single numeric → gauge; multiple numeric → line; date col → line; Advanced mode single col still → null); K5: .insp-sec.adv-sect hidden in Simple mode and restored in Advanced mode; DA inspector Calculated columns and Output options carry .adv-sect. Test suite 514/514.',
    ],
  },
  {
    v: 92,
    title: 'K2: Simple mode badge + welcome note; K3: streamlined library in Simple mode',
    ts: '2026-06-28T01:00:00Z',
    items: [
      'K2 — Simple mode topbar badge: a compact pill badge (#simpleBadge, \'Simple mode\') appears in the topbar whenever Simple mode is active, so it is always clear which mode the builder is in. The badge is CSS-only (body.simple-mode .simple-badge { display:inline-flex }) — zero JS overhead, survives dark mode automatically, dismisses the moment Advanced mode is restored.',
      'K2 — Inspector welcome note: the top of the dashboard inspector now shows a styled welcome card (.simple-welcome) while Simple mode is active. It explains that advanced options are hidden, reassures that the essential tools remain, and offers a one-click \'Switch to Advanced mode →\' link that calls toggleSimpleMode() inline. Shown at the dashboard level (not panel level) so it does not repeat for every panel click. Disappears the instant Simple mode is turned off — renderInspector() is called by toggleSimpleMode() so the UI updates without reload.',
      'K3 — Streamlined library in Simple mode: the Query Library becomes read-only browse + drag-to-canvas in Simple mode. Four CSS rules hide all authoring controls: #btnNewDS (library header \'＋ New source\'), .mine-add (the \'＋ New\' and \'⧈ Join\' buttons inside the My Data Sources section header), .da-mine-acts (the duplicate/delete icon buttons on authored DA cards), and .da-acts (the edit/delete icon buttons on catalog DA cards). Restoring Advanced mode reveals all controls instantly. This ensures newcomers in Simple mode can explore and drag queries onto the canvas without being confronted by the CDA authoring workflow.',
      'Tests: 5 new v92 checks — #simpleBadge hidden in advanced mode; badge visible in simple mode; .simple-welcome note present in dashboard inspector in simple mode; #btnNewDS hidden in simple mode; .da-mine-acts CSS-hidden in simple mode and restored in advanced mode. Test suite 507/507.',
    ],
  },
  {
    v: 91,
    title: 'K-track: Simple mode — progressive disclosure for first-time users',
    ts: '2026-06-28T00:00:00Z',
    items: [
      'Simple mode (K-track): a new \'Simple mode\' toggle in the ⋯ More menu makes the builder approachable for first-time users and clean for SE demos. When active (body.simple-mode class + localStorage persisted), every advanced inspector section is hidden — leaving only the essential sections (Panel name/header/note, Chart type, Data binding, Options, Trend & delta) and clearing away the expert-level controls (Drill-through, Detail drawer, Cross-filter, Target line, Reference band, Callout arrow, Period highlight, Event markers, Point annotations, Conditional formatting, Color scale, and KPI Compare-to). In the chart type gallery, specialist/advanced visuals (Sankey, Chord, Network, Waterfall, Funnel, Sunburst, Bullet, Calendar heatmap, Radar, Lollipop, Slope, Dot plot, Beeswarm, Histogram, Polar area, Box plot) are also hidden — the 13 most universally understood chart types (bars, donut, line, stacked, area-stacked, combo, treemap, scatter, gauge, heatmap, table, KPI, rich text) remain. Group headers whose entire chart set is advanced automatically hide too. Toggle it off to restore the full Advanced mode — state is immediately reflected on the open inspector without reload. The active state persists across sessions. The ⋯ More menu entry turns brand-blue when Simple mode is on.',
      'Implementation: advSection() helper in studio.js wraps section() and tags the outer .insp-sec with .adv-sect; SIMPLE_CHART_TYPES object gates the chart gallery; CSS rules body.simple-mode .adv-sect and body.simple-mode .adv-chart control visibility; toggleSimpleMode() flips state, applies the body class, saves to localStorage, and calls renderInspector() for an instant update; boot reads the persisted flag.',
      'Tests: 5 new v91 checks — Simple mode button exists in More menu; toggle sets body.simple-mode class and S.simpleMode state; advanced inspector sections carry .adv-sect and are CSS-hidden in simple mode; advanced chart types carry .adv-chart and are hidden in the gallery; turning off Simple mode restores all advanced sections. Test suite 502/502.',
    ],
  },
  {
    v: 90,
    title: 'H-track: KPI comparison mode',
    ts: '2026-06-27T07:00:00Z',
    items: [
      'KPI comparison mode (H-track): a new \'Compare to\' section in every KPI tile inspector lets builders bind a second numeric column from the same data access and automatically compute a delta between the primary value and the comparison value — ideal for period-over-period analysis (\'Revenue this quarter vs last quarter\', \'Current users vs target\'). Three display modes: % change (default, e.g. \'12.4% vs Prior quarter\'), absolute delta (e.g. \'2,300 vs Target\'), and compare value (shows the comparison value as the secondary display). The delta arrow direction (▲/▼) is inferred automatically from whether the current value is higher or lower than the compare value. The \'Compare label\' field lets builders describe what the comparison represents. When a compare column is selected it takes priority over the manual \'Delta text\' field, so both modes are preserved in the spec and switching back to manual is just a matter of clearing the compare column. The compare configuration travels in k.compareCol, k.compareMode, k.compareLabel through Open / Import / auto-save / undo-redo / CDF export. The \'Compare to\' section shows a collapsed hint with the compare column name so builders can see the current comparison at a glance.',
      'Tests: 4 new v90 checks — \'Compare to\' section appears in KPI inspector; compareCol and compareLabel persist in spec; KPI tile shows an auto-computed delta element in the preview iframe; exported CDF HTML embeds compareCol config in STUDIO_SPEC. Test suite 497/497.',
    ],
  },
  {
    v: 89,
    title: 'H-track: inspector section collapsed hints',
    ts: '2026-06-27T06:00:00Z',
    items: [
      'Inspector section collapsed hints (H-track): every collapsible section in the panel inspector now shows a compact inline hint when collapsed, so builders can see the current configuration at a glance without having to expand. The section() helper gained an optional 4th parameter summaryFn — a zero-arg callback that returns a short descriptive string. When a section is collapsed the string appears inside a .sec-hint span appended to the h4 header; it disappears (display:none via CSS) when the section is expanded. Sections with hints: Target line (\'"My Target"\' or \'defined\'), Reference band (\'"Normal range"\' or \'defined\'), Callout arrow (\'"Peak"\'), Period highlight (\'"Q3 surge"\' or \'defined\'), Event markers (\'2 markers\' or \'1 marker\'), Point annotations (\'3 annotation(s)\'), Conditional formatting (\'2 rules\'), Color scale (\'gradient enabled\'), Drill-through (URL preview), Detail drawer (DA id), Cross-filter (emit parameter name). This addresses the UX feedback that collapsed sections gave no indication of whether anything was configured.',
      'Tests: 4 new v89 checks — collapsed \'Conditional formatting\' shows rule count hint; collapsed \'Event markers\' shows marker count hint; collapsed \'Color scale\' shows \'gradient enabled\' hint; hint is hidden (display:none) when the section is expanded. Test suite 493/493.',
    ],
  },
  {
    v: 88,
    title: 'M7/M8: narrow-phone topbar + non-blocking restore banner',
    ts: '2026-06-27T05:00:00Z',
    items: [
      'M7 — Narrow phone topbar accessibility: at ≤400px viewport widths (e.g. Galaxy S21 FE, older iPhones), the Examples, Open, and Save buttons are hidden from the topbar and moved into the ⋯ More menu as phone-only items. The remaining primary actions (Undo, Redo, New ▾, Export ▾, ⋯ More) fit comfortably at 360px. All topbar buttons gain a min-height:44px touch target at narrow widths. The brand title font scales down to 12px so the logo stays visible without eating button room. The Examples menu, when opened from the More menu, uses a fixed-position overlay below the topbar — same content, correct positioning even though the original button is hidden. Both moreImport and moreSaveSpec call the same underlying functions as their topbar counterparts. New CSS class phone-pos on #menuExamples enables this fixed layout; closeMenus() now removes phone-pos to restore default positioning at wider widths.',
      'M8 — Restore banner non-blocking on mobile: the \'Restore unsaved work?\' banner used to overlap the mobile tab bar (bottom 80px of the screen) because it was positioned at bottom:40px. The banner now accounts for the mobile tab bar height via a new --mob-tabs-h CSS variable (set to 52px at ≤640px, 0 at desktop) plus a safe offset for the status bar, putting it clearly above the tab bar at all mobile widths. At ≤640px the banner also switches to a full-width layout (left:8px/right:8px, flex-direction:column) so the message and buttons stack vertically, text can wrap on narrow screens, and the dismiss button is always reachable. The Restore/Dismiss button row is wrapped in a .rb-acts div for this stacked layout. No change to desktop appearance.',
      'Tests: 5 new checks — topbar no-overflow at 360px; More button ≥40px tap target at 360px; phone-only DOM items present; Examples/Open/Save visible in More menu at 360px; restore banner positioned above mobile tab bar. Test suite 489/489.',
    ],
  },
  {
    v: 87,
    title: 'H-track: event markers + scatter point annotations',
    ts: '2026-06-27T04:00:00Z',
    items: [
      'Event markers (H-track): a new \'Event markers\' section in the panel inspector for line, stacked-area, combo, stacked, and bar charts. Add any number of named vertical dashed tick lines — each is a {label, xPct, color} object stored in p.eventMarkers. Perfect for annotating precise events like \'Product launch\', \'Incident\', \'Campaign start\', or \'Policy change\' on time-series and bar charts without needing to modify the underlying data. The marker is a vertical dashed line spanning the full chart body height with a small colored label at the top. Position is visual (% from chart left edge), not data-scaled, so markers apply universally. Type-aware: section is hidden for polar/donut/radar and other chart types that have no meaningful horizontal x-axis. Uses the same setTimeout(0) + PDC._reg.push() pattern as other overlays for reliability across redraws and theme changes. eventMarkerCss constant added to exporters.js; markers travel in spec through Open/Import/auto-save/undo-redo/CDF export.',
      'Scatter point annotations (H-track): a new \'Point annotations\' section in the panel inspector, shown only for scatter chart type. Add any number of text labels pinned at visual (x%, y%) positions on the scatter plot body — ideal for highlighting outliers, clusters, or significant data regions. Each annotation is a {text, xPct, yPct, color} object stored in p.scatterAnnotations. Renders as a small colored dot with a bordered text label (a compact label box without an arrow, as distinct from the existing callout arrow which suits single-point highlights with leader lines). The x%/y% sliders position the label precisely in the chart body — x%=0 is the left edge, y%=0 is the top (highest y values). Multiple annotations compose cleanly. scatterAnnotCss constant added to exporters.js; annotations travel in spec through Open/Import/auto-save/undo-redo/CDF export.',
      'Tests: 8 new v87 checks (Event markers section visible in line chart inspector; not visible for scatter chart; p.eventMarkers persists in spec; .pdc-event-mark renders in preview iframe; Point annotations section visible in scatter chart inspector; p.scatterAnnotations persists in spec; .pdc-pt-annot renders in preview iframe; exported CDF HTML embeds both CSS constants and spec configs). Test suite 484/484.',
    ],
  },
  {
    v: 86,
    title: 'F15: Polar area (rose) chart + H-track: Period highlight annotation',
    ts: '2026-06-27T03:00:00Z',
    items: [
      'Polar area chart (F15, Composition group): a new \'Polar area\' chart type — also known as a rose chart or nightingale chart — where equal-angle wedges radiate from a common centre and each wedge\'s area (not just radius) encodes the data value. Area encoding is more perceptually accurate than radius encoding because human vision judges 2D area, making it much easier to compare values at a glance. Each category gets the same angular slice (360°/n degrees); the radius is proportional to √(value/max) so area ∝ value. Per-category colors from the palette; subtle concentric guide rings at 25/50/75/100% of the max radius provide a visual scale; a formatted total label sits at the centre; arc labels can be toggled on/off; animated entrance; hover tooltips show value + % of total. PDC.polarArea extension in studio-charts.js (pdc-ui.js stays pristine); model.js registry entry in the Composition group; studio-render.js dispatch; gallery SVG thumbnail (6 wedges of varying radii); newPanel auto-map (labelCol + valueCol). CDF-only (no direct CCC equivalent). 20 chart types total.',
      'Period highlight annotation (H-track): a new type-aware \'Period highlight\' section in the panel inspector. Shown only for chart types that have a meaningful horizontal x-axis (line, areaStacked, combo, stacked, bars), it overlays a semi-transparent vertical band across an x% range of the chart body — perfect for highlighting a time period, baseline window, event boundary, or any region of the chart that deserves emphasis: \'Q3 surge\', \'Before/after deployment\', \'Baseline period\'. Configure a label (displayed at top-left of the band), a Left edge slider (% from the left edge of the chart body), a Right edge slider, and a Fill color picker. The band renders as a .pdc-period div with a semi-transparent rgba fill (so the chart underneath remains legible) and dashed left/right border lines to make the edges crisp. Clear button resets. Position is visual (% of chart body width), not data-scaled, so it applies universally without needing to know the x-axis domain. Same setTimeout(0) + PDC._reg.push() pattern as target lines and reference bands for reliability. p.periodHighlight ({label, xStart, xEnd, color}) travels in spec through Open / Import / auto-save / undo-redo / CDF export. periodHighlightCss constant added to exporters.js.',
      'Tests: 7 new v86 checks (polarArea registered Composition/CDF-only; PDC.polarArea defined in preview iframe; arc wedge paths rendered; Period highlight section shown for line chart; p.periodHighlight persists in spec; .pdc-period div renders with correct label; exported CDF HTML embeds both CSS and spec config). Test suite 476/476.',
    ],
  },
  {
    v: 85,
    title: 'H-track: color scale — gradient encoding',
    ts: '2026-06-27T02:00:00Z',
    items: [
      'Color scale / gradient encoding (H-track): a new \'Color scale\' section in every panel inspector gives builders a continuous visual encoding layer — map the full value range of bars, donut slices, treemap tiles, or lollipop dots to a smooth gradient between a low color (the minimum value) and a high color (the maximum value). Two color pickers and a live gradient swatch strip (showing the blend between the chosen colors) make it instant to configure and immediately see the result.',
      'Enabling a color scale automatically assigns a per-item gradient color: items at the minimum value receive the \'Low\' color, items at the maximum receive the \'High\' color, and everything in between blends proportionally. This is complementary to the conditional formatting rules introduced in v83 — the gradient is applied first, then threshold rules override individual items, so you can have an overall \'cool→warm\' gradient while still marking specific out-of-threshold items in red. The two systems compose seamlessly without any extra configuration.',
      'Implementation: hexInterp(a, b, t) interpolates between two #RRGGBB hex colors in linear RGB space; csData(data, scale) maps the value range to the gradient and returns a new data array with per-item .color properties; the pipeline is csData → cfData so condFmt always wins. Only pdc-ui.js-pristine code is touched: hexInterp and csData are added to studio-render.js. The colorScale spec key ({enabled, low, high}) travels through Open / Import / auto-save / undo-redo / CDF export just like any other panel property — no exporter changes needed since STUDIO_SPEC embedding already includes all panel fields.',
      'Tests: 5 new v85 checks (\'Color scale\' section in panel inspector; p.colorScale round-trips through spec; bars with colorScale render unique per-bar colors; condFmt rules override gradient colors; exported CDF HTML embeds colorScale). Test suite 469/469.',
    ],
  },
  {
    v: 84,
    title: 'H-track: callout arrow annotation',
    ts: '2026-06-27T01:00:00Z',
    items: [
      'Callout arrow annotation (H-track): a new \'Callout arrow\' section in every panel inspector. Set a text label (e.g. \'Peak\', \'Drop point\', \'Alert\'), a horizontal tip position (x%, 0=left edge), a vertical tip position (y%, 0=chart top), and a color — then a filled text bubble with a dashed leader line and arrow head renders as an absolutely-positioned SVG overlay on the chart body. Works for every chart type (position is visual, not data-scaled) and survives theme changes and window resize via the PDC._reg pattern. Leave text blank to hide.',
      'The SVG overlay is rendered by studio-render.js in both the live preview and exported CDF HTML — pdc-ui.js stays pristine. p.callout ({text, x, y, color}) travels in the spec JSON through Open / Import / auto-save / undo-redo / CDF export. calloutCss constant added to exporters.js for the .pdc-callout SVG container positioning. Three new v84 checks added to the Playwright suite.',
      'Tests: 3 new v84 checks (Callout arrow section in panel inspector; p.callout persists in spec; callout renders .pdc-callout SVG in preview iframe). Test suite 464/464.',
    ],
  },
  {
    v: 83,
    title: 'H-track: conditional formatting — traffic-light colors by value',
    ts: '2026-06-27T00:00:00Z',
    items: [
      'Conditional formatting (H-track): a new \'Conditional formatting\' section appears in every panel inspector. Builders can define a stack of threshold rules — each rule specifies an operator (>=, >, <=, <, =, !=), a numeric threshold value, and a color — that override the default bar/slice/tile color when the data value matches. Rules apply top-to-bottom; the first matching rule wins. Leave the rule list empty for normal coloring. \'Add rule\' defaults cycle through green → amber → red for instant traffic-light setup.',
      'Works for bars, donut slices, treemap tiles, and lollipop dots — chart types that already support per-item .color in the PDC toolkit. Implementation is purely at the data layer: studio-render.js injects a cfData() helper that maps evalCondFmt() over the label-value array before passing it to the chart; pdc-ui.js stays pristine. The rules travel in p.condFmt in the .studio.json spec and survive Open / Import / auto-save / undo-redo / CDF export.',
      'Traffic-light dashboards are a common BI pattern: \'color revenue bars red when < 50 000, amber when < 100 000, green above\' or \'color donut slices red for compliance items below 80 %\'. Conditional formatting makes these trivial to configure without writing any code.',
      'Tests: 5 new v83 checks (conditional formatting section in panel inspector; .cf-add-rule button exists; condFmt rule persists in spec; bars chart renders distinct colors with condFmt rules; exported CDF HTML embeds condFmt rules in STUDIO_SPEC). Test suite 461/461.',
    ],
  },
  {
    v: 82,
    title: 'F14: Histogram / frequency distribution chart',
    ts: '2026-06-27T23:00:00Z',
    items: [
      'Histogram chart (F14, Distribution group): a new \'histogram\' chart type that auto-bins a single numeric valueCol into N equal-width buckets and renders one touching bar per bin — revealing whether a dataset is normally distributed, skewed, or multimodal at a glance. Ideal for data quality checks, performance distribution analysis, and any scenario where the shape of a numeric distribution matters more than individual values. Bars touch with no inter-bar gap to emphasise that the x-axis is a continuous numeric range, not discrete categories. Hover tooltips show the bucket range (e.g. \'1,200 – 1,800\') and row count.',
      'Options in the inspector: Bin count (2–50, default 10) for coarser or finer granularity; Bar color token; Value format for x-axis tick labels; Height. Bound via a single valueCol field — no labelCol needed, since the histogram derives its own x-axis labels from the computed bin boundaries. The column name is shown as a subtle italic x-axis caption to give context. PDC.histogram extension in studio-charts.js (pdc-ui.js stays pristine); model.js registry entry under Distribution; studio-render.js dispatch; gallery SVG thumbnail (7 touching bars in a bell-curve silhouette); newPanel auto-map (valueCol from the second column, or first if only one exists). CDF-only (cde: null).',
      'Tests: 3 new v82 checks (histogram registered in Distribution group, CDF-only; PDC.histogram defined in preview iframe; histogram renders rect bars in preview). Test suite 456/456.',
    ],
  },
  {
    v: 81,
    title: 'H-track: reference band annotation',
    ts: '2026-06-27T22:00:00Z',
    items: [
      'Reference band annotation (H-track): extends the v80 annotation system with a shaded semi-transparent range overlay that highlights a band between two vertical positions on any chart. Where a target line is a single horizontal marker, a reference band marks a range — ideal for \'Normal Range\', \'Acceptable Zone\', \'Confidence Interval\', \'Budget Window\', or any region of the chart the viewer should interpret as a target corridor. Configure via the new \'Reference band\' section in every panel inspector: a Label (leave blank to hide); a \'Top edge\' slider (0–100% from chart top) for the upper boundary; a \'Bottom edge\' slider for the lower boundary; and a Fill color picker with a Clear button.',
      'The band is rendered as a .pdc-ref-band div absolutely positioned in the chart body, with a semi-transparent fill (hex color parsed to rgba(r,g,b,0.14) so the chart beneath remains legible) plus thin 1px dashed borders at the top and bottom edges to make the boundaries crisp. The label text (.pdc-ref-label) sits at the top-right of the band in the same color at full opacity — it is not affected by the fill\'s transparency since background-color with alpha leaves child elements at 100% opacity. The band renders at z-index:2 (below target lines at z-index:3, above the chart body at 0). Uses the same setTimeout(0) + PDC._reg.push() pattern as target lines to survive synchronous chart rendering and re-apply after theme-change or window resize redraws. Config travels in p.refBand ({label, topPct, bottomPct, color}) in the .studio.json spec.',
      'The refBandCss constant is added to exporters.js and included in every exported CDF (.html) file alongside the target line and other annotation CSS — so the reference band appears identically in the deployed dashboard without any additional setup. Tests: 3 new v81 checks (Reference band section with two sliders; p.refBand renders .pdc-ref-band with correct label in preview iframe; exported CDF includes pdc-ref-band CSS and label). Test suite 453/453.',
    ],
  },
  {
    v: 80,
    title: 'H-track: chart annotation target lines',
    ts: '2026-06-27T21:00:00Z',
    items: [
      'Chart annotation target lines (H-track): a new \'Target line\' section in every panel inspector lets builders overlay a horizontal dashed reference line on any chart — ideal for showing budgets, targets, thresholds, or milestones. Configure a label (e.g. \'Target\', \'Budget Limit\', \'Threshold\'), a position (0–100% from the top of the chart body, adjusted with a range slider), and a color (native color picker). Leave the label blank to hide the line. The line renders as a .pdc-target-line div absolutely positioned in the chart body, with a small colored label at the right edge.',
      'Works for every chart type — bars, line, stacked, donut, treemap, scatter, and all F-track custom charts. Position is visual (percentage), not data-scaled, so it applies universally without needing to know the Y axis range. Uses setTimeout(0) to defer past any synchronous chart rendering that resets the body container, and registers in PDC._reg so the line re-applies cleanly after theme-change or window resize redraws.',
      'Target line config travels in p.targetLine ({label, pct, color}) in the .studio.json spec and is fully preserved through Open, Import, auto-save, undo-redo, and export. The .pdc-target-line / .pdc-target-label CSS is inlined in every exported CDF (.html) file via the targetLineCss constant in exporters.js — so the annotation appears identically in the deployed dashboard.',
      'Tests: 3 new v80 checks (Target line section with label + slider in panel inspector; p.targetLine renders .pdc-target-line with correct label in preview iframe; exported CDF HTML includes pdc-target-line CSS and label). Test suite 450/450.',
    ],
  },
  {
    v: 79,
    title: 'H-track: panel tagging / grouping',
    ts: '2026-06-27T20:00:00Z',
    items: [
      'Panel tagging / grouping (H-track): panels now support a free-text \'Tags\' field in the panel inspector (comma-separated, e.g. \'revenue, q1, finance\'). Tags are stored as an array of lowercase trimmed strings in p.tags and survive all round-trips (Open, Import, auto-save, undo-redo, CDF export spec embedding).',
      'Tag filter bar: the dashboard inspector panel list now shows a compact tag filter bar above the Panels section whenever at least one panel carries tags. The bar contains an \'All\' chip (shows every panel) plus one chip per unique tag across the entire dashboard — chips are sorted alphabetically. Clicking a tag chip sets it as the active filter; non-matching panels dim to 35% opacity so the relevant panels stand out visually. Click the same chip again (or \'All\') to clear the filter. This makes it much easier to navigate large dashboards (10+ panels) without losing context.',
      'Per-panel tag chips: each panel row item in the dashboard inspector shows small colour-coded tag chips below the subtitle line, so tags are visible at a glance without entering the panel inspector. Clicking a chip on a panel row also toggles the tag filter — one click to focus on all panels sharing that tag.',
      'Studio.allTags(spec): new helper in model.js that returns a sorted array of unique tag strings across all panels in a spec. Used by the tag filter bar; also useful for tooling and export enrichment.',
      'Tests: 5 new v79 checks (Studio.allTags returns sorted unique tags; panel inspector shows Tags field; p.tags preserved through spec load; tag filter bar rendered when tags exist; panel-tag-chip elements in panel rows). Test suite 447/447.',
    ],
  },
  {
    v: 78,
    title: 'H-track: per-panel animated chart entrance controls',
    ts: '2026-06-27T18:00:00Z',
    items: [
      'Animated chart entrance controls (H-track): every panel in the dashboard inspector now has an \'Animation\' section with two controls — an \'Animate entrance\' toggle (on by default) and a \'Duration (ms)\' range slider (100 ms–2 s, default 600 ms, step 50 ms). Disabling the toggle hides the slider and stops all entrance animations for that panel. The duration slider scales every staggered timeout in the chart extensions proportionally — setting 300 ms halves the sweep, 1200 ms doubles it, giving fine-grained control over how fast charts fade, sweep, or pop in when the dashboard loads.',
      'Implementation: studio-render.js sets PDC._anim (true/false) and PDC._animD (ms integer) from p.animate / p.animDuration immediately before calling the chart extension for each panel. Two new helpers in studio-charts.js — canAnim() and animD(base) — replace the bare !RM checks throughout all ten chart animation blocks. canAnim() returns false if either prefers-reduced-motion is set OR the panel has opted out (PDC._anim === false); animD(base) scales the base timeout by PDC._animD / 600. The vendored pdc-ui.js file is not touched.',
      'Values p.animate and p.animDuration travel in the .studio.json spec and survive Open / Import / auto-save / undo-redo like any other panel property. The Duration slider is hidden when animations are disabled to avoid confusion. The helper note clarifies that the OS prefers-reduced-motion setting always wins.',
      'Tests: 5 new v78 checks (PDC._anim writable in iframe; Animation section with checkbox in panel inspector; duration range slider 100–2000 present; p.animate=false stored in spec; p.animDuration=1200 reaches PDC._animD in iframe). Test suite 442/442.',
    ],
  },
  {
    v: 77,
    title: 'H-track: KPI sparkline types + Inspector search',
    ts: '2026-06-27T16:00:00Z',
    items: [
      'KPI sparkline types (H-track): the KPI inspector\'s \'Trend & delta\' section now offers a \'Sparkline type\' picker with three options — Line (the existing polyline, default), Bar (mini bar chart with one vertical bar per data row, smooth rx:1 corners, proportional heights), and Area (a filled area sparkline with an 0.2-opacity fill beneath the line). The bar and area variants use new PDC.sparkSvgBar / PDC.sparkSvgArea helpers in studio-charts.js (pdc-ui.js stays pristine). The chosen type travels in k.sparkType and is reproduced identically in exported CDF HTML — the studio-charts.js extension is already inlined in every export. This makes KPI tiles visually richer: bar sparklines emphasise discrete volumes (e.g. monthly counts), area sparklines emphasise cumulative shape, and the original line remains the default for clean trend lines.',
      'Inspector search (H-track): a compact search input now appears at the top of the Inspector panel (visible at all times, across all inspector contexts — Dashboard, Panel, KPI, Filter, Data Source). Typing any text hides sections whose visible content does not contain the query (case-insensitive substring match against the full section text). The search query is preserved in _inspSearch across re-renders so typing a query while editing a field does not lose the filter. Pressing Escape in the search box does not trigger global shortcuts (keydown stopPropagation). An empty query restores all sections. Useful when many sections are expanded on a complex panel — quickly jump to \'Accent\', \'Cross-filter\', \'Drill-through\', \'Output options\', etc. Styled with the same field background and focus ring as other inputs.',
      'Tests: 7 new v77 checks (PDC.sparkSvgBar defined in preview iframe; PDC.sparkSvgArea defined in preview iframe; KPI inspector shows Sparkline type selector; sparkType:bar renders a .spark element in the iframe; sparkType:area renders a .spark element in the iframe; inspector body has .insp-search input; non-matching section hidden by search query). Test suite 437/437.',
    ],
  },
  {
    v: 76,
    title: 'F13: Beeswarm / strip plot + H-track: per-panel accent color',
    ts: '2026-06-27T14:00:00Z',
    items: [
      'Beeswarm / strip plot (F13, Distribution group): a new CDF-only \'beeswarm\' chart type. Every data row is rendered as a filled dot positioned along a horizontal axis — revealing raw distributions, density clusters, and outliers at the individual-point level. Dots are deterministically jittered vertically (center-out packing, alternating above and below) so overlapping points separate cleanly without any randomness: the same data always produces the same layout. An optional categoryCol groups rows into labelled horizontal strips, enabling side-by-side distribution comparison across categories (e.g. test scores by department, revenue per product per region). PDC.beeswarm extension in studio-charts.js (pdc-ui.js stays pristine). Gallery SVG thumbnail, model registry under Distribution, studio-render.js dispatch, newPanel auto-map (labelCol / valueCol / categoryCol). CDF-only.',
      'Per-panel accent color (H-track): a new \'Panel accent\' field in every panel inspector — a native color picker plus a \'Clear\' button. When set, a colored left border (.pdc-accent-panel with --pap-color CSS variable) appears on the card in both the live preview and exported CDF HTML. Ideal for multi-subject dashboards where panels cover different business domains (e.g. revenue panels in blue, cost panels in red, compliance panels in amber) — the accent stripe gives instant visual context without reading the title. panelAccentCss constant added to exporters.js and included in every CDF export.',
      'Tests: 9 new v76 checks (beeswarm registered in Distribution group; CDF-only; PDC.beeswarm defined in preview iframe; newPanel creates beeswarm with labelCol + valueCol; categoryCol mapped from third column; panel inspector shows Panel accent field; p.accentColor renders .pdc-accent-panel in preview; exported CDF includes pdc-accent-panel CSS; exported CDF includes --pap-color variable). Test suite 430/430.',
    ],
  },
  {
    v: 75,
    title: 'F12: Dot plot + H-track: panel-level notes / annotations',
    ts: '2026-06-27T13:00:00Z',
    items: [
      'Dot plot / Cleveland dot plot (F12, Distribution group): a new CDF-only \'dotplot\' chart type. Pure dots — no stems — positioned along a horizontal axis. Lower visual weight than bar charts; excellent for showing distributions and rankings at a glance. Rows are sorted by value descending by default (toggle \'Sort by value\' in the inspector). An optional second column (Configure → \'Compare column\') adds a second dot per row in a contrasting colour with a thin connector, enabling immediate two-group comparison (e.g. budget vs actual, this year vs last year) on the same row track. PDC.dotplot extension in studio-charts.js (pdc-ui.js stays pristine). Gallery SVG thumbnail, model registry under Distribution, studio-render.js dispatch, newPanel auto-map (labelCol / valueCol / groupCol). CDF-only.',
      'Panel-level notes / annotations (H-track): a new \'Note (visible)\' single-line text field in the panel inspector. When filled in, a subtle italicised annotation line (.pdc-panel-note) appears between the panel card header and the chart body — visible in both the live preview and exported CDF HTML. Stakeholders can read a quick context note without hovering over the info tooltip. Styled with a faint left accent rule and muted italic text so it reads as annotation, not data. The CSS constant panelNoteCss is included in every CDF export and preview iframe; panels with no note are unaffected.',
      'Tests: 8 new v75 checks (dotplot registered in Distribution group; CDF-only; PDC.dotplot defined in preview iframe; newPanel creates dotplot with labelCol + valueCol; groupCol mapped from third column; panel inspector shows Note field; p.note renders .pdc-panel-note in preview; exported CDF includes note CSS and text). Test suite 421/421.',
    ],
  },
  {
    v: 74,
    title: 'F11: Slope chart + H-track: smart titles + dashboard description bar',
    ts: '2026-06-27T12:00:00Z',
    items: [
      'Slope chart (F11, Trend group): a new \'slope\' chart type — the classic before/after storytelling chart. One sloping line per category connects its value at T1 (left axis) to its value at T2 (right axis). Rising lines render in green, falling in red, so gainers and losers are immediately visible without reading labels. Left and right endpoint values annotated; category labels shown at the midpoint. T1/T2 period labels are configurable in the inspector (\'Before\'/\'After\' by default). PDC.slope extension in studio-charts.js (pdc-ui.js stays pristine). CDF-only — no CCC equivalent.',
      'Smart default panel titles (H-track): when a panel is auto-built by dragging a DA or using New ▾ auto-build, the title is now derived more cleanly. The leading \'da_\', \'kpi_\', \'query_\', \'chart_\', or \'data_\' prefix is stripped from the DA id before titleization, and the chart type label is appended — e.g. a DA named \'da_monthly_revenue\' added as a line chart becomes \'Monthly Revenue · Line chart\' instead of \'Da Monthly Revenue\'. One clean rename to an expressive name without hunting for the right words.',
      'Dashboard description bar (H-track): spec.description (set in the dashboard inspector under \'Description\') now renders as a styled band in both the live preview and exported CDF HTML. The bar appears below the KPI tiles and above the panel grid, styled with a left accent rule, muted background, and secondary text color — ideal for adding context, scope, or audience notes for stakeholders. The band is omitted entirely when description is blank so plain dashboards are unaffected. CSS class .pdc-desc-bar included in descCss constant in exporters.js.',
      'Tests: 8 new v74 checks (slope registered in Trend group; CDF-only; PDC.slope defined in preview iframe; newPanel creates slope with correct map keys; smart title strips da_ prefix; smart title strips kpi_ prefix; exported CDF includes pdc-desc-bar element and text; no pdc-desc-bar element when description is empty). Test suite 413/413.',
    ],
  },
  {
    v: 73,
    title: 'F10: Lollipop chart + H-track: panel section headers',
    ts: '2026-06-27T11:00:00Z',
    items: [
      'Lollipop chart (F10, Comparison group): horizontal lollipop chart where each row renders a slim track line from the axis to a filled dot, giving a cleaner alternative to bar charts for ranked lists. Bind labelCol + valueCol from any numeric DA; supports value format (abbr/comma/pct/plain), dot color token, and height option. Tooltip on hover shows label + formatted value. Entrance animation fades in each line and dot with a staggered delay (studio-charts.js PDC.lollipop extension; pdc-ui.js stays pristine). CDF-only — cde:null.',
      'Panel section headers (H-track): a new \'Section header\' text field in the panel inspector lets consecutive panels be grouped under a labeled row divider. Setting a non-empty section label causes renderAll() in studio-render.js to inject a .pdc-sec-hdr <div> above that group\'s grid — visible in the live preview and identical in the exported CDF HTML. Leave the field blank to place a panel in the previous (or implicit) section.',
      'Section header CSS (.pdc-sec-hdr) included unconditionally in every exported CDF HTML file and in the preview iframe via a dedicated sectionCss constant in exporters.js — uppercase, muted text, thin bottom border — so dashboards stay visually clean even when the section feature isn\'t used.',
      'Tests: 7 new v73 checks (lollipop registered in Comparison group; CDF-only; PDC.lollipop extension present in iframe; newPanel creates correct map; inspector shows Section header field; sections render .pdc-sec-hdr in preview; exported HTML includes section CSS). Test suite 405/405.',
    ],
  },
  {
    v: 72,
    title: 'F-track: Rich text / annotation panels + Box plot chart',
    ts: '2026-06-27T10:00:00Z',
    items: [
      'v72 — Rich text annotation panels: a new \'¶ Text\' button in the canvas toolbar adds a text panel to any dashboard. Content is authored with simple Markdown (# headings, **bold**, *italic*, `code`, - lists, --- rule) via a textarea in the inspector. mdToHtml() renders it in both the live preview and exported CDF HTML — no DA binding needed, content travels in chart.opts.content.',
      'Rich text panels are CDF-only: the CDE export skips them gracefully. The inspector shows a note explaining this; the \'No query bound\' guard is bypassed for richtext panels so they never show the error state.',
      'Box plot chart (F-track Distribution): a new \'boxplot\' chart type in the gallery (Distribution group). Drag any numeric DA and bind labelCol + valueCol; the renderer groups rows by label, computes five-number summaries (min, Q1, median, Q3, max) per category using the PDC.boxplot extension in studio-charts.js (pdc-ui.js stays pristine). Rendered horizontal by default with whiskers, IQR box, median line, and hover tooltips showing all five stats.',
      'Box plot Inspector options: horizontal/vertical toggle, value format (abbr/comma/pct), and height. Gallery SVG thumbnail added for both new types.',
      'Richtext CSS (sr-richtext, sr-rt-placeholder, heading/paragraph/list/code/hr styles) included in both the preview iframe and exported CDF HTML via a dedicated richtextCss constant in exporters.js — scoped so it doesn\'t bleed into the builder chrome.',
      'Tests: 6 new v72 checks (Studio.CHARTS.richtext exists; Studio.CHARTS.boxplot exists; PDC.boxplot extension defined; #btnAddText adds a richtext panel; richtext inspector shows textarea; Studio.newPanel(\'boxplot\', da) produces correct chart). Test suite 398/398.',
    ],
  },
  {
    v: 71,
    title: 'H-track: Focus mode — full-screen preview for demos',
    ts: '2026-06-27T09:00:00Z',
    items: [
      'H-track v71 — Focus mode: a new \'Focus mode\' option in the ⋯ More menu collapses the Query Library and Inspector panes, hiding all builder chrome so the live preview fills the full workspace. Ideal for presenting a built dashboard to stakeholders without the SE tooling visible — the dashboard speaks for itself.',
      'Exit Focus mode: press Escape or click the frosted \'Exit Focus\' pill that appears in the lower-right corner. Escape is the same key that closes modals and deselects panels, so the muscle memory is identical — Escape always returns you to the previous context.',
      'Implementation: body.focus-mode class toggles via enterFocusMode()/exitFocusMode() helpers; CSS hides #library, both .resizer handles, #inspector, #canvas-bar, and the mobile bottom tab bar with !important guards. The .focus-exit pill uses backdrop-filter:blur for a frosted-glass look that reads clearly over any dashboard colour scheme. Escape key handler priority: focus mode → deselect panel → close modal.',
      'Keyboard shortcuts modal (?): updated to include \'Escape (Focus mode) → Exit Focus mode\'.',
      'Tests: 5 new H71 checks (button in More menu; body.focus-mode set; exit pill rendered; library hidden; Escape exits). Test suite 392/392.',
    ],
  },
  {
    v: 70,
    title: 'G3: import existing .ktr — step picker for Kettle DAs',
    ts: '2026-06-27T08:00:00Z',
    items: [
      'G3 — Import .ktr: \'Import .ktr…\' file button in the Kettle DA editor opens a local .ktr file and immediately parses its step list. Each step appears as a clickable chip (showing the step name; tooltip shows PDI step type). Click any chip to set it as the \'Output step name\' for the DA — one click instead of manually typing the step name.',
      'Studio.parseKtr(xmlStr) added to app/model.js: reads a .ktr XML string and returns { name, steps[] }. Processes each <step>…</step> block in isolation to avoid cross-step regex leakage; handles pretty-printed and compact .ktr files. The transform name is extracted from <info><name>. Used by the import UI and fully unit-tested.',
      'UX flow: select a .ktr file → parser runs in-browser (FileReader, no upload) → \'Loaded <transform name>\' confirmation + step chips appear below the Import button → if the .ktr path field is blank it is pre-filled with /public/etl/<filename>. The currently-selected output step chip highlights in brand color.',
      'Works alongside v69\'s KTR Builder accordion: author a new transform visually, download it, then re-import it to verify the step list and confirm the output step name round-trips correctly.',
      'Tests: 5 new G3 checks (parseKtr function exists; returns correct transform name; returns correct step list; step types preserved; Import .ktr button visible in Kettle DA editor). Test suite 387/387.',
    ],
  },
  {
    v: 69,
    title: 'G2: visual Kettle / PDI transform builder',
    ts: '2026-06-27T07:00:00Z',
    items: [
      'KTR Builder accordion in the Kettle DA editor (alongside the existing .ktr path and step name fields). Works exactly like the SQL Builder from G1 — click the gear header to expand, fill in the visual form, click \'Generate .ktr\', get instant XML output.',
      'Pipeline form covers the three common PDI steps: Table Input (FROM table + JNDI connection + optional WHERE conditions), Select Values (column chips to pass through; leave blank for SELECT *), and a Dummy output step (configurable name, syncs with the \'Output step name\' field above).',
      'A step-flow diagram at the top of the builder shows \'Table Input → Select Values → Output (Dummy)\' with the Select Values tile highlighted when columns are present — giving a clear at-a-glance picture of the transform structure.',
      'Generate .ktr produces well-formed PDI XML: <?xml version> + <transformation> + <info> + <step> nodes with correct types/positions + <order><hop> wiring. SelectValues step and its hops are only emitted when column chips are specified. The output textarea is read-only and can be copied; a \'Download .ktr\' button saves it as <stepName>.ktr ready to deploy to /public/etl/.',
      'Tests: 5 new G2 checks (toggle visible for kettle kind; body opens on click; generate XML with TableInput step; SelectValues step and hop order when columns added; <field> entries match column chips). Test suite 382/382.',
    ],
  },
  {
    v: 68,
    title: 'H2: keyboard shortcuts polish + smart chart-type on library drop',
    ts: '2026-06-27T06:00:00Z',
    items: [
      'Delete / Backspace key: with a panel (or KPI) selected, pressing Delete or Backspace removes it immediately — no need to scroll the inspector to find the delete button. Mirrors the standard UX pattern of every desktop app and canvas tool.',
      'Escape key: with a panel selected, pressing Escape deselects and returns to the dashboard-level inspector. One keypress to get out of panel editing mode without clicking the ← back button.',
      'Smart chart-type on library drag-and-drop: dragging a DA from the Query Library and dropping it on the canvas used to always default to \'bars\'. Now it calls the same chartForDA() heuristic used by auto-build — DAs with date/month/period columns get a line chart, DAs with donut/mix/share/sens/status in their ID get a donut, everything else gets bars. The quick-add chips (+ Bars, + Line, etc.) in the DA card are unaffected and still let you override.',
      'Keyboard shortcuts panel (?): updated to list the new Delete and Escape shortcuts alongside the existing Ctrl+Z/D/S and Arrow key bindings.',
      'Tests: 3 new H2 checks (Escape clears selection; Delete removes panel; Studio.newPanel with a time-series DA produces a line chart). Test suite 377/377.',
    ],
  },
  {
    v: 67,
    title: 'Cross-filter — coordinated chart views (F8 remaining)',
    ts: '2026-06-27T05:00:00Z',
    items: [
      'F8 — Cross-filter (click-to-filter): clicking a bar, donut slice, or treemap tile in a configured panel now broadcasts a named parameter value to all other panels in the same dashboard whose data source declares a matching parameter. This enables true coordinated views — e.g. clicking \'Region: East\' in a revenue bar chart instantly filters a product-mix donut and a trends line chart that both include a p_region parameter. No separate filter control needed; the click IS the filter.',
      'Interactions: clicking the same element again deselects (toggle off). When a cross-filter is active, non-selected elements dim to 18% opacity so the selection stands out clearly. Cross-filters compose with regular filter-bar selections — both feed into paramsFor() with cross-filters taking priority. Multiple panels can each emit different parameters simultaneously.',
      'Implementation: _crossFilters module-level state in studio-render.js (survives re-renders within the same iframe session). wireXFilter() runs after PDC renders the chart — finds rect.bar (bars/treemap) or svg path (donut) elements, tags each with data-xf-label matching its label, then adds a delegated click listener on the card body. Treemap mirrors PDC\'s internal sort-by-value-desc to align labels correctly. paramsFor() now checks _crossFilters before filter-bar state and defaults. No changes to pdc-ui.js.',
      'Inspector: new \'Cross-filter\' section in the panel inspector (after Detail drawer). \'Emit as parameter\' text input — set to the parameter name this panel broadcasts on click. Receiving is automatic — any panel with a DA parameter of that name will re-query with the selected value. Works in both live preview and exported CDF dashboards.',
      'Tests: 5 new F8 cross-filter checks (section present; emit persists in spec; data-xf-label on bars after emit set; live spec retains emit; inspector input present). Test suite 374/374.',
    ],
  },
  {
    v: 66,
    title: 'H-track: grouped chart gallery',
    ts: '2026-06-27T04:00:00Z',
    items: [
      'H — Grouped chart type gallery: the chart-type picker in the panel inspector (previously a flat 3-column grid of 15 types) now shows chart types organized under labeled group headers — Comparison, Composition, Trend, Flow, Single value, Distribution, Detail. Each group label spans the full grid row and uses uppercase micro-text styling. Each chart card\'s tooltip now shows \'Label (Group)\' for additional orientation. With 15 chart types, grouping makes the gallery scannable at a glance without scrolling.',
      '.cg-label CSS: grid-column:1/-1 (spans all 3 columns), 9px uppercase, letter-spacing .07em, var(--faint) color — quiet but clear. First label has no margin-top. Groups are derived dynamically from Studio.CHARTS[t].group so they update automatically as new chart types are added.',
      'Tests: 2 new H-track checks (gallery has ≥3 group header labels; all chart-opt tiles still present). Test suite 369/369.',
    ],
  },
  {
    v: 65,
    title: 'Detail drawer — record-level click-to-explore for bars, donut, treemap, table (I-track v2)',
    ts: '2026-06-27T00:00:00Z',
    items: [
      'I-track v2 — Detail drawer: a new \'Detail drawer\' section in every panel inspector, complementing the existing Drill-through section. Powered by PDC.openDetail / PDC.bindDetail already present in the vendored toolkit (the same pattern extensively used in the iteration/v2 lab for bar-to-record drill-downs). Select a Detail DA, set the filter parameter that receives the clicked label, an optional title prefix (e.g. \'Records for\'), and a plural noun (e.g. \'records\', \'jobs\', \'pipelines\').',
      'When a Detail DA is configured, clicking any bar, donut slice, or treemap tile opens a slide-in record drawer: it queries the detail DA with the clicked label as the filter parameter, shows the full result as a searchable paginated table (up to 2000 rows), displays a row-count badge, and closes on Escape/overlay-click. Works offline (shows sample data from PDC_MOCK) and live with a Pentaho CDA server.',
      'Four chart types now support cfg.detail: bars (horizontal and vertical), donut/pie, treemap, and table rows. The detail drawer and drill-through are independent — you can set both on the same panel (drawer for record detail, drill for navigating to a related dashboard). Setting Detail DA to (none) disables the feature cleanly.',
      'studio-render.js: added buildDetailCfg(p) helper; passes detailCfg alongside drillCfg to PDC.bars, PDC.donut, PDC.treemap, PDC.table. Ported from the PDC.openDetail pattern observed in iteration/v2 lab dashboards.',
      'Tests: 5 new I-track v2 checks (section present; DA picker present; detail config persists in spec; loading spec with detail does not throw; bars with detail DA get cursor:pointer from PDC.bindDetail). Test suite 367/367.',
    ],
  },
  {
    v: 64,
    title: 'Network/topology chart (F9) + Panel drill-through navigation (I-track)',
    ts: '2026-06-27T03:00:00Z',
    items: [
      'F9 — Network / topology chart: a new CDF-only chart type added to the gallery. Uses PDC.network from the vendor toolkit — radial node-link diagram where each unique endpoint is a node, node size is proportional to total flow volume, and edges are quadratic curves scaled by value. The key interaction: clicking (or hovering) a node triggers blast-radius highlighting — the clicked node and all its direct neighbours stay fully visible while unrelated nodes and edges fade to near-invisible, making the network structure immediately readable. Data format: sourceCol + targetCol + valueCol (same as Sankey and Chord), so any flow/relationship dataset works. CDF-only (no CCC equivalent). 15 chart types total.',
      'I-track — Panel drill-through navigation: a new \'Drill-through\' section in the panel inspector (visible for every panel). Set a Target URL and an optional URL parameter name, and clicking a bar or donut slice will navigate to that URL with ?{param}={clickedLabel}. Uses PDC.drill from the toolkit, which also carries all current filter state (filterState), so the target dashboard opens pre-filtered. Inspired by PDC.bindDrill / PDC.drill patterns extensively used in the iteration/v2 lab dashboards. Works in exported CDF .html dashboards end-to-end. Leave URL empty to disable.',
      'Tests: 3 new F9 checks (network registered; renders circle nodes in preview; has sourceCol field) and 2 new I-track drill checks (drill inspector section present; setting drill URL persists in spec). Test suite 362/362.',
    ],
  },
  {
    v: 63,
    title: 'H-track UX refinement — collapsible inspector sections + DA usage badges',
    ts: '2026-06-27T00:00:00Z',
    items: [
      'H — Collapsible inspector sections: every inspector section (Panel, Chart, Data, Options, Trend & delta, SQL Query, Output columns, Parameters, Calculated columns, Output options, Filter rules, Sort, Cache, Data preview, Compound DA, Filter, etc.) can now be collapsed by clicking its header. A small SVG chevron (chevron-down when open, chevron-right when closed) is prepended to each section title. State is remembered in a module-level _collapsedSects object that persists across renderInspector() re-renders within the same session. The section() helper now wraps content in an .insp-sec-body div and returns the body (not the outer .insp-sec) so callers transparently append to the collapsible body.',
      'H — Chevron design: uses Studio.icon() SVG (chevron-down / chevron-right, 9px) rather than text characters so that h4.textContent continues to return the plain section title — fully backward-compatible with any test or code that reads it. Opacity 0.45 resting, 0.8 on hover. Cursor: pointer on all section h4 headers. .sec-collapsed class added to the outer .insp-sec on collapse so CSS can react (e.g. remove the h4 bottom margin to keep padding tight).',
      'H — DA usage badge: each authored data source card (in the \'My data sources\' section of the library) now shows a small \'Used in N panels · M KPIs\' footer when the DA is referenced in the current spec. Makes it immediately obvious which data sources are actively used vs. orphaned (e.g. after renaming a panel or deleting a panel leaves the DA behind). Computed in buildLibrary() via daUsageCount(). Badge is .da-usage with a top border separator.',
    ],
  },
  {
    v: 62,
    title: 'Dashboard thumbnails — E3, layout preview in inspector and examples gallery',
    ts: '2026-06-27T00:30:00Z',
    items: [
      'E3 — Studio.makeThumbnail(spec, theme): a pure-SVG layout thumbnail generator added to app/model.js. Renders the spec structure as a 240×140 SVG: a branded header strip with the dashboard title, an optional KPI row with colored accent bars (one per KPI tile), and a panel grid with per-chart-type accent colors (each type has its own hue). Light and dark themes produce different color schemes. No DOM, no canvas — just a string of SVG markup, so it works everywhere the spec object is available.',
      'E3 — Dashboard inspector thumbnail: the dashboard-level inspector (when nothing is selected) now shows the thumbnail at the top as a visual orientation aid. Updates automatically as the spec changes (the inspector re-renders on every edit). Gives users a quick bird\'s-eye of the layout without scrolling through the panel list.',
      'E3 — Examples gallery mini-thumbnails: every card in the Examples ▾ gallery now has a layout thumbnail at the top. Generated from index.json metadata (types[], panels count, kpis count) without loading the full spec, so the gallery opens instantly. Uses CSS vars (var(--field), var(--bg)) for seamless light/dark rendering via inline SVG.',
      'Visual polish: example card padding restructured so the thumbnail bleeds edge-to-edge (full width, flush with card border), then text content is padded 10px each side. .ex-card-title and .ex-card-meta get explicit padding so nothing shifts.',
      'Test suite 352/352 (6 new E3 checks: makeThumbnail is a function; returns SVG string; dark differs from light; title in SVG; inspector shows .insp-thumb; gallery cards all have .ex-thumb with SVG).',
    ],
  },
  {
    v: 61,
    title: 'SQL Builder — JOINs, GROUP BY, and aggregate expressions (G1b/G1c)',
    ts: '2026-06-26T14:00:00Z',
    items: [
      'G1b — JOIN builder: the SQL Builder accordion now has a \'JOIN\' section. Click \'Add JOIN\' to append a join clause: pick the join type (LEFT / INNER / RIGHT / FULL OUTER JOIN) from a compact dropdown, enter the joined table (schema.table), and specify the ON condition as free text (e.g. t1.id = t2.customer_id). Multiple JOINs can be stacked; each row has a remove button. Generated SQL renders each join with the ON condition on a separate indented line for readability.',
      'G1c — Aggregate expressions: a new \'AGG\' section lets you add SUM / COUNT / AVG / MAX / MIN / COUNT DISTINCT expressions to the SELECT. Each row specifies a function, the source column, and an AS alias (auto-generated from function + column name if left blank). Aggregate expressions are appended after any regular SELECT columns in the generated SQL — so you can mix group-by dimensions (in Specific columns) and measures (in AGG) in the same query.',
      'G1c — GROUP BY: a \'GROUP BY\' section below WHERE accepts column-name chips (type + Enter, same pattern as Specific columns). The generated SQL appends a GROUP BY clause listing all added columns. Together with AGG, this lets you build a full aggregate query — e.g. SELECT region AS region, SUM(revenue) AS total_rev FROM dbo.sales GROUP BY region — without hand-writing SQL.',
      'Test suite 346/346 (7 new checks: G1b Add JOIN button visible; JOIN clause + joined table generated; ON condition in JOIN; G1c Add aggregate button visible; SUM expression in SELECT; GROUP BY clause generated; GROUP BY column matches chip).',
    ],
  },
  {
    v: 60,
    title: 'Visual SQL builder — G1, generate SELECT statements interactively',
    ts: '2026-06-26T00:00:00Z',
    items: [
      'G1 — Visual SQL Builder: a collapsible \'SQL Builder ▾\' accordion inside the data source builder (SQL kind only). Provides a guided form to construct a SELECT without hand-writing SQL from scratch: From table (schema.table_name), SELECT all columns (*) or specific columns (chip-based, add via column + Enter), WHERE conditions (column / operator / value rows; 9 operators including IS NULL / IS NOT NULL; Add condition button), ORDER BY column with ASC/DESC direction, and LIMIT. \'Generate SQL ▶\' writes a cleanly formatted, aliased SELECT into the query textarea and fires the input event so \'Detect columns\' can pick up the new aliases immediately.',
      'Generated SQL is readable and standards-compliant: specific columns produce \'SELECT col AS col, …\' alias syntax for CDA column detection; numeric values are unquoted, strings are single-quoted with escaped apostrophes; IS NULL/IS NOT NULL omit the value field. The textarea stays editable — the builder is a starting point, not a lockdown.',
      'The accordion state (table, column selection, conditions) persists for the lifetime of the modal session so switching source-type tabs and back won\'t lose builder state. Fully dark-mode aware via CSS var tokens. Test suite 339/339 (5 new G1 checks: toggle visible for SQL DA; body opens on click; FROM clause in generated SQL; specific columns produce AS aliases; WHERE clause generated).',
    ],
  },
  {
    v: 59,
    title: 'Legend toggles — F8 interactivity polish for multi-series charts',
    ts: '2026-06-26T12:00:00Z',
    items: [
      'F8 — Clickable legend toggles for areaStacked, combo, and radar charts. Click any legend chip to hide/show its series: the chip dims to 35% opacity, the corresponding SVG bands/bars/line/polygon+dots fade to transparent with a smooth 220ms transition; click again to restore. All three charts now render a `.lgi-toggle` legend row that replaces the static read-only legend.',
      'areaStacked: each stacked band path is individually togglable. Band base opacity 0.82 is restored on re-show. Enter animation now uses `style.opacity` consistently (previously mixed SVG attribute + CSS style).',
      'combo (bar+line dual-axis): the Bars group (all bar rects) and Line group (path + dots) toggle independently — useful for focusing on either axis without switching chart types.',
      'radar/spider: each series polygon + its vertex dots toggle as a unit. Multi-series comparisons can be explored by isolating series one at a time.',
      'Test suite 334/334 (4 new F8 checks: areaStacked toggle legend present; chip dims on click; combo toggle legend with 2 chips; radar toggle legend).',
    ],
  },
  {
    v: 58,
    title: 'Bullet chart + Calendar heatmap — F7, two new CDF-only visual types',
    ts: '2026-06-26T10:00:00Z',
    items: [
      'F7a — Bullet chart: KPI-vs-target visualization with quality-zone bands (red bad / amber ok / green good across 0–40/40–70/70–100% of max). Each data row draws a wide track, a colored actual-value bar (animated), and a thick vertical target tick. Hover tooltip shows both actual and target. Inspector options: max value (0 = auto-detect), value format, height. Binds to labelCol / valueCol / targetCol (target optional). CDF-only.',
      'F7b — Calendar heatmap: GitHub-style day-grid density chart. Weeks run left to right; Mon–Sun top to bottom. Cell color intensity scales with the value (light 15% at min → full opacity at max); empty days render as pale gray. Month labels float above each new month column. Hover tooltip shows date + formatted value. Expects a YYYY-MM-DD date column (dateCol) and a numeric value column (valueCol). CDF-only.',
      'Sample data: sampledata.js now classifies columns named date / _date / _at as \'isodate\' and generates YYYY-MM-DD strings (e.g. 2025-01-06, 2025-01-10 …) so the calHeatmap offline preview works out of the box without a server connection.',
      'Gallery SVG thumbnails added for both types. newPanel auto-maps columns. 5 new Playwright checks. Test suite 330/330.',
    ],
  },
  {
    v: 57,
    title: 'Sunburst chart — F6, hierarchical part-of-whole',
    ts: '2026-06-26T07:30:00Z',
    items: [
      'F6 — Sunburst chart: a new CDF-only chart type for hierarchical part-of-whole visualization (pairs with Treemap, selectable from the chart-type gallery). Each segment is an annular arc whose angular span is proportional to its value; a center label shows the formatted total. Arc labels appear inside wide-enough arcs; hover tooltips show the label, value, and % of total. Animates in (respects prefers-reduced-motion).',
      'Two-ring mode: when a \'Group column (optional)\' is bound in the inspector, the chart renders two concentric rings — the inner ring shows one arc per group (aggregate totals), and the outer ring subdivides each group arc into its individual items at the same group color. This makes the parent–child relationship immediately visible.',
      'Fields: labelCol (required), valueCol (required), groupCol (optional — enables two-ring hierarchy). Gallery SVG thumbnail added. newPanel auto-maps the first three columns so it\'s usable instantly from drag-to-canvas.',
      'Test suite 325/325 (3 new F6 checks: sunburst registered as CDF-only; sunburst renders arc paths in the preview; sunburst model has groupCol field).',
    ],
  },
  {
    v: 56,
    title: 'Funnel chart — F5, stage-to-stage conversion visualization',
    ts: '2026-06-26T05:00:00Z',
    items: [
      'F5 — Funnel chart: a new CDF-only chart type for stage-to-stage conversion pipelines (sales funnels, onboarding flows, lead funnels). Each stage renders as a horizontally-centred bar whose width is proportional to its value, so the visual narrowing immediately communicates drop-off.',
      'Hover tooltips show the stage label, its value, and the conversion percentage relative to the previous stage. A \'Show conversion %\' inspector toggle adds a dim percentage annotation to the right of each stage so you can read conversion rates at a glance without hovering.',
      'Gallery thumbnail added; chart type registered in the model (fields: labelCol + valueCol — same column binding as bars/donut); newPanel auto-maps columns; animates in (respects prefers-reduced-motion). PDC.funnel is a studio-charts.js extension — vendored pdc-ui.js stays pristine.',
      'Test suite 322/322 (2 new F5 checks: funnel registered as CDF-only; funnel renders stage bars in the preview).',
    ],
  },
  {
    v: 55,
    title: 'Sankey + Chord charts — F1/F2, flow visualization types',
    ts: '2026-06-26T03:30:00Z',
    items: [
      'F1 — Sankey (flow): promotes the toolkit\'s PDC.sankey to a first-class chart type. Pick it from the gallery for any query with source, target, and value columns. Parallel ribbons scale by flow volume; nodes are labeled left (source) and right (destination); hover a ribbon to see the exact value and percentage of total moved. Inspector options: Source caption, Destination caption, value format, and height. CDF-only.',
      'F2 — Chord / dependency wheel: promotes PDC.chord to a first-class chart type. A circular diagram where each entity occupies an arc proportional to its total flow; ribbons between arcs show the flow between pairs. Hover an arc to highlight its connections and dim all others. Inspector options: value format, height. CDF-only.',
      'Both types use the same column-binding model (sourceCol / targetCol / valueCol) and appear in the chart-type gallery with dedicated SVG thumbnails. The inspector shows \'Source column\' and \'Target / destination column\' field labels. newPanel auto-maps the first three columns.',
      'Test suite 320/320 (4 new checks: sankey registered CDF-only; sankey renders flow paths; chord registered CDF-only; chord renders SVG content).',
    ],
  },
  {
    v: 54,
    title: 'Waterfall chart — F4, track F visual types',
    ts: '2026-06-26T02:30:00Z',
    items: [
      'F4 — Waterfall / bridge chart: a new CDF-only chart type (select from the gallery for any label + numeric delta query). Each bar floats at the running-total height: positive deltas are green, negative deltas are red, and an optional Total bar closes the bridge in brand blue. Dashed connector lines link each bar to the next so the cascade is immediately readable.',
      'Hover tooltips show the delta (+/− value) and the running total for every bar; the total bar shows only the running total. A prominent zero baseline appears when values straddle zero (e.g. a mix of gains and losses).',
      'Options in the inspector: Show total bar (bool, default on), Total label (text, default \'Total\'), value format, and height. The chart animates in (respects prefers-reduced-motion).',
      'Built as a studio-charts.js extension (PDC.waterfall) — vendored pdc-ui.js stays pristine. Gallery thumbnail added. Test suite 316/316 (2 new F4 checks: waterfall registered as CDF-only; waterfall renders delta bars in the preview).',
    ],
  },
  {
    v: 53,
    title: 'Sign out + clear local data — E8 session hygiene',
    ts: '2026-06-26T02:00:00Z',
    items: [
      'E8 — Sign out: a new \'Sign out\' option in the ⋯ More menu clears the gate session flag (studio-gate-ok) and reloads, requiring the passcode again. Useful on shared machines or when handing off a demo device.',
      'E8 — Clear local data: \'Clear local data…\' (also in ⋯ More) shows a confirm dialog listing exactly what will be wiped — autosave draft, export history, saved server connections, theme, pane widths & layout — then removes all Studio localStorage keys and reloads for a clean slate.',
      'Both actions include a brief descriptive toast (Clear local data) or immediate reload (Sign out) so the outcome is unambiguous. Keys cleared: studio-autosave, studio-export-history, studio-theme, studio-lw/rw, studio-collapse-library/inspector, studio-connections, studio-active-conn, studio-mob-tab.',
      'Test suite now 314/314 (5 new E8 checks: Sign out button present, Clear local data button present, text labels, localStorage keys removed by clear-data logic).',
    ],
  },
  {
    v: 52,
    title: 'Radar / spider chart — first new visual type (track F)',
    ts: '2026-06-26T00:00:00Z',
    items: [
      'New chart type: Radar / spider — pick it from the chart-type gallery for any multi-metric query. Each axis is a category from the label column; every series draws a polygon across the axes, so you can compare profiles at a glance. Concentric rings, labelled spokes, vertex dots with hover tooltips, a colour legend, and an optional polygon fill — all theme-aware and animated (respects reduced-motion).',
      'Kicks off track F — a richer, more modern, more interactive chart vocabulary (sankey, chord, waterfall, funnel, sunburst, bullet and more to follow). Radar is CDF-only (like the bar+line combo and gauge); it renders in the live preview and exported CDF dashboards.',
      'Test suite now 309/309 (2 new checks: radar registered as a CDF-only type; radar renders ring + series polygons in the preview).',
    ],
  },
  {
    v: 51,
    title: 'Examples gallery card grid + changelog time stamps — E5/E7 polish',
    ts: '2026-06-26T00:13:00Z',
    items: [
      'E5 — Examples menu upgraded from a flat button list to a visual card gallery. Each example now shows a track badge (blue CDF / amber CDE), chart-type chips (bars, donut, treemap …), a bold title, and a compact panel+KPI count. The featured CDF showcase gets its own \'Featured\' section above the full v2 grid. The menu widens automatically to fit the 2-column grid (1-column on phones).',
      'E7 — Changelog date + time: each changelog entry can now carry an optional \'time\' field (e.g. \'14:32 UTC\'). When present, the time appears alongside the date in the changelog popout, giving a precise deployment timestamp for entries stamped by the publish CI.',
      'Test suite now 307/307 (11 new checks: E5 card gallery DOM, E5 ex-cards grid, E5 featured section, E5 CDF badge, E5 CDE badge, E5 chart-type chips, E5 card count ≥ 16, E5 click loads example; E7 time shown when present, E7 time hidden when absent, E7 date+time format).',
    ],
  },
  {
    v: 50,
    title: 'Deep-link filter parameters + changelog search — E4/E6 polish',
    ts: '2026-06-26T00:01:00Z',
    items: [
      'E4 — Deep-link parameters: URL hash key=value pairs now pre-select filters in exported CDF dashboards. Append #filterId=value (or multiple &-separated pairs) to the CDF URL so recipients land on a pre-filtered view. studio-render.js extends PDC.urlParams to merge hash params (lower priority than the query string so ?-based deep-links still win). The dashboard inspector shows a \'Shareable link\' section with the current filter defaults formatted as a hash string and a \'Copy filter hash\' button.',
      'E6 — Changelog search: the collapsible changelog panel now has a live search input. Typing filters to only matching entries; matching text is highlighted in gold/amber (reuses the existing .hl highlight mechanism). Clearing the search restores the full list. A \'No entries match …\' empty state is shown when nothing matches.',
      'Test suite now 296/296 (9 new checks: E6 has search input, E6 all entries shown on open, E6 search narrows results, E6 match highlighting, E6 clear restores all, E6 empty state; E4 hash-param logic, E4 deeplink section present, E4 .fhash code element).',
    ],
  },
  {
    v: 49,
    title: 'Restore-banner detail + export history — E1/E2 polish',
    ts: '2026-06-26T00:00:00Z',
    items: [
      'E1 — Restore-banner now shows how many panels, KPIs, and filters are in the saved spec: the banner reads \'Restore unsaved work on Dashboard Name? (3 panels · 2 KPIs)\' so you can decide whether to restore without actually doing so first. The summary appears in a muted secondary style so it doesn\'t compete with the dashboard name.',
      'E1 — Boot-time default example load no longer clears the autosave, so a recover prompt correctly appears even when you re-open the tab after the flagship example was auto-loaded. Explicit example loads from the Examples menu still clear the autosave as before.',
      'E2 — Export menu now shows a \'Recent exports\' history section (last 5 exports). Each entry shows the format (CDF .html / CDE files / CDA .cda / All artifacts), the dashboard name, and a relative timestamp (\'just now\', \'N min ago\', \'N h ago\'). Clicking any history entry re-runs that export immediately — no format hunting needed. History is persisted to localStorage so it survives page reloads.',
      'Test suite now 287/287 (9 new checks: E1 banner panel/KPI counts, E1 banner visible after reload, E2 localStorage persistence, E2 correct format recorded, E2 #exportHistWrap DOM, E2 \'Recent exports\' header, E2 row count).',
    ],
  },
  {
    v: 48,
    title: 'Focus trap + auto-save + Ctrl+S — a11y and productivity polish',
    ts: '2026-06-26T00:00:00Z',
    items: [
      'Modal focus trap: when any modal opens (data-source builder, export, connections, shortcuts, etc.) the first focusable element inside the modal receives focus automatically; Tab cycles through all interactive elements within the modal and wraps around on the last element; Shift+Tab goes backwards. This satisfies WCAG 2.1 SC 2.1.2 (No Keyboard Trap) and makes keyboard-only users productive in modals without mouse use.',
      'Auto-save to localStorage: after each user edit (first undo-eligible change), the spec is written to localStorage under \'studio-autosave\' with a 1.5 s debounce. On next session start, a dismissible banner (\'Restore unsaved work on <dashboard>? Restore / Dismiss\') appears above the status bar so accidental tab closes or browser crashes never lose work. Loading an example, saving via the Save button, or opening an imported file all clear the autosave to avoid stale recovery prompts.',
      'Ctrl/Cmd+S keyboard shortcut: pressing Ctrl+S (Cmd+S on macOS) when not in a text field downloads the current spec as .studio.json (same as the Save button, but accessible without reaching for the mouse). The shortcut is listed in the keyboard shortcuts modal (? key).',
      'Test suite now 278/278 (4 new checks: modal auto-focus, Tab stays in modal, Ctrl+S listed in shortcuts, autosave writes to localStorage).',
    ],
  },
  {
    v: 47,
    title: 'Search highlighting + keyboard shortcuts modal — UX polish',
    ts: '2026-06-26T00:00:00Z',
    items: [
      'Query library search now highlights matching text: when you type in the search box, every occurrence of the search term in query IDs, column names, and parameter names is wrapped in a <mark class=\'hl\'> element (gold background in light mode, amber in dark mode) for instant visual feedback. Highlights clear automatically when the search field is emptied.',
      'Keyboard shortcuts help modal: press ? (when not in a text field) or open ⋯ More → \'Keyboard shortcuts\' to see a concise table of all keyboard shortcuts — Ctrl+Z/Redo, Ctrl+D duplicate, arrow-key reorder/resize, inline rename, Escape, Tab, and the ? shortcut itself. Styled with <kbd> chips using the theme variables.',
      'Escape key now closes any modal (data-source builder, compound DA builder, export modal, connections manager, shortcuts panel, etc.) via a global keydown listener attached/removed per-modal — previously modals only closed via the X button or clicking the backdrop.',
      'Test suite now 274/274 (8 new checks: 3 search-highlight checks + 5 shortcuts-modal checks).',
    ],
  },
  {
    v: 46,
    title: 'Icon polish + a11y (I4) — aria-labels and SVG theme button in exported CDF',
    ts: '2026-06-26T00:00:00Z',
    items: [
      'I4 — a11y audit of the exported CDF HTML: #qInfoBtn now carries aria-label=\'View the CDA queries behind this dashboard\' (previously only had a title attribute, which is unreliable for screen readers); #themeBtn gets aria-label=\'Toggle dark/light mode\' in the static HTML and a dynamic aria-label (\'Switch to light/dark mode\') set by studio-render.js at boot.',
      'I4 — Theme button (☾/☀ unicode) replaced with SVG moon/sun icons in studio-render.js boot code: same moon + sun paths as the icon registry (14px, stroke:currentColor, aria-hidden). The button now reads cleanly in both light and dark mode without relying on unicode rendering.',
      'I4 — The unicode characters (&#9432; info, &#9790; moon, &#9632; square) remain in the static HTML as graceful fallbacks before JS boot; the boot code upgrades the theme button to SVG immediately.',
      'Test suite now 266/266 (3 new I4 checks: qInfoBtn aria-label, themeBtn aria-label, themeBtn SVG after boot).',
    ],
  },
  {
    v: 45,
    title: 'Touch polish (M6) — momentum scroll, active states, larger inspector fonts',
    ts: '2026-06-26T00:00:00Z',
    items: [
      'M6 — All scrollable regions (.lib-scroll, .insp-scroll, .modal-b, .changelog-pop, .menu, .qpeek-tbl-wrap, .daprev-tbl-wrap) gain -webkit-overflow-scrolling:touch (iOS momentum scroll) and overscroll-behavior:contain (no scroll-chain to parent).',
      'M6 — Active-state feedback for touch devices (@media(hover:none),(pointer:coarse)): .btn, .da>.h, .lib-cda>.h, .row-item, and .mob-tab all respond to :active with a visible background change, mirroring the :hover styles that don\'t fire on touch.',
      'M6 — Inspector legibility on phone (≤640px): .insp-sec h4 bumped to 12.5px, .field label to 12px, .row-item .ri-t to 13.5px, .ri-s to 11.5px — all more comfortable to read on a small screen.',
      'M6 — #topbar and .pane gain overflow-x:hidden at ≤640px as a belt-and-suspenders guard against any content pushing the layout wider than the viewport.',
      'Test suite now 263/263 (5 new M6 checks: overscroll-behavior on lib/insp scrollers, overflow-x:hidden on body, inspector heading and label font size on phone).',
    ],
  },
  {
    v: 44,
    title: 'Responsive exported dashboards (M5) — CDF HTML renders correctly on phones',
    ts: '2026-06-26T00:00:00Z',
    items: [
      'M5 — buildHtml now injects a @media(max-width:640px) block into every exported CDF HTML (and the preview iframe): .pdc-header gains flex-wrap:wrap so the brand, subtitle, and action buttons wrap rather than overflow on narrow screens; .pdc-sub is hidden; .pdc-wrap padding reduces from 18px/22px to 10px; .pdc-kpis gap shrinks to 8px; brand font-size and logo shrink for compactness.',
      'M5 — The existing pdc-ui.css breakpoints (≤1100px: 3→2 col, ≤720px: all→1 col) already cover the chart grid; the new CSS fills the gap for the header chrome and wrapper padding.',
      'M5 — Chart SVGs use width:100% + viewBox so they scale horizontally with the grid column; PDC.redrawAll fires on window resize (180ms debounce) to redraw charts at the new container width.',
      'Test suite now 258/258 (6 new M5 checks: 1-col grid at 390px, KPI tiles render, SVGs render, header flex-wrap, subtitle hidden, no body horizontal overflow).',
    ],
  },
  {
    v: 43,
    title: 'Touch interactions + mobile modals (M3/M4) — builder works on touch devices',
    ts: '2026-06-26T00:00:00Z',
    items: [
      'M3 — drag-to-reorder and drag-to-resize in the preview iframe now call setPointerCapture(pointerId) on pointerdown, preventing pointer loss during touch swipes. pointercancel events are also handled to clean up drag state if the OS interrupts (incoming call, notification, etc.).',
      'M3 — touch-action:none applied inline (via JS in wireEditing) to panel h3 drag handles and .sr-resize elements, stopping the browser from hijacking touch for scroll during drags. Also reflected in the exporters.js preview CSS string for completeness.',
      'M3 — coarse-pointer / narrow-screen tap targets: .da-act buttons get min-height:36px and .chip gets min-height:40px at ≤640px (or pointer:coarse), so library card actions are easy to tap on touch. .da .da-acts is always visible on mobile (no hover-to-reveal — opacity:1 always).',
      'M3 — .resizer (pane drag handles) gains touch-action:none in studio.css.',
      'M4 — modals become bottom-sheet style on phones: .modal-ov drops its padding and stacks children at flex-end; .modal takes 100% viewport width with a top-corner border-radius (18 18 0 0); .modal-h is position:sticky so the title/close stays in view while the body scrolls.',
      'M4 — data-source builder footer (.dsb-foot) is position:sticky at the bottom of the modal body, so Save/Cancel are always reachable without scrolling.',
      'M4 — all modal inputs, selects, and textareas set font-size:16px on mobile (the iOS threshold below which the browser auto-zooms on focus), preventing unwanted viewport zoom.',
      'M4 — DS type-picker cards stack into a single column on ≤640px via grid-template-columns:1fr.',
      'Test suite now 252/252 (9 new M3/M4 checks: touch-action, tap-target min-height, da-acts opacity, modal padding/width/bottom-anchor/sticky-header, input font-size).',
    ],
  },
  {
    v: 42,
    title: 'Icon adoption in canvas + modals (I3) — SVG completes the icon sweep',
    ts: '2026-06-26T00:00:00Z',
    items: [
      'Canvas panel hover actions (⧉ duplicate, × delete) replaced with inline SVG duplicate + close icons inside the preview iframe and exported CDF HTML; the iSvg() local helper + I_DUP/I_CLOSE constants keep Studio.icon() out of the iframe scope.',
      'Canvas KPI tile delete button replaced with SVG close icon (same iframe helper).',
      'Modal close button (.modal-h .x) replaced with a 16px SVG close icon; .modal-h .x CSS updated to inline-flex + hover background for correct sizing and alignment.',
      'Toast (#toast) now renders check or warn SVG icon + text node; .toast gains display:flex + align-items:center + gap:7px for correct icon baseline.',
      'Theme toggle (#btnTheme) and all other secondary topbar buttons (Servers, Sample/Live, Tour) replaced with setIconBtn() SVG + text — no more ☀/☾/⚙/◴/ⓘ emoji in the Chrome.',
      'Inspector Duplicate + Delete btn-wide buttons use SVG duplicate/trash icons with danger color on delete.',
      'DA preview Run/Copy/Run-live buttons, pagination ‹/›, chip rm ×, param rm ×, calc-col rm ×, addP +, addCC + all now use SVG icons.',
      'Series/column remove buttons, connection delete, Add-connection +, My-DS New + and Join ⧈ buttons converted to SVG.',
      'flashBtn() saves/restores innerHTML (not textContent) so SVG-icon buttons survive the flash state.',
      'window.__fireToast test hook added for toast SVG verification in the Playwright suite.',
      'Test suite now 243/243 (12 new I3 checks: topbar SVG, modal close SVG, canvas sr-act SVG, KPI del SVG, inspector btn-wide SVG, toast SVG).',
    ],
  },
  {
    v: 41,
    title: 'Icon adoption across chrome (I2) — SVG icons replace emoji',
    ts: '2026-06-26T00:00:00Z',
    items: [
      'Adopt icon system across the builder chrome: delBtn, moveBtn (↑/↓), section add (+), myDACard dup/del, daCard edit/del, DS_TYPES source-type cards, and topbar undo/redo buttons all now use Studio.icon() SVG instead of emoji or unicode glyphs.',
      'New icons added to registry: \'code\' (</> polylines) and \'metadata\' (house outline) for Scripting and MQL source types.',
      'DS_TYPES entries updated from emoji icon field to iconName field: sql→db, mdx→cube, kettle→gear, mql→metadata, scripting→code.',
      'CSS: .icobtn, .insp-sec h4 .add, .da .da-act, and .dsb-type .ic gain inline-flex/align-items:center so SVG icons center correctly.',
      'All icons inherit color via stroke:currentColor — dark mode works for free, no extra theming needed.',
      'Test suite now 231/231 (11 new I2 checks: SVG in delBtn/moveBtn/section-add/undo/redo; new icon names in registry; icon count ≥28).',
    ],
  },
  {
    v: 40,
    title: 'Mobile drawers (M2) — slide-in panes on phone',
    ts: '2026-06-26T00:00:00Z',
    items: [
      'New: at ≤640px phone width, Query Library and Inspector become slide-in off-canvas drawers instead of squeezed side rails.',
      'New: bottom tab bar (Library · Canvas · Inspector) appears on phone — tap to reveal each pane; Canvas is the default primary view.',
      'Drawer animations: library slides in from the left, inspector from the right, both with a 0.28s cubic-bezier ease.',
      'Translucent scrim appears behind the active drawer; tapping the scrim closes it and returns to canvas view.',
      'Collapse/rail buttons hidden on phone; collapsePane() is a no-op at phone width to prevent conflicts.',
      'Viewport resize from phone→desktop auto-removes drawer-open state for a seamless experience.',
      'Test suite now 220/220 (12 new M2 checks).',
    ],
  },
  {
    v: 39,
    title: 'Responsive shell (M1) — phone/tablet topbar',
    ts: '2026-06-26T00:00:00Z',
    items: [
      'New: real responsive breakpoints — ≤900px (tablet) and ≤640px (phone) — replace the stale 1100px @media rule that was targeting a removed grid layout.',
      'Topbar at ≤900px: secondary actions (Tour, Servers, Live, Theme) collapse into a ⋯ More dropdown menu; top-actions shrinks cleanly; brand and primary actions (New, Examples, Open, Save, Export) always visible.',
      'Topbar at ≤640px: brand subtitle hidden, logo slightly smaller, font tightened; dash-id (title + name) hidden to reclaim horizontal space.',
      'The 3-pane workspace allows horizontal scroll at tablet width so it stays functional even before the full drawer rework (M2).',
      'Test suite now 208/208 (5 new phone-viewport checks at 390×844).',
    ],
  },
  {
    v: 38,
    title: 'Full CDA round-trip parity (slice 8/8)',
    ts: '2026-06-26T00:00:00Z',
    items: [
      'parseCDA now handles all 7 CDA connection types: sql.jndi, sql.jdbc, mondrian.jndi, olap4j, metadata, kettle.TransFromFile, and scripting — each with type-specific fields (jndi, driver/url/user/pass, catalog, connectString, domainId/xmiFile, fileName/step, language).',
      'parseCDA now reads the DA type attribute and maps it to the correct DA_KINDS id (sql→sql.jndi, mdx→mondrian.jndi, mql→metadata, kettle/scripting/olap4j pass through) so imported DAs show the right type in the inspector.',
      'parseCDA reconstructs kind-specific query fields: SQL/MDX/MQL get sql+query; Kettle gets ktrPath+ktrStep; Scripting gets scriptLang+sql from the <QueryScript> body.',
      'parseCDA now round-trips CalculatedColumns (<Name>/<Formula>/<Type> → calcColumns[]) and OutputOptions (<Filter>/<SortBy>/<RowLimit> → outputOptions.filters/sortBy/limit with operator reversal).',
      'parseCDA returns connections[] (all typed connections) alongside the legacy connection object — parseCDE propagates connections[] into the spec so multi-connection CDA imports are fully editable.',
      'Each parsed DA now carries connectionId (from the connection= attribute) for correct binding in the inspector.',
      'Test suite now 203/203 (15 new round-trip checks).',
    ],
  },
  {
    v: 37,
    title: 'Sophisticated DA preview + icon registry',
    ts: '2026-06-26T00:00:00Z',
    items: [
      'New: \'Data preview\' section at the bottom of the data source inspector — auto-runs sample data on open with full column display, type badges, row count, and paging.',
      'Parameter inputs: each DA parameter gets an input field pre-filled with its default value; change values before running to preview different slices.',
      'Paginated table: shows 10 rows per page with ‹/› navigation and a \'Page N / M\' indicator (hides when result fits one page).',
      'Column type inference: each column header shows a type badge (String / Numeric / Date) inferred from the column name and sample values.',
      'Row + column count shown in a status line below the toolbar (e.g. \'25 rows · 4 cols · sample\').',
      'Copy as TSV: copies all rows (not just the current page) as tab-separated text to the clipboard for paste into spreadsheets.',
      'Live query button: when an active Pentaho server connection is set, a \'▶ Run live\' button attempts doQuery against the deployed CDA and falls back to sample on error.',
      'New: app/icons.js — inline-SVG icon registry (Studio.icon(name[, size])). 26 line-icons (edit, trash, duplicate, close, plus, info, clock, moon, sun, gear, undo, redo, refresh, chevrons, grip, check, warn, db, cube, join, play, copy, upload, download, link, eye). All use stroke:currentColor + fill:none so they inherit color and dark mode works for free. No visual changes in the UI yet — this is the groundwork for the icon-adoption track (I2+).',
      'Test suite now 188/188.',
    ],
  },
  {
    v: 36,
    title: 'Output options — post-query filter / sort / limit',
    ts: '2026-06-26T00:00:00Z',
    items: [
      'New: \'Output options\' section in the data source inspector — define filter rules, sort rules, and a row limit that are applied after the query runs.',
      'Filter rules: pick any output column, choose an operator (=, ≠, >, ≥, <, ≤, contains, starts with), and a value; multiple filters are ANDed together.',
      'Sort rules: sort output rows by one or more columns in ascending or descending order.',
      'Row limit: cap the result to at most N rows (0 = no limit).',
      'All rules apply immediately to the in-builder query preview and the live-preview iframe (applied to offline sample data client-side).',
      'CDA export: active rules are emitted as an <OutputOptions> block (<Filter>, <SortBy>, <RowLimit> elements) inside the <DataAccess> element for server-side post-processing where supported.',
      'Test suite now 163/163.',
    ],
  },
  {
    v: 35,
    title: 'Joins & compound data access',
    ts: '2026-06-26T00:00:00Z',
    items: [
      'New: ⧈ Join button in the My Data Sources library — opens a guided builder for Pentaho CDA <CompoundDataAccess> elements (join or union).',
      'Join builder: pick left and right DAs, specify join key columns; union builder: stack rows from two or more DAs.',
      'CDA exporter emits correct <CompoundDataAccess type="join"> / <CompoundDataAccess type="union"> XML; compound DAs are never mistakenly emitted as plain <DataAccess>.',
      'parseCDA now round-trips compound DAs: reconstructs join (leftId, rightId, keys) and union (member DA list) from exported CDA XML.',
      'Dedicated compound DA inspector in the panel inspector — shows join keys or union members inline, with an \'Edit in builder\' shortcut.',
      'Test suite now 146/146.',
    ],
  },
  {
    v: 34,
    title: 'Calculated columns & parameter types',
    ts: '2026-06-26T00:00:00Z',
    items: [
      'New: define calculated columns in the data source — give each a name, a formula (=[col1]+[col2] syntax), and a type; the CDA exporter emits a proper <CalculatedColumns> block.',
      'Parameter type selector is now shown in the DA inspector (was missing — builder already had it). All five CDA types are selectable: String, Integer, Numeric, Date, Boolean.',
      'Studio.COLUMN_TYPES is now a first-class constant shared by the builder, inspector, and model helpers.',
      'Test suite now 134/134.',
    ],
  },
  {
    v: 33,
    title: 'Per-kind query editors',
    ts: '2026-06-26T00:00:00Z',
    items: [
      'The data source builder and inspector now show type-aware fields per query kind: SQL keeps its textarea + column detect; MDX adds a catalog path field; Kettle/PDI shows .ktr path + step name instead of a textarea; Metadata adds a Domain ID; Scripting adds a language selector.',
      'CDA export now emits the correct XML per kind: Kettle DAs get <KtrFile>/<Step>; Scripting DAs get <Language>/<InitScript/>/<QueryScript>; all others keep <Query>.',
      'Test suite now 127/127.',
    ],
  },
  {
    v: 32,
    title: 'CDA connection types',
    ts: '2026-06-25T00:00:00Z',
    items: [
      'New: define named CDA connections (SQL/JNDI, SQL/JDBC, Mondrian MDX, OLAP4J, Metadata, Kettle, Scripting) in the dashboard inspector — each connection type shows the right fields.',
      'Each data source now references a connection by ID; the CDA exporter emits the correct <Connection type=...> XML and the right DA access type (sql/mdx/mql/kettle/scripting).',
      'Data source inspector shows a connection picker when custom connections are defined. Test suite now 119/119.',
    ],
  },
  {
    v: 31,
    title: 'Author your own data sources',
    ts: '2026-06-25T00:00:00Z',
    items: [
      'New: “＋ New source” in the Query Library opens a guided builder — pick a source type (SQL, MDX, Kettle, Metadata, Scripting), write the query, and click Detect to pull columns straight from your SQL.',
      'A live sample-data preview updates as you type; add parameters; every library card now has inline edit / delete.',
      'First step of a larger data-source authoring experience that will keep growing.',
    ],
  },
  {
    v: 30,
    title: 'Safer deploys',
    ts: '2026-06-25T00:00:00Z',
    items: [
      'The full test suite now runs in CI and must pass before any change is published — a broken build can no longer reach the live site.',
    ],
  },
  {
    v: 29,
    title: 'Open a lone .cdfde',
    ts: '2026-06-25T00:00:00Z',
    items: [
      'New: open/import a bare .cdfde — the CDA (queries, parameters, columns, calculated columns) is reconstructed from the file\'s embedded datasources, so no .cda or .wcdf is needed to render and edit.',
      'First step of the larger CDA data-source authoring track.',
    ],
  },
  {
    v: 28,
    title: 'Query peek in panel inspector',
    ts: '2026-06-25T00:00:00Z',
    items: [
      'New: “Query preview” section in the panel inspector — shows the bound query\'s SQL snippet (expandable), column headers, and 3 offline sample rows.',
      'SQL is truncated at 140 chars with a Show full SQL toggle; table scrolls horizontally for wide queries.',
      'Test suite now 95/95.',
    ],
  },
  {
    v: 26,
    title: 'Auto-publish & accessibility',
    ts: '2026-06-25T00:00:00Z',
    items: [
      'New: status-bar footer with a “Last updated” build stamp and this collapsible changelog.',
      'Accessibility: a keyboard focus ring (:focus-visible) on every interactive control.',
      'CI now auto-publishes every change — no manual deploy.',
    ],
  },
  {
    v: 25,
    title: 'Published live',
    ts: '2026-06-25T00:00:00Z',
    items: [
      'Studio published to its public, access-gated site.',
      'Hardened the publish pipeline (clean rsync mirror with a portable fallback).',
    ],
  },
  {
    v: 24,
    title: 'Panels & dark mode',
    ts: '2026-06-24T00:00:00Z',
    items: [
      'Resizable + collapsible Query Library and Inspector panels (widths/state persisted).',
      'Dark-mode polish; fixed inspector list-row text overlap.',
    ],
  },
  {
    v: 23,
    title: 'Branding & access',
    ts: '2026-06-24T00:00:00Z',
    items: [
      'Branding + welcome-tour pass.',
      'First-run welcome tour explaining the Pentaho Solution Engineering demo; access-code gate.',
    ],
  },
  {
    v: 22,
    title: 'Server connections',
    ts: '2026-06-23T00:00:00Z',
    items: [
      'Kettle-standard Pentaho server connections — live data or one-time import.',
      'Push generated artifacts to a live server; scheduler integration.',
    ],
  },
  {
    v: 21,
    title: 'Chart & filter builders',
    ts: '2026-06-22T00:00:00Z',
    items: [
      'Chart gallery picker and filter builder; cross-panel interactions.',
      'Author both CDE and CDF dashboards from existing CDA queries.',
    ],
  },
];
export const LATEST_VERSION = CHANGELOG.reduce(function (m, e) { return Math.max(m, e.v); }, 0);
if (typeof window !== "undefined") { window.STUDIO_CHANGELOG = CHANGELOG; window.STUDIO_LATEST_VERSION = LATEST_VERSION; window.STUDIO_BUILD = "__BUILD_TS__"; }
