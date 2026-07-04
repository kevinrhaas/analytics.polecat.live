/* ============================================================================
   exporters.js — turn a Studio spec into deployable Pentaho artifacts:
     • .cda            (CDA data layer, XML)
     • .cdfde + .wcdf  (CDE editor format — opens in Pentaho CDE)
     • .html           (self-contained CDF dashboard via the PDC toolkit)
   The same HTML assembler powers the live-preview iframe (preview:true).
   Ports the structure of iteration/v2/dash-build/{build.py,gen-cde.py}.
   ============================================================================ */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  function xml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ---------- .cda ---------- */
  function cdaConnectionXml(conn) {
    var t = conn.type || "sql.jndi", inner = "";
    if (t === "sql.jndi")             inner = "<Jndi>" + xml(conn.jndi || "PDC-BIDB-EXT") + "</Jndi>";
    else if (t === "sql.jdbc")        inner = "<Driver>" + xml(conn.driver) + "</Driver>" +
                                               "<Url>" + xml(conn.url) + "</Url>" +
                                               "<User>" + xml(conn.user) + "</User>" +
                                               "<Password>" + xml(conn.pass) + "</Password>";
    else if (t === "mondrian.jndi")   inner = "<Jndi>" + xml(conn.jndi) + "</Jndi>" +
                                               "<Catalog>" + xml(conn.catalog) + "</Catalog>";
    else if (t === "olap4j")          inner = "<ConnectString>" + xml(conn.connectString) + "</ConnectString>";
    else if (t === "metadata")        inner = "<DomainId>" + xml(conn.domainId) + "</DomainId>" +
                                               "<XmiFile>" + xml(conn.xmiFile) + "</XmiFile>";
    else if (t === "kettle.TransFromFile") inner = "<KtrFile>" + xml(conn.fileName) + "</KtrFile>" +
                                               "<Step>" + xml(conn.step || "Output") + "</Step>";
    else if (t === "scripting")       inner = "<Language>" + xml(conn.language || "javascript") + "</Language>";
    return '<Connection id="' + xml(conn.id) + '" type="' + xml(t) + '">' + inner + "</Connection>";
  }
  Studio.cdaConnectionXml = cdaConnectionXml;

  Studio.exportCDA = function (spec) {
    // Support both new connections[] and legacy single connection.
    var connections = (spec.cda.connections && spec.cda.connections.length)
      ? spec.cda.connections
      : [spec.cda.connection || { id: "pdc", type: "sql.jndi", jndi: "PDC-BIDB-EXT" }];
    var firstConnId = connections[0].id;

    var connXml = connections.map(cdaConnectionXml).join("\n    ");
    // duckdb/sqlite/snowflake/databricks/bigquery/http DAs query a remote source straight from the
    // browser (Z14/Z4) — they aren't a real Pentaho data source and have no <Connection>/<DataAccess>
    // XML equivalent, so they're simply not part of the .cda artifact (they still work fine in
    // preview/CDF via sample data).
    var directDAKinds = { duckdb: 1, httpvfs: 1, snowflake: 1, databricks: 1, bigquery: 1, http: 1 };
    var das = (spec.cda.dataAccesses || []).filter(function (d) { return !directDAKinds[d.kind]; }).map(function (d) {
      // compound (join / union) — no connection ref, own XML element
      if (d.kind === "compound") {
        var cacheAttr = 'cache="' + (d.cache === false ? "false" : "true") + '" cacheDuration="' + (d.cacheDuration || 300) + '"';
        var nameEl = "    <Name>" + xml(d.name || d.id) + "</Name>\n";
        if (d.compoundType === "union") {
          var members = (d.unionDas || []).map(function (did) { return '    <DataAccess id="' + xml(did) + '"/>'; }).join("\n");
          return '  <CompoundDataAccess type="union" id="' + xml(d.id) + '" access="public" ' + cacheAttr + '>\n' +
                 nameEl + members + "\n  </CompoundDataAccess>";
        }
        // default: join
        return '  <CompoundDataAccess type="join" id="' + xml(d.id) + '" access="public" ' + cacheAttr + '>\n' +
               nameEl +
               '    <Left id="' + xml(d.leftId || "") + '" keys="' + xml(d.leftKeys || "") + '"/>\n' +
               '    <Right id="' + xml(d.rightId || "") + '" keys="' + xml(d.rightKeys || "") + '"/>\n' +
               "  </CompoundDataAccess>";
      }

      var connId = d.connectionId || firstConnId;
      var accessType = Studio.daAccessType ? Studio.daAccessType(d.kind) : "sql";
      var params = (d.params && d.params.length)
        ? "<Parameters>" + d.params.map(function (p) {
            return '<Parameter name="' + xml(p.name) + '" type="' + xml(p.type || "String") + '" default="' + xml(p.default != null ? p.default : "") + '"/>';
          }).join("") + "</Parameters>"
        : "<Parameters/>";
      var validCalcCols = (d.calcColumns || []).filter(function (c) { return c.name && c.formula; });
      var calcColsXml = validCalcCols.length
        ? "<CalculatedColumns>" + validCalcCols.map(function (c) {
            return "<CalculatedColumn><Name>" + xml(c.name) + "</Name><Formula>" + xml(c.formula) + "</Formula><Type>" + xml(c.type || "Numeric") + "</Type></CalculatedColumn>";
          }).join("") + "</CalculatedColumns>"
        : "<CalculatedColumns/>";
      var bodyXml;
      if (accessType === "kettle") {
        bodyXml = "    <KtrFile>" + xml(d.ktrPath || "") + "</KtrFile>\n" +
                  "    <Step>" + xml(d.ktrStep || "Output") + "</Step>";
      } else if (accessType === "scripting") {
        bodyXml = "    <Language>" + xml(d.scriptLang || "javascript") + "</Language>\n" +
                  "    <InitScript/>\n" +
                  "    <QueryScript><![CDATA[ " + (d.sql || d.query || "") + " ]]></QueryScript>";
      } else {
        bodyXml = "    <Query><![CDATA[ " + (d.sql || d.query || "") + " ]]></Query>";
      }
      // OutputOptions block — emitted when filters, sorts, or a limit are defined
      var oo = d.outputOptions || {};
      var activeFilters = (oo.filters || []).filter(function (f) { return f.col && String(f.val || "") !== ""; });
      var activeSorts   = (oo.sortBy || []).filter(function (s) { return s.col; });
      var limit = oo.limit ? parseInt(oo.limit, 10) : 0;
      var opMap = { "=": "EQ", "!=": "NE", ">": "GT", ">=": "GE", "<": "LT", "<=": "LE", "contains": "LIKE", "startsWith": "LIKE_START" };
      var outputOptionsXml = "";
      if (activeFilters.length || activeSorts.length || limit > 0) {
        var inner = "";
        if (activeSorts.length)
          inner += "\n      <SortBy>" + xml(activeSorts.map(function (s) { return s.col + " " + (s.dir === "desc" ? "DESC" : "ASC"); }).join(", ")) + "</SortBy>";
        if (limit > 0)
          inner += "\n      <RowLimit>" + limit + "</RowLimit>";
        activeFilters.forEach(function (f) {
          inner += '\n      <Filter column="' + xml(f.col) + '" operator="' + xml(opMap[f.op] || "EQ") + '" value="' + xml(f.val) + '"/>';
        });
        outputOptionsXml = "\n    <OutputOptions>" + inner + "\n    </OutputOptions>";
      }
      return '  <DataAccess id="' + xml(d.id) + '" connection="' + xml(connId) + '" type="' + accessType + '" access="public" cache="' +
        (d.cache === false ? "false" : "true") + '" cacheDuration="' + (d.cacheDuration || 300) + '">\n' +
        "    <Name>" + xml(d.name || d.id) + "</Name>" + params + calcColsXml + outputOptionsXml + "\n" +
        bodyXml + "\n  </DataAccess>";
    }).join("\n\n");
    return '<?xml version="1.0" encoding="UTF-8"?>\n<CDADescriptor>\n' +
      '  <DataSources>' + connXml + "</DataSources>\n\n" +
      das + "\n</CDADescriptor>\n";
  };

  /* ---------- CDF (.html) + preview ----------
     assets = { css, js, render }  (text of vendor/pdc-ui.css, vendor/pdc-ui.js, app/studio-render.js)
     opts   = { deployPath, preview, mock, launcher } */
  function jsonScript(varName, obj) {
    return varName + " = " + JSON.stringify(obj).replace(/<\//g, "<\\/") + ";";
  }
  Studio.buildHtml = function (spec, assets, opts) {
    opts = opts || {};
    // N-DEV: dashboard templates/variables — resolve {{key}} tokens in the banner text once, here,
    // so both the live preview and every real export (they both funnel through this one function)
    // substitute identically with no separate wiring.
    var titleText = Studio.applyTemplateVars(spec.title, spec.templateVars);
    var subtitleText = Studio.applyTemplateVars(spec.subtitle, spec.templateVars);
    var deployPath = opts.deployPath || "/public/pdc-iteration/v2";
    var cdaPath = deployPath + "/" + spec.name + ".cda";
    var home = "/pentaho/api/repos/" + deployPath.replace(/^\/+/, "").replace(/\//g, ":") + ":i-home.html/content";
    var launcher = (opts.launcher === false) ? "" :
      '<a class="pdc-iconbtn" href="' + home + '" style="text-decoration:none">&#9632; All dashboards</a>';
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
      var _dt = (Studio.DASHBOARD_THEMES || []).filter(function (t) { return t.key === spec.dashboardTheme; })[0];
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
    // Z6: subtitle style — .pdc-sub defaults to font-weight:500, not italic (vendor pdc-ui.css).
    var subtitleStyleCss = "";
    if (spec.subtitleStyle === "italic") subtitleStyleCss = "\n.pdc-sub{font-style:italic}";
    else if (spec.subtitleStyle === "bold") subtitleStyleCss = "\n.pdc-sub{font-weight:800}";
    else if (spec.subtitleStyle === "bold-italic") subtitleStyleCss = "\n.pdc-sub{font-weight:800;font-style:italic}";
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
      ".kpi .sr-kpi-del{position:absolute;top:5px;right:6px;width:18px;height:18px;border-radius:50%;border:0;background:var(--bad,#e0395e);color:#fff;font-size:13px;line-height:1;cursor:pointer;opacity:0;transition:opacity .12s;padding:0;display:flex;align-items:center;justify-content:center}" +
      ".kpi:hover .sr-kpi-del{opacity:.85}.kpi .sr-kpi-del:hover{opacity:1}" +
      ".sr-card-acts{position:absolute;top:7px;right:11px;display:flex;gap:3px;opacity:0;transition:opacity .12s;z-index:8}" +
      ".card:hover .sr-card-acts{opacity:1}" +
      ".sr-act{width:20px;height:20px;border-radius:5px;border:1px solid var(--panel-border);background:var(--panel-bg);color:var(--text-muted);font-size:13px;line-height:1;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center}" +
      ".sr-act:hover{color:var(--pentaho);border-color:var(--pentaho)}.sr-act[data-act=del]:hover{color:var(--bad,#e0395e);border-color:var(--bad,#e0395e)}" +
      "@media(pointer:coarse){.card>h3{min-height:48px}.sr-card-acts{opacity:1!important}.sr-act{width:36px;height:36px}.sr-kpi-del{opacity:.85!important;width:24px;height:24px}}" : "";
    var head =
      "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\"/>\n" +
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>\n" +
      "<title>" + xml(titleText) + " — Pentaho Data Catalog Analytics</title>\n<style>\n" + assets.css + mobileCss + sectionCss + descCss + panelNoteCss + panelAccentCss + targetLineCss + refBandCss + calloutCss + periodHighlightCss + eventMarkerCss + scatterAnnotCss + kpiSubCss + richtextCss + dashboardThemeCss + themeColorCss + headerLogoCss + headerLinkCss + headerBgCss + titleSizeCss + subtitleStyleCss + paletteCss + printCss + previewCss + "\n</style>\n</head>\n";
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
      "  <button class=\"pdc-iconbtn\" id=\"qInfoBtn\" title=\"View the CDA queries behind this dashboard\" aria-label=\"View the CDA queries behind this dashboard\" onclick=\"PDC.queryModal()\">&#9432;</button>\n" +
      "  <button class=\"pdc-iconbtn\" id=\"themeBtn\" aria-label=\"Toggle dark/light mode\" onclick=\"PDC.toggleTheme()\">&#9790; Dark</button>\n" +
      (!opts.preview ? "  <button class=\"pdc-iconbtn\" id=\"printBtn\" title=\"Print / save as PDF\" aria-label=\"Print or save as PDF\" onclick=\"window.print()\"><svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><rect x='6' y='9' width='12' height='9' rx='1'/><path d='M7 9V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v4'/><path d='M7 17v2a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2'/><circle cx='9' cy='13.5' r='1' fill='currentColor' stroke='none'/></svg></button>\n" : "") +
      "  " + launcher + "\n</header>\n" +
      "<div class=\"pdc-wrap\">\n  <div class=\"pdc-kpis\" id=\"kpis\"></div>\n" +
      (spec.description ? "  <div class=\"pdc-desc-bar\">" + xml(spec.description) + "</div>\n" : "") +
      "  <div id=\"content\"><div class=\"loading\">Loading…</div></div>\n" +
      "</div>\n";
    var charts = assets.charts ? ("<script>\n" + assets.charts + "\n</script>\n") : "";
    var boot = "<script>\n" + assets.js + "\n</script>\n" + charts + "<script>\n" + assets.render + "\n</script>\n<script>\n" +
      "window.STUDIO_AUTOBOOT=false;\n" +
      "PDC.cdaPath=" + JSON.stringify(cdaPath) + ";\nvar CDAPATH=PDC.cdaPath;\n";
    if (opts.preview) {
      boot += "window.STUDIO_PREVIEW=true;\n" + jsonScript("window.PDC_MOCK", opts.mock || {}) + "\n";
    }
    if (opts.liveBase) {
      // best-effort live preview: route PDC.cda at an absolute Pentaho origin (needs CORS/login)
      boot += "(function(){var B=" + JSON.stringify(opts.liveBase.replace(/\/+$/, "")) + ";var orig=PDC.cda;" +
        "PDC.cda=function(id,params){var u=new URL(B+'/pentaho/plugin/cda/api/doQuery');u.searchParams.set('path',PDC.cdaPath);" +
        "u.searchParams.set('dataAccessId',id);u.searchParams.set('outputType','json');if(params)for(var k in params)u.searchParams.set('param'+k,params[k]);" +
        "return fetch(u.toString(),{credentials:'include'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})" +
        ".then(function(j){var cols=(j.metadata||[]).map(function(m){return m.colName;});return{cols:cols,rows:(j.resultset||[]),col:function(n){return cols.indexOf(n);}};});};})();\n";
    }
    boot += jsonScript("window.STUDIO_SPEC", spec) + "\n" +
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
