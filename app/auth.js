/* app/auth.js — Polecat Analytics sign-in (M3, phase 1: UX-level, local).
   The front door: a small username/password identity layer over a LOCAL user
   store, seeded on first run with an admin account and a public `demo` account.
   This is honest UX-gating (client-side SHA-256, a shared device store) — NOT
   cryptographic isolation between users; real per-user enforcement arrives with
   the Supabase-Auth/RLS slice (M7). Loaded BEFORE gate.js, which renders the
   sign-in screen and calls in here to verify.

   Storage (local-first, additive, never wiped by app migrations):
     analytics.users.v1   — [{ u, name, role, hash, demo, provisioning, provisioned }]
       (hash = a SELF-DESCRIBING password digest — see "Password digests" below;
       provisioning = { theme, pack, backendId } admin-set
       first-login defaults, LF41 slice 1 — see studio.js initAuthBoot; backendId
       is LF42 slice 2's reference-only assignment to a Backends-card row, not
       applied automatically)
     analytics.session.v1 — { u }  (the signed-in user; survives reload)
   The historical sessionStorage key `studio-gate-ok` is kept as the
   "authenticated this session" bypass so the whole test suite (and any deep
   link that pre-sets it) keeps working — login stamps it, sign-out clears it.

   Password digests (AUD-03, 2026-08-07 — audit §1.3). The `hash` field is
   self-describing so one column carries both generations:
     • v1 (legacy) — a bare 64-char hex SHA-256 of the password. Unsalted and
       single-round, so identical passwords collide across accounts and the
       digest is trivially rainbow-tableable — and these digests SYNC to the
       workspace `users` table.
     • v2 (current) — `pbkdf2$<iters>$<saltHex>$<dkHex>`: PBKDF2-HMAC-SHA-256,
       a fresh 16-byte random salt per password, PW_ITERS rounds, 256-bit key.
   Every password WRITE (seed, admin add, password change) produces v2, and a
   v1 digest is UPGRADED in place the first time its owner signs in — so a
   store heals itself as people log in, without anyone re-typing a password.
   v1 digests stay verifiable forever; nothing is ever locked out by the
   migration. NOTE for anyone running two builds against one origin (the
   dev/stage previews share localStorage with prod): a row upgraded to v2 by a
   NEWER build can't be verified by a build that predates this change, so let
   prod catch up before signing in on a preview with an account you need there.
   This is still honest UX-gating, not cryptographic isolation — a KDF just
   stops the shared store (and the mirrored users table) from handing out
   everyone's password to anyone who reads it. */
(function () {
  "use strict";
  var USERS_KEY = "analytics.users.v1";
  var SESSION_KEY = "analytics.session.v1";
  var GATE_OK = "studio-gate-ok"; // historical session bypass — keep the contract

  function readJSON(store, key, fallback) {
    try { var v = JSON.parse(store.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function writeJSON(store, key, val) { try { store.setItem(key, JSON.stringify(val)); } catch (e) {} }

  function toHex(bytes) {
    return Array.prototype.map.call(new Uint8Array(bytes), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }
  function fromHex(hex) {
    var s = String(hex || ""), out = new Uint8Array(Math.floor(s.length / 2));
    for (var i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16) || 0;
    return out;
  }

  // Kept exported: the LEGACY (v1) digest, still needed to verify pre-AUD-03
  // rows (and used by callers that just want a plain hex SHA-256).
  async function sha256(s) {
    var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)));
    return toHex(buf);
  }

  // ---- password digests (v2: salted + iterated — see the header note) ------
  // 210k rounds is the OWASP PBKDF2-SHA-256 order of magnitude and costs ~0.1s
  // in a browser: unnoticeable on the one sign-in a session needs, but it turns
  // an offline guess-the-whole-table sweep into an expensive one.
  var PW_ITERS = 210000;
  var KDF_RE = /^pbkdf2\$(\d+)\$([0-9a-f]+)\$([0-9a-f]+)$/i;

  function isKdfHash(h) { return KDF_RE.test(String(h || "")); }

  async function pbkdf2Hex(pass, salt, iters) {
    var base = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(pass)), "PBKDF2", false, ["deriveBits"]);
    var bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt, iterations: iters, hash: "SHA-256" }, base, 256);
    return toHex(bits);
  }
  // The one place a password becomes a stored digest. Fresh random salt every
  // call, so two accounts sharing a password no longer share a digest.
  async function hashPassword(pass) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var dk = await pbkdf2Hex(pass, salt, PW_ITERS);
    return "pbkdf2$" + PW_ITERS + "$" + toHex(salt) + "$" + dk;
  }
  // Length-independent, early-exit-free comparison. Both sides are our own hex
  // here, but comparing digests with === is the habit worth not having.
  function sameDigest(a, b) {
    a = String(a || ""); b = String(b || "");
    if (a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }
  // → { ok, legacy } — `legacy` marks a v1 digest that verified, i.e. a row the
  // caller should upgrade in place.
  async function checkPassword(pass, stored) {
    stored = String(stored || "");
    if (!stored) return { ok: false, legacy: false };
    var m = KDF_RE.exec(stored);
    if (m) {
      var dk = await pbkdf2Hex(pass, fromHex(m[2]), parseInt(m[1], 10) || PW_ITERS);
      return { ok: sameDigest(dk, m[3].toLowerCase()), legacy: false };
    }
    return { ok: sameDigest(await sha256(pass), stored.toLowerCase()), legacy: true };
  }

  function raw() { var v = readJSON(localStorage, USERS_KEY, null); return Array.isArray(v) ? v : []; }
  function saveRaw(list) { writeJSON(localStorage, USERS_KEY, list); }
  function find(u) { var key = String(u || "").trim().toLowerCase(); return raw().filter(function (x) { return String(x.u).toLowerCase() === key; })[0] || null; }
  function pub(x) { return x ? { u: x.u, name: x.name || x.u, role: x.role || "viewer", demo: !!x.demo, gotrueId: x.gotrueId || null, provisioning: x.provisioning || null, provisioned: !!x.provisioned, forceTour: !!x.forceTour, disabled: !!x.disabled } : null; }

  // First-run seed: an admin the local operator owns, plus a PUBLIC demo account
  // whose credentials the sign-in screen shows on-screen. Both passwords are the
  // username here (demo/demo, admin/admin) — deliberately obvious for a local
  // demo build; a real deployment resets admin on first connect (M3 phase 2).
  var SEED = [
    { u: "admin", name: "Administrator", role: "admin", demo: false, pass: "admin" },
    { u: "demo", name: "Demonstration User", role: "viewer", demo: true, pass: "demo" }
  ];
  async function seedIfEmpty() {
    if (raw().length) { migrateDemoName(); await ensureLocalDemoAccounts(); return raw(); }
    var list = [];
    for (var i = 0; i < SEED.length; i++) {
      var s = SEED[i];
      list.push({ u: s.u, name: s.name, role: s.role, demo: s.demo, hash: await hashPassword(s.pass) });
    }
    saveRaw(list);
    return list;
  }
  // ADMIN-LOCAL (Kevin, 2026-07-31): admin/admin + demo/demo are the app's two
  // LOCAL demo accounts — if either has gone missing from this browser's store
  // (removed, or the store predates one), restore it. Only ADDS missing rows;
  // an existing row (renamed, password changed) is never touched.
  async function ensureLocalDemoAccounts() {
    var list = raw(), changed = false;
    for (var i = 0; i < SEED.length; i++) {
      var s = SEED[i];
      if (!find(s.u)) { list.push({ u: s.u, name: s.name, role: s.role, demo: s.demo, hash: await hashPassword(s.pass) }); changed = true; }
    }
    if (changed) saveRaw(list);
  }
  // #108: rename the seeded demo account "Demo user" -> "Demonstration User" for
  // existing local stores too. Additive + conservative: only touches the public demo
  // row and only when it still carries the old default name, so a user who renamed it
  // is never overwritten.
  function migrateDemoName() {
    var list = raw(), changed = false;
    list.forEach(function (x) {
      if (x.demo && String(x.u).toLowerCase() === "demo" && x.name === "Demo user") { x.name = "Demonstration User"; changed = true; }
    });
    if (changed) saveRaw(list);
  }

  // Verifies a password and, when the stored digest is still a legacy v1
  // SHA-256, transparently re-hashes it with the current KDF (upgrade-on-login:
  // the only moment the plaintext is in hand). The upgrade writes to the row in
  // the live list, so it also travels with the next users-table sync. A failed
  // upgrade never fails the sign-in — the digest just stays v1 for now.
  async function verify(u, pass) {
    var row = find(u);
    if (!row) return false;
    var res = await checkPassword(pass, row.hash);
    if (res.ok && res.legacy) {
      try {
        var next = await hashPassword(pass);
        var list = raw(), key = String(row.u).toLowerCase();
        list.forEach(function (x) { if (String(x.u).toLowerCase() === key && !isKdfHash(x.hash)) x.hash = next; });
        saveRaw(list);
      } catch (e) {}
    }
    return res.ok;
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
    // N2 slice 4 (M7): signing out must also drop the workspace session — the
    // cached GoTrue JWT and this browser session's refresh token — or the next
    // person at this browser would inherit the previous user's database access
    // just by signing in as a local account. Soft-referenced: auth.js loads long
    // before sync.js and runs fine (gate, tests) with no Studio at all.
    try { if (window.Studio && Studio.Sync && Studio.Sync.forgetAuthSession) Studio.Sync.forgetAuthSession(); } catch (e) {}
  }

  // Replaces the local user list wholesale with rows pulled from a connected
  // workspace backend's `users` table (see studio.js openBackendWizard) — the
  // browser's sign-in now authenticates against THAT workspace's accounts
  // instead of whatever was seeded locally. No-op on an empty/missing list so a
  // still-provisioning backend never locks the current browser out.
  function importFromStore(rows) {
    if (!Array.isArray(rows) || !rows.length) return;
    saveRaw(rows.map(function (r) {
      return { u: r.u, name: r.name || r.u, role: r.role || "viewer", demo: !!r.demo, hash: r.hash || "", gotrueId: r.gotrueId || null, provisioning: r.provisioning || null, provisioned: !!r.provisioned, forceTour: !!r.forceTour, disabled: !!r.disabled };
    }));
  }

  // Adds/updates a user (admin flows in M4). pass is optional on update.
  // gotrueId (M7 slice 2) is stamped after a successful Supabase Auth sign-in —
  // the account's real auth.uid() for that project, used once RLS enforcement
  // lands (M7 slice 3).
  // provisioning (LF41 slice 1) = { theme, pack } admin-set starting defaults,
  // applied ONCE at the account's first sign-in (see studio.js initAuthBoot),
  // then provisioned flips true so later logins never fight the user's own
  // subsequent changes. Passing `provisioning: null` clears it.
  async function upsert(u, opts) {
    opts = opts || {};
    var list = raw(), key = String(u).trim().toLowerCase();
    var row = list.filter(function (x) { return String(x.u).toLowerCase() === key; })[0];
    if (!row) { row = { u: key, name: opts.name || key, role: opts.role || "viewer", demo: !!opts.demo, hash: "", gotrueId: null, provisioning: null, provisioned: false }; list.push(row); }
    if (opts.name != null) row.name = opts.name;
    if (opts.role != null) row.role = opts.role;
    if (opts.demo != null) row.demo = !!opts.demo;
    if (opts.pass != null) row.hash = await hashPassword(opts.pass);
    if (opts.gotrueId != null) row.gotrueId = opts.gotrueId;
    if (opts.provisioning !== undefined) row.provisioning = opts.provisioning || null;
    if (opts.provisioned != null) row.provisioned = !!opts.provisioned;
    // TOUR-FORCE (Kevin live, 2026-07-31): a ONE-SHOT admin flag — "show the welcome
    // tour at their next sign-in." initAuthBoot consumes it (opens the welcome, then
    // immediately resets it), so take-or-dismiss both count as seen. Travels with the
    // users-table sync (importFromStore/pub/exportForStore all carry it), which is the
    // whole point: the device-local studio-welcome-seen flag can't cover a NEW account
    // signing in on a browser that has already seen the welcome.
    if (opts.forceTour != null) row.forceTour = !!opts.forceTour;
    // USER-DISABLE (Kevin live, 2026-07-31): "disable a user from login but i
    // could re-enable them, instead of deleting them outright." The account and
    // everything it owns stay intact — only sign-in is refused (gate.js checks
    // this on every path) and an already-signed-in session is ended at the next
    // boot (studio.js initAuthBoot). Travels with the users-table sync like
    // forceTour, so a disable on one device holds everywhere.
    if (opts.disabled != null) row.disabled = !!opts.disabled;
    saveRaw(list);
    return pub(row);
  }

  // Removes a user (admin flow, M4). Refuses to drop the workspace's last admin —
  // that would lock every remaining account out of user management for good.
  function remove(u) {
    var list = raw(), key = String(u || "").trim().toLowerCase();
    var row = list.filter(function (x) { return String(x.u).toLowerCase() === key; })[0];
    if (!row) return { ok: false, error: "not-found" };
    var admins = list.filter(function (x) { return x.role === "admin"; });
    if (row.role === "admin" && admins.length <= 1) return { ok: false, error: "last-admin" };
    saveRaw(list.filter(function (x) { return x !== row; }));
    return { ok: true };
  }

  // Role model (M4 → viewer-mode groundwork): three roles, an ascending
  // capability ladder — viewer (read-only: browse, interact, save a COPY) <
  // developer (build & edit dashboards in Studio) < admin (developer PLUS user
  // management / section access). admin is a strict SUPERSET of developer, so
  // canDevelop() is true for BOTH admin and developer. Roles are plain strings
  // in the store (no enum enforcement — upsert accepts any), but these are the
  // canonical set the UI offers and the capability helpers below key off.
  var ROLES = ["admin", "developer", "viewer"];
  var ROLE_LABELS = { admin: "Admin", developer: "Developer", viewer: "Viewer" };
  function roleOf(u) { u = (u === undefined) ? current() : u; return (u && u.role) || "viewer"; }
  function isAdmin(u) { return roleOf(u) === "admin"; }
  // The editor capability that gates Studio / edit-the-original (admin ⊇ developer).
  function canDevelop(u) { var r = roleOf(u); return r === "admin" || r === "developer"; }

  window.PolecatAuth = {
    USERS_KEY: USERS_KEY, SESSION_KEY: SESSION_KEY,
    ROLES: ROLES, ROLE_LABELS: ROLE_LABELS,
    isAdmin: isAdmin, canDevelop: canDevelop,
    sha256: sha256, seedIfEmpty: seedIfEmpty, verify: verify,
    // Password-digest surface (AUD-03): hashPassword is the ONLY way a password
    // should become a stored value; checkPassword/isKdfHash let callers (and the
    // suite) reason about a digest's generation without duplicating the format.
    hashPassword: hashPassword, checkPassword: checkPassword, isKdfHash: isKdfHash,
    list: function () { return raw().map(pub); }, find: function (u) { return pub(find(u)); },
    current: current, authed: authed, login: login, logout: logout,
    isDemo: function () { var c = current(); return !!(c && c.demo); }, upsert: upsert, remove: remove, importFromStore: importFromStore,
    // Full rows INCLUDING the pw hash — for mirroring into the workspace `users`
    // table (that table is meant to BE the backend user store). Not for display.
    exportForStore: function () { return raw().map(function (x) { return { u: x.u, name: x.name || x.u, role: x.role || "viewer", demo: !!x.demo, hash: x.hash || "", gotrueId: x.gotrueId || null, provisioning: x.provisioning || null, provisioned: !!x.provisioned, forceTour: !!x.forceTour, disabled: !!x.disabled }; }); }
  };
}());
