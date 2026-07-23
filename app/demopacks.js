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
   jobs engine was built for), four ensemble analyses pinned to Home, and one
   featured multi-widget dashboard.

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
      name: "Conservation Insight — cover crop & tillage adoption",
      tagline: "2 connections · 4 datasets · a county→state rollup job · 4 analyses · a featured map dashboard",
      blurb: "Seeds a complete illustrative workspace: a demo file connection and a repo-backend " +
        "connection; a raw provider export, a county-level and a watershed (HUC8) adoption dataset " +
        "that render real choropleths, plus a rollup JOB that rolls counties up to states by " +
        "acreage-weighted mean; four ensemble time-series analyses (one per practice, pinned to " +
        "Home); and one featured multi-widget “Conservation Insight” dashboard. All data is " +
        "SYNTHETIC, clearly labeled illustrative, for demoing the ensemble/geo-analytics pattern."
    }
  };

  var INSTALLED_KEY = "studio-demopacks-installed";
  function installedIds() {
    var v; try { v = JSON.parse(localStorage.getItem(INSTALLED_KEY) || "[]"); } catch (e) { v = null; }
    return Array.isArray(v) ? v : [];
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
  function conservationRawCsv() {
    var rows = ["State_FIPS,Provider_Name,Practice,Adoption_Pct,Report_Year"];
    var states = { "19": "IA", "17": "IL", "18": "IN" };
    var years = [2019, 2022, 2024];
    var i = 0;
    Object.keys(states).forEach(function (fips) {
      PROVIDERS.forEach(function (prov) {
        PRACTICES.forEach(function (p) {
          years.forEach(function (yr) {
            var pct = 22 + ((i * 37) % 40); // deterministic 22–61 spread
            rows.push([fips, prov, p.label, pct, yr].join(","));
            i++;
          });
        });
      });
    });
    return rows.join("\n");
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

  function timeSeriesDA(id, practice) {
    return { id: id, name: "Conservation Insight — " + practice.label + " ensemble (demo)", kind: "sql", columns: ["year", "provider", "pct"], authored: true };
  }
  // A geo data access for a given region column (fips / huc8 / statecode) — the
  // sample engine crosses it against the provider domain, so the choropleth's
  // median-across-providers "common estimate" convention colors every region.
  function geoDA(id, idCol, label) {
    return { id: id, name: "Conservation Insight — " + label + " (demo)", kind: "sql", columns: [idCol, "provider", "pct"], authored: true };
  }
  function choroplethChart(daId, idCol, scale) {
    return { type: "choropleth", da: daId,
      map: { idCol: idCol, valueCol: "pct", seriesCol: "provider" },
      opts: { scale: scale, fmt: "pct", agg: "median" } };
  }
  function kpiDA(id, col) { return { id: id, name: id, kind: "sql", columns: [col], authored: true }; }
  function providerDA(id) { return { id: id, name: "Conservation Insight — adoption by provider (demo)", kind: "sql", columns: ["provider", "pct"], authored: true }; }
  function ensembleChart(daId) {
    return { type: "ensembleSeries", da: daId,
      map: { labelCol: "year", seriesCol: "provider", valueCol: "pct" },
      opts: { refSeries: "AgCensus", fmt: "pct", medianLabel: "Common estimate", height: 260 } };
  }

  function analysisRow(practice) {
    var da = timeSeriesDA("vrd_" + practice.key, practice);
    return {
      name: "Conservation Insight — " + practice.label + " (illustrative demo)",
      datasetId: null, sample: null,
      da: da, chart: ensembleChart(da.id), chartType: "ensembleSeries",
      pinned: true, demoPackId: "conservation"
    };
  }

  // The featured demo dashboard — a best-practice conservation story, top-down:
  //   KPIs (the headline adoption numbers) → CHOROPLETHS AT THREE SCALES (county
  //   hero, then watershed + state) so the maps lead and land in the thumbnail →
  //   the provider ENSEMBLE trends (consensus vs each provider) → a by-provider
  //   breakdown. Styled with the CTIC-derived Conservation theme.
  function dashboardSpec() {
    var das = [], panels = [], kpis = [];

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

    // ── By provider — the five providers side by side (cover crops) ──
    var provDa = providerDA("vv_prov"); das.push(provDa);
    panels.push({ id: "p_prov", section: "Provider comparison", title: "Cover-crop adoption by provider", span: "full",
      chart: { type: "bars", da: provDa.id, map: { labelCol: "provider", valueCol: "pct" }, opts: { fmt: "pct", height: 240 } } });

    return {
      id: "conservation-insight-demo", name: "conservation-insight-demo",
      title: "Conservation Insight — cover crop & tillage adoption",
      subtitle: "Illustrative Corn Belt sample — a common estimate across DTN, Indigo Ag, Iowa State, Regrow & Terra Diagnostics",
      dashboardTheme: "conservation",
      panels: panels, kpis: kpis, filters: [],
      cda: { connections: [], dataAccesses: das }
    };
  }

  Studio.installDemoPack = function (id) {
    if (id !== "conservation" || Studio.demoPackInstalled(id)) return;
    var W = Studio.Workspace, now = new Date().toISOString();

    // --- connections: the demo file store + an illustrative repo backend ---
    var fileConn = W.put("connections", { name: "Conservation Insight — demo files", adapter: "file", cfg: {}, demoPackId: id });
    // A meta/repo-plane connection shown in Connections as the "point at your
    // real backend" concept (no datasets hang off it, so nothing is queried).
    W.put("connections", {
      name: "Conservation repo — Supabase (demo)", adapter: "supabase",
      cfg: { url: "https://demo.supabase.co", anonKey: "demo-anon-key" },
      desc: "Illustrative repo backend — connect your own Supabase project to sync this workspace.",
      demoPackId: id
    });

    // --- datasets: raw export + real county / watershed / state-rollup geo ---
    W.put("datasets", {
      name: "Conservation Insight — raw provider export (demo)", connectionId: fileConn.id,
      kind: "file", format: "csv", fileName: "conservation-insight-provider-export-demo.csv",
      content: conservationRawCsv(), demoPackId: id, tags: ["demo", "conservation"]
    });
    var countyDs = W.put("datasets", {
      name: "County cover-crop adoption (demo)", connectionId: fileConn.id,
      kind: "file", format: "csv", fileName: "county-cover-crop-adoption-demo.csv",
      content: countyCsv(), columns: ["geoid", "statecode", "provider", "pct", "acres"],
      demoPackId: id, tags: ["demo", "conservation", "geo"]
    });
    W.put("datasets", {
      name: "Watershed adoption — HUC8 (demo)", connectionId: fileConn.id,
      kind: "file", format: "csv", fileName: "watershed-adoption-huc8-demo.csv",
      content: huc8Csv(), columns: ["huc8", "provider", "pct"],
      demoPackId: id, tags: ["demo", "conservation", "geo"]
    });
    // The rollup job's OUTPUT dataset, pre-materialized so the state choropleth
    // works before anyone clicks Run; re-running the job rewrites it in place.
    var stateDs = W.put("datasets", {
      name: "State cover-crop adoption — rollup (job output)", connectionId: fileConn.id,
      kind: "file", format: "csv", fileName: "state_cover_crop_adoption_rollup.csv",
      content: stateRollupCsv(), columns: ["statecode", "pct", "acres"],
      demoPackId: id, tags: ["demo", "conservation", "geo", "job-output"]
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
      demoPackId: id
    });

    // --- analyses (pinned to Home) + the featured dashboard ---
    PRACTICES.forEach(function (p) { W.put("analyses", analysisRow(p)); });
    W.put("dashboards", {
      name: "conservation-insight-demo",
      title: "Conservation Insight — cover crop & tillage adoption (illustrative demo)",
      ts: now, spec: dashboardSpec(),
      featured: true, featuredAt: now, demoPackId: id
    });
    setInstalledIds(installedIds().concat([id]));
  };

  Studio.removeDemoPack = function (id) {
    var W = Studio.Workspace;
    ["jobs", "connections", "datasets", "analyses", "dashboards"].forEach(function (t) {
      W.all(t).filter(function (r) { return r.demoPackId === id; }).forEach(function (r) { W.remove(t, r.id); });
    });
    setInstalledIds(installedIds().filter(function (x) { return x !== id; }));
  };

  window.__studioDemoPacks = { // test hook
    packs: Studio.DEMO_PACKS, installed: Studio.demoPackInstalled,
    install: Studio.installDemoPack, remove: Studio.removeDemoPack
  };
}());
