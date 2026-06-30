/* ============================================================================
   pentaho.js — Pentaho server integration for the Studio.
     • Studio.kettle           — parse/serialize Kettle <slaveserver> XML
     • Studio.parseCDA(xml)     — CDA XML → catalog entry {connection, dataAccesses}
     • Studio.PentahoClient(c)  — REST client (browse repo, fetch, doQuery, publish)
   Network methods use the standard Pentaho APIs and the connection's auth; they
   require a reachable server (same-origin cookie session, or CORS + Basic auth).
   Pure builders (urls, kettle, parseCDA) are dependency-free + unit-tested.
   ============================================================================ */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  /* ---------- Kettle <slaveserver> XML (the standard server definition) ---------- */
  function xmlEsc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  Studio.kettle = {
    // parse one or many <slaveserver> elements → connection objects
    parse: function (xml) {
      var doc = new DOMParser().parseFromString(xml, "text/xml");
      var nodes = doc.getElementsByTagName("slaveserver");
      var out = [];
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i], t = function (tag) { var e = n.getElementsByTagName(tag)[0]; return e ? (e.textContent || "").trim() : ""; };
        var ssl = /^y/i.test(t("sslMode")), port = t("port");
        out.push({
          id: Studio.uid("conn"), name: t("name") || t("hostname") || "Pentaho",
          scheme: ssl ? "https" : "http", hostname: t("hostname") || "localhost",
          port: port || (ssl ? "8443" : "8080"), webAppName: t("webAppName") || "pentaho",
          username: t("username") || "", password: t("password") || ""   // kept verbatim (may be "Encrypted …")
        });
      }
      return out;
    },
    // serialize connections → a .xml the Kettle/Pentaho tooling understands
    serialize: function (conns) {
      return (conns || []).map(function (c) {
        return "  <slaveserver>\n" +
          "    <name>" + xmlEsc(c.name) + "</name>\n" +
          "    <hostname>" + xmlEsc(c.hostname) + "</hostname>\n" +
          "    <port>" + xmlEsc(c.port) + "</port>\n" +
          "    <webAppName>" + xmlEsc(c.webAppName || "pentaho") + "</webAppName>\n" +
          "    <username>" + xmlEsc(c.username) + "</username>\n" +
          "    <password>" + xmlEsc(c.password) + "</password>\n" +
          "    <master>N</master>\n" +
          "    <sslMode>" + (c.scheme === "https" ? "Y" : "N") + "</sslMode>\n" +
          "  </slaveserver>";
      }).join("\n");
    }
  };

  /* ---------- CDA XML → catalog entry (full round-trip parity) ---------- */
  // Maps CDA XML <DataAccess type="..."> attribute → DA_KINDS id for the inspector.
  var CDA_TYPE_TO_KIND = { sql: "sql.jndi", mdx: "mondrian.jndi", mql: "metadata",
    kettle: "kettle", scripting: "scripting", olap4j: "olap4j", xpath: "xpath" };

  Studio.parseCDA = function (cdaXml) {
    var doc = new DOMParser().parseFromString(cdaXml, "text/xml");
    function txt(el, tag) { var e = el.getElementsByTagName(tag)[0]; return e ? e.textContent.trim() : ""; }

    // --- All Connection elements (typed) ---
    var connections = [];
    var connNodes = doc.getElementsByTagName("Connection");
    for (var ci = 0; ci < connNodes.length; ci++) {
      var cn = connNodes[ci];
      var connType = cn.getAttribute("type") || "sql.jndi";
      var c = { id: cn.getAttribute("id") || "pdc", type: connType };
      if (connType === "sql.jndi")             { c.jndi = txt(cn, "Jndi"); }
      else if (connType === "sql.jdbc")        { c.driver = txt(cn, "Driver"); c.url = txt(cn, "Url"); c.user = txt(cn, "User"); c.pass = txt(cn, "Password"); }
      else if (connType === "mondrian.jndi")   { c.jndi = txt(cn, "Jndi"); c.catalog = txt(cn, "Catalog"); }
      else if (connType === "olap4j")          { c.connectString = txt(cn, "ConnectString"); }
      else if (connType === "metadata")        { c.domainId = txt(cn, "DomainId"); c.xmiFile = txt(cn, "XmiFile"); }
      else if (connType === "kettle.TransFromFile") { c.fileName = txt(cn, "KtrFile"); c.step = txt(cn, "Step") || "Output"; }
      else if (connType === "scripting")       { c.language = txt(cn, "Language") || "javascript"; }
      connections.push(c);
    }
    var firstConn = connections[0] || { id: "pdc", type: "sql.jndi", jndi: "" };
    // backward-compat: legacy {id, jndi} shape
    var connection = { id: firstConn.id, jndi: firstConn.jndi || "" };

    // --- CalculatedColumns ---
    function parseCalcCols(daEl) {
      var ccEl = daEl.getElementsByTagName("CalculatedColumns")[0]; if (!ccEl) return [];
      var ccList = ccEl.getElementsByTagName("CalculatedColumn"), out = [];
      for (var i = 0; i < ccList.length; i++) {
        var cc = ccList[i], nm = txt(cc, "Name"), fm = txt(cc, "Formula");
        if (nm && fm) out.push({ name: nm, formula: fm, type: txt(cc, "Type") || "Numeric" });
      }
      return out;
    }

    // --- OutputOptions ---
    var OP_REV = { EQ: "=", NE: "!=", GT: ">", GE: ">=", LT: "<", LE: "<=", LIKE: "contains", LIKE_START: "startsWith" };
    function parseOutputOpts(daEl) {
      var ooEl = daEl.getElementsByTagName("OutputOptions")[0]; if (!ooEl) return {};
      var sortEl = ooEl.getElementsByTagName("SortBy")[0];
      var sorts = sortEl ? sortEl.textContent.trim().split(",").filter(Boolean).map(function (s) {
        var p = s.trim().split(/\s+/); return { col: p[0], dir: (p[1] || "").toUpperCase() === "DESC" ? "desc" : "asc" };
      }) : [];
      var limitEl = ooEl.getElementsByTagName("RowLimit")[0];
      var rowLimit = limitEl ? parseInt(limitEl.textContent, 10) || 0 : 0;
      var fEls = ooEl.getElementsByTagName("Filter"), filters = [];
      for (var fi = 0; fi < fEls.length; fi++) {
        var fe = fEls[fi];
        filters.push({ col: fe.getAttribute("column") || "", op: OP_REV[fe.getAttribute("operator")] || "=", val: fe.getAttribute("value") || "" });
      }
      if (!filters.length && !sorts.length && !rowLimit) return {};
      var oo = {};
      if (filters.length) oo.filters = filters;
      if (sorts.length) oo.sortBy = sorts;
      if (rowLimit) oo.limit = rowLimit;
      return oo;
    }

    // --- DataAccess elements ---
    var das = [], daList = doc.getElementsByTagName("DataAccess");
    for (var di = 0; di < daList.length; di++) {
      var daEl = daList[di];
      if (daEl.parentNode && daEl.parentNode.nodeName === "CompoundDataAccess") continue;
      var daId = daEl.getAttribute("id"); if (!daId) continue;
      var cdaType = (daEl.getAttribute("type") || "sql").toLowerCase();
      var kind = CDA_TYPE_TO_KIND[cdaType] || "sql.jndi";
      var nameEl = daEl.getElementsByTagName("Name")[0];
      var ps = daEl.getElementsByTagName("Parameter"), params = [];
      for (var pi = 0; pi < ps.length; pi++) {
        params.push({ name: ps[pi].getAttribute("name"), type: ps[pi].getAttribute("type") || "String", default: ps[pi].getAttribute("default") || "" });
      }
      var entry = {
        id: daId, name: (nameEl && nameEl.textContent.trim()) || daId,
        kind: kind, connectionId: daEl.getAttribute("connection") || firstConn.id,
        access: daEl.getAttribute("access") || "public",
        cache: daEl.getAttribute("cache") !== "false",
        cacheDuration: +(daEl.getAttribute("cacheDuration") || 300),
        params: params, columns: [],
        calcColumns: parseCalcCols(daEl), outputOptions: parseOutputOpts(daEl)
      };
      // Kind-specific query fields
      if (cdaType === "kettle") {
        entry.ktrPath = txt(daEl, "KtrFile"); entry.ktrStep = txt(daEl, "Step") || "Output";
        entry.sql = ""; entry.query = "";
      } else if (cdaType === "scripting") {
        entry.scriptLang = txt(daEl, "Language") || "javascript";
        var qsEl = daEl.getElementsByTagName("QueryScript")[0];
        var rawSc = qsEl ? qsEl.textContent.trim() : ""; entry.sql = rawSc; entry.query = rawSc;
      } else {
        var qEl = daEl.getElementsByTagName("Query")[0];
        var rawSql = qEl ? qEl.textContent.replace(/\s+/g, " ").trim() : "";
        entry.sql = rawSql; entry.query = rawSql;
      }
      // Infer columns from SQL AS aliases
      if (cdaType === "sql") {
        var re = /\bAS\s+([a-zA-Z_]\w*)/gi, m;
        while ((m = re.exec(entry.sql))) if (entry.columns.indexOf(m[1]) < 0) entry.columns.push(m[1]);
      }
      das.push(entry);
    }

    // --- CompoundDataAccess elements ---
    var clist = doc.getElementsByTagName("CompoundDataAccess");
    for (var cmi = 0; cmi < clist.length; cmi++) {
      var cmpEl = clist[cmi], cmpId = cmpEl.getAttribute("id"); if (!cmpId) continue;
      var cmpNameEl = cmpEl.getElementsByTagName("Name")[0];
      var cmpType = cmpEl.getAttribute("type") || "join";
      var cmpDa = { id: cmpId, name: (cmpNameEl && cmpNameEl.textContent.trim()) || cmpId, kind: "compound",
        compoundType: cmpType, columns: [],
        cache: cmpEl.getAttribute("cache") !== "false", cacheDuration: +(cmpEl.getAttribute("cacheDuration") || 300) };
      if (cmpType === "union") {
        var memEls = cmpEl.getElementsByTagName("DataAccess"); cmpDa.unionDas = [];
        for (var mi = 0; mi < memEls.length; mi++) { var mId = memEls[mi].getAttribute("id"); if (mId) cmpDa.unionDas.push(mId); }
      } else {
        var leftEl = cmpEl.getElementsByTagName("Left")[0], rightEl = cmpEl.getElementsByTagName("Right")[0];
        cmpDa.leftId = leftEl ? (leftEl.getAttribute("id") || "") : "";
        cmpDa.leftKeys = leftEl ? (leftEl.getAttribute("keys") || "") : "";
        cmpDa.rightId = rightEl ? (rightEl.getAttribute("id") || "") : "";
        cmpDa.rightKeys = rightEl ? (rightEl.getAttribute("keys") || "") : "";
      }
      das.push(cmpDa);
    }

    return { connection: connection, connections: connections, dataAccesses: das };
  };

  /* ---------- CDE (.cdfde + .wcdf) → editable studio spec ---------- */
  function propVal(row, name) { var ps = row.properties || []; for (var i = 0; i < ps.length; i++) if (ps[i].name === name) return ps[i].value; return ""; }
  var CCC_TO_TYPE = { cccBarChart: "bars", cccPieChart: "donut", cccLineChart: "line", cccStackedAreaChart: "areaStacked", cccTreemapChart: "treemap", cccMetricDotChart: "scatter", cccHeatGridChart: "heatmap" };

  // CDE datasource component type (e.g. "Componentssql_jndi") → CDA query kind.
  function cdaKind(t) {
    t = String(t || "").replace(/^Components/, "").toLowerCase();
    if (t.indexOf("mdx") === 0) return "mdx";
    if (t.indexOf("olap4j") === 0) return "olap4j";
    if (t.indexOf("mql") === 0 || t.indexOf("metadata") === 0) return "mql";
    if (t.indexOf("kettle") === 0) return "kettle";
    if (t.indexOf("scripting") === 0) return "scripting";
    if (t.indexOf("xpath") === 0) return "xpath";
    if (t.indexOf("compound") === 0 || t.indexOf("join") === 0 || t.indexOf("union") === 0) return "compound";
    return "sql";
  }
  function jsonAttr(v, fallback) { try { return JSON.parse(v); } catch (e) { return fallback; } }
  function colsFromSql(sql) { var cols = [], re = /\bAS\s+([a-zA-Z_]\w*)/gi, m; sql = String(sql || ""); while ((m = re.exec(sql))) if (cols.indexOf(m[1]) < 0) cols.push(m[1]); return cols; }
  Studio.colsFromSql = colsFromSql;   // reused by the data-source builder's "detect columns"

  // Reconstruct an editable CDA ({connection, dataAccesses}) purely from a .cdfde's
  // embedded `datasources` section — so a lone .cdfde is enough to render + edit.
  Studio.cdaFromCdfde = function (cdfde) {
    var j = typeof cdfde === "string" ? JSON.parse(cdfde) : cdfde;
    var rows = (j.datasources && j.datasources.rows) || [];
    var das = [], jndi = "";
    rows.forEach(function (r) {
      if (!r || r.type === "Label" || !r.properties) return;
      var id = propVal(r, "name"); if (!id) return;
      var kind = cdaKind(r.type);
      var query = propVal(r, "query") || "";
      if (!jndi) jndi = propVal(r, "jndi") || "";
      // declared CDA columns first ([["name"],…] or ["name",…]); else infer from SQL aliases
      var declared = jsonAttr(propVal(r, "cdacolumns"), []) || [];
      var cols = declared.map(function (c) { return Array.isArray(c) ? c[0] : (c && c.name) || c; }).filter(Boolean);
      if (!cols.length && kind === "sql") cols = colsFromSql(query);
      // CdaParameters form: [[name, displayName, type, default, …], …]
      var rawP = jsonAttr(propVal(r, "parameters"), []) || [];
      var params = rawP.map(function (p) { return { name: p[0], type: p[2] || "String", default: p[3] || "" }; }).filter(function (p) { return p.name; });
      var calc = jsonAttr(propVal(r, "cdacalculatedcolumns"), []) || [];
      das.push({
        id: id, name: id, kind: kind, jndi: propVal(r, "jndi") || jndi,
        catalog: propVal(r, "catalog") || "", access: propVal(r, "access") || "public",
        sql: query, query: query, params: params, columns: cols, calc: calc,
        cache: String(propVal(r, "cache")) !== "false",
        cacheDuration: +(propVal(r, "cacheDuration") || 3600)
      });
    });
    return { connection: { id: "pdc", jndi: jndi }, dataAccesses: das };
  };
  // cda = parsed CDA ({connection, dataAccesses}) so component column mapping is exact
  Studio.parseCDE = function (cdfde, wcdf, cda) {
    var j = typeof cdfde === "string" ? JSON.parse(cdfde) : cdfde;
    var spec = Studio.emptySpec();
    if (wcdf) {
      var wd = new DOMParser().parseFromString(wcdf, "text/xml");
      var g = function (t) { var e = wd.getElementsByTagName(t)[0]; return e ? (e.textContent || "").trim() : ""; };
      if (g("title")) spec.title = g("title").replace(/\s*\(CDE\)\s*$/, "");
      spec.description = g("description") || "";
    }
    // no CDA supplied? reconstruct one from the .cdfde's embedded datasources,
    // so a lone .cdfde renders + edits with real queries, params and columns.
    cda = cda || Studio.cdaFromCdfde(j) || { connection: spec.cda.connection, dataAccesses: [] };
    spec.cda.connection = cda.connection || spec.cda.connection;
    if (cda.connections && cda.connections.length) spec.cda.connections = cda.connections.map(function (c) { return JSON.parse(JSON.stringify(c)); });
    spec.cda.dataAccesses = (cda.dataAccesses || []).map(function (d) { return JSON.parse(JSON.stringify(d)); });
    var daById = function (id) { return spec.cda.dataAccesses.filter(function (x) { return x.id === id; })[0] || { id: id, columns: [] }; };
    // layout column name → span
    var spanByCol = {};
    ((j.layout && j.layout.rows) || []).forEach(function (r) {
      if (r.type === "LayoutColumn") { var nm = propVal(r, "name"), span = +propVal(r, "columnSpan") || 0; if (nm) spanByCol[nm] = span >= 24 ? "full" : 1; }
    });
    ((j.components && j.components.rows) || []).forEach(function (c) {
      if (!c.type || c.type.indexOf("Components") !== 0) return;
      var t = CCC_TO_TYPE[c.type.replace(/^Components/, "")]; if (!t) return;
      var da = propVal(c, "dataSource"), col = (propVal(c, "htmlObject") || "").replace(/^\$\{h:|\}$/g, "");
      var p = Studio.newPanel(t, daById(da));
      if (spanByCol[col]) p.span = spanByCol[col];
      if (t === "bars" && p.chart.opts) p.chart.opts.horizontal = propVal(c, "orientation") !== "vertical";
      var h = +propVal(c, "height") || 0; if (h && p.chart.opts && "height" in p.chart.opts) p.chart.opts.height = h;
      p.title = Studio.titleize(da);
      spec.panels.push(p);
    });
    spec.gridCols = 2;
    return spec;
  };

  /* ---------- CDF (.html) → spec (Studio exports embed window.STUDIO_SPEC) ---------- */
  Studio.parseCDFHtml = function (html) {
    var m = /window\.STUDIO_SPEC\s*=\s*\{/.exec(html); if (!m) return null;   // the assignment, not toolkit refs
    var b = m.index + m[0].length - 1;
    var depth = 0, inStr = false, esc = false, end = -1;
    for (var k = b; k < html.length; k++) {
      var ch = html[k];
      if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; }
      else if (ch === '"') inStr = true; else if (ch === "{") depth++; else if (ch === "}") { depth--; if (depth === 0) { end = k + 1; break; } }
    }
    if (end < 0) return null;
    try { return JSON.parse(html.slice(b, end)); } catch (e) { return null; }
  };

  /* ---------- REST client ---------- */
  function repoId(p) { return (p.charAt(0) === "/" ? p : "/" + p).replace(/\//g, ":"); }   // Pentaho encodes every / (incl. leading) as :
  Studio.PentahoClient = function (conn) {
    function base() { return conn.scheme + "://" + conn.hostname + (conn.port ? (":" + conn.port) : "") + "/" + (conn.webAppName || "pentaho"); }
    function headers() { var h = {}; if (conn.username) h.Authorization = "Basic " + btoa(conn.username + ":" + (conn.password || "")); return h; }
    function go(url, opts) { opts = opts || {}; opts.credentials = "include"; opts.headers = Object.assign(headers(), opts.headers || {}); return fetch(url, opts); }

    function flatten(node, acc) {
      if (!node) return acc;
      var f = node.file || node;
      if (f && f.path && f.name && f.folder !== true && f.folder !== "true") {
        var ext = (f.name.split(".").pop() || "").toLowerCase();
        acc.push({ path: f.path, name: f.name, ext: ext, title: f.title || f.name });
      }
      (node.children || []).forEach(function (c) { flatten(c, acc); });
      return acc;
    }

    var api = {
      base: base,
      contentUrl: function (path) { return base() + "/api/repos/" + repoId(path) + "/content"; },
      treeUrl: function (dir, filter) { return base() + "/api/repo/files/" + repoId(dir || "/public") + "/tree?depth=-1&showHidden=false&filter=" + encodeURIComponent(filter || "*"); },
      doQueryUrl: function (cdaPath, da, params) {
        var u = base() + "/plugin/cda/api/doQuery?path=" + encodeURIComponent(cdaPath) + "&dataAccessId=" + encodeURIComponent(da) + "&outputType=json";
        if (params) for (var k in params) u += "&param" + encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
        return u;
      },
      publishUrl: function () { return base() + "/api/repo/publish/publishfile"; },
      // browse the repo for studio-relevant files
      listFiles: function (dir, filter) {
        return go(api.treeUrl(dir, filter || "*.cda|*.cdfde|*.wcdf|*.xcdf|*.html"), { headers: { Accept: "application/json" } })
          .then(function (r) { if (!r.ok) throw new Error("list HTTP " + r.status); return r.json(); })
          .then(function (j) { return flatten(j, []); });
      },
      getFile: function (path) { return go(api.contentUrl(path), { headers: { Accept: "*/*" } }).then(function (r) { if (!r.ok) throw new Error("get HTTP " + r.status); return r.text(); }); },
      doQuery: function (cdaPath, da, params) {
        return go(api.doQueryUrl(cdaPath, da, params), { headers: { Accept: "application/json" } }).then(function (r) { if (!r.ok) throw new Error("doQuery HTTP " + r.status); return r.json(); });
      },
      // publish (push) a single file to the repo via the standard import API
      publishFile: function (path, content, mime, overwrite) {
        var dir = path.replace(/\/[^/]*$/, "") || "/public", name = path.split("/").pop();
        var fd = new FormData();
        fd.append("importPath", dir);
        fd.append("fileUpload", new Blob([content], { type: mime || "text/plain" }), name);
        fd.append("overwriteFile", overwrite === false ? "false" : "true");
        fd.append("overwrite", overwrite === false ? "false" : "true");
        fd.append("applyAclPermissions", "false"); fd.append("retainOwnership", "true");
        return go(api.publishUrl(), { method: "POST", body: fd }).then(function (r) { return { ok: r.ok, status: r.status, path: dir + "/" + name }; });
      },
      // shape (no network) — for tests / preview of what publish will send
      publishDescriptor: function (path) { var dir = path.replace(/\/[^/]*$/, "") || "/public"; return { url: api.publishUrl(), importPath: dir, name: path.split("/").pop() }; }
    };
    return api;
  };
})();
