# COMPAT.md — the backend-compatibility contract (N18)

A workspace outlives the build that made it. The same Supabase/Turso/Firebase
database is opened by a phone running last month's cached app, a laptop on today's,
and a `/dev/` preview running next week's — at the same time, with no coordination
between them. Everything in this file exists so that mix can never lose data.

`docs/BACKLOG.md` is the operating manual for the backlog; this is the operating
manual for the **workspace schema**. If a schema change and this file disagree, this
file wins and fixing the change to match is the work.

The version lives in exactly one place: **`WS.SCHEMA_VERSION` in
`app/sources/schema.js`** (v4 today). It is stamped into `polecat_meta.schema_version`
by `WS.metaRows()`, reported by every adapter's `probe()`/`load()`, read on its own
(one row, no workspace load) by the adapters that implement `schemaVersion(cfg)`, and
compared in exactly one function, `WS.compareSchema()` → `newer` / `older` / `same` /
`unknown`.

## 1. The rules

**Every schema change is ADDITIVE.** There are exactly three additive moves:

- a **new table** in `WS.WORKSPACE_TABLES`;
- a **new promoted column** on an existing table (a queryable projection — the full
  row always survives in the `data` blob, which is why this is additive at all);
- a **new field inside `data`**, which needs no version bump at all: the blob is
  schemaless by design, and an older build round-trips fields it has never heard of.

And three moves that are forbidden, in every direction, forever:

- **never rename** a table, a column or a `data` field — an older build reads the old
  name, finds nothing, and writes emptiness back over it;
- **never repurpose** an existing name for a new meaning — same failure, silently, with
  plausible-looking values;
- **never change what a value means** (units, epoch, encoding, nullability). `updatedAt`
  is epoch-**milliseconds** and BIGINT because int4 overflowed it; that is the kind of
  decision that is made once and then honoured forever.

**Removal is not a move.** To retire something: stop writing it, keep reading it, and
record it in the history below as retired-at-vN. It stays in the DDL. A table nobody
writes costs nothing; a table an old build expects and cannot find costs a workspace.

### The four guarantees these rules buy

1. **The app reads workspaces back to v1.** A missing table is not an error — the local
   store fills it, the SQL adapters ensure-create it on save, and Supabase (which cannot
   DDL from the browser) takes `WS.provisionDeltaSQL()`, which is cumulative and
   idempotent from *any* older version.
2. **App N writes only what app N knows, but never destroys what it does not know**
   (N17). An older build's save preserves unknown tables, unknown promoted columns,
   unknown `data` fields, and rows that build has never seen. Deletes are **tombstone-
   driven only** on every adapter — absence is never deletion — and `users` is
   upsert-only, forever. The version marker is **monotonic**: `WS.metaRows()` keeps the
   higher of the version it found and its own, so an old tab cannot re-label an upgraded
   workspace as old.
3. **Backend NEWER than the app ⇒ read-only, never a write** (N16). Writes latch off at
   `flushPush`, the rail says Read-only and a banner names both versions. The latch is
   re-armed on wake: `Sync.recheckSchema()` runs on `visibilitychange`→visible and on
   `online`, reading the marker alone, and `flushPush` waits on a check in flight so a
   slept tab's own armed push cannot beat it.
4. **Backend OLDER than the app ⇒ an offer, never a latch** (N16 slice 2). The workspace
   stays fully writable and the Settings card offers *Upgrade workspace*:
   `Sync.upgradeWorkspace({backup})` — where `backup` is a required parameter, so there
   is no opt-out to forget — exports the pre-upgrade snapshot first, then applies the
   delta in the browser where the adapter can DDL and hands over paste-me SQL where it
   cannot. Since N22b slice 2 that is a property of the DATABASE, not the adapter:
   Supabase upgrades in place when the project carries the admin-gated
   `polecat_migrate()` function (installed by both setup paths), and falls back to the
   paste only when the function is absent or refuses. Both routes answer in the same
   `{ok}` / `{manual, sql}` shape, and the handshake is always re-read from the backend
   afterwards — a version is never assumed to have moved because a call returned ok.

`unknown` (no readable marker) is deliberately treated as `same`. A pre-marker or
partially-read backend is not evidence of newness, and latching a workspace off on a
missing row would be its own outage.

## 2. The bump checklist — mandatory, same PR

Bumping `WS.SCHEMA_VERSION` is a ritual, in the way the `sw.js` CACHE bump is a ritual:
it works precisely because it is mechanical and nobody gets to decide it does not apply
this time. **Any PR that changes that constant must, in the SAME PR:**

- [ ] **1. Prove the change is additive** against §1 — a new table, a new promoted
      column, or nothing. If you are renaming or repurposing, stop: that is not a bump,
      it is a data-loss bug with a version number on it.
- [ ] **2. Extend `WS.provisionDeltaSQL()`** so it upgrades a workspace at *any* older
      version, and keep it idempotent (`CREATE TABLE IF NOT EXISTS`) — it is run by
      humans, twice, by accident.
- [ ] **3. Update every hand-written SQL artifact** in the same breath, because they do
      not derive from `schema.js` and have drifted before (the N2-slice-2 class):
      `tools/supabase-deploy.sql` (the canonical fresh-environment file),
      `tools/supabase-rls-real.sql` (the posture subset — new table ⇒ new policy),
      `tools/supabase-bootstrap.sql`, and `supabase/functions/polecat-admin/sql.ts`.
- [ ] **4. Extend the tests** — the N16 handshake checks and the N17 round-trip checks in
      `tests/run.js` are written against the *constant*, never a literal, so they follow a
      bump automatically; what does not follow automatically is coverage of the NEW shape.
      Add the new table/column to the future-shaped mock workspace the N17 checks save
      into, so "an older app cannot clobber it" is measured rather than assumed.
- [ ] **5. Add the history line below**, naming the version, what it added, and the item
      it shipped under. `tools/doc-truth.mjs` fails the dev gate if you skip this — see §4.
- [ ] **6. Bump the `sw.js` CACHE name**, since `app/sources/schema.js` is precached.

## 3. The history

Reconstructed from `app/sources/schema.js`'s own comment block and the commits that
moved the constant. One row per version, newest last. **Never rewrite a row** — a
shipped version's meaning is fixed the moment a workspace carries it.

| Version | Added | Shipped |
|---|---|---|
| **v1** | The original shape: `polecat_meta` plus `connections`, `datasets`, `dashboards` — id + promoted columns + the full-row `data` blob. | 2026-07-13, the fleet adapter/workspace port |
| **v2** | `analyses` — a saved Explore analysis (a dataset plus one chart mapping). | 2026-07-16, Viridis V5 (#18) |
| **v3** | `jobs` — prep/rollup jobs that materialize their output as an ordinary workspace dataset. | 2026-07-16, Viridis V8 slice 1 (#21) |
| **v4** | `users` — the internal user store sign-in verifies against, mirrored from the local store so it rides the backend snapshot. The `data` blob carries the password hash: UX-level gating, not RLS. | 2026-07-21, M3.1 (#76) |

Retired: nothing yet. When something is retired, it gets a row here saying at which
version writing stopped — and it stays in the DDL.

**That gap is now closed (N20, 2026-08-08).** `tools/supabase-deploy.sql` used to create
the full v4 shape and never stamp `polecat_meta.schema_version`, so an environment stood
up from it reported `unknown` until the app's first save — benign, because `unknown` is
treated as `same`, but it left the canonical file as the one artifact that did not
declare what it built, in exactly the window a second client is likeliest to arrive in.
Its § 1b now stamps both markers with `ON CONFLICT … DO NOTHING`, so the file declares
what it built and an existing environment's own answer always wins: re-running an OLDER
copy of the script against an upgraded workspace can never rewind the marker. That is the
SQL half of the monotonicity N17 gave `WS.metaRows()`. All four artifacts now stamp, and
the doc-truth check in §4 holds every one of them to the current version.

**Still using `DO UPDATE`:** `tools/supabase-bootstrap.sql` and
`supabase/functions/polecat-admin/sql.ts` overwrite the marker with the version they
carry, so an OLDER copy of either *can* rewind it. Tracked as **N28** — it wants a
raise-only guard rather than a plain `DO NOTHING`, because those two are the provisioning
path that legitimately stamps an upgrade.

## 4. What enforces this

Process teeth, not memory — this file has to outlive whoever wrote it:

- **`tools/doc-truth.mjs` (check 25)** runs in the dev gate (`.github/workflows/ci.yml`)
  and fails if: the history above does not have a row for every version from 1 to
  `WS.SCHEMA_VERSION` with no gaps and nothing beyond it; any table in
  `WS.WORKSPACE_TABLES` is never named in the history; any hand-written SQL artifact
  stamps a version other than the constant; or `CLAUDE.md` stops pointing here. So a bump
  without a history line is a **red gate**, in under a second, before review.
- **`tests/run.js`** asserts the same wiring exists (the SP-0(b) precedent), so the gate
  cannot be quietly removed while no bump is exercising it.
- **`CLAUDE.md`** carries the pointer: touching `WS.SCHEMA_VERSION` or any workspace DDL
  means reading this file first.
