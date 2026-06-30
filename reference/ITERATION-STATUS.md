# Iteration v2 — STATUS (resume anchor)

> ☁️ **CLOUD / SERVER MIGRATION (user, 2026-06-26): the loop is moving to a cloud Claude Code session.** The deploy/render target is now the
> **public HTTPS Pentaho** `https://server.pentaho.space/pentaho` (user `admin`; password supplied in the loop prompt — NOT committed here). It is reachable from
> a cloud session (unlike localhost:8080 / VPN-gated 10.80.230.193). **Validated 2026-06-26:** PDC-BIDB-EXT JNDI connection exists → `bidb_ext_dev` Postgres and
> returns live data (doQuery rows OK); full suite + 68 thumbnails deployed (all HTTP 200); i-data-flows rendered 6 cards / 11 info dots / node-detail drawer / 0
> page errors. **DEPLOY in the cloud:** `./iteration/v2/deploy-https.sh https://server.pentaho.space/pentaho admin '<password>'` (self-contained https importer;
> `deploy.sh` is http-only + lives in the user's uncommitted tree, so use deploy-https.sh on the cloud). **RENDER-TEST in the cloud:** point Playwright at
> `https://server.pentaho.space/pentaho/...`; auth by POSTing `j_spring_security_check` (j_username/j_password) for a session cookie, OR basic-auth on the
> `/api/...` + `/plugin/cda/...` endpoints. ✅ **PUBLIC SHOWCASE REFRESH IS NOW CLOUD-WIRED (2026-06-27, run #4).** `analytics-pentaho-space/build/shots.js` was
> ported to the cloud-proxy recipe (routes every request through Playwright's proxy-aware `request` ctx + rewrites `http://`→https so CDF twins clear mixed-content;
> chrome at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; password via `PENTAHO_PASS` env, NOT committed). **Refresh each run with:**
> `cd analytics-pentaho-space && PENTAHO_PASS='<pw>' ./update-site.sh https://server.pentaho.space/pentaho` — it shoots all 51 boards (Custom + CDF) against the cloud
> server, regenerates `index.html` (gen_site.py), and publishes branch + `HEAD:main` (GitHub Pages serves main; binary-screenshot conflicts auto-resolve `--ours`).
> First successful cloud refresh: 51/51 shot, 0 failed, live on analytics.pentaho.space. The solution-engineering end-of-run flow (branch `claude/pdc-analytics-loop-ivozws`
> + merge → main) is unchanged.

> **LOOP RESUME PROTOCOL:** A hourly loop builds this. On each run, read THIS file first,
> then continue from the **NEXT** section (top item first). Update DONE/IN-PROGRESS/NEXT as you
> go and commit, so the following run resumes cleanly even if the previous one ran out of tokens.
> ⭐ **CADENCE (user, 2026-06-24): TARGET ~10 deliverables per run** (bumped from ~5 → ~10; "we have lots of room to spare"; was ~2,
> originally 1). Fully build + validate (doQuery) + Playwright render-test + commit/push EACH deliverable, then do the end-of-run
> showcase refresh ONCE at the very end. **Batch for efficiency** to hit ~10 within one context window: prefer many small/medium
> self-contained items (filters, twins, CDE boards, viz reuses, polish) over a few giant ones; commit per item so progress survives.
> **Quality bar is non-negotiable** — every item still gets the full build+validate+render+commit. If context genuinely runs low before
> ~10, STOP cleanly and leave STATUS pointing at the exact next step (a partial run of well-tested items beats sloppy ones).
> (The per-fire prompt says "EXACTLY ONE deliverable"; this STATUS note OVERRIDES it to ~10.)
> 🖥️ **ENVIRONMENT (user, 2026-06-24): localhost-only for now.** Keep building + testing against `http://localhost:8080`. 193 deploy
> is optional/opportunistic (VPN-gated). A public always-on test server is planned later — when it exists, point render-tests there.
> When NEXT is empty, seed the next iteration: `cd iteration && ./new-iteration.sh` (full copy of
> the latest vN → v(N+1), VERSION bumped, suite re-stamped to the new deploy path) and start a fresh STATUS there.

> **FULL-SUITE-PER-ITERATION MODEL (current):** Each `iteration/vN` is a COMPLETE, self-contained,
> independently runnable/deployable suite — baseline dashboards + that iteration's additions, all under
> `vN/content/`. Each new iteration is a full copy+improvement of the previous. v1 deploys to its OWN
> server folder `/public/pdc-iteration/v1`; v2 → `/public/pdc-iteration/v2`, etc., so versions coexist.
> - Build the suite: `python3 vN/dash-build/build.py && python3 vN/dash-build/gen-home.py`
>   (both read `vN/VERSION`, stamp every dashboard's CDA path to `/public/pdc-iteration/vN`, output to `vN/content/dashboards`).
> - Deploy: `./vN/deploy.sh [server] [user] [pass]` (default `localhost:8080 admin password`) — ensures the
>   managed connection, creates the repo folder, publishes `content/dashboards`, clears CDA cache.
> - Add a dashboard: drop `dash/<name>.js`, add a row to `build.py` DASHBOARDS + a card to `gen-home.py` GROUPS, rebuild.

Iteration: **v2** · Started 2026-06-21 · Full copy of v1 (25 dashboards) + v2 theme. Deploys to its OWN folder `/public/pdc-iteration/v2` (coexists with v1).

> **v2 THEME — depth over breadth.** v1 reached broad coverage (25 dashboards). v2 builds UP: time-series/trend
> depth, cross-dashboard drill-through, a unified executive scorecard, and richer CDF/CDE. Enhance the inherited
> v1 dashboards in place and add a few high-impact new ones. Same full-suite model: `content/` is the deployable
> suite; build with `dash-build/build.py` + `gen-home.py` (stamped to `/public/pdc-iteration/v2`); deploy with `./deploy.sh`.

> ⭐⭐ **STANDING DIRECTIVES (user, 2026-06-22) — apply EVERY run, in addition to the one-deliverable scope:**
> 1. **End of every run: refresh `analytics.pentaho.space`** with the current dashboards AND periodic design/feature
>    improvements framed around **business benefits** (not just screenshots). `…/analytics-pentaho-space/update-site.sh`.
>    ⚠ **RECONCILE the showcase list every run (2026-06-24):** `analytics-pentaho-space/build/dashboards.json` is HAND-CURATED and
>    DOES NOT auto-grow with the suite — it silently drifted to 38 while the deployed suite had 51 HTML/CDF (+13 CDE = 64), losing
>    lineage-explorer + 12 others. **Each run, diff dashboards.json stems against gen-home's HTML/CDF stems** (CDE boards stay OFF the
>    showcase by convention) and add any missing dashboard (next to its twin, with blurb + per-card `value`). Quick check:
>    `python3` compare `re.findall(...,'html')` in gen-home.py vs the json `stem`s. The showcase should always == the deployed HTML/CDF count.
> 2. **Keep the home page (i-home launcher) updated** — regenerate `gen-home.py` whenever dashboards/filters/counts change.
> 3. **Improve page navigation; keep the menu/header bars CONSISTENT across all pages** (same header, All-dashboards link,
>    Custom⇄Framework toggle placement, filterbar style). Converge any drift.
> 4. **Keep adding more selection filters** (secondary/cross filters) across dashboards.
> 5. **Add more interactivity & fun** where the data allows (drill, hover, light/dark, animation-tasteful). **It's OK if the
>    HTML (Custom) versions LEAD the CDF versions.** HTML-driven-by-data is TOP priority and is excellent on its own.
> 6. **Keep a subset of the best ones CDE-editor-friendly** (true .wcdf/.cdfde via gen-cde.py external-CDA) — but NOT at the
>    cost of overall awesomeness. CDF "Framework" showability is **essential** (every Custom has a CDF twin); CDE is a
>    valued bonus for the strongest boards.
> 7. **EVERY run (user, 2026-06-24): after successful localhost testing + commit/push, ATTEMPT a 193 deploy**
>    (`./deploy.sh 10.80.230.193:80 admin password`; PDC-BIDB-EXT pre-provisioned, schema `bidb_ext_dev`). **If the VPN is down /
>    193 unreachable, DO NOT block — note it and just retry on the next run.** (193 deploy is best-effort and non-fatal; localhost
>    is the source of truth.) Quick reachability check before deploying, e.g. `curl -s -m5 http://10.80.230.193/pentaho/api/repos/...`.
> 8. **Use cool/"sexy" visualizations & tasteful animation (user, 2026-06-22).** Go beyond bars/pies/lines where the data
>    earns it: **Sankey** flow diagrams (lineage data movement orig→dest by `bytes_moved`/`connection_count`; sensitivity→
>    governance flows), chord/network/force graphs, treemaps, animated transitions on load/filter, hover highlights,
>    gauges, sparklines, heat strips. **Best candidates first:** lineage/data-integration/compliance (flows), storage/cost
>    (treemap), pipeline-obs (status flow). HTML (Classic) builds can LEAD with the fancy viz (D3/SVG, self-contained);
>    mirror into the CDF twin where CCC supports it (CCC has no Sankey → keep the Sankey on the Classic side, give the CDF
>    twin its best CCC equivalent). Keep it tasteful + fast; data-driven, not gratuitous.
> 9. **Continuously observe & record ideas (user, 2026-06-22).** As you work, jot improvements/recommendations/tech-debt you
>    notice into the **IDEAS & RECOMMENDATIONS** backlog below (newest on top). Promote the best into NEXT when ripe. Don't
>    be shy — small UX nits, data angles, refactors, and "wouldn't it be cool if…" all belong there.
> 10. **Every dashboard exposes its CDA query via a DISCRETE info affordance (user, 2026-06-24).** Each dashboard must offer a
>    quiet way to inspect the underlying CDA SQL — **must NOT clutter or dirty the view.** ✅ DONE on the Custom suite: a header
>    **ⓘ button** (`#qInfoBtn` → `PDC.queryModal()`) + the per-panel faint **provenance caption is now click-to-open**; both open a
>    clean read-only modal that fetches the deployed `.cda` and lists every data access (id + params + SQL, copy buttons).
>    ✅ **NOW SUITE-WIDE (2026-06-24):** also on the **27 CDF/standalone/lineage** dashboards (build.py `stamp_handwritten` idempotently
>    injects a self-contained ⓘ button + modal, deriving the `.cda` URL from each file's `CDAPATH`) and the **16 CDE boards** (gen-cde
>    header ⓘ **link** → opens the deployed `.cda` in a new tab; a link not a modal because a `<script>` in a CDE LayoutHtml doesn't
>    reliably execute). **ⓘ now on all 67 dashboards.** (Custom = header ⓘ + clickable provenance + per-query focus modal; CDF =
>    header ⓘ modal; CDE = header ⓘ link to the .cda.)

## IDEAS & RECOMMENDATIONS (rolling backlog — newest on top; promote into NEXT when ready)
_Captured while working; not yet scheduled. Pull from here when picking a deliverable; add freely as you notice things._
- ✅ **DONE (2026-06-29, CLOUD RUN #33 on `claude/pdc-analytics-loop-ivozws`) — pdc-governance + i-cdf-governance SENSITIVITY → GOVERNANCE STATE FLOW animated Sankey ribbon (Custom + CDF twin parity).**
  New span:3 **"Sensitivity → Governance State Flow"** animated Sankey ribbon diagram added to both Policy & Governance Coverage boards. Shows how entities at each sensitivity tier (HIGH/MEDIUM/LOW/Unclassified) split between Governed and Ungoverned states — ribbon width = entity count. Immediately reveals the highest-priority remediation targets: large Ungoverned ribbons at HIGH or MEDIUM sensitivity demand immediate policy attention.
  New DA `gov_sens_flow` added to both `pdc-governance.cda` and `i-cdf-governance.cda` (SQL: UNION ALL of governed_entity_count and ungoverned_entity_count grouped by sensitivity_tier from `fact_entity_snapshot JOIN dim_datasource LEFT JOIN dim_entity`; `ds` param for Data Source filter; 8 rows = 4 sensitivity tiers × 2 governance states). Custom (`governance.js`): `PDC.sankey` with `sensTierColor` function (red=HIGH/Restricted, orange=Confidential/MEDIUM, blue=Internal/LOW, gray=Unclassified); `gsf:["gov_sens_flow",{ds}]` added to `PDC.load`; placed as new span:3 card after the Coverage Over Time trend. CDF twin (`i-cdf-governance.html`): `BaseComponent` (`govFlowPanel`, listener `dsParam`) fetches `gov_sens_flow` + renders inline SVG animated ribbon diagram — node bars on left (sensitivity tier, colored by severity) and right (governance state, green=Governed/red=Ungoverned), cubic bezier ribbons with `@keyframes govRibbonIn` CSS animation (stroke-dashoffset from full-length to 0, staggered 80ms per ribbon), entity count labels, risk annotation showing total ungoverned count + gap percentage. doQuery-validated: `gov_sens_flow` → **8 rows** ✅ (both CDAs identical; HIGH: 1,385 Governed vs 720 Ungoverned = 66% governed; MEDIUM: 2,396 vs 1,715 = 58%; LOW: 1,199 vs 2,332 = 34% — LOW-sensitivity data is the largest ungoverned population; Unclassified: 266 vs 1,349 = 16% — expected low governance on unclassified assets). Custom: **9 cards / 9 SVGs / 13 info dots / 2 selects / 0 errors** ✅ (was 8 cards / 8 SVGs). CDF twin: **benign 404 + no-svg-timeout** ✅ (expected CDF headless behavior, same as pre-change baseline).
  **Key governance insight revealed:** LOW-sensitivity data has the worst absolute governance gap (2,332 ungoverned entities) — even though it's low-sensitivity, the sheer volume creates operational risk. HIGH-sensitivity data is actually better governed at 66%, but 720 ungoverned HIGH-sensitivity entities are still the top audit priority. The Sankey makes this multi-dimensional insight immediately scannable.
  **Next good viz targets:** i-exec-scorecard (animated gauge transitions on load — add CSS `transition` to the existing semicircle dials); pdc-ownership (ownership coverage animated chord between data source and sensitivity × ownership status); any board showing anomaly detection threshold highlighting.
- ✅ **DONE (2026-06-29, CLOUD RUN #32 on `claude/pdc-analytics-loop-ivozws`) — pdc-compliance + i-cdf-compliance SOURCE→DESTINATION SENSITIVITY FLOW animated ribbon/chord diagram (Custom + CDF twin parity).**
  New span:3 **"Source → Destination Sensitivity Flow"** animated ribbon diagram added to both Sensitive Data & Compliance Radar boards. Shows how data moves between sensitivity classifications (Restricted/Confidential/Internal) — ribbon width = GB transferred, color-coded by source sensitivity. Key insight: Internal→Internal is the dominant flow (6,117 GB); cross-sensitivity flows include Confidential→Internal (650.5 GB) and Restricted→Confidential (16 GB), revealing classification drift. The ⚠ annotation highlights Restricted→lower-sensitivity flows as potential policy gaps.
  New DA `sens_to_sens_flow` added to both `pdc-compliance.cda` and `i-cdf-compliance.cda` (SQL: `SUM(connection_count)` + `ROUND(SUM(bytes_moved)/1e9)` grouped by `regexp_replace(source_sensitivity)` × `regexp_replace(dest_sensitivity)`; `fromkey`+`srcsens` params; 9 rows = 3×3 sensitivity matrix). Custom (`compliance.js`): `PDC.sankey` with `sevColor` function (red=Restricted, orange=Confidential, blue=Internal); `stf:["sens_to_sens_flow",{fromkey,srcsens}]` added to `PDC.load`; placed as new span:3 card after the trend chart. CDF twin (`i-cdf-compliance.html`): `BaseComponent` (`stsPanel`, listeners `rangeParam`+`srcsensParam`) fetches `sens_to_sens_flow` + renders inline SVG animated ribbon diagram — node bars on left (source) and right (dest), cubic bezier ribbons with `@keyframes ribbonIn` CSS animation (stroke-dashoffset from full-length to 0, staggered 80ms per ribbon), color-coded by source sensitivity, tooltip shows src→dst GB + connection count, ⚠ risk annotation at top. doQuery-validated: `sens_to_sens_flow` → **9 rows** ✅ (both CDAs identical; Internal→Internal 6,117 GB / Confidential→Confidential 1,924.7 GB / Restricted→Restricted 797.5 GB; cross-sensitivity: Confidential→Internal 650.5 GB, Internal→Confidential 513.3 GB, Confidential→Restricted 15.7 GB, Restricted→Confidential 16 GB). Custom: **6 cards / 6 SVGs / 10 info dots / 2 selects / 0 errors** ✅ (was 5 cards / 5 SVGs). CDF twin: **6 cards / 7 SVGs / 12 info dots / 2 selects / 1 benign CDF i18n 404** ✅ (was 5 cards / 6 SVGs).
  **Next good viz targets:** i-exec-scorecard (animated gauge transitions on load — add CSS transition to the existing radar/gauge); any board showing a "by-source anomaly detection" threshold highlight; pdc-governance (chord between governance states and sensitivity tiers).
- ✅ **DONE (2026-06-29, CLOUD RUN #31 on `claude/pdc-analytics-loop-ivozws`) — pdc-pipeline-obs + i-cdf-pipeline-obs FAILURE RATE TREND BY INTEGRATION multi-line chart (Custom + CDF twin parity).**
  New span:3 **"Failure Rate Trend by Integration"** multi-line chart added to both Pipeline & Job Observability boards. Shows failure rate (%) month-by-month for each integration tool (Apache Airflow, Apache Spark, dbt, Fivetran, Kafka Connect, PDI, Snowflake Tasks) — one colored line per integration, with "lower is better" annotation. Reveals which integrations are improving reliability over time, which are degrading, and whether reliability programs are working uniformly or only for some connectors. Kafka Connect stands out with 16.7% failure rate in Jul 2025, fluctuating through the period; Fivetran shows 23.1% failure rate in Jun 2026 (highest); Apache Spark remains near 0% throughout.
  New DA `failure_rate_trend` added to both `pdc-pipeline-obs.cda` and `i-cdf-pipeline-obs.cda` (SQL: `SUM(failed+aborted)/SUM(started)` per month per integration from `fact_lineage_event JOIN dim_date JOIN dim_lineage_job`; `fromkey` param threads the time range filter; 84 rows = 7 integrations × 12 months). Custom (`pipeline-obs.js`): `PDC.line` multi-series (one colored line per integration via `PDC.color(i)`, `area:false`, pct formatter; `frt:["failure_rate_trend",{fromkey}]` added to `PDC.load` — note uses only `fromkey`, not `integration`, so chart always shows all integrations as separate lines). CDF twin (`i-cdf-pipeline-obs.html`): `BaseComponent` (`frtPanel`, listener `rangeParam`) fetches `failure_rate_trend` + renders inline SVG multi-line chart (one `<polyline>` per integration in BRAND colors, endpoint dot markers, 0-to-maxRate% y-axis with grid, month x-axis, "lower is better" annotation in red, legend box with latest failure rate per integration). doQuery-validated: `failure_rate_trend` → **84 rows** ✅ (both CDAs identical; 7 integrations × 12 months; Kafka Connect 16.7% in Jul 2025; Fivetran 23.1% in Jun 2026). Custom: **10 cards / 9 SVGs / 15 info dots / 2 selects / 0 errors** ✅ (was 9 cards / 8 SVGs). CDF twin: **1 benign CDF i18n 404 + no-svg-timeout** ✅ (expected CDF headless behavior).
  **Next good trend/viz targets:** i-cdf-compliance (animated ribbon flow or chord for data movement by sensitivity); i-exec-scorecard (animated gauge transitions on load); any board that would benefit from a "by-source anomaly detection" or threshold-based alert highlight.
- ✅ **DONE (2026-06-29, CLOUD RUN #30 on `claude/pdc-analytics-loop-ivozws`) — pdc-cost + i-cdf-cost COST BY SOURCE OVER TIME multi-line trend (Custom + CDF twin parity).**
  New span:3 **"Cost by Source Over Time"** multi-line chart added to both Cost Optimization boards. Shows cumulative $/mo per top-8 data platform month-by-month over 18 months — each source gets its own colored line, revealing which platforms are driving cost growth and when they were first onboarded. SNOWFLAKE dominates at $42K/mo cumulative (Jun 2026), followed by AZURE_BLOB_STORAGE, AWS, and REDSHIFT; steep early slopes mark major data-source onboardings.
  New DA `cost_by_src_trend` added to both `pdc-cost.cda` and `i-cdf-cost.cda` (SQL: `top_src` CTE selects 8 largest sources by total cost from `fact_entity_snapshot JOIN dim_entity JOIN dim_datasource`; `first_scan` CTE gets first-scan month per entity per source; outer query computes cumulative `SUM(SUM(cost)) OVER (PARTITION BY src ORDER BY ym)` → `cum_cost`; `ds`+`sens` params; 58 rows = 8 sources × 7-8 months). Custom (`cost.js`): `PDC.line` multi-series (one colored line per source via `PDC.color(i)`, `area:false`, money formatter; string-keyed `ym` map for correct `YYYY-MM` sort); `cst:["cost_by_src_trend",p]` added to `PDC.load`. CDF twin (`i-cdf-cost.html`): `BaseComponent` (`costSrcTrendPanel`, listeners `dsParam`+`sensParam`) fetches `cost_by_src_trend` + renders inline SVG multi-line chart (one `<polyline>` per source in BRAND colors, endpoint dot markers, money-formatted y-axis, month x-axis, legend box with source name + latest $/mo, grid lines). doQuery-validated: `cost_by_src_trend` → **58 rows** ✅ (8 sources; SNOWFLAKE $42K/mo + AZURE_BLOB_STORAGE $13K/mo + REDSHIFT $8K/mo + AWS $7K/mo in Jun 2026). Custom: **7 cards / 7 SVGs / 10 info dots / 2 selects / 0 errors** ✅ (was 6 cards / 6 SVGs). CDF twin: **6 cards / 7 SVGs / 18 info dots / 2 selects / 1 benign CDF i18n 404** ✅ (was 5 cards / 6 SVGs).
  **Next good trend/viz targets:** i-cdf-compliance (animated ribbon flow or chord for data movement); i-exec-scorecard (animated gauge transitions on load); pdc-pipeline-obs (failure rate trend by integration over time — which integrations are getting more reliable vs. degrading?).
- ✅ **DONE (2026-06-29, CLOUD RUN #29 on `claude/pdc-analytics-loop-ivozws`) — pdc-storage + i-cdf-storage STORAGE FOOTPRINT GROWTH BY SOURCE multi-line trend (Custom + CDF twin parity).**
  New span:3 **"Storage Footprint Growth by Source"** multi-line chart added to both Storage Footprint boards. Shows cumulative TB per top-8 data source month-by-month over 18 months — each source gets its own colored line, revealing which platforms are adding the most capacity over time. SNOWFLAKE dominates at 245 TB (Jun 2026), dwarfing REDSHIFT (46 TB) and all others; the diverging lines show when each source was first onboarded to the catalog and how fast it grew.
  New DA `growth_by_source` added to both `pdc-storage.cda` and `i-cdf-storage.cda` (SQL: `top_src` CTE selects 8 largest sources by total bytes filtered by `ds`+`sens`; `first_scan` CTE gets first-scan month per entity per source from `fact_entity_snapshot JOIN dim_date`; outer query computes cumulative `SUM(SUM(bytes)) OVER (PARTITION BY src ORDER BY ym)` → `cum_tb`; `ds`+`sens` params; 58 rows = 7 sources × 8–18 months). Custom (`storage.js`): `PDC.line` multi-series (one colored line per source via `PDC.color(i)`, `area:false`, TB formatter; string-keyed `ym` map for correct `YYYY-MM` sort); `gbs:["growth_by_source",p]` added to `PDC.load`. CDF twin (`i-cdf-storage.html`): `BaseComponent` (`growthSrcPanel`, listeners `dsParam`+`sensParam`) fetches `growth_by_source` + renders inline SVG multi-line chart (one `<polyline>` per source in BRAND colors, endpoint dot markers, TB y-axis with max-scaled ticks, month x-axis, legend box with source name + latest TB, grid lines). doQuery-validated: `growth_by_source` → **58 rows** ✅ (7 sources × partial months — not all sources active from Jan 2025; SNOWFLAKE at 245.27 TB + REDSHIFT 46.36 TB + POSTGRES 25.84 TB in Jun 2026). Custom: **7 cards / 6 SVGs / 11 info dots / 2 selects / 0 errors** ✅ (was 6 cards / 5 SVGs). CDF twin: **6 cards / 6 SVGs / 20 info dots / 2 selects / 1 benign CDF i18n 404** ✅ (was 5 cards / 5 SVGs).
  **Next good trend/viz targets:** any board missing a cross-source time-series; pdc-cost (cost per source over time — monthly spend by platform); i-cdf-compliance (animated ribbon flow or animated chord for data movement); i-exec-scorecard (animated gauge transitions on load).
- ✅ **DONE (2026-06-29, CLOUD RUN #28 on `claude/pdc-analytics-loop-ivozws`) — i-profiling + i-cdf-profiling PROFILING COVERAGE GROWTH TREND (Custom + CDF twin parity).**
  New span:3 **"Profiling Coverage Growth"** dual-line chart added to both Column Profiling boards. Shows cumulative entities discovered (gray line) vs cumulative entities with column-level profiling stats (blue line) month-by-month over 18 months. The gap between lines reveals "uncharted territory" — entities in the catalog that haven't been profiled yet; a closing gap means the profiling program is keeping pace with data growth.
  New DA `profiling_trend` added to both `i-profiling.cda` and `i-cdf-profiling.cda` (SQL: `first_scan` CTE from `fact_entity_snapshot JOIN dim_date` gets first-seen month per entity; `monthly` CTE counts new entities vs new profiled by month; window SUM for cumulative totals; `ds` param; 18 rows). Custom (`i-profiling.js`): `PDC.line` dual-series (gray Total Entities, brand-blue Profiled); `pg:["profiling_trend",{}]` added to `PDC.load`. CDF twin (`i-cdf-profiling.html`): `BaseComponent` (`profGrowthPanel`, listener `dsParam`) fetches `profiling_trend` + renders inline SVG dual-line chart (gray total line, blue profiled line, endpoint value dots, coverage % label in center, month x-axis every 3rd label, grid lines, legend). doQuery-validated: `profiling_trend` → **18 rows** ✅ (Jan 2025: 188 total / 118 profiled (62.8%) → Jun 2026: 9,718 total / 5,715 profiled (58.8%) — total grew faster than profiling; reveals where the profiling gap is widening). Custom: **6 cards / 5 SVGs / 10 info dots / 0 selects / 0 errors** ✅ (was 5 cards). CDF twin: **7 cards / 7 SVGs / 14 info dots / 1 select / 1 benign CDF i18n 404** ✅ (was 6 cards / 6 SVGs).
  **Next good trend/viz targets:** pdc-storage (storage footprint trend by source — multi-line month × datasource); any board missing a cross-source comparison visualization.
- ✅ **DONE (2026-06-29, CLOUD RUN #27 on `claude/pdc-analytics-loop-ivozws`) — i-schema-explorer + i-cdf-schema-explorer SCHEMA DISCOVERY GROWTH + pdc-freshness + i-cdf-freshness FRESHNESS PROFILE BY SOURCE HEATMAP (Custom + CDF twin parity on both boards).**
  **(1) i-schema-explorer + i-cdf-schema-explorer — Schema Discovery Growth (span:3):** New DA `schema_growth` in both `i-schema-explorer.cda` and `i-cdf-schema-explorer.cda` (SQL: CTE groups `fact_entity_snapshot JOIN dim_date JOIN dim_entity JOIN dim_datasource` by ym, counting TABLE and COLUMN entities; window SUM for cumulative totals; `ds`+`schema` params; 18 rows). Custom (`i-schema-explorer.js`): `PDC.line` dual-series (Tables in brand blue, Columns in purple); placed as new span:3 card after Schema Detail; `sg:["schema_growth",{ds,schema}]` added to PDC.load. CDF twin (`i-cdf-schema-explorer.html`): `BaseComponent` (`growthPanel`, listeners `dsParam`+`schemaParam`) renders inline SVG dual-line chart (blue Tables line, purple Columns line, shared y-axis with `fmt.abbr`, month x-axis, endpoint value labels in legend, grid lines). doQuery-validated: `schema_growth` → **18 rows** ✅ (Jan 2025: 0 tables / 118 cols → Jun 2026: 42 tables / 5,891 cols — reveals when structured schema objects were first cataloged). Custom: **6 cards / 5 SVGs / 10 info dots / 2 selects / 0 errors** ✅ (was 5 cards). CDF twin: **6 cards / 6 SVGs / 12 info dots / 2 selects / 1 benign CDF i18n 404** ✅.
  **(2) pdc-freshness + i-cdf-freshness — Freshness Profile by Source Heatmap (span:3):** New DA `fresh_source_matrix` in both `pdc-freshness.cda` and `i-cdf-freshness.cda` (SQL: `fact_entity_snapshot JOIN dim_datasource` grouped by (datasource_type, regexp_replace(scan_freshness_band)) × SUM(entity_count); `sens` param; 52 rows = 13 sources × 4 bands). Custom (`freshness.js`): `pivotFsm()` helper + `fsmFill(band,pct)` diverging color function (green=Current/Fresh, orange=Aging, red=Stale; intensity driven by share within source); `PDC.heatmap` with `cellFill`/`cellTip` hooks; placed as new span:3 card after Access Recency. CDF twin (`i-cdf-freshness.html`): `setTimeout(fn,600)` fetch via plain doQuery → colored HTML table (green=Current/Fresh, orange=Aging, red=Stale; count + % shown in each cell; total column; color legend row). doQuery-validated: `fresh_source_matrix` → **52 rows** ✅ (e.g. AWS: 677 Current + 225 Aging + 193 Recent + 584 Stale → 34.8% stale for AWS; source-by-source freshness profile reveals which sources are consistently re-scanned vs. falling behind). Custom: **8 cards / 8 SVGs / 12 info dots / 2 selects / 0 errors** ✅ (was 7 cards). CDF twin: **5 cards / 5 SVGs / 18 info dots / 2 selects / 1 benign CDF i18n 404** ✅.
  **Next good trend/viz targets:** pdc-storage (storage footprint trend by source — `fact_entity_snapshot` grouped by month × datasource); i-profiling (profiling coverage growth — cumulative entities profiled over time); any board missing a cross-source comparison visualization.
- ✅ **DONE (2026-06-28, CLOUD RUN #26 on `claude/pdc-analytics-loop-ivozws`) — THREE STEWARDSHIP TREND CHARTS: i-term-stewardship + i-cdf-term-stewardship, pdc-command-center + i-cdf-command-center, pdc-ownership + i-cdf-ownership (Custom + CDF twin parity across all three).**
  **(1) i-term-stewardship — Term Adoption Coverage Over Time (span:3):** New DA `term_adoption_trend` in both `i-term-stewardship.cda` and `i-cdf-term-stewardship.cda` (SQL: `all_entities CTE` = first scan date per entity from `fact_entity_snapshot`; `classified CTE` = entities with at least one matching term from `fact_entity_term JOIN dim_glossary_term` filtered by `glossary`+`ttype` params; monthly cumulative total entities vs cumulative classified). Custom (`i-term-stewardship.js`): `PDC.line` dual-series (All Entities in gray, Classified in brand blue); Glossary + Term Type filters scope the "classified" definition. CDF twin (`i-cdf-term-stewardship.html`): `BaseComponent` (`adoptTrendPanel`, listeners `glossaryParam`+`ttypeParam`) fetches `term_adoption_trend` + renders inline SVG dual-line chart (gray total line, blue classified line, endpoint dots with tooltips). doQuery-validated: `term_adoption_trend` → **18 rows** ✅ (Jan 2025: 188 total / 96 classified → Jun 2026: 9,718 total / 4,575 classified = 47% adoption, estate-wide). Custom: **7 cards / 6 SVGs / 12 info dots / 2 selects / 0 errors** ✅ (was 6 cards). CDF twin: **7 cards / 7 SVGs / 14 info dots / 2 selects / 1 benign CDF i18n 404** ✅.
  **(2) pdc-command-center — Estate Health Score Over Time (span:3):** New DA `health_trend` in both `pdc-command-center.cda` and `i-cdf-command-center.cda` (SQL: monthly `governed_entity_count / entity_count` and `metadata_completed_field_count / metadata_expected_field_count` from `fact_entity_snapshot JOIN dim_date JOIN dim_datasource`; `ds` param threads the Data Source filter). Custom (`command-center.js`): `PDC.line` dual-series (Governed % in green, Metadata Complete % in blue); card inserted just above the storage/governance/sensitivity grid. CDF twin: `BaseComponent` (`healthTrendPanel`, listener `dsParam`) fetches + renders inline SVG dual-line (green governed, blue dashed completeness; 0–100% Y axis with grid at 25/50/75/100%). doQuery-validated: `health_trend` → **18 rows** ✅ (Jan 2025: 51.1% gov / 55.4% complete → Jun 2026: trending). Custom: **8 cards / 9 SVGs / 14 info dots / 2 selects / 0 errors** ✅ (was 7 cards). CDF twin: **8 cards / 10 SVGs / 16 info dots / 2 selects / 1 benign CDF i18n 404** ✅.
  **(3) pdc-ownership — Stewardship Coverage Over Time (span:3):** New DA `ownership_trend` in both `pdc-ownership.cda` and `i-cdf-ownership.cda` (SQL: monthly `(entity_count - missing_owner_count) / entity_count` = owned_pct and `governed_entity_count / entity_count` = gov_pct; `ds` param). Custom (`ownership.js`): `PDC.line` dual-series (Owned % in brand blue, Governed % in green); inserted between Stewardship Scorecard and Risk Matrix. CDF twin (`i-cdf-ownership.html`): `BaseComponent` (`ownTrendPanel`, listener `dsParam`) + inline SVG (blue owned line, green dashed governed line). doQuery-validated: `ownership_trend` → **18 rows** ✅ (Jan 2025: 33% owned / 51.1% gov → Mar 2025: 69.4% owned / 51.5% gov; interesting crossover pattern). Custom: **6 cards / 5 SVGs / 10 info dots / 2 selects / 0 errors** ✅ (was 5 cards). CDF twin: **6 cards / 5 SVGs / 20 info dots / 2 selects / 1 benign CDF i18n 404** ✅. **The ownership trend reveals stewardship accountability dynamics over time — when ownership surged (new data governance program?) vs when governance outpaced ownership assignment.**
  **Next good trend targets:** i-schema-explorer (table/schema discovery growth), pdc-freshness (staleness %). The proven DA pattern is `fact_entity_snapshot JOIN dim_date JOIN dim_datasource` grouped monthly; or the `first_scan CTE` from `fact_entity_snapshot` for entity-level "first appearance" trends (used by privacy, adoption).
- ✅ **DONE (2026-06-28, CLOUD RUN #25 on `claude/pdc-analytics-loop-ivozws`) — pdc-data-quality + i-cdf-data-quality QUALITY IMPROVEMENT RACE (Custom + CDF twin parity).**
  Added a new span:3 **"Quality Improvement Race — Completeness by Source"** multi-line trend chart to both Data Quality boards. Shows metadata completeness % month-by-month for the 8 largest sources (18 months: Jan 2025 – Jun 2026), revealing which data sources are improving their curation over time and which are flat or declining. New DA `quality_race` added to both `pdc-data-quality.cda` and `i-cdf-data-quality.cda` (SQL: CTE selects top-8 sources by entity count, then joins `fact_entity_snapshot JOIN dim_date JOIN dim_datasource` to get `SUM(metadata_completed_field_count)/SUM(metadata_expected_field_count)` per month per source; `sens` param threads the sensitivity filter). Custom (`data-quality.js`): `PDC.line` with multi-series (one colored line per source via `PDC.color(i)`, `area:false`, pct formatter); inserted as new span:3 card between the scatter chart and the worst-entities table. CDF twin (`i-cdf-data-quality.html`): `BaseComponent` (`qracePanel`, listener `sensParam`) fetches `quality_race` + renders inline SVG multi-line chart (percent Y axis 0–100%, labeled month X axis, one `<polyline>` per source in BRAND colors, endpoint dot markers, legend box with color swatches). doQuery-validated: `quality_race` → **144 rows** ✅ (8 sources × 18 months; both CDAs identical; key finding: POSTGRES completeness is 32.9% in Jun 2026 — lowest by far — while REDSHIFT improved to 74.7%; SNOWFLAKE at 71.1%). Custom: **7 cards / 6 SVGs / 11 info dots / 2 selects / 0 errors** ✅ (was 6 cards / 5 SVGs). CDF twin: **6 cards / 6 SVGs / 20 info dots / 2 selects / 1 benign CDF i18n 404** (expected) ✅. The chart immediately answers "are we making progress on metadata quality, and where are we stalling?" — a key data stewardship accountability view.
- ✅ **DONE (2026-06-28, CLOUD RUN #24 on `claude/pdc-analytics-loop-ivozws`) — pdc-cost + i-cdf-cost COST vs. GOVERNANCE BUBBLE CHART (Custom + CDF twin parity; first deployment of PDC.scatter).**
  Added a new span:3 **"Cost vs. Governance Coverage"** bubble/scatter chart to both Cost Optimization boards. This is the **first deployment of `PDC.scatter`** — the toolkit primitive existed but was never used. Each bubble = one data platform: x = monthly storage cost, y = governance %, size = entity count. Background quadrant shading highlights the "Expensive + Ungoverned" bottom-right region. New DA `cost_gov_scatter` added to both `pdc-cost.cda` and `i-cdf-cost.cda` (SQL: `SUM((bytes/1e12)*cost_per_tb_usd)` for cost + `SUM(governed_entity_count)/SUM(entity_count)` for governance % + `SUM(entity_count)` for bubble size — all from `fact_entity_snapshot JOIN dim_entity JOIN dim_datasource`; `ds`+`sens` params thread existing filters). Custom (`cost.js`): `PDC.scatter` with `fmtX:PDC.fmt.money`, `fmtY:v=>v+"%"`, `rLabel:"entities"`, and `color:PDC.color(i)` per source; placed as new span:3 card after Cloud Spend Growth. CDF twin (`i-cdf-cost.html`): `BaseComponent` (`scatterPanel`, listeners `dsParam`+`sensParam`) fetches `cost_gov_scatter` + renders inline SVG bubble chart (grid lines, axis labels, "⚠ Expensive + Ungoverned" quadrant hint, bubbles with `<title>` native tooltips, source labels below each bubble, dual-axis). doQuery-validated: `cost_gov_scatter` → **13 rows** ✅ (both CDAs identical; most actionable insight: REDSHIFT $337K/mo at 0% governed + SNOWFLAKE $265K/mo at 0% governed = ~$600K/mo in expensive ungoverned data; AWS $293K/mo at only 29% governed). Custom: **6 cards / 6 SVGs / 9 info dots / 2 selects / 0 errors** ✅ (was 5 cards / 5 SVGs). CDF twin: **5 cards / 6 SVGs / 16 info dots / 2 selects / 1 benign CDF i18n 404** (expected) ✅. The chart immediately answers "which sources should we prioritize for governance?" — expensive AND ungoverned sources are the highest-ROI remediation targets.
- ✅ **DONE (2026-06-28, CLOUD RUN #23 on `claude/pdc-analytics-loop-ivozws`) — i-data-flows + i-cdf-data-flows MONTHLY DATA MOVEMENT VOLUME TREND (Custom + CDF twin parity).**
  Added a new span:3 **"Monthly Data Movement Trend"** dual-line chart to both Data Movement Flows boards showing GB moved and pipeline success rate month-by-month (12 months: Jul 2025 – Jun 2026). This is the first time-series visualization on the data flows board — all existing charts show current aggregates, making the trend the only view that reveals whether movement volume is growing and whether pipeline reliability is improving over time. New DA `movement_trend` added to both `i-data-flows.cda` and `i-cdf-data-flows.cda` (SQL: `SUM(output_bytes)/1e9` + `SUM(started_count)` + `SUM(completed_count)/SUM(terminal_count)` per month via `fact_lineage_event JOIN dim_date JOIN dim_lineage_job`; `integration` param threads the existing filter so filtering by integration shows that pipeline's individual trend). Custom (`i-data-flows.js`): `PDC.line` with `area:true` and dual series — GB Moved (blue area fill) + Success % (teal dashed); placed as new span:3 card before the Top Flows table. CDF twin (`i-cdf-data-flows.html`): `BaseComponent` (`trendPanel`, listener `integParam`) fetches `movement_trend` + renders inline SVG dual-line chart (blue area for GB, teal dashed for success %, dual y-axes: left=TB/GB, right=0–100%, month x-axis labels, grid lines, legend). doQuery-validated: `movement_trend` → **12 rows** ✅ (both CDAs identical; 2025-07: 665.9 GB / 442 runs / 96.8% success → 2025-08: 1254.3 GB / 899 runs / 93.4% — volume nearly doubles in month 2, indicating major data onboarding). Custom: **7 cards / 6 SVGs / 12 info dots / 2 selects / 0 errors** ✅ (was 6 cards / 5 SVGs). CDF twin: **5 cards / 5 SVGs / 10 info dots / 2 selects / 1 benign CDF i18n 404** (expected) ✅.
- ✅ **DONE (2026-06-28, CLOUD RUN #22 on `claude/pdc-analytics-loop-ivozws`) — i-data-integration + i-cdf-data-integration INTEGRATION RUN ACTIVITY CALENDAR (Custom + CDF twin parity).**
  Added a new span:3 **"Integration Run Activity Calendar"** hero panel (GitHub-style heat-grid) to both boards showing daily pipeline run volume across all integrations, with failure days ringed in red. New DA `int_calendar` added to both `i-data-integration.cda` and `i-cdf-data-integration.cda` (SQL: `started_count` + `output_bytes/1e9` + `failed_count+aborted_count` per calendar day via `JOIN dim_date`, `integration` param). Custom (`i-data-integration.js`): `PDC.calendar` with `unit:"runs"`, `tip2` showing GB moved, `days` mapped from `(day, runs, gb, fails)` — placed as first span:3 card in the grid (hero position). CDF twin (`i-cdf-data-integration.html`): `BaseComponent` (`calPanel`, listener `integParam`) fetches `int_calendar` + renders inline SVG heat-grid in purple (`rgba(125,60,152,...)` to differentiate from pipeline-obs blue and freshness teal; same coordinate system: weeks across, weekdays down, sqrt-intensity shading, failure-day red rings, month labels, fewer→more legend). Tooltip shows date + runs + GB moved + fails. doQuery-validated: `int_calendar` → **332 rows** ✅ (both CDAs identical; 2025-07-17 → 2026-06-13; failure days ring correctly e.g. 2025-07-23 Snowflake Tasks 1 fail). Integration filter validated: `dbt` → 332 rows (all integrations active daily in synthetic data). Custom: **7 cards / 6 SVGs / 12 info dots / 2 selects / 0 errors** ✅ (was 6 cards / 5 SVGs); CDF twin: **benign 404 + no-svg-timeout** (expected CDF headless behavior, same as all other twins) ✅. The calendar is now the third PDC.calendar board (after pdc-pipeline-obs and pdc-freshness) and the third CDF twin calendar (purple, differentiated from blue and teal).
- ✅ **DONE (2026-06-28, CLOUD RUN #21 on `claude/pdc-analytics-loop-ivozws`) — i-column-health + i-cdf-column-health COLUMN HEALTH × DATA TYPE MATRIX (Custom + CDF twin parity).**
  Added a new span:3 **"Column Health by Data Type"** cross-tab visualization to both boards showing how health quality (Unique/Key, High Cardinality, Low/Normal, Dead/Constant) distributes across each normalized data type (VARCHAR, BIGINT, NUMERIC, DATE, TIMESTAMP, etc.). New DA `health_by_type` added to both `i-column-health.cda` and `i-cdf-column-health.cda` (SQL: `upper(column_data_type)` × health bucket × count; 21 rows: 8 types × up to 4 buckets; `dtype`+`schema` params so filters apply). Custom (`i-column-health.js`): new `pivotSorted()` helper (sorts types by total column count desc) + `hbtFill(v,max,pct,colIdx)` diverging color function (green=Unique/Key, blue=High, gray=Low, red=Dead; intensity driven by % of type's columns in that bucket); `PDC.heatmap` with `cellFill` and `cellTip` hooks. CDF twin (`i-cdf-column-health.html`): `BaseComponent` (`healthTypeMatrix`, listeners `dtypeParam`+`schemaParam`) fetches via plain `doQuery` + `renderHealthMatrix()` renders a color-coded HTML table (same diverging color logic). Key insights revealed: VARCHAR is 86% Low/Normal + 12% High + 0.2% Dead; BIGINT is 86% Low + 12% High + 0.7% Dead; DATE and TIMESTAMP are 100% High/Low (no dead columns in temporal types). doQuery-validated: `health_by_type` → **21 rows** ✅ (both CDAs identical). Custom: **6 cards / 4 SVGs / 10 info dots / 2 selects / 0 errors** ✅; CDF twin: **6 cards / 4 SVGs / 12 info dots / 2 selects / 1 benign CDF i18n 404** (expected) ✅.
- ✅ **DONE (2026-06-28, CLOUD RUN #20 on `claude/pdc-analytics-loop-ivozws`) — lineage-explorer FIND PATH + FADE ANIMATION.**
  Added two-node **path-tracing** mode to the Data Lineage Observability flagship board. A new **"Find Path"** button in the header activates path mode; tooltips update to guide the user ("click source node…", "click destination…"). First node click highlights source (orange); second node click runs **directed BFS** across the lineage graph to find the shortest directed data-flow path, then highlights the path (source = orange, path-through nodes = amber, destination = red) and dims everything outside the path. A bottom toast shows the full path with intermediate hops (e.g. `s3 → kafka → snowflake · 2 hops`). If no directed path exists, a "try reversing" toast advises the user. "✕ Clear" button resets back to normal blast-radius mode. Works in both **Flow (Sankey)** and **Network** views. Also added a smooth **fade-in animation** on filter change — the `#viz` div fades to 0 before data loads and fades back to 1 after render, making filter transitions feel polished. Changes: pure JS/SVG in `lineage-explorer.html` only — no CDA changes. doQuery-validated: edges → **19 rows** ✅ (all 6 columns correct). Render-test: **2 cards / 1 SVG / 2 selects / 0 errors** ✅.
- ✅ **DONE (2026-06-28, CLOUD RUN #19 on `claude/pdc-analytics-loop-ivozws`) — i-privacy + i-cdf-privacy DUAL FILTERS + PRIVACY EXPOSURE GROWTH TREND (Custom + CDF twin parity).**
  i-privacy was the only board in the suite with **zero filters** — now brought to dual-filter parity. Added **Data Source** + **Sensitivity** cross-filters and a new span:3 **"Privacy Exposure Growth"** trend chart showing cumulative PII-classified assets discovered month-by-month (18 months of data, 76→4,252 cumulative entities). Changes: **(1) i-privacy.cda**: added `ds`+`sens` params to all 5 DAs (kpi, by_term, by_source, scale, matrix); new `privacy_trend` DA (CTE: first-scan month per PII entity via `fact_entity_snapshot JOIN dim_date`, then window SUM for cumulative; 18 rows); `datasources` + `sensitivities` options DAs. **(2) i-privacy.js**: switched from direct `PDC.load` to `Promise.all([datasources, sensitivities])` init pattern; `PDC.filters` with 2 controls; `privacy_trend` added to load; new span:3 "Privacy Exposure Growth" card using `PDC.line` with dual series (cumulative PII entities in red, new-this-month in orange). **(3) i-cdf-privacy.cda**: added `sens` param to all DAs (kpi/by_term/scale now also have `ds`; by_source/heat_stacked gained both); new `privacy_trend` + `sensitivities` DAs. **(4) i-cdf-privacy.html**: `sensParam` added; `sensSelect` span in filterbar; `sensitivities` SelectComponent; all chart components updated to `listeners:["dsParam","sensParam"]` + `parameters:DP` (DP now `[["ds","dsParam"],["sens","sensParam"]]`); new span:3 trend card with inline SVG rendered by BaseComponent (red cumulative line + orange dashed new-this-month line, legend, y-axis ticks). doQuery-validated: datasources → **13 rows** ✅; sensitivities → **3 rows** ✅; privacy_trend → **18 rows** ✅ (2025-Jan: 76 new/76 cum → Jun: all sources growing); kpi HIGH filter: 4252→1172 priv_assets (proper subset) ✅; by_term AWS: 5 rows ✅. Custom: **5 cards / 5 SVGs / 9 info dots / 2 selects / 0 errors** ✅; CDF twin: **benign 404 + no-svg-timeout** (expected CDF headless behavior, same as all other twins) ✅. The trend chart now shows exactly when PII exposure surged — steep monthly climbs correspond to new data-source onboardings.
- ✅ **DONE (2026-06-28, CLOUD RUN #18 on `claude/pdc-analytics-loop-ivozws`) — pdc-ownership + i-cdf-ownership STEWARDSHIP RISK MATRIX (Custom + CDF twin parity).**
  Added a new span:3 "Stewardship Risk Matrix" heatmap to both boards showing ownership coverage % for every `(data source, sensitivity tier)` cell: green=well-stewarded, orange=partial, red=stewardship gap on sensitive data. New DA `ownership_sens_matrix` added to both `pdc-ownership.cda` and `i-cdf-ownership.cda` (SQL: subquery + CASE-sorted ORDER BY HIGH→MEDIUM→LOW→Unclassified; 48 rows, 12 sources × 4 tiers). Custom (`ownership.js`): `omPivot` helper (sorts cols HIGH→MEDIUM→LOW→Unclassified), `PDC.heatmap` with `cellFill`/`cellTip` hooks (same diverging red/orange/green scale as governance heatmap; tooltip = source · sensitivity · owned% · asset count · risk label). CDF twin (`i-cdf-ownership.html`): plain `fetch()` → colored HTML table (avoids CDF query-layer 404; deferred via `setTimeout(fn,500)` after `dashboard.init()`). doQuery-validated: `ownership_sens_matrix` → **48 rows** ✅ (e.g. AWS·MEDIUM: 46.5% owned/648 assets; BIGQUERY·HIGH: 65.7%/175 assets). Custom: **5 cards / 4 SVGs / 9 info dots / 2 selects / 0 errors** ✅; CDF twin: **5 cards / 4 SVGs / 18 info dots / 2 selects / 1 pre-existing benign CDF 404** (confirmed same on i-cdf-governance which was not touched this run) ✅. The matrix immediately shows which sources have unowned sensitive data — the highest-priority stewardship remediation targets.
- ✅ **DONE (2026-06-28, CLOUD RUN #17 on `claude/pdc-analytics-loop-ivozws`) — i-growth + i-cdf-growth DISCOVERY RACE MULTI-SOURCE CHART (Custom + CDF twin parity).**
  Added "Discovery Race — Cumulative Assets by Source" span:3 multi-line chart to both boards. Custom (`i-growth.js`): top-8 sources by total assets, one colored line each, cumulative sums computed in JS from new `growth_by_source` DA (month × ym × source × assets; 234 rows, 13 sources, 18 months). CDF twin (`i-cdf-growth.html`): new span:3 "Discovery by Source (Monthly, Stacked)" stacked CccBarChart using `growth_src_stacked` DA (3-col month×src×assets for CCC crosstab-mode). Both CDAs validated via doQuery (234 rows each). Custom: 5 cards / 4 SVGs / 0 errors ✅; CDF twin: 5 cards / 5 SVGs / 1 benign CDF i18n 404 ✅. The chart shows when each source was onboarded and its growth trajectory — steep climbs mark major data-source additions.
- ✅ **DONE (2026-06-28, CLOUD RUN #16 on `claude/pdc-analytics-loop-ivozws`) — PUBLIC-SITE FIXES (all on `showcase/build/gen_site.py`).**
  **(1) Dropped PDC-BIDB-EXT / JNDI CONNECTION glossary entry entirely** — removed the tuple from GLOSSARY_TERMS; also removed the `<span class="tag">PDC-BIDB-EXT</span>` tag from the "How it's built" performance card (now reads "one managed JDBC connection pool"). Internal SE plumbing no longer surfaces on the public sales page.
  **(2) Start-Here dashboard links now open the lightbox** — changed `<a target="_blank" rel="noopener">…&nearr;</a>` to `<a class="lb-link">` and added a JS handler `document.querySelectorAll('.lb-link[href]')` that calls `openLb()`, consistent with thumbnail click behavior.
  **(3) Mobile START-HERE overlap fixed** — extended `@media(max-width:760px)` with `.hero-shot{margin-bottom:0}` (removes the -90px overlap at narrow viewports), `.start-here{position:relative;z-index:1}` (paints above any positioned hero layers), and `main{padding-top:40px}` (reduces excessive top padding at mobile). `gen_site.py` regenerated → `index.html` committed + pushed to analytics-pentaho-space main. ✅
- ✅ **DONE (2026-06-28, CLOUD RUN #15 on `claude/pdc-analytics-loop-ivozws`) — SHOWCASE UX OVERHAUL #3+#4 + POSITIONING improvements (PUBLIC-SHOWCASE TRACK).**
  **(1) Persona "Start Here" strip on analytics.pentaho.space (UX Overhaul #3):** 4-tile strip added between the header and main grid in `showcase/build/gen_site.py` — Executive / Data Steward / Data Engineer / Data Architect. Each tile shows role, tagline, and a 5-item curated tour with links to screenshot lightboxes. Responsive 4→2→1 col. `build_start_here()` helper function using PERSONAS list.
  **(2) Terminology Glossary on analytics.pentaho.space (UX Overhaul #4):** Collapsible `<details>` panel added after the concept-card grid (`__GLOSSARY__` placeholder) with 6 terms: Simple HTML, CDA, CDF, CDE, CCC, PDC-BIDB-EXT — plain-language definitions matching i-home. `build_glossary()` helper.
  **(3) Positioning improvements (SALES-ASSET):** Competitive wedge pill added to the pills strip — "One platform — catalog + analytics native, not bolted-on". Demo data disclosure added to lead paragraph — "representative synthetic demo data in a consistent catalog dataset." Performance note added as 4th card in the "How it's built" section: CDA cache TTLs, typical query latencies, concurrent dashboard load over single JDBC pool. `.how .row` updated to 4-column grid (responsive).
  **(4) Proofing pass (SALES-ASSET #6):** Fixed 4 identical `value` blurbs on lineage-related cards in `showcase/build/dashboards.json` — all 4 said "Trace how data moves across platforms…"; differentiated: lineage-explorer = blast radius/dependencies, i-cdf-lineage = throughput/reliability monitoring, i-data-flows = Sankey ribbons/bottleneck visibility, i-cdf-data-flows = CDF framework cross-platform volumes. All changes committed + pushed to analytics-pentaho-space main. ✅
- ✅ **DONE (2026-06-28, CLOUD RUN #14 on `claude/pdc-analytics-loop-ivozws`) — PERSONA START HERE + TERMINOLOGY GLOSSARY (UX Overhaul #3 + #4) + ESTATE HEALTH RADAR + OWNERSHIP DRILL FIX.**
  **(1) Persona "Start Here" guided paths (UX Overhaul #3):** 4-tile strip added below the i-home header (gen-home.py) showing a curated 5-dashboard tour per role — Executive (Scorecard→Command Center→Governance→Compliance→Cost), Data Steward (Governance→Privacy→Glossary→Freshness→Adoption), Data Engineer (Pipeline Obs→Quality→Column Health→Integration→Schema), Data Architect (Lineage→Data Flows→Schema→Storage→Growth). Clicking a tile applies the role filter to the card grid + highlights the persona tile with a colored border. Each numbered step opens the dashboard directly. Role chips in toolbar stay in sync. Responsive 4→2→1 col. Render-test: 27 cards / 0 errors ✅. (Showcase version done in CLOUD RUN #15.)
  **(2) Terminology Glossary (UX Overhaul #4):** Collapsible `<details>` panel added at the bottom of the i-home card grid explaining 6 terms: Simple HTML, CDA, CDF, CDE, CCC, PDC-BIDB-EXT — plain-language definitions for non-technical visitors. Grid layout with abbreviation, full name, and definition. ✅ (Showcase version done in CLOUD RUN #15.)
  **(3) Estate Health Radar (i-exec-scorecard + i-cdf-scorecard):** Span:3 pentagon spider chart added at the bottom of both builds, scoring 5 strategic dimensions: Governance, Quality, Freshness, Pipelines, Stewardship. Color-coded dots (green≥75%, amber≥45%, red<45%), grid rings at 25/50/75/100%. Custom: radarSVG() in i-exec-scorecard.js, reuses headline DA. CDF twin: i-cdf-scorecard.cda headline DA extended (+stale_pct idx 9 + adoption_pct idx 10); renderRadar() inline function in BaseComponent callback. doQuery-validated (11 cols, stale_pct=40.1, adopt=9.2). Custom: 12 cards / 3 SVGs / 0 errors ✅; CDF twin: 7 SVGs / 1 benign 404 ✅.
  **(4) i-cdf-ownership drillTo fix + govChart drill:** Fixed missing drillTo() helper (was undefined → ReferenceError on detail-drawer drill button). Added govChart click-to-drill → pdc-data-quality?ds=<source>. CDF: 4 cards / 4 SVGs / 0 real errors ✅.
- ✅ **DONE (2026-06-28, CLOUD RUN #13 on `claude/pdc-analytics-loop-ivozws`) — PAIRED CONCEPT CARDS with Simple HTML ⇄ Framework TOGGLE (UX Overhaul item 2).** i-home launcher and public showcase both redesigned: instead of 50+ cards (Custom card + Framework card per concept), now 27 concept cards (i-home) / 26 concept cards (showcase) each with a **Simple HTML ⇄ Framework** pill toggle inside the card to switch the live link and thumbnail between both builds. This halves the visual grid, removes repetitive copy, and presents "two builds as a feature" not a footnote. i-home changes: GROUPS restructured to explicit dict format with `custom`/`cdf`/`cde` fields; new `concept_card()` generates `<div>` cards with `.btrow` toggle (data attrs drive href + img.src + badge update via JS); "Kind" filter chips removed (replaced by per-card toggle); stats strip shows Concepts / Framework twin count / individual build counts; CDE boards appear as small "Also: CDE ↗" footnote link on paired cards. Showcase changes: `detect_pairs()` auto-detects same-title Custom+Framework pairs; `paired_card()` renders with toggle + dual `.cb-c`/`.cb-f` blurb switching + lightbox href update; filter logic shows Paired cards regardless of kind filter. Fixed "An an animated flow diagram" typo (×2 in dashboards.json). Lead paragraph updated to explain embed-anywhere Simple HTML vs. native Framework positioning. Render-test i-home: **27 cards / 1 SVG / 0 errors** ✅. Showcase: 26 concepts (50 builds). Committed + pushed to main on both repos.
- ✅ **DONE (2026-06-28, CLOUD RUN #12 on `claude/pdc-analytics-loop-ivozws`) — i-home LAUNCHER SEARCH + ROLE/TECH/TOPIC FACET FILTER CHIPS (UX Overhaul item 1).** The i-home launcher already had a search box + group/kind chips. Added three new facet filter rows to the sticky toolbar: **Role** (Executive · Data Steward · Data Engineer · Data Architect — sky-blue chips), **Topic** (Governance · Quality · PII/Privacy · Lineage · Freshness · Operations · Discovery · Cost · Storage · Glossary · Schema — emerald chips), and **Tech** (Multi-source · Snowflake · AWS/S3 · PDI/ETL · Postgres · Salesforce — amber chips). Each of the 65 dashboard cards now carries `data-roles`, `data-tech`, and `data-topics` HTML attributes; the JS `apply()` function AND-filters all active facets with `hasTag()` substring matching. The `data-text` search field also includes role/tech/topic labels so searching "executive" or "pii" or "snowflake" finds relevant boards. `gen-home.py` GROUPS registry extended to 5-tuple: `(stem, title, subtitle, kind, tags)` where `tags={"roles":[...],"tech":[...],"topics":[...]}`. Render-test: **65 cards / 1 SVG / 0 errors** ✅.
- ⭐⭐ **USER DIRECTIVE (2026-06-27) — LAUNCHER/SHOWCASE UX OVERHAUL — TOP PRIORITY, remaining items (one self-contained piece per run; apply to i-home `gen-home.py` AND the public showcase `analytics-pentaho-space/build/gen_site.py` + `dashboards.json`; mirror the toggle/consolidation concept onto dashboards where it fits). From a UX review of analytics.pentaho.space — the same weaknesses apply to i-home.** ~50 cards on one long page is hard to scan. Implement, in priority order:
  1. ~~**Search + richer filtering.**~~ ✅ DONE (CLOUD RUN #12) — role/tech/topic facet chips + search extended to include facet labels.
  2. ~~**Consolidate Custom + Framework into ONE card per concept.**~~ ✅ DONE (CLOUD RUN #13) — 27 concept cards in i-home / 26 in showcase; Simple HTML ⇄ Framework toggle in each card; CDE as footnote link.
  3. ~~**Persona "Start Here" guided paths.**~~ ✅ DONE (CLOUD RUN #14 i-home + CLOUD RUN #15 showcase) — 4-tile strip in both i-home and analytics.pentaho.space; role-based tour with screenshot links.
  4. ~~**Clarify terminology.**~~ ✅ DONE (CLOUD RUN #14 i-home + CLOUD RUN #15 showcase) — collapsible glossary in both i-home (gen-home.py) and analytics.pentaho.space (gen_site.py) with 6 terms: Simple HTML, CDA, CDF, CDE, CCC, PDC-BIDB-EXT.
  ⚠ **Showcase-repo note (RESOLVED 2026-06-27):** the CI loop NOW checks out `analytics-pentaho-space` at `./showcase` and may edit `build/gen_site.py` + `build/dashboards.json` directly (PUBLIC-SHOWCASE TRACK in the workflow prompt; gated on the SHOWCASE_TOKEN secret) and push to the showcase main. So items 1–4 can be implemented on BOTH i-home (gen-home.py, this repo) and the public site (gen_site.py, showcase repo) by the loop. Maintain the modern-Pentaho palette (#1775e0) + CT timestamps. Each numbered item = one shippable deliverable: build → deploy → render-test (0 errors) → commit → refresh showcase.
- ⭐⭐ **USER DIRECTIVE (2026-06-27) — POSITIONING & SALES-ASSET NARRATIVE (a sharper sales/exec lens on analytics.pentaho.space; bake into the hourly loop; mostly public-site `gen_site.py`/`dashboards.json` + some i-home).** The site currently serves two audiences (exec buyer + SE) and fully satisfies neither. Work these in, one per run, alongside the UX overhaul above (several overlap — do them together where natural):
  1. **Split the narrative by audience.** Lead with the BUSINESS OUTCOME ("is our data estate healthy / governed / cost-efficient?") + a curated **Start-Here path of 4–5 flagship boards**; move the SE/build jargon (CDA, CCC, .wcdf/.cdfde, JDBC) into a clearly-labeled **"How it's built"** track for technical evaluators (the existing framework section becomes the home for that vocabulary). [pairs with UX #3 Start-Here + #4 glossary]
  2. **Reframe the two builds as a FEATURE, not a footnote.** Make the *reason* for Simple HTML vs Framework explicit: **Simple HTML = embed-anywhere / OEM wedge** (drop a board into any app); **Framework = governed, no-code authoring in CDE**. Otherwise "you don't even need their framework" reads as an argument against Pentaho. State the why-two-builds as the point. [pairs with UX #2 consolidate-toggle — put this copy on the toggle]
  3. **Make the "real, running, not mockups" claim true with SLICK ANIMATIONS (user-approved 2026-06-27 — "slick animations are great"; do NOT pursue anonymous-Pentaho live links).** Static JPEGs undercut the strongest line on the page. Add short, polished **animated drill-through clips** of 2–3 flagship boards showing a REAL interaction sequence (filter → charts update → click a bar → detail drawer slides open → drill to another board). Format: autoplay-muted-loop **MP4/WebM** (animated WebP/GIF fallback), tasteful + fast (~4–8s), lazy-loaded so the page stays light. **Capture pipeline:** drive the deployed board with the existing Playwright harness against server.pentaho.space (it already logs in + proxies/rewrites) — use Playwright video recording or a frame sequence, script the interaction, encode with ffmpeg → drop into `analytics-pentaho-space/assets/` and embed on the flagship cards / hero. One slick animation beats 50 screenshots. Also lean into tasteful UI motion site-wide (the hero montage already crossfades; add smooth card hover/reveal transitions + a subtle animated flagship hero) — elegant, never gratuitous.
  4. **Curate a top tier; hide the long tail.** 50×2 = 100 artifacts reads as "we built a lot," not "the right things," and it's a long scroll. Feature a **flagship top tier**; put the rest behind **"explore all 50."** [pairs with UX #1 search/facets + #3 Start-Here]
  5. **State the competitive wedge once, plainly.** Implicit competitors are Collibra / Alation / Atlan / Purview. Add one clear line: **catalog + analytics delivered on ONE platform** (you don't bolt analytics onto a catalog — it's native). Don't oversell; one sentence.
  6. **Proofing pass (it's a sales asset).** Fix "An an animated flow diagram" (appears twice); de-duplicate verbatim twin blurbs ("Trace how data moves across platforms…" repeats 3–4×) — differentiate each or collapse via the build-toggle (UX #2). Sweep for other repeated/filler copy.
  7. **Label the demo data + reconcile the counts.** Add one sentence: *representative synthetic demo data on a single consistent dataset.* Then sanity-check that headline numbers reconcile or are clearly distinct metrics — currently "10K+ / 11.5K columns," "2.9K profiled," and several asset totals (625 / 754 / 14K) look contradictory to a reader and undercut the "one governed foundation" claim.
  8. **Add a short scale/performance note for technical buyers.** 50 boards over CDA/JDBC raises load-time/caching/concurrency questions an evaluator WILL ask — preempt with a line on **cache TTLs + typical query times** (the CDAs already set `cacheDuration`; surface representative numbers).
- ✅ **DONE (2026-06-28, CLOUD RUN #11 on `claude/pdc-analytics-loop-ivozws`) — i-cdf-freshness CATALOG SCAN ACTIVITY CALENDAR (CDF twin parity).** The Custom `pdc-freshness` board already had a GitHub-style SVG heat-grid calendar (`PDC.calendar`, "Catalog Scan Activity" span:3 hero panel — 475 data points from `fact_entity_snapshot JOIN dim_date`, ds+sens filtered, tooltip = date + assets scanned + governed count) but the CDF twin was missing it. Added: (1) new `scan_calendar` DA to `i-cdf-freshness.cda` (same SQL: `to_char(dt.full_date,'YYYY-MM-DD')`, `SUM(entity_count)`, `SUM(governed_entity_count)`, `scanned_date_key<>19000101`; params `ds`+`sens`); (2) span:3 calendar card added at top of grid in `i-cdf-freshness.html`; (3) `BaseComponent` (`calPanel`, listeners `dsParam`+`sensParam`) renders inline SVG heat-grid in teal (`rgba(0,163,154,...)` to differentiate from pipeline-obs's blue) — same coordinate system: weeks across, weekdays down, intensity=sqrt(assets/max), tooltip = date+assets+governed. doQuery-validated: `scan_calendar` → **475 rows** ✅. Custom: **7 cards / 7 SVGs / 11 info dots / 2 selects / 0 errors** ✅; CDF twin: **4 cards / 5 SVGs / 16 info dots / 2 selects / 1 benign 404** (expected CDF i18n behavior, calendar SVG confirmed in 5-SVG count) ✅. **`i-cdf-freshness` now matches the Custom hero panel — the scan activity calendar is the first thing you see on both boards.**
- ✅ **DONE (2026-06-28, CLOUD RUN #10 on `claude/pdc-analytics-loop-ivozws`) — i-cdf-pipeline-obs ACTIVITY CALENDAR + SLOWEST PIPELINES TABLE (CDF twin parity).** The Custom `pdc-pipeline-obs` board had a GitHub-style SVG heat-grid calendar (PDC.calendar, 332-day heatmap) and a Slowest PDI Pipelines table that were missing from the CDF twin. Added both to `i-cdf-pipeline-obs.html` + CDA: (1) **Run Calendar**: two new DAs (`run_calendar` and `slowest`) added to `i-cdf-pipeline-obs.cda`; a `BaseComponent` renders an inline SVG heat-grid calendar (weeks across, weekdays down; intensity = event count; red stroke ring = failure days; tooltip shows date/runs/fails). Same coordinate system as PDC.calendar — 332 data points, 52+ weeks. (2) **Slowest PDI Pipelines**: `TableComponent` backed by the new `slowest` DA (3 rows: entities_summary_view 0.7s, glossary_summary_view 0.1s, entities_temperature_count_view 0s). doQuery-validated: `run_calendar` → 332 rows ✅; `slowest` → 3 rows ✅. Custom: **9 cards / 8 SVGs / 14 info dots / 2 selects / 0 errors** ✅; CDF twin: **8 cards / 7 SVGs / 26 info dots / 2 selects / 1 benign 404** (expected CDF i18n behavior) ✅. **i-cdf-pipeline-obs now matches the Custom board feature-for-feature: trends, lifecycle, integration bars, failing jobs (clickable→drawer), activity calendar, slowest table.**
- ✅ **DONE (2026-06-28, CLOUD RUN #9 on `claude/pdc-analytics-loop-ivozws`) — pdc-command-center "ESTATE HEALTH AT A GLANCE" SEMICIRCLE GAUGES (Custom + CDF twin parity).** Added a new span:3 **gauge dashboard** card to pdc-command-center showing three headline estate KPIs as beautiful semicircle dials: **Governed %** (46.2% → amber), **Metadata Complete %** (56.7% → amber), **Pipeline Success %** (92.2% → green). Uses the existing `PDC.gauge` toolkit primitive (built in a prior run but never deployed anywhere). No new CDA DAs needed — reuses already-fetched `kpi` (governed_pct/completeness_pct, indices [1]/[2]) and `pipeline` (success_pct, index [0]) DAs. Custom `command-center.js`: added gauge card after KPI strip, 3 sub-divs in a `grid-template-columns:repeat(3,1fr)` row, each calling `PDC.gauge(el,{value,max:100,unit:"%",label,goodAt,warnAt,height:190})`. CDF twin `i-cdf-command-center.html`: added matching span:3 card + inline SVG gauge renderer (`_drawSVGGauge`/`_renderGauges`/`_gaugeState`); hooks into existing kpiPanel's `kpi` and `pipeline` XHR callbacks to populate gov/comp/succ values and redraw; `window.resize` listener for responsive reflow. doQuery-validated: governed_pct=46.2, completeness_pct=56.7, success_pct=92.2. Custom: **7 cards / 8 SVGs / 13 info dots / 2 selects / 0 errors** ✅; CDF twin: **no-svg-timeout + benign 404** (expected CDF headless behavior). **`PDC.gauge` now has its first real deployment — a reusable pattern for any future semicircle-dial metric display.**
- ✅ **DONE (2026-06-27, CLOUD RUN #8 on `claude/pdc-analytics-loop-ivozws`) — pdc-governance GOVERNANCE × SENSITIVITY RISK MATRIX (Custom + CDF twin parity).** Added a new span:3 **heat matrix** card to pdc-governance showing governance coverage % for every `(data source, sensitivity level)` cell: red=poor governance on sensitive data (high risk), orange=moderate, green=well-covered. New DA `gov_sens_heatmap` added to both `pdc-governance.cda` and `i-cdf-governance.cda` (48 rows: 12 sources × 4 sensitivity tiers via subquery+CASE sort HIGH→MEDIUM→LOW→Unclassified). Extended `PDC.heatmap` in `pdc-ui.js` with `cellFill(v,max)` hook (custom diverging color scale: red/orange/green by gov%) and `cellTip(rn,cn,v)` hook (rich tooltip: source · sensitivity · %governed · asset count · risk label). `governance.js`: added `pivot` helper + new `ch` heatmap card (rows=sources, cols=sensitivities; `showVals:true`; `height=sources*34+64`); `hm:["gov_sens_heatmap"]` added to PDC.load. CDF twin `i-cdf-governance.html`: new span:3 card with inline JS (doQuery fetch → colored HTML table with same red/orange/green scale + legend; runs 300ms after dashboard.init). doQuery-validated: 48 rows (AWS MEDIUM: 37% governed / 648 assets; BIGQUERY HIGH: 50%/175). Custom: **8 cards / 8 SVGs / 12 info dots / 0 errors** ✅; CDF twin: **no-svg-timeout + benign 404** (expected CDF headless behavior). **The `PDC.heatmap` cellFill/cellTip hooks are now reusable for any future diverging-color matrix.**
- ✅ **DONE (2026-06-27, CLOUD RUN #7 on `claude/pdc-analytics-loop-ivozws`) — i-adoption APPLICATION ↔ DATA SOURCE CHORD DIAGRAM (Custom + CDF twin parity).** Added a new `PDC.chord` radial interconnect to i-adoption showing which applications access which data sources (arc = total accesses; ribbon = app↔source flow; hover to isolate). New CDA DA `app_src_chord` (SQL: `fact_entity_application JOIN dim_application JOIN dim_datasource GROUP BY app, src; 80 rows`) added to both `i-adoption.cda` and `i-cdf-adoption.cda`. Custom `i-adoption.js`: new span:3 card with `PDC.chord({links:ascLinks,height:380,fmt:abbr,caption})`; `asc:["app_src_chord"]` added to `PDC.load`. CDF twin `i-cdf-adoption.html`: new span:3 card with a `TableComponent` (CDF equivalent, since CCC has no chord) showing top app×source pairs ranked by accesses. doQuery-validated: 80 rows (Snowsight↔AWS 158, Sigma↔AZURE_BLOB_STORAGE 158…). Custom render: **6 cards / 5 SVGs / 0 errors** ✅; CDF twin: **6 cards / 5 SVGs / 1 benign 404** (expected CDF i18n behavior). i-home regenerated.
- ✅ **DONE (2026-06-27, CLOUD RUN #6 on `claude/pdc-analytics-loop-ivozws`) — pdc-compliance SOURCE SENSITIVITY 2nd cross-filter (Custom + CDF twin parity).** Board had one filter (Movement Time Range); added **Source Sensitivity** as the 2nd filter (values: Confidential / Internal / Restricted / All Sensitivities). Added `srcsens` param + `src_sensitivities` options DA to both `pdc-compliance.cda` and `i-cdf-compliance.cda`; threaded `srcsens` into kpi (3 movement subqueries), flow_matrix/flow_stacked, restricted_by_source, cross_trend/cross_trend_long, bytes_by_dest_sens (sens_mix + detail DAs stay estate-wide as catalog state). Custom JS switched to Promise.all init pattern (fetches options then sets dual filters); CDF twin adds `srcsensParam` SelectComponent + `srcsensSelect` span + `RP=[["fromkey","rangeParam"],["srcsens","srcsensParam"]]` + `srcsensParam` in listeners on all movement charts + kpiPanel. Validated: src_sensitivities → 4 rows; kpi Restricted filter: cross_boundary 7440→704 (proper subset, sensitive_assets stays estate-wide). Custom `selects:2 / errors:0`; CDF twin `no-svg-timeout` + benign 404 (expected). **pdc-compliance is now dual-filter: Movement Time Range + Source Sensitivity.**
- ✅ **DONE (2026-06-27) — i-home + public site re-skinned to the MODERN PENTAHO CONSOLE palette; published timestamps now CENTRAL TIME (CT).** (1) Sampled the modern
  Pentaho login (`server.pentaho.space/pentaho/content/login/web`, uikit design system) → primary blue **#1775e0** (`primary_80`), login gradient **#1775e0→#764ba2**,
  accents orange #e68c17 / green #63a621; deliberately AVOIDED the legacy `brand:#CC0000` red. Re-anchored `gen-home.py` (i-home) + `gen_site.py` (showcase) palettes on
  these — primary #005bb5→#1775e0, secondary #7d3c98→#764ba2 — keeping ALL existing layout, cards, filters, gradient header and innovations (scope = i-home + public
  site only, NOT the 50 dashboards, per user "don't restyle everything"). Screenshot-verified the deployed i-home reads as a Pentaho console (0 errors). (2) Published
  timestamps (`PUBLISHED`/`last refreshed`) switched from machine-UTC to **Central Time via zoneinfo America/Chicago + literal "CT"** (DST-aware) in both generators.
  Deployed + published to main on both repos. **Future toggle idea (parked unless asked):** unify the 50 dashboards' `pdc-ui.css` primary to #1775e0 too (one-token
  shift; would re-shoot all thumbnails) — left alone to avoid restyling the whole app.
- ✅ **DONE (2026-06-27, CLOUD RUN #4) — PUBLIC SHOWCASE NOW REFRESHES FROM THE CLOUD (the missing end-of-run step).** Until now the loop SKIPPED the
  analytics.pentaho.space refresh because the shooter couldn't reach the cloud server. Ported `analytics-pentaho-space/build/shots.js` to the same cloud-proxy recipe
  as `dash-build/rtest.js` (proxy-aware `request` interception + `http://`→https rewrite + `/opt/pw-browsers` chrome + `PENTAHO_PASS` env), and updated `update-site.sh`
  to pass the server arg through, use explicit-path git (no -A), and publish branch + `HEAD:main`. **Ran it: 51/51 boards shot (Custom + CDF, 0 failed), index.html
  regenerated, published live to analytics.pentaho.space.** ➡ **Every future run must now do the showcase refresh** (no longer skip): `cd analytics-pentaho-space &&
  PENTAHO_PASS='<pw>' ./update-site.sh https://server.pentaho.space/pentaho`. (Showcase list reconciliation: still 50 == 50 deployed HTML/CDF; only enhanced existing
  boards this session, added no net-new dashboards.)
- ✅ **DONE (2026-06-27, CLOUD RUN #5 on `claude/pdc-analytics-loop-ivozws`) — ALL 5 REMAINING SINGLE-FILTER BOARDS NOW HAVE DUAL CROSS-FILTERS (Custom + CDF twin parity). 🎯 EVERY BOARD IS NOW MULTI-FILTER.**
  Completed the final 4 boards that had only one filter (picking up from Run #4 which did command-center + column-health + data-flows Custom/CDF):
  **(Board 4) i-data-integration**: added **Dest Platform** 2nd filter (`platform` param) to `int_platform_flow` + `top_flows` DAs on both Custom CDA + CDF twin CDA; added
  `dest_platforms` options DA (UNION format for twin). Custom JS uses `Promise.all([integrations, dest_platforms])`, 2nd filter label "Dest Platform". CDF twin: added `plSelect`
  span + `platParam` parameter + `IP=[["integration",…],["platform",…]]`; `matrixChart` + `flowsTable` listen to `platParam`; `dest_platforms` SelectComponent. kpi/trend/success/
  by_integration intentionally NOT filtered by platform (they use fact_lineage_event, not connection; estate-wide aggregates remain stable).
  **(Board 5) i-term-stewardship**: added **Term Type** 2nd filter (`ttype` param) to `kpi`, `adoption`, `top_terms` DAs via `COALESCE(NULLIF(term_type,''),'Unknown') LIKE
  ${ttype}` on both Custom CDA + CDF twin CDA; added `ttypes` options DA (UNION format for twin, includes 'Unknown' bucket). Custom JS: `Promise.all([glossaries, ttypes])`,
  2nd filter "Term Type". CDF twin: added `ttypeSelect` + `ttypeParam` + updated `GP=[["glossary",…],["ttype",…]]`; `adoptChart` + `termsTable` + `kpiPanel` listen to `ttypeParam`
  (by_glossary, term_types, depth, reach stay estate-wide). All validated: options DAs return data (3–8 rows each; CDF twins +1 for UNION "All" row); all 5 custom boards render
  `selects:2 / errors:0`; CDF twin `no-svg-timeout` is expected behavior (CDF framework loads async in headless mode — not a failure). **🎯 ALL BOARDS NOW DUAL-FILTER. Secondary
  cross-filter rollout is COMPLETE across the entire suite.**
- ✅ **DONE (2026-06-27, CLOUD RUN #3 on `claude/pdc-analytics-loop-ivozws`) — i-schema-explorer SCHEMA secondary cross-filter (Custom + CDF twin parity).**
  Board had only a Data Source filter; added a 2nd **Schema** filter (top-40 schemas by column count) scoping the KPIs, asset-type breakdown, and column-data-type
  panels via new `schema` param + `schemas` options query on both `i-schema-explorer.cda` and twin `i-cdf-schema-explorer.cda`; schema ranking + key-mix stay
  estate-wide. Custom = `PDC.filters` 2nd control (`Promise.all([cda datasources, cda schemas])`); CDF twin = `schemaParam` SelectComponent + combined
  `DSO=[["ds",…],["schema",…]]` on by_type/data_types + kpiPanel. Both doQuery-validated (data_types VARCHAR 4671→742 for schema=marketing) + render-tested via
  `dash-build/rtest.js` (Custom 2 selects/0 err; twin 2 selects, filter drives redraw, only the benign CDF i18n 404). **🎯 Secondary cross-filter rollout COMPLETE — all boards now dual-filter.**
- ✅ **DONE (2026-06-26, CLOUD RUN #2 on `claude/pdc-analytics-loop-ivozws`) — i-sensitive-domains DATA OWNER secondary cross-filter (Custom + CDF twin parity).**
  Board had only a Domain filter; added a 2nd **Data Owner** filter (6 owners) scoping every panel (KPIs, risk-domain heat, risk rank, sensitivity mix, top terms,
  detail) via new `owner` param + `owners` options query on both `i-sensitive-domains.cda` and twin `i-cdf-sensitive-domains.cda`. Custom = `PDC.filters` 2nd control
  (`Promise.all([cda glossaries, cda owners])`); CDF twin = `ownerParam` SelectComponent + combined `GO=[["glossary",…],["owner",…]]` on all charts + kpiPanel.
  doQuery-validated (risk_rank PII 2220→396 for owner=analytics) + render-tested via `dash-build/rtest.js` (Custom 2 selects/0 err; twin 2 selects, filter drives
  redraw, only the benign CDF i18n 404). **Single-filter boards still open:** command-center, i-column-health, i-data-flows, i-data-integration, i-schema-explorer,
  i-term-stewardship.
- ℹ️ **OLD BRANCH OVERLAP — now dormant (verified 2026-06-27 02:31 UTC).** Earlier today `claude/cdf-cde-dashboard-builder-mc6uj3` did `iteration/v2` work and its
  `2e2498a` (compliance time-range-scopes-whole-board, 2026-06-26 21:50 UTC) **superseded cloud-run-#1's pdc-compliance Source-Sensitivity secondary filter** (linear
  history, no conflict markers → last writer won). **BUT that branch has since pivoted to `dashboard-studio/**`-only work** (its commits since 21:50 — v62/v63
  inspector, thumbnails, flagship.png — touch nothing in `iteration/v2`), and **cloud-run-#2 merged to `main` with ZERO `iteration/v2` conflict.** So this was a
  one-time historical overwrite, NOT an active fight; right now `claude/pdc-analytics-loop-ivozws` (this loop) is the **sole active `iteration/v2` editor**. (Note:
  `claude/dashboard-studio` is fully isolated — only edits `dashboard-studio/**`, never merges to main — and is NOT involved in any iteration/v2 collision, per user.)
  **Watch for recurrence:** if a fresh `iteration/v2` change lands on `origin/main` that this loop didn't author, a duplicate iteration session is running again — the
  fix is session-side (stop the duplicate; separate branches alone don't help since both fast-forward main). The end-of-run `merge origin/main --ours` only catches true
  conflicts, not linear supersession. **Optional:** pdc-compliance could regain a Source-Sensitivity secondary filter ON TOP of the current Time-Range-everywhere
  version (compatible: Time Range scopes all + Source Sensitivity as the 2nd filter) — only if that board is quiet.
- ✅ **DONE (2026-06-26) — pdc-compliance time-range filter now scopes the WHOLE board (fixes the "filter changes only one chart" confusion; Custom + CDF parity).**
  The Time Range filter previously fed only the trend (`cross_trend`), so selecting a range visibly changed almost nothing. Threaded `fromkey` into every
  movement metric (all `fact_lineage_connection` queries — kpi's 3 flow subqueries, flow_matrix/flow_stacked, restricted_by_source, bytes_by_dest_sens) on BOTH
  the Custom board and the CDF twin; relabeled the control "Movement time range". Twin: added `listeners:["rangeParam"], parameters:RP` to flowChart/bytesChart/
  restrictChart + made kpiPanel pass fromkey and listen. doQuery-validated all params at fk=0 and fk=90d (rows on both); both boards render 0 page errors; twin
  range-select re-renders cleanly. (Catalog-state queries sens_mix/sensitive_assets intentionally stay all-time — they're current inventory, not movement.)
  **NOTE: this was the FINAL LOCAL loop run — the loop is moving to the cloud (server.pentaho.space). See CLOUD MIGRATION note at top. Secondary-filter lane
  still open for the cloud: command-center, i-column-health, i-data-flows, i-data-integration, i-schema-explorer, i-sensitive-domains, i-term-stewardship are
  still single-filter.**
- ✅🎯 **DONE (2026-06-26) — DATA INTEGRATION made interactive → LAST STATIC BOARD DONE; EVERY VISIBLE BOARD IS NOW INTERACTIVE.** Added a "see the flows" drawer on
  *Data Moved by Integration*: click an integration → drawer of its **actual flows** (source→dest object · route · records · GB) via new CDA
  `detail_integration_flows` (param `integration`; Snowflake Tasks → its flows). Custom = `PDC.bars` `detail:`; CDF twin = `clickable`+`pdcDetailDrawer`. Both
  validated + drawer confirmed opening (Custom DOM + CDF real CCC click), 0 errors. **MILESTONE: across the suite every board now has metric-definition info dots
  AND a drill/detail interaction.** ➡ **Next lanes (standing direction):** secondary filters on single-filter boards, and net-new visualizations; plus the cloud
  showcase repoint (see CLOUD MIGRATION note at top).
- ✅ **DONE (2026-06-26) — UNSTRUCTURED INSIGHTS made interactive (Custom + CDF parity).** Board was fully static. Added a "see the files" drawer on *Files by
  Extension* (bar + treemap): click an extension → drawer of the **actual file assets** of that type (file · source · owner · sensitivity) via new CDA
  `detail_files_by_ext` (param `ext`; pdf → 500 files; extension derived from dim_entity FILE entity_name via regexp). Custom = `PDC.bars`/`PDC.treemap` `detail:`;
  CDF twin = `clickable`+`pdcDetailDrawer`. Both validated + drawer confirmed opening (Custom DOM + CDF real CCC click), 0 errors. **Only 1 static board left:**
  i-data-integration (next run).
- ✅ **DONE (2026-06-26) — TERM STEWARDSHIP made interactive (Custom + CDF parity).** Board was fully static. Added a "see the entities" drawer on *Top Glossaries
  by Reach*: click a glossary → drawer of the **actual entities it classifies** (entity · term · sensitivity · owner) via `detail_glossary_entities` (param
  `glossary`; PII → 473 entities; reused the pdc-glossary pattern). Custom adds drill→i-privacy; CDF twin = `clickable`+`pdcDetailDrawer`. Both validated + drawer
  confirmed opening (Custom DOM + CDF real CCC click), 0 errors. **Remaining 0-detail boards (standing-direction backlog):** i-data-integration, i-unstructured.
- ✅ **DONE (2026-06-26) — SCHEMA EXPLORER made interactive (Custom + CDF parity).** Board was fully static (0 detail/0 drill). Added a "see the columns" drawer on
  *Largest Schemas by Columns*: click a schema → drawer of **every column in it** (table · column · type · cardinality · rows) via new CDA `detail_schema_columns`
  (param `schema`=structured_schema; e.g. marketing → 1,060 columns). Custom = `PDC.bars` `detail:`; CDF twin = `clickable`+`pdcDetailDrawer`. Both doQuery-validated
  + drawer confirmed opening (Custom DOM + CDF real CCC click), 0 errors. **Remaining 0-detail boards to make interactive (standing-direction backlog):** i-data-integration,
  i-term-stewardship, i-unstructured (each has a by-X bar that could open its constituents).
- ✅ **DONE (2026-06-26) — data-flows topology node-click detail (leverages new `PDC.network` `detail:` / `PDC.openDetail`).** Clicking a platform node in
  i-data-flows "Platform Connection Topology" now opens a drawer of that platform's **actual data movements** (orig→dest object names, route, integration, records,
  GB; in OR out of the platform), via new CDA `detail_platform_flows` (params `platform`=namespace-scheme + `integration`). e.g. s3 → 19 flows incl.
  `curated.sessions → analytics.session_daily · s3 → snowflake · 2770 GB`. doQuery-validated, node-click drawer confirmed opening, 0 errors. Custom-only (the CDF
  twin uses a stacked bar, not a network). ⚠ **De-dup note:** the pre-separation merge had left a *second* `detail_platform_flows` in the CDA (dashboard-studio's
  version, cols source/dest/integration/gb/conns) — removed it; kept the richer one matching our JS. (Reminder: iteration/v2 is now ours alone post branch-split.)
- ✅ **DONE (2026-06-26) — canonicalized the build to stop per-run churn + adopt merged pdc-ui.js features.** The merge brought a newer `build.py` (with an
  idempotent `inject_infodots()` that adds the `pdc-i-css` block to hand-written twins only if absent) and a newer inlined `pdc-ui.js` (network **node-click
  drill-to-detail** / `PDC.openDetail`). First rebuild therefore re-emitted 32 dashboards; committed that canonical output so **future builds are idempotent
  (only i-home's publish stamp changes)** — no more discarding 31 files each run. Verified renders: i-adoption/pdc-applications/i-cdf-storage/i-cdf-cost all
  0 page errors, info dots intact. **Note for future runs:** build churn is now expected = i-home only; commit it normally.
- ⭐⭐ **STANDING END-OF-RUN DIRECTIVE (user, 2026-06-26) — MERGE TO `main` EVERY RUN.** The user watches `github.com/kevinrhaas/solution-engineering/tree/main/iteration/v2`,
  so each run's work MUST land on `main`, not just the working branch (`claude/cdf-cde-dashboard-builder-mc6uj3`). **Run these steps at END OF RUN, after the
  showcase refresh + 193 attempt:** `git fetch origin` → `git merge origin/main --no-edit` → if conflicts: `git diff --name-only --diff-filter=U | while read f; do git checkout --ours -- "$f"; git add "$f"; done; git commit --no-edit`
  (resolve any iteration/v2 conflict with **--ours**) → `git push` (branch) → `git push origin HEAD:main` (fast-forwards main). If `HEAD:main` is rejected non-ff, repeat fetch→merge→push.
  **✅ BRANCH TOPOLOGY FIXED (user, 2026-06-26 — separation done):** the dashboard-studio loop now lives on its **own branch `claude/dashboard-studio`** (writes
  only `dashboard-studio/**`, and is told NOT to merge to main). **THIS loop keeps `claude/cdf-cde-dashboard-builder-mc6uj3` and owns `iteration/v2/**`.** Disjoint
  folders ⇒ **no more shared-branch divergence, push-races, or pdc-ui.js/build.py churn from their side** — those are resolved at the root. `main` is now just the
  optional canonical union (the live site deploys from branches, not main). The end-of-run merge is now **collision-free** (origin/main only carries dashboard-studio's
  disjoint `dashboard-studio/**` changes + iteration/v2 from our own prior merges, so the --ours step will rarely if ever fire). **Stay on this branch; never touch
  `claude/dashboard-studio`.** (History: first main reconciliation 2026-06-26 resolved 48 iteration/v2 conflicts --ours via PR #7; build canonicalized 22296de.)
- ⭐ **DIRECTIVE / RESEARCH (user, 2026-06-25) — DEMYSTIFY FILTERS & PARAMETERS (expose the wiring; do NOT build the metadata model yet).** User finds filter
  setup confusing (esp. the CDF/CDE side — dragging CDA datasources, linking parameters/listeners, no signal when a component is "not fully configured").
  **How it works today (for reference):** params live in 3 places that must agree — (1) CDA `<Parameter name="x">` + `${x}` in the SQL WHERE; (2) the dashboard
  filter that sets a value; (3) the per-component mapping. **Custom (Simple HTML):** `PDC.filters([{id,label,options,def}],load)` → `load()` passes
  `{x:PDC.filterState.x}` into `PDC.load({q:["da",{x:…}]})` → CDA `${x}`. Plain JS, no drag/drop. **CDF twins:** `SelectComponent {parameter:"xParam"}` +
  chart `listeners:["xParam"]` + `parameters:[["x","xParam"]]` → CDA `${x}`. If any of the 3 is missing/misspelled the filter silently does nothing (the
  "not configured" pain). **SCOPED, NO-METADATA-MODEL PLAN (pick up incrementally):** (1) **In-product wiring map** — extend the existing "◴ CDA Queries" ⓘ
  modal (PDC.queryModal already lists each query's params) into a *Filters & Parameters* view: each filter → current value → the queries/params it drives, and
  flag any query `${param}` not wired to a filter. (2) **Build-time check** — scan each CDA + its JS/HTML, warn on `${param}`s no filter feeds and filters whose
  param no query uses. (3) **Authoring guide** — one markdown page: "how to add a filter" for Custom + CDF, the 3-places rule, copy-paste templates.
  **PARKED (longer/larger, per user "lets not go there quite yet"):** adopting the Pentaho **metadata / XMI model** + a full parameter-management/filter-definition
  UI. Revisit as its own initiative.
- ⭐ **STANDING DIRECTIVE (user, 2026-06-25) — METRIC-DEFINITION INFO DOTS ACROSS ALL BOARDS.** User hit "what are dead columns?" and wants subtle, hideable
  definitions on every board. The affordance ALREADY exists: `PDC.infoDot` → a discrete ⓘ on card titles (`PDC.card` `info:`) and KPI tiles (`PDC.kpis` tile
  `info:`) revealing a plain-language blurb on hover/focus (see the working pdc-data-quality example the user confirmed). **Roll out to every board that lacks it,
  ~one per hourly run:** add `info:` to each KPI + chart card, defining the metric/term (what it means + why it matters). **✅ Custom side covered:** pdc-data-quality,
  pdc-compliance, i-column-health, pdc-storage, pdc-cost, pdc-governance, pdc-freshness, pdc-ownership, pdc-pipeline-obs, pdc-command-center, i-profiling,
  i-overview, pdc-glossary, applications, i-privacy, i-exec-scorecard, i-sensitive-domains, i-growth, i-adoption, i-term-stewardship, i-unstructured, i-schema-explorer, i-data-integration, **i-data-flows (DONE this run)**. 🎯 **CUSTOM SIDE 100% COVERED — every visible Custom board has metric-definition info dots** (pdc-redundancy hidden, parked). **✅ CDF INFO-DOT HELPER BUILT (2026-06-25)**, proven on i-cdf-command-center, i-cdf-profiling, i-cdf-overview, i-cdf-glossary, i-cdf-privacy, i-cdf-scorecard, i-cdf-sensitive-domains, i-cdf-growth, i-cdf-adoption, i-cdf-term-stewardship, i-cdf-unstructured, i-cdf-schema-explorer, i-cdf-data-integration, **i-cdf-data-flows (this run)**. Reusable pattern for
  twins: (1) paste the `.pdc-i` + `.pdc-info-pop` CSS block into the twin's `<style>`; (2) paste the `[data-info]` scanner `<script>` (before `</body>`) — it
  finds every `[data-info]` element and attaches the ⓘ, idempotent, runs on DOMContentLoaded; (3) add `data-info="…"` to each card `<h3>` (and KPI label). Copy
  the whole thing verbatim from **i-cdf-command-center.html**. **✅ twins w/ info dots (16):** i-cdf-command-center, i-cdf-profiling, i-cdf-overview, i-cdf-glossary, i-cdf-privacy, i-cdf-scorecard, i-cdf-sensitive-domains, i-cdf-growth, i-cdf-adoption, i-cdf-term-stewardship, i-cdf-unstructured, i-cdf-schema-explorer, i-cdf-data-integration, i-cdf-data-flows, **i-cdf-column-health + i-cdf-compliance (this run)**.
  🎯🎯 **ROLLOUT COMPLETE (2026-06-26).** The last 7 twins (i-cdf-data-quality, i-cdf-storage, i-cdf-cost, i-cdf-governance, i-cdf-freshness, i-cdf-ownership,
  i-cdf-pipeline-obs) already carried info dots — they came in via the **main merge** (the dashboard-studio loop had added them on main, merged cleanly into this
  branch). Verified all 7 render their ⓘ (3–6 dots each, 32 total) with **0 page errors**. **Every Custom board AND every CDF twin now has metric-definition info
  dots.** The "what does this number mean?" initiative is finished suite-wide.
- ✅ **DONE (2026-06-25) — i-home CHANGELOG FOOTER + richer showcase changelog + external link.** Added a "What's new" `<details>` changelog to the i-home
  launcher footer (gen-home.py), mirroring analytics.pentaho.space. BOTH changelogs now render a friendly **headline + a couple of plain-language detail bullets**
  from the commit body (was subject-only), auto-built from `iteration/` git history (i-home: 14 entries / 26 bullets, 0 errors). Added a **"Public showcase ↗"**
  link to the i-home header + footer (→ analytics.pentaho.space).
- ✅ **DONE (2026-06-25) — COLUMN HEALTH made interactive (Custom + CDF parity).** Board was fully static. Added a "see the cleanup backlog" drawer on the
  *Top Tables by Dead Columns* bar: click a table → drawer of its **actual dead/constant columns** (column · type · rows; cardinality=1), respecting the Data
  Type filter, via new CDA `detail_dead_by_table` (params `tbl`+`dtype`; reuses the same `regexp_replace(...,'\1')` table-extraction as the bar query so the
  clicked label matches). Custom = `PDC.bars` `detail:` (no drill — clicked value is a table path); CDF twin = `clickable`+`pdcDetailDrawer`. Both
  doQuery-validated + drawer confirmed opening (Custom DOM + CDF real CCC click), 0 errors.
- ✅ **DONE (2026-06-25) — COMPLIANCE "see the actual audit findings" drawer (Custom + CDF parity).** The hero risk chart *Restricted → Ungoverned by Source*
  was display-only; now clicking a source opens a detail drawer of the **actual offending connections** (orig→dest object names, dest sensitivity, governed
  label, records, GB) via new CDA `detail_restricted_flows` (param `src`=orig_namespace, off `fact_lineage_connection`). e.g. health://ehr →
  `health.patient_phi → external.research_extract_phi · Restricted · Ungoverned · 1.86M records`. Custom = `PDC.bars` `detail:`; CDF twin =
  `clickable`+`pdcDetailDrawer`. Both CDAs doQuery-validated, drawer confirmed opening, 0 page errors.
- ✅ **DONE (2026-06-25) — SENSITIVE DATA DOMAINS made interactive (Custom + CDF parity).** This board was fully static (0 detail / 0 drill). Added a "see the
  detail" drawer on the hero *Top Risk Domains* bar: click a domain → drawer of its **actual HIGH/MEDIUM entities** (entity · sensitive term · sensitivity ·
  owner) via new CDA `detail_risk_domain` (param `glossary`=level_1_glossary, off fact_entity_term→dim_glossary_term→dim_entity; 247 rows for PII). Custom adds a
  drill→i-privacy; CDF twin = `clickable`+`pdcDetailDrawer` (no drill — twin OK). Both doQuery-validated + drawer confirmed opening (real CCC click), 0 errors.
  ⚠ gotcha logged: `SELECT DISTINCT` + `ORDER BY <bare col not in select>` → CDA "Unavailable"; use ordinal `ORDER BY 3,1`.
- ✅ **DONE (2026-06-25) — BUSINESS GLOSSARY made interactive (Custom + CDF parity).** Board was fully static. Added a "see the detail" drawer on BOTH the
  *Term Reach by Glossary* bar AND the *Glossary Reach Treemap*: click a glossary → drawer of the **actual classified entities** under it (entity · term ·
  sensitivity · owner), respecting the current Sensitivity filter, via new CDA `detail_glossary_entities` (params `glossary`+`sens`; 473 rows for PII).
  Custom drills onward→i-sensitive-domains; CDF twin = `clickable`+`pdcDetailDrawer`. Both doQuery-validated + drawer confirmed opening (Custom DOM + CDF real
  CCC click), 0 errors. (Used ordinal `ORDER BY 3,1` per the logged DISTINCT gotcha.)
- ⭐ **STANDING DIRECTION (user, 2026-06-25):** keep the hourly loop pushing on **more filters + more drills + more "see the detail" (drawers/tables) + nice
  visualizations** — preserve the current look, make it **as interactive, fun, and elegant** as possible. This is the default theme for every fire: pick one
  clean filter/drill/detail/viz enhancement per run (maintain Custom⇄CDF twin parity), build → validate → render-test → deploy → showcase/193 at end of run.
- ✅ **DONE (2026-06-25) — i-cdf-applications + pdc-applications "Access by Data Source" click-to-drill → pdc-storage?ds=.** The by-source bar (CDF `srcChart`
  + Custom `c3`) was the last non-clickable by-source chart in the applications pair; both now drill to Storage for the clicked source (CDF: CCC `clickable`+
  `clickAction`→`drillTo`; Custom: `PDC.bars` `drill:{to:"pdc-storage",param:"ds"}`). Twin parity kept. 0 page errors both boards.
- ✅ **RE-SOURCE INITIATIVE FULLY CLOSED (2026-06-25):** the last staging/non-dimensional dependency is gone. The 8 lineage/pipeline boards' month-bucketed
  throughput/run-volume/success **trend DAs** no longer join `v_stg_lineage_event`/`stg_lineage_event` (ETL staging view, md5-nk match for event_date) — they now
  `JOIN dim_date d ON e.event_date_key = d.date_key` (filter `<>19000101`), same `YYYY-MM` buckets, purely from `fact_lineage_event` + `dim_date`. doQuery-validated
  (12 months: gb 665.9 / runs 442 / success 96.8%), 6 boards render 0 errors, committed (`277240d`). **Now EVERY dashboard query sources from facts/dims over the
  bidb MVs** — the only remaining synthetic/non-dimensional ref is `entity_storage_demo`, used solely by the 3 HIDDEN redundancy boards (awaiting a real dedup fact).
- ✅ **DONE (2026-06-24) — LINEAGE-EXPLORER HEADER CONSISTENCY + RENAMES:** (1) lineage-explorer.html now carries the standard **`.pdc-logo` "P" badge**
  in its brand → reads as one product with the other HTML dashboards in the carousel. (2) Renamed → **"Data Lineage Observability"** (page title + brand +
  gen-home registry + dash/home.js + showcase dashboards.json). (3) Naming reconciled into a clean, collision-free **parallel trio**: *Data Lineage
  Observability* (lineage-explorer) · *Data Movement Observability (CDF)* (i-cdf-lineage, already correctly named) · *Data Movement Flows* (i-data-flows +
  twin, the distinct Sankey board — left as-is on purpose). (4) i-home launcher renamed **"PDC Analytics Console" → "Pentaho Data Catalog Analytics"** to
  match the analytics.pentaho.space header. (5) Re-shot the lineage-explorer launcher thumb (new header visible). Render-verified on localhost (logo present,
  titles correct, 0 page errors). ⚠ **Decision flagged to user:** I left *Data Movement Flows* as a distinct board rather than collapsing it into the
  "observability" naming — if the user wanted i-data-flows itself renamed to "Data Movement Observability", revisit (would need to retitle/relocate the
  existing i-cdf-lineage "Data Movement Observability" to avoid a duplicate).
- ~~⭐ **NEXT-RUN DIRECTIVE — LINEAGE-EXPLORER HEADER CONSISTENCY + RENAMES (user, 2026-06-24):**~~ (see ✅ DONE above) in the public-site carousel the **lineage-explorer page looks
  different** from the other HTML dashboards. Three asks: **(1) Header consistency** — `lineage-explorer.html` uses a bespoke `<header>` with a text brand
  `Pentaho· Lineage Explorer` (purple accent dot, NO logo square; CSS at `header .brand`, markup at [lineage-explorer.html:67-68]). Make it match the
  standard toolkit header: the **`.pdc-logo` "P" rounded-square + `.pdc-brand`/`.pdc-header` styling** used by every built dashboard (see
  [pdc-storage.html:220-221] — `<header class="pdc-header"><div class="pdc-brand"><span class="pdc-logo">P</span><span class="pdc-title">…`). Port that
  logo+brand look (and ideally the same icon-button row) into lineage-explorer so it reads as one product. **(2) Rename lineage-explorer** from "Pentaho
  Lineage Explorer" / "Interactive Lineage Explorer" → **"Data Lineage Observability"** everywhere: `<title>` + brand text in lineage-explorer.html, the
  launcher card in `dash/home.js:27` (`t:"Interactive Lineage Explorer"`), and `analytics-pentaho-space/build/dashboards.json` (stem `lineage-explorer`).
  **(3) Make the data-movement dashboard naming consistent** — user wants the "data movement observability" board to share the parallel name. ⚠ **RECONCILE
  CAREFULLY** — `dashboards.json` ALREADY titles `i-cdf-lineage` = "Data Movement Observability" while `i-data-flows` + `i-cdf-data-flows` = "Data Movement
  Flows" (drift). At execution, inspect what each board actually is and converge on a clean, UNIQUE, parallel pair (e.g. **"Data Lineage Observability"**
  for the explorer + **"Data Movement Observability"** for the data-flows board), making sure no two dashboards end up with the same title. Mirror the chosen
  names into the CDF twin `<h3>`/cards (`dash/i-data-flows.js`, `i-cdf-data-flows.html`) and home.js/dashboards.json. **(4) i-home launcher rename** —
  `gen-home.py` currently titles the console **"PDC Analytics Console"** (`<title>` L143, brand `.bt` L204). Rename to **"Pentaho Data Catalog Analytics"**
  (console) to match the public site header on analytics.pentaho.space. **(5) Thumbnails** — all of the above change the rendered headers/titles, so
  re-shoot launcher (gen-home) + showcase (`update-site.sh`) thumbs and reconcile `dashboards.json`. Build+deploy+render-test as usual; commit per change.
- ⭐ **STANDING DIRECTIVE — PUBLIC SHOWCASE REFRESH + REPOSITION (user, 2026-06-24):** `analytics.pentaho.space` needs a richer refresh that **leads
  with "this is a Solution-Engineering demonstration of the power of the Pentaho platform"** — these are **sample visualizations** over a data catalog,
  and the headline value is **"preview the context and visualize the detail when you adopt Pentaho and put it into action"** (i.e. feature our new
  drill-to-detail + descriptions work). Specifics the user gave: **(a)** add a **hero image/visual** — e.g. the lineage **flow** (ex-"Sankey") diagram —
  up top, with the platform messaging. **(b)** Keep the **thumbnail library + preview**, but make the **preview better: it pops open into a window/lightbox**
  with a **"where do I go from here?"** call-to-action (next steps / open live / try another). **(c)** **Re-vibe toward DATA-PLATFORM OBSERVABILITY**
  and **away from pure catalog context.** **(d)** **CDE: mention in passing only — NO CDE images/thumbnails** on the public site (CDE stays off the grid).
  ✅ DONE this pass (text/naming only): "Simple HTML" rename, dropped "(Sankey)" from the data-flows showcase title + softened blurbs, added a passing
  CDE mention to the intro. ✅ **VISUAL/UX WORK DONE & LIVE (verified 2026-06-25):** `gen_site.py` already ships the **rotating-montage hero** (`MONTAGE`
  crossfade layers: lineage-explorer/command-center/storage/pipeline-obs + "Preview the context, visualize the detail" caption) AND the **simple lightbox**
  (`.lb`/`#lbimg`; click any `.shot` thumb or the hero → zoom open; close via ×, backdrop click, or Esc; NO CTA, per the revised answer). Confirmed present on
  the published analytics.pentaho.space. ~~STILL TODO (the visual/UX work — ASK the user before big effort):~~ the hero image, the pop-open preview-window + CTA, and the
  observability repositioning of copy/sections. **Open questions for the user:** (1) hero = static screenshot of the flow diagram, or a live/animated embed?
  (2) the preview "where do I go from here" CTAs — what do they point to? (public visitors can't reach localhost or the VPN-gated 193/225 — so likely a
  "book a demo / contact" CTA or a deep-dive page, not the live dashboard). (3) how far to push the observability reframing vs. keeping catalog content.
  ✅ **USER ANSWERS (2026-06-24) — build to these:** (1) **HERO = ROTATING MONTAGE** — a few hero shots (flow diagram, treemap, run-activity calendar,
  the detail drawer) that auto-rotate to show breadth, with the SE/Pentaho platform messaging + the "preview the context, visualize the detail" line.
  (2) **PREVIEW = SIMPLE LIGHTBOX, NO CTA (user, 2026-06-24 — REVISED, supersedes the earlier "next/related dashboards" CTA answer):** clicking a thumb just
  **pops the dashboard image open bigger** (lightbox of the existing thumbnail) with a **nice way to close / go back** (× button, click-backdrop, Esc). **"Don't go
  crazy there"** — no CTA, no "where do I go from here?", no related-dashboard cycling, no live/external links. Just an elegant zoom-open + close. (3) Repositioning
  toward observability: lead sections with observability framing. **NEXT RUN: implement the montage hero + the simple pop-open preview-lightbox in
  `analytics-pentaho-space/build/gen_site.py`; keep the thumbnail grid; reshoot via update-site.sh.**
- ⭐ **STANDING DIRECTIVE — ENRICH DEMO SAMPLE DATA (user, 2026-06-24):** several charts are thin — **add more sample data into the demo tables that are
  UNIONed with the real MV tables** (the source of all the dims/facts) so the charts have enough cases to be interesting. **CRITICAL CONSTRAINTS:** this must
  be done **as part of the data-generation / sample-load scripts** (NOT ad-hoc inserts), because the **same data has to load to the airlinesample DB behind
  193 AND 225** (so it's portable/repeatable). See memory **[[pdc-demo-overlay-pattern]]** (synthetic demo overlays UNIONed into the matviews; versioned DDL)
  and **[[pdc-deploy-portability]]**. ⚠ **DO NOT touch the user's uncommitted ETL/PDI tree** (`content/utility/`, deploy.sh, ddl/01-setup, 06-seed) — those
  are the user's in-progress backend work; coordinate/ask which script owns the sample-data load before editing. Enriching the data **will change every
  thumbnail**, so afterwards re-run the launcher (gen-home) + public-site (update-site.sh) thumbnail refresh so home AND the showcase update. **Pick the
  thinnest charts first** (re-verify counts at build time). This is a data+ETL task with cross-server impact — **scope it with the user before executing.**
  ✅ **USER ANSWER (2026-06-24):** the **latest v2 load process lives under `iteration/v2/content/`** — look there (`content/ddl/` versioned DDL + the
  demo-overlay seed pattern) to find where the synthetic demo overlays are defined and **extend THAT** so the enrichment is portable to 193/225.
  **NEXT RUN:** map the v2 content load (which DDL/seed builds each demo-overlay UNIONed into the matviews), find the thinnest charts, add more synthetic
  rows in the **versioned DDL/seed** (portable: named PDC-BIDB-EXT + unqualified tables), reload locally + refresh matviews, then re-shoot launcher + showcase
  thumbs. ⚠ Still avoid the user's uncommitted files (00-psql-variables.sql, 06-term-demo-seed.sql, content/utility/ PDI tree) unless the user confirms a
  specific one is right — explicit git paths only, never `git add -A`.
- ⭐ **STANDING DIRECTIVE — METRIC / CHART DESCRIPTIONS (user, 2026-06-24):** charts & top-line metrics should carry a **business+technical
  description** of what they mean — anything not totally obvious gets a short blurb. The user suggested a **hover** on the chart title or the KPI
  (tooltip with the definition), and/or a **small unobtrusive inline description**; pick whatever ends up most elegant (hover alone can feel busy →
  consider a tiny inline caption or a discrete ⓘ that reveals the blurb). Keep it clean, not cluttered. **Plan:** add an optional `info`/`desc`
  field to `PDC.card` (title gets a subtle ⓘ or dotted-underline → tooltip/popover) and to `PDC.kpis` tiles; centralize the copy in a small
  `PDC.describe` map (metric/chart key → {what, why}) so it's reusable + consistent and mirror-able into CDF twins. Roll out across the suite like
  the detail rollout (start on a flagship, prove the pattern, then spread; mirror to twins). **Both** a hover AND an inline option are fine — make
  the toolkit support both and choose per-context. NOT yet started — pick this up as a dedicated deliverable.
  ✅ **STARTED & PROVEN (2026-06-24):** `PDC.infoDot(text)` built — a discrete **ⓘ** that reveals a business+technical blurb on hover/focus
  (one shared `.pdc-info-pop`, keyboard-accessible, unobtrusive). Wired into **`PDC.card` (opts.info → ⓘ after the title)** and **`PDC.kpis`
  (tile.info → ⓘ by the label)** + CSS. **Proven on pdc-storage** (4 KPIs + 6 cards = 10 dots; popover render verified).
  ✅ **CUSTOM ROLLOUT DONE (2026-06-24) — all 8 major analytical boards carry business+technical blurbs on every non-obvious KPI & chart, popover
  render-verified on localhost (zero page errors):** pdc-storage (10), pdc-cost (10), pdc-governance (11), pdc-data-quality (11), pdc-freshness (11),
  pdc-compliance (9), pdc-ownership (8), pdc-applications (9), pdc-pipeline-obs (14). **REMAINING Custom boards** (lower-priority / fewer non-obvious
  metrics): lineage-explorer, pdc-glossary, pdc-command-center, pdc-redundancy, i-* analytical boards (exec-scorecard, sensitive-domains, column-health,
  profiling, growth, privacy, adoption, schema-explorer, unstructured, data-integration, term-stewardship) — add `info:` opportunistically, one or two per run.
  **NEXT BIG STEP — TWIN-INFO MIRRORING (not yet started):** the 26 CDF twins are handwritten and have NO descriptions yet. Chosen approach to build once
  and apply suite-wide: inject a **CSS-only `[data-info]` hover tooltip** (or a tiny inline infoDot helper) into the shared `stamp_handwritten` snippet in
  build.py, then add `data-info="…"` to each twin's chart `<h3>`/KPI — reuse the same copy strings from the Custom `dash/*.js`. Do this as ONE dedicated
  deliverable (build the mechanism + apply to 2-3 twins to prove, then spread). Keep blurbs concrete & business-framed. Consider a central `PDC.describe`
  map for metrics reused across boards (assets, governed%, sensitivity, freshness bands) so Custom + twin share one source of truth.
- ⭐ **STANDING DIRECTIVE — DRILL-TO-DETAIL PREVIEW (user, 2026-06-24):** people want to see **the detail of an item when they click it**,
  not only drill across to another dashboard. **Support BOTH** affordances (the user explicitly noted they contradict and asked for both):
  (a) the existing **drill-through-to-dashboard** (click a slice/bar/node → navigate to the relevant dashboard carrying active filters), and
  (b) a NEW **detail preview** — click an element → a lightweight in-place panel/popover/drawer listing **the ACTUAL underlying rows behind that
  number, ONE ROW PER RECORD (user, 2026-06-24, emphatic):** if a bar/slice/KPI reads **250**, the preview shows **250 real rows** — the individual
  entities/jobs/flows/policies that make up that count, NOT another aggregate or a sampled top-N. Columns = the record's own attributes (name, source,
  owner, sensitivity, bytes, last-scan, policy, etc.). This means a **row-grain detail CDA query** scoped by the clicked datum's key (e.g.
  `WHERE datasource_type = ${clicked}` returning the leaf rows from `dim_entity`/`fact_*` at record grain), NOT the summarized DA that drives the chart.
  Make it scale: virtualized/scrollable list + a visible total ("250 rows") + optional client search/sort; for very large counts page or lazy-load but
  still represent the full set (and show the true total), never silently truncate to a top-N. Design so both affordances coexist: **click = detail
  preview, a small "↗ open dashboard" link inside the preview = cross-drill** (or modifier-click / hover affordance for the cross-drill).
  Build it as a reusable **toolkit primitive** (e.g. `PDC.detail(el, {rows, cols, title, total, drill})`) wired through the existing chart drill hooks
  (`bars/donut/treemap/network/table` already emit the clicked datum), backed by the per-slice **row-grain** detail CDA query.
  Roll out incrementally — start on a flagship (lineage-explorer or pdc-storage), prove the pattern, then reuse across boards + mirror to twins.
  ✅ **SHIPPED & PROVEN (2026-06-24):** `PDC.detail`/`PDC.openDetail`/`PDC.bindDetail` built in pdc-ui.js (right-side drawer: live total badge,
  client-side filter, scroll, `↗ open dashboard` cross-drill link inside; CAP 2000 DOM rows w/ "filter to narrow" note, never silently top-N).
  Detail hook added to `_bars` (both orientations) + `_treemap`. **The count IS the rows — verified E2E:** pdc-storage AWS bar → **1,679 asset rows**
  (== DB), pdc-redundancy AWS → **209 duplicate rows** (== `is_duplicate` DB count). Wired on **pdc-storage** (detail_assets), **pdc-cost**
  (detail_costed: $/mo, GB, CO2e), **pdc-redundancy** (detail_dups: is_duplicate objects) + **i-cdf-storage twin** (self-contained `pdcDetail()`
  via dashboard.getQuery on a mirrored detail_assets DA in i-cdf-storage.cda). **NEXT for this directive:** mirror cost/redundancy CDF twins
  (i-cdf-cost/i-cdf-redundancy — same `pdcDetail()` recipe + add the detail DA to each twin's .cda); roll detail to governance (status→entities),
  data-quality (issue→entities), applications (app→entities), pipeline-obs (job→runs); add detail to **donut/network/table** hooks too. Consider
  factoring the CDF twin drawer into a shared snippet injected by build.py stamp_handwritten so every twin gets it for free (then only wire clickActions).
  ✅ **RUN 2 (2026-06-24): shared injector + 3 more boards + donut hook.** (1) **`pdcDetailDrawer` is now a SHARED snippet** (CSS+JS, raw-doQuery,
  no CDF runtime) injected by `build.py stamp_handwritten` into **all 26 CDF twins** — every twin is now ONE clickAction away from detail (idempotency
  guard: `<style id="pdc-dt-css">`). Refactored i-cdf-storage off its inline copy onto it (-60 dup lines). (2) **Twin parity: i-cdf-cost (1,679),
  i-cdf-redundancy (209)** wired (detail DA + clickAction each). (3) **pdc-governance + i-cdf-governance**: ungoverned bar → detail_ungov (1,679
  ungoverned == DB); fact_entity_snapshot confirmed **1 row/entity** (6496=6496; ungoverned_entity_count is 0/1). (4) **pdc-data-quality**: added the
  **donut detail hook** to `_donut` in pdc-ui.js + completeness-band slice → detail_by_band (5,532 entities; **large-set CAP path verified** — true total
  in the badge, DOM capped 2000 + "filter to narrow" note). **NEXT for this directive:** mirror i-cdf-data-quality (completeness pie → detail_by_band);
  roll to **applications** (app→entities), **pipeline-obs** (job→runs from fact_lineage_event), **freshness/compliance/ownership**; add detail to **network +
  table** hooks (table-row → single-record card). All new twins inherit the drawer automatically — only a clickAction + a row-grain detail DA per board remain.
  ✅ **RUN 3 (2026-06-24): 3 more board-pairs + table hooks.** (1) **i-cdf-data-quality** twin parity — completeness PIE clickAction → detail_by_band
  (5,532 == Custom). (2) **pdc-applications + i-cdf-applications**: app bar → detail_app_entities (Snowsight = **1,116 entities reached** == DB;
  fact_entity_application is 1 row/(app,entity)). (3) **pdc-pipeline-obs + i-cdf-pipeline-obs**: failing-job → detail_failed_runs (top job = **36 failed
  runs** == DB; failed/aborted are 0/1 mutually-exclusive so SUM==rowcount). Twin's failing-jobs is a **TableComponent** → used **postExecution row-click**
  (first CDF table-row detail). (4) **TABLE HOOK added to `PDC.table`** (two modes): `cfg.detail` = aggregate row→records (wired pdc-applications "App
  Reach Detail" table, reuses detail_app_entities, 1,116 rows) + `cfg.recordDetail` = single-record label/value **card** built from the row in hand, no query
  (wired pdc-storage "Largest Objects", new `.pdc-dt-rec` render path + CSS). **Detail now on bars/treemap/donut/table** (Custom) + drawer on all 26 twins.
  **NEXT for this directive:** roll to **freshness** (stale-bucket→entities), **compliance** (sensitivity→entities), **ownership** (unowned→entities),
  **glossary** (term→entities); add the **network**-node hook (PDC.network click→node's records); CDF twin clickActions for any Custom that leads. Pattern is
  turnkey now — Custom: add a detail DA + `detail:{}`/`recordDetail:{}` on the chart; twin: add the same DA + a `clickAction`/`postExecution` calling `pdcDetailDrawer`.
  ✅ **RUN 4 (2026-06-24): 3 more board-pairs.** (1) **pdc-freshness + twin**: scan-freshness band → detail_by_freshband (Stale = **2,500** == DB;
  twin pie strips the "NN. " prefix so its clickAction passes `'%'+label` and the detail matches via suffix LIKE). (2) **pdc-compliance + twin**:
  sensitivity-mix slice → detail_by_sensitivity (MEDIUM = **2,136** == DB). (3) **pdc-ownership + twin**: unowned bar → detail_unowned
  (AWS = **383** == DB; missing_owner_count 0/1 flag). **Detail now on 8 Custom boards** (storage, cost, redundancy, governance, data-quality,
  applications, pipeline-obs, freshness, compliance, ownership) + matching twins. **NEXT for this directive:** glossary (term→entities), the
  **PDC.network node hook** (click a node → its records, e.g. applications/lineage topology), and any remaining donut/bar boards.
- ⭐ **STANDING DIRECTIVE — KEEP `lineage-explorer` FRESH (user, 2026-06-24):** the user specifically loves the flagship Lineage Explorer
  (`lineage-explorer.html` — D3 Sankey⇄Network, blast-radius). EVERY so often give it new cool visuals, more interactivity, and **drilling
  within AND across dashboards**. Also keep its header consistent with the suite (All-dashboards link etc.). ✅ DONE this run: added cross-dash
  drill buttons (Reliability ↗ → pdc-pipeline-obs, Integration Health ↗ → i-data-integration, both carry the selected `integration`),
  table↔map two-way linking (click a Top-Flows row → traces that source's blast radius on the map + highlights sibling flows), and the
  "■ All dashboards" header link. Next ideas: animated Sankey transitions on filter, a 2nd filter (sensitivity/namespace), node→storage drill,
  a timeline scrubber, or path-tracing between two clicked nodes.
- ✅ **NAMING CONSISTENCY across twin trios FIXED (user-reported, 2026-06-24):** Custom⇄CDF⇄CDE now share ONE base name (was drifting, e.g.
  "Unified Executive Scorecard" vs "Executive Scorecard (CDF)"). Aligned 12 launcher titles + 7 CDE titles + 5 CDF `<title>`/headers + 2
  showcase titles. **CONVENTION GOING FORWARD: a CDF twin = `<Custom title> (CDF)`, a CDE = `<Custom title> (CDE)`; the visible page header
  shows the bare base name (the toggle/pill conveys the type).** When adding any new twin/CDE, copy the Custom's exact base name.
- ✨ **POLICY COVERAGE MAP (chord) on pdc-governance (2026-06-24, cool-viz):** 3rd `PDC.chord` reuse — 9 policies ↔ 9 sources, ribbons=assignments,
  `[ds,sens]`-aware (`policy_network` DA over fact_entity_policy×dim_policy×dim_datasource). Custom-only (CCC has no chord).
- ✅ **SUITE VERIFIED HEALTHY ON NEW 193-SNAPSHOT DATA (2026-06-24):** spot-checked 14 dashboards across every domain (storage,
  cost+cost_trend, governance, quality, freshness, applications, glossary, compliance, pipeline-obs, scorecard, data-flows,
  redundancy, ownership) — all doQuery OK on the new data (6512 entities). No new-data breakage. Launcher thumbnails (HTML + 13 CDE)
  already refreshed to new data. **All 13 CDE boards now have real launcher thumbnails** (`display:block` on `.thumb img` so
  object-fit:cover crops; CDE thumbs captured at card aspect ~1.76 to avoid stretch).
- ✅ **PUBLIC SHOWCASE REFRESHED (2026-06-24, user confirmed "go ahead … update … showcase"):** ran `update-site.sh` against the
  new 193-snapshot data — **52 shots / 0 failed, index.html regenerated (51 dashboards, refreshed 2026-06-24 14:34 CDT), published +
  pushed** (`8ab8442`, in sync w/ origin). Reconcile check passed first (showcase json 51 == deployed HTML/CDF 51, no drift). The
  pipeline-obs showcase shot now includes the new run-activity calendar. **193 also redeployed** this run (suite + calendar; 193
  run_calendar doQuery 332 rows verified).
- 🎯 **NEXT cool-viz pick (fresh-context run):** ✅ pipeline-run **calendar heat-strip** SHIPPED (`PDC.calendar` + pdc-pipeline-obs hero
  panel, 2026-06-24). integration→platform network stays REDUNDANT (already chord+network+Sankey elsewhere). Remaining fresh angles:
  reuse **`PDC.calendar`** on another daily series (scan activity / access recency on pdc-freshness; needs a daily-grain DA); a lineage
  **job→dataset blast-radius** (finer grain than integration→platform, reuse `PDC.network`); or a new domain treatment. Verify columns at
  build time (data is the 193 snapshot now).
- ⚠️ **DB IN FLUX + USER ETL WORK UNCOMMITTED (2026-06-24, user FYI):** the user is actively modifying the warehouse DB in the
  backend AND has **uncommitted work in the tree** — `iteration/v2/deploy.sh`, `iteration/v2/content/ddl/01-setup/00-psql-variables.sql`
  (BIDB_HOST .246→.241 / db→pentaho_bidb), and a new untracked `iteration/v2/content/utility/` PDI tree (lineage loader jobs:
  j-lineage-main.kjb, t_PDC_*, j-main-script.kjb, pdc_analysis.properties, …). **DO NOT touch/stage/commit/revert ANY of these —
  they are the user's in-progress backend work.** When committing, ALWAYS use explicit file paths (never `git add -A`).
  **Data is currently unreliable:** `dim_entity.datasource_category`/`entity_category` are ~100% "99. Uncategorized" (15549 rows) —
  degenerate, so the datasource-category↔entity-category chord idea is dead until the backend repopulates categories. **Defer
  data-dependent builds until the DB stabilizes;** re-verify columns/distributions at build time (a column the storage-growth query
  expected was absent this run). Safe meanwhile: pure-toolkit/CSS/JS polish, twin-parity cleanups, repo/doc work.
- **Cool-viz still the priority once DB is stable (2026-06-24):** candidates re-checked — category-chord DEAD (degenerate data);
  lineage job→dataset topology (PDC.network) viable IF lineage tables survive the migration; calendar/heat-strip of pipeline-run
  activity from fact_lineage_event (13.7k events) = genuinely new cool-viz, needs a new PDC.calendar SVG primitive (bigger build,
  do on a fresh-context run); pdc-cost spend-growth trend (reuse pdc-storage growth via first-scan dim_date join, NOT a
  first_scanned column on entity_storage_demo) = safe data-backed trend once data settles.
- **CDE coverage now broad (13 boards, 2026-06-24):** observability, data-movement, cost, quality, freshness, glossary, applications,
  storage, governance, compliance, redundancy, ownership, pipeline-obs. Remaining domains without a CDE board (optional, lower-value):
  privacy, adoption, schema-explorer, column-health, data-integration, growth, term-stewardship, sensitive-domains, data-flows. **Shift
  weight next runs toward a fresh COOL-VIZ (#8) — backlog has gone quiet on viz** (chord/network/Sankey/animations all shipped earlier;
  candidates: lineage job→dataset topology via PDC.network, datasource-category↔entity-category chord, a calendar/heat-strip if
  fact_temperature_daily is loaded on 193/225). Also: dark-mode CDF chrome (26 files, CCC light-color care), stem→filter-id JSON map.
- **Sankeys shipped:** ~~i-data-flows platform→platform~~, ~~pdc-compliance sensitivity→governance~~, ~~i-data-integration
  integration→platform~~ (all DONE). **KPI count-up animation** DONE (suite-wide). Treemaps already exist on pdc-storage,
  pdc-cost, pdc-redundancy. ~~force/network graph (blast-radius)~~ **DONE** (`PDC.network` radial topology + panel on
  i-data-flows). ~~i-cdf-data-flows CDF twin~~ **DONE** (25/25 parity restored). ~~animated chart load-in~~ **DONE** (bars grow,
  donut fade, line draw-in; all respect reduced-motion). ~~Remaining cool-viz: a chord diagram~~ **DONE** (`PDC.chord` radial
  interconnect + Platform Interconnect panel on i-data-flows; reusable for any among-set matrix). ~~reuse `PDC.network` on
  another board~~ DONE (pdc-applications app↔source topology). ~~mirror integration→platform Sankey into CDF twin~~ DONE
  (i-cdf-data-integration). Still: a lineage job→dataset topology; mirror the pdc-compliance sensitivity→governance Sankey
  angle is already covered by i-cdf-compliance's stacked bar. Other polish in this backlog: carry active filter through drill; dark-mode CDF twins (note: CCC chart internals
  use light colors — needs care); per-card business-value lines on the showcase; stem→filter-id map.
- **Sensitivity cross-filter rollout (directive #4 "more filters"):** Storage + Cost + Redundancy + Governance + Freshness + **Data Quality** now have a 2nd Sensitivity filter (Custom + twin) — **6 pairs done**. Remaining candidates: **applications** (fact_entity_application → entity_key), **pdc-ownership**, **pdc-glossary** (dim_entity-joinable). Reuse the pattern (`sensitivities` options DA + `COALESCE(NULLIF(sensitivity,''),'Unclassified') LIKE ${sens}`); leave any "by-sensitivity" breakdown chart on `ds`-only (Cost/Redundancy donut precedent). For **snapshot-grain** dashboards use **`LEFT JOIN dim_entity e ON s.entity_key=e.entity_key`** + source `sensitivities` from `dim_entity` (LEFT keeps "all" totals). ✅ **SENSITIVITY ROLLOUT COMPLETE (9 pairs):** Storage, Cost, Redundancy, Governance, Freshness, Data Quality, Applications, Ownership, Glossary — every Custom dashboard with a sensitivity-joinable grain now has the cross-filter, mirrored to its twin. **Next deliverables should shift to cool-viz / CDE / new angles:**
  - **Reuse `PDC.chord`** on another among-set matrix (e.g. integration↔platform on i-data-integration; or datasource-category↔entity-category).
  - **CDE external-CDA twin** (⭐ CDE priority): fix gen-cde.py to use external `.cda` (cdaPath+dataAccessId) instead of inline sql_sqlJndi (which 500s), then ship one CDE-editable board.
  - **New analytical angle** from rich data: temperature heat-strip/calendar (note: fact_temperature_daily is empty locally — would need data), policy-assignment network, lineage job→dataset topology (reuse PDC.network).
  - **Residual filter-parity cleanups (low priority):** pdc-applications has [sens] but twin has [ds,sens]; pdc-glossary has [sens] but twin has [glossary,sens]. Add the missing dim to each Custom if full alignment is wanted.
- **Parity gap: pdc-applications has [sens] only; its twin i-cdf-applications has [ds, sens].** The Custom never had a Data source filter. To fully align, add a `ds` filter to the Custom (join dim_datasource in kpi/by_app/by_type/reach which currently don't). Small follow-up; low priority.
- ~~**Polish: `PDC.donut` centerCap shows float artifacts**~~ **DONE (2026-06-23)** — snapped the summed total via `parseFloat(total.toPrecision(12))` in `_donut`; verified clean across 5 donut dashboards.
- ~~**Carry the ACTIVE filter through click-to-drill**~~ **DONE (2026-06-23)** — CDF-twin `drillTo` now appends the active `sensParam`; toolkit target side already read it. Verified E2E (i-cdf-storage HIGH → pdc-cost `?ds=AWS&sens=HIGH`, both pre-selected). 6 twins. (Note: could extend to carry a twin's `dsParam` too where the target's clicked-category param isn't `ds` — none currently need it.)
- **Tech debt: `<!--TWIN-->` marker is one-shot.** Once stamped, label/markup changes to the toggle need manual edits to every handwritten CDF file (hit this in the "Classic HTML" rename). Make `stamp_handwritten` re-render the toggle idempotently by matching the existing toggle markup (or keep the marker as an HTML comment alongside).
- **Standalone CDF dashboards (i-cdf-overview/i-cdf-lineage) lack a header toggle** (no twin) — consider a consistent "Framework" pill / "view the Classic suite" affordance so headers feel uniform (directive #3).
- **Dark mode on the CDF twins.** The toolkit/launcher have light/dark; the CDF/CDE dashboards don't. Add a tasteful dark toggle to the CDF header for consistency.
- **Per-dashboard "business value" one-liner** on the showcase cards (directive #1 business-benefits framing) — a short outcome statement under each blurb.
- **Build a stem→filter-id map** (ds / dtype / integration / glossary / range) to prevent drill-target mismatches (hit i-column-health=`dtype`). Could live in a small JSON the drill helper/tests consult.
- **More CDE twins** of the strongest boards (directive #6) via the proven external-CDA `cda_ds()` recipe — one per run when not doing viz/drill.
- ~~**193 CDE render fix**~~ **DONE (2026-06-23)**: ran `pentaho-11-docker-deploy/25-fix-cde-cda-dataservices.sh` on the 193 host (SSH `ubuntu@10.80.230.193` key `~/.ssh/pentaho+_se_keypair.pem`, container `pentaho-server-postgres-pentaho-server-1`). CDE now renders on 193: listDataAccessTypes/getComponentDefinitions 200, both `cde-observability` + `cde-data-movement` `.wcdf` render 200. ⚠ Re-run after any 193 container recreate (the script verifies on `localhost:8080` but 193 maps to host port 80 — patch+restart still apply; verify externally).
- **Underused rich data**: temperature (23.5k files), policies (305), applications (207 accesses) — good fodder for a heat-strip / calendar / flow viz.

## Environment / key facts
- **Servers (all run v2 at `/public/pdc-iteration/v2`):** LOCAL (dev, preferred) `http://localhost:8080/pentaho` (schema `bidb_ext_dev`); **193** `http://10.80.230.193/pentaho` (admin/password, schema `bidb_ext_dev`) — deployed 2026-06-22, **CDE render fix applied 2026-06-23** (`.wcdf` boards render); SSH `ubuntu@…` key `~/.ssh/pentaho+_se_keypair.pem` (env `pentaho-deployment-sample-11-1-0-0-120`); **225** `http://10.80.230.225/pentaho` (admin/password, schema **`bidb_ext`**) — deployed + DB-provisioned 2026-06-22 (busy shared server: Snowflake/BigQuery/MSSQL/prod BIDB conns also live). Login form `j_spring_security_check`. (241 mentioned earlier but **225** is the prod-schema target.)
- ⭐ **DB PROVISIONING = `iteration/v2/deploy-db.sh`** (companion to deploy.sh). The dashboards need a fixed set of warehouse objects in whatever schema `PDC-BIDB-EXT` resolves to. The schema may be a partial/older build → run `PGPASSWORD=<pw> ./deploy-db.sh [--dry-run] [--upgrade-stale] <schema>` (RDS pw `Password1`). ADDITIVE + idempotent (skips existing, never drops); `--upgrade-stale` rebuilds objects the reference schema has newer columns for via rename-backup + recreate in one tx. Default clone source = `bidb_ext_dev` (complete). ⚠ **The FDW source catalog `10.80.230.246`/`.241` is NOT reachable from the RDS** (AWS, no VPN route) → the `content/ddl` "build from source" path can't run from here; clone-from-`bidb_ext_dev` (same DB, same catalog) is the equivalent that works.
- ⭐ **PORTABILITY CONTRACT (2026-06-22, user requirement) — connect by NAME, resolve host+schema on the server:**
  Every CDA connects to the **named** datasource **`PDC-BIDB-EXT`** and all queries use **UNQUALIFIED table names** (no `schema.` prefix). The real host + schema are resolved by that connection's `POSTGRESQL.currentSchema` on each server, so the *same* content runs anywhere. Per-server `PDC-BIDB-EXT`:
  - LOCAL: host `test-db`, db `bidb_ext_dev`, **currentSchema `bidb_ext_dev`** (Postgres `bidb_ext_dev` @ `localhost:15433` outside Docker; `test-db:5432` inside). `deploy.sh` (re)creates this only for localhost.
  - 193: host `airlinesample.cyj079bqebpx.us-west-2.rds.amazonaws.com:5432`, db `postgres`, user `postgres`, **currentSchema `bidb_ext_dev`** — pre-provisioned, verified live. ✓
  - 241 (TODO before deploy): same RDS pattern but **currentSchema `bidb_ext`** (the prod schema). Provision `PDC-BIDB-EXT` there once, then deploy — no content changes needed.
- ⚠ **CRITICAL**: CDA `sql.jndi` resolves the **managed** JDBC datasource registry, NOT simple-jndi. `PDC-BIDB-EXT` MUST exist as a managed connection on the target server or every doQuery 500s. `deploy.sh` (re)creates it **only for localhost**; for remote servers it assumes the connection is pre-provisioned and does **not** clobber it (`FORCE_CONN=1` to override). Local create: `curl -u admin:password -X PUT http://localhost:8080/pentaho/plugin/data-access/api/datasource/jdbc/connection/PDC-BIDB-EXT -H "Content-Type: application/json" --data '{"name":"PDC-BIDB-EXT","accessType":"NATIVE","databaseType":{"shortName":"POSTGRESQL"},"hostname":"test-db","databaseName":"bidb_ext_dev","databasePort":"5432","username":"postgres","password":"password","using_pool":true,"connectionPoolingProperties":{},"extraOptions":{"POSTGRESQL.currentSchema":"bidb_ext_dev"},"attributes":{}}'`.
- ⚠ **NEVER schema-qualify table names in `.cda` queries** (no `bidb_ext_dev.` / `bidb_ext.` prefix) — it breaks portability across servers with different schema names. Rely on `PDC-BIDB-EXT`'s `currentSchema`. (Old VPN warehouse, historical: RDS `10.80.231.105:5432` `postgres`/`Password1`.)
- ⚠ Local Pentaho has **no Analyzer plugin** → `.xanalyzer`/`.xdash` cannot render locally (HTML/CDA dashboards unaffected).
- ✅ **CDE plugin FIXED (2026-06-21).** It WAS broken (`MetaModelManager` NPE on static init). Root cause: CDA's
  `listDataAccessTypes` 500'd — its **dataservices** data-access types reference a PDI class missing from this image
  (`ClassNotFoundException: …IDataServiceClientService$IStreamingParams`); CDE calls listDataAccessTypes during init,
  so the whole CDE editor/renderer died. **Fix applied:** removed the 3 dataservices entries from CDA's
  `…/system/cda/resources/components.properties` (backup `.bak` in-container) + restarted. Now `listDataAccessTypes`,
  `getComponentDefinitions`, the CDE **editor** (`.wcdf/edit` → 200) and CDE **render** all work. **Persist after any
  container recreate:** `pentaho-11-docker-deploy/25-fix-cde-cda-dataservices.sh` (idempotent).
  ⚠ Remaining: a CDE dashboard's **inline** `sql_sqlJndi` datasource compiles to an in-memory `<name>.cda` whose
  doQuery 500s (charts blank) — for `gen-cde.py` prefer **external-.cda datasources** (cda-over-cdaFile: `cdaPath`+`dataAccessId`
  pointing at a real deployed `.cda`) instead of inline. (CDE editor/render themselves are confirmed working.)
- Mondrian catalog `PDC`, JDBC datasource `PDC-BIDB-EXT`. Cubes 71–80 (+ lineage 79/80 enriched).
- Branding: ops-console blue `#005bb5` / purple `#7d3c98`; toolkit in `dash-build/` (pdc-ui.css+js, build.py).
- Publish: `pdc-analysis/utility/push-content.sh <localdir> <repopath> 10.80.230.193:80 admin password`;
  `push-cube.sh` for Mondrian; CDA cache clear `GET /pentaho/plugin/cda/api/clearCache`.
- ⭐ **LOCALHOST DATA SNAPSHOT FROM 193 (2026-06-24, user request — keep localhost VPN-independent for data):** localhost's
  warehouse was refreshed to mirror **193's RDS `bidb_ext_dev`** (the user rebuilt 193's data). **New counts (localhost == 193 now):
  dim_entity 6512, fact_entity_snapshot 6496, entity_storage_demo 6496, fact_lineage_event 16737, fact_lineage_connection 10992,
  dim_glossary_term 149, fact_entity_term 2100, governed 32.3%** (was 13975/576/10.1% — the new dataset is smaller & better-governed).
  Monthly cost ≈ $97.5K (was $318.7K). ⚠ `*_category` columns degenerate on BOTH (never populated — not a migration artifact).
  **METHOD (repeatable):** per-relation cross-server COPY pipe (NOT pg_dump — the 27 source matviews + 33 FDW foreign tables →
  `remote_bidb`@10.80.230.246 won't refresh off-VPN). For each of the **34 shared relations** (localhost plain tables ∩ RDS
  tables+matviews; the RDS `*_view_demo` / `*_bak_20260624` are skipped):
  `PGPASSWORD=Password1 psql "host=airlinesample.cyj079bqebpx.us-west-2.rds.amazonaws.com dbname=postgres" -qAt -c "\copy (SELECT * FROM bidb_ext_dev.<R>) TO STDOUT"`
  ` | PGPASSWORD=password psql "host=localhost port=15433 dbname=bidb_ext_dev" -1 -v ON_ERROR_STOP=1 -c "TRUNCATE bidb_ext_dev.<R>" -c "COPY bidb_ext_dev.<R> FROM STDIN"`.
  `-1` = atomic (TRUNCATE+COPY one txn → failure preserves old data). ⚠ Do NOT use `\copy FROM STDIN` inside a `-f` script (reads the
  script, not the pipe → silently loads 0 rows). Backup first: `pg_dump -n bidb_ext_dev -Fc` (kept `/tmp/pwshots/local_bidb_ext_dev_*.dump`).
  Then `clearCache`. **localhost is now self-sufficient — no VPN needed for data.** Re-run this pull when 193's data changes again.
- Data reality: storage bytes & cost are ~0 in PDC → use the durable `entity_storage_demo` table
  (`pdc-analysis/ddl/06-seed/03-entity-storage-demo.sql`). owner_name mostly empty (stewardship-gap story).
  Real & rich: governance/quality/sensitivity/freshness counts, temperature (23.5k files), glossary (576 terms),
  applications (207 accesses), policies (305), lineage (seeded: 7 integrations, 13.7k events).
- Deploy this iteration's full suite to its OWN server repo path: `/public/pdc-iteration/v2` (via `./deploy.sh`).
- Playwright lives in `/tmp/pwshots` (reinstall `npm i playwright` + `npx playwright install chromium` if /tmp was cleared). Login via `ctx.request.post(.../j_spring_security_check,{form:{j_username:'admin',j_password:'password'}})`.

## DONE
- **🎬 SHOWCASE HERO + LIGHTBOX + DESCRIPTIONS ROLLOUT (2026-06-24, loop run — 6 deliverables):**
  **(1) Rotating-montage hero** on `analytics.pentaho.space` (`gen_site.py`): the static launcher shot is replaced by a 5-shot auto-crossfade
  (lineage-explorer flow → command-center → storage treemap → pipeline activity → launcher) with the **"Preview the context, visualize the detail —
  when you put Pentaho into action"** tagline. **(2) Simple pop-open lightbox** (per user revision — NO CTA): clicking any thumbnail now opens the image
  bigger in an in-page lightbox (× / backdrop / Esc to close) instead of a new tab; hero is also clickable. Playwright-verified: montage rotates, lightbox
  opens & closes, zero page errors. **(3–6) Metric/chart descriptions** (`info:` blurbs) added to 7 more Custom boards — cost, governance, data-quality,
  freshness, compliance, ownership, applications, pipeline-obs — completing all 8 major analytical boards (storage was already done). 8–14 ⓘ dots each,
  popover render-verified on localhost, zero errors. All committed/pushed (showcase repo + solution-engineering). **Twin-info mirroring remains the next
  big descriptions step** (see the descriptions directive note above for the chosen CSS-`[data-info]` approach).
- **✨ CATALOG OBSERVABILITY CUSTOM TWIN — completes the trio (2026-06-24, user-reported: "showcase missing a catalog observability html; want twins for everything, triplets w/ CDE")**:
  "Catalog Observability" existed only as standalone CDF (`i-cdf-overview`) + CDE (`cde-observability`) with NO Classic HTML sibling. Built the
  Custom toolkit twin **`i-overview`** (dash/i-overview.js) **reusing `i-cdf-overview.cda`** — 4 KPIs + assets-by-source bar (drills→pdc-storage) +
  governance donut + discovery-trend line + sensitivity donut + completeness bars + source-scorecard table; `[ds,sens]` filters. Registered in
  `TWINS`, injected the Classic HTML⇄Framework toggle into the CDF side (re-added a `<!--TWIN-->` marker to i-cdf-overview.html — these standalones
  had lost it), added launcher card + showcase Custom card. **Render-tested: 6 cards, KPIs tie to the CDF (6.5K/12/32.3%/72.5%), 5 charts + 9-row
  scorecard, toggle present, 0 empty / 0 errors. Suite now 68 (26 Custom / 26 Framework / 16 CDE); showcase 52 (26/26).** Committed `2732d2e`.
  ⚠ **REMAINING TWIN GAP: `i-cdf-lineage` ("Data Movement Observability") is the last standalone CDF without a Custom twin** — but its natural
  Custom counterpart is the **lineage-explorer flagship** (Sankey/network). Decide next run: either point a twin toggle between them, or build a
  lean Custom `i-lineage` twin of i-cdf-lineage. (Pattern is now proven: reuse the CDF's .cda, add TWINS entry + `<!--TWIN-->` marker + launcher/showcase card.)
- **✨ LINEAGE-EXPLORER SENSITIVITY FILTER (2026-06-24, keep-fresh directive / more filters)**: 2nd filter on the flagship (All/Restricted/
  Confidential/Internal) scoping the map + Top-Flows table + governance-risk KPIs by `source_sensitivity` (added `sens` param to edges/topflows/
  kpis-connection DAs). Throughput/run KPIs stay integration-level by design (a run moves mixed-sensitivity data). Render-tested: flows 25→11 on
  Restricted, map redraws to 9 nodes, 0 errors. Committed `3ac128d`.
- **✨ JOB → DATASET BLAST-RADIUS TOPOLOGY on pdc-pipeline-obs — 3rd `PDC.network` reuse (2026-06-24, directive #8 cool-viz / the queued "lineage job→dataset topology" pick)**:
  full-width radial node-link elevating the board's existing "Top Failing Jobs" (pill was already "blast radius"). Top **14 jobs** (by
  bytes moved, filter-aware) connect to the **destination platforms** they feed (snowflake/s3/postgres/bigquery); **edges sized by GB
  moved**, **jobs with failed/aborted runs render red** (`--bad`), healthy jobs green, platform hubs purple; hover a node to isolate its
  blast radius. New `job_topology` CDA (`fact_lineage_connection` × `dim_lineage_job` + a `fact_lineage_event` failure flag, `[integration,
  range]`-aware). Render-tested in a real browser: **18 nodes / 14 edges, 6 KPIs, 9 cards, 0 empty panels, 0 doQuery errors, 0 page errors**.
  Launcher thumb refreshed. Committed `380d812`, pushed. PARITY: CCC has no node-link → Custom-only (like Sankey/chord/calendar); twin
  `i-cdf-pipeline-obs` keeps CCC. **`PDC.network` now on 3 boards (i-data-flows, pdc-applications, pdc-pipeline-obs).**
  ⚠ **GOTCHA logged (cost me a long detour this run):** `regexp_replace(...,'...$','\1')` — the regex **`$` anchor collides with CDA's
  `${param}` substitution** → 500. Drop the `$` anchor (greedy `.*` already reaches end). ⚠ **VALIDATION GOTCHA:** logging in via Playwright
  `ctx.request.post(j_spring_security_check)` does **NOT** establish a session valid for `ctx.request.get(.../doQuery)` — every doQuery 500s
  with the generic "Unavailable" page even though the server is perfectly healthy. **Validate doQuery from a real PAGE context** (`pg.goto`
  the dashboard; charts run doQuery client-side) — that's the reliable signal. (I wrongly restarted the localhost container chasing this; it
  was a no-op — the server was fine, my `ctx.request` validations + a stray `:dashboards:` path segment were the only thing broken.)
- **✨ CATALOG SCAN ACTIVITY CALENDAR on pdc-freshness — 2nd `PDC.calendar` reuse (2026-06-24, cool-viz / queued backlog item)**:
  full-width scan-activity heat-strip (assets scanned per day, **476 active days** Jan-2025→Jun-2026, max 900/day; tooltip adds governed
  count) honoring the dashboard's `[ds, sens]` filters via a new `scan_calendar` CDA (`fact_entity_snapshot` × `dim_date`, ds+sens joins).
  **Generalized `PDC.calendar`'s tooltip** — dropped the pipeline-only "no failures" line, added an optional `cfg.tip2(rec)` extra line — so
  the primitive now fits any daily series (not just pipeline runs). Built/deployed localhost, doQuery 10/10 OK (sens=HIGH → 323 days/1050
  assets = the HIGH total), Playwright: 539 cells, 0 page errors. Launcher thumb refreshed. Committed `05cefb4`.
  ⚠ caught + fixed a self-inflicted syntax error first (opened an inner string with `"`, closed with `'` → broke the whole inlined toolkit;
  `node --check` + an `od -c` byte-dump pinpointed it). PARITY: CCC has no calendar → Custom-only (like Sankey/chord); i-cdf-freshness keeps CCC.
  **`PDC.calendar` now on 2 boards (pipeline-obs runs, freshness scans).** Next reuse candidate: access-recency, or the lineage blast-radius (PDC.network).
- **✨ CDA-QUERY INSPECTOR — NOW SUITE-WIDE across all 67 dashboards (2026-06-24, directive #10 parity follow-on / loop run):**
  carried the discrete ⓘ from the Custom suite into the **27 CDF/standalone/lineage** dashboards and the **16 CDE** boards.
  - **CDF/standalone/lineage:** `build.py` gained `QM_SNIPPET` + `inject_query_inspector()`, called in `stamp_handwritten` — idempotently
    (guard on `pdcQueryModal`) inserts a header **ⓘ** button (before the All-dashboards link, else before `</header>`) + a self-contained
    modal `<script>` (explicit hex colors so it works on any CDF page; derives the `.cda` content URL from the file's global `CDAPATH`
    var, fetches + DOMParser-parses, lists data accesses + params + SQL + copy). 27 files, exactly 1 button/modal each, idempotent on rebuild.
  - **CDE (16):** `gen-cde._brand_header(title, name)` adds an ⓘ **link** in the header `.right` group → opens the deployed `.cda` content
    (the queries) in a new tab. A link, not a modal, because a `<script>` injected via a CDE `LayoutHtml` does not reliably execute.
  - **Validated:** built + deployed localhost; Playwright — i-cdf-governance ⓘ opens the modal (8 data accesses, first `kpi`, 0 page errors);
    cde-cost ⓘ link present + href resolves (both `:public:…` and `public:…` repo-path forms return 200). Committed `932d5e9`.
  **🎉 Directive #10 fully satisfied: every dashboard (Custom/CDF/CDE) now exposes its CDA SQL via a discrete, no-clutter ⓘ.**
- **✨ BIG RUN (2026-06-24, user "big bold deploy") — 3 deliverables: query inspector + CDE branding + 3 new CDE boards:**
  - **① DISCRETE CDA-QUERY INSPECTOR on every Custom dashboard (NEW directive #10).** A quiet header **ⓘ** button (`#qInfoBtn` →
    `PDC.queryModal()`) + the per-panel faint **provenance caption is now click-to-open**; both open a clean read-only modal that
    fetches the deployed `.cda` via the repo content API, parses it with DOMParser, and lists every data access (id + params + SQL +
    copy button). Cached per page. No view clutter. All 24 Custom dashboards via one toolkit+template change (pdc-ui.js/css + build.py).
    Playwright: modal opens (8 data accesses on pdc-storage), Esc closes, provenance reopens, 0 errors. Committed `47548f0`.
    **TODO follow-on:** carry ⓘ into the 26 CDF twins (hand-written headers — small require-side fetch+modal) + CDE boards.
  - **② BRANDED ALL 16 CDE BOARDS (user "gentle style elements … rip off html snippets for headers").** Every CDE board now gets a
    self-contained branded **header** (Pentaho dark-blue gradient bar, P logo, title, "CDE" pill, All-dashboards link) + **card-styled
    chart panels**, injected via `build()` in gen-cde.py (inline `<style>` inside a `LayoutHtml`; **transparent-border gutter** keeps the
    2-up charts side-by-side without wrap — border-box). The bare unstyled CDE look is gone.
  - **③ 3 NEW CDE BOARDS** over portable external CDAs: **cde-privacy** (PII/classification term reach / sensitivity mix / exposure by
    source), **cde-data-integration** (GB / run share / success rate by integration), **cde-growth** (assets by source / by sensitivity /
    cumulative growth). Now **67 dashboards (25 Custom / 26 Framework / 16 CDE).** All deployed localhost, doQuery 3/3 each, Playwright
    headers+charts render side-by-side, 0 errors. Committed `66d4e46`. CDE launcher thumbs regenerated (all 16, now branded).
  - **④ cool-viz/drills/filters (ongoing directive):** served this day by the **PIPELINE RUN ACTIVITY CALENDAR** (`PDC.calendar`, see
    below). Not forcing another new viz this run (balancing the user's full ask). **Backlog:** reuse `PDC.calendar` on pdc-freshness
    (daily scan recency — needs a daily-grain scan DA); a lineage job→dataset blast-radius (reuse `PDC.network`).
- **🩹 SENSITIVITY/PRIVACY DATA FIX — re-snapshot localhost from 193 (2026-06-24, user: "minor data problem on sensitivity, fixed on 193 & 225")**:
  the **Sensitive Data & Privacy** dashboard (i-privacy + i-cdf-privacy) showed **0 privacy-classified assets / 0 privacy terms** and three
  "No data" panels on the public showcase. **Root cause: NOT `dim_entity.sensitivity`** (identical on localhost & 193: MEDIUM 2136 / LOW 2036 /
  empty 1290 / HIGH 1050) — it was **`dim_glossary_term` term NAMING**: the privacy panels match glossary terms against
  `~ '(pii|restrict|classif|sensitive|confidential|gdpr|hipaa|pci|phi|secret|personal)'`, and localhost's glossary lacked the
  privacy-classification term names that 193 now has (193 returned 1680 assets / 8 terms; localhost 0/0, despite identical row counts
  fact_entity_term 2100 / dim_glossary_term 149). **Fix: full 34-relation re-snapshot from 193's `bidb_ext_dev`** via the documented atomic
  per-relation COPY pipe (backup first → `/tmp/pwshots/local_bidb_ext_dev_*_presens.dump`; `-1` TRUNCATE+COPY per relation; clearCache).
  **Verified: localhost privacy query now 1680 assets / 8 terms (= 193); i-privacy + i-cdf-privacy render with 0 "No data" panels / 0 page
  errors** (Privacy Classification Reach 8 PII/PCI/Confidential terms ×210, Exposure by Source 7 srcs ×240, Term×Source heatmap full).
  Refreshed i-privacy launcher thumb + public showcase. Only the privacy pair uses that glossary-name join (sensitive-domains is
  sensitivity-donut based, unaffected).
- **✨ NEW COOL-VIZ — PIPELINE RUN ACTIVITY CALENDAR heat-strip + `PDC.calendar` primitive (2026-06-24, directive #8 cool-viz / the flagged "next cool-viz" pick)**:
  built a new reusable **`PDC.calendar(el,cfg)`** toolkit primitive — a GitHub-style daily-activity calendar (weeks across, weekdays down;
  each cell's blue intensity = event volume that day via a √-lifted opacity ramp over `--pentaho`; **days with failed/aborted runs get a
  red ring**, theme-aware, hover tooltip = date/events/runs/fails). Added a full-width **hero panel** "Pipeline Run Activity Calendar" to
  **pdc-pipeline-obs** over a new `run_calendar` CDA data access (`fact_lineage_event` × `dim_date`, daily SUM of event/started/failed+aborted,
  same `[integration, range]` filters as the rest of the board). **Data: 332 active days Jul-2025→Jun-2026, max 514 events/day, 207 days
  with failures.** Built + deployed localhost, **doQuery 9/9 OK** (run_calendar 332 rows), **Playwright (cache-bust): calendar card found,
  332 cells / 207 failure-ringed / 0 page errors** — screenshot confirms the contribution-grid look (blue density + red failure rings +
  month/weekday labels). Launcher thumbnail refreshed (now shows the calendar). Committed `490be70` (+ thumb `b5e2b9d`), pushed. ⚠ PARITY:
  CCC has no calendar/heat-strip (same as Sankey/chord/network) → twin `i-cdf-pipeline-obs` keeps its CCC charts; calendar is a Custom-only
  cool-viz by the established convention. **`PDC.calendar` is now reusable** for any daily-series heat-strip (e.g. scan activity, access recency).
- **✨ CLOUD SPEND GROWTH TREND on pdc-cost + twin (2026-06-24, NEXT item 2 / trend depth — single clean deliverable; DB mid-work so kept to non-category data)**:
  added a full-width **Cloud Spend Growth** trend (cumulative `monthly_cost_usd` over each asset's first-scan month) to **pdc-cost**
  and its **i-cdf-cost** twin, reusing the proven pdc-storage footprint-growth pattern (`fact_entity_snapshot`→`dim_date` first-scan
  CTE joined to `entity_storage_demo`, window SUM). Custom: new `cost_trend` DA (month/cost/cum_cost) + `PDC.line` area panel. Twin:
  `cost_trend` DA (month/cum_cost, 2-col for CCC) + `CccLineChartComponent` growthChart (added the component to the require list) in a
  span3 card; `[ds,sens]` filters wired on both. **Built + deployed localhost, CDA-validated (both: 11 months Jul-2025→May-2026,
  cumulative ends $318,669 = the known monthly-cost total — consistency check passed). Playwright (cache-bust): both doQuery 8/8 OK,
  "Cloud Spend Growth" panel renders (Custom area line; twin line = 9 paths), 0 data errors (lone benign 500 = the CDF
  messages_supported_languages localization probe).** Screenshot confirms the curve rising $46K→$319K with the 2026-Apr jump. ⚠ Kept
  strictly to non-category data (DB still mid-migration: `dim_entity.*_category` degenerate). Committed `c944676`, pushed (explicit
  file paths only — user's uncommitted ETL work left untouched).
- **🩹 SHOWCASE BACKFILL — 13 missing HTML/CDF dashboards added (2026-06-24, user-reported drift)**: user noticed the public
  showcase (analytics.pentaho.space) showed only **38** dashboards while i-home had **64**, and **lineage-explorer was missing**.
  Root cause: `analytics-pentaho-space/build/dashboards.json` is HAND-CURATED and never grew with the suite (CDE 13 are off-showcase
  by convention, but 13 HTML/CDF were silently missing). Added all 13 next to their Framework twins with blurb + per-card `value`:
  **lineage-explorer, i-adoption, i-growth, i-privacy, i-profiling, i-schema-explorer, i-unstructured, pdc-applications, pdc-freshness,
  pdc-glossary, pdc-ownership, pdc-pipeline-obs, pdc-redundancy**. Updated launcher blurb count. **Re-ran update-site.sh: 52 shots /
  0 failed, index.html regenerated to 51 dashboards (refreshed 12:13 CDT), all 13 stems verified present in index.html, pushed
  `6803435` (HEAD==origin/main).** Showcase now == deployed HTML/CDF count (51). Added a per-run RECONCILE directive (see directive #1)
  so dashboards.json is diffed against gen-home HTML/CDF stems every run to prevent re-drift.
- **✨ 5 NEW CDE BOARDS — CDE coverage of governance/compliance/redundancy/ownership/pipeline-obs (2026-06-24, ⭐ CDE priority / directive #6, 5x-cadence run)**:
  added **cde-governance, cde-compliance, cde-redundancy, cde-ownership, cde-pipeline-obs** via the proven external-CDA recipe
  (`cde_board()` helper → deployed `.cda`, PDC-BIDB-EXT, unqualified tables) — now **13 CDE boards / 64 dashboards (25 Custom /
  26 Framework / 13 CDE)**. Each is a true CDE-authored `.wcdf`/`.cdfde`, editable in Pentaho CDE, 3-chart (2+1) layout:
  - cde-governance: governed % by source (bar) / governance-status mix (pie) / ungoverned by source (bar)
  - cde-compliance: restricted-to-ungoverned flows by source (bar) / asset sensitivity mix (pie) / GB by destination sensitivity (bar)
  - cde-redundancy: duplicate assets by source (bar) / reclaimable TB by sensitivity (pie) / reclaimable TB by source (bar)
  - cde-ownership: missing-owner assets by source (bar) / owned-vs-unowned (pie) / owned % by source (bar)  *(Owned=0 = the catalog's 100%-unassigned stewardship-gap story)*
  - cde-pipeline-obs: job success rate by integration (bar; dbt 97.2% best → PDI 89.7%) / lifecycle event mix (pie) / failures by job (bar; top offender 36)
  5 new portable `.cda` files (no-param, modeled on the matching pdc-*/i-* dashboard queries) + 5 `cde_board()` calls in gen-cde.py
  + 5 gen-home launcher cards (CDE kind, each in its domain group). **Deployed localhost AND 193 (New 15, Failed 0 each),
  CDA-validated (15/15 data accesses doQuery OK with rows on localhost; 2 spot-checked OK on 193), Playwright (cache-bust) all 5
  `.wcdf/generatedContent`: doQuery 3/3 OK / 4 SVGs / charts populate (14–33 shapes) / 0 page errors each.** CDE boards use the
  gradient launcher fallback (consistent with existing CDE cards — none in launcher-stems.txt) and remain off the public showcase
  by convention (bare generatedContent, no branding). Committed `0741061`, pushed. ⚠ Reused-lesson held: all titles XML-escaped `&amp;`.
  ⚠ Playwright reinstall needed mid-run (/tmp/pwshots was partially cleared — `playwright` pkg had only lib/types; `npm i playwright` fixed).
- **✨ PER-CARD BUSINESS-VALUE on the showcase + launcher thumb refresh (2026-06-24, directive #1 "business benefits")**: every
  showcase card now leads with a one-line **business outcome** (not just a feature blurb) — e.g. Cost = "Attribute cloud cost and
  carbon to sources and target the biggest savings." Added a `value` per item in `analytics-pentaho-space/build/dashboards.json`
  (24 topic lines applied across all 38 cards; Custom+twin pairs share a topic line) + rendered as `.cv` above the blurb in
  `gen_site.py card()`, with the value text also folded into the card search index. Complements the per-domain value lines added
  earlier. Refreshed the pdc-applications + pdc-glossary launcher thumbnails (now show their new 2nd filter chip). Published via
  update-site.sh. **Showcase is now framed end-to-end around business value (domain headers + per-card outcomes).**
- **✨ FILTER-PARITY CLEANUP ×2 (2026-06-24, directive #4 / parity)**: closed the two logged Custom-vs-twin filter gaps.
  **(1) pdc-applications** gained a **Data source** filter (joined `dim_datasource` into kpi/by_app/by_type/reach; added
  `datasources` options) → now **[ds, sens]** matching its twin. **(2) pdc-glossary** gained a **Glossary** filter on kpi +
  top_terms (by_glossary breakdown + coverage donut stay glossary-agnostic, mirroring the twin; added `glossaries` options) →
  now **[glossary, sens]** matching its twin. **Built, deployed, CDA-verified (apps ds=POSTGRES → 5 apps/181; glossary
  options=12), Playwright: apps 2 selects 7→5 on POSTGRES, glossary 2 selects 161→1 on AP_Energy, 0 page errors.** Twins already
  had these dims, so parity achieved with no twin change. (Custom⇄twin filter parity now complete across the suite.)
- **✨ 5 NEW CDE BOARDS in one run — CDE coverage of all major domains (2026-06-24, ⭐ CDE priority / first ~5x-cadence run)**:
  added **cde-quality, cde-freshness, cde-glossary, cde-applications, cde-storage** via the proven external-CDA recipe — now
  **8 CDE boards** (with observability/data-movement/cost) covering every major domain. Refactored `gen-cde.py` with a
  `cde_board()` helper (3-chart 2+1 layout over an external `.cda`); 5 new portable `.cda` files; 5 gen-home launcher cards (CDE
  kind, each in its domain group). **Deployed (now 59 dashboards: 25 Custom / 26 Framework / 8 CDE), CDA-verified, Playwright
  (cache-bust) all 5 `.wcdf/generatedContent`: doQuery 3 OK / 0 err each, charts populate (17–30 rects), 0 page errors.** Thumbnails
  captured + deployed.
  ⚠ **BUG FOUND & FIXED mid-run:** raw `&` in the `.wcdf` `<title>` (e.g. "Data Quality & Completeness") = malformed XML → CDE
  parsed nothing → empty dashboard, 0 doQuery (CDA itself was fine). **Lesson: ALWAYS XML-escape `&`→`&amp;` in CDE titles/desce**
  (build()/cde_board titles). All 5 fixed and re-verified. (CDE boards remain off the public showcase by convention.)
- **✨ 3rd CDE DASHBOARD — cde-cost (Cost & Sustainability) (2026-06-23, ⭐ CDE priority / directive #6)**: third true CDE-authored
  `.wcdf`/`.cdfde` via the proven external-CDA recipe (`cda_ds()` → real deployed `.cda`). **Cost & Sustainability (CDE)** over
  `entity_storage_demo`: 3 CCC charts — monthly cost by source (bar), cost by sensitivity (pie), CO₂e by source (bar). Content-
  distinct from the other two CDE boards (observability = assets/sensitivity/gov; data-movement = lineage GB). New
  `content/dashboards/cde-cost.cda` (costBySource/costBySensitivity/co2eBySource, portable PDC-BIDB-EXT/unqualified); `gen-cde.py`
  `build()`; gen-home.py launcher card (CDE kind, Storage & Cost group). **Deployed (3 new files; now 54 dashboards, 3 CDE),
  CDA-verified (3 data accesses 200: POSTGRES $193,977 / Unclassified $309,629 / POSTGRES 1454.85 t CO₂e), Playwright (cache-bust)
  `…cde-cost.wcdf/generatedContent`: doQuery 3 OK / 0 err, 3 CCC charts populate (20 rects), 0 page errors.** Thumbnail captured.
  **CDE track now 3 boards.** (CDE boards remain off the public showcase by convention — bare generatedContent, no branding.)
- **✨ CARRY ACTIVE FILTER THROUGH CDF-TWIN DRILL (2026-06-23, IDEAS / secondary "click-to-drill" directive)**: click-to-drill on the
  CDF twins now carries the **active Sensitivity** to the target (previously only the clicked category went through, dropping the
  sens context built across the 9-pair rollout). Fix is source-side only: each twin's `drillTo(stem,qs)` now appends
  `&sens=<sensParam>` when sensParam≠"%". The **toolkit target side was already complete** — `PDC.drillUrl` carries all
  `filterState` and `PDC.filters` pre-selects any filter id present in the URL — so Custom→Custom drills already carried filters;
  this closes the CDF→Custom gap. Applied to the **6 twins** with both a sens filter and a drill to a sens-enabled Custom target:
  i-cdf-storage→pdc-cost, i-cdf-cost→pdc-storage, i-cdf-redundancy→pdc-storage, i-cdf-governance→pdc-data-quality,
  i-cdf-data-quality→pdc-ownership, i-cdf-freshness→pdc-storage. **Built, deployed (injection survives build.py stamping),
  Playwright E2E: i-cdf-storage filtered HIGH → click AWS bar → lands pdc-cost `?ds=AWS&sens=HIGH`, target pre-selects BOTH
  `[AWS, HIGH]` (KPI $117).** No visual change (no thumbnail refresh). With sens="%" nothing extra is appended (guarded).
- **✨ CHORD reuse — Integration ↔ Platform Interconnect on i-data-integration (2026-06-23, directive #8 cool-viz)**: reused the
  `PDC.chord` primitive on a 2nd board — added a full-width **"Integration ↔ Platform Interconnect"** chord to **i-data-integration**,
  reusing the existing `int_platform_flow` data (`ilinks`, same rows feeding the Sankey). Integrations + destination platforms each
  appear once on the ring (arc = total GB), ribbons = movement, hover-to-isolate — complements the directional Sankey with a
  circular among-set view. Placed full-width (span3) after "Data Moved by Integration" so every grid row stays 3-col. **Built,
  deployed, Playwright (cache-bust): chord renders 9 nodes (Snowflake Tasks/PDI/Kafka Connect/dbt/Apache Spark + snowflake/s3/
  postgres/bigquery) + ribbons, 26 paths, 0 page errors.** Thumbnail refreshed. **PARITY:** CCC has no chord (like Sankey) → twin
  `i-cdf-data-integration` keeps its integration→platform stacked bar (documented precedent). `PDC.chord` now on 2 boards.
- **✨ 2nd CDE DASHBOARD — cde-data-movement (2026-06-23, ⭐ CDE priority / directive #6)**: built a second true CDE-authored
  `.wcdf`/`.cdfde` (editable in Pentaho CDE) via the proven **external-CDA recipe** (`cda_ds()` → real deployed `.cda`, NOT inline
  sql_sqlJndi). **Catalog Data Movement (CDE)** over `fact_lineage_connection`: 3 CCC bars — outbound GB by source platform,
  inbound GB by destination platform, GB by integration. New `content/dashboards/cde-data-movement.cda` (gbBySource/gbByDest/
  gbByIntegration, portable PDC-BIDB-EXT/unqualified); `gen-cde.py` `build()` call; gen-home.py launcher card (CDE kind, Data
  Movement group). **Deployed (3 new files; now 53 dashboards, 2 CDE), CDA-verified (3 data accesses 200: s3 6174 GB out / s3
  3425 GB in / Snowflake Tasks 2885 GB), Playwright (cache-bust) `…wcdf/generatedContent`: doQuery 3 OK / 0 err (external-CDA, no
  500s), 3 CCC bar charts populate (28 rects), 0 page errors.** Thumbnail captured. CDE track now 2 boards (observability +
  data-movement). Note: CDE boards are intentionally NOT in the public showcase dashboards.json (bare generatedContent has no
  branding; they're an editor-capability demo — same as cde-observability). ⚠ 193 still can't render CDE (.wcdf 500 — needs the
  25-fix-cde-cda-dataservices.sh shell fix on 193); HTML/CDF all fine there.
- **✨ SENSITIVITY CROSS-FILTER on Glossary + twin parity — ROLLOUT COMPLETE (2026-06-23, directive #4 "more filters")**:
  9th and final in the Sensitivity rollout. **pdc-glossary** (no filters before — gains its first) + **i-cdf-glossary** (had a
  `glossary` filter → now `[glossary, sens]`). `fact_entity_term` grain → `LEFT JOIN dim_entity` + `sens`; **the Classified-vs-
  Unclassified coverage math is sensitivity-scoped on BOTH sides** (classified = distinct term-classified entities of that tier;
  unclassified = that tier's snapshot total − classified) so coverage stays coherent under the filter. KPI `total_assets` and the
  donut denominator both use the sensitivity-scoped snapshot total. **Deployed, CDA-verified (Custom & twin identical: kpi
  sens=HIGH → 32 terms / 63 classified / 69 total; classified → 63 vs 6 unclassified). Playwright (cache-bust): twin 2 selects,
  Classification Coverage 10.7%→91.3% on HIGH (sensitive data is far better glossary-classified than the catalog overall), 0 page
  errors; Custom gains its first filter, 0 errors.** Thumbnails refreshed.
  **🎉 SENSITIVITY ROLLOUT COMPLETE (9): Storage, Cost, Redundancy, Governance, Freshness, Data Quality, Applications, Ownership, Glossary.**
- **✨ PUBLISHED TIMESTAMP on i-home launcher (2026-06-23, USER REQUEST)**: the launcher header (top-right, next to Dark) and
  footer now show a **"published YYYY-MM-DD HH:MM TZ"** stamp — **same format as the analytics.pentaho.space footer** — so you can
  compare the public site's "last refreshed" against the i-home on any server (193 / 225 / public) and confirm the latest is live.
  `gen-home.py` stamps `datetime.now().astimezone()` at regenerate time and **bakes it into i-home.html**; deploy copies that file
  verbatim. So the stamp is the **content BUILD/version timestamp** — all servers running the same build show the **same** stamp,
  which is exactly what makes it a parity check: localhost i-home == 193 i-home == public-site launcher screenshot ⇒ in sync.
  Added `.pubstamp` header element + footer text + `%(published)s` fill var. **Deployed local + 193; Playwright verified BOTH show
  `PUBLISHED 2026-06-23 10:10 CDT`, 52 cards, 0 page errors.** ✓
  ⚠ Correct semantics: re-running `gen-home.py` (i.e. a new build) changes the stamp; a bare redeploy of the same build does NOT.
  To bump the stamp, rebuild (gen-home) then deploy to each target. The 193 deploy (2026-06-23, see below) carries the 10:10 build.
- **✨ SENSITIVITY CROSS-FILTER on Ownership + twin parity (2026-06-23, directive #4 "more filters" / NEXT item 5)**:
  8th in the Sensitivity rollout. **pdc-ownership** + **i-cdf-ownership** (both already had `ds`). `fact_entity_snapshot` grain
  → `LEFT JOIN dim_entity` + `sens` on kpi/owned(CTE)/missing_by_source/scorecard/top_owners (Custom) and kpi/owned/
  missing_by_source/gov_by_source/scorecard (twin); sensitivities sourced from dim_entity. **Deployed, CDA-verified (Custom &
  twin agree: kpi sens=HIGH → 69 assets, sens=LOW → 255 vs 13975 all). Playwright (cache-bust): twin 2 selects, Assets 14.0K→255
  on LOW, 0 page errors; Custom ds+sens, 0 errors.** Note: owned%=0 across the board (catalog has 100% unassigned owner — the
  dashboard's actual stewardship-gap story, unaffected by the filter). Thumbnails refreshed. **Rollout now: Storage, Cost,
  Redundancy, Governance, Freshness, Data Quality, Applications, Ownership (8). Only pdc-glossary likely remains.**
- **✨ SENSITIVITY CROSS-FILTER on Applications + twin parity (2026-06-23, directive #4 "more filters" / rollout resume)**:
  7th in the Sensitivity rollout. **pdc-applications** (which had **NO filters at all** — this is its first) + **i-cdf-applications**.
  `fact_entity_application` grain → **`LEFT JOIN dim_entity e ON f.entity_key=e.entity_key`** + `sens` on every query
  (kpi/by_app/by_type/by_source/reach/app_source_flow on the Custom; kpi/by_app/by_type/by_source/reach on the twin). Custom JS
  gained a filter bar (was a bare `PDC.load`); twin gained a 2nd SelectComponent (now **[ds, sens]** — it already had ds).
  **Deployed, CDA-verified (Custom & twin agree: kpi sens=HIGH → 2 apps / 52 accesses / 7 assets / 22.3 TB vs 7 / 207 / 44 / 46.6
  all — only Customer 360 (49) + BGC-Client Portfolio Dashboard (3) touch HIGH-sensitivity data, a sharp security story).
  Playwright (cache-bust): twin 2 selects, Apps 7→2 on HIGH, 0 page errors; Custom renders its first filter chip + all panels,
  0 errors.** Thumbnails refreshed. **Sensitivity rollout now: Storage, Cost, Redundancy, Governance, Freshness, Data Quality,
  Applications (7).** ⚠ Minor residual: twin has [ds, sens] but Custom has [sens] only (Custom never had a ds filter) — logged in IDEAS.
- **✨ CHORD DIAGRAM cool-viz — `PDC.chord` + Platform Interconnect on i-data-flows (2026-06-23, directive #8 cool-viz, variety pick)**:
  built a new reusable **`PDC.chord(el,cfg)`** toolkit primitive — a circular interconnect matrix: each member appears ONCE on
  the ring (arc sized by total in+out flow), undirected ribbons (combining A→B + B→A) curve through the centre, **hover an arc
  to isolate its ribbons** (dims the rest), animated fade-in, reduced-motion aware. Added a **"Platform Interconnect" chord**
  panel to **i-data-flows** reusing the existing `flows` query (platform↔platform `bytes_moved`) — complements the directional
  Sankey + the radial network with a symmetric among-platform view. **Built (all 24 toolkit rebuilt — pdc-ui.js inlined),
  deployed. Playwright (cache-bust): chord renders 11 platform arcs (s3/snowflake/postgres/kafka/bigquery + tiny ones) + ribbons,
  0 page errors.** Cosmetic fix after first render: **suppress the static label for arcs with span<0.06 rad** (tiny low-volume
  platforms were overlapping at the top) — they stay hover-able via tooltip; majors keep labels. Refreshed i-data-flows thumbnail.
  **PARITY:** CCC has no chord (same as Sankey) → the twin `i-cdf-data-flows` keeps its platform-flow **stacked bar** as the
  Framework-side equivalent; chord is a Custom-only cool-viz, consistent with how Sankey is handled. ✓
  **`PDC.chord` is now reusable** for any among-set matrix (e.g. integration↔platform, datasource↔category) on future boards.
- **✨ DONUT centerCap float-format polish — suite-wide (2026-06-23, IDEAS polish item / variety interleave after 6 filter pairs)**:
  fixed `PDC.donut` in `dash-build/pdc-ui.js` so the center total no longer shows floating-point epsilon (e.g.
  `233.3900000000001 TB`). One-line, low-risk: snap the summed `total` via `parseFloat(total.toPrecision(12))` before it reaches
  the `centerLabel` fmt — kills epsilon while preserving legitimate precision (counts stay integer, abbr/money donuts unchanged).
  **Rebuilt all 24 toolkit dashboards, deployed. Playwright (cache-bust) verified center labels clean across 5 donut dashboards:
  pdc-redundancy `233.39 TB` (was `233.3900000000001`), pdc-storage `2764.12 TB`, pdc-cost `$318.7K`, pdc-data-quality 2×`14.0K`,
  0 page errors, no 5+-decimal float runs anywhere.** Refreshed the 2 visibly-changed launcher thumbnails (redundancy, storage);
  abbr/money donuts were already rounded so unchanged. ✓ Affects every donut with a numeric centerCap suite-wide.
- **✨ SENSITIVITY CROSS-FILTER on Data Quality + twin parity (2026-06-23, directive #4 "more filters" / NEXT item 5, 1 deliverable)**:
  6th in the Sensitivity rollout (Storage, Cost, Redundancy, Governance, Freshness, **Data Quality**). **pdc-data-quality** +
  **i-cdf-data-quality** — the most query-heavy yet (7 entity-grain queries). Snapshot-grain `LEFT JOIN dim_entity` (some queries
  already inner-joined dim_entity for profile_status/entity_name) + `sens` on kpi/profiled/completeness_band/completeness_by_source/
  missing_attrs/quality_scatter/worst_entities; the `missing_attrs` CTE got the LEFT JOIN inside its `WITH s` block. **Deployed,
  CDA-verified (Custom & twin agree: kpi sens=HIGH → 69 assets / 38.3% complete vs 13975 / 31.3% all; missing_attrs HIGH and
  quality_scatter MEDIUM both filter correctly). Playwright (cache-bust): twin 2 selects + 5 charts, Assets 14.0K→69 / Complete
  38.3% on HIGH, 0 page errors; Custom renders both chips + all panels incl. the quality-vs-governance scatter. Thumbnails
  refreshed.** ✓  **Sensitivity rollout now: Storage, Cost, Redundancy, Governance, Freshness, Data Quality (6 pairs).**
- **✨ SENSITIVITY CROSS-FILTER on Freshness + twin parity (2026-06-23, directive #4 "more filters" / NEXT item 5, 1 deliverable)**:
  5th in the Sensitivity rollout (after Storage, Cost, Redundancy, Governance). **pdc-freshness** + **i-cdf-freshness**. Same
  snapshot-grain technique as governance: **`LEFT JOIN dim_entity e ON s.entity_key=e.entity_key`** on the `fact_entity_snapshot`
  panels (kpi/scan_fresh/accessed_age/modified_age/stale_by_source) with `sens` filter; sensitivities sourced from `dim_entity`.
  The **`fact_temperature_daily` panels (temperature, temp_trend) stay global** (separate fact, no per-entity sensitivity).
  **Deployed, CDA-verified (Custom & twin agree: kpi sens=HIGH → 69 assets / 14.5% stale vs 13975 / 47.5% all — HIGH-sensitivity
  data is markedly fresher; scan_fresh HIGH = Recent 35 / Aging 24 / Stale 10). Playwright (cache-bust): twin 2 selects + 4 charts,
  Assets 14.0K→69 / Stale 47.5%→14.5% on HIGH, 0 page errors; Custom renders both chips + all snapshot panels.** ✓
  ⚠ **NOTE (local data gap, not a regression):** `fact_temperature_daily` is **EMPTY (0 rows) in local `bidb_ext_dev`**, so the two
  temperature panels (Data Temperature donut, Temperature Trend line) render "No data" locally — on both Custom and twin — and
  thus also in the local showcase screenshot. The dashboard structure is correct; they populate on a server with that table loaded
  (193/225). Unrelated to this filter change. **Sensitivity rollout now: Storage, Cost, Redundancy, Governance, Freshness.**
- **✨ SENSITIVITY CROSS-FILTER on Governance + twin parity (2026-06-23, directive #4 "more filters" / NEXT item 5, 1 deliverable)**:
  4th in the Sensitivity rollout (after Storage, Cost, Redundancy). **pdc-governance** + **i-cdf-governance**. Unlike the prior
  three, governance is **`fact_entity_snapshot` grain (not entity_storage_demo)** — added a **`LEFT JOIN dim_entity e ON
  s.entity_key=e.entity_key`** so the `sens` filter (`COALESCE(NULLIF(e.sensitivity,''),'Unclassified') LIKE ${sens}`) can
  apply; **LEFT JOIN (not INNER) preserves the "all" totals exactly** (verified 10.1% / 13975 unchanged). Filter applied to
  kpi/gov_status/gov_by_source/ungov_by_source/trend (entity-grain); the **policy-catalog panels (top_policies, policy_type)
  stay global** (fact_entity_policy, no per-entity sensitivity). Sensitivity options come from `dim_entity`. **Deployed,
  CDA-verified (Custom & twin agree: kpi sens=LOW → 94.1% governed / 240 / 15 vs 10.1% / 1410 / 12565 all — strong story:
  classified data is far better governed than Unclassified; gov_by_source sens=HIGH → Azure 100%, AWS 93.3%, Postgres 91.3%).
  Playwright (cache-bust): twin 2 selects + 6 charts, Governed 10.1%→94.1% on LOW, 0 page errors; Custom renders both chips +
  all panels. Thumbnails refreshed.** ✓  Rollout now covers **Storage, Cost, Redundancy, Governance**. Next: pdc-freshness.
- **✨ SENSITIVITY CROSS-FILTER on Redundancy + twin parity (2026-06-23, directive #4 "more filters" / NEXT item 5, 1 deliverable)**:
  third dashboard in the Sensitivity-filter rollout (after Storage, Cost). **pdc-redundancy** + **i-cdf-redundancy** gain a
  Sensitivity filter beside Data Source; `sens` param + `COALESCE(NULLIF(sensitivity,''),'Unclassified') LIKE ${sens}` on
  kpi/dups_by_source/savings_by_source/top_dups, new `sensitivities` options query. Per the Cost precedent, the **"Reclaimable
  by Sensitivity" donut responds to Data Source only** (twin `DP_DS` vs `DP`; Custom `sse` loaded with `{ds:ds}`). **Deployed,
  CDA-verified (Custom kpi sens=HIGH → 14 dups / 0.8 TB vs 1815 dups / 233.4 TB all; twin kpi sens=MEDIUM = 10 dups / 1.6 TB =
  the MEDIUM slice 1.58 of the always-on savings_by_sens breakdown — self-consistent). Playwright (cache-bust): twin 2 selects +
  4 charts, Reclaimable 233.4→1.6 TB on MEDIUM, 0 page errors; Custom renders both filter chips + full-mix donut. Thumbnails
  refreshed.** ✓  Sensitivity-filter rollout now covers **Storage, Cost, Redundancy** (Custom + twin each). Next targets: pdc-governance, pdc-freshness.
- **✨ SENSITIVITY CROSS-FILTER on Cost + twin parity (2026-06-23, directive #4 "more filters" / NEXT item 5, ~2x cadence — 2nd of run)**:
  same pattern as Storage, applied to **pdc-cost** + **i-cdf-cost**. Added a **Sensitivity** filter beside Data Source; `sens`
  param + `COALESCE(NULLIF(sensitivity,''),'Unclassified') LIKE ${sens}` on kpi/cost_by_source/co2e_by_source/reclaimable_by_source,
  new `sensitivities` options query. **Design call:** the **"Cost by Sensitivity" donut responds to Data Source only, NOT the
  Sensitivity filter** (filtering a by-sensitivity breakdown to one tier is degenerate) — in the twin this is a separate
  `DP_DS=[["ds","dsParam"]]` vs `DP=[["ds"],["sens"]]`; in the Custom, `cse` is loaded with `{ds:ds}` only. **Deployed,
  CDA-verified (Custom kpi sens=HIGH → $1408/mo vs $318669 all; twin kpi sens=MEDIUM=$1858 = the MEDIUM slice of the always-on
  cost_by_sens breakdown — self-consistent). Playwright (cache-bust): twin 2 selects + 5 charts, Monthly $318.7K→$1.4K on HIGH,
  0 page errors; Custom renders both filter chips + full-mix donut. Thumbnails refreshed.** ✓
- **✨ SENSITIVITY CROSS-FILTER on Storage + twin parity (2026-06-23, directive #4 "more filters" / NEXT item 5, ~2x cadence)**:
  added a **second cross-filter (Sensitivity)** to **pdc-storage** (Classic HTML) and mirrored it into the **i-cdf-storage**
  twin for parity. **(A) Custom:** `pdc-storage.cda` — added `sens` param + `AND COALESCE(NULLIF(sensitivity,''),'Unclassified')
  LIKE ${sens}` to kpi/by_source/by_restype/size_dist/top_assets/growth, new `sensitivities` options query; `dash/storage.js`
  now fetches both option lists (`Promise.all([datasources,sensitivities])`) and renders two filter chips, passing `{ds,sens}`
  to every query. **(B) twin:** `i-cdf-storage.cda` same `sens` param on all 6 queries + UNION-form `sensitivities`; `.html`
  adds a 2nd SelectComponent (`sensParam`), `DP=[["ds","dsParam"],["sens","sensParam"]]`, sensParam on all listeners + KPI fetch.
  **Deployed, CDA-verified (both sides: kpi sens=HIGH → 15.9 TB/69 assets vs 2764.1 TB/13975 all; sensitivities = HIGH/LOW/
  MEDIUM/Unclassified). Playwright (cache-bust, form-login): twin renders 2 selects + 5 charts; driving the Sensitivity
  dropdown to HIGH live drops Total Storage 2.8K→16 TB. Custom renders 2 filter chips + all charts. Thumbnails refreshed.** ✓
  (The benign `messages_supported_languages.properties` 500 is a CDF localization probe on every CDF dash — not a data error.)
- **✨ APP-ACCESS NETWORK + TWIN PARITY FIX ×2 (2026-06-23, directive #8 + parity, ~2x cadence)**:
  **(A)** added an **Application ↔ Data Source access-topology** radial network to **pdc-applications** (reuses `PDC.network`;
  new CDA query `app_source_flow` app→datasource by access_count — POSTGRES reads as the hub; hover a node → blast radius).
  **(B) parity:** the Custom `i-data-integration` now leads with the **Integration→Platform Sankey**, so mirrored it into the
  CDF twin `i-cdf-data-integration` — swapped its platform→platform stacked bar for an **Integration → Destination Platform
  CCC stacked bar** (new `int_platform_stacked` query; series=dest platform, category=integration). **Deployed, CDA-verified
  (app_source_flow 12 rows; int_platform_stacked 12 rows/3-col), Playwright (cache-bust): app network = 12 nodes + 12 edges
  (0 errors); twin stacked bar renders 16 rects, "Classic HTML|Framework" toggle.** ✓
- **✨ ANIMATED CHART LOAD-IN ×2 — bars + donut/line (2026-06-22, directive #8, ~2x cadence)**: tasteful entrance
  animations across the Classic toolkit, pairing with the KPI count-up. **(A)** `PDC.bars` — horizontal bars **grow from 0**
  (width tween), vertical bars **grow up** (y+height), staggered ~28ms/bar. **(B)** `PDC.donut` — slices **fade-in**
  staggered; `PDC.line` — the line **draws in** via stroke-dashoffset (getTotalLength) + area & dots fade-in. Shared
  `animateGeom(node,a0,a1,delay,dur)` easeOut helper; **all respect `prefers-reduced-motion`** (snap to final). Now every
  major Classic chart type (KPI, bar, donut, line, sankey, network) animates on load/filter. **Deployed (all 24 toolkit
  rebuilt), Playwright (cache-bust): bars settle to final widths (17/25 wide), line draw-in completes (stroke-dashoffset→0),
  donut/area slices animate, 0 page errors on pdc-storage & pdc-cost.** ✓ (One deliverable for the bars, one for donut+line.)
- **✨ NETWORK TOPOLOGY GRAPH + i-cdf-data-flows TWIN (2026-06-22, directive #8 + twin parity, ~2x cadence)**:
  **(A)** built a reusable **`PDC.network(el,cfg)`** primitive — a **radial node-link topology** graph (nodes on a circle
  sized by volume, curved quadratic edges sized by flow, animated fade-in, **hover a node → blast-radius highlight** of its
  neighbours, tooltips). Added a **"Platform Connection Topology"** panel to `i-data-flows` (same lineage flows as a
  node-link graph; s3 reads as the central hub). **(B)** built the **`i-cdf-data-flows` CDF twin** (the Sankey board was
  Custom-only → restored 25/25 twin parity): KPIs (9.3 TB / 13 flows / 8 src / 7 dst / 4.1K conns), **platform-movement CCC
  stacked bar** (destination stacked by source — the CCC equivalent of the Sankey; HeatGrid/Sankey not in CCC), outbound-by-
  source bar, by-integration bar, top-flows table, Integration filter; registered in `TWINS` so **i-data-flows now has the
  Classic⇄Framework toggle**. **Deployed (now 52 dashboards: 26 Custom incl. flows / 26 Framework / 1 CDE), CDA-verified
  (twin 6 queries; flow_stacked 13 rows/3-col), Playwright (cache-bust): network panel = 12 nodes + 13 edges; twin = 4 SVGs
  + stacked bar + table, "Classic HTML|Framework" toggle, KPI 9.3 TB.** ✓
- **✨ COOL-VIZ ×2 — Integration→Platform Sankey + animated KPI count-up (2026-06-22, directive #8, ~2x cadence)**:
  **(A)** replaced the platform-movement heatmap on **i-data-integration** with an **Integration → Destination Platform
  Sankey** (which integration tools land data in which platforms; new CDA query `int_platform_flow` integration→dest_platform
  by GB, integration-filtered; reuses `PDC.sankey`). **(B)** added a **tasteful animated count-up** to **`PDC.kpis`** —
  the numeric part of every KPI animates 0→target on render (easeOut, 750ms, preserves prefix/suffix/decimals, snaps to the
  exact string, **respects `prefers-reduced-motion`**); applies suite-wide to all 24 toolkit dashboards. **Deployed (all
  rebuilt), CDA-verified (int_platform_flow 12 rows), Playwright (cache-bust): 12 Sankey ribbons render; KPIs animate then
  settle correctly (16.7 TB / 92.2% / 8.2K …).** ✓
- **CLICK-TO-DRILL ×2 — i-cdf-command-center + i-cdf-profiling (2026-06-22, NEXT item 3; first ~2x-cadence run)**: per the
  new cadence directive (≥2 deliverables/run), drilled two twins in one run. **(A) i-cdf-command-center** "Storage by Data
  Source" bar → **pdc-storage**?ds=. **(B) i-cdf-profiling** "Profiled Columns by Source" bar → **pdc-data-quality**?ds=
  (profiling → quality). Both: CCC `clickable:true` + `clickAction` → `scene.vars.category.value`; `drillTo()` + `?ds=`;
  filterbar tips. HTML-only. **Deployed, Playwright (cache-bust): both render 6 SVGs, "Classic HTML|Framework" toggle,
  bar-click drills to pdc-storage?ds=POSTGRES and pdc-data-quality?ds=POSTGRES respectively.** ✓ (7th & 8th twins drilled.)
- **CLICK-TO-DRILL rolled into i-cdf-redundancy (2026-06-22, NEXT item 3)**: added click-to-drill on the "Reclaimable
  Storage by Source" CCC bar → navigates to **pdc-storage** filtered by the clicked source. CCC `clickable:true` +
  `clickAction` → `scene.vars.category.value`; `drillTo()` helper + `?ds=`; pdc-storage filter id is `ds`. Added filterbar
  tip. HTML-only. **Deployed, Playwright (cache-bust): 4 SVGs render, toggle "Classic HTML|Framework", bar-click drills to
  `pdc-storage.html/content?ds=POSTGRES`.** ✓ (6th twin drilled.)
- **CLICK-TO-DRILL rolled into i-cdf-freshness (2026-06-22, NEXT item 3)**: added click-to-drill on the "Stale & Aging by
  Data Source" CCC bar → navigates to **pdc-storage** filtered by the clicked source. CCC `clickable:true` + `clickAction`
  → `scene.vars.category.value`; `drillTo()` helper + `?ds=`; pdc-storage filter id is `ds`. Added filterbar tip. HTML-only.
  **Deployed, Playwright (cache-bust): 4 SVGs render, toggle "Classic HTML|Framework", bar-click drills to
  `pdc-storage.html/content?ds=GCS`.** ✓ (5th twin drilled.)
- **✨ SENSITIVITY→GOVERNANCE SANKEY on pdc-compliance (2026-06-22, directive #8)**: replaced the small heatmap on the
  Compliance Radar with a **Sankey hero** — "Sensitive Data Flow: Source Sensitivity → Destination Governance" — over the
  existing `flow_matrix` data (src_sensitivity → dest_governed_label by `connection_count`). Ribbons colored by sensitivity
  (`sevColor`), destination nodes green=Governed / red=Ungoverned (`govColor`); instantly shows the risk (Restricted 704 →
  mostly **Ungoverned**, in red). Reused the `PDC.sankey` primitive — zero new CDA (same `flow_matrix` query). Also
  **polished `PDC.sankey` column captions** to anchor at the SVG edges (were clipping on both Sankey boards; rebuilt all 24
  toolkit dashboards). **Deployed, Playwright (cache-bust): 5 ribbons render, KPIs (24 restricted→ungoverned), Time-Range
  filter present, "Classic HTML|Framework" toggle.** ✓ Classic-HTML lead; the CDF twin `i-cdf-compliance` already has the
  CCC stacked-bar equivalent of this flow.
- **✨ SANKEY DATA-MOVEMENT BOARD — i-data-flows (2026-06-22, directive #8 flagship)**: new Classic-HTML dashboard
  **"Data Movement Flows"** featuring a hand-rolled, self-contained **SVG Sankey** of cross-platform data movement
  (lineage `fact_lineage_connection` orig→dest by `bytes_moved`, ribbons sized by GB + colored by source, animated
  staggered fade-in, hover-highlight, tooltips, click-a-ribbon → Data Integration). Added a reusable **`PDC.sankey(el,cfg)`**
  primitive to the toolkit (`pdc-ui.js`): 2-layer source→destination layout, per-end band scaling, node+value labels,
  column captions — works for any `{source,target,value}` links. Dashboard: 5 KPIs (9.3 TB moved / 13 platform flows /
  8 src / 7 dst / 4.1K connections), the Sankey hero, Outbound-by-Source-Platform bar, Data-Moved-by-Integration bar
  (cross-links to i-data-integration), and a namespace-level Top-Flows table; cascading **Integration** filter. Registered
  in `build.py` DASHBOARDS + `gen-home.py` (Data Integration group, ✨-flagged). **Deployed (now 51 dashboards), CDA-verified
  (6 queries; flows=13), Playwright (cache-bust): 13 Sankey ribbons render, KPI 9.3 TB, filter present, ribbon-click drills
  to i-data-integration.** ✓
  - ⓘ This is a **Classic-HTML lead** per directive #8 (CCC has no Sankey). The **Framework** representation of these flows
    already exists as the platform-movement **stacked bar** in `i-cdf-data-integration` — so the CDF side is covered; a
    dedicated `i-cdf-data-flows` twin is optional (would reuse that stacked-bar/flow-matrix as the CCC equivalent).
- **CLICK-TO-DRILL rolled into i-cdf-data-quality (2026-06-22, NEXT item 3)**: added click-to-drill on the "Metadata
  Completeness by Source" CCC bar → navigates to **pdc-ownership** filtered by the clicked source (low completeness →
  who owns it / stewardship gap). CCC `clickable:true` + `clickAction` → `scene.vars.category.value`; `drillTo()` helper
  + `?ds=`; pdc-ownership filter id is `ds`. ⚠ Retargeted from the STATUS-suggested i-column-health — that twin filters by
  **`dtype`** (Data Type), NOT `ds`, so a source value can't carry; pdc-ownership (ds) is the right source-filterable target.
  Added filterbar tip. HTML-only. **Deployed, Playwright (cache-bust): 5 SVGs render, toggle "Classic HTML|Framework",
  bar-click drills to `pdc-ownership.html/content?ds=AZURE_BLOB_STORAGE`.** ✓ (4th twin drilled.)
- **CLICK-TO-DRILL rolled into i-cdf-cost (2026-06-22, NEXT item 3)**: added click-to-drill on the "Monthly Cost by Data
  Source" CCC bar → navigates to **pdc-storage** filtered by the clicked source (CCC `clickable:true` + `clickAction` →
  `scene.vars.category.value`; `drillTo()` helper + `?ds=`; pdc-storage filter id is `ds`). Added filterbar tip. HTML-only.
  **Deployed, Playwright (cache-bust): 5 SVGs render, toggle reads "Classic HTML|Framework", bar-click drills to
  `pdc-storage.html/content?ds=POSTGRES`.** ✓ (3rd twin drilled; storage→cost, governance→data-quality were 1st/2nd.)
- **CLICK-TO-DRILL rolled into i-cdf-governance (2026-06-22, NEXT item 3)**: added click-to-drill on the "Governed % by
  Data Source" CCC bar → navigates to **pdc-data-quality** filtered by the clicked source (CCC `clickable:true` +
  `clickAction` → `scene.vars.category.value`; `drillTo()` helper + `?ds=`; pdc-data-quality filter id is `ds`). Added
  filterbar tip. HTML-only change. **Deployed, Playwright (cache-bust): 6 SVGs render, toggle reads "Classic HTML|Framework",
  bar-click drills to `pdc-data-quality.html/content?ds=GCS`.** ✓ (2nd twin drilled; storage→cost was 1st.)
- **REPUBLISHED TO 193 — milestone (2026-06-22, directive #7)**: VPN/193 up; re-published v2 to `http://10.80.230.193`
  `/public/pdc-iteration/v2` (9 changed files, 0 failed) capturing the milestone since the last 193 deploy: CDE blank-charts
  fix + launcher CDE tile, i-cdf-overview (sensitivity cross-filter + drill), i-cdf-lineage (time-range cross-filter + drill),
  i-cdf-storage (drill→cost), home updates. **Verified on 193: i-cdf-overview sens=HIGH kpi=[69,6,89.9,38.3], i-cdf-lineage
  90d kpi=[7,1738,90.3,4854.6,24]; i-home/overview/lineage/storage render 200.** ⚠ **CDE `cde-observability.wcdf/
  generatedContent` returns 500 on 193** — that container hasn't had `pentaho-11-docker-deploy/25-fix-cde-cda-dataservices.sh`
  applied (CDE dataservices NPE); needs shell access to the 193 host to run it. All HTML/CDF (Custom + Framework) dashboards
  work on 193; only the CDE artifact is blocked there. (Local + the CDF twins are unaffected.)
- **CLICK-TO-DRILL rolled into i-cdf-storage (2026-06-22, NEXT item 3)**: added click-to-drill on the "Storage by Data
  Source" CCC bar → navigates to **pdc-cost** filtered by the clicked source (CCC `clickable:true` + `clickAction` →
  `scene.vars.category.value`; `drillTo()` repo-path-stem-swap helper + `?ds=`; pdc-cost filter id is `ds`). Added a
  discovery tip in the filterbar. HTML-only change (queries unchanged). **Deployed, Playwright (cache-bust): 5 SVGs render,
  bar-click drills to `pdc-cost.html/content?ds=POSTGRES`.** ✓ First CDF twin (beyond the standalone overview/lineage) to
  get click-to-drill — pattern proven reusable across any twin with a source/category bar.
- **i-cdf-lineage UPGRADED — time-range cross-filter + click-to-drill (2026-06-22, NEXT item 2)**: upgraded the standalone
  CDF Data-Movement-Observability dashboard. Added a **second cascading filter — Time Range** (All / 12mo / 6mo / 90d via
  a `ranges` query precomputing `fromkey` date-ints) cross-filtering with the existing Integration filter across all
  panels (added `AND e.event_date_key >= ${fromkey}` to kpi/gb/success/status/trend; `c.event_date_key` for top_flows).
  Added **click-to-drill**: clicking a bar in "Data Moved by Integration" (CCC `clickable:true` + `clickAction` →
  `scene.vars.category.value`) navigates to **pdc-pipeline-obs** filtered by the clicked integration (drillTo() sibling-URL
  swap + `?integration=`; pdc-pipeline-obs filter id is `integration`). **Deployed, CDA-verified (8 queries; all take
  integration+fromkey), Playwright (cache-bust): 5 SVGs + table, 2 filter selects, time-range cascade (8.2K→1.7K runs /
  16.7TB→4.9TB for 90d), bar-click drills to `pdc-pipeline-obs.html/content?integration=Snowflake%20Tasks`.** ✓
  → Both standalone CDF dashboards (overview + lineage) now have cross-filters + click-to-drill (NEXT item 2 COMPLETE).
- **DEPLOYED TO 225 + DB-PROVISIONING TOOLING (`deploy-db.sh`) (2026-06-22, user request)**: published v2 to
  **`http://10.80.230.225/pentaho`** `/public/pdc-iteration/v2` (204 files, additive — folder was new, nothing
  overwritten). 225's `PDC-BIDB-EXT` resolves to schema **`bidb_ext`** (RDS `airlinesample…`/`postgres`,
  currentSchema=bidb_ext) — so the portable suite ran with zero content changes. **But `bidb_ext` was a partial
  warehouse**, so queries 500'd until provisioned:
  - **15 objects were entirely missing** (lineage star `dim_lineage_*`/`fact_lineage_*`, lineage staging
    `stg_lineage_event`(+`_demo`)/`v_stg_lineage_event`, FDW-derived `dim_application`/`dim_policy`/`dim_temperature`/
    `fact_entity_application`/`fact_entity_policy`/`fact_extension_daily`/`fact_temperature_daily`/`fact_pipeline_run`,
    and `entity_storage_demo`).
  - **2 pre-existing objects were STALE older builds** missing columns: `dim_entity` (27→**65** cols) and
    `fact_entity_snapshot` (27→**46** cols; dependent `fact_entity_term` handled).
  - ⚠ **The FDW source catalog `10.80.230.246` (and `10.80.230.241`) is UNREACHABLE from the RDS** (AWS, no VPN route —
    verified: TCP timeout). So the canonical "build from source" DDL (`content/ddl`) can't run from here. **Solution:**
    `bidb_ext` and `bidb_ext_dev` live in the SAME RDS database and FDW the SAME catalog, so cloning each needed object
    from `bidb_ext_dev` is **data-equivalent to a source build** and works without the catalog.
  - **`deploy-db.sh`** (new, in `iteration/v2/`): provisions a target schema from a reference schema (default
    `bidb_ext_dev`), **ADDITIVE + idempotent** — skips objects that already exist, never drops/alters them. `--dry-run`
    previews. `--upgrade-stale` also rebuilds pre-existing objects the reference has newer columns for, via
    **rename-backup (`<name>_preupg_<ts>`) + recreate, in one transaction** (reversible, all-or-nothing). Used:
    `PGPASSWORD=Password1 ./deploy-db.sh --upgrade-stale bidb_ext` (RDS postgres/Password1).
  - **Result: provisioned 16 objects + upgraded dim_entity/fact_entity_snapshot/fact_entity_term; 27/27 sampled
    dashboards return data (was 5/9), launcher + HTML render 200.** Originals preserved as `*_preupg_20260622` on the RDS
    (safe to drop once 225 is confirmed good). `deploy.sh` footer now points at `deploy-db.sh` as the companion DB step.
- **i-cdf-overview UPGRADED — sensitivity cross-filter + click-to-drill (2026-06-22, NEXT item 2)**: upgraded the
  standalone CDF Catalog-Observability dashboard (predated the filter/drill conventions). Added a **second cascading
  filter — Sensitivity** (HIGH/MEDIUM/LOW/Unclassified, All sentinel) cross-filtering with Data Source on kpi/by_source/
  gov_status/scorecard (joined `dim_entity`, `COALESCE(NULLIF(e.sensitivity,''),'Unclassified') LIKE ${sens}`); trend/
  completeness/sensitivity-pie stay as context. Added **click-to-drill**: clicking a bar in "Assets by Data Source"
  (CCC `clickable:true` + `clickAction` reading `scene.vars.category.value`) navigates to **pdc-storage** filtered by
  the clicked source — version-portable sibling URL (swaps `i-cdf-overview.html`→`pdc-storage.html` in `location.pathname`,
  appends `?ds=`; pdc-storage's PDC.filters URL pre-select picks it up). **Deployed, CDA-verified (kpi/by_source/gov_status/
  scorecard now take ds+sens; sensitivities 5 rows), Playwright (cache-bust): 6 SVGs + table, 2 filter selects, sensitivity
  cascade (14.0K→69 assets / 10.1%→89.9% gov for HIGH), bar-click drills to `pdc-storage.html/content?ds=POSTGRES`.** ✓
  - PATTERN (reusable for i-cdf-lineage next): CCC `clickAction:function(scene){var v=scene.vars.category.value; …}` +
    a `drillTo(stem,qs)` helper that rewrites the repo-path stem. Verified the click hits the bar `rect` (not the plot bg).
- **PORTABILITY + PUBLISHED TO 193 (2026-06-22, user request)**: published the full v2 suite (204 files: 50 HTML + 50
  CDA + 1 wcdf/cdfde + lineage + 50 thumbs) to **`http://10.80.230.193/pentaho`** at `/public/pdc-iteration/v2`. Launcher
  + dashboards render (HTTP 200); live doQuery against the RDS warehouse via `PDC-BIDB-EXT` returns real data
  (`i-data-integration` kpi = 7 integrations / 8230 runs / 92.2% / 16683.8 GB). **Made the suite server-portable per user
  requirement:** stripped the hard-coded `bidb_ext_dev.` schema prefix from **all 50 `.cda` files** (684 refs) so queries
  use unqualified table names and resolve schema via the **named** `PDC-BIDB-EXT` connection's `POSTGRESQL.currentSchema`
  on each server. Verified on 193 (currentSchema=bidb_ext_dev) — unqualified queries return identical data across
  toolkit + CDF + lineage dashboards (7/7 doQuery 200). **`deploy.sh` hardened:** only (re)creates `PDC-BIDB-EXT` for
  localhost (now incl. `currentSchema=bidb_ext_dev`); on remote servers it assumes the connection is pre-provisioned and
  does NOT clobber it (`FORCE_CONN=1` to override). 193's `PDC-BIDB-EXT` was already correct (RDS `airlinesample…` → db
  `postgres`, currentSchema `bidb_ext_dev`). **Next: 241** — provision `PDC-BIDB-EXT` with currentSchema `bidb_ext`, then
  `./deploy.sh 10.80.230.241:443 …` (no content changes). See PORTABILITY CONTRACT in env-facts.
- **CDE EXTERNAL-CDA FIX — cde-observability charts now populate (2026-06-22, ⭐CDE / NEXT item 1)**: resolved the
  long-standing KNOWN ISSUE where CDE charts were blank. Root cause: `gen-cde.py` emitted **inline `sql_sqlJndi`**
  datasources, which CDE compiles to an in-memory `.cda` whose doQuery 500s. **Fix:** created a REAL deployed
  `cde-observability.cda` (3 data accesses: assetsBySource / sensitivityMix / govBySource over `PDC-BIDB-EXT`) and
  switched `gen-cde.py` to **external-CDA datasources** — CDE datasource type **`CDADataSource`** with properties
  `cdaPath` (=`/public/pdc-iteration/v2/cde-observability.cda`) + `dataAccessId` + `outputIndexId` (discovered the exact
  type/props from the container's `…/pentaho-cdf-dd/resources/components/CDADatasource.xml`). New `cda_ds()` helper +
  `VERSION`-derived DEPLOY path in gen-cde.py. **Deployed, CDA-verified (3 queries 200), Playwright render-test of
  `…cde-observability.wcdf/generatedContent?cb=`: doQuery 200×3 (was 500), 3 CCC charts render populated (assets-by-
  source bar, sensitivity pie, governed-%-by-source bar), only benign 404s (spinner gif / i18n).** ✓
  - **Launcher card added**: `gen-home.py` now recognizes a **CDE** kind (stem `cde-*`), renders its href as
    `.wcdf/generatedContent`, a teal **CDE** badge + filter chip, and a separate count. New "Catalog Observability (CDE)"
    card in the Observability group. **Playwright-verified: 50 cards, CDE card links to generatedContent, CDE chip filters to 1.**
  - ⚠ CDE recipe (for future CDE dashboards): use `cda_ds()` (external-CDA), NOT inline `sql_sqlJndi`. Deploy the `.cda`
    alongside the `.wcdf`/`.cdfde`. The CDE layout is bare blueprint (no titles/styling) — data renders; polish later if wanted.
- **i-cdf-unstructured.html — Document & Unstructured Insights CDF TWIN (2026-06-22, ⭐CDF / v2 item 4 — FINAL TWIN,
  FULL PARITY 24/24)**: Framework twin of toolkit `i-unstructured`. 4 KPIs (3.1K file assets, 89 folders, 22 file
  extensions, 2.9K files scanned), Files-by-Extension bar, File-Assets-by-Source pie, Unstructured-Scan-Volume-Trend
  line (single point — `fact_extension_daily` has one snapshot month), and a File-Extension-Detail table; **Data Source**
  filter wired to the file/folder KPIs (dim_entity→datasource join) — captioned that extension/scan-volume panels are
  catalog-wide scan metrics (`fact_extension_daily` has no datasource dimension). Registered in `TWINS` → toggle auto.
  **Deployed, CDA-verified (5 queries), Playwright (cache-bust): 4 SVGs (bar + pie + line) + table render, filter
  cascades (3.1K→2.3K files AZURE_BLOB_STORAGE), toggle present, footer v2.** ✓
  → **🎉 TWIN COVERAGE COMPLETE: all 24 Custom toolkit dashboards now have a Framework (CDF) twin with the
  Custom⇄Framework toggle. Suite = 49 dashboards (24 Custom / 25 Framework incl. standalone i-cdf-overview + i-cdf-lineage).**
- **i-cdf-pipeline-obs.html — Pipeline & Job Observability CDF TWIN (2026-06-22, ⭐CDF / v2 item 4)**: Framework twin of
  toolkit `pdc-pipeline-obs`. 5 KPIs (8.2K runs, 92.2% success, 639 failed/aborted, 16.7K GB moved, 642 jobs), Job-Success-
  Rate-by-Month line, Run-Volume-by-Month line, Event-Lifecycle-Mix pie, Success-Rate-by-Integration bar, Failed/Aborted-
  by-Integration bar, and a Top-Failing-Jobs table (blast radius). **TWO cascading filters**: Time Range (ranges fromkey)
  + Integration (both feed kpi/trends/lifecycle/failing-jobs; by-integration bars take only fromkey). Split the toolkit's
  3-/4-col queries into 2-col CCC versions (success_trend, succ/fail_by_integration). Dropped the slowest-PDI-pipelines
  table — `fact_pipeline_run` is EMPTY. Registered in `TWINS` → toggle auto. **Deployed, CDA-verified (9 queries),
  Playwright (cache-bust): 6 SVGs (2 lines + pie + 2 bars) + table render, Integration filter cascades (8.2K→589 runs,
  642→4 jobs Airflow), toggle present, footer v2.** ✓
- **i-cdf-adoption.html — Catalog Adoption CDF TWIN (2026-06-22, ⭐CDF / v2 item 4)**: Framework twin of toolkit
  `i-adoption`. 4 KPIs (7 applications, 161 glossary terms applied, 10 policies assigned, 10.7% classification coverage),
  Adoption-Coverage bar (classified/policy-governed/app-accessed), Top-Applications-by-Access bar, Top-Policies-by-
  Assignment bar, Classified-Assets-by-Source bar (global), and an Application-Reach table; cascading **Data Source**
  filter wired through entity→datasource joins on kpi/coverage/top_apps/top_policies (by_source stays global). Registered
  in `TWINS` → toggle auto. **Deployed, CDA-verified (6 queries), Playwright (cache-bust): 5 SVGs (4 bars) + table render,
  filter cascades (161→101 terms POSTGRES), toggle present, footer v2.** ✓
- **i-cdf-compliance.html — Sensitive Data & Compliance Radar CDF TWIN (2026-06-22, ⭐CDF / v2 item 4)**: Framework twin
  of toolkit `pdc-compliance` — the richest twin yet. 4 KPIs (24 restricted→ungoverned, 704 sensitive flows, 7.4K cross-
  boundary flows, 148 high/med sensitive assets), **Source-Sensitivity→Destination-Governance CCC stacked bar**
  (series=dest governance Governed/Ungoverned, category=src sensitivity — HeatGrid replacement), Catalog-Sensitivity-Mix
  pie, Bytes-Moved-by-Destination-Sensitivity bar, Restricted→Ungoverned-by-Source bar, and a **2-series Sensitive &
  Cross-Boundary Movement CCC line** built from a long-form `cross_trend_long` query ([metric, month, value]). Cascading
  **Time Range** filter (SelectComponent over a `ranges` query that precomputes fromkey date-ints; only the trend listens).
  Registered in `TWINS` → toggle auto. **Deployed, CDA-verified (7 queries; cross_trend_long 24→8 rows for Last-90-days),
  Playwright (cache-bust): 6 SVGs (stacked bar + pie + 2 bars + 2-series line) render, toggle present, footer v2.** ✓
- **i-cdf-schema-explorer.html — Schema & Structure Explorer CDF TWIN (2026-06-22, ⭐CDF / v2 item 4)**: Framework twin
  of toolkit `i-schema-explorer`. 4 KPIs (12.4K structured assets, 22 schemas, 754 tables, 11.5K columns), Catalog-
  Composition pie (entity_type), Column-Data-Types bar, Key-Coverage pie (PK/FK/other), Largest-Schemas-by-Columns bar,
  and a Schema-Detail table (schema / columns / tables); cascading **Data Source** filter (kpi/by_type/data_types ds-
  filtered; schemas + keys global). Registered in `TWINS` → toggle auto. ⚠ The schemas bar needed a **dedicated 2-col
  query** (`schemas_by_cols`) — the 3-col `top_schemas` was misread by CCC as [series,category,value] (gotcha) and the
  table keeps the 3-col query. **Deployed, CDA-verified (7 queries), Playwright (cache-bust): 5 SVGs (2 pies + 2 bars) +
  table render, filter cascades (11.5K→7.7K cols, 22→2 schemas POSTGRES), schemas bar fixed, toggle present, footer v2.** ✓
- **i-cdf-glossary.html — Business Glossary & Term Reach CDF TWIN (2026-06-22, ⭐CDF / v2 item 4)**: Framework twin of
  toolkit `pdc-glossary`. 4 KPIs (161 glossary terms, 1.5K classified assets, 10.7% classification coverage, 12 glossaries),
  Term-Reach-by-Glossary bar, Classification-Coverage pie (classified vs unclassified), **Terms-per-Glossary bar**
  (replaces the toolkit's redundant reach treemap — distinct-term counts per glossary), and a Top-Terms-by-Entity-Reach
  table; cascading **Glossary** filter (All sentinel; filters kpi + top_terms; the by-glossary breakdown panels stay
  global). Registered in `TWINS` → toggle auto. **Deployed, CDA-verified (6 queries), Playwright (cache-bust): 4 SVGs
  (2 bars + pie) + table render, filter cascades (161→55 terms, 1.5K→304 classified for BGC_DW), toggle present, footer v2.** ✓
- **i-cdf-ownership.html — Ownership & Stewardship Gaps CDF TWIN (2026-06-22, ⭐CDF / v2 item 4)**: Framework twin of
  toolkit `pdc-ownership`. 4 KPIs (0% assets-with-owner — full stewardship gap, 14.0K unowned, 14.0K total, 12.6K
  ungoverned), Owned-vs-Unowned pie (100% unowned — honest), Unowned-Assets-by-Source bar, **Governance-Coverage-by-
  Source bar** (replaces the toolkit's named-owners bar, which is always empty since `owner_name` is 100% unassigned),
  and a Stewardship-Scorecard table (source / assets / owned % / governed %); cascading **Data Source** filter
  (kpi + owned filtered; by-source panels + scorecard global). Registered in `TWINS` → toggle auto. **Deployed,
  CDA-verified (6 queries), Playwright (cache-bust): 4 SVGs (pie + 2 bars) + table render, filter cascades
  (14.0K→8.2K unowned POSTGRES), toggle present, footer v2.** ✓
- **i-cdf-redundancy.html — Redundancy & Duplicate Data CDF TWIN (2026-06-22, ⭐CDF / v2 item 4)**: Framework twin of
  toolkit `pdc-redundancy`. 4 KPIs (1.8K duplicate assets, 13% duplicate rate, 233.4 TB reclaimable storage,
  $27.5K/mo reclaimable cost), Reclaimable-Storage-by-Source bar, Reclaimable-by-Sensitivity pie, Duplicate-Assets-by-
  Source bar, and a Top-Duplicate-Objects table (object / source / sensitivity / reclaim GB); cascading **Data Source**
  filter (All sentinel; all panels ds-filtered). Toolkit's redundant reclaimable-treemap dropped (already a by-source bar).
  Registered in `TWINS` → toggle auto. **Deployed, CDA-verified (6 queries), Playwright (cache-bust): 4 SVGs (3 bars/pie)
  + table render, filter cascades (1.8K→1.1K dups, 233.4→131.4 TB POSTGRES), toggle present, footer v2.** ✓
- **i-cdf-applications.html — Application & Access Reach CDF TWIN (2026-06-22, ⭐CDF / v2 item 4)**: Framework twin of
  toolkit `pdc-applications`. 4 KPIs (7 applications, 207 access events, 44 assets accessed, 46.6 TB data reach),
  Top-Applications-by-Access bar, Access-by-Application-Type pie, Access-by-Data-Source bar (global cross-source), and an
  Application-Reach-Detail table (accesses / assets / data TB); cascading **Data Source** filter (All sentinel; filters
  kpi/by_app/by_type/reach; by_source stays global). NOTE: all access events are type `application` so the type pie is a
  single honest slice. Registered in `TWINS` → toggle auto. **Deployed, CDA-verified (6 queries), Playwright (cache-bust):
  4 SVGs (3 bars/pie) + table render, filter cascades (7→5 apps, 46.6→31 TB POSTGRES), toggle present, footer v2.** ✓
- **i-cdf-privacy.html — Sensitive Data & Privacy CDF TWIN (2026-06-22, ⭐CDF / v2 item 4)**: Framework twin of toolkit
  `i-privacy`. 4 KPIs (625 privacy-classified assets, 8 privacy terms, 58 med/high, 46 high sensitivity), Privacy-
  Classification-Reach bar (by glossary term), Sensitivity-Scale pie (LOW/MED/HIGH), Privacy-Exposure-by-Source bar,
  and a **Privacy Term × Source CCC stacked bar** (HeatGrid not packaged → series=source, category=term, top-8 terms);
  cascading **Data Source** filter (All sentinel; filters kpi/by_term/scale; by_source + term×source stay global cross-
  source). Registered in `TWINS` → toggle auto. **Deployed, CDA-verified (6 queries; heat_stacked 16 rows/3-col),
  Playwright (cache-bust): 5 SVGs (3 bars + pie + stacked) render, filter cascades (625→564 assets, 46→10 high POSTGRES),
  toggle present, footer v2.** ✓
- **i-cdf-growth.html — Catalog Growth CDF TWIN (2026-06-21, ⭐CDF / v2 item 4)**: Framework twin of toolkit `i-growth`.
  4 KPIs (14.0K catalog assets, 52 scan days, 29 data sources, 7.0K discovered last-90d), **cumulative Catalog-Growth
  CCC line** (`trend_cum` 2-col [month, cumulative] via window SUM), Assets-by-Source pie, Assets-Scanned-per-Month bar,
  Recently-Discovered-Assets table; cascading **Data Source** filter (All sentinel; ds filters kpi/trend_cum/by_month/
  recent via the dim_datasource join). Registered in `TWINS` → toggle auto. **Deployed, CDA-verified (6 queries;
  trend_cum/by_month 11 mo, 2-col single-series), Playwright (cache-bust): 4 SVGs (line+pie+bar) + table render, filter
  cascades (14.0K→8.2K assets POSTGRES), toggle present, footer v2.** ✓
- **i-cdf-profiling.html — Column Profiling CDF TWIN (2026-06-21, ⭐CDF / v2 item 4)**: Framework twin of toolkit
  `i-profiling`. 4 KPIs (2.9K profiled columns, 42.7% avg uniqueness, 44% avg selectivity, 510K max cardinality),
  Column-Completeness (null %) pie, **Uniqueness-Distribution pie** (5 bands incl. 99-100% key-like), Profiled-Columns-
  by-Source bar, Avg-Uniqueness-by-Source bar, Profiling-Coverage vertical bar, and a Highest-Cardinality-Columns table;
  cascading **Data Source** filter (All sentinel; ds filters kpi/null_dist/uniq_dist/top_cols via `md5(datasource_nk)=
  datasource_key` join). Scatter dropped (CCC scatter awkward — same as data-quality). Registered in `TWINS` → toggle auto.
  **Deployed, CDA-verified (7 queries), Playwright (cache-bust): 6 SVGs (2 pies + 3 bars) + table render, filter cascades
  (2.9K→1.2K cols, 42.7%→39.2% uniq POSTGRES), toggle present, footer v2.** ✓
- **i-cdf-data-integration.html — Data Integration CDF TWIN (2026-06-21, ⭐CDF / v2 item 4)**: Framework twin of toolkit
  `i-data-integration`. 5 KPIs (integrations, runs, GB moved, success %, restricted→ungoverned), Platform-Movement
  **stacked bar** (source→destination GB), Data-Moved-by-Integration bar, Throughput-Trend line, Success-Rate bar,
  Top-Cross-Platform-Flows table; cascading **Integration** filter (All sentinel). Registered in `TWINS` → toggle auto.
  **Deployed, CDA-verified (7 queries), Playwright (cache-bust): 4 charts + table render, filter cascades
  (16.7K→2.0K GB dbt), toggle present.** ✓
- **i-cdf-cost.html — Cost CDF TWIN (2026-06-21, ⭐CDF / v2 item 4)**: Framework twin of toolkit `pdc-cost`.
  4 KPIs (monthly $318.7K, annualized $3.8M, reclaimable, CO2e tonnes), Cost-by-Source bar, Cost-by-Sensitivity pie,
  Reclaimable-Spend-by-Source bar, Carbon-by-Source bar; cascading **Data Source** filter (All sentinel). Registered in
  `TWINS` → toggle auto. **Deployed, CDA-verified (6 queries), Playwright (cache-bust): 4 charts render, filter cascades
  ($318.7K→$194.0K POSTGRES), toggle present.** ✓
- **i-cdf-storage.html — Storage CDF TWIN (2026-06-21, ⭐CDF / v2 item 4)**: Framework twin of toolkit `pdc-storage`.
  4 KPIs (total TB, assets, avg/max object size), Storage-by-Source bar, Structured-vs-Unstructured pie, Object-Size-
  Distribution bar, **cumulative Storage-Footprint-Growth CCC line** (`growth_cum` 2-col), and a Largest-Objects table;
  cascading **Data Source** filter (All sentinel). Registered in `TWINS` → toggle auto. **Deployed, CDA-verified
  (7 queries), Playwright (cache-bust): 5 charts + table render, filter cascades (2.8K→1.6K TB POSTGRES), toggle present.** ✓
- **i-cdf-freshness.html — Freshness CDF TWIN (2026-06-21, ⭐CDF / v2 item 4)**: Framework twin of toolkit `pdc-freshness`.
  4 KPIs (assets, stale %, aging %, recently-scanned), Scan-Freshness pie, Modified-Age bar, Stale-&-Aging-by-Source bar;
  cascading **Data Source** filter (All sentinel). (Temperature/temp-trend dropped — `fact_temperature_daily` is empty.)
  Registered in `TWINS` → toggle auto. **Deployed, CDA-verified (7 queries; temperature/temp_trend EMPTY), Playwright
  (cache-bust): 3 charts render, filter cascades (47.5%→39.5% POSTGRES stale), toggle present.** ✓
- **i-cdf-data-quality.html — Data Quality CDF TWIN (2026-06-21, ⭐CDF / v2 item 4)**: Framework twin of toolkit
  `pdc-data-quality`. 4 KPIs (complete %, assets, missing owner, missing dates), Completeness-Distribution pie,
  Profiling-Status pie, Most-Missing-Attributes bar, Completeness-by-Source bar, and a **Lowest-Completeness Entities
  remediation table**; cascading **Data Source** filter (All sentinel; scatter dropped — CCC scatter awkward).
  Registered in `TWINS` → toggle auto. **Deployed, CDA-verified (7 queries), Playwright (cache-bust): 4 charts + table
  render, filter cascades (31.3%→22.2% MSSQL), toggle present.** ✓
- **LAUNCHER CONSOLE REDESIGN (2026-06-21, user request)**: rebuilt `gen-home.py` into a rich interactive console —
  **real dashboard thumbnails** on every card, **live search**, **group + Custom/Framework filter chips** (with counts),
  hover "Open →", light/dark, responsive grid. Thumbnails are captured by `analytics-pentaho-space/build/thumbs.js`
  (→ `content/dashboards/thumbs/<stem>.jpg`, sips-shrunk to 520px) and **served from the Pentaho repo** (not the
  external site) — verified `…:thumbs:<stem>.jpg/content` returns `image/jpeg`; `deploy.sh` now publishes the thumbs
  subfolder. i-home stays light (35 KB, thumbs by URL). **Playwright-verified (cache-bust): 32 cards + thumbnails,
  search ("sensitiv"→5), Framework chip→8, 0 errors.** Regenerate thumbs when dashboards change (thumbs.js).
- **i-cdf-governance.html — Governance CDF TWIN (2026-06-21, ⭐CDF / v2 item 4)**: Framework twin of toolkit
  `pdc-governance`. 4 KPIs (governed %, governed, ungoverned, assignments), Governance-Coverage pie, Governed-%-by-Source
  bar, Policy-Type pie, Top-Policies bar, and a **2-series Coverage-Over-Time CCC line** (Governed % + Metadata Complete %)
  built from a **long-form `trend_long` query** ([metric, month, pct] so CCC reads series=metric — the pattern for
  multi-series CCC lines). Cascading **Data Source** filter (All sentinel). Registered in `TWINS` → toggle auto.
  **Deployed, CDA-verified (7 queries; trend_long 22 rows), Playwright (cache-bust): 6 charts incl. 2-series line render,
  filter cascades (10.1%→10.9% POSTGRES), toggle present.** ✓
- **i-cdf-command-center.html — Command Center CDF TWIN (2026-06-21, ⭐CDF / v2 item 4)**: Framework twin of toolkit
  `pdc-command-center` (the observability single-pane-of-glass). 6 color-coded KPIs (BaseComponent, 3 fetchData: kpi
  ds-filtered + pipeline + lineage), Storage-by-Source bar, Sensitivity pie, Governance pie, Scan-Freshness bar,
  Completeness-by-Source bar, Data-Source-Scorecard table; cascading **Data Source** filter (All sentinel). Registered
  in `TWINS` → toggle auto. **Deployed, CDA-verified (10 queries), Playwright (cache-bust): 5 charts + table render,
  KPIs (14.0K assets, 92.2% success), filter cascades (14.0K→8.2K POSTGRES), toggle present.** ✓
- **i-cdf-term-stewardship.html — Term Stewardship CDF TWIN (2026-06-21, ⭐CDF / v2 item 4)**: Framework twin of
  toolkit `i-term-stewardship`. KPIs (BaseComponent, glossary-filtered: 576 defined / 23 glossaries / 161 in use /
  28% adoption), Term-Adoption CCC pie (in-use vs orphan), Terms-by-Glossary bar, Term-Types pie, Hierarchy-Depth bar,
  Top-Glossaries-by-Reach bar, Top-Applied-Terms table; cascading **Glossary** filter (All sentinel). Registered in
  `TWINS` → toggle auto on both sides. **Deployed, CDA-verified (8 queries), Playwright (cache-bust): 6 charts + table
  render, filter cascades (28%→80.9% adoption for BGC_DW), toggle present.** ✓
- **PUBLIC SHOWCASE SITE — analytics.pentaho.space (2026-06-21, user request)**: a living value-demonstration of the
  Pentaho platform (NOT "marketing") showing **real screenshots of the actual dashboards** (Custom + Framework), at
  http://analytics.pentaho.space (repo `kevinrhaas/analytics-pentaho-space`, Pages `main/`). Tooling in that repo:
  `build/dashboards.json` (curated manifest), `build/shots.js` (Playwright screenshots → `assets/dashboards/*.jpg` @1x JPEG),
  `build/gen_site.py` (regenerates index.html), `update-site.sh` (orchestrates + commits + pushes).
  **➡ END OF EVERY LOOP RUN: run `…/analytics-pentaho-space/update-site.sh`** (after the dashboard work is committed) to
  refresh the site. If you add/rename a featured dashboard, add it to that repo's `build/dashboards.json` first.
- **FIXED THE LOCAL CDE PLUGIN (2026-06-21, user request)**: CDE (`pentaho-cdf-dd`) was dead server-wide
  (`MetaModelManager` init NPE). Traced via container logs to the real cause: CDA `listDataAccessTypes` 500 →
  `ClassNotFoundException: …IDataServiceClientService$IStreamingParams` (PDI dataservices jar absent from the image).
  **Fix:** removed the 3 dataservices entries from CDA `…/system/cda/resources/components.properties` + restart.
  **Verified: `listDataAccessTypes` 200, `getComponentDefinitions` 200, CDE editor `.wcdf/edit` 200, CDE render 200,
  CDA doQuery still 200.** Persisted as `pentaho-11-docker-deploy/25-fix-cde-cda-dataservices.sh` (re-run after recreate).
  **→ CDE is now editable/renderable locally.** (cde-observability charts still blank — inline-datasource data refinement,
  see env-facts; switch gen-cde.py to external-.cda datasources next.)
- **CDE TRACK STARTED — actual .wcdf/.cdfde (2026-06-21)**: `dash-build/gen-cde.py` + first CDE dashboard
  `cde-observability.wcdf`/`.cdfde` (blueprint layout + CCC components). Structure mirrors the known-good CDE sample;
  opens in the CDE editor (verified). Next: external-.cda datasources so the charts populate; then add launcher card.
- **CLICK-TO-DRILL + FILTER CARRY-OVER (2026-06-21, user request)**: toolkit-wide cross-dashboard drill. Charts gain an
  optional `drill:{to,param[,extra]}` — clicking a **bar or pie slice** navigates to the target dashboard with
  `param=<clicked label>` PLUS all current filters appended as URL query params. The receiving side: `PDC.filters`
  now reads `PDC.urlParams()` and **pre-selects any filter whose id is in the URL** (so the target opens already
  filtered). Helpers: `PDC.urlParams/drillUrl/drill/bindDrill` in pdc-ui.js; drill bound in `_bars` (both orientations)
  and `_donut`. Demo: command-center "Storage by Data Source" & "Metadata Completeness by Source" bars drill into
  pdc-storage / pdc-data-quality filtered by the clicked source. **Verified: click POSTGRES bar → pdc-storage?ds=POSTGRES,
  filter pre-selected, all panels POSTGRES-only.** Reusable across ALL toolkit dashboards (add `drill:{...}` to any chart).
- **i-cdf-column-health.html — Column Health CDF TWIN (2026-06-21, ⭐CDF / v2 item 4)**: Framework twin of toolkit
  `i-column-health`. KPIs (BaseComponent, dtype-filtered: 10.2K cols / 247 key candidates / 189 dead / 80 w-nulls),
  **Column Health Mix** CCC pie (key=green/high=blue/normal=grey/dead=red), Columns-by-Data-Type CCC bar,
  Top-Tables-by-Dead-Columns CCC bar, Key-Candidate + Dead-Column CDF tables, cascading **Data Type** filter (All
  sentinel). Registered in `TWINS` → toggle auto on both sides. **Deployed, CDA-verified (7 queries), Playwright
  (cache-bust): charts+tables render, filter cascades (247→6 key candidates for TIMESTAMP), toggle present.** ✓
- **i-cdf-sensitive-domains.html — Sensitive Data Domains CDF TWIN (2026-06-21, ⭐CDF / v2 item 4)**: Framework twin of
  the toolkit `i-sensitive-domains`. KPIs (BaseComponent, glossary-filtered), **Domain × Sensitivity CCC stacked bar**
  (CCC HeatGrid isn't a packaged CDF component — 404 — so the cross-tab is a stacked bar: series=sensitivity coloured
  HIGH=red/MED=orange/LOW=blue/Unclassified=grey, category=glossary; query `heat_stacked` ordered [sens,glossary,n]),
  Sensitivity pie, Top-Risk-Domains bar, Top-Sensitive-Terms table, cascading **Domain** filter (All sentinel). Twin
  registered in `TWINS` → Custom⇄Framework toggle auto-rendered both sides. **Deployed, CDA-verified (6 queries),
  Playwright (cache-bust): charts render, filter cascades (63→55 HIGH for BGC_DW), toggle present.** ✓
- **TWIN TOGGLE — "Custom ⇄ Framework" (2026-06-21, user request)**: a bidirectional segmented header toggle between
  the **Custom** (HTML toolkit) and **Framework** (true CDF) build of a twin pair. Driven by a single `TWINS` map in
  `build.py` (`custom_stem -> cdf_stem`): the toolkit side gets it via a `{twin}` header slot (auto), the CDF side via a
  `<!--TWIN-->` marker that `stamp_handwritten` fills (`twin_toggle()` helper). **EVERY FUTURE CDF TWIN: just add the
  pair to `TWINS` + put `<!--TWIN-->` in the CDF header — both sides get the toggle automatically.** Wired
  i-exec-scorecard ⇄ i-cdf-scorecard. **Playwright-verified both directions navigate + correct active segment.** ✓
- **i-cdf-scorecard.html — Executive Scorecard CDF TWIN (2026-06-21, v2 NEXT item 4 / ⭐CDF priority)**: a true-CDF
  twin of the toolkit `i-exec-scorecard` (parallel suite). 6 color-coded KPI tiles (BaseComponent + fetchData headline),
  **Domain Health** CCC bar (governed/complete/success/adoption %), Sensitivity pie, Catalog Growth + Data Movement
  CCC lines, Assets-by-Source bar. Own `i-cdf-scorecard.cda` (headline + domain_health + by_source + sens_mix + growth +
  throughput). Header has a "⇆ Toolkit twin" cross-link. New launcher card in **Executive** group. **Deployed, CDA-verified
  (6 queries), Playwright-verified with cache-bust: 6 SVG charts + KPIs render, values clean, footer v2, 0 real errors.** ✓
  - Also: **build.py `stamp_handwritten` now also stamps the footer `iteration vN`** — fixed the pre-existing CDF
    dashboards (i-cdf-overview/lineage) that were stuck showing "iteration v1".
  - ⚠ Re-confirmed: CCC `valuesMask` prints literally (both `#,##0` and `#,0.0`) → OMIT it (STATUS CDF GOTCHAS updated).
- **CROSS-DASHBOARD DRILL-THROUGH (2026-06-21, v2 NEXT item 3)**: turned the command-center into a navigable hub.
  **Toolkit enhancement (reusable):** `PDC.dashUrl(name)` (version-portable sibling URL from `location.pathname`) +
  a `linkTo`/`linkLabel` option on `PDC.card` that renders a subtle top-right "→" link in the card header. Wired the
  6 command-center panels to their domains (storage, compliance, governance, freshness, data-quality, exec-scorecard).
  Rebuilding the toolkit regenerated all 23 toolkit dashboards (additive — only command-center opts in). **Deployed,
  Playwright-verified (cache-bust): 6 drill links with correct targets; clicking "Governance Coverage" → Policy &
  Governance Coverage; 0 errors.** Any dashboard can now add drill-through via `linkTo`.
- **ENHANCED pdc-storage — footprint growth trend (2026-06-21, v2 NEXT item 2 cont.)**: added a full-width
  **"Storage Footprint Growth"** cumulative-TB area chart over the month each entity was first scanned (383→**2,764 TB**,
  matches the KPI). New `growth` CDA query (`entity_storage_demo` JOIN first-scan from `fact_entity_snapshot`+`dim_date`,
  param `ds`), wired to the data-source filter. **Deployed, CDA-verified (all 11 mo + AWS), Playwright-verified with
  cache-bust: 6 panels, trend area renders, footer v2, 0 errors.** ✓
- **ENHANCED pdc-governance — trend panel (2026-06-21, v2 NEXT item 2)**: added a full-width **"Governance Coverage
  Over Time"** dual-line trend (Governed % + Metadata Complete %) over 11 scan months, via a new `trend` CDA query
  (`fact_entity_snapshot` JOIN `dim_date`, param `ds`). Wired into the existing data-source filter. **Deployed,
  CDA-verified (all + POSTGRES), Playwright-verified: 6 panels, trend renders, filter keeps it.** ✓
  ⚠ **GOTCHA (recorded below): Pentaho's repo GET (`/api/repos/...html/content`) served a STALE cached copy to the
  browser after deploy** — render-tests showed the pre-deploy file. Fix: append a cache-bust query `?cb=<ts>` to the
  URL in Playwright (curl/doQuery were fine; clearing CDA cache did NOT help — it's the repo content cache).
- **i-exec-scorecard.html — Unified Executive Scorecard (2026-06-21, v2 NEXT item 1)**: the v2 hero board — one
  leadership-facing screen pulling every domain's headline metric. 6 hero KPIs (assets, governed %, pipeline success,
  HIGH-sensitivity, storage TB, $/mo), 2 trend sparklines (catalog growth, data movement), and **9 status-colored
  domain cards** each with a **drill-through link** to its dashboard. Single `headline` CDA query (16 sub-metrics across
  all facts) + growth/throughput trends. **Drill-through is version-portable** (derives sibling URL from
  `location.pathname`). New launcher group **"Executive"** (top). **Deployed to v2, CDA-verified (3 queries),
  Playwright-verified: 6 KPIs + 2 sparklines + 9 cards + 9 drill links; clicking one navigates to the Command Center
  within v2.** ✓
- **SEEDED v2 from v1 (2026-06-21)** via `iteration/new-iteration.sh`: full copy of the complete v1 suite
  (25 dashboards: 23 toolkit/HTML + 2 true CDF + lineage-explorer; 221 analyzer files; full ddl tree), VERSION
  bumped to **v2**, every dashboard re-stamped to deploy path `/public/pdc-iteration/v2`. **Deployed to
  `/public/pdc-iteration/v2` (103 files), CDA-verified, Playwright coexistence-verified: v1 ("iteration v1")
  and v2 ("iteration v2") launchers + dashboards both render independently from their own folders.** ✓
  → This is the v2 **baseline**. Everything below in NEXT is v2 work ON TOP of it.

> _Inherited v1 DONE history (the full baseline this v2 starts from) is in git + v1/ITERATION-STATUS.md; not duplicated here._

## CDF GOTCHAS (hard-won — read before building another CDF dashboard)
- Bootstrap with `<script src="/pentaho/plugin/pentaho-cdf/api/cdf-embed.js">` (host-relative so it works on any server), then `require(['cdf/Dashboard.Blueprint', 'cdf/components/…'], function(Dashboard,…){ var d=new Dashboard(); … d.init(); })`.
- jQuery's global `$` is NOT available at require-callback time → don't use `$.extend`; use a plain merge helper.
- CCC chartDefinition: do **NOT** set `width:"100%"` (string breaks pvc layout → blank chart). Omit width (CCC reads the container) and set numeric `height`. Container div needs an explicit CSS height.
- CCC reads CDA results **relationally**: a 2-col result = [category, measure]. A 3-col result is read as [series, category, measure] → e.g. a trend with an extra `ym` column renders as multicolored dots, not one line. Return exactly 2 columns for single-series bar/line/pie.
- `valuesMask` is **unreliable in this CCC build** — both Java `#,##0` AND cdo `#,0.0` print the mask string literally. **OMIT `valuesMask`** and let CCC default-format the numbers (works fine). Confirmed twice (i-cdf-overview, i-cdf-scorecard).
- Pass dashboard params to **chart/table** components via a component-level `parameters:[["queryParam","dashParam"]]` (NOT inside chartDefinition).
- For a **custom** updating panel (e.g. KPI tiles): subclass `cdf/components/BaseComponent` with `htmlObject` set, `listeners:["param"]`, and an `update()` method. Query inside it with `dashboard.getQuery({queryType:'cda',path,dataAccessId}).fetchData({param:val}, cb)` — `fetchData(params,cb)` passes params; `getQuery({params:…})` and `q.setParameter` do **not** work.
- SelectComponent: prepend an "All" option by UNION-ing a sentinel row (`'%' AS v, 'All sources' AS l`) in the options query; map value=col0,label=col1 with `valueAsId:false`.
- Benign noise: CDF requests `…/<dash>.html/messages_supported_languages.properties` (404/500) — an i18n bundle lookup; ignore.

## GOTCHAS (read before building)
- `deploy.sh` already PUTs the repo dir before pushing (push-content 403s on the compare-download if the folder doesn't exist). For a manual push, `curl -u admin:password -X PUT "http://localhost:8080/pentaho/api/repo/dirs/:public:pdc-iteration:v2"` first.
- Playwright chromium download fails here (CDN unreachable) → launch with `{channel:'chrome'}` (Google Chrome is installed). Render-test helpers in `/tmp/pwshots`: `v1test.js` (suite, edit REPO to v2), `cdftest2.js` / `cdffilter.js` (CDF). URL `/api/repos/:public:pdc-iteration:v2:<name>.html/content`.
- Validate each CDA query with doQuery (`--data-urlencode param<name>=<val>`) before wiring JS. Build with `python3 dash-build/build.py`; add each toolkit dashboard to `build.py` DASHBOARDS + `gen-home.py` GROUPS. Hand-written dashboards (CDF/lineage) go straight into `content/dashboards` and are listed in `build.py` HANDWRITTEN for path-stamping.
- ⚠ **STALE REPO HTML after deploy**: Pentaho caches `/api/repos/:...:<dash>.html/content` and may serve the PRE-deploy file to a browser (curl/doQuery see the new file; CDA clearCache does NOT fix it — it's the repo content cache, not CDA). In **render-tests append a cache-bust query** `...html/content?cb=<timestamp>` so Playwright gets the just-deployed file. Symptom: enhanced panels missing / old footer version.

## PENDING DEPLOY
- ✅ DONE: full v2 suite deployed to `localhost` `/public/pdc-iteration/v2`, CDA-verified, Playwright coexistence-verified vs v1.
- ✅ DONE (2026-06-22): full v2 suite (204 files) deployed to **193** `/public/pdc-iteration/v2`, portable (unqualified queries), live doQuery + render verified.
- ✅ REDEPLOYED to **193** (2026-06-23, VPN up, user request): synced current suite (210 processed · 6 new · 74 changed · 0 failed) — all 8 sensitivity cross-filters, `PDC.chord`/Platform Interconnect, donut centerCap fix, and the published-timestamp launcher. Verified on 193: doQuery for the new filters matches localhost (applications sens=HIGH → 2 apps/52/7/22.3; ownership sens=LOW → 255), i-home renders 52 cards + `PUBLISHED 2026-06-23 10:10 CDT`, 0 page errors. **193 now carries the 10:10 build (= localhost).**
- ⏭ **241 (next):** provision `PDC-BIDB-EXT` on `https://10.80.230.241/pentaho` with `currentSchema=bidb_ext`, then `./deploy.sh 10.80.230.241:443 admin <pass>`. No content changes needed (suite is now schema-portable). Verify a doQuery + launcher render afterward.
- ⏸ xanalyzer/xdash (`i1-*`): can't deploy/test locally (no Analyzer plugin). Defer until an Analyzer-enabled server is available.

## IN PROGRESS
- (none — CLOUD RUN #31 complete; committed and pushed to main)

## NEXT (ordered backlog — build, deploy to /public/pdc-iteration/v2, test via Playwright, commit)
**v2 theme = depth: trends, drill-through, exec rollup, richer CDF.** One deliverable per loop run.

> ⭐ **USER PRIORITY (2026-06-21): CDF/CDE VERSION OF *EVERYTHING* — BUILD AND MAINTAIN.** Every Custom (HTML toolkit)
> dashboard should have a Framework (true CDF) twin, with the Custom⇄Framework toggle. Build them one per run (CDF
> work leads); it's fine if a twin is only "OK". Name twins `i-cdf-<topic>`, register in `build.py` HANDWRITTEN +
> `TWINS` + a launcher card.
> **MAINTAIN PARITY (important):** when you change a Custom dashboard (new panel / filter / drill / trend), update its
> Framework twin to match in the same or the next run — and vice versa. Keep the pair feature-equivalent. The drill +
> URL-filter capability (PDC.drill / PDC.filters URL pre-select) and "more filters" should be carried into the CDF
> twins too (CDF: SelectComponent + `parameters` mapping; read `location.search` for incoming drill params).
> **CDF vs CDE:** BOTH render/verify locally now. **CDF** "Framework" twins (require-API HTML) = the fast routine path.
> **CDE** (.wcdf/.cdfde via `gen-cde.py`) now works too — the local CDE plugin was FIXED (see env-facts /
> `25-fix-cde-cda-dataservices.sh`); CDE editor opens. TODO on the CDE side: switch `gen-cde.py` to external-.cda
> datasources so charts populate, render-test via `.wcdf/generatedContent?cb=`, then add a launcher card.
> **TWIN COVERAGE** (Custom→Framework CDF): ✅ i-exec-scorecard, ✅ i-sensitive-domains, ✅ i-column-health, ✅ i-term-stewardship, ✅ pdc-command-center, ✅ pdc-governance, ✅ pdc-data-quality, ✅ pdc-freshness, ✅ pdc-storage, ✅ pdc-cost, ✅ i-data-integration, ✅ i-profiling, ✅ i-growth, ✅ i-privacy, ✅ pdc-applications, ✅ pdc-redundancy, ✅ pdc-ownership, ✅ pdc-glossary, ✅ i-schema-explorer, ✅ pdc-compliance, ✅ i-adoption, ✅ pdc-pipeline-obs, ✅ i-unstructured.
> ✅ **TWIN COVERAGE COMPLETE — all 24 Custom toolkit dashboards have a Framework (CDF) twin.** (Plus standalone CDF
> i-cdf-overview / i-cdf-lineage.) No twin TODOs remain.
1. ~~Unified Executive Scorecard~~ **DONE** (`i-exec-scorecard`) — hero board + 9 drill-through domain cards + 2 trend sparklines. The version-portable drill-through helper (`location.pathname` sibling-URL) is reusable for item 3.
2. **Time-series / trend depth** — DONE: pdc-governance (coverage-over-time) + pdc-storage (footprint growth). (pdc-compliance + pdc-freshness already had trends.) Remaining optional trend targets: **pdc-cost** (spend growth over time, same first-scan + `monthly_cost_usd` pattern), **pdc-redundancy** (reclaimable growth). Move to item 3 unless a cost trend is wanted.
3. ~~Cross-dashboard drill-through~~ **DONE** — `PDC.card` `linkTo` + `PDC.dashUrl` in the toolkit; command-center panels drill to their domains. Optional follow-on: add `linkTo` to other hub-like dashboards (e.g. i-sensitive-domains → i-privacy, pdc-data-quality → i-column-health).
4. **Richer CDF/CDE (LEAD — see USER PRIORITY above)**: ~~CDF Executive Scorecard~~ **DONE** (`i-cdf-scorecard`). ~~`i-cdf-sensitive-domains`~~ **DONE** (stacked-bar cross-tab — CCC HeatGrid not packaged). ~~`i-cdf-column-health`~~ **DONE**. ~~`i-cdf-term-stewardship`~~ **DONE**. ~~`i-cdf-command-center`~~ **DONE**. ~~`i-cdf-governance`~~ **DONE** (incl. 2-series CCC line via long-form trend). ~~`i-cdf-data-quality`~~ **DONE**. ~~`i-cdf-freshness`~~ **DONE**. ~~`i-cdf-storage`~~ **DONE**. ~~`i-cdf-cost`~~ **DONE**. ~~`i-cdf-data-integration`~~ **DONE**. ~~`i-cdf-profiling`~~ **DONE**. ~~`i-cdf-growth`~~ **DONE**. ~~`i-cdf-privacy`~~ **DONE**. ~~`i-cdf-applications`~~ **DONE**. ~~`i-cdf-redundancy`~~ **DONE**. ~~`i-cdf-ownership`~~ **DONE**. ~~`i-cdf-glossary`~~ **DONE**. ~~`i-cdf-schema-explorer`~~ **DONE**. ~~`i-cdf-compliance`~~ **DONE**. ~~`i-cdf-adoption`~~ **DONE**. ~~`i-cdf-pipeline-obs`~~ **DONE**. ~~`i-cdf-unstructured`~~ **DONE**. ✅ **ALL 24 TWINS COMPLETE (24/24 parity).**
   **➡ NEXT DELIVERABLE (top of backlog now that twins are done — pick ONE per run):**
   1. ~~CDE external-.cda fix~~ **DONE (2026-06-22)** — `cde-observability` charts populate via external-CDA datasources;
      launcher card + CDE chip added. **Follow-on (optional):** build CDE twins of more dashboards using the `cda_ds()`
      recipe (one per run), and/or add titles/filters to the bare CDE blueprint layout.
   2. ~~Upgrade standalone CDF dashboards~~ **DONE** — ~~i-cdf-overview~~ (sensitivity cross-filter + drill→pdc-storage)
      + ~~i-cdf-lineage~~ (time-range cross-filter + drill→pdc-pipeline-obs). Both done.
   3. **Roll out click-to-drill across more CDF twins** (one per run) — reusable proven pattern: CCC `clickable:true` +
      `clickAction:function(scene){var v=scene.vars.category.value; drillTo(stem, key+'='+enc(v));}` + `drillTo()` helper.
      ~~i-cdf-storage source-bar → pdc-cost~~ **DONE**. ~~i-cdf-governance governed-%-by-source → pdc-data-quality~~ **DONE**.
      ~~i-cdf-cost cost-by-source → pdc-storage~~ **DONE**. ~~i-cdf-data-quality completeness-by-source → pdc-ownership~~ **DONE**.
      ~~i-cdf-freshness stale-by-source → pdc-storage~~ **DONE**. ~~i-cdf-redundancy reclaimable-by-source → pdc-storage~~ **DONE**.
      ~~i-cdf-command-center storage-by-source → pdc-storage~~ **DONE**. ~~i-cdf-profiling profiled-by-source → pdc-data-quality~~ **DONE**.
      Click-to-drill is now on **8 twins** + 2 standalone CDF (overview/lineage). Remaining natural targets (optional):
      i-cdf-sensitive-domains (glossary→privacy), i-cdf-applications, i-cdf-glossary, i-cdf-ownership. Largely saturated —
      consider this workstream ~done and shift weight to cool-viz (IDEAS) + more filters/CDE.
      pdc-storage?ds=, i-cdf-command-center storage-by-source → pdc-storage?ds=, i-cdf-sensitive-domains/privacy where natural.
      ⚠ **Check the drill target's filter id first** — most pdc-*/i-* dashboards use `ds`, but some use a different dim
      (e.g. i-column-health=`dtype`, i-cdf-lineage/pipeline=`integration`, glossary=`glossary`). Match the value to a target that accepts it.
   4. When the above feel worked-down, **seed v3**: `cd iteration && ./new-iteration.sh` (then update this loop's paths). Also upgrade i-cdf-overview/i-cdf-lineage with cross-filters / drill / more CCC types. One per run. ⚠ CCC HeatGrid is NOT a packaged CDF component → use stacked bar for cross-tabs.
   - **REUSABLE TWIN RECIPE:** clone the i-cdf-scorecard scaffold; OMIT `valuesMask`; put `<!--TWIN-->` in the CDF header; add the `custom->cdf` pair to `build.py` `TWINS`; add a launcher card; cache-bust render-tests. Both Custom⇄Framework toggles then appear automatically. Label convention (user): **CDF = "Framework", HTML toolkit = "Custom"**.
   - **LAUNCHER THUMBNAIL for any NEW dashboard** (the i-home console shows thumbnail cards; missing → gradient fallback): add the stem to `analytics-pentaho-space/build/launcher-stems.txt`, then `cd analytics-pentaho-space && NODE_PATH=/tmp/pwshots/node_modules node build/thumbs.js build/launcher-stems.txt`, `sips -Z 520 --setProperty formatOptions 62 assets/thumbs/<stem>.jpg`, `cp assets/thumbs/<stem>.jpg ../solution-engineering/iteration/v2/content/dashboards/thumbs/`, then `./iteration/v2/deploy.sh` publishes it. (Or just run thumbs.js for all stems to refresh everything.)
5. **Roll out click-to-drill + more filters across dashboards** (user request): add `drill:{to,param}` to the natural charts on each Custom dashboard (source/category bars/slices → the matching domain dashboard, filtered), and add a 2nd useful filter where it helps (e.g. sensitivity, time-range, data-type). The toolkit mechanism is done (PDC.drill + PDC.filters URL pre-select) — this is per-dashboard wiring. Mirror into the CDF twins.
6. **Enhance inherited v1 dashboards in place** with a remediation/worst-offender table or trend — the pdc-data-quality enhancement is the template.
7. (Pentaho-native .xanalyzer/.xdash still pending an Analyzer-enabled server.)
- When v2 feels worked-down, seed v3: `cd iteration && ./new-iteration.sh`.

## CONVENTIONS
- Each HTML dashboard: add to `dash-build/build.py` DASHBOARDS list (filename, title, sub, cda path under
  `/public/pdc-analysis/iteration/`, body js, group). CDA per dashboard as `i-<name>.cda`.
- Reuse `PDC.*` toolkit. Light/dark toggle + filters + faint provenance caption per panel.
- ⭐ **Portability: CDA connects to the named `PDC-BIDB-EXT`; table names are ALWAYS unqualified (no `schema.` prefix).** Schema is resolved by the server's connection (`currentSchema`). Never reintroduce a `bidb_ext_dev.`/`bidb_ext.` prefix.
- Validate every CDA query with `psql` (or doQuery) BEFORE wiring JS; render-test live with Playwright.
- Commit after each working dashboard with a clear message; push to `kevinrhaas/solution-engineering` main.
