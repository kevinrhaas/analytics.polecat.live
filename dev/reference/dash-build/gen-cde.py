#!/usr/bin/env python3
"""gen-cde.py — emit an ACTUAL CDE-authored dashboard (.wcdf + .cdfde) that opens and is
editable in the Pentaho CDE UI. Inline SQL-over-JNDI datasources (CDE compiles them to the
same CDA/`PDC-BIDB-EXT` connection the rest of the suite uses), a blueprint layout, and CCC
chart components. Output → ../content/dashboards/. Re-run to regenerate.

This is the CDE track (distinct from the hand-written CDF "Framework" twins): true CDE
artifacts so the dashboards are editable in /pentaho CDE. Add more CDE dashboards by copying
the DASH spec below.
"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.join(HERE, "..", "content", "dashboards")
JNDI = "PDC-BIDB-EXT"
# Deploy path of THIS iteration (must match VERSION / deploy.sh). The CDE datasources reference
# a REAL deployed .cda file at this path (external-CDA datasource), NOT an inline sql_sqlJndi —
# inline datasources compile to an in-memory .cda whose doQuery 500s (charts blank). See STATUS.
VERSION = open(os.path.join(HERE, "..", "VERSION")).read().strip()
DEPLOY  = "/public/pdc-iteration/%s" % VERSION

def prop(n, t, v): return {"name": n, "type": t, "value": v}

def cda_ds(rid, name, cda_path, data_access_id):
    """External-CDA datasource (CDE 'CDA Datasource' / type CDADataSource): points the component
    at a real deployed .cda file via cdaPath + dataAccessId. This is the reliable path —
    the .cda is the same artifact the CDF twins query, so doQuery succeeds and charts populate."""
    return {"id": rid, "parent": "DSGROUP", "type": "CDADataSource", "typeDesc": "CDA Data Source",
            "properties": [
                prop("name", "Id", name), prop("access", "Access", "public"),
                prop("cdaPath", "CdaPath", cda_path),
                prop("dataAccessId", "String", data_access_id),
                prop("outputIndexId", "String", "")]}

def layout_row(rid):
    return {"id": rid, "parent": "UnIqEiD", "type": "LayoutRow", "typeDesc": "Row",
            "properties": [prop("name", "Id", ""), prop("height", "Integer", ""),
                           prop("cssClass", "String", "")]}

def layout_col(rid, parent, name, span):
    return {"id": rid, "parent": parent, "type": "LayoutColumn", "typeDesc": "Column",
            "properties": [prop("name", "Id", name), prop("columnSpan", "Integer", str(span)),
                           prop("height", "Integer", ""), prop("textAlign", "TextAlign", ""),
                           prop("cssClass", "String", "")]}

def ccc(rid, ctype, name, ds, html, extra):
    props = [prop("name", "Id", name), prop("title", "String", ""),
             prop("dataSource", "Datasource", ds), prop("htmlObject", "HtmlObject", "${h:%s}" % html),
             prop("executeAtStart", "Boolean", "true"), prop("width", "Integer", ""),
             prop("height", "Integer", "300"), prop("crosstabMode", "Boolean", "false"),
             prop("seriesInRows", "Boolean", "false"), prop("colors", "Array", "['#005bb5','#7d3c98','#2e8bd0','#9b59b6','#00a39a','#e67e22','#c0392b','#16a085']")]
    props += [prop(k, t, v) for (k, t, v) in extra]
    return {"id": rid, "parent": "CHARTS", "meta_cdwSupport": "true",
            "type": "Componentsccc%s" % ctype, "typeDesc": "CCC %s" % ctype, "properties": props}

def label(rid, text):
    return {"id": rid, "parent": "UnIqEiD", "type": "Label", "typeDesc": "<i>Group</i>", "name": text,
            "properties": [prop("Group", "Label", text)]}

# ── gentle branding: a self-contained header (inline <style> + Pentaho header bar) injected at
# the top of every CDE board so the editable CDE dashboards feel like the rest of the suite.
# Borrows the dark-blue gradient header + card styling from the HTML toolkit (build.py / pdc-ui.css).
_CDE_HOME = "/pentaho/api/repos/" + DEPLOY.strip("/").replace("/", ":") + ":i-home.html/content"
def _brand_header(title, name):
    disp = title.replace(" (CDE)", "")
    # discrete ⓘ → opens this board's deployed .cda (the queries) in a new tab. A link (not a modal)
    # because <script> injected via a CDE LayoutHtml does not reliably execute — the link always works.
    cda_url = "/pentaho/api/repos/" + (DEPLOY.strip("/") + "/" + name + ".cda").replace("/", ":") + "/content"
    css = (
      "body{background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}"
      ".pdc-cde-hdr{display:flex;align-items:center;gap:12px;background:linear-gradient(100deg,#0b2e63,#005bb5);"
      "color:#fff;padding:13px 18px;border-radius:12px;margin:8px 6px 16px;box-shadow:0 6px 18px rgba(8,33,72,.18)}"
      ".pdc-cde-hdr .lg{width:30px;height:30px;border-radius:8px;background:rgba(255,255,255,.16);display:flex;"
      "align-items:center;justify-content:center;font-weight:800;font-size:16px;flex:0 0 auto}"
      ".pdc-cde-hdr h1{font-size:17px;margin:0;font-weight:800;letter-spacing:.2px}"
      ".pdc-cde-hdr .sub{font-size:11.5px;opacity:.82;font-style:italic}"
      ".pdc-cde-hdr .right{margin-left:auto;display:flex;align-items:center;gap:12px}"
      ".pdc-cde-hdr a{color:#cfe2ff;font-size:11px;text-decoration:none;font-weight:700;white-space:nowrap}"
      ".pdc-cde-hdr a:hover{color:#fff}"
      ".pdc-cde-hdr .pill{font-size:10px;font-weight:800;letter-spacing:.5px;background:#7d3c98;padding:4px 11px;"
      "border-radius:20px;text-transform:uppercase}"
      ".pdc-cde-hdr .qinfo{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;"
      "border-radius:50%;background:rgba(255,255,255,.14);color:#fff;font-size:14px;font-weight:700;text-decoration:none}"
      ".pdc-cde-hdr .qinfo:hover{background:rgba(255,255,255,.3);color:#fff}"
      # transparent border = inter-card gutter; border-box keeps span-12+span-12 summing to 100% (side-by-side, no wrap)
      "[id$=Col]{background:#fff;background-clip:padding-box;border:7px solid transparent;border-radius:14px;"
      "padding:12px 12px 6px;box-shadow:0 2px 10px rgba(20,40,80,.07);box-sizing:border-box}"
      ".pdc-cde-foot{text-align:center;color:#8a93a6;font-size:11px;margin:18px 6px 10px}"
    )
    html = (
      "<style>%s</style>"
      "<div class='pdc-cde-hdr'><div class='lg'>P</div>"
      "<div><h1>%s</h1></div><span class='sub'>Pentaho CDE · editable</span>"
      "<div class='right'><a class='qinfo' href='%s' target='_blank' title='View the CDA queries behind this dashboard'>&#9432;</a>"
      "<a href='%s'>▸ All dashboards</a><span class='pill'>CDE</span></div></div>"
    ) % (css, disp, cda_url, _CDE_HOME)
    return [
      {"id": "hdrRow", "parent": "UnIqEiD", "type": "LayoutRow", "typeDesc": "Row",
       "properties": [prop("name", "Id", ""), prop("height", "Integer", ""), prop("cssClass", "String", "")]},
      {"id": "hdrZone", "parent": "hdrRow", "type": "LayoutColumn", "typeDesc": "Column",
       "properties": [prop("name", "Id", "hdrZone"), prop("columnSpan", "Integer", "24"),
                      prop("height", "Integer", ""), prop("textAlign", "TextAlign", ""), prop("cssClass", "String", "")]},
      {"id": "hdrHtml", "parent": "hdrZone", "type": "LayoutHtml", "typeDesc": "Html",
       "properties": [prop("name", "Id", "hdrHtml"), prop("html", "Html", html), prop("cssClass", "String", "")]},
    ]

def build(name, title, desc, datasources, layout, components):
    cdfde = {"datasources": {"rows": [label("DSGROUP", "Datasources")] + datasources},
             "layout": {"rows": _brand_header(title, name) + layout},
             "components": {"rows": [label("CHARTS", "Charts")] + components}}
    open(os.path.join(OUT, name + ".cdfde"), "w").write(json.dumps(cdfde, indent=1))
    wcdf = ('<?xml version="1.0" encoding="UTF-8"?>\n<cdf>\n  <title>%s</title>\n'
            '  <author>PDC Analytics</author>\n  <description>%s</description>\n  <icon/>\n'
            '  <style>clean</style>\n  <rendererType>blueprint</rendererType>\n'
            '  <widget>false</widget>\n  <widgetParameters/>\n</cdf>\n') % (title, desc)
    open(os.path.join(OUT, name + ".wcdf"), "w").write(wcdf)
    print("wrote %s.wcdf + .cdfde (%d datasources, %d components)" % (name, len(datasources), len(components)))

# ── CDE dashboard: Catalog Observability ────────────────────────────────────────────────
build(
  "cde-observability", "Catalog Observability (CDE)",
  "CDE-authored dashboard, editable in Pentaho CDE — assets by source &amp; sensitivity mix over PDC-BIDB-EXT.",
  datasources=[
    # External-CDA datasources → deployed cde-observability.cda (data accesses: assetsBySource / sensitivityMix / govBySource)
    cda_ds("ds-assets", "assetsBySource", DEPLOY + "/cde-observability.cda", "assetsBySource"),
    cda_ds("ds-sens",   "sensitivityMix", DEPLOY + "/cde-observability.cda", "sensitivityMix"),
    cda_ds("ds-gov",    "govBySource",    DEPLOY + "/cde-observability.cda", "govBySource"),
  ],
  layout=[
    layout_row("row1"),
    layout_col("col-bar", "row1", "barCol", 12),
    layout_col("col-pie", "row1", "pieCol", 12),
    layout_row("row2"),
    layout_col("col-gov", "row2", "govCol", 24),
  ],
  components=[
    ccc("BarChart", "BarChart", "assetsBar", "assetsBySource", "barCol",
        [("orientation", "Orientation", "horizontal"), ("valuesVisible", "Boolean", "true")]),
    ccc("PieChart", "PieChart", "sensPie", "sensitivityMix", "pieCol",
        [("valuesVisible", "Boolean", "true")]),
    ccc("BarChart", "BarChart", "govBar", "govBySource", "govCol",
        [("orientation", "Orientation", "vertical"), ("valuesVisible", "Boolean", "true")]),
  ],
)

# ── CDE dashboard: Catalog Data Movement (lineage throughput) ────────────────────────────
build(
  "cde-data-movement", "Catalog Data Movement (CDE)",
  "CDE-authored dashboard, editable in Pentaho CDE — cross-platform data movement (GB) by source, destination &amp; integration over PDC-BIDB-EXT.",
  datasources=[
    # External-CDA datasources → deployed cde-data-movement.cda (gbBySource / gbByDest / gbByIntegration over fact_lineage_connection)
    cda_ds("ds-src",   "gbBySource",      DEPLOY + "/cde-data-movement.cda", "gbBySource"),
    cda_ds("ds-dst",   "gbByDest",        DEPLOY + "/cde-data-movement.cda", "gbByDest"),
    cda_ds("ds-integ", "gbByIntegration", DEPLOY + "/cde-data-movement.cda", "gbByIntegration"),
  ],
  layout=[
    layout_row("row1"),
    layout_col("col-src", "row1", "srcCol", 12),
    layout_col("col-dst", "row1", "dstCol", 12),
    layout_row("row2"),
    layout_col("col-integ", "row2", "integCol", 24),
  ],
  components=[
    ccc("BarChart", "BarChart", "srcBar", "gbBySource", "srcCol",
        [("orientation", "Orientation", "horizontal"), ("valuesVisible", "Boolean", "true")]),
    ccc("BarChart", "BarChart", "dstBar", "gbByDest", "dstCol",
        [("orientation", "Orientation", "horizontal"), ("valuesVisible", "Boolean", "true")]),
    ccc("BarChart", "BarChart", "integBar", "gbByIntegration", "integCol",
        [("orientation", "Orientation", "vertical"), ("valuesVisible", "Boolean", "true")]),
  ],
)

# ── CDE dashboard: Cost & Sustainability ─────────────────────────────────────────────────
build(
  "cde-cost", "Cost Optimization &amp; Sustainability (CDE)",
  "CDE-authored dashboard, editable in Pentaho CDE — monthly cloud cost by source &amp; sensitivity and carbon (CO2e) by source over PDC-BIDB-EXT.",
  datasources=[
    # External-CDA datasources → deployed cde-cost.cda (costBySource / costBySensitivity / co2eBySource over entity_storage_demo)
    cda_ds("ds-cost",  "costBySource",      DEPLOY + "/cde-cost.cda", "costBySource"),
    cda_ds("ds-csens", "costBySensitivity", DEPLOY + "/cde-cost.cda", "costBySensitivity"),
    cda_ds("ds-co2",   "co2eBySource",      DEPLOY + "/cde-cost.cda", "co2eBySource"),
  ],
  layout=[
    layout_row("row1"),
    layout_col("col-cost", "row1", "costCol", 12),
    layout_col("col-csens", "row1", "csensCol", 12),
    layout_row("row2"),
    layout_col("col-co2", "row2", "co2Col", 24),
  ],
  components=[
    ccc("BarChart", "BarChart", "costBar", "costBySource", "costCol",
        [("orientation", "Orientation", "horizontal"), ("valuesVisible", "Boolean", "true")]),
    ccc("PieChart", "PieChart", "csensPie", "costBySensitivity", "csensCol",
        [("valuesVisible", "Boolean", "true")]),
    ccc("BarChart", "BarChart", "co2Bar", "co2eBySource", "co2Col",
        [("orientation", "Orientation", "vertical"), ("valuesVisible", "Boolean", "true")]),
  ],
)

# ── helper: a standard 3-chart CDE board (2 side-by-side + 1 full-width) over an external .cda ──
def cde_board(name, title, desc, a, apie, b):
    """a/apie/b = (dataAccessId, chartType) where chartType in {'bar','pie'}; a+apie row1, b full row2."""
    cda_path = DEPLOY + "/" + name + ".cda"
    def comp(rid, da, ctype, col, vert=False):
        if ctype == "pie":
            return ccc("PieChart", "PieChart", rid, da, col, [("valuesVisible", "Boolean", "true")])
        return ccc("BarChart", "BarChart", rid, da, col,
                   [("orientation", "Orientation", "vertical" if vert else "horizontal"), ("valuesVisible", "Boolean", "true")])
    build(
      name, title, desc,
      datasources=[
        cda_ds("ds-a",  a[0],    cda_path, a[0]),
        cda_ds("ds-b",  apie[0], cda_path, apie[0]),
        cda_ds("ds-c",  b[0],    cda_path, b[0]),
      ],
      layout=[
        layout_row("row1"),
        layout_col("col-a", "row1", "aCol", 12),
        layout_col("col-b", "row1", "bCol", 12),
        layout_row("row2"),
        layout_col("col-c", "row2", "cCol", 24),
      ],
      components=[
        comp("chA", a[0],    a[1],    "aCol"),
        comp("chB", apie[0], apie[1], "bCol"),
        comp("chC", b[0],    b[1],    "cCol", vert=True),
      ],
    )

cde_board("cde-quality", "Data Quality &amp; Metadata Completeness (CDE)",
  "CDE-authored — metadata completeness by source, profiling status &amp; most-missing attributes over PDC-BIDB-EXT.",
  ("completenessBySource","bar"), ("profilingStatus","pie"), ("missingAttrs","bar"))

cde_board("cde-freshness", "Data Freshness &amp; Staleness (CDE)",
  "CDE-authored — scan freshness, access-age distribution &amp; stale-or-aging by source over PDC-BIDB-EXT.",
  ("scanFreshness","bar"), ("accessAge","pie"), ("staleBySource","bar"))

cde_board("cde-glossary", "Business Glossary &amp; Term Reach (CDE)",
  "CDE-authored — term reach by glossary, classified-vs-unclassified coverage &amp; top terms over PDC-BIDB-EXT.",
  ("termsByGlossary","bar"), ("classified","pie"), ("topTerms","bar"))

cde_board("cde-applications", "Application &amp; Access Reach (CDE)",
  "CDE-authored — access by application, application type &amp; data source over PDC-BIDB-EXT.",
  ("accessByApp","bar"), ("accessByType","pie"), ("accessBySource","bar"))

cde_board("cde-storage", "Storage Footprint &amp; Capacity (CDE)",
  "CDE-authored — storage TB by source, structured-vs-unstructured &amp; object-size distribution over PDC-BIDB-EXT.",
  ("tbBySource","bar"), ("tbByRestype","pie"), ("sizeDist","bar"))

cde_board("cde-governance", "Policy &amp; Governance Coverage (CDE)",
  "CDE-authored — governed % by source, governance-status mix &amp; ungoverned assets by source over PDC-BIDB-EXT.",
  ("govPctBySource","bar"), ("govStatusMix","pie"), ("ungovBySource","bar"))

cde_board("cde-compliance", "Sensitive Data &amp; Compliance Radar (CDE)",
  "CDE-authored — restricted-to-ungoverned flows by source, asset sensitivity mix &amp; GB moved into each destination sensitivity tier over PDC-BIDB-EXT.",
  ("restrictedBySource","bar"), ("sensMix","pie"), ("bytesByDestSens","bar"))

cde_board("cde-redundancy", "Redundancy &amp; Duplicate Data (CDE)",
  "CDE-authored — duplicate assets by source, reclaimable TB by sensitivity &amp; reclaimable TB by source over PDC-BIDB-EXT.",
  ("dupsBySource","bar"), ("reclaimBySens","pie"), ("savingsBySource","bar"))

cde_board("cde-ownership", "Ownership &amp; Stewardship (CDE)",
  "CDE-authored — missing-owner assets by source, owned-vs-unowned mix &amp; owned % by source over PDC-BIDB-EXT.",
  ("missingBySource","bar"), ("ownedMix","pie"), ("ownedPctBySource","bar"))

cde_board("cde-pipeline-obs", "Pipeline &amp; Job Observability (CDE)",
  "CDE-authored — job success rate by integration, run-lifecycle event mix &amp; failures by job over PDC-BIDB-EXT.",
  ("successByIntegration","bar"), ("lifecycleMix","pie"), ("failuresByJob","bar"))

cde_board("cde-privacy", "Sensitive Data &amp; Privacy (CDE)",
  "CDE-authored — PII/classification term reach, sensitivity mix &amp; privacy exposure by source over PDC-BIDB-EXT.",
  ("privByTerm","bar"), ("sensMix","pie"), ("privBySource","bar"))

cde_board("cde-data-integration", "Data Integration Health (CDE)",
  "CDE-authored — GB moved by integration, run share by integration &amp; job success rate by integration over PDC-BIDB-EXT.",
  ("gbByIntegration","bar"), ("runsByIntegration","pie"), ("successByIntegration","bar"))

cde_board("cde-growth", "Catalog Growth &amp; Discovery (CDE)",
  "CDE-authored — assets by source, assets by sensitivity &amp; cumulative catalog growth over PDC-BIDB-EXT.",
  ("assetsBySource","bar"), ("assetsBySensitivity","pie"), ("cumulativeGrowth","bar"))
