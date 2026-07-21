/* app/auth.js — Polecat Analytics sign-in (M3, phase 1: UX-level, local).
   The front door: a small username/password identity layer over a LOCAL user
   store, seeded on first run with an admin account and a public `demo` account.
   This is honest UX-gating (client-side SHA-256, a shared device store) — NOT
   cryptographic isolation between users; real per-user enforcement arrives with
   the Supabase-Auth/RLS slice (M7). Loaded BEFORE gate.js, which renders the
   sign-in screen and calls in here to verify.

   Storage (local-first, additive, never wiped by app migrations):
     analytics.users.v1   — [{ u, name, role, hash, demo }]  (hash = hex SHA-256)
     analytics.session.v1 — { u }  (the signed-in user; survives reload)
   The historical sessionStorage key `studio-gate-ok` is kept as the
   "authenticated this session" bypass so the whole test suite (and any deep
   link that pre-sets it) keeps working — login stamps it, sign-out clears it. */
(function () {
  "use strict";
  var USERS_KEY = "analytics.users.v1";
  var SESSION_KEY = "analytics.session.v1";
  var GATE_OK = "studio-gate-ok"; // historical session bypass — keep the contract

  function readJSON(store, key, fallback) {
    try { var v = JSON.parse(store.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function writeJSON(store, key, val) { try { store.setItem(key, JSON.stringify(val)); } catch (e) {} }

  async function sha256(s) {
    var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)));
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  function raw() { var v = readJSON(localStorage, USERS_KEY, null); return Array.isArray(v) ? v : []; }
  function saveRaw(list) { writeJSON(localStorage, USERS_KEY, list); }
  function find(u) { var key = String(u || "").trim().toLowerCase(); return raw().filter(function (x) { return String(x.u).toLowerCase() === key; })[0] || null; }
  function pub(x) { return x ? { u: x.u, name: x.name || x.u, role: x.role || "viewer", demo: !!x.demo } : null; }

  // First-run seed: an admin the local operator owns, plus a PUBLIC demo account
  // whose credentials the sign-in screen shows on-screen. Both passwords are the
  // username here (demo/demo, admin/admin) — deliberately obvious for a local
  // demo build; a real deployment resets admin on first connect (M3 phase 2).
  var SEED = [
    { u: "admin", name: "Administrator", role: "admin", demo: false, pass: "admin" },
    { u: "demo", name: "Demo user", role: "viewer", demo: true, pass: "demo" }
  ];
  async function seedIfEmpty() {
    if (raw().length) return raw();
    var list = [];
    for (var i = 0; i < SEED.length; i++) {
      var s = SEED[i];
      list.push({ u: s.u, name: s.name, role: s.role, demo: s.demo, hash: await sha256(s.pass) });
    }
    saveRaw(list);
    return list;
  }

  async function verify(u, pass) {
    var row = find(u);
    if (!row) return false;
    return (await sha256(pass)) === String(row.hash || "").toLowerCase();
  }

  function current() {
    if (sessionStorage.getItem(GATE_OK) === "1") {
      var sid = readJSON(localStorage, SESSION_KEY, null);
      var byId = sid && sid.u ? find(sid.u) : null;
      // Authed via the historical bypass with no stored identity (e.g. the test
      // suite pre-sets studio-gate-ok): treat as the admin/local operator so the
      // app has a sensible identity without forcing a login in that path.
      return pub(byId) || { u: "local", name: "Local", role: "admin", demo: false };
    }
    var s = readJSON(localStorage, SESSION_KEY, null);
    return s && s.u ? pub(find(s.u)) : null;
  }
  function authed() { return !!current(); }

  function login(u) {
    var row = find(u); if (!row) return null;
    writeJSON(localStorage, SESSION_KEY, { u: row.u });
    try { sessionStorage.setItem(GATE_OK, "1"); } catch (e) {}
    return pub(row);
  }
  function logout() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    try { sessionStorage.removeItem(GATE_OK); } catch (e) {}
  }

  // Adds/updates a user (admin flows in M4). pass is optional on update.
  async function upsert(u, opts) {
    opts = opts || {};
    var list = raw(), key = String(u).trim().toLowerCase();
    var row = list.filter(function (x) { return String(x.u).toLowerCase() === key; })[0];
    if (!row) { row = { u: key, name: opts.name || key, role: opts.role || "viewer", demo: !!opts.demo, hash: "" }; list.push(row); }
    if (opts.name != null) row.name = opts.name;
    if (opts.role != null) row.role = opts.role;
    if (opts.demo != null) row.demo = !!opts.demo;
    if (opts.pass != null) row.hash = await sha256(opts.pass);
    saveRaw(list);
    return pub(row);
  }

  window.PolecatAuth = {
    USERS_KEY: USERS_KEY, SESSION_KEY: SESSION_KEY,
    sha256: sha256, seedIfEmpty: seedIfEmpty, verify: verify,
    list: function () { return raw().map(pub); }, find: function (u) { return pub(find(u)); },
    current: current, authed: authed, login: login, logout: logout,
    isDemo: function () { var c = current(); return !!(c && c.demo); }, upsert: upsert,
    // Full rows INCLUDING the pw hash — for mirroring into the workspace `users`
    // table (that table is meant to BE the backend user store). Not for display.
    exportForStore: function () { return raw().map(function (x) { return { u: x.u, name: x.name || x.u, role: x.role || "viewer", demo: !!x.demo, hash: x.hash || "" }; }); }
  };
}());
