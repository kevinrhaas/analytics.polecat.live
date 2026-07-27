/* ============================================================================
   connections.js — R5+ slice 8 (studio.js module extraction, tech-debt track):
   the Connections subsystem (workspace-level connections to external sources,
   the first plane of the connections → datasets → dashboards model) moves out
   of app/studio.js into its own module, following the chart-thumbnails.js/
   branding.js/defaults.js/celebrations.js/versions.js/explore.js/jobs.js
   extraction precedent (①-⑦). Like ⑤-⑦, this subsystem leans on studio.js's
   own private DOM/modal helpers plus its visibility/user-scoping and
   credential-field helpers, so it takes the same ONE-bundled-`configure(deps)`
   -call shape rather than an injected-callback-per-function. studio.js keeps
   thin same-named delegates (renderConnections, openConnectionWizard,
   toggleConnPrivate) at every original call site, and every window.__studio*
   test hook, so nothing outside this module needed to change. Pure refactor,
   no behavior change.
   Loads before studio.js (app/index.html). NEXT in this track: Datasets
   (last, since runDataset/window.__studioRunDataset bridges back into the
   builder preview, so it stays in studio.js and is only ever injected as a
   dependency, never moved).
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
    // top level (unlike this module's other top-level state), same one-time
    // init timing the inline studio.js code used to get for free.
    _connViewsStore = makeViewsStore("connectionViews");
    toggleConnPin = makePinToggle("connections", function () { renderConnections(); });
  }
  function $(sel, root) { return D.$(sel, root); }
  function $$(sel, root) { return D.$$(sel, root); }
  function el(t, c) { return D.el(t, c); }
  function modal(title, build, onClose, wide) { return D.modal(title, build, onClose, wide); }
  function toast(msg, isErr, celebrate) { return D.toast(msg, isErr, celebrate); }
  function isVisibleToMe(r) { return D.isVisibleToMe(r); }
  function currentUserId() { return D.currentUserId(); }
  function makeViewsStore(settingsKey) { return D.makeViewsStore(settingsKey); }
  function makePinToggle(table, rerender) { return D.makePinToggle(table, rerender); }
  function credentialFieldInput(idPrefix, f, savedValue, isNew) { return D.credentialFieldInput(idPrefix, f, savedValue, isNew); }

  /* ---------- Connections section ----------
     Workspace-level connections to external sources (one adapter each), the
     first plane of the connections → datasets → dashboards model. List UX
     follows the fleet's jobtracker patterns: adapter pills are MULTI-select
     (toggle any subset; none = all), plus free-text search; rows carry a
     status dot from the last Test result. Rows live in Studio.Workspace
     ('connections' table) so a remote workspace backend can mirror them. */
  var _connAdapterFilter = {}; // multi-select: adapterId -> true; empty = all
  var _connTagFilter = {};     // multi-select tag -> true; empty = all (tags-filter parity slice 1, #21 org sub-item)
  // Folder pilot slice 2 (#21 org sub-item — same flat single-value `folder`
  // string + single-select chip facet as Datasets' `_dsxFolderFilter`).
  var _connFolderFilter = ""; // "" = All, "__unfiled" = no folder, else a folder name
  // Post-overhaul backlog item 6 follow-up ("same treatment for the
  // Connections list"): identical saved-view contract to the Datasets
  // section's dsxLoadViews/dsxSaveViews/dsxApplyView, now including the tag
  // axis too (see _connTagFilter above). Own key in the same Workspace
  // SETTINGS bag — travels with the workspace, no new "Clear local data"
  // entry needed.
  var _connViewsStore = null; // set in configure()
  function connLoadViews() { return _connViewsStore.load(); }
  function connSaveViews(list) { _connViewsStore.save(list); }
  function connApplyView(v) {
    var inp = $("#connSearch"); if (inp) inp.value = v.q || "";
    _connAdapterFilter = {}; (v.adapters || []).forEach(function (a) { _connAdapterFilter[a] = true; });
    _connTagFilter = {}; (v.tags || []).forEach(function (t) { _connTagFilter[t] = true; });
    _connFolderFilter = v.folder || "";
    renderConnections();
  }
  // Post-overhaul backlog item 7 ("organization at scale"): a favorite flag on
  // the row itself, same additive/syncing shape as the Dashboards `pinned`/
  // `pinnedAt` fields (togglePin above) — pinned connections sort to the top
  // of the catalog so a fast-growing list stays navigable without committing
  // to the still-undecided folders/tags grouping model.
  var toggleConnPin = null; // set in configure()
  // M4.2 slice 2 (per-section rights + object privacy — connections): same
  // `private`/`owner` shape + `isVisibleToMe` helper as dashboards (slice 1).
  // A connection often carries credentials, so hiding it from other accounts'
  // catalogs (and the connection-picker in the dataset editor) matters even
  // more here than for dashboards.
  function toggleConnPrivate(id) {
    var W = Studio.Workspace, r = W.get("connections", id);
    if (!r) return;
    if (r.private) { delete r.private; }
    else {
      r.private = true;
      if (!r.owner) { var uid = currentUserId(); if (uid) r.owner = uid; }
    }
    W.put("connections", r);
    toast(r.private ? "Private — only you can see this" : "Public — visible to everyone");
    renderConnections();
  }
  function connStatusDot(c) {
    var t = c.lastTest;
    var cls = !t ? "cx-dot" : (t.ok ? "cx-dot ok" : "cx-dot bad");
    var tip = !t ? "Never tested" : (t.ok ? "Test OK" : "Test failed: " + (t.error || "")) + " · " + new Date(t.at).toLocaleString();
    return '<span class="' + cls + '" data-tip="' + esc(tip) + '"></span>';
  }
  // QA-02: the Connections header used to unconditionally claim credentials
  // "stay in this browser" — false once a workspace backend is connected,
  // since sync.js mirrors connection rows there (plaintext unless encryption
  // is on). State-aware copy, shared with the Settings card below.
  function connCredentialCopy() {
    var st = Studio.Sync.syncState();
    if (!st.isRemote) return { text: "Credentials stay in this browser.", warn: false };
    var sec = Studio.Sync.secretsState();
    return sec.enabled
      ? { text: "Credentials sync to " + st.label + " as encrypted ciphertext.", warn: false }
      : { text: "Credentials sync to " + st.label + " as PLAINTEXT — encryption is off.", warn: true };
  }
  function renderConnections() {
    var results = $("#connResults"); if (!results) return;
    var credNote = $("#connCredNote");
    if (credNote) {
      var cc = connCredentialCopy();
      credNote.textContent = cc.text;
      credNote.classList.toggle("cx-cred-warn", cc.warn);
    }
    var q = (($("#connSearch") || {}).value || "").toLowerCase();
    var list = Studio.Workspace.all("connections").filter(isVisibleToMe).sort(function (a, b) {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      if (a.pinned) return (b.pinnedAt || "").localeCompare(a.pinnedAt || "");
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    // adapter pills: one per adapter present, multi-select (empty selection = all)
    var counts = {}, tagCounts = {}, folderCounts = {}, folderUnfiled = 0;
    list.forEach(function (c) {
      counts[c.adapter] = (counts[c.adapter] || 0) + 1;
      (c.tags || []).forEach(function (t) { tagCounts[t] = (tagCounts[t] || 0) + 1; });
      if (c.folder) folderCounts[c.folder] = (folderCounts[c.folder] || 0) + 1; else folderUnfiled++;
    });
    Object.keys(_connAdapterFilter).forEach(function (k) { if (!counts[k]) delete _connAdapterFilter[k]; });
    Object.keys(_connTagFilter).forEach(function (k) { if (!tagCounts[k]) delete _connTagFilter[k]; });
    if (_connFolderFilter && _connFolderFilter !== "__unfiled" && !folderCounts[_connFolderFilter]) _connFolderFilter = "";
    var anyFilter = Object.keys(_connAdapterFilter).length > 0;
    var anyTag = Object.keys(_connTagFilter).length > 0;
    var anyConnFolder = !!_connFolderFilter;
    var pills = Object.keys(counts).sort().map(function (aid) {
      var src = Studio.sourceById(aid) || { label: aid };
      return '<button type="button" class="wb-chip cx-pill' + (_connAdapterFilter[aid] ? " active" : "") + '" data-conn-adapter="' + esc(aid) + '" aria-pressed="' + (_connAdapterFilter[aid] ? "true" : "false") + '">' +
        '<span class="cx-pill-dot" style="background:' + esc(src.accent || "var(--brand)") + '"></span>' +
        '<span class="wb-chip-label">' + esc(src.label) + '</span> <span class="wb-chip-n">' + counts[aid] + '</span></button>';
    }).join("");
    var pillsT = Object.keys(tagCounts).sort().map(function (t) {
      return '<button type="button" class="wb-chip cx-pill' + (_connTagFilter[t] ? " active" : "") + '" data-conn-tag="' + esc(t) + '" aria-pressed="' + (_connTagFilter[t] ? "true" : "false") + '">' +
        '<span class="wb-chip-label">#' + esc(t) + '</span> <span class="wb-chip-n">' + tagCounts[t] + '</span></button>';
    }).join("");
    // Folder facet (single-select, mirrors Datasets' pillsF): only appears
    // once at least one connection has been filed.
    var pillsFConn = Object.keys(folderCounts).length
      ? ['<button type="button" class="wb-chip cx-pill' + (!_connFolderFilter ? " active" : "") + '" data-conn-folder="" aria-pressed="' + (!_connFolderFilter ? "true" : "false") + '">' +
          '<span class="wb-chip-label">All folders</span> <span class="wb-chip-n">' + list.length + '</span></button>']
        .concat(Object.keys(folderCounts).sort().map(function (f) {
          return '<button type="button" class="wb-chip cx-pill' + (_connFolderFilter === f ? " active" : "") + '" data-conn-folder="' + esc(f) + '" aria-pressed="' + (_connFolderFilter === f ? "true" : "false") + '">' +
            '<span class="wb-chip-label">' + esc(f) + '</span> <span class="wb-chip-n">' + folderCounts[f] + '</span></button>';
        }))
        .concat(['<button type="button" class="wb-chip cx-pill' + (_connFolderFilter === "__unfiled" ? " active" : "") + '" data-conn-folder="__unfiled" aria-pressed="' + (_connFolderFilter === "__unfiled" ? "true" : "false") + '">' +
          '<span class="wb-chip-label">Unfiled</span> <span class="wb-chip-n">' + folderUnfiled + '</span></button>'])
        .join("")
      : "";
    var connViews = connLoadViews();
    var pillsV = connViews.map(function (v) {
      return '<div class="wb-chip-wrap">' +
        '<button type="button" class="wb-chip" data-conn-view="' + esc(v.id) + '" title="Apply saved view “' + esc(v.name) + '”">' +
          '<span class="wb-chip-label">' + esc(v.name) + '</span></button>' +
        '<button type="button" class="wb-chip-del" data-conn-view-del="' + esc(v.id) + '" title="Delete view ' + esc(v.name) + '" aria-label="Delete view ' + esc(v.name) + '"></button>' +
        '</div>';
    }).join("");
    var canSaveConnView = !!(q || anyFilter || anyTag || anyConnFolder);
    var connViewAddHtml = canSaveConnView
      ? '<span class="wb-add"><input type="text" id="connViewNameInp" class="wb-name-inp" placeholder="Name this view…" aria-label="Name this saved view"/>' +
        '<button type="button" class="btn" id="connViewAddBtn">+ Save view</button></span>'
      : "";
    var shown = list.filter(function (c) {
      if (anyFilter && !_connAdapterFilter[c.adapter]) return false;
      if (anyTag && !(c.tags || []).some(function (t) { return _connTagFilter[t]; })) return false;
      if (_connFolderFilter === "__unfiled") { if (c.folder) return false; }
      else if (_connFolderFilter) { if (c.folder !== _connFolderFilter) return false; }
      if (!q) return true;
      var src = Studio.sourceById(c.adapter) || {};
      var cfgHay = Object.keys(c.cfg || {}).map(function (k) {
        // never match on secrets
        var f = (src.fields || []).filter(function (x) { return x.key === k; })[0];
        return f && f.type === "password" ? "" : String(c.cfg[k] || "");
      }).join(" ");
      return (c.name + " " + (src.label || c.adapter) + " " + cfgHay + " " + (c.tags || []).join(" ") + " " + (c.folder || "")).toLowerCase().indexOf(q) >= 0;
    });
    var rows = shown.map(function (c) {
      var src = Studio.sourceById(c.adapter) || { label: c.adapter, icon: "db" };
      var metaBadge = src.caps && src.caps.meta ? '<span class="cx-badge" data-tip="Can also host this app\'s workspace (see Settings → Workspace backend)">workspace-capable</span>' : "";
      var tagBadges = (c.tags || []).map(function (t) { return '<span class="cx-badge">#' + esc(t) + '</span>'; }).join("");
      var folderBadge = c.folder ? '<span class="cx-badge cx-folder" data-tip="Folder: ' + esc(c.folder) + '">' + esc(c.folder) + '</span>' : "";
      return '<div class="cx-row" data-conn-id="' + esc(c.id) + '">' +
        connStatusDot(c) +
        '<span class="cx-ic" style="color:' + esc(src.accent || "var(--brand)") + '"></span>' +
        '<span class="cx-name"><button type="button" class="cx-title-btn" title="' + esc(c.name) + ' — edit connection" aria-label="Edit connection ' + esc(c.name) + '"><b>' + esc(c.name) + '</b></button><small>' + esc(src.label || c.adapter) + '</small></span>' +
        metaBadge +
        folderBadge +
        tagBadges +
        '<span class="cx-when" data-tip="Last edited">' + esc(new Date(c.updatedAt || c.createdAt || Date.now()).toLocaleDateString()) + '</span>' +
        '<button type="button" class="cx-private' + (c.private ? " private" : "") + '" data-conn-private="' + esc(c.id) + '" title="' + (c.private ? "Private — only you can see this" : "Make private") + '" aria-label="' + (c.private ? "Make " + esc(c.name) + " public" : "Make " + esc(c.name) + " private") + '" aria-pressed="' + (c.private ? "true" : "false") + '"></button>' +
        '<button type="button" class="cx-pin' + (c.pinned ? " on" : "") + '" data-conn-pin="' + esc(c.id) + '" title="' + (c.pinned ? "Unpin" : "Pin to top") + '" aria-label="' + (c.pinned ? "Unpin " : "Pin ") + esc(c.name) + '" aria-pressed="' + (c.pinned ? "true" : "false") + '"></button>' +
        '<span class="cx-actions">' +
          '<button type="button" class="btn" data-conn-test="' + esc(c.id) + '">Test</button>' +
          '<button type="button" class="btn" data-conn-edit="' + esc(c.id) + '">Edit</button>' +
          '<button type="button" class="btn" data-conn-del="' + esc(c.id) + '" aria-label="Delete ' + esc(c.name) + '">✕</button>' +
        '</span></div>';
    });
    results.innerHTML =
      (pillsFConn ? '<div class="wb-chips">' + pillsFConn + '</div>' : "") +
      (pills || pillsT || pillsV || connViewAddHtml ? '<div class="wb-chips cx-pills">' +
        pillsV + (pillsV && (pills || pillsT) ? '<span class="dsx-pill-sep"></span>' : "") +
        pills + (pills && pillsT ? '<span class="dsx-pill-sep"></span>' : "") +
        pillsT +
        ((anyFilter || anyTag || anyConnFolder) ? '<button type="button" class="wb-chip" id="connPillClear" title="Show all connections">Clear</button>' : "") +
        connViewAddHtml + '</div>' : "") +
      (rows.length ? '<div class="cx-list">' + rows.join("") + '</div>'
        : '<div class="cx-empty">' +
            (q || anyFilter || anyTag || anyConnFolder ? "No connections match." :
              "<b>No connections yet.</b><br/>A connection points at where your data lives — a warehouse, a file over HTTP, an API — using one of the built-in adapters. Datasets are then defined on top of a connection and feed your dashboards.") +
            (q || anyFilter || anyTag || anyConnFolder ? "" : '<br/><button type="button" class="btn primary" id="connEmptyNew">+ New connection</button>') +
          '</div>');
    Studio.Tooltip.hydrate(results);
    $$("[data-conn-adapter]", results).forEach(function (btn) {
      btn.onclick = function () {
        var k = btn.getAttribute("data-conn-adapter");
        if (_connAdapterFilter[k]) delete _connAdapterFilter[k]; else _connAdapterFilter[k] = true;
        renderConnections();
      };
    });
    $$("[data-conn-tag]", results).forEach(function (btn) {
      btn.onclick = function () {
        var k = btn.getAttribute("data-conn-tag");
        if (_connTagFilter[k]) delete _connTagFilter[k]; else _connTagFilter[k] = true;
        renderConnections();
      };
    });
    $$("[data-conn-folder]", results).forEach(function (btn) {
      btn.onclick = function () { _connFolderFilter = btn.getAttribute("data-conn-folder"); renderConnections(); };
    });
    var clearBtn = $("#connPillClear", results);
    if (clearBtn) clearBtn.onclick = function () { _connAdapterFilter = {}; _connTagFilter = {}; _connFolderFilter = ""; renderConnections(); };
    $$("[data-conn-view]", results).forEach(function (btn) {
      btn.onclick = function () {
        var v = connLoadViews().filter(function (x) { return x.id === btn.getAttribute("data-conn-view"); })[0];
        if (v) connApplyView(v);
      };
    });
    $$("[data-conn-view-del]", results).forEach(function (btn) {
      btn.appendChild(Studio.icon("trash", 9));
      btn.onclick = function (e) {
        e.stopPropagation();
        var id = btn.getAttribute("data-conn-view-del");
        var v = connLoadViews().filter(function (x) { return x.id === id; })[0];
        if (!v) return;
        if (confirm('Delete saved view "' + v.name + '"?')) {
          connSaveViews(connLoadViews().filter(function (x) { return x.id !== id; }));
          renderConnections();
        }
      };
    });
    var connViewAddBtn = $("#connViewAddBtn", results);
    if (connViewAddBtn) connViewAddBtn.onclick = function () {
      var inp = $("#connViewNameInp", results);
      var name = inp ? inp.value.trim() : "";
      if (!name) { if (inp) inp.focus(); toast("Type a name in the box first — e.g. “Warehouses”.", true); return; }
      var list = connLoadViews();
      var rawQ = (($("#connSearch") || {}).value || "");
      list.unshift({ id: "connv" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name, q: rawQ, adapters: Object.keys(_connAdapterFilter), tags: Object.keys(_connTagFilter), folder: _connFolderFilter });
      connSaveViews(list);
      toast('View "' + name + '" saved');
      renderConnections();
    };
    var connViewNameInp = $("#connViewNameInp", results);
    if (connViewNameInp) connViewNameInp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); connViewAddBtn.click(); } });
    var emptyNew = $("#connEmptyNew", results);
    if (emptyNew) emptyNew.onclick = function () { openConnectionWizard(); };
    // paint adapter icons (inline SVG so theming is free)
    $$(".cx-row", results).forEach(function (row) {
      var c = Studio.Workspace.get("connections", row.getAttribute("data-conn-id"));
      var src = c && Studio.sourceById(c.adapter);
      var icEl = row.querySelector(".cx-ic");
      if (icEl && src) icEl.appendChild(Studio.icon(src.icon || "db", 18));
      row.addEventListener("click", function (e) {
        if (e.target.closest("[data-conn-pin],[data-conn-private],[data-conn-test],[data-conn-edit],[data-conn-del]")) return;
        openConnectionWizard(c);
      });
    });
    $$(".cx-pin", results).forEach(function (btn) {
      btn.appendChild(Studio.icon("star", 14));
      btn.onclick = function (e) { e.stopPropagation(); toggleConnPin(btn.getAttribute("data-conn-pin")); };
    });
    $$(".cx-private", results).forEach(function (btn) {
      btn.appendChild(Studio.icon("lock", 14));
      btn.onclick = function (e) { e.stopPropagation(); toggleConnPrivate(btn.getAttribute("data-conn-private")); };
    });
    $$("[data-conn-test]", results).forEach(function (btn) {
      btn.onclick = function () {
        var c = Studio.Workspace.get("connections", btn.getAttribute("data-conn-test"));
        if (!c) return;
        btn.disabled = true; btn.textContent = "Testing…";
        testConnectionRow(c).then(function () { renderConnections(); });
      };
    });
    $$("[data-conn-edit]", results).forEach(function (btn) {
      btn.onclick = function () { openConnectionWizard(Studio.Workspace.get("connections", btn.getAttribute("data-conn-edit"))); };
    });
    $$("[data-conn-del]", results).forEach(function (btn) {
      btn.onclick = function () {
        var c = Studio.Workspace.get("connections", btn.getAttribute("data-conn-del"));
        if (!c) return;
        var used = Studio.Workspace.all("datasets").filter(function (d) { return d.connectionId === c.id; });
        var msg = used.length
          ? 'Delete connection "' + c.name + '"? ' + used.length + " dataset" + (used.length > 1 ? "s" : "") + " reference" + (used.length > 1 ? "" : "s") + " it and will stop running."
          : 'Delete connection "' + c.name + '"?';
        if (!window.confirm(msg)) return;
        Studio.Workspace.remove("connections", c.id);
        toast("Deleted " + c.name);
      };
    });
  }
  // Run the right plane's test for a connection row and persist the outcome
  // on the row itself, so the list's status dot reflects reality across reloads.
  function testConnectionRow(c) {
    var src = Studio.sourceById(c.adapter);
    if (!src) return Promise.resolve({ ok: false, error: "Unknown adapter " + c.adapter });
    var fn = src.caps && src.caps.data ? src.testData : src.test;
    return fn.call(src, c.cfg || {}).then(function (r) {
      c.lastTest = { ok: !!r.ok, error: r.ok ? "" : (r.error || "failed"), at: Date.now() };
      Studio.Workspace.put("connections", c, { silent: true });
      toast(r.ok ? "Connection OK" : "Test failed: " + (r.error || ""), !r.ok);
      return r;
    });
  }
  // Post-overhaul backlog item 5 ("dataset delight" — the schema-browser
  // half): renders adapter.listSchema()'s {tables:[{schema,name,columns}]}
  // as a filterable, per-table-expandable tree inside the connection
  // wizard's schema panel. A pure render function so it's easy to call from
  // both the fetch-success path and (via renderSchemaPanel(panel, r)) tests.
  function renderSchemaPanel(panel, r) {
    panel.innerHTML = "";
    if (r && r.error) {
      var err = el("div", "cx-schema-status bad"); err.textContent = "✕ " + r.error; panel.appendChild(err); return;
    }
    var tables = (r && r.tables) || [];
    if (!tables.length) {
      var empty = el("div", "cx-schema-status"); empty.textContent = "No tables found — check the connection's credentials cover schema-read access.";
      panel.appendChild(empty); return;
    }
    var filterRow = el("div", "cx-schema-filter");
    var filterInp = el("input"); filterInp.type = "text"; filterInp.placeholder = "Filter tables…"; filterInp.setAttribute("aria-label", "Filter tables");
    filterRow.appendChild(filterInp); panel.appendChild(filterRow);
    var list = el("div", "cx-schema-list"); panel.appendChild(list);
    var rows = tables.map(function (t) {
      var det = document.createElement("details"); det.className = "cx-schema-table";
      var summary = document.createElement("summary");
      var n = (t.columns || []).length;
      summary.innerHTML = "<b>" + esc(t.name) + "</b>" + (t.schema ? " <small>" + esc(t.schema) + "</small>" : "") +
        ' <span class="cx-schema-n">' + n + " col" + (n === 1 ? "" : "s") + "</span>";
      det.appendChild(summary);
      var colList = el("ul", "cx-schema-cols");
      (t.columns || []).forEach(function (c) {
        var li = document.createElement("li");
        li.innerHTML = '<span class="cx-schema-col">' + esc(c.name) + '</span><span class="cx-schema-type">' + esc(c.type || "") + "</span>";
        colList.appendChild(li);
      });
      det.appendChild(colList);
      list.appendChild(det);
      return { el: det, needle: ((t.schema || "") + " " + t.name).toLowerCase() };
    });
    filterInp.oninput = function () {
      var q = filterInp.value.trim().toLowerCase();
      rows.forEach(function (row) { row.el.hidden = !!q && row.needle.indexOf(q) === -1; });
    };
  }
  // The 2-step connect wizard (manager pattern): pick an adapter → name +
  // credential fields (from adapter.fields) with an inline Test. Editing an
  // existing connection opens straight at step 2.
  function openConnectionWizard(existing) {
    var src = existing ? Studio.sourceById(existing.adapter) : null;
    modal(existing ? "Edit connection" : "New connection", function (b) {
      function step2(adapter) {
        b.innerHTML = "";
        var head = el("div", "cx-wiz-head");
        var ic = el("span", "cx-wiz-ic"); ic.style.color = adapter.accent || "var(--brand)"; ic.appendChild(Studio.icon(adapter.icon || "db", 22));
        var ttl = el("div", "cx-wiz-ttl");
        ttl.innerHTML = "<b>" + esc(adapter.label) + "</b><small>" + esc(adapter.blurb || "") + "</small>";
        head.appendChild(ic); head.appendChild(ttl); b.appendChild(head);
        var form = el("div", "cx-wiz-form");
        var nameRow = el("label", "cx-field");
        nameRow.innerHTML = '<span>Connection name</span>';
        var nameInp = el("input"); nameInp.type = "text"; nameInp.value = existing ? existing.name : adapter.label;
        nameInp.placeholder = "e.g. Prod warehouse";
        nameRow.appendChild(nameInp); form.appendChild(nameRow);
        var inputs = {};
        (adapter.fields || []).forEach(function (f) {
          var row = el("label", "cx-field");
          row.innerHTML = "<span>" + esc(f.label) + "</span>";
          var savedValue = existing && existing.cfg && existing.cfg[f.key];
          var inp = credentialFieldInput("cx-cred-" + adapter.id, f, savedValue, !existing);
          row.appendChild(inp.__revealWrap || inp);
          if (f.hint) { var h = el("small", "cx-hint"); h.textContent = f.hint; row.appendChild(h); }
          form.appendChild(row); inputs[f.key] = inp;
        });
        var tagsRow = el("label", "cx-field");
        tagsRow.innerHTML = "<span>Tags</span>";
        var tagsInp = el("input"); tagsInp.type = "text"; tagsInp.placeholder = "finance, demo";
        tagsInp.value = (existing && existing.tags || []).join(", ");
        tagsRow.appendChild(tagsInp);
        var tagsHint = el("small", "cx-hint"); tagsHint.textContent = "Comma-separated groups for filtering (e.g. finance, demo). Anyone can slice the list by these.";
        tagsRow.appendChild(tagsHint);
        form.appendChild(tagsRow);
        // Folder pilot slice 2 (#21 org sub-item): same single-value "home"
        // field as Datasets, with a <datalist> of folders already in use
        // (filtered through isVisibleToMe so a private connection's folder
        // name doesn't leak into another account's suggestions).
        var folderRow = el("label", "cx-field");
        folderRow.innerHTML = "<span>Folder</span>";
        var folderInp = el("input"); folderInp.type = "text"; folderInp.placeholder = "e.g. Finance";
        folderInp.value = (existing && existing.folder) || "";
        folderRow.appendChild(folderInp);
        var folderHint = el("small", "cx-hint"); folderHint.textContent = "Optional — a home for this connection (e.g. Finance, or Finance/2024 to nest). Pick an existing one or type a new name.";
        folderRow.appendChild(folderHint);
        var connFolderNames = {};
        Studio.Workspace.all("connections").filter(isVisibleToMe).forEach(function (x) { if (x.folder) connFolderNames[x.folder] = true; });
        var connFolderList = el("datalist"); connFolderList.id = "connFolderOptions";
        Object.keys(connFolderNames).sort().forEach(function (f) { var o = el("option"); o.value = f; connFolderList.appendChild(o); });
        folderInp.setAttribute("list", "connFolderOptions");
        folderRow.appendChild(connFolderList);
        form.appendChild(folderRow);
        b.appendChild(form);
        if (adapter.docsUrl) {
          var docs = el("div", "cx-docs");
          docs.innerHTML = 'Where do these values come from? <a href="' + esc(adapter.docsUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(adapter.docsUrl.replace(/^https?:\/\//, "").split("/")[0]) + ' docs ↗</a>';
          b.appendChild(docs);
        }
        var result = el("div", "cx-test-result"); b.appendChild(result);
        var foot = el("div", "cx-wiz-foot");
        var testBtn = el("button", "btn"); testBtn.type = "button"; testBtn.textContent = "Test connection";
        var schemaBtn = null;
        if (adapter.listSchema) { schemaBtn = el("button", "btn cx-schema-btn"); schemaBtn.type = "button"; schemaBtn.textContent = "Browse schema"; }
        var saveBtn = el("button", "btn primary"); saveBtn.type = "button"; saveBtn.textContent = existing ? "Save changes" : "Add connection";
        foot.appendChild(testBtn); if (schemaBtn) foot.appendChild(schemaBtn); foot.appendChild(saveBtn); b.appendChild(foot);
        var schemaPanel = null;
        if (schemaBtn) { schemaPanel = el("div", "cx-schema"); schemaPanel.hidden = true; b.appendChild(schemaPanel); }
        function cfg() {
          var o = {};
          Object.keys(inputs).forEach(function (k) { var v = inputs[k].value.trim(); if (v) o[k] = v; });
          return o;
        }
        var lastInlineTest = existing ? existing.lastTest : null;
        testBtn.onclick = function () {
          testBtn.disabled = true; testBtn.textContent = "Testing…";
          result.className = "cx-test-result"; result.textContent = "";
          var fn = adapter.caps && adapter.caps.data ? adapter.testData : adapter.test;
          fn.call(adapter, cfg()).then(function (r) {
            testBtn.disabled = false; testBtn.textContent = "Test connection";
            lastInlineTest = { ok: !!r.ok, error: r.ok ? "" : (r.error || "failed"), at: Date.now() };
            result.className = "cx-test-result " + (r.ok ? "ok" : "bad");
            result.textContent = r.ok ? "✓ Connection works" : "✕ " + (r.error || "Test failed");
          });
        };
        if (schemaBtn) schemaBtn.onclick = function () {
          schemaBtn.disabled = true; schemaBtn.textContent = "Loading schema…";
          schemaPanel.hidden = false;
          schemaPanel.innerHTML = '<div class="cx-schema-status">Loading…</div>';
          adapter.listSchema(cfg()).then(function (r) {
            schemaBtn.disabled = false; schemaBtn.textContent = "Browse schema";
            renderSchemaPanel(schemaPanel, r);
          });
        };
        saveBtn.onclick = function () {
          var name = nameInp.value.trim();
          if (!name) { nameInp.focus(); result.className = "cx-test-result bad"; result.textContent = "Give the connection a name first."; return; }
          var row = existing || { id: Studio.Workspace.uid("conn") };
          row.name = name; row.adapter = adapter.id; row.cfg = cfg();
          row.tags = tagsInp.value.split(",").map(function (t) { return t.trim().toLowerCase(); }).filter(Boolean);
          var connFolderVal = folderInp.value.trim();
          if (connFolderVal) row.folder = connFolderVal; else delete row.folder;
          if (lastInlineTest) row.lastTest = lastInlineTest;
          if (!existing) { var newUid = currentUserId(); if (newUid) row.owner = newUid; }
          Studio.Workspace.put("connections", row);
          toast(existing ? "Saved " + name : "Added " + name);
          document.querySelector(".modal-ov .x").click();
        };
        nameInp.focus();
      }
      if (src) { step2(src); return; }
      // step 1: adapter picker — every data-capable adapter (a connection is a
      // place datasets read from; the local workspace store is not that)
      var grid = el("div", "cx-src-grid");
      Studio.dataSources().forEach(function (adapter) {
        var card = el("button", "cx-src-card"); card.type = "button";
        card.style.setProperty("--src-accent", adapter.accent || "var(--brand)");
        var ic = el("span", "cx-src-ic"); ic.appendChild(Studio.icon(adapter.icon || "db", 22));
        var txt = el("span", "cx-src-txt");
        txt.innerHTML = "<b>" + esc(adapter.label) + "</b><small>" + esc(adapter.blurb || "") + "</small>" +
          (adapter.caps && adapter.caps.meta ? '<span class="cx-badge">workspace-capable</span>' : "");
        card.appendChild(ic); card.appendChild(txt);
        card.onclick = function () { step2(adapter); };
        grid.appendChild(card);
      });
      var intro = el("p", "cx-wiz-intro");
      intro.textContent = "Choose a source below. Some connectors require browser CORS access or a link-shared file.";
      b.appendChild(intro); b.appendChild(grid);
    }, function () { renderConnections(); }, true);
  }

  Studio.Connections = {
    configure: configure,
    render: renderConnections,
    openWizard: openConnectionWizard,
    togglePrivate: toggleConnPrivate
  };
})();
