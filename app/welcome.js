/* welcome.js — first-run welcome / tour. Explains this is a Pentaho Solution
   Engineering demonstration of building CDF/CDE/CDA dashboard components on the
   Pentaho platform. Shows once (localStorage), reopenable via the topbar ⓘ.
   Self-contained styles. window.StudioWelcome.open() / .maybeShow(). */
(function () {
  "use strict";
  var W = window.StudioWelcome = {};
  var SEEN = "studio-welcome-seen";

  var STEPS = [
    { t: "Welcome to Demonstration Dashboard Studio", ic: "P",
      h: "A <b>Pentaho Solution Engineering</b> demonstration — a modern, visual way to build Pentaho dashboard components (<b>CDF</b>, <b>CDE</b>, <b>CDA</b>) and show off the power of the Pentaho platform.",
      s: "Design dashboards from your existing CDA queries, preview them live, and export deployable Pentaho artifacts." },
    { t: "Three panes", ic: "▥",
      h: "<b>Query Library</b> (left) lists CDA data accesses · <b>Live preview</b> (center) is the real dashboard · <b>Inspector</b> (right) edits whatever you select.",
      s: "Drag a query onto the canvas, pick a chart from the gallery, and tune it in the inspector." },
    { t: "Build by direct manipulation", ic: "✥",
      h: "Drag panels to reorder (across rows), drag the right edge to resize, double-click a title to rename, ⧉ duplicate, Ctrl/Cmd-Z to undo. KPIs, filters and 13 chart types included.",
      s: "Or hit <b>New ▸ Auto-build</b> to scaffold a whole dashboard from a query set in one click." },
    { t: "Export to Pentaho", ic: "⤓",
      h: "One model exports three ways: a self-contained <b>CDF</b> .html, an editable <b>CDE</b> .cdfde/.wcdf, and the <b>CDA</b> .cda — in the browser or via the CLI.",
      s: "CDF is the rich track; CDE opens and edits in Pentaho CDE." },
    { t: "Connect to a live Pentaho", ic: "⚙",
      h: "Add servers in <b>⚙ Servers</b> (Kettle slaveserver format), then <b>import</b> existing CDAs/dashboards, <b>preview live</b>, and <b>push</b> changes back — or schedule deploys with the CLI.",
      s: "No server? Everything works standalone with sample data + file export." }
  ];

  function injectStyle() {
    if (document.getElementById("sw-style")) return;
    var st = document.createElement("style"); st.id = "sw-style";
    st.textContent =
      "#studio-welcome{position:fixed;inset:0;z-index:95;display:flex;align-items:center;justify-content:center;background:rgba(10,22,46,.55);backdrop-filter:blur(3px);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}" +
      "#studio-welcome .sw{background:#fff;border-radius:16px;box-shadow:0 28px 80px rgba(8,20,45,.5);width:min(560px,94vw);overflow:hidden}" +
      "#studio-welcome .sw-hd{background:linear-gradient(120deg,#0a1c3d,#1c4a86);color:#fff;padding:26px 28px;display:flex;gap:16px;align-items:center}" +
      "#studio-welcome .sw-ic{width:52px;height:52px;border-radius:13px;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;flex:0 0 auto}" +
      "#studio-welcome .sw-hd h1{margin:0;font-size:19px;font-weight:800}" +
      "#studio-welcome .sw-bd{padding:20px 28px 8px;color:#243149;font-size:14px;line-height:1.6}#studio-welcome .sw-bd b{color:#005bb5}" +
      "#studio-welcome .sw-sub{color:#5d6b82;font-size:13px;margin-top:10px;line-height:1.55}" +
      "#studio-welcome .sw-dots{display:flex;gap:6px;justify-content:center;padding:6px 0 0}" +
      "#studio-welcome .sw-dots i{width:7px;height:7px;border-radius:50%;background:#cfd8e6;display:block}#studio-welcome .sw-dots i.on{background:#7d3c98}" +
      "#studio-welcome .sw-ft{display:flex;align-items:center;gap:10px;padding:16px 28px 22px}" +
      "#studio-welcome .sw-skip{background:none;border:0;color:#5d6b82;font-size:13px;cursor:pointer}#studio-welcome .sw-skip:hover{color:#16233b}" +
      "#studio-welcome .sp{flex:1}" +
      "#studio-welcome button.b{border:1px solid #d9e0ec;background:#f5f8fc;color:#16233b;border-radius:9px;padding:9px 16px;font-size:13.5px;font-weight:700;cursor:pointer}" +
      "#studio-welcome button.b:hover{border-color:#005bb5;color:#005bb5}" +
      "#studio-welcome button.b.pri{background:#7d3c98;border-color:transparent;color:#fff}#studio-welcome button.b.pri:hover{background:#8e49ab}";
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
      '<button class="b pri" data-act="next">' + (i === STEPS.length - 1 ? "Get started" : "Next") + "</button></div>";
    ov.querySelector(".sw-skip").onclick = close;
    var nx = ov.querySelector('[data-act="next"]'); if (nx) nx.onclick = function () { i === STEPS.length - 1 ? close() : render(i + 1); };
    var bk = ov.querySelector('[data-act="back"]'); if (bk) bk.onclick = function () { render(i - 1); };
  }
  function close() { try { localStorage.setItem(SEEN, "1"); } catch (e) {} var ov = document.getElementById("studio-welcome"); if (ov) ov.remove(); }

  W.open = function () {
    injectStyle();
    if (document.getElementById("studio-welcome")) return;
    var ov = document.createElement("div"); ov.id = "studio-welcome";
    ov.innerHTML = '<div class="sw"></div>';
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.body.appendChild(ov); render(0);
  };
  W.maybeShow = function () { try { if (localStorage.getItem(SEEN) === "1") return; } catch (e) {} W.open(); };
})();
