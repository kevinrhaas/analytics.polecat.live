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
      // PACK-BLURB (Kevin, 2026-07-31): "keep it concise" — half the words, same
      // counts (the #116 suite check keeps it count-led + embedded-data honest).
      tagline: "6 dashboards · 4 Views · 8 datasets · rollup job — synthetic data, nothing to connect",
      blurb: "6 dashboards — county, watershed (HUC8), and CRD maps, the OpTIS trends and provider " +
        "ensemble references, and the Conservation System Metrics wheel — 4 practice Views pinned " +
        "to Home, 8 datasets, and a county→state rollup job. All data is synthetic and embedded — " +
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
    // FILTERS-1 (Kevin live, 2026-07-31): declare BOTH dashboard filters —
    // paramsFor only forwards params a DA declares, so without these the maps
    // (6 of the featured dashboard's 8 panels, with the KPIs) silently ignored
    // every filter flip and the dashboard read as "filters don't work". The
    // mock columns carry no practice/year, so sample data responds via
    // mockRespond's seeded variation — the documented SCORE-1 convention.
    return { id: id, name: "Conservation Insight — " + label + " (demo)", kind: "sql", columns: [idCol, "provider", "pct"], authored: true,
      params: [{ name: "practice", type: "String", default: "%" }, { name: "sinceYear", type: "String", default: "%" }] };
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
  function kpiDA(id, col) {
    return { id: id, name: id, kind: "sql", columns: [col], authored: true,
      params: [{ name: "practice", type: "String", default: "%" }, { name: "sinceYear", type: "String", default: "%" }] }; // FILTERS-1 — see geoDA
  }
  // LF7: takes an optional "practice" param (wired to the featured dashboard's
  // "Practice" filter below) so the provider-comparison bar responds to it.
  function providerDA(id) {
    return { id: id, name: "Conservation Insight — adoption by provider (demo)", kind: "sql", columns: ["provider", "pct"], authored: true,
      params: [{ name: "practice", type: "String", default: "%" }, { name: "sinceYear", type: "String", default: "%" }] }; // FILTERS-1: sinceYear joined — see geoDA
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

  // ── CONS-1 (Kevin live, 2026-07-31 — three CTIC/OpTIS reference screenshots):
  // three ADDITIVE dashboards that mirror the real CTIC visuals. Existing pack
  // dashboards are untouched; these reuse the pack's authored-DA + sample-engine
  // pattern for full-coverage maps, and the metrics-wheel pattern (curated CSV +
  // builder-blob DA -> REAL rows via #118's live re-run) for the trend/
  // distribution panels whose exact series and years the reference dictates.
  // The real-world provider line colors, for the ensemble reference dashboard.
  var PROVIDER_COLORS = {
    "DTN": "#7d3c98", "Indigo Ag": "#e67e22", "Iowa State": "#f1c40f",
    "Regrow": "#2e8bd0", "Terra Diagnostics": "#2f8f52"
  };
  // Cover-crop acres by TYPE, 2005-2021 (already pivoted: one column per type) —
  // the OpTIS stacked area. Deterministic gentle growth, cover crops outpacing
  // winter commodity, same honest-synthetic convention as every other seed.
  function coverTypeCsv() {
    var rows = ["year,wintercommodity_pct,covercrop_pct"];
    for (var y = 2005; y <= 2021; y++) {
      var i = y - 2005;
      var wc = Math.round((6 + i * 0.35 + ((i * 7) % 3) * 0.4) * 10) / 10;
      var cc = Math.round((2.5 + i * 0.62 + ((i * 5) % 4) * 0.3) * 10) / 10;
      rows.push([y, wc, cc].join(","));
    }
    return rows.join("\n");
  }
  // County %-change between the reference years — PRE-SORTED descending (the
  // OpTIS distribution bar reads sorted; divergingBar renders rows in order).
  // A deterministic mix of gains and losses across the pack's real county ids.
  function countyChangeRows() {
    var fips = geo().fips.slice(0, 24);
    var out = fips.map(function (id, i) {
      var change = Math.round((((i * 17) % 23) - 9) * 10) / 10; // -9..+13 spread
      return { geoid: id, change: change };
    });
    out.sort(function (a, b) { return b.change - a.change; });
    return out;
  }
  function countyChangeCsv() {
    return ["geoid,change"].concat(countyChangeRows().map(function (r) { return r.geoid + "," + r.change; })).join("\n");
  }
  // A table-shaped builder-blob DA over a curated pack dataset — the metrics-
  // wheel convention: #118's live re-run feeds the panel the dataset's REAL rows.
  function curatedDA(id, name, dsId, cols) {
    return { id: id, name: name, kind: "sql", sql: "", query: "",
      columns: cols.slice(), params: [], authored: true,
      builder: { dsKind: "ws", dsId: dsId, chartType: "table",
        shelfCols: cols.map(function (c) { return { col: c, agg: null }; }),
        shelfRows: [], filters: [], calcs: [], shelfColor: [], paletteKey: "", mapScale: "" } };
  }
  // (1) "OpTIS Cover Crop Trends" — the two side-by-side county maps (sequential
  // green + diverging orange->green change), the by-type stacked area, and the
  // sorted diverging %-change distribution.
  function optisDashboardSpec(coverTypeDsId, changeDsId) {
    var das = [], panels = [];
    var avgDa = geoDA("vo_county", "fips", "avg % winter cover crops by county"); das.push(avgDa);
    panels.push({ id: "po_avg", section: "Where winter cover crops stand — and how they've moved",
      title: "Avg % Winter Cover Crops", span: 2,
      chart: choroplethChart(avgDa.id, "fips", "county") });
    var chgDa = geoDA("vo_change", "fips", "% change between selected years"); das.push(chgDa);
    panels.push({ id: "po_change", title: "% Change Between Selected Years", span: 2,
      sub: "diverging — orange declined, green grew",
      chart: { type: "choropleth", da: chgDa.id,
        map: { idCol: "fips", valueCol: "pct", seriesCol: "provider" },
        opts: { scale: "county", fmt: "pct", agg: "median", channel: "providers",
          divergeToken: "--warn", center: 50 } } });
    var typeDa = curatedDA("vo_types", "Conservation Insight — cover crop type by year (demo)",
      coverTypeDsId, ["year", "wintercommodity_pct", "covercrop_pct"]); das.push(typeDa);
    panels.push({ id: "po_types", section: "Cover crop types over time",
      title: "Avg % Row Crop Acres by Cover Crop Type (2005\u20132021)", span: "full",
      chart: { type: "areaStacked", da: typeDa.id,
        map: { labelCol: "year", series: [
          { col: "wintercommodity_pct", name: "Winter Commodity", color: "#9ccb8f" },
          { col: "covercrop_pct", name: "Cover Crop", color: "#2f8f52" }
        ] },
        opts: { fmt: "pct", height: 280 } } });
    var distDa = curatedDA("vo_dist", "Conservation Insight — county % change distribution (demo)",
      changeDsId, ["geoid", "change"]); das.push(distDa);
    panels.push({ id: "po_dist", section: "Which counties moved most",
      title: "% Change by County \u2014 sorted", span: "full",
      sub: "each bar is one county \u2014 right of the line grew, left declined",
      chart: { type: "divergingBar", da: distDa.id,
        map: { labelCol: "geoid", valueCol: "change" },
        opts: { fmt: "pct", height: 320 } } });
    return {
      id: "conservation-optis-trends", name: "conservation-optis-trends",
      title: "OpTIS Cover Crop Trends",
      subtitle: "Styled after the real OpTIS visuals \u2014 illustrative synthetic data",
      dashboardTheme: "conservation",
      panels: panels, kpis: [], filters: [],
      cda: { connections: [], dataAccesses: das }
    };
  }
  // (2) "CRD Cover Crop Data" — the blue-banner dashboard: state + since-year
  // filters, the green area trend beside a REAL CRD-scale choropleth, and a
  // Map Legend card. The vendored us-crd-counties geometry makes the CRD scale
  // first-class, not an approximation.
  function crdDashboardSpec(crdTrendDsId) {
    var das = [], panels = [];
    var stateFilterDa = { id: "vc_fstate", name: "Conservation Insight — state filter options (demo)", kind: "sql", columns: ["statecode"], authored: true };
    das.push(stateFilterDa);
    var yearDa = yearFilterDA("vc_fyear"); das.push(yearDa);
    var filters = [
      { id: "state", da: stateFilterDa.id, label: "State", valueCol: "statecode", textCol: "statecode", allLabel: "All states", def: "%" },
      { id: "sinceYear", da: yearDa.id, label: "Since year", valueCol: "year", textCol: "year", allLabel: "All years", def: "%" }
    ];
    var trendDa = curatedDA("vc_trend", "Conservation Insight — CRD cover crop trend (demo)",
      crdTrendDsId, ["year", "pct"]); das.push(trendDa);
    panels.push({ id: "pc_trend", section: "Cover crops across the Crop Reporting Districts",
      title: "Percent of Row Crop Acres with Cover Crops (2015\u20132021)", span: 2,
      chart: { type: "areaStacked", da: trendDa.id,
        map: { labelCol: "year", series: [{ col: "pct", name: "Cover Crops", color: "#2f8f52" }] },
        opts: { fmt: "pct", height: 280 } } });
    var crdDa = { id: "vc_crd", name: "Conservation Insight — adoption by CRD (demo)", kind: "sql",
      columns: ["crd", "provider", "pct"], authored: true,
      params: [{ name: "state", type: "String", default: "%" }, { name: "sinceYear", type: "String", default: "%" }] };
    das.push(crdDa);
    panels.push({ id: "pc_map", title: "Adoption by Crop Reporting District", span: 2,
      chart: choroplethChart(crdDa.id, "crd", "crd") });
    panels.push({ id: "pc_legend", title: "Map Legend", span: "full",
      chart: { type: "richtext", da: null,
        opts: { html: "<p><b>Darker green = more row-crop acres with cover crops.</b> The map colors " +
          "each Crop Reporting District by the median of the selected providers\u2019 estimates \u2014 " +
          "toggle providers on any ensemble chart and every linked map re-colors. Illustrative synthetic data.</p>" } } });
    return {
      id: "conservation-crd-cover-crop", name: "conservation-crd-cover-crop",
      title: "CRD Cover Crop Data",
      subtitle: "Crop Reporting District view \u2014 illustrative synthetic data",
      dashboardTheme: "conservation",
      headerBg: "#1c5d99",
      panels: panels, kpis: [], filters: filters,
      cda: { connections: [], dataAccesses: das }
    };
  }
  // (3) "Provider Ensemble — Cover Crop Adoption" — the five provider lines in
  // their real-world colors, the bold Median, red AgCensus reference squares,
  // provider toggles, and a linked CRD map inset on the same channel.
  function ensembleReferenceDashboardSpec() {
    var das = [], panels = [];
    var ensDa = { id: "ve_ens", name: "Conservation Insight — provider ensemble (demo)", kind: "sql",
      columns: ["year", "provider", "pct"], authored: true,
      params: [{ name: "sinceYear", type: "String", default: "%" }] };
    das.push(ensDa);
    panels.push({ id: "pe_ens", section: "Five providers, one median \u2014 and how AgCensus compares",
      title: "Pct of All Row Crop Acres \u2014 provider ensemble", span: "full",
      sub: "toggle providers below \u2014 the maps re-color live",
      chart: { type: "ensembleSeries", da: ensDa.id,
        map: { labelCol: "year", seriesCol: "provider", valueCol: "pct" },
        opts: { refSeries: "AgCensus", fmt: "pct", medianLabel: "Median", height: 320,
          channel: "providers", seriesColors: PROVIDER_COLORS } } });
    var crdDa = { id: "ve_crd", name: "Conservation Insight — adoption by CRD (demo)", kind: "sql",
      columns: ["crd", "provider", "pct"], authored: true,
      params: [{ name: "sinceYear", type: "String", default: "%" }] };
    das.push(crdDa);
    panels.push({ id: "pe_map", title: "CRD map \u2014 median of the selected providers", span: 2,
      chart: choroplethChart(crdDa.id, "crd", "crd") });
    var provDa = providerDA("ve_prov"); das.push(provDa);
    panels.push({ id: "pe_prov", title: "Adoption by provider", span: 2,
      chart: { type: "bars", da: provDa.id, map: { labelCol: "provider", valueCol: "pct" }, opts: { fmt: "pct", height: 240 } } });
    return {
      id: "conservation-provider-ensemble", name: "conservation-provider-ensemble",
      title: "Provider Ensemble \u2014 Cover Crop Adoption",
      subtitle: "Five providers in their real colors, the median, and AgCensus reference points \u2014 illustrative synthetic data",
      dashboardTheme: "conservation",
      panels: panels, kpis: [], filters: [],
      cda: { connections: [], dataAccesses: das }
    };
  }
  // The CRD area-trend's curated rows (2015-2021, single green series).
  function crdTrendCsv() {
    var rows = ["year,pct"];
    for (var y = 2015; y <= 2021; y++) rows.push([y, Math.round((4.5 + (y - 2015) * 1.1) * 10) / 10].join(","));
    return rows.join("\n");
  }

  Studio.installDemoPack = function (id) {
    if (!Studio.DEMO_PACKS[id] || Studio.demoPackInstalled(id)) return;
    // "examples"-kind packs (datamanagement) only gate gallery visibility — the workspace
    // seeding below is "workspace"-kind (conservation) only; every kind still records the
    // installed flag at the bottom.
    if (id === "conservation") installConservationWorkspace();
    setInstalledIds(installedIds().concat([id]));
    if (id === "conservation") {
      Studio.ensureConservationWatershedDashboard(); // no-op when install already seeded it
      Studio.featureConservationGeo();
    }
  };

  // PACK-FEATURED (Kevin, 2026-07-31): "this should be automatically made
  // featured when you install the conservation insight sample pack … i think
  // watershed" — the pack's sexiest geo, the watershed (HUC8) choropleth,
  // becomes Home's FEATURED live tile the moment the pack lands. Only when the
  // user hasn't featured anything themselves — an explicit choice always wins.
  Studio.featureConservationGeo = function () {
    var W = Studio.Workspace;
    if (W.all("dashboards").some(function (r) { return r.featured; })) return false;
    var target = W.all("dashboards").filter(function (r) {
      return r.demoPackId === "conservation" &&
        (r.name === "conservation-watershed-map" || (r.spec && r.spec.name === "conservation-watershed-map") ||
         /watershed/i.test(r.title || ""));
    })[0] || W.all("dashboards").filter(function (r) {
      // fallback: the county/hero cover-crop geo dashboard
      return r.demoPackId === "conservation" && /cover ?crop|county/i.test(r.title || r.name || "");
    })[0];
    if (!target) return false;
    target.featured = true;
    target.featuredAt = new Date().toISOString();
    W.put("dashboards", target);
    return true;
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
    // CONS-1: the three CTIC/OpTIS reference dashboards + their curated datasets.
    seedConservationReferenceContent(W, fileConn, id, now);
  }

  // CONS-1 seeding, shared by install and the boot heal below. Idempotent by
  // name — only writes what's missing, so a partial earlier install self-repairs.
  function seedConservationReferenceContent(W, fileConn, id, now) {
    function haveDs(name) { return W.all("datasets").filter(function (d) { return d.demoPackId === id && d.name === name; })[0]; }
    function haveDash(name) {
      return W.all("dashboards").some(function (r) {
        return r.demoPackId === id && (r.name === name || (r.spec && r.spec.name === name));
      });
    }
    var typeDs = haveDs("Cover crop type by year (demo)") || W.put("datasets", {
      name: "Cover crop type by year (demo)", connectionId: fileConn ? fileConn.id : null,
      kind: "file", format: "csv", fileName: "cover-crop-type-by-year-demo.csv",
      content: coverTypeCsv(), columns: ["year", "wintercommodity_pct", "covercrop_pct"],
      folder: PACK_FOLDER, demoPackId: id, tags: ["demo", "conservation"]
    });
    var changeDs = haveDs("County cover-crop change (demo)") || W.put("datasets", {
      name: "County cover-crop change (demo)", connectionId: fileConn ? fileConn.id : null,
      kind: "file", format: "csv", fileName: "county-cover-crop-change-demo.csv",
      content: countyChangeCsv(), columns: ["geoid", "change"],
      folder: PACK_FOLDER, demoPackId: id, tags: ["demo", "conservation", "geo"]
    });
    var crdTrendDs = haveDs("CRD cover crop trend (demo)") || W.put("datasets", {
      name: "CRD cover crop trend (demo)", connectionId: fileConn ? fileConn.id : null,
      kind: "file", format: "csv", fileName: "crd-cover-crop-trend-demo.csv",
      content: crdTrendCsv(), columns: ["year", "pct"],
      folder: PACK_FOLDER, demoPackId: id, tags: ["demo", "conservation"]
    });
    if (!haveDash("conservation-optis-trends")) W.put("dashboards", {
      name: "conservation-optis-trends", title: "OpTIS Cover Crop Trends",
      ts: now, spec: optisDashboardSpec(typeDs.id, changeDs.id),
      folder: PACK_FOLDER, demoPackId: id
    });
    if (!haveDash("conservation-crd-cover-crop")) W.put("dashboards", {
      name: "conservation-crd-cover-crop", title: "CRD Cover Crop Data",
      ts: now, spec: crdDashboardSpec(crdTrendDs.id),
      folder: PACK_FOLDER, demoPackId: id
    });
    if (!haveDash("conservation-provider-ensemble")) W.put("dashboards", {
      name: "conservation-provider-ensemble", title: "Provider Ensemble \u2014 Cover Crop Adoption",
      ts: now, spec: ensembleReferenceDashboardSpec(),
      folder: PACK_FOLDER, demoPackId: id
    });
  }

  // CONS-1 heal: workspaces installed before the reference dashboards existed
  // get them (plus their curated datasets) on boot — same convention as the
  // watershed/metrics-wheel heals, called from studio.js reconcilePackDashboards.
  Studio.ensureConservationReferenceDashboards = function () {
    if (!Studio.demoPackInstalled("conservation")) return false;
    var W = Studio.Workspace;
    var before = W.all("dashboards").filter(function (r) { return r.demoPackId === "conservation"; }).length;
    var fileConn = W.all("connections").filter(function (c) {
      return c.demoPackId === "conservation" && c.adapter === "file";
    })[0];
    seedConservationReferenceContent(W, fileConn, "conservation", new Date().toISOString());
    var after = W.all("dashboards").filter(function (r) { return r.demoPackId === "conservation"; }).length;
    return after > before;
  };

  // AUD-07: removing a pack is the single biggest destructive click in the app — one
  // confirmation takes out every job, connection, dataset, View and dashboard the pack
  // owns, including any edits you made to them. So the remove now CAPTURES what it
  // deleted and hands back an undo snapshot: row clones per table, plus the fact that
  // the pack was installed. Callers that ignore the return value behave exactly as
  // before; studio.js's Remove-pack chip replays it from an Undo toast.
  Studio.removeDemoPack = function (id) {
    var W = Studio.Workspace;
    var batches = [];
    ["jobs", "connections", "datasets", "analyses", "dashboards"].forEach(function (t) {
      var rows = W.all(t).filter(function (r) { return r.demoPackId === id; });
      if (!rows.length) return;
      batches.push({ table: t, rows: rows.map(function (r) { return Studio.clone(r); }) });
      rows.forEach(function (r) { W.remove(t, r.id); });
    });
    setInstalledIds(installedIds().filter(function (x) { return x !== id; }));
    return { id: id, batches: batches };
  };

  // The undo half. Order matters: flip the installed flag back FIRST, because the
  // re-put rows fire Workspace change hooks that re-render Settings/Home/the library,
  // and those surfaces read demoPackInstalled to decide what to draw. Restoring the
  // rows goes through Studio.undoRestoreRows so an undone pack removal propagates to
  // the workspace backend as a re-creation (v799 tombstone semantics), same as every
  // other undo in the app.
  // Returns how many rows came back, so the caller can say something sensible when a
  // pack owned no rows at all (undoRestoreRows would otherwise announce "Restored 0").
  Studio.restoreDemoPack = function (snap) {
    if (!snap || !snap.id) return -1;
    if (installedIds().indexOf(snap.id) < 0) setInstalledIds(installedIds().concat([snap.id]));
    var batches = snap.batches || [], n = 0;
    batches.forEach(function (b) { n += (b.rows || []).length; });
    if (n) Studio.undoRestoreRows(batches);
    return n;
  };

  // FILTERS-1 heal (Kevin live, 2026-07-31): installs materialized before the
  // geo/KPI/provider DAs declared the practice/sinceYear params never forward a
  // filter flip to those panels (studio-render.js paramsFor only sends params a
  // DA declares) — the featured dashboard's maps and KPIs sat frozen while the
  // filters changed, reading as "filters don't work". Stamp the declarations
  // onto the installed spec in place (identity/pins preserved); called from
  // studio.js's reconcilePackDashboards on every boot, so it also catches specs
  // a sync pull brings in from a device on an older build.
  Studio.ensureConservationFilterParams = function () {
    var W = Studio.Workspace, FILTER_PARAMS = [
      { name: "practice", type: "String", default: "%" },
      { name: "sinceYear", type: "String", default: "%" }
    ];
    var changedAny = false;
    W.all("dashboards").forEach(function (r) {
      if (r.demoPackId !== "conservation" || !r.spec || !r.spec.cda) return;
      if ((r.spec.name || r.spec.id) !== "conservation-insight-demo") return;
      var changed = false;
      (r.spec.cda.dataAccesses || []).forEach(function (da) {
        if (!/^(vv_county|vv_huc8|vv_state|vv_prov$|vk_)/.test(da.id)) return;
        var have = (da.params || []).map(function (p) { return p.name; });
        FILTER_PARAMS.forEach(function (p) {
          if (have.indexOf(p.name) < 0) {
            da.params = (da.params || []).concat([{ name: p.name, type: p.type, default: p.default }]);
            changed = true;
          }
        });
      });
      if (changed) { W.put("dashboards", r, { silent: true }); changedAny = true; }
    });
    if (changedAny) W.notify("dashboards");
    return changedAny;
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
