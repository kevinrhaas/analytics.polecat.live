/* ============================================================================
   chart-thumbnails.js — R5+ slice 1 (studio.js module extraction, tech-debt
   track): the gallery/picker thumbnail SVGs for every chart type, pure data
   with no dependency on app state (Studio.resolveThemeTokens/themedChartSvg
   in studio.js recolor these at render time — that logic stays there since it
   reads live theme state; only the authored-in-classic-hues source data moves).
   Loads before studio.js (app/index.html) and needs no other app/*.js module.
   ============================================================================ */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  Studio.CHART_SVG = {
    bars: '<svg viewBox="0 0 44 30"><rect x="2" y="4" width="30" height="4" rx="1" fill="#005bb5"/><rect x="2" y="11" width="22" height="4" rx="1" fill="#7d3c98"/><rect x="2" y="18" width="34" height="4" rx="1" fill="#2e8bd0"/><rect x="2" y="25" width="15" height="4" rx="1" fill="#00a39a"/></svg>',
    donut: '<svg viewBox="0 0 44 30"><circle cx="22" cy="15" r="10" fill="none" stroke="#e3e8f0" stroke-width="5"/><circle cx="22" cy="15" r="10" fill="none" stroke="#005bb5" stroke-width="5" stroke-dasharray="34 29" transform="rotate(-90 22 15)"/><circle cx="22" cy="15" r="10" fill="none" stroke="#7d3c98" stroke-width="5" stroke-dasharray="16 47" stroke-dashoffset="-34" transform="rotate(-90 22 15)"/></svg>',
    line: '<svg viewBox="0 0 44 30"><path d="M3 24 L13 14 L23 18 L33 6 L41 10 L41 28 L3 28 Z" fill="#005bb5" opacity=".16"/><path d="M3 24 L13 14 L23 18 L33 6 L41 10" fill="none" stroke="#005bb5" stroke-width="2" stroke-linejoin="round"/></svg>',
    stacked: '<svg viewBox="0 0 44 30"><rect x="5" y="14" width="8" height="14" fill="#005bb5"/><rect x="5" y="6" width="8" height="8" fill="#7d3c98"/><rect x="18" y="10" width="8" height="18" fill="#005bb5"/><rect x="18" y="4" width="8" height="6" fill="#7d3c98"/><rect x="31" y="16" width="8" height="12" fill="#005bb5"/><rect x="31" y="9" width="8" height="7" fill="#7d3c98"/></svg>',
    areaStacked: '<svg viewBox="0 0 44 30"><path d="M3 26 L13 21 L23 24 L33 17 L41 20 L41 28 L3 28 Z" fill="#005bb5" opacity=".55"/><path d="M3 20 L13 13 L23 17 L33 8 L41 12 L41 20 L33 17 L23 24 L13 21 L3 26 Z" fill="#7d3c98" opacity=".6"/></svg>',
    choropleth: '<svg viewBox="0 0 44 30"><path d="M4 6 L16 4 L18 12 L10 15 L5 12 Z" fill="#1f9d57" opacity=".85"/><path d="M16 4 L30 5 L29 14 L18 12 Z" fill="#1f9d57" opacity=".45"/><path d="M30 5 L40 8 L38 18 L29 14 Z" fill="#1f9d57" opacity=".65"/><path d="M10 15 L18 12 L29 14 L27 24 L12 25 Z" fill="#1f9d57" opacity=".3"/><path d="M29 14 L38 18 L35 26 L27 24 Z" fill="#1f9d57" opacity=".95"/></svg>',
    ensembleSeries: '<svg viewBox="0 0 44 30"><polyline points="3,22 13,18 23,20 33,14 41,16" fill="none" stroke="#7d3c98" stroke-width="1" opacity=".45"/><polyline points="3,18 13,22 23,14 33,18 41,10" fill="none" stroke="#0aa" stroke-width="1" opacity=".45"/><polyline points="3,24 13,15 23,17 33,10 41,13" fill="none" stroke="#d6820a" stroke-width="1" opacity=".45"/><polyline points="3,21 13,18.5 23,17 33,14 41,13" fill="none" stroke="#16233b" stroke-width="2.6" stroke-linecap="round"/><rect x="7" y="25" width="5" height="5" fill="none" stroke="#d63a5e" stroke-width="1.6"/></svg>',
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
}());
