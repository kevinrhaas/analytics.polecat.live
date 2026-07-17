/* Analytics — © 2026 Polecat.live. See LICENSE. */
/* app/sources/jobs-engine.js — Viridis V8 (data-management-lite): the
   prep/load job engine. Pure functions over {columns, rows} (rows are arrays
   of cells, matching every adapter's queryData() shape) — no Workspace/DOM
   dependency, so the step logic is unit-testable directly.

   A job is an ordered list of steps run over one source dataset's live rows:
   rename, cast, derive (arithmetic on two operands), filter, aggregate/rollup
   (group-by + sum/avg/count/median/wmean — wmean is the acreage-weighted
   mean, the honest way to roll a percent metric up from county to
   State/CRD/HUC8, since a flat average of percentages misrepresents counties
   of very different size), join, and union.

   join/union pull in a SECOND dataset's already-resolved {columns, rows} —
   the engine stays pure/synchronous, so the caller (studio.js, which has
   Workspace + adapter access) runs the referenced dataset(s) first and
   passes the result in as `ctx.datasets[datasetId] = {columns, rows}`.
   union is the "5-provider normalize-and-stack" case: each provider's raw
   column names get mapped onto the pipeline's existing schema via
   step.columnMap, so five differently-shaped provider datasets land as rows
   in one common table.

   A 'sql' step (Viridis V8 slice 3) is the one op this pure engine can't run
   itself — it needs an actual SQL engine (DuckDB-Wasm, see app/duckdb.js),
   which is async and DOM/CDN-dependent. Studio.runJobStepsAsync() below
   splits a step list at 'sql' boundaries, running the synchronous engine on
   each pipe segment and handing 'sql' segments off to a caller-supplied
   sqlRunner — so this file still has zero Workspace/DOM/engine dependency,
   and stays unit-testable by injecting a fake sqlRunner. */
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

  // join: {op:'join', datasetId, leftCol, rightCol, type:'inner'|'left', prefix?}
  // Adds the right dataset's non-key columns onto every matching left row
  // (the join key column itself isn't duplicated). Name collisions with an
  // existing column get an auto "_2" suffix so a step can never silently
  // clobber data. 'left' keeps unmatched left rows (added columns -> null);
  // 'inner' (default) drops them.
  function applyJoin(columns, objs, step, ctx) {
    var right = (ctx && ctx.datasets && ctx.datasets[step.datasetId]) || { columns: [], rows: [] };
    var rightObjs = toObjects(right.columns, right.rows);
    var leftKey = step.leftCol, rightKey = step.rightCol;
    var type = step.type === "left" ? "left" : "inner";
    var idx = {};
    rightObjs.forEach(function (r) {
      var k = String(r[rightKey]);
      (idx[k] = idx[k] || []).push(r);
    });
    var addCols = (right.columns || []).filter(function (c) { return c !== rightKey; });
    var outNames = addCols.map(function (c) {
      var name = (step.prefix || "") + c;
      while (columns.indexOf(name) >= 0) name += "_2";
      return name;
    });
    var outCols = columns.concat(outNames);
    var out = [];
    objs.forEach(function (o) {
      var matches = idx[String(o[leftKey])] || [];
      if (!matches.length) {
        if (type === "left") {
          var row = Object.assign({}, o);
          outNames.forEach(function (name) { row[name] = null; });
          out.push(row);
        }
        return;
      }
      matches.forEach(function (m) {
        var row = Object.assign({}, o);
        addCols.forEach(function (c, i) { row[outNames[i]] = m[c]; });
        out.push(row);
      });
    });
    return { columns: outCols, objs: out };
  }

  // union: {op:'union', datasetId, columnMap:[{to,from}, ...]}
  // Stacks the right dataset's rows onto the pipeline WITHOUT changing its
  // schema — every added row is reshaped onto the current `columns`. Each
  // target column pulls from step.columnMap's matching `from` name when
  // given, else falls back to a same-name match, else null. This is the
  // normalize-and-stack case: five providers with five different raw column
  // names each get their own columnMap onto one common schema.
  function applyUnion(columns, objs, step, ctx) {
    var right = (ctx && ctx.datasets && ctx.datasets[step.datasetId]) || { columns: [], rows: [] };
    var rightObjs = toObjects(right.columns, right.rows);
    var byTarget = {};
    (step.columnMap || []).forEach(function (m) { if (m.to) byTarget[m.to] = m.from; });
    var mapped = rightObjs.map(function (r) {
      var o = {};
      columns.forEach(function (c) {
        var src = Object.prototype.hasOwnProperty.call(byTarget, c) ? byTarget[c] : c;
        o[c] = Object.prototype.hasOwnProperty.call(r, src) ? r[src] : null;
      });
      return o;
    });
    return { columns: columns, objs: objs.concat(mapped) };
  }

  var STEP_HANDLERS = {
    rename: applyRename, cast: applyCast, derive: applyDerive, filter: applyFilter,
    aggregate: applyAggregate, join: applyJoin, union: applyUnion
  };

  // Studio.runJobSteps({columns, rows}, steps, ctx?) -> {columns, rows, error?}
  // ctx.datasets, when join/union steps are present, maps datasetId ->
  // {columns, rows} for every dataset those steps reference (resolved by the
  // caller before running steps — see studio.js's resolveJobCtx).
  Studio.runJobSteps = function (input, steps, ctx) {
    var columns = ((input && input.columns) || []).slice();
    var objs = toObjects(columns, input && input.rows);
    try {
      (steps || []).forEach(function (step) {
        var handler = STEP_HANDLERS[step.op];
        if (!handler) return;
        var r = handler(columns, objs, step, ctx);
        columns = r.columns; objs = r.objs;
      });
    } catch (e) {
      return { columns: columns, rows: [], error: e.message || String(e) };
    }
    return { columns: columns, rows: toRows(columns, objs) };
  };

  // Studio.runJobStepsAsync(input, steps, ctx?, sqlRunner?) -> Promise<{columns, rows, error?}>
  // Splits `steps` at every 'sql' step into alternating pipe/sql segments,
  // running pipe segments through the synchronous runJobSteps and each 'sql'
  // segment through sqlRunner(columns, rows, query) -> Promise<{columns, rows}>
  // (query text addresses the CURRENT pipeline state as table "t" — the
  // caller owns that convention, this file just orchestrates the split).
  // A job with no 'sql' step never calls sqlRunner at all — zero async
  // engine cost for the common case. Rejections/thrown errors from a pipe
  // segment or sqlRunner resolve to {error} rather than rejecting, matching
  // runJobSteps' own error contract.
  Studio.runJobStepsAsync = function (input, steps, ctx, sqlRunner) {
    var segments = [], pipe = [];
    (steps || []).forEach(function (step) {
      if (step.op === "sql") { segments.push({ pipe: pipe }); segments.push({ sql: step }); pipe = []; }
      else pipe.push(step);
    });
    segments.push({ pipe: pipe });

    var state = { columns: ((input && input.columns) || []).slice(), rows: (input && input.rows) || [] };
    var chain = Promise.resolve();
    segments.forEach(function (seg) {
      chain = chain.then(function () {
        if (seg.pipe) {
          var out = Studio.runJobSteps(state, seg.pipe, ctx);
          if (out.error) throw new Error(out.error);
          state = { columns: out.columns, rows: out.rows };
          return;
        }
        if (!sqlRunner) throw new Error("This job has a Custom SQL step, but no SQL engine is available.");
        return Promise.resolve(sqlRunner(state.columns, state.rows, seg.sql.query || "")).then(function (r) {
          state = { columns: (r && r.columns) || [], rows: (r && r.rows) || [] };
        });
      });
    });
    return chain.then(function () {
      return { columns: state.columns, rows: state.rows };
    }, function (e) {
      return { columns: state.columns, rows: [], error: e.message || String(e) };
    });
  };

  // datasetIdsFor(steps) -> array of every distinct datasetId a job's
  // join/union steps reference, so the caller knows what to resolve first.
  Studio.jobStepDatasetIds = function (steps) {
    var seen = {}, ids = [];
    (steps || []).forEach(function (step) {
      if ((step.op === "join" || step.op === "union") && step.datasetId && !seen[step.datasetId]) {
        seen[step.datasetId] = true; ids.push(step.datasetId);
      }
    });
    return ids;
  };

  Studio.JOB_STEP_KINDS = [
    { op: "rename", label: "Rename column" },
    { op: "cast", label: "Cast type" },
    { op: "derive", label: "Derive column" },
    { op: "filter", label: "Filter rows" },
    { op: "aggregate", label: "Aggregate / rollup" },
    { op: "join", label: "Join with another dataset" },
    { op: "union", label: "Union / stack another dataset" },
    { op: "sql", label: "Custom SQL" }
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
