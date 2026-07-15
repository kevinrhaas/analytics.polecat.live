/* Analytics Dashboard Studio — © 2026 Polecat.live. See LICENSE. */
/* app/fleet.js — fleet app-switcher wiring (Polecat Shell adoption, stage 3).
   An ES module on purpose: the vendored shell is ESM, and this file is the ONLY
   place the app touches it for the waffle — vendor/polecat-shell/ stays read-only,
   and the ps-waffle-* skin lives in app/studio.css (on the shell-token bridge).
   shell.js is dependency-free, so this pulls exactly three vendored modules. */
import { appSwitcher } from "../vendor/polecat-shell/shell.js";
import { publicFleet } from "../vendor/polecat-shell/catalog.js";
import { icon } from "../vendor/polecat-shell/icons.js";

function mount() {
  var host = document.querySelector("#topbar .top-app");
  if (!host || host.querySelector(".ps-waffle-btn")) return;
  // The catalog carries icon NAMES; the caller resolves them (shell contract) —
  // unresolved names would render as plain initials.
  var apps = publicFleet().map(function (a) {
    return Object.assign({}, a, { icon: icon(a.icon, 22) });
  });
  var btn = appSwitcher(apps, { current: "analytics" });
  host.insertBefore(btn, host.firstChild);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
else mount();
