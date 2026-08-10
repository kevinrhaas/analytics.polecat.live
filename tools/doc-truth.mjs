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



/* ── 54. Help's "…and every other search box too" vs the boxes that really run the kit ──
   N7, and the check-52 move one paragraph down — the one check 52 named as the slice it was
   deliberately not taking. The paragraph above it says what each CATALOG page searches; this
   one makes a bigger claim about a different set of files: that the same rules run behind
   every OTHER search field in the app, and it enumerates them. Its source of truth is the
   shared kit's own call sites — `Studio.catalogSearch` (AUD-06 slice 6 took the kit
   catalog-only → app-wide), attributed to the top-level function each call sits in.

   Measured 2026-08-09, before the fix — one stale name, two boxes missing, and an
   exception clause that was not true:
   · **The "Open a dashboard" picker was absent.** `openDashboardPicker` runs the kit over
     your saved dashboards and is reached from Open ▾ and ⌘K — the most-used search box in
     the builder after the Data panel — while its own sibling three lines below it in the
     same paragraph (the "add to dashboard" picker, which shares the list and the markup)
     was published.
   · **The Data panel was published as two groups of three.** Its one search box narrows
     your workspace datasets (`buildWorkspaceDatasets`), your own saved queries
     (`buildLibrary`) and your **saved Views** (`buildAnalysesLib`) — the parenthetical
     named the first two, so the group holding the objects LF57 renamed the app around read
     as unsearchable.
   · **"the Explore pane"** — the section has rendered as **Quick Views** since LF57, and
     v876 fixed the two other routes on this page that still said Explore. This one sat in a
     list of twelve and was missed.
   · **The exception clause named one exception and there are two.** A table panel's own
     **Filter rows** box matches ONE literal string across a row's cells
     (`DashKit.table` → `String(cell).indexOf(q)`), so "crops 2024" finds nothing there
     unless those words sit adjacent in one cell — the exact failure AUD-06 built the kit to
     end. It cannot use the kit and should not: the table renderer inlines into every
     exported dashboard, which is why it carries its own rules. The paragraph said the one
     exception was this Help page's own search box.

   Five rules, one new source of truth (the kit's call sites):
   (a) the roster: every call site outside the kit's own definition has a row in the
       vocabulary below. The row is keyed by the pair (file, enclosing top-level function),
       which IS the surface's identity — so a new search box, or a renamed one, falls out of
       its row and fails here rather than passing green while Help omits it;
   (b) coverage: every non-catalog surface is named in the paragraph, and the paragraph
       still declares its scope (the catalog pages belong to check 52's paragraph, not this
       one — they are the rows with no phrase);
   (c) the negative half: a row whose call site is gone must not still be published — copy
       promising a search box the app no longer has is the v924 shape;
   (d) the Help-page exception, held from both ends: `docs/index.html` really does run its
       own search (it is a static page and never loads the kit), and Help says so;
   (e) the table-panel exception, held from both ends: `app/studio-charts.js` really does
       render a `tbl-filter` search box, really does match it with a bare substring test, and
       really does not reach for the kit — and Help names the box, says it takes one literal
       string, and says why (it travels inside every export). If that box ever adopts the
       kit, this fails so the exception copy gets DELETED rather than left standing.
   Deliberately NOT held: the order the boxes are listed in, or a count word — thirteen
   surfaces spelled out one by one are their own count (check 12's rule: a teaching document
   owes coverage, not a transcript). */

// Every search surface in the app is a CALL SITE of the shared kit. Attributing each to the
// nearest declaration at the file's TOP level (≤2 spaces of indent — every module here is one
// IIFE deep) names the FEATURE rather than the `paint`/`render` closure inside it.
function searchKitCallSites() {
  const sites = new Map();
  for (const file of fs.readdirSync(path.join(ROOT, "app")).filter((f) => f.endsWith(".js"))) {
    const lines = read("app/" + file).split("\n");
    // The kit defines itself in terms of itself (matcher → terms → hay); skip its own block
    // so those three never read as three more search boxes.
    let kitFrom = lines.findIndex((l) => /Studio\.catalogSearch\s*=\s*\{/.test(l)), kitTo = -1;
    if (kitFrom >= 0) {
      let depth = 0;
      for (let i = kitFrom; i < lines.length; i++) {
        for (const ch of lines[i]) { if (ch === "{") depth++; else if (ch === "}") depth--; }
        if (i > kitFrom && depth <= 0) { kitTo = i; break; }
      }
    }
    lines.forEach((line, i) => {
      const at = line.search(/Studio\.catalogSearch\.(?:matcher|textMatcher|terms|hay|markRe)\s*\(/);
      if (at < 0) return;
      const slashes = line.indexOf("//");
      if (slashes >= 0 && slashes < at) return;            // a comment ABOUT the kit is not a call site
      if (kitFrom >= 0 && i >= kitFrom && i <= kitTo) return;
      let fn = "(top level)";
      for (let j = i; j >= 0; j--) {
        const m = lines[j].match(/^ {0,2}(?:function\s+([A-Za-z0-9_$]+)|(?:var|const|let)\s+([A-Za-z0-9_$]+)\s*=\s*function|([A-Za-z0-9_$.]+)\s*=\s*function\s*\()/);
        if (m) { fn = m[1] || m[2] || m[3]; break; }
      }
      const key = `${file}:${fn}`;
      sites.set(key, (sites.get(key) || []).concat(i + 1));
    });
  }
  return sites;
}

// Keyed by the surface's own identity, mapped to the noun Help has to publish for it.
// `null` marks the six catalog panels: they are published by the paragraph ABOVE this one
// (check 52), and this paragraph's whole point is what it adds to them.
const SEARCH_SURFACES = [
  ["studio.js:renderDashboards", "the Dashboards page", null],
  ["studio.js:renderRepository", "the Repository page", null],
  ["datasets.js:renderDatasets", "the Datasets page", null],
  ["connections.js:renderConnections", "the Connections page", null],
  ["jobs.js:renderJobs", "the Jobs page", null],
  ["views.js:renderViews", "the Views page", null],
  // The Data panel is ONE search box over three groups, so its three rows are held against
  // the parenthetical that names them — the panel's own group headers, not a phrase invented
  // here. Scoped that way so "Views" later in the same sentence (the Quick Views pane) can
  // never stand in for the group this row is about.
  ["studio.js:buildLibrary", "the Data panel's My queries group", /\bMy queries\b/, "dataPanel"],
  ["studio.js:buildWorkspaceDatasets", "the Data panel's Datasets group", /\bDatasets\b/, "dataPanel"],
  ["explore.js:buildAnalysesLib", "the Data panel's Views group", /\bViews\b/, "dataPanel"],
  ["studio.js:applyInspSearch", "the panel inspector's search", /panel inspector/i],
  // The gallery opens FROM the inspector, so its top-level home is renderPanelInspector —
  // a different surface from applyInspSearch's, with its own box and its own row.
  ["studio.js:renderPanelInspector", "the chart-type gallery", /chart-type gallery/i],
  ["palette.js:refresh", "the command palette", /command palette/i],
  ["studio.js:buildWhatsNewBody", "the What's-new feed", /what[’']s-new feed/i],
  ["studio.js:hlq", "the What's-new feed's hit highlighting", /what[’']s-new feed/i],
  ["studio.js:openFolderPicker", "the folder picker", /folder picker/i],
  ["explore.js:renderExplore", "the Quick Views pane", /quick views pane/i],
  ["build.js:render", "the View Builder's datasets pane", /view builder[’']s datasets pane/i],
  ["build.js:openFilterEditor", "the View Builder's value filter", /value filter/i],
  ["studio.js:buildNewMenu", "the auto-build set list", /auto-build set list/i],
  ["studio.js:openDashboardPicker", "the Open a dashboard picker", /open a dashboard/i],
  ["explore.js:openAddToExistingDashboardPicker", "the add-to-dashboard picker", /add to dashboard/i],
  ["connections.js:renderSchemaPanel", "a connection's schema browser", /schema browser/i],
];

const kitSites = searchKitCallSites();
const boxParaHtml = (help.match(/<p><strong>…and every other search box too\.<\/strong>[\s\S]*?<\/p>/) || [""])[0];
const boxPara = htmlText(boxParaHtml);
// The Data panel's own parenthetical — the three rows above read this, not the whole sentence.
const boxDataPanelGroups = (boxPara.match(/Data panel \(([^)]*)\)/) || [, ""])[1];
const boxScopeOf = (row) => (row[3] === "dataPanel" ? boxDataPanelGroups : boxPara);

// (a) the roster: the code's call sites, every one of them accounted for.
const boxUnknown = [...kitSites.keys()].filter((k) => !SEARCH_SURFACES.some((r) => r[0] === k))
  .map((k) => `${k} runs the shared kit (line ${kitSites.get(k).join(", ")}) — nothing in the vocabulary says what to call it`);
ok(`app/: every search box that runs Studio.catalogSearch has a row in this check ` +
   `(${kitSites.size} surface(s) over ${new Set([...kitSites.keys()].map((k) => k.split(":")[0])).size} file(s))`,
  !!boxParaHtml && !boxUnknown.length,
  `${boxUnknown.join("\n      ") || "(every call site is accounted for)"}\n      ` +
  `${boxParaHtml ? "" : 'the "…and every other search box too" paragraph was not found in docs/index.html\n      '}` +
  "keyed by (file, enclosing top-level function) — a new or renamed search box lands here first");

// (b) coverage: every non-catalog surface named, and the paragraph's scope still stated.
const boxScopeStated = /not just the catalog pages/i.test(boxPara);
const boxUnpublished = SEARCH_SURFACES.filter((r) => r[2] && kitSites.has(r[0]) && !r[2].test(boxScopeOf(r)))
  .map((r) => `${r[1]} (${r[0]}) runs the same rules — the paragraph does not name it`);
ok(`docs/index.html: every non-catalog search box is named in the paragraph that claims them all ` +
   `(${SEARCH_SURFACES.filter((r) => r[2] && kitSites.has(r[0])).length} call site(s))`,
  !boxUnpublished.length && boxScopeStated,
  `${boxUnpublished.join("\n      ") || "(none)"}\n      ` +
  `${boxScopeStated ? "" : 'the paragraph no longer says the catalog pages are covered elsewhere ("not just the catalog pages")\n      '}` +
  `Data panel groups named: ${boxDataPanelGroups || "(no parenthetical)"}\n      ` +
  "a box left out of a list that says EVERY search field is a reader told the rules stop somewhere they do not");

// (c) the negative half: a retired box must not still be published.
const boxStale = SEARCH_SURFACES.filter((r) => !kitSites.has(r[0]))
  .map((r) => `${r[1]} (${r[0]}) no longer calls the kit` + (r[2] && r[2].test(boxScopeOf(r)) ? " — and Help still names it" : ""));
ok("docs/index.html: the paragraph credits the app with no search box it no longer has",
  !boxStale.length,
  `${boxStale.join("\n      ") || "(none)"}\n      ` +
  "a vocabulary row with no call site is either a box that moved (rename the row) or one that went (delete the copy)");

// (d) the Help page's own box: a static page that never loads the app's kit, and says so.
const helpBoxIsOwn = /<input[^>]+type="search"/.test(help) && !/catalogSearch/.test(help);
const helpBoxPublished = /Help page[’']s own search box/i.test(boxPara);
ok("docs/index.html: this page runs its own search, and the paragraph still says so",
  helpBoxIsOwn && helpBoxPublished,
  `own box, kit absent from the page: ${helpBoxIsOwn} · published as an exception: ${helpBoxPublished}\n      ` +
  "the one search box on this page is the one box these rules do not reach");

// (e) the table panel's Filter rows box — the exception a reader meets inside their own
//     dashboard, and inside every export. Measured from the renderer, not asserted.
const chartsSrc = read("app/studio-charts.js");
const tableBody = (() => {
  const at = chartsSrc.indexOf("DashKit.table = function");
  if (at < 0) return "";
  return searchBlockAt(chartsSrc, chartsSrc.indexOf("{", at), "{", "}");
})();
const tableBoxIsPlain = /class\s*=\s*"tbl-filter"|className = "tbl-filter"/.test(tableBody) &&
  /indexOf\(q\)\s*>=\s*0/.test(tableBody) && !/catalogSearch/.test(chartsSrc);
const tableBoxPublished = /filter rows/i.test(boxPara) && /literal/i.test(boxPara) && /export/i.test(boxPara);
ok("app/studio-charts.js + docs/index.html: a table panel's Filter rows box matches one literal string, and Help says so",
  tableBoxIsPlain && tableBoxPublished,
  `plain substring match, kit absent from the renderer: ${tableBoxIsPlain} · published as an exception: ${tableBoxPublished}\n      ` +
  `paragraph: ${boxPara || "(not found)"}\n      ` +
  "it inlines into every exported dashboard, so it carries its own rules — that is worth stating, not hiding");

/* ── 55. Help's search SYNTAX vs the rules the kit really implements ────────
   N7, and the check-54 move one paragraph UP — the slice check 54 named as the one it was
   deliberately not taking. Checks 52 and 54 hold search by ROSTER: which pages, which boxes.
   This one holds it by BEHAVIOUR — what the syntax IS — and so it needs a different source
   of truth and a different method. `Studio.catalogSearch` states four rules in its own
   header comment, and a comment is not a measurement, so this check EVALUATES the kit
   (check 45's idiom over app/model.js) and RUNS it. Every assertion below is a probe: the
   claim is compared against what the kit did, not against what it says about itself.

   Measured 2026-08-09, before the fix. Three of the four rules the paragraph publishes were
   already true; what it omitted are the three that decide whether a search comes back EMPTY:
   · **The empty-box rule was unpublished.** `matcher("")` short-circuits to a predicate that
     accepts every row, and the paragraph never said so — the Clear chip sentence beside it
     implies it for the chip and for nothing else.
   · **Spaces are the ONLY separator, and that was unpublished.** `terms()` splits on `\S+`,
     so punctuation stays inside the word: `crops, 2024` parses to `["crops,", "2024"]` and
     `crops,` is then looked for LITERALLY. Measured: `crops 2024` matches
     `["Cover crops", "2024"]` and `crops, 2024` does not — same query, one comma, no
     results, and nothing on the page explained it. (The rule earns its keep in the other
     direction too: it is what makes `q2.2024` find "Revenue q2.2024".)
   · **An unpaired quote is an ordinary character, and that was unpublished.** The term
     regex alternates `"([^"]*)"` with `(\S+)`, so a lone `"` falls to the second branch and
     rides along: `cover "crops` parses to `["cover", "\"crops"]` and finds nothing on
     `["cover crops"]`. Copy that says quotes mean "the exact phrase" and stops there leaves
     a reader with a search that looks right and returns nothing — the v941 shape.
   · **"the exact phrase" was true but under-stated.** `hay()` joins a row's fields with a
     space and never inserts a separator, so a quoted phrase matches ACROSS a field boundary:
     `"crops 2024"` matches `["Cover crops", "2024 plans"]`, where the phrase appears in no
     single field. The word "exact" invites the opposite reading.

   Five rules plus the premise, all measured by running the kit:
   (a) the AND rule: every term must appear, in any order, across any field — and the
       paragraph says ALL of them rather than any (the probe asserts the OR reading is false,
       so the copy cannot drift into it while this passes);
   (b) the quoted phrase: adjacent when quoted, non-adjacent when not — and the copy states
       the straddle, because the kit's own join is what makes it true;
   (c) case-insensitivity;
   (d) the empty query matching everything;
   (e) the term boundary: spaces separate, punctuation and an unpaired quote do not — held
       from both ends, since this is the rule whose absence reads as a broken search.
   The PREMISE guard is why the other five cannot pass green over a dead source: if the kit
   block stops being extractable or evaluable from app/studio.js, this fails loudly instead
   of silently testing nothing. Deliberately NOT held: the wording of any example, or the
   dedupe in `terms()` (identical terms AND to the same result, so it is invisible to a
   reader and there is nothing to publish). */

// The source of truth, evaluated rather than regexed: Studio.catalogSearch as the app runs it.
const searchKit = (() => {
  const src = read("app/studio.js");
  const at = src.indexOf("Studio.catalogSearch = {");
  if (at < 0) return null;
  const block = searchBlockAt(src, src.indexOf("{", at), "{", "}");
  try {
    const Studio = {};
    // eslint-disable-next-line no-new-func
    new Function("Studio", "Studio.catalogSearch = " + block + ";")(Studio);
    const cs = Studio.catalogSearch;
    return typeof cs?.terms === "function" && typeof cs?.matcher === "function" ? cs : null;
  } catch { return null; }
})();

// A probe runs the kit exactly as a panel does: matcher(query, row => its haystack FIELDS).
const kitFinds = (q, fields) => searchKit.matcher(q, (r) => r)(fields);
const syntaxParaHtml = (help.match(/<p><strong>Searching\.<\/strong>[\s\S]*?<\/p>/) || [""])[0];
const wordParaHtml = (help.match(/<p><strong>What counts as a word\.<\/strong>[\s\S]*?<\/p>/) || [""])[0];
const syntaxPara = htmlText(syntaxParaHtml);
const wordPara = htmlText(wordParaHtml);

// The premise. Everything below dereferences searchKit, so it is checked first and the rest
// is skipped rather than crashing — a check that cannot measure must say so, not throw.
const kitLive = ok("app/studio.js: Studio.catalogSearch is still extractable and evaluable — the premise the rules below measure against",
  !!searchKit && !!syntaxParaHtml,
  `kit evaluated: ${!!searchKit} · Searching paragraph found: ${!!syntaxParaHtml}\n      ` +
  "these rules PROBE the kit; if it cannot be run, they must fail rather than pass over nothing");

if (kitLive) {
  // (a) every term must appear — ANDed, in any order, across any field.
  const andHolds = kitFinds("crops 2024", ["Cover crops", "2024"]) && !kitFinds("crops zzz", ["Cover crops"]);
  const andPublished = /\ball of them, not any of them\b/i.test(syntaxPara) && /in any order/i.test(syntaxPara);
  ok("docs/index.html: the search ANDs its terms in any order, and the paragraph says all of them rather than any",
    andHolds && andPublished,
    `measured — "crops 2024" over ["Cover crops","2024"]: ${kitFinds("crops 2024", ["Cover crops", "2024"])}, ` +
    `"crops zzz" over ["Cover crops"]: ${kitFinds("crops zzz", ["Cover crops"])} · published: ${andPublished}\n      ` +
    "an AND search described as \"any of these words\" sends a reader to type fewer terms to find more");

  // (b) quotes mean adjacency — and the adjacency is measured over the JOINED fields.
  const phraseHolds = kitFinds('"cover crops"', ["Cover crops"]) && !kitFinds('"cover crops"', ["crops cover"]);
  const straddles = kitFinds('"crops 2024"', ["Cover crops", "2024 plans"]);
  const phrasePublished = /double quotes/i.test(syntaxPara) && /exact phrase/i.test(syntaxPara);
  const straddlePublished = /rather than within one field|across the whole item/i.test(syntaxPara);
  ok("docs/index.html: a quoted phrase matches adjacently, spans the joined fields, and Help states both halves",
    phraseHolds && straddles === straddlePublished && phrasePublished,
    `measured — adjacent-only: ${phraseHolds} · straddles a field boundary: ${straddles} · ` +
    `straddle published: ${straddlePublished}\n      ` +
    "hay() joins a row's fields with a space and inserts no separator, so \"exact\" needs the qualifier");

  // (c) case-insensitivity, from the query side and the haystack side.
  const caseHolds = kitFinds("COVER", ["cover"]) && kitFinds("cover", ["COVER"]);
  ok("docs/index.html: matching is case-insensitive both ways, and Help says case never matters",
    caseHolds && /case never matters/i.test(syntaxPara),
    `measured: ${caseHolds} · published: ${/case never matters/i.test(syntaxPara)}`);

  // (d) the empty box — the rule that says how you get the whole list back.
  const emptyHolds = kitFinds("", ["anything"]) && kitFinds("   ", ["anything"]) && searchKit.terms("").length === 0;
  const emptyPublished = /empty box matches everything/i.test(syntaxPara);
  ok("docs/index.html: an empty query matches every row, and Help publishes that rather than leaving it to the Clear chip",
    emptyHolds && emptyPublished,
    `measured: ${emptyHolds} · published: ${emptyPublished}\n      ` +
    "matcher() short-circuits to an accept-all predicate when terms() is empty — a rule, not an accident");

  // (e) the term boundary, held from both ends: this is the rule whose absence reads as a
  //     broken search, so a drift in EITHER direction has to fail.
  const commaBreaks = !kitFinds("crops, 2024", ["Cover crops", "2024"]) && kitFinds("crops 2024", ["Cover crops", "2024"]);
  const punctuationRides = kitFinds("q2.2024", ["Revenue q2.2024"]);
  const loneQuoteRides = searchKit.terms('cover "crops').includes('"crops') && !kitFinds('cover "crops', ["cover crops"]);
  const boundaryHolds = commaBreaks && punctuationRides && loneQuoteRides;
  const boundaryPublished = /spaces are the only separator/i.test(wordPara) &&
    /crops,/.test(wordPara) && /unmatched/i.test(wordPara);
  ok("docs/index.html: spaces are the only term separator — punctuation and an unpaired quote stay in the word, and Help explains both",
    boundaryHolds === boundaryPublished && boundaryHolds,
    `measured — a comma breaks the query: ${commaBreaks} · punctuation is searchable: ${punctuationRides} · ` +
    `an unpaired quote rides along: ${loneQuoteRides} · published: ${boundaryPublished}\n      ` +
    `paragraph: ${wordPara || "(not found)"}\n      ` +
    "terms() splits on \\S+, so `crops, 2024` looks for the literal `crops,` — the commonest way a correct-looking search returns nothing");
}


/* ── 56. Help's filter pills vs the labels they PRINT, and the pill that gets you back ──
   N7, and the slice check 53 named as the one it was deliberately not taking: "each pill's
   own LABEL … holding thirteen pill labels to thirteen sentences is a different derivation
   and its own slice." Check 53 holds the AXES — which page filters by what, and with how many
   clicks. This one holds the pill FACES: the words a reader actually sees on the strip, and
   how a strip that cannot be un-ticked is un-picked.

   The derivation sits one level deeper than check 53's and is keyed differently. Check 53
   keys a facet by the accessor it READS; a pill's label has nothing to do with that accessor,
   so this check keys each axis by the pill's own DATA ATTRIBUTE — its DOM identity, the one
   thing a renamed accessor or a renamed label helper cannot move — and resolves the `label:`
   option the panel hands `Studio.catalogFacets.pills`. Where that option delegates to a named
   helper, the helper's own body is appended, so the authority is FOLLOWED rather than assumed
   ("No connection" lives inside `dsxConnLabel`, not at the call site). The two chip strips
   that predate the kit declare their faces as `chipDefs` literals instead, and the two closed
   label SETS are read from the tables that own them — `DSX_KIND_LABEL` and `REPO_TYPES`.

   Measured 2026-08-09, before the fix — the pills' faces were published nowhere on the page,
   and two of the omissions cost a reader more than a word:
   · **Both closed sets were unpublished.** Help said "Datasets … by type" and "the Repository
     by type, one pill per kind of row it lists" — a roster claim with no roster. The pills
     read *SQL query · Table · Collection · File · Sheet* and *Dashboards · Datasets ·
     Connections · Views · Jobs*, and nothing on the page said which of those "type" meant.
   · **The *All* pill was unpublished on both pre-kit strips**, and it is the way back: their
     handlers ASSIGN the clicked value (`_repoWbFilter = btn.getAttribute(…)`), so clicking the
     pill you are already on does not un-pick it. Help named *Sample packs* and *Unfiled* on
     the workbook strip and skipped the one pill that undoes a pick — while the Folders
     paragraph immediately below named *All folders*, so the same control was documented
     twice, once with its escape hatch and once without.
   · **"Every catalog page has one, Dashboards included" was false of the Clear chip.** Five
     panels render `clearChip(…)`; the Repository renders none. The page promised the
     universal way back on the one page that has neither route — no Clear chip AND no
     un-ticking — leaving its *All* pill the only one, unpublished until this slice.
   · **"pills are listed … alphabetically by their label" was false of those same two strips.**
     The kit sorts on `cmpLabel`; the pre-kit `chipDefs` sort nothing, so workbook pills come out
     newest-first (`addWorkbook` unshifts) and type pills in `REPO_TYPES`' declaration order.
     Check 53 left order alone for want of a reason to look; this slice's derivation supplied one.
   · The `#` a tag pill wears, the adapter's own name, the connection's name and the *KPI*
     label the chart registry does not hold were all unpublished too.

   Seven rules. (a) is the premise, and it is keyed so that a new facet, a renamed one, or a
   label authority that moves lands HERE first rather than passing green while Help describes
   a pill that no longer exists:
   (a) the premise + the vocabulary + the roster — every kit pill strip resolves to a
       vocabulary row whose label authority still matches, no row is stale, both pre-kit chip
       strips are readable, and Help carries both paragraphs;
   (b) the two CLOSED sets, held from both ends: every label the tables declare is published,
       and the paragraph publishes no face the tables do not have (a renamed kind fails as an
       omission, a retired one as a leftover);
   (c) the OPEN axes publish their RULE rather than their values — the adapter's own name, the
       connection's name, the "No connection" sentinel, the `#` on a tag, the gallery as the
       chart pill's authority. Those values are the user's own words; a list would go stale by
       design;
   (d) the illustrative chart names the copy volunteers are real — every <em> value in the
       chart-type sentence is a label the registry holds, or the one exception it does not
       (check 45's idiom: examples measured, not trusted);
   (e) the toggle asymmetry and the escape pill, both derived from the handlers and the pill
       markup: every multi-select handler toggles, every single-select handler assigns, each
       single-select strip renders a value-"" pill, and Help publishes both halves naming
       those pills' own labels;
   (f) the Clear chip's roster and the exception named as one — the claim that was false;
   (g) the pill ORDER: the shared strips sort on the label a reader sees (digit-aware), the two
       pre-kit strips sort nothing, and Help's flat alphabetical claim is scoped to the ones that
       do, naming both exceptions.
   Deliberately NOT held: each individual workbook, folder or tag VALUE (the user's words, not
   the app's), the pill COUNTS and the disappear-when-empty rule in the same paragraph as (g)
   — those are `tally()`/`prune()` behaviour and holding them means evaluating the kit, check
   55's idiom one kit over, which is its own slice — and the adapter dot's colour. */
{
  const PL_FILES = ["app/datasets.js", "app/connections.js", "app/views.js", "app/jobs.js", "app/studio.js"];
  // The label authority for one strip: the options object the panel hands pills(), plus — when
  // `label:` delegates to a named helper — that helper's own body. Following the delegation is
  // the whole point: the "No connection" sentinel is inside dsxConnLabel, not at the call site.
  const plAuthority = (src, opts) => {
    const m = opts.match(/label:\s*([A-Za-z_$][\w$]*)\s*[,}]/);
    if (!m) return opts;
    const at = src.indexOf("function " + m[1] + "(");
    return at < 0 ? opts : opts + "\n" + searchBlockAt(src, src.indexOf("{", at), "{", "}");
  };
  // A whole statement, from `var x = …` to the `;` that ends it at depth 0 — the chip strips'
  // chipDefs is an array literal followed by three .concat() calls, and one of those calls
  // contains a `;` of its own, so neither a bracket walk nor "up to the first ;" reads it all.
  const plStatementAt = (src, at) => {
    let d = 0;
    for (let i = at; i < src.length; i++) {
      const c = src[i];
      if ("([{".includes(c)) d++;
      else if (")]}".includes(c)) d--;
      else if (c === ";" && d === 0) return src.slice(at, i + 1);
    }
    return src.slice(at);
  };
  const plFnBody = (src, fn) => {
    const at = src.indexOf("function " + fn + "(");
    return at < 0 ? "" : searchBlockAt(src, src.indexOf("{", at), "{", "}");
  };

  // Every kit pill strip in the app, keyed by the attribute its buttons carry.
  const plStrips = [];
  for (const f of PL_FILES) {
    const src = read(f);
    for (const m of src.matchAll(/(?:F|Studio\.catalogFacets)\.pills\(\s*\w+,\s*\w+,\s*"([\w-]+)",\s*\{/g)) {
      const opts = searchBlockAt(src, m.index + m[0].length - 1, "{", "}");
      plStrips.push({ attr: m[1], file: f, authority: plAuthority(src, opts) });
    }
  }
  // The vocabulary: what each pill's label is derived FROM (`sig`, asserted against the
  // authority above) and what Help therefore owes the reader (`claim`). The two axes whose
  // labels are a closed table carry no claim — (b) holds those by enumeration instead.
  const PILL_FACES = {
    "data-dsx-adapter": { sig: /Studio\.sourceById\(\w+\)[\s\S]*?label/, claim: /adapter's name/i,
      note: "the adapter registry's own label" },
    "data-dsx-conn": { sig: /conn \? conn\.name : "No connection"/, claim: /connection's own name/i,
      note: "the connection's own name, or the No-connection sentinel" },
    "data-dsx-tag": { sig: /"#" \+ \w+/, claim: /#finance/, note: "the tag, hash included" },
    "data-dsx-kind": { sig: /label: dsxKindLabel/, note: "DSX_KIND_LABEL (a closed set — see (b))" },
    "data-conn-adapter": { sig: /Studio\.sourceById\(\w+\)[\s\S]*?label/, claim: /adapter's name/i,
      note: "the adapter registry's own label" },
    "data-conn-tag": { sig: /"#" \+ \w+/, claim: /#finance/, note: "the tag, hash included" },
    "data-vw-type": { sig: /label: vwChartLabel/, claim: /gallery/i,
      note: "the chart registry's own label, KPI apart" },
  };

  // The two chip strips that predate the kit: their faces are `chipDefs` literals, and the
  // mapped entries name the table they read (REPO_TYPES' label / a workbook's own name).
  const plStudio = read("app/studio.js");
  const plChipStrips = ["renderDashboards", "renderRepository"].map((fn) => {
    const body = plFnBody(plStudio, fn);
    const at = body.indexOf("var chipDefs = [");
    const defs = at < 0 ? "" : plStatementAt(body, at);
    return {
      fn, defs,
      literals: [...defs.matchAll(/name: "([^"]+)"/g)].map((m) => m[1]),
      allLabel: (defs.match(/\{ id: "", name: "([^"]+)"/) || [, ""])[1],
      mapped: [...defs.matchAll(/(\w+)\.map\(function[\s\S]*?name: ([\w.]+)/g)].map((m) => `${m[1]} → ${m[2]}`),
    };
  });
  // The closed label tables, read where they are declared, and the folder strip's own escape
  // pill, read from the kit that renders it.
  const plKindLabels = [...(read("app/datasets.js").match(/var DSX_KIND_LABEL = \{[^}]*\}/) || [""])[0]
    .matchAll(/: "([^"]+)"/g)].map((m) => m[1]);
  const plRepoLabels = [...plStatementAt(plStudio, plStudio.indexOf("var REPO_TYPES = ["))
    .matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
  const plFolderAll = (plStudio.match(/F\.pill\(\{ attr: attr, value: "", label: "([^"]+)"/) || [, ""])[1];

  // Help's two paragraphs, plus the Searching paragraph that carries the Clear-chip roster.
  const plFacesHtml = (help.match(/<p><strong>What a pill says\.<\/strong>[\s\S]*?<\/p>/) || [""])[0];
  const plFaces = htmlText(plFacesHtml).replace(/\s+/g, " ").trim();
  const plUnpick = htmlText((help.match(/<p><strong>Un-picking a pill\.<\/strong>[\s\S]*?<\/p>/) || [""])[0])
    .replace(/\s+/g, " ").trim();
  const plSearch = htmlText((help.match(/<p><strong>Searching\.<\/strong>[\s\S]*?<\/p>/) || [""])[0])
    .replace(/\s+/g, " ").trim();

  // (a) the premise: the vocabulary is complete, every label authority still reads the way the
  //     vocabulary says it does, both pre-kit strips are readable, and Help has both paragraphs.
  const plWrong = [];
  plStrips.forEach((s) => {
    const row = PILL_FACES[s.attr];
    if (!row) { plWrong.push(`${s.attr} (${s.file}) prints a pill label nothing in the vocabulary explains`); return; }
    if (!row.sig.test(s.authority))
      plWrong.push(`${s.attr}: its label no longer comes from ${row.note} — the authority moved (expected ${row.sig})`);
  });
  Object.keys(PILL_FACES).filter((a) => !plStrips.some((s) => s.attr === a))
    .forEach((a) => plWrong.push(`the vocabulary still describes ${a} — no panel renders that pill strip any more`));
  plChipStrips.filter((c) => !c.defs || !c.allLabel || !c.mapped.length)
    .forEach((c) => plWrong.push(`${c.fn}: its chipDefs no longer read (all-pill "${c.allLabel}", mapped ${c.mapped.join(", ") || "none"})`));
  ok(`app/ + docs/index.html: every pill strip's label authority is known, and Help carries the two paragraphs that publish them ` +
     `(${plStrips.length} kit strip(s) + ${plChipStrips.length} pre-kit strip(s))`,
    plStrips.length === Object.keys(PILL_FACES).length && !plWrong.length && !!plFaces && !!plUnpick &&
      plKindLabels.length === 5 && plRepoLabels.length === 5 && !!plFolderAll,
    `${plWrong.join("\n      ") || "(vocabulary complete)"}\n      ` +
    `kit strips: ${plStrips.map((s) => s.attr).join(", ") || "(none)"}\n      ` +
    `pre-kit strips: ${plChipStrips.map((c) => `${c.fn} [${c.literals.join(" · ")}] ${c.mapped.join(", ")}`).join(" | ")}\n      ` +
    `closed sets: kind [${plKindLabels.join(", ")}] · row [${plRepoLabels.join(", ")}] · folder escape pill "${plFolderAll}"\n      ` +
    `Help paragraphs found: faces ${!!plFaces}, un-picking ${!!plUnpick}\n      ` +
    "keyed by the pill's data-attribute — a renamed accessor or label helper cannot move it, a deleted strip lands here");

  // (b) the two closed sets, from both ends.
  const plEms = [...plFacesHtml.matchAll(/<em>([^<]+)<\/em>/g)].map((m) => m[1].trim());
  const plChartEms = [...(plFacesHtml.match(/by chart type[\s\S]*?(?=<strong>Repository)/) || [""])[0]
    .matchAll(/<em>([^<]+)<\/em>/g)].map((m) => m[1].trim());
  const plKindMissing = plKindLabels.filter((l) => !plEms.includes(l));
  const plRepoMissing = plRepoLabels.filter((l) => !plEms.includes(l));
  const plKnownFaces = [...plKindLabels, ...plRepoLabels, ...plChipStrips.flatMap((c) => c.literals),
    plFolderAll, "#finance", "No connection"];
  const plStale = plEms.filter((v) => !plKnownFaces.includes(v) && !plChartEms.includes(v));
  ok(`docs/index.html: both closed pill sets are published exactly as their tables declare them ` +
     `(${plKindLabels.length} dataset kind(s), ${plRepoLabels.length} row kind(s))`,
    !plKindMissing.length && !plRepoMissing.length && !plStale.length,
    `dataset kinds unpublished: ${plKindMissing.join(", ") || "(none)"}\n      ` +
    `row kinds unpublished: ${plRepoMissing.join(", ") || "(none)"}\n      ` +
    `published as a pill face but in no table: ${plStale.join(", ") || "(none)"}\n      ` +
    `DSX_KIND_LABEL: ${plKindLabels.join(", ")} · REPO_TYPES: ${plRepoLabels.join(", ")}\n      ` +
    "held from both ends — a renamed kind fails as an omission, a retired one as a leftover");

  // (c) the open axes: the RULE, since the values are the user's own data.
  const plUnpublished = [];
  plStrips.filter((s) => PILL_FACES[s.attr].claim).forEach((s) => {
    if (!PILL_FACES[s.attr].claim.test(plFaces))
      plUnpublished.push(`${s.attr} prints ${PILL_FACES[s.attr].note} — the paragraph never says what that pill says`);
  });
  if (!/No connection/.test(plFaces)) plUnpublished.push("the No-connection sentinel pill is unpublished");
  ok(`docs/index.html: every open-ended pill axis publishes where its label comes from, rather than a list that would go stale ` +
     `(${plStrips.filter((s) => PILL_FACES[s.attr].claim).length} axis/axes + the sentinel)`,
    !plUnpublished.length,
    `${[...new Set(plUnpublished)].join("\n      ") || "(none)"}\n      ` +
    `paragraph: ${plFaces.slice(0, 200) || "(not found)"}…\n      ` +
    "an adapter, connection or tag pill wears words the user chose — the rule is the only stable thing to publish");

  // (d) the chart names the copy volunteers as examples are ones a pill really prints.
  const plModel = read("app/model.js");
  const plChartLabels = chartRegistryKeys()
    .map((k) => (plModel.match(new RegExp(`\\n {4}${k}: \\{\\s*label: "([^"]+)"`)) || [, ""])[1])
    .filter(Boolean);
  const plKpi = (read("app/views.js").match(/t === "kpi" \? "([^"]+)"/) || [, ""])[1];
  const plBadChartEms = plChartEms.filter((v) => v !== plKpi && !plChartLabels.includes(v));
  ok(`docs/index.html: every chart name the pill sentence volunteers is one the registry really prints ` +
     `(${plChartEms.length} example(s) against ${plChartLabels.length} label(s) + "${plKpi}")`,
    plChartEms.length >= 2 && !!plKpi && !plBadChartEms.length && plChartEms.includes(plKpi),
    `examples: ${plChartEms.join(", ") || "(none)"} · not in the registry: ${plBadChartEms.join(", ") || "(none)"}\n      ` +
    `the registry's one exception, read from vwChartLabel: "${plKpi}"\n      ` +
    "vwChartLabel prints Studio.CHARTS[t].label, so an example that is not one is a face no pill ever shows");

  // (e) the toggle asymmetry and the escape pill, derived from the handlers and the markup.
  const plHandler = (attr) => {
    for (const f of PL_FILES) {
      const src = read(f);
      const at = src.indexOf(`$$("[${attr}]"`);
      if (at >= 0) return src.slice(at, at + 420);
    }
    return "";
  };
  const PL_SINGLE = ["data-wb-filter", "data-repo-type-filter", "data-dash-folder", "data-dsx-folder",
    "data-conn-folder", "data-vw-folder", "data-jobs-folder"];
  const plModeWrong = [];
  plStrips.forEach((s) => {
    if (!/if \(_\w+\[\w+\]\) delete _\w+\[\w+\]; else _\w+\[\w+\] = true;/.test(plHandler(s.attr)))
      plModeWrong.push(`${s.attr}: a multi-select pill whose handler does not toggle`);
  });
  PL_SINGLE.forEach((a) => {
    if (!new RegExp(`_\\w+ = btn\\.getAttribute\\("${a}"\\)`).test(plHandler(a)))
      plModeWrong.push(`${a}: a single-select pill whose handler does not simply assign the clicked value`);
  });
  const plAllLabels = [...new Set(plChipStrips.map((c) => c.allLabel).concat(plFolderAll))].filter(Boolean);
  const plAllUnpublished = plAllLabels
    .filter((l) => !new RegExp(`\\b${l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(plUnpick));
  const plAsymmetry = /toggle/i.test(plUnpick) && /un-tick/i.test(plUnpick) &&
    /single-select/i.test(plUnpick) && /(does not|do not)/i.test(plUnpick);
  ok(`docs/index.html: multi-select pills toggle, single-select pills do not, and Help publishes both halves and every escape pill ` +
     `(${plStrips.length} toggling, ${PL_SINGLE.length} assigning, ${plAllLabels.length} escape label(s))`,
    !plModeWrong.length && !plAllUnpublished.length && plAsymmetry,
    `${plModeWrong.join("\n      ") || "(every handler matches its mode)"}\n      ` +
    `escape pills: ${plAllLabels.join(", ") || "(none)"} · unpublished: ${plAllUnpublished.join(", ") || "(none)"}\n      ` +
    `asymmetry published: ${plAsymmetry}\n      ` +
    `paragraph: ${plUnpick || "(not found)"}\n      ` +
    "a single-select handler ASSIGNS, so the strip's own escape pill is the only way back — that is the sentence a reader needs");

  // (f) the Clear chip's roster, and the page without one named as the exception.
  const plClearPages = Object.keys(CATALOG_PAGES).filter((sec) => {
    const p = facetPanels.find((x) => x.sec === sec);
    return !!p && /clearChip\(/.test(plFnBody(read(p.file), p.fn));
  }).map((sec) => CATALOG_PAGES[sec]);
  const plNoClear = Object.values(CATALOG_PAGES).filter((pg) => !plClearPages.includes(pg));
  const plClearRoster = (plSearch.match(/pages? have a Clear chip — ([^;.]+)[;.]/) || [, ""])[1]
    .split(/,\s*|\s+and\s+/).map((s) => s.trim()).filter(Boolean);
  const plClearCount = (plSearch.match(/(\w+) pages? have a Clear chip/) || [, ""])[1];
  const plClearException = !!plNoClear.length &&
    plNoClear.every((pg) => new RegExp(`\\b${pg}\\b[^.]*exception`, "i").test(plSearch));
  ok(`docs/index.html: the Clear chip is claimed for exactly the pages that render one (${plClearPages.length} of ` +
     `${Object.keys(CATALOG_PAGES).length}), counted in words, with the exception named`,
    String([...plClearRoster].sort()) === String([...plClearPages].sort()) &&
      asNumber(plClearCount || "") === plClearPages.length && plClearException,
    `renders a Clear chip: ${plClearPages.join(", ") || "(none)"} · does not: ${plNoClear.join(", ") || "(none)"}\n      ` +
    `Help lists: ${plClearRoster.join(", ") || "(nothing)"} · count word: ${plClearCount || "(none)"} · ` +
    `exception named: ${plClearException}\n      ` +
    "the Repository has no Clear chip AND cannot un-pick a type pill, so this was the page the universal claim stranded");

  // (g) the pill ORDER, and the two strips that do not follow it. Check 53 left order alone
  //     because it had no reason to look; this slice's own derivation supplies one — the same
  //     two pre-kit strips that were missing their escape pill also sort nothing at all, so the
  //     page's flat "alphabetically by their label" was false of exactly them.
  const plKit = plFnBody(plStudio, "pills") || plStatementAt(plStudio, plStudio.indexOf("pills: function (t, state, attr, opts)"));
  const plKitSorts = /\.sort\(function \(a, b\) \{ return F\.cmpLabel\(labelOf\(a\), labelOf\(b\)\); \}\)/.test(plKit);
  const plFolderSorts = /t\.keys\.slice\(\)\.sort\(F\.cmpLabel\)/.test(plStudio);
  const plNumericAware = /localeCompare\([\s\S]{0,80}numeric: true/.test(plStudio);
  const plUnsorted = plChipStrips.filter((c) => !/\.sort\(/.test(c.defs)).map((c) => c.fn);
  const plOrderPara = htmlText((help.match(/<p><strong>Filtering with pills\.<\/strong>[\s\S]*?<\/p>/) || [""])[0])
    .replace(/\s+/g, " ").trim();
  const plOrderPublished = /alphabetically by their label/i.test(plOrderPara) && /numerically/i.test(plOrderPara) &&
    /newest-first/i.test(plOrderPara) && /\bRepository\b/.test(plOrderPara) && /order of their own/i.test(plOrderPara);
  ok(`docs/index.html: the shared strips order their pills by label, the ${plUnsorted.length} pre-kit strip(s) do not, and Help scopes the claim to the ones that do`,
    plKitSorts && plFolderSorts && plNumericAware && plUnsorted.length === 2 && plOrderPublished,
    `kit pills() sorts on cmpLabel: ${plKitSorts} · folderStrip sorts on cmpLabel: ${plFolderSorts} · ` +
    `cmpLabel is digit-aware: ${plNumericAware}\n      ` +
    `sorts nothing: ${plUnsorted.join(", ") || "(none)"}\n      ` +
    `Help scopes the claim: ${plOrderPublished}\n      ` +
    `paragraph: ${plOrderPara || "(not found)"}\n      ` +
    "workbook pills come out of loadWorkbooks() (addWorkbook unshifts, so newest-first) and the type pills out of " +
    "REPO_TYPES' declaration order — neither is alphabetical, and the flat claim sent a reader hunting the wrong end of the strip");
}

/* ── 57. The NUMBER on a pill, and the pills that stay at zero ──────────────────────────
   N7, and the slice check 56 named as the one it was deliberately not taking: "the pill
   COUNTS and the disappear-when-empty rule in the same paragraph … are tally()/prune()
   behaviour and holding them means evaluating the kit, check 55's idiom one kit over,
   which is its own slice."

   So this is the third derivation over the same paragraph family. Check 53 holds the AXES
   (which page filters by what), check 56 the FACES (the words on a pill). This one holds
   the NUMBER — where it comes from, what it counts, and when a pill carrying one goes
   away — and like check 55 it EVALUATES `Studio.catalogFacets` and PROBES it rather than
   reading its comments. The half the kit cannot answer is the DENOMINATOR (a pill's number
   is whatever list the panel handed `tally()`), so that half is derived from the six
   panels' own call sites against a roster of their raw list sources.

   Measured 2026-08-09, before the fix. Both of the claims in that paragraph were published
   in a form a reader could act on and be wrong about:
   · **"each showing how many items it covers" never said WHICH items.** Every panel tallies
     its RAW list — `F.tally(list, …)` runs before the search matcher and before every facet
     matcher, its own strip's included — so the numbers do not move as you filter. Search a
     workspace down to two rows and the pill above them still reads its full count. Nothing
     on the page said so, and the natural reading of "how many items it covers" is the
     opposite one, which turns a correct number into a bug report.
   · **"A pill disappears as soon as its last item does" is false on three strips, and the
     reassurance built on it was true for a different reason.** `pills()` maps `t.keys`, so
     a kit strip really never prints a zero — but `folderStrip()` appends *Unfiled*
     unconditionally, Dashboards' hand-rolled strip prints `wbCounts.byId[w.id] || 0` for
     every workbook you have made plus its own unconditional *Unfiled*, and the Repository
     prints `counts[t.key] || 0` for all five of `REPO_TYPES` — so an empty workspace shows
     five zeros there, and an emptied workbook keeps its pill (which is how you file
     something back into it). The sentence's promise — that a filter can never keep
     narrowing from a chip you cannot see — holds anyway, because what gets dropped is the
     SELECTION, not the pill: `prune()` deletes a multi-select key whose count is gone,
     `pick()` falls back to "", and the two hand-rolled strips guard their own scalars.
     A reader who believed the stated mechanism would take those zeros for a bug.
   · The overlap was unpublished too: `tally()` counts a row once per key when `keyOf`
     returns an ARRAY, so a two-tag dataset is counted under both tag pills and a strip's
     numbers can sum past the list length.
   · And the escape pills are counted differently — `folderStrip`'s *All folders* prints the
     `total` argument (the whole list), not anything in the tally, as do the two *All* chips.

   Seven rules, every kit-side one a probe that RUNS the kit:
   (a) the premise — the kit is extractable and evaluable, all six panel bodies read, and
       Help carries the paragraph plus both new ones (a rule that cannot measure must fail,
       not pass over nothing);
   (b) every pill prints a count, from all three renderers (the kit's `pill()` and the two
       hand-rolled chip strips), and Help says so;
   (c) the DENOMINATOR: every ident whose rows become a pill number is the panel's raw list
       — matched against a per-panel roster of that source — its declaration is free of the
       search matcher, and the panel's visible rows come from a LATER filter over that same
       ident. This is the rule that fails if anyone re-points a tally at the filtered list,
       and it is also the rule that makes the copy's "before the search box" measurable;
   (d) the overlap, probed with an array-keyed facet, and published;
   (e) the escape pills carry the whole list's count — probed on `folderStrip`, derived from
       `{ all: <list>.length }` on the two chip strips;
   (f) the zero rule from BOTH ends: a kit strip never prints a zero (probed, including the
       vanishing pill), the three strips that do persist at zero are each derived from their
       own source, and Help names exactly those three. The roster of hand-rolled strips is
       held at two, so a fourth persisting strip lands here rather than passing green;
   (g) the mechanism behind the reassurance: `prune()`, `pick()` and the three hand-written
       guards drop the SELECTION, and Help says the filter is dropped rather than the pill.
   Deliberately NOT held: the adapter dot, the pill faces (check 56) and the axes (check 53);
   and `tally`'s `unfiled` bucket never becoming a pill of its own, which is `folderStrip`'s
   *Unfiled* by another name and already held by (f). */
{
  // The source of truth, evaluated rather than regexed: Studio.catalogFacets as the app
  // runs it. `esc` is the app's own escaper, supplied as identity — these rules probe the
  // markup for its NUMBERS; check 56 owns the faces.
  const fkKit = (() => {
    const src = read("app/studio.js");
    const at = src.indexOf("Studio.catalogFacets = {");
    if (at < 0) return null;
    const block = searchBlockAt(src, src.indexOf("{", at), "{", "}");
    try {
      const Studio = {};
      // eslint-disable-next-line no-new-func
      new Function("Studio", "esc", "Studio.catalogFacets = " + block + ";")(Studio, (s) => String(s));
      const F = Studio.catalogFacets;
      return ["tally", "prune", "pick", "pill", "pills", "folderStrip"].every((k) => typeof F[k] === "function") ? F : null;
    } catch { return null; }
  })();
  const fkStudio = read("app/studio.js");
  const fkBody = (file, fn) => {
    const src = read(file);
    const at = src.indexOf("function " + fn + "(");
    return at < 0 ? "" : searchBlockAt(src, src.indexOf("{", at), "{", "}");
  };
  // A whole `var x = …;` statement — the list declarations end in a `.sort(function () { … })`
  // whose body carries `;` of its own, so this walks to the semicolon at depth 0.
  const fkStmt = (src, at) => {
    let d = 0;
    for (let i = at; i < src.length; i++) {
      const c = src[i];
      if ("([{".includes(c)) d++;
      else if (")]}".includes(c)) d--;
      else if (c === ";" && d === 0) return src.slice(at, i + 1);
    }
    return src.slice(at);
  };
  const fkNums = (html) => [...String(html).matchAll(/wb-chip-n">(\d+)</g)].map((m) => Number(m[1]));
  const fkLabels = (html) => [...String(html).matchAll(/wb-chip-label">([^<]*)</g)].map((m) => m[1]);

  const fkPanels = facetPanels.map((p) => ({ ...p, body: fkBody(p.file, p.fn) }));
  const fkChipStrips = ["renderDashboards", "renderRepository"].map((fn) => ({ fn, body: fkBody("app/studio.js", fn) }));
  const fkPara = (lead) => htmlText((help.match(new RegExp(`<p><strong>${lead}\\.<\\/strong>[\\s\\S]*?<\\/p>`)) || [""])[0])
    .replace(/\s+/g, " ").trim();
  const fkPills = fkPara("Filtering with pills");
  const fkCountPara = fkPara("What the number on a pill counts");
  const fkGonePara = fkPara("When a pill goes away");

  // (a) the premise. Everything below dereferences fkKit or a panel body.
  const fkNoBody = fkPanels.filter((p) => !p.body).map((p) => p.fn)
    .concat(fkChipStrips.filter((c) => !c.body).map((c) => c.fn));
  const fkLive = ok(`app/studio.js + docs/index.html: Studio.catalogFacets is evaluable, all ${fkPanels.length} panel bodies read, ` +
     "and Help carries the three pill paragraphs — the premise the rules below measure against",
    !!fkKit && !fkNoBody.length && fkPanels.length === Object.keys(CATALOG_PAGES).length &&
      !!fkPills && !!fkCountPara && !!fkGonePara,
    `kit evaluated: ${!!fkKit} · bodies unread: ${fkNoBody.join(", ") || "(none)"}\n      ` +
    `paragraphs found — filtering: ${!!fkPills}, counts: ${!!fkCountPara}, disappearing: ${!!fkGonePara}\n      ` +
    "these rules PROBE the kit; if it cannot be run they must fail rather than pass over nothing");

  if (fkLive) {
    // (b) every pill prints a count — the kit's one renderer plus the two hand-rolled strips.
    const fkOne = fkKit.pill({ attr: "data-x", value: "k", label: "L", n: 7 });
    const fkChipPrints = fkChipStrips.filter((c) => /wb-chip-n">' \+ c\.n \+ '/.test(c.body)).map((c) => c.fn);
    const fkCountPublished = /count beside its label/i.test(fkPills) && /every pill has one/i.test(fkCountPara);
    ok(`docs/index.html: every pill carries a count — the kit's pill() and both hand-rolled strips print one (${fkChipPrints.length} of ${fkChipStrips.length})`,
      String(fkNums(fkOne)) === "7" && fkChipPrints.length === fkChipStrips.length && fkCountPublished,
      `kit pill({n:7}) prints: ${fkNums(fkOne).join(", ") || "(no number)"} · chip strips printing c.n: ${fkChipPrints.join(", ") || "(none)"}\n      ` +
      `published: ${fkCountPublished}\n      ` +
      "the number is the first thing a reader trusts on a strip; a pill that stopped carrying one would make the paragraph fiction");

    // (c) the denominator: a pill's number is counted over the panel's RAW list, before the
    //     search box and before every facet matcher. The roster names each panel's own list
    //     source, so re-pointing a tally at a filtered list fails here rather than silently
    //     changing what the published number means.
    const FK_RAW = {
      dashboards: /loadRecents\(\)/, views: /Studio\.Workspace\.all\("analyses"\)/,
      datasets: /Studio\.Workspace\.all\("datasets"\)/, connections: /Studio\.Workspace\.all\("connections"\)/,
      jobs: /Studio\.Workspace\.all\("jobs"\)/, repository: /repoAllRows\(\)/,
    };
    // Each site is captured as the EXPRESSION it counts, not as an identifier: a tally
    // handed `list.filter(dsxMatch)` must land here as a violation, and a pattern that only
    // matched bare idents would simply not see it (measured — that was this rule's first
    // shape, and the mutation walked straight through it).
    const fkCountSites = (body) => {
      const out = [];
      for (const m of body.matchAll(/(?:F|Studio\.catalogFacets)\.tally\(\s*([^,]*?)\s*,/g))
        out.push({ what: "tally", expr: m[1] });
      for (const m of body.matchAll(/folderStrip\(\s*[^,]*,\s*[^,]*,\s*"[\w-]+",\s*([^,)]*)/g))
        out.push({ what: "the folder strip's total", expr: m[1].trim(), counted: true });
      for (const m of body.matchAll(/var (?:wbCounts|counts) = \{ all: ([^,}]*)/g))
        out.push({ what: "the chip strip's All", expr: m[1].trim(), counted: true });
      // …and the loop that fills the rest of that map, which is the hand-rolled tally.
      for (const m of body.matchAll(/var (?:wbCounts|counts) = \{[^}]*\};\s*([^;]*?)\.forEach\(/g))
        out.push({ what: "the chip strip's own tally", expr: m[1].trim() });
      return out;
    };
    const fkDenomWrong = [];
    fkPanels.forEach((p) => {
      const sites = fkCountSites(p.body);
      if (!sites.length) { fkDenomWrong.push(`${p.page}: nothing on this page turns rows into a pill count any more`); return; }
      if (!/Studio\.catalogSearch\.(matcher|terms)\(q/.test(p.body))
        fkDenomWrong.push(`${p.page}: no search box behind this list — "before the search box" would be a claim about nothing`);
      sites.forEach((s) => {
        // The whole point of the rule: the counted thing is a plain list variable, never an
        // expression that could narrow it on the way in.
        const bare = s.counted ? /^(\w+)\.length$/.exec(s.expr) : /^(\w+)$/.exec(s.expr);
        if (!bare) {
          fkDenomWrong.push(`${p.page}: ${s.what} counts \`${s.expr}\` — an expression, not the page's own list, so its pills would move as you filter`);
          return;
        }
        const id = bare[1];
        const decl = fkStmt(p.body, p.body.search(new RegExp(`\\bvar ${id} = `)));
        if (!FK_RAW[p.sec].test(decl))
          fkDenomWrong.push(`${p.page}: the counted list \`${id}\` is no longer the page's raw list (expected ${FK_RAW[p.sec]})`);
        if (/catalogSearch\.(matcher|terms)\(|Match\(/.test(decl))
          fkDenomWrong.push(`${p.page}: \`${id}\` is filtered before it is counted — the published numbers would move as you type`);
        if (!new RegExp(`\\b${id}\\.filter\\(`).test(p.body))
          fkDenomWrong.push(`${p.page}: the visible rows no longer come from a later filter over \`${id}\``);
      });
    });
    const fkDenomPublished = /before the search box/i.test(fkCountPara) && /every other pill/i.test(fkCountPara) &&
      /never moves as you filter/i.test(fkCountPara);
    ok(`app/ + docs/index.html: every pill's number is counted over its page's raw list, before the search box and every pill (${fkPanels.length} panels)`,
      !fkDenomWrong.length && fkDenomPublished,
      `${fkDenomWrong.join("\n      ") || "(every counted list is the raw one)"}\n      ` +
      `published: ${fkDenomPublished}\n      ` +
      `counted lists: ${fkPanels.map((p) => `${p.page} [${fkCountSites(p.body).map((s) => s.expr).join(", ")}]`).join(" · ")}\n      ` +
      "a pill reading 40 above two visible rows is correct and looks broken — the page has to say which list it counts");

    // (d) the overlap: keyOf may return an array, so one row lands under several pills.
    const fkTags = fkKit.tally([{ t: ["finance", "eu"] }, { t: ["finance"] }], (r) => r.t);
    const fkOverlaps = fkTags.counts.finance === 2 && fkTags.counts.eu === 1 &&
      Object.values(fkTags.counts).reduce((a, b) => a + b, 0) > 2;
    const fkOverlapPublished = /add up to more than the list/i.test(fkCountPara) && /#finance/.test(fkCountPara);
    ok("docs/index.html: a multi-valued facet counts a row under every pill it matches, and Help says the numbers can out-total the list",
      fkOverlaps && fkOverlapPublished,
      `measured — two rows, three pill counts: ${JSON.stringify(fkTags.counts)} · published: ${fkOverlapPublished}\n      ` +
      "tally() adds 1 per key when keyOf returns an array, so a two-tag dataset is under both pills");

    // (e) the escape pills count the whole list — folderStrip prints its `total` argument,
    //     and both chip strips open on `{ all: <the raw list>.length }`.
    const fkFolder = fkKit.folderStrip(fkKit.tally([{ f: "A" }, { f: "A" }], (r) => r.f), "", "data-x", 40, {});
    const fkFolderNums = fkNums(fkFolder);
    const fkAllChips = fkChipStrips.filter((c) => /var chipDefs = \[\{ id: "", name: "All", n: (?:wbCounts|counts)\.all \}\]/.test(c.body)).map((c) => c.fn);
    const fkTotalPublished = /whole list's count/i.test(fkCountPara) && /All folders/i.test(fkCountPara);
    ok(`docs/index.html: the pills that mean everything carry the whole list's count, not a tallied one (folderStrip + ${fkAllChips.length} chip strip(s))`,
      fkFolderNums[0] === 40 && fkFolderNums.slice(1).reduce((a, b) => a + b, 0) === 2 &&
        fkAllChips.length === fkChipStrips.length && fkTotalPublished,
      `measured — folderStrip(total 40) over 2 filed rows prints: ${fkFolderNums.join(", ")}\n      ` +
      `chip strips opening on the raw total: ${fkAllChips.join(", ") || "(none)"} · published: ${fkTotalPublished}\n      ` +
      "All folders takes `total`, the unfiltered row count, so it is the one pill whose number is not from the tally");

    // (f) the zero rule, from both ends: a kit strip cannot print a zero, three strips
    //     deliberately can, and Help names exactly those three.
    const fkTwo = fkKit.pills(fkKit.tally([{ k: "a" }, { k: "b" }], (r) => r.k), {}, "data-x", {});
    const fkGoneOne = fkKit.pills(fkKit.tally([{ k: "a" }], (r) => r.k), {}, "data-x", {});
    const fkKitNeverZero = fkNums(fkTwo).length === 2 && fkLabels(fkGoneOne).join() === "a" &&
      !fkNums(fkTwo).includes(0) && !fkNums(fkGoneOne).includes(0);
    const fkFilledOnly = fkKit.folderStrip(fkKit.tally([{ f: "A" }], (r) => r.f), "", "data-x", 1, {});
    const fkUnfiledStays = fkLabels(fkFilledOnly).includes("Unfiled") &&
      fkNums(fkFilledOnly)[fkLabels(fkFilledOnly).indexOf("Unfiled")] === 0;
    const fkDashBody = fkChipStrips[0].body, fkRepoBody = fkChipStrips[1].body;
    const fkWorkbookStays = /n: wbCounts\.byId\[w\.id\] \|\| 0/.test(fkDashBody) &&
      /\.concat\(\[\{ id: "__unfiled", name: "Unfiled", n: wbCounts\.unfiled \}\]\)/.test(fkDashBody);
    const fkRepoTypes = [...fkStmt(fkStudio, fkStudio.indexOf("var REPO_TYPES = [")).matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
    const fkRepoStays = /\.concat\(REPO_TYPES\.map\(function \(t\) \{ return \{ id: t\.key, name: t\.label, n: counts\[t\.key\] \|\| 0 \}/.test(fkRepoBody);
    const fkHandRolled = [...fkStudio.matchAll(/var chipDefs = \[/g)].length;
    const fkZeroPublished = /never reads zero/i.test(fkGonePara) && /Unfiled/.test(fkGonePara) &&
      /workbook/i.test(fkGonePara) && /all five type pills/i.test(fkGonePara) && /Folders/.test(fkGonePara);
    ok(`docs/index.html: a shared pill strip never prints a zero, the ${fkHandRolled + 1} strips that keep an empty pill are named, and Help says which`,
      fkKitNeverZero && fkUnfiledStays && fkWorkbookStays && fkRepoStays && fkRepoTypes.length === 5 &&
        fkHandRolled === 2 && fkZeroPublished,
      `measured — kit strip drops a key with no rows: ${fkKitNeverZero} · folderStrip keeps Unfiled at 0: ${fkUnfiledStays}\n      ` +
      `workbook pill kept at 0: ${fkWorkbookStays} · all ${fkRepoTypes.length} Repository type pills kept: ${fkRepoStays} · ` +
      `hand-rolled strips: ${fkHandRolled}\n      ` +
      `published: ${fkZeroPublished}\n      ` +
      "pills() maps t.keys, so a kit pill cannot read 0 — the three that can are each a deliberate affordance, and an unexplained zero reads as a bug");

    // (g) what actually protects the reader: the SELECTION is dropped, never the pill.
    const fkPruned = { a: true, b: true };
    fkKit.prune(fkPruned, fkKit.tally([{ k: "a" }], (r) => r.k));
    const fkTally = fkKit.tally([{ k: "live" }], (r) => r.k);
    const fkPicks = fkKit.pick("gone", fkTally) === "" && fkKit.pick("live", fkTally) === "live" &&
      fkKit.pick("", fkTally) === "" && fkKit.pick(fkKit.UNFILED, fkTally) === fkKit.UNFILED;
    const fkGuards = [
      /if \(_repoWbFilter === "__packs" && !packCount\) _repoWbFilter = "";/.test(fkDashBody),
      /&& !validWbIds\[_repoWbFilter\]\) _repoWbFilter = "";/.test(fkDashBody),
      /if \(_repoAllType && !counts\[_repoAllType\]\) _repoAllType = "";/.test(fkRepoBody),
    ];
    const fkDropPublished = /drops that filter for you/i.test(fkGonePara);
    ok(`docs/index.html: a filter whose last item went away is dropped for you — prune(), pick() and the ${fkGuards.length} hand-written guards, and Help says so`,
      String(Object.keys(fkPruned)) === "a" && fkPicks && fkGuards.every(Boolean) && fkDropPublished,
      `measured — prune kept: ${Object.keys(fkPruned).join(", ") || "(nothing)"} · pick() falls back and keeps "" / __unfiled: ${fkPicks}\n      ` +
      `hand-written guards present: ${fkGuards.map((g, i) => `${i + 1}:${g}`).join(" ")} · published: ${fkDropPublished}\n      ` +
      "this, not the pill vanishing, is what makes the reassurance true on the three strips that keep an empty pill");
  }
}

/* ── 58. How the strips COMPOSE — OR inside a facet, AND across them ────────────────────
   N7, and the slice check 57 named as the one it was deliberately not taking: "the *Which
   pills take more than one* paragraph's claim that ticking two pills of one facet shows
   'anything matching either' — `matchMulti` really does OR within a facet while the facets
   AND against each other, and the AND half is unpublished on a page that has now taught the
   reader to expect the composition rules to be stated. Same probing idiom, one method down
   (`matchMulti`/`matchOne` rather than `tally`)."

   So this is the fourth derivation over the same paragraph family, and the last axis of it:
   check 53 holds WHICH page filters by what, 56 the WORDS on a pill, 57 the NUMBER, and this
   one holds what happens when you pick more than one. Like 55 and 57 it EVALUATES
   `Studio.catalogFacets` and PROBES it rather than reading its comments — but only half the
   claim lives in the kit. `matchMulti`/`matchOne` decide what ONE strip does; the AND is not
   in the kit at all, it is the `&&` each panel writes when it composes its matchers, so that
   half is derived from the six panels' own predicates.

   Measured 2026-08-09, before the fix. The OR half was published and the AND half was not:
   · **"tick two pills and the list shows anything matching either" is the whole of what the
     catalog-wide copy said.** Every panel then ANDs: `dsxAdapterMatch(d) && dsxConnMatch(d)
     && dsxTagMatch(d) && dsxKindMatch(d) && dsxFolderMatch(d) && dsxMatch(d)` on Datasets,
     the same shape on Connections/Views/Jobs, and a `return false` guard per axis on the two
     hand-rolled strips (Dashboards' workbook chips, the Repository's types) — so picking in
     a second strip does the OPPOSITE of picking a second pill in the first one, and the page
     stated one of those two and not the other.
   · **The search box is one more conjunct and was never counted as one.** Five panels put
     their `catalogSearch` matcher inside the same predicate; Dashboards runs it as a later
     stage over the facet-filtered list (it has the column fallback the others do not). Same
     semantics, and the copy named neither.
   · **A row with several values of one facet only needs one of them ticked** — `matchMulti`
     `.some()`s over an array key — which is the reading a reader has to have to make sense
     of the tag pills. Check 57 published the COUNTING side of the same array (a two-tag
     dataset is counted twice); the matching side was unpublished.
   · The one thing that was published, in the pills paragraph, is that an empty strip means
     all of them — and it is what makes the AND safe to state, since a strip you never
     touched cannot be the reason a combination came back empty.
   The narrower jargon line under *Filtering datasets and connections* ("Pills in the same
   strip are OR'd; different strips are AND'd") has said it correctly all along, for those
   two pages, in words the rest of the page deliberately avoids. This slice states it once,
   catalog-wide, in the page's own voice, and holds it.

   Six rules, every kit-side one a probe that RUNS the kit:
   (a) the premise — the kit evaluates with both matchers and all six panel predicates are
       readable (a rule that cannot measure must fail rather than pass over nothing). It
       deliberately does NOT require the new paragraph: a missing paragraph is the drift the
       other rules report, so gating them on it would have let the pre-fix tree pass;
   (b) OR inside a strip, probed from both ends (two keys ticked accept both rows and reject
       a third; an array-valued row matches on ANY one of its own values), and published;
   (c) the AND across strips, derived from every panel's predicate: each facet the panel
       built appears in it, no `||` joins them, and every `return` is either `false` or a
       chain of `&&`-ed calls — so a panel that started OR-ing its facets lands here rather
       than quietly making the copy false. Plus published;
   (d) the search box as one more conjunct, per panel, in whichever of the two shapes that
       panel uses, and published;
   (e) an untouched strip narrows nothing, probed on both matchers, and published in both
       paragraphs — this is the sentence that makes (c) safe to state;
   (f) the negative half: a single-select strip cannot OR. `matchOne` takes one value and
       rejects the rest (UNFILED matching only the unfiled rows), and the facet paragraph
       still says which strips are one-at-a-time.
   Deliberately NOT held: which page has which axis (check 53), the pill faces (56), the
   numbers (57), and the jargon line above — holding two copies of one rule in two voices
   would make the narrower one impossible to reword. */
{
  // The source of truth, evaluated rather than regexed: the two matchers as the app runs them.
  const cpKit = (() => {
    const src = read("app/studio.js");
    const at = src.indexOf("Studio.catalogFacets = {");
    if (at < 0) return null;
    const block = searchBlockAt(src, src.indexOf("{", at), "{", "}");
    try {
      const Studio = {};
      // eslint-disable-next-line no-new-func
      new Function("Studio", "esc", "Studio.catalogFacets = " + block + ";")(Studio, (s) => String(s));
      const F = Studio.catalogFacets;
      return ["matchMulti", "matchOne"].every((k) => typeof F[k] === "function") ? F : null;
    } catch { return null; }
  })();
  const cpBody = (file, fn) => {
    const src = read(file);
    const at = src.indexOf("function " + fn + "(");
    return at < 0 ? "" : searchBlockAt(src, src.indexOf("{", at), "{", "}");
  };
  // A whole `var x = …;` statement — the search stage ends in a `.filter(function () { … })`
  // carrying `;` of its own, so this walks to the semicolon at depth 0 (check 57's idiom).
  const cpStmt = (src, at) => {
    let d = 0;
    for (let i = at; i < src.length; i++) {
      const c = src[i];
      if ("([{".includes(c)) d++;
      else if (")]}".includes(c)) d--;
      else if (c === ";" && d === 0) return src.slice(at, i + 1);
    }
    return src.slice(at);
  };
  const cpFlat = (s) => String(s).replace(/\s+/g, " ").trim();
  const cpPara = cpFlat(htmlText((help.match(/<p><strong>How the strips combine\.<\/strong>[\s\S]*?<\/p>/) || [""])[0]));
  const cpPills = cpFlat(htmlText((help.match(/<p><strong>Filtering with pills\.<\/strong>[\s\S]*?<\/p>/) || [""])[0]));

  // Each panel, read the way check 57 reads its counts: the predicate that turns the raw
  // list into the rows you see, the facets it has to honour, and where the search box joins.
  const cpPanels = facetPanels.map((p) => {
    const body = cpBody(p.file, p.fn);
    const at = body.search(/\bvar (?:shown|filtered) = \w+\.filter\(function \(\w+\) \{/);
    const visible = at < 0 ? "" : /\bvar (\w+) =/.exec(body.slice(at))[1];
    const pred = at < 0 ? "" : searchBlockAt(body, body.indexOf("{", body.indexOf("function", at)), "{", "}");
    return {
      ...p, body, pred, visible,
      // the kit's matchers, however they are declared (Datasets chains five off one `var`)
      matchers: [...body.matchAll(/(\w+) = (?:F|Studio\.catalogFacets)\.match(?:Multi|One)\(/g)].map((m) => m[1]),
      // …and the two hand-rolled strips' scalars, which check 53 already identifies as axes
      scalars: p.axes.filter((a) => a.expr.startsWith("_")).map((a) => a.expr),
      search: (/var (\w+) = Studio\.catalogSearch\.(?:matcher|terms)\(q/.exec(body) || [])[1] || "",
    };
  });

  // (a) the premise. Everything below dereferences cpKit or a panel predicate.
  const cpNoPred = cpPanels.filter((p) => !p.pred).map((p) => p.fn);
  // The premise is deliberately the CODE side plus the pre-existing pills paragraph, and not
  // the composition paragraph this slice added: a missing paragraph is exactly the drift the
  // rules below exist to report, so gating them on it would have made the pre-fix tree pass.
  const cpLive = ok(`app/studio.js: both facet matchers evaluate and all ${cpPanels.length} panel predicates are readable — ` +
     "the premise the rules below measure against",
    !!cpKit && !cpNoPred.length && cpPanels.length === Object.keys(CATALOG_PAGES).length && !!cpPills,
    `kit evaluated: ${!!cpKit} · predicates unread: ${cpNoPred.join(", ") || "(none)"}\n      ` +
    `the pills paragraph found: ${!!cpPills}\n      ` +
    "these rules PROBE the kit; if it cannot be run they must fail rather than pass over nothing");

  if (cpLive) {
    const cpKeyOf = (r) => r.k, cpTagsOf = (r) => r.t;

    // (b) OR inside one strip — the kit's `!!state[k]`, and `.some()` when the row's own key
    //     is an array. Both directions, so a matcher that started AND-ing lands here.
    const cpTwo = cpKit.matchMulti({ a: true, b: true }, cpKeyOf);
    const cpOrKeys = cpTwo({ k: "a" }) && cpTwo({ k: "b" }) && !cpTwo({ k: "c" });
    const cpTag = cpKit.matchMulti({ eu: true }, cpTagsOf);
    const cpOrValues = cpTag({ t: ["finance", "eu"] }) && !cpTag({ t: ["finance"] });
    const cpOrPublished = /need only match one of them/i.test(cpPara) && /either tag/i.test(cpPara) &&
      /only one of its own values ticked/i.test(cpPara);
    ok("docs/index.html: two pills on one strip are alternatives, and a row with several values needs only one of them ticked",
      cpOrKeys && cpOrValues && cpOrPublished,
      `measured — {a,b} ticked accepts a and b, rejects c: ${cpOrKeys} · {eu} ticked accepts a #finance #eu row, rejects #finance: ${cpOrValues}\n      ` +
      `published: ${cpOrPublished}\n      ` +
      "matchMulti ORs within a facet and .some()s over an array key — the reading the tag pills only make sense under");

    // (c) the AND across strips. Not in the kit: it is the `&&` (or the `return false` guard)
    //     each panel writes, so it is derived from all six predicates.
    const cpAndWrong = [];
    cpPanels.forEach((p) => {
      const want = p.matchers.concat(p.scalars);
      if (!want.length) { cpAndWrong.push(`${p.page}: no facet reaches this page's predicate any more`); return; }
      const missing = want.filter((id) => !new RegExp(`\\b${id}\\b`).test(p.pred));
      if (missing.length) cpAndWrong.push(`${p.page}: ${missing.join(", ")} never reach the predicate — the strip would stop narrowing`);
      if (p.pred.includes("||"))
        cpAndWrong.push(`${p.page}: its predicate ORs somewhere — the published rule is that every picked strip has to be satisfied at once`);
      [...p.pred.matchAll(/return ([^;]*);/g)].map((m) => cpFlat(m[1])).forEach((r) => {
        if (r !== "false" && !/^[\w.]+\([\w.]+\)(\s*&&\s*[\w.]+\([\w.]+\))*$/.test(r))
          cpAndWrong.push(`${p.page}: \`return ${r}\` is neither a rejection nor a chain of ANDed matchers`);
      });
    });
    const cpAndPublished = /every strip you have picked from has to be satisfied at once/i.test(cpPara);
    ok(`app/ + docs/index.html: the strips AND against each other on all ${cpPanels.length} catalog pages, and Help says so`,
      !cpAndWrong.length && cpAndPublished,
      `${cpAndWrong.join("\n      ") || "(every panel ANDs its facets)"}\n      ` +
      `published: ${cpAndPublished}\n      ` +
      `predicates: ${cpPanels.map((p) => `${p.page} [${p.matchers.concat(p.scalars).join(", ")}]`).join(" · ")}\n      ` +
      "picking in a second strip does the opposite of picking a second pill in the first one — a reader cannot infer that from the OR half");

    // (d) the search box is one more conjunct, in whichever of the two shapes the panel uses.
    const cpSearchOf = (p) => {
      if (!p.search) return { how: "", ok: false };
      if (new RegExp(`\\b${p.search}\\b`).test(p.pred)) return { how: "in the predicate", ok: true };
      // Dashboards searches AFTER its facets, because its column fallback needs the terms
      // the row's own text missed — same conjunction, one stage later.
      const at = p.body.search(new RegExp(`\\bvar \\w+ = ${p.visible}\\.(?:map|filter)\\(`));
      if (at < 0) return { how: "", ok: false };
      const stmt = cpStmt(p.body, at);
      return { how: `over \`${p.visible}\``, ok: new RegExp(`\\b${p.search}\\b`).test(stmt) && /\.filter\(/.test(stmt) };
    };
    const cpSearch = cpPanels.map((p) => ({ page: p.page, ...cpSearchOf(p) }));
    const cpSearchPublished = /search box counts as one more/i.test(cpPara);
    ok(`app/ + docs/index.html: the search box narrows alongside the pills on every catalog page (${cpSearch.filter((s) => s.ok).length} of ${cpSearch.length})`,
      cpSearch.every((s) => s.ok) && cpSearchPublished,
      `${cpSearch.map((s) => `${s.page}: ${s.ok ? s.how : "no search stage found over its filtered rows"}`).join(" · ")}\n      ` +
      `published: ${cpSearchPublished}\n      ` +
      "a reader who has just been told the strips AND has to be told whether the box they typed in is one of them");

    // (e) an untouched strip narrows nothing — what makes (c) safe to state.
    const cpEmpty = cpKit.matchMulti({}, cpKeyOf)({ k: "anything" }) === true &&
      cpKit.matchOne("", cpKeyOf)({ k: "anything" }) === true;
    const cpEmptyPublished = /narrows nothing/i.test(cpPara) &&
      /picking none of a facet's pills means all of them/i.test(cpPills);
    ok("docs/index.html: a strip you have picked nothing in narrows nothing — probed on both matchers, published in both paragraphs",
      cpEmpty && cpEmptyPublished,
      `measured — empty multi-select and empty single-select both accept every row: ${cpEmpty} · published: ${cpEmptyPublished}\n      ` +
      "without this the AND rule reads as though six untouched strips had to agree before anything showed at all");

    // (f) the negative half: a single-select strip cannot OR.
    const cpOne = cpKit.matchOne("a", cpKeyOf);
    const cpUnfiled = cpKit.matchOne(cpKit.UNFILED, cpKeyOf);
    const cpOnly = cpOne({ k: "a" }) && !cpOne({ k: "b" }) && cpUnfiled({}) && !cpUnfiled({ k: "a" });
    const cpOnePublished = /one pill at a time/i.test(facetPara);
    ok("docs/index.html: a single-select strip holds exactly one value — matchOne rejects every other row, and Help still names those strips",
      cpOnly && cpOnePublished,
      `measured — matchOne("a") accepts only a, and the unfiled value only the unfiled rows: ${cpOnly} · published: ${cpOnePublished}\n      ` +
      "the OR sentence is scoped to the multi-select strips, so the page has to keep saying which ones those are");
  }
}

/* ── 59. Simple mode vs the mode the app really builds ──────────────────────────────────
   N7. Checks 2/3/4 have held the SIZE of Simple mode since AUD-11 — "15 chart types", and
   `SIMPLE_CHART_TYPES` really does have fifteen — so the section has been correctly numbered
   for weeks about the one thing anybody counted. Nothing held what the mode DOES: which
   inspector sections it hides, how you turn it on, or what it puts on screen that Advanced
   mode does not. The find is that the page said all three, and got all three wrong.

   Measured 2026-08-09, before the fix:
   · **The Simple-mode bullet named 7 of the 15 advanced inspector sections and closed on
     "etc."** — Detail drawer, Target line, Reference band, Point annotations, Compare to,
     Click-through, Calculated columns and Output options appeared nowhere, and Output
     options and Calculated columns are the two a data author is most likely to go looking
     for when they vanish.
   · **The Advanced-mode bullet named a DIFFERENT 7 of the same 15**, three of them by
     labels the inspector has never printed (`Color scales`, `Target lines`,
     `Reference bands` — the app's headers are singular). Neither list was wrong alone in a
     way a reader could see; together they published two partial, disagreeing copies of one
     registry, which is why this check holds ONE list and makes the other defer to it.
   · **Two of the four ways in were unpublished**, and the one detail the sentence did give
     was attached to the wrong control: "a labelled switch on the Settings page (left rail)
     alongside Dark mode and Demo mode". Dark mode really is Simple mode's neighbour — on
     the LEFT RAIL's own quick switches (`#railQuickDark` / `#railQuickSimple`), the route
     the sentence does not mention; on the Settings page `SETTINGS_TOGGLES` files Simple
     mode under **Mode** while Dark mode is Appearance and Demo mode is Presentation, so it
     neighbours neither. The ⌘K palette's own `Simple mode` command was unpublished too.
   · **Everything Simple mode ADDS was unpublished or misnamed.** The mode is subtractive on
     this page — a list of what goes away — while the builder grows five things in it: the
     `Simple mode is active` note and its `Switch to Advanced mode →` button (the in-app way
     back, named nowhere), the top-bar `Simple mode` badge (the only always-visible answer to
     "which mode am I in"), the `Getting started` checklist, the `What's next?` card, and the
     guided column setup whose button is `Auto-pick columns ▶` — published as an "Auto-pick"
     button on the "KPI and View data sections", where it is really the panel Data section's,
     for every chart type except richtext.
   · **The boot claim contradicted itself two sections apart.** `app/studio.js`'s V5/V6 block
     is `__studioShellSetSection(hasFeatured ? "home" : "explore")`, and Home's own section
     says exactly that; the Quick Views section said "In Simple mode, Explore is the default
     section on first open" flat, so the page was simultaneously right and wrong about the
     same boot — the v927/v929 shape.

   Eight rules. The sources of truth are the `advSection()` call sites (the sections the
   inspector marks `.adv-sect` for `body.simple-mode` to hide), `SETTINGS_TOGGLES`, the rail
   and More markup, `app/palette.js`'s command labels, the labels the `S.simpleMode`-guarded
   blocks print, and the boot expression itself:
   (a) the premise — the sections parse, `advSection()` still stamps `.adv-sect`, and the CSS
       still hides it; a rule that cannot measure must fail rather than pass over nothing;
   (b) coverage — the one list names every section, in bold, by the title the header prints;
   (c) the negative half — every bolded name in that list is a section the inspector builds,
       so a retired or invented one fails rather than reading as documentation;
   (d) one list, not two — the Advanced-mode bullet defers to it and republishes no partial
       copy (a title, or a title pluralised, appearing there is the drift itself);
   (e) the count word — every "<n> advanced … sections" claim is the registry's number;
   (f) the routes — every control that toggles the mode is published, and a toggle the page
       calls its neighbour must really neighbour it (the rail's other quick switch, or a
       member of Simple mode's own Settings group);
   (g) what the mode ADDS — every label its own UI prints, held in bold, plus the badge from
       both ends (Help may describe one only while `#simpleBadge` is in the markup);
   (h) the boot section, held from both ends — while the expression is conditional, every
       sentence on the page that says what Simple mode boots to states the condition.
   Deliberately NOT held: the CSS-derived authoring controls the mode hides (`#btnNewDS`,
   `.mine-add`, `.da-mine-acts`, `.da-acts`, `.repo-ds-acts`). They are published now, but
   mapping a selector to the name a reader knows it by is a hand-written table, not a
   derivation — check 21's idiom over a different set, and its own slice. */
{
  const smStudio = read("app/studio.js");
  const smCss = read("app/studio.css");
  const smIndex = read("app/index.html");
  const smPalette = read("app/palette.js");

  // The registry: every advanced inspector section, by the title its header prints.
  const advTitles = [...smStudio.matchAll(/\badvSection\(\s*\w+\s*,\s*"([^"]+)"/g)].map((m) => m[1]);
  const advWired = /classList\.add\("adv-sect"\)/.test(smStudio) &&
    /body\.simple-mode \.adv-sect\{display:none/.test(smCss);

  const smSec = (() => {
    const at = help.indexOf('<section id="simple-mode">');
    return at < 0 ? "" : help.slice(at, help.indexOf("</section>", at) + 10);
  })();
  const flat = (s) => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
  const liById = (id) => {
    const at = smSec.indexOf(`<li id="${id}"`);
    return at < 0 ? "" : smSec.slice(at, smSec.indexOf("</li>", at));
  };
  const boldIn = (html) => [...html.matchAll(/<strong>([\s\S]*?)<\/strong>/g)].map((m) => flat(m[1]));
  const smText = flat(smSec);

  const advLi = liById("adv-sections");
  const advModeLi = liById("adv-mode-sections");
  const advNamed = boldIn(advLi);

  // (a) the premise.
  ok(`app/studio.js + app/studio.css: Simple mode's advanced sections parsed for check 59 ` +
    `(${advTitles.length} section(s))`,
    advTitles.length >= 10 && advWired && smSec.length > 0 && advLi.length > 0,
    `advSection() call sites: ${advTitles.length} · .adv-sect stamped + hidden: ${advWired} · ` +
    `<section id="simple-mode"> found: ${smSec.length > 0} · its <li id="adv-sections"> found: ${advLi.length > 0}\n      ` +
    "the other seven rules read these — if the mode's own wiring moved, they must fail here rather than pass over nothing");

  // (b) coverage: the one list names every section the inspector builds.
  const advMissing = advTitles.filter((t) => !advNamed.includes(t));
  ok(`docs/index.html: the Simple-mode list names all ${advTitles.length} advanced inspector sections`,
    !advMissing.length,
    `unpublished: ${advMissing.join(", ") || "(none)"}\n      ` +
    `named: ${advNamed.join(", ") || "(none)"}\n      ` +
    "a section that vanishes in Simple mode and is named nowhere reads as a bug, not as a mode");

  // (c) the negative half: nothing in that list is invented or retired.
  const advInvented = advNamed.filter((n) => !advTitles.includes(n));
  ok("docs/index.html: every advanced section the Simple-mode list names is one the inspector builds",
    !advInvented.length,
    `named but not an advSection() title: ${advInvented.join(", ") || "(none)"}\n      ` +
    `the inspector builds: ${advTitles.join(", ")}`);

  // (d) one list, not two — the Advanced-mode bullet defers rather than republishing a partial copy.
  const advEchoed = advTitles.filter((t) => new RegExp(`<strong>\\s*${esc(t)}s?\\s*</strong>`, "i").test(advModeLi));
  ok("docs/index.html: the Advanced-mode bullet defers to that list instead of publishing a second, partial one",
    advModeLi.length > 0 && !advEchoed.length,
    `<li id="adv-mode-sections"> found: ${advModeLi.length > 0} · re-listed there: ${advEchoed.join(", ") || "(none)"}\n      ` +
    "two hand-maintained copies of one registry is how the page came to name a different seven in each");

  // (e) the count word.
  const NUMWORD = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
    "eighteen", "nineteen", "twenty"];
  const advCountClaims = [...smText.matchAll(/\b(\d+|[a-z]+)\s+advanced\s+(?:inspector\s+)?sections?\b/gi)]
    .filter((m) => /^\d+$/.test(m[1]) || NUMWORD.includes(m[1].toLowerCase()));
  const advWordOk = (w) => /^\d+$/.test(w)
    ? Number(w) === advTitles.length
    : NUMWORD.indexOf(w.toLowerCase()) === advTitles.length;
  ok(`docs/index.html: every "<n> advanced sections" claim reads ${advTitles.length}`,
    advCountClaims.length >= 1 && advCountClaims.every((m) => advWordOk(m[1])),
    `claims: ${advCountClaims.map((m) => `"${m[0]}"`).join(", ") || "(none — the section publishes no count)"}` +
    ` — the registry has ${advTitles.length}`);

  // (f) the routes in, and who Simple mode really sits beside.
  const togBlock = (() => {
    const at = smStudio.indexOf("var SETTINGS_TOGGLES");
    return at < 0 ? "" : searchBlockAt(smStudio, smStudio.indexOf("[", at), "[", "]");
  })();
  const toggles = [...togBlock.matchAll(/\{\s*grp: "([^"]+)", id: "([^"]+)", t: "([^"]+)"/g)]
    .map((m) => ({ grp: m[1], id: m[2], t: m[3] }));
  const simpleTog = toggles.find((t) => t.id === "simple");
  const railQuick = (() => {
    const at = smIndex.indexOf('id="railQuick"');
    return at < 0 ? "" : smIndex.slice(at, smIndex.indexOf("</div>", at));
  })();
  const railLbls = [...railQuick.matchAll(/rail-quick-lbl">([^<]+)</g)].map((m) => m[1]);
  // Held from BOTH ends, check 54's idiom: a control renamed out from under its published
  // route has to fail loudly rather than quietly drop out of the roster.
  const smRoutes = [
    { name: "the ⋯ More menu", built: /<button id="moreSimple">/.test(smIndex), pub: /More menu/i },
    { name: "the rail's quick switches", built: /id="railQuickSimple"/.test(smIndex), pub: /quick switch/i },
    { name: "the Settings page", built: !!simpleTog, pub: /Settings/ },
    { name: "the ⌘K command palette", built: /label: "Simple mode"/.test(smPalette), pub: /command palette|⌘K/ },
  ];
  const smLive = smRoutes.filter((r) => r.built);
  const smUnpublished = smLive.filter((r) => !r.pub.test(smText));
  const smStale = smRoutes.filter((r) => !r.built && r.pub.test(smText));
  // A toggle may be called Simple mode's neighbour only where it really is one: the rail's
  // OTHER quick switch, or a member of Simple mode's own Settings group.
  const legalNeighbour = new Set([
    ...railLbls.filter((l) => l !== "Simple mode"),
    ...toggles.filter((t) => simpleTog && t.grp === simpleTog.grp && t.id !== "simple").map((t) => t.t),
  ]);
  const badNeighbours = toggles
    .filter((t) => t.id !== "simple" && !legalNeighbour.has(t.t) && new RegExp(`\\b${esc(t.t)}\\b`, "i").test(smText));
  const groupPublished = !!simpleTog &&
    new RegExp(`<strong>${esc(simpleTog.grp)}</strong> group`).test(smSec);
  ok(`docs/index.html: all ${smLive.length} ways into Simple mode are published, and its neighbours are real`,
    !smUnpublished.length && !smStale.length && !badNeighbours.length && groupPublished,
    `unpublished routes: ${smUnpublished.map((r) => r.name).join(", ") || "(none)"}\n      ` +
    `published but no longer built: ${smStale.map((r) => r.name).join(", ") || "(none)"}\n      ` +
    `named as a neighbour but is not one: ${badNeighbours.map((t) => `${t.t} (Settings group ${t.grp})`).join(", ") || "(none)"}\n      ` +
    `real neighbours: ${[...legalNeighbour].join(", ")} · Simple mode's own Settings group ` +
    `"${simpleTog ? simpleTog.grp : "?"}" published: ${groupPublished}`);

  // (g) what the mode ADDS — every label its own UI prints, held in bold.
  const smOwnLabels = (() => {
    const out = [];
    const re = /if \(S\.simpleMode/g;
    let m;
    while ((m = re.exec(smStudio))) {
      const p = smStudio.indexOf("(", m.index);
      const cond = searchBlockAt(smStudio, p, "(", ")");
      const at = smStudio.indexOf("{", p + cond.length);
      if (at < 0) continue;
      const body = searchBlockAt(smStudio, at, "{", "}");
      for (const b of body.matchAll(/el\("button", "[^"]*"\);[\s\S]{0,90}?textContent = "((?:[^"\\]|\\.)*)"/g)) out.push(b[1]);
      for (const t of body.matchAll(/el\("div", "[^"]*-title"\);\s*\w+\.textContent = "((?:[^"\\]|\\.)*)"/g)) out.push(t[1]);
    }
    return [...new Set(out)];
  })();
  // The label is the claim; its trailing affordance glyph is not, so it is stripped before matching.
  const labelWords = (s) => flat(s).replace(/[\s→▶»›…]+$/, "").trim();
  const smBold = boldIn(smSec);
  const smLabelMissing = smOwnLabels.filter((l) => !smBold.includes(labelWords(l)));
  const badgeBuilt = /id="simpleBadge"/.test(smIndex);
  const badgePublished = /\bbadge\b/i.test(smText);
  ok(`docs/index.html: Simple mode's own ${smOwnLabels.length} on-screen labels are published, and its badge is held from both ends`,
    smOwnLabels.length >= 4 && !smLabelMissing.length && badgeBuilt === badgePublished,
    `unpublished: ${smLabelMissing.join(" · ") || "(none)"}\n      ` +
    `the mode prints: ${smOwnLabels.join(" · ")}\n      ` +
    `#simpleBadge in the markup: ${badgeBuilt} · Help describes a badge: ${badgePublished}\n      ` +
    "a mode with no published way back is the one a reader is stuck in");

  // (h) what it boots to — held from both ends.
  const bootCond = /__studioShellSetSection\(\s*\w+ \? "home" : "explore"\)/.test(smStudio);
  const bootClaims = [...help.matchAll(/In <strong>Simple mode<\/strong>[^.]*\./g)]
    .map((m) => m[0]).filter((s) => /\bboots?\b|default section/i.test(s));
  // Both directions: while the branch exists every claim must state it, and if the branch ever
  // goes away no claim may keep asserting a condition the code no longer has.
  const bootBare = bootClaims.filter((s) => bootCond !== /featured/i.test(s));
  ok("docs/index.html: every claim about what Simple mode boots to states the condition the code branches on",
    bootClaims.length >= 1 && !bootBare.length,
    `claims: ${bootClaims.length} · out of step with the code: ${bootBare.map((s) => `"${flat(s)}"`).join(" · ") || "(none)"}\n      ` +
    `app/studio.js branches on featured content: ${bootCond}\n      ` +
    "one section said Home-when-featured and another said Explore flat — neither wrong alone, both wrong together");
}

/* ── 60. The authoring controls Simple mode hides vs the controls it really hides ────────
   N7. Check 59 holds what Simple mode does to the panel INSPECTOR — which advanced sections
   go away, how you turn the mode on, what it adds — and it says in its own closing note why
   it stopped where it did: the authoring controls the mode hides live in CSS
   (`body.simple-mode …{display:none!important}`), and a SELECTOR is not a name a reader
   knows a button by. That mapping is hand-written, which is check 21's idiom, so it needed
   its own slice. This is that slice, and the sentence it holds was wrong in three ways.

   Measured 2026-08-10, before the fix. Help published one sentence: *"The **Data** panel is
   read-only browse + drag: its **＋ New ▾** button, the add control on **My queries** and the
   per-query actions are all hidden, as are the **Edit data source** jump link in a panel's
   Data section and the per-dataset actions on the **Repository** page."*
   · **The add control is on the wrong group.** `.mine-add` is built by
     `buildMyDataSources()`, whose header prints **This dashboard’s datasets** — not
     **My queries**, which is a different group (`buildLibrary()`'s `.lib-samples`) with its
     own, different per-card actions. Both groups exist, so the sentence read as plausible.
   · **"the per-query actions" is one phrase for two different sets.** `.da-mine-acts`
     (Duplicate / Delete, on This dashboard’s datasets) and `.da-acts` (Edit data source /
     Delete data source, on My queries) are separate controls on separate groups; the page
     named neither the groups nor the four actions, so a reader who lost the Duplicate button
     could not confirm from Help that losing it was the mode.
   · **The Repository claim is false in BOTH directions.** `.repo-ds-acts` — the selector the
     clause was written about — is hidden by `app/studio.css:718` and rendered by NOTHING:
     `.repo-ds-card` has no renderer anywhere in `app/`, so the rule is dead CSS. Meanwhile
     the Repository page's real per-row authoring controls (`repo-edit` = **Quick edit**,
     `repo-folder-add` = **+ New folder**, and the `dash-bulk-bar` Select bar) are hidden by
     no rule at all. So Help told a reader in Simple mode that catalog authoring was locked
     down when it is fully available, and the one control it named had not existed for
     however long `.repo-ds-card` has been gone.

   Six rules. The hand-written half is the TABLE below — which selector is which control, and
   which group a reader finds it on; everything else is derived from the CSS, from the
   functions that build the controls, and from the group labels those functions print:
   (a) the premise — the hide rules parse, the table's every selector is really hidden (or,
       for the JS-guarded jump link, really guarded), and Help's two anchors exist;
   (b) the table covers the CSS both ways — a new `body.simple-mode` hide rule with no table
       entry fails here rather than going quietly unpublished (the advanced-inspector and
       chart-gallery selectors are check 59's and checks 2/3/4's, and are named as theirs);
   (c) live vs dead — a selector nothing renders may not be published as a hidden control, so
       every bolded name in the list has to be a label or a group the app really prints;
   (d) each live control is published WITH its group — one bullet naming the control's own
       labels and the group header it sits under, both in bold, so the two groups cannot be
       collapsed into one vague phrase again;
   (e) the count word — every "<n> authoring controls" claim is the live count;
   (f) the other direction — the catalog pages' authoring controls are hidden by nothing, and
       the page says so instead of leaving the reader to assume the builder's restriction is
       app-wide.
   Measured: (d), (e) and (f) fail on the REAL pre-fix tree, and so does the premise — the page
   had no such list to hold, which is the honest reading of "one sentence, three errors". (c)
   could not fail there for the same reason (an absent list bolds nothing), so it was measured
   on a mutated tree that re-publishes the Repository clause. Every code-side direction was
   measured too: a hide rule nothing claims, a selector renamed out from under the table, a
   group header renamed in the app, a control relabelled in BOTH its title and its aria-label
   (renaming only one correctly changes nothing — the app still prints the name), and Simple
   mode starting to hide the Repository page's Quick edit, which correctly reddens (b) and (f)
   together.
   Deliberately NOT taken here: DELETING the dead `body.simple-mode .repo-ds-acts` rule (and
   the four `.repo-ds-*` rules above it). `app/studio.css` is precached, so a five-line
   deletion costs an `sw.js` CACHE bump — issue #631's territory — for dead CSS no user can
   see. Rule (b) keeps the entry visible as `dead: true` rather than letting it rot unnamed;
   it belongs to whichever slice next opens that file for a reason of its own. */
{
  const acStudio = read("app/studio.js");
  const acCss = read("app/studio.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const acIndex = read("app/index.html");

  // The hand-written half. `group` is the header a reader finds the control under; `labels`
  // are the names the control prints (button text, or the title/aria-label of an icon-only
  // one). Both are VERIFIED against the app below — this table says what to look for, never
  // what is true.
  const AUTHORING = [
    { sel: "#btnNewDS", where: "html", group: "Data", labels: ["＋ New ▾"] },
    { sel: ".mine-add", where: "fn", group: "This dashboard’s datasets", labels: ["Create a new data source"] },
    { sel: ".da-mine-acts", where: "fn", group: "This dashboard’s datasets", labels: ["Duplicate", "Delete"] },
    { sel: ".da-acts", where: "fn", group: "My queries", labels: ["Edit data source", "Delete data source"] },
    // Dead CSS: hidden by app/studio.css, rendered by nothing. See the note above.
    { sel: ".repo-ds-acts", where: "fn", group: null, labels: [] },
    // Not CSS at all — the panel inspector simply does not build it in Simple mode.
    { sel: ".edit-src-link", where: "guard", group: "Data", labels: ["Edit data source"] },
  ];
  // Held elsewhere, and named here so rule (b) can tell "someone else's" from "unpublished".
  const NOT_AUTHORING = { ".adv-sect": "check 59", ".adv-chart": "checks 2/3/4", ".cg-label.adv-grp": "checks 2/3/4" };
  // The Repository page's own authoring controls — rule (f)'s subjects, same idiom.
  const REPO_KEEPS = [
    { cls: "repo-edit", label: "Quick edit" },
    { cls: "repo-folder-add", label: "+ New folder" },
    { cls: "dash-bulk-bar", label: null },
  ];

  // ── derived: every selector body.simple-mode hides outright.
  const acHidden = new Set();
  for (const m of acCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/display\s*:\s*none/.test(m[2])) continue;
    for (const sel of m[1].split(",")) {
      const g = /^\s*body\.simple-mode\s+(\S[^\s].*?)\s*$/.exec(sel);
      if (g) acHidden.add(g[1]);
    }
  }

  // ── derived: the function that builds a control, and the group label it (or its caller) prints.
  const unescU = (s) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const apos = (s) => String(s == null ? "" : s).replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
  const fnAt = (at) => {
    const start = acStudio.lastIndexOf("\n  function ", at);
    if (start < 0) return null;
    const name = /\n {2}function (\w+)/.exec(acStudio.slice(start, start + 80));
    const brace = acStudio.indexOf("{", acStudio.indexOf("(", start));
    if (!name || brace < 0) return null;
    return { name: name[1], body: searchBlockAt(acStudio, brace, "{", "}") };
  };
  // A group header is `<span class="nm">Label</span>`; interpolated ones (' + esc(stem) + ')
  // are a per-item name, not a group, so they are dropped rather than guessed at.
  const nmOf = (body) => [...body.matchAll(/class="nm">([^<]*)</g)].map((m) => m[1])
    .filter((s) => !/['"+]/.test(s)).map((s) => apos(unescU(s)));
  const buildsIt = (e) => {
    if (e.where === "html") {
      const at = acIndex.indexOf(e.sel.slice(1));
      if (at < 0) return null;
      const aside = acIndex.slice(acIndex.lastIndexOf("<aside", at), acIndex.indexOf("</aside>", at));
      const h = /<div class="pane-h">[\s\S]*?<span>([^<]+)<\/span>/.exec(aside);
      return { body: aside, groups: h ? [apos(h[1])] : [], via: "app/index.html" };
    }
    const needle = e.where === "guard" ? `"${e.sel.slice(1)}"` : `"${e.sel.replace(/^[.#]/, "")}"`;
    const at = acStudio.indexOf(needle);
    if (at < 0) return null;
    const fn = fnAt(at);
    if (!fn) return null;
    // The jump link's group is the inspector SECTION it is appended to, not a library header.
    if (e.where === "guard") {
      const sec = [...fn.body.slice(0, fn.body.indexOf(needle)).matchAll(/section\(body, "([^"]+)"/g)].pop();
      return { body: fn.body, groups: sec ? [apos(sec[1])] : [], via: `${fn.name}()` };
    }
    let groups = nmOf(fn.body), via = `${fn.name}()`;
    if (!groups.length) {
      // One caller level: a per-card renderer takes its group from the builder that calls it.
      for (const c of acStudio.matchAll(new RegExp(`\\b${fn.name}\\(`, "g"))) {
        const up = fnAt(c.index);
        if (!up || up.name === fn.name) continue;
        const g = nmOf(up.body);
        if (g.length) { groups = g; via = `${fn.name}() ← ${up.name}()`; break; }
      }
    }
    return { body: fn.body, groups, via };
  };
  const prints = (body, label) => new RegExp(`(?:["']\\s*|>\\s*)${esc(label)}(?![\\w-])`).test(body);
  const acBuilt = new Map(AUTHORING.map((e) => [e.sel, buildsIt(e)]));
  const acLive = AUTHORING.filter((e) => acBuilt.get(e.sel));

  // ── Help's two anchors.
  const acFlat = (s) => apos(s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " "));
  const acBold = (h) => [...h.matchAll(/<strong>([\s\S]*?)<\/strong>/g)].map((m) => acFlat(m[1]));
  const hidesAt = help.indexOf('<li id="simple-hides">');
  const keepsAt = help.indexOf('<p id="simple-keeps">');
  const hidesBlock = hidesAt >= 0 && keepsAt > hidesAt ? help.slice(hidesAt, keepsAt) : "";
  const keepsBlock = keepsAt >= 0 ? help.slice(keepsAt, help.indexOf("</p>", keepsAt)) : "";
  const hidesBullets = (() => {
    const u = hidesBlock.indexOf("<ul>");
    if (u < 0) return [];
    return [...hidesBlock.slice(u, hidesBlock.indexOf("</ul>", u)).matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  })();

  // (a) the premise — and the table's own honesty. The labels below are hand-written, so they
  // are the half most able to go stale: a control relabelled in the app would otherwise leave
  // rules (c)/(d) happily holding Help to a word nothing prints any more.
  const acGuarded = /if \(p\.chart\.da && !S\.simpleMode\)/.test(acStudio);
  const acMisdeclared = AUTHORING.filter((e) => (e.where === "guard" ? !acGuarded : !acHidden.has(e.sel)));
  const acMislabelled = acLive.filter((e) => !e.labels.every((l) => prints(acBuilt.get(e.sel).body, l)));
  ok(`app/studio.css: Simple mode's ${AUTHORING.length} authoring controls parsed for check 60 ` +
    `(${acHidden.size} selector(s) hidden in all)`,
    acHidden.size >= 5 && !acMisdeclared.length && !acMislabelled.length &&
      hidesBlock.length > 0 && keepsBlock.length > 0,
    `in the table but not hidden by the app: ${acMisdeclared.map((e) => e.sel).join(", ") || "(none)"}\n      ` +
    `in the table under a name the app no longer prints: ` +
    `${acMislabelled.map((e) => `${e.sel} (${e.labels.join(" / ")})`).join(", ") || "(none)"}\n      ` +
    `hidden: ${[...acHidden].join(", ")}\n      ` +
    `<li id="simple-hides"> found: ${hidesBlock.length > 0} · <p id="simple-keeps"> found: ${keepsBlock.length > 0}\n      ` +
    "the other five rules read these — a renamed selector or control must fail here rather than let them pass over nothing");

  // (b) the table covers the CSS both ways.
  const acUnclaimed = [...acHidden].filter((s) => !NOT_AUTHORING[s] && !AUTHORING.some((e) => e.sel === s));
  ok("app/studio.css: every selector Simple mode hides is either an authoring control this check holds or another check's",
    !acUnclaimed.length,
    `hidden but claimed by nothing: ${acUnclaimed.join(", ") || "(none)"}\n      ` +
    `held elsewhere: ${Object.entries(NOT_AUTHORING).map(([s, c]) => `${s} (${c})`).join(", ")}\n      ` +
    "a control that starts vanishing in Simple mode and is documented nowhere reads as a bug, not as a mode");

  // (c) live vs dead — nothing published that the app does not render.
  const acDead = AUTHORING.filter((e) => !acBuilt.get(e.sel));
  const acLegal = new Set(acLive.flatMap((e) => [...e.labels, ...(acBuilt.get(e.sel).groups || [])].map(apos)));
  const acInvented = acBold(hidesBlock).filter((b) => !acLegal.has(b));
  ok(`docs/index.html: every name the hidden-controls list bolds is one the app prints (${acLive.length} live control(s), ${acDead.length} dead)`,
    !acInvented.length,
    `bolded but not a label or group the app renders: ${acInvented.join(", ") || "(none)"}\n      ` +
    `dead selectors (hidden by CSS, built by nothing): ${acDead.map((e) => e.sel).join(", ") || "(none)"}\n      ` +
    `the app prints: ${[...acLegal].join(" · ")}`);

  // (d) each live control is published WITH the group a reader finds it on.
  const acUnpublished = acLive.filter((e) => {
    const groups = acBuilt.get(e.sel).groups.map(apos);
    return !hidesBullets.some((li) => {
      const bold = acBold(li);
      return e.labels.every((l) => bold.includes(apos(l))) && groups.some((g) => bold.includes(g));
    });
  });
  ok(`docs/index.html: all ${acLive.length} controls Simple mode hides are published with the group they sit on`,
    !acUnpublished.length && hidesBullets.length >= acLive.length,
    `not published as a control + its group: ${acUnpublished.map((e) => `${e.sel} (${(acBuilt.get(e.sel).groups[0] || "?")}: ${e.labels.join(" / ")})`).join(" · ") || "(none)"}\n      ` +
    `measured: ${acLive.map((e) => `${e.sel} → ${acBuilt.get(e.sel).via} → "${acBuilt.get(e.sel).groups.join('", "')}"`).join("\n        ")}\n      ` +
    `bullets: ${hidesBullets.length}\n      ` +
    "two groups collapsed into one phrase is how the add button came to be documented on the wrong one");

  // (e) the count word.
  const AC_NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const acClaims = [...acFlat(hidesBlock).matchAll(/\b(\d+|[a-z]+)\s+authoring\s+controls?\b/gi)]
    .filter((m) => /^\d+$/.test(m[1]) || AC_NUM.includes(m[1].toLowerCase()));
  const acWordOk = (w) => /^\d+$/.test(w) ? Number(w) === acLive.length : AC_NUM.indexOf(w.toLowerCase()) === acLive.length;
  ok(`docs/index.html: every "<n> authoring controls" claim reads ${acLive.length}`,
    acClaims.length >= 1 && acClaims.every((m) => acWordOk(m[1])),
    `claims: ${acClaims.map((m) => `"${m[0]}"`).join(", ") || "(none — the list publishes no count)"}` +
    ` — the app hides ${acLive.length}`);

  // (f) the other direction: the catalog pages keep theirs, and the page says so.
  const repoFn = (() => {
    const at = acStudio.indexOf("\n  function renderRepository()");
    return at < 0 ? "" : searchBlockAt(acStudio, acStudio.indexOf("{", acStudio.indexOf("(", at)), "{", "}");
  })();
  // A class token, not a prefix: `.repo-folder-add` ships as `class="wb-add repo-folder-add"`.
  const repoBuilt = REPO_KEEPS.filter((r) => new RegExp(`["'\\s]${esc(r.cls)}(?=["'\\s])`).test(repoFn));
  const repoHiddenNow = REPO_KEEPS.filter((r) => acHidden.has("." + r.cls));
  const keepsBold = acBold(keepsBlock);
  const repoUnsaid = repoBuilt.filter((r) => r.label && !keepsBold.includes(apos(r.label)));
  ok(`docs/index.html: the Repository page's ${repoBuilt.length} authoring controls are hidden by nothing, and the page says so`,
    repoBuilt.length === REPO_KEEPS.length && !repoHiddenNow.length && keepsBlock.length > 0 &&
      !repoUnsaid.length && /Repository/.test(keepsBold.join(" ")),
    `rendered by renderRepository(): ${repoBuilt.map((r) => r.cls).join(", ") || "(none)"}\n      ` +
    `now hidden in Simple mode: ${repoHiddenNow.map((r) => r.cls).join(", ") || "(none)"}\n      ` +
    `named in the page's own sentence: ${keepsBold.join(" · ") || "(none)"}` +
    (repoUnsaid.length ? `\n      unpublished: ${repoUnsaid.map((r) => r.label).join(", ")}` : "") + "\n      " +
    "Help told a Simple-mode reader that catalog authoring was locked down while every one of these stayed live");
}

/* ── Check 61 — the command palette: the families it prints, and the labels Help QUOTES.
   The ⌘K palette is one registry with two published descriptions, and Help's was the stale
   copy in both halves. It quoted an `"Add View: <chart type>"` command the app has never
   printed — the label is `"Add panel: " + label`, and LF52's widget→View sweep renamed the
   PAGE's quote (from an equally wrong "Add widget:") while the app's own string was never a
   widget to begin with — so the one thing the paragraph told you to type found nothing. And
   it published four of the palette's fourteen family tags, silently dropping Data, Present,
   Manage and Learn, the last of which is the family every tour's "⌘K → Interactive tutorial"
   route (check 13) lands in.
   The source of truth is app/palette.js: the static COMMANDS array is EVALUATED rather than
   regexed (its `run` bodies only dereference their helpers when called, so the literal stands
   alone), and the four builders that mint commands from live state give up their label prefix
   and their family word from the object literal each returns. Rule (e) then PROBES
   Studio.catalogSearch — check 55's idiom — with the very string the page prints, because
   "type part of its name" is a promise a quoted label either keeps or does not. */
{
  const pal = read("app/palette.js");

  const staticCmds = (() => {
    const at = pal.indexOf("var COMMANDS = [");
    if (at < 0) return null;
    try {
      const arr = new Function("return " + searchBlockAt(pal, pal.indexOf("[", at), "[", "]") + ";")();
      return Array.isArray(arr) && arr.every((c) => c && typeof c.label === "string" &&
        typeof c.hint === "string" && typeof c.kw === "string") ? arr : null;
    } catch { return null; }
  })();

  // The builders that mint commands from live state. `label` is a fixed prefix (the rail's
  // also carries one exact label) plus the thing's own name; `hint` is the family word the
  // row prints on the right. Both are read out of the object literal the builder returns.
  const DYN = ["navCommands", "exampleCommands", "recentCommands", "chartTypeCommands"];
  const palStrs = (s) => [...(s || "").matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
  const dyn = DYN.map((name) => {
    const at = pal.indexOf("function " + name + "(");
    const body = at < 0 ? "" : searchBlockAt(pal, pal.indexOf("{", pal.indexOf(")", at)), "{", "}");
    return {
      name, body,
      labels: palStrs((body.match(/label:([\s\S]*?),\s*hint:/) || [])[1]),
      hints: palStrs((body.match(/hint:([\s\S]*?),\s*kw:/) || [])[1]),
    };
  });
  const palFamilies = staticCmds
    ? [...new Set([...staticCmds.map((c) => c.hint), ...dyn.flatMap((d) => d.hints)])]
    : [];
  // Every published form of a label: a static command's exact label, or a builder's prefix.
  const palForms = staticCmds
    ? [
      ...staticCmds.map((c) => ({ form: c.label, exact: true, hay: [c.label, c.hint, c.kw] })),
      ...dyn.flatMap((d) => d.labels.map((l) => ({ form: l, exact: false, hay: [l, ...d.hints] }))),
    ]
    : [];

  // ── Help's three anchors. `dec` finishes what htmlText starts: the page writes a label's
  // placeholder as an entity, and a reader sees the angle brackets.
  const palP = (id) => {
    const at = help.indexOf(`<p id="${id}">`);
    return at < 0 ? "" : help.slice(at, help.indexOf("</p>", at) + 4);
  };
  const dec = (s) => apos(htmlText(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  const palBold = (h) => [...h.matchAll(/<strong>([\s\S]*?)<\/strong>/g)].map((m) => dec(m[1]));
  const famHtml = palP("cmdk-families"), labHtml = palP("cmdk-labels"), rankHtml = palP("cmdk-rank");
  const famText = dec(famHtml), rankText = dec(rankHtml);

  // (a) the premise. Everything below reads these, so a registry that stops parsing — or a
  // paragraph that loses its id — must fail HERE rather than let five rules pass over nothing.
  const palPremise = ok(`app/palette.js: the command palette's registry parsed for check 61 ` +
    `(${staticCmds ? staticCmds.length : 0} static command(s), ${dyn.filter((d) => d.labels.length).length} ` +
    `builder(s) of live commands, ${palFamilies.length} family tag(s))`,
    !!staticCmds && staticCmds.length >= 20 && palFamilies.length >= 10 && !!searchKit &&
      dyn.every((d) => d.labels.length >= 1 && d.hints.length >= 1) &&
      !!famHtml && !!labHtml && !!rankHtml,
    `static array evaluated: ${!!staticCmds} · kit evaluable: ${!!searchKit}\n      ` +
    `builders: ${dyn.map((d) => `${d.name} → ${d.labels.map((l) => `"${l}"`).join(" / ") || "(none)"} ` +
      `[${d.hints.join(" / ") || "(none)"}]`).join("\n        ")}\n      ` +
    `families: ${palFamilies.join(", ") || "(none)"}\n      ` +
    `anchors — #cmdk-families: ${!!famHtml} · #cmdk-labels: ${!!labHtml} · #cmdk-rank: ${!!rankHtml}`);

  if (palPremise) {
    const famBold = palBold(famHtml);

    // (b) every family the palette prints is published, and the count word agrees.
    const PAL_NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
      "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen"];
    const famMissing = palFamilies.filter((f) => !famBold.includes(f));
    const famCounts = [...famText.matchAll(/\b(\d+|[a-z]+)\s+of\s+them\b/gi)]
      .filter((m) => /^\d+$/.test(m[1]) || PAL_NUM.includes(m[1].toLowerCase()));
    const famCountOk = (w) => (/^\d+$/.test(w) ? Number(w) : PAL_NUM.indexOf(w.toLowerCase())) === palFamilies.length;
    ok(`docs/index.html: all ${palFamilies.length} family tags the palette prints are published, and the count word says so`,
      !famMissing.length && famCounts.length >= 1 && famCounts.every((m) => famCountOk(m[1])),
      `unpublished: ${famMissing.join(", ") || "(none)"}\n      ` +
      `count claim(s): ${famCounts.map((m) => `"${m[0]}"`).join(", ") || "(none — the paragraph publishes no count)"}\n      ` +
      `the palette prints: ${palFamilies.join(" · ")}\n      ` +
      "four families went unmentioned for months, Learn among them — the one every tour's \"⌘K → Interactive tutorial\" lands in");

    // (c) and it invents none: a family word that is not a hint sends a reader looking for a
    // tag no row carries.
    const famInvented = famBold.filter((b) => !palFamilies.includes(b));
    ok("docs/index.html: the families paragraph bolds no tag the palette does not print",
      !famInvented.length,
      `bolded but not a family: ${famInvented.join(", ") || "(none)"}\n      ` +
      `real families: ${palFamilies.join(" · ")}`);

    // (d) every label the page QUOTES is one the app really prints — exactly, for a fixed
    // command, or as the prefix a builder puts in front of the thing's own name.
    const labQuoted = palBold(labHtml).filter((b) => /^".*"$/.test(b)).map((b) => b.slice(1, -1));
    const labResolve = (q) => {
      const bare = q.replace(/<[^>]*>/g, "");
      return palForms.find((f) => (f.exact ? apos(f.form) === bare.trim() : apos(f.form) === bare)) ||
        palForms.find((f) => !f.exact && apos(f.form).trim() === bare.trim());
    };
    const labBogus = labQuoted.filter((q) => !labResolve(q));
    ok(`docs/index.html: every command label the page quotes is one the palette prints (${labQuoted.length} quoted)`,
      labQuoted.length >= 4 && !labBogus.length,
      `quoted but never printed: ${labBogus.map((q) => `"${q}"`).join(", ") || "(none)"}\n      ` +
      `quoted: ${labQuoted.map((q) => `"${q}"`).join(" · ") || "(none)"}\n      ` +
      `the builders print: ${dyn.flatMap((d) => d.labels).map((l) => `"${l}"`).join(" · ")}\n      ` +
      "the page quoted \"Add View: <chart type>\" while the app printed \"Add panel: \" — a rename that swept the doc and missed nothing in the app");

    // (e) the probe, and the rule that would have caught it: the page says "type part of its
    // name", so every label it quotes must FIND its own command through the palette's matcher.
    const labUnfindable = labQuoted.filter((q) => {
      const f = labResolve(q);
      const query = q.replace(/<[^>]*>/g, "").trim();
      return !f || !query || !kitFinds(query, f.hay);
    });
    ok("docs/index.html: typing a quoted label into the palette finds the command it names — probed on Studio.catalogSearch",
      !labUnfindable.length,
      `finds nothing: ${labUnfindable.map((q) => `"${q}"`).join(", ") || "(none)"}\n      ` +
      `probed: ${labQuoted.map((q) => `"${q.replace(/<[^>]*>/g, "").trim()}"`).join(" · ")}\n      ` +
      "a label the page prints that the palette's own search cannot find is worse than no label at all");

    // (f) the Section family is the rail's, filtered by what the account may open — the half
    // of the old paragraph that was RIGHT, kept and now derived rather than asserted.
    const navBody = dyn[0].body;
    const navFromRail = /__studioRailSections/.test(navBody) && /\.visible/.test(navBody);
    ok("app/palette.js + docs/index.html: the rail builds the Go-to commands and filters them by visibility, and the page says both",
      navFromRail && /built from the rail/i.test(famText) && /missing from the palette/i.test(famText),
      `navCommands() reads the rail: ${/__studioRailSections/.test(navBody)} · filters on .visible: ${/\.visible/.test(navBody)}\n      ` +
      `the page says it is built from the rail: ${/built from the rail/i.test(famText)} · ` +
      `that a section you cannot reach is absent: ${/missing from the palette/i.test(famText)}\n      ` +
      "drop the filter and the palette navigates into a section the account was told it does not have");

    // (g) the ranking, which the page had backwards: recency alone on an empty open, frequency
    // only as a tie-break once you type.
    const refAt = pal.indexOf("function refresh()");
    const refBody = refAt < 0 ? "" : searchBlockAt(pal, pal.indexOf("{", pal.indexOf(")", refAt)), "{", "}");
    const elseAt = refBody.indexOf("} else {");
    const emptyArm = elseAt > 0 ? refBody.slice(refBody.indexOf("if (!q)"), elseAt) : "";
    const typedArm = elseAt > 0 ? refBody.slice(elseAt) : "";
    const rankHolds = !!emptyArm && /\.last/.test(emptyArm) && !/\.count/.test(emptyArm) && /\.count/.test(typedArm);
    const rankSaid = /recency alone/i.test(rankText) && /only once you start typing/i.test(rankText) &&
      /(tie-breaker|breaks ties|equally well)/i.test(rankText);
    ok("app/palette.js + docs/index.html: an empty open ranks by recency alone and frequency only breaks ties on a typed query, and the page says which is which",
      rankHolds && rankSaid,
      `empty-query arm sorts on .last: ${/\.last/.test(emptyArm)} · reads .count: ${/\.count/.test(emptyArm)}` +
      ` · typed arm reads .count: ${/\.count/.test(typedArm)}\n      ` +
      `the page states recency alone: ${/recency alone/i.test(rankText)} · frequency only on typing: ` +
      `${/only once you start typing/i.test(rankText)} · as a tie-break: ${/(tie-breaker|breaks ties|equally well)/i.test(rankText)}\n      ` +
      "the page credited the empty open with frequency it has never used, and said nothing about the ranking you actually see when you type");
  }
}

/* ── 62. the NAME on a Help chart card vs the name the picker prints ─────────
   Check 2 (the oldest check in this file) holds Help's chart cards to the registry's
   KEYS — every type has a card, no card invents a type. Nothing has ever held the
   NAME printed on the card, and seven of the fifty-five had drifted away from the
   picker's own label: "Parallel coordinates" (picker: "Parallel coords"), "Bar + line
   (combo)" ("Bar + line"), "Lollipop" ("Lollipop chart"), "Dumbbell" ("Dumbbell
   chart"), "Bump / ranking" ("Bump chart"), "Marimekko / Mekko" ("Marimekko") and
   "Ridgeline / joy plot" ("Ridgeline plot").

   That is not a synonyms quibble, because the app WIRES the two together three ways:
   every gallery card carries an ⓘ link to `docs/index.html#ct-<type>` titled
   "Docs: <label>" (app/studio.js), so a reader clicks "Docs: Parallel coords" and
   lands on a card headed "Parallel coordinates"; the gallery's own search box matches
   label + desc through Studio.catalogSearch, so a name Help publishes that the picker
   never prints finds NOTHING when typed in; and the Views catalog's chart-type filter
   pills print the same label (app/views.js `vwChartLabel`). Help even says so itself,
   in the facets chapter: the pills print "the chart's own name from the gallery" — a
   sentence that was true of the app and false of this page for seven types.

   The rules below are the check-38→40 idiom (a picker's roster holds the page that
   documents it), with check 61's probe: a published name must be FINDABLE, not merely
   spelled right. `ct-kpi` is the one documented extra, exactly as check 2 has it — the
   KPI tile is a panel kind, not a Studio.CHARTS entry — so rule (a) walks the registry
   and never reaches it.

   ADOPTED, NOT RIVALLED — two neighbouring derivations already exist and this check
   deliberately adds neither. Check 50 holds every card to the GROUP the picker files
   it under (both directions, plus the picker's own grouping as its premise), and check
   45(d) holds the facets chapter's volunteered chart names to the registry, reading
   the kpi exception out of `vwChartLabel` itself. Between them the shelf and the pill
   were covered; the NAME on the card was the gap. */
{
  // The registry, entry by entry: the label the picker prints, and the desc it prints
  // beneath it — the other half of the haystack the gallery's search box matches on.
  const chartEntries = (() => {
    const src = read("app/model.js");
    const at = src.indexOf("Studio.CHARTS = {");
    if (at < 0) return [];
    const block = searchBlockAt(src, src.indexOf("{", at), "{", "}");
    const marks = [...block.matchAll(/\n {4}([A-Za-z_]\w*): \{/g)];
    return marks.map((m, i) => {
      const seg = block.slice(m.index, i + 1 < marks.length ? marks[i + 1].index : block.length);
      return {
        key: m[1],
        // `label:  "…"` (two spaces) is as common in this file as one — match on the
        // 6-space entry-level indent, not on the spacing after the colon.
        label: (seg.match(/\n {6}label:\s*"([^"]+)"/) || [])[1] || "",
        desc: (seg.match(/\n {6}desc:\s*"([^"]*)"/) || [])[1] || ""
      };
    });
  })();

  // Help's chart chapter, card by card. The empty `.chart-group` div is part of the
  // shape (the page styles it), so matching it keeps a stray `chart-name` elsewhere on
  // the page out of the set.
  const helpCards = [...help.matchAll(
    /id="ct-([A-Za-z0-9]+)"><div class="chart-group"><\/div><div class="chart-name">([^<]*)<\/div>/g)]
    .map((m) => ({ key: m[1], name: m[2].trim() }));
  const cardByKey = Object.fromEntries(helpCards.map((c) => [c.key, c]));

  // The wiring that makes a card name a promise rather than a caption: the gallery
  // prints c.label into .lb, and links each card at this page's own per-type anchor.
  const galleryJs = read("app/studio.js");
  const galleryPrintsLabel = /<div class="lb">' \+ c\.label \+ '<\/div>/.test(galleryJs);
  const galleryLinksHere = /docs\/index\.html#ct-" \+ t/.test(galleryJs);

  const introPara = (help.match(/<p>\d+ chart types are available[\s\S]*?<\/p>/) || [""])[0];

  const premise = ok("app/model.js + docs/index.html: the chart registry and Help's chart cards both parse, and the gallery still links each card here by its own label — the premise the rules below measure against",
    chartEntries.length > 40 && chartEntries.every((e) => e.label && e.desc) &&
    helpCards.length === chartEntries.length + 1 && galleryPrintsLabel && galleryLinksHere && !!searchKit,
    `registry entries: ${chartEntries.length} (all with a label and a desc: ${chartEntries.every((e) => e.label && e.desc)}) · ` +
    `Help cards parsed: ${helpCards.length}, expected ${chartEntries.length + 1} (the types plus the documented ct-kpi)\n      ` +
    `the gallery prints c.label into .lb: ${galleryPrintsLabel} · links docs/index.html#ct-<type>: ${galleryLinksHere} · ` +
    `search kit evaluable: ${!!searchKit}\n      ` +
    "if the card grid or the registry stops parsing in this shape these rules must fail, not pass over nothing");

  if (premise) {
    // (a) the name a reader arrives at is the name they clicked. Exact, not a
    //     superset: the ⓘ link's own title IS the picker's label.
    const misnamed = chartEntries.filter((e) => cardByKey[e.key] && cardByKey[e.key].name !== e.label);
    ok(`docs/index.html: every chart card is titled with the label the picker prints (${chartEntries.length} types)`,
      !misnamed.length,
      misnamed.map((e) => `ct-${e.key}: card "${cardByKey[e.key].name}" vs picker "${e.label}"`).join("\n      ") ||
      "(none)");

    // (b) the negative half — a card must not wear ANOTHER type's name. A rename that
    //     swaps two labels satisfies (a) for neither and this rule for both, which is
    //     the failure a coverage-only rule reads straight past.
    const labelOwner = new Map(chartEntries.map((e) => [e.label, e.key]));
    const stolen = helpCards.filter((c) => labelOwner.has(c.name) && labelOwner.get(c.name) !== c.key);
    ok("docs/index.html: no chart card wears a different chart type's name",
      !stolen.length,
      stolen.map((c) => `ct-${c.key} is titled "${c.name}", which is ${labelOwner.get(c.name)}'s label`).join("\n      ") ||
      "(none)");

    // (c) the probe (check 61's idiom): the intro tells the reader a name here can be
    //     typed into the gallery's search box, so run it. Names carrying an editorial
    //     "A / B" alias are probed on each alternative — the registry uses that idiom
    //     itself ("Line / area"), and half a findable name is still a dead end.
    const unfindable = [];
    for (const e of chartEntries) {
      const c = cardByKey[e.key]; if (!c) continue;
      for (const alt of [c.name, ...c.name.split("/")].map((s) => s.trim()).filter(Boolean)) {
        if (!kitFinds(alt, [e.label, e.desc])) unfindable.push(`ct-${e.key}: "${alt}" finds nothing (the picker prints "${e.label}" / "${e.desc}")`);
      }
    }
    ok("docs/index.html: typing a chart card's name into the gallery's search box finds that chart — probed on Studio.catalogSearch",
      !unfindable.length,
      [...new Set(unfindable)].join("\n      ") || "(none)");

    // (d) the promise itself. Without it (a)-(c) hold a caption nobody was told to
    //     trust — the intro has to state that these ARE the picker's names, and name
    //     the three places the app spends them, or the rules above are a private
    //     convention rather than something a reader can rely on.
    const introSays = /the name the picker itself prints/i.test(introPara) &&
      /ⓘ/.test(introPara) && /filter pill/i.test(introPara) && /Search chart types/i.test(introPara);
    ok("docs/index.html: the chart chapter states that its card titles are the picker's own names",
      introSays && !!cardByKey.kpi,
      `intro paragraph states it — picker: ${/the name the picker itself prints/i.test(introPara)} · ` +
      `ⓘ docs link: ${/ⓘ/.test(introPara)} · filter pill: ${/filter pill/i.test(introPara)} · ` +
      `search box: ${/Search chart types/i.test(introPara)}\n      ` +
      `ct-kpi (the documented extra check 2 carves out) present: ${!!cardByKey.kpi}\n      ` +
      `intro: ${htmlText(introPara).slice(0, 220) || "(paragraph not found)"}…`);
  }
}

/* ── Check 63 — the Glossary: "every term, one line each", held to the app's own nouns.
   The page's dictionary chapter was the last one nothing derived, and its title makes the
   strongest promise on the site. Measured: it defined ten terms and OMITTED three the app
   renders as first-class — **Repository** (a Workspace-group rail section, and the page every
   other chapter sends you to for folders), **Dashboard Builder** (the only one of the rail's
   three builders the chapter never named, while Quick Views and the View Builder both got a
   clause), and **Folder** (the noun the ORGANIZE program turns on, printed by every catalog,
   by the Repository's own tree, and by the `+ New folder` button). Two more were added in the
   same pass on the page's own evidence rather than a rule — **Data access** and **Ensemble**,
   each of which owns a Help `<h2>` and a bolded defining sentence there, so the chapter was
   sending readers to words its dictionary did not carry.
   The sources of truth are all in `app/`: the rail's own IA comment groups its sections into
   Workspace ("the things you HAVE") and Build ("the places you MAKE them"), so the group
   labels and the `aria-label`s beneath them are parsed straight out of `app/index.html`;
   `REPO_TYPES` in `app/studio.js` is EVALUATED (a plain literal) for the five object kinds;
   and the two organizer nouns are read off the creation buttons that print them. Rule (g)
   closes the loop in the other direction — a term defined here has to be one the page itself
   spends elsewhere, so the dictionary cannot grow words the documentation never uses. */
{
  const railSrc = read("app/index.html");
  const studioSrc = read("app/studio.js");

  // ── the rail, by group. Walk the markup once: a group label opens a group, every
  // rail-item button after it belongs to that group until the next label.
  const railGroups = (() => {
    const out = new Map();
    let cur = null;
    const re = /<div class="rail-group-lbl[^"]*"[^>]*>([^<]+)<\/div>|<button[^>]*\bdata-sec="[a-z]+"[^>]*\baria-label="([^"]+)"/g;
    for (const m of railSrc.matchAll(re)) {
      if (m[1] != null) { cur = htmlText(m[1]); if (!out.has(cur)) out.set(cur, []); }
      else if (cur) out.get(cur).push(m[2]);
    }
    return out;
  })();
  const workspaceSecs = railGroups.get("Workspace") || [];
  const buildSecs = railGroups.get("Build") || [];

  // ── the five workspace object kinds. A plain literal, so evaluate it rather than regex it.
  const repoTypes = (() => {
    const at = studioSrc.indexOf("var REPO_TYPES = [");
    if (at < 0) return null;
    try {
      const arr = new Function("return " + searchBlockAt(studioSrc, studioSrc.indexOf("[", at), "[", "]") + ";")();
      return Array.isArray(arr) && arr.every((t) => t && typeof t.singular === "string" &&
        typeof t.label === "string") ? arr : null;
    } catch { return null; }
  })();

  // ── the two organizers, read off the buttons that mint them: "+ Workbook" and
  //    "+ New folder". The noun is what survives stripping the "+ New " / "+ " prefix.
  const btnNoun = (id) => {
    const m = studioSrc.match(new RegExp('id="' + id + '"[^>]*>\\s*\\+\\s*(?:New\\s+)?([A-Za-z ]+?)\\s*<'));
    return m ? m[1].trim() : "";
  };
  const organizers = [btnNoun("wbAddBtn"), btnNoun("repoNewFolderBtn")].filter(Boolean);

  // ── the chapter itself.
  const glosAt = help.indexOf('<section id="glossary">');
  const glosHtml = glosAt < 0 ? "" : help.slice(glosAt, help.indexOf("</section>", glosAt) + 10);
  const glosItems = [...glosHtml.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  // The TERM is the first <strong> of the line; the rest is its one-line definition. A body
  // may bold a cross-reference (Repository's "+ New folder" does) — only the head is the term.
  const glosEntries = glosItems.map((li) => {
    const m = li.match(/^\s*<strong>([\s\S]*?)<\/strong>\s*—\s*([\s\S]+)$/);
    return m ? { term: htmlText(m[1]), def: htmlText(m[2]), raw: li } : null;
  });
  const glosTerms = glosEntries.filter(Boolean).map((e) => e.term);
  // The naming rules read the ENTRY LIST only, never the promise paragraph above it — the
  // paragraph names Repository and Build to state the contract, and letting that count would
  // make rules (c)/(d) satisfiable by the sentence that announces them.
  const glosText = htmlText(glosItems.join(" "));
  const promiseAt = glosHtml.indexOf('<p id="glossary-promise">');
  const promise = promiseAt < 0 ? "" : htmlText(glosHtml.slice(promiseAt, glosHtml.indexOf("</p>", promiseAt)));

  // A term "names" a thing when the chapter's prose contains it, singular or plural.
  const glosNames = (s) => {
    const forms = [s, s.replace(/ies$/, "y"), s.replace(/s$/, ""), s + "s"];
    return forms.some((f) => f && new RegExp("\\b" + f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(glosText));
  };
  const hasEntry = (s) => glosTerms.some((t) => {
    const head = t.replace(/\s*\([^)]*\)\s*$/, "");   // "Data access (DA)" → "Data access"
    return head.toLowerCase() === s.toLowerCase() || head.toLowerCase() === s.toLowerCase() + "s" ||
      head.toLowerCase() + "s" === s.toLowerCase();
  });

  // (a) the premise. Six rules read these; a chapter that stops parsing, a rail whose groups
  // lose their labels, or a registry that stops evaluating must fail HERE rather than let the
  // rules below pass over nothing. It also holds the title's OTHER half — "one line each"
  // means one <li> per term, so a nested list inside an entry is itself the failure.
  const nested = glosItems.filter((li) => /<ul|<ol|<br/i.test(li));
  const unparsed = glosEntries.map((e, i) => (e ? null : i)).filter((i) => i !== null);
  const glosPremise = ok(`docs/index.html: the Glossary parsed for check 63 ` +
    `(${glosTerms.length} term(s), ${workspaceSecs.length} Workspace + ${buildSecs.length} Build rail section(s), ` +
    `${repoTypes ? repoTypes.length : 0} object kind(s), ${organizers.length} organizer(s))`,
    glosTerms.length >= 10 && !unparsed.length && !nested.length && !!promise &&
      workspaceSecs.length >= 5 && buildSecs.length >= 3 && !!repoTypes && repoTypes.length >= 5 &&
      organizers.length === 2,
    `entries that are not "<strong>Term</strong> — one line": ${unparsed.length ? unparsed.join(", ") : "(none)"}\n      ` +
    `entries carrying a nested list or <br>: ${nested.length}\n      ` +
    `Workspace group: ${workspaceSecs.join(" · ") || "(none)"}\n      ` +
    `Build group: ${buildSecs.join(" · ") || "(none)"}\n      ` +
    `REPO_TYPES evaluated: ${!!repoTypes} · organizers: ${organizers.join(" / ") || "(none)"}\n      ` +
    `#glossary-promise present: ${!!promise}`);

  if (glosPremise) {
    // (b) every kind of thing the workspace stores gets its OWN entry — the five REPO_TYPES
    // singulars. These are the nouns the whole app is made of; a dictionary that misses one
    // is not a dictionary.
    const kindsMissing = repoTypes.map((t) => t.singular).filter((s) => !hasEntry(s));
    ok(`docs/index.html: the Glossary defines all ${repoTypes.length} workspace object kinds by their own name`,
      !kindsMissing.length,
      `undefined: ${kindsMissing.join(", ") || "(none)"}\n      ` +
      `REPO_TYPES prints: ${repoTypes.map((t) => t.singular).join(" · ")}\n      ` +
      `the Glossary defines: ${glosTerms.join(" · ")}`);

    // (c) the rail's Workspace group — "the things you HAVE", per the rail's own IA comment.
    // Repository was the miss: the section every other chapter routes folder work through.
    const wsMissing = workspaceSecs.filter((s) => !glosNames(s));
    ok(`docs/index.html: the Glossary names every Workspace section on the rail (${workspaceSecs.length})`,
      !wsMissing.length,
      `unnamed: ${wsMissing.join(", ") || "(none)"}\n      ` +
      `the rail's Workspace group: ${workspaceSecs.join(" · ")}\n      ` +
      "Repository went unnamed while three other chapters sent the reader to it by name");

    // (d) the rail's Build group — "the places you MAKE them". The chapter gave Quick Views
    // and the View Builder a clause each and left the Dashboard Builder out of its own app.
    const buildMissing = buildSecs.filter((s) => !glosNames(s));
    ok(`docs/index.html: the Glossary names all ${buildSecs.length} builders on the rail`,
      !buildMissing.length,
      `unnamed: ${buildMissing.join(", ") || "(none)"}\n      ` +
      `the rail's Build group: ${buildSecs.join(" · ")}`);

    // (e) the two organizers, each with its own entry — read off the buttons that create them,
    // so renaming "+ New folder" in the app moves this rule with it.
    const orgMissing = organizers.filter((n) => !hasEntry(n));
    ok(`docs/index.html: the Glossary defines both filing nouns the app's own buttons print (${organizers.join(", ")})`,
      !orgMissing.length,
      `undefined: ${orgMissing.join(", ") || "(none)"}\n      ` +
      "Folder is the noun the ORGANIZE program turns on — every catalog prints it and the dictionary did not");

    // (f) and the promise is stated, so (b)-(e) are something a reader can rely on rather than
    // a private convention — the check-62 move, one chapter over.
    ok("docs/index.html: the Glossary states what it covers and that the names are the app's own",
      /Repository/.test(promise) && /Build/.test(promise) && /filed/i.test(promise) &&
        /one line each/i.test(promise + " " + glosText),
      `promise: ${promise.slice(0, 200) || "(no #glossary-promise paragraph)"}`);

    // (g) the other direction: a term defined here must be one the page itself spends. A
    // dictionary is only useful for the words its own document uses, and this is what would
    // catch a retired noun lingering after a rename (the "analysis"→View sweep's shape).
    const restOfPage = help.slice(0, glosAt) + help.slice(glosAt + glosHtml.length);
    const restBold = new Set([...restOfPage.matchAll(/<strong>([\s\S]*?)<\/strong>/g)]
      .map((m) => htmlText(m[1]).toLowerCase()));
    const unspent = glosTerms.filter((t) => {
      const head = t.replace(/\s*\([^)]*\)\s*$/, "").toLowerCase();
      return ![head, head + "s", head.replace(/s$/, "")].some((f) =>
        restBold.has(f) || new RegExp("<strong>[^<]*\\b" + f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(restOfPage));
    });
    ok(`docs/index.html: every Glossary term is a word the rest of the page actually bolds (${glosTerms.length} checked)`,
      !unspent.length,
      `defined but never used elsewhere on the page: ${unspent.join(", ") || "(none)"}\n      ` +
      "a glossary entry for a word the docs never say is a rename that only half landed");
  }
}

/* ── Check 64 — "Ensembles & scientific honesty": the chapter that argues the app's honesty
   case, held to the two registries it argues about. It was the last `<h2>` nothing derived,
   and the drift ran straight through its thesis. The chapter said the combined value IS "the
   median" — unconditionally, five times — while both charts make the combination a SETTING:
   `ensembleSeries.agg` is a select (Median (recommended) / Mean) that `_ensembleSeries` feeds
   to `aggValues` for the bold line, and `choropleth.agg` offers six ways (median / mean / sum /
   min / max / last) to turn several rows for one region into one colour. Worse for a reader
   looking for the word: the chart never PRINTS "median" — the legend, the hover tooltip and the
   Download-data rows all print `medianLabel`, whose default is "Common estimate" — so the page
   named the estimate one thing and the product another. The same paragraph stated four display
   behaviours (providers drawn, chips clickable, band drawn, reference series hollow) as facts,
   where each is an inspector option that can be off.
   Sources of truth: `Studio.CHARTS` EVALUATED (the shared `M` model, so labels, choices and
   defaults are exact), plus the renderer's own fallback string — rule (e) holds those two to
   each other as well as to the page, since a fallback that drifted from the registry default
   would make the docs wrong without either file looking wrong alone. Rule (f) uses the
   chapter's own idiom — "the <strong>X</strong> option" — so naming a control that no longer
   exists fails here rather than reading plausibly forever. */
{
  const ens = M.CHARTS.ensembleSeries, choro = M.CHARTS.choropleth;
  const optOf = (c, key) => ((c && c.opts) || []).find((o) => o.key === key) || null;
  const ensAgg = optOf(ens, "agg"), choroAgg = optOf(choro, "agg"), estOpt = optOf(ens, "medianLabel");
  const choiceLabels = (o) => ((o && o.choices) || []).map((c) => c[1]);
  // The renderer's own name for the estimate — the string the legend swatch, the tooltip and
  // the CSV rows fall back to. One expression, spent three times in app/studio-charts.js.
  const rendererFallback = (read("app/studio-charts.js").match(/cfg\.medianLabel \|\| "([^"]+)"/) || [])[1] || "";

  const ensAt = help.indexOf('<section id="ensembles">');
  const ensHtml = ensAt < 0 ? "" : help.slice(ensAt, help.indexOf("</section>", ensAt) + 10);
  const estAt = ensHtml.indexOf('<p id="ensemble-estimate">');
  const estPara = estAt < 0 ? "" : ensHtml.slice(estAt, ensHtml.indexOf("</p>", estAt));
  const estText = htmlText(estPara);
  // `[^<]*` rather than a lazy any: a bolded phrase never nests a tag, and a lazy match would
  // happily run from one paragraph's <strong> to another's </strong> to satisfy the idiom below.
  const boldIn = (html) => [...html.matchAll(/<strong>([^<]*)<\/strong>/g)].map((m) => htmlText(m[1]).trim());
  const estBold = new Set(boldIn(estPara));
  const chapterBold = new Set(boldIn(ensHtml));
  // The chapter's idiom for naming a control: "the <strong>X</strong> option". Only these read
  // as option NAMES — a bolded value (the label's own default, printed a second time) does not.
  const namedOptions = [...ensHtml.matchAll(/<strong>([^<]*)<\/strong>\s*option\b/g)]
    .map((m) => htmlText(m[1]).trim());
  const allOptLabels = new Set([...((ens && ens.opts) || []), ...((choro && choro.opts) || [])].map((o) => o.label));

  // (a) the premise. Five rules dereference these registries and this chapter; an empty
  // chapter, a renamed anchor or a registry that stops evaluating must fail HERE rather than
  // let the coverage rules pass over nothing.
  const ensPremise = ok(`docs/index.html: the Ensembles chapter parsed for check 64 ` +
    `(${choiceLabels(ensAgg).length} estimate choice(s), ${choiceLabels(choroAgg).length} map combine choice(s), ` +
    `${namedOptions.length} option(s) named, ${chapterBold.size} bolded phrase(s))`,
    !!ensHtml && !!estPara && !!ensAgg && !!choroAgg && !!estOpt &&
      choiceLabels(ensAgg).length >= 2 && choiceLabels(choroAgg).length >= 2 &&
      !!estOpt.def && !!rendererFallback && namedOptions.length >= 6,
    `<section id="ensembles"> found: ${!!ensHtml} · <p id="ensemble-estimate"> found: ${!!estPara}\n      ` +
    `ensembleSeries.agg: ${ensAgg ? choiceLabels(ensAgg).join(" / ") : "(missing)"}\n      ` +
    `choropleth.agg: ${choroAgg ? choiceLabels(choroAgg).join(" / ") : "(missing)"}\n      ` +
    `medianLabel default: ${estOpt ? JSON.stringify(estOpt.def) : "(missing)"} · ` +
    `renderer fallback: ${JSON.stringify(rendererFallback)}`);

  if (ensPremise) {
    // (b) the Ensemble chart's own question. Every way it can combine the toggled-on providers
    // is published, by the label the inspector prints, and the control is named AS a control —
    // the half the chapter was missing entirely while asserting one of the two answers.
    const ensMissing = choiceLabels(ensAgg).filter((l) => !estBold.has(l));
    ok(`docs/index.html: all ${choiceLabels(ensAgg).length} ways the Ensemble chart can combine its providers are published, and the control is named`,
      !ensMissing.length && namedOptions.includes(ensAgg.label),
      `unpublished choice(s): ${ensMissing.join(", ") || "(none)"}\n      ` +
      `the inspector offers: ${choiceLabels(ensAgg).join(" · ")}\n      ` +
      `"${ensAgg.label}" named as an option: ${namedOptions.includes(ensAgg.label)}`);

    // (c) the map's, which is the wider one — six answers, and four of them (sum/min/max/last)
    // are not a "common estimate" at all, so a page arguing the median's honesty owes the
    // reader the fact that its own map will happily total the rows instead.
    const choroMissing = choiceLabels(choroAgg).filter((l) => !estBold.has(l));
    ok(`docs/index.html: all ${choiceLabels(choroAgg).length} ways the map can combine duplicate rows are published, and the control is named`,
      !choroMissing.length && namedOptions.includes(choroAgg.label),
      `unpublished choice(s): ${choroMissing.join(", ") || "(none)"}\n      ` +
      `the inspector offers: ${choiceLabels(choroAgg).join(" · ")}\n      ` +
      `"${choroAgg.label}" named as an option: ${namedOptions.includes(choroAgg.label)}`);

    // (d) the negative half, and it is exhaustive by construction rather than by a word list:
    // this paragraph bolds exactly three kinds of thing — an option's label, an option's own
    // default value, and a combination method — so anything bolded here that is not one of the
    // first two has to be a method a chart really offers. A shape rule ("Median|Mean|Sum…")
    // would read straight past an invented method with a new name, which is the likelier drift.
    // Read on the estimate paragraph alone: "Last updated" in the popover list below is a
    // heading, not a method.
    const methods = new Set([...choiceLabels(ensAgg), ...choiceLabels(choroAgg)]);
    const invented = [...estBold].filter((b) => !methods.has(b) && !allOptLabels.has(b) && b !== String(estOpt.def));
    ok("docs/index.html: the estimate paragraph bolds no combination method the charts do not offer",
      !invented.length,
      `bolded but offered by neither chart: ${invented.join(", ") || "(none)"}\n      ` +
      `the two registries offer: ${[...methods].join(" · ")}`);

    // (e) the NAME the reader will actually see. The registry default and the renderer's
    // fallback are held to each other first (a silent split there makes both files look right),
    // then to the page — and the page has to say WHERE the name is spent, because "median" was
    // findable in none of those three places.
    const printed = String(estOpt.def);
    ok(`docs/index.html: the estimate's on-screen name ("${printed}") is published, and the registry and the renderer agree on it`,
      printed === rendererFallback && estBold.has(printed) && namedOptions.includes(estOpt.label) &&
        /legend/i.test(estText) && /tooltip/i.test(estText) && /downloaded data/i.test(estText),
      `registry default: ${JSON.stringify(printed)} · renderer fallback: ${JSON.stringify(rendererFallback)}\n      ` +
      `published in the estimate paragraph: ${estBold.has(printed)} · ` +
      `"${estOpt.label}" named as an option: ${namedOptions.includes(estOpt.label)}\n      ` +
      `names where it is printed — legend: ${/legend/i.test(estText)} · tooltip: ${/tooltip/i.test(estText)} · ` +
      `downloaded data: ${/downloaded data/i.test(estText)}`);

    // (f) the four behaviours the chapter states as facts are each an option that can be off,
    // so each is named by the label the inspector prints for it — derived by KEY, so renaming
    // one in the registry moves this rule with it. The other direction closes the loop: an
    // option name the chapter spends must still exist, which is the `ⓘ Tour` class of drift
    // (check 41 (g), check 44 (f)) one chapter over.
    const governing = ["showBand", "showProviders", "showToggles", "refSeries"]
      .map((k) => optOf(ens, k)).filter(Boolean).map((o) => o.label);
    const unnamed = governing.filter((l) => !namedOptions.includes(l));
    const dead = namedOptions.filter((n) => !allOptLabels.has(n));
    ok(`docs/index.html: every behaviour the chapter states as a fact names the option that governs it (${governing.length}), and every option it names is real`,
      !unnamed.length && !dead.length && governing.length === 4,
      `stated without naming its option: ${unnamed.join(", ") || "(none)"}\n      ` +
      `named here but offered by neither chart: ${dead.join(", ") || "(none)"}\n      ` +
      `the chapter names: ${namedOptions.join(" · ")}`);
  }
}

/* ── Check 65 — the ROLE VOCABULARY: the three roles the app really has, and every document
   that names one. N7. Checks 9–64 hold what the app can DO — its charts, panes, menus, packs,
   pickers and prose. Nothing held WHO can do it, and the marketing page had invented a role:
   "admin, editor and viewer roles" on the "Bring your team" card, where `app/auth.js` offers
   admin / developer / VIEWER and has never had an editor. Not a label drift — a reader who
   signs up for the role that card sells cannot find it in Admin → Add user, because the middle
   rung of the ladder is called something else.
   Sources of truth, all three in `app/auth.js`: `ROLES` (the canonical set the UI offers),
   `ROLE_LABELS` (its keys, so a set that stops matching its labels fails the premise rather
   than half a rule), and `canDevelop()`'s own body — the capability split the app enforces, and
   therefore the only honest basis for "who builds" and "who is read-only". The read-only set is
   derived as its complement, so adding a fourth role reclassifies it here rather than needing a
   second list. Rule (e) runs the direction that would cost a reader the most: no document may
   promise the builder to a role the code will not let in.  */
{
  const authSrc = read("app/auth.js");
  const litList = (re) => [...((authSrc.match(re) || [, ""])[1]).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const roles = litList(/var ROLES = \[([^\]]*)\]/);
  const labelKeys = [...((authSrc.match(/var ROLE_LABELS = \{([^}]*)\}/) || [, ""])[1])
    .matchAll(/([A-Za-z_]\w*)\s*:/g)].map((m) => m[1]);
  // The capability ladder as the code enforces it, not as a comment describes it: canDevelop is
  // the one gate on the Dashboard Builder, so the roles its body accepts ARE the builders.
  const developRoles = litList(/function canDevelop\([^)]*\)\s*\{([^}]*)\}/);
  const readRoles = roles.filter((r) => !developRoles.includes(r));
  const names = (text, r) => new RegExp("\\b" + r + "\\b", "i").test(text);

  // The marketing card, by its own idiom: "<list> roles".
  const teamAt = marketing.indexOf('id="feat-team"');
  const teamText = teamAt < 0 ? "" : htmlText(marketing.slice(teamAt, marketing.indexOf("</div>", teamAt)));
  const teamEnum = (teamText.match(/([a-z]+(?:,\s+[a-z]+)*\s+and\s+[a-z]+)\s+roles\b/i) || [, ""])[1];
  // Split on the separators, not on ", and" as a unit — the Oxford comma in Help's own list
  // would otherwise leave "or viewer" as a token and read as a role the app does not have.
  const teamRoles = teamEnum.split(/\s*(?:,|\band\b)\s*/).map((s) => s.trim()).filter(Boolean);

  // Help's, by its own: "whether they're an <list>".
  const ladderAt = help.indexOf('id="roles-ladder"');
  const ladderText = ladderAt < 0 ? "" : htmlText(help.slice(ladderAt, help.indexOf(")", ladderAt)));
  const ladderEnum = (ladderText.match(/whether they'?re an? ([a-z]+(?:,\s*[a-z]+)*,?\s+or\s+[a-z]+)/i) || [, ""])[1];
  const ladderRoles = ladderEnum.split(/\s*(?:,|\bor\b)\s*/).map((s) => s.trim()).filter(Boolean);

  // Help's builder-access parenthetical, split at its own em dash: who it is visible to, and
  // who is sent to the read-only route instead.
  const baAt = help.indexOf('id="builder-access"');
  const baParen = baAt < 0 ? "" : (help.slice(baAt, help.indexOf("</li>", baAt)).match(/\(([\s\S]*?)\)/) || [, ""])[1];
  const [grantSide, denySide] = baParen.split("—").map((s) => htmlText(s || ""));

  // (a) the premise. Four rules dereference these three literals and three passages; a renamed
  // anchor, a reworded enumeration or a role model that stops parsing must fail HERE rather
  // than let a coverage rule pass over an empty string.
  const rolePremise = ok(`app/auth.js: the role model parsed for check 65 ` +
    `(${roles.join(" / ") || "(none)"} — builds: ${developRoles.join(" + ") || "(none)"}, ` +
    `read-only: ${readRoles.join(" + ") || "(none)"})`,
    roles.length >= 2 && labelKeys.length === roles.length && roles.every((r) => labelKeys.includes(r)) &&
      developRoles.length >= 1 && developRoles.every((r) => roles.includes(r)) && readRoles.length >= 1 &&
      !!teamRoles.length && !!ladderRoles.length && !!grantSide && !!denySide,
    `ROLES: ${roles.join(", ") || "(missing)"} · ROLE_LABELS keys: ${labelKeys.join(", ") || "(missing)"}\n      ` +
    `canDevelop accepts: ${developRoles.join(", ") || "(missing)"}\n      ` +
    `index.html #feat-team enumeration: ${JSON.stringify(teamEnum)}\n      ` +
    `docs/index.html #roles-ladder enumeration: ${JSON.stringify(ladderEnum)}\n      ` +
    `docs/index.html #builder-access: granted ${JSON.stringify(grantSide || "")} · denied ${JSON.stringify(denySide || "")}`);

  if (rolePremise) {
    // (b) the marketing card, both directions in one rule because they are one sentence: it
    // must offer every role the app has, and no role it does not. The second half is the one
    // that was failing — "editor" read as a perfectly ordinary product noun for weeks.
    const teamMissing = roles.filter((r) => !teamRoles.includes(r));
    const teamInvented = teamRoles.filter((r) => !roles.includes(r));
    ok(`index.html: the team card offers exactly the ${roles.length} roles the app has`,
      !teamMissing.length && !teamInvented.length,
      `offered by the app, missing from the card: ${teamMissing.join(", ") || "(none)"}\n      ` +
      `sold by the card, not a role: ${teamInvented.join(", ") || "(none)"}\n      ` +
      `the card enumerates: ${teamRoles.join(" · ") || "(nothing)"} · app/auth.js offers: ${roles.join(" · ")}`);

    // (c) Help's ladder, same both directions. This is the sentence an admin reads before
    // assigning a role, so an omission here is a role nobody knows they can grant.
    const ladderMissing = roles.filter((r) => !ladderRoles.includes(r));
    const ladderInvented = ladderRoles.filter((r) => !roles.includes(r));
    ok(`docs/index.html: the Admin ladder names exactly the ${roles.length} roles the app has`,
      !ladderMissing.length && !ladderInvented.length,
      `offered by the app, missing from the ladder: ${ladderMissing.join(", ") || "(none)"}\n      ` +
      `named in the ladder, not a role: ${ladderInvented.join(", ") || "(none)"}\n      ` +
      `Help names: ${ladderRoles.join(" · ") || "(nothing)"}`);

    // (d) the capability split, held role by role against canDevelop() itself: a role is named
    // on the granted side if and only if the gate lets it in, and on the read-only side if and
    // only if it does not. A fourth role, or a change to the gate, moves this rule with it.
    const wrongSide = roles.filter((r) =>
      names(grantSide, r) !== developRoles.includes(r) || names(denySide, r) !== readRoles.includes(r));
    ok(`docs/index.html: the Dashboard Builder is documented as visible to exactly the role(s) canDevelop() admits (${developRoles.join(" + ")})`,
      !wrongSide.length,
      `documented on the wrong side of the gate: ${wrongSide.join(", ") || "(none)"}\n      ` +
      `canDevelop() admits: ${developRoles.join(", ")} · read-only: ${readRoles.join(", ")}\n      ` +
      `Help grants it to: ${JSON.stringify(grantSide)}\n      ` +
      `Help sends to the viewer route: ${JSON.stringify(denySide)}`);

    // (e) the negative half that costs the most if it is wrong, run page-wide rather than on an
    // anchor: nowhere may a document say a read-only role builds or edits a dashboard. The verb
    // set is the vocabulary these three documents actually use for authoring; the distance
    // limits and the clause-ending characters keep it inside one clause, so "a viewer opens
    // dashboards through the read-only viewer route" (Help, true) does not read as a promise.
    const AUTHOR = "(?:builds?|edits?|authors?|creates?|designs?)";
    const overpromised = [];
    for (const [docName, text] of [
      ["index.html", htmlText(marketing.slice(marketing.indexOf("<main>"), marketing.indexOf("</main>")))],
      ["docs/index.html", htmlText(helpMain)],
      ["README.md", readme]
    ]) {
      for (const r of readRoles) {
        const m = text.match(new RegExp("\\b" + r + "s?\\b[^.;)]{0,40}?\\b" + AUTHOR + "\\b[^.;)]{0,30}?\\bdashboards?\\b", "i"));
        if (m) overpromised.push(`${docName}: "${m[0].trim()}"`);
      }
    }
    ok(`no document promises the builder to a read-only role (${readRoles.join(", ")})`,
      !overpromised.length,
      `${overpromised.join("\n      ") || "(none)"}\n      ` +
      `canDevelop() is the gate, and it admits only: ${developRoles.join(", ")}`);
  }
}

/* ── Check 66 — the Admin user editor's PROVISIONING controls vs the copy that documents
   them. N7, and the `ⓘ Tour` class check 41 (g) deleted from README and check 44 (f) from
   PUBLISH.md: Help documented a control the app no longer has. `openUserEditor` used to carry
   an "Install the Conservation Insight sample pack on first sign-in" CHECKBOX; SP-0 replaced it
   with a `Sample pack (installed at first sign-in)` SELECT built from `Studio.DEMO_PACKS`, so an
   admin can assign ANY registered pack. Help still described the checkbox — and named the one
   pack it used to mean — which both sends a reader looking for a control that is not there and
   hides every other pack the build ships. The same passage enumerates what the "Copy my current
   Dashboard defaults" button captures, and `snapshotDashboardDefaults()` returns one more field
   than it lists.
   Sources of truth, all derived, none new: `openUserEditor`'s own brace-matched body in
   app/studio.js (each control's element kind, its label, and the text of the option that means
   "skip this"), `packRegistry` (check 34's reading of the pack registry), and the KEYS
   `snapshotDashboardDefaults()` returns in app/defaults.js. Rule (b) is the one that was
   failing twice: a select is not a checkbox, and a control offering the whole registry must not
   be published as installing one named pack. Rule (d)'s vocabulary is keyed by the RETURNED KEY,
   so a tenth captured field falls out of the table and fails the premise loudly rather than
   passing green while the copy omits it.
   The provisioning inventory is the controls whose own label says "first sign-in", plus the two
   the save handler writes onto the account without that phrasing — `usrEditForceTour` and
   `usrEditBackend`, looked up by id, so renaming either fails the premise rather than a rule. */
{
  const editorAt = studioSrc.indexOf("function openUserEditor(");
  const editorBody = editorAt < 0 ? "" : braceBlockAt(studioSrc, studioSrc.indexOf("{", editorAt));
  const straight = (s) => (s || "").replace(/[’‘]/g, "'").replace(/[“”]/g, '"');

  // Every `<span>…</span>` field label in the editor, in source order, so a control's own label
  // is the nearest one above its `.id = "usrEdit…"` assignment.
  const fieldLabels = [...editorBody.matchAll(/innerHTML = "<span>([^<]*)<\/span>"/g)]
    .map((m) => ({ label: straight(m[1]), at: m.index }));
  const controls = new Map();
  for (const m of editorBody.matchAll(/(\w+)\.id = "(usrEdit\w+)"/g)) {
    const above = fieldLabels.filter((f) => f.at < m.index).pop();
    controls.set(m[2], { varName: m[1], label: above ? above.label : "", at: m.index });
  }
  // A button names itself in its own textContent; a checkbox names itself in the text node its
  // label appends beside it. Both are read off the control, so a rename moves the rule with it.
  for (const m of editorBody.matchAll(/(\w+)\.id = "(usrEdit\w+)";[\s\S]{0,80}?\1\.textContent = "([^"]+)"/g))
    if (controls.has(m[2])) controls.get(m[2]).label = straight(m[3]);

  // The element each control IS, and — for the selects — the text of the option whose value is
  // "", i.e. the choice that means "skip this part". That option is what the copy has to quote
  // when it tells a reader how to leave a default unset.
  for (const [, c] of controls) {
    c.kind = (editorBody.match(new RegExp(`\\b${c.varName} = el\\("(\\w+)"`)) || [, ""])[1];
    if (c.kind === "input")
      c.kind = (editorBody.match(new RegExp(`\\b${c.varName}\\.type = "(\\w+)"`)) || [, "text"])[1];
    if (c.kind === "checkbox") {
      const lab = (editorBody.match(new RegExp(`(\\w+)\\.appendChild\\(${c.varName}\\)`)) || [, ""])[1];
      const txt = lab && editorBody.match(new RegExp(`${lab}\\.appendChild\\(document\\.createTextNode\\("([^"]*)"\\)\\)`));
      if (txt) c.label = straight(txt[1]).trim();
    }
    const none = editorBody.match(new RegExp(
      `(\\w+)\\.value = ""; \\1\\.textContent = "([^"]+)";[\\s\\S]{0,120}?${c.varName}\\.appendChild\\(\\1\\)`));
    // The clause before the em dash — "Don't set", "Don't install one" — is the part a sentence
    // can quote naturally; holding the whole label would make the copy read like a screenshot.
    c.skipOption = none ? straight(none[2]).split("—")[0].trim() : "";
  }
  const packCtl = controls.get("usrEditPack") || {};
  const themeCtl = controls.get("usrEditTheme") || {};
  // The premise for rule (b): the pack picker's options ARE the registry, so `packRegistry` is
  // the right roster to hold the copy to.
  const packFromRegistry = /Object\.keys\(Studio\.DEMO_PACKS[^)]*\)\.forEach/.test(editorBody);
  const packShortNames = packRegistry.map((p) => {
    const at = registryBlock.indexOf(`\n    ${p.id}: {`);
    const body = at < 0 ? "" : braceBlockAt(registryBlock, registryBlock.indexOf("{", at));
    return { id: p.id, short: ((body.match(/name:\s*"([^"]+)"/) || [, ""])[1]).split("—")[0].trim() };
  }).filter((p) => p.short);

  // What the "Copy my current Dashboard defaults" button really captures.
  const ddSrc = read("app/defaults.js");
  const ddAt = ddSrc.indexOf("function snapshotDashboardDefaults(");
  const ddKeys = ddAt < 0 ? [] : [...braceBlockAt(ddSrc, ddSrc.indexOf("{", ddSrc.indexOf("return", ddAt)))
    .matchAll(/(\w+):\s*default\w+\(\)/g)].map((m) => m[1]);
  const DD_NOUN = {
    subtitle: "subtitle", accentColor: "accent color", logo: "header logo", headerBg: "header background",
    titleSize: "title size", subtitleStyle: "subtitle style", dashboardTheme: "dashboard theme",
    cardSkin: "card style", quickModeCreativity: "Quick-import creativity"
  };

  const adminAt = help.indexOf('<section id="admin-docs"');
  const adminText = adminAt < 0 ? "" : straight(htmlText(help.slice(adminAt, help.indexOf("</section>", adminAt))));
  const provAt = help.indexOf('id="prov-defaults"');
  const provText = provAt < 0 ? "" : straight(htmlText(help.slice(provAt, help.indexOf("<h3", provAt + 10))));
  // WHICH controls are provisioning controls is derived from the save handler, not from a list
  // kept here: the operands of `opts.provisioning = (…)` and `opts.forceTour = …`, resolved one
  // hop back to the element each reads (`X.value` / `X.checked`, or the button whose onclick
  // assigns it). A control that stops being written onto the account drops out of the rule with
  // it, and a new one joins it the day it is wired.
  const savedFrom = new Set();
  for (const m of editorBody.matchAll(/opts\.(?:provisioning|forceTour)\s*=\s*\(?([^;{?]*)/g))
    for (const n of m[1].matchAll(/\b([A-Za-z_]\w*)\b/g)) savedFrom.add(n[1]);
  const controlVars = new Set([...controls.values()].map((c) => c.varName));
  for (const name of [...savedFrom]) {
    if (controlVars.has(name)) continue;
    // The whole initializer, not just its head — `provBackend` is read out of a ternary, and a
    // control reached that way is no less written onto the account than one read directly.
    for (const m of editorBody.matchAll(new RegExp(`\\b${name}\\s*=\\s*([^;]*);`, "g")))
      for (const v of m[1].matchAll(/\b(\w+)\.(?:value|checked)\b/g)) savedFrom.add(v[1]);
    for (const m of editorBody.matchAll(new RegExp(`(\\w+)\\.onclick = function \\(\\) \\{\\s*${name}\\s*=`, "g")))
      savedFrom.add(m[1]);
  }
  const provisioningIds = [...controls.keys()].filter((id) => savedFrom.has(controls.get(id).varName));

  // (a) the premise. Four rules dereference this parse, the pack roster and the snapshot's keys;
  // a renamed control, a retired anchor or a newly captured default must fail HERE rather than
  // let a coverage rule pass over an empty string.
  const provPremise = ok(`app/studio.js: the user editor's provisioning controls parsed for check 66 ` +
    `(${provisioningIds.map((id) => `${id}=${controls.get(id).kind}`).join(" · ") || "(none)"}; ` +
    `pack picker offers ${packShortNames.length} registered pack(s); snapshot captures ${ddKeys.length} field(s))`,
    !!editorBody && provisioningIds.length >= 4 && !!packCtl.kind && !!themeCtl.kind &&
      !!packCtl.skipOption && !!themeCtl.skipOption && packFromRegistry &&
      packShortNames.length >= 2 && ddKeys.length >= 2 && ddKeys.every((k) => DD_NOUN[k]) &&
      !!adminText && !!provText && provisioningIds.every((id) => controls.get(id).label),
    `controls: ${[...controls.keys()].join(", ") || "(none)"}\n      ` +
    `pack picker: kind=${packCtl.kind || "(unparsed)"} skip=${JSON.stringify(packCtl.skipOption || "")} ` +
    `from-registry=${packFromRegistry}\n      ` +
    `theme picker: kind=${themeCtl.kind || "(unparsed)"} skip=${JSON.stringify(themeCtl.skipOption || "")}\n      ` +
    `snapshotDashboardDefaults keys: ${ddKeys.join(", ") || "(none)"}` +
    (ddKeys.filter((k) => !DD_NOUN[k]).length
      ? ` — no noun registered for: ${ddKeys.filter((k) => !DD_NOUN[k]).join(", ")}` : "") + `\n      ` +
    `docs/index.html #prov-defaults: ${provText ? provText.slice(0, 80) + "…" : "(anchor missing)"}`);

  if (provPremise) {
    // (b) the control is documented as the control it IS. Both halves were failing: the copy
    // called a <select> a checkbox, and named ONE registry pack as the thing it installs — the
    // reading a reader takes away is "this account can be given Conservation Insight", when the
    // form offers every pack the build registers. Naming none (deferring to the pack chapter) or
    // all of them is fine; naming exactly one is the drift.
    const calledCheckbox = packCtl.kind === "select" &&
      (provText.match(/\b(checkbox|check(?:ed)? this box|the pack box|unchecked|tick(?:ed)?)\b/i) || [])[0];
    const namedPacks = packShortNames.filter((p) => provText.includes(p.short));
    ok(`docs/index.html: the sample-pack provisioning control is documented as the ${packCtl.kind} over the registry that it is`,
      !calledCheckbox && namedPacks.length !== 1,
      `the form renders <${packCtl.kind}> "${packCtl.label}", populated from Studio.DEMO_PACKS\n      ` +
      `checkbox-shaped wording in the copy: ${calledCheckbox ? JSON.stringify(calledCheckbox) : "(none)"}\n      ` +
      `packs named in the copy: ${namedPacks.map((p) => p.short).join(", ") || "(none)"} ` +
      `— the registry offers ${packShortNames.length}: ${packShortNames.map((p) => p.short).join(", ")}`);

    // (c) the two "leave it unset" choices are quoted from the controls themselves, so the
    // sentence telling an admin how to skip a default points at a label the form really prints.
    const unquoted = [themeCtl, packCtl].filter((c) => !provText.includes(c.skipOption));
    ok(`docs/index.html: the copy quotes each provisioning picker's own "skip this" option (${
      [themeCtl, packCtl].map((c) => JSON.stringify(c.skipOption)).join(" / ")})`,
      !unquoted.length,
      `not quoted: ${unquoted.map((c) => `${c.label} → ${JSON.stringify(c.skipOption)}`).join(" · ") || "(none)"}`);

    // (d) the enumeration of what the snapshot captures, both directions. The vocabulary is keyed
    // by the returned key, so a field added to snapshotDashboardDefaults() fails the premise
    // above until it has a noun, and then fails here until the copy prints it.
    const ddMissing = ddKeys.filter((k) => !new RegExp(DD_NOUN[k].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(provText));
    const ddStray = Object.keys(DD_NOUN).filter((k) => !ddKeys.includes(k) &&
      new RegExp(DD_NOUN[k].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(provText));
    ok(`docs/index.html: the Dashboard-defaults snapshot is published as all ${ddKeys.length} field(s) it captures`,
      !ddMissing.length && !ddStray.length,
      `captured by snapshotDashboardDefaults(), missing from the copy: ${
        ddMissing.map((k) => `${k} (“${DD_NOUN[k]}”)`).join(", ") || "(none)"}\n      ` +
      `published by the copy, not captured: ${ddStray.map((k) => DD_NOUN[k]).join(", ") || "(none)"}`);

    // (e) coverage, over the whole Admin chapter rather than the one anchor — the assigned
    // workspace and the one-shot tour are documented in their own sections. Each control is
    // matched on the distinguishing words of its OWN label, so a rename moves the rule with it.
    const uncovered = provisioningIds.filter((id) => {
      const words = controls.get(id).label.replace(/\(.*$/, "").trim();
      return !adminText.toLowerCase().includes(words.toLowerCase());
    });
    ok(`docs/index.html: the Admin chapter names every provisioning control the user editor renders (${provisioningIds.length})`,
      !uncovered.length,
      `rendered by openUserEditor, named nowhere in the chapter: ${
        uncovered.map((id) => `${id} (“${controls.get(id).label}”)`).join(" · ") || "(none)"}`);
  }
}

/* ── Check 67 — the guided-tour CHOOSER vs the tours it really offers ────────
   N7. Checks 12/13/14/19/20/22/23/24 all read INSIDE the tours — their steps, their spotlight
   targets, their nouns. Nothing had ever read the LIST: the chooser is built from TOUR_ORDER,
   its pack rows are gated by TOUR_GATES, and Help's account of it was written when there were
   four general topics and one pack tour.
   There are five general topics and FOUR pack tours now. Help's "Your first sign-in" bullet
   listed four lowercase paraphrases — and one of them, "prepping and connecting your data",
   silently merged the two separate walks `jobs` ("Prep data (Jobs)") and `connect`
   ("Connections & Datasets") into a single phrase, so a reader counted four rows and the picker
   drew five. The pack half said "plus one for your installed sample pack", singular, of a
   chooser that adds a row per installed pack and of two engines (welcome.js's carousel and the
   overview tour) that each splice one step PER pack.
   The same drift reached the Sample packs chapter from the other end: Campaign Finance and
   Where America Moved each say "The pack also carries its own guided tour", the idiom rules
   (c)/(d) below read — and Conservation Insight and Market Coverage, which have had tours for
   just as long, said nothing, while Federal Contract Awards and Data Management (which have
   none) correctly said nothing either. So the page's silence meant two different things.
   Sources of truth, all in app/tutorial.js: `TOUR_ORDER` (the chooser's own order),
   `TOUR_GATES` (which keys are pack rows, and which pack each one really asks about), and each
   entry's own `label:` — the string the picker prints. The premise holds the join the copy
   depends on: a gate must ask about the pack whose key it is, and that pack must be one
   `packRegistry` knows, or (c)/(d) would be attaching sentences to the wrong entry.
   Rule (a) runs both directions inside `#tour-topics` — a retired tour still listed fails just
   as loudly as a new one missing — and it reads the picker's label VERBATIM, so renaming a tour
   moves the rule with it rather than leaving a plausible paraphrase behind. */
{
  const tourOrder = ((tutorialSrc.match(/var TOUR_ORDER = \[([^\]]*)\]/) || [, ""])[1]
    .match(/"([^"]+)"/g) || []).map((s) => s.slice(1, -1));

  // Which keys are PACK rows, and which pack id each gate really asks about — read from the
  // gate's own body, not from the key, because the whole point of (c)/(d) is the join.
  const gatesAt = tutorialSrc.indexOf("var TOUR_GATES = {");
  const gatesBody = gatesAt < 0 ? "" : braceBlockAt(tutorialSrc, tutorialSrc.indexOf("{", gatesAt));
  const gates = new Map();
  for (const m of gatesBody.matchAll(/\n {4}(\w+): function[\s\S]*?demoPackInstalled\("([^"]+)"\)/g))
    gates.set(m[1], m[2]);

  // The label the chooser PRINTS for a tour — the first `label:` inside that entry's own block.
  const tourLabel = (key) => {
    const at = tutorialSrc.indexOf(`\n    ${key}: {`);
    if (at < 0) return "";
    const body = braceBlockAt(tutorialSrc, tutorialSrc.indexOf("{", at));
    return (body.match(/label: "((?:[^"\\]|\\.)*)"/) || [, ""])[1];
  };
  const generalKeys = tourOrder.filter((k) => !gates.has(k));
  const generalLabels = generalKeys.map(tourLabel);

  const ents = (s) => s.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  const topicsSpan = (help.match(/<span id="tour-topics">([\s\S]*?)<\/span>/) || [, ""])[1];
  const topicNames = [...topicsSpan.matchAll(/<strong>([\s\S]*?)<\/strong>/g)].map((m) => ents(m[1]));
  const countWord = (help.match(/picker of (\S+) topics/) || [, ""])[1] || "";
  const claimedCount = asNumber(countWord);

  const packIds = new Set(packRegistry.map((p) => p.id));
  const tourClaim = /carries its own guided tour/i;

  // (a) the premise. Everything below dereferences this parse; a renamed tour, a gate that
  // stops naming its own pack, or a lost anchor must fail HERE rather than let a coverage
  // rule pass over an empty string.
  const tourPremise = ok(`app/tutorial.js: the tour chooser parsed for check 67 ` +
    `(${tourOrder.length} tour(s): ${generalLabels.join(" · ") || "(none)"}; ` +
    `${gates.size} gated on a pack: ${[...gates.keys()].join(", ") || "(none)"})`,
    tourOrder.length >= 5 && generalKeys.length >= 2 && generalLabels.every(Boolean) &&
      gates.size >= 1 && [...gates.keys()].every((k) => tourOrder.includes(k)) &&
      [...gates.entries()].every(([k, id]) => k === id && packIds.has(id)) &&
      !!topicsSpan && topicNames.length > 0 && claimedCount !== undefined,
    `TOUR_ORDER: ${tourOrder.join(", ") || "(unparsed)"}\n      ` +
    `gates (tour key → pack it asks about): ${[...gates.entries()].map(([k, id]) => `${k}→${id}`).join(", ") || "(none)"}\n      ` +
    `registered packs: ${[...packIds].join(", ")}\n      ` +
    `docs/index.html #tour-topics: ${topicsSpan ? topicNames.join(" | ") : "(anchor missing)"}\n      ` +
    `"picker of N topics": ${JSON.stringify(countWord)}\n      ` +
    "a gate keyed on one tour but asking about another pack would attach rules (c)/(d)'s " +
    "sentence to the wrong entry, so it fails the premise rather than a rule");

  if (tourPremise) {
    // (b) every general topic is listed, and nothing else is. Both directions, because a
    // chooser row nobody documented and a documented row the chooser dropped are the same
    // defect seen from either end.
    const topicMissing = generalLabels.filter((l) => !topicNames.includes(l));
    const topicStray = topicNames.filter((t) => !generalLabels.includes(t));
    ok(`docs/index.html: #tour-topics lists the picker's ${generalLabels.length} general topics verbatim`,
      !topicMissing.length && !topicStray.length,
      `offered by the chooser, not listed: ${topicMissing.join(", ") || "(none)"}\n      ` +
      `listed, not offered: ${topicStray.join(", ") || "(none)"}\n      ` +
      "the label is what the reader clicks — a paraphrase (\"prepping and connecting your data\" " +
      "for two separate walks) reads fine and cannot be found in the picker");

    // (c) the count beside the list. Its own claim, so a topic added to the chooser and to the
    // list while the sentence still says "four" fails here rather than passing on (b) alone.
    ok(`docs/index.html: "a picker of ${countWord} topics" is the ${generalLabels.length} the chooser draws`,
      claimedCount === generalLabels.length,
      `TOUR_ORDER has ${tourOrder.length} tour(s), ${gates.size} of them gated on an installed ` +
      `pack, leaving ${generalLabels.length} always-visible topic(s); the copy says ${countWord}`);

    // (d) a pack WITH a tour says so, in the idiom the page already uses. The gate is what
    // puts the row in front of the reader, so the gate is what the sentence answers to.
    const tourGaps = [];
    for (const p of packRegistry) {
      const item = itemFor(p)[0] && itemProse(itemFor(p)[0]);
      if (!item) continue;                       // check 34 (a) owns "every pack has an entry"
      if (gates.has(p.id) && !tourClaim.test(item))
        tourGaps.push(`"${p.folder}" has a tour in the chooser, but its Help entry never says so`);
    }
    ok(`docs/index.html: every pack whose tour the chooser offers says so in its Help entry (${[...gates.keys()].join(", ")})`,
      !tourGaps.length,
      `${tourGaps.join("\n      ")}\n      ` +
      "two of the four said it and two did not, so the page's silence meant both \"no tour\" and " +
      "\"nobody wrote the sentence\" — which is no signal at all");

    // (e) the negative half: a pack with no tour must not be sold one. Federal Contract Awards
    // and Data Management are the live proof this rule can pass honestly.
    const tourStray = [];
    for (const p of packRegistry) {
      const item = itemFor(p)[0] && itemProse(itemFor(p)[0]);
      if (!item) continue;
      if (!gates.has(p.id) && tourClaim.test(item))
        tourStray.push(`"${p.folder}" claims its own guided tour, but no TOUR_GATES entry offers one`);
    }
    ok(`docs/index.html: no pack without a tour is documented as carrying one (${
      packRegistry.filter((p) => !gates.has(p.id)).map((p) => p.folder).join(", ") || "(none)"})`,
      !tourStray.length,
      `${tourStray.join("\n      ")}\n      ` +
      "sending a reader to ⌘K → Interactive tutorial for a row that is not there is the more " +
      "expensive direction of this drift");
  }
}

/* ── Check 68 — the Quick Views EDITOR's own controls vs the chapter documenting them ─────
   N7. Check 32 reads the Quick Views editor's four numbered steps (Data / Chart / Mapping /
   Result) and the marketing shot framed around them; nothing had ever read what step 3 puts
   INSIDE the mapping grid. That grid is where a reader is sent to find a control, and the
   chapter had drifted in both of the ways that matters.

   It documented two controls Quick Views does not have. `xpMapEditorHtml()` is the sole
   producer of the mapping grid and it pushes exactly three per-chart options — `scale` and
   `renderer` for a map, `refSeries` for an Ensemble chart. The chapter walked the reader
   through those and then through the GL map's **Zoom/pan controls** (Show / Compact / Hidden)
   and **Controls position** (any corner), which are `Studio.CHARTS.choropleth` options rendered
   by the Dashboard Builder's generic inspector table and by nothing in `app/explore.js`. Both
   sentences read as instructions for the pane the bullet is about, so the reader hunts a grid
   with three rows for a fourth and a fifth.

   And it named two of the four chart types the Rollup control is hidden on. The copy said
   "Geo and Ensemble charts carry their own aggregation, so the control is hidden for those",
   while `XP_AGG_TYPES` shows the control for five of the nine chips — scatter and heatmap are
   excluded too, for a reason the code states outright (a rollup aggregates ONE measure by
   category; scatter carries x+y and heatmap is a row×column pivot, so grouping one measure away
   would collapse them). Two of the four exclusions were therefore silent.

   Sources of truth, all evaluated rather than pattern-matched where possible: `XP_TYPES` and
   `XP_AGG_TYPES` in app/explore.js, that file's own `data-xp-opt=` / `data-xp-agg=` attributes
   (the controls it really renders), and the shared `M` model for every LABEL — chart names
   verbatim, option names by their pre-parenthesis stem, because Explore and the registry word
   the same option's tail differently ("never joins the estimate" / "excluded from the
   estimate") and the reader is looking for the name, not the aside. So renaming a chart type
   or an option moves these rules with it instead of leaving a plausible label behind. */
{
  const exploreSrc = read("app/explore.js");
  const arrLit = (name) => ((exploreSrc.match(new RegExp(`var ${name} = \\[([^\\]]*)\\]`)) || [, ""])[1]
    .match(/"([^"]+)"/g) || []).map((s) => s.slice(1, -1));
  const xpTypes = arrLit("XP_TYPES");
  const xpAggTypes = arrLit("XP_AGG_TYPES");
  const xpNoAggTypes = xpTypes.filter((t) => !xpAggTypes.includes(t));

  // What step 3 really renders. xpMapEditorHtml() is the only producer of the mapping grid,
  // so its own attributes ARE the control list — no second place to keep in sync.
  const mapEdAt = exploreSrc.indexOf("function xpMapEditorHtml()");
  const mapEdBody = mapEdAt < 0 ? "" : braceBlockAt(exploreSrc, exploreSrc.indexOf("{", mapEdAt));
  const xpOptKeys = [...new Set([...mapEdBody.matchAll(/data-xp-opt="(\w+)"/g)].map((m) => m[1]))];
  const xpGroupBys = [...new Set([...mapEdBody.matchAll(/data-xp-agg="(g\d+)"/g)].map((m) => m[1]))];

  // The option pool: every option any Quick Views chart type HAS, keyed the way Explore keys
  // it, so an option the pane skips is still nameable and rule (b)'s stray half can find it.
  const optStem = (s) => s.replace(/\s*\(.*$/, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const optLabel = new Map();
  for (const t of xpTypes)
    for (const o of ((M.CHARTS[t] || {}).opts || []))
      if (!optLabel.has(o.key)) optLabel.set(o.key, optStem(o.label));
  const chartLabel = (t) => ((M.CHARTS[t] || {}).label || t);
  const aggStems = (M.AGG_FNS || []).map((f) => optStem(f[1]));

  const deEnt = (s) => s.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  const spanOf = (id) => (help.match(new RegExp(`<span id="${id}">([\\s\\S]*?)</span>`)) || [, ""])[1];
  const taggedIn = (span, tag) =>
    [...span.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => deEnt(m[1]));

  const optSpan = spanOf("quickviews-chart-options");
  const onSpan = spanOf("quickviews-rollup-on");
  const offSpan = spanOf("quickviews-rollup-off");
  const fnSpan = spanOf("quickviews-rollup-fns");
  const dimWord = (help.match(/grouped by <strong>(\w+)<\/strong> dimensions/) || [, ""])[1] || "";

  // (a) the premise. Everything below dereferences this parse. The join worth asserting is
  // that every key Explore renders resolves in the chart registry — that is what lets rules
  // (b) and (c) read the registry's label rather than a second copy of it in the pane.
  const xpPremise = ok(`app/explore.js: the Quick Views mapping grid parsed for check 68 ` +
    `(${xpTypes.length} chart chip(s); Rollup on ${xpAggTypes.length}, hidden on ${xpNoAggTypes.length}; ` +
    `per-chart option(s): ${xpOptKeys.map((k) => `${k}="${optLabel.get(k) || "?"}"`).join(" · ") || "(none)"}; ` +
    `${xpGroupBys.length} group-by select(s))`,
    xpTypes.length >= 5 && xpAggTypes.length >= 1 && xpNoAggTypes.length >= 1 &&
      xpAggTypes.every((t) => xpTypes.includes(t)) &&
      xpTypes.every((t) => M.CHARTS[t]) &&
      xpOptKeys.length >= 1 && xpOptKeys.every((k) => optLabel.has(k)) &&
      xpGroupBys.length >= 1 && aggStems.length >= 2 &&
      !!optSpan && !!onSpan && !!offSpan && !!fnSpan && !!dimWord,
    `XP_TYPES: ${xpTypes.join(", ") || "(unparsed)"}\n      ` +
    `XP_AGG_TYPES: ${xpAggTypes.join(", ") || "(unparsed)"}\n      ` +
    `data-xp-opt keys in xpMapEditorHtml(): ${xpOptKeys.join(", ") || "(none)"}\n      ` +
    `unknown to the chart registry: ${xpOptKeys.filter((k) => !optLabel.has(k)).join(", ") || "(none)"}\n      ` +
    `Studio.AGG_FNS: ${aggStems.join(", ") || "(none)"}\n      ` +
    `docs/index.html anchors — options: ${optSpan ? "ok" : "MISSING"}, rollup-on: ${onSpan ? "ok" : "MISSING"}, ` +
    `rollup-off: ${offSpan ? "ok" : "MISSING"}, rollup-fns: ${fnSpan ? "ok" : "MISSING"}, ` +
    `"grouped by <strong>N</strong> dimensions": ${JSON.stringify(dimWord)}`);

  if (xpPremise) {
    // (b) the per-chart options, both directions and inside the anchor only — the sentence
    // that says where the OTHER options live sits outside it on purpose, so telling a reader
    // "the GL cluster is in the builder" stays legal while presenting it as a Quick Views
    // control does not. The stray half is the half that was failing.
    const wantOpts = xpOptKeys.map((k) => optLabel.get(k));
    const gotOpts = taggedIn(optSpan, "strong");
    const optMissing = wantOpts.filter((l) => !gotOpts.includes(l));
    const optStray = gotOpts.filter((l) => !wantOpts.includes(l));
    ok(`docs/index.html: #quickviews-chart-options names the ${wantOpts.length} per-chart option(s) ` +
      `the Quick Views mapping grid renders, and no others`,
      !optMissing.length && !optStray.length,
      `rendered by xpMapEditorHtml(), not named: ${optMissing.join(", ") || "(none)"}\n      ` +
      `named as a Quick Views control, not rendered there: ${optStray.join(", ") || "(none)"}\n      ` +
      `(options the registry has for these chart types but this pane skips: ${
        [...optLabel.entries()].filter(([k]) => !xpOptKeys.includes(k)).map(([, l]) => l).join(", ") || "(none)"})`);

    // (c) the chart types the Rollup control APPEARS on, both directions. Verbatim registry
    // labels: these are the words on the chips the reader is choosing between.
    const wantOn = xpAggTypes.map(chartLabel);
    const gotOn = taggedIn(onSpan, "strong");
    ok(`docs/index.html: #quickviews-rollup-on lists the ${wantOn.length} chart type(s) XP_AGG_TYPES ` +
      `shows the Rollup control for`,
      !wantOn.filter((l) => !gotOn.includes(l)).length && !gotOn.filter((l) => !wantOn.includes(l)).length,
      `shows the control, not listed: ${wantOn.filter((l) => !gotOn.includes(l)).join(", ") || "(none)"}\n      ` +
      `listed, does not show it: ${gotOn.filter((l) => !wantOn.includes(l)).join(", ") || "(none)"}`);

    // (d) the other direction of the same list, and the half that was wrong: the copy named
    // Geo and Ensemble and stopped, leaving scatter and heatmap silently excluded.
    const wantOff = xpNoAggTypes.map(chartLabel);
    const gotOff = taggedIn(offSpan, "strong");
    ok(`docs/index.html: #quickviews-rollup-off names all ${wantOff.length} chart type(s) the Rollup ` +
      `control is hidden on`,
      !wantOff.filter((l) => !gotOff.includes(l)).length && !gotOff.filter((l) => !wantOff.includes(l)).length,
      `hidden on it, not named: ${wantOff.filter((l) => !gotOff.includes(l)).join(", ") || "(none)"}\n      ` +
      `named as excluded, but the control is shown: ${gotOff.filter((l) => !wantOff.includes(l)).join(", ") || "(none)"}\n      ` +
      "an unnamed exclusion is the expensive direction — the reader picks the chip, the row is " +
      "not there, and the page never said it would not be");

    // (e) the aggregate functions themselves, both directions, matched on the stem of the
    // option's own printed label so "Mean (average)" is found by "Mean".
    const gotFns = taggedIn(fnSpan, "em");
    ok(`docs/index.html: #quickviews-rollup-fns publishes all ${aggStems.length} function(s) ` +
      `Studio.AGG_FNS offers`,
      !aggStems.filter((l) => !gotFns.includes(l)).length && !gotFns.filter((l) => !aggStems.includes(l)).length,
      `offered by the registry, not published: ${aggStems.filter((l) => !gotFns.includes(l)).join(", ") || "(none)"}\n      ` +
      `published, not offered: ${gotFns.filter((l) => !aggStems.includes(l)).join(", ") || "(none)"}`);

    // (f) how many dimensions the rollup groups by — its own claim, because the Group by /
    // Then by pair is what a reader plans a dataset around.
    ok(`docs/index.html: "grouped by ${dimWord} dimensions" is the ${xpGroupBys.length} group-by ` +
      `select(s) the mapping grid renders`,
      asNumber(dimWord) === xpGroupBys.length,
      `xpMapEditorHtml() renders ${xpGroupBys.join(" + ") || "(none)"}; the copy says ${JSON.stringify(dimWord)}`);
  }
}

/* ── Check 69 — Home's OWN page vs the chapter that introduces it ─────────────
   N7, and the altitude move check 67 made for the tour chooser: eight checks read things a
   reader reaches THROUGH Home, and nothing had ever read the page Home renders first.

   The chapter opened its list at the fourth thing on the screen. `renderHome()` paints a
   "Welcome back" hero, then a grid of quick-start cards, then a rotating tip, then (once the
   workspace has workbooks) a chip strip — and only then the content sections the chapter
   described. All EIGHT cards were undocumented here: four of them are named in passing in other
   chapters (Quick import in Getting started, Sample dashboards in the packs chapter, Take the
   tour in Admin, New Quick View in the builder chapter) and four — New View, New dashboard, New
   connection, New dataset — appeared nowhere as a Home affordance at all. The card grid is the
   only thing a first-time reader sees above the fold, so the page documenting Home began below it.

   Three more drifts, all in the same direction — the reader is told less than the page shows:
   · the reorderable-section list published the labels as **Featured, Pinned, Favorites,
     Examples, Dashboards**, and two of those are not what the headings say: the sections render
     **Pinned Views** and **Favorite datasets & connections**. A reader scanning headings for
     "Favorites" finds nothing;
   · the **Dashboards** section draws TWO nested strips, **Pinned** and **Recent dashboards**, and
     only the second was named — even though the chapter's own "Clear recents" bullet points at
     that heading. So pinned dashboards (`loadPins()`, the ★ on a dashboard card) were invisible
     on the page, while pinned VIEWS had a section of their own three bullets above — the exact
     pair a reader confuses;
   · the workbook chip strip was absent, and a section that silently hides itself when empty was
     never stated as doing so.

   Sources of truth, all inside `renderHome()` so there is no second copy to keep in sync: the
   `cards` array literal (its `t:` titles are the words on the buttons), the
   `currentUserCanDevelop()` filter's own act list, `HOME_SECTION_LABELS`, the `home-sub-nested`
   headings in the `dashboards:` section body, and `wbChipDefs`' two fixed chips. Five rules:
   (a) the card list names every card the grid renders, and no card it does not (both directions,
       inside its own anchor, so the viewer paragraph's repeats below cannot satisfy it);
   (b) the viewer-role paragraph names exactly the cards the filter removes — a card that stops
       being builder-only leaves this rule with it;
   (c) the reorderable-section list is the rendered LABEL set, verbatim, both directions;
   (d) the Dashboards section's nested strips are both named;
   (e) the workbook strip's two fixed chips are named. */
{
  const homeSrc = read("app/studio.js");
  const cardsAt = homeSrc.indexOf("var cards = [");
  const cardsBlock = cardsAt < 0 ? "" : homeSrc.slice(cardsAt, homeSrc.indexOf("var meName = currentUserName();", cardsAt));
  const homeCards = [...cardsBlock.matchAll(/\{ act: "(\w+)", ic: "[\w-]+", t: "([^"]+)", d: "([^"]+)" \}/g)]
    .map((m) => ({ act: m[1], title: m[2] }));
  // The acts Home withholds from a viewer-role account, read from the filter that withholds
  // them rather than from a list beside it (check 18's idiom: one source, no twin to drift).
  const viewerHiddenActs = ((cardsBlock.match(/\[((?:\s*"\w+",?)+)\]\.indexOf\(c\.act\) < 0/) || [, ""])[1]
    .match(/"(\w+)"/g) || []).map((s) => s.slice(1, -1));
  const viewerHidden = homeCards.filter((c) => viewerHiddenActs.includes(c.act)).map((c) => c.title);

  const homeSectionLabels = [...((homeSrc.match(/var HOME_SECTION_LABELS = \{([\s\S]*?)\};/) || [, ""])[1])
    .matchAll(/(?:"[\w-]+"|\w+):\s*"([^"]+)"/g)].map((m) => m[1]);

  // The two strips the Dashboards section really draws — scoped to that section's own body, so
  // the Examples section's per-pack headings (same class, an attribute in between) stay out.
  const dashAt = homeSrc.indexOf("dashboards: function () {");
  const dashBody = dashAt < 0 ? "" : braceBlockAt(homeSrc, homeSrc.indexOf("{", dashAt + 20));
  const dashStrips = [...dashBody.matchAll(/home-sub home-sub-nested">([^'<]+)/g)].map((m) => m[1].trim());

  // The workbook strip's two FIXED chips. The chips in between carry the reader's own
  // workbook names, so these are the only two a document can be held to.
  const wbChips = [(homeSrc.match(/var wbChipDefs = \[\{ id: "", name: "(\w+)"/) || [, ""])[1],
    (homeSrc.match(/\{ id: "__unfiled", name: "(\w+)"/) || [, ""])[1]].filter(Boolean);

  const deHome = (s) => s.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  // The anchor is named with its own container tag so a list closes on </ul> and not on the
  // first </li> inside it; the enumerations that sit mid-sentence get a <span> of their own
  // (check 68's idiom) so the prose around them cannot satisfy or fail a rule.
  const homeAnchor = (id, container) => {
    const block = (help.match(new RegExp(`<${container} id="${id}">([\\s\\S]*?)</${container}>`)) || [, null])[1];
    return block === null ? null : [...block.matchAll(/<strong>([\s\S]*?)<\/strong>/g)].map((m) => deHome(m[1]));
  };
  const cardsSaid = homeAnchor("home-quick-cards", "ul");
  const viewerSaid = homeAnchor("home-viewer-cards", "span");
  const sectionsSaid = homeAnchor("home-sections", "li");
  const stripsSaid = homeAnchor("home-dashboards-strips", "span");
  const chipsSaid = homeAnchor("home-workbook-chips", "li");

  const homePremise = ok(`app/studio.js: Home's own page parsed for check 69 ` +
    `(${homeCards.length} quick-start card(s), ${viewerHidden.length} hidden from a viewer, ` +
    `${homeSectionLabels.length} content section(s), ${dashStrips.length} strip(s) in Dashboards, ` +
    `workbook chips: ${wbChips.join(" + ") || "(none)"})`,
    homeCards.length >= 6 && viewerHiddenActs.length >= 1 &&
      viewerHiddenActs.every((a) => homeCards.some((c) => c.act === a)) &&
      homeSectionLabels.length >= 4 && dashStrips.length >= 2 && wbChips.length === 2 &&
      cardsSaid && viewerSaid && sectionsSaid && stripsSaid && chipsSaid,
    `cards: ${homeCards.map((c) => `${c.title} (${c.act})`).join(" · ") || "(unparsed)"}\n      ` +
    `viewer-hidden acts: ${viewerHiddenActs.join(", ") || "(unparsed)"}` +
    `${viewerHiddenActs.filter((a) => !homeCards.some((c) => c.act === a)).length
      ? ` — unknown to the card grid: ${viewerHiddenActs.filter((a) => !homeCards.some((c) => c.act === a)).join(", ")}` : ""}\n      ` +
    `HOME_SECTION_LABELS: ${homeSectionLabels.join(" · ") || "(unparsed)"}\n      ` +
    `Dashboards strips: ${dashStrips.join(" · ") || "(unparsed)"}\n      ` +
    `docs/index.html anchors — cards: ${cardsSaid ? "ok" : "MISSING"}, viewer: ${viewerSaid ? "ok" : "MISSING"}, ` +
    `sections: ${sectionsSaid ? "ok" : "MISSING"}, strips: ${stripsSaid ? "ok" : "MISSING"}, ` +
    `chips: ${chipsSaid ? "ok" : "MISSING"}`);

  if (homePremise) {
    const bothWays = (want, got) => ({
      missing: want.filter((w) => !got.includes(w)),
      stray: got.filter((g) => !want.includes(g)),
    });

    // (a) every card on the grid, and nothing else. The stray half matters as much as the
    // missing one: "Sample dashboards" is conditional already, and a retired card would
    // otherwise sit in the list forever sending readers to a button that is not there.
    const cardTitles = homeCards.map((c) => c.title);
    const cardD = bothWays(cardTitles, cardsSaid);
    ok(`docs/index.html: #home-quick-cards names the ${cardTitles.length} quick-start card(s) Home renders, and no others`,
      !cardD.missing.length && !cardD.stray.length,
      `on the grid, not documented: ${cardD.missing.join(", ") || "(none)"}\n      ` +
      `documented, not on the grid: ${cardD.stray.join(", ") || "(none)"}\n      ` +
      "these are the words on the buttons — the card grid is the whole above-the-fold of Home");

    // (b) the four the builder gate removes. Named, not counted: a reader who cannot see a
    // card needs to know which ones are missing and why, not how many.
    const viewerD = bothWays(viewerHidden, viewerSaid);
    ok(`docs/index.html: #home-viewer-cards names exactly the ${viewerHidden.length} card(s) Home hides from a viewer-role account`,
      !viewerD.missing.length && !viewerD.stray.length,
      `hidden by the filter, not named: ${viewerD.missing.join(", ") || "(none)"}\n      ` +
      `named as hidden, still offered: ${viewerD.stray.join(", ") || "(none)"}`);

    // (c) the section labels, verbatim — the drift was two paraphrases ("Pinned", "Favorites")
    // for headings that print something else, which is the one thing a reader scans for.
    const secD = bothWays(homeSectionLabels, sectionsSaid);
    ok(`docs/index.html: #home-sections names the ${homeSectionLabels.length} section heading(s) Home renders, verbatim`,
      !secD.missing.length && !secD.stray.length,
      `rendered as a heading, not named: ${secD.missing.join(", ") || "(none)"}\n      ` +
      `named, not a heading Home renders: ${secD.stray.join(", ") || "(none)"}\n      ` +
      "paraphrasing a heading is the expensive kind of near-miss — the reader scans for the word");

    // (d) both strips inside Dashboards. The chapter already pointed at "Recent dashboards"
    // from its Clear-recents bullet; "Pinned" is the one that was invisible.
    const stripD = bothWays(dashStrips, stripsSaid);
    ok(`docs/index.html: #home-dashboards-strips names both strip(s) the Dashboards section draws (${dashStrips.join(", ")})`,
      !stripD.missing.length && !stripD.stray.length,
      `drawn, not named: ${stripD.missing.join(", ") || "(none)"}\n      ` +
      `named, not drawn: ${stripD.stray.join(", ") || "(none)"}\n      ` +
      "pinned dashboards and Pinned Views are different sections — leaving one unnamed is why they get confused");

    // (e) the workbook strip's two fixed chips (the per-workbook chips in between are the
    // reader's own names, so only the fixed pair can be held).
    const chipD = bothWays(wbChips, chipsSaid);
    ok(`docs/index.html: #home-workbook-chips names the ${wbChips.length} fixed chip(s) Home's workbook strip renders`,
      !chipD.missing.length && !chipD.stray.length,
      `rendered by wbChipDefs, not named: ${chipD.missing.join(", ") || "(none)"}\n      ` +
      `named as a fixed chip, not rendered: ${chipD.stray.join(", ") || "(none)"}`);
  }
}

/* ── Check 70 — the keyboard chords Help prints OUTSIDE its shortcuts table ────
   N7, and check 36's move one ALTITUDE up rather than one document over. Check 36 holds
   Help's <table class="kbd-table"> to the app's "?" panel and to the keydown block behind it,
   and its own header says so: "Scoped to the TABLE, not the whole section". Nothing had ever
   read a chord Help prints anywhere ELSE on the page — and the page prints nineteen of them
   outside that table, 1,500 lines above it.

   Measured 2026-08-10, before the fix. The Undo / Redo chapter published the exact chord
   check 36 had just deleted from the table:
   · **`Shift Z` to redo — a chord the builder has never had.** Same defect, same page, same
     week: v923 fixed the table's Redo row and the prose keeps the corpse alive. The handler is
     one block opening `if (!(e.metaKey || e.ctrlKey)) return;`, so bare Shift+Z reaches
     nothing. Rule (b) is that early return stated at page altitude — check 36's rule (c) with
     the table cut out instead of cut to.
   · **And the chapter named ONE of the three chords its own two buttons fire.** The undo/redo
     branches implement `Ctrl/⌘+Z`, `Ctrl/⌘+Shift+Z` and `Ctrl/⌘+Y`; the chapter had undo, a
     chord that does not exist, and no mention of either real redo — so a reader who wanted to
     redo could not get there from the chapter about redoing. The Windows alias `Ctrl/⌘+Y` was
     added to the table by v923 and to the panel by the same slice; this is the third document.

   The chain is transitive on purpose: rule (c) holds the prose to the "?" panel, and check 36
   already holds that panel to the handler — so a retired chord has to be deleted in one place,
   not three. Rule (d) reads the handler directly instead, because it needs each branch's own
   ACTION (which chords are redo) and not just the chord inventory.

   Two premises and three rules:
   (a) — the premises, split in two on purpose: the page-wide parse gates (b)/(c), the anchor
       parse gates (d). A single premise would have let the missing anchor SILENCE the rule the
       real drift was failing, which is the pre-fix tree this check was written against;
   (b) no letter chord without Ctrl/⌘ anywhere in the prose (this is what `Shift Z` failed);
   (c) every Ctrl/⌘ letter chord the prose prints is one the "?" panel publishes — the
       negative half, so a retired chord cannot outlive its removal in a paragraph;
   (d) the Undo / Redo chapter names exactly the chords the handler's `undoAct()`/`redoAct()`
       branches fire, both directions.

   A FOURTH rule was written and then deleted, which is worth recording so nobody writes it
   again: this chapter's phone route ("⋯ More → Undo" / "→ Redo") is ALREADY held — check 21
   resolves every ⋯ More route Help names against #menuMore's markup, page-wide, and its
   mutation fails right beside this check's. Check 13's header says docs/index.html is out of
   ITS scope, which reads like a gap and is not one: check 21 covers the page. Adopting the
   existing check beats minting a rival for it (N44 slice 1's lesson, one tool over). */
{
  // Help minus the table check 36 owns — every rule below reads the remainder, so the two
  // checks partition the page rather than overlapping on it.
  const helpProse = help.replace(/<table class="kbd-table">[\s\S]*?<\/table>/, " ");
  // Two spellings the page uses that `chordsOf` (check 36's parser, written for the table's
  // own "Ctrl / ⌘  +  Shift+Z" style) would otherwise read as gestures and skip: the prose
  // writes "⌘K" closed up and "Ctrl-K" hyphenated. Normalised HERE rather than in chordsOf,
  // so check 36's cells keep parsing exactly as they did. How a chord is SPELLED is editorial
  // and stays unheld; what it resolves to is not.
  const openUp = (cell) => cell.replace(/(⌘|Ctrl|Shift|Alt)(?=[A-Za-z])/g, "$1 ").replace(/-(?=[A-Za-z])/g, " ");
  const proseCells = [...helpProse.matchAll(/<kbd>([^<]+)<\/kbd>/g)].map((m) => openUp(m[1].trim()));

  // The undo/redo branches of the SAME keydown block check 36 reads, but kept per-action:
  // each `else if` is one branch, each `||` disjunct one chord, and the call inside the branch
  // body says what that chord does. That is what lets rule (d) ask for completeness — "name
  // every chord that redoes" — rather than only "invent none".
  const chordsByAction = (() => {
    const src = read("app/studio.js");
    const at = src.indexOf("if (!(e.metaKey || e.ctrlKey)) return;");
    if (at < 0) throw new Error("doc-truth: the Ctrl/⌘ keydown block not found in app/studio.js");
    let depth = 1, i = at;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) break;
    }
    const out = new Map();
    for (const branch of src.slice(at, i).split(/\belse if\b|\bif\b/).slice(1)) {
      const act = (branch.match(/\b(\w+Act)\(\)/) || [, null])[1];
      if (!act) continue;
      for (const disjunct of (branch.split("{")[0] || "").split("||")) {
        const letter = disjunct.match(/k === "([a-z])"/);
        if (!letter) continue;
        const shift = /(?<!!)e\.shiftKey/.test(disjunct);
        if (!out.has(act)) out.set(act, new Set());
        out.get(act).add(canon([...(shift ? ["mod", "shift"] : ["mod"]), letter[1]]));
      }
    }
    return out;
  })();
  const historyChords = new Set([...(chordsByAction.get("undoAct") || []), ...(chordsByAction.get("redoAct") || [])]);

  const undoBlock = (helpProse.match(/<h3 id="undo-redo">[\s\S]*?<\/p>/) || [, null])[0] || null;
  const undoCells = undoBlock ? [...undoBlock.matchAll(/<kbd>([^<]+)<\/kbd>/g)].map((m) => openUp(m[1].trim())) : [];

  // Two premises, not one, and the split is deliberate: rules (b)/(c) read the whole page and
  // must keep running even when the anchor rules (d)/(e) cannot — the pre-fix tree had no
  // #undo-redo anchor at all (it is part of this slice), and a single premise would have made
  // the missing anchor SILENCE the page-wide rule the drift was failing.
  const chordPremise = ok(`docs/index.html + app/studio.js: the prose chords parsed for check 70 ` +
    `(${proseCells.length} <kbd> outside the table, history chords: ${prettyList(historyChords)})`,
    proseCells.length > 5 && panelChords.size > 0 &&
      (chordsByAction.get("undoAct") || new Set()).size > 0 && (chordsByAction.get("redoAct") || new Set()).size > 1,
    `undoAct: ${prettyList(chordsByAction.get("undoAct") || [])} · ` +
    `redoAct: ${prettyList(chordsByAction.get("redoAct") || [])}\n      ` +
    "an empty parse would pass every rule below while measuring nothing — check 36's premise, one altitude up");
  const anchorPremise = ok(`docs/index.html: the #undo-redo chapter parsed for check 70 (${undoCells.length} <kbd>)`,
    !!undoBlock && undoCells.length > 0,
    `#undo-redo: ${undoBlock ? "found" : "MISSING"} — rules (d) and (e) read that anchor, and a ` +
    "chapter that loses it would otherwise pass both by naming nothing");

  if (chordPremise) {
    const proseChords = chordSet(proseCells);

    // (b) the early return, at page altitude. `Shift Z` lived here for months precisely because
    // check 36 stops at the table's edge.
    const proseModless = [...proseChords].filter((c) => c.split("+").some((t) => LETTER.test(t)) && !c.split("+").includes("mod"));
    ok("docs/index.html: every letter chord its PROSE documents names Ctrl/⌘, not just Shift",
      !proseModless.length,
      `documented without a modifier: ${prettyList(proseModless)}\n      ` +
      "app/studio.js's chord handler opens with `if (!(e.metaKey || e.ctrlKey)) return;` — a bare " +
      "letter reaches nothing, and check 36 only ever read the shortcuts table");

    // (c) the negative half, against the panel check 36 holds to the handler.
    const proseInvented = [...proseChords].filter((c) => c.includes("mod") && c.split("+").some((t) => LETTER.test(t)) && !panelChords.has(c));
    ok("docs/index.html: its prose documents no Ctrl/⌘ chord the app's \"?\" panel does not publish",
      !proseInvented.length,
      `in Help's prose, not in the app's panel: ${prettyList(proseInvented)}\n      ` +
      "a chord named in a paragraph is as real to a reader as one in the table, and outlives its " +
      "removal just as long");

  }

  if (anchorPremise) {
    // (d) completeness, both directions — the chapter ABOUT undo and redo is the one place a
    // reader is entitled to the whole set.
    const undoChords = chordSet(undoCells);
    const undoMissing = [...historyChords].filter((c) => !undoChords.has(c));
    const undoStray = [...undoChords].filter((c) => !historyChords.has(c));
    ok(`docs/index.html: #undo-redo names the ${historyChords.size} chord(s) the builder's undo/redo really fire (${prettyList(historyChords)})`,
      !undoMissing.length && !undoStray.length,
      `fired by undoAct()/redoAct(), not named: ${prettyList(undoMissing)}\n      ` +
      `named here, fired by neither: ${prettyList(undoStray)}\n      ` +
      "the chapter about redoing is where a reader looks for the chord that redoes");

  }
}

/* ── 71. the VIEWER's own top bar vs the chapter that documents it ───────────────────────
   N7, and the CHROME of the app's second page. Checks 16–21 hold the builder's chrome, 49 the
   app bar, 69 Home — every one of them inside app/index.html. `app/viewer.html` is a second,
   standalone document, and the one thing ever read from it was the export MENU (check 37, whose
   rule (c) holds this chapter's format list in the missing direction). The BAR around that menu
   — its buttons, its badge, and what a phone does to both — answered to nothing.

   Measured 2026-08-10, before the fix:
   · **Help named an "Edit in Studio" button. The bar renders "Edit in Dashboard Builder".**
     Not a paraphrase — the label was RENAMED in a67d30c ("LIVE-a slice 2: sweep remaining
     Explore/Studio strings to Quick Views/Dashboard Builder"), which swept the app and left
     the Help page behind. The sentence had been written with the button itself, in d73dc81
     (LF23 slice 2), and was true the day it landed. Its two neighbours, **Save a copy** and
     **Export**, are still right, which is exactly what makes a stale third one expensive: the
     reader has no reason to doubt the list.
   · **The chapter documented the bar in the desktop's terms only.** `app/studio.css`'s
     `@media(max-width:640px)` block drops the "Viewer — read-only" badge outright and hides
     every `.viewer-btn-txt` label plus the export caret, so on a phone the three actions are
     icons alone and the badge that tells you the page is read-only is gone. Help has a whole
     `#phone-more` chapter for the BUILDER's toolbar (check 21) and gave the viewer nothing —
     and the viewer is the route a reader is most likely to open on a phone, because it is the
     one you send someone in a link.

   Sources of truth, all app-side: `app/viewer.html`'s `#viewerBar` — the labelled controls it
   REVEALS (`hidden` in the markup, un-hidden by viewer.js once the dashboard loads), the badge's
   own text, and the export menu's `data-exp` items — plus the phone band read off
   `app/studio.css`'s own media query rather than a number kept here. Four rules:
   (a) the actions list names every revealed control, by the label the bar prints, and no other
       — the FIRST <strong> in each <li> is the control that bullet documents, so the role words
       later in a bullet cannot satisfy or fail it (check 68/69's scoping idiom);
   (b) the phone paragraph names the real band, the badge the band drops, and every action whose
       label it hides;
   (c) the export menu's items, both directions, inside their own span — check 37 (c) already
       asks that none go UNNAMED; this adds the negative half (the check-24→28 move, one
       direction over) in a span of its own, so the paragraph's own bolded "Export" and the
       prose around it can neither satisfy nor fail it;
   (d) the "no ⋯ menu here" claim answers to viewer.html — the day the viewer grows one, the
       sentence sending readers to the builder's must go with it. */
{
  const viewerHtml = read("app/viewer.html");
  const barAt = viewerHtml.indexOf('<div id="viewerBar">');
  const bar = barAt < 0 ? "" : viewerHtml.slice(barAt, viewerHtml.indexOf('<div id="viewerStage">', barAt));

  // The bar's own controls. A control is an ACTION here if the markup ships it `hidden` —
  // viewer.js reveals it once the dashboard (and, for Edit, the account's role) checks out.
  // That is the structural difference between the three actions and the always-there back
  // link, so the split is derived rather than a list kept beside them.
  const barControls = [...bar.matchAll(/<(?:button|a) id="(viewer\w+)"([^>]*)>[\s\S]*?<span class="viewer-btn-txt">([^<]+)<\/span>/g)]
    .map((m) => ({ id: m[1], revealed: /\shidden\b/.test(m[2]), label: m[3].trim() }));
  const barActions = barControls.filter((c) => c.revealed).map((c) => c.label);
  const barBadge = ((bar.match(/<span class="viewer-badge">([^<]+)<\/span>/) || [, ""])[1]).trim();
  const exportItems = [...bar.matchAll(/data-exp="\w+"><span data-ic="[\w-]+"><\/span>([^<]+)</g)]
    .map((m) => m[1].trim());

  // The phone band the viewer bar really collapses at, found by the rule that drops the badge
  // rather than by matching a width — so a re-banded stylesheet re-bands the check with it.
  const viewerPhone = (() => {
    const css = read("app/studio.css");
    const at = /@media\s*([^{]*)\{/g;
    let m;
    while ((m = at.exec(css))) {
      let depth = 1, i = at.lastIndex;
      for (; i < css.length && depth; i++) { if (css[i] === "{") depth++; else if (css[i] === "}") depth--; }
      const block = css.slice(at.lastIndex, i - 1).replace(/\/\*[\s\S]*?\*\//g, "");
      if (!/\.viewer-badge\s*\{[^}]*display\s*:\s*none/.test(block)) continue;
      const hides = [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((r) => /display\s*:\s*none/.test(r[2]))
        .flatMap((r) => r[1].split(",").map((s) => s.trim()));
      return { band: (m[1].match(/max-width:\s*(\d+)px/) || [, null])[1], hides };
    }
    return null;
  })();

  const deV = (s) => s.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  const blockById = (id, tag) => (help.match(new RegExp(`<${tag} id="${id}"[^>]*>([\\s\\S]*?)</${tag}>`)) || [, null])[1];

  // The premise reads the APP only. The three anchors below are part of this slice, and gating
  // on them would have let the pre-fix page pass in silence (check 70's split, same reason).
  const viewerPremise = ok(`app/viewer.html + app/studio.css: the viewer's top bar parsed for check 71 ` +
    `(actions: ${barActions.join(" · ") || "(none)"}; badge: ${JSON.stringify(barBadge)}; ` +
    `${exportItems.length} export format(s); phone band: ${viewerPhone ? viewerPhone.band + "px" : "(unparsed)"})`,
    barActions.length >= 3 && !!barBadge && exportItems.length >= 3 &&
      !!viewerPhone && !!viewerPhone.band && viewerPhone.hides.includes(".viewer-btn-txt"),
    `controls: ${barControls.map((c) => `${c.label} (#${c.id}${c.revealed ? ", revealed" : ""})`).join(" · ") || "(unparsed)"}\n      ` +
    `export menu: ${exportItems.join(" · ") || "(unparsed)"}\n      ` +
    `phone block hides: ${viewerPhone ? viewerPhone.hides.join(" · ") : "(no @media drops .viewer-badge)"}`);

  if (viewerPremise) {
    // (a) the actions list — the drift was here, and in both directions at once.
    const actsBlock = blockById("viewer-bar-actions", "ul");
    const actsSaid = actsBlock === null ? null
      : [...actsBlock.matchAll(/<li>([\s\S]*?)<\/li>/g)]
        .map((m) => (m[1].match(/<strong>([\s\S]*?)<\/strong>/) || [, ""])[1])
        .map(deV).filter(Boolean);
    ok(`docs/index.html: #viewer-bar-actions names the ${barActions.length} action(s) the viewer's bar renders, by their own labels`,
      !!actsSaid && !barActions.filter((a) => !actsSaid.includes(a)).length &&
        !actsSaid.filter((a) => !barActions.includes(a)).length,
      actsSaid === null ? "docs/index.html has no <ul id=\"viewer-bar-actions\"> — the viewer's bar is documented nowhere a check can read"
        : `on the bar, not documented: ${barActions.filter((a) => !actsSaid.includes(a)).join(", ") || "(none)"}\n      ` +
          `documented, not on the bar: ${actsSaid.filter((a) => !barActions.includes(a)).join(", ") || "(none)"}\n      ` +
          "these are the words printed on the buttons — a renamed one outlives its rename in a reader's head");

    // (b) the phone half. Every action carries a .viewer-btn-txt, so the band that hides that
    // class hides all three labels; the badge goes entirely.
    const phoneBlock = blockById("viewer-bar-phone", "p");
    const phoneTxt = phoneBlock === null ? null : deV(phoneBlock.replace(/<[^>]+>/g, " "));
    const phoneMissing = phoneTxt === null ? [] : [
      ...(phoneTxt.includes(viewerPhone.band + "px") ? [] : [`the band (${viewerPhone.band}px)`]),
      ...(phoneTxt.includes(barBadge) ? [] : [`the badge it drops (${barBadge})`]),
      ...barActions.filter((a) => !phoneTxt.includes(a)).map((a) => `the label it hides (${a})`),
    ];
    ok(`docs/index.html: #viewer-bar-phone states what the ${viewerPhone.band}px band does to the viewer's bar`,
      phoneTxt !== null && !phoneMissing.length,
      phoneTxt === null ? "docs/index.html has no <p id=\"viewer-bar-phone\"> — the chapter documents the bar in the desktop's terms only, "
        + `while app/studio.css drops ${viewerPhone.hides.join(" + ")} below the band`
        : `not stated: ${phoneMissing.join("; ")}\n      ` +
          "the viewer is the route you send someone in a link, so it is the one most often opened on a phone");

    // (c) the formats, both directions, in their own span.
    const fmtBlock = blockById("viewer-export-formats", "span");
    const fmtSaid = fmtBlock === null ? null
      : [...fmtBlock.matchAll(/<strong>([\s\S]*?)<\/strong>/g)].map((m) => deV(m[1]));
    ok(`docs/index.html: #viewer-export-formats names the ${exportItems.length} format(s) the viewer's Export menu offers, and no others`,
      !!fmtSaid && !exportItems.filter((f) => !fmtSaid.includes(f)).length &&
        !fmtSaid.filter((f) => !exportItems.includes(f)).length,
      fmtSaid === null ? "docs/index.html has no <span id=\"viewer-export-formats\">"
        : `in the menu, not named: ${exportItems.filter((f) => !fmtSaid.includes(f)).join(", ") || "(none)"}\n      ` +
          `named, not in the menu: ${fmtSaid.filter((f) => !exportItems.includes(f)).join(", ") || "(none)"}\n      ` +
          "the builder's own Export menu is check 37's — this is the shorter list the viewer really has, " +
          "and the stray half is the direction check 37 (c) leaves open");

    // (d) the negative half of (b): the sentence that sends a phone reader to the BUILDER's
    // ⋯ More is only safe while this page has no ⋯ of its own.
    const viewerHasMore = /id="menuMore"|⋯/.test(bar);
    ok("app/viewer.html: the viewer's bar still has no ⋯ More menu, as #viewer-bar-phone tells readers",
      !viewerHasMore,
      "the bar grew a ⋯ menu — #viewer-bar-phone's \"the viewer has no ⋯ menu at all\" is now wrong, " +
      "and check 21's route rules apply to this page too");
  }
}

console.log(failed ? `\n✗ doc-truth: ${failed} claim(s) have drifted from the source of truth`
  : "\n✅ doc-truth: every published claim matches the source it describes");
process.exit(failed ? 1 : 0);
