/* ============================================================================
   celebrations.js — R5+ slice 4 (studio.js module extraction, tech-debt track):
   the "N-FUN" delight-moment subsystem — the shared spark-burst visual plus
   the one-time first-export toast, the running export/dashboard milestone
   counters, and the "dashboard health zero" celebration. Pure localStorage
   counters + one DOM burst effect, no dependency on the builder's live spec/
   selection state, so it extracts cleanly following the chart-thumbnails.js/
   branding.js/defaults.js precedent (①/②/③) — with the same one exception
   defaults.js hit: celebrateFirstExport/bumpExportMilestone/bumpDashMilestone/
   celebrateHealthZero all show a `toast(...)`, which is studio.js's own
   private helper (its `_toastT` timer lives in studio.js's closure), so
   studio.js injects that one function via configureToast() at boot instead of
   this module reaching into studio.js's private state or re-implementing the
   toast widget.
   Loads before studio.js (app/index.html).
   ============================================================================ */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  var _toast = function () {}; // no-op until studio.js wires the real one in configureToast()
  function configureToast(fn) { _toast = fn; }

  // Same load/save boilerplate collapse as studio.js's R1 lsGet/lsSet, scoped
  // to this module's own JSON-shaped state (celebrateHealthZero's per-dashboard flag map).
  function lsGet(key, fallback) {
    var v;
    try { v = localStorage.getItem(key); } catch (e) { return fallback; }
    if (v == null) return fallback;
    try { var parsed = JSON.parse(v); return parsed == null ? fallback : parsed; } catch (e) { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* quota or private-mode */ }
  }

  // N-FUN: delight moments — small, rare, tasteful celebrations. Shared spark-burst visual (respects
  // prefers-reduced-motion) backs both the one-time first-export moment and the recurring export/
  // dashboard/health milestones below.
  function sparkBurst() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var colors = ["#d4773b", "#f55036", "#8b5cf6", "#4285f4", "#10a37f", "#ffb000"];
    var host = document.createElement("div"); host.className = "spark-host";
    for (var i = 0; i < 18; i++) {
      var p = document.createElement("span"); p.className = "spark-p";
      p.style.left = (48 + Math.random() * 6 - 3) + "%";
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * 0.15) + "s";
      p.style.setProperty("--dx", Math.round(Math.random() * 240 - 120) + "px");
      host.appendChild(p);
    }
    document.body.appendChild(host);
    setTimeout(function () { host.remove(); }, 1400);
  }
  function celebrateFirstExport() {
    try {
      if (localStorage.getItem("studio-first-export-done")) return;
      localStorage.setItem("studio-first-export-done", "1");
    } catch (e) { return; }
    _toast("First export! Nice work — your dashboard is ready to share.", false, true);
    sparkBurst();
  }
  // N-FUN: export milestones — a light "you're on a roll" nudge at round totals, counted across every
  // export this browser has ever made (any kind). Purely encouraging, never repeats a given milestone
  // (tracked via the running total itself, which only grows), same spark-burst as the first-export moment.
  var EXPORT_MILESTONES = { 10: "10 exports!", 25: "25 exports — you're on a roll.", 50: "50 exports! Dashboard machine.", 100: "100 exports. Legendary.", 250: "250 exports. Absolute unit of a portfolio." };
  function bumpExportMilestone() {
    var n = 0;
    try { n = (parseInt(localStorage.getItem("studio-export-count"), 10) || 0) + 1; localStorage.setItem("studio-export-count", String(n)); } catch (e) { return; }
    if (EXPORT_MILESTONES[n]) { _toast(EXPORT_MILESTONES[n] + " Keep it up.", false, true); sparkBurst(); }
  }
  // N-FUN: another "more milestone moments" slice — celebrate round totals of brand-new blank
  // dashboards started (Home's Blank quick-create card + New ▾ → Blank dashboard; NOT Open/Import/
  // examples/Duplicate, which pick up someone else's spec rather than starting fresh). Same running-
  // counter + spark-burst convention as the export milestones above.
  var DASH_MILESTONES = { 5: "5 dashboards built!", 10: "10 dashboards — a real portfolio.", 25: "25 dashboards. You're a Studio power user.", 50: "50 dashboards. Incredible pace." };
  function bumpDashMilestone() {
    var n = 0;
    try { n = (parseInt(localStorage.getItem("studio-dash-count"), 10) || 0) + 1; localStorage.setItem("studio-dash-count", String(n)); } catch (e) { return; }
    if (DASH_MILESTONES[n]) { _toast(DASH_MILESTONES[n], false, true); sparkBurst(); }
  }
  // N-FUN "dashboard health celebration" (innovation idea added 2026-07-04): the Checks section
  // in the Inspector only ever shows a neutral "ready to export" line, even the first time a
  // dashboard reaches genuinely zero warnings/notes. One-time-per-dashboard toast + spark, keyed by
  // spec.id so it never repeats for the same dashboard (same "once, keyed, never again" convention
  // as celebrateFirstExport).
  function celebrateHealthZero(sp) {
    if (!sp || !sp.id) return;
    var done = lsGet("studio-health-celebrated", {});
    if (done[sp.id]) return;
    done[sp.id] = 1;
    lsSet("studio-health-celebrated", done);
    _toast("All clear — this dashboard has zero warnings. Nicely built.", false, true);
    sparkBurst();
  }

  Studio.Celebrations = {
    configureToast: configureToast,
    sparkBurst: sparkBurst,
    celebrateFirstExport: celebrateFirstExport,
    bumpExportMilestone: bumpExportMilestone,
    bumpDashMilestone: bumpDashMilestone,
    celebrateHealthZero: celebrateHealthZero
  };
})();
