-- Polecat "analytics" workspace — REAL per-user Row-Level Security (M7).
--
-- DO NOT RUN THIS AGAINST THE LIVE PROJECT YET. Originally two things had to
-- be true first — both have since SHIPPED in the app (noted for history, not
-- as a green light — see the still-open items below):
--   1. GoTrue sign-in wired into the Supabase adapter, so requests carry a
--      real Supabase Auth JWT (today the app only ever uses the static
--      anon/publishable key — no request has ever set auth.uid()). ✓ shipped
--      M7 slice 2 (app/sources/supabase.js authEmail/authPassword).
--   2. Every row's owner/acctOwner field re-stamped from a GoTrue UUID
--      instead of the current PolecatAuth USERNAME string ("admin", "demo",
--      …). Confirmed live 2026-07-24 (SELECT data FROM public.dashboards):
--      existing rows carry `"owner":"admin"` — plain text, not a UUID. This
--      matters because Postgres' auth.uid() is typed uuid, so a policy that
--      compares it against a non-UUID owner value doesn't silently degrade —
--      it ERRORS on every read for authenticated users (verified in the
--      steward_test proof-of-concept below: auth.uid() itself throws
--      "invalid input syntax for type uuid" when the JWT's `sub` claim isn't
--      a UUID; a plain-text stored owner value never gets that far). ✓
--      shipped M7 slice 3 (migrateOwnerToGotrueId, runs at boot + post-sign-in).
-- What's STILL open before this can go live: the `users` table needs its own
-- policy (added at the bottom of this file, 2026-07-24) plus an app-side fix
-- to `initAuthBoot` documented in that block's header, and — regardless of
-- app readiness — actually flipping `supabase-bootstrap.sql`'s live "allow
-- all" policy to any of the real ones below is its own careful, deliberate
-- action: do that only with Kevin's awareness, given it changes live
-- production security posture.
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
-- `users` holds every account's SHA-256 password hash (see app/auth.js), so it
-- does NOT get the owner/private shape the other five tables share below —
-- see the SEPARATE block at the bottom of this file for its own, stricter
-- design (self-row + admin-only), proven 2026-07-24 the same way as the rest
-- of this file. It has its OWN additional prerequisite beyond the two above —
-- see that block's header.

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

-- ---------------------------------------------------------------------------
-- `users` table policy (M7, designed + proven 2026-07-24, steward) — kept
-- SEPARATE from the DO $$ block above on purpose: it's a different shape
-- (self-row + admin, not owner/private) and has its OWN extra prerequisite.
--
-- DO NOT RUN THIS AGAINST THE LIVE PROJECT YET EITHER. Same two prerequisites
-- as the rest of this file (GoTrue sign-in wired in — shipped M7 slice 2 —
-- and rows carrying a real gotrueId — shipped M7 slice 3 for the OTHER five
-- tables' owner/acctOwner fields) PLUS a third, `users`-specific one that is
-- still open: today `initAuthBoot` (app/studio.js) mirrors EVERY locally-known
-- account into the workspace `users` table on every boot (not just the
-- signed-in user's own row) — an ordinary viewer's client currently UPSERTs
-- rows it doesn't own. The self-row-only write policy below would silently
-- drop those foreign-row upserts (RLS just filters them, PostgREST returns
-- 0 rows patched, no error), so an admin's edits made through the Admin
-- console (which also writes any account's row) would appear to succeed
-- client-side while the database quietly rejects a non-admin's copy of the
-- same write. Fixing that is its own app-side slice (scope initAuthBoot's
-- mirror to the caller's own row only; keep the Admin console's cross-user
-- writes, since real admins pass the policy's admin branch) — do that BEFORE
-- flipping this one live, and only actually apply any of this with Kevin's
-- awareness given it changes live production security posture.
--
-- Design proven empirically against the real project 2026-07-24 (steward run,
-- same throwaway-schema method as above): an anonymous session saw zero rows;
-- a plain viewer saw only their own row (not a co-worker's — confirmed a
-- second viewer's row was invisible to them); an admin saw every row; a
-- viewer's UPDATE/DELETE against another account's row affected 0 rows and a
-- spoofed INSERT was rejected by WITH CHECK, while an admin's INSERT/UPDATE/
-- DELETE against ANY row succeeded; steward_test was dropped after — nothing
-- here touched `public`, and `SELECT count(*) FROM public.users` + `\dn`
-- confirmed the live project was untouched afterward.
--
-- Naive self-referencing admin check ("EXISTS (SELECT 1 FROM users WHERE
-- role='admin' AND …)" inside the policy itself) hits Postgres' "infinite
-- recursion detected in policy for relation" — the subquery's own scan
-- re-applies the SAME policy it's part of. The fix used below is the standard
-- one: a SECURITY DEFINER helper function. Owned by `postgres` (the table
-- owner), and Postgres does not apply RLS to a table's own owner unless
-- FORCE ROW LEVEL SECURITY is set (it isn't here), so the function's internal
-- SELECT bypasses RLS and the recursion never starts.
--
-- Row matching uses `gotrueId` (stamped in the `data` jsonb blob, same field
-- M7 slice 2/3 introduced for the other five tables) rather than the row's
-- `id` column, which stays "user_<username>" — not a GoTrue uuid — so it can
-- never match auth.uid() directly.

CREATE OR REPLACE FUNCTION public.polecat_is_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE (data::jsonb->>'gotrueId') = auth.uid()::text AND "role" = 'admin'
  );
$$;

DROP POLICY IF EXISTS polecat_anon_all ON public.users; -- retire the demo "allow all" policy
DROP POLICY IF EXISTS polecat_select ON public.users;
DROP POLICY IF EXISTS polecat_insert ON public.users;
DROP POLICY IF EXISTS polecat_update ON public.users;
DROP POLICY IF EXISTS polecat_delete ON public.users;

CREATE POLICY polecat_select ON public.users FOR SELECT USING (
  (data::jsonb->>'gotrueId') = auth.uid()::text OR public.polecat_is_admin()
);
CREATE POLICY polecat_update ON public.users FOR UPDATE USING (
  (data::jsonb->>'gotrueId') = auth.uid()::text OR public.polecat_is_admin()
) WITH CHECK (
  (data::jsonb->>'gotrueId') = auth.uid()::text OR public.polecat_is_admin()
);
-- INSERT/DELETE: admin-only — account provisioning is an admin action, and a
-- brand-new self-signup row can't satisfy an owner check on itself yet.
CREATE POLICY polecat_insert ON public.users FOR INSERT WITH CHECK (public.polecat_is_admin());
CREATE POLICY polecat_delete ON public.users FOR DELETE USING (public.polecat_is_admin());

NOTIFY pgrst, 'reload schema';
