// tools/doc-truth.mjs — the DOC-TRUTH guard (AUD-11).
//
// The app's docs and marketing copy make COUNTABLE claims: "54 chart types", "the 15 most
// universally understood", "~56K LOC", "~3,000 checks", "the mobile gate is 390x780". Every
// one of those was, at the 2026-08 audit, wrong — four different chart-type numbers appeared
// across marketing and Help, none of them the real one, because nothing ever re-measured
// them. This script is the re-measurement: it reads the SOURCES OF TRUTH (app/model.js's
// chart registry, app/studio.js's Simple-mode set, LICENSE, the test suite, the smoke gate)
// and fails if any published claim has drifted away from them.
//
// Browser-free and dependency-free by design: it runs in the dev gate (.github/workflows/
// ci.yml) next to validate.mjs and changelog-check.js, in well under a second.
//
//   node tools/doc-truth.mjs
//
// When it fails it tells you BOTH numbers — the claim and the measurement — so the fix is
// always obvious: change the copy, or (if the copy was right) find out what moved.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

let failed = 0;
function ok(name, cond, detail) {
  if (cond) { console.log("  ✓ " + name); return true; }
  failed++;
  console.error("  ✗ " + name + (detail ? "\n      " + detail : ""));
  return false;
}

/* ── the sources of truth ─────────────────────────────────────────────────── */

// Studio.CHARTS in app/model.js is THE chart-type registry. Match its top-level keys by their
// 4-space indent (the file's one consistent convention) after brace-walking to the block, so a
// nested `foo: {` inside an entry's opts can never be miscounted as a chart type.
function chartRegistryKeys() {
  const src = read("app/model.js");
  const start = src.indexOf("Studio.CHARTS = {");
  if (start < 0) throw new Error("doc-truth: Studio.CHARTS not found in app/model.js");
  let depth = 0, open = src.indexOf("{", start), i = open;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) break;
  }
  const block = src.slice(open, i + 1);
  return [...block.matchAll(/\n {4}([A-Za-z_]\w*): \{/g)].map((m) => m[1]);
}

function simpleChartKeys() {
  const src = read("app/studio.js");
  const m = src.match(/var SIMPLE_CHART_TYPES = \{([^}]*)\}/);
  if (!m) throw new Error("doc-truth: SIMPLE_CHART_TYPES not found in app/studio.js");
  return [...m[1].matchAll(/([A-Za-z_]\w*)\s*:/g)].map((x) => x[1]);
}

// First-party source LOC — the figure CLAUDE.md quotes. Deliberately excludes vendor/ (not
// ours), tests/ (not the product), js/changelog.js (data), and the generated dev//stage/
// preview trees.
function firstPartyLoc() {
  const EXT = new Set([".js", ".mjs", ".css", ".html"]);
  const files = ["index.html", "sw.js", "docs/index.html"];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = dir + "/" + e.name;
      if (e.isDirectory()) walk(rel);
      else if (EXT.has(path.extname(e.name))) files.push(rel);
    }
  };
  ["app", "css", "tools"].forEach(walk);
  return files.reduce((n, f) => n + read(f).split("\n").length, 0);
}

const suiteChecks = (read("tests/run.js").match(/(^|[^\w.])ok\(/gm) || []).length;

/* ── the claims ───────────────────────────────────────────────────────────── */

const charts = chartRegistryKeys();
const N = charts.length;
const simple = simpleChartKeys();
const marketing = read("index.html");
const help = read("docs/index.html");
const claude = read("CLAUDE.md");
const readme = read("README.md");

console.log(`doc-truth — measured: ${N} chart types, ${simple.length} simple-mode types, ` +
  `${firstPartyLoc().toLocaleString()} LOC, ${suiteChecks} suite checks\n`);

// 1. The generated marketing gallery is regenerated from the registry — if it has drifted,
//    someone added a chart type without running tools/gen-chart-gallery.mjs.
const galleryTypes = (read("site/chart-gallery.js").match(/"type":/g) || []).length;
ok("site/chart-gallery.js covers every chart type", galleryTypes === N,
  `gallery has ${galleryTypes}, registry has ${N} — run: node tools/gen-chart-gallery.mjs`);

// 2. Help's chart-type cards cover every registry type. `ct-kpi` is the documented extra: the
//    KPI tile is a panel kind, not a Studio.CHARTS entry, and it belongs in that grid.
const CARD_EXTRAS = new Set(["kpi"]);
const cards = [...help.matchAll(/id="ct-([A-Za-z]+)"/g)].map((m) => m[1]);
const missingCards = charts.filter((k) => !cards.includes(k));
const strayCards = cards.filter((k) => !charts.includes(k) && !CARD_EXTRAS.has(k));
ok("docs/index.html documents every chart type", !missingCards.length && !strayCards.length,
  `undocumented: ${missingCards.join(", ") || "none"} · not in the registry: ${strayCards.join(", ") || "none"}`);

// 3. Every published chart-type COUNT equals the registry count — and is exact, not a "50+"
//    hedge that quietly stops being true in either direction. Simple-mode counts (check 4) are
//    a different claim about a smaller set, so they're carved out here by their own phrasing.
const SIMPLE_CLAIM = /(\d+) (?:most universally understood|chart types shown in the gallery)/g;
for (const [label, src] of [["index.html", marketing], ["docs/index.html", help]]) {
  const carveOuts = [...src.matchAll(SIMPLE_CLAIM)].map((m) => [m.index, m.index + m[0].length]);
  const claims = [...src.matchAll(/(?:all )?(\d+)(\+?) (?:chart )?types?\b/g)]
    .filter((m) => /chart types?\b/.test(m[0]) || /^all /.test(m[0]))
    .filter((m) => !carveOuts.some(([a, b]) => m.index < b && m.index + m[0].length > a));
  const wrong = claims.filter((m) => Number(m[1]) !== N || m[2] === "+");
  ok(`${label}: chart-type counts all read ${N}`, claims.length > 0 && !wrong.length,
    (claims.length ? wrong.map((m) => `"${m[0]}"`).join(", ") : "(no chart-type count found at all)") +
    `  — the registry has ${N}`);
}

// 4. Simple mode's advertised size matches the actual SIMPLE_CHART_TYPES set.
const simpleClaims = [...help.matchAll(SIMPLE_CLAIM)];
ok(`docs/index.html: Simple-mode counts all read ${simple.length}`,
  simpleClaims.length >= 1 && simpleClaims.every((m) => Number(m[1]) === simple.length),
  simpleClaims.map((m) => `"${m[0]}"`).join(", ") + `  — SIMPLE_CHART_TYPES has ${simple.length}`);

// 5. Help claims the bundled samples cover every chart type at least once. Check it: the
//    corpus is data/examples/*.json plus the demo packs built in app/demopacks.js.
const sampleSrc = fs.readdirSync(path.join(ROOT, "data/examples"))
  .filter((f) => f.endsWith(".json")).map((f) => read("data/examples/" + f)).join("\n") +
  read("app/demopacks.js");
const uncovered = charts.filter((k) => !new RegExp(`["']?type["']?:\\s*["']${k}["']`).test(sampleSrc));
ok("the bundled samples cover every chart type", !uncovered.length,
  `never used in a sample: ${uncovered.join(", ")} — either add one or soften the docs claim`);

// 6. The license copy matches the actual LICENSE file.
const gpl = /GNU GENERAL PUBLIC LICENSE/.test(read("LICENSE"));
for (const f of ["README.md", "CLAUDE.md", "THIRD-PARTY-NOTICES.md", "index.html", "docs/index.html"]) {
  // STATUS.md is deliberately NOT in this list: its DONE history records what the license
  // USED to be, and rewriting history to match the present would be its own kind of lie.
  ok(`${f}: license copy matches LICENSE`, !gpl || !/proprietary/i.test(read(f)),
    "LICENSE is GPL-3.0 but this file still calls the app proprietary");
}

// 7. CLAUDE.md's size figures. Tolerances are generous — these are "~" claims meant to give a
//    reader the right order of magnitude, and they should only fail once they mislead.
const locClaim = claude.match(/~(\d+)K LOC/);
const loc = firstPartyLoc();
ok("CLAUDE.md: the LOC figure is within 10% of the source tree",
  locClaim && Math.abs(locClaim[1] * 1000 - loc) / loc <= 0.10,
  `CLAUDE.md says ~${locClaim ? locClaim[1] + "K" : "(no claim found)"}, measured ${loc.toLocaleString()}`);

for (const [f, src] of [["CLAUDE.md", claude], ["README.md", readme]]) {
  const m = src.match(/~([\d,]+) checks/);
  const claimed = m ? Number(m[1].replace(/,/g, "")) : 0;
  ok(`${f}: the suite check-count is within 15% of tests/run.js`,
    claimed && Math.abs(claimed - suiteChecks) / suiteChecks <= 0.15,
    `${f} says ~${m ? m[1] : "(no claim found)"}, tests/run.js has ${suiteChecks} ok() calls`);
}

// 8. The documented mobile gate is the one the gate actually runs. (The audit found the docs
//    saying 390x780 while the smoke ran 844 — a gate nobody was measured against.)
const docGate = claude.match(/390×(\d+)/);
const smokeGate = read("tools/dev-smoke.mjs").match(/width: 390, height: (\d+)/);
ok("dev-smoke runs the mobile viewport CLAUDE.md documents",
  docGate && smokeGate && docGate[1] === smokeGate[1],
  `CLAUDE.md documents 390×${docGate ? docGate[1] : "?"}, dev-smoke runs 390×${smokeGate ? smokeGate[1] : "?"}`);

// 9. Help's rail tour names every section the rail actually has, by the rail's OWN label.
//    AUD-12 made the rail the single list of sections; this makes the Help page's description
//    of it accountable to that list. It had drifted: the Build group called View Builder
//    "Views" and Dashboard Builder "Dashboards" (the names of two DIFFERENT sections in the
//    group above), and Settings/Help — the two items pinned below the groups — were never
//    listed at all. A reader looking for the name on the rail could not find it in the Help.
const railSecs = [...read("app/index.html").matchAll(/data-sec="([a-z]+)"/g)].map((m) => m[1]);
const railLabels = (() => {
  const m = read("app/shell.js").match(/var SECTION_LABELS = \{([\s\S]*?)\};/);
  if (!m) throw new Error("doc-truth: SECTION_LABELS not found in app/shell.js");
  const out = {};
  for (const p of m[1].matchAll(/(\w+): "([^"]+)"/g)) out[p[1]] = p[2];
  return out;
})();
// Just the "The left rail" block — Home and Repository are also named in the prose below it,
// which would make this pass for the wrong reason.
const railBlock = (() => {
  const start = help.indexOf("<h3>The left rail");
  const end = help.indexOf("<h3", start + 4);
  return start < 0 ? "" : help.slice(start, end < 0 ? help.length : end);
})();
const unnamed = [...new Set(railSecs)]
  .map((s) => railLabels[s] || s)
  .filter((label) => !railBlock.includes(`<strong>${label}</strong>`));
ok("docs/index.html: the rail tour names every rail section", railBlock && !unnamed.length,
  railBlock ? `not named in the Help's rail block: ${unnamed.join(", ")}`
            : "the <h3>The left rail…</h3> block was not found at all");

console.log(failed ? `\n✗ doc-truth: ${failed} claim(s) have drifted from the source of truth`
  : "\n✅ doc-truth: every published claim matches the source it describes");
process.exit(failed ? 1 : 0);
