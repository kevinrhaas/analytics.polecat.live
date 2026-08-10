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
    // SP-6: the SECOND pack carrying real data, and the first carrying a FLOW — USASpending.gov,
    // public domain, committed as CSV under data/packs/contractawards/ by
    // tools/pack-extract/contractawards.mjs (docs/PACKS.md is the contract). Kevin promoted it
    // on 2026-08-09 ("some where the money is going"), and it is the program's only source of a
    // genuine origin→destination table, which is what sankey and marimekko want and what every
    // pack before it had to fake.
    // Slice (a) was the data foundation: the connection, the four datasets, and the job that
    // turns a vendor's raw obligations into a share of the agency that paid them. Slice (b)
    // added the three dashboards that read it (the flow hero, the agencies, the districts).
    // Slice (c) adds the pinned Views.
    contractawards: {
      id: "contractawards",
      kind: "workspace",
      folder: "Federal Contract Awards",
      name: "Federal Contract Awards — where the money goes",
      // The dashboard count arrived with slice (b); doc-truth check 35 (b) holds every
      // count claimed here to a number the pack really produces, and rule (a) requires
      // both strings to name every KIND the installer seeds — dashboards included, now
      // that it seeds them.
      tagline: "3 dashboards · 4 Views pinned to Home · 4 datasets on 1 connection · 25 agencies · $778B of FY2025 contracts · 600 agency→industry and agency→vendor flows · 436 congressional districts · a vendor-share job — real public data, embedded",
      blurb: "3 dashboards and 4 pinned Views over 4 datasets of real federal contract spending: " +
        "where the money flows from agency to industry and contractor, who the 25 largest agencies " +
        "are and how much of their spending reaches a small business, and the congressional " +
        "districts the work landed in. A prep job joins each vendor to its agency's total, so you " +
        "can read one contractor's haul as a share of the agency that paid it. The data is " +
        "USASpending.gov's, public domain and embedded on 1 connection: no credentials to enter.",
      source: {
        kind: "public",
        name: "USASpending.gov — federal contract awards, FY2025",
        url: "https://www.usaspending.gov/",
        licence: "Public domain (U.S. Government work)",
        retrieved: "2026-08-10"
      },
      // No `seeds`, for the reason SP-1 states above: install() writes the connection
      // synchronously and everything else lands from the CSV a moment later.
      install: function () { installContractAwardsConnection(); },
      data: {
        files: ["agency-totals.csv", "agency-industry.csv", "agency-vendor.csv", "district-awards.csv"],
        seed: function (csv) { seedContractAwardsData(csv); }
      },
      afterInstall: function () { Studio.ensurePackDataMaterialized("contractawards"); }
    },
    // SP-5: the THIRD pack carrying real data, and the one where the source is a public
    // record about private people — the FEC's bulk individual contributions for the CLOSED
    // 2023-2024 cycle, committed as CSV under data/packs/campaignfinance/ by
    // tools/pack-extract/campaignfinance.mjs (docs/PACKS.md is the contract). Kevin promoted
    // it on 2026-08-09 as the second of the three money-flow packs and settled its scope on
    // 2026-08-08 (STATUS.md § SP-5): donor NAMES were put to him in full and he took them.
    // This pack nevertheless carries none — not as a reversal, but because every table it
    // ships is an aggregate and an aggregate has no name column to put one in. The decision
    // is banked for a slice that needs it; nothing here does.
    // Slice (a) was the data foundation: the connection, the seven committed tables, and the
    // job that turns one state's giving into a share of the committee that received it.
    // Slice (b) added the three dashboards that read them (the flow hero, donor geography,
    // and who gives it). Slice (c) added the four pinned Views and the pack's own tour.
    campaignfinance: {
      id: "campaignfinance",
      kind: "workspace",
      folder: "Campaign Finance",
      name: "Campaign Finance — who funds federal politics",
      // Count-led and ending in "embedded" (the suite's #116 shape check), and it names
      // every KIND install seeds — connection, datasets, dashboards, job — because doc-truth
      // check 35 rule (a) holds this string and the blurb to the installer separately, and
      // rule (b) holds every count in either one to a number the pack really produces. The
      // dashboard count arrived with slice (b), in the same PR as the dashboards.
      tagline: "3 dashboards · 4 Views pinned to Home · 9 datasets on 1 connection · $6.5B of itemized individual giving in the 2023-24 cycle · 50 committees × 65 donor states · 200 occupations and 200 employers · 24 months · 2 prep jobs — real public data, embedded",
      // Three sentences, which is N40's cap — the card is a decision surface and the
      // inventory belongs in Help. Count-led and says "embedded" for the suite's #116.
      blurb: "3 dashboards and 4 pinned Views over 9 datasets on 1 connection, built from the Federal Election " +
        "Commission's own record of who gave money to whom in the 2023-24 election cycle — " +
        "$6.5 billion of itemized individual contributions, read by donor state, by recipient " +
        "committee, by occupation and employer, by month, and by the size of the cheque. Two prep jobs join each " +
        "donor state to the committee that received it and then keep the flows a live View can hold, so one state's giving reads as a share of " +
        "that committee, and as the share that came from outside the state the candidate is " +
        "running in. The data is the FEC's own, public domain and embedded — and it is itemized " +
        "giving only, so the small contributions in it are gifts from donors who passed the $200 " +
        "itemisation threshold rather than the small-dollar donor universe.",
      source: {
        kind: "public",
        name: "Federal Election Commission — individual contributions, 2023-2024 cycle",
        url: "https://www.fec.gov/data/browse-data/?tab=bulk-data",
        licence: "Public domain (U.S. Government work)",
        retrieved: "2026-08-10"
      },
      // No `seeds`, for the reason SP-1 and SP-6 state above: install() writes the connection
      // synchronously and everything else lands from the CSV a moment later.
      install: function () { installCampaignFinanceConnection(); },
      data: {
        files: ["state-donors.csv", "committees.csv", "committee-state.csv",
                "occupations.csv", "employers.csv", "monthly.csv", "size-bands.csv"],
        seed: function (csv) { seedCampaignFinanceData(csv); }
      },
      afterInstall: function () { Studio.ensurePackDataMaterialized("campaignfinance"); }
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
  // `calcs` (optional, SP-6(b)) are the builder's own calculated columns — a name and a
  // formula the View Builder would have written. A DA that needs a ratio the extract does
  // not ship gets it this way rather than through a rolled-up shelf, because a rollup
  // renames the column to "SUM obligations" and a chart bound to that name is reading a
  // label instead of a measure. A calc keeps the reader's name for the number, and it is
  // still a real calc row: open the View and the formula is right there to edit.
  function curatedDA(id, name, dsId, cols, filters, calcs) {
    return { id: id, name: name, kind: "sql", sql: "", query: "",
      columns: cols.slice(), params: [], authored: true,
      builder: { dsKind: "ws", dsId: dsId, chartType: "table",
        shelfCols: cols.map(function (c) { return { col: c, agg: null }; }),
        shelfRows: [], filters: (filters || []).slice(), calcs: (calcs || []).slice(),
        shelfColor: [], paletteKey: "", mapScale: "" } };
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

  /* ---- SP-6 "Federal Contract Awards" -----------------------------------------------
     The pack's question: where does federal contract money actually go? Four tables from
     one source (USASpending.gov, FY2025 contracts) answer it from four directions — the
     agencies that spend it, the industries they buy, the vendors they pay, and the
     congressional districts the work is performed in.

     Why FOUR datasets and a job rather than one wide table, which is the same reasoning
     SP-1 used and the reason both packs are worth installing: the two flow tables carry
     only the agency CODE, so the readable agency name and the agency's own total are a
     JOIN away — and that join is what turns "Lockheed took $14B from DOD" into "Lockheed
     took 3% of everything DOD bought", which is the sentence the data is actually for.

     Everything below the connection is written by seedContractAwardsData once
     Studio.ensurePackDataMaterialized has the bytes. */
  var FCA_FOLDER = "Federal Contract Awards";
  var FCA_TOTALS = "agency-totals.csv";
  var FCA_INDUSTRY = "agency-industry.csv";
  var FCA_VENDOR = "agency-vendor.csv";
  var FCA_DISTRICTS = "district-awards.csv";

  function installContractAwardsConnection() {
    Studio.Workspace.put("connections", {
      name: "USASpending.gov — embedded extracts", adapter: "file", cfg: {},
      desc: "Federal contract awards for FY2025, extracted by " +
        "tools/pack-extract/contractawards.mjs and read from files in your browser.",
      folder: FCA_FOLDER, demoPackId: "contractawards"
    });
  }
  // The pack's own connection, however install left it — looked up rather than threaded
  // through, because install() and the seed run in different turns (the SP-1 convention).
  function contractAwardsConnection() {
    return Studio.Workspace.all("connections").filter(function (r) { return r.demoPackId === "contractawards"; })[0] ||
      Studio.Workspace.put("connections", { name: "USASpending.gov — embedded extracts", adapter: "file", cfg: {}, folder: FCA_FOLDER, demoPackId: "contractawards" });
  }

  // The job's four steps, as a fresh array each call — the same definition seeds the job
  // row AND pre-computes its output below, so the two can never describe different work.
  function contractAwardsSteps(totalsDatasetId) {
    return [
      // 1. the join the pack exists to show: every vendor row gains its agency's NAME and
      //    its agency's TOTAL. No column collides, because the extract deliberately left
      //    the name out of the vendor table — see tools/pack-extract/contractawards.mjs.
      { op: "join", datasetId: totalsDatasetId, leftCol: "agency_code", rightCol: "agency_code", type: "inner" },
      // 2-4. the shares. The agency total is divided down to ONE PERCENT first, so the two
      // ratios that follow are plain divisions and every intermediate column is a number a
      // reader can name — the same shape SP-1's saturation index uses, for the same reason.
      { op: "derive", outCol: "one_pct_of_agency", a: { col: "total_obligations" }, operator: "/", b: { value: 100 } },
      { op: "derive", outCol: "pct_of_agency", a: { col: "obligations" }, operator: "/", b: { col: "one_pct_of_agency" } },
      { op: "derive", outCol: "agency_small_business_pct", a: { col: "small_business_obligations" }, operator: "/", b: { col: "one_pct_of_agency" } }
    ];
  }

  function seedContractAwardsData(csv) {
    var id = "contractawards", W = Studio.Workspace;
    var conn = contractAwardsConnection();
    var tags = ["demo", "federal", "spending"];

    var totalsDs = W.put("datasets", {
      name: "Agency contract totals — FY2025", connectionId: conn.id,
      kind: "file", format: "csv", fileName: FCA_TOTALS,
      content: csv[FCA_TOTALS],
      columns: ["agency_code", "agency", "total_obligations", "small_business_obligations"],
      folder: FCA_FOLDER, demoPackId: id, tags: tags
    });
    var industryDs = W.put("datasets", {
      name: "Agency spend by industry — FY2025 (NAICS)", connectionId: conn.id,
      kind: "file", format: "csv", fileName: FCA_INDUSTRY,
      content: csv[FCA_INDUSTRY],
      columns: ["agency_code", "naics", "industry", "obligations"],
      folder: FCA_FOLDER, demoPackId: id, tags: tags.concat(["flow"])
    });
    var vendorDs = W.put("datasets", {
      name: "Agency spend by vendor — FY2025", connectionId: conn.id,
      kind: "file", format: "csv", fileName: FCA_VENDOR,
      content: csv[FCA_VENDOR],
      columns: ["agency_code", "vendor", "vendor_uei", "obligations"],
      folder: FCA_FOLDER, demoPackId: id, tags: tags.concat(["flow"])
    });
    var districtsDs = W.put("datasets", {
      name: "Contract spend by congressional district — FY2025", connectionId: conn.id,
      kind: "file", format: "csv", fileName: FCA_DISTRICTS,
      content: csv[FCA_DISTRICTS],
      columns: ["district_id", "district", "state", "obligations", "population"],
      folder: FCA_FOLDER, demoPackId: id, tags: tags.concat(["geo"])
    });

    var steps = contractAwardsSteps(totalsDs.id);
    // Pre-materialized so the shares are there to chart before anyone clicks Run — and
    // computed by running the job's OWN steps through the engine rather than a hand-kept
    // second copy of the arithmetic, so a Run rewrites this dataset with identical numbers
    // instead of quietly correcting it (docs/PACKS.md). Seeded as a pack-tagged, foldered
    // row so Remove sweeps it.
    var left = parsePackCsv(csv[FCA_VENDOR]);
    var ctx = { datasets: {} };
    ctx.datasets[totalsDs.id] = parsePackCsv(csv[FCA_TOTALS]);
    var out = Studio.runJobSteps(left, steps, ctx);
    var outputName = "Federal vendors — share of their agency's spend (job output)";
    var outputDs = W.put("datasets", {
      name: outputName, connectionId: conn.id,
      kind: "file", format: "csv", fileName: "federal_vendor_share_of_agency.csv",
      content: out.error ? "" : Studio.rowsToCsv(out.columns, out.rows),
      columns: (out.columns || []).slice(),
      folder: FCA_FOLDER, demoPackId: id, tags: tags.concat(["job-output"])
    });

    W.put("jobs", {
      name: "Join agency totals and derive each vendor's share",
      sourceDatasetId: vendorDs.id,
      outputDatasetId: outputDs.id, outputName: outputName,
      steps: steps,
      folder: FCA_FOLDER, demoPackId: id
    });

    // SP-6 (b): the dashboards read the job's output and the extract tables together, so
    // they are seeded here — the moment those rows exist — rather than in install(),
    // which runs a turn earlier with nothing to chart yet (the SP-1 convention).
    var seededDs = { totals: totalsDs, industry: industryDs, districts: districtsDs, output: outputDs };
    seedContractAwardsDashboards(W, id, seededDs, new Date().toISOString());
    // SP-6 (c): and the pinned Views, from the same turn and for the same reason — the
    // rows they are computed over exist only now. Last, so the Views are the newest rows
    // in the workspace and lead Home's pinned shelf.
    seedContractAwardsViews(W, id, seededDs);
  }

  /* ---- SP-6 (b): the pack's three dashboards ----------------------------------------
     The pack's question is "where does federal contract money go?", and it has three
     honest answers depending on what you mean by "where":

       1. WHERE THE MONEY GOES (the hero) — the FLOW itself, which is the reason this
          pack exists. Two sankeys: agency → vendor (over the job's output, so the
          agency reads as a NAME and each flow carries its share of the agency) and
          agency → industry. Below them, the contractors that took a tenth or more of
          the agency that paid them.
       2. WHO SPENDS IT — the 25 agencies by size, and the one policy question already
          in the data: how much of each agency's spending reached a small business.
       3. WHERE THE WORK LANDS — the congressional-district map. This is the app's `cd`
          scale getting real data for the first time; every one of the 436 ids is
          asserted drawable against vendor/geo/us-cd-albers.json by the suite.

     Two conventions carried from SP-1, for the same reasons:
     * every charted panel is bound to a builder-blob DA over one of the pack's OWN
       datasets (curatedDA), so #118's live re-run feeds the panels the REAL rows;
     * a panel that shows a SUBSET narrows it with the builder's own filter grammar
       rather than a hand-cut second dataset — open the View and the rule is right there.

     THE ITEM SAID THIS PACK HAD NO SANKEY TO DRAW WITH. Measured, that is wrong:
     `Studio.CHARTS.sankey` has existed all along (app/model.js, group "Flow",
     sourceCol/targetCol/valueCol) and is in Studio.WIDE_CHART_TYPES. So the hero is the
     real flow diagram the data was extracted for, and no new chart type rides in on a
     pack slice — which is exactly what the item asked to avoid, by the other route. */
  // Seeding order, and it matters: the hero is LAST so it is the newest row and tops a
  // recency-sorted list (the CONS-2/CONS-3 convention SP-1 also follows).
  var FCA_DASHBOARDS = ["contractawards-districts", "contractawards-agencies", "contractawards-flow"];
  // Three floors, all about READABILITY rather than significance — the same kind of
  // constant (and the same disclosure) as SP-1's MC_BIG_COUNTY/MC_SHORTLIST_BAR. A
  // sankey of all 300 agency→vendor pairs is a hairball, and every panel that applies
  // one says so in its own subtitle, in the units the reader is looking at.
  //
  // The flow floor was MEASURED rather than picked: a sankey lays its nodes out with an
  // 11px gap between them, so the readable limit is the node COUNT, not the flow count.
  // At $1B the vendor side has 36 destinations and their labels collide; at $2B it has
  // 25 and the industry side has 20, which each panel's height then gives ~26px apiece.
  var FCA_FLOW_FLOOR = 2e9;        // both sankeys: 27 of 300 vendor flows, 32 of 300 industry flows
  var FCA_DOMINANT_PCT = 10;       // "took a tenth or more of the agency that paid it" (20 rows)
  var FCA_DISTRICT_BAR = 5e9;      // districts big enough to read as bars (32 of 436)

  // The pack's own headline figures, derived from the shipped rows at seed time rather
  // than typed in — the SP-1 rule. A re-extract that moves the numbers re-seeds copy that
  // is still true, and the suite recomputes these independently and demands they agree.
  function contractAwardsFigures(totals) {
    var cols = (totals && totals.columns) || [], rows = (totals && totals.rows) || [];
    var iTot = cols.indexOf("total_obligations"), iSb = cols.indexOf("small_business_obligations");
    var total = 0, sb = 0;
    rows.forEach(function (r) { total += Number(r[iTot]) || 0; sb += Number(r[iSb]) || 0; });
    return {
      agencies: rows.length,
      total: total,
      smallBusiness: sb,
      // one decimal, because it is quoted in the copy: "22.5% of the year" is the honest
      // precision for a share of three-quarters of a trillion dollars.
      smallBusinessPct: total ? Math.round((sb / total) * 1000) / 10 : 0
    };
  }
  // The district table's own figures, on the same rule: measured from the shipped rows,
  // never typed in. `topTenPct` and `negative` are the two facts the dashboard's copy
  // makes claims about, so they are counted here rather than remembered from an extract.
  function contractAwardsDistrictFigures(districts) {
    var cols = (districts && districts.columns) || [], rows = (districts && districts.rows) || [];
    var iOb = cols.indexOf("obligations");
    var vals = rows.map(function (r) { return Number(r[iOb]) || 0; }).sort(function (a, b) { return b - a; });
    var total = vals.reduce(function (a, v) { return a + v; }, 0);
    var topTen = vals.slice(0, 10).reduce(function (a, v) { return a + v; }, 0);
    return {
      districts: rows.length,
      negative: vals.filter(function (v) { return v < 0; }).length,
      topTenPct: total ? (topTen / total) * 100 : 0
    };
  }
  // "$778.1B" — the pack quotes big dollars a lot, and a reader should never have to
  // count digits to compare two of them.
  function fcaBillions(n) { return "$" + (Math.round(n / 1e8) / 10).toLocaleString() + "B"; }
  // The small-business share as a percentage OF THE AGENCY, as a builder calc column —
  // the extract ships the two dollar figures and deliberately not their ratio, because a
  // ratio is a derivation and this pack's whole argument is that derivations are visible.
  var FCA_SB_PCT_CALC = { name: "small_business_pct", formula: "[small_business_obligations] / [total_obligations] * 100" };
  var FCA_PER_RESIDENT_CALC = { name: "dollars_per_resident", formula: "[obligations] / [population]" };

  // (1) the hero: the flow, which is what the pack was extracted to draw.
  function contractAwardsFlowSpec(ds, f) {
    var das = [], panels = [], kpis = [];

    var totalsDa = curatedDA("vfa_totals", "Federal Contract Awards — agency totals",
      ds.totals.id, ["agency_code", "agency", "total_obligations", "small_business_obligations"]);
    das.push(totalsDa);
    kpis.push({ da: totalsDa.id, valueCol: "total_obligations", label: "Contract dollars obligated",
      fmt: "money", agg: "sum", subtitle: "FY2025, " + f.agencies + " agencies", state: "",
      info: "The 25 largest awarding agencies, which is 99.97% of the year's contract obligations. Grants, loans and direct payments are not contracts and are not in here." });
    kpis.push({ da: totalsDa.id, valueCol: "small_business_obligations", label: "Of it, to small business",
      fmt: "money", agg: "sum", subtitle: f.smallBusinessPct.toFixed(1) + "% of the year", state: "",
      info: "Counted by re-running the same agency query under USASpending's small-business recipient filter — not by adding up the small firms in the top-12 vendor list, which would under-count every agency." });

    // The flow DAs run over the JOB'S OUTPUT, not the raw vendor table: that is where the
    // agency has a readable NAME and where each flow carries its share of the agency.
    var flowAllDa = curatedDA("vfa_flow_all", "Federal Contract Awards — every kept agency-vendor flow",
      ds.output.id, ["agency", "vendor", "obligations", "pct_of_agency"]);
    das.push(flowAllDa);
    kpis.push({ da: flowAllDa.id, valueCol: "obligations", label: "Largest single flow",
      fmt: "money", agg: "max", subtitle: "one agency to one contractor", state: "",
      info: "The biggest agency→vendor relationship in the extract, in one year of contract obligations." });
    kpis.push({ da: flowAllDa.id, valueCol: "pct_of_agency", label: "Largest share of one agency",
      fmt: "pct", agg: "max", subtitle: "one contractor's cut", state: "",
      info: "The job divides each vendor's obligations by its agency's own total. This is the highest result — the most concentrated buyer-seller relationship the pack can see." });

    var vendorFlowDa = curatedDA("vfa_flow_vendor", "Federal Contract Awards — agency to vendor, billion-dollar flows",
      ds.output.id, ["agency", "vendor", "obligations", "pct_of_agency"],
      [{ col: "obligations", kind: "range", min: String(FCA_FLOW_FLOOR), max: "" }]);
    das.push(vendorFlowDa);
    panels.push({ id: "pfa_vendors", section: "Where the money goes",
      title: "Agency to contractor", span: "full",
      sub: "flows of " + fcaBillions(FCA_FLOW_FLOOR) + " or more — the band width is the money",
      info: "One ribbon per agency-vendor pair. The floor is about readability, not significance: all 300 kept pairs at once is a hairball. Open the View and move it.",
      chart: { type: "sankey", da: vendorFlowDa.id,
        map: { sourceCol: "agency", targetCol: "vendor", valueCol: "obligations" },
        opts: { srcCap: "Awarding agency", dstCap: "Contractor", fmt: "money", height: 700 } } });

    var industryDa = curatedDA("vfa_flow_industry", "Federal Contract Awards — agency to industry, the largest flows",
      ds.industry.id, ["agency_code", "industry", "obligations"],
      [{ col: "obligations", kind: "range", min: String(FCA_FLOW_FLOOR), max: "" }]);
    das.push(industryDa);
    panels.push({ id: "pfa_industry", title: "Agency to industry", span: "full",
      sub: "the same year by NAICS industry, flows of " + fcaBillions(FCA_FLOW_FLOOR) + " or more",
      info: "The industry table is the one place the agency reads as a code rather than a name — the extract leaves the name out on purpose, and only the job brings it across.",
      chart: { type: "sankey", da: industryDa.id,
        map: { sourceCol: "agency_code", targetCol: "industry", valueCol: "obligations" },
        opts: { srcCap: "Awarding agency", dstCap: "What it bought", fmt: "money", height: 600 } } });

    var dominantDa = curatedDA("vfa_dominant", "Federal Contract Awards — contractors taking a tenth of their agency",
      ds.output.id, ["vendor", "agency", "obligations", "pct_of_agency"],
      [{ col: "pct_of_agency", kind: "range", min: String(FCA_DOMINANT_PCT), max: "" }]);
    das.push(dominantDa);
    panels.push({ id: "pfa_dominant", section: "The concentrated relationships",
      title: "Contractors that took a tenth or more of the agency that paid them", span: "full",
      sub: "share of the agency's whole contract spend, not of its top-12 list",
      chart: { type: "table", da: dominantDa.id,
        map: { cols: [
          { col: "vendor", label: "Contractor" },
          { col: "agency", label: "Awarding agency" },
          { col: "obligations", label: "Obligations", num: true, fmt: "money" },
          { col: "pct_of_agency", label: "Share of the agency", num: true, fmt: "pct" }
        ] },
        opts: { pageSize: 12, freezeHeader: true, density: "comfortable" } } });

    panels.push({ id: "pfa_note", section: "How to read it", title: "What this pack is measuring", span: "full",
      chart: { type: "richtext", da: null, opts: { content: [
        "**One year, one kind of spending.** Every dollar here is a FY2025 contract obligation — award types A, B, C and D. Grants, loans and direct payments are a much larger story and none of it is in this pack.",
        "",
        "**A flow is a pair, not a total.** The extract keeps the top 12 industries and the top 12 recipients of each agency, so a ribbon is real but the fan out of an agency is not its whole spend. The agency's own total lives in the totals table, which is what the pack's job joins across — and it is why a share here is a share of everything the agency bought, not of the twelve rows beside it.",
        "",
        "- Contract obligations, FY2025: **" + fcaBillions(f.total) + "** across **" + f.agencies + "** agencies",
        "- Of that, to small business: **" + fcaBillions(f.smallBusiness) + "** (**" + f.smallBusinessPct.toFixed(1) + "%**)",
        "- Drawn above: the agency→vendor and agency→industry flows of **" + fcaBillions(FCA_FLOW_FLOOR) + "** or more — a floor about readability, not importance",
        "",
        "*What this is not:* a ranking of contractors. A firm that sells to six agencies appears six times, once per buyer, because the pair is the unit."
      ].join("\n") } } });

    return {
      id: "contractawards-flow", name: "contractawards-flow",
      title: "Where the Money Goes",
      subtitle: "Federal contract dollars from the agency that obligated them to the contractor and the industry that received them",
      dashboardTheme: "polecat",
      panels: panels, kpis: kpis, filters: [],
      cda: { connections: [], dataAccesses: das }
    };
  }

  // (2) who spends it, and the one policy question already in the data.
  function contractAwardsAgenciesSpec(ds, f) {
    var das = [], panels = [], kpis = [];
    var agencyDa = curatedDA("vfg_agencies", "Federal Contract Awards — agencies and their small-business share",
      ds.totals.id, ["agency", "agency_code", "total_obligations", "small_business_obligations", "small_business_pct"],
      [], [FCA_SB_PCT_CALC]);
    das.push(agencyDa);
    kpis.push({ da: agencyDa.id, valueCol: "total_obligations", label: "The largest buyer",
      fmt: "money", agg: "max", subtitle: "one agency, one year", state: "",
      info: "Defense is most of this pack. Every other agency is read against it." });
    kpis.push({ da: agencyDa.id, valueCol: "total_obligations", label: "The median agency",
      fmt: "money", agg: "median", subtitle: "of " + f.agencies + " agencies", state: "",
      info: "The middle of the 25 largest awarding agencies — a reminder of how skewed the top of this list is." });
    kpis.push({ da: agencyDa.id, valueCol: "small_business_pct", label: "Small-business share",
      fmt: "pct", agg: "median", subtitle: "the median agency", state: "",
      info: "Each agency's small-business obligations divided by its own total. Computed as a calculated column on this View — open it and the formula is on the shelf." });
    kpis.push({ da: agencyDa.id, valueCol: "small_business_obligations", label: "To small business",
      fmt: "money", agg: "sum", subtitle: f.smallBusinessPct.toFixed(1) + "% of the year", state: "",
      info: "Every small-business contract dollar of the 25 agencies, not only the ones in the top-12 vendor lists." });

    panels.push({ id: "pfg_size", section: "Who spends it",
      title: "Contract obligations by agency", span: "full",
      sub: "FY2025, the 25 largest awarding agencies",
      info: "A log scale would flatter the small agencies. This is linear on purpose: the shape of federal contracting IS one agency.",
      chart: { type: "bars", da: agencyDa.id, map: { labelCol: "agency", valueCol: "total_obligations" },
        opts: { horizontal: true, sortBars: true, showValues: false, fmt: "money", height: 520 } } });

    panels.push({ id: "pfg_sbshare", section: "How much of it reaches a small business",
      title: "Small-business share of each agency's contract spend", span: "full",
      sub: "the same 25 agencies, ordered by share rather than size — a different list entirely",
      info: "The share is this View's own calculated column: small_business_obligations ÷ total_obligations. USASpending counts the numerator with its own small-business recipient filter.",
      chart: { type: "bars", da: agencyDa.id, map: { labelCol: "agency", valueCol: "small_business_pct" },
        opts: { horizontal: true, sortBars: true, showValues: true, fmt: "pct", height: 520 } } });

    panels.push({ id: "pfg_scatter", title: "Does size predict the share?", span: 2,
      sub: "one dot per agency: what it spends against how much of it went to small business",
      info: "If the biggest buyers were also the ones reaching small business, the dots would climb. They do not.",
      chart: { type: "scatter", da: agencyDa.id,
        map: { labelCol: "agency", xCol: "total_obligations", yCol: "small_business_pct" },
        opts: { trend: true, fmt: "abbr", xLabel: "Contract obligations, FY2025",
          yLabel: "Small-business share (%)", height: 380 } } });

    panels.push({ id: "pfg_note", title: "Where these two numbers come from", span: 2,
      chart: { type: "richtext", da: null, opts: { content: [
        "**Two queries, not one.** The agency total and its small-business figure are the same USASpending question asked twice — the second time with the small-business recipient filter on. Summing the small firms out of the top-12 vendor list would have been cheaper and would have under-counted every agency, because most small-business dollars are spread below the twelfth-largest recipient.",
        "",
        "**The share is derived here, in the open.** The extract ships two dollar figures and deliberately not their ratio; the percentage on this dashboard is a calculated column on the View, so you can see the formula, change it, or plot something else against it.",
        "",
        "- Across all " + f.agencies + " agencies: **" + fcaBillions(f.smallBusiness) + "** of **" + fcaBillions(f.total) + "** (**" + f.smallBusinessPct.toFixed(1) + "%**)",
        "",
        "*A caution:* \"small business\" is a size standard that varies by NAICS industry, so a share is not directly comparable between an agency that buys aircraft and one that buys office services."
      ].join("\n") } } });

    return {
      id: "contractawards-agencies", name: "contractawards-agencies",
      title: "Who Spends It",
      subtitle: "The 25 largest awarding agencies by contract obligations, and how much of each one's spending reached a small business",
      dashboardTheme: "polecat",
      panels: panels, kpis: kpis, filters: [],
      cda: { connections: [], dataAccesses: das }
    };
  }

  // (3) where the work lands — the app's congressional-district scale, on real data.
  //
  // ONE map, deliberately, and the ranked list beside it — because the measurement that
  // came out of building this dashboard is that a US congressional-district choropleth
  // CANNOT carry this measure on its own. The renderer's class breaks are LINEAR
  // (app/studio-charts.js: t = (v - vmin) / (vmax - vmin)), federal contract money is a
  // power law, and the two do not meet: 407 of the 436 districts fall in the lowest sixth
  // of the range, so six colour classes render as one. SP-1 never hit this because a rate
  // per 10,000 residents is bounded; a dollar total is not.
  //
  // The response is not to hide the map or to invent a flattering index — it is to say
  // what the map is evidence FOR (a concentration this extreme) and to put the reading
  // you cannot get from it directly underneath. Quantile or log class breaks would fix
  // the chart properly and would be a real improvement to the choropleth for everyone;
  // that is a chart-capability slice of its own, not something to smuggle in on a pack.
  function contractAwardsDistrictsSpec(ds, d) {
    var das = [], panels = [], kpis = [];
    var districtDa = curatedDA("vfd_all", "Federal Contract Awards — contract spend by congressional district",
      ds.districts.id, ["district_id", "district", "state", "obligations", "population", "dollars_per_resident"],
      [], [FCA_PER_RESIDENT_CALC]);
    das.push(districtDa);
    kpis.push({ da: districtDa.id, valueCol: "obligations", label: "Obligated in a district",
      fmt: "money", agg: "sum", subtitle: d.districts + " districts", state: "",
      info: "Place of performance — where the work happens, not where the contractor is headquartered. Slightly less than the national total: the territories' at-large delegations are left out because the map has no geometry for them." });
    kpis.push({ da: districtDa.id, valueCol: "obligations", label: "The busiest district",
      fmt: "money", agg: "max", subtitle: "one district, one year", state: "",
      info: "Contract work concentrates hard around the agencies that buy it." });
    kpis.push({ da: districtDa.id, valueCol: "obligations", label: "The median district",
      fmt: "money", agg: "median", subtitle: "the middle of " + d.districts, state: "",
      info: "Read this against the busiest district beside it — the gap between the two is the finding this dashboard is about." });
    kpis.push({ da: districtDa.id, valueCol: "dollars_per_resident", label: "Per resident",
      fmt: "money", agg: "median", subtitle: "the median district", state: "",
      info: "This View's own calculated column: obligations ÷ population. It is a way to read the map, not a payment to anybody." });

    panels.push({ id: "pfd_map", section: "Where the work lands",
      title: "Contract obligations by congressional district", span: "full",
      sub: "place of performance, FY2025 — and a distribution so concentrated that one colour covers most of the country",
      info: "The colour classes are evenly spaced between the smallest and largest district, so a handful of districts hold the whole top of the scale. That is what the map is showing you; the ranked list below is how you read the rest of it.",
      chart: { type: "choropleth", da: districtDa.id,
        map: { idCol: "district_id", valueCol: "obligations" },
        opts: { scale: "cd", fmt: "money", agg: "sum", classes: 6, height: 460 } } });

    var bigDa = curatedDA("vfd_big", "Federal Contract Awards — the biggest districts",
      ds.districts.id, ["district", "state", "obligations"],
      [{ col: "obligations", kind: "range", min: String(FCA_DISTRICT_BAR), max: "" }]);
    das.push(bigDa);
    panels.push({ id: "pfd_bars", section: "The map's top class, spread out",
      title: "Districts with " + fcaBillions(FCA_DISTRICT_BAR) + " or more of contract work", span: "full",
      sub: "the filter is on the View — open it and move the floor",
      info: "Everything here is inside the darkest band or two of the map above. The bars are the only place their differences are visible at all.",
      chart: { type: "bars", da: bigDa.id, map: { labelCol: "district", valueCol: "obligations" },
        opts: { horizontal: true, sortBars: true, showValues: false, fmt: "money", height: 520 } } });

    panels.push({ id: "pfd_scatter", section: "Why the map looks like that",
      title: "Every district, by residents and by dollars", span: 2,
      sub: "one dot per district — districts hold roughly equal populations, so the whole spread is money",
      info: "The near-vertical wall on the left is the point: equal-population districts, wildly unequal contract work.",
      chart: { type: "scatter", da: districtDa.id,
        map: { labelCol: "district", xCol: "population", yCol: "obligations" },
        opts: { trend: false, fmt: "abbr", xLabel: "Residents", yLabel: "Contract obligations", height: 380 } } });

    panels.push({ id: "pfd_note", title: "Place of performance, and what it hides", span: 2,
      chart: { type: "richtext", da: null, opts: { content: [
        "**This map is about work, not headquarters.** USASpending records a primary place of performance for each award, and that is what these districts are keyed on. A contractor registered in one state doing the work in another shows up where the work is.",
        "",
        "**One place per award is a simplification the source makes, not one this pack adds.** A contract performed across several districts still lands on one, so a district with a large facility carries work that spilled well past its boundary.",
        "",
        "- Districts drawn: **" + d.districts + "**, the full House delegation of the 50 states and the District of Columbia",
        "- The ten busiest districts take **" + d.topTenPct.toFixed(0) + "%** of the year's district-level contract work between them",
        "- **" + d.negative + "** districts come out NEGATIVE: money deobligated from earlier awards exceeded what was newly obligated there. That is a real feature of contract accounting, not a data error, and it is left in",
        "- Not drawn: the at-large delegations of American Samoa, Guam, the Northern Mariana Islands, Puerto Rico and the US Virgin Islands — **0.6%** of the year's contract dollars, stated here rather than silently missing, because the app's map has no geometry for them"
      ].join("\n") } } });

    return {
      id: "contractawards-districts", name: "contractawards-districts",
      title: "Where the Work Lands",
      subtitle: "Federal contract obligations by congressional district — place of performance, and how few districts carry most of it",
      dashboardTheme: "polecat",
      panels: panels, kpis: kpis, filters: [],
      cda: { connections: [], dataAccesses: das }
    };
  }

  // Idempotent by dashboard name (the CONS-1 convention SP-1 also follows), so it is safe
  // from the seed, from the boot heal, and from a workspace where someone deleted one.
  function seedContractAwardsDashboards(W, id, ds, now) {
    if (!ds || !ds.totals || !ds.industry || !ds.districts || !ds.output) return 0;
    // Both figure sets are read back off the rows that were just written, rather than
    // taken as arguments: the seed path and the boot heal then cannot disagree about what
    // the pack says about itself.
    var f = contractAwardsFigures(parsePackCsv(ds.totals.content));
    var d = contractAwardsDistrictFigures(parsePackCsv(ds.districts.content));
    if (!f.agencies || !f.total || !d.districts) return 0; // nothing to state honestly, so state nothing
    var specs = {
      "contractawards-districts": contractAwardsDistrictsSpec(ds, d),
      "contractawards-agencies": contractAwardsAgenciesSpec(ds, f),
      "contractawards-flow": contractAwardsFlowSpec(ds, f)
    };
    var added = 0;
    FCA_DASHBOARDS.forEach(function (name) {
      var have = W.all("dashboards").some(function (r) {
        return r.demoPackId === id && (r.name === name || (r.spec && r.spec.name) === name);
      });
      if (have) return;
      var spec = specs[name];
      W.put("dashboards", {
        name: name, title: spec.title, ts: now, spec: spec,
        folder: FCA_FOLDER, demoPackId: id
      });
      added++;
    });
    return added;
  }

  // The boot heal (studio.js reconcilePackDashboards): a workspace that installed the
  // pack when it was slice (a) — data but no dashboards — gets them without a reinstall,
  // and so does one where a dashboard was deleted. Returns false when there is nothing to
  // do, including the legitimate "data hasn't materialized yet" case: the seed path above
  // writes the dashboards itself the moment the datasets exist.
  // The pack's four datasets as the seed path names them, found in a workspace rather
  // than threaded through — the same lookup both boot heals need, so it is written once.
  // Returns null unless all four are present WITH content: a half-materialized pack has
  // nothing honest to chart, and both callers treat that as "nothing to do", not an error.
  function contractAwardsDatasets(W, id) {
    var mine = W.all("datasets").filter(function (d) { return d.demoPackId === id && d.content; });
    function byFile(part) {
      return mine.filter(function (d) { return (d.fileName || "").indexOf(part) >= 0; })[0];
    }
    var ds = {
      totals: byFile("agency-totals"), industry: byFile("agency-industry"),
      districts: byFile("district-awards"),
      output: mine.filter(function (d) { return (d.tags || []).indexOf("job-output") >= 0; })[0]
    };
    return (ds.totals && ds.industry && ds.districts && ds.output) ? ds : null;
  }

  Studio.ensureContractAwardsDashboards = function () {
    var id = "contractawards";
    if (!Studio.demoPackInstalled(id)) return false;
    var W = Studio.Workspace;
    var ds = contractAwardsDatasets(W, id);
    if (!ds) return false;
    return seedContractAwardsDashboards(W, id, ds, new Date().toISOString()) > 0;
  };

  /* ---- SP-6 (c): the pack's four pinned Views ----------------------------------------
     A dashboard is a finished argument; a View is the thing you open and change. SP-1
     established the convention and this pack follows it exactly: author each View the
     way `bdSave` would — compute the basis with the pure `Studio.Build.compute`, then
     `Studio.newPanel` over the resulting columns — so a seeded View and one saved by
     hand in the View Builder are the same shape and open in the same editor. Only the
     basis HEAD is read here; the rows a pinned card draws come from
     `Studio.Build.runBlob` against the live dataset on every render (#118), which is
     why a subset is expressed as the View's OWN filter rather than a second, hand-cut
     dataset — open it and the rule is right there on the shelf to move.

     THE FOUR are the four readings the dashboards are built out of: the two flows
     (which is what this pack was extracted for), the small-business share, and the
     districts. Two of them are sankeys, and that is what made this slice touch the
     builder: a flow was drawable but not BUILDABLE, so a pack-authored sankey View had
     no honest editor to open in. Sankey now rides the heatmap's basis in
     `app/build.js` — [Rows dimension, Columns dimension, measure] read as
     (source, target, flow) — which is the same "share an existing basis rather than
     grow a parallel one" move N33b made for Quadrant, and it means these two Views
     open, edit and re-save as themselves instead of degrading to a table.

     One honest limit, stated rather than hidden: the measure column of a rolled-up
     basis is named by the pivot ("SUM obligations"), so that is what these Views'
     columns are called. It is the same label the builder writes for a View you save
     yourself — a seeded View that quietly used a prettier name would be the odd one
     out, and the number underneath is the same either way. */
  function contractAwardsViewDefs(ds) {
    var floorNote = fcaBillions(FCA_FLOW_FLOOR);
    return [
      {
        // The hero, and the one View in the app that opens on a real origin→destination
        // table. The floor is the dashboards' own FCA_FLOW_FLOOR — a READABILITY floor,
        // not a significance one, and here it is a filter chip one drag from gone.
        key: "flow_vendor", dsId: ds.output.id,
        name: "Federal Contract Awards — agency to contractor, flows of " + floorNote + " or more",
        chartType: "sankey",
        shelfRows: [{ col: "agency" }],
        shelfCols: [{ col: "vendor", agg: null }, { col: "obligations", agg: "sum" }],
        filters: [{ col: "obligations", kind: "range", min: String(FCA_FLOW_FLOOR), max: "" }],
        opts: { srcCap: "Awarding agency", dstCap: "Contractor", fmt: "money", height: 520 }
      },
      {
        // Over the RAW industry table, so the source end reads as an agency CODE — the
        // extract leaves the name out on purpose and only the pack's job brings it
        // across. Naming that here is the difference between a limitation and a bug.
        key: "flow_industry", dsId: ds.industry.id,
        name: "Federal Contract Awards — agency to industry, flows of " + floorNote + " or more",
        chartType: "sankey",
        shelfRows: [{ col: "agency_code" }],
        shelfCols: [{ col: "industry", agg: null }, { col: "obligations", agg: "sum" }],
        filters: [{ col: "obligations", kind: "range", min: String(FCA_FLOW_FLOOR), max: "" }],
        opts: { srcCap: "Awarding agency", dstCap: "What it bought", fmt: "money", height: 460 }
      },
      {
        // The share is the pack's argument that derivations should be visible: the
        // extract ships two dollar figures and deliberately not their ratio, so the
        // percentage is a CALC COLUMN on this View — open it and the formula is there.
        key: "sb_share", dsId: ds.totals.id,
        name: "Federal Contract Awards — small-business share of each agency's spend",
        chartType: "bars",
        shelfRows: [],
        shelfCols: [{ col: "agency", agg: null }, { col: FCA_SB_PCT_CALC.name, agg: "avg" }],
        calcs: [FCA_SB_PCT_CALC],
        opts: { horizontal: true, sortBars: true, showValues: true, fmt: "pct", height: 460 }
      },
      {
        // Every district, not the map's top class — because the finding the map cannot
        // show (a linear colour scale over a power law) is exactly the one a sortable
        // table can. Dollars per resident is the second calc column, for the same
        // reason as the share above.
        key: "districts", dsId: ds.districts.id,
        name: "Federal Contract Awards — every congressional district, by dollars and per resident",
        chartType: "table",
        shelfRows: [],
        shelfCols: ["district", "state", "obligations", "population", FCA_PER_RESIDENT_CALC.name]
          .map(function (c) { return { col: c, agg: null }; }),
        calcs: [FCA_PER_RESIDENT_CALC],
        tableCols: [
          { col: "district", label: "District" },
          { col: "state", label: "State" },
          { col: "obligations", label: "Obligations", num: true, fmt: "money" },
          { col: "population", label: "Residents", num: true, fmt: "abbr" },
          { col: FCA_PER_RESIDENT_CALC.name, label: "Per resident", num: true, fmt: "money" }
        ],
        opts: { pageSize: 12, freezeHeader: true, density: "comfortable" }
      }
    ];
  }
  // The pivot a given chart type's basis is actually computed from — chartBasis's own
  // rule, mirrored here because the seed runs without a builder state to ask. Only the
  // two shapes this pack uses are covered, and the sankey one is the interesting case:
  // its basis is the flat triple [source, target, measure], NOT a crosstab, so the Rows
  // field is folded into the Columns pivot exactly the way app/build.js does it.
  function contractAwardsBasisShelf(def) {
    if (def.chartType === "sankey") {
      return [{ col: def.shelfRows[0].col, agg: null }].concat(def.shelfCols);
    }
    return def.shelfCols;
  }
  function contractAwardsViewRow(def, table) {
    var blob = {
      dsKind: "ws", dsId: def.dsId, chartType: def.chartType,
      shelfCols: Studio.clone(def.shelfCols), shelfRows: Studio.clone(def.shelfRows || []),
      filters: Studio.clone(def.filters || []), calcs: Studio.clone(def.calcs || []),
      shelfColor: [], paletteKey: "", mapScale: ""
    };
    // Calc columns first — a shelf can name one, so the basis has to be computed over the
    // EFFECTIVE columns (bdEff's rule), not the raw CSV's. Over the UNFILTERED rows on
    // purpose, the same as SP-1: a filter changes which rows come back, never which
    // columns do, and only the head is wanted here (the rows are runBlob's job).
    var eff = Studio.applyCalcCols(table.columns, table.rows, (def.calcs || []).map(function (c) {
      return { name: c.name, formula: c.formula, type: "Numeric" };
    }));
    var basis = Studio.Build.compute(eff.cols, eff.rows, contractAwardsBasisShelf(def), []);
    if (!basis || basis.head.length < 2) return null;
    var da = { id: "fcav_" + def.key, name: def.name, kind: "sql", sql: "", query: "",
      columns: basis.head.slice(), params: [], authored: true };
    da.builder = Studio.clone(blob);
    var p = Studio.newPanel(def.chartType, da);
    // newPanel's table default marks every column after the first numeric and titleizes
    // its label — right for an ad-hoc pivot, wrong for `state`. Declared columns win.
    if (def.tableCols) p.chart.map.cols = Studio.clone(def.tableCols);
    if (def.opts) Object.keys(def.opts).forEach(function (k) { p.chart.opts[k] = def.opts[k]; });
    return {
      name: def.name, folder: FCA_FOLDER, demoPackId: "contractawards",
      pinned: true, panelTitle: "", chartType: def.chartType, paletteKey: "",
      da: da, builder: Studio.clone(blob), chart: p.chart
    };
  }
  // Idempotent by View name, the convention every seeder in this file uses, so it is safe
  // from the seed, from the boot heal, and in a workspace where someone deleted one.
  function seedContractAwardsViews(W, id, ds) {
    if (!ds) return 0;
    var tables = {};
    var have = {};
    W.all("analyses").forEach(function (r) { if (r.demoPackId === id) have[r.name] = true; });
    var added = 0;
    // Seeded in REVERSE of the reading order above: Home sorts pinned Views newest-first,
    // so the agency→contractor flow has to be the last row written to lead the shelf (the
    // CONS-2/CONS-3 convention the dashboards are seeded by too).
    contractAwardsViewDefs(ds).slice().reverse().forEach(function (def) {
      if (have[def.name]) return;
      // Parsed once per dataset, not once per View — two of the four share a table.
      if (!tables[def.dsId]) {
        var row = W.get("datasets", def.dsId);
        tables[def.dsId] = parsePackCsv((row && row.content) || "");
      }
      var t = tables[def.dsId];
      if (!t || !t.rows.length) return;
      var view = contractAwardsViewRow(def, t);
      if (!view) return;
      W.put("analyses", view);
      added++;
    });
    return added;
  }
  // The boot heal, paired with ensureContractAwardsDashboards above and for the same
  // reason: a workspace that installed the pack at slice (a) or (b) gets the Views
  // without a reinstall. False when there is nothing to do.
  Studio.ensureContractAwardsViews = function () {
    var id = "contractawards";
    if (!Studio.demoPackInstalled(id)) return false;
    var W = Studio.Workspace;
    return seedContractAwardsViews(W, id, contractAwardsDatasets(W, id)) > 0;
  };

  /* ---- SP-5 (a): Campaign Finance — the data foundation ------------------------------
     The pack asks who funds federal politics, and the extract
     (tools/pack-extract/campaignfinance.mjs) answers it in seven committed tables: who gave
     (by state, occupation, employer, cheque size and month) and who received (the fifty
     largest recipient committees, and every donor state each of them drew from).

     THE ONE MODELLING DECISION WORTH KNOWING, because it is the difference between a
     truthful chart and a partisan-looking one: the extract counts EVERY recipient committee,
     not just the campaigns. Measured on the 2024 file, restricting recipients to candidate
     committees puts Harris For President at $390M and no Trump campaign in the top fifty —
     not because one side raised nothing, but because the Trump operation raised through
     JOINT FUNDRAISING committees that transfer onward while the Harris operation's earmarked
     money was itemized directly against the campaign. Same money, different plumbing. So the
     kind of committee is a COLUMN here (`committee_type`) rather than a silent filter, and
     the reader can do what the filter would have done, visibly.

     Everything below the connection is written by seedCampaignFinanceData once
     Studio.ensurePackDataMaterialized has the bytes. */
  var CF_FOLDER = "Campaign Finance";
  var CF_STATES = "state-donors.csv";
  var CF_COMMITTEES = "committees.csv";
  var CF_FLOW = "committee-state.csv";
  var CF_OCCUPATIONS = "occupations.csv";
  var CF_EMPLOYERS = "employers.csv";
  var CF_MONTHLY = "monthly.csv";
  var CF_BANDS = "size-bands.csv";
  var CF_SOURCE_DESC = "Itemized individual contributions for the 2023-24 election cycle, " +
    "extracted by tools/pack-extract/campaignfinance.mjs and read from files in your browser.";

  function installCampaignFinanceConnection() {
    Studio.Workspace.put("connections", {
      name: "FEC bulk downloads — embedded extracts", adapter: "file", cfg: {},
      desc: CF_SOURCE_DESC, folder: CF_FOLDER, demoPackId: "campaignfinance"
    });
  }
  // The pack's own connection, however install left it — looked up rather than threaded
  // through, because install() and the seed run in different turns (the SP-1 convention).
  function campaignFinanceConnection() {
    return Studio.Workspace.all("connections").filter(function (r) { return r.demoPackId === "campaignfinance"; })[0] ||
      Studio.Workspace.put("connections", {
        name: "FEC bulk downloads — embedded extracts", adapter: "file", cfg: {},
        desc: CF_SOURCE_DESC, folder: CF_FOLDER, demoPackId: "campaignfinance"
      });
  }

  // The job's four steps, as a fresh array each call — the same definition seeds the job row
  // AND pre-computes its output below, so the two can never describe different work.
  function campaignFinanceSteps(committeesDatasetId) {
    return [
      // 1. the join the pack exists to show: every donor-state row gains the committee's
      //    NAME, its kind, its party, the seat it is running for and its own cycle total.
      //    No column collides, because the extract deliberately left all of that out of the
      //    flow table — see tools/pack-extract/campaignfinance.mjs.
      { op: "join", datasetId: committeesDatasetId, leftCol: "cmte_id", rightCol: "cmte_id", type: "inner" },
      // 2-3. one state's share of one committee. The committee's total is divided down to ONE
      //      PERCENT first, so the ratio that follows is a plain division and every
      //      intermediate column is a number a reader can name (SP-1's and SP-6's shape).
      { op: "derive", outCol: "one_pct_of_committee", a: { col: "total_amount" }, operator: "/", b: { value: 100 } },
      { op: "derive", outCol: "pct_of_committee", a: { col: "amount" }, operator: "/", b: { col: "one_pct_of_committee" } },
      // 4. the out-of-state story, and the reason `is_home_state` is a 0/1 in the extract
      //    rather than something derived here: the job engine's derive step does arithmetic
      //    on numbers and cannot compare two strings, so "did this money come from the state
      //    the candidate is running in" arrives as a flag this multiplies by. Summed per
      //    committee against total_amount, it IS the out-of-state share.
      { op: "derive", outCol: "home_state_amount", a: { col: "amount" }, operator: "*", b: { col: "is_home_state" } }
    ];
  }

  function seedCampaignFinanceData(csv) {
    var id = "campaignfinance", W = Studio.Workspace;
    var conn = campaignFinanceConnection();
    var tags = ["demo", "elections", "money"];

    var statesDs = W.put("datasets", {
      name: "Individual contributions by donor state — 2023-24 cycle", connectionId: conn.id,
      kind: "file", format: "csv", fileName: CF_STATES,
      content: csv[CF_STATES],
      columns: ["state", "contributions", "amount", "small_dollar_contributions",
                "small_dollar_amount", "max_out_contributions", "max_out_amount"],
      folder: CF_FOLDER, demoPackId: id, tags: tags.concat(["geo"])
    });
    var committeesDs = W.put("datasets", {
      name: "The 50 largest recipient committees — 2023-24 cycle", connectionId: conn.id,
      kind: "file", format: "csv", fileName: CF_COMMITTEES,
      content: csv[CF_COMMITTEES],
      columns: ["cmte_id", "committee", "committee_type", "candidate", "party", "office",
                "office_state", "district", "total_contributions", "total_amount"],
      folder: CF_FOLDER, demoPackId: id, tags: tags
    });
    var flowDs = W.put("datasets", {
      name: "Where each committee's money came from, by donor state", connectionId: conn.id,
      kind: "file", format: "csv", fileName: CF_FLOW,
      content: csv[CF_FLOW],
      columns: ["cmte_id", "state", "is_home_state", "contributions", "amount"],
      folder: CF_FOLDER, demoPackId: id, tags: tags.concat(["flow"])
    });
    var occupationsDs = W.put("datasets", {
      name: "Individual contributions by donor occupation — top 200", connectionId: conn.id,
      kind: "file", format: "csv", fileName: CF_OCCUPATIONS,
      content: csv[CF_OCCUPATIONS], columns: ["occupation", "contributions", "amount"],
      folder: CF_FOLDER, demoPackId: id, tags: tags
    });
    var employersDs = W.put("datasets", {
      name: "Individual contributions by donor employer — top 200", connectionId: conn.id,
      kind: "file", format: "csv", fileName: CF_EMPLOYERS,
      content: csv[CF_EMPLOYERS], columns: ["employer", "contributions", "amount"],
      folder: CF_FOLDER, demoPackId: id, tags: tags
    });
    var monthlyDs = W.put("datasets", {
      name: "Individual contributions by month and committee kind", connectionId: conn.id,
      kind: "file", format: "csv", fileName: CF_MONTHLY,
      content: csv[CF_MONTHLY], columns: ["month", "committee_type", "contributions", "amount"],
      folder: CF_FOLDER, demoPackId: id, tags: tags.concat(["time"])
    });
    var bandsDs = W.put("datasets", {
      name: "Small-dollar to max-out — contributions by size band", connectionId: conn.id,
      kind: "file", format: "csv", fileName: CF_BANDS,
      content: csv[CF_BANDS],
      columns: ["band_order", "band", "committee_type", "contributions", "amount"],
      folder: CF_FOLDER, demoPackId: id, tags: tags
    });

    var steps = campaignFinanceSteps(committeesDs.id);
    // Pre-materialized so the shares are there to chart before anyone clicks Run — and
    // computed by running the job's OWN steps through the engine rather than a hand-kept
    // second copy of the arithmetic, so a Run rewrites this dataset with identical numbers
    // instead of quietly correcting it (docs/PACKS.md). Seeded as a pack-tagged, foldered
    // row so Remove sweeps it.
    var left = parsePackCsv(csv[CF_FLOW]);
    var ctx = { datasets: {} };
    ctx.datasets[committeesDs.id] = parsePackCsv(csv[CF_COMMITTEES]);
    var out = Studio.runJobSteps(left, steps, ctx);
    var outputName = "Donor states — each state's share of the committee it gave to (job output)";
    var outputDs = W.put("datasets", {
      name: outputName, connectionId: conn.id,
      kind: "file", format: "csv", fileName: "committee_donor_state_shares.csv",
      content: out.error ? "" : Studio.rowsToCsv(out.columns, out.rows),
      columns: (out.columns || []).slice(),
      folder: CF_FOLDER, demoPackId: id, tags: tags.concat(["job-output"])
    });

    W.put("jobs", {
      name: "Join the committees and derive each donor state's share",
      sourceDatasetId: flowDs.id,
      outputDatasetId: outputDs.id, outputName: outputName,
      steps: steps,
      folder: CF_FOLDER, demoPackId: id
    });

    // SP-5 (b): a SECOND job, chained onto the first one's output, and the reason it
    // exists is a measured limit of the app rather than anything about the FEC.
    //
    // The View Builder runs a workspace dataset live and keeps the FIRST 2,000 rows
    // (app/build.js, bdLoadRowsFor) — a real cap that every panel bound to a builder blob
    // inherits, applied BEFORE the View's own filters. The share table above is 2,658 rows
    // in cmte_id order, so a panel reading it directly loses the last 12 committees
    // outright, INCLUDING both Trump committees — which would have made the flow hero look
    // exactly like the partisan artifact slice (a) went out of its way to avoid, silently
    // and while still drawing a plausible chart.
    //
    // So the pack does the trimming ITSELF, in the open, as a job whose rule you can read
    // and change: keep the flows worth CF_CHART_FLOOR or more. That is 1,293 of the 2,658
    // rows and 97.7% of the dollars, with all 50 committees and all 16 home-state rows
    // intact — and the flow dashboard's own note states it. The cap is the builder's, not
    // the pack's, and lifting it is an app change recorded in the SP-5 item for Kevin.
    var chartSteps = [{ op: "filter", col: "amount", cmp: "gte", value: CF_CHART_FLOOR }];
    var chartOut = Studio.runJobSteps({ columns: out.columns || [], rows: out.rows || [] }, chartSteps, {});
    var chartName = "Donor states — the flows big enough for a live View (job output)";
    var chartDs = W.put("datasets", {
      name: chartName, connectionId: conn.id,
      kind: "file", format: "csv", fileName: "committee_donor_state_flows_charted.csv",
      content: chartOut.error ? "" : Studio.rowsToCsv(chartOut.columns, chartOut.rows),
      columns: (chartOut.columns || []).slice(),
      folder: CF_FOLDER, demoPackId: id, tags: tags.concat(["job-output", "flow"])
    });
    W.put("jobs", {
      name: "Keep the donor-state flows a live View can hold",
      sourceDatasetId: outputDs.id,
      outputDatasetId: chartDs.id, outputName: chartName,
      steps: chartSteps,
      folder: CF_FOLDER, demoPackId: id
    });

    // SP-5 (b): the dashboards read the job's output and the extract tables together, so
    // they are seeded here — the moment those rows exist — rather than in install(), which
    // runs a turn earlier with nothing to chart yet (the SP-1/SP-6 convention).
    var seededDs = {
      states: statesDs, committees: committeesDs, occupations: occupationsDs,
      employers: employersDs, monthly: monthlyDs, bands: bandsDs,
      output: outputDs, charted: chartDs
    };
    seedCampaignFinanceDashboards(W, id, seededDs, new Date().toISOString());
    // SP-5 (c): and the pinned Views, from the same turn and for the same reason — the
    // rows they are computed over exist only now. Last, so the Views are the newest rows
    // in the workspace and lead Home's pinned shelf.
    seedCampaignFinanceViews(W, id, seededDs);

    return { states: statesDs, committees: committeesDs, flow: flowDs, occupations: occupationsDs,
             employers: employersDs, monthly: monthlyDs, bands: bandsDs,
             output: outputDs, charted: chartDs };
  }

  /* ---- SP-5 (b): the pack's three dashboards ----------------------------------------
     The pack asks who funds federal politics. The extract answers it from two ends, so
     the dashboards do too, and the third one is about the reading itself:

       1. WHO FUNDS WHOM (the hero) — the FLOW, donor state → recipient committee, over
          the job's output so the committee reads as a NAME with its kind and party
          attached. Underneath it, the question the flow table exists for: how much of a
          candidate's itemized money came from the state they are running in.
       2. WHERE THE MONEY COMES FROM — donor geography on the app's `state` scale, and
          the two shares the extract ships the ingredients for (small gifts, max-out
          gifts) as builder CALC columns rather than extract columns.
       3. WHO GIVES IT, AND HOW — occupation and employer, the size bands as a marimekko
          (the one chart whose width-times-height IS the "few big cheques" story), and
          the 24-month arc by committee kind.

     Two conventions carried from SP-1 and SP-6, for the same reasons:
     * every charted panel is bound to a builder-blob DA over one of the pack's OWN
       datasets (curatedDA), so #118's live re-run feeds the panels the REAL rows;
     * a panel that shows a SUBSET narrows it with the builder's own filter grammar
       rather than a hand-cut second dataset — open the View and the rule is right there.

     THE ONE THING THIS SLICE HAD TO GET RIGHT, and it is the same modelling decision
     slice (a) recorded: the committee kind is a COLUMN, never a silent filter. Every
     panel here draws all six kinds of committee together, and the note panels say what
     that means — a joint fundraising committee's haul and a campaign's are the same
     money seen at different points in the plumbing, and adding them is not a total. */
  // Seeding order, and it matters: the hero is LAST so it is the newest row and tops a
  // recency-sorted list (the CONS-2/CONS-3 convention SP-1 and SP-6 both follow).
  var CF_DASHBOARDS = ["campaignfinance-donors", "campaignfinance-geography", "campaignfinance-flow"];
  // Floors, all about READABILITY rather than significance — the same kind of constant
  // (and the same disclosure) as SP-1's MC_BIG_COUNTY and SP-6's FCA_FLOW_FLOOR. Every
  // panel that applies one says so in its own subtitle, in the units on screen.
  //
  // The flow floor was MEASURED the way SP-6's was: a sankey lays its nodes out with an
  // 11px gap, so the readable limit is the node COUNT. At $5M the state side has 30
  // nodes and the committee side 35 and the labels collide; at $10M it is 21 and 20,
  // which the panel's height then gives ~30px apiece.
  var CF_FLOW_FLOOR = 1e7;        // the hero sankey: 69 of 2,658 state→committee flows
  var CF_DOMINANT_PCT = 20;       // "one state supplied a fifth or more" (41 rows)
  // NOT a readability floor — the builder's live-run cap, taken deliberately by the
  // pack's second job so the trimming is visible instead of silent. See the job.
  var CF_CHART_FLOOR = 2e5;       // 1,293 of 2,658 rows, 97.7% of the dollars
  var CF_OCCUPATION_FLOOR = 5e7;  // occupations big enough to read as bars (13 of 200)
  var CF_EMPLOYER_FLOOR = 3e6;    // employers big enough to read as bars (18 of 200)

  // The pack's own headline figures, derived from the shipped rows at seed time rather
  // than typed in — the SP-1 rule. A re-extract that moves the numbers re-seeds copy that
  // is still true, and the suite recomputes these independently and demands they agree.
  function campaignFinanceFigures(states, flow, charted) {
    var cols = (states && states.columns) || [], rows = (states && states.rows) || [];
    function sum(col) {
      var i = cols.indexOf(col);
      return i < 0 ? 0 : rows.reduce(function (a, r) { return a + (Number(r[i]) || 0); }, 0);
    }
    var total = sum("amount"), contributions = sum("contributions");
    var small = sum("small_dollar_amount"), smallN = sum("small_dollar_contributions");
    var maxOut = sum("max_out_amount"), maxOutN = sum("max_out_contributions");
    function flowSum(t) {
      var c = (t && t.columns) || [], r = (t && t.rows) || [], i = c.indexOf("amount");
      return i < 0 ? 0 : r.reduce(function (a, x) { return a + (Number(x[i]) || 0); }, 0);
    }
    var flowTotal = flowSum(flow), chartedTotal = flowSum(charted);
    function pct(part, whole) { return whole ? Math.round((part / whole) * 1000) / 10 : 0; }
    return {
      states: rows.length, total: total, contributions: contributions,
      small: small, smallPct: pct(small, total), smallCountPct: pct(smallN, contributions),
      maxOut: maxOut, maxOutPct: pct(maxOut, total), maxOutCountPct: pct(maxOutN, contributions),
      flowTotal: flowTotal, flowPct: pct(flowTotal, total),
      // What the pack's second job kept, so the flow dashboard can state its own trim
      // rather than leave the reader to discover it.
      flowRows: ((flow && flow.rows) || []).length,
      chartedRows: ((charted && charted.rows) || []).length,
      chartedTotal: chartedTotal, chartedPct: pct(chartedTotal, flowTotal)
    };
  }
  // "$6.5B" / "$1.3B" — the pack quotes big dollars constantly and a reader should never
  // have to count digits to compare two of them.
  function cfBillions(n) { return "$" + (Math.round(n / 1e8) / 10).toLocaleString() + "B"; }
  function cfMillions(n) { return "$" + Math.round(n / 1e6).toLocaleString() + "M"; }
  // The two shares as percentages OF THE STATE, as builder calc columns — the extract
  // ships the dollar figures and deliberately not their ratios, because a ratio is a
  // derivation and this pack's whole argument is that derivations stay visible.
  var CF_SMALL_PCT_CALC = { name: "small_dollar_pct", formula: "[small_dollar_amount] / [amount] * 100" };
  var CF_MAXOUT_PCT_CALC = { name: "max_out_pct", formula: "[max_out_amount] / [amount] * 100" };
  // curatedDA's rolled-up sibling: the same builder blob, but with the shelf AGGREGATED —
  // dims carry no agg, measures carry one, and the builder names the result "SUM amount"
  // (app/build.js aggLabel). SP-6 avoided a rollup because it wanted a ratio to keep the
  // reader's own name for it; this one wants the opposite — a long table of 167 month ×
  // committee-kind rows collapsed to the 24 monthly totals a time series needs, which is
  // exactly what the shelf is for. Every column a chart binds to is the shelf's own label.
  function cfRollupDA(id, name, dsId, shelf) {
    var cols = shelf.map(function (f) { return f.agg ? f.agg.toUpperCase() + " " + f.col : f.col; });
    return { id: id, name: name, kind: "sql", sql: "", query: "",
      columns: cols, params: [], authored: true,
      builder: { dsKind: "ws", dsId: dsId, chartType: "line",
        shelfCols: shelf.map(function (f) { return { col: f.col, agg: f.agg || null }; }),
        shelfRows: [], filters: [], calcs: [], shelfColor: [], paletteKey: "", mapScale: "" } };
  }

  // (1) the hero: the flow, which is what the pack was extracted to draw.
  function campaignFinanceFlowSpec(ds, f) {
    var das = [], panels = [], kpis = [];

    // EVERY panel on this dashboard reads the pack's SECOND job output, not the first.
    // The first is 2,658 rows and the builder's live run keeps 2,000 of them, so a panel
    // bound to it would quietly lose the last twelve committees; the second job trims by
    // a rule instead of by an accident, and the note below says exactly what it cost.
    var flowAllDa = curatedDA("vcf_flow_all", "Campaign Finance — every charted donor state to committee flow",
      ds.charted.id, ["state", "committee", "committee_type", "party", "amount", "pct_of_committee"]);
    das.push(flowAllDa);
    kpis.push({ da: flowAllDa.id, valueCol: "amount", label: "To the 50 largest committees",
      fmt: "money", agg: "sum", subtitle: f.chartedPct.toFixed(1) + "% of what those 50 raised", state: "",
      info: "Itemized individual contributions received by the 50 committees that took the most of them, counted over the flows the pack's second job keeps — everything at or above " + cfMillions(CF_CHART_FLOOR) + ". The first job's table has the rest." });
    kpis.push({ da: flowAllDa.id, valueCol: "amount", label: "Largest single flow",
      fmt: "money", agg: "max", subtitle: "one state to one committee", state: "",
      info: "The biggest donor-state → committee relationship in the extract, in one election cycle." });
    kpis.push({ da: flowAllDa.id, valueCol: "pct_of_committee", label: "Largest share of one committee",
      fmt: "pct", agg: "max", subtitle: "one state's cut", state: "",
      info: "The job divides each state's giving by the committee's own cycle total. This is the highest result — the most concentrated donor-state relationship the pack can see." });

    var bigFlowDa = curatedDA("vcf_flow_big", "Campaign Finance — donor state to committee, the largest flows",
      ds.charted.id, ["state", "committee", "amount", "pct_of_committee"],
      [{ col: "amount", kind: "range", min: String(CF_FLOW_FLOOR), max: "" }]);
    das.push(bigFlowDa);
    panels.push({ id: "pcf_flow", section: "Who funds whom",
      title: "Donor state to recipient committee", span: "full",
      sub: "flows of " + cfMillions(CF_FLOW_FLOOR) + " or more — the band width is the money",
      info: "One ribbon per state-committee pair. The floor is about readability, not significance: all 2,658 pairs at once is a hairball. Open the View and move it.",
      chart: { type: "sankey", da: bigFlowDa.id,
        map: { sourceCol: "state", targetCol: "committee", valueCol: "amount" },
        opts: { srcCap: "Donor state", dstCap: "Recipient committee", fmt: "money", height: 720 } } });

    // is_home_state is a 0/1 the extract denormalized into the flow table (the job engine
    // derives arithmetic and cannot compare two strings), so "the state the candidate is
    // running in" is an ordinary value filter here — the builder's own `in` grammar.
    var homeDa = curatedDA("vcf_home", "Campaign Finance — money from the state the candidate is running in",
      ds.charted.id, ["committee", "state", "party", "amount", "pct_of_committee", "total_amount"],
      [{ col: "is_home_state", kind: "in", values: ["1"] }]);
    das.push(homeDa);
    panels.push({ id: "pcf_home", section: "How much came from home",
      title: "Share of a candidate's itemized money that came from their own state", span: "full",
      sub: "the Senate campaigns in the top 50 — everything else on the bar came from somewhere else",
      info: "The filter is is_home_state = 1, a flag the extract ships because the job engine cannot compare two strings. The three presidential committees are absent by construction: their seat is \"US\", which is not a donor state.",
      chart: { type: "bars", da: homeDa.id, map: { labelCol: "committee", valueCol: "pct_of_committee" },
        opts: { horizontal: true, sortBars: true, showValues: true, fmt: "pct", height: 460 } } });

    var dominantDa = curatedDA("vcf_dominant", "Campaign Finance — states supplying a fifth of a committee",
      ds.charted.id, ["state", "committee", "committee_type", "amount", "pct_of_committee"],
      [{ col: "pct_of_committee", kind: "range", min: String(CF_DOMINANT_PCT), max: "" }]);
    das.push(dominantDa);
    panels.push({ id: "pcf_dominant", section: "The concentrated relationships",
      title: "Where one state supplied a fifth or more of a committee's itemized money", span: "full",
      sub: "share of the committee's whole cycle total, not of the states listed beside it",
      chart: { type: "table", da: dominantDa.id,
        map: { cols: [
          { col: "state", label: "Donor state" },
          { col: "committee", label: "Recipient committee" },
          { col: "committee_type", label: "Kind" },
          { col: "amount", label: "Itemized", num: true, fmt: "money" },
          { col: "pct_of_committee", label: "Share of the committee", num: true, fmt: "pct" }
        ] },
        opts: { pageSize: 12, freezeHeader: true, density: "comfortable" } } });

    panels.push({ id: "pcf_note", section: "How to read it", title: "What this pack is measuring", span: "full",
      chart: { type: "richtext", da: null, opts: { content: [
        "**Itemized individual contributions, one closed cycle.** A committee itemizes a donor once their cycle total passes $200; everything under that is reported as an unitemized lump and is not in this source at all. So these are the dollars the FEC can name a giver for, not all the dollars raised.",
        "",
        "**The kind of committee is a column, not a filter, and that is the whole point.** Restricting recipients to candidate committees looks like the obvious reading of \"who funds the candidates\" and draws a landslide that never happened: one side's earmarked money was itemized directly against the campaign while the other's ran through joint fundraising committees that transfer onward. Same money, different plumbing. Every panel here draws all six kinds together and labels them — **adding a joint fundraiser's total to its participants' is double-counting**, which is why no panel does.",
        "",
        "**Two floors, and they are different in kind.** The panels above sit on the pack's SECOND job, which keeps every state→committee flow of " + cfMillions(CF_CHART_FLOOR) + " or more — **" + f.chartedRows.toLocaleString() + "** of the first job's **" + f.flowRows.toLocaleString() + "** rows, and **" + f.chartedPct.toFixed(1) + "%** of its dollars, with all fifty committees still present. That trim exists because the View Builder runs a dataset live and keeps its first 2,000 rows, and a chart that lost twelve committees to a row limit would look exactly like a chart that had taken a side. The sankey's own " + cfMillions(CF_FLOW_FLOOR) + " floor, on top of it, is about readability alone: open the View and move it.",
        "",
        "- Itemized individual giving, 2023-24: **" + cfBillions(f.total) + "** across **" + f.contributions.toLocaleString() + "** contributions",
        "- Received by the 50 largest committees: **" + cfBillions(f.flowTotal) + "** (**" + f.flowPct.toFixed(1) + "%**), which is the first job's table",
        "- Charted above: **" + cfBillions(f.chartedTotal) + "** of it, the flows of " + cfMillions(CF_CHART_FLOOR) + " or more",
        "",
        "*What this is not:* a measure of who won. It is money raised, not money kept (refunds are dropped rather than netted) and not money spent, and independent expenditure — the spending that never passes through a candidate's committee at all — is a different file."
      ].join("\n") } } });

    return {
      id: "campaignfinance-flow", name: "campaignfinance-flow",
      title: "Who Funds Whom",
      subtitle: "Itemized individual contributions from the state that gave them to the committee that received them, 2023-24 cycle",
      dashboardTheme: "polecat",
      panels: panels, kpis: kpis, filters: [],
      cda: { connections: [], dataAccesses: das }
    };
  }

  // (2) donor geography — the app's state scale, and the two shares as calc columns.
  function campaignFinanceGeographySpec(ds, f) {
    var das = [], panels = [], kpis = [];
    var stateDa = curatedDA("vcg_states", "Campaign Finance — donor states, with the small-gift and max-out shares",
      ds.states.id, ["state", "contributions", "amount", "small_dollar_amount", "small_dollar_pct",
                     "max_out_amount", "max_out_pct"],
      [], [CF_SMALL_PCT_CALC, CF_MAXOUT_PCT_CALC]);
    das.push(stateDa);
    kpis.push({ da: stateDa.id, valueCol: "amount", label: "Itemized individual giving",
      fmt: "money", agg: "sum", subtitle: "2023-24, " + f.states + " donor states and territories", state: "",
      info: "Every itemized individual contribution in the cycle, summed by the state the donor reported. Rows with no two-letter state are excluded from this table and counted in the extract's notes." });
    kpis.push({ da: stateDa.id, valueCol: "amount", label: "The largest donor state",
      fmt: "money", agg: "max", subtitle: "one state, one cycle", state: "",
      info: "Read against the median beside it: political giving concentrates about as hard as income does." });
    kpis.push({ da: stateDa.id, valueCol: "amount", label: "The median donor state",
      fmt: "money", agg: "median", subtitle: "the middle of " + f.states, state: "",
      info: "The middle of the list, including the territories and the overseas military codes — which is why it sits so far below the mean." });
    kpis.push({ da: stateDa.id, valueCol: "small_dollar_pct", label: "Small gifts",
      fmt: "pct", agg: "median", subtitle: "of the median state's dollars", state: "",
      info: "This View's own calculated column: small_dollar_amount ÷ amount. \"Small\" here means a gift under $200 from a donor who was itemized anyway — not the small-dollar donor universe, which this source cannot see." });

    panels.push({ id: "pcg_map", section: "Where the money comes from",
      title: "Itemized individual giving by donor state", span: "full",
      sub: "the donor's own reported state, 2023-24 cycle",
      info: "Colour classes are evenly spaced between the smallest and largest state, so California and Texas hold the top of the scale and most of the map reads as one band. The bars below are how you read the rest of it.",
      chart: { type: "choropleth", da: stateDa.id,
        map: { idCol: "state", valueCol: "amount" },
        opts: { scale: "state", fmt: "money", agg: "sum", classes: 6, height: 460 } } });

    panels.push({ id: "pcg_small", section: "Not every state gives the same way",
      title: "Share of each state's dollars that came in gifts under $200", span: 2,
      sub: "a calculated column on this View — small_dollar_amount ÷ amount",
      info: "The states at the top of this list are not the states at the top of the map. A high share means a state's itemized total is built from many small gifts rather than a few large ones.",
      chart: { type: "bars", da: stateDa.id, map: { labelCol: "state", valueCol: "small_dollar_pct" },
        opts: { horizontal: true, sortBars: true, showValues: false, fmt: "pct", height: 620 } } });

    panels.push({ id: "pcg_maxout", title: "Share that came in max-out gifts", span: 2,
      sub: "the mirror image — max_out_amount ÷ amount, the same " + f.states + " rows",
      info: "A max-out gift is one at or above the per-election limit ($3,300 in this cycle). The two shares are not complements: everything between $200 and $3,300 is in neither.",
      chart: { type: "bars", da: stateDa.id, map: { labelCol: "state", valueCol: "max_out_pct" },
        opts: { horizontal: true, sortBars: true, showValues: false, fmt: "pct", height: 620 } } });

    panels.push({ id: "pcg_scatter", section: "Does a big state give differently?",
      title: "Every state, by what it gave and by how much of it was small", span: 2,
      sub: "one dot per state: total itemized dollars against the small-gift share",
      info: "If large donor states were simply scaled-up small ones, the dots would sit on a flat line. The spread up the y-axis is states with genuinely different giving cultures.",
      chart: { type: "scatter", da: stateDa.id,
        map: { labelCol: "state", xCol: "amount", yCol: "small_dollar_pct" },
        opts: { trend: false, fmt: "abbr", xLabel: "Itemized individual giving",
          yLabel: "Share in gifts under $200 (%)", height: 380 } } });

    panels.push({ id: "pcg_note", title: "What the map leaves out, and why", span: 2,
      chart: { type: "richtext", da: null, opts: { content: [
        "**The state is the donor's, not the candidate's.** Every dollar here is placed where the person who gave it said they live. Where it went is the other dashboard.",
        "",
        "**Sixteen of the " + f.states + " rows are not on the map, and they are left in the data on purpose.** The overseas military codes (AA, AE, AP), the territories (PR, GU, VI, MP, AS, MH, FM, PW), a handful of Canadian provinces typed into the state field, and ZZ for a donor whose state the filer never resolved. The app's state layer has no geometry for any of them, so they colour nothing — but dropping them from the table would quietly change every total on this page.",
        "",
        "- Itemized individual giving: **" + cfBillions(f.total) + "** over **" + f.contributions.toLocaleString() + "** contributions",
        "- In gifts under $200: **" + cfBillions(f.small) + "** (**" + f.smallPct.toFixed(1) + "%** of the dollars, **" + f.smallCountPct.toFixed(1) + "%** of the contributions)",
        "- In max-out gifts: **" + cfBillions(f.maxOut) + "** (**" + f.maxOutPct.toFixed(1) + "%** of the dollars, **" + f.maxOutCountPct.toFixed(1) + "%** of the contributions)",
        "",
        "*That last pair is the finding this dashboard exists for:* nine contributions in ten are small, and they are a fifth of the money."
      ].join("\n") } } });

    return {
      id: "campaignfinance-geography", name: "campaignfinance-geography",
      title: "Where the Money Comes From",
      subtitle: "Itemized individual contributions by the donor's own state, and how differently each state gives",
      dashboardTheme: "polecat",
      panels: panels, kpis: kpis, filters: [],
      cda: { connections: [], dataAccesses: das }
    };
  }

  // (3) who gives it, and how it arrives.
  function campaignFinanceDonorsSpec(ds, f) {
    var das = [], panels = [], kpis = [];

    var bandsDa = curatedDA("vcd_bands", "Campaign Finance — contributions by size band and committee kind",
      ds.bands.id, ["band", "committee_type", "contributions", "amount"]);
    das.push(bandsDa);
    kpis.push({ da: bandsDa.id, valueCol: "amount", label: "Itemized to every kind of committee",
      fmt: "money", agg: "sum", subtitle: "the same " + cfBillions(f.total) + ", cut by cheque size", state: "",
      info: "The size-band table covers the whole cycle, so it sums to the donor-state table's total apart from the contributions whose donor state the filer never typed — those have no state row to sit in. Both round to the same $6.5B, which is a useful thing to check when you open either one." });
    kpis.push({ da: bandsDa.id, valueCol: "contributions", label: "Contributions",
      fmt: "n", agg: "sum", subtitle: f.smallCountPct.toFixed(1) + "% of them under $200", state: "",
      info: "Counted, not estimated: every itemized individual contribution the FEC published for the cycle." });
    kpis.push({ da: bandsDa.id, valueCol: "amount", label: "Largest single band",
      fmt: "money", agg: "max", subtitle: "one band, one kind of committee", state: "",
      info: "The biggest cell of the band × committee-kind grid the marimekko below draws." });

    panels.push({ id: "pcd_bands", section: "How the money arrives",
      title: "Cheque size against the kind of committee that received it", span: "full",
      sub: "column width is the band's share of the money; the stack inside it is which committees got it",
      info: "A marimekko carries both facts at once, which is what this table is for: the widest column is the money, and the segments say the giving cultures behind it differ by band.",
      chart: { type: "marimekko", da: bandsDa.id,
        map: { labelCol: "band", groupCol: "committee_type", valueCol: "amount" },
        opts: { fmt: "money", showPct: true, height: 420 } } });

    var monthlyDa = curatedDA("vcd_monthly", "Campaign Finance — itemized giving by month and committee kind",
      ds.monthly.id, ["month", "committee_type", "contributions", "amount"]);
    das.push(monthlyDa);
    // A LINE, NOT THE PIVOT THIS PANEL WAS FIRST WRITTEN AS, and the reason is measured.
    // The toolkit's heatmap divides the width it is given between its columns after
    // reserving a 130px label gutter (vendor/dashkit.js: cw = (w - labelW - mR)/cols) and
    // never clamps the result, and a panel's FIRST paint happens while its body is 28px
    // wide — so a month × committee-kind heatmap emitted 336 negative-width rects per
    // render, which the suite counts as console errors. Vertical bars divide width the
    // same way and fail the same test; horizontal bars and a line divide the HEIGHT and
    // are fine. The clamp is a real fix, it belongs to the toolkit rather than to a pack
    // slice (vendor/dashkit.js is pristine by invariant), and it is recorded in the SP-5
    // item for Kevin to rank. The pack draws the cycle as a cycle in the meantime.
    var monthTotalDa = cfRollupDA("vcd_month_total", "Campaign Finance — itemized giving by month",
      ds.monthly.id, [{ col: "month" }, { col: "amount", agg: "sum" }]);
    das.push(monthTotalDa);
    panels.push({ id: "pcd_months", section: "When it arrives",
      title: "The shape of an election cycle", span: "full",
      sub: "every month from January 2023 to December 2024, all committees together",
      info: "The View rolls the monthly table up with a SUM shelf, which is why the series reads \"SUM amount\" — open it and the shelf is the first thing you see. Rows carrying a transaction date outside the cycle (filer typos reaching the 1990s and the 2080s) are excluded from this table only.",
      chart: { type: "line", da: monthTotalDa.id,
        map: { labelCol: "month", series: ["SUM amount"] },
        opts: { area: true, smooth: false, showDots: true, fmt: "abbr", height: 360 } } });

    var occDa = curatedDA("vcd_occupations", "Campaign Finance — the largest donor occupations",
      ds.occupations.id, ["occupation", "contributions", "amount"],
      [{ col: "amount", kind: "range", min: String(CF_OCCUPATION_FLOOR), max: "" }]);
    das.push(occDa);
    panels.push({ id: "pcd_occ", section: "Who gives it",
      title: "Donor occupations above " + cfMillions(CF_OCCUPATION_FLOOR), span: 2,
      sub: "free text the donor's own filer typed — the floor is on the View, so move it",
      info: "Upper-cased with punctuation and whitespace collapsed, and nothing more: \"SELF-EMPLOYED\" and \"SELF EMPLOYED\" merge, while \"RETIRED\" and \"NOT EMPLOYED\" stay apart. A synonym table would be an editorial judgement the extract cannot defend.",
      chart: { type: "bars", da: occDa.id, map: { labelCol: "occupation", valueCol: "amount" },
        opts: { horizontal: true, sortBars: true, showValues: false, fmt: "money", height: 420 } } });

    var empDa = curatedDA("vcd_employers", "Campaign Finance — the largest donor employers",
      ds.employers.id, ["employer", "contributions", "amount"],
      [{ col: "amount", kind: "range", min: String(CF_EMPLOYER_FLOOR), max: "" }]);
    das.push(empDa);
    panels.push({ id: "pcd_emp", title: "Donor employers above " + cfMillions(CF_EMPLOYER_FLOOR), span: 2,
      sub: "and the top of this list is the finding — see the note below",
      info: "The same free-text treatment as occupation. Named employers begin well down the list, which is what the note beside this panel is about.",
      chart: { type: "bars", da: empDa.id, map: { labelCol: "employer", valueCol: "amount" },
        opts: { horizontal: true, sortBars: true, showValues: false, fmt: "money", height: 420 } } });

    panels.push({ id: "pcd_note", section: "How to read it", title: "Two fields nobody validates", span: "full",
      chart: { type: "richtext", da: null, opts: { content: [
        "**Occupation and employer are free text.** The FEC requires a committee to ask for both and to report what it is told; nothing checks the answer. So the largest \"employers\" in this cycle are RETIRED, NOT EMPLOYED and SELF EMPLOYED — which are not employers at all, but what people type when they have none. Any read of this table that skips that fact gets the ranking of real firms wrong by three places.",
        "",
        "**The size bands are where the shape of the money is.** Nine contributions in ten are under $200 and they are a fifth of the dollars; the gifts at or above the per-election limit are a fraction of one percent of the contributions and over two-fifths of the dollars.",
        "",
        "- Under $200: **" + cfBillions(f.small) + "** (**" + f.smallPct.toFixed(1) + "%** of dollars) from **" + f.smallCountPct.toFixed(1) + "%** of contributions",
        "- At or above the per-election limit: **" + cfBillions(f.maxOut) + "** (**" + f.maxOutPct.toFixed(1) + "%** of dollars) from **" + f.maxOutCountPct.toFixed(1) + "%** of contributions",
        "",
        "*And the threshold under all of it:* a donor is itemized only once their cycle total passes $200, so the \"small\" gifts here belong to donors who gave enough in total to be named. The genuinely small-dollar universe is reported as a lump sum and is not in this file."
      ].join("\n") } } });

    return {
      id: "campaignfinance-donors", name: "campaignfinance-donors",
      title: "Who Gives It, and How",
      subtitle: "Itemized individual contributions by occupation, employer, cheque size and month of the 2023-24 cycle",
      dashboardTheme: "polecat",
      panels: panels, kpis: kpis, filters: [],
      cda: { connections: [], dataAccesses: das }
    };
  }

  // Idempotent by dashboard name (the CONS-1 convention SP-1 and SP-6 also follow), so it
  // is safe from the seed, from the boot heal, and from a workspace where someone deleted
  // one of the three.
  function seedCampaignFinanceDashboards(W, id, ds, now) {
    if (!ds || !ds.states || !ds.occupations || !ds.employers || !ds.monthly || !ds.bands ||
        !ds.output || !ds.charted) return 0;
    // The figures are read back off the rows that were just written rather than taken as
    // arguments: the seed path and the boot heal then cannot disagree about what the pack
    // says about itself.
    var f = campaignFinanceFigures(parsePackCsv(ds.states.content), parsePackCsv(ds.output.content),
      parsePackCsv(ds.charted.content));
    if (!f.states || !f.total || !f.flowTotal || !f.chartedRows) return 0; // nothing to state honestly, so state nothing
    var specs = {
      "campaignfinance-donors": campaignFinanceDonorsSpec(ds, f),
      "campaignfinance-geography": campaignFinanceGeographySpec(ds, f),
      "campaignfinance-flow": campaignFinanceFlowSpec(ds, f)
    };
    var added = 0;
    CF_DASHBOARDS.forEach(function (name) {
      var have = W.all("dashboards").some(function (r) {
        return r.demoPackId === id && (r.name === name || (r.spec && r.spec.name) === name);
      });
      if (have) return;
      var spec = specs[name];
      W.put("dashboards", {
        name: name, title: spec.title, ts: now, spec: spec,
        folder: CF_FOLDER, demoPackId: id
      });
      added++;
    });
    return added;
  }

  // The boot heal (studio.js reconcilePackDashboards): a workspace that installed the
  // pack when it was slice (a) — the seven tables and the share job, no dashboards — gets
  // them without a reinstall, and so does one where a dashboard was deleted. Returns false
  // when there is nothing to do, including the legitimate "data hasn't materialized yet"
  // case: the seed path above writes the dashboards itself the moment the datasets exist.
  // The pack's tables as the seed path names them, found in a workspace rather than
  // threaded through — the same lookup BOTH boot heals need, so it is written once
  // (the SP-6 shape). Returns null unless every table the seeders read is present WITH
  // content: a half-materialized pack has nothing honest to chart, and both callers
  // treat that as "nothing to do" rather than an error.
  function campaignFinanceDatasets(W, id) {
    var mine = W.all("datasets").filter(function (d) { return d.demoPackId === id && d.content; });
    function byFile(name) {
      return mine.filter(function (d) { return (d.fileName || "") === name; })[0];
    }
    var ds = {
      states: byFile(CF_STATES), committees: byFile(CF_COMMITTEES),
      occupations: byFile(CF_OCCUPATIONS), employers: byFile(CF_EMPLOYERS),
      monthly: byFile(CF_MONTHLY), bands: byFile(CF_BANDS),
      // Both job outputs are looked up by their own file name rather than by the
      // job-output tag, which both of them carry.
      output: byFile("committee_donor_state_shares.csv"),
      charted: byFile("committee_donor_state_flows_charted.csv")
    };
    return (ds.states && ds.occupations && ds.employers && ds.monthly && ds.bands &&
      ds.output && ds.charted) ? ds : null;
  }

  Studio.ensureCampaignFinanceDashboards = function () {
    var id = "campaignfinance";
    if (!Studio.demoPackInstalled(id)) return false;
    var W = Studio.Workspace;
    var ds = campaignFinanceDatasets(W, id);
    if (!ds) return false;
    return seedCampaignFinanceDashboards(W, id, ds, new Date().toISOString()) > 0;
  };

  /* ---- SP-5 (c): the pack's four pinned Views ----------------------------------------
     A dashboard is a finished argument; a View is the thing you open and change. SP-1
     set the convention and SP-6 repeated it, and this pack follows it exactly: author
     each View the way `bdSave` would — compute the basis with the pure
     `Studio.Build.compute`, then `Studio.newPanel` over the resulting columns — so a
     seeded View and one saved by hand in the View Builder are the same shape and open
     in the same editor. Only the basis HEAD is read here; the rows a pinned card draws
     come from `Studio.Build.runBlob` against the live dataset on every render (#118),
     which is why every subset below is the View's OWN filter rather than a second,
     hand-cut dataset — open it and the rule is right there on the shelf to move.

     THE FOUR are the pack's question asked from its four sides, in the order Home
     shows them:
       1. WHO FUNDS WHOM  — the flow, donor state → recipient committee, as a sankey
       2. HOW MUCH CAME FROM HOME — each Senate campaign's own-state share
       3. WHERE IT COMES FROM — donor geography on the app's state scale
       4. HOW IT ARRIVES  — every donor state with both derived shares as calc columns

     Two things this pack's Views inherit from its dashboards rather than reinvent, and
     both are the pack's argument rather than decoration. The flow Views read the
     SECOND job's output (`charted`), never the first: the join is 2,658 rows and the
     builder's live run keeps 2,000 of them, so a View bound to the join would lose the
     last twelve committees — including both Trump committees — silently, which is the
     partisan artifact slice (a) went out of its way to avoid. And the two shares on the
     state table are CALC COLUMNS on the View, not extract columns: the extract ships
     the dollar figures and deliberately not their ratios, so opening the View is how
     you see the arithmetic.

     One honest limit, stated rather than hidden: the measure column of a rolled-up
     basis is named by the pivot ("SUM amount"), so that is what these Views' columns
     are called. It is the same label the builder writes for a View you save yourself —
     a seeded View that quietly used a prettier name would be the odd one out, and the
     number underneath is the same either way. */
  function campaignFinanceViewDefs(ds) {
    return [
      {
        // The hero, and the flow the pack was extracted to draw. The floor is the
        // dashboard's own CF_FLOW_FLOOR — a READABILITY floor, not a significance one
        // (a sankey lays its nodes out with an 11px gap, so the limit is the node
        // count), and here it is a filter chip one drag from gone.
        key: "flow", dsId: ds.charted.id,
        name: "Campaign Finance — donor state to recipient committee, flows of " +
          cfMillions(CF_FLOW_FLOOR) + " or more",
        chartType: "sankey",
        shelfRows: [{ col: "state" }],
        shelfCols: [{ col: "committee", agg: null }, { col: "amount", agg: "sum" }],
        filters: [{ col: "amount", kind: "range", min: String(CF_FLOW_FLOOR), max: "" }],
        opts: { srcCap: "Donor state", dstCap: "Recipient committee", fmt: "money", height: 520 }
      },
      {
        // is_home_state is a 0/1 the extract denormalized into the flow table (the job
        // engine derives arithmetic and cannot compare two strings), so "the state the
        // candidate is running in" is an ordinary value filter — the builder's own `in`
        // grammar. One row per committee survives it, so AVG is that committee's share.
        key: "home_state", dsId: ds.charted.id,
        name: "Campaign Finance — share of a candidate's itemized money that came from their own state",
        chartType: "bars",
        shelfRows: [],
        shelfCols: [{ col: "committee", agg: null }, { col: "pct_of_committee", agg: "avg" }],
        filters: [{ col: "is_home_state", kind: "in", values: ["1"] }],
        opts: { horizontal: true, sortBars: true, showValues: true, fmt: "pct", height: 460 }
      },
      {
        // The donor's own reported state, on the app's built-in state geometry. Sixteen
        // of the rows have no geometry (the overseas military codes, the territories, a
        // few Canadian provinces typed into the field, and ZZ) and they are left in on
        // purpose: they colour nothing, and dropping them would change every total.
        key: "states", dsId: ds.states.id,
        name: "Campaign Finance — itemized individual giving by donor state",
        chartType: "choropleth", mapScale: "state",
        shelfRows: [],
        shelfCols: [{ col: "state", agg: null }, { col: "amount", agg: "sum" }],
        opts: { scale: "state", fmt: "money", agg: "sum", classes: 6, height: 320 }
      },
      {
        // Every donor state rather than the map's top class — because the finding the
        // map cannot show (a linear colour scale over a power law) is exactly the one a
        // sortable table can. Both shares are calc columns for the reason above.
        key: "how_it_arrives", dsId: ds.states.id,
        name: "Campaign Finance — every donor state, by what it gave and how it arrived",
        chartType: "table",
        shelfRows: [],
        shelfCols: ["state", "contributions", "amount", CF_SMALL_PCT_CALC.name, CF_MAXOUT_PCT_CALC.name]
          .map(function (c) { return { col: c, agg: null }; }),
        calcs: [CF_SMALL_PCT_CALC, CF_MAXOUT_PCT_CALC],
        tableCols: [
          { col: "state", label: "Donor state" },
          { col: "contributions", label: "Contributions", num: true, fmt: "n" },
          { col: "amount", label: "Itemized", num: true, fmt: "money" },
          { col: CF_SMALL_PCT_CALC.name, label: "In gifts under $200", num: true, fmt: "pct" },
          { col: CF_MAXOUT_PCT_CALC.name, label: "In max-out gifts", num: true, fmt: "pct" }
        ],
        opts: { pageSize: 12, freezeHeader: true, density: "comfortable" }
      }
    ];
  }
  // The pivot a given chart type's basis is actually computed from — chartBasis's own
  // rule, mirrored here because the seed runs without a builder state to ask. Only the
  // shapes this pack uses are covered, and the sankey one is the interesting case: its
  // basis is the flat triple [source, target, measure], NOT a crosstab, so the Rows
  // field is folded into the Columns pivot exactly the way app/build.js does it.
  function campaignFinanceBasisShelf(def) {
    if (def.chartType === "sankey") {
      return [{ col: def.shelfRows[0].col, agg: null }].concat(def.shelfCols);
    }
    return def.shelfCols;
  }
  function campaignFinanceViewRow(def, table) {
    var blob = {
      dsKind: "ws", dsId: def.dsId, chartType: def.chartType,
      shelfCols: Studio.clone(def.shelfCols), shelfRows: Studio.clone(def.shelfRows || []),
      filters: Studio.clone(def.filters || []), calcs: Studio.clone(def.calcs || []),
      shelfColor: [], paletteKey: "", mapScale: def.mapScale || ""
    };
    // Calc columns first — a shelf can name one, so the basis has to be computed over
    // the EFFECTIVE columns (bdEff's rule), not the raw CSV's. Over the UNFILTERED rows
    // on purpose, the same as SP-1 and SP-6: a filter changes which rows come back,
    // never which columns do, and only the head is wanted here (the rows are runBlob's
    // job).
    var eff = Studio.applyCalcCols(table.columns, table.rows, (def.calcs || []).map(function (c) {
      return { name: c.name, formula: c.formula, type: "Numeric" };
    }));
    var basis = Studio.Build.compute(eff.cols, eff.rows, campaignFinanceBasisShelf(def), []);
    if (!basis || basis.head.length < 2) return null;
    var da = { id: "cfv_" + def.key, name: def.name, kind: "sql", sql: "", query: "",
      columns: basis.head.slice(), params: [], authored: true };
    da.builder = Studio.clone(blob);
    var p = Studio.newPanel(def.chartType, da);
    if (def.chartType === "choropleth") {
      // bdPanelFor's reason, verbatim: the measure column here is a synthesized "SUM
      // amount" label and Studio.guessChoroplethCols can misjudge one, so the basis is
      // mapped back POSITIONALLY the same way chartBasis built it — [id, value].
      p.chart.map = { idCol: basis.head[0], valueCol: basis.head[1] };
    }
    // newPanel's table default marks every column after the first numeric and titleizes
    // its label — right for an ad-hoc pivot, wrong for `state`. Declared columns win.
    if (def.tableCols) p.chart.map.cols = Studio.clone(def.tableCols);
    if (def.opts) Object.keys(def.opts).forEach(function (k) { p.chart.opts[k] = def.opts[k]; });
    return {
      name: def.name, folder: CF_FOLDER, demoPackId: "campaignfinance",
      pinned: true, panelTitle: "", chartType: def.chartType, paletteKey: "",
      da: da, builder: Studio.clone(blob), chart: p.chart
    };
  }
  // Idempotent by View name, the convention every seeder in this file uses, so it is
  // safe from the seed, from the boot heal, and in a workspace where someone deleted one.
  function seedCampaignFinanceViews(W, id, ds) {
    if (!ds) return 0;
    var tables = {};
    var have = {};
    W.all("analyses").forEach(function (r) { if (r.demoPackId === id) have[r.name] = true; });
    var added = 0;
    // Seeded in REVERSE of the reading order above: Home sorts pinned Views newest-first,
    // so the flow hero has to be the last row written to lead the shelf (the CONS-2/
    // CONS-3 convention the dashboards are seeded by too).
    campaignFinanceViewDefs(ds).slice().reverse().forEach(function (def) {
      if (have[def.name]) return;
      // Parsed once per dataset, not once per View — the four share two tables.
      if (!tables[def.dsId]) {
        var row = W.get("datasets", def.dsId);
        tables[def.dsId] = parsePackCsv((row && row.content) || "");
      }
      var t = tables[def.dsId];
      if (!t || !t.rows.length) return;
      var view = campaignFinanceViewRow(def, t);
      if (!view) return;
      W.put("analyses", view);
      added++;
    });
    return added;
  }
  // The boot heal, paired with ensureCampaignFinanceDashboards above and for the same
  // reason: a workspace that installed the pack at slice (a) or (b) gets the Views
  // without a reinstall. False when there is nothing to do.
  Studio.ensureCampaignFinanceViews = function () {
    var id = "campaignfinance";
    if (!Studio.demoPackInstalled(id)) return false;
    var W = Studio.Workspace;
    return seedCampaignFinanceViews(W, id, campaignFinanceDatasets(W, id)) > 0;
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
