/* Analytics Dashboard Studio — © 2026 Polecat.live. See LICENSE. */
/* ============================================================================
   tooltip.js — UX8 slice 1 (UX-POLISH track): a themed, focusable, touch-
   visible tooltip primitive generalizing the existing .opt-hint-pop pattern
   (studio.js's chart-option hint bubbles) for the simpler "just show a line
   of text" case. A native title= attribute is mouse-hover only — invisible
   on touch and never reachable by keyboard — so every status dot/badge that
   relied on one failed the fleet's mobile-is-a-gate bar.

   Studio.Tooltip.hydrate(root) is the whole API: mark an element up with
   data-tip="..." instead of title="...", then call hydrate() on its
   container right after inserting the markup — the same two-step
   placeholder convention app/icons.js's [data-ic] spans already use. It
   makes the element focusable, gives it an aria-label (unless one's already
   set), and appends a themed bubble shown on hover/focus (CSS, via
   app/studio.css's .ps-tip rules) or tap (a single delegated click toggles
   .is-open — touch has no hover state — with outside-click/Escape to close).

   This slice ships the primitive + converts the connection/dataset/job
   status dots (Never tested/tested OK/failed, Never run/run OK/failed) — the
   same repeated widget across all three subsystems, so one slice covers it
   everywhere at once. The remaining title= call sites (folder/tag/param
   badges, and every button's title, which mostly just duplicates an
   existing aria-label) are each their own follow-up slice.

   Loads after icons.js, before studio.js (app/index.html).
   ============================================================================ */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  var OPEN_CLASS = "is-open";
  var openEl = null;
  function closeOpen() { if (openEl) { openEl.classList.remove(OPEN_CLASS); openEl = null; } }
  document.addEventListener("click", function (e) {
    if (openEl && !openEl.contains(e.target)) closeOpen();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && openEl) closeOpen();
  });

  function hydrate(root) {
    var host = root || document;
    Array.prototype.slice.call(host.querySelectorAll("[data-tip]")).forEach(function (elx) {
      var text = elx.getAttribute("data-tip");
      elx.removeAttribute("data-tip");
      elx.classList.add("ps-tip");
      if (!elx.hasAttribute("tabindex")) elx.tabIndex = 0;
      if (!elx.hasAttribute("aria-label") && !elx.hasAttribute("aria-labelledby")) elx.setAttribute("aria-label", text);
      var bub = document.createElement("span");
      bub.className = "ps-tip-bub";
      bub.setAttribute("role", "tooltip");
      bub.textContent = text;
      elx.appendChild(bub);
      elx.addEventListener("click", function (e) {
        e.stopPropagation();
        var was = elx.classList.contains(OPEN_CLASS);
        closeOpen();
        if (!was) { elx.classList.add(OPEN_CLASS); openEl = elx; }
      });
    });
  }

  Studio.Tooltip = { hydrate: hydrate };
})();
