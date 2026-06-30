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
  function mkSVG(el, h) { el.innerHTML = ""; var w = W(el); var s = S("svg", { viewBox: "0 0 " + w + " " + h, width: "100%", height: h }); el.appendChild(s); return { s: s, w: w, h: h }; }
  function reg(el, fn) { PDC._reg.push(fn); fn(); }
  var RM = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function niceMax(m) { if (m <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(m))); var n = m / p; var step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10; return step * p; }

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
      var d = "M" + xs(0) + "," + ys(b.hi[0]);
      for (var i = 1; i < n; i++) d += "L" + xs(i) + "," + ys(b.hi[i]);
      for (var j = n - 1; j >= 0; j--) d += "L" + xs(j) + "," + ys(b.lo[j]);
      d += "Z";
      var p = S("path", { d: d, fill: col, opacity: 0.82, stroke: col, "stroke-width": 1 }); s.appendChild(p); bandEls.push(p);
      if (!RM) { p.style.opacity = "0"; setTimeout(function () { p.style.transition = "opacity .5s ease"; p.style.opacity = "0.82"; }, 60 + bi * 70); }
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
      r.addEventListener("mousemove", function (e) { PDC.showTip(e, "<b>" + lb + "</b><br>" + (bars.name || "Bars") + ": " + fmt(bv[i]) + "<br>" + (line.name || "Line") + ": " + fmt2(lv[i])); });
      r.addEventListener("mouseout", PDC.hideTip);
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
      var rect = S("rect", { x: bx + bPad, y: yTop, width: bw - bPad * 2, height: bh, rx: 2, fill: col, opacity: 0.9 });
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
      if (!RM) {
        rect.style.opacity = 0;
        (function (el_, idx_) {
          setTimeout(function () { el_.style.transition = "opacity .4s ease"; el_.style.opacity = 0.9; }, 30 + idx_ * 45);
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
      var rect = S("rect", { x: barX, y: barY, width: barW, height: barH, rx: 3, fill: col, opacity: 0.85 });
      (function (lb_, v_, prevV_) {
        rect.addEventListener("mousemove", function (e) {
          var html = "<b>" + lb_ + "</b><br>" + fmt(v_);
          if (prevV_ > 0) html += "<br><span class='muted'>" + Math.round(v_ / prevV_ * 100) + "% of previous</span>";
          PDC.showTip(e, html);
        });
      })(labels[i], v, i > 0 ? (+values[i - 1] || 0) : 0);
      rect.addEventListener("mouseout", PDC.hideTip);
      s.appendChild(rect);
      if (!RM) {
        rect.style.opacity = 0;
        (function (el_, idx_) {
          setTimeout(function () { el_.style.transition = "opacity .45s ease"; el_.style.opacity = 0.85; }, 30 + idx_ * 55);
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
      p.addEventListener("mousemove", function (e) { PDC.showTip(e, tip); });
      p.addEventListener("mouseout", PDC.hideTip);
      if (!RM) { p.style.opacity = 0; setTimeout(function () { p.style.transition = "opacity .45s ease"; p.style.opacity = opac; }, delay); }
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
      if (!RM) { bar.setAttribute("width", 0); setTimeout((function (b, fw) { return function () { b.style.transition = "width .6s ease"; b.setAttribute("width", fw); }; })(bar, barW), 40 + ri * 65); }
      var tipTxt = "<b>" + (row.label || "") + "</b><br>Actual: " + fmtFn(+row.value || 0) + (row.target != null ? "<br>Target: " + fmtFn(+row.target) : "");
      bar.addEventListener("mousemove", function (e) { PDC.showTip(e, tipTxt); });
      bar.addEventListener("mouseout", PDC.hideTip);
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
    // roll back to the Monday of the first week
    var dow = firstDate.getDay(); // 0=Sun
    var startDay = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate() - ((dow + 6) % 7));
    var weeksTotal = Math.max(1, Math.ceil(((lastDate - startDay) / 86400000 + 7) / 7));
    weeksTotal = Math.min(weeksTotal, 54);
    var MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    var DOW_LABELS   = ["M", "", "W", "", "F", "", "S"];
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
    var curColor = PDC.cssvar("--pentaho") || "#005bb5", prevMonth = -1;
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
            cell.addEventListener("mousemove", function (e) { PDC.showTip(e, "<b>" + d + "</b><br>" + fmtFn(v)); });
            cell.addEventListener("mouseout", PDC.hideTip);
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
      if (!RM) { poly.style.opacity = "0"; setTimeout(function () { poly.style.transition = "opacity .5s ease"; poly.style.opacity = "1"; }, 60 + si * 80); }
      pts.forEach(function (p, i) {
        var dot = S("circle", { cx: p[0], cy: p[1], r: 3, fill: col, stroke: PDC.cssvar("--panel-bg"), "stroke-width": 1.2 });
        dot.addEventListener("mousemove", function (e) { PDC.showTip(e, "<b>" + labels[i] + "</b><br>" + (se.name || ("Series " + (si + 1))) + ": " + fmt(+se.values[i] || 0)); });
        dot.addEventListener("mouseout", PDC.hideTip);
        s.appendChild(dot); seEls.push(dot);
      });
      radarEls.push(seEls);
    });
    if (cfg.legend !== false) _toggleLegend(el, series.map(function (se, i) {
      return { name: se.name || ("Series " + (i + 1)), color: se.color || P[i % 10], els: radarEls[i], base: "1" };
    }));
  }
})();
