/* tutorial.js — Analytics interactive tutorials.
   J6 (rebuilt for the Viridis-era app): TWO guided, spotlighted walkthroughs
   behind a chooser —
     · "Quick analysis"  — the Explore flow: dataset → table → chart → saved
       analysis → pin/add. The fastest data-to-chart path; the headline tour.
     · "Build a dashboard" — the Studio loop: library → canvas → inspector →
       export a self-contained .html.
   Distinct from the welcome tour (welcome.js), which is informational.
   Steps may carry a `before()` hook (switch section, seed Explore) and the
   renderer WAITS for the step's target to exist, so tours can walk UI that
   builds asynchronously.

   KEEP THESE TOURS CURRENT: any slice that changes a user-facing flow this
   tutorial walks (Explore, Studio panes, export, Jobs) updates the copy here
   in the SAME slice — the suite greps this file for retired product terms.

   window.StudioTutorial.open()        — tour chooser (or restart)
   window.StudioTutorial.openTour(key) — start a specific tour ("quick"|"build")
   window.StudioTutorial.isDone()      — true once any tour was completed.
   © 2026 Polecat.live. See LICENSE. */
(function () {
  "use strict";
  var T = window.StudioTutorial = {};
  var DONE_KEY = "studio-tutorial-done";
  var PAD = 10;  // px padding around spotlight target

  function goSection(sec) {
    try { if (window.__studioShellSetSection) window.__studioShellSetSection(sec); } catch (e) {}
  }
  // Explore steps need a dataset picked so the table/chips/preview exist —
  // pick the first sample deterministically if the user hasn't picked one.
  function seedExplore() {
    goSection("explore");
    try {
      var st = window.__studioExplore && window.__studioExplore.state;
      if (st && st.dsId) return;
      var btn = [].filter.call(document.querySelectorAll(".xp-ds"), function (b) {
        return (b.getAttribute("data-xp-ds") || "").indexOf("sample") === 0;
      })[0] || document.querySelector(".xp-ds");
      if (btn) btn.click();
    } catch (e) {}
  }

  /* ---------- tour definitions ----------
     target: CSS selector (null → centered card, no spotlight)
     pos:    preferred tooltip position ("right"/"left"/"top"/"bottom")
     before: optional fn run before the step renders (section switch / seeding)
     last:   true on the final step — shows "Done!" instead of "Next" */
  var TOURS = {
    quick: {
      label: "Quick analysis",
      blurb: "From a dataset to a saved, reusable chart in about a minute — the fastest way in.",
      steps: [
        {
          t: "Your first analysis, fast",
          h: "This is the quickest path from data to insight: pick a dataset, see it as a table, choose a chart, and save the result as a reusable <b>analysis</b>. Six quick steps.",
          sub: "You can reopen these tours any time from ⋯ More → Interactive tutorial, or Home → Take the tour.",
          target: null,
          before: function () { goSection("explore"); }
        },
        {
          t: "1 · Pick a dataset",
          h: "Everything starts from data. <b>Your workspace datasets</b> are listed first (they run live against their connections); <b>sample data</b> sits below so you can play before connecting anything.",
          sub: "We've picked a sample for you — the search box filters by name or column.",
          target: ".xp-side",
          pos: "right",
          before: seedExplore
        },
        {
          t: "2 · See the data first",
          h: "The table shows real rows and columns before you chart anything — live rows when the dataset has a connection, typed sample rows otherwise (the badge says which).",
          target: ".xp-table-wrap",
          pos: "bottom"
        },
        {
          t: "3 · Choose the chart",
          h: "Pick how to see it — bars, lines, tables… including the <b>US county map</b> and the <b>Ensemble</b> chart that blends many sources into one best common estimate.",
          sub: "Column mappings are guessed for you and editable right below the chips.",
          target: ".xp-chips",
          pos: "bottom"
        },
        {
          t: "4 · The result is real",
          h: "The preview is the <b>actual dashboard renderer</b> — what you see here is exactly what any dashboard will show. Change the chart or mapping and it updates live.",
          target: "#xpPreview",
          pos: "top"
        },
        {
          t: "5 · Name it, save it",
          h: "Give it a name and <b>Save analysis</b>. Saved analyses are reusable everywhere: ★ pins one to <b>Home</b> as a live widget; ▦ drops it into the current dashboard as a panel.",
          target: ".xp-savebar",
          pos: "top"
        },
        {
          t: "6 · It follows you",
          h: "Your saved analyses live in the left list here, in the Studio library under <b>Analyses</b>, and (when pinned) as live cards on <b>Home</b> — the app opens on your charts, not on machinery.",
          sub: "Need to prep data first (rename, filter, roll up)? The <b>Jobs</b> section does that and lands the result back in Datasets.",
          target: ".xp-saved",
          pos: "right"
        },
        {
          t: "That's the fast path!",
          h: "<b>Dataset → table → chart → saved analysis.</b> When you want full dashboards — many panels, KPIs, filters, export — take the <b>Build a dashboard</b> tour next.",
          sub: "⋯ More → Interactive tutorial brings you back here any time.",
          target: null,
          last: true
        }
      ]
    },
    build: {
      label: "Build a dashboard",
      blurb: "The full Studio loop — arrange panels, tune charts, export a file that runs anywhere.",
      steps: [
        {
          t: "Build a full dashboard",
          h: "This walkthrough shows the Studio loop — from picking data to exporting a live, self-contained dashboard file. Press <b>Next</b> to begin.",
          sub: "You can reopen these tours any time from ⋯ More → Interactive tutorial.",
          target: null,
          before: function () { goSection("studio"); }
        },
        {
          t: "1 · The Library",
          h: "The <b>Library</b> (left pane) holds everything chartable: your saved <b>Analyses</b>, your <b>workspace datasets</b>, this dashboard's own datasets, and the sample queries. Search filters by name, column, or table.",
          sub: "Click a chart chip on any card — or drag the card straight onto the canvas.",
          target: "#library",
          pos: "right"
        },
        {
          t: "2 · Canvas — live preview",
          h: "The centre pane is the <b>real rendered dashboard</b>, not a mock-up. Drop data here to add a panel; drag the header grip to reorder; drag the right edge to resize.",
          sub: "Every change updates instantly.",
          target: "#canvas",
          pos: "right"
        },
        {
          t: "3 · Inspector",
          h: "Click any panel to select it. The <b>Inspector</b> (right pane) renames it, changes the chart type, binds columns, and tunes visual options — the same pane also configures KPI tiles, filters, and datasets.",
          target: "#inspector",
          pos: "left"
        },
        {
          t: "4 · Export — it runs anywhere",
          h: "Click <b>Export ▾</b> to download a <b>self-contained .html file</b> — no server, no dependencies; email it, host it, open it from disk. It's byte-identical to the preview you've been looking at.",
          sub: "Save keeps the editable .studio.json spec so you can reopen and keep working.",
          target: "#btnExport",
          pos: "bottom"
        },
        {
          t: "You're ready to build!",
          h: "That's the loop: <b>pick data → arrange panels → configure → export</b>. Feature a dashboard on <b>Home</b> (the little house on its card) to see it live when you open the app, and use <b>Jobs</b> to prep or roll up data before charting.",
          sub: "Hit ＋ New ▾ → Auto-build to scaffold a starter dashboard automatically from a query set.",
          target: null,
          last: true
        }
      ]
    }
  };
  var TOUR_ORDER = ["quick", "build"];

  var _tour = null;   // active tour key, null while the chooser is up
  var _cur = 0;
  var _active = false;

  /* --- CSS (injected once) — themed via the shared custom properties --- */
  function injectStyle() {
    if (document.getElementById("st-style")) return;
    var s = document.createElement("style"); s.id = "st-style";
    s.textContent =
      ".st-dim{position:fixed;background:rgba(6,10,20,.62);z-index:9900;pointer-events:all}" +
      "#st-ring{position:fixed;border:2.5px solid var(--pdc,#7d3c98);border-radius:7px;z-index:9905;pointer-events:none;box-shadow:0 0 0 4px color-mix(in srgb,var(--pdc,#7d3c98) 20%,transparent)}" +
      "#st-scrim{position:fixed;inset:0;z-index:9899;background:rgba(6,10,20,.62);pointer-events:all}" +
      "#st-tip{position:fixed;z-index:9920;background:var(--pane,#fff);border-radius:14px;" +
        "box-shadow:0 16px 56px rgba(6,16,38,.42);width:min(400px,92vw);" +
        "padding:20px 22px 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
        "pointer-events:all}" +
      "#st-tip h3{margin:0 0 9px;font-size:16px;font-weight:800;color:var(--ink,#0a1c3d)}" +
      "#st-tip .st-h{font-size:13.5px;line-height:1.62;color:var(--ink,#243149);margin:0 0 7px}" +
      "#st-tip .st-h b{color:var(--brand,#005bb5)}" +
      "#st-tip .st-sub{font-size:11.5px;color:var(--muted,#6e809a);line-height:1.5;margin:0 0 13px;font-style:italic}" +
      "#st-tip .st-ft{display:flex;align-items:center;gap:8px}" +
      "#st-tip .st-dots{display:flex;gap:5px;margin-right:4px}" +
      "#st-tip .st-dots i{width:6px;height:6px;border-radius:50%;background:var(--line,#c8d0dc);display:block}" +
      "#st-tip .st-dots i.on{background:var(--pdc,#7d3c98)}" +
      "#st-tip .st-skip{background:none;border:0;color:var(--faint,#8a9cb0);font-size:12px;cursor:pointer;padding:0}" +
      "#st-tip .st-skip:hover{color:var(--ink,#243149)}" +
      "#st-tip .st-sp{flex:1}" +
      "#st-tip button.st-btn{border:1px solid var(--line,#d5dce8);background:var(--field,#f5f8fc);color:var(--ink,#16233b);border-radius:8px;padding:7px 14px;font-size:13px;font-weight:700;cursor:pointer;margin-left:4px}" +
      "#st-tip button.st-btn:hover{border-color:var(--brand,#005bb5);color:var(--brand,#005bb5)}" +
      "#st-tip button.st-btn.pri{background:var(--pdc,#7d3c98);border-color:transparent;color:#fff}" +
      "#st-tip button.st-btn.pri:hover{background:color-mix(in srgb,var(--pdc,#7d3c98) 85%,black)}" +
      /* tour chooser cards */
      "#st-tip .st-choice{display:flex;width:100%;text-align:left;flex-direction:column;gap:3px;border:1.5px solid var(--line,#d5dce8);" +
        "background:var(--field,#f5f8fc);border-radius:11px;padding:12px 14px;margin:0 0 9px;cursor:pointer}" +
      "#st-tip .st-choice:hover{border-color:var(--pdc,#7d3c98)}" +
      "#st-tip .st-choice b{font-size:13.5px;color:var(--ink,#16233b)}" +
      "#st-tip .st-choice small{font-size:11.5px;color:var(--muted,#6e809a);line-height:1.45}";
    document.head.appendChild(s);
  }

  /* --- Helpers --- */
  function padRect(r) {
    return {
      top: r.top - PAD, left: r.left - PAD, right: r.right + PAD, bottom: r.bottom + PAD,
      width: r.width + PAD * 2, height: r.height + PAD * 2
    };
  }
  function removeLayer(id) { var el = document.getElementById(id); if (el) el.remove(); }
  function clearOverlays() {
    ["st-ring", "st-scrim", "st-tip"].forEach(removeLayer);
    [].slice.call(document.querySelectorAll(".st-dim")).forEach(function (d) { d.remove(); });
  }
  // Wait for a selector to exist AND have a laid-out box (tours walk UI that
  // renders asynchronously — Explore fetches rows before its steps exist).
  function waitFor(sel, timeout) {
    return new Promise(function (resolve) {
      if (!sel) return resolve(null);
      var t0 = Date.now();
      (function poll() {
        var el = document.querySelector(sel);
        if (el && el.getBoundingClientRect().width > 0) return resolve(el);
        if (Date.now() - t0 > (timeout || 2500)) return resolve(el || null);
        setTimeout(poll, 90);
      })();
    });
  }

  /* --- Tour chooser --- */
  function renderChooser() {
    clearOverlays();
    var scrim = document.createElement("div"); scrim.id = "st-scrim";
    scrim.onclick = function (e) { if (e.target === scrim) close(); };
    document.body.appendChild(scrim);
    var tip = document.createElement("div"); tip.id = "st-tip";
    tip.innerHTML =
      "<h3>Pick a tour</h3>" +
      '<div class="st-h">Two quick, guided walkthroughs — spotlights on the real app, a couple of minutes each.</div>' +
      TOUR_ORDER.map(function (k) {
        return '<button type="button" class="st-choice" data-tour="' + k + '"><b>' + TOURS[k].label + "</b><small>" + TOURS[k].blurb + "</small></button>";
      }).join("") +
      '<div class="st-ft"><button class="st-skip" aria-label="Close tours">Maybe later</button><div class="st-sp"></div></div>';
    tip.querySelector(".st-skip").onclick = close;
    [].slice.call(tip.querySelectorAll("[data-tour]")).forEach(function (btn) {
      btn.onclick = function () { startTour(btn.getAttribute("data-tour")); };
    });
    document.body.appendChild(tip);
    positionTip(tip, null);
    setTimeout(function () { var f = tip.querySelector("[data-tour]"); if (f) f.focus(); }, 60);
  }

  /* --- Core renderer --- */
  function render(idx) {
    _cur = idx;
    var steps = TOURS[_tour].steps;
    var step = steps[idx];
    Promise.resolve(step.before ? step.before() : null).then(function () {
      return waitFor(step.target, 2500);
    }).then(function (tEl) {
      if (!_active || _cur !== idx) return; // user moved on / closed while waiting
      clearOverlays();

      if (!tEl) {
        var scrim = document.createElement("div"); scrim.id = "st-scrim";
        scrim.onclick = function (e) { if (e.target === scrim) close(); };
        document.body.appendChild(scrim);
      } else {
        var r = padRect(tEl.getBoundingClientRect());
        var W = window.innerWidth, H = window.innerHeight;
        [
          { top: 0, left: 0, width: W, height: Math.max(0, r.top) },
          { top: Math.min(H, r.bottom), left: 0, width: W, height: Math.max(0, H - r.bottom) },
          { top: r.top, left: 0, width: Math.max(0, r.left), height: r.height },
          { top: r.top, left: Math.min(W, r.right), width: Math.max(0, W - r.right), height: r.height }
        ].forEach(function (p) {
          if (p.width <= 0 || p.height <= 0) return;
          var d = document.createElement("div"); d.className = "st-dim";
          d.style.cssText = "top:" + p.top + "px;left:" + p.left + "px;width:" + p.width + "px;height:" + p.height + "px";
          document.body.appendChild(d);
        });
        var ring = document.createElement("div"); ring.id = "st-ring";
        ring.style.cssText = "top:" + r.top + "px;left:" + r.left + "px;width:" + r.width + "px;height:" + r.height + "px";
        document.body.appendChild(ring);
        try { tEl.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e) {}
      }

      var tip = document.createElement("div"); tip.id = "st-tip";
      var dots = steps.map(function (_, j) { return '<i class="' + (j === idx ? "on" : "") + '"></i>'; }).join("");
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
      positionTip(tip, tEl, step.pos);
      if (nxt) setTimeout(function () { nxt.focus(); }, 60);
    });
  }

  function positionTip(tip, tEl, pos) {
    var TW = tip.offsetWidth || 380;
    var TH = tip.offsetHeight || 160;
    var W = window.innerWidth;
    var H = window.innerHeight;
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
    tip.style.top = Math.round(y) + "px";
  }

  /* --- Close / finish --- */
  function close() {
    clearOverlays();
    document.removeEventListener("keydown", _onKey);
    _active = false;
    _tour = null;
  }

  function finish() {
    try {
      localStorage.setItem(DONE_KEY, "1");
      if (_tour) localStorage.setItem(DONE_KEY + "-" + _tour, "1");
    } catch (e) {}
    var wasQuick = _tour === "quick";
    close();
    if (window.__fireToast) window.__fireToast(wasQuick ? "Tour complete! Save an analysis and pin it to Home." : "Tutorial complete! Start building your dashboard.");
  }

  function _onKey(e) {
    if (!_active) return;
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    if (!_tour) return; // chooser: arrows don't apply
    if (e.key === "ArrowRight" && _cur < TOURS[_tour].steps.length - 1) render(_cur + 1);
    if (e.key === "ArrowLeft" && _cur > 0) render(_cur - 1);
  }

  function startTour(key) {
    if (!TOURS[key]) key = "quick";
    _tour = key;
    _cur = 0;
    render(0);
  }

  /* --- Public API --- */
  T.open = function () {
    injectStyle();
    close();
    _active = true;
    document.addEventListener("keydown", _onKey);
    renderChooser();
  };
  T.openTour = function (key) {
    injectStyle();
    close();
    _active = true;
    document.addEventListener("keydown", _onKey);
    startTour(key);
  };

  T.isDone = function () {
    try { return localStorage.getItem(DONE_KEY) === "1"; } catch (e) { return false; }
  };

  /* Exposed for tests */
  T.currentStep = function () { return _cur; };
  T.currentTour = function () { return _tour; };
  T.tourKeys = function () { return TOUR_ORDER.slice(); };
  T.stepCount = function (key) { return TOURS[key || _tour || "build"].steps.length; };
  window.__studioTutorialActive = function () { return _active; };
  window.__studioTutorialStep = function () { return _cur; };
  window.__studioTutorialTour = function () { return _tour; };
})();
