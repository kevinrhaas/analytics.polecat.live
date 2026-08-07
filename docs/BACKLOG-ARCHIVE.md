# Backlog archive — drained tracks lifted out of STATUS.md

> **What this is.** `STATUS.md` had grown past 15,700 lines, with NEXT alone running ~6,300
> across 32 subsections — so "what is actually left?" could no longer be answered by reading
> or grepping it, because DONE cross-references matched nearly every open item. NEXT item
> **N1** (2026-08-07) called for the split. This file is the destination.
>
> **Nothing here was deleted — it MOVED.** Every track below is the verbatim text that used to
> sit in `STATUS.md` → NEXT, under its original heading, so old links and greps still land on
> it. Each one is DRAINED: its items shipped, or it was explicitly superseded by the ▶ NOW
> queue at the top of NEXT. Where a drained track left a genuinely-live tail behind, that tail
> stayed in `STATUS.md` — the pointer stub that replaced the track names it — so this archive
> is history and context, never the working queue.
>
> **Where the queue lives:** `STATUS.md` → NEXT → the ▶ NOW block. That is the only queue.
> Read this file for reasoning, prior art and citations; do not pick work out of it.

## Contents

- [AUDIT-2026-08 — comprehensive audit findings (FULLY DRAINED)](#audit-2026-08)
- [SESSION HANDOFF (2026-07-31) — EXPIRED](#session-handoff-2026-07-31)
- [LOCKED BUILD ORDER (Kevin approved, 2026-07-27)](#locked-build-order-2026-07-27)
- [CONSERVATION INSIGHT — M1 · M2 · M2b · M2c (2026-07-21)](#conservation-insight-m1-m2)
- [VIRIDIS VIEW / GEO-ANALYTICS TRACK (2026-07-16)](#viridis-view-geo-analytics-track)
- [POST-OVERHAUL BACKLOG (2026-07-13)](#post-overhaul-backlog)
- [MOBILE TRACK (2026-07-02)](#mobile-track)

---

<a id="audit-2026-08"></a>

## AUDIT-2026-08 — comprehensive audit findings (FULLY DRAINED)

> Lifted from NEXT 2026-08-07 (N1). AUD-01…AUD-12 all shipped 2026-08-06→07. The live tails this block left behind are listed in the STATUS.md pointer, not here.

### ✅ AUDIT-2026-08 — comprehensive audit findings — **FULLY DRAINED (2026-08-07)**
> **AUD-01 through AUD-12 are ALL shipped** (see DONE; the last six landed overnight
> 2026-08-06→07). Nothing here is open — kept for the reasoning and the audit citations.
> Archive candidate under N1.
> A four-sweep audit (2026-08-06, v833) filed these as coherent workstreams,
> not micro-items — the QA-01…QA-10 precedent. `★★` = P1. Each cites its audit
> section. Any Kevin follow-up spawned here ships under the fleet KH-### series
> (see Conventions + `kevinrhaas/polecat-platform` docs/KH-REGISTER.md).
> Interleave with the feature backlog; the four P1s first when a slot is free.
> AUD-04 (now SHIPPED v834) was ALSO the precondition for analytics joining the dev→stage→prod
> promotion pipeline (rollout #2 after the jobtracker pilot).
>
> - ~~AUD-01 ★★ [data] Supabase atomic save~~ ✓ **SHIPPED v842, sw v474
>   (2026-08-07, steward — see DONE). ALL FOUR AUDIT P1s ARE NOW CLOSED.**
>   The batched-RPC option: `polecat_workspace_save(jsonb)`, one PL/pgSQL
>   transaction carrying the whole snapshot, tried first and falling back to
>   the per-table push ONLY on a 404. The mid-save-failure-window check the
>   suite lacked is in. The failed-read half was already closed by AUD-04
>   (v834). **Still open, deliberately deferred to its own slice: cross-device
>   CONFLICT RESOLUTION** — two devices editing concurrently is still
>   last-writer-wins over the whole snapshot. That's a merge-semantics design
>   question (per-row updatedAt wins? per-table? a real 3-way merge?), not a
>   durability hole, and it wants its own decision before code.
> - ~~AUD-02 ★★ [security] Escape the confirmed XSS sinks~~ ✓ **SHIPPED v837, sw v469
>   (2026-08-07, steward — see DONE).**
> - ~~AUD-03 ★★ [security] Secrets hygiene~~ ✓ **SHIPPED v838, sw v470
>   (2026-08-07, steward — see DONE).** All three parts: session-only vault
>   passphrase (with a delete-on-boot migration of the on-disk copy), PBKDF2
>   password digests with upgrade-on-sign-in, honest Settings/Connections/docs
>   copy. NOT covered (deliberate, stated in the copy rather than fixed): the
>   backend key/token and Supabase authEmail/authPassword still sit in
>   localStorage, and auth still fails open by design.
>   Original: (§1.3) stop persisting the
>   secrets-vault passphrase (`analytics.datasource.secret.v1`) — make it
>   session-only; migrate password hashing off unsalted single-round SHA-256
>   (`app/auth.js:30-33`) to a salted/iterated KDF; make the Settings/credential
>   copy honest about what's plaintext-local vs synced.
> - ~~AUD-04 ★★ [data] Data-loss cluster~~ ✓ **SHIPPED v834, sw v466
>   (2026-08-06, dedicated session — see DONE). The pipeline precondition is
>   MET: analytics is clear to adopt the dev→stage→prod pipeline (rollout #2).**
>   Original: (§1.2) `replaceAll()` must PRESERVE tables it doesn't know about
>   (`app/sources/workspace.js:124-151` currently drops them — a v5→v4→push
>   loses the v5 table); `persist()` must surface quota failure instead of
>   silently going memory-only (`workspace.js:28-29`); a failed table read must
>   be distinguishable from a genuinely empty one before `replaceAll` adopts it.
> - ~~AUD-05 ★ [security] Harden the preview channel~~ ✓ **SHIPPED v845, sw v477
>   (2026-08-07, steward — see DONE).** The origin/source checks are in, on all
>   THREE receivers (builder, renderer-inside-every-export, Help). The other two
>   halves were investigated and **deliberately not shipped, with the evidence in
>   DONE**: `sandbox` on the preview iframe is infeasible while builder↔preview
>   runs on same-origin DOM reach-in (`allow-same-origin` would make the attribute
>   decorative), and a `<meta>` CSP is unreachable in a no-build-step app whose
>   exports are inline script inside srcdoc. **Spun out as their own items:**
>   - **AUD-05a [arch] Move builder↔preview fully onto postMessage** — retire
>     `#preview.contentDocument` reach-in (the builder's reads, panel-zoom's
>     `#pz-fill` style + Escape listener injection, the Viewer frame reads) so the
>     frame can take a real `sandbox`. Large, architectural; wants its own design
>     pass and the FULL suite (it touches the export invariant).
>   - **AUD-05b [security] Revisit CSP if the app ever gains a build step** —
>     blocked on that, not on effort.
>   Original: (§1.1) validate `e.origin`/`e.source` in both postMessage receivers
>   (`app/studio.js:10179`, `app/studio-render.js:2493` — today only
>   `d.studio===1`), and add a `sandbox` attribute to the srcdoc preview iframe
>   (carefully — must not break the builder↔preview protocol or exports). Add a
>   CSP `<meta>` where feasible.
> - **AUD-06 ★ [ux] Filter consolidation program** (§2.1): 19 mechanisms, minimal
>   shared code. Multi-slice. **Slice 1 — the shared SEARCH matcher — SHIPPED
>   v847, sw v479 (2026-08-07, steward — see DONE):** `Studio.catalogSearch` now
>   owns the matching rules for all six catalog panels (AND-ed terms across every
>   field, quoted phrases, one haystack convention), Dashboards' haystack gained
>   `folder`, and the "Clear" chip counts the search box as a filter and finally
>   exists on Jobs. **Slice 2 — the FACET layer — SHIPPED v848, sw v480
>   (2026-08-07, steward — see DONE):** `Studio.catalogFacets` (tally / prune /
>   pick / pills / folderStrip / matchMulti / matchOne / clearChip) replaced the
>   six hand-built count-map + pill-markup blocks; pills now sort by their
>   visible label (natural, case-insensitive), every folder strip is labelled
>   "Folders", and Dashboards gained the Clear chip.
>   ~~The default view mode still differs~~ ✓ **SHIPPED v849, sw v481 (2026-08-07,
>   steward — see DONE):** `Studio.catalogView` is the fourth shared axis (the toggle
>   itself, not just its default) — one default for all six panels (**`list`**), the
>   grid/list icon on every panel instead of only Dashboards, and one meaning for
>   `aria-pressed` (pressed = showing tiles). Historical storage keys unchanged.
>   **Slice 3 — the OPERATOR vocabulary — SHIPPED v850, sw v482 (2026-08-07,
>   steward — see DONE):** `Studio.filterOps` is the single registry (one op
>   list, one label set, ONE predicate) behind both the DA output rules and the
>   job "Filter rows" step. **No workspace migration was needed and none was
>   done** — each surface keeps WRITING its own on-disk spelling (`>=` vs
>   `gte`) and `normalize()` maps either onto one meaning at read time, so an
>   older client sharing the workspace (or a `/dev/`-`/stage/` preview on the
>   same origin — AUD-04) still reads every saved rule correctly. The job step
>   gained `startsWith`, real labels instead of raw ids, numeric-aware equality
>   and text-capable ordering.
>   **Slice 4 — DATES COMPARE AS DATES — SHIPPED v853, sw v485 (2026-08-07,
>   steward — see DONE):** slice 3's concrete sub-finding is closed.
>   `filterOps.dateKey`/`dateCmp` give both surfaces (and the DA sort rule, which
>   had the same flaw) real chronological comparison — strictly for ISO-8601
>   shapes, day-granularity when either side is a plain date, UTC for a zoneless
>   value. The job engine's standby copy of the predicate was deleted rather than
>   taught the new trick. This one DID re-filter saved dashboards, deliberately
>   and loudly in the changelog: the rows an author asked for are the rows they
>   now get.
>   **Slice 5 — a REAL date FILTER — SHIPPED v855, sw v487 (2026-08-07, steward
>   — see DONE):** the remaining half is closed. A new `inRange` operator
>   ("in date range (relative)") whose value is one of 15 range tokens
>   (`filterOps.RANGES` / `rangeBounds`) makes "the last 30 days" a saved RULE
>   that still means the last 30 days tomorrow, and `filterOps.valueKind` gives
>   a date column a native date picker on both surfaces. Anchored to the
>   reader's local calendar day, weeks start Monday. No workspace migration and
>   none needed: a new operator id is invisible to older clients, which pass the
>   rows through unfiltered rather than misreading the rule (the AUD-04
>   constraint, honoured by the slice-3 unknown-operator contract).
>   **Slice 6 — THE OTHER SEARCH BOXES — SHIPPED v858, sw v490 (2026-08-07,
>   steward — see DONE):** §2.1's "11 other search affordances" adopted
>   `Studio.catalogSearch`; thirteen boxes in `studio.js`/`palette.js`/
>   `explore.js`/`build.js`/`connections.js` came off the literal-substring
>   idiom, the kit gained `textMatcher` (string rows) and `markRe` (the
>   highlighting surface), and ⌘K kept its own ranking on top of the shared
>   inclusion test.
>   **Still open, in rough order:**
>   - **The Help page's own search (`docs/index.html`).** The one affordance
>     slice 6 deliberately left alone, with the evidence in DONE: the page is
>     standalone (inline scripts, no app modules) and its search is
>     title-ranked-before-body with a snippet window, so adopting the kit means
>     either loading `app/studio.js` into Help or copying the rules — the
>     duplication this program removes. It wants a decision first: extract the
>     kit into a tiny standalone file both can load, or leave Help's search as
>     its own thing and say so in the docs (slice 6 says so).
> - ~~AUD-07 ★ [ux] Finish delete-undo coverage~~ ✓ **SHIPPED v846, sw v478
>   (2026-08-07, steward — see DONE).** All three paths carry Undo, each
>   restoring what it uniquely owns beyond the row (the View Builder draft +
>   selection, Explore's open-View pointer, the pack's installed flag).
>   **Still open from §2.2, deliberately its own item — the OTHER half of
>   "unify delete confirmation":** the ~23 delete sites still each hand-roll a
>   `window.confirm` string, so the wording, the consequence sentence and the
>   lineage warning are per-site rather than one shared confirm helper. That is
>   a copy/consistency refactor across every section, not a durability gap, and
>   it also wants a decision on whether the fleet's `confirmDialog` replaces
>   native `confirm()` here (it did in manager/relay). The DURABLE-2 trash model
>   is the other natural home for it.
>   Original: (§2.2): the 3 bare-confirm
>   deletes with no undo — `app/build.js:389`, `app/explore.js:938`,
>   `app/studio.js:890` — get `Studio.undoToast` like the DURABLE-2b per-row
>   deletes; folds into the DURABLE-2 trash model.
> - **AUD-08 [perf] Boot + preview cost** (§1.4): ~~get `js/changelog.js` (~660KB)
>   off the render-blocking boot + precache path~~ ✓ **SLICE 1 SHIPPED v851, sw v483
>   (2026-08-07, steward — see DONE):** boot loads a generated ~650-byte
>   `js/changelog-head.js`; `Studio.loadChangelog()` fetches the history on demand
>   (prefetched on hover/focus of either What's-new trigger); the big file is no longer
>   precached. **SLICE 2 SHIPPED v857, sw v489 (2026-08-07, steward — see DONE):**
>   the sw.js comment block is gone — 2,454 lines of per-bump release notes archived
>   verbatim to `docs/sw-history.md`, taking the service worker from 194,734 to 6,773
>   bytes (the worker code below `SHELL_FILES` is byte-identical), and the per-bump
>   note ritual is retired in favour of the changelog + the commit diff. A boot-path
>   byte budget in `tools/validate.mjs` (sw.js 16KB, changelog-head 4KB) makes the
>   creep loud next time. **Still open:** the substantial half —
>   make `refreshPreview()` incremental instead of a full ~570KB–4.4MB srcdoc
>   re-parse from 208 call sites on a 130ms debounce. Also untouched and named in
>   §1.4: the 52 render-blocking `<script src>` tags in `app/index.html` and the ~20
>   boot-time asset fetches into `S.assets` — the next-largest boot win after the
>   preview work.
> - ~~AUD-09 [code] Dead code~~ ✓ **SHIPPED v852, sw v484 (2026-08-07, steward —
>   see DONE).** Both halves: `app/gate-config.js` (+ `tools/gen-code.js` + the
>   stale suite check that pinned it) deleted with its index.html/viewer.html/sw.js
>   references; `DashKit.TIME_RANGE`/`fromkey` **deleted** rather than implemented —
>   the implement side IS AUD-06's real date filter, and the dead picker made the
>   gap look half-answered. PUBLISH.md + README.md now describe the sign-in gate
>   instead of the retired passcode.
>   Original: (§1.5): delete `app/gate-config.js` (ships +
>   precached, contains two live access-code hashes, ZERO readers) and its
>   index.html/viewer.html/sw.js references; implement-or-delete
>   `DashKit.TIME_RANGE` (zero app callers — deleting it makes the "no date
>   filter" gap explicit for AUD-06).
> - **AUD-10 [code] Test-harness hardening** (§1.6): per-section `try` isolation
>   so one throw can't FATAL-abort the run; cut the ~3m23s of unconditional
>   `waitForTimeout`; close the coverage gaps (Firebase adapter, sync-conflict,
>   Supabase mid-save, escaping, postMessage origin).
> - ~~AUD-11 [docs] Copy/doc truth pass~~ ✓ **SHIPPED v856, sw v488 (2026-08-07,
>   steward — see DONE).** Every countable claim now matches its source: ONE
>   chart-type number (**54**, from `Studio.CHARTS` — the audit's "real 55"
>   counted Help's KPI-tile card, which is a panel kind, not a chart type),
>   Simple mode 15, GPL-3.0 license copy, ~56K LOC / ~3,000 checks measured
>   rather than guessed, the mobile gate resolved to 390×780 in BOTH the doc and
>   `tools/dev-smoke.mjs`, and a "What's next" modal that no longer advertises
>   five shipped items as upcoming. Pinned by **`tools/doc-truth.mjs` in the dev
>   gate** so a drifted number fails the build instead of ageing quietly.
>   ~~Tail: a stale suite assertion still pinned the retired "52 types" count, so the
>   STAGE gate was red on dev (issue #607)~~ ✓ **SHIPPED 2026-08-07 (steward — see
>   DONE); test-only, no version bump.** F38/J keeps its `ct-quadrant` anchor check and
>   drops the hand-typed count, which `tools/doc-truth.mjs` already pins from the
>   registry; swept the rest of the suite and this was the only one.
>   **Still open (AUD-11's tail, deliberately deferred — each its own unit):**
>   splitting STATUS.md's DONE into a dated archive (§4), and §2.4's third
>   bullet, the "Studio" vs "Dashboard Builder" / "demo" vs "sample" wording
>   sweep across toasts and empty states (a copy refactor, not a countable
>   claim — the guard cannot hold that one honest).
> - ~~AUD-12 [ux] Discoverability coverage~~ ✓ **SHIPPED v854, sw v486 (2026-08-07,
>   steward — see DONE).** Both halves, and both from ONE new primitive
>   (`__studioRailSections()` in `app/shell.js`) rather than two corrected copies:
>   ⌘K now offers every rail section — and **only** the ones the signed-in account
>   may open, which also closed the gating hole where clicking a hidden rail button
>   still switched section; Section access derives its rows the same way, gaining
>   views/build/docs, correcting "Explore"→Quick Views, and dropping the no-op
>   Studio row. Carve-outs (documented, deliberate): Home and Settings.
>   Original: (§2.3): ⌘K (`app/palette.js`) reaches
>   only 7 of 13 sections — add Views/Quick Views/View Builder/Repository/Jobs/
>   Admin; `CONFIGURABLE_SECTIONS` (`app/studio.js:8740`) must cover
>   views/build/docs so viewer-hiding matches what the rights UI implies.

> SORT-1. ✓ **SHIPPED v812 (2026-07-31, interactive session — see DONE). Lane: skip.**
>       Original: **Standard sorting on every catalog panel (Kevin live, 2026-07-31).** "On all of the panels
>       like dashboards, datasets, connections, etc you should be able to sort by
>       name, last used date, workbook, things like that. Standard sorting things
>       so you can find things easier." Add a compact sort control (dropdown or
>       toggle-chips beside the list/tile toggle) to Dashboards, Views, Datasets,
>       Connections, Jobs and Repository: Name A–Z/Z–A, Last updated (newest/
>       oldest — the current default order stays the default), plus per-section
>       extras where they exist (Dashboards: workbook, folder; Datasets:
>       adapter/connection; Jobs: last run). Persist the choice per section per
>       device (localStorage, same convention as the list/tile toggles). Pinned
>       items should stay pinned-first within any sort. One shared sort helper +
>       per-section wiring, same adopt-per-section pattern LIVE-d proved.

---

<a id="session-handoff-2026-07-31"></a>

## SESSION HANDOFF (2026-07-31) — EXPIRED

> Lifted from NEXT 2026-08-07 (N1). Expired, historical only — that session ended long ago, every claim in it shipped, and its coordination rules do NOT apply to current runs. Nothing here is claimed.

### ✅ SESSION HANDOFF (2026-07-31) — **EXPIRED, historical only**
> That session ended long ago and every claim below shipped. The coordination rules do
> NOT apply to current runs; nothing here is claimed. Archive candidate under N1.
> Kevin is enabling the continuous manager lane while an interactive steward
> session is still working. Coordination rules for ANY automated run:
>
> **CLAIMED by the live session — do NOT start these** unless the claim expires
> (no commit referencing the item lands on main within ~6 hours of the
> timestamp above; then take over using the context given):
> 0. ~~USER-ADD-DURABLE ★ + SYNC-FRESH ★★~~ **SHIPPED v792 (this session,
>    2026-07-31 ~05:00Z — see DONE).** Kevin-side verify: re-add test2 via
>    Admin → +Add user (watch for the "synced to the workspace backend" toast),
>    sign out/in, confirm the row persists in Supabase public.users.
> 1. ~~FILTERS-1 ★~~ **SHIPPED v794 (this session, 2026-07-31 ~05:15Z — see
>    DONE).** Root cause was three-fold (undeclared params on 6/8 panels +
>    sinceYear/year name mismatch + real engines ignoring params), not just
>    the file-engine path. Recurring no-decorative-filters sweep now in the
>    suite. Kevin-side verify: open Cover Crop & Tillage Adoption, flip
>    Since year (trends narrow) and Practice (maps/KPIs respond).
> 2. ~~VB-13~~ **SHIPPED v795 (this session, 2026-07-31 ~05:40Z — see DONE).**
>    Note for SETTINGS-ROAM slice 2: lift studio-bd-lw / studio-bd-collapse
>    into the roamed per-user prefs blob with the other VB sizes.
> 3. ~~SETTINGS-ROAM slice 2~~ **SHIPPED v798 (this session, 2026-07-31
>    ~06:40Z — see DONE).** #164 closes. Not covered (small follow-ups if
>    wanted): shell rail open/width keys (shell-owned storage), per-user
>    dashboard defaults (Defaults module has its own store), VB draft-map
>    roaming (growth risk — deliberate skip).
> 4. ~~DURABLE-2 ★~~ **SHIPPED v799 (this session, 2026-07-31 ~06:50Z — see
>    DONE). ALL session claims (0–6) are now shipped** — the automated lane
>    may treat the whole NEXT backlog as open (the DO-NOT-TOUCH list below
>    still stands, now including the tombstone semantics: absence is never
>    deletion, users has no sync deletes).
> 5. ~~VB-14~~ **SHIPPED v796 (this session, 2026-07-31 ~05:55Z — see DONE).**
> 6. ~~VB-DROP~~ **SHIPPED v797 (this session, 2026-07-31 ~06:25Z — see DONE).**
>    Excel (.xlsx) deferred — needs a vendored parser; a future slice if
>    Kevin still wants it.
>
> **LANE STEER (Kevin, 2026-07-31 ~12:15Z — while the interactive session is
> ACTIVE on the feature backlog):** to keep both lanes fast, scheduled runs
> should prefer the SELF-DIRECTED tracks over feature-backlog items while
> this steer stands: Track H/L/N quality sweeps and LF58 docs/tour/marketing
> currency. Those touch few contested files; the feature backlog is being
> worked live and every same-day collision on js/changelog.js + sw.js costs
> a rebase + a full re-gate (three today: v793, v804, v808). The interactive
> session claims its items in DONE ("lane: skip …") as always. When the
> interactive session goes quiet (no main commit from it for ~6 hours), this
> steer expires and the whole NEXT backlog is open again.
>
> **OPEN FOR THE AUTOMATED LANE (independent, minimal overlap with the above):**
> ~~LF21 (title header as first-class widget)~~ **SHIPPED v793 (automated lane,
> 2026-07-31 ~05:10Z — see DONE):** the remaining alignment ask, done.
> ~~LF40 (animated welcome/tour overhaul)~~ **SHIPPED v800 (automated lane,
> 2026-07-31 ~06:51Z — see DONE):** its last open item (the overview tour's own
> pack-aware treatment) is done — LF40 as a whole is now fully shipped.
> ~~marketing-site refresh~~ **SHIPPED v801 (automated lane, 2026-07-31
> ~07:35Z — see DONE):** the carousel screenshots + chart gallery were stale
> against the current app (pre-rename "Explore"/"analysis" UI baked into the
> PNGs, a missing chart type). Confirmed LF24, LF59 and LF53's user-facing
> scope read as already fully shipped elsewhere in this file (their own DONE
> entries) — LF53's remaining piece is a deliberately-deferred internal-only
> identifier rename (`Studio.exportCDF` etc.), not user-facing, so not picked
> up here. Still open: #23 (tour defines every domain term — a real gap, not
> yet built). One coherent item per run,
> `steward/<topic>` branch off latest main, rebase if the live session shipped
> meanwhile. The live session works on
> `claude/lucid-keller-nff4pb`.
>
> **DO NOT touch:** tools/supabase-*.sql posture files, app/workspaces.js
> packaged keys, and the users-table sync semantics (upsert-only, v787) — these
> encode tonight's live-incident fixes.
>
> **Kevin-side pending (not agent work):** re-add fntest via Admin → +Add user
> (safe since v787) → incognito sign-in → M7 steps 3-4 close out; two CTIC
> admins after that.
>
> Shipped tonight (context): v778–v791 — WORKSPACE-LOGIN, RLS posture + canonical
> deploy script, ACTIVITY-1, GATE-FIX/2, DEMO/ADMIN-LOCAL, USERS-DURABLE 1+2
> (users wipe class eliminated), SETTINGS-ROAM slice 1, EXPORT-1, XP-UPDATE,
> VB-12, PANEL-H, PACK-FEATURED, HOME-LAND, HOTLINK-1, DECLUTTER-1.

---

<a id="locked-build-order-2026-07-27"></a>

## LOCKED BUILD ORDER (Kevin approved, 2026-07-27)

> Lifted from NEXT 2026-08-07 (N1). Superseded by the ▶ NOW queue; steps 1–5 are all done and the block's own closing line says the queue has no more open items. Its one deferred slice (LF43 slice 2) stays live in the LIVE-FEEDBACK QUEUE in STATUS.md.

### ★★ LOCKED BUILD ORDER (Kevin approved, 2026-07-27) — work the queue in THIS sequence

> ⚠ **Priority header SUPERSEDED by the ▶ NOW queue at the top of NEXT (2026-08-07).**
> Kevin locked the sequence. Do these in order (each still sliced; quick bug-class items first so the
> "Dave" demo's ingredients become real before the flashy tour and the chrome work):
> 1. **Fast bug/cleanup wins:** LF44 ✓ (role gating — hide Admin+Studio from viewers) · LF43 (sample-pack
>    dashboards show in Dashboards ✓ slice 1 / drop Examples — slice 2 still open, budgeted as its own
>    dedicated slice) · LF50 (remove stray builder Creativity control, shipped) ·
>    LF38 ✓ (password eyeball toggle) · LF39 ✓ (cross-device sign-in fix, 2026-07-27). Step 1 is
>    otherwise fully done — only LF43 slice 2 remains, deliberately deferred.
> 2. **"Dave"-demo ingredients:** LF41 (per-user provisioning defaults — theme + sample pack ✓ slice 1,
>    "copy my current Dashboard defaults" ✓ slice 2, both 2026-07-27 — **LF41 is now fully done**,
>    the optional impersonate-to-set alternative left open per LF41's own DONE note) → LF42
>    (multi-backend admin — admin manages a backend list ✓ slice 1, per-user backend assignment
>    ✓ slice 2, consolidated Switch-backend picker ✓ slice 3, all 2026-07-27 — **LF42 is now fully
>    done**). **Step 2 is now fully done.**
> 3. **Flashy:** LF40 (animated welcome + home tour, sample-pack-aware) — **slice 1 ✓ (hero
>    screen: confetti + greet-by-name + quick tour/guided tour menu + quick actions, 2026-07-27,
>    steward)**, **slice 2 ✓ (Conservation-pack choropleth/watershed guided tour, pack-gated,
>    2026-07-28, steward)**, see DONE. Still open: folding sample-pack-aware segments into the
>    hero/overview carousel itself (a bigger engine change — see slice 2's own NEXT note).
> 4. **Studio chrome:** LF46 (⋯ teardown — ✓ slice 1 Demo mode 2026-07-24, ✓ slice 2 View/
>    Help & power tools groups 2026-07-28, **LF46 is now fully done**) · LF47 (ops → top rail,
>    w/ #30 — ✓ slices A/B/C, 2026-07-27, **LF47 is now fully done** except Examples removal,
>    which is LF43 slice 2's remit, not duplicated here) · LF48 (✓ slice 1 uniform exit,
>    2026-07-28, ✓ slice 2 the role-aware mode-switcher ENTRY point, 2026-07-28 — **LF48 is now
>    fully done**) · LF45 (✓ richer Open dialog, 2026-07-28 — Save-as's own half already shipped
>    with LF47) · LF52 (✓ widget→View, 2026-07-28) · LF53 (✓ drop CDF/CDE, 2026-07-28). **Step 4 is
>    now fully done** except LF43 slice 2 (Examples removal), which stays its own explicitly
>    deferred, separately-budgeted slice (see Step 1).
> 5. **Exports + navigation/layout:** LF49 (XLSX ✓ · DOCX ✓ · PPTX ✓, 2026-07-28 — **LF49 is now
>    fully done**) · LF54 (both slices ✓ — 2026-07-28/29, left-align + kill left-gutter whitespace,
>    then the per-catalog vertical-gap density pass — **LF54 is now fully done**; any further
>    per-widget density is opportunistic polish, not a named slice) · LF51 (sophisticated nav IA —
>    ✓ (a) full row names, ✓ (b) right-aligned pills, ✓ (c) date-time, ✓ (d) list/tile toggle now
>    shipped on Dashboards/Datasets/Connections/Jobs/Repository (2026-07-28/29, see DONE) — **all
>    four SPECIFICS are done.** Still open (not step-5-blocking, opportunistic): the Explore dataset
>    navigator's own folder-tree upgrade, and the bigger CORE PRINCIPLE convergence (one truly
>    shared nav component + Repository's "robust cross-object command center" richness)). **Step 5
>    is now fully done** for its named SPECIFICS; the LOCKED BUILD ORDER queue has no more open
>    items — remaining work interleaves as ordinary backlog (LIVE-QA QUEUE, quality tracks).
> The recurring quality tracks (UX polish, Track H/L/N sweeps) continue to interleave as usual.

---

<a id="conservation-insight-m1-m2"></a>

## CONSERVATION INSIGHT — M1 · M2 · M2b · M2c (2026-07-21)

> Lifted from NEXT 2026-08-07 (N1) — the drained early slices ONLY. The rest of the Conservation Insight track stays in STATUS.md: M4.2, M5, M6 and M7 are still open (M7 is NOW item N2).

> M1. ✓ **Quick wins (shipped 2026-07-21):** demo pack renamed Viridis→Conservation Insight
>     (app/demopacks.js, ids + all display strings; coupled tests updated); geo sample data now
>     spans 100+ REAL Corn Belt county FIPS + real HUC8/CRD/state codes (extracted from the
>     vendored geometry so every code colors) with geo-aware row counts, so a dragged choropleth
>     colors the whole Corn Belt (144 counties end-to-end, was 8); bundled examples get a
>     first-class Home section with live thumbnails (exLayoutSvg hoisted to module scope).
> M2. ✓ **Overview tour (shipped 2026-07-21):** an Overview tour as
>     the FIRST/recommended tour that walks the rail parts (Home · Explore · Dashboards · Datasets ·
>     Connections · Jobs · Studio), explains the object model, and ENDS ON HOME for getting-started
>     (Kevin). Keep Quick analysis + Build a dashboard as the deeper task tours in the chooser.
>     Introduces "widget" as the forward term for the thing inside a dashboard.
> M2b. ✓ **panel → widget terminology (shipped 2026-07-21):** rename the USER-FACING word "panel"→"widget" (Inspector
>     title, add/text-widget buttons, hints, empty states, tours, docs, help) for the thing inside
>     a dashboard that shows a chart/KPI/map/text. CAREFUL: leave the layout PANES (Data/Inspector
>     library) alone — those are "panes", not widgets — and keep internal identifiers (spec.panels,
>     data-panel-id, kind:"panel", newPanel, .panel-* CSS) unchanged; UI text only. Update the tour
>     ratchet to also assert no stale "panel" wording for dashboard items.
> M2c. ✓ **Richer demo workspace (shipped 2026-07-21):** the Conservation Insight demo pack now
>     seeds a whole workspace — TWO connections (a demo file store + an illustrative Supabase repo
>     backend), FOUR datasets (raw provider export + a real county-FIPS adoption set + a HUC8
>     watershed set + a state-rollup output, all in-geometry so their choropleths color live), and a
>     county→state acreage-weighted-mean JOB (the jobs-engine wmean pattern, wired source→output and
>     pre-materialized so the state map renders before Run) — alongside the four pinned analyses +
>     featured dashboard. sampledata exposes Studio.SAMPLE_GEO for reuse. Same install/remove-by-
>     demoPackId machinery (remove now also sweeps jobs); 4 M2c ratchet tests. NEXT in M3: wire the
>     demo-login to auto-install this set, a Settings toggle to turn it off, and suppression once you
>     log in with REAL creds against a real backend repo (real workspace = no demo clutter).

---

<a id="viridis-view-geo-analytics-track"></a>

## VIRIDIS VIEW / GEO-ANALYTICS TRACK (2026-07-16)

> Lifted from NEXT 2026-08-07 (N1). V1→V9 all shipped; the track's own closing line calls it DONE (V9 feature-complete 2026-07-17). The four questions parked for Kevin at its foot are the only non-shipped thing in it.

### ★★★★ VIRIDIS VIEW / GEO-ANALYTICS TRACK (2026-07-16, user-directed — TOP priority)

> ⚠ **Priority header SUPERSEDED by the ▶ NOW queue at the top of NEXT (2026-08-07).**
> **The case:** CTIC's Viridis View RFP (bid due 7/31, $35–45K, launch Nov 18–19 at SAS) — a public
> tool showing county-level cover-crop + conservation-tillage adoption (2015–2025, annual updates
> to 2030) from FIVE providers (DTN, Indigo/Terion, Iowa State, Regrow, Terra Diagnostics), maps
> colored by the MEDIAN of user-selected providers, linked time-series charts with AgCensus
> reference points, at county/State/CRD/HUC8 scales, Corn Belt focus, embedded free on ctic.org.
> KEY FRAMING (per the office-hours prep): this is an ENSEMBLE — the median is the estimate, the
> provider spread is uncertainty information to show honestly, not noise to hide. Provenance,
> no-data handling and simplicity beat slick visuals for this audience. Static/client-side is the
> winning architecture (data is single-digit MB gzipped; geometry is the heavy asset).
> **Charter (user, 2026-07-16):** extend Analytics to support this case — non-expert-easy (Simple
> mode hides machinery; Home features live dashboards; pins/favorites/recents), a simpler
> dataset-first "Explore" designer feeding Studio, BOTH MapLibre GL JS and D3+TopoJSON attempted
> behind one geo API, multi-connection + file-type import with mapping, a Viridis demo/sample
> pack (a SECOND sample library, distinct from the legacy sample catalog), light data-management (jobs:
> mapping/aggregation/rollup/join/union → materialized datasets, repeatable loads), and a public
> marketing site at the root with the app at /app/ (fleet pattern).
>
> **The slices (one steward PR each, tests green, in order):**
> V1. ✓ **Marketing site + app moves to /app/ (shipped 2026-07-16).** Root = marketing page
>     (index.html + css/landing.css, warm-Polecat light/dark, hero + features + sources strip,
>     CTAs → /app/, NO shell per fleet convention). The app index moved INTO app/ with
>     `<base href="/">` so every historical relative path resolves unchanged (module imports
>     resolve against module URLs and were never affected). Legacy root #share=/#view hashes
>     forward to /app/ automatically; manifest start_url → /app/; SW precaches both pages
>     (cache → v11); test server learned directory-index resolution; docs back-link fixed;
>     THIRD-PARTY-NOTICES.md seeded (footer-linked) for the geo libraries to come.
> V2. ✓ **Geo foundation (shipped 2026-07-16) — lighter than planned:** us-atlas ships
>     PRE-PROJECTED AlbersUsa TopoJSON, so the ONLY runtime lib is topojson-client (~7KB, ISC);
>     d3-geo/d3-array are BUILD-TIME only (tools/build-geo.mjs, reproducible, commits outputs).
>     vendor/geo/: counties+states (us-atlas, ISC), county→CRD mapping (NASS, PD; CRD polygons
>     derived at runtime via topojson.merge), HUC8 Corn Belt (571 subbasins, USGS WBD via the
>     National Map REST w/ server-side generalization, reprojected onto the same 975×610 plane,
>     173KB gz). ALL FOUR SCALES SHIPPED (county/state/CRD/HUC8 — Kevin: CRD+HUC8 needed for the
>     demo). `choropleth` chart type: median-default duplicate aggregation, auto-zoom to data,
>     hatched no-data + legend, state-border overlay, hover tooltips, id normalization (4/5-digit
>     FIPS, postal/name/FIPS states, 7/8-digit HUCs), theme-aware computed ramp (license-free).
>     Exports inline topojson-client (ISC banner intact) + only the geometry the spec needs —
>     mapless dashboards carry zero geometry; CLI export (tools/lib.js) has parity. Sample engine
>     emits real Corn Belt FIPS for fips-ish columns so fresh map panels render colored. SW → v12.
>     Licensing: THIRD-PARTY-NOTICES.md updated (suite-asserted). Marketing site: one modest
>     clause added per Kevin ("also" feature, not a takeover).
>     ✚ RENAMED (Kevin, 2026-07-16, shipped same day): the product name is just **"Analytics"**
>     — "Dashboard Studio" dropped from the public site, app chrome (topbar/rail/gate/welcome/
>     status bar), site.webmanifest, docs, exported-dashboard titles, and file banners. The
>     shared-shell catalog tagline updated via platform PR #39 (shell v0.1.1; vendored copy
>     synced here in the same slice); carousel screenshots re-captured with the new name.
>     Internal module names (Studio.* API, studio-*.js, storage keys) deliberately unchanged.
>     ✚ V1 follow-up (Kevin, 2026-07-16, shipped same day): the landing page's single static
>     screenshot became an auto-playing hero CAROUSEL of six REAL app screens (JobTracker-style:
>     fade slides, captions, dots, arrows, hover/focus pause, reduced-motion + offscreen aware).
>     Screens: builder light (flagship) / builder dark (finance), exported flagship in dark, the
>     marketing-growth chart showcase, a Corn Belt county choropleth, the ensemble chart —
>     captured from the REAL app + real Studio.buildHtml exports by tools/gen-shots.mjs
>     (committed baselines in site/shots/, regenerate whenever showcased features change; the
>     Viridis screens keep "also"-feature billing: slides 4-5 of 6, general product first).
>     SW → v13 (shots deliberately NOT precached — runtime cache covers them).
> V3. **Ensemble views — THE MEDIAN IS THE PRODUCT (user, 2026-07-16):** the goal is a SINGLE
>     BEST COMMON ESTIMATE, not a comparison of providers — that's the whole point of the
>     collaborative ("gain a common view"). Design consequences, non-negotiable:
>     · Visual hierarchy: the median renders BOLD and first-class everywhere; provider series
>       are thin, muted supporting evidence (toggleable, but never co-equal stars).
>     · The choropleth ALWAYS colors from the median of the selected providers — never from a
>       single provider. Tooltips/KPIs report the median as THE value; providers appear as
>       provenance beneath it.
>     · The agreement band expresses CONFIDENCE IN the common estimate (tight band = high
>       confidence), not a compare-the-vendors affordance. Wording throughout: "common
>       estimate" / "consensus", never "compare providers". Neutrality is the brand.
>     ✓ SHIPPED 2026-07-16: `ensembleSeries` chart (bold 3px median line + dots; provider
>     series at 1.3px/50% opacity with hollow dots; translucent agreement band with a
>     confidence tooltip; refSeries (AgCensus) as hollow red squares NEVER in the median;
>     legend leads with "Common estimate"; provider on/off chips owned by the chart, exactly
>     the mock-ups' toggle column). Linkage via PDC.ensembleBus — a per-document pub-sub that
>     ships inside preview iframes AND exports (no filter-system surgery): toggles publish the
>     selected set on a channel (default "providers"); the choropleth's new seriesCol binding
>     joins the channel and re-aggregates via the SAME PDC.aggValues the chart uses (proven in
>     tests: legend domain shifts to the exact 4-provider median when a provider drops).
>     Empty-ensemble is prevented (last provider can't toggle off). NOTE: the dashboard-level
>     filter system was deliberately left untouched — V5's Explore can layer a filter-control
>     surface over the same bus later.
> V4. ✓ **MapLibre renderer (shipped 2026-07-16):** MapLibre GL JS v5.24.0 vendored
>     (vendor/maplibre/, BSD-3-Clause, LICENSE + notices row; NOT precached — runtime cache)
>     behind the SAME PDC.choropleth API via a per-panel `renderer` opt (svg default | gl).
>     KEY TRICK: no second geometry set — the pre-projected 975×610 plane maps into MapLibre's
>     mercator space exactly (x linear in lng, y linear in mercator-y, lat=gd(m)), so GL
>     re-projects onto the identical planar shape the SVG renderer draws. No basemap tiles ON
>     PURPOSE (tiles would phone external servers; exports stay self-contained/offline). GL
>     panels inline maplibre js+css into preview/export (~1MB, opt-in weight only; CLI parity);
>     ensureGeoAssets pulls it lazily; WebGL-less environments fall back to the SVG renderer
>     automatically (never a blank panel); ensemble-bus recolors preserve the user's camera.
>     VERDICT (side-by-side): keep BOTH. SVG = default (tiny exports, hatched no-data,
>     print-clean, zero GL contexts); GL = the demo/exploration mode (buttery pan/zoom on 3k+
>     counties even under SwiftShader, zoom buttons, hover highlight). Recommend GL for the
>     Viridis live demo dashboards, SVG for everything shipped wide. Suite exercises REAL GL
>     boot in CI (SwiftShader) + the fallback path + lean/inline export splits.
> V5. ✓ **Explore designer (shipped 2026-07-16):** dataset-first flow in a new rail section —
>     pick dataset (workspace first, samples below; live rows w/ typed-sample fallback) → table
>     preview → chart chips (everyday set + choropleth + ensembleSeries w/ scale + refSeries
>     options) → guessed column mappings (editable) → LIVE preview via the REAL Studio.buildHtml
>     in an iframe → SAVE as an "Analysis" (workspace `analyses` table; SCHEMA_VERSION 1→2,
>     additive: local store tolerates, Turso save() self-heals via ensure-DDL — tested — and
>     Supabase gets provisionDeltaSQL in its error hint; its save() also learned to FAIL LOUDLY
>     on non-ok writes instead of silently skipping). Analyses embed their da (self-contained,
>     survive dataset deletion), appear in the Studio library ("Analyses" group, click-add +
>     drag-to-canvas), pin to Home (★ → card → click-through re-opens in Explore), and
>     "Add to dashboard" pushes a panel + da into the current spec. Simple mode with no saved
>     section boots into Explore (Kevin-confirmed direction). Explore param/filter authoring
>     deferred to the V8 jobs layer (analyses inherit dataset {{params}} defaults).
>
> ── ★ HANDOFF (Kevin, 2026-07-16): the REST OF THIS TRACK (V6→V9, in order) is now the ──
> ── TOP PRIORITY for the HOURLY FOCUS RUNS. Complete the Viridis requirements FIRST,   ──
> ── before any other backlog: V6 Home-as-instant-analytics, V7 the demo pack (the RFP  ──
> ── demo itself), V8 prep/load jobs (the base DATA-MANAGEMENT INFRASTRUCTURE — jobs,   ──
> ── mappings, aggregation/rollups incl. acreage-weighted mean, joins/unions,           ──
> ── materialized datasets, repeatable loads), V9 scientific-honesty polish. Satisfy    ──
> ── ALL RFP requirements (bid due 7/31; see the GOAL block above). One slice per run,  ──
> ── same PR discipline; coordinate via open steward/* PRs.                             ──
> ── PENTAHO PURGE (UI) shipped 2026-07-20 (Kevin): color pickers show friendly labels ──
> ── (Accent/Series/Good...) — raw tokens never surface (ratcheted). The "--pentaho"    ──
> ── STRING remains as the stored/export accent variable (compat identifier, like       ──
> ── Studio.exportCDF) — renaming storage would need a spec migration; UI never shows it.──
> ── SAMPLES CURATION shipped 2026-07-20 (Kevin): catalog 67 stems/428 DAs → 13/~115,   ──
> ── geo-first ("field-and-geo" leads: county/state/CRD/HUC8 + provider trends), stems  ──
> ── renamed (no cde-/cdf-/pdc- anywhere), retired CDF/CDE wording swept from app/Help  ──
> ── (suite-ratcheted), Explore repaints on hide-samples, geo datasets open as MAPS.    ──
> ── KEEP THE CATALOG CURATED: new samples must earn their place (distinct + demoable). ──
> ── DESIGN BAR (Kevin, 2026-07-16): every Viridis slice (and supporting work) must     ──
> ── ALSO make the app USEFUL, EASY TO USE, ELEGANT, SIMPLE, and BEAUTIFUL — delight    ──
> ── is a requirement, not decoration (the platform design bar). Non-expert first:      ──
> ── plain-English labels, sensible defaults, empty states that teach, both themes,     ──
> ── mobile as a release gate. Prefer REMOVING complexity over adding controls; polish  ──
> ── ships IN the slice, never "later". If a slice works but feels clumsy, it isn't    ──
> ── done.                                                                              ──
> V6. ✓ **Home = instant analytics (shipped 2026-07-16):** per-dashboard "Feature on Home" flag
>     (house button on every card; rides the dashboards row like pinned). Home renders featured
>     dashboards LIVE — the REAL renderer (buildHtml + genMock) in scaled view-only iframes,
>     theme-following (same postMessage the builder preview uses), click-through opens in Studio.
>     Pinned analyses render as live chart widgets (banner cropped, chart-first) that reopen in
>     Explore. Hydration is LAZY via IntersectionObserver — fixes the hidden-section scale(0-width)
>     bug AND spares offscreen work. Simple-mode boot: featured content → Home, none → Explore,
>     user's own last section always wins (reconciles V5/V6 boot directions). Suite guards the
>     scale factor explicitly (never the hidden-section scale bug again).
> V7. ✓ **Viridis demo pack + sample-pack framework (shipped 2026-07-16):** a SECOND sample
>     library ("Demo packs", `app/demopacks.js`) separate from the CDA catalog — Settings and
>     the Studio library both gain a hide-samples-aware "Demo packs" group nested under the same
>     `showSamples()` toggle as the built-in Samples catalog. One-click **Install** writes ordinary,
>     tagged (`demoPackId`) workspace rows — a raw-column-named provider CSV (`kind:'file'`, the
>     file-connection + mapping demo: real live rows through the file adapter, raw headers like
>     `Provider_Name`/`Adoption_Pct` a user maps onto chart roles), 4 pinned Ensemble analyses (one
>     per practice: cover crops/no-till/reduced tillage/conventional), and 1 featured "Viridis
>     View" dashboard (4 Ensemble panels + 1 provider-colored county choropleth) — so it appears
>     live on Home the moment it's installed, via the EXACT V5/V6 pinned-analysis/featured-dashboard
>     machinery (zero new Home code). **Remove** deletes every row it wrote and clears the install
>     flag; nothing else touches workspace state. Synthetic content is labeled illustrative
>     throughout (Settings blurb, docs, dashboard subtitle) — it's a sales-demo fixture, not real
>     provider/AgCensus data.
>     ✚ **Sample-engine upgrade (shared, not pack-specific):** `classify()`/`valueFor()` learned
>     `provider`/`practice`/`year` columns (real names, not placeholder numbers/categories) — the
>     same precedent as V2's `geoid` heuristic. New `Studio.crossedRows(da, seriesCol)` crosses a
>     label domain (year or geoid) against the series domain instead of the flat engine's one row
>     per index, wired into `Studio.genMock` for any `ensembleSeries`/`choropleth` panel that sets
>     `map.seriesCol` — so ANY Ensemble or provider-colored map (ours or a user's own) renders a
>     believable multi-provider ensemble in every offline preview (Explore, the Studio canvas, Home
>     tiles), not a single point per label. AgCensus reference rows land sparsely on real release
>     years (2017, 2022) rather than every label. Backward compatible: only activates when
>     `map.seriesCol` is set, so existing single-series choropleth panels (V2's common case) are
>     unaffected. SW cache → v18. Test suite gains a "DEMO PACKS" block (unit tests for the sample-
>     engine heuristics/crossing + full install → verify-everywhere → remove flow).
> V8. ✓ **Prep / load processes (data-management-lite, feature-complete 2026-07-17):** new
>     workspace `jobs` table — a job =
>     ordered steps over datasets: field mapping/rename/cast/derive, filter, AGGREGATE/ROLLUP
>     (group-by + sum/avg/count/median/**acreage-weighted mean** — required for honest State/CRD/
>     HUC8 roll-ups of percent metrics), JOIN/UNION across datasets (the 5-provider normalize-and-
>     stack case), output → materialized workspace dataset; execute on demand, re-run for annual
>     updates; optional custom-SQL step via the existing engines. Client-side executor first.
>     ✓ **Slice 1 shipped (2026-07-17):** the single-dataset prep pipeline — `app/sources/
>     jobs-engine.js` (pure, unit-tested) runs ordered rename/cast/derive/filter/aggregate steps
>     over one source dataset's live rows; derive takes two explicit `{col}`/`{value}` operands
>     (no string-sniffing ambiguity); aggregate's `wmean` metric is the acreage-weighted mean
>     (skips rows missing either half of the value/weight pair rather than treating them as zero).
>     New **Jobs** rail section (list + editor: name, source dataset, reorderable step cards,
>     live Preview) mirrors the Datasets section's UX. Running a job materializes the result as an
>     ordinary `kind:'file'` dataset (tagged `job-output`, same shape localfile.js already speaks —
>     zero new dataset-kind code) and re-running the SAME job updates that dataset in place via
>     `job.outputDatasetId` (the annual-refresh case). Schema v2→v3 (additive: Turso self-heals via
>     the existing `WS.TABLE_NAMES` loop; `provisionDeltaSQL` now covers analyses+jobs together for
>     Supabase's paste-me path). SW cache → v19; docs gain a Jobs section.
>     ✓ **Slice 2 shipped (2026-07-17):** JOIN and UNION across datasets. The engine stays pure/
>     synchronous (`Studio.runJobSteps(input, steps, ctx)` now takes an optional `ctx.datasets`
>     map); `studio.js`'s new `resolveJobCtx` runs every dataset a job's join/union steps
>     reference through the real adapters BEFORE calling the engine, so join/union work against
>     live rows from any connection type. **join** (`{op:'join', datasetId, leftCol, rightCol,
>     type:'inner'|'left', prefix?}`) adds the right dataset's non-key columns onto matching left
>     rows (inner drops unmatched, left keeps them with blank added columns); a name collision with
>     an existing column gets an automatic `_2` suffix so a join can never silently overwrite data.
>     **union** (`{op:'union', datasetId, columnMap:[{to,from}]}`) is the normalize-and-stack case:
>     it reshapes the right dataset's rows onto the pipeline's EXISTING schema via an explicit
>     per-column mapping (falls back to a same-name match, else blank) — run once per additional
>     provider dataset, this is exactly the 5-provider case the Viridis rollups need. Job editor
>     gained dataset-picker + key/type fields for join and a column-mapping editor for union.
>     SW cache → v20; docs updated.
>     ✓ **Slice 3 shipped (2026-07-17): the Custom SQL step.** New `sql` op runs an arbitrary
>     query against the pipeline's CURRENT rows, table-aliased `t`, via DuckDB-Wasm (the same
>     engine Z14 slice 1 already vendors for remote-file querying) — `app/duckdb.js` gains
>     `queryRows(columns, rows, sql)`, which registers the rows as in-memory CSV text via
>     `registerFileText()` (no network) instead of `registerFileURL()`, so the query never
>     leaves the browser. The pure engine in `jobs-engine.js` stays synchronous and
>     DOM/engine-free — `Studio.runJobStepsAsync(input, steps, ctx, sqlRunner)` is the new
>     orchestrator that splits a job's steps at `sql` boundaries, runs each pipe segment
>     through the existing `runJobSteps`, and awaits `sqlRunner` (DuckDB in the app, a fake
>     function in tests) for each `sql` segment; a job with no `sql` step never touches the
>     engine, so the WASM load stays fully lazy. `runJob()` and the job editor's Preview both
>     switched from `runJobSteps` to `runJobStepsAsync`. Job editor gained a SQL textarea step
>     (monospace, table `t` hinted). V8 is now **feature-complete**. SW cache → v21; docs
>     updated.
> V9. **Scientific-honesty polish:** first-class no-data/coverage rendering, provenance popover
>     (which providers, coverage, last updated), CSV download of the current selection (the
>     RFP's deferred download question), docs + a "make the ensemble legible" help page.
>     ✓ **Slice 1 shipped (2026-07-17): CSV download of the current selection.** Both the
>     ensembleSeries and choropleth chart legends gain a "⬇ Download CSV" control,
>     self-contained inside `app/studio-charts.js` (no dependency on the app shell's own
>     download() helper, since this module ships standalone in every preview/export iframe).
>     Ensemble exports long-format label/series/value rows for EXACTLY the providers left
>     toggled on plus the computed common estimate and any reference series — a re-download
>     after a provider toggle reflects the new selection live (same `PDC.ensembleBus`-driven
>     re-render V3 already wired). Choropleth exports region id/name/value for what's
>     currently shown post-aggregation (works for both the plain single-series path and the
>     ensemble-channel-linked path; both the SVG and GL renderers call the same shared
>     `geoLegend`). Suite gains 3 checks driving the export end-to-end inside a real exported
>     iframe (intercepting the anchor's `click()` to read the Blob instead of triggering an
>     OS download). SW cache → v22.
>     ✓ **Slice 2 shipped (2026-07-17): the "ⓘ Sources" provenance popover** — which providers,
>     how much coverage — on both charts, next to the CSV button (`provenanceBtn()` in
>     `app/studio-charts.js`, a click-to-open popover that persists while read, unlike the
>     hover-only `_tip`; closes on outside click, Escape, or its own re-click, and only one stays
>     open across the dashboard at a time). Choropleth: "N of M counties/states/CRDs/HUC8
>     subbasins have data (P%)" plus, when a provider/series column is mapped, each provider's
>     own region count (struck through when toggled off elsewhere — computed from the FULL
>     `rowsSV`, not just the channel-filtered rows, so an excluded provider's coverage stays
>     visible instead of disappearing). Ensemble: "N of M providers currently selected" + "N of M
>     points have every selected provider reporting" (the full-coverage count — an honest signal
>     distinct from the agreement band) + a per-provider point count + the reference series'
>     point count with its "never part of the common estimate" reminder. Both popovers are pure
>     functions of data already in the render config — no new dataset-metadata plumbing, so this
>     slice stays self-contained. Suite gains 6 checks (open/content, only-one-open-at-a-time,
>     outside-click, Escape, and a live update when a provider toggle changes the selection).
>     SW cache → v23. "Last updated" (needs dataset/job timestamp plumbed through to the render
>     config — bigger lift than a single slice) and the docs/help page are next.
>     ✓ **Slice 3 shipped (2026-07-17): the "make the ensemble legible" help page.** New
>     `docs/index.html#ensembles` section ("Ensembles & scientific honesty") spells out the
>     design rules the Ensemble chart and choropleth map already implement — median renders
>     bold as the common estimate while providers stay thin supporting evidence, the agreement
>     band is a literal (not decorative) confidence signal, a reference series is context that
>     never joins the estimate, no-data is shown (hatched) rather than guessed — and documents
>     the ⓘ Sources popover + Download CSV controls from slices 1–2, with a pointer to the
>     Viridis View demo pack as a worked example. Linked from the docs nav bar. "Last updated"
>     (needs dataset/job timestamp plumbed through to the render config) remains, tracked
>     separately as it's a bigger lift than a doc slice.
>     ✓ **Slice 4 shipped (2026-07-17): "Last updated" in the Sources popover.** `Studio.buildHtml`
>     (`app/exporters.js`, the one place the live builder preview AND every static export funnel
>     through) resolves each data access's linked workspace dataset and stamps its `updatedAt`
>     into a sibling global, `window.STUDIO_DA_META` — kept OUT of `spec.cda.dataAccesses` itself
>     so this derived, point-in-time value never gets saved back into a dashboard's persisted
>     spec. A job run already bumps its materialized output dataset's `updatedAt` on every
>     mutation (existing `Workspace.put` behavior — no new plumbing there), so this is exactly
>     "when this panel's data was last (re)loaded," matching the annual-refresh model V8 built.
>     `studio-render.js`'s `renderPanel` reads it per panel (`daLastUpdated(ch.da)`) and passes
>     `lastUpdated` into both the choropleth and ensemble render configs; `studio-charts.js`
>     appends a shared "Last updated <date>" line to both Sources popover bodies, omitted
>     entirely when the DA has no linked dataset (samples, direct connectors, synthetic specs) —
>     same "omit rather than guess" convention as the no-data hatching. Docs updated
>     (`docs/index.html#ensembles`) to mention the line. **V9 is now feature-complete — the
>     Viridis View track (V6→V9) Kevin handed off on 2026-07-16 is DONE.**
>
> Open questions parked for Kevin: (a) confirm /app/ move + redirect posture; (b) MapLibre vendor
> size (~850KB) is fine as vendored no-build code?; (c) HUC8/CRD geometry sourcing priority;
> (d) whether Explore replaces "New dashboard" as the Simple-mode default entry.

---

<a id="post-overhaul-backlog"></a>

## POST-OVERHAUL BACKLOG (2026-07-13)

> Lifted from NEXT 2026-08-07 (N1). Items 1–7 all shipped — the last of them, the Datasets "by type" facet, landed v586 on 2026-07-26. The 2026-07-14 UX sprint log at its foot came with it.

### ★★★ POST-OVERHAUL BACKLOG (2026-07-13, user-directed — do these FIRST when the loop resumes)

> ⚠ **Priority header SUPERSEDED by the ▶ NOW queue at the top of NEXT (2026-08-07).**
> The adapters → connections → datasets overhaul (see GOAL block) landed its baseline in one long
> interactive session (Polecat default look · app/sources/ adapter layer · Connections/Datasets/
> Dashboards sections · manager-style rail · workspace-backend sync w/ secrets · full Pentaho removal).
> These are the follow-ons, in priority order:
> 1. ✓ **Dashboards into the workspace store (shipped 2026-07-15, steward PR).** The catalog now
>    lives in the Workspace `dashboards` table (rows keep the recents-entry shape {id, ts, spec,
>    workbookId?} + pinned/pinnedAt flags + promoted title/name columns); pins ride ON the row and
>    workbooks moved into workspace SETTINGS, so the remote backend mirrors the whole catalog.
>    One-time boot migration (meta-stamped so an emptied catalog is never re-imported; legacy
>    studio-recents/pins/workbooks kept untouched as a frozen local backup). Home/Dashboards
>    repaint on remote pulls via Workspace 'replaced'. Fixed alongside (recurring clear-data gap):
>    "Clear local data" never wiped `analytics.workspace.v1` (connections/datasets survived a
>    "full" reset since the overhaul!) nor `studio-whatsnew-seen` — both added + tested.
> 2. **More data adapters** (user: "we will add many more"): ✓ **PostgreSQL via PostgREST (shipped
>    2026-07-15** — `app/sources/postgrest.js`, data-only, url/token/Accept-Profile fields,
>    kind:'table' datasets like Supabase since it IS the same protocol; mock-served end-to-end
>    tests incl. the full connection→dataset→{{params}} run path). ✓ **CSV/JSON file-drop
>    (shipped 2026-07-16** — `app/sources/localfile.js`, kind:'file' datasets whose content
>    rides INSIDE the row (offline + mirrors with the workspace; ~2MB cap pointing bigger data
>    at DuckDB remote-file), drop-zone editor branch, RFC4180 CSV w/ delimiter sniff + typed
>    numbers, JSON array-of-objects w/ key-union columns; NOTE: went inline-content instead of
>    File System Access API handles — handles can't persist in localStorage, are Chromium-only,
>    and re-prompt permissions; an FSA "link live file" variant can layer on later). ✓ **Google
>    Sheets (shipped 2026-07-16** — `app/sources/gsheets.js` via the gviz endpoint for
>    link-shared sheets: kind:'sheet' datasets (tab + optional tq query, {{params}} flow into
>    where-clauses), formatted dates, friendly access_denied hint; mock-gviz end-to-end tests.
>    ✓ **FOLLOW-UP shipped (v610, sw v247, 2026-07-27, steward): private-sheet OAuth via Sheets
>    API v4 + bearer token, the BigQuery pattern — see DONE for the full writeup. A tab reads as a
>    plain values range on the token path (no tq query language in v4); the exported-runtime
>    redaction gap this closed too (gsheets had no secret field at all until now) is documented
>    in the same DONE entry.**)
>    ✓ **Amazon Redshift via the Data API (shipped 2026-07-18, steward PR)** — `app/redshift.js`
>    (ExecuteStatement → poll DescribeStatement → paginated GetStatementResult, cluster or
>    Serverless workgroup target, optional VPC-PrivateLink `endpoint` override) plus a new reusable
>    `app/sources/sigv4.js` AWS SigV4 request signer (pure WebCrypto, no dependencies) — unlike
>    Snowflake/Databricks/BigQuery's bearer tokens, every Redshift Data API call must be
>    individually signed with an access key/secret (+ optional STS session token), so this adapter
>    needed its own signing primitive first. Tested against a real mock Data API server (async
>    poll + NextToken pagination exercised end-to-end) plus dedicated crypto-vector tests (RFC 4231
>    HMAC-SHA256 test case 1, the well-known SHA-256('') digest) verifying the signer itself is
>    correct — a mock server can't validate a signature is genuinely right, only that some
>    signature-shaped header showed up. New `redshift` icon (spectral lines spreading — the
>    astronomical redshift the name references). SW cache → v37. 11 new tests, suite 1584/1584.
>    Still to do: Azure SQL / Fabric, MotherDuck (MotherDuck in particular needs a proprietary WASM
>    client, not a plain REST endpoint like the others — a vendoring-size/license question for
>    Kevin before attempting it, same class of question as the MapLibre one still open on the
>    Viridis track above). Each = one file implementing the contract in app/sources/schema.js +
>    registerSource + wizard fields + tests against a mock.
> 3. ✓ **Exported-runtime support for the four credential-based direct connectors shipped
>    (2026-07-19, steward PR).** Snowflake/Databricks/BigQuery/Generic SQL join DuckDB/SQLite's
>    existing exported-runtime path (v318): `exporters.js` redacts each DA's secret field before
>    it's ever embedded in the exported HTML (stamping `needsSecret` with the field name), and
>    `studio-render.js`'s `PDC.cda` dispatch prompts for it once at open — in-memory only, never
>    saved — exactly the "credentials prompted at open (never embedded)" design this item called
>    for. `app/model.js`'s now-obsolete "no live query path" warning for these four kinds is
>    retired. SW cache → v45. 13 new tests. This item's other half (bundling connection-bound
>    *dataset* adapters — Turso, Redshift, etc. — for a shipped .html to run live against,
>    distinct from the legacy direct-DA-with-embedded-cfg style this slice covered) started
>    2026-07-26 (v589, steward PR): `redactSecrets` now also resolves `da.connectionId` against
>    the Workspace connection at export time (only available in the builder) and stamps
>    `da.connAdapter`/a redacted `da.connCfg`; `PDC.cda` gained a parallel `CONN_ENGINES` dispatch.
>    ✓ **PostgreSQL/PostgREST done too (shipped 2026-07-26, v590, sw v227, steward — second
>    connection-bound adapter).** Same treatment as Turso, with two adapter-shape wrinkles worth
>    noting for whoever does the next one: (1) PostgREST's token is OPTIONAL (anonymous access is
>    a supported, common config), so `redactSecrets` only stamps `needsSecret` when a connection
>    actually has one set — an anonymous connection's exported dashboard never pops a pointless
>    credential prompt. (2) `dsToDA` (app/studio.js) always sets a connection-bound DA's
>    `da.kind:"sql"` and clobbers `da.sql`/`da.query` to the SQL-editor shape regardless of the
>    underlying dataset's real kind — so for a `kind:"table"` PostgREST dataset, the real
>    `{table,query}` pair only survives on `da.dataset` (the original dataset def, JSON-cloned
>    along for free by `redactSecrets`). `CONN_ENGINES` gained a `dataset(da)` shaper per adapter
>    (Turso's reads `da.sql`/`da.query`, unchanged; PostgREST's reads `da.dataset.table`/
>    `da.dataset.query`) so the dispatch call passes the right shape to each adapter's own
>    `queryData(cfg, dataset)` contract. `app/sources/postgrest.js`'s top-level
>    `Studio.registerSource(...)` call is now guarded (it would throw in the exported bundle,
>    which never loads `registry.js`) and always sets `Studio.postgrestSource` too, mirroring
>    `Studio.tursoSource`'s convention — in-app registration behavior is unchanged. 9 new tests
>    (redact-with-token, redact-anonymous — the optional-token case Turso doesn't have, lean
>    bundling both ways, and a full dispatch round-trip proving the query goes out with
>    `da.dataset`'s table/query, not `da.sql`/`da.query`). (app/sources/postgrest.js,
>    app/exporters.js, app/studio-render.js, app/studio.js, app/viewer.js, docs/index.html,
>    js/changelog.js, sw.js, tests/run.js) ✓ **Supabase done too (shipped 2026-07-26, v592, sw
>    v229, steward — third connection-bound adapter).** Same `{table,query}` dataset shape as
>    PostgREST (Supabase's data plane IS PostgREST); its secret field is the anon/publishable
>    `key`, effectively always required (no supported anonymous-key mode, unlike PostgREST's
>    optional token). `app/sources/supabase.js`'s `queryData` carried the identical
>    `Studio.WS.postgrestQueryData` latent bug the v591 regression fix above had just found and
>    fixed for `postgrest.js` — closed it up front with its own self-contained copy rather than
>    shipping the throw. See STATUS.md's DONE entry for the full writeup. ✓ **STALE NOTE
>    CORRECTED (2026-07-27, steward): this used to read "Redshift, Google Sheets, and local files
>    still have no exported-runtime path," but that was already out of date — Google Sheets
>    (v593), local files (v594), and Redshift (#307) each shipped the same one-adapter-at-a-time
>    CONN_ENGINES treatment earlier and this file was never updated to say so. All six
>    connection-bound adapters (Turso/PostgREST/Supabase/Google Sheets/local files/Redshift) have
>    had exported-runtime support since 2026-07-26 — backlog item 3 is fully closed, nothing left
>    here.**
> 4. **Terminology sweep**: ✓ "My Data Sources" → "This dashboard's datasets" (already shipped, landed
>    silently in the 2026-07-14 UX sprint's dataset-first Data panel work) and ✓ sample catalog groups
>    labeled "Samples" (already shipped, same era) — both confirmed still live in `app/studio.js` as of
>    2026-07-17. Still open: data-source builder → dataset editor naming (cosmetic, code-comment-only
>    today — low value). Still open, but **NOT as simple as it looks**: rename the internal `--pentaho`
>    CSS var → `--brand`. Investigated 2026-07-17 — `--pentaho` is actually TWO independent variables
>    that happen to share a name: (A) the Studio builder-chrome's own accent in `app/studio.css`
>    (~40 refs), already bridged to the shell's `--brand` token one line down (`--brand:var(--pentaho)`)
>    — safe, mechanical to fold together; (B) the exported-dashboard/preview content's own theming
>    primitive (`vendor/pdc-ui.js`/`.css` — PRISTINE, cannot rename — plus `exporters.js`,
>    `studio-charts.js`, `studio-render.js`, every static exported `.html`, and the `spec.themeColor`
>    → `:root --pentaho` contract tests around H103) which has nothing to do with the shell bridge and
>    must stay `--pentaho` forever (or get its own, much bigger, separately-scoped rename). Only (A)
>    (~40 of the ~252 total refs) is safe to fold into `--brand`; (B) is NOT "zero user impact" busywork,
>    it's product-critical export theming under RFP deadline pressure — do not attempt without care to
>    keep the two contexts separate, and ideally with a screenshot-diff of exported dashboards before/after.
>    ✓ **Chrome call-sites migrated (2026-07-18, steward PR).** Re-investigated (A): it's bigger than the
>    ~40-ref estimate (`app/studio.css` alone now carries 150 `--pentaho` occurrences) AND `app/studio.js`
>    interleaves genuine chrome uses (connection-wizard card accents, the visual SQL builder's ON/AS
>    labels + Generate-SQL button) with (B) export/dashboard-theme uses (`resolveThemeTokens`'s
>    `tk["--pentaho"]`, the example-thumbnail `exAccent`, the per-dashboard accent override) in the SAME
>    file — a blind rename of the CSS definitions would silently break whichever context wasn't touched.
>    Shipped the fully safe slice instead: every unambiguous chrome-only call site (`app/tutorial.js`,
>    `app/welcome.js`, `app/gate.js`, `app/palette.js`, `app/sources/local.js`'s local-adapter accent,
>    and the confirmed-chrome lines in `app/studio.js` — connection wizard/card accents + the SQL builder
>    labels/button) now reads `var(--brand, …)` instead of `var(--pentaho, …)`. Zero risk: `studio.css`
>    still defines `--pentaho` in every theme block and still bridges `--brand:var(--pentaho)`, so every
>    touched element resolves to the exact same computed color as before — confirmed via screenshot
>    (Connections + New-connection wizard, light + dark) and the full suite (1568/1568, unchanged).
>    `studio.css`'s own ~150 `--pentaho` definitions/usages and the true (B) export-context refs are
>    UNTOUCHED and stay exactly as scoped above.
>    ✓ **`studio.css`'s definitions folded to `--brand` directly (2026-07-18, steward PR).** All six
>    theme blocks (Classic/Polecat/Fleet Modern × light/dark) now define `--brand` instead of
>    `--pentaho`, and every `var(--pentaho…)` usage inside `studio.css` (chrome-only, confirmed —
>    exports never load this stylesheet, only `vendor/pdc-ui.css`) reads `var(--brand…)` too. The
>    shell-token-bridge's `--brand:var(--pentaho)` alias is gone — `--brand` IS the shell's canonical
>    name now, converged with the Studio's own chrome accent, no indirection left. `--pentaho` no
>    longer exists anywhere in `studio.css`; the true (B) export-context variable (`vendor/pdc-ui.css`/
>    `.js`, `app/exporters.js`, `app/studio-charts.js`, `app/studio-render.js`, the 5 export-token refs
>    in `app/studio.js`, `app/model.js`'s `DASHBOARD_THEMES`) is entirely untouched and keeps the
>    `--pentaho` name forever, exactly as scoped. Updated the handful of test assertions that read the
>    chrome `--pentaho` custom property directly (the shell-bridge check + the Z10 app-theme-switching
>    checks) to read `--brand` instead — same computed-color rigor, new name. SW cache → v35. This
>    closes out post-overhaul backlog item 4's terminology sweep entirely (both the JS call-site slice
>    and this CSS-definition slice are now shipped). Test suite 1569/1569 (1 new check).
> 5. **Dataset delight**: schema browser per connection (list tables/columns via adapter), scheduled
>    refresh hints. ✓ **Result caching with TTL shipped (2026-07-18, steward PR):** the DA
>    inspector's "Cache" section (Enabled checkbox + Duration seconds) dated back to the Pentaho
>    CDA model and was read by nothing — toggling it had zero effect anywhere. Wired it up in
>    `app/studio.js`: reopening a DA's inspector within its cache duration now shows the last
>    successful "Run live" result instantly (labeled "cached", in-memory/page-lifetime only — no
>    new localStorage key, so no "Clear local data" gap) instead of falling back to sample data;
>    an explicit "Run live" click always queries fresh and refreshes the cache. Cache key = DA id +
>    resolved params (dataset defaults ← dashboard template vars ← inspector param inputs), shared
>    via a new `resolveDsParams()` helper so all 7 live-query branches (connection-bound + duckdb/
>    sqlite/snowflake/databricks/bigquery/http) write the same cache their mount-time check reads.
>    Disabling Cache still falls back to sample on reopen. SW cache → v32. 2 new tests, suite
>    1562/1562. ✓ **Dataset lineage chips
>    shipped (2026-07-17, steward PR):** each row in
>    the Datasets catalog now carries a "↪ N dashboards" badge (`dsxLineage()` in `app/studio.js`,
>    scans every saved workspace dashboard's `spec.cda.dataAccesses` for a matching `datasetId` —
>    the same link `dsToDA` stamps when a dataset is dropped onto the canvas) whose hover title
>    names the referencing dashboards — the "blast-radius view" the backlog asked for. Deleting a
>    dataset that's in use now says so in the confirm prompt (which dashboards, and that they fall
>    back to their own frozen self-contained copy rather than silently going stale — the real
>    behavior per `runData`'s `da.datasetId`-first resolution). 3 new tests. Test suite 1549/1549.
>    ✓ **Scheduled refresh hints shipped (2026-07-18, steward PR):** a job (Jobs section, Viridis V8)
>    can now opt into a **Refresh reminder** (weekly/monthly/quarterly/yearly, optional select in the
>    job editor) — the Jobs list flags it with an amber "⏰ Refresh due" badge once `Date.now()` passes
>    `lastRun.at + refreshEveryDays` (a job with a reminder that's never been run counts as due too,
>    same as an overdue one), or a quiet "Refreshes in N days" note otherwise. Deliberately a HINT, not
>    real scheduling — the app is static/client-side with no server to run a cron, so it only
>    (re)computes while the Jobs list happens to be open, matching the annual-refresh model V8 was
>    built for. `jobRefreshBadge()` in `app/studio.js`, no schema bump (`refreshEveryDays` rides the
>    existing `jobs` row's free-form `data` blob, same as every other job field). SW cache → v36. 4 new
>    tests, suite 1573/1573. This closes out the "scheduled refresh hints" half of item 5.
>    ✓ **Schema browser shipped for the warehouse adapters (2026-07-18, steward PR):** a new,
>    optional `adapter.listSchema(cfg)` contract method (`app/sources/schema.js`) runs an ANSI
>    `information_schema.columns` SELECT through the SAME `engine.query()` bridge `queryData`
>    already uses, grouped client-side into a `{tables:[{schema,name,columns:[{name,type}]}]}`
>    tree — no new capability surface, just a second query shape (`app/sources/data-adapters.js`).
>    Wired for the three warehouse adapters where an unqualified-or-database/catalog-qualified
>    query is reliable with no extra input beyond what the connection form already collects:
>    Snowflake (`"<database>".information_schema.columns` when a database is set),
>    Databricks (`` `<catalog>`.information_schema.columns `` when a catalog is set), Redshift
>    (unqualified, `pg_catalog`/`information_schema` excluded). The Connections wizard
>    (`app/studio.js`) gains a "Browse schema" button next to Test connection whenever
>    `adapter.listSchema` exists, opening a filterable, per-table `<details>` tree of columns +
>    types (`app/studio.css`). BigQuery (its `INFORMATION_SCHEMA` is dataset-qualified — a
>    different query shape) and the remaining adapters (generic SQL/HTTP, DuckDB single-file,
>    SQLite, PostgREST — each with its own introspection story, PostgREST's OpenAPI root doc vs.
>    a raw SQL dialect) are follow-ups; adapters without the capability simply don't show the
>    button. SW cache → v38. 9 new tests (a real end-to-end pass against the Redshift mock Data
>    API's new information_schema.columns response, monkey-patched query()-capture checks proving
>    the exact Snowflake/Databricks SQL text and case-insensitive grouping, and a full wizard UI
>    pass — button visibility, rendered tree, filter), suite 1593/1593. This closes out
>    post-overhaul backlog item 5 entirely.
>    ✓ **PostgREST follow-up shipped (2026-07-19, steward PR):** the "Browse schema" button now
>    also appears for PostgreSQL (PostgREST) connections — `listSchema()` (`app/sources/
>    postgrest.js`) needed no `information_schema` query at all: PostgREST already answers `GET /`
>    with a full OpenAPI document (the same 200 `testData()` already checks for), and each table's
>    columns live right there at `definitions.<table>.properties.<column>` (a Postgres type name
>    riding `format`, falling back to the plainer JSON-Schema `type`). The wizard panel
>    (`renderSchemaPanel` in `app/studio.js`) is fully adapter-agnostic already, so this was a
>    one-file change. 4 new tests (a real end-to-end pass against a mock PostgREST's OpenAPI doc,
>    a rejected-request in-band-error case, and a full wizard UI pass proving the same "Browse
>    schema" panel renders PostgREST's tables too), suite 1599/1599. SW cache → v40. Genuinely
>    still open: BigQuery and the three remaining adapters (generic SQL/HTTP, DuckDB, SQLite).
>    ✓ **BigQuery follow-up shipped (2026-07-19, steward PR):** BigQuery's `INFORMATION_SCHEMA.COLUMNS`
>    is dataset-qualified, unlike the three ANSI-SQL warehouses above, so `bigquerySchemaSql()`
>    (`app/sources/data-adapters.js`) queries it unqualified when the connection has a default
>    dataset set (the same `defaultDataset` the live-query path already sends BigQuery, per
>    `app/bigquery.js`'s `runQuery`), or falls back to the project-and-region-qualified view
>    (`` `project`.`region-<location>`.INFORMATION_SCHEMA.COLUMNS ``, defaulting to `region-us`)
>    listing every dataset in that region when no default dataset is configured. 2 new tests
>    (query() monkey-patched the same way the Snowflake/Databricks checks already do, since
>    BigQuery has no configurable endpoint field for a mock HTTP server), suite 1601/1601. SW
>    cache → v41. Genuinely still open: the three remaining adapters (generic SQL/HTTP, DuckDB,
>    SQLite), each with its own introspection story.
>    ✓ **DuckDB + SQLite follow-up shipped (2026-07-19, steward PR):** neither adapter speaks
>    `information_schema`, so each grew its OWN `listSchema()` instead of an ANSI SQL string.
>    DuckDB (`app/duckdb.js`) — a connection is always exactly one registered file, so the "tree"
>    is a single table, named after the file (not the internal `t` view alias), described via the
>    same `DESCRIBE SELECT * FROM t` query `testConnection()` already runs. SQLite
>    (`app/sqlitehttp.js`) — a `.sqlite` file can hold many tables, so it lists ALL of them via
>    `sqlite_master` (not just the one `cfg.tableName` a dataset happens to be bound to), then
>    `PRAGMA table_info` per table. Both go through their adapter's own `query()` (not the private
>    `withView`/`withDb` connection helpers) so tests can monkey-patch them the same way the rest
>    of each connector's suite already does. `app/sources/data-adapters.js`'s `dataAdapter()`
>    learned to wire an engine's own `listSchema` in directly when no ANSI `schemaSql` is given,
>    so the two new adapters needed no wizard/render changes — `renderSchemaPanel`/the "Browse
>    schema" button are adapter-agnostic already. 2 new tests, suite 1603/1603. SW cache → v42.
>    **This closes out post-overhaul backlog item 5's schema browser entirely** — the only
>    connector left without the button is Generic SQL/HTTP, which genuinely has no reliable
>    dialect or catalog to introspect (an arbitrary JSON API, not necessarily even SQL).
> 6. **Workspace polish**: ✓ **Saved views for the Datasets list shipped (2026-07-18, steward
>    PR).** A search + adapter/tag pill combination can be named and kept as a chip
>    (`dsxLoadViews`/`dsxSaveViews`/`dsxApplyView` in `app/studio.js`) — click the chip later to
>    restore the exact same search text + filters; each chip carries a small trash button
>    (mirrors the Dashboards section's `.wb-chip-wrap`/`.wb-chip-del` workbook-chip pattern
>    exactly, including its already mobile-tested CSS — no new styles needed). Storage rides in
>    Workspace SETTINGS (`datasetViews`, the same schemaless bag `workbooks` already uses), so
>    views sync with the rest of the workspace and need no new localStorage key or "Clear local
>    data" entry — sidesteps the exact "new key, forgot Clear local data" gap the Track L sweep
>    notes above found repeatedly. ✓ **Same treatment for the Connections list shipped
>    (2026-07-18, steward PR):** `connLoadViews`/`connSaveViews`/`connApplyView` in
>    `app/studio.js`, identical chip UX, one axis narrower (adapter pill only — connections
>    aren't tagged); own `connectionViews` key in the same Workspace SETTINGS bag. 5 new
>    regression checks; suite 1560/1560. ✓ **Drag a dataset card straight onto Home to start a
>    dashboard shipped (2026-07-18, steward PR):** a Datasets-catalog row is now `draggable`,
>    carrying the same `{wsDataset}` payload the Studio canvas drop already accepts; dropping it
>    on Home's "Blank dashboard" tile opens a fresh dashboard seeded with a bar chart bound to
>    that dataset (reuses `addFromWorkspaceDataset` — same linked/self-contained-DA behavior as
>    the canvas and library-chip paths). Dashed drag-over highlight matches the canvas drop zone.
>    SW cache → v33. 2 new regression checks. (Palette entries for the new sections landed with
>    the 2026-07-14 UX sprint.)
> 7. **Organization at scale (user, 2026-07-14):** dashboards/datasets/connections "will start to
>    become very long lists" — needs favorites/pinning everywhere, grouping (maybe folders, maybe
>    tags — user unsure a tree is right), and cross-cutting views: see datasets by connection, by
>    adapter, by type; dashboards by group/workbook. Design one organizing model shared by all three
>    catalogs (the jobtracker pill/multiselect pattern is the seed) rather than three ad-hoc ones.
>    ✓ **Favorites/pinning shipped for Datasets + Connections (2026-07-18, steward PR):** the piece
>    of this item that needed no grouping-model decision yet — a `pinned`/`pinnedAt` flag on each
>    row, the exact shape the Dashboards catalog already uses, so pinned rows sort to the top of
>    their list ahead of the usual most-recently-updated order. A star toggle (`.cx-pin` in
>    `app/studio.css`, `toggleConnPin`/`toggleDsxPin` in `app/studio.js`) sits beside each row's
>    other actions and — unlike those hover-only actions — stays visible once a row is pinned, so
>    pinned status reads at a glance in a long list without hovering every row. 4 new tests. Test
>    suite 1568/1568. SW cache → v34. Still open (at the time): folders/tags grouping and the
>    cross-cutting by-connection/by-adapter/by-type views.
>    ✓ **Cross-cutting views confirmed/completed (2026-07-19, steward PR).** By-adapter pills
>    (Datasets + Connections) and dashboards-by-workbook (Home + Repository chip strips) were
>    already shipped in earlier slices — confirmed still live. Added the one missing piece:
>    Datasets gained a **by-connection** filter pill strip (same `wb-chip`/`cx-pill` pattern,
>    saved-view aware) so two connections sharing one adapter (e.g. two Postgres DBs) can be
>    narrowed to just one — previously only reachable via search. SW cache → v46; 4 new tests;
>    suite 1642/1642. Still open (at the time): folders/tags grouping (the design-ambiguous part
>    Kevin flagged as unsure about — a tree vs. tags vs. folders call) and an optional "by type"
>    (kind: sql/table/file/collection/sheet) facet if wanted later.
>    ✓ **Folders/tags grouping resolved via the 2026-07-21 DECISIONS LOCKED note (hybrid
>    folders + tags, see that section) and shipped across every object kind — see that note's own
>    slice history.** ✓ **The optional "by type" facet shipped (v586, sw v223, 2026-07-26,
>    steward — post-overhaul backlog item 7 is now fully done):** see DONE for the full writeup —
>    a fourth Datasets pill strip (SQL query/Table/Collection/File/Sheet), same multi-select/
>    saved-view shape as the other three.
>
> **2026-07-14 UX sprint (interactive session, all landed, v349):** split topbar → slim app bar +
> dashboard toolbar above the preview; inline title rename (no phantom "Observability" group);
> Save/Open target the Dashboards catalog with .studio.json under Export; Data panel dataset-first
> (＋New menu: dataset/connection/dashboard-only query; ¶Text → canvas empty state; samples fold
> into one collapsible group); Settings toggle hides/reinstates ALL sample content (never deletes);
> Tour → Settings + ⋯More; renderer info popup lists Datasets; +Workbook empty-name feedback;
> command palette updated for the new sections.

---

<a id="mobile-track"></a>

## MOBILE TRACK (2026-07-02)

> Lifted from NEXT 2026-08-07 (N1). m-a through m-e are all shipped and code-level verified. Its process note — headless Chromium has no browser toolbar — is still required reading before any mobile slice.

### ★★★ TOP PRIORITY — MOBILE IS BROKEN, FIX IT FIRST (user-requested 2026-07-02, with screenshots)

> ⚠ **Priority header SUPERSEDED by the ▶ NOW queue at the top of NEXT (2026-08-07).**
> **Spend the next several consecutive runs on mobile — ahead of ALL Z-platform work — until the app is
> genuinely usable on a real iPhone.** The user reports (and a 390×844 probe confirms) that mobile is
> "wildly inoperable": no navigation, unreachable buttons, hidden panels, hidden footer. This is not a
> polish item; core flows are dead on a phone. Supersedes/expands **Z9**.
>
> **⚠️ WHY THIS STAYED BROKEN (process fix — read this):** the Playwright harness runs **headless Chromium,
> which has NO browser toolbar**, so bottom-fixed bars render fine in tests while being **hidden behind iOS
> Safari's bottom toolbar on a real phone**. DOM assertions passed; the app was still dead. So: (1) every
> mobile slice MUST **save a screenshot at 390×844 and actually VIEW it** (Read the PNG) — do not trust
> `display`/`classList` checks alone; (2) implement the standard iOS-safe patterns proactively (you can't
> see the Safari toolbar in-sandbox, so code defensively); (3) **final sign-off needs the USER on a real
> device** — after a coherent batch, ask them to re-check. Add a `tests/mobile-shot.js` helper that boots
> at 390×844 (unlock the gate via `sessionStorage["studio-gate-ok"]="1"` in an init script) and dumps a
> screenshot the loop reviews each run.
>
> **CONFIRMED ROOT CAUSES (from the 390×844 probe — start here, don't re-diagnose from scratch):**
> 1. **Left-rail section nav is `display:none` ≤900px** (Z1 scoped it desktop-only) → Home/Repository/
>    Studio/Settings are **unreachable on mobile**. FIX: make the rail a **slide-in left drawer** exactly
>    like the reference **relay.polecat.live** screenshot (brand at top; grouped section list; active item
>    highlighted; scrim over dimmed content; open via a hamburger button in the top bar AND edge-swipe;
>    close on scrim tap / Esc / section pick). This is the centerpiece the user explicitly asked for.
> 2. **Top-action buttons overflow the 390px bar** — `Examples/Open/Save` and even the `⋯ More` escape
>    hatch (`#btnMore`) render **off-screen to the right** (`onScreen:false`), so New/Examples/etc. "don't
>    work" because they can't be reached. FIX: on phones, keep the bar to a few essentials and move the
>    rest into the drawer and/or a **bottom action bar**; guarantee every action is reachable from an
>    on-screen control. (The M7 phone-More items exist but the button itself is off-canvas — fix that.)
> 3. **`#mobile-tabs` (Library·Canvas·Inspector bottom nav) AND `#statusbar` (footer/changelog) are
>    bottom-`fixed` and get hidden behind iOS Safari's toolbar** — they render on-screen in headless
>    Chromium but the user sees NEITHER on device. This is the killer bug behind "panels don't show" (the
>    Library/Inspector are off-canvas drawers reachable ONLY via those hidden tabs) and "can't see the
>    footer." FIX: use `100dvh` (not `100vh`), add `padding-bottom: env(safe-area-inset-bottom)` and
>    `bottom: env(safe-area-inset-bottom)` to the fixed bars, consider `-webkit-fill-available`, and make
>    sure the tab bar and status bar don't overlap each other (both currently sit at bottom:0).
> 4. **Surface the update footer/changelog on mobile** — per the user, if the left drawer is working, put
>    the "What's new"/changelog access there (see the reference relay/app.polecat.live "What's new" panel:
>    a clean full-screen sheet with search + Close). Fold the footer's changelog into the drawer or a
>    reachable sheet rather than the bottom-fixed strip that Safari hides.
>
> **TARGET UX (match the polecat family, per the attached screenshots):** a slide-in left drawer for
> section nav (Relay-style), a persistent reachable bottom bar (or drawer) for Library/Canvas/Inspector,
> every top action reachable, and a full-screen "What's new"/help sheet. Sequence it one shippable,
> screenshot-verified slice per run:
> **(m-a) ✓ DONE (v181):** rail → mobile slide-in drawer + hamburger + scrim, and sections
> now switch full-screen on mobile (shell.js no longer force-pins Studio). `app/shell.js` injects
> `#mobileNavBtn`; `app/studio.css` turns `#railNav` into a fixed off-canvas drawer ≤900px (Relay-style,
> full labels, safe-area padding); scrim / Esc / section-pick close it. Verified visually at 390×844
> (drawer open + Repository full-screen) + 6 tests. **NOTE for m-c:** the Repository section's data-source
> cards overflow horizontally on a phone — fix in the panel-ergonomics slice.
> **(m-b) ✓ DONE (v182):** root cause was `#app{height:100vh}` — iOS Safari's 100vh is the LAYOUT viewport
> (as if the toolbar were hidden), taller than the real visible area while the toolbar shows; with
> `body`/`html` overflow clipped and nothing to scroll, that gap silently stranded `#mobile-tabs` +
> `#statusbar` (the last two flex children of `#appMain`) below the fold. Fixed: `#app{height:100vh;
> height:100dvh}` (100dvh tracks the real visible area live as the toolbar shows/hides; 100vh stays as the
> no-dvh-support fallback), `viewport-fit=cover` added to `<meta viewport>` (required for
> `env(safe-area-inset-*)` to resolve), and `#statusbar` (the true bottom-most element) padded with
> `env(safe-area-inset-bottom)` at phone width. New `tests/mobile-shot.js` screenshot helper (390×844, iPhone
> UA) for future slices to actually view, not just DOM-assert. 3 new regression checks guard the fix's
> source (headless Chromium has no toolbar, so it can't reproduce the bug itself). **Still needs a real-device
> check from the user to fully close out.** Test suite 898/898.
> **(m-c) ✓ DONE (v183):** found and fixed the SAME "later same-selector media rule silently wins"
> pattern from m-b in three more places: (1) `#topbar{padding-left:52px}` (hamburger clearance) was
> clobbered back to `12px` by a later, unrelated `#topbar{padding:0 12px}` rule — the brand wordmark
> rendered UNDER the hamburger; fixed by folding the 52px clearance into that later rule instead of a
> separate earlier one (single source of truth). (2) Even after hiding secondary buttons, the remaining
> essentials still overflowed a 390px bar and `#btnMore` (escape hatch to every other action, including
> the phone-only Examples/Open/Save/Sign out/Clear-data items) scrolled fully off-canvas with zero
> on-screen cue — pinned it `position:fixed` top-right (mirrors `#mobileNavBtn`'s treatment) so it's
> ALWAYS reachable regardless of scroll position, with an opaque background so it doesn't go
> illegible over whatever's scrolled beneath it. (3) The SAME padding-top clobber hit `.home-wrap`,
> `.repo-wrap`, and `.settings-wrap` too — their `≤640px` rules reset `padding-top` back to `28px`,
> so **all three** section headings rendered under the hamburger on phones (not just tablets); fixed
> by keeping `padding-top:60px` in those phone rules. Also fixed **Repository data-source card
> horizontal overflow** (17px past the viewport edge) — a flex row with no `min-width:0` blocked
> `text-overflow:ellipsis` from ever kicking in on a long data-source id, forcing the whole
> 100%-wide card wider than its column. 11 new regression checks. Test suite 906/906.
> **(m-d) ✓ DONE (v184):** `#mobile-tabs` (Library·Canvas·Inspector) was styled `z-index:25` with
> no explicit `position` set — z-index is a no-op on statically positioned elements, so it never
> actually applied. `#mobile-scrim` (z-index:35, covers the full viewport whenever a drawer is
> open) sat on top and intercepted every tap on the tab bar, silently turning a one-tap
> Library→Inspector switch into two (dismiss, then re-tap) even though the tab-switch JS already
> supported jumping directly between drawers. Fixed with `position:relative;z-index:37`. Panel
> touch ergonomics (always-visible ⧉/×/zoom actions, 36-40px targets under `@media(pointer:coarse)`)
> were already handled by prior M3 work and shared by the live preview — verified still correct,
> no changes needed there. 3 new regression checks. Test suite 909/909.
> **(m-e) ✓ DONE (v185):** audited "What's new"/changelog + Help reachability on mobile — both were
> already largely working once m-b's `100dvh` fix landed (the footer/Changelog button is on-screen
> at 390px; Help is present and reachable in the m-a drawer). The one real gap against the reference
> "What's new" sheet design: the changelog popup had no explicit dismiss control (only tap-outside /
> Escape, awkward on a full-width phone sheet with no obvious "outside"). Added a visible ✕ Close
> button (36px tap target at ≤640px) wired to the same close path as tap-outside/Escape. 5 new
> regression checks (✕ present + closes it on desktop, footer button on-screen, ✕ on-screen + phone
> tap-target size, Help on-screen in the drawer — all at 390px). Test suite 914/914.
> **(m-e follow-up) ✓ DONE (v186):** went further on the same gap — the popup now stretches into a
> true near-full-screen sheet on phones (clears the topbar above and the tab bar/status bar below,
> instead of a small floating box that read as empty space) and the outside-tap dismiss now also
> binds `touchstart` (it previously only bound `mousedown`, which mobile Safari doesn't reliably
> synthesize from a touch tap — headless Chromium always looked fine, masking the gap). 2 new
> regression checks (sheet fills most of the viewport; ✕ actually dismisses it).
> **All of m-a through m-e are now shipped and code-level verified.** Per the process note above,
> headless Chromium cannot reproduce the original iOS-toolbar bug, so **the mobile track needs a
> real-device check from the user next** — ask them to reload analytics.polecat.live on an actual
> iPhone and confirm: the hamburger drawer, all bottom bars/footer visible without scrolling, every
> topbar action reachable, and the changelog/Help sheets. Only pick up further mobile polish (or a
> new m-f) once that confirms the fix actually lands on-device, or if the user reports something
> still broken.
> Keep the desktop experience untouched (scope changes to `≤900px` / touch). Update `docs` + STATUS each slice.
