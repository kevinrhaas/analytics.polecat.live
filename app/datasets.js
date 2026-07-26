/* ============================================================================
   datasets.js — R5+ slice 9 (studio.js module extraction, tech-debt track —
   LAST slice, this completes the whole studio.js module-extraction track):
   the Datasets subsystem (a named, {{param}}-substitutable query defined on
   top of a Connection) moves out of app/studio.js into its own module,
   following the chart-thumbnails.js/branding.js/defaults.js/celebrations.js/
   versions.js/explore.js/jobs.js/connections.js extraction precedent (①-⑧).
   Like ⑤-⑧, this subsystem leans on studio.js's own private DOM/modal helpers
   plus its visibility/user-scoping helpers, so it takes the same
   ONE-bundled-`configure(deps)`-call shape rather than an injected-callback-
   per-function. ONE exception, unlike ①-⑧: `runDataset` (and its
   `window.__studioRunDataset` builder-live-path/test hook) stays IN studio.js
   — it's the shared live-data bridge the builder preview, Explore, and Jobs
   all call directly — and is instead INJECTED into this module the same way
   every other studio.js-private helper is, while this module exposes its own
   `connOf`/`runnableDef`/`adapterOf` back OUT as plain (non-injected) methods
   on `Studio.Datasets` for studio.js's copy of runDataset (and two other
   call sites, the Home favorites card and the Repository browser's
   `repoAllRows`) to call directly — same pattern `Studio.Explore.XP` already
   established for exposing state straight off the module namespace. studio.js
   keeps thin same-named delegates (renderDatasets, openDatasetEditor,
   toggleDsxPrivate) at every original call site, and every window.__studio*
   test hook, so nothing outside this module needed to change. Pure refactor,
   no behavior change.
   Loads before studio.js (app/index.html). The R5+ studio.js module
   extraction track (①-⑨) is now complete.
   ============================================================================ */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};
  function esc(s) { return Studio.escapeHtml(s); }

  // D holds every studio.js-private helper this module needs, injected once
  // via configure() — see the header comment.
  var D = null;
  function configure(deps) {
    D = deps;
    // These read D.makeViewsStore/D.makePinToggle, so they can only be built
    // once configure() has run — deferred here instead of at module-load
    // top level, same one-time init timing the inline studio.js code used to
    // get for free (see connections.js's identical wrinkle).
    _dsxViewsStore = makeViewsStore("datasetViews");
    toggleDsxPin = makePinToggle("datasets", function () { renderDatasets(); });
  }
  function $(sel, root) { return D.$(sel, root); }
  function $$(sel, root) { return D.$$(sel, root); }
  function el(t, c) { return D.el(t, c); }
  function modal(title, build, onClose, wide) { return D.modal(title, build, onClose, wide); }
  function toast(msg, isErr, celebrate) { return D.toast(msg, isErr, celebrate); }
  function isVisibleToMe(r) { return D.isVisibleToMe(r); }
  function isDatasetVisibleToMe(r) { return D.isDatasetVisibleToMe(r); }
  function currentUserId() { return D.currentUserId(); }
  function makeViewsStore(settingsKey) { return D.makeViewsStore(settingsKey); }
  function makePinToggle(table, rerender) { return D.makePinToggle(table, rerender); }
  function runDataset(d, extraParams) { return D.runDataset(d, extraParams); }

  /* ---------- Datasets section ----------
     A dataset = a named, parameterizable query defined on top of a Connection
     ({{key}} placeholders resolve at run time — dashboard template variables
     and per-dataset defaults). Workspace-level and reusable: the Studio
     library lists them for drag-to-canvas, and this view manages the catalog
     with the fleet's list UX (multi-select pills by adapter, by connection,
     AND by tag, search, status dot from the last preview run). */
  var _dsxAdapterFilter = {}; // multi-select adapterId -> true; empty = all
  var _dsxConnFilter = {};    // multi-select connectionId -> true; empty = all (post-overhaul backlog item 7, "by connection")
  var _dsxTagFilter = {};     // multi-select tag -> true; empty = all
  // Post-overhaul backlog item 7's optional "by type" facet (kind:
  // sql/table/file/collection/sheet) — same multi-select/saved-view shape as
  // the adapter/connection/tag pills, just keyed by d.kind (defaulting to
  // "sql" the same way dsxRunnableDef already does).
  var _dsxKindFilter = {};
  var DSX_KIND_LABEL = { sql: "SQL query", table: "Table", collection: "Collection", file: "File", sheet: "Sheet" };
  function dsxKindLabel(k) { return DSX_KIND_LABEL[k] || k; }
  // Folder pilot slice (#21 org sub-item, "folder tree" step 2 — a single flat
  // `d.folder` string, the primary-home layer that sits alongside tags per the
  // 2026-07-21 DECISIONS LOCKED note; a real nested tree arrives with M5's
  // Repository browser). Single-select facet (like Dashboards' _repoWbFilter),
  // not a catalog of folder records — a dataset just carries its folder name
  // directly, same free-text shape as tags but one value instead of many.
  var _dsxFolderFilter = ""; // "" = All, "__unfiled" = no folder, else a folder name
  function dsxConnOf(d) { return Studio.Workspace.get("connections", d.connectionId); }
  function dsxAdapterOf(d) { var c = dsxConnOf(d); return c ? Studio.sourceById(c.adapter) : null; }
  // Post-overhaul backlog item 6 ("saved views for the Datasets/Connections
  // lists, jobtracker pattern"): a saved view is just a name plus the search
  // text + adapter/tag pill selection captured at save time. Same home as
  // workbooks (Workspace SETTINGS, a schemaless key/value bag) rather than a
  // new localStorage key — travels with the workspace across devices/sync for
  // free, and needs no new "Clear local data" entry (analytics.workspace.v1
  // already covers it) or Turso/Supabase schema bump.
  var _dsxViewsStore = null; // set in configure()
  function dsxLoadViews() { return _dsxViewsStore.load(); }
  function dsxSaveViews(list) { _dsxViewsStore.save(list); }
  function dsxApplyView(v) {
    var inp = $("#dsxSearch"); if (inp) inp.value = v.q || "";
    _dsxAdapterFilter = {}; (v.adapters || []).forEach(function (a) { _dsxAdapterFilter[a] = true; });
    _dsxConnFilter = {}; (v.connections || []).forEach(function (c) { _dsxConnFilter[c] = true; });
    _dsxTagFilter = {}; (v.tags || []).forEach(function (t) { _dsxTagFilter[t] = true; });
    _dsxKindFilter = {}; (v.kinds || []).forEach(function (k) { _dsxKindFilter[k] = true; });
    _dsxFolderFilter = v.folder || "";
    renderDatasets();
  }
  // Post-overhaul backlog item 7 ("organization at scale") — same favorite
  // flag + top-of-list sort as toggleConnPin, kept on the dataset row itself
  // (additive, syncs with the rest of the workspace).
  var toggleDsxPin = null; // set in configure()
  // M4.2 slice 3 (per-section rights + object privacy — datasets): same
  // `private`/`isVisibleToMe` shape as dashboards/connections, but the
  // account-identity owner rides on `acctOwner` — datasets already have a
  // free-text `owner` field ("who to ask about this dataset") that predates
  // this slice, so the auth owner needs a different name to avoid colliding
  // with it.
  function toggleDsxPrivate(id) {
    var W = Studio.Workspace, r = W.get("datasets", id);
    if (!r) return;
    if (r.private) { delete r.private; }
    else {
      r.private = true;
      if (!r.acctOwner) { var uid = currentUserId(); if (uid) r.acctOwner = uid; }
    }
    W.put("datasets", r);
    toast(r.private ? "Private — only you can see this" : "Public — visible to everyone");
    renderDatasets();
  }
  // Dataset lineage (post-overhaul backlog item 5, "blast-radius view"): every
  // dashboard whose spec links a data access back to this dataset (dsToDA
  // stamps da.datasetId = ds.id when a dataset is dropped onto the canvas).
  // Workspace-wide, so it survives across sessions/devices just like the
  // dashboards it inspects.
  function dsxLineage(dsId) {
    return Studio.Workspace.all("dashboards").filter(function (r) {
      var das = (r.spec && r.spec.cda && r.spec.cda.dataAccesses) || [];
      return das.some(function (da) { return da.datasetId === dsId; });
    });
  }
  // What a dataset's definition looks like for a given adapter: SQL for the
  // sql-family, a table+query for Supabase (PostgREST), a collection for
  // Firestore. One place so the editor + runner + library agree.
  function dsxKindFor(adapterId) {
    if (adapterId === "supabase" || adapterId === "postgrest") return "table"; // both speak PostgREST
    if (adapterId === "firebase") return "collection";
    if (adapterId === "file") return "file"; // CSV/JSON drop — content rides in the dataset row
    if (adapterId === "gsheets") return "sheet"; // tab + optional gviz tq query
    return "sql";
  }
  // Resolve a dataset's definition + params into what adapter.queryData expects.
  function dsxRunnableDef(d, extraParams) {
    var params = {};
    (d.params || []).forEach(function (p) { if (p.key) params[p.key] = p.value; });
    if (extraParams) Object.keys(extraParams).forEach(function (k) { params[k] = extraParams[k]; });
    var def = { kind: d.kind || "sql" };
    if (def.kind === "table") { def.table = Studio.WS.applyParams(d.table || "", params); def.query = Studio.WS.applyParams(d.query || "", params); }
    else if (def.kind === "collection") { def.collection = Studio.WS.applyParams(d.collection || "", params); }
    else if (def.kind === "file") { def.fileName = d.fileName || ""; def.format = d.format || ""; def.content = d.content || ""; } // content IS the data — no {{params}}
    else if (def.kind === "sheet") { def.sheet = Studio.WS.applyParams(d.sheet || "", params); def.query = Studio.WS.applyParams(d.query || "", params); }
    else def.sql = Studio.WS.applyParams(d.sql || "", params);
    return def;
  }
  function renderDatasets() {
    var results = $("#dsxResults"); if (!results) return;
    var q = (($("#dsxSearch") || {}).value || "").toLowerCase();
    var list = Studio.Workspace.all("datasets").filter(isDatasetVisibleToMe).sort(function (a, b) {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      if (a.pinned) return (b.pinnedAt || "").localeCompare(a.pinnedAt || "");
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    var adapterCounts = {}, connCounts = {}, tagCounts = {}, kindCounts = {}, folderCounts = {}, folderUnfiled = 0;
    list.forEach(function (d) {
      var src = dsxAdapterOf(d);
      var aid = src ? src.id : "—";
      adapterCounts[aid] = (adapterCounts[aid] || 0) + 1;
      var cid = d.connectionId || "—";
      connCounts[cid] = (connCounts[cid] || 0) + 1;
      (d.tags || []).forEach(function (t) { tagCounts[t] = (tagCounts[t] || 0) + 1; });
      var kind = d.kind || "sql";
      kindCounts[kind] = (kindCounts[kind] || 0) + 1;
      if (d.folder) folderCounts[d.folder] = (folderCounts[d.folder] || 0) + 1; else folderUnfiled++;
    });
    Object.keys(_dsxAdapterFilter).forEach(function (k) { if (!adapterCounts[k]) delete _dsxAdapterFilter[k]; });
    Object.keys(_dsxConnFilter).forEach(function (k) { if (!connCounts[k]) delete _dsxConnFilter[k]; });
    Object.keys(_dsxTagFilter).forEach(function (k) { if (!tagCounts[k]) delete _dsxTagFilter[k]; });
    Object.keys(_dsxKindFilter).forEach(function (k) { if (!kindCounts[k]) delete _dsxKindFilter[k]; });
    if (_dsxFolderFilter && _dsxFolderFilter !== "__unfiled" && !folderCounts[_dsxFolderFilter]) _dsxFolderFilter = "";
    var anyA = Object.keys(_dsxAdapterFilter).length > 0, anyC = Object.keys(_dsxConnFilter).length > 0, anyT = Object.keys(_dsxTagFilter).length > 0,
      anyK = Object.keys(_dsxKindFilter).length > 0;
    var pillsA = Object.keys(adapterCounts).sort().map(function (aid) {
      var src = Studio.sourceById(aid) || { label: aid === "—" ? "No connection" : aid };
      return '<button type="button" class="wb-chip cx-pill' + (_dsxAdapterFilter[aid] ? " active" : "") + '" data-dsx-adapter="' + esc(aid) + '" aria-pressed="' + (_dsxAdapterFilter[aid] ? "true" : "false") + '">' +
        '<span class="cx-pill-dot" style="background:' + esc(src.accent || "var(--faint)") + '"></span>' +
        '<span class="wb-chip-label">' + esc(src.label) + '</span> <span class="wb-chip-n">' + adapterCounts[aid] + '</span></button>';
    }).join("");
    // Post-overhaul backlog item 7 ("organization at scale") — the by-adapter
    // pills above group e.g. two different Postgres connections together;
    // this facet narrows to ONE specific connection (same multi-select /
    // saved-view plumbing, just keyed by connectionId instead of adapter id).
    var pillsC = Object.keys(connCounts).sort(function (a, b) {
      var na = a === "—" ? "No connection" : ((Studio.Workspace.get("connections", a) || {}).name || a);
      var nb = b === "—" ? "No connection" : ((Studio.Workspace.get("connections", b) || {}).name || b);
      return na.localeCompare(nb);
    }).map(function (cid) {
      var conn = cid === "—" ? null : Studio.Workspace.get("connections", cid);
      var src = conn ? Studio.sourceById(conn.adapter) : null;
      var label = conn ? conn.name : "No connection";
      return '<button type="button" class="wb-chip cx-pill' + (_dsxConnFilter[cid] ? " active" : "") + '" data-dsx-conn="' + esc(cid) + '" aria-pressed="' + (_dsxConnFilter[cid] ? "true" : "false") + '">' +
        '<span class="cx-pill-dot" style="background:' + esc((src && src.accent) || "var(--faint)") + '"></span>' +
        '<span class="wb-chip-label">' + esc(label) + '</span> <span class="wb-chip-n">' + connCounts[cid] + '</span></button>';
    }).join("");
    var pillsT = Object.keys(tagCounts).sort().map(function (t) {
      return '<button type="button" class="wb-chip cx-pill' + (_dsxTagFilter[t] ? " active" : "") + '" data-dsx-tag="' + esc(t) + '" aria-pressed="' + (_dsxTagFilter[t] ? "true" : "false") + '">' +
        '<span class="wb-chip-label">#' + esc(t) + '</span> <span class="wb-chip-n">' + tagCounts[t] + '</span></button>';
    }).join("");
    // Post-overhaul backlog item 7's optional "by type" facet — kind is one of
    // sql/table/file/collection/sheet, driven by the dataset's connection
    // adapter (dsxKindFor); same always-shown convention as the adapter/tag
    // pills (every dataset has a kind, even the single-value case).
    var pillsK = Object.keys(kindCounts).sort().map(function (k) {
      return '<button type="button" class="wb-chip cx-pill' + (_dsxKindFilter[k] ? " active" : "") + '" data-dsx-kind="' + esc(k) + '" aria-pressed="' + (_dsxKindFilter[k] ? "true" : "false") + '">' +
        '<span class="wb-chip-label">' + esc(dsxKindLabel(k)) + '</span> <span class="wb-chip-n">' + kindCounts[k] + '</span></button>';
    }).join("");
    // Folder facet: single-select (unlike the multi-select adapter/conn/tag
    // pills above) — only appears once at least one dataset has been filed,
    // same "don't show an empty facet" convention as the other pills.
    var pillsF = Object.keys(folderCounts).length
      ? ['<button type="button" class="wb-chip cx-pill' + (!_dsxFolderFilter ? " active" : "") + '" data-dsx-folder="" aria-pressed="' + (!_dsxFolderFilter ? "true" : "false") + '">' +
          '<span class="wb-chip-label">All folders</span> <span class="wb-chip-n">' + list.length + '</span></button>']
        .concat(Object.keys(folderCounts).sort().map(function (f) {
          return '<button type="button" class="wb-chip cx-pill' + (_dsxFolderFilter === f ? " active" : "") + '" data-dsx-folder="' + esc(f) + '" aria-pressed="' + (_dsxFolderFilter === f ? "true" : "false") + '">' +
            '<span class="wb-chip-label">' + esc(f) + '</span> <span class="wb-chip-n">' + folderCounts[f] + '</span></button>';
        }))
        .concat(['<button type="button" class="wb-chip cx-pill' + (_dsxFolderFilter === "__unfiled" ? " active" : "") + '" data-dsx-folder="__unfiled" aria-pressed="' + (_dsxFolderFilter === "__unfiled" ? "true" : "false") + '">' +
          '<span class="wb-chip-label">Unfiled</span> <span class="wb-chip-n">' + folderUnfiled + '</span></button>'])
        .join("")
      : "";
    var dsxViews = dsxLoadViews();
    var pillsV = dsxViews.map(function (v) {
      return '<div class="wb-chip-wrap">' +
        '<button type="button" class="wb-chip" data-dsx-view="' + esc(v.id) + '" title="Apply saved view “' + esc(v.name) + '”">' +
          '<span class="wb-chip-label">' + esc(v.name) + '</span></button>' +
        '<button type="button" class="wb-chip-del" data-dsx-view-del="' + esc(v.id) + '" title="Delete view ' + esc(v.name) + '" aria-label="Delete view ' + esc(v.name) + '"></button>' +
        '</div>';
    }).join("");
    var anyF = !!_dsxFolderFilter;
    var canSaveView = !!(q || anyA || anyC || anyT || anyK || anyF);
    var viewAddHtml = canSaveView
      ? '<span class="wb-add"><input type="text" id="dsxViewNameInp" class="wb-name-inp" placeholder="Name this view…" aria-label="Name this saved view"/>' +
        '<button type="button" class="btn" id="dsxViewAddBtn">+ Save view</button></span>'
      : "";
    var shown = list.filter(function (d) {
      var src = dsxAdapterOf(d);
      if (anyA && !_dsxAdapterFilter[src ? src.id : "—"]) return false;
      if (anyC && !_dsxConnFilter[d.connectionId || "—"]) return false;
      if (anyT && !(d.tags || []).some(function (t) { return _dsxTagFilter[t]; })) return false;
      if (anyK && !_dsxKindFilter[d.kind || "sql"]) return false;
      if (_dsxFolderFilter === "__unfiled") { if (d.folder) return false; }
      else if (_dsxFolderFilter) { if (d.folder !== _dsxFolderFilter) return false; }
      if (!q) return true;
      var conn = dsxConnOf(d);
      var hay = (d.name + " " + (d.desc || "") + " " + (d.owner || "") + " " + (d.sql || d.table || d.collection || "") + " " +
        (d.tags || []).join(" ") + " " + (d.folder || "") + " " + (conn ? conn.name : "") + " " + (d.columns || []).join(" ")).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    var rows = shown.map(function (d) {
      var conn = dsxConnOf(d), src = dsxAdapterOf(d);
      var dot = !d.lastRun ? '<span class="cx-dot" data-tip="Never run"></span>'
        : (d.lastRun.ok ? '<span class="cx-dot ok" data-tip="Last run OK · ' + esc(new Date(d.lastRun.at).toLocaleString()) + ' · ' + d.lastRun.rows + ' rows"></span>'
          : '<span class="cx-dot bad" data-tip="Last run failed: ' + esc(d.lastRun.error) + '"></span>');
      var tags = (d.tags || []).map(function (t) { return '<span class="cx-badge">#' + esc(t) + '</span>'; }).join("");
      var folderBadge = d.folder ? '<span class="cx-badge cx-folder" data-tip="Folder: ' + esc(d.folder) + '">' + esc(d.folder) + '</span>' : "";
      var lineage = dsxLineage(d.id);
      var lineageBadge = lineage.length
        ? '<span class="cx-badge cx-lineage" data-tip="Used in: ' + esc(lineage.map(function (r) { return r.title || r.name || "Untitled"; }).join(", ")) + '">↪ ' +
          lineage.length + " dashboard" + (lineage.length !== 1 ? "s" : "") + '</span>'
        : "";
      return '<div class="cx-row" draggable="true" data-dsx-id="' + esc(d.id) + '">' +
        dot +
        '<span class="cx-ic" style="color:' + esc((src && src.accent) || "var(--faint)") + '"></span>' +
        '<span class="cx-name"><button type="button" class="cx-title-btn" aria-label="Edit dataset ' + esc(d.name) + '"><b>' + esc(d.name) + '</b></button><small>' + esc(conn ? conn.name : "no connection") + (src ? " · " + src.label : "") + (d.owner ? " · " + esc(d.owner) : "") + '</small></span>' +
        folderBadge +
        tags +
        ((d.params || []).length ? '<span class="cx-badge" data-tip="Accepts parameters">' + (d.params || []).length + " param" + ((d.params || []).length > 1 ? "s" : "") + '</span>' : "") +
        lineageBadge +
        '<span class="cx-when">' + esc(new Date(d.updatedAt || Date.now()).toLocaleDateString()) + '</span>' +
        '<button type="button" class="cx-private' + (d.private ? " private" : "") + '" data-dsx-private="' + esc(d.id) + '" title="' + (d.private ? "Private — only you can see this" : "Make private") + '" aria-label="' + (d.private ? "Make " + esc(d.name) + " public" : "Make " + esc(d.name) + " private") + '" aria-pressed="' + (d.private ? "true" : "false") + '"></button>' +
        '<button type="button" class="cx-pin' + (d.pinned ? " on" : "") + '" data-dsx-pin="' + esc(d.id) + '" title="' + (d.pinned ? "Unpin" : "Pin to top") + '" aria-label="' + (d.pinned ? "Unpin " : "Pin ") + esc(d.name) + '" aria-pressed="' + (d.pinned ? "true" : "false") + '"></button>' +
        '<span class="cx-actions">' +
          '<button type="button" class="btn" data-dsx-run="' + esc(d.id) + '">Run</button>' +
          '<button type="button" class="btn" data-dsx-edit="' + esc(d.id) + '">Edit</button>' +
          '<button type="button" class="btn" data-dsx-del="' + esc(d.id) + '" aria-label="Delete ' + esc(d.name) + '">✕</button>' +
        '</span></div>';
    });
    results.innerHTML =
      (pillsF ? '<div class="wb-chips">' + pillsF + '</div>' : "") +
      (pillsA || pillsC || pillsK || pillsT || pillsV || viewAddHtml ? '<div class="wb-chips cx-pills">' +
        pillsV + (pillsV && (pillsA || pillsC || pillsK || pillsT) ? '<span class="dsx-pill-sep"></span>' : "") +
        pillsA + (pillsA && (pillsC || pillsK || pillsT) ? '<span class="dsx-pill-sep"></span>' : "") +
        pillsC + (pillsC && (pillsK || pillsT) ? '<span class="dsx-pill-sep"></span>' : "") +
        pillsK + (pillsK && pillsT ? '<span class="dsx-pill-sep"></span>' : "") +
        pillsT +
        (anyA || anyC || anyT || anyK || anyF ? '<button type="button" class="wb-chip" id="dsxPillClear" title="Show everything">Clear</button>' : "") +
        viewAddHtml + '</div>' : "") +
      (rows.length ? '<div class="cx-list">' + rows.join("") + '</div>'
        : '<div class="cx-empty">' +
            (q || anyA || anyC || anyT || anyK || anyF ? "No datasets match." :
              "<b>No datasets yet.</b><br/>A dataset is a named query on top of a connection — SQL for warehouses and files, a table for Supabase, a collection for Firestore — with optional {{parameters}} a dashboard can fill in at run time." +
              (Studio.Workspace.all("connections").length ? "" : "<br/>Start by adding a connection in the Connections section.")) +
            (q || anyA || anyC || anyT || anyK || anyF || !Studio.Workspace.all("connections").length ? "" : '<br/><button type="button" class="btn primary" id="dsxEmptyNew">+ New dataset</button>') +
          '</div>');
    Studio.Tooltip.hydrate(results);
    $$("[data-dsx-adapter]", results).forEach(function (btn) {
      btn.onclick = function () {
        var k = btn.getAttribute("data-dsx-adapter");
        if (_dsxAdapterFilter[k]) delete _dsxAdapterFilter[k]; else _dsxAdapterFilter[k] = true;
        renderDatasets();
      };
    });
    $$("[data-dsx-conn]", results).forEach(function (btn) {
      btn.onclick = function () {
        var k = btn.getAttribute("data-dsx-conn");
        if (_dsxConnFilter[k]) delete _dsxConnFilter[k]; else _dsxConnFilter[k] = true;
        renderDatasets();
      };
    });
    $$("[data-dsx-tag]", results).forEach(function (btn) {
      btn.onclick = function () {
        var k = btn.getAttribute("data-dsx-tag");
        if (_dsxTagFilter[k]) delete _dsxTagFilter[k]; else _dsxTagFilter[k] = true;
        renderDatasets();
      };
    });
    $$("[data-dsx-kind]", results).forEach(function (btn) {
      btn.onclick = function () {
        var k = btn.getAttribute("data-dsx-kind");
        if (_dsxKindFilter[k]) delete _dsxKindFilter[k]; else _dsxKindFilter[k] = true;
        renderDatasets();
      };
    });
    $$("[data-dsx-folder]", results).forEach(function (btn) {
      btn.onclick = function () { _dsxFolderFilter = btn.getAttribute("data-dsx-folder"); renderDatasets(); };
    });
    var clearBtn = $("#dsxPillClear", results);
    if (clearBtn) clearBtn.onclick = function () { _dsxAdapterFilter = {}; _dsxConnFilter = {}; _dsxTagFilter = {}; _dsxKindFilter = {}; _dsxFolderFilter = ""; renderDatasets(); };
    $$("[data-dsx-view]", results).forEach(function (btn) {
      btn.onclick = function () {
        var v = dsxLoadViews().filter(function (x) { return x.id === btn.getAttribute("data-dsx-view"); })[0];
        if (v) dsxApplyView(v);
      };
    });
    $$("[data-dsx-view-del]", results).forEach(function (btn) {
      btn.appendChild(Studio.icon("trash", 9));
      btn.onclick = function (e) {
        e.stopPropagation();
        var id = btn.getAttribute("data-dsx-view-del");
        var v = dsxLoadViews().filter(function (x) { return x.id === id; })[0];
        if (!v) return;
        if (confirm('Delete saved view "' + v.name + '"?')) {
          dsxSaveViews(dsxLoadViews().filter(function (x) { return x.id !== id; }));
          renderDatasets();
        }
      };
    });
    var dsxViewAddBtn = $("#dsxViewAddBtn", results);
    if (dsxViewAddBtn) dsxViewAddBtn.onclick = function () {
      var inp = $("#dsxViewNameInp", results);
      var name = inp ? inp.value.trim() : "";
      if (!name) { if (inp) inp.focus(); toast("Type a name in the box first — e.g. “Finance sources”.", true); return; }
      var list = dsxLoadViews();
      var rawQ = (($("#dsxSearch") || {}).value || "");
      list.unshift({ id: "dsxv" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name, q: rawQ, adapters: Object.keys(_dsxAdapterFilter), connections: Object.keys(_dsxConnFilter), tags: Object.keys(_dsxTagFilter), kinds: Object.keys(_dsxKindFilter), folder: _dsxFolderFilter });
      dsxSaveViews(list);
      toast('View "' + name + '" saved');
      renderDatasets();
    };
    var dsxViewNameInp = $("#dsxViewNameInp", results);
    if (dsxViewNameInp) dsxViewNameInp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); dsxViewAddBtn.click(); } });
    var emptyNew = $("#dsxEmptyNew", results);
    if (emptyNew) emptyNew.onclick = function () { openDatasetEditor(); };
    $$(".cx-row", results).forEach(function (row) {
      var d = Studio.Workspace.get("datasets", row.getAttribute("data-dsx-id"));
      var src = d && dsxAdapterOf(d);
      var icEl = row.querySelector(".cx-ic");
      if (icEl) icEl.appendChild(Studio.icon((src && src.icon) || "db", 18));
      row.addEventListener("click", function (e) {
        if (e.target.closest("[data-dsx-pin],[data-dsx-private],[data-dsx-run],[data-dsx-edit],[data-dsx-del]")) return;
        openDatasetEditor(d);
      });
      // Drag onto Home's "Blank dashboard" tile to start a new dashboard seeded
      // with this dataset — same {wsDataset} payload the Studio library/canvas
      // drop already understands (post-overhaul backlog item 6).
      row.addEventListener("dragstart", function (e) {
        e.dataTransfer.setData("text/plain", JSON.stringify({ wsDataset: row.getAttribute("data-dsx-id") }));
        e.dataTransfer.effectAllowed = "copy";
      });
    });
    $$(".cx-pin", results).forEach(function (btn) {
      btn.appendChild(Studio.icon("star", 14));
      btn.onclick = function (e) { e.stopPropagation(); toggleDsxPin(btn.getAttribute("data-dsx-pin")); };
    });
    $$(".cx-private", results).forEach(function (btn) {
      btn.appendChild(Studio.icon("lock", 14));
      btn.onclick = function (e) { e.stopPropagation(); toggleDsxPrivate(btn.getAttribute("data-dsx-private")); };
    });
    $$("[data-dsx-run]", results).forEach(function (btn) {
      btn.onclick = function () {
        var d = Studio.Workspace.get("datasets", btn.getAttribute("data-dsx-run"));
        if (!d) return;
        btn.disabled = true; btn.textContent = "Running…";
        runDataset(d).then(function (r) {
          toast(r.error ? "Run failed: " + r.error : "OK — " + (r.rows || []).length + " rows", !!r.error);
          renderDatasets();
        });
      };
    });
    $$("[data-dsx-edit]", results).forEach(function (btn) {
      btn.onclick = function () { openDatasetEditor(Studio.Workspace.get("datasets", btn.getAttribute("data-dsx-edit"))); };
    });
    $$("[data-dsx-del]", results).forEach(function (btn) {
      btn.onclick = function () {
        var d = Studio.Workspace.get("datasets", btn.getAttribute("data-dsx-del"));
        if (!d) return;
        var lineage = dsxLineage(d.id);
        var warn = lineage.length
          ? " It's used in " + lineage.length + " dashboard" + (lineage.length !== 1 ? "s" : "") +
            " (" + lineage.map(function (r) { return r.title || r.name || "Untitled"; }).join(", ") + ") — those keep working off their own saved copy, but won't get live updates from this dataset anymore."
          : "";
        if (!window.confirm('Delete dataset "' + d.name + '"?' + warn)) return;
        Studio.Workspace.remove("datasets", d.id);
        toast("Deleted " + d.name);
      };
    });
  }
  function openDatasetEditor(existing, onSaved) {
    var conns = Studio.Workspace.all("connections").filter(isVisibleToMe);
    modal(existing ? "Edit dataset" : "New dataset", function (b) {
      var d = existing ? Studio.clone(existing) : { id: Studio.Workspace.uid("ds"), name: "", params: [], tags: [] };
      var form = el("div", "cx-wiz-form");
      function field(lbl, input, hint) {
        var row = el("label", "cx-field");
        row.innerHTML = "<span>" + esc(lbl) + "</span>";
        row.appendChild(input);
        if (hint) { var h = el("small", "cx-hint"); h.textContent = hint; row.appendChild(h); }
        form.appendChild(row);
        return input;
      }
      var nameInp = field("Dataset name", el("input")); nameInp.type = "text"; nameInp.value = d.name || ""; nameInp.placeholder = "e.g. monthly_cost_by_source";
      var descInp = field("Description", el("input")); descInp.type = "text"; descInp.value = d.desc || ""; descInp.placeholder = "optional — what this returns";
      var connSel = field("Connection", el("select"), conns.length ? "" : "No connections yet — add one in the Connections section first.");
      connSel.className = "cx-sel";
      connSel.innerHTML = '<option value="">— pick a connection —</option>' + conns.map(function (c) {
        var src = Studio.sourceById(c.adapter);
        return '<option value="' + esc(c.id) + '"' + (d.connectionId === c.id ? " selected" : "") + '>' + esc(c.name) + " (" + esc(src ? src.label : c.adapter) + ")</option>";
      }).join("");
      var defWrap = el("div"); form.appendChild(defWrap);
      var defInputs = {};
      function renderDefFields() {
        defWrap.innerHTML = ""; defInputs = {};
        var conn = Studio.Workspace.get("connections", connSel.value);
        var kind = dsxKindFor(conn ? conn.adapter : "");
        d.kind = kind;
        function defField(lbl, key, multiline, ph, hint) {
          var row = el("label", "cx-field");
          row.innerHTML = "<span>" + esc(lbl) + "</span>";
          var inp = multiline ? el("textarea", "dsx-sql") : el("input");
          if (!multiline) inp.type = "text";
          inp.value = d[key] || "";
          inp.placeholder = ph || "";
          row.appendChild(inp);
          if (hint) { var h = el("small", "cx-hint"); h.textContent = hint; row.appendChild(h); }
          defWrap.appendChild(row); defInputs[key] = inp;
        }
        if (kind === "table") {
          defField("Table", "table", false, "orders", "The exposed table or view (RLS/grants govern access).");
          defField("PostgREST query", "query", false, "select=*&order=total.desc&limit=200", "Optional — PostgREST query string; {{params}} allowed.");
        } else if (kind === "collection") {
          defField("Collection", "collection", false, "orders", "The Firestore collection; documents flatten into rows.");
        } else if (kind === "sheet") {
          defField("Tab", "sheet", false, "Sheet1", "Optional — the tab name; the first tab when blank.");
          defField("Query", "query", false, "select A, B where C > 100 order by B desc",
            "Optional — Google's gviz query language (columns are A, B, C…); {{params}} allowed.");
        } else if (kind === "file") {
          // CSV/JSON drop zone — the file's text is stored INSIDE the dataset row
          // (works offline, mirrors with the workspace; capped, see localfile.js).
          var zone = el("div", "dsx-drop");
          var fileInp = el("input"); fileInp.type = "file"; fileInp.accept = ".csv,.tsv,.json,text/csv,application/json"; fileInp.hidden = true;
          function zoneLabel() {
            zone.innerHTML = d.content
              ? "<b>" + esc(d.fileName || "file") + "</b> · " + Math.max(1, Math.round(d.content.length / 1024)) + " KB loaded<small>Drop a new .csv / .json here (or click) to replace it</small>"
              : "<b>Drop a .csv or .json file here</b><small>or click to browse — the data is stored with the dataset and works offline</small>";
          }
          function loadFile(f) {
            if (!f) return;
            f.text().then(function (text) {
              if (text.length > Studio.FILE_DATASET_MAX_CHARS) {
                zone.innerHTML = "<b class='dsx-drop-err'>" + esc(f.name) + " is too large (" + Math.round(text.length / 1e6) + "MB > 2MB)</b><small>Host it and use the DuckDB (remote file) connector instead.</small>";
                return;
              }
              d.fileName = f.name; d.content = text;
              d.format = /\.(csv|tsv)$/i.test(f.name) ? "csv" : /\.json$/i.test(f.name) ? "json" : "";
              if (!nameInp.value.trim()) nameInp.value = f.name.replace(/\.[^.]+$/, "");
              zoneLabel();
            });
          }
          zone.onclick = function () { fileInp.click(); };
          fileInp.onchange = function () { loadFile(fileInp.files[0]); };
          zone.ondragover = function (e) { e.preventDefault(); zone.classList.add("over"); };
          zone.ondragleave = function () { zone.classList.remove("over"); };
          zone.ondrop = function (e) { e.preventDefault(); zone.classList.remove("over"); loadFile(e.dataTransfer.files && e.dataTransfer.files[0]); };
          zoneLabel();
          fileInp.className = "dsx-drop-input"; // stable hook for tests (setInputFiles); NOT in defInputs — the save loop copies .value, and a file input's value is a fakepath string
          defWrap.appendChild(zone); defWrap.appendChild(fileInp);
        } else {
          defField("SQL", "sql", true, "SELECT region, SUM(amount) AS total\nFROM {{schema}}.sales\nGROUP BY region",
            "Use {{key}} placeholders for parameters — dashboard template variables fill them at run time.");
        }
      }
      connSel.onchange = renderDefFields;
      renderDefFields();
      // parameters: key + default value rows
      var paramWrap = el("div", "dsx-params"); form.appendChild(paramWrap);
      function renderParams() {
        paramWrap.innerHTML = '<span class="dsx-params-lbl">Parameters</span>';
        (d.params || []).forEach(function (p, i) {
          var row = el("div", "dsx-param-row");
          var k = el("input"); k.type = "text"; k.placeholder = "key"; k.value = p.key || "";
          var v = el("input"); v.type = "text"; v.placeholder = "default value"; v.value = p.value || "";
          k.oninput = function () { p.key = k.value.trim(); };
          v.oninput = function () { p.value = v.value; };
          var del = el("button", "btn dsx-param-del"); del.type = "button"; del.textContent = "✕"; del.setAttribute("aria-label", "Remove parameter " + (p.key || i));
          del.onclick = function () { d.params.splice(i, 1); renderParams(); };
          row.appendChild(k); row.appendChild(v); row.appendChild(del);
          paramWrap.appendChild(row);
        });
        var add = el("button", "btn"); add.type = "button"; add.textContent = "+ Parameter";
        add.onclick = function () { (d.params = d.params || []).push({ key: "", value: "" }); renderParams(); };
        paramWrap.appendChild(add);
      }
      renderParams();
      var tagsInp = field("Tags", el("input"), "Comma-separated groups for filtering (e.g. finance, demo). Anyone can slice the list by these.");
      tagsInp.type = "text"; tagsInp.value = (d.tags || []).join(", "); tagsInp.placeholder = "finance, demo";
      // Folder pilot slice (#21 org sub-item): a single primary "home" for the
      // dataset, distinct from tags (cross-cutting, multi-value). Free text
      // with a <datalist> of folders already in use so a name reuses instead
      // of forking into a near-duplicate.
      var folderInp = field("Folder", el("input"), "Optional — a home for this dataset (e.g. Finance, or Finance/2024 to nest). Pick an existing one or type a new name.");
      folderInp.type = "text"; folderInp.value = d.folder || ""; folderInp.placeholder = "e.g. Finance";
      var folderNames = {};
      Studio.Workspace.all("datasets").filter(isDatasetVisibleToMe).forEach(function (x) { if (x.folder) folderNames[x.folder] = true; });
      var folderList = el("datalist"); folderList.id = "dsxFolderOptions";
      Object.keys(folderNames).sort().forEach(function (f) { var o = el("option"); o.value = f; folderList.appendChild(o); });
      folderInp.setAttribute("list", "dsxFolderOptions");
      folderInp.parentNode.appendChild(folderList);
      var ownerInp = field("Owner", el("input"), "Optional — who to ask about this dataset.");
      ownerInp.type = "text"; ownerInp.value = d.owner || ""; ownerInp.placeholder = "e.g. kevin";
      b.appendChild(form);
      var result = el("div", "cx-test-result"); b.appendChild(result);
      var preview = el("div", "dsx-preview"); b.appendChild(preview);
      var foot = el("div", "cx-wiz-foot");
      var runBtn = el("button", "btn"); runBtn.type = "button"; runBtn.textContent = "Preview";
      var saveBtn = el("button", "btn primary"); saveBtn.type = "button"; saveBtn.textContent = existing ? "Save changes" : "Add dataset";
      foot.appendChild(runBtn); foot.appendChild(saveBtn); b.appendChild(foot);
      function collect() {
        d.name = nameInp.value.trim();
        d.desc = descInp.value.trim();
        d.connectionId = connSel.value;
        Object.keys(defInputs).forEach(function (k) { d[k] = defInputs[k].value; });
        d.params = (d.params || []).filter(function (p) { return p.key; });
        d.tags = tagsInp.value.split(",").map(function (t) { return t.trim().toLowerCase(); }).filter(Boolean);
        var folderVal = folderInp.value.trim();
        if (folderVal) d.folder = folderVal; else delete d.folder;
        d.owner = ownerInp.value.trim();
        return d;
      }
      runBtn.onclick = function () {
        collect();
        runBtn.disabled = true; runBtn.textContent = "Running…";
        result.className = "cx-test-result"; result.textContent = ""; preview.innerHTML = "";
        runDataset(d).then(function (r) {
          runBtn.disabled = false; runBtn.textContent = "Preview";
          if (r.error) { result.className = "cx-test-result bad"; result.textContent = "✕ " + r.error; return; }
          result.className = "cx-test-result ok"; result.textContent = "✓ " + r.rows.length + " rows · " + r.columns.length + " columns";
          var head = "<tr>" + r.columns.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr>";
          var body = r.rows.slice(0, 8).map(function (row) {
            return "<tr>" + row.map(function (v) { return "<td>" + esc(v == null ? "" : String(v)) + "</td>"; }).join("") + "</tr>";
          }).join("");
          preview.innerHTML = "<table>" + head + body + "</table>";
        });
      };
      saveBtn.onclick = function () {
        collect();
        if (!d.name) { nameInp.focus(); result.className = "cx-test-result bad"; result.textContent = "Give the dataset a name first."; return; }
        if (!d.connectionId) { connSel.focus(); result.className = "cx-test-result bad"; result.textContent = "Pick the connection this dataset runs against."; return; }
        if (!existing) { var newUid = currentUserId(); if (newUid) d.acctOwner = newUid; }
        Studio.Workspace.put("datasets", d);
        toast(existing ? "Saved " + d.name : "Added " + d.name);
        document.querySelector(".modal-ov .x").click();
        if (onSaved) onSaved(d);
      };
      nameInp.focus();
    }, function () { renderDatasets(); }, true);
  }

  Studio.Datasets = {
    configure: configure,
    render: renderDatasets,
    openEditor: openDatasetEditor,
    togglePrivate: toggleDsxPrivate,
    connOf: dsxConnOf,
    adapterOf: dsxAdapterOf,
    runnableDef: dsxRunnableDef
  };
})();
