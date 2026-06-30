# PDC Analytics — Iteration v2 (full self-contained suite)

A continuing, loop-driven analytical-dashboard suite for **Pentaho Data Catalog** metadata. Each
`iteration/vN` is a **complete, self-contained, independently runnable suite** — the baseline dashboards
plus that iteration's additions — that deploys to its **own** server folder `/public/pdc-iteration/vN`, so
**v1 and v2 coexist and run side by side**. **v2 is a full copy of v1 (25 dashboards) + a depth theme** (trends,
drill-through, exec rollup, richer CDF). Every new iteration is a full copy+improvement of the previous.

Dashboards are **mind-blowing, Pentaho-branded** self-contained HTML over **CDA** (dependency-free vanilla-JS/SVG
toolkit), some via **CDF**, plus Pentaho-native **`.xanalyzer` / `.xdash`** on the existing Mondrian model —
with an **observability + data-management/data-integration** focus.

## What's here
```
iteration/
├── new-iteration.sh         ← seed the NEXT iteration: full copy vN → v(N+1), bump VERSION, re-stamp paths
└── v2/
    ├── VERSION              ← "v2" — drives every deploy path (/public/pdc-iteration/v2)
    ├── ITERATION-STATUS.md  ← READ FIRST. Resume anchor: DONE / IN-PROGRESS / NEXT + env facts + protocols.
    ├── README.md            ← this file
    ├── deploy.sh            ← publish this suite to /public/pdc-iteration/v2 (managed conn + dir + push + cache)
    ├── dash-build/          ← toolkit (pdc-ui.css/js), generators build.py + gen-home.py + gen-iteration-analyzers.py, per-dashboard JS in dash/
    └── content/             ← THE FULL DEPLOYABLE SUITE
        ├── dashboards/      ← 19 generated HTML + i-home launcher + lineage-explorer.html + per-dashboard .cda + baseline .xdash
        ├── analyzer/        ← Mondrian schema + .xanalyzer/.xdash content
        └── ddl/             ← full warehouse DDL tree (dimensions, facts, refresh, seeds)
```

## Build / deploy / test (quick reference)
```bash
# 1. build the full suite (reads v2/VERSION, stamps CDA paths to /public/pdc-iteration/v2)
python3 v2/dash-build/build.py
python3 v2/dash-build/gen-home.py          # regenerate the launcher after adding/removing dashboards

# 2. deploy this iteration to its own server folder (default localhost:8080 admin password)
./v2/deploy.sh                              # or: ./v2/deploy.sh <server> <user> <pass>

# 3. verify a CDA query
curl -u admin:password 'http://localhost:8080/pentaho/plugin/cda/api/doQuery' \
  -G --data-urlencode path=/public/pdc-iteration/v2/i-data-integration.cda \
  --data-urlencode dataAccessId=kpi --data-urlencode outputType=json

# launcher: http://localhost:8080/pentaho/api/repos/:public:pdc-iteration:v2:i-home.html/content
```

## Adding a dashboard
1. Write `dash-build/dash/<name>.js` (reuse the `PDC.*` toolkit — kpis, bars, line/area, donut, gauge, heatmap,
   treemap, scatter, table, filters, theme toggle, provenance captions).
2. Add a row to `build.py` `DASHBOARDS` (`out_html, title, sub, cda_file, body_js, group`) and a card to
   `gen-home.py` `GROUPS`. Drop the `<name>.cda` into `content/dashboards/`.
3. `python3 build.py && python3 gen-home.py && ./deploy.sh`. Validate the CDA in `psql`/doQuery, render-test with Playwright.

## Starting the next iteration
```bash
cd iteration && ./new-iteration.sh     # copies v2 → v3 (full suite), bumps VERSION to v3, re-stamps to /public/pdc-iteration/v3
```
Then improve v2 in place and `./v2/deploy.sh`.

## Dashboards in iteration v2 (37)
**Executive:** Unified Executive Scorecard (one-board domain rollup, trends, drill-through) · **Executive Scorecard (CDF)** — true CDF twin (CCC).
**Observability:** Estate Command Center · Pipeline & Job Observability · Data Freshness & Staleness ·
Data Quality & Metadata Completeness · Column Profiling & Statistics · Catalog Growth & Discovery · Document & Unstructured Insights ·
**Catalog Observability (CDF)** + **Observability Command Center (CDF)** — true Pentaho CDF dashboards (CCC over CDA).
**Governance & Privacy:** Sensitive Data & Compliance Radar · Policy & Governance Coverage · **Policy & Governance Coverage (CDF)** — Framework twin · Sensitive Data & Privacy · Catalog Adoption · **Sensitive Data Domains** (glossary domain × sensitivity risk map) · **Sensitive Data Domains (CDF)** — Framework twin.
**Storage & Cost:** Storage Footprint & Capacity · Cost Optimization & Sustainability · Redundancy & Duplicate Data.
**Usage & People:** Application & Access Reach · Ownership & Stewardship Gaps · Business Glossary & Term Reach · **Glossary Hierarchy & Term Stewardship** (defined-vs-used adoption gap) · **Term Stewardship (CDF)** — Framework twin.
**Data Integration & Lineage:** Data Integration Health · Schema & Structure Explorer · **Column Health & Key Discovery** (key-candidate detection, dead/constant columns) · **Column Health (CDF)** — Framework twin · Interactive Lineage Explorer ·
**Data Movement Observability (CDF)** — 2nd *true* CDF dashboard (lineage throughput + pipeline reliability).
**Pentaho-native (built, deploy pending an Analyzer-enabled server):** 6 `.xanalyzer` + `i1-catalog-overview.xdash` on Mondrian cube `01. Data Asset Analysis`.

## Design language
Pentaho/Hitachi blue `#005bb5` + purple `#7d3c98` (from `pentaho-ops-console`), light/dark toggle,
dependency-free vanilla SVG charts, cascading filters (data-source + time-range), and a faint provenance
caption on every panel naming the source Pentaho object. Data model, branding, credentials, the managed-JDBC
requirement and the storage-demo caveat are documented in `ITERATION-STATUS.md`.
