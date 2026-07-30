/* Analytics — © 2026 Polecat.live. See LICENSE. */
/* app/demopacks.js — Demo packs (Conservation Insight): a SECOND sample library,
   separate from the CDA catalog, of one-click install/remove workspace
   content built for a specific pitch (here: the Conservation Insight geo-analytics
   case). Installing a pack writes ordinary workspace rows (connections, datasets,
   a prep job, analyses, a dashboard) tagged with `demoPackId` so Remove can find
   and delete exactly what Install wrote — everything downstream (Explore,
   the Studio canvas, Home, Datasets, Jobs) is the SAME machinery every other
   workspace row already uses, nothing pack-specific to maintain there.

   The pack seeds a small-but-complete workspace so a first-run visitor (and the
   demo-login flow) lands on something alive: a couple of connections, a raw
   provider export plus real county / watershed geo datasets that render actual
   choropleths, a county→state rollup JOB (the acreage-weighted-mean pattern the
   jobs engine was built for), four View Builder-native per-practice analyses
   pinned to Home (CONS-4 — they open on the shelves, not in Quick Views), and
   one featured multi-widget dashboard.

   All pack content is SYNTHETIC and says so in its own titles/subtitles —
   this is a sales-demo fixture, not real provider or AgCensus data. */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  // See app/sampledata.js Studio.SAMPLE_PROVIDERS. Fall back to a hard-coded copy
  // if sampledata hasn't defined it (defensive — same file, but keeps this module
  // self-standing for tests that load it alone), same convention as geo() below.
  var PROVIDERS = Studio.SAMPLE_PROVIDERS || ["DTN", "Indigo Ag", "Iowa State", "Regrow", "Terra Diagnostics"];
  var PRACTICES = [
    { key: "coverCrops", label: "Cover crops" },
    { key: "noTill", label: "No-till" },
    { key: "reducedTill", label: "Reduced tillage" },
    { key: "conventional", label: "Conventional" }
  ];

  Studio.DEMO_PACKS = {
    conservation: {
      id: "conservation",
      kind: "workspace",
      name: "Conservation Insight — cover crop & tillage adoption",
      tagline: "2 connections · 5 datasets · a county→state rollup job · 4 analyses · 3 dashboards (featured + watershed map + metrics wheel)",
      blurb: "3 dashboards (the featured multi-scale map, a dedicated HUC8 watershed map, and the " +
        "Conservation System Metrics wheel), 5 datasets (a raw provider export, county and watershed " +
        "choropleths, and the scored metrics index), 2 connections, a county→state rollup job, and " +
        "4 View Builder analyses pinned to Home. All data is synthetic and embedded in the pack — " +
        "nothing to connect."
    },
    // LF2(c)/LF16: the pre-existing generic showcase gallery (governance, platform ops,
    // delivery, finance, marketing, reliability, compliance, feature tour) folded into a
    // toggleable pack the same way Conservation Insight is one — kind:"examples" (below)
    // means installDemoPack/removeDemoPack here only flip the installed flag (no synthetic
    // connections/datasets/jobs of their own, unlike the "workspace" kind). Gated examples
    // are tagged demoPackId:"datamanagement" in data/examples/index.json; LF43's
    // ensurePackExamplesMaterialized (app/studio.js) is what turns an install into real
    // workspace "dashboards" rows (so they show in Dashboards, not just the Examples ▾
    // gallery) and removeDemoPack's demoPackId sweep below cleans those up again.
    datamanagement: {
      id: "datamanagement",
      kind: "examples",
      // HOME-EX2 folded the 4 formerly pack-less showcases (data quality, pipeline,
      // storage, cost) into this pack — keep the counts here at 12, not 8.
      name: "Data Management & Governance — showcase gallery",
      tagline: "12 generic showcase dashboards: governance, platform ops, delivery, finance, marketing, reliability, compliance, data quality, pipeline, storage, cost, feature tour",
      blurb: "12 showcase dashboards — governance, platform ops, delivery, finance, marketing, " +
        "incident response, compliance, data quality, pipeline observability, storage, cost, " +
        "and an interactive feature tour. Dashboards only: no connections, datasets or jobs, " +
        "and their sample data is embedded. Installed by default."
    }
  };

  var INSTALLED_KEY = "studio-demopacks-installed";
  // SAMPLE-DATA-1 (Kevin live, 2026-07-30): every object a pack seeds is FILED in the
  // pack's folder — one folder per pack across all types (dashboards already do this
  // via studio.js PACK_FOLDERS; keep the two names in sync).
  var PACK_FOLDER = "Conservation Insight";
  // Packs installed before a user ever opens Settings. "datamanagement" gates content that
  // used to be unconditional (the generic showcase gallery) — defaulting it to installed
  // keeps that gallery looking the same as it always has for every existing workspace, while
  // still making it a real opt-out toggle (see Settings' Sample packs card).
  var DEFAULT_INSTALLED = ["datamanagement"];
  function installedIds() {
    var raw; try { raw = localStorage.getItem(INSTALLED_KEY); } catch (e) { raw = null; }
    if (raw == null) return DEFAULT_INSTALLED.slice();
    var v; try { v = JSON.parse(raw); } catch (e) { v = null; }
    return Array.isArray(v) ? v : DEFAULT_INSTALLED.slice();
  }
  function setInstalledIds(ids) {
    try { localStorage.setItem(INSTALLED_KEY, JSON.stringify(ids)); } catch (e) {}
  }
  Studio.demoPackInstalled = function (id) { return installedIds().indexOf(id) >= 0; };

  // Real, in-geometry region ids (see app/sampledata.js Studio.SAMPLE_GEO) so
  // every seeded region actually colors in a choropleth. Fall back to a tiny
  // hard-coded set if sampledata hasn't defined it (defensive — same file, but
  // keeps this module self-standing for tests that load it alone).
  function geo() {
    var g = Studio.SAMPLE_GEO || {};
    return {
      fips: g.fips || ["19153", "17019", "18097", "27053", "31055"],
      huc8: g.huc8 || ["07080106", "05120101", "07100002", "10240003", "07020012"]
    };
  }
  // Corn-Belt state FIPS → postal, for deriving statecode from a county FIPS
  // and for the state-level rollup (the choropleth's `state` scale accepts
  // postal codes). Covers exactly the states present in SAMPLE_GEO.fips.
  var FIPS_POSTAL = {
    "17": "IL", "18": "IN", "19": "IA", "20": "KS", "26": "MI", "27": "MN",
    "29": "MO", "31": "NE", "38": "ND", "39": "OH", "46": "SD", "55": "WI"
  };
  var STATE_BASE = { IL: 41, IN: 38, IA: 52, KS: 22, MI: 31, MN: 47, MO: 27, NE: 24, ND: 19, OH: 44, SD: 21, WI: 43 };
  var PROV_OFFSET = { "DTN": 3, "Indigo Ag": -2, "Iowa State": 6, "Regrow": 1, "Terra Diagnostics": -4 };
  function clampPct(v) { return Math.max(5, Math.min(94, Math.round(v))); }

  // ---- the raw provider export — the "file-connection with mapping demo" ----
  // Deliberately RAW column names (not the app's labelCol/seriesCol/valueCol
  // vocabulary), so opening it in Explore/Datasets demonstrates mapping a
  // real-world export onto chart roles, exactly like a prospect's own file.
  var RAW_COLS = ["State_FIPS", "Provider_Name", "Practice", "Adoption_Pct", "Report_Year"];
  // The raw provider export's rows as arrays — the CSV below serializes these, and
  // CONS-4's builderViewRow() computes each per-practice View's crosstab basis from
  // the SAME rows, so the seeded da.columns can't drift from what #118's live
  // re-run computes at render time.
  function conservationRawRows() {
    var rows = [];
    var states = { "19": "IA", "17": "IL", "18": "IN" };
    var years = [2019, 2022, 2024];
    var i = 0;
    Object.keys(states).forEach(function (fips) {
      PROVIDERS.forEach(function (prov) {
        PRACTICES.forEach(function (p) {
          years.forEach(function (yr) {
            var pct = 22 + ((i * 37) % 40); // deterministic 22–61 spread
            rows.push([fips, prov, p.label, pct, yr]);
            i++;
          });
        });
      });
    });
    return rows;
  }
  function conservationRawCsv() {
    return [RAW_COLS.join(",")].concat(conservationRawRows().map(function (r) { return r.join(","); })).join("\n");
  }

  // ---- county-level cover-crop adoption (real FIPS → real choropleth) ------
  // One row per (county, provider): geoid, statecode, provider, pct, acres.
  // `acres` is the honest weight for rolling a percent up to the state level
  // (the jobs-engine wmean case). Deterministic, so re-running the rollup job
  // reproduces byte-identical output.
  function countyRows() {
    var fips = geo().fips, out = [];
    fips.forEach(function (id, ci) {
      var st = FIPS_POSTAL[id.slice(0, 2)] || "IA";
      var acres = 40 + ((ci * 97) % 460); // 40–500 (thousand acres)
      PROVIDERS.forEach(function (prov, pi) {
        var pct = clampPct((STATE_BASE[st] || 35) + (PROV_OFFSET[prov] || 0) + (((ci * 13 + pi * 7) % 19) - 9));
        out.push({ geoid: id, statecode: st, provider: prov, pct: pct, acres: acres * 1000 });
      });
    });
    return out;
  }
  function countyCsv() {
    var head = "geoid,statecode,provider,pct,acres";
    var body = countyRows().map(function (r) { return [r.geoid, r.statecode, r.provider, r.pct, r.acres].join(","); });
    return [head].concat(body).join("\n");
  }
  // The rollup the demo JOB produces (county → state, acreage-weighted mean).
  // Pre-computed here so the state choropleth renders immediately on install
  // AND re-running the job yields the same numbers.
  function stateRollupCsv() {
    var groups = {}, order = [];
    countyRows().forEach(function (r) {
      if (!groups[r.statecode]) { groups[r.statecode] = { sw: 0, swv: 0, acres: 0 }; order.push(r.statecode); }
      var gr = groups[r.statecode];
      gr.sw += r.acres; gr.swv += r.acres * r.pct; gr.acres += r.acres;
    });
    var head = "statecode,pct,acres";
    var body = order.map(function (st) {
      var gr = groups[st];
      var pct = gr.sw > 0 ? Math.round(gr.swv / gr.sw) : 0;
      return [st, pct, gr.acres].join(",");
    });
    return [head].concat(body).join("\n");
  }
  // ---- watershed (HUC8) adoption — a choropleth at a DIFFERENT geo level ----
  function huc8Csv() {
    var huc8 = geo().huc8, rows = ["huc8,provider,pct"];
    huc8.forEach(function (id, hi) {
      PROVIDERS.forEach(function (prov, pi) {
        var pct = clampPct(33 + (PROV_OFFSET[prov] || 0) + (((hi * 11 + pi * 5) % 23) - 11));
        rows.push([id, prov, pct].join(","));
      });
    });
    return rows.join("\n");
  }

  // LF7: the trend DA takes an optional "sinceYear" query param (wired to the
  // featured dashboard's "Since year" filter below) — demonstrates a plain
  // filterDef/paramsFor round-trip on a real panel, not just decoration.
  function timeSeriesDA(id, practice) {
    return { id: id, name: "Conservation Insight — " + practice.label + " ensemble (demo)", kind: "sql", columns: ["year", "provider", "pct"], authored: true,
      params: [{ name: "sinceYear", type: "String", default: "%" }] };
  }
  // A geo data access for a given region column (fips / huc8 / statecode) — the
  // sample engine crosses it against the provider domain, so the choropleth's
  // median-across-providers "common estimate" convention colors every region.
  function geoDA(id, idCol, label) {
    return { id: id, name: "Conservation Insight — " + label + " (demo)", kind: "sql", columns: [idCol, "provider", "pct"], authored: true };
  }
  // LF7: `channel` names the ensemble bus this choropleth listens on — shared
  // with ensembleChart() below so a provider toggle on any ensemble trend
  // panel live-recolors every map on the same channel (see
  // DashKit.ensembleBus/providersChannel in app/studio-charts.js). Was previously
  // relying on studio-render.js's own `o.channel || "providers"` fallback —
  // now explicit on the spec so the linkage is documented, not accidental.
  function choroplethChart(daId, idCol, scale) {
    return { type: "choropleth", da: daId,
      map: { idCol: idCol, valueCol: "pct", seriesCol: "provider" },
      opts: { scale: scale, fmt: "pct", agg: "median", channel: "providers" } };
  }
  function kpiDA(id, col) { return { id: id, name: id, kind: "sql", columns: [col], authored: true }; }
  // LF7: takes an optional "practice" param (wired to the featured dashboard's
  // "Practice" filter below) so the provider-comparison bar responds to it.
  function providerDA(id) {
    return { id: id, name: "Conservation Insight — adoption by provider (demo)", kind: "sql", columns: ["provider", "pct"], authored: true,
      params: [{ name: "practice", type: "String", default: "%" }] };
  }
  // Filter-options DAs (LF7): no real backing query (see the module header —
  // this pack's DAs never carry literal `sql:` text, same as every other DA in
  // this file), just enough shape (id + columns) for filterDef's option list
  // to render real practice/year values via the sample engine's classify().
  function practiceFilterDA(id) { return { id: id, name: "Conservation Insight — practice filter options (demo)", kind: "sql", columns: ["practice"], authored: true }; }
  function yearFilterDA(id) { return { id: id, name: "Conservation Insight — year filter options (demo)", kind: "sql", columns: ["year"], authored: true }; }
  function ensembleChart(daId) {
    return { type: "ensembleSeries", da: daId,
      map: { labelCol: "year", seriesCol: "provider", valueCol: "pct" },
      opts: { refSeries: "AgCensus", fmt: "pct", medianLabel: "Common estimate", height: 260, channel: "providers" } };
  }

  // CONS-4 (Kevin live, 2026-07-30): the pack's per-practice Views are VIEW
  // BUILDER-native — a real `builder` blob over the raw provider dataset, so a
  // click in the Views list opens the shelves (Report_Year on Rows, AVG
  // Adoption_Pct, a Provider_Name color split, a Practice filter), not the
  // Quick Views fallback. The da/chart pair is authored exactly the way bdSave
  // does it: compute the line crosstab basis with the pure Studio.Build.compute
  // (the same engine #118's live re-run uses at render time, over the same rows
  // via conservationRawRows, so seed and runtime can't drift), then newPanel +
  // the multi-series widening. Dashboards keep their own non-builder panels.
  function builderViewRow(practice, rawDsId) {
    var blob = {
      dsKind: "ws", dsId: rawDsId, chartType: "line",
      shelfRows: [{ col: "Report_Year" }],
      shelfCols: [{ col: "Adoption_Pct", agg: "avg" }],
      shelfColor: [{ col: "Provider_Name" }],
      filters: [{ col: "Practice", kind: "in", values: [practice.label] }],
      calcs: [], paletteKey: "", mapScale: ""
    };
    var rows = conservationRawRows().filter(function (r) { return r[2] === practice.label; });
    // bdLineSeriesBasis's own cf-crosstab shape: pivot the measure across the Color
    // field's values, then drop the trailing crosstab "Total" column.
    var xtab = Studio.Build.compute(RAW_COLS, rows,
      blob.shelfCols.concat([{ col: "Provider_Name", agg: null }]), blob.shelfRows);
    var head = xtab.head.slice(0, -1);
    var name = "Conservation Insight — " + practice.label + " (illustrative demo)";
    var da = { id: "vb_" + practice.key, name: name, kind: "sql", sql: "", query: "",
      columns: head.slice(), params: [], authored: true };
    da.builder = Studio.clone(blob);
    var p = Studio.newPanel("line", da);
    p.chart.map.series = head.slice(1).map(function (c) { return { col: c }; });
    return {
      name: name, folder: PACK_FOLDER, demoPackId: "conservation",
      pinned: true, panelTitle: "", chartType: "line", paletteKey: "",
      da: da, builder: Studio.clone(blob), chart: p.chart
    };
  }

  // The featured demo dashboard — a best-practice conservation story, top-down:
  //   KPIs (the headline adoption numbers) → CHOROPLETHS AT THREE SCALES (county
  //   hero, then watershed + state) so the maps lead and land in the thumbnail →
  //   the provider ENSEMBLE trends (consensus vs each provider) → a by-provider
  //   breakdown. Styled with the CTIC-derived Conservation theme.
  function dashboardSpec() {
    var das = [], panels = [], kpis = [];

    // ── LF7: real filterDef filters, wired to actual panel params (not just
    // decoration — see the sinceYear/practice params added to the DA builders
    // above). "Practice" narrows the provider-comparison bar; "Since year"
    // narrows every ensemble trend panel. The provider-toggle CROSS-filter
    // (click a provider on any ensemble legend → every map on the "providers"
    // channel re-colors together) is the separate, already-live "interactive
    // filtering" half of this ask — see the explicit `channel:"providers"` on
    // choroplethChart()/ensembleChart() above.
    var practiceFilterDa = practiceFilterDA("vf_practice"); das.push(practiceFilterDa);
    var yearFilterDa = yearFilterDA("vf_year"); das.push(yearFilterDa);
    var filters = [
      { id: "practice", da: practiceFilterDa.id, label: "Practice", valueCol: "practice", textCol: "practice", allLabel: "All practices", def: "%" },
      { id: "sinceYear", da: yearFilterDa.id, label: "Since year", valueCol: "year", textCol: "year", allLabel: "All years", def: "%" }
    ];

    // ── Headline KPIs: the common-estimate adoption rate for each practice ──
    PRACTICES.forEach(function (p) {
      var col = p.key + "_pct";
      var kda = kpiDA("vk_" + p.key, col); das.push(kda);
      kpis.push({ da: kda.id, valueCol: col, label: p.label, fmt: "pct", agg: "median",
        subtitle: "common estimate", state: "", info: "" });
    });

    // ── Maps at three scales — the hero row (right under the KPIs) ──
    var countyDa = geoDA("vv_county", "fips", "cover-crop adoption by county");
    var hucDa = geoDA("vv_huc8", "huc8", "adoption by watershed");
    var stateDa = geoDA("vv_state", "state", "state rollup");
    das.push(countyDa, hucDa, stateDa);
    panels.push({ id: "p_county", section: "Where adoption stands — a common estimate across 5 providers",
      title: "Cover-crop adoption by county", span: "full", chart: choroplethChart(countyDa.id, "fips", "county") });
    panels.push({ id: "p_huc8", title: "By watershed (HUC8)", span: 2, chart: choroplethChart(hucDa.id, "huc8", "huc8") });
    panels.push({ id: "p_state", title: "State rollup (acreage-weighted)", span: 2, chart: choroplethChart(stateDa.id, "state", "state") });

    // ── Ensemble trends — the provider consensus over time, per practice ──
    PRACTICES.forEach(function (p, i) {
      var da = timeSeriesDA("vv_" + p.key, p); das.push(da);
      var panel = { id: "p_" + p.key, title: p.label + " over time", span: 2, chart: ensembleChart(da.id) };
      if (i === 0) panel.section = "How it's trending — the provider ensemble vs the common estimate";
      panels.push(panel);
    });

    // ── By provider — the five providers side by side, filterable by practice ──
    var provDa = providerDA("vv_prov"); das.push(provDa);
    panels.push({ id: "p_prov", section: "Provider comparison", title: "Adoption by provider", span: "full",
      sub: "responds to the Practice filter above", info: "Defaults to every practice blended — pick one above to focus the comparison.",
      chart: { type: "bars", da: provDa.id, map: { labelCol: "provider", valueCol: "pct" }, opts: { fmt: "pct", height: 240 } } });

    return {
      id: "conservation-insight-demo", name: "conservation-insight-demo",
      title: "Cover Crop & Tillage Adoption",
      subtitle: "Illustrative Corn Belt sample — a common estimate across DTN, Indigo Ag, Iowa State, Regrow & Terra Diagnostics",
      dashboardTheme: "conservation",
      panels: panels, kpis: kpis, filters: filters,
      cda: { connections: [], dataAccesses: das }
    };
  }

  // CONS-2 (Kevin live, 2026-07-30): a DEDICATED watershed dashboard, named so it's
  // unmistakably a map ("there should be a watershed choropleth dashboard ... named
  // something so it's clear and you can see it early in the list"). Same authored-DA
  // helpers as the featured dashboard; the hero is a full-width HUC8 choropleth.
  function watershedDashboardSpec() {
    var das = [], panels = [], kpis = [];
    var kd = kpiDA("vw_k_cover", "covercrop_pct"); das.push(kd);
    kpis.push({ da: kd.id, valueCol: "covercrop_pct", label: "Cover-crop adoption", fmt: "pct", agg: "median",
      subtitle: "common estimate across watersheds", state: "", info: "" });
    var hucDa = geoDA("vw_huc8", "huc8", "adoption by watershed"); das.push(hucDa);
    panels.push({ id: "pw_map", section: "Where cover crops are taking hold, watershed by watershed",
      title: "HUC8 watershed map \u2014 cover-crop adoption", span: "full",
      chart: choroplethChart(hucDa.id, "huc8", "huc8") });
    var provDa = providerDA("vw_prov"); das.push(provDa);
    panels.push({ id: "pw_prov", title: "Provider comparison", span: "full",
      sub: "the five providers side by side",
      chart: { type: "bars", da: provDa.id, map: { labelCol: "provider", valueCol: "pct" }, opts: { fmt: "pct", height: 220 } } });
    return {
      id: "conservation-watershed-map", name: "conservation-watershed-map",
      title: "Watershed Map \u2014 HUC8 Cover Crop Adoption",
      subtitle: "Illustrative HUC8 subbasin view \u2014 where cover crops are taking hold across Corn Belt watersheds",
      dashboardTheme: "conservation",
      panels: panels, kpis: kpis, filters: [],
      cda: { connections: [], dataAccesses: das }
    };
  }

  // CONS-3 (Kevin live, 2026-07-30, reference image): the "Food System Metrics"-style
  // system-health WHEEL, translated to conservation — 12 scored metrics across 4
  // stakeholder-facing categories, grouped so each category tints a contiguous
  // sector. Curated literal rows (this is an INDEX, not fabricated sample noise):
  // the CSV is a real file dataset, and the dashboard's da carries a table-shaped
  // builder blob over it so #118's live re-run feeds the wheel the REAL rows.
  var METRICS_ROWS = [
    ["Cover crop adoption", "Soil Health", 68],
    ["No-till acres", "Soil Health", 74],
    ["Soil organic matter", "Soil Health", 61],
    ["Nitrate reduction", "Water Quality", 57],
    ["Buffer-strip coverage", "Water Quality", 64],
    ["Watershed monitoring", "Water Quality", 72],
    ["Cost-share uptake", "Economics", 66],
    ["Yield stability", "Economics", 79],
    ["Input savings", "Economics", 58],
    ["Provider agreement", "People & Outreach", 71],
    ["Farmer participation", "People & Outreach", 63],
    ["Program reach", "People & Outreach", 76]
  ];
  function metricsCsv() {
    return ["metric,category,score"].concat(METRICS_ROWS.map(function (r) { return r.join(","); })).join("\n");
  }
  function metricsWheelDashboardSpec(metricsDsId) {
    var da = {
      id: "vm_wheel", name: "Conservation system metrics (demo)", kind: "sql", sql: "", query: "",
      columns: ["metric", "category", "score"], params: [], authored: true,
      builder: { dsKind: "ws", dsId: metricsDsId, chartType: "table",
        shelfCols: [{ col: "metric", agg: null }, { col: "category", agg: null }, { col: "score", agg: null }],
        shelfRows: [], filters: [], calcs: [], shelfColor: [], paletteKey: "", mapScale: "" }
    };
    return {
      id: "conservation-system-metrics", name: "conservation-system-metrics",
      title: "Conservation System Metrics",
      subtitle: "The system-health wheel — one score per metric, grouped by what each stakeholder cares about",
      dashboardTheme: "conservation",
      panels: [{ id: "pm_wheel", section: "How the whole conservation system is doing, at a glance",
        title: "Conservation system metrics — scored 0–100", span: "full",
        chart: { type: "radarSectors", da: da.id,
          map: { labelCol: "metric", catCol: "category", valueCol: "score" },
          opts: { max: 100, showLegend: true, fmt: "abbr", height: 380 } } }],
      kpis: [], filters: [],
      cda: { connections: [], dataAccesses: [da] }
    };
  }

  Studio.installDemoPack = function (id) {
    if (!Studio.DEMO_PACKS[id] || Studio.demoPackInstalled(id)) return;
    // "examples"-kind packs (datamanagement) only gate gallery visibility — the workspace
    // seeding below is "workspace"-kind (conservation) only; every kind still records the
    // installed flag at the bottom.
    if (id === "conservation") installConservationWorkspace();
    setInstalledIds(installedIds().concat([id]));
  };

  function installConservationWorkspace() {
    var id = "conservation";
    var W = Studio.Workspace, now = new Date().toISOString();

    // --- connections: the demo file store + an illustrative repo backend ---
    var fileConn = W.put("connections", { name: "Conservation Insight — demo files", adapter: "file", cfg: {}, folder: PACK_FOLDER, demoPackId: id });
    // A meta/repo-plane connection shown in Connections as the "point at your
    // real backend" concept (no datasets hang off it, so nothing is queried).
    W.put("connections", {
      name: "Conservation repo — Supabase (demo)", adapter: "supabase",
      cfg: { url: "https://demo.supabase.co", anonKey: "demo-anon-key" },
      desc: "Illustrative repo backend — connect your own Supabase project to sync this workspace.",
      folder: PACK_FOLDER, demoPackId: id
    });

    // --- datasets: raw export + real county / watershed / state-rollup geo ---
    var rawDs = W.put("datasets", {
      name: "Conservation Insight — raw provider export (demo)", connectionId: fileConn.id,
      kind: "file", format: "csv", fileName: "conservation-insight-provider-export-demo.csv",
      content: conservationRawCsv(), folder: PACK_FOLDER, demoPackId: id, tags: ["demo", "conservation"]
    });
    var countyDs = W.put("datasets", {
      name: "County cover-crop adoption (demo)", connectionId: fileConn.id,
      kind: "file", format: "csv", fileName: "county-cover-crop-adoption-demo.csv",
      content: countyCsv(), columns: ["geoid", "statecode", "provider", "pct", "acres"],
      folder: PACK_FOLDER, demoPackId: id, tags: ["demo", "conservation", "geo"]
    });
    W.put("datasets", {
      name: "Watershed adoption — HUC8 (demo)", connectionId: fileConn.id,
      kind: "file", format: "csv", fileName: "watershed-adoption-huc8-demo.csv",
      content: huc8Csv(), columns: ["huc8", "provider", "pct"],
      folder: PACK_FOLDER, demoPackId: id, tags: ["demo", "conservation", "geo"]
    });
    // CONS-3: the system-metrics index — curated literal rows (see METRICS_ROWS)
    var metricsDs = W.put("datasets", {
      name: "Conservation system metrics (demo)", connectionId: fileConn.id,
      kind: "file", format: "csv", fileName: "conservation-system-metrics-demo.csv",
      content: metricsCsv(), columns: ["metric", "category", "score"],
      folder: PACK_FOLDER, demoPackId: id, tags: ["demo", "conservation"]
    });
    // The rollup job's OUTPUT dataset, pre-materialized so the state choropleth
    // works before anyone clicks Run; re-running the job rewrites it in place.
    var stateDs = W.put("datasets", {
      name: "State cover-crop adoption — rollup (job output)", connectionId: fileConn.id,
      kind: "file", format: "csv", fileName: "state_cover_crop_adoption_rollup.csv",
      content: stateRollupCsv(), columns: ["statecode", "pct", "acres"],
      folder: PACK_FOLDER, demoPackId: id, tags: ["demo", "conservation", "geo", "job-output"]
    });

    // --- job: county → state, acreage-weighted mean (the jobs-engine pattern) ---
    W.put("jobs", {
      name: "Roll counties up to states (demo)",
      sourceDatasetId: countyDs.id, outputDatasetId: stateDs.id,
      outputName: "State cover-crop adoption — rollup (job output)",
      steps: [{
        op: "aggregate", groupBy: ["statecode"],
        metrics: [
          { fn: "wmean", col: "pct", weightCol: "acres", as: "pct" },
          { fn: "sum", col: "acres", as: "acres" }
        ]
      }],
      folder: PACK_FOLDER, demoPackId: id
    });

    // --- analyses (pinned to Home, View Builder-native — CONS-4) + the featured dashboard ---
    PRACTICES.forEach(function (p) { W.put("analyses", builderViewRow(p, rawDs.id)); });
    // Kevin (2026-07-30): the dashboard's OWN name leads and the pack files into a
    // "Conservation Insight" folder — a grid of cards all prefixed "Conservation
    // Insight — …" read as identical rows.
    W.put("dashboards", {
      name: "conservation-insight-demo",
      title: "Cover Crop & Tillage Adoption (illustrative demo)",
      ts: now, spec: dashboardSpec(),
      folder: "Conservation Insight",
      featured: true, featuredAt: now, demoPackId: id
    });
    // CONS-2: the dedicated watershed map dashboard (seeded AFTER the featured one so
    // recency-sorted lists show it right up top, name leading with "Watershed Map").
    W.put("dashboards", {
      name: "conservation-watershed-map",
      title: "Watershed Map \u2014 HUC8 Cover Crop Adoption",
      ts: now, spec: watershedDashboardSpec(),
      folder: "Conservation Insight",
      demoPackId: id
    });
    // CONS-3: the system-metrics wheel dashboard (seeded last \u2014 newest tops the list).
    W.put("dashboards", {
      name: "conservation-system-metrics",
      title: "Conservation System Metrics",
      ts: now, spec: metricsWheelDashboardSpec(metricsDs.id),
      folder: "Conservation Insight",
      demoPackId: id
    });
  }

  Studio.removeDemoPack = function (id) {
    var W = Studio.Workspace;
    ["jobs", "connections", "datasets", "analyses", "dashboards"].forEach(function (t) {
      W.all(t).filter(function (r) { return r.demoPackId === id; }).forEach(function (r) { W.remove(t, r.id); });
    });
    setInstalledIds(installedIds().filter(function (x) { return x !== id; }));
  };

  // CONS-2 heal: workspaces installed before the watershed dashboard existed get it on
  // boot (called from studio.js's reconcilePackDashboards) — no reinstall needed.
  Studio.ensureConservationWatershedDashboard = function () {
    if (!Studio.demoPackInstalled("conservation")) return false;
    var W = Studio.Workspace;
    var have = W.all("dashboards").some(function (r) {
      return r.demoPackId === "conservation" &&
        (r.name === "conservation-watershed-map" || (r.spec && r.spec.name === "conservation-watershed-map"));
    });
    if (have) return false;
    W.put("dashboards", {
      name: "conservation-watershed-map",
      title: "Watershed Map \u2014 HUC8 Cover Crop Adoption",
      ts: new Date().toISOString(), spec: watershedDashboardSpec(),
      folder: "Conservation Insight", demoPackId: "conservation"
    });
    return true;
  };

  // CONS-3 heal: workspaces installed before the metrics wheel existed get the
  // dataset + dashboard on boot (called from studio.js's reconcilePackDashboards).
  Studio.ensureConservationMetricsWheel = function () {
    if (!Studio.demoPackInstalled("conservation")) return false;
    var W = Studio.Workspace;
    var have = W.all("dashboards").some(function (r) {
      return r.demoPackId === "conservation" &&
        (r.name === "conservation-system-metrics" || (r.spec && r.spec.name === "conservation-system-metrics"));
    });
    if (have) return false;
    var metricsDs = W.all("datasets").filter(function (d) {
      return d.demoPackId === "conservation" && /system metrics/i.test(d.name || "");
    })[0];
    if (!metricsDs) {
      var fileConn = W.all("connections").filter(function (c) {
        return c.demoPackId === "conservation" && c.adapter === "file";
      })[0];
      metricsDs = W.put("datasets", {
        name: "Conservation system metrics (demo)", connectionId: fileConn ? fileConn.id : null,
        kind: "file", format: "csv", fileName: "conservation-system-metrics-demo.csv",
        content: metricsCsv(), columns: ["metric", "category", "score"],
        folder: PACK_FOLDER, demoPackId: "conservation", tags: ["demo", "conservation"]
      });
    }
    W.put("dashboards", {
      name: "conservation-system-metrics",
      title: "Conservation System Metrics",
      ts: new Date().toISOString(), spec: metricsWheelDashboardSpec(metricsDs.id),
      folder: "Conservation Insight", demoPackId: "conservation"
    });
    return true;
  };

  // CONS-4 heal: workspaces installed before the builder-native Views existed get
  // their 4 per-practice rows re-authored on boot (called from studio.js's
  // reconcilePackDashboards) — same identity-preserving convention bdSave uses for
  // updates: id, pin state, privacy, ownership and createdAt all survive, so a
  // pinned Home widget stays pinned, it just opens in the View Builder now.
  Studio.ensureConservationBuilderViews = function () {
    if (!Studio.demoPackInstalled("conservation")) return false;
    var W = Studio.Workspace, changed = false;
    var rawDs = W.all("datasets").filter(function (d) {
      return d.demoPackId === "conservation" && /raw provider export/i.test(d.name || "");
    })[0];
    if (!rawDs) return false;
    PRACTICES.forEach(function (p) {
      var name = "Conservation Insight — " + p.label + " (illustrative demo)";
      var old = W.all("analyses").filter(function (a) {
        return a.demoPackId === "conservation" && a.name === name;
      })[0];
      if (!old || old.builder) return;
      var row = builderViewRow(p, rawDs.id);
      row.id = old.id;
      row.pinned = !!old.pinned;
      if (old.pinnedAt) row.pinnedAt = old.pinnedAt;
      if (old.private) row.private = old.private;
      if (old.owner) row.owner = old.owner;
      if (old.createdAt) row.createdAt = old.createdAt;
      W.put("analyses", row);
      changed = true;
    });
    return changed;
  };

  window.__studioDemoPacks = { // test hook
    packs: Studio.DEMO_PACKS, installed: Studio.demoPackInstalled,
    install: Studio.installDemoPack, remove: Studio.removeDemoPack
  };
}());
