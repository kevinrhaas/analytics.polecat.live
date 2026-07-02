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
  var I_MAXIMIZE = iSvg('<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>', 13);

  function fmt(id) {
    if (id === "plain" || !id) return function (v) { return v == null ? "" : String(v); };
    return (PDC.fmt[id] || PDC.fmt.abbr);
  }
  function color(tok, fallback) {
    if (!tok) return fallback ? PDC.cssvar(fallback) : undefined;
    return /^--/.test(tok) ? PDC.cssvar(tok) : tok;
  }
  // Build a PDC.openDetail config from p.detail — used by bars, donut, treemap, table.
  // Returns null when no detail DA is configured so charts render without the drawer.
  function buildDetailCfg(p) {
    var d = p.detail;
    if (!d || !d.da) return null;
    var prefix = d.titlePrefix || "";
    return {
      da: d.da,
      param: d.param || "label",
      noun: d.noun || "records",
      title: function (label) { return prefix ? prefix + " " + label : String(label); }
    };
  }
  // Evaluate conditional formatting rules against a numeric value — returns a CSS color
  // string for the first matching rule, or null when no rule matches.
  // Rules are {op:">="|">"|"<="|"<"|"="|"!=", value:number, color:hexColor}.
  function evalCondFmt(rules, value) {
    if (!rules || !rules.length) return null;
    var n = +value;
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i]; if (!r || !r.color) continue;
      var t = +r.value;
      var m = (r.op === ">=" && n >= t) || (r.op === ">"  && n > t)  ||
              (r.op === "<=" && n <= t) || (r.op === "<"  && n < t)  ||
              (r.op === "="  && n === t) || (r.op === "!=" && n !== t);
      if (m) return /^--/.test(r.color) ? PDC.cssvar(r.color) : r.color;
    }
    return null;
  }
  // Apply condFmt rules to a label-value array (bars, donut, treemap, lollipop).
  // Items matching a rule receive a .color property; others are returned unchanged.
  function cfData(data, rules) {
    if (!rules || !rules.length) return data;
    return data.map(function (d) {
      var c = evalCondFmt(rules, d.value);
      return c ? { label: d.label, value: d.value, color: c } : d;
    });
  }
  // Interpolate between two #RRGGBB hex colors at position t ∈ [0,1].
  function hexInterp(a, b, t) {
    function ph(h) { h = h.replace("#",""); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
    function th(n) { return ("0" + Math.round(Math.max(0,Math.min(255,n))).toString(16)).slice(-2); }
    var ca = ph(a), cb = ph(b);
    return "#" + th(ca[0]+(cb[0]-ca[0])*t) + th(ca[1]+(cb[1]-ca[1])*t) + th(ca[2]+(cb[2]-ca[2])*t);
  }
  // Apply a continuous color gradient to a label-value array (color scale encoding).
  // scale = {enabled, low:'#hex', high:'#hex'} from p.colorScale.
  // Called BEFORE cfData so condFmt threshold rules always override the gradient.
  function csData(data, scale) {
    if (!scale || !scale.enabled || !data || !data.length) return data;
    var low  = /^#[0-9a-fA-F]{6}$/.test(scale.low)  ? scale.low  : "#005bb5";
    var high = /^#[0-9a-fA-F]{6}$/.test(scale.high) ? scale.high : "#c0392b";
    var vals = data.map(function (d) { return +d.value || 0; });
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), rng = mx - mn;
    return data.map(function (d) {
      var t = rng > 0 ? ((+d.value || 0) - mn) / rng : 0.5;
      return { label: d.label, value: d.value, color: hexInterp(low, high, t) };
    });
  }
  // Minimal markdown → safe HTML for richtext panels.
  // Escapes HTML first, then applies block- and inline-level markdown.
  // No XSS risk: content is authored by the SE in the inspector textarea.
  function mdToHtml(raw) {
    if (!raw || !raw.trim()) return '<span class="sr-rt-placeholder">Add content in the inspector…</span>';
    function he(t) { return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
    // Inline transforms run on already-escaped text (*, _, ` don't need escaping)
    function inl(t) {
      return he(t)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/_([^_\n]+)_/g, "<em>$1</em>")
        .replace(/`([^`\n]+)`/g, "<code>$1</code>");
    }
    var out = "", inUL = false, buf = [];
    function fp() { if (buf.length) { out += "<p>" + buf.join("<br>") + "</p>"; buf = []; } }
    function fl() { if (inUL) { out += "</ul>"; inUL = false; } }
    raw.split("\n").forEach(function (ln) {
      var hm = ln.match(/^(#{1,4})\s+(.+)/), lim = ln.match(/^[-*]\s+(.+)/), hr = /^-{3,}$/.test(ln.trim());
      if (hm)      { fl(); fp(); out += "<h" + hm[1].length + ">" + inl(hm[2]) + "</h" + hm[1].length + ">"; }
      else if (lim) { fp(); if (!inUL) { out += "<ul>"; inUL = true; } out += "<li>" + inl(lim[1]) + "</li>"; }
      else if (hr)  { fl(); fp(); out += "<hr>"; }
      else if (!ln.trim()) { fl(); fp(); }
      else           { fl(); buf.push(inl(ln)); }
    });
    fl(); fp();
    return out || "<em>" + he(raw) + "</em>";
  }

  // result -> [{label,value(,color)}]
  function lv(res, labelCol, valueCol) {
    var li = res.col(labelCol), vi = res.col(valueCol);
    return res.rows.map(function (r) { return { label: String(r[li]), value: +r[vi] || 0 }; });
  }
  function colVals(res, c) { var i = res.col(c); return res.rows.map(function (r) { return r[i]; }); }

  // ---- Cross-filter state: paramName → active label (or absent when cleared).
  //      Lives at module scope so it survives re-renders within one iframe session.
  var _crossFilters = {};

  // Toggle a cross-filter selection (same label = deselect) then reload all panels.
  function xfEmit(param, label, spec) {
    if (_crossFilters[param] === label) delete _crossFilters[param];
    else _crossFilters[param] = label;
    load(spec);
  }

  // After a chart renders, tag each data element with its label and wire click-to-filter.
  // Supports bars (rect.bar in data order, or value-desc order when "Sort by value" is on),
  // donut (svg path in data order, or value-desc order when "Sort slices" is on), and
  // treemap (rect.bar always sorted by value descending, mirroring PDC._treemap's sort).
  function wireXFilter(body, param, lvData, spec, chartType, sortByValue) {
    if (!param || !lvData || !lvData.length) return;
    var els, sorted = lvData;
    if (chartType === "bars" || chartType === "treemap") {
      els = [].slice.call(body.querySelectorAll("rect.bar"));
      // Treemap always pre-sorts by value desc; bars only sorts when "Sort by value" is on.
      // Mirror both here so a click on a bar/tile maps back to the right label.
      if (chartType === "treemap" || (chartType === "bars" && sortByValue))
        sorted = lvData.slice().sort(function (a, b) { return (+b.value || 0) - (+a.value || 0); });
    } else if (chartType === "donut") {
      els = [].slice.call(body.querySelectorAll("svg path"));
      // Donut's own "Sort slices by value" option reorders its rendered paths; mirror
      // that here too so a click on a slice maps back to the right label.
      if (sortByValue) sorted = lvData.slice().sort(function (a, b) { return (+b.value || 0) - (+a.value || 0); });
    } else {
      return;
    }
    sorted.forEach(function (d, i) {
      var el = els[i]; if (!el) return;
      el.setAttribute("data-xf-label", d.label);
    });
    // Single delegated listener on the container
    body.addEventListener("click", function (e) {
      var t = e.target;
      while (t && t !== body) { if (t.getAttribute && t.getAttribute("data-xf-label") != null) break; t = t.parentNode; }
      if (!t || t === body) return;
      e.stopPropagation();
      xfEmit(param, t.getAttribute("data-xf-label"), spec);
    });
    // Dim non-selected elements when a filter is active
    var active = _crossFilters[param];
    if (active != null) {
      els.forEach(function (el) {
        if (el.getAttribute("data-xf-label") != null)
          el.style.opacity = el.getAttribute("data-xf-label") === active ? "1" : "0.18";
      });
    }
  }

  // params actually declared by a data access (avoid sending unknowns).
  // Cross-filters override filter-bar state; filter-bar overrides defaults.
  function paramsFor(spec, daId, state) {
    var da = (spec.cda.dataAccesses || []).filter(function (d) { return d.id === daId; })[0];
    if (!da || !da.params || !da.params.length) return undefined;
    var out = {};
    da.params.forEach(function (p) {
      var xfVal = _crossFilters[p.name];
      out[p.name] = xfVal != null ? xfVal
        : (state && state[p.name] != null) ? state[p.name]
        : (p.default != null ? p.default : "%");
    });
    return out;
  }

  /* ---- one panel ---- */
  function renderPanel(spec, p, data, body) {
    var ch = p.chart, o = ch.opts || {}, m = ch.map || {}, res = data[ch.da];
    // richtext panels carry no DA; skip the "no query bound" guard for them
    if (!res && ch.type !== "richtext") { body.innerHTML = '<div class="empty">No query bound</div>'; return; }
    // Honour per-panel animate toggle: canAnim() / animD() in studio-charts.js read these flags.
    PDC._anim = p.animate !== false;
    PDC._animD = p.animDuration || 600;
    var f = fmt(o.fmt);
    // drill-through: pass PDC.bindDrill config to charts that natively support cfg.drill
    var drillCfg = (p.drill && p.drill.url) ? { to: p.drill.url, param: p.drill.param || "" } : null;
    // detail drawer: pass PDC.bindDetail config — bars, donut, treemap, table all support cfg.detail
    var detailCfg = buildDetailCfg(p);
    try {
      switch (ch.type) {
        case "bars":
          PDC.bars(body, { horizontal: o.horizontal !== false, rotate: !!o.rotate, fmt: f,
            sortBars: !!o.sortBars, showValues: o.showValues !== false,
            color: color(o.color, "--pentaho"), height: o.height || 300,
            data: cfData(csData(lv(res, m.labelCol, m.valueCol), p.colorScale), p.condFmt),
            drill: drillCfg, detail: detailCfg });
          break;
        case "donut":
          PDC.donut(body, { centerCap: o.centerCap || "Total", fmt: f, height: o.height || 300,
            sortSlices: !!o.sortSlices, legend: o.showLegend !== false, innerPct: o.innerPct,
            data: cfData(csData(lv(res, m.labelCol, m.valueCol), p.colorScale), p.condFmt), drill: drillCfg, detail: detailCfg });
          break;
        case "treemap":
          PDC.treemap(body, { fmt: f, height: o.height || 300,
            showLabels: o.showLabels !== false, showPct: !!o.showPct,
            data: cfData(csData(lv(res, m.labelCol, m.valueCol), p.colorScale), p.condFmt), detail: detailCfg });
          break;
        case "line":
        case "stacked":
        case "areaStacked":
        case "streamgraph":
        case "radar":
        case "step":
          var labels = colVals(res, m.labelCol).map(String);
          var series = (m.series || []).map(function (s, i) {
            return { name: s.name || s.col, color: color(s.color, "--c" + ((i % 10) + 1)),
                     values: colVals(res, s.col).map(function (v) { return +v || 0; }) };
          });
          if (ch.type === "line")
            PDC.line(body, { area: o.area !== false, smooth: !!o.smooth, showDots: o.showDots !== false,
              showMA: !!o.showMA, maWindow: o.maWindow,
              showTrend: !!o.showTrend, forecastPeriods: o.forecastPeriods,
              fmt: f, height: o.height || 300, labels: labels, series: series });
          else if (ch.type === "areaStacked")
            PDC.areaStacked(body, { smooth: !!o.smooth, legend: o.showLegend !== false,
              fmt: f, height: o.height || 300, labels: labels, series: series });
          else if (ch.type === "streamgraph")
            PDC.streamgraph(body, { fmt: f, height: o.height || 300, legend: o.showLegend !== false,
              opacity: o.bandOpacity, labels: labels, series: series });
          else if (ch.type === "radar")
            PDC.radar(body, { fill: o.fill !== false, legend: o.showLegend !== false, showDots: o.showDots !== false,
              fmt: f, height: o.height || 300, labels: labels, series: series });
          else if (ch.type === "step")
            PDC.step(body, { area: !!o.area, fmt: f, height: o.height || 300, labels: labels, series: series });
          else
            PDC.stacked(body, { rotate: !!o.rotate, sortStack: !!o.sortStack, showValues: !!o.showValues,
              fmt: f, height: o.height || 300,
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
          // o.fmt didn't exist on scatter panels before this option was added, so fall back
          // to abbr (the chart's true default) rather than the ambient plain/identity fallback.
          var sf = o.fmt ? f : PDC.fmt.abbr;
          PDC.scatter(body, { height: o.height || 300, xLabel: o.xLabel || m.xCol, yLabel: o.yLabel || m.yCol,
            fmtX: sf, fmtY: sf, trend: !!o.trend,
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
          PDC.calHeatmap(body, { items: itms, fmt: f, height: o.height || 190,
            color: color(o.color, "--pentaho"), weekStart: o.weekStart || "mon" });
          break;
        }
        case "sankey":
        case "chord":
        case "network": {
          var sIdx = res.col(m.sourceCol), tIdx = res.col(m.targetCol), vIdx = res.col(m.valueCol);
          var links = res.rows.map(function (r) { return { source: String(r[sIdx]), target: String(r[tIdx]), value: +r[vIdx] || 0 }; }).filter(function (l) { return l.value > 0; });
          if (ch.type === "sankey")
            PDC.sankey(body, { links: links, height: o.height || 360, fmt: f, srcCap: o.srcCap || "Source", dstCap: o.dstCap || "Destination" });
          else if (ch.type === "chord")
            PDC.chord(body, { links: links, height: o.height || 360, fmt: f, showLabels: o.showLabels !== false });
          else
            PDC.network(body, { links: links, height: o.height || 380, fmt: f, showLabels: o.showLabels !== false });
          break;
        }
        case "gauge":
          var gv = +(res.rows[0] || [])[res.col(m.valueCol)] || 0;
          var gUnit = o.unit != null ? o.unit : "%";
          // PDC.fmt.pct already appends its own "%" — don't also tack on the default unit,
          // or a gauge left at fmt:"pct" + the default Unit:"%" reads "42.3%%".
          if (o.fmt === "pct" && gUnit === "%") gUnit = "";
          PDC.gauge(body, {
            value: gv, max: o.max || 100, unit: gUnit, label: p.title, fmt: f,
            warnAt: (o.warnAt != null ? o.warnAt : 70) / 100,
            goodAt: (o.goodAt != null ? o.goodAt : 90) / 100
          });
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
          var tblRows = res.rows.map(function (r) { return idxs.map(function (i) { return r[i]; }); });
          if (o.maxRows > 0) tblRows = tblRows.slice(0, o.maxRows);
          PDC.table(body, { cols: cols, rows: tblRows, detail: detailCfg, grandTotal: !!o.grandTotal,
            pageSize: o.pageSize || 0, freezeHeader: !!o.freezeHeader, density: o.density || "comfortable" });
          break;
        case "richtext":
          // Text/annotation panel — no DA; content in chart.opts.content (light markdown)
          body.innerHTML = '<div class="sr-richtext">' + mdToHtml(o.content || "") + '</div>';
          break;
        case "boxplot": {
          // Group rows by labelCol, collect valueCol numbers, then compute quartiles in _boxplot.
          var bpLi = res.col(m.labelCol), bpVi = res.col(m.valueCol);
          var bpGroups = {}, bpOrder = [];
          res.rows.forEach(function (r) {
            var lab = String(r[bpLi] != null ? r[bpLi] : ""), val = +r[bpVi] || 0;
            if (!bpGroups[lab]) { bpGroups[lab] = { label: lab, values: [] }; bpOrder.push(lab); }
            bpGroups[lab].values.push(val);
          });
          PDC.boxplot(body, { data: bpOrder.map(function (k) { return bpGroups[k]; }),
            height: o.height || 300, fmt: f, horizontal: o.horizontal !== false });
          break;
        }
        case "lollipop":
          PDC.lollipop(body, { data: cfData(csData(lv(res, m.labelCol, m.valueCol), p.colorScale), p.condFmt),
            height: o.height || 280, fmt: f, color: color(o.color, "--pentaho") });
          break;
        case "slope": {
          var slopeItems = (function () {
            var li = res.col(m.labelCol), v1i = res.col(m.valueCol1), v2i = res.col(m.valueCol2);
            return res.rows.map(function (r) { return { label: String(r[li] || ""), v1: +r[v1i] || 0, v2: +r[v2i] || 0 }; });
          })();
          PDC.slope(body, { items: slopeItems, t1: o.t1 || "Before", t2: o.t2 || "After",
            height: o.height || 300, fmt: f });
          break;
        }
        case "dotplot": {
          // Dot plot: one dot per row at the value position. Optional groupCol adds a second
          // dot per row (compare two measures side-by-side on the same row track).
          var dpItems = (function () {
            var li = res.col(m.labelCol), v1i = res.col(m.valueCol);
            var v2i = m.groupCol ? res.col(m.groupCol) : -1;
            return res.rows.map(function (r) {
              var it = { label: String(r[li] != null ? r[li] : ""), v1: +r[v1i] || 0 };
              if (v2i >= 0) it.v2 = +r[v2i] || 0;
              return it;
            });
          })();
          PDC.dotplot(body, { items: dpItems, height: o.height || 280, fmt: f,
            sorted: o.sorted !== false,
            group1: o.group1 || m.valueCol || "Primary",
            group2: o.group2 || m.groupCol || "Compare" });
          break;
        }
        case "beeswarm": {
          // Beeswarm: each row is a dot jittered vertically to avoid overlap.
          // Optional categoryCol groups rows into labelled horizontal strips.
          var bsItems = (function () {
            var li = res.col(m.labelCol), vi = res.col(m.valueCol);
            var ci = m.categoryCol ? res.col(m.categoryCol) : -1;
            return res.rows.map(function (r) {
              var it = { label: String(r[li] != null ? r[li] : ""), value: +r[vi] || 0 };
              if (ci >= 0) it.category = String(r[ci] != null ? r[ci] : "");
              return it;
            });
          })();
          PDC.beeswarm(body, { items: bsItems, height: o.height || 300, fmt: f,
            dotR: o.dotR || 5 });
          break;
        }
        case "histogram": {
          // Histogram: auto-bins the numeric valueCol into N equal-width buckets.
          // Bars touch (no gap) to emphasise the continuous numeric range.
          var histRows = res.rows.map(function (r) {
            var v = {}; v[m.valueCol] = +r[res.col(m.valueCol)]; return v;
          });
          PDC.histogram(body, histRows, { valueCol: m.valueCol }, {
            bins: o.bins || 10, color: o.color, fmt: f, height: o.height || 300
          });
          break;
        }
        case "polarArea": {
          // Polar area chart: equal-angle wedges, radius proportional to sqrt(value).
          // Area encoding is more perceptually accurate than linear radius.
          var paLabels = [], paValues = [];
          res.rows.forEach(function (r) {
            paLabels.push(String(r[res.col(m.labelCol)] || ""));
            paValues.push(+r[res.col(m.valueCol)] || 0);
          });
          PDC.polarArea(body, {
            labels: paLabels, values: paValues,
            fmt: f, showLabels: o.showLabels !== false, height: o.height || 280
          });
          break;
        }
        case "violin": {
          // Violin plot: group rows by labelCol; collect all valueCol numbers per group;
          // pass to PDC.violin which runs Gaussian KDE + draws symmetric density silhouettes.
          var vlLi = res.col(m.labelCol), vlVi = res.col(m.valueCol);
          var vlGroups = {}, vlOrder = [];
          res.rows.forEach(function (r) {
            var lab = String(r[vlLi] != null ? r[vlLi] : "");
            var val = +r[vlVi];
            if (!isFinite(val)) return;
            if (!vlGroups[lab]) { vlGroups[lab] = { name: lab, values: [] }; vlOrder.push(lab); }
            vlGroups[lab].values.push(val);
          });
          PDC.violin(body, {
            categories: vlOrder.map(function (k) { return vlGroups[k]; }),
            showBox: o.showBox !== false, fmt: f, height: o.height || 300
          });
          break;
        }
        case "ridgeline": {
          // Ridgeline / joy plot: same grouping approach as violin — group rows by labelCol,
          // collect all valueCol numbers per group, then pass pre-grouped categories to
          // PDC.ridgeline which draws horizontally-stacked KDE density curves.
          var rlLi = res.col(m.labelCol), rlVi = res.col(m.valueCol);
          var rlGroups = {}, rlOrder = [];
          res.rows.forEach(function (r) {
            var lab = String(r[rlLi] != null ? r[rlLi] : "");
            var val = +r[rlVi];
            if (!isFinite(val)) return;
            if (!rlGroups[lab]) { rlGroups[lab] = { name: lab, values: [] }; rlOrder.push(lab); }
            rlGroups[lab].values.push(val);
          });
          PDC.ridgeline(body, {
            categories: rlOrder.map(function (k) { return rlGroups[k]; }),
            overlap: o.overlap != null ? +o.overlap : 0.4,
            fmt: f, height: o.height || 320
          });
          break;
        }
        case "bump": {
          // Bump chart: labelCol = period (x-axis); series = one numeric column per entity.
          // At each period, ranks all series by value (rank 1 = highest); draws curved lines
          // connecting each series' rank across periods. Line crossings show overtaking.
          var bumpLabels = colVals(res, m.labelCol).map(String);
          var bumpSeries = (m.series || []).map(function (s, i) {
            return { name: s.name || s.col,
                     color: color(s.color, "--c" + ((i % 10) + 1)),
                     values: colVals(res, s.col).map(function (v) { return +v || 0; }) };
          });
          PDC.bump(body, { labels: bumpLabels, series: bumpSeries, fmt: f, height: o.height || 300, showRankNumbers: o.showRankNumbers !== false });
          break;
        }
        case "marimekko": {
          // Marimekko (Mekko) chart: two-dimensional proportional stacked bars.
          // labelCol = x-axis category (column width ∝ that category's total value)
          // groupCol = stacking segment dimension (each segment = one group)
          // valueCol = numeric cell value (determines column width share + stack height share)
          var mCatCol = m.labelCol, mGrpCol = m.groupCol, mValCol = m.valueCol;
          var mRows = res.rows || [];
          PDC.marimekko(body, {
            rows:     mRows,
            cols:     res.cols || [],
            catCol:   mCatCol,
            grpCol:   mGrpCol,
            valCol:   mValCol,
            fmt:      f,
            showPct:  o.showPct !== false,
            height:   o.height || 320
          });
          break;
        }
        case "dumbbell": {
          // Dumbbell chart: labelCol = row label; startCol = baseline value; endCol = current value.
          // Renders two dots per row connected by a colored line (green=improvement, red=decline).
          var dbLi = res.col(m.labelCol), dbSi = res.col(m.startCol), dbEi = res.col(m.endCol);
          var dbItems = res.rows.map(function (r) {
            return { label: String(r[dbLi] != null ? r[dbLi] : ""),
                     start: +r[dbSi] || 0, end: +r[dbEi] || 0 };
          });
          PDC.dumbbell(body, {
            items:      dbItems,
            startLabel: o.startLabel || m.startCol || "Before",
            endLabel:   o.endLabel   || m.endCol   || "After",
            fmt:        f,
            height:     o.height || 280
          });
          break;
        }
        case "packedBubble": {
          // Packed bubble chart: each row becomes one circle whose area is proportional
          // to its numeric value. A simple force-directed packing algorithm attracts all
          // bubbles toward the container centre and repels overlapping pairs until they
          // settle in a compact, non-overlapping cluster.
          var pbLi = res.col(m.labelCol), pbVi = res.col(m.valueCol);
          var pbItems = res.rows.map(function (r) {
            return { label: String(r[pbLi] != null ? r[pbLi] : ""),
                     value: Math.max(0, +r[pbVi] || 0) };
          }).filter(function (d) { return d.value > 0; });
          PDC.packedBubble(body, {
            items:      pbItems,
            fmt:        f,
            height:     o.height || 320,
            showLabels: o.showLabels !== false
          });
          break;
        }
        case "wordCloud": {
          // Word cloud: each row is one word/phrase whose font size is proportional
          // to its numeric value (log scale). Words are placed outward from the centre
          // via an Archimedean spiral with bounding-box overlap detection.
          var wcLi = res.col(m.labelCol), wcVi = res.col(m.valueCol);
          var wcItems = res.rows.map(function (r) {
            return { label: String(r[wcLi] != null ? r[wcLi] : "").trim(),
                     value: Math.max(0, +r[wcVi] || 0) };
          }).filter(function (d) { return d.value > 0 && d.label; });
          PDC.wordCloud(body, {
            items:    wcItems,
            fmt:      f,
            height:   o.height   || 320,
            maxWords: o.maxWords || 60
          });
          break;
        }
        case "gantt": {
          // Gantt / Timeline: each row has a label, a start value, and an end value.
          // Bars float horizontally from start → end on a shared x-scale.
          var gLi = res.col(m.labelCol), gSi = res.col(m.startCol), gEi = res.col(m.endCol);
          var gRows = res.rows.map(function (r) {
            return {
              label: String(r[gLi] != null ? r[gLi] : ""),
              start: +r[gSi] || 0,
              end:   +r[gEi] || 0
            };
          }).filter(function (d) { return d.label; });
          PDC.gantt(body, {
            rows:       gRows,
            startLabel: o.startLabel || "Start",
            endLabel:   o.endLabel   || "End",
            fmt:        f,
            height:     o.height || 300
          });
          break;
        }
        case "divergingBar": {
          // Diverging bar: one bar per row extending right (positive) or left (negative)
          // from a shared zero baseline. Perfect for variance, growth rates, or sentiment.
          var dLi = res.col(m.labelCol), dVi = res.col(m.valueCol);
          var dRows = res.rows.map(function (r) {
            return {
              label: String(r[dLi] != null ? r[dLi] : ""),
              value: +r[dVi] || 0
            };
          }).filter(function (d) { return d.label; });
          PDC.divergingBar(body, {
            rows:     dRows,
            posColor: o.posColor || "--pentaho",
            negColor: o.negColor || "--pdc-bad",
            fmt:      f,
            height:   o.height || 300
          });
          break;
        }
        case "parallelCoords": {
          var pcLabels = colVals(res, m.labelCol).map(String);
          var pcAxes = (m.series || []).map(function (s) {
            return { name: s.name || s.col, values: colVals(res, s.col).map(function (v) { return +v || 0; }) };
          });
          PDC.parallelCoords(body, { labels: pcLabels, axes: pcAxes, fmt: f, opacity: o.opacity != null ? o.opacity : 70, height: o.height || 320 });
          break;
        }
        case "candlestick": {
          // Each row must supply open, high, low, close values (any numeric unit).
          // Bullish (close ≥ open) bodies use upColor; bearish use downColor.
          var csLi = res.col(m.labelCol), csOi = res.col(m.openCol);
          var csHi = res.col(m.highCol),  csLow = res.col(m.lowCol), csCi = res.col(m.closeCol);
          var csRows = res.rows.map(function (r) {
            return {
              label: String(r[csLi] != null ? r[csLi] : ""),
              open:  +r[csOi] || 0,
              high:  +r[csHi] || 0,
              low:   +r[csLow] || 0,
              close: +r[csCi] || 0
            };
          }).filter(function (d) { return d.label; });
          PDC.candlestick(body, {
            rows:      csRows,
            upColor:   o.upColor   || "--green",
            downColor: o.downColor || "--pdc-bad",
            fmt:       f,
            height:    o.height || 320
          });
          break;
        }
        case "waffle":
          PDC.waffle(body, {
            data: lv(res, m.labelCol, m.valueCol),
            cols: o.cols || 10,
            fmt:  f,
            height: o.height || 300
          });
          break;
        case "timeline": {
          // Timeline / milestone: one diamond marker per row on a horizontal baseline,
          // alternating above/below. labelCol = event name; optional dateCol = period
          // label on the opposite side of the baseline; colorCol = category palette.
          var tLi  = res.col(m.labelCol);
          var tDi  = m.dateCol   ? res.col(m.dateCol)   : -1;
          var tCi  = m.colorCol  ? res.col(m.colorCol)  : -1;
          var tCats = [];
          if (tCi >= 0) {
            res.rows.forEach(function (r) {
              var cat = String(r[tCi] != null ? r[tCi] : "");
              if (tCats.indexOf(cat) < 0) tCats.push(cat);
            });
          }
          var tEvs = res.rows.map(function (r) {
            var ev = { label: String(r[tLi] != null ? r[tLi] : "") };
            if (tDi >= 0) ev.date  = String(r[tDi] != null ? r[tDi] : "");
            if (tCi >= 0) ev.color = PDC.color(tCats.indexOf(String(r[tCi] != null ? r[tCi] : "")));
            return ev;
          }).filter(function (e) { return e.label; });
          PDC.timeline(body, { events: tEvs, height: o.height || 220 });
          break;
        }
        case "radialBar":
          PDC.radialBar(body, {
            data:   lv(res, m.labelCol, m.valueCol),
            fmt:    f,
            maxVal: o.maxVal || 0,
            height: o.height || 320
          });
          break;
        case "pyramidBar": {
          // Population pyramid: labelCol = category; leftCol and rightCol = the two numeric
          // measures rendered as mirrored horizontal bars from a shared centre axis.
          var pyLi = res.col(m.labelCol), pyLe = res.col(m.leftCol), pyRi = res.col(m.rightCol);
          var pyRows = res.rows.map(function (r) {
            return {
              label: String(r[pyLi] != null ? r[pyLi] : ""),
              left:  +r[pyLe] || 0,
              right: +r[pyRi] || 0
            };
          }).filter(function (d) { return d.label; });
          PDC.pyramidBar(body, {
            rows:       pyRows,
            leftLabel:  o.leftLabel  || m.leftCol  || "Left",
            rightLabel: o.rightLabel || m.rightCol || "Right",
            leftColor:  color(o.leftColor,  "--pdc"),
            rightColor: color(o.rightColor, "--pentaho"),
            fmt:        f,
            height:     o.height || 300
          });
          break;
        }
        case "icicle": {
          // Icicle / rectangular partition: groupCol (optional parent) + labelCol + valueCol.
          // In two-level mode (groupCol set), groups span the top row and children fill the
          // bottom portion of each group's horizontal slice (same binding as sunburst).
          var icGi = m.groupCol ? res.col(m.groupCol) : -1;
          var icLi = res.col(m.labelCol), icVi = res.col(m.valueCol);
          var icRows = res.rows.map(function (r) {
            var row = { label: String(r[icLi] != null ? r[icLi] : ""), value: +r[icVi] || 0 };
            if (icGi >= 0) row.group = String(r[icGi] != null ? r[icGi] : "Other");
            return row;
          }).filter(function (d) { return d.label; });
          PDC.icicle(body, {
            rows:     icRows,
            labelCol: "label",
            groupCol: icGi >= 0 ? "group" : "",
            valueCol: "value",
            fmt:        f,
            height:     o.height || 280,
            showLabels: o.showLabels !== false,
            showPct:    !!o.showPct
          });
          break;
        }
        case "pareto": {
          // Pareto chart: bars sorted descending + cumulative % line (80/20 rule).
          // labelCol = category; valueCol = numeric measure.
          var ptLi = res.col(m.labelCol), ptVi = res.col(m.valueCol);
          var ptData = res.rows.map(function (r) {
            return { label: String(r[ptLi] != null ? r[ptLi] : ""), value: +r[ptVi] || 0 };
          }).filter(function (d) { return d.label; });
          PDC.pareto(body, {
            data:    ptData,
            showRef: o.showRef !== false,
            fmt:     f,
            height:  o.height || 300
          });
          break;
        }
        case "groupedBars": {
          // Grouped bars: same labelCol + series binding as stacked/areaStacked.
          // Renders N groups of M side-by-side vertical bars for direct cross-series
          // comparison within each category (e.g. Q1/Q2/Q3 revenue by region).
          var gbLabels = colVals(res, m.labelCol).map(String);
          var gbSeries = (m.series || []).map(function (ser, i) {
            return {
              name:   ser.name || ser.col,
              color:  color(ser.color, "--c" + ((i % 10) + 1)),
              values: colVals(res, ser.col).map(function (v) { return +v || 0; })
            };
          });
          PDC.groupedBars(body, {
            labels:     gbLabels,
            series:     gbSeries,
            rotate:     !!o.rotate,
            showValues: !!o.showValues,
            fmt:        f,
            height:     o.height || 300
          });
          break;
        }
        case "barNorm": {
          // 100% Normalized Stacked Bar: same labelCol + series binding as stacked/groupedBars.
          // Every bar totals 100%; segments show proportional share (composition, not absolute).
          var bnLabels = colVals(res, m.labelCol).map(String);
          var bnSeries = (m.series || []).map(function (ser, i) {
            return {
              name:   ser.name || ser.col,
              color:  color(ser.color, "--c" + ((i % 10) + 1)),
              values: colVals(res, ser.col).map(function (v) { return +v || 0; })
            };
          });
          PDC.barNorm(body, {
            labels:  bnLabels,
            series:  bnSeries,
            rotate:  !!o.rotate,
            showPct: !!o.showPct,
            fmt:     f,
            height:  o.height || 300
          });
          break;
        }
        case "areaRange": {
          // Area range / confidence band: labelCol → x-axis; lowerCol + upperCol → band edges;
          // optional centerCol → bold centre line through the middle of the band.
          var arLi = res.col(m.labelCol);
          var arLow = m.lowerCol  ? res.col(m.lowerCol)  : -1;
          var arUp  = m.upperCol  ? res.col(m.upperCol)  : -1;
          var arCen = m.centerCol ? res.col(m.centerCol) : -1;
          PDC.areaRange(body, {
            labels:      res.rows.map(function (r) { return String(r[arLi] != null ? r[arLi] : ""); }),
            lower:       arLow >= 0 ? res.rows.map(function (r) { return +r[arLow] || 0; }) : [],
            upper:       arUp  >= 0 ? res.rows.map(function (r) { return +r[arUp]  || 0; }) : [],
            center:      arCen >= 0 ? res.rows.map(function (r) { return +r[arCen] || 0; }) : null,
            showCenter:  o.showCenter !== false,
            bandOpacity: o.bandOpacity != null ? o.bandOpacity / 100 : 0.22,
            fmt:         f,
            height:      o.height || 300
          });
          break;
        }
        case "quadrant": {
          // Quadrant chart: scatter-style x/y plot divided into four labelled zones by
          // configurable threshold lines — perfect for BCG matrix, effort/impact, risk grids.
          // Dots are coloured by quadrant so categorisation reads instantly.
          var qxIdx = m.xCol     ? res.col(m.xCol)     : -1;
          var qyIdx = m.yCol     ? res.col(m.yCol)     : -1;
          var qlIdx = m.labelCol ? res.col(m.labelCol) : -1;
          var qPts  = res.rows.map(function (r) {
            return { x: qxIdx >= 0 ? +r[qxIdx] || 0 : 0,
                     y: qyIdx >= 0 ? +r[qyIdx] || 0 : 0,
                     label: qlIdx >= 0 ? String(r[qlIdx] != null ? r[qlIdx] : "") : "" };
          });
          PDC.quadrant(body, {
            points:     qPts,
            xThreshold: o.xThreshold != null ? +o.xThreshold : 50,
            yThreshold: o.yThreshold != null ? +o.yThreshold : 50,
            q1Label:    o.q1 || "High Value",
            q2Label:    o.q2 || "Explore",
            q3Label:    o.q3 || "Low Priority",
            q4Label:    o.q4 || "Quick Wins",
            xLabel:     o.xLabel || m.xCol || "",
            yLabel:     o.yLabel || m.yCol || "",
            fmt:        f,
            height:     o.height || 300
          });
          break;
        }
        default:
          body.innerHTML = '<div class="empty">Unknown chart type: ' + ch.type + '</div>';
      }
    } catch (e) {
      body.innerHTML = '<div class="empty">Render error: ' + (e && e.message || e) + '</div>';
    }
    // Target line: horizontal dashed reference overlay positioned at p.targetLine.pct% from the
    // top of the chart body (card.body). Works for every chart type — position is visual, not
    // data-scaled, so there is nothing to compute against the Y axis.
    // Uses setTimeout(0) to defer past any synchronous chart drawing that clears body content,
    // then also registers in PDC._reg so it re-applies after theme-change / resize redraws.
    if (p.targetLine && p.targetLine.label) {
      var _tlPct = p.targetLine.pct != null ? +p.targetLine.pct : 30;
      var _tlColor = p.targetLine.color || "#e74c3c";
      var _tlLabel = p.targetLine.label;
      var _tlBody = body;
      function _applyTL() {
        try {
          [].slice.call(_tlBody.querySelectorAll(".pdc-target-line")).forEach(function (el) { el.remove(); });
          var tl = document.createElement("div");
          tl.className = "pdc-target-line";
          tl.style.top = _tlPct + "%";
          tl.style.borderTopColor = _tlColor;
          var tlLbl = document.createElement("span");
          tlLbl.className = "pdc-target-label";
          tlLbl.style.color = _tlColor;
          tlLbl.textContent = _tlLabel;
          tl.appendChild(tlLbl);
          _tlBody.style.position = "relative";
          _tlBody.appendChild(tl);
        } catch (etl) {}
      }
      setTimeout(_applyTL, 0);
      PDC._reg.push(_applyTL);
    }
    // Reference band: semi-transparent shaded range between topPct and bottomPct (% from chart top).
    // Uses rgba background so the band fill is translucent while the label text is solid.
    // Same defer+reg pattern as target line to survive synchronous chart renders and redraws.
    if (p.refBand && p.refBand.label) {
      var _rbTop = p.refBand.topPct != null ? +p.refBand.topPct : 20;
      var _rbBot = p.refBand.bottomPct != null ? +p.refBand.bottomPct : 50;
      var _rbHex = p.refBand.color || "#2ecc71";
      var _rbLabel = p.refBand.label;
      var _rbBody = body;
      // parse hex → rgba so the fill can be semi-transparent without affecting the label
      var _rbR = parseInt(_rbHex.slice(1,3),16), _rbG = parseInt(_rbHex.slice(3,5),16), _rbB = parseInt(_rbHex.slice(5,7),16);
      var _rbBg = "rgba(" + _rbR + "," + _rbG + "," + _rbB + ",0.14)";
      function _applyRB() {
        try {
          [].slice.call(_rbBody.querySelectorAll(".pdc-ref-band")).forEach(function (el) { el.remove(); });
          var rb = document.createElement("div");
          rb.className = "pdc-ref-band";
          rb.style.top = _rbTop + "%";
          rb.style.height = Math.max(0, _rbBot - _rbTop) + "%";
          rb.style.backgroundColor = _rbBg;
          rb.style.borderTop = "1px dashed " + _rbHex;
          rb.style.borderBottom = "1px dashed " + _rbHex;
          if (_rbLabel) {
            var rbLbl = document.createElement("span");
            rbLbl.className = "pdc-ref-label";
            rbLbl.style.color = _rbHex;
            rbLbl.textContent = _rbLabel;
            rb.appendChild(rbLbl);
          }
          _rbBody.style.position = "relative";
          _rbBody.appendChild(rb);
        } catch (erb) {}
      }
      setTimeout(_applyRB, 0);
      PDC._reg.push(_applyRB);
    }
    // Callout arrow: an SVG text bubble with a dashed leader line pointing to an (x%, y%)
    // position on the chart. Good for "Peak here", "Drop point", "Watch this" annotations.
    // Uses an absolutely-positioned <svg> overlay so it works with every chart type.
    // Same defer+PDC._reg pattern as target line and reference band.
    if (p.callout && p.callout.text) {
      var _caX = p.callout.x != null ? +p.callout.x : 50;
      var _caY = p.callout.y != null ? +p.callout.y : 30;
      var _caText = p.callout.text;
      var _caColor = p.callout.color || "#e74c3c";
      var _caBody = body;
      function _applyCA() {
        try {
          [].slice.call(_caBody.querySelectorAll(".pdc-callout")).forEach(function (el) { el.remove(); });
          var bw = _caBody.clientWidth  || 300;
          var bh = _caBody.clientHeight || 200;
          var tx = bw * _caX / 100;
          var ty = bh * _caY / 100;
          // Bubble dimensions (cap text width at 160px; ~7px per char estimate)
          var textW = Math.min(Math.max(_caText.length * 6.8 + 18, 44), 160);
          var textH = 20;
          // Bubble sits above the arrow tip; clamp to stay within the body
          var bx = Math.max(2, Math.min(tx - textW / 2, bw - textW - 2));
          var by = Math.max(2, ty - 36);
          // Leader line from the bubble's bottom-centre to the tip
          var lx1 = bx + textW / 2, ly1 = by + textH;
          // Arrow-head direction unit vector
          var aDx = tx - lx1, aDy = ty - ly1, len = Math.sqrt(aDx*aDx + aDy*aDy) || 1;
          var ux = aDx / len, uy = aDy / len, aw = 4;
          var ax1 = tx - uy*aw - ux*7, ay1 = ty + ux*aw - uy*7;
          var ax2 = tx + uy*aw - ux*7, ay2 = ty - ux*aw - uy*7;

          function svgEl(tag, attrs) {
            var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
            Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
            return el;
          }
          var svg = svgEl("svg", { "class": "pdc-callout" });
          svg.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:4;overflow:visible";

          var g = svgEl("g", {});
          // Dashed leader line
          g.appendChild(svgEl("line", { x1: lx1, y1: ly1, x2: tx, y2: ty,
            stroke: _caColor, "stroke-width": "1.5", "stroke-dasharray": "3 2" }));
          // Filled arrow head
          g.appendChild(svgEl("polygon", {
            points: tx+","+ty+" "+ax1.toFixed(1)+","+ay1.toFixed(1)+" "+ax2.toFixed(1)+","+ay2.toFixed(1),
            fill: _caColor }));
          // Bubble background
          g.appendChild(svgEl("rect", { x: bx, y: by, width: textW, height: textH, rx: "4", ry: "4",
            fill: _caColor, opacity: "0.92" }));
          // Bubble label
          var txt = svgEl("text", { x: bx + textW / 2, y: by + 13.5,
            "text-anchor": "middle", fill: "#fff",
            "font-size": "10.5", "font-weight": "700", "font-family": "inherit" });
          txt.textContent = _caText;
          g.appendChild(txt);

          svg.appendChild(g);
          _caBody.style.position = "relative";
          _caBody.appendChild(svg);
        } catch (eca) {}
      }
      setTimeout(_applyCA, 0);
      PDC._reg.push(_applyCA);
    }
    // Period highlight: semi-transparent vertical band across an x% range of the chart body.
    // Type-aware — only applies when periodHighlight is set and a label is provided.
    // Uses the same setTimeout(0) + PDC._reg.push() pattern as other overlay annotations so
    // it survives synchronous chart redraws, theme changes, and window resize events.
    var _phTypes = ["line","areaStacked","streamgraph","combo","stacked","bars"];
    if (p.periodHighlight && p.periodHighlight.label && _phTypes.indexOf(p.chart && p.chart.type) >= 0) {
      var _phXs = p.periodHighlight.xStart != null ? +p.periodHighlight.xStart : 25;
      var _phXe = p.periodHighlight.xEnd   != null ? +p.periodHighlight.xEnd   : 60;
      var _phHex   = p.periodHighlight.color || "#3498db";
      var _phLabel = p.periodHighlight.label;
      var _phBody  = body;
      // Parse hex color to rgba so fill stays semi-transparent while label text is solid
      var _phR = parseInt(_phHex.slice(1,3),16), _phG = parseInt(_phHex.slice(3,5),16), _phB = parseInt(_phHex.slice(5,7),16);
      var _phBg = "rgba(" + _phR + "," + _phG + "," + _phB + ",0.12)";
      function _applyPH() {
        try {
          [].slice.call(_phBody.querySelectorAll(".pdc-period")).forEach(function (e) { e.remove(); });
          var ph = document.createElement("div");
          ph.className = "pdc-period";
          var xs = Math.min(_phXs, _phXe), xe = Math.max(_phXs, _phXe);
          ph.style.left = xs + "%";
          ph.style.width = Math.max(0, xe - xs) + "%";
          ph.style.backgroundColor = _phBg;
          ph.style.borderLeft  = "1px dashed " + _phHex;
          ph.style.borderRight = "1px dashed " + _phHex;
          if (_phLabel) {
            var phLbl = document.createElement("span");
            phLbl.className = "pdc-period-label";
            phLbl.style.color = _phHex;
            phLbl.textContent = _phLabel;
            ph.appendChild(phLbl);
          }
          _phBody.style.position = "relative";
          _phBody.appendChild(ph);
        } catch (eph) {}
      }
      setTimeout(_applyPH, 0);
      PDC._reg.push(_applyPH);
    }
    // Event markers: named vertical dashed lines at specific x% positions.
    // Type-aware — only for chart types that have a meaningful horizontal x-axis.
    // Each marker in p.eventMarkers is {label, xPct, color}; multiple markers are supported.
    // Great for annotating "Product launch", "Incident", "Campaign start" on line and bar charts.
    var _emAxisTypes = ["line","areaStacked","streamgraph","combo","stacked","bars"];
    if (p.eventMarkers && p.eventMarkers.length && _emAxisTypes.indexOf(p.chart && p.chart.type) >= 0) {
      var _emBody = body;
      var _emMarkers = (p.eventMarkers || []).filter(function (m) { return m && m.label; });
      if (_emMarkers.length) {
        function _applyEM() {
          try {
            [].slice.call(_emBody.querySelectorAll(".pdc-event-mark")).forEach(function (e) { e.remove(); });
            _emMarkers.forEach(function (m) {
              var mk = document.createElement("div");
              mk.className = "pdc-event-mark";
              mk.style.left = (m.xPct != null ? +m.xPct : 50) + "%";
              mk.style.borderLeftColor = m.color || "#e74c3c";
              var lbl = document.createElement("span");
              lbl.className = "pdc-event-mark-label";
              lbl.style.color = m.color || "#e74c3c";
              lbl.textContent = m.label;
              mk.appendChild(lbl);
              _emBody.style.position = "relative";
              _emBody.appendChild(mk);
            });
          } catch (eem) {}
        }
        setTimeout(_applyEM, 0);
        PDC._reg.push(_applyEM);
      }
    }
    // Scatter point annotations: text labels pinned at visual (x%, y%) positions on scatter plots.
    // Each item in p.scatterAnnotations is {text, xPct, yPct, color}; multiple items are supported.
    // Ideal for highlighting outliers, clusters, or regions of interest — the label is a small
    // colored box with a dot indicator. Position is visual (% of chart body), not data-scaled.
    if (p.scatterAnnotations && p.scatterAnnotations.length && p.chart && p.chart.type === "scatter") {
      var _saBody = body;
      var _saItems = (p.scatterAnnotations || []).filter(function (a) { return a && a.text; });
      if (_saItems.length) {
        function _applySA() {
          try {
            [].slice.call(_saBody.querySelectorAll(".pdc-pt-annot")).forEach(function (e) { e.remove(); });
            _saItems.forEach(function (a) {
              var div = document.createElement("div");
              div.className = "pdc-pt-annot";
              div.style.left = (a.xPct != null ? +a.xPct : 50) + "%";
              div.style.top  = (a.yPct != null ? +a.yPct : 50) + "%";
              var dot = document.createElement("span");
              dot.className = "pdc-pt-annot-dot";
              dot.style.background = a.color || "#005bb5";
              var txt = document.createElement("span");
              txt.className = "pdc-pt-annot-txt";
              txt.style.color = a.color || "#005bb5";
              txt.style.background = "var(--panel-bg,#fff)";
              txt.style.border = "1.5px solid " + (a.color || "#005bb5");
              txt.textContent = a.text;
              div.appendChild(dot);
              div.appendChild(txt);
              _saBody.style.position = "relative";
              _saBody.appendChild(div);
            });
          } catch (esa) {}
        }
        setTimeout(_applySA, 0);
        PDC._reg.push(_applySA);
      }
    }
    // Cross-filter emission: tag elements with their labels and wire click-to-filter.
    // Works for bars, donut, and treemap; silently skipped for other chart types.
    // PDC.redrawAll() (fired on theme change / resize) calls _bars again, which
    // clears body.innerHTML and re-renders bars — so we push a re-tagger into
    // PDC._reg to re-apply data-xf-label after every redraw as well.
    var xfParam = p.crossFilter && p.crossFilter.emit;
    if (xfParam && res && m.labelCol && m.valueCol) {
      var _xfLv = lv(res, m.labelCol, m.valueCol), _xfType = ch.type, _xfSort = !!(o.sortSlices || o.sortBars);
      try { wireXFilter(body, xfParam, _xfLv, spec, _xfType, _xfSort); } catch (e2) {}
      PDC._reg.push(function () {
        try { wireXFilter(body, xfParam, _xfLv, spec, _xfType, _xfSort); } catch (e3) {}
      });
    }
  }

  /* ---- whole dashboard ---- */
  function renderAll(spec, data) {
    // KPIs
    var kEl = PDC.el("kpis");
    if (kEl) {
      if ((spec.kpis || []).length) {
        // Build tile descriptors; sparkType 'bar'/'area' are post-processed below
        // after PDC.kpis renders, using PDC.sparkSvgBar / PDC.sparkSvgArea from studio-charts.js.
        var _kTiles = spec.kpis.map(function (k) {
          var res = data[k.da], val = res ? (res.rows[0] || [])[res.col(k.valueCol)] : "—";
          var tile = { value: fmt(k.fmt)(val), label: k.label, state: k.state || "", info: k.info || "", _raw: val };
          // Computed comparison delta: compareCol auto-computes the delta from a second numeric
          // column (same DA first row). Takes priority over manual deltaText when both are set.
          if (k.compareCol && res) {
            var ci = res.col(k.compareCol);
            if (ci >= 0) {
              var cmpRaw = (res.rows[0] || [])[ci];
              var numVal = +val || 0, cmpVal = +cmpRaw || 0;
              var mode = k.compareMode || "pct";
              var lbl = k.compareLabel || k.compareCol;
              if (mode === "value") {
                tile.delta = 0; tile.deltaText = fmt(k.fmt)(cmpRaw) + " " + lbl;
              } else if (mode === "abs") {
                var diff = numVal - cmpVal;
                tile.delta = diff >= 0 ? 1 : -1;
                tile.deltaText = fmt(k.fmt)(Math.abs(diff)) + " vs " + lbl;
              } else { // pct (default) — most useful for period-over-period comparisons
                var pct = cmpVal !== 0 ? ((numVal - cmpVal) / Math.abs(cmpVal)) * 100 : 0;
                tile.delta = pct >= 0 ? 1 : -1;
                tile.deltaText = Math.abs(pct).toFixed(1) + "% vs " + lbl;
              }
            }
          } else if (k.deltaText) {
            tile.delta = k.deltaDir === "down" ? -1 : k.deltaDir === "flat" ? 0 : 1; tile.deltaText = k.deltaText;
          }
          if (k.sparkCol && res) {
            var si = res.col(k.sparkCol);
            if (si >= 0) {
              var sVals = res.rows.map(function (r) { return +r[si] || 0; });
              var sColor = color(k.sparkColor);
              if (!k.sparkType || k.sparkType === "line") {
                tile.spark = sVals; tile.sparkColor = sColor;
              } else {
                tile._sparkVals = sVals; tile._sparkColor = sColor; tile._sparkType = k.sparkType;
              }
            }
          }
          return tile;
        });
        PDC.kpis(kEl, _kTiles);
        // Post-process non-line sparklines (bar / area) via studio-charts.js extensions
        _kTiles.forEach(function (tile, idx) {
          if (!tile._sparkVals) return;
          var kDiv = kEl.querySelectorAll(".kpi")[idx]; if (!kDiv) return;
          var sp = kDiv.querySelector(".spark");
          if (!sp) { sp = document.createElement("div"); sp.className = "spark"; kDiv.appendChild(sp); }
          var fn = tile._sparkType === "bar" ? PDC.sparkSvgBar : PDC.sparkSvgArea;
          if (fn) sp.innerHTML = fn(tile._sparkVals, 90, 26, tile._sparkColor);
        });
        // KPI subtitle: optional italic subline below each tile value
        spec.kpis.forEach(function (k, idx) {
          if (!k.subtitle) return;
          var kDiv = kEl.querySelectorAll(".kpi")[idx]; if (!kDiv) return;
          var sub = document.createElement("div");
          sub.className = "kpi-sub";
          sub.textContent = k.subtitle;
          kDiv.appendChild(sub);
        });
        // KPI click-through: navigate to a target URL when the tile is clicked, mirroring
        // panel Drill-through (same shared PDC.bindDrill helper bars/donut use).
        spec.kpis.forEach(function (k, idx) {
          if (!k.drill || !k.drill.url) return;
          var kDiv = kEl.querySelectorAll(".kpi")[idx]; if (!kDiv) return;
          PDC.bindDrill(kDiv, { to: k.drill.url, param: k.drill.param }, _kTiles[idx]._raw);
        });
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
    // Group consecutive panels under their optional section label so section-divider
    // headers appear in the correct grid rows. Panels without a section form an
    // implicit group (label = ""). A new grid is started for each group so spans
    // behave correctly within each section.
    var groups = []; // [{label: string, panels: [...]}]
    spec.panels.forEach(function (p) {
      var lbl = p.section || "";
      if (!groups.length || groups[groups.length - 1].label !== lbl) {
        groups.push({ label: lbl, panels: [] });
      }
      groups[groups.length - 1].panels.push(p);
    });

    groups.forEach(function (grp) {
      // Section divider (skipped for unlabeled groups)
      if (grp.label) {
        var hdr = document.createElement("div");
        hdr.className = "pdc-sec-hdr";
        hdr.textContent = grp.label;
        content.appendChild(hdr);
      }
      var g = PDC.grid(spec.gridCols || 3); content.appendChild(g);
      grp.panels.forEach(function (p) {
        var spanClass = p.span === "full" ? "full" : (p.span > 1 ? String(p.span) : null);
        var card = PDC.card(p.title || "", { pill: p.pill || "", sub: p.sub || "", info: p.info || "",
          src: p.src || "", span: spanClass });
        // Panel note: visible annotation line shown below the card header, above the chart.
        // Gives stakeholders quick context without needing to hover over the info dot.
        if (p.note) {
          var noteEl = document.createElement("div");
          noteEl.className = "pdc-panel-note";
          noteEl.textContent = p.note;
          card.el.insertBefore(noteEl, card.body);
        }
        // Per-panel accent color: a colored left border that visually differentiates panels
        // by topic or domain in multi-subject dashboards. The --pap-color CSS variable is set
        // inline so the .pdc-accent-panel rule in panelAccentCss can reference it.
        if (p.accentColor) {
          card.el.classList.add("pdc-accent-panel");
          card.el.style.setProperty("--pap-color", p.accentColor);
        }
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
          acts.innerHTML = '<button class="sr-act" data-act="zoom" title="Zoom panel full-screen">' + I_MAXIMIZE + '</button><button class="sr-act" data-act="dup" title="Duplicate panel">' + I_DUP + '</button><button class="sr-act" data-act="del" title="Delete panel">' + I_CLOSE + '</button>';
          (function (pid) {
            acts.querySelector('[data-act="dup"]').addEventListener("click", function (e) { e.stopPropagation(); post({ type: "panel-dup", id: pid }); });
            acts.querySelector('[data-act="del"]').addEventListener("click", function (e) { e.stopPropagation(); post({ type: "panel-delete", id: pid }); });
            acts.querySelector('[data-act="zoom"]').addEventListener("click", function (e) { e.stopPropagation(); post({ type: "zoom", panelId: pid }); });
          })(p.id);
          card.el.appendChild(acts);
        }
        g.appendChild(card.el);
        renderPanel(spec, p, data, card.body);
      });
    });
    if (isPreview()) { wireSelection(); wireEditing(spec); }
  }

  // collect every dataAccess id the dashboard needs
  function neededDAs(spec) {
    var ids = {};
    (spec.kpis || []).forEach(function (k) { if (k.da) ids[k.da] = 1; });
    (spec.panels || []).forEach(function (p) {
      if (p.chart.type === "richtext") return; // text panels carry no DA
      if (p.chart.da) ids[p.chart.da] = 1;
    });
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
