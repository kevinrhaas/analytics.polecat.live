#!/usr/bin/env node
/* tools/changelog-normalize.js — the fleet changelog "push step" (see
   games.polecat.live / relay.polecat.live). Run this AFTER adding a new entry
   and BEFORE committing:  node tools/changelog-normalize.js

   What it does, so the loop never has to hand-format anything:
   1. Reads js/changelog.js (whatever style the entry was authored in).
   2. Stamps any entry whose `ts` is empty/missing with the REAL current UTC time
      — taken from an authoritative NETWORK source (a live server's Date header),
      because these run containers have shown ~1-day clock skew. Existing (non-empty)
      timestamps are left untouched (never re-fabricate history).
   3. Re-emits the ENTIRE file in the canonical fleet literal style — an ES module
      `export const CHANGELOG` of entries with UNQUOTED keys and SINGLE-QUOTED
      strings (apostrophes escaped as \'), plus LATEST_VERSION + the window alias.
   4. Self-verifies with the fleet manager's EXACT parser (manager.polecat.live/js/
      ingest.js). If the result wouldn't parse (e.g. a `//` sequence in item text),
      it writes nothing and exits non-zero with a clear message.

   Authoring a new entry: prepend  { v: <top+1>, title: '…', kind: 'feature'|'fix'|
   'polish', ts: '', items: ['…'] }  then run this script. */
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const FILE = path.resolve(__dirname, "..", "js", "changelog.js");
const KINDS = ["feature", "fix", "polish", "game"];

// ── real UTC "now" from the network (local clocks drift in these containers) ──
function realNowISO() {
  for (const host of ["https://www.google.com", "https://github.com"]) {
    try {
      const hdr = execSync(`curl -sI --max-time 8 ${host}`, { encoding: "utf8" });
      const m = hdr.match(/^date:\s*(.+)$/im);
      if (m) { const d = new Date(m[1].trim()); if (!isNaN(d)) return d.toISOString(); }
    } catch (e) { /* try next */ }
  }
  return new Date().toISOString(); // last resort (may be skewed)
}

// ── load current entries (tolerates JSON- or relay-literal source) ──
const src = fs.readFileSync(FILE, "utf8");
const win = {};
new Function("window", src.replace(/export\s+const/g, "const"))(win);
const entries = win.STUDIO_CHANGELOG || [];
if (!entries.length) { console.error("changelog-normalize: no entries found"); process.exit(1); }

const NOW = realNowISO();
let stamped = 0;
const canon = entries.map((e) => {
  const v = typeof e.v === "number" ? e.v : parseInt(String(e.v).replace(/[^0-9]/g, ""), 10) || 0;
  const out = { v, title: String(e.title || "") };
  if (e.kind && KINDS.indexOf(e.kind) >= 0) out.kind = e.kind;
  let ts = e.ts;
  if (!ts || String(ts).trim() === "") { ts = NOW; stamped++; }
  out.ts = ts;
  out.items = Array.isArray(e.items) ? e.items.map(String) : [];
  return out;
});

// ── lint: reject text the manager's bare-key regex would mangle ──
// The manager quotes bare object keys with /([{,]\s*)(ident)\s*:/ AFTER requoting
// strings, so any STRING VALUE containing `{ident:` or `,ident:` gets unescaped
// quotes injected into it and the whole file fails to parse. Catch it here (with
// the offending entry named) instead of leaving a cryptic JSON error below.
const BARE_KEY = /[{,]\s*[A-Za-z_$][A-Za-z0-9_$]*\s*:/;
for (const e of canon) {
  for (const [field, val] of [["title", e.title], ...e.items.map((it, k) => ["items[" + k + "]", it])]) {
    const m = BARE_KEY.exec(val);
    if (m) {
      console.error(`changelog-normalize: v${e.v} ${field} contains "${m[0]}" — the manager's bare-key`);
      console.error(`  regex would turn that into {"...":} inside the string and break the sync parser.`);
      console.error(`  Reword so no '{' or ',' is immediately followed by an identifier and a colon`);
      console.error(`  (e.g. use parentheses, or drop the colon). Offending text: …${val.slice(Math.max(0, m.index - 20), m.index + 30)}…`);
      process.exit(1);
    }
  }
}

// ── emit canonical relay/games literal style ──
function sq(s) { return "'" + String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'"; }
function entryStr(e) {
  return "  {\n    v: " + e.v + ",\n    title: " + sq(e.title) + ",\n" +
    (e.kind ? "    kind: " + sq(e.kind) + ",\n" : "") +
    "    ts: " + sq(e.ts) + ",\n" +
    "    items: [\n" + e.items.map((it) => "      " + sq(it) + ",").join("\n") + "\n    ],\n  }";
}
const header =
`/* js/changelog.js — Analytics Dashboard Studio revision history.
   Fleet-canonical format (games.polecat.live / relay.polecat.live): an ES module
   \`export const CHANGELOG\` of { v, title, kind?, ts, items } entries. Newest first.
   Regenerated + timestamped by tools/changelog-normalize.js — DO NOT hand-format;
   add an entry with ts:'' at the top and run that script. Exposed as
   window.STUDIO_CHANGELOG for the in-app footer + "What's new" panel. */
`;
const outText =
  header +
  "export const CHANGELOG = [\n" + canon.map(entryStr).join(",\n") + ",\n];\n" +
  "export const LATEST_VERSION = CHANGELOG.reduce(function (m, e) { return Math.max(m, e.v); }, 0);\n" +
  "if (typeof window !== \"undefined\") { window.STUDIO_CHANGELOG = CHANGELOG; window.STUDIO_LATEST_VERSION = LATEST_VERSION; window.STUDIO_BUILD = \"__BUILD_TS__\"; }\n";

// ── self-verify with the fleet manager's EXACT parser (ingest.js) ──
function extractArrayLiteral(s, name) {
  const m = s.match(new RegExp(name + "\\s*=\\s*\\["));
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  let depth = 0, inStr = null, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "[") depth++; else if (c === "]") { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  return null;
}
// EXACT port of manager.polecat.live/js/ingest.js jsLiteralToJSON. The operation
// ORDER matters and is easy to get wrong: the manager requotes every string
// FIRST (char-walk, escaping internal `"`), THEN runs the bare-key regex over the
// whole result. So a string VALUE containing `{ident:` (e.g. "{templates:[...]}")
// gets its `{ident:` rewritten to `{"ident":` — injecting UNescaped quotes into a
// string and breaking JSON.parse. A verifier that requotes strings AFTER the
// bare-key pass would silently "fix" that and pass a file the manager rejects, so
// this must mirror the manager's order verbatim.
function jsLiteralToJSON(lit) {
  let out = "", i = 0; const n = lit.length;
  const esc = (ch) => ch === '"' ? '\\"' : ch;
  while (i < n) {
    const c = lit[i];
    if (c === "/" && lit[i + 1] === "/") { while (i < n && lit[i] !== "\n") i++; continue; }
    if (c === "'" || c === '"') {
      const quote = c; i++; let s = '"';
      while (i < n) {
        const ch = lit[i];
        if (ch === "\\" && i + 1 < n) {
          const next = lit[i + 1];
          if (next === "\\") s += "\\\\"; else if ("ntrbf".includes(next)) s += "\\" + next; else s += esc(next);
          i += 2; continue;
        }
        if (ch === quote) { i++; break; }
        s += esc(ch); i++;
      }
      out += s + '"'; continue;
    }
    out += c; i++;
  }
  out = out.replace(/,\s*([}\]])/g, "$1").replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":');
  return JSON.parse(out);
}
let verified;
try { verified = jsLiteralToJSON(extractArrayLiteral(outText, "CHANGELOG")); }
catch (e) {
  console.error("changelog-normalize: output would NOT parse in the fleet manager: " + e.message);
  console.error("  → an item almost certainly contains the literal sequence // (the manager strips line comments). Remove it and re-run.");
  process.exit(1);
}
if (verified.length !== canon.length) {
  console.error(`changelog-normalize: manager parse truncated (${verified.length} vs ${canon.length}) — refusing to write.`);
  process.exit(1);
}

fs.writeFileSync(FILE, outText);
console.log(`changelog-normalize: ${canon.length} entries, top v${canon[0].v}; stamped ${stamped} empty ts with ${NOW}; manager-parse OK.`);
