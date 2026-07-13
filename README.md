# Analytics Dashboard Studio · analytics.polecat.live

A modern, interactive **visual builder for analytical dashboard applications**, built on a
**connections → datasets → dashboards** model. Add a connection to where your data lives, define
named parameterizable datasets on top of it, drop them on the canvas, choose a chart, tune it in
the inspector, watch the live preview — then **export** a fully self-contained `.html` dashboard
that runs anywhere.

> This repository is the standalone home of Dashboard Studio. The **Studio app lives at
> the repo root**; the legacy suite that seeded it is preserved under
> [`reference/`](reference/) and [`provisioning/`](provisioning/) for lineage.

```
┌──────────────┬───────────────────────────────┬───────────────┐
│ Query Library│         Live preview          │   Inspector   │
│ (datasets +  │  (the real dashboard, in an   │  panel /KPI / │
│  sample data)│   iframe — preview == export) │  dashboard)   │
└──────────────┴───────────────────────────────┴───────────────┘
```

## Run

The Studio loads JSON + the toolkit over HTTP, so serve the folder (don't open via `file://`):

```bash
./serve.sh            # → http://localhost:8000   (python3 -m http.server)
```

Open <http://localhost:8000/>. It boots on the **★ Cost & Sustainability** showcase.

## The data model

- **Adapters** (`app/sources/`) — one contract, two capability planes: `caps.data` (run dataset
  queries for dashboards) and `caps.meta` (host the app's own workspace catalog). Shipped adapters:
  Turso, Supabase, Firebase (both planes) and Snowflake, Databricks, BigQuery, DuckDB-Wasm remote
  files, SQLite over HTTP, generic SQL-over-HTTP (data plane). Adding a backend is one file +
  `Studio.registerSource`.
- **Connections** (rail section) — saved, credentialed instances of an adapter. Credentials stay in
  this browser; tests run inline; multi-select adapter pills + search.
- **Datasets** (rail section) — named queries on a connection (SQL for warehouses/files, a table for
  Supabase, a collection for Firestore) with `{{param}}` placeholders, defaults, tags and owner.
  Preview runs live through the adapter and learns the real column list. The Studio library pins a
  *Workspace datasets* group — drag one onto the canvas and it imports as a self-contained copy that
  stays **linked** for live runs (dashboard template variables flow into the parameters).
- **Workspace backend** (Settings card) — the whole catalog (connections/datasets/settings) is
  local-first and can mirror to Turso/Supabase/Firebase with automatic write-through, a Refresh
  pull, and optional **zero-knowledge secrets encryption** (credential values become AES-GCM
  ciphertext before they leave the browser).
- **Sample engine** — the bundled demo catalog and any plain-SQL source you author run on a
  deterministic in-browser fake database generated from each query's column aliases, so every
  dashboard demos offline with zero setup.

## What it produces

One **dashboard spec** (`.studio.json`, see `SPEC.md`) drives every output:

| Export | Files | Notes |
|--------|-------|-------|
| **Dashboard** | `<name>.html` | Fully self-contained — inlines the PDC (Polecat Data Charts) toolkit (`vendor/pdc-ui.*`), your spec, and sample data. This is exactly what the live preview shows. |
| **Bundle** | `.html` + `.studio.json` | The shippable page plus the editable spec, one click. |

## Layout

```
analytics.polecat.live/          ← the Studio app (served by GitHub Pages at the root)
├── index.html                   ← the app shell (rail: Home · Dashboards · Datasets · Connections · Studio)
├── app/
│   ├── studio.js                 ← controller (sections · library · canvas · inspector · export)
│   ├── studio.css                ← builder chrome (Polecat house theme + Classic/Fleet Modern)
│   ├── model.js                  ← chart registry + spec helpers (shared by exporters)
│   ├── studio-render.js          ← runs INSIDE preview/export: spec → PDC.* DOM
│   ├── exporters.js              ← spec → self-contained .html
│   ├── sampledata.js             ← offline sample-row generator (the demo "fake database")
│   └── sources/                  ← adapter layer: schema/contract · registry · workspace store ·
│                                    sync engine · crypto · local/turso/supabase/firebase +
│                                    data-adapters bridge (snowflake/databricks/bigquery/duckdb/…)
├── vendor/                       ← pdc-ui.css / pdc-ui.js (the toolkit, inlined into exports)
├── data/
│   ├── cda-catalog.json          ← the bundled sample-query library
│   └── examples/                 ← ★ flagship + example dashboards as openable specs
├── tools/                        ← changelog-normalize.js · export.js · gen-* asset generators
├── tests/                        ← Playwright end-to-end suite (~1400 checks, incl. a mock backend)
├── SPEC.md                       ← the dashboard-spec schema
├── CNAME                         ← analytics.polecat.live (GitHub Pages custom domain)
│
├── provisioning/                ← legacy data-layer assets (DDL · ETL · deploy scripts)
└── reference/                   ← the original suite the Studio derives from (historical)
```

## Publish (gated, on GitHub Pages)

It's a static site, and **this repo *is* the published site** — deployed to GitHub Pages by
`.github/workflows/deploy.yml` on every push to `main`; the committed `CNAME` wires the custom
domain **`analytics.polecat.live`**. Full runbook: **[PUBLISH.md](PUBLISH.md)**.

A **passcode gate** (configurable in `app/gate-config.js`) is on by default; put **Cloudflare
Access** in front for real SSO/email gating. First-run users get a **welcome tour** (reopen via
**ⓘ Tour**).

## Tests

```bash
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tests/run.js
# boots the app in Chromium, exercises every section + the adapter layer against a
# mock backend, validates exports — keep it green; every feature ships with checks
```

## Headless / CLI export

Generate the deployable `.html` from a `.studio.json` without the browser (reuses `app/exporters.js`):

```bash
./deploy.sh data/examples/studio-cost.studio.json                 # → dist/
./deploy.sh --all                                                 # every example → dist/
```

## Direct manipulation
- **Reorder (any row):** drag a panel by its header (⠿ grip); an insertion caret + cursor ghost show
  where it'll land — drop between any panels across rows, or past the end.
- **Resize:** drag a panel's right edge to change its column span (snaps 1 → … → full, live).
- **Rename:** double-click a panel title on the canvas to edit it in place.
- **Add:** drag a dataset or library query onto the canvas, or use the `+` chips.
- **Select/edit:** click any panel or KPI to open it in the inspector.
- **New ▾ → auto-build:** scaffold a full starter dashboard (KPIs + a chart per query) from any
  query set in one click, then tweak.

## Roadmap

See `STATUS.md` — headline items: dashboards catalog into the workspace store (so the remote
backend mirrors dashboards too), more adapters (Postgres, Redshift, Azure, MotherDuck, file drop,
Sheets), exported-runtime support for connection-bound datasets, and a schema browser per
connection.
