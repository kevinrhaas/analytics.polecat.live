// Redundancy & Duplicate Data.
(function(){
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  function rows(res,a,b){var ia=res.col(a),ib=res.col(b);return res.rows.map(function(r){return{label:String(r[ia]),value:+r[ib]||0};});}
  function render(d){
    PDC.kpis(PDC.el("kpis"),[
      {value:PDC.fmt.abbr(v(d.kpi,"dup_assets")),label:"Duplicate Assets",state:"warn",info:"Objects that are byte-for-byte (or near) copies of another. Every duplicate is storage you pay for twice — the raw size of the redundancy problem."},
      {value:PDC.fmt.pct(v(d.kpi,"dup_pct")),label:"Duplicate Rate",state:"warn",info:"Share of the estate that is duplicated. A high rate means significant waste and a strong, low-risk reclamation opportunity."},
      {value:(v(d.kpi,"savings_tb")||0)+" TB",label:"Reclaimable Storage",state:"good",info:"Storage (TB) you could free by removing duplicate copies — capacity back without deleting any unique data."},
      {value:PDC.fmt.money(v(d.kpi,"savings_cost"))+"/mo",label:"Reclaimable Cost",state:"good",info:"Monthly spend tied up in duplicate copies — the dollar value of deduplicating. The fastest, lowest-risk cost win."}
    ]);
    var content=PDC.el("content");content.innerHTML="";var g=PDC.grid(3);content.appendChild(g);
    var sens=PDC.filterState.sens||"%";
    // click a source → drawer of the ACTUAL duplicate objects behind that count (is_duplicate rows)
    var dupDetail={da:"detail_dups",param:"src",params:{sens:sens},noun:"duplicate objects",
      title:function(src){return src+" — duplicate objects";},
      subtitle:"every is_duplicate object in this source"+(sens!=="%"?(" · "+sens):""),
      cols:[
        {key:"name",label:"Object",title:true,fmt:function(x){return PDC.fmt.trunc(x,40);}},
        {key:"gb",label:"GB",num:true,fmt:function(x){return (+x||0).toLocaleString();}},
        {key:"savings_gb",label:"Reclaimable GB",num:true,fmt:function(x){return (+x||0).toLocaleString();}},
        {key:"sensitivity",label:"Sensitivity"},
        {key:"owner",label:"Owner",fmt:function(x){return PDC.fmt.trunc(x,20);}}],
      drill:{to:"pdc-storage",param:"ds",label:"Open Storage for this source"}};
    var c1=PDC.card("Reclaimable Storage by Source",{pill:"TB",src:"entity_storage_demo · cube 75",sub:"click → its duplicates",info:"Reclaimable TB per source. Ranks where deduplication frees the most capacity — start at the top. Click a bar for the actual duplicate objects."});g.appendChild(c1.el);
    PDC.bars(c1.body,{horizontal:true,labelW:150,fmt:function(x){return x+" TB";},color:PDC.cssvar("--good"),data:rows(d.ss,"src","tb"),detail:dupDetail});
    var c2=PDC.card("Duplicate Assets by Source",{pill:"count",src:"entity_storage_demo · cube 75",sub:"click → its duplicates",info:"Count of duplicate objects per source. Shows where redundancy concentrates and which platform to clean up first. Click a bar for the actual duplicates."});g.appendChild(c2.el);
    PDC.bars(c2.body,{horizontal:true,labelW:150,fmt:PDC.fmt.abbr,color:PDC.cssvar("--warn"),data:rows(d.ds,"src","dups"),detail:dupDetail});
    var c3=PDC.card("Reclaimable by Sensitivity",{pill:"TB",src:"entity_storage_demo · cube 75",info:"Reclaimable storage split by sensitivity. Duplicates of sensitive data are double trouble — wasted spend AND extra copies to secure and govern."});g.appendChild(c3.el);
    PDC.donut(c3.body,{centerCap:"TB",fmt:function(x){return x+" TB";},data:rows(d.sse,"sens","tb").map(function(x,i){x.color=PDC.color(i);return x;})});
    var c4=PDC.card("Reclaimable Treemap by Source",{pill:"TB",src:"entity_storage_demo · cube 75",span:2,sub:"click a tile → its duplicates",info:"Same reclaimable TB per source, sized by tile area — a fast visual read of where duplicate waste concentrates."});g.appendChild(c4.el);
    PDC.treemap(c4.body,{height:300,fmt:function(x){return x+" TB";},data:rows(d.ss,"src","tb"),detail:dupDetail});
    var c5=PDC.card("Top Duplicate Objects",{pill:"savings",src:"entity_storage_demo + dim_entity",info:"The individual objects with the most reclaimable space — your concrete dedup worklist, biggest savings first."});g.appendChild(c5.el);
    var ni=d.td.col("name"),si=d.td.col("src"),gi=d.td.col("gb");
    PDC.table(c5.body,{cols:[{label:"Object",title:true,fmt:function(x){return PDC.fmt.trunc(x,26);}},
      {label:"Source",fmt:function(x){return PDC.fmt.trunc(x,14);}},
      {label:"Reclaim GB",num:true,bar:true,fmt:function(x){return (+x||0);}}],
      rows:d.td.rows.map(function(r){return[r[ni],r[si],+r[gi]||0];})});
  }
  function load(){var ds=PDC.filterState.ds||"%",sens=PDC.filterState.sens||"%";PDC.resetCharts();PDC.el("content").innerHTML='<div class="loading">Loading…</div>';
    var p={ds:ds,sens:sens};
    // sse = "Reclaimable by Sensitivity" breakdown — responds to source only, NOT the sensitivity filter (one-tier filter is degenerate)
    PDC.load({kpi:["kpi",p],ds:["dups_by_source",p],ss:["savings_by_source",p],sse:["savings_by_sens",{ds:ds}],td:["top_dups",p]}).then(render).catch(function(e){PDC.fail();console.error(e);});}
  Promise.all([PDC.cda("datasources"),PDC.cda("sensitivities")]).then(function(res){
    var dsOpts=[{v:"%",t:"All sources"}].concat(res[0].rows.map(function(x){return{v:x[0],t:x[0]};}));
    var snOpts=[{v:"%",t:"All sensitivities"}].concat(res[1].rows.map(function(x){return{v:x[0],t:x[0]};}));
    PDC.filters([{id:"ds",label:"Data Source",options:dsOpts,def:"%"},{id:"sens",label:"Sensitivity",options:snOpts,def:"%"}],load);load();
  }).catch(function(){PDC.filters([{id:"ds",label:"Data Source",options:[{v:"%",t:"All sources"}]},{id:"sens",label:"Sensitivity",options:[{v:"%",t:"All sensitivities"}]}],load);load();});
})();
