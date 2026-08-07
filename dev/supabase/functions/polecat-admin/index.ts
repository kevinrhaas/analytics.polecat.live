// supabase/functions/polecat-admin/index.ts
//
// M7 Slice 7 — the one-time Edge Function relay (STATUS.md, Kevin's "Option A").
// Deployed ONCE via the Supabase CLI (this source lives in the app repo but is
// NOT part of the static Pages build — see /tools/M7-RLS-GOLIVE-RUNBOOK.md
// Path C for the deploy steps). It holds the service-role key and opens a
// direct Postgres connection — PostgREST can't DDL even with the service key,
// but this can, which is the whole reason it exists: to run the go-live
// runbook (and admin user creation) from in-app buttons instead of the SQL
// editor.
//
// SECURITY CONTRACT (do not relax):
//   - NAMED, FIXED actions only — the client sends an action name + params,
//     NEVER raw SQL. The four actions below are the entire surface.
//   - `provision`/`go-live` are gated by a one-time PROVISION_SECRET (a
//     deploy-time secret, entered in the app enter-run-discard, never
//     persisted client-side — see app/sources/supabase.js adminGoLive).
//   - `create-user`/`reset-data` are gated by the CALLER'S OWN GoTrue admin
//     JWT (verified against the `users` table's role column via the
//     service-role client, which bypasses RLS to check it) — never the
//     provision secret, so day-2 admin actions don't depend on a secret
//     that's supposed to be discarded after go-live.
//   - The service-role key and DB connection string never leave this
//     function (never echoed in a response, even on error).
//   - CORS is scoped to APP_ORIGIN (set at deploy) — never "*".
import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3";
// SQL inlined as string constants (see sql.ts) — the Edge Runtime doesn't bundle
// sibling .sql files, so reading them at runtime failed with "path not found".
import { BOOTSTRAP_DDL, RLS_REAL_SQL } from "./sql.ts";

const APP_ORIGIN = Deno.env.get("APP_ORIGIN") || "https://analytics.polecat.live";
const PROVISION_SECRET = Deno.env.get("PROVISION_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
// Direct Postgres connection string (pooler), a MANUAL secret (Settings →
// Database → Connection string → "Transaction" pooler, or the direct
// connection) — NOT auto-injected like the two above.
// Newer Supabase CLI versions disallow custom secret names that begin with
// SUPABASE_, so we support DB_URL first and keep SUPABASE_DB_URL as fallback
// for older deployments.
const DB_URL = Deno.env.get("DB_URL") || Deno.env.get("SUPABASE_DB_URL") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-provision-secret, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const TABLE_NAMES = ["connections", "datasets", "dashboards", "analyses", "jobs", "users"];

let _sql: ReturnType<typeof postgres> | null = null;
function db() {
  if (!DB_URL) throw new Error("DB_URL secret is not set — see tools/M7-RLS-GOLIVE-RUNBOOK.md Path C.");
  if (!_sql) _sql = postgres(DB_URL, { prepare: false });
  return _sql;
}

function adminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are not available to this function.");
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

// Verifies the caller's own GoTrue JWT (from the Authorization header) is a
// real, current Supabase Auth session, THEN checks the workspace `users`
// table for a row with that gotrueId and role:"admin" — the same shape
// polecat_is_admin() checks inside RLS, just re-derived here since this
// function's Postgres connection runs as the table owner (bypasses RLS).
async function requireAdmin(req: Request) {
  const authz = req.headers.get("authorization") || "";
  const token = authz.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false as const, error: "Sign in as an admin first (no Authorization token on this request)." };
  const supa = adminClient();
  const { data, error } = await supa.auth.getUser(token);
  if (error || !data?.user) return { ok: false as const, error: "That sign-in session is no longer valid — sign in again and retry." };
  const uid = data.user.id;
  const sql = db();
  const rows = await sql`select "role", data from public.users where (data::jsonb->>'gotrueId') = ${uid} limit 1`;
  const row = rows[0];
  if (!row || row.role !== "admin") return { ok: false as const, error: "This account is not an admin of this workspace." };
  return { ok: true as const, uid };
}

async function actionProvision() {
  const sql = db();
  await sql.unsafe(BOOTSTRAP_DDL);
  return { ok: true, step: "provision" };
}

// go-live: bootstrap DDL (idempotent, in case this is a fresh project) →
// truncate (clean install, per the runbook's Path A decision — existing
// backend rows are disposable, browser localStorage is untouched) → seed the
// admin `users` row (owned by the CALLER's own verified uid — never a
// client-supplied id, so a forged seedAdmin payload can't hand admin to
// someone else's uid) → apply the real RLS → verify.
async function actionGoLive(uid: string, params: Record<string, unknown>) {
  const username = String(params.username || "").trim();
  const name = String(params.name || username).trim();
  if (!username) return { ok: false, error: "Missing the local admin username to seed (params.username)." };

  const sql = db();
  await sql.unsafe(BOOTSTRAP_DDL);

  await sql.begin(async (tx) => {
    for (const t of TABLE_NAMES) await tx.unsafe(`TRUNCATE TABLE "${t}"`);
    const row = { id: "user_" + username, u: username, name, role: "admin", demo: false, hash: "", gotrueId: uid };
    await tx`
      insert into "users" (id, "name", "role", "updatedAt", data)
      values (${row.id}, ${name}, 'admin', ${Date.now()}, ${JSON.stringify(row)})
      on conflict (id) do update set "name" = excluded."name", "role" = excluded."role",
        "updatedAt" = excluded."updatedAt", data = excluded.data
    `;
  });

  await sql.unsafe(RLS_REAL_SQL);

  const verify: Record<string, number> = {};
  for (const t of TABLE_NAMES) {
    const r = await sql.unsafe(`SELECT count(*)::int AS n FROM "${t}"`);
    verify[t] = r[0].n;
  }
  const adminRow = await sql`select (data::jsonb->>'gotrueId') as gid, "role" from public.users where id = ${"user_" + username}`;

  return {
    ok: true,
    step: "go-live",
    tables: verify,
    adminSeeded: !!adminRow[0] && adminRow[0].gid === uid && adminRow[0].role === "admin",
  };
}

// create-user: admin-create a GoTrue account (service-role Admin API — no
// email-confirmation step, unlike Slice 6's public self-signup) + insert its
// `users` row. Supersedes Slice 6's open signup for deployments running this
// relay; Slice 6 stays the fallback where the relay isn't deployed.
async function actionCreateUser(params: Record<string, unknown>) {
  const email = String(params.email || "").trim();
  const password = String(params.password || "");
  const username = String(params.username || "").trim();
  const name = String(params.name || username).trim();
  const role = String(params.role || "viewer");
  if (!email || !password || !username) return { ok: false, error: "email, password, and username are required." };

  const supa = adminClient();
  const { data, error } = await supa.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data?.user) return { ok: false, error: error?.message || "Could not create the Supabase Auth account." };

  const sql = db();
  const row = { id: "user_" + username, u: username, name, role, demo: false, hash: "", gotrueId: data.user.id };
  await sql`
    insert into "users" (id, "name", "role", "updatedAt", data)
    values (${row.id}, ${name}, ${role}, ${Date.now()}, ${JSON.stringify(row)})
    on conflict (id) do update set "name" = excluded."name", "role" = excluded."role",
      "updatedAt" = excluded."updatedAt", data = excluded.data
  `;
  return { ok: true, userId: data.user.id };
}

async function actionResetData() {
  const sql = db();
  await sql.begin(async (tx) => {
    for (const t of TABLE_NAMES) await tx.unsafe(`TRUNCATE TABLE "${t}"`);
  });
  return { ok: true, step: "reset-data" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { ok: false, error: "POST only" });

  let body: { action?: string; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body." });
  }
  const action = body.action;
  const params = body.params || {};

  try {
    if (action === "provision" || action === "go-live") {
      const secret = req.headers.get("x-provision-secret") || "";
      if (!PROVISION_SECRET || secret !== PROVISION_SECRET) {
        return json(401, { ok: false, error: "Wrong or missing provision secret." });
      }
      if (action === "provision") return json(200, await actionProvision());
      // go-live still needs to know WHO becomes admin: the caller's own
      // verified GoTrue session (Authorization header) — the provision
      // secret alone only proves "deploy-time authority", not an identity.
      const admin = await requireAdmin(req);
      if (!admin.ok) return json(401, { ok: false, error: admin.error + " (sign in as that account's Supabase Auth identity first, then click Go live again.)" });
      return json(200, await actionGoLive(admin.uid, params));
    }

    if (action === "create-user" || action === "reset-data") {
      const admin = await requireAdmin(req);
      if (!admin.ok) return json(401, { ok: false, error: admin.error });
      if (action === "create-user") return json(200, await actionCreateUser(params));
      return json(200, await actionResetData());
    }

    return json(400, { ok: false, error: "Unknown action — must be one of: provision, go-live, create-user, reset-data." });
  } catch (e) {
    return json(500, { ok: false, error: (e as Error).message || "Internal error." });
  }
});
