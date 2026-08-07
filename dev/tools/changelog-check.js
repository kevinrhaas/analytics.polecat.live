#!/usr/bin/env node
/* tools/changelog-check.js — verify-only guard for the fleet changelog contract.

   Runs the fleet manager's EXACT parser (manager.polecat.live/js/ingest.js) against
   js/changelog.js AS COMMITTED and exits non-zero if the file would not sync. Unlike
   tools/changelog-normalize.js (the authoring "push step", which stamps timestamps and
   REWRITES the file), this script never writes anything — it exists for CI-style
   callers (Guard main / .github/workflows/auto-revert.yml) where a validation step
   must not mutate the tree.

   Checks:
   1. The manager parser (array extraction + literal→JSON requoter) parses the file.
   2. No entries were silently truncated (manager count == evaluated-module count).
   3. Every entry has a non-empty ISO `ts` (i.e. the author ran the normalizer).
   4. The top entry carries the highest version number (newest first). */
"use strict";
const fs = require("fs");
const path = require("path");

const FILE = path.resolve(__dirname, "..", "js", "changelog.js");
const src = fs.readFileSync(FILE, "utf8");

// ── the file as the APP sees it (evaluate the module) ──
const win = {};
new Function("window", src.replace(/export\s+const/g, "const"))(win);
const evaluated = win.STUDIO_CHANGELOG || [];
if (!evaluated.length) { console.error("changelog-check: no entries found by module evaluation"); process.exit(1); }

// ── the file as the MANAGER sees it (exact ingest.js port — same as normalize) ──
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
// EXACT port of manager.polecat.live/js/ingest.js jsLiteralToJSON — the operation
// order (requote strings FIRST, then the bare-key regex) must mirror the manager
// verbatim; see tools/changelog-normalize.js for the full explanation.
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

let parsed;
try { parsed = jsLiteralToJSON(extractArrayLiteral(src, "CHANGELOG")); }
catch (e) {
  console.error("changelog-check: js/changelog.js would NOT parse in the fleet manager: " + e.message);
  console.error("  → run `node tools/changelog-normalize.js` (and remove any literal // from item text).");
  process.exit(1);
}
if (parsed.length !== evaluated.length) {
  console.error(`changelog-check: manager parse truncated (${parsed.length} vs ${evaluated.length} entries).`);
  process.exit(1);
}
const unstamped = parsed.filter((e) => !e.ts || String(e.ts).trim() === "");
if (unstamped.length) {
  console.error(`changelog-check: ${unstamped.length} entr${unstamped.length === 1 ? "y has" : "ies have"} an empty ts (v${unstamped.map((e) => e.v).join(", v")}).`);
  console.error("  → run `node tools/changelog-normalize.js` BEFORE committing — nothing stamps after merge.");
  process.exit(1);
}
const maxV = parsed.reduce((m, e) => Math.max(m, e.v), 0);
if (parsed[0].v !== maxV) {
  console.error(`changelog-check: top entry is v${parsed[0].v} but max is v${maxV} — newest goes on TOP.`);
  process.exit(1);
}
console.log(`changelog-check: ${parsed.length} entries, top v${parsed[0].v} — manager-parse OK.`);
