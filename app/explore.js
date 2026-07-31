/* ============================================================================
   explore.js — R5+ slice 6 (studio.js module extraction, tech-debt track):
   the Explore "just show me a dashboard" subsystem — the non-expert front
   door: pick a dataset → see it as a table → pick a chart → map columns →
   SAVE as an "analysis" (workspace `analyses` table). Analyses are reusable:
   pin to Home, drop into any dashboard from the Studio library, re-open here
   to refine. The chart preview is the REAL renderer (Studio.buildHtml in an
   iframe) fed with the rows just previewed, so what you save is exactly what
   a dashboard will show.
   Follows the chart-thumbnails.js/branding.js/defaults.js/celebrations.js/
   versions.js extraction precedent (①-⑤): this subsystem is as entangled
   with the builder's live spec/catalog/assets state and its modal/library
   primitives as the versions/notes UI half was, so it takes the SAME shape
   as VersionsUI (⑤) — ONE bundled Studio.Explore.configure(deps) call from
   studio.js at boot, instead of ①-④'s one-injected-callback-each. `S` below
   is a thin read-only proxy onto the builder's live spec/catalog/assets (so
   every function body below reads exactly like its former studio.js self —
   S.spec / S.catalog / S.assets); the one WRITE site (starting a brand-new
   blank dashboard) routes through the explicit D.newBlankDashboard() instead.
   studio.js keeps thin same-named delegates at every original call site
   (renderExplore, xpLoadAnalysis, xpSave, xpAddAnalysisToSpec, xpTogglePin,
   analysisSpec, buildAnalysesLib, …) and every window.__studio* test hook,
   so nothing outside this module needed to change. Pure refactor, no
   behavior change.
   Loads before studio.js (app/index.html).
   ============================================================================ */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};
  var CHART_SVG = Studio.CHART_SVG;
  function esc(s) { return Studio.escapeHtml(s); }

  // D holds every studio.js-private helper this module needs, injected once
  // via configure() — see the header comment.
  var D = null;
  function configure(deps) { D = deps; }
  var S = {
    get catalog() { return D.getCatalog(); },
    get spec() { return D.getSpec(); },
    get assets() { return D.getAssets(); }
  };
  function $(s, r) { return D.$(s, r); }
  function $$(s, r) { return D.$$(s, r); }
  function el(t, c) { return D.el(t, c); }
  function toast(msg, isErr, celebrate) { return D.toast(msg, isErr, celebrate); }
  function modal(title, build, onClose, wide) { return D.modal(title, build, onClose, wide); }
  function setIconBtn(btn, iconName, text, sz) { return D.setIconBtn(btn, iconName, text, sz); }
  function closeAllModals() { return D.closeAllModals(); }
  function openRecent(id) { return D.openRecent(id); }
  function loadRecents() { return D.loadRecents(); }
  function isVisibleToMe(r) { return D.isVisibleToMe(r); }
  function isDatasetVisibleToMe(r) { return D.isDatasetVisibleToMe(r); }
  function disambiguateLabels(rows, keyFn) { return D.disambiguateLabels(rows, keyFn); }
  function runDataset(ds) { return D.runDataset(ds); }
  function dsToDA(ds, takenId) { return D.dsToDA(ds, takenId); }
  function openDatasetEditor(existing, onSaved) { return D.openDatasetEditor(existing, onSaved); }
  function defaultDashboardTheme() { return D.defaultDashboardTheme(); }
  function postThemeOnLoad(ifr) { return D.postThemeOnLoad(ifr); }
  function ensureGeoAssets(spec) { return D.ensureGeoAssets(spec); }
  function showSamples() { return D.showSamples(); }
  function currentUserId() { return D.currentUserId(); }
  function themedChartSvg(svg, type) { return D.themedChartSvg(svg, type); }
  function hlq(text, q) { return D.hlq(text, q); }
  function libGroupHeaderIcon(h, name) { return D.libGroupHeaderIcon(h, name); }
  function select(sel) { return D.select(sel); }
  function enterStudio() { return D.enterStudio(); }
  function refreshPreview() { return D.refreshPreview(); }
  function buildLibrary() { return D.buildLibrary(); }
  function withSparkleButton(inp, kind, getCtx) { return D.withSparkleButton(inp, kind, getCtx); }

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
    kpi: null,                       // VB-5: a KPI-type View's saved `kpi` blob (no `chart`)
    notice: "",                      // VB-5: dismissible cross-editor banner ("" = hidden)
    noticeBuild: null,               // VB-5: analysis id the banner's "Open in View Builder"
                                     // action targets (null = no action button)
    q: ""                            // dataset search
  };
  // M5 folder pilot (analyses): which folder GROUP the saved-analyses sidebar
  // list is narrowed to — "" = All, "__unfiled" = no folder, else a folder name.
  var _xpFolderFilter = "";
  // LF51 (Explore navigator): per-branch collapse state for the dataset tree, keyed by
  // folder path ("Finance/2024") or sample stem ("sample:conservation"). Session-only by
  // design (no new localStorage key to track in CLEAR_DATA_KEYS): an explicit toggle wins;
  // otherwise ws folders default OPEN and sample stems default CLOSED once you have
  // datasets of your own (see xpTreeCollapsed below).
  var _xpTreeCollapsed = {};
  function xpTreeCollapsed(path, dflt) { return (path in _xpTreeCollapsed) ? _xpTreeCollapsed[path] : dflt; }
  // LF9 slice 3: opening a dataset or a saved analysis swaps the "pick a dataset" empty
  // state for the full editor IN PLACE — there's no new DOM node for Back to just re-show
  // (unlike modal()/openPanelZoom()/openSlideshow()'s pushOverlay call sites), so this swap
  // needs its own close path back to the picker. Reuses the exact overlayStack mechanism
  // those use: ONE push per "enter editor" transition (xpEnterEditor is a no-op if already
  // in the editor), so Back always lands on the empty picker regardless of which dataset/
  // analysis was open, and switching between datasets while already in the editor never
  // stacks extra history entries.
  var _xpOverlayId = null;
  function xpEnterEditor() {
    if (_xpOverlayId || !XP.run) return;
    // Deferred one tick: this can fire synchronously off a callback chained onto ANOTHER
    // overlay's own close — e.g. Explore's "+ New dataset" modal saves, closes itself (which
    // schedules its OWN history.back()), and immediately selects the fresh dataset. Pushing a
    // new history entry before that pending back-navigation actually runs makes the browser's
    // back() resolve against the wrong (newer) entry once it fires — history.back() targets
    // whatever is current WHEN it fires, not when it was called. Deferring past that lets the
    // modal's own back-navigation land first; the re-check inside guards a real user pick
    // racing with itself (it can't — this is only reachable via the same synchronous chain).
    setTimeout(function () {
      if (_xpOverlayId || !XP.run) return;
      _xpOverlayId = window.__studioPushOverlay ? window.__studioPushOverlay(function () { xpCloseToList(true); }) : null;
    }, 0);
  }
  // `viaHistory` is true ONLY when invoked by shell.js's popstate stack-unwind (history has
  // already moved back); every other close path (the Back-to-datasets button below) still
  // owns an untouched history entry and must sync it via popOverlay. Checked with `=== true`,
  // not truthiness — the exact bug LF9 slice 2 found and fixed in modal()/panel-zoom/
  // slideshow, where a bare `onclick = close` handler passes the click Event as the first
  // argument and a truthy check wrongly treated that as the popstate-driven case.
  function xpCloseToList(viaHistory) {
    var overlayId = _xpOverlayId;
    _xpOverlayId = null;
    XP.kind = null; XP.dsId = null; XP.run = null; XP.da = null;
    XP.analysisId = null; XP.name = ""; XP.folder = "";
    XP.type = "bars"; XP.map = {}; XP.opts = {};
    XP.agg = { fn: "none", groupBy: [] };
    XP.kpi = null; XP.notice = ""; XP.noticeBuild = null;
    renderExplore();
    if (viaHistory !== true && overlayId && window.__studioPopOverlay) window.__studioPopOverlay(overlayId);
  }
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
      // LF51 (Explore navigator): carry the dataset's folder so the picker can group
      // by it (nested via "/", same convention as Datasets/Repository).
      out.push({ kind: "ws", id: d.id, name: d.name || d.id, sub: conn ? conn.name : "no connection", cols: d.columns || [], folder: d.folder || "" });
    });
    // SAMPLE-DATA-1 (Kevin live, 2026-07-30): the raw demo-DB catalog tables belong to the
    // Data Management pack — installed pack only; uninstalled = zero presence here.
    if (showSamples() && Studio.demoPackInstalled && Studio.demoPackInstalled("datamanagement")) {
      Object.keys(S.catalog).forEach(function (stem) {
        (S.catalog[stem].dataAccesses || []).forEach(function (d) {
          out.push({ kind: "sample", id: stem + XP_SEP + d.id, name: d.id, sub: stem + " · sample", cols: d.columns || [], stem: stem });
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
    XP.kpi = null; XP.notice = ""; XP.noticeBuild = null; // VB-5: the cross-editor banner belongs to the dropped analysis
    return xpLoadRows().then(function () {
      XP.type = xpDefaultType(XP.run && XP.run.cols); // geo data opens as a map, provider trends as the Ensemble
      xpGuessMapping(); xpEnterEditor(); renderExplore(); xpPreview();
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
  // LF62 slice 5: the ctx a View's ✨ sparkle button suggests from — the picked
  // dataset/sample's own display name (same string Explore's own picker list
  // shows), or the charted value column when there's no live source to name
  // (a self-contained/orphaned saved analysis).
  function xpNameSuggestCtx() {
    var srcName = "";
    if (XP.kind === "ws") {
      var ds = Studio.Workspace.get("datasets", XP.dsId);
      if (ds) srcName = ds.name || ds.id;
    } else if (XP.kind === "sample") {
      var parts = String(XP.dsId).split(XP_SEP);
      srcName = parts[1] || parts[0];
    }
    return { sourceDatasetName: srcName, valueCol: XP.map && XP.map.valueCol };
  }
  // LF62 slice 8 (live-QA queue, slice 7's own NEXT pointer — the last un-wired LF62
  // surface): the ctx a View's Folder sparkle suggests from. Mirrors the dataset/
  // connection/job Folder fields' "linkedFolder" convention — a View sits one hop
  // downstream of its picked dataset in the same connections->datasets->jobs->views
  // chain, so reuse that dataset's own folder. A sample-backed or self-contained
  // View has no upstream dataset to link, so it has nothing to suggest from (no Tags
  // field on a View to fall back to, unlike the dataset/connection/job forms).
  function xpFolderSuggestCtx() {
    var linkedFolder = "";
    if (XP.kind === "ws") {
      var ds = Studio.Workspace.get("datasets", XP.dsId);
      if (ds) linkedFolder = ds.folder || "";
    }
    return { linkedFolder: linkedFolder };
  }
  function xpDefaultType(cols) {
    var c = (cols || []).join(" ").toLowerCase();
    if (/fips|geoid|county|huc|district|crd|(^| )state( |$)/.test(c)) return "choropleth";
    if (/provider/.test(c) && /year|month|date/.test(c)) return "ensembleSeries";
    return "bars";
  }
  // QV-1 (Kevin live, 2026-07-30): default the map's Region scale from the Region-id
  // column — its NAME first, then the SHAPE of its first non-empty value when the name
  // is ambiguous. Only runs when the mapping is (re)guessed (dataset/type pick), so a
  // manual scale choice afterwards always wins. VB-10 moved the inference itself to
  // Studio.guessRegionScale (model.js) so the View Builder shares it verbatim.
  function xpGuessRegionScale(col, run) { return Studio.guessRegionScale(col, run); }
  function xpGuessMapping() {
    var cols = (XP.run && XP.run.cols) || [];
    var p = Studio.newPanel(XP.type, { columns: cols });
    XP.map = p.chart.map || {};
    XP.opts = p.chart.opts || {};
    if (XP.type === "choropleth" || XP.type === "ensembleSeries") {
      var f = Studio.guessFmt(XP.map.valueCol || "");
      if (f && "fmt" in XP.opts) XP.opts.fmt = f;
    }
    if (XP.type === "choropleth" && "scale" in XP.opts) {
      var gs = xpGuessRegionScale(XP.map.idCol || "", XP.run);
      if (gs) XP.opts.scale = gs;
    }
  }
  function xpSpec(mockOnly) {
    var da = xpDA();
    if (!da) return null;
    var title = XP.name || (XP.run ? "Exploring " + (Studio.CHARTS[XP.type] || {}).label : "View");
    // VB-5: a KPI-type View (View Builder–made) lives in spec.kpis, not
    // spec.panels — same branch shape as analysisSpec below.
    if (XP.type === "kpi" && XP.kpi) {
      var k = Studio.clone(XP.kpi); k.da = da.id;
      return {
        id: "explore-preview", name: "explore-preview", title: title,
        hideHeader: true,
        dashboardTheme: defaultDashboardTheme(),
        panels: [], kpis: [k], filters: [],
        cda: { connections: [], dataAccesses: [da] }
      };
    }
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
          ifr.className = "xp-ifr"; ifr.title = "View preview"; ifr.setAttribute("aria-label", "View preview");
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
    if (!XP.name) { toast("Give the View a name first", true); if (nameInp) nameInp.focus(); return; }
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
    // XP-UPDATE (Kevin live, 2026-07-31): Update used to REBUILD the row from
    // only the fields this editor owns — silently dropping everything else. The
    // worst casualty was `builder` (the View Builder blob that computes a
    // cross-editor View's REAL rows): one Update from Quick Views and the map
    // went permanently blank. Also lost: private/owner (M4.2) and kpi. Start
    // from the previous row and override ONLY what Quick Views actually edits.
    var row = Object.assign({}, prev || {}, {
      id: XP.analysisId || undefined,
      name: XP.name,
      datasetId: XP.kind === "ws" ? XP.dsId : null,
      sample: XP.kind === "sample" ? XP.dsId : null,
      da: da,
      chart: { type: XP.type, map: Studio.clone(XP.map), opts: Studio.clone(XP.opts) },
      chartType: XP.type,
      pinned: prev ? !!prev.pinned : false,
      createdAt: prev ? prev.createdAt : undefined
    });
    // a KPI blob only makes sense while the View IS a KPI — switching chart
    // type in this editor genuinely replaces it (the VB-5 best-effort contract)
    if (XP.type !== "kpi") delete row.kpi;
    if (XP.folder) row.folder = XP.folder; else delete row.folder;
    var saved = Studio.Workspace.put("analyses", row);
    XP.analysisId = saved.id;
    toast(prev ? "View updated" : "View saved — pin it to Home or add it to a dashboard");
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
    // VB-5: a KPI-type View carries a `kpi` blob instead of `chart` — keep it so
    // xpSpec can render it (spec.kpis, not spec.panels).
    XP.kpi = a.kpi ? Studio.clone(a.kpi) : null;
    // VB-5 (cross-editor opening): this simpler editor still OPENS Views made in a
    // higher-level editor — best-effort render plus a dismissible notice saying so.
    XP.notice = ""; XP.noticeBuild = null;
    if (a.builder) {
      XP.notice = "“" + (a.name || "This View") + "” was built in the View Builder — Quick Views shows it best-effort and can’t edit its shelves, filters, or calculated columns. Open it in the View Builder for full editing.";
      XP.noticeBuild = a.id;
    } else if (XP_TYPES.indexOf(XP.type) < 0) {
      XP.notice = "“" + (a.name || "This View") + "” uses a chart type (" + ((Studio.CHARTS[XP.type] || {}).label || XP.type) + ") from the higher-level Dashboard Builder that Quick Views doesn’t offer — it renders as saved, but picking a new chart type here will replace it.";
    }
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
    var load;
    if (haveDs) {
      load = xpLoadRows();
    } else if (a.builder && Studio.Build && Studio.Build.runBlob) {
      // #118 (live re-run): a builder-made View has no datasetId of its own, but its
      // blob can recompute the REAL result — preview that instead of fabricating
      // sample rows over the basis columns; sample fallback only if the run fails.
      load = Studio.Build.runBlob(a.builder).then(function (v) {
        if (v) return (XP.run = { cols: v.cols, rows: v.rows, live: !!v.live });
        var sd = Studio.sampleRows(a.da || { columns: [] });
        return (XP.run = { cols: sd.cols, rows: sd.rows, live: false, orphan: true });
      });
    } else {
      load = Promise.resolve(
        XP.run = (function () { var sd = Studio.sampleRows(a.da || { columns: [] }); return { cols: sd.cols, rows: sd.rows, live: false, orphan: !haveDs }; })());
    }
    load.then(function () { xpEnterEditor(); renderExplore(); xpPreview(); });
  }
  // A standalone one-panel spec for a saved analysis — used by Home's live
  // widgets (and anything else that needs to render an analysis outside Explore).
  function analysisSpec(a) {
    var da = Studio.clone(a.da || {});
    // #118 (live re-run): pre-existing builder Views saved their blob only on the
    // row, not the da — attach it so renderers can recompute the real result.
    if (a.builder && !da.builder) da.builder = Studio.clone(a.builder);
    // VB-4 remaining major (KPI): a KPI-type View has no `.chart` at all — it
    // lives in spec.kpis, not spec.panels — so it gets its own tiny spec shape
    // instead of the single-panel one every chart-type View shares.
    if (a.chartType === "kpi") {
      var k = Studio.clone(a.kpi || {}); k.da = da.id;
      return {
        id: "analysis-" + a.id, name: "analysis-" + a.id, title: a.name || "View",
        panels: [], kpis: [k], filters: [],
        cda: { connections: [], dataAccesses: [da] }
      };
    }
    return {
      id: "analysis-" + a.id, name: "analysis-" + a.id, title: a.name || "View",
      panels: [{ id: "a1", title: a.panelTitle || a.name || "View", span: "full", // VB-7: the panel's own title wins
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
      if (a.builder && !da.builder) da.builder = Studio.clone(a.builder); // #118 — see analysisSpec
      var base = da.id, n = 2;
      while (Studio.daById(S.spec, da.id)) da.id = base + "_" + (n++);
      S.spec.cda.dataAccesses.push(da);
    }
    // VB-4 remaining major (KPI): drop it into spec.kpis instead of building a
    // panel — a KPI-type View carries a `.kpi` blob (bdSave's counterpart to
    // `.chart`), not a chart type Studio.newPanel/WIDE_CHART_TYPES understands.
    if (a.chartType === "kpi") {
      var k = Studio.clone(a.kpi || {}); k.da = da.id; k.label = a.name || k.label || "Metric";
      S.spec.kpis.push(k);
      select({ kind: "kpi", index: S.spec.kpis.length - 1 });
      enterStudio();
      toast("Added View “" + (a.name || "View") + "” to “" + S.spec.title + "”");
      refreshPreview(); buildLibrary();
      return;
    }
    var p = { id: Studio.uid("p"), title: a.panelTitle || a.name || "View", span: Studio.WIDE_CHART_TYPES.indexOf(a.chart.type) >= 0 ? "full" : 1, // VB-7
      chart: { type: a.chart.type, da: da.id, map: Studio.clone(a.chart.map || {}), opts: Studio.clone(a.chart.opts || {}) } };
    S.spec.panels.push(p);
    select({ kind: "panel", id: p.id });
    enterStudio();
    toast("Added View “" + (a.name || "View") + "” to “" + S.spec.title + "”");
    refreshPreview(); buildLibrary();
  }
  // LF11: "Add to NEW dashboard" — same blank-spec defaults as the Studio
  // "＋ Blank dashboard" action (New ▾ menu), then drop the analysis in as its
  // first panel via the normal current-spec path. Like any other new/blank
  // dashboard, it isn't written to the Dashboards catalog until Save.
  function xpAddAnalysisToNewDashboard(id) {
    D.newBlankDashboard();
    xpAddAnalysisToSpec(id);
  }
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
      // VB-8 (Kevin live, 2026-07-30): the picker also offers a brand-new dashboard —
      // pinned above the list (never filtered away), same path the "New dashboard"
      // add-to target uses (blank spec + append this View).
      var newRow = el("button", "odp-row odp-new"); newRow.type = "button";
      newRow.innerHTML = '<b>＋ New dashboard</b><small>Start a blank dashboard with this View on it</small>';
      newRow.onclick = function () { closeAllModals(); xpAddAnalysisToNewDashboard(analysisId); };
      b.appendChild(newRow);
      var listWrap = el("div", "odp-list"); b.appendChild(listWrap);
      function paint() {
        var q = (search.value || "").toLowerCase();
        var list = loadRecents().filter(isVisibleToMe).filter(function (r) {
          if (!q) return true;
          var sp = r.spec || {};
          return ((sp.title || "") + " " + (sp.name || "")).toLowerCase().indexOf(q) >= 0;
        });
        listWrap.innerHTML = list.length ? "" : '<div class="odp-empty">' + (q ? "No dashboards match." : "Nothing saved yet — save a dashboard first, or add to a new one instead.") + '</div>';
        var titleOf = function (r) { var sp = r.spec || {}; return sp.title || sp.name || "Untitled"; };
        var labels = disambiguateLabels(list, titleOf);
        list.forEach(function (r) {
          var sp = r.spec || {};
          var row = el("button", "odp-row"); row.type = "button";
          var panels = (sp.panels || []).length;
          row.innerHTML = '<b>' + esc(labels[r.id]) + '</b>' +
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
        [["county", "Counties (FIPS)"], ["state", "States"], ["crd", "USDA districts (CRD)"], ["huc8", "Watersheds (HUC8)"], ["cd", "Congressional districts"], ["zcta", "ZIP codes (ZCTA)"]].map(function (o) {
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
    function xpDsRowHtml(d) {
      var on = XP.kind === d.kind && XP.dsId === d.id;
      return '<button type="button" class="xp-ds' + (on ? " active" : "") + '" data-xp-ds="' + esc(d.kind) + XP_SEP + esc(d.id) + '">' +
        '<b>' + esc(d.name) + '</b><small>' + esc(d.sub) + '</small></button>';
    }
    // LF51 (Explore navigator): the picker is a real multi-level NAVIGATOR, not a flat list.
    // Your datasets group by their folder (nested via "/", folders A→Z, unfiled rows last —
    // the Repository conventions), sample data groups by its set (stem), and every branch is
    // collapsible. A search query bypasses the tree entirely (flat matching rows), so finding
    // by name is never gated on knowing where something is filed. Every row stays in the DOM
    // (collapsed branches just hide) — selection contracts and hooks are unchanged.
    function xpTreeHeadHtml(path, label, n, collapsed) {
      return '<button type="button" class="xp-tree-h" data-xp-tree="' + esc(path) + '" aria-expanded="' + (!collapsed) + '">' +
        '<span class="xp-tree-car">' + (collapsed ? "▸" : "▾") + '</span><span class="xp-tree-lbl">' + esc(label) + '</span>' +
        '<span class="xp-tree-n">' + n + '</span></button>';
    }
    var capped = shown.slice(0, 60);
    var dsRows;
    if (q) {
      dsRows = capped.map(xpDsRowHtml).join("");
    } else {
      var wsShown = capped.filter(function (d) { return d.kind === "ws"; });
      var sampleShown = capped.filter(function (d) { return d.kind === "sample"; });
      // build the ws folder tree: {kids:{name:node}, rows:[]}
      var xpRoot = { kids: {}, rows: [] };
      wsShown.forEach(function (d) {
        var node = xpRoot;
        (d.folder ? d.folder.split("/") : []).forEach(function (seg) {
          seg = seg.trim(); if (!seg) return;
          node = node.kids[seg] || (node.kids[seg] = { kids: {}, rows: [] });
        });
        node.rows.push(d);
      });
      function xpCount(n) { return n.rows.length + Object.keys(n.kids).reduce(function (s, k) { return s + xpCount(n.kids[k]); }, 0); }
      function xpRenderNode(n, path) {
        var html = "";
        Object.keys(n.kids).sort().forEach(function (name) {
          var p = path ? path + "/" + name : name;
          var collapsed = xpTreeCollapsed(p, false); // ws folders default OPEN
          html += xpTreeHeadHtml(p, name, xpCount(n.kids[name]), collapsed) +
            '<div class="xp-tree-kids"' + (collapsed ? " hidden" : "") + '>' + xpRenderNode(n.kids[name], p) + "</div>";
        });
        return html + n.rows.map(xpDsRowHtml).join(""); // unfiled rows AFTER folders (Repository convention)
      }
      dsRows = "";
      if (wsShown.length) dsRows += '<div class="xp-grp-h">Your datasets <span class="xp-grp-n">' + wsShown.length + "</span></div>" + xpRenderNode(xpRoot, "");
      if (sampleShown.length) {
        var stems = {};
        sampleShown.forEach(function (d) { (stems[d.stem] = stems[d.stem] || []).push(d); });
        // sample sets default CLOSED once you have datasets of your own (they're long lists);
        // a brand-new workspace keeps them OPEN so the picker never looks empty.
        var sampleDflt = wsShown.length > 0;
        dsRows += '<div class="xp-grp-h">Sample tables — Data Management pack <span class="xp-grp-n">' + sampleShown.length + "</span></div>" +
          Object.keys(stems).sort().map(function (st) {
            var p = "sample:" + st;
            var collapsed = xpTreeCollapsed(p, sampleDflt);
            return xpTreeHeadHtml(p, st, stems[st].length, collapsed) +
              '<div class="xp-tree-kids"' + (collapsed ? " hidden" : "") + '>' + stems[st].map(xpDsRowHtml).join("") + "</div>";
          }).join("");
      }
    }
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
      var folderBadge = a.folder ? '<span class="cx-badge cx-folder" data-tip="Folder: ' + esc(a.folder) + '">' + esc(a.folder) + '</span>' : "";
      // Track H sweep: this sidebar is narrow enough that the CSS ellipsis
      // (.xp-saved-open b) routinely collapses several saved analyses that share a
      // long common prefix (e.g. a demo pack's "Conservation Insight — …" set) down
      // to visually-identical text, and the button's title used to be a hardcoded
      // "Open in Explore" — so hovering to disambiguate told you nothing you didn't
      // already know. Putting the analysis's own full name in the title (still
      // hinting at the click action) restores the native-tooltip escape hatch every
      // truncated label needs, same fix family as the disambiguateLabels() rows
      // elsewhere in Repository/Dashboards.
      return '<div class="xp-saved-row' + (on ? " active" : "") + '" data-xp-a="' + esc(a.id) + '">' +
        '<button type="button" class="xp-saved-open" data-xp-open="' + esc(a.id) + '" title="' + esc(a.name) + ' — open in Quick Views" aria-label="Open ' + esc(a.name) + ' in Quick Views"><b>' + esc(a.name) + '</b>' +
        '<small>' + esc((Studio.CHARTS[a.chartType] || {}).label || a.chartType) + '</small></button>' +
        folderBadge +
        '<span class="xp-saved-acts">' +
        '<button type="button" class="xp-act' + (a.private ? " private" : "") + '" data-xp-private="' + esc(a.id) + '" title="' + (a.private ? "Private — only you can see this" : "Make private") + '" aria-label="' + (a.private ? "Make " + esc(a.name) + " public" : "Make " + esc(a.name) + " private") + '" aria-pressed="' + (a.private ? "true" : "false") + '"></button>' +
        '<button type="button" class="xp-act' + (a.pinned ? " on" : "") + '" data-xp-pin="' + esc(a.id) + '" title="' + (a.pinned ? "Unpin from Home" : "Pin to Home") + '" aria-label="' + (a.pinned ? "Unpin " + esc(a.name) + " from Home" : "Pin " + esc(a.name) + " to Home") + '" aria-pressed="' + (a.pinned ? "true" : "false") + '">★</button>' +
        '<button type="button" class="xp-act" data-xp-build="' + esc(a.id) + '" title="Open in the View Builder — the full shelves/pivot editor" aria-label="Open ' + esc(a.name) + ' in the View Builder">▤</button>' +
        '<button type="button" class="xp-act" data-xp-dash="' + esc(a.id) + '" title="Add to the current dashboard" aria-label="Add ' + esc(a.name) + ' to the current dashboard">▦</button>' +
        '<button type="button" class="xp-act" data-xp-del="' + esc(a.id) + '" title="Delete View" aria-label="Delete ' + esc(a.name) + '">✕</button>' +
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
      // VB-5: the dismissible cross-editor notice (set by xpLoadAnalysis when the
      // loaded View was made in a higher-level editor).
      var noticeHtml = XP.notice
        ? '<div class="xp-cross-note" role="note"><span class="xp-cross-note-txt">' + esc(XP.notice) + "</span>" +
          (XP.noticeBuild ? '<button type="button" class="btn" id="xpNoticeOpenBuild">Open in View Builder</button>' : "") +
          '<button type="button" class="bd-notice-x" id="xpNoticeDismiss" title="Dismiss" aria-label="Dismiss this notice">✕</button></div>'
        : "";
      main =
        '<div class="xp-editor-bar"><button type="button" class="btn xp-back-btn" id="xpBackBtn" title="Back to datasets"></button></div>' +
        noticeHtml +
        '<div class="xp-step"><div class="xp-step-h">1 · Data' +
          '<span class="xp-badge' + (XP.run.live ? " live" : "") + '">' + (XP.run.live ? "live rows" : "sample rows") + "</span>" +
          (XP.run.error ? '<span class="xp-badge warn" title="' + esc(XP.run.error) + '">live run failed</span>' : "") +
          '<span class="xp-note">' + rows.length + " rows · " + cols.length + " columns</span></div>" +
          '<div class="xp-table-wrap"><table class="xp-table"><thead>' + thead + "</thead><tbody>" + tbody + "</tbody></table></div></div>" +
        '<div class="xp-step"><div class="xp-step-h">2 · Chart</div><div class="xp-chips">' + chips + "</div></div>" +
        '<div class="xp-step"><div class="xp-step-h">3 · Mapping</div><div class="xp-map-grid">' + xpMapEditorHtml() + "</div></div>" +
        '<div class="xp-step"><div class="xp-step-h">4 · Result</div><div id="xpPreview" class="xp-preview"></div>' +
          '<div class="xp-savebar">' +
            '<input id="xpName" type="text" placeholder="Name this View…" value="' + esc(XP.name) + '" aria-label="View name"/>' +
            '<input id="xpFolder" type="text" placeholder="Folder (optional)" title="Optional — use / to nest, e.g. Finance/2024" value="' + esc(XP.folder || "") + '" aria-label="Folder" list="xpFolderOptions"/>' +
            '<datalist id="xpFolderOptions">' + Object.keys(xpFolderCounts).sort().map(function (f) { return '<option value="' + esc(f) + '">'; }).join("") + '</datalist>' +
            '<button type="button" class="btn primary" id="xpSaveBtn">' + (XP.analysisId ? "Update View" : "Save View") + "</button>" +
            (XP.analysisId ? '<button type="button" class="btn" id="xpSaveAsBtn">Save as new</button>' : "") +
            '<button type="button" class="btn" id="xpToNewDashBtn" title="Add this chart to a brand-new dashboard">+ New dashboard</button>' +
            '<button type="button" class="btn" id="xpToExistDashBtn" title="Pick an existing dashboard to add this chart to">Existing dashboard…</button>' +
          "</div></div>";
    }
    body.innerHTML =
      '<aside class="xp-side">' +
        '<div class="xp-side-search-row">' +
          '<input id="xpSearch" class="repo-search" type="search" placeholder="Search datasets…" aria-label="Search datasets" value="' + esc(XP.q) + '"/>' +
          '<button type="button" class="btn primary" id="xpNewDsBtn" title="Create a new dataset without leaving Quick Views">+ New</button>' +
        "</div>" +
        '<div class="xp-list">' + (dsRows || '<div class="xp-none">No datasets yet — connect a data source, or install a sample pack in Settings (pack datasets arrive filed in the pack\'s folder).</div>') + "</div>" +
        '<div class="xp-saved"><div class="xp-saved-h">Saved Views <span class="badge">' + analyses.length + "</span></div>" +
          (pillsFXp ? '<div class="wb-chips">' + pillsFXp + '</div>' : "") +
          (savedRows || '<div class="xp-none">' + (_xpFolderFilter ? "No Views in this folder." : "Nothing saved yet.") + '</div>') + "</div>" +
      "</aside>" +
      '<div class="xp-main">' + main + "</div>";
    Studio.Tooltip.hydrate(body);
    // wire
    var search = $("#xpSearch", body);
    if (search) search.addEventListener("input", function () { XP.q = search.value || ""; renderExplore(); });
    $$("[data-xp-ds]", body).forEach(function (btn) {
      btn.onclick = function () {
        var parts = btn.getAttribute("data-xp-ds").split(XP_SEP);
        xpSelectDataset(parts.shift(), parts.join(XP_SEP)); // sample ids contain the SEP themselves
      };
    });
    // LF51 (Explore navigator): collapse/expand a tree branch. The stored value is the
    // OPPOSITE of the branch's current effective state, so sample stems (whose default
    // flips with wsShown) toggle correctly from either default.
    $$("[data-xp-tree]", body).forEach(function (btn) {
      btn.onclick = function () {
        var p = btn.getAttribute("data-xp-tree");
        _xpTreeCollapsed[p] = btn.getAttribute("aria-expanded") === "true";
        renderExplore();
      };
    });
    var xpNewDsBtn = $("#xpNewDsBtn", body);
    if (xpNewDsBtn) xpNewDsBtn.onclick = function () {
      openDatasetEditor(null, function (d) { xpSelectDataset("ws", d.id); });
    };
    var xpBackBtn = $("#xpBackBtn", body);
    if (xpBackBtn) { setIconBtn(xpBackBtn, "chevron-left", "Back to datasets"); xpBackBtn.onclick = function () { xpCloseToList(); }; }
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
    // dashboard it meant (always "whatever's currently open in the Dashboard
    // Builder," which isn't obvious from the button text) — split into an explicit new-vs-
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
    if (nameInp2) {
      var xpNameNextSibling = nameInp2.nextSibling, xpNameParent = nameInp2.parentNode;
      xpNameParent.insertBefore(withSparkleButton(nameInp2, "view", xpNameSuggestCtx), xpNameNextSibling);
      nameInp2.addEventListener("input", function () { XP.name = nameInp2.value; });
    }
    var folderInp2 = $("#xpFolder", body);
    if (folderInp2) {
      var xpFolderNextSibling = folderInp2.nextSibling, xpFolderParent = folderInp2.parentNode;
      var folderWrap = withSparkleButton(folderInp2, "folder", xpFolderSuggestCtx);
      folderWrap.classList.add("xp-folder-sparkle");
      xpFolderParent.insertBefore(folderWrap, xpFolderNextSibling);
      // LF56 slice 3: the Browse button sits as its OWN flex item next to folderWrap, not
      // nested inside it — the sparkle wrap is already a tight overlay (input padded for one
      // absolute icon) sized to the savebar's compact .6fr slot, so a second control crammed
      // into that same box overflowed it and shoved the Save button off (the earlier attempt
      // this note used to describe). A sibling flex item just wraps to its own line at narrow
      // widths like the other savebar buttons already do.
      xpFolderParent.insertBefore(Studio.folderPickerButton(folderInp2, function () { return Object.keys(xpFolderCounts); }), xpFolderNextSibling);
      folderInp2.addEventListener("input", function () { XP.folder = folderInp2.value; });
    }
    $$("[data-xp-folder]", body).forEach(function (btn) {
      btn.onclick = function () { _xpFolderFilter = btn.getAttribute("data-xp-folder"); renderExplore(); };
    });
    $$("[data-xp-open]", body).forEach(function (btn) { btn.onclick = function () { xpLoadAnalysis(btn.getAttribute("data-xp-open")); }; });
    // VB-5: every saved row also offers the OTHER editor.
    $$("[data-xp-build]", body).forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        Studio.ViewsCatalog.openIn(btn.getAttribute("data-xp-build"), "build");
      };
    });
    var noticeDismiss = $("#xpNoticeDismiss", body);
    if (noticeDismiss) noticeDismiss.onclick = function () { XP.notice = ""; XP.noticeBuild = null; renderExplore(); };
    var noticeBuild = $("#xpNoticeOpenBuild", body);
    if (noticeBuild) noticeBuild.onclick = function () { Studio.ViewsCatalog.openIn(XP.noticeBuild, "build"); };
    $$("[data-xp-private]", body).forEach(function (btn) {
      btn.appendChild(Studio.icon("lock", 12));
      btn.onclick = function (e) { e.stopPropagation(); toggleAnalysisPrivate(btn.getAttribute("data-xp-private")); };
    });
    $$("[data-xp-pin]", body).forEach(function (btn) { btn.onclick = function () { xpTogglePin(btn.getAttribute("data-xp-pin")); }; });
    $$("[data-xp-dash]", body).forEach(function (btn) { btn.onclick = function () { xpAddAnalysisToSpec(btn.getAttribute("data-xp-dash")); }; });
    $$("[data-xp-del]", body).forEach(function (btn) {
      btn.onclick = function () {
        var a = Studio.Workspace.get("analyses", btn.getAttribute("data-xp-del")); if (!a) return;
        if (!window.confirm('Delete View "' + a.name + '"?')) return;
        if (XP.analysisId === a.id) XP.analysisId = null;
        Studio.Workspace.remove("analyses", a.id);
        toast("Deleted " + a.name);
      };
    });
    if (XP.dsId && XP.run) xpPreview();
  }
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
    h.innerHTML = '<span class="car">▶</span><span class="nm">Views</span><span class="badge">' + shown.length + "</span>";
    libGroupHeaderIcon(h, "trend-up");
    h.onclick = function () { wrap.classList.toggle("open"); };
    wrap.appendChild(h);
    var box = el("div", "lib-das");
    shown.forEach(function (a) {
      var c = el("div", "da");
      c.draggable = true;
      c.innerHTML = '<div class="da-top"><div class="da-id">' + hlq(a.name || "View", q) + '</div></div>' +
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

  Studio.Explore = {
    configure: configure,
    XP: XP,
    render: renderExplore,
    // LF51: Repository's "＋ New → New View" entry needs a genuinely fresh Explore state
    // (no half-loaded analysis) WITHOUT touching history — xpCloseToList(true) is exactly
    // that reset (viaHistory=true skips the popOverlay history sync, and with no explore
    // overlay open there is nothing to pop anyway).
    startNew: function () { xpCloseToList(true); },
    selectDataset: xpSelectDataset,
    loadAnalysis: xpLoadAnalysis,
    save: xpSave,
    addToSpec: xpAddAnalysisToSpec,
    addToNewDashboard: xpAddAnalysisToNewDashboard,
    togglePin: xpTogglePin,
    openAddToExistingDashboardPicker: openAddToExistingDashboardPicker,
    togglePrivate: toggleAnalysisPrivate,
    analysisSpec: analysisSpec,
    buildLib: buildAnalysesLib
  };
})();
