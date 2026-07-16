/* Analytics — © 2026 Polecat.live. See LICENSE. */
/* app/sources/gsheets.js — Google Sheets (★★★ post-overhaul item 2).

   Uses the GViz endpoint (/gviz/tq) — the standard browser-side path for
   sheets shared "anyone with the link can view": no OAuth, no API key, CORS
   headers included, and a real query language (tq — "select A, sum(B) group
   by A") that pairs naturally with the app's {{param}} substitution.
   Private-sheet OAuth (Sheets API v4 + a bearer token, the BigQuery pattern)
   is a noted follow-up in STATUS.md — this slice covers the shareable-sheet
   80% case end-to-end.

   DATA-plane only. Datasets are kind:'sheet' — { sheet (tab name, optional),
   query (optional gviz tq, {{params}} allowed) }. The connection cfg is just
   the sheet's URL (or bare spreadsheet id). */
(function () {
  "use strict";

  // Accepts a full URL (https://docs.google.com/spreadsheets/d/<ID>/edit…),
  // a bare spreadsheet id, or — for tests — any origin carrying the same
  // /spreadsheets/d/<ID> path shape. Returns { base, id }.
  function parseSheetRef(cfg) {
    var raw = (cfg.url || "").trim();
    if (!raw) throw new Error("Sheet URL (or spreadsheet id) is required");
    var m = raw.match(/^(https?:\/\/[^/]+(?:\/[^/]+)*?)\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
    if (m) return { base: m[1], id: m[2] };
    if (/^[A-Za-z0-9_-]{10,}$/.test(raw)) return { base: "https://docs.google.com", id: raw };
    throw new Error("Couldn't find a spreadsheet id in that URL — paste the full https://docs.google.com/spreadsheets/d/… link");
  }

  function gvizUrl(cfg, dataset) {
    var ref = parseSheetRef(cfg);
    var qs = ["tqx=out:json"];
    var sheet = (dataset && dataset.sheet || "").trim();
    var tq = (dataset && dataset.query || "").trim();
    if (sheet) qs.push("sheet=" + encodeURIComponent(sheet));
    if (tq) qs.push("tq=" + encodeURIComponent(tq));
    return ref.base + "/spreadsheets/d/" + ref.id + "/gviz/tq?" + qs.join("&");
  }

  // The gviz endpoint answers JS, not JSON: `/*O_o*/\ngoogle.visualization.
  // Query.setResponse({…});` — slice the object out between the outermost parens.
  function parseGviz(text) {
    var start = text.indexOf("(");
    var end = text.lastIndexOf(")");
    if (start < 0 || end <= start) throw new Error("Unexpected response (not a gviz payload) — is the sheet shared as 'anyone with the link'?");
    var payload = JSON.parse(text.slice(start + 1, end));
    if (payload.status === "error") {
      var err = (payload.errors && payload.errors[0]) || {};
      if (err.reason === "access_denied") throw new Error("Access denied — share the sheet as 'anyone with the link can view' (File → Share)");
      throw new Error(err.detailed_message || err.message || err.reason || "Sheet query failed");
    }
    var table = payload.table || { cols: [], rows: [] };
    var columns = (table.cols || []).map(function (c, ix) { return (c.label || "").trim() || c.id || "col" + (ix + 1); });
    var rows = (table.rows || []).map(function (r) {
      return (r.c || []).map(function (cell) {
        if (!cell || cell.v == null) return "";
        // gviz serializes dates as the STRING "Date(2026,0,15)" — the formatted
        // value reads better in a table than that constructor-ish literal
        if (typeof cell.v === "string" && /^Date\(\d/.test(cell.v)) return cell.f || cell.v;
        return cell.v;
      });
    });
    return { columns: columns, rows: rows };
  }

  Studio.registerSource({
    id: "gsheets",
    label: "Google Sheets",
    blurb: "Chart a link-shared Google Sheet straight from the browser — tabs + an optional query language, no OAuth needed.",
    icon: "sheets",
    accent: "#0F9D58",
    caps: { meta: false, data: true },
    browserProvision: false,
    fields: [
      { key: "url", label: "Sheet URL", placeholder: "https://docs.google.com/spreadsheets/d/…", type: "text",
        hint: "Paste the sheet's link (or just its id). The sheet must be shared as 'anyone with the link can view'." }
    ],
    docsUrl: "https://developers.google.com/chart/interactive/docs/querylanguage",

    // ---- data plane ---------------------------------------------------------
    testData: function (cfg) {
      var url;
      try { url = gvizUrl(cfg, { query: "limit 1" }); } catch (e) { return Promise.resolve({ ok: false, error: e.message }); }
      return fetch(url).then(function (r) { return r.text(); }).then(function (text) {
        parseGviz(text); // throws the friendly access_denied message on private sheets
        return { ok: true };
      }).catch(function (e) { return { ok: false, error: e.message }; });
    },

    // dataset: { kind:'sheet', sheet?, query? } — query is gviz tq
    // ("select A, B where C > 100 order by B desc"); {{params}} applied upstream.
    queryData: function (cfg, dataset) {
      var url;
      try { url = gvizUrl(cfg, dataset); } catch (e) { return Promise.resolve({ columns: [], rows: [], error: e.message }); }
      return fetch(url).catch(function (e) {
        throw new Error("Could not reach the sheet (network or CORS): " + e.message);
      }).then(function (r) { return r.text(); }).then(function (text) {
        return parseGviz(text);
      }).catch(function (e) { return { columns: [], rows: [], error: e.message }; });
    },

    // ---- meta plane: honest refusals (same shape as data-adapters.js) -------
    test: function (cfg) { return this.testData(cfg); },
    probe: function () { return Promise.resolve({ state: "foreign", tables: [] }); },
    provision: function () { return Promise.resolve({ ok: false, error: "Google Sheets holds dashboard data, not the app workspace — pick Local, Turso, Supabase or Firebase for the backend." }); },
    summarize: function () { return Promise.resolve({ tables: [] }); },
    drop: function () { return Promise.resolve({ ok: false, error: "Not a workspace backend" }); },
    load: function () { return Promise.resolve(Studio.WS.emptySnapshot()); },
    save: function () { return Promise.resolve({ ok: false, error: "Not a workspace backend" }); }
  });
}());
