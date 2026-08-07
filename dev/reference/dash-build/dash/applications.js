// Application & Access Reach.
(function(){
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  function rows(res,a,b){var ia=res.col(a),ib=res.col(b);return res.rows.map(function(r){return{label:String(r[ia]),value:+r[ib]||0};});}
  function render(d){
    PDC.kpis(PDC.el("kpis"),[
      {value:PDC.fmt.n(v(d.kpi,"apps")),label:"Applications",state:"purple",info:"Distinct applications/tools observed accessing catalog data. The breadth of your consumption surface — every one is a potential access-governance concern."},
      {value:PDC.fmt.abbr(v(d.kpi,"accesses")),label:"Access Events",info:"Total recorded access events across all applications. High volume signals heavily-used, business-critical data worth prioritizing for quality and uptime."},
      {value:PDC.fmt.abbr(v(d.kpi,"assets")),label:"Assets Accessed",info:"Distinct objects touched by at least one application. Compared to total assets, shows how much of the estate is actually in active use."},
      {value:(v(d.kpi,"tb")||0)+" TB",label:"Data Reach",info:"Total storage volume (TB) reachable through these applications — the scale of data exposed to the consumption layer."}
    ]);
    var content=PDC.el("content");content.innerHTML="";var g=PDC.grid(3);content.appendChild(g);
    var ds=PDC.filterState.ds||"%",sens=PDC.filterState.sens||"%";
    // click an application → drawer of the ACTUAL entities that app accesses (one row per entity reached)
    var appDetail={da:"detail_app_entities",param:"app",params:{ds:ds,sens:sens},noun:"entities accessed",
      title:function(app){return app+" — entities accessed";},
      subtitle:"every asset this application reaches"+(ds!=="%"?(" · "+ds):"")+(sens!=="%"?(" · "+sens):""),
      cols:[
        {key:"name",label:"Entity",title:true,fmt:function(x){return PDC.fmt.trunc(x,40);}},
        {key:"src",label:"Source",fmt:function(x){return PDC.fmt.trunc(x,16);}},
        {key:"accesses",label:"Accesses",num:true,fmt:function(x){return (+x||0).toLocaleString();}},
        {key:"accessed_gb",label:"GB",num:true,fmt:function(x){return (+x||0).toLocaleString();}},
        {key:"sensitivity",label:"Sensitivity"},
        {key:"owner",label:"Owner",fmt:function(x){return PDC.fmt.trunc(x,18);}}],
      drill:{to:"pdc-storage",param:"ds",label:"Open Storage"}};
    var c1=PDC.card("Top Applications by Access",{pill:"events",src:"fact_entity_application · cube 74",span:2,sub:"click an app → its entities",info:"Which applications generate the most data access. The busiest apps define your critical-path data and where access controls matter most. Click an app for the entities it touches."});g.appendChild(c1.el);
    PDC.bars(c1.body,{horizontal:true,labelW:200,labelChars:32,fmt:PDC.fmt.abbr,data:rows(d.ba,"app","acc"),detail:appDetail});
    var c2=PDC.card("Access by Application Type",{pill:"events",src:"dim_application · cube 74",info:"Access grouped by category (BI, query tools, pipelines, notebooks…). Reveals how data is consumed — dashboards vs. ad-hoc vs. automated movement."});g.appendChild(c2.el);
    PDC.donut(c2.body,{centerCap:"Events",fmt:PDC.fmt.abbr,data:rows(d.bt,"atype","acc").map(function(x,i){x.color=PDC.color(i);return x;})});
    var c3=PDC.card("Access by Data Source",{pill:"events",src:"fact_entity_application · cube 74",info:"Which sources receive the most application traffic. High-traffic sources are your hot data platforms — performance, cost, and access risk concentrate there."});g.appendChild(c3.el);
    PDC.bars(c3.body,{horizontal:true,labelW:150,fmt:PDC.fmt.abbr,color:PDC.cssvar("--c3"),drill:{to:"pdc-storage",param:"ds"},data:rows(d.bs,"src","acc")});
    // Application ↔ Data Source access topology (radial network): hover an app or source to light its blast radius
    var c3b=PDC.card("Application ↔ Data Source Topology",{pill:"network · accesses",src:"fact_entity_application · cube 74",span:3,info:"Network map of which applications touch which sources, edges sized by access volume. Densely-connected hubs are systemically important; isolated nodes may be redundant. Hover a node to isolate its links."});g.appendChild(c3b.el);
    var asA=d.asf.col("app"),asS=d.asf.col("src"),asC=d.asf.col("acc");
    var alinks=d.asf.rows.map(function(r){return{source:String(r[asA]),target:String(r[asS]),value:+r[asC]||0};});
    // node-click drill-to-detail: app nodes → that app's entities; source nodes → all entities accessed in that source
    var appSet={}; alinks.forEach(function(l){appSet[l.source]=1;});
    function nodeDetail(node){
      if(appSet[node]) return appDetail;  // application node → its accessed entities (param app)
      return {da:"detail_app_entities",param:"ds",params:{app:"%",sens:sens},noun:"entities accessed",
        title:function(srcn){return srcn+" — entities accessed (all apps)";},
        subtitle:"every asset accessed in this source"+(sens!=="%"?(" · "+sens):""),
        cols:appDetail.cols, drill:{to:"pdc-storage",param:"ds",value:node,label:"Open Storage"}};
    }
    PDC.network(c3b.body,{links:alinks,height:340,fmt:PDC.fmt.n,caption:"hover to isolate · click for detail",detail:nodeDetail});
    var c4=PDC.card("Application Reach Detail",{pill:"reach",src:"fact_entity_application + entity_storage_demo",span:2,sub:"click a row → its entities",info:"Per-application breakdown of entities reached and data volume — the detailed footprint of each consumer. Click a row to list the specific entities it accesses."});g.appendChild(c4.el);
    var ai=d.re.col("app"),ci=d.re.col("acc"),si=d.re.col("assets"),ti=d.re.col("tb");
    PDC.table(c4.body,{cols:[{label:"Application",title:true,fmt:function(x){return PDC.fmt.trunc(x,34);}},
      {label:"Accesses",num:true,bar:true,fmt:PDC.fmt.n},{label:"Assets",num:true,fmt:PDC.fmt.n},
      {label:"Data TB",num:true,fmt:function(x){return (+x||0);}}],
      rows:d.re.rows.map(function(r){return[r[ai],+r[ci]||0,+r[si]||0,+r[ti]||0];}),
      detail:{da:"detail_app_entities",param:"app",keyIdx:0,params:{ds:ds,sens:sens},noun:"entities accessed",
        title:function(app){return app+" — entities accessed";},
        subtitle:"every asset this application reaches"+(ds!=="%"?(" · "+ds):"")+(sens!=="%"?(" · "+sens):""),
        cols:[{key:"name",label:"Entity",title:true,fmt:function(x){return PDC.fmt.trunc(x,40);}},
          {key:"src",label:"Source",fmt:function(x){return PDC.fmt.trunc(x,16);}},
          {key:"accesses",label:"Accesses",num:true,fmt:function(x){return (+x||0).toLocaleString();}},
          {key:"sensitivity",label:"Sensitivity"},{key:"owner",label:"Owner",fmt:function(x){return PDC.fmt.trunc(x,18);}}],
        drill:{to:"pdc-storage",param:"ds",label:"Open Storage"}}});
  }
  function load(){var ds=PDC.filterState.ds||"%",sens=PDC.filterState.sens||"%";var p={ds:ds,sens:sens};PDC.resetCharts();PDC.el("content").innerHTML='<div class="loading">Loading…</div>';
    PDC.load({kpi:["kpi",p],ba:["by_app",p],bt:["by_type",p],bs:["by_source",p],re:["reach",p],asf:["app_source_flow",p]}).then(render).catch(function(e){PDC.fail();console.error(e);});}
  Promise.all([PDC.cda("datasources"),PDC.cda("sensitivities")]).then(function(res){
    var dsOpts=[{v:"%",t:"All sources"}].concat(res[0].rows.map(function(x){return{v:x[0],t:x[0]};}));
    var snOpts=[{v:"%",t:"All sensitivities"}].concat(res[1].rows.map(function(x){return{v:x[0],t:x[0]};}));
    PDC.filters([{id:"ds",label:"Data Source",options:dsOpts,def:"%"},{id:"sens",label:"Sensitivity",options:snOpts,def:"%"}],load);load();
  }).catch(function(){PDC.filters([{id:"ds",label:"Data Source",options:[{v:"%",t:"All sources"}]},{id:"sens",label:"Sensitivity",options:[{v:"%",t:"All sensitivities"}]}],load);load();});
})();
