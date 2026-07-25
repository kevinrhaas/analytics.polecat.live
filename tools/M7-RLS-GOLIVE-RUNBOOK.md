# M7 — Supabase RLS go-live runbook

Flip the live Supabase workspace backend from the demo **"allow all"** posture to
real per-user **Row-Level Security** (`tools/supabase-rls-real.sql`, already
designed + proven against an isolated `steward_test` schema).

- **Who runs it:** an admin with Supabase dashboard (SQL editor) access. The
  autonomous lane cannot and will not run this — it changes live production
  security posture.
- **Rollback:** one command, instant (see the end).

> Do every step in the **Supabase SQL editor**. Paste back only the
> counts/booleans these queries return — never a secret (anon key, service key,
> DB password) and never full row `data`.

Three paths:

- **Path C (in-app, coming)** — the direction we're building toward (STATUS.md M7
  Slice 7, Kevin's chosen Option A): deploy a small Supabase **Edge Function
  once**, then run the entire go-live (and all future user provisioning) from
  in-app Admin buttons. Summarized below; the manual paths remain the fallback
  until Slice 7 ships.
- **Path A (clean install)** — the manual SQL path that works **today** (most of
  this document); assumes the existing backend rows are disposable.
- **Path B (in-place migration)** — the appendix, if you ever need to preserve
  existing data instead.

> Why not "just run the SQL from the app with a token"? The Supabase **Management
> API is not callable from a third-party browser** — it only allows CORS from
> `supabase.com` (verified 2026-07-24). So an in-app go-live needs a server piece
> you control: the Path C Edge Function.

---

## Path C — In-app go-live via a one-time Edge Function (the target, build-pending)

Once **Slice 7** ships, the flow becomes:

1. **One-time deploy (the only Supabase touch, ever):**
   ```
   supabase functions deploy polecat-admin
   supabase secrets set PROVISION_SECRET=<a-strong-secret>
   ```
   (The function's source lives in this repo at `supabase/functions/polecat-admin/`.
   It holds the service-role key, opens a direct Postgres connection to run the
   DDL/RLS, exposes only fixed named actions — `provision` / `go-live` /
   `create-user` / `reset-data`, never raw SQL — and sets CORS for the app origin.)
2. **In the app → Admin → "Enable per-user security / Go live":** paste the
   function URL + the `PROVISION_SECRET` once (enter-run-**discard**, never
   stored); the app calls the function's `go-live` action, which runs
   truncate → seed admin → apply RLS → verify and shows you the results.
3. **From then on:** create/manage users from the Admin console (`create-user`
   action, verified by your admin GoTrue JWT). No SQL editor, ever.

Until Slice 7 lands, use **Path A** below (one manual SQL paste). Everything
Path A does by hand is exactly what the `go-live` action will automate.

---

## Path A — Clean install (works today, manual SQL)

**Assumption:** it's OK to permanently delete every row currently in the Supabase
workspace backend (`connections`, `datasets`, `dashboards`, `analyses`, `jobs`,
`users`). This is safe because:

- it does **not** touch anyone's **browser localStorage** — the app is
  local-first; the Supabase backend is only an *optional* sync target;
- the in-app **demo/sample pack is reinstallable** anytime (Settings → sample
  content), so illustrative dashboards come back with one click;
- starting empty means every new row is created by a **signed-in GoTrue user**
  and is born with a real UUID owner — so **none of the migration/backfill work
  is needed**.

### A0 — Create the GoTrue (Supabase Auth) accounts

Supabase dashboard → **Authentication → Users → Add user** — create an
email/password account for the **admin** (and each real user). **Note the
admin's UUID.**

### A1 — Wipe the workspace tables (keep `polecat_meta`)

RLS is still allow-all here, and `truncate` runs as the table owner regardless:

```sql
truncate table public.connections, public.datasets, public.dashboards,
  public.analyses, public.jobs, public.users;
```

(`polecat_meta` — the `app`/`schema_version` markers the app reads before auth —
is intentionally left alone.)

### A2 — Seed the admin row by signing in (DO THIS BEFORE RLS)

In the app: **Settings → Workspace backend**, set the connection's **Auth email /
Auth password** to the admin GoTrue account from A0 and **sign in**. While the
backend is still allow-all, the app upserts the admin's own `users` row stamped
with its `gotrueId` and `role: "admin"`.

Confirm the admin row exists and carries the right UUID:

```sql
select id, "role", (data::jsonb->>'gotrueId') gotrue_id from public.users;
```

You must see a row with `role = admin` and `gotrue_id =` the admin UUID from A0.
**Do not proceed until this is true** — it's what makes `polecat_is_admin()`
work, and without it the RLS `users` policy locks everyone out of user
management.

### A3 — Apply the real RLS policies

Paste the **entire contents of `tools/supabase-rls-real.sql`** into the SQL editor
and run it. It drops the allow-all policies, creates the per-user
`select/insert/update/delete` policies on the five data tables + `users`, creates
the `polecat_is_admin()` helper, and reloads PostgREST. Idempotent.

### A4 — Verify

**(a) Anonymous sees public rows only (and no private leak):**

```sql
begin;
  set local role anon;
  select count(*) total_visible,
         count(*) filter (where (data::jsonb->>'private')::boolean is true) private_leaked
  from public.dashboards;   -- private_leaked must be 0
rollback;
```

**(b) The admin sees their own content (replace `ADMIN_UUID`):**

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ADMIN_UUID"}';
  select count(*) visible_to_admin from public.dashboards;
rollback;
```

**(c) `users` table — admin sees all, a viewer sees only itself:**

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ADMIN_UUID"}';
  select count(*) users_visible_to_admin from public.users;   -- = total users
rollback;
-- with a non-admin VIEWER_UUID this returns 1 (their own row only)
```

**(d) Live-app smoke:** open `https://analytics.polecat.live/app/`, sign in via
GoTrue as the admin, confirm you can create/save a dashboard (owned by your
UUID now). Then open a private/incognito window (anon, not signed in) and confirm
you see only public content and cannot save.

If all four look right, **RLS is live and M7 is complete.** Reinstall the sample
pack in-app if you want demo dashboards back (they'll be owned by whoever
installs them; leave them non-private so anonymous visitors can see them).

### A5 — Post go-live

- Each additional user needs a **GoTrue account** (A0) and signs in once; their
  synced content is then owned by their UUID.
- The Admin console's cross-user add/edit works because a real admin passes the
  `polecat_is_admin()` branch.
- Update `STATUS.md` M7 → DONE with the go-live date.

### Rollback (instant) — restores the demo allow-all posture

```sql
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

(Or just re-run `tools/supabase-bootstrap.sql`, which is idempotent and does the
same. `public.polecat_is_admin()` can be left in place — harmless — or dropped.)

---

## Appendix B — In-place migration (only if you must preserve existing data)

Skip this entirely if you took Path A. This is the longer path that keeps the
current rows, at the cost of a data migration. The two failure modes it guards:

1. **A user with no GoTrue identity** would, after the flip, see only public rows
   and be unable to save. Everyone who needs write access must sign in via GoTrue
   first (as in A0/A2).
2. **A private row whose `owner` is still a username** (`"admin"`, `"demo"`)
   instead of a UUID becomes invisible to everyone.

Procedure:

1. **Snapshot** row counts (proof nothing's lost):
   ```sql
   select 'dashboards' t, count(*) from public.dashboards
   union all select 'datasets', count(*) from public.datasets
   union all select 'connections', count(*) from public.connections
   union all select 'analyses', count(*) from public.analyses
   union all select 'jobs', count(*) from public.jobs
   union all select 'users', count(*) from public.users order by 1;
   ```
2. **Pre-flight A — find orphaned private rows** (private, owner not a UUID;
   `acctOwner` for `datasets`):
   ```sql
   with u as (select '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' rx)
   select 'dashboards' tbl, count(*) filter (where (data::jsonb->>'private')::boolean is true
     and coalesce(data::jsonb->>'owner','') !~* (select rx from u)) orphan_private
   from public.dashboards
   -- repeat UNION ALL for connections, analyses, jobs (owner) and datasets (acctOwner)
   ;
   ```
3. **Remediate** any orphans — either make them public
   (`jsonb_set(data::jsonb,'{private}','false')`) or reassign `owner` to the
   admin's UUID (`jsonb_set(data::jsonb,'{owner}', to_jsonb('ADMIN_UUID'::text))`).
   Re-run step 2 until zero.
4. **Pre-flight B** — confirm the admin's `users` row has its `gotrueId`
   (`select id, role, data::jsonb->>'gotrueId' from public.users;`).
5. **Apply** `tools/supabase-rls-real.sql`, then **verify** with the same blocks
   as A4, and **roll back** the same way if needed.
