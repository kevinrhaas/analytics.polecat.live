/* Analytics Dashboard Studio — © 2026 Polecat.live. See LICENSE. */
/* shell.js — Z1: the app shell's collapsible left rail. Frames the whole app
   as a multi-section product (Home · Repository · Studio · Settings); Studio
   is the existing builder, moved under its own section with zero feature
   loss. Home/Repository/Settings are placeholder sections for later Z-track
   slices. Rail expand/collapse + active section persist in localStorage. */
(function () {
  "use strict";
  var LS_SECTION = "studio-shell-section";
  var LS_EXPANDED = "studio-shell-expanded";
  var SECTIONS = ["home", "repository", "studio", "settings"];

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

  var desiredSection = "studio";

  function setActive(sec, persist) {
    if (SECTIONS.indexOf(sec) < 0) sec = "studio";
    desiredSection = sec;
    if (persist !== false) { try { localStorage.setItem(LS_SECTION, sec); } catch (e) {} }
    // the rail is desktop-only for now (Z1 slice); tablet/phone always show Studio
    // so every existing mobile/tablet behavior stays exactly as before.
    var effective = window.innerWidth <= 900 ? "studio" : sec;
    SECTIONS.forEach(function (s) {
      var el = sectionEl(s);
      if (el) el.hidden = s !== effective;
    });
    items.forEach(function (btn) {
      var on = btn.getAttribute("data-sec") === sec;
      btn.classList.toggle("active", on);
      if (on) btn.setAttribute("aria-current", "page"); else btn.removeAttribute("aria-current");
    });
  }

  window.addEventListener("resize", function () { setActive(desiredSection); });

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
    btn.addEventListener("click", function () { setActive(btn.getAttribute("data-sec")); });
  });
  if (collapseBtn) collapseBtn.addEventListener("click", function () { setExpanded(!nav.classList.contains("expanded")); });

  // Z12: the rail's brand mark is the app's persistent identity — clicking it goes Home.
  var brandBtn = document.getElementById("railBrand");
  if (brandBtn) brandBtn.addEventListener("click", function () { setActive("home"); });

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

  var savedSection = "studio", savedExpanded = false;
  try { savedSection = localStorage.getItem(LS_SECTION) || "studio"; savedExpanded = localStorage.getItem(LS_EXPANDED) === "1"; } catch (e) {}
  setActive(savedSection, false);
  setExpanded(savedExpanded, false);

  window.__studioShellSetSection = setActive; // test hook
})();
