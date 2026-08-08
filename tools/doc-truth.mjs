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

console.log(failed ? `\n✗ doc-truth: ${failed} claim(s) have drifted from the source of truth`
  : "\n✅ doc-truth: every published claim matches the source it describes");
process.exit(failed ? 1 : 0);
