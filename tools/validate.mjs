// validate.mjs — the fast, browser-free syntax gate, shared by Guard main
// (auto-revert.yml), the dev gate (ci.yml) and promote-to-stage.yml so all three
// agree on what "parses" means. Mirrors Guard main's historical inline loop:
// the app mixes classic scripts (app/*.js via <script src>) with ES modules
// (js/changelog.js), so a file passes if EITHER parse mode accepts it.
// Skips vendored code, the frozen reference/provisioning inputs, and any
// /v/<n>/ snapshots. Callers chain `node tools/changelog-check.js` after this
// for the fleet changelog contract.
//
// It also holds the two BOOT-PATH files to a byte budget (AUD-08). Both are
// re-fetched constantly — sw.js on every service-worker update check, the
// changelog head on every boot — and both have a proven habit of quietly
// absorbing documentation: sw.js carried 2,454 lines of release notes (~190KB
// to ship ~5KB of worker) until AUD-08 moved them to docs/sw-history.md. A
// budget is the cheap way to make that regression loud instead of invisible.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "*.js", "*.mjs"], { encoding: "utf8" })
  .split("\n").filter(Boolean)
  .filter((f) => !/^(vendor|reference|provisioning|v)\//.test(f));

let failed = 0;
for (const f of files) {
  let ok = false;
  try { execFileSync("node", ["--check", f], { stdio: "pipe" }); ok = true; } catch {}
  if (!ok) {
    try {
      execFileSync("node", ["--input-type=module", "--check"], { stdio: "pipe", input: readFileSync(f) });
      ok = true;
    } catch (e) {
      failed++;
      console.error(`SYNTAX FAIL: ${f}\n${String(e.stderr || e.message).slice(0, 400)}`);
    }
  }
}

// Boot-path byte budgets. Generous headroom over today's real sizes — this is a
// creep alarm, not a golf score; raise a limit deliberately if a file genuinely
// needs to grow, but never to re-admit prose.
const BUDGETS = [
  { file: "sw.js", max: 16 * 1024, why: "the service worker is re-fetched on every update check — release notes belong in docs/sw-history.md" },
  { file: "js/changelog-head.js", max: 4 * 1024, why: "the boot head carries a stamp and one entry, never item bullets — the history is fetched on demand" },
];
for (const { file, max, why } of BUDGETS) {
  const size = readFileSync(file).length;
  if (size > max) {
    failed++;
    console.error(`BUDGET FAIL: ${file} is ${(size / 1024).toFixed(1)}KB, over its ${max / 1024}KB budget — ${why}`);
  }
}

// ---- SP-0 (b): the sample-pack DATA gate (docs/PACKS.md) --------------------------
// A pack that ships REAL data ships it as committed CSV under data/packs/<id>/,
// written by a re-runnable tools/pack-extract/<id>.mjs, declared by a `source` on its
// app/demopacks.js registry entry. Four ways that decays silently, so all four are
// checked here — in the dev gate, browser-free, in milliseconds:
//   1. data with no extract script — unreproducible the day someone asks where a
//      column came from, which is the whole reason the convention exists;
//   2. a pack directory (or a script) nobody registered — dead weight in every clone;
//   3. CSV creep — the workspace is ONE localStorage blob and twelve packs coexist in
//      it, so the ≤150KB per pack is a budget, not an aspiration (same mechanism that
//      holds sw.js above, and for the same reason: make the regression loud);
//   4. somebody else's licensed data with no THIRD-PARTY-NOTICES.md line.
const PACK_CSV_BUDGET = 150 * 1024;

// Brace-walk to a top-level object literal's body, so a nested `{` inside an entry
// can never end the block early (same technique as tools/doc-truth.mjs).
function objectBlock(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`validate: ${marker} not found`);
  let depth = 0, open = src.indexOf("{", start), i = open;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) break;
  }
  return src.slice(open, i + 1);
}

const packSrc = readFileSync("app/demopacks.js", "utf8");
const registryBlock = objectBlock(packSrc, "Studio.DEMO_PACKS = {");
// Entry keys are the block's 4-space-indented `<id>: {` lines — the file's one
// consistent convention, and the same shape the SP-0 conformance loop relies on.
const packEntries = {};
for (const m of registryBlock.matchAll(/\n {4}([a-z][a-z0-9]*): \{/g)) {
  packEntries[m[1]] = objectBlock(registryBlock.slice(m.index), `${m[1]}: {`);
}
const packIds = Object.keys(packEntries);
const packFail = (msg) => { failed++; console.error(`PACK FAIL: ${msg}`); };
if (!packIds.length) packFail("app/demopacks.js registers no packs — the registry regex or the file's shape moved");

// Every registry entry declares a source, and a licensed one is credited.
const notices = readFileSync("THIRD-PARTY-NOTICES.md", "utf8");
for (const id of packIds) {
  const entry = packEntries[id];
  const kind = (entry.match(/source: \{[^}]*kind: "([a-z]+)"/) || [])[1];
  if (!kind) { packFail(`app/demopacks.js: pack "${id}" declares no source — see docs/PACKS.md`); continue; }
  if (!["synthetic", "public", "licensed"].includes(kind)) {
    packFail(`app/demopacks.js: pack "${id}" has source kind "${kind}" — one of synthetic/public/licensed`);
    continue;
  }
  const name = (entry.match(/source: \{[^}]*name: "([^"]+)"/) || [])[1];
  if (kind === "licensed") {
    if (!name) packFail(`app/demopacks.js: pack "${id}" ships licensed data with no source name`);
    else if (!notices.includes(name)) {
      packFail(`THIRD-PARTY-NOTICES.md does not mention "${name}" — pack "${id}" ships licensed data and must be credited there`);
    }
  }
}

// The data directories and the extract scripts, each way round.
const readDirSafe = (d) => { try { return readdirSync(d, { withFileTypes: true }); } catch { return []; } };
const scriptIds = readDirSafe("tools/pack-extract")
  .filter((e) => e.isFile() && e.name.endsWith(".mjs") && e.name !== "lib.mjs")
  .map((e) => e.name.replace(/\.mjs$/, ""));
for (const id of scriptIds) {
  if (!packIds.includes(id)) packFail(`tools/pack-extract/${id}.mjs has no pack "${id}" in app/demopacks.js`);
}
for (const e of readDirSafe("data/packs")) {
  if (!e.isDirectory()) continue;
  const id = e.name;
  if (!packIds.includes(id)) { packFail(`data/packs/${id}/ has no pack "${id}" in app/demopacks.js`); continue; }
  if (!scriptIds.includes(id)) packFail(`data/packs/${id}/ has no extract script — data ships with tools/pack-extract/${id}.mjs, its provenance record (docs/PACKS.md)`);
  const entries = readDirSafe(`data/packs/${id}`).filter((f) => f.isFile());
  if (!entries.some((f) => f.name === "SOURCE.json")) packFail(`data/packs/${id}/SOURCE.json is missing — writePack() emits it`);
  const stray = entries.filter((f) => f.name !== "SOURCE.json" && !f.name.endsWith(".csv")).map((f) => f.name);
  if (stray.length) packFail(`data/packs/${id}/ holds non-CSV data (${stray.join(", ")}) — pack data is CSV plus SOURCE.json`);
  const bytes = entries.filter((f) => f.name.endsWith(".csv"))
    .reduce((n, f) => n + readFileSync(`data/packs/${id}/${f.name}`).length, 0);
  if (bytes > PACK_CSV_BUDGET) {
    packFail(`data/packs/${id}/ is ${(bytes / 1024).toFixed(1)}KB of CSV, over the ${PACK_CSV_BUDGET / 1024}KB per-pack budget — ` +
      "subset or aggregate harder in the extract; every installed pack shares one localStorage workspace");
  }
}

if (failed) { console.error(`validate: ${failed} file(s) failed`); process.exit(1); }
console.log(`validate: ${files.length} files parse clean; boot-path files within budget; ` +
  `${packIds.length} sample pack(s) declare a source, ${scriptIds.length} extract script(s) registered`);
