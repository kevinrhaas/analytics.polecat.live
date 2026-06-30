// Ownership & Stewardship Gaps.
(function(){
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  function rows(res,a,b){var ia=res.col(a),ib=res.col(b);return res.rows.map(function(r){return{label:String(r[ia]),value:+r[ib]||0};});}
  function render(d){
    var owned=+v(d.kpi,"owned_pct")||0;
    PDC.kpis(PDC.el("kpis"),[
      {value:PDC.fmt.pct(owned),label:"Assets with Owner",state:owned>=70?"good":owned>=40?"warn":"bad",info:"Share of objects with a named owner/steward. Ownership is the foundation of accountability — high coverage means someone is answerable for each asset's quality and access."},
      {value:PDC.fmt.abbr(v(d.kpi,"missing_owner")),label:"Unowned Assets",state:"bad",info:"Objects with nobody assigned. Unowned data drifts — no one curates it, approves access, or fixes its quality. This is the core remediation backlog."},
      {value:PDC.fmt.abbr(v(d.kpi,"assets")),label:"Total Assets",state:"purple",info:"All catalog objects in scope — the denominator for the ownership coverage rate."},
      {value:PDC.fmt.abbr(v(d.kpi,"ungoverned")),label:"Ungoverned",state:"warn",info:"Objects with no governance policy. Overlaps heavily with unowned data — assets that are both unowned and ungoverned are the highest-risk subset."}
    ]);
    var content=PDC.el("content");content.innerHTML="";var g=PDC.grid(3);content.appendChild(g);
    var c1=PDC.card("Owned vs Unowned",{pill:"assets",src:"fact_entity_snapshot · cube 71",info:"The estate-wide accountability split at a glance. The larger the unowned slice, the more data has no responsible steward."});g.appendChild(c1.el);
    PDC.donut(c1.body,{centerCap:"Assets",fmt:PDC.fmt.abbr,data:rows(d.ow,"label","assets").map(function(x){x.color=/^owned/i.test(x.label)?PDC.cssvar("--good"):PDC.cssvar("--bad");return x;})});
    var ds=PDC.filterState.ds||"%",sens=PDC.filterState.sens||"%";
    // click a source's unowned bar → drawer of the ACTUAL unowned entities (the accountability gap)
    var unownedDetail={da:"detail_unowned",param:"src",params:{sens:sens},noun:"unowned entities",
      title:function(src){return src+" — unowned entities";},
      subtitle:"every asset without an assigned owner in this source"+(sens!=="%"?(" · "+sens):""),
      cols:[
        {key:"name",label:"Entity",title:true,fmt:function(x){return PDC.fmt.trunc(x,42);}},
        {key:"group_name",label:"Group",fmt:function(x){return PDC.fmt.trunc(x,18);}},
        {key:"governance",label:"Governance",fmt:function(x){return PDC.fmt.trunc(x,18);}},
        {key:"sensitivity",label:"Sensitivity"}],
      drill:{to:"pdc-governance",param:"ds",label:"Open Governance for this source"}};
    var c2=PDC.card("Unowned Assets by Source",{pill:"gap",src:"fact_entity_snapshot · cube 71",sub:"click → its unowned assets",info:"Where the accountability gap concentrates by source. Tackle the tallest bars first for the biggest coverage gain. Click a bar for the actual unowned records."});g.appendChild(c2.el);
    PDC.bars(c2.body,{horizontal:true,labelW:150,fmt:PDC.fmt.abbr,color:PDC.cssvar("--bad"),data:rows(d.ms,"src","missing"),detail:unownedDetail});
    var c3=PDC.card("Named Owners (where assigned)",{pill:"owners",src:"dim_entity.owner_name · cube 71",info:"Who holds the most assets where ownership IS set. Heavy concentration on a few names is a bus-factor/overload risk; it also shows who to engage for bulk re-assignment."});g.appendChild(c3.el);
    if(d.to.rows.length) PDC.bars(c3.body,{horizontal:true,labelW:170,labelChars:26,color:PDC.cssvar("--pentaho"),fmt:PDC.fmt.n,data:rows(d.to,"owner","assets")});
    else c3.body.innerHTML='<div class="empty">No named owners in the catalog — 100% stewardship gap.</div>';
    var c4=PDC.card("Stewardship Scorecard by Source",{pill:"by source",src:"fact_entity_snapshot · cube 71",span:3,info:"Per-source report card combining asset count, owned %, and governed % — one row to see which sources are well-stewarded and which need attention."});g.appendChild(c4.el);
    var si=d.sc.col("src"),ai=d.sc.col("assets"),oi=d.sc.col("owned_pct"),gi=d.sc.col("gov_pct");
    PDC.table(c4.body,{cols:[{label:"Data Source",title:true},{label:"Assets",num:true,bar:true,fmt:PDC.fmt.n},
      {label:"Owned",num:true,fmt:function(x){return PDC.fmt.pct(x);}},
      {label:"Governed",num:true,fmt:function(x){return PDC.fmt.pct(x);}}],
      rows:d.sc.rows.map(function(r){return[r[si],+r[ai]||0,r[oi],r[gi]];})});

    // Stewardship Coverage Trend — owned_pct + gov_pct month-by-month
    var cOt=PDC.card("Stewardship Coverage Over Time",{span:3,pill:"% · monthly",src:"fact_entity_snapshot · dim_date",info:"Monthly ownership rate (assets with a named steward) and governance coverage % — the two stewardship KPIs tracked month by month. A widening gap between the two lines signals governance is outpacing ownership assignment (or vice versa). Data Source filter scopes both lines."});g.appendChild(cOt.el);
    var otLabels=d.ot.rows.map(function(r){return String(r[d.ot.col("month")]);});
    PDC.line(cOt.body,{area:false,fmt:function(v){return v+"%";},labels:otLabels,series:[
      {name:"Owned %",values:d.ot.rows.map(function(r){return +r[d.ot.col("owned_pct")]||0;}),color:PDC.cssvar("--pdc")},
      {name:"Governed %",values:d.ot.rows.map(function(r){return +r[d.ot.col("gov_pct")]||0;}),color:PDC.cssvar("--good")}
    ]});

    // Stewardship Risk Matrix — ownership rate per (source, sensitivity) cell
    var cm=PDC.card("Stewardship Risk Matrix",{pill:"owned % · red=gap · green=covered",src:"fact_entity_snapshot · cube 71",span:3,
      info:"Each cell is the % of assets in that source × sensitivity tier with an assigned owner. Red = sensitive data with no steward (highest accountability risk); green = well-covered. Target: every Restricted / Confidential cell should be dark green."});g.appendChild(cm.el);
    function omPivot(res){var si2=res.col("src"),ei=res.col("sensitivity"),vi=res.col("owned_pct");
      var R=[],C=[];res.rows.forEach(function(r){if(R.indexOf(String(r[si2]))<0)R.push(String(r[si2]));if(C.indexOf(String(r[ei]))<0)C.push(String(r[ei]));});
      var sensOrd=['HIGH','MEDIUM','LOW','Unclassified'];
      C.sort(function(a,b){var ai=sensOrd.indexOf(a),bi=sensOrd.indexOf(b);return(ai<0?99:ai)-(bi<0?99:bi);});
      var m=R.map(function(){return C.map(function(){return 0;});});
      res.rows.forEach(function(r){var ri=R.indexOf(String(r[si2])),ci=C.indexOf(String(r[ei]));if(ri>=0&&ci>=0)m[ri][ci]=+r[vi]||0;});
      return{rows:R,cols:C,matrix:m};}
    var omPiv=omPivot(d.om);
    var omSrcI=d.om.col("src"),omSensI=d.om.col("sensitivity"),omTotI=d.om.col("total");
    function omFill(v){
      if(v<=0)return PDC.cssvar("--panel-subtle-bg");
      if(v>=85)return "color-mix(in srgb,"+PDC.cssvar("--good")+" 72%, transparent)";
      if(v>=60)return "color-mix(in srgb,"+PDC.cssvar("--warn")+" "+(30+v*0.4).toFixed(0)+"%, transparent)";
      return "color-mix(in srgb,"+PDC.cssvar("--bad")+" "+(20+(100-v)*0.55).toFixed(0)+"%, transparent)";}
    PDC.heatmap(cm.body,{rows:omPiv.rows,cols:omPiv.cols,matrix:omPiv.matrix,
      height:Math.max(180,omPiv.rows.length*34+64),fmt:function(x){return Math.round(x)+"%";},
      showVals:true,labelW:120,cellFill:omFill,
      cellTip:function(rn,cn,v){
        var tot=0;d.om.rows.forEach(function(r){if(String(r[omSrcI])===rn&&String(r[omSensI])===cn)tot=+r[omTotI]||0;});
        var risk=v>=85?"Well stewarded":v>=60?"Partial coverage":"Stewardship gap ⚠";
        return "<b>"+rn+"</b> · <b>"+cn+"</b><br>Owned: "+Math.round(v)+"%"+(tot?" ("+PDC.fmt.n(tot)+" assets)":"")+"<br><i>"+risk+"</i>";}});
  }
  function load(){var ds=PDC.filterState.ds||"%",sens=PDC.filterState.sens||"%";PDC.resetCharts();PDC.el("content").innerHTML='<div class="loading">Loading…</div>';
    PDC.load({kpi:["kpi",{ds:ds,sens:sens}],ow:["owned",{ds:ds,sens:sens}],to:["top_owners",{sens:sens}],ms:["missing_by_source",{sens:sens}],sc:["scorecard",{sens:sens}],om:["ownership_sens_matrix"],ot:["ownership_trend",{ds:ds}]}).then(render).catch(function(e){PDC.fail();console.error(e);});}
  Promise.all([PDC.cda("datasources"),PDC.cda("sensitivities")]).then(function(res){
    var dsOpts=[{v:"%",t:"All sources"}].concat(res[0].rows.map(function(x){return{v:x[0],t:x[0]};}));
    var snOpts=[{v:"%",t:"All sensitivities"}].concat(res[1].rows.map(function(x){return{v:x[0],t:x[0]};}));
    PDC.filters([{id:"ds",label:"Data Source",options:dsOpts,def:"%"},{id:"sens",label:"Sensitivity",options:snOpts,def:"%"}],load);load();
  }).catch(function(){PDC.filters([{id:"ds",label:"Data Source",options:[{v:"%",t:"All sources"}]},{id:"sens",label:"Sensitivity",options:[{v:"%",t:"All sensitivities"}]}],load);load();});
})();
