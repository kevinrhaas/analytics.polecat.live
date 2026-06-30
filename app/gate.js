/* gate.js — soft passcode gate for the hosted/gated build. Self-contained
   (injects its own styles, runs before the app). No gate when STUDIO_GATE_SHA256
   is empty; bypassed once unlocked this session. Not real security — front the
   site with Cloudflare Access / Netlify Identity for that (see PUBLISH.md). */
(function () {
  "use strict";
  // accepts a single SHA-256 string OR an array of them (issue/revoke multiple codes)
  var raw = window.STUDIO_GATE_SHA256;
  var HASHES = (Array.isArray(raw) ? raw : (raw ? [raw] : []))
    .map(function (s) { return String(s).trim().toLowerCase(); }).filter(Boolean);
  async function sha256(s) {
    var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }
  window.__gateSha256 = sha256;   // exposed for tests
  function reveal() { var a = document.getElementById("app"); if (a) a.style.visibility = ""; var g = document.getElementById("studio-gate"); if (g) g.remove(); }
  function start() {
    if (!HASHES.length || sessionStorage.getItem("studio-gate-ok") === "1") { reveal(); return; }
    var a = document.getElementById("app"); if (a) a.style.visibility = "hidden";
    var st = document.createElement("style");
    st.textContent =
      "#studio-gate{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;" +
      "background:linear-gradient(125deg,#0a1c3d,#163a6e 55%,#1c4a86);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}" +
      "#studio-gate .g-card{background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.4);padding:34px 32px;width:min(380px,92vw);text-align:center}" +
      "#studio-gate .g-logo{width:46px;height:46px;border-radius:12px;margin:0 auto 14px;background:linear-gradient(135deg,#005bb5,#7d3c98);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:22px}" +
      "#studio-gate h1{font-size:18px;margin:0 0 4px;color:#16233b}#studio-gate p{font-size:13px;color:#5d6b82;margin:0 0 18px}" +
      "#studio-gate input{width:100%;padding:11px 13px;border:1px solid #c8d2df;border-radius:9px;font-size:14px;outline:none;margin-bottom:10px}" +
      "#studio-gate input:focus{border-color:#005bb5}" +
      "#studio-gate button{width:100%;padding:11px;border:0;border-radius:9px;background:#7d3c98;color:#fff;font-size:14px;font-weight:700;cursor:pointer}" +
      "#studio-gate button:hover{background:#8e49ab}#studio-gate .g-err{color:#d63a5e;font-size:12.5px;height:16px;margin-top:8px}" +
      "#studio-gate .g-note{color:#8a97ab;font-size:11px;margin-top:14px}" +
      "#studio-gate .shake{animation:gshake .4s}@keyframes gshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}";
    document.head.appendChild(st);
    var ov = document.createElement("div"); ov.id = "studio-gate";
    ov.innerHTML = '<div class="g-card"><div class="g-logo">P</div><h1>Dashboard Studio</h1>' +
      '<p>Gated preview — enter the access passcode.</p><form id="g-form">' +
      '<input type="password" id="g-pass" placeholder="Passcode" autocomplete="off"/>' +
      '<button type="submit">Unlock</button></form><div class="g-err" id="g-err"></div>' +
      '<div class="g-note">analytics.polecat.live</div></div>';
    document.body.appendChild(ov);
    var inp = document.getElementById("g-pass"); if (inp) inp.focus();
    document.getElementById("g-form").addEventListener("submit", function (e) {
      e.preventDefault();
      sha256(document.getElementById("g-pass").value).then(function (h) {
        if (HASHES.indexOf(h) >= 0) { try { sessionStorage.setItem("studio-gate-ok", "1"); } catch (x) {} reveal(); }
        else { document.getElementById("g-err").textContent = "Incorrect passcode."; var c = ov.querySelector(".g-card"); c.classList.add("shake"); setTimeout(function () { c.classList.remove("shake"); }, 400); document.getElementById("g-pass").select(); }
      });
    });
  }
  if (document.readyState !== "loading") start(); else document.addEventListener("DOMContentLoaded", start);
})();
