/* Analytics — © 2026 Polecat.live. See LICENSE. */
/* shell.js — Z1: the app shell's collapsible left rail. Frames the whole app
   as a multi-section product (Home · Repository · Studio · Settings); Studio
   is the existing builder, moved under its own section with zero feature
   loss. Home/Repository/Settings are placeholder sections for later Z-track
   slices. Rail expand/collapse + active section persist in localStorage. */
(function () {
  "use strict";
  var LS_SECTION = "studio-shell-section";
  var LS_EXPANDED = "studio-shell-expanded";
  var SECTIONS = ["home", "explore", "dashboards", "datasets", "jobs", "connections", "repository", "studio", "admin", "settings"];
  // Fleet-standard topbar shows the current section name (top-left). "studio" is the
  // dashboard builder — its human label.
  var SECTION_LABELS = {
    home: "Home", explore: "Explore", dashboards: "Dashboards", datasets: "Datasets",
    jobs: "Jobs", connections: "Connections", repository: "Repository", studio: "Studio", admin: "Admin", settings: "Settings"
  };

  var nav = document.getElementById("railNav");
  var appMain = document.getElementById("appMain");
  if (!nav || !appMain) return;

  var items = Array.prototype.slice.call(nav.querySelectorAll(".rail-item[data-sec]"));
  var collapseBtn = document.getElementById("railCollapse");

  // paint icons (Studio.icon() renders inline SVG so dark mode works for free)
  document.querySelectorAll("#railNav .rail-ic[data-ic], .sec-empty-ic[data-ic]").forEach(function (span) {
    if (window.Studio && Studio.icon) span.appendChild(Studio.icon(span.getAttribute("data-ic"), span.classList.contains("sec-empty-ic") ? 26 : 18));
  });

  function sectionEl(sec) {
    if (sec === "studio") return appMain;
    return document.getElementById("sec" + sec.charAt(0).toUpperCase() + sec.slice(1));
  }

  var desiredSection = "home";

  function setActive(sec, persist) {
    if (SECTIONS.indexOf(sec) < 0) sec = "home";
    var changed = sec !== desiredSection;
    desiredSection = sec;
    if (persist !== false) { try { localStorage.setItem(LS_SECTION, sec); } catch (e) {} }
    // m-a: sections now switch on mobile too (the rail is a reachable drawer there,
    // not hidden) — show the chosen section full-screen at any width.
    SECTIONS.forEach(function (s) {
      var el = sectionEl(s);
      if (el) el.hidden = s !== sec;
    });
    var tbSec = document.getElementById("topbarSection");
    if (tbSec) tbSec.textContent = SECTION_LABELS[sec] || sec;
    items.forEach(function (btn) {
      var on = btn.getAttribute("data-sec") === sec;
      btn.classList.toggle("active", on);
      if (on) btn.setAttribute("aria-current", "page"); else btn.removeAttribute("aria-current");
    });
    // Z1 follow-up: a brief fade-in on the section you actually switched to (motion
    // feedback that something happened) — skip on the initial page-load restore (persist
    // === false) so a saved non-Studio section doesn't "pop in" on first paint. The
    // `.sec-enter` animation itself is defined in studio.css and disabled entirely under
    // prefers-reduced-motion, so no JS branching on that preference is needed here. The
    // class is removed again once the animation finishes — #appMain (the Studio section)
    // has position:fixed descendants (#mobile-tabs/#statusbar at phone width), and a
    // *lingering* CSS animation/transform on an ancestor becomes their containing block
    // instead of the viewport, breaking their fixed positioning for as long as it's applied.
    if (changed && persist !== false) {
      var shown = sectionEl(sec);
      if (shown) {
        shown.classList.remove("sec-enter");
        void shown.offsetWidth; // force reflow so re-adding the class restarts the animation
        shown.classList.add("sec-enter");
        shown.addEventListener("animationend", function onEnd(e) {
          if (e.target === shown) { shown.classList.remove("sec-enter"); shown.removeEventListener("animationend", onEnd); }
        });
      }
    }
  }

  // ── m-a: mobile nav drawer ─────────────────────────────────────────────
  // On phones/tablets (≤900px) the rail is an off-canvas drawer (see studio.css). A
  // fixed hamburger opens it; the shared #mobile-scrim dims content behind it; picking
  // a section, tapping the scrim, or pressing Esc closes it. Desktop is unaffected.
  var scrim = document.getElementById("mobile-scrim");
  var hamb = document.createElement("button");
  hamb.id = "mobileNavBtn";
  hamb.type = "button";
  hamb.setAttribute("aria-label", "Open navigation");
  hamb.setAttribute("aria-expanded", "false");
  hamb.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
  document.body.appendChild(hamb);

  function railOpen() { return nav.classList.contains("mobile-open"); }
  function openRail() {
    nav.classList.add("mobile-open");
    if (scrim) scrim.classList.add("active");
    hamb.setAttribute("aria-expanded", "true");
  }
  function closeRail() {
    nav.classList.remove("mobile-open");
    hamb.setAttribute("aria-expanded", "false");
    // only drop the shared scrim if no other drawer (library/inspector) is using it
    if (scrim && !document.querySelector("#library.drawer-open, #inspector.drawer-open")) scrim.classList.remove("active");
  }
  hamb.addEventListener("click", function () { railOpen() ? closeRail() : openRail(); });
  if (scrim) scrim.addEventListener("click", function () { if (railOpen()) closeRail(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && railOpen()) closeRail(); });

  window.addEventListener("resize", function () {
    setActive(desiredSection);
    if (window.innerWidth > 900) closeRail(); // leaving mobile → ensure the drawer state resets
  });

  function setExpanded(on, persist) {
    nav.classList.toggle("expanded", on);
    if (collapseBtn) {
      collapseBtn.setAttribute("aria-expanded", on ? "true" : "false");
      collapseBtn.title = on ? "Collapse navigation" : "Expand navigation";
      var ic = collapseBtn.querySelector(".rail-ic");
      if (ic && window.Studio && Studio.icon) { ic.innerHTML = ""; ic.appendChild(Studio.icon(on ? "chevron-left" : "chevron-right", 18)); }
    }
    if (persist !== false) { try { localStorage.setItem(LS_EXPANDED, on ? "1" : "0"); } catch (e) {} }
  }

  items.forEach(function (btn) {
    btn.addEventListener("click", function () { setActive(btn.getAttribute("data-sec")); closeRail(); });
  });
  if (collapseBtn) collapseBtn.addEventListener("click", function () { setExpanded(!nav.classList.contains("expanded")); });

  // Z12: the rail's brand mark is the app's persistent identity — clicking it goes Home.
  var brandBtn = document.getElementById("railBrand");
  if (brandBtn) brandBtn.addEventListener("click", function () { setActive("home"); closeRail(); });

  // roving keyboard nav within the rail (arrow keys move focus between section buttons)
  nav.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    var focusable = items.concat(collapseBtn ? [collapseBtn] : []);
    var i = focusable.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    var next = e.key === "ArrowDown" ? (i + 1) % focusable.length : (i - 1 + focusable.length) % focusable.length;
    focusable[next].focus();
  });

  var savedSection = "home", savedExpanded = false;
  try { savedSection = localStorage.getItem(LS_SECTION) || "home"; savedExpanded = localStorage.getItem(LS_EXPANDED) === "1"; } catch (e) {}
  setActive(savedSection, false);
  setExpanded(savedExpanded, false);

  // M4 (admin): rail items marked data-admin-only (today: just Admin) hide for
  // non-admin accounts — UI-level gating, matching auth.js's own honesty about not
  // being cryptographic enforcement (that's the later Supabase-RLS slice, M7).
  // PolecatAuth.current() is synchronous (localStorage-only, no crypto), so this
  // reads correctly even on the very first paint of an already-signed-in reload.
  // shell.js runs BEFORE gate.js's login handler (script order, see index.html), so
  // a fresh sign-in re-runs this itself via the exposed hook below.
  var adminOnlyItems = items.filter(function (btn) { return btn.hasAttribute("data-admin-only"); });
  // M4.2 (per-section rights half): admins can additionally hide ordinary sections
  // from the viewer role (Studio.__studioSectionRights, defined in studio.js —
  // may not exist yet on the very first call, since shell.js runs before studio.js;
  // the `|| []` fallback leaves every section visible until studio.js's own boot
  // re-applies gating with the real list, so nothing is ever wrongly hidden).
  var rightsItems = items.filter(function (btn) { return !btn.hasAttribute("data-admin-only"); });
  function applyRoleGating() {
    var Auth = window.PolecatAuth;
    var me = Auth && Auth.current();
    var isAdmin = !Auth || !me || me.role === "admin";
    adminOnlyItems.forEach(function (btn) { btn.hidden = !isAdmin; });
    var hidden = (window.__studioSectionRights && window.__studioSectionRights.get()) || [];
    rightsItems.forEach(function (btn) {
      var sec = btn.getAttribute("data-sec");
      btn.hidden = !isAdmin && hidden.indexOf(sec) >= 0;
    });
    if (!isAdmin && desiredSection === "admin") setActive("home");
    if (!isAdmin && hidden.indexOf(desiredSection) >= 0) setActive("home");
  }
  applyRoleGating();
  window.__studioShellApplyRoleGating = applyRoleGating;

  window.__studioShellSetSection = setActive; // test hook
  window.__studioShellGetSection = function () { return desiredSection; }; // LF27(b): lets studio.js capture the section Studio was entered from
})();
