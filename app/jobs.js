/* ============================================================================
   jobs.js — R5+ slice 7 (studio.js module extraction, tech-debt track):
   the Jobs "data-management-lite" subsystem (Viridis V8) — prep pipelines
   (rename/cast/derive/filter/aggregate/join/union/sql) that read one source
   dataset's live rows and materialize the result back as a re-runnable
   kind:'file' dataset. Follows the chart-thumbnails.js/branding.js/
   defaults.js/celebrations.js/versions.js/explore.js extraction precedent
   (①-⑥): as entangled with studio.js's private DOM/modal + visibility/user
   helpers as the versions/notes UI half and Explore were, so it takes the
   SAME shape — ONE bundled Studio.Jobs.configure(deps) call from studio.js
   at boot, instead of an injected-callback-per-function. studio.js keeps
   thin same-named delegates (renderJobs, openJobEditor, runJob,
   toggleJobPrivate) at every original call site, and every window.__studio*
   test hook, so nothing outside this module needed to change. Pure
   refactor, no behavior change.
   Loads before studio.js (app/index.html).
   ============================================================================ */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};
  function esc(s) { return Studio.escapeHtml(s); }

  // D holds every studio.js-private helper this module needs, injected once
  // via configure() — see the header comment.
  var D = null;
  function configure(deps) { D = deps; }
  function $(sel, root) { return D.$(sel, root); }
  function $$(sel, root) { return D.$$(sel, root); }
  function el(t, c) { return D.el(t, c); }
  function modal(title, build, onClose, wide) { return D.modal(title, build, onClose, wide); }
  function toast(msg, isErr, celebrate) { return D.toast(msg, isErr, celebrate); }
  function isVisibleToMe(r) { return D.isVisibleToMe(r); }
  function isDatasetVisibleToMe(r) { return D.isDatasetVisibleToMe(r); }
  function currentUserId() { return D.currentUserId(); }
  function runDataset(ds) { return D.runDataset(ds); }
  function guessFieldKind(colName, vals) { return D.guessFieldKind(colName, vals); }
  function withSparkleButton(inp, kind, getCtx) { return D.withSparkleButton(inp, kind, getCtx); }

  /* ---------- Jobs (Viridis V8: data-management-lite) ---------------------
     A job reads ONE source dataset's live rows through a rename/cast/derive/
     filter/aggregate/join/union/sql pipeline (app/sources/jobs-engine.js) and
     materializes the result back as an ordinary kind:'file' dataset —
     tagged "job-output" and re-written in place on every re-run via
     job.outputDatasetId — so the result is chartable in Explore/Studio with
     zero new dataset-kind code. The 'sql' step (slice 3) runs its query
     against DuckDB-Wasm (lazy-loaded, see app/duckdb.js) over the pipeline's
     CURRENT rows as table "t" — Studio.runJobStepsAsync is the async
     orchestrator that splits a job's steps at 'sql' boundaries and calls
     duckSqlRunner for each one; jobs with no 'sql' step never touch it. */
  function duckSqlRunner(columns, rows, query) {
    return Studio.DuckDB.queryRows(columns, rows, query);
  }
  function jobOutputConnection() {
    var existing = Studio.Workspace.all("connections").filter(function (c) { return c.jobOutputs; })[0];
    if (existing) return existing;
    return Studio.Workspace.put("connections", { name: "Job outputs", adapter: "file", cfg: {}, jobOutputs: true });
  }
  // Runs every dataset a job's join/union steps reference (the engine stays
  // pure/synchronous, so this is the async pre-fetch the engine can't do
  // itself) and hands back {datasets:{id:{columns,rows}}} for runJobSteps.
  function resolveJobCtx(steps) {
    var ids = Studio.jobStepDatasetIds(steps);
    if (!ids.length) return Promise.resolve({ datasets: {} });
    return Promise.all(ids.map(function (id) {
      var ds = Studio.Workspace.get("datasets", id);
      if (!ds) return { id: id, columns: [], rows: [] };
      return runDataset(ds).then(function (r) {
        return { id: id, columns: r.error ? [] : r.columns, rows: r.error ? [] : r.rows };
      });
    })).then(function (results) {
      var datasets = {};
      results.forEach(function (x) { datasets[x.id] = { columns: x.columns, rows: x.rows }; });
      return { datasets: datasets };
    });
  }
  function runJob(job) {
    var src = Studio.Workspace.get("datasets", job.sourceDatasetId);
    if (!src) {
      job.lastRun = { ok: false, error: "No source dataset selected.", at: Date.now(), rows: 0 };
      Studio.Workspace.put("jobs", job, { silent: true });
      return Promise.resolve({ error: job.lastRun.error });
    }
    return runDataset(src).then(function (r) {
      if (r.error) {
        job.lastRun = { ok: false, error: r.error, at: Date.now(), rows: 0 };
        Studio.Workspace.put("jobs", job, { silent: true });
        return r;
      }
      return resolveJobCtx(job.steps).then(function (ctx) {
        return Studio.runJobStepsAsync({ columns: r.columns, rows: r.rows }, job.steps || [], ctx, duckSqlRunner);
      }).then(function (out) {
        if (out.error) {
          job.lastRun = { ok: false, error: out.error, at: Date.now(), rows: 0 };
          Studio.Workspace.put("jobs", job, { silent: true });
          return out;
        }
        var row = (job.outputDatasetId && Studio.Workspace.get("datasets", job.outputDatasetId)) ||
          { id: Studio.Workspace.uid("ds"), connectionId: jobOutputConnection().id, tags: [] };
        row.name = job.outputName || (job.name + " (job output)");
        row.kind = "file"; row.format = "csv";
        row.fileName = row.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase() + ".csv";
        row.content = Studio.rowsToCsv(out.columns, out.rows);
        row.columns = out.columns.slice();
        row.jobId = job.id;
        if ((row.tags || []).indexOf("job-output") < 0) row.tags = (row.tags || []).concat(["job-output"]);
        Studio.Workspace.put("datasets", row);
        job.outputDatasetId = row.id;
        job.lastRun = { ok: true, error: "", at: Date.now(), rows: out.rows.length };
        Studio.Workspace.put("jobs", job);
        return { columns: out.columns, rows: out.rows, outputDatasetId: row.id };
      });
    });
  }
  // Post-overhaul backlog item 5 ("scheduled refresh hints"): a job can opt into a periodic
  // reminder (refreshEveryDays) — this is a HINT, not real scheduling (the app is static/
  // client-side with no server to run a cron), so it just flags staleness against the job's
  // own lastRun stamp next time someone has the Jobs list open. Never run + a reminder set
  // counts as due (nothing to be "on time" against yet).
  function jobRefreshBadge(j) {
    if (!j.refreshEveryDays) return "";
    var everyMs = j.refreshEveryDays * 86400000;
    var last = j.lastRun && j.lastRun.ok ? j.lastRun.at : null;
    var dueAt = last != null ? last + everyMs : null;
    var now = Date.now();
    if (dueAt == null || dueAt <= now) {
      var overdueTitle = last != null
        ? "Last ran " + esc(new Date(last).toLocaleDateString()) + " — overdue for its " + j.refreshEveryDays + "-day reminder"
        : "Never run — reminder set for every " + j.refreshEveryDays + " days";
      return '<span class="cx-badge cx-refresh-due" data-tip="' + overdueTitle + '">⏰ Refresh due</span>';
    }
    var daysLeft = Math.ceil((dueAt - now) / 86400000);
    return '<span class="cx-badge" data-tip="Reminder every ' + j.refreshEveryDays + ' days">Refreshes in ' + daysLeft + " day" + (daysLeft === 1 ? "" : "s") + '</span>';
  }
  // M4.2 slice 5 (per-section rights + object privacy — jobs, the last object type):
  // same `private`/`owner` shape + plain `isVisibleToMe` helper as analyses — jobs
  // have no pre-existing `owner` field, so no acctOwner-style rename is needed here.
  function toggleJobPrivate(id) {
    var W = Studio.Workspace, j = W.get("jobs", id);
    if (!j) return;
    if (j.private) { delete j.private; }
    else {
      j.private = true;
      if (!j.owner) { var uid = currentUserId(); if (uid) j.owner = uid; }
    }
    W.put("jobs", j);
    toast(j.private ? "Private — only you can see this" : "Public — visible to everyone");
    renderJobs();
  }
  // M5 folder pilot, slice 3 (jobs): same single-select facet shape as
  // Datasets'/Connections' `_dsxFolderFilter`/`_connFolderFilter` — Jobs had no
  // search/filter UI of its own before this, so this also introduces the
  // section's first search box (title/source/output/folder text match).
  var _jobsFolderFilter = ""; // "" = All, "__unfiled" = no folder, else a folder name
  // LF51 (d): list ⇆ tile view, same as Datasets/Connections — device-remembered.
  var _jobsViewMode = "list";
  try { _jobsViewMode = localStorage.getItem("studio-jobs-view") || "list"; } catch (e) {}
  function renderJobs() {
    var results = $("#jobsResults"); if (!results) return;
    // LF51 (d): persistent list/tile toggle in the section header.
    var vt = $("#jobsViewToggle");
    if (vt) {
      var tilesNow = _jobsViewMode === "tiles";
      vt.textContent = tilesNow ? "List view" : "Tile view";
      vt.setAttribute("aria-pressed", tilesNow ? "true" : "false");
      vt.onclick = function () {
        _jobsViewMode = _jobsViewMode === "tiles" ? "list" : "tiles";
        try { localStorage.setItem("studio-jobs-view", _jobsViewMode); } catch (e) {}
        renderJobs();
      };
    }
    var q = (($("#jobsSearch") || {}).value || "").toLowerCase();
    var list = Studio.Workspace.all("jobs").filter(isVisibleToMe).sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    var folderCounts = {}, folderUnfiled = 0;
    list.forEach(function (j) { if (j.folder) folderCounts[j.folder] = (folderCounts[j.folder] || 0) + 1; else folderUnfiled++; });
    if (_jobsFolderFilter && _jobsFolderFilter !== "__unfiled" && !folderCounts[_jobsFolderFilter]) _jobsFolderFilter = "";
    var pillsFJobs = Object.keys(folderCounts).length
      ? ['<button type="button" class="wb-chip cx-pill' + (!_jobsFolderFilter ? " active" : "") + '" data-jobs-folder="" aria-pressed="' + (!_jobsFolderFilter ? "true" : "false") + '">' +
          '<span class="wb-chip-label">All folders</span> <span class="wb-chip-n">' + list.length + '</span></button>']
        .concat(Object.keys(folderCounts).sort().map(function (f) {
          return '<button type="button" class="wb-chip cx-pill' + (_jobsFolderFilter === f ? " active" : "") + '" data-jobs-folder="' + esc(f) + '" aria-pressed="' + (_jobsFolderFilter === f ? "true" : "false") + '">' +
            '<span class="wb-chip-label">' + esc(f) + '</span> <span class="wb-chip-n">' + folderCounts[f] + '</span></button>';
        }))
        .concat(['<button type="button" class="wb-chip cx-pill' + (_jobsFolderFilter === "__unfiled" ? " active" : "") + '" data-jobs-folder="__unfiled" aria-pressed="' + (_jobsFolderFilter === "__unfiled" ? "true" : "false") + '">' +
          '<span class="wb-chip-label">Unfiled</span> <span class="wb-chip-n">' + folderUnfiled + '</span></button>'])
        .join("")
      : "";
    var shown = list.filter(function (j) {
      if (_jobsFolderFilter === "__unfiled") { if (j.folder) return false; }
      else if (_jobsFolderFilter) { if (j.folder !== _jobsFolderFilter) return false; }
      if (!q) return true;
      var src = Studio.Workspace.get("datasets", j.sourceDatasetId);
      return (j.name + " " + (src ? src.name : "") + " " + (j.outputName || "") + " " + (j.folder || "")).toLowerCase().indexOf(q) >= 0;
    });
    // LF51 (d): list row or tile card, same pattern as Datasets/Connections.
    var isTiles = _jobsViewMode === "tiles";
    var rows = shown.map(function (j) {
      var src = Studio.Workspace.get("datasets", j.sourceDatasetId);
      var out = j.outputDatasetId && Studio.Workspace.get("datasets", j.outputDatasetId);
      var dot = !j.lastRun ? '<span class="cx-dot" data-tip="Never run"></span>'
        : (j.lastRun.ok ? '<span class="cx-dot ok" data-tip="Last run OK · ' + esc(new Date(j.lastRun.at).toLocaleString()) + ' · ' + j.lastRun.rows + ' rows"></span>'
          : '<span class="cx-dot bad" data-tip="Last run failed: ' + esc(j.lastRun.error) + '"></span>');
      var folderBadge = j.folder ? '<span class="cx-badge cx-folder" data-tip="Folder: ' + esc(j.folder) + '">' + esc(j.folder) + '</span>' : "";
      var icon = '<span class="cx-ic" style="color:var(--faint)"></span>';
      var name = '<span class="cx-name"><button type="button" class="cx-title-btn" title="' + esc(j.name) + ' — edit job" aria-label="Edit job ' + esc(j.name) + '"><b>' + esc(j.name) + '</b></button><small>' + (src ? "from " + esc(src.name) : "no source dataset") +
          (out ? " → " + esc(out.name) : "") + '</small></span>';
      var badges = folderBadge +
        '<span class="cx-badge">' + (j.steps || []).length + " step" + ((j.steps || []).length === 1 ? "" : "s") + '</span>' +
        jobRefreshBadge(j) + Studio.packBadgeHtml(j);
      var when = '<span class="cx-when">' + esc(Studio.fmtWhen(j.updatedAt || Date.now())) + '</span>';
      var privateBtn = '<button type="button" class="cx-private' + (j.private ? " private" : "") + '" data-job-private="' + esc(j.id) + '" title="' + (j.private ? "Private — only you can see this" : "Make private") + '" aria-label="' + (j.private ? "Make " + esc(j.name) + " public" : "Make " + esc(j.name) + " private") + '" aria-pressed="' + (j.private ? "true" : "false") + '"></button>';
      var actions = '<span class="cx-actions">' +
          '<button type="button" class="btn" data-job-run="' + esc(j.id) + '">Run</button>' +
          '<button type="button" class="btn" data-job-edit="' + esc(j.id) + '">Edit</button>' +
          '<button type="button" class="btn" data-job-del="' + esc(j.id) + '" aria-label="Delete ' + esc(j.name) + '">✕</button>' +
        '</span>';
      if (isTiles) {
        return '<div class="dsx-tile" data-job-id="' + esc(j.id) + '">' +
          '<div class="dsx-tile-head">' + dot + icon + name + privateBtn + '</div>' +
          (badges ? '<div class="dsx-tile-badges">' + badges + '</div>' : "") +
          '<div class="dsx-tile-foot">' + when + actions + '</div>' +
          '</div>';
      }
      return '<div class="cx-row" data-job-id="' + esc(j.id) + '">' +
        dot + icon + name + badges + when + privateBtn + actions + '</div>';
    });
    results.innerHTML =
      (pillsFJobs ? '<div class="wb-chips cx-filter-strip">' + pillsFJobs + '</div>' : "") +
      (rows.length ? '<div class="' + (isTiles ? "dsx-grid" : "cx-list") + '">' + rows.join("") + '</div>'
      : '<div class="cx-empty"><b>' + (q || _jobsFolderFilter ? "No jobs match." : "No jobs yet.") + '</b><br/>' +
        (q || _jobsFolderFilter ? "" : 'A job preps one dataset — rename/cast/derive columns, filter rows, roll up ' +
        'with sum/avg/count/median or an acreage-weighted mean, and join or union in another dataset — then saves the result as ' +
        'a new dataset you can chart.' +
        (Studio.Workspace.all("datasets").length ? "" : "<br/>Add a dataset first, in the Datasets section.")) + '</div>');
    Studio.Tooltip.hydrate(results);
    $$("[data-jobs-folder]", results).forEach(function (btn) {
      btn.onclick = function () { _jobsFolderFilter = btn.getAttribute("data-jobs-folder"); renderJobs(); };
    });
    $$(".cx-row, .dsx-tile", results).forEach(function (row) {
      var j = Studio.Workspace.get("jobs", row.getAttribute("data-job-id"));
      var icEl = row.querySelector(".cx-ic"); if (icEl && Studio.icon) icEl.appendChild(Studio.icon("sliders", 18));
      row.addEventListener("click", function (e) { if (e.target.closest("[data-job-run],[data-job-private],[data-job-edit],[data-job-del]")) return; openJobEditor(j); });
    });
    $$(".cx-private", results).forEach(function (btn) {
      btn.appendChild(Studio.icon("lock", 14));
      btn.onclick = function (e) { e.stopPropagation(); toggleJobPrivate(btn.getAttribute("data-job-private")); };
    });
    $$("[data-job-run]", results).forEach(function (btn) {
      btn.onclick = function () {
        var j = Studio.Workspace.get("jobs", btn.getAttribute("data-job-run")); if (!j) return;
        btn.disabled = true; btn.textContent = "Running…";
        runJob(j).then(function (r) {
          toast(r.error ? "Run failed: " + r.error : "OK — " + (r.rows || []).length + " rows", !!r.error);
          renderJobs();
        });
      };
    });
    $$("[data-job-edit]", results).forEach(function (btn) {
      btn.onclick = function () { openJobEditor(Studio.Workspace.get("jobs", btn.getAttribute("data-job-edit"))); };
    });
    $$("[data-job-del]", results).forEach(function (btn) {
      btn.onclick = function () {
        var j = Studio.Workspace.get("jobs", btn.getAttribute("data-job-del")); if (!j) return;
        if (!window.confirm('Delete job "' + j.name + '"? Its output dataset is kept.')) return;
        Studio.Workspace.remove("jobs", j.id);
        toast("Deleted " + j.name);
      };
    });
  }
  function openJobEditor(existing) {
    var dsets = Studio.Workspace.all("datasets").filter(isDatasetVisibleToMe).filter(function (d) { return (d.tags || []).indexOf("job-output") < 0 || (existing && d.id === existing.outputDatasetId); });
    modal(existing ? "Edit job" : "New job", function (b) {
      var j = existing ? Studio.clone(existing) : { id: Studio.Workspace.uid("job"), name: "", steps: [] };
      var form = el("div", "cx-wiz-form");
      // LF13(a): column dropdowns for group-by / metric / join+union keys, sourced from
      // each dataset's known `.columns` (declared in the dataset editor, or cached from the
      // last live run — see runDataset()). Falls back to a background runDataset() probe
      // when a dataset has never been run, then re-renders once it resolves.
      var ROW_PREVIEW_N = 5;
      var colsCache = { bySrc: [], byDs: {}, bySrcRows: null, bySrcRowsFor: null, bySrcRowsErr: null, bySrcAllRows: null };
      // LF55 (5): which step's type picker is expanded (index into j.steps), or null —
      // one at a time, session-only, reset whenever a step is added/removed/reordered
      // (renderSteps rebuilds it from scratch so a stale index just renders nothing).
      var openTypePicker = null;
      function stepKindFor(op) {
        for (var i = 0; i < Studio.JOB_STEP_KINDS.length; i++) if (Studio.JOB_STEP_KINDS[i].op === op) return Studio.JOB_STEP_KINDS[i];
        return Studio.JOB_STEP_KINDS[0];
      }
      function ensureSrcCols() {
        var id = j.sourceDatasetId;
        if (!id) { colsCache.bySrc = []; return; }
        var d = Studio.Workspace.get("datasets", id);
        if (!d) return;
        if ((d.columns || []).length) { colsCache.bySrc = d.columns.slice(); } else { runDataset(d).then(function () { colsCache.bySrc = (d.columns || []).slice(); renderSteps(); }); }
        ensureSrcRows(id, d);
      }
      // LF13(d) slice 2: a real, small live sample of the SOURCE dataset's rows (distinct
      // from ensureSrcCols' column-name-only fast path above — a name list can come from
      // `.columns` metadata alone, but actual cell VALUES need a live query) — fetched once
      // per source-dataset selection and cached, then fed through the pure engine
      // (Studio.runJobSteps) to sketch an approximate OUTPUT preview too, without paying for
      // a fresh live run on every keystroke. `bySrcRows === null` means "loading"; `[]` means
      // "loaded, no rows" — kept distinct so the UI can tell them apart.
      function ensureSrcRows(id, d) {
        if (colsCache.bySrcRowsFor === id) return;
        colsCache.bySrcRowsFor = id; colsCache.bySrcRows = null; colsCache.bySrcRowsErr = null; colsCache.bySrcAllRows = null;
        runDataset(d).then(function (r) {
          if (colsCache.bySrcRowsFor !== id) return; // source changed again while this was in flight
          colsCache.bySrcRowsErr = r && r.error ? r.error : null;
          var allRows = (r && !r.error) ? (r.rows || []) : [];
          colsCache.bySrcRows = allRows.slice(0, ROW_PREVIEW_N);
          // LF55 (2): the SAME live query already fetched every row — keep the full set (capped,
          // it's just for a distinct-value picker, not a table) alongside the 5-row preview slice
          // instead of firing a second query.
          colsCache.bySrcAllRows = allRows.slice(0, 2000);
          if (!colsCache.bySrc.length && r && (r.columns || []).length) colsCache.bySrc = r.columns.slice();
          renderSteps();
        });
      }
      // LF55 (2): distinct sample values of a FILTER step's target column, for the value field's
      // picker. Best-effort like colsBeforeStep's siblings — reads off the raw SOURCE rows (`col`
      // must still be a literal source column; a value renamed/derived by an earlier step in the
      // pipeline has no live sample to draw from, so those just fall back to free typing). Capped
      // so a high-cardinality column (an id, a timestamp) degrades to "no picker" instead of a
      // useless 2000-entry dropdown.
      function distinctColValues(col) {
        var idx = colsCache.bySrc.indexOf(col);
        if (idx < 0 || !colsCache.bySrcAllRows || !colsCache.bySrcAllRows.length) return [];
        var seen = {}, out = [];
        for (var i = 0; i < colsCache.bySrcAllRows.length; i++) {
          var v = colsCache.bySrcAllRows[i][idx];
          if (v == null || v === "") continue;
          var s = String(v);
          if (seen[s]) continue;
          seen[s] = true; out.push(s);
          if (out.length > 50) return []; // too many distinct values to be a useful picker
        }
        return out.sort();
      }
      function ensureDsCols(dsId) {
        if (!dsId || (colsCache.byDs[dsId] || []).length) return;
        var d = Studio.Workspace.get("datasets", dsId);
        if (!d) return;
        if ((d.columns || []).length) { colsCache.byDs[dsId] = d.columns.slice(); return; }
        runDataset(d).then(function () { colsCache.byDs[dsId] = (d.columns || []).slice(); renderSteps(); });
      }
      // LF13(b): multiple aggregate PASSES/LEVELS — a second (or third) "aggregate" step
      // rolling up an EARLIER aggregate's output (e.g. county+year sum, then a further
      // county-only average across years) needs its group-by/metric pickers to reflect the
      // PIPELINE'S columns at that point, not just the raw source dataset — schema-only
      // (no data) simulation of the same shape changes runJobSteps' handlers apply, so it
      // stays in sync with jobs-engine.js by construction rather than duplicating a second
      // guess at it. 'sql'/'cast'/'filter'/'union' don't change the column list (sql's real
      // effect is data-dependent and unknowable without running it — best-effort no-op).
      function simulateStepCols(cols, step) {
        if (step.op === "rename") {
          if (step.from && step.to && cols.indexOf(step.from) >= 0) return cols.map(function (c) { return c === step.from ? step.to : c; });
          return cols;
        }
        if (step.op === "derive") {
          return (step.outCol && cols.indexOf(step.outCol) < 0) ? cols.concat([step.outCol]) : cols;
        }
        if (step.op === "aggregate") {
          var groupBy = (step.groupBy || []).filter(function (c) { return cols.indexOf(c) >= 0; });
          return groupBy.concat((step.metrics || []).map(function (m) { return m.as || (m.fn + "_" + m.col); }));
        }
        if (step.op === "join") {
          var rightCols = colsCache.byDs[step.datasetId] || [];
          var addCols = rightCols.filter(function (c) { return c !== step.rightCol; });
          var outNames = addCols.map(function (c) {
            var name = (step.prefix || "") + c;
            while (cols.indexOf(name) >= 0) name += "_2";
            return name;
          });
          return cols.concat(outNames);
        }
        if (step.op === "uniqueKey") {
          var outCol = (step.outCol || "row_id").trim() || "row_id";
          return cols.indexOf(outCol) >= 0 ? cols : cols.concat([outCol]);
        }
        return cols; // cast, filter, union, sql: schema unchanged (or unknowable) at this point
      }
      // the pipeline's column list right BEFORE step index `idx` runs — every step before it
      // applied in order, starting from the source dataset's own columns.
      function colsBeforeStep(idx) {
        var cols = colsCache.bySrc.slice();
        for (var k = 0; k < idx; k++) cols = simulateStepCols(cols, (j.steps || [])[k] || {});
        return cols;
      }
      // a plain <select> of known column names; always keeps the current value selectable
      // even if it fell out of the introspected list (renamed column, stale cache, ...).
      function colSelect(list, current, onChange) {
        var sel = el("select");
        var opts = (list || []).slice();
        if (current && opts.indexOf(current) < 0) opts.unshift(current);
        sel.innerHTML = '<option value="">— column —</option>' + opts.map(function (c) {
          return '<option value="' + esc(c) + '"' + (c === current ? " selected" : "") + '>' + esc(c) + "</option>";
        }).join("");
        sel.onchange = function () { onChange(sel.value); };
        return sel;
      }
      function field(lbl, input, hint) {
        var row = el("label", "cx-field");
        row.innerHTML = "<span>" + esc(lbl) + "</span>";
        row.appendChild(input);
        if (hint) { var h = el("small", "cx-hint"); h.textContent = hint; row.appendChild(h); }
        form.appendChild(row);
        return input;
      }
      var nameInp = el("input"); nameInp.type = "text"; nameInp.value = j.name || ""; nameInp.placeholder = "e.g. county_to_state_rollup";
      field("Job name", withSparkleButton(nameInp, "job", function () {
        var srcDs = dsets.filter(function (d) { return d.id === srcSel.value; })[0];
        return { sourceDatasetName: srcDs ? srcDs.name : "" };
      }));
      var srcSel = field("Source dataset", el("select"), dsets.length ? "" : "No datasets yet — add one in the Datasets section first.");
      srcSel.className = "cx-sel";
      srcSel.innerHTML = '<option value="">— pick a dataset —</option>' + dsets.map(function (d) {
        return '<option value="' + esc(d.id) + '"' + (j.sourceDatasetId === d.id ? " selected" : "") + '>' + esc(d.name) + "</option>";
      }).join("");
      srcSel.onchange = function () { j.sourceDatasetId = srcSel.value; colsCache.bySrc = []; ensureSrcCols(); renderSteps(); };
      ensureSrcCols();
      var outInp = field("Output dataset name", el("input"), "Where the result lands — re-running this job updates the same dataset in place.");
      outInp.type = "text"; outInp.value = j.outputName || "";

      var refreshSel = field("Refresh reminder", el("select"),
        "Optional — the Jobs list flags this job once it's overdue, so annual (or other periodic) updates don't get forgotten.");
      refreshSel.className = "cx-sel";
      refreshSel.innerHTML = [["", "No reminder"], ["7", "Every week"], ["30", "Every month"], ["90", "Every quarter"], ["365", "Every year"]]
        .map(function (o) { return '<option value="' + o[0] + '"' + (String(j.refreshEveryDays || "") === o[0] ? " selected" : "") + '>' + o[1] + '</option>'; }).join("");

      // M5 folder pilot, slice 3 (jobs — same flat single-value "home" field as
      // Datasets/Connections, with a <datalist> of names already in use).
      var folderInp = el("input"); folderInp.type = "text"; folderInp.value = j.folder || ""; folderInp.placeholder = "e.g. Finance";
      // LF62 slice 7 (live-QA queue): the same sparkle name-suggest button, wired into
      // the Folder field — suggests the source dataset's own folder (a job's natural
      // upstream home), falling back to no suggestion when no source is picked yet or
      // that dataset has no folder of its own (jobs have no Tags field to fall back to).
      field("Folder", withSparkleButton(folderInp, "folder", function () {
        var srcDs = dsets.filter(function (d) { return d.id === srcSel.value; })[0];
        return { linkedFolder: srcDs ? srcDs.folder : "" };
      }), "Optional — a home for this job (e.g. Finance, or Finance/2024 to nest). Pick an existing one or type a new name.");
      var jobFolderNames = {};
      Studio.Workspace.all("jobs").filter(isVisibleToMe).forEach(function (x) { if (x.folder) jobFolderNames[x.folder] = true; });
      var jobFolderList = el("datalist"); jobFolderList.id = "jobFolderOptions";
      Object.keys(jobFolderNames).sort().forEach(function (f) { var o = el("option"); o.value = f; jobFolderList.appendChild(o); });
      folderInp.setAttribute("list", "jobFolderOptions");
      folderInp.parentNode.appendChild(jobFolderList);
      // LF56 slice 2: Browse button → shared folder-tree picker over the jobs' folders.
      folderInp.parentNode.appendChild(Studio.folderPickerButton(folderInp, function () { return Object.keys(jobFolderNames); }));

      // LF13(d) slice 1: a source FIELD LIST (type icons) so the pipeline below reads
      // against a visible legend of what's actually available, instead of just column
      // dropdowns you have to open one at a time to discover. Best-effort — name-only
      // kind guess (no live sample rows on hand here without an extra query); re-drawn
      // every renderSteps() so it stays in sync with source-dataset changes.
      var srcFieldsWrap = el("div", "jobs-src-fields"); form.appendChild(srcFieldsWrap);
      function renderSrcFields() {
        srcFieldsWrap.innerHTML = "";
        if (!j.sourceDatasetId) return;
        if (!colsCache.bySrc.length) {
          var loading = el("small", "cx-hint"); loading.textContent = "Loading source fields…"; srcFieldsWrap.appendChild(loading);
          return;
        }
        var label = el("small", "cx-hint"); label.textContent = "Source fields:"; srcFieldsWrap.appendChild(label);
        var chips = el("div", "jobs-src-fields-chips");
        colsCache.bySrc.forEach(function (c) {
          var kind = guessFieldKind(c, []);
          var chip = el("span", "jobs-field-chip");
          chip.setAttribute("data-kind", kind);
          chip.title = c + " — " + kind + " (guessed)";
          chip.appendChild(Studio.icon(kind === "Numeric" ? "hash" : kind === "Date" ? "clock" : "text", 13));
          var nameSpan = el("span"); nameSpan.textContent = c;
          chip.appendChild(nameSpan);
          chips.appendChild(chip);
        });
        srcFieldsWrap.appendChild(chips);
      }
      // LF13(d) slice 2 / LF55(4): a small live sample of SOURCE rows (real values, unlike
      // the name-only field list above), plus an APPROXIMATE preview of the OUTPUT rows —
      // the pipeline's steps run (via the pure Studio.runJobSteps engine, no live query)
      // over that same cached sample, so it updates instantly as steps are edited instead
      // of requiring a "Preview" click. join/union steps only know the linked dataset's
      // COLUMN NAMES here (not a live sample of ITS rows too), so their preview rows are
      // honestly approximate. LF55(4): the approximate output shares ONE result area with
      // the real "Preview" button's live run (below, near the footer) instead of living in
      // its own separate table — whichever is current is badged, and the Preview button
      // pulses to invite a click whenever an approximate/stale result is what's on screen.
      var PREVIEW_INVITE_CLASS = "btn-invite";
      function previewTable(columns, rows) {
        var head = "<tr>" + columns.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr>";
        var body = rows.slice(0, ROW_PREVIEW_N).map(function (row) {
          return "<tr>" + row.map(function (v) { return "<td>" + esc(v == null ? "" : String(v)) + "</td>"; }).join("") + "</tr>";
        }).join("");
        return "<table>" + head + body + "</table>";
      }
      function clearOutputPreview() {
        if (!result || !preview) return;
        result.className = "cx-test-result"; result.textContent = "";
        preview.innerHTML = "";
        if (runBtn) runBtn.classList.remove(PREVIEW_INVITE_CLASS);
      }
      function showApproxPreview(columns, rows) {
        if (!result || !preview) return;
        result.className = "cx-test-result approx";
        result.textContent = "Sample — approximate (from the cached rows above; click Preview for the real result)";
        preview.innerHTML = previewTable(columns, rows);
        if (runBtn) runBtn.classList.add(PREVIEW_INVITE_CLASS);
      }
      function showApproxError(msg) {
        if (!result || !preview) return;
        result.className = "cx-test-result bad";
        result.textContent = "Can't preview: " + msg;
        preview.innerHTML = "";
        if (runBtn) runBtn.classList.remove(PREVIEW_INVITE_CLASS);
      }
      var srcRowsWrap = el("div", "jobs-row-preview"); form.appendChild(srcRowsWrap);
      function renderRowPreviews() {
        srcRowsWrap.innerHTML = "";
        if (!j.sourceDatasetId) { clearOutputPreview(); return; }
        var srcLabel = el("small", "cx-hint"); srcLabel.textContent = "Sample source rows:"; srcRowsWrap.appendChild(srcLabel);
        if (colsCache.bySrcRowsFor !== j.sourceDatasetId || colsCache.bySrcRows == null) {
          var loading = el("small", "cx-hint"); loading.textContent = "Loading sample rows…"; srcRowsWrap.appendChild(loading);
          clearOutputPreview();
          return;
        }
        if (colsCache.bySrcRowsErr) {
          var err = el("small", "cx-hint"); err.textContent = "Can't sample rows: " + colsCache.bySrcRowsErr; srcRowsWrap.appendChild(err);
          clearOutputPreview();
          return;
        }
        if (!colsCache.bySrcRows.length || !colsCache.bySrc.length) {
          var none = el("small", "cx-hint"); none.textContent = "No sample rows available."; srcRowsWrap.appendChild(none);
          clearOutputPreview();
          return;
        }
        var srcTable = el("div", "dsx-preview"); srcTable.innerHTML = previewTable(colsCache.bySrc, colsCache.bySrcRows);
        srcRowsWrap.appendChild(srcTable);
        if (!(j.steps || []).length) { clearOutputPreview(); return; } // nothing downstream of an empty pipeline yet
        var ctx = { datasets: {} };
        (j.steps || []).forEach(function (step) {
          if ((step.op === "join" || step.op === "union") && step.datasetId) {
            ctx.datasets[step.datasetId] = { columns: colsCache.byDs[step.datasetId] || [], rows: [] };
          }
        });
        var out = Studio.runJobSteps({ columns: colsCache.bySrc, rows: colsCache.bySrcRows }, j.steps, ctx);
        if (out.error) { showApproxError(out.error); return; }
        if (!out.columns.length) { clearOutputPreview(); return; }
        showApproxPreview(out.columns, out.rows);
      }
      var stepsWrap = el("div", "jobs-steps"); form.appendChild(stepsWrap);
      function operandRow(op) {
        var wrap = el("span", "jobs-operand");
        var kindSel = el("select"); kindSel.innerHTML = '<option value="col">column</option><option value="value">number</option>';
        var valInp = el("input"); valInp.type = "text";
        function sync() {
          if (op.col != null) { kindSel.value = "col"; valInp.value = op.col; valInp.placeholder = "column"; }
          else { kindSel.value = "value"; valInp.value = op.value != null ? op.value : ""; valInp.placeholder = "number"; }
        }
        sync();
        kindSel.onchange = function () {
          if (kindSel.value === "col") { op.col = valInp.value || ""; delete op.value; } else { op.value = valInp.value || ""; delete op.col; }
          sync();
        };
        valInp.oninput = function () { if (kindSel.value === "col") op.col = valInp.value; else op.value = valInp.value; };
        wrap.appendChild(kindSel); wrap.appendChild(valInp);
        return wrap;
      }
      function metricsEditor(step, cols) {
        var wrap = el("div", "jobs-metrics");
        function draw() {
          wrap.innerHTML = "";
          (step.metrics = step.metrics || []).forEach(function (m, i) {
            var row = el("div", "jobs-metric-row");
            var col = colSelect(cols, m.col, function (v) { m.col = v; });
            var fnSel = el("select");
            fnSel.innerHTML = Studio.JOB_AGG_FNS.map(function (f) { return '<option value="' + f.fn + '"' + (m.fn === f.fn ? " selected" : "") + '>' + esc(f.label) + '</option>'; }).join("");
            fnSel.onchange = function () { m.fn = fnSel.value; draw(); };
            var asInp = el("input"); asInp.type = "text"; asInp.placeholder = "output name"; asInp.value = m.as || "";
            asInp.oninput = function () { m.as = asInp.value; };
            row.appendChild(col); row.appendChild(fnSel); row.appendChild(asInp);
            if (fnSel.value === "wmean") {
              var w = colSelect(cols, m.weightCol, function (v) { m.weightCol = v; });
              row.appendChild(w);
            }
            var del = el("button", "btn danger"); del.type = "button"; del.textContent = "✕"; del.setAttribute("aria-label", "Remove metric");
            del.onclick = function () { step.metrics.splice(i, 1); draw(); };
            row.appendChild(del);
            wrap.appendChild(row);
          });
          var add = el("button", "btn"); add.type = "button"; add.textContent = "+ Metric";
          add.onclick = function () { step.metrics.push({ col: "", fn: "sum", as: "" }); draw(); };
          wrap.appendChild(add);
        }
        draw();
        return wrap;
      }
      function unionMapEditor(step) {
        var wrap = el("div", "jobs-metrics");
        function draw() {
          wrap.innerHTML = "";
          (step.columnMap = step.columnMap || []).forEach(function (m, i) {
            var row = el("div", "jobs-metric-row");
            var to = el("input"); to.type = "text"; to.placeholder = "output column"; to.value = m.to || "";
            to.oninput = function () { m.to = to.value; };
            var from = colSelect(colsCache.byDs[step.datasetId] || [], m.from, function (v) { m.from = v; });
            row.appendChild(to); row.appendChild(from);
            var del = el("button", "btn danger"); del.type = "button"; del.textContent = "✕"; del.setAttribute("aria-label", "Remove mapping");
            del.onclick = function () { step.columnMap.splice(i, 1); draw(); };
            row.appendChild(del);
            wrap.appendChild(row);
          });
          var add = el("button", "btn"); add.type = "button"; add.textContent = "+ Column mapping";
          add.onclick = function () { step.columnMap.push({ to: "", from: "" }); draw(); };
          wrap.appendChild(add);
          var note = el("small", "cx-hint"); note.textContent = "Unmapped output columns fall back to a same-name match in the other dataset, else blank.";
          wrap.appendChild(note);
        }
        draw();
        return wrap;
      }
      // LF13(d) slice 3 (the last piece of the job-editor overhaul ask): a small visual
      // DIAGRAM of the operation for the three step kinds that actually reshape the data
      // (rollup/join/stack) — the ones people find hardest to picture from form fields
      // alone. Reuses colsBeforeStep/colsCache as the single source of truth for column
      // names (same data the pickers above already show) so the diagram can never drift
      // from what the pipeline will really do; purely a read-only visualization, no new
      // step state.
      function diagChip(name, hl) {
        var c = el("span", "jobs-diag-chip" + (hl ? " hl" : "")); c.textContent = name; return c;
      }
      function diagBox(title, cols, hlCol) {
        var box = el("div", "jobs-diag-box");
        var h = el("div", "jobs-diag-box-title"); h.textContent = title; box.appendChild(h);
        var chips = el("div", "jobs-diag-chips");
        if (!cols.length) { var e = el("span", "jobs-diag-empty"); e.textContent = "no columns yet"; chips.appendChild(e); }
        else cols.forEach(function (c) { chips.appendChild(diagChip(c, c === hlCol)); });
        box.appendChild(chips);
        return box;
      }
      function diagArrow(iconName, label) {
        var a = el("div", "jobs-diag-arrow");
        a.appendChild(Studio.icon(iconName, 18));
        var l = el("span"); l.textContent = label; a.appendChild(l);
        return a;
      }
      function stepDiagram(step, stepIdx) {
        if (step.op !== "aggregate" && step.op !== "join" && step.op !== "union") return null;
        var diag = el("div", "jobs-step-diagram");
        var inCols = colsBeforeStep(stepIdx);
        if (step.op === "aggregate") {
          var gb = step.groupBy || [];
          var metricNames = (step.metrics || []).map(function (m) { return m.as || ((m.fn || "?") + "_" + (m.col || "?")); });
          diag.appendChild(diagBox(inCols.length + " column" + (inCols.length === 1 ? "" : "s") + " in", inCols));
          diag.appendChild(diagArrow("sigma", gb.length ? "group by " + gb.join(", ") : "pick group-by columns"));
          diag.appendChild(diagBox("Rolled up to", gb.concat(metricNames)));
        } else if (step.op === "join") {
          var rightCols = colsCache.byDs[step.datasetId] || [];
          var rightDs = step.datasetId ? Studio.Workspace.get("datasets", step.datasetId) : null;
          diag.appendChild(diagBox("This pipeline", inCols, step.leftCol));
          diag.appendChild(diagArrow("join", (step.type === "left" ? "left join" : "inner join") +
            (step.leftCol && step.rightCol ? "\non " + step.leftCol + " = " + step.rightCol : "")));
          diag.appendChild(diagBox(rightDs ? rightDs.name : "Other dataset", rightCols, step.rightCol));
        } else if (step.op === "union") {
          var otherCols = colsCache.byDs[step.datasetId] || [];
          var otherDs = step.datasetId ? Studio.Workspace.get("datasets", step.datasetId) : null;
          diag.appendChild(diagBox("This pipeline", inCols));
          diag.appendChild(diagArrow("layers", "stacked with"));
          diag.appendChild(diagBox(otherDs ? otherDs.name : "Other dataset", otherCols));
        }
        return diag;
      }
      function stepFields(step, stepIdx) {
        var wrap = el("div", "jobs-step-fields");
        function mini(ph, val, onChange) {
          var i = el("input"); i.type = "text"; i.placeholder = ph; i.value = val || ""; i.oninput = function () { onChange(i.value); };
          wrap.appendChild(i); return i;
        }
        if (step.op === "rename") {
          // LF55 (1): the "from" column names a known INCOMING column — pick it from a dropdown, not
          // free text (kills the typo/case-sensitivity trap). "to" stays free text (it's a NEW name).
          wrap.appendChild(colSelect(colsBeforeStep(stepIdx), step.from, function (v) { step.from = v; renderSteps(); }));
          mini("to column", step.to, function (v) { step.to = v; });
        } else if (step.op === "cast") {
          // LF55 (1): cast targets a known incoming column — dropdown, not free text.
          wrap.appendChild(colSelect(colsBeforeStep(stepIdx), step.col, function (v) { step.col = v; renderSteps(); }));
          var sel = el("select"); sel.innerHTML = '<option value="number">number</option><option value="string">string</option>';
          sel.value = step.to || "number"; sel.onchange = function () { step.to = sel.value; }; wrap.appendChild(sel);
        } else if (step.op === "derive") {
          mini("output column", step.outCol, function (v) { step.outCol = v; });
          step.a = step.a || {}; wrap.appendChild(operandRow(step.a));
          var opSel = el("select"); opSel.innerHTML = ["+", "-", "*", "/"].map(function (o) { return '<option value="' + o + '"' + (step.operator === o ? " selected" : "") + '>' + o + '</option>'; }).join("");
          step.operator = step.operator || "*"; opSel.value = step.operator; opSel.onchange = function () { step.operator = opSel.value; }; wrap.appendChild(opSel);
          step.b = step.b || {}; wrap.appendChild(operandRow(step.b));
        } else if (step.op === "filter") {
          // LF55 (1): filter targets a known incoming column — dropdown, not free text.
          wrap.appendChild(colSelect(colsBeforeStep(stepIdx), step.col, function (v) { step.col = v; renderSteps(); }));
          var cmpSel = el("select");
          cmpSel.innerHTML = ["eq", "ne", "gt", "gte", "lt", "lte", "contains"].map(function (c) { return '<option value="' + c + '"' + (step.cmp === c ? " selected" : "") + '>' + c + '</option>'; }).join("");
          step.cmp = step.cmp || "eq"; cmpSel.value = step.cmp; cmpSel.onchange = function () { step.cmp = cmpSel.value; }; wrap.appendChild(cmpSel);
          // LF55 (2): the value field stays free text (comparators like gt/lt need arbitrary
          // typed values a fixed list can't cover), but when the target column's actual sample
          // values are known, offer them via a <datalist> — the same "type or pick" affordance
          // the Folder fields already use elsewhere in this editor.
          var valInp = mini("value", step.value, function (v) { step.value = v; });
          var distinct = distinctColValues(step.col);
          if (distinct.length) {
            var dlId = "jobsFilterVals" + stepIdx;
            var dl = el("datalist"); dl.id = dlId;
            distinct.forEach(function (v) { var o = el("option"); o.value = v; dl.appendChild(o); });
            valInp.setAttribute("list", dlId);
            wrap.appendChild(dl);
          }
        } else if (step.op === "aggregate") {
          var stepCols = colsBeforeStep(stepIdx);
          var gbWrap = el("div", "jobs-groupby");
          var gbLabel = el("small", "cx-hint");
          gbLabel.textContent = stepIdx > 0 ? "Group by (this step's incoming columns):" : "Group by:";
          gbWrap.appendChild(gbLabel);
          var gbCols = stepCols.slice();
          (step.groupBy || []).forEach(function (c) { if (gbCols.indexOf(c) < 0) gbCols.push(c); });
          if (!gbCols.length) { var gbHint = el("small", "cx-hint"); gbHint.textContent = "No columns detected yet — pick a source dataset (or run Preview) to populate this list."; gbWrap.appendChild(gbHint); }
          gbCols.forEach(function (c) {
            var active = (step.groupBy || []).indexOf(c) >= 0;
            var chip = el("button", "wb-chip cx-pill" + (active ? " active" : ""));
            chip.type = "button"; chip.textContent = c; chip.setAttribute("aria-pressed", active ? "true" : "false");
            chip.onclick = function () {
              step.groupBy = step.groupBy || [];
              var idx = step.groupBy.indexOf(c);
              if (idx >= 0) step.groupBy.splice(idx, 1); else step.groupBy.push(c);
              renderSteps();
            };
            gbWrap.appendChild(chip);
          });
          wrap.appendChild(gbWrap);
          wrap.appendChild(metricsEditor(step, stepCols));
        } else if (step.op === "join") {
          var joinDsSel = el("select");
          joinDsSel.innerHTML = '<option value="">— pick dataset —</option>' + dsets.map(function (d) {
            return '<option value="' + esc(d.id) + '"' + (step.datasetId === d.id ? " selected" : "") + '>' + esc(d.name) + "</option>";
          }).join("");
          joinDsSel.onchange = function () { step.datasetId = joinDsSel.value; ensureDsCols(step.datasetId); renderSteps(); };
          wrap.appendChild(joinDsSel);
          ensureDsCols(step.datasetId);
          wrap.appendChild(colSelect(colsCache.bySrc, step.leftCol, function (v) { step.leftCol = v; }));
          wrap.appendChild(colSelect(colsCache.byDs[step.datasetId] || [], step.rightCol, function (v) { step.rightCol = v; }));
          var joinTypeSel = el("select");
          joinTypeSel.innerHTML = '<option value="inner">inner join</option><option value="left">left join (keep unmatched)</option>';
          step.type = step.type || "inner"; joinTypeSel.value = step.type;
          joinTypeSel.onchange = function () { step.type = joinTypeSel.value; };
          wrap.appendChild(joinTypeSel);
          mini("added-column prefix (optional)", step.prefix, function (v) { step.prefix = v; });
        } else if (step.op === "union") {
          var unionDsSel = el("select");
          unionDsSel.innerHTML = '<option value="">— pick dataset —</option>' + dsets.map(function (d) {
            return '<option value="' + esc(d.id) + '"' + (step.datasetId === d.id ? " selected" : "") + '>' + esc(d.name) + "</option>";
          }).join("");
          unionDsSel.onchange = function () { step.datasetId = unionDsSel.value; ensureDsCols(step.datasetId); renderSteps(); };
          wrap.appendChild(unionDsSel);
          ensureDsCols(step.datasetId);
          wrap.appendChild(unionMapEditor(step));
        } else if (step.op === "uniqueKey") {
          mini("output column (default row_id)", step.outCol, function (v) { step.outCol = v; });
          var ukHint = el("small", "cx-hint");
          ukHint.textContent = "Stamps a stable, unique id onto every row currently in the pipeline — place it after a join/union/aggregate to key the rows at their final grain.";
          wrap.appendChild(ukHint);
        } else if (step.op === "sql") {
          var sqlBox = el("textarea"); sqlBox.className = "jobs-sql-box"; sqlBox.rows = 4;
          sqlBox.placeholder = "SELECT * FROM t"; sqlBox.value = step.query || "";
          sqlBox.oninput = function () { step.query = sqlBox.value; };
          wrap.appendChild(sqlBox);
          var sqlHint = el("small", "cx-hint");
          sqlHint.textContent = "Runs against the pipeline's rows so far, in a DuckDB table named \"t\" (loaded on first use).";
          wrap.appendChild(sqlHint);
        }
        return wrap;
      }
      function renderSteps() {
        renderSrcFields();
        // LF55 (3)/(4): any step/source edit invalidates the last REAL Preview result.
        // renderRowPreviews() (just above) already redraws the single shared result area
        // with the fresh approximate output (or clears it) — no separate clear needed here,
        // and clearing again after would just stomp the approximate preview it drew.
        renderRowPreviews();
        stepsWrap.innerHTML = "";
        (j.steps || []).forEach(function (step, i) {
          var card = el("div", "jobs-step-card");
          var head = el("div", "jobs-step-head");
          // LF55 (5): a themed icon-panel picker replaces the plain step-type <select> —
          // the trigger shows the current kind's glyph + label, click expands a grid of
          // every kind (icon + label, select-and-see) right below the head; picking one
          // resets the step (same behavior the old onchange had) and collapses the grid.
          var kind = stepKindFor(step.op);
          var trigger = el("button", "jobs-step-type-trigger"); trigger.type = "button";
          trigger.setAttribute("data-op", kind.op);
          trigger.appendChild(Studio.icon(kind.icon, 18));
          var triggerLabel = el("span"); triggerLabel.textContent = kind.label; trigger.appendChild(triggerLabel);
          trigger.appendChild(Studio.icon(openTypePicker === i ? "chevron-up" : "chevron-down", 14));
          trigger.setAttribute("aria-haspopup", "listbox");
          trigger.setAttribute("aria-expanded", openTypePicker === i ? "true" : "false");
          trigger.setAttribute("aria-label", "Step type: " + kind.label + " — change");
          trigger.onclick = function () { openTypePicker = openTypePicker === i ? null : i; renderSteps(); };
          head.appendChild(trigger);
          var up = el("button", "btn"); up.type = "button"; up.textContent = "↑"; up.setAttribute("aria-label", "Move step up");
          up.disabled = i === 0; up.onclick = function () { var t = j.steps[i - 1]; j.steps[i - 1] = j.steps[i]; j.steps[i] = t; openTypePicker = null; renderSteps(); };
          var down = el("button", "btn"); down.type = "button"; down.textContent = "↓"; down.setAttribute("aria-label", "Move step down");
          down.disabled = i === j.steps.length - 1; down.onclick = function () { var t = j.steps[i + 1]; j.steps[i + 1] = j.steps[i]; j.steps[i] = t; openTypePicker = null; renderSteps(); };
          var del = el("button", "btn danger"); del.type = "button"; del.textContent = "✕ Remove step";
          del.setAttribute("aria-label", "Remove step");
          del.onclick = function () { j.steps.splice(i, 1); openTypePicker = null; renderSteps(); };
          head.appendChild(up); head.appendChild(down); head.appendChild(del);
          card.appendChild(head);
          if (openTypePicker === i) {
            var typeGrid = el("div", "jobs-step-type-grid");
            typeGrid.setAttribute("role", "listbox");
            typeGrid.setAttribute("aria-label", "Choose step type");
            Studio.JOB_STEP_KINDS.forEach(function (k) {
              var tile = el("button", "jobs-step-type-tile" + (step.op === k.op ? " active" : ""));
              tile.type = "button";
              tile.setAttribute("data-op", k.op);
              tile.setAttribute("role", "option");
              tile.setAttribute("aria-selected", step.op === k.op ? "true" : "false");
              tile.appendChild(Studio.icon(k.icon, 20));
              var tileLabel = el("span"); tileLabel.textContent = k.label; tile.appendChild(tileLabel);
              tile.onclick = function () { j.steps[i] = { op: k.op }; openTypePicker = null; renderSteps(); };
              typeGrid.appendChild(tile);
            });
            card.appendChild(typeGrid);
          }
          card.appendChild(stepFields(step, i));
          var diag = stepDiagram(step, i);
          if (diag) card.appendChild(diag);
          stepsWrap.appendChild(card);
        });
        var addStep = el("button", "btn"); addStep.type = "button"; addStep.textContent = "+ Step";
        addStep.onclick = function () { (j.steps = j.steps || []).push({ op: "rename" }); openTypePicker = null; renderSteps(); };
        stepsWrap.appendChild(addStep);
      }
      // LF55(4): result/preview/runBtn are created BEFORE the first renderSteps() call (just
      // below) so an existing job's approximate output preview appears immediately on open,
      // not only after the first subsequent edit.
      var result = el("div", "cx-test-result");
      var preview = el("div", "dsx-preview");
      var runBtn = el("button", "btn"); runBtn.type = "button"; runBtn.textContent = "Preview";
      var saveBtn = el("button", "btn primary"); saveBtn.type = "button"; saveBtn.textContent = existing ? "Save changes" : "Add job";
      renderSteps();
      b.appendChild(form);
      b.appendChild(result);
      b.appendChild(preview);
      var foot = el("div", "cx-wiz-foot");
      foot.appendChild(runBtn); foot.appendChild(saveBtn); b.appendChild(foot);
      function collect() {
        j.name = nameInp.value.trim();
        j.sourceDatasetId = srcSel.value;
        j.outputName = outInp.value.trim();
        j.refreshEveryDays = refreshSel.value ? Number(refreshSel.value) : null;
        var jobFolderVal = folderInp.value.trim();
        if (jobFolderVal) j.folder = jobFolderVal; else delete j.folder;
        return j;
      }
      runBtn.onclick = function () {
        collect();
        var src = Studio.Workspace.get("datasets", j.sourceDatasetId);
        if (!src) { result.className = "cx-test-result bad"; result.textContent = "Pick a source dataset first."; return; }
        // LF55(4): a click always aims at the REAL result, so the invite stops pulsing the
        // instant the user takes the hint — even before the run resolves.
        runBtn.classList.remove(PREVIEW_INVITE_CLASS);
        runBtn.disabled = true; runBtn.textContent = "Running…";
        result.className = "cx-test-result"; result.textContent = ""; preview.innerHTML = "";
        runDataset(src).then(function (r) {
          if (r.error) { runBtn.disabled = false; runBtn.textContent = "Preview"; result.className = "cx-test-result bad"; result.textContent = "✕ " + r.error; return; }
          resolveJobCtx(j.steps).then(function (ctx) {
            return Studio.runJobStepsAsync({ columns: r.columns, rows: r.rows }, j.steps || [], ctx, duckSqlRunner);
          }).then(function (out) {
            runBtn.disabled = false; runBtn.textContent = "Preview";
            if (out.error) { result.className = "cx-test-result bad"; result.textContent = "✕ " + out.error; return; }
            result.className = "cx-test-result ok"; result.textContent = "✓ " + out.rows.length + " rows · " + out.columns.length + " columns";
            var head = "<tr>" + out.columns.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr>";
            var body = out.rows.slice(0, 8).map(function (row) {
              return "<tr>" + row.map(function (v) { return "<td>" + esc(v == null ? "" : String(v)) + "</td>"; }).join("") + "</tr>";
            }).join("");
            preview.innerHTML = "<table>" + head + body + "</table>";
          });
        });
      };
      saveBtn.onclick = function () {
        collect();
        if (!j.name) { nameInp.focus(); result.className = "cx-test-result bad"; result.textContent = "Give the job a name first."; return; }
        if (!j.sourceDatasetId) { srcSel.focus(); result.className = "cx-test-result bad"; result.textContent = "Pick the source dataset this job preps."; return; }
        if (!j.outputName) j.outputName = j.name + " (job output)";
        if (!existing) { var newUid = currentUserId(); if (newUid) j.owner = newUid; }
        Studio.Workspace.put("jobs", j);
        toast(existing ? "Saved " + j.name : "Added " + j.name);
        document.querySelector(".modal-ov .x").click();
      };
      nameInp.focus();
    }, function () { renderJobs(); }, true);
  }

  Studio.Jobs = {
    configure: configure,
    render: renderJobs,
    openEditor: openJobEditor,
    run: runJob,
    togglePrivate: toggleJobPrivate
  };
})();
