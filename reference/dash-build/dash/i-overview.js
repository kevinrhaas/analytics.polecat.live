// Catalog Observability — Simple HTML twin of i-cdf-overview (reuses i-cdf-overview.cda).
// Single-pane catalog health: assets by source, governance, discovery trend, sensitivity, scorecard.
(function(){
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  function rows(res,a,b){var ia=res.col(a),ib=res.col(b);return res.rows.map(function(r){return{label:String(r[ia]),value:+r[ib]||0};});}
  function cols(res,a){var i=res.col(a);return res.rows.map(function(r){return String(r[i]);});}
  function vals(res,a){var i=res.col(a);return res.rows.map(function(r){return +r[i]||0;});}
  function govColor(s){return /govern|covered|full|tagged|assigned/i.test(s)&&!/un|no /i.test(s)?PDC.cssvar("--good"):/ungovern|no term|missing|none/i.test(s)?PDC.cssvar("--bad"):PDC.cssvar("--warn");}
  function sensColor(s){return /high|restrict/i.test(s)?PDC.cssvar("--bad"):/med|confiden/i.test(s)?PDC.cssvar("--warn"):/low|internal/i.test(s)?PDC.cssvar("--info"):/unclass/i.test(s)?PDC.cssvar("--text-faint"):PDC.cssvar("--pdc");}

  function render(d){
    PDC.kpis(PDC.el("kpis"),[
      {value:PDC.fmt.abbr(v(d.kpi,"assets")),label:"Assets",state:"purple",info:"Total catalog objects (tables, files, columns…) discovered across all connected sources, after any active filters."},
      {value:PDC.fmt.n(v(d.kpi,"sources")),label:"Data Sources",info:"Number of distinct connected data sources / platforms represented in the catalog."},
      {value:PDC.fmt.pct(v(d.kpi,"governed_pct")),label:"Governed",state:(+v(d.kpi,"governed_pct")>=70?"good":+v(d.kpi,"governed_pct")>=40?"warn":"bad"),info:"Share of assets covered by a governance policy or glossary term. <40% bad, 40–70% warn, ≥70% good."},
      {value:PDC.fmt.pct(v(d.kpi,"complete_pct")),label:"Metadata Complete",state:(+v(d.kpi,"complete_pct")>=70?"good":"warn"),info:"Average % of expected metadata fields populated across assets (owner, type, created/modified dates…). Higher = a richer, more trustworthy catalog."}
    ]);
    var content=PDC.el("content");content.innerHTML="";var g=PDC.grid(3);content.appendChild(g);

    var c1=PDC.card("Assets by Data Source",{pill:"assets",src:"fact_entity_snapshot · cube 71",span:1,
      linkTo:"pdc-storage",linkParam:"ds",info:"Count of catalog assets per connected source — where your data is concentrated. Click a bar to drill into the Storage board for that source."});g.appendChild(c1.el);
    PDC.bars(c1.body,{horizontal:true,labelW:150,fmt:PDC.fmt.abbr,color:PDC.cssvar("--pdc"),
      data:rows(d.bs,"src","assets"),drill:{to:"pdc-storage",param:"ds"}});

    var c2=PDC.card("Governance Coverage",{pill:"status",src:"fact_entity_snapshot · cube 71",info:"Assets split by governance status — governed vs ungoverned / missing-term. Ungoverned (especially sensitive) data is your primary risk + cleanup surface."});g.appendChild(c2.el);
    var gi=d.gs.col("status"),gv=d.gs.col("assets");
    PDC.donut(c2.body,{centerCap:"Assets",fmt:PDC.fmt.abbr,data:d.gs.rows.map(function(r){return{label:String(r[gi]),value:+r[gv]||0,color:govColor(String(r[gi]))};})});

    var c3=PDC.card("Catalog Discovery Trend",{pill:"assets by month",src:"fact_entity_snapshot · dim_date · cube 71",info:"New catalog assets discovered per month — how fast the estate under management is growing. A rising line means discovery is keeping pace with your data sprawl."});g.appendChild(c3.el);
    PDC.line(c3.body,{labels:cols(d.tr,"month"),area:true,fmt:PDC.fmt.abbr,series:[{name:"Assets",values:vals(d.tr,"assets")}]});

    var c4=PDC.card("Sensitivity Mix",{pill:"assets",src:"dim_entity.sensitivity · cube 71",info:"Assets split by sensitivity tier (HIGH / MEDIUM / LOW / Unclassified). A large HIGH+MEDIUM share means more of the estate demands strict controls."});g.appendChild(c4.el);
    var si=d.sn.col("sens"),sv=d.sn.col("assets");
    PDC.donut(c4.body,{centerCap:"Assets",fmt:PDC.fmt.abbr,data:d.sn.rows.map(function(r){return{label:String(r[si]),value:+r[sv]||0,color:sensColor(String(r[si]))};})});

    var c5=PDC.card("Metadata Completeness by Source",{pill:"%",src:"fact_entity_snapshot · cube 71",info:"Per source, the % of expected metadata fields populated (owner, type, created/modified dates…). Low bars flag metadata debt to chase."});g.appendChild(c5.el);
    PDC.bars(c5.body,{horizontal:true,labelW:150,fmt:function(x){return x+"%";},color:PDC.cssvar("--info"),data:rows(d.comp,"src","complete_pct")});

    var c6=PDC.card("Source Scorecard",{pill:"per source",src:"fact_entity_snapshot · cube 71",span:3,info:"One row per source with its headline health KPIs (assets, governed %, complete %) — a quick at-a-glance comparison across your data platforms."});g.appendChild(c6.el);
    var ci=d.sc.col("src"),cai=d.sc.col("assets"),cgi=d.sc.col("governed_pct"),cci=d.sc.col("complete_pct");
    PDC.table(c6.body,{cols:[
      {label:"Data Source",title:true},
      {label:"Assets",num:true,bar:true,fmt:PDC.fmt.abbr},
      {label:"Governed",num:true,badge:function(x){x=+x||0;return x>=70?{cls:"green",text:x+"%"}:x>=40?{cls:"warn",text:x+"%"}:{cls:"bad",text:x+"%"};}},
      {label:"Complete",num:true,badge:function(x){x=+x||0;return x>=70?{cls:"green",text:x+"%"}:x>=40?{cls:"warn",text:x+"%"}:{cls:"bad",text:x+"%"};}}],
      rows:d.sc.rows.map(function(r){return[String(r[ci]),+r[cai]||0,+r[cgi]||0,+r[cci]||0];})});
  }

  function load(){
    var ds=PDC.filterState.ds||"%",sens=PDC.filterState.sens||"%";
    PDC.resetCharts();PDC.el("content").innerHTML='<div class="loading">Loading…</div>';
    PDC.load({kpi:["kpi",{ds:ds,sens:sens}],bs:["by_source",{ds:ds,sens:sens}],gs:["gov_status",{ds:ds,sens:sens}],
      sn:["sensitivity",{ds:ds}],tr:["trend"],sc:["scorecard",{ds:ds,sens:sens}],comp:["completeness"]}).then(render).catch(function(e){PDC.fail();console.error(e);});
  }
  Promise.all([PDC.cda("datasources"),PDC.cda("sensitivities")]).then(function(res){
    var dsOpts=res[0].rows.map(function(x){return{v:x[0],t:x[1]};});
    var snOpts=res[1].rows.map(function(x){return{v:x[0],t:x[1]};});
    PDC.filters([{id:"ds",label:"Data Source",options:dsOpts,def:"%"},{id:"sens",label:"Sensitivity",options:snOpts,def:"%"}],load);load();
  }).catch(function(){PDC.filters([{id:"ds",label:"Data Source",options:[{v:"%",t:"All sources"}]},{id:"sens",label:"Sensitivity",options:[{v:"%",t:"All sensitivities"}]}],load);load();});
})();
