// Data Movement Flows — Sankey of cross-platform data movement (lineage).
(function(){
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  function rows(res,a,b){var ia=res.col(a),ib=res.col(b);return res.rows.map(function(r){return{label:String(r[ia]),value:+r[ib]||0};});}
  function render(d){
    PDC.kpis(PDC.el("kpis"),[
      {value:PDC.fmt.gb(v(d.kpi,"gb")),label:"Data Moved",state:"purple",info:"Total volume of data (GB) moving between platforms across all lineage connections — the scale of cross-platform data movement."},
      {value:PDC.fmt.n(v(d.kpi,"flows")),label:"Platform Flows",info:"Distinct source-platform → destination-platform routes observed — the number of unique movement paths in your estate."},
      {value:PDC.fmt.n(v(d.kpi,"src_platforms")),label:"Source Platforms",info:"Distinct platforms that originate data movement — where data flows out from."},
      {value:PDC.fmt.n(v(d.kpi,"dst_platforms")),label:"Destination Platforms",info:"Distinct platforms that receive data movement — where data lands."},
      {value:PDC.fmt.abbr(v(d.kpi,"conns")),label:"Connections",info:"Total lineage connections (individual object-to-object links) underlying these platform flows — the fine-grained movement count."}
    ]);
    var content=PDC.el("content");content.innerHTML="";var g=PDC.grid(3);content.appendChild(g);

    // Hero: Sankey of platform-to-platform movement (click a ribbon to drill into Data Integration)
    var si=d.fl.col("src"),ti=d.fl.col("dst"),gi=d.fl.col("gb"),ci=d.fl.col("conns");
    var links=d.fl.rows.map(function(r){return{source:String(r[si]),target:String(r[ti]),value:+r[gi]||0,conns:+r[ci]||0,drill:true};});
    var c1=PDC.card("Cross-Platform Data Movement",{pill:"flow · GB",src:"fact_lineage_connection orig→dest · cube 80",span:3,info:"Flow diagram of data moving between platforms (S3, Snowflake, Kafka, Postgres, BigQuery…). Each ribbon is a source→destination route sized by volume moved (GB). Click a ribbon to drill into that integration's health."});g.appendChild(c1.el);
    PDC.sankey(c1.body,{links:links,height:Math.max(320,Math.min(560,links.length*30+120)),fmt:PDC.fmt.gb,
      srcCap:"Source platform",dstCap:"Destination platform",
      onDrill:function(l){ window.location.href = PDC.dashUrl("i-data-integration"); }});

    // Platform topology (radial network) — same flows as a node-link graph; hover a platform to light its blast radius, click for its actual flows
    var ig=PDC.filterState.integration||"%";
    var platformDetail={da:"detail_platform_flows",param:"platform",params:{integration:ig},noun:"data movements",
      title:function(p){return p+" — data movement";},
      subtitle:"every flow into or out of this platform"+(ig!=="%"?(" · "+ig):""),
      cols:[
        {key:"flow",label:"Source → Destination",title:true,fmt:function(x){return PDC.fmt.trunc(x,46);}},
        {key:"route",label:"Platforms"},
        {key:"integ",label:"Integration",fmt:function(x){return PDC.fmt.trunc(x,18);}},
        {key:"records",label:"Records",num:true,fmt:function(x){return (+x||0).toLocaleString();}},
        {key:"gb",label:"GB",num:true,fmt:function(x){return (+x||0).toLocaleString();}}],
      drill:{to:"i-data-integration",param:"integration",label:"Open Integration Health"}};
    var c1b=PDC.card("Platform Connection Topology",{pill:"network · GB · click → flows",src:"fact_lineage_connection · cube 80",span:1,info:"The same platform-to-platform flows shown as a node-link network; each platform is a node, edges are movement sized by volume. Hover a platform to light up everything it connects to (its blast radius); click a node for its actual flows."});g.appendChild(c1b.el);
    PDC.network(c1b.body,{links:links,height:320,fmt:PDC.fmt.gb,caption:"hover to isolate · click a node for its flows",detail:platformDetail});

    // Volume by source platform
    var c2=PDC.card("Outbound Volume by Source Platform",{pill:"GB",src:"fact_lineage_connection · cube 80",span:2,info:"Volume (GB) leaving each source platform — which platforms are your biggest data producers / exporters."});g.appendChild(c2.el);
    PDC.bars(c2.body,{horizontal:true,labelW:120,fmt:PDC.fmt.gb,data:rows(d.bs,"src","gb")});

    // Volume by integration
    var c3=PDC.card("Data Moved by Integration",{pill:"GB",src:"fact_lineage_connection · cube 80",span:2,linkTo:"i-data-integration",linkLabel:"Integration health →",info:"Volume (GB) moved per integration tool — which pipelines drive the most cross-platform movement. Click through to the Integration Health board."});g.appendChild(c3.el);
    PDC.bars(c3.body,{horizontal:true,labelW:150,fmt:PDC.fmt.gb,color:PDC.cssvar("--pdc"),data:rows(d.bi,"integ","gb")});

    // Platform interconnect (chord) — the same platform↔platform flows as a circular interconnect matrix:
    // each platform appears ONCE on the ring (arc = total in+out), ribbons = combined movement. Hover an arc to isolate its flows.
    var c3b=PDC.card("Platform Interconnect",{pill:"chord · GB",src:"fact_lineage_connection orig↔dest · cube 80",span:1,info:"The same platform↔platform flows as a circular interconnect; each platform sits once on the ring (arc = total in + out volume), ribbons are combined movement. Hover an arc to isolate its flows."});g.appendChild(c3b.el);
    PDC.chord(c3b.body,{links:links,height:320,fmt:PDC.fmt.gb,caption:"hover a platform"});

    // Monthly data movement volume trend — GB moved + success rate over time
    var c3c=PDC.card("Monthly Data Movement Trend",{pill:"GB · success % · month",src:"fact_lineage_event × dim_date × dim_lineage_job",span:3,info:"Month-by-month data movement volume (GB transferred) and pipeline success rate — shows whether movement is growing or shrinking and whether reliability is improving. Filter by integration to isolate a specific pipeline's trajectory."});g.appendChild(c3c.el);
    var mi=d.mt.col("ym"),gi=d.mt.col("gb"),ri=d.mt.col("runs"),si=d.mt.col("success_pct");
    var labels=d.mt.rows.map(function(r){return String(r[mi]);});
    var gbVals=d.mt.rows.map(function(r){return +r[gi]||0;});
    var pctVals=d.mt.rows.map(function(r){return +r[si]||0;});
    PDC.line(c3c.body,{area:true,fmt:PDC.fmt.gb,labels:labels,
      series:[
        {name:"GB Moved",values:gbVals,color:"#005bb5"},
        {name:"Success %",values:pctVals,color:"#16a085"}
      ]});

    // Top namespace-level flows
    var c4=PDC.card("Top Cross-Platform Flows (namespace level)",{pill:"GB",src:"fact_lineage_connection · cube 80",span:3,info:"The highest-volume namespace-level source→destination flows, with their integration, GB moved, and connection count — your biggest concrete data movements."});g.appendChild(c4.el);
    var fl=d.tf.col("flow"),fii=d.tf.col("integ"),fg=d.tf.col("gb"),fc=d.tf.col("conns");
    PDC.table(c4.body,{cols:[{label:"Flow (source → destination)",title:true,fmt:function(x){return PDC.fmt.trunc(x,60);}},
      {label:"Integration"},{label:"GB Moved",num:true,bar:true,fmt:PDC.fmt.abbr},{label:"Connections",num:true,fmt:PDC.fmt.n}],
      rows:d.tf.rows.map(function(r){return[r[fl],r[fii],+r[fg]||0,+r[fc]||0];})});
  }
  function load(){var ig=PDC.filterState.integration||"%", pl=PDC.filterState.platform||"%";PDC.resetCharts();PDC.el("content").innerHTML='<div class="loading">Loading…</div>';
    PDC.load({kpi:["kpi",{integration:ig,platform:pl}],fl:["flows",{integration:ig,platform:pl}],bs:["by_src",{integration:ig,platform:pl}],bi:["by_integration"],mt:["movement_trend",{integration:ig}],tf:["top_flows",{integration:ig,platform:pl}]}).then(render).catch(function(e){PDC.fail();console.error(e);});}
  Promise.all([PDC.cda("integrations"),PDC.cda("platforms")]).then(function(rs){
    var igOpts=[{v:"%",t:"All integrations"}].concat(rs[0].rows.map(function(x){return{v:x[0],t:x[0]};}));
    var plOpts=[{v:"%",t:"All platforms"}].concat(rs[1].rows.map(function(x){return{v:x[0],t:x[0]};}));
    PDC.filters([{id:"integration",label:"Integration",options:igOpts,def:"%"},{id:"platform",label:"Platform",options:plOpts,def:"%"}],load);load();
  }).catch(function(){PDC.filters([{id:"integration",label:"Integration",options:[{v:"%",t:"All integrations"}]},{id:"platform",label:"Platform",options:[{v:"%",t:"All platforms"}]}],load);load();});
})();
