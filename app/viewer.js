/* app/viewer.js — boot script for app/viewer.html (LF23 slice 1).
   Reads ?dash=<id> straight off Studio.Workspace (the same local-first store
   Home/Dashboards already read) and renders it through Studio.buildHtml the
   exact way a real "Export dashboard (.html)" does — preview:false, no mock —
   so what you see here is the dashboard's actual saved/live data, fully
   interactive (filters, cross-filter, provider toggles all work; it's the
   same renderer, just with no builder chrome around it since this page never
   loads app/studio.js or app/shell.js at all). */
(function () {
  "use strict";
  function $(s) { return document.querySelector(s); }
  function fetchText(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u + " " + r.status); return r.text(); }); }

  // Mirrors studio.js's currentUserId/currentUserIsAdmin/isVisibleToMe (M4.2
  // object privacy) — duplicated here in miniature since studio.js is a
  // builder-only module never loaded on this page. Privacy stays UI-level
  // ("honest, not cryptographic isolation" — STATUS.md decision #3) either way.
  function currentUserId() {
    var Auth = window.PolecatAuth, me = Auth && Auth.current();
    return me ? (me.gotrueId || me.u) : null;
  }
  function currentUserIsAdmin() {
    var Auth = window.PolecatAuth, me = Auth && Auth.current();
    return !Auth || !me || me.role === "admin";
  }
  // LF23 slice 2: mirrors studio.js's own currentUserCanDevelop() duplicate-in-
  // miniature, same reason as the other mirrored helpers above — studio.js is
  // never loaded on this standalone page. Gates the "Edit in Studio" handoff link.
  function currentUserCanDevelop() {
    var Auth = window.PolecatAuth, me = Auth && Auth.current();
    return !Auth || !me || Auth.canDevelop(me);
  }
  function isVisibleToMe(r) {
    if (!r.private) return true;
    if (currentUserIsAdmin()) return true;
    var uid = currentUserId();
    return !!uid && r.owner === uid;
  }

  function showNotFound() {
    var stage = $("#viewerStage");
    if (stage) stage.classList.add("viewer-empty-active");
    document.title = "Dashboard not found · Analytics";
  }

  // Same lazy geo/GL-asset fetch as app/studio.js's ensureGeoAssets, duplicated
  // here — that function closes over the builder's own S.assets state, which
  // doesn't exist on this standalone page.
  var GEO_FILES = {
    county: "vendor/geo/counties-albers-10m.json", state: "vendor/geo/states-albers-10m.json",
    huc8: "vendor/geo/us-huc8-albers.json", cd: "vendor/geo/us-cd-albers.json",
    zcta: "vendor/geo/us-zcta-albers.json", crdMap: "vendor/geo/us-crd-counties.json"
  };
  function ensureGeoAssets(spec, assets) {
    var keys = Studio.geoAssetKeys(spec);
    if (!keys.length) return Promise.resolve();
    assets.geo = assets.geo || {};
    var jobs = keys.filter(function (k) { return !assets.geo[k]; })
      .map(function (k) { return fetchText(GEO_FILES[k]).then(function (t) { assets.geo[k] = t; }); });
    if (!assets.topojson) jobs.push(fetchText("vendor/geo/topojson-client.min.js").then(function (t) { assets.topojson = t; }));
    if (Studio.usesGLMap(spec) && !assets.maplibre) {
      jobs.push(Promise.all([fetchText("vendor/maplibre/maplibre-gl.js"), fetchText("vendor/maplibre/maplibre-gl.css")])
        .then(function (r) { assets.maplibre = { js: r[0], css: r[1] }; }));
    }
    return Promise.all(jobs);
  }

  function hydrateIcons() {
    if (!window.Studio || !Studio.icon) return;
    Array.prototype.forEach.call(document.querySelectorAll("[data-ic]"), function (el) {
      el.appendChild(Studio.icon(el.getAttribute("data-ic"), 14));
    });
  }

  // LF23 slice 2: forks the dashboard's SAVED spec into a brand-new dashboard this
  // account owns — the same shape Studio's own "Save as…" (forkSpecAs, app/studio.js)
  // writes, just without Studio loaded to call that function from this standalone
  // page. NOTE: this is the saved spec, not the iframe's live in-session filter/
  // cross-filter clicks — studio-render.js's postMessage protocol only reports EDIT
  // actions today (select/reorder/resize/…), not filter state, so capturing "exactly
  // what you're looking at right now" is a follow-up (would need a new wire format
  // there); saving the dashboard as-configured is still a real, useful copy meanwhile.
  function saveCopy(row) {
    var spec = Studio.clone(row.spec);
    spec.id = Studio.uid("dash");
    spec.title = (spec.title || spec.name || "Untitled") + " (copy)";
    var entry = { id: spec.id, ts: new Date().toISOString(), spec: spec, title: spec.title, name: spec.name || "" };
    var uid = currentUserId();
    if (uid) entry.owner = uid;
    Studio.Workspace.put("dashboards", entry);
    return entry.id;
  }

  // Edit-in-Studio (canDevelop() accounts only) hands off to app/index.html's own
  // ?edit=<id> boot handling (app/studio.js), which re-checks canDevelop()/
  // isVisibleToMe() itself rather than trusting this link. Save-a-copy is offered to
  // EVERYONE, including viewers — "interact + save-a-copy" is exactly what the
  // viewer role is FOR (STATUS.md's LF23 role model).
  function wireActions(row, id) {
    var editLink = $("#viewerEditLink");
    if (editLink && currentUserCanDevelop()) {
      editLink.href = "app/?edit=" + encodeURIComponent(id);
      editLink.hidden = false;
    }
    var copyBtn = $("#viewerSaveCopy");
    if (copyBtn) {
      copyBtn.hidden = false;
      copyBtn.onclick = function () {
        copyBtn.disabled = true;
        var newId = saveCopy(row);
        location.href = "app/viewer.html?dash=" + encodeURIComponent(newId);
      };
    }
  }

  function boot() {
    hydrateIcons();
    var id = new URLSearchParams(location.search).get("dash");
    var row = id && Studio.Workspace.get("dashboards", id);
    if (!row || !row.spec || !isVisibleToMe(row)) { showNotFound(); return; }
    var spec = row.spec, title = spec.title || spec.name || "Untitled";
    document.title = title + " · Analytics";
    var titleEl = $("#viewerTitle"); if (titleEl) titleEl.textContent = title;
    wireActions(row, id);
    Promise.all([
      fetchText("vendor/pdc-ui.css"), fetchText("vendor/pdc-ui.js"), fetchText("app/studio-render.js"),
      fetchText("app/studio-charts.js"), fetchText("app/duckdb.js"), fetchText("app/sqlitehttp.js"),
      fetchText("app/snowflake.js"), fetchText("app/databricks.js"), fetchText("app/bigquery.js"),
      fetchText("app/genericsql.js"), fetchText("app/icons.js")
    ]).then(function (r) {
      var assets = {
        css: r[0], js: r[1], render: r[2], charts: r[3], duckdb: r[4], httpvfs: r[5],
        snowflake: r[6], databricks: r[7], bigquery: r[8], genericsql: r[9], icons: r[10]
      };
      return ensureGeoAssets(spec, assets).then(function () { return assets; });
    }).then(function (assets) {
      var html = Studio.buildHtml(spec, assets, { preview: false, launcher: false });
      var ifr = $("#viewerFrame"); if (ifr) ifr.srcdoc = html;
    }).catch(function () { showNotFound(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  window.__viewerBoot = boot; // test hook
})();
