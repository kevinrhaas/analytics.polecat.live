/* ============================================================================
   versions.js — R5+ slice 5 (studio.js module extraction, tech-debt track):
   local version history ("time travel" checkpoints, studio-versions) and
   canvas sticky notes (studio-canvas-notes).

   Part 1 (Studio.Versions / Studio.CanvasNotes below) is the pure data layer —
   every function is parameterized (spec/dashboard id passed in) rather than
   reading studio.js's private live-editing state (`S`), so — unlike
   celebrations.js/defaults.js, which each needed one injected callback back
   into studio.js's private state — it needs NONE: it only depends on
   Studio.clone (model.js, already global).

   Part 2 (Studio.VersionsUI below) is the modal/render UI half
   (openNoteEditor, openJsonEditor, openVersionDiff, openCompareDashboards,
   restoreVersion, and the Inspector's Version-history/Builder-notes
   sections) — this DOES lean on a dozen-plus of studio.js's own private
   DOM/modal helpers (modal, el, hint, textarea, setIconBtn, …), so unlike
   Part 1 it needs a one-time `Studio.VersionsUI.configure(deps)` call from
   studio.js (same "inject the callbacks" shape as Celebrations/Defaults,
   just more of them) before any of its functions are used. studio.js keeps
   thin same-named delegates so every call site and the window.__studio* test
   hooks are byte-for-byte unchanged.
   Loads before studio.js (app/index.html).
   ============================================================================ */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  // Same load/save boilerplate collapse as studio.js's R1 lsGet/lsSet, scoped
  // to this module's own JSON-shaped state.
  function lsGet(key, fallback) {
    var v;
    try { v = localStorage.getItem(key); } catch (e) { return fallback; }
    if (v == null) return fallback;
    try { var parsed = JSON.parse(v); return parsed == null ? fallback : parsed; } catch (e) { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* quota or private-mode */ }
  }

  /* ---------- local version history ("time travel" for a dashboard) ----------
     A lightweight checkpoint list, distinct from in-session undo (memory-only, lost on
     reload) and from studio-autosave (a single unsaved draft). Every explicit Save (the
     download-a-.studio.json action) pushes a snapshot into studio-versions, keyed by
     dashboard id, newest-first, capped at 10 per dashboard. Version lists are pruned to
     only dashboards still tracked in studio-recents so this can't grow unbounded once a
     dashboard falls off Home/Repository. */
  var _LS_VERSIONS = "studio-versions";
  function loadVersions() { return lsGet(_LS_VERSIONS, {}); }
  function saveVersions(v) { lsSet(_LS_VERSIONS, v); }
  function snapshotVersion(spec) {
    if (!spec || !spec.id) return;
    var versions = loadVersions();
    var list = versions[spec.id] || [];
    list.unshift({ ts: new Date().toISOString(), spec: Studio.clone(spec) });
    if (list.length > 10) list = list.slice(0, 10);
    versions[spec.id] = list;
    saveVersions(versions);
  }
  function pruneVersions(keepIds) {
    var versions = loadVersions(), changed = false;
    Object.keys(versions).forEach(function (id) { if (keepIds.indexOf(id) < 0) { delete versions[id]; changed = true; } });
    if (changed) saveVersions(versions);
  }

  /* Track N innovation idea (added 2026-07-04): canvas sticky notes — small colored, builder-only
     notes for team brainstorming/review while a dashboard is in progress. Deliberately never
     exported (no spec field, no involvement in the render pipeline shared with export) — scratch
     space, not a dashboard feature. Keyed by dashboard id, same storage shape as studio-versions. */
  var _LS_NOTES = "studio-canvas-notes";
  var NOTE_COLORS = ["#ffd76a", "#7dd3c0", "#f4a6a6", "#8fb8f6", "#c9a4f2"];
  function loadCanvasNotes() { return lsGet(_LS_NOTES, {}); }
  function saveCanvasNotes(n) { lsSet(_LS_NOTES, n); }
  function putCanvasNote(specId, note) {
    if (!specId) return;
    var all = loadCanvasNotes();
    var list = all[specId] || [];
    var existing = list.filter(function (n) { return n.id === note.id; })[0];
    if (existing) { existing.color = note.color; existing.text = note.text.trim(); existing.panelId = note.panelId; existing.ts = new Date().toISOString(); }
    else { list.push({ id: note.id, color: note.color, text: note.text.trim(), panelId: note.panelId, ts: new Date().toISOString() }); }
    all[specId] = list;
    saveCanvasNotes(all);
  }
  function removeCanvasNote(specId, id) {
    if (!specId) return;
    var all = loadCanvasNotes();
    all[specId] = (all[specId] || []).filter(function (n) { return n.id !== id; });
    saveCanvasNotes(all);
  }

  Studio.Versions = {
    load: loadVersions,
    save: saveVersions,
    snapshot: snapshotVersion,
    prune: pruneVersions
  };
  Studio.CanvasNotes = {
    COLORS: NOTE_COLORS,
    load: loadCanvasNotes,
    save: saveCanvasNotes,
    put: putCanvasNote,
    remove: removeCanvasNote
  };

  /* ---------- Part 2: modal/render UI (R5+ slice 5, part 2) ---------------
     D holds the deps injected once via configure() — see the header comment.
     Every function below is a straight move of studio.js's own former
     implementation; only the free variables that used to resolve to
     studio.js's private closures now resolve to D.* (or, for the plain data
     layer, the Part 1 functions right above, already in scope). */
  var D = null;
  function configure(deps) { D = deps; }

  function restoreVersion(vTs) {
    var spec = D.getSpec();
    if (!spec || !spec.id) return;
    var list = loadVersions()[spec.id] || [];
    var v = list.filter(function (x) { return x.ts === vTs; })[0];
    if (!v) return;
    if (!confirm("Restore this version from " + new Date(v.ts).toLocaleString() + "?\n\nYour current unsaved changes on the canvas will be replaced (this itself becomes a new restorable version).")) return;
    D.applySpec(Studio.clone(v.spec));
    snapshotVersion(D.getSpec()); // the restored state is itself a checkpoint, so a restore can be undone too
    D.toast("Version restored");
  }

  function saveCanvasNote(note) {
    var spec = D.getSpec();
    if (!spec || !spec.id) return;
    putCanvasNote(spec.id, note);
  }
  function deleteCanvasNote(id) {
    var spec = D.getSpec();
    if (!spec || !spec.id) return;
    removeCanvasNote(spec.id, id);
    D.renderInspector();
  }

  function openNoteEditor(existing) {
    var draft = existing ? { id: existing.id, color: existing.color, text: existing.text, panelId: existing.panelId || "" }
      : { id: Studio.uid("note"), color: NOTE_COLORS[0], text: "", panelId: "" };
    D.modal(existing ? "Edit note" : "Add note", function (body) {
      body.appendChild(D.hint("A small colored note for your own reference or team review while building — never exported, never leaves this browser."));
      var presets = D.el("div", "note-presets");
      NOTE_COLORS.forEach(function (c) {
        var sw = D.el("button", "note-swatch" + (draft.color === c ? " active" : "")); sw.type = "button"; sw.title = c;
        sw.style.background = c;
        sw.setAttribute("aria-pressed", draft.color === c ? "true" : "false");
        sw.onclick = function () {
          draft.color = c;
          [].slice.call(presets.children).forEach(function (b) { b.classList.remove("active"); b.setAttribute("aria-pressed", "false"); });
          sw.classList.add("active"); sw.setAttribute("aria-pressed", "true");
        };
        presets.appendChild(sw);
      });
      body.appendChild(D.field("Color", presets));
      var ta = D.textarea(draft.text, function (v) { draft.text = v; });
      ta.placeholder = "What do you want to remember or flag here?";
      ta.style.cssText = "width:100%;min-height:70px;resize:vertical;box-sizing:border-box";
      body.appendChild(D.field("Note", ta));
      var spec = D.getSpec();
      var targetOpts = [["", "General note (not tied to a widget)"]].concat(
        ((spec && spec.panels) || []).map(function (p) { return [p.id, "Panel: " + (p.title || p.id)]; }));
      body.appendChild(D.field("Pin to", D.select2pairs(targetOpts, draft.panelId, function (v) { draft.panelId = v; })));
      var saveBtn = D.el("button", "btn btn-primary"); saveBtn.style.cssText = "width:100%;justify-content:center;margin-top:8px";
      saveBtn.textContent = existing ? "Save changes" : "Add note";
      saveBtn.onclick = function () {
        if (!draft.text.trim()) { D.toast("Enter some note text first.", true); return; }
        saveCanvasNote(draft);
        document.querySelector(".modal-ov").remove();
        D.renderInspector();
      };
      body.appendChild(saveBtn);
    });
  }

  // N-DEV: live JSON spec editor — edit the working dashboard's raw .studio.json
  // directly and see the canvas update. Power-user/debugging tool: validates the
  // pasted/edited text is a plausible spec (valid JSON, a panels[] array, a
  // cda.dataAccesses[] array) before applying, and snapshots a version-history
  // checkpoint of the PRE-edit state first so a bad hand-edit is always one
  // "Restore this version" away from undoing, same safety net a live Save gets.
  function openJsonEditor() {
    D.modal("Edit JSON spec", function (body) {
      body.appendChild(D.hint("Edit the dashboard's raw JSON directly, then Apply to validate and re-render the canvas. A checkpoint of the current state is saved to Version history first, so a bad edit is always restorable."));
      var ta = D.el("textarea");
      ta.value = JSON.stringify(D.getSpec(), null, 2);
      ta.spellcheck = false;
      ta.style.cssText = "width:100%;min-height:360px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1.5;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--field);color:var(--ink);box-sizing:border-box;resize:vertical;margin-top:8px";
      body.appendChild(ta);
      var errEl = D.el("div", "note err"); errEl.style.cssText = "margin-top:8px;display:none";
      body.appendChild(errEl);
      function showErr(msg) { errEl.textContent = msg; errEl.style.display = "block"; }
      function clearErr() { errEl.style.display = "none"; }
      ta.addEventListener("input", clearErr);
      var btnRow = D.el("div"); btnRow.style.cssText = "display:flex;gap:8px;margin-top:10px";
      var applyBtn = D.el("button", "btn"); D.setIconBtn(applyBtn, "check", "Apply");
      var copyBtn = D.el("button", "btn"); D.setIconBtn(copyBtn, "copy", "Copy");
      btnRow.appendChild(applyBtn); btnRow.appendChild(copyBtn);
      body.appendChild(btnRow);
      copyBtn.onclick = function () { D.copyText(ta.value, copyBtn); };
      applyBtn.onclick = function () {
        var parsed;
        try { parsed = JSON.parse(ta.value); } catch (e) { showErr("Invalid JSON: " + e.message); return; }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) { showErr('Spec must be a JSON object, e.g. { "title": "…", "panels": [...] }.'); return; }
        if (!Array.isArray(parsed.panels)) { showErr('Spec must have a "panels" array (use [] if there are none).'); return; }
        if (!parsed.cda || !Array.isArray(parsed.cda.dataAccesses)) { showErr('Spec must have a "cda": { "dataAccesses": [...] } block.'); return; }
        snapshotVersion(D.getSpec());
        D.applySpec(parsed);
        document.querySelector(".modal-ov").remove();
        D.toast("JSON spec applied");
      };
    });
  }

  // N-DIST follow-up: "visual diff between two versions" — compares one checkpoint
  // against the CURRENT working spec (the practical question when deciding whether to
  // restore) and lists what changed in plain English via Studio.diffSpecs/diffSummary.
  function openVersionDiff(v) {
    var when = new Date(v.ts).toLocaleString();
    var lines = Studio.diffSummary(Studio.diffSpecs(v.spec || {}, D.getSpec()));
    D.modal("Compare: " + when + " → Current", function (body) {
      body.appendChild(D.hint("What changed between this checkpoint and the dashboard as it stands now."));
      if (!lines.length) {
        body.appendChild(D.noteEl("info", "No differences — this checkpoint matches the current dashboard."));
      } else {
        var list = D.el("div", "vdiff-list");
        lines.forEach(function (line) {
          var row = D.el("div", "vdiff-row"); row.textContent = line; list.appendChild(row);
        });
        body.appendChild(list);
      }
      var restoreB = D.el("button", "btn"); restoreB.style.cssText = "margin-top:10px;width:100%;justify-content:center";
      D.setIconBtn(restoreB, "undo", "Restore this version");
      restoreB.onclick = function () { document.querySelector(".modal-ov").remove(); restoreVersion(v.ts); };
      body.appendChild(restoreB);
    });
  }

  // "Compare dashboards side-by-side" innovation idea: distinct from the Version-history diff
  // above (which compares a dashboard against ITS OWN past checkpoint) -- this picks any TWO
  // different saved dashboards from Home/Repository and shows (1) a real live preview of each,
  // rendered the exact same way the builder's own preview iframe is (Studio.buildHtml + mock
  // data, so it's a genuine "which of these looks better" comparison, not a static thumbnail)
  // and (2) a plain-English diff, reusing Studio.diffSpecs/diffSummary verbatim (the same engine
  // the version-history diff already established).
  function openCompareDashboards() {
    var list = D.loadRecents().filter(D.isVisibleToMe);
    if (list.length < 2) { D.toast("Save at least two dashboards to compare them", true); return; }
    D.modal("Compare dashboards", function (body) {
      body.appendChild(D.hint("Pick any two saved dashboards to see a live side-by-side preview and a plain-English summary of what differs between them."));
      var row = D.el("div", "cmp-pick-row");
      var cmpLabels = D.disambiguateLabels(list, function (r) { return (r.spec && (r.spec.title || r.spec.name)) || r.id; });
      function pickerFor(defaultIdx, label) {
        var sel = document.createElement("select"); sel.className = "cmp-pick";
        sel.setAttribute("aria-label", label);
        list.forEach(function (r, i) {
          var opt = document.createElement("option");
          opt.value = r.id; opt.textContent = cmpLabels[r.id];
          if (i === defaultIdx) opt.selected = true;
          sel.appendChild(opt);
        });
        return sel;
      }
      var selA = pickerFor(0, "Left dashboard"), selB = pickerFor(1, "Right dashboard");
      var arrow = D.el("span", "cmp-arrow"); arrow.setAttribute("aria-hidden", "true"); arrow.appendChild(Studio.icon("swap", 16));
      row.appendChild(selA); row.appendChild(arrow); row.appendChild(selB);
      body.appendChild(row);
      var pvRow = D.el("div", "cmp-preview-row");
      function previewCol() {
        var col = D.el("div", "cmp-preview-col");
        var h = D.el("h5"); var fr = document.createElement("iframe");
        fr.className = "cmp-preview-frame"; fr.setAttribute("aria-hidden", "true");
        col.appendChild(h); col.appendChild(fr);
        return { col: col, h: h, fr: fr };
      }
      var pvA = previewCol(), pvB = previewCol();
      pvRow.appendChild(pvA.col); pvRow.appendChild(pvB.col);
      body.appendChild(pvRow);
      var out = D.el("div", "cmp-out"); body.appendChild(out);
      function renderPreview(pv, r) {
        var sp = (r && r.spec) || {};
        pv.h.textContent = sp.title || sp.name || "Untitled";
        pv.fr.title = "Live preview: " + (sp.title || sp.name || "Untitled");
        pv.fr.srcdoc = Studio.buildHtml(sp, D.getAssets(), { preview: true, mock: Studio.genMock(sp), launcher: false });
        D.postThemeOnLoad(pv.fr);
      }
      function renderAll() {
        var a = list.filter(function (r) { return r.id === selA.value; })[0];
        var b = list.filter(function (r) { return r.id === selB.value; })[0];
        if (!a || !b) return;
        renderPreview(pvA, a); renderPreview(pvB, b);
        out.innerHTML = "";
        if (a.id === b.id) { out.appendChild(D.noteEl("info", "Pick two different dashboards to compare.")); return; }
        var lines = Studio.diffSummary(Studio.diffSpecs(a.spec || {}, b.spec || {}));
        if (!lines.length) { out.appendChild(D.noteEl("info", "No differences — these two dashboards match.")); return; }
        var listEl = D.el("div", "vdiff-list");
        lines.forEach(function (line) { var r = D.el("div", "vdiff-row"); r.textContent = line; listEl.appendChild(r); });
        out.appendChild(listEl);
      }
      selA.onchange = renderAll; selB.onchange = renderAll;
      renderAll();
    }, null, true);
  }

  // The Inspector's Version-history + Builder-notes sections (Dashboard inspector body).
  function renderInspectorSections(body, sp) {
    var vhList = (loadVersions()[sp.id] || []);
    var vhSec = D.section(body, "Version history" + (vhList.length ? " (" + vhList.length + ")" : ""), null, null, "exporting", "clock");
    if (!vhList.length) {
      vhSec.appendChild(D.hint("Every time you Save, a restorable checkpoint of this dashboard is kept here (last 10)."));
    } else {
      vhList.forEach(function (v) {
        var when = new Date(v.ts).toLocaleString();
        var vp = v.spec || {};
        var vDetail = (vp.panels || []).length + " panel" + ((vp.panels || []).length === 1 ? "" : "s") +
          ((vp.kpis || []).length ? " · " + (vp.kpis || []).length + " KPI" + ((vp.kpis || []).length === 1 ? "" : "s") : "");
        vhSec.appendChild(D.rowItem("↺", when, vDetail, function () { restoreVersion(v.ts); }, [D.compareBtn(function () { openVersionDiff(v); })], false));
      });
    }

    var noteList = (loadCanvasNotes()[sp.id] || []);
    var noteSec = D.section(body, "Builder notes" + (noteList.length ? " (" + noteList.length + ")" : ""), function () { openNoteEditor(null); }, null, "builder", "edit");
    if (!noteList.length) {
      noteSec.appendChild(D.hint("Pin a small colored note to a widget, or add a general one — for your own reference or team review while building. Never exported, never leaves this browser."));
    } else {
      noteList.forEach(function (n) {
        var panel = n.panelId ? D.panelById(n.panelId) : null;
        var sub = n.panelId ? ("Pinned to: " + (panel ? (panel.title || panel.id) : "a deleted panel")) : "General note";
        var dot = '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + D.esc(n.color || NOTE_COLORS[0]) + '"></span>';
        var label = n.text.length > 40 ? n.text.slice(0, 40) + "…" : n.text;
        noteSec.appendChild(D.rowItem(dot, label, sub, function () { openNoteEditor(n); }, [D.delBtn(function () { deleteCanvasNote(n.id); })], false));
      });
    }
  }

  Studio.VersionsUI = {
    configure: configure,
    restoreVersion: restoreVersion,
    saveCanvasNote: saveCanvasNote,
    deleteCanvasNote: deleteCanvasNote,
    openNoteEditor: openNoteEditor,
    openJsonEditor: openJsonEditor,
    openVersionDiff: openVersionDiff,
    openCompareDashboards: openCompareDashboards,
    renderInspectorSections: renderInspectorSections
  };
})();
