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

/* ── 26. the create-project instructions vs the SQL that depends on them ────
   N19. Help now documents the step before every other Supabase topic — creating the
   project — and two of its answers are derived from the shipped SQL rather than from
   preference. Derived claims rot when the SQL moves, and this pair rots INVISIBLY: the
   reader follows the page, the app refuses to connect, and nothing in the repo has
   changed colour.

   The load-bearing one is the "Automatically expose new tables" toggle. The answer is ON
   only BECAUSE tools/supabase-deploy.sql has no GRANTs of its own and leans on the
   project's default privileges. The moment someone adds grants there — which is a known,
   wanted change — the honest answer flips to OFF, and this check goes red until the page
   flips with it. It is the rare doc-truth check that fires on an IMPROVEMENT, which is
   exactly when a doc is likeliest to be forgotten.

   The region is the same shape of claim: tests/rls.mjs hardcodes a pooler host whose
   region the page names, and that test exits 0 when unconfigured, so a drift here reads
   green from every direction at once. */
const createDocs = (() => {
  const html = read("docs/index.html");
  const start = html.indexOf('id="supabase-create-project"');
  if (start < 0) return "";
  const end = html.indexOf("<h3", start);
  return html.slice(start, end < 0 ? html.length : end);
})();
const deploySql = read("tools/supabase-deploy.sql");
const grantsIn = (rel) => (read(rel).match(/^\s*GRANT\b/gim) || []).length;
const rlsPoolerRegion = (/aws-\d+-([a-z0-9-]+)\.pooler\.supabase\.com/.exec(read("tests/rls.mjs")) || [])[1] || "";

ok("tools/doc-truth.mjs: the create-project section, the deploy SQL and rls.mjs's pooler host parsed for check 26 are non-empty",
  createDocs.length > 500 && deploySql.length > 500 && !!rlsPoolerRegion,
  `Help section: ${createDocs.length} chars · supabase-deploy.sql GRANTs: ${grantsIn("tools/supabase-deploy.sql")} · ` +
  `rls.mjs pooler region: ${rlsPoolerRegion || "(unparsed)"}`);

// The toggle answer and the reason for it must BOTH match the file. "ON while the deploy
// script has no grants of its own" is one claim, not two.
const deployGrants = grantsIn("tools/supabase-deploy.sql");
const docsSayExposeOn = /Automatically expose new tables[\s\S]{0,400}?<strong>ON<\/strong>/.test(createDocs);
ok(`Help's "Automatically expose new tables" answer matches tools/supabase-deploy.sql (${deployGrants} GRANT statement(s))`,
  deployGrants === 0 ? docsSayExposeOn : !docsSayExposeOn,
  deployGrants === 0
    ? "the deploy script has no GRANTs, so the toggle must be documented as ON — off, and PostgREST refuses every request"
    : "the deploy script carries its own GRANTs (N20), so the toggle must be documented as OFF: flip Help (and the § 0 " +
      "header in tools/supabase-deploy.sql) — this check exists to make that flip impossible to forget, in either direction");
// The REASON has to move with the answer, or the page keeps a true answer next to
// a stale justification — which is the pair a later reader "tidies up" back into
// the bug. Both directions are asserted, so removing § 6c is as covered as adding
// it was. The § 6c pointer is what makes the claim checkable from the SQL side.
ok(`Help says WHY that toggle has the answer it has, in terms of the deploy script's GRANTs (${deployGrants} found)`,
  deployGrants === 0
    ? /\bno\b[\s\S]{0,40}?<code>GRANT<\/code>\s+statements/.test(createDocs)
    : /<code>GRANT<\/code>/.test(createDocs) && /§ 6c/.test(createDocs),
  deployGrants === 0
    ? "an answer with no reason is one the next reader will 'tidy up' — the reason IS the check"
    : "the answer is OFF only BECAUSE tools/supabase-deploy.sql § 6c grants for itself; Help must say so and name § 6c");
ok("tools/supabase-deploy.sql's § 0 header agrees with its own GRANT count",
  deployGrants === 0
    ? /Automatically expose new tables — ON/.test(deploySql)
    : /Automatically expose new tables — OFF/.test(deploySql),
  "§ 0 is the copy a reader in the SQL editor actually sees — it drifts from Help the moment only one of them is updated");

ok(`Help names the region tests/rls.mjs actually defaults to (${rlsPoolerRegion})`,
  new RegExp(rlsPoolerRegion.replace(/[-]/g, "\\-")).test(createDocs),
  `tests/rls.mjs's pooler host is aws-0-${rlsPoolerRegion}.pooler.supabase.com; the Help page names a different region\n      ` +
  "that test SKIPs silently without SUPABASE_DB_HOST, so a region mismatch reads green while checking nothing");

// "Which file" is the miss that started N19: three SQL files, one right answer, and a
// header that recommended against itself. Each file must be named, and the deploy script
// must be the one carrying the create-project preamble the Help page mirrors.
const namesAllThree = ["tools/supabase-deploy.sql", "tools/supabase-rls-real.sql", "tools/supabase-bootstrap.sql"]
  .filter((f) => createDocs.includes(f));
ok("Help names all three shipped Supabase SQL files, so the reader cannot pick the wrong one by omission",
  namesAllThree.length === 3,
  `named: ${namesAllThree.join(", ") || "(none)"}`);
ok("tools/supabase-deploy.sql carries the create-project preamble (§ 0) the Help page mirrors",
  /§ 0\)/.test(deploySql) && /ca-central-1/.test(deploySql),
  "the canonical copy lives next to the SQL that depends on it — a reader in the SQL editor never sees Help");
ok("tools/supabase-bootstrap.sql no longer claims the real RLS posture is unsafe to run",
  !/NOT yet safe to run here/.test(read("tools/supabase-bootstrap.sql")),
  "that claim stopped being true when M7 slices 2/3 shipped GoTrue sign-in and the owner-field migration " +
  "(the real posture went live 2026-07-30) — it is the exact sentence that misled a session on 2026-08-08");

/* ── 27. the workspace markers only ever move FORWARD ───────────────────────
   N28. Check 25 holds every stamping artifact to the CURRENT version; this one holds
   the DIRECTION. A bare `ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value` on
   `schema_version` means running an OLDER copy of that artifact against an upgraded
   workspace re-labels it as the older shape — after which every client, including the
   newer app that performed the upgrade, reads it as older and offers the upgrade again,
   forever. That is exactly the clobber N17 found in `WS.metaRows()` and fixed on the app
   side; until now the SQL side still had it in two of the four artifacts.

   Two shapes are acceptable, and which one is right depends on the artifact:
     • DO NOTHING          — deploy paths that only ever DECLARE what they just built
                             (an existing environment's own answer wins).
     • the raise-only WHERE — provisioning paths that legitimately need to RAISE the
                             marker during an upgrade, and heal an absent/non-numeric one.
   A bare DO UPDATE is neither, and it is the only thing this check rejects.

   `app` is the same class of clobber in a different key: relabelling a project another
   fleet app already claimed. Only DO NOTHING is right there — nothing about running the
   analytics script should ever take a project away from manager or relay.

   Deliberately textual, over the shipped bytes of each artifact, because that is what a
   user pastes and what the Edge Function deploys — neither derives from schema.js, which
   is the whole reason they drift (the N2 slice-2 class). tests/rls.mjs proves the same
   property against a real Postgres; this is the half that runs in the dev gate. */
const MARKER_ARTIFACTS = [
  "tools/supabase-deploy.sql", "tools/supabase-rls-real.sql",
  "tools/supabase-bootstrap.sql", "supabase/functions/polecat-admin/sql.ts",
];
// One upsert statement per match: from INSERT to the `;` that ends it. `[^;]*` cannot
// run past the statement, so a file's statements never merge into one another.
const markerUpserts = MARKER_ARTIFACTS.flatMap((rel) =>
  [...read(rel).matchAll(/INSERT INTO[^;]*?VALUES\s*\(\s*'(app|schema_version)'[^;]*;/g)]
    .map((m) => ({ rel, key: m[1], sql: m[0].replace(/\s+/g, " ") })));
const RAISE_ONLY = /DO UPDATE SET value = EXCLUDED\.value\s+WHERE [\w".]*value !~ '\^\[0-9\]\+\$' OR [\w".]*value::int < EXCLUDED\.value::int/;
const bareUpdate = (s) => /DO UPDATE/.test(s) && !RAISE_ONLY.test(s);

ok(`tools/doc-truth.mjs: the provisioning artifacts' polecat_meta upserts parsed for check 27 are non-empty (${markerUpserts.length} found)`,
  markerUpserts.length >= 4 && markerUpserts.some((u) => u.key === "app"),
  markerUpserts.map((u) => `${u.rel}:${u.key}`).join(" · ") || "(none)");

const rewindable = markerUpserts.filter((u) => u.key === "schema_version" && bareUpdate(u.sql));
ok("every artifact that stamps schema_version does so DO NOTHING or raise-only — none can REWIND a workspace",
  !rewindable.length,
  rewindable.map((u) => `${u.rel} — ${u.sql}`).join("\n      ") + "\n      " +
  "add the guard: ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value " +
  "WHERE polecat_meta.value !~ '^[0-9]+$' OR polecat_meta.value::int < EXCLUDED.value::int (docs/COMPAT.md § 3)");

const relabels = markerUpserts.filter((u) => u.key === "app" && /DO UPDATE/.test(u.sql));
ok("no artifact can RELABEL the `app` marker of a project another fleet app already claimed",
  !relabels.length,
  relabels.map((u) => `${u.rel} — ${u.sql}`).join("\n      ") + "\n      " +
  "the `app` marker is ownership, not state: ON CONFLICT (key) DO NOTHING");

/* ── 28. Help's own version of check 24's catalog ROW ───────────────────────
   N7. The check-16→17 move, one document over, and the pattern every tour slice has
   followed: check 24 made the TOURS name each catalog row's controls, and the v892 pass
   that shipped it measured that Help had the same hole — `docs/index.html` documented
   Test, Run and `private` in scattered sections of their own and never named the per-row
   **Pin** on Connections or Datasets at all. A reader who learns the app from Help rather
   than from a tour is the one who never finds the row.

   Same source of truth, deliberately: `rowControlsBySection` above, parsed out of the
   catalog modules themselves — so one derivation now holds two documents, and a control
   added to a row reddens the gate until BOTH say so.

   Scope comes from the markup, not from a heading this check would have to guess at:
   Help's per-row list tags each item `data-help-rows="<section>"`, which is also what makes
   the negative half possible. That half is the one worth having — Jobs render no `cx-pin`,
   and a Help page that promises one sends the reader hunting for a control that does not
   exist. So a section's block must name every control its module renders, must NOT name a
   toggle it doesn't, and — once a module GAINS one — must not still be carrying the
   sentence that says it hasn't. The bolded form is the requirement, as in check 24: this
   page names controls in <strong>, and prose *about* pinning is not the same as telling
   the reader the button is there. */
const helpRows = new Map([...read("docs/index.html")
  .matchAll(/<li data-help-rows="(\w+)">([\s\S]*?)<\/li>/g)].map((m) => [m[1], m[2]]));
ok("docs/index.html: the per-row controls block parsed for check 28 covers the same catalogs as check 24",
  [...rowControlsBySection.keys()].every((s) => helpRows.has(s)) &&
    [...helpRows.keys()].every((s) => rowControlsBySection.has(s)),
  `Help documents: ${[...helpRows.keys()].join(", ") || "(none)"} · the modules define: ` +
  `${[...rowControlsBySection.keys()].join(", ")}\n      ` +
  'each catalog gets one `<li data-help-rows="<section>">` — that tag is what scopes this check');

const helpRowGaps = [];
for (const [sec, r] of rowControlsBySection) {
  // A missing block is the check above's failure, but recorded here too — a vacuous ✓ on
  // the line that names the controls is exactly the reassurance nobody should get.
  const block = helpRows.get(sec) ?? "";
  const bolded = (w) => new RegExp(`<strong>\\s*${w}\\b[^<]*</strong>`, "i").test(block);
  for (const w of r.actions)
    if (!bolded(w)) helpRowGaps.push(`Help's ${sec} row never names <strong>${w}</strong> — ` +
      `the row's ${w} button (${r.file})`);
  for (const w of r.toggles)
    if (!bolded(w)) helpRowGaps.push(`Help's ${sec} row never names <strong>${w}</strong> — ` +
      `the row's ${w} toggle (${r.file})`);
  // The other direction: a toggle the module does not render must not be promised, and the
  // sentence explaining its absence must go the moment it starts rendering one.
  for (const w of Object.values(ROW_TOGGLE_WORD)) {
    if (r.toggles.includes(w)) continue;
    if (bolded(w)) helpRowGaps.push(`Help's ${sec} row promises <strong>${w}</strong>, but ` +
      `${r.file} renders no such toggle on that row`);
  }
  if (r.toggles.includes("Pin") && /\bno pin\b/i.test(block))
    helpRowGaps.push(`Help's ${sec} row still says it has "no pin", but ${r.file} now renders one`);
}
ok(`docs/index.html: every catalog row's own controls are documented, and none are invented (${
  [...rowControlsBySection].map(([s, r]) => `${s}: ${[...r.actions, ...r.toggles].join("/")}`).join(" · ")})`,
  !helpRowGaps.length,
  `${helpRowGaps.join("\n      ")}\n      ` +
  "Help is where a reader who never takes a tour learns the row — check 24 holds the tours to the same source");

/* ── 29. The marketing page's MAP claims vs the choropleth's own Region-scale list ──────
   N7. Every check above holds a document to a source; nothing held the app's GEOGRAPHY
   story to anything, and the hero carousel — the first thing a visitor reads — had drifted
   the furthest of any copy on the site. Two slides described the map, and between them they
   named three of the six built-in scales and then called one of the other three a geography
   the reader has to supply: "bring your own boundaries, like these USGS HUC8 watersheds".
   HUC8 is a `scale` choice shipped in the registry, one select away in the Inspector. So a
   visitor was told the watershed map — the one on screen, the one the #geo section below
   the fold lists as built in — was theirs to source, while the feature that IS user-supplied
   (import a county FIPS → region-name CSV, the `customMap` opt beside `scale`) went unnamed
   in the carousel entirely. Both halves undersold the app in the same breath.

   The source of truth is `Studio.CHARTS.choropleth`'s own `scale` opt in app/model.js —
   the one place the app decides which geographies it can draw. Three rules come off it:

   (a) COVERAGE — the #geo section's list names every choice, custom regions included. That
       one already passed; this pins it, so a seventh scale cannot ship unlisted.
   (b) COUNTS — every "N region scales" / "N built-in scales" / "N scales built in" claim on
       the page equals the measurement (7 with Custom regions, 6 without). A claim that names
       no number fails too: "state, county and USDA-district scales built in" is how the
       carousel went stale in the first place — an enumeration ages silently, a count cannot.
   (c) THE MISLABEL — the vocabulary that means "you supply this geography" may not land in
       the same sentence as a scale that ships. Deliberately narrow: two phrasings that make
       the assertion outright, checked per alt attribute and per sentence, so prose that
       legitimately explains the custom-regions import beside a built-in scale's name (the
       #geo list does exactly that, and so does the corrected caption) is not caught by a
       proximity rule that cannot tell the two apart. It is a guard, not a measurement — (b)
       is the half that keeps the copy honest as the registry grows.

   Scoped to index.html on purpose, not by oversight: Help was audited in the same pass and
   is CURRENT — `ct-choropleth` already distinguishes the six from "your own custom regions"
   and documents the CSV's two columns. The marketing page was the only stale surface. */
function choroplethBlock() {
  const src = read("app/model.js");
  const start = src.indexOf("\n    choropleth: {");
  if (start < 0) throw new Error("doc-truth: Studio.CHARTS.choropleth not found in app/model.js");
  let depth = 0, open = src.indexOf("{", start), i = open;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) break;
  }
  return src.slice(open, i + 1);
}
const scaleChoices = [...((choroplethBlock().match(/key: "scale",[\s\S]*?choices: \[([\s\S]*?)\] \}/) || [, ""])[1])
  .matchAll(/\["(\w+)",\s*"([^"]+)"\]/g)].map((m) => ({ key: m[1], label: m[2] }));
const builtInScales = scaleChoices.filter((s) => s.key !== "custom");
ok(`app/model.js: the choropleth's Region-scale choices parsed for check 29 are non-empty (${
    scaleChoices.map((s) => s.key).join(", ") || "none"})`,
  scaleChoices.length > 1 && scaleChoices.some((s) => s.key === "custom"),
  "the `scale` select's choices are what every claim below is measured against");

// What a document may call a scale: its key, the code in its label's parentheses, and the
// label's first word with and without its plural — all off the label itself, so a renamed
// scale renames its own alias set. Two-letter keys ("cd") are dropped as too short to match
// on safely; that scale is still covered by "Congressional".
function scaleNamer(s) {
  const paren = (s.label.match(/\(([^)]+)\)/) || [])[1];
  const first = s.label.replace(/\s*\(.*$/, "").split(/\s+/)[0];
  const aliases = [s.key.length >= 4 ? s.key : null, paren, first, first.replace(/s$/, "")]
    .filter(Boolean).map((a) => a.replace(/[^\w]/g, ""));
  return new RegExp(`\\b(?:${[...new Set(aliases)].join("|")})`, "i");
}
const namesScale = (text, s) => scaleNamer(s).test(text);

// (a) coverage
const geoList = (marketing.match(/<ul class="geo-scales">([\s\S]*?)<\/ul>/) || [, ""])[1];
const geoMissing = scaleChoices.filter((s) => !namesScale(geoList, s));
ok(`index.html: the #geo list names all ${scaleChoices.length} region scales the map can draw`,
  !!geoList && !geoMissing.length,
  `not named in <ul class="geo-scales">: ${geoMissing.map((s) => s.label).join(", ") || "(the list itself is missing)"}`);

// (b) counts
const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
const asNumber = (w) => (/^\d+$/.test(w) ? Number(w) : WORD_NUM[w.toLowerCase()]);
const SCALE_COUNT_CLAIMS = [
  [/(\S+)\s+region scales?\b/gi, scaleChoices.length, "region scales (built-in plus Custom regions)"],
  [/(\S+)\s+built-in scales?\b/gi, builtInScales.length, "built-in scales"],
  [/(\S+)\s+scales?\s+built in\b/gi, builtInScales.length, "scales built in"],
];
const scaleCountGaps = [];
let scaleCountClaims = 0;
for (const [re, expect, what] of SCALE_COUNT_CLAIMS)
  for (const m of marketing.matchAll(re)) {
    scaleCountClaims++;
    if (asNumber(m[1]) !== expect)
      scaleCountGaps.push(`"…${m[0].replace(/\s+/g, " ").trim()}" — the map has ${expect} ${what}`);
  }
ok(`index.html: every region-scale count reads ${builtInScales.length} built in (${scaleChoices.length} with Custom regions)`,
  scaleCountClaims > 0 && !scaleCountGaps.length,
  (scaleCountClaims ? scaleCountGaps.join("\n      ")
    : "the page makes no region-scale count claim at all — it is the app's geography story, say the number") +
  "\n      a claim that lists scales instead of counting them goes stale silently; a count cannot");

// (c) the mislabel
const CUSTOM_GEO_VOCAB = /custom geograph|your own boundaries/i;
const claimUnits = [
  ...[...marketing.matchAll(/\balt="([^"]*)"/g)].map((m) => m[1]),
  ...marketing.replace(/<[^>]+>/g, " ").split(/(?<=[.!?])\s+/),
];
const scaleMislabels = [];
for (const unit of claimUnits) {
  if (!CUSTOM_GEO_VOCAB.test(unit)) continue;
  const named = builtInScales.filter((s) => namesScale(unit, s));
  if (named.length) scaleMislabels.push(`"${unit.replace(/\s+/g, " ").trim().slice(0, 150)}"` +
    `\n        → names the BUILT-IN ${named.map((s) => s.label).join(", ")}`);
}
ok("index.html: no built-in region scale is described as a geography the reader must supply",
  !scaleMislabels.length,
  `${scaleMislabels.join("\n      ")}\n      ` +
  "the user-supplied geography is the `customMap` opt (a county FIPS → region-name CSV); " +
  "these scales ship");

/* ── 30. provisioning never re-opens a workspace that has gone live ────────
   N26. Check 27 holds the marker DIRECTION; this one holds the POSTURE, and it is the
   same shape of bug one layer down. Both provisioning artifacts end with a DO block that
   installs the demo `polecat_anon_all` policy, and both used to do it unconditionally.
   Postgres ORs PERMISSIVE policies together, so on a workspace that has been through
   go-live that CREATE did not REPLACE the per-user policies — it added an allow-all one
   BESIDE them and handed the anon key every row back, with the real policies still sitting
   there looking correct. `provision` is the polecat-admin function's ONLY schema action and
   `supabase-provision.yml` applies the .sql file unattended, so "safe to re-run" had to
   start meaning safe on a LIVE workspace, not only on the demo one it was written for.

   Three properties, and the third is the one a careless "fix" would lose:
     • the CREATE is conditional on the workspace not being live;
     • liveness is derived from the real posture's OWN policy names — the same names
       supabase-rls-real.sql drops by name, for the same OR-ing reason — rather than from a
       marker a rollback would forget to clear;
     • the DROP stays UNCONDITIONAL. A stray allow-all beside a live posture IS the leak, so
       finding one is a reason to remove it, never a reason to leave it alone.

   Textual, over the shipped bytes of each artifact, for check 27's reason: neither file
   derives from schema.js, which is exactly why they drift (the N2 slice-2 class). The live
   proof against a real Postgres is tests/rls.mjs's two "re-run on a workspace that has gone
   live" postures; this is the half that runs in the dev gate. */
const PROVISIONING_ARTIFACTS = ["tools/supabase-bootstrap.sql", "supabase/functions/polecat-admin/sql.ts"];
// The demo-posture block, from its DO to the END that closes it. Both artifacts have
// exactly one block that creates the allow-all policy; the runbook's rollback (a document,
// not an artifact) is deliberately out of scope — undoing go-live is what it is FOR.
const demoBlocks = PROVISIONING_ARTIFACTS.map((rel) => {
  const src = read(rel);
  const create = src.indexOf("CREATE POLICY polecat_anon_all");
  if (create < 0) return { rel, block: "" };
  const start = src.lastIndexOf("DO $$", create);
  const end = src.indexOf("END $$;", create);
  return { rel, block: start < 0 || end < 0 ? "" : src.slice(start, end + 7) };
});

ok(`tools/doc-truth.mjs: the demo-posture block parsed for check 30 was found in both provisioning artifacts`,
  demoBlocks.every((b) => b.block),
  demoBlocks.filter((b) => !b.block).map((b) => `${b.rel} — no DO $$ … END $$; block creates polecat_anon_all`).join("\n      ") +
  "\n      if an artifact stopped installing the demo posture at all, retire this check with it — do not let it pass vacuously");

const LIVE_PROBE = /FROM pg_policies[\s\S]*?policyname IN \([^)]*'polecat_select'[^)]*'polecat_meta_auth'[^)]*\)/;
const postureGaps = [];
for (const { rel, block } of demoBlocks) {
  if (!block) continue;
  if (!LIVE_PROBE.test(block))
    postureGaps.push(`${rel} — the block never asks pg_policies whether the real per-user policies ` +
      `(polecat_select … polecat_meta_auth) are already installed`);
  if (!/IF NOT live THEN\s*\n\s*EXECUTE format\('CREATE POLICY polecat_anon_all/.test(block))
    postureGaps.push(`${rel} — CREATE POLICY polecat_anon_all is not guarded by IF NOT live`);
  // The DROP has to sit OUTSIDE the guard: everything between the loop's ALTER TABLE and the
  // IF is unconditional, so requiring the DROP to appear there is requiring exactly that.
  const unconditional = block.slice(block.indexOf("ENABLE ROW LEVEL SECURITY"), block.indexOf("IF NOT live"));
  if (!/DROP POLICY IF EXISTS polecat_anon_all/.test(unconditional))
    postureGaps.push(`${rel} — DROP POLICY IF EXISTS polecat_anon_all moved inside the guard; ` +
      `a stray allow-all beside a live posture is the leak itself and must always be removed`);
}
ok("provisioning re-run on a gone-live workspace preserves its posture (the demo allow-all is guarded, the drop is not)",
  !postureGaps.length,
  `${postureGaps.join("\n      ")}\n      ` +
  "Postgres ORs PERMISSIVE policies together — one allow-all beside the per-user set defeats all of it (STATUS.md N26)");

// The two artifacts are supposed to be the same posture written twice (the N2 slice-2 drift
// class), so hold the guard itself to that: same block, modulo the .ts file's backtick
// escaping and each file's own indentation.
const normalise = (s) => s.replace(/\\`/g, "`").replace(/\s+/g, " ").trim();
ok("both provisioning artifacts carry the SAME guarded demo-posture block (they are one posture written twice)",
  demoBlocks.every((b) => b.block) && normalise(demoBlocks[0].block) === normalise(demoBlocks[1].block),
  `${demoBlocks.map((b) => `${b.rel}: ${normalise(b.block).slice(0, 220)}…`).join("\n      ")}\n      ` +
  "an edit to one is an edit to both — tests/rls.mjs installs each of them separately and runs the same checks");

/* ── 31. the hero SCREENSHOTS' own copy vs check 29's same source ───────────
   N7. Check 29 holds the carousel's CAPTIONS to `Studio.CHARTS.choropleth`'s `scale` list.
   It could not see the other half of the same slide — the picture. The hero images are
   generated by `tools/gen-shots.mjs`, which builds REAL dashboard exports from specs written
   in that file, so their titles and subtitles are published copy, rendered at 2160×1350, that
   no check had ever read. And it had drifted in exactly the direction check 29 exists to
   catch: `huc8Spec()`'s subtitle said "A custom geography — HUC8 subbasins…", the claim v916
   had just deleted from the caption printed directly beneath the image. A visitor read "one
   of the six scales built in" under a screenshot whose own header said the opposite, and
   fixing the caption alone had made the contradiction WORSE, not better.

   The generator's source is the only derivable proxy for pixels — a PNG cannot be parsed —
   and it is the right one: the literal in the spec IS the string in the image, and no
   regeneration can bake copy in without passing through here first. Same two rules as check
   29's (b) and (c), against the same measurement, one document over. The mislabel rule is the
   load-bearing half; a count claim is not REQUIRED of a shot subtitle (it describes data, not
   the feature list) but is measured wherever one appears. */
const shotCopy = [...read("tools/gen-shots.mjs")
  .matchAll(/\b(?:title|subtitle)\s*:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
ok(`tools/gen-shots.mjs: the shot specs' rendered copy parsed for check 31 is non-empty (${shotCopy.length} string(s))`,
  shotCopy.length > 0,
  "the `title:` / `subtitle:` literals in the shot specs are what the rules below are measured against");

const shotCountGaps = [];
for (const [re, expect, what] of SCALE_COUNT_CLAIMS)
  for (const unit of shotCopy)
    for (const m of unit.matchAll(re))
      if (asNumber(m[1]) !== expect)
        shotCountGaps.push(`"…${m[0].replace(/\s+/g, " ").trim()}" — the map has ${expect} ${what}`);
ok(`tools/gen-shots.mjs: every region-scale count baked into a screenshot reads ${builtInScales.length} built in`,
  !shotCountGaps.length,
  `${shotCountGaps.join("\n      ")}\n      ` +
  "a stale number inside a PNG outlives every copy pass — the page can only be fixed by regenerating the shot");

const shotMislabels = [];
for (const unit of shotCopy) {
  if (!CUSTOM_GEO_VOCAB.test(unit)) continue;
  const named = builtInScales.filter((s) => namesScale(unit, s));
  if (named.length) shotMislabels.push(`"${unit.replace(/\s+/g, " ").trim().slice(0, 150)}"` +
    `\n        → names the BUILT-IN ${named.map((s) => s.label).join(", ")}`);
}
ok("tools/gen-shots.mjs: no screenshot describes a built-in region scale as a geography the reader must supply",
  !shotMislabels.length,
  `${shotMislabels.join("\n      ")}\n      ` +
  "check 29 holds the caption beside the image to this same rule — the two must not contradict each other");

/* ── 32. the Quick Views hero shot vs the editor it photographs ─────────────
   N7. Check 31 read the copy BAKED INTO a screenshot. This reads the other side of the
   same seam: what the shot's generator actually puts on screen, versus what the caption
   and the alt text beside it promise. The Quick Views slide had drifted on both counts.

   (a) The prep loaded a saved VIEW. CONS-4 later made every View the conservation pack
   seeds View Builder-native, and `xpLoadAnalysis` answers a builder-made View with the
   VB-5 cross-editor banner — so the flagship Quick Views slide led with a notice saying
   Quick Views "can't edit its shelves, filters, or calculated columns". There is no
   better saved View to prefer: all four the pack seeds go through `builderViewRow`, which
   sets `builder:`. Both halves of that are derived below, so the rule survives the pack
   changing its mind — seed one non-builder View and the premise check says so.

   (b) The alt text promised "a live result". The editor is a FOUR-step walk and the
   1440×900 frame holds three of them (measured by the shooter itself — `framedSteps`, in
   tools/gen-shots.mjs), so `4 · Result` is below the fold in a picture whose alt text
   said it was there. A step's own header noun is the vocabulary: copy beside the image
   may name the framed steps and must not name a later one. The positive half matters as
   much — a caption that names none of them is vague, not true. */
const shotsSrc = read("tools/gen-shots.mjs");
const explorePrep = (shotsSrc.match(/snapSection\(browser, "explore-dark",[\s\S]*?\n {4}\} \}\);/) || [""])[0];
ok("tools/gen-shots.mjs: the explore-dark shot's options block parsed for check 32",
  explorePrep.length > 0,
  "the `snapSection(browser, \"explore-dark\", { … })` call is what rules (a) and (b) are measured against");

const builderRowBody = (packSrc.match(/function builderViewRow\([\s\S]*?\n {2}\}/) || [""])[0];
const conservationViewWrites = [...packSrc.matchAll(/W\.put\("analyses", ([A-Za-z_]\w*)/g)].map((m) => m[1]);
ok("app/demopacks.js: every saved View the conservation pack seeds is View Builder-native",
  /\bbuilder:/.test(builderRowBody) && conservationViewWrites.length > 0 &&
  /builderViewRow\(/.test(packSrc),
  "`builderViewRow` sets `builder:`, and it is the only shape the pack's PRACTICES loop writes — " +
  "so a prep that picks from the saved Views cannot avoid the cross-editor banner");

ok("tools/gen-shots.mjs: the Quick Views shot opens a DATASET, not a saved View",
  !/\ball\("analyses"\)|__studioExplore\.load/.test(explorePrep) && /button\.xp-ds/.test(explorePrep),
  "app/explore.js raises the VB-5 cross-editor notice for any View with a `builder` blob, and " +
  "every View in the shot's workspace has one — so loading a saved View photographs Quick Views' " +
  "own limitation instead of the walk the caption describes");

// The editor's numbered steps, in the order app/explore.js renders them.
const xpSteps = [...read("app/explore.js").matchAll(/class="xp-step-h">(\d+) · ([A-Za-z]+)/g)]
  .map((m) => ({ n: +m[1], noun: m[2] }));
const framedSteps = +((explorePrep.match(/framedSteps:\s*(\d+)/) || [])[1] || 0);
ok(`app/explore.js: the Quick Views editor's numbered steps parsed for check 32 (${
  xpSteps.map((s) => s.n + " · " + s.noun).join(", ") || "none"}), and the shot declares framedSteps: ${framedSteps}`,
  xpSteps.length > 1 && framedSteps > 0 && framedSteps < xpSteps.length,
  "the shooter fails the capture if `framedSteps` does not match what the 1440×900 frame holds; " +
  "this check holds the copy to the same number");

// The copy beside the image: its alt text, and the carousel caption at the same slide index.
const exploreImg = (marketing.match(/<img[^>]*site\/shots\/explore-dark\.png[^>]*>/) || [""])[0];
const exploreAlt = (exploreImg.match(/alt="([^"]*)"/) || [, ""])[1];
const slideIdx = +((exploreImg.match(/data-i="(\d+)"/) || [])[1] ?? -1);
const capsBlock = (marketing.match(/var CAPS = \[([\s\S]*?)\n {2}\];/) || [, ""])[1];
const caps = [...capsBlock.matchAll(/^\s*"((?:[^"\\]|\\.)*)",?$/gm)].map((m) => m[1]);
const exploreCopy = [exploreAlt, caps[slideIdx] || ""].filter(Boolean);
const slideCount = (marketing.match(/class="hc-img[^"]*"/g) || []).length;
ok(`index.html: the copy beside explore-dark.png parsed for check 32 (alt + caption ${slideIdx} of ${caps.length})`,
  exploreAlt.length > 0 && slideIdx >= 0 && caps.length === slideCount && !!caps[slideIdx],
  "the alt attribute and the CAPS entry at the image's own data-i are the two published strings — " +
  `${slideCount} slide(s) vs ${caps.length} caption(s) means the pairing itself has drifted`);

const beyond = xpSteps.filter((s) => s.n > framedSteps);
const overPromises = [];
for (const step of beyond)
  for (const unit of exploreCopy)
    if (new RegExp("\\b" + step.noun + "\\b", "i").test(unit))
      overPromises.push(`"${unit.slice(0, 120)}…"\n        → names step ${step.n} · ${step.noun}, which the frame does not reach`);
ok(`index.html: the Quick Views copy promises nothing past step ${framedSteps} of the editor`,
  !overPromises.length,
  `${overPromises.join("\n      ")}\n      ` +
  "re-frame the shot (raise `framedSteps` in tools/gen-shots.mjs) or drop the claim — the picture decides");

const framedNouns = xpSteps.filter((s) => s.n <= framedSteps).map((s) => s.noun);
ok(`index.html: the Quick Views copy names at least one step the shot actually shows (${framedNouns.join("/")})`,
  exploreCopy.some((unit) => framedNouns.some((noun) => new RegExp("\\b" + noun + "\\b", "i").test(unit))),
  "the negative rule above is satisfiable by saying nothing — a caption for a numbered walk has to name the walk");

/* ── 33. the Dashboard Builder hero shot vs the panel it photographs ────────
   N7, and the check-32 move one slide over. Check 32 held the Quick Views shot to what
   its 1440×900 frame REACHES. This holds the builder shot to what its frame SHOWS, which
   is a different failure: the pane was open and empty.

   Measured 2026-08-09. LF19 gave the Data panel's "This dashboard's datasets" group
   progressive disclosure — `libGroupOpen` collapses it once it holds more than
   LIB_GROUP_MANY items, unless the reader has toggled it themselves, which it remembers
   in `studio-lib-mine-open`. The two builder shots straddle that threshold: `studio-cost`
   binds 6 data accesses and `finance-command` binds 9. So the LIGHT shot rendered its six
   dataset cards while the DARK one — the shot the marketing carousel actually publishes —
   rendered one collapsed header over ~1000px of empty panel, under a caption reading
   "Drag datasets onto the canvas" and alt text promising "the data and inspector panels".
   Same generator, same function, one item apart. v918 had just fixed the other half of
   this slide (it was photographing Home), which is why the empty panel was the next thing
   visible rather than the second thing.

   Three rules, all derived so they survive either side moving:
   (a) if any builder shot's spec binds more than the threshold, the shooter must seed the
       group's OWN open key — the reader's-choice path the group already honours;
   (b) each shot's declared `datasetsShown` must be a real count: at least one card, and
       never more than the spec actually binds (the shooter measures the rest — declare 9
       for a frame that holds 8 and the capture fails there rather than here);
   (c) the copy beside the image may not claim a count the frame does not hold, and must
       name what the picture shows. The positive half matters as much: this slide's whole
       job is the panel, and a caption that never mentions it is vague, not true. */
const studioSrc = read("app/studio.js");
const libGroupMany = +((studioSrc.match(/\bLIB_GROUP_MANY\s*=\s*(\d+)/) || [])[1] || 0);
const mineBody = (studioSrc.match(/function buildMyDataSources\([\s\S]*?\n {2}\}/) || [""])[0];
const mineOpenKey = (mineBody.match(/mineOpenKey\s*=\s*"([^"]+)"/) || [, ""])[1];
const mineGroupName = ((mineBody.match(/class="nm">([^<]*)<\/span>/) || [, ""])[1] || "")
  .replace(/\\u2019/g, "’");
ok(`app/studio.js: the Data panel's dataset group parsed for check 33 ("${mineGroupName}", ` +
  `collapses past ${libGroupMany} items, remembered in \`${mineOpenKey}\`)`,
  libGroupMany > 0 && !!mineOpenKey && !!mineGroupName,
  "`buildMyDataSources` + `libGroupOpen` are what the rules below are measured against — " +
  "the threshold and the key both come from the app, not from the shooter");

// Every builder shot: the example it loads, what that example binds, and what it declares.
const builderShots = [...shotsSrc.matchAll(
  /loadExample\((\w+)\.page, "([^"]+)"(?:, \{ datasetsShown: (\d+) \})?\)/g)]
  .map((m) => {
    let bound = -1;
    try { bound = (JSON.parse(read("data/examples/" + m[2])).cda.dataAccesses || []).length; } catch (e) {}
    return { page: m[1], file: m[2], declared: m[3] === undefined ? -1 : +m[3], bound };
  });
ok(`tools/gen-shots.mjs: both builder shots parsed for check 33 (${
  builderShots.map((s) => `${s.file.replace(".studio.json", "")}: ${s.bound} bound, ${s.declared} shown`).join(" · ") || "none"})`,
  builderShots.length >= 2 && builderShots.every((s) => s.bound > 0 && s.declared >= 0),
  "each `loadExample(page, file, { datasetsShown })` call and the `cda.dataAccesses` of the " +
  "example it names are the two halves of the measurement — an undeclared shot is unheld");

const loadExampleBody = (shotsSrc.match(/async function loadExample\([\s\S]*?\n\}/) || [""])[0];
const needsSeed = builderShots.filter((s) => s.bound > libGroupMany);
ok(`tools/gen-shots.mjs: the shooter opens the "${mineGroupName}" group it photographs` +
  (needsSeed.length ? ` (${needsSeed.map((s) => s.file.replace(".studio.json", "")).join(", ")} bound past ${libGroupMany})` : ""),
  !needsSeed.length || new RegExp(`setItem\\("${mineOpenKey}"`).test(loadExampleBody),
  `${needsSeed.map((s) => `${s.file} binds ${s.bound}`).join(", ")}\n      ` +
  "past the threshold the group renders collapsed, so opening the PANE photographs an " +
  "empty one — seed the group's own key, the way a reader toggling it would");

const countGaps = builderShots.filter((s) => s.declared < 1 || s.declared > s.bound)
  .map((s) => `${s.file}: declares ${s.declared}, binds ${s.bound}`);
ok("tools/gen-shots.mjs: every builder shot declares a dataset count its example can actually produce",
  !countGaps.length,
  `${countGaps.join("\n      ")}\n      ` +
  "zero means the panel is empty in a picture sold on it; more than the spec binds is not a frame " +
  "measurement at all — the shooter enforces the exact framed number, this enforces the bounds");

// The copy beside the DARK builder shot — the one the carousel publishes.
const builderImg = (marketing.match(/<img[^>]*site\/shots\/studio-dark\.png[^>]*>/) || [""])[0];
const builderAlt = (builderImg.match(/alt="([^"]*)"/) || [, ""])[1];
const builderIdx = +((builderImg.match(/data-i="(\d+)"/) || [])[1] ?? -1);
const builderCopy = [builderAlt, caps[builderIdx] || ""].filter(Boolean);
const darkShot = builderShots.find((s) => /finance/.test(s.file)) || builderShots[builderShots.length - 1];
ok(`index.html: the copy beside studio-dark.png parsed for check 33 (alt + caption ${builderIdx} of ${caps.length})`,
  builderAlt.length > 0 && builderIdx >= 0 && !!caps[builderIdx],
  "the alt attribute and the CAPS entry at the image's own data-i are the two published strings");

const builderCountGaps = [];
for (const unit of builderCopy)
  for (const m of unit.matchAll(/(\S+)\s+datasets\b/gi)) {
    const n = asNumber(m[1]);
    if (n !== undefined && n > darkShot.declared)
      builderCountGaps.push(`"…${m[0].trim()}" — the frame shows ${darkShot.declared}`);
  }
ok(`index.html: the builder copy claims no more datasets than the shot frames (${darkShot.declared})`,
  !builderCountGaps.length,
  `${builderCountGaps.join("\n      ")}\n      ` +
  "re-frame the shot (raise `datasetsShown` in tools/gen-shots.mjs and let the shooter " +
  "re-measure) or drop the claim — the picture decides");

const mineNoun = (mineGroupName.match(/(\w+)$/) || [, "datasets"])[1];
ok(`index.html: the builder copy names what the panel holds ("${mineNoun}")`,
  builderCopy.some((unit) => new RegExp("\\b" + mineNoun + "\\b", "i").test(unit)),
  "the rules above are all satisfiable by saying nothing about the panel — the slide whose " +
  "own alt text promises \"the data and inspector panels\" has to name what is in them");

/* ── 34. Help's "Sample packs" section vs what the packs actually seed ──────
   N7, and the check-23→Help move — the same one check 15 made after 14, 17 after 16 and
   28 after 24. Check 23 holds the pack TOUR to the installer; a reader who never takes a
   tour learns what a pack gave them here, and this section had drifted further than the
   tour ever did.

   Measured 2026-08-09, before the fix:
   · **Market Coverage had no entry at all.** The section's own opening sentence names
     three pack folders, and the list below it had two — the pack SP-1 built over three
     slices was a loose paragraph above the list rather than an item in it.
   · **Conservation Insight's dashboard count was wrong in both directions.** It named the
     featured dashboard and the Watershed Map, said "eight extra showcase dashboards", and
     closed on "removing the pack takes all NINE dashboards back out" — while the pack
     seeds SIX into the workspace and materializes EIGHT more from the gated gallery. So
     the arithmetic in the sentence did not even match the two numbers beside it, and
     neither matched the app: the CRD map, the OpTIS trends, the provider ensemble and the
     Metrics wheel were named nowhere on the page.
   · **It never said what else came with them.** Two connections, eight datasets and the
     county-to-state rollup job are seeded by the same click, and the section named none
     of those kinds — a reader was told about charts and not about the data under them.

   Three rules, each off a source that moves with the app:
   (a) every registered pack has its own item in the list, titled with the FOLDER name the
       app files its content under (`folder` on the registry entry — the string the reader
       sees in every catalog);
   (b) an item must name every KIND its pack's installer seeds. The kinds are derived by
       walking the call graph from the entry's own `install`/`data.seed` hooks and
       collecting the workspace tables they write, so a pack that grows a new kind makes
       this fail rather than going quietly undocumented;
   (c) every dashboard COUNT the item claims must be one of that pack's real numbers — the
       dashboards it seeds, the gated gallery examples it materializes, or their sum. A
       count rule that allowed only the total would forbid the true sentence "eight extra
       showcase dashboards"; this allows each real number and nothing else.
   Plus (d): "installed by default" is a claim about `DEFAULT_INSTALLED`, not a description,
   so it must sit on that pack's item and no other. That one is here for the pack swap
   SP-1 (c2) is holding — the moment the default moves, this says so. */
const examplesIndex = (() => {
  try { return JSON.parse(read("data/examples/index.json")); } catch (e) { return []; }
})();
const exampleList = Array.isArray(examplesIndex) ? examplesIndex : (examplesIndex.examples || []);

// The registry entries, brace-walked out of `Studio.DEMO_PACKS` the way chartRegistryKeys()
// walks Studio.CHARTS — a nested `foo: {` inside an entry can never be read as a pack.
function braceBlockAt(src, openIdx) {
  let depth = 0, i = openIdx;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) break;
  }
  return src.slice(openIdx, i + 1);
}
// Every `function name(...) {…}` in demopacks.js, so the call-graph walk below can tell a
// local helper from a method call on something else.
const packFnBodies = new Map();
for (const m of packSrc.matchAll(/\bfunction\s+(\w+)\s*\(/g))
  packFnBodies.set(m[1], braceBlockAt(packSrc, packSrc.indexOf("{", m.index)));
// The workspace tables a pack writes, transitively from its own registry hooks. Counts are
// NOT derivable this way (a single `W.put` inside a forEach seeds four rows), which is why
// rule (c) counts dashboards by their NAMES instead.
function seededTables(roots) {
  const seen = new Set(), tables = new Set(), queue = [...roots];
  while (queue.length) {
    const fn = queue.shift();
    if (seen.has(fn) || !packFnBodies.has(fn)) continue;
    seen.add(fn);
    const body = packFnBodies.get(fn);
    for (const m of body.matchAll(/(?:W|Studio\.Workspace)\.put\("(\w+)"/g)) tables.add(m[1]);
    for (const m of body.matchAll(/\b(\w+)\s*\(/g)) if (packFnBodies.has(m[1])) queue.push(m[1]);
  }
  return [...tables].sort();
}
// A registry string property, following JS `"a" + "b"` concatenation — `blurb` is written as
// several wrapped literals, so a single-literal regex reads only its first line and would let
// every claim after the first wrap through unchecked. Used by checks 34 (nothing yet) and 35.
function stringProp(body, key) {
  const m = new RegExp(`\\b${key}:\\s*`).exec(body);
  if (!m) return "";
  let i = m.index + m[0].length, out = "";
  for (;;) {
    while (/\s/.test(body[i])) i++;
    if (body[i] !== '"') break;
    let j = i + 1;
    for (; j < body.length && body[j] !== '"'; j++) {
      if (body[j] === "\\") { out += body[++j]; continue; }
      out += body[j];
    }
    i = j + 1;
    while (/\s/.test(body[i])) i++;
    if (body[i] !== "+") break;
    i++;
  }
  return out;
}
const registryBlock = braceBlockAt(packSrc, packSrc.indexOf("{", packSrc.indexOf("Studio.DEMO_PACKS = {")));
const packRegistry = [...registryBlock.matchAll(/\n {4}(\w+): \{/g)].map((m) => {
  const body = braceBlockAt(registryBlock, registryBlock.indexOf("{", m.index + m[0].length - 1));
  const hooks = [...body.matchAll(/(?:install|seed):\s*function\s*\([^)]*\)\s*\{\s*(\w+)\(/g)].map((x) => x[1]);
  const declared = +(((body.match(/seeds:\s*\{([^}]*)\}/) || [, ""])[1].match(/dashboards:\s*(\d+)/) || [])[1] || 0);
  return {
    id: m[1],
    folder: (body.match(/folder:\s*"([^"]+)"/) || [, ""])[1],
    tables: seededTables(hooks),
    // A seeded dashboard is named `<packId>-<something>` by every installer in the file —
    // the same convention check 23 already reads for the conservation pack.
    seeded: new Set([...packSrc.matchAll(new RegExp(`name:\\s*"(${m[1]}-[\\w-]+)"`, "g"))].map((x) => x[1])).size,
    declared,
    examples: exampleList.filter((e) => e.demoPackId === m[1]).length,
    // The pack's OWN copy — check 35's subject. Kept on the same derivation as everything
    // above so one reading of the registry serves both checks.
    tagline: stringProp(body, "tagline"),
    blurb: stringProp(body, "blurb"),
    // The pack's declared provenance — check 47's subject. Same reading of the same
    // registry rather than a second parse: `kind` is synthetic|public|licensed and
    // `name` is what THIRD-PARTY-NOTICES.md has to credit when it is not synthetic.
    // Brace-walked to the `source: {…}` object itself — a lazy regex for `name:` would
    // happily wander into the next dashboard literal on a pack whose source has no name.
    ...(() => {
      const at = body.indexOf("source:");
      const block = at < 0 ? "" : braceBlockAt(body, body.indexOf("{", at));
      return {
        sourceKind: (block.match(/kind:\s*"([a-z]+)"/) || [, ""])[1],
        sourceName: (block.match(/name:\s*"([^"]+)"/) || [, ""])[1],
      };
    })(),
    // The pack's committed CSV — check 48's subject, and the same one-reading rule: a
    // `data: { files: [...] }` entry is the pack opting into the asynchronous half
    // (docs/PACKS.md § "How the CSV reaches the app"), so these are exactly the files
    // that have to be in the tree AND in sw.js for "installing must not depend on the
    // network" to hold. Brace-walked to the `data:` object so a `files:` belonging to
    // anything else in the entry cannot be picked up instead.
    dataFiles: (() => {
      const at = body.search(/\n\s{6}data:\s*\{/);
      if (at < 0) return [];
      const block = braceBlockAt(body, body.indexOf("{", at));
      return [...((block.match(/files:\s*\[([^\]]*)\]/) || [, ""])[1])
        .matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    })(),
  };
});
const defaultInstalled = [...((packSrc.match(/DEFAULT_INSTALLED = \[([^\]]*)\]/) || [, ""])[1])
  .matchAll(/"(\w+)"/g)].map((m) => m[1]);
ok(`app/demopacks.js: the pack registry parsed for check 34 (${
  packRegistry.map((p) => `${p.id}: ${p.seeded}+${p.examples} dashboards, seeds ${p.tables.join("/") || "nothing"}`).join(" · ") || "none"})`,
  packRegistry.length >= 2 && packRegistry.every((p) => p.folder) &&
    packRegistry.some((p) => p.tables.length) && defaultInstalled.length > 0 &&
    packRegistry.every((p) => p.tables.every((t) => PACK_TABLE_NOUN[t])),
  `default-installed: ${defaultInstalled.join(", ") || "(none)"}\n      ` +
  "an unmapped table means a pack seeds a KIND nobody has given a user-facing noun — add it " +
  "to PACK_TABLE_NOUN (check 23 shares this vocabulary)");
// Cross-check the two dashboard derivations wherever a pack declares `seeds` — the count
// this check spends and the count the SP-0 conformance loop already holds to the installer.
const declaredGaps = packRegistry.filter((p) => p.declared && p.declared !== p.seeded)
  .map((p) => `${p.id}: registry declares ${p.declared}, ${p.seeded} dashboard name(s) in the file`);
ok("app/demopacks.js: every declared `seeds.dashboards` matches the dashboards the file actually names",
  !declaredGaps.length,
  `${declaredGaps.join("\n      ")}\n      ` +
  "these are two independent readings of the same fact — when they disagree, one of them is what Help was told");

const helpPacksSection = (help.match(/<h2>Sample packs<\/h2>([\s\S]*?)<h2>/) || [, ""])[1];
const helpPackItems = [...helpPacksSection.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
const strongTitles = (item) => [...item.matchAll(/<strong>([^<]*)<\/strong>/g)].map((m) => m[1]);
const itemFor = (pack) => helpPackItems.filter((item) =>
  strongTitles(item).some((t) => t.includes(pack.folder)));
// Rules (b)–(d) read PROSE, so the markup goes and the wrapping with it — "installed\n by
// default" is the same sentence as "installed by default", and `six <strong>dashboards`
// is the same claim as `six dashboards`.
const itemProse = (item) => item.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
ok(`docs/index.html: the Sample packs list parsed for check 34 (${helpPackItems.length} item(s))`,
  !!helpPacksSection && helpPackItems.length > 0,
  "the <h2>Sample packs</h2> section and its <ul> are what every rule below reads");

// (a) one item per pack, titled with the folder the reader sees
const missingItems = packRegistry.filter((p) => itemFor(p).length !== 1)
  .map((p) => `${p.id} ("${p.folder}"): ${itemFor(p).length} item(s) in the list`);
ok(`docs/index.html: every sample pack has its own entry in Help (${packRegistry.map((p) => p.folder).join(", ")})`,
  !missingItems.length,
  `${missingItems.join("\n      ")}\n      ` +
  "a pack the app offers and Help does not list is a pack a reader installs blind — title the " +
  "entry with the pack's `folder`, the name they will see in every catalog");

// (b) an entry names every KIND its installer seeds
const kindGaps = [];
for (const p of packRegistry) {
  const item = itemFor(p)[0] && itemProse(itemFor(p)[0]);
  if (!item) continue;
  for (const t of p.tables) {
    const noun = PACK_TABLE_NOUN[t];
    // "View" is a proper noun (LF57) and is matched as one — check 23's rule.
    if (!new RegExp(`\\b${noun}s?\\b`, /^[A-Z]/.test(noun) ? "" : "i").test(item))
      kindGaps.push(`"${p.folder}" seeds ${t} but its Help entry never says "${noun}"`);
  }
}
ok("docs/index.html: every pack entry names every kind of thing its installer seeds",
  !kindGaps.length,
  `${kindGaps.join("\n      ")}\n      ` +
  "the entry is where a reader learns what one click gave them — a pack that seeds connections, " +
  "datasets and a job while Help talks only about dashboards under-sells its own data story");

// (c) every dashboard count is one of the pack's real numbers
const countClaimGaps = [];
let packCountClaims = 0;
for (const p of packRegistry) {
  const item = itemFor(p)[0] && itemProse(itemFor(p)[0]);
  if (!item) continue;
  const real = [...new Set([p.seeded, p.examples, p.seeded + p.examples].filter(Boolean))];
  // The number belongs to the noun, not to a fixed slot before it: "six dashboards",
  // "eight extra showcase dashboards" and "all fourteen dashboards" are the three shapes
  // this section actually uses, so take any number in the three words leading up to it.
  for (const m of item.matchAll(/((?:[\w-]+ ){1,3})dashboards\b/gi)) {
    const n = m[1].trim().split(" ").map(asNumber).find((x) => x !== undefined);
    if (n === undefined) continue;
    packCountClaims++;
    if (!real.includes(n))
      countClaimGaps.push(`"${p.folder}": "…${m[0].trim()}" — the pack seeds ` +
        `${p.seeded} and materializes ${p.examples} from the gallery (${real.join(" / ")})`);
  }
}
ok(`docs/index.html: every pack's dashboard count is a number the pack actually produces (${packCountClaims} claim(s))`,
  packCountClaims > 0 && !countClaimGaps.length,
  (packCountClaims ? countClaimGaps.join("\n      ")
    : "no entry states a dashboard count at all — a pack sold on its dashboards should say how many") +
  "\n      seeded, materialized, or the sum: any of the three is true, anything else is arithmetic nobody re-did");

// (d) "installed by default" is a fact about DEFAULT_INSTALLED
const defaultGaps = [];
for (const p of packRegistry) {
  const item = itemFor(p)[0] && itemProse(itemFor(p)[0]);
  if (!item) continue;
  const claims = /installed by default/i.test(item);
  if (claims && !defaultInstalled.includes(p.id))
    defaultGaps.push(`"${p.folder}" says it is installed by default, but DEFAULT_INSTALLED is [${defaultInstalled.join(", ")}]`);
  if (!claims && defaultInstalled.includes(p.id))
    defaultGaps.push(`"${p.folder}" IS in DEFAULT_INSTALLED, but its Help entry never says so`);
}
ok(`docs/index.html: the pack Help calls "installed by default" is the one in DEFAULT_INSTALLED (${defaultInstalled.join(", ")})`,
  !defaultGaps.length,
  `${defaultGaps.join("\n      ")}\n      ` +
  "what a fresh workspace contains is the first thing a new reader sees — when the default moves, this sentence has to move with it");

/* ── 35. the pack's OWN card copy vs what the pack seeds ────────────────────
   N7, and the check-34→card move — the same one 15 made after 14, 17 after 16, 28 after 24
   and 34 itself made after 23. Check 34 holds the Help PAGE accountable to the installer.
   This holds the two strings the registry writes about itself, which reach a reader FIRST
   and reach far more of them: `blurb` is the Settings → Sample packs card (app/studio.js
   renders it under the pack name, beside demoPackSourceLine), and `tagline` is what the
   pack tour and the welcome carousel drop into a sentence. Until now no check read either
   one's claims — the suite's #116 reads their SHAPE (count-led, says "embedded") and
   nothing read the counts.

   The N7 note that pointed here said Settings renders the `tagline` at app/studio.js:1046.
   Measured, that is two things wrong: Settings renders the `blurb` (studio.js:9925), and
   1046 is `demoPackCard`, the builder's pack card, which DECLUTTER-1 unwired — its own
   caller's comment says "buildDemoPacksLib stays (unused)". So the tagline's live surfaces
   are app/tutorial.js and app/welcome.js. Both strings are checked here either way.

   Measured 2026-08-09, before the fix — one drift, in both packs, in both strings:
   · **Every workspace pack seeds `connections`, and no card said so.** Conservation
     Insight seeds two (a demo file source and a demo Supabase repo) and Market Coverage
     one; all four strings listed dashboards, Views, datasets and the job and stopped.
   · **Worse than an omission: both closed on "nothing to connect"** — the only place the
     word appeared, and it says the opposite of what Install does. It was reaching for "no
     credentials to enter", which is true, but a reader who installs Conservation Insight
     and then finds two new rows in Connections was told there would be none. Help had
     already been corrected here (v921, check 34 rule (b)); the card had not.

   Four rules, all off check 34's derivation:
   (a) each string names every KIND its pack's installer seeds (check 34's rule (b), one
       surface over, applied per-string because each is standalone copy a reader may meet
       without the other);
   (b) every dashboard COUNT either string claims is one of that pack's real numbers —
       seeded, materialized from the gallery, or their sum (check 34's rule (c));
   (c) "installed by default" ⇔ DEFAULT_INSTALLED, on the BLURB only: Settings is the
       install surface, and the tagline is a count line inside someone else's sentence —
       requiring it there would be asking the tour to narrate a workspace default;
   (d) a pack that seeds connections may not tell the reader there is nothing to connect.
       This is the defect above, stated as a rule.
   No "invents a kind" rule, deliberately, and check 34 has none either: Data Management's
   copy names connections, datasets and jobs IN THE NEGATIVE ("no connections, datasets or
   jobs") and is exactly right to, so a rule that read the noun without its polarity would
   fail true copy. */
const cardStrings = (p) => [["tagline", p.tagline], ["blurb", p.blurb]].filter(([, s]) => s);
ok(`app/demopacks.js: every pack's card copy parsed for check 35 (${
  packRegistry.map((p) => `${p.id}: tagline ${p.tagline.length}ch, blurb ${p.blurb.length}ch`).join(" · ")})`,
  packRegistry.length > 0 && packRegistry.every((p) => cardStrings(p).length === 2),
  "a pack with no tagline or no blurb renders an empty card — the suite's shape check (#116) " +
  "and every rule below read these two strings");

// (a) each string names every kind its installer seeds
const cardKindGaps = [];
for (const p of packRegistry)
  for (const [which, s] of cardStrings(p))
    for (const t of p.tables) {
      const noun = PACK_TABLE_NOUN[t];
      // "View" is a proper noun (LF57) and is matched as one — checks 23 and 34's rule.
      if (!new RegExp(`\\b${noun}s?\\b`, /^[A-Z]/.test(noun) ? "" : "i").test(s))
        cardKindGaps.push(`"${p.folder}" seeds ${t} but its ${which} never says "${noun}"`);
    }
ok("app/demopacks.js: every pack's card copy names every kind of thing its installer seeds",
  !cardKindGaps.length,
  `${cardKindGaps.join("\n      ")}\n      ` +
  "the card is where a reader decides whether to click Install — a pack that quietly seeds " +
  "connections has changed a catalog they never agreed to change");

// (b) every dashboard count is one of the pack's real numbers
const cardCountGaps = [];
let cardCountClaims = 0;
for (const p of packRegistry) {
  const real = [...new Set([p.seeded, p.examples, p.seeded + p.examples].filter(Boolean))];
  for (const [which, s] of cardStrings(p))
    // Same shape as check 34's rule (c): the number belongs to the noun, not to a fixed
    // slot before it ("6 dashboards", "12 generic showcase dashboards").
    for (const m of s.matchAll(/((?:[\w-]+ ){1,3})dashboards\b/gi)) {
      const n = m[1].trim().split(" ").map(asNumber).find((x) => x !== undefined);
      if (n === undefined) continue;
      cardCountClaims++;
      if (!real.includes(n))
        cardCountGaps.push(`"${p.folder}" ${which}: "…${m[0].trim()}" — the pack seeds ` +
          `${p.seeded} and materializes ${p.examples} from the gallery (${real.join(" / ")})`);
    }
}
ok(`app/demopacks.js: every pack card's dashboard count is a number the pack actually produces (${cardCountClaims} claim(s))`,
  cardCountClaims > 0 && !cardCountGaps.length,
  (cardCountClaims ? cardCountGaps.join("\n      ")
    : "no card states a dashboard count — #116 requires these strings be count-led, so this cannot be right") +
  "\n      seeded, materialized, or the sum: any of the three is true, anything else is arithmetic nobody re-did");

// (c) "installed by default" is a fact about DEFAULT_INSTALLED — on the blurb
const cardDefaultGaps = [];
for (const p of packRegistry) {
  const claims = /installed by default/i.test(p.blurb);
  if (claims && !defaultInstalled.includes(p.id))
    cardDefaultGaps.push(`"${p.folder}" blurb says it is installed by default, but DEFAULT_INSTALLED is [${defaultInstalled.join(", ")}]`);
  if (!claims && defaultInstalled.includes(p.id))
    cardDefaultGaps.push(`"${p.folder}" IS in DEFAULT_INSTALLED, but its blurb never says so`);
}
ok(`app/demopacks.js: the pack whose blurb says "installed by default" is the one in DEFAULT_INSTALLED (${defaultInstalled.join(", ")})`,
  !cardDefaultGaps.length,
  `${cardDefaultGaps.join("\n      ")}\n      ` +
  "the same sentence check 34 holds Help to, on the card Help is describing — when SP-1 (c2) " +
  "moves the default, both fail together rather than one going quietly stale");

// (d) a pack that seeds connections may not say there is nothing to connect
const NOTHING_TO_CONNECT = /nothing to connect/i;
const connectGaps = [];
for (const p of packRegistry) {
  if (!p.tables.includes("connections")) continue;
  for (const [which, s] of cardStrings(p))
    if (NOTHING_TO_CONNECT.test(s))
      connectGaps.push(`"${p.folder}" ${which} says "nothing to connect" while its installer seeds connections`);
}
ok('app/demopacks.js: no pack that seeds connections tells the reader there is "nothing to connect"',
  !connectGaps.length,
  `${connectGaps.join("\n      ")}\n      ` +
  'the copy means "no credentials to enter" — say that, because the literal reading is false ' +
  "the moment Install writes a connection row");

/* ── 36. Help's Keyboard shortcuts table vs the shortcuts the app really has ─
   N7, and the same one-document-over move as 15→14, 17→16, 28→24 and 35→34 — except the
   document being moved FROM is the app itself. `showShortcuts()` in app/studio.js renders
   the panel `?` opens; docs/index.html has a <table class="kbd-table"> that is supposed to
   be the same list for a reader who never presses `?`. Nothing compared them, and the
   suite only ever asserted two individual rows of the panel ("/" and Ctrl/⌘+K).

   Measured 2026-08-09, before the fix — the panel published 15 keyboard rows, the table 10:
   · **Redo was documented as a key that has never worked.** Help said `Shift Z` / `Shift ⌘ Z`.
     The handler is one block guarded by `if (!(e.metaKey || e.ctrlKey)) return;`, so bare
     Shift+Z falls straight through it. Rule (c) is that early return, stated as a rule.
   · **Ctrl/⌘+Y is a real redo alias that appeared in neither document** — `k === "y"` sits in
     the same branch as Shift+Z. It is the one drift running the OTHER way (the app doing more
     than it says), which is why rule (a) reads the handler and not just the two copies.
   · **Four keys the panel published were missing from Help**: Ctrl/⌘+F (the Data panel search
     — shipped at v879 and never documented here), `/` (the chart-gallery search), Escape's
     leave-Focus-mode meaning, and Tab.
   · **The section's opening sentence was wrong about all of them**: "All shortcuts work when
     the builder pane has keyboard focus (click anywhere on the canvas or inspector first)."
     Every handler is on `document` and bails only inside a text field — and the table's own
     ⌘K row said "works from anywhere, any section" three lines below.

   Four rules:
   (a) the panel names every Ctrl/⌘ letter chord the modifier keydown block acts on;
   (b) every KEY row the panel publishes has a row in Help's table (gesture rows — a row whose
       key cell holds something that is not a key, like "Double-click View title" — are excluded
       BY SHAPE, check 18's idiom, and counted in the parse assertion so a shape change shows up);
   (c) Help documents no letter shortcut without Ctrl/⌘, because that block returns without one;
   (d) Help documents no Ctrl/⌘ letter the panel does not publish.
   Scoped to the TABLE, not the whole section: the prose below it covers the Viewer's ↵/Space/Tab
   reading keys, which are not builder chords and have their own paragraphs. */

// The app's own published reference — the rows literal inside showShortcuts(), bracket-matched
// the way check 19 brace-matches the build tour.
function shortcutPanelRows() {
  const src = read("app/studio.js");
  const fn = src.indexOf("function showShortcuts()");
  if (fn < 0) throw new Error("doc-truth: showShortcuts() not found in app/studio.js");
  const open = src.indexOf("var rows = [", fn);
  if (open < 0) throw new Error("doc-truth: showShortcuts()'s rows literal not found");
  let depth = 0, i = src.indexOf("[", open);
  for (; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]" && --depth === 0) break;
  }
  return [...src.slice(open, i + 1).matchAll(/\["([^"]+)",\s*"([^"]+)"\]/g)].map((m) => ({ keys: m[1], action: m[2] }));
}

// The one keydown block that requires a modifier — undo/redo/duplicate/save live here, and so
// does the undocumented Y. Each `else if` branch is a disjunction; a disjunct is one chord.
function modifierChordHandler() {
  const src = read("app/studio.js");
  const at = src.indexOf('if (!(e.metaKey || e.ctrlKey)) return;');
  if (at < 0) throw new Error("doc-truth: the Ctrl/⌘ keydown block not found in app/studio.js");
  let depth = 1, i = at;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) break;
  }
  const body = src.slice(at, i);
  const out = new Set();
  for (const branch of body.split(/\belse if\b|\bif\b/).slice(1))
    for (const disjunct of (branch.split("{")[0] || "").split("||")) {
      const letter = disjunct.match(/k === "([a-z])"/);
      if (!letter) continue;
      // `!e.shiftKey` is the absence of the modifier, not its presence.
      const shift = /(?<!!)e\.shiftKey/.test(disjunct);
      // Canonicalised exactly like a copy cell is, so the two sides are comparable.
      out.add(canon([...(shift ? ["mod", "shift"] : ["mod"]), letter[1]]));
    }
  return out;
}

// One key cell → the set of chords it expresses, canonicalised so "Ctrl / ⌘  +  Shift+Z" and
// "<kbd>Shift ⌘ Z</kbd>" become the same token. Returns null when the cell names a gesture
// rather than a key (an unrecognised word), which is how rule (b) excludes those rows.
const KEY_ALIASES = {
  ctrl: "mod", "⌘": "mod", cmd: "mod", command: "mod", meta: "mod", shift: "shift",
  del: "delete", delete: "delete", backspace: "backspace", esc: "escape", escape: "escape",
  tab: "tab", enter: "enter", "↵": "enter", space: "space",
  "↑": "↑", "↓": "↓", "←": "←", "→": "→", "?": "?", "/": "/",
};
function chordsOf(cell) {
  const text = cell.replace(/\([^)]*\)/g, " ").trim();
  if (text === "/") return [["/"]];                          // the one place "/" is a key, not a separator
  const parts = text.replace(/Ctrl\s*\/\s*⌘/gi, "Ctrl").split("/").map((s) => s.trim()).filter(Boolean);
  const chords = [], mods = [];
  for (const [n, alt] of parts.entries()) {
    const tokens = [];
    for (const raw of alt.split(/[+\s]+/).filter(Boolean)) {
      const t = KEY_ALIASES[raw.toLowerCase()] || (/^[A-Za-z]$/.test(raw) ? raw.toLowerCase() : null);
      if (!t) return null;                                   // a word that is not a key ⇒ a gesture row
      tokens.push(t);
    }
    // "Shift + ← / →" writes the modifier once and means it for both alternatives.
    if (n === 0) mods.push(...tokens.filter((t) => t === "mod" || t === "shift"));
    else if (!tokens.some((t) => t === "mod" || t === "shift")) tokens.unshift(...mods);
    chords.push([...new Set(tokens)].sort());
  }
  return chords;
}
// Canonical form is sorted (so two spellings of one chord compare equal); `pretty` puts the
// modifiers back in front for the failure messages, which humans read.
const canon = (chord) => [...chord].sort().join("+");
const chordSet = (cells) => new Set(cells.flatMap((c) => (chordsOf(c) || []).map(canon)));
const pretty = (c) => { const t = c.split("+"); const m = (x) => x === "mod" || x === "shift"; return [...t.filter((x) => x === "mod"), ...t.filter((x) => x === "shift"), ...t.filter((x) => !m(x))].join("+"); };
const prettyList = (cs) => [...cs].map(pretty).sort().join(", ");

const panelRows = shortcutPanelRows();
const handlerChords = modifierChordHandler();
const panelKeyCells = panelRows.map((r) => r.keys).filter((k) => chordsOf(k));
const panelGestures = panelRows.map((r) => r.keys).filter((k) => !chordsOf(k));
ok(`app/studio.js: the "?" panel parsed for check 36 (${panelKeyCells.length} key row(s), ` +
   `${panelGestures.length} gesture row(s), ${handlerChords.size} Ctrl/⌘ chord(s) in the handler)`,
  panelRows.length > 0 && panelKeyCells.length > 0 && handlerChords.size > 0,
  "every rule below reads showShortcuts()'s rows literal and the modifier keydown block — " +
  "an empty parse would pass all four while measuring nothing");

const helpKbdTable = (read("docs/index.html").match(/<table class="kbd-table">([\s\S]*?)<\/table>/) || [, ""])[1];
const helpCells = [...helpKbdTable.matchAll(/<kbd>([^<]+)<\/kbd>/g)].map((m) => m[1].trim());
ok(`docs/index.html: the Keyboard shortcuts table parsed for check 36 (${helpCells.length} <kbd> cell(s))`,
  !!helpKbdTable && helpCells.length > 0,
  'the <table class="kbd-table"> block was not found, or holds no <kbd> — the three rules below read it');

// (a) the panel names every Ctrl/⌘ letter the handler acts on
const panelChords = chordSet(panelKeyCells);
const unpublished = [...handlerChords].filter((c) => !panelChords.has(c));
ok(`app/studio.js: the "?" panel names every Ctrl/⌘ shortcut the builder implements (${prettyList(handlerChords)})`,
  !unpublished.length,
  `handled but absent from the panel: ${prettyList(unpublished)}\n      ` +
  "a shortcut nobody documents is one nobody uses — and the reader who presses it by accident " +
  "has no way to find out what just happened");

// (b) Help's table carries every key row the panel publishes
const helpChords = chordSet(helpCells);
const missingFromHelp = [...panelChords].filter((c) => !helpChords.has(c));
ok(`docs/index.html: the Keyboard shortcuts table lists every key the app's "?" panel does (${panelChords.size} chord(s))`,
  !missingFromHelp.length,
  `in the app's panel, missing from Help: ${prettyList(missingFromHelp)}\n      ` +
  "Help is where a reader who never presses ? learns these — check 24's premise, one surface over");

// (c) a letter shortcut without Ctrl/⌘ does not exist: the block returns before reading the key
const LETTER = /^[a-z]$/;
const modless = [...helpChords].filter((c) => c.split("+").some((t) => LETTER.test(t)) && !c.split("+").includes("mod"));
ok("docs/index.html: every letter shortcut it documents names Ctrl/⌘",
  !modless.length,
  `documented without a modifier: ${prettyList(modless)}\n      ` +
  "app/studio.js's chord handler opens with `if (!(e.metaKey || e.ctrlKey)) return;`, so a bare " +
  "letter (or Shift+letter) reaches nothing — this is how the Redo row was wrong for months");

// (d) and it invents no Ctrl/⌘ letter the panel does not publish
const invented = [...helpChords].filter((c) => c.includes("mod") && c.split("+").some((t) => LETTER.test(t)) && !panelChords.has(c));
ok("docs/index.html: it documents no Ctrl/⌘ shortcut the app does not have",
  !invented.length,
  `in Help, not in the app's panel: ${prettyList(invented)}\n      ` +
  "the negative half — rule (b) alone would let a retired shortcut sit in the table forever");

/* ── 37. Help's export-format table vs the Export ▾ menu it describes ───────
   N7, and check 36's move one table over: docs/index.html has a
   <table class="export-table"> whose Format column is supposed to be the list a reader
   sees when they open Export ▾. Nothing compared them, and check 36 had just shown what
   an unchecked published table does.

   Measured 2026-08-09, before the fix — the builder's menu offered 7 formats, the table 6:
   · **The editable spec was missing from the table entirely.** `Editable spec (.studio.json)`
     is the sixth button in the menu, and Help names it twice ELSEWHERE ("use Export ▾ →
     Editable spec (.studio.json) — that file is all a dashboard needs") while the table
     claiming to be the format list left it out. The one export a reader most needs a
     description of — what travels in it, what does not — had none.
   · **Row 1 named a format the app has never shown.** `Dashboard Framework` is the internal
     name for the artifact (a text panel's inspector note uses it); every user-facing surface,
     including Help's own Viewer paragraph 1,700 lines above, says `Dashboard (.html)`. Five
     rows matched the button you press and one did not.
   · **The bundle row's label was inverted** — `Bundle (all artifacts)` for a button that reads
     `All artifacts (bundle)`.
   · **The Viewer paragraph claimed parity it does not have.** "an Export button … with the
     same formats Studio offers" — the viewer's own menu (app/viewer.html) has 3 of the 7.
     It is the drift running the other way: the app doing LESS than the copy says.

   Four rules:
   (a) every label the builder's #menuExport publishes has a row in the table;
   (b) the table names no format that menu does not offer (the negative half — (a) alone would
       let a renamed or retired format sit in the table forever, which is exactly how
       "Dashboard Framework" survived);
   (c) every label the VIEWER's #viewerExportMenu publishes is named in the Viewer's own export
       paragraph (#viewer-export);
   (d) that paragraph claims format parity with the builder only while the two menus really
       agree. Derived, not a banned phrase: the rule fires only when the inventories differ.
   Both menus are read from the markup, not from studio.js/viewer.js — the buttons ARE the
   list, and both files wire whatever `data-exp` they find. */

// A menu's published labels: the <button data-exp> children of the named container. Both
// menus are flat (no nested <div>), so the container ends at the first </div> after its id.
function exportMenuLabels(file, menuId) {
  const src = read(file);
  const at = src.indexOf(`id="${menuId}"`);
  if (at < 0) throw new Error(`doc-truth: #${menuId} not found in ${file}`);
  const end = src.indexOf("</div>", at);
  if (end < 0) throw new Error(`doc-truth: #${menuId} in ${file} is unterminated`);
  return [...src.slice(at, end).matchAll(/<button[^>]*\bdata-exp="[^"]*"[^>]*>([\s\S]*?)<\/button>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
// Labels compare case-insensitively on their visible text — Help writes "editable spec (.json)"
// mid-sentence where the button carries a capital E, and that is a sentence, not a drift.
const labelKey = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();

const studioExports = exportMenuLabels("app/index.html", "menuExport");
const viewerExports = exportMenuLabels("app/viewer.html", "viewerExportMenu");
ok(`app/index.html + app/viewer.html: the export menus parsed for check 37 ` +
   `(builder ${studioExports.length}, viewer ${viewerExports.length})`,
  studioExports.length >= 5 && viewerExports.length >= 2,
  `builder: ${studioExports.join(" · ") || "(none)"}\n      viewer: ${viewerExports.join(" · ") || "(none)"}\n      ` +
  "all four rules below read these two lists — an empty parse would pass every one of them");

const exportTable = (read("docs/index.html").match(/<table class="export-table">([\s\S]*?)<\/table>/) || [, ""])[1];
// The Format column only: the FIRST <td> of each row. A format's description may legitimately
// mention another format ("both artifacts together — the .html and the … spec").
const exportRowLabels = [...exportTable.matchAll(/<tr>\s*<td>([\s\S]*?)<\/td>/g)]
  .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
ok(`docs/index.html: the export-format table parsed for check 37 (${exportRowLabels.length} row(s))`,
  !!exportTable && exportRowLabels.length > 0,
  'the <table class="export-table"> block was not found, or has no rows — rules (a) and (b) read it');

// (a) every format the builder offers has a row
const tableKeys = new Set(exportRowLabels.map(labelKey));
const undocumentedFormats = studioExports.filter((l) => !tableKeys.has(labelKey(l)));
ok(`docs/index.html: the export table has a row for every format Export ▾ offers (${studioExports.length})`,
  !undocumentedFormats.length,
  `in the menu, missing from the table: ${undocumentedFormats.join(", ")}\n      ` +
  "this table is where a reader decides WHICH button to press — a format with no row is one " +
  "they will never choose deliberately");

// (b) and no row for a format it does not
const studioKeys = new Set(studioExports.map(labelKey));
const strayFormats = exportRowLabels.filter((l) => !studioKeys.has(labelKey(l)));
ok("docs/index.html: the export table names no format the Export ▾ menu does not offer",
  !strayFormats.length,
  `in the table, not in the menu: ${strayFormats.join(", ")}\n      ` +
  `the menu's own labels are: ${studioExports.join(", ")}\n      ` +
  "the negative half — a reader hunting the table's label in the menu finds nothing, which is " +
  "how the internal name \"Dashboard Framework\" outlived every user-facing use of it");

// (c) the Viewer's paragraph names every format the viewer's own menu has
const viewerPara = (read("docs/index.html").match(/<p id="viewer-export">([\s\S]*?)<\/p>/) || [, ""])[1]
  .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
ok('docs/index.html: the Viewer export paragraph (<p id="viewer-export">) parsed for check 37',
  !!viewerPara, "rules (c) and (d) read it; the id is its anchor");
const unnamedInViewer = viewerExports.filter((l) => !labelKey(viewerPara).includes(labelKey(l)));
ok(`docs/index.html: the Viewer paragraph names every format the viewer's Export menu offers (${viewerExports.length})`,
  !unnamedInViewer.length,
  `in the viewer's menu, unnamed in the paragraph: ${unnamedInViewer.join(", ")}\n      ` +
  "a viewer-role reader never sees the builder's menu, so this paragraph is their whole list");

// (d) it claims parity with the builder only while the two menus agree
const menusAgree = studioKeys.size === new Set(viewerExports.map(labelKey)).size &&
  viewerExports.every((l) => studioKeys.has(labelKey(l)));
const claimsParity = /\bthe same formats?\b/i.test(viewerPara);
ok("docs/index.html: the Viewer paragraph claims parity with Export ▾ only when the menus agree",
  !claimsParity || menusAgree,
  `the paragraph says the viewer offers "the same formats" as Studio, but the viewer's menu has ` +
  `${viewerExports.length} of the builder's ${studioExports.length}: ` +
  `${studioExports.filter((l) => !new Set(viewerExports.map(labelKey)).has(labelKey(l))).join(", ")} ` +
  "are builder-only\n      the drift that runs the other way — copy promising more app than ships");

/* ── 38. Help's Connections inventory vs the picker the wizard really renders ───
   N7, and check 37's move one catalog over: the Connections wizard's step 1 is a
   picker, and app/connections.js builds it by iterating `Studio.dataSources()` —
   every registered adapter whose `caps.data` is true, in registry order. Nothing
   compared that list to Help.

   Measured 2026-08-09, before the fix — the picker offered 13 connectors and Help
   documented four of them:
   · Help's only enumeration of what a Connection can BE was a parenthetical inside
     the live-after-export paragraph: "(Turso, PostgreSQL/PostgREST, Supabase, Google
     Sheets, local files, Amazon Redshift)" — six of the thirteen, and the sentence
     around it described a contract that applies to all of them.
   · `Workspace connections:` sections existed for PostgREST, Redshift, Google Sheets
     and CSV/JSON files. **Firebase had none anywhere on the page**, and six more —
     Snowflake, Databricks, BigQuery, DuckDB, SQLite and Generic SQL / HTTP — were
     documented ONLY as dashboard-only source types in the data-source builder. Those
     six are the same adapters the Connections wizard offers, so a reader who wanted
     one Snowflake connection shared by every dataset had no page that said they could
     have one; Help's own text pointed them at a per-dashboard query instead.
   · `workspace-capable` — the badge the picker prints on the three adapters that can
     also host the workspace — appeared nowhere in Help or on the landing page.

   Five rules:
   (a) every connector the picker offers is named in Help's inventory, by the label the
       picker itself prints;
   (b) the inventory names no connector the registry does not have (the negative half —
       (a) alone would let a retired or renamed adapter sit in the list forever, which is
       how the six-name parenthetical stayed plausible while the picker grew to thirteen);
   (c) the inventory is in the picker's order, so the page can be read beside the screen;
   (d) the `workspace-capable` badge marks exactly the connectors whose `caps.meta` is
       true — the claim is about which ones can host a workspace, not a decoration;
   (e) the "used either way" set is the one the data-source builder really shares with
       the registry (DS_TYPES ∩ the adapters), counted in words in the same paragraph.

   The picker order is REPRODUCED rather than hand-kept: registry.js seeds four adapters
   and every other file appends itself via Studio.registerSource as it loads, so
   app/index.html's <script> order IS the registry order. Rule (0) below asserts the seed
   array still agrees with its own load order, so a reordered registry.js fails here
   rather than silently making rule (c) test the wrong sequence. */

// Every adapter each app/sources/*.js file declares, in the order app/index.html loads them.
// caps come from the adapter's own literal where it has one, else from a file-level
// assignment (data-adapters.js sets `def.caps` once for all seven warehouse adapters).
const sourceFiles = [...read("app/index.html")
  .matchAll(/<script src="app\/sources\/([\w-]+\.js)"><\/script>/g)].map((m) => m[1]);
const pickerRegistry = [];
for (const f of sourceFiles) {
  const src = read("app/sources/" + f);
  const fileCaps = (src.match(/\.caps\s*=\s*\{([^}]*)\}/) || [, ""])[1];
  const decls = [...src.matchAll(/\bid:\s*"([\w-]+)",\s*(?:\/\/[^\n]*)?\s*label:\s*"([^"]+)"/g)];
  decls.forEach((m, i) => {
    const window = src.slice(m.index, i + 1 < decls.length ? decls[i + 1].index : src.length);
    const caps = (window.match(/caps:\s*\{([^}]*)\}/) || [, fileCaps])[1];
    // `local` is the adapter's own "I am this browser, not a remote" flag — registry.js's
    // remoteMetaSources() filters on it, and check 39 needs the same distinction.
    pickerRegistry.push({ id: m[1], label: m[2], meta: /meta:\s*true/.test(caps),
      data: /data:\s*true/.test(caps), local: /\blocal:\s*true/.test(window) });
  });
}
const connectors = pickerRegistry.filter((a) => a.data);
ok(`app/sources/: the adapter registry parsed for check 38 (${pickerRegistry.length} adapter(s), ` +
   `${connectors.length} data-capable)`,
  pickerRegistry.length >= 10 && connectors.length >= 8,
  `parsed: ${pickerRegistry.map((a) => a.id).join(", ") || "(none)"}\n      ` +
  "all five rules below read this list — an empty parse would pass every one of them");

// (0) the seed array in registry.js still matches the order its four files load in
const seedIds = [...(read("app/sources/registry.js").match(/Studio\.SOURCES\s*=\s*\[([\s\S]*?)\]/) || [, ""])[1]
  .matchAll(/Studio\.(\w+?)Source/g)].map((m) => m[1].toLowerCase());
ok("app/sources/registry.js: the seeded adapters are in the order app/index.html loads them",
  seedIds.every((id, i) => pickerRegistry[i] && pickerRegistry[i].id === id),
  `registry.js seeds: ${seedIds.join(", ")}\n      ` +
  `the first ${seedIds.length} adapter(s) by load order: ${pickerRegistry.slice(0, seedIds.length).map((a) => a.id).join(", ")}\n      ` +
  "rule (c) below compares Help against the load order, so these two must agree or it tests " +
  "the wrong sequence");

// Help's inventory: the <ul> in the #connection-types section, one <li> per connector, each
// led by its label in <strong>.
const connSection = (read("docs/index.html")
  .match(/<h3 id="connection-types">([\s\S]*?)(?=<h3[ >])/) || [, ""])[1];
const connIntro = connSection.replace(/<ul>[\s\S]*/, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const connItems = [...((connSection.match(/<ul>([\s\S]*?)<\/ul>/) || [, ""])[1])
  .matchAll(/<li>\s*<strong>([\s\S]*?)<\/strong>([\s\S]*?)<\/li>/g)]
  .map((m) => ({ label: m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(), rest: m[2] }));
ok(`docs/index.html: the Connections inventory parsed for check 38 (${connItems.length} entry/entries)`,
  !!connSection && connItems.length > 0,
  'the <h3 id="connection-types"> section, or the <ul> inside it, was not found — rules (a)–(e) read it');

// (a) every connector the picker offers is on the page
const listed = new Set(connItems.map((e) => labelKey(e.label)));
const undocumentedConnectors = connectors.filter((a) => !listed.has(labelKey(a.label)));
ok(`docs/index.html: the Connections inventory names every connector the wizard offers (${connectors.length})`,
  !undocumentedConnectors.length,
  `in the picker, missing from Help: ${undocumentedConnectors.map((a) => `${a.label} (${a.id})`).join(", ")}\n      ` +
  "this list is where a reader learns a backend can be a saved, reusable connection at all — " +
  "an adapter with no entry is one they will only find by opening the wizard");

// (b) and none the registry does not have
const registryKeys = new Set(connectors.map((a) => labelKey(a.label)));
const strayConnectors = connItems.filter((e) => !registryKeys.has(labelKey(e.label)));
ok("docs/index.html: the Connections inventory names no connector the registry does not have",
  !strayConnectors.length,
  `in Help, not in the picker: ${strayConnectors.map((e) => e.label).join(", ")}\n      ` +
  `the picker's own labels are: ${connectors.map((a) => a.label).join(", ")}\n      ` +
  "the negative half — including `Local (this browser)`, which is caps.data:false on purpose " +
  "(a workspace store is not somewhere a dataset connects out to)");

// (c) in the picker's order
ok("docs/index.html: the Connections inventory is in the picker's own order",
  connItems.length === connectors.length &&
    connItems.every((e, i) => labelKey(e.label) === labelKey(connectors[i].label)),
  `Help: ${connItems.map((e) => e.label).join(" · ")}\n      ` +
  `picker: ${connectors.map((a) => a.label).join(" · ")}\n      ` +
  "the page is read beside the wizard, so the two sequences have to match");

// (d) the workspace-capable badge marks exactly the adapters that can host a workspace
const badged = new Set(connItems.filter((e) => /workspace-capable/.test(e.rest)).map((e) => labelKey(e.label)));
const shouldBeBadged = connectors.filter((a) => a.meta);
const badgeWrong = [
  ...shouldBeBadged.filter((a) => !badged.has(labelKey(a.label))).map((a) => `${a.label} hosts a workspace but is not badged`),
  ...connItems.filter((e) => badged.has(labelKey(e.label)) &&
    !shouldBeBadged.some((a) => labelKey(a.label) === labelKey(e.label)))
    .map((e) => `${e.label} is badged but its caps.meta is false`),
];
ok(`docs/index.html: the workspace-capable badge marks exactly the ${shouldBeBadged.length} adapter(s) ` +
   "that can host a workspace",
  !badgeWrong.length,
  badgeWrong.join("\n      ") + "\n      " +
  "the picker prints this badge from caps.meta — Help repeating it is a claim about which " +
  "backends a whole workspace can live in, which is a data-durability decision for the reader");

// (e) the "usable either way" set — the data-source builder's own types that are ALSO registered
// adapters. DS_TYPES names its kinds; two differ from the adapter id they map to, and an
// unmapped kind fails here rather than quietly shrinking the set.
const DS_KIND_ADAPTER = { sql: null, duckdb: "duckdb", httpvfs: "sqlite", snowflake: "snowflake",
  databricks: "databricks", bigquery: "bigquery", http: "httpsql" };
const dsKinds = [...((read("app/studio.js").match(/var DS_TYPES = \[([\s\S]*?)\n {2}\];/) || [, ""])[1])
  .matchAll(/\{\s*kind:\s*"([\w-]+)"/g)].map((m) => m[1]);
ok(`app/studio.js: DS_TYPES parsed for check 38 (${dsKinds.length} type(s)), and every kind is mapped`,
  dsKinds.length > 0 && dsKinds.every((k) => k in DS_KIND_ADAPTER),
  `unmapped kind(s): ${dsKinds.filter((k) => !(k in DS_KIND_ADAPTER)).join(", ") || "(none)"} — add them to ` +
  "DS_KIND_ADAPTER in tools/doc-truth.mjs so adding a builder source type forces a decision " +
  "about whether Help's \"either way\" sentence still holds");
const bothWays = connectors.filter((a) => dsKinds.some((k) => DS_KIND_ADAPTER[k] === a.id));
const NUMBER_WORD = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const bothWaysNamed = bothWays.filter((a) => labelKey(connIntro).includes(labelKey(a.label)));
ok(`docs/index.html: the "used either way" paragraph names all ${bothWays.length} shared connector(s), ` +
   `and counts them as "${NUMBER_WORD[bothWays.length] || bothWays.length}"`,
  bothWaysNamed.length === bothWays.length &&
    new RegExp(`\\b${NUMBER_WORD[bothWays.length] || bothWays.length}\\b`, "i").test(connIntro),
  `shared by the builder and the wizard: ${bothWays.map((a) => a.label).join(", ")}\n      ` +
  `unnamed in the paragraph: ${bothWays.filter((a) => !bothWaysNamed.includes(a)).map((a) => a.label).join(", ") || "(none)"}\n      ` +
  "this sentence is the one that tells a reader the Snowflake section above and this list are " +
  "the same backend — a wrong count here sends them looking for a seventh");

/* ── 39. Help's workspace-backend chooser vs the picker Settings really renders ──
   N7, and check 38's move one picker over. There are TWO adapter pickers in the app and
   check 38 only held the first. Settings → Workspace backend → Connect renders
   `Studio.remoteMetaSources()` (every caps.meta adapter except the local one) and then a
   hard-coded roadmap row of greyed, unselectable "Future" cards.

   Measured 2026-08-09, before the fix — the picker rendered SIX cards and Help's
   "Choosing a workspace backend" table documented four:
   · The three Future cards — PostgreSQL, Cloudflare D1, MongoDB Atlas — were named NOWHERE
     on the page. `Cloudflare`, `MongoDB`, `Atlas` and `D1` each had zero occurrences in
     docs/index.html, so a reader who opened the picker met three greyed cards Help had not
     prepared them for and no way to tell "planned" from "broken".
   · The first of them makes that worse rather than merely incomplete: the card says
     **PostgreSQL**, and Help's own Connections inventory three sections above — check 38's
     subject, shipped the same day — lists **PostgreSQL (PostgREST)** as a connector you can
     use today. The page appeared to contradict itself, and the thing that resolves it
     (answering dataset queries and hosting the catalog are different capabilities;
     postgrest's caps.meta is false) was stated nowhere.

   Five rules:
   (a) every backend the table has to document is there — the caps.meta adapters, which is
       remoteMetaSources() PLUS the local one (the wizard never offers Local because it is
       where you already are, but it is the default and the table's first row);
   (b) the table names no backend the registry does not have (the negative half — a retired
       adapter would otherwise sit in a comparison table forever);
   (c) the table is in the registry's own order, so it reads beside the picker;
   (d) the intro's count word matches the number of rows the derivation produces — the
       sentence opens "All four options", the exact shape of claim check 38 rule (e) caught;
   (e) the roadmap paragraph names EXACTLY the picker's Future set — every one of them, and
       none that has since shipped. The second direction is the one that goes stale: the day
       a D1 adapter lands, this paragraph is advertising it as unavailable.

   The row label may be the adapter's label with its parenthetical dropped ("Local (this
   browser)" → "Local"), which is what the table does and what the rail prints; anything
   else is a mismatch. */

const shortLabel = (s) => s.replace(/\s*\([^)]*\)\s*$/, "").trim();
const backends = pickerRegistry.filter((a) => a.meta);
const futureBlock = (read("app/studio.js")
  .match(/\/\/ BACKEND-FUTURE[\s\S]*?\[([\s\S]*?)\]\.forEach/) || [, ""])[1];
const futureBackends = [...futureBlock.matchAll(/\{\s*label:\s*"([^"]+)",\s*blurb:\s*"((?:[^"\\]|\\.)*)"\s*\}/g)]
  .map((m) => m[1]);
ok(`app/sources/ + app/studio.js: the workspace-backend roster parsed for check 39 ` +
   `(${backends.length} shipped, ${futureBackends.length} on the roadmap)`,
  backends.length >= 3 && backends.some((a) => a.local) && futureBackends.length > 0,
  `shipped: ${backends.map((a) => a.label).join(", ") || "(none)"}\n      ` +
  `roadmap: ${futureBackends.join(", ") || "(none)"}\n      ` +
  "the roadmap list is the literal above `.forEach` under the BACKEND-FUTURE comment in " +
  "openBackendWizard — all five rules below read these two lists, and an empty parse would " +
  "pass every one of them");

// Help's table: the first <tbody> inside the "Choosing a workspace backend" section, one <tr>
// per backend, each led by its name in <strong>.
const backendSection = (read("docs/index.html")
  .match(/<h3 id="backend-choose">([\s\S]*?)(?=<h3[ >])/) || [, ""])[1];
const backendIntro = backendSection.replace(/<div class="table-scroll">[\s\S]*/, "")
  .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const backendRows = [...((backendSection.match(/<tbody>([\s\S]*?)<\/tbody>/) || [, ""])[1])
  .matchAll(/<tr>\s*<td>\s*<strong>([\s\S]*?)<\/strong>/g)]
  .map((m) => labelKey(m[1].replace(/<[^>]+>/g, "")));
ok(`docs/index.html: the workspace-backend table parsed for check 39 (${backendRows.length} row(s))`,
  !!backendSection && backendRows.length > 0,
  'the <h3 id="backend-choose"> section, or the <tbody> inside it, was not found — rules (a)–(d) read it');

// (a) every backend the registry can host a workspace in has a row
const rowSet = new Set(backendRows);
const rowFor = (a) => rowSet.has(labelKey(a.label)) || rowSet.has(labelKey(shortLabel(a.label)));
const undocumentedBackends = backends.filter((a) => !rowFor(a));
ok(`docs/index.html: the workspace-backend table documents every backend that can host one (${backends.length})`,
  !undocumentedBackends.length,
  `hosts a workspace, missing from the table: ${undocumentedBackends.map((a) => `${a.label} (${a.id})`).join(", ")}\n      ` +
  "this table is where a reader decides where their whole workspace is going to live — an " +
  "adapter with no row is one they can only evaluate by connecting to it");

// (b) and no row names a backend the registry does not have
const backendKeys = new Set(backends.flatMap((a) => [labelKey(a.label), labelKey(shortLabel(a.label))]));
const strayBackends = backendRows.filter((r) => !backendKeys.has(r));
ok("docs/index.html: the workspace-backend table names no backend the registry does not have",
  !strayBackends.length,
  `in the table, not caps.meta in the registry: ${strayBackends.join(", ")}\n      ` +
  `the registry's own workspace-capable adapters are: ${backends.map((a) => a.label).join(", ")}`);

// (c) in the registry's order (which is app/index.html's <script> load order — see check 38 rule (0))
ok("docs/index.html: the workspace-backend table is in the registry's own order",
  backendRows.length === backends.length &&
    backends.every((a, i) => backendRows[i] === labelKey(a.label) || backendRows[i] === labelKey(shortLabel(a.label))),
  `Help: ${backendRows.join(" · ")}\n      ` +
  `registry: ${backends.map((a) => shortLabel(a.label)).join(" · ")}`);

// (d) the intro counts them
ok(`docs/index.html: the workspace-backend intro counts the options as ` +
   `"${NUMBER_WORD[backends.length] || backends.length}"`,
  new RegExp(`\\b${NUMBER_WORD[backends.length] || backends.length}\\b`, "i").test(backendIntro),
  `the intro reads: ${backendIntro.slice(0, 220)}…\n      ` +
  `it should count ${backends.length} — a wrong number here is a reader hunting for a backend ` +
  "that is not on the table, or missing one that is");

// (e) the roadmap paragraph names exactly the picker's Future set — both directions
const futurePara = (read("docs/index.html").match(/<p id="backend-future">([\s\S]*?)<\/p>/) || [, ""])[1]
  .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const futureKey = labelKey(futurePara);
const futureMissing = futureBackends.filter((l) => !futureKey.includes(labelKey(l)));
const futureShipped = backends.filter((a) =>
  new RegExp(`\\b${shortLabel(a.label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(futurePara));
ok(`docs/index.html: the roadmap paragraph names exactly the ${futureBackends.length} "Future" card(s) the picker shows`,
  !!futurePara && !futureMissing.length && !futureShipped.length,
  `in the picker as Future, unnamed in Help: ${futureMissing.join(", ") || "(none)"}\n      ` +
  `named as Future but already shipped: ${futureShipped.map((a) => shortLabel(a.label)).join(", ") || "(none)"}\n      ` +
  'the paragraph is <p id="backend-future"> under the table — these cards are greyed and ' +
  "unselectable, so a reader who is not told they are the roadmap reads them as broken");

/* ── 40. Help's two theme lists vs the two theme rosters the app really renders ──
   N7, and check 39's move one pair of pickers over. The app themes ITSELF twice, from two
   registries that are deliberately kept in parity:
   · `Studio.DASHBOARD_THEMES` (app/model.js) — the whole-look presets the Dashboard theme
     swatch row renders (app/studio.js, one `.dt-swatch` per entry), and the same list the
     Settings "Default dashboard theme" <select> is built from. The row then appends ONE
     extra swatch, `data-dashboard-theme="custom"`, which has no registry entry by design
     (its colors are authored, not curated) — so it is derived here from that markup rather
     than carried in an exemption list, check 18's idiom.
   · `APP_THEME_KEYS` / `APP_THEME_LABELS` (app/studio.js) — the app-chrome Color theme cards
     in Settings → Appearance. Different keys ("modern" for the dashboard list's
     "fleet-modern"), same LABELS, bound by `APP_THEME_TO_DASHBOARD_THEME`.

   Measured 2026-08-09, before the fix — both rosters ship SEVEN looks and Help's Dashboard
   theme list published SIX:
   · **Conservation** was missing from it. The theme is in the registry (UX11 added it), the
     swatch row renders it, the Settings default <select> offers it — and the section a
     reader consults to choose a dashboard look did not mention it.
   · The page therefore contradicted itself in a way neither section could show alone: the
     Color theme list four sections below is complete, and its intro says the picker "offers
     the same seven looks as the Dashboard theme picker" — pointing at a list of six.

   Five rules:
   (a) the Dashboard theme list names every curated preset in the registry;
   (b) it names no preset the registry does not have, except the Custom swatch the row really
       appends (the negative half — a retired preset would otherwise sit in the list forever);
   (c) the Color theme list names exactly the app-chrome roster, both directions;
   (d) the count word in the Color theme intro's cross-reference matches the roster size —
       the exact shape of claim check 39 rule (d) caught, and the sentence that made the
       missing bullet visible;
   (e) parity-only-when-true: that cross-reference is only allowed to say "the same N looks"
       while the two registries really do carry the same labels. The day they diverge, this
       fails and the sentence has to change rather than quietly mislead.

   Deliberately NOT order-strict, unlike check 39 rule (c): both Help lists lead with Polecat,
   the default, where both registries lead with `classic`. That is an editorial choice about
   what a reader meets first, not drift — so this check holds the SETS and the counts, and
   leaves the order to the writer. Scoped to docs/index.html: `app/welcome.js` and
   `app/tutorial.js` were audited in the same pass and enumerate no themes at all. */

const dashThemes = [...(read("app/model.js")
  .match(/Studio\.DASHBOARD_THEMES = \[([\s\S]*?)\n  \];/) || [, ""])[1]
  .matchAll(/\{ key: "([a-z0-9-]+)", label: "([^"]+)"/g)].map((m) => ({ key: m[1], label: m[2] }));
// The one swatch the row appends that is NOT a registry entry — read from the markup that
// appends it, so "Custom" stays exempt only for as long as the picker really offers it.
const customSwatch = /data-dashboard-theme", "custom"/.test(read("app/studio.js"));
const appThemeLabels = [...(read("app/studio.js")
  .match(/var APP_THEME_LABELS = \{([\s\S]*?)\};/) || [, ""])[1]
  .matchAll(/(?:"[a-z0-9-]+"|[a-z0-9]+):\s*"([^"]+)"/g)].map((m) => m[1]);
ok(`app/model.js + app/studio.js: the two theme rosters parsed for check 40 ` +
   `(${dashThemes.length} dashboard preset(s), ${appThemeLabels.length} app theme(s)` +
   `${customSwatch ? ", plus the Custom swatch" : ""})`,
  dashThemes.length > 1 && appThemeLabels.length > 1,
  `dashboard: ${dashThemes.map((t) => t.label).join(", ") || "(none)"}\n      ` +
  `app chrome: ${appThemeLabels.join(", ") || "(none)"}\n      ` +
  "both are read by regex from their own literals — an empty parse would pass every rule below");

// Each Help list is the first <ul> after its <h3>; each entry is led by its name in <strong>.
function themeBullets(anchor) {
  const section = (read("docs/index.html")
    .match(new RegExp(`<h3 id="${anchor}">([\\s\\S]*?)(?=<h3[ >]|</section>)`)) || [, ""])[1];
  // The intro is the section's first <p> — the prose a reader meets above the list. Read it
  // narrowly rather than "everything before the <ul>" so a count word in the figure's alt text
  // can never stand in for one the sentence is missing.
  const intro = ((section.match(/<p>([\s\S]*?)<\/p>/) || [, ""])[1])
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const list = (section.match(/<ul>([\s\S]*?)<\/ul>/) || [, ""])[1];
  const names = [...list.matchAll(/<li><strong>([\s\S]*?)<\/strong>/g)]
    .map((m) => labelKey(m[1].replace(/<[^>]+>/g, "")));
  return { found: !!section, intro, names };
}
const dashHelp = themeBullets("dash-theme");
const appHelp = themeBullets("color-theme");
ok(`docs/index.html: both theme lists parsed for check 40 ` +
   `(${dashHelp.names.length} dashboard bullet(s), ${appHelp.names.length} color-theme bullet(s))`,
  dashHelp.found && appHelp.found && dashHelp.names.length > 0 && appHelp.names.length > 0,
  'the <h3 id="dash-theme"> / <h3 id="color-theme"> sections, or the first <ul> inside them, ' +
  "were not found — rules (a)–(e) read them");

// (a) every curated preset the swatch row renders has a bullet
const dashHelpSet = new Set(dashHelp.names);
const undocumentedThemes = dashThemes.filter((t) => !dashHelpSet.has(labelKey(t.label)));
ok(`docs/index.html: the Dashboard theme list names every curated preset the picker renders (${dashThemes.length})`,
  !undocumentedThemes.length,
  `in Studio.DASHBOARD_THEMES, missing from the list: ${undocumentedThemes.map((t) => `${t.label} (${t.key})`).join(", ")}\n      ` +
  "this list is where a reader picks a dashboard's whole look — a preset with no bullet is one " +
  "they can only find by clicking every swatch");

// (b) and names none the registry does not have (Custom excepted, while the row really appends it)
const dashKeys = new Set(dashThemes.map((t) => labelKey(t.label)).concat(customSwatch ? ["custom"] : []));
const strayThemes = dashHelp.names.filter((n) => !dashKeys.has(n));
ok("docs/index.html: the Dashboard theme list names no preset the picker does not offer",
  !strayThemes.length,
  `in the list, not in the registry: ${strayThemes.join(", ")}\n      ` +
  `the picker offers: ${dashThemes.map((t) => t.label).join(", ")}${customSwatch ? ", Custom" : ""}`);

// (c) the Color theme list is exactly the app-chrome roster, both directions
const appHelpSet = new Set(appHelp.names);
const missingAppThemes = appThemeLabels.filter((l) => !appHelpSet.has(labelKey(l)));
const strayAppThemes = appHelp.names.filter((n) => !appThemeLabels.some((l) => labelKey(l) === n));
ok(`docs/index.html: the Color theme list names exactly the ${appThemeLabels.length} app themes Settings renders`,
  !missingAppThemes.length && !strayAppThemes.length,
  `rendered by the picker, missing from the list: ${missingAppThemes.join(", ") || "(none)"}\n      ` +
  `in the list, not in APP_THEME_KEYS: ${strayAppThemes.join(", ") || "(none)"}`);

// (d) the cross-reference counts them
const appCount = NUMBER_WORD[appThemeLabels.length] || appThemeLabels.length;
ok(`docs/index.html: the Color theme intro counts the looks as "${appCount}"`,
  new RegExp(`\\b${appCount}\\b`, "i").test(appHelp.intro),
  `the intro reads: ${appHelp.intro.slice(0, 220)}…\n      ` +
  `it should count ${appThemeLabels.length} — this sentence points AT the Dashboard theme list, ` +
  "so a wrong number here is the page disagreeing with itself");

// (e) …and is only allowed to claim parity while the two registries actually have it
const rostersMatch = appThemeLabels.length === dashThemes.length &&
  dashThemes.every((t) => appThemeLabels.some((l) => labelKey(l) === labelKey(t.label)));
ok("docs/index.html: the Color theme intro claims parity with the Dashboard theme picker only while it holds",
  rostersMatch === /\bthe same\b/i.test(appHelp.intro),
  `registries match: ${rostersMatch} (dashboard: ${dashThemes.map((t) => t.label).join(", ")}; ` +
  `app chrome: ${appThemeLabels.join(", ")})\n      ` +
  `the intro ${/\bthe same\b/i.test(appHelp.intro) ? "claims" : "does not claim"} they are the same set\n      ` +
  "if a theme ever ships to one picker and not the other, this sentence is the copy that has to " +
  "change — silently, it would send a reader looking for a chrome theme in the dashboard picker");

/* ── 41. README.md vs the app it introduces ─────────────────────────────────
   N7, and the document every check in this family had skipped: checks 9–40 hold the
   Help page, the tours, the app's own strings and the landing page, and README.md — the
   repo's FRONT PAGE, the first thing anyone reading the source sees — answered to none
   of them. It had drifted further than any surface those checks have measured, because
   nothing had read it since the app was a third of its current size.

   Measured 2026-08-09, before the fix:
   · **The adapter list named 9 of the 13 connectors** the wizard offers, and named three
     of those nine by strings the picker has never printed ("DuckDB-Wasm remote files",
     "SQLite over HTTP", "generic SQL-over-HTTP"). PostgreSQL (PostgREST), CSV / JSON file,
     Google Sheets and Amazon Redshift were absent — the same four Help was missing before
     check 38, one document over.
   · **The export table had 2 rows where Export ▾ has 7.** xlsx, docx, pptx, PDF and the
     editable spec — every office format the app grew — were undocumented on the page a
     reader lands on first. Check 37 had just held Help to this exact menu.
   · **The ASCII diagram called the builder's left pane "Query Library"** — the id-flavoured
     name checks 16→18 deleted from the tours, from Help and from the app's own runtime
     strings. README was the last place it survived.
   · **The rail listed 5 sections and one of them does not exist.** "Home · Dashboards ·
     Datasets · Connections · Studio": the rail has 13 sections and none is called Studio.
   · **The Roadmap promised adapters that had already shipped** — "more adapters (Postgres,
     Redshift, … file drop, Sheets)" — four of the thirteen above, offered as future work.
   · **The tour-reopen route pointed at a control that has never existed** ("reopen via
     **ⓘ Tour**"). Check 13 fixed the same class of claim across the six tours; the route
     is the ⌘K palette's own Interactive tutorial command.

   Seven rules, every one of them reusing a derivation an earlier check already built —
   this check adds no new source of truth, it points the existing ones at one more document:
   (a) the connector inventory names every connector the picker offers, by the picker's label;
   (b) it names none the registry does not have, and counts them in words (check 38's shape);
   (c) the *(workspace-capable)* mark falls on exactly the connectors whose caps.meta is true;
   (d) the export table has a row for every Export ▾ format and none it does not offer, and
       the viewer sentence names the viewer menu's own formats (check 37's three rules);
   (e) the builder's left pane is called by its RENDERED name, never by its id — check 18's
       idiom, with `library` inside a code span exempt BY SHAPE rather than by a list;
   (f) the rail list names exactly the rail's sections, in the rail's order (check 9's
       derivation, order-strict as check 39's is — README prints it as a walk);
   (g) the tour-reopen route names the command palette's own tutorial label (check 13). */

// The document minus its fenced code blocks and inline code spans: prose only. Rules (a)–(c)
// and (e)–(g) are about sentences a reader trusts, and `app/sources/` or `caps.data` inside
// backticks is a path, not a claim.
const readmeProse = readme.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");

// The Adapters bullet: from its own lead-in to the next top-level bullet.
const adapterBullet = (() => {
  const at = readme.indexOf("- **Adapters**");
  if (at < 0) return "";
  const end = readme.indexOf("\n- **", at + 5);
  return readme.slice(at, end < 0 ? readme.length : end);
})();
// Its inventory: the bolded names in the sentence that promises the picker's order, up to the
// `Local (this browser)` note that deliberately sits OUTSIDE the list (rule (b) would flag it).
const invStart = adapterBullet.indexOf("in the picker's own order");
const invText = invStart < 0 ? "" : adapterBullet.slice(invStart).split("Local (this browser)")[0];
const readmeConnectors = [...invText.matchAll(/\*\*([^*]+)\*\*(\s*\*\(workspace-capable\)\*)?/g)]
  .map((m) => ({ label: m[1].replace(/\s+/g, " ").trim(), badged: !!m[2] }));
ok(`README.md: the Adapters bullet's connector inventory parsed for check 41 ` +
   `(${readmeConnectors.length} entry/entries)`,
  !!adapterBullet && readmeConnectors.length > 0,
  "the `- **Adapters**` bullet, or the sentence promising the picker's own order inside it, was " +
  "not found — rules (a), (b) and (c) all read this list, and an empty parse would pass all three");

// (a) every connector the wizard offers is on the front page
const readmeConnKeys = new Set(readmeConnectors.map((e) => labelKey(e.label)));
const readmeMissingConn = connectors.filter((a) => !readmeConnKeys.has(labelKey(a.label)));
ok(`README.md: the connector inventory names every connector the wizard offers (${connectors.length})`,
  !readmeMissingConn.length,
  `in the picker, missing from README: ${readmeMissingConn.map((a) => `${a.label} (${a.id})`).join(", ")}\n      ` +
  "this is the list someone evaluating the repo reads before they ever open the app — check 38 " +
  "holds Help to the same source, and README had drifted the same four adapters' worth");

// (b) the negative half, plus the count in words — check 38's shape, one document over
const connectorKeys = new Set(connectors.map((a) => labelKey(a.label)));
const readmeStrayConn = readmeConnectors.filter((e) => !connectorKeys.has(labelKey(e.label)));
// NUMBER_WORD (check 38) stops at ten; the connector roster passed it, so extend rather than
// let the rule silently fall back to digits and stop testing the word README actually prints.
const NUMBER_WORD_TEENS = ["eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen", "twenty"];
const connWord = NUMBER_WORD[connectors.length] || NUMBER_WORD_TEENS[connectors.length - 11] ||
  String(connectors.length);
ok(`README.md: the connector inventory names no connector the registry lacks, and counts them as ` +
   `"${connWord}"`,
  !readmeStrayConn.length &&
    new RegExp(`\\b${connWord}\\b|\\b${connectors.length}\\b`, "i").test(invText),
  `in README, not in the picker: ${readmeStrayConn.map((e) => e.label).join(", ") || "(none)"}\n      ` +
  `the picker's own labels are: ${connectors.map((a) => a.label).join(", ")}\n      ` +
  `the sentence should count ${connectors.length}; it reads: …${invText.replace(/\s+/g, " ").trim().slice(-160)}\n      ` +
  "the negative half is what stops a renamed adapter (\"SQLite over HTTP\" for " +
  "\"SQLite (remote .sqlite)\") sitting on the front page forever");

// (c) the workspace-capable mark is the caps.meta claim, not decoration
const shouldBadge = connectors.filter((a) => a.meta);
const readmeBadgeWrong = [
  ...shouldBadge.filter((a) => !readmeConnectors.some((e) => labelKey(e.label) === labelKey(a.label) && e.badged))
    .map((a) => `${a.label} hosts a workspace but README does not mark it`),
  ...readmeConnectors.filter((e) => e.badged && !shouldBadge.some((a) => labelKey(a.label) === labelKey(e.label)))
    .map((e) => `${e.label} is marked workspace-capable but its caps.meta is false`),
];
ok(`README.md: the (workspace-capable) mark falls on exactly the ${shouldBadge.length} connector(s) ` +
   "whose caps.meta is true",
  !readmeBadgeWrong.length,
  readmeBadgeWrong.join("\n      ") + "\n      " +
  "check 38 rule (d) holds Help's badge to this same capability — where a whole workspace can " +
  "live is a data-durability decision, so it is a claim rather than a flourish");

// (d) the export table, and the viewer's smaller menu beside it — check 37's rules (a)–(c)
const readmeExportTable = (() => {
  const at = readme.indexOf("| Export ▾ |");
  if (at < 0) return "";
  const end = readme.indexOf("\n\n", at);
  return readme.slice(at, end < 0 ? readme.length : end);
})();
const readmeExportRows = [...readmeExportTable.matchAll(/^\|\s*\*\*([^*]+)\*\*\s*\|/gm)]
  .map((m) => m[1].replace(/\s+/g, " ").trim());
ok(`README.md: the export table parsed for check 41 (${readmeExportRows.length} row(s))`,
  !!readmeExportTable && readmeExportRows.length > 0,
  "the `| Export ▾ |` table was not found, or none of its rows lead with a bolded format name");
const readmeExportKeys = new Set(readmeExportRows.map(labelKey));
const readmeMissingExports = studioExports.filter((l) => !readmeExportKeys.has(labelKey(l)));
const studioExportKeys = new Set(studioExports.map(labelKey));
const readmeStrayExports = readmeExportRows.filter((l) => !studioExportKeys.has(labelKey(l)));
ok(`README.md: the export table has a row for every format Export ▾ offers (${studioExports.length}), ` +
   "and none it does not",
  !readmeMissingExports.length && !readmeStrayExports.length,
  `in the menu, missing from README: ${readmeMissingExports.join(", ") || "(none)"}\n      ` +
  `in README, not in the menu: ${readmeStrayExports.join(", ") || "(none)"}\n      ` +
  `the menu's own labels are: ${studioExports.join(", ")}\n      ` +
  "check 37 holds Help's copy of this table to the same buttons");
// The paragraph directly under the table, taken whole — every format name here ends in a
// dotted extension, so a sentence-splitting regex would cut the list in half at ".html".
const viewerSentence = (() => {
  const at = readme.indexOf("The viewer", readme.indexOf("| Export ▾ |"));
  if (at < 0) return "";
  const end = readme.indexOf("\n\n", at);
  return readme.slice(at, end < 0 ? readme.length : end);
})();
const readmeUnnamedViewer = viewerExports.filter((l) => !labelKey(viewerSentence).includes(labelKey(l)));
ok(`README.md: the viewer's own Export menu is named in full (${viewerExports.length} format(s))`,
  !!viewerSentence && !readmeUnnamedViewer.length,
  `in the viewer's menu, unnamed in README: ${readmeUnnamedViewer.join(", ") || "(none)"}\n      ` +
  `the sentence reads: ${viewerSentence.replace(/\s+/g, " ").trim().slice(0, 200) || "(not found)"}\n      ` +
  "check 37 rule (d) exists because this menu is a SUBSET — README must not imply parity either");

// (e) the builder's left pane, by the name it renders. Check 18's idiom: a code span is an
// identifier, not a claim, so `library` in backticks or inside a fence is exempt BY SHAPE.
// Scanned over the WHOLE document minus inline code spans, not over `readmeProse` — the pane's
// stale name lived in the ASCII architecture diagram, which is a fenced block, and a fence in
// this document is a picture of the UI as often as it is a command.
// (single-backtick, same-line spans only: a ``` fence marker is three backticks in a row and
// must not be paired off as if it were a span, or the prose between two fences vanishes)
// Two shapes, and the case matters — check 18's by-shape idiom rather than an exemption list.
// A CAPITALISED "Query Library" / "Studio Library" is a proper noun, so it is naming the pane;
// a bare "the library" is the pane by its id. Lowercase "sample-query library" is neither —
// that is the bundled catalog of sample queries, a real thing with a real name.
const paneById = [
  ...readme.replace(/`[^`\n]+`/g, " ").matchAll(/[^.\n]*\b(?:Studio|Query)\s+[Ll]ibrar(?:y|ies)\b[^.\n]*/g),
  ...readme.replace(/`[^`\n]+`/g, " ").matchAll(/[^.\n]*\b(?:the|a|an)\s+[Ll]ibrar(?:y|ies)\b[^.\n]*/g),
].map((m) => `"…${m[0].replace(/\s+/g, " ").trim().slice(0, 100)}…"`);
ok(`README.md: the builder's left pane is called "${dataPaneName}", never by its id ("library")`,
  !paneById.length && new RegExp(`\\b${dataPaneName} panel\\b`).test(readme),
  (paneById.join("\n      ") || `no stale name found, but README never names the pane "${dataPaneName} panel" either`) +
  "\n      the pane is `#library` in the markup and has RENDERED \"" + dataPaneName + "\" since " +
  "STUDIO-PANELS — checks 16, 17 and 18 removed the id-flavoured name from the tours, from Help " +
  "and from the app's own strings, and README was the document none of them read");

// (f) the rail walk, in the rail's own order — check 9's derivation, order-strict
const readmeRailWalk = (() => {
  const at = readme.indexOf("The rail:");
  if (at < 0) return [];
  const end = readme.indexOf("├──", at);
  return readme.slice(at + "The rail:".length, end < 0 ? readme.length : end)
    .replace(/[│├└─]/g, " ").split("·").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
})();
const readmeRailExpected = [...new Set(railSecs)].map((s) => railLabels[s] || s);
ok(`README.md: the rail walk names exactly the ${readmeRailExpected.length} sections the rail has, in its order`,
  readmeRailWalk.length === readmeRailExpected.length &&
    readmeRailWalk.every((l, i) => l === readmeRailExpected[i]),
  `README: ${readmeRailWalk.join(" · ") || "(not found)"}\n      ` +
  `the rail: ${readmeRailExpected.join(" · ")}\n      ` +
  "check 9 holds Help's rail block to this same list; README printed five names and one of " +
  "them (\"Studio\") is not a section at all");

// (g) the route back into the tour — check 13's source, one document over
const paletteTutorial = [...read("app/palette.js").matchAll(/\blabel:\s*"((?:[^"\\]|\\.)*)"/g)]
  .map((m) => m[1]).find((l) => /tutorial/i.test(l));
ok(`app/palette.js: the command that reopens the tour parsed for check 41 ("${paletteTutorial || "(none)"}")`,
  !!paletteTutorial, "rule (g) reads it; no palette command matches /tutorial/i");
const tourSentence = (readmeProse.match(/[^.]*\bwelcome tour\b[^.]*\./i) || [""])[0];
ok(`README.md: the tour-reopen route names the palette's own "${paletteTutorial}" command`,
  !!tourSentence && labelKey(tourSentence).includes(labelKey(paletteTutorial || " ")),
  `the sentence reads: ${tourSentence.replace(/\s+/g, " ").trim() || "(no sentence mentions the welcome tour)"}\n      ` +
  "README said \"reopen via ⓘ Tour\", a control the app has never had — the same class of dead " +
  "route check 13 found eleven times across the tours themselves");

/* ── 42. CLAUDE.md + the pipeline runbook vs the gates the workflows really run ──
   N7, and check 41's own closing note named it: check 7 holds CLAUDE.md's SIZE figures
   (~LOC, ~checks) and nothing else, so the document that tells every agent WHAT MUST BE
   GREEN before merging answered to no derivation at all. Three documents publish that
   list — CLAUDE.md, docs/PIPELINE.md and `.github/pipeline.json`'s documentary `gates`
   block — and the source of truth is the workflow YAML, which is why one derivation can
   hold all three.

   Measured 2026-08-09, before the fix:
   · **All three published a dev gate of three steps where `ci.yml` runs four.**
     `tools/doc-truth.mjs` — this file, a hard step since the doc-truth family began —
     was in none of them. CLAUDE.md contradicted ITSELF about it: its Layout block calls
     doc-truth part of "the dev gate" while its pipeline bullet, the sentence an agent
     actually reads before merging, listed the other three. The v927 shape exactly:
     neither half was wrong alone and together they were.
   · **The stage gate was under-reported the same way.** `promote-to-stage.yml` runs the
     full suite, then `tests/rls.mjs`, then `tests/rls-verify.mjs`, then the staged boot
     smoke; PIPELINE.md and pipeline.json both named the suite and the smoke and skipped
     the two posture checks between them.
   · **The workflow roster named 9 of the 11 files** in `.github/workflows/`. The two
     missing ones are `rls-dev.yml` and `rls-verify.yml` — the whole database-posture CI
     surface, and the pair the open ⛔ N29 tells its reader to re-dispatch by name.
   · **The database-posture bullet described one test where the repo has two**, said
     `tests/rls.mjs` applies "both shipped RLS files" when the script applies THREE
     postures (its own POSTURES table: the two .sql files plus the Edge Function's
     inlined SQL), and said it runs "on the live project" — the opposite of what N25
     shipped, which was moving it to `polecat_dev` precisely so production stops being
     the thing we experiment on. `tests/rls-verify.mjs`, the read-only check that gates
     promote-to-prod and runs daily, appeared nowhere in the document.

   Five rules, all derived from the workflows and the test script themselves — no new
   hand-maintained list:
   (a) each of the three documents' dev-gate sentence names every `tools/` script
       `ci.yml` runs;
   (b) the negative half — none of them names a `tools/` script the gate does NOT run
       (a step deleted from ci.yml must not linger in the prose as a promise);
   (c) the stage-gate sentence in PIPELINE.md and pipeline.json names every `tests/`
       script `promote-to-stage.yml` runs;
   (d) CLAUDE.md's Layout block names every file in `.github/workflows/`, and names no
       workflow that does not exist;
   (e) CLAUDE.md's database bullet names both posture scripts, every posture source
       `tests/rls.mjs` applies, and counts them in words. */

const wfDir = ".github/workflows";
const workflowFiles = fs.readdirSync(path.join(ROOT, wfDir)).filter((f) => f.endsWith(".yml")).sort();

// What a workflow RUNS: the `node <path>` invocations in its `run:` bodies. Reading the YAML as
// text rather than parsing it keeps this dependency-free (the file's own rule), and a gate step
// is a `node tools/x.mjs` / `node tests/x.js` line in every workflow this repo has.
const nodeScriptsIn = (wf, dir) =>
  [...read(`${wfDir}/${wf}`).matchAll(new RegExp(`node\\s+(${dir}/[\\w.-]+\\.(?:mjs|js))`, "g"))]
    .map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i);

const devGateScripts = nodeScriptsIn("ci.yml", "tools");
const stageGateTests = nodeScriptsIn("promote-to-stage.yml", "tests");
const stem = (p) => path.basename(p).replace(/\.(mjs|js)$/, "");
// Every tools/ script that COULD be named as a gate step — rule (b) compares against this so a
// prose mention of `export.js` (a CLI, not a gate) is only flagged inside a gate sentence.
const toolScripts = fs.readdirSync(path.join(ROOT, "tools"))
  .filter((f) => /\.(mjs|js)$/.test(f)).map(stem);

const claudeGateSentence = (claude.match(/the dev gate is green \(([^)]*)\)/) || ["", ""])[1];
const claudePipelineBullet = (() => {
  const at = claude.indexOf("- **This repo is on the dev → stage → main pipeline**");
  if (at < 0) return "";
  const end = claude.indexOf("\n- **", at + 5);
  return claude.slice(at, end < 0 ? claude.length : end);
})();
const pipelineMd = read("docs/PIPELINE.md");
const pipelineBulletIn = (label) => {
  const at = pipelineMd.indexOf(`- *${label}*`);
  if (at < 0) return "";
  const end = pipelineMd.indexOf("\n  - *", at + 5);
  const stop = end < 0 ? pipelineMd.indexOf("\n- **", at + 5) : end;
  return pipelineMd.slice(at, stop < 0 ? pipelineMd.length : stop);
};
const pipelineJson = JSON.parse(read(".github/pipeline.json"));

ok(`ci.yml + promote-to-stage.yml parsed for check 42 (${devGateScripts.length} dev-gate script(s), ` +
   `${stageGateTests.length} stage-gate test(s))`,
  devGateScripts.length >= 3 && stageGateTests.length >= 2,
  `dev gate: ${devGateScripts.join(", ") || "(none found)"}\n      ` +
  `stage gate: ${stageGateTests.join(", ") || "(none found)"}\n      ` +
  "every rule below reads these two lists, and an empty parse would pass all of them");

// (a) + (b) the dev gate, in all three documents that publish it
const DEV_GATE_SURFACES = [
  ["CLAUDE.md", claudeGateSentence, "the sentence an agent reads before merging"],
  ["docs/PIPELINE.md", pipelineBulletIn("Dev gate"), "the canonical runbook's own gate list"],
  [".github/pipeline.json", pipelineJson.gates?.devGate || "", "the documentary gates block"],
];
for (const [where, text, why] of DEV_GATE_SURFACES) {
  const missing = devGateScripts.filter((s) => !text.includes(stem(s)));
  ok(`${where}: the dev-gate list names all ${devGateScripts.length} steps ci.yml runs`,
    !!text && !missing.length,
    `ci.yml runs: ${devGateScripts.join(", ")}\n      ` +
    `missing from ${where}: ${missing.join(", ") || "(the gate sentence itself was not found)"}\n      ` +
    `this is ${why} — doc-truth.mjs was absent from all three while being a hard step`);
  // the negative half: a tools/ script named here that the gate does not run
  const gateStems = new Set(devGateScripts.map(stem));
  const stray = toolScripts.filter((t) => !gateStems.has(t) && new RegExp(`\\b${t}\\b`).test(text));
  ok(`${where}: the dev-gate list names no step ci.yml does not run`,
    !stray.length,
    `named as a gate step but not run by ci.yml: ${stray.join(", ")}\n      ` +
    "a step deleted from the workflow must not linger in the prose as a promise");
}

// (c) the stage gate — the same shape, one workflow over. CLAUDE.md's pipeline bullet
// summarises it too, so it is held to the same list.
const STAGE_SURFACES = [
  ["CLAUDE.md", claudePipelineBullet],
  ["docs/PIPELINE.md", pipelineBulletIn("Stage gate")],
  [".github/pipeline.json", pipelineJson.gates?.stageSuite || ""],
];
for (const [where, text] of STAGE_SURFACES) {
  const missing = stageGateTests.filter((s) => !text.includes(stem(s)));
  ok(`${where}: the stage-gate list names all ${stageGateTests.length} tests promote-to-stage.yml runs`,
    !!text && !missing.length,
    `promote-to-stage.yml runs: ${stageGateTests.join(", ")}\n      ` +
    `missing from ${where}: ${missing.join(", ") || "(the stage-gate text itself was not found)"}\n      ` +
    "both posture checks sit BETWEEN the suite and the boot smoke, and all three surfaces skipped them");
}

// (d) the workflow roster in CLAUDE.md's Layout block. Names are basenames without .yml; the
// parentheticals are commentary, so they are stripped before the roster is read (check 18's
// by-shape idiom — a token outside a parenthetical, in the file's own naming shape, is a claim).
const claudeWfBlock = (() => {
  const at = claude.indexOf(`${wfDir}/`);
  if (at < 0) return "";
  const end = claude.indexOf("```", at);
  return claude.slice(at + wfDir.length + 1, end < 0 ? claude.length : end);
})();
const claimedWorkflows = claudeWfBlock.replace(/\([^)]*\)/g, " ").split(/[\s,/]+/)
  .filter((t) => /^[a-z][a-z0-9-]*$/.test(t)).filter((v, i, a) => a.indexOf(v) === i);
const realWorkflows = workflowFiles.map((f) => f.replace(/\.yml$/, ""));
const wfMissing = realWorkflows.filter((w) => !claimedWorkflows.includes(w));
const wfStray = claimedWorkflows.filter((w) => !realWorkflows.includes(w));
ok(`CLAUDE.md: the Layout block names all ${realWorkflows.length} workflows, and none it lacks`,
  !!claudeWfBlock && !wfMissing.length && !wfStray.length,
  `in ${wfDir}/, unnamed in CLAUDE.md: ${wfMissing.join(", ") || "(none)"}\n      ` +
  `named in CLAUDE.md, not a workflow: ${wfStray.join(", ") || "(none)"}\n      ` +
  "rls-dev and rls-verify were the missing pair — the whole database-posture CI surface, and " +
  "the two the open N29 tells its reader to re-dispatch by name");

// (e) the database-posture bullet vs the script it describes. tests/rls.mjs's POSTURES table
// declares its own `source:` for each posture it applies — that IS the list, and the bullet
// said "both shipped RLS files" while the table has had three entries since the Edge Function
// grew its inlined copy.
// Scoped to the POSTURES array itself — rls.mjs declares `source:` in other tables too
// (MARKER_ARTIFACTS is a different question), and counting those would inflate the claim.
const posturesBlock = (() => {
  const src = read("tests/rls.mjs");
  const at = src.indexOf("const POSTURES = [");
  if (at < 0) return "";
  const end = src.indexOf("\n];", at);
  return src.slice(at, end < 0 ? src.length : end);
})();
const postureSources = [...posturesBlock.matchAll(/^\s*source:\s*"([^"]+)"/gm)].map((m) => m[1]);
// The ARTIFACTS under test — what "run it after ANY change to those files" actually points at.
// One posture can combine two files ("a + b") and two postures can share one file, so the
// artifact list is neither the posture count nor a de-duped source list.
const postureArtifacts = [...new Set(postureSources.flatMap((s) => s.split(" + ")))]
  .map((s) => s.split(" ")[0]).filter((v, i, a) => a.indexOf(v) === i);
const claudeDbBullet = (() => {
  const at = claude.indexOf("- **The database posture");
  if (at < 0) return "";
  const end = claude.indexOf("\n- **", at + 5);
  return claude.slice(at, end < 0 ? claude.length : end);
})();
ok(`tests/rls.mjs's POSTURES table parsed for check 42 (${postureSources.length} posture(s), ` +
   `${postureArtifacts.length} artifact(s))`,
  postureSources.length >= 2 && postureArtifacts.length >= 2,
  `sources found: ${postureSources.join(", ") || "(none)"}`);
const postureMissing = postureArtifacts.filter((s) => !claudeDbBullet.includes(path.basename(s)));
const postureWord = NUMBER_WORD[postureSources.length] || String(postureSources.length);
ok(`CLAUDE.md: the posture bullet names all ${postureArtifacts.length} artifacts rls.mjs applies, ` +
   `and counts the postures as "${postureWord}"`,
  !!claudeDbBullet && !postureMissing.length &&
    new RegExp(`\\b${postureWord}\\b|\\b${postureSources.length}\\b`, "i").test(claudeDbBullet),
  `rls.mjs applies ${postureSources.length} postures across: ${postureArtifacts.join(", ")}\n      ` +
  `missing from the bullet: ${postureMissing.join(", ") || "(none)"}\n      ` +
  `the bullet should count ${postureSources.length}; it said "both shipped RLS files" and named two`);
// The same claim, in the workflow that runs the script — its header said "three shipped
// postures", the number this table had when N25 wrote it, and the table has grown twice since.
const rlsDevHeader = read(`${wfDir}/rls-dev.yml`).split("\non:")[0];
const rlsDevCount = (rlsDevHeader.match(/applies the (\w+)/) || ["", ""])[1];
ok(`rls-dev.yml: its header counts the postures rls.mjs applies as "${postureWord}"`,
  rlsDevCount.toLowerCase() === postureWord,
  `the header says "applies the ${rlsDevCount || "(no count found)"} shipped postures", ` +
  `the POSTURES table has ${postureSources.length}\n      ` +
  "this comment is the first thing anyone debugging a red posture run reads");
const postureTests = ["tests/rls.mjs", "tests/rls-verify.mjs"]
  .filter((t) => fs.existsSync(path.join(ROOT, t)));
const testsMissing = postureTests.filter((t) => !claudeDbBullet.includes(path.basename(t)));
ok(`CLAUDE.md: the posture bullet names both posture scripts (${postureTests.length})`,
  !testsMissing.length,
  `in tests/, unnamed in the bullet: ${testsMissing.join(", ")}\n      ` +
  "they answer different questions — \"do our SQL FILES produce a secure database?\" vs \"is a " +
  "LIVE database readable RIGHT NOW?\" — and neither subsumes the other, which is exactly why " +
  "N29 exists: rls.mjs went 81/81 green in the same hour rls-verify found dev wide open");

/* ── 43. Help's own NAVIGATION vs the page it navigates ─────────────────────
   N7, and the surface every check in this family had read THROUGH without ever reading:
   checks 9, 14–21, 28, 34–40 hold what docs/index.html SAYS. Nothing held whether a
   reader can get to it. The page's own nav bar is a published claim like any other —
   "these are the topics on this page" — and it is derivable from the page itself, so it
   belongs here rather than in anyone's judgement.

   Measured 2026-08-09, before the fix:
   · **The page had 15 topics, 10 addressable sections and 9 nav links.** Five `<h2>`
     topics — Quick Views, View Builder, Sample packs, Jobs and *the builder itself* —
     were BURIED inside one `<section id="builder">` that opened on a sixth, Home. They
     had no section of their own, so nothing could address them and nothing did.
   · **`#builder` — the link labelled "The builder" — landed on "Home — instant
     analytics"**, ~400 lines above the builder. That is also where the app's own
     contextual `?` sends people: `app/index.html`'s `inspHelpLink` and `studio.js`'s
     `_hlAnchors` fallback both point at `docs/index.html#builder`.
   · **The docs search collapsed 40% of the page into one entry.** Its index is
     `main > section[id]` titled by each section's first `<h2>` (LF60 slice 2), so a
     search for "jobs" or "sample pack" returned a hit titled *Home — instant analytics*
     and jumped to the top of Home. The scroll-spy above it had the same blind spot: one
     `.active` link for six topics.
   · **Glossary was a real `<section id>` with no link at all** — reachable only by
     scrolling past everything.

   Six rules, all derived from the page's own structure — the check adds no new source of
   truth, it makes the document answer to itself:
   (a) every `<h2>` in `<main>` opens its own `main > section[id]` — no topic buried
       inside another's section, which is what makes (b)–(e) and the search index possible;
   (b) the nav links every section (coverage — the negative direction of (a));
   (c) every nav href resolves to a section that exists (the negative half);
   (d) within each nav GROUP the links follow the page's own order — grouped rather than
       globally strict on purpose: `#admin-docs` sits mid-page and trails in the bar by
       design, which is editorial, and check 39's order-strictness would call it drift;
   (e) every word of a nav label appears in the heading it points at, so a label may be
       SHORTER than its heading ("Ensembles & honesty" for "Ensembles & scientific
       honesty") but may never say something the section does not;
   (f) every `docs/index.html#anchor` the app itself links to resolves on the page —
       the contextual `?`, whose default anchor is the one this slice re-pointed. */

const helpMain = help.slice(help.indexOf("<main>"), help.indexOf("</main>"));
const htmlText = (s) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ").trim();
const helpSections = [...helpMain.matchAll(/<section id="([^"]+)"[^>]*>/g)]
  .map((m) => ({ id: m[1], at: m.index }));
const helpTopics = [...helpMain.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)]
  .map((m) => ({ text: htmlText(m[1]), at: m.index }));
// `<section>` appears exactly as many times as we matched top-level ones, so there is no
// nesting to reason about and "the last section that opened before this h2" is its owner.
const sectionOpens = (helpMain.match(/<section\b/g) || []).length;
const ownerOf = (at) => [...helpSections].filter((s) => s.at < at).pop();

const navBlock = help.slice(help.indexOf("<nav>"), help.indexOf("</nav>"));
// Groups and links in document order, so (d) can walk the bar group by group.
const navEntries = [...navBlock.matchAll(/<span class="nav-group">([\s\S]*?)<\/span>|<a href="#([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
  .map((m) => (m[2] === undefined
    ? { group: htmlText(m[1]) }
    : { href: m[2], label: htmlText(m[3]) }));
const navLinks = navEntries.filter((e) => e.href);

ok(`docs/index.html parsed for check 43 (${helpSections.length} section(s), ${helpTopics.length} topic(s), ` +
   `${navLinks.length} nav link(s))`,
  helpSections.length >= 10 && helpTopics.length >= 10 && navLinks.length >= 9 &&
    sectionOpens === helpSections.length,
  `found ${sectionOpens} <section> tag(s) but ${helpSections.length} with an id at top level — ` +
  "check 43 assumes sections do not nest");

// (a) every topic owns a section, and is the FIRST h2 in it.
const buried = helpTopics.filter((t) => {
  const owner = ownerOf(t.at);
  return !owner || helpTopics.find((x) => ownerOf(x.at) === owner) !== t;
});
ok(`docs/index.html: all ${helpTopics.length} <h2> topics open their own addressable section`,
  !buried.length,
  `buried inside another topic's section: ${buried.map((t) => `"${t.text}" (in #${(ownerOf(t.at) || {}).id})`).join("; ")}\n      ` +
  "a buried topic has no anchor, no nav link, and no entry of its own in the LF60 docs " +
  "search — which indexes main > section[id] by each section's FIRST h2");

// (b) + (c) the nav and the sections describe the same page.
const navHrefs = navLinks.map((l) => l.href);
const unlinked = helpSections.filter((s) => !navHrefs.includes(s.id));
ok(`docs/index.html: the nav links all ${helpSections.length} sections`,
  !unlinked.length,
  `on the page, absent from the nav: ${unlinked.map((s) => "#" + s.id).join(", ")}`);
const danglingNav = navHrefs.filter((h) => !helpSections.some((s) => s.id === h));
ok("docs/index.html: every nav link resolves to a section that exists",
  !danglingNav.length,
  `in the nav, not on the page: ${danglingNav.map((h) => "#" + h).join(", ")}`);

// (d) order, within each group.
const outOfOrder = [];
let groupStart = 0;
for (let i = 0; i <= navEntries.length; i++) {
  if (i < navEntries.length && !navEntries[i].group) continue;
  const links = navEntries.slice(groupStart, i).filter((e) => e.href)
    .map((l) => helpSections.findIndex((s) => s.id === l.href)).filter((n) => n >= 0);
  links.forEach((n, k) => { if (k && n < links[k - 1]) outOfOrder.push(navHrefs[k]); });
  groupStart = i + 1;
}
ok("docs/index.html: each nav group lists its sections in the page's own order",
  !outOfOrder.length,
  `out of order within their group: ${outOfOrder.map((h) => "#" + h).join(", ")}`);

// (e) a label may abbreviate its heading; it may not contradict it.
const IGNORE_WORD = new Set(["the", "a", "an", "and", "&", "of", "in", "vs"]);
const words = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
  .filter((w) => w && !IGNORE_WORD.has(w));
const mislabelled = navLinks.map((l) => {
  const sec = helpSections.find((s) => s.id === l.href);
  if (!sec) return null;
  const heading = helpTopics.find((t) => ownerOf(t.at) === sec);
  if (!heading) return null;
  const stray = words(l.label).filter((w) => !words(heading.text).includes(w));
  return stray.length ? `"${l.label}" (#${l.href} is "${heading.text}"; stray: ${stray.join(", ")})` : null;
}).filter(Boolean);
ok(`docs/index.html: all ${navLinks.length} nav labels say what their section's heading says`,
  !mislabelled.length,
  `labels naming something their heading does not: ${mislabelled.join("; ")}`);

// (f) the anchors the APP links to. The contextual `?` in the inspector picks one per
// selection kind and falls back to the builder's; a rename on the page silently breaks it.
const helpIds = new Set([...help.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const appSrc = ["app/index.html", "app/studio.js", "app/viewer.html"]
  .filter((f) => fs.existsSync(path.join(ROOT, f))).map(read).join("\n");
const hlMap = (appSrc.match(/var _hlAnchors = \{([^}]*)\}/) || ["", ""])[1];
const appAnchors = [...new Set([
  // Literal anchors only: the negative lookahead drops a string that is a PREFIX being
  // concatenated (`"docs/index.html#ct-" + t`, the chart-card links) — those resolve per
  // chart type and check 3 above already holds the whole `#ct-*` set.
  ...[...appSrc.matchAll(/docs\/index\.html#([a-z0-9-]+)(?=["'`])(?!["'`]\s*\+)/g)].map((m) => m[1]),
  ...[...hlMap.matchAll(/:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]),
  ...(appSrc.match(/_hlAnchors\[[^\]]*\]\s*\|\|\s*"([a-z0-9-]+)"/) || []).slice(1),
])];
const brokenAnchors = appAnchors.filter((a) => !helpIds.has(a));
ok(`docs/index.html: all ${appAnchors.length} help anchors the app links to resolve on the page`,
  appAnchors.length >= 5 && !brokenAnchors.length,
  `linked from app/, missing from docs/index.html: ${brokenAnchors.map((a) => "#" + a).join(", ") || "(none)"}\n      ` +
  `anchors found: ${appAnchors.join(", ") || "(none — the extraction itself broke)"}`);

/* ── 44. PUBLISH.md vs the way the site really publishes ────────────────────
   N7, and the document check 41 pointed at without reading: README's Publish section is
   three sentences that end "Full runbook: **PUBLISH.md**", so v928 corrected the summary
   and left the page it forwards to untouched. Nothing had ever read that page. It is the
   one document in the repo whose instructions an operator EXECUTES against repo settings,
   and it was describing a publishing pipeline this repo replaced.

   Measured 2026-08-09, before the fix:
   · **§ 1 instructed the wrong Pages source.** "Deploy from a branch → `main` / `/ (root)`",
     while `deploy.yml`'s own header says the opposite in as many words — it *replaced* the
     branch pipeline, and its NOTE reads "requires repo Settings → Pages → Source = GitHub
     Actions". An operator who followed the runbook would have switched Pages back to the
     branch source, taking the deploy workflow out of the path and, with it, both preview
     stages. This is the only drift this family has measured that BREAKS something rather
     than merely misinforming.
   · **The artifact's other two trees were named nowhere.** `deploy.yml` assembles `/stage/`
     and `/dev/` beside production on every deploy; the runbook still described one tree
     ("GitHub Pages serves the repo root directly").
   · **"push to the deploy branch and the live site updates"** named no branch, and is false
     for two of the three the workflow triggers on: the deploy job is `if: github.ref ==
     'refs/heads/main'` and the `github-pages` environment refuses any other ref.
   · **It told you to run `tools/push.js`, which does not exist** — part of a Notes bullet
     about "Live Pentaho features", a module `app/model.js` records as retired and which has
     no adapter in `app/sources/`.
   · **The tour-reopen route pointed at "ⓘ Tour"** — the identical dead control check 41
     rule (g) had just deleted from README, in the document README forwards to.

   Six rules. (a)–(c) derive from `deploy.yml` itself, (d)–(f) reuse derivations this file
   already built:
   (a) § 1 names the Pages source the workflow requires, and never the branch one;
   (b) every stage tree the assembly step builds is described;
   (c) the opening claim about what ships names the ref the deploy job actually guards on;
   (d) every `tools/…` script the runbook tells you to run exists;
   (e) the tour-reopen route resolves against the command palette (check 13's resolver, one
       document over) and the reset key matches `app/welcome.js`'s own literal;
   (f) the demo accounts are exactly `app/auth.js`'s first-run SEED, both directions.

   Deliberately NOT held: the retired module's NAME. Rule (d) kills the bullet's actionable
   half (a script that is not there), and the fix removed the name with it, but "no module
   the code calls retired may be named here" would have to derive the retired set from prose
   in a comment — a rule that stops testing the day someone rewords the comment. The next
   runbook claim of that shape wants a real source, not a regex over English. */
const publish = read("PUBLISH.md");
const deployYml = read(".github/workflows/deploy.yml");

// (a) the Pages SOURCE. A workflow is the publisher the moment it runs actions/deploy-pages,
// and that action only ever publishes when Settings → Pages → Source is "GitHub Actions" —
// under the branch source the workflow runs and its artifact is discarded.
const actionsDeploy = /actions\/deploy-pages@/.test(deployYml);
ok(".github/workflows/deploy.yml: the Pages deploy parsed for check 44 (actions/deploy-pages)",
  actionsDeploy,
  "no actions/deploy-pages step found — rules (a), (b) and (c) all read this workflow, and an " +
  "unparsed file would pass (a) vacuously");
ok('PUBLISH.md: § 1 names the Pages source the deploy requires ("GitHub Actions"), not the branch one',
  !actionsDeploy || (/Source → `GitHub Actions`/.test(publish) && !/Deploy from a branch/i.test(publish)),
  "the runbook must instruct Settings → Pages → Source → `GitHub Actions` and must not instruct " +
  "the branch source\n      " +
  "it said \"Deploy from a branch → `main` / `/ (root)`\" — following it would have unhooked " +
  "deploy.yml and both previews with it");

// (b) the artifact's other trees, from the assembly step's own loop.
const stagePreviews = ((deployYml.match(/for stage in ([a-z ]+);/) || [, ""])[1] || "")
  .trim().split(/\s+/).filter(Boolean);
ok(`.github/workflows/deploy.yml: the stage-preview assembly loop parsed for check 44 ` +
   `(${stagePreviews.join(", ") || "(none)"})`,
  stagePreviews.length >= 2, "rule (b) reads the `for stage in …` loop in the assembly step");
const undescribedStages = stagePreviews.filter((s) => !publish.includes(`/${s}/`));
ok(`PUBLISH.md: describes every stage tree the deploy assembles (${stagePreviews.map((s) => "/" + s + "/").join(" ")})`,
  !undescribedStages.length,
  `assembled by deploy.yml, absent from the runbook: ${undescribedStages.map((s) => "/" + s + "/").join(", ")}\n      ` +
  "the page said \"GitHub Pages serves the repo root directly\" — one tree, where the artifact " +
  "has carried three since the promotion pipeline landed (docs/PIPELINE.md)");

// (c) which ref actually publishes. The deploy job's own guard, quoted into the runbook's
// opening claim — the sentence that tells you what shipping IS. The pre-fix intro said
// "push to the deploy branch", which names nothing and is false for two of the three refs
// deploy.yml triggers on.
const prodRef = (deployYml.match(/github\.ref == 'refs\/heads\/([a-z]+)'/) || [, ""])[1];
const publishIntro = publish.split(/\n## /)[0];
ok(`.github/workflows/deploy.yml: the deploy job's branch guard parsed for check 44 ("${prodRef || "(none)"}")`,
  !!prodRef, "rule (c) reads the `if: github.ref == 'refs/heads/…'` guard on the deploy job");
ok(`PUBLISH.md: the opening claim about what ships names the branch that deploys (\`${prodRef}\`)`,
  !prodRef || new RegExp("`" + prodRef + "`").test(publishIntro),
  `the intro reads: ${publishIntro.replace(/\s+/g, " ").trim().slice(0, 220)}\n      ` +
  `it said "push to the deploy branch and the live site updates" — the deploy job runs only on ` +
  `\`${prodRef}\`, and the github-pages environment refuses every other ref outright`);

// (d) a runbook may only tell you to run scripts that are here. The retired-Pentaho bullet
// sent readers to `tools/push.js`, gone with the module it belonged to.
const publishTools = [...publish.matchAll(/`(tools\/[A-Za-z0-9._-]+)`/g)].map((m) => m[1]);
const missingPublishTools = publishTools.filter((t) => !fs.existsSync(path.join(ROOT, t)));
ok(`PUBLISH.md: every tools/ script it names exists (${publishTools.length} named)`,
  publishTools.length >= 1 && !missingPublishTools.length,
  (publishTools.length ? `named in the runbook, missing from the repo: ${missingPublishTools.join(", ")}`
    : "the runbook names no tools/ script at all — the extraction may have broken") +
  "\n      it told you to \"run `tools/push.js` from a networked host\"");

// (e) the way back into the tour, and the key that resets it — check 13's resolver and
// app/welcome.js's own literal, one document over from check 41 rule (g).
const publishNorm = norm(publish);
const badPublishRoutes = [
  ...unresolvedRoutes(publishNorm, norm("⌘K"), PAL_L, "command in app/palette.js", "PUBLISH.md"),
  ...unresolvedRoutes(publishNorm, norm("⋯ More"), MORE_L, "entry in #menuMore", "PUBLISH.md"),
];
const tourCommands = [...PAL_L].filter((l) => /\btour\b|\btutorial\b/.test(l));
const publishTourSentence = (publish.match(/[^.\n]*\bwelcome tour\b[\s\S]*?\./i) || [""])[0];
ok(`PUBLISH.md: the tour-reopen route names a real palette command and resolves`,
  !badPublishRoutes.length && tourCommands.length > 0 &&
    tourCommands.some((l) => norm(publishTourSentence).includes(l)),
  (badPublishRoutes.join("\n      ") ||
    `the sentence reads: ${publishTourSentence.replace(/\s+/g, " ").trim() || "(none mentions the welcome tour)"}`) +
  `\n      the palette's tour commands: ${tourCommands.join(", ") || "(none)"}\n      ` +
  "it said \"reopen any time via **ⓘ Tour**\" — the same control check 41 rule (g) had just " +
  "removed from README, still standing in the runbook README forwards to");
const welcomeSeenKey = (read("app/welcome.js").match(/var SEEN = "([^"]+)"/) || [, ""])[1];
ok(`PUBLISH.md: the tour-reset key matches app/welcome.js's own ("${welcomeSeenKey}")`,
  !!welcomeSeenKey && publish.includes(`localStorage.removeItem('${welcomeSeenKey}')`),
  `app/welcome.js stores the seen flag under "${welcomeSeenKey}"; the runbook must print that key ` +
  "verbatim — a reset instruction that clears the wrong key silently does nothing");

// (f) the accounts § 3 hands an operator, from the store's own first-run seed. Both
// directions: an account the seed creates and the runbook omits leaves an operator unable
// to sign in; one the runbook invents sends them to a login that fails.
const seedBlock = (read("app/auth.js").match(/var SEED = \[([\s\S]*?)\];/) || [, ""])[1];
const seedAccounts = [...seedBlock.matchAll(/u:\s*"([^"]+)"[^}]*?pass:\s*"([^"]+)"/g)]
  .map((m) => `${m[1]}/${m[2]}`);
ok(`app/auth.js: the first-run SEED parsed for check 44 (${seedAccounts.join(", ") || "(none)"})`,
  seedAccounts.length >= 1, "rule (f) reads `var SEED = [ … ]`");
const publishPairs = [...publish.matchAll(/`([A-Za-z0-9]+)`\/`([A-Za-z0-9]+)`/g)]
  .map((m) => `${m[1]}/${m[2]}`);
const missingSeed = seedAccounts.filter((a) => !publishPairs.includes(a));
const straySeed = publishPairs.filter((a) => !seedAccounts.includes(a));
ok(`PUBLISH.md: § 3's demo accounts are exactly the ${seedAccounts.length} the store seeds`,
  !missingSeed.length && !straySeed.length,
  `seeded, not in the runbook: ${missingSeed.join(", ") || "(none)"}\n      ` +
  `in the runbook, not seeded: ${straySeed.join(", ") || "(none)"}\n      ` +
  "app/auth.js's SEED is what a fresh browser gets — § 3 is where an operator reads it");

/* ── 45. SPEC.md vs the spec it publishes ───────────────────────────────────
   N7, and the document check 44's own note named as the last one answering to no rule at
   all: `README.md` sends a reader here three times ("the dashboard-spec schema"), and
   nothing had ever read it against `app/model.js`. It was the last file in the repo still
   titled **DashKit Dashboard Studio** — the vendored chart toolkit's name, where README's
   H1 and every <title> say *Analytics* — and the title was the smallest of it.

   Measured 2026-08-09, before the fix:
   · **It published a data pipeline this app removed.** "Every exporter (CDF html, CDE
     `.cdfde`/`.wcdf`, `.cda`)" — of those four artifacts the app produces exactly one, and
     `tools/lib.js`'s buildArtifacts returns a single `.html`. The Export ▾ menu's seven
     formats (check 37's list) were named nowhere on the page.
   · **Its chart-type registry had 11 of the 54 types**, each with a `CDE / CCC component`
     column naming a component library the repo does not contain.
   · **Its "Data resolution" section said the live path hits
     `/pentaho/plugin/cda/api/doQuery`.** Nothing has fetched that in months —
     `app/exporters.js:115` says so in a comment ("legacy id namespace … nothing fetches
     it"); live rows come from the referenced Connection's adapter.
   · **13 of the 25 keys `Studio.emptySpec()` writes were undocumented** — every appearance
     key (`dashboardTheme`, `customTheme`, `paletteKey`, `headerLogo/Link/Bg`, `titleSize`,
     `subtitleStyle`, `headerAlign`, `cardSkin`, `renderMode`, `themeColor`) plus
     `templateVars`, the `{{key}}` substitution a template author needs most.
   · **The colour-token list elided eight tokens** behind `--c1`…`--c10`, on the page whose
     job is to be the exhaustive one.
   `deploy.sh` — the CLI README tells you to feed a spec to — carried the same dead artifact
   list in its header, so it is fixed and held here too.

   Six rules. The registry ones EVALUATE `app/model.js` rather than regexing it: the file is
   a pure `window.Studio` IIFE with no DOM (its own header says so), so one `new Function`
   yields the real labels, fields, formats and defaults — exact where a regex over 54
   entries would be approximate. Still browser-free, still dependency-free, still instant.
   (a) SPEC.md's H1 names the product README's H1 names;
   (b) every top-level key `Studio.emptySpec()` writes is documented, and no key is
       documented that neither it nor a shipped example carries (the negative half);
   (c) every format the builder's Export ▾ publishes is named (check 37's own derivation);
   (d) every file extension SPEC.md or deploy.sh names standalone is one this app exports
       or accepts as an import — the rule that kills `.cdfde`/`.wcdf`/`.cda`;
   (e) the chart table IS `Studio.CHARTS`: same keys, same labels, same `map` fields, both
       directions;
   (f) the `fmt`, colour-token and KPI-state vocabularies are their registries', both
       directions — the elision rule, since a page that abbreviates its only exhaustive
       list is not exhaustive. */
const spec = read("SPEC.md");
const deploySh = read("deploy.sh");

// app/model.js is a pure data+helpers IIFE over `window` — no DOM, no imports (file header).
// Evaluating it is the exact source of truth for rules (b), (e) and (f).
function studioModel() {
  const win = {};
  new Function("window", read("app/model.js"))(win);
  if (!win.Studio || !win.Studio.CHARTS || !win.Studio.emptySpec) {
    throw new Error("doc-truth: app/model.js did not yield a Studio model");
  }
  return win.Studio;
}
const M = studioModel();
const emptySpecKeys = Object.keys(M.emptySpec());
ok(`app/model.js: the spec model evaluated for check 45 (${emptySpecKeys.length} top-level keys, ` +
   `${Object.keys(M.CHARTS).length} chart types)`,
  emptySpecKeys.length >= 10 && Object.keys(M.CHARTS).length >= 10,
  "rules (b), (e) and (f) read this model — an empty one would pass them vacuously");

// A markdown section: the given `## ` heading up to the next one.
function mdSection(src, heading) {
  const at = src.indexOf(`\n## ${heading}\n`);
  if (at < 0) return "";
  const rest = src.slice(at + 1);
  const end = rest.indexOf("\n## ", 1);
  return end < 0 ? rest : rest.slice(0, end);
}
const ticked = (s) => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

// (a) the product name. README's H1 is the app's own masthead; SPEC.md had the vendored
// toolkit's name where README says the product's.
const productName = (read("README.md").match(/^#\s+(.+)$/m) || [, ""])[1].split("·")[0].trim();
const specH1 = (spec.match(/^#\s+(.+)$/m) || [, ""])[1].trim();
ok(`SPEC.md: its H1 names the product README's H1 names ("${productName}")`,
  !!productName && specH1.includes(productName),
  `README.md: "${productName}"\n      SPEC.md:   "${specH1}"\n      ` +
  'it read "DashKit Dashboard Studio" — vendor/dashkit.js is the chart toolkit this app ' +
  "vendors, not the app");

// (b) the top-level key inventory, from the model that writes it. The negative half allows a
// key no blank spec carries but a shipped one does (`demoPackId`), and nothing else.
const keyTable = mdSection(spec, "Top-level keys");
const documentedKeys = [...keyTable.matchAll(/^\|\s*`([A-Za-z_]\w*)`\s*\|/gm)].map((m) => m[1]);
ok(`SPEC.md: the top-level key table parsed for check 45 (${documentedKeys.length} row(s))`,
  documentedKeys.length >= 5,
  'the "## Top-level keys" section must be a table whose first cell is the key in backticks');
const undocumentedKeys = emptySpecKeys.filter((k) => !documentedKeys.includes(k));
ok(`SPEC.md: documents every top-level key Studio.emptySpec() writes (${emptySpecKeys.length})`,
  !undocumentedKeys.length,
  `written by the model, undocumented here: ${undocumentedKeys.join(", ")}\n      ` +
  "this page is the schema — a key it omits is one an author editing a spec by hand cannot know about");
const exampleKeys = new Set();
for (const f of fs.readdirSync(path.join(ROOT, "data/examples")).filter((f) => f.endsWith(".studio.json"))) {
  try { Object.keys(JSON.parse(read("data/examples/" + f))).forEach((k) => exampleKeys.add(k)); } catch { /* not a spec */ }
}
const strayKeys = documentedKeys.filter((k) => !emptySpecKeys.includes(k) && !exampleKeys.has(k));
ok("SPEC.md: documents no top-level key the model never writes and no shipped spec carries",
  !strayKeys.length,
  `documented here, written nowhere: ${strayKeys.join(", ")}\n      ` +
  "the negative half — (b) alone would let a retired key sit in the table forever, which is " +
  "exactly how the Pentaho-era `cda.connection.jndi` outlived the module that read it");

// (c) what the spec actually becomes, from check 37's own menu derivation.
const specKey = labelKey(spec);
const unnamedExports = studioExports.filter((l) => !specKey.includes(labelKey(l)));
ok(`SPEC.md: names every format Export ▾ writes from a spec (${studioExports.length})`,
  !unnamedExports.length,
  `in the menu, unnamed on this page: ${unnamedExports.join(", ")}\n      ` +
  'it said "Every exporter (CDF html, CDE `.cdfde`/`.wcdf`, `.cda`)" — one of those four ' +
  "artifacts exists, and the seven that do were named nowhere");

// (d) a file artifact these two documents may name: one an export writes, or one an import
// accepts. Both sets come from the markup. The token must stand alone — `.js` inside
// `app/model.js` is a path, not a claim about an artifact.
const attrAccepts = ["app/index.html", "app/viewer.html", "app/studio.js", "app/gate.js"]
  .filter((f) => fs.existsSync(path.join(ROOT, f)))
  .flatMap((f) => [...read(f).matchAll(/accept="([^"]*)"/g)].map((m) => m[1]))
  .flatMap((v) => v.split(",")).map((s) => s.trim().toLowerCase()).filter((s) => s.startsWith("."));
const menuExts = [...studioExports, ...viewerExports]
  .flatMap((l) => [...l.matchAll(/\((\.[a-z0-9.]+)\)/g)].map((m) => m[1].toLowerCase()));
const knownExts = new Set([...menuExts, ...attrAccepts]);
ok(`SPEC.md + deploy.sh: the artifact vocabulary parsed for check 45 ` +
   `(${[...knownExts].sort().join(" ") || "(none)"})`,
  knownExts.size >= 4, "rule (d) reads the export menus' labels and the file inputs' accept lists");
const namedExts = (src) => [...new Set([...src.matchAll(/(?<![A-Za-z0-9_])(\.[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*)\b/g)]
  .map((m) => m[1].toLowerCase()))];
const deadArtifacts = [["SPEC.md", spec], ["deploy.sh", deploySh]]
  .flatMap(([f, src]) => namedExts(src).filter((e) => !knownExts.has(e)).map((e) => `${e} (${f})`));
ok("SPEC.md + deploy.sh: every file artifact they name is one this app exports or accepts",
  !deadArtifacts.length,
  `named, produced by nothing: ${deadArtifacts.join(", ")}\n      ` +
  "both documents advertised `.cdfde`, `.wcdf` and `.cda` — tools/lib.js's buildArtifacts " +
  "returns exactly one file, and it is the .html");

// (e) the chart table IS the registry: keys, labels and map fields, both directions.
const chartTable = mdSection(spec, "Chart types");
// Body rows only: everything after the header separator (`|---|---|---|`), so the header's
// own `type` / `map` cells are never read as a chart.
const chartBody = chartTable.split(/\n\|[\s|:-]+\|\n/)[1] || "";
const chartRows = [...chartBody.matchAll(/^\|\s*`([A-Za-z_]\w*)`\s*\|([^|]*)\|([^|]*)\|/gm)]
  .map((m) => ({ key: m[1], label: m[2].trim(), fields: ticked(m[3]) }));
ok(`SPEC.md: the chart-type table parsed for check 45 (${chartRows.length} row(s))`,
  chartRows.length >= 10,
  'the "## Chart types" section must be a table of | `type` | Label | `field`, `field` |');
const specRegistryKeys = Object.keys(M.CHARTS);
const rowKeys = chartRows.map((r) => r.key);
const missingTypes = specRegistryKeys.filter((k) => !rowKeys.includes(k));
const strayTypes = rowKeys.filter((k) => !specRegistryKeys.includes(k));
ok(`SPEC.md: its chart table is exactly Studio.CHARTS (${specRegistryKeys.length} types)`,
  !missingTypes.length && !strayTypes.length,
  `in the registry, missing from the table: ${missingTypes.join(", ") || "(none)"}\n      ` +
  `in the table, not in the registry: ${strayTypes.join(", ") || "(none)"}\n      ` +
  "it published 11 of them, under a column naming a component library this repo does not contain");
const wrongLabels = chartRows.filter((r) => M.CHARTS[r.key] && r.label !== M.CHARTS[r.key].label)
  .map((r) => `${r.key}: "${r.label}" vs "${M.CHARTS[r.key].label}"`);
ok("SPEC.md: every chart row's label is the registry's own",
  !wrongLabels.length, `table vs registry — ${wrongLabels.join("; ")}`);
const wrongFields = chartRows.filter((r) => {
  const c = M.CHARTS[r.key];
  return c && r.fields.join(",") !== (c.fields || []).join(",");
}).map((r) => `${r.key}: [${r.fields.join(", ")}] vs [${(M.CHARTS[r.key].fields || []).join(", ")}]`);
ok("SPEC.md: every chart row's map fields are the ones its registry entry declares",
  !wrongFields.length,
  `table vs registry — ${wrongFields.join("; ")}\n      ` +
  "the `map` block is what an author writes by hand; a wrong field list is a spec that renders empty");

// (f) the small closed vocabularies. A page that elides its own exhaustive list ("`--c1`…
// `--c10`") is not exhaustive, so both directions are enforced on the literal tokens.
// Prose only. A fenced example block is illustration, not the published vocabulary — and a
// ``` fence would desynchronise backtick pairing across everything below it.
const specProse = spec.replace(/```[\s\S]*?```/g, "");
const vocab = (line, exclude) => ticked(line).filter((t) => /^[a-z]+$/.test(t) && t !== exclude);
const fmtLine = (specProse.match(/^.*`fmt`\s*∈.*$/m) || [""])[0];
const fmtIds = M.FORMATS.map((f) => f.id);
const fmtDoc = vocab(fmtLine, "fmt");
ok(`SPEC.md: the fmt vocabulary is exactly Studio.FORMATS (${fmtIds.length})`,
  fmtIds.every((i) => fmtDoc.includes(i)) && fmtDoc.every((i) => fmtIds.includes(i)),
  `registry: ${fmtIds.join(", ")}\n      page: ${fmtDoc.join(", ") || "(the `fmt` ∈ line was not found)"}`);
const stateLine = (specProse.match(/^.*KPI `state`\s*∈.*$/m) || [""])[0];
const stateIds = M.KPI_STATES.map((s) => s.id).filter(Boolean);
const stateDoc = vocab(stateLine, "state");
ok(`SPEC.md: the KPI state vocabulary is exactly Studio.KPI_STATES (${stateIds.length} named + the default)`,
  stateIds.every((i) => stateDoc.includes(i)) && stateDoc.every((i) => stateIds.includes(i)),
  `registry: ${stateIds.join(", ")}\n      page: ${stateDoc.join(", ") || "(the KPI `state` ∈ line was not found)"}`);
const tokensDoc = [...new Set(ticked(specProse).filter((t) => /^--[a-z0-9]+$/.test(t)))];
const missingTokens = M.COLOR_TOKENS.filter((t) => !tokensDoc.includes(t));
const strayTokens = tokensDoc.filter((t) => !M.COLOR_TOKENS.includes(t));
ok(`SPEC.md: the colour tokens are exactly Studio.COLOR_TOKENS (${M.COLOR_TOKENS.length})`,
  !missingTokens.length && !strayTokens.length,
  `in the registry, absent from the page: ${missingTokens.join(", ") || "(none)"}\n      ` +
  `on the page, not in the registry: ${strayTokens.join(", ") || "(none)"}\n      ` +
  "the page wrote `--c1`…`--c10` and hid eight real tokens inside the ellipsis");

/* ── 46. the RLS runbook + the posture scripts' own headers vs the POSTURES table ──
   Check 42's move, three surfaces over, and it needs no new source of truth: rule (e)
   there already derives the posture list from `tests/rls.mjs`'s own POSTURES table
   (`postureSources` / `postureArtifacts` above) and holds CLAUDE.md and rls-dev.yml's
   header to it. The three documents that describe those postures at LENGTH answered to
   nothing — including the two SCRIPTS' own headers, so the file that owns the table was
   miscounting the table.

   Measured on the pre-fix tree: `tools/M7-RLS-GOLIVE-RUNBOOK.md` said `rls.mjs` "installs
   both posture files" and "runs the SAME 27 checks it runs against the two `/tools`
   files"; `tests/rls.mjs` said "ALL THREE shipped postures" (and "The three shipped
   postures" again, directly above the seven-entry table); `tests/rls-verify.mjs`, whose
   whole header exists to stop the two scripts being confused, said "the three shipped
   postures". The table has grown four times since anyone read those sentences.

   The runbook is the highest-stakes of the three for the PUBLISH.md reason: an operator
   EXECUTES it against a live security posture. So it also has to name both scripts —
   `rls-verify.mjs`, the answer to "is this database secure right now?", appeared nowhere
   in the runbook whose § A4 asks exactly that question by hand, and the open ⛔ N29 is
   precisely the gap between the two answers.

   Five rules. (a) each surface states the count at least once; (b) EVERY count any of
   them states is the derived one (both directions — a surface may not under- or
   over-count); (c) the runbook names all the artifacts under test; (d) the runbook names
   both posture scripts; (e) the negative half — every repo file the runbook points an
   operator at exists. */
const rlsRunbookPath = "tools/M7-RLS-GOLIVE-RUNBOOK.md";
const rlsRunbook = read(rlsRunbookPath);
// A script's HEADER is its leading comment block — everything before the first import.
// Scoped that way so a sentence inside the file's body (which may legitimately talk about
// one posture) can neither satisfy nor fail a rule about the roster.
const headerOf = (p) => { const s = read(p); const i = s.indexOf("\nimport "); return i < 0 ? s : s.slice(0, i); };
const POSTURE_COUNT_RE = /\b([A-Za-z]+|\d+) shipped postures\b/g;
const postureCountWord = NUMBER_WORD[postureSources.length] || String(postureSources.length);
const postureSurfaces = [
  { path: rlsRunbookPath, text: rlsRunbook },
  { path: "tests/rls.mjs", text: headerOf("tests/rls.mjs") },
  { path: "tests/rls-verify.mjs", text: headerOf("tests/rls-verify.mjs") },
];
for (const s of postureSurfaces) s.counts = [...s.text.matchAll(POSTURE_COUNT_RE)].map((m) => m[1].toLowerCase());
ok(`the three posture surfaces parsed for check 46 are non-empty (${
    postureSurfaces.map((s) => `${path.basename(s.path)}: ${s.text.split("\n").length} line(s)`).join(", ")})`,
  postureSurfaces.every((s) => s.text.trim().length > 200),
  "one of the runbook or the two script headers could not be read — the rules below would pass vacuously");

// (a) each surface makes the claim. A document that describes the posture roster and never
//     counts it is not "safe", it is unfalsifiable — check 40's count-word rule, three
//     documents over.
const noCount = postureSurfaces.filter((s) => !s.counts.length);
ok(`the runbook and both posture scripts each state how many postures tests/rls.mjs applies`,
  !noCount.length,
  `states no count: ${noCount.map((s) => s.path).join(", ")}\n      ` +
  "the phrase the rule looks for is \"<n> shipped postures\"");

// (b) and every count they state is the real one, in BOTH directions — this is the rule
//     that was failing on all three surfaces.
const wrongCount = postureSurfaces.flatMap((s) =>
  s.counts.filter((c) => c !== postureCountWord && c !== String(postureSources.length))
    .map((c) => `${s.path} says "${c}"`));
ok(`every posture count published across those three surfaces is "${postureCountWord}" (${
    postureSources.length}, per the POSTURES table)`,
  !wrongCount.length,
  `${wrongCount.join("; ") || "(none)"}\n      ` +
  `the table applies ${postureSources.length} postures across ${postureArtifacts.length} artifacts: ${
    postureArtifacts.join(", ")}\n      ` +
  "rls.mjs's own header said THREE while the table below it listed seven");

// (c) the runbook names every artifact under test. An operator reading it is deciding what
//     to paste; an artifact rls.mjs proves and the runbook never mentions is one the
//     operator does not know is proven. Same derivation check 42 holds CLAUDE.md to.
const runbookMissingArtifacts = postureArtifacts.filter((a) => !rlsRunbook.includes(path.basename(a)));
ok(`${rlsRunbookPath}: names all ${postureArtifacts.length} artifacts tests/rls.mjs applies`,
  !runbookMissingArtifacts.length,
  `under test, unnamed in the runbook: ${runbookMissingArtifacts.join(", ") || "(none)"}\n      ` +
  "app/sources/schema.js was the missing one — the connect wizard's generated script and the " +
  "migration RPC are both proven by the same battery, and the runbook said neither");

// (d) check 42's "name both scripts" rule, one document over — and it matters more here,
//     because § A4 asks rls-verify.mjs's question in the SQL editor by hand.
const runbookMissingTests = postureTests.filter((t) => !rlsRunbook.includes(path.basename(t)));
ok(`${rlsRunbookPath}: names both posture scripts (${postureTests.length})`,
  !runbookMissingTests.length,
  `in tests/, unnamed in the runbook: ${runbookMissingTests.join(", ")}\n      ` +
  "§ A4 verifies by hand what tests/rls-verify.mjs verifies from outside the database — and " +
  "N29 is exactly the case where only the second one could have seen the leak");

// (e) the negative half, and the PUBLISH.md failure mode: a runbook is EXECUTED, so a file
//     it names that is not there costs an operator a debugging session mid-go-live. Every
//     backticked repo path is resolved. Scoped by shape (a known source dir + a real
//     extension) so prose in backticks and SQL identifiers cannot be mistaken for paths.
const runbookPaths = [...new Set([...rlsRunbook.matchAll(/`((?:tools|tests|app|supabase|\.github)\/[\w./-]+\.(?:sql|mjs|js|ts|yml))`/g)]
  .map((m) => m[1]))];
const runbookDangling = runbookPaths.filter((p) => !fs.existsSync(path.join(ROOT, p)));
ok(`${rlsRunbookPath}: every repo file it points an operator at exists (${runbookPaths.length} path(s))`,
  runbookPaths.length >= 4 && !runbookDangling.length,
  `named in the runbook, absent from the tree: ${runbookDangling.join(", ") || "(none)"}\n      ` +
  `paths found: ${runbookPaths.join(", ") || "(none — the extractor matched nothing)"}`);

/* ── 47. THIRD-PARTY-NOTICES.md vs what the repo actually redistributes ─────
   N7, and the class of document this repo had not yet held to anything: not copy a
   reader skims but a LEGAL notice, whose only job is to be a complete and current list
   of what we ship that isn't ours. It answered to one narrow rule — `tools/validate.mjs`
   makes a pack whose source is `kind: "licensed"` appear here — and to nothing at all
   about the tree it describes. Three things had drifted past it, all three measured on
   the pre-fix tree:
   · **`vendor/fflate.js` (fflate 0.8.2, MIT) was not in the table.** LF24-XLSX vendored
     it, `app/index.html` loads it, `sw.js` precaches it, and the document listing what we
     redistribute never learned it existed. `vendor/dashkit.css` was missing beside it.
   · **"No third-party fonts are bundled; the UI uses system font stacks."** DESIGN-1
     bundled ten woff2 files — four in `assets/fonts/`, `@font-face`-declared by the
     marketing page and Help, and six more inside the shell copy — and the section that
     would have to credit them said there was nothing to credit. Hanken Grotesk is OFL
     1.1, whose whole ask is that the notice travels with the font.
   · **"no pack ships outside data: both shipped packs … are entirely synthetic".** SP-1
     shipped a third pack the day before, and its 113KB of US Census CBP/ACS extract is
     exactly the outside data that sentence denied. `validate.mjs` did not catch it
     because the Census is public domain and its rule fires only on `licensed` — so the
     document's own promise ("public-domain components listed here") was the part with no
     check under it.

   Five rules, all derived from the tree rather than from a list kept by hand:
   (a) every redistributed artifact under `vendor/` is named somewhere in the notices —
       `vendor/polecat-shell/` excluded because the table declares that whole directory
       first-party and read-only, which is the honest description of a synced copy;
   (b) the negative half — every repo path the notices cite exists, so a row can't outlive
       the file it credits (the check-46 rule, one document over);
   (c) the fonts: if the tree ships font binaries, the section must credit each family the
       first-party `@font-face` blocks declare, must not claim none are bundled, and must
       point at a licence file that is really there;
   (d) every pack whose source is not `synthetic` is credited BY NAME — `public` included,
       which is the half `validate.mjs` deliberately leaves alone;
   (e) every third-party row cites its upstream licence text, and that file exists — the
       document's own opening promise ("vendored files keep their upstream license text
       alongside the code"), turned into a rule about itself. */
const tpnPath = "THIRD-PARTY-NOTICES.md";
const tpn = read(tpnPath);
// What "redistributed" means here: a file under vendor/ that a browser could fetch. The
// licence texts themselves are excluded (they are the credit, not the credited), as are
// READMEs and anything without a shippable extension.
const TPN_REDIST_EXT = new Set([".js", ".css", ".json", ".woff2"]);
const tpnVendorFiles = [];
(function walkVendor(dir) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (rel !== "vendor/polecat-shell") walkVendor(rel); continue; }
    if (/^LICENSE/i.test(e.name)) continue;
    if (TPN_REDIST_EXT.has(path.extname(e.name))) tpnVendorFiles.push(rel);
  }
})("vendor");
ok(`${tpnPath}: the notices and the vendor tree parsed for check 47 (${tpnVendorFiles.length} redistributed file(s), ${tpn.split("\n").length} lines of notices)`,
  tpnVendorFiles.length >= 8 && tpn.length > 500,
  "every rule below reads one or the other — an empty read would pass all five vacuously");

// (a) nothing ships uncredited. The document names paths in backticks; a plain
//     `includes` is enough because a path is unique text.
const tpnUncredited = tpnVendorFiles.filter((f) => !tpn.includes(f));
ok(`${tpnPath}: every redistributed file under vendor/ is named in the notices (${tpnVendorFiles.length})`,
  !tpnUncredited.length,
  `shipped, uncredited: ${tpnUncredited.join(", ") || "(none)"}\n      ` +
  "vendor/fflate.js and vendor/dashkit.css were the two — a component nobody wrote down is " +
  "the one that ships under nobody's licence");

// (b) every path the notices cite is real. Scoped by shape (a known top-level dir + a
//     real extension, or a directory path) and skipping brace/glob forms like
//     `assets/fonts/hanken-grotesk-{400,600,700,800}.woff2`, which name a set rather
//     than a file — the set's members are checked by rule (c) from the tree instead.
const tpnCited = [...new Set([...tpn.matchAll(
  /`((?:vendor|data|app|tools|assets|css|docs|tests|js|supabase)\/[\w./-]*(?:\/|\.\w{2,5}))`/g)].map((m) => m[1]))];
const tpnDangling = tpnCited.filter((p) => !fs.existsSync(path.join(ROOT, p)));
ok(`${tpnPath}: every repo path it cites exists (${tpnCited.length} path(s))`,
  tpnCited.length >= 8 && !tpnDangling.length,
  `cited in the notices, absent from the tree: ${tpnDangling.join(", ") || "(none)"}\n      ` +
  `paths found: ${tpnCited.join(", ") || "(none — the extractor matched nothing)"}`);

// (c) the fonts. Families come from the first-party @font-face blocks that actually load
//     a woff2, so the section is held to what the pages really ask the browser for; the
//     binaries come from the tree, so a font nobody declares is still noticed.
const tpnFontFiles = [];
(function walkFonts(dir) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir === "." ? e.name : `${dir}/${e.name}`;
    // The generated preview trees are copies of the same files, not extra components.
    if (e.isDirectory()) { if (!["dev", "stage", ".git", "node_modules", "reference", "provisioning"].includes(rel)) walkFonts(rel); continue; }
    if (path.extname(e.name) === ".woff2") tpnFontFiles.push(rel);
  }
})(".");
const tpnFontFaceSrc = ["css/landing.css", "docs/index.html", "index.html", "app/index.html"]
  .filter((p) => fs.existsSync(path.join(ROOT, p))).map(read).join("\n");
const tpnFontFamilies = [...new Set([...tpnFontFaceSrc.matchAll(/@font-face\s*\{[^}]*\}/g)]
  .filter((m) => /\.woff2/.test(m[0]))
  .map((m) => (m[0].match(/font-family:\s*'([^']+)'|font-family:\s*"([^"]+)"/) || [])
    .slice(1).find(Boolean))
  .filter(Boolean))];
const tpnFontsSection = (tpn.match(/\n## Fonts\n([\s\S]*)$/) || [, ""])[1];
const tpnFontsMissing = tpnFontFamilies.filter((f) => !tpnFontsSection.includes(f));
const tpnDeniesFonts = /no (?:third-party )?fonts are bundled/i.test(tpnFontsSection);
const tpnFontLicences = [...tpnFontsSection.matchAll(/`([\w./-]*LICENSE[\w./-]*)`/gi)].map((m) => m[1]);
ok(`${tpnPath}: the Fonts section credits every bundled face (${tpnFontFiles.length} woff2 file(s), declared: ${tpnFontFamilies.join(", ") || "none"})`,
  !!tpnFontsSection &&
  (tpnFontFiles.length === 0 ? true
    : !tpnDeniesFonts && !tpnFontsMissing.length &&
      tpnFontLicences.length > 0 && tpnFontLicences.every((p) => fs.existsSync(path.join(ROOT, p)))),
  `bundled: ${tpnFontFiles.join(", ") || "(none)"}\n      ` +
  `declared but uncredited: ${tpnFontsMissing.join(", ") || "(none)"}; ` +
  `section denies bundling: ${tpnDeniesFonts}; licence file(s) cited: ${tpnFontLicences.join(", ") || "(none)"}\n      ` +
  "DESIGN-1 self-hosted the brand face and this section still said the UI used system stacks — " +
  "the OFL asks for the notice to travel with the font, so the licence file is part of the rule");

// (d) the half validate.mjs leaves alone. `public` data is still somebody's work.
const tpnPacksToCredit = packRegistry.filter((p) => p.sourceKind && p.sourceKind !== "synthetic");
const tpnPackGaps = tpnPacksToCredit.filter((p) => !p.sourceName || !tpn.includes(p.sourceName))
  .map((p) => `${p.id} (${p.sourceKind}): ${p.sourceName ? `"${p.sourceName}" is not in the notices` : "declares no source name"}`);
ok(`${tpnPath}: every pack shipping outside data is credited by name (${tpnPacksToCredit.map((p) => p.id).join(", ") || "none today"})`,
  !tpnPackGaps.length,
  `${tpnPackGaps.join("\n      ") || "(none)"}\n      ` +
  "validate.mjs fires only on kind:\"licensed\"; this rule covers kind:\"public\" too, which is " +
  "how a US Census extract shipped while the notices still said no pack ships outside data");

// (e) the document's own opening promise, applied to the document. First-party rows are
//     exempt by their own License cell — that is the claim being made about them.
const tpnLibTable = (tpn.match(/\n## Vendored libraries\n([\s\S]*?)\n\n/) || [, ""])[1];
const tpnLibRows = tpnLibTable.split("\n").filter((l) => l.startsWith("|") && !/^\|\s*-|^\| Component/.test(l))
  .map((l) => l.split("|").map((c) => c.trim()));
const tpnRowGaps = tpnLibRows.filter((cells) => !/first-party/i.test(cells[3] || ""))
  .filter((cells) => {
    const cited = [...(cells[3] || "").matchAll(/`([\w./-]+)`/g)].map((m) => m[1]);
    return !cited.length || cited.some((p) => !fs.existsSync(path.join(ROOT, p)));
  })
  .map((cells) => `${cells[1]}: ${(cells[3] || "").slice(0, 60)}`);
ok(`${tpnPath}: every third-party row cites licence text that is in the tree (${tpnLibRows.length} row(s))`,
  tpnLibRows.length >= 4 && !tpnRowGaps.length,
  `rows with a missing or dangling licence citation:\n      ${tpnRowGaps.join("\n      ") || "(none)"}\n      ` +
  "the notices open by promising vendored files keep their upstream licence text alongside the " +
  "code — this is that promise, checked");

/* ── 48. docs/PACKS.md vs the packs it governs ──────────────────────────────
   N7, and the same gap check 47 found one document over: PACKS.md is the CONTRACT for
   what a pack's data may be and how it gets here — the PUBLISH.md class, a document an
   author executes rather than skims — and it answered to nothing. Checks 34/35/47 read
   the registry it governs; none read the contract. Three things had drifted past it,
   two of them measured on the pre-fix tree:
   · **"generated in JS at install time, as both shipped packs do today"** — written when
     both shipped packs were synthetic. Three ship now, and the third is the real-data
     kind this whole document exists for, so the sentence defining "synthetic" claimed
     the entire fleet of packs for it.
   · **"Anything not public domain is `kind: "licensed"` and must also have a
     `THIRD-PARTY-NOTICES.md` line"** — and its checklist step, `kind: "licensed"`? So an
     author shipping PUBLIC-domain data was told, twice, that the notices did not concern
     them. Check 47 (d) shipped hours earlier (v934) and holds every non-`synthetic` pack,
     `public` included: following this document to the letter now REDS THE GATE. That is
     the PUBLISH.md failure exactly — a runbook whose instructions break something.
   · **"Four rules, all enforced"** — rule 1's offline half ("installing one must not
     depend on the network") was enforced by nothing. It holds only if the service worker
     carries the bytes, and the precache list in `sw.js` is hand-maintained: today's two
     CSVs are in it because the SP-1 (a) author remembered. Rule (c) below is that
     missing enforcement, which is what lets the sentence say "all".

   Five rules, derived from the registry and the tree rather than from a list kept here:
   (a) every "<n> shipped packs" claim equals the number of registered packs, and every
       "<n> of the <m> shipped packs" claim equals the number declaring kind:"synthetic"
       — the two halves of the one drifted sentence, held separately because a fourth
       pack moves only one of them ("both" counts as two: it was the drifted word);
   (b) the sentences requiring a `THIRD-PARTY-NOTICES.md` line name every non-synthetic
       source kind in the VOCABULARY (not merely the kinds registered today), and never
       name `synthetic`. The vocabulary is read from `tools/pack-extract/lib.mjs` and
       cross-checked against `tools/validate.mjs`, so the two code copies drifting apart
       fails here too;
   (c) every file a pack's `data.files` declares exists under `data/packs/<id>/` AND is
       precached in `sw.js`'s `SHELL_FILES` — rule 1, finally enforced;
   (d) the author's checklist names `sw.js` whenever a registered pack ships committed
       data, so the step (c) now fails on is one the checklist actually tells you to do;
   (e) the negative half — every repo path and every `Studio.*` entry point the document
       names resolves in the tree (the check-46 rule, one document over). */
const packsDoc = read("docs/PACKS.md");
const packsPath = "docs/PACKS.md";

// (a) the count. `both` is not in WORD_NUM and is exactly the word that had drifted, so
//     it is spelled out here rather than left to fall through as an unparseable claim.
const packsClaimNum = (w) => (/^both$/i.test(w) ? 2 : asNumber(w.replace(/\W/g, "")));
const packsSynthetic = packRegistry.filter((p) => p.sourceKind === "synthetic");
const packsShippedClaims = [...packsDoc.matchAll(/(\S+)\s+(?:shipped|registered)\s+packs\b/gi)];
const packsShippedGaps = packsShippedClaims
  .filter((m) => packsClaimNum(m[1]) !== packRegistry.length)
  .map((m) => `"…${m[0].replace(/\s+/g, " ").trim()}" — the registry has ${packRegistry.length}`);
// The same sentence's other half: "two of the three shipped packs [are synthetic]". Held
// separately because it is a different measurement — the drift being guarded against is a
// fourth pack of EITHER kind, and only one of the two numbers moves in each case.
const packsSubsetGaps = [...packsDoc.matchAll(/\b(\S+)\s+of\s+the\s+\S+\s+(?:shipped|registered)\s+packs\b/gi)]
  .filter((m) => packsClaimNum(m[1]) !== packsSynthetic.length)
  .map((m) => `"…${m[0].replace(/\s+/g, " ").trim()}" — ${packsSynthetic.length} of them declare kind:"synthetic"`);
ok(`${packsPath}: every claim about how many packs ship matches the registry (${packRegistry.length}: ${packRegistry.map((p) => p.id).join(", ")}; ${packsSynthetic.length} synthetic)`,
  packsShippedClaims.length > 0 && !packsShippedGaps.length && !packsSubsetGaps.length,
  `${[...packsShippedGaps, ...packsSubsetGaps].join("\n      ") || "(no claim of this shape found — the sentence naming the shipped packs was removed or reworded)"}\n      ` +
  "the paragraph DEFINING synthetic data said \"as both shipped packs do today\" while the " +
  "third pack, the real-data one this document exists for, had already shipped");

// (b) the notices trigger. The vocabulary, not the roster: a rule scoped to the kinds that
//     happen to be registered today would go stale the moment someone adds a licensed pack.
const kindVocab = (src) => [...((src.match(/\[\s*("synthetic"[^\]]*)\]/) || [, ""])[1])
  .matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
const extractKinds = kindVocab(read("tools/pack-extract/lib.mjs"));
const validateKinds = kindVocab(read("tools/validate.mjs"));
const kindsAgree = extractKinds.length >= 2 && extractKinds.join(",") === validateKinds.join(",");
const creditedKinds = extractKinds.filter((k) => k !== "synthetic");
const noticeLines = packsDoc.split("\n")
  .map((l, i) => [i, l])
  .filter(([, l]) => l.includes("THIRD-PARTY-NOTICES.md"));
// A kind counts as named only inside a code span — the prose says "public domain" about
// licence status, which is a different claim from the `public` source kind.
const noticeContext = noticeLines.map(([i]) => packsDoc.split("\n").slice(Math.max(0, i - 3), i + 2).join("\n")).join("\n");
const noticeSpans = [...noticeContext.matchAll(/`([a-z]+)`|`kind:\s*"([a-z]+)"`|kind:\s*"([a-z]+)"/g)]
  .map((m) => m[1] || m[2] || m[3]);
const kindsUncovered = creditedKinds.filter((k) => !noticeSpans.includes(k));
// The negative half is the reverse direction — a kind the DOCUMENT invents. Every
// `kind: "x"` it writes has to be one the code accepts, or the contract is teaching a
// value `packSourceIssues` will reject. (It deliberately does NOT forbid naming
// `synthetic` beside the notices rule: the corrected sentence defines the requirement
// as "not synthetic", which is the clearest way to say it.)
const kindsInvented = [...new Set([...packsDoc.matchAll(/kind:\s*"([a-z]+)"/g)].map((m) => m[1]))]
  .filter((k) => !extractKinds.includes(k));
ok(`${packsPath}: the THIRD-PARTY-NOTICES.md rule names every non-synthetic source kind (${creditedKinds.join(", ") || "none"})`,
  kindsAgree && noticeLines.length > 0 && !kindsUncovered.length && !kindsInvented.length,
  `kinds in the vocabulary needing credit: ${creditedKinds.join(", ") || "(none parsed)"}; ` +
  `named beside the notices rule: ${[...new Set(noticeSpans)].join(", ") || "(none)"}\n      ` +
  `uncovered: ${kindsUncovered.join(", ") || "(none)"}; invented by the document: ${kindsInvented.join(", ") || "(none)"}; ` +
  `extract/validate vocabularies agree: ${kindsAgree}\n      ` +
  "check 47 (d) makes the gate red for a `public` pack with no notices line; this document " +
  "told its reader that only `licensed` data needed one");

// (c) rule 1's offline half, which nothing enforced. A declared file that is absent from
//     the tree breaks install outright; one absent from SHELL_FILES breaks it only for the
//     reader on a cold cache, which is why it survived — it never fails for the author.
const swSrc = read("sw.js");
const shellFiles = new Set([...((swSrc.match(/var SHELL_FILES = \[([\s\S]*?)\n\];/) || [, ""])[1])
  .matchAll(/"([^"]+)"/g)].map((m) => m[1]));
const packDataGaps = [];
for (const p of packRegistry)
  for (const f of p.dataFiles) {
    const rel = `data/packs/${p.id}/${f}`;
    if (!fs.existsSync(path.join(ROOT, rel))) packDataGaps.push(`${p.id}: declares ${f}, absent from the tree (${rel})`);
    else if (!shellFiles.has(rel)) packDataGaps.push(`${p.id}: ${rel} is not in sw.js SHELL_FILES — installing it needs the network`);
  }
const packsWithData = packRegistry.filter((p) => p.dataFiles.length);
ok(`sw.js: every file a pack declares in \`data.files\` ships and is precached (${
  packsWithData.map((p) => `${p.id}: ${p.dataFiles.length}`).join(", ") || "no pack ships data today"})`,
  !packDataGaps.length && shellFiles.size > 0,
  `${packDataGaps.join("\n      ") || "(none)"}\n      ` +
  `SHELL_FILES parsed: ${shellFiles.size} entr(ies)\n      ` +
  "docs/PACKS.md rule 1 says installing a pack must not depend on the network; a same-origin " +
  "fetch only honours that if the service worker has the file");

// (d) and the checklist has to TELL you to do it — otherwise (c) fails an author who
//     followed the document faithfully, which is the worst kind of gate.
const packsChecklist = (packsDoc.match(/\n## Adding a real-data pack[^\n]*\n([\s\S]*)$/) || [, ""])[1];
ok(`${packsPath}: the author's checklist names sw.js while a pack ships committed data`,
  !packsWithData.length || (!!packsChecklist && /\bsw\.js\b/.test(packsChecklist) && /SHELL_FILES/.test(packsChecklist)),
  `checklist found: ${!!packsChecklist}; names sw.js: ${/\bsw\.js\b/.test(packsChecklist)}; ` +
  `names SHELL_FILES: ${/SHELL_FILES/.test(packsChecklist)}\n      ` +
  "the precache step lived in the prose above and in no step of the list an author works through");

// (e) the negative half. Same extractor shape as check 47 (b), and the Studio entry points
//     this document promises are held the way check 41 holds README's.
const packsCited = [...new Set([...packsDoc.matchAll(
  /`((?:app|tools|data|tests|docs|js|supabase|vendor)\/[\w./-]*(?:\/|\.\w{2,5}))`/g)].map((m) => m[1]))]
  .filter((p) => !/<id>/.test(p));
const packsDangling = packsCited.filter((p) => !fs.existsSync(path.join(ROOT, p)));
const appSrcAll = fs.readdirSync(path.join(ROOT, "app"))
  .filter((f) => f.endsWith(".js")).map((f) => read(`app/${f}`)).join("\n");
const packsApis = [...new Set([...packsDoc.matchAll(/`Studio\.(\w+(?:\.\w+)?)\(/g)].map((m) => m[1]))];
const packsApiGaps = packsApis.filter((a) => !new RegExp(`Studio\\.${a.replace(".", "\\.")}\\s*=|\\b${a.split(".").pop()}\\s*:\\s*function`).test(appSrcAll));
ok(`${packsPath}: every repo path and Studio entry point it names resolves (${packsCited.length} path(s), ${packsApis.length} api(s))`,
  // The floors only assert the extractors found the document at all — set below what the
  // pre-fix file carried (4 paths, 3 entry points) on purpose, so a legitimate rewording
  // can never redden this rule. The real assertions are the two emptiness checks.
  packsCited.length >= 3 && packsApis.length >= 2 && !packsDangling.length && !packsApiGaps.length,
  `dangling paths: ${packsDangling.join(", ") || "(none)"}\n      ` +
  `unresolved entry points: ${packsApiGaps.map((a) => `Studio.${a}()`).join(", ") || "(none)"}\n      ` +
  "a contract that names a script or a function nobody can find is not executable");

/* ── 49. Help's app-bar chrome vs the bar the app renders ───────────────────
   N7, and the check-21 move one paragraph over. Checks 9 and 43 hold Help's rail and
   its navigation; check 21 holds the ⋯ More routes it names. Nothing held the two
   paragraphs that describe the app bar's own right-hand cluster — the fleet waffle and
   the What's-new feed — and both had drifted, in the two directions this family knows:
   one under-counted a registry, the other routed a reader to a control that no longer
   exists.

   Measured 2026-08-09, before the fix:
   · **The waffle paragraph named 7 apps where the switcher renders 8.** app/fleet.js
     mounts `appSwitcher(publicFleet(), { current: "analytics" })`, and
     vendor/polecat-shell/catalog.js carries EIGHT public entries. **Model Server** —
     added to the fleet and arriving here whole, by sync PR, in a read-only vendor copy
     this repo cannot edit — was named nowhere on the page.
   · The same paragraph put the waffle "next to **＋ New**", the DATA PANEL's button
     (check 16's subject). The app bar's is `New ▾`, and fleet.js inserts the waffle
     before `#btnNew` specifically. The v877 drift, one document over.
   · **The What's-new paragraph documented a button DECLUTTER-1 deleted.** "the
     **Changelog** button in the footer" — app/index.html has carried no `id="btnChangelog"`
     since 2026-07-31 (the app footer is retired pending a fleet-wide shell feature;
     renderFooter and fleet.js null-guard its absence). The live routes are the top bar's
     `#tbWhatsNew` on every section and ⋯ More → What's new on a phone, and this paragraph
     named neither. Help contradicted ITSELF: its own top-bar section 600 lines above lists
     **What's new** in the right-hand cluster and documents the phone route. The v927/v929
     shape, except one half is not merely stale — it is a dead control, the class check 41
     (g) deleted from README ("ⓘ Tour") and check 44 (f) from PUBLISH.md.

   Five rules, no new source of truth — the catalog, app/fleet.js and app/index.html's own
   markup:
   (a) the switcher paragraph names every app the waffle offers;
   (b) the negative half — it names none the catalog lacks (the list is parsed from the
       paragraph's own parenthetical, so an invented app fails rather than hides);
   (c) it reaches the waffle past the button the TOP BAR renders, not the Data panel's
       `＋ New ▾` twin;
   (d) the What's-new paragraph names the top-bar control by the title app/index.html
       gives it;
   (e) the negative half of (d) — while the markup renders no `#btnChangelog`, the
       paragraph may not send a reader to the footer for it. Deliberately scoped to the
       retired footer rather than "every control Help names": the general form is check
       21's, already green over the whole page, and a looser rule here would false-positive
       on the ✕/Escape/backdrop prose the same way check 13 avoids docs/index.html. */

const fleetCatalogSrc = read("vendor/polecat-shell/catalog.js");
const fleetApps = fleetCatalogSrc.split(/\n\s*\{\s*id:/).slice(1).map((e) => ({
  id: (e.match(/^\s*'([^']+)'/) || [, ""])[1],
  name: (e.match(/name:\s*'([^']+)'/) || [, ""])[1],
  visibility: (e.match(/visibility:\s*'([^']+)'/) || [, ""])[1],
})).filter((a) => a.id && a.name);
const fleetPublic = fleetApps.filter((a) => a.visibility === "public");
const fleetSrc = read("app/fleet.js");
const fleetCurrent = (fleetSrc.match(/current:\s*"([^"]+)"/) || [, ""])[1];
const appHtmlSrc = read("app/index.html");
const topbarNewLabel = ((appHtmlSrc.match(/id="btnNew"[^>]*>([^<]+)</) || [, ""])[1] || "").trim();
const tbWhatsNewTitle = (appHtmlSrc.match(/id="tbWhatsNew"[^>]*\stitle="([^"]+)"/) || [, ""])[1] || "";
const switcherP = (help.match(/<p id="apps-switcher"[\s\S]*?<\/p>/) || [""])[0];
const whatsNewP = (help.match(/<p id="whats-new"[\s\S]*?<\/p>/) || [""])[0];
// Same apostrophe normalisation check 21 uses, so "What's new" in a title= attribute and
// "What’s new" in prose compare as one string.
const flat = (s) => htmlText(s).replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();

ok(`the fleet roster + app-bar markup parsed for check 49 (${fleetPublic.length} public app(s), ` +
   `current "${fleetCurrent}", New button "${topbarNewLabel}", What's-new title "${tbWhatsNewTitle}")`,
  fleetPublic.length >= 6 && !!fleetCurrent && !!topbarNewLabel && !!tbWhatsNewTitle &&
    !!switcherP && !!whatsNewP && fleetPublic.some((a) => a.id === fleetCurrent),
  `catalog entries: ${fleetApps.length} (${fleetPublic.length} public) · ` +
  `#apps-switcher found: ${!!switcherP} · #whats-new found: ${!!whatsNewP}\n      ` +
  "the two paragraphs carry ids as check-49 anchors, the idiom id=\"viewer-export\" already set");

// (a) coverage. publicFleet() minus the app fleet.js declares current — the switcher marks
//     that one rather than offering it as a jump, which is what the copy says too.
const wafflePeers = fleetPublic.filter((a) => a.id !== fleetCurrent);
const switcherText = flat(switcherP);
const waffleUnnamed = wafflePeers.filter((a) => !switcherText.includes(a.name));
ok(`docs/index.html: the apps-switcher paragraph names all ${wafflePeers.length} apps the waffle offers`,
  !waffleUnnamed.length,
  `in publicFleet(), unnamed by Help: ${waffleUnnamed.map((a) => a.name).join(", ") || "(none)"}\n      ` +
  "app/fleet.js renders publicFleet() whole — a reader counting tiles against this list finds one Help never mentions");

// (b) the negative half, off the paragraph's own parenthetical.
const waffleListed = flat((switcherP.match(/family\s*\(([^)]*)\)/) || [, ""])[1])
  .split(/,\s*/).map((s) => s.trim()).filter(Boolean);
const waffleInvented = waffleListed.filter((n) => !fleetPublic.some((a) => a.name === n));
ok(`docs/index.html: the apps-switcher paragraph invents no app (${waffleListed.length} listed)`,
  waffleListed.length >= 5 && !waffleInvented.length,
  `listed by Help, absent from catalog.js: ${waffleInvented.join(", ") || "(none)"}\n      ` +
  "vendor/polecat-shell/ is READ-ONLY here — the roster changes by sync PR, so Help is the half that drifts");

// (c) the button the paragraph reaches past is the app bar's, not the Data panel's twin.
//     Both end in "New ▾", so the substring test alone would pass on the wrong one — the
//     panel's leading ＋ is the discriminator, and check 16 owns that pane's own copy.
ok(`docs/index.html: the apps-switcher paragraph names the app bar's "${topbarNewLabel}", not the Data panel's ＋ form`,
  switcherText.includes(topbarNewLabel) && !/＋\s*New/.test(switcherText),
  `names "${topbarNewLabel}": ${switcherText.includes(topbarNewLabel)} · names a ＋ New form: ${/＋\s*New/.test(switcherText)}\n      ` +
  "app/fleet.js inserts the waffle before #btnNew's menu-wrap — the topbar button, whose own label carries no ＋");

// (d) + (e) the What's-new routes. The paragraph's own bolded lead-in ("What's new:") is
//     stripped first: it repeats the title verbatim and would otherwise satisfy (d) on its
//     own, which is exactly how the pre-fix copy passed a rule about a button it never named.
const whatsNewBody = flat(whatsNewP.replace(/^<p[^>]*>\s*<strong>[^<]*<\/strong>/, ""));
const whatsNewText = whatsNewBody;
const wantTitle = tbWhatsNewTitle.replace(/[’‘]/g, "'");
ok(`docs/index.html: the What's-new paragraph names the top-bar control by its own title ("${wantTitle}")`,
  whatsNewBody.includes(wantTitle),
  `paragraph: "${whatsNewText.slice(0, 120)}…"\n      ` +
  "#tbWhatsNew is the route on every section; the paragraph described only the builder's footer");
const footerChangelogLives = /id="btnChangelog"/.test(appHtmlSrc);
ok("docs/index.html: the What's-new paragraph routes to no control app/index.html has retired",
  footerChangelogLives || !/\bfooter\b/i.test(whatsNewText),
  `#btnChangelog in app/index.html: ${footerChangelogLives} · paragraph says "footer": ${/\bfooter\b/i.test(whatsNewText)}\n      ` +
  "DECLUTTER-1 retired the app footer on 2026-07-31 (brand line · Changelog toggle · Last-updated stamp); " +
  "studio.js and fleet.js null-guard its absence, so nothing in the app ever complained");


/* ── 50. Help's chart gallery vs the groups the picker really renders ───────
   N7. Checks 2 and 3 have held this section since AUD-11 — 2 that every registry type
   has a card, 3 that every published COUNT is 54 — so the section has been complete and
   correctly numbered for weeks. Neither asks the question a reader actually asks it:
   the cards are FILED under group headings, and the inspector's picker files the same
   54 charts under tabs of its own. `app/studio.js`'s gallery builds `groupOrder` from
   `Studio.CHARTS[t].group` and renders one `.cg-tab` per group, so those headings and
   those tabs are the same vocabulary — published twice, derived once, compared never.

   Measured 2026-08-09, before the fix — three charts and one whole group:
   · **`ensembleSeries` was filed under Maps.** The registry (and the tab) says **Trend**.
     It sat directly under the choropleth because the two share an ensemble channel, which
     is a real relationship and the wrong shelf: a reader who opens the Maps tab looking
     for the card Help showed them there finds one chart, not two.
   · **`Comparison` appeared TWICE** — the fifteen bar-family cards at the top, then
     `quadrant` alone in a second heading of the same name at the bottom, below
     Distribution. The picker renders ONE Comparison tab of sixteen. A duplicate heading
     is the failure mode a coverage check cannot see: every card was present, every count
     was 54, and the page still published ten groups where the app renders nine.
   · **`richtext` was filed under Detail, and `Content` — the app's ninth tab — was named
     nowhere on the page.** `app/studio.js`'s own comment at the gallery says what the
     group is for ("Content group = richtext/annotation"); Help had folded it into the
     table's shelf, so the one tab a reader is least likely to guess was the one tab Help
     never mentioned.

   Five rules, no new source of truth — the same registry checks 2/3 read, plus the
   picker's own grouping expression:
   (a) every card sits under the h3 that names its registry group (`ct-kpi` stays exempt
       via check 2's CARD_EXTRAS — the KPI tile is a panel kind, not a CHARTS entry, and
       "Single value" is where it belongs);
   (b) every group the picker renders a tab for is published as an h3 — the rule that
       makes a vanished `Content` loud;
   (c) the negative half — no h3 in the section names a group the registry does not have;
   (d) no group heading appears twice, because no tab does;
   (e) the premise itself: `app/studio.js` still derives `groupOrder` from `.group` and
       still labels a tab per group. If the picker stops grouping this way the other four
       rules are comparing Help against nothing, so this fails loudly rather than passing
       green over a dead source. Deliberately NOT held: the ORDER of the groups. The
       picker's is registry first-seen (Comparison first); Help leads with Maps because
       the choropleth is the app's strongest chart, and check 12 already settled that a
       teaching document owes coverage, not a walk order. */

function chartRegistryGroups() {
  const src = read("app/model.js");
  const start = src.indexOf("Studio.CHARTS = {");
  let depth = 0, open = src.indexOf("{", start), i = open;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) break;
  }
  const block = src.slice(open, i + 1);
  const at = [...block.matchAll(/\n {4}([A-Za-z_]\w*): \{/g)];
  const out = new Map();
  at.forEach((m, n) => {
    const entry = block.slice(m.index, n + 1 < at.length ? at[n + 1].index : block.length);
    out.set(m[1], (entry.match(/(?:^|[,{\s])group: "([^"]+)"/) || [, ""])[1]);
  });
  return out;
}

const chartGroups = chartRegistryGroups();
const pickerSrc = read("app/studio.js");
// The gallery's own grouping expression and its tab label, matched where they live rather
// than by name, so a rename that keeps the behaviour still satisfies (e) and a rewrite
// that drops the grouping does not.
const pickerGroupsBy = /var g = \(Studio\.CHARTS\[t\]\.group \|\| "Other"\);/.test(pickerSrc);
const pickerTabsPerGroup = /\["All"\]\.concat\(groupOrder\)\.forEach/.test(pickerSrc);
const galleryStart = help.indexOf('<section id="chart-types"');
const gallerySec = galleryStart < 0 ? "" : help.slice(galleryStart, help.indexOf("</section>", galleryStart));
// One walk: an h3 opens a shelf, every ct- id after it lands on that shelf.
const galleryShelves = [];
for (const m of gallerySec.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>|id="ct-([A-Za-z]+)"/g)) {
  if (m[1] !== undefined) galleryShelves.push({ name: htmlText(m[1]), cards: [] });
  else if (galleryShelves.length) galleryShelves[galleryShelves.length - 1].cards.push(m[2]);
}
const registryGroups = [...new Set([...chartGroups.values()])];

ok(`the chart registry + the picker's gallery parsed for check 50 ` +
   `(${chartGroups.size} type(s) in ${registryGroups.length} group(s), ${galleryShelves.length} heading(s) in Help)`,
  chartGroups.size === N && [...chartGroups.values()].every(Boolean) &&
    registryGroups.length >= 5 && galleryShelves.length >= 5 && !!gallerySec,
  `registry types: ${chartGroups.size} (check 2 counts ${N}) · ungrouped: ` +
  `${[...chartGroups].filter(([, g]) => !g).map(([k]) => k).join(", ") || "none"} · ` +
  `#chart-types found: ${!!gallerySec}\n      ` +
  "every Studio.CHARTS entry declares a group — the picker falls back to \"Other\", but nothing ships on it");

// (e) first: the other four rules are only meaningful while the picker still groups this way.
ok("app/studio.js: the chart picker still files the gallery by Studio.CHARTS[t].group, one tab per group",
  pickerGroupsBy && pickerTabsPerGroup,
  `groups by .group: ${pickerGroupsBy} · renders a tab per group: ${pickerTabsPerGroup}\n      ` +
  "check 50 (a)-(d) compare Help's headings against those tabs — if the gallery stopped grouping, " +
  "they would be comparing the page against nothing, so the premise is asserted rather than assumed");

// (a) every card on the shelf its own registry entry names.
const cardsMisfiled = galleryShelves.flatMap((s) => s.cards
  .filter((k) => !CARD_EXTRAS.has(k) && chartGroups.get(k) !== s.name)
  .map((k) => `${k} is under "${s.name}", the picker files it under "${chartGroups.get(k)}"`));
ok(`docs/index.html: every chart card is filed under the group the picker files it under (${chartGroups.size} type(s))`,
  !cardsMisfiled.length,
  `${cardsMisfiled.join("\n      ") || "(none)"}\n      ` +
  "the headings and the picker's tabs are the same vocabulary — a card on the wrong shelf sends a reader to the wrong tab");

// (b) coverage: a group the picker offers may not go groupsUnpublished.
const galleryShelfNames = galleryShelves.map((s) => s.name);
const groupsUnpublished = registryGroups.filter((g) => !galleryShelfNames.includes(g));
ok(`docs/index.html: the gallery publishes every group the picker offers (${registryGroups.length})`,
  !groupsUnpublished.length,
  `offered by the picker, absent from Help: ${groupsUnpublished.join(", ") || "(none)"}\n      ` +
  "Content is the case this rule exists for — one chart, one tab, and the tab a reader is least likely to guess");

// (c) the negative half — no groupsInvented shelf. Scoped to the gallery's own h3s, which are
//     group headings and nothing else (its prose lives in <p> and the tip block).
const groupsInvented = galleryShelfNames.filter((n) => !registryGroups.includes(n));
ok(`docs/index.html: the gallery invents no group (${galleryShelfNames.length} heading(s))`,
  !groupsInvented.length,
  `published by Help, unknown to the registry: ${groupsInvented.join(", ") || "(none)"}\n      ` +
  "a heading with no tab behind it is a shelf the reader cannot find in the app");

// (d) one heading per group, because one tab per group. The duplicate "Comparison" this
//     check was written for passed (a), (b) and (c) — every card was on a correctly-named
//     shelf, both galleryShelves were real groups — and was still a lie about the app's shape.
const groupDupes = galleryShelfNames.filter((n, i) => galleryShelfNames.indexOf(n) !== i);
ok("docs/index.html: no group is published twice",
  !groupDupes.length,
  `published more than once: ${[...new Set(groupDupes)].join(", ") || "(none)"}\n      ` +
  "the picker renders exactly one tab per group; a second heading of the same name splits it on the page only");


/* ── 51. Help's sort control vs the six catalog panels that render one ──────
   N7, and the check-49 move one paragraph over. Help's catalog-pages block describes
   the whole sort control in a single sentence — the option list, the per-section
   extras, the default, and what a pin does to the order — for all six panels at once.
   Each panel declares that control itself, as a literal option list handed to
   `Studio.catalogSort.wire(sel, sec, "updated-desc", [[value, label], …], rerender)`,
   and each sorts its own list a few lines below. Nothing had compared the two.

   Measured 2026-08-09, before the fix — three drifts, and the last is the one a reader
   acts on:
   · **Dashboards labels the default option `Last updated`.** The other five label the
     same `updated-desc` key "Newest first", which was the only name the paragraph gave,
     so the page most readers start on is the one page where the option Help names is
     not in the menu.
   · **Connections' `By adapter` was named nowhere.** The extras parenthetical attributed
     extras to four pages; Connections has one too, and it was the only offered option on
     any of the six panels the paragraph left out entirely.
   · **"pinned items always stay at the top whatever the sort" was true of three panels
     out of six.** Datasets, Connections and Views really do sort a pinned item first
     (`if (!!a.pinned !== !!b.pinned)` ahead of the sort key). `renderDashboards` sorts
     with `list.sort(dashSortCmp)` and no such tiebreak — a dashboard's pin means "pin to
     Home", which its own button title says — `app/jobs.js` contains the word `pinned`
     nowhere, and the Repository renders no pin control at all. Help's own catalog-rows
     section sixty lines below says so outright ("Jobs are the one of the three with no
     pin"), so the page was simultaneously right and wrong about the same control — the
     v929/v936 shape, and the stale half was again the one printed beside the feature.

   Five rules, no new source of truth — the six wire() call sites and each panel's own
   list sort:
   (a) the premise + the roster: exactly six panels wire a sort control, all six on the
       same `updated-desc` default, and the pages Help enumerates are exactly those six.
       If a panel stops wiring one, the other four rules would be comparing the paragraph
       against nothing, so this fails loudly rather than passing green over a dead source;
   (b) the default option's LABEL per panel — the shared name is published, and a panel
       that labels it differently is named beside its own label;
   (c) the non-default options every panel shares — "Oldest first" and both name directions;
   (d) extras, both directions: every per-section extra is named under its own page, and no
       page is given an extra it does not offer. The parenthetical is segmented by page
       name, so Datasets' and Connections' two `By adapter` extras cannot cover for each
       other — which is exactly how the missing one hid;
   (e) the pinned-first claim names exactly the panels whose sort really does it.
   Deliberately NOT held: the ORDER the options appear in, and any wording beyond the
   label's own noun — check 12's rule again, a teaching document owes coverage, not a
   transcript. */

const CATALOG_PAGES = {
  dashboards: "Dashboards", views: "Views", datasets: "Datasets",
  connections: "Connections", jobs: "Jobs", repository: "Repository",
};
const BASE_SORT_KEYS = ["updated-desc", "updated-asc", "name-asc", "name-desc"];

// Every panel that wires a sort control, with its literal option list and whether its own
// list sort puts pinned items first. The pinned tiebreak, where a panel has one, is the
// first thing inside the first `.sort(` after the wire call — that is the panel's list
// sort in all six files, and (a) asserts every panel had one to read.
function catalogSortPanels() {
  const out = [];
  const wire = /Studio\.catalogSort\.wire\(\s*\$\("#[\w-]+"\),\s*"([\w-]+)",\s*"([\w-]+)",\s*\[/g;
  for (const f of fs.readdirSync(path.join(ROOT, "app")).filter((n) => n.endsWith(".js")).sort()) {
    const src = read("app/" + f);
    for (const m of src.matchAll(wire)) {
      // brace-walk the option array — the [value, label] pairs are themselves arrays, so a
      // non-greedy match to the first "]" would stop inside the first option.
      const open = m.index + m[0].length - 1;
      let depth = 0, i = open;
      for (; i < src.length; i++) {
        if (src[i] === "[") depth++;
        else if (src[i] === "]" && --depth === 0) break;
      }
      const list = src.slice(open, i + 1);
      const at = src.indexOf(".sort(", i);
      const body = at < 0 ? "" : src.slice(at, at + 400);
      out.push({
        sec: m[1], def: m[2], file: "app/" + f, sorted: at >= 0,
        options: [...list.matchAll(/\["([\w-]+)",\s*"([^"]+)"\]/g)].map((o) => ({ key: o[1], label: o[2] })),
        pinnedFirst: /!!a\.pinned !== !!b\.pinned/.test(body),
      });
    }
  }
  return out;
}

const panels = catalogSortPanels();
const sortPara = htmlText((help.match(/<p><strong>Sorting\.<\/strong>[\s\S]*?<\/p>/) || [""])[0])
  .replace(/\s+/g, " ").trim();
// The paragraph's own enumeration, between the em dashes that open the sentence.
const sortRoster = (sortPara.match(/Every catalog page — ([^—]+) — has a sort control/) || [, ""])[1]
  .split(/,\s*|\s+and\s+/).map((s) => s.replace(/^the\s+/, "").trim()).filter(Boolean);

// (a) first: the premise and the roster together.
const panelSecs = panels.map((p) => p.sec).sort();
const expectedSecs = Object.keys(CATALOG_PAGES).sort();
const rosterExpected = expectedSecs.map((s) => CATALOG_PAGES[s]).sort();
ok(`app/ + docs/index.html: six catalog panels wire a sort control, and Help enumerates those six ` +
   `(${panels.length} panel(s), ${sortRoster.length} page(s) named)`,
  panels.length === 6 && String(panelSecs) === String(expectedSecs) &&
    panels.every((p) => p.def === "updated-desc" && p.sorted && p.options.length >= BASE_SORT_KEYS.length) &&
    String([...sortRoster].sort()) === String(rosterExpected),
  `wired: ${panels.map((p) => `${p.sec} (${p.file}, ${p.options.length} option(s), default ${p.def}` +
    `${p.sorted ? "" : ", NO list sort found"})`).join(" · ")}\n      ` +
  `Help enumerates: ${sortRoster.join(", ") || "(nothing)"}\n      ` +
  "one sentence describes all six controls — rules (b)-(e) are only meaningful while all six exist");

// (b) the default option's label, per panel. Five panels say "Newest first" and Dashboards
//     says "Last updated"; the shared name is required, and any panel that differs has to be
//     named beside the label it really carries (within its own clause).
const defLabels = panels.map((p) => ({ page: CATALOG_PAGES[p.sec], label: (p.options.find((o) => o.key === "updated-desc") || {}).label }));
const labelTally = {};
defLabels.forEach((d) => { labelTally[d.label] = (labelTally[d.label] || 0) + 1; });
const sharedDefault = Object.keys(labelTally).sort((a, b) => labelTally[b] - labelTally[a])[0];
const defaultUnnamed = defLabels.filter((d) => {
  if (d.label === sharedDefault) return !sortPara.includes(sharedDefault);
  const i = sortPara.indexOf(d.label);
  return i < 0 || !sortPara.slice(Math.max(0, i - 80), i).includes(d.page);
});
// The negative half, and check 49 (d)'s lesson about lead-ins: the paragraph marks a panel's
// odd-one-out label with <strong>, and nothing else in it is bolded but the "Sorting." lead-in.
// So every remaining bold phrase has to BE a label some panel carries, credited to a panel
// that carries it — otherwise a rename in the app leaves a stale exception reading as current.
const sortParaHtml = (help.match(/<p><strong>Sorting\.<\/strong>[\s\S]*?<\/p>/) || [""])[0];
const boldClaims = [...sortParaHtml.matchAll(/<strong>([\s\S]*?)<\/strong>/g)].slice(1).map((m) => {
  const label = htmlText(m[1]).replace(/\s+/g, " ").trim();
  const before = htmlText(sortParaHtml.slice(0, m.index)).replace(/\s+/g, " ");
  const pages = [...before.matchAll(new RegExp(`\\b(${Object.values(CATALOG_PAGES).join("|")})\\b`, "g"))];
  return { label, page: pages.length ? pages[pages.length - 1][1] : "(none)" };
}).filter((b) => !defLabels.some((d) => d.page === b.page && d.label === b.label));
ok(`docs/index.html: the default sort is published by the label each panel really carries ` +
   `(${Object.keys(labelTally).length} distinct label(s))`,
  !defaultUnnamed.length && !boldClaims.length,
  `${defaultUnnamed.map((d) => `${d.page} labels updated-desc "${d.label}" — not named beside "${d.page}" in the paragraph`)
    .concat(boldClaims.map((b) => `Help bolds "${b.label}" after "${b.page}" — that panel's default is not labelled that`))
    .join("\n      ") || "(none)"}\n      ` +
  `panels say: ${defLabels.map((d) => `${d.page}: ${d.label}`).join(" · ")}\n      ` +
  "a reader on Dashboards looking for the option Help calls the default has to find it in that menu");

// (c) the options every panel shares. The name pair is held by its direction token, because
//     the paragraph collapses the two labels into "Name A–Z / Z–A".
const sharedOther = ["updated-asc", "name-asc", "name-desc"].map((k) => {
  const labels = [...new Set(panels.map((p) => (p.options.find((o) => o.key === k) || {}).label))];
  return { key: k, label: labels.length === 1 ? labels[0] : null };
});
const sharedMissing = sharedOther.filter((s) => {
  if (!s.label) return true;
  const token = s.key.startsWith("name-") ? s.label.replace(/^Name\s+/, "") : s.label;
  return !sortPara.includes(token);
});
ok("docs/index.html: every option all six panels share is published",
  !sharedMissing.length,
  `unpublished (or not shared by all six): ${sharedMissing.map((s) => s.label || s.key).join(", ") || "(none)"}\n      ` +
  `shared: ${sharedOther.map((s) => `${s.key} → ${s.label || "(varies)"}`).join(" · ")}`);

// (d) the extras, both directions. The parenthetical is segmented by PAGE NAME so an extra
//     credited to the wrong page is a miss, not a pass: Datasets and Connections both offer
//     "By adapter", and the paragraph naming it once was how Connections' went missing.
const extrasPara = (sortPara.match(/per-section extras \(([^)]*)\)/) || [, ""])[1];
const pageAt = [...extrasPara.matchAll(new RegExp(`\\b(${Object.values(CATALOG_PAGES).join("|")})\\b`, "g"))];
const extrasSeg = {};
pageAt.forEach((m, i) => {
  extrasSeg[m[1]] = extrasPara.slice(m.index + m[1].length, i + 1 < pageAt.length ? pageAt[i + 1].index : extrasPara.length);
});
const nounOf = (label) => label.replace(/^By\s+/, "").toLowerCase();
const allNouns = [...new Set(panels.flatMap((p) => p.options.filter((o) => !BASE_SORT_KEYS.includes(o.key)).map((o) => nounOf(o.label))))];
const extrasWrong = [];
panels.forEach((p) => {
  const page = CATALOG_PAGES[p.sec], seg = extrasSeg[page] || "";
  const mine = p.options.filter((o) => !BASE_SORT_KEYS.includes(o.key)).map((o) => nounOf(o.label));
  mine.filter((n) => !seg.toLowerCase().includes(n)).forEach((n) => extrasWrong.push(`${page} offers "${n}" — not published under ${page}`));
  allNouns.filter((n) => !mine.includes(n) && seg.toLowerCase().includes(n))
    .forEach((n) => extrasWrong.push(`Help credits ${page} with "${n}" — that panel does not offer it`));
});
ok(`docs/index.html: every per-section sort extra is published under its own page ` +
   `(${panels.reduce((n, p) => n + p.options.length - BASE_SORT_KEYS.length, 0)} extra(s))`,
  !extrasWrong.length,
  `${extrasWrong.join("\n      ") || "(none)"}\n      ` +
  "segmented by page name — two panels offering the same extra cannot cover for each other");

// (e) the pinned-first claim. Three panels sort a pinned item first; the sentence used to
//     promise all six, contradicting Help's own catalog-rows section ("Jobs are the one of
//     the three with no pin") sixty lines below it.
const pinSentence = (sortPara.split(/(?<=\.)\s+/).find((s) => /\bpin/i.test(s)) || "");
const pinWrong = panels.map((p) => ({ page: CATALOG_PAGES[p.sec], first: p.pinnedFirst }))
  .filter((p) => p.first !== new RegExp(`\\b${p.page}\\b[^;]*stays at the top|stays at the top[^;]*\\b${p.page}\\b`)
    .test(pinSentence.split(";")[0]));
ok(`docs/index.html: the pinned-first claim names exactly the panels whose sort does it ` +
   `(${panels.filter((p) => p.pinnedFirst).length} of ${panels.length})`,
  !!pinSentence && !pinWrong.length,
  `${pinWrong.map((p) => p.first ? `${p.page} sorts pinned items first — Help does not say so`
    : `Help promises pinned-first on ${p.page}, whose list sort has no pinned tiebreak`).join("\n      ") || "(none)"}\n      ` +
  `sorts pinned first: ${panels.filter((p) => p.pinnedFirst).map((p) => CATALOG_PAGES[p.sec]).join(", ") || "(none)"}\n      ` +
  `pin sentence: ${pinSentence || "(none found)"}\n      ` +
  "a promised ordering the page does not do is the half of a contradiction a reader acts on");


/* ── 52. Help's "what each page searches" vs the six panels' own search haystacks ────
   N7, and the check-51 move one paragraph over — the same six catalog panels, the
   control immediately left of the sort menu. Help described what a search looks at in
   one clause of the Searching paragraph; each panel declares it itself, as the field
   list handed to `Studio.catalogSearch.matcher(q, fn)` (Dashboards hands the same list
   to `catalogSearch.hay()` because its column fallback needs the terms separately).
   Nothing had compared the two.

   Measured 2026-08-09, before the fix — the clause covered four of the six pages, and
   what it left out is what a reader would have had to discover by accident:
   · **Views and the Repository were absent entirely.** Views searches the CHART TYPE, so
     typing "choropleth" finds every map you have saved — a genuinely useful thing that
     was published nowhere. The Repository searches each row's one-line summary.
   · **Datasets' list left out the connection's name**, which `datasets.js` really does
     search — "snowflake" finds every dataset reading that connection, and Help's list of
     seven Datasets fields named the other seven.
   · **Connections' clause named the adapter and settings but not its tags**, and the
     shape of the sentence ("name, folder, tags … for Datasets; adapter and settings for
     Connections") published the two panels' shared fields as if they belonged to
     Datasets alone — the reason the rewrite states the shared baseline once and then
     what each page ADDS, rather than re-listing name and folder six times.

   Five rules, and no new source of truth — the six panels check 51 already found, plus
   each one's own haystack:
   (a) the premise + the roster: every panel declares a haystack inside its own render
       function, every expression in it has a row in the vocabulary below, no row is
       stale, and Help's paragraph enumerates exactly those six pages one clause each.
       The vocabulary is keyed by the EXPRESSION, so a panel that starts searching a new
       field — or renames the one it searches — falls out of its row and fails here
       rather than passing green while Help omits it;
   (b) the baseline: all six really do search name + folder, and the paragraph publishes
       that once, before naming any page;
   (c) every non-baseline field a panel searches is published in that page's own clause;
   (d) the negative half — no clause credits a page with a field it does not search.
       Segmented by page, so Datasets' tags cannot cover for Connections' tags, which is
       exactly how the missing one hid;
   (e) the promise about secrets: the connection haystack still drops password-typed
       config values, AND Help still says so. A claim about where a stored token can
       never turn up is the one claim that must not be able to go stale quietly.
   Deliberately NOT held: the ORDER the pages appear in, and any wording beyond each
   field's own noun — check 12's rule again, a teaching document owes coverage, not a
   transcript. Scoped to the catalog panels: the paragraph below it ("…and every other
   search box too") is a claim about a different set of files and is its own check. */

// The searchable fields each panel declares, in the panel's own words, mapped to the
// noun Help has to publish for each. `null` marks the two baseline fields every panel
// searches — published once in the paragraph's opening sentence, not per page.
const CATALOG_SEARCH_FIELDS = {
  dashboards: [
    ["sp.title || sp.name", "name", null],
    ["r.folder", "folder", null],
    ["sp.desc", "the description", /\bdescription\b/i],
    // The column fallback is a searchable field like any other, just reached only once
    // the row's own text has missed — the extractor adds it wherever the panel calls it.
    ["matchedColumnName()", "the bound column names", /column names/i],
  ],
  views: [
    ["a.name", "name", null],
    ["a.folder", "folder", null],
    ['vwChartLabel(a.chartType || "bars")', "the chart type", /chart type/i],
  ],
  datasets: [
    ["d.name", "name", null],
    ["d.folder", "folder", null],
    ["d.desc", "the description", /\bdescription\b/i],
    ["d.owner", "the owner", /\bowner\b/i],
    ["d.tags", "its tags", /\btags\b/i],
    ["d.sql || d.table || d.collection", "the query text", /query text/i],
    ["d.columns", "its column names", /column names/i],
    ['conn ? conn.name : ""', "the connection's name", /connection it reads|connection'?s name/i],
  ],
  connections: [
    ["c.name", "name", null],
    ["c.folder", "folder", null],
    ["src.label || c.adapter", "the adapter", /\badapter\b/i],
    ["cfgHay", "the rest of its settings", /\bsettings\b/i],
    ["c.tags", "its tags", /\btags\b/i],
  ],
  jobs: [
    ["j.name", "name", null],
    ["j.folder", "folder", null],
    ['src ? src.name : ""', "the source dataset", /source dataset/i],
    ["j.outputName", "the output dataset", /\boutput\b/i],
  ],
  repository: [
    ["r.title", "name", null],
    ["r.folder", "folder", null],
    ["r.meta", "the row's one-line summary", /\bsummary\b/i],
  ],
};

// A panel's haystack, read out of its OWN render function so the many other matcher
// calls in the same file (the builder's Data panel, Explore, the activity log) can't be
// mistaken for it. Brace/bracket walking rather than a non-greedy match: the field list
// holds ternaries, calls and `||` chains, so the first "]" is not the end of it.
function searchBlockAt(src, open, oc, cc) {
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === oc) depth++;
    else if (src[i] === cc && --depth === 0) break;
  }
  return src.slice(open, i + 1);
}
function searchFieldList(list) {
  const out = [];
  let depth = 0, cur = "", quote = null;
  for (let i = 1; i < list.length - 1; i++) {
    const c = list[i];
    if (quote) { cur += c; if (c === quote && list[i - 1] !== "\\") quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    if (c === "," && depth === 0) { out.push(cur.trim().replace(/\s+/g, " ")); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim().replace(/\s+/g, " "));
  return out;
}
function catalogSearchPanels() {
  return panels.map((p) => {
    const src = read(p.file);
    const fn = "render" + p.sec[0].toUpperCase() + p.sec.slice(1);
    const at = src.indexOf("function " + fn + "(");
    const body = at < 0 ? "" : searchBlockAt(src, src.indexOf("{", at), "{", "}");
    const m = body.match(/Studio\.catalogSearch\.matcher\(\s*\w+,\s*function \(\w+\) \{[\s\S]*?return (\[)/);
    const hay = body.indexOf("Studio.catalogSearch.hay(");
    const listAt = m ? body.indexOf("[", m.index + m[0].length - 1) : (hay < 0 ? -1 : body.indexOf("[", hay));
    const fields = listAt < 0 ? [] : searchFieldList(searchBlockAt(body, listAt, "[", "]"));
    if (/matchedColumnName\(/.test(body)) fields.push("matchedColumnName()");
    return { sec: p.sec, page: CATALOG_PAGES[p.sec], fn, file: p.file, fields,
      dropsPasswords: /f\.type === "password" \? "" :/.test(body) };
  });
}

const searchPanels = catalogSearchPanels();
const searchParaHtml = (help.match(/<p><strong>What each page searches\.<\/strong>[\s\S]*?<\/p>/) || [""])[0];
const searchPara = htmlText(searchParaHtml).replace(/\s+/g, " ").trim();
const searchBaselineSentence = searchPara.split(/On top of that:/)[0] || "";
// One clause per page, semicolon-separated — the paragraph's own punctuation.
const searchClauses = (searchPara.split(/On top of that:/)[1] || "").split(";")
  .map((s) => s.trim()).filter(Boolean)
  .map((text) => ({ text, pages: Object.values(CATALOG_PAGES).filter((pg) => new RegExp(`\\b${pg}\\b`).test(text)) }));
const searchClauseOf = (page) => (searchClauses.find((c) => c.pages.length === 1 && c.pages[0] === page) || { text: "" }).text;

// (a) first: the premise, the vocabulary and the roster together. The other four rules
//     are only meaningful while every panel still declares a haystack this can read.
const vocabWrong = [];
searchPanels.forEach((p) => {
  const rows = CATALOG_SEARCH_FIELDS[p.sec] || [];
  if (!p.fields.length) vocabWrong.push(`${p.page}: no search field list found in ${p.fn} (${p.file})`);
  p.fields.filter((f) => !rows.some((r) => r[0] === f))
    .forEach((f) => vocabWrong.push(`${p.page} searches \`${f}\` — nothing in the vocabulary says what to call it`));
  rows.filter((r) => !p.fields.includes(r[0]))
    .forEach((r) => vocabWrong.push(`the vocabulary still maps \`${r[0]}\` for ${p.page} — that panel no longer searches it`));
});
const searchRoster = searchClauses.filter((c) => c.pages.length === 1).map((c) => c.pages[0]).sort();
const searchRosterExpected = searchPanels.map((p) => p.page).sort();
ok(`app/ + docs/index.html: six catalog panels declare a search haystack, and Help gives each one a clause ` +
   `(${searchPanels.reduce((n, p) => n + p.fields.length, 0)} field(s) over ${searchPanels.length} panel(s), ` +
   `${searchClauses.length} clause(s))`,
  searchPanels.length === 6 && !vocabWrong.length && !!searchParaHtml &&
    searchClauses.length === 6 && String(searchRoster) === String(searchRosterExpected),
  `${vocabWrong.join("\n      ") || "(vocabulary complete)"}\n      ` +
  `${searchPanels.map((p) => `${p.page} (${p.fn}, ${p.fields.length})`).join(" · ")}\n      ` +
  `Help's clauses name: ${searchClauses.map((c) => c.pages.join("+") || "(no page)").join(", ") || "(paragraph not found)"}\n      ` +
  "the vocabulary is keyed by the panel's own expression — a new or renamed searchable field lands here first");

// (b) the baseline every panel shares, published once rather than six times.
const baselineMissing = [];
searchPanels.forEach((p) => {
  (CATALOG_SEARCH_FIELDS[p.sec] || []).filter((r) => !r[2] && !p.fields.includes(r[0]))
    .forEach((r) => baselineMissing.push(`${p.page} no longer searches ${r[1]} (\`${r[0]}\`)`));
});
const baselineUnpublished = [...new Set(Object.values(CATALOG_SEARCH_FIELDS).flat().filter((r) => !r[2]).map((r) => r[1]))]
  .filter((n) => !new RegExp(`\\b${n}\\b`, "i").test(searchBaselineSentence));
ok(`docs/index.html: the shared baseline is published once and every panel really searches it ` +
   `(${[...new Set(Object.values(CATALOG_SEARCH_FIELDS).flat().filter((r) => !r[2]).map((r) => r[1]))].join(" + ")})`,
  !baselineMissing.length && !baselineUnpublished.length && !!searchBaselineSentence.trim(),
  `${[...baselineMissing, ...baselineUnpublished.map((n) => `the opening sentence never names "${n}"`)].join("\n      ") || "(none)"}\n      ` +
  `baseline sentence: ${searchBaselineSentence.trim() || "(none found)"}\n      ` +
  "six panels searching the same two fields is a claim about all six — it belongs above the per-page clauses");

// (c) every non-baseline field a panel searches, published in that page's own clause.
const searchUnpublished = [];
searchPanels.forEach((p) => {
  const clause = searchClauseOf(p.page);
  (CATALOG_SEARCH_FIELDS[p.sec] || []).filter((r) => r[2] && p.fields.includes(r[0]) && !r[2].test(clause))
    .forEach((r) => searchUnpublished.push(`${p.page} searches ${r[1]} (\`${r[0]}\`) — its clause does not say so`));
});
ok(`docs/index.html: every field a panel adds to the baseline is published under that page ` +
   `(${Object.values(CATALOG_SEARCH_FIELDS).flat().filter((r) => r[2]).length} field(s))`,
  !searchUnpublished.length,
  `${searchUnpublished.join("\n      ") || "(none)"}\n      ` +
  `clauses: ${searchPanels.map((p) => `${p.page}: ${searchClauseOf(p.page) || "(no clause)"}`).join("\n      ")}\n      ` +
  "a field nobody publishes is one a reader finds by accident, or never");

// (d) the negative half, segmented by page: no clause may credit its page with a field
//     that page does not search.
const searchOverclaimed = [];
// Compared by the field's own PROBE, not by its noun: Datasets searches its columns and
// Dashboards falls back to the ones its charts are bound to, which are two rows with two
// nouns and one published phrase — a page that really searches the field must not be
// flagged for saying so.
const searchVocab = Object.values(CATALOG_SEARCH_FIELDS).flat().filter((r) => r[2])
  .filter((r, i, all) => all.findIndex((o) => o[2].source === r[2].source) === i)
  .map((r) => ({ noun: r[1], re: r[2] }));
searchPanels.forEach((p) => {
  const clause = searchClauseOf(p.page), mine = CATALOG_SEARCH_FIELDS[p.sec] || [];
  searchVocab.filter((v) => !mine.some((r) => r[2] && r[2].source === v.re.source && p.fields.includes(r[0])) && v.re.test(clause))
    .forEach((v) => searchOverclaimed.push(`Help credits ${p.page} with ${v.noun} — that panel does not search it`));
});
ok("docs/index.html: no page's clause credits it with a field that page does not search",
  !searchOverclaimed.length,
  `${[...new Set(searchOverclaimed)].join("\n      ") || "(none)"}\n      ` +
  "segmented by page — two panels searching the same field cannot cover for each other");

// (e) the promise about secrets, held from both ends.
const pwPanel = searchPanels.find((p) => p.sec === "connections") || {};
const pwPublished = /never a password or token/i.test(searchClauseOf(CATALOG_PAGES.connections));
ok("app/connections.js + docs/index.html: a password-typed setting stays out of the haystack, and Help still promises it",
  !!pwPanel.dropsPasswords && pwPublished,
  `carve-out in ${pwPanel.fn || "renderConnections"}: ${!!pwPanel.dropsPasswords} · published: ${pwPublished}\n      ` +
  `Connections clause: ${searchClauseOf(CATALOG_PAGES.connections) || "(none)"}\n      ` +
  "a stored token that matched a search could be confirmed by typing it — the code and the promise move together");



/* ── 53. Help's filter pills vs the facets the six catalog panels declare ───
   N7, and the check-52 move one paragraph down: the block that tells a reader how the
   catalog pages narrow a list had two paragraphs held to their sources (Searching, What
   each page searches) and a third — Filtering with pills — held to nothing. Each panel
   declares its facets itself: the shared kit's `matchMulti` (tick as many pills as you
   like) and `matchOne` (one at a time) name the MODE outright and take the field
   accessor as their second argument, and the two chip strips that predate the kit
   declare the same thing in their markup, by comparing ONE scalar to the chip's id.

   Measured 2026-08-09, before the fix — three drifts, and two of them run in the
   direction that costs a reader clicks:
   · **The Repository was absent entirely.** It filters by the KIND of row — Dashboards,
     Datasets, Connections, Views, Jobs — off the same `wb-chip` strip the Dashboards
     workbook chips render, and no sentence on the page said so. It is also the only
     catalog page whose rows are all of different kinds, so it is the page where a type
     facet matters most.
   · **Dashboards' workbook chips were published as multi-select.** `_repoWbFilter` is a
     scalar and the chip's active test is `_repoWbFilter === c.id`, so picking a second
     workbook replaces the first. Help listed it beside three genuinely multi-select
     facets under "The other facets are multi-select", which is copy promising more app
     than ships — the v924 shape.
   · **The Folders strip was described as if every page had one.** Five do; the Repository
     groups its rows into a nested folder TREE instead and renders no strip at all. The
     sentence never named a page, so a reader on the one page without the control was
     left hunting for it.

   Five rules, and no new source of truth beyond the panel roster check 51 already
   found — each panel's own facet declarations:
   (a) the premise + the vocabulary + the roster: every panel declares at least one facet
       where this can read it, every axis has a row in the vocabulary below, no row is
       stale, and Help's two halves each enumerate one clause per page. The vocabulary is
       keyed by the panel's OWN identifier — the accessor `matchMulti`/`matchOne` reads,
       or the scalar the chip strip compares — so a new facet, or a renamed one, falls out
       of its row and fails here rather than passing green while Help omits it;
   (b) every multi-select facet is published in the multi-select half, under its own page;
   (c) every single-select facet that is NOT the folder strip is published in the
       one-pill-at-a-time half, under its own page (the strip has its own paragraph);
   (d) the folder strip's roster and its count word, plus the exception named as one: the
       pages Help lists are exactly the pages that render a strip, and the page that does
       not is named as the page that does not;
   (e) the negative half, and it is segmented by page AND by mode — a clause may not
       credit its page with a facet that page does not have, and may not credit a
       single-select facet to the multi-select half. Mode is the half of this rule that
       the pre-fix paragraph failed, which is why it is not enough to ask whether the
       facet is named somewhere.
   Deliberately NOT held: the ORDER the facets appear in, each pill's own LABEL (the
   Datasets kind pills print sql/table/file/collection/sheet through `dsxKindLabel`;
   holding thirteen pill labels to thirteen sentences is a different derivation and its
   own slice), and any wording beyond each axis's own noun — check 12's rule again, a
   teaching document owes coverage, not a transcript. */

// Each panel's facet axes, keyed by the panel's own identifier for the axis, mapped to
// the noun Help has to publish. `mode` is derived, not declared here — it is asserted
// against the source in (a) — and `null` marks the folder strip, whose claims live in
// its own paragraph rather than in the per-page clauses.
const CATALOG_FACET_AXES = {
  dashboards: [
    ["dashFolderOf", "folder", null],
    ["_repoWbFilter", "workbook", /\bworkbook\b/i],
  ],
  views: [
    ["vwTypeOf", "the chart type", /chart type/i],
    ["vwFolderOf", "folder", null],
  ],
  datasets: [
    ["dsxAdapterIdOf", "the adapter", /\badapter\b/i],
    ["dsxConnIdOf", "the connection", /\bconnection\b/i],
    ["dsxTagsOf", "its tags", /\btags?\b/i],
    // The lookbehind is load-bearing: Views' own clause says "chart type", and without it
    // that page would read as claiming this facet in (e)'s negative half.
    ["dsxKindOf", "the type", /(?<!chart )\btypes?\b/i],
    ["dsxFolderOf", "folder", null],
  ],
  connections: [
    ["connAdapterOf", "the adapter", /\badapter\b/i],
    ["connTagsOf", "its tags", /\btags?\b/i],
    ["connFolderOf", "folder", null],
  ],
  jobs: [
    ["jobFolderOf", "folder", null],
  ],
  repository: [
    ["_repoAllType", "the type", /(?<!chart )\btypes?\b/i],
  ],
};

// A panel's facets, read out of its OWN render function — the same scoping check 52 uses,
// and for the same reason: `Studio.catalogFacets` is called from Explore and the builder
// too, and those are not catalog pages.
function catalogFacetPanels() {
  return panels.map((p) => {
    const src = read(p.file);
    const fn = "render" + p.sec[0].toUpperCase() + p.sec.slice(1);
    const at = src.indexOf("function " + fn + "(");
    const body = at < 0 ? "" : searchBlockAt(src, src.indexOf("{", at), "{", "}");
    const axes = [];
    // The kit's two matchers name the mode outright; their second argument is the field
    // the axis reads, and that accessor is the axis's identity.
    for (const m of body.matchAll(/(?:F|Studio\.catalogFacets)\.match(Multi|One)\(\s*\w+,\s*(\w+)\s*\)/g))
      axes.push({ expr: m[2], mode: m[1] === "Multi" ? "many" : "one" });
    // The two `wb-chip` strips predate the kit and filter inline, but the markup still
    // declares the mode: an active test that compares one SCALAR to the chip's id is
    // single-select by construction, and that scalar is the axis's identity.
    for (const m of body.matchAll(/class="wb-chip' \+ \((_\w+) === c\.id/g))
      axes.push({ expr: m[1], mode: "one" });
    return { sec: p.sec, page: CATALOG_PAGES[p.sec], fn, file: p.file, axes,
      folderStrip: /(?:F|Studio\.catalogFacets)\.folderStrip\(/.test(body) };
  });
}

const facetPanels = catalogFacetPanels();
const facetRowOf = (sec, expr) => (CATALOG_FACET_AXES[sec] || []).find((r) => r[0] === expr);
const facetPara = htmlText((help.match(/<p><strong>Which pills take more than one\.<\/strong>[\s\S]*?<\/p>/) || [""])[0])
  .replace(/\s+/g, " ").trim();
const folderPara = htmlText((help.match(/<p><strong>The Folders strip\.<\/strong>[\s\S]*?<\/p>/) || [""])[0])
  .replace(/\s+/g, " ").trim();
// The paragraph's own punctuation, exactly as check 52 reads the search clauses: a colon
// opens each half, semicolons separate one page's clause from the next.
const facetHalves = facetPara.split(/One pill at a time:/);
const facetClauses = (half) => (half || "").split(/[:;]/).slice(1).map((s) => s.trim()).filter(Boolean)
  .map((text) => ({ text, pages: Object.values(CATALOG_PAGES).filter((pg) => new RegExp(`\\b${pg}\\b`).test(text)) }));
const manyClauses = facetClauses(facetHalves[0]);
// The second half opens at the split itself, so it has no leading colon to drop.
const oneClauses = (facetHalves[1] || "").split(";").map((s) => s.trim()).filter(Boolean)
  .map((text) => ({ text, pages: Object.values(CATALOG_PAGES).filter((pg) => new RegExp(`\\b${pg}\\b`).test(text)) }));
const clauseOf = (list, page) => (list.find((c) => c.pages.length === 1 && c.pages[0] === page) || { text: "" }).text;

// (a) first: the premise, the vocabulary and the roster together. The other four rules
//     are only meaningful while every panel still declares facets this can read.
const facetVocabWrong = [];
facetPanels.forEach((p) => {
  const rows = CATALOG_FACET_AXES[p.sec] || [];
  if (!p.axes.length) facetVocabWrong.push(`${p.page}: no facet declaration found in ${p.fn} (${p.file})`);
  p.axes.filter((a) => !facetRowOf(p.sec, a.expr))
    .forEach((a) => facetVocabWrong.push(`${p.page} filters by \`${a.expr}\` — nothing in the vocabulary says what to call it`));
  rows.filter((r) => !p.axes.some((a) => a.expr === r[0]))
    .forEach((r) => facetVocabWrong.push(`the vocabulary still maps \`${r[0]}\` for ${p.page} — that panel no longer filters by it`));
});
const manyRoster = manyClauses.filter((c) => c.pages.length === 1).map((c) => c.pages[0]).sort();
const manyExpected = facetPanels.filter((p) => p.axes.some((a) => a.mode === "many")).map((p) => p.page).sort();
const oneRoster = oneClauses.filter((c) => c.pages.length === 1).map((c) => c.pages[0]).sort();
const oneExpected = facetPanels
  .filter((p) => p.axes.some((a) => a.mode === "one" && (facetRowOf(p.sec, a.expr) || [])[2]))
  .map((p) => p.page).sort();
ok(`app/ + docs/index.html: six catalog panels declare their facets, and Help gives each page a clause in the right half ` +
   `(${facetPanels.reduce((n, p) => n + p.axes.length, 0)} axis/axes over ${facetPanels.length} panel(s))`,
  facetPanels.length === 6 && !facetVocabWrong.length && !!facetPara && facetHalves.length === 2 &&
    String(manyRoster) === String(manyExpected) && String(oneRoster) === String(oneExpected),
  `${facetVocabWrong.join("\n      ") || "(vocabulary complete)"}\n      ` +
  `${facetPanels.map((p) => `${p.page} (${p.fn}, ${p.axes.map((a) => a.expr + ":" + a.mode).join("+") || "none"})`).join(" · ")}\n      ` +
  `multi-select half names: ${manyRoster.join(", ") || "(none)"} · expected ${manyExpected.join(", ")}\n      ` +
  `one-at-a-time half names: ${oneRoster.join(", ") || "(none)"} · expected ${oneExpected.join(", ")}\n      ` +
  "the vocabulary is keyed by the panel's own accessor or filter variable — a new or renamed facet lands here first");

// (b) every multi-select facet, published under its own page in the multi-select half.
const facetUnpublishedMany = [];
facetPanels.forEach((p) => {
  const clause = clauseOf(manyClauses, p.page);
  p.axes.filter((a) => a.mode === "many").forEach((a) => {
    const row = facetRowOf(p.sec, a.expr);
    if (row && row[2] && !row[2].test(clause))
      facetUnpublishedMany.push(`${p.page} filters by ${row[1]} (\`${a.expr}\`, multi-select) — its clause does not say so`);
  });
});
ok(`docs/index.html: every multi-select facet is published under its own page ` +
   `(${facetPanels.reduce((n, p) => n + p.axes.filter((a) => a.mode === "many").length, 0)} facet(s))`,
  !facetUnpublishedMany.length,
  `${facetUnpublishedMany.join("\n      ") || "(none)"}\n      ` +
  `${facetPanels.map((p) => `${p.page}: ${clauseOf(manyClauses, p.page) || "(no clause)"}`).join("\n      ")}\n      ` +
  "a facet nobody publishes is one a reader finds by accident, or never");

// (c) every single-select facet that is not the folder strip, published under its own
//     page in the one-pill-at-a-time half.
const facetUnpublishedOne = [];
facetPanels.forEach((p) => {
  const clause = clauseOf(oneClauses, p.page);
  p.axes.filter((a) => a.mode === "one").forEach((a) => {
    const row = facetRowOf(p.sec, a.expr);
    if (row && row[2] && !row[2].test(clause))
      facetUnpublishedOne.push(`${p.page} filters by ${row[1]} (\`${a.expr}\`, one pill at a time) — its clause does not say so`);
  });
});
ok(`docs/index.html: every single-select facet outside the Folders strip is published under its own page ` +
   `(${facetPanels.reduce((n, p) => n + p.axes.filter((a) => a.mode === "one" && (facetRowOf(p.sec, a.expr) || [])[2]).length, 0)} facet(s))`,
  !facetUnpublishedOne.length,
  `${facetUnpublishedOne.join("\n      ") || "(none)"}\n      ` +
  `${facetPanels.map((p) => `${p.page}: ${clauseOf(oneClauses, p.page) || "(no clause)"}`).join("\n      ")}\n      ` +
  "the Folders strip has its own paragraph — everything else belongs in a page's own clause");

// (d) the folder strip: the roster, its count word, and the exception named as one.
const stripPages = facetPanels.filter((p) => p.folderStrip).map((p) => p.page);
const noStripPages = facetPanels.filter((p) => !p.folderStrip).map((p) => p.page);
const stripRoster = (folderPara.match(/pages? have one: ([^.]+)\./) || [, ""])[1]
  .split(/,\s*|\s+and\s+/).map((s) => s.trim()).filter(Boolean);
const stripCountWord = (folderPara.match(/(\w+) pages? have one:/) || [, ""])[1];
const stripExceptionNamed = noStripPages.every((pg) => new RegExp(`\\b${pg}\\b[^.]*exception`, "i").test(folderPara));
ok(`docs/index.html: the Folders strip is claimed for exactly the pages that render one ` +
   `(${stripPages.length} of ${facetPanels.length}), counted in words, with the exception named`,
  !!folderPara && String([...stripRoster].sort()) === String([...stripPages].sort()) &&
    asNumber(stripCountWord || "") === stripPages.length && stripExceptionNamed,
  `renders a strip: ${stripPages.join(", ") || "(none)"} · does not: ${noStripPages.join(", ") || "(none)"}\n      ` +
  `Help lists: ${stripRoster.join(", ") || "(nothing)"} · count word: ${stripCountWord || "(none)"}\n      ` +
  `exception named: ${stripExceptionNamed}\n      ` +
  "the Repository groups into a folder TREE instead — a reader on the one page without the control must be told, not left hunting");

// (e) the negative half, segmented by page AND by mode.
const facetOverclaimed = [];
const facetVocab = Object.values(CATALOG_FACET_AXES).flat().filter((r) => r[2])
  .filter((r, i, all) => all.findIndex((o) => o[2].source === r[2].source) === i)
  .map((r) => ({ noun: r[1], re: r[2] }));
facetPanels.forEach((p) => {
  [["many", manyClauses, "multi-select"], ["one", oneClauses, "one pill at a time"]].forEach(([mode, list, label]) => {
    const clause = clauseOf(list, p.page);
    facetVocab.filter((v) => v.re.test(clause)).forEach((v) => {
      const has = p.axes.some((a) => a.mode === mode &&
        (facetRowOf(p.sec, a.expr) || [])[2] && facetRowOf(p.sec, a.expr)[2].source === v.re.source);
      if (has) return;
      const otherMode = p.axes.some((a) => (facetRowOf(p.sec, a.expr) || [])[2] &&
        facetRowOf(p.sec, a.expr)[2].source === v.re.source);
      facetOverclaimed.push(otherMode
        ? `Help calls the ${v.noun} on ${p.page} ${label} — that facet takes the other kind of click`
        : `Help credits ${p.page} with ${v.noun} (${label}) — that panel has no such facet`);
    });
  });
});
ok("docs/index.html: no page's clause credits it with a facet it does not have, or with the wrong kind of click",
  !facetOverclaimed.length,
  `${[...new Set(facetOverclaimed)].join("\n      ") || "(none)"}\n      ` +
  "segmented by page and by mode — a facet named in the wrong half tells a reader to click in a way the app ignores");


console.log(failed ? `\n✗ doc-truth: ${failed} claim(s) have drifted from the source of truth`
  : "\n✅ doc-truth: every published claim matches the source it describes");
process.exit(failed ? 1 : 0);
