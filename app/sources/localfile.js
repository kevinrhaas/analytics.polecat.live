/* Analytics — © 2026 Polecat.live. See LICENSE. */
/* app/sources/localfile.js — CSV / JSON file-drop (★★★ post-overhaul item 2).

   The most local-first adapter there is: the file's TEXT rides inside the
   dataset row itself (no handles, no re-prompts, works in every browser and
   fully offline), so a file-backed dashboard is reproducible anywhere the
   workspace goes — including mirrored to a remote backend. The trade-off is
   an explicit size cap (MAX_CHARS below): the workspace store lives in
   localStorage and re-persists on every mutation, so multi-MB payloads belong
   in the DuckDB (remote file) connector instead — the in-band errors say so.

   DATA-plane only. Datasets are kind:'file' — { fileName, format, content } —
   authored via a drop-zone in the dataset editor (studio.js) rather than a
   typed query. No {{params}}: the content IS the data. */
(function () {
  "use strict";

  var MAX_CHARS = 2000000; // ~2MB of text — see header comment
  Studio.FILE_DATASET_MAX_CHARS = MAX_CHARS; // shared with the editor's drop zone

  // ---- CSV (RFC4180-ish): quoted fields, escaped quotes, CR/LF, and a
  // sniffed delimiter (comma / semicolon / tab — whichever dominates the
  // header line outside quotes) so European CSVs and TSVs Just Work.
  function sniffDelimiter(text) {
    var counts = { ",": 0, ";": 0, "\t": 0 }, inQ = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === '"') inQ = !inQ;
      else if (!inQ && c === "\n") break;
      else if (!inQ && counts[c] != null) counts[c]++;
    }
    return [",", ";", "\t"].sort(function (a, b) { return counts[b] - counts[a]; })[0];
  }
  function parseCSV(text) {
    var delim = sniffDelimiter(text);
    var rows = [], row = [], cell = "", inQ = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
        else cell += c;
      } else if (c === '"') inQ = true;
      else if (c === delim) { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); cell = "";
        rows.push(row); row = [];
      } else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    // drop fully-empty trailing lines
    rows = rows.filter(function (r) { return r.length > 1 || (r[0] || "").trim() !== ""; });
    if (!rows.length) throw new Error("The CSV has no rows");
    var columns = rows[0].map(function (h, ix) { return String(h || "").trim() || "col" + (ix + 1); });
    var body = rows.slice(1).map(function (r) {
      return columns.map(function (_, ix) { return typeCell(r[ix] != null ? r[ix] : ""); });
    });
    return { columns: columns, rows: body };
  }
  // numeric-looking cells become real numbers so charts can aggregate them
  function typeCell(v) {
    var s = String(v).trim();
    if (s === "") return "";
    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) return Number(s);
    return s;
  }

  // ---- JSON: an array of objects (rows). Columns are the union of keys over
  // the first 50 rows (a sparse first object shouldn't hide later columns);
  // nested values flatten to JSON text so every cell stays table-safe.
  function parseJSON(text) {
    var data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error("Expected a JSON ARRAY of row objects at the top level");
    if (!data.length) return { columns: [], rows: [] };
    var colSet = {}, columns = [];
    data.slice(0, 50).forEach(function (o) {
      if (o && typeof o === "object" && !Array.isArray(o)) Object.keys(o).forEach(function (k) { if (!colSet[k]) { colSet[k] = 1; columns.push(k); } });
    });
    if (!columns.length) throw new Error("Rows must be JSON objects (e.g. [{\"region\":\"EMEA\"}, …])");
    var rows = data.map(function (o) {
      return columns.map(function (c) {
        var v = (o || {})[c];
        if (v == null) return "";
        if (typeof v === "object") return JSON.stringify(v);
        return v;
      });
    });
    return { columns: columns, rows: rows };
  }

  function resolveFormat(dataset) {
    var f = (dataset.format || "").toLowerCase();
    if (f === "csv" || f === "tsv") return "csv";
    if (f === "json") return "json";
    var name = (dataset.fileName || "").toLowerCase();
    if (/\.(csv|tsv)$/.test(name)) return "csv";
    if (/\.json$/.test(name)) return "json";
    var head = (dataset.content || "").replace(/^\s+/, "")[0];
    return head === "[" || head === "{" ? "json" : "csv";
  }

  Studio.registerSource({
    id: "file",
    label: "CSV / JSON file",
    blurb: "Drop a local file and chart it — the data rides inside the dataset, so it works offline and travels with your workspace.",
    icon: "upload",
    accent: "#6d9f4b",
    caps: { meta: false, data: true },
    browserProvision: false,
    fields: [], // nothing to configure — each dataset carries its own file
    docsUrl: "",

    // ---- data plane ---------------------------------------------------------
    testData: function () {
      return Promise.resolve({ ok: true, note: "Files are read in your browser — nothing to connect to." });
    },

    // dataset: { kind:'file', fileName, format?, content }
    queryData: function (cfg, dataset) {
      try {
        var content = (dataset && dataset.content) || "";
        if (!content.trim()) return Promise.resolve({ columns: [], rows: [], error: "Dataset has no file yet — drop a .csv or .json in the editor." });
        if (content.length > MAX_CHARS) {
          return Promise.resolve({ columns: [], rows: [], error: "File is too large for an inline dataset (" + Math.round(content.length / 1e6) + "MB > 2MB) — host it and use the DuckDB (remote file) connector instead." });
        }
        var parsed = resolveFormat(dataset) === "json" ? parseJSON(content) : parseCSV(content);
        return Promise.resolve(parsed);
      } catch (e) {
        return Promise.resolve({ columns: [], rows: [], error: "Could not parse " + (dataset && dataset.fileName || "the file") + ": " + e.message });
      }
    },

    // ---- meta plane: honest refusals (same shape as data-adapters.js) -------
    test: function () { return this.testData(); },
    probe: function () { return Promise.resolve({ state: "foreign", tables: [] }); },
    provision: function () { return Promise.resolve({ ok: false, error: "Local files hold dashboard data, not the app workspace — pick Local, Turso, Supabase or Firebase for the backend." }); },
    summarize: function () { return Promise.resolve({ tables: [] }); },
    drop: function () { return Promise.resolve({ ok: false, error: "Not a workspace backend" }); },
    load: function () { return Promise.resolve(Studio.WS.emptySnapshot()); },
    save: function () { return Promise.resolve({ ok: false, error: "Not a workspace backend" }); }
  });
}());
