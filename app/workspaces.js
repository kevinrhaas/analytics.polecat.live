/* workspaces.js — the PACKAGED workspace catalog (WORKSPACE-LOGIN, Kevin live,
   2026-07-30). Entries listed here appear in the sign-in screen's Workspace
   picker, so a provisioned teammate picks the workspace and signs in with
   their own account — no connection setup, no wizard. Kevin controls WHO can
   sign in via Admin (user provisioning); this file only says WHERE.

   Shape: { id, label, sourceId, cfg } — sourceId/cfg exactly as the backend
   wizard would store them (analytics.datasource.v1). For Supabase that's
   cfg: { url, key } with the PUBLISHABLE (anon) key.

   ⚠ This repo is public. Only ship a key here once the workspace's RLS is the
   authenticated-only posture (tools/supabase-rls-real.sql — anon must read
   NOTHING; verify with the M7 runbook's A4 queries all returning 0 for anon).
   Until then, distribute workspaces as ACCESS FILES instead (Settings →
   Workspace backend → Export access file), which the sign-in screen imports.

   A locally-imported entry with the SAME id overrides the shipped one — the
   escape hatch if a database ever moves before a re-publish.

   The Polecat workspace below ships per that rule: its RLS was tightened to
   authenticated-only and verified live 2026-07-30 (anon reads NOTHING on all
   six workspace tables — Kevin's six-zero verify). The publishable key is the
   role the database's policies are built to distrust; who can sign in is
   controlled in Admin (user provisioning), not by possession of this file.
*/
window.STUDIO_WORKSPACES = [
  {
    id: "polecat",
    label: "Polecat workspace",
    sourceId: "supabase",
    cfg: {
      url: "https://lnngiprrrcxtsawamqei.supabase.co",
      key: "sb_publishable_jQ3rgqN2swVo4WmLZp143A_2OrI8xc3"
    }
  }
];
