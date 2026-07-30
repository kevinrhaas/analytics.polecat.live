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

  // ---------- builder state ----------
  var BD = {
    dsKind: null, dsId: null, dsName: "", dsSub: "",
    run: null,               // { cols, rows, live, error } — the loaded source rows
    shelfCols: [],           // [ { col, agg } ] — agg null = dimension, else sum/avg/min/max/median/count
    shelfRows: [],           // [ { col } ] — row dimensions (crosstab when non-empty)
    filters: [],             // slice 3: [ { col, kind:"in"|"range", values:null|[..], min:"", max:"" } ]
    chartType: "table",      // slice 2: table | bars | line | donut | heatmap
    analysisId: null, name: "", folder: "",
    outlineOpen: {}          // which outline datasets are expanded
  };
  function bdReset() {
    BD.dsKind = null; BD.dsId = null; BD.dsName = ""; BD.dsSub = "";
    BD.run = null; BD.shelfCols = []; BD.shelfRows = []; BD.filters = [];
    BD.chartType = "table";
    BD.analysisId = null; BD.name = ""; BD.folder = "";
  }

  // ---------- dataset outline (LEFT) ----------
  // Same sourcing rules as Explore's picker: visible workspace datasets first,
  // then the sample catalog's authored/sample queries (showSamples-gated).
  // Kept local rather than reaching into explore.js's private xpDatasets —
  // LF51's shared-nav convergence epic is where these unify.
  function bdDatasets() {
    var out = [];
    (Studio.Workspace ? Studio.Workspace.all("datasets").filter(D.isDatasetVisibleToMe) : []).sort(function (a, b) {
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    }).forEach(function (d) {
      var conn = Studio.Workspace.get("connections", d.connectionId);
      out.push({ kind: "ws", id: d.id, name: d.name || d.id, sub: conn ? conn.name : "no connection", cols: d.columns || [] });
    });
    if (D.showSamples()) {
      var cat = D.getCatalog();
      Object.keys(cat).forEach(function (stem) {
        (cat[stem].dataAccesses || []).forEach(function (d) {
          out.push({ kind: "sample", id: stem + BD_SEP + d.id, name: d.id, sub: stem + " · sample", cols: d.columns || [] });
        });
      });
    }
    return out;
  }

  function bdSelectDataset(kind, id) {
    BD.dsKind = kind; BD.dsId = id;
    BD.shelfCols = []; BD.shelfRows = []; BD.filters = [];
    BD.run = null;
    var entry = bdDatasets().filter(function (d) { return d.kind === kind && d.id === id; })[0];
    BD.dsName = entry ? entry.name : id;
    BD.dsSub = entry ? entry.sub : "";
    return bdLoadRows().then(function () { render(); });
  }
  // Workspace datasets run LIVE through their adapter, falling back to typed
  // sample rows when the run fails (same honesty rules as Explore's xpLoadRows);
  // catalog samples always use the sample engine.
  function bdLoadRows() {
    if (BD.dsKind === "ws") {
      var ds = Studio.Workspace.get("datasets", BD.dsId);
      if (!ds) { BD.run = null; return Promise.resolve(null); }
      return D.runDataset(ds).then(function (r) {
        if (r && !r.error && (r.rows || []).length) {
          return (BD.run = { cols: r.columns || ds.columns || [], rows: r.rows.slice(0, 2000), live: true });
        }
        var cols = ds.columns || [];
        if (!cols.length) return (BD.run = { cols: [], rows: [], live: false, error: (r && r.error) || "no columns known — Preview the dataset once" });
        var sd = Studio.sampleRows({ id: ds.id, columns: cols });
        return (BD.run = { cols: sd.cols, rows: sd.rows, live: false, error: r && r.error });
      });
    }
    if (BD.dsKind === "sample") {
      var parts = BD.dsId.split(BD_SEP), stem = parts[0], daId = parts[1];
      var cat = D.getCatalog();
      var da = ((cat[stem] || {}).dataAccesses || []).filter(function (d) { return d.id === daId; })[0];
      if (!da) { BD.run = null; return Promise.resolve(null); }
      var sd = Studio.sampleRows({ id: da.id, columns: da.columns || [], params: da.params || [] });
      BD.run = { cols: sd.cols, rows: sd.rows, live: false };
      return Promise.resolve(BD.run);
    }
    return Promise.resolve(null);
  }

  // Numeric vs dimension: name + sampled values, via the same guessFieldKind
  // the job editor already uses (injected) — one heuristic, not two.
  function bdFieldKind(col) {
    if (!BD.run) return "String";
    var idx = BD.run.cols.indexOf(col);
    var vals = idx < 0 ? [] : BD.run.rows.slice(0, 30).map(function (r) { return r[idx]; });
    return D.guessFieldKind(col, vals);
  }

  // ---------- shelves ----------
  var AGGS = ["sum", "avg", "min", "max", "median", "count"];
  function bdOnShelf(col) {
    return BD.shelfCols.some(function (f) { return f.col === col; }) ||
           BD.shelfRows.some(function (f) { return f.col === col; });
  }
  function bdAddField(col, shelf) {
    if (shelf === "filters") { bdAddFilter(col); return; }
    if (!BD.run || BD.run.cols.indexOf(col) < 0 || bdOnShelf(col)) return;
    if (shelf === "rows") BD.shelfRows.push({ col: col });
    else BD.shelfCols.push({ col: col, agg: bdFieldKind(col) === "Numeric" ? "sum" : null });
    render();
  }
  function bdRemoveField(col) {
    BD.shelfCols = BD.shelfCols.filter(function (f) { return f.col !== col; });
    BD.shelfRows = BD.shelfRows.filter(function (f) { return f.col !== col; });
    render();
  }
  // ---------- filters (slice 3) ----------
  // A filter narrows the SOURCE rows before anything computes — the pivot, every
  // chart basis, and the status row count all see the same filtered set. Two
  // kinds, picked by the field's guessed type: "in" (a value multi-select;
  // values:null means "everything" — a freshly added filter is a no-op until
  // edited) and "range" (numeric min/max; an empty bound is unbounded).
  function bdAddFilter(col) {
    if (!BD.run || BD.run.cols.indexOf(col) < 0) return;
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
  function bdFilteredRows() {
    if (!BD.run) return [];
    var active = BD.filters.filter(bdFilterActive);
    if (!active.length) return BD.run.rows;
    var idx = {};
    BD.run.cols.forEach(function (c, i) { idx[c] = i; });
    return BD.run.rows.filter(function (r) {
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
    var i = BD.run.cols.indexOf(col), seen = {}, out = [];
    if (i < 0) return out;
    BD.run.rows.forEach(function (r) {
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
      BD.shelfCols.push({ col: col, agg: bdFieldKind(col) === "Numeric" ? "sum" : null });
      render(); return;
    }
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

  // ---------- charting the result (#117 slice 2) ----------
  // Each chart draws from a deliberately SIMPLE, ordered "chart basis" table so
  // Studio.newPanel's column-order defaults map it with no bespoke wiring:
  //   bars/line/donut → [first dimension, first measure]  (rollup by that dim)
  //   heatmap         → [first Rows dim, first Columns dim, measure]  (the
  //                      crosstab's own long form — rowCol/colCol/valueCol)
  // The first dimension prefers the Rows shelf; with no measure picked, COUNT
  // of rows keeps every chart honest instead of refusing to draw. Table stays
  // the full pivot. Charting more of the shelves (multi-dim, series) is a
  // later slice, and the render notes say so.
  var CHART_TYPES = [
    { t: "table", label: "Table" },
    { t: "bars", label: "Bars" },
    { t: "line", label: "Line" },
    { t: "donut", label: "Donut" },
    { t: "heatmap", label: "Heatmap" },
  ];
  function bdFirstDim() {
    return BD.shelfRows[0] || BD.shelfCols.filter(function (f) { return !f.agg; })[0] || null;
  }
  function bdColsDim() { return BD.shelfCols.filter(function (f) { return !f.agg; })[0] || null; }
  function bdFirstMeasure() {
    var m = BD.shelfCols.filter(function (f) { return f.agg; })[0];
    if (m) return m;
    var d = bdFirstDim();
    return d ? { col: d.col, agg: "count" } : null;
  }
  // Why a chart type can't draw yet — "" when it can. Doubles as the disabled tooltip.
  function chartUnavailable(type) {
    if (type === "table") return "";
    if (!BD.run) return "Pick a dataset first";
    if (type === "heatmap") {
      if (!BD.shelfRows[0] || !bdColsDim()) return "Needs a field on Rows and a plain field on Columns";
      return "";
    }
    if (!bdFirstDim()) return "Needs at least one non-aggregated field on a shelf";
    return "";
  }
  function chartBasis(type) {
    if (!BD.run || chartUnavailable(type)) return null;
    var m = bdFirstMeasure(), rows = bdFilteredRows();
    if (type === "heatmap") {
      return compute(BD.run.cols, rows,
        [{ col: BD.shelfRows[0].col, agg: null }, { col: bdColsDim().col, agg: null }, m], []);
    }
    return compute(BD.run.cols, rows, [{ col: bdFirstDim().col, agg: null }, m], []);
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
      var p = Studio.newPanel(BD.chartType, da);
      p.title = BD.name || BD.dsName || "View"; p.span = "full";
      var spec = {
        id: "build-preview", name: "build-preview", title: p.title, hideHeader: true,
        dashboardTheme: D.defaultDashboardTheme(),
        panels: [p], kpis: [], filters: [],
        cda: { connections: [], dataAccesses: [da] }
      };
      var mock = { build_result: { cols: basis.head, rows: basis.rows } };
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
    var agg = f.agg
      ? '<select class="bd-agg" data-bd-agg="' + esc(f.col) + '" aria-label="Aggregation for ' + esc(f.col) + '">' +
          AGGS.map(function (a) { return '<option value="' + a + '"' + (a === f.agg ? " selected" : "") + '>' + a.toUpperCase() + "</option>"; }).join("") +
        "</select>"
      : "";
    return '<span class="bd-chip' + kindCls + '" data-bd-chip="' + esc(f.col) + '">' + agg +
      '<span class="bd-chip-nm">' + esc(f.col) + '</span>' +
      '<button type="button" class="bd-chip-move" data-bd-move="' + esc(f.col) + '" title="Move to the ' + (shelf === "cols" ? "Rows" : "Columns") + ' shelf" aria-label="Move ' + esc(f.col) + ' to the ' + (shelf === "cols" ? "Rows" : "Columns") + ' shelf">⇄</button>' +
      '<button type="button" class="bd-chip-rm" data-bd-rm="' + esc(f.col) + '" title="Remove" aria-label="Remove ' + esc(f.col) + '">✕</button></span>';
  }

  function render() {
    var sec = document.getElementById("secBuild");
    if (!sec) return;

    // LEFT — dataset outline
    var outline = $("#buildOutline", sec);
    if (outline) {
      var dss = bdDatasets();
      if (!dss.length) {
        outline.innerHTML = '<div class="bd-empty">No datasets yet — create one in Datasets, or install a Sample pack.</div>';
      } else {
        outline.innerHTML = dss.map(function (d) {
          var key = d.kind + BD_SEP + d.id;
          var sel = BD.dsKind === d.kind && BD.dsId === d.id;
          var open = sel || !!BD.outlineOpen[key];
          var colsHtml = open && sel && BD.run
            ? '<div class="bd-ol-cols">' + BD.run.cols.map(function (c) {
                var used = bdOnShelf(c);
                var numeric = bdFieldKind(c) === "Numeric";
                return '<button type="button" class="bd-col' + (used ? " used" : "") + (numeric ? " num" : "") +
                  '" draggable="true" data-bd-col="' + esc(c) + '" title="' + (used ? "Already on a shelf" : "Add to the Columns shelf (drag for Rows)") + '">' +
                  '<span class="bd-col-k">' + (numeric ? "#" : "a") + '</span>' + esc(c) + "</button>";
              }).join("") + "</div>"
            : "";
          return '<div class="bd-ol' + (sel ? " sel" : "") + '" data-bd-ds-kind="' + esc(d.kind) + '" data-bd-ds-id="' + esc(d.id) + '">' +
            '<button type="button" class="bd-ol-head" data-bd-ds="' + esc(key) + '">' +
              '<span class="bd-ol-car">' + (open ? "▾" : "▸") + '</span>' +
              '<span class="bd-ol-nm">' + esc(d.name) + '</span><small>' + esc(d.sub) + "</small></button>" + colsHtml +
            "</div>";
        }).join("");
      }
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
        return '<span class="bd-chip bd-filter' + (bdFilterActive(f) ? " active" : "") + '" data-bd-flt="' + esc(f.col) + '">' +
          '<button type="button" class="bd-flt-edit" data-bd-flt-edit="' + esc(f.col) + '" title="Edit filter" aria-label="Edit filter on ' + esc(f.col) + '">' +
          '<span class="bd-chip-nm">' + esc(f.col) + '</span><span class="bd-flt-sum">' + esc(bdFilterSummary(f)) + "</span></button>" +
          '<button type="button" class="bd-chip-rm" data-bd-flt-rm="' + esc(f.col) + '" title="Remove filter" aria-label="Remove filter on ' + esc(f.col) + '">✕</button></span>';
      }).join("");
      var addable = BD.run ? BD.run.cols.filter(function (c) { return !BD.filters.some(function (f) { return f.col === c; }); }) : [];
      var addSel = BD.run
        ? '<select class="bd-flt-add" id="bdFilterAdd" aria-label="Add a filter">' +
            '<option value="">＋ Add filter…</option>' +
            addable.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + "</option>"; }).join("") +
          "</select>"
        : "";
      shelfF.innerHTML = (fltChips || (BD.run ? "" : '<span class="bd-shelf-hint">Filters narrow the source rows before anything computes</span>')) + addSel;
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

    // CENTER — status + result (both computed over the FILTERED source rows)
    var status = $("#buildStatus", sec), result = $("#buildResult", sec);
    var srcRows = BD.run ? bdFilteredRows() : [];
    var res = BD.run ? compute(BD.run.cols, srcRows, BD.shelfCols, BD.shelfRows) : null;
    if (status) {
      if (!BD.run) status.innerHTML = "";
      else {
        var badge = BD.run.live
          ? '<span class="bd-badge live">live</span>'
          : '<span class="bd-badge sample" title="Typed sample rows that show the shape — not your data">sample rows</span>';
        var rowCount = srcRows.length === BD.run.rows.length
          ? BD.run.rows.length + " source rows"
          : srcRows.length + " of " + BD.run.rows.length + " source rows (filtered)";
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
    $$("[data-bd-col]", sec).forEach(function (btn) {
      btn.onclick = function () { bdAddField(btn.getAttribute("data-bd-col"), "cols"); };
      btn.addEventListener("dragstart", function (e) {
        e.dataTransfer.setData("text/plain", JSON.stringify({ bdCol: btn.getAttribute("data-bd-col") }));
        e.dataTransfer.effectAllowed = "copy";
        sec.classList.add("bd-dragging");
      });
      btn.addEventListener("dragend", function () { sec.classList.remove("bd-dragging"); });
    });
    $$(".bd-shelf", sec).forEach(function (shelf) {
      shelf.ondragover = function (e) { e.preventDefault(); shelf.classList.add("bd-over"); };
      shelf.ondragleave = function () { shelf.classList.remove("bd-over"); };
      shelf.ondrop = function (e) {
        e.preventDefault(); shelf.classList.remove("bd-over"); sec.classList.remove("bd-dragging");
        try {
          var payload = JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
          if (payload.bdCol) bdAddField(payload.bdCol, shelf.getAttribute("data-bd-shelf"));
        } catch (err) {}
      };
    });
    $$("[data-bd-agg]", sec).forEach(function (sel) {
      sel.onchange = function () {
        var col = sel.getAttribute("data-bd-agg");
        BD.shelfCols.forEach(function (f) { if (f.col === col) f.agg = sel.value; });
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
    $$("[data-bd-flt-edit]", sec).forEach(function (btn) {
      btn.onclick = function () {
        var f = BD.filters.filter(function (x) { return x.col === btn.getAttribute("data-bd-flt-edit"); })[0];
        if (f) openFilterEditor(f);
      };
    });
    $$("[data-bd-flt-rm]", sec).forEach(function (btn) {
      btn.onclick = function () { bdRemoveFilter(btn.getAttribute("data-bd-flt-rm")); };
    });
    var fltAdd = $("#bdFilterAdd", sec);
    if (fltAdd) fltAdd.onchange = function () {
      var col = fltAdd.value;
      if (!col) return;
      bdAddFilter(col);
      var f = BD.filters.filter(function (x) { return x.col === col; })[0];
      if (f) openFilterEditor(f); // adding from the select jumps straight into editing
    };
  }

  // ---------- New / Save / Load ----------
  function bdNew() { bdReset(); render(); }

  function bdSave() {
    // The saved View's da/chart follow the SELECTED chart type: charts save their
    // basis table (so newPanel's defaults keep mapping it everywhere), the table
    // type saves the full pivot's columns. Both compute over the filtered rows.
    var res = BD.chartType === "table"
      ? (BD.run ? compute(BD.run.cols, bdFilteredRows(), BD.shelfCols, BD.shelfRows) : null)
      : chartBasis(BD.chartType);
    if (!res || !res.head.length) { toast("Nothing to save yet — put a field on a shelf first.", true); return; }
    D.modal(BD.analysisId ? "Update View" : "Save View", function (b) {
      var wrap = D.el("div", "bd-save");
      var lbl = D.el("label"); lbl.textContent = "Name"; lbl.style.cssText = "display:block;font-size:12px;font-weight:700;margin-bottom:4px";
      var inp = D.el("input"); inp.type = "text"; inp.value = BD.name || ""; inp.placeholder = "e.g. Revenue by region";
      inp.style.cssText = "width:100%;box-sizing:border-box";
      var foot = D.el("div"); foot.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:14px";
      var cancel = D.el("button", "btn"); cancel.type = "button"; cancel.textContent = "Cancel";
      var save = D.el("button", "btn primary"); save.type = "button"; save.textContent = BD.analysisId ? "Update" : "Save";
      cancel.onclick = function () { wrap.closest(".modal-ov").remove(); };
      save.onclick = function () {
        var name = inp.value.trim();
        if (!name) { toast("Give the View a name.", true); return; }
        BD.name = name;
        var base = name.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "view";
        // A self-contained da over the COMPUTED result columns, so every existing
        // View surface (catalog row, add-to-dashboard, export) treats this like any
        // other table View — its rows fabricate through the sample engine (standard
        // authored-content behavior, SAMPLE-badged everywhere) until a live-refresh
        // slice teaches those surfaces to re-run the builder state.
        var da = { id: base, name: name, kind: "sql", sql: "", query: "", columns: res.head.slice(), params: [], authored: true };
        var chart = Studio.newPanel(BD.chartType, da).chart;
        var row = {
          name: name, folder: BD.folder || "", chartType: BD.chartType, da: da, chart: chart,
          builder: {
            dsKind: BD.dsKind, dsId: BD.dsId, chartType: BD.chartType,
            shelfCols: Studio.clone(BD.shelfCols), shelfRows: Studio.clone(BD.shelfRows),
            filters: Studio.clone(BD.filters)
          }
        };
        if (BD.analysisId) row.id = BD.analysisId;
        var saved = Studio.Workspace.put("analyses", row);
        BD.analysisId = saved.id;
        toast((row.id ? "Updated" : "Saved") + " “" + name + "” — find it in Views", false, !row.id);
        wrap.closest(".modal-ov").remove();
        render();
      };
      foot.appendChild(cancel); foot.appendChild(save);
      wrap.appendChild(lbl); wrap.appendChild(inp); wrap.appendChild(foot);
      b.appendChild(wrap);
      setTimeout(function () { inp.focus(); }, 30);
    });
  }

  // Reopen a builder-made View (views.js routes any analyses row carrying a
  // `builder` blob here instead of Explore).
  function bdLoad(id) {
    var a = Studio.Workspace.get("analyses", id);
    if (!a || !a.builder) return;
    bdReset();
    BD.analysisId = a.id; BD.name = a.name || ""; BD.folder = a.folder || "";
    var b = a.builder;
    bdSelectDataset(b.dsKind, b.dsId).then(function () {
      if (!BD.run) { toast("This View’s source dataset is gone — pick another to rebuild it.", true); render(); return; }
      BD.shelfCols = Studio.clone(b.shelfCols || []);
      BD.shelfRows = Studio.clone(b.shelfRows || []);
      BD.filters = Studio.clone(b.filters || []);
      BD.chartType = b.chartType || "table";
      render();
    });
  }

  Studio.Build = {
    configure: configure,
    render: render,
    compute: compute,     // pure — unit-tested directly
    load: bdLoad,
    newView: bdNew,
    state: BD             // test hook (also window.__studioBuild below)
  };
  window.__studioBuild = { state: BD, addField: bdAddField, selectDataset: bdSelectDataset, save: bdSave, load: bdLoad,
    addFilter: bdAddFilter, filteredRows: bdFilteredRows, rerender: render };
})();
