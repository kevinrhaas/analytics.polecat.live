/* gate.js — the sign-in screen (M3 phase 1). Renders a username/password
   login over the LOCAL user store (see app/auth.js — window.PolecatAuth) and
   reveals the app once you're in. Self-contained (injects its own styles, runs
   before the app). Bypassed for the session once signed in (or when the
   historical sessionStorage `studio-gate-ok` flag is pre-set — the whole test
   suite relies on that contract). This is UX-level gating, not real security —
   real per-user enforcement arrives with Supabase Auth/RLS (M7).
   M3.2: "Connect to your workspace" reuses studio.js's existing backend-connect
   wizard (window.__studioOpenBackendWizard — the same one Settings uses) so a
   first-run visitor can point at their own Turso/Supabase/Firebase workspace
   BEFORE signing in — probe classifies it as empty (offer to provision + seed
   an admin/demo pair) or an existing Studio workspace (adopt it), then the
   wizard mirrors whichever `users` table won into the local sign-in store so
   the form below authenticates against THAT workspace's accounts. */
(function () {
  "use strict";
  var Auth = window.PolecatAuth;
  // AUD-02: gate.js renders before model.js loads (script order), so this stays a
  // tiny standalone escaper rather than depending on Studio.escapeHtml.
  function escGate(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  // HOTLINK-1 (Kevin, 2026-07-31): a handout sign-in link —
  //   https://analytics.polecat.live/app/#ws=polecat&user=EMAIL&pass=PASSWORD
  // picks the workspace and prefills the credentials so the recipient only has
  // to click Sign in. The credentials ride the URL FRAGMENT, which browsers
  // never send to any server; we still scrub it from the address bar (and this
  // history entry) IMMEDIATELY — before the gate even renders — so it can't be
  // shoulder-read, bookmarked, or re-shared by accident. Only a hash that
  // STARTS with #ws= is treated as a hot link, so #share=/#dash= deep links
  // are untouched. Share hot links like passwords.
  var hotlink = (function () {
    var h = location.hash || "";
    if (h.indexOf("#ws=") !== 0) return null;
    var out = {};
    h.slice(1).split("&").forEach(function (kv) {
      var i = kv.indexOf("="); if (i < 1) return;
      var k = kv.slice(0, i), v = kv.slice(i + 1);
      if (k === "ws" || k === "user" || k === "pass") {
        try { out[k] = decodeURIComponent(v); } catch (e) { out[k] = v; }
      }
    });
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    return out.ws ? out : null;
  })();
  // LF38/#102: the sign-in password gets the same eye/eye-off reveal toggle as every
  // masked field inside the app (studio.js withRevealToggle). gate.js runs before
  // studio.js and is self-contained, so it can't reuse Studio.icon — inline the same
  // eye glyph (app/icons.js) here. eye-off is the same glyph with a slash.
  function eyeSvg(off) {
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
      'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>' +
      (off ? '<line x1="2" y1="2" x2="22" y2="22"/>' : '') + '</svg>';
  }
  var EYE = eyeSvg(false);
  function reveal() { var a = document.getElementById("app"); if (a) a.style.visibility = ""; var g = document.getElementById("studio-gate"); if (g) g.remove(); }
  // The app boots behind this overlay, so its identity-dependent boot steps (user
  // mirror + demo-content auto-install) ran while nobody was signed in. Re-run
  // them now that we know who logged in. Harmless if the hook isn't ready yet
  // (already-authed loads reveal without a login and never call this).
  function afterLogin() {
    try { if (window.__studioAuthBoot) window.__studioAuthBoot(); } catch (e) {}
    // HOME-LAND (Kevin, 2026-07-31): "when you sign in you should always land on
    // the home page" — a fresh SIGN-IN starts at Home (where the first-run
    // welcome/tour already lives), whatever section this browser last had open.
    // Already-authed reloads never pass through here, so their last-section
    // restore is untouched.
    try { if (window.__studioShellSetSection) window.__studioShellSetSection("home"); } catch (e) {}
    // ACTIVITY-1: record the sign-in (AFTER auth boot, so current() is fresh).
    try { if (window.Studio && Studio.Activity) Studio.Activity.log("sign-in"); } catch (e) {}
    // shell.js already ran (and gated the Admin rail item) before anyone signed in —
    // refresh it now that PolecatAuth.current() actually reflects who logged in.
    try { if (window.__studioShellApplyRoleGating) window.__studioShellApplyRoleGating(); } catch (e) {}
    // BRAND-BOOT (Kevin live, 2026-07-31): the admin-defined branding must be on
    // the rail the moment the app reveals — re-apply it here so the sign-in
    // moment can never show the default mark/name, whatever the boot ordering.
    try { if (window.Studio && Studio.Branding) Studio.Branding.apply(); } catch (e) {}
    reveal();
  }

  // N2 slice 4 (M7): the workspace password is no longer kept at rest, so a NEW
  // browser session can hold a signed-in local identity (that lives in
  // localStorage) with no way to sign its DATABASE requests in. Revealing
  // straight through would drop that person into an app whose workspace reads as
  // empty, so ask for the password once instead — the same "the workspace
  // decides who signs in" rule slice 3 established. Sync.needsSignIn() is false
  // for every other shape (local workspaces, Turso/Firebase, anon-key-only
  // Supabase, and a session that can still be resumed), so nothing else changes.
  function workspaceNeedsSignIn() {
    try {
      var Sync = window.Studio && window.Studio.Sync;
      return !!(Sync && Sync.needsSignIn && Sync.needsSignIn());
    } catch (e) { return false; }
  }

  async function start() {
    if (!Auth) { reveal(); return; }               // auth.js missing — fail open (dev)
    await Auth.seedIfEmpty();
    if (Auth.authed() && !workspaceNeedsSignIn()) { reveal(); return; }
    var a = document.getElementById("app"); if (a) a.style.visibility = "hidden";

    // Themed via the same --brand/--dk/--ink/etc custom properties as the app
    // (studio.css [data-theme]/[data-app-theme]) — BOOT-FLASH's pre-paint <head> script
    // (index.html/viewer.html) already stamped those attributes before gate.js even ran.
    var st = document.createElement("style");
    st.textContent =
      "#studio-gate{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;" +
      "background:linear-gradient(125deg,var(--bg,#0a1c3d),var(--brand,#163a6e) 55%,var(--dk,#1c4a86));font-family:'Hanken Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}" +
      "#studio-gate .g-card{background:var(--pane,#fff);border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.4);padding:34px 32px;width:min(390px,92vw);text-align:center}" +
      /* BRAND v2: the coin mark IS the logo tile — no gradient box, no white knockout */
      "#studio-gate .g-logo{width:48px;height:48px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center}" +
      "#studio-gate .g-logo img{width:48px;height:48px;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,.18)}" +
      "#studio-gate h1{font-size:19px;margin:0 0 4px;color:var(--ink,#16233b)}#studio-gate p{font-size:13px;color:var(--muted,#5d6b82);margin:0 0 18px}" +
      "#studio-gate label{display:block;text-align:left;font-size:11.5px;font-weight:700;color:var(--muted,#5d6b82);margin:0 0 4px}" +
      "#studio-gate input{width:100%;padding:11px 13px;border:1px solid var(--line,#c8d2df);border-radius:9px;font-size:14px;outline:none;margin-bottom:12px;background:var(--field,#fff);color:var(--ink,#16233b)}" +
      "#studio-gate input:focus{border-color:var(--brand,#005bb5)}" +
      // WORKSPACE-LOGIN: the Workspace picker sits above Username — same field look
      "#studio-gate select{width:100%;padding:11px 13px;border:1px solid var(--line,#c8d2df);border-radius:9px;font-size:14px;outline:none;margin-bottom:12px;background:var(--field,#fff);color:var(--ink,#16233b)}" +
      "#studio-gate select:focus{border-color:var(--brand,#005bb5)}" +
      "#studio-gate .g-ws-note{text-align:left;font-size:11px;color:var(--faint,#8a97ab);margin:-8px 0 10px;min-height:14px}" +
      // #102: the password field's reveal (eye) toggle — wrapper carries the input's
      // bottom margin so the button centers on the input itself, not the gap below it.
      "#studio-gate .g-pw{position:relative;margin-bottom:12px}" +
      "#studio-gate .g-pw input{margin-bottom:0;padding-right:42px}" +
      "#studio-gate .g-pw-btn{position:absolute;right:5px;top:50%;transform:translateY(-50%);width:32px;height:32px;min-width:0;padding:0;margin:0;background:transparent;border:0;border-radius:7px;display:flex;align-items:center;justify-content:center;color:var(--faint,#8a97ab);cursor:pointer}" +
      "#studio-gate .g-pw-btn:hover{background:color-mix(in srgb,var(--brand,#005bb5) 10%,transparent);color:var(--brand,#005bb5)}" +
      "#studio-gate .g-pw-btn:focus-visible{outline:2px solid var(--brand,#005bb5);outline-offset:1px}" +
      "#studio-gate button{width:100%;padding:11px;border:0;border-radius:9px;background:var(--dk,#7d3c98);color:#fff;font-size:14px;font-weight:700;cursor:pointer}" +
      "#studio-gate button:hover{background:color-mix(in srgb,var(--dk,#7d3c98) 85%,white)}" +
      "#studio-gate .g-demo{margin-top:10px;background:transparent;color:var(--brand,#005bb5);border:1px solid var(--line,#c8d2df)!important}" +
      "#studio-gate .g-demo:hover{background:color-mix(in srgb,var(--brand,#005bb5) 8%,transparent)}" +
      "#studio-gate .g-or{font-size:11px;color:var(--faint,#8a97ab);margin:12px 0 2px;text-transform:uppercase;letter-spacing:.06em}" +
      // #105: the demo hint is a small muted one-liner now (Kevin: kill the "demo build"
      // block, make it "really small" and tied to the Local workspace) — not a boxed callout.
      "#studio-gate .g-hint{margin-top:14px;font-size:11.5px;line-height:1.55;color:var(--faint,#8a97ab);text-align:center}" +
      "#studio-gate .g-hint b{color:var(--muted,#5d6b82)}#studio-gate .g-hint code{font-family:ui-monospace,Menlo,monospace;background:var(--field,#fff);border:1px solid var(--line,#c8d2df);padding:1px 5px;border-radius:5px;color:var(--muted,#5d6b82)}" +
      /* GATE-ERR polish (Kevin, 2026-07-31): height was FIXED at 16px, so any
         multi-line error overprinted the demo hint below — min-height lets the
         card grow and push the hint down instead. */
      "#studio-gate .g-err{color:var(--bad,#d63a5e);font-size:12.5px;min-height:16px;line-height:1.45;margin:8px 0 2px}" +
      "#studio-gate .g-note{color:var(--faint,#8a97ab);font-size:11px;margin-top:14px}" +
      /* DEMO-LOCAL slice polish (Kevin, 2026-07-31): the footer "Connect to your
         workspace…" link is DUPLICATIVE with the Workspace picker on top (its
         "Custom workspace…" opens the same wizard) — hidden by default now. It
         still APPEARS as the cued suggestion after a failed unknown-account
         sign-in (its original LF39 job); the picker's __custom option clicks it
         programmatically, which works regardless of visibility. */
      "#studio-gate .g-connect{display:none;margin-top:10px;background:transparent;border:0;color:var(--faint,#8a97ab);font-size:12px;text-decoration:underline;cursor:pointer;padding:4px}" +
      "#studio-gate .g-connect:hover{color:var(--brand,#005bb5)}" +
      "#studio-gate .g-connect.g-connect-cue{display:inline-block}" +
      // LF39: when a NEVER-connected browser fails sign-in (a teammate on a new device), the small
      // underlined "Connect to your workspace" link is easy to miss — promote it to an obvious,
      // pulsing primary-outline button so the one-step path to join the team workspace is unmissable.
      "#studio-gate .g-connect.g-connect-cue{color:var(--brand,#005bb5);text-decoration:none;font-weight:700;font-size:13px;border:1px solid var(--brand,#005bb5);border-radius:8px;padding:9px 14px;margin-top:12px;animation:gpulse 1.5s ease-out 2}" +
      "@keyframes gpulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--brand,#005bb5) 45%,transparent)}70%{box-shadow:0 0 0 9px transparent}100%{box-shadow:0 0 0 0 transparent}}" +
      "@media(prefers-reduced-motion:reduce){#studio-gate .g-connect.g-connect-cue{animation:none}}" +
      "#studio-gate .shake{animation:gshake .4s}@keyframes gshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}" +
      // the backend-connect wizard is a shared studio.js modal (.modal-ov, z-index 80) —
      // bump it above the gate's own overlay only while the gate is still up, so opening
      // it from the sign-in screen doesn't render (and trap clicks) behind the gate card.
      "#studio-gate ~ .modal-ov{z-index:100001}";
    document.head.appendChild(st);

    var ov = document.createElement("div"); ov.id = "studio-gate";
    ov.innerHTML = '<div class="g-card"><div class="g-logo"><img src="assets/brand/polecat-logo-coin-cream.svg" width="48" height="48" alt=""/></div><h1>Sign in to Analytics</h1>' +
      '<p id="g-sub">Your analytics workspace on analytics.polecat.live.</p>' +
      '<form id="g-form" autocomplete="off">' +
      '<label for="g-workspace">Workspace</label>' +
      '<select id="g-workspace" aria-describedby="g-ws-note"></select>' +
      '<div class="g-ws-note" id="g-ws-note"></div>' +
      '<input type="file" id="g-ws-file" accept=".json,application/json" style="display:none"/>' +
      '<label for="g-user">Username</label>' +
      '<input type="text" id="g-user" placeholder="username" autocomplete="username" autocapitalize="off" spellcheck="false"/>' +
      '<label for="g-pass">Password</label>' +
      '<div class="g-pw">' +
      '<input type="password" id="g-pass" placeholder="password" autocomplete="current-password"/>' +
      '<button type="button" class="g-pw-btn" id="g-pw-toggle" aria-label="Show password" aria-pressed="false">' + EYE + '</button>' +
      '</div>' +
      '<button type="submit">Sign in</button></form>' +
      '<div class="g-or">or</div>' +
      '<button type="button" class="g-demo" id="g-demo">Explore the demo</button>' +
      '<div class="g-err" id="g-err"></div>' +
      '<div class="g-hint" id="g-hint">Local demo accounts <code>admin</code> / <code>admin</code> and <code>demo</code> / <code>demo</code> — local workspace only.</div>' +
      '<button type="button" class="g-connect" id="g-connect">Connect to your workspace…</button>' +
      '<div class="g-note">analytics.polecat.live</div></div>';
    document.body.appendChild(ov);

    // BRAND-BOOT (Kevin live, 2026-07-31): the sign-in card is part of "when I
    // logged in" — when this workspace carries an admin-defined custom logo,
    // show IT on the gate instead of the default coin. Read from storage
    // directly (the branding cache, else the workspace db's synced settings):
    // gate.js runs before branding.js/workspace.js are guaranteed evaluated.
    try {
      var gb = JSON.parse(localStorage.getItem("studio-branding") || "null");
      if (!gb || !gb.mode) {
        var gdb = JSON.parse(localStorage.getItem("analytics.workspace.v1") || "null");
        gb = (gdb && gdb.settings && gdb.settings.branding) || gb;
      }
      if (gb && gb.mode === "custom" && gb.dataUrl) {
        var gimg = ov.querySelector(".g-logo img");
        if (gimg) { gimg.src = gb.dataUrl; gimg.style.borderRadius = "10px"; gimg.style.boxShadow = "none"; }
      }
    } catch (e) { /* malformed storage — keep the default coin */ }

    var userInp = document.getElementById("g-user"); if (userInp) userInp.focus();
    // N2 slice 4: when this screen is here only because the workspace session
    // expired with the browser, the person is already known — prefill their email
    // and put the cursor on the password so re-signing in is one field, not two.
    if (userInp && !userInp.value && workspaceNeedsSignIn()) {
      try {
        var boundCfg = (window.Studio && Studio.Sync && Studio.Sync.currentConfig && Studio.Sync.currentConfig()) ||
          (JSON.parse(localStorage.getItem("analytics.datasource.v1") || "null") || {}).cfg;
        if (boundCfg && boundCfg.authEmail) {
          userInp.value = boundCfg.authEmail; // setErr writes textContent — no escaping needed
          if (Auth.authed()) setErr("Your workspace session ended when the browser closed — enter your password to continue.");
          var pw0 = document.getElementById("g-pass"); if (pw0) pw0.focus();
        }
      } catch (e) { /* malformed record — just show an empty form */ }
    }
    // LF39: editing the username clears both the error and the Connect cue (fresh attempt).
    if (userInp) userInp.addEventListener("input", function () { setErr(""); clearCue(); });

    // #102: password reveal (eye) toggle — mirrors studio.js withRevealToggle (flip the
    // input's type, keep aria-pressed/aria-label + the icon in sync).
    var pwInp = document.getElementById("g-pass");
    var pwToggle = document.getElementById("g-pw-toggle");
    if (pwInp && pwToggle) pwToggle.addEventListener("click", function () {
      var show = pwInp.type === "password";
      pwInp.type = show ? "text" : "password";
      pwToggle.setAttribute("aria-pressed", String(show));
      pwToggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
      pwToggle.innerHTML = eyeSvg(show);
      pwInp.focus();
    });

    function setErr(msg) { document.getElementById("g-err").textContent = msg || ""; }
    // LF39: draw the eye to the "Connect to your workspace" path when this browser has no way to
    // verify the account locally (a teammate signing in on a fresh device). Cleared once they act.
    function cueConnect() {
      var b = document.getElementById("g-connect"); if (!b) return;
      b.classList.add("g-connect-cue");
      try { b.scrollIntoView({ block: "nearest" }); } catch (e) {}
    }
    function clearCue() { var b = document.getElementById("g-connect"); if (b) b.classList.remove("g-connect-cue"); }
    function fail(msg) {
      setErr(msg || "Incorrect username or password.");
      var c = ov.querySelector(".g-card"); c.classList.add("shake"); setTimeout(function () { c.classList.remove("shake"); }, 400);
    }
    // USER-DISABLE: an admin-disabled account is refused at EVERY sign-in path —
    // the account (and everything it owns) still exists; only sign-in is blocked
    // until an admin re-enables it. The password is still verified first, so
    // this message never leaks whether a guessed password was right.
    function failDisabled() { fail("This account has been disabled. Ask your workspace admin to re-enable it."); }
    function deniedDisabled(uName) {
      var row = Auth.find(uName);
      if (row && row.disabled) { failDisabled(); return true; }
      return false;
    }
    // LF39: the gate only knows accounts already mirrored into THIS browser's local
    // store (analytics.users.v1), so a teammate provisioned on a connected workspace
    // backend from another browser gets a misleading "Incorrect username or password"
    // here — the account isn't wrong, this browser just hasn't seen it yet. initSync()
    // (studio.js boot) refreshes Studio.Workspace's "users" table from the backend on
    // every load, but nothing re-imports that into PolecatAuth's own store outside the
    // connect wizard — so pull again ourselves and adopt it before giving up.
    function handleUnknownUser(u, p) {
      var Sync = window.Studio && window.Studio.Sync;
      if (!Sync || !Sync.syncState().isRemote) {
        fail("No local account “" + u + "”. Joining an existing team workspace? Use “Connect to your workspace” below.");
        cueConnect();
        return;
      }
      setErr("Checking your connected workspace…");
      Sync.pullNow().then(function () {
        try { Auth.importFromStore(window.Studio.Workspace.all("users")); } catch (e) {}
        return Auth.verify(u, p);
      }).then(function (okAuth) {
        if (okAuth) { if (deniedDisabled(u)) return; Auth.login(u); afterLogin(); return; }
        fail("“" + u + "” isn’t in your connected workspace. Check the username, or ask an admin to add you.");
        document.getElementById("g-pass").select();
      });
    }
    // LF39 item 2 / M7: one-step GoTrue direct-auth. When the local hash didn't match (or there's
    // no local row) AND the connected workspace backend is Supabase AND the typed username is an
    // email, verify the password straight against the backend's GoTrue instead of a mirrored local
    // hash — the real cross-device sign-in a teammate expects (esp. on a fresh device). On success
    // we refresh the mirrored `users` table and adopt the account carrying that auth uid, so we sign
    // in with the real role/name. Anything that doesn't apply (non-Supabase backend, non-email
    // username, network/creds failure) calls next(false) to fall through to today's behavior.
    function findUserByGotrue(uid) {
      try {
        var rows = (window.Studio && window.Studio.Workspace && window.Studio.Workspace.all("users")) || [];
        for (var i = 0; i < rows.length; i++) { if (rows[i].gotrueId === uid) return rows[i]; }
      } catch (e) {}
      return null;
    }
    // GATE-FIX-2 (Kevin live, 2026-07-31): a users row can exist WITHOUT its
    // gotrueId stamp (hand-restored rows, pre-link-era rows). GoTrue just
    // verified the password for this exact email, so a row whose username IS
    // that email is unambiguously this person — adopt it; finish() then stamps
    // the gotrueId, healing the link for every later sign-in.
    function findUserByEmail(email) {
      try {
        var key = String(email || "").trim().toLowerCase();
        if (!key) return null;
        var rows = (window.Studio && window.Studio.Workspace && window.Studio.Workspace.all("users")) || [];
        for (var i = 0; i < rows.length; i++) {
          if (String(rows[i].u || "").trim().toLowerCase() === key) return rows[i];
        }
      } catch (e) {}
      return null;
    }
    function tryGotrueDirectAuth(u, p, next) {
      var Sync = window.Studio && window.Studio.Sync;
      var src = window.Studio && window.Studio.supabaseSource;
      if (!Sync || !src || typeof src.authenticate !== "function" || !Sync.syncState ||
          Sync.syncState().sourceId !== "supabase" || u.indexOf("@") < 0) { next(false); return; }
      var cfg = Sync.currentConfig && Sync.currentConfig();
      if (!cfg || !cfg.url || !cfg.key) { next(false); return; }
      setErr("Signing you in…");
      src.authenticate(cfg, { email: u, password: p }).then(function (r) {
        // GATE-ERR (Kevin live, 2026-07-31): a GoTrue REJECTION is a different
        // failure than "no matching account" — reporting both as "isn't in your
        // connected workspace" sent a whole debugging session down the wrong
        // road. Surface the wrong-password case as exactly that.
        // N2 slice 3: "the backend refused these credentials" (badpass — the
        // database's authoritative no) and "we never reached the backend"
        // (unreachable — offline/CORS) are different answers and the caller
        // treats them differently. Only the first one may lock a sign-in out.
        if (!r || !r.ok || !r.userId) { next(false, r && r.unreachable ? "unreachable" : "badpass"); return; }
        // WORKSPACE-LOGIN fix (Kevin live, 2026-07-30): a picker-bound
        // connection has only url+key, so the adopting pull below used to run
        // as ANON — under authenticated-only RLS that reads users as EMPTY and
        // a fully-provisioned admin got "isn't in your connected workspace".
        // Stamp the just-verified credentials on the connection FIRST so the
        // pull (and every later sync) runs as this user.
        if (Sync.setAuthCredentials) Sync.setAuthCredentials(u, p);
        var finish = function (acct) {
          // USER-DISABLE: the adopted row may carry the flag before the local
          // store does (fresh device) — check the row itself, then the store.
          if (acct.disabled) { failDisabled(); return; }
          if (deniedDisabled(acct.u)) return;
          Auth.upsert(acct.u, { gotrueId: r.userId }).then(function () { Auth.login(acct.u); afterLogin(); });
        };
        // GoTrue verified the password — now adopt the local identity for this uid.
        var adopt = function () {
          try { Auth.importFromStore(window.Studio.Workspace.all("users")); } catch (e) {}
          var acct = findUserByGotrue(r.userId) || findUserByEmail(u);
          if (acct) { finish(acct); return; }
          // GATE-FIX (Kevin live, 2026-07-31): the whole-workspace pull can be
          // GUARDED (dirty local edits from a failed-push episode) or the local
          // mirror stale/wiped — but the select policy guarantees a signed-in
          // user reads their OWN users row. A verified password must never
          // dead-end: fetch the visible users rows directly and adopt from those.
          var cfg2 = (Sync.currentConfig && Sync.currentConfig()) || cfg;
          if (!src.fetchUsers) { next(false, "noaccount"); return; }
          src.fetchUsers(cfg2).then(function (rows) {
            (rows || []).forEach(function (row) {
              try { window.Studio.Workspace.put("users", row, { silent: true }); } catch (e) {}
            });
            try { Auth.importFromStore(window.Studio.Workspace.all("users")); } catch (e) {}
            var acct2 = findUserByGotrue(r.userId) || findUserByEmail(u);
            if (acct2) finish(acct2); else next(false, "noaccount");
          }, function () { next(false, "noaccount"); });
        };
        if (Sync.pullNow) Sync.pullNow().then(adopt, adopt); else adopt();
      }, function () { next(false, "unreachable"); });
    }
    // ---- N2 slice 3 (M7): THE CLIENT FLIP — the workspace decides ------------
    // Until now the LOCAL store was the source of truth at sign-in: Auth.verify()
    // ran first, and a matching local hash signed you in without the database ever
    // being asked. GoTrue was only the fallback for when the local hash missed.
    // That made the mirrored `users` hash the real credential — anyone who can
    // edit this browser's localStorage could mint a matching row and be signed in
    // as anybody, and a password CHANGED in the workspace kept working here until
    // the mirror caught up. RLS still protected the DATA (every request carries
    // the user's own token), but the front door was decided locally.
    //
    // So: when a Supabase workspace is bound AND the typed username is an email —
    // i.e. exactly the accounts the workspace's own GoTrue owns — ask the DATABASE
    // first and honour its answer. A rejection is final; the local hash gets no
    // second vote. Everything else is untouched: the local demo accounts
    // (admin/demo — never emails), non-email usernames, custom local-auth
    // workspaces (Turso/M3.2) and a plain local workspace all still take the
    // local-first path exactly as before. If the database can't be REACHED
    // (offline, CORS) we fall back to that path too, so going offline never locks
    // anyone out of their own device.
    //
    // The escape hatch stays one click away: the Workspace picker's "Local only
    // (this browser)" disconnects, and a local workspace is local-first again.
    function backendOwnsSignIn(u) {
      var st = (window.Studio && Studio.Sync && Studio.Sync.syncState) ? Studio.Sync.syncState() : null;
      return !!(st && st.sourceId === "supabase" && u.indexOf("@") >= 0);
    }
    function failBadPass(u, flipped) {
      // GATE-ERR (Kevin live, 2026-07-31): a GoTrue REJECTION is a different
      // failure than "no matching account" — reporting both as "isn't in your
      // connected workspace" sent a whole debugging session down the wrong
      // road. Surface the wrong-password case as exactly that. Watch for
      // autofill: password managers have saved API tokens under this site.
      fail("That password doesn’t match " + u + "’s account in this workspace." +
        (flipped ? " Sign-in here is decided by the workspace itself, so a password saved on this device can’t open it." : "") +
        " Re-type it by hand (the eye button shows it) — autofill sometimes inserts a saved token instead.");
      document.getElementById("g-pass").select();
    }
    function submitSignIn(u, p) {
      if (!backendOwnsSignIn(u)) { localFirstSignIn(u, p, false); return; }
      tryGotrueDirectAuth(u, p, function (done, why) {
        if (done) return;
        if (why === "badpass") { failBadPass(u, true); return; }
        // "noaccount" (GoTrue said yes, no matching row yet), "unreachable", or
        // the branch simply not applying: run today's path, but never re-ask
        // GoTrue — it has already given its answer.
        localFirstSignIn(u, p, true);
      });
    }
    function localFirstSignIn(u, p, skipGotrue) {
      Auth.verify(u, p).then(function (okAuth) {
        if (okAuth) {
          // DEMO-LOCAL / ADMIN-LOCAL (Kevin): admin/admin and demo/demo are the
          // two LOCAL demo accounts. demo is strictly local ALWAYS. admin is
          // strictly local on a GoTrue-auth workspace (Supabase — its real
          // accounts are emails, so bare "admin" can only mean the local demo
          // account); on a PROVISIONED custom workspace (Turso/local-auth
          // model, M3.2) the seeded admin genuinely is that workspace's admin —
          // forcing local there would leave custom workspaces with no admin.
          if (deniedDisabled(u)) return;
          var la = Auth.find(u);
          var st = (window.Studio && Studio.Sync && Studio.Sync.syncState) ? Studio.Sync.syncState() : null;
          if (u === "demo" || (la && la.demo) || (u === "admin" && st && st.sourceId === "supabase")) forceLocalWorkspace();
          Auth.login(u); afterLogin(); return;
        }
        var known = !!Auth.find(u);
        // DEMO-LOCAL-2 (Kevin live, 2026-08-07): the hint PROMISES admin/admin +
        // demo/demo always open the local workspace — but a connected workspace's
        // users-table import replaces the seeded rows wholesale (Auth.importFromStore),
        // so a browser that once connected can carry an "admin" row with that
        // workspace's foreign hash, and the promise broke even with the picker on
        // Local. When the typed pair IS a seed pair and the target is the LOCAL
        // workspace (demo always; admin when the picker says Local or under the
        // supabase strictly-local rule above), sign in as the local demo account
        // WITHOUT touching the stored row — no hash reset, so nothing can ever
        // mirror back into a real workspace's users table. A custom (local-auth)
        // workspace's admin stays real: no bypass when one is the picked target.
        var seedPair = (u === "demo" && p === "demo") || (u === "admin" && p === "admin");
        if (seedPair) {
          var wsPick = document.getElementById("g-workspace");
          var pickLocal = !wsPick || wsPick.value === "local";
          var st2 = (window.Studio && Studio.Sync && Studio.Sync.syncState) ? Studio.Sync.syncState() : null;
          if (u === "demo" || pickLocal || (st2 && st2.sourceId === "supabase")) {
            if (deniedDisabled(u)) return;
            var goLocal = function () { forceLocalWorkspace(); Auth.login(u); afterLogin(); };
            if (known) { goLocal(); return; }
            // The import dropped the row entirely — restore the seed account
            // (adding a missing row is the ADMIN-LOCAL self-heal, always allowed).
            Auth.upsert(u, u === "admin"
              ? { name: "Administrator", role: "admin", demo: false, pass: "admin" }
              : { name: "Demonstration User", role: "viewer", demo: true, pass: "demo" }).then(goLocal);
            return;
          }
        }
        var afterGotrue = function (why) {
          // GATE-ERR: the workspace's own auth REJECTED the password — say so
          // plainly instead of the misleading "isn't in your workspace" (which
          // stays for genuinely unknown accounts).
          if (why === "badpass") { failBadPass(u, false); return; }
          if (known) { fail(); document.getElementById("g-pass").select(); return; }
          handleUnknownUser(u, p);
        };
        // skipGotrue: submitSignIn already asked the backend and it did not sign
        // this person in — asking again would just repeat the same answer.
        if (skipGotrue) { afterGotrue(null); return; }
        tryGotrueDirectAuth(u, p, function (done, why) {
          if (done) return;
          afterGotrue(why);
        });
      });
    }
    document.getElementById("g-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var u = (document.getElementById("g-user").value || "").trim();
      var p = document.getElementById("g-pass").value || "";
      if (!u) { fail("Enter a username."); return; }
      submitSignIn(u, p);
    });
    // ---- WORKSPACE-LOGIN (Kevin live, 2026-07-30): the Workspace picker ----
    // "Ship with the default polecat supabase workspace... he should not have to
    // configure access to that workspace." Entries come from the PACKAGED catalog
    // (app/workspaces.js → window.STUDIO_WORKSPACES) plus locally imported/custom
    // ones (an imported entry with the same id OVERRIDES the shipped one — the
    // escape hatch if a database moves). Picking one BINDS the connection
    // (Sync.bindConnection — no pull yet), after which the existing direct-auth
    // sign-in verifies the typed email/password straight against that workspace
    // and the post-sign-in pull adopts remote data with the user's session.
    var CUSTOM_WS_KEY = "studio-workspaces-custom", LAST_WS_KEY = "studio-workspace-last";
    function customWorkspaces() {
      try { return JSON.parse(localStorage.getItem(CUSTOM_WS_KEY) || "[]"); } catch (e) { return []; }
    }
    function saveCustomWorkspace(entry) {
      var list = customWorkspaces().filter(function (w) { return w.id !== entry.id; });
      list.push(entry);
      try { localStorage.setItem(CUSTOM_WS_KEY, JSON.stringify(list)); } catch (e) {}
    }
    function workspaceList() {
      var out = [{ id: "local", label: "Local only (this browser)" }];
      var seen = { local: true };
      // customs FIRST so a re-imported entry shadows the shipped one with its id
      customWorkspaces().concat(window.STUDIO_WORKSPACES || []).forEach(function (w) {
        if (!w || !w.id || seen[w.id]) return;
        if (w.id !== "local" && !(w.sourceId && w.cfg && w.cfg.url)) return; // malformed
        seen[w.id] = true; out.push(w);
      });
      return out;
    }
    function wsNote(msg) { var n = document.getElementById("g-ws-note"); if (n) n.textContent = msg || ""; }
    function currentWorkspaceId() {
      try {
        var conn = JSON.parse(localStorage.getItem("analytics.datasource.v1") || "null");
        if (!conn || !conn.cfg || !conn.cfg.url) return "local";
        var hit = workspaceList().filter(function (w) { return w.cfg && w.cfg.url === conn.cfg.url; })[0];
        return hit ? hit.id : "__connected";
      } catch (e) { return "local"; }
    }
    function renderWorkspaceSelect() {
      var sel = document.getElementById("g-workspace"); if (!sel) return;
      var cur = currentWorkspaceId();
      var html = workspaceList().map(function (w) {
        return '<option value="' + escGate(w.id) + '"' + (w.id === cur ? " selected" : "") + '>' + escGate(w.label) + "</option>";
      }).join("");
      if (cur === "__connected") html += '<option value="__connected" selected>Connected workspace (this browser)</option>';
      html += '<option value="__custom">Custom workspace…</option>' +
              '<option value="__import">Import access file…</option>';
      sel.innerHTML = html;
      sel.dataset.prev = sel.value;
    }
    function connectWorkspace(entry) {
      var Sync = window.Studio && window.Studio.Sync;
      if (!Sync) { fail("Still loading — try again in a moment."); return; }
      setErr("");
      // BIND, don't pull: under authenticated-only RLS an unauthenticated pull
      // reads the workspace as empty — adopting that here would wipe this
      // device's local copy. The pull runs right after sign-in (direct-auth's
      // pullNow) with the user's own session, and DURABLE-1's heals ride it.
      Sync.bindConnection(entry.sourceId, entry.cfg).then(function () {
        try { localStorage.setItem(LAST_WS_KEY, entry.id); } catch (e) {}
        wsNote("Using " + entry.label + ". Sign in with your " + entry.label + " account (email + password).");
      }, function (e2) {
        wsNote("");
        fail("Couldn’t use " + entry.label + " — " + ((e2 && e2.message) || "bad workspace entry"));
        renderWorkspaceSelect();
      });
    }
    var wsSel = document.getElementById("g-workspace");
    var wsFile = document.getElementById("g-ws-file");
    if (wsSel) {
      renderWorkspaceSelect();
      wsSel.addEventListener("change", function () {
        var v = wsSel.value;
        if (v === "__custom") {
          wsSel.value = wsSel.dataset.prev || "local";
          var cbtn = document.getElementById("g-connect");
          if (cbtn) cbtn.click(); // the existing backend wizard IS the custom path
          return;
        }
        if (v === "__import") {
          wsSel.value = wsSel.dataset.prev || "local";
          if (wsFile) wsFile.click();
          return;
        }
        wsSel.dataset.prev = v;
        if (v === "local" || v === "__connected") {
          if (v === "local" && window.Studio && window.Studio.Sync) window.Studio.Sync.disconnect();
          try { localStorage.setItem(LAST_WS_KEY, v); } catch (e) {}
          wsNote(v === "local" ? "" : "Using this browser’s already-connected workspace.");
          return;
        }
        var entry = workspaceList().filter(function (w) { return w.id === v; })[0];
        if (entry) connectWorkspace(entry);
      });
    }
    if (wsFile) wsFile.addEventListener("change", function () {
      var f = wsFile.files && wsFile.files[0]; wsFile.value = "";
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var entry = null;
        try { entry = JSON.parse(String(rd.result || "")); } catch (e) {}
        if (!entry || !entry.sourceId || !entry.cfg || !entry.cfg.url || !entry.cfg.key) {
          fail("That doesn’t look like a workspace access file (needs label, sourceId and cfg with url + key).");
          return;
        }
        entry.id = entry.id || ("ws-" + String(entry.cfg.url).replace(/[^a-z0-9]+/gi, "-").slice(0, 40));
        entry.label = entry.label || "Imported workspace";
        saveCustomWorkspace(entry);
        renderWorkspaceSelect();
        var sel2 = document.getElementById("g-workspace");
        if (sel2) { sel2.value = entry.id; sel2.dataset.prev = entry.id; }
        connectWorkspace(entry);
      };
      rd.readAsText(f);
    });
    // test hooks — drive the picker without a real <input type=file> dialog
    window.__studioGateWorkspaces = { list: workspaceList, addCustom: saveCustomWorkspace,
      render: renderWorkspaceSelect, connect: connectWorkspace };

    // HOTLINK-1: apply a captured hot link now that the picker + fields exist.
    // The fragment was already scrubbed at load (top of this file).
    if (hotlink) {
      var hl = hotlink; hotlink = null;
      var hlEntry = workspaceList().filter(function (w) { return w.id === hl.ws; })[0];
      if (hlEntry && hlEntry.id !== "local") {
        if (wsSel) { wsSel.value = hlEntry.id; wsSel.dataset.prev = hlEntry.id; }
        connectWorkspace(hlEntry);
      } else if (hl.ws === "local") {
        if (wsSel) { wsSel.value = "local"; wsSel.dataset.prev = "local"; }
      } else {
        wsNote("This link points at a workspace this browser doesn’t have (“" + hl.ws + "”). Pick one, or import an access file.");
      }
      var hlUser = document.getElementById("g-user"), hlPass = document.getElementById("g-pass");
      if (hlUser && hl.user) hlUser.value = hl.user;
      if (hlPass && hl.pass) hlPass.value = hl.pass;
      if (hlEntry && hl.user && hl.pass) {
        var hlHint = document.getElementById("g-hint");
        if (hlHint) hlHint.innerHTML = "Workspace and account are filled in from your invite link — just click <b>Sign in</b>.";
      }
    }

    // DEMO-LOCAL (Kevin, 2026-07-31): the demo account is a LOCAL sample-workspace
    // concept — "Explore the demo" (and any demo/demo sign-in) must NEVER run
    // against a picked remote backend: its pushes would be anonymous 403 noise
    // and its sample seeds would try to mirror into the real workspace. Entering
    // the demo forces the workspace back to Local, whatever the picker said.
    function forceLocalWorkspace() {
      try { if (window.Studio && Studio.Sync) Studio.Sync.disconnect(); } catch (e) {}
      // Hard guarantee the persisted connection is cleared even if Sync isn't
      // ready or disconnect() partially ran — the demo must never leave a remote
      // backend persisted (it would silently reconnect on the next reload).
      try { localStorage.removeItem("analytics.datasource.v1"); } catch (e) {}
      try { localStorage.setItem(LAST_WS_KEY, "local"); } catch (e) {}
      var sel = document.getElementById("g-workspace");
      if (sel) { sel.value = "local"; sel.dataset.prev = "local"; }
      wsNote("");
    }
    document.getElementById("g-demo").addEventListener("click", function () {
      // The public demo account always exists (seeded); logging in as it triggers
      // studio.js to auto-install the sample workspace.
      if (deniedDisabled("demo")) return;
      forceLocalWorkspace();
      if (Auth.login("demo")) afterLogin(); else fail("Demo account unavailable.");
    });
    var connectBtn = document.getElementById("g-connect");
    if (connectBtn) connectBtn.addEventListener("click", function () {
      if (!window.__studioOpenBackendWizard) { fail("Still loading — try again in a moment."); return; }
      // The seeded local admin/demo pair only lives in PolecatAuth's own store until
      // someone signs in (studio.js normally mirrors it into the workspace `users`
      // table via __studioAuthBoot AFTER login). Run that mirror now so a database
      // provisioned from THIS screen — before anyone has signed in — still carries
      // real accounts, not an empty users table.
      try { if (window.__studioAuthBoot) window.__studioAuthBoot(); } catch (e) {}
      window.__studioOpenBackendWizard(null, null, function () {
        var hint = document.getElementById("g-hint");
        if (hint) hint.innerHTML = "Connected. Sign in with an account from that workspace below.";
        document.getElementById("g-err").textContent = "";
        clearCue(); // LF39: the cue's job is done once they've connected
      });
    });
  }

  if (document.readyState !== "loading") start(); else document.addEventListener("DOMContentLoaded", start);
})();
