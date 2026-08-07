# analytics.polecat.live — agent guide

Analytics Dashboard Studio: a local-first, in-browser analytics workspace and
visual dashboard builder (~56K LOC vanilla HTML/JS/CSS, no build step, no
framework, no runtime deps) deployed from the repo ROOT via GitHub Pages.
(That LOC figure is first-party source — `app/ css/ tools/ index.html sw.js
docs/index.html` — excluding `vendor/`, the test suite and `js/changelog.js`;
`node tools/doc-truth.mjs` re-measures it and fails if this line drifts.)
**STATUS.md is the product playbook** — read its protocol + GOAL blocks first,
work the NEXT backlog (★ items first). For how work ships fleet-wide, read
`kevinrhaas/polecat-platform` → docs/FLEET-GUIDE.md. Scheduled steward improve
runs are ON for this app (the platform's focus.json lane, since 2026-08-07) —
they branch from dev and PR into dev per the pipeline rules below.

## How work ships (the promotion pipeline — read docs/PIPELINE.md)

- **This repo is on the dev → stage → main pipeline** (rollout #2 of the
  jobtracker pilot; that repo's docs/PIPELINE.md is the canonical runbook).
  Branch `steward/<topic>` off latest **dev** → ONE coherent unit of work →
  PR **into dev** → merge when the dev gate is green (`ci.yml`: validate +
  changelog-check + `tools/dev-smoke.mjs`). **Merge-to-dev is STAGE, not
  ship** — it publishes only the `/dev/` preview. `promote-to-stage.yml` (on
  command, or nightly at 07:00Z per `.github/pipeline.json`) moves dev→stage
  under the FULL `tests/run.js` suite + a staged-form boot smoke, rolling stage
  back on red; `promote-to-prod.yml` (dispatch-only) ships stage→main with a
  `release-vNNN` tag. **Hotfix exception:** a production emergency still PRs
  straight into main — deploy stays ungated, Guard main watches, and the next
  promotion back-merges the fix into dev. Never hard-gate deploy on CI — a
  hard `needs: test` gate once froze the live site ~21 hours (STATUS.md "CI /
  deploy"); the stage gate is fine because it gates an integration branch, never
  the deploy. Park work for Kevin ONLY via the `hold` label plus a written
  explanation on the PR. Stamp the changelog BEFORE merging to dev — nothing
  stamps later in the pipeline.
- **The changelog contract is sacred.** `js/changelog.js` is fleet-format,
  literal style, parsed live by Manager and the polecat.live launcher. Prepend
  ONE entry with `ts: ''` at the TOP, then run `node tools/changelog-normalize.js`
  to stamp + canonicalize it YOURSELF before merging — nothing stamps after
  merge. `node tools/changelog-check.js` verifies with the manager's exact
  parser without writing (Guard main runs it).
- **Tests green before merge**: `NODE_PATH=$(npm root -g) node tests/run.js`
  (Playwright; global install, Chromium under `/opt/pw-browsers/`). Add a
  check per feature; **never weaken assertions to pass.** Zero pageerrors at
  **390×780** AND desktop, both theme modes; mobile is a release gate; dashboard
  tiles/KPIs link to their detail. 390×780 is THE mobile gate (the fleet's
  narrow-phone baseline, what `tools/dev-smoke.mjs` runs); the full suite also
  exercises 390×844 as a taller phone — extra coverage, not a second standard.
- Update STATUS.md (DONE/NEXT) in the same PR as the work, and keep
  `docs/index.html` (in-app Help) current in the same slice as any
  user-facing feature change.
- No model identifiers in repo artifacts. One unit of high-quality work per
  run.

## Studio invariants (do not break)

- **`vendor/dashkit.js` stays pristine** — chart types/extensions live in
  `app/studio-charts.js` only.
- **The exported `.html` dashboard stays byte-identical to the live preview**
  (the preview iframe and the export inline the same toolkit; builder ↔ iframe
  talk via postMessage).
- `provisioning/` and `reference/` stay untouched unless a task explicitly
  requires them.
- **Local-first**: workspace data lives in localStorage with additive
  migrations — never wipe or break existing user data.
- **Bump the `sw.js` CACHE name** in the same commit as any change to
  precached files (and any shell adoption).
- **`vendor/polecat-shell/` is READ-ONLY** — a verbatim copy of
  `kevinrhaas/polecat-platform` `lib/` (the test suite sha256-verifies every
  file against MANIFEST.json; fleet sweeps drift-check it too). Changes belong
  in the platform repo (bump `lib/VERSION` + run `scripts/gen-manifest.mjs`
  there) and arrive via `chore: polecat-shell vX.Y.Z` sync PRs. App-side
  skinning lives in this repo's own CSS: the shell-token bridge at the top of
  `app/studio.css` maps the canonical shell tokens onto Studio values, and
  `data-palette` mirrors `data-app-theme` (historical `studio-theme` /
  `studio-app-theme` storage keys, stamped by gate.js + setAppTheme).

## Layout

```
index.html          The PUBLIC MARKETING page (root; css/landing.css; no shell)
app/index.html      The APP (at /app/, with <base href="/"> so historical
                    relative paths still resolve from the repo root)
app/                Studio modules: model.js → studio-render.js ↔ studio.js
                    → exporters.js; sources/ = DataSource adapters (schema.js
                    is the contract); studio-charts.js = chart extensions
js/changelog.js     Fleet-format changelog (see contract above)
vendor/             dashkit.js toolkit mirror (pristine) + polecat-shell/ (read-only)
tests/run.js        The Playwright suite (~3,000 checks) — the stage gate
tools/              changelog-normalize/check, validate + dev-smoke + doc-truth
                    (the dev gate), export.js CLI, lib.js
docs/index.html     User-facing Help (update in the same slice as features)
provisioning/ reference/   Frozen inputs — do not touch
.github/workflows/  ci (the dev gate), promote-to-stage / promote-to-prod /
                    rollback-prod / pipeline-setup (the promotion pipeline),
                    deploy (soft test, never gated), auto-revert (Guard main),
                    supabase-provision, claude (@claude mentions)
```
