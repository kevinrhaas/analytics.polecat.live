/* Analytics Dashboard Studio — © 2026 Polecat.live. See LICENSE. */
/* app/xlsx.js — LF24-XLSX (2026-07-31): a minimal Excel (.xlsx) reader.
   ONE job: turn the FIRST worksheet of an .xlsx file into CSV text, so every
   existing file-drop path (View Builder canvas, Home Quick import, the
   dataset editor's drop zone) can accept Excel by converting up front and
   then flowing through the exact same CSV pipeline — file datasets store
   text content, so nothing downstream changes.

   Scope (deliberate, documented in Help): first sheet only, cell VALUES only
   (a formula cell contributes its cached result), date cells come through as
   Excel serial numbers, no styles/merges. Unzipping is vendor/fflate.js
   (unzipSync); the sheet/sharedStrings XML is simple enough for direct
   regex extraction — .xlsx worksheet markup is machine-generated and regular.
   Anything unreadable throws with a plain message the drop toasts surface. */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  function dec(u8) { return new TextDecoder("utf-8").decode(u8); }
  // &amp; LAST — earlier entities may produce text containing '&'.
  function unesc(s) {
    return String(s)
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCodePoint(+n); })
      .replace(/&amp;/g, "&");
  }
  // All <t> runs inside a shared-string <si> (plain + rich-text runs).
  function siText(inner) {
    var out = "", m, re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    while ((m = re.exec(inner))) out += unesc(m[1]);
    return out;
  }
  function colIndex(ref) { // "BC12" -> 54 (0-based column)
    var n = 0;
    for (var i = 0; i < ref.length; i++) {
      var c = ref.charCodeAt(i);
      if (c < 65 || c > 90) break;
      n = n * 26 + (c - 64);
    }
    return n - 1;
  }
  function csvCell(v) {
    v = v == null ? "" : String(v);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  // ArrayBuffer|Uint8Array -> CSV text of the first worksheet. Throws on
  // anything that isn't a readable .xlsx.
  Studio.xlsxToCSV = function (buf) {
    if (!window.fflate || !fflate.unzipSync) throw new Error("the Excel reader isn't loaded");
    var files;
    try { files = fflate.unzipSync(buf instanceof Uint8Array ? buf : new Uint8Array(buf)); }
    catch (e) { throw new Error("not a readable .xlsx (it isn't a zip archive)"); }

    // First sheet: honor workbook.xml's sheet order via its rels when present,
    // fall back to sheet1.xml, then the alphabetically-first worksheet part.
    var sheetPath = null;
    try {
      var wb = files["xl/workbook.xml"] && dec(files["xl/workbook.xml"]);
      var rels = files["xl/_rels/workbook.xml.rels"] && dec(files["xl/_rels/workbook.xml.rels"]);
      var firstSheet = wb && /<sheet [^>]*r:id="([^"]+)"/.exec(wb);
      if (firstSheet && rels) {
        var rel = new RegExp('<Relationship [^>]*Id="' + firstSheet[1] + '"[^>]*Target="([^"]+)"').exec(rels)
          || new RegExp('<Relationship [^>]*Target="([^"]+)"[^>]*Id="' + firstSheet[1] + '"').exec(rels);
        if (rel) sheetPath = "xl/" + rel[1].replace(/^\//, "").replace(/^xl\//, "");
      }
    } catch (e) {}
    if (!sheetPath || !files[sheetPath]) {
      sheetPath = files["xl/worksheets/sheet1.xml"] ? "xl/worksheets/sheet1.xml"
        : Object.keys(files).filter(function (n) { return /^xl\/worksheets\/[^/]+\.xml$/.test(n); }).sort()[0];
    }
    if (!sheetPath) throw new Error("no worksheet found in this .xlsx");

    var shared = [];
    if (files["xl/sharedStrings.xml"]) {
      var ss = dec(files["xl/sharedStrings.xml"]), m, siRe = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
      while ((m = siRe.exec(ss))) shared.push(siText(m[1]));
    }

    var xml = dec(files[sheetPath]);
    var rows = [], rowM, rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
    while ((rowM = rowRe.exec(xml))) {
      var cells = [], cM, cRe = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      while ((cM = cRe.exec(rowM[1]))) {
        var attrs = cM[1], inner = cM[2] || "";
        var refM = /r="([A-Z]+)\d+"/.exec(attrs);
        var idx = refM ? colIndex(refM[1]) : cells.length;
        var type = (/t="([^"]+)"/.exec(attrs) || [])[1] || "n";
        var v = "";
        if (type === "inlineStr") {
          v = siText(inner);
        } else {
          var vM = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner);
          var raw = vM ? unesc(vM[1]) : "";
          if (type === "s") v = shared[+raw] != null ? shared[+raw] : "";
          else if (type === "b") v = raw === "1" ? "TRUE" : "FALSE";
          else v = raw; // n, str (cached formula result), e — the value as written
        }
        cells[idx] = v;
      }
      rows.push(cells);
    }
    // Drop fully-empty trailing rows, square the grid off the widest row.
    while (rows.length && rows[rows.length - 1].every(function (c) { return c == null || c === ""; })) rows.pop();
    if (!rows.length) throw new Error("the first worksheet is empty");
    var width = rows.reduce(function (w, r) { return Math.max(w, r.length); }, 0);
    return rows.map(function (r) {
      var line = [];
      for (var i = 0; i < width; i++) line.push(csvCell(r[i]));
      return line.join(",");
    }).join("\n");
  };

  // The shared front door for every tabular file intake: resolves to
  // { text, format } — .xlsx converts to CSV here, everything else reads as
  // the text it already is. Callers keep their own size/parse handling.
  Studio.readTabularFile = function (file) {
    if (/\.xlsx$/i.test(file.name)) {
      return file.arrayBuffer().then(function (buf) { return { text: Studio.xlsxToCSV(buf), format: "csv" }; });
    }
    return file.text().then(function (text) {
      var format = /\.json$/i.test(file.name) ? "json"
        : /\.(csv|tsv)$/i.test(file.name) ? "csv"
        : ((text.replace(/^\s+/, "")[0] === "[" || text.replace(/^\s+/, "")[0] === "{") ? "json" : "csv");
      return { text: text, format: format };
    });
  };
})();
