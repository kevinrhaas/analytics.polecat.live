// rls.mjs — the integration test for the workspace database's REAL security posture (M7 / N2).
//
//   SUPABASE_PASSWORD=… node tests/rls.mjs
//   node tests/rls.mjs            # no password in the environment -> SKIP (exit 0)
//
// WHY THIS EXISTS. `tools/supabase-rls-real.sql` is the canonical Row-Level
// Security posture for every Polecat analytics workspace database, and since
// 2026-07-30 it is what is actually live. Until now it was only ever proven by
// hand — a steward run pasted it into a throwaway schema, eyeballed the counts
// and dropped the schema (STATUS.md M7 slices 1 and 4). Nothing in the repo
// re-checked it afterwards, so an edit to the policy file that quietly reopened
// anonymous reads would have shipped unnoticed. This script is that missing
// check: it applies THE REAL FILES (not a paraphrase of them) and asserts, from
// the database's own point of view, that an unauthorized read is refused.
//
// It runs the same checks against BOTH shipped postures — `supabase-rls-real.sql`
// (re-tighten an environment whose tables exist) and `supabase-deploy.sql` (the
// fresh one-file deploy, which calls itself the superset) — because "keep the two
// in sync" was an honour-system comment until something compared them. Each one
// is installed into its OWN empty schema, so "does this work on a genuinely fresh
// database?" is tested every run. That is what caught the ordering bug both files
// carried on 2026-08-07: they created policies calling `polecat_is_admin()` a
// section before defining it, so the documented top-to-bottom fresh install died
// on its first CREATE POLICY and had only ever survived on a project where an
// earlier run left the function behind.
//
// SAFETY — read before changing anything here. Every statement runs inside ONE
// throwaway `steward_test_rls_<random>` schema that this script creates and
// drops; `public` is never created, altered, read or written. That is a hard
// rule for automated runs against the live project (STATUS.md, the M7 block).
// The guard is mechanical, not just a promise: the policy file is re-pointed at
// the test schema by rewriting `public.` (assertTestSchemaOnly() below refuses
// to run if any `public.` reference survives the rewrite), and `search_path` is
// pinned to the test schema so an unqualified table name can never fall through
// to a live one.
//
// HOW THE ROLE-SWITCHING WORKS. Supabase's `auth.uid()` / `auth.jwt()` read the
// `request.jwt.claims` GUC, so a check can impersonate any signed-in user
// without minting a real JWT: set the role to `anon` or `authenticated`, set the
// claims, run the query. Each check is one `DO` block whose settings are local
// to it, and it reports itself with `RAISE NOTICE 'PASS|…'` / `'FAIL|…'` — psql
// streams those to stderr, which this script parses. `ON_ERROR_STOP=1` turns any
// unexpected SQL error into a failed run.
//
// Connection: the direct `db.<ref>.supabase.co` host is IPv6-only and GitHub's
// runners have no IPv6 route, so this goes through the IPv4 session-mode pooler
// (port 5432 — session mode, because we run DDL). Host/user/port are all
// overridable; only SUPABASE_PASSWORD is a secret and it is passed to psql via
// PGPASSWORD, never on a command line and never printed.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tool = (f) => resolve(__dirname, "..", "tools", f);

// The two canonical postures, each installed into its own throwaway schema and
// then put through the SAME checks — because they are supposed to be the same
// posture (supabase-deploy.sql's header calls itself the superset). Testing both
// is what keeps "keep the two in sync" from being an honour-system comment.
const POSTURES = [
  { label: "supabase-rls-real.sql (re-tighten an existing environment)", file: tool("supabase-rls-real.sql"), needsTables: true },
  { label: "supabase-deploy.sql (the fresh one-file deploy)", file: tool("supabase-deploy.sql"), needsTables: false },
];

// ---------------------------------------------------------------------------
// Environment / connection

const PASSWORD = process.env.SUPABASE_PASSWORD || "";
if (!PASSWORD) {
  console.log("rls: SKIP — no SUPABASE_PASSWORD in the environment.");
  console.log("rls: this test needs the live project's database password; it is a secret on");
  console.log("rls: the steward runs (see STATUS.md M7). Nothing was checked.");
  process.exit(0);
}

// The project ref is public (it is the API hostname); derive it so a different
// project only needs SUPABASE_URL changed.
const ref =
  process.env.SUPABASE_PROJECT_REF ||
  (process.env.SUPABASE_URL || "").replace(/^https?:\/\//, "").split(".")[0];
if (!ref) {
  console.error("rls: FATAL — set SUPABASE_URL (or SUPABASE_PROJECT_REF) so the pooler user can be built.");
  process.exit(1);
}

const HOST = process.env.SUPABASE_DB_HOST || "aws-0-ca-central-1.pooler.supabase.com";
const PORT = process.env.SUPABASE_DB_PORT || "5432";
const USER = process.env.SUPABASE_DB_USER || `postgres.${ref}`;
const DB = process.env.SUPABASE_DB_NAME || "postgres";

const newSchema = () => `steward_test_rls_${randomBytes(4).toString("hex")}`;

/** Run one SQL script through psql. Returns { code, out } with stderr merged in
 *  (RAISE NOTICE lands there, and that is where the PASS/FAIL lines come from). */
function psql(sql, { stopOnError = true } = {}) {
  const args = ["-X", "-q", "-h", HOST, "-p", PORT, "-U", USER, "-d", DB, "-f", "-"];
  if (stopOnError) args.unshift("-v", "ON_ERROR_STOP=1");
  const r = spawnSync("psql", args, {
    input: sql,
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: PASSWORD, PGCONNECT_TIMEOUT: "15" },
    timeout: 180000,
  });
  if (r.error) return { code: 1, out: String(r.error.message || r.error) };
  return { code: r.status ?? 1, out: `${r.stdout || ""}${r.stderr || ""}` };
}

// ---------------------------------------------------------------------------
// The policy set, re-pointed at the throwaway schema

/** The canonical files name `public` explicitly (`public.users`,
 *  `public.polecat_is_admin()`, `public.%I`, `SET search_path = public`).
 *  Rewriting those references moves the WHOLE posture into the test schema while
 *  leaving the policy logic — which is the thing under test — byte-for-byte what
 *  ships. */
function sqlForTestSchema(file, schema) {
  const raw = readFileSync(file, "utf8");
  // Strip comments first so prose about `public` can neither be rewritten nor
  // trip the guard below.
  const code = raw
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n");
  const rewritten = code
    .replace(/\bpublic\./g, `${schema}.`)
    .replace(/\bschema\s+public\b/gi, `SCHEMA ${schema}`)
    .replace(/search_path\s*=\s*public\b/gi, `search_path = ${schema}`);
  assertTestSchemaOnly(rewritten, file);
  return rewritten;
}

/** The mechanical safety guard: refuse to send anything that still mentions the
 *  live schema, at all, anywhere. If a canonical file ever grows a reference the
 *  rewrite above does not cover, the run fails loudly instead of touching
 *  production. */
function assertTestSchemaOnly(sql, file) {
  const offenders = sql.split("\n").filter((l) => /\bpublic\b/.test(l));
  if (offenders.length) {
    console.error(`rls: FATAL — refusing to run ${file}: these statements still name the LIVE \`public\` schema:`);
    offenders.forEach((l) => console.error(`  ${l.trim()}`));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Fixture: the workspace tables' real shape (tools/supabase-bootstrap.sql) plus
// three identities — an owner, a second user, and an admin.

const UID_A = "11111111-1111-4111-8111-111111111111"; // owner of the private dashboard
const UID_B = "22222222-2222-4222-8222-222222222222"; // a co-worker: must never see A's private rows
const UID_ADMIN = "33333333-3333-4333-8333-333333333333"; // an admin: sees everything

/** An empty schema, plus the workspace tables when the posture under test does
 *  not create them itself (supabase-rls-real.sql re-tightens tables that already
 *  exist; supabase-deploy.sql builds them). */
const schemaSql = (schema, withTables) => `
CREATE SCHEMA ${schema};
SET search_path TO ${schema};
${
  withTables
    ? `
-- Same shape as tools/supabase-bootstrap.sql: (id, promoted columns, data TEXT).
CREATE TABLE "polecat_meta" (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE "connections" (id TEXT PRIMARY KEY, "name" TEXT, "adapter" TEXT, "updatedAt" BIGINT, data TEXT);
CREATE TABLE "datasets"    (id TEXT PRIMARY KEY, "name" TEXT, "connectionId" TEXT, "kind" TEXT, "updatedAt" BIGINT, data TEXT);
CREATE TABLE "dashboards"  (id TEXT PRIMARY KEY, "name" TEXT, "title" TEXT, "updatedAt" BIGINT, data TEXT);
CREATE TABLE "analyses"    (id TEXT PRIMARY KEY, "name" TEXT, "datasetId" TEXT, "chartType" TEXT, "updatedAt" BIGINT, data TEXT);
CREATE TABLE "jobs"        (id TEXT PRIMARY KEY, "name" TEXT, "sourceDatasetId" TEXT, "updatedAt" BIGINT, data TEXT);
CREATE TABLE "users"       (id TEXT PRIMARY KEY, "name" TEXT, "role" TEXT, "updatedAt" BIGINT, data TEXT);
`
    : ""
}`;

/** Seed rows + the grants. Runs AFTER the posture is installed, as the schema
 *  owner (which RLS does not restrict), so it works either way round.
 *
 *  The grants matter: WITHOUT them a refused read would be a plain privilege
 *  error and would prove nothing about RLS. With them, anon is fully entitled to
 *  these tables and only the policies stand between it and the rows — which is
 *  exactly the posture being tested. (Live, the public schema already carries
 *  them: supabase-bootstrap.sql grants them explicitly, and Supabase's SQL
 *  editor applies them by default, which is why supabase-deploy.sql omits them.) */
const fixtureSql = (schema) => `
SET search_path TO ${schema};

GRANT USAGE ON SCHEMA ${schema} TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO anon, authenticated;

INSERT INTO "polecat_meta"(key, value) VALUES ('app', 'analytics'), ('schema_version', '4')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO "dashboards"(id, "name", data) VALUES
  ('d_public',   'Shared',    '{"owner":"${UID_A}","private":false}'),
  ('d_a_private','A private', '{"owner":"${UID_A}","private":true}'),
  ('d_b_private','B private', '{"owner":"${UID_B}","private":true}');

-- datasets carry the owner as acctOwner (M4.2) — the policy set special-cases it,
-- so the fixture must too or that branch goes untested.
INSERT INTO "datasets"(id, "name", data) VALUES
  ('ds_public',   'Shared',    '{"acctOwner":"${UID_A}","private":false}'),
  ('ds_a_private','A private', '{"acctOwner":"${UID_A}","private":true}'),
  ('ds_b_private','B private', '{"acctOwner":"${UID_B}","private":true}');

INSERT INTO "connections"(id, "name", data) VALUES ('c_b_private','B private','{"owner":"${UID_B}","private":true}');
INSERT INTO "analyses"(id, "name", data)    VALUES ('an_b_private','B private','{"owner":"${UID_B}","private":true}');
INSERT INTO "jobs"(id, "name", data)        VALUES ('j_b_private','B private','{"owner":"${UID_B}","private":true}');

-- users: id stays "user_<username>", the GoTrue uuid rides in the data blob.
INSERT INTO "users"(id, "name", "role", data) VALUES
  ('user_ana',   'Ana',   'viewer', '{"u":"ana@example.com","gotrueId":"${UID_A}"}'),
  ('user_bo',    'Bo',    'viewer', '{"u":"bo@example.com","gotrueId":"${UID_B}"}'),
  ('user_admin', 'Admin', 'admin',  '{"u":"admin@example.com","gotrueId":"${UID_ADMIN}"}');
`;

// ---------------------------------------------------------------------------
// The checks. Each is a self-contained DO block: become a role, claim an
// identity, run the query, report PASS or FAIL.

/** Check names travel inside SQL string literals AND through RAISE's format
 *  string, so they have to survive both: double any apostrophe, double any `%`. */
const lit = (s) => s.replace(/'/g, "''").replace(/%/g, "%%");

/** Count check: `want` rows visible to `role` (with `uid`, if signed in). */
const count = (schema, rawName, role, uid, query, want) => ((name) => `
DO $chk$
DECLARE got bigint;
BEGIN
  PERFORM set_config('search_path', '${schema}', true);
  PERFORM set_config('request.jwt.claims', ${uid ? `'{"sub":"${uid}","email":"x@example.com"}'` : `''`}, true);
  PERFORM set_config('role', '${role}', true);
  SELECT (${query}) INTO got;
  PERFORM set_config('role', 'none', true);
  IF got = ${want} THEN RAISE NOTICE 'PASS|${name}';
  ELSE RAISE NOTICE 'FAIL|${name}|got %|want ${want}', got;
  END IF;
END
$chk$;`)(lit(rawName));

/** Write check: the statement must be REFUSED — either rejected outright by a
 *  WITH CHECK (insufficient_privilege) or silently filtered to zero rows by a
 *  USING clause. Both are correct refusals; succeeding on someone else's row is
 *  the failure. */
const refuseWrite = (schema, rawName, role, uid, statement) => ((name) => `
DO $chk$
DECLARE affected bigint;
BEGIN
  PERFORM set_config('search_path', '${schema}', true);
  PERFORM set_config('request.jwt.claims', ${uid ? `'{"sub":"${uid}","email":"x@example.com"}'` : `''`}, true);
  PERFORM set_config('role', '${role}', true);
  BEGIN
    ${statement};
    GET DIAGNOSTICS affected = ROW_COUNT;
    PERFORM set_config('role', 'none', true);
    IF affected = 0 THEN RAISE NOTICE 'PASS|${name}';
    ELSE RAISE NOTICE 'FAIL|${name}|affected %|want 0 rows or a rejection', affected;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM set_config('role', 'none', true);
    RAISE NOTICE 'PASS|${name}';
  END;
END
$chk$;`)(lit(rawName));

const WORKSPACE_TABLES = ["dashboards", "connections", "datasets", "analyses", "jobs", "users", "polecat_meta"];

const checksSql = (schema) => [
  // 1) The headline assertion: anonymous is refused on every table. The anon key
  //    ships inside the app's packaged workspace catalog in a public repo, so
  //    anon must see NOTHING — this is the check that the 2026-07-30 posture
  //    change (reads went explicitly `TO authenticated`) exists to guarantee.
  ...WORKSPACE_TABLES.map((t) =>
    count(schema, `anon reads 0 rows from ${t}`, "anon", null, `SELECT count(*) FROM "${t}"`, 0)),

  // 2) A signed-in user sees public rows + their own private rows, and no one
  //    else's.
  count(schema, "user A sees the shared + own private dashboard", "authenticated", UID_A,
    `SELECT count(*) FROM "dashboards"`, 2),
  count(schema, "user A cannot see B's private dashboard", "authenticated", UID_A,
    `SELECT count(*) FROM "dashboards" WHERE id = 'd_b_private'`, 0),
  count(schema, "user B sees the shared + own private dashboard", "authenticated", UID_B,
    `SELECT count(*) FROM "dashboards" WHERE id IN ('d_public','d_b_private')`, 2),
  count(schema, "user B cannot see A's private dashboard", "authenticated", UID_B,
    `SELECT count(*) FROM "dashboards" WHERE id = 'd_a_private'`, 0),
  // datasets prove the acctOwner branch of the policy set.
  count(schema, "datasets: A sees the shared + own private dataset", "authenticated", UID_A,
    `SELECT count(*) FROM "datasets"`, 2),
  count(schema, "datasets: A cannot see B's private dataset (acctOwner)", "authenticated", UID_A,
    `SELECT count(*) FROM "datasets" WHERE id = 'ds_b_private'`, 0),
  count(schema, "A cannot see B's private connection", "authenticated", UID_A,
    `SELECT count(*) FROM "connections"`, 0),
  count(schema, "A cannot see B's private analysis", "authenticated", UID_A,
    `SELECT count(*) FROM "analyses"`, 0),
  count(schema, "A cannot see B's private job", "authenticated", UID_A,
    `SELECT count(*) FROM "jobs"`, 0),

  // 3) The admin arm — not optional: the app pushes the whole workspace
  //    snapshot, so an admin device must be able to see and write rows it does
  //    not own.
  count(schema, "an admin sees every dashboard", "authenticated", UID_ADMIN,
    `SELECT count(*) FROM "dashboards"`, 3),
  count(schema, "an admin sees every users row", "authenticated", UID_ADMIN,
    `SELECT count(*) FROM "users"`, 3),

  // 4) users is stricter: it holds password hashes, so a plain account sees only
  //    its own row.
  count(schema, "a plain account sees only its own users row", "authenticated", UID_A,
    `SELECT count(*) FROM "users"`, 1),
  count(schema, "a plain account cannot read a co-worker's users row", "authenticated", UID_A,
    `SELECT count(*) FROM "users" WHERE id = 'user_bo'`, 0),

  // 5) polecat_meta: signed-in users need it (the app reads its own metadata),
  //    anon must not — the anon half is covered by check 1.
  count(schema, "a signed-in user can read polecat_meta", "authenticated", UID_A,
    `SELECT count(*) FROM "polecat_meta"`, 2),

  // 6) Writes are refused the same way reads are.
  refuseWrite(schema, "A cannot update B's private dashboard", "authenticated", UID_A,
    `UPDATE "dashboards" SET "name" = 'stolen' WHERE id = 'd_b_private'`),
  refuseWrite(schema, "A cannot delete B's private dashboard", "authenticated", UID_A,
    `DELETE FROM "dashboards" WHERE id = 'd_b_private'`),
  refuseWrite(schema, "A cannot insert a dashboard owned by B", "authenticated", UID_A,
    `INSERT INTO "dashboards"(id, "name", data) VALUES ('d_spoof','Spoof','{"owner":"${UID_B}","private":true}')`),
  refuseWrite(schema, "a non-admin cannot insert a users row", "authenticated", UID_A,
    `INSERT INTO "users"(id, "name", "role", data) VALUES ('user_x','X','admin','{"u":"x@example.com","gotrueId":"${UID_A}"}')`),
  refuseWrite(schema, "a non-admin cannot delete a co-worker's users row", "authenticated", UID_A,
    `DELETE FROM "users" WHERE id = 'user_bo'`),
  refuseWrite(schema, "anon cannot write at all", "anon", null,
    `INSERT INTO "dashboards"(id, "name", data) VALUES ('d_anon','Anon','{"owner":"${UID_A}","private":false}')`),
].join("\n");

// ---------------------------------------------------------------------------
// Run

/** Install one posture into its own throwaway schema, run every check against
 *  it, and drop the schema. Returns { passed, failed }. */
function checkPosture({ label, file, needsTables }) {
  const schema = newSchema();
  const name = file.split("/").pop();
  console.log(`\nrls: ${label}`);
  let passed = 0;
  let failed = 0;
  try {
    const setup = psql(schemaSql(schema, needsTables));
    if (setup.code !== 0) {
      console.error(`rls: FATAL — could not create ${schema}:\n${setup.out.trim()}`);
      return { passed: 0, failed: 1 };
    }

    const applied = psql(`SET search_path TO ${schema};\n${sqlForTestSchema(file, schema)}`);
    if (applied.code !== 0) {
      console.error(`rls: FAIL — tools/${name} did not apply to a fresh schema:\n${applied.out.trim()}`);
      return { passed: 0, failed: 1 };
    }

    const seeded = psql(fixtureSql(schema));
    if (seeded.code !== 0) {
      console.error(`rls: FATAL — could not seed the fixture:\n${seeded.out.trim()}`);
      return { passed: 0, failed: 1 };
    }

    const run = psql(checksSql(schema));
    // psql prefixes every notice with its own `psql:<stdin>:<line>: NOTICE:  `,
    // so pull the reports out of the stream rather than matching line starts.
    const results = [...run.out.matchAll(/(?:PASS|FAIL)\|[^\n]*/g)].map((m) => m[0].trim());
    results.forEach((l) => {
      const [state, checkName, ...rest] = l.split("|");
      const detail = rest.length ? `  (${rest.join(", ")})` : "";
      console.log(`  ${state === "PASS" ? "ok  " : "FAIL"} ${checkName}${detail}`);
    });
    passed = results.filter((l) => l.startsWith("PASS|")).length;
    failed = results.filter((l) => l.startsWith("FAIL|")).length;

    if (run.code !== 0 || !results.length) {
      console.error(`rls: FATAL — the checks did not run to completion:\n${run.out.trim()}`);
      failed = failed || 1;
    }
    return { passed, failed };
  } finally {
    // Always drop the schema, even on a failed assertion or a thrown error — a
    // leftover steward_test_* schema in the live project is litter.
    const cleanup = psql(`DROP SCHEMA IF EXISTS ${schema} CASCADE;`);
    if (cleanup.code !== 0) {
      console.error(`rls: WARNING — could not drop ${schema}; drop it by hand.\n${cleanup.out.trim()}`);
    }
  }
}

const t0 = Date.now();
console.log(`rls: ${HOST}:${PORT} as ${USER}`);

const totals = POSTURES.map(checkPosture).reduce(
  (a, r) => ({ passed: a.passed + r.passed, failed: a.failed + r.failed }),
  { passed: 0, failed: 0 },
);

const secs = ((Date.now() - t0) / 1000).toFixed(1);
if (totals.failed) {
  console.error(`\nrls: ${totals.failed} of ${totals.passed + totals.failed} checks FAILED in ${secs}s — the shipped SQL does not install the posture it claims.`);
  process.exit(1);
}
console.log(`\nrls: ${totals.passed}/${totals.passed} checks passed in ${secs}s across ${POSTURES.length} postures.`);
process.exit(0);
