#!/usr/bin/env python3
"""
build.py — assemble the FULL self-contained PDC dashboard suite for THIS iteration.
Each iteration (iteration/vN) is a complete, improved copy of the suite. This
generator emits every HTML dashboard (baseline + iteration additions) into
../content/dashboards with a VERSION-stamped CDA deploy path, so v1 and v2 can be
deployed side by side to /public/pdc-iteration/<version> and run independently.

Run: python3 build.py   (reads ../VERSION for the version tag)
Then deploy with ../deploy.sh
"""
import os, re
HERE = os.path.dirname(os.path.abspath(__file__))
ITER = os.path.dirname(HERE)                                   # iteration/vN
VERSION = open(os.path.join(ITER, "VERSION")).read().strip()
DEPLOY = "/public/pdc-iteration/" + VERSION                    # server repo path for this iteration
CSS = open(os.path.join(HERE, "pdc-ui.css")).read()
JS = open(os.path.join(HERE, "pdc-ui.js")).read()
DASH_DIR = os.path.join(HERE, "dash")
REPO = os.path.join(ITER, "content", "dashboards")            # local output (full suite lives here)

TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{title} — Pentaho Data Catalog Analytics</title>
<style>
{css}
</style>
</head>
<body>
<header class="pdc-header">
  <div class="pdc-brand"><span class="pdc-logo">P</span><span class="pdc-title">{title}</span></div>
  <div class="pdc-sub">{sub}</div>
  <div class="spacer"></div>
  <div class="pdc-ctrls" id="ctrls"></div>
  {twin}
  <button class="pdc-iconbtn" id="qInfoBtn" title="View the CDA queries behind this dashboard" onclick="PDC.queryModal()">&#9432;</button>
  <button class="pdc-iconbtn" id="themeBtn" onclick="PDC.toggleTheme()">&#9790; Dark</button>
  {launcher}
</header>
<div class="pdc-wrap">
  <div class="pdc-kpis" id="kpis"></div>
  <div id="content"><div class="loading">Loading…</div></div>
  <div class="pdc-foot">Pentaho Data Catalog Analytics{foot} · iteration {ver} · data via CDA over <code>PDC-BIDB-EXT</code> · no external dependencies</div>
</div>
<script>
{js}
</script>
<script>
PDC.cdaPath = {cdapath!r};
PDC.initTheme();
(function(){{var b=document.getElementById('themeBtn');b.innerHTML=(document.documentElement.getAttribute('data-theme')==='dark')?'&#9728; Light':'&#9790; Dark';}})();
{body}
</script>
</body>
</html>
"""
LAUNCHER_LINK = '<a class="pdc-iconbtn" href="/pentaho/api/repos/%s:i-home.html/content" style="text-decoration:none">&#9632; All dashboards</a>' % DEPLOY.replace("/", ":")

# ── Twin dashboards: a "Custom" (this HTML toolkit) build paired with a "Framework"
# (true CDF) build of the same content. Listed here custom_stem -> cdf_stem; both sides
# get a Custom⇄Framework header toggle automatically (toolkit side via {twin}, CDF side
# via the <!--TWIN--> marker in the hand-written HTML). Add a pair here when a twin ships.
TWINS = {
    "i-exec-scorecard": "i-cdf-scorecard",
    "i-sensitive-domains": "i-cdf-sensitive-domains",
    "i-column-health": "i-cdf-column-health",
    "i-term-stewardship": "i-cdf-term-stewardship",
    "pdc-command-center": "i-cdf-command-center",
    "i-overview": "i-cdf-overview",
    "pdc-governance": "i-cdf-governance",
    "pdc-data-quality": "i-cdf-data-quality",
    "pdc-freshness": "i-cdf-freshness",
    "pdc-storage": "i-cdf-storage",
    "pdc-cost": "i-cdf-cost",
    "i-data-integration": "i-cdf-data-integration",
    "i-data-flows": "i-cdf-data-flows",
    "i-profiling": "i-cdf-profiling",
    "i-growth": "i-cdf-growth",
    "i-privacy": "i-cdf-privacy",
    "pdc-applications": "i-cdf-applications",
    "pdc-redundancy": "i-cdf-redundancy",
    "pdc-ownership": "i-cdf-ownership",
    "pdc-glossary": "i-cdf-glossary",
    "i-schema-explorer": "i-cdf-schema-explorer",
    "pdc-compliance": "i-cdf-compliance",
    "i-adoption": "i-cdf-adoption",
    "pdc-pipeline-obs": "i-cdf-pipeline-obs",
    "i-unstructured": "i-cdf-unstructured",
}
TWINS_REV = {v: k for k, v in TWINS.items()}

def _twin_url(stem):
    return "/pentaho/api/repos/%s:%s.html/content" % (DEPLOY.replace("/", ":"), stem)

def twin_toggle(active, custom_stem, cdf_stem):
    """Segmented Custom|Framework toggle for a twin pair (active = 'custom'|'framework')."""
    A = "padding:6px 12px;background:rgba(255,255,255,.30);color:#fff;font-weight:800"
    L = "padding:6px 12px;color:#fff;text-decoration:none;opacity:.78;font-weight:600"
    cu = ('<span style="%s">Simple HTML</span>' % A) if active == "custom" else ('<a href="%s" style="%s">Simple HTML</a>' % (_twin_url(custom_stem), L))
    fw = ('<span style="%s">Framework</span>' % A) if active == "framework" else ('<a href="%s" style="%s">Framework</a>' % (_twin_url(cdf_stem), L))
    return ('<span title="Toggle Simple HTML (toolkit/CDA) vs Framework (CDF) build" '
            'style="display:inline-flex;align-items:stretch;border:1px solid rgba(255,255,255,.45);border-radius:8px;overflow:hidden;font-size:12px">%s%s</span>' % (cu, fw))

def build(out_path, title, sub, cdapath, body_js, foot="", launcher=True, twin=""):
    html = TEMPLATE.format(title=title, sub=sub, css=CSS, js=JS, cdapath=cdapath, body=body_js, ver=VERSION,
                           foot=(" · " + foot) if foot else "", launcher=LAUNCHER_LINK if launcher else "", twin=twin)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    open(out_path, "w").write(html)
    return out_path

def build_repo(filename, title, sub, cdafile, body_file, foot=""):
    body = open(os.path.join(DASH_DIR, body_file)).read()
    cdapath = DEPLOY + "/" + cdafile
    stem = filename[:-5]
    twin = twin_toggle("custom", stem, TWINS[stem]) if stem in TWINS else ""
    return build(os.path.join(REPO, filename), title, sub, cdapath, body, foot, twin=twin)

# ── FULL suite (baseline + iteration). (out_html, title, sub, cda_file, body_js, group) ──
DASHBOARDS = [
  ("i-exec-scorecard.html","Unified Executive Scorecard","one board · every domain's headline KPI, trends &amp; drill-through","i-exec-scorecard.cda","i-exec-scorecard.js","Executive"),
  ("pdc-command-center.html","Estate Observability Command Center","single pane of glass · catalog health, governance, reliability","pdc-command-center.cda","command-center.js","Observability"),
  ("i-overview.html","Catalog Observability","catalog health &amp; coverage across every connected source","i-cdf-overview.cda","i-overview.js","Observability"),
  ("pdc-pipeline-obs.html","Pipeline &amp; Job Observability","run success/failure, runtimes, failures, freshness","pdc-pipeline-obs.cda","pipeline-obs.js","Observability"),
  ("pdc-freshness.html","Data Freshness &amp; Staleness","scan/access recency, stale data, temperature","pdc-freshness.cda","freshness.js","Observability"),
  ("pdc-data-quality.html","Data Quality &amp; Metadata Completeness","completeness, missing attributes, profiling","pdc-data-quality.cda","data-quality.js","Observability"),
  ("pdc-compliance.html","Sensitive Data &amp; Compliance Radar","PII/regulated exposure, sensitive movement","pdc-compliance.cda","compliance.js","Governance"),
  ("pdc-governance.html","Policy &amp; Governance Coverage","governed vs ungoverned, policy coverage, cost","pdc-governance.cda","governance.js","Governance"),
  ("pdc-storage.html","Storage Footprint &amp; Capacity","TB by source/type, top-heavies, footprint","pdc-storage.cda","storage.js","Storage & Cost"),
  ("pdc-cost.html","Cost Optimization &amp; Sustainability","cost by source, tiering candidates, CO2e","pdc-cost.cda","cost.js","Storage & Cost"),
  ("pdc-redundancy.html","Redundancy &amp; Duplicate Data","duplicate assets and reclaimable storage","pdc-redundancy.cda","redundancy.js","Storage & Cost"),
  ("pdc-applications.html","Application &amp; Access Reach","application usage and data reach","pdc-applications.cda","applications.js","Usage & People"),
  ("pdc-ownership.html","Ownership &amp; Stewardship Gaps","owned vs unowned, accountability gaps","pdc-ownership.cda","ownership.js","Usage & People"),
  ("pdc-glossary.html","Business Glossary &amp; Term Reach","glossary coverage, term-to-entity reach","pdc-glossary.cda","glossary.js","Usage & People"),
  ("i-data-integration.html","Data Integration Health","platform-movement matrix, throughput, reliability, top flows","i-data-integration.cda","i-data-integration.js","Data Integration"),
  ("i-data-flows.html","Data Movement Flows","Sankey of cross-platform data movement (lineage)","i-data-flows.cda","i-data-flows.js","Data Integration"),
  ("i-schema-explorer.html","Schema &amp; Structure Explorer","schemas, tables, columns, data types, key coverage","i-schema-explorer.cda","i-schema-explorer.js","Data Integration"),
  ("i-profiling.html","Column Profiling &amp; Statistics","completeness, cardinality, uniqueness","i-profiling.cda","i-profiling.js","Observability"),
  ("i-growth.html","Catalog Growth &amp; Discovery","cumulative growth, discovery trend, by source","i-growth.cda","i-growth.js","Observability"),
  ("i-privacy.html","Sensitive Data &amp; Privacy","PII/classification reach, exposure, term heatmap","i-privacy.cda","i-privacy.js","Governance"),
  ("i-adoption.html","Catalog Adoption","classification, governance &amp; usage coverage","i-adoption.cda","i-adoption.js","Governance"),
  ("i-unstructured.html","Document &amp; Unstructured Insights","files, extensions, folders, scan volume","i-unstructured.cda","i-unstructured.js","Observability"),
  ("i-term-stewardship.html","Glossary Hierarchy &amp; Term Stewardship","defined-vs-used adoption gap, hierarchy, types, reach","i-term-stewardship.cda","i-term-stewardship.js","Usage & People"),
  ("i-sensitive-domains.html","Sensitive Data Domains","governance risk map — glossary domain × sensitivity, top risk domains","i-sensitive-domains.cda","i-sensitive-domains.js","Governance"),
  ("i-column-health.html","Column Health &amp; Key Discovery","key-candidate detection, dead/constant columns, type mix","i-column-health.cda","i-column-health.js","Data Integration"),
]

# Hand-written standalone dashboards (not generated from the toolkit template) that
# carry a `var CDAPATH="…/<name>.cda"` and a v1 launcher link — path-stamped to this
# iteration's deploy path so they stay version-correct when an iteration is copied.
HANDWRITTEN = ["lineage-explorer.html", "i-cdf-overview.html", "i-cdf-lineage.html", "i-cdf-scorecard.html", "i-cdf-sensitive-domains.html", "i-cdf-column-health.html", "i-cdf-term-stewardship.html", "i-cdf-command-center.html", "i-cdf-governance.html", "i-cdf-data-quality.html", "i-cdf-freshness.html", "i-cdf-storage.html", "i-cdf-cost.html", "i-cdf-data-integration.html", "i-cdf-profiling.html", "i-cdf-growth.html", "i-cdf-privacy.html", "i-cdf-applications.html", "i-cdf-redundancy.html", "i-cdf-ownership.html", "i-cdf-glossary.html", "i-cdf-schema-explorer.html", "i-cdf-compliance.html", "i-cdf-adoption.html", "i-cdf-pipeline-obs.html", "i-cdf-unstructured.html", "i-cdf-data-flows.html"]

# ── Discrete CDA-query inspector for the hand-written CDF dashboards (directive #10 parity).
# Self-contained (these files don't load the PDC toolkit): a ⓘ header button + a modal that
# fetches this dashboard's .cda (derived from the existing CDAPATH var) and lists every data
# access (id + params + SQL + copy). Explicit hex colors so it works on any CDF page. Injected
# idempotently by stamp_handwritten (guarded on `pdcQueryModal`).
QM_BTN = '<button class="pdc-iconbtn" id="qInfoBtn" title="View the CDA queries behind this dashboard" onclick="pdcQueryModal()" style="cursor:pointer">&#9432;</button>\n  '
QM_SNIPPET = """
<style id="pdc-qm-css">
.pdc-qm-ov{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99999;display:flex;align-items:flex-start;justify-content:center;padding:5vh 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
.pdc-qm{background:#fff;color:#1f2937;border-radius:12px;box-shadow:0 24px 60px rgba(8,20,45,.35);width:min(880px,94vw);max-height:88vh;display:flex;flex-direction:column;overflow:hidden}
.pdc-qm-h{display:flex;align-items:center;gap:12px;padding:13px 16px;background:#0b2e63;color:#fff}
.pdc-qm-t{font-weight:800;font-size:14px}
.pdc-qm-t code{font-weight:700;font-size:12px;color:#cfe2ff;background:rgba(255,255,255,.12);padding:1px 7px;border-radius:6px;margin-left:4px}
.pdc-qm-note{color:rgba(255,255,255,.7);font-size:11px;font-style:italic;margin-left:auto}
.pdc-qm-x{border:0;background:transparent;color:rgba(255,255,255,.8);font-size:22px;line-height:1;cursor:pointer;padding:0 4px}
.pdc-qm-x:hover{color:#fff}
.pdc-qm-b{overflow:auto;padding:8px 16px 16px}
.pdc-qm-load{color:#64748b;padding:24px 4px;font-size:13px}
.pdc-q{border-top:1px solid #e6eaf2;padding:13px 0 4px}
.pdc-q:first-child{border-top:0}
.pdc-q-id{display:flex;align-items:center;gap:9px;margin-bottom:7px}
.pdc-q-name{font-weight:800;font-size:12.5px;color:#005bb5;font-family:ui-monospace,Menlo,Consolas,monospace}
.pdc-q-params{font-size:10px;color:#64748b;background:#f1f5f9;padding:2px 8px;border-radius:20px}
.pdc-q-copy{margin-left:auto;border:1px solid #cbd5e1;background:#f8fafc;color:#64748b;font-size:10.5px;font-weight:700;padding:3px 10px;border-radius:6px;cursor:pointer}
.pdc-q-copy:hover{color:#005bb5;border-color:#005bb5}
.pdc-q-sql{margin:0;background:#f6f8fc;border:1px solid #e6eaf2;border-radius:8px;padding:11px 13px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;line-height:1.5;color:#1f2937;white-space:pre-wrap;word-break:break-word}
</style>
<script>
function pdcQueryModal(){
  if(document.getElementById('pdc-qm'))return;
  var url="/pentaho/api/repos/"+CDAPATH.replace(/^\\/+/,'').replace(/\\//g,':')+"/content";
  var fname=CDAPATH.split('/').pop();
  var ov=document.createElement('div');ov.id='pdc-qm';ov.className='pdc-qm-ov';
  ov.innerHTML='<div class="pdc-qm" role="dialog" aria-modal="true"><div class="pdc-qm-h"><span class="pdc-qm-t">\\u25f4 CDA Queries <code>'+fname+'</code></span><span class="pdc-qm-note">the live SQL behind every panel \\u00b7 read-only</span><button class="pdc-qm-x" aria-label="Close">\\u00d7</button></div><div class="pdc-qm-b"><div class="pdc-qm-load">Loading queries\\u2026</div></div></div>';
  document.body.appendChild(ov);
  function close(){ov.remove();document.removeEventListener('keydown',esc);}
  function esc(e){if(e.key==='Escape')close();}
  ov.addEventListener('click',function(e){if(e.target===ov)close();});
  ov.querySelector('.pdc-qm-x').addEventListener('click',close);
  document.addEventListener('keydown',esc);
  fetch(url,{credentials:'include'}).then(function(r){return r.text();}).then(function(xml){
    var doc=new DOMParser().parseFromString(xml,'text/xml');
    var das=[].slice.call(doc.getElementsByTagName('DataAccess'));
    var b=ov.querySelector('.pdc-qm-b');b.innerHTML='';
    if(!das.length){b.innerHTML='<div class="pdc-qm-load">No queries found.</div>';return;}
    das.forEach(function(da){
      var id=da.getAttribute('id')||'';var qn=da.getElementsByTagName('Query')[0];var sql=qn?qn.textContent.trim():'(no SQL)';
      var params=[].slice.call(da.getElementsByTagName('Parameter')).map(function(p){return p.getAttribute('name');}).filter(Boolean);
      var sec=document.createElement('section');sec.className='pdc-q';
      var pill=params.length?'<span class="pdc-q-params">'+params.join(' \\u00b7 ')+'</span>':'';
      sec.innerHTML='<div class="pdc-q-id"><span class="pdc-q-name">'+id+'</span>'+pill+'<button class="pdc-q-copy">copy</button></div><pre class="pdc-q-sql"></pre>';
      sec.querySelector('.pdc-q-sql').textContent=sql;
      sec.querySelector('.pdc-q-copy').addEventListener('click',function(){var t=this;try{navigator.clipboard.writeText(sql);t.textContent='copied \\u2713';setTimeout(function(){t.textContent='copy';},1200);}catch(e){}});
      b.appendChild(sec);
    });
  }).catch(function(e){ov.querySelector('.pdc-qm-b').innerHTML='<div class="pdc-qm-load">Could not load queries ('+e+').</div>';});
}
</script>
"""

# Shared drill-to-DETAIL drawer for the CDF/Framework twins (parity with the Classic PDC.detail).
# Self-contained: uses the page's global CDAPATH + a raw doQuery fetch, so it needs no CDF runtime.
# A twin opens it from a chart clickAction: pdcDetailDrawer({title, subtitle, da, params, cols, drill})
#   cols = [{label, idx, num, fmt?}]  (idx = column index in the detail query's resultset)
#   drill = {label, onClick}  → renders the in-drawer "↗ open dashboard" cross-drill button.
# The count IS the row count: the drawer lists every record the detail DA returns (CAP 2000 in DOM,
# with a "filter to narrow" note for larger sets; the true total always shows).
DETAIL_SNIPPET = """
<style id="pdc-dt-css">
.pdc-dt-ov{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:10000;display:flex;justify-content:flex-end;opacity:0;transition:opacity .18s ease}
.pdc-dt-ov.in{opacity:1}
.pdc-dt{background:var(--panel,#fff);color:var(--text,#1b2733);border-left:1px solid var(--border,#e3e8f0);box-shadow:-12px 0 40px rgba(8,20,45,.25);width:min(680px,96vw);height:100%;display:flex;flex-direction:column;transform:translateX(28px);transition:transform .2s ease}
.pdc-dt-ov.in .pdc-dt{transform:translateX(0)}
.pdc-dt-h{display:flex;align-items:flex-start;gap:12px;padding:15px 18px 13px;border-bottom:1px solid var(--border,#e3e8f0)}
.pdc-dt-t{font-weight:800;font-size:15px}.pdc-dt-sub{display:block;font-size:11.5px;color:var(--muted,#6b7a90);font-weight:600;margin-top:3px}
.pdc-dt-x{margin-left:auto;border:0;background:transparent;color:var(--muted,#6b7a90);font-size:24px;line-height:1;cursor:pointer;padding:0 4px}
.pdc-dt-bar{display:flex;align-items:center;gap:12px;padding:9px 18px;border-bottom:1px solid var(--border,#e3e8f0);flex-wrap:wrap}
.pdc-dt-count{font-size:12px;color:var(--muted,#6b7a90)}.pdc-dt-count b{color:var(--pdc,#005bb5);font-size:14px}
.pdc-dt-q{flex:1;min-width:120px;border:1px solid var(--border,#e3e8f0);background:#fff;color:var(--text,#1b2733);font-size:12.5px;padding:6px 11px;border-radius:7px;outline:none}
.pdc-dt-q:focus{border-color:var(--pdc,#005bb5)}
.pdc-dt-drilllink{font-size:11.5px;font-weight:700;color:var(--pdc,#005bb5);text-decoration:none;white-space:nowrap;padding:5px 10px;border:1px solid var(--pdc,#005bb5);border-radius:7px;cursor:pointer}
.pdc-dt-drilllink:hover{background:var(--pdc,#005bb5);color:#fff}
.pdc-dt-b{overflow:auto;flex:1}
.pdc-dt-load{color:var(--muted,#6b7a90);padding:26px 18px;font-size:13px}
.pdc-dt-more{color:var(--muted,#6b7a90);opacity:.8;font-size:11.5px;padding:10px 18px;font-style:italic}
.pdc-dt-tbl{width:100%;border-collapse:collapse;font-size:12.5px}
.pdc-dt-tbl thead th{position:sticky;top:0;background:#f4f6fa;color:var(--muted,#6b7a90);text-align:left;font-weight:700;font-size:10.5px;letter-spacing:.4px;text-transform:uppercase;padding:9px 18px;border-bottom:1px solid var(--border,#e3e8f0)}
.pdc-dt-tbl th.num,.pdc-dt-tbl td.num{text-align:right}
.pdc-dt-tbl tbody td{padding:8px 18px;border-bottom:1px solid var(--border,#e3e8f0);white-space:nowrap}
.pdc-dt-tbl td.ti{font-weight:600;max-width:280px;overflow:hidden;text-overflow:ellipsis}
.pdc-dt-tbl tbody tr:hover td{background:#f7f9fc}
</style>
<script>
function pdcDetailDrawer(cfg){
  cfg=cfg||{};
  var old=document.getElementById('pdc-dt'); if(old)old.remove();
  var ov=document.createElement('div'); ov.id='pdc-dt'; ov.className='pdc-dt-ov';
  ov.innerHTML='<div class="pdc-dt" role="dialog" aria-modal="true"><div class="pdc-dt-h"><div>'+
    '<span class="pdc-dt-t"></span><span class="pdc-dt-sub"></span></div>'+
    '<button class="pdc-dt-x" aria-label="Close">&times;</button></div>'+
    '<div class="pdc-dt-bar"><span class="pdc-dt-count">\\u2026</span>'+
    '<input class="pdc-dt-q" type="search" placeholder="Filter rows\\u2026"/>'+
    '<span class="pdc-dt-drill"></span></div>'+
    '<div class="pdc-dt-b"><div class="pdc-dt-load">Loading records\\u2026</div></div></div>';
  document.body.appendChild(ov);
  ov.querySelector('.pdc-dt-t').textContent=cfg.title||'Detail';
  if(cfg.subtitle)ov.querySelector('.pdc-dt-sub').textContent=cfg.subtitle;
  if(cfg.drill&&cfg.drill.onClick){var a=document.createElement('a');a.className='pdc-dt-drilllink';
    a.innerHTML=(cfg.drill.label||'Open dashboard')+' &#8599;';a.addEventListener('click',function(e){e.preventDefault();cfg.drill.onClick();});
    ov.querySelector('.pdc-dt-drill').appendChild(a);}
  function close(){ov.remove();document.removeEventListener('keydown',esc);}
  function esc(e){if(e.key==='Escape')close();}
  ov.addEventListener('click',function(e){if(e.target===ov)close();});
  ov.querySelector('.pdc-dt-x').addEventListener('click',close);
  document.addEventListener('keydown',esc);
  requestAnimationFrame(function(){ov.classList.add('in');});
  var body=ov.querySelector('.pdc-dt-b'), cnt=ov.querySelector('.pdc-dt-count');
  var cols=cfg.cols||[], noun=cfg.noun||'rows';
  function trunc(s,n){s=String(s==null?'':s);return s.length>n?s.slice(0,n-1)+'\\u2026':s;}
  function cell(c,v){return c.fmt?c.fmt(v):(c.trunc?trunc(v,c.trunc):(v==null?'':String(v)));}
  function setCount(n,t){cnt.innerHTML=(n===t)?('<b>'+t.toLocaleString()+'</b> '+noun):('<b>'+n.toLocaleString()+'</b> of '+t.toLocaleString()+' '+noun);}
  function build(list){
    if(!list.length){body.innerHTML='<div class="pdc-dt-load">No records.</div>';return;}
    var CAP=2000, lim=Math.min(list.length,CAP);
    var h='<table class="pdc-dt-tbl"><thead><tr>'+cols.map(function(c){return '<th class="'+(c.num?'num':'')+'">'+c.label+'</th>';}).join('')+'</tr></thead><tbody>';
    for(var i=0;i<lim;i++){var r=list[i];h+='<tr>'+cols.map(function(c){return '<td class="'+(c.num?'num':'')+(c.title?' ti':'')+'">'+cell(c,r[c.idx])+'</td>';}).join('')+'</tr>';}
    h+='</tbody></table>';
    if(list.length>CAP)h+='<div class="pdc-dt-more">Showing first '+CAP.toLocaleString()+' of '+list.length.toLocaleString()+' \\u2014 type in Filter to narrow.</div>';
    body.innerHTML=h;
  }
  var url='/pentaho/plugin/cda/api/doQuery?path='+encodeURIComponent(CDAPATH)+'&dataAccessId='+encodeURIComponent(cfg.da)+'&outputType=json';
  var pr=cfg.params||{}; for(var k in pr) url+='&param'+encodeURIComponent(k)+'='+encodeURIComponent(pr[k]);
  fetch(url,{credentials:'include'}).then(function(r){return r.json();}).then(function(j){
    var rs=j.resultset||[];
    setCount(rs.length,rs.length); build(rs);
    var q=ov.querySelector('.pdc-dt-q');
    q.addEventListener('input',function(){var t=this.value.trim().toLowerCase();
      if(!t){setCount(rs.length,rs.length);build(rs);return;}
      var f=rs.filter(function(r){return cols.some(function(c){return String(r[c.idx]).toLowerCase().indexOf(t)>=0;});});
      setCount(f.length,rs.length);build(f);});
    setTimeout(function(){try{q.focus();}catch(e){}},80);
  }).catch(function(e){body.innerHTML='<div class="pdc-dt-load">Could not load records ('+e+').</div>';});
}
</script>
"""

INFODOT_SNIPPET = """
<style id="pdc-i-css">
.pdc-i{display:inline-flex;align-items:center;justify-content:center;margin-left:5px;font-size:11px;font-style:normal;
  color:#8a94a6;cursor:help;line-height:1;vertical-align:middle;opacity:.6;transition:opacity .12s,color .12s;user-select:none;font-weight:400}
.pdc-i:hover,.pdc-i:focus{opacity:1;color:#7d3c98;outline:none}
.kpi .l .pdc-i{font-size:10px;margin-left:4px}
.pdc-info-pop{position:fixed;display:none;z-index:10001;background:#0d1624;color:#fff;padding:9px 12px;border-radius:8px;
  font-size:11.5px;line-height:1.5;box-shadow:0 8px 26px rgba(0,0,0,.4);max-width:300px;font-weight:500;pointer-events:none;letter-spacing:.1px}
</style>
<script>
/* Twin parity with the Custom PDC.infoDot: a discrete circled-i after any element carrying
   data-info, revealing a business+technical blurb on hover/focus. Build-once, attribute-driven. */
(function(){
  var POP=null;
  function pop(){ if(!POP){POP=document.createElement('div');POP.className='pdc-info-pop';document.body.appendChild(POP);} return POP; }
  function attach(host){
    var text=host.getAttribute('data-info'); if(!text||host.querySelector(':scope > .pdc-i'))return;
    var s=document.createElement('span'); s.className='pdc-i'; s.tabIndex=0; s.setAttribute('role','button');
    s.setAttribute('aria-label','Definition: '+text); s.textContent='\\u24D8';
    function show(){ var p=pop(); p.textContent=text; p.style.display='block';
      var r=s.getBoundingClientRect(), pw=Math.min(300, window.innerWidth-24); p.style.maxWidth=pw+'px';
      var left=Math.min(r.left, window.innerWidth-pw-12); p.style.left=Math.max(8,left)+'px'; p.style.top=(r.bottom+7)+'px'; }
    function hide(){ if(POP)POP.style.display='none'; }
    s.addEventListener('mouseenter',show); s.addEventListener('mouseleave',hide);
    s.addEventListener('focus',show); s.addEventListener('blur',hide);
    s.addEventListener('click',function(e){e.stopPropagation();show();});
    host.appendChild(s);
  }
  function run(){ var els=document.querySelectorAll('[data-info]'); for(var i=0;i<els.length;i++)attach(els[i]); }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run); else run();
})();
</script>
"""

def inject_infodots(s):
    """Idempotently add the shared data-info infoDot mechanism (parity with Custom PDC.infoDot)
    to a hand-written CDF dashboard. Only injects when the page actually uses data-info."""
    if 'id="pdc-i-css"' in s or "data-info" not in s:
        return s
    if "</body>" in s:
        s = s.replace("</body>", INFODOT_SNIPPET + "</body>", 1)
    return s

def inject_detail_drawer(s):
    """Idempotently add the shared drill-to-detail drawer (CSS+JS) to a hand-written CDF dashboard."""
    # Guard on the injected <style id> marker (NOT the function name — a twin may *call*
    # pdcDetailDrawer from a clickAction before the snippet is injected).
    if 'id="pdc-dt-css"' in s or "var CDAPATH" not in s:
        return s
    if "</body>" in s:
        s = s.replace("</body>", DETAIL_SNIPPET + "</body>", 1)
    return s

def inject_query_inspector(s):
    """Idempotently add the ⓘ query-inspector button + modal to a hand-written CDF dashboard."""
    if "pdcQueryModal" in s or "var CDAPATH" not in s:
        return s
    # button: before the All-dashboards iconbtn if present, else before </header>
    anchor = re.search(r'<a class="pdc-iconbtn" href="[^"]*i-home\.html/content"', s)
    if anchor:
        s = s[:anchor.start()] + QM_BTN + s[anchor.start():]
    elif "</header>" in s:
        s = s.replace("</header>", "  " + QM_BTN + "</header>", 1)
    # modal css+js: once, before </body>
    if "</body>" in s:
        s = s.replace("</body>", QM_SNIPPET + "</body>", 1)
    return s

def stamp_handwritten():
    n = 0
    for fn in HANDWRITTEN:
        p = os.path.join(REPO, fn)
        if not os.path.exists(p):
            continue
        cda = fn[:-5] + ".cda"
        s = open(p).read()
        s = re.sub(r'var CDAPATH="[^"]*"', 'var CDAPATH="%s/%s"' % (DEPLOY, cda), s)
        # keep any hard-coded launcher/repo links pointed at this iteration's folder
        s = re.sub(r'/pentaho/api/repos/:public:pdc-iteration:v[0-9]+:', '/pentaho/api/repos/%s:' % DEPLOY.replace("/", ":"), s)
        # keep the footer "iteration vN" label correct for this iteration
        s = re.sub(r'iteration v[0-9]+', 'iteration %s' % VERSION, s)
        # inject the Custom⇄Framework toggle at the <!--TWIN--> marker (CDF/Framework side)
        stem = fn[:-5]
        toggle = twin_toggle("framework", TWINS_REV[stem], stem) if stem in TWINS_REV else ""
        s = s.replace("<!--TWIN-->", toggle)
        # inject the discrete ⓘ CDA-query inspector (parity with the Custom suite)
        s = inject_query_inspector(s)
        # inject the shared drill-to-detail drawer (parity with the Classic PDC.detail)
        s = inject_detail_drawer(s)
        # inject the shared data-info infoDot mechanism (parity with Custom PDC.infoDot)
        s = inject_infodots(s)
        open(p, "w").write(s)
        n += 1
    return n

def build_all():
    for fn, title, sub, cdafile, body, group in DASHBOARDS:
        build_repo(fn, title, sub, cdafile, body)
    stamp_handwritten()
    print("built %d dashboards (+%d hand-written stamped) into %s (deploy path %s)" % (len(DASHBOARDS), len(HANDWRITTEN), REPO, DEPLOY))

if __name__ == "__main__":
    import sys
    if "--kitchensink" in sys.argv:
        body = open(os.path.join(DASH_DIR, "kitchensink.js")).read()
        build("/tmp/pwshots/kitchensink.html", "Toolkit Test", "every chart type · mock data", "", body, foot="toolkit self-test", launcher=False)
        print("built kitchensink")
    else:
        build_all()
