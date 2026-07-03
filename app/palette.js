/* Analytics Dashboard Studio — © 2026 Polecat.live. See LICENSE. */
/* palette.js — Track N (innovation): a command palette (⌘K / Ctrl-K).
   Fuzzy-jump to any section or action from one keyboard-first surface. It is
   deliberately additive and self-contained: every command simply drives an
   existing control (clicks a real button, or switches a rail section), so it
   reuses all existing wiring and can never drift out of sync with the app.
   Injects its own theme-aware CSS so it needs no edits to studio.css. */
(function () {
  "use strict";

  // ---- command registry -------------------------------------------------
  // Each command drives existing UI. `run` does the work; `sec` (optional)
  // switches to that rail section first so the result is visible. Keeping the
  // logic to "click the thing the user would have clicked" means zero new
  // behaviour to test in isolation and no duplicated business logic.
  function click(id) { var b = document.getElementById(id); if (b) b.click(); }
  function studio() { var b = document.querySelector('.rail-item[data-sec="studio"]'); if (b) b.click(); }
  function goSec(sec) { var b = document.querySelector('.rail-item[data-sec="' + sec + '"]'); if (b) b.click(); }

  var COMMANDS = [
    // navigation
    { label: "Go to Home", hint: "Section", kw: "home start dashboards recent", ic: "home", run: function () { goSec("home"); } },
    { label: "Go to Repository", hint: "Section", kw: "repository data sources workbooks library", ic: "layers", run: function () { goSec("repository"); } },
    { label: "Go to Studio", hint: "Section", kw: "studio builder canvas editor", ic: "grid", run: function () { studio(); } },
    { label: "Go to Settings", hint: "Section", kw: "settings preferences theme mode config", ic: "gear", run: function () { goSec("settings"); } },
    { label: "Open Help & docs", hint: "Reference", kw: "help docs documentation reference guide", ic: "info", run: function () { window.open("docs/index.html", "_blank", "noopener"); } },
    // dashboard lifecycle
    { label: "New dashboard", hint: "Create", kw: "new create blank start build", ic: "plus", run: function () { studio(); click("btnNew"); } },
    { label: "Browse examples", hint: "Create", kw: "examples gallery showcase templates samples", ic: "star", run: function () { studio(); click("btnExamples"); } },
    { label: "Open a .studio.json file", hint: "File", kw: "open import load file json", ic: "upload", run: function () { studio(); click("btnImport"); } },
    { label: "Save spec (.studio.json)", hint: "File", kw: "save download export json spec", ic: "download", run: function () { studio(); click("btnSaveSpec"); } },
    { label: "Export dashboard (.html)", hint: "Export", kw: "export dashboard framework html cdf publish", ic: "code", run: function () { studio(); var b = document.querySelector('#menuExport button[data-exp="cdf"]'); if (b) b.click(); } },
    { label: "Export all artifacts (bundle)", hint: "Export", kw: "export all bundle zip artifacts", ic: "copy", run: function () { studio(); var b = document.querySelector('#menuExport button[data-exp="all"]'); if (b) b.click(); } },
    { label: "Push to active server…", hint: "Export", kw: "push publish server pentaho deploy", ic: "upload", run: function () { studio(); var b = document.querySelector('#menuExport button[data-exp="push"]'); if (b) b.click(); } },
    // editing
    { label: "Add text / annotation panel", hint: "Edit", kw: "text annotation note markdown richtext add panel", ic: "edit", run: function () { studio(); click("btnAddText"); } },
    { label: "New data source", hint: "Data", kw: "new source data access cda query connect", ic: "db", run: function () { studio(); click("btnNewDS"); } },
    { label: "Undo", hint: "Edit", kw: "undo revert back step", ic: "undo", run: function () { studio(); click("btnUndo"); } },
    { label: "Redo", hint: "Edit", kw: "redo forward step", ic: "redo", run: function () { studio(); click("btnRedo"); } },
    // view / modes
    { label: "Toggle light / dark theme", hint: "View", kw: "theme dark light mode appearance color", ic: "moon", run: function () { click("btnTheme"); } },
    { label: "Toggle sample / live data", hint: "Data", kw: "sample live data offline pentaho connect toggle", ic: "refresh", run: function () { studio(); click("btnLive"); } },
    { label: "Focus mode", hint: "View", kw: "focus present clean distraction zen", ic: "eye", run: function () { studio(); click("morePresent"); } },
    { label: "Slideshow", hint: "Present", kw: "slideshow present slides fullscreen cycle", ic: "play", run: function () { studio(); click("moreSlideshow"); } },
    { label: "Demo mode", hint: "Present", kw: "demo live simulate refresh animate", ic: "clock", run: function () { studio(); click("moreDemoMode"); } },
    { label: "Simple mode", hint: "View", kw: "simple beginner basic easy streamlined", ic: "check", run: function () { studio(); click("moreSimple"); } },
    // learn / manage
    { label: "Manage server connections", hint: "Connect", kw: "servers connections pentaho jndi kettle manage", ic: "join", run: function () { studio(); click("btnConn"); } },
    { label: "Take the tour", hint: "Learn", kw: "tour welcome intro walkthrough onboarding", ic: "play", run: function () { studio(); click("btnAbout"); } },
    { label: "Interactive tutorial", hint: "Learn", kw: "tutorial walkthrough guide learn steps", ic: "metadata", run: function () { studio(); click("moreTutorial"); } },
    { label: "Keyboard shortcuts", hint: "Learn", kw: "keyboard shortcuts keys hotkeys cheatsheet", ic: "grip", run: function () { studio(); click("moreShortcuts"); } },
    { label: "Clear local data…", hint: "Manage", kw: "clear reset wipe local storage cache data", ic: "trash", run: function () { studio(); click("moreClearData"); } },
    { label: "Sign out", hint: "Manage", kw: "sign out logout leave lock", ic: "close", run: function () { studio(); click("moreSignOut"); } }
  ];

  // ---- dynamic commands ---------------------------------------------------
  // Examples and recent dashboards change as the user works, so unlike the
  // static COMMANDS above these are rebuilt fresh every time the palette
  // opens by reading the DOM the app already maintains (the Examples ▾ menu
  // and Home's recent-dashboard cards are both rendered at boot regardless of
  // which section is currently visible) — no new state, no drift possible.
  function exampleCommands() {
    return Array.prototype.map.call(document.querySelectorAll("#menuExamples .ex-card"), function (b) {
      var t = b.querySelector(".ex-card-title");
      var label = (t && t.textContent) || b.getAttribute("data-f") || "Example";
      return { label: "Open example: " + label, hint: "Example", kw: "example gallery template showcase " + label, ic: "grid", run: function () { studio(); b.click(); } };
    });
  }
  function recentCommands() {
    return Array.prototype.slice.call(document.querySelectorAll("#secHome .recent-card")).map(function (card) {
      var openBtn = card.querySelector(".recent-open");
      var titleEl = card.querySelector(".recent-meta b");
      if (!openBtn || !titleEl) return null;
      var label = titleEl.textContent || "Untitled";
      return { label: "Open dashboard: " + label, hint: "Recent", kw: "recent dashboard open " + label, ic: "clock", run: function () { openBtn.click(); } };
    }).filter(Boolean);
  }

  // Drives the exact same wiring a user would click by hand: a catalog DA card's
  // "+ Bar chart" quick-add chip (present on every entry, see daCard()) creates a
  // fresh panel, then — unless bars is what was asked for — the new panel's own
  // chart-type gallery card (renderPanelInspector tags each with data-t) switches
  // it to the requested type. Two real clicks, zero duplicated business logic.
  function addPanelOfType(t) {
    studio();
    var chip = document.querySelector('#libList .chip[data-t="bars"]');
    if (!chip) return;
    chip.click();
    if (t !== "bars") setTimeout(function () {
      var card = document.querySelector('.chart-opt[data-t="' + t + '"]');
      if (card) card.click();
    }, 30);
  }
  function chartTypeCommands() {
    var CHARTS = (window.Studio && Studio.CHARTS) || {};
    return Object.keys(CHARTS).map(function (t) {
      var label = CHARTS[t].label || t;
      return { label: "Add panel: " + label, hint: "Add panel", kw: "add new panel chart type " + t + " " + label, ic: "plus", run: function () { addPanelOfType(t); } };
    });
  }

  // ---- usage tracking (recent/frequent ranking) --------------------------
  // A tiny localStorage map of label -> {count,last}. Empty-query opens show
  // your most-recently-run commands first (the classic command-palette
  // pattern); a non-empty query still ranks by text-match relevance first,
  // with usage only breaking ties among equally-relevant rows.
  var USAGE_KEY = "studio-cmdk-usage";
  var USAGE_CAP = 40; // keep the map small; dynamic labels (examples/recents) churn over time
  function loadUsage() {
    try { return JSON.parse(localStorage.getItem(USAGE_KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  function saveUsage(u) { try { localStorage.setItem(USAGE_KEY, JSON.stringify(u)); } catch (e) {} }
  function recordUsage(label) {
    var u = loadUsage();
    var e = u[label] || { count: 0, last: 0 };
    e.count++; e.last = Date.now();
    u[label] = e;
    var keys = Object.keys(u);
    if (keys.length > USAGE_CAP) {
      keys.sort(function (a, b) { return u[a].last - u[b].last; });
      keys.slice(0, keys.length - USAGE_CAP).forEach(function (k) { delete u[k]; });
    }
    saveUsage(u);
  }

  // ---- N-AI/N-FUN: voice command mode -------------------------------------
  // The browser's built-in SpeechRecognition Web API — no API key, no backend,
  // no BYO-anything — drives this same palette hands-free: say "add a bar
  // chart" and it runs that command, same as typing + Enter would. Only
  // rendered when the API actually exists (Chrome/Edge/Safari; not Firefox),
  // so it's a progressive-enhancement affordance, never a hard dependency.
  var SR = (typeof window !== "undefined") && (window.SpeechRecognition || window.webkitSpeechRecognition);
  function voiceSupported() { return !!SR; }
  var recognizer = null, listening = false, micBtn = null;
  function setListening(on) {
    listening = on;
    if (micBtn) { micBtn.classList.toggle("listening", on); micBtn.setAttribute("aria-pressed", on ? "true" : "false"); }
    if (input) input.placeholder = on ? "Listening…" : "Type a command or section…";
  }
  function startVoice() {
    if (!SR || listening) return;
    try { recognizer = new SR(); } catch (e) { return; }
    recognizer.lang = "en-US"; recognizer.interimResults = true; recognizer.maxAlternatives = 1;
    recognizer.onresult = function (e) {
      var text = "";
      for (var i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      input.value = text; refresh();
    };
    recognizer.onerror = function () { setListening(false); };
    recognizer.onend = function () {
      setListening(false);
      // Recognition finalized — hands-free means it runs, not just fills the box.
      if (filtered.length && input.value.trim()) run();
    };
    setListening(true);
    try { recognizer.start(); } catch (e) { setListening(false); }
  }
  function stopVoice() { if (recognizer) { try { recognizer.stop(); } catch (e) {} } }

  // ---- state + DOM ------------------------------------------------------
  var overlay = null, input = null, listEl = null;
  var allCommands = COMMANDS;
  var filtered = [], sel = 0, built = false;

  function injectStyle() {
    if (document.getElementById("cmdk-style")) return;
    var css =
      '#cmdkOverlay{position:fixed;inset:0;z-index:4000;display:none;align-items:flex-start;justify-content:center;' +
      'background:rgba(20,18,26,.44);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)}' +
      '#cmdkOverlay.open{display:flex}' +
      '#cmdkBox{margin-top:11vh;width:min(620px,92vw);max-height:70vh;display:flex;flex-direction:column;' +
      'background:var(--pane,#fff);color:var(--ink,#1c2333);border:1px solid var(--line,rgba(120,120,140,.28));' +
      'border-radius:14px;box-shadow:0 24px 70px -12px rgba(10,8,20,.55),0 4px 14px rgba(10,8,20,.3);overflow:hidden;' +
      'animation:cmdkIn .13s ease-out}' +
      '@keyframes cmdkIn{from{opacity:0;transform:translateY(-8px) scale(.985)}to{opacity:1;transform:none}}' +
      '@media (prefers-reduced-motion:reduce){#cmdkBox{animation:none}}' +
      '#cmdkInputRow{display:flex;align-items:center;border-bottom:1px solid var(--line,rgba(120,120,140,.2))}' +
      '#cmdkInput{border:0;outline:0;background:transparent;color:inherit;font-size:17px;padding:16px 18px;' +
      'width:100%;box-sizing:border-box}' +
      '#cmdkInput::placeholder{color:var(--muted,#8a8f9e)}' +
      '#cmdkMic{flex:0 0 auto;margin-right:12px;width:30px;height:30px;border-radius:50%;border:1px solid var(--line,rgba(120,120,140,.3));' +
      'background:transparent;color:inherit;opacity:.7;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:opacity .12s,background .12s}' +
      '#cmdkMic:hover{opacity:1;background:var(--field,rgba(120,120,140,.12))}' +
      '#cmdkMic.listening{opacity:1;color:#fff;background:#e0453b;border-color:#e0453b;animation:cmdkMicPulse 1.1s ease-in-out infinite}' +
      '@keyframes cmdkMicPulse{0%,100%{box-shadow:0 0 0 0 rgba(224,69,59,.45)}50%{box-shadow:0 0 0 7px rgba(224,69,59,0)}}' +
      '@media (prefers-reduced-motion:reduce){#cmdkMic.listening{animation:none}}' +
      '#cmdkList{list-style:none;margin:0;padding:6px;overflow:auto}' +
      '.cmdk-row{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:9px;cursor:pointer;user-select:none}' +
      '.cmdk-row .cmdk-ic{width:17px;height:17px;flex:0 0 17px;opacity:.72;display:flex;align-items:center;justify-content:center}' +
      '.cmdk-row .cmdk-lbl{flex:1;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.cmdk-row .cmdk-hint{font-size:11px;opacity:.6;padding:2px 7px;border-radius:20px;border:1px solid var(--line,rgba(120,120,140,.3))}' +
      '.cmdk-row.sel{background:var(--pentaho,#005bb5);color:#fff}' +
      '.cmdk-row.sel .cmdk-hint{border-color:rgba(255,255,255,.5)}' +
      '.cmdk-row.sel .cmdk-ic{opacity:1}' +
      '.cmdk-empty{padding:22px;text-align:center;opacity:.6;font-size:13px}' +
      '#cmdkFoot{padding:8px 14px;border-top:1px solid var(--line,rgba(120,120,140,.2));font-size:11px;opacity:.62;' +
      'display:flex;gap:14px;flex-wrap:wrap}';
    var st = document.createElement("style");
    st.id = "cmdk-style"; st.textContent = css;
    document.head.appendChild(st);
  }

  function build() {
    if (built) return;
    injectStyle();
    overlay = document.createElement("div");
    overlay.id = "cmdkOverlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Command palette");
    overlay.innerHTML =
      '<div id="cmdkBox">' +
      '<div id="cmdkInputRow">' +
      (voiceSupported() ? '<button id="cmdkMic" type="button" aria-label="Speak a command" aria-pressed="false" title="Speak a command"></button>' : "") +
      '<input id="cmdkInput" type="text" autocomplete="off" spellcheck="false" ' +
      'placeholder="Type a command or section…" aria-label="Command palette search"/>' +
      '</div>' +
      '<ul id="cmdkList" role="listbox"></ul>' +
      '<div id="cmdkFoot"><span>↑↓ navigate</span><span>↵ run</span><span>esc close</span>' +
      (voiceSupported() ? '<span>🎙 speak</span>' : "") + '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    input = document.getElementById("cmdkInput");
    listEl = document.getElementById("cmdkList");
    micBtn = document.getElementById("cmdkMic");

    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) close(); });
    input.addEventListener("input", function () { refresh(); });
    input.addEventListener("keydown", onKey);
    if (micBtn) {
      if (window.Studio && Studio.icon) micBtn.appendChild(Studio.icon("mic", 15));
      micBtn.addEventListener("click", function () { listening ? stopVoice() : startVoice(); });
    }
    built = true;
  }

  function score(cmd, q) {
    if (!q) return 0;
    var hay = (cmd.label + " " + cmd.hint + " " + cmd.kw).toLowerCase();
    var i = hay.indexOf(q);
    if (i < 0) return -1;
    // prefer matches at the start of the visible label
    return cmd.label.toLowerCase().indexOf(q) === 0 ? 1000 : (500 - i);
  }

  function refresh() {
    var q = (input.value || "").trim().toLowerCase();
    var usage = loadUsage();
    if (!q) {
      // Empty query: lead with whatever you've actually used, most-recent first —
      // commands never run before keep their original registry order after that.
      var used = [], rest = [];
      allCommands.forEach(function (c) { (usage[c.label] ? used : rest).push(c); });
      used.sort(function (a, b) { return usage[b.label].last - usage[a.label].last; });
      filtered = used.concat(rest);
    } else {
      filtered = allCommands.map(function (c) {
        var s = score(c, q);
        if (s >= 0 && usage[c.label]) s += Math.min(usage[c.label].count, 10); // tiebreak, never outranks relevance buckets
        return { c: c, s: s };
      })
        .filter(function (x) { return x.s >= 0; })
        .sort(function (a, b) { return b.s - a.s; })
        .map(function (x) { return x.c; });
    }
    sel = 0;
    render();
  }

  function render() {
    if (!filtered.length) {
      listEl.innerHTML = '<li class="cmdk-empty">No matching commands</li>';
      return;
    }
    listEl.innerHTML = "";
    filtered.forEach(function (cmd, i) {
      var li = document.createElement("li");
      li.className = "cmdk-row" + (i === sel ? " sel" : "");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", i === sel ? "true" : "false");
      var ic = document.createElement("span");
      ic.className = "cmdk-ic";
      if (cmd.ic && window.Studio && Studio.icon) ic.appendChild(Studio.icon(cmd.ic, 16));
      var lbl = document.createElement("span");
      lbl.className = "cmdk-lbl"; lbl.textContent = cmd.label;
      var hint = document.createElement("span");
      hint.className = "cmdk-hint"; hint.textContent = cmd.hint;
      li.appendChild(ic); li.appendChild(lbl); li.appendChild(hint);
      li.addEventListener("mousemove", function () { if (sel !== i) { sel = i; render(); } });
      li.addEventListener("click", function () { sel = i; run(); });
      listEl.appendChild(li);
    });
    var cur = listEl.children[sel];
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
  }

  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); if (filtered.length) { sel = (sel + 1) % filtered.length; render(); } }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (filtered.length) { sel = (sel - 1 + filtered.length) % filtered.length; render(); } }
    else if (e.key === "Enter") { e.preventDefault(); run(); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  }

  function run() {
    var cmd = filtered[sel];
    close();
    if (cmd) {
      recordUsage(cmd.label);
      if (cmd.run) { try { cmd.run(); } catch (e) {} }
    }
  }

  function open() {
    build();
    stopVoice();
    allCommands = COMMANDS.concat(exampleCommands(), recentCommands(), chartTypeCommands());
    input.value = "";
    refresh();
    overlay.classList.add("open");
    input.focus();
  }
  function close() {
    stopVoice();
    if (overlay) overlay.classList.remove("open");
  }
  function isOpen() { return !!(overlay && overlay.classList.contains("open")); }
  function toggle() { isOpen() ? close() : open(); }

  // ⌘K / Ctrl-K anywhere toggles the palette (a modifier combo, so it never
  // interferes with typing in a field the way a bare shortcut key would).
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      toggle();
    }
  });

  // Discoverability: a "Command palette" entry at the top of the ⋯ More menu.
  // We close any open menu ourselves (studio.js's closeMenus() is private, but
  // menus are just a `.open` class on `.menu-wrap`), so no studio.js edit is needed.
  var moreMenu = document.getElementById("menuMore");
  if (moreMenu) {
    var mi = document.createElement("button");
    mi.id = "moreCmdk";
    mi.type = "button";
    mi.textContent = "Command palette  ⌘K";
    mi.addEventListener("click", function () {
      document.querySelectorAll(".menu-wrap.open").forEach(function (w) { w.classList.remove("open"); });
      open();
    });
    moreMenu.insertBefore(mi, moreMenu.firstChild);
  }

  // Visible discoverability affordance: a rail item (global chrome, visible from
  // every section) that opens the palette and carries a "⌘K" hint chip so the
  // shortcut isn't only discoverable via the ⋯ More menu or the shortcuts modal.
  // Its icon is painted automatically by shell.js's generic `.rail-ic[data-ic]` pass.
  var railCmdk = document.getElementById("railCmdk");
  if (railCmdk) railCmdk.addEventListener("click", open);

  window.StudioPalette = { open: open, close: close, toggle: toggle, isOpen: isOpen, commands: COMMANDS, usage: loadUsage, voiceSupported: voiceSupported, startVoice: startVoice };
})();
