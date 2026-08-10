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

  // SP-0: THE REGISTRY IS THE ONLY PLACE A PACK IS NAMED. Nothing outside this object
  // may branch on a pack id — `installDemoPack` dispatches through the entry's own
  // `install`/`afterInstall`, folders come from `folder`, and the surfaces that used to
  // say `id === "conservation"` / `"datamanagement"` now ask the registry for the packs
  // carrying a FLAG (`demoLogin`, `catalogSamples`; see Studio.demoPacksWith). Adding the
  // twelfth pack must be a new entry here and nothing else — the SP-0 conformance loop in
  // tests/run.js walks every registered entry, so a new pack is covered by construction.
  //
  // Entry contract:
  //   id            — must equal the key.
  //   kind          — "workspace" (seeds real rows) | "examples" (gates gallery content only).
  //   name/blurb    — the Settings → Sample packs card copy (app/studio.js renders the name,
  //                   the blurb and demoPackSourceLine() below on every card).
  //   tagline       — the one-line count summary the pack TOUR and the welcome carousel
  //                   render INSIDE a sentence ("…comes with the X sample pack — <tagline>."),
  //                   see app/tutorial.js + app/welcome.js. The builder's own pack card reads
  //                   it too, but that group is unwired (DECLUTTER-1), so those two are the
  //                   surfaces a reader actually meets it on.
  //   Both strings make countable claims about what one click seeds, so doc-truth check 35
  //   holds them to the installer the same way check 34 holds Help's Sample packs section.
  //   folder        — the ONE folder every row this pack seeds is filed in, across all types.
  //   seeds         — declared row counts per table, for the conformance loop to check the
  //                   installer against. Omit on packs that seed nothing synchronously.
  //   install()     — seed the workspace. Runs BEFORE the installed flag is set.
  //   afterInstall()— post-flag steps, for anything that reads demoPackInstalled().
  //   demoLogin     — install this pack for the demo account at sign-in.
  //   catalogSamples— this pack owns the raw demo-DB catalog tables (app/build.js).
  //   source        — WHERE THE DATA CAME FROM. Required on every entry; the contract
  //                   is docs/PACKS.md and the shape is checked by packSourceIssues()
  //                   below (plus tools/validate.mjs, which reads this file).
  Studio.DEMO_PACKS = {
    conservation: {
      id: "conservation",
      kind: "workspace",
      folder: "Conservation Insight",
      name: "Conservation Insight — cover crop & tillage adoption",
      // PACK-BLURB (Kevin, 2026-07-31): "keep it concise" — half the words, same
      // counts (the #116 suite check keeps it count-led + embedded-data honest).
      // N40 (Kevin, 2026-08-09): "those descriptions should be 2-3 sentences at most."
      // The blurb had become the tagline again plus a list of all six dashboard titles;
      // the titles live in Help's Sample packs section, which is where a reader who
      // wants the full inventory goes. What stays here is what a reader needs to decide
      // whether to click Install: the counts (doc-truth check 35 rule (a) requires every
      // seeded KIND be named), and the data-honesty line.
      tagline: "6 dashboards · 4 Views · 8 datasets over 2 connections · rollup job — synthetic data, embedded: no credentials to enter",
      blurb: "6 dashboards mapping cover-crop and tillage adoption from county to watershed " +
        "scale, plus 4 practice Views pinned to Home. They run on 8 datasets over 2 demo " +
        "connections and a county→state rollup job. All of it is synthetic and embedded, so " +
        "both connections arrive ready to read: no credentials to enter.",
      seeds: { connections: 2, datasets: 8, jobs: 1, analyses: 4, dashboards: 6 },
      source: { kind: "synthetic", label: "synthetic — generated in the app, not real observations" },
      demoLogin: true,
      install: function () { installConservationWorkspace(); },
      // These two read demoPackInstalled("conservation"), so they can only run once the
      // flag is set — hence the split into a post-flag hook rather than one install().
      afterInstall: function () {
        Studio.ensureConservationWatershedDashboard(); // no-op when install already seeded it
        Studio.featureConservationGeo();
      }
    },
    // SP-1: the first pack that carries REAL data — US Census, public domain, committed
    // as CSV under data/packs/marketcoverage/ by tools/pack-extract/marketcoverage.mjs
    // (docs/PACKS.md is the contract). Slice (a) shipped the data foundation: the
    // connection, the two datasets, and the join job that turns them into a saturation
    // index. Slice (b) added the three dashboards that read it, and slice (c1) the four
    // pinned Views beside them plus the pack's own guided tour. What remains is (c2):
    // the swap into DEFAULT_INSTALLED (and whether the hero dashboard is featured with
    // it) — its own slice because making a workspace pack the out-of-the-box default
    // changes what every fresh workspace contains, not just what this pack offers.
    marketcoverage: {
      id: "marketcoverage",
      kind: "workspace",
      folder: "Market Coverage",
      name: "Market Coverage — where a category is under-served",
      tagline: "3 dashboards · 4 Views pinned to Home · 2 Census datasets on 1 connection · 1,813 counties · a saturation-index join job — real public data, embedded",
      // N40: was one 100-word sentence that re-listed the tagline's counts and then
      // inventoried both datasets' columns. The columns are Help's job; the card's job is
      // what you get and where the data came from.
      blurb: "3 dashboards on where restaurants are under-supplied — the county whitespace maps, " +
        "the demographics behind them, and a shortlist of counties with the income but not the " +
        "restaurants — plus 4 Views pinned to Home. They read 2 US Census datasets covering " +
        "1,813 counties on 1 connection, joined by a prep job into a per-10,000-residents " +
        "saturation index. The data is real and embedded, and ships inside the app: no " +
        "credentials to enter.",
      source: {
        kind: "public",
        name: "US Census Bureau — County Business Patterns and American Community Survey",
        url: "https://www.census.gov/programs-surveys/cbp.html",
        licence: "Public domain (U.S. Government work)",
        retrieved: "2026-08-09"
      },
      // No `seeds`: install() writes the connection synchronously, and the datasets, the
      // job and the dashboards land from the CSV a moment later (Studio.ensurePackDataMaterialized) —
      // the same reason datamanagement declares none. The SP-0 conformance loop checks
      // declared counts against the installer, so declaring what install() cannot write
      // in its own turn would be a false claim, not a stricter test.
      install: function () { installMarketCoverageConnection(); },
      data: {
        files: ["county-demographics.csv", "county-establishments.csv"],
        seed: function (csv) { seedMarketCoverageData(csv); }
      },
      afterInstall: function () { Studio.ensurePackDataMaterialized("marketcoverage"); }
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
      folder: "Data Management",
      // HOME-EX2 folded the 4 formerly pack-less showcases (data quality, pipeline,
      // storage, cost) into this pack — keep the counts here at 12, not 8.
      name: "Data Management & Governance — showcase gallery",
      tagline: "12 generic showcase dashboards: governance, platform ops, delivery, finance, marketing, reliability, compliance, data quality, pipeline, storage, cost, feature tour",
      blurb: "12 showcase dashboards — governance, platform ops, delivery, finance, marketing, " +
        "incident response, compliance, data quality, pipeline observability, storage, cost, " +
        "and an interactive feature tour. Dashboards only: no connections, datasets or jobs, " +
        "and their sample data is embedded. Installed by default.",
      // Its dashboards are materialized asynchronously from data/examples by studio.js's
      // ensurePackExamplesMaterialized, so there is nothing for `seeds` to declare here.
      source: { kind: "synthetic", label: "synthetic — generated in the app, not real observations" },
      catalogSamples: true
    }
  };

  // Registry query — the ONLY way a caller outside this file selects packs. Returns the
  // ids of every registered pack whose entry carries the given flag, so a surface says
  // "the packs that own catalog samples" instead of naming one.
  Studio.demoPacksWith = function (flag) {
    return Object.keys(Studio.DEMO_PACKS).filter(function (id) { return !!Studio.DEMO_PACKS[id][flag]; });
  };
  // The folder every row a pack seeds is filed in ("" when the pack isn't registered).
  Studio.demoPackFolder = function (id) {
    var p = Studio.DEMO_PACKS[id];
    return (p && p.folder) || "";
  };

  // ---- SP-0 (b): DATA PROVENANCE. The contract is docs/PACKS.md. ------------------
  // Both packs shipped today generate their numbers in JS, and the copy says so
  // everywhere. The moment a pack carries REAL data (SP-1 is the first) that stops
  // being enough: the reader has to be told whose data it is and under what terms,
  // and a maintainer has to be able to REPRODUCE the extract. So every entry declares
  // a `source`, and the three kinds carry different obligations:
  //   synthetic — generated here, no outside source. Needs a plain-words `label`.
  //   public    — a real source in the public domain (a US government work, say).
  //   licensed  — a real source under someone else's terms. ALSO needs a
  //               THIRD-PARTY-NOTICES.md line (tools/validate.mjs enforces that).
  // A real source (public|licensed) ships its data as COMMITTED CSV under
  // data/packs/<id>/, written by the re-runnable tools/pack-extract/<id>.mjs whose
  // SOURCE.json is the provenance record — never fetched at runtime, so the app stays
  // offline-first and a pack can never break because a government site moved a URL.
  Studio.PACK_SOURCE_KINDS = ["synthetic", "public", "licensed"];

  Studio.demoPackSource = function (id) {
    var p = Studio.DEMO_PACKS[id];
    return (p && p.source) || null;
  };
  // The one human line the Settings card shows, and the line an attributed pack's
  // dashboards carry in their subtitle. "" when the entry declares no source — a
  // shape packSourceIssues() rejects, so it only ever happens mid-edit.
  Studio.demoPackSourceLine = function (id) {
    var s = Studio.demoPackSource(id);
    if (!s) return "";
    if (s.kind === "synthetic") return "Data: " + (s.label || "synthetic, generated in the app");
    return "Data: " + s.name + (s.licence ? " (" + s.licence + ")" : "") +
      (s.retrieved ? ", retrieved " + s.retrieved : "");
  };
  // Somebody else's data has to be credited where the work is READ, not only in
  // Settings — so a non-synthetic pack's dashboards carry the line in their subtitle
  // (app/studio.js reconcilePackDashboards backfills it, idempotently).
  Studio.packNeedsAttribution = function (id) {
    var s = Studio.demoPackSource(id);
    return !!s && s.kind !== "synthetic";
  };
  // The pure shape validator — no DOM, no workspace, so the suite can drive it with
  // fixtures and tools/validate.mjs enforces the same rules over the file itself.
  // Returns [] for a conforming entry, otherwise one plain sentence per problem.
  Studio.packSourceIssues = function (entry) {
    var out = [], s = entry && entry.source;
    if (!s) return ["declares no source — every pack states where its data came from (docs/PACKS.md)"];
    if (Studio.PACK_SOURCE_KINDS.indexOf(s.kind) < 0) {
      out.push("unknown source kind " + JSON.stringify(s.kind) + " — one of " + Studio.PACK_SOURCE_KINDS.join("/"));
      return out; // the rest of the rules are per-kind; nothing else is knowable
    }
    if (s.kind === "synthetic") {
      if (!s.label) out.push("a synthetic source needs a label saying so in plain words");
      if (s.url || s.licence) out.push("a synthetic source has no url or licence — drop them");
    } else {
      if (!s.name) out.push("a real source needs a name");
      if (!/^https:\/\//.test(s.url || "")) out.push("a real source needs an https url");
      if (!s.licence) out.push("a real source needs a licence");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s.retrieved || "")) out.push("a real source needs an ISO retrieval date (YYYY-MM-DD)");
    }
    return out;
  };

  var INSTALLED_KEY = "studio-demopacks-installed";
  // SAMPLE-DATA-1 (Kevin live, 2026-07-30): every object a pack seeds is FILED in the
  // pack's folder — one folder per pack across all types. SP-0: the name now lives on the
  // registry entry, so demopacks.js and studio.js read the one value instead of keeping
  // two literals in sync.
  var PACK_FOLDER = Studio.DEMO_PACKS.conservation.folder;
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
  // SP-1(b): `filters` is the builder's OWN filter grammar (build.js bdFilteredRows —
  // { col, kind:"range", min, max } for a number, { col, kind:"in", values } for a
  // string), so a panel that shows a SUBSET of a pack dataset narrows it through the
  // same code path the editor would, rather than shipping a second, hand-cut copy of
  // the rows. Omitted = every row, exactly as the three CONS-1 callers expect.
  function curatedDA(id, name, dsId, cols, filters) {
    return { id: id, name: name, kind: "sql", sql: "", query: "",
      columns: cols.slice(), params: [], authored: true,
      builder: { dsKind: "ws", dsId: dsId, chartType: "table",
        shelfCols: cols.map(function (c) { return { col: c, agg: null }; }),
        shelfRows: [], filters: (filters || []).slice(), calcs: [], shelfColor: [], paletteKey: "", mapScale: "" } };
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

  /* ---- SP-1 "Market Coverage" -------------------------------------------------------
     The pack's question: where is a category under-represented versus the people who
     live there and the businesses already trading there? The two halves come from two
     different Census programs (ACS demographics, CBP establishment counts), which is
     precisely why they ship as two datasets joined by a JOB rather than one pre-joined
     table — the join and the index derived from it ARE the data-prep story.

     The rows are read from committed CSV, so everything below the connection is written
     by seedMarketCoverageData once Studio.ensurePackDataMaterialized has the bytes. */
  var MC_FOLDER = "Market Coverage";
  var MC_DEMOGRAPHICS = "county-demographics.csv";
  var MC_ESTABLISHMENTS = "county-establishments.csv";

  function installMarketCoverageConnection() {
    Studio.Workspace.put("connections", {
      name: "US Census — embedded extracts", adapter: "file", cfg: {},
      desc: "County Business Patterns and the American Community Survey, extracted by " +
        "tools/pack-extract/marketcoverage.mjs and read from files in your browser.",
      folder: MC_FOLDER, demoPackId: "marketcoverage"
    });
  }
  // The pack's own connection, however install left it (the row is looked up rather than
  // threaded through, because install() and the seed run in different turns).
  function marketCoverageConnection() {
    return Studio.Workspace.all("connections").filter(function (r) { return r.demoPackId === "marketcoverage"; })[0] ||
      Studio.Workspace.put("connections", { name: "US Census — embedded extracts", adapter: "file", cfg: {}, folder: MC_FOLDER, demoPackId: "marketcoverage" });
  }

  // The job's four steps, as a fresh array each call — the same definition seeds the job
  // row AND pre-computes its output below, so the two can never describe different work.
  function marketCoverageSteps(demographicsDatasetId) {
    return [
      // 1. the join the pack exists to show: establishments ⋈ demographics, on county FIPS
      { op: "join", datasetId: demographicsDatasetId, leftCol: "fips", rightCol: "fips", type: "inner" },
      // 2-4. the saturation index. Population is divided down to ten-thousands FIRST so the
      // two rates that follow are plain divisions and every intermediate column is a
      // number a reader can name, rather than a scratch value with no meaning.
      { op: "derive", outCol: "residents_per_10k", a: { col: "population" }, operator: "/", b: { value: 10000 } },
      { op: "derive", outCol: "restaurants_per_10k", a: { col: "food_services" }, operator: "/", b: { col: "residents_per_10k" } },
      { op: "derive", outCol: "grocers_per_10k", a: { col: "grocery" }, operator: "/", b: { col: "residents_per_10k" } }
    ];
  }

  // The pack's CSVs are written by writePack()'s toCsv, which quotes only when a value
  // needs it — but "only when needed" is still sometimes, so this parses quotes properly
  // rather than assuming an extract will never produce one.
  //
  // It also has to coerce numeric-looking cells exactly the way the file adapter does
  // (app/sources/localfile.js typeCell), because these rows are used to PRE-COMPUTE what
  // running the job will later produce from those same files. Without the coercion the
  // two disagree on the one column where it shows: `fips` is "01001" as text and 1001 as
  // a number, so a Run would silently rewrite every Alabama county's key and the seeded
  // output would stop matching the job that owns it. (The choropleth is unbothered
  // either way — geoNormalizeId zero-pads a 4-digit county id back to five.)
  function typePackCell(s) {
    if (s === "") return "";
    return /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s) ? Number(s) : s;
  }
  function parsePackCsv(text) {
    var rows = [], row = [], cell = "", quoted = false, i = 0, s = String(text || "").replace(/\r\n?/g, "\n");
    function endCell() { row.push(cell); cell = ""; }
    function endRow() { endCell(); rows.push(row); row = []; }
    for (; i < s.length; i++) {
      var c = s[i];
      if (quoted) {
        if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") endCell();
      else if (c === "\n") endRow();
      else cell += c;
    }
    if (cell.length || row.length) endRow();
    var columns = rows.shift() || [];
    return {
      columns: columns,
      rows: rows.filter(function (r) { return r.length === columns.length; })
        .map(function (r) { return r.map(typePackCell); })
    };
  }

  function seedMarketCoverageData(csv) {
    var id = "marketcoverage", W = Studio.Workspace;
    var conn = marketCoverageConnection();
    var tags = ["demo", "census", "geo"];

    var demographicsDs = W.put("datasets", {
      name: "County demographics — ACS 5-year (2023)", connectionId: conn.id,
      kind: "file", format: "csv", fileName: MC_DEMOGRAPHICS,
      content: csv[MC_DEMOGRAPHICS],
      columns: ["fips", "county", "state", "population", "households", "median_age", "median_income", "bachelors_pct"],
      folder: MC_FOLDER, demoPackId: id, tags: tags
    });
    var establishmentsDs = W.put("datasets", {
      name: "County establishments — CBP (2023)", connectionId: conn.id,
      kind: "file", format: "csv", fileName: MC_ESTABLISHMENTS,
      content: csv[MC_ESTABLISHMENTS],
      columns: ["fips", "establishments", "food_services", "grocery"],
      folder: MC_FOLDER, demoPackId: id, tags: tags
    });

    var steps = marketCoverageSteps(demographicsDs.id);
    // Pre-materialized so the index is there to chart before anyone clicks Run — and
    // computed by running the job's OWN steps through the engine rather than a hand-kept
    // second copy of the arithmetic, so a Run rewrites this dataset with identical
    // numbers instead of quietly correcting it. Seeded as a pack-tagged, foldered row
    // (rather than left to the job runner's untagged auto-create) so Remove sweeps it.
    var left = parsePackCsv(csv[MC_ESTABLISHMENTS]);
    var right = parsePackCsv(csv[MC_DEMOGRAPHICS]);
    var ctx = { datasets: {} };
    ctx.datasets[demographicsDs.id] = right;
    var out = Studio.runJobSteps(left, steps, ctx);
    var outputName = "County market coverage — saturation index (job output)";
    var outputDs = W.put("datasets", {
      name: outputName, connectionId: conn.id,
      kind: "file", format: "csv", fileName: "county_market_coverage_saturation_index.csv",
      content: out.error ? "" : Studio.rowsToCsv(out.columns, out.rows),
      columns: (out.columns || []).slice(),
      folder: MC_FOLDER, demoPackId: id, tags: tags.concat(["job-output"])
    });

    W.put("jobs", {
      name: "Join demographics and derive the saturation index",
      sourceDatasetId: establishmentsDs.id,
      outputDatasetId: outputDs.id, outputName: outputName,
      steps: steps,
      folder: MC_FOLDER, demoPackId: id
    });

    // SP-1 (b): the dashboards read the job's output, so they are seeded here — the
    // moment that dataset exists — rather than in install(), which runs a turn earlier
    // with nothing to chart yet.
    seedMarketCoverageDashboards(W, id, outputDs, out, new Date().toISOString());
    // SP-1 (c): and the four pinned Views, for the same reason and at the same moment —
    // they are blobs over that dataset, so they cannot be authored a turn earlier either.
    seedMarketCoverageViews(W, id, outputDs, out);
  }

  /* ---- SP-1 (b): the pack's three dashboards ----------------------------------------
     The pack's question is a comparison — who lives in a county versus what already
     serves them — so the three dashboards are the three ways to ask it, in the order a
     reader meets them:

       1. WHITESPACE (the hero) — the county choropleth of restaurants per 10,000
          residents, its grocery twin, and the income-versus-supply quadrant that turns
          the two maps into one question.
       2. WHO LIVES THERE — the demand side on its own terms (income, age, education),
          which is the half Kevin asked to lean into, plus the scatter that asks whether
          income predicts restaurant supply at all.
       3. THE SHORTLIST — the counties that clear both bars: income at or above the
          national county median, restaurants at or below it. The answer, as a list you
          could hand to someone.

     Two conventions carried from CONS-1/CONS-3, for the same reasons:
     * Every panel is bound to a table-shaped builder-blob DA over the pack's own
       datasets (curatedDA), so #118's live re-run feeds the panels the REAL rows —
       nothing here is sample-engine noise.
     * A panel that shows a SUBSET narrows it with the builder's own filter grammar
       rather than a hand-cut second dataset, so what the reader sees is reproducible in
       the editor: open the View, and the filters that made it are right there. */
  // Seeding order, and it matters: the hero is LAST so it is the newest row and tops a
  // recency-sorted list (the CONS-2/CONS-3 convention).
  var MC_DASHBOARDS = ["marketcoverage-shortlist", "marketcoverage-demographics", "marketcoverage-whitespace"];
  // Two population floors, both about READABILITY rather than significance: a scatter of
  // all 1,813 counties is a cloud, and a bar chart of 380 is a wall. The 20,000-resident
  // floor that makes the rates meaningful at all is applied in the EXTRACT (see
  // SOURCE.json), not here.
  var MC_BIG_COUNTY = 250000;      // the quadrant/scatter/table population floor
  var MC_SHORTLIST_BAR = 500000;   // the shortlist bar chart's floor (≈20 bars)

  // The two thresholds the whitespace question is asked against: the national county
  // MEDIAN income and the national county MEDIAN restaurant rate. Derived from the
  // pack's own shipped rows at seed time (never a magic constant), so a re-extract that
  // moves the distribution re-seeds thresholds that still mean "the median county".
  function mcMedian(table, col) {
    var i = ((table && table.columns) || []).indexOf(col);
    if (i < 0) return 0;
    var v = ((table && table.rows) || []).map(function (r) { return Number(r[i]); })
      .filter(function (n) { return isFinite(n); })
      .sort(function (a, b) { return a - b; });
    if (!v.length) return 0;
    var mid = (v.length - 1) / 2;
    return v.length % 2 ? v[mid] : (v[Math.floor(mid)] + v[Math.ceil(mid)]) / 2;
  }
  function marketCoverageThresholds(table) {
    return {
      income: Math.round(mcMedian(table, "median_income")),
      // one decimal: the number is quoted in the copy and typed into a filter, and
      // "18.8 restaurants per 10,000 people" is the honest precision for a median.
      rate: Math.round(mcMedian(table, "restaurants_per_10k") * 10) / 10,
      counties: ((table && table.rows) || []).length
    };
  }
  function mcPopFilter(min) { return { col: "population", kind: "range", min: String(min), max: "" }; }
  // The shortlist rule, in one place because three panels and a paragraph of copy all
  // have to mean the same thing: income at or above the median, restaurants at or below.
  function mcShortlistFilters(t, popMin) {
    return [
      { col: "median_income", kind: "range", min: String(t.income), max: "" },
      { col: "restaurants_per_10k", kind: "range", min: "", max: String(t.rate) }
    ].concat(popMin ? [mcPopFilter(popMin)] : []);
  }
  function mcChoropleth(daId, valueCol, fmtId, height) {
    return { type: "choropleth", da: daId,
      map: { idCol: "fips", valueCol: valueCol },
      opts: { scale: "county", fmt: fmtId, agg: "median", classes: 6, height: height || 380 } };
  }
  function mcMoney(n) { return "$" + Math.round(n).toLocaleString(); }

  // (1) the hero: two maps and the question they add up to.
  function marketCoverageWhitespaceSpec(outDsId, t) {
    var das = [], panels = [], kpis = [];
    var allDa = curatedDA("vmw_all", "Market Coverage — county saturation index", outDsId,
      ["fips", "county", "state", "population", "median_income", "restaurants_per_10k", "grocers_per_10k"]);
    das.push(allDa);
    kpis.push({ da: allDa.id, valueCol: "restaurants_per_10k", label: "Restaurants & bars per 10k residents",
      fmt: "abbr", agg: "median", subtitle: "the median county", state: "",
      info: "County Business Patterns establishments in NAICS 722, divided by ACS population in ten-thousands." });
    kpis.push({ da: allDa.id, valueCol: "grocers_per_10k", label: "Grocers per 10k residents",
      fmt: "abbr", agg: "median", subtitle: "the median county", state: "",
      info: "NAICS 445 — food and beverage retailers — on the same per-10,000-residents basis." });
    kpis.push({ da: allDa.id, valueCol: "median_income", label: "Median household income",
      fmt: "money", agg: "median", subtitle: "the median county", state: "",
      info: "ACS 5-year table B19013. The whitespace question compares a county against this line." });
    kpis.push({ da: allDa.id, valueCol: "population", label: "Residents covered",
      fmt: "abbr", agg: "sum", subtitle: t.counties.toLocaleString() + " counties", state: "",
      info: "Every county of 20,000 people or more, outside the island areas — see the pack's source note." });

    panels.push({ id: "pmw_map", section: "Where the restaurants already are",
      title: "Restaurants & bars per 10,000 residents", span: "full",
      sub: "darker = more places to eat for the people who actually live there",
      info: "Counties under 20,000 residents are not in the extract: a per-10,000 rate over a village is noise.",
      chart: mcChoropleth(allDa.id, "restaurants_per_10k", "abbr", 460) });
    panels.push({ id: "pmw_groc", title: "Grocers per 10,000 residents", span: 2,
      sub: "the same map for food retail — the two rarely agree",
      chart: mcChoropleth(allDa.id, "grocers_per_10k", "abbr", 360) });

    var bigDa = curatedDA("vmw_big", "Market Coverage — counties of 250,000+ residents", outDsId,
      ["county", "median_income", "restaurants_per_10k"], [mcPopFilter(MC_BIG_COUNTY)]);
    das.push(bigDa);
    panels.push({ id: "pmw_quad", title: "Income versus restaurant supply", span: 2,
      sub: "counties of 250,000+ residents; the crosshairs are the national county medians",
      info: "Bottom right is the whitespace: households that can afford to eat out, without the restaurants to do it in.",
      chart: { type: "quadrant", da: bigDa.id,
        map: { labelCol: "county", xCol: "median_income", yCol: "restaurants_per_10k" },
        opts: { xThreshold: t.income, yThreshold: t.rate,
          xLabel: "Median household income", yLabel: "Restaurants & bars per 10k",
          q1: "Well served", q2: "Served on a lower income",
          q3: "Thin on both", q4: "Whitespace",
          fmt: "abbr", height: 360 } } });

    panels.push({ id: "pmw_note", section: "How to read it", title: "What this pack is measuring", span: "full",
      chart: { type: "richtext", da: null, opts: { content: [
        "**One rate, two halves.** Every number on this dashboard is a Census establishment count divided by a Census population — restaurants and bars (NAICS 722) or grocers (NAICS 445) per 10,000 residents. The two halves come from two different programmes, County Business Patterns and the American Community Survey, and the pack's own job is what joins them on county FIPS.",
        "",
        "**A low rate is a question, not a finding.** It can mean an under-served market, or a county whose residents eat in the next county over, or a place where one restaurant serves a wide rural area. The quadrant pairs the rate with income precisely because the rate alone does not carry the story.",
        "",
        "- Median county: **" + t.rate.toFixed(1) + "** restaurants and bars per 10,000 residents",
        "- Median county: **" + mcMoney(t.income) + "** household income",
        "- Counties in the extract: **" + t.counties.toLocaleString() + "** (every county of 20,000+ residents, island areas excluded — the map has no geometry for them)"
      ].join("\n") } } });

    return {
      id: "marketcoverage-whitespace", name: "marketcoverage-whitespace",
      title: "Restaurant Whitespace by County",
      subtitle: "Where the people are, versus where the restaurants are",
      dashboardTheme: "polecat",
      panels: panels, kpis: kpis, filters: [],
      cda: { connections: [], dataAccesses: das }
    };
  }

  // (2) the demand side on its own terms — Kevin, 2026-08-08: "I like demographics and
  // census type data, I think people find that interesting."
  function marketCoverageDemographicsSpec(outDsId, t) {
    var das = [], panels = [], kpis = [];
    var demoDa = curatedDA("vmd_all", "Market Coverage — county demographics", outDsId,
      ["fips", "county", "state", "population", "households", "median_age", "median_income", "bachelors_pct"]);
    das.push(demoDa);
    kpis.push({ da: demoDa.id, valueCol: "median_income", label: "Median household income",
      fmt: "money", agg: "median", subtitle: "the median county", state: "", info: "ACS 5-year, table B19013." });
    kpis.push({ da: demoDa.id, valueCol: "median_age", label: "Median age",
      fmt: "abbr", agg: "median", subtitle: "the median county", state: "", info: "ACS 5-year, table B01002." });
    kpis.push({ da: demoDa.id, valueCol: "bachelors_pct", label: "Bachelor's degree or higher",
      fmt: "pct", agg: "median", subtitle: "share of the 25-and-over population", state: "",
      info: "ACS 5-year, table B15003 — the 25-and-over population, not the whole county." });
    kpis.push({ da: demoDa.id, valueCol: "households", label: "Households covered",
      fmt: "abbr", agg: "sum", subtitle: t.counties.toLocaleString() + " counties", state: "", info: "ACS 5-year, table B11001." });

    panels.push({ id: "pmd_income", section: "Who lives there",
      title: "Median household income by county", span: "full",
      sub: "the denominator every coverage rate on this pack is really about",
      chart: mcChoropleth(demoDa.id, "median_income", "money", 460) });
    panels.push({ id: "pmd_age", title: "Median age", span: 2,
      chart: mcChoropleth(demoDa.id, "median_age", "abbr", 340) });
    panels.push({ id: "pmd_edu", title: "Bachelor's degree or higher", span: 2,
      sub: "share of the 25-and-over population",
      chart: mcChoropleth(demoDa.id, "bachelors_pct", "pct", 340) });

    var bigDa = curatedDA("vmd_big", "Market Coverage — income vs restaurant supply (250,000+ residents)", outDsId,
      ["county", "median_income", "restaurants_per_10k"], [mcPopFilter(MC_BIG_COUNTY)]);
    das.push(bigDa);
    panels.push({ id: "pmd_scatter", section: "Does income predict supply?",
      title: "Median household income vs restaurants per 10,000 residents", span: "full",
      sub: "one dot per county of 250,000+ residents, with the fitted trend",
      info: "If income alone predicted restaurant supply the dots would hug the line. They do not — which is what makes the shortlist worth reading.",
      chart: { type: "scatter", da: bigDa.id,
        map: { labelCol: "county", xCol: "median_income", yCol: "restaurants_per_10k" },
        opts: { trend: true, fmt: "abbr", xLabel: "Median household income",
          yLabel: "Restaurants & bars per 10k", height: 360 } } });

    return {
      id: "marketcoverage-demographics", name: "marketcoverage-demographics",
      title: "Who Lives There — County Demographics",
      subtitle: "Income, age and education across " + t.counties.toLocaleString() + " counties — the demand side of the whitespace question",
      dashboardTheme: "polecat",
      panels: panels, kpis: kpis, filters: [],
      cda: { connections: [], dataAccesses: das }
    };
  }

  // (3) the answer as a list: both bars cleared, biggest markets first.
  function marketCoverageShortlistSpec(outDsId, t) {
    var das = [], panels = [], kpis = [];
    var listDa = curatedDA("vms_list", "Market Coverage — the whitespace shortlist", outDsId,
      ["county", "state", "population", "median_income", "restaurants_per_10k", "grocers_per_10k"],
      mcShortlistFilters(t, MC_BIG_COUNTY));
    das.push(listDa);
    kpis.push({ da: listDa.id, valueCol: "median_income", label: "Median household income",
      fmt: "money", agg: "median", subtitle: "median of the shortlist", state: "",
      info: "Every county on this list is at or above " + mcMoney(t.income) + " — the national county median." });
    kpis.push({ da: listDa.id, valueCol: "restaurants_per_10k", label: "Restaurants & bars per 10k",
      fmt: "abbr", agg: "median", subtitle: "median of the shortlist", state: "",
      info: "Every county on this list is at or below " + t.rate.toFixed(1) + " — the national county median." });
    kpis.push({ da: listDa.id, valueCol: "population", label: "Typical county size",
      fmt: "abbr", agg: "median", subtitle: "median of the shortlist", state: "", info: "" });

    panels.push({ id: "pms_rule", section: "How this list was built",
      title: "Two rules, both visible in the View", span: "full",
      chart: { type: "richtext", da: null, opts: { content: [
        "A county is on the shortlist when it clears **both** bars:",
        "",
        "- household income at or above **" + mcMoney(t.income) + "** — the national county median, and",
        "- restaurants and bars at or below **" + t.rate.toFixed(1) + "** per 10,000 residents — likewise the median,",
        "- with at least **" + MC_BIG_COUNTY.toLocaleString() + "** residents, so the list is a market list rather than a long tail.",
        "",
        "Those are not a stored copy of the answer: they are three filters on this View, run over the pack's own job output every time the dashboard loads. Open it in the builder and you can move them.",
        "",
        "*What the list is not:* proof of an opportunity. A low rate can also mean people eat in the county next door, or that one restaurant covers a lot of ground. It is a place to start asking."
      ].join("\n") } } });

    panels.push({ id: "pms_table", title: "The shortlist", span: "full",
      sub: "income at or above the median, restaurants at or below it",
      chart: { type: "table", da: listDa.id,
        map: { cols: [
          { col: "county", label: "County" },
          { col: "state", label: "State" },
          { col: "population", label: "Residents", num: true, fmt: "abbr" },
          { col: "median_income", label: "Median income", num: true, fmt: "money" },
          { col: "restaurants_per_10k", label: "Restaurants / 10k", num: true, fmt: "abbr" },
          { col: "grocers_per_10k", label: "Grocers / 10k", num: true, fmt: "abbr" }
        ] },
        opts: { pageSize: 12, freezeHeader: true, density: "comfortable" } } });

    var bigDa = curatedDA("vms_big", "Market Coverage — the biggest shortlist markets", outDsId,
      ["county", "population"], mcShortlistFilters(t, MC_SHORTLIST_BAR));
    das.push(bigDa);
    panels.push({ id: "pms_bars", section: "The biggest of them",
      title: "Shortlist counties of 500,000+ residents, by population", span: "full",
      sub: "the same two rules, sorted by how many people are behind them",
      chart: { type: "bars", da: bigDa.id, map: { labelCol: "county", valueCol: "population" },
        opts: { horizontal: true, sortBars: true, fmt: "abbr", height: 420 } } });

    return {
      id: "marketcoverage-shortlist", name: "marketcoverage-shortlist",
      title: "The Whitespace Shortlist",
      subtitle: "Counties with the income but not the restaurants — the two rules are filters on the View, not a stored answer",
      dashboardTheme: "polecat",
      panels: panels, kpis: kpis, filters: [],
      cda: { connections: [], dataAccesses: das }
    };
  }

  // Idempotent by dashboard name (the CONS-1 convention), so it is safe from the seed,
  // from the boot heal, and from a workspace where someone deleted one of the three.
  function seedMarketCoverageDashboards(W, id, outputDs, table, now) {
    if (!outputDs) return 0;
    var t = marketCoverageThresholds(table);
    if (!t.counties) return 0; // no rows to threshold against — nothing honest to draw
    var specs = {
      "marketcoverage-shortlist": marketCoverageShortlistSpec(outputDs.id, t),
      "marketcoverage-demographics": marketCoverageDemographicsSpec(outputDs.id, t),
      "marketcoverage-whitespace": marketCoverageWhitespaceSpec(outputDs.id, t)
    };
    var added = 0;
    MC_DASHBOARDS.forEach(function (name) {
      var have = W.all("dashboards").some(function (r) {
        return r.demoPackId === id && (r.name === name || (r.spec && r.spec.name) === name);
      });
      if (have) return;
      var spec = specs[name];
      W.put("dashboards", {
        name: name, title: spec.title, ts: now, spec: spec,
        folder: MC_FOLDER, demoPackId: id
      });
      added++;
    });
    return added;
  }

  // The boot heal (studio.js reconcilePackDashboards): a workspace that installed the
  // pack when it was slice (a) — data but no dashboards — gets them without a reinstall,
  // and so does one where a dashboard was deleted. Returns false when there is nothing to
  // do, including the legitimate "data hasn't materialized yet" case: ensurePackData-
  // Materialized seeds the dashboards itself the moment the job output exists.
  Studio.ensureMarketCoverageDashboards = function () {
    var id = "marketcoverage";
    if (!Studio.demoPackInstalled(id)) return false;
    var W = Studio.Workspace;
    var outputDs = W.all("datasets").filter(function (d) {
      return d.demoPackId === id && (d.tags || []).indexOf("job-output") >= 0 && d.content;
    })[0];
    if (!outputDs) return false;
    return seedMarketCoverageDashboards(W, id, outputDs, parsePackCsv(outputDs.content), new Date().toISOString()) > 0;
  };

  /* ---- SP-1 (c): the pack's four pinned Views ----------------------------------------
     Kevin's SP-1 brief asks for ≈4 pinned Views beside the dashboards, and the reason
     they are not simply the dashboards' panels again is CONS-4's: a dashboard is a thing
     you READ, a View is a thing you OPEN and change. Each of the four below is a real
     View Builder blob over the pack's own job output, so a click on Home lands you in the
     shelves, the filters and the map scale that made it — the whitespace question stays
     arguable rather than merely presented.

     The four are the pack's argument, one card each, in the order Home shows them:
       1. SUPPLY  — restaurants and bars per 10,000 residents, by county
       2. DEMAND  — median household income, the same geography, the same scale
       3. BOTH    — income against supply, one dot per county of 250,000+ residents
       4. ANSWER  — the shortlist, as a table whose two rules are filters you can move

     Authored exactly the way bdSave does it — compute the basis with the pure
     Studio.Build.compute (the same engine #118's live re-run uses at render time), then
     Studio.newPanel over the resulting columns — so a seeded View and one saved by hand
     in the builder are the same shape and open in the same editor. Only the basis HEAD is
     read here: the rows a card draws come from Studio.Build.runBlob against the live
     dataset every time it renders, which is why the shortlist's filters are the View's
     own rather than a pre-cut second dataset. */
  function mcViewDefs(t) {
    return [
      {
        key: "supply", name: "Market Coverage — restaurants & bars per 10,000 residents",
        chartType: "choropleth", mapScale: "county",
        shelfCols: [{ col: "fips", agg: null }, { col: "restaurants_per_10k", agg: "avg" }],
        opts: { scale: "county", fmt: "abbr", agg: "median", classes: 6, height: 300 }
      },
      {
        key: "demand", name: "Market Coverage — median household income by county",
        chartType: "choropleth", mapScale: "county",
        shelfCols: [{ col: "fips", agg: null }, { col: "median_income", agg: "avg" }],
        opts: { scale: "county", fmt: "money", agg: "median", classes: 6, height: 300 }
      },
      {
        key: "income_vs_supply", name: "Market Coverage — income versus restaurant supply",
        chartType: "scatter",
        // The population floor is READABILITY, not significance — the same MC_BIG_COUNTY
        // the dashboards' quadrant and scatter use, for the same reason (1,813 dots is a
        // cloud). It rides the View's own filter shelf, so it is one drag from gone.
        shelfCols: [{ col: "county", agg: null }, { col: "median_income", agg: "avg" },
          { col: "restaurants_per_10k", agg: "avg" }],
        filters: [mcPopFilter(MC_BIG_COUNTY)],
        opts: { trend: true, fmt: "abbr", height: 300 }
      },
      {
        key: "shortlist", name: "Market Coverage — the whitespace shortlist",
        chartType: "table",
        shelfCols: ["county", "state", "population", "median_income", "restaurants_per_10k"]
          .map(function (c) { return { col: c, agg: null }; }),
        // The same two rules the shortlist dashboard states in prose, from the same
        // helper — three filters over the pack's own medians, not a stored answer.
        filters: mcShortlistFilters(t, MC_BIG_COUNTY),
        tableCols: [
          { col: "county", label: "County" },
          { col: "state", label: "State" },
          { col: "population", label: "Residents", num: true, fmt: "abbr" },
          { col: "median_income", label: "Median income", num: true, fmt: "money" },
          { col: "restaurants_per_10k", label: "Restaurants / 10k", num: true, fmt: "abbr" }
        ],
        opts: { pageSize: 10, freezeHeader: true, density: "comfortable" }
      }
    ];
  }
  function marketCoverageViewRow(def, outDsId, table) {
    var blob = {
      dsKind: "ws", dsId: outDsId, chartType: def.chartType,
      shelfCols: Studio.clone(def.shelfCols), shelfRows: [],
      filters: Studio.clone(def.filters || []), calcs: [],
      shelfColor: [], paletteKey: "", mapScale: def.mapScale || ""
    };
    // Computed over the UNFILTERED table on purpose: a filter changes which rows come
    // back, never which columns do, and only the head is wanted here (the rows are
    // runBlob's job). Doing it over the whole table also means the head is right even
    // for a filter that happens to match nothing in a re-extracted CSV.
    var basis = Studio.Build.compute(table.columns, table.rows, blob.shelfCols, blob.shelfRows);
    if (!basis || !basis.head.length) return null;
    var da = { id: "mcv_" + def.key, name: def.name, kind: "sql", sql: "", query: "",
      columns: basis.head.slice(), params: [], authored: true };
    da.builder = Studio.clone(blob);
    var p = Studio.newPanel(def.chartType, da);
    if (def.chartType === "choropleth") {
      // bdPanelFor's reason, verbatim: the measure column here is a synthesized "AVG x"
      // label and Studio.guessChoroplethCols can misjudge one, so the basis is mapped
      // back POSITIONALLY the same way chartBasis built it — [id, value], no guessing.
      p.chart.map = { idCol: basis.head[0], valueCol: basis.head[1] };
    }
    // newPanel's table default marks every column after the first numeric and titleizes
    // its label — right for an ad-hoc pivot, wrong for `state`. Declared columns win.
    if (def.tableCols) p.chart.map.cols = Studio.clone(def.tableCols);
    if (def.opts) Object.keys(def.opts).forEach(function (k) { p.chart.opts[k] = def.opts[k]; });
    return {
      name: def.name, folder: MC_FOLDER, demoPackId: "marketcoverage",
      pinned: true, panelTitle: "", chartType: def.chartType, paletteKey: "",
      da: da, builder: Studio.clone(blob), chart: p.chart
    };
  }
  // Idempotent by View name, the same convention seedMarketCoverageDashboards uses, so
  // this is safe from the seed, from the boot heal, and in a workspace where someone
  // deleted one of the four.
  function seedMarketCoverageViews(W, id, outputDs, table) {
    if (!outputDs) return 0;
    var t = marketCoverageThresholds(table);
    if (!t.counties) return 0; // no rows to threshold against — nothing honest to filter
    var have = {};
    W.all("analyses").forEach(function (r) { if (r.demoPackId === id) have[r.name] = true; });
    var added = 0;
    // Seeded in REVERSE of the reading order above: Home sorts pinned Views newest-first,
    // so the supply map has to be the last row written to lead the shelf (the CONS-2/
    // CONS-3 convention the dashboards are seeded by too).
    mcViewDefs(t).slice().reverse().forEach(function (def) {
      if (have[def.name]) return;
      var row = marketCoverageViewRow(def, outputDs.id, table);
      if (!row) return;
      W.put("analyses", row);
      added++;
    });
    return added;
  }
  // The boot heal, paired with ensureMarketCoverageDashboards above and for the same
  // reason: a workspace that installed the pack at slice (a) or (b) gets the Views
  // without a reinstall. False when there is nothing to do.
  Studio.ensureMarketCoverageViews = function () {
    var id = "marketcoverage";
    if (!Studio.demoPackInstalled(id)) return false;
    var W = Studio.Workspace;
    var outputDs = W.all("datasets").filter(function (d) {
      return d.demoPackId === id && (d.tags || []).indexOf("job-output") >= 0 && d.content;
    })[0];
    if (!outputDs) return false;
    return seedMarketCoverageViews(W, id, outputDs, parsePackCsv(outputDs.content)) > 0;
  };

  // SP-0: registry-driven. This function knows about no pack in particular — an entry
  // that seeds a workspace supplies `install`; one that only gates gallery visibility
  // ("examples" kind, e.g. datamanagement) supplies neither hook and just records the
  // flag. `afterInstall` runs after the flag is set, for steps that read it.
  Studio.installDemoPack = function (id) {
    var p = Studio.DEMO_PACKS[id];
    if (!p || Studio.demoPackInstalled(id)) return;
    if (p.install) p.install();
    setInstalledIds(installedIds().concat([id]));
    if (p.afterInstall) p.afterInstall();
  };

  // ---- SP-1: real-data packs materialize their CSV asynchronously ------------------
  // A synthetic pack computes its rows in `install()` and is finished before the
  // function returns. A pack whose data is COMMITTED CSV (docs/PACKS.md) cannot be:
  // the bytes live in `data/packs/<id>/` and have to be read. So the shape mirrors the
  // one `datamanagement` already uses for its example dashboards — `install()` seeds
  // what it can synchronously, and the rest lands a moment later through an idempotent
  // ensure-function that any surface may call again.
  //
  // Registry-driven, per SP-0: an entry opts in with `data: { files: [...], seed: fn }`
  // and this function knows nothing else about it. `seed` receives the file texts keyed
  // by name and writes the workspace rows.
  //
  // Three properties it has to hold, all learned from ensurePackExamplesMaterialized:
  //   * IDEMPOTENT — re-running never duplicates rows (it no-ops once the pack owns
  //     datasets), so boot, install and a manual retry are all safe.
  //   * RACE-SAFE — the installed flag is re-checked AFTER the fetch resolves. Without
  //     that, a pack installed and removed inside one turn (which the SP-0 conformance
  //     loop does to every registered pack) would have its rows land after the removal
  //     swept, leaving orphans tagged to an uninstalled pack.
  //   * QUIET ON FAILURE — a missing file leaves the pack installed but dataless rather
  //     than throwing into whatever clicked install; the next call heals it. The CSVs
  //     are in sw.js's precache list, so this survives offline after the first visit.
  Studio.ensurePackDataMaterialized = function (id) {
    var p = Studio.DEMO_PACKS[id];
    if (!p || !p.data || !p.data.seed) return Promise.resolve(false);
    if (!Studio.demoPackInstalled(id)) return Promise.resolve(false);
    if (Studio.Workspace.all("datasets").some(function (r) { return r.demoPackId === id; })) return Promise.resolve(false);
    var files = p.data.files || [];
    return Promise.all(files.map(function (name) {
      return fetch("data/packs/" + id + "/" + name).then(function (r) {
        if (!r.ok) throw new Error("data/packs/" + id + "/" + name + " — HTTP " + r.status);
        return r.text();
      });
    })).then(function (texts) {
      // Re-checked post-fetch: install state can have changed while we were reading.
      if (!Studio.demoPackInstalled(id)) return false;
      if (Studio.Workspace.all("datasets").some(function (r) { return r.demoPackId === id; })) return false;
      var byName = {};
      files.forEach(function (name, i) { byName[name] = texts[i]; });
      p.data.seed(byName);
      return true;
    }).catch(function () { return false; });
  };
  // The boot heal: every installed pack that ships data gets one chance per load to
  // finish materializing. Registry-driven — no module outside this file names a pack.
  Studio.ensureAllPackDataMaterialized = function () {
    return Promise.all(Object.keys(Studio.DEMO_PACKS).map(function (id) {
      return Studio.ensurePackDataMaterialized(id);
    }));
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
