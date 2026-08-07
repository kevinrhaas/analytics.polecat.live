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
  // ACTIVITY-ANON (Kevin, 2026-07-31): "recording anonymous users as well,
  // like when someone logins in even without supabase." A local-only sign-in
  // (or a not-signed-in visitor) has no live Supabase connection, so their
  // rows used to queue on the device forever. Fall back to the PACKAGED
  // Polecat workspace (app/workspaces.js) — its anon key can INSERT (and only
  // insert) into the log tables once supabase-deploy.sql § 6b is applied; the
  // server stamps ip/ua from the request headers there. Until § 6b is applied
  // the insert 401s and the row just re-queues (capped) — nothing breaks.
  // NEVER from localhost: dev pages and the test suite must not phone home
  // (deployed visits are the traffic Kevin wants recorded).
  function packagedLogCfg(hostname) {
    var h = hostname != null ? hostname : location.hostname;
    if (/^(localhost|127\.|0\.0\.0\.0)/.test(String(h))) return null;
    try {
      var w = (window.STUDIO_WORKSPACES || [])[0];
      if (w && w.sourceId === "supabase" && w.cfg && w.cfg.url && w.cfg.key) return { url: w.cfg.url, key: w.cfg.key };
    } catch (e) {}
    return null;
  }
  function logCfg() { return connCfg() || packagedLogCfg(); }
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
    var cfg = logCfg();
    var src = window.Studio && Studio.supabaseSource;
    if (!cfg || !src || !src.insertRow) { enqueue(table, row); return; }
    src.insertRow(cfg, table, row, { keepalive: !!keepalive }).catch(function () { enqueue(table, row); });
  }
  function flush() {
    var cfg = logCfg();
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
      // AUD-08: the full history is lazy now, so read the generated head file first and
      // only fall back to CHANGELOG[0] when the feed has already pulled it in.
      var cl = window.STUDIO_LATEST || (window.STUDIO_CHANGELOG && window.STUDIO_CHANGELOG[0]);
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
    _context: ctx,
    _packagedLogCfg: packagedLogCfg // ACTIVITY-ANON: hostname injectable for tests
  };

  // ONE session-end event per visit with time-on-page — keepalive so the
  // request survives the page going away. ACTIVITY-ANON: anonymous visits get
  // a row too (username null; the server stamps ip/ua) — Kevin wants the
  // not-signed-in traffic visible, not just accounts.
  window.addEventListener("pagehide", function () {
    if (_endSent) return;
    _endSent = true;
    try {
      var m = me();
      send("polecat_activity", {
        gotrue_id: m.gotrue_id, username: m.username, action: "session-end",
        detail: { ms: Math.round(performance.now()) }
      }, true);
    } catch (e) {}
  });

  // ACTIVITY-ANON: one "gate-view" per browser session for a visitor who
  // arrives NOT signed in — the anonymous footprint (route/referrer/viewport
  // client-side; ip/ua stamped server-side). Sign-in later in the visit still
  // logs its own "sign-in" event as before.
  try {
    var authed = window.PolecatAuth && PolecatAuth.authed && PolecatAuth.authed();
    if (!authed && !sessionStorage.getItem("studio-activity-gate-seen")) {
      sessionStorage.setItem("studio-activity-gate-seen", "1");
      Studio.Activity.log("gate-view", {
        route: (location.pathname || "") + (location.hash || ""),
        ref: String(document.referrer || "").slice(0, 200),
        viewport: window.innerWidth + "x" + window.innerHeight
      });
    }
  } catch (e) {}

  // ACTIVITY-ANON: one deferred flush per load — with the packaged-workspace
  // fallback there can be a delivery path even when no backend ever connects
  // (rows queued on earlier local-only visits finally land). No-op wherever
  // logCfg() is null (localhost, catalog missing).
  setTimeout(function () { try { flush(); } catch (e) {} }, 4000);

  // Flush the offline queue whenever the sync layer reports a live connection.
  // (Studio.Sync exists — sources/sync.js loads before this file.)
  try {
    if (window.Studio && Studio.Sync && Studio.Sync.onSync) {
      Studio.Sync.onSync(function (st) { if (st && st.status === "connected") flush(); });
    }
  } catch (e) {}
})();
