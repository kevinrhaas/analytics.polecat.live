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

  // SETTINGS-ROAM (Kevin, 2026-07-31): branding is app-wide — "what everyone who
  // opens this workspace sees" — so its home is the SYNCED workspace settings
  // (rides snapshot.settings → the backend's polecat_meta) and it roams to every
  // device that connects. localStorage stays as the local cache (local-only mode,
  // plus instant paint before any pull). A device still holding older local-only
  // branding lifts it into the workspace ONCE, only when the workspace has none.
  function ws() { return (window.Studio && Studio.Workspace) || null; }
  function localGet() {
    var v;
    try { v = localStorage.getItem("studio-branding"); } catch (e) { return null; }
    if (v == null) return null;
    try { return JSON.parse(v); } catch (e) { return null; }
  }
  function get() {
    var w = ws();
    if (w) {
      try { var b = (w.settings() || {}).branding; if (b) return b; } catch (e) {}
    }
    return localGet() || { mode: "default" };
  }
  function set(b) {
    try { localStorage.setItem("studio-branding", JSON.stringify(b)); } catch (e) { /* quota or private-mode */ }
    var w = ws();
    if (w) { try { w.setSetting("branding", b); } catch (e) {} } // synced, workspace-wide
    apply();
  }
  function liftLocalIntoWorkspace() {
    var w = ws(); if (!w) return;
    try {
      if ((w.settings() || {}).branding) return; // the workspace already owns one
      var local = localGet();
      if (!local) return;
      var customized = local.mode !== "default" || (local.suite && local.suite !== "default");
      if (customized) w.setSetting("branding", local);
    } catch (e) {}
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
  // BRAND-LINK (Kevin live, 2026-07-31): where clicking the rail suite label goes.
  // Default label → polecat.live (as always). A custom white-label name can carry
  // its own destination (b.suiteUrl, e.g. the org's site); with none set, the
  // custom name renders as PLAIN TEXT (an href-less <a>) — a custom brand should
  // never silently link somewhere unrelated. http(s) only; bare domains get
  // https:// prepended; anything else (javascript: etc.) is treated as unset.
  function suiteHref(b) {
    b = b || get();
    if (b.suite === "custom") {
      var u = String(b.suiteUrl || "").trim();
      if (!u) return "";
      if (!/^https?:\/\//i.test(u)) {
        if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}([\/?#].*)?$/i.test(u)) u = "https://" + u;
        else return "";
      }
      return u;
    }
    return "https://" + DEFAULT_SUITE;
  }
  function apply() {
    liftLocalIntoWorkspace(); // idempotent one-time migration (no-op once owned)
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
    // 3) the rail suite label — hidden, custom white-label text, or the default —
    //    plus WHERE it links (BRAND-LINK): custom names carry their own URL or
    //    render as plain text; the default keeps pointing at polecat.live.
    var suite = document.querySelector(".rail-suite");
    if (suite) {
      var lbl = suiteLabel(b);
      if (!lbl) { suite.style.display = "none"; }
      else {
        suite.textContent = lbl; suite.style.display = "";
        var href = suiteHref(b);
        if (href) {
          suite.setAttribute("href", href);
          suite.setAttribute("title", "Open " + href.replace(/^https?:\/\//, ""));
        } else {
          suite.removeAttribute("href");
          suite.removeAttribute("title");
        }
      }
    }
  }

  Studio.Branding = { get: get, set: set, apply: apply, suiteLabel: suiteLabel, suiteHref: suiteHref, MAX_BYTES: MAX_BYTES, SUITE_MAX: SUITE_MAX, DEFAULT_SUITE: DEFAULT_SUITE };
  window.__studioBranding = { get: get, set: set, apply: apply, suiteLabel: suiteLabel, suiteHref: suiteHref }; // test hook

  // A pull/adopt can carry roamed branding in — repaint when the workspace is
  // replaced wholesale. Subscribed after DOMContentLoaded so Workspace (loaded
  // earlier in index.html but not on every page this file rides on) exists.
  document.addEventListener("DOMContentLoaded", function () {
    var w = ws();
    if (w && w.on) { try { w.on("replaced", function () { apply(); }); } catch (e) {} }
  });
})();
