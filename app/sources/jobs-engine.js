/* Analytics — © 2026 Polecat.live. See LICENSE. */
/* app/sources/jobs-engine.js — Viridis V8 slice 1 (data-management-lite): the
   prep/load job engine. Pure functions over {columns, rows} (rows are arrays
   of cells, matching every adapter's queryData() shape) — no Workspace/DOM
   dependency, so the step logic is unit-testable directly.

   A job is an ordered list of steps run over one source dataset's live rows:
   rename, cast, derive (arithmetic on two operands), filter, and one
   aggregate/rollup (group-by + sum/avg/count/median/wmean). wmean is the
   acreage-weighted mean — the honest way to roll a percent metric up from
   county to State/CRD/HUC8 (a flat average of percentages misrepresents
   counties of very different size).

   JOIN/UNION across datasets and a custom-SQL step are deferred to a later
   slice (see STATUS.md V8) — this slice covers the single-dataset prep
   pipeline the Viridis rollups need. */
(function () {
  "use strict";
  window.Studio = window.Studio || {};

  function num(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }

  function toObjects(columns, rows) {
    return (rows || []).map(function (r) {
      var o = {};
      columns.forEach(function (c, i) { o[c] = r[i]; });
      return o;
    });
  }
  function toRows(columns, objs) {
    return objs.map(function (o) { return columns.map(function (c) { return o[c]; }); });
  }

  function applyRename(columns, objs, step) {
    if (!step.from || !step.to || columns.indexOf(step.from) < 0) return { columns: columns, objs: objs };
    var next = columns.map(function (c) { return c === step.from ? step.to : c; });
    objs.forEach(function (o) {
      o[step.to] = o[step.from];
      if (step.to !== step.from) delete o[step.from];
    });
    return { columns: next, objs: objs };
  }

  function applyCast(columns, objs, step) {
    objs.forEach(function (o) {
      var v = o[step.col];
      if (v == null) return;
      if (step.to === "number") o[step.col] = num(v);
      else if (step.to === "string") o[step.col] = String(v);
    });
    return { columns: columns, objs: objs };
  }

  // An operand is {col:'name'} (read from the row) or {value:<literal>} — kept
  // explicit rather than string-sniffed, so a literal "2" is never confused
  // with a column named "2".
  function operand(o, ref) {
    if (!ref) return null;
    if (ref.col != null) return num(o[ref.col]);
    if (ref.value != null) return num(ref.value);
    return null;
  }
  var DERIVE_OPS = {
    "+": function (a, b) { return a + b; },
    "-": function (a, b) { return a - b; },
    "*": function (a, b) { return a * b; },
    "/": function (a, b) { return b !== 0 ? a / b : null; }
  };
  function applyDerive(columns, objs, step) {
    var fn = DERIVE_OPS[step.operator];
    var next = columns.indexOf(step.outCol) >= 0 ? columns : columns.concat([step.outCol]);
    objs.forEach(function (o) {
      var a = operand(o, step.a), b = operand(o, step.b);
      o[step.outCol] = (fn && a != null && b != null) ? fn(a, b) : null;
    });
    return { columns: next, objs: objs };
  }

  var CMP = {
    eq: function (a, b) { return String(a) === String(b); },
    ne: function (a, b) { return String(a) !== String(b); },
    gt: function (a, b) { return num(a) != null && num(b) != null && num(a) > num(b); },
    gte: function (a, b) { return num(a) != null && num(b) != null && num(a) >= num(b); },
    lt: function (a, b) { return num(a) != null && num(b) != null && num(a) < num(b); },
    lte: function (a, b) { return num(a) != null && num(b) != null && num(a) <= num(b); },
    contains: function (a, b) { return String(a == null ? "" : a).toLowerCase().indexOf(String(b == null ? "" : b).toLowerCase()) >= 0; }
  };
  function applyFilter(columns, objs, step) {
    var fn = CMP[step.cmp] || CMP.eq;
    return { columns: columns, objs: objs.filter(function (o) { return fn(o[step.col], step.value); }) };
  }

  function median(nums) {
    if (!nums.length) return null;
    var s = nums.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }
  // The acreage-weighted mean: sum(value*weight)/sum(weight) — rows missing
  // either half of a pair are skipped rather than treated as zero, so one
  // unweighted county can't silently drag a State/CRD/HUC8 rollup down.
  function metricValue(fn, vals, weights) {
    if (fn === "count") return vals.length;
    var nums = vals.map(num).filter(function (n) { return n != null; });
    if (fn === "sum") return nums.reduce(function (a, b) { return a + b; }, 0);
    if (fn === "avg") return nums.length ? nums.reduce(function (a, b) { return a + b; }, 0) / nums.length : null;
    if (fn === "median") return median(nums);
    if (fn === "wmean") {
      var sw = 0, swv = 0;
      vals.forEach(function (v, i) {
        var n = num(v), w = num(weights[i]);
        if (n == null || w == null) return;
        sw += w; swv += w * n;
      });
      return sw > 0 ? swv / sw : null;
    }
    return null;
  }
  function applyAggregate(columns, objs, step) {
    var groupBy = (step.groupBy || []).filter(function (c) { return columns.indexOf(c) >= 0; });
    var metrics = step.metrics || [];
    var groups = {}, order = [];
    objs.forEach(function (o) {
      var key = groupBy.map(function (c) { return String(o[c]); }).join("");
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(o);
    });
    var outCols = groupBy.concat(metrics.map(function (m) { return m.as || (m.fn + "_" + m.col); }));
    var out = order.map(function (key) {
      var rows = groups[key], row = {};
      groupBy.forEach(function (c) { row[c] = rows[0][c]; });
      metrics.forEach(function (m) {
        var vals = rows.map(function (r) { return r[m.col]; });
        var weights = m.weightCol ? rows.map(function (r) { return r[m.weightCol]; }) : [];
        row[m.as || (m.fn + "_" + m.col)] = metricValue(m.fn, vals, weights);
      });
      return row;
    });
    return { columns: outCols, objs: out };
  }

  var STEP_HANDLERS = { rename: applyRename, cast: applyCast, derive: applyDerive, filter: applyFilter, aggregate: applyAggregate };

  // Studio.runJobSteps({columns, rows}, steps) -> {columns, rows, error?}
  Studio.runJobSteps = function (input, steps) {
    var columns = ((input && input.columns) || []).slice();
    var objs = toObjects(columns, input && input.rows);
    try {
      (steps || []).forEach(function (step) {
        var handler = STEP_HANDLERS[step.op];
        if (!handler) return;
        var r = handler(columns, objs, step);
        columns = r.columns; objs = r.objs;
      });
    } catch (e) {
      return { columns: columns, rows: [], error: e.message || String(e) };
    }
    return { columns: columns, rows: toRows(columns, objs) };
  };

  Studio.JOB_STEP_KINDS = [
    { op: "rename", label: "Rename column" },
    { op: "cast", label: "Cast type" },
    { op: "derive", label: "Derive column" },
    { op: "filter", label: "Filter rows" },
    { op: "aggregate", label: "Aggregate / rollup" }
  ];
  Studio.JOB_AGG_FNS = [
    { fn: "sum", label: "Sum" }, { fn: "avg", label: "Average" }, { fn: "count", label: "Count" },
    { fn: "median", label: "Median" }, { fn: "wmean", label: "Weighted mean (needs a weight column)" }
  ];

  // CSV materialization for a job's output — the same shape a localfile.js
  // dataset already speaks (kind:'file', content is the CSV text), so the
  // result plugs into Explore/Studio/dashboards with zero new dataset code.
  Studio.rowsToCsv = function (columns, rows) {
    function cell(v) {
      var s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    return [columns.map(cell).join(",")].concat((rows || []).map(function (r) { return r.map(cell).join(","); })).join("\n");
  };
}());
