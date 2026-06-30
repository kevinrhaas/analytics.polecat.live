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

  function classify(name) {
    var c = String(name || "").toLowerCase();
    if (/(^|_)(src|source|datasource|platform|system|conn)/.test(c)) return "cat";
    if (/sens|classification/.test(c)) return "sens";
    if (/owner|steward/.test(c)) return "owner";
    if (/status|state|result/.test(c)) return "status";
    if (/app|application|tool|consumer/.test(c)) return "app";
    if (/ext|extension/.test(c)) return "ext";
    if (/term|glossary/.test(c)) return "term";
    if (/category|type|restype|kind|tier|band|group/.test(c)) return "type";
    if (/^date$|^date_|_date$|_at$/.test(c)) return "isodate"; // exact date cols → YYYY-MM-DD
    if (/month|ymn|^ym$|period|date|day/.test(c)) return "month";
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

  function valueFor(kind, i, n, firstIsLabel) {
    switch (kind) {
      case "cat": return CATS[i % CATS.length];
      case "sens": return SENS[i % SENS.length];
      case "owner": return OWNERS[i % OWNERS.length];
      case "status": return STATUS[i % STATUS.length];
      case "app": return APPS[i % APPS.length];
      case "ext": return EXTS[i % EXTS.length];
      case "term": return TERMS[i % TERMS.length];
      case "type": return "Type " + String.fromCharCode(65 + (i % 8));
      case "isodate": {
        // YYYY-MM-DD dates spaced 4 days apart (for calHeatmap offline preview)
        var d = new Date(2025, 0, 6 + i * 4); // Jan 6, 10, 14... 2025
        var mm = d.getMonth() + 1, dd = d.getDate();
        return d.getFullYear() + "-" + (mm < 10 ? "0" : "") + mm + "-" + (dd < 10 ? "0" : "") + dd;
      }
      case "month": return MONTHS[i % 12];
      case "name": return CATS[i % CATS.length].split(" ")[0].toLowerCase() + "_obj_" + (i + 1);
      case "money": return Math.round(50000 / (i + 1));
      case "co2": return Math.round((40 / (i + 1)) * 100) / 100;
      case "tb": return Math.round((40 / (i + 1)) * 10) / 10;
      case "gb": return Math.round(900 / (i + 1));
      case "bytes": return Math.round((i + 1 === 0 ? 1 : (9 - (i % 9))) * 1.3e11);
      case "pct": return Math.round((100 - i * 9) * 10) / 10;
      case "count": return Math.max(1, Math.round(5000 / (i + 1)));
      case "cum": return (i + 1) * 1200;            // monotonic
      default: return Math.max(1, Math.round(1000 / (i + 1)));
    }
  }

  // produce {cols, rows} for one data-access definition
  Studio.sampleRows = function (da) {
    var cols = (da && da.columns) || [];
    if (!cols.length) cols = ["value"];                 // helper queries with no parsed alias
    var n = 8;
    var kinds = cols.map(function (c) { return classify(c); });
    // force the first column to a categorical label so charts never get a numeric x-axis
    // (exempt isodate so calHeatmap date columns keep their YYYY-MM-DD values)
    if (!/^(cat|sens|owner|status|app|ext|term|type|month|name|isodate)$/.test(kinds[0])) kinds[0] = "cat";
    // if the row is a per-record detail (has a name col) keep names; otherwise distinct categories
    var rows = [];
    for (var i = 0; i < n; i++) {
      rows.push(cols.map(function (c, j) { return valueFor(kinds[j], i, n, j === 0); }));
    }
    return { cols: cols, rows: rows };
  };

  // mock map for an entire dashboard, built from its bound data accesses
  Studio.genMock = function (spec) {
    var out = {};
    (spec.cda.dataAccesses || []).forEach(function (da) {
      var result = Studio.sampleRows(da);
      out[da.id] = Studio.applyOutputOptions ? Studio.applyOutputOptions(da, result) : result;
    });
    return out;
  };
})();
