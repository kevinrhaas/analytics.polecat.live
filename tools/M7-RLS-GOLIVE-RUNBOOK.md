# M7 — Supabase RLS go-live runbook

A step-by-step procedure to flip the live Supabase workspace backend from the
current **demo "allow all"** posture to **real per-user Row-Level Security**.

- **What runs the flip:** `tools/supabase-rls-real.sql` (already designed + proven
  against an isolated `steward_test` schema — see its header).
- **What it replaces:** the `polecat_anon_all` allow-all policies created by
  `tools/supabase-bootstrap.sql`.
- **Who runs it:** an admin with Supabase dashboard access (SQL editor). The
  autonomous lane cannot and will not run this — it changes live production
  security posture.
- **Time:** ~15 minutes. **Rollback:** one command, instant (Step 6).

> Do every step in the **Supabase SQL editor** for the analytics project. Paste
> back only the **counts/booleans** these queries return — never a secret
> (anon key, service key, DB password) and never full row `data`.

---

## What the flip actually changes

After the flip, on all five workspace tables (`connections`, `datasets`,
`dashboards`, `analyses`, `jobs`) plus `users`:

- A row is **readable** if it is **not private**, OR its `owner`
  (`acctOwner` for `datasets`; `gotrueId` for `users`) equals the caller's
  `auth.uid()`.
- A row is **writable** only by its owner (admins may write any `users` row).
- `auth.uid()` is **NULL for the anon key**, so anonymous / demo-key access
  degrades to **public rows only** and cannot write.
- `polecat_meta` keeps its allow-all policy (the app reads it before auth).

**The two ways this can bite — both handled in pre-flight below:**

1. **A user with no GoTrue identity** (still using the plain anon key) will,
   after the flip, see only public rows and be unable to save. Every real
   read/write user must sign in via **Supabase Auth (GoTrue)** first.
2. **A private row whose `owner` is still a username** (`"admin"`, `"demo"`)
   instead of a GoTrue UUID becomes **invisible to everyone** (no UUID will
   ever equal `"admin"`). Public rows are unaffected.

---

## Step 0 — Precondition: everyone who needs write access has signed in via GoTrue

The app added GoTrue sign-in in M7 slice 2. Before flipping:

1. In the app: **Settings → Workspace backend**, set the connection's
   **Auth email / Auth password** (GoTrue credentials) for the workspace, and
   **sign in** at least once as **each real user** — most importantly the
   **admin**. Signing in stamps that account's `gotrueId` locally and runs
   `migrateOwnerToGotrueId`, which re-stamps that user's own rows from username
   → their GoTrue UUID and mirrors their own `users` row.
2. Confirm GoTrue accounts exist:

```sql
select id, email, created_at from auth.users order by created_at;
```

You should see one `auth.users` row per real user. Note the **admin's UUID** —
you'll use it in verification (Step 5).

---

## Step 1 — Snapshot (cheap insurance)

Supabase keeps automatic backups, but take a quick logical snapshot of row
counts so you can prove nothing was lost:

```sql
select 'connections' t, count(*) from public.connections
union all select 'datasets',   count(*) from public.datasets
union all select 'dashboards', count(*) from public.dashboards
union all select 'analyses',   count(*) from public.analyses
union all select 'jobs',       count(*) from public.jobs
union all select 'users',      count(*) from public.users
order by 1;
```

Save the output. (Optional stronger backup: Supabase dashboard → Database →
Backups → download, or `pg_dump` the six tables.)

---

## Step 2 — Pre-flight A: find "orphaned private" rows (owner not a UUID)

These are the rows that would vanish after the flip. `owner` for four tables,
`acctOwner` for `datasets`:

```sql
with u as (select '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' rx)
select 'connections' tbl,
       count(*) filter (where (data::jsonb->>'private')::boolean is true
         and coalesce(data::jsonb->>'owner','') !~* (select rx from u)) orphan_private
from public.connections
union all select 'dashboards',
       count(*) filter (where (data::jsonb->>'private')::boolean is true
         and coalesce(data::jsonb->>'owner','') !~* (select rx from u))
from public.dashboards
union all select 'analyses',
       count(*) filter (where (data::jsonb->>'private')::boolean is true
         and coalesce(data::jsonb->>'owner','') !~* (select rx from u))
from public.analyses
union all select 'jobs',
       count(*) filter (where (data::jsonb->>'private')::boolean is true
         and coalesce(data::jsonb->>'owner','') !~* (select rx from u))
from public.jobs
union all select 'datasets',
       count(*) filter (where (data::jsonb->>'private')::boolean is true
         and coalesce(data::jsonb->>'acctOwner','') !~* (select rx from u))
from public.datasets
order by 1;
```

- **All zero →** great, skip Step 3, go to Step 4.
- **Non-zero →** those private rows have username owners. Decide in Step 3.

---

## Step 3 — (Only if Step 2 found orphans) Remediate

Pick ONE per orphaned set. Two safe options:

**Option A — make them public** (nothing disappears; they just lose privacy):

```sql
-- example for dashboards; repeat per table (acctOwner for datasets)
update public.dashboards
set data = jsonb_set(data::jsonb, '{private}', 'false')::text
where (data::jsonb->>'private')::boolean is true
  and coalesce(data::jsonb->>'owner','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
```

**Option B — reassign to the admin's UUID** (they stay private, owned by admin).
Replace `ADMIN_UUID` with the admin's `auth.users.id` from Step 0:

```sql
update public.dashboards
set data = jsonb_set(data::jsonb, '{owner}', to_jsonb('ADMIN_UUID'::text))::text
where (data::jsonb->>'private')::boolean is true
  and coalesce(data::jsonb->>'owner','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
```

Re-run Step 2 until it's all zero.

---

## Step 2b — Pre-flight B: the admin's `users` row carries its `gotrueId`

`polecat_is_admin()` matches `users.data->>'gotrueId'` to `auth.uid()`. If the
admin's row has no `gotrueId`, they lose admin DB powers after the flip.

```sql
select id, "role", (data::jsonb->>'gotrueId') gotrue_id
from public.users order by "role", id;
```

Every account that needs DB access should show a `gotrue_id` that matches its
`auth.users.id` from Step 0 — **the admin especially**. If a row is missing it,
have that user sign in via GoTrue once (Step 0) and re-check, or set it directly:

```sql
-- only if a needed row is missing its gotrueId
update public.users
set data = jsonb_set(data::jsonb, '{gotrueId}', to_jsonb('THAT_USERS_UUID'::text))::text
where id = 'user_<username>';
```

---

## Step 4 — Flip (apply the real policies)

Paste the **entire contents of `tools/supabase-rls-real.sql`** into the SQL
editor and run it. It:

- drops `polecat_anon_all` on the five data tables + `users`,
- creates per-user `select/insert/update/delete` policies (owner/private shape),
- creates the `polecat_is_admin()` SECURITY DEFINER helper + the `users`
  self-row/admin policies,
- `NOTIFY pgrst, 'reload schema'` so the REST API picks it up immediately.

It is idempotent (each `CREATE POLICY` is preceded by `DROP POLICY IF EXISTS`).

---

## Step 5 — Verify

Run each block. Use the **admin UUID** from Step 0 for the authenticated tests.

**(a) Anonymous sees public rows only:**

```sql
begin;
  set local role anon;
  select count(*) total_visible,
         count(*) filter (where (data::jsonb->>'private')::boolean is true) private_leaked
  from public.dashboards;   -- expect private_leaked = 0
rollback;
```

**(b) An authenticated user sees public + their own private, and can't see
another user's private:**

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ADMIN_UUID"}';
  select count(*) visible_to_admin,
         count(*) filter (where (data::jsonb->>'private')::boolean is true) own_or_public_private
  from public.dashboards;
rollback;
```

Compare (a) vs (b): the authenticated count should be **≥** the anon count
(public + that user's own private).

**(c) `users` visibility — a plain viewer sees only itself; admin sees all:**

```sql
-- as the admin (sees all)
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ADMIN_UUID"}';
  select count(*) users_visible_to_admin from public.users;   -- expect = total users
rollback;

-- as a non-admin viewer (replace VIEWER_UUID) — sees only their own row
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"VIEWER_UUID"}';
  select count(*) users_visible_to_viewer from public.users;  -- expect 1
rollback;
```

**(d) Live app smoke:** open `https://analytics.polecat.live/app/`, sign in via
GoTrue, confirm you can read your dashboards and save an edit. Then open a
private/incognito window (anon, no sign-in) and confirm you see only public
content and cannot save.

If all four look right, **you're done** — RLS is live and M7 is complete.

---

## Step 6 — Rollback (instant, if anything looks wrong)

Re-running the bootstrap restores the demo allow-all posture on every table:

```sql
-- paste the entire tools/supabase-bootstrap.sql and run it, OR the minimal form:
do $$
declare t text;
begin
  foreach t in array array['polecat_meta','connections','datasets','dashboards','analyses','jobs','users'] loop
    execute format('drop policy if exists polecat_select on %I', t);
    execute format('drop policy if exists polecat_insert on %I', t);
    execute format('drop policy if exists polecat_update on %I', t);
    execute format('drop policy if exists polecat_delete on %I', t);
    execute format('drop policy if exists polecat_anon_all on %I', t);
    execute format('create policy polecat_anon_all on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;
notify pgrst, 'reload schema';
```

(`public.polecat_is_admin()` can be left in place — it's harmless when unused —
or `drop function public.polecat_is_admin();`.)

No data is modified by the flip or the rollback (Step 3 remediation is the only
data write, and only if you chose to run it).

---

## Post-go-live notes

- Every new user must be given a **GoTrue account** and sign in with it to get
  read/write access — the anon key is now public-read-only.
- The Admin console's cross-user add/edit works because a real admin passes the
  `polecat_is_admin()` branch; `initAuthBoot` now mirrors only the caller's own
  row (M7 #212), so a viewer's boot no longer tries foreign-row writes.
- Update `STATUS.md` M7 to DONE and note the go-live date once verified.
