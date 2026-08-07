/* Analytics — © 2026 Polecat.live. See LICENSE. */
/* app/sources/gsheets.js — Google Sheets (★★★ post-overhaul item 2).

   Uses the GViz endpoint (/gviz/tq) — the standard browser-side path for
   sheets shared "anyone with the link can view": no OAuth, no API key, CORS
   headers included, and a real query language (tq — "select A, sum(B) group
   by A") that pairs naturally with the app's {{param}} substitution.

   LF2/backlog-item-2 FOLLOW-UP (shipped): a PRIVATE sheet — one that isn't
   link-shared — needs real auth, so an optional `token` connection field
   switches the adapter onto the Sheets API v4 `values.get` endpoint with
   `Authorization: Bearer <token>` instead, the same "paste a short-lived
   OAuth access token, never a key file" shape as app/bigquery.js. The real
   gviz query language (tq) doesn't exist server-side in v4, so the token
   path fetches the whole tab and applies a small LOCAL subset of tq
   client-side (see tqLite below) — select/where/order-by/limit/offset,
   enough for the common cases without a real query engine; {{params}} are
   substituted upstream (Studio.WS.applyParams) before either path ever sees
   dataset.query, so both paths take the same already-resolved string.

   DATA-plane only. Datasets are kind:'sheet' — { sheet (tab name, optional),
   query (optional gviz tq, {{params}} allowed — full grammar server-side on
   the link-shared/gviz path, a select/where/order-by/limit/offset subset
   applied client-side on the private/token path — see tqLite) }.
   The connection cfg is the sheet's URL (or bare spreadsheet id) plus the
   optional OAuth token. */
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

  // Sheets API v4 (private sheets, bearer token) — always the real Google host regardless of
  // what origin the pasted sheet URL uses (parseSheetRef's `base` only matters for the gviz path,
  // which mirrors the sheet's own doc origin; v4 is a fixed API host). A bare tab name as the
  // range returns the whole used range of that tab; no tab given defaults to the first sheet.
  function v4Url(cfg, dataset) {
    var ref = parseSheetRef(cfg);
    var sheet = (dataset && dataset.sheet || "").trim();
    var range = (sheet ? sheet + "!" : "") + "A1:ZZ10000";
    return "https://sheets.googleapis.com/v4/spreadsheets/" + ref.id + "/values/" +
      encodeURIComponent(range) + "?valueRenderOption=FORMATTED_VALUE";
  }

  // v4's {error:{code,message}} shape -> a friendly, actionable message (mirrors the gviz path's
  // access_denied special-case above).
  function friendlyV4Error(status, json) {
    if (status === 401) return "Access token expired or invalid — paste a fresh Google OAuth access token.";
    if (status === 403) return "Access denied — the token needs the spreadsheets.readonly scope and read access to this sheet.";
    if (status === 404) return "Spreadsheet not found — check the URL/id.";
    return (json && json.error && json.error.message) || ("Sheets API v4 request failed (HTTP " + status + ")");
  }

  // v4's {range, majorDimension, values:[[...],...]} -> the same {columns,rows} shape parseGviz
  // returns. First row is the header; short rows (Sheets omits trailing empty cells) pad to the
  // header width so every row has one value per column, same as gviz's row-major table.
  function parseV4(json) {
    var values = json.values || [];
    if (!values.length) return { columns: [], rows: [] };
    var columns = values[0].map(function (v, ix) { var s = String(v == null ? "" : v).trim(); return s || "col" + (ix + 1); });
    var rows = values.slice(1).map(function (r) {
      return columns.map(function (_, i) { return r[i] == null ? "" : r[i]; });
    });
    return { columns: columns, rows: rows };
  }

  function v4Fetch(cfg, dataset) {
    var url;
    try { url = v4Url(cfg, dataset); } catch (e) { return Promise.resolve({ columns: [], rows: [], error: e.message }); }
    return fetch(url, { headers: { Authorization: "Bearer " + cfg.token } }).catch(function (e) {
      throw new Error("Could not reach the Sheets API (network or CORS): " + e.message);
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (json) {
        if (!r.ok) throw new Error(friendlyV4Error(r.status, json));
        var data = parseV4(json);
        try { return tqLite((dataset && dataset.query) || "", data); }
        catch (e) { return data; } // best-effort: an unsupported/malformed clause just falls back to the plain read
      });
    }).catch(function (e) { return { columns: [], rows: [], error: e.message }; });
  }

  // ---- tqLite: a small LOCAL subset of Google's gviz query language ---------
  // The v4 API has no server-side query language, so this applies the common
  // clauses client-side to the {columns,rows} v4 already returned. Columns are
  // addressed by spreadsheet letter (A, B, C…, matching the gviz convention and
  // the private-sheets UI hint), NOT by header label. Supported grammar (case-
  // insensitive keywords, clauses optional, order-independent):
  //   select A, C          -- project columns (default: all)
  //   where B > 100         -- AND-joined conditions; = != <> < <= > >= contains
  //   order by B desc, A    -- multi-key sort (default direction: asc)
  //   limit 10 offset 5     -- pagination
  // Not supported: group by, pivot, label, format, options, OR, aggregate
  // functions — those still require a link-shared sheet via the real gviz path.
  function colLetterToIndex(letter) {
    var n = 0, s = letter.toUpperCase();
    for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
    return n - 1;
  }

  function tqSplitClauses(q) {
    // Mask out single-quoted string literals before scanning for keywords so a
    // clause word that happens to appear inside a quoted value (e.g. 'order now')
    // never gets mistaken for the SQL-ish keyword.
    var masked = q.replace(/'(?:[^'\\]|\\.)*'/g, function (m) { return new Array(m.length + 1).join(" "); });
    var re = /\b(select|where|order\s+by|limit|offset)\b/gi;
    var hits = [], m;
    while ((m = re.exec(masked))) hits.push({ kw: m[1].toLowerCase().replace(/\s+/g, " "), start: m.index, end: m.index + m[0].length });
    var clauses = {};
    for (var i = 0; i < hits.length; i++) {
      var end = i + 1 < hits.length ? hits[i + 1].start : q.length;
      clauses[hits[i].kw] = q.slice(hits[i].end, end).trim();
    }
    return clauses;
  }

  function tqParseValue(raw) {
    var s = raw.trim();
    var qm = s.match(/^'((?:[^'\\]|\\.)*)'$/);
    if (qm) return qm[1].replace(/\\'/g, "'");
    if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    return s;
  }

  function tqParseCond(part) {
    var m = part.match(/^\s*([A-Za-z]+)\s*(!=|<>|>=|<=|=|>|<|contains)\s*(.+?)\s*$/i);
    if (!m) return null;
    return { idx: colLetterToIndex(m[1]), op: m[2].toLowerCase(), value: tqParseValue(m[3]) };
  }

  function tqCellNum(v) {
    var n = parseFloat(v);
    return (v !== "" && v != null && !isNaN(n) && isFinite(n)) ? n : null;
  }

  function tqEvalCond(cond, row) {
    var cell = row[cond.idx];
    if (cell === undefined) return false;
    if (cond.op === "contains") return String(cell).toLowerCase().indexOf(String(cond.value).toLowerCase()) >= 0;
    var cellNum = tqCellNum(cell), valNum = typeof cond.value === "number" ? cond.value : tqCellNum(cond.value);
    var useNum = cellNum !== null && valNum !== null;
    var a = useNum ? cellNum : String(cell), b = useNum ? valNum : String(cond.value);
    switch (cond.op) {
      case "=": return a === b;
      case "!=": case "<>": return a !== b;
      case "<": return a < b;
      case "<=": return a <= b;
      case ">": return a > b;
      case ">=": return a >= b;
      default: return true;
    }
  }

  function tqCompare(a, b) {
    var an = tqCellNum(a), bn = tqCellNum(b);
    if (an !== null && bn !== null) return an < bn ? -1 : an > bn ? 1 : 0;
    var as = String(a), bs = String(b);
    return as < bs ? -1 : as > bs ? 1 : 0;
  }

  function tqLite(query, data) {
    var q = (query || "").trim();
    if (!q) return data;
    var columns = data.columns, rows = data.rows;
    var clauses = tqSplitClauses(q);
    var outRows = rows;

    if (clauses.where) {
      var conds = clauses.where.split(/\s+and\s+/i).map(tqParseCond).filter(Boolean);
      if (conds.length) outRows = outRows.filter(function (r) { return conds.every(function (c) { return tqEvalCond(c, r); }); });
    }
    if (clauses["order by"]) {
      var orders = clauses["order by"].split(",").map(function (part) {
        var m = part.trim().match(/^([A-Za-z]+)(\s+(asc|desc))?$/i);
        return m ? { idx: colLetterToIndex(m[1]), dir: (m[3] || "asc").toLowerCase() } : null;
      }).filter(Boolean);
      if (orders.length) {
        outRows = outRows.slice().sort(function (r1, r2) {
          for (var i = 0; i < orders.length; i++) {
            var cmp = tqCompare(r1[orders[i].idx], r2[orders[i].idx]);
            if (cmp !== 0) return orders[i].dir === "desc" ? -cmp : cmp;
          }
          return 0;
        });
      }
    }
    if (clauses.offset && /^\d+$/.test(clauses.offset)) outRows = outRows.slice(parseInt(clauses.offset, 10));
    if (clauses.limit && /^\d+$/.test(clauses.limit)) outRows = outRows.slice(0, parseInt(clauses.limit, 10));

    var selIdx = null;
    if (clauses.select && clauses.select.trim() && clauses.select.trim() !== "*") {
      selIdx = clauses.select.split(",").map(function (s) { return colLetterToIndex(s.trim()); });
    }
    if (!selIdx) return { columns: columns, rows: outRows };
    return {
      columns: selIdx.map(function (i) { return columns[i]; }),
      rows: outRows.map(function (r) { return selIdx.map(function (i) { return r[i]; }); })
    };
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

  var SOURCE = {
    id: "gsheets",
    label: "Google Sheets",
    blurb: "Chart a link-shared Google Sheet straight from the browser — tabs + an optional query language, no OAuth needed.",
    icon: "sheets",
    accent: "#0F9D58",
    caps: { meta: false, data: true },
    browserProvision: false,
    fields: [
      { key: "url", label: "Sheet URL", placeholder: "https://docs.google.com/spreadsheets/d/…", type: "text",
        hint: "Paste the sheet's link (or just its id). The sheet must be shared as 'anyone with the link can view'." },
      { key: "token", label: "OAuth access token", placeholder: "ya29.… (optional, private sheets only)", type: "password",
        hint: "Optional — only needed for a PRIVATE sheet. Paste a short-lived Google OAuth 2.0 access token scoped to spreadsheets.readonly (e.g. from the OAuth Playground). Leave blank for a link-shared sheet." }
    ],
    docsUrl: "https://developers.google.com/chart/interactive/docs/querylanguage",

    // ---- data plane ---------------------------------------------------------
    testData: function (cfg) {
      if (cfg.token) return v4Fetch(cfg, {}).then(function (r) { return r.error ? { ok: false, error: r.error } : { ok: true }; });
      var url;
      try { url = gvizUrl(cfg, { query: "limit 1" }); } catch (e) { return Promise.resolve({ ok: false, error: e.message }); }
      return fetch(url).then(function (r) { return r.text(); }).then(function (text) {
        parseGviz(text); // throws the friendly access_denied message on private sheets
        return { ok: true };
      }).catch(function (e) { return { ok: false, error: e.message }; });
    },

    // dataset: { kind:'sheet', sheet?, query? } — query is gviz tq
    // ("select A, B where C > 100 order by B desc"); {{params}} applied upstream.
    // A connection with a token set (private sheet) uses the v4 values.get path instead, then
    // applies the tqLite subset of the same query client-side (see above) — full tq grammar only
    // on the link-shared/gviz path, since there's no server-side query engine in v4.
    queryData: function (cfg, dataset) {
      if (cfg.token) return v4Fetch(cfg, dataset);
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
  };
  // Post-overhaul backlog item 3, other half (Google Sheets slice): the exported-runtime bundle
  // (exporters.js/studio-render.js) inlines this file standalone, without registry.js — calling
  // Studio.registerSource there would throw (Studio.SOURCES doesn't exist outside the builder).
  // Guard the normal in-app registration and always expose the plain global too, same convention
  // as Studio.tursoSource/postgrestSource/supabaseSource, so the exported runtime's CONN_ENGINES
  // dispatch has something to call.
  if (Studio.registerSource) Studio.registerSource(SOURCE);
  Studio.gsheetsSource = SOURCE;
}());
