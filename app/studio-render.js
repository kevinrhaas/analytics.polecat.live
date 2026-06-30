/* ============================================================================
   studio-render.js — runs INSIDE the dashboard (preview iframe AND exported
   CDF html). Reads window.STUDIO_SPEC and renders it through the PDC toolkit,
   so the live preview is byte-identical to the deployed CDF dashboard.
   Depends only on PDC (vendor/pdc-ui.js). No build step.
   ============================================================================ */
(function () {
  "use strict";
  var SR = window.StudioRender = {};
  // read lazily — the boot script may set STUDIO_PREVIEW AFTER this file loads
  function isPreview() { return !!window.STUDIO_PREVIEW; }

  // Studio.icon() is NOT available here (iframe scope). Tiny inline SVG helper for builder-only buttons.
  function iSvg(d, sz) {
    return '<svg viewBox="0 0 24 24" width="' + sz + '" height="' + sz + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }
  var I_DUP   = iSvg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', 13);
  var I_CLOSE = iSvg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', 12);

  function fmt(id) {
    if (id === "plain" || !id) return function (v) { return v == null ? "" : String(v); };
    return (PDC.fmt[id] || PDC.fmt.abbr);
  }
  function color(tok, fallback) {
    if (!tok) return fallback ? PDC.cssvar(fallback) : undefined;
    return /^--/.test(tok) ? PDC.cssvar(tok) : tok;
  }
  // result -> [{label,value(,color)}]
  function lv(res, labelCol, valueCol) {
    var li = res.col(labelCol), vi = res.col(valueCol);
    return res.rows.map(function (r) { return { label: String(r[li]), value: +r[vi] || 0 }; });
  }
  function colVals(res, c) { var i = res.col(c); return res.rows.map(function (r) { return r[i]; }); }

  // params actually declared by a data access (avoid sending unknowns)
  function paramsFor(spec, daId, state) {
    var da = (spec.cda.dataAccesses || []).filter(function (d) { return d.id === daId; })[0];
    if (!da || !da.params || !da.params.length) return undefined;
    var out = {};
    da.params.forEach(function (p) {
      out[p.name] = (state && state[p.name] != null) ? state[p.name] : (p.default != null ? p.default : "%");
    });
    return out;
  }

  /* ---- one panel ---- */
  function renderPanel(spec, p, data, body) {
    var ch = p.chart, o = ch.opts || {}, m = ch.map || {}, res = data[ch.da];
    if (!res) { body.innerHTML = '<div class="empty">No query bound</div>'; return; }
    var f = fmt(o.fmt);
    try {
      switch (ch.type) {
        case "bars":
          PDC.bars(body, { horizontal: o.horizontal !== false, rotate: !!o.rotate, fmt: f,
            color: color(o.color, "--pentaho"), height: o.height || 300, data: lv(res, m.labelCol, m.valueCol) });
          break;
        case "donut":
          PDC.donut(body, { centerCap: o.centerCap || "Total", fmt: f, height: o.height || 300,
            data: lv(res, m.labelCol, m.valueCol) });
          break;
        case "treemap":
          PDC.treemap(body, { fmt: f, height: o.height || 300, data: lv(res, m.labelCol, m.valueCol) });
          break;
        case "line":
        case "stacked":
        case "areaStacked":
        case "radar":
          var labels = colVals(res, m.labelCol).map(String);
          var series = (m.series || []).map(function (s, i) {
            return { name: s.name || s.col, color: color(s.color, "--c" + ((i % 10) + 1)),
                     values: colVals(res, s.col).map(function (v) { return +v || 0; }) };
          });
          if (ch.type === "line")
            PDC.line(body, { area: o.area !== false, fmt: f, height: o.height || 300, labels: labels, series: series });
          else if (ch.type === "areaStacked")
            PDC.areaStacked(body, { fmt: f, height: o.height || 300, labels: labels, series: series });
          else if (ch.type === "radar")
            PDC.radar(body, { fill: o.fill !== false, fmt: f, height: o.height || 300, labels: labels, series: series });
          else
            PDC.stacked(body, { rotate: !!o.rotate, fmt: f, height: o.height || 300,
              categories: labels, series: series.map(function (s) { return { name: s.name, color: s.color, values: s.values }; }) });
          break;
        case "combo":
          PDC.combo(body, { height: o.height || 300, fmt: f, fmt2: fmt(o.fmt2),
            labels: colVals(res, m.labelCol).map(String),
            bars: { name: m.barCol, color: color(o.color, "--pentaho"), values: colVals(res, m.barCol) },
            line: { name: m.lineCol, color: color(o.lineColor, "--pdc"), values: colVals(res, m.lineCol) } });
          break;
        case "scatter":
          var xi = res.col(m.xCol), yi = res.col(m.yCol), ri = m.rCol ? res.col(m.rCol) : -1, lbi = m.labelCol ? res.col(m.labelCol) : -1;
          PDC.scatter(body, { height: o.height || 300, xLabel: o.xLabel || m.xCol, yLabel: o.yLabel || m.yCol,
            points: res.rows.map(function (r) {
              return { x: +r[xi] || 0, y: +r[yi] || 0, r: ri >= 0 ? +r[ri] || 1 : 1, label: lbi >= 0 ? String(r[lbi]) : "" };
            }) });
          break;
        case "waterfall":
          PDC.waterfall(body, { height: o.height || 300, fmt: f,
            showTotal: o.showTotal !== false, totalLabel: o.totalLabel || "Total",
            labels: colVals(res, m.labelCol).map(String),
            values: colVals(res, m.valueCol).map(function (v) { return +v || 0; }) });
          break;
        case "funnel":
          PDC.funnel(body, { height: o.height || 300, fmt: f,
            showPct: o.showPct !== false,
            labels: colVals(res, m.labelCol).map(String),
            values: colVals(res, m.valueCol).map(function (v) { return +v || 0; }) });
          break;
        case "sunburst":
          PDC.sunburst(body, { height: o.height || 300, fmt: f,
            showLabels: o.showLabels !== false,
            labels: colVals(res, m.labelCol).map(String),
            values: colVals(res, m.valueCol).map(function (v) { return +v || 0; }),
            groups: m.groupCol ? colVals(res, m.groupCol).map(String) : null });
          break;
        case "bullet": {
          var lblI = m.labelCol ? res.col(m.labelCol) : -1;
          var valI = res.col(m.valueCol), tgtI = m.targetCol ? res.col(m.targetCol) : -1;
          var brows = res.rows.map(function (r) {
            return { label: lblI >= 0 ? String(r[lblI]) : p.title, value: +r[valI] || 0, target: tgtI >= 0 ? +r[tgtI] : null };
          });
          PDC.bullet(body, { rows: brows, max: o.max || 0, fmt: f, height: o.height || 220 });
          break;
        }
        case "calHeatmap": {
          var dI = res.col(m.dateCol), vI2 = res.col(m.valueCol);
          var itms = res.rows.map(function (r) { return { date: String(r[dI] || ""), value: +r[vI2] || 0 }; });
          PDC.calHeatmap(body, { items: itms, fmt: f, height: o.height || 190 });
          break;
        }
        case "sankey":
        case "chord": {
          var sIdx = res.col(m.sourceCol), tIdx = res.col(m.targetCol), vIdx = res.col(m.valueCol);
          var links = res.rows.map(function (r) { return { source: String(r[sIdx]), target: String(r[tIdx]), value: +r[vIdx] || 0 }; }).filter(function (l) { return l.value > 0; });
          if (ch.type === "sankey")
            PDC.sankey(body, { links: links, height: o.height || 360, fmt: f, srcCap: o.srcCap || "Source", dstCap: o.dstCap || "Destination" });
          else
            PDC.chord(body, { links: links, height: o.height || 360, fmt: f });
          break;
        }
        case "gauge":
          var gv = +(res.rows[0] || [])[res.col(m.valueCol)] || 0;
          PDC.gauge(body, { value: gv, max: o.max || 100, unit: o.unit || "%", label: p.title });
          break;
        case "heatmap":
          var ri2 = res.col(m.rowCol), ci2 = res.col(m.colCol), vi2 = res.col(m.valueCol);
          var rowKeys = [], colKeys = [], idx = {};
          res.rows.forEach(function (r) {
            var rk = String(r[ri2]), ck = String(r[ci2]);
            if (rowKeys.indexOf(rk) < 0) rowKeys.push(rk);
            if (colKeys.indexOf(ck) < 0) colKeys.push(ck);
            idx[rk + " " + ck] = +r[vi2] || 0;
          });
          var matrix = rowKeys.map(function (rk) { return colKeys.map(function (ck) { return idx[rk + " " + ck] || 0; }); });
          PDC.heatmap(body, { rows: rowKeys, cols: colKeys, matrix: matrix, fmt: f, showVals: o.showVals !== false, height: o.height || 320 });
          break;
        case "table":
          var cols = (m.cols || []).map(function (c) {
            return { label: c.label || c.col, num: !!c.num, fmt: c.fmt ? fmt(c.fmt) : null };
          });
          var idxs = (m.cols || []).map(function (c) { return res.col(c.col); });
          PDC.table(body, { cols: cols, rows: res.rows.map(function (r) { return idxs.map(function (i) { return r[i]; }); }) });
          break;
        default:
          body.innerHTML = '<div class="empty">Unknown chart type: ' + ch.type + '</div>';
      }
    } catch (e) {
      body.innerHTML = '<div class="empty">Render error: ' + (e && e.message || e) + '</div>';
    }
  }

  /* ---- whole dashboard ---- */
  function renderAll(spec, data) {
    // KPIs
    var kEl = PDC.el("kpis");
    if (kEl) {
      if ((spec.kpis || []).length) {
        PDC.kpis(kEl, spec.kpis.map(function (k) {
          var res = data[k.da], val = res ? (res.rows[0] || [])[res.col(k.valueCol)] : "—";
          var tile = { value: fmt(k.fmt)(val), label: k.label, state: k.state || "", info: k.info || "" };
          if (k.deltaText) { tile.delta = k.deltaDir === "down" ? -1 : k.deltaDir === "flat" ? 0 : 1; tile.deltaText = k.deltaText; }
          if (k.sparkCol && res) { var si = res.col(k.sparkCol); if (si >= 0) { tile.spark = res.rows.map(function (r) { return +r[si] || 0; }); tile.sparkColor = color(k.sparkColor); } }
          return tile;
        }));
        if (isPreview()) tagKpis(kEl, spec);
      } else kEl.innerHTML = "";
    }
    // panels grid
    var content = PDC.el("content"); content.innerHTML = "";
    if (!(spec.panels || []).length) {
      content.innerHTML = isPreview()
        ? '<div class="sr-empty"><div class="sr-empty-ic">▤</div><div class="sr-empty-t">Your dashboard is empty</div>' +
          '<div class="sr-empty-s">Drag a query from the <b>Query Library</b> onto this canvas — or use a <b>＋ chart</b> chip — to add your first panel.</div></div>'
        : '<div class="loading">No panels configured yet.</div>';
      return;
    }
    var g = PDC.grid(spec.gridCols || 3); content.appendChild(g);
    spec.panels.forEach(function (p) {
      var spanClass = p.span === "full" ? "full" : (p.span > 1 ? String(p.span) : null);
      var card = PDC.card(p.title || "", { pill: p.pill || "", sub: p.sub || "", info: p.info || "",
        src: p.src || "", span: spanClass });
      if (isPreview()) {
        card.el.setAttribute("data-panel-id", p.id); card.el.classList.add("sr-sel");
        var h3 = card.el.querySelector("h3");
        if (h3) { var grip = document.createElement("span"); grip.className = "sr-grip"; grip.textContent = "⠿"; grip.title = "Drag to reorder"; h3.insertBefore(grip, h3.firstChild); }
        var titleEl = card.el.querySelector(".pdc-h-t");
        if (titleEl && h3) {
          titleEl.title = "Double-click to rename";
          (function (h, t, id) { t.addEventListener("dblclick", function (e) { e.preventDefault(); e.stopPropagation(); startRename(h, t, id); }); })(h3, titleEl, p.id);
        }
        var rz = document.createElement("div"); rz.className = "sr-resize"; rz.title = "Drag to resize"; card.el.appendChild(rz);
        var acts = document.createElement("div"); acts.className = "sr-card-acts";
        acts.innerHTML = '<button class="sr-act" data-act="dup" title="Duplicate panel">' + I_DUP + '</button><button class="sr-act" data-act="del" title="Delete panel">' + I_CLOSE + '</button>';
        (function (pid) {
          acts.querySelector('[data-act="dup"]').addEventListener("click", function (e) { e.stopPropagation(); post({ type: "panel-dup", id: pid }); });
          acts.querySelector('[data-act="del"]').addEventListener("click", function (e) { e.stopPropagation(); post({ type: "panel-delete", id: pid }); });
        })(p.id);
        card.el.appendChild(acts);
      }
      g.appendChild(card.el);
      renderPanel(spec, p, data, card.body);
    });
    if (isPreview()) { wireSelection(); wireEditing(spec); }
  }

  // collect every dataAccess id the dashboard needs
  function neededDAs(spec) {
    var ids = {};
    (spec.kpis || []).forEach(function (k) { if (k.da) ids[k.da] = 1; });
    (spec.panels || []).forEach(function (p) { if (p.chart.da) ids[p.chart.da] = 1; });
    return Object.keys(ids);
  }

  function load(spec) {
    var content = PDC.el("content");
    if (content) content.innerHTML = '<div class="loading">Loading…</div>';
    PDC.resetCharts();
    var das = neededDAs(spec), state = PDC.filterState || {};
    var reqs = {};
    das.forEach(function (id) { reqs[id] = [id, paramsFor(spec, id, state)]; });
    if (!das.length) { renderAll(spec, {}); return Promise.resolve(); }
    return PDC.load(reqs).then(function (data) { renderAll(spec, data); })
      .catch(function (e) { PDC.fail("Could not load data. " + (e && e.message || "")); if (window.console) console.error(e); });
  }

  SR.boot = function (spec) {
    spec = spec || window.STUDIO_SPEC;
    if (!spec) return;
    PDC.initTheme();
    var tb = PDC.el("themeBtn");
    if (tb) {
      var _dark = document.documentElement.getAttribute("data-theme") === "dark";
      var _moonSvg = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
      var _sunSvg = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
      tb.innerHTML = (_dark ? _sunSvg : _moonSvg) + " " + (_dark ? "Light" : "Dark");
      tb.setAttribute("aria-label", _dark ? "Switch to light mode" : "Switch to dark mode");
    }
    // E4: extend PDC.urlParams to also read location.hash for deep-link filter pre-selection
    (function () { var _up = PDC.urlParams; PDC.urlParams = function () { var o = _up(); try { var h = (window.location.hash || "").replace(/^#/, ""); if (h) h.split("&").forEach(function (kv) { if (!kv) return; var i = kv.indexOf("="); var k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i)); if (k && o[k] == null) o[k] = decodeURIComponent(i < 0 ? "" : kv.slice(i + 1).replace(/\+/g, " ")); }); } catch (e) {} return o; }; })();
    if ((spec.filters || []).length) {
      // initial: load each filter's option query (with current/default params), build the bar
      loadFilterOptions(spec).then(function (fdata) {
        var defs = spec.filters.map(function (f) { return filterDef(f, fdata, spec); });
        PDC.filters(defs, function () { load(spec); cascadeFilters(spec); });
        load(spec);
      }).catch(function () { load(spec); });
    } else {
      load(spec);
    }
  };
  // load the option resultset for every filter, honoring current filter state (so downstream cascade)
  function loadFilterOptions(spec) {
    var fr = {}; spec.filters.forEach(function (f) { fr["__f_" + f.id] = [f.da, paramsFor(spec, f.da, PDC.filterState || {})]; });
    return PDC.load(fr);
  }
  function filterDef(f, fdata, spec) {
    var res = fdata["__f_" + f.id], def = f.def != null ? f.def : "%", opts = [{ v: def, t: f.allLabel || "All" }];
    if (res) { var vi = res.col(f.valueCol), ti = res.col(f.textCol || f.valueCol); res.rows.forEach(function (r) { opts.push({ v: String(r[vi]), t: String(r[ti]) }); }); }
    return { id: f.id, label: f.label, options: opts, def: def };
  }
  // a filter "cascades" if its option query declares any parameter → its options depend on other filters
  function isParameterized(spec, f) { var d = (spec.cda.dataAccesses || []).filter(function (x) { return x.id === f.da; })[0]; return !!(d && d.params && d.params.length); }
  function cascadeFilters(spec) {
    var deps = (spec.filters || []).filter(function (f) { return isParameterized(spec, f); });
    if (!deps.length) return;
    var fr = {}; deps.forEach(function (f) { fr["__f_" + f.id] = [f.da, paramsFor(spec, f.da, PDC.filterState || {})]; });
    PDC.load(fr).then(function (fdata) {
      deps.forEach(function (f) {
        var sel = PDC.el("f_" + f.id); if (!sel) return;
        var cur = sel.value, def = filterDef(f, fdata, spec);
        sel.innerHTML = ""; def.options.forEach(function (o) { var op = document.createElement("option"); op.value = o.v; op.textContent = o.t; sel.appendChild(op); });
        sel.value = cur; if (sel.value !== cur) sel.value = def.def;     // keep selection if still valid
        PDC.filterState[f.id] = sel.value;
      });
    }).catch(function () {});
  }
  SR.reload = function () { if (window.STUDIO_SPEC) load(window.STUDIO_SPEC); };

  /* ---- builder-only: click a panel/KPI -> tell the parent to select it ---- */
  function tagKpis(kEl, spec) {
    var tiles = kEl.querySelectorAll(".kpi");
    [].forEach.call(tiles, function (t, i) {
      t.setAttribute("data-kpi-index", i); t.classList.add("sr-sel");
      var x = document.createElement("button"); x.className = "sr-kpi-del"; x.innerHTML = I_CLOSE; x.title = "Delete KPI";
      x.addEventListener("click", function (e) { e.stopPropagation(); post({ type: "kpi-delete", index: i }); });
      t.appendChild(x);
    });
  }
  function wireSelection() {
    document.querySelectorAll("[data-panel-id]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        if (e.target.closest("a") || e.target.closest(".sr-card-acts")) return;
        post({ type: "select", kind: "panel", id: el.getAttribute("data-panel-id") });
      }, true);
    });
    document.querySelectorAll("[data-kpi-index]").forEach(function (el) {
      el.addEventListener("click", function () {
        post({ type: "select", kind: "kpi", index: +el.getAttribute("data-kpi-index") });
      }, true);
    });
  }
  function post(msg) { try { parent.postMessage(Object.assign({ studio: 1 }, msg), "*"); } catch (e) {} }

  // builder-only: double-click a panel title to rename it inline (commit on Enter/blur, cancel on Esc)
  function startRename(h3, titleEl, id) {
    var node = titleEl.firstChild, cur = (node && node.nodeType === 3 ? node.textContent : titleEl.textContent).trim();
    var inp = document.createElement("input"); inp.className = "sr-rename"; inp.value = cur;
    titleEl.style.display = "none"; h3.insertBefore(inp, titleEl); inp.focus(); inp.select();
    var done = false;
    function commit(save) {
      if (done) return; done = true; inp.remove(); titleEl.style.display = "";
      var v = inp.value.trim(); if (save && v && v !== cur) post({ type: "rename", id: id, title: v });
    }
    inp.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); commit(true); } else if (ev.key === "Escape") { commit(false); } });
    inp.addEventListener("blur", function () { commit(true); });
    inp.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
  }

  /* ---- builder-only: drag a card header to reorder · drag the right edge to resize ---- */
  function applySpan(card, span) {
    card.classList.remove("span-2", "span-3", "span-4", "span-full");
    if (span === "full") card.classList.add("span-full");
    else if (span > 1) card.classList.add("span-" + span);
  }
  function wireEditing(spec) {
    var content = PDC.el("content"); if (!content) return;
    var grid = content.querySelector(".pdc-grid"); if (!grid) return;
    var cards = [].slice.call(grid.querySelectorAll("[data-panel-id]"));
    var ids = function () { return [].slice.call(grid.querySelectorAll("[data-panel-id]")).map(function (c) { return c.getAttribute("data-panel-id"); }); };

    // ── reorder (cross-row): insertion caret + cursor ghost, drop anywhere ──
    grid.style.position = grid.style.position || "relative";
    var caret = document.createElement("div"); caret.className = "sr-caret"; caret.style.display = "none"; grid.appendChild(caret);
    var dragEl = null, ghost = null, insertIdx = -1, moved = false, sx = 0, sy = 0;
    function others() { return [].slice.call(grid.querySelectorAll("[data-panel-id]")).filter(function (c) { return c !== dragEl; }); }
    function showCaret(target, after) {
      var gr = grid.getBoundingClientRect(), r = target.getBoundingClientRect();
      caret.style.display = "block";
      caret.style.left = ((after ? r.right : r.left) - gr.left - 1) + "px";
      caret.style.top = (r.top - gr.top) + "px"; caret.style.height = r.height + "px";
    }
    function onMove(e) {
      if (!dragEl) return;
      if (!moved && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) < 5) return;
      if (!moved) {
        moved = true; dragEl.classList.add("sr-dragging"); dragEl.style.pointerEvents = "none"; document.body.style.userSelect = "none";
        ghost = document.createElement("div"); ghost.className = "sr-ghost";
        ghost.textContent = (dragEl.querySelector(".pdc-h-t") || dragEl.querySelector("h3") || {}).textContent || "panel";
        document.body.appendChild(ghost);
      }
      if (ghost) { ghost.style.left = (e.clientX + 14) + "px"; ghost.style.top = (e.clientY + 16) + "px"; }
      var t = document.elementFromPoint(e.clientX, e.clientY); t = t && t.closest("[data-panel-id]");
      var rest = others(), order = rest.map(function (c) { return c.getAttribute("data-panel-id"); });
      if (t && t !== dragEl) {
        var r = t.getBoundingClientRect(), after = e.clientX > r.left + r.width / 2;
        showCaret(t, after);
        var ti = order.indexOf(t.getAttribute("data-panel-id")); insertIdx = after ? ti + 1 : ti;
      } else if (rest.length) {
        // empty grid space / end zone → drop after the last panel
        showCaret(rest[rest.length - 1], true); insertIdx = order.length;
      } else { caret.style.display = "none"; insertIdx = 0; }
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointercancel", onUp);
      if (dragEl && moved && insertIdx >= 0) {
        var order = others().map(function (c) { return c.getAttribute("data-panel-id"); });
        order.splice(Math.min(insertIdx, order.length), 0, dragEl.getAttribute("data-panel-id"));
        post({ type: "reorder", order: order });
      }
      if (dragEl) { dragEl.classList.remove("sr-dragging"); dragEl.style.pointerEvents = ""; }
      if (ghost) { ghost.remove(); ghost = null; }
      caret.style.display = "none"; document.body.style.userSelect = ""; dragEl = null; insertIdx = -1; moved = false;
    }
    cards.forEach(function (card) {
      var handle = card.querySelector("h3") || card;
      handle.style.touchAction = "none";
      handle.addEventListener("pointerdown", function (e) {
        if ((e.button !== 0 && e.pointerType !== "touch") || e.target.closest(".sr-resize") || e.target.closest(".sr-rename") || e.target.closest("a") || e.target.closest(".pdc-i") || e.target.closest(".src")) return;
        try { e.target.setPointerCapture(e.pointerId); } catch (x) {}
        dragEl = card; moved = false; sx = e.clientX; sy = e.clientY;
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp, { once: true });
        window.addEventListener("pointercancel", onUp, { once: true });
      });
    });

    // ── resize (drag the right edge → column span) ──
    cards.forEach(function (card) {
      var h = card.querySelector(".sr-resize"); if (!h) return;
      h.style.touchAction = "none";
      h.addEventListener("pointerdown", function (e) {
        e.preventDefault(); e.stopPropagation();
        try { e.target.setPointerCapture(e.pointerId); } catch (x) {}
        var gcols = spec.gridCols || 3, gridRect = grid.getBoundingClientRect(), colW = gridRect.width / gcols, left = card.getBoundingClientRect().left, cur = null;
        document.body.style.userSelect = "none";
        function rz(ev) {
          var span = Math.max(1, Math.min(gcols, Math.round((ev.clientX - left) / colW)));
          var sv = span >= gcols ? "full" : span;
          if (sv !== cur) { cur = sv; applySpan(card, sv); PDC.redrawAll(); }
        }
        function up() {
          window.removeEventListener("pointermove", rz); window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
          document.body.style.userSelect = "";
          if (cur != null) post({ type: "resize", id: card.getAttribute("data-panel-id"), span: cur });
        }
        window.addEventListener("pointermove", rz); window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
      });
    });
  }

  // always register — only reacts to Studio messages (no-op in a deployed dashboard)
  window.addEventListener("message", function (e) {
      var d = e.data || {};
      if (d.studio !== 1) return;
      if (d.type === "highlight") {
        document.querySelectorAll(".sr-active").forEach(function (el) { el.classList.remove("sr-active"); });
        var sel = d.kind === "kpi" ? document.querySelector('[data-kpi-index="' + d.index + '"]')
                                   : document.querySelector('[data-panel-id="' + d.id + '"]');
        if (sel) { sel.classList.add("sr-active"); sel.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
      } else if (d.type === "theme") {
        document.documentElement.setAttribute("data-theme", d.value); PDC.redrawAll();
      }
  });

  // auto-boot when spec already present (export html sets it inline before this script)
  if (window.STUDIO_SPEC && window.STUDIO_AUTOBOOT !== false) {
    if (document.readyState !== "loading") SR.boot();
    else document.addEventListener("DOMContentLoaded", function () { SR.boot(); });
  }
})();
