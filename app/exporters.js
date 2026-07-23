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
     assets = { css, js, render }  (text of vendor/pdc-ui.css, vendor/pdc-ui.js, app/studio-render.js)
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
  function redactSecrets(spec) {
    var das = spec && spec.cda && spec.cda.dataAccesses;
    if (!das || !das.length) return spec;
    var clone = JSON.parse(JSON.stringify(spec));
    (clone.cda.dataAccesses || []).forEach(function (da) {
      var field = SECRET_FIELDS[da.kind];
      if (field && da[field]) { delete da[field]; da.needsSecret = field; }
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
      "@media(pointer:coarse){.pdc-dl-acts{opacity:.85!important}.pdc-dl-act{width:32px;height:32px}}";
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
    // N-DESIGN "chart skins" first cut: "flat" strips the raised shadow/glass-edge/hover-lift
    // .card and .kpi already carry (vendor/pdc-ui.css) for a quieter, editorial-minimal mood —
    // pure CSS override, no markup change, so it applies uniformly in preview + every export.
    var cardSkinCss = spec.cardSkin === "flat" ?
      "\n.card,.kpi{box-shadow:none;border:1px solid var(--panel-border)}" +
      "\n.card:hover,.kpi:hover{transform:none;box-shadow:none}" : "";
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
    // Print / PDF layout: static header, hide interactive controls, avoid card page breaks.
    // Applied only in exported CDF (not the in-builder preview where printing makes no sense).
    var printCss = !opts.preview ?
      "\n@media print{" +
        ".pdc-header{position:static!important;box-shadow:none!important;border-bottom:1px solid #d0d4da}" +
        "#qInfoBtn,#themeBtn,#printBtn,#ctrls{display:none!important}" +
        "body{background:#fff!important;color:#000!important}" +
        ".pdc-wrap{padding:12px 16px}" +
        ".pdc-grid{gap:12px}" +
        ".card{break-inside:avoid;box-shadow:none;border:1px solid #d0d4da}" +
        ".pdc-kpis{break-inside:avoid}" +
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
      "@media(pointer:coarse){.card>h3{min-height:48px}.sr-card-acts{opacity:1!important}.sr-act{width:36px;height:36px}.sr-kpi-del{opacity:.85!important;width:24px;height:24px}.sr-desc-del{opacity:.85!important;width:26px;height:26px}}" : "";
    var head =
      "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\"/>\n" +
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>\n" +
      "<title>" + xml(titleText) + " — Analytics</title>\n<style>\n" + assets.css + mobileCss + sectionCss + descCss + panelNoteCss + panelAccentCss + dlActsCss + targetLineCss + refBandCss + calloutCss + periodHighlightCss + eventMarkerCss + scatterAnnotCss + kpiSubCss + richtextCss + dashboardThemeCss + themeColorCss + headerLogoCss + headerLinkCss + headerBgCss + titleSizeCss + hideHeaderCss + subtitleStyleCss + cardSkinCss + paletteCss + printCss + previewCss + "\n</style>\n</head>\n";
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
      "  <button class=\"pdc-iconbtn\" id=\"themeBtn\" aria-label=\"Toggle dark/light mode\" onclick=\"PDC.toggleTheme()\">&#9790; Dark</button>\n" +
      (!opts.preview ? "  <button class=\"pdc-iconbtn\" id=\"printBtn\" title=\"Print / save as PDF\" aria-label=\"Print or save as PDF\" onclick=\"window.print()\"><svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><rect x='6' y='9' width='12' height='9' rx='1'/><path d='M7 9V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v4'/><path d='M7 17v2a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2'/><circle cx='9' cy='13.5' r='1' fill='currentColor' stroke='none'/></svg></button>\n" : "") +
      "  " + launcher + "\n</header>\n" +
      "<div class=\"pdc-wrap\">\n  <div class=\"pdc-kpis\" id=\"kpis\"></div>\n" +
      (spec.description ? "  <div class=\"pdc-desc-bar\">" + xml(spec.description) + "</div>\n" : "") +
      "  <div id=\"content\"><div class=\"loading\">Loading…</div></div>\n" +
      "</div>\n";
    var charts = assets.charts ? ("<script>\n" + assets.charts + "\n</script>\n") : "";
    // Z14 architecture-gap fix: bundle the DuckDB-Wasm / SQLite-WASM-HTTP connector façades into
    // the export ONLY when the dashboard actually has a data access of that kind — their wasm
    // engines are lazy-loaded from a CDN at query time regardless (see app/duckdb.js/sqlitehttp.js),
    // but there's no reason to add even these small façade files to a dashboard that doesn't use
    // one. This is what lets studio-render.js's PDC.cda dispatch actually answer a duckdb/httpvfs
    // DA once exported/deployed, instead of falling through to a data call that 404s.
    var daKinds = {};
    ((spec.cda && spec.cda.dataAccesses) || []).forEach(function (d) { if (d.kind) daKinds[d.kind] = 1; });
    var duckdbScript = (daKinds.duckdb && assets.duckdb) ? ("<script>\n" + assets.duckdb + "\n</script>\n") : "";
    var httpvfsScript = (daKinds.httpvfs && assets.httpvfs) ? ("<script>\n" + assets.httpvfs + "\n</script>\n") : "";
    // Post-overhaul backlog item 3 follow-up: same lean-bundling pattern as duckdb/httpvfs above,
    // now covering the four credential-based direct connectors (see redactSecrets above + the
    // studio-render.js PDC.cda dispatch that answers these DA kinds once deployed).
    var snowflakeScript = (daKinds.snowflake && assets.snowflake) ? ("<script>\n" + assets.snowflake + "\n</script>\n") : "";
    var databricksScript = (daKinds.databricks && assets.databricks) ? ("<script>\n" + assets.databricks + "\n</script>\n") : "";
    var bigqueryScript = (daKinds.bigquery && assets.bigquery) ? ("<script>\n" + assets.bigquery + "\n</script>\n") : "";
    var genericsqlScript = (daKinds.http && assets.genericsql) ? ("<script>\n" + assets.genericsql + "\n</script>\n") : "";
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
    var boot = "<script>\n" + assets.js + "\n</script>\n" + charts + geoScript + duckdbScript + httpvfsScript +
      snowflakeScript + databricksScript + bigqueryScript + genericsqlScript + "<script>\n" + assets.render + "\n</script>\n<script>\n" +
      "window.STUDIO_AUTOBOOT=false;\n" +
      "PDC.cdaPath=" + JSON.stringify(cdaPath) + ";\nvar CDAPATH=PDC.cdaPath;\n";
    if (opts.preview) {
      boot += "window.STUDIO_PREVIEW=true;\n" + jsonScript("window.PDC_MOCK", opts.mock || {}) + "\n";
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
    boot += jsonScript("window.STUDIO_SPEC", redactSecrets(spec)) + "\n" +
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

  Studio.exportCDF = function (spec, assets, deployPath) {
    return Studio.buildHtml(spec, assets, { deployPath: deployPath, preview: false });
  };
  Studio.previewHtml = function (spec, assets, sampleData, deployPath) {
    return Studio.buildHtml(spec, assets, { deployPath: deployPath, preview: true, mock: Studio.mockFor(spec, sampleData), launcher: false });
  };
})();
