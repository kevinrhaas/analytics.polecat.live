/* ============================================================================
   versions.js — R5+ slice 5, part 1 (studio.js module extraction, tech-debt
   track): the pure data layer behind local version history ("time travel"
   checkpoints, studio-versions) and canvas sticky notes (studio-canvas-notes).
   Every function here is parameterized (spec/dashboard id passed in) rather
   than reading studio.js's private live-editing state (`S`), so — unlike
   celebrations.js/defaults.js, which each needed one injected callback back
   into studio.js's private state — this module needs NONE: it only depends
   on Studio.clone (model.js, already global). The MODAL/UI half of this
   subsystem (openNoteEditor, openJsonEditor, openVersionDiff,
   openCompareDashboards, and the Inspector's Version-history/Builder-notes
   sections) stays in studio.js — those lean on a dozen-plus of studio.js's
   own private DOM/modal helpers (modal, el, hint, textarea, setIconBtn, …),
   which don't extract cleanly the way this data layer does; that's the
   deliberately separate "part 2" this slice leaves for a follow-up.
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
})();
