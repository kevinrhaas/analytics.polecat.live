/* workspaces.js — the PACKAGED workspace catalog (WORKSPACE-LOGIN, Kevin live,
   2026-07-30). Entries listed here appear in the sign-in screen's Workspace
   picker, so a provisioned teammate picks the workspace and signs in with
   their own account — no connection setup, no wizard. Kevin controls WHO can
   sign in via Admin (user provisioning); this file only says WHERE.

   Shape: { id, label, sourceId, cfg } — sourceId/cfg exactly as the backend
   wizard would store them (analytics.datasource.v1). For Supabase that's
   cfg: { url, key } with the PUBLISHABLE (anon) key.

   ⚠ This repo is public. Only ship a key here once the workspace's RLS is the
   authenticated-only posture (tools/supabase-rls-real.sql — anon must read
   NOTHING; verify with the M7 runbook's A4 queries all returning 0 for anon).
   Until then, distribute workspaces as ACCESS FILES instead (Settings →
   Workspace backend → Export access file), which the sign-in screen imports.

   A locally-imported entry with the SAME id overrides the shipped one — the
   escape hatch if a database ever moves before a re-publish.

   The Polecat workspace below ships per that rule: its RLS was tightened to
   authenticated-only and verified live 2026-07-30 (anon reads NOTHING on all
   six workspace tables — Kevin's six-zero verify). The publishable key is the
   role the database's policies are built to distrust; who can sign in is
   controlled in Admin (user provisioning), not by possession of this file.

   N25 (2026-08-09) — EVERY ENTRY DECLARES ITS PIPELINE STAGE. The /dev/ and
   /stage/ previews are the SAME build served from a subdirectory of the
   production origin (tools/stage-preview.mjs), and this file was the one thing
   the assembler did not rewrite — so the preview's picker offered the
   PRODUCTION workspace, and a test sign-in from /dev/ wrote production data.
   `stage` is where an entry may be offered: "prod" (the default when absent,
   so a locally-imported copy of an old entry is still treated as production's)
   / "dev" / "stage". `list()` only offers the entries belonging to the stage
   this build is serving from, and `blockReason()` refuses a production
   workspace from a preview whatever route it arrives by — the packaged
   catalog, an access file, a hand-typed URL, or the saved connection the
   preview inherits from production's own localStorage.
*/
window.STUDIO_WORKSPACES = [
  {
    id: "polecat",
    label: "Polecat workspace",
    sourceId: "supabase",
    stage: "prod",
    cfg: {
      url: "https://lnngiprrrcxtsawamqei.supabase.co",
      key: "sb_publishable_jQ3rgqN2swVo4WmLZp143A_2OrI8xc3"
    }
  }
  // No `dev`/`stage` entry ships yet: publishing a key here requires that
  // workspace's anon-reads-nothing posture to be VERIFIED first (the rule at
  // the top of this file), and polecat_dev's is the open ⛔ N26. Until then a
  // preview offers Local only, and a developer reaches a dev workspace the
  // same way anyone reaches any other one — an access file, or the connect
  // wizard. That is N25 slice 2.
];

/* Which pipeline stage is THIS build serving from? The preview assembler mounts
   a whole build under /dev/ or /stage/ of the production origin, so the path
   prefix is the only honest signal available to the client — the hostname,
   the origin and localStorage are all production's. Exported as a global so a
   test (and a future non-path-based deployment) can override it, and split from
   the pure `stageFor(path)` so the mapping itself is directly testable. */
window.STUDIO_STAGE_FOR = function (pathname) {
  var m = /^\/(dev|stage)(\/|$)/.exec(String(pathname == null ? "/" : pathname));
  return m ? m[1] : "prod";
};
window.STUDIO_STAGE = (function () {
  try { return window.STUDIO_STAGE_FOR(location.pathname); } catch (e) { return "prod"; }
})();

/* ---- N24 slice 2 — the SAVED WORKSPACE STORE, and the one manager panel ----
   Kevin, 2026-08-08: *"there should be some more management of your workspaces
   there so that you can define one and connect to it from there… can you export
   an access file from the setup screens so that i can define one and then export
   the access file so its easy enough to just give someone a file"*.

   Slice 1 made a connected workspace a NAMED, persisted entry. That left one
   anonymous list with no way to correct a name, drop an entry, say which one
   this browser opens on, or hand one to a teammate without first signing in
   somewhere. Two screens need all of that — the sign-in gate (app/gate.js, which
   runs BEFORE the app is loaded) and Settings → Workspace backend (app/studio.js)
   — so the list, its rules and its UI live HERE, in the one module both already
   load first. One implementation, two mounts: a rename that behaved differently
   depending on which screen you were standing on would be its own bug.

   Storage: `studio-workspaces-custom` is this browser's own entries (the shape an
   access file carries: {id,label,sourceId,cfg}); `studio-workspace-default` names
   the entry the gate opens on. Packaged entries (above) are listed and exportable
   but never renamed or removed — they come back on the next load, so offering it
   would be a lie. */
window.STUDIO_WS_STORE = (function () {
  var CUSTOM_KEY = "studio-workspaces-custom",   // this browser's saved entries
      DEFAULT_KEY = "studio-workspace-default",  // which one the gate opens on
      CONN_KEY = "analytics.datasource.v1",      // the live connection (Sync's own)
      LOCAL = { id: "local", label: "Local only (this browser)" };

  // A usable entry must say WHERE it points; anything else is a corrupt row we
  // silently drop rather than render as an unpickable option.
  function valid(w) { return !!(w && w.id && w.sourceId && w.cfg && w.cfg.url); }

  /* ---- N25 — the stage rules ---------------------------------------------
     Three small functions, all reading `window.STUDIO_STAGE` LIVE rather than
     capturing it, so a test (and the app itself, if a preview ever stops being
     a path prefix) can set it and every consumer agrees at once. */
  function stage() { return window.STUDIO_STAGE || "prod"; }
  // A packaged entry that doesn't say belongs to production: this file shipped
  // one un-tagged entry for weeks and it was prod's.
  function stageOf(w) { return (w && w.stage) || "prod"; }
  // Compare workspaces by ADDRESS, not by id — an access file may carry the
  // production database under any id and any name.
  function normUrl(u) { return String(u == null ? "" : u).trim().toLowerCase().replace(/\/+$/, ""); }
  // The production addresses this build knows about, read from the DECLARED
  // catalog (not from list(), which hides them on a preview — the whole point).
  function prodUrls() {
    return (window.STUDIO_WORKSPACES || []).filter(function (w) {
      return stageOf(w) === "prod" && w && w.cfg && w.cfg.url;
    }).map(function (w) { return normUrl(w.cfg.url); });
  }
  /* Why this connection must not happen, or "" if it may. A preview shares
     production's origin — and therefore its saved connection, its access files
     and its muscle memory — so the refusal has to live at the connection, not
     only in the picker: every sign-in, sample-pack install and push from /dev/
     was landing in the live workspace. Takes an entry {cfg:{url}} or a bare
     cfg {url}. */
  function blockReason(x) {
    if (stage() === "prod") return "";
    var url = normUrl(x && x.cfg ? x.cfg.url : (x && x.url));
    if (!url || prodUrls().indexOf(url) < 0) return "";
    return "This is the " + stage().toUpperCase() + " preview — it can’t connect to the production " +
      "workspace (" + url.replace(/^https?:\/\//, "") + "). Open production to use it.";
  }
  // The packaged entries offered HERE. Non-production entries are labelled with
  // their stage in the picker itself: the preview banner has already proven
  // dismissable, and "which database am I in" must not depend on noticing it.
  function packaged() {
    var here = stage();
    return (window.STUDIO_WORKSPACES || []).filter(function (w) { return stageOf(w) === here; })
      .map(function (w) {
        if (here === "prod" || /\((DEV|STAGE)\)\s*$/i.test(w.label || "")) return w;
        var c = {}, k;
        for (k in w) if (Object.prototype.hasOwnProperty.call(w, k)) c[k] = w[k];
        c.label = (w.label || w.id) + " (" + here.toUpperCase() + ")";
        return c;
      });
  }
  function customs() {
    try {
      var l = JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]");
      return Array.isArray(l) ? l.filter(valid) : [];
    } catch (e) { return []; }
  }
  function writeCustoms(list) { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch (e) {} }
  function save(entry) {
    if (!valid(entry)) return null;
    writeCustoms(customs().filter(function (w) { return w.id !== entry.id; }).concat([entry]));
    return entry;
  }
  // Customs FIRST so a re-imported entry shadows a packaged one carrying its id
  // (the escape hatch for a database that moves).
  function list() {
    var out = [LOCAL], seen = { local: true };
    customs().concat(packaged()).forEach(function (w) {
      if (!valid(w) || seen[w.id]) return;
      seen[w.id] = true; out.push(w);
    });
    return out;
  }
  function byId(id) { return list().filter(function (w) { return w.id === id; })[0] || null; }
  function isCustom(id) { return customs().some(function (w) { return w.id === id; }); }
  function rename(id, label) {
    label = String(label == null ? "" : label).trim().slice(0, 60);
    if (!label || !isCustom(id)) return false;
    var rows = customs();
    rows.forEach(function (w) { if (w.id === id) w.label = label; });
    writeCustoms(rows);
    return true;
  }
  function remove(id) {
    if (!isCustom(id)) return false;
    writeCustoms(customs().filter(function (w) { return w.id !== id; }));
    if (defaultId() === id) setDefault("");   // never leave the default dangling
    return true;
  }
  function defaultId() { try { return localStorage.getItem(DEFAULT_KEY) || ""; } catch (e) { return ""; } }
  function setDefault(id) {
    try { if (id) localStorage.setItem(DEFAULT_KEY, id); else localStorage.removeItem(DEFAULT_KEY); } catch (e) {}
  }
  // Which entry the live connection points at — the "Connected" marker, and the
  // gate's picker selection. "__connected" means a bound workspace that is in no
  // list (slice 1 makes that transient, but a hand-edited storage can still do it).
  function connectedId() {
    var url = "";
    try { var c = JSON.parse(localStorage.getItem(CONN_KEY) || "null"); url = (c && c.cfg && c.cfg.url) || ""; } catch (e) {}
    if (!url) return "local";
    var hit = list().filter(function (w) { return w.cfg && w.cfg.url === url; })[0];
    return hit ? hit.id : "__connected";
  }
  function host(entry) {
    return valid(entry) ? String(entry.cfg.url).replace(/^https?:\/\//, "").replace(/[\/?#].*$/, "") : "this browser";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function writeFile(name, text) {
    var blob = new Blob([text], { type: "application/json" });
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  /* The ONE access-file writer in the app. Settings' "Export access file" button
     and every row of the manager panel go through it, so the warning, the
     filename and the file's shape cannot drift apart. `authEmail`/`authPassword`
     are stripped here as well as at the source: the file grants "reach this
     workspace", never "sign in as whoever defined it" — the recipient signs in
     as themselves and the workspace's own RLS decides what they see. */
  function exportFile(entry, opts) {
    opts = opts || {};
    if (!valid(entry)) return false;
    var ask = opts.confirm || function (m) { return window.confirm(m); };
    if (!ask("The access file for “" + (entry.label || "this workspace") + "” contains its connection key — it lets the holder REACH the workspace (they still sign in with their own account). Share it only with people who should have that. Download?")) return false;
    var cfg = {}, k;
    for (k in entry.cfg) if (Object.prototype.hasOwnProperty.call(entry.cfg, k)) cfg[k] = entry.cfg[k];
    delete cfg.authEmail; delete cfg.authPassword;
    (opts.write || writeFile)((entry.id || "workspace") + "-access.json",
      JSON.stringify({ id: entry.id, label: entry.label, sourceId: entry.sourceId, cfg: cfg }, null, 2));
    return true;
  }

  // The panel's stylesheet ships with the panel so both mounts look the same.
  // Everything is expressed in the app's own theme tokens, which the gate and the
  // app each already define; the #studio-gate-scoped selectors exist because the
  // gate styles its own `button` by id (full-width, filled) and a row of actions
  // must not inherit that.
  var STYLE_ID = "studio-ws-mgr-style";
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style"); s.id = STYLE_ID;
    s.textContent =
      ".ws-mgr{text-align:left;display:flex;flex-direction:column;gap:8px}" +
      ".ws-mgr .wsm-empty{font-size:11.5px;line-height:1.5;color:var(--faint,#8a97ab);margin:0}" +
      ".ws-mgr .wsm-row{border:1px solid var(--line,#c8d2df);border-radius:10px;padding:9px 10px;background:var(--field,#fff)}" +
      ".ws-mgr .wsm-h{display:flex;align-items:center;gap:6px;flex-wrap:wrap}" +
      ".ws-mgr .wsm-name{font-size:13px;color:var(--ink,#16233b);word-break:break-word}" +
      ".ws-mgr .wsm-badge{font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 6px;border-radius:99px;background:color-mix(in srgb,var(--muted,#5d6b82) 16%,transparent);color:var(--muted,#5d6b82)}" +
      ".ws-mgr .wsm-badge.on{background:color-mix(in srgb,var(--ok,#1f9d63) 18%,transparent);color:var(--ok,#1f9d63)}" +
      ".ws-mgr .wsm-host{font-size:11px;color:var(--faint,#8a97ab);margin:2px 0 0;word-break:break-all}" +
      ".ws-mgr .wsm-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}" +
      // 44px minimum: these rows are worked from a phone (N8/N9/N13 set the bar).
      ".ws-mgr .wsm-b,#studio-gate .ws-mgr .wsm-b{width:auto;min-height:44px;padding:0 12px;margin:0;font-size:12px;font-weight:600;line-height:1;" +
        "border:1px solid var(--line,#c8d2df);border-radius:9px;background:var(--pane,#fff);color:var(--ink,#16233b);cursor:pointer}" +
      ".ws-mgr .wsm-b:hover,#studio-gate .ws-mgr .wsm-b:hover{background:color-mix(in srgb,var(--brand,#005bb5) 10%,transparent);border-color:var(--brand,#005bb5);color:var(--brand,#005bb5)}" +
      ".ws-mgr .wsm-b.danger:hover,#studio-gate .ws-mgr .wsm-b.danger:hover{background:color-mix(in srgb,var(--bad,#d63a5e) 10%,transparent);border-color:var(--bad,#d63a5e);color:var(--bad,#d63a5e)}";
    document.head.appendChild(s);
  }

  /* Mount the manager into `el`. opts.onChange fires after any edit that changed
     the list, so the host screen can re-render whatever it derives from it (the
     gate's <select>, the Settings card's status line); opts.write lets a host
     that has its own download helper (the app does, with its toast) supply it —
     the gate, which runs before the app loads, uses the writer above. */
  function renderManager(el, opts) {
    if (!el) return;
    opts = opts || {};
    ensureStyle();
    var rows = list().filter(function (w) { return w.id !== "local"; }),
        def = defaultId(), conn = connectedId();
    if (!rows.length) {
      el.innerHTML = '<div class="ws-mgr"><p class="wsm-empty">No workspaces saved in this browser yet. Connect one, or import an access file, and it will be listed here — to rename, set as the default, export as a file for a teammate, or remove.</p></div>';
      return;
    }
    el.innerHTML = '<div class="ws-mgr">' + rows.map(function (w, i) {
      var built = !isCustom(w.id), blocked = blockReason(w);
      return '<div class="wsm-row" data-i="' + i + '">' +
          '<div class="wsm-h"><b class="wsm-name">' + esc(w.label) + '</b>' +
            (w.id === conn ? '<span class="wsm-badge on">Connected</span>' : "") +
            (w.id === def ? '<span class="wsm-badge">Default</span>' : "") +
            (built ? '<span class="wsm-badge">Built in</span>' : "") +
            // N25: a saved entry pointing at production is still LISTED on a
            // preview (it is the reader's own entry, and it is theirs on the
            // production site) — it just cannot be connected from here.
            (blocked ? '<span class="wsm-badge">Production — not from ' + esc(stage().toUpperCase()) + '</span>' : "") +
          '</div>' +
          '<div class="wsm-host">' + esc(host(w)) + '</div>' +
          '<div class="wsm-acts">' +
            (built ? "" : '<button type="button" class="wsm-b" data-a="rename">Rename</button>') +
            '<button type="button" class="wsm-b" data-a="default">' + (w.id === def ? "Clear default" : "Set default") + '</button>' +
            '<button type="button" class="wsm-b" data-a="export" title="Download this workspace as an access file a teammate imports on the sign-in screen">Export access file</button>' +
            (built ? "" : '<button type="button" class="wsm-b danger" data-a="remove">Remove</button>') +
          '</div>' +
        '</div>';
    }).join("") + '</div>';
    el.querySelector(".ws-mgr").addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest(".wsm-b") : null;
      if (!btn) return;
      var row = btn.closest(".wsm-row"), w = rows[+row.getAttribute("data-i")];
      if (!w) return;
      var act = btn.getAttribute("data-a"), edited = true;
      if (act === "rename") {
        var typed = window.prompt("Rename this workspace:", w.label);
        if (typed == null || !rename(w.id, typed)) return;   // Cancel, or an empty name: leave it alone
      } else if (act === "default") {
        setDefault(w.id === def ? "" : w.id);
      } else if (act === "export") {
        exportFile(w, { write: opts.write }); edited = false;
      } else if (act === "remove") {
        // Removing the entry does NOT disconnect a live connection — that is
        // Settings → Disconnect, and conflating the two would be a data surprise.
        if (!window.confirm("Remove “" + w.label + "” from this browser's list? The workspace itself is untouched — import its access file to get it back.")) return;
        remove(w.id);
      } else return;
      renderManager(el, opts);
      if (edited && opts.onChange) opts.onChange();
    });
  }

  return {
    CUSTOM_KEY: CUSTOM_KEY, DEFAULT_KEY: DEFAULT_KEY,
    // N25
    stage: stage, stageFor: window.STUDIO_STAGE_FOR, stageOf: stageOf,
    packaged: packaged, blockReason: blockReason,
    valid: valid, list: list, byId: byId, customs: customs, isCustom: isCustom,
    save: save, rename: rename, remove: remove,
    defaultId: defaultId, setDefault: setDefault,
    connectedId: connectedId, host: host,
    exportFile: exportFile, renderManager: renderManager
  };
})();
