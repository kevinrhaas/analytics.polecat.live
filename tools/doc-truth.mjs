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

console.log(failed ? `\n✗ doc-truth: ${failed} claim(s) have drifted from the source of truth`
  : "\n✅ doc-truth: every published claim matches the source it describes");
process.exit(failed ? 1 : 0);
