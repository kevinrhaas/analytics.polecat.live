/* tutorial.js — Analytics Dashboard Studio interactive tutorial.
   J6: step-by-step guided walkthrough of the core builder workflow.
   Distinct from the welcome tour (welcome.js), which is informational.
   This tutorial spotlights real UI elements and guides the user through
   the create → configure → export loop.

   window.StudioTutorial.open() — start (or restart) the tutorial.
   window.StudioTutorial.isDone() — true if the user has completed it.
   © 2026 Polecat.live. See LICENSE. */
(function () {
  "use strict";
  var T = window.StudioTutorial = {};
  var DONE_KEY = "studio-tutorial-done";
  var PAD = 10;  // px padding around spotlight target

  /* ---------- step definitions ----------
     target: CSS selector (null → centered card, no spotlight)
     pos:    preferred tooltip position relative to target ("right"/"left"/"top"/"bottom")
     last:   true on the final step — shows "Done!" instead of "Next" */
  var STEPS = [
    {
      t: "Build your first dashboard",
      h: "This quick walkthrough (5 steps) shows you the core workflow — from picking a data source to exporting a live CDF file. Press <b>Next</b> to begin.",
      sub: "You can reopen this tutorial at any time from ⋯ More → Interactive tutorial.",
      target: null
    },
    {
      t: "1 · Query Library",
      h: "The <b>Query Library</b> (left pane) lists your CDA data sources, grouped by query file. Expand a group to browse individual data accesses, or type in the search box to filter by name, column, or table.",
      sub: "Tip: drag any data source card from here straight onto the canvas to create a chart panel.",
      target: "#library",
      pos: "right"
    },
    {
      t: "2 · Canvas — live preview",
      h: "The centre pane is the <b>live CDF preview</b>. Drag a data source from the library and drop it here to add a panel. Reorder panels by dragging the header grip; resize by dragging the right edge.",
      sub: "Every change updates instantly — you're always looking at the real rendered dashboard.",
      target: "#canvas",
      pos: "right"
    },
    {
      t: "3 · Inspector",
      h: "Click any panel on the canvas to select it. The <b>Inspector</b> (right pane) lets you rename the panel, choose a chart type, bind data columns, and tune visual options.",
      sub: "The same inspector also configures KPI tiles, filter controls, and data sources.",
      target: "#inspector",
      pos: "left"
    },
    {
      t: "4 · Export",
      h: "When your dashboard looks great, click <b>Export ▾</b> to download a self-contained <b>CDF .html</b> file — ready to drop into Pentaho. You can also export CDE editor files or push directly to a live Pentaho server.",
      sub: "Or use the CLI tool (tools/export.js) to generate artifacts outside the browser.",
      target: "#btnExport",
      pos: "bottom"
    },
    {
      t: "You're ready to build!",
      h: "That's the core loop: <b>pick data → arrange panels → configure → export</b>. Explore the chart gallery, try the Auto-build feature (＋ New ▾), or check the help docs for deep dives.",
      sub: "Hit ＋ New ▾ → Auto-build to scaffold a full starter dashboard automatically from a query set.",
      target: null,
      last: true
    }
  ];

  var _cur = 0;
  var _active = false;

  /* --- CSS (injected once) --- */
  function injectStyle() {
    if (document.getElementById("st-style")) return;
    var s = document.createElement("style"); s.id = "st-style";
    s.textContent =
      /* semi-transparent spotlight overlay panels */
      ".st-dim{position:fixed;background:rgba(6,16,38,.62);z-index:9900;pointer-events:all}" +
      /* highlight ring around the target element */
      "#st-ring{position:fixed;border:2.5px solid #7d3c98;border-radius:7px;z-index:9905;pointer-events:none;box-shadow:0 0 0 4px rgba(125,60,152,.2)}" +
      /* full-screen scrim for centered (no-target) steps */
      "#st-scrim{position:fixed;inset:0;z-index:9899;background:rgba(6,16,38,.62);pointer-events:all}" +
      /* tooltip card */
      "#st-tip{position:fixed;z-index:9920;background:#fff;border-radius:14px;" +
        "box-shadow:0 16px 56px rgba(6,16,38,.42);width:min(380px,90vw);" +
        "padding:20px 22px 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
        "pointer-events:all}" +
      "body.dark-mode #st-tip,body.dark #st-tip{background:#1a2540;color:#c2d4ea}" +
      "#st-tip h3{margin:0 0 9px;font-size:16px;font-weight:800;color:#0a1c3d}" +
      "body.dark-mode #st-tip h3,body.dark #st-tip h3{color:#c2d4ea}" +
      "#st-tip .st-h{font-size:13.5px;line-height:1.62;color:#243149;margin:0 0 7px}" +
      "body.dark-mode #st-tip .st-h,body.dark #st-tip .st-h{color:#a0b8cc}" +
      "#st-tip .st-h b{color:#005bb5}" +
      "body.dark-mode #st-tip .st-h b,body.dark #st-tip .st-h b{color:#5da0e0}" +
      "#st-tip .st-sub{font-size:11.5px;color:#6e809a;line-height:1.5;margin:0 0 13px;font-style:italic}" +
      "body.dark-mode #st-tip .st-sub,body.dark #st-tip .st-sub{color:#5d7890}" +
      "#st-tip .st-ft{display:flex;align-items:center;gap:8px}" +
      "#st-tip .st-dots{display:flex;gap:5px;margin-right:4px}" +
      "#st-tip .st-dots i{width:6px;height:6px;border-radius:50%;background:#c8d0dc;display:block}" +
      "#st-tip .st-dots i.on{background:#7d3c98}" +
      "#st-tip .st-skip{background:none;border:0;color:#8a9cb0;font-size:12px;cursor:pointer;padding:0}" +
      "#st-tip .st-skip:hover{color:#243149}" +
      "#st-tip .st-sp{flex:1}" +
      "#st-tip button.st-btn{border:1px solid #d5dce8;background:#f5f8fc;color:#16233b;border-radius:8px;padding:7px 14px;font-size:13px;font-weight:700;cursor:pointer;margin-left:4px}" +
      "#st-tip button.st-btn:hover{border-color:#005bb5;color:#005bb5}" +
      "#st-tip button.st-btn.pri{background:#7d3c98;border-color:transparent;color:#fff}" +
      "#st-tip button.st-btn.pri:hover{background:#8e49ab}";
    document.head.appendChild(s);
  }

  /* --- Helpers --- */
  function padRect(r) {
    return {
      top:    r.top    - PAD,
      left:   r.left   - PAD,
      right:  r.right  + PAD,
      bottom: r.bottom + PAD,
      width:  r.width  + PAD * 2,
      height: r.height + PAD * 2
    };
  }

  function removeLayer(id) { var el = document.getElementById(id); if (el) el.remove(); }

  /* --- Core renderer --- */
  function render(idx) {
    _cur = idx;
    var step = STEPS[idx];

    // tear down previous overlays
    ["st-ring", "st-scrim"].forEach(removeLayer);
    var prevTip = document.getElementById("st-tip"); if (prevTip) prevTip.remove();
    // remove all spotlight dim panels
    [].slice.call(document.querySelectorAll(".st-dim")).forEach(function (d) { d.remove(); });

    var tEl = step.target ? document.querySelector(step.target) : null;

    if (!tEl) {
      /* Centered step — full-screen scrim */
      var scrim = document.createElement("div"); scrim.id = "st-scrim";
      scrim.onclick = function (e) { if (e.target === scrim) close(); };
      document.body.appendChild(scrim);
    } else {
      /* Spotlight step — 4 dim panels around the target */
      var r = padRect(tEl.getBoundingClientRect());
      var W = window.innerWidth, H = window.innerHeight;
      [
        { top: 0,            left: 0,      width: W,                            height: Math.max(0, r.top)    },  // above
        { top: Math.min(H, r.bottom), left: 0,      width: W,                            height: Math.max(0, H - r.bottom)  }, // below
        { top: r.top,        left: 0,      width: Math.max(0, r.left),          height: r.height              },  // left strip
        { top: r.top,        left: Math.min(W, r.right), width: Math.max(0, W - r.right), height: r.height  }   // right strip
      ].forEach(function (p) {
        if (p.width <= 0 || p.height <= 0) return;
        var d = document.createElement("div"); d.className = "st-dim";
        d.style.cssText = "top:" + p.top + "px;left:" + p.left + "px;width:" + p.width + "px;height:" + p.height + "px";
        document.body.appendChild(d);
      });

      /* Highlight ring */
      var ring = document.createElement("div"); ring.id = "st-ring";
      ring.style.cssText = "top:" + r.top + "px;left:" + r.left + "px;width:" + r.width + "px;height:" + r.height + "px";
      document.body.appendChild(ring);

      /* Scroll target element into view */
      try { tEl.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e) {}
    }

    /* Tooltip */
    var tip = document.createElement("div"); tip.id = "st-tip";
    var dots = STEPS.map(function (_, j) { return '<i class="' + (j === idx ? "on" : "") + '"></i>'; }).join("");
    tip.innerHTML =
      "<h3>" + step.t + "</h3>" +
      '<div class="st-h">' + step.h + "</div>" +
      (step.sub ? '<div class="st-sub">' + step.sub + "</div>" : "") +
      '<div class="st-ft"><div class="st-dots">' + dots + "</div>" +
        '<button class="st-skip" aria-label="Skip tutorial">Skip</button>' +
        '<div class="st-sp"></div>' +
        (idx > 0 ? '<button class="st-btn" data-act="back">Back</button>' : "") +
        '<button class="st-btn pri" data-act="next">' + (step.last ? "Done!" : "Next →") + "</button>" +
      "</div>";

    tip.querySelector(".st-skip").onclick = close;
    var nxt = tip.querySelector('[data-act="next"]');
    if (nxt) nxt.onclick = function () { step.last ? finish() : render(_cur + 1); };
    var bck = tip.querySelector('[data-act="back"]');
    if (bck) bck.onclick = function () { render(_cur - 1); };

    document.body.appendChild(tip);

    /* Position tooltip relative to target (or centred) */
    positionTip(tip, tEl, step.pos);

    /* Auto-focus the Next button for keyboard navigation */
    if (nxt) setTimeout(function () { nxt.focus(); }, 60);
  }

  function positionTip(tip, tEl, pos) {
    var TW = tip.offsetWidth  || 380;
    var TH = tip.offsetHeight || 160;
    var W  = window.innerWidth;
    var H  = window.innerHeight;
    var MARGIN = 18;
    var x, y;

    if (!tEl) {
      x = W / 2 - TW / 2;
      y = H / 2 - TH / 2;
    } else {
      var r = tEl.getBoundingClientRect();
      var rp = padRect(r);
      switch (pos) {
        case "right":
          x = Math.min(W - TW - MARGIN, rp.right + MARGIN);
          y = Math.max(MARGIN, Math.min(H - TH - MARGIN, r.top + r.height / 2 - TH / 2));
          break;
        case "left":
          x = Math.max(MARGIN, rp.left - TW - MARGIN);
          y = Math.max(MARGIN, Math.min(H - TH - MARGIN, r.top + r.height / 2 - TH / 2));
          break;
        case "top":
          x = Math.max(MARGIN, Math.min(W - TW - MARGIN, r.left + r.width / 2 - TW / 2));
          y = Math.max(MARGIN, rp.top - TH - MARGIN);
          break;
        default: /* bottom */
          x = Math.max(MARGIN, Math.min(W - TW - MARGIN, r.left + r.width / 2 - TW / 2));
          y = Math.min(H - TH - MARGIN, rp.bottom + MARGIN);
      }
    }
    tip.style.left = Math.round(x) + "px";
    tip.style.top  = Math.round(y) + "px";
  }

  /* --- Close / finish --- */
  function close() {
    ["st-ring", "st-scrim", "st-tip"].forEach(removeLayer);
    [].slice.call(document.querySelectorAll(".st-dim")).forEach(function (d) { d.remove(); });
    document.removeEventListener("keydown", _onKey);
    _active = false;
  }

  function finish() {
    try { localStorage.setItem(DONE_KEY, "1"); } catch (e) {}
    close();
    if (window.__fireToast) window.__fireToast("Tutorial complete! Start building your dashboard.");
  }

  function _onKey(e) {
    if (!_active) return;
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    if (e.key === "ArrowRight" && _cur < STEPS.length - 1) render(_cur + 1);
    if (e.key === "ArrowLeft"  && _cur > 0)                render(_cur - 1);
  }

  /* --- Public API --- */
  T.open = function () {
    injectStyle();
    close();
    _active = true;
    _cur = 0;
    document.addEventListener("keydown", _onKey);
    render(0);
  };

  T.isDone = function () {
    try { return localStorage.getItem(DONE_KEY) === "1"; } catch (e) { return false; }
  };

  /* Exposed for tests */
  T.currentStep = function () { return _cur; };
  T.stepCount   = function () { return STEPS.length; };
  window.__studioTutorialActive = function () { return _active; };
  window.__studioTutorialStep   = function () { return _cur; };
})();
