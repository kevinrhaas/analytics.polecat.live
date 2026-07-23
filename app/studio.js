/* ============================================================================
   studio.js — the Analytics (PDC Studio) controller.
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
    settings: { deployPath: deployPathPref() },
    connections: [], activeConn: null,
    theme: "light",
    simpleMode: false,
    demoMode: false,
    studioOrigin: "dashboards"             // LF27(b): section Close returns to; captured by enterStudio()
  };
  window.__STUDIO_STATE = S;               // exposed for tests
  window.__demoMode = false;               // test hook — mirrors S.demoMode

  // H-track v117: Demo mode — interval handle + tick counter for data variation
  var _demoInterval = null;
  var _demoTick = 0;

  // R1 (tech-debt sweep): shared load/save helpers for the many small JSON blobs this file
  // keeps in localStorage (collapsed-section state, freshness maps, notes, presets, …) — each
  // used to hand-roll its own try/JSON.parse/catch pair. A missing key, a quota error, and
  // corrupt JSON all resolve the same way: fall back to `fallback` (returned as-is, no clone).
  function lsGet(key, fallback) {
    var v;
    try { v = localStorage.getItem(key); } catch (e) { return fallback; }
    if (v == null) return fallback;
    try { var parsed = JSON.parse(v); return parsed == null ? fallback : parsed; } catch (e) { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* quota or private-mode */ }
  }

  // R3 (tech-debt sweep): stylePresets/templateVarSets/customThemePresets each hand-rolled the
  // same list()/saveList()/delete(id) triplet over lsGet/lsSet, differing only in the storage
  // key — this factory backs all three; each still keeps its own add()/apply() (the fields
  // saved/restored genuinely differ per preset kind).
  function makePresetStore(key) {
    var store = {
      list: function () { return lsGet(key, []); },
      saveList: function (list) { lsSet(key, list); },
      remove: function (id) { store.saveList(store.list().filter(function (p) { return p.id !== id; })); }
    };
    return store;
  }

  // R4 (tech-debt sweep): Connections' connLoadViews/connSaveViews and Datasets'
  // dsxLoadViews/dsxSaveViews were identical shape, differing only in which Workspace
  // SETTINGS key they read/write — one factory backs both; each section keeps its own
  // applyView (the filter fields it resets genuinely differ per kind).
  function makeViewsStore(settingsKey) {
    return {
      load: function () { return (Studio.Workspace.settings()[settingsKey] || []).slice(); },
      save: function (list) { Studio.Workspace.setSetting(settingsKey, list); }
    };
  }

  // R4 (tech-debt sweep): toggleConnPin/toggleDsxPin were identical logic (stamp/clear
  // pinned+pinnedAt, save, re-render), differing only in the Workspace table + which
  // render function to call after — one factory backs both.
  function makePinToggle(table, rerender) {
    return function (id) {
      var W = Studio.Workspace, r = W.get(table, id);
      if (!r) return;
      if (r.pinned) { delete r.pinned; delete r.pinnedAt; }
      else { r.pinned = true; r.pinnedAt = new Date().toISOString(); }
      W.put(table, r);
      rerender();
    };
  }

  // R2 (tech-debt sweep): the 4 identical "tell the preview iframe the app theme once it
  // loads" envelopes (compare-dashboards preview, Home's live mini-render, Panel zoom,
  // Slideshow) collapsed onto one helper.
  function postThemeOnLoad(ifr) {
    ifr.onload = function () {
      try { ifr.contentWindow.postMessage({ studio: 1, type: "theme", value: S.theme }, "*"); } catch (e) {}
    };
  }

  // R2 (tech-debt sweep): Panel zoom and Slideshow both build a full-width, KPI/filter-free
  // one-panel spec + its mock render the same way (their own comments said so) — one helper.
  function singlePanelHtml(p) {
    var zp = Studio.clone(p); zp.span = 12;
    var zSpec = Studio.clone(S.spec);
    zSpec.panels = [zp]; zSpec.kpis = []; zSpec.filters = [];
    return Studio.buildHtml(zSpec, S.assets, { deployPath: S.settings.deployPath, preview: true, mock: Studio.genMock(zSpec), launcher: false });
  }

  // inspector section collapse state — keyed by normalized title.
  // Persists across renderInspector() re-renders AND across page reloads (localStorage).
  // This means the user's preferred section layout is remembered between sessions.
  var _LS_COLLAPSED = "studio-insp-collapsed";
  var _collapsedSects = lsGet(_LS_COLLAPSED, {});
  function _saveCollapsedSects() {
    lsSet(_LS_COLLAPSED, _collapsedSects);
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
    kpi: 1, treemap: 1, richtext: 1, choropleth: 1, ensembleSeries: 1
  };

  // R5+ slice 1 (tech-debt: studio.js module extraction) — gallery thumbnails per chart type
  // (static representative SVGs) now live in app/chart-thumbnails.js (Studio.CHART_SVG),
  // the first ES-module app/*.js extraction off this file; recoloring (themedChartSvg below)
  // stays here since it reads live theme state.
  var CHART_SVG = Studio.CHART_SVG;
  // The gallery/thumbnail minis above are authored in the CLASSIC series hues. When the house
  // default dashboard theme is something else (Polecat out of the box), remap the classic
  // series hexes to that theme's validated ramp at render time — one mapping instead of
  // re-authoring ~40 SVGs. Semantic greens/reds (waterfall deltas, candlestick bull/bear,
  // quadrant state tints) are NOT remapped: they encode direction/state, not series identity.
  // 'pareto' is skipped whole: its bars are an ordinal light→dark ramp of one hue, and
  // substituting categorical slots would break that read.
  // The accent a dashboard gets when its Accent color is left on "Theme default" —
  // whatever --pentaho its whole-look theme defines (classic → the original blue).
  function themeDefaultAccent(themeKey, customTheme) {
    var mode = S.theme === "dark" ? "dark" : "light";
    if (themeKey === "custom" && customTheme) return Studio.deriveCustomTheme(customTheme)[mode]["--pentaho"];
    var tk = Studio.resolveThemeTokens(themeKey || "classic", mode);
    return (tk && tk["--pentaho"]) || "#005bb5";
  }
  // N-DESIGN theme studio: live "will this read okay?" hint for the Custom theme editor —
  // no curated, dataviz-skill-validated ramp exists for user-authored colors, so a plain WCAG
  // contrast-ratio check against the background is the honest substitute (advisory, not blocking:
  // same posture as the built-in presets' own legal WARN-band contrast slots).
  function ctContrastHint(seedMode) {
    var ratio = Studio.contrastRatio(seedMode.text, seedMode.bg);
    if (ratio >= 4.5) return "";
    return '<span class="ct-warn">⚠ Text/background contrast is ' + ratio.toFixed(1) + ':1 — below the 4.5:1 WCAG AA minimum for body text.</span>';
  }
  var THEMED_SVG_SKIP = { pareto: 1 };
  function themedChartSvg(svg, type) {
    if (!svg || THEMED_SVG_SKIP[type]) return svg;
    var tk = Studio.resolveThemeTokens(defaultDashboardTheme() || "classic", S.theme === "dark" ? "dark" : "light");
    if (!tk) return svg;
    var map = {
      "#005bb5": tk["--c1"], "#7d3c98": tk["--c3"], "#2e8bd0": tk["--c5"],
      "#00a39a": tk["--c2"], "#e67e22": tk["--c4"], "#9b59b6": tk["--c9"],
      "#8e44ad": tk["--c3"], "#16a085": tk["--c2"], "#1a6fa8": tk["--c5"], "#0e9aa7": tk["--c2"]
    };
    return svg.replace(/#(?:005bb5|7d3c98|2e8bd0|00a39a|e67e22|9b59b6|8e44ad|16a085|1a6fa8|0e9aa7)/gi, function (m) {
      return map[m.toLowerCase()] || m;
    });
  }
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
      // Post-overhaul backlog item 3 follow-up: same lean-bundling pattern, now covering the four
      // credential-based direct connectors (their secrets are redacted at export time — see
      // exporters.js's redactSecrets — and re-collected at open via studio-render.js's PDC.cda).
      fetchText("app/snowflake.js"), fetchText("app/databricks.js"), fetchText("app/bigquery.js"), fetchText("app/genericsql.js"),
      fetchJSON("data/examples/index.json").catch(function () { return []; })
    ]).then(function (r) {
      S.catalog = r[0];
      S.assets = {
        css: r[1], js: r[2], render: r[3], charts: r[4], duckdb: r[5], httpvfs: r[6],
        snowflake: r[7], databricks: r[8], bigquery: r[9], genericsql: r[10]
      };
      S.examples = r[11] || [];
      wireTopbar();
      try { renderFooter(); } catch (e) { /* footer is non-critical chrome */ }
      setupPanes();
      setupMobileTabs();
      try { setTheme(localStorage.getItem("studio-theme") || "light"); } catch (e) { setTheme("light"); }
      try { setAppTheme(localStorage.getItem("studio-app-theme") || "polecat"); } catch (e) {}
      try { if (localStorage.getItem("studio-simple-mode") === "1") { S.simpleMode = true; document.body.classList.add("simple-mode"); } } catch (e) {}
      initAuthBoot();
      // Viridis V5/V6: in Simple mode, with no section chosen yet, boot to the
      // FEATURED CONTENT when there is any (Home renders it live — instant
      // analytics before any machinery), otherwise to the dataset-first
      // Explore designer. A user's own last choice always wins over both.
      try {
        if (S.simpleMode && !localStorage.getItem("studio-shell-section") && window.__studioShellSetSection) {
          var W6 = Studio.Workspace;
          var hasFeatured = W6.all("dashboards").filter(isVisibleToMe).some(function (r) { return r.featured; }) ||
            W6.all("analyses").filter(isVisibleToMe).some(function (a) { return a.pinned; });
          __studioShellSetSection(hasFeatured ? "home" : "explore");
        }
      } catch (e) {}
      applyBranding();
      renderHome();
      renderDashboards();
      renderConnections();
      // keep the Connections list live: any workspace mutation (local edit or a
      // future remote adopt) repaints it
      renderDatasets();
      renderJobs();
      renderExplore();
      renderRepository();
      Studio.Workspace.on("change", function (p) {
        if (p.table === "connections" || p.table === "*") renderConnections();
        if (p.table === "datasets" || p.table === "connections" || p.table === "*") { renderDatasets(); buildLibrary(); }
        if (p.table === "jobs" || p.table === "datasets" || p.table === "*") renderJobs();
        if (p.table === "analyses" || p.table === "datasets" || p.table === "*") renderExplore();
        // Viridis V7: "dashboards" was missing here — a direct put/remove on that
        // table (e.g. Studio.installDemoPack/removeDemoPack) left Home's featured
        // card stale until some OTHER path (toggleFeature, a "*" resync) happened
        // to repaint it. Pinned analyses already triggered a repaint; a featured
        // DASHBOARD deserves the same live-on-Home guarantee.
        // M6 favorites-with-thumbnails: "datasets"/"connections" joined the same
        // guarantee — pinning either from its own catalog row now live-updates the
        // new Home favorites section instead of waiting for an unrelated repaint.
        if (p.table === "analyses" || p.table === "dashboards" || p.table === "datasets" || p.table === "connections" || p.table === "*") { buildLibrary(); renderHome(); }
        if (p.table === "dashboards" || p.table === "*") renderDashboards();
        // M5 slice 1: Repository spans all five object tables, so any of them
        // mutating repaints it.
        if (["connections", "datasets", "dashboards", "analyses", "jobs", "*"].indexOf(p.table) >= 0) renderRepository();
      });
      var connSearchInp = $("#connSearch"); if (connSearchInp) connSearchInp.addEventListener("input", renderConnections);
      var connNewBtn = $("#connNewBtn"); if (connNewBtn) connNewBtn.onclick = function () { openConnectionWizard(); };
      var dsxSearchInp = $("#dsxSearch"); if (dsxSearchInp) dsxSearchInp.addEventListener("input", renderDatasets);
      var dsxNewBtn = $("#dsxNewBtn"); if (dsxNewBtn) dsxNewBtn.onclick = function () { openDatasetEditor(); };
      var jobsNewBtn = $("#jobsNewBtn"); if (jobsNewBtn) jobsNewBtn.onclick = function () { openJobEditor(); };
      var jobsSearchInp = $("#jobsSearch"); if (jobsSearchInp) jobsSearchInp.addEventListener("input", renderJobs);
      var repoAllSearchInp = $("#repoAllSearch"); if (repoAllSearchInp) repoAllSearchInp.addEventListener("input", renderRepository);
      // workspace-backend sync: restore a saved remote, keep the rail dot +
      // Settings card live, and flush any pending mirror write on page close
      Studio.Sync.onSync(function (st) {
        var dot = $("#railSourceDot"), lbl = $("#railSourceLbl"), rs = $("#railSource");
        if (dot) dot.className = "cx-dot " + (st.status === "connected" ? "ok" : st.status === "error" ? "bad" : st.status === "local" ? "" : "busy");
        if (lbl) lbl.textContent = st.sourceId === "local" ? "Local" : st.label;
        if (rs) rs.title = "Workspace backend — " + st.label + (st.lastError ? " · " + st.lastError : "");
        renderWorkspaceBackendCard();
      });
      var railSourceBtn = $("#railSource");
      if (railSourceBtn) railSourceBtn.onclick = function () { if (window.__studioShellSetSection) window.__studioShellSetSection("settings"); };
      Studio.Sync.initSync();
      window.addEventListener("pagehide", function () { try { Studio.Sync.pushNow(); } catch (e) {} });
      renderSettings();
      renderAdmin();
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
        enterStudio();
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
  function esc(s) { return Studio.escapeHtml(s); }
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
    // What's-new feed — opens in the Polecat Shell right panel (app/fleet.js exposes
    // window.PolecatShell). The BODY stays the Studio's own richer feed (E6 live search
    // with <mark> highlighting, Central-time stamps) rather than the shell's generic
    // initWhatsNew list; the shell contributes the container (focus-trapped dialog,
    // Escape/backdrop close, slide-in) and the seen-version contract (unseen dot on
    // the footer button, cleared on open). Built fresh per open — rightPanel removes
    // its DOM on close.
    function buildWhatsNewBody() {
      var pop = document.createElement("div");
      pop.className = "changelog-pop";
      pop.id = "changelogPop";
      pop.innerHTML = '<div class="cl-head">' +
        '<input id="clSearch" type="search" class="cl-search" placeholder="Search…" aria-label="Search changelog">' +
        '<span class="cl-sub">latest first</span></div>' +
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
      return pop;
    }
    var btn = $("#btnChangelog");
    if (btn) {
      var openPanel = null;
      btn.onclick = function () {
        var PS = window.PolecatShell;
        if (!PS) return; // fleet.js module not loaded yet (sub-second boot window)
        if (openPanel) { openPanel.close(); return; } // toggle: second click closes
        btn.setAttribute("aria-expanded", "true");
        openPanel = PS.rightPanel({
          title: "What’s new",
          body: buildWhatsNewBody(),
          onClose: function () { openPanel = null; btn.setAttribute("aria-expanded", "false"); },
        });
        PS.markSeen(PS.SEEN_KEY, window.STUDIO_LATEST_VERSION || (log[0] && log[0].v) || 0);
        PS.clearWhatsNewDot();
      };
    }
  }

  /* ---------- query library ---------- */
  // Sample-content visibility (user ask: "I might want to start with an empty
  // repository"): one pref hides the built-in demo content everywhere it
  // surfaces — the Samples library group, New ▾ auto-build sets, the Examples
  // menu and Home's example gallery. Nothing is deleted; flip it back and the
  // full demo suite (which shows the app's feature breadth against the internal
  // sample database) reinstates itself.
  function showSamples() {
    var v; try { v = localStorage.getItem("studio-show-samples"); } catch (e) {}
    return v !== "0";
  }
  function setShowSamples(on) {
    try { localStorage.setItem("studio-show-samples", on ? "1" : "0"); } catch (e) {}
    // Viridis V7: the Demo packs Settings card is also gated on showSamples(),
    // so it needs the same re-render the other three sample-gated surfaces get.
    buildLibrary(); renderHome(); buildExamplesMenu(); buildNewMenu(); renderSettings(); renderExplore();
  }
  window.__studioShowSamples = { get: showSamples, set: setShowSamples }; // test hook
  // LF2: an example may declare demoPackId (data/examples/index.json) to stay hidden until
  // that demo pack is installed — so pack-specific showcases (Conservation Insight) don't
  // clutter the gallery/Home for everyone, only for workspaces that installed the pack.
  function visibleExamples() {
    return (S.examples || []).filter(function (e) {
      return !e.demoPackId || (Studio.demoPackInstalled && Studio.demoPackInstalled(e.demoPackId));
    });
  }
  var _samplesOpen = false;
  try { _samplesOpen = localStorage.getItem("studio-lib-samples-open") === "1"; } catch (e) {}
  function buildLibrary() {
    var list = $("#libList"), q = ($("#libSearch").value || "").toLowerCase();
    list.innerHTML = "";
    var shownDA = 0;
    if (showSamples()) {
      // The whole demo catalog nests under ONE collapsible "Samples" group so
      // the pane leads with YOUR datasets instead of ~20 sample folders. A
      // search auto-opens it; the open state persists.
      var stems = Object.keys(S.catalog);
      var stemWraps = [];
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
        stemWraps.push(wrap);
      });
      if (stemWraps.length) {
        var sWrap = el("div", "lib-samples" + ((q || _samplesOpen) ? " open" : ""));
        var sh = el("div", "h lib-samples-h");
        sh.innerHTML = '<span class="car">▶</span><span class="nm">Samples</span><span class="badge">' + shownDA + '</span>' +
          '<span class="lib-samples-hint" title="Demo queries against the built-in sample database — every dashboard stays demoable offline. Hide them in Settings if you want a clean workspace.">demo db</span>';
        sh.onclick = function () {
          sWrap.classList.toggle("open");
          _samplesOpen = sWrap.classList.contains("open");
          try { localStorage.setItem("studio-lib-samples-open", _samplesOpen ? "1" : "0"); } catch (e) {}
        };
        sWrap.appendChild(sh);
        var sBox = el("div", "lib-samples-box");
        stemWraps.forEach(function (w) { sBox.appendChild(w); });
        sWrap.appendChild(sBox);
        list.appendChild(sWrap);
      }
      if (q && !shownDA) {
        var empty = el("div", "lib-empty"); empty.textContent = 'No sample queries match "' + esc(q) + '".'; list.appendChild(empty);
      }
    } else {
      var off = el("div", "lib-samples-off");
      off.innerHTML = 'Sample content is hidden. <button type="button" class="lib-samples-show" id="libSamplesShow">Show samples</button>';
      list.appendChild(off);
      var showBtn = $("#libSamplesShow", list);
      if (showBtn) showBtn.onclick = function () { setShowSamples(true); toast("Sample content restored"); };
    }
    // "Analyses" (saved Explore results), then "Workspace datasets" (the shared
    // connections → datasets catalog), then "This dashboard's datasets" — all
    // pinned over the samples (each insertBefore stacks above the previous).
    buildDemoPacksLib(list);
    buildAnalysesLib(list, q);
    buildWorkspaceDatasets(list, q);
    buildMyDataSources(list);
    $("#libCount").textContent = shownDA + " queries";
  }

  // ---------- Demo packs (Viridis V7) — a SECOND sample library, separate
  // from the CDA catalog, of one-click install/remove pitch-specific content
  // (see app/demopacks.js). Hide-samples aware: nests under the same
  // showSamples() toggle as the CDA "Samples" group above it. ----------
  function buildDemoPacksLib(list) {
    if (!showSamples()) return;
    var packs = (Studio.DEMO_PACKS || {});
    var keys = Object.keys(packs);
    if (!keys.length) return;
    var wrap = el("div", "lib-mine lib-demopacks open");
    var h = el("div", "h");
    h.innerHTML = '<span class="car">▶</span><span class="nm">Demo packs</span><span class="badge">' + keys.length + "</span>";
    h.onclick = function () { wrap.classList.toggle("open"); };
    wrap.appendChild(h);
    var box = el("div", "lib-das");
    keys.forEach(function (id) { box.appendChild(demoPackCard(id, packs[id])); });
    wrap.appendChild(box);
    list.insertBefore(wrap, list.firstChild);
  }
  function demoPackCard(id, p) {
    var on = Studio.demoPackInstalled(id);
    var c = el("div", "da");
    c.innerHTML = '<div class="da-top"><div class="da-id">' + esc(p.name) + '</div></div>' +
      '<div class="da-name">' + esc(p.tagline) + '</div>' +
      '<div class="da-add"><span class="chip" data-lib-demopack="' + esc(id) + '">' + (on ? "Remove pack" : "+ Install pack") + '</span>' +
      (on ? '<span class="chip" data-lib-demopack-open="' + esc(id) + '">Open dashboard</span>' : "") + '</div>';
    var installChip = c.querySelector("[data-lib-demopack]");
    installChip.onclick = function (e) { e.stopPropagation(); toggleDemoPack(id, p); };
    var openChip = c.querySelector("[data-lib-demopack-open]");
    if (openChip) openChip.onclick = function (e) {
      e.stopPropagation();
      var row = Studio.Workspace.all("dashboards").filter(function (r) { return r.demoPackId === id; })[0];
      if (row) openRecent(row.id);
    };
    return c;
  }
  function toggleDemoPack(id, p) {
    if (Studio.demoPackInstalled(id)) {
      if (!window.confirm("Remove the “" + (p && p.name || id) + "” demo pack? This deletes its dataset, analyses, and dashboard.")) return;
      Studio.removeDemoPack(id);
      toast("Demo pack removed");
    } else {
      Studio.installDemoPack(id);
      toast("Demo pack installed — see Home, Explore, and Datasets");
    }
    buildLibrary(); renderSettings(); renderHome(); buildExamplesMenu();
  }
  window.__studioToggleDemoPack = toggleDemoPack; // test hook

  /* ---------- Workspace datasets in the library (drag/add like any query) ---------- */
  function buildWorkspaceDatasets(list, q) {
    var all = (window.Studio.Workspace ? Studio.Workspace.all("datasets") : []);
    if (!all.length) return;
    var dss = all.filter(function (d) {
      if (!q) return true;
      return (d.name + " " + (d.sql || d.table || d.collection || "") + " " + (d.columns || []).join(" ") + " " + (d.tags || []).join(" ")).toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); });
    if (!dss.length) return;
    var wrap = el("div", "lib-mine lib-wsds open");
    var h = el("div", "h");
    h.innerHTML = '<span class="car">▶</span><span class="nm">Workspace datasets</span><span class="badge">' + dss.length + "</span>";
    h.onclick = function () { wrap.classList.toggle("open"); };
    wrap.appendChild(h);
    var box = el("div", "lib-das");
    dss.forEach(function (ds) { box.appendChild(wsDatasetCard(ds, q)); });
    wrap.appendChild(box);
    list.insertBefore(wrap, list.firstChild);
  }
  function wsDatasetCard(ds, q) {
    var c = el("div", "da");
    c.draggable = true;
    var conn = Studio.Workspace.get("connections", ds.connectionId);
    var src = conn && Studio.sourceById(conn.adapter);
    var cols = (ds.columns || []).map(function (x) { return '<span class="col">' + hlq(x, q) + "</span>"; }).join("");
    var chips = ["bars", "donut", "line", "treemap", "table"].map(function (t) {
      return '<span class="chip" data-t="' + t + '">+ ' + Studio.CHARTS[t].label + "</span>";
    }).join("") + '<span class="chip" data-t="kpi">+ KPI</span>';
    c.innerHTML = '<div class="da-top"><div class="da-id">' + hlq(ds.name, q) + "</div></div>" +
      '<div class="da-name">' + esc(conn ? conn.name : "no connection") + (src ? " · " + esc(src.label) : "") + "</div>" +
      (cols ? '<div class="da-cols">' + cols + "</div>" : '<div class="da-cols"><span class="col" style="opacity:.6">columns appear after a Preview run</span></div>') +
      '<div class="da-add">' + chips + "</div>";
    $$(".chip", c).forEach(function (chip) {
      chip.onclick = function (e) { e.stopPropagation(); addFromWorkspaceDataset(ds.id, chip.getAttribute("data-t")); };
    });
    c.addEventListener("dragstart", function (e) {
      e.dataTransfer.setData("text/plain", JSON.stringify({ wsDataset: ds.id }));
      e.dataTransfer.effectAllowed = "copy";
    });
    return c;
  }
  // Import a workspace dataset into the spec as a self-contained data access
  // (exports keep working with sample data even if the workspace row is later
  // deleted) that stays LINKED via datasetId + connectionId for live runs.
  // The dataset → data-access conversion, side-effect free (shared by the
  // Studio library path below and the Explore designer, which builds specs of
  // its own). `takenId(id)` lets each caller enforce its own id uniqueness.
  function dsToDA(ds, takenId) {
    var da = Studio.newDA();
    var base = String(ds.name || "dataset").replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "dataset";
    var id = base, n = 2;
    while (takenId && takenId(id)) id = base + "_" + (n++);
    da.id = id; da.name = ds.name || id;
    da.kind = "sql";
    da.sql = ds.sql || ""; da.query = da.sql;
    da.columns = (ds.columns || []).slice();
    if (!da.columns.length && ds.sql && Studio.detectColumns) da.columns = Studio.detectColumns(ds.sql) || [];
    da.params = (ds.params || []).map(function (p) { return { name: p.key, default: p.value || "" }; });
    da.datasetId = ds.id;
    da.connectionId = ds.connectionId;
    da.dataset = { kind: ds.kind || "sql", sql: ds.sql, table: ds.table, query: ds.query, collection: ds.collection, params: ds.params };
    da.authored = true;
    return da;
  }
  function specDAFromDataset(ds) {
    var existing = (S.spec.cda.dataAccesses || []).filter(function (x) { return x.datasetId === ds.id; })[0];
    if (existing) return existing;
    var da = dsToDA(ds, function (id) { return !!Studio.daById(S.spec, id); });
    S.spec.cda.dataAccesses.push(da);
    return da;
  }
  function addFromWorkspaceDataset(dsId, type) {
    var ds = Studio.Workspace.get("datasets", dsId); if (!ds) return;
    if (!(ds.columns || []).length && !(ds.sql && (Studio.detectColumns(ds.sql) || []).length)) {
      toast("Run a Preview on this dataset first so its columns are known.", true);
      return;
    }
    var da = specDAFromDataset(ds);
    if (type === "kpi") {
      var k = Studio.newKpi(da); k.fmt = Studio.guessFmt(k.valueCol);
      S.spec.kpis.push(k); select({ kind: "kpi", index: S.spec.kpis.length - 1 });
    } else {
      var p = Studio.newPanel(type || "bars", da);
      if (p.chart.opts && "fmt" in p.chart.opts) p.chart.opts.fmt = Studio.guessFmt(p.chart.map.valueCol || (p.chart.map.series && p.chart.map.series[0] && p.chart.map.series[0].col));
      S.spec.panels.push(p); select({ kind: "panel", id: p.id });
    }
    toast("Added dataset “" + ds.name + "” to “" + S.spec.title + "”");
    refreshPreview(); buildLibrary();
  }
  window.__studioAddFromWorkspaceDataset = addFromWorkspaceDataset; // test hook

  /* ══════════════ Explore (Viridis V5) — dataset-first analysis designer ═════
     The non-expert front door: pick a dataset → see it as a table → pick a
     chart → map columns → SAVE as an "analysis" (workspace `analyses` table).
     Analyses are reusable: pin to Home, drop into any dashboard from the
     Studio library, re-open here to refine. The chart preview is the REAL
     renderer (Studio.buildHtml in an iframe) fed with the rows just previewed,
     so what you save is exactly what a dashboard will show. */
  var XP_SEP = "\u001f"; // sample-dataset ids are "<stem><SEP><daId>"
  var XP = {
    kind: null, dsId: null,          // 'ws' (workspace dataset) | 'sample' (catalog stem/da)
    run: null,                       // { cols, rows, live, error? }
    da: null,                        // embedded da of a loaded SELF-CONTAINED analysis (no live
                                     // dataset/catalog behind it) — used to render its preview
    type: "bars", map: {}, opts: {},
    agg: { fn: "none", groupBy: [] }, // Explore rollups: group-by + aggregate the value column
    analysisId: null, name: "",
    folder: "",                      // M5 folder pilot (analyses): same flat single-value
                                     // "home" field as Datasets/Connections/Jobs
    q: ""                            // dataset search
  };
  window.__STUDIO_XP = XP; // exposed for tests
  // M5 folder pilot (analyses): which folder GROUP the saved-analyses sidebar
  // list is narrowed to — "" = All, "__unfiled" = no folder, else a folder name.
  var _xpFolderFilter = "";
  // Aggregation makes sense for the everyday category/measure charts; geo and the
  // ensemble view carry their own aggregation semantics, so hide the control there.
  // Rollup aggregates ONE measure by category, so it only applies to the
  // single-measure category charts. Scatter (two measures: x + y) and heatmap
  // (a row×column pivot) carry multiple/positional measures — a single-measure
  // group-by would collapse their data (every point to the origin), so the
  // control is hidden for them and they render their raw rows.
  var XP_AGG_TYPES = ["bars", "line", "donut", "treemap", "table"];
  // The chart types Explore offers — the everyday set plus the Viridis pair.
  // (Deep option tuning stays in the Studio inspector; Explore keeps the two
  // options non-experts actually need: map scale and the reference series.)
  var XP_TYPES = ["bars", "line", "donut", "treemap", "scatter", "heatmap", "table", "choropleth", "ensembleSeries"];
  var XP_FIELD_LABELS = {
    labelCol: "Label / category", valueCol: "Value", seriesCol: "Series / provider",
    idCol: "Region id (FIPS, state, HUC8…)", xCol: "X value", yCol: "Y value", rCol: "Bubble size (optional)",
    rowCol: "Row", colCol: "Column", series: "Value series"
  };
  function xpCatalogDA(stem, daId) {
    var entry = S.catalog[stem];
    return entry ? (entry.dataAccesses || []).filter(function (d) { return d.id === daId; })[0] : null;
  }
  function xpDatasets() {
    var out = [];
    // M4.2 follow-up leak (same class the job editor's source-picker had in slice 5): Explore's
    // own dataset picker was the one remaining consumer of Workspace's "datasets" table that never
    // filtered through isDatasetVisibleToMe — a viewer could pick, preview, AND run another
    // account's private dataset here even though it's hidden from the Datasets catalog itself.
    (Studio.Workspace ? Studio.Workspace.all("datasets").filter(isDatasetVisibleToMe) : []).sort(function (a, b) {
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    }).forEach(function (d) {
      var conn = Studio.Workspace.get("connections", d.connectionId);
      out.push({ kind: "ws", id: d.id, name: d.name || d.id, sub: conn ? conn.name : "no connection", cols: d.columns || [] });
    });
    if (showSamples()) {
      Object.keys(S.catalog).forEach(function (stem) {
        (S.catalog[stem].dataAccesses || []).forEach(function (d) {
          out.push({ kind: "sample", id: stem + XP_SEP + d.id, name: d.id, sub: stem + " · sample", cols: d.columns || [] });
        });
      });
    }
    return out;
  }
  // REVIEW-FIXES follow-up: picking a dataset (from the list or right after creating
  // a brand-new one via "+ New dataset") does the same handful of steps — shared here
  // so both call sites stay in lockstep.
  function xpSelectDataset(kind, dsId) {
    XP.kind = kind; XP.dsId = dsId;
    XP.analysisId = null; XP.name = ""; XP.folder = ""; XP.da = null; // a live dataset is picked — drop any loaded analysis's embedded da
    return xpLoadRows().then(function () {
      XP.type = xpDefaultType(XP.run && XP.run.cols); // geo data opens as a map, provider trends as the Ensemble
      xpGuessMapping(); renderExplore(); xpPreview();
    });
  }
  // Resolve the picked dataset to preview rows. Workspace datasets run LIVE
  // through their adapter (falling back to typed sample rows when the run
  // fails or columns are unknown); catalog samples use the sample engine.
  function xpLoadRows() {
    XP.run = null;
    if (XP.kind === "ws") {
      var ds = Studio.Workspace.get("datasets", XP.dsId);
      if (!ds) return Promise.resolve(null);
      return runDataset(ds).then(function (r) {
        if (r && !r.error && (r.rows || []).length) {
          return (XP.run = { cols: r.columns || ds.columns || [], rows: r.rows.slice(0, 500), live: true });
        }
        var cols = (ds.columns || []);
        if (!cols.length) return (XP.run = { cols: [], rows: [], live: false, error: (r && r.error) || "no columns known — Preview the dataset once" });
        var sd = Studio.sampleRows({ id: ds.id, columns: cols });
        return (XP.run = { cols: sd.cols, rows: sd.rows, live: false, error: r && r.error });
      });
    }
    var parts = String(XP.dsId).split(XP_SEP);
    var da = xpCatalogDA(parts[0], parts[1]);
    if (!da) return Promise.resolve(null);
    var sd = Studio.sampleRows(da);
    return Promise.resolve(XP.run = { cols: sd.cols, rows: sd.rows, live: false });
  }
  // The embeddable data-access for the current pick (self-contained, like the
  // Studio library produces, so analyses survive dataset deletion and export).
  function xpDA(takenId) {
    if (XP.kind === "ws") {
      var ds = Studio.Workspace.get("datasets", XP.dsId);
      // Treat a dataset that's gone PRIVATE on you the same as one that's gone entirely —
      // same leak class as the xpDatasets()/haveDs fixes above, this time in the path that
      // builds the embeddable da (chart preview + what gets persisted into the analysis row).
      if (!ds || !isDatasetVisibleToMe(ds)) return null;
      var da = dsToDA(ds, takenId);
      if (!da.columns.length && XP.run) da.columns = (XP.run.cols || []).slice();
      return da;
    }
    var parts = String(XP.dsId).split(XP_SEP);
    var cda = xpCatalogDA(parts[0], parts[1]);
    if (cda) return Studio.clone(cda);
    // A loaded self-contained analysis (its dataset/catalog entry is gone, or it never
    // had one — e.g. the demo pack's analyses): render from its embedded da.
    if (XP.da) return Studio.clone(XP.da);
    return null;
  }
  function xpDefaultType(cols) {
    var c = (cols || []).join(" ").toLowerCase();
    if (/fips|geoid|county|huc|district|crd|(^| )state( |$)/.test(c)) return "choropleth";
    if (/provider/.test(c) && /year|month|date/.test(c)) return "ensembleSeries";
    return "bars";
  }
  function xpGuessMapping() {
    var cols = (XP.run && XP.run.cols) || [];
    var p = Studio.newPanel(XP.type, { columns: cols });
    XP.map = p.chart.map || {};
    XP.opts = p.chart.opts || {};
    if (XP.type === "choropleth" || XP.type === "ensembleSeries") {
      var f = Studio.guessFmt(XP.map.valueCol || "");
      if (f && "fmt" in XP.opts) XP.opts.fmt = f;
    }
  }
  function xpSpec(mockOnly) {
    var da = xpDA();
    if (!da) return null;
    var title = XP.name || (XP.run ? "Exploring " + (Studio.CHARTS[XP.type] || {}).label : "Analysis");
    return {
      id: "explore-preview", name: "explore-preview", title: title,
      // Explore builds a single WIDGET — no dashboard header/banner around the preview
      // (that chrome reads as "too much" for a one-widget build view). hideHeader shows
      // just the chart, reusing the same flag dashboards use for header-off export.
      hideHeader: true,
      // LF10: seed the preview with the same dashboard theme a brand-new dashboard would get
      // (house default, or the app Color theme when no explicit default is set), so Explore's
      // preview reads as one system with the rest of the app instead of a fixed blue look.
      dashboardTheme: defaultDashboardTheme(),
      panels: [{ id: "xp1", title: title, span: "full",
        chart: { type: XP.type, da: da.id, map: Studio.clone(XP.map), opts: Studio.clone(XP.opts) } }],
      kpis: [], filters: [],
      cda: { connections: [], dataAccesses: [da] }
    };
  }
  var _xpPvTimer = null;
  function xpPreview() {
    clearTimeout(_xpPvTimer);
    _xpPvTimer = setTimeout(function () {
      var box = $("#xpPreview"); if (!box) return;
      var spec = xpSpec();
      if (!spec || !XP.run) { box.innerHTML = ""; return; }
      var mock = {};
      // Apply the rollup to the preview rows (same helper the saved analysis uses
      // at render time via applyOutputOptions), so the preview matches exactly.
      var pv = { cols: XP.run.cols, rows: XP.run.rows };
      if (XP.agg && XP.agg.fn && XP.agg.fn !== "none" && XP_AGG_TYPES.indexOf(XP.type) >= 0) {
        pv = Studio.aggregateRows(XP.run.cols, XP.run.rows, { groupBy: XP.agg.groupBy || [], fn: XP.agg.fn, valueCol: XP.map.valueCol });
      }
      mock[spec.cda.dataAccesses[0].id] = { cols: pv.cols, rows: pv.rows };
      var build = function () {
        var html = Studio.buildHtml(spec, S.assets, { preview: true, mock: mock, launcher: false });
        var ifr = box.querySelector("iframe");
        if (!ifr) {
          box.innerHTML = "";
          ifr = document.createElement("iframe");
          ifr.className = "xp-ifr"; ifr.title = "Analysis preview"; ifr.setAttribute("aria-label", "Analysis preview");
          box.appendChild(ifr);
        }
        // LF10: this preview never told its iframe the app's light/dark MODE (distinct from
        // the dashboardTheme baked into `html` above) — every other preview surface already
        // does this via postThemeOnLoad.
        postThemeOnLoad(ifr);
        ifr.srcdoc = html;
      };
      // map panels need geometry (and MapLibre for GL) inlined first
      if (Studio.geoAssetKeys(spec).length) { ensureGeoAssets(spec).then(build); } else { build(); }
    }, 120);
  }
  function xpSave() {
    var nameInp = $("#xpName");
    XP.name = ((nameInp && nameInp.value) || XP.name || "").trim();
    if (!XP.name) { toast("Give the analysis a name first", true); if (nameInp) nameInp.focus(); return; }
    var da = xpDA();
    if (!da || !XP.run) { toast("Pick a dataset first", true); return; }
    // Persist the rollup onto the da's outputOptions so it applies at render time
    // everywhere (Home, dashboards, exports) via Studio.applyOutputOptions.
    if (XP.agg && XP.agg.fn && XP.agg.fn !== "none" && XP_AGG_TYPES.indexOf(XP.type) >= 0) {
      da.outputOptions = da.outputOptions || {};
      da.outputOptions.aggregate = { fn: XP.agg.fn, groupBy: (XP.agg.groupBy || []).filter(Boolean), valueCol: XP.map.valueCol || "" };
    } else if (da.outputOptions) {
      delete da.outputOptions.aggregate;
    }
    var folderInp = $("#xpFolder");
    XP.folder = ((folderInp && folderInp.value) || XP.folder || "").trim();
    var prev = XP.analysisId ? Studio.Workspace.get("analyses", XP.analysisId) : null;
    var row = {
      id: XP.analysisId || undefined,
      name: XP.name,
      datasetId: XP.kind === "ws" ? XP.dsId : null,
      sample: XP.kind === "sample" ? XP.dsId : null,
      da: da,
      chart: { type: XP.type, map: Studio.clone(XP.map), opts: Studio.clone(XP.opts) },
      chartType: XP.type,
      pinned: prev ? !!prev.pinned : false,
      createdAt: prev ? prev.createdAt : undefined
    };
    if (XP.folder) row.folder = XP.folder; else delete row.folder;
    var saved = Studio.Workspace.put("analyses", row);
    XP.analysisId = saved.id;
    toast(prev ? "Analysis updated" : "Analysis saved — pin it to Home or add it to a dashboard");
    renderExplore();
  }
  function xpLoadAnalysis(id) {
    var a = Studio.Workspace.get("analyses", id); if (!a) return;
    XP.analysisId = a.id; XP.name = a.name || ""; XP.folder = a.folder || "";
    XP.kind = a.datasetId ? "ws" : "sample";
    XP.dsId = a.datasetId || a.sample;
    XP.type = (a.chart && a.chart.type) || a.chartType || "bars";
    XP.map = Studio.clone((a.chart && a.chart.map) || {});
    XP.opts = Studio.clone((a.chart && a.chart.opts) || {});
    // keep the embedded da so xpDA can render a self-contained analysis (no live dataset)
    XP.da = a.da ? Studio.clone(a.da) : null;
    // restore the saved rollup (da.outputOptions.aggregate) into the Explore control
    var savedAgg = a.da && a.da.outputOptions && a.da.outputOptions.aggregate;
    XP.agg = savedAgg ? { fn: savedAgg.fn || "none", groupBy: (savedAgg.groupBy || []).slice() } : { fn: "none", groupBy: [] };
    // dataset may be gone (analyses are self-contained) — fall back to the
    // embedded da's columns through the sample engine. Same fallback also covers a dataset
    // that's still there but gone PRIVATE on you since this analysis was saved (a public
    // analysis can outlive its source dataset's visibility just like it outlives deletion) —
    // isDatasetVisibleToMe closes the same leak class M4.2 slice 5 fixed in the job editor.
    var wsDs = XP.kind === "ws" ? Studio.Workspace.get("datasets", XP.dsId) : null;
    var haveDs = XP.kind === "ws" ? (!!wsDs && isDatasetVisibleToMe(wsDs))
      : !!xpCatalogDA(String(XP.dsId).split(XP_SEP)[0], String(XP.dsId).split(XP_SEP)[1]);
    var load = haveDs ? xpLoadRows() : Promise.resolve(
      XP.run = (function () { var sd = Studio.sampleRows(a.da || { columns: [] }); return { cols: sd.cols, rows: sd.rows, live: false, orphan: !haveDs }; })());
    load.then(function () { renderExplore(); xpPreview(); });
  }
  // A standalone one-panel spec for a saved analysis — used by Home's live
  // widgets (and anything else that needs to render an analysis outside Explore).
  function analysisSpec(a) {
    var da = Studio.clone(a.da || {});
    return {
      id: "analysis-" + a.id, name: "analysis-" + a.id, title: a.name || "Analysis",
      panels: [{ id: "a1", title: a.name || "Analysis", span: "full",
        chart: { type: a.chart.type, da: da.id, map: Studio.clone(a.chart.map || {}), opts: Studio.clone(a.chart.opts || {}) } }],
      kpis: [], filters: [],
      cda: { connections: [], dataAccesses: [da] }
    };
  }
  // Add a saved analysis to the CURRENT dashboard as a new panel (the library
  // group and canvas drag-drop both land here).
  function xpAddAnalysisToSpec(id) {
    var a = Studio.Workspace.get("analyses", id); if (!a) return;
    var da = null;
    if (a.datasetId) da = (S.spec.cda.dataAccesses || []).filter(function (x) { return x.datasetId === a.datasetId; })[0];
    if (!da) da = (S.spec.cda.dataAccesses || []).filter(function (x) { return JSON.stringify(x) === JSON.stringify(a.da); })[0];
    if (!da) {
      da = Studio.clone(a.da);
      var base = da.id, n = 2;
      while (Studio.daById(S.spec, da.id)) da.id = base + "_" + (n++);
      S.spec.cda.dataAccesses.push(da);
    }
    var p = { id: Studio.uid("p"), title: a.name || "Analysis", span: Studio.WIDE_CHART_TYPES.indexOf(a.chart.type) >= 0 ? "full" : 1,
      chart: { type: a.chart.type, da: da.id, map: Studio.clone(a.chart.map || {}), opts: Studio.clone(a.chart.opts || {}) } };
    S.spec.panels.push(p);
    select({ kind: "panel", id: p.id });
    enterStudio();
    toast("Added analysis “" + (a.name || "Analysis") + "” to “" + S.spec.title + "”");
    refreshPreview(); buildLibrary();
  }
  // LF11: "Add to NEW dashboard" — same blank-spec defaults as the Studio
  // "＋ Blank dashboard" action (New ▾ menu), then drop the analysis in as its
  // first panel via the normal current-spec path. Like any other new/blank
  // dashboard, it isn't written to the Dashboards catalog until Save.
  function xpAddAnalysisToNewDashboard(id) {
    S.spec = applyDashboardDefaults(Studio.emptySpec());
    S.selection = null;
    xpAddAnalysisToSpec(id);
  }
  window.__studioAddAnalysisToNewDashboard = xpAddAnalysisToNewDashboard; // test hook
  // LF11: "Add to EXISTING dashboard…" — a lightweight picker over the same
  // saved-dashboards list "Open a dashboard" uses (openDashboardPicker).
  // Picking a row loads it via openRecent (identical to any other "open a
  // dashboard" entry point — no separate unsaved-changes prompt) and then
  // appends the analysis, same as the single-dashboard path.
  function openAddToExistingDashboardPicker(analysisId) {
    modal("Add to which dashboard?", function (b) {
      var search = el("input", "search"); search.type = "search"; search.placeholder = "Search your dashboards…";
      search.setAttribute("aria-label", "Search dashboards");
      b.appendChild(search);
      var listWrap = el("div", "odp-list"); b.appendChild(listWrap);
      function paint() {
        var q = (search.value || "").toLowerCase();
        var list = loadRecents().filter(isVisibleToMe).filter(function (r) {
          if (!q) return true;
          var sp = r.spec || {};
          return ((sp.title || "") + " " + (sp.name || "")).toLowerCase().indexOf(q) >= 0;
        });
        listWrap.innerHTML = list.length ? "" : '<div class="odp-empty">' + (q ? "No dashboards match." : "Nothing saved yet — save a dashboard first, or add to a new one instead.") + '</div>';
        list.forEach(function (r) {
          var sp = r.spec || {};
          var row = el("button", "odp-row"); row.type = "button";
          var panels = (sp.panels || []).length;
          row.innerHTML = '<b>' + esc(sp.title || sp.name || "Untitled") + '</b>' +
            '<small>' + esc(sp.name || "") + " · " + panels + " panel" + (panels === 1 ? "" : "s") +
            (r.ts ? " · " + new Date(r.ts).toLocaleDateString() : "") + '</small>';
          row.onclick = function () { closeAllModals(); openRecent(r.id); xpAddAnalysisToSpec(analysisId); };
          listWrap.appendChild(row);
        });
      }
      search.addEventListener("input", paint);
      paint();
      search.focus();
    });
  }
  window.__studioOpenAddToExistingDashboardPicker = openAddToExistingDashboardPicker; // test hook
  function xpTogglePin(id) {
    var a = Studio.Workspace.get("analyses", id); if (!a) return;
    a.pinned = !a.pinned;
    Studio.Workspace.put("analyses", a);
    toast(a.pinned ? "Pinned to Home" : "Unpinned");
  }
  // M4.2 slice 4 (per-section rights + object privacy — analyses): same
  // `private`/`owner` shape + isVisibleToMe helper as dashboards/connections.
  // No field-name collision here (unlike datasets' acctOwner) — analyses have
  // no pre-existing `owner` field, so the plain shared shape applies as-is.
  function toggleAnalysisPrivate(id) {
    var W = Studio.Workspace, a = W.get("analyses", id);
    if (!a) return;
    if (a.private) { delete a.private; }
    else {
      a.private = true;
      if (!a.owner) { var uid = currentUserId(); if (uid) a.owner = uid; }
    }
    W.put("analyses", a);
    toast(a.private ? "Private — only you can see this" : "Public — visible to everyone");
    renderExplore();
  }
  window.__studioToggleAnalysisPrivate = toggleAnalysisPrivate; // test hook
  function xpMapEditorHtml() {
    var def = Studio.CHARTS[XP.type] || {}; var cols = (XP.run && XP.run.cols) || [];
    var fields = (def.fields || []).filter(function (f) { return f !== "cols"; });
    var opts = '<option value="">—</option>' + cols.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + "</option>"; }).join("");
    var rows = fields.map(function (f) {
      var cur = f === "series" ? ((XP.map.series && XP.map.series[0] && XP.map.series[0].col) || "") : (XP.map[f] || "");
      return '<label class="xp-map-row"><span>' + esc(XP_FIELD_LABELS[f] || f) + '</span>' +
        '<select data-xp-field="' + esc(f) + '">' + opts.replace('value="' + esc(cur) + '"', 'value="' + esc(cur) + '" selected') + "</select></label>";
    });
    if (XP.type === "choropleth") {
      rows.push('<label class="xp-map-row"><span>Region scale</span><select data-xp-opt="scale">' +
        [["county", "Counties (FIPS)"], ["state", "States"], ["crd", "USDA districts (CRD)"], ["huc8", "Watersheds (HUC8)"]].map(function (o) {
          return '<option value="' + o[0] + '"' + ((XP.opts.scale || "county") === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
        }).join("") + "</select></label>");
      // LF12: reuse the canonical renderer opt (model.js Studio.CHARTS.choropleth)
      // instead of a second hardcoded svg/gl choice list — same source the
      // Studio Inspector's generic options table already renders from.
      var rendererOpt = (def.opts || []).filter(function (o) { return o.key === "renderer"; })[0];
      if (rendererOpt) {
        rows.push('<label class="xp-map-row"><span>' + esc(rendererOpt.label) + '</span><select data-xp-opt="renderer">' +
          rendererOpt.choices.map(function (o) {
            return '<option value="' + o[0] + '"' + ((XP.opts.renderer || rendererOpt.def) === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
          }).join("") + "</select></label>");
      }
    }
    if (XP.type === "ensembleSeries") {
      var series = {};
      var si = (XP.run && XP.run.cols || []).indexOf(XP.map.seriesCol);
      if (si >= 0) (XP.run.rows || []).forEach(function (r) { series[String(r[si])] = 1; });
      rows.push('<label class="xp-map-row"><span>Reference series (never joins the estimate)</span><select data-xp-opt="refSeries">' +
        '<option value="">—</option>' + Object.keys(series).sort().map(function (s2) {
          return '<option value="' + esc(s2) + '"' + (XP.opts.refSeries === s2 ? " selected" : "") + ">" + esc(s2) + "</option>";
        }).join("") + "</select></label>");
    }
    // Rollups: group by one or two dimensions and aggregate the value column.
    if (XP_AGG_TYPES.indexOf(XP.type) >= 0) {
      var ag = XP.agg || (XP.agg = { fn: "none", groupBy: [] });
      var dimOpts = function (cur) {
        return '<option value="">—</option>' + cols.map(function (c) {
          return '<option value="' + esc(c) + '"' + (cur === c ? " selected" : "") + ">" + esc(c) + "</option>";
        }).join("");
      };
      var fnOpts = '<option value="none"' + (!ag.fn || ag.fn === "none" ? " selected" : "") + ">No aggregation (raw rows)</option>" +
        (Studio.AGG_FNS || []).map(function (f) {
          return '<option value="' + f[0] + '"' + (ag.fn === f[0] ? " selected" : "") + ">" + esc(f[1]) + "</option>";
        }).join("");
      rows.push('<div class="xp-map-sub">Rollup</div>');
      rows.push('<label class="xp-map-row"><span>Aggregate</span><select data-xp-agg="fn">' + fnOpts + "</select></label>");
      if (ag.fn && ag.fn !== "none") {
        rows.push('<label class="xp-map-row"><span>Group by</span><select data-xp-agg="g0">' + dimOpts((ag.groupBy || [])[0] || "") + "</select></label>");
        rows.push('<label class="xp-map-row"><span>Then by (optional)</span><select data-xp-agg="g1">' + dimOpts((ag.groupBy || [])[1] || "") + "</select></label>");
      }
    }
    return rows.join("");
  }
  function renderExplore() {
    var body = $("#xpBody"); if (!body) return;
    var dss = xpDatasets();
    var q = XP.q.toLowerCase();
    var shown = dss.filter(function (d) {
      return !q || (d.name + " " + d.sub + " " + d.cols.join(" ")).toLowerCase().indexOf(q) >= 0;
    });
    var analyses = Studio.Workspace.all("analyses").filter(isVisibleToMe).sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    var dsRows = shown.slice(0, 60).map(function (d) {
      var on = XP.kind === d.kind && XP.dsId === d.id;
      return '<button type="button" class="xp-ds' + (on ? " active" : "") + '" data-xp-ds="' + esc(d.kind) + XP_SEP + esc(d.id) + '">' +
        '<b>' + esc(d.name) + '</b><small>' + esc(d.sub) + '</small></button>';
    }).join("");
    // M5 folder pilot (analyses): same single-select facet shape as Datasets'/
    // Connections'/Jobs' `_dsxFolderFilter`/`_connFolderFilter`/`_jobsFolderFilter`
    // — only shown once at least one analysis has been filed.
    var xpFolderCounts = {}, xpFolderUnfiled = 0;
    analyses.forEach(function (a) { if (a.folder) xpFolderCounts[a.folder] = (xpFolderCounts[a.folder] || 0) + 1; else xpFolderUnfiled++; });
    if (_xpFolderFilter && _xpFolderFilter !== "__unfiled" && !xpFolderCounts[_xpFolderFilter]) _xpFolderFilter = "";
    var pillsFXp = Object.keys(xpFolderCounts).length
      ? ['<button type="button" class="wb-chip cx-pill' + (!_xpFolderFilter ? " active" : "") + '" data-xp-folder="" aria-pressed="' + (!_xpFolderFilter ? "true" : "false") + '">' +
          '<span class="wb-chip-label">All folders</span> <span class="wb-chip-n">' + analyses.length + '</span></button>']
        .concat(Object.keys(xpFolderCounts).sort().map(function (f) {
          return '<button type="button" class="wb-chip cx-pill' + (_xpFolderFilter === f ? " active" : "") + '" data-xp-folder="' + esc(f) + '" aria-pressed="' + (_xpFolderFilter === f ? "true" : "false") + '">' +
            '<span class="wb-chip-label">' + esc(f) + '</span> <span class="wb-chip-n">' + xpFolderCounts[f] + '</span></button>';
        }))
        .concat(['<button type="button" class="wb-chip cx-pill' + (_xpFolderFilter === "__unfiled" ? " active" : "") + '" data-xp-folder="__unfiled" aria-pressed="' + (_xpFolderFilter === "__unfiled" ? "true" : "false") + '">' +
          '<span class="wb-chip-label">Unfiled</span> <span class="wb-chip-n">' + xpFolderUnfiled + '</span></button>'])
        .join("")
      : "";
    var shownAnalyses = analyses.filter(function (a) {
      if (_xpFolderFilter === "__unfiled") return !a.folder;
      if (_xpFolderFilter) return a.folder === _xpFolderFilter;
      return true;
    });
    var savedRows = shownAnalyses.map(function (a) {
      var on = XP.analysisId === a.id;
      var folderBadge = a.folder ? '<span class="cx-badge cx-folder" title="Folder: ' + esc(a.folder) + '">' + esc(a.folder) + '</span>' : "";
      return '<div class="xp-saved-row' + (on ? " active" : "") + '" data-xp-a="' + esc(a.id) + '">' +
        '<button type="button" class="xp-saved-open" data-xp-open="' + esc(a.id) + '" title="Open in Explore"><b>' + esc(a.name) + '</b>' +
        '<small>' + esc((Studio.CHARTS[a.chartType] || {}).label || a.chartType) + '</small></button>' +
        folderBadge +
        '<span class="xp-saved-acts">' +
        '<button type="button" class="xp-act' + (a.private ? " private" : "") + '" data-xp-private="' + esc(a.id) + '" title="' + (a.private ? "Private — only you can see this" : "Make private") + '" aria-label="' + (a.private ? "Make " + esc(a.name) + " public" : "Make " + esc(a.name) + " private") + '" aria-pressed="' + (a.private ? "true" : "false") + '"></button>' +
        '<button type="button" class="xp-act' + (a.pinned ? " on" : "") + '" data-xp-pin="' + esc(a.id) + '" title="' + (a.pinned ? "Unpin from Home" : "Pin to Home") + '" aria-pressed="' + (a.pinned ? "true" : "false") + '">★</button>' +
        '<button type="button" class="xp-act" data-xp-dash="' + esc(a.id) + '" title="Add to the current dashboard">▦</button>' +
        '<button type="button" class="xp-act" data-xp-del="' + esc(a.id) + '" title="Delete analysis">✕</button>' +
        '</span></div>';
    }).join("");
    var main;
    // Show the "pick a dataset" empty state only when there's genuinely nothing to
    // preview. A saved analysis loaded from the list sets XP.run but can have a null
    // dataset id (self-contained sample analyses — e.g. the demo pack's), so gating on
    // XP.dsId here wrongly stranded them on the empty state instead of opening the chart.
    if (!XP.run) {
      main = '<div class="xp-empty"><h3>Pick a dataset to start</h3>' +
        '<p>Choose one on the left — your workspace datasets first, sample data below them. ' +
        'You’ll see the data as a table, then choose how to chart it.</p></div>';
    } else {
      var chips = XP_TYPES.map(function (t) {
        var def = Studio.CHARTS[t] || {};
        return '<button type="button" class="xp-chip' + (XP.type === t ? " active" : "") + '" data-xp-type="' + t + '" title="' + esc(def.desc || def.label || t) + '" aria-pressed="' + (XP.type === t ? "true" : "false") + '">' +
          '<span class="xp-chip-thumb">' + (CHART_SVG[t] ? themedChartSvg(CHART_SVG[t], t) : "") + '</span><span>' + esc(def.label || t) + "</span></button>";
      }).join("");
      var cols = XP.run.cols, rows = XP.run.rows;
      var thead = "<tr>" + cols.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr>";
      var tbody = rows.slice(0, 8).map(function (r) {
        return "<tr>" + cols.map(function (_, i) { return "<td>" + esc(String(r[i] == null ? "" : r[i])) + "</td>"; }).join("") + "</tr>";
      }).join("");
      main =
        '<div class="xp-step"><div class="xp-step-h">1 · The data' +
          '<span class="xp-badge' + (XP.run.live ? " live" : "") + '">' + (XP.run.live ? "live rows" : "sample rows") + "</span>" +
          (XP.run.error ? '<span class="xp-badge warn" title="' + esc(XP.run.error) + '">live run failed</span>' : "") +
          '<span class="xp-note">' + rows.length + " rows · " + cols.length + " columns</span></div>" +
          '<div class="xp-table-wrap"><table class="xp-table"><thead>' + thead + "</thead><tbody>" + tbody + "</tbody></table></div></div>" +
        '<div class="xp-step"><div class="xp-step-h">2 · The chart</div><div class="xp-chips">' + chips + "</div></div>" +
        '<div class="xp-step"><div class="xp-step-h">3 · The mapping</div><div class="xp-map-grid">' + xpMapEditorHtml() + "</div></div>" +
        '<div class="xp-step"><div class="xp-step-h">4 · The result</div><div id="xpPreview" class="xp-preview"></div>' +
          '<div class="xp-savebar">' +
            '<input id="xpName" type="text" placeholder="Name this analysis…" value="' + esc(XP.name) + '" aria-label="Analysis name"/>' +
            '<input id="xpFolder" type="text" placeholder="Folder (optional)" title="Optional — use / to nest, e.g. Finance/2024" value="' + esc(XP.folder || "") + '" aria-label="Folder" list="xpFolderOptions"/>' +
            '<datalist id="xpFolderOptions">' + Object.keys(xpFolderCounts).sort().map(function (f) { return '<option value="' + esc(f) + '">'; }).join("") + '</datalist>' +
            '<button type="button" class="btn primary" id="xpSaveBtn">' + (XP.analysisId ? "Update analysis" : "Save analysis") + "</button>" +
            (XP.analysisId ? '<button type="button" class="btn" id="xpSaveAsBtn">Save as new</button>' : "") +
            '<button type="button" class="btn" id="xpToNewDashBtn" title="Add this chart to a brand-new dashboard">+ New dashboard</button>' +
            '<button type="button" class="btn" id="xpToExistDashBtn" title="Pick an existing dashboard to add this chart to">Existing dashboard…</button>' +
          "</div></div>";
    }
    body.innerHTML =
      '<aside class="xp-side">' +
        '<div class="xp-side-search-row">' +
          '<input id="xpSearch" class="repo-search" type="search" placeholder="Search datasets…" aria-label="Search datasets" value="' + esc(XP.q) + '"/>' +
          '<button type="button" class="btn primary" id="xpNewDsBtn" title="Create a new dataset without leaving Explore">+ New</button>' +
        "</div>" +
        '<div class="xp-list">' + (dsRows || '<div class="xp-none">No datasets' + (showSamples() ? "" : " (samples are hidden in Settings)") + ".</div>") + "</div>" +
        '<div class="xp-saved"><div class="xp-saved-h">Saved analyses <span class="badge">' + analyses.length + "</span></div>" +
          (pillsFXp ? '<div class="wb-chips">' + pillsFXp + '</div>' : "") +
          (savedRows || '<div class="xp-none">' + (_xpFolderFilter ? "No analyses in this folder." : "Nothing saved yet.") + '</div>') + "</div>" +
      "</aside>" +
      '<div class="xp-main">' + main + "</div>";
    // wire
    var search = $("#xpSearch", body);
    if (search) search.addEventListener("input", function () { XP.q = search.value || ""; renderExplore(); });
    $$("[data-xp-ds]", body).forEach(function (btn) {
      btn.onclick = function () {
        var parts = btn.getAttribute("data-xp-ds").split(XP_SEP);
        xpSelectDataset(parts.shift(), parts.join(XP_SEP)); // sample ids contain the SEP themselves
      };
    });
    var xpNewDsBtn = $("#xpNewDsBtn", body);
    if (xpNewDsBtn) xpNewDsBtn.onclick = function () {
      openDatasetEditor(null, function (d) { xpSelectDataset("ws", d.id); });
    };
    $$("[data-xp-type]", body).forEach(function (btn) {
      btn.onclick = function () { XP.type = btn.getAttribute("data-xp-type"); xpGuessMapping(); renderExplore(); xpPreview(); };
    });
    $$("[data-xp-field]", body).forEach(function (sel) {
      sel.onchange = function () {
        var f = sel.getAttribute("data-xp-field");
        if (f === "series") XP.map.series = sel.value ? [{ col: sel.value }] : [];
        else XP.map[f] = sel.value;
        xpPreview();
      };
    });
    $$("[data-xp-opt]", body).forEach(function (sel) {
      sel.onchange = function () { XP.opts[sel.getAttribute("data-xp-opt")] = sel.value; xpPreview(); };
    });
    $$("[data-xp-agg]", body).forEach(function (sel) {
      sel.onchange = function () {
        var k = sel.getAttribute("data-xp-agg");
        if (!XP.agg) XP.agg = { fn: "none", groupBy: [] };
        if (k === "fn") { XP.agg.fn = sel.value; renderExplore(); xpPreview(); return; } // re-render to show/hide group-by rows
        var gb = (XP.agg.groupBy || []).slice();
        var idx = k === "g0" ? 0 : 1;
        gb[idx] = sel.value;
        XP.agg.groupBy = gb.filter(function (c, i) { return c || i < idx; }); // keep positions, drop trailing empties
        xpPreview();
      };
    });
    var saveBtn = $("#xpSaveBtn", body); if (saveBtn) saveBtn.onclick = xpSave;
    var saveAs = $("#xpSaveAsBtn", body); if (saveAs) saveAs.onclick = function () { XP.analysisId = null; xpSave(); };
    // LF11: the old single "Add to dashboard" button was ambiguous about WHICH
    // dashboard it meant (always "whatever's currently open in Studio," which
    // isn't obvious from the button text) — split into an explicit new-vs-
    // existing choice, both funneling into xpAddAnalysisToSpec once a target
    // spec is in place.
    function xpEnsureSavedAnalysis(cb) {
      if (XP.analysisId) { cb(XP.analysisId); return; }
      // unsaved → save silently under a default name, then proceed
      var nameInp = $("#xpName", body);
      if (nameInp && !nameInp.value.trim()) nameInp.value = "Exploration " + new Date().toLocaleDateString();
      xpSave();
      if (XP.analysisId) cb(XP.analysisId);
    }
    var toNewDash = $("#xpToNewDashBtn", body);
    if (toNewDash) toNewDash.onclick = function () { xpEnsureSavedAnalysis(xpAddAnalysisToNewDashboard); };
    var toExistDash = $("#xpToExistDashBtn", body);
    if (toExistDash) toExistDash.onclick = function () { xpEnsureSavedAnalysis(openAddToExistingDashboardPicker); };
    var nameInp2 = $("#xpName", body);
    if (nameInp2) nameInp2.addEventListener("input", function () { XP.name = nameInp2.value; });
    var folderInp2 = $("#xpFolder", body);
    if (folderInp2) folderInp2.addEventListener("input", function () { XP.folder = folderInp2.value; });
    $$("[data-xp-folder]", body).forEach(function (btn) {
      btn.onclick = function () { _xpFolderFilter = btn.getAttribute("data-xp-folder"); renderExplore(); };
    });
    $$("[data-xp-open]", body).forEach(function (btn) { btn.onclick = function () { xpLoadAnalysis(btn.getAttribute("data-xp-open")); }; });
    $$("[data-xp-private]", body).forEach(function (btn) {
      btn.appendChild(Studio.icon("lock", 12));
      btn.onclick = function (e) { e.stopPropagation(); toggleAnalysisPrivate(btn.getAttribute("data-xp-private")); };
    });
    $$("[data-xp-pin]", body).forEach(function (btn) { btn.onclick = function () { xpTogglePin(btn.getAttribute("data-xp-pin")); }; });
    $$("[data-xp-dash]", body).forEach(function (btn) { btn.onclick = function () { xpAddAnalysisToSpec(btn.getAttribute("data-xp-dash")); }; });
    $$("[data-xp-del]", body).forEach(function (btn) {
      btn.onclick = function () {
        var a = Studio.Workspace.get("analyses", btn.getAttribute("data-xp-del")); if (!a) return;
        if (!window.confirm('Delete analysis "' + a.name + '"?')) return;
        if (XP.analysisId === a.id) XP.analysisId = null;
        Studio.Workspace.remove("analyses", a.id);
        toast("Deleted " + a.name);
      };
    });
    if (XP.dsId && XP.run) xpPreview();
  }
  window.__studioRenderExplore = renderExplore; // test hook
  // Analyses in the Studio library — saved Explore results as drag-in objects.
  function buildAnalysesLib(list, q) {
    var all = (Studio.Workspace ? Studio.Workspace.all("analyses").filter(isVisibleToMe) : []);
    var shown = all.filter(function (a) {
      if (!q) return true;
      return ((a.name || "") + " " + (a.chartType || "")).toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    if (!shown.length) return;
    var wrap = el("div", "lib-mine lib-analyses open");
    var h = el("div", "h");
    h.innerHTML = '<span class="car">▶</span><span class="nm">Analyses</span><span class="badge">' + shown.length + "</span>";
    h.onclick = function () { wrap.classList.toggle("open"); };
    wrap.appendChild(h);
    var box = el("div", "lib-das");
    shown.forEach(function (a) {
      var c = el("div", "da");
      c.draggable = true;
      c.innerHTML = '<div class="da-top"><div class="da-id">' + hlq(a.name || "Analysis", q) + '</div></div>' +
        '<div class="da-name">' + esc((Studio.CHARTS[a.chartType] || {}).label || a.chartType) + " · " + esc((a.da && a.da.name) || "dataset") + "</div>" +
        '<div class="da-add"><span class="chip" data-xp-lib-add="' + esc(a.id) + '">+ Add to dashboard</span></div>';
      var chip = c.querySelector("[data-xp-lib-add]");
      if (chip) chip.onclick = function (e) { e.stopPropagation(); xpAddAnalysisToSpec(a.id); };
      c.addEventListener("dragstart", function (e) {
        e.dataTransfer.setData("text/plain", JSON.stringify({ analysis: a.id }));
        e.dataTransfer.effectAllowed = "copy";
      });
      box.appendChild(c);
    });
    wrap.appendChild(box);
    list.insertBefore(wrap, list.firstChild);
  }
  window.__studioExplore = { state: XP, render: renderExplore, load: xpLoadAnalysis, save: xpSave, addToSpec: xpAddAnalysisToSpec, togglePin: xpTogglePin }; // test hooks

  /* ---------- This dashboard's datasets (spec-owned query definitions) ---------- */
  function buildMyDataSources(list) {
    var das = S.spec.cda.dataAccesses || [];
    var wrap = el("div", "lib-mine open");
    var h = el("div", "h");
    h.innerHTML = '<span class="car">▶</span><span class="nm">This dashboard\u2019s datasets</span><span class="badge">' + das.length + "</span>";
    var addBtn = el("button", "mine-add"); setIconBtn(addBtn, "plus", "New", 12);
    addBtn.title = "Create a new data source"; addBtn.type = "button";
    addBtn.onclick = function (e) { e.stopPropagation(); addNewDA(); };
    h.appendChild(addBtn);
    // NOTE: the compound (join/union) data-access builder is intentionally NOT wired
    // into the Studio pane — joins/unions belong in the Datasets area (jobs), not here.
    // openCompoundDABuilder() + the compound model are kept intact so any dashboard that
    // already has a compound DA still renders/edits; only the "＋ New compound" entry is gone.
    h.onclick = function (e) { if (e.target.closest(".mine-add")) return; wrap.classList.toggle("open"); };
    wrap.appendChild(h);
    var box = el("div", "lib-das");
    if (!das.length) {
      var em = el("div"); em.style.cssText = "font-size:11.5px;color:var(--faint);padding:6px 4px;line-height:1.5";
      em.textContent = "Nothing bound yet. Drag a dataset or sample query onto the canvas, or click + New above.";
      box.appendChild(em);
    }
    das.forEach(function (da) { box.appendChild(myDACard(da)); });
    wrap.appendChild(box);
    list.insertBefore(wrap, list.firstChild);
  }

  // Which glyph represents a dataset's backend, so the pane is scannable at a
  // glance ("more icons showing what things are") instead of a wall of text.
  function daKindIcon(da) {
    if (Studio.isCompoundDA(da)) return da.compoundType === "union" ? "layers" : "join";
    var k = (da.kind || "sql").split(".")[0];
    var map = { sql: "code", duckdb: "duckdb", snowflake: "snowflake", sheets: "sheets",
                sqlite: "sqlite", redshift: "redshift", databricks: "databricks", sage: "sage" };
    return map[k] || "db";
  }

  // A calm, ~2-row dataset card: [kind icon] id [badge] with duplicate/delete
  // revealed on hover; a quiet name·usage line; column chips capped so a wide
  // table folds into "+N" instead of stretching the card into a wall.
  function myDACard(da) {
    var c = el("div", "da da-mine");
    var isCompound = Studio.isCompoundDA(da);
    var shortKind = isCompound ? (da.compoundType === "union" ? "UNION" : "JOIN") : ((da.kind || "sql").split(".")[0]).toUpperCase();

    var top = el("div", "da-mine-top");
    var idDiv = el("div", "da-id");
    var ic = el("span", "da-mine-ic"); ic.appendChild(Studio.icon(daKindIcon(da), 13)); idDiv.appendChild(ic);
    var idNm = el("span", "da-id-nm"); idNm.textContent = da.id; idDiv.appendChild(idNm);
    var badge = el("span", "kind-badge"); badge.textContent = shortKind; idDiv.appendChild(badge);
    idDiv.onclick = function (e) { e.stopPropagation(); select({ kind: "da", id: da.id }); };
    top.appendChild(idDiv);
    var acts = el("div", "da-mine-acts");
    var dup = el("button", "icobtn"); dup.appendChild(Studio.icon("duplicate", 13)); dup.title = "Duplicate";
    dup.onclick = function (e) { e.stopPropagation(); duplicateDA(da.id); };
    var del = el("button", "icobtn danger"); del.appendChild(Studio.icon("trash", 13)); del.title = "Delete";
    del.onclick = function (e) { e.stopPropagation(); deleteDA(da.id); };
    acts.appendChild(dup); acts.appendChild(del); top.appendChild(acts);
    c.appendChild(top);

    // name + usage share one muted line
    var usage = daUsageCount(da.id);
    var metaBits = [];
    if (da.name) metaBits.push('<span class="da-name-txt">' + esc(da.name) + "</span>");
    if (usage.total > 0) {
      var up = [];
      if (usage.panels) up.push(usage.panels + " panel" + (usage.panels !== 1 ? "s" : ""));
      if (usage.kpis) up.push(usage.kpis + " KPI" + (usage.kpis !== 1 ? "s" : ""));
      metaBits.push('<span class="da-usage-inline">↪ ' + up.join(" \xB7 ") + "</span>");
    }
    if (metaBits.length) {
      var mrow = el("div", "da-mine-meta");
      mrow.innerHTML = metaBits.join('<span class="da-meta-sep">·</span>');
      c.appendChild(mrow);
    }

    // columns, capped
    var colHtml;
    if (isCompound) {
      colHtml = da.compoundType === "union"
        ? (da.unionDas || []).map(function (id) { return '<span class="col">' + esc(id) + "</span>"; }).join("")
        : '<span class="col">' + esc(da.leftId || "?") + "</span> ⧈ <span class=\"col\">" + esc(da.rightId || "?") + "</span>";
    } else {
      var colsArr = da.columns || [];
      colHtml = colsArr.slice(0, 4).map(function (x) { return '<span class="col">' + esc(x) + "</span>"; }).join("");
      if (colsArr.length > 4) colHtml += '<span class="col col-more">+' + (colsArr.length - 4) + "</span>";
    }
    if (colHtml) { var cd = el("div", "da-cols"); cd.innerHTML = colHtml; c.appendChild(cd); }

    // N-DATA freshness badge (v301/v302) follow-up: closes the "library pane" gap from the
    // "still open" note — same REPO_LIVE_KINDS scoping as the Repository card (only the
    // connector kinds that are ALWAYS live-capable, so plain sample-engine DAs stay badge-free).
    if (REPO_LIVE_KINDS[da.kind]) {
      var freshEl = el("div", "da-mine-fresh"); freshEl.textContent = daFreshnessLabel(da.id);
      c.appendChild(freshEl);
    }
    if (S.selection && S.selection.kind === "da" && S.selection.id === da.id) c.classList.add("da-mine-sel");
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
    toast("New dashboard query created");
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
          body.appendChild(hint("The join is computed in the builder over the two DAs' rows — both sides must be data accesses declared in this dashboard."));
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
    toast("Text widget added — type content in the inspector");
  }

  /* ---------- data-source builder (author CDA queries) ---------- */
  var DS_TYPES = [
    { kind: "sql", iconName: "db", name: "SQL", desc: "SQL authored against the built-in sample engine — columns come from your AS aliases, and every dashboard stays fully demoable offline", ph: "SELECT region AS region,\n       SUM(amount) AS total\nFROM   sales\nGROUP  BY region\nORDER  BY total DESC" },
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
    var src = editing ? Studio.clone(existing.da) : { id: "", name: "", kind: "sql", sql: "", query: "", params: [], columns: [], calcColumns: [], cache: true, cacheDuration: 300 };
    src.kind = src.kind || "sql";
    var draft = { stem: editing ? existing.stem : "custom", id: src.id, kind: src.kind,
      query: src.query || src.sql || "", columns: (src.columns || []).slice(),
      params: (src.params || []).map(function (p) { return { name: p.name, type: p.type || "String", default: p.default || "" }; }),
      calcColumns: (src.calcColumns || []).map(function (c) { return { name: c.name || "", formula: c.formula || "", type: c.type || "Numeric" }; }),
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
        // rather than one uniform blue set. The built-in SQL sample-engine kind intentionally
        // keeps the app's own --pentaho accent — it isn't a third-party brand.
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
            var lOn = el("span"); lOn.textContent = "ON"; lOn.style.cssText = "font-size:10.5px;font-weight:800;color:var(--brand);font-family:var(--mono);flex:0 0 auto";
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
            var lAs = el("span"); lAs.textContent = "AS"; lAs.style.cssText = "font-size:10.5px;font-weight:800;color:var(--brand);font-family:var(--mono);flex:0 0 auto";
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
          genBtn.style.cssText = "color:var(--brand);border-color:color-mix(in srgb,var(--brand) 45%,transparent);font-size:12px;padding:5px 14px";
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

      function renderQSection() {
        qSection.innerHTML = "";
        var k = draft.kind;
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
        } else {
          var t = dsType(k);
          var qH = el("div", "hint");
          qH.textContent = "Alias each output with “as name” so columns can be detected.";
          var qTa = textarea(draft.query, function (v) { draft.query = v; });
          qTa.className = "dsb-query"; qTa.spellcheck = false; qTa.placeholder = t.ph;
          var qF = el("div", "field"); qF.appendChild(labelEl("SQL Query")); qF.appendChild(qTa); qF.appendChild(qH);
          qSection.appendChild(qF);
          // SQL Builder accordion: available for SQL kind to assist with SELECT generation (G1)
          qSection.appendChild(renderSQLBuilder(qTa));
          detectBtn.style.display = "";
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
    if (!S.catalog[stem]) S.catalog[stem] = { file: stem + ".cda", dataAccesses: [] };
    var entry = S.catalog[stem];
    var da = { id: draft.id, name: draft.id, kind: draft.kind,
      params: draft.params.filter(function (p) { return p.name; }),
      calcColumns: (draft.calcColumns || []).filter(function (c) { return c.name; }),
      cache: true, cacheDuration: 300, sql: draft.query, query: draft.query,
      columns: draft.columns.slice(), authored: true };
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
    buildLibrary(); renderDashboards();
    var w = document.querySelector('.lib-cda[data-stem="' + stem + '"]'); if (w) w.classList.add("open");
    toast((existing ? "Updated " : "Created ") + stem + " › " + da.id);
    return true;
  }

  function deleteDataSource(stem, daId) {
    var e = S.catalog[stem]; if (!e) return;
    e.dataAccesses = e.dataAccesses.filter(function (x) { return x.id !== daId; });
    if (!e.dataAccesses.length) delete S.catalog[stem];
    buildLibrary(); renderDashboards(); toast("Removed " + daId);
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
    else if (S.selection.kind === "panel") { $("#inspTitle").textContent = "Widget"; renderPanelInspector(body); }
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
      cl.appendChild(clStep(false, "Add a widget to the canvas", "Drag any query from the library onto the canvas to create your first chart.", "Open library", function () {
        if (window.innerWidth <= 640) {
          var t = document.getElementById("tabLib"); if (t) t.click();
        } else {
          var ls = document.getElementById("libSearch"); if (ls) { ls.focus(); ls.select(); }
        }
      }));
      // Step 3 is the end goal — shown as upcoming to frame the overall journey.
      cl.appendChild(clStep(false, "Export your dashboard", "Use Export ▾ to download a self-contained HTML file you can host anywhere static pages live."));
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
        "Click a widget on the canvas to select it, then choose a chart type and bind your data columns in the inspector."));
      k8.appendChild(k8Tip("plus", "Add more panels or KPIs",
        "Drag more queries from the library onto the canvas to expand your dashboard."));
      k8.appendChild(k8Tip("download", "Export when ready",
        "Use Export ▾ in the toolbar to download a self-contained HTML file you can host anywhere.",
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
    var thumbSvg = Studio.makeThumbnail(sp, S.theme, defaultDashboardTheme());
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
    if (!issues.length) { vs.appendChild(iconNote("ok", "check", "Looks good — ready to export.")); celebrateHealthZero(sp); }
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

      tvSec.appendChild(noteEl("info", "Use {{key}} in the dashboard Title/Subtitle above, or in any widget's Title/Note — it's replaced with the matching value here, in both the live preview and every export. A key with no matching variable is left as literal text. Save the rows above as a named set to reuse them on other dashboards."));
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
    // Header off (embed mode): hide the whole title banner + description so the export is
    // just KPIs + widgets — ready to wrap inside another site.
    var hdrCb = el("input"); hdrCb.type = "checkbox"; hdrCb.id = "hideHeaderCb"; hdrCb.checked = !sp.hideHeader;
    var hdrLbl = el("label", "check"); hdrLbl.htmlFor = hdrCb.id; hdrLbl.style.cssText = "gap:6px;font-size:12px";
    hdrLbl.appendChild(hdrCb); hdrLbl.appendChild(document.createTextNode("Show dashboard header"));
    hdrCb.onchange = function () { if (hdrCb.checked) delete sp.hideHeader; else sp.hideHeader = true; refreshPreview(); };
    sec.appendChild(field("Header", hdrLbl,
      "Turn off to hide the whole title banner and description — the live preview and the exported HTML then show only the KPIs and widgets, ready to embed in your own page."));

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
    // N-DESIGN theme studio ("author custom themes" — still open): a 6th swatch, distinct
    // gradient so it never reads as just another curated mood, opens the seed-color editor below.
    var customSw = el("button"); customSw.type = "button"; customSw.className = "dt-swatch dt-swatch-custom";
    customSw.title = "Custom — author your own theme";
    customSw.style.background = "conic-gradient(from 45deg,#b8632e,#8a3fa8,#0e8f86,#b8632e)";
    customSw.setAttribute("data-dashboard-theme", "custom");
    var customActive = sp.dashboardTheme === "custom";
    if (customActive) customSw.classList.add("active");
    customSw.setAttribute("aria-pressed", customActive ? "true" : "false");
    customSw.onclick = function () {
      sp.dashboardTheme = "custom";
      if (!sp.customTheme) sp.customTheme = Studio.clone(Studio.DEFAULT_CUSTOM_THEME_SEED);
      refreshPreview(); renderInspector();
    };
    dtRow.appendChild(customSw);
    sec.appendChild(field("Dashboard theme", dtRow, "Swaps the whole look (background, panels, text, brand + series colors) in one pick — Accent color/Series palette below still layer on top. Custom lets you author your own from 4 seed colors per mode."));

    if (sp.dashboardTheme === "custom") {
      if (!sp.customTheme) sp.customTheme = Studio.clone(Studio.DEFAULT_CUSTOM_THEME_SEED);
      var ctWrap = el("div"); ctWrap.className = "ct-editor";
      var CT_FIELDS = [["bg", "Background"], ["panel", "Widget"], ["text", "Text"], ["brand", "Brand"]];
      ["light", "dark"].forEach(function (mode) {
        var modeWrap = el("div"); modeWrap.className = "ct-mode";
        var modeLabel = el("div"); modeLabel.className = "ct-mode-label";
        modeLabel.textContent = mode === "light" ? "Light mode" : "Dark mode";
        modeWrap.appendChild(modeLabel);
        var row = el("div"); row.className = "accent-presets";
        CT_FIELDS.forEach(function (f) {
          var key = f[0], label = f[1];
          var wrap = el("span"); wrap.className = "ct-field";
          var inp = el("input"); inp.type = "color"; inp.title = label;
          inp.setAttribute("aria-label", label + " (" + mode + " mode)");
          inp.value = sp.customTheme[mode][key] || "#000000";
          inp.oninput = function () {
            sp.customTheme[mode][key] = this.value;
            refreshPreview();
            var ratioEl = $("#ctContrast" + mode, ctWrap);
            if (ratioEl) ratioEl.innerHTML = ctContrastHint(sp.customTheme[mode]);
          };
          wrap.appendChild(inp);
          var lbl = el("span"); lbl.className = "ct-field-label"; lbl.textContent = label;
          wrap.appendChild(lbl);
          row.appendChild(wrap);
        });
        modeWrap.appendChild(row);
        var contrastEl = el("div"); contrastEl.className = "ct-contrast"; contrastEl.id = "ctContrast" + mode;
        contrastEl.innerHTML = ctContrastHint(sp.customTheme[mode]);
        modeWrap.appendChild(contrastEl);
        ctWrap.appendChild(modeWrap);
      });
      sec.appendChild(field("Custom theme colors", ctWrap, "Everything else (borders, subtle fills, sidebar, series accent) is derived automatically from these 4 colors, the same way each curated preset relates its own tokens."));

      // Theme presets: save this dashboard's custom theme by name, reuse it on any other
      // dashboard — same sp-list/sp-item UI (and CSS) as the Settings-page style presets.
      var ctpWrap = el("div"); ctpWrap.className = "ct-presets";
      var ctpList = el("div"); ctpList.className = "sp-list";
      var ctpPresetsNow = customThemePresets();
      if (ctpPresetsNow.length) {
        ctpPresetsNow.forEach(function (p) {
          var item = el("div"); item.className = "sp-item"; item.setAttribute("data-id", p.id);
          var sw = el("span"); sw.className = "sp-swatch"; sw.style.background = p.light.brand || "#005bb5";
          var name = el("span"); name.className = "sp-name"; name.textContent = p.name;
          var applyBtn = el("button"); applyBtn.type = "button"; applyBtn.className = "btn sp-apply";
          applyBtn.textContent = "Apply";
          applyBtn.onclick = function () {
            applyCustomThemePreset(p.id, sp); refreshPreview(); renderInspector();
            toast("Preset “" + p.name + "” applied");
          };
          var delBtn = el("button"); delBtn.type = "button"; delBtn.className = "icobtn danger sp-del";
          delBtn.setAttribute("aria-label", "Delete preset " + p.name);
          delBtn.appendChild(Studio.icon("trash", 13));
          delBtn.onclick = function () { deleteCustomThemePreset(p.id); renderInspector(); };
          item.appendChild(sw); item.appendChild(name); item.appendChild(applyBtn); item.appendChild(delBtn);
          ctpList.appendChild(item);
        });
      } else {
        var ctpEmpty = el("div"); ctpEmpty.className = "sp-empty"; ctpEmpty.textContent = "No saved theme presets yet.";
        ctpList.appendChild(ctpEmpty);
      }
      ctpWrap.appendChild(ctpList);
      var ctpAddRow = el("div"); ctpAddRow.className = "sp-add-row";
      var ctpNameInp = el("input"); ctpNameInp.type = "text"; ctpNameInp.id = "ctpNameInp"; ctpNameInp.className = "set-txt";
      ctpNameInp.placeholder = "Preset name, e.g. Acme Corp";
      var ctpSaveBtn = el("button"); ctpSaveBtn.type = "button"; ctpSaveBtn.id = "ctpSaveBtn"; ctpSaveBtn.className = "btn";
      ctpSaveBtn.textContent = "+ Save as preset";
      ctpSaveBtn.onclick = function () {
        var name = (ctpNameInp.value || "").trim(); if (!name) { ctpNameInp.focus(); return; }
        addCustomThemePreset(name, sp.customTheme); renderInspector();
        toast("Saved preset “" + name + "”");
      };
      ctpNameInp.addEventListener("keydown", function (e) { if (e.key === "Enter") ctpSaveBtn.click(); });
      ctpAddRow.appendChild(ctpNameInp); ctpAddRow.appendChild(ctpSaveBtn);
      ctpWrap.appendChild(ctpAddRow);
      sec.appendChild(field("Theme presets", ctpWrap, "Save this custom theme by name to reuse on other dashboards, or apply/delete a previously saved one."));
    }

    // H-track: Dashboard accent color — per-dashboard --pentaho override.
    // 6 quick preset swatches + a custom hex picker let the SE team match client branding.
    // Empty string = keep whatever accent this dashboard's whole-look theme defines.
    var THEME_PRESETS = Studio.THEME_PRESETS;
    var accentRow = el("div"); accentRow.className = "accent-presets";
    var accentCustom = el("input"); accentCustom.type = "color"; accentCustom.id = "dashAccentCustom";
    accentCustom.title = "Custom accent color";
    accentCustom.value = sp.themeColor || themeDefaultAccent(sp.dashboardTheme, sp.customTheme);
    accentCustom.oninput = function () {
      sp.themeColor = this.value; refreshPreview(); renderInspector();
    };
    THEME_PRESETS.forEach(function (preset) {
      var sw = el("button"); sw.type = "button"; sw.className = "accent-swatch";
      sw.title = preset.label;
      sw.style.background = preset.color || themeDefaultAccent(sp.dashboardTheme, sp.customTheme);
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
      dlHint.innerHTML = 'Append <code class="fhash">#' + esc(hashStr) + '</code> to the exported dashboard URL to pre-select these filters on load.';
      dlSec.appendChild(dlHint);
      var dlBtn = el("button", "btn"); dlBtn.style.cssText = "margin-top:6px;width:100%;justify-content:center";
      setIconBtn(dlBtn, "link", "Copy filter hash");
      dlBtn.setAttribute("data-deeplink", hashStr);
      dlBtn.onclick = function () {
        var hash = "#" + hashStr;
        try { navigator.clipboard.writeText(hash).then(function () { toast("Filter hash copied! Append to your exported dashboard's URL."); }).catch(function () { toast(hash); }); } catch (e) { toast(hash); }
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
      noteSec.appendChild(hint("Pin a small colored note to a widget, or add a general one — for your own reference or team review while building. Never exported, never leaves this browser."));
    } else {
      noteList.forEach(function (n) {
        var panel = n.panelId ? panelById(n.panelId) : null;
        var sub = n.panelId ? ("Pinned to: " + (panel ? (panel.title || panel.id) : "a deleted panel")) : "General note";
        var dot = '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + esc(n.color || NOTE_COLORS[0]) + '"></span>';
        var label = n.text.length > 40 ? n.text.slice(0, 40) + "…" : n.text;
        noteSec.appendChild(rowItem(dot, label, sub, function () { openNoteEditor(n); }, [delBtn(function () { deleteCanvasNote(n.id); })], false));
      });
    }

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
      var row = rowItem(ic, p.title || "(widget)", p.chart.type + " · " + p.chart.da + " · span " + p.span,
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

  function renderPanelInspector(body) {
    var p = panelById(S.selection.id); if (!p) { selectDashboard(); return; }
    quickHelp(body, "panel");
    var sec = section(body, "Widget");
    sec.appendChild(field("Title", input(p.title, function (v) { p.title = v; refreshPreview(); renderListsOnly(); })));
    var spanSel = select2pairs([["1", "1 column"], ["2", "2 columns"], ["3", "3 columns"], ["full", "Full width"]], String(p.span), function (v) { p.span = v === "full" ? "full" : +v; refreshPreview(); });
    sec.appendChild(field("Width (span)", spanSel, "Keys: ↑/↓ reorder · Shift+←/→ resize"));
    sec.appendChild(field("Pill (badge)", input(p.pill, function (v) { p.pill = v; refreshPreview(); })));
    sec.appendChild(field("Sub-label", input(p.sub, function (v) { p.sub = v; refreshPreview(); })));
    sec.appendChild(field("Info tooltip", textarea(p.info, function (v) { p.info = v; refreshPreview(); })));
    sec.appendChild(field("Note (visible)", input(p.note || "", function (v) { p.note = v.trim(); refreshPreview(); }),
      "Short annotation shown below the widget title in the preview and exported dashboard — stakeholder context at a glance"));
    // N-FUN: a first cut of "story / scrollytelling mode" — an optional narrative line
    // shown ONLY in Slideshow (never in the normal preview/export), distinct from the
    // always-visible panel Note above. Turns Slideshow from "cycle through charts" into
    // "present findings" — one sentence of context per beat, read aloud or on-screen.
    sec.appendChild(field("Slide caption", textarea(p.slideCaption || "", function (v) { p.slideCaption = v.trim(); }),
      "Narration shown only in Slideshow mode (⋯ More → Slideshow) — tell the story of this widget, one beat at a time"));
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
        "Plays a brief zoom + glow entrance when this widget's slide appears in Slideshow — draws the eye to the moment that matters"));
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
    sec.appendChild(noteEl("info", "Downloads a tiny, self-contained HTML file with just this one widget — you can drop it anywhere, no server or the rest of the dashboard needed."));
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
            chip.innerHTML = '<span class="ic">' + (themedChartSvg(CHART_SVG[r.type], r.type) || Studio.CHARTS[r.type].icon) + '</span><span>' + r.label + '</span>';
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
        o.innerHTML = '<div class="ic">' + (themedChartSvg(CHART_SVG[t], t) || c.icon) + '</div><div class="lb">' + c.label + '</div>' + (c.desc ? '<div class="lb-desc">' + c.desc + '</div>' : '');
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
      optDefs.forEach(function (od) { os.appendChild(optField(p.chart.opts, od, p.chart.type)); });
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
    sec.appendChild(noteEl("info", "Auto-generated from this widget's own sample data (offline, no API) — a quick read on trend, the biggest single move, and any outlier."));
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
        // parallelCoords (and any future chart that colors by entity, not by series)
        // opts out via seriesColor:false — showing the picker there would do nothing,
        // since the renderer never reads series[i].color for that chart type.
        var showSeriesColor = (Studio.CHARTS[t] || {}).seriesColor !== false;
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
          if (showSeriesColor) {
            var cr = el("div", "field");
            var csel = colorTokenSelect([["", "Auto (palette)"]].concat(Studio.COLOR_TOKENS.map(function (t) { return [t, Studio.colorTokenLabel(t)]; })), s.color || "", function (v) { if (v) s.color = v; else delete s.color; refreshPreview(); });
            cr.appendChild(labelEl("Series " + (i + 1) + " color")); cr.appendChild(csel);
            box.appendChild(cr);
          }
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
          idCol: "Region id column (county FIPS, state, CRD, or HUC8)",
          seriesCol: t === "choropleth" ? "Provider / series column (optional — joins the ensemble channel)" : "Provider / series column",
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
    ts.appendChild(field("Sparkline color", colorTokenSelect([["", "Auto"]].concat(Studio.COLOR_TOKENS.map(function (t) { return [t, Studio.colorTokenLabel(t)]; })), k.sparkColor || "", function (v) { if (v) k.sparkColor = v; else delete k.sparkColor; refreshPreview(); })));

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
    sec.appendChild(field("Kind", select2pairs(Studio.DA_KINDS.map(function (k) { return [k.id, k.label]; }), da.kind || "sql", function (v) { da.kind = v; renderInspector(); })));

    var acts = el("div"); acts.style.cssText = "display:flex;gap:8px;margin-top:4px";
    var dup = el("button", "btn-wide"); setIconBtn(dup, "duplicate", "Duplicate"); dup.onclick = function () { duplicateDA(da.id); };
    var del = el("button", "btn-wide"); del.style.color = "var(--bad)"; setIconBtn(del, "trash", "Delete"); del.onclick = function () { deleteDA(da.id); };
    acts.appendChild(dup); acts.appendChild(del); sec.appendChild(acts);

    // Per-kind query editor
    var kind = da.kind || "sql";
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
    if (!da.calcColumns.length) ccs.appendChild(hint("Add formula-based columns derived from output. Formula syntax: =[col1] + [col2], or =pctChange([col]) / =movingAvg([col], n)"));
    da.calcColumns.forEach(function (cc, i) {
      var r = el("div", "field row");
      var errEl = el("div", "note err calc-col-err"); errEl.style.display = "none";
      function revalidate() {
        if (!cc.name || !cc.formula) { errEl.style.display = "none"; return; }
        var probe = {}; (da.columns || []).forEach(function (c) { probe[c] = 1; });
        // pctChange()/movingAvg() need row-position + whole-column context (a "previous row" to
        // compare/average against) — give the live validator a tiny 2-row dummy series so a real
        // formula validates clean instead of always erroring on "no prior row" against what's
        // otherwise a single dummy probe row.
        var ctx = { index: 1, series: function (name) { return (da.columns || []).indexOf(name) >= 0 ? [1, 1] : null; } };
        var res = Studio.evalFormula(cc.formula, probe, ctx);
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
    ooSec.appendChild(hint("Applied after the query: filter rows, sort, or cap the result size. Active rules show in the query preview and are applied inside the exported dashboard too."));

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
    return lsGet("studio-da-freshness", {});
  }
  function markDaFreshness(daId) {
    var m = daFreshnessMap(); m[daId] = new Date().toISOString();
    lsSet("studio-da-freshness", m);
  }
  function daFreshnessLabel(daId) {
    var ts = daFreshnessMap()[daId];
    return ts ? "Last verified live " + timeAgo(ts) : "Never verified live";
  }

  // Wire up the Cache/Duration fields (above) that were, until now, stored on the DA and read by
  // nothing — toggling them had zero effect. In-memory only (page-lifetime; no new localStorage
  // key, so no "Clear local data" gap to create): reopening a DA's inspector within its cache
  // duration shows the last live result instantly instead of re-hitting the connector, labeled
  // "cached" (never counted as a fresh freshness-badge verification — see daFreshnessLabel above).
  // An explicit "Run live" click always queries live and refreshes the cache; the cache only ever
  // saves an AUTOMATIC re-query on mount, never a user-requested one.
  var _daLiveCache = {};
  function daCacheKey(da, paramVals) { return da.id + "|" + JSON.stringify(paramVals || {}); }
  function daCacheGet(da, paramVals) {
    if (da.cache === false) return null;
    var e = _daLiveCache[daCacheKey(da, paramVals)];
    if (!e || Date.now() - e.ts > (da.cacheDuration || 300) * 1000) return null;
    return e.result;
  }
  function daCacheSet(da, paramVals, result) {
    _daLiveCache[daCacheKey(da, paramVals)] = { ts: Date.now(), result: result };
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
    var hasConn = !!da.connectionId; // bound to a workspace connection → adapter live path
    var isDuckdb = da.kind === "duckdb";
    var isSqlite = da.kind === "httpvfs";
    var isSnowflake = da.kind === "snowflake";
    var isDatabricks = da.kind === "databricks";
    var isBigquery = da.kind === "bigquery";
    var isHttp = da.kind === "http";
    var liveBtn = null;
    if (hasConn || isDuckdb || isSqlite || isSnowflake || isDatabricks || isBigquery || isHttp) {
      liveBtn = el("button", "btn"); setIconBtn(liveBtn, "play", "Run live");
      liveBtn.title = hasConn ? "Query live through this dataset's connection" :
        isDuckdb ? "Query the live file via DuckDB-Wasm (HTTP Range Requests)" :
        isSqlite ? "Query the live file via SQLite-WASM (HTTP Range Requests)" :
        isSnowflake ? "Query the live warehouse via the Snowflake SQL API" :
        isDatabricks ? "Query the live warehouse via the Databricks Statement Execution API" :
        isBigquery ? "Query the live dataset via the BigQuery jobs.query API" :
        "Query the live endpoint";
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

      var srcLabel = src === "live" ? " · live" : src === "cached" ? " · cached" : " · sample";
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

    // Dataset defaults ← dashboard template variables ← the inspector's own param inputs (most
    // specific wins). Shared by every live-query branch below AND the cache key (mount-time
    // check + post-run write), so a cached result only ever gets reused under the exact params
    // it was fetched with.
    function resolveDsParams() {
      var dsParams = {};
      (S.spec.templateVars || []).forEach(function (tv) { if (tv.key) dsParams[tv.key] = tv.value; });
      (da.params || []).forEach(function (p) { if (paramVals[p.name] != null) dsParams[p.name] = paramVals[p.name]; });
      return dsParams;
    }

    function runLive() {
      if (!liveBtn) return;
      liveBtn.disabled = true; liveBtn.textContent = "Loading…";
      statusLine.textContent = "Querying…";
      var dsParams = resolveDsParams();
      // Connection-bound dataset (the connections → datasets model): resolve the
      // workspace dataset fresh when it still exists (edits in the Datasets
      // section flow through), else run the copy embedded at import time. The
      // adapter runs through the referenced Connection's stored credentials.
      if (da.connectionId) {
        var wsd = (da.datasetId && Studio.Workspace.get("datasets", da.datasetId)) ||
          Object.assign({ id: da.datasetId || da.id, name: da.name, connectionId: da.connectionId }, da.dataset || { kind: "sql", sql: da.sql || da.query });
        window.__studioRunDataset(wsd, dsParams).then(function (r) {
          liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live");
          if (r.error) { toast("Dataset query failed — showing sample. (" + r.error + ")", true); runSample(); return; }
          state.result = { cols: r.columns, rows: r.rows }; state.source = "live"; state.page = 0;
          daCacheSet(da, dsParams, state.result);
          renderTable(state.result, "live");
        });
        return;
      }
      if (isDuckdb) {
        if (!da.fileUrl) { liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live"); toast("Set a file URL first.", true); runSample(); return; }
        Studio.DuckDB.query({ fileUrl: da.fileUrl, fileFormat: da.fileFormat }, da.sql || da.query).then(function (result) {
          state.result = result; state.source = "live"; state.page = 0;
          daCacheSet(da, dsParams, state.result);
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
          daCacheSet(da, dsParams, state.result);
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
          daCacheSet(da, dsParams, state.result);
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
          daCacheSet(da, dsParams, state.result);
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
          daCacheSet(da, dsParams, state.result);
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
          daCacheSet(da, dsParams, state.result);
          liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live");
          renderTable(state.result, "live");
        }).catch(function (e) {
          liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live");
          toast("Endpoint query failed — showing sample. (" + ((e && e.message) || e) + ")", true);
          runSample();
        });
        return;
      }
      // No connection binding and no direct-connector kind: this query runs on
      // the built-in sample engine only. Bind it to a Connection (import a
      // workspace dataset, or add connection fields) to run it live.
      liveBtn.disabled = false; setIconBtn(liveBtn, "play", "Run live");
      toast("This query has no connection — showing sample data. Bind it to a workspace dataset to run live.", true);
      runSample();
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

    // Auto-run on open — unless a still-valid cached live result exists (Cache/Duration fields,
    // above) for these exact params, in which case show that instead of sample data so reopening
    // a DA you already ran live moments ago doesn't fall back to sample rows.
    var openCache = liveBtn ? daCacheGet(da, resolveDsParams()) : null;
    if (openCache) { state.result = openCache; state.source = "cached"; renderTable(state.result, "cached"); }
    else runSample();
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
  // Viridis V2: map panels need topojson-client + geometry inlined into the
  // preview/export html (exports must work from file:// where fetch is dead;
  // the preview inlines the SAME way so preview == export stays byte-true).
  // Fetched lazily on the first map panel, cached on S.assets ever after.
  function ensureGeoAssets(spec) {
    var keys = Studio.geoAssetKeys(spec);
    S.assets.geo = S.assets.geo || {};
    var missing = keys.filter(function (k) { return !S.assets.geo[k]; });
    var needGL = Studio.usesGLMap(spec) && !S.assets.maplibre; // Viridis V4: GL panels pull MapLibre too
    if (!missing.length && !needGL && (S.assets.topojson || !keys.length)) return Promise.resolve(false);
    var FILES = { county: "vendor/geo/counties-albers-10m.json", state: "vendor/geo/states-albers-10m.json",
      huc8: "vendor/geo/us-huc8-cornbelt-albers.json", crdMap: "vendor/geo/us-crd-counties.json" };
    var jobs = missing.map(function (k) {
      return fetch(FILES[k]).then(function (r) { return r.text(); }).then(function (t) { S.assets.geo[k] = t; });
    });
    if (!S.assets.topojson) jobs.push(fetch("vendor/geo/topojson-client.min.js").then(function (r) { return r.text(); }).then(function (t) { S.assets.topojson = t; }));
    if (needGL) {
      jobs.push(Promise.all([
        fetch("vendor/maplibre/maplibre-gl.js").then(function (r) { return r.text(); }),
        fetch("vendor/maplibre/maplibre-gl.css").then(function (r) { return r.text(); })
      ]).then(function (r) { S.assets.maplibre = { js: r[0], css: r[1] }; }));
    }
    return Promise.all(jobs).then(function () { return true; });
  }
  window.__studioEnsureGeoAssets = ensureGeoAssets; // test hook + used by export paths
  function doRefresh() {
    var ifr = $("#preview");
    // Map panels: make sure geometry is inlined before building; when the fetch
    // completes we re-render once (guarded — assets are cached, so the retry
    // finds nothing missing and renders straight through).
    var needGeo = Studio.geoAssetKeys(S.spec);
    if (needGeo.length) {
      var haveAll = S.assets.topojson && S.assets.geo && needGeo.every(function (k) { return S.assets.geo[k]; })
        && (!Studio.usesGLMap(S.spec) || S.assets.maplibre); // V4: GL panels wait for MapLibre too
      if (!haveAll) { ensureGeoAssets(S.spec).then(function () { doRefresh(); }); return; }
    }
    // H-track v117: in Demo mode substitute varied sample data so values pulse realistically.
    var mockData = S.demoMode ? genMockLive(S.spec, _demoTick) : Studio.genMock(S.spec);
    var opts = { deployPath: S.settings.deployPath, preview: true, mock: mockData, launcher: false };

    var html = Studio.buildHtml(S.spec, S.assets, opts);
    ifr.onload = function () {
      postToPreview({ type: "theme", value: S.theme });
      highlightPreview();
      var n = (S.spec.panels || []).length, k = (S.spec.kpis || []).length;
      var dataLabel = S.demoMode ? " · demo LIVE" : " · sample data";
      $("#previewStatus").textContent = n + " widget" + (n === 1 ? "" : "s") + (k ? " · " + k + " KPI" + (k === 1 ? "" : "s") : "") + dataLabel;
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
    _exportHistory = lsGet("studio-export-history", []);
  }
  function recordExport(kind, name) {
    _exportHistory.unshift({ kind: kind, name: name, ts: new Date().toISOString() });
    _exportHistory = _exportHistory.slice(0, 5);
    lsSet("studio-export-history", _exportHistory);
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
  /* ★★★-1 (2026-07-15): the dashboard catalog lives in the WORKSPACE STORE
     (Studio.Workspace `dashboards` table) — the same local-first store that
     already mirrors connections + datasets + settings to Turso/Supabase/
     Firebase via the write-through sync, so saved dashboards now travel to
     the remote backend too. Rows keep the historical recents-entry shape
     {id, ts, spec, workbookId?} plus `pinned`/`pinnedAt` (pins ride ON the
     row now, so they mirror as well) and promoted title/name columns.
     `studio-recents`/`studio-pins`/`studio-workbooks` are migrated once at
     boot (see migrateDashboardCatalog) and left behind untouched as a frozen
     local backup — never wiped. */
  // M4.2 (per-section rights + object privacy, slice 1 — dashboards): a `private`
  // flag + `owner` (the account id that created it) ride on the dashboards row like
  // `pinned` does. UX-level gating only (matching auth.js/shell.js's own honesty
  // about not being cryptographic enforcement — real DB-enforced privacy is the
  // later Supabase-RLS slice, M7): hides another account's private dashboards from
  // Home/Dashboards, nothing more. No PolecatAuth loaded (local/no-auth mode) or an
  // admin account both see everything, matching shell.js's applyRoleGating fallback.
  function currentUserId() {
    var Auth = window.PolecatAuth, me = Auth && Auth.current();
    return me ? me.u : null;
  }
  function currentUserIsAdmin() {
    var Auth = window.PolecatAuth, me = Auth && Auth.current();
    return !Auth || !me || me.role === "admin";
  }
  function isVisibleToMe(r) {
    if (!r.private) return true;
    if (currentUserIsAdmin()) return true;
    var uid = currentUserId();
    return !!uid && r.owner === uid;
  }
  // M4.2 slice 3 (datasets): same rule, but the account-identity owner rides on
  // `acctOwner` since datasets already have an unrelated free-text `owner` field.
  // A distinct named function (rather than a second isVisibleToMe param) because
  // isVisibleToMe is passed BY REFERENCE straight into .filter() at several call
  // sites — Array#filter invokes its callback with (value, index, array), so a
  // second parameter there would silently receive the array index, not a field
  // name override.
  function isDatasetVisibleToMe(r) {
    if (!r.private) return true;
    if (currentUserIsAdmin()) return true;
    var uid = currentUserId();
    return !!uid && r.acctOwner === uid;
  }
  var _recentTimer = null;
  function scheduleNoteRecent() { clearTimeout(_recentTimer); _recentTimer = setTimeout(noteRecent, 800); }
  function loadRecents() {
    return Studio.Workspace.all("dashboards")
      .sort(function (a, b) { return (b.ts || "").localeCompare(a.ts || ""); });
  }
  // Pins are derived from row flags (newest pin first — the historical
  // `pins.unshift` ordering, preserved via pinnedAt).
  function loadPins() {
    return loadRecents()
      .filter(function (r) { return r.pinned; })
      .sort(function (a, b) { return (b.pinnedAt || "").localeCompare(a.pinnedAt || ""); })
      .map(function (r) { return r.id; });
  }
  // Retained for the repository-import merge path: applies an id list as
  // pinned flags (union semantics — never un-pins anything).
  function savePins(pins) {
    var W = Studio.Workspace, changed = false;
    (pins || []).forEach(function (id) {
      var r = W.get("dashboards", id);
      if (r && !r.pinned) { r.pinned = true; r.pinnedAt = r.pinnedAt || new Date().toISOString(); W.put("dashboards", r, { silent: true }); changed = true; }
    });
    if (changed) W.notify("dashboards");
  }
  function togglePin(id) {
    var W = Studio.Workspace, r = W.get("dashboards", id);
    if (!r) return;
    if (r.pinned) { delete r.pinned; delete r.pinnedAt; }
    else { r.pinned = true; r.pinnedAt = new Date().toISOString(); }
    W.put("dashboards", r);
    renderHome();
    renderDashboards();
  }
  // Viridis V6: "Feature on Home" — featured dashboards render on Home as LIVE
  // view-only previews (the real renderer on sample data), not just thumbnails.
  // The flag rides on the dashboards row like pinned does (additive, syncs).
  function toggleFeature(id) {
    var W = Studio.Workspace, r = W.get("dashboards", id);
    if (!r) return;
    if (r.featured) { delete r.featured; delete r.featuredAt; }
    else { r.featured = true; r.featuredAt = new Date().toISOString(); }
    W.put("dashboards", r);
    toast(r.featured ? "Featured on Home — it renders there live" : "No longer featured on Home");
    renderHome();
    renderDashboards();
  }
  window.__studioToggleFeature = toggleFeature; // test hook
  // M4.2 slice 1: the private/public toggle. Owner is stamped the first time a
  // dashboard goes private (covers rows created before this slice, which have no
  // owner yet) so it always has someone to stay visible to once it's flipped.
  function togglePrivate(id) {
    var W = Studio.Workspace, r = W.get("dashboards", id);
    if (!r) return;
    if (r.private) { delete r.private; }
    else {
      r.private = true;
      if (!r.owner) { var uid = currentUserId(); if (uid) r.owner = uid; }
    }
    W.put("dashboards", r);
    toast(r.private ? "Private — only you can see this" : "Public — visible to everyone");
    renderHome();
    renderDashboards();
  }
  window.__studioTogglePrivate = togglePrivate; // test hook
  function noteRecent() {
    if (!S.spec || !S.spec.id) return;
    var W = Studio.Workspace;
    // Preserve workbookId/pinned across the upsert — filing and pinning are
    // catalog organization tracked on the row, so a naive rebuild would
    // silently un-file/un-pin a dashboard every time its autosave debounce
    // ticks while it's open.
    var prior = W.get("dashboards", S.spec.id);
    var entry = { id: S.spec.id, ts: new Date().toISOString(), spec: Studio.clone(S.spec) };
    if (prior) {
      if (prior.workbookId) entry.workbookId = prior.workbookId;
      if (prior.pinned) { entry.pinned = true; entry.pinnedAt = prior.pinnedAt; }
      if (prior.createdAt) entry.createdAt = prior.createdAt;
      if (prior.owner) entry.owner = prior.owner;
      if (prior.private) entry.private = true;
    } else {
      var newUid = currentUserId();
      if (newUid) entry.owner = newUid;
    }
    entry.title = entry.spec.title || "";
    entry.name = entry.spec.name || "";
    W.put("dashboards", entry, { silent: true });
    // cap only the UNPINNED entries at 8 (newest-first) — pinning a dashboard
    // protects it from ever being evicted by newer activity.
    var unpinnedSeen = 0;
    loadRecents().forEach(function (r) {
      if (r.pinned) return;
      unpinnedSeen++;
      if (unpinnedSeen > 8) W.remove("dashboards", r.id, { silent: true });
    });
    W.notify("dashboards");
    pruneVersions(loadRecents().map(function (r) { return r.id; }));
    renderHome();
    renderDashboards();
  }
  // One-time boot migration: lift the legacy localStorage catalog into the
  // workspace store. Guarded by a meta stamp so an emptied catalog is never
  // re-populated from the stale backup on a later boot.
  function migrateDashboardCatalog() {
    var W = Studio.Workspace;
    if (W.meta().dashboardsMigratedAt) return;
    try {
      var old = JSON.parse(localStorage.getItem("studio-recents") || "[]");
      var pins = JSON.parse(localStorage.getItem("studio-pins") || "[]");
      var wbs = JSON.parse(localStorage.getItem("studio-workbooks") || "[]");
      if (old.length && !W.all("dashboards").length) {
        old.forEach(function (r) {
          if (!r || !r.id) return;
          if (pins.indexOf(r.id) >= 0) { r.pinned = true; r.pinnedAt = r.pinnedAt || r.ts || new Date().toISOString(); }
          r.title = (r.spec && r.spec.title) || r.title || "";
          r.name = (r.spec && r.spec.name) || r.name || "";
          W.put("dashboards", r, { silent: true });
        });
        W.notify("dashboards");
      }
      if (wbs.length && !(W.settings().workbooks || []).length) W.setSetting("workbooks", wbs);
    } catch (e) { /* malformed legacy data — start from the workspace as-is */ }
    W.setMeta("dashboardsMigratedAt", new Date().toISOString());
  }
  migrateDashboardCatalog();
  // Remote pulls (workspace backend Refresh / connect-adopt) replace the whole
  // store — repaint the dashboard surfaces when rows arrive from elsewhere.
  Studio.Workspace.on("replaced", function () { renderHome(); renderDashboards(); });
  // LF27(b): every "open the builder" call site routes through here so Close (below)
  // always knows where to return to. Only overwrite studioOrigin when arriving FROM some
  // other section — re-entering Studio while already there (e.g. Examples ▾ swapping the
  // spec, or the Home-card drop handlers firing mid-session) must not clobber the section
  // you originally opened it from.
  function enterStudio() {
    if (window.__studioShellGetSection) {
      var cur = window.__studioShellGetSection();
      if (cur && cur !== "studio") S.studioOrigin = cur;
    }
    if (window.__studioShellSetSection) window.__studioShellSetSection("studio");
  }
  function closeStudio() {
    if (window.__studioShellSetSection) window.__studioShellSetSection(S.studioOrigin || "dashboards");
  }
  function openRecent(id) {
    var r = loadRecents().filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    S.spec = normalize(r.spec); S.selection = null; syncHeader(); renderInspector(); refreshPreview(); buildLibrary();
    enterStudio();
    markLastViewed(id); // "since you were last here" resets the clock the moment you actually open it
  }

  /* ---------- N-FUN innovation idea: "what changed since your last visit" digest ----------
     Home/Repository already know when a dashboard was last touched (studio-recents) and Version
     history already snapshots a checkpoint on every Save — this combines them into a small "N
     changes since you were last here" line on a recent card, reusing the same diffSpecs/diffSummary
     engine Version-history-restore and Compare-dashboards already share (no new diff logic).
     `studio-last-viewed` tracks, per dashboard id, the ISO timestamp of the last time you actually
     OPENED it (not merely saw its card) — updated only by markLastViewed()/openRecent() so the
     window it measures is "since you last had this open," not "since the page last re-rendered." */
  var _LS_LASTVIEW = "studio-last-viewed";
  function loadLastViewed() { return lsGet(_LS_LASTVIEW, {}); }
  function markLastViewed(id) {
    var m = loadLastViewed(); m[id] = new Date().toISOString();
    lsSet(_LS_LASTVIEW, m);
  }
  // Finds the version-history checkpoint at-or-before `ts` (the dashboard's state as it stood the
  // last time you opened it) and diffs it against the CURRENT spec. Returns null when there's
  // nothing to show: no recorded last-view yet, no checkpoint old enough to diff from, or a clean
  // diff (you looked, but nothing has actually changed since).
  function changesSinceLastView(r) {
    var lastTs = loadLastViewed()[r.id];
    if (!lastTs) return null;
    var history = loadVersions()[r.id] || [];
    var baseline = history.filter(function (v) { return v.ts <= lastTs; })[0]; // newest-first list
    if (!baseline) return null;
    var lines = Studio.diffSummary(Studio.diffSpecs(baseline.spec || {}, r.spec || {}));
    return lines.length ? { count: lines.length, lines: lines } : null;
  }

  /* ---------- N-DIST: local version history ("time travel" for a dashboard) ----------
     A lightweight checkpoint list, distinct from in-session undo (memory-only, lost on
     reload) and from studio-autosave (a single unsaved draft). Every explicit Save (the
     download-a-.studio.json action) pushes a snapshot into studio-versions, keyed by
     dashboard id, newest-first, capped at 10 per dashboard. Version lists are pruned to
     only dashboards still tracked in studio-recents so this can't grow unbounded once a
     dashboard falls off Home/Repository. */
  var _LS_VERSIONS = "studio-versions";
  function loadVersions() { return lsGet(_LS_VERSIONS, {}); }
  function saveVersions(v) { lsSet(_LS_VERSIONS, v); }
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
  function loadCanvasNotes() { return lsGet(_LS_NOTES, {}); }
  function saveCanvasNotes(n) { lsSet(_LS_NOTES, n); }
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
      var targetOpts = [["", "General note (not tied to a widget)"]].concat(
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
    var list = loadRecents().filter(isVisibleToMe);
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
        postThemeOnLoad(pv.fr);
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
    var thumb = Studio.makeThumbnail(sp, S.theme, defaultDashboardTheme());
    var title = sp.title || sp.name || "Untitled";
    var wbSelect = "";
    if (wbOpts && wbOpts.workbooks) {
      var cur = r.workbookId || "";
      wbSelect = '<select class="recent-wb-sel" data-recent-wb="' + esc(r.id) + '" aria-label="Workbook for ' + esc(title) + '">' +
        '<option value="">No workbook</option>' +
        wbOpts.workbooks.map(function (w) { return '<option value="' + esc(w.id) + '"' + (cur === w.id ? " selected" : "") + '>' + esc(w.name) + '</option>'; }).join("") +
        '</select>';
    }
    var colHint = (wbOpts && wbOpts.matchedCol) ?
      '<small class="recent-col-match">Matches column “' + esc(wbOpts.matchedCol) + '”</small>' : '';
    var changed = changesSinceLastView(r);
    var changeHint = changed ?
      '<small class="recent-changed" title="' + esc(changed.lines.join("\n")) + '">' +
        changed.count + " change" + (changed.count === 1 ? "" : "s") + " since you were last here</small>" : '';
    return '<div class="recent-card">' +
      '<button class="recent-open" data-recent="' + esc(r.id) + '" aria-label="Open ' + esc(title) + '"></button>' +
      '<button class="recent-pin' + (pinned ? " pinned" : "") + '" data-pin="' + esc(r.id) + '" ' +
        'title="' + (pinned ? "Unpin" : "Pin") + '" aria-label="' + (pinned ? "Unpin " : "Pin ") + esc(title) + '" aria-pressed="' + (pinned ? "true" : "false") + '"></button>' +
      '<button class="recent-feature' + (r.featured ? " featured" : "") + '" data-feature="' + esc(r.id) + '" ' +
        'title="' + (r.featured ? "Remove from Home" : "Feature on Home (live preview)") + '" aria-label="' + (r.featured ? "Remove " : "Feature ") + esc(title) + (r.featured ? " from Home" : " on Home") + '" aria-pressed="' + (r.featured ? "true" : "false") + '"></button>' +
      '<button class="recent-private' + (r.private ? " private" : "") + '" data-private="' + esc(r.id) + '" ' +
        'title="' + (r.private ? "Private — only you can see this" : "Make private") + '" aria-label="' + (r.private ? "Make " + esc(title) + " public" : "Make " + esc(title) + " private") + '" aria-pressed="' + (r.private ? "true" : "false") + '"></button>' +
      '<div class="recent-thumb">' + thumb + '</div>' +
      '<div class="recent-meta"><b>' + esc(title) + '</b><small>' + timeAgo(r.ts) + ' · ' + meta + '</small>' + changeHint + colHint + wbSelect + '</div></div>';
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
    "Add a trend or forecast line to any Line/Scatter chart — pick linear or Holt exponential smoothing.",
    "Search the Repository by column name, not just title — a match shows exactly which data source column it hit."
  ];
  var _homeTipIdx = new Date().getDate() % HOME_TIPS.length;
  window.__studioHomeTipIdx = function () { return _homeTipIdx; }; // test hook
  window.__studioHomeTipsCount = function () { return HOME_TIPS.length; }; // test hook
  var _homeWbFilter = ""; // Z2 follow-up (folders/organization): "" = All, "__unfiled", else a workbook id
  window.__studioHomeWbFilter = function () { return _homeWbFilter; }; // test hook

  // M6 (Customizable Home, slice 1): the getting-started tiles stay fixed at the top, but the
  // content sections below them (Featured, Pinned analyses, Examples, Dashboards) can be
  // reordered with per-section move-up/down controls, persisted so the layout sticks. The stored
  // order is additive-safe: unknown keys are dropped, missing known keys are appended at the end,
  // so a future new section slots in without disturbing anyone's saved arrangement.
  // M6 "favorites-with-thumbnails": Datasets/Connections already carry the same star-shaped
  // `pinned`/`pinnedAt` flag as Dashboards/Analyses (the CX-pin "favorite" toggle, see the R4
  // comment above) — it just never surfaced past their own catalog lists. This section reuses
  // that EXISTING flag (no new data-model concept) and gives pinned datasets/connections the
  // same card-with-thumbnail treatment `pinnedAnalyses` already gives pinned analyses.
  var HOME_SECTION_KEYS = ["featured", "pinnedAnalyses", "favorites", "examples", "dashboards"];
  var HOME_SECTION_LABELS = { featured: "Featured", pinnedAnalyses: "Pinned analyses", favorites: "Favorite datasets & connections", examples: "Examples", dashboards: "Dashboards" };
  var HOME_SECTION_HINTS = { featured: "live previews · click to open", favorites: "pinned in Datasets/Connections · click to open", examples: "sample dashboards · click to open in the builder" };
  function getHomeSectionOrder() {
    var order = (lsGet("studio-home-section-order", []) || []).filter(function (k) { return HOME_SECTION_KEYS.indexOf(k) >= 0; });
    HOME_SECTION_KEYS.forEach(function (k) { if (order.indexOf(k) < 0) order.push(k); });
    return order;
  }
  function setHomeSectionOrder(order) { lsSet("studio-home-section-order", order); }
  // Sections that were actually ON SCREEN in the last render — moving a section swaps it with its
  // nearest VISIBLE neighbor, so an empty (currently hidden) section never blocks a reorder click.
  var _homeVisibleSectionKeys = HOME_SECTION_KEYS.slice();
  function moveHomeSection(key, dir) {
    var i = _homeVisibleSectionKeys.indexOf(key), j = i + dir;
    if (i < 0 || j < 0 || j >= _homeVisibleSectionKeys.length) return;
    var other = _homeVisibleSectionKeys[j];
    var order = getHomeSectionOrder();
    var oi = order.indexOf(key), oj = order.indexOf(other);
    if (oi < 0 || oj < 0) return;
    var t = order[oi]; order[oi] = order[oj]; order[oj] = t;
    setHomeSectionOrder(order);
    renderHome();
  }
  function homeSectionHeader(key) {
    var label = HOME_SECTION_LABELS[key], hint = HOME_SECTION_HINTS[key];
    return '<div class="home-sub-row"><h2 class="home-sub">' + esc(label) +
      (hint ? ' <small class="home-sub-hint">' + hint + '</small>' : '') + '</h2>' +
      '<div class="home-sub-move">' +
      '<button type="button" class="icobtn" data-home-move="' + key + '" data-dir="-1" title="Move ' + esc(label) + ' up" aria-label="Move ' + esc(label) + ' up"><span data-ic="chevron-up"></span></button>' +
      '<button type="button" class="icobtn" data-home-move="' + key + '" data-dir="1" title="Move ' + esc(label) + ' down" aria-label="Move ' + esc(label) + ' down"><span data-ic="chevron-down"></span></button>' +
      '</div></div>';
  }
  window.__studioHomeSectionOrder = { get: getHomeSectionOrder, set: setHomeSectionOrder, visible: function () { return _homeVisibleSectionKeys.slice(); } }; // test hook
  function renderHome() {
    var sec = $("#secHome"); if (!sec) return;
    var list = loadRecents().filter(isVisibleToMe), pins = loadPins();
    // Z2 follow-up (folders/organization): Repository already lets you file dashboards into
    // Workbooks (Z3); Home only ever showed one flat Recent/Pinned split with no way to narrow
    // by workbook. Reuses the exact same storage/helpers, just a lighter chip strip (no rename/
    // delete/add controls here — those stay Repository's job) since Home is a quick-glance view.
    var workbooks = loadWorkbooks();
    var validWbIds = {}; workbooks.forEach(function (w) { validWbIds[w.id] = true; });
    if (_homeWbFilter && _homeWbFilter !== "__unfiled" && !validWbIds[_homeWbFilter]) _homeWbFilter = "";
    var wbCounts = { all: list.length, unfiled: 0, byId: {} };
    list.forEach(function (r) {
      if (r.workbookId && validWbIds[r.workbookId]) wbCounts.byId[r.workbookId] = (wbCounts.byId[r.workbookId] || 0) + 1;
      else wbCounts.unfiled++;
    });
    var wbFiltered = list.filter(function (r) {
      if (_homeWbFilter === "__unfiled") return !r.workbookId || !validWbIds[r.workbookId];
      if (_homeWbFilter) return r.workbookId === _homeWbFilter;
      return true;
    });
    var pinnedList = wbFiltered.filter(function (r) { return pins.indexOf(r.id) >= 0; });
    var unpinnedList = wbFiltered.filter(function (r) { return pins.indexOf(r.id) < 0; });
    var wbChipsHtml = "";
    if (workbooks.length) {
      var wbChipDefs = [{ id: "", name: "All", n: wbCounts.all }]
        .concat(workbooks.map(function (w) { return { id: w.id, name: w.name, n: wbCounts.byId[w.id] || 0 }; }))
        .concat([{ id: "__unfiled", name: "Unfiled", n: wbCounts.unfiled }]);
      wbChipsHtml = '<div class="wb-chips home-wb-chips">' + wbChipDefs.map(function (c) {
        return '<button type="button" class="wb-chip' + (_homeWbFilter === c.id ? " active" : "") + '" data-home-wb-filter="' + esc(c.id) + '">' +
          '<span class="wb-chip-label">' + esc(c.name) + '</span> <span class="wb-chip-n">' + c.n + '</span></button>';
      }).join("") + '</div>';
    }
    var cards = [
      { act: "blank", ic: "plus", t: "Blank dashboard", d: "Start from scratch" }
    ].concat(showSamples() ? [{ act: "examples", ic: "grid", t: "Browse examples", d: "Sample dashboards on the demo database" }] : [])
      .concat([{ act: "tour", ic: "play", t: "Take the tour", d: "Guided walkthrough of the builder" }]);
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
      wbChipsHtml;
    // M6 slice 1: the four content sections below the getting-started tiles are independently
    // reorderable (move-up/down per section, order persisted) — see HOME_SECTION_KEYS above.
    var homeSectionBodies = {
      // Viridis V6: featured dashboards render LIVE on Home — real preview
      // iframes (the actual renderer on sample data), view-only, click to open.
      featured: function () {
        var feat = list.filter(function (r) { return r.featured && r.spec; })
          .sort(function (a, b) { return (b.featuredAt || "").localeCompare(a.featuredAt || ""); });
        if (!feat.length) return "";
        var shownF = feat.slice(0, 6);
        // M6: the most-recently-featured dashboard renders as a HERO \u2014 full-width, taller live
        // preview \u2014 so it occupies real Home estate the way a single at-a-glance chart should;
        // the rest of the featured set stays a normal grid below it. Same click-to-open (drills
        // into the real Studio editor) as every other featured card, just given top billing.
        function featCard(r, isHero) {
          var sp = r.spec, title = sp.title || sp.name || "Untitled";
          return '<div class="home-feat' + (isHero ? " home-feat-hero" : "") + '" data-home-feat="' + esc(r.id) + '">' +
            '<div class="home-feat-h"><span class="home-feat-title">' + (isHero ? '<span class="home-hero-badge">Hero</span>' : "") + '<b>' + esc(title) + '</b></span>' +
            '<span>' + (sp.panels || []).length + " panels" + ((sp.kpis || []).length ? " \u00b7 " + sp.kpis.length + " KPIs" : "") + "</span></div>" +
            '<div class="home-feat-frame" data-feat-frame="' + esc(r.id) + '"></div>' +
            '<button type="button" class="home-feat-open" data-feat-open="' + esc(r.id) + '" aria-label="Open ' + esc(title) + '"></button></div>';
        }
        return '<div class="home-featured">' + featCard(shownF[0], true) +
          shownF.slice(1).map(function (r) { return featCard(r, false); }).join("") + "</div>" +
          (feat.length > 6 ? '<div class="home-feat-more">+ ' + (feat.length - 6) + " more featured \u2014 see Dashboards</div>" : "");
      },
      // Viridis V5/V6: analyses pinned in Explore render as LIVE widgets — the
      // quickest path from "open the app" to "see my chart". Click opens Explore.
      pinnedAnalyses: function () {
        var pinnedA = (Studio.Workspace ? Studio.Workspace.all("analyses") : []).filter(isVisibleToMe).filter(function (a) { return a.pinned; })
          .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
        if (!pinnedA.length) return "";
        return '<div class="home-analyses">' + pinnedA.slice(0, 8).map(function (a) {
          return '<div class="home-analysis" data-home-analysis-card="' + esc(a.id) + '">' +
            '<div class="home-feat-h"><b>' + esc(a.name || "Analysis") + '</b>' +
            '<span>' + esc((Studio.CHARTS[a.chartType] || {}).label || a.chartType) + "</span></div>" +
            '<div class="home-analysis-frame" data-analysis-frame="' + esc(a.id) + '"></div>' +
            '<button type="button" class="home-feat-open" data-home-analysis="' + esc(a.id) + '" aria-label="Open analysis ' + esc(a.name || "") + '"></button></div>';
        }).join("") + "</div>";
      },
      // M6 "favorites-with-thumbnails": pinned Datasets/Connections (the same star toggle
      // their own catalog rows already carry) get a lightweight card here — a "thumbnail"
      // is the adapter's own icon/accent plus a one-line stat, not a live chart iframe (these
      // objects aren't chart-shaped). Click opens the same editor the catalog row's Edit does.
      favorites: function () {
        var pinnedDs = (Studio.Workspace ? Studio.Workspace.all("datasets") : []).filter(isDatasetVisibleToMe).filter(function (d) { return d.pinned; });
        var pinnedCx = (Studio.Workspace ? Studio.Workspace.all("connections") : []).filter(isVisibleToMe).filter(function (c) { return c.pinned; });
        var favs = pinnedDs.map(function (d) { return { kind: "dataset", r: d }; })
          .concat(pinnedCx.map(function (c) { return { kind: "connection", r: c }; }))
          .sort(function (a, b) { return (b.r.pinnedAt || "").localeCompare(a.r.pinnedAt || ""); });
        if (!favs.length) return "";
        function favCard(it) {
          var r = it.r, isDs = it.kind === "dataset";
          var src = isDs ? dsxAdapterOf(r) : Studio.sourceById(r.adapter);
          var icon = (src && src.icon) || "db", accent = (src && src.accent) || "var(--brand)";
          var stat = isDs
            ? ((r.columns || []).length ? (r.columns.length + " column" + (r.columns.length !== 1 ? "s" : "")) : "Not run yet")
            : (src ? src.label : r.adapter);
          var attr = isDs ? "data-home-fav-dataset" : "data-home-fav-connection";
          return '<div class="home-fav" data-home-fav="' + esc(r.id) + '">' +
            '<div class="home-feat-h"><b>' + esc(r.name) + '</b><span>' + (isDs ? "Dataset" : "Connection") + '</span></div>' +
            '<div class="home-fav-body"><span class="home-fav-ic" style="color:' + esc(accent) + '" data-home-fav-ic="' + esc(icon) + '"></span>' +
            '<span class="home-fav-stat">' + esc(stat) + '</span></div>' +
            '<button type="button" class="home-feat-open" ' + attr + '="' + esc(r.id) + '" aria-label="Open ' + (isDs ? "dataset " : "connection ") + esc(r.name) + '"></button></div>';
        }
        return '<div class="home-favorites">' + favs.slice(0, 8).map(favCard).join("") + "</div>" +
          (favs.length > 8 ? '<div class="home-feat-more">+ ' + (favs.length - 8) + " more favorites — see Datasets/Connections</div>" : "");
      },
      // Conservation Insight (M1): the bundled example dashboards get a first-class
      // Home section (they used to hide inside the Studio Examples menu). Each card
      // is the real layout thumbnail; click loads it into the builder.
      examples: function () {
        var vis = visibleExamples();
        if (!showSamples() || !vis.length) return "";
        return '<div class="home-examples">' + vis.slice(0, 8).map(function (e) {
          var types = (e.types || []).slice(0, 3).map(function (t) { return '<span class="ex-chip">' + esc(t) + '</span>'; }).join("");
          return '<button type="button" class="home-ex-card" data-home-example="' + esc(e.file) + '">' +
            '<div class="home-ex-thumb" aria-hidden="true">' + exLayoutSvg(e) + '</div>' +
            '<div class="home-ex-title">' + esc(e.title || e.file) + '</div>' +
            (types ? '<div class="home-ex-types">' + types + '</div>' : '') +
            '</button>';
        }).join("") + '</div>' +
          (vis.length > 8 ? '<div class="home-feat-more">+ ' + (vis.length - 8) + ' more \u2014 New \u25b8 Examples</div>' : '');
      },
      dashboards: function () {
        // Always renders SOMETHING (grids or the friendly empty hint) — never hidden — so it
        // anchors the reorderable stack even on a brand-new workspace with nothing pinned/featured.
        return (pinnedList.length ? '<h2 class="home-sub home-sub-nested">Pinned</h2><div class="home-recents">' +
          pinnedList.map(function (r) { return recentCardHtml(r, true); }).join("") + '</div>' : "") +
          (unpinnedList.length ? '<h2 class="home-sub home-sub-nested">Recent dashboards</h2><div class="home-recents">' +
            unpinnedList.map(function (r) { return recentCardHtml(r, false); }).join("") + '</div>'
            : (pinnedList.length ? "" : '<div class="home-empty-hint">' +
              (_homeWbFilter ? "No dashboards in this workbook yet." : "No recent dashboards yet \u2014 start one above and it will show up here.") +
              '</div>'));
      }
    };
    var homeOrder = getHomeSectionOrder();
    var homeVisible = [];
    html += homeOrder.map(function (key) {
      var body = homeSectionBodies[key]();
      if (!body) return "";
      homeVisible.push(key);
      return '<div class="home-block" data-home-sec="' + key + '">' + homeSectionHeader(key) + body + '</div>';
    }).join("");
    _homeVisibleSectionKeys = homeVisible;
    sec.classList.add("has-content");
    sec.innerHTML = html;
    $$("[data-home-wb-filter]", sec).forEach(function (btn) {
      btn.onclick = function () { _homeWbFilter = btn.getAttribute("data-home-wb-filter"); renderHome(); };
    });
    $$("[data-ic]", sec).forEach(function (span) { span.appendChild(Studio.icon(span.getAttribute("data-ic"), span.classList.contains("home-card-ic") ? 18 : 14)); });
    $$("[data-home-move]", sec).forEach(function (btn) {
      btn.onclick = function () { moveHomeSection(btn.getAttribute("data-home-move"), +btn.getAttribute("data-dir")); };
    });
    $$(".home-card", sec).forEach(function (btn) {
      btn.onclick = function () {
        var act = btn.getAttribute("data-home");
        enterStudio();
        if (act === "blank") { S.spec = applyDashboardDefaults(Studio.emptySpec()); S.selection = null; syncHeader(); renderInspector(); refreshPreview(); buildLibrary(); bumpDashMilestone(); }
        else if (act === "examples") { setTimeout(function () { var b = $("#btnExamples"); if (b) b.click(); }, 60); }
        else if (act === "tour") { setTimeout(function () { if (window.StudioTutorial) StudioTutorial.open(); }, 60); }
      };
    });
    // Drag a Datasets-catalog row straight onto "Blank dashboard" to start one
    // seeded with it (post-overhaul backlog item 6) — same {wsDataset} drop
    // contract the Studio canvas already accepts.
    var blankCard = $('.home-card[data-home="blank"]', sec);
    if (blankCard) {
      ["dragenter", "dragover"].forEach(function (ev) {
        blankCard.addEventListener(ev, function (e) { e.preventDefault(); blankCard.classList.add("dragover"); e.dataTransfer.dropEffect = "copy"; });
      });
      ["dragleave", "drop"].forEach(function (ev) {
        blankCard.addEventListener(ev, function (e) { if (ev === "dragleave" && e.target !== blankCard && blankCard.contains(e.relatedTarget)) return; blankCard.classList.remove("dragover"); });
      });
      blankCard.addEventListener("drop", function (e) {
        e.preventDefault(); blankCard.classList.remove("dragover");
        try {
          var d = JSON.parse(e.dataTransfer.getData("text/plain"));
          if (d && d.wsDataset && Studio.Workspace.get("datasets", d.wsDataset)) {
            enterStudio();
            S.spec = applyDashboardDefaults(Studio.emptySpec()); S.selection = null; syncHeader();
            bumpDashMilestone();
            addFromWorkspaceDataset(d.wsDataset, "bars");
          }
        } catch (x) {}
      });
    }
    var tipNext = $(".home-tip-next", sec);
    if (tipNext) tipNext.onclick = function () { _homeTipIdx = (_homeTipIdx + 1) % HOME_TIPS.length; renderHome(); };
    $$("[data-home-example]", sec).forEach(function (btn) {
      btn.onclick = function () {
        enterStudio();
        loadExample(btn.getAttribute("data-home-example"));
      };
    });
    $$("[data-home-analysis]", sec).forEach(function (btn) {
      btn.onclick = function () {
        if (window.__studioShellSetSection) __studioShellSetSection("explore");
        xpLoadAnalysis(btn.getAttribute("data-home-analysis"));
      };
    });
    $$("[data-home-fav-dataset]", sec).forEach(function (btn) {
      btn.onclick = function () { openDatasetEditor(Studio.Workspace.get("datasets", btn.getAttribute("data-home-fav-dataset"))); };
    });
    $$("[data-home-fav-connection]", sec).forEach(function (btn) {
      btn.onclick = function () { openConnectionWizard(Studio.Workspace.get("connections", btn.getAttribute("data-home-fav-connection"))); };
    });
    $$(".home-fav-ic", sec).forEach(function (span) { span.appendChild(Studio.icon(span.getAttribute("data-home-fav-ic"), 20)); });
    $$(".recent-open", sec).forEach(function (btn) { btn.onclick = function () { openRecent(btn.getAttribute("data-recent")); }; });
    $$(".recent-pin", sec).forEach(function (btn) {
      btn.appendChild(Studio.icon("star", 14));
      btn.onclick = function (e) { e.stopPropagation(); togglePin(btn.getAttribute("data-pin")); };
    });
    $$(".recent-feature", sec).forEach(function (btn) {
      btn.appendChild(Studio.icon("home", 14));
      btn.onclick = function (e) { e.stopPropagation(); toggleFeature(btn.getAttribute("data-feature")); };
    });
    $$(".recent-private", sec).forEach(function (btn) {
      btn.appendChild(Studio.icon("lock", 13));
      btn.onclick = function (e) { e.stopPropagation(); togglePrivate(btn.getAttribute("data-private")); };
    });
    // V6: hydrate the live frames AFTER the html lands (each is the real
    // renderer in a scaled, view-only iframe; geometry inlined when needed)
    $$("[data-feat-frame]", sec).forEach(function (box) {
      var r = Studio.Workspace.get("dashboards", box.getAttribute("data-feat-frame"));
      if (r && r.spec) homeLiveFrame(box, r.spec, 1200);
    });
    $$("[data-analysis-frame]", sec).forEach(function (box) {
      var a = Studio.Workspace.get("analyses", box.getAttribute("data-analysis-frame"));
      if (a && a.chart) homeLiveFrame(box, analysisSpec(a), 720, 96); // crop the mini banner — widgets are chart-first
    });
    $$("[data-feat-open]", sec).forEach(function (btn) {
      btn.onclick = function () { openRecent(btn.getAttribute("data-feat-open")); };
    });
  }
  // A live, view-only mini render of a spec: the REAL preview html in an iframe
  // scaled from its design width down to the card. pointer-events are disabled
  // in CSS — the overlay button owns the click. Hydration is LAZY: renderHome
  // often runs while Home is hidden (workspace change events), where the box
  // measures 0 — so the frame is only built once the box is actually visible
  // (IntersectionObserver), which also spares offscreen work.
  function homeLiveFrame(box, spec, designW, cropTop) {
    var build = function () {
      var html;
      try { html = Studio.buildHtml(spec, S.assets, { preview: true, mock: Studio.genMock(spec), launcher: false }); }
      catch (e) { box.innerHTML = '<div class="home-feat-err">Preview unavailable</div>'; return; }
      var ifr = document.createElement("iframe");
      ifr.className = "home-live-ifr";
      ifr.setAttribute("tabindex", "-1");
      ifr.setAttribute("aria-hidden", "true");
      ifr.style.width = designW + "px";
      function fit() {
        var w = box.clientWidth;
        if (!w) return; // hidden again — the ResizeObserver re-fits on return
        var s = w / designW;
        ifr.style.transform = "scale(" + s + ")";
        ifr.style.top = -Math.round((cropTop || 0) * s) + "px";
        ifr.style.height = Math.max(120, Math.ceil((box.clientHeight || 220) / s) + (cropTop || 0)) + "px";
      }
      box.innerHTML = "";
      box.appendChild(ifr);
      fit();
      // the mini render follows the app's light/dark theme (same message the
      // builder preview uses)
      postThemeOnLoad(ifr);
      ifr.srcdoc = html;
      if (window.ResizeObserver) { box._ro = new ResizeObserver(fit); box._ro.observe(box); }
    };
    var start = function () {
      if (box._liveStarted) return;
      box._liveStarted = true;
      if (Studio.geoAssetKeys(spec).length) { ensureGeoAssets(spec).then(build); } else { build(); }
    };
    if (box.clientWidth) { start(); return; }
    if ("IntersectionObserver" in window) {
      box._io = new IntersectionObserver(function (es) {
        if (es.some(function (e) { return e.isIntersecting; })) { box._io.disconnect(); start(); }
      });
      box._io.observe(box);
    } else { setTimeout(start, 400); }
  }
  window.__studioRenderHome = renderHome; // test hook
  window.__studioRecents = loadRecents; // test hook
  window.__studioOpenRecent = openRecent; // test hook
  window.__studioPins = loadPins; // test hook
  window.__studioTogglePin = togglePin; // test hook
  window.__studioNoteRecent = noteRecent; // test hook
  // test hook: replace the whole dashboard catalog (rows in recents-entry shape)
  window.__studioSeedDashboards = function (rows) {
    var W = Studio.Workspace;
    W.all("dashboards").forEach(function (r) { W.remove("dashboards", r.id, { silent: true }); });
    (rows || []).forEach(function (r) {
      if (!r || !r.id) return;
      r.title = (r.spec && r.spec.title) || r.title || "";
      r.name = (r.spec && r.spec.name) || r.name || "";
      W.put("dashboards", r, { silent: true });
    });
    W.notify("dashboards");
    renderHome(); renderDashboards();
  };
  window.__studioVersions = loadVersions; // test hook
  window.__studioSnapshotVersion = snapshotVersion; // test hook
  window.__studioRestoreVersion = restoreVersion; // test hook
  window.__studioLastViewed = loadLastViewed; // test hook
  window.__studioMarkLastViewed = markLastViewed; // test hook
  window.__studioChangesSinceLastView = changesSinceLastView; // test hook
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
  /* ★★★-1: workbooks moved into WORKSPACE SETTINGS (settings already mirror to
     the remote backend), so the named collections travel with the dashboards
     that are filed into them. Legacy `studio-workbooks` is migrated once at
     boot (migrateDashboardCatalog) and left as a frozen local backup. */
  function loadWorkbooks() { return (Studio.Workspace.settings().workbooks || []).slice(); }
  function saveWorkbooks(list) { Studio.Workspace.setSetting("workbooks", list); }
  function addWorkbook(name) {
    name = (name || "").trim(); if (!name) return null;
    var wb = { id: "wb" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name, ts: new Date().toISOString() };
    var list = loadWorkbooks(); list.unshift(wb); saveWorkbooks(list);
    return wb;
  }
  function deleteWorkbook(id) {
    saveWorkbooks(loadWorkbooks().filter(function (w) { return w.id !== id; }));
    var W = Studio.Workspace, changed = false;
    loadRecents().forEach(function (r) {
      if (r.workbookId === id) { delete r.workbookId; W.put("dashboards", r, { silent: true }); changed = true; }
    });
    if (changed) W.notify("dashboards");
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
    var W = Studio.Workspace, r = W.get("dashboards", dashId);
    if (!r) return;
    if (workbookId) r.workbookId = workbookId; else delete r.workbookId;
    W.put("dashboards", r);
  }
  var _repoWbFilter = ""; // "" = All, "__unfiled" = no workbook, else a workbook id
  window.__studioWorkbooks = loadWorkbooks; // test hook
  window.__studioAddWorkbook = addWorkbook; // test hook
  window.__studioDeleteWorkbook = deleteWorkbook; // test hook
  window.__studioRenameWorkbook = renameWorkbook; // test hook
  window.__studioSetDashboardWorkbook = setDashboardWorkbook; // test hook

  // N-DATA freshness badge (v301): only the connector kinds that are ALWAYS live-capable
  // regardless of the builder's ambient "active connection" setting get a library badge —
  // a plain sql catalog DA's "live-ness" depends on that global setting, not the DA.
  var REPO_LIVE_KINDS = { duckdb: 1, httpvfs: 1, snowflake: 1, databricks: 1, bigquery: 1, http: 1 };
  // Dashboards section (was "Repository"): the saved-dashboards catalog only —
  // data-source browsing moved to the Datasets/Connections sections, and the
  // sample catalog stays reachable from the Studio library pane.
  var _dashViewMode = "tiles";
  try { _dashViewMode = localStorage.getItem("studio-dash-view") || "tiles"; } catch (e) {}
  function renderDashboards() {
    var results = $("#repoResults"); if (!results) return;
    var q = (($("#repoSearch") || {}).value || "").toLowerCase();
    var list = loadRecents().filter(isVisibleToMe), pins = loadPins(), workbooks = loadWorkbooks();
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
    // Innovation-sweep idea (added 2026-07-04): "which of my saved dashboards use column X" —
    // once a query's schema changes upstream, this is the only way to find the blast radius
    // without opening every dashboard. Falls back to matching a bound data access's column
    // names once the title/desc don't match, and surfaces WHICH column matched on the card so
    // a title-less hit isn't a mystery.
    function matchedColumnName(sp, ql) {
      var found = null;
      ((sp.cda && sp.cda.dataAccesses) || []).some(function (da) {
        return (da.columns || []).some(function (c) {
          if (String(c).toLowerCase().indexOf(ql) >= 0) { found = c; return true; }
          return false;
        });
      });
      return found;
    }
    var dashMatches = filtered.map(function (r) {
      var sp = r.spec || {};
      if (!q) return { r: r, show: true, col: null };
      var titleMatch = ((sp.title || sp.name || "") + " " + (sp.desc || "")).toLowerCase().indexOf(q) >= 0;
      var col = titleMatch ? null : matchedColumnName(sp, q);
      return { r: r, show: titleMatch || !!col, col: col };
    }).filter(function (x) { return x.show; });
    // tiles (thumbnail cards) or a compact list — the user picks via #dashViewToggle
    var dashCards = _dashViewMode === "list"
      ? dashMatches.map(function (x) { return dashListRowHtml(x.r, pins.indexOf(x.r.id) >= 0, x.col); })
      : dashMatches.map(function (x) { return recentCardHtml(x.r, pins.indexOf(x.r.id) >= 0, { workbooks: workbooks, matchedCol: x.col }); });
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
      '<h2 class="home-sub">Dashboards <span class="repo-count">' + dashCards.length + ' of ' + filtered.length + '</span></h2>' +
      chipsHtml +
      (dashCards.length
        ? (_dashViewMode === "list" ? '<div class="cx-list dash-list">' + dashCards.join("") + '</div>'
                                    : '<div class="home-recents">' + dashCards.join("") + '</div>')
        : '<div class="home-empty-hint">' + (q ? "No dashboards match “" + esc(q) + "”." : (_repoWbFilter ? "No dashboards in this workbook yet." : "No dashboards yet — build one in Studio and it will show up here.")) + '</div>');
    $$("[data-wb-filter]", results).forEach(function (btn) {
      btn.onclick = function () { _repoWbFilter = btn.getAttribute("data-wb-filter"); renderDashboards(); };
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
          renderDashboards();
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
          renderDashboards();
        }
      };
    });
    var wbAddBtn = $("#wbAddBtn", results);
    if (wbAddBtn) wbAddBtn.onclick = function () {
      var inp = $("#wbNameInp", results);
      var name = inp ? inp.value.trim() : "";
      // an empty name used to silently no-op — that reads as a dead button
      if (!name) { if (inp) inp.focus(); toast("Type a name in the box first — e.g. “Client demos”.", true); return; }
      var wb = addWorkbook(name);
      if (wb) { toast("Workbook “" + wb.name + "” created"); _repoWbFilter = wb.id; renderDashboards(); }
    };
    var wbNameInp = $("#wbNameInp", results);
    if (wbNameInp) wbNameInp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); wbAddBtn.click(); } });
    $$(".recent-wb-sel", results).forEach(function (sel) {
      sel.addEventListener("click", function (e) { e.stopPropagation(); });
      sel.addEventListener("change", function () {
        setDashboardWorkbook(sel.getAttribute("data-recent-wb"), sel.value);
        renderDashboards();
      });
    });
    $$(".recent-open", results).forEach(function (btn) { btn.onclick = function () { openRecent(btn.getAttribute("data-recent")); }; });
    $$(".recent-pin", results).forEach(function (btn) {
      btn.appendChild(Studio.icon("star", 14));
      btn.onclick = function (e) { e.stopPropagation(); togglePin(btn.getAttribute("data-pin")); };
    });
    $$(".recent-feature", results).forEach(function (btn) {
      btn.appendChild(Studio.icon("home", 14));
      btn.onclick = function (e) { e.stopPropagation(); toggleFeature(btn.getAttribute("data-feature")); };
    });
    $$(".recent-private", results).forEach(function (btn) {
      btn.appendChild(Studio.icon("lock", 13));
      btn.onclick = function (e) { e.stopPropagation(); togglePrivate(btn.getAttribute("data-private")); };
    });
    $$(".dash-li", results).forEach(function (row) {
      row.addEventListener("click", function (e) {
        if (e.target.closest(".recent-pin,.recent-private,.recent-wb-sel")) return;
        openRecent(row.getAttribute("data-recent"));
      });
      row.addEventListener("keydown", function (e) {
        if ((e.key === "Enter" || e.key === " ") && e.target === row) { e.preventDefault(); openRecent(row.getAttribute("data-recent")); }
      });
    });
  }
  // Compact list-mode row for the Dashboards section (same anatomy as the
  // Connections/Datasets rows, so the whole workspace browses one way).
  function dashListRowHtml(r, pinned, matchedCol) {
    var sp = r.spec || {}, panels = (sp.panels || []).length, kpis = (sp.kpis || []).length;
    var title = sp.title || sp.name || "Untitled";
    var meta = [sp.name || "", panels + " panel" + (panels === 1 ? "" : "s") + (kpis ? " · " + kpis + " KPI" + (kpis === 1 ? "" : "s") : "")]
      .filter(Boolean).join(" · ");
    var when = r.ts ? new Date(r.ts).toLocaleDateString() : "";
    return '<div class="cx-row dash-li" data-recent="' + esc(r.id) + '" tabindex="0" role="button" aria-label="Open ' + esc(title) + '">' +
      '<span class="cx-name"><b>' + esc(title) + '</b><small>' + esc(meta) +
        (matchedCol ? ' · matches column “' + esc(matchedCol) + '”' : "") + '</small></span>' +
      (sp.dashboardTheme ? '<span class="cx-badge">' + esc(sp.dashboardTheme) + '</span>' : "") +
      '<span class="cx-when">' + esc(when) + '</span>' +
      '<span class="cx-actions"><button type="button" class="recent-pin' + (pinned ? " pinned" : "") + '" data-pin="' + esc(r.id) + '" title="' + (pinned ? "Unpin" : "Pin to Home") + '" aria-pressed="' + (pinned ? "true" : "false") + '"></button>' +
      '<button type="button" class="recent-private cx-list-private' + (r.private ? " private" : "") + '" data-private="' + esc(r.id) + '" title="' + (r.private ? "Private — only you can see this" : "Make private") + '" aria-label="' + (r.private ? "Make " + esc(title) + " public" : "Make " + esc(title) + " private") + '" aria-pressed="' + (r.private ? "true" : "false") + '"></button></span>' +
      '</div>';
  }
  window.__studioRenderDashboards = renderDashboards; // test hook

  /* ---------- Connections section ----------
     Workspace-level connections to external sources (one adapter each), the
     first plane of the connections → datasets → dashboards model. List UX
     follows the fleet's jobtracker patterns: adapter pills are MULTI-select
     (toggle any subset; none = all), plus free-text search; rows carry a
     status dot from the last Test result. Rows live in Studio.Workspace
     ('connections' table) so a remote workspace backend can mirror them. */
  var _connAdapterFilter = {}; // multi-select: adapterId -> true; empty = all
  var _connTagFilter = {};     // multi-select tag -> true; empty = all (tags-filter parity slice 1, #21 org sub-item)
  // Folder pilot slice 2 (#21 org sub-item — same flat single-value `folder`
  // string + single-select chip facet as Datasets' `_dsxFolderFilter`).
  var _connFolderFilter = ""; // "" = All, "__unfiled" = no folder, else a folder name
  // Post-overhaul backlog item 6 follow-up ("same treatment for the
  // Connections list"): identical saved-view contract to the Datasets
  // section's dsxLoadViews/dsxSaveViews/dsxApplyView, now including the tag
  // axis too (see _connTagFilter above). Own key in the same Workspace
  // SETTINGS bag — travels with the workspace, no new "Clear local data"
  // entry needed.
  var _connViewsStore = makeViewsStore("connectionViews");
  function connLoadViews() { return _connViewsStore.load(); }
  function connSaveViews(list) { _connViewsStore.save(list); }
  function connApplyView(v) {
    var inp = $("#connSearch"); if (inp) inp.value = v.q || "";
    _connAdapterFilter = {}; (v.adapters || []).forEach(function (a) { _connAdapterFilter[a] = true; });
    _connTagFilter = {}; (v.tags || []).forEach(function (t) { _connTagFilter[t] = true; });
    _connFolderFilter = v.folder || "";
    renderConnections();
  }
  // Post-overhaul backlog item 7 ("organization at scale"): a favorite flag on
  // the row itself, same additive/syncing shape as the Dashboards `pinned`/
  // `pinnedAt` fields (togglePin above) — pinned connections sort to the top
  // of the catalog so a fast-growing list stays navigable without committing
  // to the still-undecided folders/tags grouping model.
  var toggleConnPin = makePinToggle("connections", function () { renderConnections(); });
  // M4.2 slice 2 (per-section rights + object privacy — connections): same
  // `private`/`owner` shape + `isVisibleToMe` helper as dashboards (slice 1).
  // A connection often carries credentials, so hiding it from other accounts'
  // catalogs (and the connection-picker in the dataset editor) matters even
  // more here than for dashboards.
  function toggleConnPrivate(id) {
    var W = Studio.Workspace, r = W.get("connections", id);
    if (!r) return;
    if (r.private) { delete r.private; }
    else {
      r.private = true;
      if (!r.owner) { var uid = currentUserId(); if (uid) r.owner = uid; }
    }
    W.put("connections", r);
    toast(r.private ? "Private — only you can see this" : "Public — visible to everyone");
    renderConnections();
  }
  window.__studioToggleConnPrivate = toggleConnPrivate; // test hook
  function connStatusDot(c) {
    var t = c.lastTest;
    var cls = !t ? "cx-dot" : (t.ok ? "cx-dot ok" : "cx-dot bad");
    var tip = !t ? "Never tested" : (t.ok ? "Test OK" : "Test failed: " + (t.error || "")) + " · " + new Date(t.at).toLocaleString();
    return '<span class="' + cls + '" title="' + esc(tip) + '"></span>';
  }
  function renderConnections() {
    var results = $("#connResults"); if (!results) return;
    var q = (($("#connSearch") || {}).value || "").toLowerCase();
    var list = Studio.Workspace.all("connections").filter(isVisibleToMe).sort(function (a, b) {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      if (a.pinned) return (b.pinnedAt || "").localeCompare(a.pinnedAt || "");
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    // adapter pills: one per adapter present, multi-select (empty selection = all)
    var counts = {}, tagCounts = {}, folderCounts = {}, folderUnfiled = 0;
    list.forEach(function (c) {
      counts[c.adapter] = (counts[c.adapter] || 0) + 1;
      (c.tags || []).forEach(function (t) { tagCounts[t] = (tagCounts[t] || 0) + 1; });
      if (c.folder) folderCounts[c.folder] = (folderCounts[c.folder] || 0) + 1; else folderUnfiled++;
    });
    Object.keys(_connAdapterFilter).forEach(function (k) { if (!counts[k]) delete _connAdapterFilter[k]; });
    Object.keys(_connTagFilter).forEach(function (k) { if (!tagCounts[k]) delete _connTagFilter[k]; });
    if (_connFolderFilter && _connFolderFilter !== "__unfiled" && !folderCounts[_connFolderFilter]) _connFolderFilter = "";
    var anyFilter = Object.keys(_connAdapterFilter).length > 0;
    var anyTag = Object.keys(_connTagFilter).length > 0;
    var anyConnFolder = !!_connFolderFilter;
    var pills = Object.keys(counts).sort().map(function (aid) {
      var src = Studio.sourceById(aid) || { label: aid };
      return '<button type="button" class="wb-chip cx-pill' + (_connAdapterFilter[aid] ? " active" : "") + '" data-conn-adapter="' + esc(aid) + '" aria-pressed="' + (_connAdapterFilter[aid] ? "true" : "false") + '">' +
        '<span class="cx-pill-dot" style="background:' + esc(src.accent || "var(--brand)") + '"></span>' +
        '<span class="wb-chip-label">' + esc(src.label) + '</span> <span class="wb-chip-n">' + counts[aid] + '</span></button>';
    }).join("");
    var pillsT = Object.keys(tagCounts).sort().map(function (t) {
      return '<button type="button" class="wb-chip cx-pill' + (_connTagFilter[t] ? " active" : "") + '" data-conn-tag="' + esc(t) + '" aria-pressed="' + (_connTagFilter[t] ? "true" : "false") + '">' +
        '<span class="wb-chip-label">#' + esc(t) + '</span> <span class="wb-chip-n">' + tagCounts[t] + '</span></button>';
    }).join("");
    // Folder facet (single-select, mirrors Datasets' pillsF): only appears
    // once at least one connection has been filed.
    var pillsFConn = Object.keys(folderCounts).length
      ? ['<button type="button" class="wb-chip cx-pill' + (!_connFolderFilter ? " active" : "") + '" data-conn-folder="" aria-pressed="' + (!_connFolderFilter ? "true" : "false") + '">' +
          '<span class="wb-chip-label">All folders</span> <span class="wb-chip-n">' + list.length + '</span></button>']
        .concat(Object.keys(folderCounts).sort().map(function (f) {
          return '<button type="button" class="wb-chip cx-pill' + (_connFolderFilter === f ? " active" : "") + '" data-conn-folder="' + esc(f) + '" aria-pressed="' + (_connFolderFilter === f ? "true" : "false") + '">' +
            '<span class="wb-chip-label">' + esc(f) + '</span> <span class="wb-chip-n">' + folderCounts[f] + '</span></button>';
        }))
        .concat(['<button type="button" class="wb-chip cx-pill' + (_connFolderFilter === "__unfiled" ? " active" : "") + '" data-conn-folder="__unfiled" aria-pressed="' + (_connFolderFilter === "__unfiled" ? "true" : "false") + '">' +
          '<span class="wb-chip-label">Unfiled</span> <span class="wb-chip-n">' + folderUnfiled + '</span></button>'])
        .join("")
      : "";
    var connViews = connLoadViews();
    var pillsV = connViews.map(function (v) {
      return '<div class="wb-chip-wrap">' +
        '<button type="button" class="wb-chip" data-conn-view="' + esc(v.id) + '" title="Apply saved view “' + esc(v.name) + '”">' +
          '<span class="wb-chip-label">' + esc(v.name) + '</span></button>' +
        '<button type="button" class="wb-chip-del" data-conn-view-del="' + esc(v.id) + '" title="Delete view ' + esc(v.name) + '" aria-label="Delete view ' + esc(v.name) + '"></button>' +
        '</div>';
    }).join("");
    var canSaveConnView = !!(q || anyFilter || anyTag || anyConnFolder);
    var connViewAddHtml = canSaveConnView
      ? '<span class="wb-add"><input type="text" id="connViewNameInp" class="wb-name-inp" placeholder="Name this view…" aria-label="Name this saved view"/>' +
        '<button type="button" class="btn" id="connViewAddBtn">+ Save view</button></span>'
      : "";
    var shown = list.filter(function (c) {
      if (anyFilter && !_connAdapterFilter[c.adapter]) return false;
      if (anyTag && !(c.tags || []).some(function (t) { return _connTagFilter[t]; })) return false;
      if (_connFolderFilter === "__unfiled") { if (c.folder) return false; }
      else if (_connFolderFilter) { if (c.folder !== _connFolderFilter) return false; }
      if (!q) return true;
      var src = Studio.sourceById(c.adapter) || {};
      var cfgHay = Object.keys(c.cfg || {}).map(function (k) {
        // never match on secrets
        var f = (src.fields || []).filter(function (x) { return x.key === k; })[0];
        return f && f.type === "password" ? "" : String(c.cfg[k] || "");
      }).join(" ");
      return (c.name + " " + (src.label || c.adapter) + " " + cfgHay + " " + (c.tags || []).join(" ") + " " + (c.folder || "")).toLowerCase().indexOf(q) >= 0;
    });
    var rows = shown.map(function (c) {
      var src = Studio.sourceById(c.adapter) || { label: c.adapter, icon: "db" };
      var metaBadge = src.caps && src.caps.meta ? '<span class="cx-badge" title="Can also host this app\'s workspace (see Settings → Workspace backend)">workspace-capable</span>' : "";
      var tagBadges = (c.tags || []).map(function (t) { return '<span class="cx-badge">#' + esc(t) + '</span>'; }).join("");
      var folderBadge = c.folder ? '<span class="cx-badge cx-folder" title="Folder: ' + esc(c.folder) + '">' + esc(c.folder) + '</span>' : "";
      return '<div class="cx-row" data-conn-id="' + esc(c.id) + '" tabindex="0" role="button" aria-label="Edit connection ' + esc(c.name) + '">' +
        connStatusDot(c) +
        '<span class="cx-ic" style="color:' + esc(src.accent || "var(--brand)") + '"></span>' +
        '<span class="cx-name"><b>' + esc(c.name) + '</b><small>' + esc(src.label || c.adapter) + '</small></span>' +
        metaBadge +
        folderBadge +
        tagBadges +
        '<span class="cx-when" title="Last edited">' + esc(new Date(c.updatedAt || c.createdAt || Date.now()).toLocaleDateString()) + '</span>' +
        '<button type="button" class="cx-private' + (c.private ? " private" : "") + '" data-conn-private="' + esc(c.id) + '" title="' + (c.private ? "Private — only you can see this" : "Make private") + '" aria-label="' + (c.private ? "Make " + esc(c.name) + " public" : "Make " + esc(c.name) + " private") + '" aria-pressed="' + (c.private ? "true" : "false") + '"></button>' +
        '<button type="button" class="cx-pin' + (c.pinned ? " on" : "") + '" data-conn-pin="' + esc(c.id) + '" title="' + (c.pinned ? "Unpin" : "Pin to top") + '" aria-label="' + (c.pinned ? "Unpin " : "Pin ") + esc(c.name) + '" aria-pressed="' + (c.pinned ? "true" : "false") + '"></button>' +
        '<span class="cx-actions">' +
          '<button type="button" class="btn" data-conn-test="' + esc(c.id) + '">Test</button>' +
          '<button type="button" class="btn" data-conn-edit="' + esc(c.id) + '">Edit</button>' +
          '<button type="button" class="btn" data-conn-del="' + esc(c.id) + '" aria-label="Delete ' + esc(c.name) + '">✕</button>' +
        '</span></div>';
    });
    results.innerHTML =
      (pillsFConn ? '<div class="wb-chips">' + pillsFConn + '</div>' : "") +
      (pills || pillsT || pillsV || connViewAddHtml ? '<div class="wb-chips cx-pills">' +
        pillsV + (pillsV && (pills || pillsT) ? '<span class="dsx-pill-sep"></span>' : "") +
        pills + (pills && pillsT ? '<span class="dsx-pill-sep"></span>' : "") +
        pillsT +
        ((anyFilter || anyTag || anyConnFolder) ? '<button type="button" class="wb-chip" id="connPillClear" title="Show all connections">Clear</button>' : "") +
        connViewAddHtml + '</div>' : "") +
      (rows.length ? '<div class="cx-list">' + rows.join("") + '</div>'
        : '<div class="cx-empty">' +
            (q || anyFilter || anyTag || anyConnFolder ? "No connections match." :
              "<b>No connections yet.</b><br/>A connection points at where your data lives — a warehouse, a file over HTTP, an API — using one of the built-in adapters. Datasets are then defined on top of a connection and feed your dashboards.") +
            (q || anyFilter || anyTag || anyConnFolder ? "" : '<br/><button type="button" class="btn primary" id="connEmptyNew">+ New connection</button>') +
          '</div>');
    $$("[data-conn-adapter]", results).forEach(function (btn) {
      btn.onclick = function () {
        var k = btn.getAttribute("data-conn-adapter");
        if (_connAdapterFilter[k]) delete _connAdapterFilter[k]; else _connAdapterFilter[k] = true;
        renderConnections();
      };
    });
    $$("[data-conn-tag]", results).forEach(function (btn) {
      btn.onclick = function () {
        var k = btn.getAttribute("data-conn-tag");
        if (_connTagFilter[k]) delete _connTagFilter[k]; else _connTagFilter[k] = true;
        renderConnections();
      };
    });
    $$("[data-conn-folder]", results).forEach(function (btn) {
      btn.onclick = function () { _connFolderFilter = btn.getAttribute("data-conn-folder"); renderConnections(); };
    });
    var clearBtn = $("#connPillClear", results);
    if (clearBtn) clearBtn.onclick = function () { _connAdapterFilter = {}; _connTagFilter = {}; _connFolderFilter = ""; renderConnections(); };
    $$("[data-conn-view]", results).forEach(function (btn) {
      btn.onclick = function () {
        var v = connLoadViews().filter(function (x) { return x.id === btn.getAttribute("data-conn-view"); })[0];
        if (v) connApplyView(v);
      };
    });
    $$("[data-conn-view-del]", results).forEach(function (btn) {
      btn.appendChild(Studio.icon("trash", 9));
      btn.onclick = function (e) {
        e.stopPropagation();
        var id = btn.getAttribute("data-conn-view-del");
        var v = connLoadViews().filter(function (x) { return x.id === id; })[0];
        if (!v) return;
        if (confirm('Delete saved view "' + v.name + '"?')) {
          connSaveViews(connLoadViews().filter(function (x) { return x.id !== id; }));
          renderConnections();
        }
      };
    });
    var connViewAddBtn = $("#connViewAddBtn", results);
    if (connViewAddBtn) connViewAddBtn.onclick = function () {
      var inp = $("#connViewNameInp", results);
      var name = inp ? inp.value.trim() : "";
      if (!name) { if (inp) inp.focus(); toast("Type a name in the box first — e.g. “Warehouses”.", true); return; }
      var list = connLoadViews();
      var rawQ = (($("#connSearch") || {}).value || "");
      list.unshift({ id: "connv" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name, q: rawQ, adapters: Object.keys(_connAdapterFilter), tags: Object.keys(_connTagFilter), folder: _connFolderFilter });
      connSaveViews(list);
      toast('View "' + name + '" saved');
      renderConnections();
    };
    var connViewNameInp = $("#connViewNameInp", results);
    if (connViewNameInp) connViewNameInp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); connViewAddBtn.click(); } });
    var emptyNew = $("#connEmptyNew", results);
    if (emptyNew) emptyNew.onclick = function () { openConnectionWizard(); };
    // paint adapter icons (inline SVG so theming is free)
    $$(".cx-row", results).forEach(function (row) {
      var c = Studio.Workspace.get("connections", row.getAttribute("data-conn-id"));
      var src = c && Studio.sourceById(c.adapter);
      var icEl = row.querySelector(".cx-ic");
      if (icEl && src) icEl.appendChild(Studio.icon(src.icon || "db", 18));
      row.addEventListener("click", function (e) {
        if (e.target.closest("[data-conn-pin],[data-conn-private],[data-conn-test],[data-conn-edit],[data-conn-del]")) return;
        openConnectionWizard(c);
      });
      row.addEventListener("keydown", function (e) {
        if ((e.key === "Enter" || e.key === " ") && e.target === row) { e.preventDefault(); openConnectionWizard(c); }
      });
    });
    $$(".cx-pin", results).forEach(function (btn) {
      btn.appendChild(Studio.icon("star", 14));
      btn.onclick = function (e) { e.stopPropagation(); toggleConnPin(btn.getAttribute("data-conn-pin")); };
    });
    $$(".cx-private", results).forEach(function (btn) {
      btn.appendChild(Studio.icon("lock", 14));
      btn.onclick = function (e) { e.stopPropagation(); toggleConnPrivate(btn.getAttribute("data-conn-private")); };
    });
    $$("[data-conn-test]", results).forEach(function (btn) {
      btn.onclick = function () {
        var c = Studio.Workspace.get("connections", btn.getAttribute("data-conn-test"));
        if (!c) return;
        btn.disabled = true; btn.textContent = "Testing…";
        testConnectionRow(c).then(function () { renderConnections(); });
      };
    });
    $$("[data-conn-edit]", results).forEach(function (btn) {
      btn.onclick = function () { openConnectionWizard(Studio.Workspace.get("connections", btn.getAttribute("data-conn-edit"))); };
    });
    $$("[data-conn-del]", results).forEach(function (btn) {
      btn.onclick = function () {
        var c = Studio.Workspace.get("connections", btn.getAttribute("data-conn-del"));
        if (!c) return;
        var used = Studio.Workspace.all("datasets").filter(function (d) { return d.connectionId === c.id; });
        var msg = used.length
          ? 'Delete connection "' + c.name + '"? ' + used.length + " dataset" + (used.length > 1 ? "s" : "") + " reference" + (used.length > 1 ? "" : "s") + " it and will stop running."
          : 'Delete connection "' + c.name + '"?';
        if (!window.confirm(msg)) return;
        Studio.Workspace.remove("connections", c.id);
        toast("Deleted " + c.name);
      };
    });
  }
  // Run the right plane's test for a connection row and persist the outcome
  // on the row itself, so the list's status dot reflects reality across reloads.
  function testConnectionRow(c) {
    var src = Studio.sourceById(c.adapter);
    if (!src) return Promise.resolve({ ok: false, error: "Unknown adapter " + c.adapter });
    var fn = src.caps && src.caps.data ? src.testData : src.test;
    return fn.call(src, c.cfg || {}).then(function (r) {
      c.lastTest = { ok: !!r.ok, error: r.ok ? "" : (r.error || "failed"), at: Date.now() };
      Studio.Workspace.put("connections", c, { silent: true });
      toast(r.ok ? "Connection OK" : "Test failed: " + (r.error || ""), !r.ok);
      return r;
    });
  }
  // Post-overhaul backlog item 5 ("dataset delight" — the schema-browser
  // half): renders adapter.listSchema()'s {tables:[{schema,name,columns}]}
  // as a filterable, per-table-expandable tree inside the connection
  // wizard's schema panel. A pure render function so it's easy to call from
  // both the fetch-success path and (via renderSchemaPanel(panel, r)) tests.
  function renderSchemaPanel(panel, r) {
    panel.innerHTML = "";
    if (r && r.error) {
      var err = el("div", "cx-schema-status bad"); err.textContent = "✕ " + r.error; panel.appendChild(err); return;
    }
    var tables = (r && r.tables) || [];
    if (!tables.length) {
      var empty = el("div", "cx-schema-status"); empty.textContent = "No tables found — check the connection's credentials cover schema-read access.";
      panel.appendChild(empty); return;
    }
    var filterRow = el("div", "cx-schema-filter");
    var filterInp = el("input"); filterInp.type = "text"; filterInp.placeholder = "Filter tables…"; filterInp.setAttribute("aria-label", "Filter tables");
    filterRow.appendChild(filterInp); panel.appendChild(filterRow);
    var list = el("div", "cx-schema-list"); panel.appendChild(list);
    var rows = tables.map(function (t) {
      var det = document.createElement("details"); det.className = "cx-schema-table";
      var summary = document.createElement("summary");
      var n = (t.columns || []).length;
      summary.innerHTML = "<b>" + esc(t.name) + "</b>" + (t.schema ? " <small>" + esc(t.schema) + "</small>" : "") +
        ' <span class="cx-schema-n">' + n + " col" + (n === 1 ? "" : "s") + "</span>";
      det.appendChild(summary);
      var colList = el("ul", "cx-schema-cols");
      (t.columns || []).forEach(function (c) {
        var li = document.createElement("li");
        li.innerHTML = '<span class="cx-schema-col">' + esc(c.name) + '</span><span class="cx-schema-type">' + esc(c.type || "") + "</span>";
        colList.appendChild(li);
      });
      det.appendChild(colList);
      list.appendChild(det);
      return { el: det, needle: ((t.schema || "") + " " + t.name).toLowerCase() };
    });
    filterInp.oninput = function () {
      var q = filterInp.value.trim().toLowerCase();
      rows.forEach(function (row) { row.el.hidden = !!q && row.needle.indexOf(q) === -1; });
    };
  }
  // The 2-step connect wizard (manager pattern): pick an adapter → name +
  // credential fields (from adapter.fields) with an inline Test. Editing an
  // existing connection opens straight at step 2.
  function openConnectionWizard(existing) {
    var src = existing ? Studio.sourceById(existing.adapter) : null;
    modal(existing ? "Edit connection" : "New connection", function (b) {
      function step2(adapter) {
        b.innerHTML = "";
        var head = el("div", "cx-wiz-head");
        var ic = el("span", "cx-wiz-ic"); ic.style.color = adapter.accent || "var(--brand)"; ic.appendChild(Studio.icon(adapter.icon || "db", 22));
        var ttl = el("div", "cx-wiz-ttl");
        ttl.innerHTML = "<b>" + esc(adapter.label) + "</b><small>" + esc(adapter.blurb || "") + "</small>";
        head.appendChild(ic); head.appendChild(ttl); b.appendChild(head);
        var form = el("div", "cx-wiz-form");
        var nameRow = el("label", "cx-field");
        nameRow.innerHTML = '<span>Connection name</span>';
        var nameInp = el("input"); nameInp.type = "text"; nameInp.value = existing ? existing.name : adapter.label;
        nameInp.placeholder = "e.g. Prod warehouse";
        nameRow.appendChild(nameInp); form.appendChild(nameRow);
        var inputs = {};
        (adapter.fields || []).forEach(function (f) {
          var row = el("label", "cx-field");
          row.innerHTML = "<span>" + esc(f.label) + "</span>";
          var inp = el("input");
          inp.type = f.type === "password" ? "password" : "text";
          inp.placeholder = f.placeholder || "";
          inp.autocomplete = "off";
          inp.value = (existing && existing.cfg && existing.cfg[f.key]) || "";
          row.appendChild(inp);
          if (f.hint) { var h = el("small", "cx-hint"); h.textContent = f.hint; row.appendChild(h); }
          form.appendChild(row); inputs[f.key] = inp;
        });
        var tagsRow = el("label", "cx-field");
        tagsRow.innerHTML = "<span>Tags</span>";
        var tagsInp = el("input"); tagsInp.type = "text"; tagsInp.placeholder = "finance, demo";
        tagsInp.value = (existing && existing.tags || []).join(", ");
        tagsRow.appendChild(tagsInp);
        var tagsHint = el("small", "cx-hint"); tagsHint.textContent = "Comma-separated groups for filtering (e.g. finance, demo). Anyone can slice the list by these.";
        tagsRow.appendChild(tagsHint);
        form.appendChild(tagsRow);
        // Folder pilot slice 2 (#21 org sub-item): same single-value "home"
        // field as Datasets, with a <datalist> of folders already in use
        // (filtered through isVisibleToMe so a private connection's folder
        // name doesn't leak into another account's suggestions).
        var folderRow = el("label", "cx-field");
        folderRow.innerHTML = "<span>Folder</span>";
        var folderInp = el("input"); folderInp.type = "text"; folderInp.placeholder = "e.g. Finance";
        folderInp.value = (existing && existing.folder) || "";
        folderRow.appendChild(folderInp);
        var folderHint = el("small", "cx-hint"); folderHint.textContent = "Optional — a home for this connection (e.g. Finance, or Finance/2024 to nest). Pick an existing one or type a new name.";
        folderRow.appendChild(folderHint);
        var connFolderNames = {};
        Studio.Workspace.all("connections").filter(isVisibleToMe).forEach(function (x) { if (x.folder) connFolderNames[x.folder] = true; });
        var connFolderList = el("datalist"); connFolderList.id = "connFolderOptions";
        Object.keys(connFolderNames).sort().forEach(function (f) { var o = el("option"); o.value = f; connFolderList.appendChild(o); });
        folderInp.setAttribute("list", "connFolderOptions");
        folderRow.appendChild(connFolderList);
        form.appendChild(folderRow);
        b.appendChild(form);
        if (adapter.docsUrl) {
          var docs = el("div", "cx-docs");
          docs.innerHTML = 'Where do these values come from? <a href="' + esc(adapter.docsUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(adapter.docsUrl.replace(/^https?:\/\//, "").split("/")[0]) + ' docs ↗</a>';
          b.appendChild(docs);
        }
        var result = el("div", "cx-test-result"); b.appendChild(result);
        var foot = el("div", "cx-wiz-foot");
        var testBtn = el("button", "btn"); testBtn.type = "button"; testBtn.textContent = "Test connection";
        var schemaBtn = null;
        if (adapter.listSchema) { schemaBtn = el("button", "btn cx-schema-btn"); schemaBtn.type = "button"; schemaBtn.textContent = "Browse schema"; }
        var saveBtn = el("button", "btn primary"); saveBtn.type = "button"; saveBtn.textContent = existing ? "Save changes" : "Add connection";
        foot.appendChild(testBtn); if (schemaBtn) foot.appendChild(schemaBtn); foot.appendChild(saveBtn); b.appendChild(foot);
        var schemaPanel = null;
        if (schemaBtn) { schemaPanel = el("div", "cx-schema"); schemaPanel.hidden = true; b.appendChild(schemaPanel); }
        function cfg() {
          var o = {};
          Object.keys(inputs).forEach(function (k) { var v = inputs[k].value.trim(); if (v) o[k] = v; });
          return o;
        }
        var lastInlineTest = existing ? existing.lastTest : null;
        testBtn.onclick = function () {
          testBtn.disabled = true; testBtn.textContent = "Testing…";
          result.className = "cx-test-result"; result.textContent = "";
          var fn = adapter.caps && adapter.caps.data ? adapter.testData : adapter.test;
          fn.call(adapter, cfg()).then(function (r) {
            testBtn.disabled = false; testBtn.textContent = "Test connection";
            lastInlineTest = { ok: !!r.ok, error: r.ok ? "" : (r.error || "failed"), at: Date.now() };
            result.className = "cx-test-result " + (r.ok ? "ok" : "bad");
            result.textContent = r.ok ? "✓ Connection works" : "✕ " + (r.error || "Test failed");
          });
        };
        if (schemaBtn) schemaBtn.onclick = function () {
          schemaBtn.disabled = true; schemaBtn.textContent = "Loading schema…";
          schemaPanel.hidden = false;
          schemaPanel.innerHTML = '<div class="cx-schema-status">Loading…</div>';
          adapter.listSchema(cfg()).then(function (r) {
            schemaBtn.disabled = false; schemaBtn.textContent = "Browse schema";
            renderSchemaPanel(schemaPanel, r);
          });
        };
        saveBtn.onclick = function () {
          var name = nameInp.value.trim();
          if (!name) { nameInp.focus(); result.className = "cx-test-result bad"; result.textContent = "Give the connection a name first."; return; }
          var row = existing || { id: Studio.Workspace.uid("conn") };
          row.name = name; row.adapter = adapter.id; row.cfg = cfg();
          row.tags = tagsInp.value.split(",").map(function (t) { return t.trim().toLowerCase(); }).filter(Boolean);
          var connFolderVal = folderInp.value.trim();
          if (connFolderVal) row.folder = connFolderVal; else delete row.folder;
          if (lastInlineTest) row.lastTest = lastInlineTest;
          if (!existing) { var newUid = currentUserId(); if (newUid) row.owner = newUid; }
          Studio.Workspace.put("connections", row);
          toast(existing ? "Saved " + name : "Added " + name);
          document.querySelector(".modal-ov .x").click();
        };
        nameInp.focus();
      }
      if (src) { step2(src); return; }
      // step 1: adapter picker — every data-capable adapter (a connection is a
      // place datasets read from; the local workspace store is not that)
      var grid = el("div", "cx-src-grid");
      Studio.dataSources().forEach(function (adapter) {
        var card = el("button", "cx-src-card"); card.type = "button";
        card.style.setProperty("--src-accent", adapter.accent || "var(--brand)");
        var ic = el("span", "cx-src-ic"); ic.appendChild(Studio.icon(adapter.icon || "db", 22));
        var txt = el("span", "cx-src-txt");
        txt.innerHTML = "<b>" + esc(adapter.label) + "</b><small>" + esc(adapter.blurb || "") + "</small>" +
          (adapter.caps && adapter.caps.meta ? '<span class="cx-badge">workspace-capable</span>' : "");
        card.appendChild(ic); card.appendChild(txt);
        card.onclick = function () { step2(adapter); };
        grid.appendChild(card);
      });
      var intro = el("p", "cx-wiz-intro");
      intro.textContent = "Pick where the data lives. More adapters (Postgres, Redshift, Azure, files) join this list over time.";
      b.appendChild(intro); b.appendChild(grid);
    }, function () { renderConnections(); }, true);
  }
  window.__studioRenderConnections = renderConnections; // test hook
  window.__studioOpenConnectionWizard = openConnectionWizard; // test hook

  /* ---------- Datasets section ----------
     A dataset = a named, parameterizable query defined on top of a Connection
     ({{key}} placeholders resolve at run time — dashboard template variables
     and per-dataset defaults). Workspace-level and reusable: the Studio
     library lists them for drag-to-canvas, and this view manages the catalog
     with the fleet's list UX (multi-select pills by adapter, by connection,
     AND by tag, search, status dot from the last preview run). */
  var _dsxAdapterFilter = {}; // multi-select adapterId -> true; empty = all
  var _dsxConnFilter = {};    // multi-select connectionId -> true; empty = all (post-overhaul backlog item 7, "by connection")
  var _dsxTagFilter = {};     // multi-select tag -> true; empty = all
  // Folder pilot slice (#21 org sub-item, "folder tree" step 2 — a single flat
  // `d.folder` string, the primary-home layer that sits alongside tags per the
  // 2026-07-21 DECISIONS LOCKED note; a real nested tree arrives with M5's
  // Repository browser). Single-select facet (like Dashboards' _repoWbFilter),
  // not a catalog of folder records — a dataset just carries its folder name
  // directly, same free-text shape as tags but one value instead of many.
  var _dsxFolderFilter = ""; // "" = All, "__unfiled" = no folder, else a folder name
  function dsxConnOf(d) { return Studio.Workspace.get("connections", d.connectionId); }
  function dsxAdapterOf(d) { var c = dsxConnOf(d); return c ? Studio.sourceById(c.adapter) : null; }
  // Post-overhaul backlog item 6 ("saved views for the Datasets/Connections
  // lists, jobtracker pattern"): a saved view is just a name plus the search
  // text + adapter/tag pill selection captured at save time. Same home as
  // workbooks (Workspace SETTINGS, a schemaless key/value bag) rather than a
  // new localStorage key — travels with the workspace across devices/sync for
  // free, and needs no new "Clear local data" entry (analytics.workspace.v1
  // already covers it) or Turso/Supabase schema bump.
  var _dsxViewsStore = makeViewsStore("datasetViews");
  function dsxLoadViews() { return _dsxViewsStore.load(); }
  function dsxSaveViews(list) { _dsxViewsStore.save(list); }
  function dsxApplyView(v) {
    var inp = $("#dsxSearch"); if (inp) inp.value = v.q || "";
    _dsxAdapterFilter = {}; (v.adapters || []).forEach(function (a) { _dsxAdapterFilter[a] = true; });
    _dsxConnFilter = {}; (v.connections || []).forEach(function (c) { _dsxConnFilter[c] = true; });
    _dsxTagFilter = {}; (v.tags || []).forEach(function (t) { _dsxTagFilter[t] = true; });
    _dsxFolderFilter = v.folder || "";
    renderDatasets();
  }
  // Post-overhaul backlog item 7 ("organization at scale") — same favorite
  // flag + top-of-list sort as toggleConnPin, kept on the dataset row itself
  // (additive, syncs with the rest of the workspace).
  var toggleDsxPin = makePinToggle("datasets", function () { renderDatasets(); });
  // M4.2 slice 3 (per-section rights + object privacy — datasets): same
  // `private`/`isVisibleToMe` shape as dashboards/connections, but the
  // account-identity owner rides on `acctOwner` — datasets already have a
  // free-text `owner` field ("who to ask about this dataset") that predates
  // this slice, so the auth owner needs a different name to avoid colliding
  // with it.
  function toggleDsxPrivate(id) {
    var W = Studio.Workspace, r = W.get("datasets", id);
    if (!r) return;
    if (r.private) { delete r.private; }
    else {
      r.private = true;
      if (!r.acctOwner) { var uid = currentUserId(); if (uid) r.acctOwner = uid; }
    }
    W.put("datasets", r);
    toast(r.private ? "Private — only you can see this" : "Public — visible to everyone");
    renderDatasets();
  }
  window.__studioToggleDsxPrivate = toggleDsxPrivate; // test hook
  // Dataset lineage (post-overhaul backlog item 5, "blast-radius view"): every
  // dashboard whose spec links a data access back to this dataset (dsToDA
  // stamps da.datasetId = ds.id when a dataset is dropped onto the canvas).
  // Workspace-wide, so it survives across sessions/devices just like the
  // dashboards it inspects.
  function dsxLineage(dsId) {
    return Studio.Workspace.all("dashboards").filter(function (r) {
      var das = (r.spec && r.spec.cda && r.spec.cda.dataAccesses) || [];
      return das.some(function (da) { return da.datasetId === dsId; });
    });
  }
  // What a dataset's definition looks like for a given adapter: SQL for the
  // sql-family, a table+query for Supabase (PostgREST), a collection for
  // Firestore. One place so the editor + runner + library agree.
  function dsxKindFor(adapterId) {
    if (adapterId === "supabase" || adapterId === "postgrest") return "table"; // both speak PostgREST
    if (adapterId === "firebase") return "collection";
    if (adapterId === "file") return "file"; // CSV/JSON drop — content rides in the dataset row
    if (adapterId === "gsheets") return "sheet"; // tab + optional gviz tq query
    return "sql";
  }
  // Resolve a dataset's definition + params into what adapter.queryData expects.
  function dsxRunnableDef(d, extraParams) {
    var params = {};
    (d.params || []).forEach(function (p) { if (p.key) params[p.key] = p.value; });
    if (extraParams) Object.keys(extraParams).forEach(function (k) { params[k] = extraParams[k]; });
    var def = { kind: d.kind || "sql" };
    if (def.kind === "table") { def.table = Studio.WS.applyParams(d.table || "", params); def.query = Studio.WS.applyParams(d.query || "", params); }
    else if (def.kind === "collection") { def.collection = Studio.WS.applyParams(d.collection || "", params); }
    else if (def.kind === "file") { def.fileName = d.fileName || ""; def.format = d.format || ""; def.content = d.content || ""; } // content IS the data — no {{params}}
    else if (def.kind === "sheet") { def.sheet = Studio.WS.applyParams(d.sheet || "", params); def.query = Studio.WS.applyParams(d.query || "", params); }
    else def.sql = Studio.WS.applyParams(d.sql || "", params);
    return def;
  }
  // Run a dataset through its connection's adapter; resolves {columns, rows}
  // or an in-band {error}. Used by the editor preview, the list's Run action,
  // and (via __studioRunDataset) the builder's live path.
  function runDataset(d, extraParams) {
    var conn = dsxConnOf(d);
    if (!conn) return Promise.resolve({ columns: [], rows: [], error: "Dataset has no connection — pick one in the editor." });
    var src = Studio.sourceById(conn.adapter);
    if (!src || !src.caps || !src.caps.data) return Promise.resolve({ columns: [], rows: [], error: "Adapter " + conn.adapter + " can't run queries." });
    return src.queryData(conn.cfg || {}, dsxRunnableDef(d, extraParams)).then(function (r) {
      d.lastRun = { ok: !r.error, error: r.error || "", at: Date.now(), rows: (r.rows || []).length };
      if (!r.error && (r.columns || []).length) d.columns = r.columns.slice();
      Studio.Workspace.put("datasets", d, { silent: true });
      return r;
    });
  }
  function renderDatasets() {
    var results = $("#dsxResults"); if (!results) return;
    var q = (($("#dsxSearch") || {}).value || "").toLowerCase();
    var list = Studio.Workspace.all("datasets").filter(isDatasetVisibleToMe).sort(function (a, b) {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      if (a.pinned) return (b.pinnedAt || "").localeCompare(a.pinnedAt || "");
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    var adapterCounts = {}, connCounts = {}, tagCounts = {}, folderCounts = {}, folderUnfiled = 0;
    list.forEach(function (d) {
      var src = dsxAdapterOf(d);
      var aid = src ? src.id : "—";
      adapterCounts[aid] = (adapterCounts[aid] || 0) + 1;
      var cid = d.connectionId || "—";
      connCounts[cid] = (connCounts[cid] || 0) + 1;
      (d.tags || []).forEach(function (t) { tagCounts[t] = (tagCounts[t] || 0) + 1; });
      if (d.folder) folderCounts[d.folder] = (folderCounts[d.folder] || 0) + 1; else folderUnfiled++;
    });
    Object.keys(_dsxAdapterFilter).forEach(function (k) { if (!adapterCounts[k]) delete _dsxAdapterFilter[k]; });
    Object.keys(_dsxConnFilter).forEach(function (k) { if (!connCounts[k]) delete _dsxConnFilter[k]; });
    Object.keys(_dsxTagFilter).forEach(function (k) { if (!tagCounts[k]) delete _dsxTagFilter[k]; });
    if (_dsxFolderFilter && _dsxFolderFilter !== "__unfiled" && !folderCounts[_dsxFolderFilter]) _dsxFolderFilter = "";
    var anyA = Object.keys(_dsxAdapterFilter).length > 0, anyC = Object.keys(_dsxConnFilter).length > 0, anyT = Object.keys(_dsxTagFilter).length > 0;
    var pillsA = Object.keys(adapterCounts).sort().map(function (aid) {
      var src = Studio.sourceById(aid) || { label: aid === "—" ? "No connection" : aid };
      return '<button type="button" class="wb-chip cx-pill' + (_dsxAdapterFilter[aid] ? " active" : "") + '" data-dsx-adapter="' + esc(aid) + '" aria-pressed="' + (_dsxAdapterFilter[aid] ? "true" : "false") + '">' +
        '<span class="cx-pill-dot" style="background:' + esc(src.accent || "var(--faint)") + '"></span>' +
        '<span class="wb-chip-label">' + esc(src.label) + '</span> <span class="wb-chip-n">' + adapterCounts[aid] + '</span></button>';
    }).join("");
    // Post-overhaul backlog item 7 ("organization at scale") — the by-adapter
    // pills above group e.g. two different Postgres connections together;
    // this facet narrows to ONE specific connection (same multi-select /
    // saved-view plumbing, just keyed by connectionId instead of adapter id).
    var pillsC = Object.keys(connCounts).sort(function (a, b) {
      var na = a === "—" ? "No connection" : ((Studio.Workspace.get("connections", a) || {}).name || a);
      var nb = b === "—" ? "No connection" : ((Studio.Workspace.get("connections", b) || {}).name || b);
      return na.localeCompare(nb);
    }).map(function (cid) {
      var conn = cid === "—" ? null : Studio.Workspace.get("connections", cid);
      var src = conn ? Studio.sourceById(conn.adapter) : null;
      var label = conn ? conn.name : "No connection";
      return '<button type="button" class="wb-chip cx-pill' + (_dsxConnFilter[cid] ? " active" : "") + '" data-dsx-conn="' + esc(cid) + '" aria-pressed="' + (_dsxConnFilter[cid] ? "true" : "false") + '">' +
        '<span class="cx-pill-dot" style="background:' + esc((src && src.accent) || "var(--faint)") + '"></span>' +
        '<span class="wb-chip-label">' + esc(label) + '</span> <span class="wb-chip-n">' + connCounts[cid] + '</span></button>';
    }).join("");
    var pillsT = Object.keys(tagCounts).sort().map(function (t) {
      return '<button type="button" class="wb-chip cx-pill' + (_dsxTagFilter[t] ? " active" : "") + '" data-dsx-tag="' + esc(t) + '" aria-pressed="' + (_dsxTagFilter[t] ? "true" : "false") + '">' +
        '<span class="wb-chip-label">#' + esc(t) + '</span> <span class="wb-chip-n">' + tagCounts[t] + '</span></button>';
    }).join("");
    // Folder facet: single-select (unlike the multi-select adapter/conn/tag
    // pills above) — only appears once at least one dataset has been filed,
    // same "don't show an empty facet" convention as the other pills.
    var pillsF = Object.keys(folderCounts).length
      ? ['<button type="button" class="wb-chip cx-pill' + (!_dsxFolderFilter ? " active" : "") + '" data-dsx-folder="" aria-pressed="' + (!_dsxFolderFilter ? "true" : "false") + '">' +
          '<span class="wb-chip-label">All folders</span> <span class="wb-chip-n">' + list.length + '</span></button>']
        .concat(Object.keys(folderCounts).sort().map(function (f) {
          return '<button type="button" class="wb-chip cx-pill' + (_dsxFolderFilter === f ? " active" : "") + '" data-dsx-folder="' + esc(f) + '" aria-pressed="' + (_dsxFolderFilter === f ? "true" : "false") + '">' +
            '<span class="wb-chip-label">' + esc(f) + '</span> <span class="wb-chip-n">' + folderCounts[f] + '</span></button>';
        }))
        .concat(['<button type="button" class="wb-chip cx-pill' + (_dsxFolderFilter === "__unfiled" ? " active" : "") + '" data-dsx-folder="__unfiled" aria-pressed="' + (_dsxFolderFilter === "__unfiled" ? "true" : "false") + '">' +
          '<span class="wb-chip-label">Unfiled</span> <span class="wb-chip-n">' + folderUnfiled + '</span></button>'])
        .join("")
      : "";
    var dsxViews = dsxLoadViews();
    var pillsV = dsxViews.map(function (v) {
      return '<div class="wb-chip-wrap">' +
        '<button type="button" class="wb-chip" data-dsx-view="' + esc(v.id) + '" title="Apply saved view “' + esc(v.name) + '”">' +
          '<span class="wb-chip-label">' + esc(v.name) + '</span></button>' +
        '<button type="button" class="wb-chip-del" data-dsx-view-del="' + esc(v.id) + '" title="Delete view ' + esc(v.name) + '" aria-label="Delete view ' + esc(v.name) + '"></button>' +
        '</div>';
    }).join("");
    var anyF = !!_dsxFolderFilter;
    var canSaveView = !!(q || anyA || anyC || anyT || anyF);
    var viewAddHtml = canSaveView
      ? '<span class="wb-add"><input type="text" id="dsxViewNameInp" class="wb-name-inp" placeholder="Name this view…" aria-label="Name this saved view"/>' +
        '<button type="button" class="btn" id="dsxViewAddBtn">+ Save view</button></span>'
      : "";
    var shown = list.filter(function (d) {
      var src = dsxAdapterOf(d);
      if (anyA && !_dsxAdapterFilter[src ? src.id : "—"]) return false;
      if (anyC && !_dsxConnFilter[d.connectionId || "—"]) return false;
      if (anyT && !(d.tags || []).some(function (t) { return _dsxTagFilter[t]; })) return false;
      if (_dsxFolderFilter === "__unfiled") { if (d.folder) return false; }
      else if (_dsxFolderFilter) { if (d.folder !== _dsxFolderFilter) return false; }
      if (!q) return true;
      var conn = dsxConnOf(d);
      var hay = (d.name + " " + (d.desc || "") + " " + (d.owner || "") + " " + (d.sql || d.table || d.collection || "") + " " +
        (d.tags || []).join(" ") + " " + (d.folder || "") + " " + (conn ? conn.name : "") + " " + (d.columns || []).join(" ")).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    var rows = shown.map(function (d) {
      var conn = dsxConnOf(d), src = dsxAdapterOf(d);
      var dot = !d.lastRun ? '<span class="cx-dot" title="Never run"></span>'
        : (d.lastRun.ok ? '<span class="cx-dot ok" title="Last run OK · ' + esc(new Date(d.lastRun.at).toLocaleString()) + ' · ' + d.lastRun.rows + ' rows"></span>'
          : '<span class="cx-dot bad" title="Last run failed: ' + esc(d.lastRun.error) + '"></span>');
      var tags = (d.tags || []).map(function (t) { return '<span class="cx-badge">#' + esc(t) + '</span>'; }).join("");
      var folderBadge = d.folder ? '<span class="cx-badge cx-folder" title="Folder: ' + esc(d.folder) + '">' + esc(d.folder) + '</span>' : "";
      var lineage = dsxLineage(d.id);
      var lineageBadge = lineage.length
        ? '<span class="cx-badge cx-lineage" title="Used in: ' + esc(lineage.map(function (r) { return r.title || r.name || "Untitled"; }).join(", ")) + '">↪ ' +
          lineage.length + " dashboard" + (lineage.length !== 1 ? "s" : "") + '</span>'
        : "";
      return '<div class="cx-row" draggable="true" data-dsx-id="' + esc(d.id) + '" tabindex="0" role="button" aria-label="Edit dataset ' + esc(d.name) + '">' +
        dot +
        '<span class="cx-ic" style="color:' + esc((src && src.accent) || "var(--faint)") + '"></span>' +
        '<span class="cx-name"><b>' + esc(d.name) + '</b><small>' + esc(conn ? conn.name : "no connection") + (src ? " · " + src.label : "") + (d.owner ? " · " + esc(d.owner) : "") + '</small></span>' +
        folderBadge +
        tags +
        ((d.params || []).length ? '<span class="cx-badge" title="Accepts parameters">' + (d.params || []).length + " param" + ((d.params || []).length > 1 ? "s" : "") + '</span>' : "") +
        lineageBadge +
        '<span class="cx-when">' + esc(new Date(d.updatedAt || Date.now()).toLocaleDateString()) + '</span>' +
        '<button type="button" class="cx-private' + (d.private ? " private" : "") + '" data-dsx-private="' + esc(d.id) + '" title="' + (d.private ? "Private — only you can see this" : "Make private") + '" aria-label="' + (d.private ? "Make " + esc(d.name) + " public" : "Make " + esc(d.name) + " private") + '" aria-pressed="' + (d.private ? "true" : "false") + '"></button>' +
        '<button type="button" class="cx-pin' + (d.pinned ? " on" : "") + '" data-dsx-pin="' + esc(d.id) + '" title="' + (d.pinned ? "Unpin" : "Pin to top") + '" aria-label="' + (d.pinned ? "Unpin " : "Pin ") + esc(d.name) + '" aria-pressed="' + (d.pinned ? "true" : "false") + '"></button>' +
        '<span class="cx-actions">' +
          '<button type="button" class="btn" data-dsx-run="' + esc(d.id) + '">Run</button>' +
          '<button type="button" class="btn" data-dsx-edit="' + esc(d.id) + '">Edit</button>' +
          '<button type="button" class="btn" data-dsx-del="' + esc(d.id) + '" aria-label="Delete ' + esc(d.name) + '">✕</button>' +
        '</span></div>';
    });
    results.innerHTML =
      (pillsF ? '<div class="wb-chips">' + pillsF + '</div>' : "") +
      (pillsA || pillsC || pillsT || pillsV || viewAddHtml ? '<div class="wb-chips cx-pills">' +
        pillsV + (pillsV && (pillsA || pillsC || pillsT) ? '<span class="dsx-pill-sep"></span>' : "") +
        pillsA + (pillsA && (pillsC || pillsT) ? '<span class="dsx-pill-sep"></span>' : "") +
        pillsC + (pillsC && pillsT ? '<span class="dsx-pill-sep"></span>' : "") +
        pillsT +
        (anyA || anyC || anyT || anyF ? '<button type="button" class="wb-chip" id="dsxPillClear" title="Show everything">Clear</button>' : "") +
        viewAddHtml + '</div>' : "") +
      (rows.length ? '<div class="cx-list">' + rows.join("") + '</div>'
        : '<div class="cx-empty">' +
            (q || anyA || anyC || anyT || anyF ? "No datasets match." :
              "<b>No datasets yet.</b><br/>A dataset is a named query on top of a connection — SQL for warehouses and files, a table for Supabase, a collection for Firestore — with optional {{parameters}} a dashboard can fill in at run time." +
              (Studio.Workspace.all("connections").length ? "" : "<br/>Start by adding a connection in the Connections section.")) +
            (q || anyA || anyC || anyT || anyF || !Studio.Workspace.all("connections").length ? "" : '<br/><button type="button" class="btn primary" id="dsxEmptyNew">+ New dataset</button>') +
          '</div>');
    $$("[data-dsx-adapter]", results).forEach(function (btn) {
      btn.onclick = function () {
        var k = btn.getAttribute("data-dsx-adapter");
        if (_dsxAdapterFilter[k]) delete _dsxAdapterFilter[k]; else _dsxAdapterFilter[k] = true;
        renderDatasets();
      };
    });
    $$("[data-dsx-conn]", results).forEach(function (btn) {
      btn.onclick = function () {
        var k = btn.getAttribute("data-dsx-conn");
        if (_dsxConnFilter[k]) delete _dsxConnFilter[k]; else _dsxConnFilter[k] = true;
        renderDatasets();
      };
    });
    $$("[data-dsx-tag]", results).forEach(function (btn) {
      btn.onclick = function () {
        var k = btn.getAttribute("data-dsx-tag");
        if (_dsxTagFilter[k]) delete _dsxTagFilter[k]; else _dsxTagFilter[k] = true;
        renderDatasets();
      };
    });
    $$("[data-dsx-folder]", results).forEach(function (btn) {
      btn.onclick = function () { _dsxFolderFilter = btn.getAttribute("data-dsx-folder"); renderDatasets(); };
    });
    var clearBtn = $("#dsxPillClear", results);
    if (clearBtn) clearBtn.onclick = function () { _dsxAdapterFilter = {}; _dsxConnFilter = {}; _dsxTagFilter = {}; _dsxFolderFilter = ""; renderDatasets(); };
    $$("[data-dsx-view]", results).forEach(function (btn) {
      btn.onclick = function () {
        var v = dsxLoadViews().filter(function (x) { return x.id === btn.getAttribute("data-dsx-view"); })[0];
        if (v) dsxApplyView(v);
      };
    });
    $$("[data-dsx-view-del]", results).forEach(function (btn) {
      btn.appendChild(Studio.icon("trash", 9));
      btn.onclick = function (e) {
        e.stopPropagation();
        var id = btn.getAttribute("data-dsx-view-del");
        var v = dsxLoadViews().filter(function (x) { return x.id === id; })[0];
        if (!v) return;
        if (confirm('Delete saved view "' + v.name + '"?')) {
          dsxSaveViews(dsxLoadViews().filter(function (x) { return x.id !== id; }));
          renderDatasets();
        }
      };
    });
    var dsxViewAddBtn = $("#dsxViewAddBtn", results);
    if (dsxViewAddBtn) dsxViewAddBtn.onclick = function () {
      var inp = $("#dsxViewNameInp", results);
      var name = inp ? inp.value.trim() : "";
      if (!name) { if (inp) inp.focus(); toast("Type a name in the box first — e.g. “Finance sources”.", true); return; }
      var list = dsxLoadViews();
      var rawQ = (($("#dsxSearch") || {}).value || "");
      list.unshift({ id: "dsxv" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name, q: rawQ, adapters: Object.keys(_dsxAdapterFilter), connections: Object.keys(_dsxConnFilter), tags: Object.keys(_dsxTagFilter), folder: _dsxFolderFilter });
      dsxSaveViews(list);
      toast('View "' + name + '" saved');
      renderDatasets();
    };
    var dsxViewNameInp = $("#dsxViewNameInp", results);
    if (dsxViewNameInp) dsxViewNameInp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); dsxViewAddBtn.click(); } });
    var emptyNew = $("#dsxEmptyNew", results);
    if (emptyNew) emptyNew.onclick = function () { openDatasetEditor(); };
    $$(".cx-row", results).forEach(function (row) {
      var d = Studio.Workspace.get("datasets", row.getAttribute("data-dsx-id"));
      var src = d && dsxAdapterOf(d);
      var icEl = row.querySelector(".cx-ic");
      if (icEl) icEl.appendChild(Studio.icon((src && src.icon) || "db", 18));
      row.addEventListener("click", function (e) {
        if (e.target.closest("[data-dsx-pin],[data-dsx-private],[data-dsx-run],[data-dsx-edit],[data-dsx-del]")) return;
        openDatasetEditor(d);
      });
      row.addEventListener("keydown", function (e) {
        if ((e.key === "Enter" || e.key === " ") && e.target === row) { e.preventDefault(); openDatasetEditor(d); }
      });
      // Drag onto Home's "Blank dashboard" tile to start a new dashboard seeded
      // with this dataset — same {wsDataset} payload the Studio library/canvas
      // drop already understands (post-overhaul backlog item 6).
      row.addEventListener("dragstart", function (e) {
        e.dataTransfer.setData("text/plain", JSON.stringify({ wsDataset: row.getAttribute("data-dsx-id") }));
        e.dataTransfer.effectAllowed = "copy";
      });
    });
    $$(".cx-pin", results).forEach(function (btn) {
      btn.appendChild(Studio.icon("star", 14));
      btn.onclick = function (e) { e.stopPropagation(); toggleDsxPin(btn.getAttribute("data-dsx-pin")); };
    });
    $$(".cx-private", results).forEach(function (btn) {
      btn.appendChild(Studio.icon("lock", 14));
      btn.onclick = function (e) { e.stopPropagation(); toggleDsxPrivate(btn.getAttribute("data-dsx-private")); };
    });
    $$("[data-dsx-run]", results).forEach(function (btn) {
      btn.onclick = function () {
        var d = Studio.Workspace.get("datasets", btn.getAttribute("data-dsx-run"));
        if (!d) return;
        btn.disabled = true; btn.textContent = "Running…";
        runDataset(d).then(function (r) {
          toast(r.error ? "Run failed: " + r.error : "OK — " + (r.rows || []).length + " rows", !!r.error);
          renderDatasets();
        });
      };
    });
    $$("[data-dsx-edit]", results).forEach(function (btn) {
      btn.onclick = function () { openDatasetEditor(Studio.Workspace.get("datasets", btn.getAttribute("data-dsx-edit"))); };
    });
    $$("[data-dsx-del]", results).forEach(function (btn) {
      btn.onclick = function () {
        var d = Studio.Workspace.get("datasets", btn.getAttribute("data-dsx-del"));
        if (!d) return;
        var lineage = dsxLineage(d.id);
        var warn = lineage.length
          ? " It's used in " + lineage.length + " dashboard" + (lineage.length !== 1 ? "s" : "") +
            " (" + lineage.map(function (r) { return r.title || r.name || "Untitled"; }).join(", ") + ") — those keep working off their own saved copy, but won't get live updates from this dataset anymore."
          : "";
        if (!window.confirm('Delete dataset "' + d.name + '"?' + warn)) return;
        Studio.Workspace.remove("datasets", d.id);
        toast("Deleted " + d.name);
      };
    });
  }
  function openDatasetEditor(existing, onSaved) {
    var conns = Studio.Workspace.all("connections").filter(isVisibleToMe);
    modal(existing ? "Edit dataset" : "New dataset", function (b) {
      var d = existing ? Studio.clone(existing) : { id: Studio.Workspace.uid("ds"), name: "", params: [], tags: [] };
      var form = el("div", "cx-wiz-form");
      function field(lbl, input, hint) {
        var row = el("label", "cx-field");
        row.innerHTML = "<span>" + esc(lbl) + "</span>";
        row.appendChild(input);
        if (hint) { var h = el("small", "cx-hint"); h.textContent = hint; row.appendChild(h); }
        form.appendChild(row);
        return input;
      }
      var nameInp = field("Dataset name", el("input")); nameInp.type = "text"; nameInp.value = d.name || ""; nameInp.placeholder = "e.g. monthly_cost_by_source";
      var descInp = field("Description", el("input")); descInp.type = "text"; descInp.value = d.desc || ""; descInp.placeholder = "optional — what this returns";
      var connSel = field("Connection", el("select"), conns.length ? "" : "No connections yet — add one in the Connections section first.");
      connSel.className = "cx-sel";
      connSel.innerHTML = '<option value="">— pick a connection —</option>' + conns.map(function (c) {
        var src = Studio.sourceById(c.adapter);
        return '<option value="' + esc(c.id) + '"' + (d.connectionId === c.id ? " selected" : "") + '>' + esc(c.name) + " (" + esc(src ? src.label : c.adapter) + ")</option>";
      }).join("");
      var defWrap = el("div"); form.appendChild(defWrap);
      var defInputs = {};
      function renderDefFields() {
        defWrap.innerHTML = ""; defInputs = {};
        var conn = Studio.Workspace.get("connections", connSel.value);
        var kind = dsxKindFor(conn ? conn.adapter : "");
        d.kind = kind;
        function defField(lbl, key, multiline, ph, hint) {
          var row = el("label", "cx-field");
          row.innerHTML = "<span>" + esc(lbl) + "</span>";
          var inp = multiline ? el("textarea", "dsx-sql") : el("input");
          if (!multiline) inp.type = "text";
          inp.value = d[key] || "";
          inp.placeholder = ph || "";
          row.appendChild(inp);
          if (hint) { var h = el("small", "cx-hint"); h.textContent = hint; row.appendChild(h); }
          defWrap.appendChild(row); defInputs[key] = inp;
        }
        if (kind === "table") {
          defField("Table", "table", false, "orders", "The exposed table or view (RLS/grants govern access).");
          defField("PostgREST query", "query", false, "select=*&order=total.desc&limit=200", "Optional — PostgREST query string; {{params}} allowed.");
        } else if (kind === "collection") {
          defField("Collection", "collection", false, "orders", "The Firestore collection; documents flatten into rows.");
        } else if (kind === "sheet") {
          defField("Tab", "sheet", false, "Sheet1", "Optional — the tab name; the first tab when blank.");
          defField("Query", "query", false, "select A, B where C > 100 order by B desc",
            "Optional — Google's gviz query language (columns are A, B, C…); {{params}} allowed.");
        } else if (kind === "file") {
          // CSV/JSON drop zone — the file's text is stored INSIDE the dataset row
          // (works offline, mirrors with the workspace; capped, see localfile.js).
          var zone = el("div", "dsx-drop");
          var fileInp = el("input"); fileInp.type = "file"; fileInp.accept = ".csv,.tsv,.json,text/csv,application/json"; fileInp.hidden = true;
          function zoneLabel() {
            zone.innerHTML = d.content
              ? "<b>" + esc(d.fileName || "file") + "</b> · " + Math.max(1, Math.round(d.content.length / 1024)) + " KB loaded<small>Drop a new .csv / .json here (or click) to replace it</small>"
              : "<b>Drop a .csv or .json file here</b><small>or click to browse — the data is stored with the dataset and works offline</small>";
          }
          function loadFile(f) {
            if (!f) return;
            f.text().then(function (text) {
              if (text.length > Studio.FILE_DATASET_MAX_CHARS) {
                zone.innerHTML = "<b class='dsx-drop-err'>" + esc(f.name) + " is too large (" + Math.round(text.length / 1e6) + "MB > 2MB)</b><small>Host it and use the DuckDB (remote file) connector instead.</small>";
                return;
              }
              d.fileName = f.name; d.content = text;
              d.format = /\.(csv|tsv)$/i.test(f.name) ? "csv" : /\.json$/i.test(f.name) ? "json" : "";
              if (!nameInp.value.trim()) nameInp.value = f.name.replace(/\.[^.]+$/, "");
              zoneLabel();
            });
          }
          zone.onclick = function () { fileInp.click(); };
          fileInp.onchange = function () { loadFile(fileInp.files[0]); };
          zone.ondragover = function (e) { e.preventDefault(); zone.classList.add("over"); };
          zone.ondragleave = function () { zone.classList.remove("over"); };
          zone.ondrop = function (e) { e.preventDefault(); zone.classList.remove("over"); loadFile(e.dataTransfer.files && e.dataTransfer.files[0]); };
          zoneLabel();
          fileInp.className = "dsx-drop-input"; // stable hook for tests (setInputFiles); NOT in defInputs — the save loop copies .value, and a file input's value is a fakepath string
          defWrap.appendChild(zone); defWrap.appendChild(fileInp);
        } else {
          defField("SQL", "sql", true, "SELECT region, SUM(amount) AS total\nFROM {{schema}}.sales\nGROUP BY region",
            "Use {{key}} placeholders for parameters — dashboard template variables fill them at run time.");
        }
      }
      connSel.onchange = renderDefFields;
      renderDefFields();
      // parameters: key + default value rows
      var paramWrap = el("div", "dsx-params"); form.appendChild(paramWrap);
      function renderParams() {
        paramWrap.innerHTML = '<span class="dsx-params-lbl">Parameters</span>';
        (d.params || []).forEach(function (p, i) {
          var row = el("div", "dsx-param-row");
          var k = el("input"); k.type = "text"; k.placeholder = "key"; k.value = p.key || "";
          var v = el("input"); v.type = "text"; v.placeholder = "default value"; v.value = p.value || "";
          k.oninput = function () { p.key = k.value.trim(); };
          v.oninput = function () { p.value = v.value; };
          var del = el("button", "btn dsx-param-del"); del.type = "button"; del.textContent = "✕"; del.setAttribute("aria-label", "Remove parameter " + (p.key || i));
          del.onclick = function () { d.params.splice(i, 1); renderParams(); };
          row.appendChild(k); row.appendChild(v); row.appendChild(del);
          paramWrap.appendChild(row);
        });
        var add = el("button", "btn"); add.type = "button"; add.textContent = "+ Parameter";
        add.onclick = function () { (d.params = d.params || []).push({ key: "", value: "" }); renderParams(); };
        paramWrap.appendChild(add);
      }
      renderParams();
      var tagsInp = field("Tags", el("input"), "Comma-separated groups for filtering (e.g. finance, demo). Anyone can slice the list by these.");
      tagsInp.type = "text"; tagsInp.value = (d.tags || []).join(", "); tagsInp.placeholder = "finance, demo";
      // Folder pilot slice (#21 org sub-item): a single primary "home" for the
      // dataset, distinct from tags (cross-cutting, multi-value). Free text
      // with a <datalist> of folders already in use so a name reuses instead
      // of forking into a near-duplicate.
      var folderInp = field("Folder", el("input"), "Optional — a home for this dataset (e.g. Finance, or Finance/2024 to nest). Pick an existing one or type a new name.");
      folderInp.type = "text"; folderInp.value = d.folder || ""; folderInp.placeholder = "e.g. Finance";
      var folderNames = {};
      Studio.Workspace.all("datasets").filter(isDatasetVisibleToMe).forEach(function (x) { if (x.folder) folderNames[x.folder] = true; });
      var folderList = el("datalist"); folderList.id = "dsxFolderOptions";
      Object.keys(folderNames).sort().forEach(function (f) { var o = el("option"); o.value = f; folderList.appendChild(o); });
      folderInp.setAttribute("list", "dsxFolderOptions");
      folderInp.parentNode.appendChild(folderList);
      var ownerInp = field("Owner", el("input"), "Optional — who to ask about this dataset.");
      ownerInp.type = "text"; ownerInp.value = d.owner || ""; ownerInp.placeholder = "e.g. kevin";
      b.appendChild(form);
      var result = el("div", "cx-test-result"); b.appendChild(result);
      var preview = el("div", "dsx-preview"); b.appendChild(preview);
      var foot = el("div", "cx-wiz-foot");
      var runBtn = el("button", "btn"); runBtn.type = "button"; runBtn.textContent = "Preview";
      var saveBtn = el("button", "btn primary"); saveBtn.type = "button"; saveBtn.textContent = existing ? "Save changes" : "Add dataset";
      foot.appendChild(runBtn); foot.appendChild(saveBtn); b.appendChild(foot);
      function collect() {
        d.name = nameInp.value.trim();
        d.desc = descInp.value.trim();
        d.connectionId = connSel.value;
        Object.keys(defInputs).forEach(function (k) { d[k] = defInputs[k].value; });
        d.params = (d.params || []).filter(function (p) { return p.key; });
        d.tags = tagsInp.value.split(",").map(function (t) { return t.trim().toLowerCase(); }).filter(Boolean);
        var folderVal = folderInp.value.trim();
        if (folderVal) d.folder = folderVal; else delete d.folder;
        d.owner = ownerInp.value.trim();
        return d;
      }
      runBtn.onclick = function () {
        collect();
        runBtn.disabled = true; runBtn.textContent = "Running…";
        result.className = "cx-test-result"; result.textContent = ""; preview.innerHTML = "";
        runDataset(d).then(function (r) {
          runBtn.disabled = false; runBtn.textContent = "Preview";
          if (r.error) { result.className = "cx-test-result bad"; result.textContent = "✕ " + r.error; return; }
          result.className = "cx-test-result ok"; result.textContent = "✓ " + r.rows.length + " rows · " + r.columns.length + " columns";
          var head = "<tr>" + r.columns.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr>";
          var body = r.rows.slice(0, 8).map(function (row) {
            return "<tr>" + row.map(function (v) { return "<td>" + esc(v == null ? "" : String(v)) + "</td>"; }).join("") + "</tr>";
          }).join("");
          preview.innerHTML = "<table>" + head + body + "</table>";
        });
      };
      saveBtn.onclick = function () {
        collect();
        if (!d.name) { nameInp.focus(); result.className = "cx-test-result bad"; result.textContent = "Give the dataset a name first."; return; }
        if (!d.connectionId) { connSel.focus(); result.className = "cx-test-result bad"; result.textContent = "Pick the connection this dataset runs against."; return; }
        if (!existing) { var newUid = currentUserId(); if (newUid) d.acctOwner = newUid; }
        Studio.Workspace.put("datasets", d);
        toast(existing ? "Saved " + d.name : "Added " + d.name);
        document.querySelector(".modal-ov .x").click();
        if (onSaved) onSaved(d);
      };
      nameInp.focus();
    }, function () { renderDatasets(); }, true);
  }
  window.__studioRenderDatasets = renderDatasets; // test hook
  window.__studioOpenDatasetEditor = openDatasetEditor; // test hook
  window.__studioRunDataset = runDataset; // builder live path + tests

  /* ---------- Jobs (Viridis V8: data-management-lite) ---------------------
     A job reads ONE source dataset's live rows through a rename/cast/derive/
     filter/aggregate/join/union/sql pipeline (app/sources/jobs-engine.js) and
     materializes the result back as an ordinary kind:'file' dataset —
     tagged "job-output" and re-written in place on every re-run via
     job.outputDatasetId — so the result is chartable in Explore/Studio with
     zero new dataset-kind code. The 'sql' step (slice 3) runs its query
     against DuckDB-Wasm (lazy-loaded, see app/duckdb.js) over the pipeline's
     CURRENT rows as table "t" — Studio.runJobStepsAsync is the async
     orchestrator that splits a job's steps at 'sql' boundaries and calls
     duckSqlRunner for each one; jobs with no 'sql' step never touch it. */
  function duckSqlRunner(columns, rows, query) {
    return Studio.DuckDB.queryRows(columns, rows, query);
  }
  function jobOutputConnection() {
    var existing = Studio.Workspace.all("connections").filter(function (c) { return c.jobOutputs; })[0];
    if (existing) return existing;
    return Studio.Workspace.put("connections", { name: "Job outputs", adapter: "file", cfg: {}, jobOutputs: true });
  }
  // Runs every dataset a job's join/union steps reference (the engine stays
  // pure/synchronous, so this is the async pre-fetch the engine can't do
  // itself) and hands back {datasets:{id:{columns,rows}}} for runJobSteps.
  function resolveJobCtx(steps) {
    var ids = Studio.jobStepDatasetIds(steps);
    if (!ids.length) return Promise.resolve({ datasets: {} });
    return Promise.all(ids.map(function (id) {
      var ds = Studio.Workspace.get("datasets", id);
      if (!ds) return { id: id, columns: [], rows: [] };
      return runDataset(ds).then(function (r) {
        return { id: id, columns: r.error ? [] : r.columns, rows: r.error ? [] : r.rows };
      });
    })).then(function (results) {
      var datasets = {};
      results.forEach(function (x) { datasets[x.id] = { columns: x.columns, rows: x.rows }; });
      return { datasets: datasets };
    });
  }
  function runJob(job) {
    var src = Studio.Workspace.get("datasets", job.sourceDatasetId);
    if (!src) {
      job.lastRun = { ok: false, error: "No source dataset selected.", at: Date.now(), rows: 0 };
      Studio.Workspace.put("jobs", job, { silent: true });
      return Promise.resolve({ error: job.lastRun.error });
    }
    return runDataset(src).then(function (r) {
      if (r.error) {
        job.lastRun = { ok: false, error: r.error, at: Date.now(), rows: 0 };
        Studio.Workspace.put("jobs", job, { silent: true });
        return r;
      }
      return resolveJobCtx(job.steps).then(function (ctx) {
        return Studio.runJobStepsAsync({ columns: r.columns, rows: r.rows }, job.steps || [], ctx, duckSqlRunner);
      }).then(function (out) {
        if (out.error) {
          job.lastRun = { ok: false, error: out.error, at: Date.now(), rows: 0 };
          Studio.Workspace.put("jobs", job, { silent: true });
          return out;
        }
        var row = (job.outputDatasetId && Studio.Workspace.get("datasets", job.outputDatasetId)) ||
          { id: Studio.Workspace.uid("ds"), connectionId: jobOutputConnection().id, tags: [] };
        row.name = job.outputName || (job.name + " (job output)");
        row.kind = "file"; row.format = "csv";
        row.fileName = row.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase() + ".csv";
        row.content = Studio.rowsToCsv(out.columns, out.rows);
        row.columns = out.columns.slice();
        row.jobId = job.id;
        if ((row.tags || []).indexOf("job-output") < 0) row.tags = (row.tags || []).concat(["job-output"]);
        Studio.Workspace.put("datasets", row);
        job.outputDatasetId = row.id;
        job.lastRun = { ok: true, error: "", at: Date.now(), rows: out.rows.length };
        Studio.Workspace.put("jobs", job);
        return { columns: out.columns, rows: out.rows, outputDatasetId: row.id };
      });
    });
  }
  // Post-overhaul backlog item 5 ("scheduled refresh hints"): a job can opt into a periodic
  // reminder (refreshEveryDays) — this is a HINT, not real scheduling (the app is static/
  // client-side with no server to run a cron), so it just flags staleness against the job's
  // own lastRun stamp next time someone has the Jobs list open. Never run + a reminder set
  // counts as due (nothing to be "on time" against yet).
  function jobRefreshBadge(j) {
    if (!j.refreshEveryDays) return "";
    var everyMs = j.refreshEveryDays * 86400000;
    var last = j.lastRun && j.lastRun.ok ? j.lastRun.at : null;
    var dueAt = last != null ? last + everyMs : null;
    var now = Date.now();
    if (dueAt == null || dueAt <= now) {
      var overdueTitle = last != null
        ? "Last ran " + esc(new Date(last).toLocaleDateString()) + " — overdue for its " + j.refreshEveryDays + "-day reminder"
        : "Never run — reminder set for every " + j.refreshEveryDays + " days";
      return '<span class="cx-badge cx-refresh-due" title="' + overdueTitle + '">⏰ Refresh due</span>';
    }
    var daysLeft = Math.ceil((dueAt - now) / 86400000);
    return '<span class="cx-badge" title="Reminder every ' + j.refreshEveryDays + ' days">Refreshes in ' + daysLeft + " day" + (daysLeft === 1 ? "" : "s") + '</span>';
  }
  // M4.2 slice 5 (per-section rights + object privacy — jobs, the last object type):
  // same `private`/`owner` shape + plain `isVisibleToMe` helper as analyses — jobs
  // have no pre-existing `owner` field, so no acctOwner-style rename is needed here.
  function toggleJobPrivate(id) {
    var W = Studio.Workspace, j = W.get("jobs", id);
    if (!j) return;
    if (j.private) { delete j.private; }
    else {
      j.private = true;
      if (!j.owner) { var uid = currentUserId(); if (uid) j.owner = uid; }
    }
    W.put("jobs", j);
    toast(j.private ? "Private — only you can see this" : "Public — visible to everyone");
    renderJobs();
  }
  window.__studioToggleJobPrivate = toggleJobPrivate; // test hook
  // M5 folder pilot, slice 3 (jobs): same single-select facet shape as
  // Datasets'/Connections' `_dsxFolderFilter`/`_connFolderFilter` — Jobs had no
  // search/filter UI of its own before this, so this also introduces the
  // section's first search box (title/source/output/folder text match).
  var _jobsFolderFilter = ""; // "" = All, "__unfiled" = no folder, else a folder name
  function renderJobs() {
    var results = $("#jobsResults"); if (!results) return;
    var q = (($("#jobsSearch") || {}).value || "").toLowerCase();
    var list = Studio.Workspace.all("jobs").filter(isVisibleToMe).sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    var folderCounts = {}, folderUnfiled = 0;
    list.forEach(function (j) { if (j.folder) folderCounts[j.folder] = (folderCounts[j.folder] || 0) + 1; else folderUnfiled++; });
    if (_jobsFolderFilter && _jobsFolderFilter !== "__unfiled" && !folderCounts[_jobsFolderFilter]) _jobsFolderFilter = "";
    var pillsFJobs = Object.keys(folderCounts).length
      ? ['<button type="button" class="wb-chip cx-pill' + (!_jobsFolderFilter ? " active" : "") + '" data-jobs-folder="" aria-pressed="' + (!_jobsFolderFilter ? "true" : "false") + '">' +
          '<span class="wb-chip-label">All folders</span> <span class="wb-chip-n">' + list.length + '</span></button>']
        .concat(Object.keys(folderCounts).sort().map(function (f) {
          return '<button type="button" class="wb-chip cx-pill' + (_jobsFolderFilter === f ? " active" : "") + '" data-jobs-folder="' + esc(f) + '" aria-pressed="' + (_jobsFolderFilter === f ? "true" : "false") + '">' +
            '<span class="wb-chip-label">' + esc(f) + '</span> <span class="wb-chip-n">' + folderCounts[f] + '</span></button>';
        }))
        .concat(['<button type="button" class="wb-chip cx-pill' + (_jobsFolderFilter === "__unfiled" ? " active" : "") + '" data-jobs-folder="__unfiled" aria-pressed="' + (_jobsFolderFilter === "__unfiled" ? "true" : "false") + '">' +
          '<span class="wb-chip-label">Unfiled</span> <span class="wb-chip-n">' + folderUnfiled + '</span></button>'])
        .join("")
      : "";
    var shown = list.filter(function (j) {
      if (_jobsFolderFilter === "__unfiled") { if (j.folder) return false; }
      else if (_jobsFolderFilter) { if (j.folder !== _jobsFolderFilter) return false; }
      if (!q) return true;
      var src = Studio.Workspace.get("datasets", j.sourceDatasetId);
      return (j.name + " " + (src ? src.name : "") + " " + (j.outputName || "") + " " + (j.folder || "")).toLowerCase().indexOf(q) >= 0;
    });
    var rows = shown.map(function (j) {
      var src = Studio.Workspace.get("datasets", j.sourceDatasetId);
      var out = j.outputDatasetId && Studio.Workspace.get("datasets", j.outputDatasetId);
      var dot = !j.lastRun ? '<span class="cx-dot" title="Never run"></span>'
        : (j.lastRun.ok ? '<span class="cx-dot ok" title="Last run OK · ' + esc(new Date(j.lastRun.at).toLocaleString()) + ' · ' + j.lastRun.rows + ' rows"></span>'
          : '<span class="cx-dot bad" title="Last run failed: ' + esc(j.lastRun.error) + '"></span>');
      var folderBadge = j.folder ? '<span class="cx-badge cx-folder" title="Folder: ' + esc(j.folder) + '">' + esc(j.folder) + '</span>' : "";
      return '<div class="cx-row" data-job-id="' + esc(j.id) + '" tabindex="0" role="button" aria-label="Edit job ' + esc(j.name) + '">' +
        dot +
        '<span class="cx-ic" style="color:var(--faint)"></span>' +
        '<span class="cx-name"><b>' + esc(j.name) + '</b><small>' + (src ? "from " + esc(src.name) : "no source dataset") +
          (out ? " → " + esc(out.name) : "") + '</small></span>' +
        folderBadge +
        '<span class="cx-badge">' + (j.steps || []).length + " step" + ((j.steps || []).length === 1 ? "" : "s") + '</span>' +
        jobRefreshBadge(j) +
        '<span class="cx-when">' + esc(new Date(j.updatedAt || Date.now()).toLocaleDateString()) + '</span>' +
        '<button type="button" class="cx-private' + (j.private ? " private" : "") + '" data-job-private="' + esc(j.id) + '" title="' + (j.private ? "Private — only you can see this" : "Make private") + '" aria-label="' + (j.private ? "Make " + esc(j.name) + " public" : "Make " + esc(j.name) + " private") + '" aria-pressed="' + (j.private ? "true" : "false") + '"></button>' +
        '<span class="cx-actions">' +
          '<button type="button" class="btn" data-job-run="' + esc(j.id) + '">Run</button>' +
          '<button type="button" class="btn" data-job-edit="' + esc(j.id) + '">Edit</button>' +
          '<button type="button" class="btn" data-job-del="' + esc(j.id) + '" aria-label="Delete ' + esc(j.name) + '">✕</button>' +
        '</span></div>';
    });
    results.innerHTML =
      (pillsFJobs ? '<div class="wb-chips">' + pillsFJobs + '</div>' : "") +
      (rows.length ? '<div class="cx-list">' + rows.join("") + '</div>'
      : '<div class="cx-empty"><b>' + (q || _jobsFolderFilter ? "No jobs match." : "No jobs yet.") + '</b><br/>' +
        (q || _jobsFolderFilter ? "" : 'A job preps one dataset — rename/cast/derive columns, filter rows, roll up ' +
        'with sum/avg/count/median or an acreage-weighted mean, and join or union in another dataset — then saves the result as ' +
        'a new dataset you can chart.' +
        (Studio.Workspace.all("datasets").length ? "" : "<br/>Add a dataset first, in the Datasets section.")) + '</div>');
    $$("[data-jobs-folder]", results).forEach(function (btn) {
      btn.onclick = function () { _jobsFolderFilter = btn.getAttribute("data-jobs-folder"); renderJobs(); };
    });
    $$(".cx-row", results).forEach(function (row) {
      var j = Studio.Workspace.get("jobs", row.getAttribute("data-job-id"));
      var icEl = row.querySelector(".cx-ic"); if (icEl && Studio.icon) icEl.appendChild(Studio.icon("sliders", 18));
      row.addEventListener("click", function (e) { if (e.target.closest("[data-job-run],[data-job-private],[data-job-edit],[data-job-del]")) return; openJobEditor(j); });
      row.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target === row) { e.preventDefault(); openJobEditor(j); } });
    });
    $$(".cx-private", results).forEach(function (btn) {
      btn.appendChild(Studio.icon("lock", 14));
      btn.onclick = function (e) { e.stopPropagation(); toggleJobPrivate(btn.getAttribute("data-job-private")); };
    });
    $$("[data-job-run]", results).forEach(function (btn) {
      btn.onclick = function () {
        var j = Studio.Workspace.get("jobs", btn.getAttribute("data-job-run")); if (!j) return;
        btn.disabled = true; btn.textContent = "Running…";
        runJob(j).then(function (r) {
          toast(r.error ? "Run failed: " + r.error : "OK — " + (r.rows || []).length + " rows", !!r.error);
          renderJobs();
        });
      };
    });
    $$("[data-job-edit]", results).forEach(function (btn) {
      btn.onclick = function () { openJobEditor(Studio.Workspace.get("jobs", btn.getAttribute("data-job-edit"))); };
    });
    $$("[data-job-del]", results).forEach(function (btn) {
      btn.onclick = function () {
        var j = Studio.Workspace.get("jobs", btn.getAttribute("data-job-del")); if (!j) return;
        if (!window.confirm('Delete job "' + j.name + '"? Its output dataset is kept.')) return;
        Studio.Workspace.remove("jobs", j.id);
        toast("Deleted " + j.name);
      };
    });
  }
  function openJobEditor(existing) {
    var dsets = Studio.Workspace.all("datasets").filter(isDatasetVisibleToMe).filter(function (d) { return (d.tags || []).indexOf("job-output") < 0 || (existing && d.id === existing.outputDatasetId); });
    modal(existing ? "Edit job" : "New job", function (b) {
      var j = existing ? Studio.clone(existing) : { id: Studio.Workspace.uid("job"), name: "", steps: [] };
      var form = el("div", "cx-wiz-form");
      function field(lbl, input, hint) {
        var row = el("label", "cx-field");
        row.innerHTML = "<span>" + esc(lbl) + "</span>";
        row.appendChild(input);
        if (hint) { var h = el("small", "cx-hint"); h.textContent = hint; row.appendChild(h); }
        form.appendChild(row);
        return input;
      }
      var nameInp = field("Job name", el("input")); nameInp.type = "text"; nameInp.value = j.name || ""; nameInp.placeholder = "e.g. county_to_state_rollup";
      var srcSel = field("Source dataset", el("select"), dsets.length ? "" : "No datasets yet — add one in the Datasets section first.");
      srcSel.className = "cx-sel";
      srcSel.innerHTML = '<option value="">— pick a dataset —</option>' + dsets.map(function (d) {
        return '<option value="' + esc(d.id) + '"' + (j.sourceDatasetId === d.id ? " selected" : "") + '>' + esc(d.name) + "</option>";
      }).join("");
      var outInp = field("Output dataset name", el("input"), "Where the result lands — re-running this job updates the same dataset in place.");
      outInp.type = "text"; outInp.value = j.outputName || "";

      var refreshSel = field("Refresh reminder", el("select"),
        "Optional — the Jobs list flags this job once it's overdue, so annual (or other periodic) updates don't get forgotten.");
      refreshSel.className = "cx-sel";
      refreshSel.innerHTML = [["", "No reminder"], ["7", "Every week"], ["30", "Every month"], ["90", "Every quarter"], ["365", "Every year"]]
        .map(function (o) { return '<option value="' + o[0] + '"' + (String(j.refreshEveryDays || "") === o[0] ? " selected" : "") + '>' + o[1] + '</option>'; }).join("");

      // M5 folder pilot, slice 3 (jobs — same flat single-value "home" field as
      // Datasets/Connections, with a <datalist> of names already in use).
      var folderInp = field("Folder", el("input"), "Optional — a home for this job (e.g. Finance, or Finance/2024 to nest). Pick an existing one or type a new name.");
      folderInp.type = "text"; folderInp.value = j.folder || ""; folderInp.placeholder = "e.g. Finance";
      var jobFolderNames = {};
      Studio.Workspace.all("jobs").filter(isVisibleToMe).forEach(function (x) { if (x.folder) jobFolderNames[x.folder] = true; });
      var jobFolderList = el("datalist"); jobFolderList.id = "jobFolderOptions";
      Object.keys(jobFolderNames).sort().forEach(function (f) { var o = el("option"); o.value = f; jobFolderList.appendChild(o); });
      folderInp.setAttribute("list", "jobFolderOptions");
      folderInp.parentNode.appendChild(jobFolderList);

      var stepsWrap = el("div", "jobs-steps"); form.appendChild(stepsWrap);
      function operandRow(op) {
        var wrap = el("span", "jobs-operand");
        var kindSel = el("select"); kindSel.innerHTML = '<option value="col">column</option><option value="value">number</option>';
        var valInp = el("input"); valInp.type = "text";
        function sync() {
          if (op.col != null) { kindSel.value = "col"; valInp.value = op.col; valInp.placeholder = "column"; }
          else { kindSel.value = "value"; valInp.value = op.value != null ? op.value : ""; valInp.placeholder = "number"; }
        }
        sync();
        kindSel.onchange = function () {
          if (kindSel.value === "col") { op.col = valInp.value || ""; delete op.value; } else { op.value = valInp.value || ""; delete op.col; }
          sync();
        };
        valInp.oninput = function () { if (kindSel.value === "col") op.col = valInp.value; else op.value = valInp.value; };
        wrap.appendChild(kindSel); wrap.appendChild(valInp);
        return wrap;
      }
      function metricsEditor(step) {
        var wrap = el("div", "jobs-metrics");
        function draw() {
          wrap.innerHTML = "";
          (step.metrics = step.metrics || []).forEach(function (m, i) {
            var row = el("div", "jobs-metric-row");
            var col = el("input"); col.type = "text"; col.placeholder = "column"; col.value = m.col || "";
            col.oninput = function () { m.col = col.value; };
            var fnSel = el("select");
            fnSel.innerHTML = Studio.JOB_AGG_FNS.map(function (f) { return '<option value="' + f.fn + '"' + (m.fn === f.fn ? " selected" : "") + '>' + esc(f.label) + '</option>'; }).join("");
            fnSel.onchange = function () { m.fn = fnSel.value; draw(); };
            var asInp = el("input"); asInp.type = "text"; asInp.placeholder = "output name"; asInp.value = m.as || "";
            asInp.oninput = function () { m.as = asInp.value; };
            row.appendChild(col); row.appendChild(fnSel); row.appendChild(asInp);
            if (fnSel.value === "wmean") {
              var w = el("input"); w.type = "text"; w.placeholder = "weight column (e.g. acres)"; w.value = m.weightCol || "";
              w.oninput = function () { m.weightCol = w.value; };
              row.appendChild(w);
            }
            var del = el("button", "btn danger"); del.type = "button"; del.textContent = "✕"; del.setAttribute("aria-label", "Remove metric");
            del.onclick = function () { step.metrics.splice(i, 1); draw(); };
            row.appendChild(del);
            wrap.appendChild(row);
          });
          var add = el("button", "btn"); add.type = "button"; add.textContent = "+ Metric";
          add.onclick = function () { step.metrics.push({ col: "", fn: "sum", as: "" }); draw(); };
          wrap.appendChild(add);
        }
        draw();
        return wrap;
      }
      function unionMapEditor(step) {
        var wrap = el("div", "jobs-metrics");
        function draw() {
          wrap.innerHTML = "";
          (step.columnMap = step.columnMap || []).forEach(function (m, i) {
            var row = el("div", "jobs-metric-row");
            var to = el("input"); to.type = "text"; to.placeholder = "output column"; to.value = m.to || "";
            to.oninput = function () { m.to = to.value; };
            var from = el("input"); from.type = "text"; from.placeholder = "column in the other dataset"; from.value = m.from || "";
            from.oninput = function () { m.from = from.value; };
            row.appendChild(to); row.appendChild(from);
            var del = el("button", "btn danger"); del.type = "button"; del.textContent = "✕"; del.setAttribute("aria-label", "Remove mapping");
            del.onclick = function () { step.columnMap.splice(i, 1); draw(); };
            row.appendChild(del);
            wrap.appendChild(row);
          });
          var add = el("button", "btn"); add.type = "button"; add.textContent = "+ Column mapping";
          add.onclick = function () { step.columnMap.push({ to: "", from: "" }); draw(); };
          wrap.appendChild(add);
          var note = el("small", "cx-hint"); note.textContent = "Unmapped output columns fall back to a same-name match in the other dataset, else blank.";
          wrap.appendChild(note);
        }
        draw();
        return wrap;
      }
      function stepFields(step) {
        var wrap = el("div", "jobs-step-fields");
        function mini(ph, val, onChange) {
          var i = el("input"); i.type = "text"; i.placeholder = ph; i.value = val || ""; i.oninput = function () { onChange(i.value); };
          wrap.appendChild(i); return i;
        }
        if (step.op === "rename") {
          mini("from column", step.from, function (v) { step.from = v; });
          mini("to column", step.to, function (v) { step.to = v; });
        } else if (step.op === "cast") {
          mini("column", step.col, function (v) { step.col = v; });
          var sel = el("select"); sel.innerHTML = '<option value="number">number</option><option value="string">string</option>';
          sel.value = step.to || "number"; sel.onchange = function () { step.to = sel.value; }; wrap.appendChild(sel);
        } else if (step.op === "derive") {
          mini("output column", step.outCol, function (v) { step.outCol = v; });
          step.a = step.a || {}; wrap.appendChild(operandRow(step.a));
          var opSel = el("select"); opSel.innerHTML = ["+", "-", "*", "/"].map(function (o) { return '<option value="' + o + '"' + (step.operator === o ? " selected" : "") + '>' + o + '</option>'; }).join("");
          step.operator = step.operator || "*"; opSel.value = step.operator; opSel.onchange = function () { step.operator = opSel.value; }; wrap.appendChild(opSel);
          step.b = step.b || {}; wrap.appendChild(operandRow(step.b));
        } else if (step.op === "filter") {
          mini("column", step.col, function (v) { step.col = v; });
          var cmpSel = el("select");
          cmpSel.innerHTML = ["eq", "ne", "gt", "gte", "lt", "lte", "contains"].map(function (c) { return '<option value="' + c + '"' + (step.cmp === c ? " selected" : "") + '>' + c + '</option>'; }).join("");
          step.cmp = step.cmp || "eq"; cmpSel.value = step.cmp; cmpSel.onchange = function () { step.cmp = cmpSel.value; }; wrap.appendChild(cmpSel);
          mini("value", step.value, function (v) { step.value = v; });
        } else if (step.op === "aggregate") {
          mini("group by (comma-separated columns)", (step.groupBy || []).join(", "), function (v) { step.groupBy = v.split(",").map(function (s) { return s.trim(); }).filter(Boolean); });
          wrap.appendChild(metricsEditor(step));
        } else if (step.op === "join") {
          var joinDsSel = el("select");
          joinDsSel.innerHTML = '<option value="">— pick dataset —</option>' + dsets.map(function (d) {
            return '<option value="' + esc(d.id) + '"' + (step.datasetId === d.id ? " selected" : "") + '>' + esc(d.name) + "</option>";
          }).join("");
          joinDsSel.onchange = function () { step.datasetId = joinDsSel.value; };
          wrap.appendChild(joinDsSel);
          mini("left key column", step.leftCol, function (v) { step.leftCol = v; });
          mini("right key column", step.rightCol, function (v) { step.rightCol = v; });
          var joinTypeSel = el("select");
          joinTypeSel.innerHTML = '<option value="inner">inner join</option><option value="left">left join (keep unmatched)</option>';
          step.type = step.type || "inner"; joinTypeSel.value = step.type;
          joinTypeSel.onchange = function () { step.type = joinTypeSel.value; };
          wrap.appendChild(joinTypeSel);
          mini("added-column prefix (optional)", step.prefix, function (v) { step.prefix = v; });
        } else if (step.op === "union") {
          var unionDsSel = el("select");
          unionDsSel.innerHTML = '<option value="">— pick dataset —</option>' + dsets.map(function (d) {
            return '<option value="' + esc(d.id) + '"' + (step.datasetId === d.id ? " selected" : "") + '>' + esc(d.name) + "</option>";
          }).join("");
          unionDsSel.onchange = function () { step.datasetId = unionDsSel.value; };
          wrap.appendChild(unionDsSel);
          wrap.appendChild(unionMapEditor(step));
        } else if (step.op === "sql") {
          var sqlBox = el("textarea"); sqlBox.className = "jobs-sql-box"; sqlBox.rows = 4;
          sqlBox.placeholder = "SELECT * FROM t"; sqlBox.value = step.query || "";
          sqlBox.oninput = function () { step.query = sqlBox.value; };
          wrap.appendChild(sqlBox);
          var sqlHint = el("small", "cx-hint");
          sqlHint.textContent = "Runs against the pipeline's rows so far, in a DuckDB table named \"t\" (loaded on first use).";
          wrap.appendChild(sqlHint);
        }
        return wrap;
      }
      function renderSteps() {
        stepsWrap.innerHTML = "";
        (j.steps || []).forEach(function (step, i) {
          var card = el("div", "jobs-step-card");
          var head = el("div", "jobs-step-head");
          var opSel = el("select");
          opSel.innerHTML = Studio.JOB_STEP_KINDS.map(function (k) { return '<option value="' + k.op + '"' + (step.op === k.op ? " selected" : "") + '>' + esc(k.label) + '</option>'; }).join("");
          opSel.onchange = function () { j.steps[i] = { op: opSel.value }; renderSteps(); };
          head.appendChild(opSel);
          var up = el("button", "btn"); up.type = "button"; up.textContent = "↑"; up.setAttribute("aria-label", "Move step up");
          up.disabled = i === 0; up.onclick = function () { var t = j.steps[i - 1]; j.steps[i - 1] = j.steps[i]; j.steps[i] = t; renderSteps(); };
          var down = el("button", "btn"); down.type = "button"; down.textContent = "↓"; down.setAttribute("aria-label", "Move step down");
          down.disabled = i === j.steps.length - 1; down.onclick = function () { var t = j.steps[i + 1]; j.steps[i + 1] = j.steps[i]; j.steps[i] = t; renderSteps(); };
          var del = el("button", "btn danger"); del.type = "button"; del.textContent = "✕ Remove step";
          del.setAttribute("aria-label", "Remove step");
          del.onclick = function () { j.steps.splice(i, 1); renderSteps(); };
          head.appendChild(up); head.appendChild(down); head.appendChild(del);
          card.appendChild(head);
          card.appendChild(stepFields(step));
          stepsWrap.appendChild(card);
        });
        var addStep = el("button", "btn"); addStep.type = "button"; addStep.textContent = "+ Step";
        addStep.onclick = function () { (j.steps = j.steps || []).push({ op: "rename" }); renderSteps(); };
        stepsWrap.appendChild(addStep);
      }
      renderSteps();
      b.appendChild(form);
      var result = el("div", "cx-test-result"); b.appendChild(result);
      var preview = el("div", "dsx-preview"); b.appendChild(preview);
      var foot = el("div", "cx-wiz-foot");
      var runBtn = el("button", "btn"); runBtn.type = "button"; runBtn.textContent = "Preview";
      var saveBtn = el("button", "btn primary"); saveBtn.type = "button"; saveBtn.textContent = existing ? "Save changes" : "Add job";
      foot.appendChild(runBtn); foot.appendChild(saveBtn); b.appendChild(foot);
      function collect() {
        j.name = nameInp.value.trim();
        j.sourceDatasetId = srcSel.value;
        j.outputName = outInp.value.trim();
        j.refreshEveryDays = refreshSel.value ? Number(refreshSel.value) : null;
        var jobFolderVal = folderInp.value.trim();
        if (jobFolderVal) j.folder = jobFolderVal; else delete j.folder;
        return j;
      }
      runBtn.onclick = function () {
        collect();
        var src = Studio.Workspace.get("datasets", j.sourceDatasetId);
        if (!src) { result.className = "cx-test-result bad"; result.textContent = "Pick a source dataset first."; return; }
        runBtn.disabled = true; runBtn.textContent = "Running…";
        result.className = "cx-test-result"; result.textContent = ""; preview.innerHTML = "";
        runDataset(src).then(function (r) {
          if (r.error) { runBtn.disabled = false; runBtn.textContent = "Preview"; result.className = "cx-test-result bad"; result.textContent = "✕ " + r.error; return; }
          resolveJobCtx(j.steps).then(function (ctx) {
            return Studio.runJobStepsAsync({ columns: r.columns, rows: r.rows }, j.steps || [], ctx, duckSqlRunner);
          }).then(function (out) {
            runBtn.disabled = false; runBtn.textContent = "Preview";
            if (out.error) { result.className = "cx-test-result bad"; result.textContent = "✕ " + out.error; return; }
            result.className = "cx-test-result ok"; result.textContent = "✓ " + out.rows.length + " rows · " + out.columns.length + " columns";
            var head = "<tr>" + out.columns.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr>";
            var body = out.rows.slice(0, 8).map(function (row) {
              return "<tr>" + row.map(function (v) { return "<td>" + esc(v == null ? "" : String(v)) + "</td>"; }).join("") + "</tr>";
            }).join("");
            preview.innerHTML = "<table>" + head + body + "</table>";
          });
        });
      };
      saveBtn.onclick = function () {
        collect();
        if (!j.name) { nameInp.focus(); result.className = "cx-test-result bad"; result.textContent = "Give the job a name first."; return; }
        if (!j.sourceDatasetId) { srcSel.focus(); result.className = "cx-test-result bad"; result.textContent = "Pick the source dataset this job preps."; return; }
        if (!j.outputName) j.outputName = j.name + " (job output)";
        if (!existing) { var newUid = currentUserId(); if (newUid) j.owner = newUid; }
        Studio.Workspace.put("jobs", j);
        toast(existing ? "Saved " + j.name : "Added " + j.name);
        document.querySelector(".modal-ov .x").click();
      };
      nameInp.focus();
    }, function () { renderJobs(); }, true);
  }
  window.__studioRenderJobs = renderJobs; // test hook
  window.__studioOpenJobEditor = openJobEditor; // test hook
  window.__studioRunJob = runJob; // test hook

  /* ---------- Repository (M5 slice 1, STATUS.md's Conservation Insight track) ----------
     A flat, cross-type search/browse view over every workspace object (dashboards,
     datasets, connections, analyses, jobs) in one place — the "find" half of M5's
     tree/folder browser. Deliberately flat and deep-link-only for this first slice
     (same "honest MVP before nesting" convention as the folder pilot on Datasets/
     Connections): no new editing UI here, a row just opens that object's own
     existing editor. Grouping by folder into a real nested tree is the documented
     NEXT step once this foundation is in place. */
  var _repoAllType = ""; // "" = All, else a REPO_TYPES key
  // M5 slice 2 (STATUS.md's Conservation Insight track — "NEXT in M5" after slice 1's
  // flat list): which folder GROUPS are collapsed, session-only (in-memory, not
  // persisted) — default expanded, keyed by folder name or "__unfiled".
  var _repoCollapsedGroups = {};
  // M5 NEXT ("subfolder create/move affordances beyond typing `/`"): a folder only
  // ever existed as a byproduct of some row's `folder` field, so there was no way to
  // set up an empty folder ahead of filing anything into it. `repoFolderSeeds` is a
  // small persisted list of folder PATHS (same "/" nesting convention as every
  // folder field) that Repository's tree always includes even with zero rows —
  // purely a presence marker, same shape as Workbooks' own named-collection list.
  // Filing a real object into a seeded path doesn't remove the seed (harmless: the
  // path is now backed by real rows too, and unseeding it later just stops
  // guaranteeing it survives to zero rows again). Deleting a seed only removes the
  // marker — it never touches rows, since a seed never owns any.
  function repoLoadFolderSeeds() { return (Studio.Workspace.settings().repoFolderSeeds || []).slice(); }
  function repoSaveFolderSeeds(list) { Studio.Workspace.setSetting("repoFolderSeeds", list); }
  function repoAddFolderSeed(path) {
    path = (path || "").split("/").map(function (s) { return s.trim(); }).filter(Boolean).join("/");
    if (!path) return null;
    var list = repoLoadFolderSeeds();
    if (list.indexOf(path) < 0) { list.push(path); repoSaveFolderSeeds(list); }
    return path;
  }
  function repoRemoveFolderSeed(path) { repoSaveFolderSeeds(repoLoadFolderSeeds().filter(function (p) { return p !== path; })); }
  window.__studioRepoFolderSeeds = repoLoadFolderSeeds; // test hook
  window.__studioRepoAddFolderSeed = repoAddFolderSeed; // test hook
  window.__studioRepoRemoveFolderSeed = repoRemoveFolderSeed; // test hook
  var REPO_TYPES = [
    { key: "dashboard", label: "Dashboards", singular: "Dashboard", ic: "layers" },
    { key: "dataset", label: "Datasets", singular: "Dataset", ic: "db" },
    { key: "connection", label: "Connections", singular: "Connection", ic: "link" },
    { key: "analysis", label: "Analyses", singular: "Analysis", ic: "trend-up" },
    { key: "job", label: "Jobs", singular: "Job", ic: "sliders" }
  ];
  function repoTypeDef(k) { for (var i = 0; i < REPO_TYPES.length; i++) if (REPO_TYPES[i].key === k) return REPO_TYPES[i]; return null; }
  function repoAllRows() {
    var rows = [];
    Studio.Workspace.all("dashboards").filter(isVisibleToMe).forEach(function (r) {
      var sp = r.spec || {}, n = (sp.panels || []).length;
      rows.push({ type: "dashboard", id: r.id, title: sp.title || sp.name || "Untitled",
        meta: n + " panel" + (n === 1 ? "" : "s"), folder: r.folder || "", ts: r.ts ? (Date.parse(r.ts) || 0) : 0 });
    });
    Studio.Workspace.all("datasets").filter(isDatasetVisibleToMe).forEach(function (d) {
      var src = dsxAdapterOf(d);
      rows.push({ type: "dataset", id: d.id, title: d.name || "Untitled",
        meta: src ? src.label : "no connection", folder: d.folder || "", ts: d.updatedAt || 0 });
    });
    Studio.Workspace.all("connections").filter(isVisibleToMe).forEach(function (c) {
      var src = Studio.sourceById(c.adapter);
      rows.push({ type: "connection", id: c.id, title: c.name || "Untitled",
        meta: src ? src.label : "connection", folder: c.folder || "", ts: c.updatedAt || 0 });
    });
    Studio.Workspace.all("analyses").filter(isVisibleToMe).forEach(function (a) {
      rows.push({ type: "analysis", id: a.id, title: a.name || "Untitled",
        meta: (Studio.CHARTS[a.chartType] || {}).label || a.chartType || "chart", folder: a.folder || "", ts: a.updatedAt || 0 });
    });
    Studio.Workspace.all("jobs").filter(isVisibleToMe).forEach(function (j) {
      var n = (j.steps || []).length;
      rows.push({ type: "job", id: j.id, title: j.name || "Untitled",
        meta: n + " step" + (n === 1 ? "" : "s"), folder: j.folder || "", ts: j.updatedAt || 0 });
    });
    return rows;
  }
  // Deep-links to each type's OWN existing editor rather than duplicating any
  // editing UI here — dashboards/analyses switch section (their "editor" is a
  // whole workspace, not a modal); datasets/connections/jobs open their modal
  // straight from wherever Repository happens to be, same as the command palette.
  function repoOpenRow(type, id) {
    if (type === "dashboard") { openRecent(id); return; }
    if (type === "dataset") { openDatasetEditor(Studio.Workspace.get("datasets", id)); return; }
    if (type === "connection") { openConnectionWizard(Studio.Workspace.get("connections", id)); return; }
    if (type === "job") { openJobEditor(Studio.Workspace.get("jobs", id)); return; }
    if (type === "analysis") {
      if (window.__studioShellSetSection) window.__studioShellSetSection("explore");
      xpLoadAnalysis(id);
    }
  }
  function renderRepository() {
    var results = $("#repoAllResults"); if (!results) return;
    var q = (($("#repoAllSearch") || {}).value || "").toLowerCase();
    var all = repoAllRows();
    var counts = { all: all.length };
    all.forEach(function (r) { counts[r.type] = (counts[r.type] || 0) + 1; });
    if (_repoAllType && !counts[_repoAllType]) _repoAllType = "";
    var filtered = all.filter(function (r) {
      if (_repoAllType && r.type !== _repoAllType) return false;
      if (!q) return true;
      return (r.title + " " + r.meta + " " + r.folder).toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) { return b.ts - a.ts; });
    var chipDefs = [{ id: "", name: "All", n: counts.all }]
      .concat(REPO_TYPES.map(function (t) { return { id: t.key, name: t.label, n: counts[t.key] || 0 }; }));
    var chipsHtml = '<div class="wb-chips">' + chipDefs.map(function (c) {
      return '<button type="button" class="wb-chip' + (_repoAllType === c.id ? " active" : "") + '" data-repo-type-filter="' + esc(c.id) + '" aria-pressed="' + (_repoAllType === c.id ? "true" : "false") + '">' +
        '<span class="wb-chip-label">' + esc(c.name) + '</span> <span class="wb-chip-n">' + c.n + '</span></button>';
    }).join("") + '</div>';
    // Real nested-by-folder TREE (M5 — the documented NEXT after slice 2's flat
    // per-folder grouping): a folder value may now contain "/" as a path
    // separator (e.g. "Corn Belt/2024"), so Repository groups by EVERY segment,
    // not just the whole string — "Corn Belt" becomes a collapsible group that
    // itself contains a nested "2024" group, with rows filed exactly "Corn Belt"
    // (no deeper segment) sitting alongside that subgroup, same as a file
    // explorer. This is purely a DISPLAY grouping: the stored `folder` field,
    // each object's own folder text field, and the flat per-type chip facets
    // (Datasets/Connections/Jobs/Analyses) are all unchanged — they still match
    // the whole string. Rows with no folder at all land in a root-level
    // "Unfiled" group, sorted after every real top-level folder, same
    // convention slice 2 established. `filtered` is already sorted newest-first,
    // so insertion order into the tree preserves that ordering without a
    // separate per-node sort.
    function repoFolderSegs(folder) {
      return (folder || "").split("/").map(function (s) { return s.trim(); }).filter(Boolean);
    }
    function repoNewNode(path, label) { return { path: path, label: label, rows: [], order: [], children: {} }; }
    function repoNodeCount(node) {
      var n = node.rows.length;
      node.order.forEach(function (k) { n += repoNodeCount(node.children[k]); });
      return n;
    }
    var repoTreeRoot = repoNewNode("", "");
    function repoWalkPath(path) {
      var node = repoTreeRoot, cur = "";
      repoFolderSegs(path).forEach(function (seg) {
        cur = cur ? cur + "/" + seg : seg;
        if (!node.children[seg]) { node.children[seg] = repoNewNode(cur, seg); node.order.push(seg); }
        node = node.children[seg];
      });
      return node;
    }
    filtered.forEach(function (r) { repoWalkPath(r.folder).rows.push(r); }); // unfiled rows (no segments) stay on the root node itself
    // M5 NEXT ("a New subfolder action"): seeded folders always appear in the tree
    // even with zero rows, so you can create the home for something before filing
    // anything into it — but only in the plain, unfiltered browsing view (a search
    // or type-chip narrows to what actually matches, and an empty seed never
    // "matches" anything).
    var repoSeededNodes = {};
    if (!q && !_repoAllType) {
      repoLoadFolderSeeds().forEach(function (path) {
        var node = repoWalkPath(path);
        if (node) repoSeededNodes[node.path] = true;
      });
    }
    function repoRowHtml(r) {
      var td = repoTypeDef(r.type);
      // Quick edit (M5 NEXT: "a right-panel editor for simple objects instead of
      // always deep-linking out") is offered for all five kinds now that dashboards
      // carry their own flat `folder` field too (alongside the pre-existing workbookId
      // grouping in the Dashboards section) — a dashboard's quick edit is folder-only
      // (its title still lives in Studio's own dashboard settings, not duplicated here).
      var canQuickEdit = REPO_EDIT_TABLE.hasOwnProperty(r.type);
      // M5 NEXT ("drag-to-file", the last documented affordance in this track): a row
      // that carries a folder field is draggable onto any folder group's header to
      // refile it there — canQuickEdit already tracks exactly "this type carries a
      // folder field," so it doubles as the drag eligibility check. Dragging is a
      // desktop-mouse-only convenience layered on TOP of the folder text field (with
      // its autocomplete), which stays the primary, fully mobile-capable way to file
      // something — no touch/keyboard equivalent is offered here on purpose.
      return '<div class="cx-row" data-repo-id="' + esc(r.id) + '" data-repo-type="' + esc(r.type) + '"' + (canQuickEdit ? ' draggable="true"' : '') + ' tabindex="0" role="button" aria-label="Open ' + esc(r.title) + '">' +
        '<span class="cx-ic" style="color:var(--faint)"></span>' +
        '<span class="cx-name"><b>' + esc(r.title) + '</b><small>' + esc((td ? td.singular : r.type) + " · " + r.meta) + '</small></span>' +
        (r.folder ? '<span class="cx-badge cx-folder" title="Folder: ' + esc(r.folder) + '">' + esc(r.folder) + '</span>' : "") +
        '<span class="cx-when">' + (r.ts ? esc(new Date(r.ts).toLocaleDateString()) : "") + '</span>' +
        (canQuickEdit ? '<span class="cx-actions"><button type="button" class="repo-edit" data-repo-edit-type="' + esc(r.type) + '" data-repo-edit-id="' + esc(r.id) + '" title="Quick edit" aria-label="Quick edit ' + esc(r.title) + '"></button></span>' : "") +
        '</div>';
    }
    function repoGroupHtml(key, label, depth, count, contentsHtml, canDelete) {
      var collapsed = !!_repoCollapsedGroups[key];
      return '<div class="cx-group' + (collapsed ? " collapsed" : "") + '" data-repo-group="' + esc(key) + '" data-repo-depth="' + depth + '" style="--repo-depth:' + depth + '">' +
        '<button type="button" class="cx-group-hd" data-repo-group-toggle="' + esc(key) + '" aria-expanded="' + (collapsed ? "false" : "true") + '">' +
          '<span class="cx-group-chev">' + Studio.icon(collapsed ? "chevron-right" : "chevron-down", 12).outerHTML + '</span>' +
          '<span class="cx-group-label">' + esc(label) + '</span>' +
          '<span class="cx-group-n">' + count + '</span>' +
        '</button>' +
        (canDelete ? '<button type="button" class="cx-group-del" data-repo-group-del="' + esc(key) + '" title="Remove empty folder ' + esc(label) + '" aria-label="Remove empty folder ' + esc(label) + '"></button>' : "") +
        '<div class="cx-list">' + contentsHtml + '</div>' +
      '</div>';
    }
    // Non-root nodes render their own subgroups (sorted A→Z) followed by any
    // rows filed exactly at that path — no separate "Unfiled" wrapper is needed
    // below the root, since a row directly in a folder isn't unfiled, it's just
    // not filed any DEEPER. A seeded folder (M5 NEXT: "New subfolder") only offers
    // its delete (✕) affordance while it's still genuinely empty (own rows AND
    // everything nested inside it) — once real data lands there it's a real
    // folder, same as any other, and the seed marker becomes moot.
    function repoNodeHtml(node, depth) {
      var childKeys = node.order.slice().sort();
      var childrenHtml = childKeys.map(function (k) {
        var child = node.children[k];
        var childCount = repoNodeCount(child);
        return repoGroupHtml(child.path, child.label, depth, childCount, repoNodeHtml(child, depth + 1),
          !!repoSeededNodes[child.path] && childCount === 0);
      }).join("");
      return childrenHtml + node.rows.map(repoRowHtml).join("");
    }
    var topKeys = repoTreeRoot.order.slice().sort();
    var groupsHtml = topKeys.map(function (k) {
      var child = repoTreeRoot.children[k];
      var childCount = repoNodeCount(child);
      return repoGroupHtml(child.path, child.label, 0, childCount, repoNodeHtml(child, 1),
        !!repoSeededNodes[child.path] && childCount === 0);
    }).join("") + (repoTreeRoot.rows.length
      ? repoGroupHtml("__unfiled", "Unfiled", 0, repoTreeRoot.rows.length, repoTreeRoot.rows.map(repoRowHtml).join(""))
      : "");
    var newFolderHtml = (!q && !_repoAllType)
      ? '<div class="wb-add repo-folder-add"><input type="text" id="repoNewFolderInp" class="wb-name-inp" placeholder="New folder… (e.g. Finance or Finance/2024)" aria-label="New folder name"/>' +
        '<button type="button" class="btn" id="repoNewFolderBtn">+ New folder</button></div>'
      : "";
    results.innerHTML = chipsHtml + newFolderHtml +
      ((topKeys.length || repoTreeRoot.rows.length) ? '<div class="cx-groups">' + groupsHtml + '</div>'
        : '<div class="home-empty-hint">' + (q || _repoAllType ? "Nothing matches." :
            "Your workspace is empty — dashboards, datasets, connections, analyses and jobs will all show up here once you create them.") + '</div>');
    $$("[data-repo-type-filter]", results).forEach(function (btn) {
      btn.onclick = function () { _repoAllType = btn.getAttribute("data-repo-type-filter"); renderRepository(); };
    });
    $$("[data-repo-group-toggle]", results).forEach(function (btn) {
      btn.onclick = function () {
        var key = btn.getAttribute("data-repo-group-toggle");
        _repoCollapsedGroups[key] = !_repoCollapsedGroups[key];
        renderRepository();
      };
      // M5 NEXT ("drag-to-file"): a folder's own header is the drop target — dropping
      // a dragged row here refiles it to exactly this group's path ("__unfiled" clears
      // the folder field entirely, same as typing a blank Folder field would).
      var group = btn.closest(".cx-group");
      btn.addEventListener("dragover", function (e) { e.preventDefault(); if (group) group.classList.add("drag-over"); });
      btn.addEventListener("dragleave", function () { if (group) group.classList.remove("drag-over"); });
      btn.addEventListener("drop", function (e) {
        e.preventDefault();
        if (group) group.classList.remove("drag-over");
        var data;
        try { data = JSON.parse(e.dataTransfer.getData("text/plain")); } catch (err) { return; }
        if (!data || !data.type || !data.id) return;
        var key = btn.getAttribute("data-repo-group-toggle");
        var folder = key === "__unfiled" ? "" : key;
        if (repoSetObjectFolder(data.type, data.id, folder)) {
          toast(folder ? "Filed into “" + folder + "”" : "Removed from its folder");
          renderRepository();
        }
      });
    });
    $$(".cx-row[data-repo-id]", results).forEach(function (row) {
      var td = repoTypeDef(row.getAttribute("data-repo-type"));
      var icEl = row.querySelector(".cx-ic"); if (icEl && Studio.icon && td) icEl.appendChild(Studio.icon(td.ic, 18));
      var open = function () { repoOpenRow(row.getAttribute("data-repo-type"), row.getAttribute("data-repo-id")); };
      row.addEventListener("click", open);
      row.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target === row) { e.preventDefault(); open(); } });
      if (row.getAttribute("draggable") === "true") {
        row.addEventListener("dragstart", function (e) {
          e.dataTransfer.setData("text/plain", JSON.stringify({ type: row.getAttribute("data-repo-type"), id: row.getAttribute("data-repo-id") }));
          e.dataTransfer.effectAllowed = "move";
          row.classList.add("dragging");
        });
        row.addEventListener("dragend", function () { row.classList.remove("dragging"); });
      }
    });
    $$(".repo-edit", results).forEach(function (btn) {
      if (Studio.icon) btn.appendChild(Studio.icon("edit", 14));
      btn.onclick = function (e) {
        e.stopPropagation();
        openRepoQuickEdit(btn.getAttribute("data-repo-edit-type"), btn.getAttribute("data-repo-edit-id"));
      };
    });
    var newFolderBtn = $("#repoNewFolderBtn", results);
    if (newFolderBtn) newFolderBtn.onclick = function () {
      var inp = $("#repoNewFolderInp", results);
      var raw = inp ? inp.value.trim() : "";
      if (!raw) { if (inp) inp.focus(); toast("Type a folder name first — e.g. “Finance” or “Finance/2024”.", true); return; }
      var path = repoAddFolderSeed(raw);
      if (!path) { if (inp) inp.focus(); toast("Type a folder name first — e.g. “Finance” or “Finance/2024”.", true); return; }
      toast("Folder “" + path + "” created");
      renderRepository();
    };
    var newFolderInp = $("#repoNewFolderInp", results);
    if (newFolderInp) newFolderInp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); newFolderBtn.click(); } });
    $$("[data-repo-group-del]", results).forEach(function (btn) {
      if (Studio.icon) btn.appendChild(Studio.icon("trash", 9));
      btn.onclick = function (e) {
        e.stopPropagation();
        repoRemoveFolderSeed(btn.getAttribute("data-repo-group-del"));
        renderRepository();
      };
    });
  }
  window.__studioRenderRepository = renderRepository; // test hook

  // M5 NEXT (right-panel editor for simple objects): the four kinds that already
  // carry a flat `folder` field get a quick name+folder edit in the shell's
  // rightPanel, without leaving Repository or opening the full editor. This is
  // deliberately NOT a replacement for each kind's real editor (dataset SQL,
  // connection credentials, job steps, analysis chart config all still need
  // their own full UI) — it's the fast path for the two properties every
  // catalog row shares. "Open full editor" hands off to the same repoOpenRow
  // paths a normal row click already uses.
  var REPO_EDIT_TABLE = { dataset: "datasets", connection: "connections", job: "jobs", analysis: "analyses", dashboard: "dashboards" };
  // M5 NEXT ("drag-to-file"): the write side of a drag-drop refile, shared with any
  // future caller that just needs to move one object between folders by id — a no-op
  // (returns false, no toast/re-render) when it's already exactly there.
  function repoSetObjectFolder(type, id, folder) {
    var table = REPO_EDIT_TABLE[type]; if (!table) return false;
    var obj = Studio.Workspace.get(table, id); if (!obj) return false;
    if ((obj.folder || "") === (folder || "")) return false;
    if (folder) obj.folder = folder; else delete obj.folder;
    Studio.Workspace.put(table, obj);
    return true;
  }
  // Dashboards carry no top-level `.name` (their title lives at `spec.title`, edited in
  // Studio's own dashboard settings) — quick edit is folder-only for this one kind, so it
  // doesn't duplicate title-editing UI outside Studio.
  function openRepoQuickEdit(type, id) {
    var PS = window.PolecatShell; if (!PS) return; // fleet.js module not loaded yet (sub-second boot window)
    var table = REPO_EDIT_TABLE[type]; if (!table) return;
    var obj = Studio.Workspace.get(table, id); if (!obj) return;
    var td = repoTypeDef(type);
    var kind = td ? td.singular.toLowerCase() : type;
    var isDash = type === "dashboard";
    var body = el("div", "cx-wiz-form");
    function qeField(lbl, input, hint) {
      var row = el("label", "cx-field");
      row.innerHTML = "<span>" + esc(lbl) + "</span>";
      row.appendChild(input);
      if (hint) { var h = el("small", "cx-hint"); h.textContent = hint; row.appendChild(h); }
      body.appendChild(row);
      return input;
    }
    var nameInp = null;
    if (!isDash) {
      nameInp = qeField(td ? td.singular + " name" : "Name", el("input"));
      nameInp.type = "text"; nameInp.value = obj.name || "";
    }
    var folderInp = qeField("Folder", el("input"), "Optional — a home for this " + kind + " (e.g. Finance, or Finance/2024 to nest). Pick an existing one or type a new name.");
    folderInp.type = "text"; folderInp.value = obj.folder || ""; folderInp.placeholder = "e.g. Finance";
    var folderNames = {};
    var visFn = type === "dataset" ? isDatasetVisibleToMe : isVisibleToMe;
    Studio.Workspace.all(table).filter(visFn).forEach(function (x) { if (x.folder) folderNames[x.folder] = true; });
    var folderList = el("datalist"); folderList.id = "repoQeFolderOptions";
    Object.keys(folderNames).sort().forEach(function (f) { var o = el("option"); o.value = f; folderList.appendChild(o); });
    folderInp.setAttribute("list", "repoQeFolderOptions");
    folderInp.parentNode.appendChild(folderList);
    var msg = el("div", "cx-test-result"); body.appendChild(msg);
    var foot = el("div", "cx-wiz-foot");
    var openBtn = el("button", "btn"); openBtn.type = "button"; openBtn.textContent = "Open full editor →";
    var saveBtn = el("button", "btn primary"); saveBtn.type = "button"; saveBtn.textContent = "Save";
    foot.appendChild(openBtn); foot.appendChild(saveBtn);
    var panel = PS.rightPanel({ title: "Edit " + kind, body: [body, foot] });
    openBtn.onclick = function () { panel.close(); repoOpenRow(type, id); };
    saveBtn.onclick = function () {
      if (nameInp) {
        var name = nameInp.value.trim();
        if (!name) { nameInp.focus(); msg.className = "cx-test-result bad"; msg.textContent = "Give it a name first."; return; }
        obj.name = name;
      }
      var folderVal = folderInp.value.trim();
      if (folderVal) obj.folder = folderVal; else delete obj.folder;
      Studio.Workspace.put(table, obj);
      toast(nameInp ? "Saved " + obj.name : "Saved");
      panel.close();
    };
    (nameInp || folderInp).focus();
  }
  window.__studioOpenRepoQuickEdit = openRepoQuickEdit; // test hook

  /* ---------- Workspace backend (Settings card + rail indicator) ----------
     Manager's data-source pattern: the app's own catalog (dashboards/datasets/
     connections) is local-first, and a meta-capable source (Turso/Supabase/
     Firebase) can be connected as the backend it mirrors to — created/updated
     from the browser via the 3-step wizard (pick → creds → probe/classify). */
  function renderWorkspaceBackendCard() {
    var card = $("#wsBackendCard"); if (!card) return;
    var st = Studio.Sync.syncState();
    var sec = Studio.Sync.secretsState();
    var dot = st.status === "connected" ? "ok" : (st.status === "error" ? "bad" : (st.status === "local" ? "" : "busy"));
    var statusLine = st.status === "local" ? "Changes stay in this browser only"
      : st.status === "connected" ? "Connected — changes mirror automatically" + (st.lastPushAt ? " · last sync " + new Date(st.lastPushAt).toLocaleTimeString() : "")
      : st.status === "syncing" ? "Syncing…"
      : st.status === "connecting" ? "Connecting…"
      : "Error: " + (st.lastError || "sync failed");
    card.innerHTML = '<h2>Workspace backend</h2>' +
      '<p class="ws-card-intro">Where this workspace\'s catalog lives — dashboards, datasets and connections. Local by default; connect a database to reach the same workspace from any browser. <b>Credentials are stored in this browser only.</b></p>' +
      '<div class="ws-current">' +
        '<span class="cx-dot ' + dot + '"></span>' +
        '<span class="cx-name"><b>' + esc(st.label) + '</b><small>' + esc(statusLine) + '</small></span>' +
        '<span class="cx-actions ws-actions">' +
          (st.isRemote ? '<button type="button" class="btn" id="wsRefreshBtn" title="Pull the backend\'s current contents (edits from other browsers)">Refresh</button>' +
            '<button type="button" class="btn" id="wsEditBtn">Edit</button>' +
            '<button type="button" class="btn" id="wsDisconnectBtn">Disconnect</button>' : "") +
          '<button type="button" class="btn primary" id="wsSwitchBtn">' + (st.isRemote ? "Switch backend" : "+ Connect backend") + '</button>' +
        '</span></div>' +
      (st.isRemote ?
        '<div class="ws-secrets">' +
          '<span class="cx-name"><b>' + (sec.enabled ? (sec.locked ? "Secrets encrypted — locked" : "Secrets encrypted") : "Secrets stored as plaintext") + '</b>' +
          '<small>' + (sec.enabled
            ? (sec.locked ? "This browser hasn't unlocked the passphrase yet — connection credentials stay ciphertext until it does." : "Connection credentials are AES-GCM ciphertext in the backend; the passphrase never leaves this browser.")
            : "Connection credential values are written to the backend unencrypted. Turn on encryption to store them as ciphertext only.") + '</small></span>' +
          '<span class="cx-actions ws-actions">' +
            (sec.enabled
              ? (sec.locked ? '<button type="button" class="btn primary" id="wsUnlockBtn">Unlock…</button>' : '<button type="button" class="btn" id="wsSecretsOffBtn">Turn off</button>')
              : '<button type="button" class="btn" id="wsSecretsOnBtn"' + (sec.available ? "" : " disabled title=\"WebCrypto unavailable\"") + '>Encrypt secrets…</button>') +
          '</span></div>' : "");
    var refreshBtn = $("#wsRefreshBtn", card);
    if (refreshBtn) refreshBtn.onclick = function () {
      refreshBtn.disabled = true;
      Studio.Sync.pullNow().then(function (s) { toast(s.status === "connected" ? "Workspace refreshed" : "Refresh failed: " + s.lastError, s.status !== "connected"); });
    };
    var disconnectBtn = $("#wsDisconnectBtn", card);
    if (disconnectBtn) disconnectBtn.onclick = function () {
      if (!window.confirm("Disconnect from " + st.label + "? Your current local copy stays; it just stops mirroring.")) return;
      Studio.Sync.disconnect();
      toast("Back to local-only");
    };
    var editBtn = $("#wsEditBtn", card);
    if (editBtn) editBtn.onclick = function () { openBackendWizard(st.source, Studio.Sync.currentConfig()); };
    var switchBtn = $("#wsSwitchBtn", card);
    if (switchBtn) switchBtn.onclick = function () { openBackendWizard(); };
    var onBtn = $("#wsSecretsOnBtn", card);
    if (onBtn) onBtn.onclick = function () {
      var pass = window.prompt("Choose an encryption passphrase (needed on every browser that opens this workspace):");
      if (!pass) return;
      Studio.Sync.enableSecrets(pass).then(function () { toast("Secrets encrypted"); }, function (e) { toast(e.message, true); });
    };
    var offBtn = $("#wsSecretsOffBtn", card);
    if (offBtn) offBtn.onclick = function () {
      if (!window.confirm("Turn encryption off and store credential values as plaintext in the backend?")) return;
      Studio.Sync.disableSecrets().then(function () { toast("Secrets stored as plaintext"); });
    };
    var unlockBtn = $("#wsUnlockBtn", card);
    if (unlockBtn) unlockBtn.onclick = function () {
      var pass = window.prompt("Enter the workspace's encryption passphrase:");
      if (!pass) return;
      Studio.Sync.unlockSecrets(pass).then(function () { toast("Secrets unlocked"); }, function () { toast("Wrong passphrase", true); });
    };
  }
  // The 3-step connect wizard: pick a meta-capable backend → credentials →
  // probe + classify (empty → provision & push up; ours → adopt or reset;
  // another app's / foreign → refuse, with an explicit destructive escape).
  // onConnected (optional, M3.2): fired after a successful connect, in addition
  // to the toast — the sign-in screen uses it to know when to stop showing its
  // own "connecting…" state (see gate.js's "Connect to your workspace").
  function openBackendWizard(presetSrc, presetCfg, onConnected) {
    modal(presetSrc ? "Edit backend connection" : "Connect a workspace backend", function (b) {
      function classifyStep(src, cfg) {
        b.innerHTML = '<p class="cx-wiz-intro">Checking what\'s in that database…</p>';
        src.probe(cfg).then(function (probe) {
          b.innerHTML = "";
          var intro = el("div", "cx-wiz-head");
          intro.innerHTML = '<div class="cx-wiz-ttl"><b>' + esc(src.label) + '</b><small>' + esc(Studio.WS.describeContents(probe)) + '</small></div>';
          b.appendChild(intro);
          var result = el("div", "cx-test-result"); b.appendChild(result);
          var foot = el("div", "cx-wiz-foot"); b.appendChild(foot);
          function act(label, primary, fn) {
            var btn = el("button", "btn" + (primary ? " primary" : "")); btn.type = "button"; btn.textContent = label;
            btn.onclick = function () {
              btn.disabled = true; result.className = "cx-test-result"; result.textContent = "Working…";
              fn().then(function () {
                // Mirror whatever the connect just settled on into the LOCAL sign-in
                // store: adopting an existing workspace means signing in against ITS
                // accounts, not the ones this browser seeded before connecting.
                try { if (window.PolecatAuth && Studio.Workspace) window.PolecatAuth.importFromStore(Studio.Workspace.all("users")); } catch (e2) {}
                try { renderAdmin(); if (window.__studioShellApplyRoleGating) window.__studioShellApplyRoleGating(); } catch (e2) {}
                toast("Workspace backend connected");
                document.querySelector(".modal-ov .x").click();
                if (typeof onConnected === "function") onConnected();
              }, function (e) {
                btn.disabled = false;
                result.className = "cx-test-result bad"; result.textContent = "✕ " + ((e && e.message) || e);
              });
            };
            foot.appendChild(btn);
            return btn;
          }
          if (probe.state === "empty") {
            if (src.browserProvision) {
              result.textContent = "Empty database — Studio will create its tables and copy your current workspace up.";
              act("Set up & connect", true, function () {
                return src.provision(cfg, Studio.Workspace.snapshot()).then(function (r) {
                  if (r && r.ok === false) throw new Error(r.error || "provision failed");
                  return Studio.Sync.connectPush(src.id, cfg);
                });
              });
            } else {
              // manual provisioning (Supabase): show the paste-me script, then re-probe
              src.provision(cfg, Studio.Workspace.snapshot()).then(function (r) {
                result.textContent = "This backend can't create tables from the browser — run this once in its SQL editor, then continue:";
                var pre = el("textarea", "dsx-sql ws-provision-sql"); pre.readOnly = true; pre.value = r.sql || "";
                b.insertBefore(pre, foot);
                act("I've run it — connect", true, function () {
                  return src.probe(cfg).then(function (p2) {
                    if (p2.state !== "polecat") throw new Error("Still can't see the workspace tables — did the script run?");
                    return Studio.Sync.connectPush(src.id, cfg);
                  });
                });
              });
            }
          } else if (probe.state === "polecat" && Studio.WS.isOwnApp(probe.app)) {
            result.textContent = "Found an existing Studio workspace (" + Studio.WS.describeContents(probe) + "). Adopt it as your working copy, or overwrite it with this browser's.";
            act("Adopt backend copy", true, function () { return Studio.Sync.connectAdopt(src.id, cfg); });
            act("Overwrite with mine", false, function () {
              if (!window.confirm("Replace EVERYTHING in the backend with this browser's workspace?")) return Promise.reject(new Error("cancelled"));
              return src.drop(cfg).then(function () {
                return src.provision(cfg, Studio.Workspace.snapshot());
              }).then(function (r) {
                if (r && r.ok === false && !r.manual) throw new Error(r.error || "provision failed");
                return Studio.Sync.connectPush(src.id, cfg);
              });
            });
          } else if (probe.state === "polecat") {
            result.className = "cx-test-result bad";
            result.textContent = "That database belongs to another Polecat app (“" + (probe.app || "unknown") + "”) — pick a different one.";
          } else {
            result.className = "cx-test-result bad";
            result.textContent = "That database already has unrelated tables. Studio won't touch them.";
            act("Wipe it & set up here", false, function () {
              if (!window.confirm("Drop EVERY table in that database and set up a fresh Studio workspace?")) return Promise.reject(new Error("cancelled"));
              return src.drop(cfg).then(function () {
                return src.provision(cfg, Studio.Workspace.snapshot());
              }).then(function (r) {
                if (r && r.ok === false && !r.manual) throw new Error(r.error || "provision failed");
                return Studio.Sync.connectPush(src.id, cfg);
              });
            });
          }
        }, function (e) {
          b.innerHTML = '<div class="cx-test-result bad">✕ ' + esc((e && e.message) || String(e)) + '</div>';
        });
      }
      function credsStep(src) {
        b.innerHTML = "";
        var head = el("div", "cx-wiz-head");
        var ic = el("span", "cx-wiz-ic"); ic.style.color = src.accent || "var(--brand)"; ic.appendChild(Studio.icon(src.icon || "db", 22));
        var ttl = el("div", "cx-wiz-ttl"); ttl.innerHTML = "<b>" + esc(src.label) + "</b><small>" + esc(src.blurb || "") + "</small>";
        head.appendChild(ic); head.appendChild(ttl); b.appendChild(head);
        var form = el("div", "cx-wiz-form");
        var inputs = {};
        (src.fields || []).forEach(function (f) {
          var row = el("label", "cx-field");
          row.innerHTML = "<span>" + esc(f.label) + "</span>";
          var inp = el("input");
          inp.type = f.type === "password" ? "password" : "text";
          inp.placeholder = f.placeholder || ""; inp.autocomplete = "off";
          inp.value = (presetCfg && presetCfg[f.key]) || "";
          row.appendChild(inp);
          if (f.hint) { var h = el("small", "cx-hint"); h.textContent = f.hint; row.appendChild(h); }
          form.appendChild(row); inputs[f.key] = inp;
        });
        b.appendChild(form);
        if (src.docsUrl) {
          var docs = el("div", "cx-docs");
          docs.innerHTML = 'Where do these values come from? <a href="' + esc(src.docsUrl) + '" target="_blank" rel="noopener noreferrer">docs ↗</a>';
          b.appendChild(docs);
        }
        var result = el("div", "cx-test-result"); b.appendChild(result);
        var foot = el("div", "cx-wiz-foot");
        var nextBtn = el("button", "btn primary"); nextBtn.type = "button"; nextBtn.textContent = "Check database →";
        foot.appendChild(nextBtn); b.appendChild(foot);
        nextBtn.onclick = function () {
          var cfg = {};
          Object.keys(inputs).forEach(function (k) { var v = inputs[k].value.trim(); if (v) cfg[k] = v; });
          nextBtn.disabled = true; result.className = "cx-test-result"; result.textContent = "Testing…";
          src.test(cfg).then(function (r) {
            if (!r.ok && !/META_TABLE|relation|does not exist|404/i.test(r.error || "")) {
              nextBtn.disabled = false;
              result.className = "cx-test-result bad"; result.textContent = "✕ " + (r.error || "unreachable");
              return;
            }
            classifyStep(src, cfg);
          });
        };
      }
      if (presetSrc) { credsStep(presetSrc); return; }
      var intro = el("p", "cx-wiz-intro");
      intro.textContent = "Pick where the workspace should live. Only backends that can host the app's own catalog are listed.";
      b.appendChild(intro);
      var grid = el("div", "cx-src-grid");
      Studio.remoteMetaSources().forEach(function (src) {
        var cardEl = el("button", "cx-src-card"); cardEl.type = "button";
        cardEl.style.setProperty("--src-accent", src.accent || "var(--brand)");
        var ic = el("span", "cx-src-ic"); ic.appendChild(Studio.icon(src.icon || "db", 22));
        var txt = el("span", "cx-src-txt");
        txt.innerHTML = "<b>" + esc(src.label) + "</b><small>" + esc(src.blurb || "") + "</small>";
        cardEl.appendChild(ic); cardEl.appendChild(txt);
        cardEl.onclick = function () { credsStep(src); };
        grid.appendChild(cardEl);
      });
      b.appendChild(grid);
    }, function () { renderWorkspaceBackendCard(); }, true);
  }
  window.__studioRenderWorkspaceBackendCard = renderWorkspaceBackendCard; // test hook
  window.__studioOpenBackendWizard = openBackendWizard; // test hook

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
      if (!S.catalog[stem]) S.catalog[stem] = { file: stem + ".cda", dataAccesses: [] };
      var entry = S.catalog[stem];
      entry.dataAccesses = entry.dataAccesses.filter(function (x) { return x.id !== d.id; }).concat([d]);
      dsCount++;
    });
    var W = Studio.Workspace, dashCountImported = 0;
    (data.dashboards || []).forEach(function (r) {
      if (!r || !r.id) return;
      var prior = W.get("dashboards", r.id);
      // an imported row wins (same rule as the old byId overwrite), but keeps
      // local-only organization it doesn't carry itself
      if (prior) {
        if (prior.pinned && !r.pinned) { r.pinned = true; r.pinnedAt = prior.pinnedAt; }
        if (prior.workbookId && !r.workbookId) r.workbookId = prior.workbookId;
      }
      r.title = (r.spec && r.spec.title) || r.title || "";
      r.name = (r.spec && r.spec.name) || r.name || "";
      W.put("dashboards", r, { silent: true });
      dashCountImported++;
    });
    if (dashCountImported) W.notify("dashboards");
    var pins = loadPins(), pinSet = {};
    pins.concat(data.pins || []).forEach(function (id) { pinSet[id] = true; });
    savePins(Object.keys(pinSet));
    var wbList = loadWorkbooks(), wbById = {};
    wbList.forEach(function (w) { wbById[w.id] = w; });
    (data.workbooks || []).forEach(function (w) { if (w && w.id) wbById[w.id] = w; });
    saveWorkbooks(Object.keys(wbById).map(function (id) { return wbById[id]; }));
    buildLibrary(); renderHome(); renderDashboards();
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
        if (!data || data._type !== "studio-repository") { toast("Not an Analytics repository file", true); return; }
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
    { grp: "Mode", id: "samples", t: "Sample content", d: "Show the built-in demo suite — sample dashboards and the sample query library, all running on the internal demo database. Turn off to start from an empty workspace; nothing is deleted, flip it back anytime.",
      ic: function () { return "layers"; },
      on: function () { return showSamples(); },
      set: function () { setShowSamples(!showSamples()); toast(showSamples() ? "Sample content shown" : "Sample content hidden — flip this back anytime"); } },
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
        else { enterStudio(); enterFocusMode(); }
      } }
  ];

  /* ---------- Z12: Branding — app mark as a Settings option -----------------
     Default / custom-logo / none, so the rail identity isn't hardcoded. A custom
     logo is stored as a data: URL in localStorage (capped small — this is an icon,
     not an asset host) so it survives reload with zero backend. */
  var BRAND_MAX_BYTES = 200 * 1024; // ~200KB — plenty for an icon-sized logo, keeps localStorage sane
  function getBranding() {
    return lsGet("studio-branding", { mode: "default" });
  }
  function setBranding(b) {
    lsSet("studio-branding", b);
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

  /* ---------- M4.2 (per-section rights half): which rail sections a viewer may
     see. Admin-only sections (Admin itself) already have their own gating; these
     are the ordinary sections an admin can additionally hide from the viewer
     role. Default is the empty list — every section stays visible until an admin
     opts to narrow it, so adopting this feature changes nothing for existing
     workspaces. Home is deliberately NOT offered here — it's the fallback
     landing section a bounced viewer is sent to (same convention as the Admin
     rail's own bounce), so it must always stay reachable. */
  var CONFIGURABLE_SECTIONS = [
    ["explore", "Explore"], ["dashboards", "Dashboards"],
    ["datasets", "Datasets"], ["jobs", "Jobs"], ["connections", "Connections"],
    ["repository", "Repository"], ["studio", "Studio"]
  ];
  function getHiddenSections() { return lsGet("studio-hidden-sections", []); }
  function setSectionHidden(sec, hidden) {
    var list = getHiddenSections().slice();
    var i = list.indexOf(sec);
    if (hidden && i < 0) list.push(sec);
    else if (!hidden && i >= 0) list.splice(i, 1);
    lsSet("studio-hidden-sections", list);
    try { if (window.__studioShellApplyRoleGating) window.__studioShellApplyRoleGating(); } catch (e) {}
  }
  window.__studioSectionRights = { get: getHiddenSections, set: setSectionHidden, CONFIGURABLE: CONFIGURABLE_SECTIONS }; // test hook

  // Z5 follow-up: export/import Settings as JSON — the keys below are app-wide
  // *preferences* (theme, mode, layout, connections), never dashboard content —
  // that's already covered by Save/Open. Lets a user carry their setup to another
  // browser/device or back it up before "Clear local data".
  var SETTINGS_DATA_KEYS = [
    "studio-theme", "studio-app-theme", "studio-simple-mode", "studio-connections", "studio-active-conn",
    "studio-lw", "studio-rw", "studio-collapse-library", "studio-collapse-inspector",
    "studio-insp-collapsed", "studio-shell-section", "studio-shell-expanded", "studio-branding",
    "studio-default-subtitle", "studio-default-accent", "studio-default-logo", "studio-default-headerbg",
    "studio-default-titlesize", "studio-default-subtitlestyle", "studio-default-dashboardtheme", "studio-default-cardskin", "studio-style-presets",
    "studio-deploy-path", "studio-templatevar-sets", "studio-customtheme-presets", "studio-hidden-sections",
    "studio-home-section-order"
  ];

  // Z5 follow-up: deploy target config. S.settings.{deployPath,live} used to be in-memory-only
  // (hardcoded defaults, reset every reload) despite living on a page titled "app-wide preferences,
  // saved locally on this device" — found while surfacing them as a first-class Settings card.
  // Persisted the same way every other Settings default already is.
  function deployPathPref() {
    var v; try { v = localStorage.getItem("studio-deploy-path"); } catch (e) {}
    return (v && v.trim()) || "/public/pdc-iteration/v2";
  }

  // Z6/Z5 follow-up: dashboard defaults. A light first cut of the "style-preset collections"
  // ask — a single default subtitle + accent color applied to every brand-new blank dashboard,
  // so a team's house style doesn't need re-entering by hand each time. Existing dashboards
  // (Open/Import/examples) are never touched — this only seeds Studio.emptySpec() output.
  // R3 (tech-debt sweep): these default* getter/setter pairs store a PLAIN string, not JSON
  // (lsGet/lsSet above are JSON-shaped and would mis-parse/re-quote what's already saved), so
  // they share this pair of tiny helpers instead — same load/save boilerplate, one place.
  function strDefault(key) {
    var v; try { v = localStorage.getItem(key); } catch (e) {}
    return v || "";
  }
  function setStrDefault(key, v) { try { localStorage.setItem(key, v || ""); } catch (e) {} }
  function defaultSubtitle() { return strDefault("studio-default-subtitle"); }
  function setDefaultSubtitle(v) { setStrDefault("studio-default-subtitle", v); }
  function defaultAccentColor() { return strDefault("studio-default-accent"); }
  function setDefaultAccentColor(v) { setStrDefault("studio-default-accent", v); }
  // Z6 follow-up: default header background color — same seeding pattern as subtitle/accent,
  // for the per-dashboard "Header background color" field (flat banner fill, distinct from
  // Accent color which only tints the border/chart accents).
  function defaultHeaderBg() { return strDefault("studio-default-headerbg"); }
  function setDefaultHeaderBg(v) { setStrDefault("studio-default-headerbg", v); }
  // Z6 follow-up: default title size + subtitle style — same seeding pattern, for the
  // per-dashboard "Title size"/"Subtitle style" fields added after the preset collection shipped.
  function defaultTitleSize() { return strDefault("studio-default-titlesize"); }
  function setDefaultTitleSize(v) { setStrDefault("studio-default-titlesize", v); }
  function defaultSubtitleStyle() { return strDefault("studio-default-subtitlestyle"); }
  function setDefaultSubtitleStyle(v) { setStrDefault("studio-default-subtitlestyle", v); }
  // Visual refresh (A) follow-up: default Dashboard theme — same seeding pattern as the other
  // style defaults, for the whole-look Studio.DASHBOARD_THEMES picker (v281). Lets a team make
  // Fleet Modern (or any future preset) the house look for brand-new dashboards without touching
  // existing ones, without hardcoding a new global default ahead of a user look-see.
  function defaultDashboardTheme() {
    var v; try { v = localStorage.getItem("studio-default-dashboardtheme"); } catch (e) {}
    // Never-set → follow the app's own Color theme (LF10), so a brand-new dashboard/widget
    // (and Explore's live preview) reads as one system with the chrome around it instead of
    // always defaulting to Polecat regardless of what Color theme is active. A stored "" is a
    // LEGACY explicit Classic pick (the old Settings select stored classic as empty), and
    // "classic" is the new explicit form — both resolve to "" because a blank key means
    // classic everywhere downstream.
    if (v === null || v === undefined) return appThemeToDashboardTheme(appTheme());
    return v === "classic" ? "" : v;
  }
  function setDefaultDashboardTheme(v) { setStrDefault("studio-default-dashboardtheme", v); }
  // N-DESIGN follow-up: default card style — same seeding pattern, for the per-dashboard
  // "Card style" (Raised/Flat chart skin) field added right after the picker itself shipped.
  function defaultCardSkin() { return strDefault("studio-default-cardskin"); }
  function setDefaultCardSkin(v) { setStrDefault("studio-default-cardskin", v); }
  // Z6 follow-up: default header logo — the last "still open" item under the style-preset
  // collection ask. Same data-URL-in-localStorage approach as per-dashboard headerLogo/app
  // Branding, just seeded onto brand-new blank dashboards like subtitle/accent already are.
  function defaultLogo() { return strDefault("studio-default-logo"); }
  function setDefaultLogo(v) { setStrDefault("studio-default-logo", v); }
  // Z6 follow-up: named style-preset collection. Each preset snapshots the default
  // fields above under a name, so a team can save several house styles (e.g. per client
  // or per event) and switch the active default with one click instead of re-typing it.
  var _stylePresetStore = makePresetStore("studio-style-presets");
  function stylePresets() { return _stylePresetStore.list(); }
  function saveStylePresetList(list) { _stylePresetStore.saveList(list); }
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
  function deleteStylePreset(id) { _stylePresetStore.remove(id); }
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
  var _templateVarSetStore = makePresetStore("studio-templatevar-sets");
  function templateVarSets() { return _templateVarSetStore.list(); }
  function saveTemplateVarSetList(list) { _templateVarSetStore.saveList(list); }
  function addTemplateVarSet(name, vars) {
    var list = templateVarSets();
    list.push({
      id: "tv" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name,
      vars: (vars || []).map(function (v) { return { key: v.key, value: v.value }; })
    });
    saveTemplateVarSetList(list);
    return list;
  }
  function deleteTemplateVarSet(id) { _templateVarSetStore.remove(id); }
  function applyTemplateVarSet(id, sp) {
    var p = templateVarSets().filter(function (x) { return x.id === id; })[0];
    if (!p) return false;
    sp.templateVars = (p.vars || []).map(function (v) { return { key: v.key, value: v.value }; });
    return true;
  }
  window.__studioTemplateVarSets = templateVarSets; // test hook
  // N-DESIGN follow-up (theme studio, STATUS.md "still open" after the first-cut ship): named,
  // reusable custom-theme presets — same save/apply/delete pattern as stylePresets/
  // templateVarSets above, so an authored custom theme can be saved once and applied to any
  // other dashboard instead of re-picking 8 colors every time.
  var _customThemePresetStore = makePresetStore("studio-customtheme-presets");
  function customThemePresets() { return _customThemePresetStore.list(); }
  function saveCustomThemePresetList(list) { _customThemePresetStore.saveList(list); }
  function addCustomThemePreset(name, customTheme) {
    var list = customThemePresets();
    list.push({
      id: "ct" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name,
      light: { bg: customTheme.light.bg, panel: customTheme.light.panel, text: customTheme.light.text, brand: customTheme.light.brand },
      dark: { bg: customTheme.dark.bg, panel: customTheme.dark.panel, text: customTheme.dark.text, brand: customTheme.dark.brand }
    });
    saveCustomThemePresetList(list);
    return list;
  }
  function deleteCustomThemePreset(id) { _customThemePresetStore.remove(id); }
  function applyCustomThemePreset(id, sp) {
    var p = customThemePresets().filter(function (x) { return x.id === id; })[0];
    if (!p) return false;
    sp.customTheme = {
      light: { bg: p.light.bg, panel: p.light.panel, text: p.light.text, brand: p.light.brand },
      dark: { bg: p.dark.bg, panel: p.dark.panel, text: p.dark.text, brand: p.dark.brand }
    };
    return true;
  }
  window.__studioCustomThemePresets = customThemePresets; // test hook
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
    if (!data || data._type !== "studio-settings") { toast("Not an Analytics settings file", true); return false; }
    if (!confirm("Import these settings? This replaces your current theme, mode, connections, and layout preferences, then reloads.")) return false;
    return applySettingsData(data);
  }
  window.__studioExportSettings = exportSettingsFile; // test hook
  window.__studioApplySettingsData = applySettingsData; // test hook (bypasses file-picker + confirm)
  window.__studioImportSettingsKeys = SETTINGS_DATA_KEYS; // test hook

  // M3 (auth): run once at boot after the workspace is ready. (1) Mirror the
  // local user store into the workspace `users` table so the internal user list
  // rides the backend snapshot (the data blob carries the pw hash — UX-level, not
  // RLS). (2) If you signed in with the DEMO account, seed the sample workspace
  // once so a demo login lands on something alive.
  function initAuthBoot() {
    var Auth = window.PolecatAuth; if (!Auth || !Studio.Workspace) return;
    try {
      var W = Studio.Workspace;
      (Auth.exportForStore() || []).forEach(function (u) {
        var existing = W.all("users").filter(function (r) { return r.u === u.u; })[0];
        var row = existing || { id: "user_" + u.u };
        row.u = u.u; row.name = u.name; row.role = u.role; row.demo = u.demo; row.hash = u.hash;
        W.put("users", row, { silent: true });
      });
    } catch (e) {}
    try {
      if (Auth.isDemo() && Studio.DEMO_PACKS && Studio.DEMO_PACKS.conservation &&
          !Studio.demoPackInstalled("conservation")) {
        Studio.installDemoPack("conservation");
      }
    } catch (e) {}
    // Re-render the identity-dependent sections now that an account is known.
    // The app boots BEHIND the sign-in overlay (before any identity exists), so
    // the Admin section rendered once as not-signed-in and kept its stale
    // "administrators only" state even after an admin logged in — this repaints
    // it (and the Settings account card) against the now-authenticated user, and
    // re-applies rail role-gating so the Admin item shows/hides correctly.
    try { renderSettings(); } catch (e) {}
    try { renderAdmin(); } catch (e) {}
    try { if (window.__studioShellApplyRoleGating) window.__studioShellApplyRoleGating(); } catch (e) {}
  }
  // The app boots (behind the sign-in overlay) BEFORE you actually sign in, so
  // gate.js calls this after a successful login to run the identity-dependent
  // boot steps (user mirror + demo auto-install) against the now-known account.
  window.__studioAuthBoot = initAuthBoot;

  // M3 (auth): who you're signed in as, a sign-out, and the demo-content toggle.
  // Demo content = the Conservation Insight sample workspace (demopacks.js) — on
  // for the demo account, removable any time, and cleared on a real-backend login.
  function accountCardHtml() {
    var Auth = window.PolecatAuth; if (!Auth) return "";
    var u = Auth.current() || { name: "Local", role: "admin", demo: false };
    var demoOn = !!(Studio.demoPackInstalled && Studio.demoPackInstalled("conservation"));
    return '<div class="settings-card" id="accountCard"><h2>Account</h2>' +
      '<div class="set-row"><span class="set-row-ic" data-ic="key"></span>' +
        '<div class="set-row-txt"><b>' + esc(u.name || u.u || "Signed in") + '</b><small>Signed in' +
          (u.role ? " · " + esc(u.role) : "") + (u.demo ? " · demo account" : "") + '</small></div>' +
        '<button type="button" class="btn" id="setSignOutBtn">Sign out</button></div>' +
      '<div class="set-row"><span class="set-row-ic" data-ic="globe"></span>' +
        '<div class="set-row-txt"><b>Demo content</b><small>A ready-made sample workspace — connections, datasets, a rollup job, analyses and a featured dashboard. On by default for the demo account; turn it off any time.</small></div>' +
        '<label class="set-sw"><input type="checkbox" id="setDemoContent"' + (demoOn ? " checked" : "") + '/><span class="set-sw-track"></span></label></div>' +
    '</div>';
  }
  function renderSettings() {
    var sec = $("#secSettings"); if (!sec) return;
    var groups = [];
    SETTINGS_TOGGLES.forEach(function (t) { if (groups.indexOf(t.grp) < 0) groups.push(t.grp); });
    var html = '<div class="settings-wrap"><div class="settings-hero"><h1>Settings</h1>' +
      '<p>App-wide preferences, saved locally on this device.</p></div>' +
      accountCardHtml() +
      '<div class="settings-card" id="wsBackendCard"></div>' +
      groups.map(function (g) {
        var themeRow = g === "Appearance" ?
          '<div class="set-row set-row-col"><span class="set-row-ic" data-ic="palette"></span>' +
            '<div class="set-row-txt"><b>Color theme</b><small>Classic Blue is the original built-in chrome; Polecat recolors the builder in the warm terracotta/plum look the left rail already uses; Fleet Modern applies the same jobtracker.polecat.live tokens as the Fleet Modern dashboard theme. Each card previews its own real colors.</small></div>' +
            appThemeCardsHtml() +
          '</div>' : "";
        // Tour lives with the other guided/presentation affordances (moved out of the
        // topbar per user feedback — it's a once-in-a-while action, not daily chrome).
        var tourRow = g === "Presentation" ?
          '<div class="set-row"><span class="set-row-ic" data-ic="play"></span>' +
            '<div class="set-row-txt"><b>Welcome tour</b><small>Re-run the guided walkthrough of the builder (also under ⋯ More → Tour).</small></div>' +
            '<button type="button" class="btn" id="setTourBtn">Take the tour</button></div>' : "";
        return '<div class="settings-card"><h2>' + esc(g) + '</h2>' +
          SETTINGS_TOGGLES.filter(function (t) { return t.grp === g; }).map(function (t) {
            return '<div class="set-row"><span class="set-row-ic" data-ic="' + t.ic() + '"></span>' +
              '<div class="set-row-txt"><b>' + esc(t.t) + '</b><small>' + esc(t.d) + '</small></div>' +
              '<label class="set-sw"><input type="checkbox" data-set="' + t.id + '"' + (t.on() ? " checked" : "") + '/><span class="set-sw-track"></span></label></div>';
          }).join("") + themeRow + tourRow + '</div>';
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
      '<div class="settings-card"><h2>Dashboard defaults</h2>' +
        '<div class="set-row"><span class="set-row-ic" data-ic="layers"></span>' +
          '<div class="set-row-txt"><b>Default subtitle</b><small>Pre-fills every new blank dashboard\'s subtitle field with your team\'s house style (e.g. a standard tagline). Blank leaves it empty.</small></div>' +
          '<input type="text" id="setDefaultSubtitleInp" class="set-txt" value="' + esc(defaultSubtitle()) + '" placeholder="e.g. Prepared by the SE team"/></div>' +
        '<div class="set-row"><span class="set-row-ic" data-ic="palette"></span>' +
          '<div class="set-row-txt"><b>Default accent color</b><small>Applied to every new blank dashboard\'s banner (same picker as the per-dashboard Accent color field). Theme default keeps the active dashboard theme\'s own accent.</small></div>' +
          '<div class="set-accent-presets" id="setDefaultAccentRow">' +
            Studio.THEME_PRESETS.map(function (preset) {
              return '<button type="button" class="set-accent-swatch' + (defaultAccentColor() === preset.color ? " active" : "") + '" data-accent="' + esc(preset.color) + '" title="' + esc(preset.label) + '" aria-pressed="' + (defaultAccentColor() === preset.color ? "true" : "false") + '" style="background:' + (preset.color || themeDefaultAccent(defaultDashboardTheme())) + '"></button>';
            }).join("") +
            '<input type="color" id="setDefaultAccentCustom" title="Custom accent color" value="' + esc(defaultAccentColor() || themeDefaultAccent(defaultDashboardTheme())) + '"/>' +
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
          '<div class="set-row-txt"><b>Default dashboard theme</b><small>Seeds every new blank dashboard\'s whole-look theme (background, panels, text, brand + series colors — same picker as the per-dashboard Dashboard theme field). Polecat is the house default; Classic Blue keeps the original look.</small></div>' +
          '<select id="setDefaultDashboardThemeSel" class="set-sel">' +
            Studio.DASHBOARD_THEMES.map(function (p) { return '<option value="' + esc(p.key) + '"' + ((defaultDashboardTheme() || "classic") === p.key ? " selected" : "") + '>' + esc(p.label) + '</option>'; }).join("") +
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
      (showSamples() && Object.keys(Studio.DEMO_PACKS || {}).length ?
        '<div class="settings-card"><h2>Demo packs</h2>' +
          '<p class="ws-card-intro">A second, opt-in sample library for pitch-specific demos — installs as ordinary workspace content (a dataset, analyses, a dashboard), tagged so Remove cleans up exactly what Install wrote.</p>' +
          Object.keys(Studio.DEMO_PACKS).map(function (id) {
            var p = Studio.DEMO_PACKS[id], on = Studio.demoPackInstalled(id);
            return '<div class="set-row"><span class="set-row-ic" data-ic="globe"></span>' +
              '<div class="set-row-txt"><b>' + esc(p.name) + '</b><small>' + esc(p.blurb) + '</small></div>' +
              '<button type="button" class="btn' + (on ? "" : " primary") + '" data-demopack="' + esc(id) + '">' + (on ? "Remove" : "Install") + '</button></div>';
          }).join("") +
        '</div>' : "") +
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
    renderWorkspaceBackendCard();
    $$(".set-row-ic[data-ic]", sec).forEach(function (span) { span.appendChild(Studio.icon(span.getAttribute("data-ic"), 18)); });
    $$(".apptheme-check[data-ic]", sec).forEach(function (span) { span.appendChild(Studio.icon(span.getAttribute("data-ic"), 11)); });
    $$("input[data-set]", sec).forEach(function (cb) {
      var t = SETTINGS_TOGGLES.filter(function (x) { return x.id === cb.getAttribute("data-set"); })[0];
      if (t) cb.addEventListener("change", t.set);
    });
    // M3: Account card — sign out + demo-content toggle.
    var signOutBtn = $("#setSignOutBtn", sec);
    if (signOutBtn) signOutBtn.onclick = function () {
      if (window.PolecatAuth) window.PolecatAuth.logout();
      location.reload();
    };
    var demoContentCb = $("#setDemoContent", sec);
    if (demoContentCb) demoContentCb.onchange = function () {
      if (demoContentCb.checked) { Studio.installDemoPack("conservation"); toast("Demo content added to your workspace"); }
      else { Studio.removeDemoPack("conservation"); toast("Demo content removed"); }
      renderSettings();
    };
    $$("#appThemeCards .apptheme-card", sec).forEach(function (card) {
      card.onclick = function () {
        var k = card.getAttribute("data-app-theme-card");
        setAppTheme(k);
        toast(APP_THEME_LABELS[k] + " theme applied");
        renderSettings();
      };
    });
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
    var setTourBtn = $("#setTourBtn", sec);
    if (setTourBtn) setTourBtn.onclick = function () {
      enterStudio();
      if (window.StudioWelcome) StudioWelcome.open();
    };
    $$("[data-demopack]", sec).forEach(function (btn) {
      btn.onclick = function () { toggleDemoPack(btn.getAttribute("data-demopack"), Studio.DEMO_PACKS[btn.getAttribute("data-demopack")]); };
    });
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

  // M4 (admin, first slice — "Admin + permissions" per STATUS.md): a rail area, visible
  // only to admins, that lists every account and lets you add/edit/remove one. Roles
  // are UX-level gating today (client-side, one shared local store) — real per-user
  // enforcement is the later Supabase-RLS slice (M7); per-section rights beyond
  // admin/viewer, and the private/public object flag, are follow-up slices of M4.
  function renderAdmin() {
    var sec = $("#secAdmin"); if (!sec) return;
    var Auth = window.PolecatAuth;
    var me = Auth ? Auth.current() : null;
    var isAdmin = !!(me && me.role === "admin");
    if (!Auth || !isAdmin) {
      sec.classList.remove("has-content");
      sec.innerHTML = '<div class="sec-empty"><div class="sec-empty-ic" data-ic="shield"></div><h2>Admin</h2>' +
        '<p>This area is for administrators only.</p></div>';
      $$(".sec-empty-ic[data-ic]", sec).forEach(function (span) { span.appendChild(Studio.icon(span.getAttribute("data-ic"), 26)); });
      return;
    }
    var users = Auth.list().sort(function (a, b) { return (a.name || a.u).localeCompare(b.name || b.u); });
    var adminCount = users.filter(function (u) { return u.role === "admin"; }).length;
    var rows = users.map(function (u) {
      var lastAdmin = u.role === "admin" && adminCount <= 1;
      return '<div class="cx-row" data-usr-id="' + esc(u.u) + '">' +
        '<span class="cx-ic" data-usr-ic></span>' +
        '<span class="cx-name"><b>' + esc(u.name || u.u) + '</b><small>' + esc(u.u) + '</small></span>' +
        '<span class="cx-badge' + (u.role === "admin" ? " admin" : u.role === "developer" ? " developer" : "") + '">' + esc(u.role) + '</span>' +
        (u.demo ? '<span class="cx-badge">demo</span>' : "") +
        (me.u === u.u ? '<span class="cx-badge">you</span>' : "") +
        '<span class="cx-actions">' +
          '<button type="button" class="btn" data-usr-edit="' + esc(u.u) + '">Edit</button>' +
          '<button type="button" class="btn" data-usr-del="' + esc(u.u) + '"' + (lastAdmin ? ' disabled title="The workspace needs at least one admin"' : "") + ' aria-label="Remove ' + esc(u.name || u.u) + '">✕</button>' +
        '</span></div>';
    }).join("");
    var hiddenSections = getHiddenSections();
    var sectionRows = CONFIGURABLE_SECTIONS.map(function (s) {
      var hidden = hiddenSections.indexOf(s[0]) >= 0;
      return '<div class="set-row"><div class="set-row-txt"><b>' + esc(s[1]) + '</b></div>' +
        '<label class="set-sw"><input type="checkbox" data-sec-right="' + esc(s[0]) + '"' + (hidden ? "" : " checked") + '/><span class="set-sw-track"></span></label></div>';
    }).join("");
    sec.classList.add("has-content");
    sec.innerHTML = '<div class="repo-wrap"><div class="repo-hero"><h1>Admin</h1>' +
      '<p>Manage who can sign in to this workspace. <b>Admin</b> has full access; <b>viewer</b> can browse and explore but not edit. This is UX-level access control today — per-object privacy and DB-enforced roles arrive with the Supabase-RLS slice.</p>' +
      '<div class="repo-io"><button type="button" class="btn primary" id="usrNewBtn">+ Add user</button></div></div>' +
      (rows ? '<div class="cx-list">' + rows + '</div>' : '<div class="cx-empty">No users yet.</div>') +
      '<div class="settings-card"><h2>Section access</h2>' +
      '<p class="ws-card-intro">Turn a section off for the <b>viewer</b> role — it disappears from their rail. Admins always see every section.</p>' +
      sectionRows +
      '</div>' +
    '</div>';
    $$("[data-usr-ic]", sec).forEach(function (span) { span.appendChild(Studio.icon("user", 18)); });
    $$("[data-sec-right]", sec).forEach(function (cb) {
      cb.addEventListener("change", function () { setSectionHidden(cb.getAttribute("data-sec-right"), !cb.checked); });
    });
    var newBtn = $("#usrNewBtn", sec); if (newBtn) newBtn.onclick = function () { openUserEditor(); };
    $$("[data-usr-edit]", sec).forEach(function (btn) {
      btn.onclick = function () { var u = Auth.find(btn.getAttribute("data-usr-edit")); if (u) openUserEditor(u); };
    });
    $$("[data-usr-del]", sec).forEach(function (btn) {
      btn.onclick = function () {
        if (btn.disabled) return;
        var uid = btn.getAttribute("data-usr-del");
        var u = Auth.find(uid); if (!u) return;
        if (uid === me.u) { toast("You can't remove your own signed-in account.", true); return; }
        if (!confirm('Remove user "' + (u.name || u.u) + '"? They will no longer be able to sign in.')) return;
        var r = Auth.remove(uid);
        if (!r.ok) { toast(r.error === "last-admin" ? "Can't remove the last admin." : "Couldn't remove that user.", true); return; }
        try { Studio.Workspace.remove("users", "user_" + uid, { silent: true }); } catch (e) {}
        toast("Removed " + (u.name || u.u));
        renderAdmin();
      };
    });
  }
  window.__studioRenderAdmin = renderAdmin; // test hook

  function openUserEditor(existing) {
    modal(existing ? "Edit user" : "Add user", function (b) {
      var form = el("div", "cx-wiz-form");
      var uRow = el("label", "cx-field"); uRow.innerHTML = "<span>Username</span>";
      var uInp = el("input"); uInp.type = "text"; uInp.autocomplete = "off"; uInp.placeholder = "e.g. jsmith";
      uInp.value = existing ? existing.u : ""; uInp.disabled = !!existing;
      uRow.appendChild(uInp); form.appendChild(uRow);
      var nRow = el("label", "cx-field"); nRow.innerHTML = "<span>Display name</span>";
      var nInp = el("input"); nInp.type = "text"; nInp.placeholder = "e.g. Jamie Smith";
      nInp.value = existing ? (existing.name || "") : "";
      nRow.appendChild(nInp); form.appendChild(nRow);
      var rRow = el("label", "cx-field"); rRow.innerHTML = "<span>Role</span>";
      var rSel = el("select");
      [["admin", "Admin — full access"], ["developer", "Developer — build & edit dashboards"], ["viewer", "Viewer — browse & explore"]].forEach(function (r) {
        var o = el("option"); o.value = r[0]; o.textContent = r[1];
        if ((existing ? existing.role : "viewer") === r[0]) o.selected = true;
        rSel.appendChild(o);
      });
      rRow.appendChild(rSel); form.appendChild(rRow);
      var pRow = el("label", "cx-field");
      pRow.innerHTML = "<span>" + (existing ? "New password (optional)" : "Password") + "</span>";
      var pInp = el("input"); pInp.type = "password"; pInp.autocomplete = "new-password";
      pInp.placeholder = existing ? "Leave blank to keep the current password" : "";
      pRow.appendChild(pInp); form.appendChild(pRow);
      b.appendChild(form);
      var result = el("div", "cx-test-result"); b.appendChild(result);
      var foot = el("div", "cx-wiz-foot");
      var saveBtn = el("button", "btn primary"); saveBtn.type = "button"; saveBtn.textContent = existing ? "Save changes" : "Add user";
      foot.appendChild(saveBtn); b.appendChild(foot);
      saveBtn.onclick = function () {
        var u = uInp.value.trim();
        if (!u) { uInp.focus(); result.className = "cx-test-result bad"; result.textContent = "Give the user a username first."; return; }
        if (!existing && window.PolecatAuth.find(u)) { result.className = "cx-test-result bad"; result.textContent = "That username is already taken."; return; }
        if (!existing && !pInp.value) { pInp.focus(); result.className = "cx-test-result bad"; result.textContent = "Set a password."; return; }
        var opts = { name: nInp.value.trim() || u, role: rSel.value };
        if (pInp.value) opts.pass = pInp.value;
        window.PolecatAuth.upsert(u, opts).then(function () {
          try { if (window.__studioAuthBoot) window.__studioAuthBoot(); } catch (e) {}
          try { if (window.__studioShellApplyRoleGating) window.__studioShellApplyRoleGating(); } catch (e) {}
          toast(existing ? "Saved " + opts.name : "Added " + opts.name);
          renderAdmin();
          document.querySelector(".modal-ov .x").click();
        });
      };
    });
  }
  window.__studioOpenUserEditor = openUserEditor; // test hook

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
  function appTheme() { return S.appTheme || "polecat"; }
  // LF10: map the app Color theme (chrome-only) onto its matching Studio.DASHBOARD_THEMES
  // key, so "which dashboard theme is the house default" tracks "which app theme is active"
  // instead of the two ever disagreeing. Kept as a plain table (not derived from
  // DASHBOARD_THEMES) since the two enums are curated independently and don't share keys 1:1.
  // UX11: "conservation" completes the LF10 mapping now that the Conservation app
  // Color theme exists (it reuses Studio.DASHBOARD_THEMES' own "conservation" key
  // verbatim, unlike classic/polecat/modern which don't share names 1:1).
  var APP_THEME_TO_DASHBOARD_THEME = { classic: "", polecat: "polecat", modern: "fleet-modern", conservation: "conservation" };
  function appThemeToDashboardTheme(t) {
    return APP_THEME_TO_DASHBOARD_THEME[t] !== undefined ? APP_THEME_TO_DASHBOARD_THEME[t] : "polecat";
  }
  var APP_THEME_KEYS = ["classic", "polecat", "modern", "conservation"];
  var APP_THEME_LABELS = { classic: "Classic Blue", polecat: "Polecat", modern: "Fleet Modern", conservation: "Conservation" };
  function setAppTheme(t) {
    t = APP_THEME_KEYS.indexOf(t) >= 0 ? t : "polecat";
    S.appTheme = t; document.documentElement.setAttribute("data-app-theme", t);
    // Polecat Shell contract: the vendored shell keys off data-palette × data-theme.
    // Mirror the app theme onto data-palette (the storage keys stay the historical
    // studio-theme / studio-app-theme pair — no user state is touched).
    document.documentElement.setAttribute("data-palette", t);
    try { localStorage.setItem("studio-app-theme", t); } catch (e) {}
  }
  window.__studioAppTheme = { get: appTheme, set: setAppTheme }; // test hook
  // LF17: the Settings "Color theme" picker shows each option as a real preview instead of a
  // text-only <option>, so pick-by-looking replaces pick-by-reading. Rather than hand-copying
  // studio.css's per-theme hex values into a second, easily-stale JS table, this briefly flips
  // <html>'s [data-app-theme] to the candidate key, reads its ACTUAL resolved tokens back via
  // getComputedStyle, then restores the real active theme — same "read the live token, don't
  // guess at a static palette" reasoning the Inspector's resolveTokenColor/rampGradientCss color
  // pickers already use (those read the #preview iframe's document instead, since dashboard
  // theming lives there; app-chrome theming lives on <html> itself, so this reads that directly).
  // The flip+restore is synchronous with no yield to the event loop in between, so the browser
  // never actually paints the intermediate candidate theme — no visible flash.
  function resolveAppThemeTokens(themeKey) {
    var de = document.documentElement;
    var saved = de.getAttribute("data-app-theme");
    var flip = saved !== themeKey;
    if (flip) de.setAttribute("data-app-theme", themeKey);
    var cs = getComputedStyle(de);
    var tokens = {
      brand: cs.getPropertyValue("--brand").trim(),
      pdc: cs.getPropertyValue("--pdc").trim(),
      bg: cs.getPropertyValue("--bg").trim(),
      topbarBg: cs.getPropertyValue("--topbar-bg").trim()
    };
    if (flip) de.setAttribute("data-app-theme", saved || "polecat");
    return tokens;
  }
  // Renders the Color theme picker as a small, cleanly-grouped row of clickable cards (an
  // AutoSelector-style radiogroup) instead of a plain <select> — each card's banner is the
  // theme's own --topbar-bg gradient, the three dots below it its --brand/--pdc/--bg, so the
  // card IS the theme, not a caption describing it. Native <button> elements already give Tab
  // focus + Enter/Space activation for free, so no extra keyboard wiring is needed.
  function appThemeCardsHtml() {
    var active = appTheme();
    return '<div class="apptheme-picker" role="radiogroup" aria-label="Color theme" id="appThemeCards">' +
      APP_THEME_KEYS.map(function (k) {
        var isActive = active === k, t = resolveAppThemeTokens(k);
        return '<button type="button" class="apptheme-card' + (isActive ? " active" : "") + '" data-app-theme-card="' + k + '" role="radio" aria-checked="' + (isActive ? "true" : "false") + '" aria-label="' + esc(APP_THEME_LABELS[k]) + ' color theme">' +
          '<span class="apptheme-banner" style="background:' + esc(t.topbarBg) + '" aria-hidden="true"></span>' +
          '<span class="apptheme-chips" aria-hidden="true">' +
            '<span class="apptheme-chip" style="background:' + esc(t.brand) + '" title="Brand"></span>' +
            '<span class="apptheme-chip" style="background:' + esc(t.pdc) + '" title="Accent"></span>' +
            '<span class="apptheme-chip" style="background:' + esc(t.bg) + '" title="Background"></span>' +
          '</span>' +
          '<span class="apptheme-name">' + esc(APP_THEME_LABELS[k]) + '</span>' +
          (isActive ? '<span class="apptheme-check" data-ic="check" aria-hidden="true"></span>' : '') +
        '</button>';
      }).join("") +
    '</div>';
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
    } else if (d.type === "zoom") {
      openPanelZoom(d.panelId);
    } else if (d.type === "viewport") {
      // LF28: the GL choropleth's last pan/zoom, written back live (debounced) as the user
      // interacts with it — no refreshPreview()/toast, a silent background persist so panning
      // doesn't visibly reload the iframe; the NEXT explicit save/export just picks it up off
      // the already-mutated spec/XP.opts. Explore's single-panel preview carries the fixed id
      // "xp1" (never a real dashboard panel id), so it falls through to the XP branch.
      var vpanel = panelById(d.id);
      if (vpanel) { vpanel.chart.opts = vpanel.chart.opts || {}; vpanel.chart.opts.viewport = d.viewport; scheduleNoteRecent(); }
      else if (d.id === "xp1") { XP.opts = XP.opts || {}; XP.opts.viewport = d.viewport; }
    } else if (d.type === "header-edit") {
      // Inline canvas edit of a header text object (title · subtitle · description).
      // Mirrors the dashboard inspector's own field wiring so both stay in sync.
      if (d.field === "title") { if (!d.value) return; S.spec.title = d.value; syncHeader(); }
      else if (d.field === "subtitle") S.spec.subtitle = d.value;
      else if (d.field === "description") { if (d.value) S.spec.description = d.value; else delete S.spec.description; }
      else return;
      if (!S.selection) renderInspector(); // null selection = dashboard inspector is showing
      refreshPreview();
      toast(d.field === "description" && !d.value ? "Text object removed" : "Updated " + d.field);
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
    var stem = (p.title || "widget").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "widget";
    single.name = stem;
    celebrateFirstExport();
    bumpExportMilestone();
    bundleModal("Embed widget", [{ name: stem + "-embed.html", body: Studio.exportCDF(single, S.assets, S.settings.deployPath), mime: "text/html" }]);
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
    var html = singlePanelHtml(p);

    // Overlay
    var ov = document.createElement("div"); ov.className = "pz-overlay"; ov.id = "pzOverlay";
    var ifr = document.createElement("iframe"); ifr.className = "pz-frame"; ifr.title = "Widget zoom: " + (p.title || "Widget");
    var closeBtn = document.createElement("button"); closeBtn.className = "pz-close"; closeBtn.setAttribute("aria-label", "Exit zoom (Esc)");
    closeBtn.appendChild(Studio.icon("close", 14)); closeBtn.appendChild(document.createTextNode(" Exit zoom"));
    ov.appendChild(ifr); ov.appendChild(closeBtn); document.body.appendChild(ov);
    _pzOverlay = ov;
    window.__panelZoomActive = true;

    postThemeOnLoad(ifr);
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
    // LF8: interacting with the chart (e.g. the GL map's zoom controls) can move focus INTO the
    // iframe's own document, whose keydown events never reach this document's listener above —
    // Esc then silently does nothing. The iframe is srcdoc without a sandbox attribute, so it's
    // same-origin: attach a second Escape listener directly on its contentDocument once loaded
    // (mirrors the fix Slideshow already applies by focusing its close button on open).
    ifr.addEventListener("load", function () {
      try { ifr.contentWindow.document.addEventListener("keydown", onKey); } catch (e) {}
    });
    // Start focus on the close button so a bare Esc (no chart interaction yet) already works.
    closeBtn.focus();
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
      titleEl.textContent = p.title || ("Widget " + (idx + 1));
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
      var html = singlePanelHtml(p);
      postThemeOnLoad(ifr);
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
    sp.gridCols = 3;
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
      // Shipped examples that don't pin a whole-look theme adopt the house default
      // (Polecat unless Settings says otherwise) so the out-of-box gallery wears it.
      if (!S.spec.dashboardTheme) S.spec.dashboardTheme = defaultDashboardTheme();
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
    ["schema", "id", "name", "title", "subtitle", "group", "description", "themeColor", "dashboardTheme", "customTheme", "paletteKey", "headerLogo", "headerLink", "headerBg", "titleSize", "subtitleStyle", "cardSkin", "hideHeader", "templateVars"].forEach(function (k) { if (spec[k] != null) base[k] = spec[k]; });
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
        ["Ctrl / ⌘  +  D", "Duplicate selected widget or KPI"],
        ["Ctrl / ⌘  +  S", "Save to your Dashboards catalog"],
        ["Ctrl / ⌘  +  F", "Focus library search (filter queries)"],
        ["/", "Focus chart-type gallery search (widget selected)"],
        ["↑ / ↓   (widget selected)", "Reorder widget up / down"],
        ["Shift + ← / →   (widget selected)", "Decrease / increase widget span"],
        ["Delete / Backspace   (widget selected)", "Delete selected widget or KPI"],
        ["Escape   (widget selected)", "Deselect — return to dashboard inspector"],
        ["Escape   (Focus mode)", "Exit Focus mode — return to builder"],
        ["↗ button on widget", "Zoom widget to full screen (Escape to close)"],
        ["?", "Show this keyboard shortcuts panel"],
        ["Escape", "Close modal or dropdown menu"],
        ["Tab", "Navigate interactive controls"],
        ["Double-click widget title", "Rename widget inline"]
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
    "studio-default-subtitle", "studio-default-accent", "studio-default-logo", "studio-default-headerbg",
    // N-DESIGN follow-up: studio-default-dashboardtheme (v281) and studio-default-cardskin were/are
    // new Settings-default keys — folded straight into this list from the start this time, since
    // studio-default-dashboardtheme itself was found missing here while adding cardSkin (same "new
    // Settings key, forgot Clear local data" gap the v194/v235 notes describe).
    "studio-default-titlesize", "studio-default-subtitlestyle", "studio-default-dashboardtheme", "studio-default-cardskin", "studio-style-presets",
    "studio-cmdk-usage", "studio-first-export-done", "studio-export-count", "studio-dash-count",
    "studio-deploy-path", "studio-templatevar-sets", "studio-da-freshness",
    "studio-canvas-notes", "studio-health-celebrated", "studio-customtheme-presets",
    // Track L sweep (dead/orphaned-key lens): "studio-k8-dismissed" (the Simple-mode "What's
    // next?" onboarding card's dismissal flag) was written on dismiss but never wiped here — the
    // exact "new key, forgot Clear local data" gap the v194/v235/v281 notes above already
    // describe, just for a dismissal flag rather than a Settings default this time.
    "studio-k8-dismissed",
    // Track L sweep (dead/orphaned-key lens, round 2): app/welcome.js's "studio-welcome-seen" and
    // app/tutorial.js's "studio-tutorial-done" are two more first-run flags that live entirely
    // outside studio.js (so they'd never show up while eyeballing this file alone) — found by
    // cross-checking every localStorage.setItem/getItem call across ALL of app/*.js against this
    // list rather than just this file. Without them, "Clear local data" left a device stuck
    // "already onboarded" — the welcome screen and interactive tutorial would never re-offer
    // themselves after a supposedly-full reset.
    "studio-welcome-seen", "studio-tutorial-done", "studio-tutorial-done-quick", "studio-tutorial-done-build",
    // N-FUN: "studio-last-viewed" (per-dashboard last-opened timestamps, powers the "N changes
    // since you were last here" Home/Repository card hint) — folded in from the start this time.
    "studio-last-viewed",
    // ★★★-1 sweep: two more instances of the same recurring gap. "analytics.workspace.v1" is
    // the WORKSPACE STORE blob (connections/datasets/settings since the 2026-07-13 overhaul,
    // dashboards since ★★★-1) — it was never added here, so "Clear local data" silently left
    // the user's connections and datasets behind. "studio-whatsnew-seen" is the What's-new
    // unseen-dot seen-version (stage-4 shell adoption). The page reloads right after clearing,
    // so the in-memory Workspace can't re-persist the removed blob.
    "analytics.workspace.v1", "studio-whatsnew-seen",
    // Viridis V7: the Demo packs install-tracker (app/demopacks.js) — same
    // "new key, forgot Clear local data" gap the notes above already cover.
    "studio-demopacks-installed",
    // Track L sweep (orphaned-key lens, round 3): cross-checked every localStorage call across
    // ALL of app/*.js + app/sources/*.js against this list again (same technique as the v313/v322
    // sweeps) and found three more UI-preference flags that were written but never wiped —
    // "studio-show-samples" (the query-library "hide demo content" toggle), "studio-lib-samples-
    // open" (whether the library's Samples group is expanded), and "studio-dash-view" (the
    // Dashboards section's tiles/list toggle) — plus two keys in app/sources/sync.js that live
    // entirely outside app/studio.js: "analytics.datasource.v1" (the saved remote workspace-sync
    // connection — exactly the "Saved server connections" the Clear-local-data confirm dialog
    // already promises to remove) and "analytics.datasource.secret.v1" (its cached decryption
    // passphrase, this browser only — leaving it behind after disconnecting the connection it
    // belongs to is stale-secret hygiene, not just a missed toggle).
    "studio-show-samples", "studio-lib-samples-open", "studio-dash-view",
    "analytics.datasource.v1", "analytics.datasource.secret.v1",
    // Track L sweep (orphaned-key lens, round 4): the auth (M3), per-section-rights (M4.2) and
    // Home-reorder (M6) slices each added a new key but none of them updated this list — the same
    // recurring gap, this time with a sharper edge: "analytics.session.v1" (app/auth.js's signed-
    // in user) being left behind meant "Clear local data" did NOT reload you as a first-time
    // visitor as the REVIEW-FIXES queue asked — you stayed signed in. "studio-hidden-sections"
    // (M4.2's per-section rail visibility) and "studio-home-section-order" (M6's Home reorder)
    // are the same missed-Settings-key gap for two more recent features (both already listed in
    // SETTINGS_DATA_KEYS above, so Export/Import already carried them — only Clear-local-data was
    // behind).
    "analytics.session.v1", "studio-hidden-sections", "studio-home-section-order"
  ];
  window.__studioClearDataKeys = CLEAR_DATA_KEYS; // test hook

  // New ▾ menu: blank, duplicate, then auto-build starters. Auto-build now
  // draws from BOTH planes — your workspace datasets first, then the sample
  // query sets (only while samples are shown) — and stays usable at scale:
  // beyond a handful of entries it gets a type-to-filter box instead of an
  // endless list (there could be thousands of datasets eventually).
  function buildNewMenu(filterText) {
    var nm = $("#menuNew"); if (!nm) return;
    var flt = (filterText || "").toLowerCase();
    var dsSets = Studio.Workspace.all("datasets").filter(function (d) { return (d.columns || []).length >= 2; })
      .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); })
      .map(function (d) { return { kind: "dataset", key: d.id, label: d.name }; });
    var stemSets = !showSamples() ? [] : Object.keys(S.catalog).filter(function (st) {
      return (S.catalog[st].dataAccesses || []).some(function (d) { return (d.columns || []).length >= 2; });
    }).sort().map(function (st) { return { kind: "stem", key: st, label: st }; });
    var sets = dsSets.concat(stemSets).filter(function (x) { return !flt || x.label.toLowerCase().indexOf(flt) >= 0; });
    var CAP = 10, total = sets.length, needsFilter = total > CAP || flt;
    var shown = sets.slice(0, CAP);
    nm.innerHTML = '<button data-new="blank">＋ Blank dashboard</button>' +
      '<button data-new="dup" id="btnDupDash">⧉ Duplicate current</button>' +
      (total || needsFilter ? '<div class="sep"></div><div class="grp">Auto-build a starter</div>' : "") +
      (needsFilter ? '<input type="search" id="newMenuFilter" class="new-menu-filter" placeholder="Filter ' + total + ' sets…" aria-label="Filter auto-build sets"/>' : "") +
      shown.map(function (x) {
        return '<button data-set-kind="' + x.kind + '" data-set-key="' + esc(x.key) + '">' +
          (x.kind === "dataset" ? "◈ " : "") + esc(x.label) + "</button>";
      }).join("") +
      (total > CAP ? '<div class="new-menu-more">+ ' + (total - CAP) + " more — type to filter</div>" : "");
    $$("button", nm).forEach(function (b) {
      b.onclick = function () {
        var action = b.getAttribute("data-new");
        if (action === "blank") {
          S.spec = applyDashboardDefaults(Studio.emptySpec()); S.selection = null; syncHeader(); renderInspector(); refreshPreview(); bumpDashMilestone();
        } else if (action === "dup") {
          var dup = Studio.clone(S.spec);
          dup.id    = Studio.uid("dash");
          dup.title = (dup.title || "Untitled Dashboard") + " (copy)";
          dup.name  = (dup.name  || "untitled").replace(/(-copy)+$/, "") + "-copy";
          S.spec    = dup;
          S.selection = null;
          syncHeader(); renderInspector(); refreshPreview();
          flashBtn(document.getElementById("btnNew"), "Duplicated!");
        } else if (b.getAttribute("data-set-kind") === "dataset") {
          scaffoldFromDataset(b.getAttribute("data-set-key"));
        } else if (b.getAttribute("data-set-kind") === "stem") {
          scaffoldFromStem(b.getAttribute("data-set-key"));
        } else { return; }
        closeMenus();
      };
    });
    var fltInp = $("#newMenuFilter", nm);
    if (fltInp) {
      fltInp.value = filterText || "";
      fltInp.addEventListener("click", function (e) { e.stopPropagation(); });
      fltInp.addEventListener("input", function () {
        var v = fltInp.value;
        buildNewMenu(v);
        var again = $("#newMenuFilter", nm); if (again) { again.focus(); again.setSelectionRange(v.length, v.length); }
      });
    }
  }
  // Auto-build a starter dashboard from a WORKSPACE dataset: a KPI on its first
  // numeric-looking column pair + a bars panel, same spirit as scaffoldFromStem.
  function scaffoldFromDataset(dsId) {
    var ds = Studio.Workspace.get("datasets", dsId); if (!ds) return;
    S.spec = applyDashboardDefaults(Studio.emptySpec());
    S.spec.title = ds.name; S.spec.name = String(ds.name || "dashboard").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    S.spec.cda.dataAccesses = [];
    var da2 = specDAFromDataset(ds);
    var k = Studio.newKpi(da2); k.fmt = Studio.guessFmt(k.valueCol);
    S.spec.kpis.push(k);
    var pnl = Studio.newPanel("bars", da2);
    S.spec.panels.push(pnl);
    S.selection = null; syncHeader(); renderInspector(); refreshPreview(); buildLibrary();
    bumpDashMilestone();
    toast("Starter built from dataset " + ds.name);
  }

  // examples menu — E5: visual card gallery. Rebuilt whenever sample visibility
  // flips: the gallery IS the sample-dashboard showcase (internal demo database),
  // so hiding samples leaves just the Import-from-URL entry.
  // hoisted (Conservation Insight M1): the example-thumbnail SVG is reused by
  // both the Examples menu and the Home Examples strip.
  function exLayoutSvg(e) {
    var cols = e.gridCols || 3, kpis = e.kpis || 0;
    // per-panel [type, span] — prefer the exact dashboard layout so each thumbnail is a
    // faithful mini-map of the real panels & grid; fall back to the deduped types[].
    var layout = (e.layout && e.layout.length) ? e.layout
      : (e.types || []).slice(0, 6).map(function (t) { return [t, 1]; });
    layout = layout.slice(0, 8);
    var W = 80, H = 46;
    // Example cards preview the HOUSE look (the default dashboard theme every example
    // adopts at load) — series accents and the header strip come from its ramp.
    var extk = Studio.resolveThemeTokens(defaultDashboardTheme() || "classic", S.theme === "dark" ? "dark" : "light");
    var pal = extk ? [extk["--c1"], extk["--c3"], extk["--c5"], extk["--c2"], extk["--c4"]]
                   : ["#005bb5","#7d3c98","#2e8bd0","#00a39a","#e67e22"];
    var exAccent = extk ? extk["--pentaho"] : "#005bb5";
    var p = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '">'];
    p.push('<rect width="' + W + '" height="' + H + '" fill="var(--field,#f4f6fb)"/>');
    p.push('<rect width="' + W + '" height="7" fill="var(--bg,#fff)"/>');
    p.push('<rect width="2" height="7" fill="' + exAccent + '"/>');
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
      var mini = themedChartSvg(CHART_SVG[cel.type], cel.type);
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
  function buildExamplesMenu() {
    var em = $("#menuExamples");
    em.classList.add("ex-grid");
    // one grid, ordered by index.json — most spectacular first (no single "hero" card)
    // E3: mini layout thumbnail for each example card — synthesised from index.json metadata
    // (types[], panels count, kpis count) without needing to load the full spec file.
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
    em.innerHTML = (showSamples()
        ? '<div class="grp">Examples <span class="ex-demo-note" title="Sample dashboards running on the built-in demo database — they show the app\'s full feature breadth.">demo db</span></div><div class="ex-cards">' + visibleExamples().map(exCard).join("") + '</div>'
        : '<div class="grp">Examples</div><div class="ex-hidden-note">Sample dashboards are hidden — turn “Sample content” back on in Settings to browse them.</div>') +
      '<button type="button" class="btn ex-url-btn" id="btnImportUrl">＋ Import from URL…</button>';
    $$("button.ex-card", em).forEach(function (b) { b.onclick = function () { loadExample(b.getAttribute("data-f")); closeMenus(); }; });
    var importUrlBtn = $("#btnImportUrl", em);
    if (importUrlBtn) importUrlBtn.onclick = function () { closeMenus(); openImportUrlModal(); };
  }
  window.__studioBuildExamplesMenu = buildExamplesMenu; // test hook — rebuild after a raw (non-UI) demo-pack install/remove

  function wireTopbar() {
    // UX sprint 2026-07-14: the dashbar title renames IN PLACE — click swaps it for an
    // input (Enter/blur commits, Escape cancels), same convention as workbook renames.
    // The inspector's Title field stays in sync (one model, two entry points).
    $("#dashTitle").addEventListener("click", function () {
      var tb = $("#dashTitle");
      if (tb.style.display === "none") return;
      var inp = el("input", "dash-title-inp");
      inp.type = "text"; inp.value = S.spec.title || ""; inp.placeholder = "Dashboard title";
      inp.setAttribute("aria-label", "Rename dashboard");
      tb.style.display = "none";
      tb.parentNode.insertBefore(inp, tb);
      inp.focus(); inp.select();
      var done = false;
      function commit(save) {
        if (done) return; done = true;
        if (save && inp.value.trim()) { S.spec.title = inp.value.trim(); refreshPreview(); renderInspector(); }
        inp.remove(); tb.style.display = "";
        syncHeader();
      }
      inp.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") { ev.preventDefault(); commit(true); }
        else if (ev.key === "Escape") { commit(false); }
      });
      inp.addEventListener("blur", function () { commit(true); });
    });
    var uBtn = $("#btnUndo"); uBtn.onclick = undoAct; uBtn.textContent = ""; uBtn.appendChild(Studio.icon("undo", 16));
    var rBtn = $("#btnRedo"); rBtn.onclick = redoAct; rBtn.textContent = ""; rBtn.appendChild(Studio.icon("redo", 16));
    document.addEventListener("keydown", function (e) {
      if (!(e.metaKey || e.ctrlKey)) return;
      var inEdit = /^(input|textarea|select)$/i.test(e.target.tagName || "") || e.target.isContentEditable;
      if (inEdit) return;
      var k = (e.key || "").toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undoAct(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redoAct(); }
      else if (k === "d") { if (S.selection && S.selection.kind === "panel") { e.preventDefault(); duplicatePanel(S.selection.id); } else if (S.selection && S.selection.kind === "kpi") { e.preventDefault(); duplicateKpi(S.selection.index); } }
      else if (k === "s") { e.preventDefault(); saveToCatalog(); }
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
    var repoSearchInp = $("#repoSearch"); if (repoSearchInp) repoSearchInp.addEventListener("input", renderDashboards);
    var dashViewToggle = $("#dashViewToggle");
    if (dashViewToggle) {
      var syncDashToggle = function () {
        var isList = _dashViewMode === "list";
        dashViewToggle.textContent = isList ? "▦ Tile view" : "☰ List view";
        dashViewToggle.setAttribute("aria-pressed", isList ? "true" : "false");
      };
      syncDashToggle();
      dashViewToggle.onclick = function () {
        _dashViewMode = _dashViewMode === "list" ? "tiles" : "list";
        try { localStorage.setItem("studio-dash-view", _dashViewMode); } catch (e) {}
        syncDashToggle(); renderDashboards();
      };
    }
    var repoExpBtn = $("#repoExportBtn"); if (repoExpBtn) repoExpBtn.onclick = exportRepositoryFile;
    var repoImpBtn = $("#repoImportBtn"); if (repoImpBtn) repoImpBtn.onclick = importRepositoryFile;
    var repoCompareBtn = $("#repoCompareBtn"); if (repoCompareBtn) repoCompareBtn.onclick = openCompareDashboards;
    // Data pane "+ New ▾": dataset-first creation. Workspace datasets and
    // connections are the primary path; a dashboard-only query (the sample-
    // engine builder) remains for quick demo authoring.
    var ndsBtn = $("#btnNewDS"); setIconBtn(ndsBtn, "plus", "New", 12);
    menuToggle(ndsBtn, $("#menuNewData"));
    var ndWs = $("#ndWorkspaceDataset");
    if (ndWs) ndWs.onclick = function () { closeMenus(); openDatasetEditor(); };
    var ndConn = $("#ndConnection");
    if (ndConn) ndConn.onclick = function () { closeMenus(); openConnectionWizard(); };
    var ndDash = $("#ndDashQuery");
    if (ndDash) ndDash.onclick = function () { closeMenus(); dataSourceBuilder(null); };
    $("#inspBack").onclick = selectDashboard;

    buildNewMenu();
    menuToggle($("#btnNew"), $("#menuNew"));

    buildExamplesMenu();
    menuToggle($("#btnExamples"), $("#menuExamples"));

    // export menu
    menuToggle($("#btnExport"), $("#menuExport"));
    $$("#menuExport button").forEach(function (b) { b.onclick = function () { doExport(b.getAttribute("data-exp")); closeMenus(); }; });
    var histWrap = el("div"); histWrap.id = "exportHistWrap"; $("#menuExport").appendChild(histWrap);
    loadExportHistory(); renderExportHistory();

    $("#btnImport").onclick = openDashboardPicker;
    $("#btnSaveSpec").onclick = saveToCatalog;
    $("#btnCloseStudio").onclick = closeStudio;

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
    var moreAboutBtn = $("#moreAbout");
    if (moreAboutBtn) moreAboutBtn.onclick = function () { closeMenus(); if (window.StudioWelcome) StudioWelcome.open(); };
    [["moreTheme","btnTheme"]].forEach(function(pair) {
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
    // phone variants mirror the dashbar Open/Save: catalog picker + save-to-catalog
    // (the picker's footer still offers "Open file…" for .studio.json imports)
    var moreImport = $("#moreImport");
    if (moreImport) moreImport.onclick = function () { closeMenus(); openDashboardPicker(); };
    var moreSaveSpec = $("#moreSaveSpec");
    if (moreSaveSpec) moreSaveSpec.onclick = function () { closeMenus(); saveToCatalog(); };
    var moreCloseStudio = $("#moreCloseStudio");
    if (moreCloseStudio) moreCloseStudio.onclick = function () { closeMenus(); closeStudio(); };

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
        "  • Theme, pane widths & layout\n" +
        "  • Your signed-in session (you'll land back on the sign-in screen)\n\n" +
        "The page will reload as if you were visiting for the first time.";
      if (!confirm(msg)) return;
      try { keys.forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
      // REVIEW-FIXES: a "start fresh" reset must also drop the auth bypass flag (sessionStorage,
      // untouched by the localStorage sweep above) — same flag Sign-out clears — so a reload
      // truly lands on the sign-in screen instead of silently re-authing via the historical
      // studio-gate-ok bypass (see auth.js's current()).
      try { sessionStorage.removeItem("studio-gate-ok"); } catch (e) {}
      // N-DIST: also drop the offline-shell service worker cache so a clean reload can't
      // still be served a stale cached copy of the app.
      try {
        if (window.caches && caches.keys) caches.keys().then(function (names) { names.forEach(function (n) { caches.delete(n); }); });
      } catch (e) {}
      toast("Local data cleared — reloading…");
      setTimeout(function () { location.reload(); }, 1000);
    };

    // "¶ Text" canvas-bar button — add a rich-text annotation panel to the current dashboard

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
    $("#dashName").textContent = S.spec.name;
    // the "· group" fragment only exists when a group is actually set — a blank
    // dashboard should not claim a category it doesn't have
    var gw = $("#dashGroupWrap");
    if (gw) gw.style.display = S.spec.group ? "" : "none";
    $("#dashGroup").textContent = S.spec.group || "";
  }

  window.__fireToast = function (msg, isErr) { toast(msg, isErr); }; // exposed for tests
  window.__studioSelectDashboard = selectDashboard; // exposed for tests
  window.__studioSelect = select;                   // exposed for tests (K6, etc.)
  window.__studioRenderInspector = renderInspector; // exposed for tests
  window.__studioBuildLibrary = buildLibrary;       // exposed for tests

  function closeAllModals() { $$(".modal-ov").forEach(function (m) { m.remove(); }); }

  /* ---------- repo-first Save / Open (UX sprint 2026-07-14) ----------
     The .studio.json file is still the complete, portable dashboard — it just
     moved to Export ▸ Editable spec. Day-to-day Save/Open work against the
     Dashboards catalog instead of the Downloads folder. */
  function saveToCatalog() {
    clearAutosave();
    snapshotVersion();          // version-history checkpoint (restorable)
    noteRecent();               // upsert into the Dashboards catalog
    renderHome(); renderDashboards();
    var ss = $("#saveState");
    if (ss) { ss.textContent = "Saved ✓"; ss.classList.add("show"); setTimeout(function () { ss.classList.remove("show"); }, 2000); }
    toast("Saved “" + (S.spec.title || S.spec.name) + "” to Dashboards");
  }
  window.__studioSaveToCatalog = saveToCatalog; // test hook
  function openDashboardPicker() {
    modal("Open a dashboard", function (b) {
      var search = el("input", "search"); search.type = "search"; search.placeholder = "Search your dashboards…";
      search.setAttribute("aria-label", "Search dashboards");
      b.appendChild(search);
      var listWrap = el("div", "odp-list"); b.appendChild(listWrap);
      function paint() {
        var q = (search.value || "").toLowerCase();
        var list = loadRecents().filter(isVisibleToMe).filter(function (r) {
          if (!q) return true;
          var sp = r.spec || {};
          return ((sp.title || "") + " " + (sp.name || "")).toLowerCase().indexOf(q) >= 0;
        });
        listWrap.innerHTML = list.length ? "" : '<div class="odp-empty">' + (q ? "No dashboards match." : "Nothing saved yet — Save adds the current dashboard here.") + '</div>';
        list.forEach(function (r) {
          var sp = r.spec || {};
          var row = el("button", "odp-row"); row.type = "button";
          var panels = (sp.panels || []).length;
          row.innerHTML = '<b>' + esc(sp.title || sp.name || "Untitled") + '</b>' +
            '<small>' + esc(sp.name || "") + " · " + panels + " panel" + (panels === 1 ? "" : "s") +
            (r.ts ? " · " + new Date(r.ts).toLocaleDateString() : "") + '</small>';
          row.onclick = function () { closeAllModals(); openRecent(r.id); };
          listWrap.appendChild(row);
        });
      }
      search.addEventListener("input", paint);
      paint();
      var foot = el("div", "cx-wiz-foot odp-foot");
      var fileBtn = el("button", "btn"); fileBtn.type = "button"; fileBtn.textContent = "Open file…";
      fileBtn.title = "Open a .studio.json or an exported .html";
      fileBtn.onclick = function () { closeAllModals(); openSpecFile(); };
      var urlBtn = el("button", "btn"); urlBtn.type = "button"; urlBtn.textContent = "Import from URL…";
      urlBtn.onclick = function () { closeAllModals(); openImportUrlModal(); };
      foot.appendChild(fileBtn); foot.appendChild(urlBtn); b.appendChild(foot);
      search.focus();
    });
  }
  window.__studioOpenDashboardPicker = openDashboardPicker; // test hook

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
    toast("First export! Nice work — your dashboard is ready to share.", false, true);
    sparkBurst();
  }
  // N-FUN: export milestones — a light "you're on a roll" nudge at round totals, counted across every
  // export this browser has ever made (any kind). Purely encouraging, never repeats a given milestone
  // (tracked via the running total itself, which only grows), same spark-burst as the first-export moment.
  var EXPORT_MILESTONES = { 10: "10 exports!", 25: "25 exports — you're on a roll.", 50: "50 exports! Dashboard machine.", 100: "100 exports. Legendary.", 250: "250 exports. Absolute unit of a portfolio." };
  function bumpExportMilestone() {
    var n = 0;
    try { n = (parseInt(localStorage.getItem("studio-export-count"), 10) || 0) + 1; localStorage.setItem("studio-export-count", String(n)); } catch (e) { return; }
    if (EXPORT_MILESTONES[n]) { toast(EXPORT_MILESTONES[n] + " Keep it up.", false, true); sparkBurst(); }
  }
  // N-FUN: another "more milestone moments" slice — celebrate round totals of brand-new blank
  // dashboards started (Home's Blank quick-create card + New ▾ → Blank dashboard; NOT Open/Import/
  // examples/Duplicate, which pick up someone else's spec rather than starting fresh). Same running-
  // counter + spark-burst convention as the export milestones above.
  var DASH_MILESTONES = { 5: "5 dashboards built!", 10: "10 dashboards — a real portfolio.", 25: "25 dashboards. You're a Studio power user.", 50: "50 dashboards. Incredible pace." };
  function bumpDashMilestone() {
    var n = 0;
    try { n = (parseInt(localStorage.getItem("studio-dash-count"), 10) || 0) + 1; localStorage.setItem("studio-dash-count", String(n)); } catch (e) { return; }
    if (DASH_MILESTONES[n]) { toast(DASH_MILESTONES[n], false, true); sparkBurst(); }
  }
  // N-FUN "dashboard health celebration" (innovation idea added 2026-07-04): the Checks section
  // above only ever shows a neutral "ready to export" line, even the first time a dashboard reaches
  // genuinely zero warnings/notes. One-time-per-dashboard toast + spark, keyed by spec.id so it never
  // repeats for the same dashboard (same "once, keyed, never again" convention as celebrateFirstExport).
  function celebrateHealthZero(sp) {
    if (!sp || !sp.id) return;
    var done = lsGet("studio-health-celebrated", {});
    if (done[sp.id]) return;
    done[sp.id] = 1;
    lsSet("studio-health-celebrated", done);
    toast("All clear — this dashboard has zero warnings. Nicely built.", false, true);
    sparkBurst();
  }

  function doExport(kind) {
    celebrateFirstExport();
    bumpExportMilestone();
    var sp = S.spec, dp = S.settings.deployPath;
    var problems = Studio.validate(sp).filter(function (x) { return x.level === "error"; });
    if (problems.length) { toast(problems[0].msg, true); }
    recordExport(kind, sp.title || sp.name);
    if (kind === "spec") return bundleModal("Editable spec", [{ name: sp.name + ".studio.json", body: JSON.stringify(sp, null, 2), mime: "application/json" }]);
    if (kind === "cdf") return bundleModal("Dashboard", [{ name: sp.name + ".html", body: Studio.exportCDF(sp, S.assets, dp), mime: "text/html" }]);
    if (kind === "all") {
      bundleModal("All artifacts", [
        { name: sp.name + ".html", body: Studio.exportCDF(sp, S.assets, dp), mime: "text/html" },
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

  function openSpecFile() {
    var inp = el("input"); inp.type = "file"; inp.accept = ".json,.studio.json,.html,.htm,application/json,text/html";
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return; var rd = new FileReader();
      rd.onload = function () {
        try {
          var txt = rd.result, spec;
          if (/\.html?$/i.test(f.name) || /window\.STUDIO_SPEC/.test(txt)) {
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
        enterStudio();
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
      "Drag a query from the library onto the canvas to add a chart widget.",
      "Use New ▾ → Auto-build to scaffold a full starter dashboard instantly.",
      "Export ▾ → CDF .html gives a standalone file you can open in any browser."
    ],
    panel: [
      "Pick a chart type from the gallery, then bind the data columns below.",
      "Press Shift+←/→ to resize the widget span; ↑/↓ to reorder it on the canvas.",
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
  // LF5(b): color-token pickers ("Series 7", "Accent (theme)"...) were text-only, so it was
  // hard to tell what a given option actually painted. resolveTokenColor reads the token's
  // REAL resolved value from the #preview iframe's document — the same document the rest of
  // the Inspector already keeps live-synced to the current spec's theme + light/dark mode —
  // rather than guessing at a static palette, so the swatch always matches what the option
  // will actually render.
  function resolveTokenColor(token) {
    try {
      var ifr = $("#preview"), doc = ifr && ifr.contentDocument;
      if (doc && doc.documentElement) {
        var v = getComputedStyle(doc.documentElement).getPropertyValue(token).trim();
        if (v) return v;
      }
    } catch (e) {}
    return "";
  }
  function hexToRgb(c) {
    if (!c) return null;
    var m = /^#([0-9a-f]{6})$/i.exec(c.trim());
    if (m) { var n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    var m2 = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(c);
    return m2 ? [+m2[1], +m2[2], +m2[3]] : null;
  }
  function mixColor(a, b, t) {
    var pa = hexToRgb(a), pb = hexToRgb(b);
    if (!pa || !pb) return a || b || "";
    return "rgb(" + Math.round(pa[0] + (pb[0] - pa[0]) * t) + "," + Math.round(pa[1] + (pb[1] - pa[1]) * t) + "," + Math.round(pa[2] + (pb[2] - pa[2]) * t) + ")";
  }
  function contrastText(color) {
    var rgb = hexToRgb(color);
    return rgb && (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 > 0.6 ? "#111" : "#fff";
  }
  // A small live swatch beside the <select> (updates on every change) plus per-<option>
  // background tinting, so both the closed control and the open list show real color, not
  // just a label. onColorChange (optional) lets a caller layer extra UI (the choropleth ramp
  // preview below) on top of the same resolved color without re-deriving it.
  function colorTokenSelect(pairs, val, onChange, onColorChange) {
    var wrap = el("span", "ct-picker");
    var resolved = {};
    pairs.forEach(function (p) { if (p[0]) resolved[p[0]] = resolveTokenColor(p[0]); });
    var sw = el("span", "ct-swatch"); sw.setAttribute("aria-hidden", "true");
    function paintSwatch(v) {
      var c = resolved[v] || "";
      sw.style.background = c;
      sw.classList.toggle("ct-swatch-auto", !c);
    }
    paintSwatch(val);
    var sel = select2pairs(pairs, val, function (v) {
      paintSwatch(v);
      onChange(v);
      if (onColorChange) onColorChange(v, resolved[v] || "");
    });
    [].slice.call(sel.options).forEach(function (o) {
      var c = resolved[o.value];
      if (c) { o.style.backgroundColor = c; o.style.color = contrastText(c); }
    });
    wrap.appendChild(sw); wrap.appendChild(sel);
    return wrap;
  }
  // LF5(b): "for the choropleth RAMP color a small gradient/swatch preview" — a light->base->dark
  // strip approximating the actual per-region ramp studio-charts.js's geoRamp() computes at
  // render time (that function lives inside the preview-iframe-only PDC closure and needs a
  // panel-bg to mix against, so this is a lighter-weight visual approximation, not a byte-for-
  // byte reuse — good enough for "which ramp am I picking," not a copy of the render pipeline).
  function rampGradientCss(token) {
    var base = resolveTokenColor(token) || "#2f8f52";
    return "linear-gradient(to right," + mixColor("#ffffff", base, 0.55) + "," + base + "," + mixColor(base, "#141414", 0.5) + ")";
  }
  // Z8 follow-up: "true before/after thumbnails" — the glyph+tooltip hints below explain
  // an option in words; for the two families where a picture beats a sentence (reordering
  // bars, straight-vs-curved lines) a hover/focus popover shows an actual tiny Off/On SVG
  // pair instead of just prose. Generic mini-diagram generators, not tied to any one real
  // chart type's data.
  function svgBarsThumb(sorted) {
    var vals = sorted ? [18, 14, 10, 6] : [10, 18, 6, 14]; // same 4 values, reordered
    var w = 12, gap = 4, x = 2, bars = "";
    for (var i = 0; i < vals.length; i++) {
      var h = vals[i], y = 26 - h;
      bars += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="1.5" fill="currentColor"/>';
      x += w + gap;
    }
    return '<svg viewBox="0 0 64 28" width="64" height="28" aria-hidden="true">' + bars + '</svg>';
  }
  function svgLineThumb(smooth) {
    var pts = [[4, 22], [20, 8], [36, 18], [52, 4], [60, 14]];
    var d;
    if (!smooth) {
      d = "M" + pts.map(function (p) { return p[0] + " " + p[1]; }).join(" L");
    } else {
      // Same midpoint-control-point cubic-bezier technique the real Line/Bump renderers use
      // for their "Smooth curve" option (see Z8 slice 7 in STATUS.md) — the thumbnail should
      // look like what the option actually draws, not an unrelated curve shape.
      d = "M" + pts[0][0] + " " + pts[0][1];
      for (var i = 1; i < pts.length; i++) {
        var p0 = pts[i - 1], p1 = pts[i], mx = (p0[0] + p1[0]) / 2;
        d += " C" + mx + " " + p0[1] + " " + mx + " " + p1[1] + " " + p1[0] + " " + p1[1];
      }
    }
    return '<svg viewBox="0 0 64 28" width="64" height="28" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  }
  function svgDotsThumb(withDots) {
    var pts = [[4, 20], [20, 10], [36, 16], [52, 6], [60, 12]];
    var d = "M" + pts.map(function (p) { return p[0] + " " + p[1]; }).join(" L");
    var dots = "";
    if (withDots) pts.forEach(function (p) { dots += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.4" fill="currentColor"/>'; });
    return '<svg viewBox="0 0 64 28" width="64" height="28" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.75"/>' + dots + '</svg>';
  }
  function svgLegendThumb(withLegend) {
    var barW = withLegend ? 8 : 12, gap = withLegend ? 3 : 4, x = 2, bars = "", vals = [16, 22, 10];
    for (var i = 0; i < vals.length; i++) {
      var h = vals[i], y = 26 - h;
      bars += '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + h + '" rx="1.5" fill="currentColor" opacity="' + (0.5 + i * 0.2) + '"/>';
      x += barW + gap;
    }
    var legend = "";
    if (withLegend) {
      var ly = 4;
      for (var j = 0; j < 3; j++) {
        legend += '<rect x="44" y="' + ly + '" width="6" height="6" rx="1" fill="currentColor" opacity="' + (0.5 + j * 0.2) + '"/>' +
          '<rect x="53" y="' + (ly + 1.5) + '" width="9" height="3" rx="1" fill="currentColor" opacity="0.4"/>';
        ly += 9;
      }
    }
    return '<svg viewBox="0 0 64 28" width="64" height="28" aria-hidden="true">' + bars + legend + '</svg>';
  }
  function svgTagThumb(withTags) {
    var vals = [12, 18, 8], w = 12, gap = 4, x = 2, bars = "", tags = "";
    for (var i = 0; i < vals.length; i++) {
      var h = vals[i], y = 26 - h;
      bars += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="1.5" fill="currentColor" opacity="0.65"/>';
      if (withTags) tags += '<rect x="' + (x + 1) + '" y="' + (y - 6) + '" width="' + (w - 2) + '" height="4" rx="1" fill="currentColor"/>';
      x += w + gap;
    }
    return '<svg viewBox="0 0 64 28" width="64" height="28" aria-hidden="true">' + bars + tags + '</svg>';
  }
  function svgRotateThumb(rotated) {
    var vals = [10, 16, 7], w = 10, gap = 6, x = 3, bars = "", labels = "";
    for (var i = 0; i < vals.length; i++) {
      var h = vals[i], y = 20 - h, cx = x + w / 2;
      bars += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="1.5" fill="currentColor" opacity="0.65"/>';
      var tform = rotated ? ' transform="rotate(-35 ' + cx + ' 24)"' : "";
      var lineW = rotated ? 9 : 6;
      labels += '<rect x="' + (cx - lineW / 2) + '" y="23" width="' + lineW + '" height="2.4" rx="1.2" fill="currentColor" opacity="0.85"' + tform + "/>";
      x += w + gap;
    }
    return '<svg viewBox="0 0 64 28" width="64" height="28" aria-hidden="true">' + bars + labels + '</svg>';
  }
  // Z8 follow-up: inline visual setting hints — a tiny SVG glyph + tooltip next to a
  // boolean option's label, so the dense per-type inspector is self-explanatory without
  // reading a chart's own docs entry. Keyed by option `key` (regex) rather than per chart
  // type: the sort/legend/smooth/dots option families repeat verbatim across a dozen+
  // chart types (see Z8 slice log in STATUS.md), so one small map covers most of the
  // dense inspector in one pass instead of hand-authoring 51 bespoke thumbnails.
  var OPT_HINTS = [
    { test: /^sort/i,                        icon: "sort-desc", tip: "Reorders items largest-value-first instead of the query's original row order.", thumb: svgBarsThumb },
    { test: /^showLegend$/,                  icon: "legend",    tip: "Shows a small key mapping each color/series to its label.", thumb: svgLegendThumb },
    { test: /^smooth$/,                      icon: "curve",     tip: "Draws curved (cubic-bezier) segments between points instead of straight lines.", thumb: svgLineThumb },
    { test: /^showDots$/,                    icon: "dots",      tip: "Shows a small marker dot at every data point along the line.", thumb: svgDotsThumb },
    { test: /^showValues$/,                  icon: "tag",       tip: "Shows the number directly on the chart (bar/segment/point), not just in the hover tooltip.", thumb: svgTagThumb },
    { test: /^showLabels$/,                  icon: "tag",       tip: "Shows a text label directly on each element, not just in the hover tooltip.", thumb: svgTagThumb },
    { test: /^showPct$/,                     icon: "percent",   tip: "Shows the figure as a percentage (of the total, or conversion rate) rather than its raw value." },
    { test: /^rotate$/,                      icon: "rotate-text", tip: "Tilts the axis labels diagonally so long category names fit without overlapping.", thumb: svgRotateThumb },
    { test: /^(trend|showTrend)$/,           icon: "trend-up",  tip: "Draws a straight regression/forecast line through the data, showing its overall direction." },
    { test: /^grandTotal$/,                  icon: "sigma",     tip: "Adds a bold summary row at the bottom, totalling every numeric column over the visible rows." },
    { test: /^(area|fill)$/,                 icon: "area-fill", tip: "Fills the shape with a soft color instead of drawing only its outline." },
    { test: /^showMA$/,                      icon: "moving-avg", tip: "Overlays a smoothed moving-average line to reveal the underlying trend beneath the noisy raw series." },
    { test: /^freezeHeader$/,                icon: "freeze-header", tip: "Keeps the header row pinned in place at the top while the table body scrolls underneath it." },
    { test: /^showTotal$/,                   icon: "total-bar", tip: "Adds a bold final bar showing the running total across all the incremental steps." },
    { test: /^showVals$/,                    icon: "tag",       tip: "Prints each cell's number directly in the grid, not just in the hover tooltip.", thumb: svgTagThumb },
    { test: /^showRankNumbers$/,             icon: "tag",       tip: "Prints the numeric rank inside every dot instead of leaving the dots blank.", thumb: svgTagThumb },
    { test: /^horizontal$/,                  icon: "swap-axis", tip: "Draws it sideways (horizontal) instead of the default vertical orientation." },
    { test: /^showBox$/,                     icon: "iqr-box",   tip: "Overlays a mini box-and-whisker (quartile range) on top of the density shape." },
    { test: /^showRef$/,                     icon: "ref-line",  tip: "Draws a dashed reference line at the classic 80% cumulative threshold." },
    { test: /^showCenter$/,                  icon: "center-line", tip: "Draws a bold center line (e.g. the midpoint) through the middle of the shaded band." }
  ];
  function optHint(key) {
    for (var i = 0; i < OPT_HINTS.length; i++) if (OPT_HINTS[i].test.test(key)) return OPT_HINTS[i];
    return null;
  }
  function optField(opts, od, chartType) {
    if (od.type === "bool") {
      var lab = el("label", "check"); var cb = el("input"); cb.type = "checkbox"; cb.checked = !!opts[od.key]; cb.onchange = function () { opts[od.key] = cb.checked; refreshPreview(); }; lab.appendChild(cb); lab.appendChild(document.createTextNode(od.label));
      var oh = optHint(od.key);
      if (oh) {
        var hIc = el("span", "opt-hint"); hIc.title = oh.tip; hIc.setAttribute("aria-label", oh.tip); hIc.tabIndex = 0; hIc.appendChild(Studio.icon(oh.icon, 12));
        // Z8 follow-up: a real before/after picture, not just the tooltip prose, for the option
        // families where "off vs on" is genuinely easier to SEE than to read (sort/smooth).
        // CSS-only reveal (:hover/:focus) so no show/hide JS or hover-timing races are needed —
        // the popover markup is simply always in the DOM, letting tests assert its content directly.
        if (oh.thumb) {
          var pop = el("div", "opt-hint-pop");
          pop.innerHTML = '<div class="oh-pop-row"><div class="oh-pop-cell"><span class="oh-pop-lab">Off</span>' + oh.thumb(false) +
            '</div><div class="oh-pop-cell"><span class="oh-pop-lab">On</span>' + oh.thumb(true) + "</div></div>" +
            '<div class="oh-pop-tip">' + esc(oh.tip) + "</div>";
          hIc.appendChild(pop);
        }
        lab.appendChild(hIc);
      }
      return lab;
    }
    if (od.type === "fmt") return field(od.label, fmtPicker(opts[od.key] || od.def, function (v) { opts[od.key] = v; refreshPreview(); }));
    if (od.type === "color") {
      var colVal = opts[od.key] || od.def;
      var colPairs = Studio.COLOR_TOKENS.map(function (tk) { return [tk, Studio.colorTokenLabel(tk)]; });
      if (chartType === "choropleth" && od.key === "color") {
        var rampBox = el("div", "ct-ramp"); rampBox.style.background = rampGradientCss(colVal);
        var rampWrap = el("div", "ct-color-with-ramp");
        rampWrap.appendChild(colorTokenSelect(colPairs, colVal, function (v) { opts[od.key] = v; refreshPreview(); }, function (v) { rampBox.style.background = rampGradientCss(v); }));
        rampWrap.appendChild(rampBox);
        return field(od.label, rampWrap, "The ramp runs light → this color → dark across the region's value range.");
      }
      return field(od.label, colorTokenSelect(colPairs, colVal, function (v) { opts[od.key] = v; refreshPreview(); }));
    }
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
  // UX4 (quality track, remainder): `celebrate` swaps in the trophy icon + brand-gradient
  // toast variant for the rare, one-time milestone moments (first export, round-number
  // export/dashboard counts, zero-warnings) so they read as earned, not just confirmed —
  // distinct from the plain check/warn toast every ordinary action already uses.
  function toast(msg, isErr, celebrate) { var t = $("#toast"); t.innerHTML = ""; t.appendChild(Studio.icon(isErr ? "warn" : (celebrate ? "trophy" : "check"), 13)); t.appendChild(document.createTextNode(" " + msg)); t.className = "toast show" + (isErr ? " err" : (celebrate ? " celebrate" : "")); clearTimeout(_toastT); _toastT = setTimeout(function () { t.className = "toast"; }, 2600); }

  // canvas drag-drop
  function wireCanvas() {
    var stage = $("#canvas-stage");
    ["dragenter", "dragover"].forEach(function (ev) { stage.addEventListener(ev, function (e) { e.preventDefault(); stage.classList.add("dragover"); e.dataTransfer.dropEffect = "copy"; }); });
    ["dragleave", "drop"].forEach(function (ev) { stage.addEventListener(ev, function (e) { if (ev === "dragleave" && e.target !== stage && stage.contains(e.relatedTarget)) return; stage.classList.remove("dragover"); }); });
    stage.addEventListener("drop", function (e) {
      e.preventDefault(); stage.classList.remove("dragover");
      try {
        var d = JSON.parse(e.dataTransfer.getData("text/plain"));
        if (d && d.wsDataset) { addFromWorkspaceDataset(d.wsDataset, "bars"); }
        else if (d && d.analysis) { xpAddAnalysisToSpec(d.analysis); }
        else if (d && d.da) { var _da = catalogDA(d.stem, d.da); addFromDA(d.stem, d.da, (_da && chartForDA(_da)) || "bars"); }
      } catch (x) {}
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
    // ¶ Text moved here from the Data-panel header (it creates a PANEL, so it
    // belongs with the canvas) — also reachable via the empty canvas itself.
    var cesTextBtn = $("#cesText");
    if (cesTextBtn) cesTextBtn.addEventListener("click", addTextPanel);
  }

  document.addEventListener("DOMContentLoaded", function () { wireCanvas(); boot(); });
})();
