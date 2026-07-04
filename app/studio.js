/* ============================================================================
   studio.js — PDC Dashboard Studio controller.
   Wires the 3-pane builder: query library · live-preview iframe · inspector.
   Holds the single spec, mutates it, debounces a preview rebuild, and drives
   the exporters. Plain DOM, no framework.
   ============================================================================ */
(function () {
  "use strict";
  var Studio = window.Studio;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };

  var S = {
    catalog: {}, examples: [],
    assets: { css: "", js: "", render: "" },
    spec: Studio.emptySpec(),
    selection: null,                       // null=dashboard | {kind,id} | {kind:'kpi',index}
    settings: { deployPath: deployPathPref(), live: liveDataPref() },
    connections: [], activeConn: null,
    theme: "light",
    simpleMode: false,
    demoMode: false
  };
  window.__STUDIO_STATE = S;               // exposed for tests
  window.__demoMode = false;               // test hook — mirrors S.demoMode

  // H-track v117: Demo mode — interval handle + tick counter for data variation
  var _demoInterval = null;
  var _demoTick = 0;

  // inspector section collapse state — keyed by normalized title.
  // Persists across renderInspector() re-renders AND across page reloads (localStorage).
  // This means the user's preferred section layout is remembered between sessions.
  var _LS_COLLAPSED = "studio-insp-collapsed";
  var _collapsedSects = (function () {
    try { return JSON.parse(localStorage.getItem(_LS_COLLAPSED) || "{}"); }
    catch (e) { return {}; }
  }());
  function _saveCollapsedSects() {
    try { localStorage.setItem(_LS_COLLAPSED, JSON.stringify(_collapsedSects)); } catch (e) { /* quota or private-mode */ }
  }

  // inspector search — persists the current query across renderInspector() re-renders
  var _inspSearch = "";

  // tag filter — the currently active tag chip in the dashboard inspector panel list (null = show all)
  var _tagFilter = null;

  // K-track: chart types shown in Simple mode — the most universally understood, everyday types.
  // Everything else (specialist / advanced visuals) is tagged .adv-chart and hidden.
  var SIMPLE_CHART_TYPES = {
    bars: 1, donut: 1, line: 1, stacked: 1, areaStacked: 1,
    combo: 1, scatter: 1, gauge: 1, heatmap: 1, table: 1,
    kpi: 1, treemap: 1, richtext: 1
  };

  // little gallery thumbnails per chart type (static representative SVGs)
  var CHART_SVG = {
    bars: '<svg viewBox="0 0 44 30"><rect x="2" y="4" width="30" height="4" rx="1" fill="#005bb5"/><rect x="2" y="11" width="22" height="4" rx="1" fill="#7d3c98"/><rect x="2" y="18" width="34" height="4" rx="1" fill="#2e8bd0"/><rect x="2" y="25" width="15" height="4" rx="1" fill="#00a39a"/></svg>',
    donut: '<svg viewBox="0 0 44 30"><circle cx="22" cy="15" r="10" fill="none" stroke="#e3e8f0" stroke-width="5"/><circle cx="22" cy="15" r="10" fill="none" stroke="#005bb5" stroke-width="5" stroke-dasharray="34 29" transform="rotate(-90 22 15)"/><circle cx="22" cy="15" r="10" fill="none" stroke="#7d3c98" stroke-width="5" stroke-dasharray="16 47" stroke-dashoffset="-34" transform="rotate(-90 22 15)"/></svg>',
    line: '<svg viewBox="0 0 44 30"><path d="M3 24 L13 14 L23 18 L33 6 L41 10 L41 28 L3 28 Z" fill="#005bb5" opacity=".16"/><path d="M3 24 L13 14 L23 18 L33 6 L41 10" fill="none" stroke="#005bb5" stroke-width="2" stroke-linejoin="round"/></svg>',
    stacked: '<svg viewBox="0 0 44 30"><rect x="5" y="14" width="8" height="14" fill="#005bb5"/><rect x="5" y="6" width="8" height="8" fill="#7d3c98"/><rect x="18" y="10" width="8" height="18" fill="#005bb5"/><rect x="18" y="4" width="8" height="6" fill="#7d3c98"/><rect x="31" y="16" width="8" height="12" fill="#005bb5"/><rect x="31" y="9" width="8" height="7" fill="#7d3c98"/></svg>',
    areaStacked: '<svg viewBox="0 0 44 30"><path d="M3 26 L13 21 L23 24 L33 17 L41 20 L41 28 L3 28 Z" fill="#005bb5" opacity=".55"/><path d="M3 20 L13 13 L23 17 L33 8 L41 12 L41 20 L33 17 L23 24 L13 21 L3 26 Z" fill="#7d3c98" opacity=".6"/></svg>',
    combo: '<svg viewBox="0 0 44 30"><rect x="5" y="14" width="6" height="14" fill="#005bb5"/><rect x="15" y="10" width="6" height="18" fill="#005bb5"/><rect x="25" y="17" width="6" height="11" fill="#005bb5"/><rect x="35" y="8" width="6" height="20" fill="#005bb5"/><path d="M8 16 L18 8 L28 13 L38 5" fill="none" stroke="#7d3c98" stroke-width="2"/><circle cx="8" cy="16" r="2" fill="#7d3c98"/><circle cx="38" cy="5" r="2" fill="#7d3c98"/></svg>',
    treemap: '<svg viewBox="0 0 44 30"><rect x="2" y="3" width="24" height="24" rx="1" fill="#005bb5"/><rect x="27" y="3" width="15" height="12" rx="1" fill="#7d3c98"/><rect x="27" y="16" width="15" height="11" rx="1" fill="#2e8bd0"/></svg>',
    scatter: '<svg viewBox="0 0 44 30"><circle cx="10" cy="21" r="3" fill="#005bb5"/><circle cx="20" cy="12" r="4" fill="#7d3c98"/><circle cx="30" cy="18" r="2.5" fill="#2e8bd0"/><circle cx="37" cy="8" r="3.5" fill="#00a39a"/><circle cx="14" cy="9" r="2" fill="#e67e22"/></svg>',
    gauge: '<svg viewBox="0 0 44 30"><path d="M6 26 A16 16 0 0 1 38 26" fill="none" stroke="#e3e8f0" stroke-width="4" stroke-linecap="round"/><path d="M6 26 A16 16 0 0 1 30 11" fill="none" stroke="#005bb5" stroke-width="4" stroke-linecap="round"/></svg>',
    radar: '<svg viewBox="0 0 44 30"><polygon points="22,3 37,12 31,27 13,27 7,12" fill="none" stroke="#e3e8f0" stroke-width="1"/><polygon points="22,9 31,14 28,22 16,22 13,14" fill="none" stroke="#e3e8f0" stroke-width="1"/><polygon points="22,6 34,18 26,25 15,20 14,13" fill="#005bb5" fill-opacity=".2" stroke="#005bb5" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    waterfall: '<svg viewBox="0 0 44 30"><rect x="2" y="14" width="8" height="14" fill="#27ae60"/><line x1="10" y1="14" x2="12" y2="14" stroke="#c8d0dc" stroke-width="0.9"/><rect x="12" y="6" width="8" height="8" fill="#27ae60"/><line x1="20" y1="6" x2="22" y2="6" stroke="#c8d0dc" stroke-width="0.9"/><rect x="22" y="11" width="8" height="5" fill="#c0392b"/><rect x="33" y="11" width="8" height="17" fill="#005bb5"/></svg>',
    sankey: '<svg viewBox="0 0 44 30"><rect x="1" y="3" width="4" height="9" rx="1" fill="#005bb5"/><rect x="1" y="15" width="4" height="13" rx="1" fill="#7d3c98"/><path d="M5 4.5 C18 4.5 18 9 39 9 L39 14 C18 14 18 10 5 12 Z" fill="#005bb5" opacity=".45"/><path d="M5 17 C18 17 18 20 39 20 L39 27 C18 27 18 24 5 28 Z" fill="#7d3c98" opacity=".45"/><rect x="39" y="7" width="4" height="9" rx="1" fill="#2e8bd0"/><rect x="39" y="18" width="4" height="11" rx="1" fill="#9b59b6"/></svg>',
    funnel: '<svg viewBox="0 0 44 30"><rect x="4" y="2" width="36" height="6" rx="2" fill="#005bb5" opacity=".9"/><rect x="8" y="10" width="28" height="5" rx="2" fill="#7d3c98" opacity=".85"/><rect x="13" y="17" width="18" height="5" rx="2" fill="#2e8bd0" opacity=".85"/><rect x="18" y="24" width="8" height="4" rx="2" fill="#00a39a" opacity=".85"/></svg>',
    chord: '<svg viewBox="0 0 44 30"><path d="M22 3 A14 14 0 0 1 36 22" fill="none" stroke="#005bb5" stroke-width="4" stroke-linecap="round"/><path d="M36 22 A14 14 0 0 1 8 22" fill="none" stroke="#7d3c98" stroke-width="4" stroke-linecap="round"/><path d="M8 22 A14 14 0 0 1 22 3" fill="none" stroke="#2e8bd0" stroke-width="4" stroke-linecap="round"/><path d="M22 3 Q22 15 36 22" fill="none" stroke="#005bb5" opacity=".35" stroke-width="2.5"/><path d="M36 22 Q22 15 8 22" fill="none" stroke="#7d3c98" opacity=".35" stroke-width="2.5"/><path d="M8 22 Q22 15 22 3" fill="none" stroke="#2e8bd0" opacity=".35" stroke-width="2.5"/></svg>',
    network: '<svg viewBox="0 0 44 30"><line x1="22" y1="15" x2="9" y2="6" stroke="#005bb5" stroke-width="1.8" opacity=".55"/><line x1="22" y1="15" x2="36" y2="6" stroke="#005bb5" stroke-width="2.5" opacity=".55"/><line x1="22" y1="15" x2="38" y2="22" stroke="#005bb5" stroke-width="1.5" opacity=".55"/><line x1="22" y1="15" x2="7" y2="22" stroke="#005bb5" stroke-width="1.2" opacity=".55"/><line x1="36" y1="6" x2="38" y2="22" stroke="#2e8bd0" stroke-width="1" opacity=".35"/><line x1="9" y1="6" x2="7" y2="22" stroke="#7d3c98" stroke-width="1" opacity=".35"/><circle cx="9" cy="6" r="3" fill="#7d3c98"/><circle cx="36" cy="6" r="3.5" fill="#2e8bd0"/><circle cx="38" cy="22" r="2.5" fill="#00a39a"/><circle cx="7" cy="22" r="2" fill="#e67e22"/><circle cx="22" cy="15" r="5" fill="#005bb5"/></svg>',
    sunburst: '<svg viewBox="0 0 44 30"><path d="M22,3 A12,12 0 0,1 29.05,24.71 L24.94,19.04 A5,5 0 0,0 22,10 Z" fill="#005bb5" opacity=".9"/><path d="M29.05,24.71 A12,12 0 0,1 12.29,22.05 L17.96,17.94 A5,5 0 0,0 24.94,19.04 Z" fill="#7d3c98" opacity=".9"/><path d="M12.29,22.05 A12,12 0 0,1 12.29,7.95 L17.96,12.06 A5,5 0 0,0 17.96,17.94 Z" fill="#2e8bd0" opacity=".9"/><path d="M12.29,7.95 A12,12 0 0,1 22,3 L22,10 A5,5 0 0,0 17.96,12.06 Z" fill="#00a39a" opacity=".9"/></svg>',
    bullet: '<svg viewBox="0 0 44 30"><rect x="8" y="3" width="34" height="9" fill="#9aa7b8" opacity=".15"/><rect x="8" y="4.5" width="19" height="6" rx="1" fill="#005bb5"/><line x1="27" y1="1.5" x2="27" y2="13" stroke="#333" stroke-width="2.5" stroke-linecap="round"/><rect x="8" y="18" width="34" height="9" fill="#9aa7b8" opacity=".15"/><rect x="8" y="19.5" width="12" height="6" rx="1" fill="#7d3c98"/><line x1="21" y1="16.5" x2="21" y2="28" stroke="#333" stroke-width="2.5" stroke-linecap="round"/></svg>',
    calHeatmap: '<svg viewBox="0 0 44 30"><rect x="3" y="5" width="4" height="4" rx="1" fill="#005bb5" opacity=".1"/><rect x="9" y="5" width="4" height="4" rx="1" fill="#005bb5" opacity=".15"/><rect x="15" y="5" width="4" height="4" rx="1" fill="#005bb5" opacity=".3"/><rect x="21" y="5" width="4" height="4" rx="1" fill="#005bb5" opacity=".6"/><rect x="27" y="5" width="4" height="4" rx="1" fill="#005bb5" opacity=".4"/><rect x="33" y="5" width="4" height="4" rx="1" fill="#005bb5" opacity=".2"/><rect x="39" y="5" width="4" height="4" rx="1" fill="#005bb5" opacity=".1"/><rect x="3" y="11" width="4" height="4" rx="1" fill="#005bb5" opacity=".15"/><rect x="9" y="11" width="4" height="4" rx="1" fill="#005bb5" opacity=".3"/><rect x="15" y="11" width="4" height="4" rx="1" fill="#005bb5" opacity=".7"/><rect x="21" y="11" width="4" height="4" rx="1" fill="#005bb5" opacity=".9"/><rect x="27" y="11" width="4" height="4" rx="1" fill="#005bb5" opacity=".6"/><rect x="33" y="11" width="4" height="4" rx="1" fill="#005bb5" opacity=".35"/><rect x="39" y="11" width="4" height="4" rx="1" fill="#005bb5" opacity=".2"/><rect x="3" y="17" width="4" height="4" rx="1" fill="#005bb5" opacity=".1"/><rect x="9" y="17" width="4" height="4" rx="1" fill="#005bb5" opacity=".2"/><rect x="15" y="17" width="4" height="4" rx="1" fill="#005bb5" opacity=".5"/><rect x="21" y="17" width="4" height="4" rx="1" fill="#005bb5" opacity=".7"/><rect x="27" y="17" width="4" height="4" rx="1" fill="#005bb5" opacity=".9"/><rect x="33" y="17" width="4" height="4" rx="1" fill="#005bb5" opacity=".4"/><rect x="39" y="17" width="4" height="4" rx="1" fill="#005bb5" opacity=".15"/><rect x="3" y="23" width="4" height="4" rx="1" fill="#005bb5" opacity=".05"/><rect x="9" y="23" width="4" height="4" rx="1" fill="#005bb5" opacity=".1"/><rect x="15" y="23" width="4" height="4" rx="1" fill="#005bb5" opacity=".25"/><rect x="21" y="23" width="4" height="4" rx="1" fill="#005bb5" opacity=".5"/><rect x="27" y="23" width="4" height="4" rx="1" fill="#005bb5" opacity=".3"/><rect x="33" y="23" width="4" height="4" rx="1" fill="#005bb5" opacity=".15"/><rect x="39" y="23" width="4" height="4" rx="1" fill="#005bb5" opacity=".05"/></svg>',
    heatmap: '<svg viewBox="0 0 44 30"><rect x="4" y="4" width="8" height="7" fill="#005bb5" opacity=".9"/><rect x="14" y="4" width="8" height="7" fill="#005bb5" opacity=".4"/><rect x="24" y="4" width="8" height="7" fill="#005bb5" opacity=".7"/><rect x="34" y="4" width="6" height="7" fill="#005bb5" opacity=".25"/><rect x="4" y="13" width="8" height="7" fill="#005bb5" opacity=".5"/><rect x="14" y="13" width="8" height="7" fill="#005bb5" opacity=".85"/><rect x="24" y="13" width="8" height="7" fill="#005bb5" opacity=".3"/><rect x="34" y="13" width="6" height="7" fill="#005bb5" opacity=".6"/><rect x="4" y="22" width="8" height="6" fill="#005bb5" opacity=".35"/><rect x="14" y="22" width="8" height="6" fill="#005bb5" opacity=".55"/><rect x="24" y="22" width="8" height="6" fill="#005bb5" opacity=".9"/><rect x="34" y="22" width="6" height="6" fill="#005bb5" opacity=".45"/></svg>',
    table: '<svg viewBox="0 0 44 30"><rect x="3" y="4" width="38" height="6" rx="1" fill="#005bb5" opacity=".22"/><rect x="3" y="13" width="38" height="3" rx="1" fill="#9aa7b8" opacity=".5"/><rect x="3" y="18" width="38" height="3" rx="1" fill="#9aa7b8" opacity=".5"/><rect x="3" y="23" width="38" height="3" rx="1" fill="#9aa7b8" opacity=".5"/></svg>',
    kpi: '<svg viewBox="0 0 44 30"><rect x="3" y="5" width="38" height="20" rx="3" fill="#005bb5" opacity=".09"/><rect x="3" y="5" width="3" height="20" rx="1.5" fill="#7d3c98"/><text x="11" y="17" font-size="10" font-weight="800" fill="#005bb5" font-family="sans-serif">42K</text><rect x="11" y="20" width="18" height="2.5" rx="1" fill="#9aa7b8"/></svg>',
    richtext: '<svg viewBox="0 0 44 30"><rect x="2" y="5" width="26" height="2.5" rx="1.2" fill="#005bb5" opacity=".8"/><rect x="2" y="10" width="40" height="2" rx="1" fill="#9aa7b8" opacity=".7"/><rect x="2" y="14.5" width="36" height="2" rx="1" fill="#9aa7b8" opacity=".7"/><rect x="2" y="19" width="40" height="2" rx="1" fill="#9aa7b8" opacity=".7"/><rect x="2" y="23.5" width="28" height="2" rx="1" fill="#9aa7b8" opacity=".7"/></svg>',
    boxplot: '<svg viewBox="0 0 44 30"><line x1="6" y1="8" x2="6" y2="14" stroke="#9aa7b8" stroke-width="1.5"/><rect x="6" y="6" width="18" height="6" fill="#005bb5" fill-opacity=".18" stroke="#005bb5" stroke-width="1.5" rx="1"/><line x1="15" y1="6" x2="15" y2="12" stroke="#005bb5" stroke-width="2"/><line x1="24" y1="8" x2="24" y2="14" stroke="#9aa7b8" stroke-width="1.5"/><line x1="6" y1="9" x2="24" y2="9" stroke="#9aa7b8" stroke-width="1" stroke-dasharray="2 1.5"/><line x1="8" y1="17" x2="8" y2="23" stroke="#9aa7b8" stroke-width="1.5"/><rect x="8" y="15" width="22" height="6" fill="#7d3c98" fill-opacity=".18" stroke="#7d3c98" stroke-width="1.5" rx="1"/><line x1="19" y1="15" x2="19" y2="21" stroke="#7d3c98" stroke-width="2"/><line x1="30" y1="17" x2="30" y2="23" stroke="#9aa7b8" stroke-width="1.5"/><line x1="8" y1="18" x2="30" y2="18" stroke="#9aa7b8" stroke-width="1" stroke-dasharray="2 1.5"/></svg>',
    lollipop: '<svg viewBox="0 0 44 30"><line x1="8" y1="6" x2="30" y2="6" stroke="#005bb5" stroke-width="1.5" opacity=".4"/><circle cx="30" cy="6" r="3.5" fill="#005bb5"/><line x1="8" y1="13" x2="22" y2="13" stroke="#7d3c98" stroke-width="1.5" opacity=".4"/><circle cx="22" cy="13" r="3.5" fill="#7d3c98"/><line x1="8" y1="20" x2="36" y2="20" stroke="#2e8bd0" stroke-width="1.5" opacity=".4"/><circle cx="36" cy="20" r="3.5" fill="#2e8bd0"/><line x1="8" y1="27" x2="16" y2="27" stroke="#00a39a" stroke-width="1.5" opacity=".4"/><circle cx="16" cy="27" r="3.5" fill="#00a39a"/></svg>',
    slope: '<svg viewBox="0 0 44 30"><line x1="10" y1="3" x2="10" y2="27" stroke="#d0d4da" stroke-width="1.5"/><line x1="34" y1="3" x2="34" y2="27" stroke="#d0d4da" stroke-width="1.5"/><line x1="10" y1="22" x2="34" y2="8" stroke="#27ae60" stroke-width="2" opacity=".85"/><circle cx="10" cy="22" r="3" fill="#27ae60"/><circle cx="34" cy="8" r="3" fill="#27ae60"/><line x1="10" y1="12" x2="34" y2="19" stroke="#c0392b" stroke-width="2" opacity=".85"/><circle cx="10" cy="12" r="3" fill="#c0392b"/><circle cx="34" cy="19" r="3" fill="#c0392b"/><line x1="10" y1="18" x2="34" y2="14" stroke="#2e8bd0" stroke-width="2" opacity=".85"/><circle cx="10" cy="18" r="3" fill="#2e8bd0"/><circle cx="34" cy="14" r="3" fill="#2e8bd0"/></svg>',
    dotplot: '<svg viewBox="0 0 44 30"><line x1="8" y1="6" x2="40" y2="6" stroke="#e3e8f0" stroke-width="1"/><circle cx="28" cy="6" r="3.5" fill="#005bb5"/><line x1="8" y1="13" x2="40" y2="13" stroke="#e3e8f0" stroke-width="1"/><circle cx="36" cy="13" r="3.5" fill="#005bb5"/><line x1="8" y1="20" x2="40" y2="20" stroke="#e3e8f0" stroke-width="1"/><circle cx="20" cy="20" r="3.5" fill="#005bb5"/><line x1="8" y1="27" x2="40" y2="27" stroke="#e3e8f0" stroke-width="1"/><circle cx="14" cy="27" r="3.5" fill="#005bb5"/></svg>',
    beeswarm: '<svg viewBox="0 0 44 30"><line x1="5" y1="14.5" x2="42" y2="14.5" stroke="#d0d4da" stroke-width="0.8"/><circle cx="10" cy="8" r="2.8" fill="#005bb5" opacity="0.85"/><circle cx="17" cy="6" r="2.8" fill="#005bb5" opacity="0.85"/><circle cx="17" cy="10.5" r="2.8" fill="#005bb5" opacity="0.85"/><circle cx="23" cy="8" r="2.8" fill="#005bb5" opacity="0.85"/><circle cx="29" cy="7" r="2.8" fill="#005bb5" opacity="0.85"/><circle cx="29" cy="11" r="2.8" fill="#005bb5" opacity="0.85"/><circle cx="36" cy="8" r="2.8" fill="#005bb5" opacity="0.85"/><circle cx="40" cy="9" r="2.8" fill="#005bb5" opacity="0.85"/><circle cx="12" cy="21" r="2.8" fill="#7d3c98" opacity="0.85"/><circle cx="18" cy="19" r="2.8" fill="#7d3c98" opacity="0.85"/><circle cx="18" cy="23.5" r="2.8" fill="#7d3c98" opacity="0.85"/><circle cx="25" cy="21" r="2.8" fill="#7d3c98" opacity="0.85"/><circle cx="31" cy="20" r="2.8" fill="#7d3c98" opacity="0.85"/><circle cx="37" cy="22" r="2.8" fill="#7d3c98" opacity="0.85"/></svg>',
    histogram: '<svg viewBox="0 0 44 30"><line x1="5" y1="28" x2="42" y2="28" stroke="#c8cdd6" stroke-width="0.8"/><rect x="5" y="20" width="5" height="8" fill="#005bb5" opacity="0.8"/><rect x="10" y="14" width="5" height="14" fill="#005bb5" opacity="0.8"/><rect x="15" y="7" width="5" height="21" fill="#005bb5" opacity="0.8"/><rect x="20" y="4" width="5" height="24" fill="#005bb5" opacity="0.8"/><rect x="25" y="10" width="5" height="18" fill="#005bb5" opacity="0.8"/><rect x="30" y="16" width="5" height="12" fill="#005bb5" opacity="0.8"/><rect x="35" y="22" width="5" height="6" fill="#005bb5" opacity="0.8"/></svg>',
    // Polar area: 6 equal-angle wedges with varying radii (sqrt-proportional to value);
    // one subtle outer guide ring; small white centre circle.
    polarArea: '<svg viewBox="0 0 44 30"><circle cx="22" cy="15" r="12" fill="none" stroke="#e0e4ef" stroke-width=".7"/><path d="M22,15 L22,3 A12,12 0 0,1 32.4,9 Z" fill="#005bb5" opacity=".85"/><path d="M22,15 L28.1,11.5 A7.1,7.1 0 0,1 28.1,18.6 Z" fill="#7d3c98" opacity=".85"/><path d="M22,15 L30.7,20 A10,10 0 0,1 22,25 Z" fill="#2e8bd0" opacity=".85"/><path d="M22,15 L22,20.1 A5.1,5.1 0 0,1 17.6,17.6 Z" fill="#00a39a" opacity=".85"/><path d="M22,15 L14.2,19.5 A9,9 0 0,1 14.2,10.5 Z" fill="#e67e22" opacity=".85"/><path d="M22,15 L12.3,9.4 A11.2,11.2 0 0,1 22,3.8 Z" fill="#27ae60" opacity=".85"/><circle cx="22" cy="15" r="3.2" fill="white" opacity=".92"/></svg>',
    // Step chart: staircase profile showing right-angle (horizontal-then-vertical) transitions
    step: '<svg viewBox="0 0 44 30"><path d="M3,25 L3,20 L11,20 L11,14 L19,14 L19,9 L27,9 L27,16 L35,16 L35,10 L43,10 L43,25 Z" fill="#005bb5" opacity=".12"/><polyline points="3,20 11,20 11,14 19,14 19,9 27,9 27,16 35,16 35,10 43,10" fill="none" stroke="#005bb5" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    // Violin plot: three symmetric KDE silhouettes — widest in the middle, narrow at tails;
    // coloured IQR box + white median line inside each violin.
    violin: '<svg viewBox="0 0 44 30"><path d="M10,2 Q15,7 14,15 Q15,23 10,28 Q5,23 6,15 Q5,7 10,2 Z" fill="#005bb5" opacity=".22" stroke="#005bb5" stroke-width="1.1"/><rect x="8.5" y="11" width="3" height="8" fill="#005bb5" opacity=".65" rx="1"/><line x1="6.5" y1="15" x2="13.5" y2="15" stroke="#fff" stroke-width="1.8"/><path d="M22,2 Q28.5,7 27,15 Q28.5,23 22,28 Q15.5,23 17,15 Q15.5,7 22,2 Z" fill="#7d3c98" opacity=".22" stroke="#7d3c98" stroke-width="1.1"/><rect x="20.5" y="11" width="3" height="9" fill="#7d3c98" opacity=".65" rx="1"/><line x1="18.5" y1="15.5" x2="25.5" y2="15.5" stroke="#fff" stroke-width="1.8"/><path d="M34,2 Q38,7 37.5,15 Q38,23 34,28 Q30,23 30.5,15 Q30,7 34,2 Z" fill="#2e8bd0" opacity=".22" stroke="#2e8bd0" stroke-width="1.1"/><rect x="32.5" y="12" width="3" height="7" fill="#2e8bd0" opacity=".65" rx="1"/><line x1="30.5" y1="15.5" x2="37.5" y2="15.5" stroke="#fff" stroke-width="1.8"/></svg>',
    // Bump chart: 3 colored lines connecting rank positions across 4 periods;
    // dots mark each position; lines crossing shows competitive overtaking.
    bump: '<svg viewBox="0 0 44 30"><line x1="7" y1="4" x2="7" y2="28" stroke="#e0e4ef" stroke-width=".8"/><line x1="19" y1="4" x2="19" y2="28" stroke="#e0e4ef" stroke-width=".8"/><line x1="31" y1="4" x2="31" y2="28" stroke="#e0e4ef" stroke-width=".8"/><line x1="41" y1="4" x2="41" y2="28" stroke="#e0e4ef" stroke-width=".8"/><polyline points="7,7 19,14 31,21 41,14" fill="none" stroke="#005bb5" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="7,14 19,7 31,7 41,21" fill="none" stroke="#7d3c98" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="7,21 19,21 31,14 41,7" fill="none" stroke="#2e8bd0" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7" cy="7" r="2.8" fill="#005bb5"/><circle cx="19" cy="14" r="2.8" fill="#005bb5"/><circle cx="31" cy="21" r="2.8" fill="#005bb5"/><circle cx="41" cy="14" r="2.8" fill="#005bb5"/><circle cx="7" cy="14" r="2.8" fill="#7d3c98"/><circle cx="19" cy="7" r="2.8" fill="#7d3c98"/><circle cx="31" cy="7" r="2.8" fill="#7d3c98"/><circle cx="41" cy="21" r="2.8" fill="#7d3c98"/><circle cx="7" cy="21" r="2.8" fill="#2e8bd0"/><circle cx="19" cy="21" r="2.8" fill="#2e8bd0"/><circle cx="31" cy="14" r="2.8" fill="#2e8bd0"/><circle cx="41" cy="7" r="2.8" fill="#2e8bd0"/></svg>',
    // Marimekko: 3 variable-width stacked columns; leftmost/widest = largest category.
    // Width encodes category total; segment height encodes within-category composition.
    marimekko: '<svg viewBox="0 0 44 30"><rect x="1" y="0" width="21" height="17" rx="1" fill="#005bb5" opacity=".88"/><rect x="1" y="17" width="21" height="9" rx="1" fill="#7d3c98" opacity=".85"/><rect x="1" y="26" width="21" height="4" rx="1" fill="#2e8bd0" opacity=".82"/><rect x="24" y="0" width="13" height="12" rx="1" fill="#005bb5" opacity=".88"/><rect x="24" y="12" width="13" height="12" rx="1" fill="#7d3c98" opacity=".85"/><rect x="24" y="24" width="13" height="6" rx="1" fill="#2e8bd0" opacity=".82"/><rect x="39" y="0" width="5" height="21" rx="1" fill="#005bb5" opacity=".88"/><rect x="39" y="21" width="5" height="6" rx="1" fill="#7d3c98" opacity=".85"/><rect x="39" y="27" width="5" height="3" rx="1" fill="#2e8bd0" opacity=".82"/></svg>',
    // Dumbbell: 3 horizontal rows; gray start dot ── colored line ── blue end dot.
    // Green connectors = improvement, red = decline — gap is immediately visible.
    dumbbell: '<svg viewBox="0 0 44 30"><line x1="12" y1="3" x2="12" y2="27" stroke="#d0d4da" stroke-width="0.6"/><line x1="17" y1="7" x2="33" y2="7" stroke="#27ae60" stroke-width="2" opacity=".75"/><circle cx="17" cy="7" r="2.6" fill="#b0bec5"/><circle cx="33" cy="7" r="2.6" fill="#005bb5"/><line x1="30" y1="15" x2="21" y2="15" stroke="#e0395e" stroke-width="2" opacity=".75"/><circle cx="30" cy="15" r="2.6" fill="#b0bec5"/><circle cx="21" cy="15" r="2.6" fill="#005bb5"/><line x1="15" y1="23" x2="40" y2="23" stroke="#27ae60" stroke-width="2" opacity=".75"/><circle cx="15" cy="23" r="2.6" fill="#b0bec5"/><circle cx="40" cy="23" r="2.6" fill="#005bb5"/></svg>',
    // Packed bubbles: 5 circles of varying sizes clustered together.
    packedBubble: '<svg viewBox="0 0 44 30"><circle cx="17" cy="15" r="10" fill="#005bb5" opacity=".82"/><circle cx="33" cy="11" r="7" fill="#7d3c98" opacity=".82"/><circle cx="35" cy="23" r="5.5" fill="#2e8bd0" opacity=".82"/><circle cx="24" cy="24" r="4.5" fill="#00a39a" opacity=".82"/><circle cx="7" cy="22" r="5" fill="#e67e22" opacity=".82"/></svg>',
    // Word cloud: words of varying font sizes arranged in a cloud layout.
    // Largest word centred; smaller words spiral outward — size = value.
    wordCloud: '<svg viewBox="0 0 44 30" font-family="sans-serif"><text x="22" y="17" text-anchor="middle" font-size="11" font-weight="700" fill="#005bb5">Revenue</text><text x="9" y="10" text-anchor="middle" font-size="7" font-weight="600" fill="#7d3c98">Growth</text><text x="37" y="10" text-anchor="middle" font-size="6" fill="#2e8bd0">Costs</text><text x="36" y="22" text-anchor="middle" font-size="6" fill="#00a39a">Sales</text><text x="10" y="24" text-anchor="middle" font-size="5" fill="#e67e22">Q4</text><text x="22" y="28" text-anchor="middle" font-size="5" fill="#27ae60">Region</text></svg>',
    // Gantt / Timeline: 4 staggered horizontal floating bars showing start-to-end spans.
    // Thin vertical dashed line at the left edge represents the shared axis origin.
    gantt: '<svg viewBox="0 0 44 30"><line x1="5" y1="0" x2="5" y2="30" stroke="#d0d4da" stroke-width="0.8" stroke-dasharray="2 2"/><rect x="5" y="3" width="20" height="5" rx="1.5" fill="#005bb5" opacity=".88"/><rect x="12" y="11" width="28" height="5" rx="1.5" fill="#7d3c98" opacity=".85"/><rect x="7" y="19" width="23" height="5" rx="1.5" fill="#2e8bd0" opacity=".82"/><rect x="20" y="27" width="20" height="2.8" rx="1.2" fill="#00a39a" opacity=".80"/></svg>',
    // Diverging bars: 2 positive (right, blue) + 2 negative (left, red) from centre zero line.
    divergingBar: '<svg viewBox="0 0 44 30"><line x1="22" y1="0" x2="22" y2="30" stroke="#c8d0dc" stroke-width="0.9" stroke-dasharray="2 2"/><rect x="22" y="3" width="16" height="4" rx="1.5" fill="#005bb5" opacity=".85"/><rect x="22" y="10" width="10" height="4" rx="1.5" fill="#2e8bd0" opacity=".85"/><rect x="9" y="17" width="13" height="4" rx="1.5" fill="#c0392b" opacity=".85"/><rect x="4" y="24" width="18" height="4" rx="1.5" fill="#e74c3c" opacity=".85"/></svg>',
    // Stream graph: three flowing organic ribbon shapes centered on a midline.
    streamgraph: '<svg viewBox="0 0 44 30"><line x1="2" y1="15" x2="42" y2="15" stroke="#e0e4ef" stroke-width="0.6" stroke-dasharray="2 2"/><path d="M2 11 Q11 8 22 12 Q33 16 42 10 Q42 18 33 20 Q22 22 11 19 Q2 18 2 11Z" fill="#005bb5" opacity=".72"/><path d="M2 17 Q11 19 22 22 Q33 25 42 20 Q42 24 33 26 Q22 28 11 24 Q2 22 2 17Z" fill="#7d3c98" opacity=".68"/><path d="M2 7 Q11 4 22 8 Q33 12 42 7 Q42 10 33 14 Q22 16 11 13 Q2 11 2 7Z" fill="#2e8bd0" opacity=".65"/></svg>',
    // Parallel coordinates: 4 vertical axes with 3 polylines crossing them.
    parallelCoords: '<svg viewBox="0 0 44 30"><line x1="8" y1="4" x2="8" y2="26" stroke="#dde3ef" stroke-width="1"/><line x1="18" y1="4" x2="18" y2="26" stroke="#dde3ef" stroke-width="1"/><line x1="28" y1="4" x2="28" y2="26" stroke="#dde3ef" stroke-width="1"/><line x1="38" y1="4" x2="38" y2="26" stroke="#dde3ef" stroke-width="1"/><polyline points="8,8 18,7 28,16 38,10" fill="none" stroke="#005bb5" stroke-width="1.5" stroke-linejoin="round" opacity=".78"/><polyline points="8,16 18,21 28,10 38,20" fill="none" stroke="#7d3c98" stroke-width="1.5" stroke-linejoin="round" opacity=".78"/><polyline points="8,22 18,13 28,22 38,14" fill="none" stroke="#2e8bd0" stroke-width="1.5" stroke-linejoin="round" opacity=".78"/></svg>',
    // Candlestick / OHLC: 4 candles (2 green bullish, 2 red bearish) with wicks
    candlestick: '<svg viewBox="0 0 44 30"><line x1="5" y1="27" x2="42" y2="27" stroke="#d0d4da" stroke-width="0.6"/><line x1="9" y1="4" x2="9" y2="27" stroke="#27ae60" stroke-width="1.2" stroke-linecap="round"/><rect x="6" y="9" width="6" height="8" rx="1.2" fill="#27ae60" opacity=".84"/><line x1="20" y1="7" x2="20" y2="27" stroke="#e74c3c" stroke-width="1.2" stroke-linecap="round"/><rect x="17" y="14" width="6" height="10" rx="1.2" fill="#e74c3c" opacity=".84"/><line x1="31" y1="3" x2="31" y2="25" stroke="#27ae60" stroke-width="1.2" stroke-linecap="round"/><rect x="28" y="7" width="6" height="11" rx="1.2" fill="#27ae60" opacity=".84"/><line x1="40" y1="8" x2="40" y2="27" stroke="#e74c3c" stroke-width="1.2" stroke-linecap="round"/><rect x="37" y="16" width="6" height="9" rx="1.2" fill="#e74c3c" opacity=".84"/></svg>',
    waffle: (function () {
      // Gallery thumbnail: a 8×4 mini waffle grid with 3 brand colors (56/28/16 split)
      var cols = 8, rows = 4, sz = 4.5, pad = 0.8;
      var colors = ["#005bb5","#7d3c98","#2e8bd0"];
      var counts = [Math.round(cols*rows*0.56), Math.round(cols*rows*0.28)];
      counts.push(cols*rows - counts[0] - counts[1]);
      var flat = []; counts.forEach(function(n,ci){ for(var i=0;i<n;i++) flat.push(ci); });
      var cells = flat.slice(0, cols*rows).map(function(ci, idx) {
        var r=Math.floor(idx/cols), c=idx%cols, x=c*(sz+pad)+1, y=r*(sz+pad)+1;
        return '<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+sz+'" height="'+sz+'" rx="0.8" fill="'+colors[ci]+'" opacity=".88"/>';
      });
      return '<svg viewBox="0 0 44 30">' + cells.join("") + '</svg>';
    }()),
    // Timeline / milestones: 5 diamond markers on a horizontal baseline,
    // alternating above/below with short colored stalks and stub label lines.
    timeline: (function () {
      var colors = ["#005bb5","#7d3c98","#2e8bd0","#00a39a","#e67e22"];
      var pts = [{x:6},{x:16},{x:27},{x:37},{x:48}];
      var mid = 15;
      var out = '<line x1="3" y1="'+mid+'" x2="51" y2="'+mid+'" stroke="#d0d4da" stroke-width="1.5"/>';
      pts.forEach(function(p,i){
        var c=colors[i], above=(i%2===0), dir=above?-1:1, ds=3, sh=7;
        out+='<line x1="'+p.x+'" y1="'+(mid+dir*3.2)+'" x2="'+p.x+'" y2="'+(mid+dir*(sh+1))+'" stroke="'+c+'" stroke-width="1" opacity=".65"/>';
        out+='<polygon points="'+p.x+','+(mid-ds)+' '+(p.x+ds)+','+mid+' '+p.x+','+(mid+ds)+' '+(p.x-ds)+','+mid+'" fill="'+c+'" stroke="white" stroke-width="0.7"/>';
        var ly=mid+dir*(sh+4.5);
        out+='<line x1="'+(p.x-6)+'" y1="'+ly+'" x2="'+(p.x+6)+'" y2="'+ly+'" stroke="'+c+'" stroke-width="1.3" stroke-linecap="round" opacity=".8"/>';
      });
      return '<svg viewBox="0 0 54 30">' + out + '</svg>';
    }()),
    // Radial bar: 5 concentric arc tracks at different lengths, palette colors, viewBox 44x30.
    radialBar: (function () {
      var cx = 22, cy = 15;
      var radii  = [11, 8.8, 6.6, 4.4, 2.2];
      var sweeps = [0.85, 0.65, 0.75, 0.45, 0.55];
      var colors = ["#005bb5","#7d3c98","#2e8bd0","#00a39a","#e67e22"];
      var SW = 1.5 * Math.PI, A0 = -Math.PI / 2, tH = 1.7;
      function ap(r, frac) {
        var a1 = A0 + SW * frac;
        var x0 = cx + r * Math.cos(A0), y0 = cy + r * Math.sin(A0);
        var x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        var lg = SW * frac > Math.PI ? 1 : 0;
        return 'M' + x0.toFixed(1) + ',' + y0.toFixed(1) +
               ' A' + r + ',' + r + ' 0 ' + lg + ' 1 ' + x1.toFixed(1) + ',' + y1.toFixed(1);
      }
      var out = "";
      radii.forEach(function (r, i) {
        out += '<path d="' + ap(r, 1) + '" fill="none" stroke="' + colors[i] + '" stroke-opacity=".12" stroke-width="' + tH + '" stroke-linecap="round"/>';
        out += '<path d="' + ap(r, sweeps[i]) + '" fill="none" stroke="' + colors[i] + '" stroke-width="' + tH + '" stroke-linecap="round"/>';
      });
      return '<svg viewBox="0 0 44 30">' + out + '</svg>';
    }()),
    // Population pyramid: 4 rows of mirrored bars with dashed centre dividers.
    pyramidBar: (function () {
      var cx = 22, lc = "#7d3c98", rc = "#005bb5";
      var bars = [{lw:10,rw:12,y:2},{lw:16,rw:14,y:9},{lw:13,rw:17,y:16},{lw:8,rw:9,y:23}];
      var L = 8;  // label column width
      var out = '<line x1="' + (cx-L/2) + '" y1="0" x2="' + (cx-L/2) + '" y2="30" stroke="#c8d0da" stroke-width="0.5"/>' +
                '<line x1="' + (cx+L/2) + '" y1="0" x2="' + (cx+L/2) + '" y2="30" stroke="#c8d0da" stroke-width="0.5"/>';
      bars.forEach(function (b) {
        out += '<rect x="' + (cx-L/2-b.lw) + '" y="' + b.y + '" width="' + b.lw + '" height="5" rx="1" fill="' + lc + '" opacity=".85"/>';
        out += '<rect x="' + (cx+L/2) + '" y="' + b.y + '" width="' + b.rw + '" height="5" rx="1" fill="' + rc + '" opacity=".85"/>';
      });
      return '<svg viewBox="0 0 44 30">' + out + '</svg>';
    }()),
    // Icicle / partition: 3 parent bars across top 36%, children fill bottom 64% of each column.
    icicle: (function () {
      var W = 44, H = 30, PAD = 1;
      var topH = H * 0.36 - 0.5, botY = H * 0.36 + 1, botH = H * 0.64 - 2;
      var groups = [
        { frac: 0.42, color: "#005bb5", items: [0.55, 0.28, 0.17] },
        { frac: 0.35, color: "#7d3c98", items: [0.60, 0.40] },
        { frac: 0.23, color: "#0e9aa7", items: [0.65, 0.35] }
      ];
      var out = "", gx = 0;
      groups.forEach(function (g) {
        var gw = W * g.frac;
        out += '<rect x="' + gx.toFixed(1) + '" y="0" width="' + Math.max(1, gw - PAD).toFixed(1) + '" height="' + topH.toFixed(1) + '" rx="1" fill="' + g.color + '"/>';
        var cx = gx;
        g.items.forEach(function (frac, ii) {
          var iw = gw * frac;
          var op = (0.62 + 0.3 * (1 - ii / Math.max(1, g.items.length - 1))).toFixed(2);
          out += '<rect x="' + cx.toFixed(1) + '" y="' + botY.toFixed(1) + '" width="' + Math.max(1, iw - PAD).toFixed(1) + '" height="' + (botH - 1).toFixed(1) + '" rx="1" fill="' + g.color + '" opacity="' + op + '"/>';
          cx += iw;
        });
        gx += gw;
      });
      return '<svg viewBox="0 0 44 30">' + out + '</svg>';
    }()),
    // Pareto chart: 5 descending bars + rising cumulative % line (orange dots), 80% dashed ref.
    pareto: (function () {
      var bars = [0.68, 0.48, 0.30, 0.16, 0.09];
      var cumPct = [0.27, 0.46, 0.58, 0.65, 1.0];
      var barColors = ["#005bb5","#2e8bd0","#5ea8e6","#90c4f4","#b8d9fb"];
      var W = 44, H = 30, mL = 5, mR = 9, mT = 2, mB = 8;
      var iw = W - mL - mR, ih = H - mT - mB;
      var slotW = iw / bars.length, barW = slotW * 0.68;
      var out = '';
      bars.forEach(function (h, i) {
        var bh = ih * h, by = mT + ih - bh;
        var bx = mL + i * slotW + (slotW - barW) / 2;
        out += '<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="' + barColors[i] + '" opacity=".9" rx="0.8"/>';
      });
      var y80 = (mT + ih * 0.20).toFixed(1);
      out += '<line x1="' + mL + '" y1="' + y80 + '" x2="' + (W - mR) + '" y2="' + y80 + '" stroke="#e74c3c" stroke-width="0.7" stroke-dasharray="1.8 1.2" opacity=".7"/>';
      var pts = cumPct.map(function (cp, i) {
        return (mL + i * slotW + slotW / 2).toFixed(1) + ',' + (mT + ih * (1 - cp)).toFixed(1);
      });
      out += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#e67e22" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>';
      cumPct.forEach(function (cp, i) {
        out += '<circle cx="' + (mL + i * slotW + slotW / 2).toFixed(1) + '" cy="' + (mT + ih * (1 - cp)).toFixed(1) + '" r="1.6" fill="#e67e22"/>';
      });
      return '<svg viewBox="0 0 44 30">' + out + '</svg>';
    }()),
    // Grouped bars: 3 category groups × 3 series bars (blue / purple / cyan), varying heights.
    groupedBars: (function () {
      var groups = [[0.72, 0.46, 0.56], [0.56, 0.86, 0.66], [0.40, 0.62, 0.32]];
      var colors = ["#005bb5", "#7d3c98", "#2e8bd0"];
      var W = 44, H = 30, mL = 2, mR = 2, mT = 3, mB = 7;
      var iw = W - mL - mR, ih = H - mT - mB;
      var nCats = 3, nSer = 3;
      var groupW = iw / nCats, barW = (groupW * 0.78) / nSer, barGap = 0.7;
      var out = '';
      groups.forEach(function (vals, li) {
        var blockW = barW * nSer + barGap * (nSer - 1);
        var gx = mL + li * groupW + (groupW - blockW) / 2;
        vals.forEach(function (rel, si) {
          var bh = ih * rel, by = mT + ih - bh;
          var bx = (gx + si * (barW + barGap)).toFixed(1);
          out += '<rect x="' + bx + '" y="' + by.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="' + colors[si] + '" rx="1" opacity=".88"/>';
        });
      });
      return '<svg viewBox="0 0 44 30">' + out + '</svg>';
    }()),
    // Ridgeline / joy plot: 4 horizontal density ridge curves in different colors,
    // stacked vertically with slight overlap — the signature "joy plot" appearance.
    ridgeline: '<svg viewBox="0 0 44 30"><path d="M2,28 C8,28 12,22 18,20 C24,18 28,19 34,23 C38,26 41,28 44,28 Z" fill="#2e8bd0" opacity=".20"/><path d="M2,28 C8,28 12,22 18,20 C24,18 28,19 34,23 C38,26 41,28 44,28 Z" fill="none" stroke="#2e8bd0" stroke-width="1.2" opacity=".82"/><path d="M2,22 C8,22 13,14 19,11 C25,8 29,10 35,16 C39,20 41,22 44,22 Z" fill="#00a39a" opacity=".20"/><path d="M2,22 C8,22 13,14 19,11 C25,8 29,10 35,16 C39,20 41,22 44,22 Z" fill="none" stroke="#00a39a" stroke-width="1.2" opacity=".82"/><path d="M2,16 C6,16 11,8 17,6 C23,4 27,5 33,10 C37,14 40,15 44,16 Z" fill="#7d3c98" opacity=".20"/><path d="M2,16 C6,16 11,8 17,6 C23,4 27,5 33,10 C37,14 40,15 44,16 Z" fill="none" stroke="#7d3c98" stroke-width="1.2" opacity=".82"/><path d="M2,10 C7,10 12,4 18,2 C24,0 28,2 34,7 C38,10 41,10 44,10 Z" fill="#005bb5" opacity=".20"/><path d="M2,10 C7,10 12,4 18,2 C24,0 28,2 34,7 C38,10 41,10 44,10 Z" fill="none" stroke="#005bb5" stroke-width="1.2" opacity=".82"/></svg>',
    // Area range / confidence band: upper (solid) + lower (dashed) lines + shaded band + centre line.
    areaRange: '<svg viewBox="0 0 44 30"><polygon points="2,6 12,4 22,7 32,8 42,6 42,16 32,18 22,17 12,15 2,17" fill="#005bb5" opacity=".18"/><polyline points="2,6 12,4 22,7 32,8 42,6" fill="none" stroke="#005bb5" stroke-width="1.5" stroke-linejoin="round"/><polyline points="2,17 12,15 22,17 32,18 42,16" fill="none" stroke="#005bb5" stroke-width="1.5" stroke-dasharray="2.5,2" stroke-linejoin="round"/><polyline points="2,11 12,9 22,12 32,13 42,11" fill="none" stroke="#005bb5" stroke-width="2" stroke-linejoin="round" opacity=".9"/></svg>',
    // Quadrant chart: 4 lightly tinted zones + dashed dividers + coloured dots per quadrant.
    quadrant: '<svg viewBox="0 0 44 30"><rect x="22" y="2" width="20" height="12" fill="#005bb5" opacity=".09"/><rect x="2" y="2" width="20" height="12" fill="#9b59b6" opacity=".09"/><rect x="2" y="14" width="20" height="14" fill="#c0392b" opacity=".09"/><rect x="22" y="14" width="20" height="14" fill="#27ae60" opacity=".09"/><line x1="22" y1="2" x2="22" y2="28" stroke="#888" stroke-width="0.8" stroke-dasharray="2,1.5" opacity=".5"/><line x1="2" y1="14" x2="42" y2="14" stroke="#888" stroke-width="0.8" stroke-dasharray="2,1.5" opacity=".5"/><circle cx="31" cy="6" r="2.4" fill="#005bb5" opacity=".85"/><circle cx="38" cy="9" r="2.4" fill="#005bb5" opacity=".85"/><circle cx="26" cy="8" r="2.4" fill="#005bb5" opacity=".85"/><circle cx="9" cy="6" r="2.4" fill="#9b59b6" opacity=".85"/><circle cx="15" cy="10" r="2.4" fill="#9b59b6" opacity=".85"/><circle cx="7" cy="21" r="2.4" fill="#c0392b" opacity=".85"/><circle cx="28" cy="20" r="2.4" fill="#27ae60" opacity=".85"/><circle cx="37" cy="24" r="2.4" fill="#27ae60" opacity=".85"/></svg>',
    // 100% stacked bars: 4 categories × 3 series, every bar reaches full height.
    barNorm: (function () {
      var bars = [[0.50, 0.30, 0.20], [0.35, 0.45, 0.20], [0.55, 0.20, 0.25], [0.25, 0.50, 0.25]];
      var colors = ["#005bb5", "#7d3c98", "#2e8bd0"];
      var W = 44, H = 30, mL = 2, mR = 2, mT = 3, mB = 7;
      var iw = W - mL - mR, ih = H - mT - mB;
      var nCats = 4, slotW = iw / nCats, barW = slotW * 0.78, barPad = (slotW - barW) / 2;
      var out = '';
      bars.forEach(function (segs, li) {
        var bx = (mL + li * slotW + barPad).toFixed(1);
        var cumH = 0;
        segs.forEach(function (pct, si) {
          var sh = ih * pct;
          var sy = mT + ih - cumH - sh;
          cumH += sh;
          out += '<rect x="' + bx + '" y="' + sy.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + sh.toFixed(1) + '" fill="' + colors[si] + '" rx="1" opacity=".88"/>';
        });
      });
      return '<svg viewBox="0 0 44 30">' + out + '</svg>';
    }())
  };
  window.__studioLoad = function (spec) { S.spec = normalize(spec); S.selection = null; _tagFilter = null; syncHeader(); renderInspector(); refreshPreview(); buildLibrary(); };

  /* ---------- boot ---------- */
  function boot() {
    Promise.all([
      fetchJSON("data/cda-catalog.json"),
      fetchText("vendor/pdc-ui.css"), fetchText("vendor/pdc-ui.js"), fetchText("app/studio-render.js"),
      fetchText("app/studio-charts.js"),
      // Z14 architecture-gap fix: bundled into an export only when that dashboard actually has a
      // duckdb/httpvfs data access (see exporters.js's buildHtml) — fetched once here either way.
      fetchText("app/duckdb.js"), fetchText("app/sqlitehttp.js"),
      fetchJSON("data/examples/index.json").catch(function () { return []; })
    ]).then(function (r) {
      S.catalog = r[0];
      S.assets = { css: r[1], js: r[2], render: r[3], charts: r[4], duckdb: r[5], httpvfs: r[6] };
      S.examples = r[7] || [];
      wireTopbar();
      try { renderFooter(); } catch (e) { /* footer is non-critical chrome */ }
      setupPanes();
      setupMobileTabs();
      try { setTheme(localStorage.getItem("studio-theme") || "light"); } catch (e) { setTheme("light"); }
      try { setAppTheme(localStorage.getItem("studio-app-theme") || "classic"); } catch (e) {}
      try { if (localStorage.getItem("studio-simple-mode") === "1") { S.simpleMode = true; document.body.classList.add("simple-mode"); } } catch (e) {}
      applyBranding();
      loadConnections();
      renderHome();
      renderRepository();
      renderSettings();
      if (window.StudioWelcome) { var ab = $("#btnAbout"); if (ab) ab.onclick = function () { StudioWelcome.open(); }; setTimeout(function () { StudioWelcome.maybeShow(); }, 300); }
      buildLibrary();
      // N-DIST: a #share=<encoded> link (see the Dashboard inspector's "Share this dashboard"
      // section) takes priority over the normal boot flow — it names an exact dashboard to
      // open, the same way a direct file Open would. Cleared via replaceState so a reload or
      // the E4 CDF filter-hash convention never collide with it.
      var sharedSpec = null;
      if (location.hash.indexOf("#share=") === 0) sharedSpec = Studio.decodeSpecFromShareString(location.hash.slice(7));
      if (sharedSpec) {
        try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
        S.spec = normalize(sharedSpec); S.selection = null;
        if (window.__studioShellSetSection) window.__studioShellSetSection("studio");
        syncHeader(); renderInspector(); refreshPreview(); buildLibrary();
        toast("Loaded shared dashboard: " + (sharedSpec.title || sharedSpec.name || "Untitled"));
      } else {
        // open the cost flagship example by default if present, else blank
        // keepAutosave=true so the restore banner can offer unsaved work from a previous session
        var def = S.examples.filter(function (e) { return /flagship|cost/.test(e.file); })[0] || S.examples[0];
        if (def) loadExample(def.file, true); else { renderInspector(); refreshPreview(); }
      }
      // offer to restore unsaved work (must run after the default example loads so the banner is visible)
      setTimeout(maybeShowRestoreBanner, 600);
    }).catch(function (e) {
      document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif;max-width:640px;margin:auto">' +
        '<h2>Could not load Studio data.</h2><p>The Studio reads JSON + toolkit files over HTTP, so it must be served ' +
        '(not opened via <code>file://</code>). From <code>dashboard-studio/</code> run:</p>' +
        '<pre style="background:#f4f6fb;padding:12px;border-radius:8px">python3 -m http.server 8000</pre>' +
        '<p>then open <a href="http://localhost:8000/">http://localhost:8000/</a></p>' +
        '<p style="color:#a31d3e">' + (e && e.message || e) + '</p></div>';
    });
  }
  function fetchJSON(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); }); }
  function fetchText(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u + " " + r.status); return r.text(); }); }

  /* ---------- status-bar footer + changelog ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function hlq(text, q) {
    var s = esc(String(text == null ? "" : text));
    if (!q) return s;
    return s.replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
      function (m) { return '<mark class="hl">' + m + "</mark>"; });
  }
  // Changelog entry times are authored in UTC ("HH:MM UTC"); display them in US Central (CT)
  // so future UTC-authored entries convert automatically (handles CST/CDT via the IANA zone).
  // Entries use the fleet-canonical shape (v: <int>, ts: <ISO UTC>); tolerate the
  // legacy {date,time} shape too, in case an in-flight loop run authored one.
  function vLabel(e) { return typeof e.v === "number" ? "v" + e.v : (e.v || ""); }
  function fmtEntryWhen(e) {
    var d = null;
    if (e.ts) { d = new Date(e.ts); }
    else if (e.date) {
      var m = e.time && /(\d{1,2}):(\d{2})/.exec(e.time);
      d = new Date(e.date + "T" + (m ? ("0" + m[1]).slice(-2) + ":" + m[2] : "00:00") + ":00Z");
    }
    if (d && !isNaN(d)) {
      try {
        return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" }) + " · " +
          d.toLocaleTimeString("en-GB", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit" }) + " CT";
      } catch (x) {}
    }
    return e.ts ? String(e.ts).slice(0, 10) : (e.date || "");
  }
  function fmtStamp(d) {
    try {
      return d.toLocaleDateString("en-US", { timeZone: "America/Chicago", year: "numeric", month: "short", day: "numeric" }) +
        " · " + d.toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit" }) + " CT";
    } catch (e) { return d.toISOString().slice(0, 16).replace("T", " "); }
  }
  function renderFooter() {
    var log = window.STUDIO_CHANGELOG || [];
    var stamp = $("#fbStamp");
    // "Last updated": real CI deploy time when present, else the latest entry's date.
    var build = window.STUDIO_BUILD, when = null;
    if (build && build.indexOf("__BUILD") < 0) { var t = new Date(build); if (!isNaN(t)) when = t; }
    if (!when && log[0]) { var d = new Date(log[0].ts || (log[0].date ? log[0].date + "T00:00:00Z" : "")); if (!isNaN(d)) when = d; }
    if (stamp) {
      if (when && build && build.indexOf("__BUILD") < 0) stamp.textContent = "Last updated " + fmtStamp(when);
      else if (when) stamp.textContent = "Last updated " + when.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
      else stamp.textContent = "";
      if (log[0]) stamp.textContent += "  ·  " + vLabel(log[0]);
    }
    // changelog panel — E6: live search
    var pop = $("#changelogPop");
    if (pop) {
      pop.innerHTML = '<div class="cl-head">' +
        '<h4>What&rsquo;s new</h4>' +
        '<input id="clSearch" type="search" class="cl-search" placeholder="Search…" aria-label="Search changelog">' +
        '<span class="cl-sub">latest first</span>' +
        '<button type="button" id="clClose" class="cl-close" aria-label="Close changelog">✕</button></div>' +
        '<div id="clEntries"></div>';
      var clEntries = pop.querySelector("#clEntries");
      function renderClEntries(q) {
        var needle = (q || "").trim().toLowerCase();
        var matched = log.filter(function (e) {
          if (!needle) return true;
          return (vLabel(e) + " " + (e.title || "") + " " + (e.ts || e.date || "") + " " + (e.items || []).join(" ")).toLowerCase().indexOf(needle) >= 0;
        });
        clEntries.innerHTML = matched.length ? matched.map(function (e) {
          var items = (e.items || []).map(function (x) { return "<li>" + hlq(x, needle) + "</li>"; }).join("");
          return '<div class="cl-entry' + (e === log[0] ? " cl-latest" : "") + '">' +
            '<div class="cl-top"><span class="cl-v">' + hlq(vLabel(e), needle) + '</span>' +
            '<span class="cl-title">' + hlq(e.title || "", needle) + '</span>' +
            (fmtEntryWhen(e) ? '<span class="cl-date">' + esc(fmtEntryWhen(e)) + '</span>' : "") + '</div>' +
            (items ? "<ul>" + items + "</ul>" : "") + '</div>';
        }).join("") : '<div class="cl-empty">No entries match “' + esc(q) + '”</div>';
      }
      renderClEntries("");
      var clSrch = pop.querySelector("#clSearch");
      if (clSrch) clSrch.addEventListener("input", function () { renderClEntries(clSrch.value); });
    }
    var btn = $("#btnChangelog");
    if (btn && pop) {
      // m-e: outside-tap listens for BOTH mousedown and touchstart — mobile Safari doesn't
      // reliably synthesize a mousedown from a tap, so touch-only closing needs its own listener
      // (this is the same "on-device behavior the sandbox can't reproduce" class of bug as m-b).
      var close = function () { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); document.removeEventListener("mousedown", onDoc); document.removeEventListener("touchstart", onDoc); document.removeEventListener("keydown", onKey); };
      var onDoc = function (ev) { if (!pop.contains(ev.target) && ev.target !== btn && !btn.contains(ev.target)) close(); };
      var onKey = function (ev) { if (ev.key === "Escape") close(); };
      btn.onclick = function () {
        if (pop.hidden) { pop.hidden = false; btn.setAttribute("aria-expanded", "true"); setTimeout(function () { document.addEventListener("mousedown", onDoc); document.addEventListener("touchstart", onDoc); document.addEventListener("keydown", onKey); }, 0); }
        else close();
      };
      // m-e: explicit Close button — tap-outside/Escape both already worked, but the
      // reference "What's new" sheet design (and touch UX generally) expects a visible,
      // unambiguous way to dismiss a full-width phone sheet without guessing.
      var clClose = pop.querySelector("#clClose");
      if (clClose) clClose.onclick = close;
    }
  }

  /* ---------- query library ---------- */
  function buildLibrary() {
    var list = $("#libList"), q = ($("#libSearch").value || "").toLowerCase();
    list.innerHTML = "";
    var stems = Object.keys(S.catalog).sort();
    var shownDA = 0;
    stems.forEach(function (stem) {
      var entry = S.catalog[stem];
      var das = (entry.dataAccesses || []).filter(function (d) {
        if (!q) return true;
        return (stem + " " + d.id + " " + (d.columns || []).join(" ") + " " + (d.sql || "")).toLowerCase().indexOf(q) >= 0;
      });
      if (!das.length) return;
      shownDA += das.length;
      var wrap = el("div", "lib-cda" + (q ? " open" : "")); wrap.setAttribute("data-stem", stem);
      var h = el("div", "h");
      h.innerHTML = '<span class="car">▶</span><span class="nm">' + esc(stem) + '</span><span class="badge">' + das.length + "</span>";
      h.onclick = function () { wrap.classList.toggle("open"); };
      wrap.appendChild(h);
      var box = el("div", "lib-das");
      das.forEach(function (d) { box.appendChild(daCard(stem, d, q)); });
      wrap.appendChild(box);
      list.appendChild(wrap);
    });
    if (q && !shownDA) {
      var empty = el("div", "lib-empty"); empty.textContent = 'No catalog queries match "' + esc(q) + '".'; list.appendChild(empty);
    }
    // "My Data Sources" section always at the top
    buildMyDataSources(list);
    $("#libCount").textContent = shownDA + " queries";
  }

  /* ---------- My Data Sources (spec-owned DAs) ---------- */
  function buildMyDataSources(list) {
    var das = S.spec.cda.dataAccesses || [];
    var wrap = el("div", "lib-mine open");
    var h = el("div", "h");
    h.innerHTML = '<span class="car">▶</span><span class="nm">My Data Sources</span><span class="badge">' + das.length + "</span>";
    var addBtn = el("button", "mine-add"); setIconBtn(addBtn, "plus", "New", 12);
    addBtn.title = "Create a new data source"; addBtn.type = "button";
    addBtn.onclick = function (e) { e.stopPropagation(); addNewDA(); };
    h.appendChild(addBtn);
    var joinBtn = el("button", "mine-add"); setIconBtn(joinBtn, "join", "Join", 12);
    joinBtn.title = "Create a compound (join/union) data access"; joinBtn.type = "button";
    joinBtn.onclick = function (e) { e.stopPropagation(); openCompoundDABuilder(null); };
    h.appendChild(joinBtn);
    h.onclick = function (e) { if (e.target.closest(".mine-add")) return; wrap.classList.toggle("open"); };
    wrap.appendChild(h);
    var box = el("div", "lib-das");
    if (!das.length) {
      var em = el("div"); em.style.cssText = "font-size:11.5px;color:var(--faint);padding:6px 4px;line-height:1.5";
      em.textContent = "No data sources yet. Click + New, or add a query from the catalog below.";
      box.appendChild(em);
    }
    das.forEach(function (da) { box.appendChild(myDACard(da)); });
    wrap.appendChild(box);
    list.insertBefore(wrap, list.firstChild);
  }

  function myDACard(da) {
    var c = el("div", "da da-mine");
    var isCompound = Studio.isCompoundDA(da);
    var shortKind = isCompound ? (da.compoundType === "union" ? "UNION" : "JOIN") : ((da.kind || "sql.jndi").split(".")[0]).toUpperCase();
    var cols = isCompound
      ? (da.compoundType === "union" ? (da.unionDas || []).map(function (id) { return '<span class="col">' + esc(id) + "</span>"; }).join("") :
         '<span class="col">' + esc(da.leftId || "?") + "</span> ⧈ <span class=\"col\">" + esc(da.rightId || "?") + "</span>")
      : (da.columns || []).map(function (x) { return '<span class="col">' + esc(x) + "</span>"; }).join("");
    var idDiv = el("div", "da-id");
    var idNm = el("span", "da-id-nm"); idNm.textContent = da.id;
    var badge = el("span", "kind-badge"); badge.textContent = shortKind;
    idDiv.appendChild(idNm); idDiv.appendChild(badge);
    idDiv.onclick = function (e) { e.stopPropagation(); select({ kind: "da", id: da.id }); };
    c.appendChild(idDiv);
    if (da.name) { var nm = el("div", "da-name"); nm.textContent = da.name; c.appendChild(nm); }
    if (cols) { var cd = el("div", "da-cols"); cd.innerHTML = cols; c.appendChild(cd); }
    // N-DATA freshness badge (v301/v302) follow-up: closes the "library pane" gap from the
    // "still open" note — same REPO_LIVE_KINDS scoping as the Repository card (only the
    // connector kinds that are ALWAYS live-capable, so plain Pentaho DAs stay badge-free).
    if (REPO_LIVE_KINDS[da.kind]) {
      var freshEl = el("div", "da-mine-fresh"); freshEl.textContent = daFreshnessLabel(da.id);
      c.appendChild(freshEl);
    }
    var acts = el("div", "da-mine-acts");
    var dup = el("button", "icobtn"); dup.appendChild(Studio.icon("duplicate", 14)); dup.title = "Duplicate";
    dup.onclick = function (e) { e.stopPropagation(); duplicateDA(da.id); };
    var del = el("button", "icobtn danger"); del.appendChild(Studio.icon("trash", 14)); del.title = "Delete";
    del.onclick = function (e) { e.stopPropagation(); deleteDA(da.id); };
    acts.appendChild(dup); acts.appendChild(del); c.appendChild(acts);
    if (S.selection && S.selection.kind === "da" && S.selection.id === da.id) c.classList.add("da-mine-sel");
    // usage badge: panels + KPIs that reference this DA
    var usage = daUsageCount(da.id);
    if (usage.total > 0) {
      var ub = el("div", "da-usage");
      var parts = [];
      if (usage.panels) parts.push(usage.panels + " panel" + (usage.panels !== 1 ? "s" : ""));
      if (usage.kpis) parts.push(usage.kpis + " KPI" + (usage.kpis !== 1 ? "s" : ""));
      ub.textContent = "↪ " + parts.join(" \xB7 ");
      c.appendChild(ub);
    }
    return c;
  }

  function daUsageCount(daId) {
    var panels = (S.spec.panels || []).filter(function (p) { return p.chart && p.chart.da === daId; }).length;
    var kpis = (S.spec.kpis || []).filter(function (k) { return k.da === daId; }).length;
    return { panels: panels, kpis: kpis, total: panels + kpis };
  }

  function addNewDA() {
    var da = Studio.newDA();
    S.spec.cda.dataAccesses.push(da);
    select({ kind: "da", id: da.id });
    buildLibrary();
    toast("New data source created");
  }
  function duplicateDA(id) {
    var da = Studio.daById(S.spec, id); if (!da) return;
    var dup = Studio.clone(da); dup.id = Studio.uid("da"); dup.name = (dup.name || dup.id) + " copy";
    S.spec.cda.dataAccesses.push(dup);
    select({ kind: "da", id: dup.id });
    buildLibrary(); refreshPreview();
    toast("Data source duplicated");
  }
  function deleteDA(id) {
    S.spec.cda.dataAccesses = S.spec.cda.dataAccesses.filter(function (d) { return d.id !== id; });
    if (S.selection && S.selection.kind === "da" && S.selection.id === id) selectDashboard();
    buildLibrary(); refreshPreview();
    toast("Data source removed");
  }

  /* ---------- compound DA builder (join / union) ---------- */
  function openCompoundDABuilder(existing) {
    var editing = !!existing;
    var src = editing ? Studio.clone(existing) : Studio.newCompoundDA("join");
    var draft = { id: src.id, name: src.name || "", compoundType: src.compoundType || "join",
                  leftId: src.leftId || "", rightId: src.rightId || "",
                  leftKeys: src.leftKeys || "", rightKeys: src.rightKeys || "",
                  unionDas: (src.unionDas || []).slice(), cache: src.cache !== false, cacheDuration: src.cacheDuration || 300 };

    modal(editing ? "Edit compound data access · " + existing.id : "New compound data access", function (b) {
      var wrap = el("div", "dsb");

      // type selector
      var typePairs = [["join", "Join (merge two DAs on key columns)"], ["union", "Union (stack rows from multiple DAs)"]];
      var typeF = field("Compound type", select2pairs(typePairs, draft.compoundType, function (v) { draft.compoundType = v; renderBody(); }));
      wrap.appendChild(typeF);

      // id + name
      var idRow = el("div", "field row");
      idRow.appendChild(field("ID", input(draft.id, function (v) { draft.id = v.trim().replace(/[^a-zA-Z0-9_-]+/g, "_"); }, "e.g. joinedSales")));
      idRow.appendChild(field("Name", input(draft.name, function (v) { draft.name = v; }, "display name")));
      wrap.appendChild(idRow);

      var body = el("div", "dsb-qsec");
      wrap.appendChild(body);

      var allDaIds = (S.spec.cda.dataAccesses || []).filter(function (d) { return !Studio.isCompoundDA(d) || d.id !== draft.id; }).map(function (d) { return d.id; });

      function renderBody() {
        body.innerHTML = "";
        if (draft.compoundType === "union") {
          var uHdr = el("div", "dsb-chips-hdr"); uHdr.appendChild(labelEl("Member data accesses (stacked)"));
          var addU = el("button", "dsb-mini"); addU.textContent = "＋ Add";
          addU.onclick = function () { var first = allDaIds.filter(function (id) { return draft.unionDas.indexOf(id) < 0; })[0] || ""; if (first) draft.unionDas.push(first); renderBody(); };
          uHdr.appendChild(addU); body.appendChild(uHdr);
          if (!draft.unionDas.length) body.appendChild(hint("Add at least two data accesses to union."));
          draft.unionDas.forEach(function (did, i) {
            var r = el("div", "field row");
            var opts = allDaIds.map(function (id) { return [id, id]; });
            var sel = select2pairs(opts, did, function (v) { draft.unionDas[i] = v; });
            var rm = delBtn(function () { draft.unionDas.splice(i, 1); renderBody(); });
            r.appendChild(sel); r.appendChild(rm); body.appendChild(r);
          });
        } else {
          // join
          var daPairs = (allDaIds.length ? allDaIds : [""]).map(function (id) { return [id, id]; });
          var emptyPair = [["", "(none)"]];
          body.appendChild(field("Left DA", select2pairs(emptyPair.concat(daPairs), draft.leftId, function (v) { draft.leftId = v; })));
          body.appendChild(field("Left join key(s)", input(draft.leftKeys, function (v) { draft.leftKeys = v; }, "comma-separated column names")));
          body.appendChild(field("Right DA", select2pairs(emptyPair.concat(daPairs), draft.rightId, function (v) { draft.rightId = v; })));
          body.appendChild(field("Right join key(s)", input(draft.rightKeys, function (v) { draft.rightKeys = v; }, "comma-separated column names")));
          body.appendChild(hint("The join produces a Pentaho CDA <CompoundDataAccess type=\"join\"> — results available on the server when both DAs share the same Pentaho connection."));
        }
      }
      renderBody();

      // cache
      var cacheF = field("Cache duration (s)", (function () { var i = el("input"); i.type = "number"; i.value = draft.cacheDuration; i.addEventListener("input", function () { draft.cacheDuration = +i.value || 300; }); return i; })());
      var cacheLab = el("label", "check"); var ccb = el("input"); ccb.type = "checkbox"; ccb.checked = draft.cache;
      ccb.onchange = function () { draft.cache = ccb.checked; };
      cacheLab.appendChild(ccb); cacheLab.appendChild(document.createTextNode(" Cache enabled"));
      var cs = el("div", "field"); cs.appendChild(cacheLab); cs.appendChild(cacheF);
      wrap.appendChild(cs);

      var foot = el("div", "dsb-foot");
      var cancel = el("button", "btn"); cancel.textContent = "Cancel";
      cancel.onclick = function () { wrap.closest(".modal-ov").remove(); };
      var save = el("button", "btn btn-primary"); save.textContent = editing ? "Save" : "Create";
      save.onclick = function () {
        if (!draft.id) { toast("Give the compound DA an ID.", true); return; }
        if (draft.compoundType === "join" && (!draft.leftId || !draft.rightId)) { toast("Pick both left and right DAs.", true); return; }
        if (draft.compoundType === "union" && draft.unionDas.length < 2) { toast("A union needs at least 2 member DAs.", true); return; }
        var rec = { id: draft.id, name: draft.name || draft.id, kind: "compound",
                    compoundType: draft.compoundType, columns: [],
                    leftId: draft.leftId, rightId: draft.rightId, leftKeys: draft.leftKeys, rightKeys: draft.rightKeys,
                    unionDas: draft.unionDas.slice(), cache: draft.cache, cacheDuration: draft.cacheDuration };
        if (editing) {
          var idx = -1; S.spec.cda.dataAccesses.forEach(function (d, i) { if (d.id === existing.id) idx = i; });
          if (idx >= 0) S.spec.cda.dataAccesses[idx] = rec; else S.spec.cda.dataAccesses.push(rec);
        } else {
          S.spec.cda.dataAccesses.push(rec);
        }
        select({ kind: "da", id: rec.id });
        buildLibrary(); refreshPreview();
        toast((editing ? "Updated " : "Created ") + rec.id);
        wrap.closest(".modal-ov").remove();
      };
      foot.appendChild(cancel); foot.appendChild(save); wrap.appendChild(foot);
      b.appendChild(wrap);
    });
  }

  function daCard(stem, d, q) {
    var c = el("div", "da");
    c.draggable = true;
    var cols = (d.columns || []).map(function (x) { return '<span class="col">' + hlq(x, q) + "</span>"; }).join("");
    var params = (d.params || []).map(function (p) { return '<span class="col param">$' + hlq(p.name, q) + "</span>"; }).join("");
    var chips = ["bars", "donut", "line", "treemap", "table"].map(function (t) {
      return '<span class="chip" data-t="' + t + '">+ ' + Studio.CHARTS[t].label + "</span>";
    }).join("") + '<span class="chip" data-t="kpi">+ KPI</span>';
    c.innerHTML = '<div class="da-top"><div class="da-id">' + hlq(d.id, q) + "</div>" +
      '<div class="da-acts"><button class="da-act" data-a="edit" title="Edit data source"></button>' +
      '<button class="da-act" data-a="del" title="Delete data source"></button></div></div>' +
      '<div class="da-cols">' + cols + params + "</div><div class=\"da-add\">" + chips + "</div>";
    c.querySelector('[data-a="edit"]').appendChild(Studio.icon("edit", 12));
    c.querySelector('[data-a="del"]').appendChild(Studio.icon("trash", 12));
    $$(".chip", c).forEach(function (chip) {
      chip.onclick = function (e) { e.stopPropagation(); addFromDA(stem, d.id, chip.getAttribute("data-t")); };
    });
    c.querySelector('[data-a="edit"]').onclick = function (e) { e.stopPropagation(); dataSourceBuilder({ stem: stem, da: d }); };
    c.querySelector('[data-a="del"]').onclick = function (e) { e.stopPropagation(); if (confirm("Delete data source “" + d.id + "” from the library?")) deleteDataSource(stem, d.id); };
    c.addEventListener("dragstart", function (e) {
      e.dataTransfer.setData("text/plain", JSON.stringify({ stem: stem, da: d.id }));
      e.dataTransfer.effectAllowed = "copy";
    });
    return c;
  }

  function catalogDA(stem, daId) {
    var e = S.catalog[stem]; if (!e) return null;
    return (e.dataAccesses || []).filter(function (d) { return d.id === daId; })[0] || null;
  }

  function addFromDA(stem, daId, type) {
    var daDef = catalogDA(stem, daId); if (!daDef) return;
    // adopt the connection from the source cda if the spec is still empty
    if (!S.spec.cda.dataAccesses.length && S.catalog[stem]) S.spec.cda.connection = Studio.clone(S.catalog[stem].connection);
    Studio.ensureDA(S.spec, daDef);
    if (type === "kpi") {
      var k = Studio.newKpi(daDef); k.fmt = Studio.guessFmt(k.valueCol);
      S.spec.kpis.push(k); select({ kind: "kpi", index: S.spec.kpis.length - 1 });
    } else {
      var p = Studio.newPanel(type, daDef);
      if (p.chart.opts && "fmt" in p.chart.opts) p.chart.opts.fmt = Studio.guessFmt(p.chart.map.valueCol || (p.chart.map.series && p.chart.map.series[0] && p.chart.map.series[0].col));
      S.spec.panels.push(p); select({ kind: "panel", id: p.id });
    }
    toast("Added to “" + S.spec.title + "”");
    refreshPreview(); buildLibrary();
  }

  // Add a text/annotation panel directly (no DA needed) and open it in the inspector.
  function addTextPanel() {
    var p = Studio.newPanel("richtext", null);
    p.title = "Note"; p.span = "full"; p.chart.opts.content = "";
    S.spec.panels.push(p);
    select({ kind: "panel", id: p.id });
    refreshPreview();
    toast("Text panel added — type content in the inspector");
  }

  /* ---------- data-source builder (author CDA queries) ---------- */
  var DS_TYPES = [
    { kind: "sql", iconName: "db", name: "SQL", desc: "Relational query over a JDBC / JNDI connection", ph: "SELECT region AS region,\n       SUM(amount) AS total\nFROM   sales\nGROUP  BY region\nORDER  BY total DESC" },
    { kind: "mdx", iconName: "cube", name: "MDX / OLAP", desc: "Mondrian cube query (catalog + JNDI)", ph: "SELECT NON EMPTY {[Measures].[Sales]} ON COLUMNS,\n       NON EMPTY {[Markets].Children} ON ROWS\nFROM [SteelWheelsSales]" },
    { kind: "kettle", iconName: "gear", name: "Kettle / PDI", desc: "A .ktr transformation step as a data source", ph: "/public/etl/my-transform.ktr   (step: Output)" },
    { kind: "mql", iconName: "metadata", name: "Metadata", desc: "Pentaho Metadata (MQL) query", ph: "<mql>…</mql>" },
    { kind: "scripting", iconName: "code", name: "Scripting", desc: "Scripted (Kettle/Beanshell) data access", ph: "// return rows…" },
    { kind: "duckdb", iconName: "duckdb", name: "DuckDB (remote file)", desc: "Query a Parquet/CSV file straight from S3/HTTP — no backend, no proxy", badge: "Browser-only", accent: "#FFDE00", ph: "SELECT * FROM t\nLIMIT  200   -- t = your file, queried in-browser via DuckDB-Wasm" },
    { kind: "httpvfs", iconName: "sqlite", name: "SQLite (remote .sqlite)", desc: "Query a .sqlite file over HTTP Range Requests — indexed lookups, no backend", badge: "Browser-only", accent: "#0F80CC", ph: "SELECT * FROM my_table\nLIMIT  200" },
    { kind: "snowflake", iconName: "snowflake", name: "Snowflake", desc: "Query a Snowflake warehouse via the SQL API — needs a token + CORS allow-listed origin", badge: "Needs token", accent: "#29B5E8", ph: "SELECT region,\n       SUM(revenue) AS revenue\nFROM   sales\nGROUP  BY region" },
    { kind: "databricks", iconName: "databricks", name: "Databricks", desc: "Query a SQL warehouse via the Statement Execution API — needs a token + CORS allow-listed origin", badge: "Needs token", accent: "#FF3621", ph: "SELECT region,\n       SUM(revenue) AS revenue\nFROM   sales\nGROUP  BY region" },
    { kind: "bigquery", iconName: "bigquery", name: "BigQuery", desc: "Query a dataset via the jobs.query REST API — needs a Google OAuth access token", badge: "Needs token", accent: "#4285F4", ph: "SELECT region,\n       SUM(revenue) AS revenue\nFROM   `dataset.sales`\nGROUP  BY region" },
    { kind: "http", iconName: "globe", name: "Generic SQL/HTTP", desc: "POST/GET a JSON API that runs SQL and returns rows — any in-house query service or provider not listed above", badge: "Needs endpoint", accent: "#6b7688", ph: "SELECT region,\n       SUM(revenue) AS revenue\nFROM   sales\nGROUP  BY region" }
  ];
  function dsType(k) { return DS_TYPES.filter(function (t) { return t.kind === k; })[0] || DS_TYPES[0]; }
  // shared by the data-source builder draft and the DA inspector (both store the same sf* keys)
  // so Studio.Snowflake.{testConnection,query} always see the same {account,token,...} shape.
  function sfCfg(o) { return { account: o.sfAccount, token: o.sfToken, tokenType: o.sfTokenType, warehouse: o.sfWarehouse, database: o.sfDatabase, schema: o.sfSchema, role: o.sfRole }; }
  // same pattern for Databricks (db* keys) so Studio.Databricks.{testConnection,query} always see
  // the same {host,token,warehouseId,catalog,schema} shape.
  function dbxCfg(o) { return { host: o.dbxHost, token: o.dbxToken, warehouseId: o.dbxWarehouseId, catalog: o.dbxCatalog, schema: o.dbxSchema }; }
  // same pattern for BigQuery (bq* keys) so Studio.BigQuery.{testConnection,query} always see
  // the same {project,token,location,dataset} shape.
  function bqCfg(o) { return { project: o.bqProject, token: o.bqToken, location: o.bqLocation, dataset: o.bqDataset }; }
  // same pattern for Generic SQL/HTTP (http* keys) so Studio.GenericSql.{testConnection,query}
  // always see the same {url,method,authHeader,paramName} shape.
  function httpCfg(o) { return { url: o.httpUrl, method: o.httpMethod, authHeader: o.httpAuthHeader, paramName: o.httpParamName }; }

  // open the guided builder. existing = {stem, da} to edit, or null to create.
  function dataSourceBuilder(existing) {
    var editing = !!existing;
    var src = editing ? Studio.clone(existing.da) : { id: "", name: "", kind: "sql", jndi: defaultJndi(), sql: "", query: "", params: [], columns: [], calcColumns: [], cache: true, cacheDuration: 300 };
    src.kind = src.kind || "sql";
    var draft = { stem: editing ? existing.stem : "custom", id: src.id, kind: src.kind, jndi: src.jndi,
      query: src.query || src.sql || "", columns: (src.columns || []).slice(),
      params: (src.params || []).map(function (p) { return { name: p.name, type: p.type || "String", default: p.default || "" }; }),
      calcColumns: (src.calcColumns || []).map(function (c) { return { name: c.name || "", formula: c.formula || "", type: c.type || "Numeric" }; }),
      mdxCatalog: src.mdxCatalog || "", mqlDomain: src.mqlDomain || "",
      ktrPath: src.ktrPath || "", ktrStep: src.ktrStep || "Output",
      scriptLang: src.scriptLang || "javascript",
      fileUrl: src.fileUrl || "", fileFormat: src.fileFormat || "auto", tableName: src.tableName || "",
      sfAccount: src.sfAccount || "", sfToken: src.sfToken || "", sfTokenType: src.sfTokenType || "PROGRAMMATIC_ACCESS_TOKEN",
      sfWarehouse: src.sfWarehouse || "", sfDatabase: src.sfDatabase || "", sfSchema: src.sfSchema || "", sfRole: src.sfRole || "",
      dbxHost: src.dbxHost || "", dbxToken: src.dbxToken || "", dbxWarehouseId: src.dbxWarehouseId || "",
      dbxCatalog: src.dbxCatalog || "", dbxSchema: src.dbxSchema || "",
      bqProject: src.bqProject || "", bqToken: src.bqToken || "", bqLocation: src.bqLocation || "", bqDataset: src.bqDataset || "",
      httpUrl: src.httpUrl || "", httpMethod: src.httpMethod || "POST", httpAuthHeader: src.httpAuthHeader || "", httpParamName: src.httpParamName || "sql" };

    modal(editing ? "Edit data source · " + existing.da.id : "New data source", function (b) {
      var wrap = el("div", "dsb");

      // 1 — type picker cards
      var types = el("div", "dsb-types");
      DS_TYPES.forEach(function (t) {
        var card = el("div", "dsb-type" + (t.kind === draft.kind ? " sel" : ""));
        var icDiv = el("div", "ic"); icDiv.appendChild(Studio.icon(t.iconName, 20));
        // Z4 "connector-gallery brand treatment": the third-party providers (DuckDB/SQLite/
        // Snowflake/Databricks/BigQuery/Generic) each get their real brand color on the icon +
        // a matching soft tint behind it, so the gallery reads as a row of distinct connectors
        // rather than one uniform blue set. The native Pentaho access types (SQL/MDX/Kettle/
        // Metadata/Scripting) intentionally keep the app's own --pentaho accent — they aren't
        // third-party brands, they're the built-in kinds.
        if (t.accent) { icDiv.style.color = t.accent; icDiv.style.background = "color-mix(in srgb," + t.accent + " 16%, transparent)"; icDiv.style.borderRadius = "50%"; }
        var txDiv = el("div", "tx"); txDiv.innerHTML = '<b>' + esc(t.name) + (t.badge ? ' <span class="dsb-badge">' + esc(t.badge) + "</span>" : "") + "</b><span>" + esc(t.desc) + "</span>";
        card.appendChild(icDiv); card.appendChild(txDiv);
        card.onclick = function () { draft.kind = t.kind; $$(".dsb-type", types).forEach(function (c) { c.classList.remove("sel"); }); card.classList.add("sel"); syncType(); };
        types.appendChild(card);
      });
      wrap.appendChild(labelEl("Source type")); wrap.appendChild(types);

      // 2 — identity row
      var row = el("div", "field row");
      var idF = field("Query id", input(draft.id, function (v) { draft.id = v.trim().replace(/[^a-zA-Z0-9_]+/g, ""); }, "e.g. salesByRegion"));
      var grpF = field("Group", input(draft.stem, function (v) { draft.stem = v.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-") || "custom"; }, "library section"));
      row.appendChild(idF); row.appendChild(grpF); wrap.appendChild(row);
      var connF = field("Connection (JNDI)", input(draft.jndi, function (v) { draft.jndi = v.trim(); }, "PDC-BIDB-EXT"));
      wrap.appendChild(connF);

      // 3 — query editor (type-aware; rebuilt on kind change)
      var qSection = el("div", "dsb-qsec");
      wrap.appendChild(qSection);

      // 4 — columns (detect + edit chips)
      var colsBox = el("div", "dsb-chips");
      var detectBtn = el("button", "dsb-mini"); setIconBtn(detectBtn, "refresh", "Detect from query", 12);
      detectBtn.onclick = function () {
        var found = Studio.colsFromSql(draft.query);
        if (!found.length) { toast("No “… AS alias” columns found — add them below or alias your SELECT.", true); return; }
        found.forEach(function (c) { if (draft.columns.indexOf(c) < 0) draft.columns.push(c); });
        renderCols(); renderPreview(); flashBtn(detectBtn, found.length + " detected");
      };
      var addCol = input("", function () {}, "add column + Enter");
      addCol.className = "dsb-addcol";
      addCol.addEventListener("keydown", function (e) { if (e.key === "Enter") { var v = addCol.value.trim().replace(/[^a-zA-Z0-9_]+/g, ""); if (v && draft.columns.indexOf(v) < 0) { draft.columns.push(v); addCol.value = ""; renderCols(); renderPreview(); } } });
      var colsField = el("div", "field");
      var colsHdr = el("div", "dsb-chips-hdr"); colsHdr.appendChild(labelEl("Columns")); colsHdr.appendChild(detectBtn);
      colsField.appendChild(colsHdr); colsField.appendChild(colsBox); colsField.appendChild(addCol);
      wrap.appendChild(colsField);
      function renderCols() {
        colsBox.innerHTML = "";
        if (!draft.columns.length) { var e = el("span", "dsb-empty"); e.textContent = "No columns yet — detect or add."; colsBox.appendChild(e); return; }
        draft.columns.forEach(function (c, i) {
          var chip = el("span", "dsb-chip"); chip.textContent = c; var rmC = el("button", "rm"); rmC.title = "remove"; rmC.appendChild(Studio.icon("close", 10)); chip.appendChild(rmC);
          chip.querySelector(".rm").onclick = function () { draft.columns.splice(i, 1); renderCols(); renderPreview(); };
          colsBox.appendChild(chip);
        });
      }

      // 5 — parameters
      var paramsBox = el("div", "dsb-params");
      var paramsField = el("div", "field");
      var pHdr = el("div", "dsb-chips-hdr"); pHdr.appendChild(labelEl("Parameters"));
      var addP = el("button", "dsb-mini"); setIconBtn(addP, "plus", "Parameter", 12);
      addP.onclick = function () { draft.params.push({ name: "param" + (draft.params.length + 1), type: "String", default: "" }); renderParams(); };
      pHdr.appendChild(addP); paramsField.appendChild(pHdr); paramsField.appendChild(paramsBox); wrap.appendChild(paramsField);
      function renderParams() {
        paramsBox.innerHTML = "";
        if (!draft.params.length) { var e = el("span", "dsb-empty"); e.textContent = "No parameters."; paramsBox.appendChild(e); return; }
        draft.params.forEach(function (p, i) {
          var r = el("div", "dsb-prow");
          var n = input(p.name, function (v) { p.name = v.trim().replace(/[^a-zA-Z0-9_]+/g, ""); }, "name");
          var ty = select2pairs([["String", "String"], ["Integer", "Integer"], ["Numeric", "Numeric"], ["Date", "Date"]], p.type, function (v) { p.type = v; });
          var dv = input(p.default, function (v) { p.default = v; }, "default");
          var rm = el("button", "rm"); rm.title = "Remove parameter"; rm.setAttribute("aria-label", "Remove parameter"); rm.appendChild(Studio.icon("close", 10)); rm.onclick = function () { draft.params.splice(i, 1); renderParams(); };
          r.appendChild(n); r.appendChild(ty); r.appendChild(dv); r.appendChild(rm); paramsBox.appendChild(r);
        });
      }

      // 6 — calculated columns
      var calcBox = el("div", "dsb-params");
      var calcField = el("div", "field");
      var calcHdr = el("div", "dsb-chips-hdr"); calcHdr.appendChild(labelEl("Calculated columns"));
      var addCC = el("button", "dsb-mini"); setIconBtn(addCC, "plus", "Calculated column", 12);
      addCC.onclick = function () { draft.calcColumns.push(Studio.newCalcCol()); renderCalcCols(); };
      calcHdr.appendChild(addCC); calcField.appendChild(calcHdr); calcField.appendChild(calcBox); wrap.appendChild(calcField);
      function renderCalcCols() {
        calcBox.innerHTML = "";
        if (!draft.calcColumns.length) { var e = el("span", "dsb-empty"); e.textContent = "No calculated columns. Derived via formula: =[col1] + [col2]"; calcBox.appendChild(e); return; }
        draft.calcColumns.forEach(function (cc, i) {
          var r = el("div", "dsb-prow");
          var nm = input(cc.name, function (v) { cc.name = v.trim().replace(/[^a-zA-Z0-9_]+/g, "_"); }); nm.placeholder = "col_name";
          var fm = input(cc.formula, function (v) { cc.formula = v; }); fm.placeholder = "=[colA] + [colB]"; fm.style.flex = "2";
          var calcTypePairs = Studio.COLUMN_TYPES.map(function (t) { return [t, t]; });
          var ty = select2pairs(calcTypePairs, cc.type || "Numeric", function (v) { cc.type = v; });
          var rm = el("button", "rm"); rm.title = "Remove calculated column"; rm.setAttribute("aria-label", "Remove calculated column"); rm.appendChild(Studio.icon("close", 10)); rm.onclick = function () { draft.calcColumns.splice(i, 1); renderCalcCols(); };
          r.appendChild(nm); r.appendChild(fm); r.appendChild(ty); r.appendChild(rm); calcBox.appendChild(r);
        });
      }

      // 7 — live preview
      var prev = el("div", "dsb-prev");
      var prevField = el("div", "field"); prevField.appendChild(labelEl("Live preview (offline sample)")); prevField.appendChild(prev);
      wrap.appendChild(prevField);
      function renderPreview() {
        if (!draft.columns.length) { prev.innerHTML = '<div class="dsb-empty">Add columns to see a sample.</div>'; return; }
        var rows = Studio.sampleRows({ id: draft.id || "q", columns: draft.columns }).rows;
        var th = draft.columns.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("");
        var tb = rows.slice(0, 5).map(function (r) { return "<tr>" + r.map(function (v) { return "<td>" + esc(v) + "</td>"; }).join("") + "</tr>"; }).join("");
        prev.innerHTML = '<table><thead><tr>' + th + "</tr></thead><tbody>" + tb + "</tbody></table>";
      }

      // footer
      var foot = el("div", "dsb-foot");
      var save = el("button", "btn btn-primary"); save.textContent = editing ? "Save changes" : "Create data source";
      var cancel = el("button", "btn"); cancel.textContent = "Cancel";
      cancel.onclick = function () { wrap.closest(".modal-ov").remove(); };
      save.onclick = function () { if (saveDraft(draft, editing ? existing : null)) wrap.closest(".modal-ov").remove(); };
      foot.appendChild(cancel); foot.appendChild(save); wrap.appendChild(foot);

      // G1 — Visual SQL Builder: builds a SELECT statement interactively and writes it to the query textarea.
      // G1b adds JOIN clauses (table + type + ON condition).
      // G1c adds aggregate expressions (SUM/COUNT/AVG/MAX/MIN) and GROUP BY columns.
      // Only shown for SQL kind DAs. Self-contained: sbState persists for the lifetime of this modal.
      function renderSQLBuilder(qTa) {
        var sbState = {
          table: "", allCols: true, selCols: [],
          joins: [],      // G1b: [{type, table, on}]
          aggCols: [],    // G1c: [{fn, col, alias}] aggregate expressions
          conditions: [],
          groupBy: [],    // G1c: GROUP BY column chips
          orderBy: "", orderDir: "ASC", limit: ""
        };
        var sqb = el("div", "dsb-sqb");
        var tog = el("button", "dsb-sqb-tog"); tog.type = "button";
        var togL = el("span", "dsb-sqb-tog-l");
        togL.appendChild(Studio.icon("db", 13));
        var togTx = el("span"); togTx.textContent = " SQL Builder "; togTx.style.cssText = "font-size:12px;font-weight:700;color:inherit";
        var togHint = el("span"); togHint.style.cssText = "font-size:10.5px;color:var(--faint);font-weight:400";
        togHint.textContent = "generate a SELECT statement interactively";
        togL.appendChild(togTx); togL.appendChild(togHint);
        var caret = el("span", "sqb-caret");
        caret.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 5 8 10 13 5"/></svg>';
        tog.appendChild(togL); tog.appendChild(caret);
        var body = el("div", "dsb-sqb-body"); body.hidden = true;

        function mkOpts(sel, pairs, val) {
          pairs.forEach(function (p) { var o = el("option"); o.value = p[0]; o.textContent = p[1]; if (p[0] === val) o.selected = true; sel.appendChild(o); });
          return sel;
        }

        function renderBody() {
          body.innerHTML = "";

          // FROM table
          var rFrom = el("div", "dsb-sqb-row");
          var lFrom = el("span", "dsb-sqb-lbl"); lFrom.textContent = "FROM";
          var iTable = el("input"); iTable.className = "dsb-sqb-inp"; iTable.value = sbState.table;
          iTable.placeholder = "schema.table_name"; iTable.style.fontFamily = "var(--mono)";
          iTable.addEventListener("input", function () { sbState.table = this.value.trim(); });
          rFrom.appendChild(lFrom); rFrom.appendChild(iTable);
          body.appendChild(rFrom);

          // G1b — JOIN clauses: add multiple JOIN tables with type + ON condition
          var rJoin = el("div", "dsb-sqb-row");
          var lJoin = el("span", "dsb-sqb-lbl"); lJoin.textContent = "JOIN";
          var addJoin = el("button", "dsb-mini"); addJoin.type = "button";
          setIconBtn(addJoin, "plus", "Add JOIN", 11);
          addJoin.onclick = function () { sbState.joins.push({ type: "LEFT", table: "", on: "" }); renderBody(); };
          rJoin.appendChild(lJoin); rJoin.appendChild(addJoin); body.appendChild(rJoin);
          sbState.joins.forEach(function (join, i) {
            var row = el("div", "dsb-sqb-row dsb-sqb-indent");
            var typeSel = el("select"); typeSel.className = "dsb-sqb-inp"; typeSel.style.cssText = "flex:0 0 auto;width:110px";
            mkOpts(typeSel, [["LEFT","LEFT JOIN"],["INNER","INNER JOIN"],["RIGHT","RIGHT JOIN"],["FULL","FULL OUTER JOIN"]], join.type);
            typeSel.addEventListener("change", function () { join.type = this.value; });
            var tInp = el("input"); tInp.className = "dsb-sqb-inp"; tInp.value = join.table; tInp.placeholder = "schema.table"; tInp.style.fontFamily = "var(--mono)";
            tInp.addEventListener("input", function () { join.table = this.value; });
            var lOn = el("span"); lOn.textContent = "ON"; lOn.style.cssText = "font-size:10.5px;font-weight:800;color:var(--pentaho);font-family:var(--mono);flex:0 0 auto";
            var onInp = el("input"); onInp.className = "dsb-sqb-inp"; onInp.value = join.on; onInp.placeholder = "t1.id = t2.id"; onInp.style.fontFamily = "var(--mono)";
            onInp.addEventListener("input", function () { join.on = this.value; });
            var rm = el("button", "rm"); rm.type = "button"; rm.style.color = "var(--bad)"; rm.title = "Remove join"; rm.setAttribute("aria-label", "Remove join");
            rm.appendChild(Studio.icon("close", 10)); rm.onclick = function () { sbState.joins.splice(i, 1); renderBody(); };
            row.appendChild(typeSel); row.appendChild(tInp); row.appendChild(lOn); row.appendChild(onInp); row.appendChild(rm);
            body.appendChild(row);
          });

          // SELECT: all (*) or specific columns
          var rSel = el("div", "dsb-sqb-row");
          var lSel = el("span", "dsb-sqb-lbl"); lSel.textContent = "SELECT";
          var uid = draft.id || "q";
          var allRad = el("input"); allRad.type = "radio"; allRad.name = "sqb_c_" + uid; allRad.id = "sqb_all_" + uid; allRad.value = "all"; if (sbState.allCols) allRad.checked = true;
          var allL = el("label"); allL.htmlFor = allRad.id; allL.textContent = "All (*)"; allL.style.cssText = "font-size:12px;margin-right:10px";
          var specRad = el("input"); specRad.type = "radio"; specRad.name = "sqb_c_" + uid; specRad.id = "sqb_sp_" + uid; specRad.value = "spec"; if (!sbState.allCols) specRad.checked = true;
          var specL = el("label"); specL.htmlFor = specRad.id; specL.textContent = "Specific columns:"; specL.style.fontSize = "12px";
          allRad.addEventListener("change", function () { sbState.allCols = true; renderBody(); });
          specRad.addEventListener("change", function () { sbState.allCols = false; renderBody(); });
          rSel.appendChild(lSel); rSel.appendChild(allRad); rSel.appendChild(allL); rSel.appendChild(specRad); rSel.appendChild(specL);
          body.appendChild(rSel);
          if (!sbState.allCols) {
            var colBox = el("div", "dsb-sqb-colbox");
            sbState.selCols.forEach(function (c, i) {
              var chip = el("span", "dsb-chip"); chip.textContent = c;
              var rm = el("button", "rm"); rm.type = "button"; rm.title = "Remove column"; rm.setAttribute("aria-label", "Remove column"); rm.appendChild(Studio.icon("close", 10));
              rm.onclick = function () { sbState.selCols.splice(i, 1); renderBody(); };
              chip.appendChild(rm); colBox.appendChild(chip);
            });
            var addIn = el("input"); addIn.placeholder = "column + Enter"; addIn.className = "dsb-sqb-inp";
            addIn.style.cssText = "font-family:var(--mono);flex:none;width:140px";
            addIn.addEventListener("keydown", function (e) {
              if (e.key === "Enter") { var v = this.value.trim().replace(/[^a-zA-Z0-9_.]+/g, ""); if (v && sbState.selCols.indexOf(v) < 0) { sbState.selCols.push(v); this.value = ""; renderBody(); } }
            });
            colBox.appendChild(addIn); body.appendChild(colBox);
          }

          // G1c — Aggregate expressions: SUM/COUNT/AVG/MAX/MIN per column, written into SELECT
          var rAgg = el("div", "dsb-sqb-row");
          var lAgg = el("span", "dsb-sqb-lbl"); lAgg.textContent = "AGG";
          var addAgg = el("button", "dsb-mini"); addAgg.type = "button";
          setIconBtn(addAgg, "plus", "Add aggregate", 11);
          addAgg.onclick = function () { sbState.aggCols.push({ fn: "SUM", col: "", alias: "" }); renderBody(); };
          var aggHint = el("span"); aggHint.style.cssText = "font-size:10.5px;color:var(--faint)"; aggHint.textContent = "aggregate expressions";
          rAgg.appendChild(lAgg); rAgg.appendChild(addAgg); rAgg.appendChild(aggHint); body.appendChild(rAgg);
          sbState.aggCols.forEach(function (agg, i) {
            var row = el("div", "dsb-sqb-row dsb-sqb-indent");
            var fnSel = el("select"); fnSel.className = "dsb-sqb-inp"; fnSel.style.cssText = "flex:0 0 auto;width:100px";
            mkOpts(fnSel, [["SUM","SUM"],["COUNT","COUNT"],["AVG","AVG"],["MAX","MAX"],["MIN","MIN"],["COUNT_DISTINCT","COUNT DISTINCT"]], agg.fn);
            fnSel.addEventListener("change", function () { agg.fn = this.value; });
            var cInp = el("input"); cInp.className = "dsb-sqb-inp"; cInp.value = agg.col; cInp.placeholder = "column"; cInp.style.fontFamily = "var(--mono)";
            cInp.addEventListener("input", function () { agg.col = this.value; });
            var lAs = el("span"); lAs.textContent = "AS"; lAs.style.cssText = "font-size:10.5px;font-weight:800;color:var(--pentaho);font-family:var(--mono);flex:0 0 auto";
            var aInp = el("input"); aInp.className = "dsb-sqb-inp"; aInp.value = agg.alias; aInp.placeholder = "total_revenue"; aInp.style.fontFamily = "var(--mono)";
            aInp.addEventListener("input", function () { agg.alias = this.value; });
            var rm = el("button", "rm"); rm.type = "button"; rm.style.color = "var(--bad)"; rm.title = "Remove aggregate"; rm.setAttribute("aria-label", "Remove aggregate");
            rm.appendChild(Studio.icon("close", 10)); rm.onclick = function () { sbState.aggCols.splice(i, 1); renderBody(); };
            row.appendChild(fnSel); row.appendChild(cInp); row.appendChild(lAs); row.appendChild(aInp); row.appendChild(rm);
            body.appendChild(row);
          });

          // WHERE conditions
          var rWhere = el("div", "dsb-sqb-row");
          var lWhere = el("span", "dsb-sqb-lbl"); lWhere.textContent = "WHERE";
          var addCond = el("button", "dsb-mini"); addCond.type = "button";
          setIconBtn(addCond, "plus", "Add condition", 11);
          addCond.onclick = function () { sbState.conditions.push({ col: "", op: "=", val: "" }); renderBody(); };
          rWhere.appendChild(lWhere); rWhere.appendChild(addCond); body.appendChild(rWhere);
          sbState.conditions.forEach(function (cond, i) {
            var row = el("div", "dsb-sqb-row dsb-sqb-indent");
            var cInp = el("input"); cInp.className = "dsb-sqb-inp"; cInp.value = cond.col; cInp.placeholder = "column"; cInp.style.fontFamily = "var(--mono)";
            cInp.addEventListener("input", function () { cond.col = this.value; });
            var opSel = el("select"); opSel.className = "dsb-sqb-inp"; opSel.style.cssText = "flex:0 0 auto;width:96px";
            mkOpts(opSel, [["=","="],["<>","≠"],["<","<"],["<=","≤"],[">=","≥"],[">",">"],["LIKE","LIKE"],["IS NULL","IS NULL"],["IS NOT NULL","IS NOT NULL"]], cond.op);
            opSel.addEventListener("change", function () { cond.op = this.value; renderBody(); });
            row.appendChild(cInp); row.appendChild(opSel);
            if (cond.op !== "IS NULL" && cond.op !== "IS NOT NULL") {
              var vInp = el("input"); vInp.className = "dsb-sqb-inp"; vInp.value = cond.val; vInp.placeholder = "value"; vInp.style.fontFamily = "var(--mono)";
              vInp.addEventListener("input", function () { cond.val = this.value; });
              row.appendChild(vInp);
            }
            var rm = el("button", "rm"); rm.type = "button"; rm.style.color = "var(--bad)"; rm.title = "Remove condition"; rm.setAttribute("aria-label", "Remove condition");
            rm.appendChild(Studio.icon("close", 10)); rm.onclick = function () { sbState.conditions.splice(i, 1); renderBody(); };
            row.appendChild(rm); body.appendChild(row);
          });

          // G1c — GROUP BY column chips (chip-based, same pattern as SELECT columns)
          var rGroup = el("div", "dsb-sqb-row");
          var lGroup = el("span", "dsb-sqb-lbl"); lGroup.textContent = "GROUP BY";
          body.appendChild(rGroup); rGroup.appendChild(lGroup);
          var gBox = el("div", "dsb-sqb-colbox");
          sbState.groupBy.forEach(function (c, i) {
            var chip = el("span", "dsb-chip"); chip.textContent = c;
            var rm = el("button", "rm"); rm.type = "button"; rm.title = "Remove group-by column"; rm.setAttribute("aria-label", "Remove group-by column"); rm.appendChild(Studio.icon("close", 10));
            rm.onclick = function () { sbState.groupBy.splice(i, 1); renderBody(); };
            chip.appendChild(rm); gBox.appendChild(chip);
          });
          var gAddIn = el("input"); gAddIn.placeholder = "column + Enter"; gAddIn.className = "dsb-sqb-inp";
          gAddIn.style.cssText = "font-family:var(--mono);flex:none;width:140px";
          gAddIn.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { var v = this.value.trim().replace(/[^a-zA-Z0-9_.]+/g, ""); if (v && sbState.groupBy.indexOf(v) < 0) { sbState.groupBy.push(v); this.value = ""; renderBody(); } }
          });
          gBox.appendChild(gAddIn); body.appendChild(gBox);

          // ORDER BY + LIMIT
          var rOrd = el("div", "dsb-sqb-row");
          var lOrd = el("span", "dsb-sqb-lbl"); lOrd.textContent = "ORDER BY";
          var oInp = el("input"); oInp.className = "dsb-sqb-inp"; oInp.value = sbState.orderBy; oInp.placeholder = "column"; oInp.style.fontFamily = "var(--mono)";
          oInp.addEventListener("input", function () { sbState.orderBy = this.value; });
          var dirSel = el("select"); dirSel.className = "dsb-sqb-inp"; dirSel.style.cssText = "flex:0 0 auto;width:72px";
          mkOpts(dirSel, [["ASC", "ASC"], ["DESC", "DESC"]], sbState.orderDir);
          dirSel.addEventListener("change", function () { sbState.orderDir = this.value; });
          var lLim = el("span", "dsb-sqb-lbl"); lLim.textContent = "LIMIT"; lLim.style.marginLeft = "12px";
          var limInp = el("input"); limInp.type = "number"; limInp.min = "1"; limInp.className = "dsb-sqb-inp";
          limInp.value = sbState.limit; limInp.placeholder = "100"; limInp.style.cssText = "flex:0 0 auto;width:68px";
          limInp.addEventListener("input", function () { sbState.limit = this.value; });
          rOrd.appendChild(lOrd); rOrd.appendChild(oInp); rOrd.appendChild(dirSel); rOrd.appendChild(lLim); rOrd.appendChild(limInp);
          body.appendChild(rOrd);

          // Generate SQL button
          var rGen = el("div", "dsb-sqb-row dsb-sqb-gen-row");
          var genBtn = el("button", "btn"); genBtn.type = "button";
          genBtn.className = "btn sqb-gen-btn";
          setIconBtn(genBtn, "play", "Generate SQL");
          genBtn.style.cssText = "color:var(--pentaho);border-color:color-mix(in srgb,var(--pentaho) 45%,transparent);font-size:12px;padding:5px 14px";
          genBtn.onclick = buildSQL;
          rGen.appendChild(genBtn); body.appendChild(rGen);
        }

        function buildSQL() {
          var t = sbState.table;
          if (!t) { toast("Enter a FROM table first.", true); return; }
          var lines = [];

          // Build SELECT: regular columns + G1c aggregate expressions
          var validAggs = sbState.aggCols.filter(function (a) { return a.col.trim(); });
          if (sbState.allCols && !validAggs.length) {
            lines.push("SELECT *");
          } else {
            var parts = [];
            if (!sbState.allCols) {
              if (!sbState.selCols.length && !validAggs.length) { toast("Add columns or choose All (*).", true); return; }
              sbState.selCols.forEach(function (c) { parts.push(c + " AS " + c); });
            }
            // Aggregate expressions: COUNT DISTINCT wraps in COUNT(DISTINCT col); others are fn(col)
            validAggs.forEach(function (a) {
              var expr = a.fn === "COUNT_DISTINCT"
                ? "COUNT(DISTINCT " + a.col.trim() + ")"
                : a.fn + "(" + a.col.trim() + ")";
              var alias = a.alias.trim() || (a.fn.toLowerCase().replace("_distinct", "") + "_" + a.col.trim().replace(/[^a-z0-9_]/gi, "_"));
              parts.push(expr + " AS " + alias);
            });
            if (!parts.length) { lines.push("SELECT *"); }
            else {
              lines.push("SELECT " + parts[0]);
              parts.slice(1).forEach(function (p) { lines.push("     , " + p); });
            }
          }

          lines.push("FROM   " + t);

          // G1b — JOIN clauses (skip joins with no table)
          sbState.joins.filter(function (j) { return j.table.trim(); }).forEach(function (j) {
            var jl = j.type + " JOIN " + j.table.trim();
            if (j.on.trim()) jl += "\n  ON   " + j.on.trim();
            lines.push(jl);
          });

          // WHERE conditions
          var wheres = sbState.conditions.filter(function (c) { return c.col.trim(); });
          if (wheres.length) {
            lines.push("WHERE  " + fmtCond(wheres[0]));
            wheres.slice(1).forEach(function (c) { lines.push("  AND  " + fmtCond(c)); });
          }

          // G1c — GROUP BY
          if (sbState.groupBy.length) {
            lines.push("GROUP BY " + sbState.groupBy.join(", "));
          }

          if (sbState.orderBy.trim()) lines.push("ORDER BY " + sbState.orderBy.trim() + " " + sbState.orderDir);
          if (sbState.limit && parseInt(sbState.limit, 10) > 0) lines.push("LIMIT  " + parseInt(sbState.limit, 10));
          var sql = lines.join("\n");
          draft.query = sql;
          qTa.value = sql; qTa.dispatchEvent(new Event("input", { bubbles: true }));
          toast("SQL generated — review and edit above.");
        }

        function fmtCond(c) {
          var op = c.op.trim();
          if (op === "IS NULL" || op === "IS NOT NULL") return c.col.trim() + " " + op;
          var isNum = c.val.trim() && /^-?\d+(\.\d+)?$/.test(c.val.trim());
          return c.col.trim() + " " + op + " " + (isNum ? c.val.trim() : "'" + c.val.replace(/'/g, "''") + "'");
        }

        var isOpen = false;
        tog.onclick = function () {
          isOpen = !isOpen; body.hidden = !isOpen; tog.classList.toggle("open", isOpen);
          if (isOpen) renderBody();
        };
        sqb.appendChild(tog); sqb.appendChild(body);
        return sqb;
      }

      // G2 — Visual KTR Builder: constructs a minimal Kettle .ktr transform step graph and exports XML.
      // Pipeline: Table Input → [Select Values (if cols specified)] → Output (Dummy step).
      function renderKTRBuilder(draft) {
        var kbState = { table: "", selCols: [], conditions: [], stepName: draft.ktrStep || "Output", jndi: draft.jndi || "", generatedXml: "" };
        var ktrb = el("div", "dsb-ktrb");
        var tog = el("button", "dsb-sqb-tog"); tog.type = "button";
        var togL = el("span", "dsb-sqb-tog-l");
        togL.appendChild(Studio.icon("gear", 13));
        var togTx = el("span"); togTx.textContent = " KTR Builder "; togTx.style.cssText = "font-size:12px;font-weight:700;color:inherit";
        var togHint = el("span"); togHint.style.cssText = "font-size:10.5px;color:var(--faint);font-weight:400";
        togHint.textContent = "generate a minimal .ktr transform visually";
        togL.appendChild(togTx); togL.appendChild(togHint);
        var caret = el("span", "sqb-caret");
        caret.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 5 8 10 13 5"/></svg>';
        tog.appendChild(togL); tog.appendChild(caret);
        var kbBody = el("div", "dsb-sqb-body"); kbBody.hidden = true;

        function mkOpts(sel, pairs, val) {
          pairs.forEach(function (p) { var o = el("option"); o.value = p[0]; o.textContent = p[1]; if (p[0] === val) o.selected = true; sel.appendChild(o); });
          return sel;
        }

        function renderBody() {
          kbBody.innerHTML = "";

          // Pipeline diagram
          var pipeRow = el("div"); pipeRow.style.cssText = "display:flex;align-items:center;gap:5px;margin-bottom:10px;flex-wrap:wrap";
          function stepPill(label, active) {
            var s = el("span"); s.textContent = label;
            s.style.cssText = "font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:4px;" + (active ? "background:var(--pentaho);color:#fff" : "background:var(--hover-bg,#eee);border:1px solid var(--border);color:var(--fg)");
            return s;
          }
          function arw() { var a = el("span"); a.textContent = "→"; a.style.cssText = "color:var(--faint);font-size:11px"; return a; }
          pipeRow.appendChild(stepPill("Table Input", true));
          pipeRow.appendChild(arw());
          pipeRow.appendChild(stepPill("Select Values", kbState.selCols.length > 0));
          pipeRow.appendChild(arw());
          pipeRow.appendChild(stepPill("Output (Dummy)", false));
          kbBody.appendChild(pipeRow);

          // FROM table
          var rFrom = el("div", "dsb-sqb-row");
          var lFrom = el("span", "dsb-sqb-lbl"); lFrom.textContent = "FROM";
          var iTable = el("input"); iTable.className = "dsb-sqb-inp"; iTable.value = kbState.table;
          iTable.placeholder = "schema.table_name"; iTable.style.fontFamily = "var(--mono)";
          iTable.addEventListener("input", function () { kbState.table = this.value.trim(); });
          rFrom.appendChild(lFrom); rFrom.appendChild(iTable); kbBody.appendChild(rFrom);

          // JNDI connection
          var rJndi = el("div", "dsb-sqb-row");
          var lJndi = el("span", "dsb-sqb-lbl"); lJndi.textContent = "JNDI";
          var iJndi = el("input"); iJndi.className = "dsb-sqb-inp"; iJndi.value = kbState.jndi;
          iJndi.placeholder = "PDC-BIDB-EXT"; iJndi.style.fontFamily = "var(--mono)";
          iJndi.addEventListener("input", function () { kbState.jndi = this.value.trim(); });
          rJndi.appendChild(lJndi); rJndi.appendChild(iJndi); kbBody.appendChild(rJndi);

          // SELECT columns (chip-based; blank = SELECT *)
          var rSel = el("div", "dsb-sqb-row");
          var lSel = el("span", "dsb-sqb-lbl"); lSel.textContent = "SELECT";
          var selHint = el("span"); selHint.style.cssText = "font-size:10.5px;color:var(--faint)"; selHint.textContent = "leave blank for all (*)";
          rSel.appendChild(lSel); rSel.appendChild(selHint); kbBody.appendChild(rSel);
          var colBox = el("div", "dsb-sqb-colbox");
          kbState.selCols.forEach(function (c, i) {
            var chip = el("span", "dsb-chip"); chip.textContent = c;
            var rm = el("button", "rm"); rm.type = "button"; rm.title = "Remove column"; rm.setAttribute("aria-label", "Remove column"); rm.appendChild(Studio.icon("close", 10));
            rm.onclick = function () { kbState.selCols.splice(i, 1); renderBody(); };
            chip.appendChild(rm); colBox.appendChild(chip);
          });
          var addIn = el("input"); addIn.placeholder = "column + Enter"; addIn.className = "dsb-sqb-inp";
          addIn.style.cssText = "font-family:var(--mono);flex:none;width:140px";
          addIn.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { var v = this.value.trim().replace(/[^a-zA-Z0-9_.]+/g, ""); if (v && kbState.selCols.indexOf(v) < 0) { kbState.selCols.push(v); this.value = ""; renderBody(); } }
          });
          colBox.appendChild(addIn); kbBody.appendChild(colBox);

          // WHERE conditions
          var rWhere = el("div", "dsb-sqb-row");
          var lWhere = el("span", "dsb-sqb-lbl"); lWhere.textContent = "WHERE";
          var addCond = el("button", "dsb-mini"); addCond.type = "button";
          setIconBtn(addCond, "plus", "Add condition", 11);
          addCond.onclick = function () { kbState.conditions.push({ col: "", op: "=", val: "" }); renderBody(); };
          rWhere.appendChild(lWhere); rWhere.appendChild(addCond); kbBody.appendChild(rWhere);
          kbState.conditions.forEach(function (cond, i) {
            var row = el("div", "dsb-sqb-row dsb-sqb-indent");
            var cInp = el("input"); cInp.className = "dsb-sqb-inp"; cInp.value = cond.col; cInp.placeholder = "column"; cInp.style.fontFamily = "var(--mono)";
            cInp.addEventListener("input", function () { cond.col = this.value; });
            var opSel = el("select"); opSel.className = "dsb-sqb-inp"; opSel.style.cssText = "flex:0 0 auto;width:96px";
            mkOpts(opSel, [["=","="],["<>","≠"],["<","<"],["<=","≤"],[">=","≥"],[">",">"],["LIKE","LIKE"],["IS NULL","IS NULL"],["IS NOT NULL","IS NOT NULL"]], cond.op);
            opSel.addEventListener("change", function () { cond.op = this.value; renderBody(); });
            row.appendChild(cInp); row.appendChild(opSel);
            if (cond.op !== "IS NULL" && cond.op !== "IS NOT NULL") {
              var vInp = el("input"); vInp.className = "dsb-sqb-inp"; vInp.value = cond.val; vInp.placeholder = "value"; vInp.style.fontFamily = "var(--mono)";
              vInp.addEventListener("input", function () { cond.val = this.value; });
              row.appendChild(vInp);
            }
            var rm = el("button", "rm"); rm.type = "button"; rm.style.color = "var(--bad)"; rm.title = "Remove condition"; rm.setAttribute("aria-label", "Remove condition");
            rm.appendChild(Studio.icon("close", 10)); rm.onclick = function () { kbState.conditions.splice(i, 1); renderBody(); };
            row.appendChild(rm); kbBody.appendChild(row);
          });

          // Output step name
          var rOut = el("div", "dsb-sqb-row");
          var lOut = el("span", "dsb-sqb-lbl"); lOut.textContent = "OUTPUT";
          var outInp = el("input"); outInp.className = "dsb-sqb-inp"; outInp.value = kbState.stepName;
          outInp.placeholder = "Output"; outInp.style.cssText = "flex:0 0 auto;width:130px";
          outInp.addEventListener("input", function () { kbState.stepName = this.value.trim() || "Output"; draft.ktrStep = kbState.stepName; });
          var outHint = el("span"); outHint.style.cssText = "font-size:10.5px;color:var(--faint)"; outHint.textContent = "referenced by the 'Output step name' field above";
          rOut.appendChild(lOut); rOut.appendChild(outInp); rOut.appendChild(outHint); kbBody.appendChild(rOut);

          // Generate .ktr button
          var rGen = el("div", "dsb-sqb-row dsb-sqb-gen-row");
          var genBtn = el("button", "btn sqb-gen-btn ktrb-gen-btn"); genBtn.type = "button";
          setIconBtn(genBtn, "play", "Generate .ktr");
          genBtn.style.cssText = "color:var(--pentaho);border-color:color-mix(in srgb,var(--pentaho) 45%,transparent);font-size:12px;padding:5px 14px";
          genBtn.onclick = function () { var xml = buildKTR(); if (!xml) return; kbState.generatedXml = xml; renderBody(); toast(".ktr generated — download and deploy to Pentaho."); };
          rGen.appendChild(genBtn); kbBody.appendChild(rGen);

          // Show generated XML + download button if available
          if (kbState.generatedXml) {
            var outTa = el("textarea"); outTa.className = "dsb-ktrb-out"; outTa.readOnly = true;
            outTa.spellcheck = false; outTa.rows = 7;
            outTa.style.cssText = "width:100%;font-family:var(--mono);font-size:11px;resize:vertical;margin-top:6px;border:1px solid var(--border);border-radius:4px;padding:6px;box-sizing:border-box;background:var(--code-bg,#f4f4f4);color:var(--fg)";
            outTa.value = kbState.generatedXml;
            var dlRow = el("div"); dlRow.style.cssText = "display:flex;gap:8px;margin-top:4px";
            var dlBtn = el("button", "btn"); dlBtn.type = "button"; dlBtn.style.cssText = "font-size:11px;padding:4px 10px";
            setIconBtn(dlBtn, "download", "Download .ktr");
            dlBtn.onclick = function () { download((kbState.stepName || "transform") + ".ktr", kbState.generatedXml, "application/xml"); };
            dlRow.appendChild(dlBtn); kbBody.appendChild(outTa); kbBody.appendChild(dlRow);
          }
        }

        function escXml(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
        function fmtKtrCond(c) {
          var op = c.op.trim();
          if (op === "IS NULL" || op === "IS NOT NULL") return c.col.trim() + " " + op;
          var isNum = c.val.trim() && /^-?\d+(\.\d+)?$/.test(c.val.trim());
          return c.col.trim() + " " + op + " " + (isNum ? c.val.trim() : "'" + c.val.replace(/'/g, "''") + "'");
        }

        function buildKTR() {
          var table = kbState.table.trim();
          if (!table) { toast("Enter a FROM table first.", true); return null; }
          var stepName = kbState.stepName || "Output";
          var jndi = kbState.jndi || (draft.jndi || "");
          var hasSelect = kbState.selCols.length > 0;
          var cols = hasSelect ? kbState.selCols.join(", ") : "*";
          var sqlLines = ["SELECT " + cols, "FROM   " + table];
          var wheres = kbState.conditions.filter(function (c) { return c.col.trim(); });
          if (wheres.length) {
            sqlLines.push("WHERE  " + fmtKtrCond(wheres[0]));
            wheres.slice(1).forEach(function (c) { sqlLines.push("  AND  " + fmtKtrCond(c)); });
          }
          var sql = sqlLines.join("\n");
          var xLocs = hasSelect ? ["100", "300", "500"] : ["100", "300"];
          var lines = ['<?xml version="1.0" encoding="UTF-8"?>'];
          lines.push("<transformation>");
          lines.push("  <info><name>" + escXml(stepName) + "</name><description/></info>");
          lines.push("  <step>");
          lines.push("    <name>Table input</name><type>TableInput</type><copies>1</copies>");
          if (jndi) lines.push("    <connection>" + escXml(jndi) + "</connection>");
          lines.push("    <sql>" + escXml(sql) + "</sql>");
          lines.push("    <limit>0</limit><execute_each_row>N</execute_each_row>");
          lines.push("    <GUI><xloc>" + xLocs[0] + "</xloc><yloc>100</yloc><draw>Y</draw></GUI>");
          lines.push("  </step>");
          if (hasSelect) {
            lines.push("  <step>");
            lines.push("    <name>Select values</name><type>SelectValues</type><copies>1</copies>");
            lines.push("    <fields>");
            kbState.selCols.forEach(function (c) { lines.push("      <field><name>" + escXml(c) + "</name><rename/><length>-2</length><precision>-2</precision></field>"); });
            lines.push("    </fields><select_unspecified>N</select_unspecified>");
            lines.push("    <GUI><xloc>" + xLocs[1] + "</xloc><yloc>100</yloc><draw>Y</draw></GUI>");
            lines.push("  </step>");
          }
          lines.push("  <step>");
          lines.push("    <name>" + escXml(stepName) + "</name><type>Dummy</type><copies>1</copies>");
          lines.push("    <GUI><xloc>" + xLocs[hasSelect ? 2 : 1] + "</xloc><yloc>100</yloc><draw>Y</draw></GUI>");
          lines.push("  </step>");
          lines.push("  <order>");
          if (hasSelect) {
            lines.push("    <hop><from>Table input</from><to>Select values</to><enabled>Y</enabled></hop>");
            lines.push("    <hop><from>Select values</from><to>" + escXml(stepName) + "</to><enabled>Y</enabled></hop>");
          } else {
            lines.push("    <hop><from>Table input</from><to>" + escXml(stepName) + "</to><enabled>Y</enabled></hop>");
          }
          lines.push("  </order>");
          lines.push("</transformation>");
          return lines.join("\n");
        }

        var isKtrOpen = false;
        tog.onclick = function () {
          isKtrOpen = !isKtrOpen; kbBody.hidden = !isKtrOpen; tog.classList.toggle("open", isKtrOpen);
          if (isKtrOpen) renderBody();
        };
        ktrb.appendChild(tog); ktrb.appendChild(kbBody);
        return ktrb;
      }

      function renderQSection() {
        qSection.innerHTML = "";
        var k = draft.kind;
        connF.style.display = (k === "duckdb" || k === "httpvfs" || k === "snowflake" || k === "databricks" || k === "bigquery" || k === "http") ? "none" : ""; // JNDI doesn't apply to these direct connectors
        if (k === "httpvfs") {
          // Z14 slice 3 — SQLite-WASM + HTTP-VFS: query a remote .sqlite file over HTTP Range
          // Requests, no backend/proxy/credentials. Test connection lazy-loads the engine, lists
          // tables, and runs PRAGMA table_info on the chosen (or first) table.
          qSection.appendChild(field("File URL", input(draft.fileUrl, function (v) { draft.fileUrl = v.trim(); }, "https://your-bucket.s3.amazonaws.com/data.sqlite")));
          qSection.appendChild(field("Table name (optional — auto-detected if blank)", input(draft.tableName, function (v) { draft.tableName = v.trim(); })));
          var slStatus = el("div", "hint dsb-sqlite-status");
          slStatus.textContent = "Runs entirely in your browser via SQLite-WASM — HTTP Range Requests pull only the indexed pages a query needs. No credentials, no proxy, no server.";
          qSection.appendChild(slStatus);
          var slTestBtn = el("button", "dsb-mini dsb-sqlite-test"); slTestBtn.style.marginTop = "8px";
          setIconBtn(slTestBtn, "refresh", "Test connection & detect columns", 12);
          slTestBtn.onclick = function () {
            if (!draft.fileUrl) { toast("Enter a file URL first.", true); return; }
            slTestBtn.disabled = true; slTestBtn.textContent = "Testing…"; window.__sqliteTestState = "testing";
            slStatus.textContent = "Loading the SQLite engine + probing the file…";
            Studio.SQLiteHttp.testConnection({ fileUrl: draft.fileUrl, tableName: draft.tableName }).then(function (res) {
              if (!res.ok) {
                slTestBtn.disabled = false; setIconBtn(slTestBtn, "refresh", "Test connection & detect columns", 12);
                slStatus.textContent = "✗ " + res.error; window.__sqliteTestState = "done";
                toast("SQLite test failed — " + res.error, true);
                return;
              }
              draft.tableName = res.table;
              res.columns.forEach(function (c) { if (draft.columns.indexOf(c.name) < 0) draft.columns.push(c.name); });
              if (!draft.query.trim()) { draft.query = "SELECT * FROM " + res.table + "\nLIMIT  200"; slTa.value = draft.query; }
              renderCols(); renderPreview();
              slTestBtn.disabled = false; setIconBtn(slTestBtn, "refresh", "Test connection & detect columns", 12);
              slStatus.textContent = "✓ table “" + res.table + "” — " + res.columns.length + " column" + (res.columns.length === 1 ? "" : "s") + " detected: " +
                res.columns.map(function (c) { return c.name + " (" + c.type + ")"; }).join(", ");
              window.__sqliteTestState = "done";
              toast(res.columns.length + " column(s) detected from the live file.");
            });
          };
          qSection.appendChild(slTestBtn);
          var slT = dsType("httpvfs");
          var slTa = textarea(draft.query, function (v) { draft.query = v; });
          slTa.className = "dsb-query"; slTa.spellcheck = false; slTa.placeholder = slT.ph;
          var slQF = el("div", "field");
          slQF.appendChild(labelEl("Query (optional — runs against the opened database)"));
          slQF.appendChild(slTa);
          qSection.appendChild(slQF);
          detectBtn.style.display = "none";
        } else if (k === "duckdb") {
          // Z14 slice 1 — DuckDB-Wasm: query a remote Parquet/CSV file over HTTP Range Requests,
          // no backend/proxy/credentials. Test connection lazy-loads the engine + runs DESCRIBE.
          qSection.appendChild(field("File URL", input(draft.fileUrl, function (v) { draft.fileUrl = v.trim(); }, "https://your-bucket.s3.amazonaws.com/data.parquet")));
          qSection.appendChild(field("Format", select2pairs([["auto", "Auto-detect (by extension)"], ["parquet", "Parquet"], ["csv", "CSV"]], draft.fileFormat, function (v) { draft.fileFormat = v; })));
          var dkStatus = el("div", "hint dsb-duckdb-status");
          dkStatus.textContent = "Runs entirely in your browser via DuckDB-Wasm — HTTP Range Requests pull only the bytes a query needs. No credentials, no proxy, no server.";
          qSection.appendChild(dkStatus);
          var dkTestBtn = el("button", "dsb-mini dsb-duckdb-test"); dkTestBtn.style.marginTop = "8px";
          setIconBtn(dkTestBtn, "refresh", "Test connection & detect columns", 12);
          dkTestBtn.onclick = function () {
            if (!draft.fileUrl) { toast("Enter a file URL first.", true); return; }
            dkTestBtn.disabled = true; dkTestBtn.textContent = "Testing…"; window.__duckdbTestState = "testing";
            dkStatus.textContent = "Loading the DuckDB engine + probing the file…";
            Studio.DuckDB.testConnection({ fileUrl: draft.fileUrl, fileFormat: draft.fileFormat }).then(function (res) {
              if (!res.ok) {
                dkTestBtn.disabled = false; setIconBtn(dkTestBtn, "refresh", "Test connection & detect columns", 12);
                dkStatus.textContent = "✗ " + res.error; window.__duckdbTestState = "done";
                toast("DuckDB test failed — " + res.error, true);
                return;
              }
              res.columns.forEach(function (c) { if (draft.columns.indexOf(c.name) < 0) draft.columns.push(c.name); });
              if (!draft.query.trim()) { draft.query = "SELECT * FROM t\nLIMIT  200"; dkTa.value = draft.query; }
              renderCols(); renderPreview();
              dkTestBtn.disabled = false; setIconBtn(dkTestBtn, "refresh", "Test connection & detect columns", 12);
              dkStatus.textContent = "✓ " + res.columns.length + " column" + (res.columns.length === 1 ? "" : "s") + " detected: " +
                res.columns.map(function (c) { return c.name + " (" + c.type + ")"; }).join(", ");
              window.__duckdbTestState = "done";
              toast(res.columns.length + " column(s) detected from the live file.");
            });
          };
          qSection.appendChild(dkTestBtn);
          var dkT = dsType("duckdb");
          var dkTa = textarea(draft.query, function (v) { draft.query = v; });
          dkTa.className = "dsb-query"; dkTa.spellcheck = false; dkTa.placeholder = dkT.ph;
          var dkQF = el("div", "field");
          dkQF.appendChild(labelEl("Query (optional — runs against the file, aliased as “t”)"));
          dkQF.appendChild(dkTa);
          qSection.appendChild(dkQF);
          detectBtn.style.display = "none";
        } else if (k === "snowflake") {
          // Z4 slice 1 — Snowflake SQL API v2: needs an account identifier + access token (never
          // a password) and, unlike the Z14 file connectors, the target account must explicitly
          // allow this origin (ALLOWED_HTTP_ORIGINS network policy) or every call fails on CORS.
          qSection.appendChild(field("Account identifier", input(draft.sfAccount, function (v) { draft.sfAccount = v.trim(); }, "xy12345.us-east-1")));
          var sfRow1 = el("div", "field row");
          sfRow1.appendChild(field("Access token", input(draft.sfToken, function (v) { draft.sfToken = v.trim(); }, "Programmatic Access Token or OAuth token")));
          sfRow1.appendChild(field("Token type", select2pairs([["PROGRAMMATIC_ACCESS_TOKEN", "Programmatic Access Token"], ["OAUTH", "OAuth"]], draft.sfTokenType, function (v) { draft.sfTokenType = v; })));
          qSection.appendChild(sfRow1);
          var sfRow2 = el("div", "field row");
          sfRow2.appendChild(field("Warehouse", input(draft.sfWarehouse, function (v) { draft.sfWarehouse = v.trim(); }, "COMPUTE_WH")));
          sfRow2.appendChild(field("Database", input(draft.sfDatabase, function (v) { draft.sfDatabase = v.trim(); }, "ANALYTICS")));
          sfRow2.appendChild(field("Schema", input(draft.sfSchema, function (v) { draft.sfSchema = v.trim(); }, "PUBLIC")));
          qSection.appendChild(sfRow2);
          qSection.appendChild(field("Role (optional)", input(draft.sfRole, function (v) { draft.sfRole = v.trim(); }, "ANALYST")));
          var sfStatus = el("div", "hint dsb-snowflake-status");
          sfStatus.textContent = "Calls the Snowflake SQL API directly from your browser — the account must allow this origin via its ALLOWED_HTTP_ORIGINS network policy or requests are blocked by CORS. Uses a token only, never your Snowflake password.";
          qSection.appendChild(sfStatus);
          var sfTestBtn = el("button", "dsb-mini dsb-snowflake-test"); sfTestBtn.style.marginTop = "8px";
          setIconBtn(sfTestBtn, "refresh", "Test connection & detect columns", 12);
          sfTestBtn.onclick = function () {
            if (!draft.sfAccount || !draft.sfToken) { toast("Enter an account identifier and access token first.", true); return; }
            sfTestBtn.disabled = true; sfTestBtn.textContent = "Testing…"; window.__snowflakeTestState = "testing";
            sfStatus.textContent = "Calling the Snowflake SQL API…";
            Studio.Snowflake.testConnection(sfCfg(draft)).then(function (res) {
              window.__snowflakeTestState = "done";
              if (!res.ok) {
                sfTestBtn.disabled = false; setIconBtn(sfTestBtn, "refresh", "Test connection & detect columns", 12);
                sfStatus.textContent = "✗ " + res.error;
                toast("Snowflake test failed — " + res.error, true);
                return;
              }
              res.columns.forEach(function (c) { if (draft.columns.indexOf(c.name) < 0) draft.columns.push(c.name); });
              if (!draft.query.trim()) { draft.query = "SELECT region,\n       SUM(revenue) AS revenue\nFROM   sales\nGROUP  BY region"; sfTa.value = draft.query; }
              renderCols(); renderPreview();
              sfTestBtn.disabled = false; setIconBtn(sfTestBtn, "refresh", "Test connection & detect columns", 12);
              sfStatus.textContent = "✓ connected — " + res.columns.length + " column" + (res.columns.length === 1 ? "" : "s") + " detected: " +
                res.columns.map(function (c) { return c.name + " (" + c.type + ")"; }).join(", ");
              toast(res.columns.length + " column(s) detected from the live warehouse.");
            });
          };
          qSection.appendChild(sfTestBtn);
          var sfT = dsType("snowflake");
          var sfTa = textarea(draft.query, function (v) { draft.query = v; });
          sfTa.className = "dsb-query"; sfTa.spellcheck = false; sfTa.placeholder = sfT.ph;
          var sfQF = el("div", "field");
          sfQF.appendChild(labelEl("Query"));
          sfQF.appendChild(sfTa);
          qSection.appendChild(sfQF);
          detectBtn.style.display = "none";
        } else if (k === "databricks") {
          // Z4 slice 2 — Databricks Statement Execution API: needs a workspace host + personal
          // access token (never a password) + SQL warehouse id; same credential-based/CORS-gated
          // story as the Z4 slice 1 Snowflake connector above.
          qSection.appendChild(field("Workspace host", input(draft.dbxHost, function (v) { draft.dbxHost = v.trim(); }, "dbc-a1b2c3d4-e5f6.cloud.databricks.com")));
          qSection.appendChild(field("Access token", input(draft.dbxToken, function (v) { draft.dbxToken = v.trim(); }, "Personal access token (dapi…)")));
          qSection.appendChild(field("SQL warehouse id", input(draft.dbxWarehouseId, function (v) { draft.dbxWarehouseId = v.trim(); }, "0123456789abcdef")));
          var dbxRow = el("div", "field row");
          dbxRow.appendChild(field("Catalog (optional)", input(draft.dbxCatalog, function (v) { draft.dbxCatalog = v.trim(); }, "main")));
          dbxRow.appendChild(field("Schema (optional)", input(draft.dbxSchema, function (v) { draft.dbxSchema = v.trim(); }, "default")));
          qSection.appendChild(dbxRow);
          var dbxStatus = el("div", "hint dsb-databricks-status");
          dbxStatus.textContent = "Calls the Databricks Statement Execution API directly from your browser — the workspace must allow this origin or requests are blocked by CORS. Uses a personal access token only, never your Databricks password.";
          qSection.appendChild(dbxStatus);
          var dbxTestBtn = el("button", "dsb-mini dsb-databricks-test"); dbxTestBtn.style.marginTop = "8px";
          setIconBtn(dbxTestBtn, "refresh", "Test connection & detect columns", 12);
          dbxTestBtn.onclick = function () {
            if (!draft.dbxHost || !draft.dbxToken || !draft.dbxWarehouseId) { toast("Enter a workspace host, access token, and SQL warehouse id first.", true); return; }
            dbxTestBtn.disabled = true; dbxTestBtn.textContent = "Testing…"; window.__databricksTestState = "testing";
            dbxStatus.textContent = "Calling the Databricks SQL API…";
            Studio.Databricks.testConnection(dbxCfg(draft)).then(function (res) {
              window.__databricksTestState = "done";
              if (!res.ok) {
                dbxTestBtn.disabled = false; setIconBtn(dbxTestBtn, "refresh", "Test connection & detect columns", 12);
                dbxStatus.textContent = "✗ " + res.error;
                toast("Databricks test failed — " + res.error, true);
                return;
              }
              res.columns.forEach(function (c) { if (draft.columns.indexOf(c.name) < 0) draft.columns.push(c.name); });
              if (!draft.query.trim()) { draft.query = "SELECT region,\n       SUM(revenue) AS revenue\nFROM   sales\nGROUP  BY region"; dbxTa.value = draft.query; }
              renderCols(); renderPreview();
              dbxTestBtn.disabled = false; setIconBtn(dbxTestBtn, "refresh", "Test connection & detect columns", 12);
              dbxStatus.textContent = "✓ connected — " + res.columns.length + " column" + (res.columns.length === 1 ? "" : "s") + " detected: " +
                res.columns.map(function (c) { return c.name + " (" + c.type + ")"; }).join(", ");
              toast(res.columns.length + " column(s) detected from the live warehouse.");
            });
          };
          qSection.appendChild(dbxTestBtn);
          var dbxT = dsType("databricks");
          var dbxTa = textarea(draft.query, function (v) { draft.query = v; });
          dbxTa.className = "dsb-query"; dbxTa.spellcheck = false; dbxTa.placeholder = dbxT.ph;
          var dbxQF = el("div", "field");
          dbxQF.appendChild(labelEl("Query"));
          dbxQF.appendChild(dbxTa);
          qSection.appendChild(dbxQF);
          detectBtn.style.display = "none";
        } else if (k === "bigquery") {
          // Z4 slice 3 — BigQuery jobs.query REST API: needs a project id + OAuth access token
          // (never a service-account key file); Google's API already sends permissive CORS
          // headers for this endpoint, so there's no per-project network-policy step like
          // Snowflake/Databricks — the token itself is the only gate.
          qSection.appendChild(field("Project id", input(draft.bqProject, function (v) { draft.bqProject = v.trim(); }, "my-analytics-project")));
          qSection.appendChild(field("Access token", input(draft.bqToken, function (v) { draft.bqToken = v.trim(); }, "OAuth 2.0 access token")));
          var bqRow = el("div", "field row");
          bqRow.appendChild(field("Location (optional)", input(draft.bqLocation, function (v) { draft.bqLocation = v.trim(); }, "US")));
          bqRow.appendChild(field("Default dataset (optional)", input(draft.bqDataset, function (v) { draft.bqDataset = v.trim(); }, "analytics")));
          qSection.appendChild(bqRow);
          var bqStatus = el("div", "hint dsb-bigquery-status");
          bqStatus.textContent = "Calls the BigQuery jobs.query REST API directly from your browser using a short-lived OAuth access token — never a service-account key file.";
          qSection.appendChild(bqStatus);
          var bqTestBtn = el("button", "dsb-mini dsb-bigquery-test"); bqTestBtn.style.marginTop = "8px";
          setIconBtn(bqTestBtn, "refresh", "Test connection & detect columns", 12);
          bqTestBtn.onclick = function () {
            if (!draft.bqProject || !draft.bqToken) { toast("Enter a project id and access token first.", true); return; }
            bqTestBtn.disabled = true; bqTestBtn.textContent = "Testing…"; window.__bigqueryTestState = "testing";
            bqStatus.textContent = "Calling the BigQuery jobs.query API…";
            Studio.BigQuery.testConnection(bqCfg(draft)).then(function (res) {
              window.__bigqueryTestState = "done";
              if (!res.ok) {
                bqTestBtn.disabled = false; setIconBtn(bqTestBtn, "refresh", "Test connection & detect columns", 12);
                bqStatus.textContent = "✗ " + res.error;
                toast("BigQuery test failed — " + res.error, true);
                return;
              }
              res.columns.forEach(function (c) { if (draft.columns.indexOf(c.name) < 0) draft.columns.push(c.name); });
              if (!draft.query.trim()) { draft.query = "SELECT region,\n       SUM(revenue) AS revenue\nFROM   `dataset.sales`\nGROUP  BY region"; bqTa.value = draft.query; }
              renderCols(); renderPreview();
              bqTestBtn.disabled = false; setIconBtn(bqTestBtn, "refresh", "Test connection & detect columns", 12);
              bqStatus.textContent = "✓ connected — " + res.columns.length + " column" + (res.columns.length === 1 ? "" : "s") + " detected: " +
                res.columns.map(function (c) { return c.name + " (" + c.type + ")"; }).join(", ");
              toast(res.columns.length + " column(s) detected from the live dataset.");
            });
          };
          qSection.appendChild(bqTestBtn);
          var bqT = dsType("bigquery");
          var bqTa = textarea(draft.query, function (v) { draft.query = v; });
          bqTa.className = "dsb-query"; bqTa.spellcheck = false; bqTa.placeholder = bqT.ph;
          var bqQF = el("div", "field");
          bqQF.appendChild(labelEl("Query"));
          bqQF.appendChild(bqTa);
          qSection.appendChild(bqQF);
          detectBtn.style.display = "none";
        } else if (k === "http") {
          // Z4 slice 4 — Generic SQL/HTTP: any JSON API that accepts a SQL string and answers with
          // rows, no backend/proxy. The escape hatch for in-house query services / providers not
          // yet covered by a named connector; no per-account CORS story since it's your own endpoint.
          qSection.appendChild(field("Endpoint URL", input(draft.httpUrl, function (v) { draft.httpUrl = v.trim(); }, "https://api.example.com/query")));
          var httpRow = el("div", "field row");
          httpRow.appendChild(field("Method", select2pairs([["POST", "POST (JSON body)"], ["GET", "GET (query string)"]], draft.httpMethod, function (v) { draft.httpMethod = v; })));
          httpRow.appendChild(field("Param name", input(draft.httpParamName, function (v) { draft.httpParamName = v.trim() || "sql"; }, "sql")));
          qSection.appendChild(httpRow);
          qSection.appendChild(field("Auth header (optional)", input(draft.httpAuthHeader, function (v) { draft.httpAuthHeader = v.trim(); }, "Bearer …")));
          var httpStatus = el("div", "hint dsb-http-status");
          httpStatus.textContent = "Sends the SQL as JSON ({\"" + "sql\": \"…\"}) or a query-string param directly from your browser. Expects the response as an array of row objects, {data:[...]}, or {columns,rows}.";
          qSection.appendChild(httpStatus);
          var httpTestBtn = el("button", "dsb-mini dsb-http-test"); httpTestBtn.style.marginTop = "8px";
          setIconBtn(httpTestBtn, "refresh", "Test connection & detect columns", 12);
          httpTestBtn.onclick = function () {
            if (!draft.httpUrl) { toast("Enter an endpoint URL first.", true); return; }
            httpTestBtn.disabled = true; httpTestBtn.textContent = "Testing…"; window.__httpTestState = "testing";
            httpStatus.textContent = "Calling the endpoint…";
            Studio.GenericSql.testConnection(httpCfg(draft)).then(function (res) {
              window.__httpTestState = "done";
              if (!res.ok) {
                httpTestBtn.disabled = false; setIconBtn(httpTestBtn, "refresh", "Test connection & detect columns", 12);
                httpStatus.textContent = "✗ " + res.error;
                toast("Endpoint test failed — " + res.error, true);
                return;
              }
              res.columns.forEach(function (c) { if (draft.columns.indexOf(c.name) < 0) draft.columns.push(c.name); });
              if (!draft.query.trim()) { draft.query = "SELECT region,\n       SUM(revenue) AS revenue\nFROM   sales\nGROUP  BY region"; httpTa.value = draft.query; }
              renderCols(); renderPreview();
              httpTestBtn.disabled = false; setIconBtn(httpTestBtn, "refresh", "Test connection & detect columns", 12);
              httpStatus.textContent = "✓ connected — " + res.columns.length + " column" + (res.columns.length === 1 ? "" : "s") + " detected: " +
                res.columns.map(function (c) { return c.name + " (" + c.type + ")"; }).join(", ");
              toast(res.columns.length + " column(s) detected from the live endpoint.");
            });
          };
          qSection.appendChild(httpTestBtn);
          var httpT = dsType("http");
          var httpTa = textarea(draft.query, function (v) { draft.query = v; });
          httpTa.className = "dsb-query"; httpTa.spellcheck = false; httpTa.placeholder = httpT.ph;
          var httpQF = el("div", "field");
          httpQF.appendChild(labelEl("Query"));
          httpQF.appendChild(httpTa);
          qSection.appendChild(httpQF);
          detectBtn.style.display = "none";
        } else if (k === "kettle") {
          qSection.appendChild(field("Transformation file (.ktr)", input(draft.ktrPath, function (v) { draft.ktrPath = v; }, "/public/etl/my-transform.ktr")));
          qSection.appendChild(field("Output step name", input(draft.ktrStep, function (v) { draft.ktrStep = v; }, "Output")));
          var kh = el("div", "hint"); kh.textContent = "Columns come from the step's output fields — declare them in the Columns section below."; qSection.appendChild(kh);
          // G2: visual KTR Builder accordion — generates a minimal .ktr and shows it for download
          qSection.appendChild(renderKTRBuilder(draft));
          /* G3 — Import an existing .ktr: pick the file, inspect its steps, click a step name to
             set it as the output step. Stores parsed data in draft._ktrImported so it survives
             re-renders (renderQSection() is called after parsing to refresh the step chips). */
          var kImpInput = el("input"); kImpInput.type = "file"; kImpInput.accept = ".ktr,.xml"; kImpInput.style.display = "none";
          var kImpBtn = el("button", "dsb-mini"); kImpBtn.style.marginTop = "8px";
          setIconBtn(kImpBtn, "upload", "Import .ktr…", 12);
          kImpBtn.onclick = function () { kImpInput.click(); };
          kImpInput.onchange = function () {
            var file = kImpInput.files[0]; if (!file) return;
            var reader = new FileReader();
            reader.onload = function (e) {
              draft._ktrImported = Studio.parseKtr(e.target.result);
              if (!draft.ktrPath) draft.ktrPath = "/public/etl/" + file.name;
              renderQSection();
            };
            reader.readAsText(file);
          };
          qSection.appendChild(kImpBtn);
          qSection.appendChild(kImpInput);
          if (draft._ktrImported && draft._ktrImported.steps.length) {
            var imp = el("div", "ktr-imp-box");
            var impHd = el("div", "hint"); impHd.textContent = "✓ Loaded “" + (draft._ktrImported.name || "transform") + "” — click a step to use as output:"; imp.appendChild(impHd);
            var impChips = el("div", "ktr-imp-chips");
            draft._ktrImported.steps.forEach(function (s) {
              var chip = el("button", "ktr-imp-chip" + (draft.ktrStep === s.name ? " sel" : ""));
              chip.textContent = s.name;
              chip.title = s.type;
              chip.onclick = function () { draft.ktrStep = s.name; renderQSection(); };
              impChips.appendChild(chip);
            });
            imp.appendChild(impChips);
            qSection.appendChild(imp);
          }
          detectBtn.style.display = "none";
        } else {
          var t = dsType(k);
          var qH = el("div", "hint");
          if (k === "mdx") {
            qSection.appendChild(field("Schema catalog path", input(draft.mdxCatalog, function (v) { draft.mdxCatalog = v; }, "/pentaho/etc/mondrian/schema.xml")));
            qH.textContent = "Use NON EMPTY to filter empty cells; cube name must match the Mondrian schema file.";
          } else if (k === "mql") {
            qSection.appendChild(field("Domain ID", input(draft.mqlDomain, function (v) { draft.mqlDomain = v; }, "SteelWheels")));
            qH.textContent = "Domain ID from Pentaho Metadata; leave query blank for all-rows DAs.";
          } else if (k === "scripting") {
            var langs = [["javascript","JavaScript"],["beanshell","BeanShell"],["groovy","Groovy"],["python","Python"]];
            qSection.appendChild(field("Language", select2pairs(langs, draft.scriptLang, function (v) { draft.scriptLang = v; })));
            qH.textContent = "Return rows as a list of arrays; column count must match the Output columns below.";
          } else {
            qH.textContent = "Alias each output with “as name” so columns can be detected.";
          }
          var qTa = textarea(draft.query, function (v) { draft.query = v; });
          qTa.className = "dsb-query"; qTa.spellcheck = false; qTa.placeholder = t.ph;
          var lbl = k === "sql" ? "SQL Query" : k === "mdx" ? "MDX Query" : k === "mql" ? "MQL Query" : "Script";
          var qF = el("div", "field"); qF.appendChild(labelEl(lbl)); qF.appendChild(qTa); qF.appendChild(qH);
          qSection.appendChild(qF);
          // SQL Builder accordion: available for SQL kind to assist with SELECT generation (G1)
          if (k === "sql") { qSection.appendChild(renderSQLBuilder(qTa)); }
          detectBtn.style.display = k === "sql" ? "" : "none";
        }
      }
      function syncType() { renderQSection(); }
      b.appendChild(wrap); renderQSection(); renderCols(); renderParams(); renderCalcCols(); renderPreview();
    });
  }
  function saveDraft(draft, existing) {
    if (!draft.id) { toast("Give the query an id.", true); return false; }
    if (!draft.columns.length) { toast("Add at least one column.", true); return false; }
    var stem = draft.stem || "custom";
    if (!S.catalog[stem]) S.catalog[stem] = { file: stem + ".cda", connection: { id: "pdc", jndi: draft.jndi || "PDC-BIDB-EXT" }, dataAccesses: [] };
    var entry = S.catalog[stem];
    var da = { id: draft.id, name: draft.id, kind: draft.kind, jndi: draft.jndi,
      params: draft.params.filter(function (p) { return p.name; }),
      calcColumns: (draft.calcColumns || []).filter(function (c) { return c.name; }),
      cache: true, cacheDuration: 300, sql: draft.query, query: draft.query,
      columns: draft.columns.slice(), authored: true };
    if (draft.mdxCatalog) da.mdxCatalog = draft.mdxCatalog;
    if (draft.mqlDomain) da.mqlDomain = draft.mqlDomain;
    if (draft.ktrPath) da.ktrPath = draft.ktrPath;
    if (draft.ktrStep && draft.ktrStep !== "Output") da.ktrStep = draft.ktrStep;
    if (draft.scriptLang && draft.scriptLang !== "javascript") da.scriptLang = draft.scriptLang;
    if (draft.kind === "duckdb") { da.fileUrl = draft.fileUrl || ""; da.fileFormat = draft.fileFormat || "auto"; }
    if (draft.kind === "httpvfs") { da.fileUrl = draft.fileUrl || ""; da.tableName = draft.tableName || ""; }
    if (draft.kind === "snowflake") {
      da.sfAccount = draft.sfAccount || ""; da.sfToken = draft.sfToken || ""; da.sfTokenType = draft.sfTokenType || "PROGRAMMATIC_ACCESS_TOKEN";
      da.sfWarehouse = draft.sfWarehouse || ""; da.sfDatabase = draft.sfDatabase || ""; da.sfSchema = draft.sfSchema || ""; da.sfRole = draft.sfRole || "";
    }
    if (draft.kind === "databricks") {
      da.dbxHost = draft.dbxHost || ""; da.dbxToken = draft.dbxToken || ""; da.dbxWarehouseId = draft.dbxWarehouseId || "";
      da.dbxCatalog = draft.dbxCatalog || ""; da.dbxSchema = draft.dbxSchema || "";
    }
    if (draft.kind === "bigquery") {
      da.bqProject = draft.bqProject || ""; da.bqToken = draft.bqToken || "";
      da.bqLocation = draft.bqLocation || ""; da.bqDataset = draft.bqDataset || "";
    }
    if (draft.kind === "http") {
      da.httpUrl = draft.httpUrl || ""; da.httpMethod = draft.httpMethod || "POST";
      da.httpAuthHeader = draft.httpAuthHeader || ""; da.httpParamName = draft.httpParamName || "sql";
    }
    // remove the previous record (handles id/group rename on edit)
    if (existing) { var oe = S.catalog[existing.stem]; if (oe) oe.dataAccesses = oe.dataAccesses.filter(function (x) { return x.id !== existing.da.id; }); }
    var dup = entry.dataAccesses.filter(function (x) { return x.id === da.id; })[0];
    if (dup && !(existing && existing.stem === stem && existing.da.id === da.id)) { toast("“" + da.id + "” already exists in " + stem + ".", true); return false; }
    entry.dataAccesses = entry.dataAccesses.filter(function (x) { return x.id !== da.id; }).concat([da]);
    buildLibrary(); renderRepository();
    var w = document.querySelector('.lib-cda[data-stem="' + stem + '"]'); if (w) w.classList.add("open");
    toast((existing ? "Updated " : "Created ") + stem + " › " + da.id);
    return true;
  }

  function deleteDataSource(stem, daId) {
    var e = S.catalog[stem]; if (!e) return;
    e.dataAccesses = e.dataAccesses.filter(function (x) { return x.id !== daId; });
    if (!e.dataAccesses.length) delete S.catalog[stem];
    buildLibrary(); renderRepository(); toast("Removed " + daId);
  }

  /* ---------- selection + inspector ---------- */
  function select(sel) { S.selection = sel; renderInspector(); highlightPreview(); }
  function selectDashboard() { S.selection = null; renderInspector(); highlightPreview(); }

  function renderInspector() {
    var body = $("#inspBody"); body.innerHTML = "";
    // Persistent search input + Expand/Collapse-all row at the top of every inspector
    var sw = el("div", "insp-search-wrap");
    var si = el("input", "insp-search");
    si.type = "text"; si.placeholder = "Search fields…"; si.value = _inspSearch;
    si.setAttribute("aria-label", "Search inspector fields");
    si.setAttribute("autocomplete", "off");
    si.addEventListener("input", function () { _inspSearch = si.value; applyInspSearch(body); });
    si.addEventListener("keydown", function (e) { e.stopPropagation(); }); // prevent global kbd shortcuts
    sw.appendChild(si);

    // H-track: Expand all / Collapse all — one click to open or shut every section
    var xRow = el("div", "insp-xpand-row");
    function allSections() { return body.querySelectorAll(".insp-sec"); }
    var expAll = el("button", "insp-xpand-btn");
    expAll.textContent = "Expand all"; expAll.title = "Expand every inspector section";
    expAll.onclick = function () {
      allSections().forEach(function (sec) {
        var h = sec.querySelector("h4"), bdy = sec.querySelector(".insp-sec-body");
        if (!sec.classList.contains("sec-collapsed")) return;
        // find the key from _collapsedSects and clear it
        var titleEl = h ? h.firstChild : null;
        while (titleEl && titleEl.nodeType !== 3) titleEl = titleEl.nextSibling;
        var key = titleEl ? titleEl.textContent.replace(/\s*\(\d+\)\s*$/, "") : "";
        if (key) _collapsedSects[key] = false;
        sec.classList.remove("sec-collapsed"); if (bdy) bdy.style.display = "";
        var chev = sec.querySelector(".sec-chev"); if (chev) { chev.innerHTML = ""; chev.appendChild(Studio.icon("chevron-down", 9)); }
        var hint = sec.querySelector(".sec-hint"); if (hint) hint.textContent = "";
      });
      _saveCollapsedSects();
    };
    var colAll = el("button", "insp-xpand-btn");
    colAll.textContent = "Collapse all"; colAll.title = "Collapse every inspector section";
    colAll.onclick = function () {
      allSections().forEach(function (sec) {
        var h = sec.querySelector("h4"), bdy = sec.querySelector(".insp-sec-body");
        if (sec.classList.contains("sec-collapsed")) return;
        var titleEl = h ? h.firstChild : null;
        while (titleEl && titleEl.nodeType !== 3) titleEl = titleEl.nextSibling;
        var key = titleEl ? titleEl.textContent.replace(/\s*\(\d+\)\s*$/, "") : "";
        if (key) _collapsedSects[key] = true;
        sec.classList.add("sec-collapsed"); if (bdy) bdy.style.display = "none";
        var chev = sec.querySelector(".sec-chev"); if (chev) { chev.innerHTML = ""; chev.appendChild(Studio.icon("chevron-right", 9)); }
        var summaryFn = sec._summaryFn;
        var hint = sec.querySelector(".sec-hint"); if (hint && summaryFn) hint.textContent = summaryFn() || "";
      });
      _saveCollapsedSects();
    };
    xRow.appendChild(expAll); xRow.appendChild(colAll); sw.appendChild(xRow);
    body.appendChild(sw);

    $("#inspBack").hidden = !S.selection;
    if (!S.selection) { $("#inspTitle").textContent = "Dashboard"; renderDashboardInspector(body); }
    else if (S.selection.kind === "panel") { $("#inspTitle").textContent = "Panel"; renderPanelInspector(body); }
    else if (S.selection.kind === "filter") { $("#inspTitle").textContent = "Filter"; renderFilterInspector(body); }
    else if (S.selection.kind === "da") { $("#inspTitle").textContent = "Data Source"; renderDAInspector(body); }
    else { $("#inspTitle").textContent = "KPI tile"; renderKpiInspector(body); }

    // J2: update the top-level contextual help link to point at the most relevant docs section
    var _hlAnchors = { "panel": "chart-types", "filter": "builder", "da": "data-sources", "kpi": "chart-types" };
    var _hlEl = document.getElementById("inspHelpLink");
    if (_hlEl) _hlEl.href = "docs/index.html#" + (_hlAnchors[(S.selection || {}).kind] || "builder");

    if (_inspSearch) applyInspSearch(body);
  }

  // Hide sections whose visible text doesn't contain the search query.
  function applyInspSearch(body) {
    var q = (_inspSearch || "").trim().toLowerCase();
    var secs = body.querySelectorAll(".insp-sec");
    secs.forEach(function (sec) {
      sec.style.display = (!q || sec.textContent.toLowerCase().indexOf(q) >= 0) ? "" : "none";
    });
  }

  function renderDashboardInspector(body) {
    var sp = S.spec;
    quickHelp(body, "dashboard");
    // K2 v92 — Simple mode welcome note: shown at the top of the dashboard inspector
    // when Simple mode is active so newcomers always know which mode they're in and
    // how to access the full toolset. Includes a one-click "Switch to Advanced" link.
    if (S.simpleMode) {
      var sw = el("div", "simple-welcome");
      var swIc = el("span", "simple-welcome-ic"); swIc.appendChild(Studio.icon("info", 15)); sw.appendChild(swIc);
      var swB = el("div", "simple-welcome-body");
      var swT = el("div", "simple-welcome-title"); swT.textContent = "Simple mode is active";
      var swD = el("div", "simple-welcome-desc");
      swD.textContent = "Advanced options — annotations, drill-through, cross-filtering, and specialist chart types — are hidden. Drag a query from the library to add your first chart.";
      var swBtn = el("button", "simple-welcome-btn"); swBtn.type = "button"; swBtn.textContent = "Switch to Advanced mode →";
      swBtn.onclick = function () { toggleSimpleMode(); };
      swB.appendChild(swT); swB.appendChild(swD); swB.appendChild(swBtn);
      sw.appendChild(swB); body.appendChild(sw);
    }
    // K7: Getting started checklist — shown in Simple mode when the dashboard is empty
    // (0 panels and 0 KPIs). Gives newcomers a clear 3-step path:
    //   1. Library ready (auto-checked — catalog is always available)
    //   2. Add a panel (the key CTA — drag or drop from the library)
    //   3. Export your dashboard (the end goal)
    // Disappears the moment the first panel or KPI is added.
    if (S.simpleMode && !sp.panels.length && !(sp.kpis && sp.kpis.length)) {
      var cl = el("div", "gs-checklist");
      var clT = el("div", "gs-checklist-title"); clT.textContent = "Getting started"; cl.appendChild(clT);

      function clStep(done, label, detail, actionLabel, actionFn) {
        var row = el("div", "gs-step" + (done ? " gs-done" : ""));
        var chk = el("span", "gs-check"); chk.textContent = done ? "✓" : ""; row.appendChild(chk);
        var bd = el("div", "gs-step-body");
        var lbl = el("div", "gs-step-label"); lbl.textContent = label; bd.appendChild(lbl);
        if (detail) { var det = el("div", "gs-step-detail"); det.textContent = detail; bd.appendChild(det); }
        if (actionLabel && actionFn) {
          var ab = el("button", "gs-step-action"); ab.type = "button"; ab.textContent = actionLabel;
          ab.onclick = actionFn; bd.appendChild(ab);
        }
        row.appendChild(bd); return row;
      }
      // Step 1 is always done — the catalog library is ready the moment the app loads.
      cl.appendChild(clStep(true, "Library ready", "Your catalog queries are in the left panel — browse or search for your data."));
      // Step 2 is the primary CTA; the action button focuses the library on desktop
      // or opens the library drawer on phone so the user knows exactly where to go.
      cl.appendChild(clStep(false, "Add a panel to the canvas", "Drag any query from the library onto the canvas to create your first chart.", "Open library", function () {
        if (window.innerWidth <= 640) {
          var t = document.getElementById("tabLib"); if (t) t.click();
        } else {
          var ls = document.getElementById("libSearch"); if (ls) { ls.focus(); ls.select(); }
        }
      }));
      // Step 3 is the end goal — shown as upcoming to frame the overall journey.
      cl.appendChild(clStep(false, "Export your dashboard", "Use Export ▾ to download a self-contained CDF HTML file ready for your Pentaho server."));
      body.appendChild(cl);
    }

    // K8 — "What's next?" card: shown in Simple mode once ≥1 panel or KPI is on the canvas.
    // Bridges the gap after the getting-started checklist (step 2 done) by giving newcomers
    // three actionable next steps. Dismissible — persisted to localStorage so it doesn't
    // reappear once the user clicks "Got it".
    var k8Key = "studio-k8-dismissed";
    var k8Hidden = false;
    try { k8Hidden = localStorage.getItem(k8Key) === "1"; } catch (e) {}
    if (S.simpleMode && !k8Hidden && (sp.panels.length || (sp.kpis && sp.kpis.length))) {
      var k8 = el("div", "k8-next");
      var k8T = el("div", "k8-next-title"); k8T.textContent = "What’s next?"; k8.appendChild(k8T);

      // Dismiss button — hides the card and persists the decision so it never re-appears.
      var k8Dis = el("button", "k8-dismiss"); k8Dis.id = "k8DismissBtn"; k8Dis.type = "button";
      k8Dis.title = "Dismiss this card"; k8Dis.textContent = "Got it ×";
      k8Dis.onclick = function () {
        try { localStorage.setItem(k8Key, "1"); } catch (e) {}
        k8.remove();
      };
      k8.appendChild(k8Dis);

      // Helper — one row: small icon circle + label + detail + optional action button.
      function k8Tip(iconName, label, detail, actionLabel, actionFn) {
        var row = el("div", "k8-tip");
        var ic = el("span", "k8-tip-ic"); ic.appendChild(Studio.icon(iconName, 14)); row.appendChild(ic);
        var bd = el("div", "k8-tip-body");
        var lbl = el("div", "k8-tip-label"); lbl.textContent = label; bd.appendChild(lbl);
        var det = el("div", "k8-tip-detail"); det.textContent = detail; bd.appendChild(det);
        if (actionLabel && actionFn) {
          var ab = el("button", "k8-tip-act"); ab.type = "button"; ab.textContent = actionLabel;
          ab.onclick = actionFn; bd.appendChild(ab);
        }
        row.appendChild(bd); return row;
      }

      k8.appendChild(k8Tip("gear", "Configure your chart",
        "Click a panel on the canvas to select it, then choose a chart type and bind your data columns in the inspector."));
      k8.appendChild(k8Tip("plus", "Add more panels or KPIs",
        "Drag more queries from the library onto the canvas to expand your dashboard."));
      k8.appendChild(k8Tip("download", "Export when ready",
        "Use Export ▾ in the toolbar to download a CDF HTML file ready for your Pentaho server.",
        "Open Export ▾", function () {
          var btnExp = document.getElementById("btnExport"); if (btnExp) btnExp.click();
        }));

      // Docs link — opens the help reference in a new tab (J-track v98).
      var k8Hr = el("div", "k8-help-row");
      var k8Hl = el("a", "k8-help-link"); k8Hl.href = "docs/index.html"; k8Hl.target = "_blank"; k8Hl.rel = "noopener";
      k8Hl.appendChild(Studio.icon("info", 12));
      k8Hl.appendChild(document.createTextNode(" View help docs"));
      k8Hr.appendChild(k8Hl); k8.appendChild(k8Hr);
      body.appendChild(k8);
    }

    // E3: Layout thumbnail — a quick visual cue of the spec structure so the user can
    // identify the dashboard at a glance without scrolling through the inspector.
    var thumbSvg = Studio.makeThumbnail(sp, S.theme);
    if (thumbSvg) {
      var tc = el("div", "insp-thumb"); tc.setAttribute("aria-label", "Dashboard layout preview");
      tc.innerHTML = thumbSvg; body.appendChild(tc);
    }
    // N-FUN: Build-completeness meter — a tasteful, game-like nudge (not a warning) toward a
    // well-rounded dashboard: title / panel / KPI / filter / a touch of your own style. Distinct
    // from the Checks section below (which only flags real problems); this is purely encouraging.
    var comp = Studio.dashboardCompleteness(sp);
    var bc = el("div", "build-comp"); bc.setAttribute("aria-label", "Build progress: " + comp.done + " of " + comp.total);
    var R = 15, C = 2 * Math.PI * R;
    var ring = '<svg class="bc-ring" width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">' +
      '<circle cx="18" cy="18" r="' + R + '" class="bc-ring-bg"/>' +
      '<circle cx="18" cy="18" r="' + R + '" class="bc-ring-fg" stroke-dasharray="' + C.toFixed(1) + '" ' +
        'stroke-dashoffset="' + (C * (1 - comp.done / comp.total)).toFixed(1) + '"/></svg>';
    var bcTop = el("div", "bc-top"); bcTop.innerHTML = ring;
    var bcTxt = el("div", "bc-txt");
    if (comp.done >= comp.total) {
      bcTxt.innerHTML = "<b>Build progress: " + comp.done + "/" + comp.total + "</b><br>Nice work — this dashboard covers all the basics.";
    } else {
      bcTxt.innerHTML = "<b>Build progress: " + comp.done + "/" + comp.total + "</b><br>A few quick wins left:";
    }
    bcTop.appendChild(bcTxt); bc.appendChild(bcTop);
    if (comp.done < comp.total) {
      var bcList = el("ul", "bc-list");
      comp.items.filter(function (i) { return !i.done; }).forEach(function (i) {
        var li = el("li"); li.textContent = i.label; bcList.appendChild(li);
      });
      bc.appendChild(bcList);
    }
    body.appendChild(bc);

    // ── checks (live validation) ──
    var issues = Studio.validate(sp);
    var vs = section(body, "Checks");
    if (!issues.length) vs.appendChild(iconNote("ok", "check", "Looks good — ready to export."));
    else issues.forEach(function (x) { vs.appendChild(iconNote(x.level === "error" ? "err" : x.level === "warn" ? "warn" : "info", x.level === "error" ? "close" : x.level === "warn" ? "warn" : "info", x.msg)); });

    var sec = section(body, "Dashboard", null, null, "builder");
    var titleInput = input(sp.title, function (v) { sp.title = v; syncHeader(); refreshPreview(); });
    titleInput.id = "dashTitleField"; // Z6: the topbar's "rename" button focuses this field
    sec.appendChild(field("Title", titleInput));
    sec.appendChild(field("File name (stem)", input(sp.name, function (v) { sp.name = v.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-"); syncHeader(); }, "lowercase-with-dashes → " + sp.name + ".html / .cda")));
    sec.appendChild(field("Subtitle", input(sp.subtitle, function (v) { sp.subtitle = v; refreshPreview(); })));

    // Z6: banner title size — a first cut of "full text formatting for the banner." The title is
    // already bold (font-weight:800 in vendor/pdc-ui.css, kept pristine); size is the one lever
    // that's genuinely useful across the widest range of dashboards (a dense ops board wants a
    // quieter title, a single-hero exec dashboard wants it to dominate the banner).
    sec.appendChild(field("Title size", select2pairs(Studio.TITLE_SIZES, sp.titleSize || "", function (v) {
      sp.titleSize = v; refreshPreview();
    }), "Overrides the banner title's font size; blank keeps the default."));
    sec.appendChild(field("Subtitle style", select2pairs(Studio.SUBTITLE_STYLES, sp.subtitleStyle || "", function (v) {
      sp.subtitleStyle = v; refreshPreview();
    }), "Bold and/or italic emphasis for the banner subtitle; blank keeps the default."));
    // N-DESIGN "chart skins" first cut: an alternate mood for every chart card + KPI tile,
    // dashboard-wide — same data/layout, just a quieter surface treatment for a boardroom look.
    sec.appendChild(field("Card style", select2pairs(Studio.CARD_SKINS, sp.cardSkin || "", function (v) {
      sp.cardSkin = v; refreshPreview();
    }), "Flat drops the shadow/hover-lift on every chart card and KPI tile for a quieter, editorial look."));

    // N-DEV: dashboard templates/variables. Named {{key}} placeholders in the dashboard Title/
    // Subtitle AND any panel's Title/Note get substituted with a saved value at render time
    // (Studio.applyTemplateVars, called from the shared buildHtml/renderGrid pipeline so preview
    // and every export stay in sync). Lets one spec serve as a reusable template — e.g. Title
    // "{{region}} — Weekly Ops Review" filled in per deployment instead of hand-editing every time.
    (function () {
      var tvSec = section(body, "Template variables", null, function () {
        var n = sp.templateVars && sp.templateVars.length;
        return n ? n + (n === 1 ? " variable" : " variables") : "";
      });
      var tvList = el("div"); tvList.style.cssText = "display:flex;flex-direction:column;gap:5px;margin-bottom:6px";
      tvSec.appendChild(tvList);

      function renderTvItems() {
        tvList.innerHTML = "";
        (sp.templateVars || []).forEach(function (tv, idx) {
          var row = el("div"); row.style.cssText = "display:flex;gap:3px;align-items:center";
          var keyInp = el("input"); keyInp.type = "text"; keyInp.className = "dsb-sqb-inp";
          keyInp.style.cssText = "width:38%;font-size:12px;height:26px;padding:0 6px";
          keyInp.value = tv.key || ""; keyInp.placeholder = "key";
          keyInp.addEventListener("change", function () {
            tv.key = keyInp.value.trim().replace(/[^A-Za-z0-9_]+/g, "_"); refreshPreview();
          });
          var valInp = el("input"); valInp.type = "text"; valInp.className = "dsb-sqb-inp";
          valInp.style.cssText = "flex:1;min-width:0;font-size:12px;height:26px;padding:0 6px";
          valInp.value = tv.value || ""; valInp.placeholder = "value";
          valInp.addEventListener("input", function () { tv.value = valInp.value; refreshPreview(); });
          var delBtn = el("button"); delBtn.type = "button"; delBtn.title = "Remove variable";
          delBtn.setAttribute("aria-label", "Remove variable");
          delBtn.innerHTML = Studio.icon("trash", 12);
          delBtn.className = "rm icobtn";
          delBtn.style.cssText = "flex-shrink:0;width:24px;height:26px;padding:0;min-width:0";
          (function (i) {
            delBtn.addEventListener("click", function () {
              sp.templateVars.splice(i, 1);
              if (!sp.templateVars.length) sp.templateVars = [];
              renderTvItems(); refreshPreview();
            });
          })(idx);
          row.appendChild(keyInp); row.appendChild(valInp); row.appendChild(delBtn);
          tvList.appendChild(row);
        });
      }
      renderTvItems();

      var addTvBtn = el("button"); addTvBtn.type = "button"; addTvBtn.className = "rm cf-add-rule";
      addTvBtn.style.cssText = "font-size:11.5px;padding:3px 10px;margin-top:2px";
      addTvBtn.textContent = "+ Add variable";
      addTvBtn.addEventListener("click", function () {
        if (!sp.templateVars) sp.templateVars = [];
        sp.templateVars.push({ key: "var" + (sp.templateVars.length + 1), value: "" });
        renderTvItems(); refreshPreview();
      });
      tvSec.appendChild(addTvBtn);

      // Named, reusable variable sets — save the current {{key}}→value rows under a name (e.g.
      // "APAC"), then apply that same set to any dashboard sharing the {{region}}-style template.
      var setsWrap = el("div"); setsWrap.style.cssText = "margin-top:8px;padding-top:8px;border-top:1px solid var(--line)";
      function renderTvSets() {
        setsWrap.innerHTML = "";
        var sets = templateVarSets();
        if (sets.length) {
          var pickRow = el("div"); pickRow.style.cssText = "display:flex;gap:4px;align-items:center;margin-bottom:5px";
          // Deliberately NOT .dsb-sqb-inp — that class is also how existing tests locate the
          // key/value row inputs by position (querySelectorAll(".dsb-sqb-inp")); sharing it here
          // would silently shift those indices. Same look via inline styles instead.
          var sel = el("select"); sel.style.cssText = "flex:1;min-width:0;font-size:12px;height:26px;padding:5px 8px;border:1px solid var(--line);border-radius:7px;background:var(--field);color:var(--ink)";
          sets.forEach(function (s) {
            var opt = el("option"); opt.value = s.id; opt.textContent = s.name + " (" + s.vars.length + ")";
            sel.appendChild(opt);
          });
          var applyBtn = el("button"); applyBtn.type = "button"; applyBtn.className = "btn";
          applyBtn.style.cssText = "font-size:11.5px;padding:3px 10px;flex-shrink:0"; applyBtn.textContent = "Apply";
          applyBtn.addEventListener("click", function () {
            applyTemplateVarSet(sel.value, sp); renderInspector(); refreshPreview(); toast("Template variable set applied.");
          });
          var delSetBtn = el("button"); delSetBtn.type = "button"; delSetBtn.className = "icobtn danger";
          delSetBtn.title = "Delete this saved set"; delSetBtn.setAttribute("aria-label", "Delete saved set");
          delSetBtn.innerHTML = Studio.icon("trash", 12);
          delSetBtn.style.cssText = "flex-shrink:0;width:24px;height:26px;padding:0;min-width:0";
          delSetBtn.addEventListener("click", function () { deleteTemplateVarSet(sel.value); renderTvSets(); });
          pickRow.appendChild(sel); pickRow.appendChild(applyBtn); pickRow.appendChild(delSetBtn);
          setsWrap.appendChild(pickRow);
        }
        var saveRow = el("div"); saveRow.style.cssText = "display:flex;gap:4px;align-items:center";
        var setNameInp = el("input"); setNameInp.type = "text"; // not .dsb-sqb-inp — see note above
        setNameInp.placeholder = "Set name, e.g. APAC";
        setNameInp.style.cssText = "flex:1;min-width:0;font-size:12px;height:26px;padding:5px 8px;border:1px solid var(--line);border-radius:7px;background:var(--field);color:var(--ink)";
        var saveSetBtn = el("button"); saveSetBtn.type = "button"; saveSetBtn.className = "rm cf-add-rule";
        saveSetBtn.style.cssText = "font-size:11.5px;padding:3px 10px;flex-shrink:0"; saveSetBtn.textContent = "Save current as…";
        saveSetBtn.addEventListener("click", function () {
          var name = (setNameInp.value || "").trim(); if (!name) { setNameInp.focus(); return; }
          if (!sp.templateVars || !sp.templateVars.length) { toast("Add at least one variable first.", true); return; }
          addTemplateVarSet(name, sp.templateVars); setNameInp.value = ""; renderTvSets();
          toast("Saved template variable set “" + name + "”.");
        });
        setNameInp.addEventListener("keydown", function (e) { if (e.key === "Enter") saveSetBtn.click(); });
        saveRow.appendChild(setNameInp); saveRow.appendChild(saveSetBtn);
        setsWrap.appendChild(saveRow);
      }
      renderTvSets();
      tvSec.appendChild(setsWrap);

      tvSec.appendChild(noteEl("info", "Use {{key}} in the dashboard Title/Subtitle above, or in any panel's Title/Note — it's replaced with the matching value here, in both the live preview and every export. A key with no matching variable is left as literal text. Save the rows above as a named set to reuse them on other dashboards."));
    })();

    // Z6: per-dashboard header logo — replaces the default "P" mark in the banner (preview +
    // exported CDF) with an uploaded image. Lives in the spec itself (not localStorage, unlike
    // the app-wide Z12 rail branding) so it travels with Save/Open/Export like any other content.
    var logoRow = el("div"); logoRow.className = "accent-presets"; logoRow.style.flexWrap = "wrap";
    if (sp.headerLogo) {
      var logoPrev = el("img"); logoPrev.src = sp.headerLogo; logoPrev.alt = "";
      logoPrev.style.cssText = "width:28px;height:28px;border-radius:7px;object-fit:cover;border:1px solid var(--line)";
      logoRow.appendChild(logoPrev);
    }
    var logoBtn = el("button"); logoBtn.type = "button"; logoBtn.className = "btn";
    logoBtn.textContent = sp.headerLogo ? "Change…" : "Upload logo…";
    var logoInp = el("input"); logoInp.type = "file"; logoInp.accept = "image/png,image/jpeg,image/svg+xml"; logoInp.style.display = "none";
    logoInp.onchange = function () {
      var f = logoInp.files[0]; if (!f) return;
      if (f.size > 200 * 1024) { toast("Logo too large — please use an image under 200KB.", true); return; }
      var reader = new FileReader();
      reader.onload = function (e) { sp.headerLogo = e.target.result; refreshPreview(); renderInspector(); toast("Header logo updated."); };
      reader.readAsDataURL(f);
    };
    logoBtn.onclick = function () { logoInp.click(); };
    logoRow.appendChild(logoBtn); logoRow.appendChild(logoInp);
    if (sp.headerLogo) {
      var logoClear = el("button"); logoClear.type = "button"; logoClear.className = "btn";
      logoClear.textContent = "Remove";
      logoClear.onclick = function () { delete sp.headerLogo; refreshPreview(); renderInspector(); };
      logoRow.appendChild(logoClear);
    }
    sec.appendChild(field("Header logo", logoRow, "PNG/JPG/SVG, up to 200KB. Replaces the default mark in the banner — blank uses the default."));
    // Z6: header link — wraps the brand mark+title in an <a>, e.g. back to a company site or portal.
    sec.appendChild(field("Header link URL", input(sp.headerLink || "", function (v) { sp.headerLink = v.trim(); refreshPreview(); }, "https://…"),
      "Makes the logo + title in the banner clickable (opens in a new tab). Leave blank for plain text."));

    var grpSel = select2(["Observability", "Governance & Privacy", "Storage & Cost", "Usage & People", "Data Integration", "Executive"], sp.group, function (v) { sp.group = v; syncHeader(); });
    sec.appendChild(field("Group", grpSel));
    sec.appendChild(field("Description", textarea(sp.description, function (v) { sp.description = v; refreshPreview(); })));
    var gc = select2(["1", "2", "3", "4"], String(sp.gridCols), function (v) { sp.gridCols = +v; refreshPreview(); });
    sec.appendChild(field("Grid columns", gc));

    // N-DATA: "Auto-arrange" — one click reflows the existing panels into a more balanced
    // grid (wide chart types full-width, everything else 1 column, related tags clustered
    // together). Pure rearrangement of what's already there — no new spec fields, and the
    // usual drag-resize still works afterward if the result isn't quite right.
    var autoArrangeBtn = el("button"); autoArrangeBtn.type = "button"; autoArrangeBtn.className = "btn";
    autoArrangeBtn.id = "dashAutoArrange";
    autoArrangeBtn.textContent = "Auto-arrange";
    autoArrangeBtn.onclick = function () {
      if (!(sp.panels || []).length) { toast("No panels to arrange yet."); return; }
      sp.panels = Studio.autoArrange(sp.panels);
      renderInspector(); refreshPreview();
      toast("Panels auto-arranged.");
    };
    sec.appendChild(field("Layout", autoArrangeBtn,
      "Reflows panels into a balanced grid: tables/text/flow diagrams go full-width, everything else keeps a single column, and panels sharing a tag are grouped together."));

    // ★★ Visual refresh (A): Dashboard theme — swaps the WHOLE token system (bg/panel/text
    // hierarchy + brand + series) in one pick, distinct from the finer Accent color/Header
    // background/Series palette knobs below (which still layer on top of whichever theme is active).
    var dtRow = el("div"); dtRow.className = "dt-presets";
    dtRow.setAttribute("id", "dashThemeRow");
    Studio.DASHBOARD_THEMES.forEach(function (preset) {
      var sw = el("button"); sw.type = "button"; sw.className = "dt-swatch";
      sw.title = preset.label;
      sw.style.background = preset.swatch;
      sw.setAttribute("data-dashboard-theme", preset.key);
      var active = (sp.dashboardTheme || "classic") === preset.key;
      if (active) sw.classList.add("active");
      sw.setAttribute("aria-pressed", active ? "true" : "false");
      sw.onclick = function () {
        sp.dashboardTheme = preset.key === "classic" ? "" : preset.key;
        refreshPreview(); renderInspector();
      };
      dtRow.appendChild(sw);
    });
    sec.appendChild(field("Dashboard theme", dtRow, "Swaps the whole look (background, panels, text, brand + series colors) in one pick — Accent color/Series palette below still layer on top."));

    // H-track: Dashboard accent color — per-dashboard --pentaho override.
    // 6 quick preset swatches + a custom hex picker let the SE team match client branding.
    // Empty string = keep the default Pentaho blue (#005bb5) from pdc-ui.css.
    var THEME_PRESETS = Studio.THEME_PRESETS;
    var accentRow = el("div"); accentRow.className = "accent-presets";
    var accentCustom = el("input"); accentCustom.type = "color"; accentCustom.id = "dashAccentCustom";
    accentCustom.title = "Custom accent color";
    accentCustom.value = sp.themeColor || "#005bb5";
    accentCustom.oninput = function () {
      sp.themeColor = this.value; refreshPreview(); renderInspector();
    };
    THEME_PRESETS.forEach(function (preset) {
      var sw = el("button"); sw.type = "button"; sw.className = "accent-swatch";
      sw.title = preset.label;
      sw.style.background = preset.color || "#005bb5";
      var isActiveAccent = sp.themeColor === preset.color;
      if (isActiveAccent) sw.classList.add("active");
      sw.setAttribute("aria-pressed", isActiveAccent ? "true" : "false");
      sw.onclick = function () {
        sp.themeColor = preset.color;
        accentCustom.value = preset.color || "#005bb5";
        refreshPreview(); renderInspector();
      };
      accentRow.appendChild(sw);
    });
    accentRow.appendChild(accentCustom);
    sec.appendChild(field("Accent color", accentRow, "Overrides the brand color in preview and exported CDF"));

    // Z6: Header background color — a flat fill for the banner itself (distinct from Accent color,
    // which only tints the bottom border + chart/button accents). Text auto-contrasts (Studio.contrastFg)
    // so a light pick never goes white-on-white.
    var hdrBgRow = el("div"); hdrBgRow.className = "accent-presets";
    var hdrBgCustom = el("input"); hdrBgCustom.type = "color"; hdrBgCustom.id = "dashHeaderBgCustom";
    hdrBgCustom.title = "Custom header background color";
    hdrBgCustom.value = sp.headerBg || "#102445";
    hdrBgCustom.oninput = function () { sp.headerBg = this.value; refreshPreview(); renderInspector(); };
    hdrBgRow.appendChild(hdrBgCustom);
    if (sp.headerBg) {
      var hdrBgClear = el("button"); hdrBgClear.type = "button"; hdrBgClear.className = "btn";
      hdrBgClear.textContent = "Reset to default";
      hdrBgClear.onclick = function () { delete sp.headerBg; refreshPreview(); renderInspector(); };
      hdrBgRow.appendChild(hdrBgClear);
    }
    sec.appendChild(field("Header background color", hdrBgRow, "Flat fill for the banner itself (blank = default navy gradient); text color auto-adjusts for contrast."));

    // H-track: Series color palette preset — swaps the --c1..--c10 chart series palette.
    // Lets SE teams quickly show the dashboard in a different color family for demos.
    // paletteKey "" / "default" keeps the built-in Pentaho palette from pdc-ui.css.
    var palRow = el("div"); palRow.className = "accent-presets";
    palRow.setAttribute("id", "dashPaletteRow");
    Studio.PALETTE_PRESETS.forEach(function (preset) {
      var sw = el("button"); sw.type = "button"; sw.className = "accent-swatch";
      sw.title = preset.label;
      sw.style.background = preset.light ? preset.swatch : "#005bb5";
      sw.setAttribute("data-palette-key", preset.key);
      var active = (sp.paletteKey || "default") === preset.key || (!sp.paletteKey && preset.key === "default");
      if (active) sw.classList.add("active");
      sw.setAttribute("aria-pressed", active ? "true" : "false");
      sw.onclick = function () {
        sp.paletteKey = preset.key === "default" ? "" : preset.key;
        refreshPreview(); renderInspector();
      };
      palRow.appendChild(sw);
    });
    sec.appendChild(field("Series palette", palRow, "Swap the chart series color palette (all panels)"));

    // KPIs
    var ks = section(body, "KPI tiles", function () { addFromCurrentOrPrompt("kpi"); }, null, "builder");
    if (!sp.kpis.length) ks.appendChild(hint("No KPI tiles. Add one from a query in the library, or click ＋."));
    sp.kpis.forEach(function (k, i) {
      ks.appendChild(rowItem("◧", k.label || "(metric)", k.da + " · " + k.valueCol,
        function () { select({ kind: "kpi", index: i }); },
        [moveBtn("↑", function () { swap(sp.kpis, i, i - 1); }), moveBtn("↓", function () { swap(sp.kpis, i, i + 1); }),
         delBtn(function () { sp.kpis.splice(i, 1); selectDashboard(); refreshPreview(); })],
        S.selection && S.selection.kind === "kpi" && S.selection.index === i));
    });

    // Filters
    var fs = section(body, "Filters", function () { addFilter(); }, null, "builder");
    if (!sp.filters.length) fs.appendChild(hint("Optional cascading header selects (e.g. Data Source)."));
    sp.filters.forEach(function (f, i) {
      fs.appendChild(rowItem("⛃", f.label, f.da + " · " + f.valueCol, function () { select({ kind: "filter", index: i }); },
        [delBtn(function () { sp.filters.splice(i, 1); selectDashboard(); refreshPreview(); })],
        S.selection && S.selection.kind === "filter" && S.selection.index === i));
    });

    // E4: Shareable deeplink (only when the dashboard has filters)
    if (sp.filters.length) {
      var dlSec = section(body, "Shareable link", null, null, "exporting");
      var hashStr = sp.filters.map(function (f) { return encodeURIComponent(f.id) + "=" + encodeURIComponent(f.def != null ? f.def : "%"); }).join("&");
      var dlHint = el("div", "hint");
      dlHint.innerHTML = 'Append <code class="fhash">#' + esc(hashStr) + '</code> to the exported CDF URL to pre-select these filters on load.';
      dlSec.appendChild(dlHint);
      var dlBtn = el("button", "btn"); dlBtn.style.cssText = "margin-top:6px;width:100%;justify-content:center";
      setIconBtn(dlBtn, "link", "Copy filter hash");
      dlBtn.setAttribute("data-deeplink", hashStr);
      dlBtn.onclick = function () {
        var hash = "#" + hashStr;
        try { navigator.clipboard.writeText(hash).then(function () { toast("Filter hash copied! Append to your exported CDF URL."); }).catch(function () { toast(hash); }); } catch (e) { toast(hash); }
      };
      dlSec.appendChild(dlBtn);
    }

    // N-DIST: shareable state link — encodes the WHOLE working spec into a #share= link
    // that reopens the exact same dashboard in the Studio builder itself (no file, no
    // server). Distinct from the E4 block above, which only ever carries filter *defaults*
    // for an exported CDF's own runtime — this one is a builder-to-builder handoff.
    var shSec = section(body, "Share this dashboard", null, null, "exporting");
    var shHint = el("div", "hint");
    shHint.textContent = "Copies a link that reopens this exact dashboard (panels, KPIs, filters, style) in the Studio builder — handy for handing off a work-in-progress with no file attachment.";
    shSec.appendChild(shHint);
    var shBtn = el("button", "btn"); shBtn.style.cssText = "margin-top:6px;width:100%;justify-content:center";
    setIconBtn(shBtn, "link", "Copy shareable link");
    shBtn.onclick = function () {
      var url = location.origin + location.pathname + location.search + "#share=" + Studio.encodeSpecToShareString(S.spec);
      var okMsg = url.length > 8000
        ? "Shareable link copied — this dashboard is large, so the link is long and may not work in every app (e.g. some chat clients truncate it)."
        : "Shareable link copied!";
      try { navigator.clipboard.writeText(url).then(function () { toast(okMsg); }).catch(function () { toast(url); }); } catch (e) { toast(url); }
    };
    shSec.appendChild(shBtn);

    // N-DIST follow-up: local version history — a timeline of checkpoints captured on every
    // explicit Save (see snapshotVersion()), distinct from in-session undo (lost on reload)
    // and studio-autosave (a single draft). Click a version to restore it as "time travel."
    var vhList = (loadVersions()[sp.id] || []);
    var vhSec = section(body, "Version history" + (vhList.length ? " (" + vhList.length + ")" : ""), null, null, "exporting");
    if (!vhList.length) {
      vhSec.appendChild(hint("Every time you Save, a restorable checkpoint of this dashboard is kept here (last 10)."));
    } else {
      vhList.forEach(function (v) {
        var when = new Date(v.ts).toLocaleString();
        var vp = v.spec || {};
        var vDetail = (vp.panels || []).length + " panel" + ((vp.panels || []).length === 1 ? "" : "s") +
          ((vp.kpis || []).length ? " · " + (vp.kpis || []).length + " KPI" + ((vp.kpis || []).length === 1 ? "" : "s") : "");
        vhSec.appendChild(rowItem("↺", when, vDetail, function () { restoreVersion(v.ts); }, [compareBtn(function () { openVersionDiff(v); })], false));
      });
    }

    // Track N innovation idea: canvas sticky notes — small colored, builder-only notes for
    // team brainstorming/review while a dashboard is in progress. Never exported.
    var noteList = (loadCanvasNotes()[sp.id] || []);
    var noteSec = section(body, "Builder notes" + (noteList.length ? " (" + noteList.length + ")" : ""), function () { openNoteEditor(null); }, null, "builder");
    if (!noteList.length) {
      noteSec.appendChild(hint("Pin a small colored note to a panel, or add a general one — for your own reference or team review while building. Never exported, never leaves this browser."));
    } else {
      noteList.forEach(function (n) {
        var panel = n.panelId ? panelById(n.panelId) : null;
        var sub = n.panelId ? ("Pinned to: " + (panel ? (panel.title || panel.id) : "a deleted panel")) : "General note";
        var dot = '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + esc(n.color || NOTE_COLORS[0]) + '"></span>';
        var label = n.text.length > 40 ? n.text.slice(0, 40) + "…" : n.text;
        noteSec.appendChild(rowItem(dot, label, sub, function () { openNoteEditor(n); }, [delBtn(function () { deleteCanvasNote(n.id); })], false));
      });
    }

    // CDA Connections
    sp.cda.connections = sp.cda.connections || [];
    var conns = sp.cda.connections;
    var cs2 = section(body, "CDA Connections", function () { addCDAConnection(); });
    if (!conns.length) cs2.appendChild(hint("No custom connections — the default SQL/JNDI pool is used. Add one to use JDBC, MDX, or other types."));
    conns.forEach(function (conn, i) {
      var typeLabel = (Studio.CDA_CONNECTION_TYPES.find(function (t) { return t.id === conn.type; }) || { label: conn.type }).label;
      var detail = conn.jndi || conn.url || conn.connectString || conn.fileName || conn.domainId || "";
      cs2.appendChild(rowItem("⊛", conn.id, typeLabel + (detail ? " · " + detail : ""),
        function () { openConnEditor(conn); },
        [delBtn(function () { conns.splice(i, 1); renderInspector(); })],
        false));
    });

    // Panels (reorderable) with tag-based filter bar
    // _tagFilter holds the currently-active tag (string) or null (show all panels).
    var allTags = Studio.allTags(sp);
    var ps = section(body, "Panels (" + sp.panels.length + ")");
    // Tag filter bar — only shown when at least one panel has tags
    if (allTags.length) {
      var tfBar = el("div"); tfBar.className = "tag-filter-bar";
      var allChip = el("button"); allChip.className = "tag-chip" + (!_tagFilter ? " tc-active" : ""); allChip.textContent = "All";
      allChip.onclick = function () { _tagFilter = null; renderInspector(); };
      tfBar.appendChild(allChip);
      allTags.forEach(function (t) {
        var chip = el("button"); chip.className = "tag-chip" + (_tagFilter === t ? " tc-active" : ""); chip.textContent = t;
        chip.onclick = function () { _tagFilter = (_tagFilter === t ? null : t); renderInspector(); };
        tfBar.appendChild(chip);
      });
      ps.appendChild(tfBar);
    }
    if (!sp.panels.length) ps.appendChild(hint("Drag a query onto the canvas, or use a ＋ chip in the library."));
    sp.panels.forEach(function (p, i) {
      var ic = (Studio.CHARTS[p.chart.type] || {}).icon || "▭";
      var pTags = p.tags || [];
      var matchesFilter = !_tagFilter || pTags.indexOf(_tagFilter) >= 0;
      var row = rowItem(ic, p.title || "(panel)", p.chart.type + " · " + p.chart.da + " · span " + p.span,
        function () { select({ kind: "panel", id: p.id }); },
        [moveBtn("↑", function () { swap(sp.panels, i, i - 1); }), moveBtn("↓", function () { swap(sp.panels, i, i + 1); }),
         delBtn(function () { sp.panels.splice(i, 1); selectDashboard(); refreshPreview(); })],
        S.selection && S.selection.kind === "panel" && S.selection.id === p.id);
      // Dim panels that don't match the active tag filter
      if (_tagFilter && !matchesFilter) row.style.opacity = "0.35";
      // Tag chips on the panel row — appended inside .ri-txt so they flow below the subtitle
      if (pTags.length) {
        var tagRow = el("div"); tagRow.className = "panel-tag-row";
        pTags.forEach(function (t) {
          var tc = el("span"); tc.className = "panel-tag-chip" + (_tagFilter === t ? " tc-active" : ""); tc.textContent = t;
          tc.onclick = function (e) { e.stopPropagation(); _tagFilter = (_tagFilter === t ? null : t); renderInspector(); };
          tagRow.appendChild(tc);
        });
        var riTxt = row.querySelector(".ri-txt");
        if (riTxt) riTxt.appendChild(tagRow);
      }
      ps.appendChild(row);
    });
  }

  function addCDAConnection() {
    var conn = Studio.newCDAConnection("sql.jndi");
    S.spec.cda.connections = S.spec.cda.connections || [];
    S.spec.cda.connections.push(conn);
    openConnEditor(conn);
  }

  function openConnEditor(conn) {
    modal("CDA Connection · " + conn.id, function (b) {
      var draft = Studio.clone(conn);
      var form = el("div"); form.style.cssText = "display:flex;flex-direction:column;gap:10px";

      // ID
      form.appendChild(field("Connection ID", (function () {
        var inp = input(draft.id, function (v) { draft.id = v.trim().replace(/\s+/g, "_") || draft.id; }); inp.placeholder = "pdc"; return inp;
      })()));

      // Type picker
      var typeSel = el("select");
      Studio.CDA_CONNECTION_TYPES.forEach(function (t) {
        var o = el("option"); o.value = t.id; o.textContent = t.label; if (t.id === draft.type) o.selected = true; typeSel.appendChild(o);
      });
      form.appendChild(field("Connection type", typeSel));

      // Type-specific fields (rendered below, replaced on type change)
      var fieldsBox = el("div");
      function renderFields() {
        fieldsBox.innerHTML = "";
        var ct = Studio.CDA_CONNECTION_TYPES.find(function (t) { return t.id === draft.type; });
        if (!ct) return;
        ct.fields.forEach(function (fd) {
          var inp = el("input"); inp.type = fd.secret ? "password" : "text";
          inp.value = draft[fd.key] || ""; inp.placeholder = fd.ph || "";
          inp.addEventListener("input", function () { draft[fd.key] = inp.value; });
          fieldsBox.appendChild(field(fd.label, inp));
        });
      }
      typeSel.onchange = function () { draft.type = typeSel.value; renderFields(); };
      renderFields();
      form.appendChild(fieldsBox);

      b.appendChild(form);
      var foot = el("div"); foot.style.cssText = "display:flex;gap:8px;justify-content:flex-end;padding-top:10px";
      var save = el("button", "btn btn-primary"); save.textContent = "Save";
      save.onclick = function () {
        Object.assign(conn, draft);
        renderInspector();
        b.closest(".modal-ov").remove();
        toast("Connection saved");
      };
      foot.appendChild(save); b.appendChild(foot);
    });
  }

  function renderPanelInspector(body) {
    var p = panelById(S.selection.id); if (!p) { selectDashboard(); return; }
    quickHelp(body, "panel");
    var sec = section(body, "Panel");
    sec.appendChild(field("Title", input(p.title, function (v) { p.title = v; refreshPreview(); renderListsOnly(); })));
    var spanSel = select2pairs([["1", "1 column"], ["2", "2 columns"], ["3", "3 columns"], ["full", "Full width"]], String(p.span), function (v) { p.span = v === "full" ? "full" : +v; refreshPreview(); });
    sec.appendChild(field("Width (span)", spanSel, "Keys: ↑/↓ reorder · Shift+←/→ resize"));
    sec.appendChild(field("Pill (badge)", input(p.pill, function (v) { p.pill = v; refreshPreview(); })));
    sec.appendChild(field("Sub-label", input(p.sub, function (v) { p.sub = v; refreshPreview(); })));
    sec.appendChild(field("Info tooltip", textarea(p.info, function (v) { p.info = v; refreshPreview(); })));
    sec.appendChild(field("Note (visible)", input(p.note || "", function (v) { p.note = v.trim(); refreshPreview(); }),
      "Short annotation shown below the panel title in the preview and exported CDF — stakeholder context at a glance"));
    // N-FUN: a first cut of "story / scrollytelling mode" — an optional narrative line
    // shown ONLY in Slideshow (never in the normal preview/export), distinct from the
    // always-visible panel Note above. Turns Slideshow from "cycle through charts" into
    // "present findings" — one sentence of context per beat, read aloud or on-screen.
    sec.appendChild(field("Slide caption", textarea(p.slideCaption || "", function (v) { p.slideCaption = v.trim(); }),
      "Narration shown only in Slideshow mode (⋯ More → Slideshow) — tell the story of this panel, one beat at a time"));
    // N-FUN: per-step "zoom/highlight" choreography (v272) — a per-panel toggle that plays
    // a brief zoom+glow entrance when this slide appears in Slideshow, so the story can draw
    // the eye to the beat that matters. Slideshow-only, like Slide caption above; the normal
    // preview/export is untouched.
    (function () {
      var zoomRow = el("div"); zoomRow.style.cssText = "display:flex;align-items:center;gap:6px";
      var zoomCb = el("input"); zoomCb.type = "checkbox"; zoomCb.id = "slideZoomCb_" + p.id;
      zoomCb.checked = !!p.slideZoom;
      var zoomLbl = el("label"); zoomLbl.htmlFor = zoomCb.id;
      zoomLbl.className = "check"; zoomLbl.style.cssText = "gap:6px;font-size:12px";
      zoomLbl.appendChild(zoomCb); zoomLbl.appendChild(document.createTextNode("Emphasize this slide"));
      zoomRow.appendChild(zoomLbl);
      sec.appendChild(field("Slide emphasis", zoomRow,
        "Plays a brief zoom + glow entrance when this panel's slide appears in Slideshow — draws the eye to the moment that matters"));
      // N-FUN: per-step "pan" (closes the "pan remains open" note from v272) — the zoom's
      // transform-origin defaults to dead center; these two sliders let it anchor toward a
      // specific spot in the chart instead, so the entrance reads as pushing IN on that region
      // (e.g. a spike near the right edge) rather than a generic whole-panel zoom.
      var focusRow = el("div"); focusRow.style.cssText = "display:flex;align-items:center;gap:10px;margin-top:6px";
      function focusSlider(labelTxt, val, onInput) {
        var wrap = el("span"); wrap.style.cssText = "display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted)";
        var lbl = el("span"); lbl.textContent = labelTxt; wrap.appendChild(lbl);
        var inp = el("input"); inp.type = "range"; inp.min = "0"; inp.max = "100"; inp.step = "1";
        inp.value = String(val); inp.style.width = "80px";
        inp.addEventListener("input", function () { onInput(+inp.value); });
        wrap.appendChild(inp);
        return wrap;
      }
      focusRow.appendChild(focusSlider("Pan X", p.slideFocusX != null ? p.slideFocusX : 50, function (v) { p.slideFocusX = v; }));
      focusRow.appendChild(focusSlider("Pan Y", p.slideFocusY != null ? p.slideFocusY : 50, function (v) { p.slideFocusY = v; }));
      focusRow.style.display = zoomCb.checked ? "flex" : "none";
      zoomCb.addEventListener("change", function () {
        p.slideZoom = zoomCb.checked || undefined;
        focusRow.style.display = zoomCb.checked ? "flex" : "none";
      });
      sec.appendChild(field("Slide pan point", focusRow,
        "Where the emphasis zoom pushes IN toward — drag off-center to frame a specific spike or region of the chart"));
    })();
    // Tags: comma-separated labels that enable tag-based filtering/highlighting in the panel list.
    // Stored as p.tags (array of lowercase trimmed strings) so Studio.allTags() can aggregate them.
    (function () {
      var tagInp = el("input"); tagInp.type = "text";
      tagInp.value = (p.tags || []).join(", ");
      tagInp.placeholder = "revenue, q1, finance  (comma-separated)";
      tagInp.addEventListener("change", function () {
        var raw = tagInp.value.split(",").map(function (t) { return t.trim().toLowerCase(); }).filter(Boolean);
        p.tags = raw.length ? raw : undefined;
        renderListsOnly(); // refresh panel list so tag chips update
      });
      sec.appendChild(field("Tags", tagInp, "Group panels by topic (comma-separated). Filter by tag in the dashboard inspector panel list."));
    })();
    // Per-panel accent color: a colored left border that visually differentiates panels
    // by topic or domain. Native <input type="color"> with a "Clear" button to reset.
    (function () {
      var acW = el("div"); acW.style.cssText = "display:flex;gap:6px;align-items:center";
      var acInp = el("input"); acInp.type = "color";
      acInp.className = "panel-accent-inp";
      acInp.value = p.accentColor || "#005bb5";
      if (!p.accentColor) acInp.style.opacity = "0.38";
      acInp.addEventListener("input", function () { acInp.style.opacity = "1"; p.accentColor = acInp.value; refreshPreview(); });
      var acClr = el("button"); acClr.type = "button"; acClr.textContent = "Clear";
      acClr.className = "rm"; acClr.style.cssText += ";font-size:11px;padding:2px 9px;min-width:0;height:auto;line-height:1.5";
      acClr.onclick = function () { p.accentColor = ""; acInp.value = "#005bb5"; acInp.style.opacity = "0.38"; refreshPreview(); };
      acW.appendChild(acInp); acW.appendChild(acClr);
      sec.appendChild(field("Panel accent", acW, "Adds a colored left border — great for differentiating panels by topic or business domain"));
    })();
    sec.appendChild(field("Section header", input(p.section || "", function (v) { p.section = v.trim(); refreshPreview(); }),
      "Group consecutive panels under a labeled row divider (leave blank to place in the previous section)"));
    sec.appendChild(field("Provenance caption", input(p.src, function (v) { p.src = v; refreshPreview(); })));
    var acts = el("div"); acts.style.cssText = "display:flex;gap:8px;margin-top:2px";
    var dup = el("button", "btn-wide"); setIconBtn(dup, "duplicate", "Duplicate"); dup.onclick = function () { duplicatePanel(p.id); };
    var del = el("button", "btn-wide"); del.style.color = "var(--bad)"; setIconBtn(del, "trash", "Delete"); del.onclick = function () { deletePanel(p.id); };
    acts.appendChild(dup); acts.appendChild(del); sec.appendChild(acts);
    var embedRow = el("div"); embedRow.style.cssText = "display:flex;gap:8px;margin-top:6px";
    var embedBtn = el("button", "btn-wide"); setIconBtn(embedBtn, "code", "Export this panel…"); embedBtn.onclick = function () { exportPanelEmbed(p); };
    embedRow.appendChild(embedBtn); sec.appendChild(embedRow);
    sec.appendChild(noteEl("info", "Downloads a tiny, self-contained HTML file with just this one panel — an embeddable widget you can drop anywhere, no server or the rest of the dashboard needed."));
    var pngRow = el("div"); pngRow.style.cssText = "display:flex;gap:8px;margin-top:6px";
    var pngBtn = el("button", "btn-wide"); setIconBtn(pngBtn, "image", "Save chart as PNG"); pngBtn.onclick = function () { exportPanelPng(p); };
    pngRow.appendChild(pngBtn); sec.appendChild(pngRow);
    sec.appendChild(noteEl("info", "Downloads the chart itself as a PNG image — great for slides/docs. SVG-rendered chart types only (not Table/Richtext); legend and title aren't included, just the chart."));

    // chart type picker — grouped by c.group for scannability (Content group = richtext/annotation)
    var cs = section(body, "Chart type", null, null, "chart-types");

    // N-AI: smart chart recommender — a quick "try one of these" strip above the full
    // gallery, computed from the bound query's own columns/rows. Silently omitted when
    // no query is bound yet, or when nothing rises above the generic fallback.
    if (p.chart.da && p.chart.type !== "richtext") {
      var recoDa = Studio.daById(S.spec, p.chart.da);
      if (recoDa) {
        var recoSd = Studio.sampleRows(recoDa);
        var recoPicks = Studio.recommendCharts(recoSd.cols, recoSd.rows);
        if (recoPicks.length) {
          var recoWrap = el("div", "chart-reco");
          var recoLbl = el("div", "chart-reco-lbl");
          recoLbl.appendChild(Studio.icon("star", 12));
          var recoLblTxt = el("span"); recoLblTxt.textContent = "Recommended for this data";
          recoLbl.appendChild(recoLblTxt);
          recoWrap.appendChild(recoLbl);
          var recoChips = el("div", "chart-reco-chips");
          recoPicks.forEach(function (r) {
            var chip = el("button", "chart-reco-chip" + (p.chart.type === r.type ? " sel" : ""));
            chip.type = "button";
            chip.dataset.type = r.type;
            chip.title = r.why;
            chip.innerHTML = '<span class="ic">' + (CHART_SVG[r.type] || Studio.CHARTS[r.type].icon) + '</span><span>' + r.label + '</span>';
            chip.onclick = function () { changeChartType(p, r.type); };
            recoChips.appendChild(chip);
          });
          recoWrap.appendChild(recoChips);
          cs.appendChild(recoWrap);
        }
      }
    }

    var grid = el("div", "chart-grid");
    var groups = {}, groupOrder = [];
    Object.keys(Studio.CHARTS).forEach(function (t) {
      var g = (Studio.CHARTS[t].group || "Other");
      if (!groups[g]) { groups[g] = []; groupOrder.push(g); }
      groups[g].push(t);
    });

    // H-track: gallery text search — filter cards by chart name or description as you type.
    // Lives above the group tabs so the two filters compose: search narrows first,
    // then the active group tab applies on top (clearing search resets to the tab view).
    var searchWrap = el("div", "cg-search-wrap");
    var searchInp = el("input", "cg-search");
    searchInp.type = "text";
    searchInp.placeholder = "Search chart types…";
    searchInp.setAttribute("aria-label", "Search chart types");
    var clearBtn = el("button", "cg-search-clr");
    clearBtn.type = "button";
    clearBtn.title = "Clear search";
    clearBtn.setAttribute("aria-label", "Clear chart type search");
    var clrIco = Studio.icon("close", 12);
    clrIco.style.pointerEvents = "none";
    clearBtn.appendChild(clrIco);
    clearBtn.style.display = "none";
    searchWrap.appendChild(searchInp);
    searchWrap.appendChild(clearBtn);
    cs.appendChild(searchWrap);

    // H-track: group filter pills — narrow the 32-type gallery to one category.
    // Active filter is local to this render so switching panels doesn't reset it.
    var filterBar = el("div", "cg-filter");
    var _activeGroup = "All";
    function applyFilter(g) {
      _activeGroup = g;
      filterBar.querySelectorAll(".cg-tab").forEach(function (b) { b.classList.toggle("active", b.textContent === g); });
      applyGalleryState();
    }
    // Apply both search query and active group tab together.
    function applyGalleryState() {
      var q = searchInp.value.trim().toLowerCase();
      var isSearch = q.length > 0;
      clearBtn.style.display = isSearch ? "" : "none";
      grid.querySelectorAll(".cg-label").forEach(function (lbl) {
        if (isSearch) { lbl.style.display = "none"; return; }
        lbl.style.display = (_activeGroup === "All" || lbl.dataset.grp === _activeGroup) ? "" : "none";
      });
      grid.querySelectorAll(".chart-opt").forEach(function (card) {
        if (isSearch) {
          // Search mode: match label or description text inside the card
          var text = (card.querySelector(".lb") ? card.querySelector(".lb").textContent : "") +
                     " " + (card.querySelector(".lb-desc") ? card.querySelector(".lb-desc").textContent : "");
          card.style.display = text.toLowerCase().indexOf(q) >= 0 ? "" : "none";
        } else {
          card.style.display = (_activeGroup === "All" || card.dataset.grp === _activeGroup) ? "" : "none";
        }
      });
    }
    searchInp.addEventListener("input", applyGalleryState);
    searchInp.addEventListener("keydown", function (e) { e.stopPropagation(); }); // don't steal global shortcuts
    clearBtn.addEventListener("click", function () { searchInp.value = ""; applyGalleryState(); searchInp.focus(); });
    ["All"].concat(groupOrder).forEach(function (g) {
      var btn = el("button", "cg-tab" + (g === "All" ? " active" : ""));
      btn.textContent = g; btn.type = "button";
      btn.onclick = function () { applyFilter(g); };
      filterBar.appendChild(btn);
    });
    cs.appendChild(filterBar);

    groupOrder.forEach(function (g) {
      var lbl = el("div", "cg-label"); lbl.textContent = g; lbl.dataset.grp = g; grid.appendChild(lbl);
      // Track whether every chart in this group is advanced — if so, the group label should hide too
      var groupHasSimple = false;
      groups[g].forEach(function (t) {
        var c = Studio.CHARTS[t];
        var isAdv = !SIMPLE_CHART_TYPES[t];
        var cls = "chart-opt" + (p.chart.type === t ? " sel" : "") + (isAdv ? " adv-chart" : "");
        var o = el("div", cls);
        o.dataset.grp = g; // used by applyFilter() to show/hide by group
        o.dataset.t = t; // chart type id — lets the command palette (N-FUN) target a specific card
        o.innerHTML = '<div class="ic">' + (CHART_SVG[t] || c.icon) + '</div><div class="lb">' + c.label + '</div>' + (c.desc ? '<div class="lb-desc">' + c.desc + '</div>' : '');
        o.title = c.label + " (" + g + ")";
        o.onclick = function () { changeChartType(p, t); };
        // J4: small docs link — appears on hover in the top-right corner of each card.
        // Opens docs/index.html at the per-chart anchor; stopPropagation so the click
        // doesn't also change the chart type.
        var ctHelp = document.createElement("a");
        ctHelp.href = "docs/index.html#ct-" + t;
        ctHelp.target = "_blank"; ctHelp.rel = "noopener noreferrer";
        ctHelp.className = "ct-help"; ctHelp.title = "Docs: " + c.label;
        ctHelp.setAttribute("aria-label", "Help docs for " + c.label);
        ctHelp.appendChild(Studio.icon("info", 8));
        ctHelp.onclick = function (e) { e.stopPropagation(); };
        o.appendChild(ctHelp);
        grid.appendChild(o);
        if (!isAdv) groupHasSimple = true;
      });
      // If the entire group is advanced, hide the group label in simple mode too
      if (!groupHasSimple) lbl.classList.add("adv-grp");
    });
    cs.appendChild(grid);

    // Richtext content editor — replaces Data / mapping / options / interaction sections.
    // The panel renders this markdown-like text directly; no data source needed.
    if (p.chart.type === "richtext") {
      var rtSec = section(body, "Content");
      var rtHint = el("div"); rtHint.style.cssText = "font-size:11px;color:var(--faint);margin-bottom:4px";
      rtHint.textContent = "Markdown: ## Heading  **bold**  *italic*  `code`  - list";
      rtSec.appendChild(rtHint);
      var rtTa = el("textarea"); rtTa.className = "rt-ta";
      rtTa.rows = 8; rtTa.value = (p.chart.opts || {}).content || "";
      rtTa.placeholder = "## Title\n\nAdd explanatory text, callouts, or section headers...\n\n**Bold text** and *italics* work.\n- List item one\n- List item two";
      rtTa.addEventListener("input", function () {
        if (!p.chart.opts) p.chart.opts = {};
        p.chart.opts.content = rtTa.value;
        refreshPreview();
      });
      rtSec.appendChild(rtTa);
      body.appendChild(noteEl("info", "Text panels have no data binding — they render as-is in the live preview and Dashboard Framework export. Use full-width span for best results."));
      return; // skip DA / options / interaction sections for text panels
    }

    // data binding
    var ds = section(body, "Data", null, null, "data-sources");
    ds.appendChild(field("Query (data access)", daPicker(p.chart.da, function (v) { rebindDA(p, v); })));
    // H-track: "Edit source →" jump link in Advanced mode — one click from a panel to its DA inspector.
    // Hidden in Simple mode (authoring controls are restricted there).
    if (p.chart.da && !S.simpleMode) {
      var esl = el("div", "edit-src-link");
      var esb = el("button", "edit-src-btn"); esb.type = "button";
      esb.appendChild(Studio.icon("edit", 12));
      esb.appendChild(document.createTextNode(" Edit data source"));
      esb.onclick = function () { select({ kind: "da", id: p.chart.da }); };
      esl.appendChild(esb);
      ds.appendChild(esl);
    }
    renderMapping(ds, p);
    renderQueryPeek(body, p.chart.da);
    renderInsight(body, p);

    // options
    var optDefs = (Studio.CHARTS[p.chart.type] || {}).opts || [];
    if (optDefs.length) {
      var os = section(body, "Options");
      optDefs.forEach(function (od) { os.appendChild(optField(p.chart.opts, od)); });
    }
    // Drill-through: click a chart element to navigate to another dashboard.
    // Z8: only shown for chart types the renderer actually wires cfg.drill into (see ANNOT_CAPS).
    if (Studio.chartSupports("drill", p.chart.type)) {
      var drillSec = advSection(body, "Drill-through", null, function () {
        return p.drill && p.drill.url ? p.drill.url.slice(0, 24) : "";
      });
      var drillCfg = p.drill || {};
      drillSec.appendChild(field("Target URL",
        input(drillCfg.url || "", function (v) {
          if (!p.drill) p.drill = {};
          p.drill.url = v.trim();
          refreshPreview();
        })
      ));
      drillSec.appendChild(field("URL parameter",
        input(drillCfg.param || "", function (v) {
          if (!p.drill) p.drill = {};
          p.drill.param = v.trim();
        })
      ));
      drillSec.appendChild(noteEl("info", "Click a bar or donut slice to navigate to the target URL with ?{param}={label}. Uses PDC.drill — carries all active filter values. Leave URL empty to disable."));
    }

    // Detail drawer: click a chart element → open a record-level side-drawer showing underlying rows.
    // Powered by PDC.openDetail (vendored toolkit). Works offline (genMock data) and live (real CDA).
    if (Studio.chartSupports("detail", p.chart.type)) {
      var detailSec = advSection(body, "Detail drawer", null, function () {
        return p.detail && p.detail.da ? p.detail.da : "";
      });
      var detailData = p.detail || {};
      detailSec.appendChild(field("Detail DA",
        daPicker(detailData.da || "", function (v) {
          if (!p.detail) p.detail = {};
          p.detail.da = v;
          refreshPreview();
        }, true)
      ));
      detailSec.appendChild(field("Filter parameter",
        input(detailData.param || "", function (v) {
          if (!p.detail) p.detail = {};
          p.detail.param = v.trim();
        }, "param name (receives clicked label)")
      ));
      detailSec.appendChild(field("Title prefix",
        input(detailData.titlePrefix || "", function (v) {
          if (!p.detail) p.detail = {};
          p.detail.titlePrefix = v.trim();
        }, 'e.g. "Records for"')
      ));
      detailSec.appendChild(field("Noun (plural)",
        input(detailData.noun || "", function (v) {
          if (!p.detail) p.detail = {};
          p.detail.noun = v.trim();
        }, "e.g. records, jobs, pipelines")
      ));
      detailSec.appendChild(noteEl("info", "Click a bar, donut slice, or treemap tile to open a record-level drawer with rows from the selected DA. The filter parameter receives the clicked label. Select a DA to enable."));
    }

    // Cross-filter: clicking a chart element broadcasts a named parameter to panels that share it.
    // Enables coordinated views — e.g. clicking a bar in Panel A filters Panel B if they share a DA param.
    if (Studio.chartSupports("crossFilter", p.chart.type)) {
      var xfSec = advSection(body, "Cross-filter", null, function () {
        return p.crossFilter && p.crossFilter.emit ? p.crossFilter.emit : "";
      });
      var xfCfg = p.crossFilter || {};
      xfSec.appendChild(field("Emit as parameter",
        input(xfCfg.emit || "", function (v) {
          if (!p.crossFilter) p.crossFilter = {};
          p.crossFilter.emit = v.trim();
          refreshPreview();
        }, "param name broadcast on click")
      ));
      xfSec.appendChild(noteEl("info", "Click a bar, donut slice, or treemap tile to set this parameter across all panels whose data source declares a matching parameter name. Click the same element again to clear. Only bars, donut, and treemap emit. Leave blank to disable."));
    }

    // Animation: per-panel entrance animation toggle + speed control.
    // PDC._anim / PDC._animD are set by studio-render.js before each chart call and read by
    // canAnim() / animD() in studio-charts.js — so these settings travel through without changing
    // every individual PDC.* call signature.
    var animSec = section(body, "Animation");
    var animRow = el("div"); animRow.style.cssText = "display:flex;align-items:center;gap:6px";
    var animCb = el("input"); animCb.type = "checkbox"; animCb.id = "animCb_" + p.id;
    animCb.checked = p.animate !== false;
    var animLbl = el("label"); animLbl.htmlFor = animCb.id;
    animLbl.className = "check"; animLbl.style.cssText = "gap:6px;font-size:12px";
    animLbl.appendChild(animCb); animLbl.appendChild(document.createTextNode("Animate entrance"));
    animRow.appendChild(animLbl);
    animSec.appendChild(animRow);
    var durRow = el("div"); durRow.className = "field anim-dur-row"; durRow.style.cssText = "margin-top:4px;" + (p.animate === false ? "display:none" : "");
    var durLbl = el("span", "label"); durLbl.textContent = "Duration (ms)";
    var durWrap = el("div"); durWrap.style.cssText = "display:flex;align-items:center;gap:8px;flex:1";
    var durSlider = el("input"); durSlider.type = "range"; durSlider.min = "100"; durSlider.max = "2000"; durSlider.step = "50";
    durSlider.value = p.animDuration || 600; durSlider.style.flex = "1";
    var durDisplay = el("span"); durDisplay.textContent = (p.animDuration || 600) + " ms";
    durDisplay.style.cssText = "font-size:11px;color:var(--faint);min-width:48px;text-align:right";
    durWrap.appendChild(durSlider); durWrap.appendChild(durDisplay);
    durRow.appendChild(durLbl); durRow.appendChild(durWrap);
    animSec.appendChild(durRow);
    animSec.appendChild(noteEl("info", "Controls whether charts fade / sweep in when first rendered. Disable for dense data or when presenting on slow hardware. The OS prefers-reduced-motion setting always wins."));
    animCb.addEventListener("change", function () {
      p.animate = animCb.checked;
      durRow.style.display = p.animate ? "" : "none";
      refreshPreview();
    });
    durSlider.addEventListener("input", function () {
      p.animDuration = +durSlider.value;
      durDisplay.textContent = durSlider.value + " ms";
    });
    durSlider.addEventListener("change", function () { refreshPreview(); });

    // Target line: horizontal dashed reference marker overlaid on any chart.
    // Positioned as a % from the top of the chart body (0=top, 100=bottom).
    // Useful for Budget, Target, Threshold, Limit — works regardless of chart type.
    (function () {
      var tlSec = advSection(body, "Target line", null, function () {
        return p.targetLine && p.targetLine.label ? '"' + p.targetLine.label.slice(0, 18) + '"' : (p.targetLine ? "defined" : "");
      });
      var tlData = p.targetLine || {};
      tlSec.appendChild(field("Label", input(tlData.label || "", function (v) {
        if (!p.targetLine) p.targetLine = {};
        p.targetLine.label = v.trim();
        refreshPreview();
      }), "e.g. Target, Budget, Limit (leave blank to hide)"));
      // Position slider (0 = top, 100 = bottom of chart body)
      var tlPosW = el("div"); tlPosW.style.cssText = "display:flex;align-items:center;gap:8px;flex:1";
      var tlSlider = el("input"); tlSlider.type = "range"; tlSlider.min = "0"; tlSlider.max = "100"; tlSlider.step = "1";
      tlSlider.value = tlData.pct != null ? tlData.pct : 30; tlSlider.style.flex = "1";
      var tlPct = el("span"); tlPct.textContent = (tlData.pct != null ? tlData.pct : 30) + "%";
      tlPct.style.cssText = "font-size:11px;color:var(--faint);min-width:30px;text-align:right";
      tlPosW.appendChild(tlSlider); tlPosW.appendChild(tlPct);
      tlSec.appendChild(field("Position (% from top)", tlPosW, "0% = chart top · 100% = chart bottom"));
      tlSlider.addEventListener("input", function () { tlPct.textContent = tlSlider.value + "%"; });
      tlSlider.addEventListener("change", function () {
        if (!p.targetLine) p.targetLine = {};
        p.targetLine.pct = +tlSlider.value;
        refreshPreview();
      });
      // Color picker + clear
      var tlColW = el("div"); tlColW.style.cssText = "display:flex;gap:6px;align-items:center";
      var tlColInp = el("input"); tlColInp.type = "color"; tlColInp.className = "panel-accent-inp";
      tlColInp.value = tlData.color || "#e74c3c";
      if (!tlData.color) tlColInp.style.opacity = "0.38";
      tlColInp.addEventListener("input", function () {
        if (!p.targetLine) p.targetLine = {};
        tlColInp.style.opacity = "1"; p.targetLine.color = tlColInp.value; refreshPreview();
      });
      var tlClr = el("button"); tlClr.type = "button"; tlClr.textContent = "Clear";
      tlClr.className = "rm"; tlClr.style.cssText += ";font-size:11px;padding:2px 9px;min-width:0;height:auto;line-height:1.5";
      tlClr.onclick = function () { p.targetLine = undefined; tlColInp.value = "#e74c3c"; tlColInp.style.opacity = "0.38"; refreshPreview(); };
      tlColW.appendChild(tlColInp); tlColW.appendChild(tlClr);
      tlSec.appendChild(field("Line color", tlColW));
    })();

    // Reference band: shaded semi-transparent range overlay between two vertical %
    // positions. Useful for "normal range", "acceptable zone", "target band", etc.
    (function () {
      var rbSec = advSection(body, "Reference band", null, function () {
        return p.refBand && p.refBand.label ? '"' + p.refBand.label.slice(0, 18) + '"' : (p.refBand ? "defined" : "");
      });
      var rbData = p.refBand || {};
      rbSec.appendChild(field("Label", input(rbData.label || "", function (v) {
        if (!p.refBand) p.refBand = {};
        p.refBand.label = v.trim();
        refreshPreview();
      }), "e.g. Normal Range, Acceptable Zone (leave blank to hide)"));
      // Top edge slider
      var rbTopW = el("div"); rbTopW.style.cssText = "display:flex;align-items:center;gap:8px;flex:1";
      var rbTopSlider = el("input"); rbTopSlider.type = "range"; rbTopSlider.min = "0"; rbTopSlider.max = "100"; rbTopSlider.step = "1";
      rbTopSlider.value = rbData.topPct != null ? rbData.topPct : 20; rbTopSlider.style.flex = "1";
      var rbTopPct = el("span"); rbTopPct.textContent = (rbData.topPct != null ? rbData.topPct : 20) + "%";
      rbTopPct.style.cssText = "font-size:11px;color:var(--faint);min-width:30px;text-align:right";
      rbTopW.appendChild(rbTopSlider); rbTopW.appendChild(rbTopPct);
      rbSec.appendChild(field("Top edge (% from top)", rbTopW, "0% = chart top · 100% = bottom"));
      rbTopSlider.addEventListener("input", function () { rbTopPct.textContent = rbTopSlider.value + "%"; });
      rbTopSlider.addEventListener("change", function () {
        if (!p.refBand) p.refBand = {};
        p.refBand.topPct = +rbTopSlider.value;
        refreshPreview();
      });
      // Bottom edge slider
      var rbBotW = el("div"); rbBotW.style.cssText = "display:flex;align-items:center;gap:8px;flex:1";
      var rbBotSlider = el("input"); rbBotSlider.type = "range"; rbBotSlider.min = "0"; rbBotSlider.max = "100"; rbBotSlider.step = "1";
      rbBotSlider.value = rbData.bottomPct != null ? rbData.bottomPct : 50; rbBotSlider.style.flex = "1";
      var rbBotPct = el("span"); rbBotPct.textContent = (rbData.bottomPct != null ? rbData.bottomPct : 50) + "%";
      rbBotPct.style.cssText = "font-size:11px;color:var(--faint);min-width:30px;text-align:right";
      rbBotW.appendChild(rbBotSlider); rbBotW.appendChild(rbBotPct);
      rbSec.appendChild(field("Bottom edge (% from top)", rbBotW, "drag both sliders to set band height"));
      rbBotSlider.addEventListener("input", function () { rbBotPct.textContent = rbBotSlider.value + "%"; });
      rbBotSlider.addEventListener("change", function () {
        if (!p.refBand) p.refBand = {};
        p.refBand.bottomPct = +rbBotSlider.value;
        refreshPreview();
      });
      // Fill color + Clear
      var rbColW = el("div"); rbColW.style.cssText = "display:flex;gap:6px;align-items:center";
      var rbColInp = el("input"); rbColInp.type = "color"; rbColInp.className = "panel-accent-inp";
      rbColInp.value = rbData.color || "#2ecc71";
      if (!rbData.color) rbColInp.style.opacity = "0.38";
      rbColInp.addEventListener("input", function () {
        if (!p.refBand) p.refBand = {};
        rbColInp.style.opacity = "1"; p.refBand.color = rbColInp.value; refreshPreview();
      });
      var rbClr = el("button"); rbClr.type = "button"; rbClr.textContent = "Clear";
      rbClr.className = "rm"; rbClr.style.cssText += ";font-size:11px;padding:2px 9px;min-width:0;height:auto;line-height:1.5";
      rbClr.onclick = function () { p.refBand = undefined; rbColInp.value = "#2ecc71"; rbColInp.style.opacity = "0.38"; refreshPreview(); };
      rbColW.appendChild(rbColInp); rbColW.appendChild(rbClr);
      rbSec.appendChild(field("Fill color", rbColW));
    })();

    // Callout arrow: SVG text bubble + dashed leader line pointing to an (x%, y%) position.
    // Useful for "Peak here", "Outlier", "Watch this" narrative annotations on any chart.
    (function () {
      var caSec = advSection(body, "Callout arrow", null, function () {
        return p.callout && p.callout.text ? '"' + p.callout.text.slice(0, 18) + '"' : "";
      });
      var caData = p.callout || {};
      caSec.appendChild(field("Text", input(caData.text || "", function (v) {
        if (!p.callout) p.callout = {};
        p.callout.text = v.trim();
        refreshPreview();
      }, 'e.g. "Peak", "Drop point", "Alert"')));
      // X position slider
      var caXW = el("div"); caXW.style.cssText = "display:flex;align-items:center;gap:8px;flex:1";
      var caXSlider = el("input"); caXSlider.type = "range"; caXSlider.min = "0"; caXSlider.max = "100"; caXSlider.step = "1";
      caXSlider.value = caData.x != null ? caData.x : 50; caXSlider.style.flex = "1";
      var caXPct = el("span"); caXPct.textContent = (caData.x != null ? caData.x : 50) + "%";
      caXPct.style.cssText = "font-size:11px;color:var(--faint);min-width:30px;text-align:right";
      caXW.appendChild(caXSlider); caXW.appendChild(caXPct);
      caSec.appendChild(field("Tip X (% from left)", caXW, "0% = far left · 100% = far right"));
      caXSlider.addEventListener("input", function () { caXPct.textContent = caXSlider.value + "%"; });
      caXSlider.addEventListener("change", function () {
        if (!p.callout) p.callout = {};
        p.callout.x = +caXSlider.value; refreshPreview();
      });
      // Y position slider
      var caYW = el("div"); caYW.style.cssText = "display:flex;align-items:center;gap:8px;flex:1";
      var caYSlider = el("input"); caYSlider.type = "range"; caYSlider.min = "0"; caYSlider.max = "100"; caYSlider.step = "1";
      caYSlider.value = caData.y != null ? caData.y : 30; caYSlider.style.flex = "1";
      var caYPct = el("span"); caYPct.textContent = (caData.y != null ? caData.y : 30) + "%";
      caYPct.style.cssText = "font-size:11px;color:var(--faint);min-width:30px;text-align:right";
      caYW.appendChild(caYSlider); caYW.appendChild(caYPct);
      caSec.appendChild(field("Tip Y (% from top)", caYW, "0% = chart top · 100% = chart bottom"));
      caYSlider.addEventListener("input", function () { caYPct.textContent = caYSlider.value + "%"; });
      caYSlider.addEventListener("change", function () {
        if (!p.callout) p.callout = {};
        p.callout.y = +caYSlider.value; refreshPreview();
      });
      // Color picker + clear
      var caColW = el("div"); caColW.style.cssText = "display:flex;gap:6px;align-items:center";
      var caColInp = el("input"); caColInp.type = "color"; caColInp.className = "panel-accent-inp";
      caColInp.value = caData.color || "#e74c3c";
      if (!caData.color) caColInp.style.opacity = "0.38";
      caColInp.addEventListener("input", function () {
        if (!p.callout) p.callout = {};
        caColInp.style.opacity = "1"; p.callout.color = caColInp.value; refreshPreview();
      });
      var caClr = el("button"); caClr.type = "button"; caClr.textContent = "Clear";
      caClr.className = "rm"; caClr.style.cssText += ";font-size:11px;padding:2px 9px;min-width:0;height:auto;line-height:1.5";
      caClr.onclick = function () { p.callout = undefined; caColInp.value = "#e74c3c"; caColInp.style.opacity = "0.38"; refreshPreview(); };
      caColW.appendChild(caColInp); caColW.appendChild(caClr);
      caSec.appendChild(field("Color", caColW));
      caSec.appendChild(noteEl("info", "Overlay a text bubble with a dashed arrow pointing at (x%, y%) of the chart area — position is visual, not data-scaled. Works for any chart type. Leave text blank to hide."));
    })();

    // Period highlight: semi-transparent vertical band across an x% range of the chart body.
    // Most useful for line, stacked-area, combo, bar, and stacked charts where you want to
    // draw attention to a specific time-period, data-range, or group of columns — e.g.
    // "Q3 surge", "Baseline period", "Before/after event". Position is visual (% of width),
    // not data-scaled, so it works independently of what columns are bound. Type-aware: only
    // shown for chart types that have a meaningful horizontal x-axis to highlight.
    (function () {
      var _phTypes = ["line", "areaStacked", "streamgraph", "combo", "stacked", "bars"];
      if (_phTypes.indexOf(p.chart.type) === -1) return; // skip for polar/donut/etc.
      var phSec = advSection(body, "Period highlight", null, function () {
        return p.periodHighlight && p.periodHighlight.label ? '"' + p.periodHighlight.label.slice(0, 18) + '"' : (p.periodHighlight ? "defined" : "");
      });
      var phData = p.periodHighlight || {};

      phSec.appendChild(field("Label", input(phData.label || "", function (v) {
        if (!p.periodHighlight) p.periodHighlight = {};
        p.periodHighlight.label = v.trim();
        refreshPreview();
      }), 'e.g. "Q3 surge", "Baseline", "Event window" (leave blank to hide)'));

      // Left edge % slider
      var phLW = el("div"); phLW.style.cssText = "display:flex;align-items:center;gap:8px;flex:1";
      var phLSlider = el("input"); phLSlider.type = "range"; phLSlider.min = "0"; phLSlider.max = "100"; phLSlider.step = "1";
      phLSlider.value = phData.xStart != null ? phData.xStart : 25; phLSlider.style.flex = "1";
      var phLPct = el("span"); phLPct.textContent = (phData.xStart != null ? phData.xStart : 25) + "%";
      phLPct.style.cssText = "font-size:11px;color:var(--faint);min-width:30px;text-align:right";
      phLW.appendChild(phLSlider); phLW.appendChild(phLPct);
      phSec.appendChild(field("Left edge (% from left)", phLW, "0% = chart left edge"));
      phLSlider.addEventListener("input", function () { phLPct.textContent = phLSlider.value + "%"; });
      phLSlider.addEventListener("change", function () {
        if (!p.periodHighlight) p.periodHighlight = {};
        p.periodHighlight.xStart = +phLSlider.value;
        refreshPreview();
      });

      // Right edge % slider
      var phRW = el("div"); phRW.style.cssText = "display:flex;align-items:center;gap:8px;flex:1";
      var phRSlider = el("input"); phRSlider.type = "range"; phRSlider.min = "0"; phRSlider.max = "100"; phRSlider.step = "1";
      phRSlider.value = phData.xEnd != null ? phData.xEnd : 60; phRSlider.style.flex = "1";
      var phRPct = el("span"); phRPct.textContent = (phData.xEnd != null ? phData.xEnd : 60) + "%";
      phRPct.style.cssText = "font-size:11px;color:var(--faint);min-width:30px;text-align:right";
      phRW.appendChild(phRSlider); phRW.appendChild(phRPct);
      phSec.appendChild(field("Right edge (% from left)", phRW, "set both sliders to define band width"));
      phRSlider.addEventListener("input", function () { phRPct.textContent = phRSlider.value + "%"; });
      phRSlider.addEventListener("change", function () {
        if (!p.periodHighlight) p.periodHighlight = {};
        p.periodHighlight.xEnd = +phRSlider.value;
        refreshPreview();
      });

      // Fill color + clear
      var phColW = el("div"); phColW.style.cssText = "display:flex;gap:6px;align-items:center";
      var phColInp = el("input"); phColInp.type = "color"; phColInp.className = "panel-accent-inp";
      phColInp.value = phData.color || "#3498db";
      if (!phData.color) phColInp.style.opacity = "0.38";
      phColInp.addEventListener("input", function () {
        if (!p.periodHighlight) p.periodHighlight = {};
        phColInp.style.opacity = "1"; p.periodHighlight.color = phColInp.value; refreshPreview();
      });
      var phClr = el("button"); phClr.type = "button"; phClr.textContent = "Clear";
      phClr.className = "rm"; phClr.style.cssText += ";font-size:11px;padding:2px 9px;min-width:0;height:auto;line-height:1.5";
      phClr.onclick = function () { p.periodHighlight = undefined; phColInp.value = "#3498db"; phColInp.style.opacity = "0.38"; refreshPreview(); };
      phColW.appendChild(phColInp); phColW.appendChild(phClr);
      phSec.appendChild(field("Fill color", phColW));
      phSec.appendChild(noteEl("info", "Semi-transparent vertical band across an x-range of the chart body — ideal for highlighting a time period, a baseline window, or a before/after event boundary on line and bar charts. Position is visual (% of width), not data-scaled."));
    })();

    // Event markers: named vertical dashed tick lines at specific x% positions.
    // Perfect for annotating precise events like "Product launch", "Incident", "Campaign start"
    // on line and bar charts. Each marker is a {label, xPct, color} object. Multiple markers
    // are supported. Type-aware: only shown for chart types with a horizontal x-axis.
    (function () {
      var _emTypes = ["line", "areaStacked", "streamgraph", "combo", "stacked", "bars"];
      if (_emTypes.indexOf(p.chart.type) === -1) return;
      var emSec = advSection(body, "Event markers", null, function () {
        var n = p.eventMarkers && p.eventMarkers.length;
        return n ? n + (n === 1 ? " marker" : " markers") : "";
      });
      var emList = el("div"); emList.style.cssText = "display:flex;flex-direction:column;gap:4px;margin-bottom:6px";
      emSec.appendChild(emList);

      function renderEmItems() {
        emList.innerHTML = "";
        (p.eventMarkers || []).forEach(function (m, idx) {
          var row = el("div"); row.style.cssText = "display:flex;gap:3px;align-items:center;flex-wrap:wrap";

          // Label text input
          var lblInp = el("input"); lblInp.type = "text"; lblInp.className = "dsb-sqb-inp";
          lblInp.style.cssText = "flex:1;min-width:80px;font-size:12px;height:26px;padding:0 6px";
          lblInp.value = m.label || ""; lblInp.placeholder = "Marker label";
          lblInp.addEventListener("change", function () { m.label = lblInp.value.trim(); refreshPreview(); });

          // X% slider
          var xWrap = el("div"); xWrap.style.cssText = "display:flex;align-items:center;gap:4px;flex:1;min-width:80px";
          var xSl = el("input"); xSl.type = "range"; xSl.min = "0"; xSl.max = "100"; xSl.step = "1";
          xSl.value = m.xPct != null ? m.xPct : 50; xSl.style.flex = "1";
          var xPctLbl = el("span"); xPctLbl.textContent = xSl.value + "%";
          xPctLbl.style.cssText = "font-size:11px;color:var(--faint);min-width:28px;text-align:right";
          xSl.addEventListener("input", function () { xPctLbl.textContent = xSl.value + "%"; });
          xSl.addEventListener("change", function () { m.xPct = +xSl.value; refreshPreview(); });
          xWrap.appendChild(xSl); xWrap.appendChild(xPctLbl);

          // Color picker
          var colInp = el("input"); colInp.type = "color"; colInp.className = "panel-accent-inp";
          colInp.style.cssText = "width:26px;height:26px;padding:1px 2px;flex-shrink:0;cursor:pointer;border-radius:4px";
          colInp.value = (m.color && /^#/.test(m.color)) ? m.color : "#e74c3c";
          colInp.addEventListener("input", function () { m.color = colInp.value; refreshPreview(); });
          colInp.title = "Marker color";

          // Delete button
          var delBtn = el("button"); delBtn.type = "button"; delBtn.title = "Remove marker";
          delBtn.innerHTML = Studio.icon("trash", 12);
          delBtn.className = "rm icobtn";
          delBtn.style.cssText = "flex-shrink:0;width:24px;height:26px;padding:0;min-width:0";
          (function (i) {
            delBtn.addEventListener("click", function () {
              p.eventMarkers.splice(i, 1);
              if (!p.eventMarkers.length) p.eventMarkers = undefined;
              renderEmItems(); refreshPreview();
            });
          })(idx);

          row.appendChild(lblInp); row.appendChild(xWrap); row.appendChild(colInp); row.appendChild(delBtn);
          emList.appendChild(row);
        });
      }
      renderEmItems();

      var addEmBtn = el("button"); addEmBtn.type = "button"; addEmBtn.className = "rm cf-add-rule";
      addEmBtn.style.cssText = "font-size:11.5px;padding:3px 10px;margin-top:2px";
      addEmBtn.textContent = "+ Add marker";
      addEmBtn.addEventListener("click", function () {
        if (!p.eventMarkers) p.eventMarkers = [];
        p.eventMarkers.push({ label: "Event", xPct: 50, color: "#e74c3c" });
        renderEmItems(); refreshPreview();
      });
      emSec.appendChild(addEmBtn);
      emSec.appendChild(noteEl("info", "Named vertical dashed lines at precise x-positions — annotate 'Product launch', 'Incident', 'Campaign start' on line and bar charts. Position is visual (% from chart left), not data-scaled. Pairs well with period highlight for broad bands."));
    })();

    // Scatter point annotations: text labels pinned at visual (x%, y%) positions on scatter charts.
    // Each annotation highlights a feature of the data (an outlier, a cluster, a critical point).
    // Each item is {text, xPct, yPct, color}. Type-aware: only shown for scatter chart type.
    (function () {
      if (p.chart.type !== "scatter") return;
      var saSec = advSection(body, "Point annotations", null, function () {
        var n = p.scatterAnnotations && p.scatterAnnotations.length;
        return n ? n + (n === 1 ? " annotation" : " annotations") : "";
      });
      var saList = el("div"); saList.style.cssText = "display:flex;flex-direction:column;gap:6px;margin-bottom:6px";
      saSec.appendChild(saList);

      function renderSaItems() {
        saList.innerHTML = "";
        (p.scatterAnnotations || []).forEach(function (a, idx) {
          // Row 1: label text + color + delete
          var row1 = el("div"); row1.style.cssText = "display:flex;gap:3px;align-items:center";
          var txtInp = el("input"); txtInp.type = "text"; txtInp.className = "dsb-sqb-inp";
          txtInp.style.cssText = "flex:1;min-width:0;font-size:12px;height:26px;padding:0 6px";
          txtInp.value = a.text || ""; txtInp.placeholder = "Annotation text";
          txtInp.addEventListener("change", function () { a.text = txtInp.value.trim(); refreshPreview(); });
          var colInp = el("input"); colInp.type = "color"; colInp.className = "panel-accent-inp";
          colInp.style.cssText = "width:26px;height:26px;padding:1px 2px;flex-shrink:0;cursor:pointer;border-radius:4px";
          colInp.value = (a.color && /^#/.test(a.color)) ? a.color : "#005bb5";
          colInp.addEventListener("input", function () { a.color = colInp.value; refreshPreview(); });
          colInp.title = "Annotation color";
          var delBtn = el("button"); delBtn.type = "button"; delBtn.title = "Remove annotation";
          delBtn.innerHTML = Studio.icon("trash", 12);
          delBtn.className = "rm icobtn";
          delBtn.style.cssText = "flex-shrink:0;width:24px;height:26px;padding:0;min-width:0";
          (function (i) {
            delBtn.addEventListener("click", function () {
              p.scatterAnnotations.splice(i, 1);
              if (!p.scatterAnnotations.length) p.scatterAnnotations = undefined;
              renderSaItems(); refreshPreview();
            });
          })(idx);
          row1.appendChild(txtInp); row1.appendChild(colInp); row1.appendChild(delBtn);
          saList.appendChild(row1);

          // Row 2: x%/y% position sliders
          var row2 = el("div"); row2.style.cssText = "display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding-left:2px";
          function mkPosSl(label, val, onCh) {
            var w = el("div"); w.style.cssText = "display:flex;align-items:center;gap:3px;flex:1;min-width:80px";
            var capLbl = el("span"); capLbl.style.cssText = "font-size:10.5px;color:var(--faint);white-space:nowrap";
            capLbl.textContent = label + ":";
            var sl = el("input"); sl.type = "range"; sl.min = "0"; sl.max = "100"; sl.step = "1";
            sl.value = val != null ? val : 50; sl.style.flex = "1";
            var pLbl = el("span"); pLbl.style.cssText = "font-size:10.5px;color:var(--faint);min-width:26px;text-align:right";
            pLbl.textContent = sl.value + "%";
            sl.addEventListener("input", function () { pLbl.textContent = sl.value + "%"; });
            sl.addEventListener("change", function () { onCh(+sl.value); });
            w.appendChild(capLbl); w.appendChild(sl); w.appendChild(pLbl);
            return w;
          }
          (function (ann) {
            row2.appendChild(mkPosSl("X", ann.xPct, function (v) { ann.xPct = v; refreshPreview(); }));
            row2.appendChild(mkPosSl("Y", ann.yPct, function (v) { ann.yPct = v; refreshPreview(); }));
          })(a);
          saList.appendChild(row2);
        });
      }
      renderSaItems();

      var addSaBtn = el("button"); addSaBtn.type = "button"; addSaBtn.className = "rm cf-add-rule";
      addSaBtn.style.cssText = "font-size:11.5px;padding:3px 10px;margin-top:2px";
      addSaBtn.textContent = "+ Add annotation";
      addSaBtn.addEventListener("click", function () {
        if (!p.scatterAnnotations) p.scatterAnnotations = [];
        p.scatterAnnotations.push({ text: "Outlier", xPct: 50, yPct: 30, color: "#005bb5" });
        renderSaItems(); refreshPreview();
      });
      saSec.appendChild(addSaBtn);
      saSec.appendChild(noteEl("info", "Text labels pinned at visual (x%, y%) positions on the scatter plot — great for highlighting outliers, clusters, or significant data regions. x%=0 is the left edge, y%=0 is the top. Position is visual, not data-scaled."));
    })();

    // Conditional formatting: threshold rules that color chart elements (bars, donut slices,
    // treemap tiles, lollipop dots) by their value. Rules apply top-to-bottom; first match wins.
    // Works by injecting a per-item .color property into the data array that PDC.bars/donut/treemap
    // already supports — so pdc-ui.js stays pristine and all chart rendering is unchanged.
    (function () {
      if (!Studio.chartSupports("condFmt", p.chart.type)) return; // Z8: bars/donut/treemap/lollipop only
      var cfSec = advSection(body, "Conditional formatting", null, function () {
        var n = p.condFmt && p.condFmt.length;
        return n ? n + (n === 1 ? " rule" : " rules") : "";
      });
      var cfList = el("div"); cfList.style.cssText = "display:flex;flex-direction:column;gap:4px;margin-bottom:6px";
      cfSec.appendChild(cfList);

      function renderCfRules() {
        cfList.innerHTML = "";
        (p.condFmt || []).forEach(function (r, idx) {
          var row = el("div"); row.style.cssText = "display:flex;gap:3px;align-items:center";

          // Operator select
          var opSel = el("select"); opSel.className = "dsb-sqb-inp";
          opSel.style.cssText = "flex:0 0 auto;width:48px;font-size:12px;height:26px;padding:0 2px";
          [">=", ">", "<=", "<", "=", "!="].forEach(function (op) {
            var opt = document.createElement("option"); opt.value = op; opt.textContent = op;
            if (r.op === op) opt.selected = true;
            opSel.appendChild(opt);
          });
          opSel.addEventListener("change", function () { r.op = opSel.value; refreshPreview(); });

          // Threshold value input
          var valInp = el("input"); valInp.type = "number"; valInp.className = "dsb-sqb-inp";
          valInp.style.cssText = "flex:1;min-width:0;font-size:12px;height:26px;padding:0 6px";
          valInp.value = r.value != null ? r.value : "";
          valInp.placeholder = "threshold";
          valInp.addEventListener("change", function () { r.value = +valInp.value; refreshPreview(); });

          // Color picker
          var colInp = el("input"); colInp.type = "color"; colInp.className = "panel-accent-inp";
          colInp.style.cssText = "width:26px;height:26px;padding:1px 2px;flex-shrink:0;cursor:pointer;border-radius:4px";
          colInp.value = (r.color && /^#/.test(r.color)) ? r.color : "#2ecc71";
          colInp.addEventListener("input", function () { r.color = colInp.value; refreshPreview(); });
          colInp.title = "Rule color";

          // Delete rule button
          var delBtn = el("button"); delBtn.type = "button"; delBtn.title = "Remove rule";
          delBtn.innerHTML = Studio.icon("trash", 12);
          delBtn.className = "rm icobtn";
          delBtn.style.cssText = "flex-shrink:0;width:24px;height:26px;padding:0;min-width:0";
          delBtn.addEventListener("click", function () {
            p.condFmt.splice(idx, 1);
            if (!p.condFmt.length) p.condFmt = undefined;
            renderCfRules(); refreshPreview();
          });

          row.appendChild(opSel); row.appendChild(valInp); row.appendChild(colInp); row.appendChild(delBtn);
          cfList.appendChild(row);
        });
      }
      renderCfRules();

      var addCfBtn = el("button"); addCfBtn.type = "button"; addCfBtn.className = "rm cf-add-rule";
      addCfBtn.style.cssText = "font-size:11.5px;padding:3px 10px;margin-top:2px";
      addCfBtn.textContent = "+ Add rule";
      addCfBtn.addEventListener("click", function () {
        if (!p.condFmt) p.condFmt = [];
        // Default new rules cycle through green → amber → red for instant traffic-light setup
        var defaults = ["#27ae60", "#e67e22", "#e74c3c"];
        p.condFmt.push({ op: ">=", value: 0, color: defaults[p.condFmt.length % defaults.length] });
        renderCfRules(); refreshPreview();
      });
      cfSec.appendChild(addCfBtn);
      cfSec.appendChild(noteEl("info", "Color bars, donut slices, treemap tiles, and lollipop dots based on value. Rules apply top-to-bottom; first match wins. Works in preview and exported CDF."));
    })();

    // Color scale: map a continuous numeric range to a smooth gradient across all bars / slices.
    // Complementary to conditional formatting — condFmt threshold rules override the gradient
    // for specific items, giving precise control without removing the overall visual encoding.
    (function () {
      if (!Studio.chartSupports("colorScale", p.chart.type)) return; // Z8: bars/donut/treemap/lollipop only
      var csSec = advSection(body, "Color scale", null, function () {
        return p.colorScale && p.colorScale.enabled ? "gradient enabled" : "";
      });
      var csData = p.colorScale || {};

      // Enable toggle
      var csRow = el("div"); csRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:6px";
      var csLbl = el("label", "check"); csLbl.style.fontSize = "12.5px";
      var csCb = el("input"); csCb.type = "checkbox"; csCb.checked = !!(csData.enabled);
      csCb.addEventListener("change", function () {
        if (!p.colorScale) p.colorScale = {};
        p.colorScale.enabled = csCb.checked;
        csData = p.colorScale;
        refreshPreview();
      });
      csLbl.appendChild(csCb); csLbl.appendChild(document.createTextNode(" Enable color scale"));
      csRow.appendChild(csLbl);
      csSec.appendChild(csRow);

      // Low color (min value) and high color (max value) with a gradient swatch between them
      var csLowW = el("div"); csLowW.style.display = "flex"; csLowW.style.alignItems = "center"; csLowW.style.gap = "5px";
      var csLowInp = el("input"); csLowInp.type = "color";
      csLowInp.style.cssText = "width:30px;height:26px;padding:1px 2px;cursor:pointer;border-radius:4px;flex-shrink:0";
      csLowInp.value = (csData.low && /^#[0-9a-fA-F]{6}$/.test(csData.low)) ? csData.low : "#005bb5";
      csLowInp.title = "Color for the minimum value";
      csLowInp.addEventListener("input", function () {
        if (!p.colorScale) p.colorScale = {};
        p.colorScale.enabled = true; csCb.checked = true;
        p.colorScale.low = csLowInp.value; csData = p.colorScale;
        updateSwatch(); refreshPreview();
      });
      var csHighInp = el("input"); csHighInp.type = "color";
      csHighInp.style.cssText = "width:30px;height:26px;padding:1px 2px;cursor:pointer;border-radius:4px;flex-shrink:0";
      csHighInp.value = (csData.high && /^#[0-9a-fA-F]{6}$/.test(csData.high)) ? csData.high : "#c0392b";
      csHighInp.title = "Color for the maximum value";
      csHighInp.addEventListener("input", function () {
        if (!p.colorScale) p.colorScale = {};
        p.colorScale.enabled = true; csCb.checked = true;
        p.colorScale.high = csHighInp.value; csData = p.colorScale;
        updateSwatch(); refreshPreview();
      });
      // Gradient swatch strip shows the current low→high blend at a glance
      var csSwatch = el("div");
      csSwatch.style.cssText = "flex:1;height:18px;border-radius:4px;background:linear-gradient(to right," + csLowInp.value + "," + csHighInp.value + ");border:1px solid var(--border)";
      function updateSwatch() { csSwatch.style.background = "linear-gradient(to right," + csLowInp.value + "," + csHighInp.value + ")"; }
      csLowW.appendChild(csLowInp); csLowW.appendChild(csSwatch); csLowW.appendChild(csHighInp);
      csSec.appendChild(field("Low → High color", csLowW));
      csSec.appendChild(noteEl("info", "Colors all bars, slices, treemap tiles, and lollipop dots on a smooth gradient from low (min value) to high (max value). Conditional formatting rules above override the gradient for specific items."));
    })();
  }

  // N-AI: "Explain this chart" — a short auto-generated plain-English narration
  // (trend / biggest move / outlier) computed purely client-side over the panel's
  // own sample rows. No API key, no network call. Silently skipped when the chart
  // has no single value column to reason about (e.g. tables, richtext, sankey).
  function renderInsight(body, p) {
    var da = Studio.daById(S.spec, p.chart.da); if (!da) return;
    var m = p.chart.map || {};
    var sd = Studio.sampleRows(da);
    var text, notable;
    if (p.chart.type === "scatter" && m.xCol && m.yCol) {
      // Two-variable charts get a correlation read instead of a single-series trend.
      text = Studio.computeCorrelation(sd.cols, sd.rows, m.xCol, m.yCol);
    } else {
      var valueCol = m.valueCol || (m.series && m.series[0] && m.series[0].col);
      var labelCol = m.labelCol || m.dateCol || m.xCol;
      if (!valueCol) return;
      text = Studio.computeInsights(sd.cols, sd.rows, labelCol, valueCol);
      notable = Studio.notablePoint(sd.cols, sd.rows, labelCol, valueCol);
    }
    if (!text) return;
    var sec = section(body, "Insight");
    var box = el("div", "insight-box");
    box.appendChild(Studio.icon("info", 12));
    var span = el("span"); span.textContent = text;
    box.appendChild(span);
    sec.appendChild(box);
    sec.appendChild(noteEl("info", "Auto-generated from this panel's own sample data (offline, no API) — a quick read on trend, the biggest single move, and any outlier."));
    // N-AI: "auto-placed callout markers on the notable points" — one click drops the
    // existing Callout arrow overlay (see below) right on the outlier/biggest-move point
    // this narration just called out, instead of the user having to eyeball x%/y% sliders.
    if (notable) {
      var caBtn = el("button", "btn-cb-text"); caBtn.type = "button";
      caBtn.id = "insightAddCallout";
      caBtn.textContent = "Add callout at “" + notable.label + "”";
      caBtn.style.marginTop = "6px";
      caBtn.onclick = function () {
        p.callout = {
          text: notable.kind === "outlier" ? "Outlier" : "Biggest move",
          x: notable.x, y: notable.y,
          color: (p.callout && p.callout.color) || "#e74c3c"
        };
        refreshPreview(); renderInspector();
        toast("Callout added at the flagged point.");
      };
      sec.appendChild(caBtn);
    }
  }

  function renderQueryPeek(body, daId) {
    var da = Studio.daById(S.spec, daId); if (!da) return;
    var peek = section(body, "Query preview", null, null, "data-sources");
    // SQL snippet
    var sql = (da.sql || "").trim();
    if (sql) {
      var sqlWrap = el("div", "qpeek-sql-wrap");
      var sqlEl = el("pre", "qpeek-sql"); sqlEl.textContent = sql.length > 140 ? sql.slice(0, 140) + "…" : sql;
      sqlWrap.appendChild(sqlEl);
      if (sql.length > 140) {
        var exp = el("button", "qpeek-expand"); exp.textContent = "Show full SQL";
        var expanded = false;
        exp.onclick = function () {
          expanded = !expanded;
          sqlEl.textContent = expanded ? sql : sql.slice(0, 140) + "…";
          exp.textContent = expanded ? "Collapse SQL" : "Show full SQL";
        };
        sqlWrap.appendChild(exp);
      }
      peek.appendChild(sqlWrap);
    }
    // sample data table
    var sd = Studio.sampleRows(da);
    if (sd.rows.length) {
      var tbl = el("table", "qpeek-tbl");
      var thead = el("thead"), hr = el("tr");
      sd.cols.forEach(function (c) { var th = el("th"); th.textContent = c; hr.appendChild(th); });
      thead.appendChild(hr); tbl.appendChild(thead);
      var tbody = el("tbody");
      sd.rows.slice(0, 3).forEach(function (row) {
        var tr = el("tr");
        row.forEach(function (v) { var td = el("td"); td.textContent = v == null ? "" : String(v); tr.appendChild(td); });
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      var tblWrap = el("div", "qpeek-tbl-wrap"); tblWrap.appendChild(tbl);
      var rowCount = el("div", "qpeek-hint");
      rowCount.textContent = sd.cols.length + " columns · sample rows (offline)";
      peek.appendChild(tblWrap); peek.appendChild(rowCount);
      // N-DATA: data quality watchdog — quick smells (blanks, a constant column, duplicate
      // rows) found in this same sample, surfaced right where the DA is browsed/edited.
      Studio.dataQualityIssues(sd.cols, sd.rows).forEach(function (issue) {
        peek.appendChild(noteEl("warn", Studio.dataQualityMessage(issue)));
      });
    }
  }

  // K6: detect whether any required (non-optional) mapping fields are still empty strings.
  // Optional fields (rCol, groupCol, categoryCol) are allowed to be blank.
  function missingRequiredCols(p) {
    var m = p.chart.map, t = p.chart.type;
    // Fields allowed to be blank — rCol is always optional; groupCol is optional for sunburst/dotplot/beeswarm
    // but REQUIRED for marimekko (where it is the segment/stack dimension, not a colour group).
    var OPT = { rCol: 1, categoryCol: 1, centerCol: 1 };
    if (t !== "marimekko") OPT.groupCol = 1;
    var fields = (Studio.CHARTS[t] || {}).fields || [];
    for (var i = 0; i < fields.length; i++) {
      var fn = fields[i];
      if (fn === "series") { if (!m.series || !m.series.length || !m.series[0].col) return true; }
      else if (fn === "cols") { if (!m.cols || !m.cols.length) return true; }
      else if (!OPT[fn] && !m[fn]) return true;
    }
    return false;
  }

  // K6: auto-assign columns using name-based heuristics — called by the Auto-pick button.
  // Prefers non-numeric-sounding names for label slots and numeric-sounding names for value slots.
  function autoPickCols(p, cols) {
    if (!cols.length) return;
    var t = p.chart.type, m = p.chart.map;
    var NUM = /value|total|count|sum|avg|amount|revenue|cost|rate|pct|score|qty|num|metric/;
    var numCols = cols.filter(function (c) { return NUM.test(c.toLowerCase()); });
    var strCols = cols.filter(function (c) { return !NUM.test(c.toLowerCase()); });
    var labelPick = strCols[0] || cols[0];
    var valuePick = numCols[0] || cols[1] || cols[0];
    if (t === "line" || t === "stacked" || t === "areaStacked" || t === "streamgraph") {
      if (!m.labelCol) m.labelCol = labelPick;
      if (!m.series || !m.series.length) m.series = [{ col: valuePick }];
    } else if (t === "scatter") {
      if (!m.labelCol) m.labelCol = labelPick;
      if (!m.xCol) m.xCol = numCols[0] || cols[0];
      if (!m.yCol) m.yCol = numCols[1] || numCols[0] || cols[1] || cols[0];
    } else if (t === "heatmap") {
      if (!m.rowCol) m.rowCol = cols[0];
      if (!m.colCol) m.colCol = cols[1] || cols[0];
      if (!m.valueCol) m.valueCol = numCols[0] || cols[2] || cols[1] || cols[0];
    } else if (t === "table") {
      if (!m.cols || !m.cols.length) m.cols = cols.map(function (c, i) { return { col: c, label: Studio.titleize(c), num: i > 0 }; });
    } else if (t === "gauge") {
      if (!m.valueCol) m.valueCol = valuePick;
    } else if (t === "combo") {
      if (!m.labelCol) m.labelCol = labelPick;
      if (!m.barCol) m.barCol = numCols[0] || cols[0];
      if (!m.lineCol) m.lineCol = numCols[1] || numCols[0] || cols[1] || cols[0];
    } else if (t === "marimekko") {
      if (!m.labelCol) m.labelCol = strCols[0] || cols[0];
      if (!m.groupCol) m.groupCol = strCols[1] || strCols[0] || cols[1] || cols[0];
      if (!m.valueCol) m.valueCol = valuePick;
    } else if (t === "gantt") {
      if (!m.labelCol) m.labelCol = labelPick;
      if (!m.startCol) m.startCol = numCols[0] || cols[1] || cols[0];
      if (!m.endCol)   m.endCol   = numCols[1] || numCols[0] || cols[2] || cols[1] || cols[0];
    } else if (t === "candlestick") {
      // Prefer columns whose names hint at OHLC semantics; fall back to position order
      var ohlcNum = function (hint) {
        return cols.filter(function (c) { return new RegExp(hint, "i").test(c); })[0] || null;
      };
      if (!m.labelCol)  m.labelCol  = labelPick;
      if (!m.openCol)   m.openCol   = ohlcNum("open|start") || numCols[0] || cols[1] || cols[0];
      if (!m.highCol)   m.highCol   = ohlcNum("high|max")   || numCols[1] || numCols[0] || cols[2] || cols[0];
      if (!m.lowCol)    m.lowCol    = ohlcNum("low|min")    || numCols[2] || numCols[0] || cols[3] || cols[0];
      if (!m.closeCol)  m.closeCol  = ohlcNum("close|end")  || numCols[3] || numCols[0] || cols[4] || cols[0];
    } else if (t === "timeline") {
      // labelCol = event name (first string); dateCol = period/date (second string, optional)
      if (!m.labelCol) m.labelCol = strCols[0] || labelPick;
      if (!m.dateCol && strCols[1]) m.dateCol = strCols[1];
    } else if (t === "pyramidBar") {
      // labelCol = category (e.g. age group); leftCol / rightCol = the two numeric measures
      if (!m.labelCol) m.labelCol = strCols[0] || labelPick;
      if (!m.leftCol)  m.leftCol  = numCols[0] || cols[1] || cols[0];
      if (!m.rightCol) m.rightCol = numCols[1] || numCols[0] || cols[2] || cols[1] || cols[0];
    } else if (t === "areaRange") {
      // Prefer column names hinting at bounds (low/high, min/max, floor/ceiling); fall back positional
      var arHint = function (re) {
        return cols.filter(function (c) { return re.test(c.toLowerCase()); })[0] || null;
      };
      if (!m.labelCol)  m.labelCol  = labelPick;
      if (!m.lowerCol)  m.lowerCol  = arHint(/low|min|floor|lower/)  || numCols[0] || cols[1] || cols[0];
      if (!m.upperCol)  m.upperCol  = arHint(/high|max|ceil|upper/)  || numCols[1] || numCols[0] || cols[2] || cols[0];
      if (!m.centerCol) m.centerCol = arHint(/mid|cent|median|actual|forecast/) || numCols[2] || "";
    } else if (t === "quadrant") {
      // quadrant: xCol + yCol for scatter position; labelCol for point identity labels
      if (!m.labelCol) m.labelCol = labelPick;
      if (!m.xCol)     m.xCol     = numCols[0] || cols[1] || cols[0];
      if (!m.yCol)     m.yCol     = numCols[1] || numCols[0] || cols[2] || cols[0];
    } else {
      // bars, donut, treemap, funnel, waterfall, lollipop, and any unrecognised type
      if (!m.labelCol) m.labelCol = labelPick;
      if (!m.valueCol) m.valueCol = valuePick;
    }
    renderInspector(); refreshPreview();
    toast("Columns auto-assigned — adjust below if needed");
  }

  function renderMapping(sec, p) {
    var cols = Studio.columnsOf(S.spec, p.chart.da), m = p.chart.map, t = p.chart.type;

    // K6: Guided panel setup in Simple mode — show a friendly helper when required column
    // slots are empty so newcomers know what to do next. In Advanced mode, the field labels
    // are enough; beginners need an explicit nudge.
    if (S.simpleMode && t !== "richtext") {
      if (!p.chart.da) {
        // No query bound yet — direct the user to the picker above
        var gNone = el("div", "guided-setup");
        var gNoneIc = el("span", "gs-ic"); gNoneIc.appendChild(Studio.icon("info", 14)); gNone.appendChild(gNoneIc);
        var gNoneTxt = el("span"); gNoneTxt.textContent = "Drag a query from the library, or pick one in 'Query (data access)' above, to see your chart."; gNone.appendChild(gNoneTxt);
        sec.appendChild(gNone);
      } else if (missingRequiredCols(p)) {
        if (!cols.length) {
          // DA bound but no columns declared — edit the data source
          var gWarn = el("div", "guided-setup gs-warn");
          var gWarnIc = el("span", "gs-ic"); gWarnIc.appendChild(Studio.icon("warn", 14)); gWarn.appendChild(gWarnIc);
          var gWarnTxt = el("span"); gWarnTxt.textContent = "This query has no columns yet. Open the data source and click 'Detect from query' (or add columns manually) — the chart will appear once columns are known."; gWarn.appendChild(gWarnTxt);
          sec.appendChild(gWarn);
        } else {
          // Columns available but slots still empty (e.g. chart type changed) — offer Auto-pick
          var gPick = el("div", "guided-setup");
          var gPickIc = el("span", "gs-ic"); gPickIc.appendChild(Studio.icon("info", 14)); gPick.appendChild(gPickIc);
          var gPickTxt = el("span"); gPickTxt.textContent = "Assign a column to each slot below, or let Studio auto-assign:"; gPick.appendChild(gPickTxt);
          var gPickBtn = el("button", "guided-pick-btn"); gPickBtn.type = "button";
          gPickBtn.textContent = "Auto-pick columns ▶";
          gPickBtn.onclick = function () { autoPickCols(p, cols); };
          gPick.appendChild(gPickBtn);
          sec.appendChild(gPick);
        }
      }
    }

    var fields = (Studio.CHARTS[t] || {}).fields || [];
    fields.forEach(function (fn) {
      if (fn === "series") {
        var box = el("div");
        (m.series || []).forEach(function (s, i) {
          var r = el("div", "field row");
          var sc = colPicker(cols, s.col, function (v) { s.col = v; refreshPreview(); });
          var nm = input(s.name || "", function (v) { s.name = v; refreshPreview(); }); nm.placeholder = "series name";
          var d = el("div"); d.appendChild(labelEl("Series " + (i + 1) + " column")); d.appendChild(sc);
          var d2 = el("div"); d2.appendChild(labelEl("Name")); d2.appendChild(nm);
          r.appendChild(d); r.appendChild(d2);
          var rm = el("button", "icobtn danger"); rm.appendChild(Studio.icon("close", 13)); rm.title = "Remove series";
          rm.onclick = function () { m.series.splice(i, 1); renderInspector(); refreshPreview(); };
          r.appendChild(rm);
          box.appendChild(r);
          var cr = el("div", "field");
          var csel = select2pairs([["", "Auto (palette)"]].concat(Studio.COLOR_TOKENS.map(function (t) { return [t, t]; })), s.color || "", function (v) { if (v) s.color = v; else delete s.color; refreshPreview(); });
          cr.appendChild(labelEl("Series " + (i + 1) + " color")); cr.appendChild(csel);
          box.appendChild(cr);
        });
        var add = el("button", "btn-wide"); add.textContent = "＋ Add series";
        add.onclick = function () { (m.series = m.series || []).push({ col: cols[1] || cols[0] || "" }); renderInspector(); refreshPreview(); };
        box.appendChild(add);
        sec.appendChild(box);
      } else if (fn === "cols") {
        var tbl = el("div");
        (m.cols || []).forEach(function (c, i) {
          var r = el("div", "field row");
          var cp = colPicker(cols, c.col, function (v) { c.col = v; refreshPreview(); });
          var lb = input(c.label || "", function (v) { c.label = v; refreshPreview(); }); lb.placeholder = "label";
          var d = el("div"); d.appendChild(labelEl("Column")); d.appendChild(cp);
          var d2 = el("div"); d2.appendChild(labelEl("Header")); d2.appendChild(lb);
          r.appendChild(d); r.appendChild(d2);
          var num = el("label", "check"); var cb = el("input"); cb.type = "checkbox"; cb.checked = !!c.num;
          cb.onchange = function () { c.num = cb.checked; refreshPreview(); }; num.appendChild(cb); num.appendChild(document.createTextNode("#"));
          r.appendChild(num);
          var rm = el("button", "icobtn danger"); rm.title = "Remove column"; rm.setAttribute("aria-label", "Remove column"); rm.appendChild(Studio.icon("close", 13)); rm.onclick = function () { m.cols.splice(i, 1); renderInspector(); refreshPreview(); };
          r.appendChild(rm);
          tbl.appendChild(r);
        });
        var add = el("button", "btn-wide"); add.textContent = "＋ Add column";
        add.onclick = function () { (m.cols = m.cols || []).push({ col: cols[0] || "", label: Studio.titleize(cols[0] || ""), num: false }); renderInspector(); refreshPreview(); };
        tbl.appendChild(add);
        sec.appendChild(tbl);
      } else {
        var _lmap = { labelCol: t === "marimekko" ? "Category column (drives column width)" : "Label / category column",
          valueCol: "Value column", valueCol1: "Value — period 1 (before)", valueCol2: "Value — period 2 (after)",
          startCol: t === "gantt" ? "Start value column" : "Start value column (before / baseline)",
          endCol:   t === "gantt" ? "End value column"   : "End value column (after / target)",
          openCol:  "Open column (period start value)",
          highCol:  "High column (period maximum)",
          lowCol:   "Low column (period minimum)",
          closeCol: "Close column (period end value)",
          leftCol:  "Left side value column",
          rightCol: "Right side value column",
          lowerCol:  "Lower bound column",
          upperCol:  "Upper bound column",
          centerCol: "Centre / actual line column (optional)",
          xCol: "X column", yCol: "Y column", rCol: "Bubble-size column (optional)", rowCol: "Row column",
          colCol: "Column column", barCol: "Bar value column", lineCol: "Line value column",
          sourceCol: "Source column", targetCol: "Target / destination column",
          groupCol: t === "marimekko" ? "Segment column (stacks within each category)" : "Group column (optional)",
          dateCol: "Date / period column (optional)" };
        var label = _lmap[fn] || fn;
        sec.appendChild(field(label, colPicker(cols, m[fn], function (v) { m[fn] = v; refreshPreview(); }, fn === "rCol" || (fn === "groupCol" && t !== "marimekko") || fn === "dateCol")));
      }
    });
  }

  function renderKpiInspector(body) {
    var k = S.spec.kpis[S.selection.index]; if (!k) { selectDashboard(); return; }
    quickHelp(body, "kpi");
    var sec = section(body, "KPI tile", null, null, "builder");
    sec.appendChild(field("Label", input(k.label, function (v) { k.label = v; refreshPreview(); renderListsOnly(); })));
    sec.appendChild(field("Query (data access)", daPicker(k.da, function (v) {
      var dd = Studio.daById(S.spec, v); k.da = v; if (dd && dd.columns) k.valueCol = dd.columns[0]; renderInspector(); refreshPreview();
    })));
    sec.appendChild(field("Value column", colPicker(Studio.columnsOf(S.spec, k.da), k.valueCol, function (v) { k.valueCol = v; refreshPreview(); })));
    sec.appendChild(field("Aggregation", select2pairs(Studio.KPI_AGGS, k.agg || "first", function (v) {
      if (v && v !== "first") k.agg = v; else delete k.agg; renderInspector(); refreshPreview();
    }), "Compute a statistic (sum/average/median/percentile/std-dev/correlation) across every row the query returns, instead of just the first row"));
    if (k.agg === "corr") {
      sec.appendChild(noteEl("info", "Correlation needs a second numeric series — set it in the Compare to section below. It reuses that field as the second column rather than as a delta comparison."));
    }
    sec.appendChild(field("Format", fmtPicker(k.fmt, function (v) { k.fmt = v; refreshPreview(); })));
    sec.appendChild(field("Color state", select2pairs(Studio.KPI_STATES.map(function (s) { return [s.id, s.label]; }), k.state || "", function (v) { k.state = v; refreshPreview(); })));
    sec.appendChild(field("Info tooltip", textarea(k.info, function (v) { k.info = v; refreshPreview(); })));
    sec.appendChild(field("Subtitle text", input(k.subtitle || "", function (v) { k.subtitle = v; refreshPreview(); }, "e.g. vs. target, as of Q4")));
    var kacts = el("div"); kacts.style.cssText = "display:flex;gap:8px;margin-top:2px"; var ki = S.selection.index;
    var kdup = el("button", "btn-wide"); setIconBtn(kdup, "duplicate", "Duplicate"); kdup.onclick = function () { duplicateKpi(ki); };
    var kdel = el("button", "btn-wide"); kdel.style.color = "var(--bad)"; setIconBtn(kdel, "trash", "Delete"); kdel.onclick = function () { S.spec.kpis.splice(ki, 1); selectDashboard(); refreshPreview(); };
    kacts.appendChild(kdup); kacts.appendChild(kdel); sec.appendChild(kacts);

    var ts = section(body, "Trend & delta", null, null, "chart-types");
    var cols = Studio.columnsOf(S.spec, k.da);
    ts.appendChild(field("Delta text", input(k.deltaText || "", function (v) { k.deltaText = v; refreshPreview(); }, "e.g. 12% vs last quarter")));
    ts.appendChild(field("Delta direction", select2pairs([["up", "▲ Up (good)"], ["down", "▼ Down (bad)"], ["flat", "■ Flat"]], k.deltaDir || "up", function (v) { k.deltaDir = v; refreshPreview(); })));
    ts.appendChild(field("Sparkline column", colPicker(cols, k.sparkCol || "", function (v) { if (v) k.sparkCol = v; else delete k.sparkCol; refreshPreview(); }, true), "a numeric column → a mini trend on the tile"));
    ts.appendChild(field("Sparkline type", select2pairs([["line", "Line"], ["bar", "Bar"], ["area", "Area"]], k.sparkType || "line", function (v) { if (v === "line") delete k.sparkType; else k.sparkType = v; refreshPreview(); })));
    ts.appendChild(field("Sparkline color", select2pairs([["", "Auto"]].concat(Studio.COLOR_TOKENS.map(function (t) { return [t, t]; })), k.sparkColor || "", function (v) { if (v) k.sparkColor = v; else delete k.sparkColor; refreshPreview(); })));

    // Compare to — auto-computes a delta from a second numeric column in the same DA. Advanced.
    // Ideal for period-over-period comparisons: "Revenue this quarter vs last quarter" in one tile.
    // Takes priority over manual Delta text when a Compare column is selected.
    var cs = advSection(body, "Compare to", null, function () { return k.compareCol ? ("'" + (k.compareLabel || k.compareCol) + "'") : null; });
    cs.appendChild(field("Compare column", colPicker(cols, k.compareCol || "", function (v) {
      if (v) k.compareCol = v; else { delete k.compareCol; delete k.compareMode; delete k.compareLabel; }
      renderInspector(); refreshPreview();
    }, true), "second numeric column from the same DA; auto-computes delta vs main value"));
    if (k.compareCol) {
      cs.appendChild(field("Display as", select2pairs([["pct", "% change"], ["abs", "Absolute delta"], ["value", "Compare value"]], k.compareMode || "pct", function (v) {
        if (v !== "pct") k.compareMode = v; else delete k.compareMode; refreshPreview();
      })));
      cs.appendChild(field("Compare label", input(k.compareLabel || "", function (v) {
        if (v) k.compareLabel = v; else delete k.compareLabel; refreshPreview();
      }, "e.g. Prior quarter, Target")));
    }

    // Click-through: click the tile to navigate to another dashboard, mirroring panel
    // Drill-through (Z8 KPI slice) — same shared PDC.bindDrill helper bars/donut use.
    var kd = advSection(body, "Click-through", null, function () {
      return k.drill && k.drill.url ? k.drill.url.slice(0, 24) : "";
    });
    var kDrillCfg = k.drill || {};
    kd.appendChild(field("Target URL", input(kDrillCfg.url || "", function (v) {
      if (!k.drill) k.drill = {};
      k.drill.url = v.trim();
      refreshPreview();
    })));
    kd.appendChild(field("URL parameter", input(kDrillCfg.param || "", function (v) {
      if (!k.drill) k.drill = {};
      k.drill.param = v.trim();
    })));
    kd.appendChild(noteEl("info", "Click the tile to navigate to the target URL with ?{param}={value}. Uses PDC.drill — carries all active filter values. Leave URL empty to disable."));
  }

  /* ---------- chart-type change / rebind ---------- */
  function changeChartType(p, t) {
    var daDef = Studio.daById(S.spec, p.chart.da);
    var fresh = Studio.newPanel(t, daDef);
    // keep title/span/decoration; replace chart binding with fresh mapping for the new type
    p.chart = fresh.chart;
    renderInspector(); refreshPreview();
  }
  function rebindDA(p, daId) {
    var daDef = Studio.daById(S.spec, daId);
    var fresh = Studio.newPanel(p.chart.type, daDef);
    fresh.chart.opts = p.chart.opts;          // keep option choices
    p.chart.da = daId; p.chart.map = fresh.chart.map;
    if (!p.src) p.src = Studio.daSource(daDef);
    renderInspector(); refreshPreview();
  }

  /* ---------- filters (inline editor + live options preview) ---------- */
  function filterCols(da) {
    var c = Studio.columnsOf(S.spec, da); if (c.length) return c;
    var d = Studio.daById(S.spec, da); return d ? Studio.sampleRows(d).cols : [];   // helper queries w/o parsed aliases
  }
  function addFilter() {
    var das = S.spec.cda.dataAccesses;
    if (!das.length) { toast("Add a query first.", true); return; }
    var d = das[0], cols = filterCols(d.id);
    S.spec.filters.push({ id: "f" + (S.spec.filters.length + 1), label: "Filter", da: d.id, valueCol: cols[0] || "", textCol: cols[0] || "", allLabel: "All", def: "%" });
    select({ kind: "filter", index: S.spec.filters.length - 1 }); refreshPreview();
  }
  /* ---------- DA inspector (data source editor) ---------- */
  function renderDAInspector(body) {
    var da = Studio.daById(S.spec, S.selection.id); if (!da) { selectDashboard(); return; }
    if (Studio.isCompoundDA(da)) { renderCompoundDAInspector(body, da); return; }
    quickHelp(body, "da");
    var sec = section(body, "Data Source", null, null, "data-sources");
    sec.appendChild(field("ID", input(da.id, function (v) {
      var oldId = da.id;
      var nid = (v || "").trim().replace(/[^a-zA-Z0-9_-]+/g, "_") || oldId;
      if (nid === oldId) return;
      da.id = nid;
      S.spec.panels.forEach(function (p) { if (p.chart.da === oldId) p.chart.da = nid; });
      S.spec.kpis.forEach(function (k) { if (k.da === oldId) k.da = nid; });
      S.spec.filters.forEach(function (ff) { if (ff.da === oldId) ff.da = nid; });
      if (S.selection) S.selection.id = nid;
      buildLibrary();
    }), "Used to bind panels, KPIs and filters to this query"));
    sec.appendChild(field("Name / description", input(da.name || "", function (v) { da.name = v; buildLibrary(); })));
    sec.appendChild(field("Kind", select2pairs(Studio.DA_KINDS.map(function (k) { return [k.id, k.label]; }), da.kind || "sql.jndi", function (v) { da.kind = v; renderInspector(); })));

    // Connection picker — shown only when the spec has named connections
    var conns = S.spec.cda.connections || [];
    if (conns.length) {
      var connPairs = conns.map(function (c) { return [c.id, c.id + " (" + (c.type || "sql.jndi") + ")"]; });
      sec.appendChild(field("Connection", select2pairs(connPairs, da.connectionId || conns[0].id, function (v) { da.connectionId = v; })));
    }

    var acts = el("div"); acts.style.cssText = "display:flex;gap:8px;margin-top:4px";
    var dup = el("button", "btn-wide"); setIconBtn(dup, "duplicate", "Duplicate"); dup.onclick = function () { duplicateDA(da.id); };
    var del = el("button", "btn-wide"); del.style.color = "var(--bad)"; setIconBtn(del, "trash", "Delete"); del.onclick = function () { deleteDA(da.id); };
    acts.appendChild(dup); acts.appendChild(del); sec.appendChild(acts);

    // Per-kind query editor
    var kind = da.kind || "sql.jndi";
    if (/^sql/.test(kind)) {
      var qs = section(body, "SQL Query", null, null, "data-sources");
      var ta = el("textarea"); ta.style.cssText = "width:100%;min-height:130px;font-family:var(--mono);font-size:11.5px;resize:vertical;box-sizing:border-box";
      ta.value = da.sql || ""; ta.placeholder = "SELECT region AS region, SUM(amt) AS revenue\nFROM sales\nGROUP BY region";
      ta.addEventListener("change", function () {
        da.sql = ta.value;
        var detected = Studio.detectColumns(ta.value);
        if (detected.length) { da.columns = detected; renderInspector(); buildLibrary(); refreshPreview(); }
      });
      qs.appendChild(ta);
      var det = el("button", "btn-wide"); setIconBtn(det, "refresh", "Detect columns from SQL");
      det.onclick = function () {
        da.sql = ta.value;
        var detected = Studio.detectColumns(ta.value);
        if (detected.length) { da.columns = detected; renderInspector(); buildLibrary(); refreshPreview(); toast("Detected: " + detected.join(", ")); }
        else toast("No AS aliases found — add them: SELECT x AS label, SUM(y) AS value", true);
      };
      qs.appendChild(det);
    } else if (/^(mondrian|olap4j)/.test(kind)) {
      var qm = section(body, "MDX Query", null, null, "data-sources");
      qm.appendChild(field("Schema catalog path", input(da.mdxCatalog || "", function (v) { da.mdxCatalog = v; }, "/pentaho/etc/mondrian/schema.xml")));
      var ta = el("textarea"); ta.style.cssText = "width:100%;min-height:130px;font-family:var(--mono);font-size:11.5px;resize:vertical;box-sizing:border-box";
      ta.value = da.sql || da.query || ""; ta.placeholder = "SELECT NON EMPTY {[Measures].[Sales]} ON COLUMNS,\n  NON EMPTY {[Markets].Children} ON ROWS\nFROM [SteelWheelsSales]";
      ta.addEventListener("change", function () { da.sql = ta.value; da.query = ta.value; });
      qm.appendChild(ta);
      qm.appendChild(hint("Cube name must match the Mondrian schema; use NON EMPTY to suppress empty cells."));
    } else if (/^kettle/.test(kind)) {
      var qk = section(body, "Kettle / PDI Source", null, null, "data-sources");
      qk.appendChild(field(".ktr file path", input(da.ktrPath || "", function (v) { da.ktrPath = v; }, "/public/etl/my-transform.ktr")));
      qk.appendChild(field("Output step name", input(da.ktrStep || "Output", function (v) { da.ktrStep = v; }, "Output")));
      qk.appendChild(hint("Output columns come from the step's output fields — declare them in Columns below."));
    } else if (/^metadata/.test(kind)) {
      var qq = section(body, "Metadata / MQL Query", null, null, "data-sources");
      qq.appendChild(field("Domain ID", input(da.mqlDomain || "", function (v) { da.mqlDomain = v; }, "SteelWheels")));
      var ta = el("textarea"); ta.style.cssText = "width:100%;min-height:90px;font-family:var(--mono);font-size:11.5px;resize:vertical;box-sizing:border-box";
      ta.value = da.sql || da.query || ""; ta.placeholder = "<mql>…</mql>";
      ta.addEventListener("change", function () { da.sql = ta.value; da.query = ta.value; });
      qq.appendChild(field("MQL Query (optional)", ta));
    } else if (/^scripting/.test(kind)) {
      var qsc = section(body, "Script", null, null, "data-sources");
      var langs = [["javascript","JavaScript"],["beanshell","BeanShell"],["groovy","Groovy"],["python","Python"]];
      qsc.appendChild(field("Language", select2pairs(langs, da.scriptLang || "javascript", function (v) { da.scriptLang = v; })));
      var ta = el("textarea"); ta.style.cssText = "width:100%;min-height:130px;font-family:var(--mono);font-size:11.5px;resize:vertical;box-sizing:border-box";
      ta.value = da.sql || da.query || ""; ta.placeholder = "// return [[row1col1, row1col2], [row2col1, row2col2]]";
      ta.addEventListener("change", function () { da.sql = ta.value; da.query = ta.value; });
      qsc.appendChild(ta);
      qsc.appendChild(hint("Return rows as a list of arrays; column count must match Output columns."));
    } else if (kind === "duckdb") {
      var qdk = section(body, "DuckDB-Wasm (remote file)", null, null, "data-sources");
      qdk.appendChild(field("File URL", input(da.fileUrl || "", function (v) { da.fileUrl = v.trim(); }, "https://your-bucket.s3.amazonaws.com/data.parquet")));
      qdk.appendChild(field("Format", select2pairs([["auto", "Auto-detect (by extension)"], ["parquet", "Parquet"], ["csv", "CSV"]], da.fileFormat || "auto", function (v) { da.fileFormat = v; })));
      var dkTa2 = el("textarea"); dkTa2.style.cssText = "width:100%;min-height:90px;font-family:var(--mono);font-size:11.5px;resize:vertical;box-sizing:border-box";
      dkTa2.value = da.sql || da.query || ""; dkTa2.placeholder = "SELECT * FROM t\nLIMIT  200";
      dkTa2.addEventListener("change", function () { da.sql = dkTa2.value; da.query = dkTa2.value; });
      qdk.appendChild(field("Query (optional — runs against the file, aliased as “t”)", dkTa2));
      var dkStatus2 = el("div", "hint");
      dkStatus2.textContent = "Runs entirely in the browser via HTTP Range Requests — no credentials, no proxy, no server.";
      qdk.appendChild(dkStatus2);
      var dkTest2 = el("button", "btn-wide"); setIconBtn(dkTest2, "refresh", "Test connection & detect columns");
      dkTest2.onclick = function () {
        if (!da.fileUrl) { toast("Enter a file URL first.", true); return; }
        dkTest2.disabled = true; dkTest2.textContent = "Testing…"; window.__duckdbTestState = "testing";
        dkStatus2.textContent = "Loading the DuckDB engine + probing the file…";
        Studio.DuckDB.testConnection({ fileUrl: da.fileUrl, fileFormat: da.fileFormat }).then(function (res) {
          window.__duckdbTestState = "done";
          if (!res.ok) {
            dkTest2.disabled = false; setIconBtn(dkTest2, "refresh", "Test connection & detect columns");
            dkStatus2.textContent = "✗ " + res.error; toast("DuckDB test failed — " + res.error, true); return;
          }
          da.columns = da.columns || [];
          res.columns.forEach(function (c) { if (da.columns.indexOf(c.name) < 0) da.columns.push(c.name); });
          markDaFreshness(da.id);
          renderInspector(); buildLibrary(); refreshPreview();
          toast(res.columns.length + " column(s) detected from the live file.");
        });
      };
      qdk.appendChild(dkTest2);
    } else if (kind === "httpvfs") {
      var qsl = section(body, "SQLite-WASM (remote file)", null, null, "data-sources");
      qsl.appendChild(field("File URL", input(da.fileUrl || "", function (v) { da.fileUrl = v.trim(); }, "https://your-bucket.s3.amazonaws.com/data.sqlite")));
      qsl.appendChild(field("Table name (optional — auto-detected if blank)", input(da.tableName || "", function (v) { da.tableName = v.trim(); })));
      var slTa2 = el("textarea"); slTa2.style.cssText = "width:100%;min-height:90px;font-family:var(--mono);font-size:11.5px;resize:vertical;box-sizing:border-box";
      slTa2.value = da.sql || da.query || ""; slTa2.placeholder = "SELECT * FROM my_table\nLIMIT  200";
      slTa2.addEventListener("change", function () { da.sql = slTa2.value; da.query = slTa2.value; });
      qsl.appendChild(field("Query (optional — runs against the opened database)", slTa2));
      var slStatus2 = el("div", "hint");
      slStatus2.textContent = "Runs entirely in the browser via HTTP Range Requests — no credentials, no proxy, no server.";
      qsl.appendChild(slStatus2);
      var slTest2 = el("button", "btn-wide"); setIconBtn(slTest2, "refresh", "Test connection & detect columns");
      slTest2.onclick = function () {
        if (!da.fileUrl) { toast("Enter a file URL first.", true); return; }
        slTest2.disabled = true; slTest2.textContent = "Testing…"; window.__sqliteTestState = "testing";
        slStatus2.textContent = "Loading the SQLite engine + probing the file…";
        Studio.SQLiteHttp.testConnection({ fileUrl: da.fileUrl, tableName: da.tableName }).then(function (res) {
          window.__sqliteTestState = "done";
          if (!res.ok) {
            slTest2.disabled = false; setIconBtn(slTest2, "refresh", "Test connection & detect columns");
            slStatus2.textContent = "✗ " + res.error; toast("SQLite test failed — " + res.error, true); return;
          }
          da.tableName = res.table;
          da.columns = da.columns || [];
          res.columns.forEach(function (c) { if (da.columns.indexOf(c.name) < 0) da.columns.push(c.name); });
          markDaFreshness(da.id);
          renderInspector(); buildLibrary(); refreshPreview();
          toast(res.columns.length + " column(s) detected from the live file.");
        });
      };
      qsl.appendChild(slTest2);
    } else if (kind === "snowflake") {
      var qsf = section(body, "Snowflake (SQL API)", null, null, "data-sources");
      qsf.appendChild(field("Account identifier", input(da.sfAccount || "", function (v) { da.sfAccount = v.trim(); }, "xy12345.us-east-1")));
      qsf.appendChild(field("Access token", input(da.sfToken || "", function (v) { da.sfToken = v.trim(); }, "Programmatic Access Token or OAuth token")));
      qsf.appendChild(field("Token type", select2pairs([["PROGRAMMATIC_ACCESS_TOKEN", "Programmatic Access Token"], ["OAUTH", "OAuth"]], da.sfTokenType || "PROGRAMMATIC_ACCESS_TOKEN", function (v) { da.sfTokenType = v; })));
      qsf.appendChild(field("Warehouse", input(da.sfWarehouse || "", function (v) { da.sfWarehouse = v.trim(); }, "COMPUTE_WH")));
      qsf.appendChild(field("Database", input(da.sfDatabase || "", function (v) { da.sfDatabase = v.trim(); }, "ANALYTICS")));
      qsf.appendChild(field("Schema", input(da.sfSchema || "", function (v) { da.sfSchema = v.trim(); }, "PUBLIC")));
      qsf.appendChild(field("Role (optional)", input(da.sfRole || "", function (v) { da.sfRole = v.trim(); }, "ANALYST")));
      var sfTa2 = el("textarea"); sfTa2.style.cssText = "width:100%;min-height:90px;font-family:var(--mono);font-size:11.5px;resize:vertical;box-sizing:border-box";
      sfTa2.value = da.sql || da.query || ""; sfTa2.placeholder = "SELECT region, SUM(revenue) AS revenue FROM sales GROUP BY region";
      sfTa2.addEventListener("change", function () { da.sql = sfTa2.value; da.query = sfTa2.value; });
      qsf.appendChild(field("Query", sfTa2));
      var sfStatus2 = el("div", "hint");
      sfStatus2.textContent = "Calls the Snowflake SQL API directly from the browser — the account must allow this origin via ALLOWED_HTTP_ORIGINS or requests are blocked by CORS.";
      qsf.appendChild(sfStatus2);
      var sfTest2 = el("button", "btn-wide"); setIconBtn(sfTest2, "refresh", "Test connection & detect columns");
      sfTest2.onclick = function () {
        if (!da.sfAccount || !da.sfToken) { toast("Enter an account identifier and access token first.", true); return; }
        sfTest2.disabled = true; sfTest2.textContent = "Testing…"; window.__snowflakeTestState = "testing";
        sfStatus2.textContent = "Calling the Snowflake SQL API…";
        Studio.Snowflake.testConnection(sfCfg(da)).then(function (res) {
          window.__snowflakeTestState = "done";
          if (!res.ok) {
            sfTest2.disabled = false; setIconBtn(sfTest2, "refresh", "Test connection & detect columns");
            sfStatus2.textContent = "✗ " + res.error; toast("Snowflake test failed — " + res.error, true); return;
          }
          da.columns = da.columns || [];
          res.columns.forEach(function (c) { if (da.columns.indexOf(c.name) < 0) da.columns.push(c.name); });
          markDaFreshness(da.id);
          renderInspector(); buildLibrary(); refreshPreview();
          toast(res.columns.length + " column(s) detected from the live warehouse.");
        });
      };
      qsf.appendChild(sfTest2);
    } else if (kind === "databricks") {
      var qdx = section(body, "Databricks (Statement Execution API)", null, null, "data-sources");
      qdx.appendChild(field("Workspace host", input(da.dbxHost || "", function (v) { da.dbxHost = v.trim(); }, "dbc-a1b2c3d4-e5f6.cloud.databricks.com")));
      qdx.appendChild(field("Access token", input(da.dbxToken || "", function (v) { da.dbxToken = v.trim(); }, "Personal access token (dapi…)")));
      qdx.appendChild(field("SQL warehouse id", input(da.dbxWarehouseId || "", function (v) { da.dbxWarehouseId = v.trim(); }, "0123456789abcdef")));
      qdx.appendChild(field("Catalog (optional)", input(da.dbxCatalog || "", function (v) { da.dbxCatalog = v.trim(); }, "main")));
      qdx.appendChild(field("Schema (optional)", input(da.dbxSchema || "", function (v) { da.dbxSchema = v.trim(); }, "default")));
      var dbxTa2 = el("textarea"); dbxTa2.style.cssText = "width:100%;min-height:90px;font-family:var(--mono);font-size:11.5px;resize:vertical;box-sizing:border-box";
      dbxTa2.value = da.sql || da.query || ""; dbxTa2.placeholder = "SELECT region, SUM(revenue) AS revenue FROM sales GROUP BY region";
      dbxTa2.addEventListener("change", function () { da.sql = dbxTa2.value; da.query = dbxTa2.value; });
      qdx.appendChild(field("Query", dbxTa2));
      var dbxStatus2 = el("div", "hint");
      dbxStatus2.textContent = "Calls the Databricks Statement Execution API directly from the browser — the workspace must allow this origin or requests are blocked by CORS.";
      qdx.appendChild(dbxStatus2);
      var dbxTest2 = el("button", "btn-wide"); setIconBtn(dbxTest2, "refresh", "Test connection & detect columns");
      dbxTest2.onclick = function () {
        if (!da.dbxHost || !da.dbxToken || !da.dbxWarehouseId) { toast("Enter a workspace host, access token, and SQL warehouse id first.", true); return; }
        dbxTest2.disabled = true; dbxTest2.textContent = "Testing…"; window.__databricksTestState = "testing";
        dbxStatus2.textContent = "Calling the Databricks SQL API…";
        Studio.Databricks.testConnection(dbxCfg(da)).then(function (res) {
          window.__databricksTestState = "done";
          if (!res.ok) {
            dbxTest2.disabled = false; setIconBtn(dbxTest2, "refresh", "Test connection & detect columns");
            dbxStatus2.textContent = "✗ " + res.error; toast("Databricks test failed — " + res.error, true); return;
          }
          da.columns = da.columns || [];
          res.columns.forEach(function (c) { if (da.columns.indexOf(c.name) < 0) da.columns.push(c.name); });
          markDaFreshness(da.id);
          renderInspector(); buildLibrary(); refreshPreview();
          toast(res.columns.length + " column(s) detected from the live warehouse.");
        });
      };
      qdx.appendChild(dbxTest2);
    } else if (kind === "bigquery") {
      var qbq = section(body, "BigQuery (jobs.query API)", null, null, "data-sources");
      qbq.appendChild(field("Project id", input(da.bqProject || "", function (v) { da.bqProject = v.trim(); }, "my-analytics-project")));
      qbq.appendChild(field("Access token", input(da.bqToken || "", function (v) { da.bqToken = v.trim(); }, "OAuth 2.0 access token")));
      qbq.appendChild(field("Location (optional)", input(da.bqLocation || "", function (v) { da.bqLocation = v.trim(); }, "US")));
      qbq.appendChild(field("Default dataset (optional)", input(da.bqDataset || "", function (v) { da.bqDataset = v.trim(); }, "analytics")));
      var bqTa2 = el("textarea"); bqTa2.style.cssText = "width:100%;min-height:90px;font-family:var(--mono);font-size:11.5px;resize:vertical;box-sizing:border-box";
      bqTa2.value = da.sql || da.query || ""; bqTa2.placeholder = "SELECT region, SUM(revenue) AS revenue FROM `dataset.sales` GROUP BY region";
      bqTa2.addEventListener("change", function () { da.sql = bqTa2.value; da.query = bqTa2.value; });
      qbq.appendChild(field("Query", bqTa2));
      var bqStatus2 = el("div", "hint");
      bqStatus2.textContent = "Calls the BigQuery jobs.query REST API directly from the browser using a short-lived OAuth access token — never a service-account key file.";
      qbq.appendChild(bqStatus2);
      var bqTest2 = el("button", "btn-wide"); setIconBtn(bqTest2, "refresh", "Test connection & detect columns");
      bqTest2.onclick = function () {
        if (!da.bqProject || !da.bqToken) { toast("Enter a project id and access token first.", true); return; }
        bqTest2.disabled = true; bqTest2.textContent = "Testing…"; window.__bigqueryTestState = "testing";
        bqStatus2.textContent = "Calling the BigQuery jobs.query API…";
        Studio.BigQuery.testConnection(bqCfg(da)).then(function (res) {
          window.__bigqueryTestState = "done";
          if (!res.ok) {
            bqTest2.disabled = false; setIconBtn(bqTest2, "refresh", "Test connection & detect columns");
            bqStatus2.textContent = "✗ " + res.error; toast("BigQuery test failed — " + res.error, true); return;
          }
          da.columns = da.columns || [];
          res.columns.forEach(function (c) { if (da.columns.indexOf(c.name) < 0) da.columns.push(c.name); });
          markDaFreshness(da.id);
          renderInspector(); buildLibrary(); refreshPreview();
          toast(res.columns.length + " column(s) detected from the live dataset.");
        });
      };
      qbq.appendChild(bqTest2);
    } else if (kind === "http") {
      var qhttp = section(body, "Generic SQL/HTTP", null, null, "data-sources");
      qhttp.appendChild(field("Endpoint URL", input(da.httpUrl || "", function (v) { da.httpUrl = v.trim(); }, "https://api.example.com/query")));
      var httpRow2 = el("div", "field row");
      httpRow2.appendChild(field("Method", select2pairs([["POST", "POST (JSON body)"], ["GET", "GET (query string)"]], da.httpMethod || "POST", function (v) { da.httpMethod = v; })));
      httpRow2.appendChild(field("Param name", input(da.httpParamName || "sql", function (v) { da.httpParamName = v.trim() || "sql"; }, "sql")));
      qhttp.appendChild(httpRow2);
      qhttp.appendChild(field("Auth header (optional)", input(da.httpAuthHeader || "", function (v) { da.httpAuthHeader = v.trim(); }, "Bearer …")));
      var httpTa2 = el("textarea"); httpTa2.style.cssText = "width:100%;min-height:90px;font-family:var(--mono);font-size:11.5px;resize:vertical;box-sizing:border-box";
      httpTa2.value = da.sql || da.query || ""; httpTa2.placeholder = "SELECT region, SUM(revenue) AS revenue FROM sales GROUP BY region";
      httpTa2.addEventListener("change", function () { da.sql = httpTa2.value; da.query = httpTa2.value; });
      qhttp.appendChild(field("Query", httpTa2));
      var httpStatus2 = el("div", "hint");
      httpStatus2.textContent = "Sends the SQL directly from your browser as a JSON body or query-string param — any in-house query service or provider not covered by a named connector.";
      qhttp.appendChild(httpStatus2);
      var httpTest2 = el("button", "btn-wide"); setIconBtn(httpTest2, "refresh", "Test connection & detect columns");
      httpTest2.onclick = function () {
        if (!da.httpUrl) { toast("Enter an endpoint URL first.", true); return; }
        httpTest2.disabled = true; httpTest2.textContent = "Testing…"; window.__httpTestState = "testing";
        httpStatus2.textContent = "Calling the endpoint…";
        Studio.GenericSql.testConnection(httpCfg(da)).then(function (res) {
          window.__httpTestState = "done";
          if (!res.ok) {
            httpTest2.disabled = false; setIconBtn(httpTest2, "refresh", "Test connection & detect columns");
            httpStatus2.textContent = "✗ " + res.error; toast("Endpoint test failed — " + res.error, true); return;
          }
          da.columns = da.columns || [];
          res.columns.forEach(function (c) { if (da.columns.indexOf(c.name) < 0) da.columns.push(c.name); });
          markDaFreshness(da.id);
          renderInspector(); buildLibrary(); refreshPreview();
          toast(res.columns.length + " column(s) detected from the live endpoint.");
        });
      };
      qhttp.appendChild(httpTest2);
    }

    // Output columns
    var cs = section(body, "Output columns", function () {
      da.columns = da.columns || []; da.columns.push("col" + (da.columns.length + 1)); renderInspector();
    }, null, "data-sources");
    if (!da.columns || !da.columns.length) cs.appendChild(hint("Write SQL and click 'Detect columns', or add manually with ＋."));
    (da.columns || []).forEach(function (col, i) {
      var r = el("div", "field row");
      var nm = input(col, function (v) { da.columns[i] = v.trim() || col; refreshPreview(); }); nm.placeholder = "column_name";
      var rm = delBtn(function () { da.columns.splice(i, 1); renderInspector(); refreshPreview(); });
      var d1 = el("div"); d1.style.flex = "1"; d1.appendChild(labelEl("Column " + (i + 1))); d1.appendChild(nm);
      r.appendChild(d1); r.appendChild(rm); cs.appendChild(r);
    });

    // Parameters
    var ps = section(body, "Parameters", function () {
      da.params = da.params || []; da.params.push({ name: "p" + (da.params.length + 1), type: "String", default: "%" }); renderInspector();
    });
    if (!da.params || !da.params.length) ps.appendChild(hint("No parameters. Click ＋ to add. Reference them in SQL as ${paramName}."));
    (da.params || []).forEach(function (p, i) {
      var r = el("div", "field row");
      var nm = input(p.name, function (v) { p.name = v.trim() || p.name; }); nm.placeholder = "paramName";
      var paramTypePairs = Studio.COLUMN_TYPES.map(function (t) { return [t, t]; });
      var ty = select2pairs(paramTypePairs, p.type || "String", function (v) { p.type = v; });
      var def = input(p.default != null ? String(p.default) : "", function (v) { p.default = v; }); def.placeholder = "default value";
      var rm = delBtn(function () { da.params.splice(i, 1); renderInspector(); });
      var d1 = el("div"); d1.appendChild(labelEl("Name")); d1.appendChild(nm);
      var d2 = el("div"); d2.appendChild(labelEl("Type")); d2.appendChild(ty);
      var d3 = el("div"); d3.appendChild(labelEl("Default")); d3.appendChild(def);
      r.appendChild(d1); r.appendChild(d2); r.appendChild(d3); r.appendChild(rm); ps.appendChild(r);
    });

    // Calculated columns — hidden in Simple mode (K5) via .adv-sect
    da.calcColumns = da.calcColumns || [];
    var ccs = advSection(body, "Calculated columns", function () {
      da.calcColumns.push(Studio.newCalcCol()); renderInspector();
    });
    if (!da.calcColumns.length) ccs.appendChild(hint("Add formula-based columns derived from output. Formula syntax: =[col1] + [col2]"));
    da.calcColumns.forEach(function (cc, i) {
      var r = el("div", "field row");
      var errEl = el("div", "note err calc-col-err"); errEl.style.display = "none";
      function revalidate() {
        if (!cc.name || !cc.formula) { errEl.style.display = "none"; return; }
        var probe = {}; (da.columns || []).forEach(function (c) { probe[c] = 1; });
        var res = Studio.evalFormula(cc.formula, probe);
        if (res.error) { errEl.textContent = "“" + cc.name + "”: " + res.error; errEl.style.display = ""; }
        else errEl.style.display = "none";
      }
      var nm = input(cc.name, function (v) { cc.name = v.trim().replace(/[^a-zA-Z0-9_]+/g, "_"); revalidate(); refreshPreview(); }); nm.placeholder = "col_name";
      var fm = input(cc.formula, function (v) { cc.formula = v; revalidate(); refreshPreview(); }); fm.placeholder = "=[col1] + [col2]";
      var calcTypePairs = Studio.COLUMN_TYPES.map(function (t) { return [t, t]; });
      var ty = select2pairs(calcTypePairs, cc.type || "Numeric", function (v) { cc.type = v; });
      var rm = delBtn(function () { da.calcColumns.splice(i, 1); renderInspector(); refreshPreview(); });
      var d1 = el("div"); d1.style.flex = "1.5"; d1.appendChild(labelEl("Name")); d1.appendChild(nm);
      var d2 = el("div"); d2.style.flex = "2"; d2.appendChild(labelEl("Formula")); d2.appendChild(fm);
      var d3 = el("div"); d3.appendChild(labelEl("Type")); d3.appendChild(ty);
      r.appendChild(d1); r.appendChild(d2); r.appendChild(d3); r.appendChild(rm); ccs.appendChild(r);
      ccs.appendChild(errEl);
      revalidate();
    });

    // Output options — post-query filter / sort / limit; hidden in Simple mode (K5)
    da.outputOptions = da.outputOptions || { filters: [], sortBy: [], limit: 0 };
    var oo = da.outputOptions;
    var ooSec = advSection(body, "Output options");
    ooSec.appendChild(hint("Applied after the query: filter rows, sort, or cap the result size. Active rules show in the query preview and are emitted as <OutputOptions> in the CDA export."));

    // Filter rules
    var fSec = section(ooSec, "Filter rules", function () {
      oo.filters = oo.filters || [];
      oo.filters.push(Studio.newOutputFilter());
      renderInspector();
    });
    var daCols = da.columns || [];
    if (!(oo.filters || []).length) fSec.appendChild(hint("No filters. Click ＋ to add a row filter."));
    (oo.filters || []).forEach(function (f, fi) {
      var r = el("div", "field row");
      var colPairs = daCols.length
        ? daCols.map(function (c) { return [c, c]; })
        : [["", "(columns not yet defined)"]];
      var opPairs = Studio.DA_OPS.map(function (o) { return [o.id, o.label]; });
      var cs = select2pairs(colPairs, f.col || (daCols[0] || ""), function (v) { f.col = v; refreshPreview(); }); cs.style.flex = "1";
      var os = select2pairs(opPairs, f.op || "=", function (v) { f.op = v; refreshPreview(); }); os.style.flex = "1";
      var vs = input(String(f.val || ""), function (v) { f.val = v; refreshPreview(); }); vs.placeholder = "value"; vs.style.flex = "1";
      var rm = delBtn(function () { oo.filters.splice(fi, 1); renderInspector(); refreshPreview(); });
      r.appendChild(cs); r.appendChild(os); r.appendChild(vs); r.appendChild(rm);
      fSec.appendChild(r);
    });

    // Sort rules
    var sSec = section(ooSec, "Sort", function () {
      oo.sortBy = oo.sortBy || [];
      oo.sortBy.push(Studio.newOutputSort());
      renderInspector();
    });
    if (!(oo.sortBy || []).length) sSec.appendChild(hint("No sort rules. Click ＋ to sort output rows."));
    (oo.sortBy || []).forEach(function (s, si) {
      var r = el("div", "field row");
      var colPairs2 = daCols.length ? daCols.map(function (c) { return [c, c]; }) : [["", "(columns not yet defined)"]];
      var cs2 = select2pairs(colPairs2, s.col || (daCols[0] || ""), function (v) { s.col = v; refreshPreview(); }); cs2.style.flex = "2";
      var ds = select2pairs([["asc", "↑ Ascending"], ["desc", "↓ Descending"]], s.dir || "asc", function (v) { s.dir = v; refreshPreview(); }); ds.style.flex = "1";
      var rm2 = delBtn(function () { oo.sortBy.splice(si, 1); renderInspector(); refreshPreview(); });
      r.appendChild(cs2); r.appendChild(ds); r.appendChild(rm2);
      sSec.appendChild(r);
    });

    // Row limit
    var limRow = el("div", "field");
    var limIn = el("input"); limIn.type = "number"; limIn.min = "0"; limIn.value = oo.limit || 0; limIn.style.width = "90px";
    limIn.title = "0 = no limit";
    limIn.addEventListener("input", function () { oo.limit = +limIn.value || 0; refreshPreview(); });
    limRow.appendChild(labelEl("Row limit (0 = no limit)")); limRow.appendChild(limIn);
    ooSec.appendChild(limRow);

    // Cache
    var cch = section(body, "Cache");
    var clab = el("label", "check"); var ccb = el("input"); ccb.type = "checkbox"; ccb.checked = da.cache !== false;
    ccb.onchange = function () { da.cache = ccb.checked; };
    clab.appendChild(ccb); clab.appendChild(document.createTextNode(" Enabled")); cch.appendChild(clab);
    var dur = el("input"); dur.type = "number"; dur.value = da.cacheDuration || 300;
    dur.addEventListener("input", function () { da.cacheDuration = +dur.value || 300; });
    cch.appendChild(field("Duration (seconds)", dur));

    renderDAPreview(body, da);
  }

  // N-DATA innovation-sweep idea (added 2026-07-04): data source freshness badge — a builder
  // trusting a live connector has no way to tell a genuinely-current query from one that quietly
  // went stale (expired token, dead endpoint) days ago. Stamp + surface the last time THIS data
  // access last proved it's actually live, keyed by DA id, so a dodgy connector gets noticed
  // instead of silently trusted. First cut (v301) scoped this to "Run live" only, via the one
  // shared renderTable() call site every connector kind's live path funnels through. A DA
  // inspector's own "Test connection & detect columns" also runs a real probe against the live
  // source (DESCRIBE/PRAGMA/sample query) — just as strong a liveness signal — so its six
  // per-connector success handlers (below) now call markDaFreshness() too.
  function daFreshnessMap() {
    try { return JSON.parse(localStorage.getItem("studio-da-freshness") || "{}"); } catch (e) { return {}; }
  }
  function markDaFreshness(daId) {
    try {
      var m = daFreshnessMap(); m[daId] = new Date().toISOString();
      localStorage.setItem("studio-da-freshness", JSON.stringify(m));
    } catch (e) {}
  }
  function daFreshnessLabel(daId) {
    var ts = daFreshnessMap()[daId];
    return ts ? "Last verified live " + timeAgo(ts) : "Never verified live";
  }

  function renderDAPreview(body, da) {
    var PAGE_SIZE = 10;
    var state = { page: 0, result: null, source: "" };
    var paramVals = {};
    (da.params || []).forEach(function (p) { paramVals[p.name] = p.default != null ? String(p.default) : ""; });

    var sec = section(body, "Data preview");

    // Parameter inputs (if any)
    if (da.params && da.params.length) {
      var paramsRow = el("div", "daprev-params");
      da.params.forEach(function (p) {
        var d = el("div", "daprev-param-field");
        d.appendChild(labelEl("$" + p.name));
        var inp = el("input"); inp.type = "text"; inp.value = paramVals[p.name] || ""; inp.placeholder = p.default || "";
        inp.style.cssText = "width:100%;box-sizing:border-box";
        inp.addEventListener("input", function () { paramVals[p.name] = inp.value; });
        d.appendChild(inp);
        paramsRow.appendChild(d);
      });
      sec.appendChild(paramsRow);
    }

    // Toolbar
    var toolbar = el("div", "daprev-toolbar");
    var runBtn = el("button", "btn"); setIconBtn(runBtn, "play", "Run sample"); runBtn.title = "Preview offline sample data";
    var copyBtn = el("button", "btn"); setIconBtn(copyBtn, "copy", "Copy TSV"); copyBtn.title = "Copy all rows as tab-separated values";
    toolbar.appendChild(runBtn);
    var ac = activeConnection();
    var isDuckdb = da.kind === "duckdb";
    var isSqlite = da.kind === "httpvfs";
    var isSnowflake = da.kind === "snowflake";
    var isDatabricks = da.kind === "databricks";
    var isBigquery = da.kind === "bigquery";
    var isHttp = da.kind === "http";
    var liveBtn = null;
    if (ac || isDuckdb || isSqlite || isSnowflake || isDatabricks || isBigquery || isHttp) {
      liveBtn = el("button", "btn"); setIconBtn(liveBtn, "play", "Run live");
      liveBtn.title = isDuckdb ? "Query the live file via DuckDB-Wasm (HTTP Range Requests)" :
        isSqlite ? "Query the live file via SQLite-WASM (HTTP Range Requests)" :
        isSnowflake ? "Query the live warehouse via the Snowflake SQL API" :
        isDatabricks ? "Query the live warehouse via the Databricks Statement Execution API" :
        isBigquery ? "Query the live dataset via the BigQuery jobs.query API" :
        isHttp ? "Query the live endpoint" : ("Query live from " + ac.name);
      toolbar.appendChild(liveBtn);
    }
    toolbar.appendChild(copyBtn);
    if (liveBtn) {
      var freshBadge = el("span", "daprev-freshness");
      freshBadge.textContent = daFreshnessLabel(da.id);
      toolbar.appendChild(freshBadge);
    }
    sec.appendChild(toolbar);

    var statusLine = el("div", "daprev-status");
    sec.appendChild(statusLine);

    var tableWrap = el("div", "daprev-tbl-wrap");
    sec.appendChild(tableWrap);

    var pagination = el("div", "daprev-pagination");
    var prevBtn = el("button", "btn daprev-pgbtn"); prevBtn.appendChild(Studio.icon("chevron-left", 14)); prevBtn.title = "Previous page";
    var pageLabel = el("span", "daprev-page-label");
    var nextBtn = el("button", "btn daprev-pgbtn"); nextBtn.appendChild(Studio.icon("chevron-right", 14)); nextBtn.title = "Next page";
    pagination.appendChild(prevBtn); pagination.appendChild(pageLabel); pagination.appendChild(nextBtn);
    pagination.style.display = "none";
    sec.appendChild(pagination);

    var qualityWrap = el("div", "daprev-quality");
    sec.appendChild(qualityWrap);

    function guessType(colName, vals) {
      var n = (colName || "").toLowerCase();
      if (/date|time|month|year|quarter|week/.test(n)) return "Date";
      if (/count|amount|revenue|total|pct|percent|ratio|value|price|qty|quantity|score|rank|num|sum|avg/.test(n)) return "Numeric";
      var numCount = vals.filter(function (v) { return v != null && !isNaN(parseFloat(String(v))); }).length;
      if (numCount > vals.length * 0.7) return "Numeric";
      return "String";
    }

    function renderTable(result, src) {
      tableWrap.innerHTML = ""; pagination.style.display = "none";
      if (!result || !result.cols || !result.cols.length) {
        var empty = el("div", "daprev-empty"); empty.textContent = "No data — add columns and run."; tableWrap.appendChild(empty); return;
      }
      var totalRows = result.rows.length;
      var totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
      if (state.page >= totalPages) state.page = 0;
      var pageRows = result.rows.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);
      var sample = result.rows.slice(0, 30);
      var types = result.cols.map(function (c, ci) {
        return guessType(c, sample.map(function (r) { return r[ci]; }));
      });

      var tbl = el("table", "daprev-tbl");
      var thead = el("thead"), hr = el("tr");
      result.cols.forEach(function (c, ci) {
        var th = el("th");
        var nameSpan = el("span"); nameSpan.textContent = c;
        var typeSpan = el("span", "daprev-type"); typeSpan.textContent = types[ci];
        th.appendChild(nameSpan); th.appendChild(typeSpan); hr.appendChild(th);
      });
      thead.appendChild(hr); tbl.appendChild(thead);
      var tbody = el("tbody");
      pageRows.forEach(function (row) {
        var tr = el("tr");
        row.forEach(function (v) { var td = el("td"); td.textContent = v == null ? "" : String(v); tr.appendChild(td); });
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      tableWrap.appendChild(tbl);

      var srcLabel = src === "live" ? " · live" : " · sample";
      statusLine.textContent = totalRows + " row" + (totalRows !== 1 ? "s" : "") + " · " + result.cols.length + " col" + (result.cols.length !== 1 ? "s" : "") + srcLabel;
      if (src === "live") {
        markDaFreshness(da.id);
        if (freshBadge) freshBadge.textContent = daFreshnessLabel(da.id);
      }

      if (totalPages > 1) {
        pagination.style.display = "";
        pageLabel.textContent = (state.page + 1) + " / " + totalPages;
        prevBtn.disabled = state.page === 0;
        nextBtn.disabled = state.page >= totalPages - 1;
      }

      // N-DATA follow-up: same watchdog as the inline Query preview, but here it runs over
      // this preview's own (possibly live, possibly paginated) result — not just the offline sample.
      qualityWrap.innerHTML = "";
      Studio.dataQualityIssues(result.cols, sample).forEach(function (issue) {
        qualityWrap.appendChild(noteEl("warn", Studio.dataQualityMessage(issue)));
      });
    }

    function runSample() {
      statusLine.textContent = "Generating…";
      tableWrap.innerHTML = "";
      var raw = Studio.sampleRows({ id: da.id, columns: da.columns || [], params: da.params || [] });
      state.result = Studio.applyOutputOptions ? Studio.applyOutputOptions(da, raw) : raw;
      state.source = "sample"; state.page = 0;
      renderTable(state.result, "sample");
    }

    function runLive() {
      if (!liveBtn) return;
      liveBtn.disabled = true; liveBtn.textContent = "Loading…";
      statusLine.textContent = "Querying…";
      if (isDuckdb) {
        if (!da.fileUrl) { liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live"); toast("Set a file URL first.", true); runSample(); return; }
        Studio.DuckDB.query({ fileUrl: da.fileUrl, fileFormat: da.fileFormat }, da.sql || da.query).then(function (result) {
          state.result = result; state.source = "live"; state.page = 0;
          liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live");
          renderTable(state.result, "live");
        }).catch(function (e) {
          liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live");
          toast("DuckDB query failed — showing sample. (" + ((e && e.message) || e) + ")", true);
          runSample();
        });
        return;
      }
      if (isSqlite) {
        if (!da.fileUrl) { liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live"); toast("Set a file URL first.", true); runSample(); return; }
        Studio.SQLiteHttp.query({ fileUrl: da.fileUrl, tableName: da.tableName }, da.sql || da.query).then(function (result) {
          state.result = result; state.source = "live"; state.page = 0;
          liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live");
          renderTable(state.result, "live");
        }).catch(function (e) {
          liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live");
          toast("SQLite query failed — showing sample. (" + ((e && e.message) || e) + ")", true);
          runSample();
        });
        return;
      }
      if (isSnowflake) {
        if (!da.sfAccount || !da.sfToken) { liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live"); toast("Set an account identifier and access token first.", true); runSample(); return; }
        Studio.Snowflake.query(sfCfg(da), da.sql || da.query).then(function (result) {
          state.result = result; state.source = "live"; state.page = 0;
          liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live");
          renderTable(state.result, "live");
        }).catch(function (e) {
          liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live");
          toast("Snowflake query failed — showing sample. (" + ((e && e.message) || e) + ")", true);
          runSample();
        });
        return;
      }
      if (isDatabricks) {
        if (!da.dbxHost || !da.dbxToken || !da.dbxWarehouseId) { liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live"); toast("Set a workspace host, access token, and SQL warehouse id first.", true); runSample(); return; }
        Studio.Databricks.query(dbxCfg(da), da.sql || da.query).then(function (result) {
          state.result = result; state.source = "live"; state.page = 0;
          liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live");
          renderTable(state.result, "live");
        }).catch(function (e) {
          liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live");
          toast("Databricks query failed — showing sample. (" + ((e && e.message) || e) + ")", true);
          runSample();
        });
        return;
      }
      if (isBigquery) {
        if (!da.bqProject || !da.bqToken) { liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live"); toast("Set a project id and access token first.", true); runSample(); return; }
        Studio.BigQuery.query(bqCfg(da), da.sql || da.query).then(function (result) {
          state.result = result; state.source = "live"; state.page = 0;
          liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live");
          renderTable(state.result, "live");
        }).catch(function (e) {
          liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live");
          toast("BigQuery query failed — showing sample. (" + ((e && e.message) || e) + ")", true);
          runSample();
        });
        return;
      }
      if (isHttp) {
        if (!da.httpUrl) { liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live"); toast("Set an endpoint URL first.", true); runSample(); return; }
        Studio.GenericSql.query(httpCfg(da), da.sql || da.query).then(function (result) {
          state.result = result; state.source = "live"; state.page = 0;
          liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live");
          renderTable(state.result, "live");
        }).catch(function (e) {
          liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live");
          toast("Endpoint query failed — showing sample. (" + ((e && e.message) || e) + ")", true);
          runSample();
        });
        return;
      }
      var ac2 = activeConnection();
      if (!ac2) { liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live"); toast("No active server.", true); runSample(); return; }
      var deployPath = (S.settings && S.settings.deployPath) || "/public/studio";
      var cdaFile = (S.spec.title || "dashboard").replace(/[^a-zA-Z0-9_-]+/g, "_") + ".cda";
      var cdaPath = deployPath.replace(/\/$/, "") + "/" + cdaFile;
      var params = {};
      (da.params || []).forEach(function (p) { params[p.name] = paramVals[p.name] != null ? paramVals[p.name] : (p.default || ""); });
      Studio.PentahoClient(ac2).doQuery(cdaPath, da.id, params).then(function (json) {
        var cols = (json.metadata || []).map(function (m) { return m.colName || m.colLabel || "col"; });
        state.result = { cols: cols, rows: json.resultset || [] };
        state.source = "live"; state.page = 0;
        liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live");
        renderTable(state.result, "live");
      }).catch(function (e) {
        liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live");
        toast("Live query failed — showing sample. (" + e.message + ")", true);
        runSample();
      });
    }

    runBtn.onclick = function () { state.page = 0; runSample(); };
    if (liveBtn) liveBtn.onclick = runLive;
    prevBtn.onclick = function () { if (state.page > 0) { state.page--; renderTable(state.result, state.source); } };
    nextBtn.onclick = function () { state.page++; renderTable(state.result, state.source); };
    copyBtn.onclick = function () {
      if (!state.result || !state.result.cols.length) { toast("Run the preview first.", true); return; }
      var lines = [state.result.cols.join("\t")].concat(state.result.rows.map(function (r) { return r.map(function (v) { return v == null ? "" : String(v); }).join("\t"); }));
      navigator.clipboard.writeText(lines.join("\n"))
        .then(function () { toast("Copied " + state.result.rows.length + " rows as TSV."); })
        .catch(function () { toast("Clipboard unavailable.", true); });
    };

    // Auto-run sample on open
    runSample();
  }

  function renderCompoundDAInspector(body, da) {
    var sec = section(body, "Compound Data Access");
    sec.appendChild(field("ID", input(da.id, function (v) {
      var oldId = da.id;
      var nid = (v || "").trim().replace(/[^a-zA-Z0-9_-]+/g, "_") || oldId;
      if (nid === oldId) return;
      da.id = nid; if (S.selection) S.selection.id = nid; buildLibrary();
    })));
    sec.appendChild(field("Name", input(da.name || "", function (v) { da.name = v; buildLibrary(); })));
    var typePairs = [["join", "Join"], ["union", "Union"]];
    sec.appendChild(field("Type", select2pairs(typePairs, da.compoundType || "join", function (v) { da.compoundType = v; renderInspector(); })));

    var editBtn = el("button", "btn-wide"); setIconBtn(editBtn, "edit", "Edit in builder");
    editBtn.onclick = function () { openCompoundDABuilder(da); };
    sec.appendChild(editBtn);

    var nonCompound = (S.spec.cda.dataAccesses || []).filter(function (d) { return !Studio.isCompoundDA(d); }).map(function (d) { return d.id; });
    var emptyPair = [["", "(none)"]];

    if ((da.compoundType || "join") === "union") {
      var us = section(body, "Member DAs", function () {
        da.unionDas = da.unionDas || []; da.unionDas.push(""); renderInspector();
      });
      if (!da.unionDas || !da.unionDas.length) us.appendChild(hint("Add data accesses to stack their rows."));
      (da.unionDas || []).forEach(function (did, i) {
        var r = el("div", "field row");
        var pairs = emptyPair.concat(nonCompound.map(function (id) { return [id, id]; }));
        var sel = select2pairs(pairs, did, function (v) { da.unionDas[i] = v; });
        var rm = delBtn(function () { da.unionDas.splice(i, 1); renderInspector(); });
        r.appendChild(sel); r.appendChild(rm); us.appendChild(r);
      });
    } else {
      var js = section(body, "Join keys");
      var daPairs = emptyPair.concat(nonCompound.map(function (id) { return [id, id]; }));
      js.appendChild(field("Left DA", select2pairs(daPairs, da.leftId || "", function (v) { da.leftId = v; })));
      js.appendChild(field("Left key(s)", input(da.leftKeys || "", function (v) { da.leftKeys = v; }, "col1,col2")));
      js.appendChild(field("Right DA", select2pairs(daPairs, da.rightId || "", function (v) { da.rightId = v; })));
      js.appendChild(field("Right key(s)", input(da.rightKeys || "", function (v) { da.rightKeys = v; }, "col1,col2")));
    }

    var acts = el("div"); acts.style.cssText = "display:flex;gap:8px;margin-top:4px";
    var del = el("button", "btn-wide"); del.style.color = "var(--bad)"; setIconBtn(del, "trash", "Delete");
    del.onclick = function () { deleteDA(da.id); };
    acts.appendChild(del); body.appendChild(acts);
  }

  function renderFilterInspector(body) {
    var f = S.spec.filters[S.selection.index]; if (!f) { selectDashboard(); return; }
    quickHelp(body, "filter");
    var sec = section(body, "Filter", null, null, "builder");
    sec.appendChild(field("Label", input(f.label, function (v) { f.label = v; refreshPreview(); renderListsOnly(); })));
    sec.appendChild(field("Parameter id", input(f.id, function (v) { f.id = v.trim(); refreshPreview(); }), "must match the ${param} in the queries it filters"));
    sec.appendChild(field("Options query", daPicker(f.da, function (v) { f.da = v; var cs = filterCols(v); f.valueCol = cs[0] || ""; f.textCol = f.valueCol; renderInspector(); refreshPreview(); })));
    var cols = filterCols(f.da);
    sec.appendChild(field("Value column", colPicker(cols, f.valueCol, function (v) { f.valueCol = v; renderInspector(); refreshPreview(); })));
    sec.appendChild(field("Text column", colPicker(cols, f.textCol, function (v) { f.textCol = v; renderInspector(); refreshPreview(); })));
    sec.appendChild(field("‘All’ label", input(f.allLabel, function (v) { f.allLabel = v; refreshPreview(); })));
    sec.appendChild(field("Default value", input(f.def, function (v) { f.def = v; refreshPreview(); }, "value when ‘All’ is selected (usually %)")));
    var ps = section(body, "Options preview");
    ps.appendChild(optionsPreview(f));
    var dd = Studio.daById(S.spec, f.da);
    if (dd && dd.params && dd.params.length) ps.appendChild(noteEl("info", "Cascading: this options query takes " + dd.params.map(function (p) { return "${" + p.name + "}"; }).join(", ") + " — its choices refresh from the matching upstream filters at runtime."));
  }
  function optionsPreview(f) {
    var d = Studio.daById(S.spec, f.da), box = el("div");
    if (!d) { box.appendChild(hint("Pick an options query.")); return box; }
    var s = Studio.sampleRows(d), ti = s.cols.indexOf(f.textCol || f.valueCol); if (ti < 0) ti = 0;
    var wrap = el("div", "opt-prev");
    var all = el("span", "opt-chip all"); all.textContent = f.allLabel || "All"; wrap.appendChild(all);
    var seen = {}; s.rows.forEach(function (r) { var t = String(r[ti]); if (seen[t]) return; seen[t] = 1; var c = el("span", "opt-chip"); c.textContent = t; wrap.appendChild(c); });
    box.appendChild(wrap);
    box.appendChild(hint("Sample preview — live values come from the query at runtime."));
    return box;
  }
  function addFromCurrentOrPrompt(kind) {
    var das = S.spec.cda.dataAccesses;
    if (!das.length) { toast("Add a query from the library first.", true); return; }
    if (kind === "kpi") { var k = Studio.newKpi(das[0]); k.fmt = Studio.guessFmt(k.valueCol); S.spec.kpis.push(k); select({ kind: "kpi", index: S.spec.kpis.length - 1 }); refreshPreview(); }
  }

  /* ---------- preview ---------- */
  var _pvTimer = null;
  function refreshPreview() {
    clearTimeout(_pvTimer);
    _pvTimer = setTimeout(doRefresh, 130);
  }
  function doRefresh() {
    var ifr = $("#preview");
    // H-track v117: in Demo mode substitute varied sample data so values pulse realistically.
    var mockData = S.demoMode ? genMockLive(S.spec, _demoTick) : Studio.genMock(S.spec);
    var opts = { deployPath: S.settings.deployPath, preview: true, mock: mockData, launcher: false };
    if (S.settings.live) { var ac = activeConnection(); if (ac) { opts.liveBase = Studio.PentahoClient(ac).base(); opts.mock = {}; } }
    var html = Studio.buildHtml(S.spec, S.assets, opts);
    ifr.onload = function () {
      postToPreview({ type: "theme", value: S.theme });
      highlightPreview();
      var n = (S.spec.panels || []).length, k = (S.spec.kpis || []).length;
      var dataLabel = S.demoMode ? " · demo LIVE" : (S.settings.live ? " · LIVE" : " · sample data");
      $("#previewStatus").textContent = n + " panel" + (n === 1 ? "" : "s") + (k ? " · " + k + " KPI" + (k === 1 ? "" : "s") : "") + dataLabel;
    };
    ifr.srcdoc = html;
    snapshot();
    scheduleNoteRecent();
    // H-track: toggle canvas empty state overlay based on whether the dashboard has content
    var isEmpty = !((S.spec.panels || []).length + (S.spec.kpis || []).length);
    var stage = $("#canvas-stage");
    if (stage) { isEmpty ? stage.classList.add("canvas-empty") : stage.classList.remove("canvas-empty"); }
  }

  /* ---------- undo / redo (snapshots settled spec states) ---------- */
  var _undo = [], _redo = [], _lastSnap = null;
  var _exportHistory = []; // [{kind,name,ts}] newest-first, max 5
  function snapshot() {
    var s = JSON.stringify(S.spec);
    if (s === _lastSnap) return;
    if (_lastSnap !== null) { _undo.push(_lastSnap); if (_undo.length > 80) _undo.shift(); _redo.length = 0; scheduleAutosave(); }
    _lastSnap = s; updateHistButtons();
  }

  /* ---------- auto-save (saves to localStorage after user edits) ---------- */
  var _asTimer = null, _siTimer = null;
  function scheduleAutosave() {
    clearTimeout(_asTimer);
    _asTimer = setTimeout(function () {
      try { localStorage.setItem("studio-autosave", JSON.stringify(S.spec)); } catch (e) {}
      // Flash "Saved ✓" in the topbar save-state indicator for 2 s.
      var si = document.getElementById("saveState");
      if (si) {
        clearTimeout(_siTimer);
        si.textContent = "Saved ✓";
        si.className = "save-state saved";
        _siTimer = setTimeout(function () {
          si.textContent = "";
          si.className = "save-state";
        }, 2000);
      }
    }, 1500);
  }
  function clearAutosave() { try { localStorage.removeItem("studio-autosave"); } catch (e) {} }

  /* ---------- export history (last 5; persisted in localStorage) ---------- */
  function loadExportHistory() {
    try { _exportHistory = JSON.parse(localStorage.getItem("studio-export-history") || "[]"); } catch (e) { _exportHistory = []; }
  }
  function recordExport(kind, name) {
    _exportHistory.unshift({ kind: kind, name: name, ts: new Date().toISOString() });
    _exportHistory = _exportHistory.slice(0, 5);
    try { localStorage.setItem("studio-export-history", JSON.stringify(_exportHistory)); } catch (e) {}
    renderExportHistory();
  }
  function timeAgo(ts) {
    var sec = (Date.now() - new Date(ts).getTime()) / 1000;
    if (sec < 90) return "just now";
    if (sec < 3600) return Math.round(sec / 60) + " min ago";
    if (sec < 86400) return Math.round(sec / 3600) + " h ago";
    return Math.round(sec / 86400) + " d ago";
  }
  function renderExportHistory() {
    var wrap = $("#exportHistWrap"); if (!wrap) return;
    wrap.innerHTML = "";
    if (!_exportHistory.length) return;
    var sep = el("div", "sep"); wrap.appendChild(sep);
    var hdr = el("div", "grp"); hdr.textContent = "Recent exports"; wrap.appendChild(hdr);
    var LABELS = { cdf: "Dashboard Framework", cda: "Data Access", all: "All artifacts" };
    _exportHistory.forEach(function (h) {
      var btn = el("button", "eh-row");
      btn.innerHTML = '<span class="eh-kind">' + esc(LABELS[h.kind] || h.kind) + '</span><span class="eh-name">' + esc(h.name) + '</span><span class="eh-ts">' + timeAgo(h.ts) + '</span>';
      btn.onclick = function () { doExport(h.kind); closeMenus(); };
      wrap.appendChild(btn);
    });
  }

  /* ---------- Z2: Home landing section (recents + quick-create) ----------
     Recents are captured whenever the working spec settles (see scheduleNoteRecent(),
     called from doRefresh()): the full spec is cloned into a capped, newest-first
     localStorage list so a recent card can genuinely reopen that exact dashboard —
     not just show a label. Thumbnails are rendered fresh from the stored spec at
     paint time (via Studio.makeThumbnail) so they always match the current theme. */
  var _LS_RECENTS = "studio-recents";
  var _LS_PINS = "studio-pins"; // array of pinned dashboard ids — pinned entries never fall off the recents cap
  var _recentTimer = null;
  function scheduleNoteRecent() { clearTimeout(_recentTimer); _recentTimer = setTimeout(noteRecent, 800); }
  function loadRecents() { try { return JSON.parse(localStorage.getItem(_LS_RECENTS) || "[]"); } catch (e) { return []; } }
  function loadPins() { try { return JSON.parse(localStorage.getItem(_LS_PINS) || "[]"); } catch (e) { return []; } }
  function savePins(pins) { try { localStorage.setItem(_LS_PINS, JSON.stringify(pins)); } catch (e) { /* quota or private-mode */ } }
  function togglePin(id) {
    var pins = loadPins(), i = pins.indexOf(id);
    if (i >= 0) pins.splice(i, 1); else pins.unshift(id);
    savePins(pins);
    renderHome();
    renderRepository();
  }
  function noteRecent() {
    if (!S.spec || !S.spec.id) return;
    var existing = loadRecents();
    // Preserve workbookId across the rebuild below — a dashboard's workbook filing is
    // repository organization, tracked only on the recents entry (see the Workbooks
    // section), so a naive "drop and re-add" here would silently un-file a dashboard
    // every time its autosave debounce ticks while it's open.
    var prior = existing.filter(function (r) { return r.id === S.spec.id; })[0];
    var list = existing.filter(function (r) { return r.id !== S.spec.id; });
    var entry = { id: S.spec.id, ts: new Date().toISOString(), spec: Studio.clone(S.spec) };
    if (prior && prior.workbookId) entry.workbookId = prior.workbookId;
    list.unshift(entry);
    // cap only the UNPINNED entries at 8 (newest-first order preserved) — pinning a
    // dashboard protects it from ever being evicted by newer activity.
    var pins = loadPins(), capped = [], unpinnedSeen = 0;
    list.forEach(function (r) {
      if (pins.indexOf(r.id) >= 0) { capped.push(r); }
      else if (unpinnedSeen < 8) { capped.push(r); unpinnedSeen++; }
    });
    list = capped;
    try { localStorage.setItem(_LS_RECENTS, JSON.stringify(list)); } catch (e) { /* quota or private-mode */ }
    pruneVersions(list.map(function (r) { return r.id; }));
    renderHome();
    renderRepository();
  }
  function openRecent(id) {
    var r = loadRecents().filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    S.spec = normalize(r.spec); S.selection = null; syncHeader(); renderInspector(); refreshPreview(); buildLibrary();
    if (window.__studioShellSetSection) window.__studioShellSetSection("studio");
  }

  /* ---------- N-DIST: local version history ("time travel" for a dashboard) ----------
     A lightweight checkpoint list, distinct from in-session undo (memory-only, lost on
     reload) and from studio-autosave (a single unsaved draft). Every explicit Save (the
     download-a-.studio.json action) pushes a snapshot into studio-versions, keyed by
     dashboard id, newest-first, capped at 10 per dashboard. Version lists are pruned to
     only dashboards still tracked in studio-recents so this can't grow unbounded once a
     dashboard falls off Home/Repository. */
  var _LS_VERSIONS = "studio-versions";
  function loadVersions() { try { return JSON.parse(localStorage.getItem(_LS_VERSIONS) || "{}"); } catch (e) { return {}; } }
  function saveVersions(v) { try { localStorage.setItem(_LS_VERSIONS, JSON.stringify(v)); } catch (e) { /* quota or private-mode */ } }
  function snapshotVersion() {
    if (!S.spec || !S.spec.id) return;
    var versions = loadVersions();
    var list = versions[S.spec.id] || [];
    list.unshift({ ts: new Date().toISOString(), spec: Studio.clone(S.spec) });
    if (list.length > 10) list = list.slice(0, 10);
    versions[S.spec.id] = list;
    saveVersions(versions);
  }
  function pruneVersions(keepIds) {
    var versions = loadVersions(), changed = false;
    Object.keys(versions).forEach(function (id) { if (keepIds.indexOf(id) < 0) { delete versions[id]; changed = true; } });
    if (changed) saveVersions(versions);
  }
  function restoreVersion(vTs) {
    if (!S.spec || !S.spec.id) return;
    var list = loadVersions()[S.spec.id] || [];
    var v = list.filter(function (x) { return x.ts === vTs; })[0];
    if (!v) return;
    if (!confirm("Restore this version from " + new Date(v.ts).toLocaleString() + "?\n\nYour current unsaved changes on the canvas will be replaced (this itself becomes a new restorable version).")) return;
    S.spec = normalize(Studio.clone(v.spec));
    S.selection = null; syncHeader(); renderInspector(); refreshPreview(); buildLibrary();
    snapshotVersion(); // the restored state is itself a checkpoint, so a restore can be undone too
    toast("Version restored");
  }

  /* Track N innovation idea (added 2026-07-04): canvas sticky notes — small colored, builder-only
     notes for team brainstorming/review while a dashboard is in progress. Deliberately never
     exported (no spec field, no involvement in the render pipeline shared with export) — scratch
     space, not a dashboard feature. Keyed by dashboard id, same storage shape as studio-versions.
     First cut pins to a specific PANEL (stable `id`) or a dashboard-wide "General note" — KPIs have
     no stable id yet (diffSpecs already notes this: they're compared positionally), so pinning to
     one would silently drift onto the wrong tile the moment a KPI is reordered or deleted; left for
     a future slice once KPIs gain a stable id. */
  var _LS_NOTES = "studio-canvas-notes";
  var NOTE_COLORS = ["#ffd76a", "#7dd3c0", "#f4a6a6", "#8fb8f6", "#c9a4f2"];
  function loadCanvasNotes() { try { return JSON.parse(localStorage.getItem(_LS_NOTES) || "{}"); } catch (e) { return {}; } }
  function saveCanvasNotes(n) { try { localStorage.setItem(_LS_NOTES, JSON.stringify(n)); } catch (e) { /* quota or private-mode */ } }
  function saveCanvasNote(note) {
    if (!S.spec || !S.spec.id) return;
    var all = loadCanvasNotes();
    var list = all[S.spec.id] || [];
    var existing = list.filter(function (n) { return n.id === note.id; })[0];
    if (existing) { existing.color = note.color; existing.text = note.text.trim(); existing.panelId = note.panelId; existing.ts = new Date().toISOString(); }
    else { list.push({ id: note.id, color: note.color, text: note.text.trim(), panelId: note.panelId, ts: new Date().toISOString() }); }
    all[S.spec.id] = list;
    saveCanvasNotes(all);
  }
  function deleteCanvasNote(id) {
    if (!S.spec || !S.spec.id) return;
    var all = loadCanvasNotes();
    all[S.spec.id] = (all[S.spec.id] || []).filter(function (n) { return n.id !== id; });
    saveCanvasNotes(all);
    renderInspector();
  }
  function openNoteEditor(existing) {
    var draft = existing ? { id: existing.id, color: existing.color, text: existing.text, panelId: existing.panelId || "" }
      : { id: Studio.uid("note"), color: NOTE_COLORS[0], text: "", panelId: "" };
    modal(existing ? "Edit note" : "Add note", function (body) {
      body.appendChild(hint("A small colored note for your own reference or team review while building — never exported, never leaves this browser."));
      var presets = el("div", "note-presets");
      NOTE_COLORS.forEach(function (c) {
        var sw = el("button", "note-swatch" + (draft.color === c ? " active" : "")); sw.type = "button"; sw.title = c;
        sw.style.background = c;
        sw.setAttribute("aria-pressed", draft.color === c ? "true" : "false");
        sw.onclick = function () {
          draft.color = c;
          [].slice.call(presets.children).forEach(function (b) { b.classList.remove("active"); b.setAttribute("aria-pressed", "false"); });
          sw.classList.add("active"); sw.setAttribute("aria-pressed", "true");
        };
        presets.appendChild(sw);
      });
      body.appendChild(field("Color", presets));
      var ta = textarea(draft.text, function (v) { draft.text = v; });
      ta.placeholder = "What do you want to remember or flag here?";
      ta.style.cssText = "width:100%;min-height:70px;resize:vertical;box-sizing:border-box";
      body.appendChild(field("Note", ta));
      var targetOpts = [["", "General note (not tied to a panel)"]].concat(
        (S.spec.panels || []).map(function (p) { return [p.id, "Panel: " + (p.title || p.id)]; }));
      body.appendChild(field("Pin to", select2pairs(targetOpts, draft.panelId, function (v) { draft.panelId = v; })));
      var saveBtn = el("button", "btn btn-primary"); saveBtn.style.cssText = "width:100%;justify-content:center;margin-top:8px";
      saveBtn.textContent = existing ? "Save changes" : "Add note";
      saveBtn.onclick = function () {
        if (!draft.text.trim()) { toast("Enter some note text first.", true); return; }
        saveCanvasNote(draft);
        document.querySelector(".modal-ov").remove();
        renderInspector();
      };
      body.appendChild(saveBtn);
    });
  }
  // N-DEV: live JSON spec editor — edit the working dashboard's raw .studio.json
  // directly and see the canvas update. Power-user/debugging tool: validates the
  // pasted/edited text is a plausible spec (valid JSON, a panels[] array, a
  // cda.dataAccesses[] array) before applying, and snapshots a version-history
  // checkpoint of the PRE-edit state first so a bad hand-edit is always one
  // "Restore this version" away from undoing, same safety net a live Save gets.
  function openJsonEditor() {
    modal("Edit JSON spec", function (body) {
      body.appendChild(hint("Edit the dashboard's raw JSON directly, then Apply to validate and re-render the canvas. A checkpoint of the current state is saved to Version history first, so a bad edit is always restorable."));
      var ta = el("textarea");
      ta.value = JSON.stringify(S.spec, null, 2);
      ta.spellcheck = false;
      ta.style.cssText = "width:100%;min-height:360px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1.5;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--field);color:var(--ink);box-sizing:border-box;resize:vertical;margin-top:8px";
      body.appendChild(ta);
      var errEl = el("div", "note err"); errEl.style.cssText = "margin-top:8px;display:none";
      body.appendChild(errEl);
      function showErr(msg) { errEl.textContent = msg; errEl.style.display = "block"; }
      function clearErr() { errEl.style.display = "none"; }
      ta.addEventListener("input", clearErr);
      var btnRow = el("div"); btnRow.style.cssText = "display:flex;gap:8px;margin-top:10px";
      var applyBtn = el("button", "btn"); setIconBtn(applyBtn, "check", "Apply");
      var copyBtn = el("button", "btn"); setIconBtn(copyBtn, "copy", "Copy");
      btnRow.appendChild(applyBtn); btnRow.appendChild(copyBtn);
      body.appendChild(btnRow);
      copyBtn.onclick = function () { copyText(ta.value, copyBtn); };
      applyBtn.onclick = function () {
        var parsed;
        try { parsed = JSON.parse(ta.value); } catch (e) { showErr("Invalid JSON: " + e.message); return; }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) { showErr('Spec must be a JSON object, e.g. { "title": "…", "panels": [...] }.'); return; }
        if (!Array.isArray(parsed.panels)) { showErr('Spec must have a "panels" array (use [] if there are none).'); return; }
        if (!parsed.cda || !Array.isArray(parsed.cda.dataAccesses)) { showErr('Spec must have a "cda": { "dataAccesses": [...] } block.'); return; }
        snapshotVersion();
        S.spec = normalize(parsed);
        S.selection = null; syncHeader(); renderInspector(); refreshPreview(); buildLibrary();
        document.querySelector(".modal-ov").remove();
        toast("JSON spec applied");
      };
    });
  }

  // N-DIST follow-up: "visual diff between two versions" — compares one checkpoint
  // against the CURRENT working spec (the practical question when deciding whether to
  // restore) and lists what changed in plain English via Studio.diffSpecs/diffSummary.
  function openVersionDiff(v) {
    var when = new Date(v.ts).toLocaleString();
    var lines = Studio.diffSummary(Studio.diffSpecs(v.spec || {}, S.spec));
    modal("Compare: " + when + " → Current", function (body) {
      body.appendChild(hint("What changed between this checkpoint and the dashboard as it stands now."));
      if (!lines.length) {
        body.appendChild(noteEl("info", "No differences — this checkpoint matches the current dashboard."));
      } else {
        var list = el("div", "vdiff-list");
        lines.forEach(function (line) {
          var row = el("div", "vdiff-row"); row.textContent = line; list.appendChild(row);
        });
        body.appendChild(list);
      }
      var restoreB = el("button", "btn"); restoreB.style.cssText = "margin-top:10px;width:100%;justify-content:center";
      setIconBtn(restoreB, "undo", "Restore this version");
      restoreB.onclick = function () { document.querySelector(".modal-ov").remove(); restoreVersion(v.ts); };
      body.appendChild(restoreB);
    });
  }
  // "Compare dashboards side-by-side" innovation idea: distinct from the Version-history diff
  // above (which compares a dashboard against ITS OWN past checkpoint) -- this picks any TWO
  // different saved dashboards from Home/Repository and shows (1) a real live preview of each,
  // rendered the exact same way the builder's own preview iframe is (Studio.buildHtml + mock
  // data, so it's a genuine "which of these looks better" comparison, not a static thumbnail)
  // and (2) a plain-English diff, reusing Studio.diffSpecs/diffSummary verbatim (the same engine
  // the version-history diff already established).
  function openCompareDashboards() {
    var list = loadRecents();
    if (list.length < 2) { toast("Save at least two dashboards to compare them", true); return; }
    modal("Compare dashboards", function (body) {
      body.appendChild(hint("Pick any two saved dashboards to see a live side-by-side preview and a plain-English summary of what differs between them."));
      var row = el("div", "cmp-pick-row");
      function pickerFor(defaultIdx) {
        var sel = document.createElement("select"); sel.className = "cmp-pick";
        list.forEach(function (r, i) {
          var opt = document.createElement("option");
          opt.value = r.id; opt.textContent = (r.spec && (r.spec.title || r.spec.name)) || r.id;
          if (i === defaultIdx) opt.selected = true;
          sel.appendChild(opt);
        });
        return sel;
      }
      var selA = pickerFor(0), selB = pickerFor(1);
      var arrow = el("span", "cmp-arrow"); arrow.textContent = "⇄";
      row.appendChild(selA); row.appendChild(arrow); row.appendChild(selB);
      body.appendChild(row);
      var pvRow = el("div", "cmp-preview-row");
      function previewCol() {
        var col = el("div", "cmp-preview-col");
        var h = el("h5"); var fr = document.createElement("iframe");
        fr.className = "cmp-preview-frame"; fr.setAttribute("aria-hidden", "true");
        col.appendChild(h); col.appendChild(fr);
        return { col: col, h: h, fr: fr };
      }
      var pvA = previewCol(), pvB = previewCol();
      pvRow.appendChild(pvA.col); pvRow.appendChild(pvB.col);
      body.appendChild(pvRow);
      var out = el("div", "cmp-out"); body.appendChild(out);
      function renderPreview(pv, r) {
        var sp = (r && r.spec) || {};
        pv.h.textContent = sp.title || sp.name || "Untitled";
        pv.fr.title = "Live preview: " + (sp.title || sp.name || "Untitled");
        pv.fr.srcdoc = Studio.buildHtml(sp, S.assets, { preview: true, mock: Studio.genMock(sp), launcher: false });
        pv.fr.onload = function () { try { pv.fr.contentWindow.postMessage({ studio: 1, type: "theme", value: S.theme }, "*"); } catch (e) {} };
      }
      function renderAll() {
        var a = list.filter(function (r) { return r.id === selA.value; })[0];
        var b = list.filter(function (r) { return r.id === selB.value; })[0];
        if (!a || !b) return;
        renderPreview(pvA, a); renderPreview(pvB, b);
        out.innerHTML = "";
        if (a.id === b.id) { out.appendChild(noteEl("info", "Pick two different dashboards to compare.")); return; }
        var lines = Studio.diffSummary(Studio.diffSpecs(a.spec || {}, b.spec || {}));
        if (!lines.length) { out.appendChild(noteEl("info", "No differences — these two dashboards match.")); return; }
        var listEl = el("div", "vdiff-list");
        lines.forEach(function (line) { var r = el("div", "vdiff-row"); r.textContent = line; listEl.appendChild(r); });
        out.appendChild(listEl);
      }
      selA.onchange = renderAll; selB.onchange = renderAll;
      renderAll();
    }, null, true);
  }
  // Shared markup for one recents/pinned card. Uses a big invisible "open" button
  // covering the whole card (not the card element itself) so the small pin toggle can
  // sit on top of it without an invalid <button> inside a <button>.
  // wbOpts (optional, Repository-only): { workbooks: [{id,name}, ...] } — when passed, the
  // card gains an inline "Workbook" select so a dashboard can be filed into a named collection
  // without a separate screen. Omitted on Home's cards to keep that grid a fast "get back to
  // work" view (the assignment control lives in the one place that also lists workbooks).
  function recentCardHtml(r, pinned, wbOpts) {
    var sp = r.spec || {}, panels = (sp.panels || []).length, kpis = (sp.kpis || []).length;
    var meta = panels + " panel" + (panels === 1 ? "" : "s") + (kpis ? " · " + kpis + " KPI" + (kpis === 1 ? "" : "s") : "");
    var thumb = Studio.makeThumbnail(sp, S.theme);
    var title = sp.title || sp.name || "Untitled";
    var wbSelect = "";
    if (wbOpts && wbOpts.workbooks) {
      var cur = r.workbookId || "";
      wbSelect = '<select class="recent-wb-sel" data-recent-wb="' + esc(r.id) + '" aria-label="Workbook for ' + esc(title) + '">' +
        '<option value="">No workbook</option>' +
        wbOpts.workbooks.map(function (w) { return '<option value="' + esc(w.id) + '"' + (cur === w.id ? " selected" : "") + '>' + esc(w.name) + '</option>'; }).join("") +
        '</select>';
    }
    return '<div class="recent-card">' +
      '<button class="recent-open" data-recent="' + esc(r.id) + '" aria-label="Open ' + esc(title) + '"></button>' +
      '<button class="recent-pin' + (pinned ? " pinned" : "") + '" data-pin="' + esc(r.id) + '" ' +
        'title="' + (pinned ? "Unpin" : "Pin") + '" aria-label="' + (pinned ? "Unpin " : "Pin ") + esc(title) + '" aria-pressed="' + (pinned ? "true" : "false") + '"></button>' +
      '<div class="recent-thumb">' + thumb + '</div>' +
      '<div class="recent-meta"><b>' + esc(title) + '</b><small>' + timeAgo(r.ts) + ' · ' + meta + '</small>' + wbSelect + '</div></div>';
  }
  // Z2 follow-up: "instructions/how-tos/tips beyond the existing tour link" — a small,
  // dismissable-by-clicking-through tip card on Home surfacing one bite-sized power-user
  // tip at a time (real shipped features, not aspirational). Starts on a day-of-month-based
  // tip so it doesn't always show the same one; the ➜ arrow advances (and wraps) on click.
  var HOME_TIPS = [
    "Press ⌘K / Ctrl+K to open the command palette and jump anywhere fast.",
    "Pin a dashboard from its card (★) so it's never evicted from Recents.",
    "Query a hosted CSV or Parquet file straight from the browser with the DuckDB (remote file) source — no backend needed.",
    "File dashboards into Workbooks from the Repository page to keep big projects organized.",
    "Flip on Simple mode in Settings for a friendlier, decluttered builder.",
    "See a small ⓘ glyph beside a setting? Hover it for a plain-English explanation of what it does.",
    "Switch between Classic and Polecat color themes in Settings → Appearance.",
    "Add a trend or forecast line to any Line/Scatter chart — pick linear or Holt exponential smoothing."
  ];
  var _homeTipIdx = new Date().getDate() % HOME_TIPS.length;
  window.__studioHomeTipIdx = function () { return _homeTipIdx; }; // test hook
  window.__studioHomeTipsCount = function () { return HOME_TIPS.length; }; // test hook
  function renderHome() {
    var sec = $("#secHome"); if (!sec) return;
    var list = loadRecents(), pins = loadPins();
    var pinnedList = list.filter(function (r) { return pins.indexOf(r.id) >= 0; });
    var unpinnedList = list.filter(function (r) { return pins.indexOf(r.id) < 0; });
    var cards = [
      { act: "blank", ic: "plus", t: "Blank dashboard", d: "Start from scratch" },
      { act: "examples", ic: "grid", t: "Browse examples", d: "Auto-build from a query set" },
      { act: "tour", ic: "play", t: "Take the tour", d: "Guided walkthrough of the builder" }
    ];
    var html = '<div class="home-wrap">' +
      '<div class="home-hero"><h1>Welcome back</h1><p>Pick up a recent dashboard, or start something new.</p></div>' +
      '<div class="home-quick">' + cards.map(function (c) {
        return '<button class="home-card" data-home="' + c.act + '"><span class="home-card-ic" data-ic="' + c.ic + '"></span>' +
          '<div><b>' + esc(c.t) + '</b><small>' + esc(c.d) + '</small></div></button>';
      }).join("") + '</div>' +
      '<div class="home-tip"><span class="home-tip-ic" data-ic="info"></span>' +
      '<p class="home-tip-txt">' + esc(HOME_TIPS[_homeTipIdx]) + '</p>' +
      '<button type="button" class="home-tip-next" title="Next tip" aria-label="Next tip">' +
      '<span data-ic="chevron-right"></span></button></div>' +
      (pinnedList.length ? '<h2 class="home-sub">Pinned</h2><div class="home-recents">' +
        pinnedList.map(function (r) { return recentCardHtml(r, true); }).join("") + '</div>' : "") +
      (unpinnedList.length ? '<h2 class="home-sub">Recent dashboards</h2><div class="home-recents">' +
        unpinnedList.map(function (r) { return recentCardHtml(r, false); }).join("") + '</div>'
        : (pinnedList.length ? "" : '<div class="home-empty-hint">No recent dashboards yet — start one above and it will show up here.</div>'));
    sec.classList.add("has-content");
    sec.innerHTML = html;
    $$("[data-ic]", sec).forEach(function (span) { span.appendChild(Studio.icon(span.getAttribute("data-ic"), span.classList.contains("home-card-ic") ? 18 : 14)); });
    $$(".home-card", sec).forEach(function (btn) {
      btn.onclick = function () {
        var act = btn.getAttribute("data-home");
        if (window.__studioShellSetSection) window.__studioShellSetSection("studio");
        if (act === "blank") { S.spec = applyDashboardDefaults(Studio.emptySpec()); S.selection = null; syncHeader(); renderInspector(); refreshPreview(); buildLibrary(); bumpDashMilestone(); }
        else if (act === "examples") { setTimeout(function () { var b = $("#btnExamples"); if (b) b.click(); }, 60); }
        else if (act === "tour") { setTimeout(function () { if (window.StudioTutorial) StudioTutorial.open(); }, 60); }
      };
    });
    var tipNext = $(".home-tip-next", sec);
    if (tipNext) tipNext.onclick = function () { _homeTipIdx = (_homeTipIdx + 1) % HOME_TIPS.length; renderHome(); };
    $$(".recent-open", sec).forEach(function (btn) { btn.onclick = function () { openRecent(btn.getAttribute("data-recent")); }; });
    $$(".recent-pin", sec).forEach(function (btn) {
      btn.appendChild(Studio.icon("star", 14));
      btn.onclick = function (e) { e.stopPropagation(); togglePin(btn.getAttribute("data-pin")); };
    });
  }
  window.__studioRecents = loadRecents; // test hook
  window.__studioOpenRecent = openRecent; // test hook
  window.__studioPins = loadPins; // test hook
  window.__studioTogglePin = togglePin; // test hook
  window.__studioVersions = loadVersions; // test hook
  window.__studioSnapshotVersion = snapshotVersion; // test hook
  window.__studioRestoreVersion = restoreVersion; // test hook
  window.__studioOpenVersionDiff = openVersionDiff; // test hook
  window.__studioOpenCompareDashboards = openCompareDashboards; // test hook
  window.__studioOpenJsonEditor = openJsonEditor; // test hook
  window.__studioCanvasNotes = loadCanvasNotes; // test hook
  window.__studioSaveCanvasNote = saveCanvasNote; // test hook
  window.__studioDeleteCanvasNote = deleteCanvasNote; // test hook
  window.__studioOpenNoteEditor = openNoteEditor; // test hook

  /* ---------- Z3 follow-up: Workbooks — named collections of dashboards -------------------
     The north star describes a "workbook" as a named collection of dashboards; until now
     Repository only ever showed one flat dashboard list. A workbook is deliberately thin: a
     {id,name,ts} record plus a `workbookId` stamped onto the matching studio-recents entry
     (not into the dashboard spec itself — filing a dashboard is repository organization, not
     a dashboard property, so it doesn't travel with Save/Export). Repository gets a chip strip
     to filter by workbook; deleting a workbook un-files its dashboards rather than deleting them. */
  var _LS_WORKBOOKS = "studio-workbooks";
  function loadWorkbooks() { try { return JSON.parse(localStorage.getItem(_LS_WORKBOOKS) || "[]"); } catch (e) { return []; } }
  function saveWorkbooks(list) { try { localStorage.setItem(_LS_WORKBOOKS, JSON.stringify(list)); } catch (e) { /* quota or private-mode */ } }
  function addWorkbook(name) {
    name = (name || "").trim(); if (!name) return null;
    var wb = { id: "wb" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name, ts: new Date().toISOString() };
    var list = loadWorkbooks(); list.unshift(wb); saveWorkbooks(list);
    return wb;
  }
  function deleteWorkbook(id) {
    saveWorkbooks(loadWorkbooks().filter(function (w) { return w.id !== id; }));
    var list = loadRecents(), changed = false;
    list.forEach(function (r) { if (r.workbookId === id) { delete r.workbookId; changed = true; } });
    if (changed) { try { localStorage.setItem(_LS_RECENTS, JSON.stringify(list)); } catch (e) {} }
  }
  // Z3 follow-up: rename a workbook after creation (previously create/delete-only).
  // No-op on a blank name or a name unchanged after trimming, same convention as panel/KPI rename.
  function renameWorkbook(id, name) {
    name = (name || "").trim(); if (!name) return false;
    var list = loadWorkbooks(), found = false;
    list.forEach(function (w) { if (w.id === id) { w.name = name; found = true; } });
    if (found) saveWorkbooks(list);
    return found;
  }
  function setDashboardWorkbook(dashId, workbookId) {
    var list = loadRecents();
    list.forEach(function (r) { if (r.id === dashId) { if (workbookId) r.workbookId = workbookId; else delete r.workbookId; } });
    try { localStorage.setItem(_LS_RECENTS, JSON.stringify(list)); } catch (e) {}
  }
  var _repoWbFilter = ""; // "" = All, "__unfiled" = no workbook, else a workbook id
  var _repoDsFilter = ""; // "" = All, else a data-source "Group" (stem) name — see Z3 folders follow-up
  window.__studioWorkbooks = loadWorkbooks; // test hook
  window.__studioAddWorkbook = addWorkbook; // test hook
  window.__studioDeleteWorkbook = deleteWorkbook; // test hook
  window.__studioRenameWorkbook = renameWorkbook; // test hook
  window.__studioSetDashboardWorkbook = setDashboardWorkbook; // test hook

  /* ---------- Z3 slice 1: Repository — data sources + dashboards, one searchable home ---
     Consolidates the two things that used to live in separate corners of the app: the
     catalog of query-library data accesses (S.catalog, same data the Studio library pane
     browses) and the local inventory of dashboards (studio-recents/-pins, same data Home's
     "recent dashboards" grid already tracks). No new storage — this is a browsing surface
     over data that already exists, filtered by one shared search box. Folders/CRUD/JSON
     export of the whole repository are deliberately deferred to a later Z3 slice; this one
     is "can I find and jump to any data source or dashboard I have from a single page?" */
  // N-DATA freshness badge (v301) follow-up: only the connector kinds that are ALWAYS
  // live-capable regardless of the builder's ambient "active connection" setting get a
  // Repository badge — a plain Pentaho sql/mdx/etc. catalog DA's "live-ness" depends on that
  // global setting, not the DA itself, and the bundled catalog has dozens of them, so showing
  // "Never verified live" on every one would be pure noise rather than a useful signal.
  var REPO_LIVE_KINDS = { duckdb: 1, httpvfs: 1, snowflake: 1, databricks: 1, bigquery: 1, http: 1 };
  function repoDaCardHtml(stem, d) {
    var kind = ((d.kind || "sql").split(".")[0]).toUpperCase();
    var cols = (d.columns || []).slice(0, 6).join(", ") + ((d.columns || []).length > 6 ? "…" : "");
    var key = esc(stem) + '|' + esc(d.id);
    var freshness = REPO_LIVE_KINDS[d.kind] ? '<span class="repo-ds-fresh">' + esc(daFreshnessLabel(d.id)) + '</span>' : '';
    // Z3 follow-up: full CRUD from the Repository page itself — edit/delete reuse the
    // exact same dataSourceBuilder()/deleteDataSource() the Studio library pane already
    // uses, so both views always agree (one source of truth, no parallel edit path).
    // A <button> can't nest another <button>, so the open-in-library affordance and the
    // edit/delete actions are separate sibling buttons inside a plain wrapping div.
    return '<div class="repo-ds-card">' +
      '<button type="button" class="repo-ds-open" data-repo-ds="' + key + '">' +
      '<div class="repo-ds-top"><span class="repo-ds-id">' + esc(d.id) + '</span><span class="repo-ds-kind">' + esc(kind) + '</span></div>' +
      '<span class="repo-ds-stem">' + esc(stem) + '</span>' +
      (cols ? '<div class="repo-ds-cols">' + esc(cols) + '</div>' : '') + freshness + '</button>' +
      '<div class="repo-ds-acts">' +
      '<button type="button" class="da-act" data-repo-edit="' + key + '" title="Edit data source"></button>' +
      '<button type="button" class="da-act" data-repo-del="' + key + '" title="Delete data source"></button>' +
      '</div></div>';
  }
  function openDsInLibrary(stem, id) {
    if (window.__studioShellSetSection) window.__studioShellSetSection("studio");
    var ls = $("#libSearch");
    if (ls) { ls.value = id; buildLibrary(); }
    setTimeout(function () {
      var card = document.querySelector('[data-stem="' + CSS.escape(stem) + '"]');
      if (card) card.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 60);
  }
  function renderRepository() {
    var results = $("#repoResults"); if (!results) return;
    var q = (($("#repoSearch") || {}).value || "").toLowerCase();
    // Z3 follow-up (folders/organization for data sources): every data source already carries
    // a "Group" field (the same `stem` the Studio library pane sections by — see the "Group"
    // field in dataSourceBuilder()). No new storage needed — just surface it as a filter chip
    // strip here, mirroring the Workbooks chips below, so Repository lets you browse by folder
    // instead of only free-text search.
    var dsGroupCounts = {}, dsGroupOrder = [];
    Object.keys(S.catalog || {}).sort().forEach(function (stem) {
      var n = ((S.catalog[stem] || {}).dataAccesses || []).length;
      if (!n) return;
      dsGroupCounts[stem] = n; dsGroupOrder.push(stem);
    });
    if (_repoDsFilter && !dsGroupCounts[_repoDsFilter]) _repoDsFilter = "";
    var dsCards = [], totalDs = 0;
    Object.keys(S.catalog || {}).sort().forEach(function (stem) {
      var entry = S.catalog[stem];
      if (_repoDsFilter && stem !== _repoDsFilter) return;
      (entry.dataAccesses || []).forEach(function (d) {
        totalDs++;
        var hay = (stem + " " + d.id + " " + (d.columns || []).join(" ")).toLowerCase();
        if (q && hay.indexOf(q) < 0) return;
        dsCards.push(repoDaCardHtml(stem, d));
      });
    });
    var dsChipDefs = [{ id: "", name: "All", n: dsGroupOrder.reduce(function (s, k) { return s + dsGroupCounts[k]; }, 0) }]
      .concat(dsGroupOrder.map(function (stem) { return { id: stem, name: stem, n: dsGroupCounts[stem] }; }));
    var dsChipsHtml = dsGroupOrder.length > 1 ? '<div class="wb-chips ds-chips">' + dsChipDefs.map(function (c) {
      return '<button type="button" class="wb-chip' + (_repoDsFilter === c.id ? " active" : "") + '" data-ds-filter="' + esc(c.id) + '">' +
        '<span class="wb-chip-label">' + esc(c.name) + '</span> <span class="wb-chip-n">' + c.n + '</span></button>';
    }).join("") + '</div>' : '';
    var list = loadRecents(), pins = loadPins(), workbooks = loadWorkbooks();
    var validWbIds = {}; workbooks.forEach(function (w) { validWbIds[w.id] = true; });
    var wbCounts = { all: list.length, unfiled: 0, byId: {} };
    list.forEach(function (r) {
      if (r.workbookId && validWbIds[r.workbookId]) wbCounts.byId[r.workbookId] = (wbCounts.byId[r.workbookId] || 0) + 1;
      else wbCounts.unfiled++;
    });
    if (_repoWbFilter && _repoWbFilter !== "__unfiled" && !validWbIds[_repoWbFilter]) _repoWbFilter = "";
    var filtered = list.filter(function (r) {
      if (_repoWbFilter === "__unfiled") return !r.workbookId || !validWbIds[r.workbookId];
      if (_repoWbFilter) return r.workbookId === _repoWbFilter;
      return true;
    });
    var dashCards = filtered.filter(function (r) {
      if (!q) return true;
      var sp = r.spec || {};
      return ((sp.title || sp.name || "") + " " + (sp.desc || "")).toLowerCase().indexOf(q) >= 0;
    }).map(function (r) { return recentCardHtml(r, pins.indexOf(r.id) >= 0, { workbooks: workbooks }); });
    var chipDefs = [{ id: "", name: "All", n: wbCounts.all }]
      .concat(workbooks.map(function (w) { return { id: w.id, name: w.name, n: wbCounts.byId[w.id] || 0, del: true }; }))
      .concat([{ id: "__unfiled", name: "Unfiled", n: wbCounts.unfiled }]);
    var chipsHtml = '<div class="wb-chips">' + chipDefs.map(function (c) {
      return '<div class="wb-chip-wrap">' +
        '<button type="button" class="wb-chip' + (_repoWbFilter === c.id ? " active" : "") + '" data-wb-filter="' + esc(c.id) + '"' +
        (c.del ? ' data-wb-name="' + esc(c.id) + '"' : '') + '>' +
        '<span class="wb-chip-label">' + esc(c.name) + '</span> <span class="wb-chip-n">' + c.n + '</span></button>' +
        (c.del ? '<button type="button" class="wb-chip-rename" data-wb-rename="' + esc(c.id) + '" title="Rename workbook ' + esc(c.name) + '" aria-label="Rename workbook ' + esc(c.name) + '"></button>' +
          '<button type="button" class="wb-chip-del" data-wb-del="' + esc(c.id) + '" title="Delete workbook ' + esc(c.name) + '" aria-label="Delete workbook ' + esc(c.name) + '"></button>' : '') +
        '</div>';
    }).join("") +
      '<span class="wb-add"><input type="text" id="wbNameInp" class="wb-name-inp" placeholder="New workbook…" aria-label="New workbook name"/>' +
      '<button type="button" class="btn" id="wbAddBtn">+ Workbook</button></span></div>';
    results.innerHTML =
      '<h2 class="home-sub">Data sources <span class="repo-count">' + dsCards.length + ' of ' + totalDs + '</span></h2>' +
      dsChipsHtml +
      (dsCards.length ? '<div class="repo-ds-grid">' + dsCards.join("") + '</div>'
        : '<div class="home-empty-hint">' + (q ? "No data sources match “" + esc(q) + "”." : (_repoDsFilter ? "No data sources in this group yet." : "No data sources yet.")) + '</div>') +
      '<h2 class="home-sub repo-sub2">Dashboards <span class="repo-count">' + dashCards.length + ' of ' + filtered.length + '</span></h2>' +
      chipsHtml +
      (dashCards.length ? '<div class="home-recents">' + dashCards.join("") + '</div>'
        : '<div class="home-empty-hint">' + (q ? "No dashboards match “" + esc(q) + "”." : (_repoWbFilter ? "No dashboards in this workbook yet." : "No dashboards yet — build one in Studio and it will show up here.")) + '</div>');
    $$("[data-ds-filter]", results).forEach(function (btn) {
      btn.onclick = function () { _repoDsFilter = btn.getAttribute("data-ds-filter"); renderRepository(); };
    });
    $$("[data-wb-filter]", results).forEach(function (btn) {
      btn.onclick = function () { _repoWbFilter = btn.getAttribute("data-wb-filter"); renderRepository(); };
    });
    // Z3 follow-up: rename a workbook via a hover-revealed ✎ button beside the ✕ delete —
    // swaps the chip's label span for an inline <input> (same convention as panel/KPI rename),
    // committing on Enter/blur and discarding on Escape.
    $$(".wb-chip-rename", results).forEach(function (btn) {
      btn.appendChild(Studio.icon("edit", 9));
      btn.onclick = function (e) {
        e.stopPropagation();
        var wbId = btn.getAttribute("data-wb-rename");
        var chip = btn.previousElementSibling; // the .wb-chip button itself
        var labelEl = chip && $(".wb-chip-label", chip); if (!labelEl) return;
        var cur = labelEl.textContent;
        var inp = document.createElement("input");
        inp.type = "text"; inp.className = "wb-chip-rename-inp"; inp.value = cur;
        inp.setAttribute("aria-label", "Rename workbook");
        labelEl.replaceWith(inp); inp.focus(); inp.select();
        var done = false;
        function commit(save) {
          if (done) return; done = true;
          if (save) renameWorkbook(wbId, inp.value);
          renderRepository();
        }
        inp.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter") { ev.preventDefault(); commit(true); }
          else if (ev.key === "Escape") { commit(false); }
        });
        inp.addEventListener("blur", function () { commit(true); });
        inp.addEventListener("click", function (ev) { ev.stopPropagation(); });
        inp.addEventListener("dblclick", function (ev) { ev.stopPropagation(); });
      };
    });
    $$(".wb-chip-del", results).forEach(function (btn) {
      btn.appendChild(Studio.icon("trash", 9));
      btn.onclick = function (e) {
        e.stopPropagation();
        var id = btn.getAttribute("data-wb-del");
        var wb = workbooks.filter(function (w) { return w.id === id; })[0];
        if (!wb) return;
        if (confirm("Delete workbook “" + wb.name + "”? Its dashboards stay — they're just un-filed.")) {
          deleteWorkbook(id);
          if (_repoWbFilter === id) _repoWbFilter = "";
          renderRepository();
        }
      };
    });
    var wbAddBtn = $("#wbAddBtn", results);
    if (wbAddBtn) wbAddBtn.onclick = function () {
      var inp = $("#wbNameInp", results);
      var wb = addWorkbook(inp && inp.value);
      if (wb) { _repoWbFilter = wb.id; renderRepository(); }
    };
    var wbNameInp = $("#wbNameInp", results);
    if (wbNameInp) wbNameInp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); wbAddBtn.click(); } });
    $$(".recent-wb-sel", results).forEach(function (sel) {
      sel.addEventListener("click", function (e) { e.stopPropagation(); });
      sel.addEventListener("change", function () {
        setDashboardWorkbook(sel.getAttribute("data-recent-wb"), sel.value);
        renderRepository();
      });
    });
    $$(".repo-ds-open", results).forEach(function (btn) {
      btn.onclick = function () {
        var parts = btn.getAttribute("data-repo-ds").split("|");
        openDsInLibrary(parts[0], parts[1]);
      };
    });
    $$("[data-repo-edit]", results).forEach(function (btn) {
      btn.appendChild(Studio.icon("edit", 12));
      btn.onclick = function (e) {
        e.stopPropagation();
        var parts = btn.getAttribute("data-repo-edit").split("|"), stem = parts[0], id = parts[1];
        var entry = S.catalog[stem], da = entry && (entry.dataAccesses || []).filter(function (x) { return x.id === id; })[0];
        if (da) dataSourceBuilder({ stem: stem, da: da });
      };
    });
    $$("[data-repo-del]", results).forEach(function (btn) {
      btn.appendChild(Studio.icon("trash", 12));
      btn.onclick = function (e) {
        e.stopPropagation();
        var parts = btn.getAttribute("data-repo-del").split("|"), stem = parts[0], id = parts[1];
        if (confirm("Delete data source “" + id + "” from the library?")) deleteDataSource(stem, id);
      };
    });
    $$(".recent-open", results).forEach(function (btn) { btn.onclick = function () { openRecent(btn.getAttribute("data-recent")); }; });
    $$(".recent-pin", results).forEach(function (btn) {
      btn.appendChild(Studio.icon("star", 14));
      btn.onclick = function (e) { e.stopPropagation(); togglePin(btn.getAttribute("data-pin")); };
    });
  }
  window.__studioRenderRepository = renderRepository; // test hook

  /* ---------- Z3 follow-up: whole-repository JSON export/import ----------
     Bundled examples/catalog entries already live in the repo as files, so exporting
     those back out would just be redundant noise. What's actually "yours" and worth
     carrying to another browser/device is: data sources you authored (da.authored),
     plus the local dashboard inventory (recents + pins). Import is additive/merge —
     it never deletes anything already here, so it's safe to import onto a machine
     that already has its own repository. */
  function exportRepositoryFile() {
    var dataSources = [];
    Object.keys(S.catalog || {}).forEach(function (stem) {
      (S.catalog[stem].dataAccesses || []).forEach(function (d) {
        if (d.authored) dataSources.push({ stem: stem, da: d });
      });
    });
    var out = { _type: "studio-repository", _v: 1, dataSources: dataSources, dashboards: loadRecents(), pins: loadPins(), workbooks: loadWorkbooks() };
    download("dashboard-studio-repository.json", JSON.stringify(out, null, 2), "application/json");
  }
  // Merges a parsed repository-export object into the current catalog + recents/pins/workbooks.
  // Returns {ok, dsCount, dashCount} on success, {ok:false} if the file isn't recognized.
  // Split out from importRepositoryFile so it can be unit-tested without a file-picker.
  function applyRepositoryData(data) {
    if (!data || data._type !== "studio-repository") return { ok: false };
    var dsCount = 0;
    (data.dataSources || []).forEach(function (item) {
      var stem = item.stem || "custom", d = item.da; if (!d || !d.id) return;
      if (!S.catalog[stem]) S.catalog[stem] = { file: stem + ".cda", connection: { id: "pdc", jndi: d.jndi || "PDC-BIDB-EXT" }, dataAccesses: [] };
      var entry = S.catalog[stem];
      entry.dataAccesses = entry.dataAccesses.filter(function (x) { return x.id !== d.id; }).concat([d]);
      dsCount++;
    });
    var existing = loadRecents(), byId = {};
    existing.forEach(function (r) { byId[r.id] = r; });
    (data.dashboards || []).forEach(function (r) { if (r && r.id) byId[r.id] = r; });
    var merged = Object.keys(byId).map(function (id) { return byId[id]; })
      .sort(function (a, b) { return (b.ts || "").localeCompare(a.ts || ""); });
    try { localStorage.setItem(_LS_RECENTS, JSON.stringify(merged)); } catch (e) { /* quota or private-mode */ }
    var pins = loadPins(), pinSet = {};
    pins.concat(data.pins || []).forEach(function (id) { pinSet[id] = true; });
    savePins(Object.keys(pinSet));
    var wbList = loadWorkbooks(), wbById = {};
    wbList.forEach(function (w) { wbById[w.id] = w; });
    (data.workbooks || []).forEach(function (w) { if (w && w.id) wbById[w.id] = w; });
    saveWorkbooks(Object.keys(wbById).map(function (id) { return wbById[id]; }));
    buildLibrary(); renderHome(); renderRepository();
    return { ok: true, dsCount: dsCount, dashCount: (data.dashboards || []).length };
  }
  function importRepositoryFile() {
    var inp = el("input"); inp.type = "file"; inp.accept = ".json,application/json";
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var data;
        try { data = JSON.parse(rd.result); } catch (e) { toast("Invalid repository file", true); return; }
        if (!data || data._type !== "studio-repository") { toast("Not a Dashboard Studio repository file", true); return; }
        if (!confirm("Import " + (data.dataSources || []).length + " data source(s) and " + (data.dashboards || []).length + " dashboard(s)? This merges into your current repository — nothing existing is deleted.")) return;
        var res = applyRepositoryData(data);
        toast("Imported " + res.dsCount + " data source(s), " + res.dashCount + " dashboard(s)");
      };
      rd.readAsText(f);
    };
    inp.click();
  }
  window.__studioExportRepository = exportRepositoryFile; // test hook
  window.__studioApplyRepositoryData = applyRepositoryData; // test hook (bypasses file-picker + confirm)

  /* ---------- Z5 slice 1: Settings — first-class mode toggles ----------
     The app's mode switches (Theme, Simple mode, Demo mode, Focus mode) used to
     live only in the ⋯ More menu, hard to discover. This gives them a proper,
     labelled home with real on/off switches. Each toggle reuses the existing
     mode function as its single source of truth (no parallel state) — flipping
     a switch here, in ⋯ More, or via a shortcut all stay in sync because every
     path re-renders this section. */
  var SETTINGS_TOGGLES = [
    { grp: "Appearance", id: "dark", t: "Dark mode", d: "Switch the builder and live preview to a dark theme.",
      ic: function () { return S.theme === "dark" ? "moon" : "sun"; },
      on: function () { return S.theme === "dark"; },
      set: function () { setTheme(S.theme === "dark" ? "light" : "dark"); } },
    { grp: "Mode", id: "simple", t: "Simple mode", d: "Hide advanced inspector sections and narrow the chart gallery to the most common types.",
      ic: function () { return "layers"; },
      on: function () { return !!S.simpleMode; },
      set: function () { toggleSimpleMode(); } },
    { grp: "Presentation", id: "demo", t: "Demo mode", d: "Simulate a live-refreshing data feed — great for stakeholder demos.",
      ic: function () { return "refresh"; },
      on: function () { return !!S.demoMode; },
      set: function () { toggleDemoMode(); } },
    { grp: "Presentation", id: "focus", t: "Focus mode", d: "Collapse the builder panes so the live preview fills the screen. Press Escape to exit.",
      ic: function () { return "eye"; },
      on: function () { return document.body.classList.contains("focus-mode"); },
      set: function () {
        if (document.body.classList.contains("focus-mode")) { exitFocusMode(); }
        else { if (window.__studioShellSetSection) window.__studioShellSetSection("studio"); enterFocusMode(); }
      } }
  ];

  /* ---------- Z12: Branding — app mark as a Settings option -----------------
     Default / custom-logo / none, so the rail identity isn't hardcoded. A custom
     logo is stored as a data: URL in localStorage (capped small — this is an icon,
     not an asset host) so it survives reload with zero backend. */
  var BRAND_MAX_BYTES = 200 * 1024; // ~200KB — plenty for an icon-sized logo, keeps localStorage sane
  function getBranding() {
    try { return JSON.parse(localStorage.getItem("studio-branding") || "null") || { mode: "default" }; }
    catch (e) { return { mode: "default" }; }
  }
  function setBranding(b) {
    try { localStorage.setItem("studio-branding", JSON.stringify(b)); } catch (e) {}
    applyBranding();
  }
  function applyBranding() {
    var b = getBranding();
    var mark = document.querySelector(".rail-brand-mark");
    if (!mark) return;
    if (b.mode === "custom" && b.dataUrl) { mark.src = b.dataUrl; mark.style.display = ""; }
    else if (b.mode === "none") { mark.style.display = "none"; }
    else { mark.src = "favicon.svg"; mark.style.display = ""; }
  }
  window.__studioBranding = { get: getBranding, set: setBranding, apply: applyBranding }; // test hook

  // Z5 follow-up: export/import Settings as JSON — the keys below are app-wide
  // *preferences* (theme, mode, layout, connections), never dashboard content —
  // that's already covered by Save/Open. Lets a user carry their setup to another
  // browser/device or back it up before "Clear local data".
  var SETTINGS_DATA_KEYS = [
    "studio-theme", "studio-app-theme", "studio-simple-mode", "studio-connections", "studio-active-conn",
    "studio-lw", "studio-rw", "studio-collapse-library", "studio-collapse-inspector",
    "studio-insp-collapsed", "studio-shell-section", "studio-shell-expanded", "studio-branding",
    "studio-default-jndi", "studio-default-subtitle", "studio-default-accent", "studio-default-logo", "studio-default-headerbg",
    "studio-default-titlesize", "studio-default-subtitlestyle", "studio-default-dashboardtheme", "studio-default-cardskin", "studio-style-presets",
    "studio-deploy-path", "studio-live-data", "studio-templatevar-sets"
  ];
  // Z5 follow-up: data-source defaults. Every new data source (dataSourceBuilder with no
  // `existing`) used to fall back to a hardcoded "PDC-BIDB-EXT" JNDI pool name; most teams
  // have their own standard pool, so make it a one-time Settings preference instead.
  function defaultJndi() {
    var v; try { v = localStorage.getItem("studio-default-jndi"); } catch (e) {}
    return (v && v.trim()) || "PDC-BIDB-EXT";
  }
  function setDefaultJndi(v) { try { localStorage.setItem("studio-default-jndi", (v || "").trim()); } catch (e) {} }
  window.__studioDefaultJndi = defaultJndi; // test hook

  // Z5 follow-up: deploy target config. S.settings.{deployPath,live} used to be in-memory-only
  // (hardcoded defaults, reset every reload) despite living on a page titled "app-wide preferences,
  // saved locally on this device" — found while surfacing them as a first-class Settings card.
  // Persisted the same way every other Settings default already is.
  function deployPathPref() {
    var v; try { v = localStorage.getItem("studio-deploy-path"); } catch (e) {}
    return (v && v.trim()) || "/public/pdc-iteration/v2";
  }
  function setDeployPathPref(v) { try { localStorage.setItem("studio-deploy-path", (v || "").trim()); } catch (e) {} }
  function liveDataPref() {
    var v; try { v = localStorage.getItem("studio-live-data"); } catch (e) {}
    return v === "1";
  }
  function setLiveDataPref(v) { try { localStorage.setItem("studio-live-data", v ? "1" : "0"); } catch (e) {} }

  // Z6/Z5 follow-up: dashboard defaults. A light first cut of the "style-preset collections"
  // ask — a single default subtitle + accent color applied to every brand-new blank dashboard,
  // so a team's house style doesn't need re-entering by hand each time. Existing dashboards
  // (Open/Import/examples) are never touched — this only seeds Studio.emptySpec() output.
  function defaultSubtitle() {
    var v; try { v = localStorage.getItem("studio-default-subtitle"); } catch (e) {}
    return v || "";
  }
  function setDefaultSubtitle(v) { try { localStorage.setItem("studio-default-subtitle", v || ""); } catch (e) {} }
  function defaultAccentColor() {
    var v; try { v = localStorage.getItem("studio-default-accent"); } catch (e) {}
    return v || "";
  }
  function setDefaultAccentColor(v) { try { localStorage.setItem("studio-default-accent", v || ""); } catch (e) {} }
  // Z6 follow-up: default header background color — same seeding pattern as subtitle/accent,
  // for the per-dashboard "Header background color" field (flat banner fill, distinct from
  // Accent color which only tints the border/chart accents).
  function defaultHeaderBg() {
    var v; try { v = localStorage.getItem("studio-default-headerbg"); } catch (e) {}
    return v || "";
  }
  function setDefaultHeaderBg(v) { try { localStorage.setItem("studio-default-headerbg", v || ""); } catch (e) {} }
  // Z6 follow-up: default title size + subtitle style — same seeding pattern, for the
  // per-dashboard "Title size"/"Subtitle style" fields added after the preset collection shipped.
  function defaultTitleSize() {
    var v; try { v = localStorage.getItem("studio-default-titlesize"); } catch (e) {}
    return v || "";
  }
  function setDefaultTitleSize(v) { try { localStorage.setItem("studio-default-titlesize", v || ""); } catch (e) {} }
  function defaultSubtitleStyle() {
    var v; try { v = localStorage.getItem("studio-default-subtitlestyle"); } catch (e) {}
    return v || "";
  }
  function setDefaultSubtitleStyle(v) { try { localStorage.setItem("studio-default-subtitlestyle", v || ""); } catch (e) {} }
  // Visual refresh (A) follow-up: default Dashboard theme — same seeding pattern as the other
  // style defaults, for the whole-look Studio.DASHBOARD_THEMES picker (v281). Lets a team make
  // Fleet Modern (or any future preset) the house look for brand-new dashboards without touching
  // existing ones, without hardcoding a new global default ahead of a user look-see.
  function defaultDashboardTheme() {
    var v; try { v = localStorage.getItem("studio-default-dashboardtheme"); } catch (e) {}
    return v || "";
  }
  function setDefaultDashboardTheme(v) { try { localStorage.setItem("studio-default-dashboardtheme", v || ""); } catch (e) {} }
  // N-DESIGN follow-up: default card style — same seeding pattern, for the per-dashboard
  // "Card style" (Raised/Flat chart skin) field added right after the picker itself shipped.
  function defaultCardSkin() {
    var v; try { v = localStorage.getItem("studio-default-cardskin"); } catch (e) {}
    return v || "";
  }
  function setDefaultCardSkin(v) { try { localStorage.setItem("studio-default-cardskin", v || ""); } catch (e) {} }
  // Z6 follow-up: default header logo — the last "still open" item under the style-preset
  // collection ask. Same data-URL-in-localStorage approach as per-dashboard headerLogo/app
  // Branding, just seeded onto brand-new blank dashboards like subtitle/accent already are.
  function defaultLogo() {
    var v; try { v = localStorage.getItem("studio-default-logo"); } catch (e) {}
    return v || "";
  }
  function setDefaultLogo(v) { try { localStorage.setItem("studio-default-logo", v || ""); } catch (e) {} }
  // Z6 follow-up: named style-preset collection. Each preset snapshots the default
  // fields above under a name, so a team can save several house styles (e.g. per client
  // or per event) and switch the active default with one click instead of re-typing it.
  function stylePresets() {
    var v; try { v = localStorage.getItem("studio-style-presets"); } catch (e) {}
    try { return v ? JSON.parse(v) : []; } catch (e) { return []; }
  }
  function saveStylePresetList(list) { try { localStorage.setItem("studio-style-presets", JSON.stringify(list)); } catch (e) {} }
  function addStylePreset(name) {
    var list = stylePresets();
    list.push({
      id: "sp" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name,
      subtitle: defaultSubtitle(), accentColor: defaultAccentColor(), logo: defaultLogo(), headerBg: defaultHeaderBg(),
      titleSize: defaultTitleSize(), subtitleStyle: defaultSubtitleStyle(), dashboardTheme: defaultDashboardTheme(),
      cardSkin: defaultCardSkin()
    });
    saveStylePresetList(list);
    return list;
  }
  function deleteStylePreset(id) { saveStylePresetList(stylePresets().filter(function (p) { return p.id !== id; })); }
  function applyStylePreset(id) {
    var p = stylePresets().filter(function (x) { return x.id === id; })[0];
    if (!p) return false;
    setDefaultSubtitle(p.subtitle || ""); setDefaultAccentColor(p.accentColor || ""); setDefaultLogo(p.logo || ""); setDefaultHeaderBg(p.headerBg || "");
    setDefaultTitleSize(p.titleSize || ""); setDefaultSubtitleStyle(p.subtitleStyle || ""); setDefaultDashboardTheme(p.dashboardTheme || "");
    setDefaultCardSkin(p.cardSkin || "");
    return true;
  }
  window.__studioStylePresets = stylePresets; // test hook
  // N-DEV follow-up: named, reusable template-variable sets. A style preset (above) seeds new
  // dashboards with default look fields; this instead lets ANY dashboard grab a previously-saved
  // {{key}}→value set in one click — e.g. save an "APAC" set and an "EMEA" set once, then apply
  // whichever fits to any dashboard built from the same {{region}}-templated spec.
  function templateVarSets() {
    var v; try { v = localStorage.getItem("studio-templatevar-sets"); } catch (e) {}
    try { return v ? JSON.parse(v) : []; } catch (e) { return []; }
  }
  function saveTemplateVarSetList(list) { try { localStorage.setItem("studio-templatevar-sets", JSON.stringify(list)); } catch (e) {} }
  function addTemplateVarSet(name, vars) {
    var list = templateVarSets();
    list.push({
      id: "tv" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name,
      vars: (vars || []).map(function (v) { return { key: v.key, value: v.value }; })
    });
    saveTemplateVarSetList(list);
    return list;
  }
  function deleteTemplateVarSet(id) { saveTemplateVarSetList(templateVarSets().filter(function (p) { return p.id !== id; })); }
  function applyTemplateVarSet(id, sp) {
    var p = templateVarSets().filter(function (x) { return x.id === id; })[0];
    if (!p) return false;
    sp.templateVars = (p.vars || []).map(function (v) { return { key: v.key, value: v.value }; });
    return true;
  }
  window.__studioTemplateVarSets = templateVarSets; // test hook
  function applyDashboardDefaults(spec) {
    var sub = defaultSubtitle(); if (sub && !spec.subtitle) spec.subtitle = sub;
    var acc = defaultAccentColor(); if (acc) spec.themeColor = acc;
    var logo = defaultLogo(); if (logo && !spec.headerLogo) spec.headerLogo = logo;
    var hbg = defaultHeaderBg(); if (hbg && !spec.headerBg) spec.headerBg = hbg;
    var tsz = defaultTitleSize(); if (tsz && !spec.titleSize) spec.titleSize = tsz;
    var sst = defaultSubtitleStyle(); if (sst && !spec.subtitleStyle) spec.subtitleStyle = sst;
    var dth = defaultDashboardTheme(); if (dth && !spec.dashboardTheme) spec.dashboardTheme = dth;
    var csk = defaultCardSkin(); if (csk && !spec.cardSkin) spec.cardSkin = csk;
    return spec;
  }
  window.__studioDefaultSubtitle = defaultSubtitle; // test hooks
  window.__studioDefaultAccentColor = defaultAccentColor;
  window.__studioDefaultLogo = defaultLogo;
  window.__studioDefaultHeaderBg = defaultHeaderBg;
  window.__studioDefaultTitleSize = defaultTitleSize;
  window.__studioDefaultSubtitleStyle = defaultSubtitleStyle;
  window.__studioDefaultDashboardTheme = defaultDashboardTheme;
  window.__studioDefaultCardSkin = defaultCardSkin;
  function exportSettingsFile() {
    var out = { _type: "studio-settings", _v: 1 };
    SETTINGS_DATA_KEYS.forEach(function (k) {
      var v = null; try { v = localStorage.getItem(k); } catch (e) {}
      if (v !== null) out[k] = v;
    });
    download("dashboard-studio-settings.json", JSON.stringify(out, null, 2), "application/json");
  }
  // applies a parsed settings-export object to localStorage; returns false if the
  // file isn't recognized. Split out from importSettingsFile so it can be unit-tested
  // without driving a real file-picker dialog.
  function applySettingsData(data) {
    if (!data || data._type !== "studio-settings") return false;
    SETTINGS_DATA_KEYS.forEach(function (k) {
      if (typeof data[k] === "string") { try { localStorage.setItem(k, data[k]); } catch (e) {} }
    });
    return true;
  }
  function importSettingsFile() {
    var inp = el("input"); inp.type = "file"; inp.accept = ".json,application/json";
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var data;
        try { data = JSON.parse(rd.result); } catch (e) { toast("Invalid settings file", true); return; }
        if (!confirmAndApplySettings(data)) return;
        toast("Settings imported — reloading…");
        setTimeout(function () { location.reload(); }, 900);
      };
      rd.readAsText(f);
    };
    inp.click();
  }
  function confirmAndApplySettings(data) {
    if (!data || data._type !== "studio-settings") { toast("Not a Dashboard Studio settings file", true); return false; }
    if (!confirm("Import these settings? This replaces your current theme, mode, connections, and layout preferences, then reloads.")) return false;
    return applySettingsData(data);
  }
  window.__studioExportSettings = exportSettingsFile; // test hook
  window.__studioApplySettingsData = applySettingsData; // test hook (bypasses file-picker + confirm)
  window.__studioImportSettingsKeys = SETTINGS_DATA_KEYS; // test hook

  function renderSettings() {
    var sec = $("#secSettings"); if (!sec) return;
    var groups = [];
    SETTINGS_TOGGLES.forEach(function (t) { if (groups.indexOf(t.grp) < 0) groups.push(t.grp); });
    var APP_THEME_LABELS = { classic: "Classic Blue", polecat: "Polecat", modern: "Fleet Modern" };
    var html = '<div class="settings-wrap"><div class="settings-hero"><h1>Settings</h1>' +
      '<p>App-wide preferences, saved locally on this device.</p></div>' +
      groups.map(function (g) {
        var themeRow = g === "Appearance" ?
          '<div class="set-row"><span class="set-row-ic" data-ic="palette"></span>' +
            '<div class="set-row-txt"><b>Color theme</b><small>Classic Blue is the original Pentaho-style chrome; Polecat recolors the builder in the warm terracotta/plum look the left rail already uses; Fleet Modern applies the same jobtracker.polecat.live tokens as the Fleet Modern dashboard theme.</small></div>' +
            '<select id="appThemeSel" class="set-sel">' +
              APP_THEME_KEYS.map(function (m) {
                return '<option value="' + m + '"' + (appTheme() === m ? " selected" : "") + '>' + APP_THEME_LABELS[m] + '</option>';
              }).join("") +
            '</select></div>' : "";
        return '<div class="settings-card"><h2>' + esc(g) + '</h2>' +
          SETTINGS_TOGGLES.filter(function (t) { return t.grp === g; }).map(function (t) {
            return '<div class="set-row"><span class="set-row-ic" data-ic="' + t.ic() + '"></span>' +
              '<div class="set-row-txt"><b>' + esc(t.t) + '</b><small>' + esc(t.d) + '</small></div>' +
              '<label class="set-sw"><input type="checkbox" data-set="' + t.id + '"' + (t.on() ? " checked" : "") + '/><span class="set-sw-track"></span></label></div>';
          }).join("") + themeRow + '</div>';
      }).join("") +
      (function () {
        var b = getBranding(), mode = b.mode || "default";
        return '<div class="settings-card"><h2>Branding</h2>' +
          '<div class="set-row"><span class="set-row-ic" data-ic="upload"></span>' +
            '<div class="set-row-txt"><b>App mark</b><small>Shown at the top of the left rail. Choose the default mark, a custom logo, or none.</small></div>' +
            '<select id="brandModeSel" class="set-sel">' +
              ['default', 'custom', 'none'].map(function (m) {
                var lbl = m === "default" ? "Default" : m === "custom" ? "Custom logo" : "None";
                return '<option value="' + m + '"' + (mode === m ? " selected" : "") + '>' + lbl + '</option>';
              }).join("") +
            '</select></div>' +
          '<div class="set-row" id="brandUploadRow"' + (mode === "custom" ? "" : ' style="display:none"') + '>' +
            '<span class="set-row-ic" data-ic="upload"></span>' +
            '<div class="set-row-txt"><b>Custom logo</b><small>PNG/JPG/SVG, up to 200KB. Stored locally on this device.</small>' +
              (mode === "custom" && b.dataUrl ? '<div class="brand-preview"><img src="' + esc(b.dataUrl) + '" alt="Custom logo preview" width="26" height="26"/></div>' : '') +
            '</div>' +
            '<input type="file" id="brandFileInp" accept="image/png,image/jpeg,image/svg+xml" style="display:none"/>' +
            '<button type="button" class="btn" id="brandUploadBtn">Choose file…</button></div>' +
        '</div>';
      })() +
      '<div class="settings-card"><h2>Data source defaults</h2>' +
        '<div class="set-row"><span class="set-row-ic" data-ic="db"></span>' +
          '<div class="set-row-txt"><b>Default JNDI connection</b><small>Pre-fills the Connection field whenever you create a new data source (＋ New source), instead of the built-in "PDC-BIDB-EXT" placeholder.</small></div>' +
          '<input type="text" id="setDefaultJndiInp" class="set-txt" value="' + esc(defaultJndi()) + '" placeholder="PDC-BIDB-EXT"/></div>' +
      '</div>' +
      '<div class="settings-card"><h2>Dashboard defaults</h2>' +
        '<div class="set-row"><span class="set-row-ic" data-ic="layers"></span>' +
          '<div class="set-row-txt"><b>Default subtitle</b><small>Pre-fills every new blank dashboard\'s subtitle field with your team\'s house style (e.g. a standard tagline). Blank leaves it empty.</small></div>' +
          '<input type="text" id="setDefaultSubtitleInp" class="set-txt" value="' + esc(defaultSubtitle()) + '" placeholder="e.g. Prepared by the SE team"/></div>' +
        '<div class="set-row"><span class="set-row-ic" data-ic="palette"></span>' +
          '<div class="set-row-txt"><b>Default accent color</b><small>Applied to every new blank dashboard\'s banner (same picker as the per-dashboard Accent color field). Pentaho blue keeps the built-in default.</small></div>' +
          '<div class="set-accent-presets" id="setDefaultAccentRow">' +
            Studio.THEME_PRESETS.map(function (preset) {
              return '<button type="button" class="set-accent-swatch' + (defaultAccentColor() === preset.color ? " active" : "") + '" data-accent="' + esc(preset.color) + '" title="' + esc(preset.label) + '" aria-pressed="' + (defaultAccentColor() === preset.color ? "true" : "false") + '" style="background:' + (preset.color || "#005bb5") + '"></button>';
            }).join("") +
            '<input type="color" id="setDefaultAccentCustom" title="Custom accent color" value="' + esc(defaultAccentColor() || "#005bb5") + '"/>' +
          '</div></div>' +
        '<div class="set-row"><span class="set-row-ic" data-ic="upload"></span>' +
          '<div class="set-row-txt"><b>Default header logo</b><small>Seeds every new blank dashboard\'s Header logo field (per-dashboard, still editable there). PNG/JPG/SVG, up to 200KB.</small>' +
            (defaultLogo() ? '<div class="brand-preview"><img src="' + esc(defaultLogo()) + '" alt="Default header logo preview" width="26" height="26"/></div>' : '') +
          '</div>' +
          '<input type="file" id="setDefaultLogoInp" accept="image/png,image/jpeg,image/svg+xml" style="display:none"/>' +
          '<button type="button" class="btn" id="setDefaultLogoBtn">' + (defaultLogo() ? "Change…" : "Upload…") + '</button>' +
          (defaultLogo() ? '<button type="button" class="btn" id="setDefaultLogoClearBtn">Clear</button>' : '') +
        '</div>' +
        '<div class="set-row"><span class="set-row-ic" data-ic="palette"></span>' +
          '<div class="set-row-txt"><b>Default header background color</b><small>Seeds every new blank dashboard\'s Header background color field (flat banner fill, per-dashboard editable there). Blank keeps the standard navy gradient.</small></div>' +
          '<div class="set-accent-presets">' +
            '<input type="color" id="setDefaultHeaderBgCustom" title="Default header background color" value="' + esc(defaultHeaderBg() || "#102445") + '"/>' +
            (defaultHeaderBg() ? '<button type="button" class="btn" id="setDefaultHeaderBgClearBtn">Clear</button>' : '') +
          '</div></div>' +
        '<div class="set-row"><span class="set-row-ic" data-ic="layers"></span>' +
          '<div class="set-row-txt"><b>Default title size</b><small>Seeds every new blank dashboard\'s Title size field (per-dashboard editable there).</small></div>' +
          '<select id="setDefaultTitleSizeSel" class="set-sel">' +
            Studio.TITLE_SIZES.map(function (p) { return '<option value="' + esc(p[0]) + '"' + (defaultTitleSize() === p[0] ? " selected" : "") + '>' + esc(p[1]) + '</option>'; }).join("") +
          '</select></div>' +
        '<div class="set-row"><span class="set-row-ic" data-ic="layers"></span>' +
          '<div class="set-row-txt"><b>Default subtitle style</b><small>Seeds every new blank dashboard\'s Subtitle style field (per-dashboard editable there).</small></div>' +
          '<select id="setDefaultSubtitleStyleSel" class="set-sel">' +
            Studio.SUBTITLE_STYLES.map(function (p) { return '<option value="' + esc(p[0]) + '"' + (defaultSubtitleStyle() === p[0] ? " selected" : "") + '>' + esc(p[1]) + '</option>'; }).join("") +
          '</select></div>' +
        '<div class="set-row"><span class="set-row-ic" data-ic="palette"></span>' +
          '<div class="set-row-txt"><b>Default dashboard theme</b><small>Seeds every new blank dashboard\'s whole-look theme (background, panels, text, brand + series colors — same picker as the per-dashboard Dashboard theme field). Classic Pentaho Blue keeps the built-in look.</small></div>' +
          '<select id="setDefaultDashboardThemeSel" class="set-sel">' +
            Studio.DASHBOARD_THEMES.map(function (p) { return '<option value="' + esc(p.key === "classic" ? "" : p.key) + '"' + (defaultDashboardTheme() === (p.key === "classic" ? "" : p.key) ? " selected" : "") + '>' + esc(p.label) + '</option>'; }).join("") +
          '</select></div>' +
        '<div class="set-row"><span class="set-row-ic" data-ic="layers"></span>' +
          '<div class="set-row-txt"><b>Default card style</b><small>Seeds every new blank dashboard\'s Card style field (per-dashboard editable there) — Flat drops the shadow/hover-lift on every chart card and KPI tile for a quieter, editorial look.</small></div>' +
          '<select id="setDefaultCardSkinSel" class="set-sel">' +
            Studio.CARD_SKINS.map(function (p) { return '<option value="' + esc(p[0]) + '"' + (defaultCardSkin() === p[0] ? " selected" : "") + '>' + esc(p[1]) + '</option>'; }).join("") +
          '</select></div>' +
        '<div class="set-row set-row-col"><span class="set-row-ic" data-ic="star"></span>' +
          '<div class="set-row-txt"><b>Style presets</b><small>Save the fields above as a named preset, then switch your team\'s active default with one click — handy for more than one house style (e.g. per client).</small></div>' +
          '<div class="sp-list" id="spList">' +
            stylePresets().map(function (p) {
              return '<div class="sp-item" data-id="' + esc(p.id) + '">' +
                (p.logo ? '<img class="sp-logo" src="' + esc(p.logo) + '" alt=""/>' : '<span class="sp-swatch" style="background:' + esc(p.accentColor || "#005bb5") + '"></span>') +
                '<span class="sp-name">' + esc(p.name) + '</span>' +
                '<button type="button" class="btn sp-apply" data-id="' + esc(p.id) + '">Apply</button>' +
                '<button type="button" class="icobtn danger sp-del" data-id="' + esc(p.id) + '" aria-label="Delete preset ' + esc(p.name) + '"></button>' +
              '</div>';
            }).join("") +
            (stylePresets().length ? "" : '<div class="sp-empty">No saved presets yet.</div>') +
          '</div>' +
          '<div class="sp-add-row"><input type="text" id="spNameInp" class="set-txt" placeholder="Preset name, e.g. Acme Corp"/>' +
            '<button type="button" class="btn" id="spSaveBtn">+ Save as preset</button></div>' +
        '</div>' +
      '</div>' +
      (function () {
        var ac = activeConnection();
        return '<div class="settings-card"><h2>Deploy</h2>' +
          '<div class="set-row"><span class="set-row-ic" data-ic="db"></span>' +
            '<div class="set-row-txt"><b>Deploy path</b><small>Server folder that stamps the CDA links in every export, and where Push publishes artifacts.</small></div>' +
            '<input type="text" id="setDeployPathInp" class="set-txt" value="' + esc(S.settings.deployPath || "") + '" placeholder="/public/studio"/></div>' +
          '<div class="set-row"><span class="set-row-ic" data-ic="eye"></span>' +
            '<div class="set-row-txt"><b>Live data in preview</b><small>' + (ac ? "Active server: " + esc(ac.name) + " — " + esc(Studio.PentahoClient(ac).base()) : "No active server connection — add one in ⚙ Servers first.") + '</small></div>' +
            '<label class="set-sw"><input type="checkbox" id="setLiveDataCb"' + (S.settings.live ? " checked" : "") + (ac ? "" : " disabled") + '/><span class="set-sw-track"></span></label></div>' +
        '</div>';
      })() +
      '<div class="settings-card"><h2>Data</h2>' +
        '<div class="set-row"><span class="set-row-ic" data-ic="download"></span>' +
          '<div class="set-row-txt"><b>Export settings</b><small>Save theme, mode, connections &amp; layout preferences as a .json file.</small></div>' +
          '<button type="button" class="btn" id="setExportBtn">Export</button></div>' +
        '<div class="set-row"><span class="set-row-ic" data-ic="upload"></span>' +
          '<div class="set-row-txt"><b>Import settings</b><small>Restore preferences from a previously exported settings file.</small></div>' +
          '<button type="button" class="btn" id="setImportBtn">Import…</button></div>' +
      '</div>' +
      '</div>';
    sec.classList.add("has-content");
    sec.innerHTML = html;
    $$(".set-row-ic[data-ic]", sec).forEach(function (span) { span.appendChild(Studio.icon(span.getAttribute("data-ic"), 18)); });
    $$("input[data-set]", sec).forEach(function (cb) {
      var t = SETTINGS_TOGGLES.filter(function (x) { return x.id === cb.getAttribute("data-set"); })[0];
      if (t) cb.addEventListener("change", t.set);
    });
    var appThemeSel = $("#appThemeSel", sec);
    if (appThemeSel) appThemeSel.onchange = function () { setAppTheme(appThemeSel.value); toast(APP_THEME_LABELS[appThemeSel.value] + " theme applied"); };
    var defJndiInp = $("#setDefaultJndiInp", sec);
    if (defJndiInp) defJndiInp.addEventListener("change", function () { setDefaultJndi(defJndiInp.value); toast("Default JNDI connection saved"); });
    var defSubInp = $("#setDefaultSubtitleInp", sec);
    if (defSubInp) defSubInp.addEventListener("change", function () { setDefaultSubtitle(defSubInp.value); toast("Default subtitle saved"); });
    var defAccentCustom = $("#setDefaultAccentCustom", sec);
    if (defAccentCustom) defAccentCustom.oninput = function () { setDefaultAccentColor(defAccentCustom.value); renderSettings(); };
    $$("#setDefaultAccentRow .set-accent-swatch", sec).forEach(function (sw) {
      sw.onclick = function () { setDefaultAccentColor(sw.getAttribute("data-accent")); renderSettings(); toast("Default accent color saved"); };
    });
    var defLogoBtn = $("#setDefaultLogoBtn", sec), defLogoInp = $("#setDefaultLogoInp", sec), defLogoClear = $("#setDefaultLogoClearBtn", sec);
    if (defLogoBtn && defLogoInp) defLogoBtn.onclick = function () { defLogoInp.click(); };
    if (defLogoInp) defLogoInp.onchange = function () {
      var f = defLogoInp.files[0]; if (!f) return;
      if (f.size > BRAND_MAX_BYTES) { toast("Logo too large — please use an image under 200KB.", true); return; }
      var reader = new FileReader();
      reader.onload = function (e) { setDefaultLogo(e.target.result); renderSettings(); toast("Default header logo saved"); };
      reader.readAsDataURL(f);
    };
    if (defLogoClear) defLogoClear.onclick = function () { setDefaultLogo(""); renderSettings(); };
    var defHeaderBgCustom = $("#setDefaultHeaderBgCustom", sec), defHeaderBgClear = $("#setDefaultHeaderBgClearBtn", sec);
    if (defHeaderBgCustom) defHeaderBgCustom.oninput = function () { setDefaultHeaderBg(defHeaderBgCustom.value); };
    if (defHeaderBgCustom) defHeaderBgCustom.onchange = function () { renderSettings(); toast("Default header background color saved"); };
    if (defHeaderBgClear) defHeaderBgClear.onclick = function () { setDefaultHeaderBg(""); renderSettings(); };
    var defTitleSizeSel = $("#setDefaultTitleSizeSel", sec);
    if (defTitleSizeSel) defTitleSizeSel.onchange = function () { setDefaultTitleSize(defTitleSizeSel.value); toast("Default title size saved"); };
    var defSubtitleStyleSel = $("#setDefaultSubtitleStyleSel", sec);
    if (defSubtitleStyleSel) defSubtitleStyleSel.onchange = function () { setDefaultSubtitleStyle(defSubtitleStyleSel.value); toast("Default subtitle style saved"); };
    var defDashboardThemeSel = $("#setDefaultDashboardThemeSel", sec);
    if (defDashboardThemeSel) defDashboardThemeSel.onchange = function () { setDefaultDashboardTheme(defDashboardThemeSel.value); toast("Default dashboard theme saved"); };
    var defCardSkinSel = $("#setDefaultCardSkinSel", sec);
    if (defCardSkinSel) defCardSkinSel.onchange = function () { setDefaultCardSkin(defCardSkinSel.value); toast("Default card style saved"); };
    var spNameInp = $("#spNameInp", sec), spSaveBtn = $("#spSaveBtn", sec);
    if (spSaveBtn) spSaveBtn.onclick = function () {
      var name = (spNameInp.value || "").trim(); if (!name) { spNameInp.focus(); return; }
      addStylePreset(name); renderSettings(); toast("Saved preset “" + name + "”");
    };
    if (spNameInp) spNameInp.addEventListener("keydown", function (e) { if (e.key === "Enter") spSaveBtn.click(); });
    $$(".sp-apply", sec).forEach(function (b) {
      b.onclick = function () { applyStylePreset(b.getAttribute("data-id")); renderSettings(); toast("Preset applied as the active default"); };
    });
    $$(".sp-del", sec).forEach(function (b) {
      b.appendChild(Studio.icon("trash", 13));
      b.onclick = function () { deleteStylePreset(b.getAttribute("data-id")); renderSettings(); };
    });
    var deployPathInp = $("#setDeployPathInp", sec);
    if (deployPathInp) deployPathInp.addEventListener("change", function () { S.settings.deployPath = deployPathInp.value.trim(); setDeployPathPref(S.settings.deployPath); toast("Deploy path saved"); });
    var liveDataCb = $("#setLiveDataCb", sec);
    if (liveDataCb) liveDataCb.addEventListener("change", function () { S.settings.live = liveDataCb.checked; setLiveDataPref(S.settings.live); syncLiveButton(); });
    var expBtn = $("#setExportBtn", sec); if (expBtn) expBtn.onclick = exportSettingsFile;
    var impBtn = $("#setImportBtn", sec); if (impBtn) impBtn.onclick = importSettingsFile;
    var brandSel = $("#brandModeSel", sec);
    if (brandSel) brandSel.onchange = function () {
      var mode = brandSel.value;
      if (mode === "custom" && !getBranding().dataUrl) { var fi = $("#brandFileInp", sec); if (fi) { fi.click(); return; } }
      setBranding({ mode: mode, dataUrl: mode === "custom" ? getBranding().dataUrl : undefined });
      renderSettings();
    };
    var brandUploadBtn = $("#brandUploadBtn", sec);
    var brandFileInp = $("#brandFileInp", sec);
    if (brandUploadBtn && brandFileInp) brandUploadBtn.onclick = function () { brandFileInp.click(); };
    if (brandFileInp) brandFileInp.onchange = function () {
      var f = brandFileInp.files[0]; if (!f) return;
      if (f.size > BRAND_MAX_BYTES) { toast("Logo too large — please use an image under 200KB.", true); return; }
      var reader = new FileReader();
      reader.onload = function (e) { setBranding({ mode: "custom", dataUrl: e.target.result }); renderSettings(); toast("Logo updated."); };
      reader.readAsDataURL(f);
    };
    syncRailQuick();
  }
  window.__studioRenderSettings = renderSettings; // test hook

  // Keeps the mobile-drawer "quick settings" checkboxes (#railQuick) in sync with the real
  // state after every mutation path that already calls renderSettings() (Settings page itself,
  // ⋯ More menu, keyboard shortcuts, and the quick-settings checkboxes' own change handler).
  function syncRailQuick() {
    var d = document.getElementById("railQuickDark"); if (d) d.checked = S.theme === "dark";
    var sm = document.getElementById("railQuickSimple"); if (sm) sm.checked = !!S.simpleMode;
  }
  window.__studioSyncRailQuick = syncRailQuick; // test hook

  function maybeShowRestoreBanner() {
    var raw; try { raw = localStorage.getItem("studio-autosave"); } catch (e) { return; }
    if (!raw) return;
    var saved; try { saved = JSON.parse(raw); } catch (e) { clearAutosave(); return; }
    if (!saved || !saved.name) return;
    var rPanels = (saved.panels || []).length, rKpis = (saved.kpis || []).length, rFilters = (saved.filters || []).length;
    var rParts = [];
    if (rPanels) rParts.push(rPanels + " panel" + (rPanels === 1 ? "" : "s"));
    if (rKpis) rParts.push(rKpis + " KPI" + (rKpis === 1 ? "" : "s"));
    if (rFilters) rParts.push(rFilters + " filter" + (rFilters === 1 ? "" : "s"));
    var rSumHtml = rParts.length ? ' <span class="rb-sum">(' + esc(rParts.join(" · ")) + ')</span>' : "";
    var banner = el("div", "restore-banner");
    var msg = el("span", "rb-msg"); msg.innerHTML = 'Restore unsaved work on <strong>' + esc(saved.title || saved.name) + '</strong>?' + rSumHtml;
    var acts = el("div", "rb-acts");
    var yes = el("button", "btn btn-primary"); yes.textContent = "Restore"; acts.appendChild(yes);
    // M11: "No thanks" is clearer than "Dismiss" on mobile where the intent needs to be unambiguous.
    var no = el("button", "btn"); no.textContent = "No thanks"; acts.appendChild(no);
    banner.appendChild(msg); banner.appendChild(acts);
    document.body.appendChild(banner);
    yes.onclick = function () { S.spec = normalize(saved); S.selection = null; syncHeader(); renderInspector(); refreshPreview(); buildLibrary(); clearAutosave(); banner.remove(); toast("Restored: " + (saved.title || saved.name)); };
    no.onclick = function () { clearAutosave(); banner.remove(); };
  }
  function applyHistory(json) {
    S.spec = JSON.parse(json); _lastSnap = json;
    if (S.selection && S.selection.kind === "panel" && !panelById(S.selection.id)) S.selection = null;
    if (S.selection && S.selection.kind === "kpi" && S.selection.index >= S.spec.kpis.length) S.selection = null;
    if (S.selection && S.selection.kind === "filter" && S.selection.index >= S.spec.filters.length) S.selection = null;
    if (S.selection && S.selection.kind === "da" && !Studio.daById(S.spec, S.selection.id)) S.selection = null;
    syncHeader(); renderInspector(); refreshPreview(); buildLibrary(); updateHistButtons();
  }
  function undoAct() { if (!_undo.length) return; _redo.push(_lastSnap); applyHistory(_undo.pop()); toast("Undo"); }
  function redoAct() { if (!_redo.length) return; _undo.push(_lastSnap); applyHistory(_redo.pop()); toast("Redo"); }
  function updateHistButtons() { var u = $("#btnUndo"), r = $("#btnRedo"); if (u) u.disabled = !_undo.length; if (r) r.disabled = !_redo.length; }
  window.__studioUndo = undoAct; window.__studioRedo = redoAct;   // exposed for tests
  function postToPreview(msg) { try { $("#preview").contentWindow.postMessage(Object.assign({ studio: 1 }, msg), "*"); } catch (e) {} }
  function setTheme(t) {
    S.theme = t; document.documentElement.setAttribute("data-theme", t);
    var b = $("#btnTheme"); if (b) setIconBtn(b, t === "dark" ? "sun" : "moon", t === "dark" ? "Light" : "Dark");
    try { localStorage.setItem("studio-theme", t); } catch (e) {}
    postToPreview({ type: "theme", value: t });
    renderHome();
    renderSettings();
  }
  /* Z10: app COLOR theme — orthogonal to the light/dark MODE toggle above. "classic" is
     the original Pentaho blue chrome (default, unchanged); "polecat" recolors the builder
     to the same warm plum/terracotta/cream palette #railNav already uses, so the whole app
     reads as one coherent identity instead of two clashing palettes. "modern" (Visual
     refresh (A) follow-up) recolors the builder with the same jobtracker.polecat.live
     tokens already used for the Fleet Modern DASHBOARD theme (Studio.DASHBOARD_THEMES),
     so picking Fleet Modern on both sides reads as one system. Exported dashboards are
     deliberately untouched by this app-chrome setting — this only sets a data attribute the
     studio.css variables key off of; pdc-ui.css (the export/preview toolkit) never reads it. */
  function appTheme() { return S.appTheme || "classic"; }
  var APP_THEME_KEYS = ["classic", "polecat", "modern"];
  function setAppTheme(t) {
    t = APP_THEME_KEYS.indexOf(t) >= 0 ? t : "classic";
    S.appTheme = t; document.documentElement.setAttribute("data-app-theme", t);
    try { localStorage.setItem("studio-app-theme", t); } catch (e) {}
  }
  window.__studioAppTheme = { get: appTheme, set: setAppTheme }; // test hook
  function highlightPreview() {
    if (!S.selection) { postToPreview({ type: "highlight" }); return; }
    if (S.selection.kind === "kpi") postToPreview({ type: "highlight", kind: "kpi", index: S.selection.index });
    else postToPreview({ type: "highlight", id: S.selection.id });
  }
  window.addEventListener("message", function (e) {
    var d = e.data || {}; if (d.studio !== 1) return;
    if (d.type === "select") {
      if (d.kind === "kpi") select({ kind: "kpi", index: d.index });
      else select({ kind: "panel", id: d.id });
    } else if (d.type === "reorder") {
      reorderPanels(d.order);
    } else if (d.type === "resize") {
      var p = panelById(d.id); if (p) { p.span = d.span; if (S.selection && S.selection.kind === "panel" && S.selection.id === d.id) renderInspector(); else renderListsOnly(); refreshPreview(); toast("Resized → span " + d.span); }
    } else if (d.type === "rename") {
      var rp = panelById(d.id); if (rp) { rp.title = d.title; if (S.selection && S.selection.kind === "panel" && S.selection.id === d.id) renderInspector(); refreshPreview(); toast("Renamed → " + d.title); }
    } else if (d.type === "kpi-delete") {
      if (S.spec.kpis[d.index]) { S.spec.kpis.splice(d.index, 1); selectDashboard(); refreshPreview(); toast("KPI removed"); }
    } else if (d.type === "panel-dup") {
      duplicatePanel(d.id);
    } else if (d.type === "panel-delete") {
      deletePanel(d.id);
    } else if (d.type === "zoom") {
      openPanelZoom(d.panelId);
    }
  });
  function panelIndex(id) { var i = -1; S.spec.panels.forEach(function (p, ix) { if (p.id === id) i = ix; }); return i; }
  function duplicatePanel(id) {
    var i = panelIndex(id); if (i < 0) return;
    var dup = Studio.clone(S.spec.panels[i]); dup.id = Studio.uid("p"); dup.title = (dup.title || "Panel") + " copy";
    S.spec.panels.splice(i + 1, 0, dup); select({ kind: "panel", id: dup.id }); refreshPreview(); toast("Panel duplicated");
  }
  function deletePanel(id) {
    var i = panelIndex(id); if (i < 0) return;
    S.spec.panels.splice(i, 1); selectDashboard(); refreshPreview(); toast("Panel removed");
  }
  // N-DIST: embeddable single-chart widget — reuses the full CDF exporter on a spec pared
  // down to just this one panel, so it stays byte-for-byte the same self-contained toolkit as
  // any other export (no separate embed-only code path to drift out of sync).
  function exportPanelEmbed(p) {
    var single = Studio.clone(S.spec);
    single.panels = [Studio.clone(p)];
    single.kpis = []; single.filters = [];
    single.title = p.title || S.spec.title; single.description = "";
    var stem = (p.title || "panel").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "panel";
    single.name = stem;
    celebrateFirstExport();
    bumpExportMilestone();
    bundleModal("Embed panel", [{ name: stem + "-embed.html", body: Studio.exportCDF(single, S.assets, S.settings.deployPath), mime: "text/html" }]);
  }
  // N-DIST: client-side PNG export of a chart — first cut of "Client-side PNG/PDF export of a whole
  // dashboard" (the SVG-chart half; legend/title/table chart types are a separate follow-up).
  // Grabs the panel's LIVE, already-rendered <svg> straight out of the #preview iframe (WYSIWYG —
  // whatever's on screen right now, no separate re-render pass), inlines every descendant's
  // *computed* style (fill/stroke/font/etc.) onto a clone so the exported image is self-contained,
  // then rasterizes via a classic SVG-blob → Image → canvas round-trip. Deliberately SVG-only, not a
  // generic DOM screenshot: the naive "clone the whole HTML card into an SVG <foreignObject>, then
  // draw that to canvas" approach taints the canvas in Chromium (SecurityError on toDataURL) the
  // moment real HTML is involved, so only the pure-SVG chart itself is exportable this way.
  var SVG_STYLE_PROPS = ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap",
    "stroke-linejoin", "stroke-opacity", "fill-opacity", "opacity", "font-family", "font-size",
    "font-weight", "font-style", "text-anchor", "dominant-baseline", "letter-spacing"];
  function inlineSvgComputedStyle(srcEl, destEl, win) {
    var cs = win.getComputedStyle(srcEl), css = "";
    SVG_STYLE_PROPS.forEach(function (k) { var v = cs.getPropertyValue(k); if (v) css += k + ":" + v + ";"; });
    if (css) destEl.setAttribute("style", css);
    for (var i = 0; i < srcEl.children.length; i++) inlineSvgComputedStyle(srcEl.children[i], destEl.children[i], win);
  }
  // `onDataUrl` is test-only (Playwright drives the canvas/rasterization path directly since a
  // real click/download isn't observable headlessly); the real UI click path never passes it.
  function exportPanelPng(p, onDataUrl) {
    var ifr = $("#preview"), doc = ifr && ifr.contentDocument;
    var card = doc && doc.querySelector('[data-panel-id="' + p.id + '"]');
    var svg = card && card.querySelector(".body svg");
    if (!svg) { toast("This chart type doesn't support PNG export yet"); if (onDataUrl) onDataUrl(null); return; }
    var win = ifr.contentWindow;
    var rect = svg.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
    var clone = svg.cloneNode(true);
    inlineSvgComputedStyle(svg, clone, win);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", w); clone.setAttribute("height", h);
    var bg = win.getComputedStyle(card.querySelector(".body") || card).backgroundColor;
    var xml = new XMLSerializer().serializeToString(clone);
    var blobUrl = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
    var img = new Image();
    img.onload = function () {
      var scale = 2; // export at 2x for a crisp, slide/doc-ready image
      var canvas = document.createElement("canvas");
      canvas.width = w * scale; canvas.height = h * scale;
      var ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      if (bg && bg !== "rgba(0, 0, 0, 0)") { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(blobUrl);
      var dataUrl = canvas.toDataURL("image/png");
      if (onDataUrl) { onDataUrl(dataUrl); return; }
      var stem = (p.title || "chart").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "chart";
      var a = document.createElement("a");
      a.download = stem + ".png"; a.href = dataUrl;
      document.body.appendChild(a); a.click(); a.remove();
      celebrateFirstExport(); bumpExportMilestone();
    };
    img.onerror = function () { URL.revokeObjectURL(blobUrl); toast("Couldn't render this chart to PNG"); if (onDataUrl) onDataUrl(null); };
    img.src = blobUrl;
  }
  // Test hook — exercised by Playwright suite.
  window.__exportPanelPngDataUrl = function (panelId, cb) {
    var p = panelById(panelId); if (!p) { cb(null); return; }
    exportPanelPng(p, cb);
  };
  function duplicateKpi(i) {
    var k = S.spec.kpis[i]; if (!k) return;
    var dup = Studio.clone(k); dup.label = (dup.label || "Metric") + " copy";
    S.spec.kpis.splice(i + 1, 0, dup); select({ kind: "kpi", index: i + 1 }); refreshPreview(); toast("KPI duplicated");
  }
  function reorderPanels(order) {
    var byId = {}; S.spec.panels.forEach(function (p) { byId[p.id] = p; });
    var np = order.map(function (id) { return byId[id]; }).filter(Boolean);
    S.spec.panels.forEach(function (p) { if (np.indexOf(p) < 0) np.push(p); });   // safety: keep any not listed
    S.spec.panels = np; renderInspector(); refreshPreview();
  }

  /* ---------- panel zoom — full-screen single-panel viewer (H-track) ----------
   * Click the ↗ button on any canvas panel to open it maximized in a full-screen
   * overlay. Ideal for SE demos: zoom into a specific insight without leaving the
   * builder. The panel is re-rendered standalone at full resolution via buildHtml
   * with a filtered one-panel spec. Escape or the × pill closes the overlay.
   * ----------------------------------------------------------------------- */
  var _pzOverlay = null;
  function openPanelZoom(panelId) {
    var p = panelById(panelId); if (!p) return;
    // Build a single-panel spec (no KPIs, no filters, panel at full width)
    var zp = Studio.clone(p); zp.span = 12;
    var zSpec = Studio.clone(S.spec);
    zSpec.panels = [zp]; zSpec.kpis = []; zSpec.filters = [];
    var mockData = Studio.genMock(zSpec);
    var html = Studio.buildHtml(zSpec, S.assets, { deployPath: S.settings.deployPath, preview: true, mock: mockData, launcher: false });

    // Overlay
    var ov = document.createElement("div"); ov.className = "pz-overlay"; ov.id = "pzOverlay";
    var ifr = document.createElement("iframe"); ifr.className = "pz-frame"; ifr.title = "Panel zoom: " + (p.title || "Panel");
    var closeBtn = document.createElement("button"); closeBtn.className = "pz-close"; closeBtn.setAttribute("aria-label", "Exit zoom (Esc)");
    closeBtn.appendChild(Studio.icon("close", 14)); closeBtn.appendChild(document.createTextNode(" Exit zoom"));
    ov.appendChild(ifr); ov.appendChild(closeBtn); document.body.appendChild(ov);
    _pzOverlay = ov;
    window.__panelZoomActive = true;

    ifr.onload = function () {
      try { ifr.contentWindow.postMessage({ studio: 1, type: "theme", value: S.theme }, "*"); } catch (e) {}
    };
    ifr.srcdoc = html;

    function close() {
      if (!_pzOverlay) return;
      _pzOverlay.remove(); _pzOverlay = null; window.__panelZoomActive = false;
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(); } }
    closeBtn.onclick = close;
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", onKey);
  }
  // Test hooks — exercised by Playwright suite
  window.__panelZoomOpen = openPanelZoom;
  window.__panelZoomActive = false;

  /* ---------- Slideshow mode (H-track) ----------------------------------------
   * Presents each panel in the current dashboard as a full-screen slide,
   * navigated with ← / → arrow keys or Prev / Next buttons. Ideal for SE demos:
   * walk stakeholders through each chart one at a time without leaving the builder.
   * Reuses buildHtml (same pipeline as Panel zoom) so charts render pixel-perfectly.
   * ----------------------------------------------------------------------- */
  var _ssOverlay = null, _ssIdx = 0, _ssPanels = [];

  function openSlideshow() {
    _ssPanels = (S.spec && S.spec.panels) || [];
    if (!_ssPanels.length) { toast("No panels to show"); return; }
    _ssIdx = 0;

    // Outer overlay (fullscreen dark background)
    var ov = document.createElement("div");
    ov.className = "ss-overlay"; ov.id = "ssOverlay";

    // Header bar: Prev · panel title + counter · Next · Close
    var hdr = document.createElement("div"); hdr.className = "ss-hdr";
    var prevBtn = document.createElement("button"); prevBtn.className = "ss-nav ss-prev"; prevBtn.setAttribute("aria-label", "Previous panel (← key)"); prevBtn.textContent = "◀";
    var titleEl = document.createElement("span"); titleEl.className = "ss-title";
    var counter = document.createElement("span"); counter.className = "ss-counter";
    var nextBtn = document.createElement("button"); nextBtn.className = "ss-nav ss-next"; nextBtn.setAttribute("aria-label", "Next panel (→ key)"); nextBtn.textContent = "▶";
    var closeBtn = document.createElement("button"); closeBtn.className = "ss-close"; closeBtn.setAttribute("aria-label", "Exit slideshow (Esc)");
    closeBtn.appendChild(Studio.icon("close", 13)); closeBtn.appendChild(document.createTextNode(" Exit slideshow"));
    hdr.appendChild(prevBtn); hdr.appendChild(titleEl); hdr.appendChild(counter); hdr.appendChild(nextBtn); hdr.appendChild(closeBtn);

    var ifr = document.createElement("iframe"); ifr.className = "ss-frame"; ifr.title = "Slideshow";
    // N-FUN: story-mode caption bar — only shown for slides whose panel has a Slide
    // caption set; a plain narrative strip pinned above the Exit/nav footer area.
    var capEl = document.createElement("div"); capEl.className = "ss-caption"; capEl.id = "ssCaption";
    ov.appendChild(hdr); ov.appendChild(ifr); ov.appendChild(capEl); document.body.appendChild(ov);
    _ssOverlay = ov;
    window.__slideshowActive = true;

    function close() {
      if (!_ssOverlay) return;
      _ssOverlay.remove(); _ssOverlay = null;
      window.__slideshowActive = false;
      document.removeEventListener("keydown", onKey);
    }

    function showSlide(idx) {
      var p = _ssPanels[idx]; if (!p) return;
      _ssIdx = idx;
      titleEl.textContent = p.title || ("Panel " + (idx + 1));
      counter.textContent = (idx + 1) + " / " + _ssPanels.length;
      prevBtn.disabled = (idx === 0);
      nextBtn.disabled = (idx === _ssPanels.length - 1);
      if (p.slideCaption) { capEl.textContent = p.slideCaption; capEl.classList.add("show"); }
      else { capEl.textContent = ""; capEl.classList.remove("show"); }
      // Slide emphasis: replay the zoom+glow entrance every time this slide is (re)shown,
      // not just the first time — remove then force reflow before re-adding the class.
      ifr.classList.remove("ss-zoom"); void ifr.offsetWidth;
      if (p.slideZoom) {
        // Pan: anchor the zoom's transform-origin at the panel's chosen focus point (default
        // dead center) so the entrance pushes IN toward a specific region, not just the whole panel.
        var fx = p.slideFocusX != null ? p.slideFocusX : 50, fy = p.slideFocusY != null ? p.slideFocusY : 50;
        ifr.style.transformOrigin = fx + "% " + fy + "%";
        ifr.classList.add("ss-zoom");
      } else {
        ifr.style.transformOrigin = "";
      }
      // Build a single-panel spec (full-width, no KPIs/filters) via the same
      // pipeline as Panel zoom and the CDF exporter — charts render identically.
      var zp = Studio.clone(p); zp.span = 12;
      var zSpec = Studio.clone(S.spec);
      zSpec.panels = [zp]; zSpec.kpis = []; zSpec.filters = [];
      var mockData = Studio.genMock(zSpec);
      var html = Studio.buildHtml(zSpec, S.assets,
        { deployPath: S.settings.deployPath, preview: true, mock: mockData, launcher: false });
      ifr.onload = function () {
        try { ifr.contentWindow.postMessage({ studio: 1, type: "theme", value: S.theme }, "*"); } catch (e) {}
      };
      ifr.srcdoc = html;
    }

    function onKey(e) {
      if (e.key === "Escape")    { e.stopPropagation(); close(); }
      if (e.key === "ArrowRight" || e.key === "ArrowDown")  { if (_ssIdx < _ssPanels.length - 1) showSlide(_ssIdx + 1); }
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp")    { if (_ssIdx > 0)                    showSlide(_ssIdx - 1); }
    }
    prevBtn.onclick  = function () { if (_ssIdx > 0) showSlide(_ssIdx - 1); };
    nextBtn.onclick  = function () { if (_ssIdx < _ssPanels.length - 1) showSlide(_ssIdx + 1); };
    closeBtn.onclick = close;
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", onKey);
    showSlide(0);
    // Focus the close button so keyboard events land in the parent document, not the iframe
    closeBtn.focus();
  }

  // Test hooks
  window.__slideshowOpen   = openSlideshow;
  window.__slideshowActive = false;
  window.__slideshowPanel  = function () { return _ssIdx; };

  /* ---------- examples / open / save ---------- */
  // build a starter dashboard from a catalog query set (instant, editable)
  function chartForDA(da) {
    var cols = da.columns || [];
    var id = (da.id || "").toLowerCase();

    // K4: in Simple mode, use richer column-type heuristics so beginners get sensible defaults
    if (S.simpleMode) {
      if (!cols.length) return null;
      // Single column with a numeric-looking name → gauge (ideal for headline KPI tiles)
      if (cols.length === 1) {
        return /value|total|count|sum|avg|amount|revenue|cost|rate|pct|score|qty|num|metric|kpi/.test(cols[0].toLowerCase()) ? "gauge" : null;
      }
      // Time-series column present → line (existing logic, preserved in simple mode too)
      if (cols.some(function (c) { return /month|^ym$|ymn|date|day|period/.test(c.toLowerCase()); })) return "line";
      // Multiple numeric-looking columns (e.g. revenue + cost + margin) → line for comparison
      var numCols = cols.filter(function (c) { return /value|total|count|sum|avg|amount|revenue|cost|rate|pct|score|qty|num|metric/.test(c.toLowerCase()); });
      if (numCols.length >= 2) return "line";
      // DA id hints composition → donut; default → bars
      if (/mix|share|donut|split|sens|status|coverage|ratio/.test(id)) return "donut";
      return "bars";
    }

    // Advanced mode: preserve the original behaviour exactly
    if (cols.length < 2) return null;
    if (cols.some(function (c) { return /month|^ym$|ymn|date|day|period/.test(c.toLowerCase()); })) return "line";
    if (/mix|share|donut|split|sens|status|coverage|ratio/.test(id)) return "donut";
    return "bars";
  }
  // Test hook — lets the Playwright suite call chartForDA() directly via the page context
  window.__chartForDA = chartForDA;
  function guessGroup(t) {
    t = (t || "").toLowerCase();
    if (/cost|storage|capacity|redundan/.test(t)) return "Storage & Cost";
    if (/govern|complian|privacy|sensitiv|policy/.test(t)) return "Governance & Privacy";
    if (/applicat|owner|glossar|adoption|steward/.test(t)) return "Usage & People";
    if (/integrat|movement|lineage|schema/.test(t)) return "Data Integration";
    if (/exec|scorecard|command/.test(t)) return "Executive";
    return "Observability";
  }
  function scaffoldFromStem(stem) {
    var e = S.catalog[stem]; if (!e) return;
    var sp = Studio.emptySpec();
    sp.name = stem.toLowerCase().replace(/[^a-z0-9-]+/g, "-"); sp.title = Studio.titleize(stem); sp.group = guessGroup(sp.title);
    sp.cda.connection = Studio.clone(e.connection); sp.gridCols = 3;
    (e.dataAccesses || []).forEach(function (da) {
      if (/^kpi/i.test(da.id) && (da.columns || []).length) {
        Studio.ensureDA(sp, da);
        da.columns.slice(0, 4).forEach(function (col) { sp.kpis.push({ da: da.id, valueCol: col, label: Studio.titleize(col), fmt: Studio.guessFmt(col), state: "", info: "" }); });
        return;
      }
      var t = chartForDA(da); if (!t) return;
      Studio.ensureDA(sp, da);
      var p = Studio.newPanel(t, da);
      if (p.chart.opts && "fmt" in p.chart.opts) p.chart.opts.fmt = Studio.guessFmt(p.chart.map.valueCol || (p.chart.map.series && p.chart.map.series[0] && p.chart.map.series[0].col));
      sp.panels.push(p);
    });
    if (!sp.panels.length && !sp.kpis.length) { toast("No chartable queries in " + stem, true); return; }
    S.spec = sp; S.selection = null; syncHeader(); renderInspector(); refreshPreview();
    toast("Scaffolded " + sp.panels.length + " panels from " + stem);
  }

  function loadExample(file, keepAutosave) {
    fetchJSON("data/examples/" + file).then(function (spec) {
      S.spec = normalize(spec); S.selection = null;
      if (!keepAutosave) clearAutosave();
      syncHeader(); renderInspector(); refreshPreview(); buildLibrary();
      if (!keepAutosave) toast("Loaded " + (S.spec.title || S.spec.name));
    }).catch(function (e) { toast("Could not load example: " + e.message, true); });
  }
  function normalize(spec) {
    var base = Studio.emptySpec();
    // NOTE: this whitelist previously omitted themeColor/paletteKey (shipped in v103/v123) — every
    // Open / restore-banner / example-load / drag-drop-file silently reset a saved dashboard's accent
    // color and series palette back to the default. Keep this list in sync with Studio.emptySpec()'s
    // top-level scalar/optional fields whenever a new one is added (see also headerLogo, Z6).
    ["schema", "id", "name", "title", "subtitle", "group", "description", "themeColor", "dashboardTheme", "paletteKey", "headerLogo", "headerLink", "headerBg", "titleSize", "subtitleStyle", "cardSkin", "templateVars"].forEach(function (k) { if (spec[k] != null) base[k] = spec[k]; });
    base.cda = spec.cda || base.cda;
    base.filters = spec.filters || []; base.kpis = spec.kpis || [];
    base.gridCols = spec.gridCols || 3; base.panels = (spec.panels || []).map(function (p) { if (!p.id) p.id = Studio.uid("p"); return p; });
    if (!base.id) base.id = Studio.uid("dash");
    return base;
  }

  function showShortcuts() {
    modal("Keyboard shortcuts", function (b) {
      var rows = [
        ["Ctrl / ⌘  +  K", "Open the command palette"],
        ["Ctrl / ⌘  +  Z", "Undo"],
        ["Ctrl / ⌘  +  Shift+Z", "Redo"],
        ["Ctrl / ⌘  +  D", "Duplicate selected panel or KPI"],
        ["Ctrl / ⌘  +  S", "Save spec as .studio.json"],
        ["Ctrl / ⌘  +  F", "Focus library search (filter queries)"],
        ["/", "Focus chart-type gallery search (panel selected)"],
        ["↑ / ↓   (panel selected)", "Reorder panel up / down"],
        ["Shift + ← / →   (panel selected)", "Decrease / increase panel span"],
        ["Delete / Backspace   (panel selected)", "Delete selected panel or KPI"],
        ["Escape   (panel selected)", "Deselect — return to dashboard inspector"],
        ["Escape   (Focus mode)", "Exit Focus mode — return to builder"],
        ["↗ button on panel", "Zoom panel to full screen (Escape to close)"],
        ["?", "Show this keyboard shortcuts panel"],
        ["Escape", "Close modal or dropdown menu"],
        ["Tab", "Navigate interactive controls"],
        ["Double-click panel title", "Rename panel inline"]
      ];
      var tbl = el("table"); tbl.style.cssText = "border-collapse:collapse;width:100%;font-size:13px";
      rows.forEach(function (r) {
        var tr = el("tr"); tr.style.cssText = "border-bottom:1px solid var(--line)";
        var k = el("td"); k.style.cssText = "padding:9px 16px 9px 0;white-space:nowrap;vertical-align:middle";
        var kbd = el("kbd"); kbd.className = "skbd"; kbd.textContent = r[0]; k.appendChild(kbd); tr.appendChild(k);
        var v = el("td"); v.style.cssText = "padding:9px 0;color:var(--muted);vertical-align:middle"; v.textContent = r[1]; tr.appendChild(v);
        tbl.appendChild(tr);
      });
      var wrap = el("div"); wrap.style.cssText = "padding:8px 4px"; wrap.appendChild(tbl);
      b.appendChild(wrap);
    });
  }

  // H-track v71 — Focus / Presentation mode: expand preview to fill window for demos
  var _focusExitPill = null;
  function enterFocusMode() {
    document.body.classList.add("focus-mode");
    if (!_focusExitPill) {
      _focusExitPill = el("button", "focus-exit");
      _focusExitPill.title = "Exit Focus mode (Escape)";
      _focusExitPill.appendChild(Studio.icon("close", 13));
      _focusExitPill.appendChild(document.createTextNode(" Exit Focus"));
      _focusExitPill.onclick = exitFocusMode;
      document.body.appendChild(_focusExitPill);
    } else {
      _focusExitPill.style.display = "";
    }
    renderSettings();
  }
  /* genMockLive — like Studio.genMock but varies numeric values by ±8% each tick
     so the preview looks like live, refreshing data during SE demos. Deterministic
     per tick (no Math.random) — uses position arithmetic to produce distinct deltas. */
  function genMockLive(spec, tick) {
    var out = {};
    (spec.cda.dataAccesses || []).forEach(function (da) {
      var base = Studio.sampleRows(da);
      var rows = base.rows.map(function (row, ri) {
        return row.map(function (val, ci) {
          if (typeof val !== "number") return val;
          // Seed variation from tick + row + col position; range ±8%
          var seed = ((tick * 7 + ri * 3 + ci * 11) % 97) / 97; // 0..0.99
          var factor = 1 + (seed - 0.5) * 0.16;
          return Math.max(0, Math.round(val * factor));
        });
      });
      var result = { cols: base.cols, rows: rows };
      out[da.id] = Studio.applyOutputOptions ? Studio.applyOutputOptions(da, result) : result;
    });
    return out;
  }

  /* toggleDemoMode — start/stop the 4-second live-data simulation for SE demos.
     When active, a pulsing "● LIVE" badge appears and the preview re-renders with
     slightly varied numeric values each tick so it looks like a live data feed. */
  function toggleDemoMode() {
    S.demoMode = !S.demoMode;
    window.__demoMode = S.demoMode;
    document.body.classList.toggle("demo-mode", S.demoMode);
    if (S.demoMode) {
      _demoTick = 0;
      refreshPreview();
      _demoInterval = setInterval(function () {
        _demoTick++;
        refreshPreview();
      }, 4000);
      toast("Demo mode on — data refreshes every 4 s");
    } else {
      clearInterval(_demoInterval);
      _demoInterval = null;
      refreshPreview();
      toast("Demo mode off");
    }
    var btn = $("#moreDemoMode");
    if (btn) btn.textContent = S.demoMode ? "Demo mode  ■" : "Demo mode  ▶";
    renderSettings();
  }

  function exitFocusMode() {
    document.body.classList.remove("focus-mode");
    if (_focusExitPill) _focusExitPill.style.display = "none";
    renderSettings();
  }

  // E8 — the full list of localStorage keys "Clear local data" wipes. Hoisted to a module-level
  // constant (was previously rebuilt inline inside the click handler every time) so it can be
  // exposed as a test hook and asserted against directly — every new key introduced elsewhere in
  // the file should be added here too; see the v194/v235/v281 notes below for the recurring "new
  // key, forgot Clear local data" gap this guards against.
  var CLEAR_DATA_KEYS = [
    "studio-autosave", "studio-export-history", "studio-theme", "studio-app-theme",
    "studio-lw", "studio-rw", "studio-collapse-library", "studio-collapse-inspector",
    "studio-connections", "studio-active-conn", "studio-mob-tab", "studio-simple-mode",
    "studio-insp-collapsed", "studio-recents", "studio-pins", "studio-workbooks", "studio-branding", "studio-versions",
    "studio-shell-section", "studio-shell-expanded",
    "studio-default-jndi", "studio-default-subtitle", "studio-default-accent", "studio-default-logo", "studio-default-headerbg",
    // N-DESIGN follow-up: studio-default-dashboardtheme (v281) and studio-default-cardskin were/are
    // new Settings-default keys — folded straight into this list from the start this time, since
    // studio-default-dashboardtheme itself was found missing here while adding cardSkin (same "new
    // Settings key, forgot Clear local data" gap the v194/v235 notes describe).
    "studio-default-titlesize", "studio-default-subtitlestyle", "studio-default-dashboardtheme", "studio-default-cardskin", "studio-style-presets",
    "studio-cmdk-usage", "studio-first-export-done", "studio-export-count", "studio-dash-count",
    "studio-deploy-path", "studio-live-data", "studio-templatevar-sets", "studio-da-freshness",
    "studio-canvas-notes",
    // Track L sweep (dead/orphaned-key lens): "studio-k8-dismissed" (the Simple-mode "What's
    // next?" onboarding card's dismissal flag) was written on dismiss but never wiped here — the
    // exact "new key, forgot Clear local data" gap the v194/v235/v281 notes above already
    // describe, just for a dismissal flag rather than a Settings default this time.
    "studio-k8-dismissed"
  ];
  window.__studioClearDataKeys = CLEAR_DATA_KEYS; // test hook

  function wireTopbar() {
    // Z6 naming model: the topbar title is now a jump-to-inspector button, not an inline
    // editor — renaming happens in one place (the Dashboard inspector's Title field), so
    // "what is this dashboard called" and "how do I rename it" aren't split across two UIs.
    $("#dashTitle").addEventListener("click", function () {
      selectDashboard();
      collapsePane("inspector", false);
      if (window.__studioMobTab) window.__studioMobTab("inspector");
      setTimeout(function () { var f = $("#dashTitleField"); if (f) { f.focus(); f.select(); } }, 60);
    });
    var uBtn = $("#btnUndo"); uBtn.onclick = undoAct; uBtn.textContent = ""; uBtn.appendChild(Studio.icon("undo", 16));
    var rBtn = $("#btnRedo"); rBtn.onclick = redoAct; rBtn.textContent = ""; rBtn.appendChild(Studio.icon("redo", 16));
    setIconBtn($("#btnAbout"), "info", "Tour");
    setIconBtn($("#btnLive"), "refresh", "Sample");
    document.addEventListener("keydown", function (e) {
      if (!(e.metaKey || e.ctrlKey)) return;
      var inEdit = /^(input|textarea|select)$/i.test(e.target.tagName || "") || e.target.isContentEditable;
      if (inEdit) return;
      var k = (e.key || "").toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undoAct(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redoAct(); }
      else if (k === "d") { if (S.selection && S.selection.kind === "panel") { e.preventDefault(); duplicatePanel(S.selection.id); } else if (S.selection && S.selection.kind === "kpi") { e.preventDefault(); duplicateKpi(S.selection.index); } }
      else if (k === "s") { e.preventDefault(); download(S.spec.name + ".studio.json", JSON.stringify(S.spec, null, 2), "application/json"); }
    });
    // arrow-key reorder/resize for the selected panel (when the builder has focus)
    document.addEventListener("keydown", function (e) {
      if (!S.selection || S.selection.kind !== "panel" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(input|textarea|select)$/i.test(e.target.tagName || "") || e.target.isContentEditable) return;
      if ((e.key || "").indexOf("Arrow") !== 0) return;
      var i = -1; S.spec.panels.forEach(function (p, ix) { if (p.id === S.selection.id) i = ix; });
      if (i < 0) return;
      e.preventDefault();
      if (e.shiftKey) {
        var seq = []; for (var n = 1; n < (S.spec.gridCols || 3); n++) seq.push(n); seq.push("full");
        var idx = seq.indexOf(S.spec.panels[i].span); if (idx < 0) idx = 0;
        if (e.key === "ArrowRight") idx = Math.min(seq.length - 1, idx + 1);
        else if (e.key === "ArrowLeft") idx = Math.max(0, idx - 1); else return;
        S.spec.panels[i].span = seq[idx]; renderInspector(); refreshPreview();
      } else {
        var j = (e.key === "ArrowUp" || e.key === "ArrowLeft") ? i - 1 : i + 1;
        if (j !== i) swap(S.spec.panels, i, j);
      }
    });
    $("#btnTheme").onclick = function () { setTheme(S.theme === "dark" ? "light" : "dark"); };
    // Z5 follow-up: "quick settings" mirror in the mobile nav drawer (relay.polecat.live-style) —
    // the two most-reached-for toggles (Dark mode, Simple mode) one tap away without leaving the
    // drawer for a full trip to Settings. Reuses SETTINGS_TOGGLES as the single source of truth
    // (same data-set id convention Settings' own checkboxes use) so both stay in sync for free.
    $$("#railQuick input[data-set]").forEach(function (cb) {
      var t = SETTINGS_TOGGLES.filter(function (x) { return x.id === cb.getAttribute("data-set"); })[0];
      if (t) cb.addEventListener("change", t.set);
    });
    $("#libSearch").addEventListener("input", buildLibrary);
    var repoSearchInp = $("#repoSearch"); if (repoSearchInp) repoSearchInp.addEventListener("input", renderRepository);
    var repoExpBtn = $("#repoExportBtn"); if (repoExpBtn) repoExpBtn.onclick = exportRepositoryFile;
    var repoImpBtn = $("#repoImportBtn"); if (repoImpBtn) repoImpBtn.onclick = importRepositoryFile;
    var repoCompareBtn = $("#repoCompareBtn"); if (repoCompareBtn) repoCompareBtn.onclick = openCompareDashboards;
    var ndsBtn = $("#btnNewDS"); setIconBtn(ndsBtn, "plus", "New source", 12); ndsBtn.onclick = function () { dataSourceBuilder(null); };
    $("#inspBack").onclick = selectDashboard;

    // New menu: blank, duplicate current, or auto-build a starter dashboard from a catalog query set
    var nm = $("#menuNew");
    var stems = Object.keys(S.catalog).filter(function (s) {
      return (S.catalog[s].dataAccesses || []).some(function (d) { return (d.columns || []).length >= 2; });
    }).sort();
    nm.innerHTML = '<button data-new="blank">＋ Blank dashboard</button>' +
      '<button data-new="dup" id="btnDupDash">⧉ Duplicate current</button><div class="sep"></div>' +
      '<div class="grp">Auto-build from a query set</div>' +
      stems.map(function (s) { return '<button data-stem="' + esc(s) + '">' + esc(s) + "</button>"; }).join("");
    $$("button", nm).forEach(function (b) {
      b.onclick = function () {
        var action = b.getAttribute("data-new");
        if (action === "blank") {
          S.spec = applyDashboardDefaults(Studio.emptySpec()); S.selection = null; syncHeader(); renderInspector(); refreshPreview(); bumpDashMilestone();
        } else if (action === "dup") {
          // Duplicate the current dashboard: clone the spec, assign a new unique ID,
          // append " (copy)" to the title, and append "-copy" to the file name stem.
          var dup = Studio.clone(S.spec);
          dup.id    = Studio.uid("dash");
          dup.title = (dup.title || "Untitled Dashboard") + " (copy)";
          dup.name  = (dup.name  || "untitled").replace(/(-copy)+$/, "") + "-copy";
          S.spec    = dup;
          S.selection = null;
          syncHeader(); renderInspector(); refreshPreview();
          flashBtn(document.getElementById("btnNew"), "Duplicated!");
        } else {
          scaffoldFromStem(b.getAttribute("data-stem"));
        }
        closeMenus();
      };
    });
    menuToggle($("#btnNew"), nm);

    // examples menu — E5: visual card gallery
    var em = $("#menuExamples");
    em.classList.add("ex-grid");
    // one grid, ordered by index.json — most spectacular first (no single "hero" card)
    // E3: mini layout thumbnail for each example card — synthesised from index.json metadata
    // (types[], panels count, kpis count) without needing to load the full spec file.
    function exLayoutSvg(e) {
      var cols = e.gridCols || 3, kpis = e.kpis || 0;
      // per-panel [type, span] — prefer the exact dashboard layout so each thumbnail is a
      // faithful mini-map of the real panels & grid; fall back to the deduped types[].
      var layout = (e.layout && e.layout.length) ? e.layout
        : (e.types || []).slice(0, 6).map(function (t) { return [t, 1]; });
      layout = layout.slice(0, 8);
      var W = 80, H = 46;
      var pal = ["#005bb5","#7d3c98","#2e8bd0","#00a39a","#e67e22"];
      var p = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '">'];
      p.push('<rect width="' + W + '" height="' + H + '" fill="var(--field,#f4f6fb)"/>');
      p.push('<rect width="' + W + '" height="7" fill="var(--bg,#fff)"/>');
      p.push('<rect width="2" height="7" fill="#005bb5"/>');
      var y = 9;
      if (kpis) {
        var kCount = Math.min(kpis, 4), kw = (W - 4 - (kCount - 1) * 3) / kCount;
        for (var ki = 0; ki < kCount; ki++) {
          var kx = 2 + ki * (kw + 3);
          p.push('<rect x="' + kx + '" y="' + y + '" width="' + kw + '" height="6" rx="1" fill="var(--bg,#fff)"/>');
          p.push('<rect x="' + kx + '" y="' + y + '" width="2" height="6" fill="' + pal[ki % 5] + '"/>');
        }
        y += 8;
      }
      // pack panels into grid rows honouring each panel's column span ("full" → full width)
      var cells = [], colUsed = 0, row = 0;
      layout.forEach(function (it) {
        var raw = (it[1] === "full") ? cols : (it[1] || 1);
        var s = Math.max(1, Math.min(cols, raw));
        if (colUsed + s > cols) { row++; colUsed = 0; }
        cells.push({ type: it[0], span: s, row: row, col: colUsed });
        colUsed += s;
        if (colUsed >= cols) { row++; colUsed = 0; }
      });
      var rows = Math.max(1, row + (colUsed > 0 ? 1 : 0));
      var unit = (W - 4 - (cols - 1) * 2) / cols;
      var ph = Math.min((H - y - 2 - (rows - 1) * 2) / rows, 15);
      cells.forEach(function (cel, pi) {
        var px = 2 + cel.col * (unit + 2);
        var pw = cel.span * unit + (cel.span - 1) * 2;
        var py = y + cel.row * (ph + 2);
        // white panel card, then the REAL chart-type mini SVG scaled into it — so each card
        // previews the actual charts (and their spans) in the dashboard, not a generic mockup.
        p.push('<rect x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph + '" rx="1.5" fill="var(--bg,#fff)"/>');
        var mini = CHART_SVG[cel.type];
        if (mini) {
          var pad = 1.3;
          p.push(mini.replace('<svg ', '<svg x="' + (px + pad).toFixed(2) + '" y="' + (py + pad).toFixed(2) + '" width="' + (pw - 2 * pad).toFixed(2) + '" height="' + (ph - 2 * pad).toFixed(2) + '" preserveAspectRatio="xMidYMid meet" '));
        } else {
          p.push('<rect x="' + px + '" y="' + py + '" width="' + pw + '" height="2" fill="' + pal[pi % 5] + '"/>');
        }
      });
      p.push('</svg>');
      return p.join("");
    }
    function exCard(e) {
      var types = (e.types || []).slice(0, 4).map(function (t) {
        return '<span class="ex-chip">' + esc(t) + '</span>';
      }).join("");
      var meta = [];
      if (e.panels) meta.push(e.panels + "P");
      if (e.kpis) meta.push(e.kpis + "K");
      return '<button class="ex-card" data-f="' + esc(e.file) + '">' +
        '<div class="ex-thumb" aria-hidden="true">' + exLayoutSvg(e) + '</div>' +
        '<div class="ex-card-top">' +
          '<span class="ex-card-types">' + types + '</span>' +
        '</div>' +
        '<div class="ex-card-title">' + esc(e.title || e.file) + '</div>' +
        (meta.length ? '<div class="ex-card-meta">' + meta.join(" · ") + '</div>' : "") +
        '</button>';
    }
    em.innerHTML = '<div class="grp">Examples</div><div class="ex-cards">' + S.examples.map(exCard).join("") + '</div>' +
      '<button type="button" class="btn ex-url-btn" id="btnImportUrl">＋ Import from URL…</button>';
    $$("button.ex-card", em).forEach(function (b) { b.onclick = function () { loadExample(b.getAttribute("data-f")); closeMenus(); }; });
    menuToggle($("#btnExamples"), em);
    var importUrlBtn = $("#btnImportUrl", em);
    if (importUrlBtn) importUrlBtn.onclick = function () { closeMenus(); openImportUrlModal(); };

    // export menu
    menuToggle($("#btnExport"), $("#menuExport"));
    $$("#menuExport button").forEach(function (b) { b.onclick = function () { doExport(b.getAttribute("data-exp")); closeMenus(); }; });
    var pushBtn = $("#menuExport button[data-exp='push']"); if (pushBtn) setIconBtn(pushBtn, "upload", "Push to active server…");
    var histWrap = el("div"); histWrap.id = "exportHistWrap"; $("#menuExport").appendChild(histWrap);
    loadExportHistory(); renderExportHistory();

    $("#btnImport").onclick = openSpecFile;
    $("#btnSaveSpec").onclick = function () { clearAutosave(); snapshotVersion(); download(S.spec.name + ".studio.json", JSON.stringify(S.spec, null, 2), "application/json"); };
    $("#btnLive").onclick = toggleLive;
    $("#btnConn").onclick = connModal;

    // ? key → shortcuts modal (when not in a text field)
    document.addEventListener("keydown", function (e) {
      if (e.key !== "?") return;
      var inEdit = /^(input|textarea|select)$/i.test(e.target.tagName || "") || e.target.isContentEditable;
      if (inEdit || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      showShortcuts();
    });

    // / key — focus the chart-type gallery search when a panel is selected and the gallery
    // is visible. Natural "search" shortcut familiar from GitHub, Jira, and Linear.
    document.addEventListener("keydown", function (e) {
      if (e.key !== "/") return;
      var inEdit = /^(input|textarea|select)$/i.test(e.target.tagName || "") || e.target.isContentEditable;
      if (inEdit || e.metaKey || e.ctrlKey || e.altKey) return;
      var cgSearch = document.querySelector(".cg-search");
      if (cgSearch) { e.preventDefault(); cgSearch.focus(); cgSearch.select(); }
    });

    // Ctrl/Cmd+F — focus the library search field (natural "find/filter" shortcut).
    // On phone (≤640px) also opens the library drawer so the search is reachable.
    document.addEventListener("keydown", function (e) {
      if (e.key !== "f" && e.key !== "F") return;
      if (!e.ctrlKey && !e.metaKey) return;
      var inEdit = /^(input|textarea|select)$/i.test(e.target.tagName || "") || e.target.isContentEditable;
      if (inEdit) return;
      e.preventDefault();
      // On phone, open the library drawer first
      if (window.innerWidth <= 640) {
        var libTab = document.querySelector('.mob-tab[data-pane="lib"]');
        if (libTab) libTab.click();
      }
      var libSearch = document.getElementById("libSearch");
      if (libSearch) { libSearch.focus(); libSearch.select(); }
    });

    // Delete / Backspace → delete selected panel or KPI; Escape → deselect
    document.addEventListener("keydown", function (e) {
      var inEdit = /^(input|textarea|select)$/i.test(e.target.tagName || "") || e.target.isContentEditable;
      if (inEdit || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        if (document.body.classList.contains("focus-mode")) { e.preventDefault(); exitFocusMode(); }
        else if (S.selection) { e.preventDefault(); selectDashboard(); }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (S.selection && S.selection.kind === "panel") { e.preventDefault(); deletePanel(S.selection.id); }
        else if (S.selection && S.selection.kind === "kpi") { e.preventDefault(); var ki = S.selection.index; S.spec.kpis.splice(ki, 1); selectDashboard(); refreshPreview(); toast("KPI removed"); }
      }
    });

    // responsive "⋯ More" menu — mirrors the .btn-secondary actions hidden at ≤900px
    menuToggle($("#btnMore"), $("#menuMore"));
    [["moreAbout","btnAbout"],["moreConn","btnConn"],["moreLive","btnLive"],["moreTheme","btnTheme"]].forEach(function(pair) {
      var tgt = $("#" + pair[0]), src = $("#" + pair[1]);
      if (tgt && src) tgt.onclick = function () { closeMenus(); src.click(); };
    });
    // H-track v117: Demo mode — simulate live refreshing data for SE demos
    var moreDemoMode = $("#moreDemoMode"); if (moreDemoMode) moreDemoMode.onclick = function () { closeMenus(); toggleDemoMode(); };
    var morePresent = $("#morePresent"); if (morePresent) morePresent.onclick = function () { closeMenus(); enterFocusMode(); };
    var moreSlideshow = $("#moreSlideshow"); if (moreSlideshow) moreSlideshow.onclick = function () { closeMenus(); openSlideshow(); };
    var moreSimple = $("#moreSimple"); if (moreSimple) moreSimple.onclick = function () { closeMenus(); toggleSimpleMode(); };
    var moreShortcuts = $("#moreShortcuts"); if (moreShortcuts) moreShortcuts.onclick = function () { closeMenus(); showShortcuts(); };
    // J-track v98 — help docs: opens the self-contained reference guide in a new tab.
    var moreHelp = $("#moreHelp"); if (moreHelp) moreHelp.onclick = function () { closeMenus(); window.open("docs/index.html", "_blank", "noopener"); };
    // J6 — interactive tutorial
    var moreTutorial = $("#moreTutorial"); if (moreTutorial) moreTutorial.onclick = function () { closeMenus(); if (window.StudioTutorial) StudioTutorial.open(); };
    // N-DEV: live JSON spec editor
    var moreEditJSON = $("#moreEditJSON"); if (moreEditJSON) moreEditJSON.onclick = function () { closeMenus(); openJsonEditor(); };

    // M7: phone-only More menu items — exposed at ≤400px when topbar hides these buttons
    var moreExamples = $("#moreExamples");
    if (moreExamples) moreExamples.onclick = function () {
      closeMenus();
      // On narrow phones, open the examples menu pinned below the topbar (fixed layout)
      var em = $("#menuExamples");
      em.classList.add("phone-pos", "open");
    };
    var moreImport = $("#moreImport");
    if (moreImport) moreImport.onclick = function () { closeMenus(); openSpecFile(); };
    var moreSaveSpec = $("#moreSaveSpec");
    if (moreSaveSpec) moreSaveSpec.onclick = function () {
      closeMenus();
      clearAutosave();
      snapshotVersion();
      download(S.spec.name + ".studio.json", JSON.stringify(S.spec, null, 2), "application/json");
    };

    // E8 — Sign out: clear gate session flag and reload so the passcode is required again
    var moreSignOut = $("#moreSignOut"); if (moreSignOut) moreSignOut.onclick = function () {
      closeMenus();
      try { sessionStorage.removeItem("studio-gate-ok"); } catch (e) {}
      location.reload();
    };

    // E8 — Clear local data: wipe all Studio localStorage with a confirm, then toast
    var moreClearData = $("#moreClearData"); if (moreClearData) moreClearData.onclick = function () {
      closeMenus();
      var keys = CLEAR_DATA_KEYS;
      var msg = "Clear all locally-stored Studio data?\n\nThis will remove:\n" +
        "  • Unsaved spec draft (autosave)\n" +
        "  • Export history\n" +
        "  • Saved server connections\n" +
        "  • Theme, pane widths & layout\n\n" +
        "The page will reload.";
      if (!confirm(msg)) return;
      try { keys.forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
      // N-DIST: also drop the offline-shell service worker cache so a clean reload can't
      // still be served a stale cached copy of the app.
      try {
        if (window.caches && caches.keys) caches.keys().then(function (names) { names.forEach(function (n) { caches.delete(n); }); });
      } catch (e) {}
      toast("Local data cleared — reloading…");
      setTimeout(function () { location.reload(); }, 1000);
    };

    // "¶ Text" canvas-bar button — add a rich-text annotation panel to the current dashboard
    var addTextBtn = $("#btnAddText"); if (addTextBtn) addTextBtn.onclick = addTextPanel;

    document.addEventListener("click", function (e) { if (!e.target.closest(".menu-wrap")) closeMenus(); });
  }
  /* ---------- resizable + collapsible side panels ---------- */
  function setupPanes() {
    var ws = $("#workspace");
    try {
      var lw = localStorage.getItem("studio-lw"), rw = localStorage.getItem("studio-rw");
      if (lw) ws.style.setProperty("--lw", lw); if (rw) ws.style.setProperty("--rw", rw);
    } catch (e) {}
    wireResizer($("#resizeL"), "--lw", 1);
    wireResizer($("#resizeR"), "--rw", -1);
    $$(".pane-collapse").forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); collapsePane(b.getAttribute("data-pane")); }; });
    $$(".pane-rail").forEach(function (r) { r.onclick = function () { collapsePane(r.getAttribute("data-pane"), false); }; });
    try {
      if (localStorage.getItem("studio-collapse-library") === "1") collapsePane("library", true, true);
      if (localStorage.getItem("studio-collapse-inspector") === "1") collapsePane("inspector", true, true);
    } catch (e) {}
  }
  function wireResizer(el, varName, dir) {
    if (!el) return;
    el.addEventListener("pointerdown", function (e) {
      e.preventDefault(); el.classList.add("drag"); document.body.style.userSelect = "none"; document.body.style.cursor = "col-resize";
      var ws = $("#workspace"), startX = e.clientX, start = parseFloat(getComputedStyle(ws).getPropertyValue(varName)) || 300;
      var min = varName === "--lw" ? 220 : 250, max = 620;
      function mv(ev) { var w = Math.max(min, Math.min(max, start + (ev.clientX - startX) * dir)); ws.style.setProperty(varName, w + "px"); nudgePreview(); }
      function up() {
        window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up);
        el.classList.remove("drag"); document.body.style.userSelect = ""; document.body.style.cursor = "";
        try { localStorage.setItem("studio-" + varName.replace("--", ""), ws.style.getPropertyValue(varName)); } catch (x) {}
      }
      window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
    });
  }
  function collapsePane(which, force, silent) {
    if (window.matchMedia && window.matchMedia("(max-width:640px)").matches) return; // drawers on phone
    var pane = $("#" + which); if (!pane) return;
    var collapsed = (force !== undefined) ? force : !pane.classList.contains("collapsed");
    pane.classList.toggle("collapsed", collapsed);
    var rez = which === "library" ? $("#resizeL") : $("#resizeR"); if (rez) rez.style.display = collapsed ? "none" : "";
    if (!silent) { try { localStorage.setItem("studio-collapse-" + which, collapsed ? "1" : "0"); } catch (e) {} }
    nudgePreview();
  }
  function nudgePreview() { var ifr = $("#preview"); try { ifr.contentWindow.dispatchEvent(new Event("resize")); } catch (e) {} }

  /* ---------- mobile drawer tab bar (M2) ---------- */
  function setupMobileTabs() {
    var tabsEl = $("#mobile-tabs"), scrim = $("#mobile-scrim");
    if (!tabsEl) return;
    var TABS = [
      { id: "library",   label: "Library",   icon: "db" },
      { id: "canvas",    label: "Canvas",    icon: "eye" },
      { id: "inspector", label: "Inspector", icon: "gear" }
    ];
    TABS.forEach(function (t) {
      var btn = el("button", "mob-tab");
      btn.setAttribute("data-mob-tab", t.id);
      btn.setAttribute("aria-label", t.label);
      if (Studio.icon) btn.appendChild(Studio.icon(t.icon, 20));
      var lbl = el("span"); lbl.textContent = t.label; btn.appendChild(lbl);
      btn.onclick = function () { activateMobTab(t.id); };
      tabsEl.appendChild(btn);
    });
    activateMobTab("canvas", true);
    if (scrim) scrim.onclick = function () { activateMobTab("canvas"); };
    // When viewport grows past phone width, reset drawer state
    try {
      window.matchMedia("(max-width:640px)").addEventListener("change", function (mq) {
        if (!mq.matches) {
          var lib = $("#library"), insp = $("#inspector");
          if (lib) lib.classList.remove("drawer-open");
          if (insp) insp.classList.remove("drawer-open");
          if (scrim) scrim.classList.remove("active");
        }
      });
    } catch (e) {}
    window.__studioMobTab = activateMobTab;
  }
  function activateMobTab(which, silent) {
    if (!window.matchMedia("(max-width:640px)").matches) return;
    var lib = $("#library"), insp = $("#inspector"), scrim = $("#mobile-scrim");
    $$(".mob-tab").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-mob-tab") === which); });
    if (which === "library") {
      if (lib) lib.classList.add("drawer-open");
      if (insp) insp.classList.remove("drawer-open");
      if (scrim) scrim.classList.add("active");
    } else if (which === "inspector") {
      if (insp) insp.classList.add("drawer-open");
      if (lib) lib.classList.remove("drawer-open");
      if (scrim) scrim.classList.add("active");
    } else {
      if (lib) lib.classList.remove("drawer-open");
      if (insp) insp.classList.remove("drawer-open");
      if (scrim) scrim.classList.remove("active");
    }
    if (!silent) { try { localStorage.setItem("studio-mob-tab", which); } catch (e) {} }
    nudgePreview();
  }

  function menuToggle(btn, menu) { btn.onclick = function (e) { e.stopPropagation(); var open = menu.classList.contains("open"); closeMenus(); if (!open) menu.classList.add("open"); }; }
  function closeMenus() { $$(".menu").forEach(function (m) { m.classList.remove("open", "phone-pos"); }); }

  function syncHeader() {
    var tb = $("#dashTitle");
    tb.querySelector(".dash-title-txt").textContent = S.spec.title || "Untitled dashboard";
    if (!tb.querySelector("svg")) tb.appendChild(Studio.icon("edit", 13));
    $("#dashName").textContent = S.spec.name; $("#dashGroup").textContent = S.spec.group;
  }

  /* ---------- Pentaho server connections (Kettle slaveserver format) ---------- */
  function loadConnections() {
    try { S.connections = JSON.parse(localStorage.getItem("studio-connections") || "[]"); S.activeConn = localStorage.getItem("studio-active-conn") || null; } catch (e) { S.connections = []; }
    if (S.activeConn && !S.connections.some(function (c) { return c.id === S.activeConn; })) S.activeConn = null;
    updateConnBtn();
  }
  function saveConnections() {
    try { localStorage.setItem("studio-connections", JSON.stringify(S.connections)); if (S.activeConn) localStorage.setItem("studio-active-conn", S.activeConn); else localStorage.removeItem("studio-active-conn"); } catch (e) {}
    updateConnBtn();
  }
  function activeConnection() { return S.connections.filter(function (c) { return c.id === S.activeConn; })[0] || null; }
  function client() { var c = activeConnection(); return c ? Studio.PentahoClient(c) : null; }
  function updateConnBtn() { var c = activeConnection(), b = $("#btnConn"); if (!b) return; setIconBtn(b, c ? "link" : "gear", c ? c.name : "Servers"); b.classList.toggle("live-on", !!c); }
  window.__studioConns = function () { return { connections: S.connections, active: S.activeConn }; };
  window.__fireToast = function (msg, isErr) { toast(msg, isErr); }; // exposed for tests
  window.__studioSelectDashboard = selectDashboard; // exposed for tests
  window.__studioSelect = select;                   // exposed for tests (K6, etc.)
  window.__studioRenderInspector = renderInspector; // exposed for tests
  window.__studioBuildLibrary = buildLibrary;       // exposed for tests

  function connModal() { modal("Pentaho server connections", function (b) { renderConnBody(b); }, function () { refreshPreview(); }); }
  function renderConnBody(b) {
    b.innerHTML = "";
    b.appendChild(noteEl("info", "Connections use the Kettle slaveserver format. Live calls need the server reachable (same-origin cookie session, or CORS + the connection’s credentials). Standalone mode works fully without a connection."));
    if (!S.connections.length) b.appendChild(hint("No connections yet — add one below or import a Kettle XML."));
    S.connections.forEach(function (c) {
      var row = el("div", "conn-row" + (c.id === S.activeConn ? " active" : ""));
      var info = el("div", "cn"); info.innerHTML = "<b>" + esc(c.name) + "</b><span>" + esc(Studio.PentahoClient(c).base()) + "</span>"; row.appendChild(info);
      var acts = el("div", "conn-acts");
      var use = el("button", "btn"); if (c.id === S.activeConn) { use.appendChild(Studio.icon("check", 13)); use.appendChild(document.createTextNode(" Active")); } else { use.textContent = "Use"; } use.onclick = function () { S.activeConn = c.id; saveConnections(); refreshPreview(); renderConnBody(b); };
      var imp = el("button", "btn"); imp.textContent = "Import sources…"; imp.onclick = function () { S.activeConn = c.id; saveConnections(); importFromServer(); };
      var ed = el("button", "btn"); ed.textContent = "Edit"; ed.onclick = function () { connForm(b, c); };
      var del = el("button", "icobtn danger"); del.appendChild(Studio.icon("close", 13)); del.title = "Delete"; del.onclick = function () { S.connections = S.connections.filter(function (x) { return x.id !== c.id; }); if (S.activeConn === c.id) S.activeConn = null; saveConnections(); renderConnBody(b); };
      [use, imp, ed, del].forEach(function (x) { acts.appendChild(x); }); row.appendChild(acts); b.appendChild(row);
    });
    var bar = el("div"); bar.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:12px";
    var add = el("button", "btn btn-primary"); add.style.color = "#fff"; setIconBtn(add, "plus", "Add connection"); add.onclick = function () { connForm(b, null); };
    var imp = el("button", "btn"); imp.textContent = "Import Kettle XML"; imp.onclick = function () { importKettle(b); };
    var exp = el("button", "btn"); exp.textContent = "Export Kettle XML"; exp.onclick = function () { download("slaveservers.xml", "<slaveservers>\n" + Studio.kettle.serialize(S.connections) + "\n</slaveservers>\n", "application/xml"); };
    [add, imp, exp].forEach(function (x) { bar.appendChild(x); }); b.appendChild(bar);
  }
  function connForm(b, c) {
    var isNew = !c; c = c ? Studio.clone(c) : { id: Studio.uid("conn"), name: "", scheme: "http", hostname: "localhost", port: "8080", webAppName: "pentaho", username: "", password: "" };
    b.innerHTML = ""; var w = el("div");
    w.appendChild(field("Name", input(c.name, function (v) { c.name = v; })));
    w.appendChild(field("Scheme", select2(["http", "https"], c.scheme, function (v) { c.scheme = v; })));
    w.appendChild(field("Hostname", input(c.hostname, function (v) { c.hostname = v; })));
    w.appendChild(field("Port", input(c.port, function (v) { c.port = v; })));
    w.appendChild(field("Web app name", input(c.webAppName, function (v) { c.webAppName = v; })));
    w.appendChild(field("Username", input(c.username, function (v) { c.username = v; })));
    w.appendChild(field("Password", input(c.password, function (v) { c.password = v; }), "stored locally; blank = use the browser’s Pentaho session cookie"));
    var bar = el("div"); bar.style.cssText = "display:flex;gap:8px;margin-top:6px";
    var save = el("button", "btn btn-primary"); save.style.color = "#fff"; save.textContent = "Save connection";
    save.onclick = function () { if (!c.name) c.name = c.hostname || "Pentaho"; if (isNew) S.connections.push(c); else { var i = -1; S.connections.forEach(function (x, ix) { if (x.id === c.id) i = ix; }); if (i >= 0) S.connections[i] = c; } saveConnections(); renderConnBody(b); toast("Connection saved"); };
    var cancel = el("button", "btn"); cancel.textContent = "Cancel"; cancel.onclick = function () { renderConnBody(b); };
    bar.appendChild(save); bar.appendChild(cancel); w.appendChild(bar); b.appendChild(w);
  }
  function importKettle(b) {
    b.innerHTML = ""; var w = el("div");
    w.appendChild(hint("Paste <slaveserver> XML (or a Kettle repositories.xml), or choose a file."));
    var ta = el("textarea"); ta.style.cssText = "width:100%;min-height:130px;font-family:var(--mono);font-size:11px"; w.appendChild(ta);
    var file = el("input"); file.type = "file"; file.accept = ".xml"; file.style.marginTop = "6px";
    file.onchange = function () { var f = file.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { ta.value = rd.result; }; rd.readAsText(f); };
    w.appendChild(file);
    var bar = el("div"); bar.style.cssText = "display:flex;gap:8px;margin-top:8px";
    var imp = el("button", "btn btn-primary"); imp.style.color = "#fff"; imp.textContent = "Import";
    imp.onclick = function () { try { var cs = Studio.kettle.parse(ta.value); if (!cs.length) { toast("No <slaveserver> found", true); return; } cs.forEach(function (c) { S.connections.push(c); }); saveConnections(); toast("Imported " + cs.length + " connection(s)"); renderConnBody(b); } catch (e) { toast("Parse error: " + e.message, true); } };
    var cancel = el("button", "btn"); cancel.textContent = "Back"; cancel.onclick = function () { renderConnBody(b); };
    bar.appendChild(imp); bar.appendChild(cancel); w.appendChild(bar); b.appendChild(w);
  }
  function importFromServer() {
    var cl = client(); if (!cl) { toast("No active connection", true); return; }
    modal("Import from " + activeConnection().name, function (b) {
      b.appendChild(noteEl("info", "Browsing the repository via the Pentaho API. Needs the server reachable (CORS / login)."));
      var status = el("div", "hint"); status.textContent = "Loading file list…"; b.appendChild(status);
      var qBox = el("div"); qBox.style.cssText = "max-height:200px;overflow:auto;margin:6px 0"; var dBox = el("div"); dBox.style.cssText = "max-height:200px;overflow:auto;margin:6px 0";
      cl.listFiles("/public", "*.cda|*.cdfde").then(function (files) {
        var cdas = files.filter(function (f) { return f.ext === "cda"; });
        var dashes = files.filter(function (f) { return f.ext === "cdfde"; });
        status.textContent = cdas.length + " CDA queries · " + dashes.length + " CDE dashboards found.";
        // queries → library
        var qh = section(b, "Queries → library"); qh.appendChild(qBox);
        cdas.forEach(function (f) { var lab = el("label", "check"); var cb = el("input"); cb.type = "checkbox"; cb.checked = true; cb.value = f.path; lab.appendChild(cb); lab.appendChild(document.createTextNode(" " + f.path)); qBox.appendChild(lab); });
        var imp = el("button", "btn-wide"); imp.textContent = "Import selected queries"; qBox.parentNode.appendChild(imp);
        imp.onclick = function () {
          var sel = [].slice.call(qBox.querySelectorAll("input:checked")).map(function (x) { return x.value; });
          Promise.all(sel.map(function (p) { return cl.getFile(p).then(function (xml) { return { stem: p.split("/").pop().replace(/\.cda$/, ""), entry: Object.assign(Studio.parseCDA(xml), { file: p.split("/").pop() }) }; }); }))
            .then(function (res) { res.forEach(function (r) { S.catalog[r.stem] = r.entry; }); buildLibrary(); toast("Imported " + res.length + " CDA(s)"); })
            .catch(function (e) { toast("Import failed: " + e.message, true); });
        };
        // dashboards → open in editor
        var dh = section(b, "Dashboards → open & edit"); dh.appendChild(dBox);
        dashes.forEach(function (f) {
          var stem = f.path.replace(/\.cdfde$/, ""), row = el("div", "row-item");
          row.innerHTML = '<span class="ri-icon">▦</span><span class="ri-txt"><span class="ri-t">' + esc(f.path.split("/").pop()) + '</span></span>';
          var open = el("button", "btn"); open.textContent = "Open"; row.appendChild(open);
          open.onclick = function () { openServerDashboard(cl, stem); };
          dBox.appendChild(row);
        });
      }).catch(function (e) { status.textContent = "Could not browse server (" + e.message + "). Check the connection / CORS / login."; });
    });
  }
  function openServerDashboard(cl, stem) {
    var name = stem.split("/").pop();
    Promise.all([cl.getFile(stem + ".cdfde"), cl.getFile(stem + ".cda").catch(function () { return ""; }), cl.getFile(stem + ".wcdf").catch(function () { return ""; })])
      .then(function (r) {
        var cda = r[1] ? Studio.parseCDA(r[1]) : null;
        var spec = Studio.parseCDE(r[0], r[2], cda); spec.name = name; spec.id = Studio.uid("dash");
        S.spec = normalize(spec); S.selection = null; syncHeader(); renderInspector(); refreshPreview();
        toast("Opened " + name + " from server"); closeAllModals();
      }).catch(function (e) { toast("Open failed: " + e.message, true); });
  }
  function pushToServer() {
    var cl = client(); if (!cl) { toast("No active connection — add one in ⚙ Servers", true); return; }
    var sp = S.spec, dp = S.settings.deployPath;
    var files = [[dp + "/" + sp.name + ".cda", Studio.exportCDA(sp), "application/xml"],
      [dp + "/" + sp.name + ".html", Studio.exportCDF(sp, S.assets, dp), "text/html"]];
    modal("Push to " + activeConnection().name, function (b) {
      b.appendChild(noteEl("info", "Publishing " + files.length + " artifacts to " + dp + " via the Pentaho import API. Needs Publish permission + a reachable server."));
      var log = el("div", "hint"); log.textContent = "Ready."; b.appendChild(log);
      var go = el("button", "btn btn-primary"); go.style.color = "#fff"; go.textContent = "Publish now";
      go.onclick = function () {
        go.disabled = true; var ok = 0, fail = 0;
        (function next(i) {
          if (i >= files.length) { log.textContent = "Done: " + ok + " published, " + fail + " failed."; toast(fail ? ("Push: " + fail + " failed") : ("Pushed " + ok + " artifacts"), !!fail); return; }
          var f = files[i]; log.textContent = "Publishing " + f[0].split("/").pop() + "…";
          cl.publishFile(f[0], f[1], f[2], true).then(function (r) { r.ok ? ok++ : fail++; next(i + 1); }).catch(function () { fail++; next(i + 1); });
        })(0);
      };
      b.appendChild(go);
    });
  }
  function closeAllModals() { $$(".modal-ov").forEach(function (m) { m.remove(); }); }

  /* ---------- export ---------- */
  // N-FUN: delight moments — small, rare, tasteful celebrations. Shared spark-burst visual (respects
  // prefers-reduced-motion) backs both the one-time first-export moment and the recurring export
  // milestones below.
  function sparkBurst() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var colors = ["#d4773b", "#f55036", "#8b5cf6", "#4285f4", "#10a37f", "#ffb000"];
    var host = el("div", "spark-host");
    for (var i = 0; i < 18; i++) {
      var p = el("span", "spark-p");
      p.style.left = (48 + Math.random() * 6 - 3) + "%";
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * 0.15) + "s";
      p.style.setProperty("--dx", Math.round(Math.random() * 240 - 120) + "px");
      host.appendChild(p);
    }
    document.body.appendChild(host);
    setTimeout(function () { host.remove(); }, 1400);
  }
  function celebrateFirstExport() {
    try {
      if (localStorage.getItem("studio-first-export-done")) return;
      localStorage.setItem("studio-first-export-done", "1");
    } catch (e) { return; }
    toast("First export! Nice work — your dashboard is ready to share.");
    sparkBurst();
  }
  // N-FUN: export milestones — a light "you're on a roll" nudge at round totals, counted across every
  // export this browser has ever made (any kind). Purely encouraging, never repeats a given milestone
  // (tracked via the running total itself, which only grows), same spark-burst as the first-export moment.
  var EXPORT_MILESTONES = { 10: "10 exports!", 25: "25 exports — you're on a roll.", 50: "50 exports! Dashboard machine.", 100: "100 exports. Legendary.", 250: "250 exports. Absolute unit of a portfolio." };
  function bumpExportMilestone() {
    var n = 0;
    try { n = (parseInt(localStorage.getItem("studio-export-count"), 10) || 0) + 1; localStorage.setItem("studio-export-count", String(n)); } catch (e) { return; }
    if (EXPORT_MILESTONES[n]) { toast(EXPORT_MILESTONES[n] + " Keep it up."); sparkBurst(); }
  }
  // N-FUN: another "more milestone moments" slice — celebrate round totals of brand-new blank
  // dashboards started (Home's Blank quick-create card + New ▾ → Blank dashboard; NOT Open/Import/
  // examples/Duplicate, which pick up someone else's spec rather than starting fresh). Same running-
  // counter + spark-burst convention as the export milestones above.
  var DASH_MILESTONES = { 5: "5 dashboards built!", 10: "10 dashboards — a real portfolio.", 25: "25 dashboards. You're a Studio power user.", 50: "50 dashboards. Incredible pace." };
  function bumpDashMilestone() {
    var n = 0;
    try { n = (parseInt(localStorage.getItem("studio-dash-count"), 10) || 0) + 1; localStorage.setItem("studio-dash-count", String(n)); } catch (e) { return; }
    if (DASH_MILESTONES[n]) { toast(DASH_MILESTONES[n]); sparkBurst(); }
  }

  function doExport(kind) {
    celebrateFirstExport();
    bumpExportMilestone();
    if (kind === "push") return pushToServer();
    var sp = S.spec, dp = S.settings.deployPath;
    var problems = Studio.validate(sp).filter(function (x) { return x.level === "error"; });
    if (problems.length) { toast(problems[0].msg, true); }
    recordExport(kind, sp.title || sp.name);
    if (kind === "cda") return bundleModal("Data Access", [{ name: sp.name + ".cda", body: Studio.exportCDA(sp), mime: "application/xml" }]);
    if (kind === "cdf") return bundleModal("Dashboard Framework", [{ name: sp.name + ".html", body: Studio.exportCDF(sp, S.assets, dp), mime: "text/html" }]);
    if (kind === "all") {
      bundleModal("All artifacts", [
        { name: sp.name + ".html", body: Studio.exportCDF(sp, S.assets, dp), mime: "text/html" },
        { name: sp.name + ".cda", body: Studio.exportCDA(sp), mime: "application/xml" },
        { name: sp.name + ".studio.json", body: JSON.stringify(sp, null, 2), mime: "application/json" }
      ]);
    }
  }

  function bundleModal(title, files) {
    modal(title, function (b) {
      files.forEach(function (f) {
        var row = el("div", "dl-row");
        row.innerHTML = '<span class="nm">' + esc(f.name) + '</span><span class="sz">' + fmtBytes(f.body.length) + "</span>";
        var cp = el("button", "btn"); cp.textContent = "Copy"; cp.title = "Copy contents to clipboard";
        cp.onclick = function () { copyText(f.body, cp); };
        var dl = el("button", "btn btn-primary"); dl.textContent = "Download"; dl.style.color = "#fff";
        dl.onclick = function () { download(f.name, f.body, f.mime); };
        row.appendChild(cp); row.appendChild(dl); b.appendChild(row);
      });
      if (files.length > 1) {
        var all = el("button", "btn-wide"); setIconBtn(all, "download", "Download all (" + files.length + " files)");
        all.onclick = function () { files.forEach(function (f, i) { setTimeout(function () { download(f.name, f.body, f.mime); }, i * 250); }); };
        b.appendChild(all);
      }
    });
  }

  // Reflects S.settings.live onto the topbar Live/Sample button + repaints the preview. Shared by
  // the toggleLive() modal (⋯ More / #btnLive) and the Settings "Deploy" card so both entry points
  // to the same S.settings.live flag stay in sync (single source of truth, see Z5 deploy-target ask).
  function syncLiveButton() {
    var on = S.settings.live && activeConnection();
    var lb = $("#btnLive"); if (lb) { setIconBtn(lb, on ? "eye" : "refresh", on ? "Live" : "Sample"); lb.classList.toggle("live-on", !!on); }
    refreshPreview();
  }
  function toggleLive() {
    modal("Live data / deploy settings", function (b) {
      b.appendChild(noteEl("info", "Exported dashboards always read live data via CDA on the Pentaho server. The deploy path stamps the CDA links in exports. Live preview is best-effort and needs the active connection reachable (CORS / same-origin / login)."));
      var ac = activeConnection();
      b.appendChild(noteEl(ac ? "ok" : "warn", ac ? ("Active server: " + ac.name + " — " + Studio.PentahoClient(ac).base()) : "No active server connection. Add one in ⚙ Servers to preview live."));
      b.appendChild(field("Deploy path (server folder)", input(S.settings.deployPath, function (v) { S.settings.deployPath = v.trim(); setDeployPathPref(S.settings.deployPath); })));
      var lab = el("label", "check"); var cb = el("input"); cb.type = "checkbox"; cb.checked = S.settings.live;
      cb.onchange = function () { S.settings.live = cb.checked; setLiveDataPref(S.settings.live); }; lab.appendChild(cb); lab.appendChild(document.createTextNode("Use live data (active server) in the preview"));
      b.appendChild(lab);
    }, syncLiveButton);
  }

  function openSpecFile() {
    var inp = el("input"); inp.type = "file"; inp.accept = ".json,.studio.json,.html,.htm,.cdfde,application/json,text/html";
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return; var rd = new FileReader();
      rd.onload = function () {
        try {
          var txt = rd.result, spec;
          if (/\.cdfde$/i.test(f.name) || /"datasources"\s*:/.test(txt) && /"components"\s*:/.test(txt)) {
            spec = Studio.parseCDE(txt);            // lone .cdfde — CDA reconstructed from embedded datasources
            if (!spec || !spec.panels.length) throw new Error("no renderable components found in this .cdfde");
            spec.name = (f.name.replace(/\.cdfde$/i, "") || "imported").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
          } else if (/\.html?$/i.test(f.name) || /window\.STUDIO_SPEC/.test(txt)) {
            spec = Studio.parseCDFHtml(txt);
            if (!spec) throw new Error("no embedded dashboard found (was it exported from this Studio?)");
          } else spec = JSON.parse(txt);
          S.spec = normalize(spec); S.selection = null; clearAutosave(); syncHeader(); renderInspector(); refreshPreview(); toast("Opened " + f.name);
        } catch (e) { toast("Could not open: " + e.message, true); }
      };
      rd.readAsText(f);
    };
    inp.click();
  }

  /* N-DIST: "Import from URL" — a community-template exchange with zero backend. Paste
     any public link to a .studio.json dashboard spec (a GitHub raw link, a gist, a static
     host) and it loads the same way opening a local file would — just a client-side
     fetch() of a URL the user supplies, no server/credentials involved. Also accepts an
     "index of several" URL — a JSON array, or `{templates:[...]}`, of {title,url,description}
     entries (same shape as the Examples gallery's own index.json) — which renders a
     browsable list to pick one from instead of importing directly. */
  function openImportUrlModal() {
    modal("Import dashboard from URL", function (b) {
      var hint = el("p"); hint.style.cssText = "font-size:12.5px;color:var(--faint);margin:0 0 10px;line-height:1.5";
      hint.textContent = "Paste a public link to a .studio.json dashboard spec, or an index.json listing several templates (a GitHub raw link, a gist, any static host). This is a plain client-side fetch — no backend, no account needed.";
      b.appendChild(hint);
      var row = el("div"); row.style.cssText = "display:flex;gap:8px";
      var urlInp = el("input"); urlInp.type = "url"; urlInp.placeholder = "https://…/dashboard.studio.json";
      urlInp.style.flex = "1"; urlInp.id = "importUrlInput";
      var goBtn = el("button"); goBtn.type = "button"; goBtn.className = "btn btn-primary"; goBtn.id = "importUrlGo"; goBtn.textContent = "Import";
      row.appendChild(urlInp); row.appendChild(goBtn); b.appendChild(row);
      var status = el("div"); status.id = "importUrlStatus"; status.style.cssText = "margin-top:10px;font-size:12.5px"; b.appendChild(status);
      var list = el("div"); list.id = "importUrlList"; list.style.cssText = "margin-top:10px;max-height:280px;overflow:auto"; b.appendChild(list);

      function importSpec(spec, fallbackName) {
        if (!spec || typeof spec !== "object" || (!Array.isArray(spec.panels) && !Array.isArray(spec.kpis) && !spec.schema)) {
          throw new Error("that doesn't look like a dashboard spec (.studio.json)");
        }
        S.spec = normalize(spec); S.selection = null; clearAutosave();
        if (window.__studioShellSetSection) window.__studioShellSetSection("studio");
        syncHeader(); renderInspector(); refreshPreview(); buildLibrary();
        toast("Imported dashboard from URL: " + (spec.title || spec.name || fallbackName || "Untitled"));
        var ov = goBtn.closest(".modal-ov"); if (ov) ov.remove();
      }
      function resolveUrl(maybeRelative, baseUrl) {
        try { return new URL(maybeRelative, baseUrl).href; } catch (e) { return maybeRelative; }
      }
      function showTemplateList(entries, baseUrl) {
        list.innerHTML = "";
        status.style.color = "var(--faint)";
        status.textContent = "Found " + entries.length + " template" + (entries.length === 1 ? "" : "s") + " — pick one to import:";
        entries.forEach(function (entry) {
          var specUrl = resolveUrl(entry.url || entry.file, baseUrl);
          list.appendChild(rowItem("⇩", entry.title || specUrl, entry.description || specUrl, function () {
            status.style.color = "var(--faint)"; status.textContent = "Fetching " + (entry.title || specUrl) + "…";
            fetchJSON(specUrl).then(function (spec) { importSpec(spec, entry.title); }).catch(function (e) {
              status.style.color = "#e05a4e";
              status.textContent = "Couldn't import — " + (e && e.message ? e.message : "network/CORS error") + ".";
            });
          }, null, false));
        });
      }
      function run() {
        var url = urlInp.value.trim();
        if (!url) { urlInp.focus(); return; }
        status.style.color = "var(--faint)"; status.textContent = "Fetching…"; goBtn.disabled = true;
        list.innerHTML = "";
        fetchJSON(url).then(function (data) {
          goBtn.disabled = false;
          var entries = Array.isArray(data) ? data : (data && Array.isArray(data.templates) ? data.templates : null);
          if (entries) {
            if (!entries.length) throw new Error("that index has no templates listed");
            showTemplateList(entries, url);
            return;
          }
          importSpec(data);
        }).catch(function (e) {
          goBtn.disabled = false;
          status.style.color = "#e05a4e";
          status.textContent = "Couldn't import — " + (e && e.message ? e.message : "network/CORS error") + ".";
        });
      }
      goBtn.onclick = run;
      urlInp.addEventListener("keydown", function (e) { if (e.key === "Enter") run(); });
    });
  }
  window.__studioImportFromUrl = openImportUrlModal; // test hook

  /* ---------- tiny DOM + util helpers ---------- */

  /* J3: Quick help — contextual tips at the top of each inspector type.
     Collapsed by default (low-clutter); user can expand at any time.
     tips: array of short strings, rendered as bullet points.
     The section key is always "Quick help" so collapse-state persists
     across selection changes within the same session. */
  var QUICK_HELP = {
    dashboard: [
      "Drag a query from the library onto the canvas to add a chart panel.",
      "Use New ▾ → Auto-build to scaffold a full starter dashboard instantly.",
      "Export ▾ → CDF .html gives a standalone file you can open in any browser."
    ],
    panel: [
      "Pick a chart type from the gallery, then bind the data columns below.",
      "Press Shift+←/→ to resize the panel span; ↑/↓ to reorder it on the canvas.",
      "Advanced inspector sections (annotations, drill-through, etc.) are just below the options."
    ],
    kpi: [
      "KPI tiles show the first value from the first numeric column of the bound query.",
      "Add a Trend column to display a sparkline beneath the main value.",
      "Use Compare to to show a ▲/▼ delta against a second column."
    ],
    filter: [
      "Filters let viewers narrow the dashboard by selecting values from a query.",
      "Set an Options query that returns a value column for a dropdown list.",
      "Reference an upstream filter's value in your Options query to enable cascading."
    ],
    da: [
      "Use the SQL Builder accordion to compose SELECT queries visually.",
      "Click 'Detect from query' to extract column aliases automatically.",
      "Output options let you add filter rules, sort order, and row limits."
    ]
  };
  function quickHelp(parent, type) {
    var tips = QUICK_HELP[type]; if (!tips) return;
    // Default to collapsed so the section never clutters the default view;
    // user can expand at any time and the state persists for the session.
    if (!("Quick help" in _collapsedSects)) _collapsedSects["Quick help"] = true;
    var body = section(parent, "Quick help");
    var ul = el("ul", "qh-tips");
    tips.forEach(function (tip) {
      var li = el("li", "qh-tip"); li.textContent = tip; ul.appendChild(li);
    });
    body.appendChild(ul);
  }

  function el(t, c) { var e = document.createElement(t); if (c) e.className = c; return e; }
  function labelEl(t) { var l = el("label"); l.textContent = t; return l; }
  function section(parent, title, onAdd, summaryFn, helpAnchor) {
    /* Collapsible inspector section. Returns the body div so callers do
       body.appendChild(field(…)) and content hides/shows with the header.
       State is stored in _collapsedSects keyed by normalized title so it
       survives re-renders within the same session.
       summaryFn (optional): zero-arg function returning a short string shown
       inline in the collapsed header — e.g. "3 markers", "'Peak'", "enabled".
       helpAnchor (optional): docs/index.html anchor to link from a ? badge on the header.
       NOTE: The chevron uses an SVG icon (not a text character) so that
       h4.textContent keeps returning the plain section title — backward
       compatible with any code or test that reads it. */
    var key = title.replace(/\s*\(\d+\)\s*$/, ""); // strip "(N)" from dynamic titles
    var isCollapsed = !!_collapsedSects[key];
    var s = el("div", "insp-sec"); if (isCollapsed) s.classList.add("sec-collapsed");
    var h = el("h4"); h.style.cursor = "pointer"; h.title = "Click to collapse / expand";
    // SVG chevron — has empty textContent so h4.textContent stays == title
    var chev = el("span", "sec-chev");
    chev.appendChild(Studio.icon(isCollapsed ? "chevron-right" : "chevron-down", 9));
    h.appendChild(chev);
    h.appendChild(document.createTextNode(title));
    // J2: contextual help badge — SVG icon link deep-linking into docs/index.html.
    // Uses Studio.icon() (SVG, empty textContent) so h4.textContent stays == title.
    if (helpAnchor) {
      var hl = document.createElement("a");
      hl.href = "docs/index.html#" + helpAnchor;
      hl.target = "_blank"; hl.rel = "noopener noreferrer";
      hl.className = "sec-help"; hl.title = "Help docs";
      hl.setAttribute("aria-label", "Open help docs for " + title);
      hl.appendChild(Studio.icon("info", 10));
      hl.onclick = function (e) { e.stopPropagation(); }; // prevent section toggle
      h.appendChild(hl);
    }
    // Inline collapsed hint — visible only when the section is collapsed and summaryFn is set
    var hintEl = null;
    if (summaryFn) {
      hintEl = el("span", "sec-hint");
      hintEl.textContent = isCollapsed ? (summaryFn() || "") : "";
      h.appendChild(hintEl);
    }
    if (onAdd) {
      var a = el("button", "add"); a.appendChild(Studio.icon("plus", 12));
      a.onclick = function (e) { e.stopPropagation(); onAdd(e); };
      h.appendChild(a);
    }
    var body = el("div", "insp-sec-body");
    if (isCollapsed) body.style.display = "none";
    h.onclick = function () {
      _collapsedSects[key] = !_collapsedSects[key];
      _saveCollapsedSects(); // persist preference across sessions
      var now = !!_collapsedSects[key];
      body.style.display = now ? "none" : "";
      chev.innerHTML = "";
      chev.appendChild(Studio.icon(now ? "chevron-right" : "chevron-down", 9));
      s.classList.toggle("sec-collapsed", now);
      if (hintEl) hintEl.textContent = now ? (summaryFn() || "") : "";
    };
    s.appendChild(h); s.appendChild(body); parent.appendChild(s);
    return body; // callers append content here (not to the outer .insp-sec)
  }
  /* advSection — like section() but marks the outer .insp-sec with .adv-sect so
     CSS can hide the whole block in Simple mode (body.simple-mode .adv-sect). */
  function advSection(parent, title, onAdd, summaryFn, helpAnchor) {
    var body = section(parent, title, onAdd, summaryFn, helpAnchor);
    body.parentElement.classList.add("adv-sect");
    return body;
  }
  /* toggleSimpleMode — flip Simple mode on/off, persist to localStorage, and
     re-render the inspector so advanced sections appear/disappear immediately. */
  function toggleSimpleMode() {
    S.simpleMode = !S.simpleMode;
    document.body.classList.toggle("simple-mode", S.simpleMode);
    try { localStorage.setItem("studio-simple-mode", S.simpleMode ? "1" : ""); } catch (e) {}
    renderInspector();
    renderSettings();
    toast(S.simpleMode ? "Simple mode on — advanced options hidden" : "Advanced mode — all options visible");
  }
  function field(label, control, hintTxt) {
    var f = el("div", "field"); f.appendChild(labelEl(label)); f.appendChild(control);
    if (hintTxt) { var hh = el("div", "hint"); hh.textContent = hintTxt; f.appendChild(hh); } return f;
  }
  function input(val, onChange, ph) { var i = el("input"); i.type = "text"; i.value = val == null ? "" : val; if (ph) i.placeholder = ph; i.addEventListener("input", function () { onChange(i.value); }); return i; }
  function textarea(val, onChange) { var t = el("textarea"); t.value = val == null ? "" : val; t.addEventListener("input", function () { onChange(t.value); }); return t; }
  function select2(opts, val, onChange) { return select2pairs(opts.map(function (o) { return [o, o]; }), val, onChange); }
  function select2pairs(pairs, val, onChange) {
    var s = el("select"); pairs.forEach(function (p) { var o = el("option"); o.value = p[0]; o.textContent = p[1]; if (String(p[0]) === String(val)) o.selected = true; s.appendChild(o); });
    s.addEventListener("change", function () { onChange(s.value); }); return s;
  }
  function colPicker(cols, val, onChange, allowEmpty) {
    var pairs = (allowEmpty ? [["", "(none)"]] : []).concat((cols || []).map(function (c) { return [c, c]; }));
    if (val && cols.indexOf(val) < 0) pairs.push([val, val + " (missing)"]);
    return select2pairs(pairs, val || "", onChange);
  }
  function daPicker(val, onChange, allowEmpty) {
    var pairs = (S.spec.cda.dataAccesses || []).map(function (d) { return [d.id, d.id]; });
    return select2pairs((allowEmpty ? [["", "(none)"]] : []).concat(pairs), val || "", onChange);
  }
  function fmtPicker(val, onChange) { return select2pairs(Studio.FORMATS.map(function (f) { return [f.id, f.label]; }), val, onChange); }
  // Z8 follow-up: inline visual setting hints — a tiny SVG glyph + tooltip next to a
  // boolean option's label, so the dense per-type inspector is self-explanatory without
  // reading a chart's own docs entry. Keyed by option `key` (regex) rather than per chart
  // type: the sort/legend/smooth/dots option families repeat verbatim across a dozen+
  // chart types (see Z8 slice log in STATUS.md), so one small map covers most of the
  // dense inspector in one pass instead of hand-authoring 51 bespoke thumbnails.
  var OPT_HINTS = [
    { test: /^sort/i,                        icon: "sort-desc", tip: "Reorders items largest-value-first instead of the query's original row order." },
    { test: /^showLegend$/,                  icon: "legend",    tip: "Shows a small key mapping each color/series to its label." },
    { test: /^smooth$/,                      icon: "curve",     tip: "Draws curved (cubic-bezier) segments between points instead of straight lines." },
    { test: /^showDots$/,                    icon: "dots",      tip: "Shows a small marker dot at every data point along the line." },
    { test: /^showValues$/,                  icon: "tag",       tip: "Shows the number directly on the chart (bar/segment/point), not just in the hover tooltip." },
    { test: /^showLabels$/,                  icon: "tag",       tip: "Shows a text label directly on each element, not just in the hover tooltip." },
    { test: /^showPct$/,                     icon: "percent",   tip: "Shows the figure as a percentage (of the total, or conversion rate) rather than its raw value." },
    { test: /^rotate$/,                      icon: "rotate-text", tip: "Tilts the axis labels diagonally so long category names fit without overlapping." },
    { test: /^(trend|showTrend)$/,           icon: "trend-up",  tip: "Draws a straight regression/forecast line through the data, showing its overall direction." },
    { test: /^grandTotal$/,                  icon: "sigma",     tip: "Adds a bold summary row at the bottom, totalling every numeric column over the visible rows." },
    { test: /^(area|fill)$/,                 icon: "area-fill", tip: "Fills the shape with a soft color instead of drawing only its outline." },
    { test: /^showMA$/,                      icon: "moving-avg", tip: "Overlays a smoothed moving-average line to reveal the underlying trend beneath the noisy raw series." },
    { test: /^freezeHeader$/,                icon: "freeze-header", tip: "Keeps the header row pinned in place at the top while the table body scrolls underneath it." },
    { test: /^showTotal$/,                   icon: "total-bar", tip: "Adds a bold final bar showing the running total across all the incremental steps." },
    { test: /^showVals$/,                    icon: "tag",       tip: "Prints each cell's number directly in the grid, not just in the hover tooltip." },
    { test: /^showRankNumbers$/,             icon: "tag",       tip: "Prints the numeric rank inside every dot instead of leaving the dots blank." },
    { test: /^horizontal$/,                  icon: "swap-axis", tip: "Draws it sideways (horizontal) instead of the default vertical orientation." },
    { test: /^showBox$/,                     icon: "iqr-box",   tip: "Overlays a mini box-and-whisker (quartile range) on top of the density shape." },
    { test: /^showRef$/,                     icon: "ref-line",  tip: "Draws a dashed reference line at the classic 80% cumulative threshold." },
    { test: /^showCenter$/,                  icon: "center-line", tip: "Draws a bold center line (e.g. the midpoint) through the middle of the shaded band." }
  ];
  function optHint(key) {
    for (var i = 0; i < OPT_HINTS.length; i++) if (OPT_HINTS[i].test.test(key)) return OPT_HINTS[i];
    return null;
  }
  function optField(opts, od) {
    if (od.type === "bool") {
      var lab = el("label", "check"); var cb = el("input"); cb.type = "checkbox"; cb.checked = !!opts[od.key]; cb.onchange = function () { opts[od.key] = cb.checked; refreshPreview(); }; lab.appendChild(cb); lab.appendChild(document.createTextNode(od.label));
      var oh = optHint(od.key);
      if (oh) {
        var hIc = el("span", "opt-hint"); hIc.title = oh.tip; hIc.setAttribute("aria-label", oh.tip); hIc.appendChild(Studio.icon(oh.icon, 12)); lab.appendChild(hIc);
      }
      return lab;
    }
    if (od.type === "fmt") return field(od.label, fmtPicker(opts[od.key] || od.def, function (v) { opts[od.key] = v; refreshPreview(); }));
    if (od.type === "color") return field(od.label, select2(Studio.COLOR_TOKENS, opts[od.key] || od.def, function (v) { opts[od.key] = v; refreshPreview(); }));
    if (od.type === "select") return field(od.label, select2pairs(od.choices, opts[od.key] || od.def, function (v) { opts[od.key] = v; refreshPreview(); }));
    if (od.type === "int") { var i = el("input"); i.type = "number"; i.value = opts[od.key] != null ? opts[od.key] : od.def; i.addEventListener("input", function () { opts[od.key] = +i.value || 0; refreshPreview(); }); return field(od.label, i); }
    // N-FUN "live what-if sliders": a drag-to-animate control for numeric knobs that feed
    // derived series/forecasts (Holt-Winters alpha/beta/gamma, MA window, forecast periods…).
    // Fires refreshPreview() on every 'input' tick (not just change), so the chart redraws
    // live as the slider is dragged — the same "analysis as play" idea the N-FUN backlog asks
    // for, reusing the existing live-preview pipeline with zero new wiring.
    if (od.type === "range") {
      var wrap = el("div", "opt-range");
      var rng = el("input"); rng.type = "range";
      rng.min = od.min != null ? od.min : 0; rng.max = od.max != null ? od.max : 100; rng.step = od.step != null ? od.step : 1;
      var cur = opts[od.key] != null ? opts[od.key] : od.def;
      rng.value = cur;
      var val = el("span", "opt-range-val"); val.textContent = cur + (od.suffix || "");
      rng.addEventListener("input", function () { opts[od.key] = +rng.value; val.textContent = rng.value + (od.suffix || ""); refreshPreview(); });
      wrap.appendChild(rng); wrap.appendChild(val);
      return field(od.label, wrap);
    }
    return field(od.label, input(opts[od.key] != null ? opts[od.key] : od.def, function (v) { opts[od.key] = v; refreshPreview(); }));
  }
  function rowItem(icon, title, sub, onClick, btns, active) {
    var r = el("div", "row-item" + (active ? " active" : ""));
    r.innerHTML = '<span class="ri-icon">' + icon + '</span><span class="ri-txt"><span class="ri-t">' + esc(title) + '</span><span class="ri-s">' + esc(sub) + "</span></span>";
    r.onclick = function (e) { if (e.target.closest(".ri-btns")) return; onClick(); };
    if (btns && btns.length) { var bb = el("span", "ri-btns"); btns.forEach(function (b) { bb.appendChild(b); }); r.appendChild(bb); }
    return r;
  }
  function delBtn(fn) { var b = el("button", "icobtn danger"); b.appendChild(Studio.icon("trash", 14)); b.title = "Delete"; b.onclick = function (e) { e.stopPropagation(); fn(); }; return b; }
  function compareBtn(fn) { var b = el("button", "icobtn"); b.appendChild(Studio.icon("diff", 14)); b.title = "Compare to current"; b.setAttribute("aria-label", "Compare to current"); b.onclick = function (e) { e.stopPropagation(); fn(); }; return b; }
  function moveBtn(t, fn) { var b = el("button", "icobtn"); b.appendChild(Studio.icon(t === "↑" ? "chevron-up" : "chevron-down", 13)); b.title = t === "↑" ? "Move up" : "Move down"; b.onclick = function (e) { e.stopPropagation(); fn(); }; return b; }
  function setIconBtn(btn, iconName, text, sz) { btn.innerHTML = ""; btn.appendChild(Studio.icon(iconName, sz || 14)); btn.appendChild(document.createTextNode(" " + text)); }
  function hint(t) { var h = el("div"); h.style.cssText = "font-size:12px;color:var(--faint);line-height:1.5"; h.textContent = t; return h; }
  function noteEl(cls, t) { var n = el("div", "note " + cls); n.textContent = t; return n; }
  function iconNote(cls, iconName, t) { var n = el("div", "note " + cls); n.style.cssText = "display:flex;align-items:flex-start;gap:6px"; var ic = el("span"); ic.style.flexShrink = "0"; ic.appendChild(Studio.icon(iconName, 14)); n.appendChild(ic); var tx = el("span"); tx.textContent = t; n.appendChild(tx); return n; }
  function swap(arr, i, j) { if (j < 0 || j >= arr.length) return; var t = arr[i]; arr[i] = arr[j]; arr[j] = t; renderInspector(); refreshPreview(); }
  function panelById(id) { return S.spec.panels.filter(function (p) { return p.id === id; })[0]; }
  function renderListsOnly() { if (!S.selection) renderInspector(); }

  function modal(title, build, onClose, wide) {
    var ov = el("div", "modal-ov"); var m = el("div", "modal" + (wide ? " modal-wide" : ""));
    var h = el("div", "modal-h"); h.textContent = title; var x = el("button", "x"); x.type = "button"; x.setAttribute("aria-label", "Close " + title); x.appendChild(Studio.icon("close", 16)); h.appendChild(x);
    var b = el("div", "modal-b"); m.appendChild(h); m.appendChild(b); ov.appendChild(m); document.body.appendChild(ov);
    build(b);
    function close() { ov.remove(); document.removeEventListener("keydown", onKey); if (onClose) onClose(); }
    var FOCUSQ = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    function focusable() { return [].slice.call(m.querySelectorAll(FOCUSQ)).filter(function (e) { return e.offsetParent !== null; }); }
    function onKey(e) {
      if (e.key === "Escape") { e.stopPropagation(); close(); return; }
      if (e.key !== "Tab") return;
      var els = focusable(); if (!els.length) return;
      var first = els[0], last = els[els.length - 1];
      if (e.shiftKey) { if (document.activeElement === first || !m.contains(document.activeElement)) { e.preventDefault(); last.focus(); } }
      else { if (document.activeElement === last || !m.contains(document.activeElement)) { e.preventDefault(); first.focus(); } }
    }
    x.onclick = close;
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    setTimeout(function () { var els = focusable(); if (els.length) els[0].focus(); document.addEventListener("keydown", onKey); }, 50);
  }

  function download(name, text, mime) {
    var blob = new Blob([text], { type: (mime || "text/plain") + ";charset=utf-8" });
    var a = el("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 200);
    toast("Downloaded " + name);
  }
  function fmtBytes(n) { return n >= 1024 ? (n / 1024).toFixed(1) + " KB" : n + " B"; }
  function flashBtn(btn, txt) { var o = btn.innerHTML; btn.innerHTML = ""; btn.appendChild(Studio.icon("check", 12)); btn.appendChild(document.createTextNode(" " + txt)); setTimeout(function () { btn.innerHTML = o; }, 1200); }
  function copyText(text, btn) {
    function fallback() { try { var ta = el("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); flashBtn(btn, "Copied"); } catch (e) { toast("Copy failed", true); } }
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { flashBtn(btn, "Copied"); }, fallback); else fallback(); } catch (e) { fallback(); }
  }
  var _toastT;
  function toast(msg, isErr) { var t = $("#toast"); t.innerHTML = ""; t.appendChild(Studio.icon(isErr ? "warn" : "check", 13)); t.appendChild(document.createTextNode(" " + msg)); t.className = "toast show" + (isErr ? " err" : ""); clearTimeout(_toastT); _toastT = setTimeout(function () { t.className = "toast"; }, 2600); }

  // canvas drag-drop
  function wireCanvas() {
    var stage = $("#canvas-stage");
    ["dragenter", "dragover"].forEach(function (ev) { stage.addEventListener(ev, function (e) { e.preventDefault(); stage.classList.add("dragover"); e.dataTransfer.dropEffect = "copy"; }); });
    ["dragleave", "drop"].forEach(function (ev) { stage.addEventListener(ev, function (e) { if (ev === "dragleave" && e.target !== stage && stage.contains(e.relatedTarget)) return; stage.classList.remove("dragover"); }); });
    stage.addEventListener("drop", function (e) {
      e.preventDefault(); stage.classList.remove("dragover");
      try { var d = JSON.parse(e.dataTransfer.getData("text/plain")); if (d && d.da) { var _da = catalogDA(d.stem, d.da); addFromDA(d.stem, d.da, (_da && chartForDA(_da)) || "bars"); } } catch (x) {}
    });

    // H-track: canvas empty-state overlay — set the icon and wire the Open library button
    var cesIc = $("#cesIc");
    if (cesIc) cesIc.appendChild(Studio.icon("plus", 30));
    var cesBtn = $("#cesLib");
    if (cesBtn) cesBtn.addEventListener("click", function () {
      // On phone, open the library drawer; on desktop, focus the library search field
      if (window.innerWidth <= 640) {
        var t = document.getElementById("tabLib"); if (t) t.click();
      } else {
        var ls = document.getElementById("libSearch"); if (ls) { ls.focus(); ls.select(); }
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () { wireCanvas(); boot(); });
})();
