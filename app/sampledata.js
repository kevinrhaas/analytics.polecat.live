/* ============================================================================
   sampledata.js — deterministic offline sample rows for the live preview.
   Generated FROM each dashboard's actually-bound CDA columns, so the preview
   data always matches the query shape (no cross-CDA id collisions). Mirrors the
   heuristics in tools/import-v2.py. Deterministic (index-based, no randomness).
   ============================================================================ */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  var CATS = ["Snowflake", "Amazon S3", "Oracle", "PostgreSQL", "SharePoint", "Databricks", "BigQuery", "Salesforce"];
  var SENS = ["HIGH", "MEDIUM", "LOW", "Unclassified"];
  var OWNERS = ["A. Chen", "R. Patel", "M. Garcia", "—", "J. Kim", "T. Novak", "L. Osei", "S. Park"];
  var STATUS = ["Success", "Failed", "Aborted", "Running"];
  var APPS = ["Tableau", "Power BI", "Looker", "Excel", "Custom API", "Notebook", "dbt", "Airflow"];
  var EXTS = ["pdf", "xlsx", "csv", "docx", "json", "parquet", "txt", "png"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var TERMS = ["Customer", "Account", "Revenue", "PII", "Region", "Product", "Contract", "Invoice"];
  // Viridis V7: the ensemble demo's provider/practice vocabulary — shared by the
  // classify()/valueFor() heuristics below and by Studio.crossedRows.
  var PROVIDERS = ["DTN", "Indigo Ag", "Iowa State", "Regrow", "Terra Diagnostics"];
  var PRACTICES = ["Cover crops", "No-till", "Reduced tillage", "Conventional"];
  var CROPS = ["Corn", "Soybeans", "Wheat", "Hay"];
  // real Corn Belt HUC8 subbasins / NASS crop-reporting districts / state postals —
  // so freshly dragged watershed/district/state choropleths render colored regions
  var HUC8S = ["07080105", "07130001", "10230003", "07100006", "05120201", "07080207", "10240004", "07140101"];
  var CRDS = ["1710", "1720", "1910", "1930", "1830", "1750", "1940", "1860"];
  var STATES = ["IA", "IL", "IN", "MN", "NE", "OH", "MO", "WI"];

  function classify(name) {
    var c = String(name || "").toLowerCase();
    if (/(^|_)(src|source|datasource|platform|system|conn)/.test(c)) return "cat";
    if (/sens|classification/.test(c)) return "sens";
    if (/owner|steward/.test(c)) return "owner";
    if (/^state$|^state_(code|abbr|postal)/.test(c)) return "statecode"; // postal codes → state choropleths (before the workflow-status rule)
    if (/status|state|result/.test(c)) return "status";
    if (/app|application|tool|consumer/.test(c)) return "app";
    if (/ext|extension/.test(c)) return "ext";
    if (/term|glossary/.test(c)) return "term";
    // variance/delta-style metrics: generate mixed positive+negative values so diverging
    // bars / slope-style charts actually diverge in the offline preview, not always-positive.
    if (/variance|delta|diff|change/.test(c)) return "signed";
    if (/category|type|restype|kind|tier|band|group/.test(c)) return "type";
    if (/^date$|^date_|_date$|_at$/.test(c)) return "isodate"; // exact date cols → YYYY-MM-DD
    if (/month|ymn|^ym$|period|date|day/.test(c)) return "month";
    // Viridis V2: geo-id columns get REAL Corn Belt county FIPS codes so a freshly
    // dragged choropleth panel renders a colored map, not an all-no-data hatch.
    if (/^huc/.test(c)) return "huc8";                 // real HUC8 codes, not county FIPS
    if (/district|^crd/.test(c)) return "crd";          // NASS crop-reporting districts
    if (/^crop/.test(c)) return "crop";
    if (/acre/.test(c)) return "acres";
    if (/fips|geoid|county_?(id|code)?$/.test(c)) return "geoid";
    // Viridis V7: ensemble-style columns (provider/practice/year) so a freshly
    // dragged Ensemble or provider-colored choropleth panel reads as a believable
    // multi-provider demo instead of generic "Type A"/random-number placeholders.
    if (/provider/.test(c)) return "provider";
    if (/practice/.test(c)) return "practice";
    if (/^year$/.test(c)) return "year";
    if (/name|label|title|entity|object|table|schema|job|view|file|folder/.test(c)) return "name";
    if (/cum|cumulative|running/.test(c)) return "cum";
    if (/cost|usd|monthly|annual|reclaim|saving|spend|price|budget/.test(c)) return "money";
    if (/co2|carbon|tonne|emission/.test(c)) return "co2";
    if (/\btb\b|terab/.test(c)) return "tb";
    if (/\bgb\b|size_gb|avg_gb|max_gb/.test(c)) return "gb";
    if (/byte/.test(c)) return "bytes";
    if (/pct|percent|rate|coverage|completeness|ratio|score/.test(c)) return "pct";
    if (/count|assets|files|total|num|runs|records|rows|entities|columns|tables/.test(c)) return "count";
    return "num";
  }

  // tiny deterministic hash of a column name → stable per-column variation, so different
  // metrics show believably different values (not every gauge at 100% / every KPI at 1,000).
  function seed(str) { var h = 5381, s = String(str || "x"); for (var k = 0; k < s.length; k++) h = ((h << 5) + h + s.charCodeAt(k)) >>> 0; return h; }

  function valueFor(kind, i, n, firstIsLabel, col) {
    var hv = seed(col);
    switch (kind) {
      // real Corn Belt county FIPS (IL/IN/IA) — see the geoid classify note
      case "geoid": return ["17031", "17113", "17167", "19153", "19113", "18097", "18157", "17019"][i % 8];
      case "huc8": return HUC8S[i % HUC8S.length];
      case "crd": return CRDS[i % CRDS.length];
      case "statecode": return STATES[i % STATES.length];
      case "crop": return CROPS[i % CROPS.length];
      case "acres": return Math.round(2000 + ((i * 977 + hv) % 38000));
      case "cat": return CATS[i % CATS.length];
      case "sens": return SENS[i % SENS.length];
      case "owner": return OWNERS[i % OWNERS.length];
      case "status": return STATUS[i % STATUS.length];
      case "app": return APPS[i % APPS.length];
      case "ext": return EXTS[i % EXTS.length];
      case "term": return TERMS[i % TERMS.length];
      case "type": return "Type " + String.fromCharCode(65 + (i % 8));
      case "provider": return PROVIDERS[i % PROVIDERS.length];
      case "practice": return PRACTICES[i % PRACTICES.length];
      case "year": return String(2015 + (i % 11));
      case "isodate": {
        // YYYY-MM-DD dates spaced 4 days apart (for calHeatmap offline preview)
        var d = new Date(2025, 0, 6 + i * 4); // Jan 6, 10, 14... 2025
        var mm = d.getMonth() + 1, dd = d.getDate();
        return d.getFullYear() + "-" + (mm < 10 ? "0" : "") + mm + "-" + (dd < 10 ? "0" : "") + dd;
      }
      case "month": return MONTHS[i % 12];
      case "name": return CATS[i % CATS.length].split(" ")[0].toLowerCase() + "_obj_" + (i + 1);
      case "money": return Math.round((28000 + (hv % 60000)) / (i + 1));
      case "co2": return Math.round((40 / (i + 1)) * 100) / 100;
      case "tb": return Math.round((40 / (i + 1)) * 10) / 10;
      case "gb": return Math.round(900 / (i + 1));
      case "bytes": return Math.round((i + 1 === 0 ? 1 : (9 - (i % 9))) * 1.3e11);
      // percentages / scores: a realistic per-column base (58–95), gently descending across rows,
      // so a single-row KPI/gauge reads e.g. 78% / 91% / 84% rather than always 100%.
      case "pct": { var b = 58 + (hv % 38); return Math.max(3, Math.round((b - i * 7) * 10) / 10); }
      case "count": { var c1 = 600 + (hv % 8200); return Math.max(1, Math.round(c1 / (i + 1))); }
      case "cum": return (i + 1) * 1200;            // monotonic
      // alternating sign, gently shrinking magnitude — a believable variance/delta series
      case "signed": { var sv = 12 + (hv % 45); return (i % 2 === 0 ? 1 : -1) * Math.max(1, Math.round((sv - i * 2) * 10) / 10); }
      default: { var d1 = 240 + (hv % 1500); return Math.max(1, Math.round(d1 / (i + 1))); }
    }
  }

  var CATEGORICAL_KINDS = /^(cat|sens|owner|status|app|ext|term|type|month|name|isodate|geoid|huc8|crd|statecode|crop|provider|practice|year)$/;

  // produce {cols, rows} for one data-access definition.
  // valueOnly=true → this DA feeds only KPIs/gauges (its first column IS a value, not an
  // x-axis label), so don't clobber it into a category.
  // multiRow=true → distribution-shaped charts (boxplot/violin/ridgeline/beeswarm) group rows
  // by their label column, so a single point per label is degenerate (no real spread to show).
  // In this mode we emit a handful of distinct labels with SEVERAL jittered rows each instead
  // of one row per label, so quartile boxes / KDE curves / swarms have genuine shape.
  Studio.sampleRows = function (da, valueOnly, multiRow) {
    var cols = (da && da.columns) || [];
    if (!cols.length) cols = ["value"];                 // helper queries with no parsed alias
    var kinds = cols.map(function (c) { return classify(c); });
    // Force the first column to a categorical label so CHARTS never get a numeric x-axis
    // (exempt isodate so calHeatmap date columns keep their YYYY-MM-DD values). Skip this
    // for value-only (KPI/gauge) queries — there the first column is the metric itself.
    if (!valueOnly && !CATEGORICAL_KINDS.test(kinds[0])) kinds[0] = "cat";

    if (multiRow) {
      var numGroups = 5, perGroup = 6;
      var rows2 = [];
      for (var gi = 0; gi < numGroups; gi++) {
        // one representative value per column for this group (categorical cols → the label
        // that all rows in the group share; numeric cols → the group's base magnitude).
        var groupVals = cols.map(function (c, j) { return valueFor(kinds[j], gi, numGroups, j === 0, c); });
        for (var ri = 0; ri < perGroup; ri++) {
          var rowIdx = gi * perGroup + ri;
          rows2.push(cols.map(function (c, j) {
            if (CATEGORICAL_KINDS.test(kinds[j])) return groupVals[j]; // repeat the group's label
            var base = +groupVals[j] || 0;
            var jitter = ((seed(c + "_" + rowIdx) % 1000) / 1000 - 0.5) * 0.7; // ±35% spread
            return Math.round(base * (1 + jitter) * 100) / 100;
          }));
        }
      }
      return Studio.applyCalcCols(cols, rows2, da && da.calcColumns);
    }

    // if the row is a per-record detail (has a name col) keep names; otherwise distinct categories
    var n = 8;
    var rows = [];
    for (var i = 0; i < n; i++) {
      rows.push(cols.map(function (c, j) { return valueFor(kinds[j], i, n, j === 0, c); }));
    }
    // N-DATA: evaluate any declared Calculated columns against this sample too — the ONLY
    // place they get a real value in the builder (see the Studio.evalFormula header note).
    return Studio.applyCalcCols(cols, rows, da && da.calcColumns);
  };

  // Viridis V7: ensemble/geo panels need MULTIPLE rows per label — one per
  // provider — so the median/agreement-band math (V3's ensembleSeries, a
  // provider-colored choropleth) has real substance instead of the single
  // point per label the flat per-index engine above produces. Crosses the
  // label domain (year or geoid — whichever the first column classifies as)
  // against the provider domain, and sprinkles in an AgCensus reference row
  // on the years AgCensus actually reports (2017, 2022) when the label is a
  // year — mirroring the real release cadence the RFP case describes.
  Studio.crossedRows = function (da, seriesCol) {
    var cols = (da && da.columns) || [];
    var si = cols.indexOf(seriesCol);
    if (si < 0) return Studio.sampleRows(da);
    var kinds = cols.map(classify);
    if (!CATEGORICAL_KINDS.test(kinds[0])) kinds[0] = "cat";
    var labelKind = kinds[0];
    var labels = labelKind === "year" ? ["2015", "2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025"]
      : labelKind === "geoid" ? ["17031", "17113", "17167", "19153", "19113", "18097", "18157", "17019"]
      : (function () { var out = []; for (var i = 0; i < 8; i++) out.push(valueFor(labelKind, i, 8, true, cols[0])); return out; })();
    var rows = [];
    labels.forEach(function (lab, li) {
      PROVIDERS.forEach(function (prov, pi) {
        rows.push(cols.map(function (c, ci) {
          if (ci === 0) return lab;
          if (ci === si) return prov;
          if (kinds[ci] === "pct") { var hv = seed(c + "_" + li + "_" + pi); return Math.max(2, Math.round((58 + (hv % 32) - pi * 1.5 + li * 0.7) * 10) / 10); }
          return valueFor(kinds[ci], li * PROVIDERS.length + pi, labels.length * PROVIDERS.length, false, c);
        }));
      });
      if (labelKind === "year" && (lab === "2017" || lab === "2022")) {
        rows.push(cols.map(function (c, ci) {
          if (ci === 0) return lab;
          if (ci === si) return "AgCensus";
          if (kinds[ci] === "pct") { var hv2 = seed(c + "_ag_" + li); return Math.max(2, Math.round((55 + (hv2 % 28)) * 10) / 10); }
          return valueFor(kinds[ci], li, labels.length, false, c);
        }));
      }
    });
    return Studio.applyCalcCols(cols, rows, da && da.calcColumns);
  };

  // mock map for an entire dashboard, built from its bound data accesses
  Studio.genMock = function (spec) {
    var out = {};
    // A DA is "value-only" if nothing that needs an x-axis label binds it — i.e. it feeds only
    // KPIs and/or gauges. Every other chart type consumes the first column as its label/x-axis.
    // A DA feeding a distribution-shaped chart (boxplot/violin/ridgeline/beeswarm) needs the
    // multi-row generator so its per-group spread is real, not a single point per label.
    var labelDA = {}, multiRowDA = {}, crossDA = {};
    var DIST_TYPES = { boxplot: 1, violin: 1, ridgeline: 1, beeswarm: 1 };
    var CROSS_TYPES = { ensembleSeries: 1, choropleth: 1 };
    (spec.panels || []).forEach(function (p) {
      var c = p && p.chart; if (!c || !c.da) return;
      if (c.type !== "gauge") labelDA[c.da] = 1;
      if (DIST_TYPES[c.type]) multiRowDA[c.da] = 1;
      if (CROSS_TYPES[c.type] && c.map && c.map.seriesCol) crossDA[c.da] = c.map.seriesCol;
    });
    (spec.cda.dataAccesses || []).forEach(function (da) {
      var result = crossDA[da.id] ? Studio.crossedRows(da, crossDA[da.id]) : Studio.sampleRows(da, !labelDA[da.id], !!multiRowDA[da.id]);
      out[da.id] = Studio.applyOutputOptions ? Studio.applyOutputOptions(da, result) : result;
    });
    return out;
  };
})();
