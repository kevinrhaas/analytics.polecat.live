/* Analytics — © 2026 Polecat.live. See LICENSE. */
/* app/quickmode.js — LF24 "Quick mode" slice 1: the column PROFILER.

   Pure, DOM-free semantic inference over a dropped file's parsed rows — no
   Workspace/UI dependencies, so it's trivially unit-testable and reusable by
   a later auto-build engine (LF24 slices 2/3) without dragging in studio.js.
   Reads column NAMES + VALUES (not just types) to guess intent, per the
   "SMART SEMANTIC INFERENCE" spec in STATUS.md's LF24 entry: geo/temporal/id
   columns drive chart FORM later, measures are what actually gets charted. */
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

  Studio.QuickMode = {
    classifyColumn: classifyColumn,
    profileColumns: profileColumns,
    summarize: summarize
  };
})();
