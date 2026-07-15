# analytics.polecat.live — agent guide

Analytics Dashboard Studio: a local-first, in-browser analytics workspace and
visual dashboard builder (~22.6K LOC vanilla HTML/JS/CSS, no build step, no
framework, no runtime deps) deployed from the repo ROOT via GitHub Pages.
**STATUS.md is the product playbook** — read its protocol + GOAL blocks first,
work the NEXT backlog (★ items first). For how work ships fleet-wide, read
`kevinrhaas/polecat-platform` → docs/FLEET-GUIDE.md (this app's migration row
is docs/MIGRATION.md #6 — assigned to a dedicated session; scheduled steward
runs skip this app).

## How work ships (the platform process)

- Branch `steward/<topic>` off latest main → ONE coherent unit of work → PR →
  **merge your own PR when green. Never push to main directly.** Merge is ship:
  `deploy.yml` publishes on merge. Never hard-gate deploy on CI — a hard
  `needs: test` gate once froze the live site ~21 hours (STATUS.md "CI /
  deploy"). Guard main (`.github/workflows/auto-revert.yml`) self-heals a
  broken main; the platform janitor re-tests and merges green `steward/*` PRs
  every 2h as a backstop. Park work for Kevin ONLY via the `hold` label plus a
  written explanation on the PR.
- **The changelog contract is sacred.** `js/changelog.js` is fleet-format,
  literal style, parsed live by Manager and the polecat.live launcher. Prepend
  ONE entry with `ts: ''` at the TOP, then run `node tools/changelog-normalize.js`
  to stamp + canonicalize it YOURSELF before merging — nothing stamps after
  merge. `node tools/changelog-check.js` verifies with the manager's exact
  parser without writing (Guard main runs it).
- **Tests green before merge**: `NODE_PATH=$(npm root -g) node tests/run.js`
  (Playwright; global install, Chromium under `/opt/pw-browsers/`). Add a
  check per feature; **never weaken assertions to pass.** Zero pageerrors at
  390×780 AND desktop, both theme modes; mobile is a release gate; dashboard
  tiles/KPIs link to their detail.
- Update STATUS.md (DONE/NEXT) in the same PR as the work, and keep
  `docs/index.html` (in-app Help) current in the same slice as any
  user-facing feature change.
- No model identifiers in repo artifacts. One unit of high-quality work per
  run.

## Studio invariants (do not break)

- **`vendor/pdc-ui.js` stays pristine** — chart types/extensions live in
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
index.html          The app shell (repo root IS the site)
app/                Studio modules: model.js → studio-render.js ↔ studio.js
                    → exporters.js; sources/ = DataSource adapters (schema.js
                    is the contract); studio-charts.js = chart extensions
js/changelog.js     Fleet-format changelog (see contract above)
vendor/             pdc-ui.js toolkit mirror (pristine) + polecat-shell/ (read-only)
tests/run.js        The Playwright suite (~1,400 checks) — the merge gate
tools/              changelog-normalize/check, export.js CLI, lib.js
docs/index.html     User-facing Help (update in the same slice as features)
provisioning/ reference/   Frozen inputs — do not touch
.github/workflows/  deploy (soft test, never gated), auto-revert (Guard main),
                    claude (@claude mentions)
```
