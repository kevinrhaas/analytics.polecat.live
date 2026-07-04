/* ============================================================================
   model.js — PDC Dashboard Studio canonical model
   The chart registry + spec helpers shared by the builder, the live preview
   render runtime, and every exporter (CDF html / CDE .cdfde+.wcdf / .cda).
   Pure data + helpers; no DOM. Loaded as a plain <script> -> window.Studio.
   ============================================================================ */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  /* ---- value formatters (names map to PDC.fmt; 'plain' = identity) ---- */
  Studio.FORMATS = [
    { id: "abbr",  label: "Abbreviated (1.2K)" },
    { id: "n",     label: "Number (1,200)" },
    { id: "money", label: "Money ($1.2K)" },
    { id: "pct",   label: "Percent (12.3%)" },
    { id: "gb",    label: "Storage (GB/TB)" },
    { id: "bytes", label: "Bytes (KB/MB/GB)" },
    { id: "plain", label: "Plain text" }
  ];
  /* ---- color tokens offered in the inspector ---- */
  Studio.COLOR_TOKENS = [
    "--pentaho", "--pdc", "--c1", "--c2", "--c3", "--c4", "--c5",
    "--c6", "--c7", "--c8", "--c9", "--c10", "--good", "--warn", "--bad", "--info"
  ];
  Studio.KPI_STATES = [
    { id: "",       label: "Default (blue)" },
    { id: "purple", label: "Purple" },
    { id: "good",   label: "Good (green)" },
    { id: "warn",   label: "Warn (amber)" },
    { id: "bad",    label: "Bad (red)" }
  ];

  /* ---- Z7: statistical KPI computations ----
     A KPI normally just reads its value column from the DA's first row (an
     already-aggregated query). `agg` lets a KPI instead compute a statistic
     across every row the DA returns — handy for binding a KPI straight to a
     detail/chart-shaped query ("p90 response time", "median deal size")
     without hand-writing a separate aggregate SQL query for it. */
  Studio.KPI_AGGS = [
    ["first",  "First row (default)"],
    ["sum",    "Sum"],
    ["avg",    "Average"],
    ["median", "Median"],
    ["min",    "Min"],
    ["max",    "Max"],
    ["p90",    "90th percentile"],
    ["p95",    "95th percentile"],
    ["stddev", "Std deviation"],
    ["variance", "Variance"],
    ["range",  "Range (max − min)"],
    ["zscore", "Z-score (latest vs. mean)"],
    ["corr",   "Correlation (vs. Compare-to column)"]
  ];
  // Pure function: values (numbers) + an id from KPI_AGGS -> a single number. "first" is handled
  // by the caller (it needs the raw row, not just the column) so it's never passed in here.
  Studio.aggregate = function (values, agg) {
    var v = (values || []).map(Number).filter(function (n) { return !isNaN(n); });
    if (!v.length) return 0;
    if (agg === "sum") return v.reduce(function (a, b) { return a + b; }, 0);
    if (agg === "min") return Math.min.apply(null, v);
    if (agg === "max") return Math.max.apply(null, v);
    var mean = v.reduce(function (a, b) { return a + b; }, 0) / v.length;
    if (agg === "avg") return mean;
    var variance = v.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / v.length;
    var sd = Math.sqrt(variance);
    if (agg === "stddev") return sd;
    if (agg === "variance") return variance;
    // How many std-deviations the most recent row sits from the distribution's mean —
    // a quick anomaly/outlier read (e.g. "is today's number normal?") without a separate query.
    if (agg === "zscore") return sd === 0 ? 0 : (v[v.length - 1] - mean) / sd;
    // median / percentiles / range all need a sorted copy
    var sorted = v.slice().sort(function (a, b) { return a - b; });
    if (agg === "range") return sorted[sorted.length - 1] - sorted[0];
    if (agg === "median") return Studio.percentileOf(sorted, 50);
    if (agg === "p90") return Studio.percentileOf(sorted, 90);
    if (agg === "p95") return Studio.percentileOf(sorted, 95);
    return sorted[0];
  };
  // Linear-interpolation percentile over an already-sorted numeric array (standard "R-7" method).
  Studio.percentileOf = function (sorted, p) {
    if (!sorted.length) return 0;
    if (sorted.length === 1) return sorted[0];
    var idx = (p / 100) * (sorted.length - 1);
    var lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  // Pearson correlation coefficient between two same-length numeric series (-1..1), pairwise —
  // rows where either side isn't a finite number are dropped together. Used by the KPI Aggregation
  // picker's "Correlation" option (needs a second column, the KPI's existing Compare-to field).
  Studio.pearsonCorr = function (a, b) {
    var n = Math.min((a || []).length, (b || []).length), xs = [], ys = [];
    for (var i = 0; i < n; i++) {
      var x = Number(a[i]), y = Number(b[i]);
      if (!isNaN(x) && !isNaN(y)) { xs.push(x); ys.push(y); }
    }
    if (xs.length < 2) return 0;
    var mx = xs.reduce(function (s, v) { return s + v; }, 0) / xs.length;
    var my = ys.reduce(function (s, v) { return s + v; }, 0) / ys.length;
    var num = 0, dx2 = 0, dy2 = 0;
    for (var j = 0; j < xs.length; j++) {
      var dx = xs[j] - mx, dy = ys[j] - my;
      num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
    }
    var denom = Math.sqrt(dx2 * dy2);
    return denom === 0 ? 0 : num / denom;
  };
  // Z6: pick a readable foreground (near-black or near-white) for an arbitrary background hex,
  // via standard WCAG relative luminance. Used by the custom "Header background color" so a light
  // banner pick automatically gets dark text instead of the default white going invisible.
  Studio.contrastFg = function (hex) {
    var h = (hex || "").replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    if (!/^[0-9a-f]{6}$/i.test(h)) return "#ffffff";
    var r = parseInt(h.substr(0, 2), 16) / 255, g = parseInt(h.substr(2, 2), 16) / 255, b = parseInt(h.substr(4, 2), 16) / 255;
    var lin = function (c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    var lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return lum > 0.42 ? "#12213b" : "#ffffff";
  };

  /* ---- N-AI: smart chart recommender ----
     Given a query's own columns + sample rows, suggest the 2-3 best-fit chart
     types with a one-line "why" — a lightweight assistant over the chart-type
     gallery for newcomers who don't yet know which of the 51 types fits their
     data shape. Pure, no DOM; classification is a simplified version of the
     same numeric/date heuristics autoPickCols() (studio.js) already uses. */
  Studio.classifyCols = function (cols, rows) {
    var DATEISH = /date|month|day|period|time|year|week/i;
    var numeric = [], strings = [], dateish = [];
    (cols || []).forEach(function (c, i) {
      if (DATEISH.test(c)) { dateish.push(c); return; }
      var vals = (rows || []).map(function (r) { return r[i]; }).filter(function (v) { return v !== "" && v != null; });
      var isNum = vals.length > 0 && vals.every(function (v) { return !isNaN(Number(v)); });
      (isNum ? numeric : strings).push(c);
    });
    return { numeric: numeric, strings: strings, dateish: dateish };
  };
  Studio.recommendCharts = function (cols, rows) {
    if (!cols || !cols.length || !rows || !rows.length) return [];
    var k = Studio.classifyCols(cols, rows);
    var n = rows.length;
    var strIdx = k.strings.length ? cols.indexOf(k.strings[0]) : -1;
    var cardinality = strIdx >= 0 ? new Set(rows.map(function (r) { return r[strIdx]; })).size : 0;
    var picks = [];
    function add(type, why) {
      if (!Studio.CHARTS[type] || picks.length >= 3 || picks.some(function (p) { return p.type === type; })) return;
      picks.push({ type: type, label: Studio.CHARTS[type].label, why: why });
    }
    if (k.dateish.length && k.numeric.length) {
      add("line", "Has a time-like column (" + k.dateish[0] + ") — good for showing a trend over time.");
    }
    if (k.strings.length && k.numeric.length) {
      add("bars", "A category (" + k.strings[0] + ") plus a number is the classic side-by-side comparison.");
      if (cardinality > 1 && cardinality <= 7) {
        add("donut", k.strings[0] + " has only " + cardinality + " distinct values — good for a part-to-whole view.");
      }
    }
    if (k.numeric.length >= 2 && n >= 5) {
      add("scatter", "Two numeric columns across " + n + " rows — a scatter plot can reveal a relationship.");
    }
    if (cols.length >= 4) {
      add("table", "This query returns " + cols.length + " columns — a table shows every field at once.");
    }
    if (n === 1 && k.numeric.length) {
      add("kpi", "A single row is best summarized as one headline number.");
    }
    if (!picks.length && k.numeric.length) add("bars", "A safe general-purpose default for this data shape.");
    return picks.slice(0, 3);
  };

  /* ---- N-AI: "Explain this chart" auto-insight narration ----
     Pure client-side stats over a chart's own sample rows (no API, ties to Z7): trend
     direction via OLS slope, the single biggest point-to-point move, and any outlier
     more than 2 std-deviations from the mean. Returns a short plain-English paragraph,
     or null when there isn't enough numeric data to say anything meaningful. */
  Studio.abbrNum = function (n) {
    if (n == null || isNaN(n)) return "0";
    var sign = n < 0 ? "-" : ""; n = Math.abs(n);
    if (n >= 1e9) return sign + (n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace(/\.0$/, "") + "B";
    if (n >= 1e6) return sign + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return sign + (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K";
    return sign + (Math.round(n * 100) / 100).toLocaleString();
  };
  // Shared by computeInsights() and notablePoint() below: {label,value,index} points for a
  // label/value column pair (NaN values dropped), plus their mean + population std-dev.
  function numericSeries(cols, rows, labelCol, valueCol) {
    var vi = (cols || []).indexOf(valueCol);
    if (vi < 0 || !rows || rows.length < 2) return null;
    var li = (cols || []).indexOf(labelCol);
    var pts = rows.map(function (r, i) {
      return { label: li >= 0 ? r[li] : "row " + (i + 1), value: Number(r[vi]), index: i };
    }).filter(function (p) { return !isNaN(p.value); });
    if (pts.length < 2) return null;
    var n = pts.length;
    var values = pts.map(function (p) { return p.value; });
    var mean = values.reduce(function (a, b) { return a + b; }, 0) / n;
    var sd = Math.sqrt(values.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / n);
    return { pts: pts, values: values, n: n, mean: mean, sd: sd };
  }
  // The point furthest from the mean, if beyond 2 std-deviations — null otherwise.
  function findOutlier(pts, mean, sd) {
    if (sd <= 0) return null;
    var outlier = null, bestZ = 0;
    pts.forEach(function (p) {
      var z = (p.value - mean) / sd;
      if (Math.abs(z) > Math.abs(bestZ)) { bestZ = z; outlier = p; }
    });
    return (outlier && Math.abs(bestZ) > 2) ? { point: outlier, z: bestZ } : null;
  }
  // The biggest single point-to-point move, if any.
  function findBiggestMove(pts) {
    var biggest = null;
    for (var j = 1; j < pts.length; j++) {
      var d = pts[j].value - pts[j - 1].value;
      if (!biggest || Math.abs(d) > Math.abs(biggest.delta)) biggest = { delta: d, point: pts[j] };
    }
    return (biggest && Math.abs(biggest.delta) > 0) ? biggest : null;
  }

  Studio.computeInsights = function (cols, rows, labelCol, valueCol) {
    var series = numericSeries(cols, rows, labelCol, valueCol);
    if (!series) return null;
    var pts = series.pts, values = series.values, n = series.n, mean = series.mean, sd = series.sd;
    var sentences = [];

    // Trend: sign + magnitude of an OLS slope fit to point index -> value.
    var sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (var i = 0; i < n; i++) { sumX += i; sumY += values[i]; sumXY += i * values[i]; sumXX += i * i; }
    var denom = n * sumXX - sumX * sumX;
    var slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
    var totalChange = slope * (n - 1);
    var relChange = mean !== 0 ? totalChange / Math.abs(mean) : 0;
    if (Math.abs(relChange) < 0.03) {
      sentences.push("Overall, " + valueCol + " has stayed roughly flat across " + n + " points (avg " + Studio.abbrNum(mean) + ").");
    } else {
      sentences.push("Overall, " + valueCol + " trends " + (slope > 0 ? "upward" : "downward") +
        " across " + n + " points, moving about " + Studio.abbrNum(Math.abs(totalChange)) +
        " (avg " + Studio.abbrNum(mean) + ").");
    }

    // Biggest single point-to-point move.
    var biggest = findBiggestMove(pts);
    if (biggest) {
      sentences.push("The biggest single move is at “" + biggest.point.label + "”, " +
        (biggest.delta > 0 ? "up " : "down ") + Studio.abbrNum(Math.abs(biggest.delta)) + " from the prior point.");
    }

    // Outlier: the point furthest from the mean, if beyond 2 std-deviations.
    var outlierHit = findOutlier(pts, mean, sd);
    if (outlierHit) {
      sentences.push("“" + outlierHit.point.label + "” stands out as an outlier at " + Studio.abbrNum(outlierHit.point.value) +
        " (" + Math.abs(outlierHit.z).toFixed(1) + "× std-dev from the mean).");
    }

    // Seasonality: the lag with the strongest autocorrelation, if it's convincing.
    // Detrend first (subtract the same OLS fit line used for the trend sentence above) —
    // a plain monotonic trend is trivially "autocorrelated" at every lag (two shifted
    // copies of a straight climb still track each other), so testing the raw values
    // would flag ordinary growth as fake seasonality. Working on the residuals isolates
    // the actual repeating wiggle, if there is one. Tries every candidate period from 2
    // up to n/2 (capped at 12 — a year of months is the longest cycle worth calling out
    // in a one-line insight).
    var interceptOLS = (sumY - slope * sumX) / n;
    var residuals = values.map(function (v, i) { return v - (interceptOLS + slope * i); });
    var maxPeriod = Math.min(12, Math.floor(n / 2));
    if (maxPeriod >= 2) {
      var bestPeriod = 0, bestR = 0;
      for (var p = 2; p <= maxPeriod; p++) {
        var a = residuals.slice(p), b = residuals.slice(0, n - p), m = a.length;
        if (m < 2) continue;
        var ma = a.reduce(function (x, y) { return x + y; }, 0) / m;
        var mb = b.reduce(function (x, y) { return x + y; }, 0) / m;
        var num = 0, da = 0, db = 0;
        for (var k = 0; k < m; k++) { num += (a[k] - ma) * (b[k] - mb); da += (a[k] - ma) * (a[k] - ma); db += (b[k] - mb) * (b[k] - mb); }
        var rDenom = Math.sqrt(da * db);
        var r = rDenom === 0 ? 0 : num / rDenom;
        if (r > bestR) { bestR = r; bestPeriod = p; }
      }
      if (bestPeriod && bestR > 0.6) {
        sentences.push("It also shows a repeating pattern roughly every " + bestPeriod + " points (autocorrelation " + bestR.toFixed(2) + ").");
      }
    }
    return sentences.join(" ");
  };

  /* ---- N-AI: "auto-placed callout markers on the notable points" ----
     Picks the single most notable point computeInsights already narrates in prose —
     the outlier (if beyond 2 std-dev) else the biggest single point-to-point move —
     and returns its position as (x%, y%) of the chart body, ready to drop straight
     into a panel's `callout` overlay (see the Callout arrow inspector section).
     x% comes from the point's position along the series (index / (n-1)); y% comes
     from where its value falls within the observed min/max range (higher value =
     smaller y%, since the chart's y-axis grows upward but SVG y-coordinates grow
     downward), clamped to a 5–95% band so the bubble never clips the chart edge.
     Pure/independently-testable, same offline-only spirit as computeInsights. */
  Studio.notablePoint = function (cols, rows, labelCol, valueCol) {
    var series = numericSeries(cols, rows, labelCol, valueCol);
    if (!series) return null;
    var pts = series.pts, values = series.values, n = series.n, mean = series.mean, sd = series.sd;
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);

    var chosen = null, kind = null;
    var outlierHit = findOutlier(pts, mean, sd);
    if (outlierHit) { chosen = outlierHit.point; kind = "outlier"; }
    if (!chosen) {
      var biggest = findBiggestMove(pts);
      if (biggest) { chosen = biggest.point; kind = "move"; }
    }
    if (!chosen) return null;

    var xPct = n > 1 ? Math.round(chosen.index / (n - 1) * 100) : 50;
    var yPct = max > min ? Math.round(100 - (chosen.value - min) / (max - min) * 100) : 50;
    yPct = Math.max(5, Math.min(95, yPct));
    return { label: String(chosen.label), value: chosen.value, x: xPct, y: yPct, kind: kind };
  };

  /* ---- Z7/N-AI: correlation insight for two-numeric-variable charts (scatter/bubble) ----
     Pearson's r between the bound X and Y columns, in the same plain-English style as
     computeInsights above. Kept separate because it needs two series, not one. */
  Studio.computeCorrelation = function (cols, rows, xCol, yCol) {
    var xi = (cols || []).indexOf(xCol), yi = (cols || []).indexOf(yCol);
    if (xi < 0 || yi < 0 || !rows) return null;
    var pts = rows.map(function (r) { return [Number(r[xi]), Number(r[yi])]; })
      .filter(function (p) { return !isNaN(p[0]) && !isNaN(p[1]); });
    var n = pts.length;
    if (n < 3) return null;
    var sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
    pts.forEach(function (p) { sumX += p[0]; sumY += p[1]; sumXY += p[0] * p[1]; sumXX += p[0] * p[0]; sumYY += p[1] * p[1]; });
    var denom = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
    if (denom === 0) return null;
    var r = (n * sumXY - sumX * sumY) / denom;
    var abs = Math.abs(r);
    if (abs < 0.2) {
      return "Across " + n + " points, " + xCol + " and " + yCol + " show little to no linear relationship (r = " + r.toFixed(2) + ").";
    }
    var strength = abs >= 0.7 ? "strong" : abs >= 0.4 ? "moderate" : "weak";
    var direction = r > 0 ? "positive" : "negative";
    return "Across " + n + " points, " + xCol + " and " + yCol + " show a " + strength + " " + direction +
      " correlation (r = " + r.toFixed(2) + ") — as " + xCol + " " + (r > 0 ? "increases, " + yCol + " tends to increase too." : "increases, " + yCol + " tends to decrease.");
  };

  /* ---- N-DATA: data quality watchdog (added 2026-07-03) ----
     Pure client-side profiling of a data access's own sample rows — flags common smells
     (blank/null values, a column that's the same value on every sampled row, duplicate
     rows) so a builder notices a likely data problem before ever putting a chart on top
     of it. Same "computed from the sample, offline, no API" spirit as computeInsights;
     kept separate since it profiles the WHOLE row set rather than reasoning about one
     value column. Sample rows are capped small (see sampleRows), so this is a quick smell
     test on the preview, not an exhaustive audit of the real data. */
  Studio.dataQualityIssues = function (cols, rows) {
    if (!cols || !cols.length || !rows || !rows.length) return [];
    var issues = [];
    cols.forEach(function (col, i) {
      var vals = rows.map(function (r) { return r[i]; });
      var blankCount = vals.filter(function (v) { return v == null || v === ""; }).length;
      if (blankCount > 0) issues.push({ type: "blank", col: col, count: blankCount });
      var nonBlank = vals.filter(function (v) { return v != null && v !== ""; });
      if (nonBlank.length > 1 && nonBlank.every(function (v) { return v === nonBlank[0]; })) {
        issues.push({ type: "constant", col: col, value: nonBlank[0] });
      }
      // Inconsistent type mix: a column whose sample carries both number-looking and
      // text-looking values (e.g. a quantity column with a stray "N/A") — usually a data error.
      var numeric = nonBlank.filter(function (v) { return typeof v === "number" || /^-?\d+(\.\d+)?$/.test(String(v).trim()); });
      var textLike = nonBlank.length - numeric.length;
      if (numeric.length > 0 && textLike > 0) {
        issues.push({ type: "mixed", col: col, numericCount: numeric.length, textCount: textLike });
      }
    });
    var seen = {}, dupCount = 0;
    rows.forEach(function (r) { var key = JSON.stringify(r); seen[key] = (seen[key] || 0) + 1; });
    Object.keys(seen).forEach(function (k) { if (seen[k] > 1) dupCount += seen[k] - 1; });
    if (dupCount > 0) issues.push({ type: "duplicate", count: dupCount });
    return issues;
  };
  // Plain-English rendering of one Studio.dataQualityIssues() entry.
  Studio.dataQualityMessage = function (issue) {
    if (issue.type === "blank") return "“" + issue.col + "” has " + issue.count + " blank/missing value" + (issue.count === 1 ? "" : "s") + " in this sample.";
    if (issue.type === "constant") return "“" + issue.col + "” is the same value (" + JSON.stringify(issue.value) + ") on every sampled row — check whether this column is useful here.";
    if (issue.type === "duplicate") return issue.count + " duplicate row" + (issue.count === 1 ? "" : "s") + " found in this sample — check for an unintended join fan-out or a missing dedup step.";
    if (issue.type === "mixed") return "“" + issue.col + "” mixes numbers and text — " + issue.numericCount + " numeric-looking and " + issue.textCount + " text value" + (issue.textCount === 1 ? "" : "s") + " in this sample — check for a data type error.";
    return "";
  };

  /* ---- N-DATA: dashboard-wide formula language, first cut (added 2026-07-04) ----
     A data access's "Calculated columns" (formula: "=[col1] + [col2]") already round-trip
     through the real Pentaho CDA export as <CalculatedColumns> XML — a real Pentaho server
     evaluates them. But the builder never evaluates the formula itself, so (a) the offline
     preview always showed a blank/undefined value for a calc column and (b) the calc column's
     name was never offered as a real column a panel/KPI could bind to, silently making the
     whole section a no-op for the six direct-query connectors (DuckDB/SQLite/Snowflake/
     Databricks/BigQuery/Generic SQL — none of which go through a CDA server to evaluate it).
     `evalFormula` is a small, safe recursive-descent arithmetic parser — no eval()/Function(),
     only add/subtract/multiply/divide, parens, numbers, [column] references, and the two named
     functions below — safe to run on user-typed text.
     `ctx` (added for pctChange()/movingAvg()) gives the parser row-position + whole-column
     access: { index: <row's position>, series: function(colName){ returns that column's numeric
     values for EVERY row, same order } }. Plain arithmetic never touches it — only the two named
     functions need more than the current row. */
  Studio.evalFormula = function (formula, rowObj, ctx) {
    var s = String(formula || "").replace(/^\s*=\s*/, ""); // formulas are typed as "=[a]+[b]"
    var i = 0;
    function skipWs() { while (i < s.length && /\s/.test(s[i])) i++; }
    function parseExpr() {
      var v = parseTerm();
      for (;;) {
        skipWs();
        var c = s[i];
        if (c === "+" || c === "-") { i++; var r = parseTerm(); v = c === "+" ? v + r : v - r; }
        else break;
      }
      return v;
    }
    function parseTerm() {
      var v = parseFactor();
      for (;;) {
        skipWs();
        var c = s[i];
        if (c === "*" || c === "/") {
          i++; var r = parseFactor();
          if (c === "*") v = v * r;
          else { if (r === 0) throw new Error("division by zero"); v = v / r; }
        } else break;
      }
      return v;
    }
    // [colName] — a bare column reference, used both as an ordinary operand and as the
    // required first argument to pctChange()/movingAvg() (they need the column's IDENTITY,
    // not a computed number, so they can look up its values across other rows).
    function parseColRef() {
      if (s[i] !== "[") throw new Error("expected a [column] reference");
      i++; var start = i;
      while (i < s.length && s[i] !== "]") i++;
      if (s[i] !== "]") throw new Error("missing closing ]");
      var name = s.slice(start, i); i++;
      return name;
    }
    // pctChange([col]) / movingAvg([col], n) — the two named functions the formula language
    // supports beyond plain arithmetic. Both need the row's position + the column's full
    // series (via `ctx`), not just the current row, so they can't be plain [col] arithmetic.
    function parseNamedFn(name) {
      i++; // consume "("
      var colName = parseColRef();
      var windowArg = null;
      skipWs();
      if (s[i] === ",") {
        i++; skipWs();
        var numStart = i;
        while (i < s.length && /[0-9.]/.test(s[i])) i++;
        if (i === numStart) throw new Error(name + "()'s second argument must be a number");
        windowArg = parseFloat(s.slice(numStart, i));
      }
      skipWs();
      if (s[i] !== ")") throw new Error("missing closing ) in " + name + "(...)");
      i++;
      if (!ctx || typeof ctx.series !== "function" || ctx.index == null)
        throw new Error(name + "() isn't available here");
      var series = ctx.series(colName);
      if (!series) throw new Error("unknown column [" + colName + "] in " + name + "()");
      if (name === "pctChange") {
        if (ctx.index <= 0) throw new Error("pctChange() has no prior row to compare against");
        var prev = series[ctx.index - 1], cur = series[ctx.index];
        if (!isFinite(prev) || prev === 0) throw new Error("pctChange()'s previous value isn't a usable number");
        return ((cur - prev) / prev) * 100; // expressed in percentage points, e.g. 12.5 for +12.5%
      }
      // movingAvg([col], n) — same "partial window at the start" semantics as the line chart's
      // own Show moving average overlay (studio-charts.js), so the two never disagree: average
      // of the trailing n values (default 3) ending at (and including) the current row.
      var w = Math.max(1, Math.round(windowArg || 3));
      var from = Math.max(0, ctx.index - w + 1), sum = 0, cnt = 0;
      for (var j = from; j <= ctx.index; j++) { var v = series[j]; if (isFinite(v)) { sum += v; cnt++; } }
      if (!cnt) throw new Error("movingAvg() has no numeric values in its window");
      return sum / cnt;
    }
    function parseFactor() {
      skipWs();
      var c = s[i];
      if (c === "+") { i++; return parseFactor(); }
      if (c === "-") { i++; return -parseFactor(); }
      if (c === "(") {
        i++; var v = parseExpr(); skipWs();
        if (s[i] !== ")") throw new Error("missing closing )");
        i++; return v;
      }
      if (c === "[") {
        var name = parseColRef();
        if (!rowObj || !(name in rowObj)) throw new Error("unknown column [" + name + "]");
        var val = +rowObj[name];
        if (isNaN(val)) throw new Error("[" + name + "] isn't numeric here");
        return val;
      }
      var identMatch = /^(pctChange|movingAvg)\s*\(/.exec(s.slice(i));
      if (identMatch) { i += identMatch[1].length; skipWs(); return parseNamedFn(identMatch[1]); }
      var numStart = i;
      while (i < s.length && /[0-9.]/.test(s[i])) i++;
      if (i === numStart) throw new Error(c ? "unexpected \"" + c + "\"" : "unexpected end of formula");
      return parseFloat(s.slice(numStart, i));
    }
    try {
      if (!s.trim()) throw new Error("empty formula");
      var result = parseExpr();
      skipWs();
      if (i < s.length) throw new Error("unexpected trailing text");
      return { value: result, error: null };
    } catch (e) {
      return { value: null, error: e.message };
    }
  };
  // Appends every valid (name + formula) calc column to {cols, rows}, computing each row's
  // value from that row's OTHER columns. A calc column that fails to evaluate (bad syntax,
  // an unknown/non-numeric reference, pctChange() on the first row, …) becomes `null` for that
  // row rather than throwing. `seriesFor` (memoized per column) is what lets pctChange()/
  // movingAvg() see the WHOLE column, not just the row currently being computed.
  Studio.applyCalcCols = function (cols, rows, calcColumns) {
    cols = cols || []; rows = rows || [];
    var valid = (calcColumns || []).filter(function (c) { return c && c.name && c.formula; });
    if (!valid.length) return { cols: cols.slice(), rows: rows.map(function (r) { return r.slice(); }) };
    var outCols = cols.concat(valid.map(function (c) { return c.name; }));
    var seriesCache = {};
    function seriesFor(name) {
      if (Object.prototype.hasOwnProperty.call(seriesCache, name)) return seriesCache[name];
      var ci = cols.indexOf(name);
      var s = ci < 0 ? null : rows.map(function (r) { return +r[ci]; });
      seriesCache[name] = s;
      return s;
    }
    var outRows = rows.map(function (row, rowIndex) {
      var rowObj = {};
      cols.forEach(function (c, i) { rowObj[c] = row[i]; });
      var out = row.slice();
      valid.forEach(function (c) {
        var r = Studio.evalFormula(c.formula, rowObj, { index: rowIndex, series: seriesFor });
        out.push(r.error ? null : r.value);
      });
      return out;
    });
    return { cols: outCols, rows: outRows };
  };

  // N-DATA: chart types that read best filling an entire row on their own — a lot of
  // rows/columns (Table), long-form prose (Text/annotation), or a wide flow diagram.
  Studio.WIDE_CHART_TYPES = ["table", "richtext", "sankey", "chord", "calHeatmap"];

  // N-DATA: "Auto-arrange" — a one-click reflow of a dashboard's existing panels into a
  // more balanced grid, taking the tedium out of manual drag-resize for a first draft.
  // Pure rearrangement of what's already there: no new spec fields, KPIs are untouched
  // (they already lay out in their own row above the panel grid — see Studio.buildHtml).
  //   - Wide chart types (Studio.WIDE_CHART_TYPES) get a full-width row of their own.
  //   - Everything else defaults to a single grid column (the builder's own resize
  //     handles still let a user widen any panel afterward — this is a starting point,
  //     not a lock).
  //   - Panels sharing a first tag are clustered together (stable within a cluster, and
  //     clusters keep their first-seen order) so related content reads as one group.
  // Returns a NEW array of shallow-cloned panels; does not mutate the input.
  Studio.autoArrange = function (panels) {
    var list = (panels || []).map(function (p) { return Studio.clone(p); });
    list.forEach(function (p) {
      var type = p.chart && p.chart.type;
      p.span = Studio.WIDE_CHART_TYPES.indexOf(type) >= 0 ? "full" : 1;
    });
    var clusterOrder = [], clusters = {};
    list.forEach(function (p) {
      var key = (p.tags && p.tags[0]) || "";
      if (!clusters[key]) { clusters[key] = []; clusterOrder.push(key); }
      clusters[key].push(p);
    });
    var out = [];
    clusterOrder.forEach(function (key) { out = out.concat(clusters[key]); });
    return out;
  };

  /* ---- chart registry: the heart of the model ----
     Each entry declares how a chart type binds columns + which knobs it exposes,
     plus how it maps to a CDE/CCC component. `fields` drives the inspector. */
  Studio.CHARTS = {
    bars: {
      label: "Bar chart", icon: "▭", group: "Comparison",
      desc: "Compare values across categories",
      fields: ["labelCol", "valueCol"],
      opts: [
        { key: "horizontal", type: "bool",   label: "Horizontal", def: true },
        { key: "rotate",     type: "bool",   label: "Rotate labels", def: false },
        { key: "sortBars",   type: "bool",   label: "Sort by value", def: false },
        { key: "showValues", type: "bool",   label: "Show value labels", def: true },
        { key: "fmt",        type: "fmt",    label: "Value format", def: "abbr" },
        { key: "color",      type: "color",  label: "Bar color", def: "--pentaho" },
        { key: "height",     type: "int",    label: "Height (px)", def: 300 }
      ],
      cde: { type: "cccBarChart", extra: function (c) {
        return [["orientation", "Orientation", c.opts && c.opts.horizontal === false ? "vertical" : "horizontal"],
                ["valuesVisible", "Boolean", c.opts && c.opts.showValues === false ? "false" : "true"]]; } }
    },
    donut: {
      label: "Donut / pie", icon: "◍", group: "Composition",
      desc: "Part-to-whole proportions with center label",
      fields: ["labelCol", "valueCol"],
      // Z8 slice 8: donut gets its own type-specific options — the base toolkit always
      // drew slices in row order with a fixed 60%-inner-radius ring and an always-on
      // legend, none of which were adjustable from the inspector.
      opts: [
        { key: "centerCap",  type: "text",  label: "Center caption", def: "Total" },
        { key: "fmt",        type: "fmt",   label: "Value format", def: "abbr" },
        { key: "sortSlices", type: "bool",  label: "Sort slices by value", def: false },
        { key: "showLegend", type: "bool",  label: "Show legend", def: true },
        { key: "innerPct",   type: "range", label: "Inner radius %", def: 60, min: 0, max: 100, step: 5, suffix: "%" },
        { key: "height",     type: "int",   label: "Height (px)", def: 300 }
      ],
      cde: { type: "cccPieChart", extra: function () { return [["valuesVisible", "Boolean", "true"]]; } }
    },
    line: {
      label: "Line / area", icon: "📈", group: "Trend",
      desc: "Track changes over time or sequence",
      fields: ["labelCol", "series"],
      opts: [
        { key: "area",     type: "bool",  label: "Area fill", def: true },
        { key: "smooth",   type: "bool",  label: "Smooth curve", def: false },
        { key: "showDots", type: "bool",  label: "Show data points", def: true },
        { key: "showMA",   type: "bool",  label: "Show moving average", def: false },
        { key: "maWindow", type: "range", label: "Moving avg window (points)", def: 3, min: 2, max: 14, step: 1 },
        { key: "showTrend", type: "bool", label: "Show trend / forecast line", def: false },
        { key: "forecastPeriods", type: "range", label: "Forecast periods ahead (0 = trend only)", def: 0, min: 0, max: 24, step: 1 },
        // Z7 forecasting slice 3: a second forecast method alongside the v187 OLS linear
        // trend — Holt's double exponential smoothing (level + trend, no seasonality yet).
        // Unlike the straight OLS line, the drawn line tracks a smoothed version of the
        // real data (reacts to recent moves, not just the overall slope) before extending
        // linearly into the forecast tail. Only used when "Show trend / forecast line" is on.
        { key: "trendMethod", type: "select", label: "Forecast method", def: "linear",
          choices: [["linear", "Linear trend (OLS)"], ["holt", "Exponential smoothing (Holt)"], ["hw", "Seasonal (Holt-Winters)"]] },
        // N-FUN "live what-if sliders": these three (%, Holt/Holt-Winters knobs) are the
        // clearest "analysis as play" fit in the whole opts model — drag and watch the
        // smoothed/forecast line re-shape live, so they render as range sliders, not a
        // bare number box. min/max/step and the "%" suffix badge are optField()'s (studio.js).
        { key: "alpha", type: "range", label: "Smoothing level α (%, Holt/Holt-Winters only)", def: 30, min: 0, max: 100, step: 5, suffix: "%" },
        { key: "beta",  type: "range", label: "Smoothing trend β (%, Holt/Holt-Winters only)", def: 10, min: 0, max: 100, step: 5, suffix: "%" },
        // Holt-Winters adds a repeating seasonal offset on top of Holt's level+trend —
        // needs at least 2 full seasons of real data (seasonLength * 2 points) to fit;
        // with less it quietly falls back to plain Holt (see holtWintersOf in
        // studio-charts.js).
        { key: "gamma", type: "range", label: "Smoothing seasonality γ (%, Holt-Winters only)", def: 20, min: 0, max: 100, step: 5, suffix: "%" },
        { key: "seasonLength", type: "range", label: "Season length (points, Holt-Winters only)", def: 4, min: 2, max: 12, step: 1 },
        { key: "fmt",      type: "fmt",   label: "Value format", def: "abbr" },
        { key: "height",   type: "int",   label: "Height (px)", def: 300 }
      ],
      cde: { type: "cccLineChart", extra: function () { return [["valuesVisible", "Boolean", "false"]]; } }
    },
    stacked: {
      label: "Stacked bars", icon: "▤", group: "Composition",
      desc: "Segment totals stacked per category",
      fields: ["labelCol", "series"],
      // Z8 slice 10: stacked bars get their own type-specific options — the base
      // toolkit always drew categories in row order with no per-segment value text.
      opts: [
        { key: "rotate",     type: "bool", label: "Rotate labels", def: false },
        { key: "sortStack",  type: "bool", label: "Sort by total", def: false },
        { key: "showValues", type: "bool", label: "Show value labels", def: false },
        { key: "fmt",        type: "fmt",  label: "Value format", def: "abbr" },
        { key: "height",     type: "int",  label: "Height (px)", def: 300 }
      ],
      cde: { type: "cccBarChart", extra: function (c) {
        return [["orientation", "Orientation", "vertical"], ["stacked", "Boolean", "true"],
                ["valuesVisible", "Boolean", c.opts && c.opts.showValues ? "true" : "false"]]; } }
    },
    areaStacked: {
      label: "Stacked area", icon: "◣", group: "Trend",
      desc: "Cumulative filled bands over a sequence",
      fields: ["labelCol", "series"],
      // Z8 slice 13: stacked area gets its own type-specific options — the renderer
      // already supported a legend toggle internally (cfg.legend) but the inspector
      // never exposed it, and bands were always straight-edged with no smoothing.
      opts: [
        { key: "smooth",     type: "bool", label: "Smooth curve", def: false },
        { key: "showLegend", type: "bool", label: "Show legend", def: true },
        { key: "fmt",        type: "fmt",  label: "Value format", def: "abbr" },
        { key: "height",     type: "int",  label: "Height (px)", def: 300 }
      ],
      cde: { type: "cccStackedAreaChart", extra: function () { return [["stacked", "Boolean", "true"], ["valuesVisible", "Boolean", "false"]]; } }
    },

    // ── Stream graph (ThemeRiver layout) ─────────────────────────────────────
    // Like stacked area but the baseline shifts at every data point so the
    // entire stack is visually centered around a midline. Result: organic,
    // flowing ribbon shapes ideal for evolving volume/share of multiple streams.
    // Same data binding as Stacked area (labelCol + multi-series). CDF-only.
    streamgraph: {
      label: "Stream graph", icon: "〰", group: "Trend",
      desc: "Flowing centered ribbons for evolving multi-stream volumes",
      fields: ["labelCol", "series"],
      // Z8 slice 14: the renderer already supported a legend toggle (cfg.legend) and a
      // hardcoded 0.78 band fill-opacity, but neither was ever exposed in the inspector.
      opts: [
        { key: "showLegend",  type: "bool", label: "Show legend", def: true },
        { key: "bandOpacity", type: "range", label: "Band opacity (%)", def: 78, min: 0, max: 100, step: 5, suffix: "%" },
        { key: "fmt",    type: "fmt", label: "Value format", def: "abbr" },
        { key: "height", type: "int", label: "Height (px)", def: 300 }
      ],
      thumb: (function () {
        // Gallery thumbnail: three flowing ribbon shapes centered on a midline
        // Each path is a smooth sinusoidal band; colors match the brand palette.
        var svgW = 120, svgH = 50;
        // Define control points for three organic ribbon bands (top-to-bottom stacking)
        // Top series: ~12px high band floating around y=10
        // Mid series: ~16px high band around y=26
        // Bot series: ~10px high band around y=42
        var bands = [
          { hi: [9,7,11,8,10],  lo: [22,20,24,21,23], c: "#005bb5", op: 0.78 },
          { hi: [23,21,25,22,24], lo: [34,32,36,33,35], c: "#7d3c98", op: 0.75 },
          { hi: [35,33,37,34,36], lo: [44,42,46,43,45], c: "#2e8bd0", op: 0.75 }
        ];
        function thumbPath(lo, hi, nPts) {
          var xs2 = function (i) { return 5 + i * (svgW - 10) / (nPts - 1); };
          var d = "M" + xs2(0) + "," + hi[0];
          for (var i = 1; i < nPts; i++) {
            var cpx = (xs2(i - 1) + xs2(i)) / 2;
            d += " Q" + cpx + "," + hi[i - 1] + " " + xs2(i) + "," + hi[i];
          }
          for (var j = nPts - 1; j >= 0; j--) {
            var cpx2 = j > 0 ? (xs2(j - 1) + xs2(j)) / 2 : xs2(j);
            d += " Q" + cpx2 + "," + lo[Math.min(j, lo.length - 1)] + " " + xs2(j) + "," + lo[j];
          }
          return d + "Z";
        }
        var paths = bands.map(function (b) {
          return '<path d="' + thumbPath(b.lo, b.hi, 5) + '" fill="' + b.c + '" fill-opacity="' + b.op + '"/>';
        });
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + svgW + ' ' + svgH + '">' +
          '<line x1="5" y1="25" x2="115" y2="25" stroke="#e0e4ef" stroke-width="0.7" stroke-dasharray="3 2"/>' +
          paths.join("") + '</svg>';
      }()),
      cde: null // CDF-only; no CCC stream graph equivalent
    },

    // Parallel coordinates chart — each entity (row) is drawn as a polyline crossing N
    // parallel vertical axes, one axis per numeric dimension. Every axis has its own
    // min/max scale so dimensions with different magnitudes (revenue + margin% + headcount)
    // all fill the same visual height. Hover highlights one entity and dims the rest,
    // making individual multi-metric profiles easy to trace.
    //
    // Data binding: labelCol = entity label (one line per row); series = one column per
    // dimension (axis). Use 3–6 series for best readability.
    //
    // CDF-only via the PDC.parallelCoords extension in studio-charts.js (pdc-ui.js pristine).
    parallelCoords: {
      label: "Parallel coords",
      icon: "⫼",
      group: "Comparison",
      desc: "Multi-dimensional entity profiles across parallel axes",
      fields: ["labelCol", "series"],
      thumb: (function () {
        // Gallery thumbnail: 4 vertical axis lines + 3 colored polylines crossing them
        var W = 120, H = 56;
        var axes = [12, 40, 78, 108]; // x positions
        var lines = [
          { pts: [[12,10],[40,8],[78,20],[108,12]], c: "#005bb5" },
          { pts: [[12,28],[40,38],[78,14],[108,32]], c: "#7d3c98" },
          { pts: [[12,42],[40,22],[78,40],[108,18]], c: "#2e8bd0" }
        ];
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '">';
        // Draw axis lines
        axes.forEach(function (x) { svg += '<line x1="' + x + '" y1="5" x2="' + x + '" y2="52" stroke="#dde3ef" stroke-width="1.2"/>'; });
        // Draw entity polylines + dots
        lines.forEach(function (ln) {
          svg += '<polyline points="' + ln.pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ') + '" fill="none" stroke="' + ln.c + '" stroke-width="1.6" stroke-linejoin="round" opacity=".78"/>';
          ln.pts.forEach(function (p) { svg += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.5" fill="' + ln.c + '" opacity=".78"/>'; });
        });
        return svg + '</svg>';
      }()),
      opts: [
        { key: "opacity", type: "range", label: "Line opacity (%)", def: 70, min: 10, max: 100, step: 5, suffix: "%" },
        { key: "height",  type: "int", label: "Height (px)",      def: 320 }
      ],
      cde: null // CDF-only; no equivalent CCC multi-axis chart
    },
    combo: {
      label: "Bar + line", icon: "◭", group: "Trend",
      desc: "Dual-axis bars and line overlay",
      fields: ["labelCol", "barCol", "lineCol"],
      opts: [
        { key: "fmt",       type: "fmt",   label: "Bar (left) format", def: "abbr" },
        { key: "fmt2",      type: "fmt",   label: "Line (right) format", def: "abbr" },
        { key: "lineColor", type: "color", label: "Line color", def: "--pdc" },
        { key: "color",     type: "color", label: "Bar color", def: "--pentaho" },
        // Z7 follow-up: extend the Line chart's trend-line overlay to Combo's own line
        // series (closes part of the "extending trend/forecast to bars/stacked/combo"
        // backlog note) — a fitted read over the real data only, no forecast tail yet
        // (see app/studio-charts.js's _combo for why). Same field set/labels as Line's,
        // minus forecastPeriods.
        { key: "showTrend", type: "bool", label: "Show trend line (on the line series)", def: false },
        { key: "trendMethod", type: "select", label: "Forecast method", def: "linear",
          choices: [["linear", "Linear trend (OLS)"], ["holt", "Exponential smoothing (Holt)"], ["hw", "Seasonal (Holt-Winters)"]] },
        { key: "alpha", type: "range", label: "Smoothing level α (%, Holt/Holt-Winters only)", def: 30, min: 0, max: 100, step: 5, suffix: "%" },
        { key: "beta",  type: "range", label: "Smoothing trend β (%, Holt/Holt-Winters only)", def: 10, min: 0, max: 100, step: 5, suffix: "%" },
        { key: "gamma", type: "range", label: "Smoothing seasonality γ (%, Holt-Winters only)", def: 20, min: 0, max: 100, step: 5, suffix: "%" },
        { key: "seasonLength", type: "range", label: "Season length (points, Holt-Winters only)", def: 4, min: 2, max: 12, step: 1 },
        { key: "height",    type: "int",   label: "Height (px)", def: 300 }
      ],
      cde: null // CDF-only (no clean single CCC equivalent)
    },
    radar: {
      label: "Radar / spider", icon: "✷", group: "Comparison",
      desc: "Multi-metric polygon comparison",
      fields: ["labelCol", "series"],
      opts: [
        { key: "fill",       type: "bool", label: "Fill polygons",     def: true },
        { key: "showLegend", type: "bool", label: "Show legend",       def: true },
        { key: "showDots",   type: "bool", label: "Show vertex dots",  def: true },
        { key: "fmt",        type: "fmt",  label: "Value format",      def: "abbr" },
        { key: "height",     type: "int",  label: "Height (px)",       def: 300 }
      ],
      cde: null // CDF-only (no clean single CCC equivalent)
    },
    waterfall: {
      label: "Waterfall", icon: "↘", group: "Comparison",
      desc: "Running total with incremental steps",
      fields: ["labelCol", "valueCol"],
      opts: [
        { key: "showTotal",  type: "bool", label: "Show total bar", def: true },
        { key: "totalLabel", type: "text", label: "Total label",    def: "Total" },
        { key: "fmt",        type: "fmt",  label: "Value format",   def: "abbr" },
        { key: "height",     type: "int",  label: "Height (px)",    def: 300 }
      ],
      cde: null // CDF-only
    },
    sankey: {
      label: "Sankey (flow)", icon: "⇢", group: "Flow",
      desc: "Flow volume through a multi-step path",
      fields: ["sourceCol", "targetCol", "valueCol"],
      opts: [
        { key: "srcCap",  type: "text", label: "Source caption",       def: "Source" },
        { key: "dstCap",  type: "text", label: "Destination caption",   def: "Destination" },
        { key: "fmt",     type: "fmt",  label: "Value format",          def: "abbr" },
        { key: "height",  type: "int",  label: "Height (px)",           def: 360 }
      ],
      cde: null // CDF-only
    },
    funnel: {
      label: "Funnel", icon: "⋁", group: "Comparison",
      desc: "Conversion drop-off through stages",
      fields: ["labelCol", "valueCol"],
      opts: [
        { key: "showPct", type: "bool", label: "Show conversion %", def: true },
        { key: "fmt",     type: "fmt",  label: "Value format",      def: "abbr" },
        { key: "height",  type: "int",  label: "Height (px)",       def: 300 }
      ],
      cde: null // CDF-only
    },
    chord: {
      label: "Chord / wheel", icon: "◎", group: "Flow",
      desc: "Bidirectional relationships in a circle",
      fields: ["sourceCol", "targetCol", "valueCol"],
      opts: [
        { key: "showLabels", type: "bool", label: "Show arc labels", def: true },
        { key: "fmt",    type: "fmt", label: "Value format", def: "abbr" },
        { key: "height", type: "int", label: "Height (px)",  def: 360 }
      ],
      cde: null // CDF-only
    },
    network: {
      label: "Network / topology", icon: "⬡", group: "Flow",
      desc: "Node-link topology graph",
      fields: ["sourceCol", "targetCol", "valueCol"],
      opts: [
        { key: "showLabels", type: "bool", label: "Show node labels", def: true },
        { key: "fmt",    type: "fmt", label: "Value format", def: "abbr" },
        { key: "height", type: "int", label: "Height (px)",  def: 380 }
      ],
      cde: null // CDF-only; PDC.network uses radial node-link layout with blast-radius hover
    },
    sunburst: {
      label: "Sunburst", icon: "◉", group: "Composition",
      desc: "Hierarchical part-of-whole in rings",
      fields: ["labelCol", "valueCol", "groupCol"],
      opts: [
        { key: "showLabels", type: "bool", label: "Show arc labels", def: true },
        { key: "fmt",        type: "fmt",  label: "Value format",    def: "abbr" },
        { key: "height",     type: "int",  label: "Height (px)",     def: 300 }
      ],
      cde: null // CDF-only; no equivalent CCC chart
    },
    bullet: {
      label: "Bullet chart", icon: "▶", group: "Single value",
      desc: "Actual vs. target with quality bands",
      fields: ["labelCol", "valueCol", "targetCol"],
      opts: [
        { key: "max",    type: "int", label: "Max value (0 = auto)", def: 0 },
        { key: "fmt",    type: "fmt", label: "Value format",         def: "abbr" },
        { key: "height", type: "int", label: "Height (px)",          def: 220 }
      ],
      cde: null // CDF-only; no clean CCC bullet equivalent
    },
    calHeatmap: {
      label: "Calendar heatmap", icon: "⬦", group: "Distribution",
      desc: "Daily density over weeks and months",
      fields: ["dateCol", "valueCol"],
      // Z8 slice 11: calendar heatmap gets its own type-specific options — the base
      // toolkit always used the brand color and always rolled weeks over from Monday,
      // neither of which was adjustable from the inspector.
      opts: [
        { key: "color",     type: "color",  label: "Cell color",     def: "--pentaho" },
        { key: "weekStart", type: "select",  label: "Week starts on", def: "mon",
          choices: [["mon", "Monday"], ["sun", "Sunday"]] },
        { key: "fmt",       type: "fmt",    label: "Value format", def: "n" },
        { key: "height",    type: "int",    label: "Height (px)",  def: 190 }
      ],
      cde: null // CDF-only; requires daily YYYY-MM-DD date column
    },
    treemap: {
      label: "Treemap", icon: "▦", group: "Composition",
      desc: "Rectangles nested and sized by value",
      fields: ["labelCol", "valueCol"],
      // Z8 slice 5: treemap gets its own type-specific options — the base toolkit always
      // drew a title+value label on any tile big enough, with no way to hide it or swap
      // in "% of total" (the question a treemap usually exists to answer).
      opts: [
        { key: "fmt",        type: "fmt",  label: "Value format",              def: "abbr" },
        { key: "showLabels", type: "bool", label: "Show tile labels",          def: true },
        { key: "showPct",    type: "bool", label: "Show % of total, not value", def: false },
        { key: "height",     type: "int",  label: "Height (px)",               def: 300 }
      ],
      cde: { type: "cccTreemapChart", extra: function () { return [["valuesVisible", "Boolean", "true"]]; } }
    },
    scatter: {
      label: "Scatter / bubble", icon: "✦", group: "Distribution",
      desc: "Correlation between two numeric variables",
      fields: ["xCol", "yCol", "rCol", "labelCol"],
      // Z8 slice 6: scatter gets its own type-specific options — a Value format
      // (axis ticks + tooltip were always PDC.fmt.abbr with no way to change it)
      // and a Show trend line toggle (least-squares regression line, computed in
      // studio-charts.js so the vendored toolkit stays untouched).
      opts: [
        { key: "fmt",    type: "fmt",  label: "Value format", def: "abbr" },
        { key: "trend",  type: "bool", label: "Show trend line (regression)", def: false },
        { key: "xLabel", type: "text", label: "X axis label", def: "" },
        { key: "yLabel", type: "text", label: "Y axis label", def: "" },
        { key: "height", type: "int",  label: "Height (px)", def: 300 }
      ],
      cde: { type: "cccMetricDotChart", extra: function () { return [["valuesVisible", "Boolean", "false"]]; } }
    },
    gauge: {
      label: "Gauge", icon: "◑", group: "Single value",
      desc: "Single value vs. a configurable max",
      fields: ["valueCol"],
      // Z8 slice 4: gauge gets its own type-specific options — value format (was raw
      // number + unit only) and quality-zone thresholds (was hardcoded 70%/90% in the
      // toolkit); the arc now shows visible red/amber/green bands, not just a color-
      // changing needle, so the thresholds are self-explanatory at a glance.
      opts: [
        { key: "fmt",    type: "fmt", label: "Value format", def: "n" },
        { key: "unit",   type: "text", label: "Unit", def: "%" },
        { key: "max",    type: "int", label: "Max", def: 100 },
        { key: "warnAt", type: "range", label: "Warning zone starts at %", def: 70, min: 0, max: 100, step: 5, suffix: "%" },
        { key: "goodAt", type: "range", label: "Good zone starts at %", def: 90, min: 0, max: 100, step: 5, suffix: "%" }
      ],
      cde: null // CDF-only
    },
    heatmap: {
      label: "Heatmap (pivot)", icon: "▓", group: "Distribution",
      desc: "Color-coded pivot of two categories",
      fields: ["rowCol", "colCol", "valueCol"],
      opts: [
        { key: "fmt",     type: "fmt",  label: "Value format", def: "abbr" },
        { key: "showVals", type: "bool", label: "Show values", def: true },
        { key: "height",  type: "int",  label: "Height (px)", def: 320 }
      ],
      cde: { type: "cccHeatGridChart", extra: function () { return [["valuesVisible", "Boolean", "true"]]; } }
    },
    table: {
      label: "Table", icon: "▥", group: "Detail",
      desc: "Scrollable row-by-row data view",
      fields: ["cols"],
      opts: [
        { key: "maxRows",      type: "int",    label: "Row limit (0 = all)", def: 0 },
        { key: "grandTotal",   type: "bool",   label: "Show grand total row", def: false },
        { key: "pageSize",     type: "int",    label: "Rows per page (0 = all on one page)", def: 0 },
        { key: "freezeHeader", type: "bool",   label: "Freeze header row (scroll body)", def: false },
        { key: "density",      type: "select", label: "Row density", def: "comfortable",
          choices: [["comfortable", "Comfortable"], ["compact", "Compact"]] }
      ],
      cde: { type: "Table", extra: function () { return []; } }
    },
    // Text/annotation panel — no DA needed; content stored in chart.opts.content (light markdown).
    // CDF-only (no CCC/CDE equivalent for pure text panels).
    richtext: {
      label: "Text / annotation",
      icon: "¶",
      group: "Content",
      desc: "Headings, callouts, and explanatory text",
      fields: [],
      opts: []
    },
    // Box plot — distribution chart (quartiles, median, whiskers) per category.
    // CDF-only via the PDC.boxplot extension in studio-charts.js.
    boxplot: {
      label: "Box plot",
      icon: "⧠",
      group: "Distribution",
      desc: "Quartile spread per group (Q1, median, Q3)",
      fields: ["labelCol", "valueCol"],
      opts: [
        { key: "horizontal", label: "Horizontal boxes", type: "bool", def: true },
        { key: "fmt",        label: "Value format",    type: "fmt",  def: "abbr" },
        { key: "height",     type: "int", label: "Height (px)", def: 300 }
      ]
    },
    // Lollipop / dot-plot — clean ranked comparison: thin stem line + dot per row.
    // Elegant alternative to bar charts; great for league tables and rankings.
    // CDF-only via the PDC.lollipop extension in studio-charts.js.
    lollipop: {
      label: "Lollipop chart",
      icon: "◉",
      group: "Comparison",
      desc: "Ranked dots on stems — cleaner than bars",
      fields: ["labelCol", "valueCol"],
      opts: [
        { key: "fmt",    label: "Value format", type: "fmt",   def: "abbr" },
        { key: "color",  label: "Dot color",    type: "color", def: "--pentaho" },
        { key: "height", label: "Height (px)",  type: "int",   def: 280 }
      ],
      cde: null // CDF-only; no CCC lollipop equivalent
    },
    // Dumbbell chart (connected dot chart) — shows the gap between two values per row.
    // Each row: a label on the left, two dots (start=muted, end=brand color) connected by a
    // horizontal line. Line colored green when end > start (improvement) or red when declining.
    // Great for before/after, budget vs. actual, planned vs. achieved comparisons.
    // CDF-only via the PDC.dumbbell extension in studio-charts.js.
    dumbbell: {
      label: "Dumbbell chart",
      icon: "⦾",
      group: "Comparison",
      desc: "Two values per row connected by a line — shows the gap at a glance",
      fields: ["labelCol", "startCol", "endCol"],
      opts: [
        { key: "startLabel", label: "Start label",   type: "text", def: "Before" },
        { key: "endLabel",   label: "End label",     type: "text", def: "After" },
        { key: "fmt",        label: "Value format",  type: "fmt",  def: "abbr" },
        { key: "height",     label: "Height (px)",   type: "int",  def: 280 }
      ],
      cde: null // CDF-only; no CCC dumbbell equivalent
    },
    // Slope chart — before/after period comparison: one line per category
    // connecting T1 (left axis) to T2 (right axis) with labels at both ends.
    // Rising lines in green, falling in red — "what changed?" at a glance.
    // CDF-only via the PDC.slope extension in studio-charts.js.
    slope: {
      label: "Slope chart",
      icon: "⟋",
      group: "Trend",
      desc: "Before-and-after change per category",
      fields: ["labelCol", "valueCol1", "valueCol2"],
      opts: [
        { key: "t1",     label: "Period 1 label", type: "text", def: "Before" },
        { key: "t2",     label: "Period 2 label", type: "text", def: "After" },
        { key: "fmt",    label: "Value format",   type: "fmt",  def: "abbr" },
        { key: "height", label: "Height (px)",    type: "int",  def: 300 }
      ],
      cde: null // CDF-only; no CCC slope chart equivalent
    },
    // Dot plot / Cleveland dot plot — pure dots positioned along a horizontal axis.
    // Lower visual weight than bar charts; excellent for showing distributions and
    // rankings. Optional groupCol enables two-dot-per-row comparison (e.g. budget vs actual).
    // CDF-only via the PDC.dotplot extension in studio-charts.js.
    dotplot: {
      label: "Dot plot",
      icon: "⦿",
      group: "Distribution",
      desc: "Ranked dots for low-noise comparisons",
      fields: ["labelCol", "valueCol"],
      opts: [
        { key: "groupCol",  label: "Compare column (optional)", type: "col",  def: "" },
        { key: "group1",    label: "Primary label",             type: "text", def: "Primary" },
        { key: "group2",    label: "Compare label",             type: "text", def: "Compare" },
        { key: "fmt",       label: "Value format",              type: "fmt",  def: "abbr" },
        { key: "sorted",    label: "Sort by value",             type: "bool", def: true },
        { key: "height",    label: "Height (px)",               type: "int",  def: 280 }
      ],
      cde: null // CDF-only; no CCC dot-plot equivalent
    },
    // Beeswarm / strip plot — individual data points jittered along one axis.
    // Ideal for showing raw distributions, clusters, and outliers at the point level.
    // Dots are deterministically packed to avoid overlap (no randomness — same data
    // always produces the same layout). Optional categoryCol groups rows into labeled
    // horizontal strips so multiple distributions can be compared side-by-side.
    // CDF-only via the PDC.beeswarm extension in studio-charts.js.
    beeswarm: {
      label: "Beeswarm plot",
      icon: "⁘",
      group: "Distribution",
      desc: "Individual points spread to reveal clusters",
      fields: ["labelCol", "valueCol"],
      opts: [
        { key: "categoryCol", label: "Category column (optional)", type: "col", def: "" },
        { key: "dotR",        label: "Dot size",                   type: "int", def: 5 },
        { key: "fmt",         label: "Value format",               type: "fmt", def: "abbr" },
        { key: "height",      label: "Height (px)",                type: "int", def: 300 }
      ],
      cde: null // CDF-only; no CCC beeswarm equivalent
    },
    // Histogram — frequency distribution chart.
    // Auto-bins a single numeric valueCol into N equal-width buckets and renders bar-per-bin.
    // Useful for understanding the shape of a data distribution (normal, skewed, multimodal).
    // Bars touch (no gap) to emphasise continuity of the numeric range.
    // CDF-only via the PDC.histogram extension in studio-charts.js.
    histogram: {
      label: "Histogram",
      icon: "⊟",
      group: "Distribution",
      desc: "Frequency distribution of a numeric column",
      fields: ["valueCol"],
      opts: [
        { key: "bins",   label: "Bin count",     type: "int",   def: 10 },
        { key: "color",  label: "Bar color",      type: "color", def: "--pentaho" },
        { key: "fmt",    label: "Value format",   type: "fmt",   def: "n" },
        { key: "height", label: "Height (px)",    type: "int",   def: 300 }
      ],
      cde: null // CDF-only; no direct CCC histogram equivalent
    },

    // Polar area chart (rose chart): equal-angle wedges with radius proportional to √value.
    // Area encoding is more perceptually accurate than linear radius. Excellent for cyclic
    // data, periodic patterns, and comparing values across a set of named dimensions.
    // CDF-only via the PDC.polarArea extension in studio-charts.js.
    polarArea: {
      label: "Polar area",
      icon: "◑",
      group: "Composition",
      desc: "Equal-angle wedges encoded by area",
      fields: ["labelCol", "valueCol"],
      opts: [
        { key: "fmt",        label: "Value format",  type: "fmt",  def: "n" },
        { key: "showLabels", label: "Show labels",   type: "bool", def: true },
        { key: "height",     label: "Height (px)",   type: "int",  def: 280 }
      ],
      cde: null // CDF-only; no CCC polar-area equivalent
    },

    // Step / staircase chart — right-angle transitions between discrete values.
    // Where a line chart interpolates diagonally, a step chart goes horizontal
    // first then vertical — making the discrete nature of each state change explicit.
    // Ideal for pricing tiers, API quotas, regulatory limits, step-function data.
    // CDF-only via PDC.step extension in studio-charts.js (pdc-ui.js stays pristine).
    step: {
      label: "Step chart",
      icon: "⌐",
      group: "Trend",
      desc: "Discrete jumps shown as right-angle steps",
      fields: ["labelCol", "series"],
      opts: [
        { key: "area",   label: "Area fill",    type: "bool", def: false },
        { key: "fmt",    label: "Value format", type: "fmt",  def: "abbr" },
        { key: "height", label: "Height (px)",  type: "int",  def: 300 }
      ],
      cde: null // CDF-only; no CCC step-line equivalent
    },

    // Violin plot — kernel density distribution per category.
    // Each category's numeric values are kernel-density-estimated (Gaussian KDE, Silverman
    // bandwidth), then drawn as a symmetric filled silhouette — wider where data is denser,
    // narrower at tails. An optional IQR box + median line sits inside each violin for
    // quick quartile reference. Pairs naturally with box plot, beeswarm, and histogram
    // for richer distribution analysis.
    // CDF-only via the PDC.violin extension in studio-charts.js (pdc-ui.js stays pristine).
    violin: {
      label: "Violin plot",
      icon: "⬠",
      group: "Distribution",
      desc: "Kernel density shape reveals full distribution",
      fields: ["labelCol", "valueCol"],
      opts: [
        { key: "showBox", label: "Show IQR box", type: "bool", def: true },
        { key: "fmt",     label: "Value format", type: "fmt",  def: "abbr" },
        { key: "height",  label: "Height (px)",  type: "int",  def: 300 }
      ],
      cde: null // CDF-only; no CCC violin equivalent
    },

    // Bump / ranking chart — shows how ranked positions change across periods.
    // labelCol = period/time (x-axis); series = one numeric column per entity being ranked.
    // At each period, all series are ranked by their value (rank 1 = highest); the chart
    // draws smooth lines connecting each series' rank across periods — lines crossing is
    // immediately visible as competitive overtaking. Ideal for market share shifts,
    // product performance tiers, regional rankings, and vendor comparisons.
    // CDF-only via the PDC.bump extension in studio-charts.js (pdc-ui.js stays pristine).
    bump: {
      label: "Bump chart",
      icon: "⇅",
      group: "Trend",
      desc: "Ranking changes across periods — who rose and who fell",
      fields: ["labelCol", "series"],
      // Z8 slice 17: bump gets its own type-specific option — the tiny rank number
      // inside every dot was always drawn with no way to turn it off; on a busy chart
      // (many entities/periods) the numbers get crowded, so a clean dots-only mode helps.
      opts: [
        { key: "showRankNumbers", label: "Show rank numbers in dots", type: "bool", def: true },
        { key: "fmt",             label: "Value format",              type: "fmt",  def: "abbr" },
        { key: "height",          label: "Height (px)",                type: "int",  def: 300 }
      ],
      cde: null // CDF-only; no CCC ranking-line equivalent
    },

    // Marimekko / Mekko chart — a two-dimensional proportional stacked bar chart.
    // Columns are proportional in WIDTH to each category's total value (larger categories
    // get wider columns); within each column the HEIGHT of each segment is proportional
    // to that segment's share of the column total. Ideal for market share analysis,
    // segment breakdowns, and any case where both "how big is this category?" and
    // "what's inside it?" matter simultaneously.
    //
    // Data binding:
    //   labelCol  = x-axis dimension (one column per category label, e.g. Region)
    //   groupCol  = stacking dimension  (segment labels, e.g. Product)
    //   valueCol  = numeric cell value  (e.g. Revenue)
    //
    // CDF-only via the PDC.marimekko extension in studio-charts.js (pdc-ui.js pristine).
    marimekko: {
      label: "Marimekko",
      icon: "▤",
      group: "Comparison",
      desc: "Proportional stacked bars — width encodes category size, height encodes composition",
      fields: ["labelCol", "groupCol", "valueCol"],
      thumb: (function () {
        // Gallery thumbnail: 3 variable-width columns each with 2-3 coloured stack segments
        var C = ["#005bb5","#3a87d4","#5ba9e6","#a8cff7","#d4e9fb"];
        var cols = [
          { w: 0.44, segs: [0.55, 0.30, 0.15] },
          { w: 0.33, segs: [0.40, 0.40, 0.20] },
          { w: 0.23, segs: [0.70, 0.20, 0.10] }
        ];
        var W = 120, H = 70, gap = 2, x = 0, rects = "";
        cols.forEach(function (col) {
          var cw = Math.round(col.w * W) - gap, y = 0;
          col.segs.forEach(function (frac, si) {
            var ch = Math.round(frac * H);
            rects += '<rect x="' + x + '" y="' + y + '" width="' + cw + '" height="' + ch + '" fill="' + C[si] + '" rx="1"/>';
            y += ch;
          });
          x += cw + gap;
        });
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 70">' + rects + '</svg>';
      }()),
      opts: [
        { key: "fmt",    label: "Value format", type: "fmt", def: "abbr" },
        { key: "height", label: "Height (px)",  type: "int", def: 320 },
        { key: "showPct", label: "Show % labels", type: "bool", def: true }
      ],
      cde: null // CDF-only; no CCC marimekko equivalent
    },

    // Packed bubble chart — a force-directed bubble cluster where each circle's area is
    // proportional to its value. Great for comparing many categories at once without a
    // linear axis. All bubbles attract toward the centre and repel from each other until
    // they settle in a compact, non-overlapping arrangement.
    //
    // Data binding:
    //   labelCol  = category label (one bubble per row)
    //   valueCol  = numeric value (drives circle area)
    //
    // CDF-only via the PDC.packedBubble extension in studio-charts.js (pdc-ui.js pristine).
    packedBubble: {
      label: "Packed bubbles",
      icon: "◌",
      group: "Composition",
      desc: "Circles sized by value — compare many categories at a glance",
      fields: ["labelCol", "valueCol"],
      thumb: (function () {
        // Gallery thumbnail: 6 circles of varying sizes packed together.
        // Radii are hand-placed to look natural without a real packing algorithm.
        var circles = [
          { cx: 42, cy: 32, r: 22, c: "#005bb5" },
          { cx: 84, cy: 26, r: 16, c: "#7d3c98" },
          { cx: 89, cy: 56, r: 13, c: "#2e8bd0" },
          { cx: 60, cy: 60, r: 11, c: "#00a39a" },
          { cx: 18, cy: 54, r: 12, c: "#e67e22" },
          { cx: 100, cy: 37, r:  8, c: "#27ae60" }
        ];
        var parts = circles.map(function (c) {
          return '<circle cx="' + c.cx + '" cy="' + c.cy + '" r="' + c.r +
            '" fill="' + c.c + '" opacity=".82"/>';
        });
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80">' + parts.join("") + '</svg>';
      }()),
      opts: [
        { key: "fmt",        label: "Value format", type: "fmt",  def: "abbr" },
        { key: "height",     label: "Height (px)",  type: "int",  def: 320 },
        { key: "showLabels", label: "Show labels",  type: "bool", def: true }
      ],
      cde: null // CDF-only; no equivalent CCC chart type
    },

    // ── Word Cloud ────────────────────────────────────────────────────────────
    // Text items sized by a numeric value — ideal for keywords by frequency,
    // tag clouds, topic weights, survey responses, or any labelled measure
    // where the relative magnitude matters more than precise comparison.
    //
    // Data binding:
    //   labelCol  = text label (one word/phrase per row)
    //   valueCol  = numeric value (drives font size via log scale)
    //
    // CDF-only via the PDC.wordCloud extension in studio-charts.js (pdc-ui.js pristine).
    wordCloud: {
      label: "Word cloud",
      icon: "⊞",
      group: "Composition",
      desc: "Text sized by value — keywords, tags, topics by frequency",
      fields: ["labelCol", "valueCol"],
      thumb: (function () {
        // Gallery thumbnail: words of varying font sizes in a cloud arrangement.
        var words = [
          { t: "Revenue", x: 60, y: 34, fs: 14, fw: "700", c: "#005bb5" },
          { t: "Growth",  x: 25, y: 22, fs:  9, fw: "600", c: "#7d3c98" },
          { t: "Costs",   x: 96, y: 26, fs:  8, fw: "600", c: "#2e8bd0" },
          { t: "Sales",   x: 87, y: 51, fs:  8, fw: "400", c: "#00a39a" },
          { t: "Q4",      x: 28, y: 46, fs:  7, fw: "400", c: "#e67e22" },
          { t: "Region",  x: 55, y: 58, fs:  7, fw: "400", c: "#27ae60" },
          { t: "Users",   x: 16, y: 35, fs:  6, fw: "400", c: "#2e8bd0" },
          { t: "Margin",  x: 91, y: 67, fs:  6, fw: "400", c: "#005bb5" }
        ];
        var parts = words.map(function (w) {
          return '<text x="' + w.x + '" y="' + w.y + '" text-anchor="middle"' +
            ' font-size="' + w.fs + '" font-weight="' + w.fw + '" fill="' + w.c + '">' +
            w.t + '</text>';
        });
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"' +
          ' font-family="sans-serif">' + parts.join("") + '</svg>';
      }()),
      opts: [
        { key: "fmt",      label: "Value format", type: "fmt", def: "num"  },
        { key: "height",   label: "Height (px)",  type: "int", def: 320    },
        { key: "maxWords", label: "Max words",    type: "int", def: 60     }
      ],
      cde: null // CDF-only; no equivalent CCC chart type
    },

    // ── Gantt / Timeline chart ────────────────────────────────────────────────
    // Horizontal floating-bar chart where each row represents a task or phase.
    // The bar starts at startCol and ends at endCol (numeric values — could be
    // days-from-start, percentage completion, or any ordinal measure). Ideal for
    // project timelines, sprint breakdowns, process stage durations, and any data
    // where you care about WHEN something starts and stops rather than just its size.
    //
    // Data binding:
    //   labelCol  = row/task label (y-axis)
    //   startCol  = bar start value (left edge)
    //   endCol    = bar end value   (right edge)
    //
    // CDF-only via the PDC.gantt extension in studio-charts.js (pdc-ui.js pristine).
    gantt: {
      label: "Gantt / Timeline",
      icon: "⇿",
      group: "Comparison",
      desc: "Floating bars showing start and end of tasks or phases",
      fields: ["labelCol", "startCol", "endCol"],
      thumb: (function () {
        // Gallery thumbnail: 4 horizontal floating bars at staggered positions
        var bars = [
          { y: 5,  x1: 4,  x2: 55, c: "#005bb5" },
          { y: 16, x1: 25, x2: 90, c: "#7d3c98" },
          { y: 27, x1: 10, x2: 70, c: "#2e8bd0" },
          { y: 38, x1: 45, x2: 115, c: "#00a39a" }
        ];
        var rects = bars.map(function (b) {
          return '<rect x="' + b.x1 + '" y="' + b.y + '" width="' + (b.x2 - b.x1) +
            '" height="8" rx="2" fill="' + b.c + '" opacity=".88"/>';
        });
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 50">' +
          '<line x1="4" y1="0" x2="4" y2="50" stroke="#e0e4ef" stroke-width=".8"/>' +
          rects.join("") + '</svg>';
      }()),
      opts: [
        { key: "startLabel", label: "Start column label", type: "text", def: "Start" },
        { key: "endLabel",   label: "End column label",   type: "text", def: "End"   },
        { key: "fmt",        label: "Value format",        type: "fmt",  def: "n"    },
        { key: "height",     label: "Height (px)",          type: "int",  def: 300   }
      ],
      cde: null // CDF-only; no CCC Gantt equivalent
    },

    // ── Diverging bar chart ───────────────────────────────────────────────────
    // Horizontal bars that extend left (negative) or right (positive) from a
    // central zero baseline. Immediately reveals direction and magnitude for
    // mixed positive/negative data: budget surplus/deficit, QoQ growth rates,
    // sentiment scores, temperature anomalies, approval vs. disapproval splits.
    //
    // Data binding:
    //   labelCol  = row label (y-axis, left of zero line)
    //   valueCol  = numeric value (positive → right; negative → left)
    //
    // CDF-only via the PDC.divergingBar extension in studio-charts.js (pdc-ui.js pristine).
    divergingBar: {
      label: "Diverging bars",
      icon: "⇔",
      group: "Comparison",
      desc: "Positive and negative bars from a zero baseline — ideal for variance or growth",
      fields: ["labelCol", "valueCol"],
      thumb: (function () {
        // Gallery thumbnail: 4 rows (2 positive right, 2 negative left) centered on zero at x=60
        var rows = [
          { label: "Alpha",  x1: 60, x2: 107, c: "#005bb5" },
          { label: "Beta",   x1: 60, x2: 93,  c: "#2e8bd0" },
          { label: "Gamma",  x1: 34, x2: 60,  c: "#c0392b" },
          { label: "Delta",  x1: 17, x2: 60,  c: "#e74c3c" }
        ];
        var rects = rows.map(function (r, i) {
          return '<rect x="' + r.x1 + '" y="' + (5 + i * 16) + '" width="' + (r.x2 - r.x1) +
            '" height="10" rx="2" fill="' + r.c + '" opacity=".85"/>';
        });
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 70">' +
          '<line x1="60" y1="0" x2="60" y2="70" stroke="#c8d0dc" stroke-width=".9" stroke-dasharray="3 2"/>' +
          rects.join("") + '</svg>';
      }()),
      opts: [
        { key: "posColor", label: "Positive color",  type: "color", def: "--pentaho" },
        { key: "negColor", label: "Negative color",  type: "color", def: "--pdc-bad" },
        { key: "fmt",      label: "Value format",    type: "fmt",   def: "abbr" },
        { key: "height",   label: "Height (px)",     type: "int",   def: 300 }
      ],
      cde: null // CDF-only; no direct CCC diverging-bar equivalent
    },

    // ── Candlestick / OHLC ────────────────────────────────────────────────────
    // Classic financial-style candle chart. Each period has four values:
    //   open  — value at the start of the period (body edge)
    //   high  — period maximum (top wick tip)
    //   low   — period minimum (bottom wick tip)
    //   close — value at the end of the period (body edge)
    // Bullish candles (close ≥ open) are filled with upColor; bearish with downColor.
    // Wicks extend from the body to the high/low extremes.
    // Ideal for revenue ranges, price data, performance spread, or any time-period
    // scenario where showing full range + open/close marks is valuable.
    // CDF-only via PDC.candlestick extension in studio-charts.js (pdc-ui.js pristine).
    candlestick: {
      label: "Candlestick / OHLC",
      icon: "⋄",
      group: "Trend",
      desc: "Open-High-Low-Close chart for time-period ranges, price data, or performance spread",
      fields: ["labelCol", "openCol", "highCol", "lowCol", "closeCol"],
      thumb: (function () {
        // Gallery thumbnail: 5 candles of varying heights on a subtle baseline.
        // Two green (bullish: close > open), two red (bearish: close < open), one flat.
        // Each candle has a thin wick extending above and below the body.
        var candles = [
          { x: 10, lo: 52, hi: 15, open: 45, close: 22, c: "#27ae60" }, // bull
          { x: 28, lo: 55, hi: 25, open: 48, close: 55, c: "#e74c3c" }, // bear
          { x: 46, lo: 45, hi: 10, open: 38, close: 18, c: "#27ae60" }, // bull (tall)
          { x: 64, lo: 58, hi: 32, open: 50, close: 58, c: "#e74c3c" }, // bear
          { x: 82, lo: 48, hi: 22, open: 40, close: 28, c: "#27ae60" }  // bull
        ];
        var svgW = 120, svgH = 70, bw = 10;
        var items = candles.map(function (c) {
          var bodyT = Math.min(c.open, c.close), bodyB = Math.max(c.open, c.close);
          return '<line x1="' + c.x + '" y1="' + c.hi + '" x2="' + c.x + '" y2="' + c.lo +
            '" stroke="' + c.c + '" stroke-width="1.5" stroke-linecap="round"/>' +
            '<rect x="' + (c.x - bw / 2) + '" y="' + bodyT + '" width="' + bw + '" height="' + (bodyB - bodyT) +
            '" rx="1.5" fill="' + c.c + '" opacity=".85" stroke="' + c.c + '" stroke-width="0.8"/>';
        });
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + svgW + ' ' + svgH + '">' +
          '<line x1="0" y1="65" x2="' + svgW + '" y2="65" stroke="#c8d0dc" stroke-width=".8"/>' +
          items.join("") + '</svg>';
      }()),
      opts: [
        { key: "upColor",   label: "Up (close≥open) color",  type: "color", def: "--green" },
        { key: "downColor", label: "Down (close<open) color", type: "color", def: "--pdc-bad" },
        { key: "fmt",       label: "Value format",            type: "fmt",   def: "abbr" },
        { key: "height",    label: "Height (px)",             type: "int",   def: 320 }
      ],
      cde: null // CDF-only; no CCC equivalent for OHLC
    },

    // ── Waffle chart ──────────────────────────────────────────────────────────
    // A 10×10 grid of colored squares (100 cells) where each cell = 1% of the
    // total and cells are filled by category. Ideal for "1 in N" storytelling
    // (e.g. "73 out of every 100 customers chose X"). More concrete than a donut
    // for audiences unfamiliar with reading pie-slice areas.
    // CDF-only via PDC.waffle extension in studio-charts.js (pdc-ui.js pristine).
    waffle: {
      label: "Waffle chart",
      icon: "⬛",
      group: "Composition",
      desc: "Part-to-whole grid — each square = 1% of the total, easy to read at a glance",
      fields: ["labelCol", "valueCol"],
      thumb: (function () {
        // Gallery thumbnail: a miniature 5×5 waffle grid with 3 color zones.
        var sz = 8, pad = 2, cols = 10, colors = ["#005bb5","#7d3c98","#2e8bd0"];
        var counts = [56, 28, 16]; // ~split of 100 cells in a 10×10
        var flat = [];
        counts.forEach(function (n, ci) { for (var i = 0; i < n; i++) flat.push(ci); });
        var svgW = 120, svgH = 60, side = Math.floor(svgW / cols);
        var cells = flat.slice(0, 10 * Math.floor(svgH / side)).map(function (ci, idx) {
          var row = Math.floor(idx / cols), col2 = idx % cols;
          var x = col2 * side + pad, y = row * side + pad, csz = side - pad;
          return '<rect x="' + x + '" y="' + y + '" width="' + csz + '" height="' + csz + '" rx="1.5" fill="' + colors[ci] + '" opacity=".87"/>';
        });
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + svgW + ' ' + svgH + '">' + cells.join("") + '</svg>';
      }()),
      opts: [
        { key: "cols",   label: "Grid columns",  type: "int", def: 10 },
        { key: "fmt",    label: "Value format",  type: "fmt", def: "abbr" },
        { key: "height", label: "Height (px)",   type: "int", def: 300 }
      ],
      cde: null // CDF-only; no CCC equivalent
    },

    // ── Timeline / milestone chart ────────────────────────────────────────────
    // A horizontal baseline with alternating above/below diamond markers — the
    // classic "alternating timeline" layout for product roadmaps, release trains,
    // project milestones, and historical event sequences. Rows are evenly
    // spaced along the x-axis; an optional dateCol provides period labels at
    // the marker base (opposite side of the baseline from the event label).
    //
    // Data binding:
    //   labelCol  = event / milestone name (required)
    //   dateCol   = date or period label at the marker (optional; shown on the
    //               opposite side of the baseline from the event name)
    //
    // Inspector opts: colorCol (category-based palette coloring), height.
    // CDF-only via PDC.timeline extension in studio-charts.js (pdc-ui.js pristine).
    timeline: {
      label: "Timeline / milestones",
      icon:  "◆",
      group: "Trend",
      desc:  "Events alternating above/below a baseline — roadmaps, releases, milestones",
      fields: ["labelCol", "dateCol"],
      thumb: (function () {
        // Gallery thumbnail: 5 diamond markers on a horizontal baseline,
        // alternating with short stalks above/below and small label lines.
        var colors = ["#005bb5","#7d3c98","#2e8bd0","#00a39a","#e67e22"];
        var pts = [
          { x: 10, above: true  },
          { x: 25, above: false },
          { x: 40, above: true  },
          { x: 55, above: false },
          { x: 70, above: true  }
        ];
        var mid = 15; // baseline y
        var out = '<line x1="6" y1="' + mid + '" x2="74" y2="' + mid + '" stroke="#d8dde8" stroke-width="1.5"/>';
        pts.forEach(function (p, i) {
          var c = colors[i], ds = 3.5;
          var stalkDir = p.above ? -1 : 1;
          var stalkH = 7;
          // stalk
          out += '<line x1="' + p.x + '" y1="' + (mid + stalkDir * 3.5) + '"'
              + ' x2="' + p.x + '" y2="' + (mid + stalkDir * (stalkH + 1)) + '"'
              + ' stroke="' + c + '" stroke-width="1" opacity=".65"/>';
          // diamond
          out += '<polygon points="' + p.x + ',' + (mid - ds) + ' ' + (p.x + ds) + ',' + mid + ' ' + p.x + ',' + (mid + ds) + ' ' + (p.x - ds) + ',' + mid + '"'
              + ' fill="' + c + '" stroke="white" stroke-width="0.8"/>';
          // label stub
          var lblY = mid + stalkDir * (stalkH + 4);
          out += '<line x1="' + (p.x - 6) + '" y1="' + lblY + '" x2="' + (p.x + 6) + '" y2="' + lblY + '"'
              + ' stroke="' + c + '" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>';
        });
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 30">' + out + '</svg>';
      }()),
      opts: [
        { key: "colorCol", label: "Color / category column (optional)", type: "col", def: "" },
        { key: "height",   label: "Height (px)",                        type: "int", def: 220 }
      ],
      cde: null // CDF-only; no CCC timeline equivalent
    },

    // Radial bar chart: concentric arc tracks, each arc length proportional to value.
    // Sorted largest-outermost so visual hierarchy is immediate. All arcs share the same
    // start point (12 o'clock) and sweep clockwise up to 270°. CDF-only;
    // PDC.radialBar extension in studio-charts.js (pdc-ui.js pristine).
    // Population pyramid: mirrored horizontal bars from a shared centre column.
    // Classic for demographic data (age × gender) and any side-by-side comparison
    // where two groups are measured across the same set of categories.
    // CDF-only; PDC.pyramidBar extension in studio-charts.js (pdc-ui.js pristine).
    pyramidBar: {
      label: "Population pyramid",
      icon:  "◫",
      group: "Comparison",
      desc:  "Mirrored horizontal bars from a shared centre axis — compare two groups across categories",
      fields: ["labelCol", "leftCol", "rightCol"],
      thumb: (function () {
        // Gallery thumbnail: 4 rows of mirrored bars with a vertical centre axis.
        // Left bars (purple) extend left; right bars (blue) extend right; centre is implicit.
        var cx = 22;  // centre x of the label zone (viewBox 0 0 44 30)
        var lc = "#7d3c98", rc = "#005bb5";
        var bars = [
          { lw: 10, rw: 12, y: 2  },
          { lw: 16, rw: 14, y: 9  },
          { lw: 13, rw: 17, y: 16 },
          { lw:  8, rw:  9, y: 23 }
        ];
        var LABEL = 8;   // width of centre label column
        var out = '<line x1="' + (cx - LABEL/2) + '" y1="0" x2="' + (cx - LABEL/2) + '" y2="30" stroke="#c8d0da" stroke-width="0.5"/>' +
                  '<line x1="' + (cx + LABEL/2) + '" y1="0" x2="' + (cx + LABEL/2) + '" y2="30" stroke="#c8d0da" stroke-width="0.5"/>';
        bars.forEach(function (b) {
          out += '<rect x="' + (cx - LABEL/2 - b.lw) + '" y="' + b.y + '" width="' + b.lw + '" height="5" rx="1" fill="' + lc + '" opacity=".85"/>';
          out += '<rect x="' + (cx + LABEL/2) + '" y="' + b.y + '" width="' + b.rw + '" height="5" rx="1" fill="' + rc + '" opacity=".85"/>';
        });
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 30">' + out + '</svg>';
      }()),
      opts: [
        { key: "leftLabel",  label: "Left-side label",  type: "text",  def: "Left"       },
        { key: "rightLabel", label: "Right-side label", type: "text",  def: "Right"      },
        { key: "leftColor",  label: "Left bar color",   type: "color", def: "--pdc"      },
        { key: "rightColor", label: "Right bar color",  type: "color", def: "--pentaho"  },
        { key: "fmt",        label: "Value format",     type: "fmt",   def: "abbr"       },
        { key: "height",     label: "Height (px)",      type: "int",   def: 300          }
      ],
      cde: null  // CDF-only; no CCC/CDE equivalent
    },

    radialBar: {
      label: "Radial bar",
      icon:  "◉",
      group: "Comparison",
      desc:  "Concentric arc tracks where arc length encodes value — great for ranking a handful of key metrics",
      fields: ["labelCol", "valueCol"],
      thumb: (function () {
        // Gallery thumbnail: 5 concentric arcs starting at 12 o'clock (top), sweeping
        // clockwise at different lengths to show a ranking of five metrics.
        var cx = 22, cy = 15;
        var radii  = [11, 8.8, 6.6, 4.4, 2.2];
        var sweeps = [0.85, 0.65, 0.75, 0.45, 0.55]; // fraction of 270°
        var colors = ["#005bb5","#7d3c98","#2e8bd0","#00a39a","#e67e22"];
        var SW = 1.5 * Math.PI; // 270°
        var A0 = -Math.PI / 2;  // 12 o'clock (top)
        var tH  = 1.7;          // track height (visual stroke width)
        function ap(r, frac) {
          var a1 = A0 + SW * frac;
          var x0 = cx + r * Math.cos(A0), y0 = cy + r * Math.sin(A0);
          var x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
          var lg = SW * frac > Math.PI ? 1 : 0;
          return 'M' + x0.toFixed(1) + ',' + y0.toFixed(1) +
                 ' A' + r + ',' + r + ' 0 ' + lg + ' 1 ' +
                 x1.toFixed(1) + ',' + y1.toFixed(1);
        }
        var out = "";
        radii.forEach(function (r, i) {
          // ghost track
          out += '<path d="' + ap(r, 1) + '" fill="none" stroke="' + colors[i] +
                 '" stroke-opacity=".12" stroke-width="' + tH + '" stroke-linecap="round"/>';
          // value arc
          out += '<path d="' + ap(r, sweeps[i]) + '" fill="none" stroke="' + colors[i] +
                 '" stroke-width="' + tH + '" stroke-linecap="round"/>';
        });
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 30">' + out + '</svg>';
      }()),
      opts: [
        { key: "maxVal", type: "int", label: "Max value (0 = auto-detect)", def: 0 },
        { key: "fmt",    type: "fmt", label: "Value format",                 def: "abbr" },
        { key: "height", type: "int", label: "Height (px)",                  def: 320 }
      ],
      cde: null // CDF-only; no equivalent CCC/CDE component
    },

    // ── Icicle / rectangular partition chart ────────────────────────────────
    // A space-filling hierarchical layout: the full width is divided proportionally
    // among parent categories (top row), and each parent's slice is sub-divided
    // proportionally among its children (bottom portion). Cleaner than treemap for
    // showing two-level proportions — parents and children are always on separate
    // horizontal tracks so the hierarchy is spatially explicit.
    // Single-level mode (no groupCol): one horizontal band of items by value.
    // Same groupCol/labelCol/valueCol binding as sunburst; CDF-only.
    icicle: {
      label: "Icicle / partition",
      icon: "⊟",
      group: "Composition",
      desc: "Two-level rectangular partition — parent categories on top, children within each slice",
      fields: ["labelCol", "valueCol", "groupCol"],
      thumb: (function () {
        // Gallery thumbnail: two-level icicle with 3 group headers + 2-3 child cells each.
        // Groups are proportional widths; children subdivide within each group's column.
        var W = 120, H = 50, PAD = 1.5;
        var topH = H * 0.36 - 1, botH = H * 0.64 - 2, botY = H * 0.36 + 2;
        var groups = [
          { frac: 0.42, color: "#005bb5", items: [0.55, 0.28, 0.17] },
          { frac: 0.35, color: "#7d3c98", items: [0.60, 0.40] },
          { frac: 0.23, color: "#0e9aa7", items: [0.65, 0.35] }
        ];
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '">';
        var gx = 0;
        groups.forEach(function (g) {
          var gw = W * g.frac;
          svg += '<rect x="' + gx.toFixed(1) + '" y="0" width="' + Math.max(1, gw - PAD).toFixed(1) + '" height="' + topH.toFixed(1) + '" fill="' + g.color + '" rx="2"/>';
          var cx = gx;
          g.items.forEach(function (frac, ii) {
            var iw = gw * frac;
            var op = (0.62 + 0.3 * (1 - ii / Math.max(1, g.items.length - 1))).toFixed(2);
            svg += '<rect x="' + cx.toFixed(1) + '" y="' + botY.toFixed(1) + '" width="' + Math.max(1, iw - PAD).toFixed(1) + '" height="' + (botH - 1).toFixed(1) + '" fill="' + g.color + '" rx="2" opacity="' + op + '"/>';
            cx += iw;
          });
          gx += gw;
        });
        return svg + '</svg>';
      }()),
      // Z8 slice 17: icicle gets its own type-specific options, mirroring Treemap's
      // pattern (both are proportional-area partitions) — a cell-label toggle for
      // dense charts, and a "% of total" mode since that's usually the real question.
      opts: [
        { key: "fmt",        type: "fmt",  label: "Value format",              def: "abbr" },
        { key: "showLabels", type: "bool", label: "Show cell labels",          def: true },
        { key: "showPct",    type: "bool", label: "Show % of total, not value", def: false },
        { key: "height",     type: "int",  label: "Height (px)",               def: 280 }
      ],
      cde: null // CDF-only; no CCC equivalent
    },

    // Pareto chart — the classic 80/20 rule visualisation for quality management and
    // business prioritisation. Bars are sorted descending (largest category leftmost)
    // and a cumulative percentage line rises from left to right. The 80% threshold
    // shows exactly which vital few categories account for the majority of the total.
    // Standard in ISO 9000, defect analysis, customer complaint prioritisation, and
    // any context where "which categories matter most?" is the key question.
    // CDF-only via the PDC.pareto extension in studio-charts.js (pdc-ui.js pristine).
    pareto: {
      label: "Pareto chart",
      icon: "⫠",
      group: "Comparison",
      desc: "80/20 rule — ranked bars with cumulative % line",
      fields: ["labelCol", "valueCol"],
      thumb: (function () {
        // Gallery thumbnail: 5 descending bars + a rising cumulative % line from 0→100%.
        // An 80% horizontal dashed reference line crosses the line at the 4th bar.
        var W = 120, H = 70, mL = 8, mR = 16, mT = 6, mB = 14;
        var iw = W - mL - mR, ih = H - mT - mB;
        var bars = [0.68, 0.48, 0.30, 0.16, 0.09]; // relative heights (descending)
        var cumPct = [0.27, 0.46, 0.58, 0.65, 1.0]; // cumulative %
        var barColors = ["#005bb5","#2e8bd0","#5ea8e6","#90c4f4","#b8d9fb"];
        var slotW = iw / bars.length, barW = slotW * 0.68;
        var out = '';
        // Gridlines (subtle)
        for (var g = 0; g <= 3; g++) {
          var gy = mT + ih * (1 - g / 3);
          out += '<line x1="' + mL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - mR) + '" y2="' + gy.toFixed(1) + '" stroke="#e8edf4" stroke-width="0.6"/>';
        }
        // Bars
        bars.forEach(function (h, i) {
          var bh = ih * h, by = mT + ih - bh;
          var bx = mL + i * slotW + (slotW - barW) / 2;
          out += '<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="' + barColors[i] + '" opacity=".88" rx="1"/>';
        });
        // 80% dashed reference line
        var y80 = (mT + ih * (1 - 0.80)).toFixed(1);
        out += '<line x1="' + mL + '" y1="' + y80 + '" x2="' + (W - mR) + '" y2="' + y80 + '" stroke="#e74c3c" stroke-width="0.8" stroke-dasharray="2.5 1.5" opacity=".6"/>';
        // Cumulative line
        var pts = cumPct.map(function (cp, i) {
          var cx = (mL + i * slotW + slotW / 2).toFixed(1);
          var cy = (mT + ih * (1 - cp)).toFixed(1);
          return cx + ',' + cy;
        });
        out += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#e67e22" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>';
        // Dots on line
        cumPct.forEach(function (cp, i) {
          var cx = (mL + i * slotW + slotW / 2).toFixed(1);
          var cy = (mT + ih * (1 - cp)).toFixed(1);
          out += '<circle cx="' + cx + '" cy="' + cy + '" r="2" fill="#e67e22"/>';
        });
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '">' + out + '</svg>';
      }()),
      opts: [
        { key: "showRef", label: "80% reference line", type: "bool", def: true },
        { key: "fmt",     label: "Value format",        type: "fmt",  def: "abbr" },
        { key: "height",  label: "Height (px)",          type: "int",  def: 300 }
      ],
      cde: null // CDF-only; no CCC Pareto equivalent
    },

    // ── Grouped bar chart (multi-series, side-by-side per category) ─────────
    // Renders N groups × M bars for direct cross-series comparison within every
    // category — unlike Stacked bars (which hides individual values in the total)
    // or plain Bar chart (single series only). Ideal for "Q1 vs Q2 vs Q3 by Region"
    // or "Budget vs Actual vs Forecast by Department". Same labelCol+series binding
    // as Stacked / Stacked area / Stream graph. CDF-only (no CDE equivalent).
    groupedBars: {
      label: "Grouped bars",
      icon: "▥",
      group: "Comparison",
      desc: "Multiple series side-by-side per category for direct comparison",
      fields: ["labelCol", "series"],
      thumb: (function () {
        // Gallery thumbnail: 3 category groups × 3 series bars (blue, purple, cyan).
        // Varying heights per group show the multi-series comparison at a glance.
        var W = 120, H = 70;
        var mL = 6, mR = 6, mT = 4, mB = 14;
        var iw = W - mL - mR, ih = H - mT - mB;
        var groups = [
          [0.70, 0.45, 0.55],
          [0.55, 0.85, 0.65],
          [0.40, 0.60, 0.30]
        ];
        var colors = ["#005bb5", "#7d3c98", "#2e8bd0"];
        var nCats = groups.length, nSer = 3;
        var groupW = iw / nCats;
        var barW = (groupW * 0.80) / nSer;
        var barGap = groupW * 0.02;
        var out = '';
        // subtle gridlines
        for (var g = 0; g <= 3; g++) {
          var gy = (mT + ih * (1 - g / 3)).toFixed(1);
          out += '<line x1="' + mL + '" y1="' + gy + '" x2="' + (W - mR) + '" y2="' + gy + '" stroke="#e8edf4" stroke-width="0.6"/>';
        }
        groups.forEach(function (vals, li) {
          var blockW = barW * nSer + barGap * (nSer - 1);
          var gx = mL + li * groupW + (groupW - blockW) / 2;
          vals.forEach(function (rel, si) {
            var bh = ih * rel;
            var bx = (gx + si * (barW + barGap)).toFixed(1);
            var by = (mT + ih - bh).toFixed(1);
            out += '<rect x="' + bx + '" y="' + by + '" width="' + barW.toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="' + colors[si] + '" rx="1" opacity=".88"/>';
          });
        });
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '">' + out + '</svg>';
      }()),
      opts: [
        { key: "rotate",     type: "bool", label: "Rotate labels",     def: false },
        { key: "showValues", type: "bool", label: "Show value labels", def: false },
        { key: "fmt",        type: "fmt",  label: "Value format",      def: "abbr" },
        { key: "height",     type: "int",  label: "Height (px)",       def: 300 }
      ],
      cde: null // CDF-only; no CCC grouped-bar equivalent in Studio CDE export
    },

    // Ridgeline / joy plot — horizontally stacked density curves per category.
    // Each category's numeric values are KDE-estimated and drawn as a filled curve
    // sweeping left-to-right on a shared value axis. Categories are stacked vertically
    // with a configurable overlap ratio, producing the iconic "joy plot" appearance.
    // Ideal for comparing distributions across many groups (e.g. sales by region, latency
    // by service) in a single compact view — complementary to violin (symmetric, vertical)
    // and beeswarm (raw points).
    // CDF-only via the PDC.ridgeline extension in studio-charts.js (pdc-ui.js pristine).
    ridgeline: {
      label: "Ridgeline plot",
      icon: "≋",
      group: "Distribution",
      desc: "Stacked density curves compare distributions across categories",
      fields: ["labelCol", "valueCol"],
      thumb: (function () {
        // Gallery thumbnail: 4 overlapping horizontal density ridge curves, each a
        // different shade, stacked with slight overlap to show the joy-plot signature.
        var W = 120, H = 70;
        // Four ridges with hand-crafted smooth curves using cubic-bezier-like paths.
        // Each curve starts and ends at baseline, peaking at different x-positions.
        var ridges = [
          // [yBaseline, peakXrel (0-1), color, pathRelH]
          { y: 58, col: "#2e8bd0", pts: "M4,58 C14,58 22,32 36,28 C50,24 58,26 68,34 C78,42 88,56 116,58 Z" },
          { y: 44, col: "#7d3c98", pts: "M4,44 C12,44 24,20 40,16 C56,12 64,18 76,26 C88,34 96,42 116,44 Z" },
          { y: 30, col: "#005bb5", pts: "M4,30 C10,30 18,10 32,7 C46,4 58,8 72,18 C86,28 98,29 116,30 Z" },
          { y: 16, col: "#2e8bd0", pts: "M4,16 C16,16 28,2 44,2 C60,2 68,6 82,12 C96,18 104,16 116,16 Z" }
        ];
        var out = '';
        ridges.forEach(function (r) {
          out += '<path d="' + r.pts + '" fill="' + r.col + '" opacity=".20"/>';
          out += '<path d="' + r.pts + '" fill="none" stroke="' + r.col + '" stroke-width="1.2" opacity=".8"/>';
          out += '<line x1="4" y1="' + r.y + '" x2="116" y2="' + r.y + '" stroke="' + r.col + '" stroke-width="0.4" opacity=".35"/>';
        });
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 70">' + out + '</svg>';
      }()),
      opts: [
        { key: "overlap", label: "Ridge overlap (0–1)", type: "float", def: 0.4, min: 0, max: 0.9, step: 0.05 },
        { key: "fmt",     label: "Value format",       type: "fmt",   def: "abbr" },
        { key: "height",  label: "Height (px)",         type: "int",   def: 320 }
      ],
      cde: null // CDF-only; no CCC ridgeline equivalent
    },

    // 100% Normalized Stacked Bar chart — every bar reaches 100%; segments show proportional
    // share rather than absolute value. The natural complement to Stacked bars (absolute totals)
    // and Grouped bars (direct absolute comparison). Ideal for: market share by region, budget
    // allocation by department, survey response breakdown by period, NPS distribution by team.
    // Same labelCol+series binding as Stacked and Grouped bars. CDF-only.
    barNorm: {
      label: "100% stacked bars",
      icon: "▤",
      group: "Composition",
      desc: "Proportional share per category — every bar totals 100%",
      fields: ["labelCol", "series"],
      thumb: (function () {
        // Gallery thumbnail: 4 categories, each bar filled to 100% with 3 colored segments
        // in varying proportions so the "shifting composition" story is immediately visible.
        var W = 120, H = 70;
        var mL = 6, mR = 6, mT = 6, mB = 14;
        var iw = W - mL - mR, ih = H - mT - mB;
        // 4 bars with different segment proportions (blue / purple / cyan)
        var bars = [
          [0.50, 0.30, 0.20],
          [0.35, 0.45, 0.20],
          [0.55, 0.20, 0.25],
          [0.25, 0.50, 0.25]
        ];
        var colors = ["#005bb5", "#7d3c98", "#2e8bd0"];
        var nBars = bars.length;
        var groupW = iw / nBars;
        var bW = groupW * 0.64, bX0 = (groupW - bW) / 2;
        var out = '';
        // faint horizontal 25%/50%/75%/100% gridlines
        for (var g = 1; g <= 4; g++) {
          var gy = (mT + ih * (1 - g / 4)).toFixed(1);
          out += '<line x1="' + mL + '" y1="' + gy + '" x2="' + (W - mR) + '" y2="' + gy + '" stroke="#e8edf4" stroke-width="0.6"/>';
        }
        bars.forEach(function (segs, bi) {
          var bx = (mL + bi * groupW + bX0).toFixed(1);
          var cumY = mT + ih; // start at bottom
          segs.forEach(function (pct, si) {
            var segH = ih * pct;
            cumY -= segH;
            out += '<rect x="' + bx + '" y="' + cumY.toFixed(1) + '" width="' + bW.toFixed(1) + '" height="' + segH.toFixed(1) + '" fill="' + colors[si] + '" opacity=".88" rx="1"/>';
          });
        });
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '">' + out + '</svg>';
      }()),
      opts: [
        { key: "rotate",  type: "bool", label: "Rotate labels",       def: false },
        { key: "showPct", type: "bool", label: "Show segment % labels", def: false },
        { key: "fmt",     type: "fmt",  label: "Value format",        def: "abbr" },
        { key: "height",  type: "int",  label: "Height (px)",         def: 300 }
      ],
      cde: null // CDF-only; no CCC equivalent with automatic % normalization
    },

    // Area range / confidence band — a shaded band between a lower and an upper bound,
    // with an optional centre/actual/forecast line drawn through the middle of the band.
    // Use for: confidence intervals (model uncertainty), min/max sensor ranges, forecast
    // floor/ceiling tracks, budget corridors, or any metric whose meaningful story is
    // "the value should stay between X and Y." CDF-only.
    areaRange: {
      label: "Area range / band",
      icon: "◉",
      group: "Trend",
      desc: "Shaded band between upper and lower bounds — for confidence intervals, ranges, and forecast corridors",
      fields: ["labelCol", "lowerCol", "upperCol", "centerCol"],
      thumb: (function () {
        // Gallery thumbnail: sinusoidal-ish band with upper (solid) + lower (dashed) lines
        // and a centre line running through the middle, in a 120×70 canvas.
        var W = 120, H = 70, mL = 8, mR = 8, mT = 8, mB = 14;
        var iw = W - mL - mR, ih = H - mT - mB;
        var n = 5;
        // Fractional offsets from the top of the chart area (0 = top, 1 = bottom)
        var upper  = [0.14, 0.05, 0.17, 0.21, 0.11];
        var lower  = [0.64, 0.54, 0.67, 0.71, 0.61];
        var center = [0.39, 0.29, 0.42, 0.46, 0.36];
        function yf(f, idx) { return (mT + ih * f).toFixed(1); }
        function xf(i)      { return (mL + i / (n - 1) * iw).toFixed(1); }
        var uPts  = [0,1,2,3,4].map(function (i) { return xf(i) + "," + yf(upper[i]);  }).join(" ");
        var lPts  = [0,1,2,3,4].map(function (i) { return xf(i) + "," + yf(lower[i]);  }).join(" ");
        var lRev  = [4,3,2,1,0].map(function (i) { return xf(i) + "," + yf(lower[i]);  }).join(" ");
        var cPts  = [0,1,2,3,4].map(function (i) { return xf(i) + "," + yf(center[i]); }).join(" ");
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '">'
          + '<polygon points="' + uPts + ' ' + lRev + '" fill="#005bb5" opacity=".18"/>'
          + '<polyline points="' + uPts + '" fill="none" stroke="#005bb5" stroke-width="1.5" stroke-linejoin="round"/>'
          + '<polyline points="' + lPts + '" fill="none" stroke="#005bb5" stroke-width="1.5" stroke-dasharray="5,3" stroke-linejoin="round"/>'
          + '<polyline points="' + cPts + '" fill="none" stroke="#005bb5" stroke-width="2" stroke-linejoin="round" opacity=".9"/>'
          + '</svg>';
      }()),
      opts: [
        { key: "bandOpacity", type: "range", label: "Band opacity (%)",   def: 22, min: 5, max: 60, step: 1 },
        { key: "showCenter",  type: "bool",  label: "Show centre line",   def: true },
        { key: "height",      type: "int",   label: "Height (px)",        def: 300 }
      ],
      cde: null // CDF-only; no CCC band-range equivalent
    },

    // Quadrant / 2×2 matrix chart — scatter-style x/y plot divided into four
    // labelled zones by configurable threshold lines. Ideal for strategic analysis:
    // BCG growth-share, Effort vs Impact, Risk vs Probability, Performance vs Potential.
    // Dots are coloured by which quadrant they fall into so categorisation reads instantly.
    quadrant: {
      label: "Quadrant chart",
      icon: "⊞",
      group: "Comparison",
      desc: "Position items in a 2×2 matrix — BCG, effort/impact, performance/potential",
      fields: ["xCol", "yCol", "labelCol"],
      thumb: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 70">'
        + '<rect x="60" y="4" width="56" height="29" fill="#005bb5" opacity=".07"/>'
        + '<rect x="4" y="4" width="56" height="29" fill="#9b59b6" opacity=".07"/>'
        + '<rect x="4" y="33" width="56" height="33" fill="#c0392b" opacity=".07"/>'
        + '<rect x="60" y="33" width="56" height="33" fill="#27ae60" opacity=".07"/>'
        + '<line x1="60" y1="4" x2="60" y2="66" stroke="#888" stroke-width="1" stroke-dasharray="4,3" opacity=".4"/>'
        + '<line x1="4" y1="33" x2="116" y2="33" stroke="#888" stroke-width="1" stroke-dasharray="4,3" opacity=".4"/>'
        + '<circle cx="90" cy="12" r="5" fill="#005bb5" opacity=".85"/>'
        + '<circle cx="76" cy="20" r="5" fill="#005bb5" opacity=".85"/>'
        + '<circle cx="100" cy="22" r="5" fill="#005bb5" opacity=".85"/>'
        + '<circle cx="22" cy="14" r="5" fill="#9b59b6" opacity=".85"/>'
        + '<circle cx="38" cy="9" r="5" fill="#9b59b6" opacity=".85"/>'
        + '<circle cx="18" cy="52" r="5" fill="#c0392b" opacity=".85"/>'
        + '<circle cx="80" cy="50" r="5" fill="#27ae60" opacity=".85"/>'
        + '<circle cx="96" cy="58" r="5" fill="#27ae60" opacity=".85"/>'
        + '</svg>',
      opts: [
        { key: "xThreshold", type: "range", label: "X split (%)",          def: 50, min: 10, max: 90, step: 1 },
        { key: "yThreshold", type: "range", label: "Y split (%)",          def: 50, min: 10, max: 90, step: 1 },
        { key: "q1",         type: "text",  label: "Top-right label",       def: "High Value" },
        { key: "q2",         type: "text",  label: "Top-left label",        def: "Explore" },
        { key: "q3",         type: "text",  label: "Bottom-left label",     def: "Low Priority" },
        { key: "q4",         type: "text",  label: "Bottom-right label",    def: "Quick Wins" },
        { key: "xLabel",     type: "text",  label: "X axis label",          def: "" },
        { key: "yLabel",     type: "text",  label: "Y axis label",          def: "" },
        { key: "height",     type: "int",   label: "Height (px)",           def: 300 }
      ],
      cde: null // CDF-only; no CCC quadrant equivalent
    }
  };
  // chart types that the CDE/CCC export cannot represent natively (CDF-only) — the `cde` field
  // on each Studio.CHARTS entry is metadata for docs/tests, not read by the (removed, Z0)
  // exporter itself, but Studio.cdeUnsupported is still the canonical CDF-only check.
  Studio.cdeUnsupported = function (type) {
    var c = Studio.CHARTS[type];
    return !c || !c.cde;
  };

  /* ---- spec helpers ---- */
  var _uid = 0;
  Studio.uid = function (p) { _uid += 1; return (p || "p") + _uid + "_" + (Date.now() % 100000); };

  // Built-in series palette presets. Each entry overrides --c1..--c10 CSS variables
  // in both light and dark mode so chart series always look intentional together.
  // key: "default" leaves pdc-ui.css values intact. Stored as spec.paletteKey.
  Studio.PALETTE_PRESETS = [
    { key: "default", label: "Pentaho (default)", swatch: "#005bb5", light: null, dark: null },
    { key: "ocean",  label: "Ocean",  swatch: "#0277bd",
      light: ["#0277bd","#006d77","#0097a7","#1aadca","#00838f","#1565c0","#00acc1","#29b6f6","#006064","#4fc3f7"],
      dark:  ["#29b6f6","#4dd0e1","#26c6da","#80deea","#64b5f6","#64ffda","#7cc4ff","#00e5ff","#b3e5fc","#b2ebf2"]
    },
    { key: "forest", label: "Forest", swatch: "#2e7d32",
      light: ["#2e7d32","#388e3c","#558b2f","#00695c","#1b5e20","#43a047","#33691e","#27ae60","#00796b","#5a7d2e"],
      dark:  ["#a5d6a7","#81c784","#c5e1a5","#80cbc4","#b9f6ca","#69f0ae","#4cde8c","#66bb6a","#64ffda","#e6ee9c"]
    },
    { key: "sunset", label: "Sunset", swatch: "#e64a19",
      light: ["#c62828","#e64a19","#f57c00","#ff8f00","#d84315","#bf360c","#6d4c41","#e65100","#ff6d00","#b71c1c"],
      dark:  ["#ef9a9a","#ff8a65","#ffcc80","#ffd54f","#ff7043","#ef5350","#a1887f","#ff6e40","#ffab40","#ff5252"]
    },
    { key: "dusk",   label: "Dusk",   swatch: "#6a1b9a",
      light: ["#6a1b9a","#512da8","#4527a0","#ad1457","#880e4f","#c62828","#5c1a78","#4a148c","#311b92","#9c27b0"],
      dark:  ["#ce93d8","#b39ddb","#f8bbd0","#f48fb1","#ea80fc","#ef9a9a","#b388ff","#cc88ff","#c49de3","#e040fb"]
    }
  ];

  // ★★ Visual refresh (A): full dashboard "look" presets — unlike PALETTE_PRESETS (series
  // colors only) or themeColor/headerBg (one-off accent tweaks), each entry here overrides the
  // WHOLE pdc-ui.css token system (bg/panel/text hierarchy + brand + series) in one pick, so a
  // dashboard reads as one coherent system rather than a blue base with mismatched accents.
  // "classic" (light/dark: null) leaves vendor/pdc-ui.css untouched. "fleet-modern" mirrors the
  // jobtracker.polecat.live token hierarchy (bg -> surface -> surface-2, text/2/3, brand/accent)
  // with a WCAG-AA, colorblind-safe (CVD >=12) 10-color series palette validated via the dataviz
  // skill's validate_palette.js for both light and dark. Stored as spec.dashboardTheme.
  Studio.DASHBOARD_THEMES = [
    { key: "classic", label: "Classic Pentaho Blue", swatch: "#005bb5", light: null, dark: null },
    { key: "fleet-modern", label: "Fleet Modern", swatch: "#0071bc",
      light: {
        "--pentaho": "#0071bc", "--pdc": "#00964a",
        "--app-bg": "#eef3f9", "--panel-bg": "#ffffff", "--panel-border": "#ccdcec",
        "--panel-subtle-bg": "#e9f0f8", "--panel-header-bg": "#e9f0f8", "--panel-header-border": "#ccdcec",
        "--field-bg": "#ffffff", "--field-border": "#ccdcec",
        "--text-primary": "#0c1c2e", "--text-muted": "#48596f", "--text-faint": "#586b88",
        "--sidebar-bg": "#0d1a2e", "--header-bg": "#0d1a2e", "--grid-line": "#dde6f0", "--axis": "#586b88",
        "--c1": "#0071bc", "--c2": "#00964a", "--c3": "#c98500", "--c4": "#5b3fa8", "--c5": "#0e8f86",
        "--c6": "#d1403f", "--c7": "#c94f82", "--c8": "#d95926", "--c9": "#2a63a8", "--c10": "#a8461f"
      },
      dark: {
        "--pentaho": "#5bb3ea", "--pdc": "#17b9a6",
        "--app-bg": "#0a0f1a", "--panel-bg": "#111a2b", "--panel-border": "#26344f",
        "--panel-subtle-bg": "#18243a", "--panel-header-bg": "#18243a", "--panel-header-border": "#26344f",
        "--field-bg": "#18243a", "--field-border": "#26344f",
        "--text-primary": "#e9eff8", "--text-muted": "#93a6c2", "--text-faint": "#8496ac",
        "--sidebar-bg": "#060b14", "--header-bg": "#060b14", "--grid-line": "#1c2740", "--axis": "#8496ac",
        "--c1": "#3d8fd6", "--c2": "#22a35f", "--c3": "#b8811f", "--c4": "#8a6fd0", "--c5": "#2aa89a",
        "--c6": "#e2685f", "--c7": "#cf6b98", "--c8": "#c76a2f", "--c9": "#4a7bc4", "--c10": "#b56a3f"
      }
    }
  ];

  // Built-in dashboard accent-color presets. Used by the per-dashboard "Accent color"
  // picker (Dashboard inspector) and the Settings "Default accent color" picker (Z6).
  // color: "" keeps the built-in Pentaho blue (#005bb5) from pdc-ui.css untouched.
  Studio.THEME_PRESETS = [
    { label: "Pentaho blue (default)", color: "" },
    { label: "Ocean teal",  color: "#0d7a8a" },
    { label: "Forest",      color: "#1a7a4a" },
    { label: "Sunset",      color: "#d95f2b" },
    { label: "Royal",       color: "#6b35a8" },
    { label: "Coral rose",  color: "#c82b5e" }
  ];

  // Z6: banner title size presets — the one lever of "full text formatting" that's genuinely
  // useful across the widest range of dashboards (default keeps pdc-ui.css's 17px/800-weight).
  Studio.TITLE_SIZES = [
    ["", "Default"],
    ["sm", "Small"],
    ["lg", "Large"],
    ["xl", "Extra large"]
  ];
  Studio.TITLE_SIZE_PX = { sm: "14px", lg: "21px", xl: "27px" };
  // Z6: subtitle text style — .pdc-sub is font-weight:500 (not bold) and upright by default
  // (vendor/pdc-ui.css); these two are independent toggles (a subtitle can be both bold and italic).
  Studio.SUBTITLE_STYLES = [
    ["", "Normal"],
    ["italic", "Italic"],
    ["bold", "Bold"],
    ["bold-italic", "Bold italic"]
  ];
  // N-DESIGN "chart skins" (first cut): an alternate render mood for every chart card + KPI tile,
  // toggled dashboard-wide. "Raised" is today's default material (shadow + glass edge + hover lift,
  // vendor/pdc-ui.css); "Flat" strips all three for a quieter, editorial-minimal boardroom look —
  // same data, same layout, just a different surface treatment. Additive CSS override (see
  // exporters.js cardSkinCss), vendor/pdc-ui.css itself stays untouched.
  Studio.CARD_SKINS = [
    ["", "Raised (default)"],
    ["flat", "Flat / minimal"]
  ];

  Studio.emptySpec = function () {
    return {
      schema: 1,
      id: Studio.uid("dash"),
      name: "untitled",
      title: "Untitled Dashboard",
      subtitle: "",
      group: "Observability",
      description: "",
      cda: { connection: { id: "pdc", jndi: "PDC-BIDB-EXT" },
             connections: [{ id: "pdc", type: "sql.jndi", jndi: "PDC-BIDB-EXT" }],
             dataAccesses: [] },
      filters: [],
      kpis: [],
      gridCols: 3,
      themeColor: "", // optional hex color that overrides --pentaho in preview + exported CDF
      dashboardTheme: "", // optional full look preset key (see Studio.DASHBOARD_THEMES); "" = classic
      paletteKey: "", // optional series palette key (see Studio.PALETTE_PRESETS); "" = default
      headerLogo: "", // optional data: URL image that replaces the default "P" mark in the banner
      headerLink: "", // optional URL — wraps the header brand mark+title in a link (opens in a new tab)
      headerBg: "", // optional hex color that overrides the banner background (fg auto-contrasts); "" = default navy gradient
      titleSize: "", // optional key into Studio.TITLE_SIZE_PX overriding the banner title's font size; "" = default
      subtitleStyle: "", // optional key into Studio.SUBTITLE_STYLES ("italic"/"bold"/"bold-italic"); "" = default
      cardSkin: "", // N-DESIGN: "flat" drops the raised shadow/hover-lift on chart cards + KPI tiles for an editorial-minimal mood; "" = default raised skin
      templateVars: [], // N-DEV: [{key,value}] — {{key}} tokens in dashboard title/subtitle AND panel title/note get substituted at render time
      panels: []
    };
  };

  // N-DEV: dashboard templates/variables — replace every {{key}} token in `str` with the matching
  // entry's value from `vars` ([{key,value}]). A token whose key has no matching var is left as
  // literal text (visibly wrong beats silently blank — makes a typo obvious instead of hiding it).
  // Pure/independently-testable; called from the shared buildHtml pipeline so preview and every
  // export substitute identically with zero separate wiring.
  Studio.applyTemplateVars = function (str, vars) {
    if (!str || !vars || !vars.length) return str;
    var map = {};
    vars.forEach(function (v) { if (v && v.key) map[v.key] = v.value == null ? "" : v.value; });
    return str.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, function (m, key) {
      return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : m;
    });
  };

  // find a dataAccess def in the spec by id
  Studio.daById = function (spec, id) {
    return (spec.cda.dataAccesses || []).filter(function (d) { return d.id === id; })[0] || null;
  };
  // ensure a dataAccess from the catalog is present in the spec (so exports are self-contained)
  Studio.ensureDA = function (spec, daDef) {
    if (!daDef) return;
    if (!Studio.daById(spec, daDef.id)) spec.cda.dataAccesses.push(JSON.parse(JSON.stringify(daDef)));
  };
  Studio.columnsOf = function (spec, daId) {
    var d = Studio.daById(spec, daId);
    if (!d) return [];
    var cols = (d.columns || []).slice();
    // A calc column is a real, bindable output column (mirrors real Pentaho CDA behavior,
    // which appends <CalculatedColumns> to the query's own columns) — offer it here too.
    (d.calcColumns || []).forEach(function (c) {
      if (c && c.name && c.formula && cols.indexOf(c.name) < 0) cols.push(c.name);
    });
    return cols;
  };

  // default panel for a chart type bound to a dataAccess (auto column mapping)
  Studio.newPanel = function (type, daDef) {
    var cols = (daDef && daDef.columns) || [];
    var c = Studio.CHARTS[type] || Studio.CHARTS.bars;
    var map = {};
    if (type === "parallelCoords") {
      // Parallel coordinates: entity name column + ALL remaining columns as axes.
      // More axes = richer multi-dimensional view; the inspector lets the user add/remove them.
      map.labelCol = cols[0] || "";
      map.series = cols.slice(1).map(function (col) { return { col: col }; });
    } else if (type === "line" || type === "stacked" || type === "barNorm" || type === "areaStacked" || type === "streamgraph" || type === "step" || type === "bump") {
      map.labelCol = cols[0] || "";
      map.series = cols.slice(1, 2).map(function (col) { return { col: col }; });
      if (!map.series.length && cols[1]) map.series = [{ col: cols[1] }];
    } else if (type === "scatter") {
      map.xCol = cols[1] || cols[0] || ""; map.yCol = cols[2] || cols[1] || "";
      map.rCol = cols[3] || ""; map.labelCol = cols[0] || "";
    } else if (type === "heatmap") {
      map.rowCol = cols[0] || ""; map.colCol = cols[1] || ""; map.valueCol = cols[2] || cols[1] || "";
    } else if (type === "table") {
      map.cols = cols.map(function (col, i) { return { col: col, label: titleize(col), num: i > 0 }; });
    } else if (type === "gauge") {
      map.valueCol = cols[1] || cols[0] || "";
    } else if (type === "combo") {
      map.labelCol = cols[0] || ""; map.barCol = cols[1] || cols[0] || ""; map.lineCol = cols[2] || cols[1] || "";
    } else if (type === "sankey" || type === "chord" || type === "network") {
      map.sourceCol = cols[0] || ""; map.targetCol = cols[1] || cols[0] || ""; map.valueCol = cols[2] || cols[1] || "";
    } else if (type === "sunburst") {
      map.labelCol = cols[0] || ""; map.valueCol = cols[1] || cols[0] || ""; map.groupCol = cols[2] || "";
    } else if (type === "bullet") {
      map.labelCol = cols[0] || ""; map.valueCol = cols[1] || cols[0] || ""; map.targetCol = cols[2] || "";
    } else if (type === "calHeatmap") {
      map.dateCol = cols[0] || ""; map.valueCol = cols[1] || cols[0] || "";
    } else if (type === "boxplot") {
      map.labelCol = cols[0] || ""; map.valueCol = cols[1] || cols[0] || "";
    } else if (type === "dumbbell") {
      // dumbbell chart: label + start value + end value columns
      map.labelCol = cols[0] || ""; map.startCol = cols[1] || cols[0] || ""; map.endCol = cols[2] || cols[1] || cols[0] || "";
    } else if (type === "slope") {
      // slope chart: label + two value columns (before, after)
      map.labelCol = cols[0] || ""; map.valueCol1 = cols[1] || cols[0] || ""; map.valueCol2 = cols[2] || cols[1] || cols[0] || "";
    } else if (type === "dotplot") {
      map.labelCol = cols[0] || ""; map.valueCol = cols[1] || cols[0] || "";
      map.groupCol = cols[2] || "";
    } else if (type === "beeswarm") {
      map.labelCol = cols[0] || ""; map.valueCol = cols[1] || cols[0] || "";
      map.categoryCol = cols[2] || "";
    } else if (type === "histogram") {
      // Histogram only needs the numeric valueCol; labelCol is not used
      map.valueCol = cols[1] || cols[0] || "";
    } else if (type === "polarArea") {
      map.labelCol = cols[0] || ""; map.valueCol = cols[1] || cols[0] || "";
    } else if (type === "marimekko") {
      map.labelCol = cols[0] || ""; map.groupCol = cols[1] || ""; map.valueCol = cols[2] || cols[1] || "";
    } else if (type === "richtext") {
      // text panel: no DA binding; content authored in the inspector
    } else if (type === "divergingBar") {
      // diverging bar: same two-column binding as bars (label + value; value may be negative)
      map.labelCol = cols[0] || ""; map.valueCol = cols[1] || cols[0] || "";
    } else if (type === "icicle") {
      // icicle: optional groupCol (parent category), labelCol (item), valueCol (size)
      map.labelCol = cols[0] || ""; map.valueCol = cols[1] || cols[0] || "";
      map.groupCol = cols[2] || "";
    } else if (type === "ridgeline") {
      // ridgeline: labelCol = category (each gets a ridge), valueCol = numeric distribution
      map.labelCol = cols[0] || ""; map.valueCol = cols[1] || cols[0] || "";
    } else if (type === "areaRange") {
      // area range: labelCol = x-axis, lowerCol = lower bound, upperCol = upper bound, centerCol optional
      map.labelCol  = cols[0] || "";
      map.lowerCol  = cols[1] || cols[0] || "";
      map.upperCol  = cols[2] || cols[1] || cols[0] || "";
      map.centerCol = cols[3] || "";
    } else if (type === "quadrant") {
      // quadrant: xCol + yCol for position; optional labelCol for point labels
      map.xCol = cols[1] || cols[0] || "";
      map.yCol = cols[2] || cols[1] || cols[0] || "";
      map.labelCol = cols[0] || "";
    } else { // bars, donut, treemap, funnel, waterfall
      map.labelCol = cols[0] || ""; map.valueCol = cols[1] || cols[0] || "";
    }
    var opts = {};
    (c.opts || []).forEach(function (o) { opts[o.key] = o.def; });
    // Smart default title: strip leading "da_" / "kpi_" / "query_" prefix so IDs like
    // "da_monthly_cost" become "Monthly Cost · Line chart" instead of "Da Monthly Cost".
    var panelTitle = c.label;
    if (daDef) {
      var cleanId = String(daDef.id).replace(/^(da|kpi|query|chart|data)[_\-]/i, "");
      panelTitle = titleize(cleanId) + " · " + c.label;
    }
    return {
      id: Studio.uid("p"),
      title: panelTitle,
      span: 1,
      pill: "", sub: "", info: "",
      src: daDef ? daSource(daDef) : "",
      chart: { type: type, da: daDef ? daDef.id : "", map: map, opts: opts }
    };
  };

  Studio.newKpi = function (daDef) {
    var cols = (daDef && daDef.columns) || [];
    return { da: daDef ? daDef.id : "", valueCol: cols[0] || "", label: daDef ? titleize(daDef.id) : "Metric",
             fmt: "n", state: "", info: "", subtitle: "" };
  };

  // best-effort "source" provenance caption from the SQL (first table after FROM)
  function daSource(da) {
    var m = /\bFROM\s+([a-zA-Z_][\w.]*)/i.exec(da.sql || "");
    return m ? m[1] : (da.name || da.id);
  }
  Studio.daSource = daSource;

  function titleize(s) {
    if (!s) return "";
    // split camelCase + snake/kebab into words
    return String(s)
      .replace(/[_-]+/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, function (c) { return c.toUpperCase(); })
      .replace(/\bCo2e\b/i, "CO2e").replace(/\bTb\b/, "TB").replace(/\bGb\b/, "GB")
      .replace(/\bKpi\b/i, "KPI").replace(/\bPct\b/i, "%");
  }
  Studio.titleize = titleize;

  // map an output column name -> a sensible default fmt id (used on auto-bind)
  Studio.guessFmt = function (col) {
    var c = String(col || "").toLowerCase();
    if (/cost|usd|monthly|annual|reclaim|saving|spend|price/.test(c)) return "money";
    if (/\btb\b|\bgb\b|bytes|size|storage|footprint/.test(c)) return "gb";
    if (/pct|percent|rate|coverage|completeness|ratio/.test(c)) return "pct";
    return "abbr";
  };

  Studio.clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  // N-DIST: shareable state links — encode a whole dashboard spec into a URL-safe string so it
  // can travel as a `#share=...` link with no server/file needed (extends the existing E4
  // per-filter `#hash` deep-link, which only ever carried filter *defaults* for exported CDF,
  // never the builder's own working spec). btoa/atob only handle Latin1, so JSON text is UTF-8
  // escaped first (the standard unescape/escape round-trip) — this is why a plain
  // `btoa(JSON.stringify(spec))` breaks the moment a title/label has a non-ASCII character.
  Studio.encodeSpecToShareString = function (spec) {
    return encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(spec)))));
  };
  Studio.decodeSpecFromShareString = function (str) {
    try {
      var spec = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(str)))));
      return (spec && typeof spec === "object") ? spec : null;
    } catch (e) { return null; }
  };

  // allTags: returns a sorted array of unique tag strings across all panels in the spec.
  // Tags are stored as p.tags (array of lowercase trimmed strings). Used to populate the
  // tag filter bar in the dashboard inspector so builders can highlight panels by topic.
  Studio.allTags = function (spec) {
    var seen = {}, tags = [];
    (spec && spec.panels || []).forEach(function (p) {
      (p.tags || []).forEach(function (t) {
        var s = String(t).trim().toLowerCase();
        if (s && !seen[s]) { seen[s] = 1; tags.push(s); }
      });
    });
    return tags.sort();
  };

  /* ---- CDA authoring helpers ---- */
  Studio.DA_KINDS = [
    { id: "sql.jndi",      label: "SQL / JNDI (connection pool)" },
    { id: "sql.jdbc",      label: "SQL / JDBC (direct connection)" },
    { id: "mondrian.jndi", label: "Mondrian MDX (JNDI)" },
    { id: "olap4j",        label: "OLAP4J" },
    { id: "metadata",      label: "Metadata (MQL)" },
    { id: "kettle",        label: "Kettle (.ktr transform)" },
    { id: "scripting",     label: "Scripting (JS / Groovy)" },
    { id: "duckdb",        label: "DuckDB-Wasm (remote Parquet/CSV, no backend)" },
    { id: "httpvfs",       label: "SQLite-WASM (remote .sqlite over HTTP, no backend)" },
    { id: "snowflake",     label: "Snowflake (SQL API, needs token + CORS allow-list)" },
    { id: "databricks",    label: "Databricks (Statement Execution API, needs token + CORS allow-list)" },
    { id: "bigquery",      label: "BigQuery (jobs.query REST API, needs OAuth token)" },
    { id: "http",          label: "Generic SQL/HTTP (any JSON API that runs SQL and returns rows)" }
  ];
  Studio.COLUMN_TYPES = ["String", "Integer", "Numeric", "Date", "Boolean"];

  // Z8 context-aware inspector: which panel inspector "interaction" sections actually do
  // something for a given chart type. Mirrors the real wiring in studio-render.js (buildDetailCfg,
  // drillCfg, cfData/csData, _crossFilters) — a section is only worth showing when the renderer
  // for that type actually consumes it. Keep in sync with studio-render.js if a chart type gains
  // (or drops) support for one of these.
  Studio.ANNOT_CAPS = {
    drill:      { bars: 1, donut: 1 },                            // PDC.bars/donut accept cfg.drill
    detail:     { bars: 1, donut: 1, treemap: 1, table: 1 },      // PDC.*/table accept cfg.detail
    crossFilter:{ bars: 1, donut: 1, treemap: 1, lollipop: 1, funnel: 1, waterfall: 1,
                  stacked: 1, groupedBars: 1, barNorm: 1 }, // only these emit on click
    condFmt:    { bars: 1, donut: 1, treemap: 1, lollipop: 1 },   // cfData() consumers
    colorScale: { bars: 1, donut: 1, treemap: 1, lollipop: 1 }    // csData() consumers
  };
  // true when chart type `t` supports interaction/annotation kind `k` (one of ANNOT_CAPS' keys).
  Studio.chartSupports = function (k, t) { return !!(Studio.ANNOT_CAPS[k] && Studio.ANNOT_CAPS[k][t]); };
  Studio.newDA = function () {
    return { id: Studio.uid("da"), name: "", kind: "sql.jndi", connectionId: "", sql: "", columns: [], params: [], calcColumns: [], cache: true, cacheDuration: 300 };
  };
  Studio.newCalcCol = function () { return { name: "", formula: "", type: "Numeric" }; };
  Studio.newCompoundDA = function (compoundType) {
    return { id: Studio.uid("cda"), name: "", kind: "compound", compoundType: compoundType || "join",
             leftId: "", rightId: "", leftKeys: "", rightKeys: "",
             unionDas: [], columns: [], cache: true, cacheDuration: 300 };
  };
  Studio.isCompoundDA = function (da) { return da && da.kind === "compound"; };

  /* ---- CDA connections ---- */
  Studio.CDA_CONNECTION_TYPES = [
    { id: "sql.jndi",             label: "SQL / JNDI",              fields: [{ key: "jndi",          label: "JNDI pool name",    ph: "PDC-BIDB-EXT" }] },
    { id: "sql.jdbc",             label: "SQL / JDBC (direct)",     fields: [{ key: "driver",         label: "JDBC driver class", ph: "org.postgresql.Driver" },
                                                                               { key: "url",            label: "JDBC URL",          ph: "jdbc:postgresql://host:5432/db" },
                                                                               { key: "user",           label: "User",              ph: "pentaho" },
                                                                               { key: "pass",           label: "Password",          ph: "", secret: true }] },
    { id: "mondrian.jndi",        label: "Mondrian MDX / JNDI",     fields: [{ key: "jndi",           label: "JNDI pool name",    ph: "PDC-BIDB-EXT" },
                                                                               { key: "catalog",        label: "Schema catalog path", ph: "/pentaho/etc/mondrian/schema.xml" }] },
    { id: "olap4j",               label: "OLAP4J",                  fields: [{ key: "connectString",  label: "Connect string",    ph: "Provider=Mondrian;DataSource=..." }] },
    { id: "metadata",             label: "Metadata / MQL",          fields: [{ key: "domainId",       label: "Domain ID",         ph: "pdc" },
                                                                               { key: "xmiFile",        label: "XMI file path",     ph: "/etc/metadata.xmi" }] },
    { id: "kettle.TransFromFile", label: "Kettle / PDI transform",  fields: [{ key: "fileName",       label: ".ktr file path",    ph: "/public/etl/my.ktr" },
                                                                               { key: "step",           label: "Output step name",  ph: "Output" }] },
    { id: "scripting",            label: "Scripting (JS / Groovy)", fields: [{ key: "language",       label: "Language",          ph: "javascript" }] }
  ];

  Studio.newCDAConnection = function (type) {
    return { id: Studio.uid("conn"), type: type || "sql.jndi",
             jndi: "", driver: "", url: "", user: "", pass: "",
             catalog: "", connectString: "", domainId: "", xmiFile: "",
             fileName: "", step: "", language: "javascript" };
  };

  /* ---- output options (post-query filter / sort / limit) ---- */
  Studio.DA_OPS = [
    { id: "=",          label: "= equals" },
    { id: "!=",         label: "≠ not equals" },
    { id: ">",          label: "> greater than" },
    { id: ">=",         label: "≥ greater or equal" },
    { id: "<",          label: "< less than" },
    { id: "<=",         label: "≤ less or equal" },
    { id: "contains",   label: "contains (text)" },
    { id: "startsWith", label: "starts with" }
  ];
  Studio.newOutputFilter = function () { return { col: "", op: "=", val: "" }; };
  Studio.newOutputSort   = function () { return { col: "", dir: "asc" }; };

  // Apply outputOptions (filters / sortBy / limit) to a {cols, rows} result.
  // Returns a new object with the same cols and a new, filtered/sorted/limited rows array.
  Studio.applyOutputOptions = function (da, result) {
    if (!da || !da.outputOptions) return result;
    var oo = da.outputOptions;
    var cols = result.cols;
    var rows = result.rows.slice();

    // filters — skip entries with no column or empty value
    var activeFilters = (oo.filters || []).filter(function (f) { return f.col && String(f.val || "") !== ""; });
    activeFilters.forEach(function (f) {
      var ci = cols.indexOf(f.col);
      if (ci < 0) return;
      rows = rows.filter(function (row) {
        var sv = String(row[ci] == null ? "" : row[ci]);
        var fv = String(f.val);
        var nv = parseFloat(sv), fnv = parseFloat(fv);
        var numCmp = !isNaN(nv) && !isNaN(fnv);
        switch (f.op) {
          case "=":          return numCmp ? nv === fnv : sv === fv;
          case "!=":         return numCmp ? nv !== fnv : sv !== fv;
          case ">":          return numCmp ? nv > fnv   : sv > fv;
          case ">=":         return numCmp ? nv >= fnv  : sv >= fv;
          case "<":          return numCmp ? nv < fnv   : sv < fv;
          case "<=":         return numCmp ? nv <= fnv  : sv <= fv;
          case "contains":   return sv.toLowerCase().indexOf(fv.toLowerCase()) >= 0;
          case "startsWith": return sv.toLowerCase().indexOf(fv.toLowerCase()) === 0;
          default: return true;
        }
      });
    });

    // sort
    var activeSorts = (oo.sortBy || []).filter(function (s) { return s.col; });
    if (activeSorts.length) {
      rows.sort(function (a, b) {
        for (var i = 0; i < activeSorts.length; i++) {
          var s = activeSorts[i];
          var ci = cols.indexOf(s.col);
          if (ci < 0) continue;
          var av = a[ci], bv = b[ci];
          var na = parseFloat(av), nb = parseFloat(bv);
          var cmp = (!isNaN(na) && !isNaN(nb)) ? na - nb : String(av || "").localeCompare(String(bv || ""));
          if (cmp !== 0) return s.dir === "desc" ? -cmp : cmp;
        }
        return 0;
      });
    }

    // row limit
    var limit = oo.limit ? parseInt(oo.limit, 10) : 0;
    if (limit > 0) rows = rows.slice(0, limit);

    return { cols: cols, rows: rows };
  };

  // Map a DA kind to the CDA XML <DataAccess type="..."> attribute value.
  Studio.daAccessType = function (kind) {
    if (!kind || /^sql/.test(kind)) return "sql";
    if (kind === "mondrian.jndi") return "mdx";
    if (kind === "olap4j") return "olap4j";
    if (kind === "metadata") return "mql";
    if (/^kettle/.test(kind)) return "kettle";
    if (kind === "scripting") return "scripting";
    return "sql";
  };

  // extract column aliases from SQL (SELECT … AS alias …)
  Studio.detectColumns = function (sql) {
    var out = [], seen = {};
    var re = /\bAS\s+([`"'\[]?[a-zA-Z_]\w*[`"'\]]?)/gi, m;
    while ((m = re.exec(sql || "")) !== null) {
      var col = m[1].replace(/^[`"'\[]+|[`"'\]]+$/g, "");
      if (!seen[col]) { seen[col] = 1; out.push(col); }
    }
    return out;
  };

  /* E3 — Dashboard thumbnail (SVG layout preview, no DOM/canvas needed).
     Returns a raw SVG string representing the spec's visual structure:
     a header strip, optional KPI row, and the panel grid with per-chart-type
     accent colors. Embed directly via innerHTML or as a data: img src. */
  Studio.makeThumbnail = function (spec, theme) {
    var W = 240, H = 140, dark = theme === "dark";
    var bg   = dark ? "#161c2b" : "#f4f6fb";
    var card = dark ? "#1c2235" : "#ffffff";
    var text = dark ? "#c8d4e8" : "#1a2742";
    var pal  = ["#005bb5","#7d3c98","#2e8bd0","#00a39a","#e67e22"];
    var cpals = { bars:"#005bb5",donut:"#7d3c98",line:"#2e8bd0",stacked:"#005bb5",
      areaStacked:"#7d3c98",combo:"#005bb5",treemap:"#00a39a",scatter:"#e67e22",
      gauge:"#c0392b",radar:"#8e44ad",heatmap:"#16a085",table:"#2c3e50",
      waterfall:"#27ae60",funnel:"#e67e22",sankey:"#005bb5",chord:"#7d3c98",
      network:"#1a6fa8",sunburst:"#2e8bd0",bullet:"#c0392b",calHeatmap:"#00a39a",kpi:"#005bb5" };
    function svgEsc(s) { return (s || "").slice(0,32).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
    var p = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '">'];
    p.push('<rect width="' + W + '" height="' + H + '" fill="' + bg + '"/>');
    p.push('<rect width="' + W + '" height="20" fill="' + card + '"/>');
    p.push('<rect width="3" height="20" fill="#005bb5"/>');
    p.push('<text x="8" y="13" font-family="system-ui,sans-serif" font-size="8.5" font-weight="700" fill="' + text + '">' + svgEsc(spec.title || "Dashboard") + '</text>');
    var kpis = spec.kpis || [], startY = 24;
    if (kpis.length) {
      var kCount = Math.min(kpis.length, 6);
      var kw = (W - 12 - (kCount - 1) * 4) / kCount;
      for (var ki = 0; ki < kCount; ki++) {
        var kx = 6 + ki * (kw + 4);
        p.push('<rect x="' + kx + '" y="' + startY + '" width="' + kw + '" height="17" rx="2" fill="' + card + '"/>');
        p.push('<rect x="' + kx + '" y="' + startY + '" width="3" height="17" fill="' + pal[ki % 5] + '"/>');
      }
      startY += 22;
    }
    var panels = spec.panels || [], cols = spec.gridCols || 3;
    if (panels.length) {
      var rows = Math.ceil(panels.length / cols), avail = H - startY - 4;
      var pw = (W - 12 - (cols - 1) * 4) / cols;
      var ph = Math.min((avail - (rows - 1) * 4) / rows, 40);
      var pcol = 0, prow = 0;
      for (var pi = 0; pi < panels.length && prow < 4; pi++) {
        var panel = panels[pi];
        var span = panel.span === "full" ? cols : Math.min(+panel.span || 1, cols);
        if (pcol + span > cols) { pcol = 0; prow++; }
        var px = 6 + pcol * (pw + 4), py = startY + prow * (ph + 4);
        var pws = pw * span + 4 * (span - 1);
        var cc = cpals[panel.chart && panel.chart.type] || "#005bb5";
        p.push('<rect x="' + px + '" y="' + py + '" width="' + pws + '" height="' + ph + '" rx="2" fill="' + card + '"/>');
        p.push('<rect x="' + px + '" y="' + py + '" width="' + pws + '" height="' + ph + '" rx="2" fill="' + cc + '" opacity="0.18"/>');
        p.push('<rect x="' + px + '" y="' + py + '" width="' + pws + '" height="2.5" fill="' + cc + '" rx="1"/>');
        pcol += span; if (pcol >= cols) { pcol = 0; prow++; }
      }
    }
    p.push('</svg>');
    return p.join("");
  };

  /* G3 — Parse an existing .ktr XML string and return its metadata.
     Returns { name: string, steps: [{name, type}] }.
     Used by the "Import .ktr…" file picker in the Kettle DA editor so users
     can inspect an existing transform and pick its output step without opening PDI.
     Handles both compact (one-liner) and pretty-printed .ktr files. */
  Studio.parseKtr = function (xmlStr) {
    var infoM = xmlStr.match(/<info>([\s\S]*?)<\/info>/);
    var nameM = infoM ? infoM[1].match(/<name>([^<]+)<\/name>/) : null;
    var transformName = nameM ? nameM[1].trim() : "";
    var steps = [];
    // Process each <step>…</step> block independently to avoid cross-step regex confusion.
    xmlStr.replace(/<step>([\s\S]*?)<\/step>/g, function (_, block) {
      var nm = block.match(/<name>([^<]+)<\/name>/);
      var tp = block.match(/<type>([^<]+)<\/type>/);
      if (nm && tp) {
        var n = nm[1].trim(), t = tp[1].trim();
        if (n && !steps.some(function (s) { return s.name === n; })) {
          steps.push({ name: n, type: t });
        }
      }
    });
    return { name: transformName, steps: steps };
  };

  // Track L (architecture sweep): shared by both browser-native connectors (duckdb.js, sqlitehttp.js) —
  // each defined a byte-identical private copy of this promise-timeout wrapper. Consolidated here
  // alongside Studio.friendlyConnectorError (the same pair's other shared helper, extracted in v170)
  // so the two connectors can't drift on timeout-message wording again.
  Studio.withTimeout = function (promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error((label || "Operation") + " timed out — check the URL and your network connection.")); }, ms);
      promise.then(
        function (v) { clearTimeout(timer); resolve(v); },
        function (e) { clearTimeout(timer); reject(e); }
      );
    });
  };

  // basic validation -> array of {level, msg}
  // Z14 slice 4 — shared error-message polish for the browser-native connectors (DuckDB-Wasm,
  // SQLite-WASM-HTTP): both fail in the same handful of recognizable ways (CORS blocked, host
  // doesn't support HTTP Range Requests, plain network/DNS failure) but the raw browser error
  // ("Failed to fetch", "NetworkError when attempting to fetch resource") means little to someone
  // authoring a data source. Appends one plain-English, actionable hint when a known pattern
  // matches; otherwise returns the original message untouched.
  Studio.friendlyConnectorError = function (message) {
    var msg = String(message || "Unknown error");
    var low = msg.toLowerCase();
    var hint = null;
    if (/failed to fetch|networkerror|load failed|cors/.test(low)) {
      hint = "This usually means the host doesn't allow cross-origin requests (CORS) or blocks HTTP Range Requests. Try a public S3/GCS/R2 bucket with CORS enabled for your origin, or a direct static-file host.";
    } else if (/timed out/.test(low)) {
      hint = "The file may be unreachable, very large, or the host may be slow to respond to range requests — double-check the URL in a new browser tab first.";
    } else if (/404|not found/.test(low)) {
      hint = "The file URL returned a 404 — double-check the path and that the file is publicly readable.";
    }
    return hint ? msg + " — " + hint : msg;
  };

  Studio.validate = function (spec) {
    var out = [];
    if (!spec.name || !/^[a-z0-9][a-z0-9-]*$/.test(spec.name))
      out.push({ level: "error", msg: "Name must be lowercase letters/numbers/dashes (used for file names)." });
    if (!spec.title) out.push({ level: "warn", msg: "Dashboard has no title." });
    if (!spec.panels.length && !spec.kpis.length) out.push({ level: "warn", msg: "Dashboard has no panels or KPIs." });
    spec.panels.forEach(function (p) {
      if (!p.chart.da) out.push({ level: "error", msg: "Panel “" + (p.title || p.id) + "” has no data query bound." });
    });
    // N-DATA innovation idea (added 2026-07-04, "dashboard health score"): flag a declared data
    // access that no panel/KPI actually references — dead config left over from an earlier draft
    // that a builder would otherwise never notice (it doesn't break anything, it's just unused).
    var das = (spec.cda && spec.cda.dataAccesses) || [];
    var usedDaIds = {};
    spec.panels.forEach(function (p) { if (p.chart && p.chart.da) usedDaIds[p.chart.da] = true; });
    (spec.kpis || []).forEach(function (k) { if (k.da) usedDaIds[k.da] = true; });
    // Found while extending this check: a DA bound only to a filter, or only feeding a compound
    // (join/union) DA as its leftId/rightId source, was wrongly flagged "unused" — neither of those
    // is dead config. Filters bind a DA directly (Studio.addFilter's `f.da`); a compound DA's own
    // leftId/rightId sources are used BY that compound DA even with no panel bound straight to them.
    (spec.filters || []).forEach(function (f) { if (f.da) usedDaIds[f.da] = true; });
    das.forEach(function (da) {
      if (Studio.isCompoundDA(da)) { if (da.leftId) usedDaIds[da.leftId] = true; if (da.rightId) usedDaIds[da.rightId] = true; }
    });
    das.forEach(function (da) {
      if (!usedDaIds[da.id]) out.push({ level: "info", msg: "Data access “" + (da.name || da.id) + "” is declared but not used by any panel, KPI, or filter." });
    });
    // N-DATA follow-up (closes the "broken drill-through/detail-drawer target" health-score item):
    // panel/KPI drill-through (`p.drill`/`k.drill`) only ever targets an external URL, which can't
    // be meaningfully validated offline — but the Detail drawer (`p.detail.da`) targets a DA id
    // INSIDE this same spec, and that DA can be deleted or renamed after the drawer was wired up.
    // When that happens, clicking the chart silently does nothing (PDC.openDetail finds no
    // matching DA) — no error, no console warning, just a dead click. Flag it here instead.
    var daIds = {}; das.forEach(function (da) { daIds[da.id] = true; });
    spec.panels.forEach(function (p) {
      if (p.detail && p.detail.da && !daIds[p.detail.da]) {
        out.push({ level: "warn", msg: "Panel “" + (p.title || p.id) + "”'s Detail drawer points to a data access that no longer exists — clicking a chart element will silently do nothing." });
      }
    });
    // N-DATA innovation idea follow-up: the "still open" half of the dashboard health score idea
    // — run the existing Data quality watchdog (v260/v261) over every bound DA's own sample rows,
    // not just the DA that happens to be selected in the inspector at the time. Compound DAs have
    // no sample rows of their own (they're a join/union OF other DAs), so they're skipped here.
    das.forEach(function (da) {
      if (Studio.isCompoundDA(da) || !usedDaIds[da.id]) return; // an orphaned DA already has its own note above
      var sample;
      try { sample = Studio.sampleRows({ id: da.id, columns: da.columns || [], params: da.params || [] }).rows; } catch (e) { sample = []; }
      Studio.dataQualityIssues(da.columns || [], sample).forEach(function (issue) {
        out.push({ level: "warn", msg: "Data access “" + (da.name || da.id) + "”: " + Studio.dataQualityMessage(issue) });
      });
    });
    // Architecture-gap finding (2026-07-04): the six direct-query connectors (DuckDB/SQLite/
    // Snowflake/Databricks/BigQuery/Generic SQL) run genuinely live in the builder's own Test
    // connection/Run live flow, but (at the time of this finding) the exported/deployed Dashboard
    // Framework had no runtime query path for any of them — a real deployment would silently show
    // only the offline sample data these DAs were authored against. **DuckDB/SQLite now have a real
    // runtime path** (studio-render.js's PDC.cda dispatch + exporters.js bundling their façade only
    // when used, shipped same run as this comment) — the credential-free half of the gap is closed,
    // so they're no longer warned about here. The four token-based kinds still need a real design
    // decision on shipping a live credential inside a static exported file before they can follow.
    var DIRECT_DA_KINDS = { snowflake: "Snowflake", databricks: "Databricks", bigquery: "BigQuery", http: "Generic SQL/HTTP" };
    das.forEach(function (da) {
      if (!usedDaIds[da.id] || !DIRECT_DA_KINDS[da.kind]) return; // an orphaned DA already has its own note above
      out.push({ level: "warn", msg: "Data access “" + (da.name || da.id) + "” (" + DIRECT_DA_KINDS[da.kind] + ") has no live query path once this dashboard is exported/deployed — outside the builder it will only ever show the sample data it was authored against." });
    });
    return out;
  };

  // N-FUN (Track N innovation backlog): "Build-completeness meter" — a tasteful, game-like nudge
  // toward a well-rounded dashboard, distinct from Studio.validate() above (which only flags real
  // problems). This is aspirational/gentle, never an error: a dashboard with zero KPIs is valid, but
  // celebrating "you added one" is the fun, encouraging framing the north star asks for.
  Studio.dashboardCompleteness = function (spec) {
    var items = [
      { key: "title",  label: "Give it a title",        done: !!(spec.title && spec.title.trim() && spec.title !== "Untitled Dashboard") },
      { key: "panel",  label: "Add a panel",             done: (spec.panels || []).length > 0 },
      { key: "kpi",    label: "Add a KPI tile",          done: (spec.kpis || []).length > 0 },
      { key: "filter", label: "Add a filter",            done: (spec.filters || []).length > 0 },
      { key: "style",  label: "Add your own accent color or logo", done: !!(spec.themeColor || spec.dashboardTheme || spec.paletteKey || spec.headerLogo) },
    ];
    var done = items.filter(function (i) { return i.done; }).length;
    return { done: done, total: items.length, items: items };
  };

  // N-DIST follow-up: side-by-side diff between two dashboard specs (e.g. a past version
  // history checkpoint vs. the current working spec) — "what changed" for time travel.
  // Pure/testable: no DOM, no PDC. Panels/filters match by their stable `id`; KPIs have no
  // id (positional array), so they're compared by index. Field/value changes inside a
  // matched panel/KPI/filter are reported as one JSON-equality check (not a nested diff) —
  // enough to say "this changed," which is what a checkpoint-restore decision needs.
  var DIFF_FIELDS = [
    ["title", "Title"], ["subtitle", "Subtitle"], ["name", "File name"], ["description", "Description"],
    ["themeColor", "Accent color"], ["headerBg", "Header background color"], ["headerLink", "Header link"],
    ["titleSize", "Title size"], ["subtitleStyle", "Subtitle style"], ["paletteKey", "Series palette"],
    ["dashboardTheme", "Dashboard theme"],
    ["gridCols", "Grid columns"]
  ];
  Studio.diffSpecs = function (a, b) {
    a = a || {}; b = b || {};
    var out = { fields: [], panels: { added: [], removed: [], changed: [] }, kpis: { added: 0, removed: 0, changed: 0 }, filters: { added: [], removed: [], changed: [] } };
    DIFF_FIELDS.forEach(function (f) {
      var from = a[f[0]] || "", to = b[f[0]] || "";
      if (from !== to) out.fields.push({ key: f[0], label: f[1], from: from, to: to });
    });
    if ((a.headerLogo || "") !== (b.headerLogo || "")) {
      out.fields.push({ key: "headerLogo", label: "Header logo", from: a.headerLogo ? "custom image" : "(none)", to: b.headerLogo ? "custom image" : "(none)" });
    }
    var aP = a.panels || [], bP = b.panels || [];
    var aPMap = {}; aP.forEach(function (p) { aPMap[p.id] = p; });
    var bPMap = {}; bP.forEach(function (p) { bPMap[p.id] = p; });
    bP.forEach(function (p) { if (!aPMap[p.id]) out.panels.added.push(p.title || p.id); });
    aP.forEach(function (p) {
      var bp = bPMap[p.id];
      if (!bp) out.panels.removed.push(p.title || p.id);
      else if (JSON.stringify(p) !== JSON.stringify(bp)) out.panels.changed.push(bp.title || bp.id);
    });
    var aK = a.kpis || [], bK = b.kpis || [];
    if (bK.length > aK.length) out.kpis.added = bK.length - aK.length;
    if (aK.length > bK.length) out.kpis.removed = aK.length - bK.length;
    for (var i = 0; i < Math.min(aK.length, bK.length); i++) {
      if (JSON.stringify(aK[i]) !== JSON.stringify(bK[i])) out.kpis.changed++;
    }
    var aF = a.filters || [], bF = b.filters || [];
    var aFMap = {}; aF.forEach(function (f) { aFMap[f.id] = f; });
    var bFMap = {}; bF.forEach(function (f) { bFMap[f.id] = f; });
    bF.forEach(function (f) { if (!aFMap[f.id]) out.filters.added.push(f.label || f.id); });
    aF.forEach(function (f) {
      var bf = bFMap[f.id];
      if (!bf) out.filters.removed.push(f.label || f.id);
      else if (JSON.stringify(f) !== JSON.stringify(bf)) out.filters.changed.push(bf.label || bf.id);
    });
    return out;
  };
  // Flattens a diffSpecs() result into plain-English lines for display; [] means identical.
  Studio.diffSummary = function (diff) {
    var lines = [];
    (diff.fields || []).forEach(function (f) {
      lines.push(f.label + ": “" + (f.from || "(empty)") + "” → “" + (f.to || "(empty)") + "”");
    });
    function group(kind, d) {
      if (d.added && d.added.length) lines.push(d.added.length + " " + kind + (d.added.length === 1 ? "" : "s") + " added: " + d.added.join(", "));
      if (d.removed && d.removed.length) lines.push(d.removed.length + " " + kind + (d.removed.length === 1 ? "" : "s") + " removed: " + d.removed.join(", "));
      if (d.changed) {
        var n = typeof d.changed === "number" ? d.changed : d.changed.length;
        var names = typeof d.changed === "number" ? "" : (d.changed.length ? ": " + d.changed.join(", ") : "");
        if (n) lines.push(n + " " + kind + (n === 1 ? "" : "s") + " changed" + names);
      }
    }
    group("panel", diff.panels); group("KPI", diff.kpis); group("filter", diff.filters);
    return lines;
  };
})();
