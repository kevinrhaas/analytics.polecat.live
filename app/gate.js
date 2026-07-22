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
  function reveal() { var a = document.getElementById("app"); if (a) a.style.visibility = ""; var g = document.getElementById("studio-gate"); if (g) g.remove(); }
  // The app boots behind this overlay, so its identity-dependent boot steps (user
  // mirror + demo-content auto-install) ran while nobody was signed in. Re-run
  // them now that we know who logged in. Harmless if the hook isn't ready yet
  // (already-authed loads reveal without a login and never call this).
  function afterLogin() { try { if (window.__studioAuthBoot) window.__studioAuthBoot(); } catch (e) {} reveal(); }

  async function start() {
    if (!Auth) { reveal(); return; }               // auth.js missing — fail open (dev)
    await Auth.seedIfEmpty();
    if (Auth.authed()) { reveal(); return; }
    var a = document.getElementById("app"); if (a) a.style.visibility = "hidden";

    // Themed via the same --brand/--pdc/--ink/etc custom properties as the app
    // (studio.css [data-theme]/[data-app-theme]); gate runs before studio.js
    // applies the saved attributes, so read the same localStorage keys first
    // (best-effort — falls back to :root defaults).
    try {
      var savedMode = localStorage.getItem("studio-theme");
      var savedAppTheme = localStorage.getItem("studio-app-theme");
      if (savedMode) document.documentElement.setAttribute("data-theme", savedMode);
      if (savedAppTheme) { document.documentElement.setAttribute("data-app-theme", savedAppTheme); document.documentElement.setAttribute("data-palette", savedAppTheme); }
    } catch (e) {}

    var st = document.createElement("style");
    st.textContent =
      "#studio-gate{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;" +
      "background:linear-gradient(125deg,var(--bg,#0a1c3d),var(--brand,#163a6e) 55%,var(--pdc,#1c4a86));font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}" +
      "#studio-gate .g-card{background:var(--pane,#fff);border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.4);padding:34px 32px;width:min(390px,92vw);text-align:center}" +
      "#studio-gate .g-logo{width:46px;height:46px;border-radius:12px;margin:0 auto 14px;background:linear-gradient(135deg,var(--brand,#005bb5),var(--pdc,#7d3c98));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:22px}" +
      "#studio-gate h1{font-size:19px;margin:0 0 4px;color:var(--ink,#16233b)}#studio-gate p{font-size:13px;color:var(--muted,#5d6b82);margin:0 0 18px}" +
      "#studio-gate label{display:block;text-align:left;font-size:11.5px;font-weight:700;color:var(--muted,#5d6b82);margin:0 0 4px}" +
      "#studio-gate input{width:100%;padding:11px 13px;border:1px solid var(--line,#c8d2df);border-radius:9px;font-size:14px;outline:none;margin-bottom:12px;background:var(--field,#fff);color:var(--ink,#16233b)}" +
      "#studio-gate input:focus{border-color:var(--brand,#005bb5)}" +
      "#studio-gate button{width:100%;padding:11px;border:0;border-radius:9px;background:var(--pdc,#7d3c98);color:#fff;font-size:14px;font-weight:700;cursor:pointer}" +
      "#studio-gate button:hover{background:color-mix(in srgb,var(--pdc,#7d3c98) 85%,white)}" +
      "#studio-gate .g-demo{margin-top:10px;background:transparent;color:var(--brand,#005bb5);border:1px solid var(--line,#c8d2df)!important}" +
      "#studio-gate .g-demo:hover{background:color-mix(in srgb,var(--brand,#005bb5) 8%,transparent)}" +
      "#studio-gate .g-or{font-size:11px;color:var(--faint,#8a97ab);margin:12px 0 2px;text-transform:uppercase;letter-spacing:.06em}" +
      "#studio-gate .g-hint{margin-top:16px;padding:10px 12px;border-radius:9px;background:color-mix(in srgb,var(--brand,#005bb5) 8%,transparent);border:1px solid var(--line,#c8d2df);font-size:12px;color:var(--muted,#5d6b82);text-align:left}" +
      "#studio-gate .g-hint b{color:var(--ink,#16233b)}#studio-gate .g-hint code{font-family:ui-monospace,Menlo,monospace;background:var(--field,#fff);padding:1px 5px;border-radius:5px;color:var(--ink,#16233b)}" +
      "#studio-gate .g-err{color:var(--bad,#d63a5e);font-size:12.5px;height:16px;margin-top:8px}" +
      "#studio-gate .g-note{color:var(--faint,#8a97ab);font-size:11px;margin-top:14px}" +
      "#studio-gate .g-connect{margin-top:10px;background:transparent;border:0;color:var(--faint,#8a97ab);font-size:12px;text-decoration:underline;cursor:pointer;padding:4px}" +
      "#studio-gate .g-connect:hover{color:var(--brand,#005bb5)}" +
      "#studio-gate .shake{animation:gshake .4s}@keyframes gshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}" +
      // the backend-connect wizard is a shared studio.js modal (.modal-ov, z-index 80) —
      // bump it above the gate's own overlay only while the gate is still up, so opening
      // it from the sign-in screen doesn't render (and trap clicks) behind the gate card.
      "#studio-gate ~ .modal-ov{z-index:100001}";
    document.head.appendChild(st);

    var ov = document.createElement("div"); ov.id = "studio-gate";
    ov.innerHTML = '<div class="g-card"><div class="g-logo">P</div><h1>Sign in to Analytics</h1>' +
      '<p>Your local workspace on analytics.polecat.live.</p>' +
      '<form id="g-form" autocomplete="off">' +
      '<label for="g-user">Username</label>' +
      '<input type="text" id="g-user" placeholder="username" autocomplete="username" autocapitalize="off" spellcheck="false"/>' +
      '<label for="g-pass">Password</label>' +
      '<input type="password" id="g-pass" placeholder="password" autocomplete="current-password"/>' +
      '<button type="submit">Sign in</button></form>' +
      '<div class="g-or">or</div>' +
      '<button type="button" class="g-demo" id="g-demo">Explore the demo</button>' +
      '<div class="g-err" id="g-err"></div>' +
      '<div class="g-hint" id="g-hint">This is a demo build. Sign in with the built-in demo account — <b>username</b> <code>demo</code>, <b>password</b> <code>demo</code> — or just click <b>Explore the demo</b> to jump straight in with a ready-made sample workspace.</div>' +
      '<button type="button" class="g-connect" id="g-connect">Connect to your workspace…</button>' +
      '<div class="g-note">analytics.polecat.live</div></div>';
    document.body.appendChild(ov);

    var userInp = document.getElementById("g-user"); if (userInp) userInp.focus();
    function fail(msg) {
      document.getElementById("g-err").textContent = msg || "Incorrect username or password.";
      var c = ov.querySelector(".g-card"); c.classList.add("shake"); setTimeout(function () { c.classList.remove("shake"); }, 400);
    }
    document.getElementById("g-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var u = (document.getElementById("g-user").value || "").trim();
      var p = document.getElementById("g-pass").value || "";
      if (!u) { fail("Enter a username."); return; }
      Auth.verify(u, p).then(function (okAuth) {
        if (okAuth) { Auth.login(u); afterLogin(); }
        else { fail(); document.getElementById("g-pass").select(); }
      });
    });
    document.getElementById("g-demo").addEventListener("click", function () {
      // The public demo account always exists (seeded); logging in as it triggers
      // studio.js to auto-install the sample workspace.
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
      });
    });
  }

  if (document.readyState !== "loading") start(); else document.addEventListener("DOMContentLoaded", start);
})();
