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
    settings: { deployPath: "/public/pdc-iteration/v2", live: false },
    connections: [], activeConn: null,
    theme: "light"
  };
  window.__STUDIO_STATE = S;               // exposed for tests

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
    sunburst: '<svg viewBox="0 0 44 30"><path d="M22,3 A12,12 0 0,1 29.05,24.71 L24.94,19.04 A5,5 0 0,0 22,10 Z" fill="#005bb5" opacity=".9"/><path d="M29.05,24.71 A12,12 0 0,1 12.29,22.05 L17.96,17.94 A5,5 0 0,0 24.94,19.04 Z" fill="#7d3c98" opacity=".9"/><path d="M12.29,22.05 A12,12 0 0,1 12.29,7.95 L17.96,12.06 A5,5 0 0,0 17.96,17.94 Z" fill="#2e8bd0" opacity=".9"/><path d="M12.29,7.95 A12,12 0 0,1 22,3 L22,10 A5,5 0 0,0 17.96,12.06 Z" fill="#00a39a" opacity=".9"/></svg>',
    bullet: '<svg viewBox="0 0 44 30"><rect x="8" y="3" width="34" height="9" fill="#9aa7b8" opacity=".15"/><rect x="8" y="4.5" width="19" height="6" rx="1" fill="#005bb5"/><line x1="27" y1="1.5" x2="27" y2="13" stroke="#333" stroke-width="2.5" stroke-linecap="round"/><rect x="8" y="18" width="34" height="9" fill="#9aa7b8" opacity=".15"/><rect x="8" y="19.5" width="12" height="6" rx="1" fill="#7d3c98"/><line x1="21" y1="16.5" x2="21" y2="28" stroke="#333" stroke-width="2.5" stroke-linecap="round"/></svg>',
    calHeatmap: '<svg viewBox="0 0 44 30"><rect x="3" y="5" width="4" height="4" rx="1" fill="#005bb5" opacity=".1"/><rect x="9" y="5" width="4" height="4" rx="1" fill="#005bb5" opacity=".15"/><rect x="15" y="5" width="4" height="4" rx="1" fill="#005bb5" opacity=".3"/><rect x="21" y="5" width="4" height="4" rx="1" fill="#005bb5" opacity=".6"/><rect x="27" y="5" width="4" height="4" rx="1" fill="#005bb5" opacity=".4"/><rect x="33" y="5" width="4" height="4" rx="1" fill="#005bb5" opacity=".2"/><rect x="39" y="5" width="4" height="4" rx="1" fill="#005bb5" opacity=".1"/><rect x="3" y="11" width="4" height="4" rx="1" fill="#005bb5" opacity=".15"/><rect x="9" y="11" width="4" height="4" rx="1" fill="#005bb5" opacity=".3"/><rect x="15" y="11" width="4" height="4" rx="1" fill="#005bb5" opacity=".7"/><rect x="21" y="11" width="4" height="4" rx="1" fill="#005bb5" opacity=".9"/><rect x="27" y="11" width="4" height="4" rx="1" fill="#005bb5" opacity=".6"/><rect x="33" y="11" width="4" height="4" rx="1" fill="#005bb5" opacity=".35"/><rect x="39" y="11" width="4" height="4" rx="1" fill="#005bb5" opacity=".2"/><rect x="3" y="17" width="4" height="4" rx="1" fill="#005bb5" opacity=".1"/><rect x="9" y="17" width="4" height="4" rx="1" fill="#005bb5" opacity=".2"/><rect x="15" y="17" width="4" height="4" rx="1" fill="#005bb5" opacity=".5"/><rect x="21" y="17" width="4" height="4" rx="1" fill="#005bb5" opacity=".7"/><rect x="27" y="17" width="4" height="4" rx="1" fill="#005bb5" opacity=".9"/><rect x="33" y="17" width="4" height="4" rx="1" fill="#005bb5" opacity=".4"/><rect x="39" y="17" width="4" height="4" rx="1" fill="#005bb5" opacity=".15"/><rect x="3" y="23" width="4" height="4" rx="1" fill="#005bb5" opacity=".05"/><rect x="9" y="23" width="4" height="4" rx="1" fill="#005bb5" opacity=".1"/><rect x="15" y="23" width="4" height="4" rx="1" fill="#005bb5" opacity=".25"/><rect x="21" y="23" width="4" height="4" rx="1" fill="#005bb5" opacity=".5"/><rect x="27" y="23" width="4" height="4" rx="1" fill="#005bb5" opacity=".3"/><rect x="33" y="23" width="4" height="4" rx="1" fill="#005bb5" opacity=".15"/><rect x="39" y="23" width="4" height="4" rx="1" fill="#005bb5" opacity=".05"/></svg>',
    heatmap: '<svg viewBox="0 0 44 30"><rect x="4" y="4" width="8" height="7" fill="#005bb5" opacity=".9"/><rect x="14" y="4" width="8" height="7" fill="#005bb5" opacity=".4"/><rect x="24" y="4" width="8" height="7" fill="#005bb5" opacity=".7"/><rect x="34" y="4" width="6" height="7" fill="#005bb5" opacity=".25"/><rect x="4" y="13" width="8" height="7" fill="#005bb5" opacity=".5"/><rect x="14" y="13" width="8" height="7" fill="#005bb5" opacity=".85"/><rect x="24" y="13" width="8" height="7" fill="#005bb5" opacity=".3"/><rect x="34" y="13" width="6" height="7" fill="#005bb5" opacity=".6"/><rect x="4" y="22" width="8" height="6" fill="#005bb5" opacity=".35"/><rect x="14" y="22" width="8" height="6" fill="#005bb5" opacity=".55"/><rect x="24" y="22" width="8" height="6" fill="#005bb5" opacity=".9"/><rect x="34" y="22" width="6" height="6" fill="#005bb5" opacity=".45"/></svg>',
    table: '<svg viewBox="0 0 44 30"><rect x="3" y="4" width="38" height="6" rx="1" fill="#005bb5" opacity=".22"/><rect x="3" y="13" width="38" height="3" rx="1" fill="#9aa7b8" opacity=".5"/><rect x="3" y="18" width="38" height="3" rx="1" fill="#9aa7b8" opacity=".5"/><rect x="3" y="23" width="38" height="3" rx="1" fill="#9aa7b8" opacity=".5"/></svg>',
    kpi: '<svg viewBox="0 0 44 30"><rect x="3" y="5" width="38" height="20" rx="3" fill="#005bb5" opacity=".09"/><rect x="3" y="5" width="3" height="20" rx="1.5" fill="#7d3c98"/><text x="11" y="17" font-size="10" font-weight="800" fill="#005bb5" font-family="sans-serif">42K</text><rect x="11" y="20" width="18" height="2.5" rx="1" fill="#9aa7b8"/></svg>'
  };
  window.__studioLoad = function (spec) { S.spec = normalize(spec); S.selection = null; syncHeader(); renderInspector(); refreshPreview(); buildLibrary(); };

  /* ---------- boot ---------- */
  function boot() {
    Promise.all([
      fetchJSON("data/cda-catalog.json"),
      fetchText("vendor/pdc-ui.css"), fetchText("vendor/pdc-ui.js"), fetchText("app/studio-render.js"),
      fetchText("app/studio-charts.js"),
      fetchJSON("data/examples/index.json").catch(function () { return []; })
    ]).then(function (r) {
      S.catalog = r[0];
      S.assets = { css: r[1], js: r[2], render: r[3], charts: r[4] };
      S.examples = r[5] || [];
      wireTopbar();
      try { renderFooter(); } catch (e) { /* footer is non-critical chrome */ }
      setupPanes();
      setupMobileTabs();
      try { setTheme(localStorage.getItem("studio-theme") || "light"); } catch (e) { setTheme("light"); }
      loadConnections();
      if (window.StudioWelcome) { var ab = $("#btnAbout"); if (ab) ab.onclick = function () { StudioWelcome.open(); }; setTimeout(function () { StudioWelcome.maybeShow(); }, 300); }
      buildLibrary();
      // open the cost flagship example by default if present, else blank
      // keepAutosave=true so the restore banner can offer unsaved work from a previous session
      var def = S.examples.filter(function (e) { return /flagship|cost/.test(e.file); })[0] || S.examples[0];
      if (def) loadExample(def.file, true); else { renderInspector(); refreshPreview(); }
      // offer to restore unsaved work (must run after the default example loads so the banner is visible)
      setTimeout(maybeShowRestoreBanner, 600);
    }).catch(function (e) {
      document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif;max-width:640px;margin:auto">' +
        '<h2>Could not load Studio data.</h2><p>The Studio reads JSON + toolkit files over HTTP, so it must be served ' +
        '(not opened via <code>file://</code>). From the repository root run:</p>' +
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
  function fmtStamp(d) {
    try {
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) +
        " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } catch (e) { return d.toISOString().slice(0, 16).replace("T", " "); }
  }
  function renderFooter() {
    var log = window.STUDIO_CHANGELOG || [];
    var stamp = $("#fbStamp");
    // "Last updated": real CI deploy time when present, else the latest entry's date.
    var build = window.STUDIO_BUILD, when = null;
    if (build && build.indexOf("__BUILD") < 0) { var t = new Date(build); if (!isNaN(t)) when = t; }
    if (!when && log[0] && log[0].date) { var d = new Date(log[0].date + "T00:00:00"); if (!isNaN(d)) when = d; }
    if (stamp) {
      if (when && build && build.indexOf("__BUILD") < 0) stamp.textContent = "Last updated " + fmtStamp(when);
      else if (when) stamp.textContent = "Last updated " + when.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
      else stamp.textContent = "";
      if (log[0]) stamp.textContent += "  ·  " + log[0].v;
    }
    // changelog panel — E6: live search
    var pop = $("#changelogPop");
    if (pop) {
      pop.innerHTML = '<div class="cl-head">' +
        '<h4>Changelog</h4>' +
        '<input id="clSearch" type="search" class="cl-search" placeholder="Search…" aria-label="Search changelog">' +
        '<span class="cl-sub">latest first</span></div>' +
        '<div id="clEntries"></div>';
      var clEntries = pop.querySelector("#clEntries");
      function renderClEntries(q) {
        var needle = (q || "").trim().toLowerCase();
        var matched = log.filter(function (e) {
          if (!needle) return true;
          return ((e.v || "") + " " + (e.title || "") + " " + (e.date || "") + " " + (e.items || []).join(" ")).toLowerCase().indexOf(needle) >= 0;
        });
        clEntries.innerHTML = matched.length ? matched.map(function (e) {
          var items = (e.items || []).map(function (x) { return "<li>" + hlq(x, needle) + "</li>"; }).join("");
          return '<div class="cl-entry' + (e === log[0] ? " cl-latest" : "") + '">' +
            '<div class="cl-top"><span class="cl-v">' + hlq(e.v || "", needle) + '</span>' +
            '<span class="cl-title">' + hlq(e.title || "", needle) + '</span>' +
            (e.date ? '<span class="cl-date">' + esc(e.date) + (e.time ? ' · ' + esc(e.time) : '') + '</span>' : "") + '</div>' +
            (items ? "<ul>" + items + "</ul>" : "") + '</div>';
        }).join("") : '<div class="cl-empty">No entries match “' + esc(q) + '”</div>';
      }
      renderClEntries("");
      var clSrch = pop.querySelector("#clSearch");
      if (clSrch) clSrch.addEventListener("input", function () { renderClEntries(clSrch.value); });
    }
    var btn = $("#btnChangelog");
    if (btn && pop) {
      var close = function () { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
      var onDoc = function (ev) { if (!pop.contains(ev.target) && ev.target !== btn && !btn.contains(ev.target)) close(); };
      var onKey = function (ev) { if (ev.key === "Escape") close(); };
      btn.onclick = function () {
        if (pop.hidden) { pop.hidden = false; btn.setAttribute("aria-expanded", "true"); setTimeout(function () { document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey); }, 0); }
        else close();
      };
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
    var acts = el("div", "da-mine-acts");
    var dup = el("button", "icobtn"); dup.appendChild(Studio.icon("duplicate", 14)); dup.title = "Duplicate";
    dup.onclick = function (e) { e.stopPropagation(); duplicateDA(da.id); };
    var del = el("button", "icobtn danger"); del.appendChild(Studio.icon("trash", 14)); del.title = "Delete";
    del.onclick = function (e) { e.stopPropagation(); deleteDA(da.id); };
    acts.appendChild(dup); acts.appendChild(del); c.appendChild(acts);
    if (S.selection && S.selection.kind === "da" && S.selection.id === da.id) c.classList.add("da-mine-sel");
    return c;
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

  /* ---------- data-source builder (author CDA queries) ---------- */
  var DS_TYPES = [
    { kind: "sql", iconName: "db", name: "SQL", desc: "Relational query over a JDBC / JNDI connection", ph: "SELECT region AS region,\n       SUM(amount) AS total\nFROM   sales\nGROUP  BY region\nORDER  BY total DESC" },
    { kind: "mdx", iconName: "cube", name: "MDX / OLAP", desc: "Mondrian cube query (catalog + JNDI)", ph: "SELECT NON EMPTY {[Measures].[Sales]} ON COLUMNS,\n       NON EMPTY {[Markets].Children} ON ROWS\nFROM [SteelWheelsSales]" },
    { kind: "kettle", iconName: "gear", name: "Kettle / PDI", desc: "A .ktr transformation step as a data source", ph: "/public/etl/my-transform.ktr   (step: Output)" },
    { kind: "mql", iconName: "metadata", name: "Metadata", desc: "Pentaho Metadata (MQL) query", ph: "<mql>…</mql>" },
    { kind: "scripting", iconName: "code", name: "Scripting", desc: "Scripted (Kettle/Beanshell) data access", ph: "// return rows…" }
  ];
  function dsType(k) { return DS_TYPES.filter(function (t) { return t.kind === k; })[0] || DS_TYPES[0]; }

  // open the guided builder. existing = {stem, da} to edit, or null to create.
  function dataSourceBuilder(existing) {
    var editing = !!existing;
    var src = editing ? Studio.clone(existing.da) : { id: "", name: "", kind: "sql", jndi: (S.spec.cda.connection && S.spec.cda.connection.jndi) || "PDC-BIDB-EXT", sql: "", query: "", params: [], columns: [], calcColumns: [], cache: true, cacheDuration: 300 };
    src.kind = src.kind || "sql";
    var draft = { stem: editing ? existing.stem : "custom", id: src.id, kind: src.kind, jndi: src.jndi,
      query: src.query || src.sql || "", columns: (src.columns || []).slice(),
      params: (src.params || []).map(function (p) { return { name: p.name, type: p.type || "String", default: p.default || "" }; }),
      calcColumns: (src.calcColumns || []).map(function (c) { return { name: c.name || "", formula: c.formula || "", type: c.type || "Numeric" }; }),
      mdxCatalog: src.mdxCatalog || "", mqlDomain: src.mqlDomain || "",
      ktrPath: src.ktrPath || "", ktrStep: src.ktrStep || "Output",
      scriptLang: src.scriptLang || "javascript" };

    modal(editing ? "Edit data source · " + existing.da.id : "New data source", function (b) {
      var wrap = el("div", "dsb");

      // 1 — type picker cards
      var types = el("div", "dsb-types");
      DS_TYPES.forEach(function (t) {
        var card = el("div", "dsb-type" + (t.kind === draft.kind ? " sel" : ""));
        var icDiv = el("div", "ic"); icDiv.appendChild(Studio.icon(t.iconName, 20));
        var txDiv = el("div", "tx"); txDiv.innerHTML = '<b>' + esc(t.name) + "</b><span>" + esc(t.desc) + "</span>";
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
          var rm = el("button", "rm"); rm.appendChild(Studio.icon("close", 10)); rm.onclick = function () { draft.params.splice(i, 1); renderParams(); };
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
          var rm = el("button", "rm"); rm.appendChild(Studio.icon("close", 10)); rm.onclick = function () { draft.calcColumns.splice(i, 1); renderCalcCols(); };
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

      function renderQSection() {
        qSection.innerHTML = "";
        var k = draft.kind;
        if (k === "kettle") {
          qSection.appendChild(field("Transformation file (.ktr)", input(draft.ktrPath, function (v) { draft.ktrPath = v; }, "/public/etl/my-transform.ktr")));
          qSection.appendChild(field("Output step name", input(draft.ktrStep, function (v) { draft.ktrStep = v; }, "Output")));
          var kh = el("div", "hint"); kh.textContent = "Columns come from the step's output fields — declare them in the Columns section below."; qSection.appendChild(kh);
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
    // remove the previous record (handles id/group rename on edit)
    if (existing) { var oe = S.catalog[existing.stem]; if (oe) oe.dataAccesses = oe.dataAccesses.filter(function (x) { return x.id !== existing.da.id; }); }
    var dup = entry.dataAccesses.filter(function (x) { return x.id === da.id; })[0];
    if (dup && !(existing && existing.stem === stem && existing.da.id === da.id)) { toast("“" + da.id + "” already exists in " + stem + ".", true); return false; }
    entry.dataAccesses = entry.dataAccesses.filter(function (x) { return x.id !== da.id; }).concat([da]);
    buildLibrary();
    var w = document.querySelector('.lib-cda[data-stem="' + stem + '"]'); if (w) w.classList.add("open");
    toast((existing ? "Updated " : "Created ") + stem + " › " + da.id);
    return true;
  }

  function deleteDataSource(stem, daId) {
    var e = S.catalog[stem]; if (!e) return;
    e.dataAccesses = e.dataAccesses.filter(function (x) { return x.id !== daId; });
    if (!e.dataAccesses.length) delete S.catalog[stem];
    buildLibrary(); toast("Removed " + daId);
  }

  /* ---------- selection + inspector ---------- */
  function select(sel) { S.selection = sel; renderInspector(); highlightPreview(); }
  function selectDashboard() { S.selection = null; renderInspector(); highlightPreview(); }

  function renderInspector() {
    var body = $("#inspBody"); body.innerHTML = "";
    $("#inspBack").hidden = !S.selection;
    if (!S.selection) { $("#inspTitle").textContent = "Dashboard"; renderDashboardInspector(body); return; }
    if (S.selection.kind === "panel") { $("#inspTitle").textContent = "Panel"; renderPanelInspector(body); }
    else if (S.selection.kind === "filter") { $("#inspTitle").textContent = "Filter"; renderFilterInspector(body); }
    else if (S.selection.kind === "da") { $("#inspTitle").textContent = "Data Source"; renderDAInspector(body); }
    else { $("#inspTitle").textContent = "KPI tile"; renderKpiInspector(body); }
  }

  function renderDashboardInspector(body) {
    var sp = S.spec;
    // ── checks (live validation) ──
    var issues = Studio.validate(sp);
    var vs = section(body, "Checks");
    if (!issues.length) vs.appendChild(iconNote("ok", "check", "Looks good — ready to export."));
    else issues.forEach(function (x) { vs.appendChild(iconNote(x.level === "error" ? "err" : x.level === "warn" ? "warn" : "info", x.level === "error" ? "close" : x.level === "warn" ? "warn" : "info", x.msg)); });

    var sec = section(body, "Dashboard");
    sec.appendChild(field("Title", input(sp.title, function (v) { sp.title = v; syncHeader(); refreshPreview(); })));
    sec.appendChild(field("File name (stem)", input(sp.name, function (v) { sp.name = v.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-"); syncHeader(); }, "lowercase-with-dashes → " + sp.name + ".html / .cdfde / .cda")));
    sec.appendChild(field("Subtitle", input(sp.subtitle, function (v) { sp.subtitle = v; refreshPreview(); })));
    var grpSel = select2(["Observability", "Governance & Privacy", "Storage & Cost", "Usage & People", "Data Integration", "Executive"], sp.group, function (v) { sp.group = v; syncHeader(); });
    sec.appendChild(field("Group", grpSel));
    sec.appendChild(field("Description", textarea(sp.description, function (v) { sp.description = v; })));
    var gc = select2(["1", "2", "3", "4"], String(sp.gridCols), function (v) { sp.gridCols = +v; refreshPreview(); });
    sec.appendChild(field("Grid columns", gc));

    // KPIs
    var ks = section(body, "KPI tiles", function () { addFromCurrentOrPrompt("kpi"); });
    if (!sp.kpis.length) ks.appendChild(hint("No KPI tiles. Add one from a query in the library, or click ＋."));
    sp.kpis.forEach(function (k, i) {
      ks.appendChild(rowItem("◧", k.label || "(metric)", k.da + " · " + k.valueCol,
        function () { select({ kind: "kpi", index: i }); },
        [moveBtn("↑", function () { swap(sp.kpis, i, i - 1); }), moveBtn("↓", function () { swap(sp.kpis, i, i + 1); }),
         delBtn(function () { sp.kpis.splice(i, 1); selectDashboard(); refreshPreview(); })],
        S.selection && S.selection.kind === "kpi" && S.selection.index === i));
    });

    // Filters
    var fs = section(body, "Filters", function () { addFilter(); });
    if (!sp.filters.length) fs.appendChild(hint("Optional cascading header selects (e.g. Data Source)."));
    sp.filters.forEach(function (f, i) {
      fs.appendChild(rowItem("⛃", f.label, f.da + " · " + f.valueCol, function () { select({ kind: "filter", index: i }); },
        [delBtn(function () { sp.filters.splice(i, 1); selectDashboard(); refreshPreview(); })],
        S.selection && S.selection.kind === "filter" && S.selection.index === i));
    });

    // E4: Shareable deeplink (only when the dashboard has filters)
    if (sp.filters.length) {
      var dlSec = section(body, "Shareable link");
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

    // CDA Connections
    sp.cda.connections = sp.cda.connections || [];
    var conns = sp.cda.connections;
    var cs2 = section(body, "CDA Connections", function () { addCDAConnection(body); });
    if (!conns.length) cs2.appendChild(hint("No custom connections — the default SQL/JNDI pool is used. Add one to use JDBC, MDX, or other types."));
    conns.forEach(function (conn, i) {
      var typeLabel = (Studio.CDA_CONNECTION_TYPES.find(function (t) { return t.id === conn.type; }) || { label: conn.type }).label;
      var detail = conn.jndi || conn.url || conn.connectString || conn.fileName || conn.domainId || "";
      cs2.appendChild(rowItem("⊛", conn.id, typeLabel + (detail ? " · " + detail : ""),
        function () { openConnEditor(conn, body); },
        [delBtn(function () { conns.splice(i, 1); renderDashboardInspector(body); })],
        false));
    });

    // Panels (reorderable)
    var ps = section(body, "Panels (" + sp.panels.length + ")");
    if (!sp.panels.length) ps.appendChild(hint("Drag a query onto the canvas, or use a ＋ chip in the library."));
    sp.panels.forEach(function (p, i) {
      var ic = (Studio.CHARTS[p.chart.type] || {}).icon || "▭";
      ps.appendChild(rowItem(ic, p.title || "(panel)", p.chart.type + " · " + p.chart.da + " · span " + p.span,
        function () { select({ kind: "panel", id: p.id }); },
        [moveBtn("↑", function () { swap(sp.panels, i, i - 1); }), moveBtn("↓", function () { swap(sp.panels, i, i + 1); }),
         delBtn(function () { sp.panels.splice(i, 1); selectDashboard(); refreshPreview(); })],
        S.selection && S.selection.kind === "panel" && S.selection.id === p.id));
    });
  }

  function addCDAConnection(dashBody) {
    var conn = Studio.newCDAConnection("sql.jndi");
    S.spec.cda.connections = S.spec.cda.connections || [];
    S.spec.cda.connections.push(conn);
    openConnEditor(conn, dashBody);
  }

  function openConnEditor(conn, dashBody) {
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
        renderDashboardInspector(document.getElementById("inspBody"));
        b.closest(".modal-ov").remove();
        toast("Connection saved");
      };
      foot.appendChild(save); b.appendChild(foot);
    });
  }

  function renderPanelInspector(body) {
    var p = panelById(S.selection.id); if (!p) { selectDashboard(); return; }
    var sec = section(body, "Panel");
    sec.appendChild(field("Title", input(p.title, function (v) { p.title = v; refreshPreview(); renderListsOnly(); })));
    var spanSel = select2pairs([["1", "1 column"], ["2", "2 columns"], ["3", "3 columns"], ["full", "Full width"]], String(p.span), function (v) { p.span = v === "full" ? "full" : +v; refreshPreview(); });
    sec.appendChild(field("Width (span)", spanSel, "Keys: ↑/↓ reorder · Shift+←/→ resize"));
    sec.appendChild(field("Pill (badge)", input(p.pill, function (v) { p.pill = v; refreshPreview(); })));
    sec.appendChild(field("Sub-label", input(p.sub, function (v) { p.sub = v; refreshPreview(); })));
    sec.appendChild(field("Info tooltip", textarea(p.info, function (v) { p.info = v; refreshPreview(); })));
    sec.appendChild(field("Provenance caption", input(p.src, function (v) { p.src = v; refreshPreview(); })));
    var acts = el("div"); acts.style.cssText = "display:flex;gap:8px;margin-top:2px";
    var dup = el("button", "btn-wide"); setIconBtn(dup, "duplicate", "Duplicate"); dup.onclick = function () { duplicatePanel(p.id); };
    var del = el("button", "btn-wide"); del.style.color = "var(--bad)"; setIconBtn(del, "trash", "Delete"); del.onclick = function () { deletePanel(p.id); };
    acts.appendChild(dup); acts.appendChild(del); sec.appendChild(acts);

    // chart type
    var cs = section(body, "Chart type");
    var grid = el("div", "chart-grid");
    Object.keys(Studio.CHARTS).forEach(function (t) {
      var c = Studio.CHARTS[t], o = el("div", "chart-opt" + (p.chart.type === t ? " sel" : ""));
      o.innerHTML = '<div class="ic">' + (CHART_SVG[t] || c.icon) + '</div><div class="lb">' + c.label + "</div>";
      o.title = c.label;
      o.onclick = function () { changeChartType(p, t); };
      grid.appendChild(o);
    });
    cs.appendChild(grid);

    // data binding
    var ds = section(body, "Data");
    ds.appendChild(field("Query (data access)", daPicker(p.chart.da, function (v) { rebindDA(p, v); })));
    renderMapping(ds, p);
    renderQueryPeek(body, p.chart.da);

    // options
    var optDefs = (Studio.CHARTS[p.chart.type] || {}).opts || [];
    if (optDefs.length) {
      var os = section(body, "Options");
      optDefs.forEach(function (od) { os.appendChild(optField(p.chart.opts, od)); });
    }
    // CDE compatibility note
    if (Studio.cdeUnsupported(p.chart.type)) body.appendChild(noteEl("info", "This chart is CDF-only — the CDE (.cdfde) export will omit it. The CDF (.html) export renders it fully."));
    else if (Studio.cdeFallback(p.chart.type)) body.appendChild(noteEl("info", "CDE export renders this as a bar chart (no native CCC equivalent). CDF (.html) export is exact."));
  }

  function renderQueryPeek(body, daId) {
    var da = Studio.daById(S.spec, daId); if (!da) return;
    var peek = section(body, "Query preview");
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
    }
  }

  function renderMapping(sec, p) {
    var cols = Studio.columnsOf(S.spec, p.chart.da), m = p.chart.map, t = p.chart.type;
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
          var rm = el("button", "icobtn danger"); rm.appendChild(Studio.icon("close", 13)); rm.onclick = function () { m.cols.splice(i, 1); renderInspector(); refreshPreview(); };
          r.appendChild(rm);
          tbl.appendChild(r);
        });
        var add = el("button", "btn-wide"); add.textContent = "＋ Add column";
        add.onclick = function () { (m.cols = m.cols || []).push({ col: cols[0] || "", label: Studio.titleize(cols[0] || ""), num: false }); renderInspector(); refreshPreview(); };
        tbl.appendChild(add);
        sec.appendChild(tbl);
      } else {
        var label = { labelCol: "Label / category column", valueCol: "Value column", xCol: "X column", yCol: "Y column", rCol: "Bubble-size column (optional)", rowCol: "Row column", colCol: "Column column", barCol: "Bar value column", lineCol: "Line value column", sourceCol: "Source column", targetCol: "Target / destination column", groupCol: "Group column (optional)" }[fn] || fn;
        sec.appendChild(field(label, colPicker(cols, m[fn], function (v) { m[fn] = v; refreshPreview(); }, fn === "rCol" || fn === "groupCol")));
      }
    });
  }

  function renderKpiInspector(body) {
    var k = S.spec.kpis[S.selection.index]; if (!k) { selectDashboard(); return; }
    var sec = section(body, "KPI tile");
    sec.appendChild(field("Label", input(k.label, function (v) { k.label = v; refreshPreview(); renderListsOnly(); })));
    sec.appendChild(field("Query (data access)", daPicker(k.da, function (v) {
      var dd = Studio.daById(S.spec, v); k.da = v; if (dd && dd.columns) k.valueCol = dd.columns[0]; renderInspector(); refreshPreview();
    })));
    sec.appendChild(field("Value column", colPicker(Studio.columnsOf(S.spec, k.da), k.valueCol, function (v) { k.valueCol = v; refreshPreview(); })));
    sec.appendChild(field("Format", fmtPicker(k.fmt, function (v) { k.fmt = v; refreshPreview(); })));
    sec.appendChild(field("Color state", select2pairs(Studio.KPI_STATES.map(function (s) { return [s.id, s.label]; }), k.state || "", function (v) { k.state = v; refreshPreview(); })));
    sec.appendChild(field("Info tooltip", textarea(k.info, function (v) { k.info = v; refreshPreview(); })));
    var kacts = el("div"); kacts.style.cssText = "display:flex;gap:8px;margin-top:2px"; var ki = S.selection.index;
    var kdup = el("button", "btn-wide"); setIconBtn(kdup, "duplicate", "Duplicate"); kdup.onclick = function () { duplicateKpi(ki); };
    var kdel = el("button", "btn-wide"); kdel.style.color = "var(--bad)"; setIconBtn(kdel, "trash", "Delete"); kdel.onclick = function () { S.spec.kpis.splice(ki, 1); selectDashboard(); refreshPreview(); };
    kacts.appendChild(kdup); kacts.appendChild(kdel); sec.appendChild(kacts);

    var ts = section(body, "Trend & delta");
    var cols = Studio.columnsOf(S.spec, k.da);
    ts.appendChild(field("Delta text", input(k.deltaText || "", function (v) { k.deltaText = v; refreshPreview(); }, "e.g. 12% vs last quarter")));
    ts.appendChild(field("Delta direction", select2pairs([["up", "▲ Up (good)"], ["down", "▼ Down (bad)"], ["flat", "■ Flat"]], k.deltaDir || "up", function (v) { k.deltaDir = v; refreshPreview(); })));
    ts.appendChild(field("Sparkline column", colPicker(cols, k.sparkCol || "", function (v) { if (v) k.sparkCol = v; else delete k.sparkCol; refreshPreview(); }, true), "a numeric column → a mini trend line on the tile"));
    ts.appendChild(field("Sparkline color", select2pairs([["", "Auto"]].concat(Studio.COLOR_TOKENS.map(function (t) { return [t, t]; })), k.sparkColor || "", function (v) { if (v) k.sparkColor = v; else delete k.sparkColor; refreshPreview(); })));
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
    var sec = section(body, "Data Source");
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
      var qs = section(body, "SQL Query");
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
      var qm = section(body, "MDX Query");
      qm.appendChild(field("Schema catalog path", input(da.mdxCatalog || "", function (v) { da.mdxCatalog = v; }, "/pentaho/etc/mondrian/schema.xml")));
      var ta = el("textarea"); ta.style.cssText = "width:100%;min-height:130px;font-family:var(--mono);font-size:11.5px;resize:vertical;box-sizing:border-box";
      ta.value = da.sql || da.query || ""; ta.placeholder = "SELECT NON EMPTY {[Measures].[Sales]} ON COLUMNS,\n  NON EMPTY {[Markets].Children} ON ROWS\nFROM [SteelWheelsSales]";
      ta.addEventListener("change", function () { da.sql = ta.value; da.query = ta.value; });
      qm.appendChild(ta);
      qm.appendChild(hint("Cube name must match the Mondrian schema; use NON EMPTY to suppress empty cells."));
    } else if (/^kettle/.test(kind)) {
      var qk = section(body, "Kettle / PDI Source");
      qk.appendChild(field(".ktr file path", input(da.ktrPath || "", function (v) { da.ktrPath = v; }, "/public/etl/my-transform.ktr")));
      qk.appendChild(field("Output step name", input(da.ktrStep || "Output", function (v) { da.ktrStep = v; }, "Output")));
      qk.appendChild(hint("Output columns come from the step's output fields — declare them in Columns below."));
    } else if (/^metadata/.test(kind)) {
      var qq = section(body, "Metadata / MQL Query");
      qq.appendChild(field("Domain ID", input(da.mqlDomain || "", function (v) { da.mqlDomain = v; }, "SteelWheels")));
      var ta = el("textarea"); ta.style.cssText = "width:100%;min-height:90px;font-family:var(--mono);font-size:11.5px;resize:vertical;box-sizing:border-box";
      ta.value = da.sql || da.query || ""; ta.placeholder = "<mql>…</mql>";
      ta.addEventListener("change", function () { da.sql = ta.value; da.query = ta.value; });
      qq.appendChild(field("MQL Query (optional)", ta));
    } else if (/^scripting/.test(kind)) {
      var qsc = section(body, "Script");
      var langs = [["javascript","JavaScript"],["beanshell","BeanShell"],["groovy","Groovy"],["python","Python"]];
      qsc.appendChild(field("Language", select2pairs(langs, da.scriptLang || "javascript", function (v) { da.scriptLang = v; })));
      var ta = el("textarea"); ta.style.cssText = "width:100%;min-height:130px;font-family:var(--mono);font-size:11.5px;resize:vertical;box-sizing:border-box";
      ta.value = da.sql || da.query || ""; ta.placeholder = "// return [[row1col1, row1col2], [row2col1, row2col2]]";
      ta.addEventListener("change", function () { da.sql = ta.value; da.query = ta.value; });
      qsc.appendChild(ta);
      qsc.appendChild(hint("Return rows as a list of arrays; column count must match Output columns."));
    }

    // Output columns
    var cs = section(body, "Output columns", function () {
      da.columns = da.columns || []; da.columns.push("col" + (da.columns.length + 1)); renderInspector();
    });
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

    // Calculated columns
    da.calcColumns = da.calcColumns || [];
    var ccs = section(body, "Calculated columns", function () {
      da.calcColumns.push(Studio.newCalcCol()); renderInspector();
    });
    if (!da.calcColumns.length) ccs.appendChild(hint("Add formula-based columns derived from output. Formula syntax: =[col1] + [col2]"));
    da.calcColumns.forEach(function (cc, i) {
      var r = el("div", "field row");
      var nm = input(cc.name, function (v) { cc.name = v.trim().replace(/[^a-zA-Z0-9_]+/g, "_"); }); nm.placeholder = "col_name";
      var fm = input(cc.formula, function (v) { cc.formula = v; }); fm.placeholder = "=[col1] + [col2]";
      var calcTypePairs = Studio.COLUMN_TYPES.map(function (t) { return [t, t]; });
      var ty = select2pairs(calcTypePairs, cc.type || "Numeric", function (v) { cc.type = v; });
      var rm = delBtn(function () { da.calcColumns.splice(i, 1); renderInspector(); });
      var d1 = el("div"); d1.style.flex = "1.5"; d1.appendChild(labelEl("Name")); d1.appendChild(nm);
      var d2 = el("div"); d2.style.flex = "2"; d2.appendChild(labelEl("Formula")); d2.appendChild(fm);
      var d3 = el("div"); d3.appendChild(labelEl("Type")); d3.appendChild(ty);
      r.appendChild(d1); r.appendChild(d2); r.appendChild(d3); r.appendChild(rm); ccs.appendChild(r);
    });

    // Output options — post-query filter / sort / limit
    da.outputOptions = da.outputOptions || { filters: [], sortBy: [], limit: 0 };
    var oo = da.outputOptions;
    var ooSec = section(body, "Output options");
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
    var liveBtn = null;
    if (ac) {
      liveBtn = el("button", "btn"); setIconBtn(liveBtn, "play", "Run live"); liveBtn.title = "Query live from " + ac.name;
      toolbar.appendChild(liveBtn);
    }
    toolbar.appendChild(copyBtn);
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

      if (totalPages > 1) {
        pagination.style.display = "";
        pageLabel.textContent = (state.page + 1) + " / " + totalPages;
        prevBtn.disabled = state.page === 0;
        nextBtn.disabled = state.page >= totalPages - 1;
      }
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
    var sec = section(body, "Filter");
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
    var opts = { deployPath: S.settings.deployPath, preview: true, mock: Studio.genMock(S.spec), launcher: false };
    if (S.settings.live) { var ac = activeConnection(); if (ac) { opts.liveBase = Studio.PentahoClient(ac).base(); opts.mock = {}; } }
    var html = Studio.buildHtml(S.spec, S.assets, opts);
    ifr.onload = function () {
      postToPreview({ type: "theme", value: S.theme });
      highlightPreview();
      var n = (S.spec.panels || []).length, k = (S.spec.kpis || []).length;
      $("#previewStatus").textContent = n + " panel" + (n === 1 ? "" : "s") + (k ? " · " + k + " KPI" + (k === 1 ? "" : "s") : "") +
        (S.settings.live ? " · LIVE" : " · sample data");
    };
    ifr.srcdoc = html;
    snapshot();
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
  var _asTimer = null;
  function scheduleAutosave() {
    clearTimeout(_asTimer);
    _asTimer = setTimeout(function () {
      try { localStorage.setItem("studio-autosave", JSON.stringify(S.spec)); } catch (e) {}
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
    var LABELS = { cdf: "CDF .html", cde: "CDE files", cda: "CDA .cda", all: "All artifacts" };
    _exportHistory.forEach(function (h) {
      var btn = el("button", "eh-row");
      btn.innerHTML = '<span class="eh-kind">' + esc(LABELS[h.kind] || h.kind) + '</span><span class="eh-name">' + esc(h.name) + '</span><span class="eh-ts">' + timeAgo(h.ts) + '</span>';
      btn.onclick = function () { doExport(h.kind); closeMenus(); };
      wrap.appendChild(btn);
    });
  }

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
    banner.innerHTML = '<span class="rb-msg">Restore unsaved work on <strong>' + esc(saved.title || saved.name) + '</strong>?' + rSumHtml + '</span>';
    var yes = el("button", "btn btn-primary"); yes.textContent = "Restore"; banner.appendChild(yes);
    var no = el("button", "btn"); no.textContent = "Dismiss"; banner.appendChild(no);
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
  }
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

  /* ---------- examples / open / save ---------- */
  // build a starter dashboard from a catalog query set (instant, editable)
  function chartForDA(da) {
    var cols = da.columns || []; if (cols.length < 2) return null;
    var id = (da.id || "").toLowerCase();
    if (cols.some(function (c) { return /month|^ym$|ymn|date|day|period/.test(c.toLowerCase()); })) return "line";
    if (/mix|share|donut|split|sens|status|coverage|ratio/.test(id)) return "donut";
    return "bars";
  }
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
    ["schema", "id", "name", "title", "subtitle", "group", "description"].forEach(function (k) { if (spec[k] != null) base[k] = spec[k]; });
    base.cda = spec.cda || base.cda;
    base.filters = spec.filters || []; base.kpis = spec.kpis || [];
    base.gridCols = spec.gridCols || 3; base.panels = (spec.panels || []).map(function (p) { if (!p.id) p.id = Studio.uid("p"); return p; });
    if (!base.id) base.id = Studio.uid("dash");
    return base;
  }

  function showShortcuts() {
    modal("Keyboard shortcuts", function (b) {
      var rows = [
        ["Ctrl / ⌘  +  Z", "Undo"],
        ["Ctrl / ⌘  +  Shift+Z", "Redo"],
        ["Ctrl / ⌘  +  D", "Duplicate selected panel or KPI"],
        ["Ctrl / ⌘  +  S", "Save spec as .studio.json"],
        ["↑ / ↓   (panel selected)", "Reorder panel up / down"],
        ["Shift + ← / →   (panel selected)", "Decrease / increase panel span"],
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

  function wireTopbar() {
    $("#dashTitle").addEventListener("input", function () { S.spec.title = this.value; syncHeader(); refreshPreview(); });
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
    $("#libSearch").addEventListener("input", buildLibrary);
    var ndsBtn = $("#btnNewDS"); setIconBtn(ndsBtn, "plus", "New source", 12); ndsBtn.onclick = function () { dataSourceBuilder(null); };
    $("#inspBack").onclick = selectDashboard;

    // New menu: blank, or auto-build a starter dashboard from a catalog query set
    var nm = $("#menuNew");
    var stems = Object.keys(S.catalog).filter(function (s) {
      return (S.catalog[s].dataAccesses || []).some(function (d) { return (d.columns || []).length >= 2; });
    }).sort();
    nm.innerHTML = '<button data-new="blank">＋ Blank dashboard</button><div class="sep"></div>' +
      '<div class="grp">Auto-build from a query set</div>' +
      stems.map(function (s) { return '<button data-stem="' + esc(s) + '">' + esc(s) + "</button>"; }).join("");
    $$("button", nm).forEach(function (b) {
      b.onclick = function () {
        if (b.getAttribute("data-new") === "blank") { S.spec = Studio.emptySpec(); S.selection = null; syncHeader(); renderInspector(); refreshPreview(); }
        else scaffoldFromStem(b.getAttribute("data-stem"));
        closeMenus();
      };
    });
    menuToggle($("#btnNew"), nm);

    // examples menu — E5: visual card gallery
    var em = $("#menuExamples");
    em.classList.add("ex-grid");
    var featured = S.examples.filter(function (e) { return e.track === "CDF"; });
    var rest = S.examples.filter(function (e) { return e.track !== "CDF"; });
    function exCard(e) {
      var track = e.track || "CDE";
      var types = (e.types || []).slice(0, 3).map(function (t) {
        return '<span class="ex-chip">' + esc(t) + '</span>';
      }).join("");
      var meta = [];
      if (e.panels) meta.push(e.panels + "P");
      if (e.kpis) meta.push(e.kpis + "K");
      return '<button class="ex-card" data-f="' + esc(e.file) + '">' +
        '<div class="ex-card-top">' +
          '<span class="ex-badge ex-badge-' + track.toLowerCase() + '">' + esc(track) + '</span>' +
          '<span class="ex-card-types">' + types + '</span>' +
        '</div>' +
        '<div class="ex-card-title">' + esc(e.title || e.file) + '</div>' +
        (meta.length ? '<div class="ex-card-meta">' + meta.join(" · ") + '</div>' : "") +
        '</button>';
    }
    em.innerHTML =
      (featured.length ? '<div class="grp">Featured</div><div class="ex-cards ex-cards-1">' + featured.map(exCard).join("") + '</div>' : "") +
      (rest.length ? '<div class="grp">v2 examples</div><div class="ex-cards">' + rest.map(exCard).join("") + '</div>' : "");
    $$("button.ex-card", em).forEach(function (b) { b.onclick = function () { loadExample(b.getAttribute("data-f")); closeMenus(); }; });
    menuToggle($("#btnExamples"), em);

    // export menu
    menuToggle($("#btnExport"), $("#menuExport"));
    $$("#menuExport button").forEach(function (b) { b.onclick = function () { doExport(b.getAttribute("data-exp")); closeMenus(); }; });
    var pushBtn = $("#menuExport button[data-exp='push']"); if (pushBtn) setIconBtn(pushBtn, "upload", "Push to active server…");
    var histWrap = el("div"); histWrap.id = "exportHistWrap"; $("#menuExport").appendChild(histWrap);
    loadExportHistory(); renderExportHistory();

    $("#btnImport").onclick = openSpecFile;
    $("#btnSaveSpec").onclick = function () { clearAutosave(); download(S.spec.name + ".studio.json", JSON.stringify(S.spec, null, 2), "application/json"); };
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

    // responsive "⋯ More" menu — mirrors the .btn-secondary actions hidden at ≤900px
    menuToggle($("#btnMore"), $("#menuMore"));
    [["moreAbout","btnAbout"],["moreConn","btnConn"],["moreLive","btnLive"],["moreTheme","btnTheme"]].forEach(function(pair) {
      var tgt = $("#" + pair[0]), src = $("#" + pair[1]);
      if (tgt && src) tgt.onclick = function () { closeMenus(); src.click(); };
    });
    var moreShortcuts = $("#moreShortcuts"); if (moreShortcuts) moreShortcuts.onclick = function () { closeMenus(); showShortcuts(); };

    // E8 — Sign out: clear gate session flag and reload so the passcode is required again
    var moreSignOut = $("#moreSignOut"); if (moreSignOut) moreSignOut.onclick = function () {
      closeMenus();
      try { sessionStorage.removeItem("studio-gate-ok"); } catch (e) {}
      location.reload();
    };

    // E8 — Clear local data: wipe all Studio localStorage with a confirm, then toast
    var moreClearData = $("#moreClearData"); if (moreClearData) moreClearData.onclick = function () {
      closeMenus();
      var keys = [
        "studio-autosave", "studio-export-history", "studio-theme",
        "studio-lw", "studio-rw", "studio-collapse-library", "studio-collapse-inspector",
        "studio-connections", "studio-active-conn", "studio-mob-tab"
      ];
      var msg = "Clear all locally-stored Studio data?\n\nThis will remove:\n" +
        "  • Unsaved spec draft (autosave)\n" +
        "  • Export history\n" +
        "  • Saved server connections\n" +
        "  • Theme, pane widths & layout\n\n" +
        "The page will reload.";
      if (!confirm(msg)) return;
      try { keys.forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
      toast("Local data cleared — reloading…");
      setTimeout(function () { location.reload(); }, 1000);
    };

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
  function closeMenus() { $$(".menu").forEach(function (m) { m.classList.remove("open"); }); }

  function syncHeader() {
    $("#dashTitle").value = S.spec.title; $("#dashName").textContent = S.spec.name; $("#dashGroup").textContent = S.spec.group;
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
    var sp = S.spec, dp = S.settings.deployPath, cde = Studio.exportCDE(sp, dp);
    var files = [[dp + "/" + sp.name + ".cda", Studio.exportCDA(sp), "application/xml"],
      [dp + "/" + sp.name + ".html", Studio.exportCDF(sp, S.assets, dp), "text/html"],
      [dp + "/" + sp.name + ".cdfde", cde.cdfde, "application/json"],
      [dp + "/" + sp.name + ".wcdf", cde.wcdf, "application/xml"]];
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
  function doExport(kind) {
    if (kind === "push") return pushToServer();
    var sp = S.spec, dp = S.settings.deployPath;
    var problems = Studio.validate(sp).filter(function (x) { return x.level === "error"; });
    if (problems.length) { toast(problems[0].msg, true); }
    recordExport(kind, sp.title || sp.name);
    if (kind === "cda") return bundleModal("CDA queries", [{ name: sp.name + ".cda", body: Studio.exportCDA(sp), mime: "application/xml" }]);
    if (kind === "cdf") return bundleModal("CDF dashboard", [{ name: sp.name + ".html", body: Studio.exportCDF(sp, S.assets, dp), mime: "text/html" }]);
    if (kind === "cde") {
      var cde = Studio.exportCDE(sp, dp);
      bundleModal("CDE editor files", [
        { name: sp.name + ".cdfde", body: cde.cdfde, mime: "application/json" },
        { name: sp.name + ".wcdf", body: cde.wcdf, mime: "application/xml" },
        { name: sp.name + ".cda", body: Studio.exportCDA(sp), mime: "application/xml" }
      ], cde.omitted);
    }
    if (kind === "all") {
      var cde2 = Studio.exportCDE(sp, dp);
      bundleModal("All artifacts", [
        { name: sp.name + ".html", body: Studio.exportCDF(sp, S.assets, dp), mime: "text/html" },
        { name: sp.name + ".cdfde", body: cde2.cdfde, mime: "application/json" },
        { name: sp.name + ".wcdf", body: cde2.wcdf, mime: "application/xml" },
        { name: sp.name + ".cda", body: Studio.exportCDA(sp), mime: "application/xml" },
        { name: sp.name + ".studio.json", body: JSON.stringify(sp, null, 2), mime: "application/json" }
      ], cde2.omitted);
    }
  }

  function bundleModal(title, files, omitted) {
    modal(title, function (b) {
      if (omitted && omitted.length) b.appendChild(noteEl("info", "CDF-only panels omitted from CDE: " + omitted.join(", ") + ". They are present in the .html export."));
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

  function toggleLive() {
    modal("Live data / deploy settings", function (b) {
      b.appendChild(noteEl("info", "Exported dashboards always read live data via CDA on the Pentaho server. The deploy path stamps the CDA links in exports. Live preview is best-effort and needs the active connection reachable (CORS / same-origin / login)."));
      var ac = activeConnection();
      b.appendChild(noteEl(ac ? "ok" : "warn", ac ? ("Active server: " + ac.name + " — " + Studio.PentahoClient(ac).base()) : "No active server connection. Add one in ⚙ Servers to preview live."));
      b.appendChild(field("Deploy path (server folder)", input(S.settings.deployPath, function (v) { S.settings.deployPath = v.trim(); })));
      var lab = el("label", "check"); var cb = el("input"); cb.type = "checkbox"; cb.checked = S.settings.live;
      cb.onchange = function () { S.settings.live = cb.checked; }; lab.appendChild(cb); lab.appendChild(document.createTextNode("Use live data (active server) in the preview"));
      b.appendChild(lab);
    }, function () {
      var on = S.settings.live && activeConnection();
      var lb = $("#btnLive"); setIconBtn(lb, on ? "eye" : "refresh", on ? "Live" : "Sample"); lb.classList.toggle("live-on", !!on);
      refreshPreview();
    });
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

  /* ---------- tiny DOM + util helpers ---------- */
  function el(t, c) { var e = document.createElement(t); if (c) e.className = c; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (m) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[m]; }); }
  function labelEl(t) { var l = el("label"); l.textContent = t; return l; }
  function section(parent, title, onAdd) {
    var s = el("div", "insp-sec"); var h = el("h4"); h.textContent = title;
    if (onAdd) { var a = el("button", "add"); a.appendChild(Studio.icon("plus", 12)); a.onclick = onAdd; h.appendChild(a); }
    s.appendChild(h); parent.appendChild(s); return s;
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
  function optField(opts, od) {
    if (od.type === "bool") { var lab = el("label", "check"); var cb = el("input"); cb.type = "checkbox"; cb.checked = !!opts[od.key]; cb.onchange = function () { opts[od.key] = cb.checked; refreshPreview(); }; lab.appendChild(cb); lab.appendChild(document.createTextNode(od.label)); return lab; }
    if (od.type === "fmt") return field(od.label, fmtPicker(opts[od.key] || od.def, function (v) { opts[od.key] = v; refreshPreview(); }));
    if (od.type === "color") return field(od.label, select2(Studio.COLOR_TOKENS, opts[od.key] || od.def, function (v) { opts[od.key] = v; refreshPreview(); }));
    if (od.type === "int") { var i = el("input"); i.type = "number"; i.value = opts[od.key] != null ? opts[od.key] : od.def; i.addEventListener("input", function () { opts[od.key] = +i.value || 0; refreshPreview(); }); return field(od.label, i); }
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
  function moveBtn(t, fn) { var b = el("button", "icobtn"); b.appendChild(Studio.icon(t === "↑" ? "chevron-up" : "chevron-down", 13)); b.title = t === "↑" ? "Move up" : "Move down"; b.onclick = function (e) { e.stopPropagation(); fn(); }; return b; }
  function setIconBtn(btn, iconName, text, sz) { btn.innerHTML = ""; btn.appendChild(Studio.icon(iconName, sz || 14)); btn.appendChild(document.createTextNode(" " + text)); }
  function hint(t) { var h = el("div"); h.style.cssText = "font-size:12px;color:var(--faint);line-height:1.5"; h.textContent = t; return h; }
  function noteEl(cls, t) { var n = el("div", "note " + cls); n.textContent = t; return n; }
  function iconNote(cls, iconName, t) { var n = el("div", "note " + cls); n.style.cssText = "display:flex;align-items:flex-start;gap:6px"; var ic = el("span"); ic.style.flexShrink = "0"; ic.appendChild(Studio.icon(iconName, 14)); n.appendChild(ic); var tx = el("span"); tx.textContent = t; n.appendChild(tx); return n; }
  function swap(arr, i, j) { if (j < 0 || j >= arr.length) return; var t = arr[i]; arr[i] = arr[j]; arr[j] = t; renderInspector(); refreshPreview(); }
  function panelById(id) { return S.spec.panels.filter(function (p) { return p.id === id; })[0]; }
  function renderListsOnly() { if (!S.selection) renderInspector(); }

  function modal(title, build, onClose) {
    var ov = el("div", "modal-ov"); var m = el("div", "modal");
    var h = el("div", "modal-h"); h.textContent = title; var x = el("button", "x"); x.appendChild(Studio.icon("close", 16)); h.appendChild(x);
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
      try { var d = JSON.parse(e.dataTransfer.getData("text/plain")); if (d && d.da) addFromDA(d.stem, d.da, "bars"); } catch (x) {}
    });
  }

  document.addEventListener("DOMContentLoaded", function () { wireCanvas(); boot(); });
})();
