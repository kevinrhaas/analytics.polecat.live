// Column Profiling & Statistics — data quality at the column level.
(function(){
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  function rows(res,a,b){var ia=res.col(a),ib=res.col(b);return res.rows.map(function(r){return{label:String(r[ia]),value:+r[ib]||0};});}
  function bandColor(b){return /Complete/.test(b)?PDC.cssvar("--good"):/<5%/.test(b)?PDC.cssvar("--c3"):/5-20/.test(b)?PDC.cssvar("--warn"):/20-50/.test(b)?PDC.cssvar("--amber"):PDC.cssvar("--bad");}
  function render(d){
    PDC.kpis(PDC.el("kpis"),[
      {value:PDC.fmt.abbr(v(d.kpi,"profiled_cols")),label:"Profiled Columns",state:"purple",info:"Columns for which the catalog captured structural statistics (row count, distinct-value count, nulls). The population this board profiles."},
      {value:PDC.fmt.pct(v(d.kpi,"avg_uniq")),label:"Avg Uniqueness",info:"Mean uniqueness across columns = distinct values ÷ non-null values. High → key-like / identifier; low → categorical or repetitive data."},
      {value:PDC.fmt.pct(v(d.kpi,"avg_sel")),label:"Avg Selectivity",info:"Mean selectivity = distinct values ÷ total rows. A proxy for how spread-out values are; near 100% means values are almost all unique."},
      {value:PDC.fmt.abbr(v(d.kpi,"max_card")),label:"Max Cardinality",info:"The largest number of distinct values found in any single profiled column — usually an identifier, timestamp, or high-precision measure."}
    ]);
    var content=PDC.el("content");content.innerHTML="";var g=PDC.grid(3);content.appendChild(g);
    var c1=PDC.card("Column Completeness (null %)",{pill:"columns",src:"dim_entity null_count/row_count · cube 71",info:"Columns bucketed by their null fraction (Complete, <5%, 5–20%, 20–50%, >50% null). A heavy high-null tail is data-quality debt — fields that may need defaults, backfill, or removal."});g.appendChild(c1.el);
    PDC.donut(c1.body,{centerCap:"Columns",fmt:PDC.fmt.abbr,data:rows(d.nd,"band","cols").map(function(x){x.label=x.label.replace(/^\d+\.\s*/,'');x.color=bandColor(x.label);return x;})});
    var c2=PDC.card("Profiled Columns by Source",{pill:"columns",src:"dim_entity.cardinality · cube 71",info:"How many profiled columns each source contributes — i.e. how much of your profiling coverage comes from each platform."});g.appendChild(c2.el);
    PDC.bars(c2.body,{horizontal:true,labelW:150,fmt:PDC.fmt.abbr,data:rows(d.bs,"src","profiled_cols")});
    var c3=PDC.card("Avg Uniqueness by Source",{pill:"%",src:"dim_entity.uniqueness · cube 71",info:"Mean column uniqueness per source. Low-uniqueness sources skew categorical/denormalized; high-uniqueness sources are key-rich (lots of identifiers)."});g.appendChild(c3.el);
    PDC.bars(c3.body,{horizontal:true,labelW:150,fmt:function(x){return x+"%";},color:PDC.cssvar("--pdc"),data:rows(d.bs,"src","avg_uniq")});
    var c4=PDC.card("Cardinality vs Rows (top 60 columns)",{pill:"profiling",src:"dim_entity · cube 71",span:2,info:"Each profiled column plotted by row count (x) vs distinct values (y); bubble size = uniqueness %. Points near the diagonal are (near-)unique key candidates; flat low rows are categorical / low-cardinality columns."});g.appendChild(c4.el);
    PDC.scatter(c4.body,{xLabel:"Rows",yLabel:"Cardinality",rLabel:"Uniqueness %",height:300,
      points:d.sc.rows.map(function(r){return{x:+r[d.sc.col("rows")]||0,y:+r[d.sc.col("card")]||0,r:+r[d.sc.col("uniq")]||1,label:String(r[d.sc.col("col")])};})});
    var c5=PDC.card("Highest-Cardinality Columns",{pill:"detail",src:"dim_entity · cube 71",info:"The columns with the most distinct values — typically primary keys, identifiers, timestamps, or high-precision measures. Shown with their null %."});g.appendChild(c5.el);
    var ci=d.tc.col("col"),ri=d.tc.col("rows"),cdi=d.tc.col("card"),ni=d.tc.col("null_pct"),ui=d.tc.col("uniq");
    PDC.table(c5.body,{cols:[{label:"Column",title:true,fmt:function(x){return PDC.fmt.trunc(x,22);}},
      {label:"Cardinality",num:true,bar:true,fmt:PDC.fmt.abbr},{label:"Null %",num:true,fmt:function(x){return (x==null?"–":x+"%");}}],
      rows:d.tc.rows.map(function(r){return[r[ci],+r[cdi]||0,r[ni]];})});
    // Profiling Coverage Growth
    var c6=PDC.card("Profiling Coverage Growth",{pill:"cumulative · month",src:"fact_entity_snapshot + dim_entity + dim_date",span:3,info:"Cumulative entities discovered (gray) vs cumulative entities with column-level profiling stats (blue) month-by-month. The gap between lines = uncharted territory — entities that exist in the catalog but haven't been profiled yet. A closing gap means your profiling program is keeping pace with data growth."});g.appendChild(c6.el);
    var pgr=d.pg;
    PDC.line(c6.body,{area:false,fmt:PDC.fmt.abbr,
      labels:pgr.rows.map(function(r){return r[pgr.col("month")];}),
      series:[
        {name:"Total Entities",values:pgr.rows.map(function(r){return +r[pgr.col("cum_entities")]||0;}),color:"#adb5bd"},
        {name:"Profiled",values:pgr.rows.map(function(r){return +r[pgr.col("cum_profiled")]||0;}),color:PDC.cssvar("--pdc")}
      ]});
  }
  PDC.resetCharts();
  PDC.load({kpi:["kpi"],nd:["null_dist"],bs:["by_source"],sc:["scatter"],tc:["top_cols"],pg:["profiling_trend",{}]}).then(render).catch(function(e){PDC.fail();console.error(e);});
})();
