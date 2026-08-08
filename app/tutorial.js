/* tutorial.js — Analytics interactive tutorials.
   J6 (rebuilt) / LF18(b): guided, spotlighted walkthroughs behind a chooser —
     · "Getting started" (overview) — walks the whole app DOWN THE RAIL, in the
       rail's own top-to-bottom order and by its own groups: Workspace (Home ·
       Views · Dashboards · Datasets · Connections · Repository) → Build (Quick
       Views · View Builder · Dashboard Builder) → Manage (Jobs), then ends on
       Home. The first-run / recommended tour. **The order is not free-form:**
       tools/doc-truth.mjs check 11 compares this tour's rail targets against
       the rail's actual DOM order and fails if they diverge, so a new rail
       section forces a decision here (add a step, or add it to that check's
       documented skip set).
     · "Quick analysis"  — the Quick Views flow: dataset → table → chart →
       saved View → pin/add. The fastest data-to-chart path.
     · "Build a dashboard" — the Dashboard Builder loop: library → canvas →
       inspector → export a self-contained .html.
     · "Prep data (Jobs)" — the Jobs section: list → new job → search/folders,
       what a job is and how its output becomes a chartable dataset.
     · "Connections & Datasets" — the Connections section (list → new
       connection → search/folders) then the Datasets section (list → new
       dataset → search/folders) — where data lives, and the reusable queries
       built on top of it, LF18(b)'s last per-feature tour.
     · "Conservation Insight pack" (LF40 NEXT slice) — SAMPLE-PACK-AWARE: only
       offered once the Conservation demo pack is installed (see TOUR_GATES).
       Walks the pack's featured dashboard's three choropleth scales (county →
       watershed/HUC8 → state) and closes on the custom-geo story. The
       TOUR_GATES mechanism generalizes to any future pack's tour — add a
       TOURS.<key> entry + a gate fn, no chooser/engine changes needed.
     · The "overview" tour itself is ALSO pack-aware (LF40, mirrors welcome.js's
       computeSteps() engine): one acknowledgment step per INSTALLED sample pack
       splices in right after the intro — see computeOverviewSteps() below.
   Distinct from the welcome tour (welcome.js), which is informational.
   Steps may carry a `before()` hook (switch section, seed Explore) and the
   renderer WAITS for the step's target to exist, so tours can walk UI that
   builds asynchronously. A builder step may also declare the `pane:` its
   target lives in, which the renderer OPENS before it measures the spotlight —
   existing is not the same as visible (see openPane below). A step whose control
   the ≤640px layout HIDES outright (M10's ⋯ More convention) carries a `phone:`
   form the renderer merges per render — reachable is not the same as on screen
   (see resolveStep below).

   KEEP THESE TOURS CURRENT: any slice that changes a user-facing flow this
   tutorial walks (Quick Views, Dashboard Builder panes, export, Jobs,
   Connections, Datasets) updates the copy here in the SAME slice — the suite
   greps this file for retired product terms.
   NAME THINGS THE WAY THE APP NAMES THEM: where this copy points at something
   the reader can click — a rail section, a button, a library group, a Home
   section — it must use the label the app actually RENDERS. The saved-chart
   object is the standing trap: its storage table is still `analyses` and its
   internal ids are still analysisId (LF53 deliberately deferred that rename),
   but every surface a user sees has said "View" since LF57 — "Save View", the
   builder library's "Views" group, Home's "Pinned Views". N7 (2026-08-07)
   found the tours had kept the OLD noun in their labels: two steps sent the
   reader to a builder-library group called "Analyses" that renders "Views",
   and the quick tour contradicted itself inside one walk (step 0 "save it as
   an analysis" vs step 5 "Save View"). tools/doc-truth.mjs check 14 now holds
   every bolded label in this file and welcome.js accountable to the app's own
   render sites. Describing the ACTIVITY is untouched — this tour is still
   called "Quick analysis" and still opens on "Your first analysis, fast",
   because that is still what the reader is doing.

   That ratchet only catches retired NOUNS, though. N7 (2026-08-07) found every
   tour still closing on "reopen these tours from ⋯ More → Interactive tutorial"
   — an entry LF46 (⋯ teardown, slice 2) had DELETED, so all six tours sent the
   reader to a menu that no longer has it. The route is the ⌘K palette now (and
   Home → Take the tour / Settings → Presentation → Take the tour). So any
   AFFORDANCE named in this file's copy is now held accountable too:
   tools/doc-truth.mjs check 13 resolves every "⋯ More → X" against the real
   #menuMore markup and every "⌘K → X" against app/palette.js's command list.

   The same trap caught the BUILDER's own panel. N7 (2026-08-08) found the
   "Build a dashboard" tour still calling the left panel "the Library" — it is
   `#library` in the markup but has rendered <b>Data</b> since STUDIO-PANELS, in
   its header, its collapsed rail, the Settings toggle and Help — and still
   promising it holds "the sample queries", a group LF65 deleted. Its last step
   also routed Auto-build through the Data panel's "＋ New ▾" (dataset /
   connection / dashboard-only query), never the topbar "New ▾" that actually
   has it. tools/doc-truth.mjs check 16 now derives the panel's rendered name
   from app/index.html and its group list from buildLibrary's OWN call graph —
   so a group whose builder still exists but is no longer called (Sample packs,
   unwired by DECLUTTER-1) cannot get back into this copy — and fails any copy
   here that reaches Auto-build through the wrong New menu.

   Copy was only half of it. That same STUDIO-PANELS change also made the panes
   this tour walks start CLOSED, and the tour never noticed: step 1 ringed a
   34px collapsed rail while describing four groups the reader could not see,
   step 3 did the same to the Inspector, and at ≤640px both panes are drawers
   parked off-canvas, so the ring landed outside the viewport and the walk went
   dark for two of its six steps. N7 (2026-08-08): a builder step now declares
   its `pane:` and the renderer opens it (window.__studioOpenPane, silent).
   doc-truth check 19 holds the two halves together — a step targeting a
   collapsible pane must declare it, the declared names must be panes the
   builder can actually open, and the opener must still exist.

   Closed was not the only way a phone hides a target. N7 (2026-08-08) took the
   last of that walk: M10 moved Undo/Redo/Open/Save/Save-as/Duplicate/Export off
   the ≤640px topbar into ⋯ More and hides their buttons with
   `display:none!important`, so the build tour's export step had nothing to ring
   at 390px at all — waitFor() polled #btnExport for its full 2.5s, gave up, and
   rendered an unringed centered card whose copy told the reader to "Click
   <b>Export ▾</b>" and to press <b>Save</b>, two controls that screen does not
   have. A step now carries a `phone:` form (see resolveStep) that the renderer
   merges at ≤640px: the export stop rings ⋯ More and names the route the phone
   really has. doc-truth check 20 derives the hidden-at-≤640px id set from
   app/studio.css itself, so a control that joins the ⋯ More convention later
   cannot silently leave a tour ringing thin air.

   window.StudioTutorial.open()        — tour chooser (or restart)
   window.StudioTutorial.openTour(key) — start a specific tour ("overview"|"quick"|"build"|"jobs"|"connect")
   window.StudioTutorial.isDone()      — true once any tour was completed.
   © 2026 Polecat.live. See LICENSE. */
(function () {
  "use strict";
  var T = window.StudioTutorial = {};
  var DONE_KEY = "studio-tutorial-done";
  var PAD = 10;  // px padding around spotlight target

  function goSection(sec) {
    try { if (window.__studioShellSetSection) window.__studioShellSetSection(sec); } catch (e) {}
  }
  // Explore steps need a dataset picked so the table/chips/preview exist —
  // pick the first sample deterministically if the user hasn't picked one.
  function seedExplore() {
    goSection("explore");
    try {
      var st = window.__studioExplore && window.__studioExplore.state;
      if (st && st.dsId) return;
      var btn = [].filter.call(document.querySelectorAll(".xp-ds"), function (b) {
        return (b.getAttribute("data-xp-ds") || "").indexOf("sample") === 0;
      })[0] || document.querySelector(".xp-ds");
      if (btn) btn.click();
    } catch (e) {}
  }
  /* A builder step that spotlights one of the Dashboard Builder's side panes has
     to OPEN it first. STUDIO-PANELS made "panes closed" the builder's entry
     state, so on desktop a ring around #library or #inspector fell on a 34px
     collapsed rail, and at ≤640px those panes are drawers parked off-canvas
     (translateX(±105%) — app/studio.css), so the ring landed outside the
     viewport entirely and the reader saw a dimmed screen with nothing lit.
     A step declares which pane its target lives in (`pane:`), and this asks the
     builder's own opener — silently, so the walk never rewrites the reader's
     persisted panel preference or drawer tab. */
  function isPhone() {
    return !!(window.matchMedia && window.matchMedia("(max-width:640px)").matches);
  }
  function openPane(which) {
    var phone = isPhone();
    try { if (window.__studioOpenPane) window.__studioOpenPane(which); } catch (e) {}
    // The phone drawers SLIDE in (transform .28s). Measuring before they land
    // would ring where the drawer was, not where it is; desktop is instant.
    return phone ? new Promise(function (r) { setTimeout(r, 340); }) : null;
  }
  /* A step may carry a `phone:` variant — the same stop, told for the ≤640px app.
     openPane above fixed the panes that were merely CLOSED on a phone; this fixes
     the controls that are not there at all. M10 moved Undo/Redo/Open/Save/Save-as/
     Duplicate/Export off the phone topbar into ⋯ More and hides their buttons with
     `display:none!important` (app/studio.css), so the build tour's export step had
     no box to ring at 390px: waitFor() polled #btnExport for its full 2.5s, gave up,
     and rendered a centered card whose copy still said "Click Export ▾" — a control
     that is not on that screen, after a two-and-a-half-second stall. The phone form
     rings the ⋯ More button that IS there and names the route the reader has.
     Merged at RENDER time, never at definition time, so a tour opened after a resize
     (or a phone rotated mid-walk) always tells the truth about the app in front of
     it — and tourSteps()/stepCount() keep reporting one step per stop at any width.
     tools/doc-truth.mjs check 20 derives the hidden-at-≤640px id set from the
     stylesheet itself and fails any step that spotlights one without a phone form. */
  function resolveStep(step) {
    if (!step || !step.phone || !isPhone()) return step;
    var out = {}, k;
    for (k in step) if (Object.prototype.hasOwnProperty.call(step, k)) out[k] = step[k];
    for (k in step.phone) if (Object.prototype.hasOwnProperty.call(step.phone, k)) out[k] = step.phone[k];
    return out;
  }
  // Conservation tour: land in Studio on the pack's own featured dashboard.
  // Its row id is workspace-generated at install time (only spec.id/panel ids
  // are the pack's own literal strings — see demopacks.js dashboardSpec()), so
  // this looks the row up by demoPackId rather than assuming a fixed id.
  function openConservationDashboard() {
    try {
      var ws = Studio.Workspace;
      var row = ws && ws.all("dashboards").filter(function (r) { return r.demoPackId === "conservation"; })[0];
      if (row && window.__studioOpenRecent) window.__studioOpenRecent(row.id);
    } catch (e) {}
  }

  /* ---------- tour definitions ----------
     target: CSS selector (null → centered card, no spotlight)
     pos:    preferred tooltip position ("right"/"left"/"top"/"bottom")
     before: optional fn run before the step renders (section switch / seeding)
     pane:   builder steps only — the Dashboard Builder pane the target lives in
             ("library" | "inspector" | "canvas"); opened silently before the
             spotlight is measured (see openPane above). doc-truth check 19
             requires one on any step targeting a collapsible pane.
     phone:  optional overrides merged over the step at ≤640px (see resolveStep
             above) — for a stop whose control the phone layout hides behind ⋯ More
             rather than merely collapses. doc-truth check 20 requires one on any
             step targeting an id the phone stylesheet hides.
     last:   true on the final step — shows "Done!" instead of "Next" */
  var TOURS = {
    overview: {
      // KEVIN-COPY (live, 2026-07-31): was "Take the tour" — you've already
      // chosen to take a tour by the time this chooser is up, so the row names
      // WHAT the tour covers instead of repeating the verb.
      label: "Getting started", ic: "home", tint: "--brand",
      blurb: "A two-minute walk through the whole app — what each part is for. Start here.",
      steps: [
        {
          t: "Welcome — here's the whole app",
          h: "Analytics turns your data into Quick Views and full dashboards, right in your browser. This two-minute tour walks the left rail from the top down — <b>Workspace</b> (the things you have), <b>Build</b> (where you make them), <b>Manage</b> (keeping them fed) — then leaves you on Home, ready to start.",
          sub: "You can reopen any tour from ⌘K → Interactive tutorial, or Home → Take the tour.",
          target: null,
          before: function () { goSection("home"); }
        },
        /* ── Workspace — the things you HAVE (rail group 1, in rail order) ── */
        {
          t: "Home — where you land",
          h: "First in the rail's <b>Workspace</b> group, and where every visit starts: your featured dashboards render live, pinned Views greet you, examples are one click away, and getting-started shortcuts sit up top.",
          target: '.rail-item[data-sec="home"]',
          pos: "right"
        },
        // N7 (2026-08-07): the Views CATALOG (LF57 slice 1) was missing from the
        // walk entirely — the tour jumped from Home straight to Dashboards.
        {
          t: "Views — every chart you've saved",
          h: "A <b>View</b> is one saved chart, KPI, map, or block of text — the unit dashboards are made of. This is the catalog of all of them, wherever you built them: search, rename, ★ pin one to Home, or drop it into a dashboard.",
          sub: "Two rail items are called Views: this catalog under <b>Workspace</b>, and the builder under <b>Build</b> further down. The group label is what tells them apart.",
          target: '.rail-item[data-sec="views"]',
          pos: "right"
        },
        {
          t: "Dashboards — the finished thing",
          h: "Arrange several Views into a page, feature it on Home, and export it as a self-contained file. This is the catalog of the ones you've made — and they group into named <b>workbooks</b> you can filter by.",
          target: '.rail-item[data-sec="dashboards"]',
          pos: "right"
        },
        {
          t: "Datasets — your reusable queries",
          h: "A dataset is a named, parameterizable query on top of a connection — the building block every chart and dashboard draws from. Define it once, use it everywhere.",
          target: '.rail-item[data-sec="datasets"]',
          pos: "right"
        },
        {
          t: "Connections — where your data lives",
          h: "Point at Postgres, Supabase, Snowflake, BigQuery, Google Sheets, a dropped CSV, and more — each connection uses an <b>adapter</b>, the driver that speaks that backend's language. Credentials stay in your browser by default; connecting a workspace backend syncs them there too (encrypt them from Settings). There's a dedicated tour that walks Connections and Datasets together.",
          target: '.rail-item[data-sec="connections"]',
          pos: "right"
        },
        {
          t: "Repository — find anything",
          h: "Last in <b>Workspace</b>: a searchable, folder-grouped view of every dashboard, View, dataset, connection and job at once. Pick a kind or search by name — a row opens straight into that object's own editor.",
          target: '.rail-item[data-sec="repository"]',
          pos: "right"
        },
        /* ── Build — where you MAKE them (rail group 2, in rail order) ── */
        {
          t: "Quick Views — the fast path to a chart",
          h: "Now the rail's <b>Build</b> group, the places you make all of that. First and fastest: start from a dataset, see it as a table, pick a chart, and save the result as a reusable <b>View</b>. There's a dedicated tour for it.",
          target: '.rail-item[data-sec="explore"]',
          pos: "right"
        },
        // TOUR-WOW (Kevin live, 2026-07-31): the flagship View Builder was
        // missing from the app walk entirely.
        {
          t: "View Builder — drag-and-drop charts",
          h: "The flagship chart canvas: drag a dataset's columns onto <b>Columns / Rows / Filters / Color</b> shelves and the result renders live as you go — tables, bars, lines, donuts, heatmaps, and full US maps. Every save lands in the Views catalog up top.",
          sub: "You can even drop a CSV file straight onto the canvas — it becomes a dataset and an instant View.",
          target: '.rail-item[data-sec="build"]',
          pos: "right"
        },
        {
          t: "Dashboard Builder — assemble & export",
          h: "Where you assemble a dashboard: drag Views in, tune each one in the inspector, add interactive <b>filters</b> that narrow every View at once, and watch the real dashboard render live. Export a file that runs anywhere when you're done.",
          target: '.rail-item[data-sec="studio"]',
          pos: "right"
        },
        /* ── Manage — keeping the data fed (rail group 3) ── */
        {
          t: "Jobs — prep &amp; roll up",
          h: "The rail's <b>Manage</b> group. A job cleans and reshapes data before it's charted: rename, filter, and aggregate (including an acreage-weighted mean for honest state / district / watershed roll-ups). Its output lands back in Datasets — there's a dedicated tour for it too.",
          sub: "Settings and Help sit pinned at the very bottom of the rail, always one click away.",
          target: '.rail-item[data-sec="jobs"]',
          pos: "right"
        },
        {
          // #23 (Kevin): every domain term, one line each — the same glossary
          // lives in Help (rail → Help → Glossary) for later reference.
          t: "The words, one line each",
          h: "<b>Adapter</b> — the driver that speaks one backend's language (Postgres, Supabase, CSV…).<br>" +
             "<b>Connection</b> — an adapter plus your credentials, pointing at one place data lives.<br>" +
             "<b>Dataset</b> — a named, reusable query on a connection.<br>" +
             "<b>Job</b> — a prep pipeline that cleans or rolls a dataset up into a new one.<br>" +
             "<b>View</b> — one chart, KPI, map, or text block; the unit dashboards are made of.<br>" +
             "<b>Dashboard</b> — Views arranged into a page you feature, share, and export.<br>" +
             "<b>Workbook</b> — a named group of dashboards, used as a filter chip.<br>" +
             "<b>Filter</b> — a dashboard control that narrows every View wired to it.<br>" +
             "<b>Sample pack</b> — installable demo content: datasets, Views, and dashboards.",
          sub: "Forget one later? The same glossary lives in Help.",
          target: null
        },
        {
          t: "You're set — start on Home",
          h: "That's the rail, top to bottom. The <i>work</i> runs the other way: <b>Connections</b> → <b>Datasets</b> → (Jobs to prep) → <b>Quick Views</b> or a builder → <b>Home</b> to see it all. Take the <b>Quick analysis</b> tour next for a hands-on run, or open an example below.",
          sub: "You'll always land here on Home — pick up a recent dashboard, or start something new.",
          target: null,
          last: true,
          before: function () { goSection("home"); }
        }
      ]
    },
    quick: {
      label: "Quick analysis", ic: "search", tint: "--dk",
      blurb: "From a dataset to a saved, reusable chart in about a minute — the fastest way in.",
      steps: [
        {
          t: "Your first analysis, fast",
          h: "This is the quickest path from data to insight: pick a dataset, see it as a table, choose a chart, and save the result as a reusable <b>View</b>. Six quick steps.",
          sub: "You can reopen these tours any time from ⌘K → Interactive tutorial, or Home → Take the tour.",
          target: null,
          before: function () { goSection("explore"); }
        },
        {
          t: "1 · Pick a dataset",
          h: "Everything starts from data. <b>Your workspace datasets</b> are listed first (they run live against their connections); <b>sample data</b> sits below so you can play before connecting anything.",
          sub: "We've picked a sample for you — the search box filters by name or column.",
          target: ".xp-side",
          pos: "right",
          before: seedExplore
        },
        {
          t: "2 · See the data first",
          h: "The table shows real rows and columns before you chart anything — live rows when the dataset has a connection, typed sample rows otherwise (the badge says which).",
          target: ".xp-table-wrap",
          pos: "bottom"
        },
        {
          t: "3 · Choose the chart",
          h: "Pick how to see it — bars, lines, tables… including the <b>US county map</b> and the <b>Ensemble</b> chart that blends many sources into one best common estimate.",
          sub: "Column mappings are guessed for you and editable right below the chips.",
          target: ".xp-chips",
          pos: "bottom"
        },
        {
          t: "4 · The result is real",
          h: "The preview is the <b>actual dashboard renderer</b> — what you see here is exactly what any dashboard will show. Change the chart or mapping and it updates live.",
          target: "#xpPreview",
          pos: "top"
        },
        {
          t: "5 · Name it, save it",
          h: "Give it a name and <b>Save View</b>. Saved Views are reusable everywhere: ★ pins one to <b>Home</b> live; ▦ drops it into the current dashboard as a panel.",
          target: ".xp-savebar",
          pos: "top"
        },
        {
          t: "6 · It follows you",
          h: "Your saved Views live in the left list here, under <b>Views</b> in the Dashboard Builder's <b>Data</b> panel, and (when pinned) as live cards on <b>Home</b> — the app opens on your charts, not on machinery.",
          sub: "Need to prep data first (rename, filter, roll up)? The <b>Jobs</b> section does that and lands the result back in Datasets.",
          target: ".xp-saved",
          pos: "right"
        },
        {
          t: "That's the fast path!",
          h: "<b>Dataset → table → chart → saved View.</b> When you want full dashboards — many panels, KPIs, filters, export — take the <b>Build a dashboard</b> tour next.",
          sub: "⌘K → Interactive tutorial brings you back here any time.",
          target: null,
          last: true
        }
      ]
    },
    build: {
      label: "Build a dashboard", ic: "grid", tint: "--good",
      blurb: "The full Dashboard Builder loop — arrange panels, tune charts, export a file that runs anywhere.",
      steps: [
        {
          t: "Build a full dashboard",
          h: "This walkthrough shows the Dashboard Builder loop — from picking data to exporting a live, self-contained dashboard file. Press <b>Next</b> to begin.",
          sub: "You can reopen these tours any time from ⌘K → Interactive tutorial.",
          target: null,
          pane: "canvas",
          before: function () { goSection("studio"); }
        },
        {
          t: "1 · The Data panel",
          h: "The <b>Data</b> panel (left) holds everything chartable, top to bottom: <b>This dashboard's datasets</b>, your workspace <b>Datasets</b>, your saved <b>Views</b>, and — once you author your own queries — <b>My queries</b>. Search filters by name, column, or table.",
          sub: "Click a chart chip on any card — or drag the card straight onto the canvas.",
          target: "#library",
          pane: "library",
          pos: "right"
        },
        {
          t: "2 · Canvas — live preview",
          h: "The centre pane is the <b>real rendered dashboard</b>, not a mock-up. Drop data here to add a panel; drag the header grip to reorder; drag a panel's right edge to change its width, its bottom edge to change its height.",
          sub: "Every change updates instantly.",
          target: "#canvas",
          pane: "canvas",
          pos: "right"
        },
        {
          t: "3 · Inspector",
          h: "Click any panel to select it. The <b>Inspector</b> (right pane) renames it, changes the chart type, binds columns, and tunes visual options — the same pane also configures KPI tiles, filters, and datasets.",
          target: "#inspector",
          pane: "inspector",
          pos: "left"
        },
        {
          t: "4 · Export — it runs anywhere",
          h: "Click <b>Export ▾</b> to download a <b>self-contained .html file</b> — no server, no dependencies; email it, host it, open it from disk. It's byte-identical to the preview you've been looking at.",
          sub: "The same menu also hands out Excel, Word, PowerPoint and PDF versions, or the editable .studio.json spec — and <b>Save</b> keeps the dashboard in your Dashboards catalog so you can reopen it and keep working.",
          target: "#btnExport",
          pane: "canvas",
          pos: "bottom",
          // ≤640px: M10 hides #btnExport and #btnSaveSpec outright and hands both to
          // ⋯ More, so the desktop copy names two controls the reader cannot see and
          // the desktop target has no box to ring. Same stop, the phone's own route.
          phone: {
            h: "Tap <b>⋯ More → Export…</b> to download a <b>self-contained .html file</b> — no server, no dependencies; email it, host it, open it from disk. It's byte-identical to the preview you've been looking at.",
            sub: "The same menu also hands out Excel, Word, PowerPoint and PDF versions, or the editable .studio.json spec — and <b>⋯ More → Save</b> keeps the dashboard in your Dashboards catalog so you can reopen it and keep working.",
            target: "#btnMore"
          }
        },
        {
          t: "You're ready to build!",
          h: "That's the loop: <b>pick data → arrange panels → configure → export</b>. Feature a dashboard on <b>Home</b> (the little house on its card) to see it live when you open the app, and use <b>Jobs</b> to prep or roll up data before charting.",
          sub: "In a hurry? <b>New ▾</b> in the topbar → <b>Auto-build a starter</b> scaffolds a whole dashboard from one dataset.",
          target: null,
          pane: "canvas",
          last: true
        }
      ]
    },
    jobs: {
      label: "Prep data (Jobs)", ic: "sliders", tint: "--warn",
      blurb: "Clean, roll up, and combine data before it's charted — a job's output becomes a new dataset.",
      steps: [
        {
          t: "Prep &amp; roll up your data",
          h: "A <b>job</b> reshapes one dataset before it's charted — rename columns, filter rows, roll up with sum/mean/count/median (or an acreage-weighted mean for honest regional roll-ups), or join/union in another dataset. The result lands back in <b>Datasets</b>, ready to chart like any other.",
          sub: "You can reopen these tours any time from ⌘K → Interactive tutorial.",
          target: null,
          before: function () { goSection("jobs"); }
        },
        {
          t: "1 · Every job you've built",
          h: "Jobs land here with a status dot for their last run (never run / OK / failed), a step count, and — once the source data updates — a reminder badge if you set one.",
          target: "#jobsResults",
          pos: "bottom"
        },
        {
          t: "2 · Start a new job",
          h: "<b>+ New job</b> opens a small pipeline builder: pick a source dataset, add steps in order (rename, filter, aggregate, join, union…), preview the real result, then save it as a brand-new dataset.",
          target: "#jobsNewBtn",
          pos: "bottom"
        },
        {
          t: "3 · Find one fast",
          h: "Search by name, source, output, or folder — the same folder chips Datasets and Connections use once you start filing jobs into one.",
          target: "#jobsSearch",
          pos: "bottom"
        },
        {
          t: "That's Jobs!",
          h: "<b>Source dataset → steps → new dataset.</b> Prep data here, then chart it in <b>Quick Views</b> or the <b>Dashboard Builder</b> exactly like anything else in Datasets.",
          sub: "⌘K → Interactive tutorial brings you back here any time.",
          target: null,
          last: true
        }
      ]
    },
    connect: {
      label: "Connections & Datasets", ic: "gear", tint: "--bad",
      blurb: "Where your data lives, and the reusable queries built on top of it — both in one walk.",
      steps: [
        {
          t: "Connect your data, then query it",
          h: "A <b>connection</b> points at where your data lives; a <b>dataset</b> is a named, reusable query on top of one — the building block every chart and dashboard draws from. This tour walks both.",
          sub: "You can reopen these tours any time from ⌘K → Interactive tutorial.",
          target: null,
          before: function () { goSection("connections"); }
        },
        {
          t: "1 · Every connection you've made",
          h: "Point at Postgres, Supabase, Snowflake, BigQuery, Google Sheets, a dropped CSV, and more — or work entirely on the built-in sample data. Connections land here with folder chips once you start filing them.",
          target: "#connResults",
          pos: "bottom"
        },
        {
          t: "2 · Add a new connection",
          h: "<b>+ New connection</b> opens a short wizard: pick an adapter, enter credentials, test it, save. Credentials stay in your browser by default; a workspace backend can sync them (encrypt them from Settings).",
          target: "#connNewBtn",
          pos: "bottom"
        },
        {
          t: "3 · Find one fast",
          h: "Search by name, adapter, or folder — the same folder chips every catalog in the app uses once you start filing things.",
          target: "#connSearch",
          pos: "bottom"
        },
        {
          t: "4 · From connection to dataset",
          h: "A <b>dataset</b> is a named, <code>{{param}}</code>-substitutable query on top of a connection — define it once, chart it everywhere in Quick Views or the Dashboard Builder.",
          target: "#dsxResults",
          pos: "bottom",
          before: function () { goSection("datasets"); }
        },
        {
          t: "5 · Add a new dataset",
          h: "<b>+ New dataset</b> opens the editor: pick a connection, write the query (or pick a table), preview real rows, save.",
          target: "#dsxNewBtn",
          pos: "bottom"
        },
        {
          t: "6 · Find one fast",
          h: "Search by name, connection, table, or folder — the same convention as Connections and every other catalog.",
          target: "#dsxSearch",
          pos: "bottom"
        },
        {
          t: "That's Connections &amp; Datasets!",
          h: "<b>Connection → dataset → chart it.</b> Head to <b>Quick Views</b> for the fast path to a chart, or <b>Jobs</b> first if the data needs prep.",
          sub: "⌘K → Interactive tutorial brings you back here any time.",
          target: null,
          last: true
        }
      ]
    },
    conservation: {
      label: "Conservation Insight pack", ic: "globe", tint: "--brand",
      blurb: "A guided look at the sample pack's featured dashboard — three choropleth scales, and the geography story behind them.",
      steps: [
        {
          t: "Your Conservation Insight pack, guided",
          h: "Installing the <b>Conservation Insight</b> sample pack seeded a whole workspace — connections, datasets, a prep job, and one FEATURED dashboard built as a best-practice conservation story. This short tour walks that dashboard's three map scales, then the geography behind them.",
          sub: "You can reopen this tour any time from ⌘K → Interactive tutorial.",
          target: null,
          before: function () { goSection("home"); }
        },
        {
          t: "1 · Already live on Home",
          h: "The pack's curated dashboard renders as a real, live preview right on Home the moment it installs — this is the actual renderer on sample data, not a screenshot.",
          sub: "Click it to open in the Dashboard Builder, or Next to walk it here.",
          target: ".home-featured",
          pos: "bottom",
          before: function () { goSection("home"); }
        },
        {
          t: "2 · County — the hero view",
          h: "The finest-grain read: cover-crop adoption by <b>county</b>, a common estimate blended across five providers. Maps lead the dashboard on purpose, trend charts follow.",
          target: '[data-panel-id="p_county"]',
          pos: "bottom",
          inPreview: true,
          before: openConservationDashboard
        },
        {
          t: "3 · The same data, by watershed",
          h: "Right beside it: the identical adoption data rolled up to <b>watersheds (HUC8)</b> instead of political boundaries — conservation outcomes follow water, not county lines.",
          target: '[data-panel-id="p_huc8"]',
          pos: "top",
          inPreview: true
        },
        {
          t: "4 · ...and a state rollup",
          h: "A third scale, <b>state</b>, acreage-weighted so the average is honest rather than a flat mean across counties of very different size.",
          target: '[data-panel-id="p_state"]',
          pos: "top",
          inPreview: true
        },
        {
          t: "That's the geography story",
          h: "County, watershed, and state are three of the choropleth's built-in scales — it also ships USDA crop-reporting districts, congressional districts, and 5-digit ZIP codes, plus your own <b>custom regions</b> (Inspector → Region scale → Custom regions, import a CSV mapping county → your own boundary). Same geometry engine underneath every scale, no shapefiles to source.",
          sub: "⌘K → Interactive tutorial brings you back here any time.",
          target: null,
          last: true
        }
      ]
    }
  };
  // LF40 (overview tour, pack-aware engine): mirrors welcome.js's computeSteps() — the
  // overview's static steps get one "your sample pack" step spliced in right after the
  // intro (before "Home"), per INSTALLED pack, reusing the pack's own name/tagline from
  // demopacks.js. Recomputed on every access so install state changing mid-session (a pack
  // installed/removed from Settings) is reflected the next time the tour opens.
  function installedPacks() {
    var packs = (window.Studio && Studio.DEMO_PACKS) || {};
    if (!window.Studio || !Studio.demoPackInstalled) return [];
    return Object.keys(packs)
      .filter(function (id) { return Studio.demoPackInstalled(id); })
      .map(function (id) { return { id: id, pack: packs[id] }; });
  }
  function packOverviewStep(entry) {
    var p = entry.pack || {}, esc = (window.Studio && Studio.escapeHtml) || function (s) { return s; };
    return {
      t: p.name || "Sample pack",
      h: "Your workspace comes with the <b>" + esc(p.name || "sample pack") + "</b> sample pack — " +
        esc(p.tagline || p.blurb || "curated dashboards and datasets, ready to explore") + ".",
      sub: TOUR_GATES[entry.id]
        ? "There's a dedicated tour for it too — pick it from the chooser (⌘K → Interactive tutorial)."
        : "Find its dashboards on Home and in Dashboards.",
      target: null
    };
  }
  function computeOverviewSteps() {
    var packs = installedPacks(), base = TOURS.overview.steps;
    if (!packs.length) return base;
    return base.slice(0, 1).concat(packs.map(packOverviewStep)).concat(base.slice(1));
  }
  // Single accessor every step-array read goes through — "overview" is computed live,
  // every other tour reads its own static array unchanged.
  function tourSteps(key) { return key === "overview" ? computeOverviewSteps() : TOURS[key].steps; }
  T.computeOverviewStepTitles = function () { return computeOverviewSteps().map(function (s) { return s.t; }); };

  var TOUR_ORDER = ["overview", "quick", "build", "jobs", "connect", "conservation"];
  // Some tours only make sense once a sample pack is installed — gate their
  // CHOOSER visibility here (openTour(key) still works directly regardless,
  // e.g. a future "take this pack's tour" link from Settings' pack card).
  var TOUR_GATES = {
    conservation: function () { return !!(window.Studio && Studio.demoPackInstalled && Studio.demoPackInstalled("conservation")); }
  };
  function visibleTourKeys() {
    return TOUR_ORDER.filter(function (k) { return !TOUR_GATES[k] || TOUR_GATES[k](); });
  }

  var _tour = null;   // active tour key, null while the chooser is up
  var _cur = 0;
  var _active = false;

  /* --- CSS (injected once) — themed via the shared custom properties --- */
  function injectStyle() {
    if (document.getElementById("st-style")) return;
    var s = document.createElement("style"); s.id = "st-style";
    s.textContent =
      ".st-dim{position:fixed;background:rgba(6,10,20,.62);z-index:9900;pointer-events:all}" +
      "#st-ring{position:fixed;border:2.5px solid var(--dk,#7d3c98);border-radius:7px;z-index:9905;pointer-events:none;box-shadow:0 0 0 4px color-mix(in srgb,var(--dk,#7d3c98) 20%,transparent)}" +
      "#st-scrim{position:fixed;inset:0;z-index:9899;background:rgba(6,10,20,.62);pointer-events:all}" +
      "#st-tip{position:fixed;z-index:9920;background:var(--pane,#fff);border-radius:14px;" +
        "box-shadow:0 16px 56px rgba(6,16,38,.42);width:min(400px,92vw);" +
        "padding:20px 22px 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
        "pointer-events:all}" +
      "#st-tip h3{margin:0 0 9px;font-size:16px;font-weight:800;color:var(--ink,#0a1c3d)}" +
      "#st-tip .st-h{font-size:13.5px;line-height:1.62;color:var(--ink,#243149);margin:0 0 7px}" +
      "#st-tip .st-h b{color:var(--brand,#005bb5)}" +
      "#st-tip .st-sub{font-size:11.5px;color:var(--muted,#6e809a);line-height:1.5;margin:0 0 13px;font-style:italic}" +
      "#st-tip .st-ft{display:flex;align-items:center;gap:8px}" +
      "#st-tip .st-dots{display:flex;gap:5px;margin-right:4px}" +
      "#st-tip .st-dots i{width:6px;height:6px;border-radius:50%;background:var(--line,#c8d0dc);display:block}" +
      "#st-tip .st-dots i.on{background:var(--dk,#7d3c98)}" +
      "#st-tip .st-skip{background:none;border:0;color:var(--faint,#8a9cb0);font-size:12px;cursor:pointer;padding:0}" +
      "#st-tip .st-skip:hover{color:var(--ink,#243149)}" +
      "#st-tip .st-sp{flex:1}" +
      "#st-tip button.st-btn{border:1px solid var(--line,#d5dce8);background:var(--field,#f5f8fc);color:var(--ink,#16233b);border-radius:8px;padding:7px 14px;font-size:13px;font-weight:700;cursor:pointer;margin-left:4px}" +
      "#st-tip button.st-btn:hover{border-color:var(--brand,#005bb5);color:var(--brand,#005bb5)}" +
      "#st-tip button.st-btn.pri{background:var(--dk,#7d3c98);border-color:transparent;color:#fff}" +
      "#st-tip button.st-btn.pri:hover{background:color-mix(in srgb,var(--dk,#7d3c98) 85%,black)}" +
      /* tour chooser cards */
      "#st-tip .st-choice{display:flex;width:100%;text-align:left;align-items:center;gap:12px;border:1.5px solid var(--line,#d5dce8);" +
        "background:var(--field,#f5f8fc);border-radius:11px;padding:12px 14px;margin:0 0 9px;cursor:pointer}" +
      "#st-tip .st-choice:hover{border-color:var(--dk,#7d3c98)}" +
      "#st-tip .st-choice b{font-size:13.5px;color:var(--ink,#16233b)}" +
      "#st-tip .st-choice small{font-size:11.5px;color:var(--muted,#6e809a);line-height:1.45}" +
      // TOUR-FRONT: chooser sizing + per-tour colored icon chips (welcome-dialog
      // width so the two dialogs feel like one flow, not two different apps).
      "#st-tip.st-chooser{width:min(560px,94vw);max-width:min(560px,94vw)}" +
      "#st-tip .st-ch-ic{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9px;flex:0 0 auto}" +
      "#st-tip .st-ch-tx{display:flex;flex-direction:column;gap:3px;min-width:0}";
    document.head.appendChild(s);
  }

  /* --- Helpers --- */
  function padRect(r) {
    return {
      top: r.top - PAD, left: r.left - PAD, right: r.right + PAD, bottom: r.bottom + PAD,
      width: r.width + PAD * 2, height: r.height + PAD * 2
    };
  }
  function removeLayer(id) { var el = document.getElementById(id); if (el) el.remove(); }
  function clearOverlays() {
    ["st-ring", "st-scrim", "st-tip"].forEach(removeLayer);
    [].slice.call(document.querySelectorAll(".st-dim")).forEach(function (d) { d.remove(); });
  }
  // Wait for a selector to exist AND have a laid-out box (tours walk UI that
  // renders asynchronously — Explore fetches rows before its steps exist).
  // inPreview: a panel (e.g. a choropleth) lives INSIDE the #preview iframe —
  // studio-render.js's own header comment notes this is the SAME renderer that
  // draws both the live builder canvas and an exported dashboard, same-origin
  // srcdoc with no sandbox attribute (the widget-zoom Escape fix relies on the
  // same fact), so reaching into its contentDocument is safe here too.
  function previewDoc() {
    var f = document.querySelector("#preview");
    try { return f && f.contentDocument; } catch (e) { return null; }
  }
  function waitFor(sel, timeout, inPreview) {
    return new Promise(function (resolve) {
      if (!sel) return resolve(null);
      var t0 = Date.now();
      (function poll() {
        var doc = inPreview ? previewDoc() : document;
        var el = doc && doc.querySelector(sel);
        if (el && el.getBoundingClientRect().width > 0) return resolve(el);
        if (Date.now() - t0 > (timeout || 2500)) return resolve(el || null);
        setTimeout(poll, 90);
      })();
    });
  }
  // A preview-iframe element's own getBoundingClientRect() is relative to the
  // IFRAME's viewport, not the parent document's — offset by the iframe's own
  // rect (its position in the parent) to get spotlight-ready page coordinates.
  function effectiveRect(tEl, inPreview) {
    var r = tEl.getBoundingClientRect();
    if (!inPreview) return r;
    var f = document.querySelector("#preview");
    if (!f) return r;
    var fr = f.getBoundingClientRect();
    return {
      top: r.top + fr.top, left: r.left + fr.left,
      right: r.right + fr.left, bottom: r.bottom + fr.top,
      width: r.width, height: r.height
    };
  }

  /* --- Tour chooser --- */
  // TOUR-FRONT (Kevin live, 2026-07-31): the chooser matches the welcome
  // dialog's size, each tour row wears its own colored icon, and a Back button
  // returns to the welcome screen for anyone who changes their mind.
  function renderChooser() {
    clearOverlays();
    var scrim = document.createElement("div"); scrim.id = "st-scrim";
    scrim.onclick = function (e) { if (e.target === scrim) close(); };
    document.body.appendChild(scrim);
    var tip = document.createElement("div"); tip.id = "st-tip"; tip.className = "st-chooser";
    tip.innerHTML =
      "<h3>Pick a tour</h3>" +
      '<div class="st-h">Quick, guided walkthroughs — spotlights on the real app, a couple of minutes each. Every tour brings you back here when it’s done.</div>' +
      visibleTourKeys().map(function (k) {
        var tint = TOURS[k].tint || "--brand";
        return '<button type="button" class="st-choice" data-tour="' + k + '">' +
          '<span class="st-ch-ic" data-ic="' + (TOURS[k].ic || "home") + '" style="background:color-mix(in srgb,var(' + tint + ') 14%,transparent);color:var(' + tint + ')"></span>' +
          '<span class="st-ch-tx"><b>' + TOURS[k].label + "</b><small>" + TOURS[k].blurb + "</small></span></button>";
      }).join("") +
      '<div class="st-ft"><button class="st-btn" data-act="chooser-back">← Back</button><div class="st-sp"></div><button class="st-skip" aria-label="Close tours">Maybe later</button></div>';
    tip.querySelector(".st-skip").onclick = close;
    tip.querySelector('[data-act="chooser-back"]').onclick = function () {
      close();
      if (window.StudioWelcome) StudioWelcome.open();
    };
    [].slice.call(tip.querySelectorAll("[data-tour]")).forEach(function (btn) {
      var ic = btn.querySelector(".st-ch-ic");
      if (ic && window.Studio && Studio.icon) ic.appendChild(Studio.icon(ic.getAttribute("data-ic"), 17));
      btn.onclick = function () { startTour(btn.getAttribute("data-tour")); };
    });
    document.body.appendChild(tip);
    positionTip(tip, null);
    setTimeout(function () { var f = tip.querySelector("[data-tour]"); if (f) f.focus(); }, 60);
  }

  /* --- Core renderer --- */
  function render(idx) {
    var steps = tourSteps(_tour);
    // Resolved per render, so the step describes the app the reader is looking at
    // right now — a phone-hidden control gets its ⋯ More form (see resolveStep).
    var step = resolveStep(steps[idx]);
    // A step can take a moment to become renderable — before() switches section,
    // openPane() waits out a drawer transition, waitFor() polls the target for up
    // to 2.5s (6s in the preview iframe). Throughout that window the PREVIOUS
    // step's card is still on screen with a live Next, so a reader who taps twice
    // (or taps while the app is busy) used to advance twice, walk off the end of
    // the tour, and land here with steps[idx] undefined — an uncaught TypeError,
    // which is a release gate. Both halves are closed: the navigation buttons of
    // the outgoing card go inert while the next one is being prepared (Skip stays
    // live — nobody should ever be trapped in a tour), and an out-of-range index
    // simply finishes rather than throwing.
    if (!step) return finish();
    _cur = idx;
    var live = document.getElementById("st-tip");
    if (live) [].forEach.call(live.querySelectorAll("[data-act]"), function (b) { b.disabled = true; });
    Promise.resolve(step.before ? step.before() : null).then(function () {
      return step.pane ? openPane(step.pane) : null;
    }).then(function () {
      return waitFor(step.target, step.inPreview ? 6000 : 2500, step.inPreview);
    }).then(function (tEl) {
      if (!_active || _cur !== idx) return; // user moved on / closed while waiting
      clearOverlays();

      if (!tEl) {
        var scrim = document.createElement("div"); scrim.id = "st-scrim";
        scrim.onclick = function (e) { if (e.target === scrim) close(); };
        document.body.appendChild(scrim);
      } else {
        var r = padRect(effectiveRect(tEl, step.inPreview));
        var W = window.innerWidth, H = window.innerHeight;
        [
          { top: 0, left: 0, width: W, height: Math.max(0, r.top) },
          { top: Math.min(H, r.bottom), left: 0, width: W, height: Math.max(0, H - r.bottom) },
          { top: r.top, left: 0, width: Math.max(0, r.left), height: r.height },
          { top: r.top, left: Math.min(W, r.right), width: Math.max(0, W - r.right), height: r.height }
        ].forEach(function (p) {
          if (p.width <= 0 || p.height <= 0) return;
          var d = document.createElement("div"); d.className = "st-dim";
          d.style.cssText = "top:" + p.top + "px;left:" + p.left + "px;width:" + p.width + "px;height:" + p.height + "px";
          document.body.appendChild(d);
        });
        var ring = document.createElement("div"); ring.id = "st-ring";
        ring.style.cssText = "top:" + r.top + "px;left:" + r.left + "px;width:" + r.width + "px;height:" + r.height + "px";
        document.body.appendChild(ring);
        try { tEl.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e) {}
      }

      var tip = document.createElement("div"); tip.id = "st-tip";
      var dots = steps.map(function (_, j) { return '<i class="' + (j === idx ? "on" : "") + '"></i>'; }).join("");
      tip.innerHTML =
        "<h3>" + step.t + "</h3>" +
        '<div class="st-h">' + step.h + "</div>" +
        (step.sub ? '<div class="st-sub">' + step.sub + "</div>" : "") +
        '<div class="st-ft"><div class="st-dots">' + dots + "</div>" +
          '<button class="st-skip" aria-label="Skip tutorial">Skip</button>' +
          '<div class="st-sp"></div>' +
          (idx > 0 ? '<button class="st-btn" data-act="back">Back</button>' : "") +
          '<button class="st-btn pri" data-act="next">' + (step.last ? "Done!" : "Next →") + "</button>" +
        "</div>";

      tip.querySelector(".st-skip").onclick = close;
      var nxt = tip.querySelector('[data-act="next"]');
      if (nxt) nxt.onclick = function () { step.last ? finish() : render(_cur + 1); };
      var bck = tip.querySelector('[data-act="back"]');
      if (bck) bck.onclick = function () { render(_cur - 1); };

      document.body.appendChild(tip);
      positionTip(tip, tEl, step.pos, step.inPreview);
      if (nxt) setTimeout(function () { nxt.focus(); }, 60);
    });
  }

  function positionTip(tip, tEl, pos, inPreview) {
    var TW = tip.offsetWidth || 380;
    var TH = tip.offsetHeight || 160;
    var W = window.innerWidth;
    var H = window.innerHeight;
    var MARGIN = 18;
    var x, y;

    if (!tEl) {
      x = W / 2 - TW / 2;
      y = H / 2 - TH / 2;
    } else {
      var r = effectiveRect(tEl, inPreview);
      var rp = padRect(r);
      switch (pos) {
        case "right":
          x = Math.min(W - TW - MARGIN, rp.right + MARGIN);
          y = Math.max(MARGIN, Math.min(H - TH - MARGIN, r.top + r.height / 2 - TH / 2));
          break;
        case "left":
          x = Math.max(MARGIN, rp.left - TW - MARGIN);
          y = Math.max(MARGIN, Math.min(H - TH - MARGIN, r.top + r.height / 2 - TH / 2));
          break;
        case "top":
          x = Math.max(MARGIN, Math.min(W - TW - MARGIN, r.left + r.width / 2 - TW / 2));
          y = Math.max(MARGIN, rp.top - TH - MARGIN);
          break;
        default: /* bottom */
          x = Math.max(MARGIN, Math.min(W - TW - MARGIN, r.left + r.width / 2 - TW / 2));
          y = Math.min(H - TH - MARGIN, rp.bottom + MARGIN);
      }
    }
    tip.style.left = Math.round(x) + "px";
    tip.style.top = Math.round(y) + "px";
  }

  /* --- Close / finish --- */
  function close() {
    clearOverlays();
    document.removeEventListener("keydown", _onKey);
    _active = false;
    _tour = null;
  }

  var FINISH_TOASTS = {
    quick: "Tour complete! Save a View and pin it to Home.",
    jobs: "Tour complete! Try a job on one of your own datasets.",
    connect: "Tour complete! Add a connection, or explore a sample dataset.",
    conservation: "Tour complete! Try a different Region scale on any map in the Dashboard Builder's Inspector."
  };
  function finish() {
    try {
      localStorage.setItem(DONE_KEY, "1");
      if (_tour) localStorage.setItem(DONE_KEY + "-" + _tour, "1");
    } catch (e) {}
    var msg = FINISH_TOASTS[_tour] || "Tutorial complete! Start building your dashboard.";
    close();
    if (window.__fireToast) window.__fireToast(msg);
    // TOUR-FRONT (Kevin live, 2026-07-31): every tour winds up back at the
    // start — the welcome screen — so you can pick another tour or head off
    // and explore, instead of being dropped wherever the last spotlight was.
    if (window.StudioWelcome) StudioWelcome.open();
  }

  function _onKey(e) {
    if (!_active) return;
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    if (!_tour) return; // chooser: arrows don't apply
    if (e.key === "ArrowRight" && _cur < tourSteps(_tour).length - 1) render(_cur + 1);
    if (e.key === "ArrowLeft" && _cur > 0) render(_cur - 1);
  }

  function startTour(key) {
    if (!TOURS[key]) key = "overview";
    _tour = key;
    _cur = 0;
    render(0);
  }

  /* --- Public API --- */
  T.open = function () {
    injectStyle();
    close();
    _active = true;
    document.addEventListener("keydown", _onKey);
    renderChooser();
  };
  T.openTour = function (key) {
    injectStyle();
    close();
    _active = true;
    document.addEventListener("keydown", _onKey);
    startTour(key);
  };

  T.isDone = function () {
    try { return localStorage.getItem(DONE_KEY) === "1"; } catch (e) { return false; }
  };

  /* Exposed for tests */
  T.currentStep = function () { return _cur; };
  T.currentTour = function () { return _tour; };
  T.tourKeys = function () { return TOUR_ORDER.slice(); };
  T.stepCount = function (key) { return tourSteps(key || _tour || "overview").length; };
  T.tourSteps = function (key) { return tourSteps(key || _tour || "overview").slice(); }; // #23 test hook
  window.__studioTutorialActive = function () { return _active; };
  window.__studioTutorialStep = function () { return _cur; };
  window.__studioTutorialTour = function () { return _tour; };
})();
