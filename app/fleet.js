/* Analytics Dashboard Studio — © 2026 Polecat.live. See LICENSE. */
/* app/fleet.js — Polecat Shell wiring (migration stages 3–4). An ES module on
   purpose: the vendored shell is ESM, and this file is the ONLY place the app
   imports it — vendor/polecat-shell/ stays read-only, and every ps-* skin lives
   in app/studio.css (on the shell-token bridge).

   Provides:
   1. The fleet app-switcher waffle in the app bar (vendored appSwitcher).
   2. window.PolecatShell — the bridge for the app's classic scripts: rightPanel
      (What's-new container, used by studio.js renderFooter) plus the shell's
      seen-version contract (hasUnseen/markSeen, key: studio-whatsnew-seen) and
      the unseen dot on the footer Changelog button. */
import { appSwitcher, rightPanel } from "../vendor/polecat-shell/shell.js";
import { publicFleet } from "../vendor/polecat-shell/catalog.js";
import { icon } from "../vendor/polecat-shell/icons.js";
import { hasUnseen, markSeen } from "../vendor/polecat-shell/whatsnew.js";

var SEEN_KEY = "studio-whatsnew-seen";

function clearWhatsNewDot() {
  var dot = document.getElementById("wnDot");
  if (dot) dot.remove();
}

window.PolecatShell = {
  rightPanel: rightPanel,
  hasUnseen: hasUnseen,
  markSeen: markSeen,
  clearWhatsNewDot: clearWhatsNewDot,
  SEEN_KEY: SEEN_KEY,
};

function mount() {
  var host = document.querySelector("#topbar .top-app");
  if (host && !host.querySelector(".ps-waffle-btn")) {
    // The catalog carries icon NAMES; the caller resolves them (shell contract) —
    // unresolved names would render as plain initials.
    var apps = publicFleet().map(function (a) {
      return Object.assign({}, a, { icon: icon(a.icon, 22) });
    });
    host.insertBefore(appSwitcher(apps, { current: "analytics" }), host.firstChild);
  }
  // Unseen dot: light the footer Changelog button when there are releases newer
  // than the stored seen-version. js/changelog.js (a module earlier in document
  // order) has already set STUDIO_LATEST_VERSION by the time this runs; opening
  // the feed marks it seen (studio.js calls markSeen + clearWhatsNewDot).
  var btn = document.getElementById("btnChangelog");
  var latest = window.STUDIO_LATEST_VERSION || 0;
  if (btn && latest && hasUnseen(SEEN_KEY, latest) && !document.getElementById("wnDot")) {
    var dot = document.createElement("span");
    dot.id = "wnDot";
    dot.className = "sb-new-dot";
    dot.setAttribute("aria-label", "New updates");
    btn.appendChild(dot);
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
else mount();
