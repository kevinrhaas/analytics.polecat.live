// Data Freshness & Staleness Observatory — recency, access age, temperature.
(function(){
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  function rows(res,a,b){var ia=res.col(a),ib=res.col(b);return res.rows.map(function(r){return{label:String(r[ia]),value:+r[ib]||0};});}
  function cols(res,a){var i=res.col(a);return res.rows.map(function(r){return String(r[i]);});}
  function vals(res,a){var i=res.col(a);return res.rows.map(function(r){return +r[i]||0;});}
  function tempColor(t){return /frozen/i.test(t)?PDC.cssvar("--c9"):/cold/i.test(t)?PDC.cssvar("--info"):/warm/i.test(t)?PDC.cssvar("--warn"):/hot/i.test(t)?PDC.cssvar("--bad"):PDC.cssvar("--text-faint");}
  function freshColor(b){return /stale/i.test(b)?PDC.cssvar("--bad"):/aging/i.test(b)?PDC.cssvar("--warn"):/recent/i.test(b)?PDC.cssvar("--c3"):/current/i.test(b)?PDC.cssvar("--good"):PDC.cssvar("--text-faint");}

  // pivot long-form (src × band × n) into matrix + row totals
  function pivotFsm(res){
    var si=res.col("src"),bi=res.col("band"),ni=res.col("n"),R=[],C=[];
    res.rows.forEach(function(r){if(R.indexOf(String(r[si]))<0)R.push(String(r[si]));if(C.indexOf(String(r[bi]))<0)C.push(String(r[bi]));});
    var m=R.map(function(){return C.map(function(){return 0;});});
    res.rows.forEach(function(r){m[R.indexOf(String(r[si]))][C.indexOf(String(r[bi]))]=+r[ni]||0;});
    var totals=m.map(function(row){return row.reduce(function(s,x){return s+x;},0);});
    return{rows:R,cols:C,matrix:m,totals:totals};
  }
  function fsmFill(band,pct){
    if(pct<=0)return 'var(--panel-subtle-bg)';
    if(/stale/i.test(band)){
      if(pct>0.5)return 'rgba(192,57,43,0.90)';
      if(pct>0.2)return 'rgba(192,57,43,0.50)';
      return 'rgba(192,57,43,0.20)';
    }
    if(/aging/i.test(band)){
      if(pct>0.4)return 'rgba(230,126,34,0.90)';
      if(pct>0.15)return 'rgba(230,126,34,0.50)';
      return 'rgba(230,126,34,0.20)';
    }
    // current / fresh / recent
    if(pct>0.5)return 'rgba(22,160,133,0.90)';
    if(pct>0.2)return 'rgba(22,160,133,0.50)';
    return 'rgba(22,160,133,0.20)';
  }
  function render(d){
    var stale=+v(d.kpi,"stale_pct")||0;
    PDC.kpis(PDC.el("kpis"),[
      {value:PDC.fmt.abbr(v(d.kpi,"assets")),label:"Assets",state:"purple",info:"Catalog objects in scope — the population behind every freshness and temperature measure on this board."},
      {value:PDC.fmt.pct(stale),label:"Stale (scan 90d+)",state:stale<20?"good":stale<50?"warn":"bad",info:"Share of objects the catalog scanner hasn't re-examined in 90+ days. Stale scans mean the metadata you're trusting may be out of date."},
      {value:(v(d.kpi,"avg_access_age")||0)+" mo",label:"Avg Access Age",info:"Average months since objects were last accessed. High values signal data nobody is using — a candidate for archival or tiering."},
      {value:PDC.fmt.abbr(v(d.kpi,"cold_assets")),label:"Cold Assets (24mo+)",state:"warn",info:"Objects untouched for 24+ months. Cold data still costs full price to store — the prime target for cheaper tiers or deletion."}
    ]);
    var content=PDC.el("content");content.innerHTML="";var g=PDC.grid(3);content.appendChild(g);

    var cc=PDC.card("Catalog Scan Activity",{pill:"assets scanned / day",src:"fact_entity_snapshot · dim_date · cube 71",span:3,info:"Daily volume of objects the catalog scanner processed. Gaps or a falling trend mean scanning is falling behind — and metadata is drifting stale."});g.appendChild(cc.el);
    var sdi=d.cal.col("day"),sai=d.cal.col("assets"),sgi=d.cal.col("governed");
    PDC.calendar(cc.body,{unit:"assets scanned",
      days:d.cal.rows.map(function(r){return{date:String(r[sdi]),value:+r[sai]||0,governed:+r[sgi]||0};}),
      tip2:function(rec){return PDC.fmt.n(rec.governed)+" governed";}});

    var ds=PDC.filterState.ds||"%",sens=PDC.filterState.sens||"%";
    // click a scan-freshness band → drawer of the ACTUAL entities in that band (stale-bucket → entities)
    var freshDetail={da:"detail_by_freshband",param:"band",params:{ds:ds,sens:sens},noun:"entities",
      title:function(band){return band+" — entities";},
      subtitle:"every asset in this scan-freshness band"+(ds!=="%"?(" · "+ds):"")+(sens!=="%"?(" · "+sens):""),
      cols:[
        {key:"name",label:"Entity",title:true,fmt:function(x){return PDC.fmt.trunc(x,40);}},
        {key:"src",label:"Source",fmt:function(x){return PDC.fmt.trunc(x,16);}},
        {key:"access_age",label:"Access Age",fmt:function(x){return PDC.fmt.trunc(x,18);}},
        {key:"sensitivity",label:"Sensitivity"},
        {key:"owner",label:"Owner",fmt:function(x){return PDC.fmt.trunc(x,18);}}],
      drill:{to:"pdc-storage",param:"ds",label:"Open Storage for this source"}};
    var c1=PDC.card("Scan Freshness",{pill:"recency",src:"fact_entity_snapshot.scan_freshness_band · cube 71",sub:"click a bar → its entities",info:"Objects bucketed by how recently they were scanned (Fresh → Stale). A heavy stale tail erodes trust in the catalog. Click a bar for the actual entities."});g.appendChild(c1.el);
    var fb=rows(d.sf,"band","assets");fb.forEach(function(x){x.color=freshColor(x.label);});
    PDC.bars(c1.body,{horizontal:true,labelW:150,fmt:PDC.fmt.abbr,data:fb,detail:freshDetail});

    var c2=PDC.card("Data Temperature",{pill:"files",src:"fact_temperature_daily · cube 78",info:"Classifies data as hot/warm/cold/frozen by access activity. The hot↔frozen mix tells you how much storage could move to cheaper tiers."});g.appendChild(c2.el);
    var ti=d.temp.col("temp"),tv=d.temp.col("files");
    PDC.donut(c2.body,{centerCap:"Files",fmt:PDC.fmt.abbr,data:d.temp.rows.map(function(r){return{label:String(r[ti]),value:+r[tv]||0,color:tempColor(String(r[ti]))};})});

    var c3=PDC.card("Modified Age",{pill:"assets",src:"fact_entity_snapshot.modified_age_band · cube 71",info:"Objects bucketed by how long since their data last changed. Long-unmodified data is stable (or abandoned); recently-modified data needs fresher governance."});g.appendChild(c3.el);
    PDC.bars(c3.body,{horizontal:true,labelW:150,fmt:PDC.fmt.abbr,color:PDC.cssvar("--pdc"),data:rows(d.ma,"band","assets")});

    var c4=PDC.card("Stale & Aging by Data Source",{pill:"% · click to drill",src:"fact_entity_snapshot · cube 71",info:"Stale-scan rate per source. High-scoring sources are where the catalog's view is most outdated — prioritize them for a re-scan. Click a bar to open that source's Storage."});g.appendChild(c4.el);
    PDC.bars(c4.body,{horizontal:true,labelW:150,fmt:function(x){return x+"%";},color:PDC.cssvar("--warn"),drill:{to:"pdc-storage",param:"ds"},data:rows(d.sbs,"src","stale_pct")});

    var c5=PDC.card("Temperature Trend (cold vs hot/warm)",{pill:"trend",src:"fact_temperature_daily · cube 78",span:2,info:"How the hot/warm vs. cold split shifts over time. A growing cold share means more of your estate is going dormant — rising tiering opportunity."});g.appendChild(c5.el);
    PDC.line(c5.body,{labels:cols(d.tt,"month"),area:false,fmt:PDC.fmt.abbr,series:[
      {name:"Cold/Frozen",values:vals(d.tt,"cold"),color:PDC.cssvar("--info")},
      {name:"Hot/Warm",values:vals(d.tt,"hotwarm"),color:PDC.cssvar("--bad")}]});

    var c6=PDC.card("Access Recency",{pill:"assets",src:"fact_entity_snapshot.accessed_age_band · cube 71",info:"Objects bucketed by time since last access. The long-idle bands are unused data still consuming storage — your archival shortlist."});g.appendChild(c6.el);
    PDC.bars(c6.body,{horizontal:true,labelW:150,fmt:PDC.fmt.abbr,data:rows(d.aa,"band","assets")});

    // Freshness Profile by Source — heatmap of freshness band distribution per data source
    var ch=PDC.card("Freshness Profile by Source",{pill:"band × source heatmap",src:"fact_entity_snapshot · scan_freshness_band · cube 71",span:3,
      info:"How freshness bands distribute across each data source: green=well-scanned, orange=aging, red=stale. Shows which sources are consistently maintained vs. falling behind on re-scans. Sensitivity filter scopes the profile."});g.appendChild(ch.el);
    var fpiv=pivotFsm(d.fsm);
    PDC.heatmap(ch.body,{rows:fpiv.rows,cols:fpiv.cols,matrix:fpiv.matrix,
      height:Math.max(160,fpiv.rows.length*32+60),labelW:120,showVals:true,
      fmt:PDC.fmt.abbr,
      cellFill:function(v,max,ri,ci){
        var pct=fpiv.totals[ri]>0?v/fpiv.totals[ri]:0;
        return fsmFill(fpiv.cols[ci],pct);
      },
      cellTip:function(rn,cn,v,ri){
        var tot=fpiv.totals[ri];
        var pct=tot>0?Math.round(v*100/tot):0;
        return "<b>"+rn+"</b> · <b>"+cn+"</b><br>"+PDC.fmt.abbr(v)+" assets ("+pct+"% of source)";
      }
    });
  }

  function load(){
    var ds=PDC.filterState.ds||"%",sens=PDC.filterState.sens||"%";
    PDC.resetCharts();PDC.el("content").innerHTML='<div class="loading">Loading…</div>';
    // temperature panels (temp, tt) are fact_temperature_daily grain (no per-entity sensitivity) → stay global; snapshot-grain panels respect both filters
    PDC.load({kpi:["kpi",{ds:ds,sens:sens}],cal:["scan_calendar",{ds:ds,sens:sens}],sf:["scan_fresh",{ds:ds,sens:sens}],aa:["accessed_age",{ds:ds,sens:sens}],ma:["modified_age",{ds:ds,sens:sens}],
      temp:["temperature"],sbs:["stale_by_source",{sens:sens}],tt:["temp_trend"],fsm:["fresh_source_matrix",{sens:sens}]}).then(render).catch(function(e){PDC.fail();console.error(e);});
  }
  Promise.all([PDC.cda("datasources"),PDC.cda("sensitivities")]).then(function(res){
    var dsOpts=[{v:"%",t:"All sources"}].concat(res[0].rows.map(function(x){return{v:x[0],t:x[0]};}));
    var snOpts=[{v:"%",t:"All sensitivities"}].concat(res[1].rows.map(function(x){return{v:x[0],t:x[0]};}));
    PDC.filters([{id:"ds",label:"Data Source",options:dsOpts,def:"%"},{id:"sens",label:"Sensitivity",options:snOpts,def:"%"}],load);load();
  }).catch(function(){PDC.filters([{id:"ds",label:"Data Source",options:[{v:"%",t:"All sources"}]},{id:"sens",label:"Sensitivity",options:[{v:"%",t:"All sensitivities"}]}],load);load();});
})();
