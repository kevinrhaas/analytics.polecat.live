// Storage Footprint & Capacity.
(function(){
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  function rows(res,a,b){var ia=res.col(a),ib=res.col(b);return res.rows.map(function(r){return{label:String(r[ia]),value:+r[ib]||0};});}
  function render(d){
    PDC.kpis(PDC.el("kpis"),[
      {value:(v(d.kpi,"total_tb")||0)+" TB",label:"Total Storage",state:"purple",info:"Sum of physical size (size_bytes) across all catalog objects matching the current filters. The on-disk footprint you pay to store and protect."},
      {value:PDC.fmt.abbr(v(d.kpi,"assets")),label:"Assets",info:"Count of distinct catalog objects (tables, files, folders) in scope — the number of things under management."},
      {value:(v(d.kpi,"avg_gb")||0)+" GB",label:"Avg Object Size",info:"Mean size per object (total storage ÷ assets). High averages point to large tables/files; very low averages suggest many small objects (metadata overhead)."},
      {value:(v(d.kpi,"max_gb")||0)+" GB",label:"Largest Object",info:"Size of the single biggest object in scope — your top capacity-and-cost concentration and a candidate for tiering or archival."}
    ]);
    var content=PDC.el("content");content.innerHTML="";var g=PDC.grid(3);content.appendChild(g);
    var sens=PDC.filterState.sens||"%";
    // click a source (bar or treemap tile) → drawer listing the ACTUAL assets behind that count
    var assetDetail={da:"detail_assets",param:"src",params:{sens:sens},noun:"assets",
      title:function(src){return src+" — assets";},
      subtitle:"every object in this data source"+(sens!=="%"?(" · "+sens):""),
      cols:[
        {key:"name",label:"Object",title:true,fmt:function(x){return PDC.fmt.trunc(x,42);}},
        {key:"restype",label:"Type",fmt:function(x){return PDC.fmt.trunc(x,18);}},
        {key:"gb",label:"GB",num:true,fmt:function(x){return (+x||0).toLocaleString();}},
        {key:"sensitivity",label:"Sensitivity"},
        {key:"owner",label:"Owner",fmt:function(x){return PDC.fmt.trunc(x,22);}}],
      drill:{to:"pdc-cost",param:"ds",label:"Open Cost for this source"}};
    var c1=PDC.card("Storage by Data Source",{pill:"TB",src:"entity_storage_demo · cube 71",sub:"click a bar → its assets",info:"Physical storage (TB) attributed to each connected data source (AWS, Azure, Postgres…). Shows where your footprint — and storage spend — concentrates."});g.appendChild(c1.el);
    PDC.bars(c1.body,{horizontal:true,labelW:150,fmt:function(x){return x+" TB";},data:rows(d.bs,"src","tb"),detail:assetDetail});
    var c2=PDC.card("Structured vs Unstructured",{pill:"TB",src:"dim_entity.resource_type · cube 71",info:"Splits storage between structured assets (database tables) and unstructured assets (files, documents). Unstructured-heavy estates are harder to govern and classify."});g.appendChild(c2.el);
    PDC.donut(c2.body,{centerCap:"TB",fmt:function(x){return x+" TB";},data:rows(d.rt,"rt","tb").map(function(x,i){x.color=PDC.color(i);return x;})});
    var c3=PDC.card("Object Size Distribution",{pill:"assets",src:"entity_storage_demo · cube 71",info:"How many objects fall into each size band (e.g. <1 GB, 1–10 GB, 100 GB+). A long tail of tiny objects adds catalog/scan overhead; a few huge ones drive cost."});g.appendChild(c3.el);
    PDC.bars(c3.body,{horizontal:true,labelW:110,fmt:PDC.fmt.abbr,color:PDC.cssvar("--c3"),data:rows(d.sd,"band","assets")});
    var c4=PDC.card("Storage Treemap by Source",{pill:"TB",src:"entity_storage_demo · cube 71",span:2,sub:"click a tile → its assets",info:"Same source breakdown as the bar chart, sized by storage — tile area ∝ TB. A fast visual read of which sources dominate the footprint."});g.appendChild(c4.el);
    PDC.treemap(c4.body,{height:300,fmt:function(x){return x+" TB";},data:rows(d.bs,"src","tb"),detail:assetDetail});
    var c5=PDC.card("Largest Objects",{pill:"top",src:"entity_storage_demo + dim_entity",sub:"click a row → full record",info:"The biggest individual objects by size — the heaviest contributors to capacity and cost. Prime candidates for archival, compression, or tiering."});g.appendChild(c5.el);
    var ni=d.ta.col("name"),si=d.ta.col("src"),ri=d.ta.col("rt"),gi=d.ta.col("gb");
    PDC.table(c5.body,{cols:[
      {label:"Object",title:true,fmt:function(x){return PDC.fmt.trunc(x,28);}},
      {label:"Source",fmt:function(x){return PDC.fmt.trunc(x,14);}},
      {label:"Resource Type"},
      {label:"GB",num:true,bar:true,fmt:function(x){return (+x||0);}}],
      rows:d.ta.rows.map(function(r){return[r[ni],r[si],r[ri],+r[gi]||0];}),
      recordDetail:{title:function(r){return PDC.fmt.trunc(r[0],48);},subtitle:"object record",
        drill:{to:"pdc-cost",param:"ds",keyIdx:1,label:"Open Cost for this source"}}});

    // Storage footprint growth — cumulative TB (area) over the month entities were first scanned
    var c6=PDC.card("Storage Footprint Growth",{pill:"cumulative TB · month",src:"fact_entity_snapshot + first scan · dim_date",span:3,info:"Cumulative storage over time, bucketed by the month each object was first discovered by the catalog scanner. The slope is your growth rate — steep slopes forecast future capacity/cost."});g.appendChild(c6.el);
    PDC.line(c6.body,{area:true,fmt:function(x){return x+" TB";},labels:d.gr.rows.map(function(r){return r[d.gr.col("month")];}),
      series:[{name:"Cumulative TB",values:d.gr.rows.map(function(r){return +r[d.gr.col("cum_tb")]||0;}),color:PDC.cssvar("--pdc")}]});

    // Storage Footprint Growth by Source — cumulative TB per top-8 source (multi-line)
    var cgbs=PDC.card("Storage Footprint Growth by Source",{pill:"cumulative TB · top 8 sources",src:"fact_entity_snapshot + first scan · dim_date · dim_datasource",span:3,info:"Cumulative storage growth trajectory for the 8 largest data sources, month by month. Reveals which sources are adding the most capacity over time — and which ones to watch for cost management."});g.appendChild(cgbs.el);
    if(d.gbs&&d.gbs.rows.length){
      var gbsYmi=d.gbs.col("ym"),gbsMni=d.gbs.col("month"),gbsSrci=d.gbs.col("src"),gbsTbi=d.gbs.col("cum_tb");
      var gbsMonthNums=[],gbsMonthNames={},gbsSrcMap={};
      d.gbs.rows.forEach(function(r){var ym=String(r[gbsYmi]),mn=String(r[gbsMni]);if(gbsMonthNums.indexOf(ym)<0){gbsMonthNums.push(ym);gbsMonthNames[ym]=mn;}});
      gbsMonthNums.sort();
      d.gbs.rows.forEach(function(r){var src=String(r[gbsSrci]),ym=String(r[gbsYmi]),tb=+r[gbsTbi]||0;if(!gbsSrcMap[src])gbsSrcMap[src]={};gbsSrcMap[src][ym]=tb;});
      var gbsLabels=gbsMonthNums.map(function(ym){return gbsMonthNames[ym];});
      var gbsSeries=Object.keys(gbsSrcMap).map(function(src,i){
        var values=gbsMonthNums.map(function(ym){return gbsSrcMap[src][ym]!==undefined?gbsSrcMap[src][ym]:null;});
        return{name:src,values:values,color:PDC.color(i)};});
      PDC.line(cgbs.body,{area:false,fmt:function(x){return x+" TB";},labels:gbsLabels,series:gbsSeries});
    }
  }
  function load(){var ds=PDC.filterState.ds||"%",sens=PDC.filterState.sens||"%";PDC.resetCharts();PDC.el("content").innerHTML='<div class="loading">Loading…</div>';
    var p={ds:ds,sens:sens};
    PDC.load({kpi:["kpi",p],bs:["by_source",p],rt:["by_restype",p],sd:["size_dist",p],ta:["top_assets",p],gr:["growth",p],gbs:["growth_by_source",p]}).then(render).catch(function(e){PDC.fail();console.error(e);});}
  Promise.all([PDC.cda("datasources"),PDC.cda("sensitivities")]).then(function(res){
    var dsOpts=[{v:"%",t:"All sources"}].concat(res[0].rows.map(function(x){return{v:x[0],t:x[0]};}));
    var snOpts=[{v:"%",t:"All sensitivities"}].concat(res[1].rows.map(function(x){return{v:x[0],t:x[0]};}));
    PDC.filters([{id:"ds",label:"Data Source",options:dsOpts,def:"%"},{id:"sens",label:"Sensitivity",options:snOpts,def:"%"}],load);load();
  }).catch(function(){PDC.filters([{id:"ds",label:"Data Source",options:[{v:"%",t:"All sources"}]},{id:"sens",label:"Sensitivity",options:[{v:"%",t:"All sensitivities"}]}],load);load();});
})();
