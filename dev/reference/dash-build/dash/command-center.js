// Estate Observability Command Center — single pane of glass over the whole catalog.
(function(){
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  function rows(res,a,b){var ia=res.col(a),ib=res.col(b);return res.rows.map(function(r){return{label:String(r[ia]),value:+r[ib]||0};});}
  function sensColor(s){return /PII|PCI|PHI|Restricted|Secret|High/i.test(s)?PDC.cssvar("--sev3"):/Confiden|Internal|Medium/i.test(s)?PDC.cssvar("--sev2"):/Unclass|None|Public|Low/i.test(s)?PDC.cssvar("--text-faint"):PDC.cssvar("--c2");}

  function render(d){
    var govPct=+v(d.kpi,"governed_pct")||0, comp=+v(d.kpi,"completeness_pct")||0, succ=+v(d.pipe,"success_pct")||0, ru=+v(d.lin,"restricted_ungov")||0;
    PDC.kpis(PDC.el("kpis"),[
      {value:PDC.fmt.abbr(v(d.kpi,"total_assets")),label:"Catalog Assets",state:"purple",info:"Total catalog objects (tables, files, columns…) discovered across every connected source — the breadth of what's under management."},
      {value:(v(d.kpi,"total_tb")||0)+" TB",label:"Storage Footprint",info:"Total physical size of FILE + TABLE assets (TB), summed from the dimensional model. Files and tables are the storage-bearing grain; columns and schemas add no bytes."},
      {value:PDC.fmt.money(v(d.kpi,"monthly_cost"))+"/mo",label:"Est. Storage Cost",info:"Footprint TB × each source's blended $/TB rate = estimated monthly storage spend. A planning estimate, not a billing figure."},
      {value:PDC.fmt.pct(govPct),label:"Governed",state:govPct>=70?"good":govPct>=40?"warn":"bad",info:"Share of assets covered by a governance policy or glossary term. <40% bad, 40–70% warn, ≥70% good."},
      {value:PDC.fmt.pct(succ),label:"Job Success",state:succ>=90?"good":succ>=75?"warn":"bad",info:"Share of data-integration job runs that completed successfully (vs failed/aborted) in the window — operational reliability."},
      {value:PDC.fmt.n(ru),label:"Restricted → Ungoverned",state:ru>0?"bad":"good",info:"Count of data flows carrying Restricted data into an ungoverned destination — the single highest compliance exposure. Any non-zero value is an audit finding."}
    ]);
    var content=PDC.el("content"); content.innerHTML=""; var g=PDC.grid(3); content.appendChild(g);

    // Estate Health at a Glance — 3 headline semicircle gauges (govPct / comp / succ already fetched)
    var gh=PDC.card("Estate Health at a Glance",{pill:"live · three headline KPIs",src:"fact_entity_snapshot · fact_lineage_event · cube 71/79",span:3,
      info:"Semicircle dials for the three headline estate KPIs: governance coverage, metadata completeness, and pipeline reliability. Green = target met; amber = marginal; red = needs attention."});g.appendChild(gh.el);
    var gr=document.createElement("div");gr.style.cssText="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:4px 8px 2px";
    gh.body.appendChild(gr);
    var gg1=document.createElement("div");gr.appendChild(gg1);
    PDC.gauge(gg1,{value:govPct,max:100,unit:"%",label:"Governed",goodAt:0.70,warnAt:0.40,height:190});
    var gg2=document.createElement("div");gr.appendChild(gg2);
    PDC.gauge(gg2,{value:comp,max:100,unit:"%",label:"Metadata Complete",goodAt:0.70,warnAt:0.40,height:190});
    var gg3=document.createElement("div");gr.appendChild(gg3);
    PDC.gauge(gg3,{value:succ,max:100,unit:"%",label:"Pipeline Success",goodAt:0.90,warnAt:0.75,height:190});

    // Estate Health Score Trend — governance % + completeness % month-by-month
    var cHt=PDC.card("Estate Health Score Over Time",{span:3,pill:"% · monthly",src:"fact_entity_snapshot · dim_date",info:"Monthly governance coverage % and metadata completeness % — the two headline data-health metrics tracked over time. A rising trend means the estate is getting healthier; a plateau signals remediation stall. Data Source filter scopes both lines to that platform."});g.appendChild(cHt.el);
    var htLabels=d.ht.rows.map(function(r){return String(r[d.ht.col("month")]);});
    var htGov=d.ht.rows.map(function(r){return +r[d.ht.col("gov_pct")]||0;});
    var htComp=d.ht.rows.map(function(r){return +r[d.ht.col("comp_pct")]||0;});
    PDC.line(cHt.body,{area:false,fmt:function(v){return v+"%";},labels:htLabels,series:[
      {name:"Governed %",values:htGov,color:PDC.cssvar("--good")},
      {name:"Metadata Complete %",values:htComp,color:PDC.cssvar("--pdc")}
    ]});

    var c1=PDC.card("Storage by Data Source",{pill:"TB · click to drill",src:"fact_entity_snapshot + dim_datasource · cube 71",linkTo:"pdc-storage",linkLabel:"storage",info:"Storage footprint (TB) per connected source — where your data physically concentrates. Click a bar to drill into the Storage board for that source."}); g.appendChild(c1.el);
    PDC.bars(c1.body,{horizontal:true,labelW:150,fmt:function(x){return x+" TB";},drill:{to:"pdc-storage",param:"ds"},data:rows(d.sbs,"src","tb")});

    var c2=PDC.card("Sensitivity Exposure",{pill:"assets",src:"dim_entity.sensitivity · cube 71",linkTo:"pdc-compliance",linkLabel:"compliance",info:"Assets split by sensitivity tier (HIGH / MEDIUM / LOW / Unclassified). A large HIGH+MEDIUM share means more of the estate demands strict controls."}); g.appendChild(c2.el);
    var si=d.sens.col("sens"),ai=d.sens.col("assets");
    PDC.donut(c2.body,{centerCap:"Assets",fmt:PDC.fmt.abbr,data:d.sens.rows.map(function(r){return{label:String(r[si]),value:+r[ai]||0,color:sensColor(String(r[si]))};})});

    var c3=PDC.card("Governance Coverage",{pill:"status",src:"fact_entity_snapshot · cube 71",linkTo:"pdc-governance",linkLabel:"governance",info:"Assets split by governance status — governed vs ungoverned / missing-term. Ungoverned (especially sensitive) data is your primary risk surface."}); g.appendChild(c3.el);
    var gi=d.gov.col("status"),gai=d.gov.col("assets");
    PDC.donut(c3.body,{centerCap:"Assets",fmt:PDC.fmt.abbr,data:d.gov.rows.map(function(r){var s=String(r[gi]);
      var col=/^Govern|Covered|Full/i.test(s)&&!/Un|No /i.test(s)?PDC.cssvar("--good"):/Ungovern|No Term|Missing|None/i.test(s)?PDC.cssvar("--bad"):PDC.cssvar("--warn");
      return{label:s,value:+r[gai]||0,color:col};})});

    var c4=PDC.card("Scan Freshness",{pill:"recency",src:"fact_entity_snapshot.scan_freshness_band",linkTo:"pdc-freshness",linkLabel:"freshness",info:"Assets bucketed by how recently the catalog last scanned them. Stale bands mean the metadata may no longer reflect reality on the source."}); g.appendChild(c4.el);
    PDC.bars(c4.body,{horizontal:true,labelW:150,fmt:PDC.fmt.abbr,data:rows(d.fresh,"band","assets")});

    var c5=PDC.card("Metadata Completeness by Source",{pill:"% · click to drill",src:"fact_entity_snapshot · cube 71",linkTo:"pdc-data-quality",linkLabel:"data quality",info:"Per source, the % of expected metadata fields populated (owner, type, created/modified dates…). Low bars = metadata debt; click to drill into Data Quality."}); g.appendChild(c5.el);
    PDC.bars(c5.body,{horizontal:true,labelW:150,fmt:function(x){return x+"%";},color:PDC.cssvar("--pdc"),drill:{to:"pdc-data-quality",param:"ds"},data:rows(d.comp,"src","pct")});

    var c6=PDC.card("Data Source Scorecard",{pill:"by source",src:"fact_entity_snapshot + dim_datasource · cube 71",linkTo:"i-exec-scorecard",linkLabel:"exec scorecard",info:"One row per source with its headline KPIs (assets, governed %, complete %, TB) — an at-a-glance health comparison across your data platforms."}); g.appendChild(c6.el);
    var S=d.score, ci={};["src","assets","gov_pct","comp_pct","tb"].forEach(function(n){ci[n]=S.col(n);});
    PDC.table(c6.body,{cols:[
      {label:"Data Source",title:true,fmt:function(x){return PDC.fmt.trunc(x,22);}},
      {label:"Assets",num:true,bar:true,fmt:PDC.fmt.n},
      {label:"Governed",num:true,fmt:function(x){return PDC.fmt.pct(x);}},
      {label:"Complete",num:true,fmt:function(x){return PDC.fmt.pct(x);}},
      {label:"TB",num:true,fmt:function(x){return (+x||0);}}],
      rows:S.rows.map(function(r){return[r[ci.src],+r[ci.assets]||0,r[ci.gov_pct],r[ci.comp_pct],+r[ci.tb]||0];})});
  }

  function load(){
    var ds=PDC.filterState.ds||"%", sn=PDC.filterState.sensitivity||"%";
    PDC.resetCharts(); PDC.el("content").innerHTML='<div class="loading">Loading…</div>';
    PDC.load({kpi:["kpi",{ds:ds,sensitivity:sn}],pipe:["pipeline"],lin:["lineage"],sbs:["storage_by_source",{ds:ds,sensitivity:sn}],
      gov:["governance",{ds:ds,sensitivity:sn}],sens:["sensitivity",{ds:ds}],fresh:["freshness",{ds:ds,sensitivity:sn}],
      comp:["completeness_by_source"],score:["scorecard",{ds:ds,sensitivity:sn}],ht:["health_trend",{ds:ds}]}).then(render).catch(function(e){PDC.fail();console.error(e);});
  }
  Promise.all([PDC.cda("datasources"),PDC.cda("sensitivities")]).then(function(rs){
    var dsOpts=[{v:"%",t:"All sources"}].concat(rs[0].rows.map(function(x){return{v:x[0],t:x[0]};}));
    var snOpts=[{v:"%",t:"All tiers"}].concat(rs[1].rows.map(function(x){return{v:x[0],t:x[0]};}));
    PDC.filters([{id:"ds",label:"Data Source",options:dsOpts,def:"%"},{id:"sensitivity",label:"Sensitivity Tier",options:snOpts,def:"%"}],load); load();
  }).catch(function(){PDC.filters([{id:"ds",label:"Data Source",options:[{v:"%",t:"All sources"}]},{id:"sensitivity",label:"Sensitivity Tier",options:[{v:"%",t:"All tiers"}]}],load);load();});
})();
