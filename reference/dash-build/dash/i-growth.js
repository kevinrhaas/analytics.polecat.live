// Catalog Growth & Discovery — how the catalog has grown over time.
(function(){
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  function rows(res,a,b){var ia=res.col(a),ib=res.col(b);return res.rows.map(function(r){return{label:String(r[ia]),value:+r[ib]||0};});}
  function render(d){
    PDC.kpis(PDC.el("kpis"),[
      {value:PDC.fmt.abbr(v(d.kpi,"total_assets")),label:"Catalog Assets",state:"purple",info:"Total catalog objects discovered to date across all connected sources — the current size of the managed estate."},
      {value:PDC.fmt.n(v(d.kpi,"scan_days")),label:"Scan Days",info:"Number of distinct days on which the catalog scanned and discovered assets — the span of observed discovery history."},
      {value:PDC.fmt.n(v(d.kpi,"sources")),label:"Data Sources",info:"Number of distinct connected sources / platforms contributing assets to the catalog."},
      {value:PDC.fmt.abbr(v(d.kpi,"last90")),label:"Discovered (90d)",state:"good",info:"Assets first scanned in the last 90 days — the recent discovery rate, a pulse on how fast new data is being onboarded."}
    ]);
    var content=PDC.el("content");content.innerHTML="";var g=PDC.grid(3);content.appendChild(g);
    var months=d.tr.rows.map(function(r){return String(r[d.tr.col("month")]);});
    var c1=PDC.card("Catalog Growth (cumulative assets)",{pill:"discovery",src:"fact_entity_snapshot.scanned_date · cube 71",span:2,info:"Running total of catalog assets over time — the growth curve of your managed estate. A steepening line means discovery is accelerating."});g.appendChild(c1.el);
    PDC.line(c1.body,{area:true,fmt:PDC.fmt.abbr,labels:months,series:[{name:"Cumulative Assets",values:d.tr.rows.map(function(r){return +r[d.tr.col("cumulative")]||0;})}]});
    var c2=PDC.card("Assets by Data Source",{pill:"assets",src:"dim_datasource · cube 71",info:"How the current catalog splits across connected sources — which platforms contribute the most discovered assets."});g.appendChild(c2.el);
    PDC.donut(c2.body,{centerCap:"Assets",fmt:PDC.fmt.abbr,data:rows(d.bs,"src","assets").map(function(x,i){x.color=PDC.color(i);return x;})});
    var c3=PDC.card("Assets Scanned per Month",{pill:"discovery",src:"fact_entity_snapshot · cube 71",span:2,info:"New assets first discovered each month — the per-period discovery rate behind the cumulative curve. Spikes often mark a newly-onboarded source."});g.appendChild(c3.el);
    PDC.bars(c3.body,{rotate:true,fmt:PDC.fmt.abbr,data:rows(d.tr,"month","assets")});
    var c4=PDC.card("Recently Discovered",{pill:"latest",src:"fact_entity_snapshot + dim_entity",info:"The most recently scanned assets — a live feed of what the catalog has just picked up, with their source and scan date."});g.appendChild(c4.el);
    var ni=d.rc.col("name"),si=d.rc.col("src"),di=d.rc.col("scan_date");
    PDC.table(c4.body,{cols:[{label:"Asset",title:true,fmt:function(x){return PDC.fmt.trunc(x,24);}},
      {label:"Source",fmt:function(x){return PDC.fmt.trunc(x,12);}},{label:"Scanned"}],
      rows:d.rc.rows.map(function(r){return[r[ni],r[si],String(r[di]).slice(0,10)];})});

    // Discovery Race — multi-source cumulative growth lines
    var c5=PDC.card("Discovery Race — Cumulative Assets by Source",{pill:"cumulative · top 8 sources",src:"fact_entity_snapshot · dim_datasource · cube 71",span:3,info:"Running total of catalog objects per connected source over time. Each line shows when a source was onboarded and how fast it is growing — steep climbs mark major data-source additions. Diverging lines reveal which platforms are expanding vs. stable inventories."});g.appendChild(c5.el);
    var gymi=d.gs.col("ym"),gmni=d.gs.col("month"),gsrci=d.gs.col("src"),gaai=d.gs.col("assets");
    var monthNums=[],monthNames={};
    d.gs.rows.forEach(function(r){var ym=+r[gymi],mn=String(r[gmni]);if(monthNums.indexOf(ym)<0){monthNums.push(ym);monthNames[ym]=mn;}});
    monthNums.sort(function(a,b){return a-b;});
    var srcMap={};
    d.gs.rows.forEach(function(r){var src=String(r[gsrci]),ym=+r[gymi],cnt=+r[gaai]||0;if(!srcMap[src])srcMap[src]={};srcMap[src][ym]=(srcMap[src][ym]||0)+cnt;});
    var srcTotals={};
    Object.keys(srcMap).forEach(function(src){srcTotals[src]=Object.keys(srcMap[src]).reduce(function(s,k){return s+(srcMap[src][k]||0);},0);});
    var topSrcs=Object.keys(srcMap).sort(function(a,b){return srcTotals[b]-srcTotals[a];}).slice(0,8);
    var raceLabels=monthNums.map(function(ym){return monthNames[ym];});
    var raceSeries=topSrcs.map(function(src,i){
      var cum=0,values=monthNums.map(function(ym){cum+=(srcMap[src][ym]||0);return cum;});
      return{name:src,values:values,color:PDC.color(i)};});
    PDC.line(c5.body,{area:false,fmt:PDC.fmt.abbr,labels:raceLabels,series:raceSeries});
  }
  PDC.resetCharts();
  PDC.load({kpi:["kpi"],tr:["trend"],bs:["by_source"],rc:["recent"],gs:["growth_by_source"]}).then(render).catch(function(e){PDC.fail();console.error(e);});
})();
