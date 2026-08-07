// Data Integration Health — flows, throughput, reliability across integrations & platforms.
(function(){
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  function rows(res,a,b){var ia=res.col(a),ib=res.col(b);return res.rows.map(function(r){return{label:String(r[ia]),value:+r[ib]||0};});}
  function render(d){
    PDC.kpis(PDC.el("kpis"),[
      {value:PDC.fmt.n(v(d.kpi,"integrations")),label:"Integrations",state:"purple",info:"Distinct integration tools / jobs (ETL pipelines, ingestion services…) observed moving data — your data-movement surface."},
      {value:PDC.fmt.abbr(v(d.kpi,"runs")),label:"Pipeline Runs",info:"Total job runs executed across all integrations in the window — the activity volume of your data pipelines."},
      {value:PDC.fmt.gb(v(d.kpi,"gb")),label:"Data Moved",info:"Total volume of data (GB) moved by integration jobs — the overall throughput of your pipelines."},
      {value:PDC.fmt.pct(v(d.kpi,"success_pct")),label:"Success Rate",state:(+v(d.kpi,"success_pct")>=90?"good":"warn"),info:"Share of pipeline runs that completed successfully (vs failed/aborted). ≥90% good; below that flags reliability problems worth investigating."},
      {value:PDC.fmt.n(v(d.kpi,"restricted_ungov")),label:"Restricted → Ungoverned",state:(+v(d.kpi,"restricted_ungov")>0?"bad":"good"),info:"Flows carrying Restricted data into an ungoverned destination — the highest compliance exposure in your data movement. Any non-zero value is an audit finding."}
    ]);
    var content=PDC.el("content");content.innerHTML="";var g=PDC.grid(3);content.appendChild(g);

    // Integration Run Activity Calendar: daily run volume + failure rings
    var cc=PDC.card("Integration Run Activity Calendar",{pill:"daily runs · ⬚ failures ringed",src:"fact_lineage_event · dim_date · cube 79",span:3,info:"A GitHub-style heatmap of daily pipeline run volume across all integrations, with failure days ringed in red. Spot active periods, dead gaps (no integration runs), and failure clusters at a glance — the daily heartbeat of your data integration layer."});g.appendChild(cc.el);
    var cdi=d.cal.col("day"),cri=d.cal.col("runs"),cgi=d.cal.col("gb"),cfi=d.cal.col("fails");
    PDC.calendar(cc.body,{unit:"runs",tip2:function(rec){return rec.gb>0?PDC.fmt.gb(rec.gb)+" moved":"";},days:d.cal.rows.map(function(r){return{date:String(r[cdi]),value:+r[cri]||0,runs:+r[cri]||0,fails:+r[cfi]||0,gb:+r[cgi]||0};})});

    // Integration → Destination Platform (Sankey): which integration tools land data in which platforms
    var c1=PDC.card("Integration → Destination Platform",{pill:"flow · GB",src:"fact_lineage_connection + dim_lineage_job · cube 80",span:2,info:"Flow diagram from each integration tool/job to the destination platforms it lands data in, sized by volume moved (GB). Shows which pipelines feed which targets and where throughput concentrates."});g.appendChild(c1.el);
    var iI=d.ipf.col("integ"),iD=d.ipf.col("dest_platform"),iG=d.ipf.col("gb"),iC=d.ipf.col("conns");
    var ilinks=d.ipf.rows.map(function(r){return{source:String(r[iI]),target:String(r[iD]),value:+r[iG]||0,conns:+r[iC]||0};});
    PDC.sankey(c1.body,{links:ilinks,height:Math.max(260,Math.min(460,ilinks.length*26+110)),fmt:PDC.fmt.gb,srcCap:"Integration",dstCap:"Destination platform"});

    // GB by integration
    // click an integration bar → drawer of that integration's actual flows (orig→dest object, route, records, GB)
    var integDetail={da:"detail_integration_flows",param:"integration",noun:"data movements",
      title:function(ig){return ig+" — data movements";},
      subtitle:"every source→destination flow this integration runs",
      cols:[
        {key:"flow",label:"Source → Destination",title:true,fmt:function(x){return PDC.fmt.trunc(x,46);}},
        {key:"route",label:"Platforms"},
        {key:"records",label:"Records",num:true,fmt:function(x){return (+x||0).toLocaleString();}},
        {key:"gb",label:"GB",num:true,fmt:function(x){return (+x||0).toLocaleString();}}]};
    var c2=PDC.card("Data Moved by Integration",{pill:"GB · click → flows",src:"fact_lineage_event · cube 79",info:"Volume (GB) moved per integration tool — which pipelines carry the most data and are therefore the most business-critical to keep healthy. Click a bar to see that integration's actual flows."});g.appendChild(c2.el);
    PDC.bars(c2.body,{horizontal:true,labelW:130,fmt:PDC.fmt.gb,detail:integDetail,data:rows(d.bi,"integ","gb")});

    // Integration ↔ Platform interconnect (chord) — same integration→destination-platform flows as a circular interconnect:
    // integrations + platforms each appear once on the ring (arc = total GB), ribbons = movement. Hover a node to isolate its flows.
    var c2b=PDC.card("Integration ↔ Platform Interconnect",{pill:"chord · GB",src:"fact_lineage_connection + dim_lineage_job · cube 80",span:3,info:"A circular interconnect of the same integration→platform flows; each integration and platform sits on the ring (arc sized by total GB), ribbons show movement between them. Hover a node to isolate its flows."});g.appendChild(c2b.el);
    PDC.chord(c2b.body,{links:ilinks,height:340,fmt:PDC.fmt.gb,caption:"hover a node"});

    // Throughput trend
    var c3=PDC.card("Throughput Trend",{pill:"GB / month",src:"fact_lineage_event · cube 79",span:2,info:"Data moved (GB) per month — the trend of pipeline throughput over time. Rising volume signals a busier, more interconnected estate."});g.appendChild(c3.el);
    PDC.line(c3.body,{area:true,fmt:PDC.fmt.gb,labels:d.tr.rows.map(function(r){return r[d.tr.col("month")];}),series:[{name:"GB Moved",values:d.tr.rows.map(function(r){return +r[d.tr.col("gb")]||0;})}]});

    // Success rate by integration
    var c4=PDC.card("Success Rate by Integration",{pill:"%",src:"fact_lineage_event · cube 79",info:"Per integration, the % of runs that completed successfully — pinpoints which pipelines are reliable vs failure-prone and need attention."});g.appendChild(c4.el);
    PDC.bars(c4.body,{horizontal:true,labelW:130,fmt:function(x){return x+"%";},color:PDC.cssvar("--good"),data:rows(d.su,"integ","success_pct")});

    // Top flows
    var c5=PDC.card("Top Cross-Platform Flows",{pill:"GB",src:"fact_lineage_connection · cube 80",span:3,info:"The highest-volume source→destination flows, with their integration, GB moved, and connection count — where your biggest data movements happen."});g.appendChild(c5.el);
    var fi=d.tf.col("integ"),fl=d.tf.col("flow"),fg=d.tf.col("gb"),fc=d.tf.col("conns");
    PDC.table(c5.body,{cols:[{label:"Integration"},{label:"Flow",title:true,fmt:function(x){return PDC.fmt.trunc(x,52);}},
      {label:"GB",num:true,bar:true,fmt:PDC.fmt.abbr},{label:"Connections",num:true,fmt:PDC.fmt.n}],
      rows:d.tf.rows.map(function(r){return[r[fi],r[fl],+r[fg]||0,+r[fc]||0];})});
  }
  function load(){var ig=PDC.filterState.integration||"%", pl=PDC.filterState.platform||"%";PDC.resetCharts();PDC.el("content").innerHTML='<div class="loading">Loading…</div>';
    PDC.load({kpi:["kpi",{integration:ig}],bi:["by_integration"],ipf:["int_platform_flow",{integration:ig,platform:pl}],tr:["trend",{integration:ig}],su:["success"],tf:["top_flows",{integration:ig,platform:pl}],cal:["int_calendar",{integration:ig}]}).then(render).catch(function(e){PDC.fail();console.error(e);});}
  Promise.all([PDC.cda("integrations"),PDC.cda("dest_platforms")]).then(function(rs){
    var igOpts=[{v:"%",t:"All integrations"}].concat(rs[0].rows.map(function(x){return{v:x[0],t:x[0]};}));
    var plOpts=[{v:"%",t:"All dest platforms"}].concat(rs[1].rows.map(function(x){return{v:x[0],t:x[0]};}));
    PDC.filters([{id:"integration",label:"Integration",options:igOpts,def:"%"},{id:"platform",label:"Dest Platform",options:plOpts,def:"%"}],load);load();
  }).catch(function(){PDC.filters([{id:"integration",label:"Integration",options:[{v:"%",t:"All integrations"}]},{id:"platform",label:"Dest Platform",options:[{v:"%",t:"All dest platforms"}]}],load);load();});
})();
