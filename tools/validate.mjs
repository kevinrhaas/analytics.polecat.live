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
import { readFileSync } from "node:fs";

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

if (failed) { console.error(`validate: ${failed} file(s) failed`); process.exit(1); }
console.log(`validate: ${files.length} files parse clean; boot-path files within budget`);
