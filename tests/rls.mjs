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
// It runs the same checks against ALL THREE shipped postures —
// `tools/supabase-rls-real.sql` (re-tighten an environment whose tables exist),
// `tools/supabase-deploy.sql` (the fresh one-file deploy, which calls itself the
// superset) and the Edge Function's inlined `BOOTSTRAP_DDL` + `RLS_REAL_SQL`
// (what an in-app **Admin → Go live** actually installs) — because "keep them in
// sync" was an honour-system comment until something compared them. Each one is
// installed into its OWN empty schema, so "does this work on a genuinely fresh
// database?" is tested every run. That is what caught the ordering bug the two
// files carried on 2026-08-07: they created policies calling `polecat_is_admin()`
// a section before defining it, so the documented top-to-bottom fresh install
// died on its first CREATE POLICY and had only ever survived on a project where
// an earlier run left the function behind. Adding the third posture (N2 slice 2)
// caught the bigger one: the one-click go-live had drifted to a WEAKER posture
// than the manual paste.
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
import { createContext, runInContext } from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tool = (f) => resolve(__dirname, "..", "tools", f);

// ---------------------------------------------------------------------------
// The three shipped postures, each installed into its own throwaway schema and
// then put through the SAME checks — because they are all supposed to BE the
// same posture (supabase-deploy.sql's header calls itself the superset; the Edge
// Function's sql.ts calls itself the condensed runtime copy). Testing all three
// is what keeps "keep them in sync" from being an honour-system comment.
//
// The third one matters most in practice: it is what an in-app **Admin → Go
// live** actually installs. It HAD drifted (N2 slice 2, 2026-08-07) — missing
// the admin arm, the explicit `TO authenticated`, the `users` email-claim arm,
// the `polecat_meta` policy and the legacy-policy drop loop — so the one-click
// path installed a weaker posture than the documented manual paste. Nothing
// compared them until this check did.

/** The Edge Function's SQL is a TypeScript module of template-literal constants
 *  (it must be: the Supabase Edge Runtime bundles only the module graph, so a
 *  sibling .sql file is not readable at runtime — see sql.ts's header). Pull the
 *  constants back out textually rather than importing, because Node cannot
 *  import .ts and the point is to test the exact bytes that deploy. */
function edgeConst(name) {
  const src = readFileSync(resolve(__dirname, "..", "supabase", "functions", "polecat-admin", "sql.ts"), "utf8");
  const open = src.indexOf(`export const ${name} = \``);
  if (open < 0) {
    console.error(`rls: FATAL — supabase/functions/polecat-admin/sql.ts no longer exports ${name}.`);
    process.exit(1);
  }
  // Scan for the terminating backtick, honouring backslash escapes (the SQL
  // contains \` around identifiers like \`go-live\`).
  let i = open + `export const ${name} = \``.length;
  let out = "";
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") { out += src[++i] ?? ""; continue; }  // \` -> `, \$ -> $
    if (c === "`") return out;
    out += c;
  }
  console.error(`rls: FATAL — ${name} in sql.ts has no closing backtick.`);
  process.exit(1);
}

/** N21: the script the CONNECT WIZARD generates — the path a real user actually
 *  takes to adopt a blank Supabase database. It is produced in the browser by
 *  `Studio.WS.freshDeploySQL()` (app/sources/schema.js), so load that file the
 *  way the page does: a context whose global object IS `window`, which is all
 *  the module touches. No import, no paraphrase — the exact bytes that ship.
 *
 *  Until N21 this path installed pre-M7 tables and a comment reading "then
 *  enable Row-Level Security policies appropriate to your project": the
 *  SUPPORTED way to adopt a blank database left it wide open while
 *  tools/supabase-deploy.sql had installed the real posture since 2026-07-30.
 *  Now it is the same posture, and this is the check that keeps it that way
 *  from the database's own point of view (tools/validate.mjs compares the two
 *  textually; this one proves what they actually DO).
 *
 *  The polecat_meta seed rows are dropped from the script before it runs: they
 *  are workspace DATA, not posture, and `fixtureSql` seeds its own two rows
 *  that the row-count checks below are calibrated to. Every other statement —
 *  the DDL, the atomic-save function, the whole posture, the grants — runs
 *  exactly as pasted. */
function loadWS() {
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  createContext(sandbox);
  const file = resolve(__dirname, "..", "app", "sources", "schema.js");
  runInContext(readFileSync(file, "utf8"), sandbox, { filename: "app/sources/schema.js" });
  const WS = sandbox.Studio && sandbox.Studio.WS;
  if (!WS || typeof WS.freshDeploySQL !== "function" || typeof WS.migrationRpcSQL !== "function") {
    console.error("rls: FATAL — app/sources/schema.js no longer exposes Studio.WS.freshDeploySQL() + WS.migrationRpcSQL().");
    process.exit(1);
  }
  return WS;
}

function wizardDeploySQL() {
  const WS = loadWS();
  return WS.freshDeploySQL(WS.emptySnapshot(), null)
    .split("\n")
    .filter((l) => !/^INSERT INTO "polecat_meta"/.test(l))
    .join("\n");
}

const POSTURES = [
  {
    label: "tools/supabase-rls-real.sql (re-tighten an existing environment)",
    source: "tools/supabase-rls-real.sql",
    load: () => readFileSync(tool("supabase-rls-real.sql"), "utf8"),
    needsTables: true,
  },
  {
    label: "tools/supabase-deploy.sql (the fresh one-file deploy)",
    source: "tools/supabase-deploy.sql",
    load: () => readFileSync(tool("supabase-deploy.sql"), "utf8"),
    needsTables: false,
  },
  {
    // Exactly what actionGoLive() runs, in order: BOOTSTRAP_DDL (which also
    // installs the demo allow-all policies) then RLS_REAL_SQL — so the drop
    // loop that has to retire them is under test too, not assumed.
    label: "the Edge Function's inlined go-live SQL (Admin → Go live)",
    source: "supabase/functions/polecat-admin/sql.ts",
    load: () => `${edgeConst("BOOTSTRAP_DDL")}\n${edgeConst("RLS_REAL_SQL")}`,
    needsTables: false,
  },
  {
    // N26: `provision` AFTER go-live — the sequence nobody ran on purpose and
    // every one of the checks below would have caught. `provision` is the only
    // schema action the Edge Function has, its BOOTSTRAP_DDL used to create the
    // demo allow-all policy unconditionally, and Postgres ORs PERMISSIVE
    // policies together — so one provision call on a live workspace re-opened
    // every table to the anon key while leaving the real per-user policies
    // visibly in place. Running the WHOLE battery (not just an anon-reads-zero
    // spot check) is deliberate: the property is "the live posture is exactly
    // what it was", so the per-user, admin and write checks have to hold too.
    label: "the Edge Function's `provision` re-run on a workspace that has gone live (N26)",
    source: "supabase/functions/polecat-admin/sql.ts",
    load: () => `${edgeConst("BOOTSTRAP_DDL")}\n${edgeConst("RLS_REAL_SQL")}\n${edgeConst("BOOTSTRAP_DDL")}`,
    needsTables: false,
  },
  {
    // The same question asked of the file a human pastes. tools/supabase-
    // bootstrap.sql is the documented way to add a table or repair grants on an
    // existing project, and supabase-provision.yml applies it unattended — so
    // "safe to re-run" has to mean safe on a LIVE workspace, not only on the
    // demo one it was written for.
    label: "tools/supabase-bootstrap.sql re-run on a workspace that has gone live (N26)",
    source: "tools/supabase-bootstrap.sql + tools/supabase-rls-real.sql",
    load: () => [
      readFileSync(tool("supabase-bootstrap.sql"), "utf8"),
      readFileSync(tool("supabase-rls-real.sql"), "utf8"),
      readFileSync(tool("supabase-bootstrap.sql"), "utf8"),
    ].join("\n"),
    needsTables: false,
  },
  {
    label: "the connect wizard's generated script (adopt a blank database from the UI)",
    source: "app/sources/schema.js WS.freshDeploySQL()",
    load: wizardDeploySQL,
    needsTables: false,
  },
  {
    // N22b: the ROUTE, not a file. Everything above is something a human pastes;
    // this is what happens afterwards, from inside the app, with nobody in the
    // SQL editor — the whole point of the migration RPC. It starts from the
    // WORST database we ship the ability to reach: tools/supabase-bootstrap.sql,
    // the legacy demo posture whose `polecat_anon_all` policy hands the anon key
    // every row of every table. One admin call has to end with the same locked
    // posture the pasted files produce, or the app cannot honestly claim to own
    // its own database.
    label: "the migration RPC route (an admin upgrades a legacy allow-all workspace from the app — N22b)",
    source: "app/sources/schema.js WS.migrationRpcSQL()",
    load: migrationRpcRoute,
    needsTables: false,
    // Bound lazily: `rpcGateChecks` is declared with the other check builders,
    // below this list.
    extra: (schema) => rpcGateChecks(schema),
  },
];

/** The legacy workspace, the RPC installed onto it, and ONE admin call — which
 *  is the only privileged thing that happens. The call runs as `authenticated`
 *  with an admin's JWT claims, exactly as PostgREST would run it for a signed-in
 *  admin in the browser: if the function's own gate or grants are wrong, this
 *  fails here rather than in production.
 *
 *  The seeded admin is removed again on the way out, so `fixtureSql` still owns
 *  the users table the row-count checks are calibrated to. */
function migrationRpcRoute() {
  const WS = loadWS();
  return [
    readFileSync(tool("supabase-bootstrap.sql"), "utf8"),
    // An admin has to exist before the gate can recognise one. This is the row
    // the one paste's § 7 creates; here it is seeded directly, as postgres,
    // because that is what § 7 is.
    `INSERT INTO "users"(id, "name", "role", data) VALUES
       ('user_rpc_admin', 'RPC Admin', 'admin', '{"u":"rpc@example.com","gotrueId":"${UID_ADMIN}"}')
     ON CONFLICT (id) DO NOTHING;`,
    WS.migrationRpcSQL(),
    `DO $route$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"${UID_ADMIN}","email":"rpc@example.com"}', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM public.polecat_migrate();
  PERFORM set_config('role', 'none', true);
END
$route$;`,
    `DELETE FROM "users" WHERE id = 'user_rpc_admin';`,
  ].join("\n\n");
}

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

/** The shipped SQL names `public` explicitly (`public.users`,
 *  `public.polecat_is_admin()`, `public.%I`, `SET search_path = public`,
 *  `GRANT … ON SCHEMA public`). Rewriting those references moves the WHOLE
 *  posture into the test schema while leaving the policy logic — which is the
 *  thing under test — byte-for-byte what ships. */
function sqlForTestSchema(raw, source, schema) {
  // Strip comments first so prose about `public` can neither be rewritten nor
  // trip the guard below.
  const code = raw
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n");
  const rewritten = code
    .replace(/\bpublic\./g, `${schema}.`)
    .replace(/\bschema\s+public\b/gi, `SCHEMA ${schema}`)
    .replace(/search_path\s*=\s*public\b/gi, `search_path = ${schema}`)
    // The wizard's script (N21) also ships the atomic-save function, whose
    // column lookup names the schema as a catalog STRING rather than as an
    // identifier — same rewrite, different syntax.
    .replace(/table_schema\s*=\s*'public'/gi, `table_schema = '${schema}'`);
  assertTestSchemaOnly(rewritten, source);
  return rewritten;
}

/** The mechanical safety guard: refuse to send anything that still mentions the
 *  live schema, at all, anywhere. If a canonical file ever grows a reference the
 *  rewrite above does not cover, the run fails loudly instead of touching
 *  production. */
function assertTestSchemaOnly(sql, source) {
  const offenders = sql.split("\n").filter((l) => /\bpublic\b/.test(l));
  if (offenders.length) {
    console.error(`rls: FATAL — refusing to run ${source}: these statements still name the LIVE \`public\` schema:`);
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
 *  exactly the posture being tested.
 *
 *  Since N20 every shipped file grants for itself, so these two lines are now
 *  belt-and-braces rather than the only source of the privileges. They are kept
 *  deliberately: they make the ROW checks below independent of the PRIVILEGE
 *  checks above, so a regression in one cannot disguise itself as the other.
 *  `grantsSql` runs before this and is what actually holds the shipped files to
 *  granting. */
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

/** N20: the posture's OWN table privileges, measured before the fixture adds any.
 *
 *  Privileges and policies answer different questions and this suite only ever
 *  asked the second. `tools/supabase-deploy.sql` carried zero GRANTs and leaned
 *  on the project's default privileges, so following Supabase's own
 *  recommendation — "Automatically expose new tables: OFF" — produced tables
 *  with RLS and the right policies that PostgREST then refused for lack of
 *  privilege, with an error that reads like an RLS problem and is not one. The
 *  posture was right and unreachable.
 *
 *  This has to run BEFORE `fixtureSql`, which grants unconditionally so that a
 *  refused read proves something about policies rather than about privileges.
 *  That fixture grant is exactly what hid the gap: every posture looked equally
 *  entitled by the time any check ran. Ask the question while the schema still
 *  carries only what the shipped file put there. */
const grantsSql = (schema) => {
  const say = (name, cond) => `
DO $chk$
BEGIN
  IF ${cond} THEN RAISE NOTICE 'PASS|${lit(name)}';
  ELSE RAISE NOTICE 'FAIL|${lit(name)}|the shipped file granted nothing|PostgREST would refuse every request';
  END IF;
END
$chk$;`;
  return [
    ...["anon", "authenticated", "service_role"].map((role) =>
      say(`${role} may USE the schema`, `has_schema_privilege('${role}', '${schema}', 'USAGE')`)),
    ...WORKSPACE_TABLES.map((t) =>
      say(`authenticated holds table privileges on ${t} (the app's own reads and writes)`,
        `has_table_privilege('authenticated', '${schema}.${JSON.stringify(t).slice(1, -1)}', 'SELECT, INSERT, UPDATE, DELETE')`)),
    // anon needs the PRIVILEGE too, and is still held to zero ROWS by the
    // policies — the two facts together are the whole point of granting here.
    // Asserted side by side with the anon-reads-nothing checks below, so nobody
    // can "fix" one by quietly weakening the other.
    ...WORKSPACE_TABLES.map((t) =>
      say(`anon holds the SELECT privilege on ${t} (RLS, not privilege, is what returns it nothing)`,
        `has_table_privilege('anon', '${schema}.${JSON.stringify(t).slice(1, -1)}', 'SELECT')`)),
  ].join("\n");
};

/** N22b: the checks that only make sense for the RPC route — the gate, the
 *  probe, and the two properties a migration function must never lose. The
 *  posture checks above already prove WHAT it installed; these prove WHO may
 *  install it, which is the whole security boundary once a function is
 *  SECURITY DEFINER.
 *
 *  Refusal is asserted as "raised at all" rather than as a specific SQLSTATE:
 *  anon is refused by the missing EXECUTE grant (insufficient_privilege) and a
 *  signed-in non-admin by the function's own gate (a raised exception). Both are
 *  correct refusals; succeeding is the failure. */
const rpcGateChecks = (schema) => {
  /** Become `role` (with `uid`'s claims, if signed in), run `body` — a plpgsql
   *  statement or nested block that reports its own PASS/FAIL — and step back
   *  out. Same shape as `count`/`refuseWrite` above, but the body does the
   *  asserting, because these checks return jsonb rather than a row count. */
  const asRole = (role, uid, body) => `
DO $chk$
BEGIN
  PERFORM set_config('search_path', '${schema}', true);
  PERFORM set_config('request.jwt.claims', ${uid ? `'{"sub":"${uid}","email":"x@example.com"}'` : `''`}, true);
  PERFORM set_config('role', '${role}', true);
  ${body}
  PERFORM set_config('role', 'none', true);
END
$chk$;`;
  const refuseCall = (name, role, uid, call) => asRole(role, uid, `
  BEGIN
    PERFORM ${call};
    PERFORM set_config('role', 'none', true);
    RAISE NOTICE 'FAIL|${lit(name)}|the call SUCCEEDED|it must be refused';
  EXCEPTION WHEN others THEN
    PERFORM set_config('role', 'none', true);
    RAISE NOTICE 'PASS|${lit(name)}';
  END;`);
  return [
    refuseCall("anon cannot run the migration RPC (no EXECUTE grant)", "anon", null,
      `${schema}.polecat_migrate()`),
    refuseCall("a signed-in NON-admin cannot run the migration RPC (the gate is the whole boundary)", "authenticated", UID_A,
      `${schema}.polecat_migrate()`),

    // The probe is deliberately open to any signed-in account: the app has to be
    // able to ask "can this workspace be upgraded from here?" before it knows
    // whether the person looking is an admin. It must write nothing.
    asRole("authenticated", UID_A, `
  DECLARE probe jsonb; before bigint; after bigint;
  BEGIN
    SELECT count(*) INTO before FROM "polecat_meta";
    SELECT ${schema}.polecat_migrate('probe') INTO probe;
    SELECT count(*) INTO after FROM "polecat_meta";
    PERFORM set_config('role', 'none', true);
    IF (probe->>'probe') = 'true' AND before = after THEN RAISE NOTICE 'PASS|a signed-in non-admin can PROBE the RPC, and probing writes nothing';
    ELSE RAISE NOTICE 'FAIL|a signed-in non-admin can PROBE the RPC, and probing writes nothing|probe %|rows % -> %', probe, before, after;
    END IF;
  END;`),

    // Re-running it is how an upgrade is retried after a dropped connection, so
    // "safe to run twice" is a property, not a hope.
    asRole("authenticated", UID_ADMIN, `
  DECLARE r jsonb;
  BEGIN
    SELECT ${schema}.polecat_migrate() INTO r;
    PERFORM set_config('role', 'none', true);
    IF (r->>'ok') = 'true' THEN RAISE NOTICE 'PASS|an admin can re-run the migration RPC, and the workspace stays locked';
    ELSE RAISE NOTICE 'FAIL|an admin can re-run the migration RPC, and the workspace stays locked|returned %', r;
    END IF;
  END;`),
    count(schema, "anon still reads 0 rows from dashboards after a second migrate", "anon", null,
      `SELECT count(*) FROM "dashboards"`, 0),

    // N17/N28: the marker only ever moves FORWARD. An older build's migrate must
    // not re-label a newer workspace as its own shape — after which every client,
    // including the newer app that upgraded it, reads it as older and offers the
    // upgrade again, forever.
    `UPDATE ${schema}."polecat_meta" SET value = '99' WHERE key = 'schema_version';`,
    asRole("authenticated", UID_ADMIN, `
  DECLARE v text;
  BEGIN
    PERFORM ${schema}.polecat_migrate();
    SELECT value INTO v FROM "polecat_meta" WHERE key = 'schema_version';
    PERFORM set_config('role', 'none', true);
    IF v = '99' THEN RAISE NOTICE 'PASS|the migration RPC never REWINDS the schema marker';
    ELSE RAISE NOTICE 'FAIL|the migration RPC never REWINDS the schema marker|marker is now %|want 99', v;
    END IF;
  END;`),
  ].join("\n");
};

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
function checkPosture({ label, source, load, needsTables, extra }) {
  const schema = newSchema();
  console.log(`\nrls: ${label}`);
  let passed = 0;
  let failed = 0;
  try {
    const setup = psql(schemaSql(schema, needsTables));
    if (setup.code !== 0) {
      console.error(`rls: FATAL — could not create ${schema}:\n${setup.out.trim()}`);
      return { passed: 0, failed: 1 };
    }

    const applied = psql(`SET search_path TO ${schema};\n${sqlForTestSchema(load(), source, schema)}`);
    if (applied.code !== 0) {
      console.error(`rls: FAIL — ${source} did not apply to a fresh schema:\n${applied.out.trim()}`);
      return { passed: 0, failed: 1 };
    }

    // N20: measure the file's OWN grants first — fixtureSql grants
    // unconditionally, so after it runs every posture looks equally entitled.
    const grants = psql(grantsSql(schema));
    if (grants.code !== 0) {
      console.error(`rls: FATAL — the privilege probe did not run:\n${grants.out.trim()}`);
      return { passed: 0, failed: 1 };
    }

    const seeded = psql(fixtureSql(schema));
    if (seeded.code !== 0) {
      console.error(`rls: FATAL — could not seed the fixture:\n${seeded.out.trim()}`);
      return { passed: 0, failed: 1 };
    }

    const run = psql(checksSql(schema));
    // A posture may add checks only IT can make (the RPC route's gate + probe).
    // They run last, because some of them change state the shared checks read.
    const own = extra ? psql(extra(schema)) : { code: 0, out: "" };
    // psql prefixes every notice with its own `psql:<stdin>:<line>: NOTICE:  `,
    // so pull the reports out of the stream rather than matching line starts.
    const results = [
      ...grants.out.matchAll(/(?:PASS|FAIL)\|[^\n]*/g),
      ...run.out.matchAll(/(?:PASS|FAIL)\|[^\n]*/g),
      ...own.out.matchAll(/(?:PASS|FAIL)\|[^\n]*/g),
    ].map((m) => m[0].trim());
    results.forEach((l) => {
      const [state, checkName, ...rest] = l.split("|");
      const detail = rest.length ? `  (${rest.join(", ")})` : "";
      console.log(`  ${state === "PASS" ? "ok  " : "FAIL"} ${checkName}${detail}`);
    });
    passed = results.filter((l) => l.startsWith("PASS|")).length;
    failed = results.filter((l) => l.startsWith("FAIL|")).length;

    if (own.code !== 0) {
      console.error(`rls: FATAL — ${source}'s own checks did not run to completion:\n${own.out.trim()}`);
      failed = failed || 1;
    }
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

// ---------------------------------------------------------------------------
// N28: marker DIRECTION — the two PROVISIONING artifacts
//
// The postures above prove WHAT gets installed. This proves which way the
// workspace's own version marker can MOVE when one of them is run again, which
// is a different question and the one N17 answered on the app side: an older
// build must never re-label a newer workspace as its own shape, or every client
// — including the newer app that performed the upgrade — reads the workspace as
// older and offers the upgrade again, forever.
//
// Only these two are provisioning paths that may legitimately RAISE the marker
// (an upgrade run through provision/go-live). tools/supabase-deploy.sql and the
// wizard's script are DO NOTHING by design — they only declare what they just
// built — and doc-truth check 27 holds all four to one shape or the other in the
// dev gate, where this file cannot run (it needs a real database).
const MARKER_ARTIFACTS = [
  {
    label: "tools/supabase-bootstrap.sql — marker direction (N28)",
    source: "tools/supabase-bootstrap.sql",
    load: () => readFileSync(tool("supabase-bootstrap.sql"), "utf8"),
  },
  {
    label: "the Edge Function's BOOTSTRAP_DDL (provision / go live) — marker direction (N28)",
    source: "supabase/functions/polecat-admin/sql.ts BOOTSTRAP_DDL",
    load: () => edgeConst("BOOTSTRAP_DDL"),
  },
];

/** Read one marker back and report it, in the harness's PASS|/FAIL| shape. */
const markerIs = (schema, rawName, key, want) => ((name) => `
DO $mk$
DECLARE v text;
BEGIN
  PERFORM set_config('search_path', '${schema}', true);
  SELECT value INTO v FROM "polecat_meta" WHERE key = '${key}';
  IF v = '${want}' THEN RAISE NOTICE 'PASS|${name}';
  ELSE RAISE NOTICE 'FAIL|${name}|${key} is now %|want ${want}', coalesce(v, '(absent)');
  END IF;
END
$mk$;`)(lit(rawName));

/** Install the artifact into a throwaway schema, then re-run it over a marker
 *  seeded above / below / beside its own version and assert which way it moved.
 *  Re-running is the real-world case: `go-live` runs BOOTSTRAP_DDL on every
 *  call, and both files call themselves safe to run repeatedly. */
function checkMarkerDirection({ label, source, load }) {
  const schema = newSchema();
  console.log(`\nrls: ${label}`);
  try {
    const raw = load();
    const version = Number((/VALUES \('schema_version', '(\d+)'\)/.exec(raw) || [])[1]);
    if (!version) {
      console.error(`rls: FATAL — ${source} no longer stamps schema_version at all.`);
      return { passed: 0, failed: 1 };
    }
    const sql = sqlForTestSchema(raw, source, schema);

    const setup = psql(schemaSql(schema, false));
    if (setup.code !== 0) {
      console.error(`rls: FATAL — could not create ${schema}:\n${setup.out.trim()}`);
      return { passed: 0, failed: 1 };
    }

    const scenarios = [
      { seed: "", key: "schema_version", want: String(version),
        name: `a fresh install stamps schema_version = ${version}` },
      { seed: `UPDATE "polecat_meta" SET value = '99' WHERE key = 'schema_version';`,
        key: "schema_version", want: "99",
        name: "an OLDER copy of the artifact never REWINDS a newer workspace's marker" },
      { seed: `UPDATE "polecat_meta" SET value = '1' WHERE key = 'schema_version';`,
        key: "schema_version", want: String(version),
        name: `provisioning still RAISES an older marker to ${version} (an upgrade must work)` },
      { seed: `UPDATE "polecat_meta" SET value = 'corrupt' WHERE key = 'schema_version';`,
        key: "schema_version", want: String(version),
        name: `a non-numeric marker heals to ${version} rather than blocking the upgrade` },
      { seed: `UPDATE "polecat_meta" SET value = 'manager' WHERE key = 'app';`,
        key: "app", want: "manager",
        name: "the `app` marker of a project another fleet app already claimed is never relabelled" },
    ];

    const results = [];
    for (const s of scenarios) {
      const run = psql(`SET search_path TO ${schema};\n${s.seed}\n${sql}\n${markerIs(schema, s.name, s.key, s.want)}`);
      if (run.code !== 0) {
        console.error(`rls: FATAL — ${source} did not re-apply cleanly:\n${run.out.trim()}`);
        return { passed: 0, failed: 1 };
      }
      results.push(...[...run.out.matchAll(/(?:PASS|FAIL)\|[^\n]*/g)].map((m) => m[0].trim()));
    }
    results.forEach((l) => {
      const [state, checkName, ...rest] = l.split("|");
      console.log(`  ${state === "PASS" ? "ok  " : "FAIL"} ${checkName}${rest.length ? `  (${rest.join(", ")})` : ""}`);
    });
    const passed = results.filter((l) => l.startsWith("PASS|")).length;
    let failed = results.filter((l) => l.startsWith("FAIL|")).length;
    if (results.length !== scenarios.length) {
      console.error(`rls: FATAL — ${source}: expected ${scenarios.length} marker probes, saw ${results.length}.`);
      failed = failed || 1;
    }
    return { passed, failed };
  } finally {
    const cleanup = psql(`DROP SCHEMA IF EXISTS ${schema} CASCADE;`);
    if (cleanup.code !== 0) {
      console.error(`rls: WARNING — could not drop ${schema}; drop it by hand.\n${cleanup.out.trim()}`);
    }
  }
}

const t0 = Date.now();
console.log(`rls: ${HOST}:${PORT} as ${USER}`);

const totals = [...POSTURES.map(checkPosture), ...MARKER_ARTIFACTS.map(checkMarkerDirection)].reduce(
  (a, r) => ({ passed: a.passed + r.passed, failed: a.failed + r.failed }),
  { passed: 0, failed: 0 },
);

const secs = ((Date.now() - t0) / 1000).toFixed(1);
if (totals.failed) {
  console.error(`\nrls: ${totals.failed} of ${totals.passed + totals.failed} checks FAILED in ${secs}s — the shipped SQL does not install the posture it claims.`);
  process.exit(1);
}
console.log(`\nrls: ${totals.passed}/${totals.passed} checks passed in ${secs}s across ${POSTURES.length} postures ` +
  `and ${MARKER_ARTIFACTS.length} marker-direction probes.`);
process.exit(0);
