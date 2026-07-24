/* ============================================================================
   branding.js — R5+ slice 2 (studio.js module extraction, tech-debt track):
   the app-mark branding subsystem (Z12) — default/custom-logo/none, stored as
   a small data: URL in localStorage. Pure config + one DOM write (the rail
   mark's src), no dependency on the builder's live spec/selection state, so
   it extracts cleanly following the chart-thumbnails.js precedent (①).
   Loads before studio.js (app/index.html).
   ============================================================================ */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  var MAX_BYTES = 200 * 1024; // ~200KB — plenty for an icon-sized logo, keeps localStorage sane

  function get() {
    var v;
    try { v = localStorage.getItem("studio-branding"); } catch (e) { return { mode: "default" }; }
    if (v == null) return { mode: "default" };
    try { var parsed = JSON.parse(v); return parsed == null ? { mode: "default" } : parsed; } catch (e) { return { mode: "default" }; }
  }
  function set(b) {
    try { localStorage.setItem("studio-branding", JSON.stringify(b)); } catch (e) { /* quota or private-mode */ }
    apply();
  }
  function apply() {
    var b = get();
    var mark = document.querySelector(".rail-brand-mark");
    if (!mark) return;
    if (b.mode === "custom" && b.dataUrl) { mark.src = b.dataUrl; mark.style.display = ""; }
    else if (b.mode === "none") { mark.style.display = "none"; }
    else { mark.src = "favicon.svg"; mark.style.display = ""; }
  }

  Studio.Branding = { get: get, set: set, apply: apply, MAX_BYTES: MAX_BYTES };
  window.__studioBranding = { get: get, set: set, apply: apply }; // test hook
})();
