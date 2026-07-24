-- Polecat "analytics" workspace — REAL per-user Row-Level Security (M7).
--
-- DO NOT RUN THIS AGAINST THE LIVE PROJECT YET. Two things have to be true
-- first, neither of which has shipped in the app as of this writing:
--   1. GoTrue sign-in wired into the Supabase adapter, so requests carry a
--      real Supabase Auth JWT (today the app only ever uses the static
--      anon/publishable key — no request has ever set auth.uid()).
--   2. Every row's owner/acctOwner field re-stamped from a GoTrue UUID
--      instead of the current PolecatAuth USERNAME string ("admin", "demo",
--      …). Confirmed live 2026-07-24 (SELECT data FROM public.dashboards):
--      existing rows carry `"owner":"admin"` — plain text, not a UUID. This
--      matters because Postgres' auth.uid() is typed uuid, so a policy that
--      compares it against a non-UUID owner value doesn't silently degrade —
--      it ERRORS on every read for authenticated users (verified in the
--      steward_test proof-of-concept below: auth.uid() itself throws
--      "invalid input syntax for type uuid" when the JWT's `sub` claim isn't
--      a UUID; a plain-text stored owner value never gets that far).
-- Applying this today, with no GoTrue sign-in and old string owners, would
-- make every existing private row invisible to everyone (auth.uid() is NULL
-- for the still-anon-only app) — a silent data-access regression, not a
-- security improvement. Keep tools/supabase-bootstrap.sql's "allow all"
-- policy live until both prerequisites above ship.
--
-- Design proven empirically against the real project 2026-07-24 (steward
-- run) in an isolated `steward_test` schema — mirrored one workspace table,
-- enabled RLS with the policies below, and confirmed: anon sees only public
-- rows; an authenticated user sees public rows + their own private rows, not
-- another user's; a spoofed INSERT claiming someone else's uid as owner is
-- rejected by WITH CHECK; an UPDATE against another user's private row
-- affects 0 rows. steward_test was dropped after — nothing here touched
-- `public`.
--
-- Policy shape: a row is visible if it is NOT marked private, OR its
-- stamped owner (or, for datasets, acctOwner — see the M4.2 note in
-- STATUS.md on why datasets use a differently-named field) equals the
-- caller's auth.uid(). Write access is owner-only. anon's auth.uid() is
-- always NULL, so once this is live, anonymous/demo-key access degrades
-- gracefully to "public rows only" — matching the UX-level contract M4.2
-- already built, now enforced by the database instead of just hidden by the
-- client.
--
-- `users` is deliberately left alone here — it holds every account's SHA-256
-- password hash (see app/auth.js) and needs its own, stricter policy
-- (service-role / admin-only reads) rather than the owner/private shape the
-- other five tables share; that's tracked as its own open question, not
-- assumed solved by this file.

DO $$
DECLARE
  t text;
  owner_field text;
  spec jsonb := '{"connections":"owner","dashboards":"owner","analyses":"owner","jobs":"owner","datasets":"acctOwner"}'::jsonb;
BEGIN
  FOR t IN SELECT jsonb_object_keys(spec) LOOP
    owner_field := spec->>t;
    EXECUTE format('DROP POLICY IF EXISTS polecat_anon_all ON %I', t); -- retire the demo "allow all" policy on this table
    EXECUTE format('DROP POLICY IF EXISTS polecat_select ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS polecat_insert ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS polecat_update ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS polecat_delete ON %I', t);
    EXECUTE format(
      'CREATE POLICY polecat_select ON %I FOR SELECT USING (coalesce((data::jsonb->>%L)::boolean, false) = false OR (data::jsonb->>%L) = auth.uid()::text)',
      t, 'private', owner_field);
    EXECUTE format(
      'CREATE POLICY polecat_insert ON %I FOR INSERT WITH CHECK ((data::jsonb->>%L) = auth.uid()::text)',
      t, owner_field);
    EXECUTE format(
      'CREATE POLICY polecat_update ON %I FOR UPDATE USING ((data::jsonb->>%L) = auth.uid()::text) WITH CHECK ((data::jsonb->>%L) = auth.uid()::text)',
      t, owner_field, owner_field);
    EXECUTE format(
      'CREATE POLICY polecat_delete ON %I FOR DELETE USING ((data::jsonb->>%L) = auth.uid()::text)',
      t, owner_field);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
