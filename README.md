# Analytics Dashboard Studio · analytics.polecat.live

A modern, interactive **visual builder for analytical dashboard applications**, built on a
**connections → datasets → dashboards** model. Add a connection to where your data lives, define
named parameterizable datasets on top of it, drop them on the canvas, choose a chart, tune it in
the inspector, watch the live preview — then **export** a fully self-contained `.html` dashboard
that runs anywhere.

> This repository is the standalone home of Dashboard Studio. The **Studio app lives at
> `/app/`** (the repo root itself serves a public marketing page); the legacy suite that
> seeded it is preserved under [`reference/`](reference/) and [`provisioning/`](provisioning/)
> for lineage.

```
┌──────────────┬───────────────────────────────┬───────────────┐
│  Data panel  │         Live preview          │   Inspector   │
│ (datasets +  │  (the real dashboard, in an   │  panel /KPI / │
│  queries)    │   iframe — preview == export) │  dashboard)   │
└──────────────┴───────────────────────────────┴───────────────┘
```

## Run

The Studio loads JSON + the toolkit over HTTP, so serve the folder (don't open via `file://`):

```bash
./serve.sh            # → http://localhost:8000   (python3 -m http.server)
```

Open <http://localhost:8000/app/>. It boots on the **★ Cost & Sustainability** showcase.

## The data model

- **Adapters** (`app/sources/`) — one contract, two capability planes: `caps.data` (run dataset
  queries for dashboards) and `caps.meta` (host the app's own workspace catalog). The Connections
  wizard offers every `caps.data` adapter, in the picker's own order — the three marked
  *(workspace-capable)* carry `caps.meta` too, so a whole workspace can live in them:
  **Turso** *(workspace-capable)*, **Supabase** *(workspace-capable)*, **Firebase**
  *(workspace-capable)*, **PostgreSQL (PostgREST)**, **CSV / JSON file**, **Google Sheets**,
  **Snowflake**, **Databricks**, **BigQuery**, **Amazon Redshift**, **DuckDB (remote file)**,
  **SQLite (remote .sqlite)** and **Generic SQL / HTTP** — thirteen in all.
  `Local (this browser)` is the fourteenth adapter and the default workspace store; it is
  `caps.data:false` on purpose, so it hosts the catalog but never appears in the wizard — a
  workspace store is not somewhere a dataset connects out to. Adding a backend is one file +
  `Studio.registerSource`.
- **Connections** (rail section) — saved, credentialed instances of an adapter. Credentials stay in
  this browser by default; a connected workspace backend mirrors them too (plaintext unless the
  optional zero-knowledge encryption below is on). Tests run inline; multi-select adapter pills + search.
- **Datasets** (rail section) — named queries on a connection (SQL for warehouses/files, a table for
  Supabase, a collection for Firestore) with `{{param}}` placeholders, defaults, tags and owner.
  Preview runs live through the adapter and learns the real column list. The builder's Data panel
  pins a *Workspace datasets* group — drag one onto the canvas and it imports as a self-contained copy that
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

| Export ▾ | Files | Notes |
|--------|-------|-------|
| **Dashboard (.html)** | `<name>.html` | Fully self-contained — inlines the DashKit (Polecat Data Charts) toolkit (`vendor/dashkit.*`), your spec, and sample data. This is exactly what the live preview shows. |
| **Excel workbook (.xlsx)** | `.xlsx` | A real multi-sheet workbook, built in the browser with no upload: tab 1 summarises the dashboard (KPIs, the View list, the filters), each following tab holds the backend data behind one data source. |
| **Word document (.docx)** | `.docx` | A real Word report: title and description, a KPIs table, a Views table, then a table of the data behind each source. |
| **PowerPoint (.pptx)** | `.pptx` | A title slide, a KPI slide, then one slide per View with its chart rasterized from the live preview. |
| **PDF (print)** | — | Asks for page size, orientation and scale, then opens the self-contained export and hands it to the browser's own print dialog. |
| **Editable spec (.studio.json)** | `.studio.json` | The spec alone (see `SPEC.md`) — layout, Views, KPIs, filters and dataset references, no toolkit and no baked rows; re-open it in the builder or feed it to `./deploy.sh`. |
| **All artifacts (bundle)** | `.html` + `.studio.json` | The shippable page plus the editable spec, one click. |

The viewer (`app/viewer.html`) carries a smaller Export menu of its own — **Dashboard (.html)**,
**PDF (print)** and **Editable spec (.json)**.

## Layout

```
analytics.polecat.live/          ← served by GitHub Pages at the root
├── index.html                   ← public marketing page (css/landing.css; no shell)
├── app/
│   ├── index.html                ← the app shell. The rail: Home · Views · Dashboards · Datasets ·
│   │                               Connections · Repository · Quick Views · View Builder ·
│   │                               Dashboard Builder · Jobs · Admin · Settings · Help
│   ├── studio.js                 ← controller (sections · Data panel · canvas · inspector · export)
│   ├── studio.css                ← builder chrome (Polecat house theme + Classic/Fleet Modern)
│   ├── model.js                  ← chart registry + spec helpers (shared by exporters)
│   ├── studio-render.js          ← runs INSIDE preview/export: spec → DashKit.* DOM
│   ├── exporters.js              ← spec → self-contained .html
│   ├── sampledata.js             ← offline sample-row generator (the demo "fake database")
│   └── sources/                  ← adapter layer: schema/contract · registry · workspace store ·
│                                    sync engine · crypto · local/turso/supabase/firebase +
│                                    data-adapters bridge (snowflake/databricks/bigquery/duckdb/…)
├── vendor/                       ← dashkit.css / dashkit.js (the toolkit, inlined into exports)
├── data/
│   ├── cda-catalog.json          ← the bundled sample-query library
│   └── examples/                 ← ★ flagship + example dashboards as openable specs
├── tools/                        ← changelog-normalize.js · export.js · gen-* asset generators
├── tests/                        ← Playwright end-to-end suite (~3,000 checks, incl. a mock backend)
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

A **sign-in gate** (`app/gate.js` over the `app/auth.js` user store — demo accounts `admin`/`admin`
and `demo`/`demo`, or your connected workspace's `users` table) is on by default; put **Cloudflare
Access** in front for real SSO/email gating. First-run users get a **welcome tour**; reopen it any
time from the ⌘K command palette → **Interactive tutorial**.

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
- **Add:** drag a dataset or a saved query out of the Data panel onto the canvas, or use the `+` chips.
- **Select/edit:** click any panel or KPI to open it in the inspector.
- **New ▾ → auto-build:** scaffold a full starter dashboard (KPIs + a chart per query) from any
  query set in one click, then tweak.

## Roadmap

See `STATUS.md` — it holds the whole queue (`docs/BACKLOG.md` is how that queue is operated).
The adapter roadmap the list above has not reached yet is the workspace-backend one: Settings →
Workspace backend offers Local, Turso, Supabase and Firebase today, with PostgreSQL, Cloudflare D1
and MongoDB Atlas shown as **Future**. Also open: exported-runtime support for connection-bound
datasets, and a schema browser per connection.

## License

Open source under the [GNU GPL v3](LICENSE) — use it, self-host it, fork it;
changes you distribute must stay GPL. Copyright and project stewardship remain
with Polecat.live (see [NOTICE](NOTICE), including the third-party carve-outs
for the vendored rendering toolkit).
