// stage-preview.mjs — assemble a hosted preview of a pipeline stage (dev|stage)
// as a subdirectory of the production Pages artifact.
//
//   node tools/stage-preview.mjs <srcDir> <stage> [sha]
//
// Analytics' variant of the jobtracker pilot's stage assembler (see that
// repo's docs/PIPELINE.md — the canonical pipeline runbook). Much of the
// heavy lifting is free here: app/index.html and app/viewer.html anchor every
// relative URL to `<base href="/"/>`, so re-pointing that ONE tag at
// "/<stage>/" re-roots the whole app — including the service-worker
// registration (`register("sw.js")` is relative, so it resolves to the
// stage's own sw.js with the stage's own scope, never production's). The
// marketing + docs pages are relative-linked and just work from the subpath.
// What still needs doing per page: rewrite the few root-absolute URLs,
// inject <meta name="robots" content="noindex"> (no page ships a robots meta
// today), and add the fixed stage banner (amber = dev, violet = stage).
// The stage's sw.js is REPLACED with a self-unregistering stub — previews
// never cache offline, and any stale preview SW cleans itself up.
//
// Sharing note: previews share the production origin and therefore its
// localStorage workspace. That is SAFE here since AUD-04 (v834):
// replaceAll preserves tables an older build doesn't recognize, so a newer
// preview build's data can no longer be deleted by production code.
//
// Excluded from the copy: .git, .github, /dev/, /stage/, CNAME, node_modules.
// Runs inside deploy.yml; the caller skips it while the stage ref doesn't
// exist, so this is safe to merge before the pipeline is activated.
import { readFile, writeFile, cp, rm, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const [srcDir, stage, sha = ""] = process.argv.slice(2);
if (!srcDir || !["dev", "stage"].includes(stage)) {
  console.error("usage: node tools/stage-preview.mjs <srcDir> <dev|stage> [sha]");
  process.exit(2);
}

const EXCLUDE = new Set([".git", ".github", "dev", "stage", "CNAME", "node_modules"]);
const COLORS = {
  dev: "linear-gradient(135deg,#fbbf24,#d97706)", // amber — work in progress
  stage: "linear-gradient(135deg,#a78bfa,#7c3aed)", // violet — release candidate
};

await rm(stage, { recursive: true, force: true });
for (const item of await readdir(srcDir)) {
  if (EXCLUDE.has(item)) continue;
  await cp(join(srcDir, item), join(stage, item), { recursive: true });
}

// Previews never do offline caching; the stub also unregisters any stale
// preview SW a visitor picked up. Registration is relative to the page's
// <base>, so this stub is what the staged app actually registers.
await writeFile(join(stage, "sw.js"), [
  `// ${stage} preview — no offline caching; unregister anything installed.`,
  `self.addEventListener("install", function () { self.skipWaiting(); });`,
  `self.addEventListener("activate", function (e) {`,
  `  e.waitUntil(self.registration.unregister().then(function () {`,
  `    return self.clients.matchAll();`,
  `  }).then(function (clients) {`,
  `    clients.forEach(function (c) { c.navigate(c.url); });`,
  `  }));`,
  `});`,
  "",
].join("\n"));

for (const file of await htmlFiles(stage)) {
  let html = await readFile(file, "utf8");
  // ONE rewrite covers everything root-absolute — including `<base href="/"/>`
  // (which becomes href="/<stage>/" and re-roots every relative URL in the
  // app/viewer pages, service-worker registration included) and the handful
  // of absolute href="/" home links. Never touches protocol-relative "//…".
  html = html.replace(/(href|src|content)="\/(?!\/)/g, `$1="/${stage}/`);
  if (!html.includes('name="robots"')) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>\n  <meta name="robots" content="noindex"/>`);
  }
  if (!html.includes('id="__stage"')) {
    html = html.replace(/<\/body>/i, stageBanner(stage, sha) + "\n</body>");
  }
  await writeFile(file, html);
}

// The repo ships no robots.txt — the ARTIFACT gets one so crawlers skip the
// previews (created/extended at assembly time only; production files in git
// are untouched).
const robotsPath = "robots.txt";
let robots = existsSync(robotsPath) ? await readFile(robotsPath, "utf8") : "User-agent: *\n";
if (!robots.includes(`Disallow: /${stage}/`)) {
  robots = robots.replace(/(User-agent: \*\n)/, `$1Disallow: /${stage}/\n`);
  await writeFile(robotsPath, robots);
}

console.log(`stage-preview: assembled /${stage}/ from ${srcDir}${sha ? ` (${sha})` : ""}`);

async function htmlFiles(dir) {
  const out = [];
  for (const item of await readdir(dir)) {
    const p = join(dir, item);
    if ((await stat(p)).isDirectory()) out.push(...await htmlFiles(p));
    else if (item.endsWith(".html")) out.push(p);
  }
  return out;
}

function stageBanner(s, rev) {
  const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif`;
  const label = s.toUpperCase();
  return `<div id="__stage" role="status" style="position:fixed;left:0;right:0;bottom:0;z-index:2147483000;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;padding:7px 16px;font:600 13px ${FONT};color:#fff;background:${COLORS[s]};box-shadow:0 -6px 20px rgba(0,0,0,.25)">
  <span><b>${label} preview</b>${rev ? ` — ${s}@${rev}` : ""} · uses your live workspace data</span>
  <a href="/" style="color:#fff;text-decoration:underline">open production</a>
</div>`;
}
