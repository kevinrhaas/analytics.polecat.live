// Policy & Governance Coverage — governed vs ungoverned, policy assignments.
(function(){
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  function rows(res,a,b){var ia=res.col(a),ib=res.col(b);return res.rows.map(function(r){return{label:String(r[ia]),value:+r[ib]||0};});}
  function pivot(res,rk,ck,vk){var ri=res.col(rk),ci=res.col(ck),vi=res.col(vk);
    var R=[],C=[];res.rows.forEach(function(r){if(R.indexOf(String(r[ri]))<0)R.push(String(r[ri]));if(C.indexOf(String(r[ci]))<0)C.push(String(r[ci]));});
    var m=R.map(function(){return C.map(function(){return 0;});});
    res.rows.forEach(function(r){m[R.indexOf(String(r[ri]))][C.indexOf(String(r[ci]))]=+r[vi]||0;});
    return{rows:R,cols:C,matrix:m};}

  function render(d){
    var gov=+v(d.kpi,"governed_pct")||0;
    PDC.kpis(PDC.el("kpis"),[
      {value:PDC.fmt.pct(gov),label:"Governed",state:gov>=70?"good":gov>=40?"warn":"bad",info:"Share of catalog objects covered by at least one governance policy. The headline measure of how much of your estate is under control vs. unmanaged."},
      {value:PDC.fmt.abbr(v(d.kpi,"governed")),label:"Governed Assets",state:"good",info:"Count of objects with one or more policy assignments — the part of the estate with stewardship, classification, or access rules applied."},
      {value:PDC.fmt.abbr(v(d.kpi,"ungoverned")),label:"Ungoverned Assets",state:"bad",info:"Objects with no policy attached — the governance gap. These carry unmanaged risk and are the worklist for closing coverage."},
      {value:PDC.fmt.abbr(v(d.kpi,"assignments")),label:"Policy Assignments",state:"purple",info:"Total policy-to-object links in scope. One object can carry several policies, so this exceeds the governed-asset count and shows policy density."}
    ]);
    var content=PDC.el("content");content.innerHTML="";var g=PDC.grid(3);content.appendChild(g);
    var sens=PDC.filterState.sens||"%";
    // click a source's ungoverned bar → drawer of the ACTUAL ungoverned entities behind that gap
    var ungovDetail={da:"detail_ungov",param:"src",params:{sens:sens},noun:"ungoverned entities",
      title:function(src){return src+" — ungoverned entities";},
      subtitle:"every asset without governance coverage in this source"+(sens!=="%"?(" · "+sens):""),
      cols:[
        {key:"name",label:"Entity",title:true,fmt:function(x){return PDC.fmt.trunc(x,42);}},
        {key:"status",label:"Status",fmt:function(x){return PDC.fmt.trunc(x,22);}},
        {key:"sensitivity",label:"Sensitivity"},
        {key:"owner",label:"Owner",fmt:function(x){return PDC.fmt.trunc(x,22);}}],
      drill:{to:"pdc-compliance",param:"ds",label:"Open Compliance for this source"}};

    var c1=PDC.card("Governance Coverage",{pill:"status",src:"fact_entity_snapshot · cube 71",info:"Governed vs. ungoverned split of the whole estate at a glance. The faster this leans governed, the lower your unmanaged-data risk."});g.appendChild(c1.el);
    var gi=d.gs.col("status"),ga=d.gs.col("assets");
    PDC.donut(c1.body,{centerCap:"Assets",fmt:PDC.fmt.abbr,data:d.gs.rows.map(function(r){var s=String(r[gi]);
      var col=/^govern|covered|full|tagged|assigned/i.test(s)&&!/un|no /i.test(s)?PDC.cssvar("--good"):/ungovern|no term|missing|none/i.test(s)?PDC.cssvar("--bad"):PDC.cssvar("--warn");
      return{label:s,value:+r[ga]||0,color:col};})});

    var c2=PDC.card("Policy Assignments by Type",{pill:"assigns",src:"dim_policy · cube 73",info:"How assignments distribute across policy categories (privacy, retention, access…). Reveals which governance disciplines are mature vs. thinly applied."});g.appendChild(c2.el);
    var pi=d.pt.col("ptype"),pa=d.pt.col("assigns");
    PDC.donut(c2.body,{centerCap:"Assignments",fmt:PDC.fmt.abbr,data:d.pt.rows.map(function(r,i){return{label:String(r[pi]),value:+r[pa]||0,color:PDC.color(i+1)};})});

    var c3=PDC.card("Governed % by Data Source",{pill:"%",src:"fact_entity_snapshot · cube 71",info:"Coverage rate per connected source. Low-scoring sources are where governance lags — the priority targets for policy rollout."});g.appendChild(c3.el);
    PDC.bars(c3.body,{horizontal:true,labelW:150,fmt:function(x){return x+"%";},color:PDC.cssvar("--good"),data:rows(d.gbs,"src","gov_pct")});

    var c4=PDC.card("Ungoverned Assets by Source",{pill:"gap",src:"fact_entity_snapshot · cube 71",sub:"click → its ungoverned assets",info:"Absolute count of unmanaged objects per source — the size of the remediation backlog. Click a bar to see the actual ungoverned records behind it."});g.appendChild(c4.el);
    PDC.bars(c4.body,{horizontal:true,labelW:150,fmt:PDC.fmt.abbr,color:PDC.cssvar("--bad"),data:rows(d.ubs,"src","ungoverned"),detail:ungovDetail});

    var c5=PDC.card("Top Policies by Assignment",{pill:"policies",src:"fact_entity_policy · cube 73",span:2,info:"The most widely-applied policies by object count. Shows which rules do the heavy lifting and where governance effort is concentrated."});g.appendChild(c5.el);
    PDC.bars(c5.body,{horizontal:true,labelW:220,labelChars:38,color:PDC.cssvar("--pdc"),fmt:PDC.fmt.n,data:rows(d.tp,"policy","assigns")});

    // Governance × Sensitivity Risk Matrix — heat map of governed% per (source, sensitivity)
    var ch=PDC.card("Governance × Sensitivity Risk Matrix",{pill:"% governed · red=gap · green=covered",src:"fact_entity_snapshot · cube 71",span:3,info:"Each cell is the % of assets in that data source × sensitivity tier that have governance coverage. Red = sensitive data with poor governance (highest risk); green = well-covered. Target: every Restricted / Confidential cell should be dark green."});g.appendChild(ch.el);
    var hmPiv=pivot(d.hm,"src","sens","gov_pct");
    var hmSrc=d.hm.col("src"),hmSens=d.hm.col("sens"),hmTot=d.hm.col("total");
    function govHeatFill(v){
      if(v<=0)return PDC.cssvar("--panel-subtle-bg");
      if(v>=85)return "color-mix(in srgb,"+PDC.cssvar("--good")+" 72%, transparent)";
      if(v>=60)return "color-mix(in srgb,"+PDC.cssvar("--warn")+" "+(30+v*0.4).toFixed(0)+"%, transparent)";
      return "color-mix(in srgb,"+PDC.cssvar("--bad")+" "+(20+(100-v)*0.55).toFixed(0)+"%, transparent)";}
    PDC.heatmap(ch.body,{rows:hmPiv.rows,cols:hmPiv.cols,matrix:hmPiv.matrix,
      height:Math.max(180,hmPiv.rows.length*34+64),fmt:function(x){return Math.round(x)+"%";},
      showVals:true,labelW:120,cellFill:function(v){return govHeatFill(v);},
      cellTip:function(rn,cn,v){
        var tot=0;d.hm.rows.forEach(function(r){if(String(r[hmSrc])===rn&&String(r[hmSens])===cn)tot=+r[hmTot]||0;});
        var risk=v>=85?"Low risk":v>=60?"Moderate risk":"High risk ⚠";
        return "<b>"+rn+"</b> · <b>"+cn+"</b><br>Governed: "+Math.round(v)+"%"+(tot?" ("+PDC.fmt.n(tot)+" assets)":"")+"<br><i>"+risk+"</i>";}});

    // Policy Coverage Map — which policies blanket which data sources (chord interconnect)
    var cp=PDC.card("Policy Coverage Map",{pill:"policy ↔ source · hover to isolate",src:"fact_entity_policy · dim_policy · dim_datasource · cube 73",span:3,info:"Which policies reach which sources, as an interconnect. Gaps in the map are sources a given policy doesn't yet touch — hover a node to isolate its links."});g.appendChild(cp.el);
    var ppi=d.pn.col("policy"),psi=d.pn.col("src"),pai=d.pn.col("assigns");
    var plinks=d.pn.rows.map(function(r){return{source:String(r[ppi]),target:String(r[psi]),value:+r[pai]||0};});
    PDC.chord(cp.body,{links:plinks,height:430,fmt:PDC.fmt.n,unit:"assignments"});

    // Coverage over time — governed % and metadata completeness % by scan month
    var c6=PDC.card("Governance Coverage Over Time",{pill:"% by month",src:"fact_entity_snapshot · dim_date · cube 71",span:3,info:"Governed-coverage trend by month. A rising line proves the governance program is closing the gap; a flat line means new data is outpacing policy."});g.appendChild(c6.el);
    PDC.line(c6.body,{fmt:function(x){return x+"%";},labels:d.tr.rows.map(function(r){return r[d.tr.col("month")];}),
      series:[{name:"Governed %",values:d.tr.rows.map(function(r){return +r[d.tr.col("governed_pct")]||0;}),color:PDC.cssvar("--good")},
              {name:"Metadata Complete %",values:d.tr.rows.map(function(r){return +r[d.tr.col("complete_pct")]||0;}),color:PDC.cssvar("--pdc")}]});

    // Sensitivity → Governance State Flow — animated Sankey ribbon showing entity count from sensitivity tier to governance state
    var c7=PDC.card("Sensitivity → Governance State Flow",{span:3,pill:"entity count",src:"fact_entity_snapshot · dim_entity · cube 71",info:"Animated ribbons show how entities at each sensitivity tier split between Governed and Ungoverned states — ribbon width = entity count. Large flows into Ungoverned (especially at Restricted or Confidential) reveal the highest-priority governance remediation targets. Filters by Data Source."});g.appendChild(c7.el);
    var gsi0=d.gsf.col("sens_tier"),gsi1=d.gsf.col("gov_state"),gsi2=d.gsf.col("cnt");
    var gsfLinks=d.gsf.rows.map(function(r){return{source:String(r[gsi0]),target:String(r[gsi1]),value:+r[gsi2]||0};});
    function sensTierColor(k){
      return /ungoverned/i.test(k)?PDC.cssvar("--bad"):
             /^governed$/i.test(k)?PDC.cssvar("--good"):
             /restrict|high|pii/i.test(k)?PDC.cssvar("--sev3")||"#c0392b":
             /confiden|medium/i.test(k)?PDC.cssvar("--sev2")||"#e67e22":
             /internal|low/i.test(k)?PDC.cssvar("--info")||"#2e8bd0":
             PDC.cssvar("--text-faint")||"#8e9eb0";
    }
    PDC.sankey(c7.body,{links:gsfLinks,height:280,fmt:PDC.fmt.n,srcCap:"Sensitivity Tier",dstCap:"Governance State",color:sensTierColor});
  }

  function load(){
    var ds=PDC.filterState.ds||"%",sens=PDC.filterState.sens||"%";
    PDC.resetCharts();PDC.el("content").innerHTML='<div class="loading">Loading…</div>';
    // policy-catalog panels (tp, pt) are global; everything else is entity-snapshot grain and respects both filters
    PDC.load({kpi:["kpi",{ds:ds,sens:sens}],gs:["gov_status",{ds:ds,sens:sens}],gbs:["gov_by_source",{sens:sens}],ubs:["ungov_by_source",{sens:sens}],
      tp:["top_policies"],pt:["policy_type"],pn:["policy_network",{ds:ds,sens:sens}],tr:["trend",{ds:ds,sens:sens}],hm:["gov_sens_heatmap"],
      gsf:["gov_sens_flow",{ds:ds}]}).then(render).catch(function(e){PDC.fail();console.error(e);});
  }
  Promise.all([PDC.cda("datasources"),PDC.cda("sensitivities")]).then(function(res){
    var dsOpts=[{v:"%",t:"All sources"}].concat(res[0].rows.map(function(x){return{v:x[0],t:x[0]};}));
    var snOpts=[{v:"%",t:"All sensitivities"}].concat(res[1].rows.map(function(x){return{v:x[0],t:x[0]};}));
    PDC.filters([{id:"ds",label:"Data Source",options:dsOpts,def:"%"},{id:"sens",label:"Sensitivity",options:snOpts,def:"%"}],load);load();
  }).catch(function(){PDC.filters([{id:"ds",label:"Data Source",options:[{v:"%",t:"All sources"}]},{id:"sens",label:"Sensitivity",options:[{v:"%",t:"All sensitivities"}]}],load);load();});
})();
