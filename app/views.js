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

  function vwChartLabel(t) { return t === "kpi" ? "KPI" : (Studio.CHARTS[t] || {}).label || t; }
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

  // LIVE-d (slice 6): multi-select + bulk actions on Views — the last catalog section
  // to adopt the shape slices 1-5 proved everywhere else (session-only select mode,
  // checkbox overlay, bulk bar with Select all / Clear / Move to folder / Delete).
  var _vwSelectMode = false;
  var _vwSelected = {}; // id -> true, only meaningful while _vwSelectMode
  function toggleVwSelect(id) {
    if (_vwSelected[id]) delete _vwSelected[id]; else _vwSelected[id] = true;
    renderViews();
  }
  function bulkDeleteSelectedViews() {
    var ids = Object.keys(_vwSelected);
    if (!ids.length) return;
    var W = Studio.Workspace;
    var rows = ids.map(function (id) { return W.get("analyses", id); }).filter(Boolean);
    var msg = "Delete " + rows.length + " View" + (rows.length === 1 ? "" : "s") + "? This can't be undone.";
    if (!window.confirm(msg)) return;
    var removed = rows.map(Studio.clone); // DURABLE-2 follow-up: captured for Undo
    rows.forEach(function (a) {
      // same open-editor pointer guard the single-row delete applies
      if (Studio.Explore.XP && Studio.Explore.XP.analysisId === a.id) Studio.Explore.XP.analysisId = null;
      W.remove("analyses", a.id, { silent: true });
    });
    _vwSelected = {};
    Studio.undoToast("Deleted " + rows.length + " View" + (rows.length === 1 ? "" : "s") + ".", function () {
      Studio.undoRestoreRows([{ table: "analyses", rows: removed }]);
    });
    // one batched notify (not a remove per row), same convention every other bulk delete uses
    W.notify("analyses");
  }
  // LIVE-d slice 5's shared Studio.bulkMoveToFolder flow, Views edition.
  function bulkMoveSelectedViews() {
    var ids = Object.keys(_vwSelected);
    if (!ids.length) return;
    var allPaths = Studio.Workspace.all("analyses").map(function (a) { return a.folder; }).filter(Boolean);
    Studio.bulkMoveToFolder(ids.map(function (id) { return { type: "analysis", id: id }; }), allPaths, function (moved) {
      if (moved) _vwSelected = {};
    });
  }
  window.__studioVwSelectMode = function () { return _vwSelectMode; }; // test hook
  window.__studioVwSelected = function () { return Object.keys(_vwSelected); }; // test hook
  function renderViews() {
    var results = $("#viewsResults"); if (!results) return;
    // LIVE-d slice 6: the "Select" toolbar toggle, same idempotent-binding convention
    // as the view toggle below — lives outside #viewsResults so it survives re-renders.
    var selBtn = $("#viewsSelectBtn");
    if (selBtn) {
      selBtn.textContent = _vwSelectMode ? "Cancel" : "Select";
      selBtn.setAttribute("aria-pressed", _vwSelectMode ? "true" : "false");
      selBtn.onclick = function () {
        _vwSelectMode = !_vwSelectMode;
        if (!_vwSelectMode) _vwSelected = {};
        renderViews();
      };
    }
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
    // SORT-1: header sort <select> — same idempotent-binding convention as the toggles.
    var _vwSortKey = Studio.catalogSort.wire($("#viewsSortSel"), "views", "updated-desc", [
      ["updated-desc", "Newest first"], ["updated-asc", "Oldest first"],
      ["name-asc", "Name A–Z"], ["name-desc", "Name Z–A"],
      ["type", "By chart type"]
    ], renderViews);
    var _vwNameCmp = Studio.catalogSort.cmp("name-asc");
    var vwSortCmp = Studio.catalogSort.cmp(_vwSortKey, { extras: {
      type: function (a, b) {
        return vwChartLabel(a.chartType || "bars").localeCompare(vwChartLabel(b.chartType || "bars")) || _vwNameCmp(a, b);
      }
    } });
    var q = ($("#viewsSearch") || {}).value || "";
    // AUD-06 slice 1: the shared matcher (Studio.catalogSearch) — this section only
    // declares WHICH fields are searchable; the rules (AND-ed terms, quoted phrases,
    // case-insensitivity) are the same in every catalog panel.
    var vwMatch = Studio.catalogSearch.matcher(q, function (a) {
      return [a.name, vwChartLabel(a.chartType || "bars"), a.folder];
    });
    var list = Studio.Workspace.all("analyses").filter(isVisibleToMe).sort(function (a, b) {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      if (a.pinned) return (b.pinnedAt || "").localeCompare(a.pinnedAt || "");
      return vwSortCmp(a, b);
    });
    // LIVE-d slice 6: drop any selected id that no longer exists/is visible so a stale
    // entry can't inflate the bulk-bar count — same pruning every other section does.
    if (_vwSelectMode) {
      var vwListIds = {}; list.forEach(function (a) { vwListIds[a.id] = true; });
      Object.keys(_vwSelected).forEach(function (id) { if (!vwListIds[id]) delete _vwSelected[id]; });
    }
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
      return vwMatch(a);
    });
    var isTiles = _vwViewMode === "tiles";
    var typeById = {};
    shown.forEach(function (a) { typeById[a.id] = a.chartType || "bars"; });
    var rows = shown.map(function (a) {
      var t = a.chartType || "bars";
      // LIVE-d slice 6: the select-mode checkbox overlay (same .cx-select/.is-selected
      // CSS every other section reuses; a distinct .vw-select-cb class scopes wiring).
      var vwSelected = _vwSelectMode && !!_vwSelected[a.id];
      var selectHtml = _vwSelectMode
        ? '<label class="cx-select" onclick="event.stopPropagation()"><input type="checkbox" class="vw-select-cb" data-vw-select="' +
          esc(a.id) + '"' + (vwSelected ? " checked" : "") + ' aria-label="Select ' + esc(a.name || "View") + '"/></label>'
        : "";
      var icon = '<span class="cx-ic"></span>';
      var folderBadge = a.folder ? '<span class="cx-badge cx-folder" data-tip="Folder: ' + esc(a.folder) + '">' + esc(a.folder) + '</span>' : "";
      // A row opens into whichever editor actually owns it (a.builder → the View
      // Builder, else Quick Views — same routing vwOpen() uses below), so the
      // hint always names the real destination instead of a hardcoded guess.
      var dest = a.builder ? "the View Builder" : "Quick Views";
      var name = '<span class="cx-name"><button type="button" class="cx-title-btn" title="' + esc(a.name || "View") + ' — open in ' + dest + '" aria-label="Open View ' + esc(a.name || "View") + ' in ' + dest + '"><b>' + esc(a.name || "Untitled View") + '</b></button><small>' + esc(vwChartLabel(t)) + '</small></span>';
      var badges = folderBadge;
      var when = '<span class="cx-when">' + esc(Studio.fmtWhen(a.updatedAt || Date.now())) + '</span>';
      var privateBtn = '<button type="button" class="cx-private' + (a.private ? " private" : "") + '" data-vw-private="' + esc(a.id) + '" title="' + (a.private ? "Private — only you can see this" : "Make private") + '" aria-label="' + (a.private ? "Make " + esc(a.name || "this View") + " public" : "Make " + esc(a.name || "this View") + " private") + '" aria-pressed="' + (a.private ? "true" : "false") + '"></button>';
      var pinBtn = '<button type="button" class="cx-pin' + (a.pinned ? " on" : "") + '" data-vw-pin="' + esc(a.id) + '" title="' + (a.pinned ? "Unpin" : "Pin to top") + '" aria-label="' + (a.pinned ? "Unpin " : "Pin ") + esc(a.name || "View") + '" aria-pressed="' + (a.pinned ? "true" : "false") + '"></button>';
      // VB-5: Open targets the editor that owns the View; the second button is the
      // OTHER editor (every open point in the app offers both targets).
      var altTarget = a.builder ? "explore" : "build";
      var altLabel = a.builder ? "Quick View" : "View Builder";
      var altTip = a.builder
        ? "Open in Quick Views — the simple one-chart editor (shows this View best-effort)"
        : "Open in the View Builder — the full shelves/pivot editor";
      var actions = '<span class="cx-actions">' +
          '<button type="button" class="btn" data-vw-open="' + esc(a.id) + '" title="Open in ' + dest + '">Open</button>' +
          '<button type="button" class="btn" data-vw-open-in="' + altTarget + '" data-vw-id-alt="' + esc(a.id) + '" title="' + esc(altTip) + '" aria-label="Open ' + esc(a.name || "View") + ' in ' + esc(altLabel) + '">' + altLabel + '</button>' +
          '<button type="button" class="btn" data-vw-dash="' + esc(a.id) + '">Add to dashboard</button>' +
          '<button type="button" class="btn" data-vw-dup="' + esc(a.id) + '" aria-label="Duplicate ' + esc(a.name || "View") + '">Duplicate</button>' +
          '<button type="button" class="btn" data-vw-export="' + esc(a.id) + '" aria-label="Export ' + esc(a.name || "View") + '">Export</button>' +
          '<button type="button" class="btn" data-vw-del="' + esc(a.id) + '" aria-label="Delete ' + esc(a.name || "View") + '">✕</button>' +
        '</span>';
      if (isTiles) {
        return '<div class="dsx-tile' + (vwSelected ? " is-selected" : "") + '" data-vw-id="' + esc(a.id) + '">' +
          '<div class="dsx-tile-head">' + selectHtml + icon + name + pinBtn + privateBtn + '</div>' +
          (badges ? '<div class="dsx-tile-badges">' + badges + '</div>' : "") +
          '<div class="dsx-tile-foot">' + when + actions + '</div>' +
          '</div>';
      }
      return '<div class="cx-row' + (vwSelected ? " is-selected" : "") + '" data-vw-id="' + esc(a.id) + '">' +
        selectHtml + icon + name + badges + when + privateBtn + pinBtn + actions + '</div>';
    });
    // LIVE-d slice 6: the bulk bar — same anatomy as every other section's, reusing the
    // section-agnostic .dash-bulk-bar CSS.
    var vwSelCount = Object.keys(_vwSelected).length;
    var vwBulkBarHtml = _vwSelectMode
      ? '<div class="dash-bulk-bar"><span class="dash-bulk-count">' + vwSelCount + ' selected</span>' +
        '<button type="button" class="btn" id="vwSelAllBtn">Select all</button>' +
        '<button type="button" class="btn" id="vwSelNoneBtn">Clear</button>' +
        '<button type="button" class="btn" id="vwSelMoveBtn"' + (vwSelCount ? '' : ' disabled') + '>' +
        'Move' + (vwSelCount ? ' ' + vwSelCount : '') + ' to folder…</button>' +
        '<button type="button" class="btn danger" id="vwSelDelBtn"' + (vwSelCount ? '' : ' disabled') + '>' +
        'Delete' + (vwSelCount ? ' ' + vwSelCount : '') + '</button></div>'
      : '';
    // AUD-06 slice 1: the chip counts the search box as a filter, and its strip renders
    // for the chip alone — a search that matches nothing still offers the way back.
    var vwClearHtml = (anyT || anyF || q)
      ? '<button type="button" class="wb-chip" id="vwPillClear" title="Show everything">Clear</button>' : "";
    results.innerHTML =
      (pillsF ? '<div class="wb-chips cx-filter-strip">' + pillsF + '</div>' : "") +
      (pillsT || vwClearHtml ? '<div class="wb-chips cx-pills cx-filter-strip">' + pillsT + vwClearHtml + '</div>' : "") +
      vwBulkBarHtml +
      (rows.length ? '<div class="' + (isTiles ? "dsx-grid" : "cx-list") + '">' + rows.join("") + '</div>'
        : '<div class="cx-empty">' +
            (q || anyT || anyF ? "No Views match." :
              "<b>No Views yet.</b><br/>A View is a reusable chart, KPI, pivot, or map — build one in the View Builder or Quick Views, pin it to Home, or drop it into any dashboard.") +
            (q || anyT || anyF ? "" : '<br/><button type="button" class="btn primary" id="vwEmptyNew">+ New View</button> <button type="button" class="btn" id="vwEmptyQuick">+ New Quick View</button>') +
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
    // AUD-06 slice 1: "Clear" means SHOW EVERYTHING, so it empties the search box too —
    // the search is a filter like any other, and leaving it set was the single most
    // confusing thing about the old chip ("I cleared the filters and the list is still short").
    if (clearBtn) clearBtn.onclick = function () {
      _vwTypeFilter = {}; _vwFolderFilter = "";
      Studio.catalogSearch.clearInput($("#viewsSearch"));
      renderViews();
    };
    var emptyNew = $("#vwEmptyNew", results);
    if (emptyNew) emptyNew.onclick = function () { vwNewBuilderView(); };
    var emptyQuick = $("#vwEmptyQuick", results);
    if (emptyQuick) emptyQuick.onclick = function () { vwNewView(); };
    $$(".cx-row, .dsx-tile", results).forEach(function (row) {
      var id = row.getAttribute("data-vw-id");
      var icEl = row.querySelector(".cx-ic");
      if (icEl) {
        var mini = vwTypeIcon(typeById[id]);
        if (mini) icEl.innerHTML = mini; else icEl.appendChild(Studio.icon("trend-up", 18));
      }
      row.addEventListener("click", function (e) {
        if (e.target.closest("[data-vw-pin],[data-vw-private],[data-vw-open],[data-vw-open-in],[data-vw-dash],[data-vw-dup],[data-vw-export],[data-vw-del],.vw-select-cb")) return;
        // LIVE-d slice 6: while select mode is on, tapping a row toggles its selection
        // instead of opening the editor — same convention as every other section.
        if (_vwSelectMode) { toggleVwSelect(id); return; }
        vwOpen(id);
      });
    });
    // LIVE-d slice 6: bulk-bar buttons + checkbox wiring while select mode is on.
    if (_vwSelectMode) {
      var vwSelAllBtn = $("#vwSelAllBtn", results);
      if (vwSelAllBtn) vwSelAllBtn.onclick = function () { shown.forEach(function (a) { _vwSelected[a.id] = true; }); renderViews(); };
      var vwSelNoneBtn = $("#vwSelNoneBtn", results);
      if (vwSelNoneBtn) vwSelNoneBtn.onclick = function () { _vwSelected = {}; renderViews(); };
      var vwSelMoveBtn = $("#vwSelMoveBtn", results);
      if (vwSelMoveBtn) vwSelMoveBtn.onclick = bulkMoveSelectedViews;
      var vwSelDelBtn = $("#vwSelDelBtn", results);
      if (vwSelDelBtn) vwSelDelBtn.onclick = bulkDeleteSelectedViews;
      $$(".vw-select-cb", results).forEach(function (cb) {
        cb.onclick = function (e) { e.stopPropagation(); };
        cb.onchange = function () { toggleVwSelect(cb.getAttribute("data-vw-select")); };
      });
    }
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
    $$("[data-vw-open-in]", results).forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        vwOpenIn(btn.getAttribute("data-vw-id-alt"), btn.getAttribute("data-vw-open-in"));
      };
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
        // DURABLE-2: single-row deletes get the same undo the bulk bar has
        var clone = Studio.clone(a);
        Studio.Workspace.remove("analyses", id);
        Studio.undoToast("Deleted " + (a.name || "View") + ".", function () {
          Studio.undoRestoreRows([{ table: "analyses", rows: [clone] }]);
        });
      };
    });
  }
  // VB-5: open a View in a SPECIFIC editor, regardless of where it was made.
  // target "build" → the View Builder (builder-made Views restore their shelves
  // exactly; anything else reconstructs best-effort via Studio.Build.loadForeign);
  // target "explore" → Quick Views (always opens — explore.js renders any saved
  // row best-effort and shows its own cross-editor notice when it was made in a
  // higher-level editor). This is THE one cross-editor router — Home, Repository
  // and the rows below all funnel through it.
  function vwOpenIn(id, target) {
    if (target === "build" && Studio.Build) {
      var a = Studio.Workspace.get("analyses", id);
      if (a && a.builder && Studio.Build.load) Studio.Build.load(id);
      else if (Studio.Build.loadForeign) Studio.Build.loadForeign(id);
      if (window.__studioShellSetSection) window.__studioShellSetSection("build");
      return;
    }
    Studio.Explore.loadAnalysis(id);
    if (window.__studioShellSetSection) window.__studioShellSetSection("explore");
  }
  // Open a View for editing in the editor that OWNS it. Explore-made Views open
  // in Explore (#29); a View carrying a `builder` blob was made in the View
  // Builder (#117) and reopens there instead, with its dataset + shelves restored.
  function vwOpen(id) {
    var a = Studio.Workspace.get("analyses", id);
    vwOpenIn(id, a && a.builder ? "build" : "explore");
  }
  // "+ New Quick View" — same reset-to-fresh-Quick-Views path Repository's "＋ New ▾ → New View" uses.
  function vwNewView() {
    if (Studio.Explore && Studio.Explore.startNew) Studio.Explore.startNew();
    if (window.__studioShellSetSection) window.__studioShellSetSection("explore");
  }
  // "+ New View" (Kevin's rail IA): the full View Builder is the primary path now.
  function vwNewBuilderView() {
    if (Studio.Build && Studio.Build.newView) Studio.Build.newView();
    if (window.__studioShellSetSection) window.__studioShellSetSection("build");
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
    open: vwOpen,                  // VB-5: owner-routed open (builder blob → View Builder)
    openIn: vwOpenIn,              // VB-5: open in a SPECIFIC editor ("build" | "explore")
    newView: vwNewView,            // Quick View (Explore)
    newBuilderView: vwNewBuilderView // full View Builder
  };
})();
