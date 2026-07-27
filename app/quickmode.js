/* Analytics — © 2026 Polecat.live. See LICENSE. */
/* app/quickmode.js — LF24 "Quick mode": the column PROFILER (slice 1) + the
   auto-build PLANNING engine (slices 2/3).

   Pure, DOM-free semantic inference over a dropped file's parsed rows — no
   Workspace/UI dependencies, so it's trivially unit-testable and reusable by
   studio.js's materializing half without dragging DOM code in here. Reads
   column NAMES + VALUES (not just types) to guess intent, per the "SMART
   SEMANTIC INFERENCE" spec in STATUS.md's LF24 entry: geo/temporal/id columns
   drive chart FORM later, measures are what actually gets charted.
   Slice 3 (creativity dial + "fun" chart tier): buildAutoSpec(profile,
   creativity) mixes map/treemap/slope/ensemble widgets into the conservative
   base at creativity:'high', each gated on its own data-support guardrail
   (guessGeoScale, pickSlopePair) rather than forced. */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  var US_STATES = { AL: 1, AK: 1, AZ: 1, AR: 1, CA: 1, CO: 1, CT: 1, DE: 1, FL: 1, GA: 1, HI: 1, ID: 1, IL: 1, IN: 1, IA: 1, KS: 1, KY: 1, LA: 1, ME: 1, MD: 1, MA: 1, MI: 1, MN: 1, MS: 1, MO: 1, MT: 1, NE: 1, NV: 1, NH: 1, NJ: 1, NM: 1, NY: 1, NC: 1, ND: 1, OH: 1, OK: 1, OR: 1, PA: 1, RI: 1, SC: 1, SD: 1, TN: 1, TX: 1, UT: 1, VT: 1, VA: 1, WA: 1, WV: 1, WI: 1, WY: 1, DC: 1 };
  var MONTH_NAMES = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;

  var GEO_NAME_RE = /(^|_)(state|county|fips|huc\d*|watershed|zip|zcta|district|crd|region|province|country)(_|$)|^st$/i;
  var TEMPORAL_NAME_RE = /(^|_)(date|time|timestamp|year|yr|month|mon|ym|day|week|wk|quarter|qtr)(_|$)/i;
  var ID_NAME_RE = /(^|_)(id|uuid|guid|key)$/i;

  function isBlank(v) { return v === "" || v == null; }

  // Sample-based value-shape checks (checked against up to 25 non-blank values —
  // enough signal without scanning huge columns cell-by-cell).
  function sampleMatchRate(values, test) {
    if (!values.length) return 0;
    var n = Math.min(values.length, 25), hit = 0;
    for (var i = 0; i < n; i++) if (test(values[i])) hit++;
    return hit / n;
  }
  function looksGeo(v) {
    var s = String(v).trim();
    if (US_STATES[s.toUpperCase()]) return true; // 2-letter postal code
    if (/^\d{5}$/.test(s)) return true;           // county FIPS / ZCTA
    if (/^\d{8}$/.test(s)) return true;           // HUC8
    return false;
  }
  function looksTemporal(v) {
    var s = String(v).trim();
    if (/^\d{4}-\d{2}(-\d{2})?/.test(s)) return true;   // ISO date / YYYY-MM
    if (/^(19|20)\d{2}$/.test(s)) return true;          // bare year
    if (MONTH_NAMES.test(s)) return true;                // month name/abbrev
    if (typeof v === "number" && v >= 1990 && v <= 2100 && Math.floor(v) === v) return true;
    return false;
  }
  // The classic auto-increment primary-key fingerprint: sorted integers with
  // (almost) every consecutive gap exactly 1. Deliberately NARROWER than "high
  // cardinality + high uniqueness" alone — a real measure (revenue, a price)
  // can be just as unique per row without ever being an id.
  function looksLikeIdSequence(nonEmpty) {
    var nums = nonEmpty.filter(function (v) { return typeof v === "number" && Math.floor(v) === v; });
    if (nums.length < nonEmpty.length * 0.95 || nums.length < 3) return false;
    nums = nums.slice().sort(function (a, b) { return a - b; });
    var steps = 0;
    for (var i = 1; i < nums.length; i++) if (nums[i] - nums[i - 1] === 1) steps++;
    return steps / (nums.length - 1) >= 0.9;
  }

  // classifyColumn(name, values) -> { name, type, nullPct, cardinality, uniquePct, sample }
  // type: 'geo' | 'temporal' | 'measure' | 'categorical' | 'id' | 'text' | 'empty' | 'constant'
  function classifyColumn(name, values) {
    values = values || [];
    var nonEmpty = values.filter(function (v) { return !isBlank(v); });
    var nullPct = values.length ? 1 - nonEmpty.length / values.length : 1;
    var distinct = [];
    var seen = {};
    nonEmpty.forEach(function (v) {
      var k = String(v);
      if (!seen[k]) { seen[k] = 1; distinct.push(v); }
    });
    var cardinality = distinct.length;
    var uniquePct = nonEmpty.length ? cardinality / nonEmpty.length : 0;
    var sample = distinct.slice(0, 5);

    function result(type) {
      return { name: name, type: type, nullPct: round2(nullPct), cardinality: cardinality, uniquePct: round2(uniquePct), sample: sample };
    }

    if (!nonEmpty.length) return result("empty");
    if (cardinality === 1) return result("constant");

    var lowerName = String(name || "").toLowerCase();
    if (GEO_NAME_RE.test(lowerName) || sampleMatchRate(nonEmpty, looksGeo) >= 0.8) return result("geo");
    if (TEMPORAL_NAME_RE.test(lowerName) || sampleMatchRate(nonEmpty, looksTemporal) >= 0.8) return result("temporal");

    var numericCount = 0;
    nonEmpty.forEach(function (v) { if (typeof v === "number") numericCount++; });
    var numericPct = numericCount / nonEmpty.length;

    // id-like: never a chartable measure/dimension on its own, per the guardrail
    // "exclude id/key-like columns (near-unique integers)" — a name that says
    // so, or the classic auto-increment fingerprint (looksLikeIdSequence); a
    // near-unique free-text OR real-valued column (e.g. unique descriptions,
    // or a naturally high-cardinality measure like exact revenue) isn't an
    // id just for being unique — it falls through to measure/text instead.
    if (ID_NAME_RE.test(lowerName) || (uniquePct > 0.9 && cardinality > 20 && looksLikeIdSequence(nonEmpty))) return result("id");

    if (numericPct > 0.8) return result("measure");

    // low/moderate cardinality relative to row count reads as a real dimension;
    // otherwise it's closer to free text than something you'd ever group by.
    if (cardinality <= Math.max(20, Math.round(nonEmpty.length * 0.5))) return result("categorical");
    return result("text");
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  // guessGeoScale(col) -> 'state'|'county'|'huc8'|'zcta'|'crd' — LF24 slice 3's map
  // widget needs to know which Studio.CHARTS.choropleth "Region scale" a geo column
  // is, not just that it IS geo (classifyColumn's job). Name signals first (cheapest,
  // matches the LF22 scale vocabulary), then the same value-shape checks classifyColumn
  // already samples (col.sample), falling back to 'county' — the FIPS default every
  // other Studio geo helper (guessChoroplethCols in app/model.js) also assumes.
  var ZIP_NAME_RE = /zip|zcta/i;
  var HUC_NAME_RE = /huc/i;
  var STATE_NAME_RE = /(^|_)(state|province)(_|$)|^st$/i;
  var DISTRICT_NAME_RE = /district|crd/i;
  var COUNTY_NAME_RE = /county|fips/i;
  function guessGeoScale(col) {
    var name = String((col && col.name) || "").toLowerCase();
    if (ZIP_NAME_RE.test(name)) return "zcta";
    if (HUC_NAME_RE.test(name)) return "huc8";
    if (STATE_NAME_RE.test(name)) return "state";
    if (DISTRICT_NAME_RE.test(name)) return "crd";
    if (COUNTY_NAME_RE.test(name)) return "county";
    var sample = (col && col.sample) || [];
    if (sample.length && sample.every(function (v) { return /^[A-Za-z]{2}$/.test(String(v).trim()); })) return "state";
    if (sample.length && sample.every(function (v) { return /^\d{8}$/.test(String(v).trim()); })) return "huc8";
    if (sample.length && sample.every(function (v) { return /^\d{5}$/.test(String(v).trim()); })) return "county";
    return "county";
  }

  // pickSlopePair(measures) -> {a, b} column names (a=earlier/before, b=later/after) or
  // null. A slope chart is only as good as its before/after STORY — two arbitrary
  // numeric columns rarely tell one, so this deliberately only fires on a real pairing
  // signal instead of grabbing "any two measures" (the LF24 guardrail: only build what
  // the data actually supports). Two signals, strongest first:
  //   1) names carrying different 4-digit years (revenue_2023/revenue_2024).
  //   2) explicit before/after-shaped name prefixes (prior_total/current_total).
  var YEAR_RE = /(19|20)\d{2}/;
  var BEFORE_WORDS = /^(before|prior|start|baseline|old|previous|initial)/i;
  var AFTER_WORDS = /^(after|current|end|final|new|latest)/i;
  function pickSlopePair(measures) {
    if (!measures || measures.length < 2) return null;
    var withYear = measures.map(function (m) {
      var match = YEAR_RE.exec(m.name);
      return match ? { name: m.name, year: parseInt(match[0], 10) } : null;
    }).filter(function (m) { return m; }).sort(function (a, b) { return a.year - b.year; });
    var distinctYears = withYear.filter(function (w, i) { return i === 0 || w.year !== withYear[i - 1].year; });
    if (distinctYears.length >= 2) return { a: distinctYears[0].name, b: distinctYears[distinctYears.length - 1].name };
    var before = measures.filter(function (m) { return BEFORE_WORDS.test(m.name); })[0];
    var after = measures.filter(function (m) { return AFTER_WORDS.test(m.name); })[0];
    if (before && after) return { a: before.name, b: after.name };
    return null;
  }

  // profileColumns({columns, rows}) -> [classifyColumn(...), ...] in column order.
  // `rows` is the array-of-arrays shape Studio.parseCSVText/parseJSONText return.
  function profileColumns(parsed) {
    var columns = (parsed && parsed.columns) || [];
    var rows = (parsed && parsed.rows) || [];
    return columns.map(function (name, ix) {
      return classifyColumn(name, rows.map(function (r) { return r[ix]; }));
    });
  }

  // summarize(profile) -> counts per type + the profile itself, for a friendly
  // one-line summary ("8 columns — 2 measures, 1 date, 1 map field, 4 categories").
  function summarize(profile) {
    var counts = { geo: 0, temporal: 0, measure: 0, categorical: 0, id: 0, text: 0, empty: 0, constant: 0 };
    (profile || []).forEach(function (c) { if (counts[c.type] != null) counts[c.type]++; });
    return counts;
  }

  // buildAutoSpec(profile, creativity) -> LF24's AUTO-BUILD ENGINE (the PLANNING half
  // only — turning a plan into real spec panels/DAs is studio.js's job, since that
  // needs the Workspace/DA machinery this DOM-free module deliberately stays clear
  // of). creativity: 'low' (default) = conservative basics only — a KPI + bars/
  // donut/line/table, never map/ensemble/treemap/slope. 'high' (slice 3's creativity
  // dial) mixes in that "fun" chart tier ON TOP of the same conservative base, and
  // ONLY when the data actually supports the specific shape each one needs — see the
  // guardrails on each fun-tier push below; a level with no qualifying signal simply
  // stays at the conservative set, never a broken/empty widget.
  // Returns an array of widget plans:
  //   { kind:'kpi',   label, fn:'sum'|'count', valueCol }
  //   { kind:'panel', type:'bars'|'donut'|'line'|'table', dim, fn, valueCol, limit, sortDir }
  //   { kind:'panel', type:'choropleth', dim, fn, valueCol, scale }        (high only)
  //   { kind:'panel', type:'treemap', dim, fn, valueCol, limit, sortDir }  (high only)
  //   { kind:'panel', type:'slope', dim, valueCol1, valueCol2 }            (high only)
  //   { kind:'panel', type:'ensembleSeries', dim, seriesCol, valueCol }    (high only)
  // GUARDRAILS applied here, per the LF24 spec in STATUS.md:
  //   - empty/constant columns never drive a widget (excluded up front).
  //   - a dimension is capped to its top N rows by value at materialization time
  //     (limit, honored via da.outputOptions.limit) — never one bar per raw row.
  //   - a line widget only appears with a REAL temporal column AND a measure to
  //     plot ("require a real TEMPORAL column for any time series").
  //   - with no usable measure, bar/donut/kpi fall back to COUNT (rows per group)
  //     instead of being skipped outright — still tells the data's shape.
  function buildAutoSpec(profile, creativity) {
    creativity = creativity === "high" ? "high" : "low";
    var usable = (profile || []).filter(function (c) { return c.type !== "empty" && c.type !== "constant"; });
    var measures = usable.filter(function (c) { return c.type === "measure"; });
    var temporals = usable.filter(function (c) { return c.type === "temporal"; });
    var geos = usable.filter(function (c) { return c.type === "geo"; });
    // A geo column reads fine as a plain bar/donut dimension too — a real MAP is
    // the "fun" tier, so geo just joins the categorical dimension pool for now.
    // Lowest-cardinality first: cheapest to read as a bar/donut without heavy
    // top-N capping.
    var dims = usable.filter(function (c) { return c.type === "categorical" || c.type === "geo"; })
      .sort(function (a, b) { return a.cardinality - b.cardinality; });
    var measure = measures[0] || null;
    var fn = measure ? "sum" : "count";
    var valueCol = measure ? measure.name : null;

    var widgets = [];
    widgets.push({ kind: "kpi", label: measure ? measure.name : "Rows", fn: fn, valueCol: valueCol });

    var barDim = dims[0] || null;
    if (barDim) widgets.push({ kind: "panel", type: "bars", dim: barDim.name, fn: fn, valueCol: valueCol, limit: 10, sortDir: "desc" });

    var donutDim = dims.filter(function (d) { return d.cardinality <= 8 && (!barDim || d.name !== barDim.name); })[0];
    if (donutDim) widgets.push({ kind: "panel", type: "donut", dim: donutDim.name, fn: fn, valueCol: valueCol, limit: 8, sortDir: "desc" });

    if (temporals.length && measure) {
      widgets.push({ kind: "panel", type: "line", dim: temporals[0].name, fn: "sum", valueCol: measure.name, sortDir: "asc" });
    }

    if (creativity === "high") {
      // MAP — a real geo column + a measure to shade it by. Scale guessed per-column
      // (state/county/huc8/zcta/crd) so the map doesn't default every drop to counties.
      var geo = geos[0];
      if (geo && measure) {
        widgets.push({ kind: "panel", type: "choropleth", dim: geo.name, fn: fn, valueCol: valueCol, scale: guessGeoScale(geo) });
      }
      // TREEMAP — a composition view; prefers a dim the bar/donut pair hasn't already
      // used (fresh angle on the data), falls back to reusing barDim rather than
      // skipping the fun tier outright when only one dimension exists at all.
      var treemapDim = dims.filter(function (d) {
        return (!barDim || d.name !== barDim.name) && (!donutDim || d.name !== donutDim.name);
      })[0] || barDim;
      if (treemapDim) {
        widgets.push({ kind: "panel", type: "treemap", dim: treemapDim.name, fn: fn, valueCol: valueCol, limit: 15, sortDir: "desc" });
      }
      // SLOPE — only with a genuine before/after measure PAIR (pickSlopePair), never
      // an arbitrary two measures; needs a label dimension to hang each line off.
      var pair = pickSlopePair(measures);
      if (pair && dims.length) {
        widgets.push({ kind: "panel", type: "slope", dim: dims[0].name, valueCol1: pair.a, valueCol2: pair.b });
      }
      // ENSEMBLE — only with a genuine multi-provider series column (name-signalled,
      // 2-8 distinct values — the same provider/series/source/method convention
      // Studio.guessChoroplethCols already uses) plus a distinct label dimension.
      var seriesCandidate = usable.filter(function (c) {
        return c.type === "categorical" && /provider|series|source|method/i.test(c.name) && c.cardinality >= 2 && c.cardinality <= 8;
      })[0];
      var labelDim = seriesCandidate && dims.filter(function (d) { return d.name !== seriesCandidate.name; })[0];
      if (seriesCandidate && labelDim && measure) {
        widgets.push({ kind: "panel", type: "ensembleSeries", dim: labelDim.name, seriesCol: seriesCandidate.name, valueCol: measure.name });
      }
    }

    widgets.push({ kind: "panel", type: "table" });

    return widgets;
  }

  Studio.QuickMode = {
    classifyColumn: classifyColumn,
    profileColumns: profileColumns,
    summarize: summarize,
    guessGeoScale: guessGeoScale,
    pickSlopePair: pickSlopePair,
    buildAutoSpec: buildAutoSpec
  };
})();
