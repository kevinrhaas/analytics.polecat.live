// validate.mjs — the fast, browser-free syntax gate, shared by Guard main
// (auto-revert.yml), the dev gate (ci.yml) and promote-to-stage.yml so all three
// agree on what "parses" means. Mirrors Guard main's historical inline loop:
// the app mixes classic scripts (app/*.js via <script src>) with ES modules
// (js/changelog.js), so a file passes if EITHER parse mode accepts it.
// Skips vendored code, the frozen reference/provisioning inputs, and any
// /v/<n>/ snapshots. Callers chain `node tools/changelog-check.js` after this
// for the fleet changelog contract.
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

if (failed) { console.error(`validate: ${failed} file(s) failed`); process.exit(1); }
console.log(`validate: ${files.length} files parse clean`);
