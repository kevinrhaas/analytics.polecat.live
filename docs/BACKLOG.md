# BACKLOG.md — how the backlog is operated (the contract for every dev run)

This is the **operating manual for the backlog** in STATUS.md. Every process that
develops in this repo — a scheduled steward run, an interactive Claude session, a
human — follows these rules. STATUS.md holds the *content* (the ▶ NOW queue, the
reservoir, DONE); this file holds the *rules*. If the two disagree, this file wins
and fixing STATUS.md to match is itself a 1-pt item.

The shape in one paragraph: **▶ NOW** (top of STATUS.md `## NEXT`) is the only
priority order — a short list Kevin controls, worked strictly top-down. Everything
below it is the **reservoir**: context and future material, never a queue. **DONE**
is the append-only ship log. `docs/BACKLOG-ARCHIVE.md` is where drained material
moves — nothing is ever deleted.

## Item identity — stable IDs, never renumbered

- Every item has a **stable ID** it keeps for life: the historical series keep
  their meaning (`AUD-nn` audit, `LF-nn` live feedback, `VB-n` View Builder,
  `QA-nn`, `SWEEP<issue>-n`, `M<n>` milestones, `KH-###` Kevin-reported
  fleet-wide), and items born in the NOW queue mint the next **`N<n>`** — take
  the highest existing N-number + 1, even if lower numbers have shipped.
- **The number is identity, not rank.** Priority is the item's *position* in the
  NOW list. Reordering the list never touches an ID; an ID is never reused; a
  split keeps the parent ID with suffixes (`N5a`, `N5b`).

## The item line — one grammar, so humans and tooling parse the same thing

```
- **<ID> <stars> [<n>pt] — <title>.** <spec: what, why, constraints, how to verify>
```

- **Stars = priority class** (Kevin's dial, position is still the order):
  `★★★` drop-everything (rare, Kevin-set) · `★★` security/quality that goes next ·
  `★` normal · no star = filler/recurring.
- **Points = estimated slices.** 1 slice = one coherent PR = one run (observed:
  ~40 min–1 h of loop time). Scale: **1, 2, 3**. Anything bigger is an **epic**:
  it stays in the reservoir until someone splits it into ≤3-pt entries — epics
  never enter NOW whole.
- **State markers**, prepended to the line as the item moves:
  - *(none)* — ready: take it.
  - `⏳ PR #<n>` — claimed by an open PR. Skip it; don't collide.
  - `⛔` — blocked on a Kevin decision; the line states the exact question being
    asked. Never start a ⛔ item; never resolve one on Kevin's behalf.
  - `🔁` — recurring; never "done", worked only when nothing ready remains above it.
  - `~~struck~~ ✓ SHIPPED vNNN (date, actor — see DONE)` — shipped; grooming
    moves the carcass to the archive.

## The cycle every run follows

1. **Pick.** Read NOW top-down; take the **first ready item**. Skip ⏳/⛔; take 🔁
   only when nothing ready sits above it. Check open PRs first — an unmarked item
   with an open PR is claimed; mark it ⏳ when you open yours.
2. **Slice.** Do **one slice** (one PR), even on a multi-pt item. On a 2–3-pt
   item, ship the slice and rewrite the item in the same PR to say exactly what
   remains (or split it: `N9a` shipped, `N9b` remains).
3. **Ship = bookkeeping in the SAME PR.** A slice is not done until, in one PR:
   the code + its suite checks; the changelog entry (stamped); docs/Help if
   user-facing; the NOW item struck/updated; and a **DONE entry** in the standard
   form — `**<ID> — <title> (vNNN, sw vNNN, date, actor):** what shipped, why,
   how it was verified, **actual slices vs the estimate** (this calibrates future
   points — say "est 2pt, took 1" plainly).
4. **Blocked or ambiguous?** Park it: mark ⛔ with the precise question, or leave
   the PR open with the `hold` label and a written explanation. Do not guess on
   product decisions; do not merge unverified work.

## Grooming — keeping the queue true (its own small PR, docs-only)

Any run does a grooming pass **when NOW has fewer than 3 ready items** or **≥5
struck entries** are lingering. A grooming PR:
- moves struck entries to `docs/BACKLOG-ARCHIVE.md` (full text, verbatim), leaving
  NOW clean;
- **proposes the next batch** — 5–10 items pulled from the reservoir, each with the
  grammar line (ID, stars, points) and a one-line case — **as a `hold`-labeled PR
  for Kevin**. Direction is his call; the loop never promotes reservoir items into
  NOW on its own;
- re-checks stale estimates and ⏳ markers whose PRs closed;
- never renumbers, never deletes, never reorders NOW (order is Kevin's).

## Division of authority

- **Kevin**: the order of NOW, stars, ⛔ answers, approving proposed batches, and
  anything touching a product invariant (export byte-identity, data semantics,
  default behaviors). When he decides, the decision is written INTO the item
  (see N5a/N5b for the pattern: decision, rationale, implementation constraints,
  named suite checks) so any agent can execute it without re-asking.
- **Any dev run**: everything else above, mechanically.

## What this protocol deliberately does not do

No burndown ceremony, no separate tracker, no fields beyond stars/points/state —
the file IS the tracker, the PR history IS the audit trail, and the DONE entries'
est-vs-actual notes are the whole estimation feedback loop. Keep it that lean.
