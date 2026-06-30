// Data Quality & Metadata Completeness — completeness, profiling, missing attributes.
(function(){
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  function rows(res,a,b){var ia=res.col(a),ib=res.col(b);return res.rows.map(function(r){return{label:String(r[ia]),value:+r[ib]||0};});}

  function render(d){
    var comp=+v(d.kpi,"completeness_pct")||0;
    PDC.kpis(PDC.el("kpis"),[
      {value:PDC.fmt.pct(comp),label:"Metadata Complete",state:comp>=70?"good":comp>=40?"warn":"bad",info:"Average share of expected metadata attributes (owner, description, dates, classification…) that are actually populated. Higher = more discoverable, trustworthy, governable data."},
      {value:PDC.fmt.abbr(v(d.kpi,"assets")),label:"Assets",state:"purple",info:"Count of catalog objects in scope — the denominator for every completeness rate on this board."},
      {value:PDC.fmt.abbr(v(d.kpi,"missing_owner")),label:"Missing Owner",state:"warn",info:"Objects with no assigned owner/steward. Ownerless data has no one accountable for its quality or access — a top remediation priority."},
      {value:PDC.fmt.abbr(v(d.kpi,"missing_dates")),label:"Missing Dates",state:"warn",info:"Objects lacking key lifecycle dates (created/updated). Missing dates break freshness, retention, and lineage reasoning."}
    ]);
    var content=PDC.el("content");content.innerHTML="";var g=PDC.grid(3);content.appendChild(g);
    var ds=PDC.filterState.ds||"%",sens=PDC.filterState.sens||"%";
    // click a completeness band → drawer of the ACTUAL entities in that band (one row per asset)
    var bandDetail={da:"detail_by_band",param:"band",params:{ds:ds,sens:sens},noun:"entities",
      title:function(band){return band+" — entities";},
      subtitle:"every asset in this completeness band"+(ds!=="%"?(" · "+ds):"")+(sens!=="%"?(" · "+sens):""),
      cols:[
        {key:"name",label:"Entity",title:true,fmt:function(x){return PDC.fmt.trunc(x,40);}},
        {key:"src",label:"Source",fmt:function(x){return PDC.fmt.trunc(x,16);}},
        {key:"completed",label:"Fields ✓",num:true,fmt:function(x){return (+x||0);}},
        {key:"expected",label:"Expected",num:true,fmt:function(x){return (+x||0);}},
        {key:"sensitivity",label:"Sensitivity"},
        {key:"owner",label:"Owner",fmt:function(x){return PDC.fmt.trunc(x,18);}}],
      drill:{to:"pdc-ownership",param:"ds",label:"Open Ownership for this source"}};

    var c1=PDC.card("Completeness Distribution",{pill:"assets",src:"fact_entity_snapshot.metadata_completeness_band · cube 71",sub:"click a slice → its entities",info:"How objects spread across completeness bands (e.g. Complete, Mostly, Partial, Sparse). A large low-completeness tail is your metadata debt. Click a slice for the actual entities."});g.appendChild(c1.el);
    var bi=d.cb.col("band"),ba=d.cb.col("assets");
    PDC.donut(c1.body,{centerCap:"Assets",fmt:PDC.fmt.abbr,detail:bandDetail,data:d.cb.rows.map(function(r){var s=String(r[bi]);
      var col=/complete|high|good|9|10/i.test(s)?PDC.cssvar("--good"):/partial|medium|5|6|7/i.test(s)?PDC.cssvar("--warn"):/low|sparse|missing|0|1|2/i.test(s)?PDC.cssvar("--bad"):PDC.cssvar("--c2");
      return{label:s,value:+r[ba]||0,color:col};})});

    var c2=PDC.card("Profiling Status",{pill:"assets",src:"dim_entity.data_profile_status · cube 71",info:"Whether each object has been data-profiled (column stats, patterns, null rates). Unprofiled data hides quality issues until something downstream breaks."});g.appendChild(c2.el);
    var pi=d.prof.col("status"),pa=d.prof.col("assets");
    PDC.donut(c2.body,{centerCap:"Assets",fmt:PDC.fmt.abbr,data:d.prof.rows.map(function(r){var s=String(r[pi]);
      return{label:s,value:+r[pa]||0,color:/profiled|complete|success/i.test(s)&&!/not/i.test(s)?PDC.cssvar("--good"):/not|none|pending/i.test(s)?PDC.cssvar("--text-faint"):PDC.cssvar("--warn")};})});

    var c3=PDC.card("Most-Missing Attributes",{pill:"count",src:"fact_entity_snapshot · cube 71",info:"Which metadata fields are blank most often across the estate. Tells you exactly which attribute to fix first for the biggest completeness lift."});g.appendChild(c3.el);
    PDC.bars(c3.body,{horizontal:true,labelW:120,fmt:PDC.fmt.abbr,color:PDC.cssvar("--bad"),data:rows(d.ma,"attr","cnt")});

    var c4=PDC.card("Completeness by Data Source",{pill:"%",src:"fact_entity_snapshot · cube 71",span:2,info:"Average metadata completeness per source. Low-scoring sources are where curation lags — the place to focus stewardship effort first."});g.appendChild(c4.el);
    PDC.bars(c4.body,{horizontal:true,labelW:150,fmt:function(x){return x+"%";},color:PDC.cssvar("--pdc"),data:rows(d.cbs,"src","pct")});

    var c5=PDC.card("Quality vs Governance by Source",{pill:"scatter",src:"fact_entity_snapshot · cube 71",info:"Each source plotted by metadata completeness (x) against governed coverage (y). Bottom-left sources are doubly at-risk — poorly described AND poorly governed."});g.appendChild(c5.el);
    var si=d.qs.col("src"),xi=d.qs.col("comp_pct"),yi=d.qs.col("gov_pct"),ri=d.qs.col("assets");
    PDC.scatter(c5.body,{xLabel:"Completeness %",yLabel:"Governed %",rLabel:"assets",fmtX:function(x){return x+"%";},fmtY:function(x){return x+"%";},
      points:d.qs.rows.map(function(r,i){return{x:+r[xi]||0,y:+r[yi]||0,r:+r[ri]||1,label:String(r[si]),color:PDC.color(i)};})});

    // Quality Improvement Race — completeness % per top-8 source over 18 months
    var cqr=PDC.card("Quality Improvement Race — Completeness by Source",{pill:"% · top 8 sources",src:"fact_entity_snapshot · dim_date · cube 71",span:3,info:"Metadata completeness trend for the 8 largest sources, month by month. A rising line means curation is catching up with new data. A flat or declining line flags a source that needs stewardship attention."});g.appendChild(cqr.el);
    if(d.qr&&d.qr.rows.length){
      var qymi=d.qr.col("ym"),qmni=d.qr.col("month"),qsrci=d.qr.col("src"),qpcti=d.qr.col("completeness_pct");
      var qMonthNums=[],qMonthNames={},qSrcMap={};
      d.qr.rows.forEach(function(r){var ym=+r[qymi],mn=String(r[qmni]);if(qMonthNums.indexOf(ym)<0){qMonthNums.push(ym);qMonthNames[ym]=mn;}});
      qMonthNums.sort(function(a,b){return a-b;});
      d.qr.rows.forEach(function(r){var src=String(r[qsrci]),ym=+r[qymi],pct=+r[qpcti]||0;if(!qSrcMap[src])qSrcMap[src]={};qSrcMap[src][ym]=pct;});
      var qLabels=qMonthNums.map(function(ym){return qMonthNames[ym];});
      var qSeries=Object.keys(qSrcMap).map(function(src,i){
        var values=qMonthNums.map(function(ym){return qSrcMap[src][ym]!==undefined?qSrcMap[src][ym]:null;});
        return{name:src,values:values,color:PDC.color(i)};});
      PDC.line(cqr.body,{area:false,fmt:function(x){return x+"%";},labels:qLabels,series:qSeries});
    }

    // Worst offenders — lowest-completeness entities (actionable stewardship backlog)
    var c6=PDC.card("Lowest-Completeness Entities",{pill:"remediation",src:"fact_entity_snapshot · metadata_completed/expected · cube 71",span:3,info:"The worst-described individual objects — your concrete remediation worklist. Fixing these moves the completeness KPI the most per unit of effort."});g.appendChild(c6.el);
    var ei=d.we.col("entity"),wi=d.we.col("src"),xe=d.we.col("expected"),pe=d.we.col("complete_pct");
    PDC.table(c6.body,{cols:[{label:"Entity",title:true,fmt:function(x){return PDC.fmt.trunc(x,46);}},
      {label:"Source"},{label:"Expected Fields",num:true,bar:true,fmt:PDC.fmt.n},
      {label:"Complete %",num:true,fmt:function(x){return x+"%";}}],
      rows:d.we.rows.map(function(r){return[r[ei],r[wi],+r[xe]||0,+r[pe]||0];})});
  }

  function load(){
    var ds=PDC.filterState.ds||"%",sens=PDC.filterState.sens||"%";
    PDC.resetCharts();PDC.el("content").innerHTML='<div class="loading">Loading…</div>';
    PDC.load({kpi:["kpi",{ds:ds,sens:sens}],cb:["completeness_band",{ds:ds,sens:sens}],prof:["profiled",{ds:ds,sens:sens}],
      ma:["missing_attrs",{ds:ds,sens:sens}],cbs:["completeness_by_source",{sens:sens}],qs:["quality_scatter",{sens:sens}],
      qr:["quality_race",{sens:sens}],we:["worst_entities",{ds:ds,sens:sens}]}).then(render).catch(function(e){PDC.fail();console.error(e);});
  }
  Promise.all([PDC.cda("datasources"),PDC.cda("sensitivities")]).then(function(res){
    var dsOpts=[{v:"%",t:"All sources"}].concat(res[0].rows.map(function(x){return{v:x[0],t:x[0]};}));
    var snOpts=[{v:"%",t:"All sensitivities"}].concat(res[1].rows.map(function(x){return{v:x[0],t:x[0]};}));
    PDC.filters([{id:"ds",label:"Data Source",options:dsOpts,def:"%"},{id:"sens",label:"Sensitivity",options:snOpts,def:"%"}],load);load();
  }).catch(function(){PDC.filters([{id:"ds",label:"Data Source",options:[{v:"%",t:"All sources"}]},{id:"sens",label:"Sensitivity",options:[{v:"%",t:"All sensitivities"}]}],load);load();});
})();
