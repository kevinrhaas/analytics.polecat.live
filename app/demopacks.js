/* Analytics — © 2026 Polecat.live. See LICENSE. */
/* app/demopacks.js — Demo packs (Viridis V7): a SECOND sample library,
   separate from the CDA catalog, of one-click install/remove workspace
   content built for a specific pitch (here: the Viridis View geo-analytics
   RFP). Installing a pack writes ordinary workspace rows (a connection, a
   dataset, analyses, a dashboard) tagged with `demoPackId` so Remove can find
   and delete exactly what Install wrote — everything downstream (Explore,
   the Studio canvas, Home) is the SAME machinery every other workspace row
   already uses, nothing pack-specific to maintain there.

   All pack content is SYNTHETIC and says so in its own titles/subtitles —
   this is a sales-demo fixture, not real provider or AgCensus data. */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  var PROVIDERS = ["DTN", "Indigo Ag", "Iowa State", "Regrow", "Terra Diagnostics"];
  var PRACTICES = [
    { key: "coverCrops", label: "Cover crops" },
    { key: "noTill", label: "No-till" },
    { key: "reducedTill", label: "Reduced tillage" },
    { key: "conventional", label: "Conventional" }
  ];

  Studio.DEMO_PACKS = {
    viridis: {
      id: "viridis",
      name: "Viridis View — cover crop & tillage adoption",
      tagline: "5-provider ensemble + county map · illustrative Corn Belt sample",
      blurb: "Installs a raw provider-file dataset (a mapping walkthrough), four ensemble " +
        "time-series analyses — one per practice, pinned to Home — and a featured multi-panel " +
        "“Viridis View” dashboard pairing them with a county choropleth. All data is " +
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

  // ---- the raw provider export — the "file-connection with mapping demo" ----
  // Deliberately RAW column names (not the app's labelCol/seriesCol/valueCol
  // vocabulary), so opening it in Explore/Datasets demonstrates mapping a
  // real-world export onto chart roles, exactly like a prospect's own file.
  function viridisRawCsv() {
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

  function timeSeriesDA(id, practice) {
    return { id: id, name: "Viridis — " + practice.label + " ensemble (demo)", kind: "sql", columns: ["year", "provider", "pct"], authored: true };
  }
  function geoDA(id) {
    return { id: id, name: "Viridis — county snapshot (demo)", kind: "sql", columns: ["fips", "provider", "pct"], authored: true };
  }
  function ensembleChart(daId) {
    return { type: "ensembleSeries", da: daId,
      map: { labelCol: "year", seriesCol: "provider", valueCol: "pct" },
      opts: { refSeries: "AgCensus", fmt: "pct", medianLabel: "Common estimate", height: 260 } };
  }

  function analysisRow(practice) {
    var da = timeSeriesDA("vrd_" + practice.key, practice);
    return {
      name: "Viridis — " + practice.label + " (illustrative demo)",
      datasetId: null, sample: null,
      da: da, chart: ensembleChart(da.id), chartType: "ensembleSeries",
      pinned: true, demoPackId: "viridis"
    };
  }

  function dashboardSpec() {
    var das = [], panels = [];
    PRACTICES.forEach(function (p) {
      var da = timeSeriesDA("vv_" + p.key, p);
      das.push(da);
      panels.push({ id: "p_" + p.key, title: p.label, span: 2, chart: ensembleChart(da.id) });
    });
    var geo = geoDA("vv_geo");
    das.push(geo);
    panels.push({
      id: "p_map", title: "County snapshot — common estimate across practices", span: "full",
      chart: { type: "choropleth", da: geo.id,
        map: { idCol: "fips", valueCol: "pct", seriesCol: "provider" },
        opts: { scale: "county", fmt: "pct", agg: "median" } }
    });
    return {
      id: "viridis-view-demo", name: "viridis-view-demo",
      title: "Viridis View — cover crop & tillage adoption (illustrative demo)",
      subtitle: "Synthetic Corn Belt sample data — a common estimate across DTN, Indigo Ag, Iowa State, Regrow & Terra Diagnostics",
      panels: panels, kpis: [], filters: [],
      cda: { connections: [], dataAccesses: das }
    };
  }

  Studio.installDemoPack = function (id) {
    if (id !== "viridis" || Studio.demoPackInstalled(id)) return;
    var W = Studio.Workspace;
    var conn = W.put("connections", { name: "Viridis demo file", adapter: "file", cfg: {}, demoPackId: id });
    W.put("datasets", {
      name: "Viridis — raw provider export (demo)", connectionId: conn.id,
      kind: "file", format: "csv", fileName: "viridis-provider-export-demo.csv",
      content: viridisRawCsv(), demoPackId: id, tags: ["demo", "viridis"]
    });
    PRACTICES.forEach(function (p) { W.put("analyses", analysisRow(p)); });
    W.put("dashboards", {
      name: "viridis-view-demo",
      title: "Viridis View — cover crop & tillage adoption (illustrative demo)",
      ts: new Date().toISOString(), spec: dashboardSpec(),
      featured: true, featuredAt: new Date().toISOString(), demoPackId: id
    });
    setInstalledIds(installedIds().concat([id]));
  };

  Studio.removeDemoPack = function (id) {
    var W = Studio.Workspace;
    ["connections", "datasets", "analyses", "dashboards"].forEach(function (t) {
      W.all(t).filter(function (r) { return r.demoPackId === id; }).forEach(function (r) { W.remove(t, r.id); });
    });
    setInstalledIds(installedIds().filter(function (x) { return x !== id; }));
  };

  window.__studioDemoPacks = { // test hook
    packs: Studio.DEMO_PACKS, installed: Studio.demoPackInstalled,
    install: Studio.installDemoPack, remove: Studio.removeDemoPack
  };
}());
