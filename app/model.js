/* ============================================================================
   model.js — PDC Dashboard Studio canonical model
   The chart registry + spec helpers shared by the builder, the live preview
   render runtime, and every exporter (CDF html / CDE .cdfde+.wcdf / .cda).
   Pure data + helpers; no DOM. Loaded as a plain <script> -> window.Studio.
   ============================================================================ */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  /* ---- value formatters (names map to PDC.fmt; 'plain' = identity) ---- */
  Studio.FORMATS = [
    { id: "abbr",  label: "Abbreviated (1.2K)" },
    { id: "n",     label: "Number (1,200)" },
    { id: "money", label: "Money ($1.2K)" },
    { id: "pct",   label: "Percent (12.3%)" },
    { id: "gb",    label: "Storage (GB/TB)" },
    { id: "bytes", label: "Bytes (KB/MB/GB)" },
    { id: "plain", label: "Plain text" }
  ];
  // Resolve a fmt id to a function against a (already-loaded) PDC.fmt.
  Studio.fmtFn = function (id, PDC) {
    if (!PDC || !PDC.fmt) return function (v) { return v; };
    if (id === "plain" || !id) return function (v) { return v == null ? "" : String(v); };
    return PDC.fmt[id] || PDC.fmt.abbr;
  };

  /* ---- color tokens offered in the inspector ---- */
  Studio.COLOR_TOKENS = [
    "--pentaho", "--pdc", "--c1", "--c2", "--c3", "--c4", "--c5",
    "--c6", "--c7", "--c8", "--c9", "--c10", "--good", "--warn", "--bad", "--info"
  ];
  Studio.KPI_STATES = [
    { id: "",       label: "Default (blue)" },
    { id: "purple", label: "Purple" },
    { id: "good",   label: "Good (green)" },
    { id: "warn",   label: "Warn (amber)" },
    { id: "bad",    label: "Bad (red)" }
  ];
  Studio.PALETTE = "['#005bb5','#7d3c98','#2e8bd0','#9b59b6','#00a39a','#e67e22','#c0392b','#16a085']";

  /* ---- chart registry: the heart of the model ----
     Each entry declares how a chart type binds columns + which knobs it exposes,
     plus how it maps to a CDE/CCC component. `fields` drives the inspector. */
  Studio.CHARTS = {
    bars: {
      label: "Bar chart", icon: "▭", group: "Comparison",
      fields: ["labelCol", "valueCol"],
      opts: [
        { key: "horizontal", type: "bool",   label: "Horizontal", def: true },
        { key: "rotate",     type: "bool",   label: "Rotate labels", def: false },
        { key: "fmt",        type: "fmt",    label: "Value format", def: "abbr" },
        { key: "color",      type: "color",  label: "Bar color", def: "--pentaho" },
        { key: "height",     type: "int",    label: "Height (px)", def: 300 }
      ],
      cde: { type: "cccBarChart", extra: function (c) {
        return [["orientation", "Orientation", c.opts && c.opts.horizontal === false ? "vertical" : "horizontal"],
                ["valuesVisible", "Boolean", "true"]]; } }
    },
    donut: {
      label: "Donut / pie", icon: "◍", group: "Composition",
      fields: ["labelCol", "valueCol"],
      opts: [
        { key: "centerCap", type: "text",  label: "Center caption", def: "Total" },
        { key: "fmt",       type: "fmt",   label: "Value format", def: "abbr" },
        { key: "height",    type: "int",   label: "Height (px)", def: 300 }
      ],
      cde: { type: "cccPieChart", extra: function () { return [["valuesVisible", "Boolean", "true"]]; } }
    },
    line: {
      label: "Line / area", icon: "📈", group: "Trend",
      fields: ["labelCol", "series"],
      opts: [
        { key: "area",   type: "bool",  label: "Area fill", def: true },
        { key: "fmt",    type: "fmt",   label: "Value format", def: "abbr" },
        { key: "height", type: "int",   label: "Height (px)", def: 300 }
      ],
      cde: { type: "cccLineChart", extra: function () { return [["valuesVisible", "Boolean", "false"]]; } }
    },
    stacked: {
      label: "Stacked bars", icon: "▤", group: "Composition",
      fields: ["labelCol", "series"],
      opts: [
        { key: "rotate", type: "bool", label: "Rotate labels", def: false },
        { key: "fmt",    type: "fmt",  label: "Value format", def: "abbr" },
        { key: "height", type: "int",  label: "Height (px)", def: 300 }
      ],
      cde: { type: "cccBarChart", extra: function () {
        return [["orientation", "Orientation", "vertical"], ["stacked", "Boolean", "true"], ["valuesVisible", "Boolean", "false"]]; } }
    },
    areaStacked: {
      label: "Stacked area", icon: "◣", group: "Trend",
      fields: ["labelCol", "series"],
      opts: [
        { key: "fmt",    type: "fmt", label: "Value format", def: "abbr" },
        { key: "height", type: "int", label: "Height (px)", def: 300 }
      ],
      cde: { type: "cccStackedAreaChart", extra: function () { return [["stacked", "Boolean", "true"], ["valuesVisible", "Boolean", "false"]]; } }
    },
    combo: {
      label: "Bar + line", icon: "◭", group: "Trend",
      fields: ["labelCol", "barCol", "lineCol"],
      opts: [
        { key: "fmt",       type: "fmt",   label: "Bar (left) format", def: "abbr" },
        { key: "fmt2",      type: "fmt",   label: "Line (right) format", def: "abbr" },
        { key: "lineColor", type: "color", label: "Line color", def: "--pdc" },
        { key: "color",     type: "color", label: "Bar color", def: "--pentaho" },
        { key: "height",    type: "int",   label: "Height (px)", def: 300 }
      ],
      cde: null // CDF-only (no clean single CCC equivalent)
    },
    radar: {
      label: "Radar / spider", icon: "✷", group: "Comparison",
      fields: ["labelCol", "series"],
      opts: [
        { key: "fill",   type: "bool", label: "Fill polygons", def: true },
        { key: "fmt",    type: "fmt",  label: "Value format", def: "abbr" },
        { key: "height", type: "int",  label: "Height (px)", def: 300 }
      ],
      cde: null // CDF-only (no clean single CCC equivalent)
    },
    waterfall: {
      label: "Waterfall", icon: "↘", group: "Comparison",
      fields: ["labelCol", "valueCol"],
      opts: [
        { key: "showTotal",  type: "bool", label: "Show total bar", def: true },
        { key: "totalLabel", type: "text", label: "Total label",    def: "Total" },
        { key: "fmt",        type: "fmt",  label: "Value format",   def: "abbr" },
        { key: "height",     type: "int",  label: "Height (px)",    def: 300 }
      ],
      cde: null // CDF-only
    },
    sankey: {
      label: "Sankey (flow)", icon: "⇢", group: "Flow",
      fields: ["sourceCol", "targetCol", "valueCol"],
      opts: [
        { key: "srcCap",  type: "text", label: "Source caption",       def: "Source" },
        { key: "dstCap",  type: "text", label: "Destination caption",   def: "Destination" },
        { key: "fmt",     type: "fmt",  label: "Value format",          def: "abbr" },
        { key: "height",  type: "int",  label: "Height (px)",           def: 360 }
      ],
      cde: null // CDF-only
    },
    funnel: {
      label: "Funnel", icon: "⋁", group: "Comparison",
      fields: ["labelCol", "valueCol"],
      opts: [
        { key: "showPct", type: "bool", label: "Show conversion %", def: true },
        { key: "fmt",     type: "fmt",  label: "Value format",      def: "abbr" },
        { key: "height",  type: "int",  label: "Height (px)",       def: 300 }
      ],
      cde: null // CDF-only
    },
    chord: {
      label: "Chord / wheel", icon: "◎", group: "Flow",
      fields: ["sourceCol", "targetCol", "valueCol"],
      opts: [
        { key: "fmt",    type: "fmt", label: "Value format", def: "abbr" },
        { key: "height", type: "int", label: "Height (px)",  def: 360 }
      ],
      cde: null // CDF-only
    },
    sunburst: {
      label: "Sunburst", icon: "◉", group: "Composition",
      fields: ["labelCol", "valueCol", "groupCol"],
      opts: [
        { key: "showLabels", type: "bool", label: "Show arc labels", def: true },
        { key: "fmt",        type: "fmt",  label: "Value format",    def: "abbr" },
        { key: "height",     type: "int",  label: "Height (px)",     def: 300 }
      ],
      cde: null // CDF-only; no equivalent CCC chart
    },
    bullet: {
      label: "Bullet chart", icon: "▶", group: "Single value",
      fields: ["labelCol", "valueCol", "targetCol"],
      opts: [
        { key: "max",    type: "int", label: "Max value (0 = auto)", def: 0 },
        { key: "fmt",    type: "fmt", label: "Value format",         def: "abbr" },
        { key: "height", type: "int", label: "Height (px)",          def: 220 }
      ],
      cde: null // CDF-only; no clean CCC bullet equivalent
    },
    calHeatmap: {
      label: "Calendar heatmap", icon: "⬦", group: "Distribution",
      fields: ["dateCol", "valueCol"],
      opts: [
        { key: "fmt",    type: "fmt", label: "Value format", def: "n" },
        { key: "height", type: "int", label: "Height (px)",  def: 190 }
      ],
      cde: null // CDF-only; requires daily YYYY-MM-DD date column
    },
    treemap: {
      label: "Treemap", icon: "▦", group: "Composition",
      fields: ["labelCol", "valueCol"],
      opts: [
        { key: "fmt",    type: "fmt", label: "Value format", def: "abbr" },
        { key: "height", type: "int", label: "Height (px)", def: 300 }
      ],
      cde: { type: "cccTreemapChart", extra: function () { return [["valuesVisible", "Boolean", "true"]]; } }
    },
    scatter: {
      label: "Scatter / bubble", icon: "✦", group: "Distribution",
      fields: ["xCol", "yCol", "rCol", "labelCol"],
      opts: [
        { key: "xLabel", type: "text", label: "X axis label", def: "" },
        { key: "yLabel", type: "text", label: "Y axis label", def: "" },
        { key: "height", type: "int",  label: "Height (px)", def: 300 }
      ],
      cde: { type: "cccMetricDotChart", extra: function () { return [["valuesVisible", "Boolean", "false"]]; } }
    },
    gauge: {
      label: "Gauge", icon: "◑", group: "Single value",
      fields: ["valueCol"],
      opts: [
        { key: "max",  type: "int",  label: "Max", def: 100 },
        { key: "unit", type: "text", label: "Unit", def: "%" }
      ],
      cde: null // CDF-only
    },
    heatmap: {
      label: "Heatmap (pivot)", icon: "▓", group: "Distribution",
      fields: ["rowCol", "colCol", "valueCol"],
      opts: [
        { key: "fmt",     type: "fmt",  label: "Value format", def: "abbr" },
        { key: "showVals", type: "bool", label: "Show values", def: true },
        { key: "height",  type: "int",  label: "Height (px)", def: 320 }
      ],
      cde: { type: "cccHeatGridChart", extra: function () { return [["valuesVisible", "Boolean", "true"]]; } }
    },
    table: {
      label: "Table", icon: "▥", group: "Detail",
      fields: ["cols"],
      opts: [],
      cde: { type: "Table", extra: function () { return []; } }
    }
  };
  // chart types that the CDE/CCC export cannot represent natively
  Studio.cdeUnsupported = function (type) {
    var c = Studio.CHARTS[type];
    return !c || !c.cde;
  };
  Studio.cdeFallback = function (type) {
    var c = Studio.CHARTS[type];
    return !!(c && c.cde && c.cde.fallback);
  };

  /* ---- spec helpers ---- */
  var _uid = 0;
  Studio.uid = function (p) { _uid += 1; return (p || "p") + _uid + "_" + (Date.now() % 100000); };

  Studio.emptySpec = function () {
    return {
      schema: 1,
      id: Studio.uid("dash"),
      name: "untitled",
      title: "Untitled Dashboard",
      subtitle: "",
      group: "Observability",
      description: "",
      cda: { connection: { id: "pdc", jndi: "PDC-BIDB-EXT" },
             connections: [{ id: "pdc", type: "sql.jndi", jndi: "PDC-BIDB-EXT" }],
             dataAccesses: [] },
      filters: [],
      kpis: [],
      gridCols: 3,
      panels: []
    };
  };

  // find a dataAccess def in the spec by id
  Studio.daById = function (spec, id) {
    return (spec.cda.dataAccesses || []).filter(function (d) { return d.id === id; })[0] || null;
  };
  // ensure a dataAccess from the catalog is present in the spec (so exports are self-contained)
  Studio.ensureDA = function (spec, daDef) {
    if (!daDef) return;
    if (!Studio.daById(spec, daDef.id)) spec.cda.dataAccesses.push(JSON.parse(JSON.stringify(daDef)));
  };
  Studio.columnsOf = function (spec, daId) {
    var d = Studio.daById(spec, daId);
    return (d && d.columns) || [];
  };

  // default panel for a chart type bound to a dataAccess (auto column mapping)
  Studio.newPanel = function (type, daDef) {
    var cols = (daDef && daDef.columns) || [];
    var c = Studio.CHARTS[type] || Studio.CHARTS.bars;
    var map = {};
    if (type === "line" || type === "stacked" || type === "areaStacked") {
      map.labelCol = cols[0] || "";
      map.series = cols.slice(1, 2).map(function (col) { return { col: col }; });
      if (!map.series.length && cols[1]) map.series = [{ col: cols[1] }];
    } else if (type === "scatter") {
      map.xCol = cols[1] || cols[0] || ""; map.yCol = cols[2] || cols[1] || "";
      map.rCol = cols[3] || ""; map.labelCol = cols[0] || "";
    } else if (type === "heatmap") {
      map.rowCol = cols[0] || ""; map.colCol = cols[1] || ""; map.valueCol = cols[2] || cols[1] || "";
    } else if (type === "table") {
      map.cols = cols.map(function (col, i) { return { col: col, label: titleize(col), num: i > 0 }; });
    } else if (type === "gauge") {
      map.valueCol = cols[1] || cols[0] || "";
    } else if (type === "combo") {
      map.labelCol = cols[0] || ""; map.barCol = cols[1] || cols[0] || ""; map.lineCol = cols[2] || cols[1] || "";
    } else if (type === "sankey" || type === "chord") {
      map.sourceCol = cols[0] || ""; map.targetCol = cols[1] || cols[0] || ""; map.valueCol = cols[2] || cols[1] || "";
    } else if (type === "sunburst") {
      map.labelCol = cols[0] || ""; map.valueCol = cols[1] || cols[0] || ""; map.groupCol = cols[2] || "";
    } else if (type === "bullet") {
      map.labelCol = cols[0] || ""; map.valueCol = cols[1] || cols[0] || ""; map.targetCol = cols[2] || "";
    } else if (type === "calHeatmap") {
      map.dateCol = cols[0] || ""; map.valueCol = cols[1] || cols[0] || "";
    } else { // bars, donut, treemap, funnel, waterfall
      map.labelCol = cols[0] || ""; map.valueCol = cols[1] || cols[0] || "";
    }
    var opts = {};
    (c.opts || []).forEach(function (o) { opts[o.key] = o.def; });
    return {
      id: Studio.uid("p"),
      title: daDef ? titleize(daDef.id) : c.label,
      span: 1,
      pill: "", sub: "", info: "",
      src: daDef ? daSource(daDef) : "",
      chart: { type: type, da: daDef ? daDef.id : "", map: map, opts: opts }
    };
  };

  Studio.newKpi = function (daDef) {
    var cols = (daDef && daDef.columns) || [];
    return { da: daDef ? daDef.id : "", valueCol: cols[0] || "", label: daDef ? titleize(daDef.id) : "Metric",
             fmt: "n", state: "", info: "" };
  };

  // best-effort "source" provenance caption from the SQL (first table after FROM)
  function daSource(da) {
    var m = /\bFROM\s+([a-zA-Z_][\w.]*)/i.exec(da.sql || "");
    return m ? m[1] : (da.name || da.id);
  }
  Studio.daSource = daSource;

  function titleize(s) {
    if (!s) return "";
    // split camelCase + snake/kebab into words
    return String(s)
      .replace(/[_-]+/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, function (c) { return c.toUpperCase(); })
      .replace(/\bCo2e\b/i, "CO2e").replace(/\bTb\b/, "TB").replace(/\bGb\b/, "GB")
      .replace(/\bKpi\b/i, "KPI").replace(/\bPct\b/i, "%");
  }
  Studio.titleize = titleize;

  // map an output column name -> a sensible default fmt id (used on auto-bind)
  Studio.guessFmt = function (col) {
    var c = String(col || "").toLowerCase();
    if (/cost|usd|monthly|annual|reclaim|saving|spend|price/.test(c)) return "money";
    if (/\btb\b|\bgb\b|bytes|size|storage|footprint/.test(c)) return "gb";
    if (/pct|percent|rate|coverage|completeness|ratio/.test(c)) return "pct";
    return "abbr";
  };

  Studio.clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  /* ---- CDA authoring helpers ---- */
  Studio.DA_KINDS = [
    { id: "sql.jndi",      label: "SQL / JNDI (connection pool)" },
    { id: "sql.jdbc",      label: "SQL / JDBC (direct connection)" },
    { id: "mondrian.jndi", label: "Mondrian MDX (JNDI)" },
    { id: "olap4j",        label: "OLAP4J" },
    { id: "metadata",      label: "Metadata (MQL)" },
    { id: "kettle",        label: "Kettle (.ktr transform)" },
    { id: "scripting",     label: "Scripting (JS / Groovy)" }
  ];
  Studio.COLUMN_TYPES = ["String", "Integer", "Numeric", "Date", "Boolean"];
  Studio.newDA = function () {
    return { id: Studio.uid("da"), name: "", kind: "sql.jndi", connectionId: "", sql: "", columns: [], params: [], calcColumns: [], cache: true, cacheDuration: 300 };
  };
  Studio.newCalcCol = function () { return { name: "", formula: "", type: "Numeric" }; };
  Studio.newCompoundDA = function (compoundType) {
    return { id: Studio.uid("cda"), name: "", kind: "compound", compoundType: compoundType || "join",
             leftId: "", rightId: "", leftKeys: "", rightKeys: "",
             unionDas: [], columns: [], cache: true, cacheDuration: 300 };
  };
  Studio.isCompoundDA = function (da) { return da && da.kind === "compound"; };

  /* ---- CDA connections ---- */
  Studio.CDA_CONNECTION_TYPES = [
    { id: "sql.jndi",             label: "SQL / JNDI",              fields: [{ key: "jndi",          label: "JNDI pool name",    ph: "PDC-BIDB-EXT" }] },
    { id: "sql.jdbc",             label: "SQL / JDBC (direct)",     fields: [{ key: "driver",         label: "JDBC driver class", ph: "org.postgresql.Driver" },
                                                                               { key: "url",            label: "JDBC URL",          ph: "jdbc:postgresql://host:5432/db" },
                                                                               { key: "user",           label: "User",              ph: "pentaho" },
                                                                               { key: "pass",           label: "Password",          ph: "", secret: true }] },
    { id: "mondrian.jndi",        label: "Mondrian MDX / JNDI",     fields: [{ key: "jndi",           label: "JNDI pool name",    ph: "PDC-BIDB-EXT" },
                                                                               { key: "catalog",        label: "Schema catalog path", ph: "/pentaho/etc/mondrian/schema.xml" }] },
    { id: "olap4j",               label: "OLAP4J",                  fields: [{ key: "connectString",  label: "Connect string",    ph: "Provider=Mondrian;DataSource=..." }] },
    { id: "metadata",             label: "Metadata / MQL",          fields: [{ key: "domainId",       label: "Domain ID",         ph: "pdc" },
                                                                               { key: "xmiFile",        label: "XMI file path",     ph: "/etc/metadata.xmi" }] },
    { id: "kettle.TransFromFile", label: "Kettle / PDI transform",  fields: [{ key: "fileName",       label: ".ktr file path",    ph: "/public/etl/my.ktr" },
                                                                               { key: "step",           label: "Output step name",  ph: "Output" }] },
    { id: "scripting",            label: "Scripting (JS / Groovy)", fields: [{ key: "language",       label: "Language",          ph: "javascript" }] }
  ];

  Studio.newCDAConnection = function (type) {
    return { id: Studio.uid("conn"), type: type || "sql.jndi",
             jndi: "", driver: "", url: "", user: "", pass: "",
             catalog: "", connectString: "", domainId: "", xmiFile: "",
             fileName: "", step: "", language: "javascript" };
  };

  /* ---- output options (post-query filter / sort / limit) ---- */
  Studio.DA_OPS = [
    { id: "=",          label: "= equals" },
    { id: "!=",         label: "≠ not equals" },
    { id: ">",          label: "> greater than" },
    { id: ">=",         label: "≥ greater or equal" },
    { id: "<",          label: "< less than" },
    { id: "<=",         label: "≤ less or equal" },
    { id: "contains",   label: "contains (text)" },
    { id: "startsWith", label: "starts with" }
  ];
  Studio.newOutputFilter = function () { return { col: "", op: "=", val: "" }; };
  Studio.newOutputSort   = function () { return { col: "", dir: "asc" }; };

  // Apply outputOptions (filters / sortBy / limit) to a {cols, rows} result.
  // Returns a new object with the same cols and a new, filtered/sorted/limited rows array.
  Studio.applyOutputOptions = function (da, result) {
    if (!da || !da.outputOptions) return result;
    var oo = da.outputOptions;
    var cols = result.cols;
    var rows = result.rows.slice();

    // filters — skip entries with no column or empty value
    var activeFilters = (oo.filters || []).filter(function (f) { return f.col && String(f.val || "") !== ""; });
    activeFilters.forEach(function (f) {
      var ci = cols.indexOf(f.col);
      if (ci < 0) return;
      rows = rows.filter(function (row) {
        var sv = String(row[ci] == null ? "" : row[ci]);
        var fv = String(f.val);
        var nv = parseFloat(sv), fnv = parseFloat(fv);
        var numCmp = !isNaN(nv) && !isNaN(fnv);
        switch (f.op) {
          case "=":          return numCmp ? nv === fnv : sv === fv;
          case "!=":         return numCmp ? nv !== fnv : sv !== fv;
          case ">":          return numCmp ? nv > fnv   : sv > fv;
          case ">=":         return numCmp ? nv >= fnv  : sv >= fv;
          case "<":          return numCmp ? nv < fnv   : sv < fv;
          case "<=":         return numCmp ? nv <= fnv  : sv <= fv;
          case "contains":   return sv.toLowerCase().indexOf(fv.toLowerCase()) >= 0;
          case "startsWith": return sv.toLowerCase().indexOf(fv.toLowerCase()) === 0;
          default: return true;
        }
      });
    });

    // sort
    var activeSorts = (oo.sortBy || []).filter(function (s) { return s.col; });
    if (activeSorts.length) {
      rows.sort(function (a, b) {
        for (var i = 0; i < activeSorts.length; i++) {
          var s = activeSorts[i];
          var ci = cols.indexOf(s.col);
          if (ci < 0) continue;
          var av = a[ci], bv = b[ci];
          var na = parseFloat(av), nb = parseFloat(bv);
          var cmp = (!isNaN(na) && !isNaN(nb)) ? na - nb : String(av || "").localeCompare(String(bv || ""));
          if (cmp !== 0) return s.dir === "desc" ? -cmp : cmp;
        }
        return 0;
      });
    }

    // row limit
    var limit = oo.limit ? parseInt(oo.limit, 10) : 0;
    if (limit > 0) rows = rows.slice(0, limit);

    return { cols: cols, rows: rows };
  };

  // Map a DA kind to the CDA XML <DataAccess type="..."> attribute value.
  Studio.daAccessType = function (kind) {
    if (!kind || /^sql/.test(kind)) return "sql";
    if (kind === "mondrian.jndi") return "mdx";
    if (kind === "olap4j") return "olap4j";
    if (kind === "metadata") return "mql";
    if (/^kettle/.test(kind)) return "kettle";
    if (kind === "scripting") return "scripting";
    return "sql";
  };

  // extract column aliases from SQL (SELECT … AS alias …)
  Studio.detectColumns = function (sql) {
    var out = [], seen = {};
    var re = /\bAS\s+([`"'\[]?[a-zA-Z_]\w*[`"'\]]?)/gi, m;
    while ((m = re.exec(sql || "")) !== null) {
      var col = m[1].replace(/^[`"'\[]+|[`"'\]]+$/g, "");
      if (!seen[col]) { seen[col] = 1; out.push(col); }
    }
    return out;
  };

  // basic validation -> array of {level, msg}
  Studio.validate = function (spec) {
    var out = [];
    if (!spec.name || !/^[a-z0-9][a-z0-9-]*$/.test(spec.name))
      out.push({ level: "error", msg: "Name must be lowercase letters/numbers/dashes (used for file names)." });
    if (!spec.title) out.push({ level: "warn", msg: "Dashboard has no title." });
    if (!spec.panels.length && !spec.kpis.length) out.push({ level: "warn", msg: "Dashboard has no panels or KPIs." });
    spec.panels.forEach(function (p) {
      if (!p.chart.da) out.push({ level: "error", msg: "Panel “" + (p.title || p.id) + "” has no data query bound." });
      if (Studio.cdeUnsupported(p.chart.type))
        out.push({ level: "info", msg: "Panel “" + (p.title || p.id) + "” (" + p.chart.type + ") renders in CDF only — CDE export omits it." });
      else if (Studio.cdeFallback(p.chart.type))
        out.push({ level: "info", msg: "Panel “" + (p.title || p.id) + "” (" + p.chart.type + ") falls back to a bar chart in CDE export." });
    });
    return out;
  };
})();
