// rls-verify.mjs — is THIS LIVE DATABASE actually secure, right now?
//
//   SUPABASE_URL=… SUPABASE_ANON_KEY=… node tests/rls-verify.mjs
//
// HOW THIS DIFFERS FROM tests/rls.mjs, because the two are easy to confuse and
// they answer different questions:
//
//   rls.mjs        "do our SQL FILES produce a secure database?" It installs
//                  the three shipped postures into throwaway schemas and asserts
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
// WHAT COUNTS AS A PASS. For each table, an anonymous caller must come back
// with NO ROWS. Two shapes both satisfy that and both are fine:
//   * HTTP 200 with `[]` — RLS is on and no policy admits anon (the intended
//     posture; note a table with RLS and NO policy reads as empty, which is why
//     "empty" is the working state, not a broken one), or
//   * HTTP 401/403/404 — anon lacks the grant, or the table is not exposed.
// ANY row returned to an anonymous caller is a FAILURE, full stop.
//
// NOT CONFIGURED = FAILURE, deliberately, and this is the opposite of rls.mjs's
// SKIP-on-no-password. A security verify that silently passes when it was never
// wired up is worse than no verify at all: it reads green forever. rls.mjs may
// skip because it is one check among thousands in a suite; this one exists only
// to answer a yes/no question about production, so it must never answer "yes"
// by default.
"use strict";

const URL_BASE = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const LABEL = process.env.VERIFY_LABEL || URL_BASE.replace(/^https?:\/\//, "").split(".")[0] || "(unknown)";

// The six workspace tables plus the two ACTIVITY-1 log tables. The log tables
// have no anon policies at all, so they are zero by construction — they are
// listed anyway so that ADDING an anon policy to one shows up here.
const TABLES = [
  "dashboards", "connections", "datasets", "analyses", "jobs", "users",
  "polecat_activity", "polecat_feedback",
];

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

async function readAsAnon(table) {
  // limit=1 keeps this cheap: we only need to know whether ANY row comes back,
  // never how many. Prefer count=exact would be a heavier query for no gain.
  const url = `${URL_BASE}/rest/v1/${table}?select=id&limit=1`;
  let res;
  try {
    res = await fetch(url, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
  } catch (e) {
    return { table, state: "unreachable", detail: (e && e.message) || String(e) };
  }
  if (res.status === 401 || res.status === 403) return { table, state: "refused", detail: `HTTP ${res.status}` };
  if (res.status === 404) return { table, state: "absent", detail: "HTTP 404 — not exposed or does not exist" };
  if (!res.ok) return { table, state: "unexpected", detail: `HTTP ${res.status}` };
  let body;
  try { body = await res.json(); } catch (e) { return { table, state: "unexpected", detail: "non-JSON 200" }; }
  if (!Array.isArray(body)) return { table, state: "unexpected", detail: "200 but body is not an array" };
  return body.length === 0
    ? { table, state: "empty", detail: "HTTP 200, zero rows" }
    : { table, state: "LEAK", detail: `HTTP 200, ${body.length} row(s) readable by anon` };
}

const results = [];
for (const t of TABLES) results.push(await readAsAnon(t));

let failures = 0, unreachable = 0;
console.log(`rls-verify: anonymous read check against ${LABEL} (${URL_BASE})\n`);
for (const r of results) {
  if (r.state === "LEAK") { failures++; console.log(`  LEAK ${r.table.padEnd(18)} ${r.detail}`); }
  else if (r.state === "unreachable" || r.state === "unexpected") { unreachable++; console.log(`  ??   ${r.table.padEnd(18)} ${r.detail}`); }
  else console.log(`  ok   ${r.table.padEnd(18)} ${r.detail}`);
}

console.log("");
if (failures) {
  console.error(`rls-verify: FAILED — ${failures} table(s) readable by an anonymous caller on ${LABEL}.`);
  console.error("  This database is NOT on the authenticated-only posture. Re-apply");
  console.error("  tools/supabase-rls-real.sql, then look for a leftover allow-all policy:");
  console.error("    select tablename, policyname, roles, cmd from pg_policies");
  console.error("    where schemaname = 'public' order by tablename;");
  process.exit(1);
}
if (unreachable) {
  // Not a security finding, but not a pass either — we did not get an answer, and
  // "we never asked" must not be recorded as "we asked and it was fine". Same
  // distinction the app's own adapter draws between a refusal and an unreachable
  // backend (N2 slice 3 / N11 / N14).
  console.error(`rls-verify: INCONCLUSIVE — ${unreachable} table(s) gave no usable answer on ${LABEL}.`);
  process.exit(2);
}
console.log(`rls-verify: PASSED — no table on ${LABEL} is readable by an anonymous caller (${results.length} checked).`);
