/* ============================================================================
   exporters.js — turn a Studio spec into a self-contained .html dashboard.
   The same HTML assembler powers the live-preview iframe (preview:true).
   ============================================================================ */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  function xml(s) {
    return Studio.escapeHtml(s);
  }

  /* ---------- CDF (.html) + preview ----------
     assets = { css, js, render, icons }  (text of vendor/pdc-ui.css, vendor/pdc-ui.js,
     app/studio-render.js, app/icons.js — icons is bundled unconditionally, same as charts,
     since studio-charts.js's paginated tables call Studio.icon() for their Prev/Next buttons)
     opts   = { deployPath, preview, mock, launcher } */
  function jsonScript(varName, obj) {
    return varName + " = " + JSON.stringify(obj).replace(/<\//g, "<\\/") + ";";
  }

  // Post-overhaul backlog item 3 ("exported-runtime support for connection-bound datasets"):
  // the four credential-based direct-query connectors (Snowflake/Databricks/BigQuery/Generic
  // SQL) store their secret (access token / auth header) directly on the DA object — fine for
  // the in-builder "Run live" preview, but that same DA object gets JSON.stringify'd whole into
  // every exported/preview HTML as window.STUDIO_SPEC. Left alone, the real secret would sit in
  // plaintext inside a static file anyone with the export can view-source. `redactSecrets` (run
  // against a throwaway deep clone, never the live spec the builder keeps editing) deletes the
  // secret field whenever it was actually set and stamps `needsSecret` with the field name so
  // studio-render.js's PDC.cda dispatch (see its CRED_ENGINES map) knows to prompt for it at
  // open time instead — "credentials prompted at open, never embedded."
  var SECRET_FIELDS = { snowflake: "sfToken", databricks: "dbxToken", bigquery: "bqToken", http: "httpAuthHeader" };
  // Post-overhaul backlog item 3, OTHER half ("connection-bound dataset adapters"): a dataset
  // imported from the connections → datasets model (see GOAL block) always gets da.kind:"sql" —
  // its actual backend and credentials live on a SEPARATE Workspace connection row (da.connectionId),
  // not on the DA itself, so SECRET_FIELDS above (keyed by da.kind) can neither redact it nor tell
  // studio-render.js which engine to dispatch to. Resolving da.connectionId against the live
  // Workspace only works HERE, in the builder — the exported/preview runtime has no Workspace at
  // all — so this stamps what the runtime needs onto the redacted DA: da.connAdapter (which
  // registered source built the connection, e.g. "turso") and a da.connCfg carrying only that
  // adapter's non-secret fields; the secret field is redacted the same way as SECRET_FIELDS above,
  // via needsSecret. Turso shipped first (the reference remote adapter — a single bearer token,
  // no multi-field auth); PostgREST is the second (its token is OPTIONAL — anonymous PostgREST
  // access is a supported, common config — so a connection with no token set never gets stamped
  // with needsSecret, same as any other adapter here whose secret field is blank); Supabase is
  // the third — its anon/publishable `key` is effectively always set (unlike PostgREST's token,
  // Supabase has no supported "anonymous, no key at all" mode), so it always needs the
  // needsSecret treatment in practice, same mechanism as Turso. Google Sheets is the fourth — its
  // `token` is OPTIONAL like PostgREST's (a link-shared sheet needs no auth at all; a PRIVATE
  // sheet's OAuth token was a later follow-up slice, same optional-secret shape). The gating check
  // below still keys off CONN_ADAPTER_CFG_FIELDS (always present for a wired adapter, including
  // gsheets, whose only cfg field is `url`) rather than CONN_ADAPTER_SECRET_FIELD, since a wired
  // adapter with no secret AT ALL (see local files, next) still needs its cfg fields carried.
  // Local files are the fifth adapter and the only one of these six with no secret field — a dropped file has
  // nothing to authenticate, and (unlike every adapter above) no connCfg either: its "connection"
  // is a bare grouping row (adapter:"file", cfg:{}) with nothing worth carrying, since the actual
  // data — fileName/format/content — already rides on da.dataset (dsToDA, app/studio.js) rather
  // than on the connection's cfg. Redshift is the sixth and last — and the first whose secret
  // isn't a single field: AWS SigV4 needs an access key ID + secret access key (plus an optional
  // session token), so CONN_ADAPTER_SECRET_FIELD's value for redshift is an ARRAY of field names
  // instead of a single string; redactSecrets below stamps da.needsSecret with the SUBSET of that
  // array actually set on the connection (sessionToken is optional, so a connection using
  // permanent IAM-user credentials never gets prompted for one), and studio-render.js's
  // resolveSecret prompts once per field, returning an object CONN_ENGINES.redshift.cfg merges
  // straight into da.connCfg (its keys already match the connector's own cfg field names).
  // Google Sheets FOLLOW-UP (shipped): a gsheets connection's `token` (OAuth access token, for a
  // PRIVATE sheet) is OPTIONAL exactly like PostgREST's — a link-shared sheet still has none set,
  // so it's never stamped with needsSecret, same as an anonymous PostgREST connection.
  var CONN_ADAPTER_SECRET_FIELD = { turso: "token", postgrest: "token", supabase: "key", gsheets: "token", redshift: ["accessKeyId", "secretAccessKey", "sessionToken"] };
  var CONN_ADAPTER_CFG_FIELDS = { turso: ["url"], postgrest: ["url", "schema"], supabase: ["url"], gsheets: ["url"], file: [], redshift: ["region", "database", "clusterIdentifier", "dbUser", "workgroupName", "endpoint"] };
  // LF36 slice 2: PDF export page-size options — CSS @page `size` keyword + physical inches
  // (letter/A4/legal, US-common set; matches what the export dialog in studio.js offers).
  var PDF_PAGE_SIZE_KEYWORDS = { letter: "letter", a4: "A4", legal: "legal" };
  var PDF_PAGE_DIMS_IN = { letter: [8.5, 11], a4: [8.27, 11.69], legal: [8.5, 14] };
  var PDF_PAGE_MARGIN_IN = 12 / 25.4; // matches the @page{margin:12mm} rule below
  function redactSecrets(spec) {
    var das = spec && spec.cda && spec.cda.dataAccesses;
    if (!das || !das.length) return spec;
    var clone = JSON.parse(JSON.stringify(spec));
    (clone.cda.dataAccesses || []).forEach(function (da) {
      var field = SECRET_FIELDS[da.kind];
      if (field && da[field]) { delete da[field]; da.needsSecret = field; }
      if (da.connectionId && Studio.Workspace) {
        var conn = Studio.Workspace.get("connections", da.connectionId);
        var cfgFields = conn && CONN_ADAPTER_CFG_FIELDS[conn.adapter];
        var secretField = conn && CONN_ADAPTER_SECRET_FIELD[conn.adapter];
        if (conn && cfgFields) {
          da.connAdapter = conn.adapter;
          da.connCfg = {};
          cfgFields.forEach(function (f) { da.connCfg[f] = (conn.cfg || {})[f]; });
          if (Array.isArray(secretField)) {
            var setFields = secretField.filter(function (f) { return (conn.cfg || {})[f]; });
            if (setFields.length) da.needsSecret = setFields;
          } else if (secretField && (conn.cfg || {})[secretField]) {
            da.needsSecret = secretField;
          }
        }
      }
    });
    return clone;
  }
  Studio.buildHtml = function (spec, assets, opts) {
    opts = opts || {};
    // N-DEV: dashboard templates/variables — resolve {{key}} tokens in the banner text once, here,
    // so both the live preview and every real export (they both funnel through this one function)
    // substitute identically with no separate wiring.
    var titleText = Studio.applyTemplateVars(spec.title, spec.templateVars);
    var subtitleText = Studio.applyTemplateVars(spec.subtitle, spec.templateVars);
    var deployPath = opts.deployPath || "/public/pdc-iteration/v2";
    var cdaPath = deployPath + "/" + spec.name + ".cda"; // legacy id namespace for PDC.cdaPath; nothing fetches it
    // The old "All dashboards" launcher linked into a Pentaho repo listing — gone with Pentaho.
    var launcher = "";
    var mobileCss =
      "\n@media(max-width:640px){" +
      ".pdc-header{flex-wrap:wrap;padding:8px 12px;gap:5px 8px;min-height:0}" +
      ".pdc-sub{display:none}" +
      ".pdc-wrap{padding:10px 10px 36px}" +
      ".pdc-kpis{gap:8px;margin-bottom:10px}" +
      ".pdc-brand{font-size:14px;gap:8px}" +
      ".pdc-logo{width:24px;height:24px;font-size:13px}" +
      ".pdc-iconbtn,.pdc-toggle button{font-size:11.5px;padding:5px 9px}" +
      "}";
    // Section header dividers — included in every CDF export and preview iframe.
    // .pdc-sec-hdr appears between panel grids when panels carry a `section` label.
    var sectionCss =
      ".pdc-sec-hdr{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;" +
      "color:var(--text-muted,#6b7a99);padding:12px 0 4px;margin-top:2px;border-bottom:1px solid var(--panel-border,#e0e4ef)}";
    // Dashboard description bar — shown below KPIs when spec.description is non-empty.
    var descCss =
      ".pdc-desc-bar{margin:0 0 14px;padding:10px 16px;background:var(--panel-subtle-bg,rgba(0,91,181,.06));" +
      "border-left:3px solid var(--pentaho,#005bb5);border-radius:0 6px 6px 0;" +
      "font-size:13px;color:var(--text-secondary,#3a4560);line-height:1.6}";
    // Panel note — visible annotation line between the card header and chart body.
    var panelNoteCss =
      ".pdc-panel-note{font-size:11.5px;color:var(--text-muted,#6b7a99);line-height:1.5;" +
      "padding:3px 14px 5px;margin:0;border-left:2px solid var(--panel-border,#e0e4ef);" +
      "background:var(--panel-subtle-bg,rgba(0,91,181,.04));font-style:italic}";
    // Per-panel accent color — a colored left border for multi-subject dashboard differentiation.
    // .pdc-accent-panel + --pap-color CSS variable are set by studio-render.js when p.accentColor is set.
    var panelAccentCss =
      ".pdc-accent-panel{border-left:3px solid var(--pap-color,#005bb5)!important}";
    // LF6: per-panel download chrome (image + data). Unconditional (unlike previewCss below) so
    // it renders identically in the live preview iframe AND the exported/embedded HTML — the
    // preview-only .sr-card-acts row (zoom/dup/del) reuses .pdc-dl-act for a matching look when
    // studio-render.js appends these buttons into that same row; export gets its own top-right
    // .pdc-dl-acts container at the same spot since .sr-card-acts isn't there to share.
    var dlActsCss =
      ".pdc-dl-act{width:20px;height:20px;border-radius:5px;border:1px solid var(--panel-border);background:var(--panel-bg);" +
      "color:var(--text-muted);font-size:13px;line-height:1;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center}" +
      ".pdc-dl-act:hover{color:var(--pentaho);border-color:var(--pentaho)}" +
      ".pdc-dl-acts{position:absolute;top:7px;right:11px;display:flex;gap:3px;opacity:0;transition:opacity .12s;z-index:8}" +
      ".card:hover .pdc-dl-acts{opacity:1}" +
      // LF69(d): PNG/CSV/standalone-HTML collapse into one "Export ▾" trigger + popover
      // menu instead of up to 3 row buttons. .pdc-dl-trigger gets the same square
      // icon-button look as .pdc-dl-act; .pdc-dl-item (an actual .pdc-dl-act, now a menu
      // row) overrides back to an auto-width labeled row.
      ".pdc-dl-menu{position:relative;display:flex}" +
      ".pdc-dl-trigger{width:20px;height:20px;border-radius:5px;border:1px solid var(--panel-border);background:var(--panel-bg);" +
      "color:var(--text-muted);cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;gap:1px}" +
      ".pdc-dl-trigger:hover,.pdc-dl-menu.open .pdc-dl-trigger{color:var(--pentaho);border-color:var(--pentaho)}" +
      ".pdc-dl-pop{position:absolute;top:24px;right:0;display:none;flex-direction:column;gap:2px;min-width:196px;" +
      "padding:4px;background:var(--panel-bg);border:1px solid var(--panel-border);border-radius:8px;" +
      "box-shadow:0 6px 20px rgba(0,0,0,.22);z-index:20}" +
      ".pdc-dl-menu.open .pdc-dl-pop{display:flex}" +
      ".pdc-dl-item{width:auto!important;height:auto!important;justify-content:flex-start;gap:8px;" +
      "padding:6px 10px!important;font-size:12px;white-space:nowrap;text-align:left}" +
      ".pdc-dl-item:hover{background:var(--panel-header-bg,rgba(127,127,127,.14))}" +
      "@media(pointer:coarse){.pdc-dl-acts{opacity:.85!important}.pdc-dl-act:not(.pdc-dl-item),.pdc-dl-trigger{width:32px;height:32px}}";
    // Richtext panel styles — included in every exported CDF and in the preview iframe.
    // Target line — horizontal dashed reference overlay (target, budget, threshold, etc.)
    // Positioned absolutely within the chart body (card.body gets position:relative via JS).
    var targetLineCss =
      ".pdc-target-line{position:absolute;left:12px;right:8px;border-top:2px dashed;pointer-events:none;z-index:3}" +
      ".pdc-target-label{position:absolute;right:0;top:-18px;font-size:10px;font-weight:700;" +
      "white-space:nowrap;background:transparent;padding:0 4px;letter-spacing:.01em;font-family:inherit}";
    // Reference band — shaded range overlay between topPct and bottomPct (visual %, 0=chart top).
    // Fill color uses rgba (set inline) so the band is translucent; label is full opacity on top.
    var refBandCss =
      ".pdc-ref-band{position:absolute;left:12px;right:8px;pointer-events:none;z-index:2;border-radius:2px}" +
      ".pdc-ref-label{position:absolute;right:4px;top:3px;font-size:9.5px;font-weight:700;" +
      "white-space:nowrap;letter-spacing:.01em;font-family:inherit}";
    // Callout arrow — inline SVG overlay; only the container positioning is needed in CSS.
    var calloutCss =
      ".pdc-callout{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:4;overflow:visible}";
    // Period highlight — vertical x-range band for line/bar/area charts.
    // Fill color is applied inline as rgba; dashed left/right borders mark the edges clearly.
    // Label sits at the top-left inside the band in the border color at full opacity.
    var periodHighlightCss =
      ".pdc-period{position:absolute;top:0;height:100%;pointer-events:none;z-index:2;box-sizing:border-box}" +
      ".pdc-period-label{position:absolute;left:4px;top:3px;font-size:9.5px;font-weight:700;" +
      "white-space:nowrap;letter-spacing:.01em;font-family:inherit}";
    // Event markers — named vertical dashed tick lines for line/bar/area charts.
    // The marker line spans the full chart body height; label sits above (top:0) on the left of the line.
    var eventMarkerCss =
      ".pdc-event-mark{position:absolute;top:0;height:100%;pointer-events:none;z-index:3;border-left:2px dashed;box-sizing:border-box;width:0}" +
      ".pdc-event-mark-label{position:absolute;left:4px;top:0;font-size:9.5px;font-weight:700;" +
      "white-space:nowrap;letter-spacing:.01em;font-family:inherit}";
    // Scatter point annotations — colored text labels at visual (x%,y%) positions on a scatter plot.
    // The dot indicator pinpoints the annotated region; the text box shows the label.
    var scatterAnnotCss =
      ".pdc-pt-annot{position:absolute;pointer-events:none;z-index:4;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center}" +
      ".pdc-pt-annot-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-bottom:3px}" +
      ".pdc-pt-annot-txt{font-size:9.5px;font-weight:700;white-space:nowrap;border-radius:3px;padding:1px 5px;font-family:inherit;line-height:1.4}";
    var kpiSubCss =
      ".kpi-sub{font-size:10.5px;color:var(--text-muted,#9aa7b8);margin-top:3px;line-height:1.3;font-style:italic;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}";
    var richtextCss =
      ".sr-richtext{padding:8px 12px;line-height:1.65;color:var(--text-primary);font-size:13.5px;overflow:auto}" +
      ".sr-richtext h1{font-size:1.4em;font-weight:800;margin:.4em 0 .2em;color:var(--text-primary)}" +
      ".sr-richtext h2{font-size:1.2em;font-weight:700;margin:.4em 0 .2em;color:var(--text-primary)}" +
      ".sr-richtext h3,.sr-richtext h4{font-size:1em;font-weight:700;margin:.4em 0 .15em;color:var(--text-secondary)}" +
      ".sr-richtext p{margin:.25em 0}" +
      ".sr-richtext ul{margin:.25em 0 .25em 1.2em;padding:0}" +
      ".sr-richtext code{background:var(--field);border-radius:3px;padding:1px 5px;font-size:.88em}" +
      ".sr-richtext hr{border:0;border-top:1px solid var(--panel-border);margin:.5em 0}" +
      ".sr-rt-placeholder{color:var(--faint);font-style:italic;font-size:12px}";
    // ★★ Visual refresh (A): full dashboard theme — overrides the WHOLE pdc-ui.css token set
    // (bg/panel/text hierarchy + brand + series) in one pass when spec.dashboardTheme picks a
    // non-classic preset (see Studio.DASHBOARD_THEMES). Emitted BEFORE the finer-grained
    // themeColor/headerBg/paletteKey overrides below so a per-dashboard tweak on top of a theme
    // still wins (later declaration, same :root/[data-theme='dark'] specificity).
    var dashboardThemeCss = "";
    if (spec.dashboardTheme && spec.dashboardTheme !== "classic") {
      // Theme studio: "custom" has no Studio.DASHBOARD_THEMES registry entry — its light/dark
      // token sets are derived from the author's own seed colors (spec.customTheme) instead.
      var _dt = spec.dashboardTheme === "custom"
        ? (spec.customTheme && Studio.deriveCustomTheme(spec.customTheme))
        : (Studio.DASHBOARD_THEMES || []).filter(function (t) { return t.key === spec.dashboardTheme; })[0];
      if (_dt && _dt.light) {
        var _dtLight = Object.keys(_dt.light).map(function (k) { return k + ":" + _dt.light[k]; }).join(";");
        var _dtDark  = Object.keys(_dt.dark).map(function (k) { return k + ":" + _dt.dark[k]; }).join(";");
        dashboardThemeCss = "\n:root{" + _dtLight + "}\n[data-theme='dark']{" + _dtDark + "}";
      }
    }
    // Per-dashboard accent color: override --pentaho CSS variable when spec.themeColor is set.
    // The override is appended last so it wins over the base palette in pdc-ui.css (same :root
    // specificity; last-declaration-wins within one stylesheet).
    var themeColorCss = spec.themeColor ? "\n:root{--pentaho:" + spec.themeColor + "}" : "";
    // Z6: per-dashboard header logo. .pdc-logo in pdc-ui.css is styled for the default "P" <span>
    // (gradient background, centered bold letter) — an <img> needs object-fit so a non-square
    // upload still fills the 30x30 badge cleanly instead of stretching/tiling.
    var headerLogoCss = spec.headerLogo ? "\nimg.pdc-logo{object-fit:cover;background:var(--panel-bg)}" : "";
    // Z6: header link — .pdc-brand is a <div> normally; when wrapped in an <a> it needs the link
    // underline/color reset so it still reads as plain brand chrome, not a text link.
    var headerLinkCss = spec.headerLink ? "\na.pdc-brand{color:inherit;text-decoration:none;cursor:pointer}" : "";
    // Z6: per-dashboard header background color — flat fill (not the default navy gradient) with
    // an auto-contrasting text color (Studio.contrastFg) so a light pick doesn't go invisible-on-white.
    var headerBgCss = spec.headerBg ?
      "\n.pdc-header{background:" + spec.headerBg + ";color:" + Studio.contrastFg(spec.headerBg) + "}" : "";
    // Z6: banner title size — overrides .pdc-title's inherited font-size (17px, from .pdc-brand)
    // without touching the vendored pdc-ui.css default.
    var titleSizeCss = (spec.titleSize && Studio.TITLE_SIZE_PX[spec.titleSize]) ?
      "\n.pdc-title{font-size:" + Studio.TITLE_SIZE_PX[spec.titleSize] + "}" : "";
    // Header off (embed mode): hide the whole title banner + the description bar so the
    // exported HTML shows ONLY the KPIs and widgets — ready to drop inside another page's
    // chrome. Done via CSS (not by removing the nodes) so the runtime JS that references
    // #ctrls/#themeBtn/#qInfoBtn never trips, and preview == export stays byte-identical.
    var hideHeaderCss = spec.hideHeader ?
      "\n.pdc-header{display:none}\n.pdc-desc-bar{display:none}\n.pdc-wrap{padding-top:16px}" : "";
    // Z6: subtitle style — .pdc-sub defaults to font-weight:500, not italic (vendor pdc-ui.css).
    var subtitleStyleCss = "";
    if (spec.subtitleStyle === "italic") subtitleStyleCss = "\n.pdc-sub{font-style:italic}";
    else if (spec.subtitleStyle === "bold") subtitleStyleCss = "\n.pdc-sub{font-weight:800}";
    else if (spec.subtitleStyle === "bold-italic") subtitleStyleCss = "\n.pdc-sub{font-weight:800;font-style:italic}";
    // N-DESIGN "chart skins": "flat" strips the raised shadow/glass-edge/hover-lift .card and
    // .kpi already carry (vendor/pdc-ui.css) for a quieter, editorial-minimal mood; "sketch"
    // (follow-up) swaps the shadow for a dashed border + an asymmetric, hand-wobbled radius
    // instead — a whimsical mood distinct from both Raised and Flat. Both are pure CSS
    // overrides, no markup change, so they apply uniformly in preview + every export.
    var cardSkinCss = spec.cardSkin === "flat" ?
      "\n.card,.kpi{box-shadow:none;border:1px solid var(--panel-border)}" +
      "\n.card:hover,.kpi:hover{transform:none;box-shadow:none}" :
      spec.cardSkin === "sketch" ?
      "\n.card,.kpi{box-shadow:none;border:2px dashed var(--panel-border);border-radius:18px 7px 18px 7px/7px 18px 7px 18px}" +
      "\n.card:hover,.kpi:hover{box-shadow:none}" : "";
    // Series palette preset: override --c1..--c10 for both light and dark mode.
    // paletteKey "default" or blank → keep pdc-ui.css colors; any other key bakes in
    // the preset's color arrays so the exported CDF always renders with the chosen palette.
    var paletteCss = "";
    if (spec.paletteKey && spec.paletteKey !== "default") {
      var _pp = (Studio.PALETTE_PRESETS || []).filter(function (p) { return p.key === spec.paletteKey; })[0];
      if (_pp && _pp.light) {
        var _lv = _pp.light.map(function (c, i) { return "--c" + (i + 1) + ":" + c; }).join(";");
        var _dv = _pp.dark.map(function (c, i)  { return "--c" + (i + 1) + ":" + c; }).join(";");
        paletteCss = "\n:root{" + _lv + "}\n[data-theme='dark']{" + _dv + "}";
      }
    }
    // LF35 slice 1: choropleth GL panels set cfg.mapControls "compact" per-panel (studio-charts.js
    // adds the .pdc-geo-compact class to that panel's map wrap only) — a transform-scale on
    // MapLibre's own control container shrinks the zoom+pan cluster uniformly without touching
    // its internal markup/CSS. Always included (inert unless a panel opts in), same as every
    // other unconditional small CSS rule in this bundle.
    // LF35 slice 2: mapControlsPos (studio-charts.js) can dock that same cluster in any of
    // MapLibre's four corner containers, so the compact scale needs a rule (with a matching
    // transform-origin, so it shrinks toward its own corner) per corner, not just top-right.
    var geoCtrlCss = "\n.pdc-geo-compact .maplibregl-ctrl-top-right{transform:scale(.72);transform-origin:top right}" +
      "\n.pdc-geo-compact .maplibregl-ctrl-top-left{transform:scale(.72);transform-origin:top left}" +
      "\n.pdc-geo-compact .maplibregl-ctrl-bottom-right{transform:scale(.72);transform-origin:bottom right}" +
      "\n.pdc-geo-compact .maplibregl-ctrl-bottom-left{transform:scale(.72);transform-origin:bottom left}";
    // Print / PDF layout: static header, hide interactive controls, avoid card page breaks.
    // Applied only in exported CDF (not the in-builder preview where printing makes no sense).
    // LF36 slice 1: @page sets sane print margins (browsers default to ~0 or huge depending on
    // engine) and orphans/widows keeps text-heavy panels (the dashboard description bar + any
    // richtext panel's paragraphs/list items — .sr-richtext is the same class the builder preview
    // uses, see richtextCss above) from stranding a single line at a page break. break-inside:avoid
    // on .card/.pdc-kpis (unchanged) is what actually keeps a widget/KPI row from splitting across
    // a page boundary.
    // LF36 slice 2: page size + orientation ride the standard CSS @page `size` keyword (opts.
    // pdfPageSize/pdfOrientation, set by the PDF export dialog in studio.js's doExport — the plain
    // "cdf"/"spec"/"all" exports never pass these, so their @page rule (and everything else here)
    // stays byte-identical to before this slice.
    var pageSizeCss = opts.pdfPageSize ?
      ";size:" + (PDF_PAGE_SIZE_KEYWORDS[opts.pdfPageSize] || "letter") + (opts.pdfOrientation === "landscape" ? " landscape" : " portrait") : "";
    var printCss = !opts.preview ?
      "\n@media print{" +
        "@page{margin:12mm" + pageSizeCss + "}" +
        ".pdc-header{position:static!important;box-shadow:none!important;border-bottom:1px solid #d0d4da}" +
        "#qInfoBtn,#printBtn,#ctrls{display:none!important}" +
        "body{background:#fff!important;color:#000!important}" +
        ".pdc-wrap{padding:12px 16px}" +
        ".pdc-grid{gap:12px}" +
        ".card{break-inside:avoid;box-shadow:none;border:1px solid #d0d4da}" +
        ".pdc-kpis{break-inside:avoid}" +
        ".pdc-desc-bar,.sr-richtext p,.sr-richtext li{orphans:3;widows:3}" +
        "}" : "";
    var previewCss = opts.preview ?
      "\n.sr-sel{cursor:pointer}.sr-sel:hover{outline:2px dashed var(--pentaho);outline-offset:2px}" +
      ".sr-active{outline:2px solid var(--pdc)!important;outline-offset:2px;box-shadow:0 0 0 4px color-mix(in srgb,var(--pdc) 22%,transparent)}" +
      ".sr-grip{cursor:grab;color:var(--text-faint);margin-right:3px;font-size:13px;letter-spacing:-2px;user-select:none;line-height:1}" +
      ".sr-grip:hover{color:var(--pdc)}.sr-grip:active{cursor:grabbing}" +
      ".card>h3{cursor:grab;touch-action:none}" +
      ".sr-resize{position:absolute;top:42px;right:0;bottom:0;width:10px;cursor:ew-resize;z-index:6;touch-action:none}" +
      ".sr-resize:hover{background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--pentaho) 32%,transparent))}" +
      ".sr-dragging{opacity:.4}" +
      ".sr-caret{position:absolute;width:3px;background:var(--pdc);border-radius:2px;pointer-events:none;z-index:7;box-shadow:0 0 0 2px color-mix(in srgb,var(--pdc) 28%,transparent);transition:left .07s ease,top .07s ease,height .07s ease}" +
      ".sr-ghost{position:fixed;pointer-events:none;z-index:99999;background:var(--pdc);color:#fff;font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:7px;box-shadow:0 8px 24px rgba(0,0,0,.32);opacity:.96;white-space:nowrap}" +
      ".sr-rename{font:inherit;font-weight:700;font-size:13.5px;border:1px solid var(--pdc);border-radius:5px;padding:1px 6px;outline:none;color:var(--text-primary);background:var(--panel-bg);min-width:120px;max-width:90%}" +
      ".sr-empty{max-width:520px;margin:8vh auto;text-align:center;padding:38px 28px;border:2px dashed var(--panel-border);border-radius:18px;background:var(--panel-subtle-bg)}" +
      ".sr-empty-ic{font-size:42px;color:var(--pentaho);opacity:.55;line-height:1}" +
      ".sr-empty-t{font-size:18px;font-weight:800;margin:14px 0 6px;color:var(--text-primary)}" +
      ".sr-empty-s{font-size:13.5px;color:var(--text-muted);line-height:1.6}.sr-empty-s b{color:var(--pentaho)}" +
      ".kpi .sr-kpi-del{position:absolute;top:6px;right:7px;width:20px;height:20px;border-radius:5px;border:1px solid var(--panel-border);background:var(--panel-bg);color:var(--text-muted);font-size:13px;line-height:1;cursor:pointer;opacity:0;transition:opacity .12s;padding:0;display:flex;align-items:center;justify-content:center}" +
      ".kpi:hover .sr-kpi-del{opacity:1}.kpi .sr-kpi-del:hover{color:var(--bad,#e0395e);border-color:var(--bad,#e0395e)}" +
      ".sr-card-acts{position:absolute;top:7px;right:11px;display:flex;gap:3px;opacity:0;transition:opacity .12s;z-index:8}" +
      ".card:hover .sr-card-acts{opacity:1}" +
      ".sr-act{width:20px;height:20px;border-radius:5px;border:1px solid var(--panel-border);background:var(--panel-bg);color:var(--text-muted);font-size:13px;line-height:1;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center}" +
      ".sr-act:hover{color:var(--pentaho);border-color:var(--pentaho)}.sr-act[data-act=del]:hover{color:var(--bad,#e0395e);border-color:var(--bad,#e0395e)}" +
      // Header text objects (title · subtitle · description) are editable on the canvas:
      // double-click to edit inline, and the description carries a ✕ to remove it. These are
      // preview-only affordances — the exported header is untouched (byte-identical parity).
      ".sr-head-edit{cursor:text;border-radius:5px;transition:box-shadow .12s}" +
      ".sr-head-edit:hover{box-shadow:0 0 0 2px color-mix(in srgb,var(--pentaho) 34%,transparent)}" +
      ".pdc-desc-bar.sr-desc{position:relative;padding-right:34px}" +
      ".sr-desc-del{position:absolute;top:50%;right:8px;transform:translateY(-50%);width:20px;height:20px;border-radius:5px;border:1px solid var(--panel-border);background:var(--panel-bg);color:var(--text-muted);font-size:13px;line-height:1;cursor:pointer;opacity:0;transition:opacity .12s;padding:0;display:flex;align-items:center;justify-content:center}" +
      ".sr-desc:hover .sr-desc-del{opacity:1}.sr-desc-del:hover{color:var(--bad,#e0395e);border-color:var(--bad,#e0395e)}" +
      // LF21: the header bar itself is now a selectable canvas object (click it → Inspector's
      // "Header" view) with its own ✕ affordance, mirroring the KPI tile / description patterns
      // above — preview-only, so the exported header markup is unaffected (byte-identical).
      ".pdc-header.sr-header-sel{cursor:pointer}" +
      ".sr-head-del{width:22px;height:22px;border-radius:5px;border:1px solid var(--panel-border);background:var(--panel-bg);color:var(--text-muted);font-size:13px;line-height:1;cursor:pointer;padding:0;flex-shrink:0;display:flex;align-items:center;justify-content:center}" +
      ".sr-head-del:hover{color:var(--bad,#e0395e);border-color:var(--bad,#e0395e)}" +
      "@media(pointer:coarse){.card>h3{min-height:48px}.sr-card-acts{opacity:1!important}.sr-act{width:36px;height:36px}.sr-kpi-del{opacity:.85!important;width:24px;height:24px}.sr-desc-del{opacity:.85!important;width:26px;height:26px}}" : "";
    // LF20: the dashboard's own light/dark is now a fixed, persisted per-dashboard Inspector
    // option (spec.renderMode) instead of a runtime toggle button inside the rendered header —
    // baked straight onto <html> here so both the export and the live preview open already in
    // the author's chosen mode, with zero interactive theme control left in the rendered content.
    var htmlOpenTag = "<html lang=\"en\"" + (spec.renderMode === "dark" ? " data-theme=\"dark\"" : "") + ">";
    var head =
      "<!DOCTYPE html>\n" + htmlOpenTag + "\n<head>\n<meta charset=\"utf-8\"/>\n" +
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>\n" +
      "<title>" + xml(titleText) + " — Analytics</title>\n<style>\n" + assets.css + mobileCss + sectionCss + descCss + panelNoteCss + panelAccentCss + dlActsCss + targetLineCss + refBandCss + calloutCss + periodHighlightCss + eventMarkerCss + scatterAnnotCss + kpiSubCss + richtextCss + dashboardThemeCss + themeColorCss + headerLogoCss + headerLinkCss + headerBgCss + titleSizeCss + hideHeaderCss + subtitleStyleCss + cardSkinCss + paletteCss + geoCtrlCss + printCss + previewCss + "\n</style>\n</head>\n";
    var logoHtml = spec.headerLogo ?
      "<img class=\"pdc-logo\" src=\"" + xml(spec.headerLogo) + "\" alt=\"\"/>" :
      "<span class=\"pdc-logo\">P</span>";
    // Z6: an optional header link wraps the brand mark+title in an <a> (opens in a new tab) —
    // e.g. back to a company site or portal. Plain <span>s when unset (the common case).
    var brandInner = logoHtml + "<span class=\"pdc-title\">" + xml(titleText) + "</span>";
    var brandHtml = spec.headerLink ?
      "<a class=\"pdc-brand\" href=\"" + xml(spec.headerLink) + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + brandInner + "</a>" :
      "<div class=\"pdc-brand\">" + brandInner + "</div>";
    var body =
      "<body>\n<header class=\"pdc-header\">\n" +
      "  " + brandHtml + "\n" +
      "  <div class=\"pdc-sub\">" + xml(subtitleText || "") + "</div>\n  <div class=\"spacer\"></div>\n" +
      "  <div class=\"pdc-ctrls\" id=\"ctrls\"></div>\n" +
      "  <button class=\"pdc-iconbtn\" id=\"qInfoBtn\" title=\"View the datasets behind this dashboard\" aria-label=\"View the datasets behind this dashboard\" onclick=\"PDC.queryModal()\">&#9432;</button>\n" +
      (!opts.preview ? "  <button class=\"pdc-iconbtn\" id=\"printBtn\" title=\"Print / save as PDF\" aria-label=\"Print or save as PDF\" onclick=\"window.print()\"><svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><rect x='6' y='9' width='12' height='9' rx='1'/><path d='M7 9V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v4'/><path d='M7 17v2a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2'/><circle cx='9' cy='13.5' r='1' fill='currentColor' stroke='none'/></svg></button>\n" : "") +
      "  " + launcher + "\n</header>\n" +
      "<div class=\"pdc-wrap\">\n  <div class=\"pdc-kpis\" id=\"kpis\"></div>\n" +
      (spec.description ? "  <div class=\"pdc-desc-bar\">" + xml(spec.description) + "</div>\n" : "") +
      "  <div id=\"content\"><div class=\"loading\">Loading…</div></div>\n" +
      "</div>\n";
    // UX6: icons.js must load before charts.js so the pagination Prev/Next buttons' Studio.icon()
    // calls (studio-charts.js) resolve — bundled unconditionally, matching charts' own bundling.
    var iconsScript = assets.icons ? ("<script>\n" + assets.icons + "\n</script>\n") : "";
    var charts = assets.charts ? ("<script>\n" + assets.charts + "\n</script>\n") : "";
    // Z14 architecture-gap fix: bundle the DuckDB-Wasm / SQLite-WASM-HTTP connector façades into
    // the export ONLY when the dashboard actually has a data access of that kind — their wasm
    // engines are lazy-loaded from a CDN at query time regardless (see app/duckdb.js/sqlitehttp.js),
    // but there's no reason to add even these small façade files to a dashboard that doesn't use
    // one. This is what lets studio-render.js's PDC.cda dispatch actually answer a duckdb/httpvfs
    // DA once exported/deployed, instead of falling through to a data call that 404s.
    // Computed once, early: the SAME redacted clone both decides which live-query façades to
    // bundle below AND is what actually gets embedded as window.STUDIO_SPEC at the bottom of this
    // function — so the connAdapter/connCfg stamping in redactSecrets and the bundling decision
    // here never see two different views of the same dashboard.
    var redacted = redactSecrets(spec);
    var daKinds = {}, connAdapters = {};
    ((redacted.cda && redacted.cda.dataAccesses) || []).forEach(function (d) {
      if (d.kind) daKinds[d.kind] = 1;
      if (d.connAdapter) connAdapters[d.connAdapter] = 1;
    });
    var duckdbScript = (daKinds.duckdb && assets.duckdb) ? ("<script>\n" + assets.duckdb + "\n</script>\n") : "";
    var httpvfsScript = (daKinds.httpvfs && assets.httpvfs) ? ("<script>\n" + assets.httpvfs + "\n</script>\n") : "";
    // Post-overhaul backlog item 3 follow-up: same lean-bundling pattern as duckdb/httpvfs above,
    // now covering the four credential-based direct connectors (see redactSecrets above + the
    // studio-render.js PDC.cda dispatch that answers these DA kinds once deployed).
    var snowflakeScript = (daKinds.snowflake && assets.snowflake) ? ("<script>\n" + assets.snowflake + "\n</script>\n") : "";
    var databricksScript = (daKinds.databricks && assets.databricks) ? ("<script>\n" + assets.databricks + "\n</script>\n") : "";
    var bigqueryScript = (daKinds.bigquery && assets.bigquery) ? ("<script>\n" + assets.bigquery + "\n</script>\n") : "";
    var genericsqlScript = (daKinds.http && assets.genericsql) ? ("<script>\n" + assets.genericsql + "\n</script>\n") : "";
    // Post-overhaul backlog item 3, other half: the connection-bound Turso façade, bundled only
    // when this dashboard actually has a connAdapter:"turso" DA (see redactSecrets above).
    var tursoScript = (connAdapters.turso && assets.turso) ? ("<script>\n" + assets.turso + "\n</script>\n") : "";
    // Same lean-bundling pattern, now for a connAdapter:"postgrest" DA.
    var postgrestScript = (connAdapters.postgrest && assets.postgrest) ? ("<script>\n" + assets.postgrest + "\n</script>\n") : "";
    // Same lean-bundling pattern, now for a connAdapter:"supabase" DA.
    var supabaseScript = (connAdapters.supabase && assets.supabase) ? ("<script>\n" + assets.supabase + "\n</script>\n") : "";
    // Same lean-bundling pattern, now for a connAdapter:"gsheets" DA.
    var gsheetsScript = (connAdapters.gsheets && assets.gsheets) ? ("<script>\n" + assets.gsheets + "\n</script>\n") : "";
    // Same lean-bundling pattern, now for a connAdapter:"file" DA (a dropped local file).
    var fileScript = (connAdapters.file && assets.file) ? ("<script>\n" + assets.file + "\n</script>\n") : "";
    // Same lean-bundling pattern, now for a connAdapter:"redshift" DA — closes out this whole
    // backlog item (all six connection-bound adapters now have an exported-runtime path). sigv4.js
    // must load first: app/redshift.js's callAction() calls Studio.AwsSigV4.sign() to sign every
    // request.
    var sigv4Script = (connAdapters.redshift && assets.sigv4) ? ("<script>\n" + assets.sigv4 + "\n</script>\n") : "";
    var redshiftScript = (connAdapters.redshift && assets.redshift) ? ("<script>\n" + assets.redshift + "\n</script>\n") : "";
    // Viridis V2: map panels — inline topojson-client (keep its ISC banner: it is
    // redistributed inside the export) + the pre-projected geometry the spec's
    // scales need, as window.STUDIO_GEO. Dashboards without maps carry none of it.
    var geoScript = "";
    var geoKeys = Studio.geoAssetKeys(spec);
    if (geoKeys.length && assets.topojson && assets.geo) {
      var geoParts = geoKeys.filter(function (k) { return assets.geo[k]; })
        .map(function (k) { return JSON.stringify(k) + ":" + assets.geo[k]; });
      geoScript = "<script>\n" + assets.topojson + "\n</script>\n" +
        "<script>window.STUDIO_GEO = {" + geoParts.join(",") + "};</script>\n";
    }
    // Viridis V4: a spec with a GL-renderer map panel carries MapLibre inside the
    // export (opt-in weight); SVG-only maps stay lean. The bundle contains no
    // "</script>" sequences, so direct inlining is safe (same as topojson above).
    if (Studio.usesGLMap && Studio.usesGLMap(spec) && assets.maplibre) {
      geoScript += "<style>\n" + assets.maplibre.css + "\n</style>\n" +
        "<script>\n" + assets.maplibre.js + "\n</script>\n";
    }
    var boot = "<script>\n" + assets.js + "\n</script>\n" + iconsScript + charts + geoScript + duckdbScript + httpvfsScript +
      snowflakeScript + databricksScript + bigqueryScript + genericsqlScript + tursoScript + postgrestScript + supabaseScript + gsheetsScript + fileScript + sigv4Script + redshiftScript + "<script>\n" + assets.render + "\n</script>\n<script>\n" +
      "window.STUDIO_AUTOBOOT=false;\n" +
      "PDC.cdaPath=" + JSON.stringify(cdaPath) + ";\nvar CDAPATH=PDC.cdaPath;\n";
    if (opts.preview) {
      boot += "window.STUDIO_PREVIEW=true;\n" + jsonScript("window.PDC_MOCK", opts.mock || {}) + "\n";
    } else if (opts.mock) {
      // LF23 (viewer #106): embed a PDC_MOCK WITHOUT setting window.STUDIO_PREVIEW. The viewer
      // renders/exports real dashboards (preview:false) so credentialed + connection engines stay
      // live (studio-render.js gates those on !STUDIO_PREVIEW), but a SAMPLE-only data access has
      // no real engine and would otherwise fall through to the retired CDA server endpoint → 404.
      // viewer.js passes a mock covering ONLY those sample DAs, so real data accesses are never
      // shadowed (PDC.cda prefers PDC_MOCK[id] when present) — this branch just makes that mock
      // available on a non-preview build. Empty/absent mock (every other preview:false caller —
      // exportCDF, the PDF path) leaves PDC_MOCK undefined exactly as before.
      boot += jsonScript("window.PDC_MOCK", opts.mock) + "\n";
    }
    // V9 (scientific-honesty polish): "Last updated" per data access, resolved HERE
    // (the one place both the live builder context and the static export funnel
    // through) from the workspace dataset's own updatedAt — which a job run already
    // bumps on materialization (Studio.Workspace.put stamps every mutation), so a
    // job-output dataset's timestamp is exactly "when this was last (re)loaded". A
    // separate global (not a field stamped onto spec.cda.dataAccesses) so this derived,
    // point-in-time value never gets saved back into a dashboard's persisted spec.
    var daMeta = {};
    if (Studio.Workspace) {
      ((spec.cda && spec.cda.dataAccesses) || []).forEach(function (d) {
        var ds = d.datasetId && Studio.Workspace.get("datasets", d.datasetId);
        if (ds && ds.updatedAt) daMeta[d.id] = ds.updatedAt;
      });
    }
    boot += jsonScript("window.STUDIO_DA_META", daMeta) + "\n";
    // LF36 slice 2: "fit to page width" — the @page size above sets the PRINT SUBSTRATE, but a
    // wide grid (many columns, a wide table/map) can still overflow it and get cropped. Rather
    // than guess a static scale at build time (layout depends on the live browser + actual
    // content), measure the real overflow at print time: on `beforeprint` (fired once the print
    // media query — and this file's own @media print rules above — have already taken effect,
    // per spec/major-engine behavior) compare .pdc-wrap's rendered scrollWidth against the page's
    // printable width in CSS px (96px/in is the standard CSS-to-physical mapping browsers use for
    // print layout) and, only if it overflows, scale the whole wrap down uniformly so nothing
    // gets clipped at the page edge. `afterprint` restores it in case the tab is used again.
    var printAutoFitScript = "";
    if (opts.pdfAutoFit) {
      var pdfDims = PDF_PAGE_DIMS_IN[opts.pdfPageSize] || PDF_PAGE_DIMS_IN.letter;
      var printableIn = (opts.pdfOrientation === "landscape" ? pdfDims[1] : pdfDims[0]) - 2 * PDF_PAGE_MARGIN_IN;
      var printableWidthPx = Math.round(printableIn * 96);
      printAutoFitScript = "(function(){var W=" + printableWidthPx + ";" +
        "function reset(w){w.style.transform='';w.style.width='';}" +
        "function fit(){var w=document.querySelector('.pdc-wrap');if(!w)return;reset(w);var sw=w.scrollWidth;" +
          "if(sw>W){var s=W/sw;w.style.transform='scale('+s+')';w.style.transformOrigin='top left';w.style.width=(100/s)+'%';}}" +
        "window.addEventListener('beforeprint',fit);" +
        "window.addEventListener('afterprint',function(){var w=document.querySelector('.pdc-wrap');if(w)reset(w);});" +
        "})();\n";
    }
    boot += printAutoFitScript;
    boot += jsonScript("window.STUDIO_SPEC", redacted) + "\n" +
      "document.addEventListener('DOMContentLoaded',function(){StudioRender.boot(window.STUDIO_SPEC);});\n</script>\n</body>\n</html>\n";
    return head + body + boot;
  };

  // subset of the global sample-data registry for just this dashboard's queries
  Studio.mockFor = function (spec, sampleData) {
    var ids = {}; (spec.kpis || []).forEach(function (k) { if (k.da) ids[k.da] = 1; });
    (spec.panels || []).forEach(function (p) { if (p.chart.da) ids[p.chart.da] = 1; });
    (spec.filters || []).forEach(function (f) { if (f.da) ids[f.da] = 1; });
    var out = {};
    Object.keys(ids).forEach(function (id) { if (sampleData[id]) out[id] = sampleData[id]; });
    return out;
  };

  /* ---------- LF49: dependency-free .xlsx (Office Open XML) export ----------
     Builds a genuine multi-sheet .xlsx workbook with no runtime deps and no build step —
     a minimal OOXML package written into a STORED (uncompressed) ZIP by hand. Stored
     entries keep every part's XML as plain bytes, so the output is both tiny and directly
     inspectable (the test suite scans the bytes for sheet names + values). Reused later for
     the .pptx / .docx slices, which are the same OOXML-in-a-ZIP shape.
     Public entry: Studio.xlsxBook(sheets) where sheets = [{ name, rows }] and each `rows`
     is an array of arrays of cell values (string | number | null). Returns a Uint8Array. */
  var _crcTable;
  function crc32(bytes) {
    if (!_crcTable) {
      _crcTable = [];
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        _crcTable[n] = c >>> 0;
      }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ _crcTable[(crc ^ bytes[i]) & 0xFF];
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(str) { return new TextEncoder().encode(str); }
  function colRef(i) { // 0-based column index → A, B, …, Z, AA, …
    var s = ""; i += 1;
    while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; }
    return s;
  }
  function cellXml(ref, val, bold) {
    var s = bold ? ' s="1"' : '';
    if (val === null || val === undefined || val === "") return '<c r="' + ref + '"' + s + '/>';
    if (typeof val === "number" && isFinite(val)) return '<c r="' + ref + '"' + s + '><v>' + val + '</v></c>';
    return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + xml(String(val)) + '</t></is></c>';
  }
  function sheetXml(rows) {
    var out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r] || [];
      out += '<row r="' + (r + 1) + '">';
      for (var c = 0; c < row.length; c++) out += cellXml(colRef(c) + (r + 1), row[c], r === 0);
      out += '</row>';
    }
    return out + '</sheetData></worksheet>';
  }
  function zipStore(parts) {
    // parts: [{ path, bytes:Uint8Array }] → a STORED zip as one Uint8Array
    var DATE = 0x0021, TIME = 0x0000; // fixed 1980-01-01 00:00 → deterministic output
    var chunks = [], central = [], offset = 0;
    parts.forEach(function (p) {
      var name = utf8(p.path), data = p.bytes, crc = crc32(data), sz = data.length;
      var lh = new Uint8Array(30 + name.length), dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true);
      dv.setUint16(8, 0, true); dv.setUint16(10, TIME, true); dv.setUint16(12, DATE, true);
      dv.setUint32(14, crc, true); dv.setUint32(18, sz, true); dv.setUint32(22, sz, true);
      dv.setUint16(26, name.length, true); dv.setUint16(28, 0, true); lh.set(name, 30);
      chunks.push(lh); chunks.push(data);
      var ch = new Uint8Array(46 + name.length), cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true); cv.setUint16(12, TIME, true);
      cv.setUint16(14, DATE, true); cv.setUint32(16, crc, true); cv.setUint32(20, sz, true);
      cv.setUint32(24, sz, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
      ch.set(name, 46); central.push(ch);
      offset += lh.length + data.length;
    });
    var cenStart = offset, cenSize = 0;
    central.forEach(function (c) { chunks.push(c); cenSize += c.length; offset += c.length; });
    var eocd = new Uint8Array(22), ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, parts.length, true); ev.setUint16(10, parts.length, true);
    ev.setUint32(12, cenSize, true); ev.setUint32(16, cenStart, true); chunks.push(eocd);
    var total = chunks.reduce(function (a, u) { return a + u.length; }, 0);
    var buf = new Uint8Array(total), pos = 0;
    chunks.forEach(function (u) { buf.set(u, pos); pos += u.length; });
    return buf;
  }
  Studio.xlsxBook = function (sheets) {
    // sanitize + de-dupe sheet names (Excel: ≤31 chars, none of : \ / ? * [ ], unique, non-empty)
    var used = {};
    var clean = (sheets || []).map(function (s, i) {
      var nm = String(s && s.name || ("Sheet" + (i + 1))).replace(/[:\\\/?*\[\]]/g, " ").slice(0, 31).trim() || ("Sheet" + (i + 1));
      var base = nm, k = 1;
      while (used[nm.toLowerCase()]) { var suf = " (" + (++k) + ")"; nm = base.slice(0, 31 - suf.length) + suf; }
      used[nm.toLowerCase()] = 1;
      return { name: nm, rows: (s && s.rows) || [] };
    });
    if (!clean.length) clean = [{ name: "Sheet1", rows: [] }];
    var parts = [];
    function add(path, str) { parts.push({ path: path, bytes: utf8(str) }); }
    add("[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      clean.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join("") +
      '</Types>');
    add("_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>');
    add("xl/workbook.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      clean.map(function (s, i) { return '<sheet name="' + xml(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join("") +
      '</sheets></workbook>');
    add("xl/_rels/workbook.xml.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      clean.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join("") +
      '<Relationship Id="rId' + (clean.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>');
    add("xl/styles.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>' +
      '<borders count="1"><border/></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
      '</styleSheet>');
    clean.forEach(function (s, i) { add("xl/worksheets/sheet" + (i + 1) + ".xml", sheetXml(s.rows)); });
    return zipStore(parts);
  };

  /* ---------- LF49 slice 2: dependency-free .docx (Office Open XML) export ----------
     Same OOXML-in-a-ZIP shape as the .xlsx above (reuses crc32/utf8/zipStore) — a Word
     report of the dashboard. Public entry: Studio.docxDoc(blocks) where blocks is an
     ordered list of { h, level } headings, { p } paragraphs, and { table:[[cell,…],…] }
     tables (the first table row renders as a shaded bold header). Returns a Uint8Array. */
  function docxRun(text, bold) {
    return '<w:r>' + (bold ? '<w:rPr><w:b/></w:rPr>' : '') +
      '<w:t xml:space="preserve">' + xml(text == null ? "" : String(text)) + '</w:t></w:r>';
  }
  function docxHeadPara(text, level) {
    var sz = level === 1 ? 40 : 28; // half-points → 20pt / 14pt
    return '<w:p><w:pPr><w:spacing w:before="' + (level === 1 ? 0 : 220) + '" w:after="80"/></w:pPr>' +
      '<w:r><w:rPr><w:b/><w:sz w:val="' + sz + '"/><w:color w:val="1A1A1A"/></w:rPr>' +
      '<w:t xml:space="preserve">' + xml(text == null ? "" : String(text)) + '</w:t></w:r></w:p>';
  }
  function docxTable(rows) {
    var sides = ["top", "left", "bottom", "right", "insideH", "insideV"];
    var borders = '<w:tblBorders>' + sides.map(function (s) {
      return '<w:' + s + ' w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>';
    }).join("") + '</w:tblBorders>';
    var tblPr = '<w:tblPr><w:tblW w:w="0" w:type="auto"/>' + borders + '</w:tblPr>';
    var trs = (rows || []).map(function (row, ri) {
      var cells = (row || []).map(function (c) {
        var shd = ri === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : '';
        return '<w:tc><w:tcPr>' + shd + '</w:tcPr><w:p>' + docxRun(c, ri === 0) + '</w:p></w:tc>';
      }).join("");
      return '<w:tr>' + cells + '</w:tr>';
    }).join("");
    return '<w:tbl>' + tblPr + trs + '</w:tbl>';
  }
  Studio.docxDoc = function (blocks) {
    var body = (blocks || []).map(function (b) {
      if (b.h != null) return docxHeadPara(b.h, b.level || 2);
      if (b.table) return docxTable(b.table);
      return '<w:p><w:r><w:t xml:space="preserve">' + xml(b.p == null ? "" : String(b.p)) + '</w:t></w:r></w:p>';
    }).join("");
    // a trailing empty paragraph before sectPr — Word requires the body's last block-level
    // element (after any table) to be a paragraph, and sectPr to be its final child.
    body += '<w:p/><w:sectPr><w:pgSz w:w="12240" w:h="15840"/>' +
      '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>';
    var doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      body + '</w:body></w:document>';
    var parts = [];
    function add(path, str) { parts.push({ path: path, bytes: utf8(str) }); }
    add("[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>');
    add("_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>');
    add("word/document.xml", doc);
    return zipStore(parts);
  };

  /* ---------- LF49 slice 3: dependency-free .pptx (Office Open XML) export ----------
     Same OOXML-in-a-ZIP shape as the .xlsx/.docx above (reuses crc32/utf8/zipStore) — a
     PowerPoint deck. Unlike Word/Excel, PowerPoint doesn't paginate: a slide is a fixed
     canvas, so the caller (buildDashboardPptx, studio.js) caps each table to the row/column
     count that actually fits and passes a `note` when it truncated — this module just lays
     out whatever it's given. Public entry: Studio.pptxDeck(slides) where slides is an ordered
     list of { title, subtitle } (a title slide) or { title, rows, note } (a table slide —
     rows = array of arrays, first row is the header). Returns a Uint8Array. */
  var PPTX_W = 9144000, PPTX_H = 6858000; // 10in x 7.5in (4:3), EMU (914400 EMU/in)
  var PPTX_MARGIN = 457200; // 0.5in
  var PPTX_ROW_H = 370840; // ~0.41in, matches buildDashboardPptx's row-count cap
  function pptxSp(id, name, phType, x, y, cx, cy, text, sz) {
    var ph = phType ? '<p:ph type="' + phType + '"/>' : '<p:ph type="body" idx="' + id + '"/>';
    var xfrm = (x == null) ? '' : '<a:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>';
    var rPr = sz ? '<a:rPr lang="en-US" sz="' + sz + '" dirty="0"/>' : '<a:rPr lang="en-US" dirty="0"/>';
    return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="' + xml(name) + '"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>' +
      '<p:nvPr>' + ph + '</p:nvPr></p:nvSpPr><p:spPr>' + xfrm + '</p:spPr>' +
      '<p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:r>' + rPr + '<a:t>' + xml(text == null ? "" : String(text)) + '</a:t></a:r></a:p></p:txBody></p:sp>';
  }
  function pptxTable(id, x, y, cx, cy, rows) {
    var nCols = Math.max.apply(null, [1].concat((rows || []).map(function (r) { return (r || []).length; })));
    var colW = Math.floor(cx / nCols);
    var grid = ''; for (var c = 0; c < nCols; c++) grid += '<a:gridCol w="' + colW + '"/>';
    var trs = (rows || []).map(function (row, ri) {
      var cells = [];
      for (var c = 0; c < nCols; c++) {
        var v = row && row[c];
        var fill = ri === 0 ? '<a:solidFill><a:schemeClr val="accent1"/></a:solidFill>' : '';
        var rPr = ri === 0 ? '<a:rPr lang="en-US" b="1" sz="1400" dirty="0"><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></a:rPr>' : '<a:rPr lang="en-US" sz="1400" dirty="0"/>';
        cells.push('<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r>' + rPr + '<a:t>' + xml(v == null ? "" : String(v)) + '</a:t></a:r></a:p></a:txBody>' +
          '<a:tcPr marL="45720" marR="45720" marT="22860" marB="22860">' + fill + '</a:tcPr></a:tc>');
      }
      return '<a:tr h="' + PPTX_ROW_H + '">' + cells.join("") + '</a:tr>';
    }).join("");
    return '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="' + id + '" name="Table"/>' +
      '<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>' +
      '<p:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + cx + '" cy="' + cy + '"/></p:xfrm>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">' +
      '<a:tbl><a:tblPr firstRow="1" bandRow="1"><a:tableStyleId>{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}</a:tableStyleId></a:tblPr>' +
      '<a:tblGrid>' + grid + '</a:tblGrid>' + trs + '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>';
  }
  function pptxSlideXml(slide) {
    var contentW = PPTX_W - 2 * PPTX_MARGIN, bodyY = PPTX_MARGIN * 2 + 685800;
    var body = pptxSp(2, "Title", "title", null, null, null, null, slide.title || "");
    if (slide.rows) {
      body += pptxTable(3, PPTX_MARGIN, bodyY, contentW, PPTX_H - bodyY - PPTX_MARGIN, slide.rows);
      if (slide.note) body += pptxSp(4, "Note", null, PPTX_MARGIN, PPTX_H - PPTX_MARGIN - 320000, contentW, 320000, slide.note, 1200);
    } else if (slide.subtitle) {
      body += pptxSp(3, "Subtitle", null, PPTX_MARGIN, bodyY, contentW, PPTX_H - bodyY - PPTX_MARGIN, slide.subtitle, 1800);
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
      body + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
  }
  var PPTX_THEME =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Polecat">' +
    '<a:themeElements><a:clrScheme name="Polecat">' +
    '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
    '<a:dk2><a:srgbClr val="1A1A1A"/></a:dk2><a:lt2><a:srgbClr val="F2F2F2"/></a:lt2>' +
    '<a:accent1><a:srgbClr val="4F7CFF"/></a:accent1><a:accent2><a:srgbClr val="34C38F"/></a:accent2>' +
    '<a:accent3><a:srgbClr val="F5A623"/></a:accent3><a:accent4><a:srgbClr val="E15554"/></a:accent4>' +
    '<a:accent5><a:srgbClr val="8E6FF7"/></a:accent5><a:accent6><a:srgbClr val="24A0C4"/></a:accent6>' +
    '<a:hlink><a:srgbClr val="4F7CFF"/></a:hlink><a:folHlink><a:srgbClr val="8E6FF7"/></a:folHlink>' +
    '</a:clrScheme><a:fontScheme name="Polecat"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
    '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
    '<a:fmtScheme name="Polecat">' +
    '<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
    '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>' +
    '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
    '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>' +
    '</a:fmtScheme></a:themeElements></a:theme>';
  Studio.pptxDeck = function (slides) {
    slides = (slides && slides.length) ? slides : [{ title: "Dashboard" }];
    var parts = [];
    function add(path, str) { parts.push({ path: path, bytes: utf8(str) }); }
    var slideOverrides = slides.map(function (s, i) {
      return '<Override PartName="/ppt/slides/slide' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
    }).join("");
    add("[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
      '<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>' +
      slideOverrides + '</Types>');
    add("_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>' +
      '</Relationships>');
    add("ppt/tableStyles.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>');
    add("ppt/theme/theme1.xml", PPTX_THEME);
    add("ppt/slideMasters/slideMaster1.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
      pptxSp(2, "Title Placeholder", "title", 457200, 274638, 8229600, 1143000, "Title", null) +
      pptxSp(3, "Body Placeholder", "body", 457200, 1600200, 8229600, 4525963, "Body", null) +
      '</p:spTree></p:cSld>' +
      '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
      '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
      '<p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="3600"/></a:lvl1pPr></p:titleStyle>' +
      '<p:bodyStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:bodyStyle>' +
      '<p:otherStyle><a:lvl1pPr><a:defRPr sz="1400"/></a:lvl1pPr></p:otherStyle></p:txStyles>' +
      '</p:sldMaster>');
    add("ppt/slideMasters/_rels/slideMaster1.xml.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>' +
      '</Relationships>');
    add("ppt/slideLayouts/slideLayout1.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="obj" preserve="1">' +
      '<p:cSld name="Title and Content"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
      pptxSp(2, "Title", "title", null, null, null, null, "", null) +
      pptxSp(3, "Content", "body", null, null, null, null, "", null) +
      '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>');
    add("ppt/slideLayouts/_rels/slideLayout1.xml.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>' +
      '</Relationships>');
    slides.forEach(function (s, i) {
      add("ppt/slides/slide" + (i + 1) + ".xml", pptxSlideXml(s));
      add("ppt/slides/_rels/slide" + (i + 1) + ".xml.rels",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
        '</Relationships>');
    });
    add("ppt/presentation.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
      '<p:sldIdLst>' + slides.map(function (s, i) { return '<p:sldId id="' + (256 + i) + '" r:id="rId' + (i + 2) + '"/>'; }).join("") + '</p:sldIdLst>' +
      '<p:sldSz cx="' + PPTX_W + '" cy="' + PPTX_H + '" type="screen4x3"/>' +
      '<p:notesSz cx="6858000" cy="9144000"/>' +
      '</p:presentation>');
    add("ppt/_rels/presentation.xml.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>' +
      slides.map(function (s, i) { return '<Relationship Id="rId' + (i + 2) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' + (i + 1) + '.xml"/>'; }).join("") +
      '</Relationships>');
    return zipStore(parts);
  };

  Studio.exportCDF = function (spec, assets, deployPath) {
    return Studio.buildHtml(spec, assets, { deployPath: deployPath, preview: false });
  };
  Studio.previewHtml = function (spec, assets, sampleData, deployPath) {
    return Studio.buildHtml(spec, assets, { deployPath: deployPath, preview: true, mock: Studio.mockFor(spec, sampleData), launcher: false });
  };
})();
