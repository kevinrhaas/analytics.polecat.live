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

// 10. The landing page's data-source claims answer to the adapter registry. The app's
//     CONNECTABLE sources are the registered adapters minus `local` (the no-backend
//     workspace — not something you connect TO), and index.html makes two claims about that
//     set: a COUNT in the features card and a NAME per source in the #sources strip. Both had
//     drifted — Amazon Redshift shipped as an adapter and .xlsx import shipped with LF24-XLSX,
//     and the strip never learned about either. Every adapter must also appear in the name map
//     below, so adding one forces a decision about how the landing page says it.
const adapters = (() => {
  const out = new Map();
  for (const f of fs.readdirSync(path.join(ROOT, "app/sources")).filter((f) => f.endsWith(".js"))) {
    const src = read("app/sources/" + f);
    for (const m of src.matchAll(/\bid:\s*"([\w-]+)",\s*(?:\/\/[^\n]*)?\s*label:\s*"([^"]+)"/g)) out.set(m[1], m[2]);
  }
  return out;
})();
// adapter id → the token the landing page has to use for it (its chip in the #sources strip).
const SOURCE_CHIP = {
  postgrest: "PostgreSQL", supabase: "Supabase", turso: "Turso", firebase: "Firebase",
  snowflake: "Snowflake", databricks: "Databricks", bigquery: "BigQuery", redshift: "Redshift",
  duckdb: "DuckDB", sqlite: "SQLite", gsheets: "Google Sheets", httpsql: "SQL/HTTP", file: "CSV",
};
const connectable = [...adapters.keys()].filter((id) => id !== "local");
const unmapped = connectable.filter((id) => !SOURCE_CHIP[id]);
ok("every registered source adapter has a landing-page name", !unmapped.length,
  `not in tools/doc-truth.mjs's SOURCE_CHIP map: ${unmapped.join(", ")} — name the new adapter ` +
  "on index.html and add it there");
const chipStrip = (marketing.match(/<div class="chips">([\s\S]*?)<\/div>/) || [, ""])[1];
const unnamedSources = connectable.filter((id) => SOURCE_CHIP[id] && !chipStrip.includes(SOURCE_CHIP[id]));
ok("index.html: the #sources strip names every source you can connect to", !unnamedSources.length,
  `missing from the strip: ${unnamedSources.map((id) => SOURCE_CHIP[id] + ` (${id})`).join(", ")}`);
const kindsClaim = marketing.match(/Connect (\d+) kinds of sources/);
ok(`index.html: the source-count claim reads ${connectable.length}`,
  kindsClaim && Number(kindsClaim[1]) === connectable.length,
  `index.html says ${kindsClaim ? kindsClaim[1] : "(no claim found)"}, the registry has ` +
  `${connectable.length} connectable adapters (${adapters.size} registered, minus \`local\`)`);

// 11. The overview tour's own promise: "this tour walks the left rail from the top down". It
//     had stopped being one — the walk crossed between the rail's Workspace/Build/Manage
//     groups five times (Home → Quick Views → View Builder → Dashboards → … → Repository →
//     Dashboard Builder) and never mentioned the Views CATALOG at all, which LF57 added to the
//     Workspace group. Nothing noticed, because nothing was measuring. The rail is the source
//     of truth (check 9's premise, AUD-12), so compare the tour's spotlight targets against the
//     rail's DOM order: same sections, same sequence. A new rail section now forces a decision
//     here — give it a step, or add it to SKIP below with the reason.
const SKIP_IN_TOUR = {
  admin: "role-gated (M4) — most accounts never see it",
  settings: "pinned below the groups, not part of the app walk",
  docs: "pinned below the groups — and it's where the tour sends you for more",
};
const railBlockHtml = (() => {
  const src = read("app/index.html");
  const start = src.indexOf('<nav id="railNav"');
  return start < 0 ? "" : src.slice(start, src.indexOf("</nav>", start));
})();
const railWalk = [...new Set([...railBlockHtml.matchAll(/data-sec="([a-z]+)"/g)].map((m) => m[1]))];
// The overview tour's step array only — the other five tours also target rail items.
const overviewBlock = (() => {
  const src = read("app/tutorial.js");
  const start = src.indexOf("overview: {");
  if (start < 0) throw new Error("doc-truth: TOURS.overview not found in app/tutorial.js");
  let depth = 0, open = src.indexOf("{", start), i = open;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) break;
  }
  return src.slice(open, i + 1);
})();
const tourWalk = [...overviewBlock.matchAll(/target: '\.rail-item\[data-sec="([a-z]+)"\]'/g)].map((m) => m[1]);
const label = (s) => railLabels[s] || s;
const strayInSkip = Object.keys(SKIP_IN_TOUR).filter((s) => !railWalk.includes(s));
ok("tools/doc-truth.mjs: every deliberately-skipped tour section is still on the rail", !strayInSkip.length,
  `SKIP_IN_TOUR names sections the rail no longer has: ${strayInSkip.join(", ")}`);
const expectedWalk = railWalk.filter((s) => !SKIP_IN_TOUR[s]);
ok("app/tutorial.js: the overview tour walks the rail top-to-bottom, skipping nothing",
  tourWalk.length > 0 && tourWalk.join(" → ") === expectedWalk.join(" → "),
  `tour: ${tourWalk.map(label).join(" → ") || "(no rail steps found)"}\n      rail: ${expectedWalk.map(label).join(" → ")}` +
  `\n      (deliberate skips: ${Object.entries(SKIP_IN_TOUR).map(([s, why]) => `${label(s)} — ${why}`).join("; ")})`);

// 12. The welcome overlay's QUICK TOUR — the "a few quick cards right here, what each part of
//     the app is for" carousel — is the other first-run surface that describes the app's
//     sections, and nothing was measuring it either. It had drifted exactly the way the guided
//     overview tour had (check 11): the Views catalog LF57 added, the Dashboards catalog and
//     Repository were never named, so the tour of "each part of the app" walked straight past
//     the rail's whole Workspace group. Unlike check 11 this is NOT an ordering claim — the
//     carousel is a value narrative (make it → find it → hand it out → feed it), not a rail
//     walk — so it asserts COVERAGE only: every rail section is named, by the rail's own label.
const SKIP_IN_WELCOME = {
  admin: "role-gated (M4) — most accounts never see it",
  settings: "pinned below the groups; the hero screen already points at Settings → Tour",
  docs: "pinned below the groups — the last card hands off to the guided tour, not to Help",
};
const welcomeSteps = (() => {
  const src = read("app/welcome.js");
  const start = src.indexOf("var BASE_STEPS = [");
  if (start < 0) throw new Error("doc-truth: BASE_STEPS not found in app/welcome.js");
  let depth = 0, open = src.indexOf("[", start), i = open;
  for (; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]" && --depth === 0) break;
  }
  // Only the COPY a visitor reads — the t/h/s fields' string literals. Not the raw block:
  // a source comment ABOUT the drift (this one's own, first time round) would otherwise be
  // enough to make the check pass while the carousel still said nothing.
  return [...src.slice(open, i + 1).matchAll(/\b[ths]:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join("\n");
})();
const strayInWelcomeSkip = Object.keys(SKIP_IN_WELCOME).filter((s) => !railWalk.includes(s));
ok("tools/doc-truth.mjs: every deliberately-skipped welcome section is still on the rail", !strayInWelcomeSkip.length,
  `SKIP_IN_WELCOME names sections the rail no longer has: ${strayInWelcomeSkip.join(", ")}`);
// Longest label first, consuming each match, so "Quick Views" can never be the reason "Views"
// looks covered (nor "Dashboard Builder" the reason "Dashboards" does).
const unnamedInWelcome = (() => {
  const wanted = railWalk.filter((s) => !SKIP_IN_WELCOME[s]);
  let text = welcomeSteps, missing = [];
  for (const sec of [...wanted].sort((a, b) => label(b).length - label(a).length)) {
    if (text.includes(label(sec))) text = text.split(label(sec)).join("");
    else missing.push(sec);
  }
  return wanted.filter((s) => missing.includes(s));
})();
ok("app/welcome.js: the quick tour names every rail section, by the rail's own label",
  !unnamedInWelcome.length,
  `never named in BASE_STEPS: ${unnamedInWelcome.map(label).join(", ")}` +
  `\n      (deliberate skips: ${Object.entries(SKIP_IN_WELCOME).map(([s, why]) => `${label(s)} — ${why}`).join("; ")})`);

// 13. The tours tell you HOW TO GET BACK — and that instruction is a claim about the UI like
//     any other. Checks 11 and 12 hold the tours accountable for which SECTIONS they name;
//     nothing held them accountable for the AFFORDANCES they tell you to click, and the suite's
//     own freshness ratchet (tests/run.js "J6: … NO retired product terms") only greps for
//     retired nouns. So this rotted silently: LF46 (⋯ teardown, slice 2) deleted the ⋯ More
//     menu's "Help & power tools" group, and all six tours went on closing with "you can reopen
//     these tours any time from ⋯ More → Interactive tutorial" — 11 times, pointing at an entry
//     that had not existed for weeks. The palette is the route now. Resolve every affordance the
//     tour/welcome copy names: a "⋯ More → A → B" chain against the real #menuMore markup (its
//     buttons AND its .grp group headings), and a "⌘K → X" against app/palette.js's command
//     labels. Rename a palette command or drop a menu entry and the copy that points at it fails
//     here. (docs/index.html is deliberately out of scope: its prose takes deliberate liberties —
//     "⋯ More → Simple mode off" — that an exact label match would false-positive on. Its two ⋯
//     More references were checked by hand in this slice and both resolve.)
const norm = (s) => s.replace(/&amp;/g, "&").replace(/[✦…]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const moreMenuLabels = (() => {
  const src = read("app/index.html");
  const start = src.indexOf('<div class="menu" id="menuMore">');
  if (start < 0) throw new Error("doc-truth: #menuMore not found in app/index.html");
  // Brace-free block walk: to the matching </div> of the menu, comments and all.
  const block = src.slice(start, src.indexOf('<div class="menu-wrap"', start + 1) > -1
    ? src.indexOf('<div class="menu-wrap"', start + 1) : src.length);
  const stripComments = block.replace(/<!--[\s\S]*?-->/g, "");
  const labels = [...stripComments.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map((m) => m[1]);
  const groups = [...stripComments.matchAll(/<div class="grp">([^<]+)<\/div>/g)].map((m) => m[1]);
  return new Set([...labels, ...groups].map(norm));
})();
const paletteLabels = new Set(
  [...read("app/palette.js").matchAll(/\blabel:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => norm(m[1])));
ok("app/index.html + app/palette.js: the affordance lists parsed for check 13 are non-empty",
  moreMenuLabels.size > 3 && paletteLabels.size > 5,
  `#menuMore: ${moreMenuLabels.size} labels · palette: ${paletteLabels.size} commands`);
// Only the COPY a reader actually sees — string literals, with comments stripped first. This
// file's own prose describes the very drift it guards ("⋯ More → Interactive tutorial"), and a
// comment must never be able to fail the check nor to satisfy it (check 12's lesson). Neither
// file contains "://", so the naive comment strip is safe here.
const copyOf = (f) => {
  const bare = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  return norm([...bare.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join("\n"));
};
// A route resolves by consuming "→ <label>" steps off the front, longest label first, so
// "⌘K → Interactive tutorial brings you back here any time" resolves on the command and the
// trailing sentence is simply not part of the route.
const byLen = (set) => [...set].filter(Boolean).sort((a, b) => b.length - a.length);
const MORE_L = byLen(moreMenuLabels), PAL_L = byLen(paletteLabels);
const skipWs = (s, i) => { while (i < s.length && /\s/.test(s[i])) i++; return i; };
function unresolvedRoutes(text, anchor, labels, what, f) {
  const out = [];
  for (let i = text.indexOf(anchor); i !== -1; i = text.indexOf(anchor, i)) {
    let p = i + anchor.length;
    for (;;) {
      let q = skipWs(text, p);
      if (text[q] !== "→") break;
      q = skipWs(text, q + 1);
      const hit = labels.find((l) => text.startsWith(l, q));
      if (!hit) { out.push(`${f}: "${anchor} → ${text.slice(q, q + 32)}…" — no such ${what}`); break; }
      p = q + hit.length;
    }
    i = Math.max(p, i + anchor.length);
  }
  return out;
}
const badRoutes = ["app/tutorial.js", "app/welcome.js"].flatMap((f) => {
  const copy = copyOf(f);
  return [
    ...unresolvedRoutes(copy, norm("⋯ More"), MORE_L, "entry in #menuMore", f),
    ...unresolvedRoutes(copy, norm("⌘K"), PAL_L, "command in app/palette.js", f),
  ];
});
ok("app/tutorial.js + app/welcome.js: every affordance the tour copy names actually exists",
  !badRoutes.length, badRoutes.join("\n      "));

// 14. The tours name the saved-chart object by the label the app RENDERS for it. Check 13
//     covers routes ("⌘K → X"); nothing covered the plain NOUN a step bolds, and that is
//     where LF57's rename rotted: the object's storage table is still `analyses` and its ids
//     are still analysisId (a deliberately deferred internal rename), but every user-visible
//     surface has said "View" since — Explore's Save button, the builder library's group
//     header, Home's pinned section. N7 (2026-08-07) found the tours still on the old noun:
//     two steps sent the reader to a builder-library group called "Analyses" that renders
//     "Views", and the quick tour disagreed with ITSELF inside one walk (step 0 "save it as a
//     reusable analysis" vs step 5 "Save View"). So: derive the internal noun and the rendered
//     label from the SAME function that renders that group, confirm the app's three surfaces
//     agree with each other, then require that no BOLDED label in the tour copy uses the
//     internal noun. Deliberately scoped to <b>…</b> — the copy is free to describe the
//     ACTIVITY in ordinary English ("quick analyses", and the tour is named "Quick analysis");
//     what it may not do is point at a control by a name that control does not have.
const savedChart = (() => {
  const src = read("app/explore.js");
  const start = src.indexOf("function buildAnalysesLib(");
  if (start < 0) throw new Error("doc-truth: buildAnalysesLib not found in app/explore.js");
  const body = src.slice(start, src.indexOf("\n  }", start));
  const table = body.match(/Workspace\.all\("(\w+)"\)/);
  const group = body.match(/<span class="nm">([^<]+)<\/span>/);
  if (!table || !group) throw new Error("doc-truth: buildAnalysesLib no longer exposes a table name + group label");
  const save = src.match(/"(Save [A-Z]\w*)"/);
  const home = read("app/studio.js").match(/HOME_SECTION_LABELS = \{[^}]*?pinnedAnalyses: "([^"]+)"/);
  if (!save || !home) throw new Error("doc-truth: the Save button / Home section label are no longer parseable");
  return { table: table[1], group: group[1], save: save[1], home: home[1] };
})();
// "Views" → "View": the singular the other two surfaces should be built from.
const savedNoun = savedChart.group.replace(/s$/, "");
ok("the app agrees with itself on what a saved chart is called (library group, Save button, Home section)",
  savedChart.save.includes(savedNoun) && savedChart.home.includes(savedNoun),
  `library group "${savedChart.group}" · button "${savedChart.save}" · Home "${savedChart.home}"`);
// "analyses" → /analys/i: the internal noun, singular or plural. Comments stripped first —
// this file's own prose and tutorial.js's header both discuss the retired noun at length, and
// (check 12's lesson) a comment must be able neither to fail the check nor to satisfy it.
const staleNoun = new RegExp(savedChart.table.replace(/(es|s)$/, ""), "i");
// ONE thing legitimately keeps the old word, and it is derived rather than trusted (the
// SKIP_IN_WELCOME idiom above): a tour's own chooser label. "Quick analysis" is a real row the
// user clicks, so it is exempt only for as long as tutorial.js actually registers it. Nothing
// else is exempt — the first draft of this check also waved through the welcome hero's "quick
// analyses" as activity phrasing "shared with the marketing hero", and the guard immediately
// disproved that: index.html's hero says no such thing. The hero now names the rail's own
// Quick Views section, so no exemption is needed at all.
const tourChooserLabels = new Set(
  [...read("app/tutorial.js").matchAll(/\blabel:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].toLowerCase()));
ok("app/tutorial.js: the tour chooser labels parsed for check 14 are non-empty",
  tourChooserLabels.size >= 5, `parsed ${tourChooserLabels.size} tour labels`);
const staleLabels = ["app/tutorial.js", "app/welcome.js"].flatMap((f) => {
  const bare = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  return [...bare.matchAll(/<b>([^<]+)<\/b>/g)].map((m) => m[1])
    .filter((l) => staleNoun.test(l))
    .filter((l) => !tourChooserLabels.has(l.toLowerCase()))
    .map((l) => `${f}: <b>${l}</b>`);
});
ok(`app/tutorial.js + app/welcome.js: no bolded label calls a saved chart by its internal name ("${savedChart.table}") — the app renders "${savedChart.group}"`,
  !staleLabels.length, staleLabels.join("\n      "));

// 15. The Help page uses that same noun — and here the rule is stricter than check 14's.
//     Check 14 covered the tours; the same LF57 rename left docs/index.html's PROSE behind in
//     twenty places, and in the telling pattern: its LABELS were already right ("the Studio
//     library under <strong>Views</strong>") while the sentences wrapped around them still said
//     "saved analyses appear in the left list", "an analysis embeds its data access", "a
//     dashboard or analysis switches you into the right builder". A bolded-label rule would have
//     passed every one of them. Help is what a stuck reader searches, and it outlives any tour
//     step, so: outside an HTML comment or a <code> span, the internal noun must not appear at
//     all. <code> IS the sanctioned way to write it — the storage table and the literal
//     "HTTP 404 writing analyses" error string are real strings a reader will genuinely see, and
//     they stay verbatim. The one exemption is the same derived one check 14 uses: a tour's own
//     chooser label ("Quick analysis"), which Help names when it describes the tour picker.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const helpProse = read("docs/index.html")
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/<code>[\s\S]*?<\/code>/g, " ");
const helpBare = [...tourChooserLabels].filter((l) => staleNoun.test(l))
  .reduce((s, l) => s.replace(new RegExp(esc(l), "gi"), " "), helpProse);
// Report the offending phrase, not just a line number: the fix is always a rewording, and
// seeing the sentence fragment is what makes it obvious which wording was meant.
const staleHelp = [...helpBare.matchAll(new RegExp(`[^.<>]*${staleNoun.source}[^.<>]*`, "gi"))]
  .map((m) => `docs/index.html: "…${m[0].trim().replace(/\s+/g, " ").slice(0, 96)}…"`);
ok(`docs/index.html: Help calls a saved chart a "${savedNoun}" — the internal noun ("${savedChart.table}") only inside <code>`,
  !staleHelp.length, staleHelp.join("\n      "));

// 16. The "Build a dashboard" tour walks the builder's LEFT PANEL, and both halves of what it
//     said about that panel had rotted. (a) THE NAME: the pane is `#library` in the markup, but
//     it has RENDERED "Data" since STUDIO-PANELS — its header, its collapsed rail label, its
//     Settings toggle ("the Data and Inspector panels") and Help all say Data, while the tours
//     still said "the Library". Same internal-name-vs-rendered-label split checks 14 and 15
//     police for a saved chart, so it is derived the same way: the aside's id is the internal
//     name, its pane header is the rendered one. (b) THE GROUPS: the step promised "the sample
//     queries", a group LF65 deleted (sample content arrives only via Sample packs now), and
//     never named "My queries" — the authored-query group that replaced it. So the groups are
//     read off buildLibrary's OWN CALL GRAPH: a builder that still exists but is no longer
//     called (buildDemoPacksLib, unwired from the panel by DECLUTTER-1) cannot get back into
//     the copy's promise, which is exactly the mistake Help still makes. (c) THE ROUTE: the
//     tour sent the reader to "＋ New ▾ → Auto-build" — the DATA PANEL's add button, whose menu
//     offers a dataset, a connection or a dashboard-only query and has never had Auto-build.
//     Auto-build is in the TOPBAR "New ▾" menu. Check 13 resolves ⋯More/⌘K routes; these two
//     menus are built too differently to fold into it, so the rule here is narrower and blunter:
//     copy that mentions Auto-build names the topbar button and not the panel's.
const appHtml = read("app/index.html");
const apos = (s) => s.replace(/[’]/g, "'");
const unesc = (s) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const dataPaneName = (() => {
  const start = appHtml.indexOf('<aside id="library"');
  if (start < 0) throw new Error('doc-truth: <aside id="library"> not found in app/index.html');
  const block = appHtml.slice(start, appHtml.indexOf("</aside>", start));
  const m = block.match(/<div class="pane-h">[\s\S]*?<span>([^<]+)<\/span>/);
  if (!m) throw new Error("doc-truth: the builder's left pane no longer has a header label");
  return m[1].trim();
})();
function fnBody(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) return "";
  let depth = 0, open = src.indexOf("{", src.indexOf(")", start)), i = open;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) break;
  }
  return src.slice(open, i + 1);
}
const studioJs = read("app/studio.js"), exploreJs = read("app/explore.js");
const libBody = fnBody(studioJs, "buildLibrary");
if (!libBody) throw new Error("doc-truth: buildLibrary not found in app/studio.js");
// Literal group headers only — `<span class="nm">' + esc(stem) + '` is a per-item name, not a
// group of the panel, and the quote/plus exclusion drops it.
const groupLabels = (body) => [...body.matchAll(/<span class="nm">([^<'"+]+)<\/span>/g)].map((m) => unesc(m[1]));
const dataGroups = new Set([
  libBody,
  // buildAnalysesLib is a one-line delegation in studio.js; the group it renders is explore.js's.
  ...[...new Set([...libBody.matchAll(/\b(build[A-Z]\w*)\(/g)].map((m) => m[1]))].map((n) => fnBody(studioJs, n)),
  fnBody(exploreJs, "buildAnalysesLib"),
].flatMap(groupLabels));
ok("app/studio.js: the Data panel's group list parsed for check 16 is non-empty",
  dataGroups.size >= 3, `parsed: ${[...dataGroups].join(" · ") || "(none)"}`);
const tutorialSrc = read("app/tutorial.js");
const buildBlock = (() => {
  const start = tutorialSrc.indexOf("build: {");
  if (start < 0) throw new Error("doc-truth: TOURS.build not found in app/tutorial.js");
  let depth = 0, open = tutorialSrc.indexOf("{", start), i = open;
  for (; i < tutorialSrc.length; i++) {
    if (tutorialSrc[i] === "{") depth++;
    else if (tutorialSrc[i] === "}" && --depth === 0) break;
  }
  return tutorialSrc.slice(open, i + 1);
})();
const paneStep = (() => {
  const at = buildBlock.indexOf('target: "#library"');
  if (at < 0) return "";
  return buildBlock.slice(buildBlock.lastIndexOf("\n        {", at), buildBlock.indexOf("\n        }", at));
})();
ok("app/tutorial.js: the build tour still has a step spotlighting the builder's left panel", !!paneStep,
  'no step in TOURS.build targets "#library" — if the tour dropped it, drop this check with it');
const paneBold = [...paneStep.matchAll(/<b>([^<]+)<\/b>/g)].map((m) => m[1]);
const paneAllowed = new Set([dataPaneName, ...dataGroups].map(apos));
const strayGroups = paneBold.filter((l) => !paneAllowed.has(apos(l)));
ok(`app/tutorial.js: the build tour's panel step only bolds groups the panel renders`,
  !!paneStep && !strayGroups.length,
  `named but not rendered: ${strayGroups.join(", ")}\n      the panel renders: ${[...dataGroups].join(" · ")}`);
// The COPY fields only — a step's `target: "#library"` selector is markup, not something the
// reader is told, and check 13's copyOf() (every string literal) would trip over it.
const stepCopy = (f) => {
  const bare = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  return [...bare.matchAll(/\b(?:t|h|sub|s|blurb|label):\s*((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+)/g)].map((m) => m[1]).join("\n");
};
const stalePane = ["app/tutorial.js", "app/welcome.js"]
  .flatMap((f) => [...stepCopy(f).matchAll(/[^.]*librar(?:y|ies)[^.]*/gi)]
    .map((m) => `${f}: "…${m[0].replace(/\s+/g, " ").trim().slice(0, 90)}…"`));
ok(`app/tutorial.js + app/welcome.js: the builder's left panel is called "${dataPaneName}", never by its id ("library")`,
  !stalePane.length, stalePane.join("\n      "));
const btnLabel = (id) => {
  const m = appHtml.match(new RegExp(`<button[^>]*\\bid="${id}"[^>]*>([^<]+)</button>`));
  if (!m) throw new Error(`doc-truth: #${id}'s label is no longer parseable from app/index.html`);
  return m[1].trim();
};
const topbarNew = btnLabel("btnNew"), paneNew = btnLabel("btnNewDS");
const autoBuildGroup = (fnBody(studioJs, "buildNewMenu").match(/<div class="grp">([^<]+)<\/div>/) || [])[1];
ok("app/index.html + app/studio.js: the two New menus parsed for check 16 are distinct",
  topbarNew && paneNew && topbarNew !== paneNew && /auto-build/i.test(autoBuildGroup || ""),
  `topbar "${topbarNew}" · panel "${paneNew}" · starter group "${autoBuildGroup || "(none)"}"`);
const autoRoutes = ["app/tutorial.js", "app/welcome.js"].flatMap((f) => {
  const bare = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  return [...bare.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1])
    .filter((s) => /auto-build/i.test(s))
    .filter((s) => !s.includes(topbarNew) || s.includes(paneNew))
    .map((s) => `${f}: "…${s.replace(/\s+/g, " ").trim().slice(0, 90)}…"`);
});
ok(`app/tutorial.js + app/welcome.js: Auto-build is reached from the topbar "${topbarNew}", not the panel's "${paneNew}"`,
  !autoRoutes.length, autoRoutes.join("\n      "));

// 17. Help's own version of check 16 — the same drift, one document over, and the reason it
//     needs its own rule is the same reason check 15 needed one after check 14: check 16 reads
//     the TOURS, and Help had rotted independently and further. It called the pane the "Query
//     Library" (an id-flavoured name the app has never rendered), listed "Sample packs" among
//     the panel's groups (DECLUTTER-1 unwired that builder — check 16's call-graph derivation
//     is exactly what proves it), and routed authoring through "＋ New source", a control the
//     header does not have. Three rules, all off the same derived facts check 16 already
//     computed above, so the two documents can never drift apart from each other either:
//     (a) NAME — outside a <code> span, every "… library" phrase in Help must be one the APP
//         itself renders. Help legitimately has one ("Save to View library", a real button), so
//         unlike the tours it cannot be a blanket ban; the allowed phrases are read out of
//         app/*.js's own string literals rather than listed here.
//     (b) GROUPS — a bolded group name in Help's Data-panel prose must be a group buildLibrary
//         actually renders, the same `dataGroups` set check 16 holds the tour to.
//     (c) CONTROLS — Help may not name a "＋ New …" control for the panel other than the label
//         the header's own button carries.
const helpDoc = read("docs/index.html")
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/<code>[\s\S]*?<\/code>/g, " ");
// (a) Help has exactly ONE legitimate library: the saved-chart one, whose button really does
// read "Save to View library" — so the allowed qualifier is check 14's derived saved-chart
// noun, not a hand-kept list. Every other "<word> library" is Help naming the left pane.
const libQualifiers = [...helpDoc.matchAll(/([A-Za-z’']+)\s+librar(?:y|ies)/gi)];
const strayLib = libQualifiers
  .filter((m) => m[1].toLowerCase() !== savedNoun.toLowerCase())
  .map((m) => `docs/index.html: "…${m[0].replace(/\s+/g, " ").trim()}…"`);
ok(`docs/index.html: the builder's left pane is called "${dataPaneName}" — the only library Help may name is the "${savedNoun} library"`,
  !strayLib.length, strayLib.join("\n      "));
// (b) The Data-panel section's bolded names, held to the panel's real group list. Scoped to the
// paragraph that enumerates them so Help's many other bolded words aren't dragged in.
const dataPanelProse = (() => {
  const at = helpDoc.indexOf("The Data panel (left pane) lists everything you can build from");
  if (at < 0) throw new Error('doc-truth: Help no longer has the "Data panel lists everything" paragraph');
  return helpDoc.slice(at, helpDoc.indexOf("</p>", helpDoc.indexOf("</p>", at) + 4));
})();
const helpAllowed = new Set([dataPaneName, ...dataGroups].map(apos));
const helpStrayGroups = [...dataPanelProse.matchAll(/<strong>([^<]+)<\/strong>/g)]
  .map((m) => m[1].trim())
  .filter((l) => !helpAllowed.has(apos(l)));
ok("docs/index.html: the Data panel's documented groups are groups the panel renders",
  !helpStrayGroups.length,
  `named but not rendered: ${helpStrayGroups.join(", ")}\n      the panel renders: ${[...dataGroups].join(" · ")}`);
// (c) The panel's add control, by the label the button actually carries.
const helpPaneNew = [...helpDoc.matchAll(/＋\s*New\s+([a-z]\w*)/g)]
  .filter((m) => !paneNew.toLowerCase().includes(m[1].toLowerCase()))
  .map((m) => `docs/index.html: "${m[0].replace(/\s+/g, " ").trim()}" — the panel's button reads "${paneNew}"`);
ok(`docs/index.html: Help names the Data panel's add control "${paneNew}", not a control it lacks`,
  !helpPaneNew.length, [...new Set(helpPaneNew)].join("\n      "));

// 18. THE APP'S OWN COPY — the last document in this family, and the one every other check has
//     been correcting the others TO. Checks 16 and 17 held the tours and Help to the pane's
//     rendered name; nothing held the BUILDER to it, and it turned out to be the worst offender
//     of the three. app/index.html's markup had been updated at STUDIO-PANELS (header, collapsed
//     rail, tooltips, the empty canvas's "Open data panel" button all read Data) — but every
//     string the builder RENDERS AT RUNTIME was missed: the phone drawer's tab bar said
//     "Library", Simple mode's getting-started checklist opened on "Library ready", the
//     inspector's empty-state hints, the ⌘/Ctrl+F shortcut row, the What's-next card and the
//     canvas empty state inside the preview iframe ("the <b>Query Library</b>" — the exact
//     id-flavoured name check 17 had just deleted from Help) all said library too. So the rule
//     that finished Help finishes the app, one document over again, and this time in the
//     direction the other checks read FROM: outside an identifier, the word must not appear.
//       · Scope is the copy a reader can see: string literals in the builder's two rendering
//         modules (comments skipped by the lexer, so this file's own prose and studio.js's
//         historical notes can neither fail nor satisfy it), plus index.html's TEXT NODES —
//         tags stripped, so `id="library"`/`data-pane="library"` are structurally out of reach
//         and the markup keeps its id without an exemption list.
//       · Identifiers are exempt by SHAPE, not by name: a literal with no whitespace that
//         starts lowercase is a selector, storage key or switch value ("#library",
//         "studio-collapse-library", the `which === "library"` argument). "Library" the tab
//         label does not qualify — copy is capitalised or spaced, which is the whole point.
//       · The one legitimate library is check 14's derived saved-chart one ("Save to View
//         library" is a real button), exempted the same derived way check 17 does it.
const APP_COPY_JS = ["app/studio.js", "app/studio-render.js"];
// A small lexer rather than a comment-strip + literal-grep: matching comments and strings in the
// SAME left-to-right pass is what keeps a "//" inside a URL from eating the rest of its string,
// and a quote inside a comment from opening a phantom one.
const jsLiterals = (f) => [...read(f).matchAll(
  /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g)]
  .map((m) => m[0]).filter((s) => s[0] === '"' || s[0] === "'").map((s) => s.slice(1, -1));
const IDENTIFIERISH = /^[#.]?[a-z][\w.:>[\]="-]*$/;   // no whitespace, lowercase start
const dropSavedLib = (s) => s.replace(new RegExp(`${esc(savedNoun)}\\s+librar(?:y|ies)`, "gi"), " ");
const strayAppCopy = [
  ...APP_COPY_JS.flatMap((f) => jsLiterals(f)
    .filter((s) => !IDENTIFIERISH.test(s))
    .filter((s) => /librar(?:y|ies)/i.test(dropSavedLib(s)))
    .map((s) => `${f}: "…${s.replace(/\s+/g, " ").trim().slice(0, 96)}…"`)),
  ...[...dropSavedLib(appHtml.replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]*>/g, " "))
    .matchAll(/[^.]*librar(?:y|ies)[^.]*/gi)]
    .map((m) => `app/index.html: "…${m[0].replace(/\s+/g, " ").trim().slice(0, 96)}…"`),
];
ok(`app/studio.js + app/studio-render.js + app/index.html: the builder's own copy calls the left ` +
  `pane "${dataPaneName}" — the only library the app may name is the "${savedNoun} library"`,
  !strayAppCopy.length, strayAppCopy.join("\n      "));
ok("tools/doc-truth.mjs: the builder copy parsed for check 18 is non-empty",
  APP_COPY_JS.every((f) => jsLiterals(f).filter((s) => !IDENTIFIERISH.test(s)).length > 50),
  APP_COPY_JS.map((f) => `${f}: ${jsLiterals(f).filter((s) => !IDENTIFIERISH.test(s)).length} copy literals`).join(" · "));

// 19. Checks 16–18 all asked whether the builder's panes are NAMED correctly. This one asks
//     whether the tour that walks them can SEE them — the same STUDIO-PANELS change that
//     renamed the pane also made it start closed, and the tour kept ringing it regardless: a
//     34px collapsed rail on desktop, and at ≤640px a drawer parked at translateX(±105%), i.e.
//     a spotlight outside the viewport. The fix is declarative (a step's `pane:`), so it can
//     rot the same way the copy did — a new builder step, or a new pane, would simply forget
//     it. Three rules, every fact derived:
//       (a) COVERAGE — a build-tour step whose `target` is one of app/index.html's collapsible
//           <aside class="pane"> ids must declare that same id as its `pane`.
//       (b) VOCABULARY — every `pane:` any tour declares must be a pane the builder can
//           actually open, read off setupMobileTabs()'s own tab ids (library/canvas/inspector)
//           rather than a list kept here.
//       (c) THE OPENER — app/studio.js must still expose __studioOpenPane; without it
//           tutorial.js's openPane() degrades to a silent no-op and (a) passes while every
//           spotlight goes back to ringing a closed pane.
const collapsiblePanes = [...appHtml.matchAll(/<aside id="(\w+)" class="pane">/g)].map((m) => m[1]);
ok("app/index.html: the builder's collapsible panes parsed for check 19 are non-empty",
  collapsiblePanes.length >= 2, `parsed: ${collapsiblePanes.join(" · ") || "(none)"}`);
const buildSteps = buildBlock.split(/\n        \{/).slice(1);
const missingPane = buildSteps
  .map((s) => ({
    target: (s.match(/target:\s*"#(\w+)"/) || [])[1],
    pane: (s.match(/\bpane:\s*"(\w+)"/) || [])[1],
    title: (s.match(/\bt:\s*"([^"]*)"/) || [])[1] || "(untitled)",
  }))
  .filter((s) => s.target && collapsiblePanes.includes(s.target) && s.pane !== s.target)
  .map((s) => `"${s.title}" targets #${s.target} but declares pane: ${s.pane ? `"${s.pane}"` : "(none)"}`);
ok(`app/tutorial.js: every build-tour step spotlighting a collapsible pane (${collapsiblePanes.join(", ")}) opens it first`,
  !missingPane.length,
  `${missingPane.join("\n      ")}\n      a closed pane is a 34px rail on desktop and off-canvas at 390px — the ring lands on nothing`);
const mobTabIds = [...(fnBody(studioJs, "setupMobileTabs").match(/var TABS = \[[\s\S]*?\];/) || [""])[0]
  .matchAll(/\bid:\s*"(\w+)"/g)].map((m) => m[1]);
ok("app/studio.js: the builder's openable panes parsed for check 19 are non-empty",
  mobTabIds.length >= 3, `parsed: ${mobTabIds.join(" · ") || "(none)"}`);
const strayPaneNames = [...tutorialSrc.matchAll(/\bpane:\s*"(\w+)"/g)].map((m) => m[1])
  .filter((p) => !mobTabIds.includes(p));
ok(`app/tutorial.js: every declared pane is one the builder can open (${mobTabIds.join(", ")})`,
  !strayPaneNames.length, `unknown: ${[...new Set(strayPaneNames)].join(", ")}`);
ok("app/studio.js: __studioOpenPane — the opener app/tutorial.js's steps depend on — still exists",
  /window\.__studioOpenPane\s*=/.test(studioJs),
  "without it openPane() is a no-op and every builder spotlight silently goes back to ringing a closed pane");

// 20. Check 19 asked whether the tour can SEE the panes it walks. This asks the same question
//     of the controls it walks, where the phone's answer is different in kind: a collapsed pane
//     is merely shut, but M10 moved Undo/Redo/Open/Save/Save-as/Duplicate/Export off the ≤640px
//     topbar into ⋯ More and hides their buttons with `display:none!important`, so at 390px they
//     are not on the screen at all. The build tour's export step kept targeting #btnExport
//     regardless: waitFor() polled a zero-box element for its full 2.5s, gave up, and rendered
//     an unringed centered card still saying "Click Export ▾" and "Save" — two controls that
//     screen does not have, after a two-and-a-half-second stall. The fix is declarative (a
//     step's `phone:` form), so it rots exactly the way check 19's `pane:` could — the NEXT
//     control to join the ⋯ More convention would silently leave a tour ringing thin air.
//     Three rules, every fact derived:
//       (a) COVERAGE — a build-tour step whose `target` is an id the phone stylesheet hides must
//           carry a `phone:` form that retargets it.
//       (b) THE PHONE TARGET IS REALLY THERE — that form's own target must not itself be in the
//           hidden set (swapping one invisible control for another fixes nothing), and must be
//           an element app/index.html actually has.
//       (c) THE MERGER — app/tutorial.js must still resolve `phone:` at render time; without
//           resolveStep() the overrides are inert data and (a) passes while the ring goes back
//           to being measured on a display:none box.
//     The hidden set is read off app/studio.css's own phone media blocks rather than a list kept
//     here, so this check learns about a newly hidden control the moment the stylesheet does.
const phoneHiddenIds = (() => {
  const css = read("app/studio.css");
  const out = new Set();
  const at = /@media([^{]*)\{/g;
  let m;
  while ((m = at.exec(css))) {
    // Only the PHONE bands — 640px is the gate width, 400px the narrower band nested under it.
    if (!/max-width:\s*(640|400)px/.test(m[1])) continue;
    let depth = 1, i = at.lastIndex;
    for (; i < css.length && depth; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
    }
    const block = css.slice(at.lastIndex, i - 1).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const rule of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/display\s*:\s*none\s*!important/.test(rule[2])) continue;
      for (const sel of rule[1].split(",")) {
        const id = /^#([\w-]+)$/.exec(sel.trim());
        if (id) out.add(id[1]);
      }
    }
  }
  return out;
})();
ok("app/studio.css: the controls the phone layout hides outright, parsed for check 20, are non-empty",
  phoneHiddenIds.size >= 4, `parsed: ${[...phoneHiddenIds].join(" · ") || "(none)"}`);
const phoneBlind = buildSteps
  .map((s) => ({
    target: (s.match(/target:\s*"#([\w-]+)"/) || [])[1],
    phoneTarget: (s.match(/\bphone:\s*\{[\s\S]*?\btarget:\s*"#([\w-]+)"/) || [])[1],
    hasPhone: /\bphone:\s*\{/.test(s),
    title: (s.match(/\bt:\s*"([^"]*)"/) || [])[1] || "(untitled)",
  }))
  .filter((s) => s.target && phoneHiddenIds.has(s.target))
  .map((s) => {
    if (!s.hasPhone || !s.phoneTarget) return `"${s.title}" targets #${s.target}, which is display:none at ≤640px, with no phone: form`;
    if (phoneHiddenIds.has(s.phoneTarget)) return `"${s.title}" retargets #${s.target} to #${s.phoneTarget}, which the phone hides too`;
    if (!appHtml.includes(`id="${s.phoneTarget}"`)) return `"${s.title}" retargets to #${s.phoneTarget}, which app/index.html does not have`;
    return null;
  })
  .filter(Boolean);
ok(`app/tutorial.js: every build-tour step spotlighting a phone-hidden control (${[...phoneHiddenIds].join(", ")}) has a phone: form that points somewhere real`,
  !phoneBlind.length,
  `${phoneBlind.join("\n      ")}\n      a display:none target has no box — waitFor polls it for 2.5s and the card renders with no spotlight at all`);
ok("app/tutorial.js: resolveStep — the merger those phone: forms depend on — is still applied per render",
  /function resolveStep\s*\(/.test(tutorialSrc) && /var step = resolveStep\(/.test(tutorialSrc),
  "without it a phone: form is inert data: the ring goes back to being measured on a display:none box");

// 21. Check 20 asked whether the TOUR can see the controls it walks. This asks the same of
//     HELP — the check-16→17 move, one document over, and the same answer: it could not.
//     docs/index.html documented the builder entirely in the desktop's terms. "Click Export ▾
//     in the topbar", "Save (Ctrl S)", "Open — picks a dashboard", "the ↶/↷ buttons in the
//     topbar" — nine sentences pointing at nine buttons that M10 hides outright below 640px,
//     with the phone's actual route (⋯ More) named nowhere. Help's ONE nod to the convention
//     was Send feedback's paragraph, written when TOPBAR-TITLE moved that single icon; the
//     eight controls Slice B/C had already moved got nothing. A reader on a phone was told to
//     click something their screen does not have, by the document they opened BECAUSE they
//     could not find it.
//     Check 13 deliberately left docs/index.html out of scope ("its prose takes deliberate
//     liberties an exact label match would false-positive on") — that turned out to be
//     unfounded: its resolver consumes a label and stops, so "⋯ More → Simple mode off"
//     resolves on "Simple mode" and the trailing word is simply not part of the route. So Help
//     comes into scope here, with the same resolver. Three rules, every fact derived:
//       (a) COVERAGE — every control the phone hides that has a ⋯ More counterpart must have
//           its route NAMED in Help, by the counterpart's own menu label. Move the next button
//           behind ⋯ More and Help is required to say so.
//       (b) THE ROUTE RESOLVES — every "⋯ More → X" Help writes must be an entry #menuMore
//           really has (check 13's rule, one document over).
//       (c) THE CONVENTION IS INTACT — each counterpart must be a `more-phone-only` button, and
//           the stylesheet must reveal that class in THE SAME media band that hides the topbar
//           button. Hide at ≤640px but reveal at ≤400px and every route above is a lie for
//           400-640px phones, while (a) and (b) both still pass.
const moreById = (() => {
  const start = appHtml.indexOf('<div class="menu" id="menuMore">');
  if (start < 0) throw new Error("doc-truth: #menuMore not found in app/index.html");
  const nextWrap = appHtml.indexOf('<div class="menu-wrap"', start + 1);
  const block = appHtml.slice(start, nextWrap > -1 ? nextWrap : appHtml.length)
    .replace(/<!--[\s\S]*?-->/g, "");
  const out = new Map();
  for (const m of block.matchAll(/<button([^>]*)\bid="(\w+)"([^>]*)>([^<]+)<\/button>/g)) {
    out.set(m[2], { label: m[4], phoneOnly: /more-phone-only/.test(m[1] + m[3]) });
  }
  return out;
})();
// The pairing is the M10 naming convention itself: the topbar's #btnExport / #tbFeedback is
// mirrored by ⋯ More's #moreExport / #moreFeedback. Derived, so a control that joins the
// convention is picked up the moment it is named that way — and one that does NOT have a
// counterpart (#tbTheme, whose answer is the rail drawer, not the menu) is simply not in scope.
const morePairs = [...phoneHiddenIds]
  .map((id) => ({ id, more: "more" + id.replace(/^(btn|tb)/, "") }))
  .filter((p) => moreById.has(p.more));
ok("app/index.html: the topbar→⋯More pairings parsed for check 21 are non-empty",
  morePairs.length >= 6,
  `paired: ${morePairs.map((p) => `#${p.id}→#${p.more}`).join(" · ") || "(none)"}`);
const helpRouteText = norm(read("docs/index.html")
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&(?:rsquo|#8217);/g, "'"));
const undocumentedRoutes = morePairs
  .filter((p) => !helpRouteText.includes(norm(`⋯ More → ${moreById.get(p.more).label}`)))
  .map((p) => `#${p.id} is display:none at ≤640px; its route is "⋯ More → ` +
    `${moreById.get(p.more).label.trim()}", which docs/index.html never names`);
ok(`docs/index.html: every control the phone hides behind ⋯ More (${morePairs.map((p) => p.id).join(", ")}) ` +
  `has its phone route documented`,
  !undocumentedRoutes.length,
  `${undocumentedRoutes.join("\n      ")}\n      Help is what a reader opens BECAUSE the button is not where it says — it must name the route they have`);
const badHelpRoutes = unresolvedRoutes(helpRouteText, norm("⋯ More"), MORE_L, "entry in #menuMore", "docs/index.html");
ok("docs/index.html: every ⋯ More route Help names is an entry #menuMore really has",
  !badHelpRoutes.length, badHelpRoutes.join("\n      "));
const notPhoneOnly = morePairs.filter((p) => !moreById.get(p.more).phoneOnly)
  .map((p) => `#${p.more} is not .more-phone-only, so it does not appear when #${p.id} disappears`);
ok("app/index.html: every ⋯ More counterpart is a .more-phone-only entry",
  !notPhoneOnly.length, notPhoneOnly.join("\n      "));
// The bands must be the same one. app/index.html's own comment claimed the reveal happens at
// ≤400px while M10 moved the hide to ≤640px — had the stylesheet ever matched that comment,
// every route documented above would have been wrong for a 480px phone, silently.
const bands = (() => {
  const css = read("app/studio.css");
  const at = /@media([^{]*)\{/g;
  let m, hides = new Map(), reveals = null;
  while ((m = at.exec(css))) {
    const cond = m[1].replace(/\s+/g, "");
    let depth = 1, i = at.lastIndex;
    for (; i < css.length && depth; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
    }
    const block = css.slice(at.lastIndex, i - 1).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const rule of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sels = rule[1].split(",").map((s) => s.trim());
      if (/display\s*:\s*none/.test(rule[2])) {
        for (const s of sels) { const id = /^#([\w-]+)$/.exec(s); if (id) hides.set(id[1], cond); }
      }
      if (sels.includes(".more-phone-only") && /display\s*:\s*(block|flex)/.test(rule[2])) reveals = cond;
    }
  }
  return { hides, reveals };
})();
const bandMismatch = morePairs.filter((p) => bands.hides.get(p.id) !== bands.reveals)
  .map((p) => `#${p.id} hides at "${bands.hides.get(p.id)}" but .more-phone-only is revealed at "${bands.reveals}"`);
ok(`app/studio.css: ⋯ More reveals its phone-only entries in the same band that hides the topbar buttons (${bands.reveals || "(never revealed)"})`,
  !!bands.reveals && !bandMismatch.length,
  `${bandMismatch.join("\n      ")}\n      a gap between the two bands is a width where the control is in neither place and Help's route is a lie`);

// 22. Checks 16–21 held the tours and Help accountable to the BUILDER's controls. This asks
//     the same question of the CATALOGS, and got the same answer. Every catalog section grew a
//     three-control toolbar beside its search box — a sort <select> (AUD-06's shared
//     Studio.catalogSort), a tile ⇆ list toggle (Studio.catalogView, remembered per device),
//     and a Select button that turns the rows into checkboxes with a bulk Select all / Clear /
//     Move to folder… / Delete bar (LIVE-d slices 1–5). The two tours that WALK those sections
//     never caught up: both still described a search box and folder chips and stopped there, so
//     a reader could finish the Jobs tour without ever learning the app can bulk-delete, or that
//     the list they are looking at has a tile form.
//     Every fact is derived. WHICH sections carry the toolbar comes from app/index.html's own
//     `.repo-io` rows; WHICH tours are in scope comes from the goSection() calls those tours
//     actually make (so a tour that starts walking a catalog is picked up the day it does, and
//     the builder/Home tours are simply not in scope); and the word each control must be named
//     by comes from the control itself — the <select>'s aria-label, the pair of labels
//     catalogView.wire() sets at runtime, and the button's own text. Add a fourth control to
//     `.repo-io` and this check says nothing; add one the tours must explain and it does.
//     Deliberately scoped to the TOOLBAR: the per-row controls (the `private` toggle, the row
//     actions) are a different component with a different blast radius, and are derived by
//     check 24 below instead.
const REPO_IO_SUFFIXES = ["SortSel", "ViewToggle", "SelectBtn"];
const CONTROL_WHAT = {
  SortSel: "the sort dropdown",
  ViewToggle: "the tile ⇆ list toggle",
  SelectBtn: "the Select / bulk-actions toggle",
};
const suffixOf = (id) => REPO_IO_SUFFIXES.find((s) => id.endsWith(s));
// section slug (the goSection() name) → the toolbar control ids it carries.
const repoIoControls = (() => {
  const out = new Map();
  const secRe = /<section id="sec([A-Za-z]+)"/g;
  let m;
  while ((m = secRe.exec(appHtml))) {
    const next = appHtml.indexOf('<section id="sec', m.index + 1);
    const block = appHtml.slice(m.index, next > -1 ? next : appHtml.length).replace(/<!--[\s\S]*?-->/g, "");
    if (!block.includes('<div class="repo-io">')) continue;
    const ids = [...block.matchAll(/\bid="(\w+)"/g)].map((x) => x[1]).filter(suffixOf);
    if (ids.length) out.set(m[1].toLowerCase(), ids);
  }
  return out;
})();
ok("app/index.html: the catalog toolbars parsed for check 22 are non-empty",
  repoIoControls.size >= 4,
  [...repoIoControls].map(([s, ids]) => `${s}: ${ids.join(", ")}`).join(" · ") || "(none)");
// The toggle's label is assigned at runtime, so it is read from the kit that assigns it —
// "List view" while you are reading a list, "Tile view" while you are looking at tiles.
const viewToggleWords = (() => {
  const m = studioJs.match(/tiles \? "([^"]*view)" : "([^"]*view)"/i);
  if (!m) throw new Error("doc-truth: Studio.catalogView.wire no longer sets a List/Tile view label pair");
  return [m[1], m[2]].map((l) => l.split(/\s+/)[0].toLowerCase());
})();
ok("app/studio.js: the tile ⇆ list toggle's own labels, parsed for check 22, are non-empty",
  viewToggleWords.length === 2 && viewToggleWords.every(Boolean), viewToggleWords.join(" / "));
function controlWords(id) {
  const suffix = suffixOf(id);
  if (suffix === "ViewToggle") return viewToggleWords;
  const tag = suffix === "SortSel" ? "select" : "button";
  const el = appHtml.match(new RegExp(`<${tag}[^>]*\\bid="${id}"[^>]*>`));
  if (!el) return [];
  // A <select> is populated by catalogSort.wire(), so it names itself in aria-label; a
  // <button> carries its own text.
  const src = suffix === "SortSel"
    ? (el[0].match(/aria-label="([^"]+)"/) || [])[1]
    : (appHtml.match(new RegExp(`<button[^>]*\\bid="${id}"[^>]*>([^<]*)</button>`)) || [])[1];
  return src ? [src.trim().split(/\s+/)[0].toLowerCase()] : [];
}
// Every tour definition, brace-matched — the same idiom check 19 uses for the build tour.
const tourBlocks = (() => {
  const out = new Map();
  const re = /^ {4}(\w+): \{$/gm;
  let m;
  while ((m = re.exec(tutorialSrc))) {
    let depth = 0, open = tutorialSrc.indexOf("{", m.index), i = open;
    for (; i < tutorialSrc.length; i++) {
      if (tutorialSrc[i] === "{") depth++;
      else if (tutorialSrc[i] === "}" && --depth === 0) break;
    }
    const block = tutorialSrc.slice(open, i + 1);
    if (/\blabel:\s*"/.test(block) && /\bsteps:\s*\[/.test(block)) out.set(m[1], block);
  }
  return out;
})();
ok("app/tutorial.js: the tour definitions parsed for check 22 are non-empty",
  tourBlocks.size >= 5, `parsed: ${[...tourBlocks.keys()].join(" · ") || "(none)"}`);
// Only the COPY — a step's t/h/sub and the tour's blurb. Comments are stripped (check 12's
// lesson) and selectors are excluded on purpose: `target: "#connSelectBtn"` must not be able to
// satisfy a requirement to explain what Select does.
const tourCopy = (src) => [...src
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
  .matchAll(/\b(?:t|h|sub|blurb):\s*("(?:[^"\\]|\\.)*"(?:\s*\+\s*"(?:[^"\\]|\\.)*")*)/g)]
  .map((m) => m[1]).join(" ").replace(/<[^>]+>/g, " ");
const catalogTourGaps = [];
const catalogTours = [];
for (const [key, src] of tourBlocks) {
  const walks = [...new Set([...src.matchAll(/goSection\("(\w+)"\)/g)].map((m) => m[1]))]
    .filter((s) => repoIoControls.has(s));
  if (!walks.length) continue;
  catalogTours.push(`${key} → ${walks.join(" + ")}`);
  const copy = tourCopy(src);
  const need = new Map();
  for (const sec of walks)
    for (const id of repoIoControls.get(sec))
      for (const w of controlWords(id))
        if (!need.has(w)) need.set(w, `${CONTROL_WHAT[suffixOf(id)]} (#${id}, in ${sec})`);
  for (const [w, whence] of need)
    if (!new RegExp(`\\b${w}\\b`, "i").test(copy))
      catalogTourGaps.push(`the "${key}" tour walks ${walks.join(" + ")} but its copy never says ` +
        `"${w}" — ${whence}`);
}
ok("app/tutorial.js: the catalog-walking tours parsed for check 22 are non-empty",
  catalogTours.length >= 2, `in scope: ${catalogTours.join(" · ") || "(none)"}`);
ok(`app/tutorial.js: every tour that walks a catalog names that catalog's whole toolbar (${catalogTours.join(", ")})`,
  !catalogTourGaps.length,
  `${catalogTourGaps.join("\n      ")}\n      a tour is the one place a reader is TOLD what the section can do — an unnamed control is one they will never find`);

/* ── 23. the sample-pack tour vs what the pack actually seeds ───────────────
   A per-feature tour is the one place a reader is TOLD what they were given, and the
   Conservation Insight pack has grown a lot since its tour was written (CONS-1/2/3 added
   five more dashboards, and CONS-4 pinned a View per practice to Home) while the copy
   still described "connections, datasets, a prep job, and one FEATURED dashboard". The
   source of truth is `installConservationWorkspace()` in app/demopacks.js: every
   `W.put("<table>", …)` it makes is something the reader now owns. Same move as check 22,
   one document over — the tour must name every KIND it seeded, must not describe a set of
   dashboards in the singular, and must name the practices and the folder it filed them in. */
const packSrc = read("app/demopacks.js");
// The user-facing noun for each workspace table (LF57: an "analysis" row renders as a View).
const PACK_TABLE_NOUN = { connections: "connection", datasets: "dataset", jobs: "job",
  analyses: "View", dashboards: "dashboard" };
const packTables = [...new Set([...packSrc.matchAll(/W\.put\("(\w+)"/g)].map((m) => m[1]))].sort();
const packDashboardNames = [...new Set([...packSrc.matchAll(/name:\s*"(conservation-[\w-]+)"/g)].map((m) => m[1]))];
const packPractices = (() => {
  const m = packSrc.match(/var PRACTICES = \[([\s\S]*?)\];/);
  return m ? [...m[1].matchAll(/label:\s*"([^"]+)"/g)].map((x) => x[1]) : [];
})();
// SP-0: the folder moved onto the registry entry (it used to be a `var PACK_FOLDER`
// literal here AND a second one in studio.js). Parse it out of the conservation entry.
const packFolder = (() => {
  const entry = packSrc.match(/conservation:\s*\{([\s\S]*?)\n    \},/);
  return entry ? (entry[1].match(/folder:\s*"([^"]+)"/) || [])[1] : undefined;
})();
const packTourCopy = tourCopy(tourBlocks.get("conservation") || "");
ok("app/demopacks.js: the conservation pack's seeded inventory parsed for check 23 is non-empty",
  packTables.length >= 4 && packDashboardNames.length > 1 && packPractices.length >= 2 && !!packFolder &&
    packTables.every((t) => PACK_TABLE_NOUN[t]) && !!packTourCopy,
  `tables: ${packTables.join(", ") || "(none)"} · dashboards: ${packDashboardNames.length} · ` +
  `practices: ${packPractices.join(", ") || "(none)"} · folder: ${packFolder || "(none)"}` +
  `\n      an unmapped table means the pack seeds a KIND nobody has given a user-facing noun — add it to PACK_TABLE_NOUN`);
const packTourGaps = [];
for (const t of packTables)
  // "View" is a proper noun (LF57) and must be matched as one — case-insensitively, the
  // pre-fix copy's "the hero view" satisfied a requirement to name the pinned Views.
  if (!new RegExp(`\\b${PACK_TABLE_NOUN[t]}s?\\b`, /^[A-Z]/.test(PACK_TABLE_NOUN[t]) ? "" : "i").test(packTourCopy))
    packTourGaps.push(`the pack seeds ${t} but the tour copy never says "${PACK_TABLE_NOUN[t]}"`);
if (packDashboardNames.length > 1 && !/\bdashboards\b/i.test(packTourCopy))
  packTourGaps.push(`the pack seeds ${packDashboardNames.length} dashboards (${packDashboardNames.join(", ")}) ` +
    `but the tour copy only ever says "dashboard" in the singular — a reader is told they got one`);
for (const p of packPractices)
  if (!new RegExp(`\\b${p.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i").test(packTourCopy))
    packTourGaps.push(`the pack pins a View for "${p}" but the tour copy never names it`);
if (packFolder && !packTourCopy.includes(packFolder))
  packTourGaps.push(`the pack files its dashboards in the "${packFolder}" folder but the tour copy never names it`);
ok("app/tutorial.js: the Conservation Insight tour names everything the pack actually seeds (kinds, practices, folder)",
  !packTourGaps.length,
  `${packTourGaps.join("\n      ")}\n      the pack tour is the only place a reader is told what installing it gave them`);

/* ── 24. the catalog tours vs each catalog ROW's own controls ───────────────
   Check 22's other half. That check derives the catalog TOOLBAR and says in its own header
   that the per-row controls are a different component, not derived there — this is that
   component. The row is where the work actually happens: you Test a connection, Run a job,
   pin the dataset you open twenty times a day. The v889 pass named exactly ONE of those
   controls (`private`) in each of its two list stops and left the rest tour-silent, so a
   reader could finish the Jobs tour without ever learning that a job runs from its own row.

   Every fact is derived, the same way check 22 derives its own. WHICH sections have a row
   renderer worth explaining is the map below (one catalog module each); WHAT that row
   carries comes from the module's own `var actions = '<span class="cx-actions">'` block —
   each button's visible text, or its aria-label when the button is a glyph like ✕ — plus
   whichever of the `cx-pin` / `cx-private` toggles it renders beside them (Jobs has no pin;
   the check notices that rather than being told); and WHICH tours are in scope comes from
   the goSection() calls those tours actually make.

   The requirement is deliberately STRICTER than check 22's bare word: the tour must name
   the control the way this file names controls everywhere else — in BOLD, `<b>Run</b>` —
   which is the check-14 idiom. A bare-word rule is not good enough here, because the Jobs
   tour already says "a status dot for their last run": that is prose ABOUT runs, and it
   would satisfy a requirement to explain a Run button the reader has still never been told
   exists. */
const CATALOG_ROW_MODULES = {
  jobs: "app/jobs.js", connections: "app/connections.js", datasets: "app/datasets.js",
};
// The two toggles that ride beside the action buttons, and the word each is named by. A
// module gets a requirement only if it actually renders that class.
const ROW_TOGGLE_WORD = { "cx-pin": "Pin", "cx-private": "private" };
function rowControls(file) {
  const src = read(file);
  const marker = "var actions = '<span class=\"cx-actions\">'";
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`doc-truth: ${file} no longer builds its row actions as ` +
    `\`${marker}\` — check 24 cannot derive what the row carries`);
  const block = src.slice(start, src.indexOf("</span>'", start));
  const actions = block.split("\n").filter((l) => l.includes("<button")).map((line) => {
    // A button that says "Run" names itself; the delete ✕ is a glyph, so it is named by the
    // aria-label it already carries for exactly the same reason (a screen reader needs a word).
    const text = ((line.match(/">([^<']*)<\/button>/) || [])[1] || "").trim();
    if (/^[A-Za-z]+$/.test(text)) return text;
    const aria = (line.match(/aria-label="([A-Za-z]+)/) || [])[1];
    if (!aria) throw new Error(`doc-truth: a row action button in ${file} has neither word text ` +
      `nor an aria-label to name it — ${line.trim()}`);
    return aria;
  });
  const toggles = Object.entries(ROW_TOGGLE_WORD)
    .filter(([cls]) => src.includes(`class="${cls}`)).map(([, w]) => w);
  return { actions, toggles };
}
const rowControlsBySection = new Map(
  Object.entries(CATALOG_ROW_MODULES).map(([sec, f]) => [sec, { file: f, ...rowControls(f) }]));
ok("the catalog modules' per-row controls parsed for check 24 are non-empty",
  [...rowControlsBySection.values()].every((r) => r.actions.length >= 2) &&
    [...rowControlsBySection.values()].some((r) => r.toggles.length === 2),
  [...rowControlsBySection].map(([s, r]) =>
    `${s}: ${[...r.actions, ...r.toggles].join(", ") || "(none)"}`).join(" · "));
// Check 22's tourCopy strips markup, because a bare word was all it asked for. This one asks
// for the bolded control name, so the markup is what it must keep — concatenated string
// literals are joined first so a <b> split across a `+` still reads as one tag.
const tourCopyMarkup = (src) => [...src
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
  .matchAll(/\b(?:t|h|sub|blurb):\s*("(?:[^"\\]|\\.)*"(?:\s*\+\s*"(?:[^"\\]|\\.)*")*)/g)]
  .map((m) => m[1]).join(" ").replace(/"\s*\+\s*"/g, "");
const rowTourGaps = [];
const rowTours = [];
for (const [key, src] of tourBlocks) {
  const walks = [...new Set([...src.matchAll(/goSection\("(\w+)"\)/g)].map((m) => m[1]))]
    .filter((s) => rowControlsBySection.has(s));
  if (!walks.length) continue;
  rowTours.push(`${key} → ${walks.join(" + ")}`);
  const copy = tourCopyMarkup(src);
  const need = new Map();
  for (const sec of walks) {
    const r = rowControlsBySection.get(sec);
    for (const w of r.actions)
      if (!need.has(w.toLowerCase())) need.set(w.toLowerCase(), `the row's ${w} button (${r.file}, in ${sec})`);
    for (const w of r.toggles)
      if (!need.has(w.toLowerCase())) need.set(w.toLowerCase(), `the row's ${w} toggle (${r.file}, in ${sec})`);
  }
  for (const [w, whence] of need)
    if (!new RegExp(`<b>\\s*${w}\\b[^<]*</b>`, "i").test(copy))
      rowTourGaps.push(`the "${key}" tour walks ${walks.join(" + ")} but its copy never names ` +
        `<b>${w}</b> — ${whence}`);
}
ok("app/tutorial.js: the catalog-walking tours parsed for check 24 are non-empty",
  rowTours.length >= 2, `in scope: ${rowTours.join(" · ") || "(none)"}`);
ok(`app/tutorial.js: every tour that walks a catalog names that catalog ROW's own controls (${rowTours.join(", ")})`,
  !rowTourGaps.length,
  `${rowTourGaps.join("\n      ")}\n      the row is where the work happens — an unnamed row control is one the reader will never find`);

/* ── 25. the workspace schema version vs docs/COMPAT.md's history ───────────
   N18. `WS.SCHEMA_VERSION` is the one number that says what shape a workspace has, and
   the same database gets opened by builds on either side of a bump — so the rules for
   moving it (docs/COMPAT.md) only work if moving it without writing them down is
   IMPOSSIBLE, not merely discouraged. That is what this check is: the bump checklist's
   step 5 with teeth.

   It is deliberately NOT a git-diff ("did this commit touch both files?") — a rebase, a
   squash or a revert would each defeat that. It is a standing invariant instead: the
   history table must describe the version the code is at, right now, in any checkout.
   Bump the constant and the gate goes red until the row exists; the failure names both
   numbers, so the fix is never a puzzle.

   The table-name half catches the subtler miss — a bump whose row exists but says
   nothing about what it added, which is the row a future reader needs most. */
const compat = read("docs/COMPAT.md");
const schemaSrc = read("app/sources/schema.js");
const schemaVersion = Number((/WS\.SCHEMA_VERSION\s*=\s*(\d+)/.exec(schemaSrc) || [])[1]);
// The table registry, brace-free: the array literal's own `name: "…"` entries.
const wsTablesBlock = schemaSrc.slice(schemaSrc.indexOf("WS.WORKSPACE_TABLES = ["),
  schemaSrc.indexOf("];", schemaSrc.indexOf("WS.WORKSPACE_TABLES = [")));
const wsTables = [...wsTablesBlock.matchAll(/name:\s*"(\w+)"/g)].map((m) => m[1]);
// History rows are the `| **vN** | …` lines of §3 — the file's one machine-read shape.
const compatRows = [...compat.matchAll(/^\| \*\*v(\d+)\*\* \|(.*)$/gm)]
  .map((m) => ({ v: Number(m[1]), text: m[2] }));

ok("tools/doc-truth.mjs: the schema constant, the table registry and docs/COMPAT.md's history parsed for check 25 are non-empty",
  schemaVersion > 0 && wsTables.length >= 3 && compatRows.length > 0,
  `WS.SCHEMA_VERSION=${schemaVersion || "(unparsed)"} · tables: ${wsTables.join(", ") || "(none)"} · ` +
  `history rows: ${compatRows.map((r) => "v" + r.v).join(", ") || "(none)"}`);

const expectedRows = Array.from({ length: schemaVersion }, (_, i) => i + 1);
ok(`docs/COMPAT.md: the history has a row for every workspace version 1…${schemaVersion}, and none beyond it`,
  compatRows.map((r) => r.v).join(",") === expectedRows.join(","),
  `app/sources/schema.js says WS.SCHEMA_VERSION = ${schemaVersion}; COMPAT.md documents ` +
  `${compatRows.map((r) => "v" + r.v).join(", ") || "nothing"}\n      ` +
  "bumping the version is a same-PR ritual — add the history line (docs/COMPAT.md § 2, step 5)");

const undocumentedTables = wsTables.filter((t) =>
  !compatRows.some((r) => new RegExp("`" + t + "`").test(r.text)));
ok("docs/COMPAT.md: every workspace table is named by the history row of the version that added it",
  !undocumentedTables.length,
  `never named in a history row: ${undocumentedTables.join(", ")}\n      ` +
  "a version line that does not say what it added is the line a future reader needs and cannot use");

// The hand-written SQL artifacts don't derive from schema.js, so they drift (the N2
// slice-2 class). Any of them that stamps the marker must stamp THIS version. One that
// doesn't stamp at all is out of scope here and recorded in COMPAT.md § 3.
const sqlStamps = [
  "tools/supabase-deploy.sql", "tools/supabase-rls-real.sql",
  "tools/supabase-bootstrap.sql", "supabase/functions/polecat-admin/sql.ts",
].map((rel) => ({ rel, v: Number((/VALUES \('schema_version', '(\d+)'\)/.exec(read(rel)) || [])[1]) }))
  .filter((s) => s.v);
ok(`the hand-written provision SQL stamps schema v${schemaVersion}, the version app/sources/schema.js is at`,
  sqlStamps.length > 0 && sqlStamps.every((s) => s.v === schemaVersion),
  sqlStamps.map((s) => `${s.rel} stamps v${s.v}`).join(" · ") || "no artifact stamps the marker at all");

ok("CLAUDE.md sends anyone touching WS.SCHEMA_VERSION or the workspace DDL to docs/COMPAT.md",
  /docs\/COMPAT\.md/.test(read("CLAUDE.md")),
  "the pointer is how the contract gets read at all — it is part of the contract");

console.log(failed ? `\n✗ doc-truth: ${failed} claim(s) have drifted from the source of truth`
  : "\n✅ doc-truth: every published claim matches the source it describes");
process.exit(failed ? 1 : 0);
