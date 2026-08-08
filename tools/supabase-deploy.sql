-- Polecat "analytics" workspace — COMPLETE fresh-environment deploy script.
--
-- THE one file to run, top-to-bottom, bare (no begin/rollback wrapper), in
-- Supabase → SQL editor when standing up a NEW environment. It captures
-- everything the live project accumulated piecemeal (2026-07-30, Kevin +
-- steward): workspace tables, the verified authenticated-only RLS posture,
-- and the activity/feedback log tables. Idempotent throughout — safe to
-- re-run on an existing environment any time.
--
-- Companion files (keep in sync — this file is the SUPERSET):
--   * tools/supabase-rls-real.sql — the RLS posture alone (sections 2–5 here),
--     for re-tightening an environment whose tables already exist.
--   * tools/M7-RLS-GOLIVE-RUNBOOK.md — background, verify queries, history.
--
-- After running: create the first admin (Authentication → Add user in the
-- dashboard, then INSERT their public.users row as postgres — see § 7), and
-- verify with § 8 (expect zeros for anon everywhere).
--
-- ---------------------------------------------------------------------------
-- § 0) BEFORE THIS FILE: CREATING THE PROJECT (N19)
--
-- This script assumes a project already exists, and for a long time nothing in
-- the repo said how to create one — Kevin hit exactly that standing up
-- polecat_dev (2026-08-08) and had to ask which create-project Security boxes
-- the app needs. The user-facing copy is docs/index.html → Admin & backend
-- setup → "Standing up a Supabase project"; this is the canonical short form,
-- kept next to the SQL that depends on it. tools/doc-truth.mjs check 26 holds
-- the two accountable to each other and to this file.
--
-- The three Security toggles on the create-project screen:
--   * Enable Data API — ON, REQUIRED. The adapter is a PostgREST client; with
--     the Data API off there is no door to knock on.
--   * Automatically expose new tables — OFF, as Supabase recommends (N20,
--     2026-08-08). It used to have to be ON, because this file contained ZERO
--     `GRANT` statements and leaned entirely on the project's default
--     privileges — turn the toggle off back then and the script yielded tables
--     with RLS and the right policies but no table-level grant to
--     anon/authenticated, so PostgREST refused and the app could not connect,
--     with a failure that looked like an RLS problem and was not one. § 6c now
--     grants explicitly, so the recommended answer is finally the correct one.
--     WHOEVER REMOVES § 6c flips this back to ON in the same change — doc-truth
--     check 26 reads the GRANT count out of this file and goes red either way.
--   * Enable automatic RLS — ON. § 2 already enables RLS + policies per table,
--     so this only covers anything created outside this file. With the newer
--     publishable keys a table with RLS and NO policy returns zero rows rather
--     than erroring, so RLS-on is the working state, not the locked one.
--
-- Decided once, at creation, unrecoverable afterwards:
--   * SAVE THE DATABASE PASSWORD. It is shown once and can only be reset, not
--     recovered — and tests/rls.mjs needs it as SUPABASE_PASSWORD, SKIPPING
--     SILENTLY (exit 0) without it.
--   * REGION = ca-central-1, Canada (Central) — a fleet STANDARD, not a
--     preference (Kevin, 2026-08-08). tests/rls.mjs defaults to the pooler host
--     aws-0-ca-central-1.pooler.supabase.com, so a same-region project needs no
--     extra config while any other needs SUPABASE_DB_HOST on every run — which,
--     with that silent skip, reads GREEN while testing nothing. Supabase cannot
--     change a project's region after creation; ignore the "Recommended" badge
--     on us-east-1 (generic geography advice, not advice about this fleet).
--
-- And: dev and stage run the SAME posture as prod — the real one (Kevin,
-- 2026-08-08); a free-tier project pauses after ~1 week idle, which the app must
-- read as UNREACHABLE, not as a refusal (the N2-slice-3 / N11 / N14
-- distinction); and one project can host several fleet apps, since
-- polecat_meta's app marker (app/sources/schema.js WS.APP_ID) is what tells
-- "analytics" from manager/relay — which is why a shared polecat_dev is sound.

-- ---------------------------------------------------------------------------
-- 1) Workspace tables (mirrors app/sources/schema.js WS.WORKSPACE_TABLES —
--    id + promoted columns + the full-row `data` blob; updatedAt is epoch-ms,
--    BIGINT because int4 overflows).
CREATE TABLE IF NOT EXISTS public.polecat_meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS public.connections (id TEXT PRIMARY KEY, "name" TEXT, "adapter" TEXT, "updatedAt" BIGINT, data TEXT);
CREATE TABLE IF NOT EXISTS public.datasets    (id TEXT PRIMARY KEY, "name" TEXT, "connectionId" TEXT, "kind" TEXT, "updatedAt" BIGINT, data TEXT);
CREATE TABLE IF NOT EXISTS public.dashboards  (id TEXT PRIMARY KEY, "name" TEXT, "title" TEXT, "updatedAt" BIGINT, data TEXT);
CREATE TABLE IF NOT EXISTS public.analyses    (id TEXT PRIMARY KEY, "name" TEXT, "datasetId" TEXT, "chartType" TEXT, "updatedAt" BIGINT, data TEXT);
CREATE TABLE IF NOT EXISTS public.jobs        (id TEXT PRIMARY KEY, "name" TEXT, "sourceDatasetId" TEXT, "updatedAt" BIGINT, data TEXT);
CREATE TABLE IF NOT EXISTS public.users       (id TEXT PRIMARY KEY, "name" TEXT, "role" TEXT, "updatedAt" BIGINT, data TEXT);

-- 1b) Say what was just built (N20 rider, 2026-08-08). This file built the full
--     v4 shape and then declined to declare it: the N16 version handshake read
--     `unknown` until the app's first save stamped the marker, which is exactly
--     the window a second client is most likely to arrive in. Both markers are
--     DO NOTHING, never DO UPDATE — an existing environment's own answer always
--     wins, so re-running an OLDER copy of this script against an upgraded
--     workspace can never rewind `schema_version` (the SQL half of the
--     monotonicity N17 gave WS.metaRows()), and running the analytics deploy
--     against a project another fleet app already claimed cannot relabel it.
--     doc-truth check 25 holds the version below to app/sources/schema.js.
INSERT INTO public.polecat_meta(key, value) VALUES ('app', 'analytics')
  ON CONFLICT (key) DO NOTHING;
INSERT INTO public.polecat_meta(key, value) VALUES ('schema_version', '4')
  ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) RLS ON + retire every legacy open policy on all seven workspace tables.
--    Permissive policies OR together — ONE leftover allow-all silently defeats
--    every tighter policy beside it (the 2026-07-30 live incident: polecat_open_rw,
--    created by the app's old remedy SQL, reopened everything).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dashboards','connections','datasets','analyses','jobs','users','polecat_meta'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS polecat_open_rw ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS polecat_anon_all ON public.%I', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2.5) The admin helper — DEFINED FIRST, because every policy from § 3 on calls
--    it. It used to sit with the `users` policies in § 4, which made this
--    file's whole point — a FRESH one-file deploy — fail on its first
--    CREATE POLICY with "function public.polecat_is_admin() does not exist"
--    (caught 2026-08-07 by tests/rls.mjs, which builds a fresh schema every
--    run). Keep it above § 3.
--    SECURITY DEFINER avoids the policy-recursion trap: the owner-run
--    function's internal SELECT bypasses RLS (no FORCE RLS set), so the admin
--    check never re-enters the policy it serves.
CREATE OR REPLACE FUNCTION public.polecat_is_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE (data::jsonb->>'gotrueId') = auth.uid()::text AND "role" = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- 3) The five owner/private tables: reads = not-private OR own OR admin;
--    writes = own OR admin. The admin arm is REQUIRED — sync pushes the whole
--    workspace snapshot including rows other accounts own; pure owner-only
--    WITH CHECK refuses every admin device's push (proven live 2026-07-30).
DO $$
DECLARE
  t text;
  owner_field text;
  spec jsonb := '{"connections":"owner","dashboards":"owner","analyses":"owner","jobs":"owner","datasets":"acctOwner"}'::jsonb;
BEGIN
  FOR t IN SELECT jsonb_object_keys(spec) LOOP
    owner_field := spec->>t;
    EXECUTE format('DROP POLICY IF EXISTS polecat_select ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS polecat_insert ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS polecat_update ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS polecat_delete ON %I', t);
    EXECUTE format(
      'CREATE POLICY polecat_select ON %I FOR SELECT TO authenticated USING (coalesce((data::jsonb->>%L)::boolean, false) = false OR (data::jsonb->>%L) = auth.uid()::text OR public.polecat_is_admin())',
      t, 'private', owner_field);
    EXECUTE format(
      'CREATE POLICY polecat_insert ON %I FOR INSERT TO authenticated WITH CHECK ((data::jsonb->>%L) = auth.uid()::text OR public.polecat_is_admin())',
      t, owner_field);
    EXECUTE format(
      'CREATE POLICY polecat_update ON %I FOR UPDATE TO authenticated USING ((data::jsonb->>%L) = auth.uid()::text OR public.polecat_is_admin()) WITH CHECK ((data::jsonb->>%L) = auth.uid()::text OR public.polecat_is_admin())',
      t, owner_field, owner_field);
    EXECUTE format(
      'CREATE POLICY polecat_delete ON %I FOR DELETE TO authenticated USING ((data::jsonb->>%L) = auth.uid()::text OR public.polecat_is_admin())',
      t, owner_field);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4) `users` — self-row + admin (holds password hashes; stricter shape). The
--    `polecat_is_admin()` helper these policies lean on is defined in § 2.5.

-- GATE-FIX-2 (live incident, 2026-07-31): "own row" is matched by gotrueId OR
-- by the account's sign-in EMAIL (users.data->>'u' vs the JWT's email claim).
-- gotrueId-only was CIRCULAR: a row missing its gotrueId stamp (hand-restored,
-- pre-link-era) was invisible to its own password-verified user — and
-- polecat_is_admin() needs that same stamp, so an admin couldn't see or heal
-- their own row either. The email arm breaks the loop: a verified sign-in can
-- always read + update its own row, and the app then stamps gotrueId itself.
DROP POLICY IF EXISTS polecat_select ON public.users;
DROP POLICY IF EXISTS polecat_insert ON public.users;
DROP POLICY IF EXISTS polecat_update ON public.users;
DROP POLICY IF EXISTS polecat_delete ON public.users;
CREATE POLICY polecat_select ON public.users FOR SELECT TO authenticated USING (
  (data::jsonb->>'gotrueId') = auth.uid()::text
  OR lower(data::jsonb->>'u') = lower(coalesce(auth.jwt()->>'email',''))
  OR public.polecat_is_admin()
);
CREATE POLICY polecat_update ON public.users FOR UPDATE TO authenticated USING (
  (data::jsonb->>'gotrueId') = auth.uid()::text
  OR lower(data::jsonb->>'u') = lower(coalesce(auth.jwt()->>'email',''))
  OR public.polecat_is_admin()
) WITH CHECK (
  (data::jsonb->>'gotrueId') = auth.uid()::text
  OR lower(data::jsonb->>'u') = lower(coalesce(auth.jwt()->>'email',''))
  OR public.polecat_is_admin()
);
CREATE POLICY polecat_insert ON public.users FOR INSERT TO authenticated WITH CHECK (public.polecat_is_admin());
CREATE POLICY polecat_delete ON public.users FOR DELETE TO authenticated USING (public.polecat_is_admin());

-- ---------------------------------------------------------------------------
-- 5) `polecat_meta` — authenticated full access (no policy = deny = the app
--    can't read its own metadata).
DROP POLICY IF EXISTS polecat_meta_auth ON public.polecat_meta;
CREATE POLICY polecat_meta_auth ON public.polecat_meta
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 6) ACTIVITY-1 log tables (added 2026-07-30, Kevin): TWO separate logs —
--    the action trail and the comment/question/bug reports. Append-only for
--    signed-in users (own rows), admin-only reads, nothing for anon.
CREATE TABLE IF NOT EXISTS public.polecat_activity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  gotrue_id text,
  username text,
  action text NOT NULL,
  detail jsonb
);
ALTER TABLE public.polecat_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS polecat_activity_insert ON public.polecat_activity;
CREATE POLICY polecat_activity_insert ON public.polecat_activity
  FOR INSERT TO authenticated
  WITH CHECK (gotrue_id IS NULL OR gotrue_id = auth.uid()::text OR public.polecat_is_admin());
DROP POLICY IF EXISTS polecat_activity_select ON public.polecat_activity;
CREATE POLICY polecat_activity_select ON public.polecat_activity
  FOR SELECT TO authenticated USING (public.polecat_is_admin());

CREATE TABLE IF NOT EXISTS public.polecat_feedback (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  gotrue_id text,
  username text,
  kind text NOT NULL,
  message text,
  context jsonb
);
ALTER TABLE public.polecat_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS polecat_feedback_insert ON public.polecat_feedback;
CREATE POLICY polecat_feedback_insert ON public.polecat_feedback
  FOR INSERT TO authenticated
  WITH CHECK (gotrue_id IS NULL OR gotrue_id = auth.uid()::text OR public.polecat_is_admin());
DROP POLICY IF EXISTS polecat_feedback_select ON public.polecat_feedback;
CREATE POLICY polecat_feedback_select ON public.polecat_feedback
  FOR SELECT TO authenticated USING (public.polecat_is_admin());

-- ---------------------------------------------------------------------------
-- 6b) ACTIVITY-ANON (added 2026-07-31, Kevin: "recording anonymous users as
--     well... collect what you can on them ip, whatever"). Lets the app log
--     activity/feedback for LOCAL and not-signed-in visitors via the packaged
--     workspace's anon key. Posture stays intact:
--       * INSERT-ONLY for anon — SELECT remains admin-only (the § 8 anon
--         verify still reads ALL ZEROS), and an anon row can never claim an
--         authenticated identity (gotrue_id must be NULL).
--       * ip/ua are stamped SERVER-side from the PostgREST request headers by
--         a trigger — a browser can't see its own public IP, and this way the
--         client can't spoof one either. Works for signed-in rows too.
ALTER TABLE public.polecat_activity ADD COLUMN IF NOT EXISTS ip text;
ALTER TABLE public.polecat_activity ADD COLUMN IF NOT EXISTS ua text;
ALTER TABLE public.polecat_feedback ADD COLUMN IF NOT EXISTS ip text;
ALTER TABLE public.polecat_feedback ADD COLUMN IF NOT EXISTS ua text;

CREATE OR REPLACE FUNCTION public.polecat_stamp_request_meta() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    NEW.ip := split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1);
    NEW.ua := left(coalesce(current_setting('request.headers', true)::json->>'user-agent', ''), 200);
  EXCEPTION WHEN others THEN
    NULL; -- header stamping is best-effort; never block the insert
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS polecat_activity_stamp ON public.polecat_activity;
CREATE TRIGGER polecat_activity_stamp BEFORE INSERT ON public.polecat_activity
  FOR EACH ROW EXECUTE FUNCTION public.polecat_stamp_request_meta();
DROP TRIGGER IF EXISTS polecat_feedback_stamp ON public.polecat_feedback;
CREATE TRIGGER polecat_feedback_stamp BEFORE INSERT ON public.polecat_feedback
  FOR EACH ROW EXECUTE FUNCTION public.polecat_stamp_request_meta();

DROP POLICY IF EXISTS polecat_activity_insert_anon ON public.polecat_activity;
CREATE POLICY polecat_activity_insert_anon ON public.polecat_activity
  FOR INSERT TO anon
  WITH CHECK (gotrue_id IS NULL);
DROP POLICY IF EXISTS polecat_feedback_insert_anon ON public.polecat_feedback;
CREATE POLICY polecat_feedback_insert_anon ON public.polecat_feedback
  FOR INSERT TO anon
  WITH CHECK (gotrue_id IS NULL);

-- ---------------------------------------------------------------------------
-- 6c) TABLE PRIVILEGES (N20, 2026-08-08). Until now this file had no GRANT of
--     its own and leaned on the project's default privileges, which meant it
--     only worked on a project created with "Automatically expose new tables"
--     ON — the opposite of what Supabase recommends. Follow the recommendation
--     and you got RLS + the right policies and STILL could not connect: no
--     table-level privilege for anon/authenticated, so PostgREST refuses. The
--     posture was right; the plumbing under it was missing.
--
--     These are safe under the real posture, and that is the whole point:
--     privileges say WHICH TABLES a role may address, policies say WHICH ROWS
--     it may see. Everything above has RLS on with authenticated-only policies,
--     so a grant without a matching policy still returns nothing — the § 8
--     anon verify below reads ALL ZEROS with these grants in place, exactly as
--     it did without them.
--
--     Placed LAST on purpose: `ON ALL TABLES` is a snapshot of what exists when
--     it runs, so it has to sit after § 6/6b's log tables, not after § 1's
--     seven. The ALTER DEFAULT PRIVILEGES line then covers tables added later
--     (a schema-version upgrade), so the next table is not a fresh outage.
--     Lifted verbatim from tools/supabase-bootstrap.sql, which has shipped
--     these three statements since the first environment.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 7) FIRST ADMIN (run once per environment, as postgres — bypasses RLS, which
--    is required: users INSERT is admin-only and a fresh environment has none).
--    First create the Auth account (Authentication → Add user), copy its UID,
--    then (fill in the three <...> values):
--
--   INSERT INTO public.users (id, "name", "role", "updatedAt", data) VALUES
--     ('user_<username>', '<Display Name>', 'admin',
--      (extract(epoch from now())*1000)::bigint,
--      '{"id":"user_<username>","u":"<username>","name":"<Display Name>","role":"admin","demo":false,"gotrueId":"<AUTH-UID>"}')
--   ON CONFLICT (id) DO UPDATE SET "role" = EXCLUDED."role", data = EXCLUDED.data;

-- ---------------------------------------------------------------------------
-- 8) VERIFY (run separately; expect ALL ZEROS for anon — confirmed live
--    2026-07-30 on the six workspace tables; the log tables have no anon
--    policies so they are zero by construction):
--   begin;
--     set local role anon;
--     select
--       (select count(*) from public.dashboards)  dashboards_anon,
--       (select count(*) from public.connections) connections_anon,
--       (select count(*) from public.datasets)    datasets_anon,
--       (select count(*) from public.analyses)    analyses_anon,
--       (select count(*) from public.jobs)        jobs_anon,
--       (select count(*) from public.users)       users_anon,
--       (select count(*) from public.polecat_activity) activity_anon,
--       (select count(*) from public.polecat_feedback) feedback_anon;
--   rollback;
-- Then sign into the app as the admin and confirm a test edit pushes cleanly.
