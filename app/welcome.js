/* welcome.js — first-run welcome / tour. Introduces Analytics
   (an analytics.polecat.live project) for building interactive dashboards over
   your data. Shows once (localStorage), reopenable via the topbar ⓘ.
   Self-contained styles. window.StudioWelcome.open() / .maybeShow(). */
(function () {
  "use strict";
  var W = window.StudioWelcome = {};
  var SEEN = "studio-welcome-seen";
  // Elements a keyboard user can land on, for the Tab-trap below (mirrors the
  // vendored shell's modal() FOCUSABLE — this tour predates it and keeps its
  // own .sw-* markup for the tests/CSS already built on it, so the trap is
  // ported in-place rather than switching to modal()).
  var FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
  var trigger = null;

  var STEPS = [
    { t: "Welcome to Analytics", ic: "P",
      h: "A modern, visual way to turn your data into <b>quick analyses</b> and <b>interactive dashboards</b> — entirely in your browser, local-first, nothing to install.",
      s: "Your work saves to this device and can mirror to your own backend. Everything also works offline on sample data." },
    { t: "Explore — answers in a minute", ic: "◈",
      h: "<b>Explore</b> (left rail) is the fastest path in: pick a dataset, see it as a table, choose a chart — including the <b>US county map</b> and the <b>Ensemble common-estimate</b> chart — and save it as a reusable <b>analysis</b>.",
      s: "Pin an analysis ★ to Home and it greets you live when you open the app; drop it into any dashboard with one click." },
    { t: "Studio — full dashboards", ic: "▥",
      h: "<b>Library</b> (left) lists your analyses, datasets and samples · <b>Live preview</b> (center) is the real dashboard · <b>Inspector</b> (right) edits whatever you select. Drag to reorder, resize, rename; Ctrl/Cmd-Z undoes.",
      s: "Or hit <b>New ▸ Auto-build</b> to scaffold a whole dashboard from a query set in one click." },
    { t: "Export — it runs anywhere", ic: "⤓",
      h: "Export a self-contained, interactive <b>.html</b> dashboard you can open or host anywhere — no server, no dependencies. The editable source is the <b>.studio.json</b> (Save / Open).",
      s: "The live preview is byte-identical to the exported dashboard." },
    { t: "Bring your data", ic: "⚙",
      h: "Add <b>Connections</b> and <b>Datasets</b> from the left rail — Postgres, Supabase, Snowflake, Databricks, BigQuery, Redshift, Google Sheets, files and more — then run live against the real source. <b>Jobs</b> preps and rolls data up before charting.",
      s: "Ready to try it? Take a guided tour — spotlights on the real app, two minutes." }
  ];

  function injectStyle() {
    if (document.getElementById("sw-style")) return;
    var st = document.createElement("style"); st.id = "sw-style";
    // Z10 follow-up: themed via the same --brand/--pdc/--ink/etc custom properties as
    // studio.css (this <style> lands in the same document, so it sees them) instead of
    // fixed hex — so the tour now follows both light/dark mode AND the Classic Blue /
    // Polecat color theme instead of always rendering Classic-Blue-only.
    st.textContent =
      "#studio-welcome{position:fixed;inset:0;z-index:95;display:flex;align-items:center;justify-content:center;background:rgba(10,10,15,.55);backdrop-filter:blur(3px);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}" +
      "#studio-welcome .sw{background:var(--pane,#fff);border-radius:16px;box-shadow:0 28px 80px rgba(8,20,45,.5);width:min(560px,94vw);overflow:hidden}" +
      "#studio-welcome .sw-hd{background:linear-gradient(120deg,var(--brand,#005bb5),var(--pdc,#7d3c98));color:#fff;padding:26px 28px;display:flex;gap:16px;align-items:center}" +
      "#studio-welcome .sw-ic{width:52px;height:52px;border-radius:13px;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;flex:0 0 auto}" +
      "#studio-welcome .sw-hd h1{margin:0;font-size:19px;font-weight:800}" +
      "#studio-welcome .sw-bd{padding:20px 28px 8px;color:var(--ink,#243149);font-size:14px;line-height:1.6}#studio-welcome .sw-bd b{color:var(--brand,#005bb5)}" +
      "#studio-welcome .sw-sub{color:var(--muted,#5d6b82);font-size:13px;margin-top:10px;line-height:1.55}" +
      "#studio-welcome .sw-dots{display:flex;gap:6px;justify-content:center;padding:6px 0 0}" +
      "#studio-welcome .sw-dots i{width:7px;height:7px;border-radius:50%;background:var(--line,#cfd8e6);display:block}#studio-welcome .sw-dots i.on{background:var(--pdc,#7d3c98)}" +
      "#studio-welcome .sw-ft{display:flex;align-items:center;gap:10px;padding:16px 28px 22px}" +
      "#studio-welcome .sw-skip{background:none;border:0;color:var(--muted,#5d6b82);font-size:13px;cursor:pointer}#studio-welcome .sw-skip:hover{color:var(--ink,#16233b)}" +
      "#studio-welcome .sp{flex:1}" +
      "#studio-welcome button.b{border:1px solid var(--line,#d9e0ec);background:var(--field,#f5f8fc);color:var(--ink,#16233b);border-radius:9px;padding:9px 16px;font-size:13.5px;font-weight:700;cursor:pointer}" +
      "#studio-welcome button.b:hover{border-color:var(--brand,#005bb5);color:var(--brand,#005bb5)}" +
      "#studio-welcome button.b.pri{background:var(--pdc,#7d3c98);border-color:transparent;color:#fff}#studio-welcome button.b.pri:hover{background:color-mix(in srgb,var(--pdc,#7d3c98) 85%,black)}";
    document.head.appendChild(st);
  }

  function render(i) {
    var ov = document.getElementById("studio-welcome"); if (!ov) return;
    var step = STEPS[i];
    ov.querySelector(".sw").innerHTML =
      '<div class="sw-hd"><div class="sw-ic">' + step.ic + '</div><h1>' + step.t + "</h1></div>" +
      '<div class="sw-bd">' + step.h + '<div class="sw-sub">' + step.s + "</div>" +
      '<div class="sw-dots">' + STEPS.map(function (_, j) { return '<i class="' + (j === i ? "on" : "") + '"></i>'; }).join("") + "</div></div>" +
      '<div class="sw-ft"><button class="sw-skip">Skip</button><span class="sp"></span>' +
      (i > 0 ? '<button class="b" data-act="back">Back</button>' : "") +
      (i === STEPS.length - 1 ? '<button class="b" data-act="tour">Take the guided tour</button>' : "") +
      '<button class="b pri" data-act="next">' + (i === STEPS.length - 1 ? "Get started" : "Next") + "</button></div>";
    ov.querySelector(".sw-skip").onclick = close;
    var nx = ov.querySelector('[data-act="next"]'); if (nx) nx.onclick = function () { i === STEPS.length - 1 ? close() : render(i + 1); };
    var tr = ov.querySelector('[data-act="tour"]'); if (tr) tr.onclick = function () { close(); if (window.StudioTutorial) StudioTutorial.open(); };
    var bk = ov.querySelector('[data-act="back"]'); if (bk) bk.onclick = function () { render(i - 1); };
    // Re-render replaces .sw's innerHTML, dropping whatever had focus — land
    // it back on the primary button so Tab stays inside the trap below
    // instead of silently falling through to <body> (and, from there, to
    // whatever's underneath the backdrop).
    (nx || bk || ov.querySelector(".sw-skip")).focus();
  }
  function close() {
    try { localStorage.setItem(SEEN, "1"); } catch (e) {}
    var ov = document.getElementById("studio-welcome"); if (ov) ov.remove();
    document.removeEventListener("keydown", onKey);
    // Restore focus to whatever opened the tour (the ⓘ/More→Tour trigger),
    // matching the shell's own modal()/sheet() focus-restore convention.
    if (trigger && document.contains(trigger) && typeof trigger.focus === "function") trigger.focus();
    trigger = null;
  }
  function onKey(e) {
    var ov = document.getElementById("studio-welcome"); if (!ov) return;
    if (e.key === "Escape") { close(); return; }
    if (e.key !== "Tab") return;
    var focusable = ov.querySelectorAll(FOCUSABLE);
    if (!focusable.length) { e.preventDefault(); return; }
    var first = focusable[0], last = focusable[focusable.length - 1];
    // Keep Tab (and Shift+Tab) cycling within the dialog — without this, a
    // keyboard user tabs straight through into the header nav trigger
    // sitting (invisibly, behind the backdrop) underneath the tour.
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!ov.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }

  W.open = function () {
    injectStyle();
    if (document.getElementById("studio-welcome")) return;
    trigger = document.activeElement;
    var ov = document.createElement("div"); ov.id = "studio-welcome";
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "Welcome to Analytics");
    ov.innerHTML = '<div class="sw"></div>';
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.body.appendChild(ov); render(0);
    document.addEventListener("keydown", onKey);
  };
  W.maybeShow = function () { try { if (localStorage.getItem(SEEN) === "1") return; } catch (e) {} W.open(); };
})();
