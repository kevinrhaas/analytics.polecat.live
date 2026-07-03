/* Studio.icon(name[, size]) — inline SVG icon helper.
   All icons use stroke:currentColor, fill:none, 1.5px stroke so they
   inherit color automatically (dark mode works for free).
   ViewBox is always 0 0 24 24. Default render size is 16px.
   Usage: el.appendChild(Studio.icon("edit")); */
(function () {
  // Each entry is the inner SVG path(s) string.
  var PATHS = {
    edit:      '<path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536M9 11l6.768-6.768a2.5 2.5 0 0 1 3.536 3.536L12.536 14.5 8 16l1.5-4.5z"/>',
    trash:     '<polyline points="3 6 5 6 21 6" stroke-linecap="round" stroke-linejoin="round"/><path stroke-linecap="round" stroke-linejoin="round" d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    duplicate: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke-linecap="round" stroke-linejoin="round"/>',
    close:     '<line x1="18" y1="6" x2="6" y2="18" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke-linecap="round"/>',
    plus:      '<line x1="12" y1="5" x2="12" y2="19" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke-linecap="round"/>',
    info:      '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12" stroke-linecap="round"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/>',
    clock:     '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14" stroke-linecap="round" stroke-linejoin="round"/>',
    moon:      '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke-linecap="round" stroke-linejoin="round"/>',
    sun:       '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3" stroke-linecap="round"/><line x1="12" y1="21" x2="12" y2="23" stroke-linecap="round"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke-linecap="round"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke-linecap="round"/><line x1="1" y1="12" x2="3" y2="12" stroke-linecap="round"/><line x1="21" y1="12" x2="23" y2="12" stroke-linecap="round"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke-linecap="round"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke-linecap="round"/>',
    gear:      '<circle cx="12" cy="12" r="3"/><path stroke-linecap="round" stroke-linejoin="round" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    undo:      '<path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a7 7 0 1 1 0 14H3"/><polyline points="7 6 3 10 7 14" stroke-linecap="round" stroke-linejoin="round"/>',
    redo:      '<path stroke-linecap="round" stroke-linejoin="round" d="M21 10H11A7 7 0 1 0 11 24h10"/><polyline points="17 6 21 10 17 14" stroke-linecap="round" stroke-linejoin="round"/>',
    refresh:   '<polyline points="23 4 23 10 17 10" stroke-linecap="round" stroke-linejoin="round"/><path stroke-linecap="round" stroke-linejoin="round" d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
    "chevron-left":  '<polyline points="15 18 9 12 15 6" stroke-linecap="round" stroke-linejoin="round"/>',
    "chevron-right": '<polyline points="9 18 15 12 9 6" stroke-linecap="round" stroke-linejoin="round"/>',
    "chevron-up":    '<polyline points="18 15 12 9 6 15" stroke-linecap="round" stroke-linejoin="round"/>',
    "chevron-down":  '<polyline points="6 9 12 15 18 9" stroke-linecap="round" stroke-linejoin="round"/>',
    grip:      '<circle cx="9" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1" fill="currentColor" stroke="none"/>',
    check:     '<polyline points="20 6 9 17 4 12" stroke-linecap="round" stroke-linejoin="round"/>',
    warn:      '<path stroke-linecap="round" stroke-linejoin="round" d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13" stroke-linecap="round"/><line x1="12" y1="17" x2="12.01" y2="17" stroke-linecap="round"/>',
    db:        '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 12a9 3 0 0 0 18 0" stroke-linecap="round"/>',
    cube:      '<path stroke-linecap="round" stroke-linejoin="round" d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="22.08" x2="12" y2="12" stroke-linecap="round"/>',
    join:      '<circle cx="7" cy="12" r="5"/><circle cx="17" cy="12" r="5"/>',
    play:      '<polygon points="5 3 19 12 5 21 5 3" stroke-linecap="round" stroke-linejoin="round"/>',
    copy:      '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke-linecap="round" stroke-linejoin="round"/>',
    upload:    '<polyline points="16 16 12 12 8 16" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="12" x2="12" y2="21" stroke-linecap="round"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" stroke-linecap="round" stroke-linejoin="round"/>',
    download:  '<polyline points="8 17 12 21 16 17" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="12" x2="12" y2="21" stroke-linecap="round"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29" stroke-linecap="round" stroke-linejoin="round"/>',
    link:      '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke-linecap="round" stroke-linejoin="round"/>',
    eye:       '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke-linecap="round"/>',
    code:      '<polyline points="16 18 22 12 16 6" stroke-linecap="round" stroke-linejoin="round"/><polyline points="8 6 2 12 8 18" stroke-linecap="round" stroke-linejoin="round"/>',
    metadata:  '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke-linecap="round" stroke-linejoin="round"/><polyline points="9 22 9 12 15 12 15 22" stroke-linecap="round" stroke-linejoin="round"/>',
    home:      '<path d="M3 11l9-8 9 8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" stroke-linecap="round" stroke-linejoin="round"/>',
    layers:    '<polygon points="12 2 2 7 12 12 22 7 12 2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="2 17 12 22 22 17" stroke-linecap="round" stroke-linejoin="round"/><polyline points="2 12 12 17 22 12" stroke-linecap="round" stroke-linejoin="round"/>',
    grid:      '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    star:      '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke-linecap="round" stroke-linejoin="round"/>',
    search:    '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65" stroke-linecap="round"/>',
    palette:   '<path stroke-linecap="round" stroke-linejoin="round" d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.4-.3-.4-.5-.9-.5-1.4 0-1.1.9-2 2-2h2.3a3.2 3.2 0 0 0 3.2-3.2C20.5 6.8 16.7 2 12 2z"/><circle cx="7" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="7.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="14.5" cy="7" r="1.3" fill="currentColor" stroke="none"/><circle cx="17" cy="11" r="1.3" fill="currentColor" stroke="none"/>',
    // Z14 slice 4 (connector-gallery polish): distinct marks for the two browser-native
    // connectors so they read as their own thing in the type-card grid, not a generic "db"
    // cylinder like the server-backed SQL/MDX/etc. cards. Kept in the same monoline style
    // (no brand logos/colour — just a friendly nod: a rubber duck for DuckDB, a database
    // tucked inside a single file for SQLite's "it's just a file" model).
    duckdb:    '<circle cx="9.5" cy="14.5" r="6"/><circle cx="7.5" cy="7" r="4"/><path d="M4 6.3c-1.2-.4-2.4.1-2.8 1.1-.3.9.2 1.4 1 1.4.9 0 1.9-.6 2.4-1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.5" cy="6" r="0.5" fill="currentColor" stroke="none"/>',
    sqlite:    '<path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" stroke-linecap="round" stroke-linejoin="round"/><polyline points="14 2 14 7 19 7" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="11" cy="13.3" rx="4" ry="1.6"/><path d="M7 13.3v3.6a4 1.6 0 0 0 8 0v-3.6" stroke-linecap="round" stroke-linejoin="round"/>',
    // Z8 follow-up: tiny inline "what this toggle does" glyphs, shared by the OPT_HINTS map
    // in studio.js — reused across every chart type that exposes the matching option key
    // (sort/legend/smooth/dots families repeat across a dozen+ chart types).
    "sort-desc": '<rect x="3" y="4" width="18" height="3.4" rx="1" fill="currentColor" stroke="none"/><rect x="3" y="10.3" width="12" height="3.4" rx="1" fill="currentColor" stroke="none"/><rect x="3" y="16.6" width="6" height="3.4" rx="1" fill="currentColor" stroke="none"/>',
    legend:    '<rect x="3" y="6" width="4" height="4" rx="1" fill="currentColor" stroke="none"/><line x1="10" y1="8" x2="21" y2="8" stroke-linecap="round"/><rect x="3" y="15" width="4" height="4" rx="1" fill="currentColor" stroke="none"/><line x1="10" y1="17" x2="21" y2="17" stroke-linecap="round"/>',
    curve:     '<path d="M2 16c3-8 7-8 10 0s7 8 10 0" stroke-linecap="round" stroke-linejoin="round"/>',
    dots:      '<circle cx="5" cy="15" r="2" fill="currentColor" stroke="none"/><circle cx="12" cy="8" r="2" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="2" fill="currentColor" stroke="none"/>',
    tag:       '<path stroke-linecap="round" stroke-linejoin="round" d="M3 12l9-9h7a2 2 0 0 1 2 2v7l-9 9a2 2 0 0 1-2.83 0l-6.17-6.17a2 2 0 0 1 0-2.83z"/><circle cx="15" cy="9" r="1.4" fill="currentColor" stroke="none"/>',
    percent:   '<line x1="19" y1="5" x2="5" y2="19" stroke-linecap="round"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>'
  };

  Studio.icon = function (name, size) {
    var sz = size || 16;
    var paths = PATHS[name] || PATHS.info;
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", sz);
    svg.setAttribute("height", sz);
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.style.display = "inline-block";
    svg.style.verticalAlign = "middle";
    svg.style.flexShrink = "0";
    svg.innerHTML = paths;
    return svg;
  };

  // Expose PATHS for testing
  Studio._iconPaths = PATHS;
})();
