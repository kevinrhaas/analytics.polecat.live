/* ============================================================================
   build.js — #117 slice 1: the "Build" rail section (View Builder), a
   pivot/crosstab visual query builder that saves real Views, sibling to
   Explore. Kevin's spec: LEFT = dataset outline (expand to columns, drag
   out); TOP = Columns + Rows shelves (columns-only = a plain SELECT of
   those fields; numeric fields default to SUM; adding Rows fields turns
   the result into a crosstab/pivot); CENTER = the live-rendered result.
   "Start simple (near current Explore), grow to full pivot."

   Slice 1 scope (the honest MVP):
   - the section + dataset outline + both shelves (drag-and-drop AND
     click-to-add — mobile is a release gate, so no drag-only affordance),
   - a PURE pivot engine (Studio.Build.compute — projection, grouped
     rollup, crosstab with one column dimension + per-cell aggregation +
     row totals; sum/avg/min/max/median/count),
   - live table/crosstab render with the same live/sample honesty badges
     the rest of the app uses,
   - Save/Update as a real `analyses` row (a View) carrying a `builder`
     state blob — the Views catalog routes builder-made Views back HERE
     (views.js vwOpen), while plain Explore Views keep opening in Explore.
   Later slices: the chart-type picker + Filters shelf + per-field calcs
   (the RIGHT panel), and #118's drag-drop encoding/marks card.

   Naming (Kevin asked for help, "name TBD: Build/Compose/Pivot"): rail
   label "Build", topbar title "View Builder" — a one-line rename in
   index.html + shell.js SECTION_LABELS if another name wins.

   Same ONE-bundled-configure(deps)-call shape as every other module.
   Loads after views.js, before studio.js (app/index.html).
   ============================================================================ */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};
  function esc(s) { return Studio.escapeHtml(s); }

  var D = null;
  function configure(deps) {
    D = deps;
    // Topbar actions (#tbSectionActions) for the Build section — same
    // register-once, nodes-are-moved-not-cloned contract studio.js uses.
    if (window.__studioRegisterSectionActions) {
      window.__studioRegisterSectionActions("build", function () {
        var newBtn = D.el("button", "btn"); newBtn.id = "bdNewBtn"; newBtn.type = "button";
        newBtn.textContent = "+ New"; newBtn.onclick = bdNew;
        var saveBtn = D.el("button", "btn primary"); saveBtn.id = "bdSaveBtn"; saveBtn.type = "button";
        saveBtn.textContent = BD.analysisId ? "Update View" : "Save View"; saveBtn.onclick = bdSave;
        return [newBtn, saveBtn];
      });
    }
  }
  function $(sel, root) { return D.$(sel, root); }
  function $$(sel, root) { return D.$$(sel, root); }
  function toast(msg, isErr, celebrate) { return D.toast(msg, isErr, celebrate); }

  var BD_SEP = "\u0001"; // sample dataset key: stem + BD_SEP + da id (same shape Explore uses)

  var _bdDropHint = null; // VB-2: { shelf, col, before } from the hovered chip's dragover, read on drop

  // ---------- builder state ----------
  var BD = {
    dsKind: null, dsId: null, dsName: "", dsSub: "",
    run: null,               // { cols, rows, live, error } — the loaded source rows
    shelfCols: [],           // [ { col, agg } ] — agg null = dimension, else sum/avg/min/max/median/count
    shelfRows: [],           // [ { col } ] — row dimensions (crosstab when non-empty)
    filters: [],             // slice 3: [ { col, kind:"in"|"range", values:null|[..], min:"", max:"" } ]
    calcs: [],               // slice 4: [ { name, formula } ] — Studio.applyCalcCols "=[a]+[b]" syntax
    shelfColor: [],           // VB-3: [ { col } ], 0 or 1 entries — the categorical field that
                               // splits bars/donut/line into per-category palette colors
    paletteKey: "",           // VB-3: Studio.PALETTE_PRESETS key ("" = default) for the live preview
    chartType: "table",      // slice 2: table | bars | line | donut | heatmap
    mapScale: "",            // VB-10: choropleth Region scale ("" = not yet guessed)
    mapScaleAuto: true,      // VB-10: true while mapScale is a live guess, not a manual pick
    analysisId: null, name: "", folder: "",
    panelTitle: "",          // VB-7: the panel header's own title — "" tracks the View name
    notice: "",              // VB-5: dismissible cross-editor banner text ("" = hidden)
    outlineOpen: {}          // which outline datasets are expanded
  };
  function bdReset() {
    BD.dsKind = null; BD.dsId = null; BD.dsName = ""; BD.dsSub = "";
    BD.run = null; BD.shelfCols = []; BD.shelfRows = []; BD.filters = []; BD.calcs = [];
    BD.shelfColor = []; BD.paletteKey = "";
    BD._eff = null;
    BD.chartType = "table";
    BD.mapScale = ""; BD.mapScaleAuto = true;
    BD.analysisId = null; BD.name = ""; BD.folder = "";
    BD.panelTitle = "";
    BD.notice = "";
  }

  // ---------- calculated columns (slice 4) ----------
  // The SAME formula engine the rest of the app uses (Studio.applyCalcCols /
  // Studio.evalFormula — "=[colA] / [colB]" plus pctChange()/movingAvg(); a safe
  // recursive-descent parser, never eval()). Calc columns extend the loaded rows
  // ONCE (memoized) and from there behave like any other column — shelves,
  // filters, charts, and the pivot never special-case them.
  // #118 (live re-run): every basis-pipeline helper takes an OPTIONAL state `st`
  // (shape of BD: run/calcs/filters/shelfCols/shelfRows/shelfColor/chartType)
  // defaulting to the live BD — so bdRunBlob (below) can compute a saved View's
  // REAL result from its `builder` blob through the exact same code path the
  // editor renders with, zero duplicated logic.
  function bdEff(st) {
    st = st || BD;
    if (!st.run) return null;
    if (!st.calcs.length) return st.run;
    var key = JSON.stringify(st.calcs);
    if (!st._eff || st._effKey !== key) {
      var e = Studio.applyCalcCols(st.run.cols, st.run.rows, st.calcs.map(function (c) {
        return { name: c.name, formula: c.formula, type: "Numeric" };
      }));
      st._eff = { cols: e.cols, rows: e.rows, live: st.run.live, error: st.run.error };
      st._effKey = key;
    }
    return st._eff;
  }
  function bdIsCalc(col) { return BD.calcs.some(function (c) { return c.name === col; }); }
  // Replace the calc list wholesale (the editor modal's Save + the test hook):
  // sanitizes names, drops incomplete rows, refuses collisions with real columns,
  // and prunes any shelf/filter chip whose calc column just went away or renamed.
  function bdSetCalcs(list) {
    var baseCols = BD.run ? BD.run.cols : [];
    var seen = {};
    BD.calcs = (list || []).map(function (c) {
      return { name: String(c.name || "").trim().replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, ""), formula: String(c.formula || "").trim() };
    }).filter(function (c) {
      if (!c.name || !c.formula) return false;
      if (baseCols.indexOf(c.name) >= 0) return false; // never shadow a real column
      if (seen[c.name]) return false;
      seen[c.name] = true;
      return true;
    });
    BD._eff = null;
    var known = bdEff() ? bdEff().cols : [];
    BD.shelfCols = BD.shelfCols.filter(function (f) { return known.indexOf(f.col) >= 0; });
    BD.shelfRows = BD.shelfRows.filter(function (f) { return known.indexOf(f.col) >= 0; });
    BD.filters = BD.filters.filter(function (f) { return known.indexOf(f.col) >= 0; });
    BD.shelfColor = BD.shelfColor.filter(function (f) { return known.indexOf(f.col) >= 0; });
    render();
  }
  function openCalcEditor() {
    D.modal("Calculated columns", function (b) {
      var wrap = D.el("div", "bd-calc");
      var hint = D.el("div", "bd-calc-hint");
      hint.textContent = "Formulas reference other columns as =[column] — e.g. =[revenue] / [acres], =([a]+[b])*100, =pctChange([sales]), =movingAvg([sales], 3). A calculated column then works like any other field on the shelves and filters.";
      wrap.appendChild(hint);
      var listBox = D.el("div", "bd-calc-list");
      wrap.appendChild(listBox);
      var draft = Studio.clone(BD.calcs);
      function paint() {
        listBox.innerHTML = "";
        if (!draft.length) {
          var em = D.el("div", "bd-calc-empty"); em.textContent = "No calculated columns yet.";
          listBox.appendChild(em);
        }
        draft.forEach(function (c, i) {
          var row = D.el("div", "bd-calc-row");
          var nm = D.el("input"); nm.type = "text"; nm.value = c.name; nm.placeholder = "col_name"; nm.setAttribute("aria-label", "Column name");
          nm.oninput = function () { c.name = nm.value; };
          var fm = D.el("input"); fm.type = "text"; fm.value = c.formula; fm.placeholder = "=[colA] / [colB]"; fm.setAttribute("aria-label", "Formula");
          fm.className = "bd-calc-formula"; fm.oninput = function () { c.formula = fm.value; };
          var rm = D.el("button", "bd-chip-rm"); rm.type = "button"; rm.textContent = "✕"; rm.title = "Remove"; rm.setAttribute("aria-label", "Remove " + (c.name || "this calculated column"));
          rm.onclick = function () { draft.splice(i, 1); paint(); };
          row.appendChild(nm); row.appendChild(fm); row.appendChild(rm);
          listBox.appendChild(row);
        });
      }
      paint();
      var foot = D.el("div"); foot.style.cssText = "display:flex;justify-content:space-between;gap:8px;margin-top:14px";
      var add = D.el("button", "btn"); add.type = "button"; add.textContent = "+ Add column";
      add.onclick = function () { draft.push({ name: "", formula: "" }); paint(); };
      var save = D.el("button", "btn primary"); save.type = "button"; save.textContent = "Apply";
      save.onclick = function () { bdSetCalcs(draft); wrap.closest(".modal-ov").remove(); };
      foot.appendChild(add); foot.appendChild(save);
      wrap.appendChild(foot);
      b.appendChild(wrap);
    });
  }

  // ---------- dataset outline (LEFT) ----------
  // Same sourcing rules as Explore's picker: visible workspace datasets first,
  // then the sample catalog's authored/sample queries (showSamples-gated).
  // Kept local rather than reaching into explore.js's private xpDatasets —
  // LF51's shared-nav convergence epic is where these unify.
  // VB-1: rows carry `folder` (ws) / `stem` (sample) so the outline can render
  // the same collapsible folder tree as Explore's navigator.
  function bdDatasets() {
    var out = [];
    // Alphabetical, NOT updatedAt (Kevin live): selecting a dataset live-runs it,
    // which stamps lastRun/updatedAt — recency order made the list re-sort under
    // the cursor on every click ("it jumps around in the ui").
    (Studio.Workspace ? Studio.Workspace.all("datasets").filter(D.isDatasetVisibleToMe) : []).sort(function (a, b) {
      return String(a.name || a.id).localeCompare(String(b.name || b.id), undefined, { sensitivity: "base" });
    }).forEach(function (d) {
      var conn = Studio.Workspace.get("connections", d.connectionId);
      out.push({ kind: "ws", id: d.id, name: d.name || d.id, sub: conn ? conn.name : "no connection", cols: d.columns || [], folder: d.folder || "" });
    });
    // SAMPLE-DATA-1 (Kevin live, 2026-07-30): the raw demo-DB catalog tables are the Data
    // Management pack's data — they only appear when that pack is actually installed
    // (uninstalled pack = zero presence), not as an always-there SAMPLE DATA dump.
    if (D.showSamples() && Studio.demoPackInstalled && Studio.demoPackInstalled("datamanagement")) {
      var cat = D.getCatalog();
      Object.keys(cat).forEach(function (stem) {
        (cat[stem].dataAccesses || []).forEach(function (d) {
          out.push({ kind: "sample", id: stem + BD_SEP + d.id, name: d.id, sub: stem + " · sample", cols: d.columns || [], stem: stem });
        });
      });
    }
    return out;
  }

  // VB-1: outline navigator state — search query + per-branch collapse, same
  // conventions as Explore (_xpTreeCollapsed): ws folders default OPEN, sample
  // stems default CLOSED once you have datasets of your own. Session-only.
  var _bdQ = "";
  var _bdTreeCollapsed = {};
  function bdTreeCollapsed(path, dflt) { return (path in _bdTreeCollapsed) ? _bdTreeCollapsed[path] : dflt; }

  // VB-1: dataset-management ops right on the pane (ws rows only — samples are
  // read-only). New/edit reuse THE shared dataset editor (studio.js →
  // Studio.Datasets.openEditor, injected); copy/delete write the store and the
  // Workspace change hook re-renders every catalog view including this one.
  function bdCopyDataset(id) {
    var ds = Studio.Workspace.get("datasets", id);
    if (!ds) return;
    var copy = JSON.parse(JSON.stringify(ds));
    copy.id = "d_" + Math.random().toString(36).slice(2, 10);
    copy.name = (ds.name || ds.id) + " (copy)";
    copy.updatedAt = Date.now();
    delete copy.pinned; delete copy.pinnedAt;
    Studio.Workspace.put("datasets", copy);
    D.toast("Dataset copied — “" + copy.name + "”");
  }
  function bdDeleteDataset(id) {
    var ds = Studio.Workspace.get("datasets", id);
    if (!ds) return;
    if (!window.confirm("Delete dataset “" + (ds.name || ds.id) + "”? Views built on it fall back to sample rows.")) return;
    Studio.Workspace.remove("datasets", id);
    if (BD.dsKind === "ws" && BD.dsId === id) { bdReset(); }
    D.toast("Dataset deleted");
    render();
  }

  function bdSelectDataset(kind, id) {
    BD.dsKind = kind; BD.dsId = id;
    BD.shelfCols = []; BD.shelfRows = []; BD.filters = []; BD.calcs = []; BD.shelfColor = []; BD._eff = null;
    BD.run = null;
    BD.mapScale = ""; BD.mapScaleAuto = true; // VB-10: a new dataset's id column gets a fresh guess
    var entry = bdDatasets().filter(function (d) { return d.kind === kind && d.id === id; })[0];
    BD.dsName = entry ? entry.name : id;
    BD.dsSub = entry ? entry.sub : "";
    return bdLoadRows().then(function () { render(); });
  }
  // Workspace datasets run LIVE through their adapter, falling back to typed
  // sample rows when the run fails (same honesty rules as Explore's xpLoadRows);
  // catalog samples always use the sample engine. bdLoadRowsFor is the pure
  // half (#118 live re-run reuses it to run a saved blob's source); bdLoadRows
  // keeps the editor's own BD.run assignment.
  function bdLoadRowsFor(dsKind, dsId) {
    if (dsKind === "ws") {
      var ds = Studio.Workspace.get("datasets", dsId);
      if (!ds) return Promise.resolve(null);
      return D.runDataset(ds).then(function (r) {
        if (r && !r.error && (r.rows || []).length) {
          return { cols: r.columns || ds.columns || [], rows: r.rows.slice(0, 2000), live: true };
        }
        var cols = ds.columns || [];
        if (!cols.length) return { cols: [], rows: [], live: false, error: (r && r.error) || "no columns known — Preview the dataset once" };
        var sd = Studio.sampleRows({ id: ds.id, columns: cols });
        return { cols: sd.cols, rows: sd.rows, live: false, error: r && r.error };
      });
    }
    if (dsKind === "sample") {
      var parts = dsId.split(BD_SEP), stem = parts[0], daId = parts[1];
      var cat = D.getCatalog();
      var da = ((cat[stem] || {}).dataAccesses || []).filter(function (d) { return d.id === daId; })[0];
      if (!da) return Promise.resolve(null);
      var sd = Studio.sampleRows({ id: da.id, columns: da.columns || [], params: da.params || [] });
      return Promise.resolve({ cols: sd.cols, rows: sd.rows, live: false });
    }
    return Promise.resolve(null);
  }
  function bdLoadRows() {
    return bdLoadRowsFor(BD.dsKind, BD.dsId).then(function (run) { return (BD.run = run); });
  }

  // ---------- #118: live re-run of a saved builder View ----------
  // A builder-made View's da is authored (no query), so every renderer used to
  // fabricate its rows through the sample engine. bdRunBlob computes the REAL
  // result from the saved `builder` blob — same source loading, calcs, filters
  // and basis shaping as the editor itself (the parameterized helpers above).
  // Results are cached per blob for the session (keyed by the blob's JSON), so
  // a dashboard preview that re-renders on every edit never re-runs the source.
  var _blobRuns = {}; // blobJSON → { done, val, promise }
  function bdRunBlob(blob) {
    if (!blob || !blob.dsKind) return Promise.resolve(null);
    return bdLoadRowsFor(blob.dsKind, blob.dsId).then(function (run) {
      if (!run || !(run.cols || []).length) return null;
      var st = {
        run: run, _eff: null,
        calcs: blob.calcs || [], filters: blob.filters || [],
        shelfCols: blob.shelfCols || [], shelfRows: blob.shelfRows || [],
        shelfColor: blob.shelfColor || [], chartType: blob.chartType || "table"
      };
      var basis = st.chartType === "table"
        ? compute(bdEff(st).cols, bdFilteredRows(st), st.shelfCols, st.shelfRows)
        : chartBasis(st.chartType, st);
      if (!basis || !basis.head.length) return null;
      return { cols: basis.head.slice(), rows: basis.rows, live: !!run.live };
    });
  }
  // Kick off (cached) runs for every builder-backed da in a spec. Returns a
  // Promise while any run is still pending, or null when everything needed is
  // already cached — callers use the same "kick off, then re-enter" pattern as
  // studio.js's ensureGeoAssets.
  function bdEnsureSpecMocks(spec) {
    var pending = [];
    (((spec || {}).cda || {}).dataAccesses || []).forEach(function (d) {
      if (!d || !d.builder) return;
      var k = JSON.stringify(d.builder);
      if (!_blobRuns[k]) {
        var rec = { done: false, val: null };
        rec.promise = bdRunBlob(d.builder).then(function (v) { rec.done = true; rec.val = v; return v; })
          .catch(function () { rec.done = true; rec.val = null; return null; });
        _blobRuns[k] = rec;
      }
      if (!_blobRuns[k].done) pending.push(_blobRuns[k].promise);
    });
    return pending.length ? Promise.all(pending) : null;
  }
  // Synchronous read of the cached real results — { daId: { cols, rows } } for
  // every builder-backed da whose run succeeded (failures fall back to the
  // sample engine's fabricated rows, the pre-#118 behavior).
  function bdSpecMocks(spec) {
    var out = {};
    (((spec || {}).cda || {}).dataAccesses || []).forEach(function (d) {
      if (!d || !d.builder) return;
      var rec = _blobRuns[JSON.stringify(d.builder)];
      if (rec && rec.done && rec.val) out[d.id] = { cols: rec.val.cols, rows: rec.val.rows };
    });
    return out;
  }

  // Numeric vs dimension: name + sampled values, via the same guessFieldKind
  // the job editor already uses (injected) — one heuristic, not two.
  function bdFieldKind(col, st) {
    st = st || BD;
    if (!st.run) return "String";
    var eff = bdEff(st);
    var idx = eff.cols.indexOf(col);
    var vals = idx < 0 ? [] : eff.rows.slice(0, 30).map(function (r) { return r[idx]; });
    return D.guessFieldKind(col, vals);
  }

  // ---------- shelves ----------
  var AGGS = ["sum", "avg", "min", "max", "median", "count"];
  // VB-6: id-like numeric columns (FIPS codes, year, other *_id columns) are
  // numbers but not quantities — summing State_FIPS is nonsense. These default
  // to Category (grouped, agg null) instead of SUM on first drop onto Columns;
  // the aggregation dropdown still lets any numeric field switch either way.
  function bdLooksCategorical(col) {
    return /(^|_)(fips|id)$/i.test(col) || /(^|_)year$/i.test(col);
  }
  function bdDefaultAgg(col) {
    if (bdFieldKind(col) !== "Numeric") return null;
    return bdLooksCategorical(col) ? null : "sum";
  }
  function bdOnShelf(col) {
    return BD.shelfCols.some(function (f) { return f.col === col; }) ||
           BD.shelfRows.some(function (f) { return f.col === col; });
  }
  function bdAddField(col, shelf) {
    if (shelf === "filters") { bdAddFilter(col); return; }
    if (shelf === "color") { bdSetColorField(col); return; }
    if (!BD.run || bdEff().cols.indexOf(col) < 0 || bdOnShelf(col)) return;
    if (shelf === "rows") BD.shelfRows.push({ col: col });
    else BD.shelfCols.push({ col: col, agg: bdDefaultAgg(col) });
    render();
  }
  function bdRemoveField(col) {
    BD.shelfCols = BD.shelfCols.filter(function (f) { return f.col !== col; });
    BD.shelfRows = BD.shelfRows.filter(function (f) { return f.col !== col; });
    render();
  }
  // ---------- color encoding (VB-3) ----------
  // A single categorical field that splits bars/donut into per-category palette
  // colors and (via bdLineSeriesBasis) multi-series lines — independent of the
  // Columns/Rows shelves, so a field can plot AND color at once, or color can
  // stand in for a Columns split field when none is picked. Only one field at a
  // time (dropping a second replaces it, mirroring how a single Color channel
  // works in every BI tool this pattern is borrowed from).
  function bdSetColorField(col) {
    if (!BD.run || bdEff().cols.indexOf(col) < 0) return;
    BD.shelfColor = [{ col: col }];
    render();
  }
  function bdRemoveColorField(col) {
    BD.shelfColor = BD.shelfColor.filter(function (f) { return f.col !== col; });
    render();
  }
  function bdColorField(st) { return (st || BD).shelfColor[0] || null; }
  // ---------- filters (slice 3) ----------
  // A filter narrows the SOURCE rows before anything computes — the pivot, every
  // chart basis, and the status row count all see the same filtered set. Two
  // kinds, picked by the field's guessed type: "in" (a value multi-select;
  // values:null means "everything" — a freshly added filter is a no-op until
  // edited) and "range" (numeric min/max; an empty bound is unbounded).
  function bdAddFilter(col) {
    if (!BD.run || bdEff().cols.indexOf(col) < 0) return;
    if (BD.filters.some(function (f) { return f.col === col; })) return;
    var numeric = bdFieldKind(col) === "Numeric";
    BD.filters.push(numeric ? { col: col, kind: "range", min: "", max: "" } : { col: col, kind: "in", values: null });
    render();
  }
  function bdRemoveFilter(col) {
    BD.filters = BD.filters.filter(function (f) { return f.col !== col; });
    render();
  }
  function bdFilterActive(f) {
    if (f.kind === "range") return f.min !== "" || f.max !== "";
    return Array.isArray(f.values);
  }
  function bdFilterSummary(f) {
    if (!bdFilterActive(f)) return "all";
    if (f.kind === "range") {
      if (f.min !== "" && f.max !== "") return f.min + " – " + f.max;
      return f.min !== "" ? "≥ " + f.min : "≤ " + f.max;
    }
    return f.values.length + " value" + (f.values.length === 1 ? "" : "s");
  }
  function bdFilteredRows(st) {
    st = st || BD;
    if (!st.run) return [];
    var active = st.filters.filter(bdFilterActive);
    var eff = bdEff(st);
    if (!active.length) return eff.rows;
    var idx = {};
    eff.cols.forEach(function (c, i) { idx[c] = i; });
    return eff.rows.filter(function (r) {
      return active.every(function (f) {
        var v = r[idx[f.col]];
        if (f.kind === "range") {
          var num = parseFloat(String(v));
          if (isNaN(num)) return false;
          if (f.min !== "" && num < parseFloat(f.min)) return false;
          if (f.max !== "" && num > parseFloat(f.max)) return false;
          return true;
        }
        return f.values.indexOf(String(v)) >= 0;
      });
    });
  }
  // Distinct values of a column across the UNFILTERED rows (so the editor always
  // offers the full universe), capped for sanity.
  function bdDistinct(col) {
    if (!BD.run) return [];
    var eff = bdEff();
    var i = eff.cols.indexOf(col), seen = {}, out = [];
    if (i < 0) return out;
    eff.rows.forEach(function (r) {
      var v = String(r[i]);
      if (!seen[v]) { seen[v] = true; out.push(v); }
    });
    out.sort();
    return out.slice(0, 200);
  }
  function openFilterEditor(f) {
    D.modal("Filter · " + f.col, function (b) {
      var wrap = D.el("div", "bd-flt");
      if (f.kind === "range") {
        var row = D.el("div"); row.style.cssText = "display:flex;gap:10px;align-items:center";
        var minI = D.el("input"); minI.type = "number"; minI.value = f.min; minI.placeholder = "min (blank = any)"; minI.setAttribute("aria-label", "Minimum");
        var dash = D.el("span"); dash.textContent = "–"; dash.style.color = "var(--faint)";
        var maxI = D.el("input"); maxI.type = "number"; maxI.value = f.max; maxI.placeholder = "max (blank = any)"; maxI.setAttribute("aria-label", "Maximum");
        row.appendChild(minI); row.appendChild(dash); row.appendChild(maxI);
        wrap.appendChild(row);
        var foot = D.el("div"); foot.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:14px";
        var clear = D.el("button", "btn"); clear.type = "button"; clear.textContent = "Clear";
        var apply = D.el("button", "btn primary"); apply.type = "button"; apply.textContent = "Apply";
        clear.onclick = function () { f.min = ""; f.max = ""; wrap.closest(".modal-ov").remove(); render(); };
        apply.onclick = function () { f.min = minI.value.trim(); f.max = maxI.value.trim(); wrap.closest(".modal-ov").remove(); render(); };
        foot.appendChild(clear); foot.appendChild(apply);
        wrap.appendChild(foot);
      } else {
        var vals = bdDistinct(f.col);
        var picked = Array.isArray(f.values) ? f.values.slice() : vals.slice(); // "all" edits as everything checked
        var search = D.el("input", "search"); search.type = "search"; search.placeholder = "Filter values…"; search.setAttribute("aria-label", "Filter the value list");
        wrap.appendChild(search);
        var listBox = D.el("div", "bd-flt-list");
        wrap.appendChild(listBox);
        function paint() {
          var q = (search.value || "").toLowerCase();
          listBox.innerHTML = "";
          vals.filter(function (v) { return !q || v.toLowerCase().indexOf(q) >= 0; }).forEach(function (v) {
            var lab = D.el("label", "bd-flt-row");
            var cb = D.el("input"); cb.type = "checkbox"; cb.checked = picked.indexOf(v) >= 0; cb.value = v;
            cb.onchange = function () {
              if (cb.checked) { if (picked.indexOf(v) < 0) picked.push(v); }
              else picked = picked.filter(function (x) { return x !== v; });
            };
            var tx = D.el("span"); tx.textContent = v;
            lab.appendChild(cb); lab.appendChild(tx); listBox.appendChild(lab);
          });
        }
        search.oninput = paint;
        paint();
        var foot2 = D.el("div"); foot2.style.cssText = "display:flex;justify-content:space-between;gap:8px;margin-top:14px";
        var bulk = D.el("div"); bulk.style.cssText = "display:flex;gap:8px";
        var allB = D.el("button", "btn"); allB.type = "button"; allB.textContent = "All";
        var noneB = D.el("button", "btn"); noneB.type = "button"; noneB.textContent = "None";
        allB.onclick = function () { picked = vals.slice(); paint(); };
        noneB.onclick = function () { picked = []; paint(); };
        bulk.appendChild(allB); bulk.appendChild(noneB);
        var apply2 = D.el("button", "btn primary"); apply2.type = "button"; apply2.textContent = "Apply";
        apply2.onclick = function () {
          // everything checked = back to the "all" no-op state, not a frozen value list
          f.values = picked.length === vals.length ? null : picked.slice();
          wrap.closest(".modal-ov").remove(); render();
        };
        foot2.appendChild(bulk); foot2.appendChild(apply2);
        wrap.appendChild(foot2);
      }
      b.appendChild(wrap);
    });
  }

  // ⇄ — move a field to the other shelf. Rows-shelf fields are always
  // dimensions; a numeric moved back to Columns regains its SUM default.
  function bdMoveField(col) {
    var i;
    for (i = 0; i < BD.shelfCols.length; i++) if (BD.shelfCols[i].col === col) {
      BD.shelfCols.splice(i, 1); BD.shelfRows.push({ col: col }); render(); return;
    }
    for (i = 0; i < BD.shelfRows.length; i++) if (BD.shelfRows[i].col === col) {
      BD.shelfRows.splice(i, 1);
      BD.shelfCols.push({ col: col, agg: bdDefaultAgg(col) });
      render(); return;
    }
  }

  // VB-2 (View Builder overnight queue): drag a shelf pill anywhere — between
  // Columns/Rows/Filters (converting shape per destination, same as the ⇄
  // button/bdAddFilter would) or to a new position within its own shelf.
  // `hint` (from the hovered chip's dragover — see wire()) is { shelf, col,
  // before } and decides the insertion index; missing/stale hints append.
  function bdShelfArray(shelf) {
    if (shelf === "cols") return BD.shelfCols;
    if (shelf === "rows") return BD.shelfRows;
    if (shelf === "filters") return BD.filters;
    if (shelf === "color") return BD.shelfColor;
    return null;
  }
  function bdInsertIndex(arr, hint, toShelf, skipCol) {
    if (!hint || hint.shelf !== toShelf || hint.col === skipCol) return arr.length;
    for (var i = 0; i < arr.length; i++) if (arr[i].col === hint.col) return hint.before ? i : i + 1;
    return arr.length;
  }
  function bdMoveFieldTo(col, fromShelf, toShelf, hint) {
    var fromArr = bdShelfArray(fromShelf);
    if (!fromArr) return;
    var idx = -1;
    for (var k = 0; k < fromArr.length; k++) if (fromArr[k].col === col) { idx = k; break; }
    if (idx < 0) return;

    if (fromShelf === toShelf) {
      var rec = fromArr[idx];
      fromArr.splice(idx, 1);
      fromArr.splice(bdInsertIndex(fromArr, hint, toShelf, col), 0, rec);
      render();
      return;
    }

    if (toShelf === "filters") {
      fromArr.splice(idx, 1);
      if (!BD.filters.some(function (f) { return f.col === col; })) {
        var flt = bdFieldKind(col) === "Numeric" ? { col: col, kind: "range", min: "", max: "" } : { col: col, kind: "in", values: null };
        BD.filters.splice(bdInsertIndex(BD.filters, hint, toShelf, col), 0, flt);
      }
      render();
      return;
    }

    if (toShelf === "color") {
      fromArr.splice(idx, 1);
      BD.shelfColor = [{ col: col }]; // only one Color field at a time — replaces any prior pick
      render();
      return;
    }

    // filters and shelves track independently (a column can be both plotted AND
    // filtered) — dragging a filter pill onto a shelf it's already on just drops
    // the filter rather than writing a duplicate shelf entry.
    if (fromShelf === "filters" && bdOnShelf(col)) {
      fromArr.splice(idx, 1);
      render();
      return;
    }

    fromArr.splice(idx, 1);
    var toArr = bdShelfArray(toShelf);
    var newRec = toShelf === "rows" ? { col: col } : { col: col, agg: bdDefaultAgg(col) };
    toArr.splice(bdInsertIndex(toArr, hint, toShelf, col), 0, newRec);
    render();
  }

  // ---------- the pivot engine (PURE — unit-tested directly) ----------
  function aggInit() { return { n: 0, sum: 0, min: null, max: null, vals: [] }; }
  function aggAdd(a, v) {
    a.n++;
    var num = parseFloat(String(v));
    if (v == null || v === "" || isNaN(num)) return;
    a.sum += num;
    a.min = a.min == null ? num : Math.min(a.min, num);
    a.max = a.max == null ? num : Math.max(a.max, num);
    a.vals.push(num);
  }
  function aggOut(a, fn) {
    if (fn === "count") return a.n;
    if (!a.vals.length) return null;
    if (fn === "sum") return a.sum;
    if (fn === "avg") return a.sum / a.vals.length;
    if (fn === "min") return a.min;
    if (fn === "max") return a.max;
    if (fn === "median") {
      var s = a.vals.slice().sort(function (x, y) { return x - y; });
      var mid = s.length >> 1;
      return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    }
    return null;
  }
  function aggLabel(f) { return f.agg.toUpperCase() + " " + f.col; }
  var MAX_BODY_ROWS = 200, MAX_XTAB_COLS = 30;

  // compute(cols, rows, shelfCols, shelfRows) → null (nothing on the shelves) or
  //   { head:[labels], rows:[[cells]], headGroups?, truncatedRows?, truncatedCols? }
  // - no Rows fields, no aggregated fields → plain projection of the picked columns
  // - no Rows fields, aggregated fields present → grouped rollup (group by the
  //   non-aggregated shelf fields; a shelf of only measures = one total row)
  // - Rows fields present → crosstab: Rows fields nest down the side, the FIRST
  //   non-aggregated Columns field pivots across the top, measures fill the
  //   cells (COUNT of rows when no measure is picked), plus a Total column.
  function compute(cols, rows, shelfCols, shelfRows) {
    shelfCols = shelfCols || []; shelfRows = shelfRows || [];
    if (!shelfCols.length && !shelfRows.length) return null;
    var idx = {};
    cols.forEach(function (c, i) { idx[c] = i; });
    var measures = shelfCols.filter(function (f) { return f.agg; });
    var dims = shelfCols.filter(function (f) { return !f.agg; });
    var KEY = "";

    if (!shelfRows.length) {
      if (!measures.length) {
        // plain SELECT of the picked columns
        var head = dims.map(function (f) { return f.col; });
        var body = rows.slice(0, MAX_BODY_ROWS).map(function (r) {
          return dims.map(function (f) { return r[idx[f.col]]; });
        });
        return { head: head, rows: body, truncatedRows: rows.length > MAX_BODY_ROWS ? rows.length - MAX_BODY_ROWS : 0 };
      }
      // grouped rollup
      var groups = {}, order = [];
      rows.forEach(function (r) {
        var key = dims.map(function (f) { return String(r[idx[f.col]]); }).join(KEY);
        if (!groups[key]) { groups[key] = { dims: dims.map(function (f) { return r[idx[f.col]]; }), aggs: measures.map(aggInit) }; order.push(key); }
        measures.forEach(function (f, mi) { aggAdd(groups[key].aggs[mi], r[idx[f.col]]); });
      });
      var head2 = dims.map(function (f) { return f.col; }).concat(measures.map(aggLabel));
      var body2 = order.slice(0, MAX_BODY_ROWS).map(function (key) {
        var g = groups[key];
        return g.dims.concat(measures.map(function (f, mi) { return aggOut(g.aggs[mi], f.agg); }));
      });
      return { head: head2, rows: body2, truncatedRows: order.length > MAX_BODY_ROWS ? order.length - MAX_BODY_ROWS : 0 };
    }

    // crosstab
    var rowDims = shelfRows;
    var colDim = dims[0] || null;                       // the first plain Columns field pivots across the top
    var ms = measures.length ? measures : [{ col: rowDims[0].col, agg: "count" }]; // no measure picked → COUNT of rows
    var colVals = [], colSeen = {};
    if (colDim) rows.forEach(function (r) {
      var v = String(r[idx[colDim.col]]);
      if (!colSeen[v]) { colSeen[v] = true; colVals.push(v); }
    });
    colVals.sort();
    var truncatedCols = 0;
    if (colVals.length > MAX_XTAB_COLS) { truncatedCols = colVals.length - MAX_XTAB_COLS; colVals = colVals.slice(0, MAX_XTAB_COLS); }
    var groups3 = {}, order3 = [];
    rows.forEach(function (r) {
      var key = rowDims.map(function (f) { return String(r[idx[f.col]]); }).join(KEY);
      if (!groups3[key]) {
        groups3[key] = { dims: rowDims.map(function (f) { return r[idx[f.col]]; }), cells: {}, totals: ms.map(aggInit) };
        order3.push(key);
      }
      var g = groups3[key];
      ms.forEach(function (f, mi) { aggAdd(g.totals[mi], r[idx[f.col]]); });
      if (colDim) {
        var cv = String(r[idx[colDim.col]]);
        if (!colSeen[cv] || colVals.indexOf(cv) < 0) return; // beyond the column cap
        if (!g.cells[cv]) g.cells[cv] = ms.map(aggInit);
        ms.forEach(function (f, mi) { aggAdd(g.cells[cv][mi], r[idx[f.col]]); });
      }
    });
    var mLabels = ms.map(function (f) { return f.agg === "count" && !measures.length ? "COUNT rows" : aggLabel(f); });
    var head3 = rowDims.map(function (f) { return f.col; });
    var headGroups = null;
    if (colDim) {
      if (ms.length === 1) {
        head3 = head3.concat(colVals).concat(["Total"]);
      } else {
        headGroups = rowDims.map(function (f) { return { label: f.col, span: 1, lead: true }; })
          .concat(colVals.map(function (v) { return { label: v, span: ms.length }; }))
          .concat([{ label: "Total", span: ms.length }]);
        colVals.forEach(function () { head3 = head3.concat(mLabels); });
        head3 = head3.concat(mLabels);
      }
    } else {
      head3 = head3.concat(mLabels);
    }
    var body3 = order3.slice(0, MAX_BODY_ROWS).map(function (key) {
      var g = groups3[key], out = g.dims.slice();
      if (colDim) {
        colVals.forEach(function (v) {
          ms.forEach(function (f, mi) { out.push(g.cells[v] ? aggOut(g.cells[v][mi], f.agg) : null); });
        });
      }
      ms.forEach(function (f, mi) { out.push(aggOut(g.totals[mi], f.agg)); });
      return out;
    });
    return {
      head: head3, rows: body3, headGroups: headGroups,
      truncatedRows: order3.length > MAX_BODY_ROWS ? order3.length - MAX_BODY_ROWS : 0,
      truncatedCols: truncatedCols
    };
  }

  // ---------- charting the result (#117 slice 2, multi-series slice 5, VB-4 slice 2) ----------
  // Each chart draws from a deliberately SIMPLE, ordered "chart basis" table so
  // Studio.newPanel's column-order defaults map it with no bespoke wiring:
  //   bars/donut      → [first dimension, first measure]  (rollup by that dim)
  //   line/stacked/    the same single-series basis by default, WIDENED to
  //   areaStacked   →  [dimension, series1, series2, …] when the shelves land
  //                     in one of two multi-series shapes (bdLineSeriesBasis).
  //                     Stacked bars and Stacked area share Line's exact basis
  //                     shape in Studio's own chart registry (fields: [labelCol,
  //                     series]) — VB-4 slice 2 just adds them to the same
  //                     widening path rather than reinventing it.
  //   heatmap         → [first Rows dim, first Columns dim, measure]  (the
  //                      crosstab's own long form — rowCol/colCol/valueCol)
  //   choropleth      → [first dimension, measure]  (idCol/valueCol; the SAME
  //                      basis shape as bars/donut), widened to [dimension,
  //                      Color field, measure] (idCol/seriesCol/valueCol —
  //                      the SAME long form heatmap already computes) when a
  //                      Color field is set, so the map can join the Studio
  //                      ensemble-channel machinery bars/donut have no use for.
  //   scatter         → [dimension, measure1, measure2]  (labelCol/xCol/yCol —
  //                      Studio.newPanel's scatter mapping reads cols[0..2] in
  //                      that exact order) — one point per dimension value,
  //                      needs TWO measures instead of bars/donut's one.
  // The first dimension prefers the Rows shelf; with no measure picked, COUNT
  // of rows keeps every chart honest instead of refusing to draw. Table stays
  // the full pivot. Charting more of bars/donut (they have no native
  // multi-series form in this app) is a later slice.
  var CHART_TYPES = [
    { t: "table", label: "Table" },
    { t: "bars", label: "Bars" },
    { t: "stacked", label: "Stacked bars" },
    { t: "line", label: "Line" },
    { t: "areaStacked", label: "Stacked area" },
    { t: "donut", label: "Donut" },
    { t: "heatmap", label: "Heatmap" },
    { t: "choropleth", label: "Map" },
    { t: "scatter", label: "Scatter" },
    { t: "kpi", label: "KPI" },
  ];
  // The chart types that share Line's [labelCol, series] basis shape and its
  // multi-series widening (bdLineSeriesBasis) — kept as one list so chartBasis
  // and bdPanelFor can't drift on which types get the treatment.
  var LINE_SHAPED_TYPES = ["line", "stacked", "areaStacked"];
  function bdFirstDim(st) {
    st = st || BD;
    return st.shelfRows[0] || st.shelfCols.filter(function (f) { return !f.agg; })[0] || null;
  }
  // VB-10: keep BD.mapScale a live guess (Studio.guessRegionScale, off the current
  // geo-dimension column) while the user hasn't picked one manually — mirrors QV-1's
  // "guess on (re)pick, manual choice always wins after" rule from render() so every
  // shelf edit refreshes the guess without ever clobbering an explicit pick.
  function bdRefreshMapScaleGuess() {
    if (BD.chartType !== "choropleth" || !BD.mapScaleAuto) return;
    var dim = bdFirstDim(BD);
    BD.mapScale = (dim && Studio.guessRegionScale(dim.col, BD.run)) || "";
  }
  function bdMapScale(st) { return (st || BD).mapScale || "county"; }
  function bdColsDim(st) { return (st || BD).shelfCols.filter(function (f) { return !f.agg; })[0] || null; }
  function bdMeasures(st) { return (st || BD).shelfCols.filter(function (f) { return f.agg; }); }
  function bdFirstMeasure(st) {
    var m = bdMeasures(st)[0];
    if (m) return m;
    var d = bdFirstDim(st);
    return d ? { col: d.col, agg: "count" } : null;
  }
  // Why a chart type can't draw yet — "" when it can. Doubles as the disabled tooltip.
  function chartUnavailable(type, st) {
    st = st || BD;
    if (type === "table") return "";
    if (!st.run) return "Pick a dataset first";
    if (type === "kpi") {
      // Unlike the dimension-based chart types below, a KPI has no breakdown —
      // it's a single rolled-up number, so any measure (or even just a bare
      // field falling back to COUNT via bdFirstMeasure) is enough to draw one.
      return bdFirstMeasure(st) ? "" : "Needs a field on a shelf";
    }
    if (type === "heatmap") {
      if (!st.shelfRows[0] || !bdColsDim(st)) return "Needs a field on Rows and a plain field on Columns";
      return "";
    }
    if (type === "scatter") {
      if (!bdFirstDim(st)) return "Needs at least one non-aggregated field on a shelf";
      if (bdMeasures(st).length < 2) return "Needs two measures (aggregated fields)";
      return "";
    }
    if (!bdFirstDim(st)) return "Needs at least one non-aggregated field on a shelf";
    return "";
  }
  function chartBasis(type, st) {
    st = st || BD;
    if (!st.run || chartUnavailable(type, st)) return null;
    var m = bdFirstMeasure(st), rows = bdFilteredRows(st);
    if (type === "kpi") {
      // No dimension at all — compute()'s own "no shelfRows + one measure, no
      // dims" path already collapses to a single grand-total row (the exact
      // shape Studio.newKpi's valueCol expects), so this rides the same pivot
      // engine as every other basis with zero new logic.
      return compute(bdEff(st).cols, rows, [m], []);
    }
    if (type === "heatmap") {
      return compute(bdEff(st).cols, rows,
        [{ col: st.shelfRows[0].col, agg: null }, { col: bdColsDim(st).col, agg: null }, m], []);
    }
    if (LINE_SHAPED_TYPES.indexOf(type) >= 0) {
      var series = bdLineSeriesBasis(rows, st);
      if (series) return series;
    }
    var dim = bdFirstDim(st);
    if (type === "scatter") {
      // Two measures, one point per dimension value — the same [dim, m1, m2]
      // shape Studio.newPanel's scatter mapping expects positionally (cols[0]
      // = labelCol, cols[1] = xCol, cols[2] = yCol), so no bdPanelFor wiring
      // is needed beyond the default Studio.newPanel(type, da) call below.
      var ms2 = bdMeasures(st).slice(0, 2);
      return compute(bdEff(st).cols, rows, [{ col: dim.col, agg: null }].concat(ms2), []);
    }
    if (type === "choropleth") {
      // VB-4: a map is a single-dimension chart too (idCol/valueCol, same shape
      // as bars/donut) — but "color by" here means a SERIES to join the Studio
      // ensemble channel with (toggle providers, re-color live), not a per-bar
      // tint, so it widens the basis into the heatmap's long [id, series,
      // value] form instead of bars/donut's "first-seen tag" widening below.
      var mapCf = bdColorField(st);
      if (mapCf) return compute(bdEff(st).cols, rows, [{ col: dim.col, agg: null }, { col: mapCf.col, agg: null }, m], []);
      return compute(bdEff(st).cols, rows, [{ col: dim.col, agg: null }, m], []);
    }
    var basis = compute(bdEff(st).cols, rows, [{ col: dim.col, agg: null }, m], []);
    // VB-3: bars/donut are single-dimension charts, so "color by" only ever needs
    // ONE value per already-charted category — when the Color field IS that
    // dimension it's a no-op tag (colorCol = the column already there); when it's
    // a different, presumably-correlated field (e.g. dim=State, color=Region) we
    // widen the basis with that field's FIRST-SEEN value per category rather than
    // re-grouping by it (which would fan a bar chart out into duplicate rows).
    if (basis && (type === "bars" || type === "donut")) {
      var cf = bdColorField(st);
      if (cf) {
        basis.colorCol = cf.col;
        if (cf.col !== dim.col) {
          var cmap = bdFirstSeenMap(rows, dim.col, cf.col, st);
          basis.head = basis.head.concat([cf.col]);
          basis.rows = basis.rows.map(function (r) {
            var k = String(r[0]);
            return r.concat([k in cmap ? cmap[k] : null]);
          });
        }
      }
    }
    return basis;
  }
  // First-seen colVal for each distinct keyVal across rows — used to attach a
  // "color by" field's value to a rollup it wasn't grouped by (VB-3 chartBasis).
  function bdFirstSeenMap(rows, keyCol, colCol, st) {
    var idx = {};
    bdEff(st || BD).cols.forEach(function (c, i) { idx[c] = i; });
    var ki = idx[keyCol], ci = idx[colCol], map = {};
    if (ki == null || ci == null) return map;
    rows.forEach(function (r) {
      var k = String(r[ki]);
      if (!(k in map)) map[k] = r[ci];
    });
    return map;
  }
  // Multi-dim series charting (#117 slice 5): line charts the FULL shelf
  // breakdown instead of collapsing to one dimension + one measure, in the
  // two shapes that land cleanly on a wide [label, series1, series2, …]
  // table — reusing the SAME pivot engine the table/heatmap already compute
  // with, just read as columns-are-series instead of columns-are-columns:
  //   - a crosstab (one Rows dim × one plain Columns dim, 0-1 measures) —
  //     each Columns value becomes its own line (the crosstab's own "Total"
  //     column is dropped; it would double as a redundant flat series).
  //   - no Rows, exactly one dimension + 2+ measures — each measure becomes
  //     its own line, grouped by that one dimension.
  // Anything richer (2+ Rows dims, a crosstab with 2+ measures) falls back
  // to the plain single-series basis below — same honesty convention as the
  // pivot's own truncation notes; charting those shapes is later work.
  function bdLineSeriesBasis(rows, st) {
    st = st || BD;
    var dims = st.shelfCols.filter(function (f) { return !f.agg; });
    var measures = bdMeasures(st);
    var colsDim = bdColsDim(st);
    // VB-3: with no plain field on Columns to pivot across, the Color shelf's
    // field stands in as the split — so "color by X" alone is enough to turn a
    // single-series line into one line per X value, with no need to also park X
    // on Columns.
    var cf = !colsDim ? bdColorField(st) : null;
    if (st.shelfRows.length === 1 && (colsDim || cf) && measures.length <= 1) {
      var pivotCols = cf ? st.shelfCols.concat([{ col: cf.col, agg: null }]) : st.shelfCols;
      var xtab = compute(bdEff(st).cols, rows, pivotCols, st.shelfRows);
      if (xtab && !xtab.headGroups) {
        return {
          head: xtab.head.slice(0, -1), // drop the trailing crosstab "Total" column
          rows: xtab.rows.map(function (r) { return r.slice(0, -1); }),
          truncatedRows: xtab.truncatedRows, truncatedCols: xtab.truncatedCols
        };
      }
    }
    if (!st.shelfRows.length && dims.length === 1 && measures.length >= 2) {
      return compute(bdEff(st).cols, rows, st.shelfCols, []);
    }
    return null;
  }
  // Both the live preview and Save build the panel the same way — when the
  // basis is wider than [label, value] for a line-shaped chart (bdLineSeriesBasis
  // above), map every extra column as its own series instead of newPanel's
  // single-series default, so the two never drift on how a multi-series
  // basis becomes a chart spec. Stacked bars/area ride the same code path as
  // Line — Studio.newPanel already treats them identically (see model.js).
  function bdPanelFor(type, da, basis) {
    var p = Studio.newPanel(type, da);
    if (LINE_SHAPED_TYPES.indexOf(type) >= 0 && basis.head.length > 2) {
      p.chart.map.series = basis.head.slice(1).map(function (col) { return { col: col }; });
    }
    if ((type === "bars" || type === "donut") && basis.colorCol) {
      p.chart.map.colorCol = basis.colorCol; // VB-3 — see studio-render.js's colorCol handling
    }
    if (type === "choropleth") {
      // Studio.newPanel's choropleth branch NAME-GUESSES idCol/valueCol/seriesCol
      // (Studio.guessChoroplethCols) — fine for a dataset's own real column names,
      // but the basis's measure column is a synthesized "SUM x" label that guess
      // can misjudge. chartBasis built this basis positionally, so map it back the
      // same way (dead certain, no guessing): [id, value] or [id, series, value].
      p.chart.map.idCol = basis.head[0];
      if (basis.head.length > 2) { p.chart.map.seriesCol = basis.head[1]; p.chart.map.valueCol = basis.head[2]; }
      else { delete p.chart.map.seriesCol; p.chart.map.valueCol = basis.head[1]; }
      // VB-10: newPanel's opts.scale always defaults to "county" — apply the
      // builder's own Region scale (guessed or manually picked) instead.
      p.chart.opts.scale = bdMapScale();
    }
    return p;
  }
  // VB-4 remaining major: KPI. Structurally different from every other chart
  // type here — a KPI tile lives in spec.kpis, not spec.panels, so it gets its
  // own tiny constructor instead of bdPanelFor/Studio.newPanel. Studio.newKpi
  // already reads valueCol off daDef.columns[0], and the kpi basis (above) is
  // always a single [label] column, so this is exactly Studio's own "add a KPI
  // from a data access" convention (studio.js's addFromCurrentOrPrompt/
  // renderKpiInspector: newKpi(da) then guessFmt(k.valueCol)) — no new mapping.
  function bdKpiFor(da) {
    var k = Studio.newKpi(da);
    k.label = BD.panelTitle || BD.name || BD.dsName || "Metric"; // VB-7
    k.fmt = Studio.guessFmt(k.valueCol);
    return k;
  }
  // The live chart preview is the REAL dashboard renderer — the same
  // buildHtml(spec, assets, { preview, mock }) srcdoc-iframe path Explore's
  // preview uses, with the COMPUTED basis rows injected as the mock so what
  // you see is the actual pivot, not fabricated sample data.
  var _bdPvTimer = null;
  function renderChartPreview(result) {
    var basis = chartBasis(BD.chartType);
    if (!basis) { result.innerHTML = '<div class="bd-cta">' + esc(chartUnavailable(BD.chartType) || "Nothing to chart yet.") + "</div>"; return; }
    clearTimeout(_bdPvTimer);
    _bdPvTimer = setTimeout(function () {
      var da = { id: "build_result", name: BD.name || "Build result", kind: "sql", sql: "", query: "", columns: basis.head.slice(), params: [], authored: true };
      var title = BD.panelTitle || BD.name || BD.dsName || "View"; // VB-7: panel title wins when set
      var spec = {
        id: "build-preview", name: "build-preview", title: title, hideHeader: true,
        dashboardTheme: D.defaultDashboardTheme(),
        paletteKey: BD.paletteKey || "", // VB-3 — Studio's own series-palette-preset system
        panels: [], kpis: [], filters: [],
        cda: { connections: [], dataAccesses: [da] }
      };
      if (BD.chartType === "kpi") {
        spec.kpis = [bdKpiFor(da)];
      } else {
        var p = bdPanelFor(BD.chartType, da, basis);
        p.title = title; p.span = "full";
        spec.panels = [p];
      }
      var mock = { build_result: { cols: basis.head, rows: basis.rows } };
      function paint() {
        var html = Studio.buildHtml(spec, D.getAssets(), { preview: true, mock: mock, launcher: false });
        var ifr = result.querySelector("iframe.bd-ifr");
        if (!ifr) {
          result.innerHTML = "";
          ifr = document.createElement("iframe");
          ifr.className = "bd-ifr"; ifr.title = "Chart preview"; ifr.setAttribute("aria-label", "Chart preview");
          result.appendChild(ifr);
        }
        D.postThemeOnLoad(ifr);
        ifr.srcdoc = html;
      }
      // VB-4: a choropleth panel needs its geometry inlined before buildHtml can
      // draw it — same lazy fetch-once/cache-forever path Studio's own dashboard
      // preview uses (studio.js's doRefresh/ensureGeoAssets).
      if (Studio.geoAssetKeys(spec).length) D.ensureGeoAssets(spec).then(paint); else paint();
    }, 150);
  }

  function fmtCell(v) {
    if (v == null) return "·";
    if (typeof v === "number") {
      var r = Math.round(v * 100) / 100;
      return r.toLocaleString();
    }
    return String(v);
  }

  // ---------- render ----------
  function fieldChipHtml(f, shelf) {
    var kindCls = f.agg ? " bd-measure" : "";
    // VB-6: a numeric field on Columns always gets the aggregation dropdown —
    // even while it's currently a dimension — so it can flip to CATEGORY
    // (group-by, no aggregation) and back. Non-numeric fields can never be
    // measures, so they keep the old plain-chip look (no dropdown).
    var numericOnCols = shelf === "cols" && bdFieldKind(f.col) === "Numeric";
    var agg = f.agg || numericOnCols
      ? '<select class="bd-agg" data-bd-agg="' + esc(f.col) + '" aria-label="Aggregation for ' + esc(f.col) + '">' +
          AGGS.map(function (a) { return '<option value="' + a + '"' + (a === f.agg ? " selected" : "") + '>' + a.toUpperCase() + "</option>"; }).join("") +
          (numericOnCols ? '<option value="category"' + (!f.agg ? " selected" : "") + '>CATEGORY</option>' : "") +
        "</select>"
      : "";
    return '<span class="bd-chip' + kindCls + '" data-bd-chip="' + esc(f.col) + '" draggable="true">' + agg +
      '<span class="bd-chip-nm">' + esc(f.col) + '</span>' +
      '<button type="button" class="bd-chip-move" data-bd-move="' + esc(f.col) + '" title="Move to the ' + (shelf === "cols" ? "Rows" : "Columns") + ' shelf" aria-label="Move ' + esc(f.col) + ' to the ' + (shelf === "cols" ? "Rows" : "Columns") + ' shelf">⇄</button>' +
      '<button type="button" class="bd-chip-rm" data-bd-rm="' + esc(f.col) + '" title="Remove" aria-label="Remove ' + esc(f.col) + '">✕</button></span>';
  }

  function render() {
    var sec = document.getElementById("secBuild");
    if (!sec) return;

    bdRefreshMapScaleGuess(); // VB-10: keep the Region scale guess current before painting

    // VB-5: the cross-editor notice — a View made in the other editor was opened
    // here best-effort; dismissible, cleared on New/next load.
    var noticeBox = $("#buildNotice", sec);
    if (noticeBox) {
      if (BD.notice) {
        noticeBox.hidden = false;
        noticeBox.innerHTML = '<span class="bd-notice-txt">' + esc(BD.notice) + "</span>" +
          '<button type="button" class="bd-notice-x" id="bdNoticeDismiss" title="Dismiss" aria-label="Dismiss this notice">✕</button>';
        var nx = $("#bdNoticeDismiss", noticeBox);
        if (nx) nx.onclick = function () { BD.notice = ""; render(); };
      } else {
        noticeBox.hidden = true;
        noticeBox.innerHTML = "";
      }
    }

    // LEFT — dataset outline (VB-1: Explore-navigator parity — search box, folder
    // tree with collapsible branches, sample-set grouping, per-row icons, stacked
    // readable labels with full-name tooltips, and ws manage ops on hover)
    var outline = $("#buildOutline", sec);
    if (outline) {
      var dss = bdDatasets();
      var bq = _bdQ.trim().toLowerCase();
      function bdDsRowHtml(d) {
        var key = d.kind + BD_SEP + d.id;
        var sel = BD.dsKind === d.kind && BD.dsId === d.id;
        var open = sel || !!BD.outlineOpen[key];
        var colsHtml = open && sel && BD.run
          ? '<div class="bd-ol-cols">' + bdEff().cols.map(function (c) {
              var used = bdOnShelf(c);
              var numeric = bdFieldKind(c) === "Numeric";
              var calc = bdIsCalc(c);
              return '<button type="button" class="bd-col' + (used ? " used" : "") + (numeric ? " num" : "") + (calc ? " calc" : "") +
                '" draggable="true" data-bd-col="' + esc(c) + '" title="' + (calc ? "Calculated column — " : "") + (used ? "Already on a shelf" : "Add to the Columns shelf (drag for Rows)") + '">' +
                '<span class="bd-col-k">' + (calc ? "=" : numeric ? "#" : "a") + '</span>' + esc(c) + "</button>";
            }).join("") +
            '<button type="button" class="bd-col bd-col-calc" id="bdCalcBtn" title="Define calculated columns (=[colA] / [colB])">＋ calc…</button>' +
            "</div>"
          : "";
        // full name in the title: the pane is narrow, ellipsized labels need the
        // native-tooltip escape hatch (same fix family as Explore's saved rows)
        var acts = d.kind === "ws"
          ? '<span class="bd-ol-acts">' +
              '<button type="button" class="bd-ol-act" data-bd-ds-edit="' + esc(d.id) + '" title="Edit dataset" aria-label="Edit dataset ' + esc(d.name) + '">✎</button>' +
              '<button type="button" class="bd-ol-act" data-bd-ds-copy="' + esc(d.id) + '" title="Copy dataset" aria-label="Copy dataset ' + esc(d.name) + '">⧉</button>' +
              '<button type="button" class="bd-ol-act" data-bd-ds-del="' + esc(d.id) + '" title="Delete dataset" aria-label="Delete dataset ' + esc(d.name) + '">✕</button>' +
            '</span>'
          : "";
        return '<div class="bd-ol' + (sel ? " sel" : "") + '" data-bd-ds-kind="' + esc(d.kind) + '" data-bd-ds-id="' + esc(d.id) + '">' +
          '<div class="bd-ol-row">' +
          '<button type="button" class="bd-ol-head" data-bd-ds="' + esc(key) + '" title="' + esc(d.name) + ' — ' + esc(d.sub) + '">' +
            '<span class="bd-ol-car">' + (open ? "▾" : "▸") + '</span>' +
            '<span class="bd-ol-ic" data-bd-ic="' + (d.kind === "ws" ? "db" : "cube") + '"></span>' +
            '<span class="bd-ol-txt"><b>' + esc(d.name) + '</b><small>' + esc(d.sub) + "</small></span></button>" +
          acts + "</div>" + colsHtml +
          "</div>";
      }
      function bdTreeHeadHtml(path, label, n, collapsed) {
        return '<button type="button" class="bd-tree-h" data-bd-tree="' + esc(path) + '" aria-expanded="' + (!collapsed) + '">' +
          '<span class="bd-ol-car">' + (collapsed ? "▸" : "▾") + '</span><span class="bd-tree-lbl">' + esc(label) + '</span>' +
          '<span class="bd-tree-n">' + n + "</span></button>";
      }
      if (!dss.length) {
        outline.innerHTML = '<div class="bd-empty">No datasets yet — hit ＋ New above, or install a Sample pack.</div>';
      } else if (bq) {
        // a search query flattens the tree (Explore convention): finding by name
        // never depends on knowing where something is filed
        var hits = dss.filter(function (d) {
          return (d.name + " " + d.sub + " " + (d.cols || []).join(" ")).toLowerCase().indexOf(bq) >= 0;
        });
        outline.innerHTML = hits.length ? hits.slice(0, 60).map(bdDsRowHtml).join("")
          : '<div class="bd-empty">No datasets match.</div>';
      } else {
        var wsShown = dss.filter(function (d) { return d.kind === "ws"; });
        var sampleShown = dss.filter(function (d) { return d.kind === "sample"; });
        var bdRoot = { kids: {}, rows: [] };
        wsShown.forEach(function (d) {
          var node = bdRoot;
          (d.folder ? d.folder.split("/") : []).forEach(function (seg) {
            seg = seg.trim(); if (!seg) return;
            node = node.kids[seg] || (node.kids[seg] = { kids: {}, rows: [] });
          });
          node.rows.push(d);
        });
        function bdCount(n) { return n.rows.length + Object.keys(n.kids).reduce(function (s, k) { return s + bdCount(n.kids[k]); }, 0); }
        function bdRenderNode(n, path) {
          var html = "";
          Object.keys(n.kids).sort().forEach(function (name) {
            var p = path ? path + "/" + name : name;
            var collapsed = bdTreeCollapsed(p, false); // ws folders default OPEN
            html += bdTreeHeadHtml(p, name, bdCount(n.kids[name]), collapsed) +
              '<div class="bd-tree-kids"' + (collapsed ? " hidden" : "") + '>' + bdRenderNode(n.kids[name], p) + "</div>";
          });
          return html + n.rows.map(bdDsRowHtml).join(""); // unfiled rows AFTER folders
        }
        var olHtml = "";
        if (wsShown.length) olHtml += '<div class="bd-grp-h">Your datasets <span class="bd-tree-n">' + wsShown.length + "</span></div>" + bdRenderNode(bdRoot, "");
        if (sampleShown.length) {
          var stems = {};
          sampleShown.forEach(function (d) { (stems[d.stem] = stems[d.stem] || []).push(d); });
          var sampleDflt = wsShown.length > 0; // default CLOSED once you have your own
          olHtml += '<div class="bd-grp-h">Sample tables — Data Management pack <span class="bd-tree-n">' + sampleShown.length + "</span></div>" +
            Object.keys(stems).sort().map(function (st) {
              var p = "sample:" + st;
              var collapsed = bdTreeCollapsed(p, sampleDflt);
              return bdTreeHeadHtml(p, st, stems[st].length, collapsed) +
                '<div class="bd-tree-kids"' + (collapsed ? " hidden" : "") + '>' + stems[st].map(bdDsRowHtml).join("") + "</div>";
            }).join("");
        }
        if (!olHtml) olHtml = '<div class="bd-none">No datasets yet — connect a data source, or install a sample pack in Settings (pack datasets arrive filed in the pack\'s folder).</div>';
        outline.innerHTML = olHtml;
      }
      // paint the per-row icons (inline SVG so both themes work for free)
      if (Studio.icon) $$("[data-bd-ic]", outline).forEach(function (sp) {
        if (!sp.firstChild) sp.appendChild(Studio.icon(sp.getAttribute("data-bd-ic"), 13));
      });
    }

    // TOP — shelves
    var shelfC = $("#bdShelfCols", sec), shelfR = $("#bdShelfRows", sec);
    if (shelfC) shelfC.innerHTML = BD.shelfCols.length
      ? BD.shelfCols.map(function (f) { return fieldChipHtml(f, "cols"); }).join("")
      : '<span class="bd-shelf-hint">' + (BD.run ? "Click or drag columns here — numeric fields aggregate as SUM" : "Pick a dataset on the left to start") + "</span>";
    if (shelfR) shelfR.innerHTML = BD.shelfRows.length
      ? BD.shelfRows.map(function (f) { return fieldChipHtml(f, "rows"); }).join("")
      : '<span class="bd-shelf-hint">Drop a field here to pivot — its values become the result’s rows</span>';

    // Filters shelf (slice 3): chips summarize each filter; the ＋ select is the
    // explicit, mobile-friendly add path next to drag-and-drop.
    var shelfF = $("#bdShelfFilters", sec);
    if (shelfF) {
      var fltChips = BD.filters.map(function (f) {
        return '<span class="bd-chip bd-filter' + (bdFilterActive(f) ? " active" : "") + '" data-bd-flt="' + esc(f.col) + '" data-bd-chip="' + esc(f.col) + '" draggable="true">' +
          '<button type="button" class="bd-flt-edit" data-bd-flt-edit="' + esc(f.col) + '" title="Edit filter" aria-label="Edit filter on ' + esc(f.col) + '">' +
          '<span class="bd-chip-nm">' + esc(f.col) + '</span><span class="bd-flt-sum">' + esc(bdFilterSummary(f)) + "</span></button>" +
          '<button type="button" class="bd-chip-rm" data-bd-flt-rm="' + esc(f.col) + '" title="Remove filter" aria-label="Remove filter on ' + esc(f.col) + '">✕</button></span>';
      }).join("");
      var addable = BD.run ? bdEff().cols.filter(function (c) { return !BD.filters.some(function (f) { return f.col === c; }); }) : [];
      var addSel = BD.run
        ? '<select class="bd-flt-add" id="bdFilterAdd" aria-label="Add a filter">' +
            '<option value="">＋ Add filter…</option>' +
            addable.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + "</option>"; }).join("") +
          "</select>"
        : "";
      shelfF.innerHTML = (fltChips || (BD.run ? "" : '<span class="bd-shelf-hint">Filters narrow the source rows before anything computes</span>')) + addSel;
    }

    // Color shelf (VB-3): a single categorical field that splits bars/donut into
    // per-category colors and (via bdLineSeriesBasis) multi-series lines; the
    // palette picker sits alongside it — same Studio.PALETTE_PRESETS the main
    // dashboard builder's "Series palette" control uses, so a View can preview in
    // a different color family without leaving the Build section.
    var shelfCo = $("#bdShelfColor", sec);
    if (shelfCo) {
      var colorField = bdColorField();
      var colorChip = colorField
        ? '<span class="bd-chip" data-bd-chip="' + esc(colorField.col) + '" draggable="true">' +
            '<span class="bd-chip-nm">' + esc(colorField.col) + '</span>' +
            '<button type="button" class="bd-chip-rm" data-bd-color-rm="' + esc(colorField.col) + '" title="Remove" aria-label="Remove color encoding on ' + esc(colorField.col) + '">✕</button></span>'
        : '<span class="bd-shelf-hint">Drop a category here to color the chart by it</span>';
      // non-drag add path (mobile is a release gate — drag can't be the only way in)
      var colorAddable = BD.run ? bdEff().cols.filter(function (c) { return c !== (colorField && colorField.col); }) : [];
      var colorAddSel = BD.run && !colorField
        ? '<select class="bd-flt-add" id="bdColorAdd" aria-label="Color by">' +
            '<option value="">＋ Color by…</option>' +
            colorAddable.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + "</option>"; }).join("") +
          "</select>"
        : "";
      colorChip += colorAddSel;
      var paletteSel = BD.run
        ? '<select class="bd-flt-add" id="bdPaletteSel" aria-label="Series color palette">' +
            (Studio.PALETTE_PRESETS || []).map(function (pr) {
              var key = pr.key === "default" ? "" : pr.key;
              return '<option value="' + esc(key) + '"' + ((BD.paletteKey || "") === key ? " selected" : "") + '>' + esc(pr.label) + "</option>";
            }).join("") +
          "</select>"
        : "";
      shelfCo.innerHTML = colorChip + paletteSel;
    }

    // chart-type strip (slice 2)
    var strip = $("#bdCharts", sec);
    if (strip) {
      strip.innerHTML = CHART_TYPES.map(function (c) {
        var why = chartUnavailable(c.t);
        var svg = c.t === "table" ? null : D.themedChartSvg(Studio.CHART_SVG[c.t], c.t);
        var mini = svg ? svg.replace("<svg ", '<svg width="22" height="15" preserveAspectRatio="xMidYMid meet" ') : "";
        return '<button type="button" class="bd-ct' + (BD.chartType === c.t ? " on" : "") + '" data-bd-ct="' + c.t + '"' +
          (why ? ' disabled title="' + esc(why) + '"' : ' title="' + esc(c.label) + '"') +
          ' aria-pressed="' + (BD.chartType === c.t ? "true" : "false") + '">' +
          (mini ? '<span class="bd-ct-ic">' + mini + "</span>" : '<span class="bd-ct-ic bd-ct-tbl">▦</span>') +
          '<span>' + esc(c.label) + "</span></button>";
      }).join("");
    }

    // VB-10: Map's Region scale — no control existed at all, so it silently rode
    // newPanel's "county" default; a 2-digit state FIPS (or any non-county id)
    // rendered an honest but silent all-"No data" map. Reuse the canonical opt
    // definition (model.js Studio.CHARTS.choropleth) instead of a third hardcoded
    // choices list (LF12 already made this call for Explore's own scale select).
    var mapOpts = $("#bdMapOpts", sec);
    if (mapOpts) {
      if (BD.chartType === "choropleth") {
        var scaleOpt = (Studio.CHARTS.choropleth.opts || []).filter(function (o) { return o.key === "scale"; })[0];
        var curScale = bdMapScale();
        mapOpts.hidden = false;
        mapOpts.innerHTML = '<label class="bd-map-scale"><span>Region scale</span><select id="bdMapScale" aria-label="Region scale">' +
          (scaleOpt.choices || []).filter(function (o) { return o[0] !== "custom"; }).map(function (o) {
            return '<option value="' + o[0] + '"' + (o[0] === curScale ? " selected" : "") + ">" + esc(o[1]) + "</option>";
          }).join("") + "</select></label>";
      } else {
        mapOpts.hidden = true;
        mapOpts.innerHTML = "";
      }
    }

    // CENTER — status + result (both computed over the FILTERED source rows)
    var status = $("#buildStatus", sec), result = $("#buildResult", sec);
    var srcRows = BD.run ? bdFilteredRows() : [];
    var res = BD.run ? compute(bdEff().cols, srcRows, BD.shelfCols, BD.shelfRows) : null;
    if (status) {
      if (!BD.run) status.innerHTML = "";
      else {
        var badge = BD.run.live
          ? '<span class="bd-badge live">live</span>'
          : '<span class="bd-badge sample" title="Typed sample rows that show the shape — not your data">sample rows</span>';
        var rowCount = srcRows.length === bdEff().rows.length
          ? bdEff().rows.length + " source rows"
          : srcRows.length + " of " + bdEff().rows.length + " source rows (filtered)";
        status.innerHTML = '<b>' + esc(BD.dsName) + '</b> <small>' + esc(BD.dsSub) + " · " + rowCount + "</small> " + badge +
          (BD.run.error ? ' <span class="bd-badge warn">' + esc(BD.run.error) + "</span>" : "");
      }
    }
    if (result) {
      if (!BD.run) {
        result.innerHTML = '<div class="bd-cta"><b>Build a View from a dataset — no code.</b><br/>' +
          "Pick a dataset on the left, then click its columns onto the shelves. Numeric fields aggregate automatically; " +
          "add a field to the Rows shelf and the table pivots into a crosstab.</div>";
      } else if (!res) {
        result.innerHTML = '<div class="bd-cta">Now click a column on the left (or drag one onto a shelf) to see the result here, live.</div>';
      } else if (BD.chartType !== "table") {
        // slice 2: a chart type is selected — the REAL renderer draws the basis
        renderChartPreview(result);
      } else if (!res.head.length) {
        result.innerHTML = "";
      } else {
        var thead = "";
        if (res.headGroups) {
          thead = "<tr>" + res.headGroups.map(function (g) {
            return '<th' + (g.span > 1 ? ' colspan="' + g.span + '"' : "") + (g.lead ? ' rowspan="2" class="bd-th-lead"' : ' class="bd-th-grp"') + ">" + esc(g.label) + "</th>";
          }).join("") + "</tr><tr>" + res.head.slice(BD.shelfRows.length).map(function (h) {
            return "<th>" + esc(h) + "</th>";
          }).join("") + "</tr>";
        } else {
          thead = "<tr>" + res.head.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr>";
        }
        var tbody = res.rows.map(function (r) {
          return "<tr>" + r.map(function (v) {
            return "<td" + (typeof v === "number" ? ' class="num"' : "") + ">" + esc(fmtCell(v)) + "</td>";
          }).join("") + "</tr>";
        }).join("");
        var xtabExtraDims = BD.shelfRows.length ? BD.shelfCols.filter(function (f) { return !f.agg; }).length - 1 : 0;
        var truncNote = (res.truncatedRows ? "Showing the first " + MAX_BODY_ROWS + " result rows (" + res.truncatedRows + " more not shown). " : "") +
          (res.truncatedCols ? "Showing the first " + MAX_XTAB_COLS + " pivot columns (" + res.truncatedCols + " more values not shown). " : "") +
          (xtabExtraDims > 0 ? "Only the first non-aggregated Columns field pivots across the top for now — " + xtabExtraDims + " extra field" + (xtabExtraDims === 1 ? " is" : "s are") + " ignored while Rows has fields." : "");
        result.innerHTML = '<div class="bd-table-wrap"><table class="bd-table"><thead>' + thead + "</thead><tbody>" + tbody + "</tbody></table></div>" +
          (truncNote ? '<div class="bd-trunc">' + esc(truncNote) + "</div>" : "");
      }
    }

    // keep the topbar Save/Update label honest with the loaded View
    var saveBtn = document.getElementById("bdSaveBtn");
    if (saveBtn) saveBtn.textContent = BD.analysisId ? "Update View" : "Save View";

    wire(sec);
  }

  function wire(sec) {
    $$("[data-bd-ds]", sec).forEach(function (btn) {
      btn.onclick = function () {
        var parts = btn.getAttribute("data-bd-ds").split(BD_SEP);
        var kind = parts.shift(), id = parts.join(BD_SEP);
        if (BD.dsKind === kind && BD.dsId === id) {
          var key = kind + BD_SEP + id;
          BD.outlineOpen[key] = !BD.outlineOpen[key];
          render(); return;
        }
        bdSelectDataset(kind, id);
      };
    });
    // VB-1: navigator wiring — tree branch collapse, search (static input wired
    // once so keystroke focus survives re-renders), and the ws manage ops
    $$("[data-bd-tree]", sec).forEach(function (btn) {
      btn.onclick = function () {
        _bdTreeCollapsed[btn.getAttribute("data-bd-tree")] = btn.getAttribute("aria-expanded") === "true";
        render();
      };
    });
    var bdQInp = $("#bdOutlineSearch", sec);
    if (bdQInp && !bdQInp.__bdWired) {
      bdQInp.__bdWired = true;
      bdQInp.addEventListener("input", function () { _bdQ = bdQInp.value; render(); });
    }
    var bdNewDs = $("#bdDsNew", sec);
    if (bdNewDs && !bdNewDs.__bdWired) {
      bdNewDs.__bdWired = true;
      bdNewDs.onclick = function () {
        D.openDatasetEditor(null, function (d) { if (d && d.id) bdSelectDataset("ws", d.id); });
      };
    }
    $$("[data-bd-ds-edit]", sec).forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var id = btn.getAttribute("data-bd-ds-edit");
        D.openDatasetEditor(Studio.Workspace.get("datasets", id), function () {
          // re-pull rows if the edited dataset is the selected one (columns may change)
          if (BD.dsKind === "ws" && BD.dsId === id) bdSelectDataset("ws", id); else render();
        });
      };
    });
    $$("[data-bd-ds-copy]", sec).forEach(function (btn) {
      btn.onclick = function (e) { e.stopPropagation(); bdCopyDataset(btn.getAttribute("data-bd-ds-copy")); };
    });
    $$("[data-bd-ds-del]", sec).forEach(function (btn) {
      btn.onclick = function (e) { e.stopPropagation(); bdDeleteDataset(btn.getAttribute("data-bd-ds-del")); };
    });
    $$("[data-bd-col]", sec).forEach(function (btn) {
      btn.onclick = function () { bdAddField(btn.getAttribute("data-bd-col"), "cols"); };
      btn.addEventListener("dragstart", function (e) {
        e.dataTransfer.setData("text/plain", JSON.stringify({ bdCol: btn.getAttribute("data-bd-col") }));
        e.dataTransfer.effectAllowed = "copy";
        sec.classList.add("bd-dragging");
      });
      btn.addEventListener("dragend", function () { sec.classList.remove("bd-dragging"); });
    });
    // VB-2: shelf pills themselves are draggable — between Columns/Rows/Filters,
    // and reordered within a shelf. A chip-level dragover records which side of
    // the hovered chip the cursor is over (_bdDropHint); the shelf-level drop
    // reads it to place the moved field precisely instead of always appending.
    $$("[data-bd-chip]", sec).forEach(function (chip) {
      chip.addEventListener("dragstart", function (e) {
        if (e.target.closest && e.target.closest("select,button")) return;
        var fromShelf = chip.closest(".bd-shelf").getAttribute("data-bd-shelf");
        e.dataTransfer.setData("text/plain", JSON.stringify({ bdMoveCol: chip.getAttribute("data-bd-chip"), bdFrom: fromShelf }));
        e.dataTransfer.effectAllowed = "move";
        sec.classList.add("bd-dragging");
        chip.classList.add("bd-chip-dragging");
      });
      chip.addEventListener("dragend", function () {
        sec.classList.remove("bd-dragging");
        chip.classList.remove("bd-chip-dragging");
        $$(".bd-chip", sec).forEach(function (c) { c.classList.remove("bd-drop-before", "bd-drop-after"); });
        _bdDropHint = null;
      });
      chip.addEventListener("dragover", function (e) {
        e.preventDefault();
        var rect = chip.getBoundingClientRect();
        var before = e.clientX < rect.left + rect.width / 2;
        _bdDropHint = { shelf: chip.closest(".bd-shelf").getAttribute("data-bd-shelf"), col: chip.getAttribute("data-bd-chip"), before: before };
        $$(".bd-chip", sec).forEach(function (c) { c.classList.remove("bd-drop-before", "bd-drop-after"); });
        chip.classList.add(before ? "bd-drop-before" : "bd-drop-after");
      });
      chip.addEventListener("dragleave", function () { chip.classList.remove("bd-drop-before", "bd-drop-after"); });
    });
    $$(".bd-shelf", sec).forEach(function (shelf) {
      shelf.ondragover = function (e) { e.preventDefault(); shelf.classList.add("bd-over"); };
      shelf.ondragleave = function () { shelf.classList.remove("bd-over"); };
      shelf.ondrop = function (e) {
        e.preventDefault(); shelf.classList.remove("bd-over"); sec.classList.remove("bd-dragging");
        var hint = _bdDropHint; _bdDropHint = null;
        $$(".bd-chip", sec).forEach(function (c) { c.classList.remove("bd-drop-before", "bd-drop-after"); });
        try {
          var payload = JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
          var toShelf = shelf.getAttribute("data-bd-shelf");
          if (payload.bdMoveCol) bdMoveFieldTo(payload.bdMoveCol, payload.bdFrom, toShelf, hint);
          else if (payload.bdCol) bdAddField(payload.bdCol, toShelf);
        } catch (err) {}
      };
    });
    $$("[data-bd-agg]", sec).forEach(function (sel) {
      sel.onchange = function () {
        var col = sel.getAttribute("data-bd-agg");
        var v = sel.value === "category" ? null : sel.value;
        BD.shelfCols.forEach(function (f) { if (f.col === col) f.agg = v; });
        render();
      };
    });
    $$("[data-bd-move]", sec).forEach(function (btn) {
      btn.onclick = function () { bdMoveField(btn.getAttribute("data-bd-move")); };
    });
    $$("[data-bd-rm]", sec).forEach(function (btn) {
      btn.onclick = function () { bdRemoveField(btn.getAttribute("data-bd-rm")); };
    });
    $$("[data-bd-ct]", sec).forEach(function (btn) {
      btn.onclick = function () {
        if (btn.disabled) return;
        BD.chartType = btn.getAttribute("data-bd-ct");
        render();
      };
    });
    var mapScaleSel = $("#bdMapScale", sec);
    if (mapScaleSel) mapScaleSel.onchange = function () {
      // A manual pick wins from here on — bdRefreshMapScaleGuess no longer
      // touches BD.mapScale until the next dataset switch (VB-10, QV-1's rule).
      BD.mapScale = mapScaleSel.value; BD.mapScaleAuto = false;
      render();
    };
    $$("[data-bd-flt-edit]", sec).forEach(function (btn) {
      btn.onclick = function () {
        var f = BD.filters.filter(function (x) { return x.col === btn.getAttribute("data-bd-flt-edit"); })[0];
        if (f) openFilterEditor(f);
      };
    });
    $$("[data-bd-flt-rm]", sec).forEach(function (btn) {
      btn.onclick = function () { bdRemoveFilter(btn.getAttribute("data-bd-flt-rm")); };
    });
    var calcBtn = $("#bdCalcBtn", sec);
    if (calcBtn) calcBtn.onclick = function () { openCalcEditor(); };
    var fltAdd = $("#bdFilterAdd", sec);
    if (fltAdd) fltAdd.onchange = function () {
      var col = fltAdd.value;
      if (!col) return;
      bdAddFilter(col);
      var f = BD.filters.filter(function (x) { return x.col === col; })[0];
      if (f) openFilterEditor(f); // adding from the select jumps straight into editing
    };
    $$("[data-bd-color-rm]", sec).forEach(function (btn) {
      btn.onclick = function () { bdRemoveColorField(btn.getAttribute("data-bd-color-rm")); };
    });
    var colorAdd = $("#bdColorAdd", sec);
    if (colorAdd) colorAdd.onchange = function () { if (colorAdd.value) bdSetColorField(colorAdd.value); };
    var paletteSel = $("#bdPaletteSel", sec);
    if (paletteSel) paletteSel.onchange = function () { BD.paletteKey = paletteSel.value; render(); };
  }

  // ---------- New / Save / Load ----------
  function bdNew() { bdReset(); render(); }

  function bdSave() {
    // The saved View's da/chart follow the SELECTED chart type: charts save their
    // basis table (so newPanel's defaults keep mapping it everywhere), the table
    // type saves the full pivot's columns. Both compute over the filtered rows.
    var res = BD.chartType === "table"
      ? (BD.run ? compute(bdEff().cols, bdFilteredRows(), BD.shelfCols, BD.shelfRows) : null)
      : chartBasis(BD.chartType);
    if (!res || !res.head.length) { toast("Nothing to save yet — put a field on a shelf first.", true); return; }
    D.modal(BD.analysisId ? "Update View" : "Save View", function (b) {
      var wrap = D.el("div", "bd-save cx-wiz-form");
      function field(lblText, input, hint) {
        var row = D.el("label", "cx-field");
        row.innerHTML = "<span>" + esc(lblText) + "</span>";
        row.appendChild(input);
        if (hint) { var h = D.el("small", "cx-hint"); h.textContent = hint; row.appendChild(h); }
        wrap.appendChild(row);
        return input;
      }
      var inp = D.el("input"); inp.type = "text"; inp.value = BD.name || ""; inp.placeholder = "e.g. Revenue by region";
      // VB-6: the same ✨ name-suggest affordance every other Name field gets,
      // deriving from the picked dataset (mirrors Explore's xpNameSuggestCtx).
      field("Name", D.withSparkleButton(inp, "view", function () {
        return { sourceDatasetName: BD.dsName || "", valueCol: (BD.shelfCols[0] && BD.shelfCols[0].col) || "" };
      }));
      // VB-7 (Kevin live, 2026-07-30): the panel that HOLDS the View can carry its own
      // title — it defaults to (and keeps tracking) the View name until overridden here.
      var ptInp = D.el("input"); ptInp.type = "text"; ptInp.value = BD.panelTitle || ""; ptInp.placeholder = BD.name || "Same as the View name";
      field("Panel title", ptInp, "Optional — how the panel header reads in the preview and on dashboards. Leave blank to keep it matching the View name.");
      var folderInp = D.el("input"); folderInp.type = "text"; folderInp.value = BD.folder || ""; folderInp.placeholder = "e.g. Finance";
      // VB-6: the LF56 folder navigator (same Browse-a-folder-tree picker every other
      // Folder field uses) plus the sparkle suggest, seeded from the picked dataset's
      // own folder — a View sits one hop downstream of its source dataset, same
      // convention as Explore's xpFolderSuggestCtx.
      field("Folder", D.withSparkleButton(folderInp, "folder", function () {
        var linkedFolder = "";
        if (BD.dsKind === "ws") {
          var ds = Studio.Workspace.get("datasets", BD.dsId);
          if (ds) linkedFolder = ds.folder || "";
        }
        return { linkedFolder: linkedFolder };
      }), "Optional — a home for this View (e.g. Finance, or Finance/2024 to nest). Pick an existing one or type a new name.");
      var viewFolders = {};
      Studio.Workspace.all("analyses").forEach(function (a) { if (a.folder) viewFolders[a.folder] = true; });
      var folderList = D.el("datalist"); folderList.id = "bdFolderOptions";
      Object.keys(viewFolders).sort().forEach(function (f) { var o = D.el("option"); o.value = f; folderList.appendChild(o); });
      folderInp.setAttribute("list", "bdFolderOptions");
      folderInp.parentNode.appendChild(folderList);
      folderInp.parentNode.appendChild(Studio.folderPickerButton(folderInp, function () { return Object.keys(viewFolders); }));
      var foot = D.el("div"); foot.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:14px";
      var cancel = D.el("button", "btn"); cancel.type = "button"; cancel.textContent = "Cancel";
      var save = D.el("button", "btn primary"); save.type = "button"; save.textContent = BD.analysisId ? "Update" : "Save";
      cancel.onclick = function () { wrap.closest(".modal-ov").remove(); };
      save.onclick = function () {
        var name = inp.value.trim();
        if (!name) { toast("Give the View a name.", true); return; }
        BD.name = name;
        BD.folder = folderInp.value.trim();
        BD.panelTitle = ptInp.value.trim() === name ? "" : ptInp.value.trim(); // "" = track the View name (VB-7)
        var base = name.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "view";
        // A self-contained da over the COMPUTED result columns, so every existing
        // View surface (catalog row, add-to-dashboard, export) treats this like any
        // other table View — its rows fabricate through the sample engine (standard
        // authored-content behavior, SAMPLE-badged everywhere) until a live-refresh
        // slice teaches those surfaces to re-run the builder state.
        var da = { id: base, name: name, kind: "sql", sql: "", query: "", columns: res.head.slice(), params: [], authored: true };
        var row = {
          name: name, folder: BD.folder || "", panelTitle: BD.panelTitle || "", chartType: BD.chartType, da: da,
          paletteKey: BD.paletteKey || "",
          builder: {
            dsKind: BD.dsKind, dsId: BD.dsId, chartType: BD.chartType,
            shelfCols: Studio.clone(BD.shelfCols), shelfRows: Studio.clone(BD.shelfRows),
            filters: Studio.clone(BD.filters), calcs: Studio.clone(BD.calcs),
            shelfColor: Studio.clone(BD.shelfColor), paletteKey: BD.paletteKey || "",
            mapScale: BD.mapScale || "", mapScaleAuto: BD.mapScaleAuto !== false // VB-10
          }
        };
        // #118 (live re-run): the da carries the builder blob too — the da is what
        // travels into a dashboard's spec.cda when this View is added, so every
        // renderer can recompute the REAL result (Studio.Build.runBlob) instead of
        // fabricating sample rows for an authored, query-less da.
        da.builder = Studio.clone(row.builder);
        // KPI is structurally different (spec.kpis, not spec.panels) — it saves
        // a `kpi` blob instead of a `chart` blob; everything that reads a saved
        // View's chartType (Explore's addToSpec/analysisSpec, Views' row icon)
        // branches on chartType === "kpi" the same way.
        if (BD.chartType === "kpi") row.kpi = bdKpiFor(da);
        else row.chart = bdPanelFor(BD.chartType, da, res).chart;
        if (BD.analysisId) row.id = BD.analysisId;
        // Workspace.put REPLACES the stored row wholesale (same reason Explore's
        // xpSave carries pinned/createdAt forward) — updating must not silently
        // strip pin/privacy/ownership off an existing View (VB-5 also routes
        // Quick-Views-made rows through here, where those fields are common).
        if (BD.analysisId) {
          var prev = Studio.Workspace.get("analyses", BD.analysisId);
          if (prev) {
            if (prev.pinned) { row.pinned = prev.pinned; row.pinnedAt = prev.pinnedAt; }
            if (prev.private) row.private = prev.private;
            if (prev.owner) row.owner = prev.owner;
            if (prev.createdAt) row.createdAt = prev.createdAt;
          }
        }
        var saved = Studio.Workspace.put("analyses", row);
        BD.analysisId = saved.id;
        toast((row.id ? "Updated" : "Saved") + " “" + name + "” — find it in Views", false, !row.id);
        wrap.closest(".modal-ov").remove();
        render();
      };
      foot.appendChild(cancel); foot.appendChild(save);
      wrap.appendChild(foot);
      b.appendChild(wrap);
      setTimeout(function () { inp.focus(); }, 30);
    });
  }

  // ---------- VB-5: open a View made in the OTHER editor ----------
  // A Quick Views (or Studio-snapshot) analysis has no `builder` blob — its saved
  // chart mapping is reconstructed onto the shelves best-effort so it OPENS here
  // rather than being refused, with a dismissible notice saying what happened.
  // Field-name classification mirrors model.js's CHARTS field vocabulary.
  var FOREIGN_DIM_FIELDS = ["labelCol", "idCol", "colCol", "sourceCol", "dateCol", "groupCol"];
  var FOREIGN_MEASURE_FIELDS = ["valueCol", "xCol", "yCol", "barCol", "lineCol", "targetCol", "rCol"];
  // The nearest Build chart type for Quick-Views types the Builder doesn't have;
  // anything else unsupported falls back to the honest full pivot table.
  var FOREIGN_TYPE_FALLBACK = { ensembleSeries: "line", treemap: "bars", stream: "areaStacked" };
  function bdMapAggFn(fn) {
    if (!fn || fn === "none") return null;
    if (fn === "mean" || fn === "average" || fn === "avg") return "avg";
    return AGGS.indexOf(fn) >= 0 ? fn : null;
  }
  function bdLoadForeign(id) {
    var a = Studio.Workspace.get("analyses", id);
    if (!a) return;
    if (a.builder) { bdLoad(id); return; }
    bdReset();
    BD.analysisId = a.id; BD.name = a.name || ""; BD.folder = a.folder || ""; BD.panelTitle = a.panelTitle || ""; // VB-7
    BD.paletteKey = a.paletteKey || "";
    var kind = null, dsId = null;
    if (a.datasetId) { kind = "ws"; dsId = a.datasetId; }
    else if (a.sample) {
      // Explore's sample ids are "<stem>+XP_SEP+<daId>"; Build keys the same pair
      // with its own separator.
      var sp = String(a.sample).split("\u001f");
      if (sp.length === 2) { kind = "sample"; dsId = sp[0] + BD_SEP + sp[1]; }
    }
    if (!kind) {
      // Self-contained (e.g. a dashboard-panel snapshot whose source is gone):
      // nothing to put on the shelves, but the View itself is untouched.
      BD.notice = "“" + (a.name || "This View") + "” is self-contained — it carries no source dataset, so its fields can’t be reconstructed on the shelves. It still renders everywhere it’s used; pick a dataset on the left to rebuild it here.";
      render();
      return;
    }
    bdSelectDataset(kind, dsId).then(function () {
      if (!BD.run) {
        BD.analysisId = a.id;
        BD.notice = "“" + (a.name || "This View") + "”’s source dataset is gone — pick another dataset to rebuild it.";
        render();
        return;
      }
      var cols = bdEff().cols;
      var savedAgg = a.da && a.da.outputOptions && a.da.outputOptions.aggregate;
      var aggFn = bdMapAggFn(savedAgg && savedAgg.fn);
      var map = (a.chart && a.chart.map) || {};
      function addDim(c, toRows) {
        if (!c || cols.indexOf(c) < 0 || bdOnShelf(c)) return;
        if (toRows) BD.shelfRows.push({ col: c }); else BD.shelfCols.push({ col: c, agg: null });
      }
      function addMeasure(c) {
        if (!c || cols.indexOf(c) < 0 || bdOnShelf(c)) return;
        BD.shelfCols.push({ col: c, agg: bdFieldKind(c) === "Numeric" ? (aggFn || "sum") : null });
      }
      addDim(map.rowCol, true); // heatmap's Row nests down the side, same as here
      FOREIGN_DIM_FIELDS.forEach(function (f) { addDim(map[f]); });
      FOREIGN_MEASURE_FIELDS.forEach(function (f) { addMeasure(map[f]); });
      (map.series || []).forEach(function (s) { addMeasure(s && s.col); });
      if (map.seriesCol && cols.indexOf(map.seriesCol) >= 0) BD.shelfColor = [{ col: map.seriesCol }];
      var t = a.chartType || (a.chart && a.chart.type) || "table";
      var supported = CHART_TYPES.some(function (c) { return c.t === t; });
      BD.chartType = supported ? t : (FOREIGN_TYPE_FALLBACK[t] || "table");
      if (BD.chartType !== "table" && chartUnavailable(BD.chartType)) BD.chartType = "table";
      // VB-10: a foreign choropleth already carries its own resolved scale
      // (Explore's own QV-1 guess-or-pick) — keep it as a manual pick rather
      // than re-guessing from scratch.
      if (BD.chartType === "choropleth" && a.chart && a.chart.opts && a.chart.opts.scale) {
        BD.mapScale = a.chart.opts.scale; BD.mapScaleAuto = false;
      }
      var typeNote = supported ? "" :
        " Its chart type (" + ((Studio.CHARTS[t] || {}).label || t) + ") isn’t in the View Builder yet, so it opens as " +
        (FOREIGN_TYPE_FALLBACK[t] ? "the nearest type" : "a table") + ".";
      BD.notice = "“" + (a.name || "This View") + "” was built in the simpler Quick Views editor — its settings were mapped onto the shelves as a starting point." + typeNote + " Updating from here saves it as a View Builder View.";
      render();
    });
  }

  // Reopen a builder-made View (views.js routes any analyses row carrying a
  // `builder` blob here instead of Explore).
  function bdLoad(id) {
    var a = Studio.Workspace.get("analyses", id);
    if (!a || !a.builder) return;
    bdReset();
    BD.analysisId = a.id; BD.name = a.name || ""; BD.folder = a.folder || ""; BD.panelTitle = a.panelTitle || ""; // VB-7
    var b = a.builder;
    bdSelectDataset(b.dsKind, b.dsId).then(function () {
      if (!BD.run) { toast("This View’s source dataset is gone — pick another to rebuild it.", true); render(); return; }
      BD.calcs = Studio.clone(b.calcs || []);
      BD._eff = null;
      BD.shelfCols = Studio.clone(b.shelfCols || []);
      BD.shelfRows = Studio.clone(b.shelfRows || []);
      BD.filters = Studio.clone(b.filters || []);
      BD.shelfColor = Studio.clone(b.shelfColor || []);
      BD.paletteKey = b.paletteKey || "";
      BD.chartType = b.chartType || "table";
      BD.mapScale = b.mapScale || ""; BD.mapScaleAuto = b.mapScaleAuto !== false; // VB-10
      render();
    });
  }

  Studio.Build = {
    configure: configure,
    render: render,
    compute: compute,     // pure — unit-tested directly
    load: bdLoad,
    loadForeign: bdLoadForeign, // VB-5: open a Quick-Views/snapshot View here, best-effort
    newView: bdNew,
    runBlob: bdRunBlob,             // #118: real result of a saved builder blob (Promise)
    ensureSpecMocks: bdEnsureSpecMocks, // #118: Promise while builder-da runs pend, null when cached
    specMocks: bdSpecMocks,         // #118: sync { daId: {cols, rows} } of cached real results
    state: BD             // test hook (also window.__studioBuild below)
  };
  window.__studioBuild = { state: BD, addField: bdAddField, selectDataset: bdSelectDataset, save: bdSave, load: bdLoad,
    addFilter: bdAddFilter, filteredRows: bdFilteredRows, setCalcs: bdSetCalcs, eff: bdEff, rerender: render,
    chartBasis: chartBasis, loadForeign: bdLoadForeign };
})();
