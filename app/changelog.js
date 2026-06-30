/* changelog.js — Demonstration Dashboard Studio revision history.
   Newest entry FIRST. The status-bar footer shows the latest "Last updated"
   stamp and renders this list in the collapsible Changelog panel.

   STUDIO_BUILD is replaced with the real UTC deploy time by the publish CI
   (the __BUILD_TS__ token). When unreplaced (local/dev), the footer falls back
   to the date of the top changelog entry below. */
window.STUDIO_BUILD = "__BUILD_TS__";

window.STUDIO_CHANGELOG = [
  { v: "v59", date: "2026-06-26", time: "12:00 UTC", title: "Legend toggles — F8 interactivity polish for multi-series charts", items: [
      "F8 — Clickable legend toggles for areaStacked, combo, and radar charts. Click any legend chip to hide/show its series: the chip dims to 35% opacity, the corresponding SVG bands/bars/line/polygon+dots fade to transparent with a smooth 220ms transition; click again to restore. All three charts now render a `.lgi-toggle` legend row that replaces the static read-only legend.",
      "areaStacked: each stacked band path is individually togglable. Band base opacity 0.82 is restored on re-show. Enter animation now uses `style.opacity` consistently (previously mixed SVG attribute + CSS style).",
      "combo (bar+line dual-axis): the Bars group (all bar rects) and Line group (path + dots) toggle independently — useful for focusing on either axis without switching chart types.",
      "radar/spider: each series polygon + its vertex dots toggle as a unit. Multi-series comparisons can be explored by isolating series one at a time.",
      "Test suite 334/334 (4 new F8 checks: areaStacked toggle legend present; chip dims on click; combo toggle legend with 2 chips; radar toggle legend).",
    ] },
  { v: "v58", date: "2026-06-26", time: "10:00 UTC", title: "Bullet chart + Calendar heatmap — F7, two new CDF-only visual types", items: [
      "F7a — Bullet chart: KPI-vs-target visualization with quality-zone bands (red bad / amber ok / green good across 0–40/40–70/70–100% of max). Each data row draws a wide track, a colored actual-value bar (animated), and a thick vertical target tick. Hover tooltip shows both actual and target. Inspector options: max value (0 = auto-detect), value format, height. Binds to labelCol / valueCol / targetCol (target optional). CDF-only.",
      "F7b — Calendar heatmap: GitHub-style day-grid density chart. Weeks run left to right; Mon–Sun top to bottom. Cell color intensity scales with the value (light 15% at min → full opacity at max); empty days render as pale gray. Month labels float above each new month column. Hover tooltip shows date + formatted value. Expects a YYYY-MM-DD date column (dateCol) and a numeric value column (valueCol). CDF-only.",
      "Sample data: sampledata.js now classifies columns named date / _date / _at as 'isodate' and generates YYYY-MM-DD strings (e.g. 2025-01-06, 2025-01-10 …) so the calHeatmap offline preview works out of the box without a server connection.",
      "Gallery SVG thumbnails added for both types. newPanel auto-maps columns. 5 new Playwright checks. Test suite 330/330.",
    ] },
  { v: "v57", date: "2026-06-26", time: "07:30 UTC", title: "Sunburst chart — F6, hierarchical part-of-whole", items: [
      "F6 — Sunburst chart: a new CDF-only chart type for hierarchical part-of-whole visualization (pairs with Treemap, selectable from the chart-type gallery). Each segment is an annular arc whose angular span is proportional to its value; a center label shows the formatted total. Arc labels appear inside wide-enough arcs; hover tooltips show the label, value, and % of total. Animates in (respects prefers-reduced-motion).",
      "Two-ring mode: when a 'Group column (optional)' is bound in the inspector, the chart renders two concentric rings — the inner ring shows one arc per group (aggregate totals), and the outer ring subdivides each group arc into its individual items at the same group color. This makes the parent–child relationship immediately visible.",
      "Fields: labelCol (required), valueCol (required), groupCol (optional — enables two-ring hierarchy). Gallery SVG thumbnail added. newPanel auto-maps the first three columns so it's usable instantly from drag-to-canvas.",
      "Test suite 325/325 (3 new F6 checks: sunburst registered as CDF-only; sunburst renders arc paths in the preview; sunburst model has groupCol field).",
    ] },
  { v: "v56", date: "2026-06-26", time: "05:00 UTC", title: "Funnel chart — F5, stage-to-stage conversion visualization", items: [
      "F5 — Funnel chart: a new CDF-only chart type for stage-to-stage conversion pipelines (sales funnels, onboarding flows, lead funnels). Each stage renders as a horizontally-centred bar whose width is proportional to its value, so the visual narrowing immediately communicates drop-off.",
      "Hover tooltips show the stage label, its value, and the conversion percentage relative to the previous stage. A 'Show conversion %' inspector toggle adds a dim percentage annotation to the right of each stage so you can read conversion rates at a glance without hovering.",
      "Gallery thumbnail added; chart type registered in the model (fields: labelCol + valueCol — same column binding as bars/donut); newPanel auto-maps columns; animates in (respects prefers-reduced-motion). PDC.funnel is a studio-charts.js extension — vendored pdc-ui.js stays pristine.",
      "Test suite 322/322 (2 new F5 checks: funnel registered as CDF-only; funnel renders stage bars in the preview).",
    ] },
  { v: "v55", date: "2026-06-26", time: "03:30 UTC", title: "Sankey + Chord charts — F1/F2, flow visualization types", items: [
      "F1 — Sankey (flow): promotes the toolkit's PDC.sankey to a first-class chart type. Pick it from the gallery for any query with source, target, and value columns. Parallel ribbons scale by flow volume; nodes are labeled left (source) and right (destination); hover a ribbon to see the exact value and percentage of total moved. Inspector options: Source caption, Destination caption, value format, and height. CDF-only.",
      "F2 — Chord / dependency wheel: promotes PDC.chord to a first-class chart type. A circular diagram where each entity occupies an arc proportional to its total flow; ribbons between arcs show the flow between pairs. Hover an arc to highlight its connections and dim all others. Inspector options: value format, height. CDF-only.",
      "Both types use the same column-binding model (sourceCol / targetCol / valueCol) and appear in the chart-type gallery with dedicated SVG thumbnails. The inspector shows 'Source column' and 'Target / destination column' field labels. newPanel auto-maps the first three columns.",
      "Test suite 320/320 (4 new checks: sankey registered CDF-only; sankey renders flow paths; chord registered CDF-only; chord renders SVG content).",
    ] },
  { v: "v54", date: "2026-06-26", time: "02:30 UTC", title: "Waterfall chart — F4, track F visual types", items: [
      "F4 — Waterfall / bridge chart: a new CDF-only chart type (select from the gallery for any label + numeric delta query). Each bar floats at the running-total height: positive deltas are green, negative deltas are red, and an optional Total bar closes the bridge in brand blue. Dashed connector lines link each bar to the next so the cascade is immediately readable.",
      "Hover tooltips show the delta (+/− value) and the running total for every bar; the total bar shows only the running total. A prominent zero baseline appears when values straddle zero (e.g. a mix of gains and losses).",
      "Options in the inspector: Show total bar (bool, default on), Total label (text, default 'Total'), value format, and height. The chart animates in (respects prefers-reduced-motion).",
      "Built as a studio-charts.js extension (PDC.waterfall) — vendored pdc-ui.js stays pristine. Gallery thumbnail added. Test suite 316/316 (2 new F4 checks: waterfall registered as CDF-only; waterfall renders delta bars in the preview).",
    ] },
  { v: "v53", date: "2026-06-26", time: "02:00 UTC", title: "Sign out + clear local data — E8 session hygiene", items: [
      "E8 — Sign out: a new 'Sign out' option in the ⋯ More menu clears the gate session flag (studio-gate-ok) and reloads, requiring the passcode again. Useful on shared machines or when handing off a demo device.",
      "E8 — Clear local data: 'Clear local data…' (also in ⋯ More) shows a confirm dialog listing exactly what will be wiped — autosave draft, export history, saved server connections, theme, pane widths & layout — then removes all Studio localStorage keys and reloads for a clean slate.",
      "Both actions include a brief descriptive toast (Clear local data) or immediate reload (Sign out) so the outcome is unambiguous. Keys cleared: studio-autosave, studio-export-history, studio-theme, studio-lw/rw, studio-collapse-library/inspector, studio-connections, studio-active-conn, studio-mob-tab.",
      "Test suite now 314/314 (5 new E8 checks: Sign out button present, Clear local data button present, text labels, localStorage keys removed by clear-data logic).",
    ] },
  { v: "v52", date: "2026-06-26", title: "Radar / spider chart — first new visual type (track F)", items: [
      "New chart type: Radar / spider — pick it from the chart-type gallery for any multi-metric query. Each axis is a category from the label column; every series draws a polygon across the axes, so you can compare profiles at a glance. Concentric rings, labelled spokes, vertex dots with hover tooltips, a colour legend, and an optional polygon fill — all theme-aware and animated (respects reduced-motion).",
      "Kicks off track F — a richer, more modern, more interactive chart vocabulary (sankey, chord, waterfall, funnel, sunburst, bullet and more to follow). Radar is CDF-only (like the bar+line combo and gauge); it renders in the live preview and exported CDF dashboards.",
      "Test suite now 309/309 (2 new checks: radar registered as a CDF-only type; radar renders ring + series polygons in the preview).",
    ] },
  { v: "v51", date: "2026-06-26", time: "00:13 UTC", title: "Examples gallery card grid + changelog time stamps — E5/E7 polish", items: [
      "E5 — Examples menu upgraded from a flat button list to a visual card gallery. Each example now shows a track badge (blue CDF / amber CDE), chart-type chips (bars, donut, treemap …), a bold title, and a compact panel+KPI count. The featured CDF showcase gets its own 'Featured' section above the full v2 grid. The menu widens automatically to fit the 2-column grid (1-column on phones).",
      "E7 — Changelog date + time: each changelog entry can now carry an optional 'time' field (e.g. '14:32 UTC'). When present, the time appears alongside the date in the changelog popout, giving a precise deployment timestamp for entries stamped by the publish CI.",
      "Test suite now 307/307 (11 new checks: E5 card gallery DOM, E5 ex-cards grid, E5 featured section, E5 CDF badge, E5 CDE badge, E5 chart-type chips, E5 card count ≥ 16, E5 click loads example; E7 time shown when present, E7 time hidden when absent, E7 date+time format)."
  ] },
  { v: "v50", date: "2026-06-26", time: "00:01 UTC", title: "Deep-link filter parameters + changelog search — E4/E6 polish", items: [
      "E4 — Deep-link parameters: URL hash key=value pairs now pre-select filters in exported CDF dashboards. Append #filterId=value (or multiple &-separated pairs) to the CDF URL so recipients land on a pre-filtered view. studio-render.js extends PDC.urlParams to merge hash params (lower priority than the query string so ?-based deep-links still win). The dashboard inspector shows a 'Shareable link' section with the current filter defaults formatted as a hash string and a 'Copy filter hash' button.",
      "E6 — Changelog search: the collapsible changelog panel now has a live search input. Typing filters to only matching entries; matching text is highlighted in gold/amber (reuses the existing .hl highlight mechanism). Clearing the search restores the full list. A 'No entries match …' empty state is shown when nothing matches.",
      "Test suite now 296/296 (9 new checks: E6 has search input, E6 all entries shown on open, E6 search narrows results, E6 match highlighting, E6 clear restores all, E6 empty state; E4 hash-param logic, E4 deeplink section present, E4 .fhash code element)."
  ] },
  { v: "v49", date: "2026-06-26", title: "Restore-banner detail + export history — E1/E2 polish", items: [
      "E1 — Restore-banner now shows how many panels, KPIs, and filters are in the saved spec: the banner reads 'Restore unsaved work on Dashboard Name? (3 panels · 2 KPIs)' so you can decide whether to restore without actually doing so first. The summary appears in a muted secondary style so it doesn't compete with the dashboard name.",
      "E1 — Boot-time default example load no longer clears the autosave, so a recover prompt correctly appears even when you re-open the tab after the flagship example was auto-loaded. Explicit example loads from the Examples menu still clear the autosave as before.",
      "E2 — Export menu now shows a 'Recent exports' history section (last 5 exports). Each entry shows the format (CDF .html / CDE files / CDA .cda / All artifacts), the dashboard name, and a relative timestamp ('just now', 'N min ago', 'N h ago'). Clicking any history entry re-runs that export immediately — no format hunting needed. History is persisted to localStorage so it survives page reloads.",
      "Test suite now 287/287 (9 new checks: E1 banner panel/KPI counts, E1 banner visible after reload, E2 localStorage persistence, E2 correct format recorded, E2 #exportHistWrap DOM, E2 'Recent exports' header, E2 row count)."
  ] },
  { v: "v48", date: "2026-06-26", title: "Focus trap + auto-save + Ctrl+S — a11y and productivity polish", items: [
      "Modal focus trap: when any modal opens (data-source builder, export, connections, shortcuts, etc.) the first focusable element inside the modal receives focus automatically; Tab cycles through all interactive elements within the modal and wraps around on the last element; Shift+Tab goes backwards. This satisfies WCAG 2.1 SC 2.1.2 (No Keyboard Trap) and makes keyboard-only users productive in modals without mouse use.",
      "Auto-save to localStorage: after each user edit (first undo-eligible change), the spec is written to localStorage under 'studio-autosave' with a 1.5 s debounce. On next session start, a dismissible banner ('Restore unsaved work on <dashboard>? Restore / Dismiss') appears above the status bar so accidental tab closes or browser crashes never lose work. Loading an example, saving via the Save button, or opening an imported file all clear the autosave to avoid stale recovery prompts.",
      "Ctrl/Cmd+S keyboard shortcut: pressing Ctrl+S (Cmd+S on macOS) when not in a text field downloads the current spec as .studio.json (same as the Save button, but accessible without reaching for the mouse). The shortcut is listed in the keyboard shortcuts modal (? key).",
      "Test suite now 278/278 (4 new checks: modal auto-focus, Tab stays in modal, Ctrl+S listed in shortcuts, autosave writes to localStorage)."
  ] },
  { v: "v47", date: "2026-06-26", title: "Search highlighting + keyboard shortcuts modal — UX polish", items: [
      "Query library search now highlights matching text: when you type in the search box, every occurrence of the search term in query IDs, column names, and parameter names is wrapped in a <mark class='hl'> element (gold background in light mode, amber in dark mode) for instant visual feedback. Highlights clear automatically when the search field is emptied.",
      "Keyboard shortcuts help modal: press ? (when not in a text field) or open ⋯ More → 'Keyboard shortcuts' to see a concise table of all keyboard shortcuts — Ctrl+Z/Redo, Ctrl+D duplicate, arrow-key reorder/resize, inline rename, Escape, Tab, and the ? shortcut itself. Styled with <kbd> chips using the theme variables.",
      "Escape key now closes any modal (data-source builder, compound DA builder, export modal, connections manager, shortcuts panel, etc.) via a global keydown listener attached/removed per-modal — previously modals only closed via the X button or clicking the backdrop.",
      "Test suite now 274/274 (8 new checks: 3 search-highlight checks + 5 shortcuts-modal checks)."
  ] },
  { v: "v46", date: "2026-06-26", title: "Icon polish + a11y (I4) — aria-labels and SVG theme button in exported CDF", items: [
      "I4 — a11y audit of the exported CDF HTML: #qInfoBtn now carries aria-label='View the CDA queries behind this dashboard' (previously only had a title attribute, which is unreliable for screen readers); #themeBtn gets aria-label='Toggle dark/light mode' in the static HTML and a dynamic aria-label ('Switch to light/dark mode') set by studio-render.js at boot.",
      "I4 — Theme button (☾/☀ unicode) replaced with SVG moon/sun icons in studio-render.js boot code: same moon + sun paths as the icon registry (14px, stroke:currentColor, aria-hidden). The button now reads cleanly in both light and dark mode without relying on unicode rendering.",
      "I4 — The unicode characters (&#9432; info, &#9790; moon, &#9632; square) remain in the static HTML as graceful fallbacks before JS boot; the boot code upgrades the theme button to SVG immediately.",
      "Test suite now 266/266 (3 new I4 checks: qInfoBtn aria-label, themeBtn aria-label, themeBtn SVG after boot)."
  ] },
  { v: "v45", date: "2026-06-26", title: "Touch polish (M6) — momentum scroll, active states, larger inspector fonts", items: [
      "M6 — All scrollable regions (.lib-scroll, .insp-scroll, .modal-b, .changelog-pop, .menu, .qpeek-tbl-wrap, .daprev-tbl-wrap) gain -webkit-overflow-scrolling:touch (iOS momentum scroll) and overscroll-behavior:contain (no scroll-chain to parent).",
      "M6 — Active-state feedback for touch devices (@media(hover:none),(pointer:coarse)): .btn, .da>.h, .lib-cda>.h, .row-item, and .mob-tab all respond to :active with a visible background change, mirroring the :hover styles that don't fire on touch.",
      "M6 — Inspector legibility on phone (≤640px): .insp-sec h4 bumped to 12.5px, .field label to 12px, .row-item .ri-t to 13.5px, .ri-s to 11.5px — all more comfortable to read on a small screen.",
      "M6 — #topbar and .pane gain overflow-x:hidden at ≤640px as a belt-and-suspenders guard against any content pushing the layout wider than the viewport.",
      "Test suite now 263/263 (5 new M6 checks: overscroll-behavior on lib/insp scrollers, overflow-x:hidden on body, inspector heading and label font size on phone)."
  ] },
  { v: "v44", date: "2026-06-26", title: "Responsive exported dashboards (M5) — CDF HTML renders correctly on phones", items: [
      "M5 — buildHtml now injects a @media(max-width:640px) block into every exported CDF HTML (and the preview iframe): .pdc-header gains flex-wrap:wrap so the brand, subtitle, and action buttons wrap rather than overflow on narrow screens; .pdc-sub is hidden; .pdc-wrap padding reduces from 18px/22px to 10px; .pdc-kpis gap shrinks to 8px; brand font-size and logo shrink for compactness.",
      "M5 — The existing pdc-ui.css breakpoints (≤1100px: 3→2 col, ≤720px: all→1 col) already cover the chart grid; the new CSS fills the gap for the header chrome and wrapper padding.",
      "M5 — Chart SVGs use width:100% + viewBox so they scale horizontally with the grid column; PDC.redrawAll fires on window resize (180ms debounce) to redraw charts at the new container width.",
      "Test suite now 258/258 (6 new M5 checks: 1-col grid at 390px, KPI tiles render, SVGs render, header flex-wrap, subtitle hidden, no body horizontal overflow)."
  ] },
  { v: "v43", date: "2026-06-26", title: "Touch interactions + mobile modals (M3/M4) — builder works on touch devices", items: [
      "M3 — drag-to-reorder and drag-to-resize in the preview iframe now call setPointerCapture(pointerId) on pointerdown, preventing pointer loss during touch swipes. pointercancel events are also handled to clean up drag state if the OS interrupts (incoming call, notification, etc.).",
      "M3 — touch-action:none applied inline (via JS in wireEditing) to panel h3 drag handles and .sr-resize elements, stopping the browser from hijacking touch for scroll during drags. Also reflected in the exporters.js preview CSS string for completeness.",
      "M3 — coarse-pointer / narrow-screen tap targets: .da-act buttons get min-height:36px and .chip gets min-height:40px at ≤640px (or pointer:coarse), so library card actions are easy to tap on touch. .da .da-acts is always visible on mobile (no hover-to-reveal — opacity:1 always).",
      "M3 — .resizer (pane drag handles) gains touch-action:none in studio.css.",
      "M4 — modals become bottom-sheet style on phones: .modal-ov drops its padding and stacks children at flex-end; .modal takes 100% viewport width with a top-corner border-radius (18 18 0 0); .modal-h is position:sticky so the title/close stays in view while the body scrolls.",
      "M4 — data-source builder footer (.dsb-foot) is position:sticky at the bottom of the modal body, so Save/Cancel are always reachable without scrolling.",
      "M4 — all modal inputs, selects, and textareas set font-size:16px on mobile (the iOS threshold below which the browser auto-zooms on focus), preventing unwanted viewport zoom.",
      "M4 — DS type-picker cards stack into a single column on ≤640px via grid-template-columns:1fr.",
      "Test suite now 252/252 (9 new M3/M4 checks: touch-action, tap-target min-height, da-acts opacity, modal padding/width/bottom-anchor/sticky-header, input font-size)."
  ] },
  { v: "v42", date: "2026-06-26", title: "Icon adoption in canvas + modals (I3) — SVG completes the icon sweep", items: [
      "Canvas panel hover actions (⧉ duplicate, × delete) replaced with inline SVG duplicate + close icons inside the preview iframe and exported CDF HTML; the iSvg() local helper + I_DUP/I_CLOSE constants keep Studio.icon() out of the iframe scope.",
      "Canvas KPI tile delete button replaced with SVG close icon (same iframe helper).",
      "Modal close button (.modal-h .x) replaced with a 16px SVG close icon; .modal-h .x CSS updated to inline-flex + hover background for correct sizing and alignment.",
      "Toast (#toast) now renders check or warn SVG icon + text node; .toast gains display:flex + align-items:center + gap:7px for correct icon baseline.",
      "Theme toggle (#btnTheme) and all other secondary topbar buttons (Servers, Sample/Live, Tour) replaced with setIconBtn() SVG + text — no more ☀/☾/⚙/◴/ⓘ emoji in the Chrome.",
      "Inspector Duplicate + Delete btn-wide buttons use SVG duplicate/trash icons with danger color on delete.",
      "DA preview Run/Copy/Run-live buttons, pagination ‹/›, chip rm ×, param rm ×, calc-col rm ×, addP +, addCC + all now use SVG icons.",
      "Series/column remove buttons, connection delete, Add-connection +, My-DS New + and Join ⧈ buttons converted to SVG.",
      "flashBtn() saves/restores innerHTML (not textContent) so SVG-icon buttons survive the flash state.",
      "window.__fireToast test hook added for toast SVG verification in the Playwright suite.",
      "Test suite now 243/243 (12 new I3 checks: topbar SVG, modal close SVG, canvas sr-act SVG, KPI del SVG, inspector btn-wide SVG, toast SVG)."
  ] },
  { v: "v41", date: "2026-06-26", title: "Icon adoption across chrome (I2) — SVG icons replace emoji", items: [
      "Adopt icon system across the builder chrome: delBtn, moveBtn (↑/↓), section add (+), myDACard dup/del, daCard edit/del, DS_TYPES source-type cards, and topbar undo/redo buttons all now use Studio.icon() SVG instead of emoji or unicode glyphs.",
      "New icons added to registry: 'code' (</> polylines) and 'metadata' (house outline) for Scripting and MQL source types.",
      "DS_TYPES entries updated from emoji icon field to iconName field: sql→db, mdx→cube, kettle→gear, mql→metadata, scripting→code.",
      "CSS: .icobtn, .insp-sec h4 .add, .da .da-act, and .dsb-type .ic gain inline-flex/align-items:center so SVG icons center correctly.",
      "All icons inherit color via stroke:currentColor — dark mode works for free, no extra theming needed.",
      "Test suite now 231/231 (11 new I2 checks: SVG in delBtn/moveBtn/section-add/undo/redo; new icon names in registry; icon count ≥28)."
  ] },
  { v: "v40", date: "2026-06-26", title: "Mobile drawers (M2) — slide-in panes on phone", items: [
      "New: at ≤640px phone width, Query Library and Inspector become slide-in off-canvas drawers instead of squeezed side rails.",
      "New: bottom tab bar (Library · Canvas · Inspector) appears on phone — tap to reveal each pane; Canvas is the default primary view.",
      "Drawer animations: library slides in from the left, inspector from the right, both with a 0.28s cubic-bezier ease.",
      "Translucent scrim appears behind the active drawer; tapping the scrim closes it and returns to canvas view.",
      "Collapse/rail buttons hidden on phone; collapsePane() is a no-op at phone width to prevent conflicts.",
      "Viewport resize from phone→desktop auto-removes drawer-open state for a seamless experience.",
      "Test suite now 220/220 (12 new M2 checks)."
  ] },
  { v: "v39", date: "2026-06-26", title: "Responsive shell (M1) — phone/tablet topbar", items: [
      "New: real responsive breakpoints — ≤900px (tablet) and ≤640px (phone) — replace the stale 1100px @media rule that was targeting a removed grid layout.",
      "Topbar at ≤900px: secondary actions (Tour, Servers, Live, Theme) collapse into a ⋯ More dropdown menu; top-actions shrinks cleanly; brand and primary actions (New, Examples, Open, Save, Export) always visible.",
      "Topbar at ≤640px: brand subtitle hidden, logo slightly smaller, font tightened; dash-id (title + name) hidden to reclaim horizontal space.",
      "The 3-pane workspace allows horizontal scroll at tablet width so it stays functional even before the full drawer rework (M2).",
      "Test suite now 208/208 (5 new phone-viewport checks at 390×844)."
  ] },
  { v: "v38", date: "2026-06-26", title: "Full CDA round-trip parity (slice 8/8)", items: [
      "parseCDA now handles all 7 CDA connection types: sql.jndi, sql.jdbc, mondrian.jndi, olap4j, metadata, kettle.TransFromFile, and scripting — each with type-specific fields (jndi, driver/url/user/pass, catalog, connectString, domainId/xmiFile, fileName/step, language).",
      "parseCDA now reads the DA type attribute and maps it to the correct DA_KINDS id (sql→sql.jndi, mdx→mondrian.jndi, mql→metadata, kettle/scripting/olap4j pass through) so imported DAs show the right type in the inspector.",
      "parseCDA reconstructs kind-specific query fields: SQL/MDX/MQL get sql+query; Kettle gets ktrPath+ktrStep; Scripting gets scriptLang+sql from the <QueryScript> body.",
      "parseCDA now round-trips CalculatedColumns (<Name>/<Formula>/<Type> → calcColumns[]) and OutputOptions (<Filter>/<SortBy>/<RowLimit> → outputOptions.filters/sortBy/limit with operator reversal).",
      "parseCDA returns connections[] (all typed connections) alongside the legacy connection object — parseCDE propagates connections[] into the spec so multi-connection CDA imports are fully editable.",
      "Each parsed DA now carries connectionId (from the connection= attribute) for correct binding in the inspector.",
      "Test suite now 203/203 (15 new round-trip checks)."
  ] },
  { v: "v37", date: "2026-06-26", title: "Sophisticated DA preview + icon registry", items: [
      "New: 'Data preview' section at the bottom of the data source inspector — auto-runs sample data on open with full column display, type badges, row count, and paging.",
      "Parameter inputs: each DA parameter gets an input field pre-filled with its default value; change values before running to preview different slices.",
      "Paginated table: shows 10 rows per page with ‹/› navigation and a 'Page N / M' indicator (hides when result fits one page).",
      "Column type inference: each column header shows a type badge (String / Numeric / Date) inferred from the column name and sample values.",
      "Row + column count shown in a status line below the toolbar (e.g. '25 rows · 4 cols · sample').",
      "Copy as TSV: copies all rows (not just the current page) as tab-separated text to the clipboard for paste into spreadsheets.",
      "Live query button: when an active Pentaho server connection is set, a '▶ Run live' button attempts doQuery against the deployed CDA and falls back to sample on error.",
      "New: app/icons.js — inline-SVG icon registry (Studio.icon(name[, size])). 26 line-icons (edit, trash, duplicate, close, plus, info, clock, moon, sun, gear, undo, redo, refresh, chevrons, grip, check, warn, db, cube, join, play, copy, upload, download, link, eye). All use stroke:currentColor + fill:none so they inherit color and dark mode works for free. No visual changes in the UI yet — this is the groundwork for the icon-adoption track (I2+).",
      "Test suite now 188/188."
  ] },
  { v: "v36", date: "2026-06-26", title: "Output options — post-query filter / sort / limit", items: [
      "New: 'Output options' section in the data source inspector — define filter rules, sort rules, and a row limit that are applied after the query runs.",
      "Filter rules: pick any output column, choose an operator (=, ≠, >, ≥, <, ≤, contains, starts with), and a value; multiple filters are ANDed together.",
      "Sort rules: sort output rows by one or more columns in ascending or descending order.",
      "Row limit: cap the result to at most N rows (0 = no limit).",
      "All rules apply immediately to the in-builder query preview and the live-preview iframe (applied to offline sample data client-side).",
      "CDA export: active rules are emitted as an <OutputOptions> block (<Filter>, <SortBy>, <RowLimit> elements) inside the <DataAccess> element for server-side post-processing where supported.",
      "Test suite now 163/163."
  ] },
  { v: "v35", date: "2026-06-26", title: "Joins & compound data access", items: [
      "New: ⧈ Join button in the My Data Sources library — opens a guided builder for Pentaho CDA <CompoundDataAccess> elements (join or union).",
      "Join builder: pick left and right DAs, specify join key columns; union builder: stack rows from two or more DAs.",
      "CDA exporter emits correct <CompoundDataAccess type=\"join\"> / <CompoundDataAccess type=\"union\"> XML; compound DAs are never mistakenly emitted as plain <DataAccess>.",
      "parseCDA now round-trips compound DAs: reconstructs join (leftId, rightId, keys) and union (member DA list) from exported CDA XML.",
      "Dedicated compound DA inspector in the panel inspector — shows join keys or union members inline, with an 'Edit in builder' shortcut.",
      "Test suite now 146/146."
  ] },
  { v: "v34", date: "2026-06-26", title: "Calculated columns & parameter types", items: [
      "New: define calculated columns in the data source — give each a name, a formula (=[col1]+[col2] syntax), and a type; the CDA exporter emits a proper <CalculatedColumns> block.",
      "Parameter type selector is now shown in the DA inspector (was missing — builder already had it). All five CDA types are selectable: String, Integer, Numeric, Date, Boolean.",
      "Studio.COLUMN_TYPES is now a first-class constant shared by the builder, inspector, and model helpers.",
      "Test suite now 134/134."
  ] },
  { v: "v33", date: "2026-06-26", title: "Per-kind query editors", items: [
      "The data source builder and inspector now show type-aware fields per query kind: SQL keeps its textarea + column detect; MDX adds a catalog path field; Kettle/PDI shows .ktr path + step name instead of a textarea; Metadata adds a Domain ID; Scripting adds a language selector.",
      "CDA export now emits the correct XML per kind: Kettle DAs get <KtrFile>/<Step>; Scripting DAs get <Language>/<InitScript/>/<QueryScript>; all others keep <Query>.",
      "Test suite now 127/127."
  ] },
  { v: "v32", date: "2026-06-25", title: "CDA connection types", items: [
      "New: define named CDA connections (SQL/JNDI, SQL/JDBC, Mondrian MDX, OLAP4J, Metadata, Kettle, Scripting) in the dashboard inspector — each connection type shows the right fields.",
      "Each data source now references a connection by ID; the CDA exporter emits the correct <Connection type=...> XML and the right DA access type (sql/mdx/mql/kettle/scripting).",
      "Data source inspector shows a connection picker when custom connections are defined. Test suite now 119/119."
  ] },
  { v: "v31", date: "2026-06-25", title: "Author your own data sources", items: [
      "New: “＋ New source” in the Query Library opens a guided builder — pick a source type (SQL, MDX, Kettle, Metadata, Scripting), write the query, and click Detect to pull columns straight from your SQL.",
      "A live sample-data preview updates as you type; add parameters; every library card now has inline edit / delete.",
      "First step of a larger data-source authoring experience that will keep growing."
  ] },
  { v: "v30", date: "2026-06-25", title: "Safer deploys", items: [
      "The full test suite now runs in CI and must pass before any change is published — a broken build can no longer reach the live site."
  ] },
  { v: "v29", date: "2026-06-25", title: "Open a lone .cdfde", items: [
      "New: open/import a bare .cdfde — the CDA (queries, parameters, columns, calculated columns) is reconstructed from the file's embedded datasources, so no .cda or .wcdf is needed to render and edit.",
      "First step of the larger CDA data-source authoring track."
  ] },
  { v: "v28", date: "2026-06-25", title: "Query peek in panel inspector", items: [
      "New: “Query preview” section in the panel inspector — shows the bound query's SQL snippet (expandable), column headers, and 3 offline sample rows.",
      "SQL is truncated at 140 chars with a Show full SQL toggle; table scrolls horizontally for wide queries.",
      "Test suite now 95/95."
  ] },
  { v: "v26", date: "2026-06-25", title: "Auto-publish & accessibility", items: [
      "New: status-bar footer with a “Last updated” build stamp and this collapsible changelog.",
      "Accessibility: a keyboard focus ring (:focus-visible) on every interactive control.",
      "CI now auto-publishes every change to dashboardstudio.pentaho.space — no manual deploy."
  ] },
  { v: "v25", date: "2026-06-25", title: "Published live", items: [
      "Studio published to its public, access-gated site.",
      "Hardened the publish pipeline (clean rsync mirror with a portable fallback)."
  ] },
  { v: "v24", date: "2026-06-24", title: "Panels & dark mode", items: [
      "Resizable + collapsible Query Library and Inspector panels (widths/state persisted).",
      "Dark-mode polish; fixed inspector list-row text overlap."
  ] },
  { v: "v23", date: "2026-06-24", title: "Branding & access", items: [
      "Renamed to “Demonstration Dashboard Studio”.",
      "First-run welcome tour explaining the Pentaho Solution Engineering demo; access-code gate."
  ] },
  { v: "v22", date: "2026-06-23", title: "Server connections", items: [
      "Kettle-standard Pentaho server connections — live data or one-time import.",
      "Push generated artifacts to a live server; scheduler integration."
  ] },
  { v: "v21", date: "2026-06-22", title: "Chart & filter builders", items: [
      "Chart gallery picker and filter builder; cross-panel interactions.",
      "Author both CDE and CDF dashboards from existing CDA queries."
  ] }
];
