/* ============================================================================
   views.js — LF57 slice 1: the "Views" rail section, a dedicated browse/manage
   catalog for saved Views (the workspace `analyses` table — the reusable
   charts/KPIs/maps built in Explore). Concrete realization of #29 (Explore =
   simple View builder; Repository = advanced cross-object manager; Views =
   the dedicated browse/manage section) — see STATUS.md LF57.
   Follows the exact catalog-section shape Datasets/Connections/Jobs already
   established (app/datasets.js et al.): list + tile view toggle (LF51), a
   single-select folder facet (LF56's folder-pilot convention), search, and
   per-row actions. A View is still authored/edited in Explore — this module
   is a pure browse/filter/render layer over the SAME `analyses` store
   Explore already owns, calling straight into Studio.Explore's own exported
   methods (loadAnalysis/togglePin/togglePrivate/openAddToExistingDashboardPicker/
   startNew) rather than duplicating any of that logic, so pin/private/delete
   state can never drift from Explore's own sidebar.
   Named Studio.ViewsCatalog (not Studio.Views) to avoid colliding with the
   pre-existing "saved view" (search/filter preset) concept `makeViewsStore`
   already uses on every other catalog section — a preset-of-Views facility
   is deliberately NOT offered in this slice to keep that naming honest.
   Loads after explore.js + workspace.js, before studio.js (app/index.html).
   ============================================================================ */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};
  function esc(s) { return Studio.escapeHtml(s); }

  // D holds every studio.js-private helper this module needs, injected once
  // via configure() — same one-bundled-call shape as datasets.js/connections.js.
  var D = null;
  function configure(deps) { D = deps; }
  function $(sel, root) { return D.$(sel, root); }
  function $$(sel, root) { return D.$$(sel, root); }
  function toast(msg, isErr, celebrate) { return D.toast(msg, isErr, celebrate); }
  function isVisibleToMe(r) { return D.isVisibleToMe(r); }

  // Multi-select by chart type (mirrors Datasets' by-adapter facet). Folder is a
  // single-select facet, same "don't show an empty facet until something's filed"
  // convention as every other catalog section's folder pilot.
  var _vwTypeFilter = {};
  var _vwFolderFilter = "";
  var _vwViewMode = "list";
  try { _vwViewMode = localStorage.getItem("studio-vwc-view") || "list"; } catch (e) {}

  function vwChartLabel(t) { return (Studio.CHARTS[t] || {}).label || t; }
  // LF57 follow-up: a per-chart-type row icon, reusing the same themed gallery-thumbnail
  // SVGs (Studio.CHART_SVG + studio.js's live-theme-aware themedChartSvg, injected via
  // configure()) the chart-type picker and dashboard-mockup preview already draw from —
  // one visual language for "what kind of chart is this" everywhere in the app, instead of
  // authoring a second single-color icon set. Falls back to the generic trend-up glyph for
  // any type with no gallery thumbnail (there's currently exactly one: colorScale).
  function vwTypeIcon(t) {
    var svg = D.themedChartSvg(Studio.CHART_SVG[t], t);
    if (!svg) return null;
    return svg.replace('<svg ', '<svg width="20" height="14" preserveAspectRatio="xMidYMid meet" ');
  }

  function renderViews() {
    var results = $("#viewsResults"); if (!results) return;
    // LF51 (d): wire the persistent list/tile toggle (lives in the section header,
    // outside #viewsResults, so this idempotent binding survives every re-render).
    var vt = $("#viewsViewToggle");
    if (vt) {
      var tilesNow = _vwViewMode === "tiles";
      vt.textContent = tilesNow ? "List view" : "Tile view";
      vt.setAttribute("aria-pressed", tilesNow ? "true" : "false");
      vt.onclick = function () {
        _vwViewMode = _vwViewMode === "tiles" ? "list" : "tiles";
        try { localStorage.setItem("studio-vwc-view", _vwViewMode); } catch (e) {}
        renderViews();
      };
    }
    var q = (($("#viewsSearch") || {}).value || "").toLowerCase();
    var list = Studio.Workspace.all("analyses").filter(isVisibleToMe).sort(function (a, b) {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      if (a.pinned) return (b.pinnedAt || "").localeCompare(a.pinnedAt || "");
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    var typeCounts = {}, folderCounts = {}, folderUnfiled = 0;
    list.forEach(function (a) {
      var t = a.chartType || "bars";
      typeCounts[t] = (typeCounts[t] || 0) + 1;
      if (a.folder) folderCounts[a.folder] = (folderCounts[a.folder] || 0) + 1; else folderUnfiled++;
    });
    Object.keys(_vwTypeFilter).forEach(function (k) { if (!typeCounts[k]) delete _vwTypeFilter[k]; });
    if (_vwFolderFilter && _vwFolderFilter !== "__unfiled" && !folderCounts[_vwFolderFilter]) _vwFolderFilter = "";
    var anyT = Object.keys(_vwTypeFilter).length > 0;
    var anyF = !!_vwFolderFilter;
    var pillsT = Object.keys(typeCounts).sort().map(function (t) {
      return '<button type="button" class="wb-chip cx-pill' + (_vwTypeFilter[t] ? " active" : "") + '" data-vw-type="' + esc(t) + '" aria-pressed="' + (_vwTypeFilter[t] ? "true" : "false") + '">' +
        '<span class="wb-chip-label">' + esc(vwChartLabel(t)) + '</span> <span class="wb-chip-n">' + typeCounts[t] + '</span></button>';
    }).join("");
    var pillsF = Object.keys(folderCounts).length
      ? ['<button type="button" class="wb-chip cx-pill' + (!_vwFolderFilter ? " active" : "") + '" data-vw-folder="" aria-pressed="' + (!_vwFolderFilter ? "true" : "false") + '">' +
          '<span class="wb-chip-label">All folders</span> <span class="wb-chip-n">' + list.length + '</span></button>']
        .concat(Object.keys(folderCounts).sort().map(function (f) {
          return '<button type="button" class="wb-chip cx-pill' + (_vwFolderFilter === f ? " active" : "") + '" data-vw-folder="' + esc(f) + '" aria-pressed="' + (_vwFolderFilter === f ? "true" : "false") + '">' +
            '<span class="wb-chip-label">' + esc(f) + '</span> <span class="wb-chip-n">' + folderCounts[f] + '</span></button>';
        }))
        .concat(['<button type="button" class="wb-chip cx-pill' + (_vwFolderFilter === "__unfiled" ? " active" : "") + '" data-vw-folder="__unfiled" aria-pressed="' + (_vwFolderFilter === "__unfiled" ? "true" : "false") + '">' +
          '<span class="wb-chip-label">Unfiled</span> <span class="wb-chip-n">' + folderUnfiled + '</span></button>'])
        .join("")
      : "";
    var shown = list.filter(function (a) {
      var t = a.chartType || "bars";
      if (anyT && !_vwTypeFilter[t]) return false;
      if (_vwFolderFilter === "__unfiled") { if (a.folder) return false; }
      else if (_vwFolderFilter) { if (a.folder !== _vwFolderFilter) return false; }
      if (!q) return true;
      var hay = ((a.name || "") + " " + vwChartLabel(t) + " " + (a.folder || "")).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    var isTiles = _vwViewMode === "tiles";
    var typeById = {};
    shown.forEach(function (a) { typeById[a.id] = a.chartType || "bars"; });
    var rows = shown.map(function (a) {
      var t = a.chartType || "bars";
      var icon = '<span class="cx-ic"></span>';
      var folderBadge = a.folder ? '<span class="cx-badge cx-folder" data-tip="Folder: ' + esc(a.folder) + '">' + esc(a.folder) + '</span>' : "";
      var name = '<span class="cx-name"><button type="button" class="cx-title-btn" title="' + esc(a.name || "View") + ' — open in Explore" aria-label="Open View ' + esc(a.name || "View") + ' in Explore"><b>' + esc(a.name || "Untitled View") + '</b></button><small>' + esc(vwChartLabel(t)) + '</small></span>';
      var badges = folderBadge + Studio.packBadgeHtml(a);
      var when = '<span class="cx-when">' + esc(Studio.fmtWhen(a.updatedAt || Date.now())) + '</span>';
      var privateBtn = '<button type="button" class="cx-private' + (a.private ? " private" : "") + '" data-vw-private="' + esc(a.id) + '" title="' + (a.private ? "Private — only you can see this" : "Make private") + '" aria-label="' + (a.private ? "Make " + esc(a.name || "this View") + " public" : "Make " + esc(a.name || "this View") + " private") + '" aria-pressed="' + (a.private ? "true" : "false") + '"></button>';
      var pinBtn = '<button type="button" class="cx-pin' + (a.pinned ? " on" : "") + '" data-vw-pin="' + esc(a.id) + '" title="' + (a.pinned ? "Unpin" : "Pin to top") + '" aria-label="' + (a.pinned ? "Unpin " : "Pin ") + esc(a.name || "View") + '" aria-pressed="' + (a.pinned ? "true" : "false") + '"></button>';
      var actions = '<span class="cx-actions">' +
          '<button type="button" class="btn" data-vw-open="' + esc(a.id) + '">Open</button>' +
          '<button type="button" class="btn" data-vw-dash="' + esc(a.id) + '">Add to dashboard</button>' +
          '<button type="button" class="btn" data-vw-dup="' + esc(a.id) + '" aria-label="Duplicate ' + esc(a.name || "View") + '">Duplicate</button>' +
          '<button type="button" class="btn" data-vw-export="' + esc(a.id) + '" aria-label="Export ' + esc(a.name || "View") + '">Export</button>' +
          '<button type="button" class="btn" data-vw-del="' + esc(a.id) + '" aria-label="Delete ' + esc(a.name || "View") + '">✕</button>' +
        '</span>';
      if (isTiles) {
        return '<div class="dsx-tile" data-vw-id="' + esc(a.id) + '">' +
          '<div class="dsx-tile-head">' + icon + name + pinBtn + privateBtn + '</div>' +
          (badges ? '<div class="dsx-tile-badges">' + badges + '</div>' : "") +
          '<div class="dsx-tile-foot">' + when + actions + '</div>' +
          '</div>';
      }
      return '<div class="cx-row" data-vw-id="' + esc(a.id) + '">' +
        icon + name + badges + when + privateBtn + pinBtn + actions + '</div>';
    });
    results.innerHTML =
      (pillsF ? '<div class="wb-chips cx-filter-strip">' + pillsF + '</div>' : "") +
      (pillsT ? '<div class="wb-chips cx-pills cx-filter-strip">' + pillsT +
        (anyT || anyF ? '<button type="button" class="wb-chip" id="vwPillClear" title="Show everything">Clear</button>' : "") +
        '</div>' : "") +
      (rows.length ? '<div class="' + (isTiles ? "dsx-grid" : "cx-list") + '">' + rows.join("") + '</div>'
        : '<div class="cx-empty">' +
            (q || anyT || anyF ? "No Views match." :
              "<b>No Views yet.</b><br/>A View is a reusable chart, KPI, or map you build in Explore — pin it to Home or drop it into any dashboard.") +
            (q || anyT || anyF ? "" : '<br/><button type="button" class="btn primary" id="vwEmptyNew">+ New View</button>') +
          '</div>');
    Studio.Tooltip.hydrate(results);
    $$("[data-vw-type]", results).forEach(function (btn) {
      btn.onclick = function () {
        var k = btn.getAttribute("data-vw-type");
        if (_vwTypeFilter[k]) delete _vwTypeFilter[k]; else _vwTypeFilter[k] = true;
        renderViews();
      };
    });
    $$("[data-vw-folder]", results).forEach(function (btn) {
      btn.onclick = function () { _vwFolderFilter = btn.getAttribute("data-vw-folder"); renderViews(); };
    });
    var clearBtn = $("#vwPillClear", results);
    if (clearBtn) clearBtn.onclick = function () { _vwTypeFilter = {}; _vwFolderFilter = ""; renderViews(); };
    var emptyNew = $("#vwEmptyNew", results);
    if (emptyNew) emptyNew.onclick = function () { vwNewView(); };
    $$(".cx-row, .dsx-tile", results).forEach(function (row) {
      var id = row.getAttribute("data-vw-id");
      var icEl = row.querySelector(".cx-ic");
      if (icEl) {
        var mini = vwTypeIcon(typeById[id]);
        if (mini) icEl.innerHTML = mini; else icEl.appendChild(Studio.icon("trend-up", 18));
      }
      row.addEventListener("click", function (e) {
        if (e.target.closest("[data-vw-pin],[data-vw-private],[data-vw-open],[data-vw-dash],[data-vw-dup],[data-vw-export],[data-vw-del]")) return;
        vwOpen(id);
      });
    });
    $$(".cx-pin", results).forEach(function (btn) {
      btn.appendChild(Studio.icon("star", 14));
      btn.onclick = function (e) { e.stopPropagation(); Studio.Explore.togglePin(btn.getAttribute("data-vw-pin")); };
    });
    $$(".cx-private", results).forEach(function (btn) {
      btn.appendChild(Studio.icon("lock", 14));
      btn.onclick = function (e) { e.stopPropagation(); Studio.Explore.togglePrivate(btn.getAttribute("data-vw-private")); };
    });
    $$("[data-vw-open]", results).forEach(function (btn) {
      btn.onclick = function () { vwOpen(btn.getAttribute("data-vw-open")); };
    });
    $$("[data-vw-dash]", results).forEach(function (btn) {
      btn.onclick = function () { Studio.Explore.openAddToExistingDashboardPicker(btn.getAttribute("data-vw-dash")); };
    });
    $$("[data-vw-dup]", results).forEach(function (btn) {
      btn.onclick = function (e) { e.stopPropagation(); vwDuplicate(btn.getAttribute("data-vw-dup")); };
    });
    $$("[data-vw-export]", results).forEach(function (btn) {
      btn.onclick = function (e) { e.stopPropagation(); vwExport(btn.getAttribute("data-vw-export")); };
    });
    $$("[data-vw-del]", results).forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-vw-del");
        var a = Studio.Workspace.get("analyses", id); if (!a) return;
        if (!window.confirm('Delete View "' + (a.name || "Untitled View") + '"?')) return;
        // Analyses are self-contained (LF57 reuses Explore's own store) — if the
        // deleted View happens to be the one currently open in Explore's editor,
        // clear that pointer too so re-opening Explore doesn't reference a gone id
        // (same guard explore.js's own data-xp-del handler applies).
        if (Studio.Explore.XP && Studio.Explore.XP.analysisId === id) Studio.Explore.XP.analysisId = null;
        Studio.Workspace.remove("analyses", id);
        toast("Deleted " + (a.name || "View"));
      };
    });
  }
  // Open a View for editing — always in Explore, the one View builder (#29).
  function vwOpen(id) {
    Studio.Explore.loadAnalysis(id);
    if (window.__studioShellSetSection) window.__studioShellSetSection("explore");
  }
  // "+ New View" — same reset-to-fresh-Explore path Repository's "＋ New ▾ → New View" uses.
  function vwNewView() {
    if (Studio.Explore && Studio.Explore.startNew) Studio.Explore.startNew();
    if (window.__studioShellSetSection) window.__studioShellSetSection("explore");
  }
  // LF57 follow-up: a name never collides with one already in the catalog, same
  // "suffix at creation time" convention as studio.js's uniqueDashboardTitle.
  function uniqueAnalysisName(base) {
    var used = {};
    Studio.Workspace.all("analyses").forEach(function (a) { if (a.name) used[a.name] = true; });
    if (!used[base]) return base;
    var n = 2;
    while (used[base + " " + n]) n++;
    return base + " " + n;
  }
  // Duplicate: a straight clone of the persisted row (chart/da/folder/private carried
  // over — a copy of a private View stays private, same as any other saved-object
  // duplicate in the app), a fresh id + uniquified "<name> (copy)" title, and NOT
  // pinned — a copy starts unfavorited rather than silently cluttering the pinned list.
  function vwDuplicate(id) {
    var a = Studio.Workspace.get("analyses", id); if (!a) return;
    var dup = Studio.clone(a);
    delete dup.id; delete dup.createdAt; delete dup.updatedAt; delete dup.pinnedAt;
    dup.name = uniqueAnalysisName((a.name || "Untitled View") + " (copy)");
    dup.pinned = false;
    var saved = Studio.Workspace.put("analyses", dup);
    toast("Duplicated “" + saved.name + "”");
    renderViews();
  }
  // LF57 follow-up ("make standalone" — the last of the three items LF57 slice 1's own DONE
  // note flagged as genuinely still open): downloads a tiny, self-contained single-View HTML
  // file — no open dashboard needed, unlike the in-canvas panel's own "Export this View…".
  function vwExport(id) {
    var a = Studio.Workspace.get("analyses", id); if (!a) return;
    D.exportAnalysisEmbed(a);
  }

  Studio.ViewsCatalog = {
    configure: configure,
    render: renderViews,
    newView: vwNewView
  };
})();
