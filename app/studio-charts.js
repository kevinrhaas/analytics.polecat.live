/* ============================================================================
   studio-charts.js — Studio chart extensions layered on the PDC toolkit.
   Adds chart types the base pdc-ui.js doesn't ship (kept separate so the
   vendored toolkit stays a 1:1 mirror of the v2 suite). Loaded inside the
   preview iframe / exported CDF html, right after pdc-ui.js.
   ============================================================================ */
(function () {
  "use strict";
  var PDC = window.PDC; if (!PDC || PDC.areaStacked) return;
  var S = PDC.S;
  function W(el) { return el.clientWidth || (el.parentNode && el.parentNode.clientWidth) || 640; }

  /* ── KPI sparkline type variants ────────────────────────────────────────────
     PDC.sparkSVG (in pdc-ui.js) renders the default line sparkline.
     These extensions add 'bar' and 'area' flavours for richer KPI tiles.
     studio-render.js calls them when k.sparkType !== 'line'. */

  PDC.sparkSvgBar = function (vals, w, h, color) {
    if (!vals || !vals.length) return "";
    var c = color || PDC.cssvar("--pentaho");
    var n = vals.length, mx = Math.max.apply(null, vals);
    var mn = Math.min(0, Math.min.apply(null, vals));
    var rng = (mx - mn) || 1;
    var bw = Math.max(1, (w / n) - 1.2);
    var out = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">';
    vals.forEach(function (v, i) {
      var bh = Math.max(2, ((v - mn) / rng) * (h - 3));
      var x = (i / n) * w;
      out += '<rect x="' + x.toFixed(1) + '" y="' + (h - bh).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="' + c + '" rx="1"/>';
    });
    return out + "</svg>";
  };

  PDC.sparkSvgArea = function (vals, w, h, color) {
    if (!vals || !vals.length) return "";
    var c = color || PDC.cssvar("--pentaho");
    var n = vals.length, mx = Math.max.apply(null, vals), mn = Math.min.apply(null, vals);
    var rng = (mx - mn) || 1;
    var pts = vals.map(function (v, i) {
      return (i / (n - 1) * w).toFixed(1) + "," + (h - 2 - ((v - mn) / rng) * (h - 4)).toFixed(1);
    }).join(" ");
    var fillPts = pts + " " + w + "," + (h - 2) + " 0," + (h - 2);
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<polygon points="' + fillPts + '" fill="' + c + '" fill-opacity="0.2"/>' +
      '<polyline points="' + pts + '" fill="none" stroke="' + c + '" stroke-width="1.6" stroke-linejoin="round"/>' +
      "</svg>";
  };
  function mkSVG(el, h) { el.innerHTML = ""; var w = W(el); var s = S("svg", { viewBox: "0 0 " + w + " " + h, width: "100%", height: h }); el.appendChild(s); return { s: s, w: w, h: h }; }
  function reg(el, fn) { PDC._reg.push(fn); fn(); }
  // Track L sweep: the "show a fixed tooltip HTML string on hover, hide it on mouseout"
  // pair was hand-wired verbatim at ~36 call sites across the chart renderers below.
  function _tip(node, html) {
    node.addEventListener("mousemove", function (e) { PDC.showTip(e, html); });
    node.addEventListener("mouseout", PDC.hideTip);
  }
  var RM = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // canAnim() combines prefers-reduced-motion with the per-panel animate flag set by studio-render.js
  // (PDC._anim = p.animate !== false) so users can disable entrance animations panel-by-panel.
  // animD() scales a base timeout ms value by the user's chosen duration factor (PDC._animD / 600).
  function canAnim() { return !RM && PDC._anim !== false; }
  function animD(base) { return base * ((PDC._animD || 600) / 600); }
  function niceMax(m) { if (m <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(m))); var n = m / p; var step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10; return step * p; }

  // Shared Gaussian KDE (violin + ridgeline both plot a smoothed density curve over
  // a value range). Silverman's rule of thumb picks the bandwidth; kde() samples the
  // resulting density at evenly-spaced points across [minV, maxV].
  function silvermanBw(vals, minV, maxV) {
    if (vals.length < 2) return (maxV - minV) / 6 || 1;
    var m = 0; for (var j = 0; j < vals.length; j++) m += vals[j]; m /= vals.length;
    var v2 = 0; for (var j = 0; j < vals.length; j++) v2 += (vals[j] - m) * (vals[j] - m); v2 /= vals.length;
    var sd = Math.sqrt(v2);
    return sd === 0 ? (maxV - minV) / 8 || 1 : 0.9 * sd * Math.pow(vals.length, -0.2);
  }
  function kdeDensity(vals, bw, minV, maxV, pts) {
    var rng = maxV - minV, result = [];
    var inv2pi = 1 / Math.sqrt(2 * Math.PI);
    for (var k = 0; k <= pts; k++) {
      var x = minV + (k / pts) * rng, d = 0;
      for (var j = 0; j < vals.length; j++) {
        var u = (x - vals[j]) / bw;
        d += inv2pi * Math.exp(-0.5 * u * u) / bw;
      }
      result.push({ x: x, d: d / vals.length });
    }
    return result;
  }

  /* Clickable legend row for multi-series charts.
     items: [{name, color, els: [SVGElement ...], base: opacityString}]
     Clicking a chip toggles the paired SVG elements; class lgi-toggle used by Playwright tests. */
  function _toggleLegend(el, items) {
    var d = document.createElement("div");
    d.className = "legend lgi-toggle";
    items.forEach(function (item) {
      var chip = document.createElement("span");
      chip.className = "legend-item";
      chip.title = "Click to show / hide";
      chip.style.cssText = "cursor:pointer;user-select:none;transition:opacity .15s;";
      var dot = document.createElement("span");
      dot.style.cssText = "display:inline-block;width:9px;height:9px;border-radius:2px;background:" + item.color + ";margin-right:4px;vertical-align:middle;flex-shrink:0;";
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode(item.name));
      var vis = true;
      chip.addEventListener("click", function () {
        vis = !vis;
        chip.style.opacity = vis ? "1" : "0.35";
        var op = vis ? (item.base || "1") : "0";
        (item.els || []).forEach(function (node) { if (node) { node.style.transition = "opacity .22s ease"; node.style.opacity = op; } });
      });
      d.appendChild(chip);
    });
    el.appendChild(d);
  }

  /* ---------- stacked area (multi-series, cumulative bands) ---------- */
  // cfg.smooth curves the top and bottom edge of every band with the same
  // "control point at the horizontal midpoint" cubic-bezier trick used by the
  // Line and Bump charts, instead of the default straight segment-to-segment edges.
  function _bandSeg(prev, pt, smooth) {
    if (smooth) {
      var cx = (prev[0] + pt[0]) / 2;
      return " C" + cx + "," + prev[1] + " " + cx + "," + pt[1] + " " + pt[0] + "," + pt[1];
    }
    return " L" + pt[0] + "," + pt[1];
  }
  PDC.areaStacked = function (el, cfg) { reg(el, function () { _area(el, cfg); }); };
  function _area(el, cfg) {
    var labels = cfg.labels || [], series = cfg.series || [], h = cfg.height || 270;
    if (!labels.length || !series.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    var o = mkSVG(el, h), s = o.s, w = o.w, fmt = cfg.fmt || PDC.fmt.abbr, P = PDC.palette(), n = labels.length;
    var totals = labels.map(function (_, i) { return series.reduce(function (a, se) { return a + (+se.values[i] || 0); }, 0); });
    var max = niceMax(Math.max.apply(null, totals.concat([0])));
    var mL = 46, mR = 12, mT = 12, mB = 30, iw = w - mL - mR, ih = h - mT - mB;
    var xs = function (i) { return mL + (n <= 1 ? iw / 2 : iw * i / (n - 1)); }, ys = function (v) { return mT + ih * (1 - v / (max || 1)); };
    for (var g = 0; g <= 4; g++) { var gy = mT + ih * (1 - g / 4); s.appendChild(S("line", { class: "gridline", x1: mL, y1: gy, x2: w - mR, y2: gy })); s.appendChild(S("text", { class: "tick", x: mL - 7, y: gy + 3, "text-anchor": "end" }, fmt(max * g / 4))); }
    var step = Math.ceil(n / Math.max(2, Math.floor(iw / 64)));
    labels.forEach(function (lb, i) { if (i % step === 0 || i === n - 1) s.appendChild(S("text", { class: "tick", x: xs(i), y: mT + ih + 14, "text-anchor": "middle" }, PDC.fmt.trunc(lb, 9))); });
    // build cumulative bands
    var lower = labels.map(function () { return 0; }), bands = series.map(function (se, si) {
      var upper = lower.map(function (lo, i) { return lo + (+se.values[i] || 0); });
      var band = { se: se, si: si, lo: lower.slice(), hi: upper.slice() }; lower = upper; return band;
    });
    var bandEls = [];
    bands.forEach(function (b, bi) {
      var col = b.se.color || P[b.si % 10];
      var hiPts = [], loPts = [];
      for (var i = 0; i < n; i++) hiPts.push([xs(i), ys(b.hi[i])]);
      for (var j = n - 1; j >= 0; j--) loPts.push([xs(j), ys(b.lo[j])]);
      var d = "M" + hiPts[0][0] + "," + hiPts[0][1];
      for (var ei = 1; ei < hiPts.length; ei++) d += _bandSeg(hiPts[ei - 1], hiPts[ei], cfg.smooth);
      for (var ej = 0; ej < loPts.length; ej++) d += _bandSeg(ej === 0 ? hiPts[hiPts.length - 1] : loPts[ej - 1], loPts[ej], cfg.smooth);
      d += "Z";
      var p = S("path", { d: d, fill: col, opacity: 0.82, stroke: col, "stroke-width": 1 }); s.appendChild(p); bandEls.push(p);
      if (canAnim()) { p.style.opacity = "0"; setTimeout(function () { p.style.transition = "opacity .5s ease"; p.style.opacity = "0.82"; }, animD(60 + bi * 70)); }
    });
    // hover overlay → tooltip listing every series at that x
    var ov = S("rect", { x: mL, y: mT, width: iw, height: ih, fill: "transparent" });
    ov.addEventListener("mousemove", function (e) {
      var rect = s.getBoundingClientRect(), mx = (e.clientX - rect.left) * (w / (rect.width || w));
      var i = Math.max(0, Math.min(n - 1, Math.round((mx - mL) / (iw / Math.max(1, n - 1)))));
      var html = "<b>" + labels[i] + "</b>";
      series.forEach(function (se, si) { html += "<br>" + (se.name || ("Series " + (si + 1))) + ": " + fmt(+se.values[i] || 0); });
      html += "<br><span class='muted'>Total: " + fmt(totals[i]) + "</span>";
      PDC.showTip(e, html);
    });
    ov.addEventListener("mouseout", PDC.hideTip); s.appendChild(ov);
    if (cfg.legend !== false) _toggleLegend(el, series.map(function (se, i) {
      return { name: se.name || ("Series " + (i + 1)), color: se.color || P[i % 10], els: [bandEls[i]], base: "0.82" };
    }));
  }

  /* ---------- combo: bars (left axis) + line (right axis) ---------- */
  PDC.combo = function (el, cfg) { reg(el, function () { _combo(el, cfg); }); };
  function _combo(el, cfg) {
    var labels = cfg.labels || [], h = cfg.height || 270, bars = cfg.bars || { values: [] }, line = cfg.line || { values: [] };
    if (!labels.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    var o = mkSVG(el, h), s = o.s, w = o.w, P = PDC.palette(), n = labels.length;
    var fmt = cfg.fmt || PDC.fmt.abbr, fmt2 = cfg.fmt2 || fmt;
    var bv = bars.values.map(function (v) { return +v || 0; }), lv = line.values.map(function (v) { return +v || 0; });
    var bmax = niceMax(Math.max.apply(null, bv.concat([0]))), lmax = niceMax(Math.max.apply(null, lv.concat([0])));
    var bcol = bars.color || P[0], lcol = line.color || P[1];
    var mL = 46, mR = 48, mT = 12, mB = 30, iw = w - mL - mR, ih = h - mT - mB, bw = iw / n;
    for (var g = 0; g <= 4; g++) {
      var gy = mT + ih * (1 - g / 4);
      s.appendChild(S("line", { class: "gridline", x1: mL, y1: gy, x2: w - mR, y2: gy }));
      s.appendChild(S("text", { class: "tick", x: mL - 7, y: gy + 3, "text-anchor": "end" }, fmt(bmax * g / 4)));
      s.appendChild(S("text", { class: "tick", x: w - mR + 7, y: gy + 3, "text-anchor": "start", fill: lcol }, fmt2(lmax * g / 4)));
    }
    var barEls = [], lineEls = [];
    labels.forEach(function (lb, i) {
      var x = mL + i * bw, bh = ih * (bv[i] / (bmax || 1));
      var r = S("rect", { class: "bar", x: x + bw * 0.18, y: mT + ih - bh, width: bw * 0.64, height: Math.max(1, bh), rx: 3, fill: bcol });
      _tip(r, "<b>" + lb + "</b><br>" + (bars.name || "Bars") + ": " + fmt(bv[i]) + "<br>" + (line.name || "Line") + ": " + fmt2(lv[i]));
      s.appendChild(r); barEls.push(r);
      s.appendChild(S("text", { class: "tick", x: x + bw / 2, y: mT + ih + 14, "text-anchor": "middle" }, PDC.fmt.trunc(lb, 9)));
    });
    var ys2 = function (v) { return mT + ih * (1 - v / (lmax || 1)); }, xc = function (i) { return mL + i * bw + bw / 2; };
    var d = lv.map(function (v, i) { return (i ? "L" : "M") + xc(i) + "," + ys2(v); }).join(" ");
    var lp = S("path", { d: d, fill: "none", stroke: lcol, "stroke-width": 2.4, "stroke-linejoin": "round" }); s.appendChild(lp); lineEls.push(lp);
    lv.forEach(function (v, i) { var c = S("circle", { cx: xc(i), cy: ys2(v), r: 3.2, fill: lcol, stroke: PDC.cssvar("--panel-bg"), "stroke-width": 1.4 }); s.appendChild(c); lineEls.push(c); });
    if (cfg.legend !== false) _toggleLegend(el, [
      { name: bars.name || "Bars", color: bcol, els: barEls, base: "1" },
      { name: line.name || "Line", color: lcol, els: lineEls, base: "1" }
    ]);
  }

  /* ---------- waterfall (running total with floating delta bars) ---------- */
  PDC.waterfall = function (el, cfg) { reg(el, function () { _wf(el, cfg); }); };
  function _wf(el, cfg) {
    var labels = cfg.labels || [], values = cfg.values || [], h = cfg.height || 280;
    if (!labels.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    var n = labels.length;
    var rt = [0];
    for (var k = 0; k < n; k++) rt.push(rt[k] + (+values[k] || 0));
    var finalTotal = rt[n];
    var showTotal = cfg.showTotal !== false;
    var nBars = n + (showTotal ? 1 : 0);
    var allLabels = labels.slice();
    if (showTotal) allLabels.push(cfg.totalLabel || "Total");
    var rtMin = Math.min.apply(null, rt), rtMax = Math.max.apply(null, rt);
    var displayMin = rtMin < 0 ? -niceMax(-rtMin) : 0;
    var displayMax = rtMax > 0 ? niceMax(rtMax) : niceMax(Math.abs(displayMin) || 1);
    if (displayMin === 0 && displayMax === 0) displayMax = 1;
    var displayRange = displayMax - displayMin;
    var o = mkSVG(el, h), s = o.s, w = o.w, fmt = cfg.fmt || PDC.fmt.abbr;
    var mL = 50, mR = 12, mT = 14, mB = 30, iw = w - mL - mR, ih = h - mT - mB;
    var bw = iw / nBars, bPad = Math.max(2, bw * 0.18);
    var yScale = function (v) { return mT + ih * (1 - (v - displayMin) / (displayRange || 1)); };
    // grid lines + axis ticks
    for (var g = 0; g <= 5; g++) {
      var tv = displayMin + displayRange * g / 5;
      var gy = yScale(tv);
      s.appendChild(S("line", { class: "gridline", x1: mL, y1: gy, x2: w - mR, y2: gy }));
      s.appendChild(S("text", { class: "tick", x: mL - 7, y: gy + 3.5, "text-anchor": "end" }, fmt(tv)));
    }
    if (displayMin < 0 && displayMax > 0) {
      var zy = yScale(0);
      s.appendChild(S("line", { x1: mL, y1: zy, x2: w - mR, y2: zy, stroke: "#9aa7b8", "stroke-width": 1.2 }));
    }
    var posCol = "#27ae60", negCol = "#c0392b";
    var brandCol = PDC.cssvar("--pentaho") || "#005bb5";
    var xStep = Math.ceil(nBars / Math.max(2, Math.floor(iw / 64)));
    for (var i = 0; i < nBars; i++) {
      var isTotal = showTotal && i === n;
      var barFrom = isTotal ? 0 : rt[i];
      var barTo = isTotal ? finalTotal : rt[i + 1];
      var delta = barTo - barFrom;
      var bx = mL + i * bw;
      var yTop = yScale(Math.max(barFrom, barTo));
      var yBot = yScale(Math.min(barFrom, barTo));
      var bh = Math.max(1, yBot - yTop);
      var col = isTotal ? brandCol : (delta >= 0 ? posCol : negCol);
      var rect = S("rect", { x: bx + bPad, y: yTop, width: bw - bPad * 2, height: bh, rx: 2, fill: col, opacity: 0.9,
        class: isTotal ? "wf-bar wf-total" : "wf-bar" });
      (function (lb_, delta_, barTo_, isTot_) {
        rect.addEventListener("mousemove", function (e) {
          var html = "<b>" + lb_ + "</b>";
          if (!isTot_) html += "<br>" + (delta_ >= 0 ? "+" : "") + fmt(delta_);
          html += "<br>Total: " + fmt(barTo_);
          PDC.showTip(e, html);
        });
      })(allLabels[i], delta, barTo, isTotal);
      rect.addEventListener("mouseout", PDC.hideTip);
      s.appendChild(rect);
      if (canAnim()) {
        rect.style.opacity = 0;
        (function (el_, idx_) {
          setTimeout(function () { el_.style.transition = "opacity .4s ease"; el_.style.opacity = 0.9; }, animD(30 + idx_ * 45));
        })(rect, i);
      }
      // dashed connector from right edge of this bar to left edge of next
      if (!isTotal && i < nBars - 1) {
        var connY = yScale(barTo);
        s.appendChild(S("line", {
          x1: bx + bw - bPad, y1: connY, x2: bx + bw + bPad, y2: connY,
          stroke: "#c8d0dc", "stroke-width": 0.9, "stroke-dasharray": "3 2"
        }));
      }
      if (i % xStep === 0 || i === nBars - 1) {
        s.appendChild(S("text", { class: "tick", x: bx + bw / 2, y: mT + ih + 15, "text-anchor": "middle" },
          PDC.fmt.trunc(allLabels[i], 9)));
      }
    }
  }

  /* ---------- funnel (staged bars narrowing by value, conversion %) ---------- */
  PDC.funnel = function (el, cfg) { reg(el, function () { _funnel(el, cfg); }); };
  function _funnel(el, cfg) {
    var labels = cfg.labels || [], values = cfg.values || [], h = cfg.height || 300;
    if (!labels.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    var n = labels.length;
    var maxV = Math.max.apply(null, values.map(function (v) { return +v || 0; }));
    if (!maxV) maxV = 1;
    var o = mkSVG(el, h), s = o.s, w = o.w, fmt = cfg.fmt || PDC.fmt.abbr, P = PDC.palette();
    var labelW = Math.min(88, w * 0.22), valW = cfg.showPct !== false ? 72 : 46;
    var mT = 10, mB = 10;
    var chartL = labelW, chartR = w - valW;
    var chartW = chartR - chartL;
    var ih = h - mT - mB;
    var slotH = ih / n;
    var barH = Math.max(8, Math.min(slotH * 0.72, 38));
    var gap = slotH - barH;
    for (var i = 0; i < n; i++) {
      var v = +values[i] || 0;
      var barW = Math.max(2, chartW * (v / maxV));
      var col = P[i % 10];
      var slotY = mT + i * slotH;
      var barY = slotY + gap / 2;
      var barX = chartL + (chartW - barW) / 2; // centred
      var rect = S("rect", { class: "funnel-bar", x: barX, y: barY, width: barW, height: barH, rx: 3, fill: col, opacity: 0.85 });
      (function (lb_, v_, prevV_) {
        rect.addEventListener("mousemove", function (e) {
          var html = "<b>" + lb_ + "</b><br>" + fmt(v_);
          if (prevV_ > 0) html += "<br><span class='muted'>" + Math.round(v_ / prevV_ * 100) + "% of previous</span>";
          PDC.showTip(e, html);
        });
      })(labels[i], v, i > 0 ? (+values[i - 1] || 0) : 0);
      rect.addEventListener("mouseout", PDC.hideTip);
      s.appendChild(rect);
      if (canAnim()) {
        rect.style.opacity = 0;
        (function (el_, idx_) {
          setTimeout(function () { el_.style.transition = "opacity .45s ease"; el_.style.opacity = 0.85; }, animD(30 + idx_ * 55));
        })(rect, i);
      }
      // label on the left
      var midY = barY + barH / 2;
      s.appendChild(S("text", { class: "tick", x: labelW - 5, y: midY, "text-anchor": "end", "dominant-baseline": "middle" },
        PDC.fmt.trunc(labels[i], 12)));
      // value on the right
      s.appendChild(S("text", { class: "tick", x: chartR + 4, y: midY, "text-anchor": "start", "dominant-baseline": "middle" }, fmt(v)));
      // conversion % (dim) between stages
      if (cfg.showPct !== false && i > 0) {
        var prevV = +values[i - 1] || 0;
        if (prevV > 0) {
          s.appendChild(S("text", {
            class: "tick", x: chartR + 50, y: midY,
            "text-anchor": "start", "dominant-baseline": "middle", "font-size": 9, fill: "#9aa7b8"
          }, Math.round(v / prevV * 100) + "%"));
        }
      }
    }
  }

  /* ---------- sunburst (hierarchical part-of-whole, CDF-only) ----------
     Single-ring when cfg.groups is absent; two-ring (inner=groups, outer=items)
     when cfg.groups[] is provided (same length as labels/values). */
  PDC.sunburst = function (el, cfg) { reg(el, function () { _sb(el, cfg); }); };
  function _sb(el, cfg) {
    var labels = cfg.labels || [], values = cfg.values || [], groups = cfg.groups;
    var h = cfg.height || 280, fmt = cfg.fmt || PDC.fmt.abbr, showLbls = cfg.showLabels !== false;
    if (!labels.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    var total = values.reduce(function (a, v) { return a + (+v || 0); }, 0);
    if (!total) { el.innerHTML = '<div class="empty">No data</div>'; return; }

    var o = mkSVG(el, h), s = o.s, w = o.w, P = PDC.palette();
    var cx = w / 2, cy = h / 2, maxR = Math.max(20, Math.min(cx, cy) - 12);
    var holeR = Math.round(maxR * 0.38), bg = PDC.cssvar("--panel-bg");

    // Annular sector path from angle a1 to a2 between radii r1 (inner) and r2 (outer)
    function arcPath(r1, r2, a1, a2) {
      if (a2 - a1 >= 2 * Math.PI - 0.001) a2 = a1 + 2 * Math.PI - 0.001;
      var lg = (a2 - a1 > Math.PI) ? 1 : 0;
      var x1 = (cx + r2 * Math.cos(a1)).toFixed(2), y1 = (cy + r2 * Math.sin(a1)).toFixed(2);
      var x2 = (cx + r2 * Math.cos(a2)).toFixed(2), y2 = (cy + r2 * Math.sin(a2)).toFixed(2);
      var x3 = (cx + r1 * Math.cos(a2)).toFixed(2), y3 = (cy + r1 * Math.sin(a2)).toFixed(2);
      var x4 = (cx + r1 * Math.cos(a1)).toFixed(2), y4 = (cy + r1 * Math.sin(a1)).toFixed(2);
      return "M" + x1 + "," + y1 + " A" + r2 + "," + r2 + " 0 " + lg + ",1 " + x2 + "," + y2 +
        " L" + x3 + "," + y3 + " A" + r1 + "," + r1 + " 0 " + lg + ",0 " + x4 + "," + y4 + "Z";
    }

    // Place a label at the arc midpoint; skip if arc is too narrow to be legible
    function arcLabel(r1, r2, a1, a2, txt) {
      if (!showLbls || (a2 - a1) < 0.26) return;
      var mid = a1 + (a2 - a1) / 2, lR = (r1 + r2) / 2;
      var sz = Math.min(10, Math.max(6, (a2 - a1) * lR * 0.28)).toFixed(1);
      s.appendChild(S("text", {
        x: (cx + lR * Math.cos(mid)).toFixed(1), y: (cy + lR * Math.sin(mid)).toFixed(1),
        "text-anchor": "middle", "dominant-baseline": "middle",
        "font-size": sz, fill: "#fff", "pointer-events": "none"
      }, PDC.fmt.trunc(txt, 7)));
    }

    function addArc(r1, r2, a1, a2, col, opac, tip, delay) {
      var p = S("path", { d: arcPath(r1, r2, a1, a2), fill: col, opacity: opac, stroke: bg, "stroke-width": "0.9" });
      _tip(p, tip);
      if (canAnim()) { p.style.opacity = 0; setTimeout(function () { p.style.transition = "opacity .45s ease"; p.style.opacity = opac; }, animD(delay)); }
      s.appendChild(p);
    }

    var hasGroups = groups && groups.length === labels.length &&
      groups.some(function (g) { return g && g !== ""; });

    if (!hasGroups) {
      // Single-ring sunburst
      var a = -Math.PI / 2;
      labels.forEach(function (lb, i) {
        var v = +values[i] || 0, span = (v / total) * 2 * Math.PI;
        var col = P[i % 10], pct = Math.round(v / total * 100);
        addArc(holeR, maxR, a, a + span, col, ".87",
          "<b>" + lb + "</b><br>" + fmt(v) + " (" + pct + "%)", 50 + i * 55);
        arcLabel(holeR, maxR, a, a + span, lb);
        a += span;
      });
    } else {
      // Two-ring sunburst: inner ring = groups; outer ring = items within each group
      var midR = Math.round(holeR + (maxR - holeR) * 0.44);
      var grpOrder = [], grpSum = {}, grpColor = {};
      labels.forEach(function (lb, i) {
        var g = groups[i] || "", v = +values[i] || 0;
        if (grpOrder.indexOf(g) < 0) { grpOrder.push(g); }
        grpSum[g] = (grpSum[g] || 0) + v;
      });
      grpOrder.forEach(function (g, gi) { grpColor[g] = P[gi % 10]; });

      // Compute each group's angle span so the outer-ring items stay aligned
      var grpAngles = {}, ga = -Math.PI / 2;
      grpOrder.forEach(function (g) {
        var span = (grpSum[g] / total) * 2 * Math.PI;
        grpAngles[g] = { a1: ga, a2: ga + span };
        ga += span;
      });

      // Inner ring: one arc per group
      grpOrder.forEach(function (g, gi) {
        var ang = grpAngles[g], col = grpColor[g], pct = Math.round(grpSum[g] / total * 100);
        addArc(holeR, midR, ang.a1, ang.a2, col, ".9",
          "<b>" + (g || "Other") + "</b><br>" + fmt(grpSum[g]) + " (" + pct + "%)", 40);
        arcLabel(holeR, midR, ang.a1, ang.a2, g || "Other");
      });

      // Outer ring: items within each group's span
      grpOrder.forEach(function (g) {
        var ang = grpAngles[g], col = grpColor[g], gTotal = grpSum[g];
        var items = labels.map(function (lb, i) {
          return { lb: lb, v: +values[i] || 0, g: groups[i] || "" };
        }).filter(function (it) { return it.g === g; });
        var ia = ang.a1;
        items.forEach(function (item, ii) {
          var span = (item.v / gTotal) * (ang.a2 - ang.a1);
          var pct = Math.round(item.v / total * 100);
          addArc(midR, maxR, ia, ia + span, col, ".62",
            "<b>" + item.lb + "</b><br>" + fmt(item.v) + " (" + pct + "%)", 80 + ii * 40);
          arcLabel(midR, maxR, ia, ia + span, item.lb);
          ia += span;
        });
      });
    }

    // Center total label
    s.appendChild(S("text", { x: cx, y: cy - 7, "text-anchor": "middle", "dominant-baseline": "middle",
      class: "tick", "font-size": "10" }, "Total"));
    s.appendChild(S("text", { x: cx, y: cy + 8, "text-anchor": "middle", "dominant-baseline": "middle",
      class: "tick", "font-size": "13", "font-weight": "700" }, fmt(total)));
  }

  /* ---------- bullet chart (actual value vs target, with quality-zone bands) ---------- */
  PDC.bullet = function (el, cfg) { reg(el, function () { _bullet(el, cfg); }); };
  function _bullet(el, cfg) {
    var rows = cfg.rows || [], fmtFn = cfg.fmt || PDC.fmt.abbr;
    if (!rows.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    // auto-detect scale max from actual values + targets
    var dataMax = 0;
    rows.forEach(function (r) { if (+r.value > dataMax) dataMax = +r.value; if (r.target != null && +r.target > dataMax) dataMax = +r.target; });
    var max = cfg.max && cfg.max > 0 ? cfg.max : niceMax(dataMax);
    var mL = 92, mR = 20, mT = 14, rowH = 42, barH = 14, trackH = 22;
    var totalH = mT + rows.length * rowH + 26;
    var w = W(el);
    el.innerHTML = "";
    var s = S("svg", { viewBox: "0 0 " + w + " " + totalH, width: "100%", height: totalH });
    el.appendChild(s);
    var iw = w - mL - mR;
    var xs = function (v) { return mL + iw * Math.max(0, Math.min(1, v / (max || 1))); };
    // light axis grid
    for (var g = 0; g <= 4; g++) {
      var gx = mL + iw * g / 4;
      s.appendChild(S("line", { class: "gridline", x1: gx, y1: mT, x2: gx, y2: mT + rows.length * rowH, "stroke-dasharray": "3 3" }));
      s.appendChild(S("text", { class: "tick", x: gx, y: mT + rows.length * rowH + 16, "text-anchor": "middle" }, fmtFn(max * g / 4)));
    }
    rows.forEach(function (row, ri) {
      var cy = mT + ri * rowH + rowH / 2;
      // row label on the left
      s.appendChild(S("text", { class: "tick", x: mL - 8, y: cy + 4, "text-anchor": "end" }, PDC.fmt.trunc(String(row.label || ""), 14)));
      // quality-zone bands: bad (0–40%) / ok (40–70%) / good (70–100%)
      s.appendChild(S("rect", { x: mL,               y: cy - trackH / 2, width: iw * 0.4, height: trackH, fill: "#c0392b", opacity: 0.1 }));
      s.appendChild(S("rect", { x: mL + iw * 0.4,    y: cy - trackH / 2, width: iw * 0.3, height: trackH, fill: "#e67e22", opacity: 0.1 }));
      s.appendChild(S("rect", { x: mL + iw * 0.7,    y: cy - trackH / 2, width: iw * 0.3, height: trackH, fill: "#27ae60", opacity: 0.1 }));
      // actual value bar (animated)
      var vx = xs(+row.value || 0), barW = Math.max(0, vx - mL);
      var bar = S("rect", { x: mL, y: cy - barH / 2, width: barW, height: barH, fill: PDC.cssvar("--pentaho") || "#005bb5", rx: 2 });
      if (canAnim()) { bar.setAttribute("width", 0); setTimeout((function (b, fw) { return function () { b.style.transition = "width .6s ease"; b.setAttribute("width", fw); }; })(bar, barW), animD(40 + ri * 65)); }
      var tipTxt = "<b>" + (row.label || "") + "</b><br>Actual: " + fmtFn(+row.value || 0) + (row.target != null ? "<br>Target: " + fmtFn(+row.target) : "");
      _tip(bar, tipTxt);
      s.appendChild(bar);
      // target tick (thick vertical mark)
      if (row.target != null) {
        var tx = xs(+row.target);
        s.appendChild(S("line", { x1: tx, y1: cy - trackH / 2 - 3, x2: tx, y2: cy + trackH / 2 + 3, stroke: "#333", "stroke-width": 3, "stroke-linecap": "round" }));
      }
    });
  }

  /* ---------- calendar heatmap (GitHub-style day-grid density) ---------- */
  PDC.calHeatmap = function (el, cfg) { reg(el, function () { _calHeatmap(el, cfg); }); };
  function _calHeatmap(el, cfg) {
    var items = cfg.items || [], fmtFn = cfg.fmt || PDC.fmt.n;
    if (!items.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    // build date → value map; only accept YYYY-MM-DD strings
    var dayMap = {}, maxVal = 0;
    items.forEach(function (it) {
      var d = String(it.date || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      dayMap[d] = (dayMap[d] || 0) + (+it.value || 0);
      if (dayMap[d] > maxVal) maxVal = dayMap[d];
    });
    var dates = Object.keys(dayMap).sort();
    if (!dates.length) { el.innerHTML = '<div class="empty">No parseable dates (need YYYY-MM-DD)</div>'; return; }
    var firstDate = new Date(dates[0].replace(/-/g, "/"));   // local-time parse
    var lastDate  = new Date(dates[dates.length - 1].replace(/-/g, "/"));
    // roll back to the start of the first week (weekStart: 0=Sun, 1=Mon — default Monday)
    var weekStartDow = cfg.weekStart === "sun" ? 0 : 1;
    var dow = firstDate.getDay(); // 0=Sun
    var startDay = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate() - ((dow - weekStartDow + 7) % 7));
    var weeksTotal = Math.max(1, Math.ceil(((lastDate - startDay) / 86400000 + 7) / 7));
    weeksTotal = Math.min(weeksTotal, 54);
    var MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    // weekStart: "sun" rolls weeks over from Sunday, otherwise (default) Monday.
    var sunStart = cfg.weekStart === "sun";
    var DOW_LABELS = sunStart ? ["S", "", "T", "", "T", "", "S"] : ["M", "", "W", "", "F", "", "S"];
    var elW = W(el);
    var cellSz = Math.max(8, Math.min(13, Math.floor((elW - 26) / (weeksTotal + 1))));
    var gap = 2, mL = 20, mT = 24, mB = 6;
    var totalH = mT + 7 * (cellSz + gap) + mB;
    el.innerHTML = "";
    var s = S("svg", { viewBox: "0 0 " + elW + " " + totalH, width: "100%", height: totalH });
    el.appendChild(s);
    // weekday labels (left margin)
    DOW_LABELS.forEach(function (lb, i) {
      if (lb) s.appendChild(S("text", { class: "tick", x: mL - 3, y: mT + i * (cellSz + gap) + cellSz * 0.77, "text-anchor": "end", "font-size": 9 }, lb));
    });
    var curColor = cfg.color || PDC.cssvar("--pentaho") || "#005bb5", prevMonth = -1;
    function toDateStr(d) { var mm = d.getMonth() + 1, dd = d.getDate(); return d.getFullYear() + "-" + (mm < 10 ? "0" : "") + mm + "-" + (dd < 10 ? "0" : "") + dd; }
    for (var wi = 0; wi < weeksTotal; wi++) {
      for (var di = 0; di < 7; di++) {
        var cellDate = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate() + wi * 7 + di);
        // month label at the first column of each new month
        if (cellDate.getDate() <= 7 && cellDate.getMonth() !== prevMonth) {
          prevMonth = cellDate.getMonth();
          s.appendChild(S("text", { class: "tick", x: mL + wi * (cellSz + gap), y: mT - 6, "font-size": 9 }, MONTHS_SHORT[prevMonth]));
        }
        var cx = mL + wi * (cellSz + gap), cy = mT + di * (cellSz + gap);
        var ds = toDateStr(cellDate), val = dayMap[ds] || 0;
        var opacity = val > 0 ? (0.15 + 0.85 * val / (maxVal || 1)) : 0.08;
        var cell = S("rect", { x: cx, y: cy, width: cellSz, height: cellSz, rx: 2,
          fill: val > 0 ? curColor : "#9aa7b8", opacity: opacity });
        if (val > 0) {
          (function (d, v) {
            _tip(cell, "<b>" + d + "</b><br>" + fmtFn(v));
          })(ds, val);
        }
        s.appendChild(cell);
      }
    }
  }

  /* ---------- radar / spider (multi-metric polygons across axes) ---------- */
  PDC.radar = function (el, cfg) { reg(el, function () { _radar(el, cfg); }); };
  function _radar(el, cfg) {
    var labels = cfg.labels || [], series = cfg.series || [], h = cfg.height || 280;
    if (!labels.length || !series.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    var o = mkSVG(el, h), s = o.s, w = o.w, fmt = cfg.fmt || PDC.fmt.abbr, P = PDC.palette(), n = labels.length;
    var cx = w / 2, cy = h / 2 + 4, R = Math.max(20, Math.min(cx, cy) - 38);
    var max = niceMax(Math.max.apply(null, series.reduce(function (a, se) { return a.concat(se.values.map(function (v) { return +v || 0; })); }, [0])));
    var ang = function (i) { return -Math.PI / 2 + i * 2 * Math.PI / n; };
    var pt = function (i, rad) { return [cx + rad * Math.cos(ang(i)), cy + rad * Math.sin(ang(i))]; };
    function polyStr(rad) { var a = []; for (var i = 0; i < n; i++) { var p = pt(i, rad); a.push(p[0].toFixed(1) + "," + p[1].toFixed(1)); } return a.join(" "); }
    // concentric rings
    for (var g = 1; g <= 4; g++) s.appendChild(S("polygon", { class: "gridline", points: polyStr(R * g / 4), fill: "none" }));
    // spokes + axis labels
    for (var i = 0; i < n; i++) {
      var edge = pt(i, R);
      s.appendChild(S("line", { class: "gridline", x1: cx, y1: cy, x2: edge[0], y2: edge[1] }));
      var lp = pt(i, R + 14), a = ang(i), anchor = Math.abs(Math.cos(a)) < 0.3 ? "middle" : (Math.cos(a) > 0 ? "start" : "end");
      s.appendChild(S("text", { class: "tick", x: lp[0], y: lp[1] + 3, "text-anchor": anchor }, PDC.fmt.trunc(labels[i], 10)));
    }
    s.appendChild(S("text", { class: "tick", x: cx + 3, y: cy - R - 2, "text-anchor": "start" }, fmt(max)));
    // series polygons + vertex dots; collect per-series elements for legend toggles
    var radarEls = [];
    series.forEach(function (se, si) {
      var seEls = [];
      var col = se.color || P[si % 10], pts = [];
      for (var i = 0; i < n; i++) pts.push(pt(i, R * (+se.values[i] || 0) / (max || 1)));
      var poly = S("polygon", { points: pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" "),
        fill: cfg.fill === false ? "none" : col, "fill-opacity": cfg.fill === false ? 0 : 0.18, stroke: col, "stroke-width": 2, "stroke-linejoin": "round" });
      s.appendChild(poly); seEls.push(poly);
      if (canAnim()) { poly.style.opacity = "0"; setTimeout(function () { poly.style.transition = "opacity .5s ease"; poly.style.opacity = "1"; }, animD(60 + si * 80)); }
      pts.forEach(function (p, i) {
        if (cfg.showDots === false) {
          // Dots hidden — keep an invisible hover target so tooltips still work.
          var hit = S("circle", { cx: p[0], cy: p[1], r: 8, fill: "transparent" });
          _tip(hit, "<b>" + labels[i] + "</b><br>" + (se.name || ("Series " + (si + 1))) + ": " + fmt(+se.values[i] || 0));
          s.appendChild(hit); seEls.push(hit);
          return;
        }
        var dot = S("circle", { cx: p[0], cy: p[1], r: 3, fill: col, stroke: PDC.cssvar("--panel-bg"), "stroke-width": 1.2 });
        _tip(dot, "<b>" + labels[i] + "</b><br>" + (se.name || ("Series " + (si + 1))) + ": " + fmt(+se.values[i] || 0));
        s.appendChild(dot); seEls.push(dot);
      });
      radarEls.push(seEls);
    });
    if (cfg.legend !== false) _toggleLegend(el, series.map(function (se, i) {
      return { name: se.name || ("Series " + (i + 1)), color: se.color || P[i % 10], els: radarEls[i], base: "1" };
    }));
  }

  /* ---------- box plot (distribution: quartiles + whiskers per category) ----------
     Data: cfg.data = [{label, values:[v,...]}] — raw values per category.
     Renders horizontal (default) or vertical boxes.  CDF-only; pdc-ui.js unchanged. */
  PDC.boxplot = function (el, cfg) { reg(el, function () { _boxplot(el, cfg); }); };
  function _boxplot(el, cfg) {
    var data = cfg.data || [], h = cfg.height || 300, fmt = cfg.fmt || PDC.fmt.abbr;
    var horiz = cfg.horizontal !== false;
    if (!data.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }

    // Compute five-number summary from a raw values array.
    function fiveNum(arr) {
      var s = arr.slice().sort(function (a, b) { return a - b; });
      var n = s.length;
      function q(p) { var i = p * (n - 1), lo = Math.floor(i), hi = Math.ceil(i); return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo); }
      return { min: s[0], q1: q(0.25), med: q(0.5), q3: q(0.75), max: s[n - 1] };
    }

    var stats = data.map(function (d) { return { label: d.label, qs: fiveNum(d.values.length ? d.values : [0]) }; });
    var allVals = stats.reduce(function (a, s) { return a.concat([s.qs.min, s.qs.max]); }, [0]);
    var vMin = Math.min.apply(null, allVals), vMax = niceMax(Math.max.apply(null, allVals));
    if (vMax <= vMin) vMax = vMin + 1;

    var o = mkSVG(el, h), sv = o.s, w = o.w;
    var ml = horiz ? 90 : 36, mr = 20, mt = 16, mb = horiz ? 36 : 52;
    var pW = w - ml - mr, pH = h - mt - mb, n = stats.length, col = PDC.palette()[0];

    function vp(v) { return (v - vMin) / (vMax - vMin); } // 0..1 value-to-position ratio

    if (horiz) {
      // Horizontal layout — labels on Y-axis, values on X-axis
      var rowH = pH / n, bh = Math.min(rowH * 0.5, 22);
      // X-axis grid + ticks
      for (var t = 0; t <= 4; t++) {
        var xv = vMin + (vMax - vMin) * t / 4, xp = ml + vp(xv) * pW;
        sv.appendChild(S("line", { class: "gridline", x1: xp, y1: mt, x2: xp, y2: mt + pH }));
        sv.appendChild(S("text", { class: "tick", x: xp, y: mt + pH + 14, "text-anchor": "middle" }, fmt(xv)));
      }
      stats.forEach(function (st) {
        var cy = mt + stats.indexOf(st) * rowH + rowH / 2, qs = st.qs;
        var xv2px = function (v) { return ml + vp(v) * pW; };
        var xMin = xv2px(qs.min), xQ1 = xv2px(qs.q1), xMed = xv2px(qs.med), xQ3 = xv2px(qs.q3), xMax = xv2px(qs.max);
        // Whisker lines + caps
        sv.appendChild(S("line", { x1: xMin, y1: cy, x2: xQ1, y2: cy, stroke: col, "stroke-width": 1.5, "stroke-dasharray": "3 2" }));
        sv.appendChild(S("line", { x1: xQ3, y1: cy, x2: xMax, y2: cy, stroke: col, "stroke-width": 1.5, "stroke-dasharray": "3 2" }));
        sv.appendChild(S("line", { x1: xMin, y1: cy - bh / 3, x2: xMin, y2: cy + bh / 3, stroke: col, "stroke-width": 1.5 }));
        sv.appendChild(S("line", { x1: xMax, y1: cy - bh / 3, x2: xMax, y2: cy + bh / 3, stroke: col, "stroke-width": 1.5 }));
        // IQR box + median
        sv.appendChild(S("rect", { x: xQ1, y: cy - bh / 2, width: Math.max(1, xQ3 - xQ1), height: bh, fill: col, "fill-opacity": 0.18, stroke: col, "stroke-width": 1.5, rx: 2 }));
        sv.appendChild(S("line", { x1: xMed, y1: cy - bh / 2, x2: xMed, y2: cy + bh / 2, stroke: col, "stroke-width": 2.5 }));
        // Category label on left
        sv.appendChild(S("text", { class: "tick", x: ml - 6, y: cy + 4, "text-anchor": "end" }, PDC.fmt.trunc(st.label, 16)));
        // Invisible hover target
        var tipHtml = "<b>" + st.label + "</b><br>Min: " + fmt(qs.min) + " &nbsp;Q1: " + fmt(qs.q1) + "<br>Median: " + fmt(qs.med) + "<br>Q3: " + fmt(qs.q3) + " &nbsp;Max: " + fmt(qs.max);
        var hit = S("rect", { x: xMin - 2, y: cy - bh * 2, width: Math.max(4, xMax - xMin + 4), height: bh * 4, fill: "transparent", style: "cursor:pointer" });
        _tip(hit, tipHtml);
        sv.appendChild(hit);
      });
    } else {
      // Vertical layout — labels on X-axis, values on Y-axis
      var colW = pW / n, bw = Math.min(colW * 0.5, 28);
      // Y-axis grid + ticks
      for (var t2 = 0; t2 <= 4; t2++) {
        var yv = vMin + (vMax - vMin) * t2 / 4, yp = mt + pH - vp(yv) * pH;
        sv.appendChild(S("line", { class: "gridline", x1: ml, y1: yp, x2: ml + pW, y2: yp }));
        sv.appendChild(S("text", { class: "tick", x: ml - 4, y: yp + 4, "text-anchor": "end" }, fmt(yv)));
      }
      stats.forEach(function (st) {
        var cx = ml + stats.indexOf(st) * colW + colW / 2, qs = st.qs;
        var yv2px = function (v) { return mt + pH - vp(v) * pH; };
        var yMin = yv2px(qs.min), yQ1 = yv2px(qs.q1), yMed = yv2px(qs.med), yQ3 = yv2px(qs.q3), yMax = yv2px(qs.max);
        // Whisker lines + caps
        sv.appendChild(S("line", { x1: cx, y1: yMax, x2: cx, y2: yQ3, stroke: col, "stroke-width": 1.5, "stroke-dasharray": "3 2" }));
        sv.appendChild(S("line", { x1: cx, y1: yQ1, x2: cx, y2: yMin, stroke: col, "stroke-width": 1.5, "stroke-dasharray": "3 2" }));
        sv.appendChild(S("line", { x1: cx - bw / 3, y1: yMax, x2: cx + bw / 3, y2: yMax, stroke: col, "stroke-width": 1.5 }));
        sv.appendChild(S("line", { x1: cx - bw / 3, y1: yMin, x2: cx + bw / 3, y2: yMin, stroke: col, "stroke-width": 1.5 }));
        // IQR box + median
        sv.appendChild(S("rect", { x: cx - bw / 2, y: yQ3, width: bw, height: Math.max(1, yQ1 - yQ3), fill: col, "fill-opacity": 0.18, stroke: col, "stroke-width": 1.5, rx: 2 }));
        sv.appendChild(S("line", { x1: cx - bw / 2, y1: yMed, x2: cx + bw / 2, y2: yMed, stroke: col, "stroke-width": 2.5 }));
        // X label
        sv.appendChild(S("text", { class: "tick", x: cx, y: mt + pH + 16, "text-anchor": "middle" }, PDC.fmt.trunc(st.label, 10)));
        // Invisible hover target
        var tipHtml2 = "<b>" + st.label + "</b><br>Min: " + fmt(qs.min) + " &nbsp;Q1: " + fmt(qs.q1) + "<br>Median: " + fmt(qs.med) + "<br>Q3: " + fmt(qs.q3) + " &nbsp;Max: " + fmt(qs.max);
        var hit2 = S("rect", { x: cx - bw * 2, y: Math.min(yMax, yMin), width: bw * 4, height: Math.max(4, Math.abs(yMin - yMax)), fill: "transparent", style: "cursor:pointer" });
        _tip(hit2, tipHtml2);
        sv.appendChild(hit2);
      });
    }
  }

  /* ---------- lollipop / dot-plot (horizontal ranked comparison) ----------
     Clean, modern alternative to bar charts: a thin stem line runs from the
     left axis to a bold dot at the value. Lower visual weight, excellent for
     league tables and rankings. Same labelCol/valueCol binding as PDC.bars.
     API: PDC.lollipop(el, { data:[{label,value,color?}], fmt, color, height, labelW }) */
  PDC.lollipop = function (el, cfg) { reg(el, function () { _lollipop(el, cfg); }); };
  function _lollipop(el, cfg) {
    var data = cfg.data || [], h = cfg.height || 260;
    if (!data.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    var o = mkSVG(el, h), s = o.s, w = o.w, fmt = cfg.fmt || PDC.fmt.abbr;
    var base = cfg.color || PDC.cssvar("--pentaho");
    var max = niceMax(Math.max.apply(null, data.map(function (d) { return +d.value || 0; })));
    var mL = cfg.labelW || 130, mR = 54, mT = 8, mB = 8;
    var ih = h - mT - mB, n = data.length, bh = ih / n;
    var dotR = Math.max(4, Math.min(7, bh * 0.36));
    // subtle vertical grid lines
    for (var g = 0; g <= 4; g++) {
      var gx = mL + (w - mL - mR) * g / 4;
      s.appendChild(S("line", { class: "gridline", x1: gx, y1: mT, x2: gx, y2: mT + ih }));
    }
    data.forEach(function (d, i) {
      var midY = mT + i * bh + bh / 2;
      var barW = (w - mL - mR) * Math.max(0, (+d.value || 0) / (max || 1));
      var col = d.color || base;
      var tipHtml = "<b>" + d.label + "</b><br>" + fmt(d.value);
      // thin stem (track)
      var trackLine = S("line", { x1: mL, y1: midY, x2: mL + barW, y2: midY,
        stroke: col, "stroke-width": 2, opacity: 0.35 });
      s.appendChild(trackLine);
      // dot at the value — bold & prominent
      var dot = S("circle", { class: "dot", cx: mL + barW, cy: midY, r: dotR,
        fill: col, stroke: PDC.cssvar("--panel-bg"), "stroke-width": 2 });
      _tip(dot, tipHtml);
      s.appendChild(dot);
      // label (left-aligned, right-anchored)
      s.appendChild(S("text", { class: "tick", x: mL - 8, y: midY + 4, "text-anchor": "end" },
        PDC.fmt.trunc(d.label, cfg.labelChars || 18)));
      // value next to the dot
      s.appendChild(S("text", { class: "val-label", x: mL + barW + dotR + 6, y: midY + 4 },
        fmt(d.value)));
      // animation: stem grows, dot fades in
      if (canAnim()) {
        trackLine.style.opacity = 0;
        dot.style.opacity = 0;
        (function (tl_, dot_, idx_) {
          setTimeout(function () {
            tl_.style.transition = "opacity .3s ease"; tl_.style.opacity = 0.35;
            dot_.style.transition = "opacity .28s ease"; dot_.style.opacity = 1;
          }, animD(18 + idx_ * 32));
        })(trackLine, dot, i);
      }
    });
  }

  /* ---------- slope chart (before / after period comparison) ----------
     Draws one sloping line per category connecting its value at T1 (left)
     to its value at T2 (right). Ideal for "what changed?" storytelling —
     risers and fallers immediately visible. Labels at both endpoints with
     the formatted value; category labels span both sides.
     API: PDC.slope(el, {
       items: [{label, v1, v2}], t1, t2, fmt, height, palette
     }) */
  PDC.slope = function (el, cfg) { reg(el, function () { _slope(el, cfg); }); };
  function _slope(el, cfg) {
    var items = cfg.items || [], h = cfg.height || 300;
    if (!items.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    var t1 = cfg.t1 || "T1", t2 = cfg.t2 || "T2";
    var fmtFn = cfg.fmt || PDC.fmt.abbr;
    var palette = cfg.palette || PDC.palette();
    var allVals = items.reduce(function (a, it) { return a.concat([+it.v1 || 0, +it.v2 || 0]); }, []);
    var minV = Math.min.apply(null, allVals.concat([0]));
    var maxV = niceMax(Math.max.apply(null, allVals.concat([1])));
    // allow negative: adjust floor when data goes below zero
    var floor = minV < 0 ? minV - (maxV - minV) * 0.08 : 0;
    var range = maxV - floor || 1;
    var o = mkSVG(el, h), s = o.s, w = o.w;
    var mL = 72, mR = 72, mT = 36, mB = 20;
    var ih = h - mT - mB, iw = w - mL - mR;
    var xL = mL, xR = mL + iw;
    function ys(v) { return mT + ih * (1 - (+v - floor) / range); }
    // axis column headers
    s.appendChild(S("text", { class: "tick", x: xL, y: mT - 12, "text-anchor": "middle", "font-weight": "600", "font-size": 12 }, t1));
    s.appendChild(S("text", { class: "tick", x: xR, y: mT - 12, "text-anchor": "middle", "font-weight": "600", "font-size": 12 }, t2));
    // subtle horizontal grid lines
    for (var gi = 0; gi <= 4; gi++) {
      var gy = mT + ih * gi / 4;
      s.appendChild(S("line", { class: "gridline", x1: xL, y1: gy, x2: xR, y2: gy }));
    }
    // vertical axis lines
    s.appendChild(S("line", { x1: xL, y1: mT - 4, x2: xL, y2: mT + ih + 4, stroke: "var(--panel-border,#d0d4da)", "stroke-width": 1.5 }));
    s.appendChild(S("line", { x1: xR, y1: mT - 4, x2: xR, y2: mT + ih + 4, stroke: "var(--panel-border,#d0d4da)", "stroke-width": 1.5 }));
    // draw one slope line per item
    items.forEach(function (it, idx) {
      var col = palette[idx % palette.length];
      var y1 = ys(it.v1), y2 = ys(it.v2);
      var dir = (+it.v2 || 0) - (+it.v1 || 0);
      var strokeCol = dir > 0 ? (PDC.cssvar("--good") || "#27ae60") : dir < 0 ? (PDC.cssvar("--bad") || "#e0395e") : col;
      var line = S("line", { x1: xL, y1: y1, x2: xR, y2: y2,
        stroke: strokeCol, "stroke-width": 2, opacity: 0.8, "stroke-linecap": "round" });
      var tipHtml = "<b>" + it.label + "</b><br>" + t1 + ": " + fmtFn(it.v1) + "<br>" + t2 + ": " + fmtFn(it.v2) +
        (dir !== 0 ? "<br>Δ " + (dir > 0 ? "+" : "") + fmtFn(dir) : "");
      _tip(line, tipHtml);
      s.appendChild(line);
      // endpoint dots
      [{ x: xL, y: y1 }, { x: xR, y: y2 }].forEach(function (pt) {
        var dot = S("circle", { cx: pt.x, cy: pt.y, r: 4, fill: strokeCol, stroke: PDC.cssvar("--panel-bg") || "#fff", "stroke-width": 2 });
        _tip(dot, tipHtml);
        s.appendChild(dot);
      });
      // left value label (right-aligned just inside left axis)
      s.appendChild(S("text", { class: "val-label", x: xL - 6, y: y1 + 4, "text-anchor": "end", "font-size": 10 }, fmtFn(it.v1)));
      // right value label (left-aligned just outside right axis)
      s.appendChild(S("text", { class: "val-label", x: xR + 6, y: y2 + 4, "text-anchor": "start", "font-size": 10 }, fmtFn(it.v2)));
      // category label centred on the line midpoint (subtle, offset slightly up)
      var midX = (xL + xR) / 2, midY = (y1 + y2) / 2;
      var labelEl = S("text", { class: "tick", x: midX, y: midY - 6, "text-anchor": "middle", "font-size": 9.5 },
        PDC.fmt.trunc(it.label, 16));
      s.appendChild(labelEl);
      // entrance animation: line fades in with slight delay per row
      if (canAnim()) {
        line.style.opacity = 0;
        (function (l_, idx_) {
          setTimeout(function () { l_.style.transition = "opacity .4s ease"; l_.style.opacity = 0.8; }, animD(30 + idx_ * 45));
        })(line, idx);
      }
    });
  }

  /* ---------- dot plot / Cleveland dot plot (distribution over categories) ----------
     Pure dots — no stems. Each row renders a single filled dot positioned along
     a horizontal axis. Great for showing values across many categories without the
     visual weight of a bar chart. Optionally a second column (groupCol) adds a
     second dot per row in a contrasting color, enabling simple two-group comparison.
     Rows are sorted by the primary value (descending) by default.
     API: PDC.dotplot(el, {
       items: [{label, v1, v2?}], fmt, color1, color2,
       group1, group2, height, labelW, sorted
     }) */
  PDC.dotplot = function (el, cfg) { reg(el, function () { _dotplot(el, cfg); }); };
  function _dotplot(el, cfg) {
    var items = cfg.items || [], h = cfg.height || 280;
    if (!items.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    var sorted = cfg.sorted !== false; // sort descending by v1 by default
    if (sorted) {
      items = items.slice().sort(function (a, b) { return (+b.v1 || 0) - (+a.v1 || 0); });
    }
    var hasGroup = items.some(function (it) { return it.v2 != null; });
    var palette = PDC.palette();
    var c1 = cfg.color1 || PDC.cssvar("--pentaho") || palette[0];
    var c2 = cfg.color2 || palette[1] || "#7d3c98";
    var g1 = cfg.group1 || "Primary";
    var g2 = cfg.group2 || "Secondary";
    var fmtFn = cfg.fmt || PDC.fmt.abbr;
    var o = mkSVG(el, h), s = o.s, w = o.w;
    var n = items.length;
    var mL = cfg.labelW || 130, mR = hasGroup ? 80 : 60, mT = hasGroup ? 28 : 14, mB = 10;
    var ih = h - mT - mB, bh = ih / n;
    var allVals = items.reduce(function (a, it) {
      return a.concat([+it.v1 || 0]).concat(hasGroup ? [+it.v2 || 0] : []);
    }, []);
    var max = niceMax(Math.max.apply(null, allVals.concat([0])));
    // vertical grid lines (subtle reference lines at even intervals)
    for (var g = 0; g <= 4; g++) {
      var gx = mL + (w - mL - mR) * g / 4;
      s.appendChild(S("line", { class: "gridline", x1: gx, y1: mT, x2: gx, y2: mT + ih }));
      if (g > 0) {
        s.appendChild(S("text", { class: "tick", x: gx, y: mT - 4, "text-anchor": "middle", "font-size": 8.5 },
          fmtFn(max * g / 4)));
      }
    }
    // optional legend for two-group mode
    if (hasGroup) {
      var legX = mL;
      [{ col: c1, lbl: g1 }, { col: c2, lbl: g2 }].forEach(function (leg, li) {
        var lx = legX + li * 90;
        s.appendChild(S("circle", { cx: lx + 5, cy: 10, r: 4, fill: leg.col }));
        s.appendChild(S("text", { class: "tick", x: lx + 12, y: 14, "font-size": 9.5 }, leg.lbl));
      });
    }
    var dotR = Math.max(3.5, Math.min(6, bh * 0.32));
    items.forEach(function (it, i) {
      var midY = mT + i * bh + bh / 2;
      // a very faint row track for spatial reference
      s.appendChild(S("line", { x1: mL, y1: midY, x2: w - mR, y2: midY,
        stroke: "var(--panel-border,#d8dde6)", "stroke-width": 1, opacity: 0.55 }));
      // category label
      s.appendChild(S("text", { class: "tick", x: mL - 8, y: midY + 4, "text-anchor": "end" },
        PDC.fmt.trunc(it.label, cfg.labelChars || 18)));
      // primary dot (v1)
      var x1 = mL + (w - mL - mR) * Math.max(0, (+it.v1 || 0) / (max || 1));
      var tipHtml1 = "<b>" + it.label + "</b>" + (hasGroup ? " — " + g1 : "") + "<br>" + fmtFn(it.v1);
      var dot1 = S("circle", { class: "dot", cx: x1, cy: midY, r: dotR,
        fill: c1, stroke: PDC.cssvar("--panel-bg"), "stroke-width": 1.5 });
      _tip(dot1, tipHtml1);
      s.appendChild(dot1);
      // optional second dot (v2) for group comparison
      if (hasGroup && it.v2 != null) {
        var x2 = mL + (w - mL - mR) * Math.max(0, (+it.v2 || 0) / (max || 1));
        // thin connector between the two dots
        if (Math.abs(x2 - x1) > 2) {
          s.appendChild(S("line", { x1: Math.min(x1, x2), y1: midY, x2: Math.max(x1, x2), y2: midY,
            stroke: "var(--panel-border,#c8d0dc)", "stroke-width": 1.5, opacity: 0.7 }));
        }
        var tipHtml2 = "<b>" + it.label + "</b> — " + g2 + "<br>" + fmtFn(it.v2);
        var dot2 = S("circle", { class: "dot", cx: x2, cy: midY, r: dotR,
          fill: c2, stroke: PDC.cssvar("--panel-bg"), "stroke-width": 1.5 });
        _tip(dot2, tipHtml2);
        s.appendChild(dot2);
      }
      // value label to the right of the rightmost dot
      var labelX = hasGroup ? Math.max(x1, (it.v2 != null ? mL + (w - mL - mR) * Math.max(0, (+it.v2 || 0) / (max || 1)) : x1)) : x1;
      s.appendChild(S("text", { class: "val-label", x: labelX + dotR + 5, y: midY + 4, "font-size": 9.5 },
        fmtFn(it.v1)));
      // entrance animation: dots pop in with staggered fade
      if (canAnim()) {
        dot1.style.opacity = 0;
        (function (d_, idx_) {
          setTimeout(function () { d_.style.transition = "opacity .25s ease"; d_.style.opacity = 1; }, animD(20 + idx_ * 28));
        })(dot1, i);
      }
    });
  }

  /* ---------- beeswarm / strip plot (distribution over individual points) ----------
     Shows every data row as a circle at its value position along a horizontal axis.
     Dots are jittered vertically within each strip so overlapping points separate
     cleanly — reveals density, clusters, and outliers at the raw-data level.
     If categoryCol is provided, rows are grouped into labeled horizontal strips
     (one per category). Without a category, all points form a single strip.
     The jitter algorithm: for each dot, try y = center, center±step, center±2step…
     stopping at the first non-overlapping position. Fully deterministic — same data
     produces the same layout every render.
     API: PDC.beeswarm(el, {
       items: [{label, value, category?}], fmt, dotR, height
     }) */
  PDC.beeswarm = function (el, cfg) { reg(el, function () { _beeswarm(el, cfg); }); };
  function _beeswarm(el, cfg) {
    var items = cfg.items || [], h = cfg.height || 300;
    if (!items.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }

    // Group items by category (or into a single unnamed strip when no category)
    var groups = {}, groupOrder = [];
    items.forEach(function (it) {
      var cat = it.category != null ? String(it.category) : "";
      if (!groups[cat]) { groups[cat] = []; groupOrder.push(cat); }
      groups[cat].push(it);
    });
    var numGroups = groupOrder.length;
    var hasCategories = numGroups > 1 || groupOrder[0] !== "";

    var palette = PDC.palette();
    var fmtFn = cfg.fmt || PDC.fmt.abbr;
    var dotR = cfg.dotR || 5;

    var o = mkSVG(el, h), s = o.s, w = o.w;
    var mL = hasCategories ? 110 : 40, mR = 50, mT = 22, mB = 26;
    var iw = w - mL - mR, ih = h - mT - mB;

    // Global x-axis range across all items
    var allVals = items.map(function (it) { return +it.value || 0; });
    var rawMax = Math.max.apply(null, allVals.concat([0]));
    var rawMin = Math.min.apply(null, allVals.concat([0]));
    var spanMax = niceMax(Math.abs(rawMax));
    var xMin = rawMin < 0 ? -niceMax(Math.abs(rawMin)) : 0;
    var xMax = spanMax || 1;
    var xScale = function (v) { return mL + iw * ((+v || 0) - xMin) / (xMax - xMin); };

    // X-axis grid lines and value ticks
    for (var g = 0; g <= 4; g++) {
      var gx = mL + iw * g / 4;
      s.appendChild(S("line", { class: "gridline", x1: gx, y1: mT, x2: gx, y2: mT + ih }));
      s.appendChild(S("text", { class: "tick", x: gx, y: mT + ih + 14, "text-anchor": "middle", "font-size": 9 },
        fmtFn(xMin + (xMax - xMin) * g / 4)));
    }

    var stripH = ih / numGroups;

    groupOrder.forEach(function (cat, gi) {
      var stripItems = groups[cat];
      var stripY = mT + gi * stripH;
      var midY = stripY + stripH / 2;
      var halfStrip = stripH / 2 - dotR - 2;

      // Category label on the left axis
      if (hasCategories) {
        s.appendChild(S("text", { class: "tick", x: mL - 8, y: midY + 4, "text-anchor": "end" },
          PDC.fmt.trunc(cat, 14)));
      }
      // Subtle horizontal separator between strips
      if (gi > 0) {
        s.appendChild(S("line", { class: "gridline", x1: mL, y1: stripY, x2: w - mR, y2: stripY, opacity: 0.45 }));
      }

      var col = palette[gi % palette.length];
      // Sort by value so the jitter packs from the sparser regions outward
      var sorted = stripItems.slice().sort(function (a, b) { return (+a.value || 0) - (+b.value || 0); });
      var placed = []; // [{x, y}] — already-placed dots for overlap detection

      sorted.forEach(function (it, idx) {
        var x = xScale(it.value);
        var y = midY;
        // Try progressively larger y offsets (alternating above/below) until no overlap
        var step = dotR * 2.3;
        var maxRows = Math.max(1, Math.floor(halfStrip / step));
        outer: for (var row = 0; row <= maxRows; row++) {
          var candidates = row === 0 ? [midY] : [midY - row * step, midY + row * step];
          for (var ci = 0; ci < candidates.length; ci++) {
            var cy = candidates[ci];
            var ok = true;
            for (var pi = 0; pi < placed.length; pi++) {
              var dx = placed[pi].x - x, dy = placed[pi].y - cy;
              var minDist = dotR * 2.15;
              if (dx * dx + dy * dy < minDist * minDist) { ok = false; break; }
            }
            if (ok) { y = cy; break outer; }
          }
        }
        // Clamp to strip bounds
        y = Math.max(stripY + dotR + 2, Math.min(stripY + stripH - dotR - 2, y));
        placed.push({ x: x, y: y });

        var tipHtml = "<b>" + (it.label || "") + "</b><br>" + fmtFn(it.value);
        if (it.category) tipHtml += "<br><span class='muted'>" + it.category + "</span>";
        var dot = S("circle", { cx: x, cy: y, r: dotR, fill: col,
          stroke: PDC.cssvar("--panel-bg") || "#fff", "stroke-width": 1.2, opacity: 0.8 });
        _tip(dot, tipHtml);
        s.appendChild(dot);
        if (canAnim()) {
          dot.style.opacity = 0;
          (function (d_, i_) {
            setTimeout(function () { d_.style.transition = "opacity .25s ease"; d_.style.opacity = 0.8; }, animD(15 + i_ * 15));
          })(dot, idx);
        }
      });
    });
  }

  /* ── Histogram (F14) ──────────────────────────────────────────────────────────
     Frequency distribution chart: auto-bins a numeric valueCol into N equal-width
     buckets and renders one bar per bin. Bars touch (no inter-bar gap) to signal
     continuity of the numeric range. Ideal for understanding distribution shape —
     normal, skewed, multimodal — at a glance.
     Bound via: valueCol (required), no labelCol needed.
     Options: bins (default 10), color, fmt (for axis ticks), height. */
  PDC.histogram = function (el, rows, map, opts) {
    var w = W(el), h = +(opts && opts.height) || 300;
    var bins = Math.max(2, Math.min(50, +(opts && opts.bins) || 10));
    var col = (map && map.valueCol) || "";
    var color = PDC.cssvar((opts && opts.color) || "--pentaho") || "#005bb5";
    var fmtFn = PDC.fmt[((opts && opts.fmt) || "n")] || PDC.fmt.n;

    // Extract numeric values from the bound column
    var vals = (rows || []).map(function (r) { return parseFloat(r[col]); }).filter(function (v) { return !isNaN(v); });
    if (!vals.length) { el.innerHTML = "<p style='color:var(--faint);padding:16px;font-size:12px;text-align:center'>No numeric data in column <b>" + (col || "(none)") + "</b></p>"; return; }

    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    var rng = mx - mn;
    // When all values are identical, create a single bin centred on that value
    if (rng === 0) { mn -= 0.5; mx += 0.5; rng = 1; }
    var binW = rng / bins;

    // Tally each value into its bucket
    var counts = [];
    for (var b = 0; b < bins; b++) counts.push(0);
    vals.forEach(function (v) {
      var idx = Math.min(bins - 1, Math.floor((v - mn) / binW));
      counts[idx]++;
    });
    var maxCt = Math.max.apply(null, counts) || 1;

    // SVG margins
    var mL = 44, mR = 14, mT = 14, mB = 38;
    var iw = w - mL - mR, ih = h - mT - mB;
    if (iw < 10 || ih < 10) return;
    var barW = iw / bins;

    var svg = S("svg", { width: w, height: h, viewBox: "0 0 " + w + " " + h, style: "overflow:visible;display:block" });

    // Y-axis gridlines + tick labels (count)
    var yTicks = [0, 0.25, 0.5, 0.75, 1];
    yTicks.forEach(function (t) {
      var y = mT + ih * (1 - t);
      var ct = Math.round(maxCt * t);
      svg.appendChild(S("line", { x1: mL, y1: y, x2: mL + iw, y2: y, stroke: "var(--panel-border,#e0e4ef)", "stroke-width": 0.7 }));
      svg.appendChild(S("text", { x: mL - 5, y: y + 4, "text-anchor": "end", "font-size": 9, fill: "var(--text-muted,#6b7a99)" }, String(ct)));
    });
    // Y-axis baseline
    svg.appendChild(S("line", { x1: mL, y1: mT + ih, x2: mL + iw, y2: mT + ih, stroke: "var(--text-muted,#6b7a99)", "stroke-width": 1 }));

    // X-axis tick labels (one every 2–3 bins to avoid crowding)
    var xTickEvery = Math.max(1, Math.round(bins / 5));
    for (var b2 = 0; b2 <= bins; b2++) {
      if (b2 % xTickEvery === 0 || b2 === bins) {
        var xv = mn + b2 * binW;
        var xt = mL + b2 * barW;
        svg.appendChild(S("line", { x1: xt, y1: mT + ih, x2: xt, y2: mT + ih + 4, stroke: "var(--text-muted,#6b7a99)", "stroke-width": 1 }));
        svg.appendChild(S("text", { x: xt, y: mT + ih + 14, "text-anchor": "middle", "font-size": 9, fill: "var(--text-muted,#6b7a99)" }, fmtFn(xv)));
      }
    }

    // X-axis label: bound column name
    svg.appendChild(S("text", { x: mL + iw / 2, y: h - 2, "text-anchor": "middle", "font-size": 10, fill: "var(--text-muted,#6b7a99)", "font-style": "italic" }, col));

    // Bars — one per bin, touching (no gap)
    counts.forEach(function (ct, bi) {
      var bh = (ct / maxCt) * ih;
      var x = mL + bi * barW;
      var y = mT + ih - bh;
      var tip = fmtFn(mn + bi * binW) + " – " + fmtFn(mn + (bi + 1) * binW) + ": <b>" + ct + "</b> rows";
      var rect = S("rect", { x: x + 0.5, y: y, width: Math.max(0, barW - 0.5), height: bh, fill: color, rx: 1 });
      if (canAnim()) {
        // scaleY is a CSS transform function, not a valid SVG transform-attribute function
        // (that dialect only has matrix/translate/scale/rotate/skewX/skewY) — so this has to
        // go through .style.transform (CSS), same convention as the other animated charts,
        // not setAttribute("transform", ...).
        rect.style.transform = "scaleY(0)";
        rect.style.transformOrigin = (x + barW / 2) + "px " + (mT + ih) + "px";
        (function (r_, bi_) {
          setTimeout(function () {
            r_.style.transition = "transform " + (animD(250) / 1000).toFixed(2) + "s ease";
            r_.style.transform = "scaleY(1)";
          }, animD(bi_ * 20));
        })(rect, bi);
      }
      _tip(rect, tip);
      svg.appendChild(rect);
    });

    el.innerHTML = "";
    el.appendChild(svg);
  };

  /* ---------- polar area chart (rose chart) — equal-angle wedges, radius ∝ √value ----------
     Each category gets an identical angular slice of the circle; the wedge radius (and thus
     area) is proportional to √(value/max) — area encoding is more perceptually accurate than
     radius encoding because human vision judges area, not radius length. Great for cyclic or
     periodic data: monthly patterns, compass directions, performance across dimensions.
     API: PDC.polarArea(el, {
       labels: string[], values: number[], fmt, height, showLabels
     }) */
  PDC.polarArea = function (el, cfg) { reg(el, function () { _polarArea(el, cfg); }); };
  function _polarArea(el, cfg) {
    var labels = cfg.labels || [], values = cfg.values || [], h = cfg.height || 280;
    if (!labels.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    var n = labels.length;
    var fmtFn = cfg.fmt || PDC.fmt.abbr;
    var P = PDC.palette();
    var showLabels = cfg.showLabels !== false;

    var o = mkSVG(el, h), s = o.s, w = o.w;
    var cx = w / 2, cy = h / 2;
    // Leave room for outer labels; shrink if too many slices crowd the edge
    var maxR = Math.min(cx, cy) - (showLabels ? Math.max(22, 8 + n * 1.5) : 10);
    if (maxR < 15) maxR = 15;

    var nums = values.map(function (v) { return +v || 0; });
    var maxV = Math.max.apply(null, nums.concat([1]));
    var total = nums.reduce(function (a, v) { return a + v; }, 0);

    var tau = 2 * Math.PI;
    var angleStep = tau / n;
    var startAngle = -Math.PI / 2; // start from the 12 o'clock position

    // Subtle concentric guide rings at 25 / 50 / 75 / 100% of max radius
    [0.25, 0.5, 0.75, 1].forEach(function (t) {
      var gr = maxR * Math.sqrt(t);
      s.appendChild(S("circle", { cx: cx, cy: cy, r: gr, fill: "none",
        stroke: PDC.cssvar("--panel-border") || "#e0e4ef", "stroke-width": 0.7 }));
    });

    // Draw each wedge
    nums.forEach(function (val, i) {
      // sqrt encoding: r² ∝ val so area ∝ val (more perceptually accurate than linear r)
      var r = maxR * Math.sqrt(val / maxV);
      var a0 = startAngle + i * angleStep;
      var a1 = a0 + angleStep;
      var col = P[i % P.length];

      var x0 = cx + Math.cos(a0) * r, y0 = cy + Math.sin(a0) * r;
      var x1 = cx + Math.cos(a1) * r, y1 = cy + Math.sin(a1) * r;

      // large-arc-flag = 0 when angle < 180°; sweep-flag = 1 (clockwise)
      var largeArc = (angleStep > Math.PI) ? 1 : 0;
      var d = "M" + cx.toFixed(1) + "," + cy.toFixed(1) +
              " L" + x0.toFixed(1) + "," + y0.toFixed(1) +
              " A" + r.toFixed(1) + "," + r.toFixed(1) + " 0 " + largeArc + ",1 " +
              x1.toFixed(1) + "," + y1.toFixed(1) + " Z";

      var pct = total > 0 ? ((val / total) * 100).toFixed(1) + "%" : "—";
      var tipHtml = "<b>" + labels[i] + "</b><br>" + fmtFn(val) + " (" + pct + ")";

      var path = S("path", { d: d, fill: col, opacity: 0.85,
        stroke: PDC.cssvar("--panel-bg") || "#fff", "stroke-width": 1.5 });
      _tip(path, tipHtml);
      s.appendChild(path);

      // Label at the outer edge, aligned to the arc midpoint
      if (showLabels && r > 8) {
        var aMid = a0 + angleStep / 2;
        var labelR = maxR + 12;
        var lx = cx + Math.cos(aMid) * labelR, ly = cy + Math.sin(aMid) * labelR;
        var anchor = lx < cx - 8 ? "end" : lx > cx + 8 ? "start" : "middle";
        s.appendChild(S("text", { "class": "tick", x: lx.toFixed(1), y: (ly + 3).toFixed(1),
          "text-anchor": anchor, "font-size": 9 }, PDC.fmt.trunc(labels[i], 10)));
      }

      // Entrance animation: wedges fade in sequentially from top
      if (canAnim()) {
        path.style.opacity = "0";
        (function (p_, idx_) {
          setTimeout(function () { p_.style.transition = "opacity .4s ease"; p_.style.opacity = "0.85"; },
            animD(20 + idx_ * 45));
        })(path, i);
      }
    });

    // Center label: formatted total + subtle "total" caption
    s.appendChild(S("text", { x: cx.toFixed(1), y: (cy + 4).toFixed(1),
      "text-anchor": "middle", "font-size": 11, "font-weight": "600",
      fill: PDC.cssvar("--text") || "#1a2236" }, fmtFn(total)));
    s.appendChild(S("text", { x: cx.toFixed(1), y: (cy + 16).toFixed(1),
      "text-anchor": "middle", "font-size": 9,
      fill: PDC.cssvar("--text-muted") || "#6b7a99" }, "total"));
  }

  /* ---------- step / staircase chart — right-angle transitions ----------
     Each x→x+1 transition goes horizontal first (at the current y), then
     vertical to the new y — making discrete state changes visually explicit.
     Unlike a line chart's diagonal, the right-angle path communicates that
     the value does NOT interpolate between states; it jumps at a precise point.
     Great for pricing tiers, API quota levels, regulatory limits, SLA bands.
     API: PDC.step(el, {
       labels: string[], series: [{name, color, values}], area, fmt, height
     }) */
  PDC.step = function (el, cfg) { reg(el, function () { _step(el, cfg); }); };
  function _step(el, cfg) {
    var series = cfg.series || [], labels = cfg.labels || [];
    var h = cfg.height || 300, fmtFn = cfg.fmt || PDC.fmt.abbr;
    if (!labels.length || !series.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }

    var o = mkSVG(el, h), s = o.s, w = o.w;
    var mT = 14, mB = 28, mL = 40, mR = 12;
    var iw = w - mL - mR, ih = h - mT - mB;

    var allVals = series.reduce(function (a, se) { return a.concat(se.values || []); }, []);
    var maxV = Math.max.apply(null, allVals.concat([0]));
    var minV = Math.min.apply(null, allVals.concat([0]));
    if (maxV === minV) maxV = minV + 1;

    var n = labels.length;
    var xs = function (i) { return mL + (i / Math.max(n - 1, 1)) * iw; };
    var ys = function (v) { return mT + ih - ((v - minV) / (maxV - minV)) * ih; };

    // Horizontal grid lines + y-axis tick labels
    for (var ti = 0; ti <= 4; ti++) {
      var tv = minV + (maxV - minV) * (ti / 4);
      var ty = ys(tv);
      s.appendChild(S("line", { x1: mL, y1: ty, x2: mL + iw, y2: ty,
        stroke: PDC.cssvar("--panel-border"), "stroke-width": 0.8,
        "stroke-dasharray": ti === 0 ? "none" : "3 3" }));
      s.appendChild(S("text", { class: "tick", x: mL - 3, y: ty + 3, "text-anchor": "end" }, fmtFn(tv)));
    }
    var xStep = Math.ceil(n / 8);
    labels.forEach(function (lb, i) {
      if (i % xStep === 0 || i === n - 1)
        s.appendChild(S("text", { class: "tick", x: xs(i), y: mT + ih + 14, "text-anchor": "middle" }, PDC.fmt.trunc(lb, 9)));
    });

    var P = PDC.palette();
    series.forEach(function (se, si) {
      var col = se.color || P[si % P.length];
      var vals = (se.values || []).map(function (v) { return +v || 0; });
      if (!vals.length) return;

      // Step path: for each i→i+1 transition, horizontal run to x(i+1) at y(i),
      // then vertical jump to y(i+1). Right-angle path makes the "when" of each change explicit.
      var d = "M" + xs(0).toFixed(1) + "," + ys(vals[0]).toFixed(1);
      for (var i = 1; i < vals.length; i++) {
        d += " L" + xs(i).toFixed(1) + "," + ys(vals[i - 1]).toFixed(1); // horizontal run
        d += " L" + xs(i).toFixed(1) + "," + ys(vals[i]).toFixed(1);     // vertical jump
      }

      // Area fill under the steps (single-series only — multi-series fills overlap awkwardly)
      if (cfg.area && series.length === 1) {
        var aD = d + " L" + xs(n - 1).toFixed(1) + "," + ys(minV).toFixed(1) +
                     " L" + xs(0).toFixed(1)      + "," + ys(minV).toFixed(1) + " Z";
        s.appendChild(S("path", { d: aD, fill: col, opacity: 0.13 }));
      }

      var path = S("path", { d: d, fill: "none", stroke: col, "stroke-width": 2.2,
        "stroke-linejoin": "round", "stroke-linecap": "round" });

      if (canAnim()) {
        // Step paths are ~2× longer in total than diagonals for the same x range
        var tLen = iw * 2;
        path.style.strokeDasharray = tLen;
        path.style.strokeDashoffset = tLen;
        (function (p_, si_) {
          setTimeout(function () {
            p_.style.transition = "stroke-dashoffset " + (animD(900) / 1000).toFixed(2) + "s ease";
            p_.style.strokeDashoffset = "0";
          }, animD(si_ * 180));
        })(path, si);
      }
      s.appendChild(path);

      vals.forEach(function (v, i) {
        var dot = S("circle", { cx: xs(i).toFixed(1), cy: ys(v).toFixed(1), r: 3,
          fill: col, stroke: PDC.cssvar("--panel-bg") || "#fff", "stroke-width": 1.5 });
        (function (v_, i_) {
          dot.addEventListener("mousemove", function (e) {
            PDC.showTip(e, "<b>" + (labels[i_] || i_) + "</b><br>" + (se.name || "Value") + ": " + fmtFn(v_));
          });
        })(v, i);
        dot.addEventListener("mouseout", PDC.hideTip);
        s.appendChild(dot);
      });
    });

    if (series.length > 1) {
      var lx = mL, ly = mT + ih + 26;
      series.forEach(function (se, si) {
        var col = se.color || P[si % P.length];
        s.appendChild(S("rect", { x: lx, y: ly - 5, width: 16, height: 3, rx: 1, fill: col }));
        s.appendChild(S("text", { class: "tick", x: lx + 20, y: ly }, se.name || ("Series " + (si + 1))));
        lx += 85;
      });
    }
  }


  /* ---------- violin plot — Gaussian KDE distribution per category ----------
     For each category (labelCol group), the full distribution of valueCol numbers
     is estimated with a Gaussian kernel and rendered as a symmetric filled silhouette:
     wider where data is denser, narrowing toward the tails. An optional inner IQR box
     + median line (showBox: true) gives quick quartile reference alongside the shape.

     Bandwidth selection: Silverman's rule of thumb  h = 0.9·σ·n^(-1/5), which is a
     robust automatic choice for unimodal distributions — good enough for dashboard
     purposes without requiring a manual bandwidth control.

     Complement to Box plot (shows outliers + exact quartiles), Beeswarm (raw points),
     and Histogram (single-variable binned counts) — violin adds density information.

     API: PDC.violin(el, {
       categories: [{name, values}],  // pre-grouped by studio-render.js
       showBox: bool,                  // IQR box + median line inside violin
       fmt, height
     }) */
  PDC.violin = function (el, cfg) { reg(el, function () { _violin(el, cfg); }); };
  function _violin(el, cfg) {
    var cats = cfg.categories || [], showBox = cfg.showBox !== false;
    var h = cfg.height || 300, fmtFn = cfg.fmt || PDC.fmt.abbr;
    if (!cats.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }

    var o = mkSVG(el, h), s = o.s, w = o.w;
    var mT = 14, mB = 30, mL = 44, mR = 12;
    var iw = w - mL - mR, ih = h - mT - mB;

    // Global value range across all categories (shared Y scale = comparable violins)
    var allVals = cats.reduce(function (a, c) { return a.concat(c.values); }, []);
    if (!allVals.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    var minV = Math.min.apply(null, allVals), maxV = Math.max.apply(null, allVals);
    if (maxV === minV) { maxV = minV + 1; }

    // Y scale: value → pixel (0 = chart top)
    var ys = function (v) { return mT + ih - ((v - minV) / (maxV - minV)) * ih; };

    // Horizontal grid lines + Y-axis tick labels
    for (var ti = 0; ti <= 4; ti++) {
      var tv = minV + (maxV - minV) * (ti / 4);
      var ty = ys(tv);
      s.appendChild(S("line", { x1: mL, y1: ty, x2: mL + iw, y2: ty,
        stroke: PDC.cssvar("--panel-border"), "stroke-width": 0.7,
        "stroke-dasharray": ti === 0 ? "none" : "3 3" }));
      s.appendChild(S("text", { class: "tick", x: mL - 3, y: ty + 3, "text-anchor": "end" }, fmtFn(tv)));
    }

    var n = cats.length;
    var cx = function (i) { return mL + (i + 0.5) * (iw / n); };
    // Violin half-width: narrower as more categories fill the space, capped at 35px
    var halfW = Math.min(iw / n / 2 - 6, 35);
    if (halfW < 4) halfW = 4;

    var P = PDC.palette();
    cats.forEach(function (cat, ci) {
      var x0 = cx(ci);
      var col = cat.color || P[ci % P.length];
      var vals = (cat.values || []).map(Number).filter(isFinite);
      if (!vals.length) return;

      // Build the KDE density curve (shared silvermanBw/kdeDensity helpers, also used
      // by ridgeline) and normalise so max density = halfW pixels
      var bw = silvermanBw(vals, minV, maxV);
      var density = kdeDensity(vals, bw, minV, maxV, 40);
      var maxD = 0; for (var k = 0; k < density.length; k++) if (density[k].d > maxD) maxD = density[k].d;
      if (maxD === 0) return;

      // Build symmetric violin path:
      //   Right side goes bottom → top (increasing y→py)
      //   Left side goes top → bottom
      //   Both sides are mirrored from the centre line x0
      var rightPts = [], leftPts = [];
      density.forEach(function (pt) {
        var py = ys(pt.x);
        var dw = (pt.d / maxD) * halfW;
        rightPts.push([x0 + dw, py]);
        leftPts.push([x0 - dw, py]);
      });

      // Trace right side top→bottom, then left side bottom→top (closing the shape)
      var d = "M" + rightPts[0][0].toFixed(1) + "," + rightPts[0][1].toFixed(1);
      for (var k = 1; k < rightPts.length; k++)
        d += " L" + rightPts[k][0].toFixed(1) + "," + rightPts[k][1].toFixed(1);
      for (var k = leftPts.length - 1; k >= 0; k--)
        d += " L" + leftPts[k][0].toFixed(1) + "," + leftPts[k][1].toFixed(1);
      d += " Z";

      s.appendChild(S("path", { d: d, fill: col, opacity: 0.22, stroke: col, "stroke-width": 1.2, "stroke-linejoin": "round" }));

      // Optional IQR box + median line inside the violin
      if (showBox && vals.length >= 3) {
        var sorted = vals.slice().sort(function (a, b) { return a - b; });
        var q1 = sorted[Math.floor(sorted.length * 0.25)];
        var q3 = sorted[Math.floor(sorted.length * 0.75)];
        var med = sorted[Math.floor(sorted.length * 0.5)];
        var boxHalfW = 4;
        // IQR box
        s.appendChild(S("rect", {
          x: (x0 - boxHalfW).toFixed(1), y: ys(q3).toFixed(1),
          width: (boxHalfW * 2).toFixed(1), height: Math.max(2, ys(q1) - ys(q3)).toFixed(1),
          fill: col, opacity: 0.7, rx: 1.5
        }));
        // Median line (white so it contrasts against both the box and the violin fill)
        s.appendChild(S("line", {
          x1: (x0 - boxHalfW * 1.8).toFixed(1), y1: ys(med).toFixed(1),
          x2: (x0 + boxHalfW * 1.8).toFixed(1), y2: ys(med).toFixed(1),
          stroke: PDC.cssvar("--panel-bg") || "#fff", "stroke-width": 2.2, "stroke-linecap": "round"
        }));
      }

      // Invisible hit box for hover tooltip
      var hitBox = S("rect", { x: (x0 - halfW - 3).toFixed(1), y: mT,
        width: ((halfW + 3) * 2).toFixed(1), height: ih, fill: "transparent" });
      var sorted2 = vals.slice().sort(function (a, b) { return a - b; });
      var med2 = sorted2[Math.floor(sorted2.length * 0.5)];
      var q1_2 = sorted2[Math.floor(sorted2.length * 0.25)];
      var q3_2 = sorted2[Math.floor(sorted2.length * 0.75)];
      var mn2 = sorted2[0], mx2 = sorted2[sorted2.length - 1];
      hitBox.addEventListener("mousemove", function (e) {
        PDC.showTip(e, "<b>" + cat.name + "</b><br>n=" + vals.length +
          " · median=" + fmtFn(med2) + "<br>Q1=" + fmtFn(q1_2) + " · Q3=" + fmtFn(q3_2) +
          "<br>min=" + fmtFn(mn2) + " · max=" + fmtFn(mx2));
      });
      hitBox.addEventListener("mouseout", PDC.hideTip);
      s.appendChild(hitBox);

      // Category label below the violin
      s.appendChild(S("text", { class: "tick", x: x0.toFixed(1), y: mT + ih + 15,
        "text-anchor": "middle" }, PDC.fmt.trunc(cat.name, 10)));
    });
  }

  /* ── Bump / ranking chart ────────────────────────────────────────────────────
     Shows how ranked positions change across periods (time, versions, quarters…).
     At each x position all series are ranked by their numeric value (rank 1 = highest);
     the chart draws lines connecting each series' rank across periods. Lines crossing
     each other indicate competitive overtaking — immediately visible at a glance.
     cfg: { labels, series [{name, values[]}], fmt, height }
     pdc-ui.js stays pristine; registered in studio-charts.js. */
  PDC.bump = function (el, cfg) { reg(el, function () { _bump(el, cfg); }); };
  function _bump(el, cfg) {
    var labels  = cfg.labels  || [];
    var series  = cfg.series  || [];
    var h       = cfg.height  || 300;
    var fmtFn   = cfg.fmt     || PDC.fmt.abbr;
    if (!labels.length || !series.length) {
      el.innerHTML = '<div class="empty">Bind a period column and at least two value series to preview the ranking chart.</div>';
      return;
    }

    var n  = labels.length;   // number of periods (x positions)
    var ns = series.length;   // number of series (entities being ranked)

    // For each period compute rank of every series by value (rank 1 = highest).
    // Ties share the same rank (dense ranking).
    var rankMatrix = series.map(function () { return new Array(n); });
    for (var xi = 0; xi < n; xi++) {
      var sorted = series.map(function (ser, si) {
        return { si: si, v: ser.values[xi] != null ? +ser.values[xi] : 0 };
      }).sort(function (a, b) { return b.v - a.v; }); // desc: highest value = rank 1
      var ri = 1;
      sorted.forEach(function (item, idx) {
        // dense ranking: same rank if same value
        if (idx > 0 && item.v < sorted[idx - 1].v) ri = idx + 1;
        rankMatrix[item.si][xi] = ri;
      });
    }

    // Layout margins: right side reserved for series labels
    var mT = 18, mB = 28, mL = 28, mR = 110;
    var r = mkSVG(el, h);
    var svg = r.s, w = r.w, ih = h - mT - mB;

    function xOf(xi) { return mL + (n <= 1 ? (w - mL - mR) / 2 : xi / (n - 1) * (w - mL - mR)); }
    function yOf(rank) { return mT + ((rank - 1) / (ns - 1 || 1)) * ih; }

    var palette = (PDC.palette || ['#005bb5','#7d3c98','#2e8bd0','#9b59b6','#00a39a','#e67e22','#c0392b','#16a085']);

    // Horizontal rank guide lines and left-side rank labels (#1 … #N)
    for (var ri = 1; ri <= ns; ri++) {
      var gy = yOf(ri);
      svg.appendChild(S("line", {
        x1: mL, y1: gy.toFixed(1), x2: (w - mR).toFixed(1), y2: gy.toFixed(1),
        stroke: "var(--panel-border,#e0e4ef)", "stroke-width": 1, "stroke-dasharray": "3 4"
      }));
      svg.appendChild(S("text", {
        class: "tick", x: (mL - 6).toFixed(1), y: (gy + 4).toFixed(1),
        "text-anchor": "end", "font-weight": "600"
      }, "#" + ri));
    }

    // Period labels on x-axis
    labels.forEach(function (lbl, xi) {
      svg.appendChild(S("text", {
        class: "tick", x: xOf(xi).toFixed(1), y: (h - 8).toFixed(1),
        "text-anchor": "middle"
      }, PDC.fmt.trunc(String(lbl), 9)));
    });

    // Per-series: line path + dots + right-side label + rank indicator
    series.forEach(function (ser, si) {
      var col   = palette[si % palette.length];
      var ranks = rankMatrix[si];
      var pts   = ranks.map(function (rank, xi) {
        return [xOf(xi), yOf(rank)];
      });

      // Smooth line connecting rank positions (cubic bezier through each point)
      if (pts.length >= 2) {
        var d = "M" + pts[0][0].toFixed(1) + "," + pts[0][1].toFixed(1);
        for (var k = 1; k < pts.length; k++) {
          // Use simple catmull-rom tension ≈ 0.35 for readable curves
          var cx = (pts[k - 1][0] + pts[k][0]) / 2;
          d += " C" + cx.toFixed(1) + "," + pts[k - 1][1].toFixed(1) +
               " " + cx.toFixed(1) + "," + pts[k][1].toFixed(1) +
               " " + pts[k][0].toFixed(1) + "," + pts[k][1].toFixed(1);
        }
        svg.appendChild(S("path", {
          d: d, fill: "none", stroke: col, "stroke-width": 2.8,
          "stroke-linecap": "round", "stroke-linejoin": "round"
        }));
      }

      // Dots + hover tooltips at each period point
      pts.forEach(function (pt, xi) {
        var dot = S("circle", {
          cx: pt[0].toFixed(1), cy: pt[1].toFixed(1), r: 5.5,
          fill: col, stroke: PDC.cssvar("--panel-bg") || "#fff", "stroke-width": 2
        });
        (function (xIdx) {
          dot.addEventListener("mousemove", function (e) {
            PDC.showTip(e,
              "<b>" + ser.name + "</b>" +
              "<br>Period: " + labels[xIdx] +
              "<br>Rank: <b>#" + ranks[xIdx] + "</b>" +
              "<br>Value: " + fmtFn(ser.values[xIdx]));
          });
        }(xi));
        dot.addEventListener("mouseout", PDC.hideTip);
        svg.appendChild(dot);

        // Rank number inside the dot for clarity (small, white) — Z8 slice 17:
        // optional, since it gets crowded with many entities/periods.
        if (cfg.showRankNumbers !== false) {
          svg.appendChild(S("text", {
            x: pt[0].toFixed(1), y: (pt[1] + 3.8).toFixed(1),
            "text-anchor": "middle", "font-size": "8",
            "font-weight": "700", fill: "#fff", "pointer-events": "none"
          }, String(ranks[xi])));
        }
      });

      // Series label + current rank at the right end
      if (pts.length) {
        var lastPt   = pts[pts.length - 1];
        var lastRank = ranks[ranks.length - 1];
        svg.appendChild(S("text", {
          x: ((w - mR) + 10).toFixed(1), y: (lastPt[1] - 2).toFixed(1),
          fill: col, "font-size": "10.5", "font-weight": "600",
          "dominant-baseline": "auto"
        }, PDC.fmt.trunc(ser.name, 16)));
        svg.appendChild(S("text", {
          x: ((w - mR) + 10).toFixed(1), y: (lastPt[1] + 10).toFixed(1),
          fill: col, "font-size": "9", opacity: "0.7"
        }, "#" + lastRank));
      }
    });

    // Animated entrance: series lines fade in sequentially if animation is enabled
    if (canAnim()) {
      var paths = svg.querySelectorAll("path");
      paths.forEach(function (path, i) {
        path.style.opacity = "0";
        path.style.transition = "opacity " + animD(0.4) + "s ease " + (i * animD(0.08)) + "s";
        setTimeout(function () { path.style.opacity = "1"; }, animD(30));
      });
    }
  }

  /* ---------- Marimekko / Mekko chart — proportional stacked bars ----------
     A two-dimensional chart where:
       • Column WIDTH  is proportional to each category's TOTAL value (larger categories
         get wider columns — you can immediately see which category dominates).
       • Column HEIGHT segments are proportional to the within-category composition
         (standard stacked bar share, reading top to bottom for each column).
     Together, width × height of any cell is proportional to its VALUE as a fraction
     of the grand total, making each rectangle's area directly encode relative size.
     Great for market share analysis, segment breakdowns, budget allocation — any case
     where you need both "how big is this bucket?" and "what's inside it?" at once.

     API: PDC.marimekko(el, {
       rows:    array of row arrays (from CDA / sampledata),
       cols:    array of column-name strings,
       catCol:  string — column name for x-axis categories (drives column width)
       grpCol:  string — column name for stack segments (drives segment heights)
       valCol:  string — column name for the numeric value
       showPct: bool   — overlay "XX%" labels on segments wide/tall enough to fit
       fmt:     PDC.fmt variant
       height:  px
     })
  */
  PDC.marimekko = function (el, cfg) { reg(el, function () { _marimekko(el, cfg); }); };
  function _marimekko(el, cfg) {
    var rows    = cfg.rows || [], cols = cfg.cols || [];
    var catIdx  = cols.indexOf(cfg.catCol),  grpIdx  = cols.indexOf(cfg.grpCol);
    var valIdx  = cols.indexOf(cfg.valCol);
    var fmtFn   = PDC.fmt[cfg.fmt || "abbr"] || PDC.fmt.abbr;
    var height  = cfg.height || 320;
    var palette = PDC.palette || ["#005bb5","#7d3c98","#2e8bd0","#00a39a","#e67e22","#27ae60","#c0392b","#d4ac0d"];
    var showPct = cfg.showPct !== false;
    var isDark  = document.documentElement.classList.contains("dark") ||
                  document.body.classList.contains("dark") ||
                  (PDC.cssvar("--panel-bg") || "#fff").trim().toLowerCase() < "#888";
    var textCol = isDark ? "rgba(255,255,255,0.82)" : "#2a3650";
    var mutedCol = isDark ? "rgba(255,255,255,0.45)" : "#7a8aaa";
    var borderCol = isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.6)";

    // ---- 1. Aggregate data into a 2-D map: catMap[cat][grp] = total value
    var catMap = {}, catOrder = [], grpOrder = [], grpSet = {};
    rows.forEach(function (r) {
      var cat = catIdx >= 0 ? String(r[catIdx] || "—") : "—";
      var grp = grpIdx >= 0 ? String(r[grpIdx] || "—") : "—";
      var val = valIdx >= 0 ? (+r[valIdx] || 0) : 0;
      if (!catMap[cat]) { catMap[cat] = {}; catOrder.push(cat); }
      catMap[cat][grp] = (catMap[cat][grp] || 0) + val;
      if (!grpSet[grp]) { grpSet[grp] = 1; grpOrder.push(grp); }
    });

    if (!catOrder.length) {
      el.innerHTML = '<div class="empty">No data — bind Category, Segment, and Value columns</div>';
      return;
    }

    // ---- 2. Totals
    var catTotals = {}, grandTotal = 0;
    catOrder.forEach(function (cat) {
      var t = 0;
      grpOrder.forEach(function (g) { t += (catMap[cat][g] || 0); });
      catTotals[cat] = t;
      grandTotal += t;
    });
    if (!grandTotal) { el.innerHTML = '<div class="empty">All values are zero</div>'; return; }

    // ---- 3. Layout constants
    var w = el.offsetWidth || 480;
    var h = height;
    var mL = 6, mR = 6, mT = 10, mB = 30, gap = 3;
    var plotW = w - mL - mR;
    var plotH = h - mT - mB;

    // ---- 4. Compute x positions (proportional to catTotal / grandTotal)
    var colLayout = []; // [{cat, x0, w}]
    var usedGap = gap * (catOrder.length - 1);
    var xCursor = mL;
    catOrder.forEach(function (cat, ci) {
      var colW = Math.max(2, Math.round((catTotals[cat] / grandTotal) * (plotW - usedGap)));
      colLayout.push({ cat: cat, x0: xCursor, w: colW });
      xCursor += colW + gap;
    });

    // ---- 5. Build SVG (uses the module-level S = PDC.S alias; its 3rd "kids" arg
    // accepts a plain string, which behaves identically to setting textContent on a
    // freshly created element with no other children — no local reimplementation needed)
    var svg = S("svg", { width: w, height: h, viewBox: "0 0 " + w + " " + h });
    svg.style.display = "block";
    svg.style.fontFamily = "inherit";
    svg.style.fontSize   = "10px";
    svg.style.fill       = textCol;

    // ---- 6. Draw columns
    colLayout.forEach(function (col, ci) {
      var catTotal = catTotals[col.cat];
      var yCursor = mT;

      grpOrder.forEach(function (grp, gi) {
        var val  = catMap[col.cat][grp] || 0;
        var frac = catTotal ? val / catTotal : 0;
        var segH = Math.round(frac * plotH);
        if (!segH) return;

        var fillCol = palette[gi % palette.length];
        var rect = S("rect", {
          x: col.x0, y: yCursor, width: col.w, height: segH,
          fill: fillCol, rx: 1
        });
        // White 0.6-opacity separator line between segments for readability
        if (yCursor > mT) {
          svg.appendChild(S("line", {
            x1: col.x0, y1: yCursor, x2: col.x0 + col.w, y2: yCursor,
            stroke: borderCol, "stroke-width": 1
          }));
        }

        // Hover tooltip: segment name · value · % of column · % of total
        var pctOfCol  = Math.round(frac * 100);
        var pctOfTotal = grandTotal ? Math.round(val / grandTotal * 100) : 0;
        rect.addEventListener("mousemove", (function (cat, grp, val, pctC, pctT) {
          return function (e) {
            PDC.showTip(e,
              "<b>" + grp + "</b>" +
              "<br>Category: " + cat +
              "<br>Value: "   + fmtFn(val) +
              "<br>Share of " + cat + ": <b>" + pctC + "%</b>" +
              "<br>Share of total: " + pctT + "%");
          };
        }(col.cat, grp, val, pctOfCol, pctOfTotal)));
        rect.addEventListener("mouseout", PDC.hideTip);
        svg.appendChild(rect);

        // % label inside the cell when there is room (≥ 18px tall, ≥ 22px wide)
        if (showPct && segH >= 18 && col.w >= 22) {
          var lbl = S("text", {
            x: (col.x0 + col.w / 2).toFixed(1),
            y: (yCursor + segH / 2 + 4).toFixed(1),
            "text-anchor": "middle",
            "font-size": "10",
            "font-weight": "600",
            fill: "#fff",
            "pointer-events": "none"
          }, pctOfCol + "%");
          svg.appendChild(lbl);
        }

        yCursor += segH;
      });

      // Category label below the column (truncated to fit column width)
      var maxChars = Math.max(2, Math.floor(col.w / 5.5));
      var catLbl   = PDC.fmt.trunc(col.cat, maxChars);
      svg.appendChild(S("text", {
        x: (col.x0 + col.w / 2).toFixed(1),
        y: (h - 14).toFixed(1),
        "text-anchor": "middle",
        "font-size": "9.5",
        fill: mutedCol
      }, catLbl));

      // Column width % label below the category label (shows relative category size)
      var widthPct = Math.round(catTotals[col.cat] / grandTotal * 100);
      svg.appendChild(S("text", {
        x: (col.x0 + col.w / 2).toFixed(1),
        y: (h - 3).toFixed(1),
        "text-anchor": "middle",
        "font-size": "8.5",
        fill: mutedCol,
        opacity: "0.72"
      }, widthPct + "% of total"));
    });

    // ---- 7. Compact legend (group names + color swatches) — centered below chart top
    // We use a top-positioned micro legend to leave x-axis labels unobstructed.
    var legX = mL, legY = 2, legGap = 0;
    grpOrder.forEach(function (grp, gi) {
      if (legX > w - 60) return; // skip overflow items
      var col = palette[gi % palette.length];
      svg.appendChild(S("rect", { x: legX, y: legY, width: 8, height: 8, rx: 2, fill: col }));
      var lbl = S("text", {
        x: legX + 10, y: legY + 7.5,
        "font-size": "8.5", fill: mutedCol
      }, PDC.fmt.trunc(grp, 14));
      svg.appendChild(lbl);
      legX += 12 + (PDC.fmt.trunc(grp, 14).length * 5.2) + 6;
    });

    // ---- 8. Animated entrance: columns fade in left-to-right
    if (canAnim()) {
      var rects = svg.querySelectorAll("rect");
      rects.forEach(function (r, i) {
        r.style.opacity = "0";
        r.style.transition = "opacity " + animD(0.35) + "s ease " + (i * animD(0.015)) + "s";
        setTimeout(function () { r.style.opacity = "1"; }, animD(20));
      });
    }

    el.innerHTML = "";
    el.appendChild(svg);
  }

  /* ---------- dumbbell chart (connected dot chart / gap chart) ----------
     Shows two values per row (start and end) as dots connected by a horizontal
     line. The connector is green when end > start (improvement) and red when
     end < start (decline). Ideal for before/after, budget vs. actual, planned
     vs. achieved comparisons — the gap is immediately readable.

     Gray dot = start value (baseline / before)
     Filled brand-color dot = end value (current / after)

     API: PDC.dumbbell(el, {
       items:      [{label, start, end}],
       startLabel: string (axis header, default "Before"),
       endLabel:   string (axis header, default "After"),
       fmt:        PDC.fmt variant,
       height:     px
     }) */
  PDC.dumbbell = function (el, cfg) { reg(el, function () { _dumbbell(el, cfg); }); };
  function _dumbbell(el, cfg) {
    var items = cfg.items || [], h = cfg.height || 280;
    if (!items.length) {
      el.innerHTML = '<div class="empty">No data — bind Label, Start, and End columns</div>';
      return;
    }
    var startLabel = cfg.startLabel || "Before";
    var endLabel   = cfg.endLabel   || "After";
    var fmtFn = cfg.fmt || PDC.fmt.abbr;

    // ---- 1. Value range (union of start and end values)
    var allVals = items.reduce(function (a, d) { return a.concat([+d.start || 0, +d.end || 0]); }, []);
    var minV = Math.min.apply(null, allVals.concat([0]));
    var maxV = niceMax(Math.max.apply(null, allVals.concat([1])));
    var floor = minV < 0 ? minV - (maxV - minV) * 0.08 : 0;
    var range = maxV - floor || 1;

    var o = mkSVG(el, h), s = o.s, w = o.w;
    var mL = 118, mR = 14, mT = 22, mB = 8;
    var ih = h - mT - mB;
    var n = items.length;
    var rowH = ih / n;
    var dotR = Math.max(4, Math.min(7, rowH * 0.38));

    // convert a value to an x pixel position within the plot area
    function xOf(v) {
      return mL + (w - mL - mR) * Math.max(0, Math.min(1, ((+v || 0) - floor) / range));
    }

    // ---- 2. Axis legend: start label (left) and end label (right) above the rows
    s.appendChild(S("text", { class: "tick", x: mL + 2, y: mT - 6,
      "text-anchor": "start", "font-size": 9, "font-weight": "600" }, startLabel));
    s.appendChild(S("text", { class: "tick", x: w - mR - 2, y: mT - 6,
      "text-anchor": "end", "font-size": 9, "font-weight": "600" }, endLabel));

    // ---- 3. Subtle vertical grid lines across the plot area
    for (var g = 0; g <= 4; g++) {
      var gx = mL + (w - mL - mR) * g / 4;
      s.appendChild(S("line", { class: "gridline", x1: gx, y1: mT, x2: gx, y2: mT + ih }));
    }

    // ---- 4. One row per item
    items.forEach(function (d, i) {
      var midY = mT + i * rowH + rowH / 2;
      var xs = xOf(d.start), xe = xOf(d.end);
      var delta = (+d.end || 0) - (+d.start || 0);
      var lineCol = delta > 0.001  ? (PDC.cssvar("--good") || "#27ae60") :
                    delta < -0.001 ? (PDC.cssvar("--bad")  || "#e0395e") :
                                     "var(--muted,#8899aa)";

      var tipHtml = "<b>" + d.label + "</b>" +
        "<br>" + startLabel + ": " + fmtFn(d.start) +
        "<br>" + endLabel + ": " + fmtFn(d.end) +
        "<br>Delta: " + (delta >= 0 ? "+" : "") + fmtFn(delta);

      // horizontal connector line between the two dots
      var line = S("line", { x1: xs, y1: midY, x2: xe, y2: midY,
        stroke: lineCol, "stroke-width": 2.5, opacity: 0.72,
        "stroke-linecap": "round" });
      _tip(line, tipHtml);
      s.appendChild(line);

      // start dot: muted gray — the baseline / "before"
      var sd = S("circle", { cx: xs, cy: midY, r: dotR,
        fill: "var(--muted-dot,#b0bec5)",
        stroke: "var(--panel-bg,#fff)", "stroke-width": 1.5 });
      _tip(sd, tipHtml);
      s.appendChild(sd);

      // end dot: brand color — the current / "after" value (the story)
      var endCol = PDC.cssvar("--pentaho") || "#005bb5";
      var ed = S("circle", { cx: xe, cy: midY, r: dotR + 0.5,
        fill: endCol,
        stroke: "var(--panel-bg,#fff)", "stroke-width": 1.5 });
      _tip(ed, tipHtml);
      s.appendChild(ed);

      // row label (left side, right-aligned into the margin)
      s.appendChild(S("text", { class: "tick", x: mL - 8, y: midY + 4, "text-anchor": "end" },
        PDC.fmt.trunc(d.label, 18)));

      // compact value labels adjacent to each dot (avoids overlap with the row label)
      if (rowH >= 12) {
        var sTextX = xs + (xs <= xe ? -(dotR + 4) : (dotR + 4));
        var sAnch  = xs <= xe ? "end" : "start";
        var eTextX = xe + (xe >= xs ? (dotR + 4) : -(dotR + 4));
        var eAnch  = xe >= xs ? "start" : "end";
        s.appendChild(S("text", { class: "val-label", x: sTextX, y: midY + 4,
          "text-anchor": sAnch, "font-size": 9 }, fmtFn(d.start)));
        s.appendChild(S("text", { class: "val-label", x: eTextX, y: midY + 4,
          "text-anchor": eAnch, "font-size": 9, "font-weight": "600" }, fmtFn(d.end)));
      }

      // animated entrance: line grows, then dots fade in
      if (canAnim()) {
        var dur = animD(0.3);
        var del = animD(20 + i * 38);
        line.style.opacity = 0;
        sd.style.opacity   = 0;
        ed.style.opacity   = 0;
        (function (l_, sd_, ed_) {
          setTimeout(function () {
            l_.style.transition  = "opacity " + dur + "s ease";
            l_.style.opacity     = "0.72";
            sd_.style.transition = "opacity " + dur + "s ease";
            sd_.style.opacity    = "1";
            ed_.style.transition = "opacity " + dur + "s ease";
            ed_.style.opacity    = "1";
          }, del);
        })(line, sd, ed);
      }
    });
  }

  // ── PDC.packedBubble ──────────────────────────────────────────────────────
  // Packed bubble cluster chart — circle AREA proportional to value.
  // Each data item becomes one bubble. Bubbles are packed using a lightweight
  // iterative force-directed simulation: every bubble is attracted toward the
  // container centre and repelled from overlapping neighbours until they settle
  // in a compact, non-overlapping cluster. The simulation is deterministic (no
  // Math.random), runs in ~50 iterations, and is fast enough to finish before
  // the browser paints.
  //
  // opts: { items:[{label,value}], fmt?, height?, showLabels? }
  PDC.packedBubble = function (body, opts) {
    opts = opts || {};
    var items      = (opts.items || []).slice(0, 60); // cap at 60 bubbles for perf
    var h          = opts.height || 320;
    var showLbls   = opts.showLabels !== false;
    var fmtFn      = opts.fmt ? opts.fmt : function (v) { return String(v); };

    body.innerHTML = "";
    if (!items.length) { body.innerHTML = '<div class="empty">No data</div>'; return; }

    // ---- 1. compute display widths from container (fallback 380)
    var w = body.offsetWidth || 380;

    // ---- 2. scale radii so area ∝ value (radius ∝ √value)
    var maxVal = 0;
    items.forEach(function (d) { if (d.value > maxVal) maxVal = d.value; });
    if (!maxVal) { body.innerHTML = '<div class="empty">All values are zero</div>'; return; }

    // Target max bubble radius: roughly w/5 capped at h/3.5, min 10
    var maxR = Math.max(10, Math.min(w / 5, h / 3.5));
    var minR = Math.max(4, maxR * 0.18);
    items = items.map(function (d, i) {
      var r = minR + (maxR - minR) * Math.sqrt(d.value / maxVal);
      return { label: d.label, value: d.value, r: r,
               x: w / 2, y: h / 2, color: PDC.color(i) };
    });

    // ---- 3. force-directed packing simulation
    var cx = w / 2, cy = h / 2;
    var ITERS = 60, GRAVITY = 0.035, REPEL = 1.05;

    for (var it = 0; it < ITERS; it++) {
      var progress = it / ITERS; // 0 → 1 as simulation converges
      var gravity  = GRAVITY * (1 + progress); // strengthen gravity over time

      // gravity: every bubble moves toward centre
      items.forEach(function (d) {
        d.x += (cx - d.x) * gravity;
        d.y += (cy - d.y) * gravity;
      });

      // repulsion: push overlapping pairs apart
      for (var i = 0; i < items.length - 1; i++) {
        for (var j = i + 1; j < items.length; j++) {
          var a = items[i], b = items[j];
          var dx = b.x - a.x, dy = b.y - a.y;
          var dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          var minDist = (a.r + b.r) * REPEL;
          if (dist < minDist) {
            // push apart proportionally to overlap depth
            var overlap = (minDist - dist) / dist * 0.5;
            a.x -= dx * overlap; a.y -= dy * overlap;
            b.x += dx * overlap; b.y += dy * overlap;
          }
        }
      }

      // boundary clamp: keep bubbles inside the SVG with a small margin
      items.forEach(function (d) {
        d.x = Math.max(d.r, Math.min(w - d.r, d.x));
        d.y = Math.max(d.r, Math.min(h - d.r, d.y));
      });
    }

    // ---- 4. build the SVG
    var S = function (tag, attrs, text) {
      var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
      if (attrs) Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
      if (text != null) el.textContent = text;
      return el;
    };
    var svg = S("svg", {
      viewBox: "0 0 " + w + " " + h,
      width: "100%", height: h,
      "font-family": "inherit"
    });

    items.forEach(function (d) {
      var tipHtml = "<b>" + d.label + "</b><br>" + fmtFn(d.value);

      var g = S("g");

      // filled circle
      var circle = S("circle", { cx: d.x, cy: d.y, r: d.r, fill: d.color, opacity: "0.82" });
      _tip(circle, tipHtml);
      g.appendChild(circle);

      // subtle white border
      var border = S("circle", { cx: d.x, cy: d.y, r: d.r,
        fill: "none", stroke: "rgba(255,255,255,0.35)", "stroke-width": 1.5 });
      g.appendChild(border);

      if (showLbls && d.r >= 16) {
        // label (category name, truncated to fit)
        var maxChars = Math.max(2, Math.floor(d.r * 0.38));
        var txt = PDC.fmt.trunc(d.label, maxChars);
        var lbl = S("text", { x: d.x, y: d.y - (d.r >= 24 ? 4 : 2),
          "text-anchor": "middle", "dominant-baseline": "middle",
          fill: "#fff", "font-size": Math.max(9, Math.min(13, d.r * 0.42)),
          "font-weight": "600", "pointer-events": "none" }, txt);
        g.appendChild(lbl);

        // value label below (only if the bubble is large enough)
        if (d.r >= 24) {
          var valLbl = S("text", { x: d.x, y: d.y + d.r * 0.38,
            "text-anchor": "middle", fill: "rgba(255,255,255,0.82)",
            "font-size": Math.max(8, Math.min(11, d.r * 0.3)),
            "pointer-events": "none" }, fmtFn(d.value));
          g.appendChild(valLbl);
        }
      }

      // animated entrance: circles fade + scale in staggered
      if (canAnim()) {
        var idx = items.indexOf(d);
        var dur = animD(0.35);
        var del = animD(40 + idx * 28);
        g.style.opacity = 0;
        g.style.transform = "scale(0.4)";
        g.style.transformOrigin = d.x + "px " + d.y + "px";
        (function (g_) {
          setTimeout(function () {
            g_.style.transition = "opacity " + dur + "s ease, transform " + dur + "s cubic-bezier(.22,1,.36,1)";
            g_.style.opacity    = "1";
            g_.style.transform  = "scale(1)";
          }, del);
        })(g);
      }

      svg.appendChild(g);
    });

    body.appendChild(svg);

    // register for redraws on theme-change and window resize
    var _body = body;
    PDC._reg.push(function () {
      if (!_body.isConnected) return;
      PDC.packedBubble(_body, opts);
    });
  };

  // ── PDC.wordCloud ─────────────────────────────────────────────────────────
  // Word cloud chart: each data item is a text label whose font size is
  // proportional to its numeric value (log scale, so very large values don't
  // crowd out everything else). Words are placed from the centre outward along
  // an Archimedean spiral, advancing until a non-overlapping position is found.
  // Bounding boxes are estimated (font-size × character-count × 0.58 wide,
  // font-size × 1.2 tall) — close enough for practical word-cloud layouts and
  // avoids the need for a DOM layout pass before placement is committed.
  //
  // opts: { items:[{label,value}], fmt?, height?, maxWords? }
  PDC.wordCloud = function (body, opts) {
    opts = opts || {};
    var cap      = Math.max(1, opts.maxWords || 60);
    var allItems = (opts.items || []).slice(0, cap);
    var h        = opts.height || 320;
    var fmtFn    = opts.fmt ? opts.fmt : function (v) { return String(v); };

    body.innerHTML = "";
    if (!allItems.length) { body.innerHTML = '<div class="empty">No data</div>'; return; }

    var w    = body.offsetWidth || 400;
    var cx   = w / 2, cy = h / 2;

    // ---- 1. compute font sizes via log scale (min 10px, max 52px)
    var maxVal = 0, minVal = Infinity;
    allItems.forEach(function (d) {
      if (d.value > maxVal) maxVal = d.value;
      if (d.value < minVal) minVal = d.value;
    });
    var logMax = Math.log(maxVal + 1), logMin = Math.log(minVal + 1);
    var FS_MIN = 11, FS_MAX = 52;
    function fontSize(v) {
      var t = (logMax === logMin) ? 0.5 : (Math.log(v + 1) - logMin) / (logMax - logMin);
      return Math.round(FS_MIN + t * (FS_MAX - FS_MIN));
    }

    // ---- 2. spiral placement with overlap detection
    // bboxes is an array of {x,y,w,h} rectangles already placed on the canvas.
    var bboxes = [];
    function overlaps(box) {
      for (var i = 0; i < bboxes.length; i++) {
        var b = bboxes[i];
        if (box.x < b.x + b.w && box.x + box.w > b.x &&
            box.y < b.y + b.h && box.y + box.h > b.y) return true;
      }
      return false;
    }
    function inBounds(box) {
      return box.x >= 2 && box.y >= 2 &&
             box.x + box.w <= w - 2 && box.y + box.h <= h - 2;
    }

    var placed = []; // [{label,value,x,y,fs,color}]
    allItems.forEach(function (d, i) {
      var fs   = fontSize(d.value);
      var estW = d.label.length * fs * 0.58 + 6; // rough text width
      var estH = fs * 1.25;                       // rough line height
      var color = PDC.color(i);

      // Archimedean spiral: r = b × θ, so radius grows as angle increases.
      // step_r controls how quickly we spiral outward per full turn.
      var STEP   = 0.25; // radians per step
      var step_r = Math.max(estH, 8) * 0.35;
      var angle  = 0;
      var ok     = false;

      while (angle < 100 * Math.PI) {
        var r = step_r * angle / (2 * Math.PI);
        var x = cx + r * Math.cos(angle) - estW / 2;
        var y = cy + r * Math.sin(angle) - estH / 2;
        var box = { x: x, y: y, w: estW, h: estH };
        if (inBounds(box) && !overlaps(box)) {
          bboxes.push(box);
          placed.push({ label: d.label, value: d.value,
                        x: x + estW / 2, y: y + estH / 2 + fs * 0.35,
                        fs: fs, color: color });
          ok = true;
          break;
        }
        angle += STEP;
      }
      // if placement failed (very crowded canvas) we skip the word silently
    });

    if (!placed.length) { body.innerHTML = '<div class="empty">No words fit — try a smaller max or taller height</div>'; return; }

    // ---- 3. build SVG
    var S = function (tag, attrs, text) {
      var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
      if (attrs) Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
      if (text != null) el.textContent = text;
      return el;
    };
    var svg = S("svg", {
      viewBox: "0 0 " + w + " " + h,
      width: "100%", height: h,
      "font-family": "inherit",
      "aria-label": "Word cloud"
    });

    placed.forEach(function (d, idx) {
      var tipHtml = "<b>" + d.label + "</b><br>" + fmtFn(d.value);
      var txt = S("text", {
        x: d.x, y: d.y,
        "text-anchor": "middle",
        fill: d.color,
        "font-size": d.fs,
        "font-weight": d.fs >= 28 ? "700" : d.fs >= 18 ? "600" : "400",
        "cursor": "default"
      }, d.label);
      _tip(txt, tipHtml);

      // staggered fade-in entrance
      if (canAnim()) {
        var dur = animD(0.3);
        var del = animD(idx * 22);
        txt.style.opacity = "0";
        (function (t) {
          setTimeout(function () {
            t.style.transition = "opacity " + dur + "s ease";
            t.style.opacity    = "1";
          }, del);
        })(txt);
      }

      svg.appendChild(txt);
    });

    body.appendChild(svg);

    // redraw on theme change / window resize
    var _body = body;
    PDC._reg.push(function () {
      if (!_body.isConnected) return;
      PDC.wordCloud(_body, opts);
    });
  };

  // ── PDC.gantt ─────────────────────────────────────────────────────────────
  // Gantt / Timeline chart — horizontal floating bars where each row has an
  // explicit start and end value. Perfect for project timelines, sprint plans,
  // process-stage durations, or any "start to end" data.
  //
  // opts: {
  //   rows:       [{label, start, end}]  — one entry per task/phase
  //   startLabel: string   — axis header for the start value (default "Start")
  //   endLabel:   string   — axis header for the end value   (default "End")
  //   fmt:        function — value formatter for tooltips + axis labels
  //   height:     number   — SVG height in px
  // }
  PDC.gantt = function (body, opts) {
    body.innerHTML = "";
    var rows    = (opts.rows || []).filter(function (r) { return r.end > r.start || r.end >= r.start; });
    var fmtFn   = opts.fmt   || function (v) { return String(v); };
    var sLabel  = opts.startLabel || "Start";
    var eLabel  = opts.endLabel   || "End";
    var h       = opts.height || 300;

    if (!rows.length) { body.innerHTML = '<div class="empty">No data — bind a label, start, and end column</div>'; return; }

    // ── 1. Compute x-scale ──────────────────────────────────────────────────
    var allVals = [];
    rows.forEach(function (r) { allVals.push(r.start, r.end); });
    var minV = Math.min.apply(null, allVals);
    var maxV = Math.max.apply(null, allVals);
    // Guard against degenerate zero-range
    if (minV === maxV) { maxV = minV + 1; }
    var range = maxV - minV;

    // ── 2. Layout constants ──────────────────────────────────────────────────
    var LABEL_W  = 110; // px reserved for the row label on the left
    var PAD_R    = 12;  // right padding
    var BAR_H    = 16;  // bar rectangle height
    var ROW_H    = Math.max(BAR_H + 10, Math.round(h / Math.max(rows.length, 1)));
    ROW_H = Math.min(ROW_H, 40); // cap row height so a single-item chart isn't absurd
    var HEADER_H = 26; // space above rows for axis labels
    var svgH     = HEADER_H + rows.length * ROW_H + 4;
    var svgW     = 480; // logical units (viewBox); actual width = 100%

    // Map a data value → x coordinate within the chart area
    function xPos(v) {
      return LABEL_W + ((v - minV) / range) * (svgW - LABEL_W - PAD_R);
    }

    // ── 3. Build SVG (S is the module-level S = PDC.S alias — no local reimplementation) ──
    function txt(str, attrs) { var t = S("text", attrs); t.textContent = str; return t; }

    var svg = S("svg", {
      viewBox: "0 0 " + svgW + " " + svgH,
      width: "100%", height: svgH,
      "font-family": "inherit",
      "aria-label": "Gantt chart"
    });

    // Background grid lines at min and max
    var gridX1 = xPos(minV), gridX2 = xPos(maxV);
    svg.appendChild(S("line", {
      x1: gridX1, y1: HEADER_H - 4, x2: gridX1, y2: svgH - 4,
      stroke: "rgba(0,0,0,.12)", "stroke-width": ".8", "stroke-dasharray": "3 3"
    }));
    svg.appendChild(S("line", {
      x1: gridX2, y1: HEADER_H - 4, x2: gridX2, y2: svgH - 4,
      stroke: "rgba(0,0,0,.12)", "stroke-width": ".8", "stroke-dasharray": "3 3"
    }));

    // Axis header labels
    svg.appendChild(txt(sLabel, {
      x: gridX1, y: HEADER_H - 8,
      "text-anchor": "middle", fill: "var(--pdc-muted,#7a8299)", "font-size": "9"
    }));
    svg.appendChild(txt(eLabel, {
      x: gridX2, y: HEADER_H - 8,
      "text-anchor": "middle", fill: "var(--pdc-muted,#7a8299)", "font-size": "9"
    }));

    rows.forEach(function (row, i) {
      var cy   = HEADER_H + i * ROW_H + ROW_H / 2;
      var barY = cy - BAR_H / 2;
      var x1   = xPos(row.start);
      var x2   = xPos(row.end);
      var barW = Math.max(x2 - x1, 2);
      var clr  = PDC.color(i);

      // Row label
      var labelEl = txt(row.label, {
        x: LABEL_W - 6, y: cy + 4,
        "text-anchor": "end", fill: "var(--fg,#222)",
        "font-size": "10", "class": "pdc-gantt-label"
      });
      svg.appendChild(labelEl);

      // Bar
      var bar = S("rect", {
        x: x1, y: barY, width: barW, height: BAR_H, rx: "3",
        fill: clr, opacity: ".88", "cursor": "default"
      });

      // Tooltip
      var tipHtml = "<b>" + row.label + "</b><br>" +
        sLabel + ": " + fmtFn(row.start) + " &nbsp; " +
        eLabel + ": " + fmtFn(row.end)   + "<br>" +
        "Duration: " + fmtFn(row.end - row.start);
      _tip(bar, tipHtml);
      svg.appendChild(bar);

      // Value label inside bar if it fits (end value)
      if (barW > 30) {
        var valLbl = txt(fmtFn(row.end), {
          x: x2 - 4, y: cy + 4,
          "text-anchor": "end",
          fill: "#fff", "font-size": "8", "font-weight": "600",
          "pointer-events": "none"
        });
        svg.appendChild(valLbl);
      }

      // Animated entrance: bars fade in staggered per row (opacity works reliably on SVG elements)
      if (canAnim()) {
        var dur = animD(0.4);
        var del = animD(i * 40);
        bar.style.opacity = "0";
        (function (el) {
          setTimeout(function () {
            el.style.transition = "opacity " + dur + "s ease";
            el.style.opacity    = "1";
          }, del);
        })(bar);
      }
    });

    body.appendChild(svg);

    // Redraw on theme change / window resize
    var _body = body;
    PDC._reg.push(function () {
      if (!_body.isConnected) return;
      PDC.gantt(_body, opts);
    });
  };

  /* ── Diverging bar chart ─────────────────────────────────────────────────────
     Horizontal bars centred on a zero baseline: positive values extend right
     (brand color), negative values extend left (accent red). Ideal for
     budget variance, QoQ growth, sentiment scores, or any mixed +/- dataset
     where direction matters as much as magnitude.

     opts: {
       rows:     [{ label: string, value: number }]  — one row per bar
       posColor: CSS color for positive bars          (default: --pentaho)
       negColor: CSS color for negative bars          (default: --pdc-bad / #c0392b)
       fmt:      format id or function
       height:   SVG height px
     }
  */
  PDC.divergingBar = function (body, opts) {
    opts = opts || {};
    var rows = opts.rows || [];
    if (!rows.length) { body.innerHTML = '<div class="empty">No data</div>'; return; }

    var fmtFn   = typeof opts.fmt === "function" ? opts.fmt : PDC.fmt(opts.fmt || "abbr");
    var posClr  = PDC.cssvar(opts.posColor || "--pentaho") || "#005bb5";
    var negClr  = PDC.cssvar(opts.negColor || "--pdc-bad") || "#c0392b";
    var height  = opts.height || 300;

    var svgW  = W(body);
    var ROW_H = Math.max(16, Math.min(28, Math.floor((height - 24) / rows.length)));
    var BAR_H = Math.max(6, ROW_H - 6);
    var PAD_T = 14; // top padding for axis tick labels
    var svgH  = PAD_T + rows.length * ROW_H + 8;

    // Layout: fixed label column on the left, symmetric chart area in the centre
    var LABEL_W = Math.min(svgW * 0.32, 120);
    var RIGHT_M = 8;
    var CHART_W = svgW - LABEL_W - RIGHT_M;
    var ZERO_X  = LABEL_W + CHART_W / 2;
    var HALF_W  = CHART_W / 2 - 2;

    var maxAbs = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.value); })) || 1;
    function xLen(v) { return (Math.abs(v) / maxAbs) * HALF_W; }

    // S is the module-level S = PDC.S alias — no local reimplementation needed
    function T(str, a) { var t = S("text", a); t.textContent = str; return t; }

    var svg = S("svg", {
      viewBox: "0 0 " + svgW + " " + svgH,
      width: "100%", height: svgH,
      "font-family": "inherit",
      "aria-label": "Diverging bar chart"
    });

    // Subtle axis tick labels (positive side right, negative side left)
    svg.appendChild(T("+", {
      x: ZERO_X + HALF_W / 2, y: PAD_T - 3,
      "text-anchor": "middle", fill: "var(--pdc-muted,#7a8299)", "font-size": "8"
    }));
    svg.appendChild(T("−", {
      x: ZERO_X - HALF_W / 2, y: PAD_T - 3,
      "text-anchor": "middle", fill: "var(--pdc-muted,#7a8299)", "font-size": "8"
    }));

    // Zero baseline — thin dashed vertical line
    svg.appendChild(S("line", {
      x1: ZERO_X, y1: PAD_T - 6, x2: ZERO_X, y2: svgH - 4,
      stroke: "rgba(0,0,0,.18)", "stroke-width": "1", "stroke-dasharray": "3 2"
    }));

    rows.forEach(function (row, i) {
      var cy   = PAD_T + i * ROW_H + ROW_H / 2;
      var barY = cy - BAR_H / 2;
      var bLen = Math.max(2, xLen(row.value));
      var isPos = row.value >= 0;
      var clr  = isPos ? posClr : negClr;
      var barX = isPos ? ZERO_X : ZERO_X - bLen;

      // Row label (right-aligned in the label column)
      var maxLabelW = LABEL_W - 8;
      var lbl = T(row.label, {
        x: LABEL_W - 6, y: cy + 4,
        "text-anchor": "end", fill: "var(--fg,#222)",
        "font-size": "10", "class": "pdc-divbar-label"
      });
      // Clip very long labels to avoid overflow into the chart area
      lbl.style.cssText = "overflow:hidden;text-overflow:ellipsis;max-width:" + maxLabelW + "px";
      svg.appendChild(lbl);

      // Bar rectangle
      var bar = S("rect", {
        x: barX, y: barY,
        width: bLen, height: BAR_H,
        rx: "3", fill: clr, opacity: ".85",
        "cursor": "default", "class": "pdc-divbar-bar"
      });

      // Hover tooltip
      var tipHtml = "<b>" + row.label + "</b>: " + fmtFn(row.value);
      _tip(bar, tipHtml);
      svg.appendChild(bar);

      // Value label inside bar when it is wide enough to hold text
      if (bLen > 26) {
        var valX = isPos ? barX + bLen - 3 : barX + 3;
        svg.appendChild(T(fmtFn(row.value), {
          x: valX, y: cy + 4,
          "text-anchor": isPos ? "end" : "start",
          fill: "#fff", "font-size": "8", "font-weight": "600",
          "pointer-events": "none"
        }));
      }

      // Animated entrance: bars slide in from the zero line (width animates 0 → final)
      if (canAnim()) {
        var dur = animD(0.45);
        var del = animD(i * 40);
        bar.setAttribute("width", 0);
        (function (b, fw, fx, isP) {
          setTimeout(function () {
            b.style.transition = "width " + dur + "s cubic-bezier(.4,0,.2,1)";
            b.setAttribute("width", fw);
            if (!isP) {
              // For left-extending bars, also animate x from ZERO_X toward final position
              b.setAttribute("x", ZERO_X);
              b.style.transition += ", x " + dur + "s cubic-bezier(.4,0,.2,1)";
              b.setAttribute("x", fx);
            }
          }, del);
        })(bar, bLen, barX, isPos);
      }
    });

    body.appendChild(svg);

    // Re-render on theme change or resize (PDC._reg ensures it stays current)
    var _body = body, _opts = opts;
    PDC._reg.push(function () {
      if (!_body.isConnected) return;
      PDC.divergingBar(_body, _opts);
    });
  };

  /* ── Stream graph (ThemeRiver layout) ───────────────────────────────────────
     A variant of stacked area where the baseline shifts each time step so the
     total stack is visually centered around a horizontal midline. The result is
     organic, flowing ribbon shapes — ideal for showing evolving volume/share of
     multiple streams over time without a dominant visual "floor".

     Each series becomes a filled band whose lower edge = −(half the total below
     this series) and upper edge = +half the total above. A 3-point Catmull–Rom
     spline smooths the path edges for that characteristically fluid look.

     API: PDC.streamgraph(el, {
       labels   : string[],           // x-axis period labels
       series   : [{name, values, color}],
       fmt      : function,           // value formatter
       height   : number,
       legend   : bool,               // default true
       opacity  : number              // band fill-opacity, 0-100, default 78
     });
  */
  PDC.streamgraph = function (el, cfg) { reg(el, function () { _stream(el, cfg); }); };
  function _stream(el, cfg) {
    var labels = cfg.labels || [], series = cfg.series || [], h = cfg.height || 280;
    if (!labels.length || !series.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    var o = mkSVG(el, h), s = o.s, w = o.w, P = PDC.palette(), n = labels.length;
    var fmt = cfg.fmt || PDC.fmt.abbr;
    var bandOp = ((cfg.opacity == null ? 78 : cfg.opacity) / 100).toFixed(2);
    var mL = 44, mR = 16, mT = 16, mB = 28, iw = w - mL - mR, ih = h - mT - mB;
    var xs = function (i) { return mL + (n <= 1 ? iw / 2 : iw * i / (n - 1)); };

    // Build per-series value arrays (clamp negatives to 0 — streams must be ≥ 0)
    var vals = series.map(function (se) {
      return labels.map(function (_, i) { return Math.max(0, +se.values[i] || 0); });
    });

    // Totals per label (for baseline computation and legend tooltip)
    var totals = labels.map(function (_, i) {
      return vals.reduce(function (a, v) { return a + v[i]; }, 0);
    });
    var globalMax = Math.max.apply(null, totals.concat([1]));

    // ThemeRiver: compute {lo, hi} for each series at each label using a centered baseline.
    // lower[i] tracks the cumulative height of bands below the current one at position i.
    // Each band starts at -(half of total) + cumulative-below and ends + its own value.
    var bands = [];
    var cumBelow = labels.map(function () { return 0; });
    series.forEach(function (se, si) {
      var lo = [], hi = [];
      labels.forEach(function (_, i) {
        var halfTotal = totals[i] / 2;
        var bottom = -halfTotal + cumBelow[i];
        lo.push(bottom);
        hi.push(bottom + vals[si][i]);
        cumBelow[i] += vals[si][i];
      });
      bands.push({ se: se, si: si, lo: lo, hi: hi });
    });

    // Map data-space y (centered) to canvas pixels.
    // Range: [-globalMax/2 … +globalMax/2] → [mT+ih … mT]
    var yScale = function (v) { return mT + ih * (0.5 - v / (globalMax || 1)); };

    // Draw a smooth closed path through the band using cubic bezier (Catmull-Rom approx).
    // Top edge: left→right; bottom edge: right→left. Closed with Z.
    function bandPath(lo, hi) {
      if (n === 1) {
        var x0 = xs(0), yl = yScale(lo[0]), yh = yScale(hi[0]);
        return "M" + x0 + "," + yh + " L" + (x0 + 8) + "," + yh + " L" + (x0 + 8) + "," + yl + " L" + x0 + "," + yl + "Z";
      }
      // Generate smooth curves along the top edge, then smooth curves back along bottom.
      function curvePoints(pts) {
        // Cardinal spline (tension ≈ 0.35): generates cubic bezier control points
        var d = "M" + pts[0].x + "," + pts[0].y;
        for (var i = 1; i < pts.length; i++) {
          var p0 = pts[Math.max(0, i - 2)], p1 = pts[i - 1], p2 = pts[i], p3 = pts[Math.min(pts.length - 1, i + 1)];
          var t = 0.35;
          var cp1x = p1.x + t * (p2.x - p0.x) / 2;
          var cp1y = p1.y + t * (p2.y - p0.y) / 2;
          var cp2x = p2.x - t * (p3.x - p1.x) / 2;
          var cp2y = p2.y - t * (p3.y - p1.y) / 2;
          d += " C" + cp1x.toFixed(1) + "," + cp1y.toFixed(1) + " " + cp2x.toFixed(1) + "," + cp2y.toFixed(1) + " " + p2.x.toFixed(1) + "," + p2.y.toFixed(1);
        }
        return d;
      }
      var topPts = labels.map(function (_, i) { return { x: xs(i), y: yScale(hi[i]) }; });
      var botPts = labels.map(function (_, i) { return { x: xs(i), y: yScale(lo[i]) }; }).reverse();
      return curvePoints(topPts) + " L" + botPts[0].x + "," + botPts[0].y + curvePoints(botPts).replace(/^M[^C]+ /, " ") + "Z";
    }

    // Draw the midline guide
    s.appendChild(S("line", { x1: mL, y1: yScale(0), x2: mL + iw, y2: yScale(0),
      stroke: PDC.cssvar("--border"), "stroke-width": 0.8, "stroke-dasharray": "4 3" }));

    // x-axis tick labels
    var step = Math.ceil(n / Math.max(2, Math.floor(iw / 64)));
    labels.forEach(function (lb, i) {
      if (i % step === 0 || i === n - 1)
        s.appendChild(S("text", { class: "tick", x: xs(i), y: mT + ih + 14, "text-anchor": "middle" }, PDC.fmt.trunc(lb, 9)));
    });

    // Draw bands from bottom to top (lowest series first so upper layers overlay cleanly)
    var bandEls = [];
    bands.forEach(function (b, bi) {
      var col = b.se.color || P[b.si % 10];
      var d = bandPath(b.lo, b.hi);
      var pathEl = S("path", { d: d, fill: col, "fill-opacity": bandOp, stroke: PDC.cssvar("--panel-bg"), "stroke-width": "0.5" });
      s.appendChild(pathEl);
      bandEls.push(pathEl);

      // Animated entrance: fade in each ribbon layer staggered
      if (canAnim()) {
        pathEl.style.opacity = "0";
        (function (el, delay) {
          setTimeout(function () { el.style.transition = "opacity " + animD(0.55) + "s ease"; el.style.opacity = "1"; }, animD(60 + delay));
        })(pathEl, bi * 80);
      }
    });

    // Transparent hit overlay for coordinated tooltip across all series at each x
    var ov = S("rect", { x: mL, y: mT, width: iw, height: ih, fill: "transparent" });
    ov.addEventListener("mousemove", function (e) {
      var rect = s.getBoundingClientRect(), mx = (e.clientX - rect.left) * (w / (rect.width || w));
      var i = Math.max(0, Math.min(n - 1, Math.round((mx - mL) / (iw / Math.max(1, n - 1)))));
      var html = "<b>" + labels[i] + "</b>";
      series.forEach(function (se, si) { html += "<br>" + (se.name || ("Series " + (si + 1))) + ": " + fmt(vals[si][i]); });
      html += "<br><span class='muted'>Total: " + fmt(totals[i]) + "</span>";
      PDC.showTip(e, html);
    });
    ov.addEventListener("mouseout", PDC.hideTip);
    s.appendChild(ov);

    // Clickable legend (same pattern as areaStacked / radar)
    if (cfg.legend !== false) {
      _toggleLegend(el, series.map(function (se, i) {
        return { name: se.name || ("Series " + (i + 1)), color: se.color || P[i % 10], els: [bandEls[i]], base: "1" };
      }));
    }
  }

  /* ── Enhanced interactive table chart (override PDC.table) ─────────────────
     Layers a live row-search bar and click-to-sort column headers on top of the
     existing PDC.table. All original cfg options continue to work: detail,
     recordDetail, bar cells, badge cells, fmt, and custom col.num/col.title.
     Row-click detail handlers use the visible (filtered+sorted) row index so
     clicking always opens the right record even after sorting or filtering.
     The base PDC.table in pdc-ui.js is preserved via PDC._tableBase.            */

  // Inject table-enhancement CSS once per document (iframe / exported CDF).
  if (!window.__pdcTblCssInjected) {
    window.__pdcTblCssInjected = true;
    var _tblStyle = document.createElement("style");
    _tblStyle.textContent =
      ".tbl-bar{display:flex;align-items:center;gap:6px;padding:5px 10px 4px;border-bottom:1px solid var(--panel-border,#e0e4ef)}" +
      ".tbl-filter{flex:1;font:inherit;font-size:12px;border:1px solid var(--panel-border);border-radius:5px;padding:3px 8px;background:var(--field,#f5f7fc);color:var(--text-primary,#1a1a2e);outline:none;min-width:0}" +
      ".tbl-filter:focus{border-color:var(--pentaho,#005bb5);box-shadow:0 0 0 2px color-mix(in srgb,var(--pentaho,#005bb5) 18%,transparent)}" +
      ".tbl-cnt{font-size:10.5px;color:var(--text-muted);white-space:nowrap;flex-shrink:0}" +
      ".tbl th.sortable-th{cursor:pointer;user-select:none;padding-right:20px!important;position:relative;white-space:nowrap;transition:color .12s}" +
      ".tbl th.sortable-th:hover{color:var(--pentaho,#005bb5)}" +
      ".sort-arr{position:absolute;right:4px;top:50%;transform:translateY(-50%);font-size:9px;color:var(--text-muted);line-height:1;pointer-events:none}" +
      ".sort-arr.active{color:var(--pentaho,#005bb5)}" +
      ".tbl tbody tr.tbl-stripe td{background:color-mix(in srgb,var(--panel-border,#e0e4ef) 30%,transparent)}" +
      ".tbl tbody tr.tbl-stripe:hover td{background:var(--panel-subtle-bg)}" +
      ".tbl tfoot .tbl-total td{font-weight:700;border-top:2px solid var(--panel-border,#e0e4ef);background:var(--panel-subtle-bg)}" +
      ".tbl-wrap.frz{max-height:340px;overflow-y:auto}" +
      ".tbl-wrap.frz thead th{position:sticky;top:0;z-index:2;background:var(--panel-bg,#fff)}" +
      ".tbl-wrap.compact .tbl th{padding:4px 10px}" +
      ".tbl-wrap.compact .tbl td{padding:3px 10px;font-size:11.5px}" +
      ".tbl-page-bar{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:6px 10px 2px;font-size:11px;color:var(--text-muted)}" +
      ".tbl-page-bar button{font:inherit;font-size:11px;border:1px solid var(--panel-border);border-radius:5px;background:var(--field,#f5f7fc);color:var(--text-primary,#1a1a2e);padding:2px 9px;cursor:pointer}" +
      ".tbl-page-bar button:disabled{opacity:.4;cursor:default}" +
      ".tbl-page-bar button:hover:not(:disabled){border-color:var(--pentaho,#005bb5);color:var(--pentaho,#005bb5)}";
    (document.head || document.body || document.documentElement).appendChild(_tblStyle);
  }

  PDC._tableBase = PDC.table; // keep the original accessible for inspection / testing

  PDC.table = function (el, cfg) {
    var cols = cfg.cols || [];
    var rows = cfg.rows || [];
    var sortCol = -1, sortDir = 1; // sortDir: 1=asc, -1=desc; sortCol=-1 means unsorted
    var filterText = "";
    var pageSize = cfg.pageSize > 0 ? cfg.pageSize : 0; // 0 = show every visible row on one page
    var page = 0;

    function visibleRows() {
      // 1. Filter rows by search text (case-insensitive substring across all cells)
      var q = filterText.toLowerCase();
      var r = q ? rows.filter(function (row) {
        return row.some(function (cell) { return cell != null && String(cell).toLowerCase().indexOf(q) >= 0; });
      }) : rows;
      // 2. Sort by the selected column
      if (sortCol >= 0) {
        r = r.slice().sort(function (a, b) {
          var av = a[sortCol], bv = b[sortCol];
          var an = parseFloat(av), bn = parseFloat(bv);
          if (!isNaN(an) && !isNaN(bn)) return sortDir * (an - bn);
          return sortDir * String(av == null ? "" : av).localeCompare(String(bv == null ? "" : bv));
        });
      }
      return r;
    }

    function render() {
      var vr = visibleRows();
      var totalPages = pageSize > 0 ? Math.max(1, Math.ceil(vr.length / pageSize)) : 1;
      if (page > totalPages - 1) page = totalPages - 1;
      if (page < 0) page = 0;
      var pageStart = pageSize > 0 ? page * pageSize : 0;
      var pageRows = pageSize > 0 ? vr.slice(pageStart, pageStart + pageSize) : vr;

      el.innerHTML = "";

      // Search / filter bar above the table (outside the scrollable/frozen area)
      var bar = document.createElement("div");
      bar.className = "tbl-bar";
      var inp = document.createElement("input");
      inp.type = "search";
      inp.placeholder = "Filter rows…";
      inp.className = "tbl-filter";
      inp.value = filterText;
      inp.setAttribute("aria-label", "Filter table rows");
      inp.addEventListener("input", function () { filterText = inp.value; page = 0; render(); });
      // Prevent filter keystrokes from triggering global shortcuts (? / Delete / ↑↓ etc.)
      inp.addEventListener("keydown", function (e) { e.stopPropagation(); });
      var cnt = document.createElement("span");
      cnt.className = "tbl-cnt";
      cnt.setAttribute("aria-live", "polite");
      cnt.textContent = filterText ? (vr.length + " / " + rows.length)
        : (pageSize > 0 && totalPages > 1) ? ("Showing " + (pageStart + 1) + "–" + Math.min(pageStart + pageSize, vr.length) + " of " + rows.length)
        : (rows.length + " row" + (rows.length === 1 ? "" : "s"));
      bar.appendChild(inp);
      bar.appendChild(cnt);
      el.appendChild(bar);

      // Table body — freeze header (sticky thead in a scrollable wrap) and row density
      // (comfortable/compact) are purely presentational, applied via wrapper classes.
      var wrap = document.createElement("div");
      wrap.className = "tbl-wrap" + (cfg.freezeHeader ? " frz" : "") + (cfg.density === "compact" ? " compact" : "");
      el.appendChild(wrap);

      // Column max values (for bar cells) are computed over ALL visible (filtered/sorted)
      // rows, not just the current page, so bar-fill scale stays stable while paging.
      var maxes = cols.map(function (c, ci) {
        return c.bar ? Math.max.apply(null, vr.map(function (r) { return +r[ci] || 0; })) || 1 : 0;
      });
      var tbl = document.createElement("table");
      tbl.className = "tbl";

      var thead = document.createElement("thead");
      var hr = document.createElement("tr");
      cols.forEach(function (c, ci) {
        var th = document.createElement("th");
        th.className = (c.num ? "num " : "") + "sortable-th";
        th.title = "Sort by " + c.label;
        var lb = document.createElement("span");
        lb.textContent = c.label;
        th.appendChild(lb);
        var arr = document.createElement("span");
        arr.className = "sort-arr" + (ci === sortCol ? " active" : "");
        arr.setAttribute("aria-hidden", "true");
        arr.textContent = ci === sortCol ? (sortDir > 0 ? "↑" : "↓") : "↕";
        th.appendChild(arr);
        (function (colIdx) {
          th.addEventListener("click", function () {
            if (sortCol === colIdx) {
              if (sortDir > 0) { sortDir = -1; }
              else { sortCol = -1; sortDir = 1; } // third click = no sort
            } else { sortCol = colIdx; sortDir = 1; }
            page = 0;
            render();
            var fi = el.querySelector(".tbl-filter"); if (fi) fi.focus();
          });
        })(ci);
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      tbl.appendChild(thead);

      var tbody = document.createElement("tbody");
      pageRows.forEach(function (r, ri) {
        var tr = document.createElement("tr");
        if (ri % 2 === 1) tr.className = "tbl-stripe"; // alternating stripe for readability
        cols.forEach(function (c, ci) {
          var td = document.createElement("td");
          var v = r[ci], disp = c.fmt ? c.fmt(v) : (v == null ? "" : v);
          if (c.bar) {
            var pc = (100 * (+v || 0) / maxes[ci]).toFixed(1);
            td.className = "num barcell";
            td.innerHTML = '<span class="fill" style="width:' + pc + '%"></span><span>' + String(disp) + '</span>';
          } else if (c.badge) {
            var b = c.badge(v);
            td.innerHTML = '<span class="badge ' + b.cls + '">' + b.text + '</span>';
          } else {
            if (c.num) td.className = "num";
            if (c.title) td.title = String(r[ci]).replace(/"/g, "&quot;");
            td.textContent = String(disp);
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);

      // Optional grand-total row: sums each numeric column over the currently visible
      // (filtered/sorted) rows, so the total always matches what's on screen.
      if (cfg.grandTotal && cols.length) {
        var tfoot = document.createElement("tfoot");
        var totalTr = document.createElement("tr");
        totalTr.className = "tbl-total";
        var labeled = false;
        cols.forEach(function (c, ci) {
          var td = document.createElement("td");
          if (c.num) {
            var sum = vr.reduce(function (acc, r) { return acc + (+r[ci] || 0); }, 0);
            td.className = "num";
            td.textContent = String(c.fmt ? c.fmt(sum) : sum);
          } else if (!labeled) {
            td.textContent = "Total"; labeled = true;
          }
          totalTr.appendChild(td);
        });
        tfoot.appendChild(totalTr);
        tbl.appendChild(tfoot);
      }
      wrap.appendChild(tbl);

      // Row-click detail (mirrors base PDC.table; uses pageRows index so sort+filter+paging are respected)
      if (cfg.detail || cfg.recordDetail) {
        var trs = el.querySelectorAll("tbody tr");
        [].forEach.call(trs, function (tr, ri) {
          tr.style.cursor = "pointer"; tr.classList.add("rowclick");
          tr.addEventListener("click", function () {
            var row = pageRows[ri];
            if (cfg.recordDetail) {
              var pairs = cols.map(function (c, ci) {
                return { label: c.label, value: c.fmt ? c.fmt(row[ci]) : (row[ci] == null ? "" : row[ci]) };
              });
              var ttl = cfg.recordDetail.title ? cfg.recordDetail.title(row) : String(row[cfg.recordDetail.keyIdx || 0]);
              PDC.detail({ title: ttl, subtitle: cfg.recordDetail.subtitle, record: pairs,
                drill: cfg.recordDetail.drill ? { to: cfg.recordDetail.drill.to, param: cfg.recordDetail.drill.param,
                  value: row[cfg.recordDetail.drill.keyIdx || 0], label: cfg.recordDetail.drill.label } : null });
            } else {
              PDC.openDetail(cfg.detail, row[cfg.detail.keyIdx || 0]);
            }
          });
        });
      }

      // Pagination bar — only shown when pageSize actually splits the data into >1 page.
      if (pageSize > 0 && totalPages > 1) {
        var pbar = document.createElement("div");
        pbar.className = "tbl-page-bar";
        var prev = document.createElement("button");
        prev.type = "button"; prev.textContent = "‹ Prev"; prev.disabled = page === 0;
        prev.addEventListener("click", function () { page--; render(); });
        var lbl = document.createElement("span");
        lbl.textContent = "Page " + (page + 1) + " of " + totalPages;
        var next = document.createElement("button");
        next.type = "button"; next.textContent = "Next ›"; next.disabled = page >= totalPages - 1;
        next.addEventListener("click", function () { page++; render(); });
        pbar.appendChild(prev); pbar.appendChild(lbl); pbar.appendChild(next);
        el.appendChild(pbar);
      }
    }

    render();
  };

  /* ── Enhanced gauge chart (override PDC.gauge, Z8 slice 4) ──────────────────
     Base PDC.gauge (pdc-ui.js) already picks the value-arc color from goodAt/warnAt
     thresholds, but they were hardcoded (0.9/0.7) and invisible until the needle
     crossed them. This override draws the thresholds as a permanent red/amber/green
     zone track behind the value arc — so the "why is it red" is visible at a glance —
     and applies the chart's chosen value format (cfg.fmt) to the center readout instead
     of always showing a raw rounded number. Base kept as PDC._gaugeBase for reference. */
  PDC._gaugeBase = PDC.gauge;

  PDC.gauge = function (el, cfg) { reg(el, function () { _gaugeZoned(el, cfg); }); };

  function _gaugeZoned(el, cfg) {
    var h = cfg.height || 190, o = mkSVG(el, h), s = o.s, w = o.w;
    var val = +cfg.value || 0, max = cfg.max || 100, pct = Math.max(0, Math.min(1, val / max));
    var warnAt = cfg.warnAt != null ? cfg.warnAt : 0.7;
    var goodAt = cfg.goodAt != null ? cfg.goodAt : 0.9;
    var cx = w / 2, cy = h - 22, R = Math.min(w / 2 - 16, h - 44);
    function arc(p0, p1, rr, col, wd) {
      var a0 = Math.PI + Math.PI * p0, a1 = Math.PI + Math.PI * p1;
      var x0 = cx + rr * Math.cos(a0), y0 = cy + rr * Math.sin(a0), x1 = cx + rr * Math.cos(a1), y1 = cy + rr * Math.sin(a1);
      // large-arc-flag is always 0: the gauge spans a 180° arc, so no single zone segment
      // can exceed 180° — using (p1-p0)>0.5 made the "bad" zone (0→0.7) sweep the long way round.
      return S("path", { d: "M" + x0 + "," + y0 + " A" + rr + "," + rr + " 0 0 1 " + x1 + "," + y1, fill: "none", stroke: col, "stroke-width": wd, "stroke-linecap": "round" });
    }
    // Zone track: bad (0→warnAt), warn (warnAt→goodAt), good (goodAt→1) — always visible,
    // regardless of the current value, so thresholds are self-explanatory.
    s.appendChild(arc(0, warnAt, R, PDC.cssvar("--bad"), 16));
    s.appendChild(arc(warnAt, goodAt, R, PDC.cssvar("--warn"), 16));
    s.appendChild(arc(goodAt, 1, R, PDC.cssvar("--good"), 16));
    var needleCol = cfg.color || (pct >= goodAt ? PDC.cssvar("--good") : pct >= warnAt ? PDC.cssvar("--warn") : PDC.cssvar("--bad"));
    var tickW = 0.02, tickStart = Math.max(0, Math.min(1 - tickW, pct - tickW / 2));
    s.appendChild(arc(tickStart, tickStart + tickW, R, needleCol, 22)); // bright needle tick marks the value on the zone track
    var text = cfg.text || ((cfg.fmt ? cfg.fmt(val) : (Math.round(val * 10) / 10).toLocaleString()) + (cfg.unit || ""));
    s.appendChild(S("text", { x: cx, y: cy - 6, "text-anchor": "middle", class: "gauge-val", "font-size": "30" }, text));
    s.appendChild(S("text", { x: cx, y: cy + 14, "text-anchor": "middle", class: "gauge-cap" }, cfg.label || ""));
  }

  /* ── Enhanced treemap chart (override PDC.treemap, Z8 slice 5) ──────────────
     Base PDC.treemap (pdc-ui.js) always draws a bold title + raw value label on
     any tile big enough to fit one, with no way to hide it or swap in "% of
     total" — the question a treemap is usually built to answer. This override
     keeps the identical squarified layout algorithm (same sort/worst/row logic)
     and adds cfg.showLabels / cfg.showPct. Base kept as PDC._treemapBase. */
  PDC._treemapBase = PDC.treemap;

  PDC.treemap = function (el, cfg) { reg(el, function () { _treemapOpts(el, cfg); }); };

  function _treemapOpts(el, cfg) {
    var data = (cfg.data || []).filter(function (d) { return (+d.value || 0) > 0; }).sort(function (a, b) { return b.value - a.value; });
    var h = cfg.height || 280;
    if (!data.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    var o = mkSVG(el, h), s = o.s, w = o.w, pal = PDC.palette(), fmt = cfg.fmt || PDC.fmt.abbr;
    var showLabels = cfg.showLabels !== false, showPct = !!cfg.showPct;
    var total = data.reduce(function (a, d) { return a + +d.value; }, 0);
    var x = 0, y = 0, cw = w, ch = h, i = 0;
    function worst(row, len) {
      var s2 = row.reduce(function (a, r) { return a + r.area; }, 0);
      var mx = Math.max.apply(null, row.map(function (r) { return r.area; })), mn = Math.min.apply(null, row.map(function (r) { return r.area; }));
      return Math.max(len * len * mx / (s2 * s2), s2 * s2 / (len * len * mn));
    }
    var items = data.map(function (d) { return { d: d, area: d.value / total * w * h }; });
    while (i < items.length) {
      var horiz = cw >= ch, len = horiz ? ch : cw, row = [], rest = items.slice(i), k = 0;
      while (k < rest.length) { var test = row.concat([rest[k]]); if (row.length && worst(test, len) > worst(row, len)) break; row.push(rest[k]); k++; }
      var rsum = row.reduce(function (a, r) { return a + r.area; }, 0), thick = rsum / len, off = 0;
      row.forEach(function (r) {
        var seg = r.area / thick, rx, ry, rw, rh2;
        if (horiz) { rx = x; ry = y + off; rw = thick; rh2 = seg; } else { rx = x + off; ry = y; rw = seg; rh2 = thick; }
        off += seg;
        var idx = data.indexOf(r.d), col = r.d.color || pal[idx % 10];
        var pctTxt = (100 * r.d.value / total).toFixed(1) + "%";
        var rc = S("rect", { x: rx + 1, y: ry + 1, width: Math.max(0, rw - 2), height: Math.max(0, rh2 - 2), rx: 3, fill: col, opacity: .92, class: "bar" });
        _tip(rc, "<b>" + r.d.label + "</b><br>" + fmt(r.d.value) + " (" + pctTxt + ")");
        if (cfg.detail) PDC.bindDetail(rc, cfg.detail, r.d.label);
        s.appendChild(rc);
        if (showLabels && rw > 54 && rh2 > 22) {
          s.appendChild(S("text", { x: rx + 6, y: ry + 15, fill: "#fff", "font-size": "11", "font-weight": "700" }, PDC.fmt.trunc(r.d.label, Math.floor(rw / 7))));
          s.appendChild(S("text", { x: rx + 6, y: ry + 29, fill: "rgba(255,255,255,.85)", "font-size": "10" }, showPct ? pctTxt : fmt(r.d.value)));
        }
      });
      if (horiz) { x += thick; cw -= thick; } else { y += thick; ch -= thick; }
      i += row.length;
    }
  }

  /* ── Enhanced scatter / bubble chart (override PDC.scatter, Z8 slice 6) ─────
     Base PDC.scatter (pdc-ui.js) always formats axis ticks + tooltips with
     PDC.fmt.abbr and has no way to reveal the linear relationship between the
     two plotted variables. This override keeps the identical dot-plot layout
     (same axis scaling + bubble-radius encoding) and adds cfg.fmtX/cfg.fmtY
     (now wired to the panel's Value format option) plus an optional
     cfg.trend — a least-squares regression line through the points, so a
     builder can show correlation direction/strength without leaving the tool.
     Base kept as PDC._scatterBase for reference. */
  PDC._scatterBase = PDC.scatter;

  PDC.scatter = function (el, cfg) { reg(el, function () { _scatterTrend(el, cfg); }); };

  function _scatterTrend(el, cfg) {
    var pts = cfg.points || [], h = cfg.height || 280;
    if (!pts.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    var o = mkSVG(el, h), s = o.s, w = o.w, fx = cfg.fmtX || PDC.fmt.abbr, fy = cfg.fmtY || PDC.fmt.abbr;
    var mL = 48, mR = 14, mT = 12, mB = 34, iw = w - mL - mR, ih = h - mT - mB;
    var xmax = niceMax(Math.max.apply(null, pts.map(function (p) { return +p.x || 0; })));
    var ymax = niceMax(Math.max.apply(null, pts.map(function (p) { return +p.y || 0; })));
    var rmax = Math.max.apply(null, pts.map(function (p) { return +p.r || 1; })) || 1;
    var xs = function (v) { return mL + iw * (v / xmax); }, ys = function (v) { return mT + ih * (1 - v / ymax); };
    for (var g = 0; g <= 4; g++) {
      var gy = mT + ih * (1 - g / 4), gx = mL + iw * g / 4;
      s.appendChild(S("line", { class: "gridline", x1: mL, y1: gy, x2: w - mR, y2: gy }));
      s.appendChild(S("text", { class: "tick", x: mL - 7, y: gy + 3, "text-anchor": "end" }, fy(ymax * g / 4)));
      s.appendChild(S("text", { class: "tick", x: gx, y: mT + ih + 14, "text-anchor": "middle" }, fx(xmax * g / 4)));
    }
    if (cfg.xLabel) s.appendChild(S("text", { class: "axis-label", x: mL + iw / 2, y: h - 2, "text-anchor": "middle" }, cfg.xLabel));
    if (cfg.yLabel) {
      var yl = S("text", { class: "axis-label", x: 12, y: mT + ih / 2, "text-anchor": "middle" }, cfg.yLabel);
      yl.setAttribute("transform", "rotate(-90 12 " + (mT + ih / 2) + ")");
      s.appendChild(yl);
    }
    // Optional trend line: ordinary least-squares regression (y = slope·x + intercept)
    // through every plotted point, clamped to the visible axis range.
    if (cfg.trend && pts.length > 1) {
      var n = pts.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
      pts.forEach(function (p) { var px = +p.x || 0, py = +p.y || 0; sx += px; sy += py; sxy += px * py; sxx += px * px; });
      var denom = n * sxx - sx * sx;
      if (denom) {
        var slope = (n * sxy - sx * sy) / denom, intercept = (sy - slope * sx) / n;
        var ty0 = Math.max(0, Math.min(ymax, intercept)), ty1 = Math.max(0, Math.min(ymax, intercept + slope * xmax));
        s.appendChild(S("line", { x1: xs(0), y1: ys(ty0), x2: xs(xmax), y2: ys(ty1), class: "trend-line",
          stroke: PDC.cssvar("--bad"), "stroke-width": 2, "stroke-dasharray": "6,4", opacity: .8 }));
      }
    }
    pts.forEach(function (p, i) {
      var rr = 6 + 18 * Math.sqrt((+p.r || 1) / rmax);
      var c = S("circle", { cx: xs(+p.x || 0), cy: ys(+p.y || 0), r: rr, fill: p.color || PDC.color(i), opacity: .62, stroke: p.color || PDC.color(i), "stroke-width": 1.2, class: "dot" });
      c.addEventListener("mousemove", function (e) {
        PDC.showTip(e, "<b>" + (p.label || "") + "</b><br>" + (cfg.xLabel || "x") + ": " + fx(p.x) + "<br>" + (cfg.yLabel || "y") + ": " + fy(p.y) +
          (p.r != null ? "<br>" + (cfg.rLabel || "size") + ": " + PDC.fmt.abbr(p.r) : ""));
      });
      c.addEventListener("mouseout", PDC.hideTip);
      s.appendChild(c);
    });
  }

  /* ── Enhanced line / area chart (override PDC.line, Z8 slice 7) ─────────────
     Base PDC.line (pdc-ui.js) always draws straight segment-to-segment lines
     with a dot on every point, no way to turn either off. This override keeps
     the identical axis/grid/gradient-fill logic and adds cfg.smooth (curved
     segments via the same midpoint cubic-bezier technique used by the Bump
     chart) and cfg.showDots (hide the per-point markers for a cleaner look on
     dense series). Base kept as PDC._lineBase for reference. */
  PDC._lineBase = PDC.line;

  PDC.line = function (el, cfg) { reg(el, function () { _lineOpts(el, cfg); }); };

  function _lineOpts(el, cfg) {
    var labels = cfg.labels || [], series = cfg.series || [], h = cfg.height || 270;
    if (!labels.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    var n = labels.length;
    // Z7 forecasting slice 2: an optional per-series linear-regression trend line,
    // extended `forecastPeriods` slots past the last real data point. The x-scale
    // widens to include the forecast tail (real points compress slightly rather
    // than the projection overlapping existing data).
    var fcN = (cfg.showTrend && (+cfg.forecastPeriods || 0) > 0) ? Math.max(0, Math.floor(+cfg.forecastPeriods)) : 0;
    var totalSpan = n - 1 + fcN;
    function trendOf(vals) {
      var sx = 0, sy = 0, sxy = 0, sxx = 0, m = vals.length;
      vals.forEach(function (v, i) { var x = i, y = +v || 0; sx += x; sy += y; sxy += x * y; sxx += x * x; });
      var denom = (m * sxx - sx * sx) || 1;
      var slope = (m * sxy - sx * sy) / denom, intercept = (sy - slope * sx) / m;
      return { slope: slope, intercept: intercept };
    }
    // Z7 forecasting slice 3: Holt's linear (double exponential smoothing) — a level
    // that tracks the smoothed series plus a smoothed trend, updated one point at a
    // time. `fitted` is the smoothed line over the real data (reacts to recent moves,
    // unlike the single straight OLS line); `level`/`trend` at the end are then walked
    // forward for the forecast tail (level + m*trend), same shape as Holt's classic
    // no-seasonality forecast.
    function holtOf(vals, alpha, beta) {
      var n = vals.length, fitted = new Array(n);
      var level = +vals[0] || 0, trend = n > 1 ? ((+vals[1] || 0) - level) : 0;
      fitted[0] = level;
      for (var i = 1; i < n; i++) {
        var val = +vals[i] || 0, prevLevel = level;
        level = alpha * val + (1 - alpha) * (level + trend);
        trend = beta * (level - prevLevel) + (1 - beta) * trend;
        fitted[i] = level;
      }
      return { fitted: fitted, level: level, trend: trend };
    }
    // Z7 stretch: Holt-Winters additive seasonality — the "-Winters" part Holt (above)
    // doesn't cover. Adds a repeating seasonal offset on top of Holt's level+trend, so
    // e.g. a monthly series with a December spike projects that spike again next
    // December instead of just extrapolating the smoothed slope through it. Needs at
    // least two full seasons of real data to estimate initial seasonal indices; with
    // less than that it falls back to plain Holt (no seasonality) rather than guessing.
    function holtWintersOf(vals, alpha, beta, gamma, L) {
      var n = vals.length;
      if (L < 2 || n < L * 2) return holtOf(vals, alpha, beta);
      var season = new Array(L);
      var avg1 = 0, avg2 = 0, i;
      for (i = 0; i < L; i++) avg1 += (+vals[i] || 0); avg1 /= L;
      for (i = L; i < L * 2; i++) avg2 += (+vals[i] || 0); avg2 /= L;
      var trend = (avg2 - avg1) / L;
      var level = avg1;
      for (i = 0; i < L; i++) season[i] = (+vals[i] || 0) - avg1;
      var fitted = new Array(n);
      for (i = 0; i < n; i++) {
        var val = +vals[i] || 0, s = season[i % L], prevLevel = level;
        fitted[i] = level + trend + s;
        level = alpha * (val - s) + (1 - alpha) * (level + trend);
        trend = beta * (level - prevLevel) + (1 - beta) * trend;
        season[i % L] = gamma * (val - level) + (1 - gamma) * s;
      }
      return { fitted: fitted, level: level, trend: trend, season: season, seasonLen: L };
    }
    var trendMethod = cfg.trendMethod === "holt" ? "holt" : (cfg.trendMethod === "hw" ? "hw" : "linear");
    var alpha = Math.min(1, Math.max(.01, (+cfg.alpha || 30) / 100)), beta = Math.min(1, Math.max(.01, (+cfg.beta || 10) / 100));
    var gamma = Math.min(1, Math.max(.01, (+cfg.gamma || 20) / 100)), seasonLen = Math.max(2, Math.floor(+cfg.seasonLength || 4));
    var trends = cfg.showTrend ? series.map(function (se) {
      if (trendMethod === "hw") return holtWintersOf(se.values, alpha, beta, gamma, seasonLen);
      return trendMethod === "holt" ? holtOf(se.values, alpha, beta) : trendOf(se.values);
    }) : null;
    // Forecast value m periods past the last real point. Non-seasonal (Holt) walks the
    // smoothed trend forward in a straight line; Holt-Winters also re-applies whichever
    // seasonal index that future period lines up with (wrapping every `seasonLen`).
    function fcValueOf(t, m) {
      return t.season ? t.level + t.trend * m + t.season[(n - 1 + m) % t.seasonLen] : t.level + t.trend * m;
    }
    var o = mkSVG(el, h), s = o.s, w = o.w, fmt = cfg.fmt || PDC.fmt.abbr, pal = PDC.palette();
    var showDots = cfg.showDots !== false;
    var allv = []; series.forEach(function (se) { se.values.forEach(function (v) { allv.push(+v || 0); }); });
    if (trends) trends.forEach(function (t) {
      if (trendMethod === "holt" || trendMethod === "hw") {
        allv.push.apply(allv, t.fitted);
        for (var fm = 1; fm <= fcN; fm++) allv.push(fcValueOf(t, fm));
      } else { allv.push(t.intercept + t.slope * totalSpan); }
    });
    var max = niceMax(Math.max.apply(null, allv.concat([0]))), min = cfg.min0 === false ? Math.min.apply(null, allv) : 0;
    var mL = 46, mR = 12, mT = 12, mB = 30, iw = w - mL - mR, ih = h - mT - mB;
    var xs = function (i) { return mL + (totalSpan <= 0 ? iw / 2 : iw * i / totalSpan); }, ys = function (v) { return mT + ih * (1 - ((v - min) / ((max - min) || 1))); };
    for (var g = 0; g <= 4; g++) {
      var gy = mT + ih * (1 - g / 4); s.appendChild(S("line", { class: "gridline", x1: mL, y1: gy, x2: w - mR, y2: gy }));
      s.appendChild(S("text", { class: "tick", x: mL - 7, y: gy + 3, "text-anchor": "end" }, fmt(min + (max - min) * g / 4)));
    }
    var step = Math.ceil(n / Math.max(2, Math.floor(iw / 64)));
    labels.forEach(function (lb, i) { if (i % step === 0 || i === n - 1) s.appendChild(S("text", { class: "tick", x: xs(i), y: mT + ih + 14, "text-anchor": "middle" }, PDC.fmt.trunc(lb, 9))); });
    if (fcN > 0) {
      for (var fi = 1; fi <= fcN; fi++) {
        s.appendChild(S("text", { class: "tick forecast-tick", x: xs(n - 1 + fi), y: mT + ih + 14, "text-anchor": "middle", opacity: .55, "font-style": "italic" }, "+" + fi));
      }
      var sepX = xs(n - 1);
      s.appendChild(S("line", { class: "forecast-sep", x1: sepX, y1: mT, x2: sepX, y2: mT + ih, stroke: PDC.cssvar("--panel-border"), "stroke-width": 1, "stroke-dasharray": "3,3", opacity: .7 }));
      s.appendChild(S("text", { class: "tick forecast-label", x: sepX + 4, y: mT + 11, opacity: .6, "font-style": "italic" }, "Forecast →"));
    }
    // Straight or smoothed path through a series' points. Smoothing reuses the same
    // "control point at the horizontal midpoint" cubic-bezier trick as the Bump chart —
    // simple, deterministic, and reads as a gentle curve without overshoot.
    function pathFor(pts) {
      var d = "M" + pts[0][0] + "," + pts[0][1];
      for (var i = 1; i < pts.length; i++) {
        if (cfg.smooth) {
          var cx = (pts[i - 1][0] + pts[i][0]) / 2;
          d += " C" + cx + "," + pts[i - 1][1] + " " + cx + "," + pts[i][1] + " " + pts[i][0] + "," + pts[i][1];
        } else {
          d += " L" + pts[i][0] + "," + pts[i][1];
        }
      }
      return d;
    }
    var seriesEls = [];
    series.forEach(function (se, si) {
      var col = se.color || pal[si % 10], els = [];
      var pts = se.values.map(function (v, i) { return [xs(i), ys(+v || 0)]; });
      var path = pathFor(pts);
      if (cfg.area) {
        var gid = "ar" + si + Math.random().toString(36).slice(2, 6);
        var defs = S("defs"); var lg = S("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
        lg.appendChild(S("stop", { offset: "0%", "stop-color": col, "stop-opacity": .34 })); lg.appendChild(S("stop", { offset: "100%", "stop-color": col, "stop-opacity": .02 }));
        defs.appendChild(lg); s.appendChild(defs);
        var ar = S("path", { d: path + " L" + xs(n - 1) + "," + (mT + ih) + " L" + xs(0) + "," + (mT + ih) + " Z", fill: "url(#" + gid + ")" });
        if (canAnim()) { ar.style.opacity = "0"; setTimeout(function () { ar.style.transition = "opacity .42s ease"; ar.style.opacity = "1"; }, animD(260)); }
        s.appendChild(ar); els.push(ar);
      }
      var lp = S("path", { d: path, fill: "none", stroke: col, "stroke-width": 2.4, "stroke-linejoin": "round", "stroke-linecap": "round" });
      s.appendChild(lp); els.push(lp);
      if (canAnim()) {
        var len = 0; try { len = lp.getTotalLength(); } catch (e) {}
        if (len) {
          lp.style.strokeDasharray = len; lp.style.strokeDashoffset = len;
          setTimeout(function () { lp.style.transition = "stroke-dashoffset .76s ease"; lp.style.strokeDashoffset = 0; }, animD(si * 120));
        }
      }
      se.values.forEach(function (v, i) {
        var c = S("circle", { class: showDots ? "dot" : "dot-ghost", cx: xs(i), cy: ys(+v || 0), r: showDots ? 3.2 : 6, fill: showDots ? col : "transparent",
          stroke: showDots ? PDC.cssvar("--panel-bg") : "none", "stroke-width": showDots ? 1.5 : 0 });
        _tip(c, "<b>" + labels[i] + "</b><br>" + se.name + ": " + fmt(v));
        s.appendChild(c); els.push(c);
        if (showDots && canAnim()) { c.style.opacity = "0"; setTimeout(function () { c.style.transition = "opacity .3s ease"; c.style.opacity = "1"; }, animD(520 + i * 16)); }
      });
      // Z7 forecasting slice 1: an optional trailing simple-moving-average overlay
      // per series — a dashed line in the series' own color, muted, drawn on top
      // once the raw line/dots settle. Partial windows at the start average
      // whatever points are available so the overlay always spans the full chart.
      if (cfg.showMA) {
        var maW = Math.max(1, +cfg.maWindow || 3);
        var maVals = se.values.map(function (v, i) {
          var start = Math.max(0, i - maW + 1), sum = 0, cnt = 0;
          for (var j = start; j <= i; j++) { sum += +se.values[j] || 0; cnt++; }
          return sum / cnt;
        });
        var maPts = maVals.map(function (v, i) { return [xs(i), ys(v)]; });
        var maPath = S("path", { d: pathFor(maPts), fill: "none", stroke: col, "stroke-width": 1.8, "stroke-dasharray": "5,4", opacity: .7, class: "ma-line" });
        _tip(maPath, (series.length > 1 ? "<b>" + se.name + "</b> " : "") + maW + "-pt moving avg");
        s.appendChild(maPath); els.push(maPath);
      }
      // Z7 forecasting slice 2: the OLS trend line, extrapolated across the
      // forecast tail when forecastPeriods > 0 (otherwise just spans the real data).
      if (trends) {
        var tr = trends[si], trendD;
        if (trendMethod === "holt" || trendMethod === "hw") {
          var hPts = tr.fitted.map(function (v, i) { return [xs(i), ys(v)]; });
          for (var hf = 1; hf <= fcN; hf++) hPts.push([xs(n - 1 + hf), ys(fcValueOf(tr, hf))]);
          trendD = pathFor(hPts);
        } else {
          trendD = "M" + xs(0) + "," + ys(tr.intercept) + " L" + xs(totalSpan) + "," + ys(tr.intercept + tr.slope * totalSpan);
        }
        var trendPath = S("path", { d: trendD, fill: "none", stroke: col,
          "stroke-width": 1.6, "stroke-dasharray": "8,3", opacity: .55, class: "trend-line" });
        var methodLabel = trendMethod === "hw" && tr.season ? "Holt-Winters (seasonal)" : trendMethod === "hw" ? "Holt smoothing (not enough data for a season)" : trendMethod === "holt" ? "Holt smoothing" : null;
        var trendTip = (series.length > 1 ? "<b>" + se.name + "</b> " : "") +
          (methodLabel ? methodLabel + (fcN ? " · " + fcN + "-period forecast" : "") : (fcN ? fcN + "-period forecast" : "trend"));
        _tip(trendPath, trendTip);
        s.appendChild(trendPath); els.push(trendPath);
      }
      seriesEls.push(els);
    });
    if (series.length > 1 && cfg.legend !== false) _toggleLegend(el, series.map(function (se, i) {
      return { name: se.name, color: se.color || pal[i % 10], els: seriesEls[i], base: "1" };
    }));
  }

  /* ── Enhanced donut / pie chart (override PDC.donut, Z8 slice 8) ────────────
     Base PDC.donut (pdc-ui.js) always draws slices in row order, a fixed
     60%-inner-radius ring, and an always-on legend, with no way to adjust any
     of that. This override keeps the identical arc-drawing/tooltip/center-label
     logic and adds cfg.sortSlices (largest slice first), cfg.legend (hide the
     side legend, letting the ring use the full width), and cfg.innerPct (ring
     thickness as an inner-radius percentage, 0 = full pie). Base kept as
     PDC._donutBase for reference. */
  PDC._donutBase = PDC.donut;

  PDC.donut = function (el, cfg) { reg(el, function () { _donutOpts(el, cfg); }); };

  function _donutOpts(el, cfg) {
    var data = (cfg.data || []).filter(function (d) { return (+d.value || 0) > 0; }), h = cfg.height || 260;
    if (!data.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    if (cfg.sortSlices) data = data.slice().sort(function (a, b) { return (+b.value || 0) - (+a.value || 0); });
    var showLegend = cfg.legend !== false;
    var o = mkSVG(el, h), s = o.s, w = o.w, pal = PDC.palette(), fmt = cfg.fmt || PDC.fmt.abbr;
    var total = data.reduce(function (a, d) { return a + (+d.value || 0); }, 0);
    if (isFinite(total) && total !== 0) total = parseFloat(total.toPrecision(12));
    var innerRatio = Math.max(0, Math.min(90, cfg.innerPct != null ? +cfg.innerPct : 60)) / 100;
    var cx = showLegend ? Math.min(w * 0.32, 150) : w / 2, cy = h / 2, R = Math.min(cx - 10, h / 2 - 12), r = R * innerRatio, a0 = -Math.PI / 2;
    data.forEach(function (d, i) {
      var ang = (+d.value / total) * Math.PI * 2, a1 = a0 + ang, col = d.color || pal[i % 10];
      var x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0), x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
      var xi0 = cx + r * Math.cos(a1), yi0 = cy + r * Math.sin(a1), xi1 = cx + r * Math.cos(a0), yi1 = cy + r * Math.sin(a0);
      var big = ang > Math.PI ? 1 : 0;
      var d1 = r > 0
        ? "M" + x0 + "," + y0 + " A" + R + "," + R + " 0 " + big + " 1 " + x1 + "," + y1 + " L" + xi0 + "," + yi0 + " A" + r + "," + r + " 0 " + big + " 0 " + xi1 + "," + yi1 + " Z"
        : "M" + cx + "," + cy + " L" + x0 + "," + y0 + " A" + R + "," + R + " 0 " + big + " 1 " + x1 + "," + y1 + " Z";
      var p = S("path", { d: d1, fill: col, stroke: PDC.cssvar("--panel-bg"), "stroke-width": 2 });
      _tip(p, "<b>" + d.label + "</b><br>" + fmt(d.value) + " (" + (100 * d.value / total).toFixed(1) + "%)");
      if (cfg.drill) PDC.bindDrill(p, cfg.drill, d.label);
      if (cfg.detail) PDC.bindDetail(p, cfg.detail, d.label);
      s.appendChild(p);
      if (canAnim()) { p.style.opacity = "0"; setTimeout(function () { p.style.transition = "opacity .42s ease"; p.style.opacity = "1"; }, animD(i * 45)); }
      a0 = a1;
    });
    if (r > 0) {
      s.appendChild(S("text", { x: cx, y: cy - 3, "text-anchor": "middle", class: "gauge-val", "font-size": "20" }, cfg.centerLabel || fmt(total)));
      s.appendChild(S("text", { x: cx, y: cy + 15, "text-anchor": "middle", class: "gauge-cap" }, cfg.centerCap || "Total"));
    }
    if (showLegend) {
      var lx = cx * 2 + 8, ly = cy - data.length * 9;
      data.forEach(function (d, i) {
        var yy = ly + i * 19; if (yy > h - 6) return;
        s.appendChild(S("rect", { x: lx, y: yy - 9, width: 11, height: 11, rx: 3, fill: d.color || pal[i % 10] }));
        s.appendChild(S("text", { class: "series-label", x: lx + 17, y: yy }, PDC.fmt.trunc(d.label, 22) + "  " + (100 * d.value / total).toFixed(0) + "%"));
      });
    }
  }

  /* ── Enhanced bar chart (override PDC.bars, Z8 slice 9) ──────────────────────
     Base PDC.bars (pdc-ui.js) always draws bars in row order with the value
     label permanently on, no way to change either. This override keeps the
     identical horizontal/vertical layout, gridline, and tooltip logic and adds
     cfg.sortBars (largest value first, like Donut's "Sort slices") and
     cfg.showValues (hide the value labels for a cleaner look on dense/crowded
     charts). Base kept as PDC._barsBase for reference. */
  PDC._barsBase = PDC.bars;

  PDC.bars = function (el, cfg) { reg(el, function () { _barsOpts(el, cfg); }); };

  function _barsOpts(el, cfg) {
    var data = cfg.data || [], hor = cfg.horizontal, h = cfg.height || 270;
    if (!data.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    if (cfg.sortBars) data = data.slice().sort(function (a, b) { return (+b.value || 0) - (+a.value || 0); });
    var showValues = cfg.showValues !== false;
    var o = mkSVG(el, h), s = o.s, w = o.w;
    var fmt = cfg.fmt || PDC.fmt.abbr, base = cfg.color || PDC.cssvar("--pentaho");
    var max = niceMax(Math.max.apply(null, data.map(function (d) { return +d.value || 0; })));
    var anims = [];
    if (hor) {
      var mL = cfg.labelW || 140, mR = 46, mT = 6, mB = 8, ih = h - mT - mB, n = data.length, bh = ih / n;
      for (var g = 0; g <= 4; g++) { var gx = mL + (w - mL - mR) * g / 4; s.appendChild(S("line", { class: "gridline", x1: gx, y1: mT, x2: gx, y2: mT + ih })); }
      data.forEach(function (d, i) {
        var y = mT + i * bh, bw = (w - mL - mR) * ((+d.value || 0) / max), col = d.color || base;
        var r = S("rect", { class: "bar", x: mL, y: y + bh * 0.16, width: 0, height: bh * 0.68, rx: 4, fill: col });
        _tip(r, cfg.tip ? cfg.tip(d) : ("<b>" + d.label + "</b><br>" + fmt(d.value)));
        if (cfg.drill) PDC.bindDrill(r, cfg.drill, d.label);
        if (cfg.detail) PDC.bindDetail(r, cfg.detail, d.label);
        s.appendChild(r);
        anims.push({ el: r, kind: "width", to: Math.max(1, bw), delay: animD(i * 28) });
        s.appendChild(S("text", { class: "tick", x: mL - 8, y: y + bh / 2 + 3, "text-anchor": "end" }, PDC.fmt.trunc(d.label, cfg.labelChars || 20)));
        if (showValues) s.appendChild(S("text", { class: "val-label", x: mL + bw + 6, y: y + bh / 2 + 3 }, fmt(d.value)));
      });
    } else {
      var mL2 = 46, mR2 = 10, mT2 = 10, mB2 = cfg.rotate ? 64 : 26, iw = w - mL2 - mR2, ih2 = h - mT2 - mB2, n2 = data.length, bw2 = iw / n2;
      for (var g2 = 0; g2 <= 4; g2++) { var gy = mT2 + ih2 * (1 - g2 / 4); s.appendChild(S("line", { class: "gridline", x1: mL2, y1: gy, x2: w - mR2, y2: gy }));
        s.appendChild(S("text", { class: "tick", x: mL2 - 7, y: gy + 3, "text-anchor": "end" }, fmt(max * g2 / 4))); }
      data.forEach(function (d, i) {
        var x = mL2 + i * bw2, bhh = ih2 * ((+d.value || 0) / max), col = d.color || base;
        var r = S("rect", { class: "bar", x: x + bw2 * 0.14, y: mT2 + ih2, width: bw2 * 0.72, height: 0, rx: 4, fill: col });
        _tip(r, cfg.tip ? cfg.tip(d) : ("<b>" + d.label + "</b><br>" + fmt(d.value)));
        if (cfg.drill) PDC.bindDrill(r, cfg.drill, d.label);
        if (cfg.detail) PDC.bindDetail(r, cfg.detail, d.label);
        s.appendChild(r);
        anims.push({ el: r, kind: "height", y0: mT2 + ih2, yTo: mT2 + ih2 - bhh, to: Math.max(1, bhh), delay: animD(i * 28) });
        var lx = x + bw2 / 2, ty = mT2 + ih2 + 13;
        var tx = S("text", { class: "tick", x: lx, y: ty, "text-anchor": cfg.rotate ? "end" : "middle" }, PDC.fmt.trunc(d.label, cfg.rotate ? 16 : 10));
        if (cfg.rotate) tx.setAttribute("transform", "rotate(-38 " + lx + " " + ty + ")");
        s.appendChild(tx);
      });
    }
    function apply(a) {
      if (a.kind === "width") a.el.setAttribute("width", a.to);
      else { a.el.setAttribute("y", a.yTo); a.el.setAttribute("height", a.to); }
    }
    if (canAnim()) {
      var dur = animD(280) + "ms ease-out";
      anims.forEach(function (a) {
        setTimeout(function () {
          a.el.style.transition = a.kind === "width" ? ("width " + dur) : ("y " + dur + ", height " + dur);
          apply(a);
        }, a.delay);
      });
    } else {
      anims.forEach(apply);
    }
  }

  /* ── Enhanced stacked bar chart (override PDC.stacked, Z8 slice 10) ──────────
     Base PDC.stacked (pdc-ui.js) always draws categories in row order with no
     per-segment value text and a fixed static legend. This override keeps the
     identical band-stacking/gridline/tooltip logic and adds cfg.sortStack
     (order categories by their total, largest first — mirrors Bars' "Sort by
     value") and cfg.showValues (per-segment value label centered in its band,
     shown only when the band is tall enough to hold it legibly). Base kept as
     PDC._stackedBase for reference. */
  PDC._stackedBase = PDC.stacked;

  PDC.stacked = function (el, cfg) { reg(el, function () { _stackedOpts(el, cfg); }); };

  function _stackedOpts(el, cfg) {
    var cats = cfg.categories || [], series = cfg.series || [], h = cfg.height || 270;
    if (!cats.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    var totals0 = cats.map(function (_, i) { return series.reduce(function (a, se) { return a + (+se.values[i] || 0); }, 0); });
    var order = cats.map(function (_, i) { return i; });
    if (cfg.sortStack) order.sort(function (a, b) { return totals0[b] - totals0[a]; });
    var cats2 = order.map(function (i) { return cats[i]; });
    var series2 = series.map(function (se) { return { name: se.name, color: se.color, values: order.map(function (i) { return se.values[i]; }) }; });
    var totals = order.map(function (i) { return totals0[i]; });
    var o = mkSVG(el, h), s = o.s, w = o.w, fmt = cfg.fmt || PDC.fmt.abbr;
    var max = niceMax(Math.max.apply(null, totals.concat([0]))), pal = PDC.palette();
    var mL = 46, mR = 10, mT = 10, mB = cfg.rotate ? 64 : 26, iw = w - mL - mR, ih = h - mT - mB, bw = iw / cats2.length;
    for (var g = 0; g <= 4; g++) {
      var gy = mT + ih * (1 - g / 4);
      s.appendChild(S("line", { class: "gridline", x1: mL, y1: gy, x2: w - mR, y2: gy }));
      s.appendChild(S("text", { class: "tick", x: mL - 7, y: gy + 3, "text-anchor": "end" }, fmt(max * g / 4)));
    }
    cats2.forEach(function (c, i) {
      var x = mL + i * bw, acc = 0;
      series2.forEach(function (se, si) {
        var v = +se.values[i] || 0; if (v <= 0) return;
        var hh = ih * (v / max), y0 = mT + ih - acc - hh, col = se.color || pal[si % 10];
        acc += hh;
        var r = S("rect", { class: "bar", x: x + bw * 0.14, y: y0, width: bw * 0.72, height: hh, fill: col });
        _tip(r, "<b>" + c + "</b><br>" + se.name + ": " + fmt(v));
        s.appendChild(r);
        if (cfg.showValues && hh >= 14) s.appendChild(S("text", { class: "val-label", x: x + bw / 2, y: y0 + hh / 2 + 4, "text-anchor": "middle" }, fmt(v)));
      });
      var lx = x + bw / 2, ty = mT + ih + 13;
      var tx = S("text", { class: "tick", x: lx, y: ty, "text-anchor": cfg.rotate ? "end" : "middle" }, PDC.fmt.trunc(c, cfg.rotate ? 16 : 10));
      if (cfg.rotate) tx.setAttribute("transform", "rotate(-38 " + lx + " " + ty + ")");
      s.appendChild(tx);
    });
    if (cfg.legend !== false) {
      var d = document.createElement("div"); d.className = "legend";
      series2.forEach(function (se, i) {
        var chip = document.createElement("span"); chip.className = "legend-item";
        chip.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
        var dot = document.createElement("span");
        dot.style.cssText = "display:inline-block;width:9px;height:9px;border-radius:2px;background:" + (se.color || pal[i % 10]) + ";";
        chip.appendChild(dot); chip.appendChild(document.createTextNode(se.name || ("Series " + (i + 1))));
        d.appendChild(chip);
      });
      el.appendChild(d);
    }
  }

  /* ---------- parallel coordinates chart (multi-dimensional entity comparison) ----------
     Each entity (row) is drawn as a polyline connecting its values across N parallel
     vertical axes. Each axis represents one numeric dimension and has its own min/max
     scale so dimensions with very different ranges (e.g. revenue + margin% + headcount)
     all fill the same vertical space. Hover highlights a single entity and dims others,
     making individual profiles easy to trace. Great for portfolio analysis, product
     comparisons, and any dataset where you want to compare many entities across many
     metrics simultaneously.

     cfg.labels  — entity names (one per row, drives color + tooltip)
     cfg.axes    — [{name, values[]}] one entry per dimension; values.length = n entities
     cfg.opacity — line opacity 0-100 (default 70)
     cfg.height  — SVG height in px (default 320)
     cfg.fmt     — value formatter function
  ------------------------------------------------------------------------------ */
  PDC.parallelCoords = function (el, cfg) { reg(el, function () { _pc(el, cfg); }); };
  function _pc(el, cfg) {
    var labels = cfg.labels || [], axes = cfg.axes || [], h = cfg.height || 320;
    if (!labels.length || !axes.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    var n = labels.length, nAxes = axes.length;
    var P = PDC.palette(), fmt = cfg.fmt || PDC.fmt.abbr;
    var baseOp = Math.min(100, Math.max(5, cfg.opacity != null ? +cfg.opacity : 70)) / 100;

    var o = mkSVG(el, h), s = o.s, w = o.w;
    var mL = 10, mR = 10, mT = 34, mB = 18;
    var iw = w - mL - mR, ih = h - mT - mB;

    // X position of each axis (evenly spaced across the plot area)
    var axX = axes.map(function (_, i) { return mL + (nAxes <= 1 ? iw / 2 : i * iw / (nAxes - 1)); });

    // Per-axis min/max for scaling (guard against empty or all-zero axes)
    var axMins = axes.map(function (a) { return a.values.length ? Math.min.apply(null, a.values) : 0; });
    var axMaxs = axes.map(function (a, i) {
      var mx = a.values.length ? Math.max.apply(null, a.values) : 1;
      return mx > axMins[i] ? mx : axMins[i] + 1;
    });

    // Scale value → y coordinate for a given axis index
    function yAt(ai, v) {
      var rng = axMaxs[ai] - axMins[ai] || 1;
      return mT + ih * (1 - (+v - axMins[ai]) / rng);
    }

    // Draw axis lines, min/max tick labels, and dimension name labels
    axes.forEach(function (ax, ai) {
      var x = axX[ai];
      s.appendChild(S("line", { class: "gridline", x1: x, y1: mT, x2: x, y2: mT + ih }));
      s.appendChild(S("text", { class: "tick", x: x, y: mT + ih + 13, "text-anchor": "middle" }, fmt(axMins[ai])));
      s.appendChild(S("text", { class: "tick", x: x, y: mT - 5, "text-anchor": "middle" }, fmt(axMaxs[ai])));
      var nm = S("text", { class: "tick", x: x, y: mT - 18, "text-anchor": "middle" });
      nm.style.cssText = "font-weight:600;font-size:9px;fill:var(--text-primary,#2c3e50)";
      nm.textContent = PDC.fmt.trunc(ax.name || ("Axis " + (ai + 1)), 13);
      s.appendChild(nm);
    });

    // Draw one polyline per entity
    var lineEls = labels.map(function (label, li) {
      var col = P[li % P.length] || "#005bb5";
      var pts = axes.map(function (ax, ai) {
        return axX[ai].toFixed(1) + "," + yAt(ai, ax.values[li] != null ? ax.values[li] : 0).toFixed(1);
      }).join(" ");
      var line = S("polyline", { points: pts, fill: "none", stroke: col,
        "stroke-width": 1.8, "stroke-linejoin": "round", "stroke-linecap": "round",
        opacity: baseOp.toFixed(2) });
      s.appendChild(line);
      return line;
    });

    // Hover: highlight the hovered entity, dim the rest. Tooltip shows all axis values.
    lineEls.forEach(function (line, li) {
      var label = labels[li];
      line.addEventListener("mousemove", function (e) {
        lineEls.forEach(function (el2, j) {
          el2.style.opacity = j === li ? "1" : "0.07";
          el2.setAttribute("stroke-width", j === li ? "2.6" : "1");
        });
        var tip = "<b>" + label + "</b>";
        axes.forEach(function (ax) { tip += "<br>" + ax.name + ": " + fmt(ax.values[li] != null ? ax.values[li] : 0); });
        PDC.showTip(e, tip);
      });
      line.addEventListener("mouseleave", function () {
        lineEls.forEach(function (el2) {
          el2.style.opacity = baseOp.toFixed(2);
          el2.setAttribute("stroke-width", "1.8");
        });
        PDC.hideTip();
      });
    });

    // Dots at each axis intersection (only for ≤12 entities to avoid visual noise)
    if (n <= 12) {
      labels.forEach(function (label, li) {
        var col = P[li % P.length] || "#005bb5";
        axes.forEach(function (ax, ai) {
          var dot = S("circle", { cx: axX[ai].toFixed(1), cy: yAt(ai, ax.values[li] != null ? ax.values[li] : 0).toFixed(1),
            r: 3.5, fill: col, stroke: PDC.cssvar("--panel-bg"), "stroke-width": 1.2, opacity: baseOp.toFixed(2) });
          s.appendChild(dot);
          if (canAnim()) {
            dot.style.opacity = "0";
            setTimeout(function () { dot.style.transition = "opacity .38s ease"; dot.style.opacity = baseOp.toFixed(2); }, animD(60 + li * 30));
          }
        });
      });
    }

    // Entrance animation: lines fade in staggered
    if (canAnim()) {
      lineEls.forEach(function (line, i) {
        line.style.opacity = "0";
        setTimeout(function () { line.style.transition = "opacity .38s ease"; line.style.opacity = baseOp.toFixed(2); }, animD(40 + i * 28));
      });
    }
  }

  /* ---------- candlestick / OHLC chart ----------------------------------------
     Financial-style open-high-low-close candle chart. Each period provides four
     numeric values bound via openCol / highCol / lowCol / closeCol. The candle
     BODY spans [open, close] (green = bullish: close ≥ open; red = bearish:
     close < open). Thin WICKS extend from the body to the high (above) and low
     (below) extremes of the period. Ideal for revenue ranges, daily/weekly price
     data, performance spread, or any measure where a four-point summary per
     period communicates more than a single value. CDF-only; no direct CCC
     equivalent in CDE.

     cfg.rows    — [{label, open, high, low, close}] one per x-axis period
     cfg.upColor   — fill color for bullish candles (close ≥ open); default green
     cfg.downColor — fill color for bearish candles (close < open); default red
     cfg.fmt       — value formatter function
     cfg.height    — SVG height in px (default 320)
  ------------------------------------------------------------------------------ */
  PDC.candlestick = function (el, cfg) { reg(el, function () { _cstick(el, cfg); }); };
  function _cstick(el, cfg) {
    var rows = cfg.rows || [], h = cfg.height || 320;
    if (!rows.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }

    var upColor   = cfg.upColor   ? (PDC.cssvar ? (/^--/.test(cfg.upColor)   ? PDC.cssvar(cfg.upColor)   : cfg.upColor)   : cfg.upColor)   : "#27ae60";
    var downColor = cfg.downColor ? (PDC.cssvar ? (/^--/.test(cfg.downColor) ? PDC.cssvar(cfg.downColor) : cfg.downColor) : cfg.downColor) : "#e74c3c";
    var fmt = cfg.fmt || PDC.fmt.abbr;

    // Y-scale from the full O/H/L/C data range
    var allVals = [];
    rows.forEach(function (r) {
      [r.open, r.high, r.low, r.close].forEach(function (v) { if (v != null) allVals.push(+v); });
    });
    if (!allVals.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    var yMin = Math.min.apply(null, allVals), yMax = Math.max.apply(null, allVals);
    if (yMin === yMax) { yMax = yMin + 1; }
    var yPad = (yMax - yMin) * 0.08;
    yMin -= yPad; yMax += yPad;

    var o = mkSVG(el, h), s = o.s, w = o.w;
    var mL = 10, mR = 46, mT = 18, mB = 28;
    var iw = w - mL - mR, ih = h - mT - mB;
    var n = rows.length;
    var slotW = iw / Math.max(n, 1);
    // Body width: at most 60% of slot, capped at 32px, at least 3px
    var bodyW = Math.max(3, Math.min(slotW * 0.60, 32));

    function yAt(v) { return mT + ih * (1 - (+v - yMin) / (yMax - yMin)); }

    // Subtle grid lines + right-side y-axis labels
    var nLines = 4;
    for (var gi = 0; gi <= nLines; gi++) {
      var gv = yMin + (yMax - yMin) * gi / nLines;
      var gy = yAt(gv);
      s.appendChild(S("line", { class: "gridline", x1: mL, y1: gy.toFixed(1), x2: w - mR, y2: gy.toFixed(1) }));
      var gt = S("text", { class: "tick", x: (w - mR + 4).toFixed(1), y: gy.toFixed(1), "text-anchor": "start", "dominant-baseline": "middle" });
      gt.textContent = fmt(gv);
      s.appendChild(gt);
    }

    // Draw candles and collect body rects for animation
    var bodyRects = [];
    rows.forEach(function (r, i) {
      var cx    = mL + (i + 0.5) * slotW;
      var open  = +r.open  || 0, high  = +r.high  || 0;
      var low   = +r.low   || 0, close = +r.close || 0;
      var bullish = close >= open;
      var col   = bullish ? upColor : downColor;

      var yO = yAt(open), yH = yAt(high), yL = yAt(low), yC = yAt(close);
      var yBodyT = Math.min(yO, yC);
      var yBodyB = Math.max(yO, yC);
      var bodyH  = Math.max(1.5, yBodyB - yBodyT);

      // Upper wick: body-top → high
      s.appendChild(S("line", { x1: cx.toFixed(1), y1: yH.toFixed(1), x2: cx.toFixed(1), y2: yBodyT.toFixed(1),
        stroke: col, "stroke-width": 1.4, "stroke-linecap": "round" }));
      // Lower wick: body-bottom → low
      s.appendChild(S("line", { x1: cx.toFixed(1), y1: yBodyB.toFixed(1), x2: cx.toFixed(1), y2: yL.toFixed(1),
        stroke: col, "stroke-width": 1.4, "stroke-linecap": "round" }));
      // Candle body
      var body = S("rect", {
        x: (cx - bodyW / 2).toFixed(1), y: yBodyT.toFixed(1),
        width: bodyW.toFixed(1), height: bodyH.toFixed(1),
        rx: 1.5, fill: col, opacity: bullish ? "0.82" : "0.88",
        stroke: col, "stroke-width": "0.8"
      });
      s.appendChild(body);
      bodyRects.push(body);

      // X-axis label (period name, truncated)
      var lbl = S("text", { class: "tick", x: cx.toFixed(1), y: (h - mB + 13).toFixed(1), "text-anchor": "middle" });
      lbl.textContent = PDC.fmt.trunc(String(r.label || ""), 6);
      s.appendChild(lbl);

      // Transparent hit area + tooltip
      var hit = S("rect", { x: (mL + i * slotW).toFixed(1), y: mT, width: slotW.toFixed(1), height: ih,
        fill: "transparent", style: "cursor:crosshair" });
      hit.addEventListener("mousemove", function (e) {
        PDC.showTip(e, "<b>" + (r.label || "") + "</b><br>" +
          "O: " + fmt(open) + " &nbsp;H: " + fmt(high) + "<br>" +
          "L: " + fmt(low)  + " &nbsp;C: " + fmt(close) +
          " &nbsp;<span style='color:" + col + "'>" + (bullish ? "▲" : "▼") + "</span>");
      });
      hit.addEventListener("mouseleave", PDC.hideTip);
      s.appendChild(hit); // must be last for event capture
    });

    // Entrance animation: body rects scale vertically from their midpoint
    if (canAnim()) {
      bodyRects.forEach(function (rect, i) {
        rect.style.opacity = "0";
        setTimeout(function () { rect.style.transition = "opacity .25s ease"; rect.style.opacity = String(parseFloat(rect.getAttribute("opacity")) || 0.85); }, animD(50 + i * 35));
      });
    }
  }

  /* ── Waffle chart ─────────────────────────────────────────────────────────────
     A 10×10 grid of small squares (100 cells total) where cells are colored by
     category in proportion to each category's share of the total. Perfect for
     "1 in N" storytelling: each square = 1% of the whole. Hover tooltips show
     category, count, and percentage.
     CDF-only (no CCC equivalent). labelCol + valueCol binding.
     Inspired by Washington Post / NYT waffle chart style.
     Rows fill left-to-right, top-to-bottom; 10 columns (configurable via cfg.cols).
     Each category gets a color from the PDC palette; the final cell counts are
     rounded so the grid always totals exactly cols×cols cells. */
  PDC.waffle = function (el, cfg) {
    var data = cfg.data || [];
    if (!data.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    var cols = cfg.cols || 10;
    var total = data.reduce(function (s, d) { return s + Math.abs(d.value || 0); }, 0);
    if (!total) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    var h = cfg.height || 300;
    var w = W(el);
    // Determine legend placement: if wide enough, show legend on the right; else below
    var legendW = 140, gap = 12;
    var gridW = Math.min(w - (w > 400 ? legendW + gap : 0), h, 320);
    var side = Math.floor(gridW / cols) - 1;         // cell size in px
    var pad = 2;                                      // gap between cells
    var cellSz = side - pad;
    var realGridW = cols * side;

    // Assign cell counts per category (round-to-nearest, then adjust for total = cols²)
    var cells = data.map(function (d) {
      return { label: d.label || "", value: +d.value || 0, exact: (Math.abs(+d.value || 0) / total) * (cols * cols) };
    });
    var floored = cells.map(function (c) { return Math.floor(c.exact); });
    var allocated = floored.reduce(function (s, n) { return s + n; }, 0);
    var remainder = (cols * cols) - allocated;
    var errors = cells.map(function (c, i) { return { i: i, err: c.exact - floored[i] }; })
      .sort(function (a, b) { return b.err - a.err; });
    errors.slice(0, remainder).forEach(function (e) { floored[e.i]++; });

    // Build flat label array (one entry per cell in order)
    var flatLabels = [];
    cells.forEach(function (c, ci) {
      for (var j = 0; j < floored[ci]; j++) flatLabels.push({ label: c.label, ci: ci });
    });

    // SVG grid
    el.innerHTML = "";
    var palette = PDC.S && PDC.S.palArr ? PDC.S.palArr() : ["#005bb5","#7d3c98","#2e8bd0","#00a39a","#e67e22","#e74c3c","#27ae60","#f1c40f","#8e44ad","#2c3e50"];
    var wrapper = document.createElement("div");
    wrapper.style.cssText = "display:flex;align-items:flex-start;gap:" + gap + "px;flex-wrap:wrap;width:100%";

    var svgNS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", realGridW);
    svg.setAttribute("height", cols * side);
    svg.setAttribute("viewBox", "0 0 " + realGridW + " " + (cols * side));
    svg.style.cssText = "flex-shrink:0;display:block";

    // Tooltip reference
    var hoverCells = [];
    flatLabels.forEach(function (info, idx) {
      var row = Math.floor(idx / cols), col2 = idx % cols;
      var x = col2 * side, y = row * side;
      var color = palette[info.ci % palette.length];
      var rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", x + pad); rect.setAttribute("y", y + pad);
      rect.setAttribute("width", cellSz); rect.setAttribute("height", cellSz);
      rect.setAttribute("rx", Math.max(1, cellSz * 0.12));
      rect.setAttribute("fill", color);
      rect.style.cursor = "default";
      svg.appendChild(rect);
      hoverCells.push({ rect: rect, label: info.label, ci: info.ci });
    });

    // Delegated hover tooltip on the SVG
    svg.addEventListener("mousemove", function (e) {
      var svgRect = svg.getBoundingClientRect();
      var mx = e.clientX - svgRect.left, my = e.clientY - svgRect.top;
      var col2 = Math.floor(mx / side), row = Math.floor(my / side);
      var idx = row * cols + col2;
      if (idx < 0 || idx >= flatLabels.length) { PDC.hideTip(); return; }
      var info = flatLabels[idx];
      var cnt = floored[info.ci];
      var pct = ((cnt / (cols * cols)) * 100).toFixed(1);
      PDC.showTip(e, "<strong>" + info.label + "</strong><br>" + cnt + " cells · " + pct + "%");
    });
    svg.addEventListener("mouseleave", PDC.hideTip);

    // Legend
    var legend = document.createElement("div");
    legend.style.cssText = "display:flex;flex-direction:column;gap:5px;padding-top:4px;min-width:100px;max-width:" + legendW + "px";
    cells.forEach(function (c, ci) {
      var row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:6px;font-size:11.5px;font-family:var(--sans,sans-serif);color:var(--fg,#1a2236)";
      var swatch = document.createElement("span");
      swatch.style.cssText = "flex-shrink:0;width:11px;height:11px;border-radius:2px;background:" + palette[ci % palette.length];
      var pct = ((floored[ci] / (cols * cols)) * 100).toFixed(1);
      row.appendChild(swatch);
      row.appendChild(document.createTextNode(c.label + " (" + pct + "%)"));
      legend.appendChild(row);
    });

    wrapper.appendChild(svg); wrapper.appendChild(legend);
    el.appendChild(wrapper);

    // Entrance animation: cells fade in left-to-right, top-to-bottom, staggered
    if (canAnim()) {
      hoverCells.forEach(function (hc, i) {
        hc.rect.style.opacity = "0";
        setTimeout(function () {
          hc.rect.style.transition = "opacity .18s ease";
          hc.rect.style.opacity = "1";
        }, animD(i * 8));
      });
    }
  };

  /* ── Timeline / milestone chart ──────────────────────────────────────────────
     A horizontal baseline with diamond markers at regular intervals — classic
     "alternating timeline" layout used for product roadmaps, project milestones,
     and historical event sequences. Markers alternate above and below the
     baseline so labels never overlap. Optional per-event date labels appear on
     the opposite side of the baseline from each event's stalk.

     cfg.events  = [{label, date?, color?}] — one entry per milestone
     cfg.height  = chart height in px (default 220)

     CDF-only (no CCC equivalent). labelCol binding required; dateCol optional.
     PDC.timeline is a studio-charts.js extension; pdc-ui.js stays pristine. */
  PDC.timeline = function (el, cfg) {
    var events = cfg.events || [];
    if (!events.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }

    var h      = cfg.height || 220;
    var elW    = W(el) || 520;
    var padX   = 36;
    var n      = events.length;
    var midY   = Math.round(h / 2);
    // Stalk height: distance from baseline to label. Scales down if many events.
    var stalkH = Math.min(72, Math.max(32, (h / 2) - 28));

    var palette = PDC.S && PDC.S.palArr ? PDC.S.palArr()
      : ["#005bb5","#7d3c98","#2e8bd0","#00a39a","#e67e22","#e74c3c","#27ae60","#f1c40f"];

    var svgNS = "http://www.w3.org/2000/svg";
    var svg   = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width",   "100%");
    svg.setAttribute("height",  h);
    svg.setAttribute("viewBox", "0 0 " + elW + " " + h);
    svg.style.cssText = "display:block;overflow:visible";

    // Horizontal baseline
    var bl = document.createElementNS(svgNS, "line");
    bl.setAttribute("x1", padX);    bl.setAttribute("y1", midY);
    bl.setAttribute("x2", elW - padX); bl.setAttribute("y2", midY);
    bl.setAttribute("stroke", "var(--bor,#cdd2e4)"); bl.setAttribute("stroke-width", "2");
    svg.appendChild(bl);

    var toAnimate = [];

    events.forEach(function (ev, i) {
      // Even-indexed events rise above the baseline; odd fall below.
      var above  = (i % 2 === 0);
      var dir    = above ? -1 : 1;   // -1 = up, +1 = down
      var color  = ev.color || palette[i % palette.length];
      var x      = n === 1
        ? padX + (elW - 2 * padX) / 2
        : padX + i * ((elW - 2 * padX) / (n - 1));
      x = Math.round(x);

      // Stalk — dashed line from baseline to label zone
      var stalkY1 = midY + dir * 7;
      var stalkY2 = midY + dir * (stalkH - 8);
      var stalk = document.createElementNS(svgNS, "line");
      stalk.setAttribute("x1", x); stalk.setAttribute("y1", stalkY1);
      stalk.setAttribute("x2", x); stalk.setAttribute("y2", stalkY2);
      stalk.setAttribute("stroke", color); stalk.setAttribute("stroke-width", "1.4");
      stalk.setAttribute("opacity", "0.6");
      svg.appendChild(stalk);
      toAnimate.push(stalk);

      // Diamond marker sitting on the baseline
      var ds = 5.5;
      var pts = [
        x + ","+  (midY - ds),
        (x + ds) + "," + midY,
        x + ","  + (midY + ds),
        (x - ds) + "," + midY
      ].join(" ");
      var dia = document.createElementNS(svgNS, "polygon");
      dia.setAttribute("points", pts);
      dia.setAttribute("fill", color);
      dia.setAttribute("stroke", "var(--bg,#fff)");
      dia.setAttribute("stroke-width", "1.5");
      dia.style.cursor = "crosshair";
      dia.addEventListener("mousemove", function (e) {
        PDC.showTip(e, "<b>" + ev.label + "</b>" +
          (ev.date ? "<br><span style='opacity:.75'>" + ev.date + "</span>" : ""));
      });
      dia.addEventListener("mouseleave", PDC.hideTip);
      svg.appendChild(dia);
      toAnimate.push(dia);

      // Event label (above or below the stalk tip)
      var lblY = midY + dir * stalkH + dir * 12;
      var lbl  = document.createElementNS(svgNS, "text");
      lbl.setAttribute("x", x); lbl.setAttribute("y", lblY);
      lbl.setAttribute("text-anchor", "middle");
      lbl.setAttribute("font-size", "10.5");
      lbl.setAttribute("font-weight", "600");
      lbl.setAttribute("font-family", "var(--sans,sans-serif)");
      lbl.setAttribute("fill", color);
      lbl.textContent = PDC.fmt.trunc(String(ev.label || ""), 15);
      svg.appendChild(lbl);
      toAnimate.push(lbl);

      // Optional date / period label — appears on the opposite side of the baseline
      if (ev.date) {
        var dateY = midY + (-dir) * 13; // flip side
        var dtEl  = document.createElementNS(svgNS, "text");
        dtEl.setAttribute("x", x); dtEl.setAttribute("y", dateY);
        dtEl.setAttribute("text-anchor", "middle");
        dtEl.setAttribute("font-size", "8.5");
        dtEl.setAttribute("font-family", "var(--sans,sans-serif)");
        dtEl.setAttribute("fill", "var(--muted,#8899aa)");
        dtEl.textContent = PDC.fmt.trunc(String(ev.date), 12);
        svg.appendChild(dtEl);
      }
    });

    el.innerHTML = "";
    el.appendChild(svg);

    // Entrance animation: stalks, diamonds, and labels fade in left-to-right
    if (canAnim()) {
      toAnimate.forEach(function (node, i) {
        node.style.opacity = "0";
        setTimeout(function () {
          node.style.transition = "opacity .22s ease";
          node.style.opacity    = "1";
        }, animD(i * 38));
      });
    }
  };

  /* ── Radial bar chart ────────────────────────────────────────────────────────
     Concentric arc tracks where each arc length encodes a category's value.
     All arcs start at 12 o'clock and sweep clockwise up to 270°. Categories are
     sorted largest-first so the longest arc is on the outermost (most prominent)
     track — giving an immediate visual hierarchy at a glance.

     cfg: { data:[{label,value}], fmt, maxVal, height }
     CDF-only (no CCC/CDE equivalent). PDC.radialBar lives in studio-charts.js. */
  PDC.radialBar = function (el, cfg) {
    if (!el) return;
    var data = (cfg.data || []).filter(function (d) { return d.label; });
    if (!data.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    var n    = Math.min(data.length, 12);
    data = data.slice(0, n);

    var fmtFn  = (PDC.fmt && PDC.fmt[cfg.fmt || "abbr"]) || function (v) { return String(v); };
    var maxVal = (cfg.maxVal && +cfg.maxVal > 0) ? +cfg.maxVal
                 : Math.max.apply(null, data.map(function (d) { return +d.value || 0; })) || 1;

    var totalH = cfg.height || 320;
    var w = W(el);

    // Reserve space for a compact legend below the circular area
    var LEGEND_LINE = 16, LEG_COLS = Math.min(n, 4);
    var legendRows  = Math.ceil(n / LEG_COLS);
    var legendH     = legendRows * LEGEND_LINE + 8;
    var circH       = totalH - legendH;
    var cx = w / 2, cy = circH / 2;
    var MARGIN = 14;
    var maxR = Math.max(10, Math.min(cx - MARGIN, cy - MARGIN));

    // Lay out n concentric tracks evenly from outermost (maxR) to innermost (18% of maxR)
    var innerR    = maxR * 0.18;
    var trackSpan = maxR - innerR;
    var trackStep = trackSpan / n;
    // trackH sized to fill ~70% of the step, leaving a visible gap between rings
    var trackH = Math.min(18, Math.max(4, trackStep * 0.68));

    // Sort: largest value → outermost track (rank 0)
    var sorted = data.map(function (d, i) { return { label: d.label, value: +d.value || 0, origIdx: i }; })
                 .sort(function (a, b) { return b.value - a.value; });

    // Arc geometry: arcs start at 12 o'clock (–π/2) and sweep clockwise up to 270° (1.5π)
    var A0       = -Math.PI / 2;
    var SWEEP270 =  1.5 * Math.PI;

    // arc path from a0 to a0+sweep on a circle of radius r centred at (cx,cy)
    function arcPath(r, sweep) {
      var a1 = A0 + sweep;
      // Clamp to just under 360° so SVG arc doesn't collapse to a point
      if (sweep >= 2 * Math.PI) { a1 = A0 + 2 * Math.PI - 0.001; }
      var x0 = cx + r * Math.cos(A0),  y0 = cy + r * Math.sin(A0);
      var x1 = cx + r * Math.cos(a1),  y1 = cy + r * Math.sin(a1);
      var lg = sweep > Math.PI ? 1 : 0;
      return 'M' + x0.toFixed(2) + ',' + y0.toFixed(2) +
             ' A' + r.toFixed(2) + ',' + r.toFixed(2) + ' 0 ' + lg + ' 1 ' +
             x1.toFixed(2) + ',' + y1.toFixed(2);
    }

    var svgNS = 'http://www.w3.org/2000/svg';

    var svg = S('svg', { width: '100%', height: totalH,
                          viewBox: '0 0 ' + w + ' ' + totalH });

    sorted.forEach(function (d, rank) {
      // Track centerline radius: rank 0 = outermost = maxR, rank n-1 = innermost ≈ innerR
      var rMid  = maxR - rank * trackStep - trackH / 2;
      var color = PDC.color(d.origIdx);
      var sweep = SWEEP270 * (d.value / maxVal);

      // Ghost background arc (full 270°, very faint)
      var ghost = S('path', {
        d: arcPath(rMid, SWEEP270),
        fill: 'none', stroke: color,
        'stroke-opacity': '0.1',
        'stroke-width': trackH,
        'stroke-linecap': 'round'
      });
      svg.appendChild(ghost);

      // Value arc
      if (sweep > 0.01) {
        var valArc = S('path', {
          fill: 'none', stroke: color,
          'stroke-width': trackH,
          'stroke-linecap': 'round',
          style: 'cursor:pointer;'
        });

        // Animated entrance: arc grows from near-zero to its final sweep angle
        if (canAnim()) {
          valArc.setAttribute('d', arcPath(rMid, 0.001));
          svg.appendChild(valArc);
          setTimeout((function (arc, r, finalSweep) {
            return function () {
              var t0 = null, dur = animD(700);
              requestAnimationFrame(function step(ts) {
                if (!t0) t0 = ts;
                var p    = Math.min((ts - t0) / dur, 1);
                var ease = 1 - Math.pow(1 - p, 3); // ease-out-cubic
                arc.setAttribute('d', arcPath(r, finalSweep * ease));
                if (p < 1) requestAnimationFrame(step);
              });
            };
          })(valArc, rMid, sweep), rank * animD(55));
        } else {
          valArc.setAttribute('d', arcPath(rMid, sweep));
          svg.appendChild(valArc);
        }

        // Native tooltip (<title>) for mouse hover
        var tip = document.createElementNS(svgNS, 'title');
        tip.textContent = d.label + ': ' + fmtFn(d.value);
        valArc.appendChild(tip);

        // Value label near the arc tip when the sweep is wide enough to avoid overlap
        if (sweep > SWEEP270 * 0.2) {
          var tipAng = A0 + sweep;
          var lr = rMid + trackH / 2 + 5;
          var lx = cx + lr * Math.cos(tipAng), ly = cy + lr * Math.sin(tipAng);
          var anchor = lx < cx - 4 ? 'end' : lx > cx + 4 ? 'start' : 'middle';
          var vt = S('text', {
            x: lx.toFixed(1), y: (ly + 3.5).toFixed(1),
            'font-size': '9', 'text-anchor': anchor, fill: color
          });
          vt.textContent = fmtFn(d.value);
          svg.appendChild(vt);
        }
      }
    });

    // Legend: one row per set of LEG_COLS items, below the circular area
    var colW = Math.floor(w / LEG_COLS);
    sorted.forEach(function (d, rank) {
      var col = rank % LEG_COLS;
      var row = Math.floor(rank / LEG_COLS);
      var lx  = col * colW + 6;
      var ly  = circH + 8 + row * LEGEND_LINE + 10;
      var color = PDC.color(d.origIdx);
      var dot   = S('circle', { cx: lx + 4, cy: ly - 1, r: 4, fill: color });
      svg.appendChild(dot);
      var label = d.label.length > 17 ? d.label.slice(0, 15) + '…' : d.label;
      var txt   = S('text', {
        x: lx + 11, y: ly + 3, 'font-size': '10',
        fill: 'currentColor', 'text-anchor': 'start'
      });
      txt.textContent = label;
      svg.appendChild(txt);
    });

    el.innerHTML = '';
    el.appendChild(svg);
  };

  /* ---------- Population Pyramid (pyramidBar) — F31 ----------------------------
     Back-to-back horizontal bar chart: left bars extend leftward, right bars
     extend rightward from a shared centre column of category labels.  Classic
     layout for demographic data (age × gender), A/B comparisons, or any
     side-by-side magnitude comparison with a shared axis.

     cfg: { rows:[{label,left,right}], leftLabel, rightLabel,
            leftColor, rightColor, fmt, height }
     CDF-only (no CCC/CDE equivalent). PDC.pyramidBar lives in studio-charts.js. */
  PDC.pyramidBar = function (el, cfg) {
    if (!el) return;
    var rows = (cfg.rows || []).filter(function (r) { return r.label; });
    if (!rows.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }

    var fmtFn      = (PDC.fmt && PDC.fmt[cfg.fmt || "abbr"]) || function (v) { return String(v); };
    var leftLabel  = cfg.leftLabel  || "Left";
    var rightLabel = cfg.rightLabel || "Right";
    // Colors arrive as pre-resolved strings (hex/rgb) from studio-render.js color() helper,
    // or as CSS-variable tokens; fall through to palette defaults.
    function resolveColor(c, def) {
      if (!c) return def;
      if (/^--/.test(c)) return PDC.cssvar ? PDC.cssvar(c) : def;
      return c;
    }
    var leftColor  = resolveColor(cfg.leftColor,  PDC.color(1));
    var rightColor = resolveColor(cfg.rightColor, PDC.color(0));

    var totalH = cfg.height || 300;
    var w      = W(el);

    // Layout: centre label column flanked by two mirror bar zones.
    var LABEL_W  = Math.min(84, Math.max(40, Math.floor(w * 0.22)));
    var HEADER_H = 24;  // room for left/right column headers
    var barZone  = (w - LABEL_W) / 2;  // pixel width available to each side
    var maxN     = Math.min(rows.length, 40);
    rows = rows.slice(0, maxN);
    var rowH     = Math.max(16, Math.floor((totalH - HEADER_H) / rows.length));
    var actualH  = rowH * rows.length + HEADER_H;
    var barH     = Math.max(4, rowH - 4);  // bar height with 2px padding each side
    var PAD      = 2;                       // top/bottom padding within each row

    var maxVal = Math.max(
      Math.max.apply(null, rows.map(function (r) { return +r.left  || 0; })),
      Math.max.apply(null, rows.map(function (r) { return +r.right || 0; }))
    ) || 1;
    var BAR_MAX = barZone - 6;  // leave 6px gutter between bar tip and label zone

    var svgNS = 'http://www.w3.org/2000/svg';

    var svg = S('svg', { width: '100%', height: actualH,
                          viewBox: '0 0 ' + w + ' ' + actualH });

    // Column header labels (left side / right side)
    var cx = barZone + LABEL_W / 2;
    svg.appendChild(S('text', {
      x: (barZone / 2).toFixed(1), y: '14', 'text-anchor': 'middle',
      'font-size': '10', fill: leftColor, 'font-weight': '600'
    }));
    svg.lastChild.textContent = leftLabel;

    svg.appendChild(S('text', {
      x: (barZone + LABEL_W + barZone / 2).toFixed(1), y: '14',
      'text-anchor': 'middle', 'font-size': '10', fill: rightColor, 'font-weight': '600'
    }));
    svg.lastChild.textContent = rightLabel;

    // Subtle divider lines flanking the centre label column
    svg.appendChild(S('line', {
      x1: barZone.toFixed(1), y1: '17', x2: barZone.toFixed(1), y2: String(actualH),
      stroke: 'currentColor', 'stroke-opacity': '0.13', 'stroke-width': '1'
    }));
    svg.appendChild(S('line', {
      x1: (barZone + LABEL_W).toFixed(1), y1: '17',
      x2: (barZone + LABEL_W).toFixed(1), y2: String(actualH),
      stroke: 'currentColor', 'stroke-opacity': '0.13', 'stroke-width': '1'
    }));

    rows.forEach(function (row, i) {
      var y0  = HEADER_H + i * rowH;
      var yb  = y0 + PAD;   // top of bar
      var yc  = y0 + PAD + barH / 2 + 3.5;  // vertical centre of bar (for labels)
      var lw  = Math.max(0, BAR_MAX * ((+row.left  || 0) / maxVal));
      var rw  = Math.max(0, BAR_MAX * ((+row.right || 0) / maxVal));

      // ── Left bar: extends from barZone leftward ──
      if (lw > 0.5) {
        var lBar = S('rect', {
          x: (barZone - lw).toFixed(2), y: yb.toFixed(1),
          width: lw.toFixed(2), height: barH, rx: '2', fill: leftColor
        });
        // Animated entrance: bar grows from the centre outward
        if (canAnim()) {
          lBar.setAttribute('x', barZone.toFixed(2));
          lBar.setAttribute('width', '0');
          svg.appendChild(lBar);
          setTimeout((function (bar, finalX, finalW) {
            return function () {
              var t0 = null, dur = animD(520);
              requestAnimationFrame(function step(ts) {
                if (!t0) t0 = ts;
                var p    = Math.min((ts - t0) / dur, 1);
                var ease = 1 - Math.pow(1 - p, 2);  // ease-out-quad
                var w2   = finalW * ease;
                bar.setAttribute('x',     (finalX + finalW - w2).toFixed(2));
                bar.setAttribute('width', w2.toFixed(2));
                if (p < 1) requestAnimationFrame(step);
              });
            };
          })(lBar, barZone - lw, lw), i * animD(35));
        } else {
          svg.appendChild(lBar);
        }
        var tip1 = document.createElementNS(svgNS, 'title');
        tip1.textContent = row.label + ' — ' + leftLabel + ': ' + fmtFn(+row.left);
        lBar.appendChild(tip1);

        // Value label inside bar (right-aligned near the centre edge)
        if (lw > 28) {
          var lt = S('text', {
            x: (barZone - 4).toFixed(1), y: yc.toFixed(1),
            'text-anchor': 'end', 'font-size': '8.5',
            fill: 'white', 'pointer-events': 'none'
          });
          lt.textContent = fmtFn(+row.left);
          svg.appendChild(lt);
        }
      }

      // ── Right bar: extends from (barZone + LABEL_W) rightward ──
      var rxStart = barZone + LABEL_W;
      if (rw > 0.5) {
        var rBar = S('rect', {
          x: rxStart.toFixed(2), y: yb.toFixed(1),
          width: rw.toFixed(2), height: barH, rx: '2', fill: rightColor
        });
        if (canAnim()) {
          rBar.setAttribute('width', '0');
          svg.appendChild(rBar);
          setTimeout((function (bar, finalW) {
            return function () {
              var t0 = null, dur = animD(520);
              requestAnimationFrame(function step(ts) {
                if (!t0) t0 = ts;
                var p    = Math.min((ts - t0) / dur, 1);
                var ease = 1 - Math.pow(1 - p, 2);
                bar.setAttribute('width', (finalW * ease).toFixed(2));
                if (p < 1) requestAnimationFrame(step);
              });
            };
          })(rBar, rw), i * animD(35));
        } else {
          svg.appendChild(rBar);
        }
        var tip2 = document.createElementNS(svgNS, 'title');
        tip2.textContent = row.label + ' — ' + rightLabel + ': ' + fmtFn(+row.right);
        rBar.appendChild(tip2);

        if (rw > 28) {
          var rt = S('text', {
            x: (rxStart + 4).toFixed(1), y: yc.toFixed(1),
            'text-anchor': 'start', 'font-size': '8.5',
            fill: 'white', 'pointer-events': 'none'
          });
          rt.textContent = fmtFn(+row.right);
          svg.appendChild(rt);
        }
      }

      // ── Centre category label ──
      var catStr = String(row.label);
      if (catStr.length > 9) catStr = catStr.slice(0, 8) + '…';
      var cl = S('text', {
        x: cx.toFixed(1), y: yc.toFixed(1), 'text-anchor': 'middle',
        'font-size': '9', fill: 'currentColor', 'pointer-events': 'none'
      });
      cl.textContent = catStr;
      svg.appendChild(cl);
    });

    el.innerHTML = '';
    el.appendChild(svg);
  };

  /* ── Icicle / rectangular partition chart ──────────────────────────────────
     Two-level space-filling hierarchy:
     • groupCol present → parent groups span the top 36% of height; child items fill the
       remaining 64% within each group's horizontal slice (sorted largest→leftmost).
     • No groupCol → single horizontal band of items proportional to their values.
     Colours are per-group in two-level mode, per-item in single-level mode (palette).
     Hover tooltips show name, parent group (if two-level), and formatted value.
     Animated entrance: all rectangles fade in sequentially left-to-right. */
  PDC.icicle = function (el, cfg) { reg(el, function () { _icicle(el, cfg); }); };

  function _icicle(el, cfg) {
    var rows = cfg.rows || [];
    if (!rows.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }

    var labelCol = cfg.labelCol || "";
    var groupCol = cfg.groupCol || "";
    var valueCol = cfg.valueCol || "";
    var h        = cfg.height  || 280;
    var fmtFn    = cfg.fmt     || PDC.fmt.abbr;
    var showLabels = cfg.showLabels !== false;
    var showPct    = !!cfg.showPct;
    var pal      = PDC.palette();
    var cW       = el.clientWidth || (el.parentNode && el.parentNode.clientWidth) || 640;
    var PAD      = 1.5; // gap between adjacent cells (px)

    el.innerHTML = "";
    var svg = S("svg", { viewBox: "0 0 " + cW + " " + h, width: "100%", height: h });

    var allRects = []; // collect for animation

    if (groupCol) {
      // ── Two-level icicle ─────────────────────────────────────────────────
      // Aggregate rows by groupCol
      var groupMap = {}, groupOrder = [];
      rows.forEach(function (r) {
        var g = String(r[groupCol] != null ? r[groupCol] : "Other");
        if (!groupMap[g]) { groupMap[g] = { total: 0, items: [] }; groupOrder.push(g); }
        var v = Math.max(0, +r[valueCol] || 0);
        groupMap[g].total += v;
        groupMap[g].items.push({ label: String(r[labelCol] != null ? r[labelCol] : ""), value: v });
      });

      var grandTotal = groupOrder.reduce(function (s, g) { return s + groupMap[g].total; }, 0) || 1;
      var topH = h * 0.36 - 1; // parent group row height
      var botH = h * 0.64 - 2; // child item row height
      var topY = 0;
      var botY = h * 0.36 + 2;

      var gx = 0;
      groupOrder.forEach(function (g, gi) {
        var gfrac = groupMap[g].total / grandTotal;
        var gw    = cW * gfrac;
        var color = pal[gi % pal.length];

        // Group header rectangle
        var headerRect = S("rect", {
          x: gx.toFixed(1), y: topY,
          width: Math.max(1, gw - PAD).toFixed(1), height: topH.toFixed(1),
          fill: color, rx: 3
        });
        headerRect.style.cursor = "pointer";
        headerRect.addEventListener("mousemove", function (e) {
          PDC.showTip(e, "<b>" + g + "</b><br>" + fmtFn(groupMap[g].total));
        });
        headerRect.addEventListener("mouseleave", PDC.hideTip);
        svg.appendChild(headerRect);
        allRects.push({ el: headerRect, baseOp: 1 });

        // Group label (truncated to fit cell width) — Z8 slice 17: gated by showLabels.
        if (showLabels && gw > 36) {
          var maxCh = Math.max(2, Math.floor((gw - 8) / 5.5));
          var gLbl = S("text", {
            x: (gx + gw / 2).toFixed(1), y: (topY + topH / 2 + 1).toFixed(1),
            "text-anchor": "middle", "dominant-baseline": "middle",
            fill: "#fff", "font-size": 10, "font-weight": 600, "pointer-events": "none"
          });
          gLbl.textContent = PDC.fmt.trunc(g, maxCh);
          svg.appendChild(gLbl);
        }

        // Child item rectangles (sorted largest→leftmost within the group's slice)
        var items = groupMap[g].items.slice().sort(function (a, b) { return b.value - a.value; });
        var itemTotal = groupMap[g].total || 1;
        var cx = gx;
        items.forEach(function (item, ii) {
          var iw  = gw * (item.value / itemTotal);
          // Lighter shades for smaller items so the visual hierarchy is clear
          var op  = (0.60 + 0.36 * (1 - ii / Math.max(1, items.length - 1))).toFixed(2);

          var iRect = S("rect", {
            x: cx.toFixed(1), y: botY.toFixed(1),
            width: Math.max(1, iw - PAD).toFixed(1), height: (botH - 1).toFixed(1),
            fill: color, rx: 2, opacity: op
          });
          iRect.style.cursor = "pointer";
          iRect.addEventListener("mousemove", function (e) {
            PDC.showTip(e, "<b>" + item.label + "</b><br>" + g + "<br>" + fmtFn(item.value));
          });
          iRect.addEventListener("mouseleave", PDC.hideTip);
          svg.appendChild(iRect);
          allRects.push({ el: iRect, baseOp: parseFloat(op) });

          // Item label (truncated to fit cell width) — Z8 slice 17: gated by showLabels,
          // with an optional second line ("% of total" or the raw value) when tall enough.
          if (showLabels && iw > 24) {
            var maxCi = Math.max(1, Math.floor((iw - 6) / 5));
            var twoLine = botH > 34;
            var iLbl = S("text", {
              x: (cx + iw / 2).toFixed(1), y: (twoLine ? botY + botH / 2 - 5 : botY + botH / 2 + 1).toFixed(1),
              "text-anchor": "middle", "dominant-baseline": "middle",
              fill: "#fff", "font-size": 9, "pointer-events": "none"
            });
            iLbl.textContent = PDC.fmt.trunc(item.label, maxCi);
            svg.appendChild(iLbl);
            if (twoLine) {
              var iVal = S("text", {
                x: (cx + iw / 2).toFixed(1), y: (botY + botH / 2 + 8).toFixed(1),
                "text-anchor": "middle", "dominant-baseline": "middle",
                fill: "rgba(255,255,255,.8)", "font-size": 8, "pointer-events": "none"
              });
              iVal.textContent = showPct ? (100 * item.value / grandTotal).toFixed(1) + "%" : fmtFn(item.value);
              svg.appendChild(iVal);
            }
          }
          cx += iw;
        });

        gx += gw;
      });

    } else {
      // ── Single-level icicle ──────────────────────────────────────────────
      var total = rows.reduce(function (s, r) { return s + Math.max(0, +r[valueCol] || 0); }, 0) || 1;
      var sorted = rows.slice().sort(function (a, b) { return (+b[valueCol] || 0) - (+a[valueCol] || 0); });
      var x = 0;
      sorted.forEach(function (r, ri) {
        var v  = Math.max(0, +r[valueCol] || 0);
        var rw = cW * v / total;
        var color = pal[ri % pal.length];

        var rect = S("rect", {
          x: x.toFixed(1), y: 0,
          width: Math.max(1, rw - PAD).toFixed(1), height: h,
          fill: color, rx: 3
        });
        rect.style.cursor = "pointer";
        rect.addEventListener("mousemove", function (e) {
          PDC.showTip(e, "<b>" + (r[labelCol] || "") + "</b><br>" + fmtFn(v) +
            " (" + (v / total * 100).toFixed(1) + "%)");
        });
        rect.addEventListener("mouseleave", PDC.hideTip);
        svg.appendChild(rect);
        allRects.push({ el: rect, baseOp: 1 });

        // Label (truncated to fit) — Z8 slice 17: gated by showLabels, with an optional
        // second line ("% of total" or the raw value) when the band is tall enough.
        if (showLabels && rw > 24) {
          var maxCh2 = Math.max(1, Math.floor((rw - 8) / 5.5));
          var twoLine2 = h > 44;
          var lbl = S("text", {
            x: (x + rw / 2).toFixed(1), y: (twoLine2 ? h / 2 - 5 : h / 2 + 1).toFixed(1),
            "text-anchor": "middle", "dominant-baseline": "middle",
            fill: "#fff", "font-size": 10, "font-weight": 600, "pointer-events": "none"
          });
          lbl.textContent = PDC.fmt.trunc(r[labelCol] || "", maxCh2);
          svg.appendChild(lbl);
          if (twoLine2) {
            var val2 = S("text", {
              x: (x + rw / 2).toFixed(1), y: (h / 2 + 9).toFixed(1),
              "text-anchor": "middle", "dominant-baseline": "middle",
              fill: "rgba(255,255,255,.85)", "font-size": 9, "pointer-events": "none"
            });
            val2.textContent = showPct ? (v / total * 100).toFixed(1) + "%" : fmtFn(v);
            svg.appendChild(val2);
          }
        }
        x += rw;
      });
    }

    // Animated entrance: rectangles fade in sequentially left-to-right
    if (canAnim()) {
      allRects.forEach(function (item, i) {
        item.el.style.opacity = 0;
        setTimeout(function () {
          item.el.style.transition = "opacity " + animD(280) + "ms ease";
          item.el.style.opacity = item.baseOp;
        }, animD(i * 18));
      });
    }

    el.appendChild(svg);
  }

  /* ---------- Pareto chart (F33) ─────────────────────────────────────────────
     Classic 80/20 rule visualisation: vertical bars sorted descending (largest
     leftmost) with a cumulative percentage line rising from 0 to 100% on a
     secondary right y-axis. An optional dashed 80% reference line marks the
     threshold so builders can show which vital few categories account for most
     of the total. Standard in quality management, defect analysis, customer
     complaint prioritisation, and root-cause identification.

     Data binding: cfg.data = [{label, value}] (pre-built by studio-render.js).
     Options: showRef (bool, default true), fmt (format fn), height (px).
     CDF-only (no CCC/CDE equivalent). PDC.pareto lives in studio-charts.js. */
  PDC.pareto = function (el, cfg) { reg(el, function () { _pareto(el, cfg); }); };

  function _pareto(el, cfg) {
    var data = (cfg.data || []).filter(function (d) { return d.label; });
    if (!data.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }

    // Sort descending — Pareto rule: largest category goes leftmost.
    data = data.slice().sort(function (a, b) { return b.value - a.value; });

    // Compute cumulative percentages for the line overlay.
    var total = data.reduce(function (s, d) { return s + Math.max(0, d.value); }, 0) || 1;
    var cumSum = 0;
    data = data.map(function (d) {
      cumSum += Math.max(0, d.value);
      return { label: d.label, value: d.value, cumPct: cumSum / total * 100 };
    });

    var fmtFn  = cfg.fmt    || PDC.fmt.abbr;
    var showRef = cfg.showRef !== false; // 80% dashed reference line on by default
    var h = cfg.height || 300;
    var o = mkSVG(el, h), s = o.s, w = o.w;

    // Margins: left = value axis, right = % axis, bottom = rotated x-axis labels.
    var mL = 50, mR = 36, mT = 14, mB = 42;
    var iw = w - mL - mR, ih = h - mT - mB;
    var n = data.length;
    var slotW = iw / Math.max(n, 1);
    var barW  = Math.max(4, Math.min(slotW * 0.70, 52));

    var maxVal = Math.max.apply(null, data.map(function (d) { return d.value; })) || 1;
    // Nice top for the left y-axis
    var axMax = niceMax(maxVal * 1.05);

    function yBar(v)   { return mT + ih * (1 - Math.max(0, v) / axMax); }
    function yPct(pct) { return mT + ih * (1 - pct / 100); }
    function xSlot(i)  { return mL + i * slotW; }
    function xCenter(i){ return xSlot(i) + slotW / 2; }

    var brandColor = PDC.cssvar ? PDC.cssvar("--pentaho") : "#005bb5";
    var lineColor  = "#e67e22"; // orange cumulative line — visually distinct from bars

    // ── Grid lines & left y-axis ────────────────────────────────────────────
    var nTicks = 4;
    for (var gi = 0; gi <= nTicks; gi++) {
      var gv = axMax * gi / nTicks;
      var gy = yBar(gv);
      // Grid line
      s.appendChild(S("line", { class: "gridline",
        x1: mL, y1: gy.toFixed(1), x2: w - mR, y2: gy.toFixed(1) }));
      // Left y-axis tick label
      var lt = S("text", { class: "tick", x: (mL - 5).toFixed(1), y: gy.toFixed(1),
        "text-anchor": "end", "dominant-baseline": "middle" });
      lt.textContent = fmtFn(gv);
      s.appendChild(lt);
    }

    // ── Right y-axis (0–100%) ──────────────────────────────────────────────
    // Light ticks at 0, 20, 40, 60, 80, 100% — same baseline as the left axis.
    [0, 20, 40, 60, 80, 100].forEach(function (pct) {
      var ry = yPct(pct);
      var rt = S("text", { class: "tick", x: (w - mR + 5).toFixed(1), y: ry.toFixed(1),
        "text-anchor": "start", "dominant-baseline": "middle",
        fill: lineColor, opacity: "0.75" });
      rt.textContent = pct + "%";
      s.appendChild(rt);
    });
    // Right axis label "Cumulative %" (rotated, right edge)
    var axLbl = S("text", { class: "tick",
      x: (w - 6).toFixed(1), y: (mT + ih / 2).toFixed(1),
      "text-anchor": "middle", "dominant-baseline": "middle",
      transform: "rotate(-90," + (w - 6).toFixed(1) + "," + (mT + ih / 2).toFixed(1) + ")",
      fill: lineColor, opacity: "0.65", "font-size": 9 });
    axLbl.textContent = "Cumulative %";
    s.appendChild(axLbl);

    // ── Optional 80% reference line ─────────────────────────────────────────
    if (showRef) {
      var y80 = yPct(80);
      s.appendChild(S("line", {
        x1: mL, y1: y80.toFixed(1), x2: (w - mR).toFixed(1), y2: y80.toFixed(1),
        stroke: "#e74c3c", "stroke-width": "1", "stroke-dasharray": "4 3", opacity: "0.7"
      }));
      var refLbl = S("text", { class: "tick",
        x: (mL + 4).toFixed(1), y: (y80 - 4).toFixed(1),
        "font-size": 9, fill: "#e74c3c", opacity: "0.8" });
      refLbl.textContent = "80%";
      s.appendChild(refLbl);
    }

    // ── Bars ────────────────────────────────────────────────────────────────
    var barRects = [];
    data.forEach(function (d, i) {
      var bx = xSlot(i) + (slotW - barW) / 2;
      var by = yBar(d.value);
      var bh = Math.max(1, mT + ih - by);
      var bar = S("rect", {
        x: bx.toFixed(1), y: by.toFixed(1),
        width: barW.toFixed(1), height: bh.toFixed(1),
        fill: brandColor, rx: 2,
        // Lighter bars further right to emphasise descending magnitude
        opacity: (0.88 - i * 0.06 / Math.max(1, n - 1)).toFixed(2)
      });
      s.appendChild(bar);
      barRects.push(bar);

      // X-axis label — rotated -35° to save horizontal space; truncated.
      var lblEl = S("text", { class: "tick",
        x: xCenter(i).toFixed(1), y: (h - mB + 14).toFixed(1),
        "text-anchor": "end", "dominant-baseline": "auto",
        transform: "rotate(-35," + xCenter(i).toFixed(1) + "," + (h - mB + 10).toFixed(1) + ")" });
      lblEl.textContent = PDC.fmt.trunc(String(d.label), Math.max(4, Math.floor(slotW / 5)));
      s.appendChild(lblEl);

      // Transparent hit zone — covers full column including above the bar.
      var hit = S("rect", { x: xSlot(i).toFixed(1), y: mT, width: slotW.toFixed(1), height: ih,
        fill: "transparent", style: "cursor:crosshair" });
      hit.addEventListener("mousemove", function (ev) {
        PDC.showTip(ev, "<b>" + d.label + "</b><br>" + fmtFn(d.value) +
          " &nbsp;<span style='color:" + lineColor + "'>" + d.cumPct.toFixed(1) + "% cumulative</span>");
      });
      hit.addEventListener("mouseleave", PDC.hideTip);
      s.appendChild(hit); // after bar so event goes to hit, not bar
    });

    // ── Cumulative % line ────────────────────────────────────────────────────
    var linePts = data.map(function (d, i) {
      return xCenter(i).toFixed(1) + "," + yPct(d.cumPct).toFixed(1);
    });
    var lineEl = S("polyline", {
      points: linePts.join(" "),
      fill: "none", stroke: lineColor, "stroke-width": "2",
      "stroke-linejoin": "round", "stroke-linecap": "round"
    });
    s.appendChild(lineEl);

    // Dots on each cumulative point
    var dots = data.map(function (d, i) {
      var dot = S("circle", {
        cx: xCenter(i).toFixed(1), cy: yPct(d.cumPct).toFixed(1), r: 3,
        fill: lineColor, stroke: "white", "stroke-width": "1"
      });
      s.appendChild(dot);
      return dot;
    });

    // ── Animated entrance ────────────────────────────────────────────────────
    // Phase 1: bars grow up from their base (staggered). Phase 2: line + dots fade in.
    if (canAnim()) {
      // Bars: opacity fade-in staggered left-to-right
      barRects.forEach(function (rect, i) {
        var finalOp = rect.getAttribute("opacity") || "0.88";
        rect.style.opacity = "0";
        setTimeout(function () {
          rect.style.transition = "opacity " + animD(240) + "ms ease";
          rect.style.opacity = finalOp;
        }, animD(40 + i * 45));
      });
      // Line + dots: appear after the last bar starts fading in
      var lineDelay = animD(40 + n * 45 + 60);
      lineEl.style.opacity = "0";
      setTimeout(function () {
        lineEl.style.transition = "opacity " + animD(360) + "ms ease";
        lineEl.style.opacity = "1";
      }, lineDelay);
      dots.forEach(function (dot, i) {
        dot.style.opacity = "0";
        setTimeout(function () {
          dot.style.transition = "opacity " + animD(200) + "ms ease";
          dot.style.opacity = "1";
        }, lineDelay + animD(i * 30));
      });
    }
  }

  /* ---------- grouped bars (multi-series, side-by-side per category) ----------
     Renders N groups of M side-by-side vertical bars, one group per category label
     and one bar per series. Perfect for comparing multiple measures across categories
     where Stacked bars would hide individual values (e.g. Q1/Q2/Q3 revenue by region).
     Data binding: labelCol (x-axis categories) + series (one numeric column each).
     CDF-only (no CCC multi-bar equivalent in the Studio CDE export).
     PDC.groupedBars lives here in studio-charts.js; pdc-ui.js stays pristine. */
  PDC.groupedBars = function (el, cfg) { reg(el, function () { _groupedBars(el, cfg); }); };
  function _groupedBars(el, cfg) {
    var labels  = cfg.labels  || [];
    var series  = cfg.series  || [];
    var h       = cfg.height  || 300;
    var fmtFn   = cfg.fmt     || PDC.fmt.abbr;
    var rotate  = !!cfg.rotate;
    var showValues = !!cfg.showValues;

    if (!labels.length || !series.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }

    var nCats = labels.length;
    var nSer  = series.length;
    var P = PDC.palette();

    // Global max across every series value — shared y-axis so bars are comparable.
    var allVals = series.reduce(function (acc, se) {
      return acc.concat((se.values || []).map(function (v) { return +v || 0; }));
    }, []);
    var maxV = niceMax(Math.max.apply(null, allVals.concat([0])));

    var o = mkSVG(el, h), s = o.s, w = o.w;
    var mL = 46, mR = 14, mT = 12, mB = rotate ? 52 : 30;
    var iw = w - mL - mR, ih = h - mT - mB;

    // Y-axis grid lines and value labels
    for (var g = 0; g <= 4; g++) {
      var gv  = maxV * g / 4;
      var gy  = mT + ih * (1 - g / 4);
      s.appendChild(S("line", { class: "gridline", x1: mL, y1: gy.toFixed(1), x2: w - mR, y2: gy.toFixed(1) }));
      var lt = S("text", { class: "tick", x: (mL - 6), y: gy, "text-anchor": "end", "dominant-baseline": "middle" });
      lt.textContent = fmtFn(gv);
      s.appendChild(lt);
    }

    // Bar layout: divide each category's horizontal slot into nSer bars + small padding.
    var groupW  = iw / nCats;
    var groupPad = Math.max(1, groupW * 0.1);
    var innerW  = groupW - groupPad * 2;
    var barGap  = Math.max(0.5, innerW * 0.06 / Math.max(1, nSer - 1));
    var barW    = Math.max(2, (innerW - barGap * (nSer - 1)) / nSer);

    // Clamp bar width to a comfortable visual ceiling
    if (barW > 40) { barW = 40; }

    var legendItems = [];
    // Collect all bar animation data so we can fire them together after drawing
    var barAnims = [];

    series.forEach(function (se, si) {
      var serColor = se.color || P[si % 10];
      var seEls = [];

      labels.forEach(function (lb, li) {
        var val = +(se.values[li]) || 0;
        var bh  = Math.max(val > 0 ? 1 : 0, ih * (val / (maxV || 1)));
        var gx  = mL + li * groupW + groupPad;
        // Center the block of bars within the padding zone
        var blockW = barW * nSer + barGap * (nSer - 1);
        var bx  = gx + (innerW - blockW) / 2 + si * (barW + barGap);
        var finalY  = mT + ih - bh;
        var baseY   = mT + ih;

        var rect = S("rect", {
          x: bx.toFixed(1), y: baseY, width: barW.toFixed(1), height: 0,
          fill: serColor, rx: 2
        });
        // Hover tooltip shows category + series name + formatted value
        rect.addEventListener("mousemove", function (e) {
          PDC.showTip(e, "<b>" + lb + "</b><br>" +
            (se.name || ("Series " + (si + 1))) + ": " + fmtFn(val));
        });
        rect.addEventListener("mouseout", PDC.hideTip);
        s.appendChild(rect);
        seEls.push(rect);

        // Value label above the bar — only when the bar is wide enough to hold text legibly.
        var valLbl = null;
        if (showValues && barW >= 14) {
          valLbl = S("text", { class: "val-label", x: (bx + barW / 2).toFixed(1),
            y: (finalY - 4).toFixed(1), "text-anchor": "middle" }, fmtFn(val));
          if (canAnim()) valLbl.style.opacity = "0";
          s.appendChild(valLbl);
        }

        barAnims.push({ rect: rect, finalY: finalY, bh: bh, label: valLbl,
                        delay: animD(40 + li * 40 + si * 15) });

        // X-axis label — emit once (first series only) to avoid duplicates
        if (si === 0) {
          var lx  = mL + li * groupW + groupW / 2;
          var lbl = S("text", { class: "tick", x: lx.toFixed(1),
            y: (mT + ih + 14),
            "text-anchor": rotate ? "end" : "middle",
            "dominant-baseline": "auto"
          });
          if (rotate) {
            lbl.setAttribute("transform",
              "rotate(-38," + lx.toFixed(1) + "," + (mT + ih + 12) + ")");
            lbl.setAttribute("y", mT + ih + 12);
          }
          lbl.textContent = PDC.fmt.trunc(lb, rotate ? 14 : 9);
          s.appendChild(lbl);
        }
      });

      legendItems.push({ name: se.name || ("Series " + (si + 1)), color: serColor, els: seEls, base: "1" });
    });

    // Animate bars growing up from the baseline — each bar fades in at a staggered delay
    if (canAnim()) {
      barAnims.forEach(function (ba) {
        setTimeout(function () {
          ba.rect.setAttribute("y", ba.finalY.toFixed(1));
          ba.rect.setAttribute("height", ba.bh.toFixed(1));
          ba.rect.style.transition =
            "y " + animD(280) + "ms ease-out, height " + animD(280) + "ms ease-out";
          if (ba.label) {
            ba.label.style.transition = "opacity " + animD(220) + "ms ease";
            ba.label.style.opacity = "1";
          }
        }, ba.delay + (ba.label ? animD(200) : 0));
      });
    } else {
      barAnims.forEach(function (ba) {
        ba.rect.setAttribute("y", ba.finalY.toFixed(1));
        ba.rect.setAttribute("height", ba.bh.toFixed(1));
      });
    }

    // Toggleable legend row — click a chip to hide/show that series
    _toggleLegend(el, legendItems);
  }

  /* ---------- ridgeline / joy plot — horizontally stacked KDE density ridges ----------
     Each category's numeric values are Gaussian-KDE-estimated and drawn as a filled
     density curve sweeping left-to-right on a shared value axis. Categories are stacked
     vertically from bottom (first) to top (last), with each ridge's baseline slightly
     overlapping the previous one — the classic "joy plot" shape pioneered by the Arctic
     Monkeys vinyl sleeve and popularised by the R ggridges package.

     Excellent for comparing distribution shapes across many groups in a single view
     (e.g. latency by service tier, sales by region, age distributions by country).
     Complementary to violin (symmetric/vertical), beeswarm (raw points), and histogram
     (single-category binned counts).

     Uses the same Silverman-bandwidth Gaussian KDE as the violin chart. Curves use a
     shared x-axis scale so shapes are directly comparable.

     API: PDC.ridgeline(el, {
       categories: [{name, values}],   // pre-grouped by studio-render.js (violin pattern)
       overlap: 0.4,                   // ridge vertical overlap ratio (0 = no overlap)
       fmt, height
     }) */
  PDC.ridgeline = function (el, cfg) { reg(el, function () { _ridgeline(el, cfg); }); };
  function _ridgeline(el, cfg) {
    var cats = cfg.categories || [];
    var overlap = cfg.overlap != null ? +cfg.overlap : 0.4;
    var h = cfg.height || 320, fmtFn = cfg.fmt || PDC.fmt.abbr;
    if (!cats.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }

    var o = mkSVG(el, h), sv = o.s, w = o.w;
    var mL = 80, mR = 20, mT = 12, mB = 30;
    var iw = w - mL - mR, ih = h - mT - mB;

    // Collect every value to establish a shared X scale
    var allVals = cats.reduce(function (a, c) { return a.concat(c.values || []); }, []);
    if (!allVals.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    var minV = Math.min.apply(null, allVals), maxV = Math.max.apply(null, allVals);
    if (maxV === minV) { maxV = minV + 1; }

    // X scale: value → pixel
    var xs = function (v) { return mL + ((v - minV) / (maxV - minV)) * iw; };

    // Silverman-bandwidth Gaussian KDE — shares silvermanBw()/kdeDensity() with the violin chart

    // Per-category row slot height (no overlap) and actual ridge height (with overlap)
    var slotH = ih / cats.length;
    var ridgeH = slotH * (1 + overlap);          // how tall each ridge peak can grow
    if (ridgeH < 10) ridgeH = 10;
    if (ridgeH > ih * 0.95) ridgeH = ih * 0.95; // clamp to chart height

    var P = PDC.palette();
    var ridgePaths = []; // collected for animation

    // X-axis tick labels at bottom
    var ticks = 5;
    for (var ti = 0; ti <= ticks; ti++) {
      var tv = minV + (maxV - minV) * (ti / ticks);
      var tx = xs(tv);
      // Faint vertical grid line
      sv.appendChild(S("line", { x1: tx.toFixed(1), y1: mT, x2: tx.toFixed(1), y2: mT + ih,
        stroke: PDC.cssvar("--panel-border"), "stroke-width": 0.6, "stroke-dasharray": "2 3" }));
      // Tick label below chart
      var tl = S("text", { class: "tick", x: tx.toFixed(1), y: (mT + ih + 14).toFixed(1),
        "text-anchor": "middle" });
      tl.textContent = fmtFn(tv);
      sv.appendChild(tl);
    }

    cats.forEach(function (cat, ci) {
      var col = P[ci % P.length];
      var vals = (cat.values || []).map(Number).filter(isFinite);

      // Baseline Y for this ridge: bottom = last category, top = first
      // Categories[0] appears at the bottom; categories[n-1] appears at the top.
      var baseY = mT + ih - ci * slotH;

      // Category label on the left Y-axis
      var lbl = S("text", { class: "tick", x: (mL - 6).toFixed(1), y: (baseY - ridgeH * 0.12).toFixed(1),
        "text-anchor": "end", fill: col, "font-weight": "500" });
      lbl.textContent = PDC.fmt.trunc(cat.name, 12);
      sv.appendChild(lbl);

      // Faint baseline rule
      sv.appendChild(S("line", { x1: mL, y1: baseY.toFixed(1), x2: (mL + iw).toFixed(1), y2: baseY.toFixed(1),
        stroke: col, "stroke-width": 0.35, opacity: 0.4 }));

      if (!vals.length) return;

      // Build KDE curve (shared silvermanBw/kdeDensity helpers, also used by violin)
      var bw = silvermanBw(vals, minV, maxV);
      var density = kdeDensity(vals, bw, minV, maxV, 48);
      var maxD = 0;
      density.forEach(function (pt) { if (pt.d > maxD) maxD = pt.d; });
      if (maxD === 0) return;

      // Normalise: max density → ridgeH pixels above baseline
      // Build SVG path: M(x0,base) → curve points → L(xN,base) → Z
      var d = "M" + xs(density[0].x).toFixed(1) + "," + baseY.toFixed(1);
      density.forEach(function (pt) {
        var px = xs(pt.x);
        var py = baseY - (pt.d / maxD) * ridgeH;
        d += " L" + px.toFixed(1) + "," + py.toFixed(1);
      });
      d += " L" + xs(density[density.length - 1].x).toFixed(1) + "," + baseY.toFixed(1) + " Z";

      var fill = S("path", { d: d, fill: col, opacity: canAnim() ? 0 : 0.18 });
      var line = S("path", { d: d, fill: "none", stroke: col, "stroke-width": 1.4,
        "stroke-linejoin": "round", opacity: canAnim() ? 0 : 0.85 });
      sv.appendChild(fill);
      sv.appendChild(line);

      // Hover tooltip: native SVG title on an invisible rect spanning the ridge area
      var tipY = baseY - ridgeH;
      var tr = S("rect", { x: mL.toFixed(1), y: tipY.toFixed(1),
        width: iw.toFixed(1), height: (ridgeH + 2).toFixed(1),
        fill: "transparent", "pointer-events": "all" });
      var med = vals.slice().sort(function (a, b) { return a - b; });
      var medVal = med[Math.floor(med.length / 2)];
      var tt = document.createElementNS("http://www.w3.org/2000/svg", "title");
      tt.textContent = cat.name + " · " + vals.length + " values · median " + fmtFn(medVal);
      tr.appendChild(tt);
      sv.appendChild(tr);

      ridgePaths.push({ fill: fill, line: line, delay: (cats.length - 1 - ci) * 60 });
    });

    // Animate: ridges fade in staggered from bottom to top (bottom-most ridge first)
    if (canAnim()) {
      ridgePaths.forEach(function (rp) {
        setTimeout(function () {
          rp.fill.style.transition = "opacity " + animD(340) + "ms ease-out";
          rp.line.style.transition = "opacity " + animD(260) + "ms ease-out";
          rp.fill.setAttribute("opacity", "0.18");
          rp.line.setAttribute("opacity", "0.85");
        }, rp.delay);
      });
    }
  }

  /* ---------- 100% Normalized Stacked Bar chart (barNorm) -----------------------
     Each bar represents a single category and is divided into proportional segments
     that always total exactly 100%. Shows COMPOSITIONAL share — how the mix of
     series changes from category to category — without the noise of absolute scale.

     Contrast with Stacked bars (absolute totals) and Grouped bars (direct comparison).
     Ideal for: market share by region, budget allocation by department, survey response
     breakdown by team, sentiment distribution by period.

     API: PDC.barNorm(el, {
       labels:  string[],               // x-axis categories
       series:  [{name, color, values}],// one per segment; values[i] = raw numeric for label[i]
       rotate:  bool,                   // rotate x-axis labels (for long category names)
       showPct: bool,                   // show a "NN%" label centered in each segment (Z8 follow-up)
       fmt:     function,               // value formatter (raw value in tooltips)
       height:  number
     })
     PDC.barNorm lives here in studio-charts.js; pdc-ui.js stays pristine. */
  PDC.barNorm = function (el, cfg) { reg(el, function () { _barNorm(el, cfg); }); };
  function _barNorm(el, cfg) {
    var labels  = cfg.labels  || [];
    var series  = cfg.series  || [];
    var h       = cfg.height  || 300;
    var fmtFn   = cfg.fmt     || PDC.fmt.abbr;
    var rotate  = !!cfg.rotate;
    var showPct = !!cfg.showPct;

    if (!labels.length || !series.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }

    var nCats = labels.length;
    var P = PDC.palette();

    // Compute per-category totals (sum all series) for normalization to 100%.
    var totals = labels.map(function (_, li) {
      return series.reduce(function (acc, se) { return acc + (+se.values[li] || 0); }, 0);
    });

    var o = mkSVG(el, h), s = o.s, w = o.w;
    var mL = 44, mR = 14, mT = 12, mB = rotate ? 52 : 30;
    var iw = w - mL - mR, ih = h - mT - mB;
    var bw = iw / nCats;
    var bPad = Math.max(4, bw * 0.15);
    var bWidth = Math.max(2, bw - bPad * 2);

    // Y-axis: fixed 0-100% with five 25%-interval gridlines
    for (var g = 0; g <= 4; g++) {
      var gy = mT + ih * (1 - g / 4);
      s.appendChild(S("line", { class: "gridline", x1: mL, y1: gy.toFixed(1), x2: w - mR, y2: gy.toFixed(1) }));
      var lt = S("text", { class: "tick", x: mL - 6, y: gy, "text-anchor": "end", "dominant-baseline": "middle" });
      lt.textContent = (g * 25) + "%";
      s.appendChild(lt);
    }

    // X-axis category labels
    labels.forEach(function (lb, li) {
      var lx = mL + li * bw + bw / 2;
      var lbl = S("text", { class: "tick", x: lx.toFixed(1), y: mT + ih + 14,
        "text-anchor": rotate ? "end" : "middle", "dominant-baseline": "auto" });
      if (rotate) {
        lbl.setAttribute("transform", "rotate(-38," + lx.toFixed(1) + "," + (mT + ih + 12) + ")");
        lbl.setAttribute("y", mT + ih + 12);
      }
      lbl.textContent = PDC.fmt.trunc(lb, rotate ? 14 : 9);
      s.appendChild(lbl);
    });

    // Build segment rects: iterate series (bottom-to-top stacking order) × categories.
    // Track a per-category cumulative % offset so segments nest correctly.
    var cumPcts = labels.map(function () { return 0; }); // accumulated % per category
    var legendItems = [];
    // Group all rects by category column so the stagger animation fires per-column.
    var colGroups = labels.map(function () { return []; });

    series.forEach(function (se, si) {
      var serColor = se.color || P[si % 10];
      var seEls = [];

      labels.forEach(function (lb, li) {
        var rawVal = +(se.values[li]) || 0;
        var total  = totals[li] || 0;
        var pct    = total > 0 ? rawVal / total : 0;

        var bottomPct = cumPcts[li];
        var topPct    = bottomPct + pct;
        cumPcts[li]   = topPct;

        if (pct < 0.001) return; // skip effectively-zero segments

        var bx     = mL + li * bw + bPad;
        var finalY = mT + ih * (1 - topPct);
        var finalH = ih * pct;

        // Rounded top corners only on the topmost segment (the last series drawn for this column).
        // We don't know ahead of time which is last, so apply rx=2 to all and let the bottom
        // rectangle inherit it — the visual effect is a slightly rounded bar overall.
        var rect = S("rect", {
          x: bx.toFixed(1), y: (mT + ih).toFixed(1),
          width: bWidth.toFixed(1), height: 0,
          fill: serColor, rx: 2
        });

        // Closure captures local vars via IIFE to avoid loop-variable pitfall
        (function (seName, rawV, pctV, lbName) {
          rect.addEventListener("mousemove", function (e) {
            PDC.showTip(e, "<b>" + lbName + "</b><br>" +
              seName + ": " + fmtFn(rawV) +
              " <span class='muted'>(" + (pctV * 100).toFixed(1) + "%)</span>");
          });
        })(se.name || ("Series " + (si + 1)), rawVal, pct, lb);
        rect.addEventListener("mouseout", PDC.hideTip);

        s.appendChild(rect);
        seEls.push(rect);

        // Segment % label — centered in the band, only when tall+wide enough to read.
        var pctLbl = null;
        if (showPct && finalH >= 14 && bWidth >= 20) {
          pctLbl = S("text", { class: "val-label", x: (bx + bWidth / 2).toFixed(1),
            y: (finalY + finalH / 2 + 4).toFixed(1), "text-anchor": "middle" },
            Math.round(pct * 100) + "%");
          pctLbl.style.opacity = "0";
          s.appendChild(pctLbl);
        }

        colGroups[li].push({ rect: rect, finalY: finalY.toFixed(1), finalH: finalH.toFixed(1), label: pctLbl });
      });

      legendItems.push({ name: se.name || ("Series " + (si + 1)), color: serColor, els: seEls, base: "1" });
    });

    // Animate: each column of bars grows from baseline, staggered left-to-right.
    // All segments within a column animate simultaneously so the stack builds together.
    if (canAnim()) {
      colGroups.forEach(function (group, li) {
        var delay = animD(40 + li * 45);
        setTimeout(function () {
          group.forEach(function (ba) {
            ba.rect.setAttribute("y", ba.finalY);
            ba.rect.setAttribute("height", ba.finalH);
            ba.rect.style.transition =
              "y " + animD(330) + "ms ease-out, height " + animD(330) + "ms ease-out";
            if (ba.label) {
              ba.label.style.transition = "opacity " + animD(220) + "ms ease";
              ba.label.style.opacity = "1";
            }
          });
        }, delay + animD(180));
      });
    } else {
      colGroups.forEach(function (group) {
        group.forEach(function (ba) {
          ba.rect.setAttribute("y", ba.finalY);
          ba.rect.setAttribute("height", ba.finalH);
          if (ba.label) ba.label.style.opacity = "1";
        });
      });
    }

    // Toggleable legend chips — click to show/hide a series across all columns
    _toggleLegend(el, legendItems);
  }

  // ── F37: Area range / confidence band chart ─────────────────────────────────
  // Renders a shaded band between lower and upper bound lines with an optional
  // centre/actual line. Ideal for: statistical confidence intervals (e.g. ML
  // model output bands), min/max temperature ranges, forecast floor/ceiling,
  // budget bounds, or any scenario where the story is "the real value sits
  // inside this band." Upper bound is solid; lower bound is dashed so readers
  // can quickly distinguish them; the fill area is semi-transparent.
  //
  // cfg:
  //   labels[]     — x-axis category or time-period labels
  //   lower[]      — lower bound numeric values (parallel with labels[])
  //   upper[]      — upper bound numeric values (parallel with labels[])
  //   center[]     — optional centre/actual/forecast line values
  //   showCenter   — boolean (default true); when false, center[] is ignored
  //   bandOpacity  — fill opacity 0–1 (default 0.22)
  //   bandColor    — CSS color or --token for band + boundary lines
  //   fmt          — number format function (default PDC.fmt.abbr)
  //   height       — canvas height in px (default 300)
  function _areaRange(el, cfg) {
    var labels  = cfg.labels  || [];
    var lower   = cfg.lower   || [];
    var upper   = cfg.upper   || [];
    var hasCenter = cfg.showCenter !== false && cfg.center && cfg.center.length;
    var center  = hasCenter ? cfg.center : null;
    var h       = cfg.height  || 300;
    var fmtFn   = cfg.fmt     || PDC.fmt.abbr;
    var bandOp  = cfg.bandOpacity != null ? +cfg.bandOpacity : 0.22;
    var bColor  = cfg.bandColor || PDC.cssvar("--pentaho");
    var n       = labels.length;

    if (n === 0) { el.innerHTML = '<div class="empty">No data</div>'; return; }

    var o = mkSVG(el, h), s = o.s, w = o.w;
    var mL = 46, mR = 14, mT = 14, mB = 26;
    var iw = w - mL - mR, ih = h - mT - mB;

    // Value scale: union of lower, upper, and center (if shown) so everything fits.
    var allVals = lower.concat(upper);
    if (center) allVals = allVals.concat(center);
    allVals = allVals.map(function (v) { return +v || 0; });
    var vMin = Math.min.apply(null, allVals);
    var vMax = Math.max.apply(null, allVals);
    // Small 5% padding at top and bottom so lines don't touch the edge
    var vRange = vMax - vMin || 1;
    vMin -= vRange * 0.05;
    vMax += vRange * 0.05;
    vRange = vMax - vMin;

    function yy(v) { return mT + ih * (1 - (+v - vMin) / vRange); }
    function xx(i) { return n <= 1 ? mL + iw / 2 : mL + i / (n - 1) * iw; }

    // Gridlines + y-axis ticks (4 intervals)
    for (var gi = 0; gi <= 4; gi++) {
      var gv = vMin + vRange * gi / 4;
      var gy = yy(gv);
      s.appendChild(S("line", { class: "gridline", x1: mL, y1: gy.toFixed(1), x2: w - mR, y2: gy.toFixed(1) }));
      var lt = S("text", { class: "tick", x: mL - 6, y: gy, "text-anchor": "end", "dominant-baseline": "middle" });
      lt.textContent = fmtFn(gv);
      s.appendChild(lt);
    }

    // X-axis category labels — stride to avoid crowding
    var showEvery = n > 14 ? Math.ceil(n / 10) : 1;
    labels.forEach(function (lb, i) {
      if (i % showEvery !== 0 && i !== n - 1) return;
      var lx = xx(i);
      var lbl = S("text", { class: "tick", x: lx.toFixed(1), y: mT + ih + 14, "text-anchor": "middle" });
      lbl.textContent = PDC.fmt.trunc(String(lb), 8);
      s.appendChild(lbl);
    });

    if (n < 2) {
      // Degenerate single-data-point: dot at the upper value
      s.appendChild(S("circle", { cx: xx(0).toFixed(1), cy: yy(+upper[0] || 0).toFixed(1), r: 5, fill: bColor }));
      return;
    }

    // Build upper / lower coordinate arrays
    var upperPts = labels.map(function (_, i) { return xx(i).toFixed(1) + "," + yy(+upper[i] || 0).toFixed(1); });
    var lowerPts = labels.map(function (_, i) { return xx(i).toFixed(1) + "," + yy(+lower[i] || 0).toFixed(1); });

    // Filled band polygon: trace upper L→R then lower R→L to form a closed shape
    var bandEl = S("polygon", {
      points: upperPts.join(" ") + " " + lowerPts.slice().reverse().join(" "),
      fill: bColor, opacity: "0", "pointer-events": "none"
    });
    s.appendChild(bandEl);

    // Upper bound line — solid, normal weight
    var upperEl = S("polyline", {
      points: upperPts.join(" "), fill: "none",
      stroke: bColor, "stroke-width": "1.5", "stroke-opacity": "0",
      "stroke-linejoin": "round", "stroke-linecap": "round"
    });
    s.appendChild(upperEl);

    // Lower bound line — dashed, same color, slightly less prominent
    var lowerEl = S("polyline", {
      points: lowerPts.join(" "), fill: "none",
      stroke: bColor, "stroke-width": "1.5", "stroke-opacity": "0",
      "stroke-dasharray": "5,3", "stroke-linejoin": "round", "stroke-linecap": "round"
    });
    s.appendChild(lowerEl);

    // Centre / actual line — optional, solid, bolder, full opacity so it reads above the band
    var centerEl = null;
    if (center) {
      var cPts = labels.map(function (_, i) { return xx(i).toFixed(1) + "," + yy(+center[i] || 0).toFixed(1); });
      centerEl = S("polyline", {
        points: cPts.join(" "), fill: "none",
        stroke: bColor, "stroke-width": "2.2", "stroke-opacity": "0",
        "stroke-linejoin": "round", "stroke-linecap": "round"
      });
      s.appendChild(centerEl);
    }

    // Tooltip hover zone: transparent vertical strip per data point
    var halfSlot = n > 1 ? iw / ((n - 1) * 2) : iw / 2;
    labels.forEach(function (lb, i) {
      var lx = xx(i);
      var zx = Math.max(mL, lx - halfSlot);
      var over = S("rect", {
        x: zx.toFixed(1), y: mT,
        width: (Math.min(halfSlot * 2, iw - (zx - mL))).toFixed(1),
        height: ih, fill: "transparent"
      });
      (function (uv, lv2, cv) {
        over.addEventListener("mousemove", function (e) {
          var tip = "<b>" + lb + "</b><br>Upper: " + fmtFn(uv) + "<br>Lower: " + fmtFn(lv2);
          if (cv != null) tip += "<br>Centre: " + fmtFn(cv);
          PDC.showTip(e, tip);
        });
      })(+upper[i] || 0, +lower[i] || 0, center ? (+center[i] || 0) : null);
      over.addEventListener("mouseout", PDC.hideTip);
      s.appendChild(over);
    });

    // Animation: band fades in first, then boundary lines, then centre line
    if (canAnim()) {
      setTimeout(function () {
        bandEl.style.transition  = "opacity "        + animD(450) + "ms ease";
        upperEl.style.transition = "stroke-opacity " + animD(380) + "ms ease " + animD(100) + "ms";
        lowerEl.style.transition = "stroke-opacity " + animD(380) + "ms ease " + animD(120) + "ms";
        bandEl.setAttribute("opacity", String(bandOp));
        upperEl.setAttribute("stroke-opacity", "0.85");
        lowerEl.setAttribute("stroke-opacity", "0.72");
        if (centerEl) {
          centerEl.style.transition = "stroke-opacity " + animD(350) + "ms ease " + animD(260) + "ms";
          centerEl.setAttribute("stroke-opacity", "0.96");
        }
      }, animD(60));
    } else {
      bandEl.setAttribute("opacity", String(bandOp));
      upperEl.setAttribute("stroke-opacity", "0.85");
      lowerEl.setAttribute("stroke-opacity", "0.72");
      if (centerEl) centerEl.setAttribute("stroke-opacity", "0.96");
    }
  }
  PDC.areaRange = function (el, cfg) { reg(el, function () { _areaRange(el, cfg); }); };

  // ── Quadrant / 2×2 matrix chart ─────────────────────────────────────────────
  // Positions items on a scatter-style x/y plane divided into four labelled
  // quadrants by configurable threshold lines. Perfect for strategic analysis:
  //   • BCG growth-share matrix (Market Growth vs Relative Share)
  //   • Effort vs Impact prioritisation (which work to do first)
  //   • Risk / probability-impact assessment
  //   • Talent performance × potential grids
  //   • Any scenario where "which quadrant does this item fall into?" is the story.
  //
  // cfg:
  //   points     — [{x, y, label}]   one dot per row
  //   xThreshold — 0–100 (% of visible x-range) where the vertical divider sits (default 50)
  //   yThreshold — 0–100 (% of visible y-range) where the horizontal divider sits (default 50)
  //   q1Label    — top-right quadrant name  (default "High Value")
  //   q2Label    — top-left quadrant name   (default "Explore")
  //   q3Label    — bottom-left quadrant name (default "Low Priority")
  //   q4Label    — bottom-right quadrant name (default "Quick Wins")
  //   xLabel, yLabel — axis labels
  //   fmt        — number format function
  //   height     — canvas height in px (default 300)
  function _quadrant(el, cfg) {
    var pts   = cfg.points || [];
    var h     = cfg.height || 300;
    var fmtFn = cfg.fmt    || PDC.fmt.abbr;

    if (pts.length === 0) { el.innerHTML = '<div class="empty">No data</div>'; return; }

    var xs = pts.map(function (p) { return +p.x || 0; });
    var ys = pts.map(function (p) { return +p.y || 0; });
    var xMin = Math.min.apply(null, xs), xMax = Math.max.apply(null, xs);
    var yMin = Math.min.apply(null, ys), yMax = Math.max.apply(null, ys);
    // 10% padding on each side so dots don't land on the chart edge
    var xPad = (xMax - xMin) * 0.10 || Math.abs(xMax) * 0.10 || 1;
    var yPad = (yMax - yMin) * 0.10 || Math.abs(yMax) * 0.10 || 1;
    xMin -= xPad; xMax += xPad; yMin -= yPad; yMax += yPad;
    var xRange = xMax - xMin, yRange = yMax - yMin;

    // Threshold sliders give a % of the padded visible range
    var xThrPct = cfg.xThreshold != null ? +cfg.xThreshold / 100 : 0.5;
    var yThrPct = cfg.yThreshold != null ? +cfg.yThreshold / 100 : 0.5;
    var xThrV   = xMin + xRange * xThrPct;
    var yThrV   = yMin + yRange * yThrPct;

    var q1 = cfg.q1Label || "High Value";  // top-right
    var q2 = cfg.q2Label || "Explore";     // top-left
    var q3 = cfg.q3Label || "Low Priority"; // bottom-left
    var q4 = cfg.q4Label || "Quick Wins";  // bottom-right

    var o = mkSVG(el, h), s = o.s, w = o.w;
    var mL = 42, mR = 14, mT = 14, mB = 28;
    var iw = w - mL - mR, ih = h - mT - mB;

    function sx(v) { return mL + iw * ((v - xMin) / xRange); }
    function sy(v) { return mT + ih * (1 - (v - yMin) / yRange); }

    var xThrPx = sx(xThrV), yThrPx = sy(yThrV);

    // Quadrant background shading — very subtle so dots remain the focal element
    [
      { x: xThrPx, y: mT,      w: mL + iw - xThrPx, h: yThrPx - mT,      fill: "#005bb5" }, // Q1 top-right: blue
      { x: mL,     y: mT,      w: xThrPx - mL,       h: yThrPx - mT,      fill: "#9b59b6" }, // Q2 top-left: purple
      { x: mL,     y: yThrPx,  w: xThrPx - mL,       h: mT + ih - yThrPx, fill: "#c0392b" }, // Q3 bottom-left: red
      { x: xThrPx, y: yThrPx,  w: mL + iw - xThrPx, h: mT + ih - yThrPx, fill: "#27ae60" }  // Q4 bottom-right: green
    ].forEach(function (z) {
      s.appendChild(S("rect", { x: z.x.toFixed(1), y: z.y.toFixed(1),
        width: Math.max(0, z.w).toFixed(1), height: Math.max(0, z.h).toFixed(1),
        fill: z.fill, opacity: "0.06" }));
    });

    // Grid lines (4 per axis) drawn before the dividers
    for (var gi = 0; gi <= 4; gi++) {
      var gxp = sx(xMin + xRange * gi / 4), gyp = sy(yMin + yRange * gi / 4);
      s.appendChild(S("line", { class: "gridline", x1: gxp.toFixed(1), y1: mT, x2: gxp.toFixed(1), y2: mT + ih }));
      s.appendChild(S("line", { class: "gridline", x1: mL, y1: gyp.toFixed(1), x2: mL + iw, y2: gyp.toFixed(1) }));
      var xt = S("text", { class: "tick", x: gxp.toFixed(1), y: (mT + ih + 13).toFixed(1), "text-anchor": "middle" });
      xt.textContent = fmtFn(xMin + xRange * gi / 4); s.appendChild(xt);
      var yt = S("text", { class: "tick", x: mL - 6, y: gyp.toFixed(1), "text-anchor": "end", "dominant-baseline": "middle" });
      yt.textContent = fmtFn(yMin + yRange * gi / 4); s.appendChild(yt);
    }

    // Axis labels (optional)
    if (cfg.xLabel) {
      var xl = S("text", { class: "axis-label", x: (mL + iw / 2).toFixed(1), y: h - 2, "text-anchor": "middle" });
      xl.textContent = cfg.xLabel; s.appendChild(xl);
    }
    if (cfg.yLabel) {
      var yl = S("text", { class: "axis-label", x: 9, y: (mT + ih / 2).toFixed(1), "text-anchor": "middle" });
      yl.setAttribute("transform", "rotate(-90 9 " + (mT + ih / 2).toFixed(1) + ")");
      yl.textContent = cfg.yLabel; s.appendChild(yl);
    }

    // Quadrant divider lines — dashed, neutral, drawn OVER the background
    s.appendChild(S("line", { x1: xThrPx.toFixed(1), y1: mT, x2: xThrPx.toFixed(1), y2: mT + ih,
      stroke: "currentColor", "stroke-width": "1.2", "stroke-dasharray": "4,3", opacity: "0.35" }));
    s.appendChild(S("line", { x1: mL, y1: yThrPx.toFixed(1), x2: mL + iw, y2: yThrPx.toFixed(1),
      stroke: "currentColor", "stroke-width": "1.2", "stroke-dasharray": "4,3", opacity: "0.35" }));

    // Quadrant corner labels — italic, muted, anchored inside each corner
    [
      { text: q1, x: mL + iw - 4, y: mT + 11,      anchor: "end" },   // top-right
      { text: q2, x: mL + 4,       y: mT + 11,      anchor: "start" }, // top-left
      { text: q3, x: mL + 4,       y: mT + ih - 4,  anchor: "start" }, // bottom-left
      { text: q4, x: mL + iw - 4, y: mT + ih - 4,  anchor: "end" }    // bottom-right
    ].forEach(function (ql) {
      var qt = S("text", { x: ql.x.toFixed(1), y: ql.y.toFixed(1), "text-anchor": ql.anchor,
        "font-size": "9.5", "font-style": "italic", opacity: "0.48", fill: "currentColor" });
      qt.textContent = ql.text; s.appendChild(qt);
    });

    // Dot color derived from which quadrant the point occupies
    function dotColor(px, py) {
      var r = px >= xThrV, t = py >= yThrV;
      if (t && r)  return "#005bb5"; // Q1 top-right: brand blue
      if (t && !r) return "#9b59b6"; // Q2 top-left: purple
      if (!t && !r) return "#c0392b"; // Q3 bottom-left: red
      return "#27ae60";               // Q4 bottom-right: green
    }

    pts.forEach(function (p, i) {
      var px = +p.x || 0, py = +p.y || 0;
      var cx = sx(px).toFixed(1), cy = sy(py).toFixed(1);
      var dc = dotColor(px, py);
      var dot = S("circle", { cx: cx, cy: cy, r: "5.5", fill: dc, opacity: "0.85",
        stroke: dc, "stroke-width": "1.4", class: "dot" });

      var tipHtml = (p.label ? "<b>" + p.label + "</b><br>" : "") +
        (cfg.xLabel || "X") + ": " + fmtFn(px) + "<br>" +
        (cfg.yLabel || "Y") + ": " + fmtFn(py);
      (function (d_, t_) {
        _tip(d_, t_);
      })(dot, tipHtml);

      if (canAnim()) {
        dot.setAttribute("opacity", "0");
        (function (d_, idx_) {
          setTimeout(function () {
            d_.style.transition = "opacity 0.3s ease";
            d_.setAttribute("opacity", "0.85");
          }, animD(40 + idx_ * 35));
        })(dot, i);
      }
      s.appendChild(dot);

      // Short point label nudged right of the dot (truncated to 13 chars)
      if (p.label) {
        var lt = S("text", { x: (parseFloat(cx) + 8).toFixed(1), y: (parseFloat(cy) + 3.5).toFixed(1),
          "font-size": "9.5", fill: "currentColor", opacity: "0.72" });
        lt.textContent = String(p.label).slice(0, 13);
        s.appendChild(lt);
      }
    });
  }
  PDC.quadrant = function (el, cfg) { reg(el, function () { _quadrant(el, cfg); }); };

  /* ── Enhanced chord chart (override PDC.chord, Z8 slice 16) ──────────────────
     Base PDC.chord (pdc-ui.js) always draws an arc label next to every
     wide-enough node, with no way to turn them off on a dense diagram. This
     override keeps the identical ring-allocation + ribbon geometry and adds
     cfg.showLabels. Base kept as PDC._chordBase for reference. */
  PDC._chordBase = PDC.chord;

  PDC.chord = function (el, cfg) { reg(el, function () { _chordOpts(el, cfg); }); };

  function _chordOpts(el, cfg) {
    var links = (cfg.links || []).filter(function (l) { return (+l.value || 0) > 0 && l.source !== l.target; });
    var h = cfg.height || 360;
    if (!links.length) { el.innerHTML = '<div class="empty">No connections</div>'; return; }
    var o = mkSVG(el, h), s = o.s, w = o.w, fmt = cfg.fmt || PDC.fmt.abbr, pal = PDC.palette();
    var showLabels = cfg.showLabels !== false;
    var N = {}, order = [];
    links.forEach(function (l) {
      [l.source, l.target].forEach(function (k) { if (!N[k]) { N[k] = { name: k, val: 0 }; order.push(k); } });
      N[l.source].val += +l.value; N[l.target].val += +l.value;
    });
    order.sort(function (a, b) { return N[b].val - N[a].val; });
    var n = order.length, idx = {}; order.forEach(function (k, i) { idx[k] = i; });
    var pair = {};
    links.forEach(function (l) { var a = idx[l.source], b = idx[l.target], lo = Math.min(a, b), hi = Math.max(a, b), key = lo + "|" + hi; pair[key] = (pair[key] || 0) + (+l.value || 0); });
    var sumTot = order.reduce(function (a, k) { return a + N[k].val; }, 0) || 1;
    var cx = w / 2, cy = h / 2 + 2, band = 13, R = Math.min(w, h) / 2 - 46;
    var gap = 0.05, avail = 2 * Math.PI - n * gap;
    var run = -Math.PI / 2;
    order.forEach(function (k) { var nd = N[k]; nd.a0 = run; var span = nd.val / sumTot * avail; nd.a1 = run + span; nd.span = span; nd.sub = {}; nd.cursor = run; run = nd.a1 + gap; });
    order.forEach(function (k, i) {
      var nd = N[k];
      order.forEach(function (k2, j) { if (i === j) return; var lo = Math.min(i, j), hi = Math.max(i, j), v = pair[lo + "|" + hi]; if (!v) return;
        var wdt = v / nd.val * nd.span; nd.sub[j] = { a0: nd.cursor, a1: nd.cursor + wdt }; nd.cursor += wdt; });
    });
    function P(rad, a) { return (cx + rad * Math.cos(a)).toFixed(1) + "," + (cy + rad * Math.sin(a)).toFixed(1); }
    function arcPath(a0, a1, ri, ro) {
      var big = (a1 - a0) > Math.PI ? 1 : 0;
      return "M" + P(ro, a0) + " A" + ro + "," + ro + " 0 " + big + " 1 " + P(ro, a1) + " L" + P(ri, a1) + " A" + ri + "," + ri + " 0 " + big + " 0 " + P(ri, a0) + " Z";
    }
    function ribbon(si, sj) {
      return "M" + P(R, si.a0) + " A" + R + "," + R + " 0 0 1 " + P(R, si.a1) +
             " Q" + cx.toFixed(1) + "," + cy.toFixed(1) + " " + P(R, sj.a1) +
             " A" + R + "," + R + " 0 0 1 " + P(R, sj.a0) +
             " Q" + cx.toFixed(1) + "," + cy.toFixed(1) + " " + P(R, si.a0) + " Z";
    }
    var ribEls = [];
    Object.keys(pair).forEach(function (key) {
      var parts = key.split("|"), i = +parts[0], j = +parts[1], v = pair[key];
      var ni = N[order[i]], nj = N[order[j]]; if (!ni.sub[j] || !nj.sub[i]) return;
      var col = pal[i % 10];
      var p = S("path", { d: ribbon(ni.sub[j], nj.sub[i]), fill: col, opacity: 0, stroke: col, "stroke-width": 0.5 });
      _tip(p, "<b>" + order[i] + " &harr; " + order[j] + "</b><br>" + fmt(v));
      p._i = i; p._j = j; p._base = 0.42; ribEls.push(p); s.appendChild(p);
      if (canAnim()) {
        (function (pp, delay) { setTimeout(function () { pp.style.transition = "opacity .5s ease"; pp.setAttribute("opacity", pp._base); }, delay); })(p, animD(120 + ribEls.length * 30));
      } else { p.setAttribute("opacity", p._base); }
    });
    function focus(i) {
      ribEls.forEach(function (p) { var lit = (i == null) || (p._i === i || p._j === i); p.setAttribute("opacity", i == null ? p._base : (lit ? 0.85 : 0.06)); });
      order.forEach(function (k, j) { var g2 = arcEls[j]; if (g2) g2.setAttribute("opacity", (i == null || j === i) ? 1 : 0.3); });
    }
    var arcEls = {};
    order.forEach(function (k, i) {
      var nd = N[k]; if (nd.span < 0.001) return; var col = pal[i % 10];
      var grp = S("g", { opacity: 1, style: "cursor:pointer" });
      var arcEl = S("path", { d: arcPath(nd.a0, nd.a1, R, R + band), fill: col, stroke: "#fff", "stroke-width": 1 });
      _tip(arcEl, "<b>" + k + "</b><br>" + fmt(nd.val) + " total flow");
      grp.appendChild(arcEl);
      var am = (nd.a0 + nd.a1) / 2, anc = Math.cos(am) < -0.3 ? "end" : Math.cos(am) > 0.3 ? "start" : "middle", lr = R + band + 7;
      if (showLabels && nd.span >= 0.06) grp.appendChild(S("text", { x: (cx + lr * Math.cos(am)).toFixed(1), y: (cy + lr * Math.sin(am) + (Math.sin(am) > 0.3 ? 7 : Math.sin(am) < -0.3 ? -1 : 3)).toFixed(1),
        "text-anchor": anc, fill: "var(--text)", "font-size": "11", "font-weight": "700" }, PDC.fmt.trunc(k, 14)));
      grp.addEventListener("mouseover", function () { focus(i); });
      grp.addEventListener("mouseout", function () { focus(null); });
      arcEls[i] = grp; s.appendChild(grp);
    });
    if (cfg.caption) s.appendChild(S("text", { x: cx, y: cy, "text-anchor": "middle", fill: "var(--muted)", "font-size": "10", "font-weight": "700" }, cfg.caption));
  }

  /* ── Enhanced network / topology chart (override PDC.network, Z8 slice 16) ───
     Base PDC.network (pdc-ui.js) always labels every node, with no way to hide
     labels on a busy graph. This override keeps the identical radial layout +
     blast-radius hover and adds cfg.showLabels. Base kept as PDC._networkBase. */
  PDC._networkBase = PDC.network;

  PDC.network = function (el, cfg) { reg(el, function () { _networkOpts(el, cfg); }); };

  function _networkOpts(el, cfg) {
    var links = (cfg.links || []).filter(function (l) { return (+l.value || 0) > 0; });
    var h = cfg.height || 360;
    if (!links.length) { el.innerHTML = '<div class="empty">No connections</div>'; return; }
    var o = mkSVG(el, h), s = o.s, w = o.w, fmt = cfg.fmt || PDC.fmt.abbr;
    var showLabels = cfg.showLabels !== false;
    var N = {}, order = [];
    links.forEach(function (l) {
      [l.source, l.target].forEach(function (k) { if (!N[k]) { N[k] = { name: k, val: 0, adj: {} }; order.push(k); } });
      N[l.source].val += +l.value; N[l.target].val += +l.value;
      N[l.source].adj[l.target] = 1; N[l.target].adj[l.source] = 1;
    });
    order.sort(function (a, b) { return N[b].val - N[a].val; });
    var n = order.length, cx = w / 2, cy = h / 2 + 4, r = Math.min(w, h) / 2 - 58,
      maxV = Math.max.apply(null, order.map(function (k) { return N[k].val; })) || 1,
      maxL = Math.max.apply(null, links.map(function (l) { return l.value; })) || 1;
    order.forEach(function (k, i) { var a = -Math.PI / 2 + i / n * 2 * Math.PI; var nd = N[k]; nd.a = a; nd.x = cx + r * Math.cos(a); nd.y = cy + r * Math.sin(a); nd.rad = 5 + Math.sqrt(nd.val / maxV) * 16; nd.i = i; });
    var edgeEls = [];
    links.slice().sort(function (a, b) { return b.value - a.value; }).forEach(function (l, i) {
      var u = N[l.source], vv = N[l.target], col = cfg.color ? cfg.color(l.source) : PDC.color(u.i);
      var cpx = cx + (((u.x + vv.x) / 2) - cx) * 0.35, cpy = cy + (((u.y + vv.y) / 2) - cy) * 0.35;
      var p = S("path", { d: "M" + u.x.toFixed(1) + "," + u.y.toFixed(1) + " Q" + cpx.toFixed(1) + "," + cpy.toFixed(1) + " " + vv.x.toFixed(1) + "," + vv.y.toFixed(1),
        fill: "none", stroke: col, "stroke-width": Math.max(1, Math.sqrt(l.value / maxL) * 7), opacity: 0, "stroke-linecap": "round" });
      _tip(p, "<b>" + l.source + " &harr; " + l.target + "</b><br>" + fmt(l.value) + (l.conns != null ? " &middot; " + PDC.fmt.n(l.conns) + " connections" : ""));
      p._u = l.source; p._v = l.target; p._base = Math.min(.5, .18 + l.value / maxL * .4); edgeEls.push(p); s.appendChild(p);
      if (canAnim()) {
        (function (pp, delay) { setTimeout(function () { pp.style.transition = "opacity .5s ease"; pp.setAttribute("opacity", pp._base); }, delay); })(p, animD(60 + i * 26));
      } else { p.setAttribute("opacity", p._base); }
    });
    var nodeEls = {};
    function focus(k) {
      edgeEls.forEach(function (p) { var on2 = (p._u === k || p._v === k); p.setAttribute("opacity", k ? (on2 ? .92 : .05) : p._base); });
      order.forEach(function (nk) { var g2 = nodeEls[nk]; var lit = !k || nk === k || N[k].adj[nk]; g2.setAttribute("opacity", lit ? 1 : .22); });
    }
    order.forEach(function (k) {
      var nd = N[k];
      var grp = S("g", { opacity: 1, style: "cursor:pointer" });
      var c = S("circle", { cx: nd.x, cy: nd.y, r: nd.rad, fill: cfg.color ? cfg.color(k) : PDC.color(nd.i), stroke: "#fff", "stroke-width": 1.5 });
      _tip(c, "<b>" + k + "</b><br>" + fmt(nd.val) + " total &middot; " + Object.keys(nd.adj).length + " links");
      grp.appendChild(c);
      var anc = Math.cos(nd.a) < -0.3 ? "end" : Math.cos(nd.a) > 0.3 ? "start" : "middle";
      var lx = nd.x + Math.cos(nd.a) * (nd.rad + 6), ly = nd.y + Math.sin(nd.a) * (nd.rad + 6) + (Math.sin(nd.a) > 0.3 ? 9 : Math.sin(nd.a) < -0.3 ? -2 : 3);
      if (showLabels) grp.appendChild(S("text", { x: lx, y: ly, "text-anchor": anc, fill: "var(--text)", "font-size": "11", "font-weight": "700" }, PDC.fmt.trunc(k, 14)));
      grp.addEventListener("mouseover", function () { focus(k); });
      grp.addEventListener("mouseout", function () { focus(null); });
      nodeEls[k] = grp; s.appendChild(grp);
    });
    if (cfg.caption) s.appendChild(S("text", { x: cx, y: cy, "text-anchor": "middle", fill: "var(--muted)", "font-size": "10", "font-weight": "700" }, cfg.caption));
  }

})();
