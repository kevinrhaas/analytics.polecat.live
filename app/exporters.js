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
  Studio.xmlEscape = xml;

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
    var das = (spec.cda.dataAccesses || []).map(function (d) {
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

  /* ---------- CDE (.cdfde + .wcdf) ---------- */
  function prop(n, t, v) { return { name: n, type: t, value: v }; }
  // chart types that map to a real CCC component (others are CDF-only and omitted from CDE)
  var CDE_OK = { bars: 1, donut: 1, line: 1, stacked: 1, areaStacked: 1, treemap: 1, scatter: 1, heatmap: 1 };
  Studio.cdeEmittable = function (type) { return !!CDE_OK[type]; };

  function brandHeaderRows(spec, deployPath) {
    var disp = spec.title.replace(/ \(CDE\)$/, "");
    var home = "/pentaho/api/repos/" + deployPath.replace(/^\/+/, "").replace(/\//g, ":") + ":i-home.html/content";
    var cdaUrl = "/pentaho/api/repos/" + (deployPath.replace(/^\/+/, "") + "/" + spec.name + ".cda").replace(/\//g, ":") + "/content";
    var css = "body{background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}" +
      ".pdc-cde-hdr{display:flex;align-items:center;gap:12px;background:linear-gradient(100deg,#0b2e63,#005bb5);color:#fff;padding:13px 18px;border-radius:12px;margin:8px 6px 16px;box-shadow:0 6px 18px rgba(8,33,72,.18)}" +
      ".pdc-cde-hdr .lg{width:30px;height:30px;border-radius:8px;background:rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;flex:0 0 auto}" +
      ".pdc-cde-hdr h1{font-size:17px;margin:0;font-weight:800;letter-spacing:.2px}.pdc-cde-hdr .sub{font-size:11.5px;opacity:.82;font-style:italic}" +
      ".pdc-cde-hdr .right{margin-left:auto;display:flex;align-items:center;gap:12px}.pdc-cde-hdr a{color:#cfe2ff;font-size:11px;text-decoration:none;font-weight:700;white-space:nowrap}.pdc-cde-hdr a:hover{color:#fff}" +
      ".pdc-cde-hdr .pill{font-size:10px;font-weight:800;letter-spacing:.5px;background:#7d3c98;padding:4px 11px;border-radius:20px;text-transform:uppercase}" +
      ".pdc-cde-hdr .qinfo{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;font-size:14px;font-weight:700;text-decoration:none}.pdc-cde-hdr .qinfo:hover{background:rgba(255,255,255,.3);color:#fff}" +
      "[id$=Col]{background:#fff;background-clip:padding-box;border:7px solid transparent;border-radius:14px;padding:12px 12px 6px;box-shadow:0 2px 10px rgba(20,40,80,.07);box-sizing:border-box}" +
      ".pdc-cde-foot{text-align:center;color:#8a93a6;font-size:11px;margin:18px 6px 10px}";
    var html = "<style>" + css + "</style>" +
      "<div class='pdc-cde-hdr'><div class='lg'>P</div><div><h1>" + xml(disp) + "</h1></div>" +
      "<span class='sub'>Pentaho CDE · editable</span><div class='right'>" +
      "<a class='qinfo' href='" + cdaUrl + "' target='_blank' title='View the CDA queries behind this dashboard'>&#9432;</a>" +
      "<a href='" + home + "'>▸ All dashboards</a><span class='pill'>CDE</span></div></div>";
    return [
      { id: "hdrRow", parent: "UnIqEiD", type: "LayoutRow", typeDesc: "Row",
        properties: [prop("name", "Id", ""), prop("height", "Integer", ""), prop("cssClass", "String", "")] },
      { id: "hdrZone", parent: "hdrRow", type: "LayoutColumn", typeDesc: "Column",
        properties: [prop("name", "Id", "hdrZone"), prop("columnSpan", "Integer", "24"), prop("height", "Integer", ""), prop("textAlign", "TextAlign", ""), prop("cssClass", "String", "")] },
      { id: "hdrHtml", parent: "hdrZone", type: "LayoutHtml", typeDesc: "Html",
        properties: [prop("name", "Id", "hdrHtml"), prop("html", "Html", html), prop("cssClass", "String", "")] }
    ];
  }

  Studio.exportCDE = function (spec, deployPath) {
    deployPath = deployPath || "/public/pdc-iteration/v2";
    var cdaPath = deployPath + "/" + spec.name + ".cda";
    var panels = (spec.panels || []).filter(function (p) { return CDE_OK[p.chart.type] && p.chart.da; });

    // datasources: one CDADataSource per distinct da used
    var seen = {}, dsRows = [{ id: "DSGROUP", parent: "UnIqEiD", type: "Label", typeDesc: "<i>Group</i>", name: "Datasources",
      properties: [prop("Group", "Label", "Datasources")] }];
    var dsi = 0;
    panels.forEach(function (p) {
      var da = p.chart.da; if (seen[da]) return; seen[da] = 1; dsi += 1;
      dsRows.push({ id: "ds-" + dsi, parent: "DSGROUP", type: "CDADataSource", typeDesc: "CDA Data Source",
        properties: [prop("name", "Id", da), prop("access", "Access", "public"), prop("cdaPath", "CdaPath", cdaPath),
          prop("dataAccessId", "String", da), prop("outputIndexId", "String", "")] });
    });

    // layout: brand header + rows packing panels across a 24-col grid
    var layoutRows = brandHeaderRows(spec, deployPath);
    var colW = Math.max(1, Math.floor(24 / (spec.gridCols || 3)));
    var rowAcc = 24, rowId = 0, curRow = null;
    var compRows = [{ id: "CHARTS", parent: "UnIqEiD", type: "Label", typeDesc: "<i>Group</i>", name: "Charts",
      properties: [prop("Group", "Label", "Charts")] }];
    panels.forEach(function (p, i) {
      var w = p.span === "full" ? 24 : Math.min(24, colW * (p.span || 1));
      if (rowAcc + w > 24) { rowAcc = 0; }
      if (rowAcc === 0) { rowId += 1; curRow = "row" + rowId;
        layoutRows.push({ id: curRow, parent: "UnIqEiD", type: "LayoutRow", typeDesc: "Row",
          properties: [prop("name", "Id", ""), prop("height", "Integer", ""), prop("cssClass", "String", "")] }); }
      var colName = "c" + i + "Col";
      layoutRows.push({ id: "lc" + i, parent: curRow, type: "LayoutColumn", typeDesc: "Column",
        properties: [prop("name", "Id", colName), prop("columnSpan", "Integer", String(w)), prop("height", "Integer", ""),
          prop("textAlign", "TextAlign", ""), prop("cssClass", "String", "")] });
      rowAcc += w;

      var reg = (window.Studio.CHARTS[p.chart.type] || {}).cde;
      var ctype = reg.type, o = p.chart.opts || {};
      var props = [prop("name", "Id", "cmp" + i), prop("title", "String", ""), prop("dataSource", "Datasource", p.chart.da),
        prop("htmlObject", "HtmlObject", "${h:" + colName + "}"), prop("executeAtStart", "Boolean", "true"),
        prop("width", "Integer", ""), prop("height", "Integer", String(o.height || 300)),
        prop("crosstabMode", "Boolean", "false"), prop("seriesInRows", "Boolean", "false"),
        prop("colors", "Array", Studio.PALETTE)];
      (reg.extra ? reg.extra(p.chart) : []).forEach(function (kv) { props.push(prop(kv[0], kv[1], kv[2])); });
      compRows.push({ id: ctype.replace(/^ccc/, "") + i, parent: "CHARTS", meta_cdwSupport: "true",
        type: "Components" + ctype, typeDesc: "CCC " + ctype.replace(/^ccc/, ""), properties: props });
    });

    var cdfde = { datasources: { rows: dsRows }, layout: { rows: layoutRows }, components: { rows: compRows } };
    var title = /\(CDE\)$/.test(spec.title) ? spec.title : spec.title + " (CDE)";
    var wcdf = '<?xml version="1.0" encoding="UTF-8"?>\n<cdf>\n  <title>' + xml(title) + "</title>\n" +
      "  <author>PDC Analytics</author>\n  <description>" + xml(spec.description || spec.subtitle || "") + "</description>\n  <icon/>\n" +
      "  <style>clean</style>\n  <rendererType>blueprint</rendererType>\n  <widget>false</widget>\n  <widgetParameters/>\n</cdf>\n";
    return { cdfde: JSON.stringify(cdfde, null, 1), wcdf: wcdf,
      omitted: (spec.panels || []).filter(function (p) { return !CDE_OK[p.chart.type]; }).map(function (p) { return p.title || p.id; }) };
  };

  /* ---------- CDF (.html) + preview ----------
     assets = { css, js, render }  (text of vendor/pdc-ui.css, vendor/pdc-ui.js, app/studio-render.js)
     opts   = { deployPath, preview, mock, launcher } */
  function jsonScript(varName, obj) {
    return varName + " = " + JSON.stringify(obj).replace(/<\//g, "<\\/") + ";";
  }
  Studio.buildHtml = function (spec, assets, opts) {
    opts = opts || {};
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
      "<title>" + xml(spec.title) + " — Pentaho Data Catalog Analytics</title>\n<style>\n" + assets.css + mobileCss + previewCss + "\n</style>\n</head>\n";
    var body =
      "<body>\n<header class=\"pdc-header\">\n" +
      "  <div class=\"pdc-brand\"><span class=\"pdc-logo\">P</span><span class=\"pdc-title\">" + xml(spec.title) + "</span></div>\n" +
      "  <div class=\"pdc-sub\">" + xml(spec.subtitle || "") + "</div>\n  <div class=\"spacer\"></div>\n" +
      "  <div class=\"pdc-ctrls\" id=\"ctrls\"></div>\n" +
      "  <button class=\"pdc-iconbtn\" id=\"qInfoBtn\" title=\"View the CDA queries behind this dashboard\" aria-label=\"View the CDA queries behind this dashboard\" onclick=\"PDC.queryModal()\">&#9432;</button>\n" +
      "  <button class=\"pdc-iconbtn\" id=\"themeBtn\" aria-label=\"Toggle dark/light mode\" onclick=\"PDC.toggleTheme()\">&#9790; Dark</button>\n" +
      "  " + launcher + "\n</header>\n" +
      "<div class=\"pdc-wrap\">\n  <div class=\"pdc-kpis\" id=\"kpis\"></div>\n" +
      "  <div id=\"content\"><div class=\"loading\">Loading…</div></div>\n" +
      "  <div class=\"pdc-foot\">Pentaho Data Catalog Analytics · built with Dashboard Studio (analytics.polecat.live) · data via CDA over <code>" +
      xml(spec.cda.connection.jndi) + "</code> · no external dependencies</div>\n</div>\n";
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
