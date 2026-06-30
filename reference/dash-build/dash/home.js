// PDC Analytics launcher — links every dashboard, grouped by domain.
(function(){
  var R="/pentaho/api/repos/:public:pdc-analysis:dashboards:";
  function url(file){ return R + file + (/\.xdash$/.test(file) ? "/generatedContent" : "/content"); }
  var GROUPS=[
    {name:"Observability", tag:"obs", items:[
      {t:"Estate Command Center", d:"Single pane of glass: assets, storage, governance, reliability, sensitivity.", f:"pdc-command-center.html"},
      {t:"Pipeline & Job Observability", d:"Run reliability, throughput, failures and freshness across integrations.", f:"pdc-pipeline-obs.html"},
      {t:"Data Freshness & Staleness", d:"Scan recency, access age, and hot/warm/cold/frozen data temperature.", f:"pdc-freshness.html"},
      {t:"Data Quality & Completeness", d:"Metadata completeness, profiling status, and missing-attribute gaps.", f:"pdc-data-quality.html"}
    ]},
    {name:"Governance & Security", tag:"gov", items:[
      {t:"Sensitive Data & Compliance Radar", d:"PII/regulated exposure, sensitive movement, policy coverage of sensitive data.", f:"pdc-compliance.html"},
      {t:"Policy & Governance Coverage", d:"Governed vs ungoverned, coverage by source/policy, governed footprint.", f:"pdc-governance.html"}
    ]},
    {name:"Storage & Cost", tag:"cost", items:[
      {t:"Storage Footprint & Capacity", d:"TB by source and type, structured vs unstructured, top-heavy assets.", f:"pdc-storage.html"},
      {t:"Cost Optimization & Sustainability", d:"Cost rollups, tiering candidates, CO2e, cold-data spend.", f:"pdc-cost.html"},
      {t:"Redundancy & Duplicate Data", d:"Duplicate groups and reclaimable savings by source and category.", f:"pdc-redundancy.html"}
    ]},
    {name:"Usage & People", tag:"use", items:[
      {t:"Application & Access Reach", d:"Application usage and access reach by app, source and owner.", f:"pdc-applications.html"},
      {t:"Ownership & Stewardship Gaps", d:"Owned vs unowned, accountability gaps, missing-attribute hotspots.", f:"pdc-ownership.html"},
      {t:"Business Glossary & Term Reach", d:"6-level glossary, term-to-entity reach, classification coverage.", f:"pdc-glossary.html"}
    ]},
    {name:"Data Lineage", tag:"lin", items:[
      {t:"Data Lineage Observability", d:"Flow ⇄ force-directed network, cascading filters, blast-radius tracing.", f:"lineage-explorer.html", flag:1},
      {t:"D85 Lineage Executive Overview", d:"Headline throughput + reliability for leadership.", f:"D85-lineage-executive-overview.xdash"},
      {t:"D81 Lineage Activity", d:"Event composition, run volume, top jobs.", f:"D81-lineage-activity.xdash"},
      {t:"D82 Data Flow Map", d:"Source→destination volumes and connection trends.", f:"D82-data-flow-map.xdash"},
      {t:"D83 Lineage Operations", d:"Run reliability and failures.", f:"D83-lineage-operations-summary.xdash"},
      {t:"D86 Throughput Deep-Dive", d:"GB/records moved by integration, job and time.", f:"D86-lineage-throughput-deep-dive.xdash"},
      {t:"D87 Sensitive Data Movement", d:"Sensitivity × governance, restricted→ungoverned flows.", f:"D87-sensitive-data-movement.xdash"}
    ]}
  ];
  // hide KPI strip; build hero + groups
  var k=PDC.el("kpis"); if(k) k.style.display="none";
  var avail = (window.PDC_AVAILABLE||null); // optional allowlist of built files
  var content=PDC.el("content"); content.innerHTML="";
  GROUPS.forEach(function(grp){
    var items=grp.items.filter(function(it){return !avail || avail.indexOf(it.f)>=0;});
    if(!items.length) return;
    var h=document.createElement("div"); h.style.cssText="margin:6px 2px 10px;font-size:13px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:var(--text-muted)";
    h.textContent=grp.name; content.appendChild(h);
    var g=PDC.grid(3); g.style.marginBottom="22px"; content.appendChild(g);
    items.forEach(function(it){
      var a=document.createElement("a"); a.href=url(it.f); a.target="_top";
      a.style.cssText="text-decoration:none;color:inherit";
      var c=PDC.card(it.t,{}); c.el.style.cssText+=";cursor:pointer;transition:transform .12s,box-shadow .12s";
      c.el.onmouseenter=function(){c.el.style.transform="translateY(-3px)";c.el.style.boxShadow="var(--panel-shadow-lg)";};
      c.el.onmouseleave=function(){c.el.style.transform="";c.el.style.boxShadow="";};
      c.body.innerHTML='<div style="font-size:12.5px;color:var(--text-muted);line-height:1.5">'+it.d+'</div>'+
        (it.flag?'<div style="margin-top:8px"><span class="badge purple">flagship</span></div>':'');
      a.appendChild(c.el); g.appendChild(a);
    });
  });
})();
