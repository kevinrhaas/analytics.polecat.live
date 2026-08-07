# The promotion pipeline on analytics — dev → stage → main (prod)

Analytics is **rollout #2** of the fleet's staged-delivery pipeline. The
**canonical runbook is `kevinrhaas/jobtracker.polecat.live` →
`docs/PIPELINE.md`** (the pilot); this page records only what's different
here. The precondition was **AUD-04** (v834): previews share the production
origin's localStorage, so an older build adopting over a newer build's data
had to become safe first — it is now (`replaceAll` preserves unknown tables).

## Analytics deltas from the pilot

- **Stage assembly is a base-href swap** (`tools/stage-preview.mjs`):
  `app/index.html` + `app/viewer.html` anchor everything to `<base href="/"/>`
  — re-pointing that one tag at `/stage/` or `/dev/` re-roots the whole app,
  including the (relative) service-worker registration, which lands on the
  stage's own self-unregistering stub with the stage's own scope. Marketing +
  docs pages are relative-linked and just work. The artifact also gains a
  generated `robots.txt` (the repo ships none) disallowing the previews.
- **The gates**:
  - *Dev gate* (`ci.yml`, on PRs into dev + pushes to dev): `tools/validate.mjs`
    (the Guard-main syntax sweep, extracted) + `tools/changelog-check.js` +
    **`tools/dev-smoke.mjs`** — a fast boot smoke (marketing, app past the
    gate, docs; desktop + 390px; zero pageerrors). This is the "area test".
  - *Stage gate* (`promote-to-stage.yml`): the **FULL `tests/run.js` suite**
    (~2,900 checks) on the stage tree, **then** the staged `/stage/` form is
    assembled and boot-smoked (`SMOKE_PREFIX=/stage`), so staging bugs are
    caught too. Red → stage rolls back automatically + an issue is filed.
- **No `/v/` archive**: prod promotion tags `release-vNNN` (from
  `js/changelog.js` `LATEST_VERSION`) as the rollback anchor;
  `rollback-prod.yml` is `git revert -m 1` of the promotion merge — main is
  never force-pushed.
- **Schedule**: `.github/pipeline.json` — daily at **07:00Z (~2am Central)**,
  pausable, editable by direct commit or from Manager's Pipeline view.
- **Doctrine unchanged**: deploy is never gated (`deploy.yml`'s test job stays
  the soft signal; the ~21h-freeze rule stands — see STATUS.md "CI / deploy").
  Hotfixes still PR straight into main; the next promotion back-merges them
  into dev. The changelog contract is unchanged: stamp with
  `tools/changelog-normalize.js` **before merging to dev** — nothing stamps
  later in the pipeline.

## How work ships now

Feature work: branch off **dev** → PR **into dev** → dev gate green → merge.
That *stages* it at `/dev/`. Promotion to `/stage/` happens on command (Manager's
Pipeline view / workflow dispatch) or on the overnight schedule, under the
full suite. Production ships **only** on an explicit `promote-to-prod`
dispatch. Manager's Pipeline section picks this repo up automatically (it
probes for `.github/pipeline.json`).

## Activation

Merging the adoption PR activates nothing. To go live: dispatch
**`pipeline-setup.yml`** (creates `dev` + `stage` from main, publishes the first
previews), verify `/`, `/stage/`, `/dev/`, then dispatch **`promote-to-stage.yml`**
once and watch it run the full suite end-to-end.
