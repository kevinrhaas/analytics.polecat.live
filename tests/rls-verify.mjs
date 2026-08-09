// rls-verify.mjs — is THIS LIVE DATABASE actually secure, right now?
//
//   SUPABASE_URL=… SUPABASE_ANON_KEY=… node tests/rls-verify.mjs
//   node tests/rls-verify.mjs --self-test     (offline; proves the classifier)
//
// HOW THIS DIFFERS FROM tests/rls.mjs, because the two are easy to confuse and
// they answer different questions:
//
//   rls.mjs        "do our SQL FILES produce a secure database?" It installs
//                  the seven shipped postures into throwaway schemas and asserts
//                  an unauthorized read is refused. It is a test of the files,
//                  so it can run against ANY project (we point it at dev) and it
//                  needs the database password because it does DDL.
//
//   rls-verify.mjs "is THIS database secure right now?" It reads nothing but
//                  the live posture of one specific project. Live databases
//                  drift in ways no file test can see: a policy dropped by hand
//                  during debugging, a go-live that half-applied, a legacy
//                  allow-all policy re-created by someone following an old
//                  runbook (that exact regression is why
//                  tools/supabase-rls-real.sql drops policies BY NAME —
//                  Postgres PERMISSIVE policies OR together, so one leftover
//                  allow-all silently defeats every tighter policy beside it).
//
// WHY THE REST API AND NOT psql. supabase-deploy.sql § 8 verifies with
// `set local role anon` over a direct connection. This asks the same question
// through the door an attacker actually uses: PostgREST with the publishable
// key. Three benefits, and the third is the one that matters for production:
//   1. it exercises the real surface (grants AND policies AND PostgREST's own
//      exposure rules — `set role` alone would miss a table left exposed by a
//      grant the policies were meant to neutralise),
//   2. it is read-only by construction — GET requests, nothing else,
//   3. it needs NO database password. Verifying production costs only the
//      publishable key, which is already public in app/workspaces.js.
//
// WHAT AN ANONYMOUS READ CAN AND CANNOT PROVE (N27, 2026-08-08). Any row
// returned to an anonymous caller is a FAILURE, full stop — that half is
// absolute and needs no help. The other half does not follow: a table that
// answers `HTTP 200, []` has proved nothing on its own, because a table with
// NO ROWS IN IT answers exactly the same way as a table whose policies are
// working perfectly. That is not a hypothetical. On this check's first run
// against `polecat_dev` (2026-08-08), `connections`, `analyses`, `jobs` and
// `users` all reported "ok — zero rows" on a database that was demonstrably
// NOT on the authenticated-only posture: `dashboards` and `datasets` were
// leaking beside them. They were clean only because they were empty, and the
// old summary line — "no table is readable by an anonymous caller" — read as
// if their policies had been tested. So each table is now classified against
// whether it HOLDS anything:
//
//   protected     the door is shut, and we know it because there was something
//                 behind it: rows exist and anon got none — or anon was refused
//                 / not exposed at all, which is conclusive whatever is inside.
//   empty         anon got no rows, and neither does anyone else — INCONCLUSIVE.
//                 Not a failure (an empty table leaks nothing today) but not a
//                 pass either, and the summary says so out loud.
//   leaking       rows came back to an anonymous caller. FAILURE.
//
// The evidence for "does this table hold rows" is OPTIONAL and comes from
// either of two places — the anon path stays credential-free, which is the
// property that makes it safe to aim at production:
//
//   SUPABASE_SERVICE_KEY   (or SUPABASE_SERVICE_ROLE_KEY) — a privileged key.
//                          Same read, same shape, still GET-only: `?select=id&
//                          limit=1`, never printed, never used for anything but
//                          counting to one. Measured evidence, so it wins.
//   VERIFY_EXPECT_ROWS     a comma-separated list of tables DECLARED to hold
//                          rows (e.g. "dashboards,datasets,users"). Costs no
//                          secret; worth exactly what the declaration is worth,
//                          and it is labelled "declared" in the output.
//
// With neither set, every 200/[] table is reported inconclusive and the run
// still exits 0. Downgrading is the point: a missing optional identity must
// never turn a secure database red, and must never be quietly upgraded into a
// pass it did not earn.
//
// NOT CONFIGURED = FAILURE, deliberately, and this is the opposite of rls.mjs's
// SKIP-on-no-password. A security verify that silently passes when it was never
// wired up is worse than no verify at all: it reads green forever. rls.mjs may
// skip because it is one check among thousands in a suite; this one exists only
// to answer a yes/no question about production, so it must never answer "yes"
// by default. (That rule is about the ANON credentials, which are the check
// itself. The corroborating identity above is an accuracy upgrade, not the
// check, so its absence downgrades rather than fails.)
//
// EXIT CODES, unchanged by N27 so the workflows keep their meaning:
//   0  no rows reached an anonymous caller (some tables may be inconclusive)
//   1  at least one table LEAKED
//   2  at least one table gave no usable answer (unreachable / unexpected)
"use strict";

import { pathToFileURL } from "node:url";

// The six workspace tables plus the two ACTIVITY-1 log tables. The log tables
// have no anon policies at all, so they are zero by construction — they are
// listed anyway so that ADDING an anon policy to one shows up here.
export const TABLES = [
  "dashboards", "connections", "datasets", "analyses", "jobs", "users",
  "polecat_activity", "polecat_feedback",
];

// ---------------------------------------------------------------------------
// The classifier — pure, so `--self-test` can prove it without a database.
// ---------------------------------------------------------------------------

// anon:     { state, detail } from readAsAnon()
// evidence: { holdsRows: true|false|null, source: "service"|"declared"|null }
//           holdsRows === null means "we never found out".
export function classify(anon, evidence) {
  const ev = evidence || { holdsRows: null, source: null };
  switch (anon.state) {
    case "LEAK":
      return { verdict: "leaking", detail: anon.detail };
    case "unreachable":
    case "unexpected":
      return { verdict: "noanswer", detail: anon.detail };
    // A refusal and a 404 are conclusive on their own: whatever the table holds,
    // the anonymous caller never got to the contents. Corroboration adds nothing.
    case "refused":
      return { verdict: "protected", detail: `${anon.detail} — anon is refused outright` };
    case "absent":
      return { verdict: "protected", detail: `${anon.detail}` };
    case "empty":
      if (ev.holdsRows === true) {
        return {
          verdict: "protected",
          detail: ev.source === "service"
            ? "HTTP 200, zero rows — and a privileged read finds rows, so the policies are what stopped anon"
            : "HTTP 200, zero rows — declared non-empty, so the policies are what stopped anon",
        };
      }
      if (ev.holdsRows === false) {
        return {
          verdict: "empty",
          detail: "HTTP 200, zero rows — and the table really is empty, so nothing was proven",
        };
      }
      return {
        verdict: "empty",
        detail: "HTTP 200, zero rows — but nothing says the table holds any, so nothing was proven",
      };
    default:
      return { verdict: "noanswer", detail: `unclassified state "${anon.state}"` };
  }
}

// Rolls the per-table verdicts into the counts the summary line reports.
export function summarize(rows) {
  const counts = { protected: 0, empty: 0, leaking: 0, noanswer: 0 };
  for (const r of rows) counts[r.verdict] = (counts[r.verdict] || 0) + 1;
  return {
    ...counts,
    total: rows.length,
    // "3 protected, 2 empty (inconclusive), 1 leaking" — the sentence the item
    // asked for. Zero-count classes are dropped so a clean run stays quiet.
    line: [
      counts.protected ? `${counts.protected} protected` : "",
      counts.empty ? `${counts.empty} empty (inconclusive)` : "",
      counts.leaking ? `${counts.leaking} leaking` : "",
      counts.noanswer ? `${counts.noanswer} no answer` : "",
    ].filter(Boolean).join(", ") || "nothing checked",
  };
}

const MARK = { leaking: "LEAK", protected: "ok  ", empty: "~   ", noanswer: "??  " };

// ---------------------------------------------------------------------------
// The live reads
// ---------------------------------------------------------------------------

// limit=1 keeps this cheap: we only need to know whether ANY row comes back,
// never how many. Prefer count=exact would be a heavier query for no gain.
async function getOne(urlBase, table, key) {
  const url = `${urlBase}/rest/v1/${table}?select=id&limit=1`;
  let res;
  try {
    res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  } catch (e) {
    return { status: 0, error: (e && e.message) || String(e) };
  }
  if (!res.ok) return { status: res.status };
  let body;
  try { body = await res.json(); } catch (e) { return { status: res.status, bad: "non-JSON 200" }; }
  if (!Array.isArray(body)) return { status: res.status, bad: "200 but body is not an array" };
  return { status: res.status, rows: body.length };
}

export async function readAsAnon(urlBase, table, key) {
  const r = await getOne(urlBase, table, key);
  if (r.status === 0) return { table, state: "unreachable", detail: r.error };
  if (r.status === 401 || r.status === 403) return { table, state: "refused", detail: `HTTP ${r.status}` };
  if (r.status === 404) return { table, state: "absent", detail: "HTTP 404 — not exposed or does not exist" };
  if (r.bad) return { table, state: "unexpected", detail: r.bad };
  if (r.rows === undefined) return { table, state: "unexpected", detail: `HTTP ${r.status}` };
  return r.rows === 0
    ? { table, state: "empty", detail: "HTTP 200, zero rows" }
    : { table, state: "LEAK", detail: `HTTP 200, ${r.rows} row(s) readable by anon` };
}

// The corroborating read. Never throws, never prints the key, and any failure
// simply means "we did not find out" — it must not redden a run.
export async function holdsRowsPrivileged(urlBase, table, key) {
  const r = await getOne(urlBase, table, key);
  if (r.status === 200 && r.rows !== undefined) return r.rows > 0;
  return null;
}

// ---------------------------------------------------------------------------
// --self-test — the classifier, offline. Wired into tests/run.js so the matrix
// below travels with the suite rather than with whoever remembers to run it.
// ---------------------------------------------------------------------------

async function selfTest() {
  let passed = 0, failed = 0;
  const is = (name, got, want) => {
    if (got === want) { passed++; console.log(`  ✓ ${name}`); }
    else { failed++; console.error(`  ✗ ${name} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
  };
  const none = { holdsRows: null, source: null };
  const has = { holdsRows: true, source: "service" };
  const declared = { holdsRows: true, source: "declared" };
  const hasnt = { holdsRows: false, source: "service" };

  console.log("rls-verify --self-test: the protected / empty / leaking classifier\n");

  // The absolute half: a row reaching anon is a leak whatever else we know.
  is("a row returned to anon is a leak (no corroboration)",
    classify({ state: "LEAK", detail: "HTTP 200, 1 row(s) readable by anon" }, none).verdict, "leaking");
  is("a row returned to anon is still a leak when the table is known non-empty",
    classify({ state: "LEAK", detail: "x" }, has).verdict, "leaking");

  // The half N27 exists for: 200/[] means different things.
  is("200/[] with NO corroboration is inconclusive, not a pass",
    classify({ state: "empty", detail: "HTTP 200, zero rows" }, none).verdict, "empty");
  is("200/[] on a table a privileged read finds rows in is a genuine pass",
    classify({ state: "empty", detail: "HTTP 200, zero rows" }, has).verdict, "protected");
  is("200/[] on a DECLARED non-empty table is a pass too",
    classify({ state: "empty", detail: "HTTP 200, zero rows" }, declared).verdict, "protected");
  is("200/[] on a table that is measurably empty stays inconclusive",
    classify({ state: "empty", detail: "HTTP 200, zero rows" }, hasnt).verdict, "empty");
  is("and the inconclusive detail says the table is empty, not that it passed",
    /nothing was proven/.test(classify({ state: "empty", detail: "" }, hasnt).detail), true);
  is("the corroborated detail names WHICH evidence it used",
    /privileged read/.test(classify({ state: "empty", detail: "" }, has).detail), true);

  // Conclusive-without-corroboration shapes.
  is("401 is protected even with nothing known about the contents",
    classify({ state: "refused", detail: "HTTP 401" }, none).verdict, "protected");
  is("403 is protected on an empty table too",
    classify({ state: "refused", detail: "HTTP 403" }, hasnt).verdict, "protected");
  is("404 (not exposed) is protected",
    classify({ state: "absent", detail: "HTTP 404 — not exposed or does not exist" }, none).verdict, "protected");

  // No answer is neither pass nor fail — the distinction that predates N27.
  is("an unreachable table is 'no answer', never a pass",
    classify({ state: "unreachable", detail: "fetch failed" }, has).verdict, "noanswer");
  is("an unexpected body is 'no answer'",
    classify({ state: "unexpected", detail: "non-JSON 200" }, none).verdict, "noanswer");
  is("an unknown state falls into 'no answer' rather than passing by default",
    classify({ state: "banana", detail: "" }, none).verdict, "noanswer");

  // The summary sentence the item specified.
  const s = summarize([
    { verdict: "protected" }, { verdict: "protected" }, { verdict: "protected" }, { verdict: "protected" },
    { verdict: "empty" }, { verdict: "empty" }, { verdict: "empty" },
    { verdict: "leaking" },
  ]);
  is("the summary counts each class", `${s.protected}/${s.empty}/${s.leaking}`, "4/3/1");
  is("and reads as the sentence the item asked for", s.line, "4 protected, 3 empty (inconclusive), 1 leaking");
  is("a clean, fully corroborated run says only what it proved",
    summarize([{ verdict: "protected" }, { verdict: "protected" }]).line, "2 protected");
  is("no-answer tables are surfaced in the sentence too",
    summarize([{ verdict: "protected" }, { verdict: "noanswer" }]).line, "1 protected, 1 no answer");

  // The reads themselves, over a stubbed fetch. The classifier above is only
  // worth what the states feeding it are worth, and this half is the part that
  // talks to production — including the read-only-by-construction claim, which
  // is now asserted rather than promised in a comment.
  console.log("\nrls-verify --self-test: the anon read, over a stubbed PostgREST\n");
  const realFetch = globalThis.fetch;
  const seen = [];
  const stub = (answer) => (url, init) => {
    seen.push({ url: String(url), init });
    if (answer.throws) return Promise.reject(new Error(answer.throws));
    return Promise.resolve({
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      json: () => (answer.bad ? Promise.reject(new Error("not json")) : Promise.resolve(answer.body)),
    });
  };
  const BASE = "https://example.supabase.co";
  try {
    globalThis.fetch = stub({ status: 200, body: [{ id: 1 }] });
    is("a row over the wire reads as LEAK", (await readAsAnon(BASE, "dashboards", "k")).state, "LEAK");
    is("the request is a GET (no method, no body) — read-only by construction",
      seen[0].init.method === undefined && seen[0].init.body === undefined, true);
    is("it asks for one id only, never the contents",
      seen[0].url, `${BASE}/rest/v1/dashboards?select=id&limit=1`);
    is("the key travels as both apikey and Bearer, the way PostgREST expects",
      seen[0].init.headers.apikey === "k" && seen[0].init.headers.Authorization === "Bearer k", true);

    globalThis.fetch = stub({ status: 200, body: [] });
    is("an empty array reads as empty", (await readAsAnon(BASE, "jobs", "k")).state, "empty");
    globalThis.fetch = stub({ status: 401 });
    is("401 reads as refused", (await readAsAnon(BASE, "jobs", "k")).state, "refused");
    globalThis.fetch = stub({ status: 403 });
    is("403 reads as refused", (await readAsAnon(BASE, "jobs", "k")).state, "refused");
    globalThis.fetch = stub({ status: 404 });
    is("404 reads as absent", (await readAsAnon(BASE, "polecat_activity", "k")).state, "absent");
    globalThis.fetch = stub({ status: 500 });
    is("a 5xx is unexpected, never a pass", (await readAsAnon(BASE, "jobs", "k")).state, "unexpected");
    globalThis.fetch = stub({ status: 200, bad: true });
    is("a non-JSON 200 is unexpected", (await readAsAnon(BASE, "jobs", "k")).state, "unexpected");
    globalThis.fetch = stub({ status: 200, body: { rows: [] } });
    is("a 200 whose body is not an array is unexpected", (await readAsAnon(BASE, "jobs", "k")).state, "unexpected");
    globalThis.fetch = stub({ throws: "getaddrinfo ENOTFOUND" });
    is("a network failure is unreachable", (await readAsAnon(BASE, "jobs", "k")).state, "unreachable");

    globalThis.fetch = stub({ status: 200, body: [{ id: 1 }] });
    is("the corroborating read says 'holds rows' when it sees one",
      await holdsRowsPrivileged(BASE, "dashboards", "svc"), true);
    globalThis.fetch = stub({ status: 200, body: [] });
    is("…and 'no rows' when it sees none", await holdsRowsPrivileged(BASE, "jobs", "svc"), false);
    globalThis.fetch = stub({ status: 401 });
    is("a rejected corroborating identity answers null — never false, which would mislead",
      await holdsRowsPrivileged(BASE, "jobs", "bad"), null);
    globalThis.fetch = stub({ throws: "boom" });
    is("and a broken corroborating read answers null too",
      await holdsRowsPrivileged(BASE, "jobs", "svc"), null);
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log(`\nrls-verify --self-test: ${failed === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed} failed`);
  return failed === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  if (process.argv.includes("--self-test")) process.exit(await selfTest());

  const URL_BASE = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const DECLARED = new Set((process.env.VERIFY_EXPECT_ROWS || "").split(",").map((s) => s.trim()).filter(Boolean));
  const LABEL = process.env.VERIFY_LABEL || URL_BASE.replace(/^https?:\/\//, "").split(".")[0] || "(unknown)";

  if (!URL_BASE || !ANON_KEY) {
    console.error("rls-verify: FATAL — SUPABASE_URL and SUPABASE_ANON_KEY are both required.");
    console.error("  This check deliberately does NOT skip: a security verify that passes when");
    console.error("  unconfigured would read green forever. Set both, or do not run it.");
    process.exit(1);
  }
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(URL_BASE)) {
    console.error(`rls-verify: FATAL — SUPABASE_URL must be https://<ref>.supabase.co (got "${URL_BASE}").`);
    process.exit(1);
  }
  const unknownDeclared = [...DECLARED].filter((t) => !TABLES.includes(t));
  if (unknownDeclared.length) {
    console.error(`rls-verify: FATAL — VERIFY_EXPECT_ROWS names table(s) this check does not read: ${unknownDeclared.join(", ")}.`);
    console.error(`  Known tables: ${TABLES.join(", ")}. A typo here would silently declare nothing.`);
    process.exit(1);
  }

  console.log(`rls-verify: anonymous read check against ${LABEL} (${URL_BASE})\n`);

  const rows = [];
  let serviceRejected = 0;
  for (const t of TABLES) {
    const anon = await readAsAnon(URL_BASE, t, ANON_KEY);
    let evidence = { holdsRows: null, source: null };
    // Only 200/[] needs corroborating — every other shape is already conclusive,
    // and asking anyway would spend a privileged request to learn nothing.
    if (anon.state === "empty") {
      if (SERVICE_KEY) {
        const held = await holdsRowsPrivileged(URL_BASE, t, SERVICE_KEY);
        if (held === null) serviceRejected++;
        else evidence = { holdsRows: held, source: "service" };
      }
      if (evidence.holdsRows === null && DECLARED.has(t)) evidence = { holdsRows: true, source: "declared" };
    }
    rows.push({ table: t, ...classify(anon, evidence) });
  }

  for (const r of rows) console.log(`  ${MARK[r.verdict]} ${r.table.padEnd(18)} ${r.detail}`);

  const s = summarize(rows);
  console.log(`\nrls-verify: ${s.line} — on ${LABEL} (${s.total} tables checked).`);

  if (serviceRejected) {
    console.log(`  Note: the corroborating identity answered nothing usable for ${serviceRejected} table(s),`);
    console.log("  so they fall back to declared/inconclusive. That is not a security finding.");
  }

  if (s.leaking) {
    console.error(`\nrls-verify: FAILED — ${s.leaking} table(s) readable by an anonymous caller on ${LABEL}.`);
    console.error("  This database is NOT on the authenticated-only posture. Re-apply");
    console.error("  tools/supabase-rls-real.sql, then look for a leftover allow-all policy:");
    console.error("    select tablename, policyname, roles, cmd from pg_policies");
    console.error("    where schemaname = 'public' order by tablename;");
    process.exit(1);
  }
  if (s.noanswer) {
    // Not a security finding, but not a pass either — we did not get an answer, and
    // "we never asked" must not be recorded as "we asked and it was fine". Same
    // distinction the app's own adapter draws between a refusal and an unreachable
    // backend (N2 slice 3 / N11 / N14).
    console.error(`\nrls-verify: INCONCLUSIVE — ${s.noanswer} table(s) gave no usable answer on ${LABEL}.`);
    process.exit(2);
  }

  // The wording the item insisted on: what was MEASURED is that nothing came
  // back, which is not the same sentence as "no table is readable".
  console.log(`\nrls-verify: PASSED — no table on ${LABEL} returned rows to an anonymous caller.`);
  if (s.empty) {
    const inconclusive = rows.filter((r) => r.verdict === "empty").map((r) => r.table);
    console.log(`  ${s.empty} of ${s.total} hold no rows (${inconclusive.join(", ")}), so this run did NOT`);
    console.log("  prove their policies work — only that there was nothing there to hand over. To");
    console.log("  upgrade them to a genuine pass, give the run something to corroborate with:");
    console.log("    SUPABASE_SERVICE_KEY=…            a privileged key (GET-only here, never logged), or");
    console.log(`    VERIFY_EXPECT_ROWS=${inconclusive.slice(0, 3).join(",")}…   tables you declare hold rows.`);
  } else {
    console.log(`  Every one of the ${s.total} is protected, not merely empty.`);
  }
}

// Importable (the classifier is exported for reuse and for the self-test) but
// only ASKS a live database when it is the thing being run.
const invokedDirectly = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) await main();
