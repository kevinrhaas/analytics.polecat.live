/* Analytics — © 2026 Polecat.live. See LICENSE. */
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
  // Slice A: the unseen dot now lives on BOTH the global topbar What's-new button
  // (#tbWhatsNew → #wnDotTb) and the Studio footer Changelog button (#btnChangelog →
  // #wnDot). Opening either feed clears both.
  ["wnDot", "wnDotTb"].forEach(function (id) {
    var dot = document.getElementById(id);
    if (dot) dot.remove();
  });
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
    // Slice A: the waffle sits just LEFT of the +New button (the standard right cluster is
    // What's-new · What's-next · Dark · waffle · +New · More), not at the far left of the
    // cluster — insert it before #btnNew's menu-wrap, falling back to firstChild.
    var newBtn = document.getElementById("btnNew");
    var anchor = (newBtn && newBtn.closest(".menu-wrap")) || host.firstChild;
    host.insertBefore(appSwitcher(apps, { current: "analytics" }), anchor);
  }
  // Unseen dot: light the global topbar What's-new button AND the Studio footer
  // Changelog button when there are releases newer than the stored seen-version.
  // js/changelog-head.js (a classic script earlier in document order, so it has already
  // run — AUD-08 moved the full ~680KB history off the boot path) sets
  // STUDIO_LATEST_VERSION; opening either feed marks it seen (studio.js calls markSeen +
  // clearWhatsNewDot).
  var latest = window.STUDIO_LATEST_VERSION || 0;
  if (latest && hasUnseen(SEEN_KEY, latest)) {
    [["btnChangelog", "wnDot"], ["tbWhatsNew", "wnDotTb"]].forEach(function (pair) {
      var btn = document.getElementById(pair[0]);
      if (btn && !document.getElementById(pair[1])) {
        var dot = document.createElement("span");
        dot.id = pair[1];
        dot.className = "sb-new-dot";
        dot.setAttribute("aria-label", "New updates");
        btn.appendChild(dot);
      }
    });
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
else mount();
