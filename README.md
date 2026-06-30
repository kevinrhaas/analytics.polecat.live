# Dashboard Studio · analytics.polecat.live

A modern, interactive **visual builder for Pentaho CDE & CDF dashboards** over your existing
**CDA** queries. Pick a query from the library, drop it on the canvas, choose a chart, tune it in
the inspector, watch the live preview — then **export** deployable artifacts that drop straight
into the Pentaho Data Catalog analytics suite.

It replaces the hand-coded `reference/dash-build` generators (`build.py` / `gen-cde.py`) with a
**single visual model** and a live, byte-faithful preview.

> This repository is the standalone home of Dashboard Studio (migrated out of
> `solution-engineering`). The **Studio app lives at the repo root**; the original
> Pentaho iteration-v2 suite that seeded it is preserved under
> [`reference/`](reference/) (dashboards, analyzer reports, the legacy `dash-build`
> generators) and [`provisioning/`](provisioning/) (warehouse DDL, ETL jobs, deploy
> scripts).

```
┌──────────────┬───────────────────────────────┬───────────────┐
│ Query Library│         Live preview          │   Inspector   │
│  (CDA data   │  (the real dashboard, in an   │  panel /KPI / │
│   accesses)  │   iframe — preview == export) │  dashboard)   │
└──────────────┴───────────────────────────────┴───────────────┘
```

## Run

The Studio loads JSON + the toolkit over HTTP, so serve the folder (don't open via `file://`):

```bash
./serve.sh            # → http://localhost:8000   (python3 -m http.server)
```

Open <http://localhost:8000/>. It boots on the **★ Cost & Sustainability** showcase.

## What it produces

One **dashboard spec** (`.studio.json`, see `SPEC.md`) drives every output:

| Export | Files | Notes |
|--------|-------|-------|
| **CDF dashboard** | `<name>.html` | Self-contained — inlines the `PDC` toolkit (`vendor/pdc-ui.*`) + your spec; reads live data via CDA `doQuery` on the server. This is what the live preview shows. |
| **CDE editor files** | `<name>.cdfde` + `<name>.wcdf` | Opens & is editable in Pentaho **CDE**; CCC components over the external `.cda`. |
| **CDA queries** | `<name>.cda` | The data layer (connection + SQL data accesses). |
| **Bundle** | all of the above + `.studio.json` | One click. |

CDF is the richer track (treemap, gauge, heatmap, KPIs, info tooltips, theme toggle, query
inspector). CDE export covers the chart types CCC supports (bar / pie / line / stacked); CDF-only
panels are flagged in the inspector and omitted from the `.cdfde` (they remain in the `.html`).

## Pentaho server connections

**⚙ Servers** manages connections to live Pentaho servers, defined in the **Kettle `<slaveserver>`
format** (import/export `.xml`; multiple connections; saved locally). With an active connection you can:
- **Import sources** — browse the repository and pull existing **CDA** queries into the library.
- **Live preview** — the preview reads real data via the CDA `doQuery` API (toggle ◴/● Live).
- **Push** (Export ▸ *Push to active server*) — publish the dashboard's `.cda/.html/.cdfde/.wcdf`
  to the repository via the Pentaho import API.

Live calls use the standard Pentaho REST APIs and the connection's auth; they need the server
reachable — same-origin cookie session, or CORS + the connection's credentials. **With no
connection the app is fully functional standalone** (offline sample data + file export / `deploy.sh`).

### Live testing against a local Pentaho (no CORS)

Run the dev proxy — it serves the Studio *and* forwards `/pentaho/*` to your server, so the browser
talks to one origin (cookie auth, no CORS, and the preview iframe inherits that origin):

```bash
node tools/proxy.js http://localhost:8080 8000   # your Pentaho, then this port
# open http://localhost:8000 ; in ⚙ Servers add hostname=localhost port=8000 webAppName=pentaho
```

## Publish & schedule (CLI)

Publish artifacts to a server, one-shot or on a schedule. `--dry-run` prints exactly what it will
send (no network) so you can verify before going live.

```bash
# one-shot publish (build + push every example, or a single spec)
node tools/push.js --all  --server http://localhost:8080/pentaho --user admin --password password
node tools/push.js --spec data/examples/studio-cost.studio.json --server $PENTAHO_URL --dry-run
node tools/push.js --all  --kettle slaveservers.xml --connection "Prod BA"     # reuse a saved connection

# scheduled deploy — keep running, re-publish every N minutes
node tools/push.js --all --interval 30 --server http://localhost:8080/pentaho --user admin --password password
# …or via system cron (publishing is a deploy step, so it lives outside Pentaho):
#   */30 * * * *  cd /path/to/repo && node tools/push.js --all --server $PENTAHO_URL >> push.log 2>&1
```

To schedule **content to run/email on the server** (Pentaho's own scheduler, not a deploy):

```bash
node tools/schedule-job.js --input /public/pdc-iteration/v2/report.prpt --cron "0 0 6 * * ?" \
  --name "Daily refresh" --server http://localhost:8080/pentaho --user admin --password password --dry-run
```

## How preview data works

- **Offline (default):** the preview generates deterministic sample rows from each query's *actual
  bound columns* (`app/sampledata.js`) — charts always render, columns always match.
- **Live (optional):** the *deploy/live settings* dialog (◴ button) points the preview at a real
  Pentaho server (`doQuery`). Exported dashboards **always** use live data on the server regardless.

## Layout

```
analytics.polecat.live/          ← the Studio app (served by GitHub Pages at the root)
├── index.html                   ← the app shell
├── app/
│   ├── studio.js                 ← controller (library · canvas · inspector · export)
│   ├── studio.css                ← builder chrome
│   ├── model.js                  ← chart registry + spec helpers (shared by exporters)
│   ├── studio-render.js          ← runs INSIDE preview/export: spec → PDC.* DOM
│   ├── exporters.js              ← spec → .cda / .cdfde+.wcdf / .html
│   └── sampledata.js             ← offline sample-row generator
├── vendor/                       ← pdc-ui.css / pdc-ui.js (the v2 toolkit, inlined into exports)
├── data/
│   ├── cda-catalog.json          ← all 67 v2 CDAs (the query library)
│   └── examples/                 ← ★ flagship + 16 v2 CDE boards as openable specs
├── tools/import-v2.py            ← regenerate the catalog + examples from reference/dashboards
├── tests/                        ← Playwright end-to-end + export checks
├── SPEC.md                       ← the dashboard-spec schema
├── CNAME                         ← analytics.polecat.live (GitHub Pages custom domain)
│
├── provisioning/                ← stand up the data layer the dashboards read from
│   ├── ddl/                      ← warehouse DDL (dimensions · facts · refresh · seeds)
│   ├── etl/                      ← Kettle jobs/transforms (lineage loaders, variable managers)
│   └── deploy/                   ← deploy.sh · deploy-db.sh · deploy-https.sh · VERSION
│
└── reference/                   ← the original Pentaho iteration-v2 suite (assets the Studio derives from)
    ├── dashboards/               ← generated HTML + .cda + .xdash + .cdfde/.wcdf + thumbs
    ├── analyzer/                 ← .xanalyzer reports + Mondrian schema
    └── dash-build/               ← legacy generators (build.py / gen-cde.py) + pdc-ui toolkit
```

## Publish (gated, on GitHub Pages)

It's a static site, and **this repo *is* the published site** — GitHub Pages serves the repo root
directly. Enable **Settings → Pages → Deploy from a branch → `main` / root**; the committed `CNAME`
wires the custom domain **`analytics.polecat.live`** (add the matching DNS record at your registrar).
Full runbook: **[PUBLISH.md](PUBLISH.md)**.

A **passcode gate** (default
`pentaho-studio`, configurable in `app/gate-config.js`) is on by default; put **Cloudflare Access**
in front for real SSO/email gating. First-run users get a **welcome tour** (reopen via **ⓘ Tour**)
framing it as an analytics.polecat.live project.

## Tests

```bash
npm --prefix tests install      # once (Playwright)
./serve.sh &                    # serve on :8000
node tests/run.js               # boots the app, round-trips an example, validates exports
```

## Headless / CLI export

Generate deployable artifacts from a `.studio.json` without the browser (reuses `app/exporters.js`):

```bash
./deploy.sh data/examples/studio-cost.studio.json                 # → dist/
./deploy.sh data/examples/studio-cost.studio.json out /public/pdc-iteration/v2
./deploy.sh --all                                                 # every example → dist/
```

## Direct manipulation
- **Reorder (any row):** drag a panel by its header (⠿ grip); an insertion caret + cursor ghost show
  where it'll land — drop between any panels across rows, or past the end.
- **Resize:** drag a panel's right edge to change its column span (snaps 1 → … → full, live).
- **Rename:** double-click a panel title on the canvas to edit it in place.
- **Add:** drag a query from the library onto the canvas, or use the `+` chips.
- **Select/edit:** click any panel or KPI to open it in the inspector.
- **New ▾ → auto-build:** scaffold a full starter dashboard (KPIs + a chart per query) from any CDA
  query set in one click, then tweak.

## Roadmap
- Live two-way sync with a running CDA builder (queries are read-only inputs today).
- More CCC mappings for CDE (treemap/scatter/heatmap) as the components allow.
- Drag panels across rows freely (today: reorder by sequence + resize by span).
