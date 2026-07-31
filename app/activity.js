/* app/activity.js — ACTIVITY-1 (Kevin, 2026-07-30): concise backend logging.
   TWO separate Supabase tables (created via tools/supabase-deploy.sql § 6):
     polecat_activity — the action trail: sign-in, sign-out, one session-end
       per visit (with time-on-page ms), dashboard/view opens, exports.
     polecat_feedback — the topbar button's bug/feature/comment/question
       reports, with auto-captured context.
   Design rules: fire-and-forget (a log line must NEVER break the app or block
   the UI), tight (few events, small payloads, consecutive-duplicate throttle),
   backend-only (no Admin UI yet). Rows ride the user's own signed-in session —
   the tables are INSERT-only for authenticated users (admin-read), so a
   local-only or signed-out visit QUEUES locally and flushes once a Supabase
   connection is live. Queue is capped; oldest entries drop first. */
(function () {
  "use strict";
  var QUEUE_KEY = "studio-activity-queue";
  var QUEUE_CAP = 50;
  var _lastKey = "", _lastAt = 0; // consecutive-duplicate throttle (5s)
  var _endSent = false;

  function me() {
    try {
      var u = window.PolecatAuth && PolecatAuth.current && PolecatAuth.current();
      return { gotrue_id: (u && u.gotrueId) || null, username: (u && u.u) || null };
    } catch (e) { return { gotrue_id: null, username: null }; }
  }
  function connCfg() {
    try {
      var S = window.Studio;
      if (!S || !S.Sync || !S.Sync.syncState) return null;
      var st = S.Sync.syncState();
      if (st.sourceId !== "supabase") return null;
      var cfg = S.Sync.currentConfig();
      return (cfg && cfg.url && cfg.key) ? cfg : null;
    } catch (e) { return null; }
  }
  function loadQ() {
    try { var q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); return Array.isArray(q) ? q : []; } catch (e) { return []; }
  }
  function saveQ(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-QUEUE_CAP))); } catch (e) {}
  }
  function enqueue(table, row) {
    var q = loadQ();
    // stamp the real event time — a queued row's DB default would lie
    if (!row.at) row.at = new Date().toISOString();
    q.push({ t: table, r: row });
    saveQ(q);
  }
  function send(table, row, keepalive) {
    var cfg = connCfg();
    var src = window.Studio && Studio.supabaseSource;
    if (!cfg || !src || !src.insertRow) { enqueue(table, row); return; }
    src.insertRow(cfg, table, row, { keepalive: !!keepalive }).catch(function () { enqueue(table, row); });
  }
  function flush() {
    var cfg = connCfg();
    var src = window.Studio && Studio.supabaseSource;
    if (!cfg || !src || !src.insertRow) return Promise.resolve(0);
    var q = loadQ();
    if (!q.length) return Promise.resolve(0);
    saveQ([]); // optimistic — failures re-queue below
    var sent = 0;
    return q.reduce(function (chain, item) {
      return chain.then(function () {
        return src.insertRow(cfg, item.t, item.r).then(function () { sent++; }, function () { enqueue(item.t, item.r); });
      });
    }, Promise.resolve()).then(function () { return sent; });
  }
  // context for feedback reports — everything useful, nothing huge
  function ctx(extra) {
    var c = {
      section: null, dashboard: null,
      route: (location.hash || "") + (location.search || ""),
      version: null,
      viewport: window.innerWidth + "x" + window.innerHeight,
      ua: String(navigator.userAgent || "").slice(0, 160)
    };
    try {
      var active = document.querySelector("#railNav .rail-item.active");
      c.section = active ? active.getAttribute("data-sec") : null;
    } catch (e) {}
    try {
      var sp = window.__STUDIO_STATE && window.__STUDIO_STATE.spec;
      if (sp && sp.id) { c.dashboard = sp.id; c.dashboardTitle = String(sp.title || "").slice(0, 80); }
    } catch (e) {}
    try {
      var cl = window.STUDIO_CHANGELOG && window.STUDIO_CHANGELOG[0];
      if (cl) c.version = cl.v;
    } catch (e) {}
    if (extra) { for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) c[k] = extra[k]; }
    return c;
  }

  window.Studio = window.Studio || {};
  Studio.Activity = {
    log: function (action, detail) {
      try {
        var key = action + "|" + JSON.stringify(detail || null);
        var now = Date.now();
        if (key === _lastKey && now - _lastAt < 5000) return; // throttle dupes
        _lastKey = key; _lastAt = now;
        var m = me();
        send("polecat_activity", { gotrue_id: m.gotrue_id, username: m.username, action: String(action), detail: detail || null });
      } catch (e) { /* logging must never break the app */ }
    },
    feedback: function (kind, message, extra) {
      try {
        var m = me();
        send("polecat_feedback", {
          gotrue_id: m.gotrue_id, username: m.username,
          kind: String(kind || "comment"),
          message: String(message || "").slice(0, 4000),
          context: ctx(extra)
        });
      } catch (e) {}
    },
    flush: flush,
    // test hooks
    _queueKey: QUEUE_KEY,
    _context: ctx
  };

  // ONE session-end event per visit with time-on-page — keepalive so the
  // request survives the page going away. Signed-in visits only (an anonymous
  // gate bounce isn't worth a row).
  window.addEventListener("pagehide", function () {
    if (_endSent) return;
    _endSent = true;
    try {
      var m = me();
      if (!m.username) return;
      send("polecat_activity", {
        gotrue_id: m.gotrue_id, username: m.username, action: "session-end",
        detail: { ms: Math.round(performance.now()) }
      }, true);
    } catch (e) {}
  });

  // Flush the offline queue whenever the sync layer reports a live connection.
  // (Studio.Sync exists — sources/sync.js loads before this file.)
  try {
    if (window.Studio && Studio.Sync && Studio.Sync.onSync) {
      Studio.Sync.onSync(function (st) { if (st && st.status === "connected") flush(); });
    }
  } catch (e) {}
})();
