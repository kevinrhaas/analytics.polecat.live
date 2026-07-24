/* ============================================================================
   branding.js — R5+ slice 2 (studio.js module extraction, tech-debt track):
   the app-mark + app-identity branding subsystem (Z12), stored as a small
   object in localStorage. It owns three app-wide identity surfaces, all painted
   for EVERY visitor at boot (only an admin can CHANGE them — the editor lives in
   the Admin section):
     · the left-rail MARK (default favicon / a custom logo / none),
     · the browser-tab FAVICON (a custom logo becomes the favicon too), and
     · the rail SUITE LABEL under the app name ("polecat.live" by default —
       customizable to a short white-label name, or hidden entirely).
   Pure config + a few DOM writes, no dependency on the builder's live spec/
   selection state, so it extracts cleanly (chart-thumbnails.js precedent ①).
   Loads before studio.js (app/index.html).
   ============================================================================ */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  var MAX_BYTES = 200 * 1024; // ~200KB — plenty for an icon-sized logo, keeps localStorage sane
  var SUITE_MAX = 24;         // keep the white-label name short so the rail lockup stays tidy
  var DEFAULT_SUITE = "polecat.live";

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
  // Resolve the visible suite label: "" when hidden, else the custom text (trimmed,
  // capped) or the default. Kept pure so the Admin editor can preview it too.
  function suiteLabel(b) {
    b = b || get();
    if (b.suite === "hidden") return "";
    if (b.suite === "custom") {
      var t = (b.suiteText || "").trim().slice(0, SUITE_MAX);
      return t || DEFAULT_SUITE;
    }
    return DEFAULT_SUITE;
  }
  function apply() {
    var b = get();
    // 1) the rail mark
    var mark = document.querySelector(".rail-brand-mark");
    if (mark) {
      if (b.mode === "custom" && b.dataUrl) { mark.src = b.dataUrl; mark.style.display = ""; }
      else if (b.mode === "none") { mark.style.display = "none"; }
      else { mark.src = "favicon.svg"; mark.style.display = ""; }
    }
    // 2) the browser-tab favicon follows the custom logo (so a white-labeled app
    //    matches in the tab), and reverts to the shipped favicon otherwise.
    var icon = document.querySelector('link[rel="icon"]');
    if (icon) {
      if (b.mode === "custom" && b.dataUrl) { icon.setAttribute("href", b.dataUrl); icon.removeAttribute("type"); }
      else { icon.setAttribute("href", "favicon.svg"); icon.setAttribute("type", "image/svg+xml"); }
    }
    // 3) the rail suite label — hidden, custom white-label text, or the default.
    var suite = document.querySelector(".rail-suite");
    if (suite) {
      var lbl = suiteLabel(b);
      if (!lbl) { suite.style.display = "none"; }
      else { suite.textContent = lbl; suite.style.display = ""; }
    }
  }

  Studio.Branding = { get: get, set: set, apply: apply, suiteLabel: suiteLabel, MAX_BYTES: MAX_BYTES, SUITE_MAX: SUITE_MAX, DEFAULT_SUITE: DEFAULT_SUITE };
  window.__studioBranding = { get: get, set: set, apply: apply, suiteLabel: suiteLabel }; // test hook
})();
