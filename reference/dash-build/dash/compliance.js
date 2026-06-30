// Sensitive Data & Compliance Radar — sensitive movement + catalog sensitivity.
(function(){
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  function rows(res,a,b){var ia=res.col(a),ib=res.col(b);return res.rows.map(function(r){return{label:String(r[ia]),value:+r[ib]||0};});}
  function cols(res,a){var i=res.col(a);return res.rows.map(function(r){return String(r[i]);});}
  function vals(res,a){var i=res.col(a);return res.rows.map(function(r){return +r[i]||0;});}
  function sevColor(s){return /high|restrict|pii|pci|phi/i.test(s)?PDC.cssvar("--sev3"):/medium|confiden/i.test(s)?PDC.cssvar("--sev2"):/low|internal/i.test(s)?PDC.cssvar("--info"):PDC.cssvar("--text-faint");}
  function pivot(res,rk,ck,vk){var ri=res.col(rk),ci=res.col(ck),vi=res.col(vk);
    var R=[],C=[];res.rows.forEach(function(r){if(R.indexOf(String(r[ri]))<0)R.push(String(r[ri]));if(C.indexOf(String(r[ci]))<0)C.push(String(r[ci]));});
    var m=R.map(function(){return C.map(function(){return 0;});});
    res.rows.forEach(function(r){m[R.indexOf(String(r[ri]))][C.indexOf(String(r[ci]))]=+r[vi]||0;});
    return {rows:R,cols:C,matrix:m};}

  function render(d){
    PDC.kpis(PDC.el("kpis"),[
      {value:PDC.fmt.n(v(d.kpi,"restricted_ungov")),label:"Restricted → Ungoverned",state:(+v(d.kpi,"restricted_ungov")>0?"bad":"good"),info:"Data flows carrying Restricted data into an ungoverned destination — the single highest compliance exposure. Any non-zero value is an audit finding waiting to happen."},
      {value:PDC.fmt.abbr(v(d.kpi,"sensitive_conns")),label:"Sensitive Flows",state:"warn",info:"Count of data movements that carry sensitive (HIGH/MEDIUM) data. The more sensitive data is in motion, the larger your attack and leakage surface."},
      {value:PDC.fmt.abbr(v(d.kpi,"cross_boundary")),label:"Cross-Boundary Flows",state:"warn",info:"Flows that cross a trust boundary (e.g. between data-source categories or governance domains). These are where data-residency and policy rules are most at risk."},
      {value:PDC.fmt.abbr(v(d.kpi,"sensitive_assets")),label:"High/Med Sensitive Assets",state:"purple",info:"Objects classified HIGH or MEDIUM sensitivity — the regulated/PII population that compliance controls must cover."}
    ]);
    var content=PDC.el("content");content.innerHTML="";var g=PDC.grid(3);content.appendChild(g);

    // Hero: Sankey of sensitive data flow — which sensitivity levels move into (un)governed destinations
    var c1=PDC.card("Source Sensitivity → Destination Governance",{pill:"flow · connections",src:"fact_lineage_connection · cube 80",span:3,info:"Flow diagram of where sensitive data moves: each ribbon links a source-sensitivity level (Internal/Confidential/Restricted) to its destination's governance state, sized by connection count. Restricted→Ungoverned ribbons are your top compliance risk."});g.appendChild(c1.el);
    var fmS=d.fm.col("src_sens"),fmD=d.fm.col("dest_gov"),fmC=d.fm.col("conns");
    var slinks=d.fm.rows.map(function(r){return{source:String(r[fmS]),target:String(r[fmD]),value:+r[fmC]||0};});
    function govColor(k){return /ungoverned/i.test(k)?PDC.cssvar("--bad"):/governed/i.test(k)?PDC.cssvar("--good"):sevColor(k);}
    PDC.sankey(c1.body,{links:slinks,height:300,fmt:PDC.fmt.n,srcCap:"Source sensitivity",dstCap:"Destination governance",color:govColor});

    // click a sensitivity slice → drawer of the ACTUAL entities of that sensitivity (one row per asset)
    var sensDetail={da:"detail_by_sensitivity",param:"sens",noun:"entities",
      title:function(s){return s+" — entities";},
      subtitle:"every catalog asset at this sensitivity level",
      cols:[
        {key:"name",label:"Entity",title:true,fmt:function(x){return PDC.fmt.trunc(x,40);}},
        {key:"src",label:"Source",fmt:function(x){return PDC.fmt.trunc(x,16);}},
        {key:"sensitivity",label:"Sensitivity"},
        {key:"governance",label:"Governance",fmt:function(x){return PDC.fmt.trunc(x,20);}},
        {key:"owner",label:"Owner",fmt:function(x){return PDC.fmt.trunc(x,18);}}],
      drill:{to:"pdc-governance",param:"sens",label:"Open Governance at this sensitivity"}};
    var c2=PDC.card("Catalog Sensitivity Mix",{pill:"assets",src:"dim_entity.sensitivity · cube 71",sub:"click a slice → its entities",info:"How the estate splits across sensitivity tiers. A large HIGH/MEDIUM share means more data demands strict controls. Click a slice for the actual entities."});g.appendChild(c2.el);
    var mi=d.sm.col("sens"),ma=d.sm.col("assets");
    PDC.donut(c2.body,{centerCap:"Assets",fmt:PDC.fmt.abbr,detail:sensDetail,data:d.sm.rows.map(function(r){return{label:String(r[mi]),value:+r[ma]||0,color:sevColor(String(r[mi]))};})});

    var c3=PDC.card("Bytes Moved by Destination Sensitivity",{pill:"GB",src:"fact_lineage_connection · cube 80",info:"Volume of data (GB) landing at each destination-sensitivity level. Large volumes flowing into low-sensitivity targets can signal under-classification or leakage."});g.appendChild(c3.el);
    var bb=rows(d.bd,"sens","gb");bb.forEach(function(x){x.color=sevColor(x.label);});
    PDC.bars(c3.body,{horizontal:true,labelW:120,fmt:function(x){return PDC.fmt.gb(x);},data:bb});

    // click a source → drawer of the ACTUAL restricted→ungoverned connections (the audit findings)
    var restrictedDetail={da:"detail_restricted_flows",param:"src",noun:"restricted → ungoverned flows",
      title:function(src){return src+" — restricted → ungoverned flows";},
      subtitle:"every Restricted-source connection landing in an ungoverned destination",
      cols:[
        {key:"flow",label:"Source → Destination",title:true,fmt:function(x){return PDC.fmt.trunc(x,48);}},
        {key:"dest_sens",label:"Dest Sensitivity"},
        {key:"governance",label:"Destination"},
        {key:"records",label:"Records",num:true,fmt:function(x){return (+x||0).toLocaleString();}},
        {key:"gb",label:"GB",num:true,fmt:function(x){return (+x||0).toLocaleString();}}],
      drill:{to:"pdc-governance",param:"sens",label:"Open Governance"}};
    var c4=PDC.card("Restricted → Ungoverned by Source",{pill:"risk · click → flows",src:"fact_lineage_connection · cube 80",span:2,info:"Which sources originate the riskiest flows — Restricted data heading somewhere ungoverned. Ranks where to apply policy or block movement first. Click a bar to see the actual offending connections."});g.appendChild(c4.el);
    PDC.bars(c4.body,{horizontal:true,labelW:200,labelChars:34,color:PDC.cssvar("--bad"),fmt:PDC.fmt.n,detail:restrictedDetail,data:rows(d.rbs,"src","flows")});

    var c5=PDC.card("Sensitive & Cross-Boundary Movement by Month",{pill:"trend",src:"fact_lineage_connection · cube 80",info:"Trend of sensitive and boundary-crossing flows over time. A rising line means exposure is growing faster than controls — the signal to tighten policy."});g.appendChild(c5.el);
    PDC.line(c5.body,{labels:cols(d.ct,"month"),area:false,fmt:PDC.fmt.abbr,series:[
      {name:"Cross-Boundary",values:vals(d.ct,"cross_boundary"),color:PDC.cssvar("--warn")},
      {name:"Sensitive",values:vals(d.ct,"sensitive"),color:PDC.cssvar("--bad")}]});

    // New: Source → Destination Sensitivity Flow (animated Sankey ribbon)
    var c6=PDC.card("Source → Destination Sensitivity Flow",{span:3,pill:"GB moved",src:"fact_lineage_connection · source_sensitivity → dest_sensitivity",info:"Animated ribbons show how data moves between sensitivity classifications — width = GB transferred. Restricted data flowing into lower-sensitivity destinations signals classification drift or policy gaps requiring immediate review."});g.appendChild(c6.el);
    var si0=d.stf.col("src_sens"),si1=d.stf.col("dst_sens"),si3=d.stf.col("gb");
    var stfLinks=d.stf.rows.map(function(r){return{source:String(r[si0]),target:String(r[si1]),value:+r[si3]||0};});
    PDC.sankey(c6.body,{links:stfLinks,height:280,fmt:function(x){return PDC.fmt.gb(x);},srcCap:"Source sensitivity",dstCap:"Destination sensitivity",color:sevColor});
  }

  function load(){
    var fromkey=PDC.fromkey(PDC.filterState.range||"0");
    var srcsens=PDC.filterState.srcsens||"%";
    // Time Range + Source Sensitivity scope every movement metric (all fact_lineage_connection queries).
    PDC.resetCharts();PDC.el("content").innerHTML='<div class="loading">Loading…</div>';
    PDC.load({kpi:["kpi",{fromkey:fromkey,srcsens:srcsens}],sm:["sens_mix"],fm:["flow_matrix",{fromkey:fromkey,srcsens:srcsens}],
      rbs:["restricted_by_source",{fromkey:fromkey,srcsens:srcsens}],ct:["cross_trend",{fromkey:fromkey,srcsens:srcsens}],
      bd:["bytes_by_dest_sens",{fromkey:fromkey,srcsens:srcsens}],
      stf:["sens_to_sens_flow",{fromkey:fromkey,srcsens:srcsens}]}).then(render).catch(function(e){PDC.fail();console.error(e);});
  }
  PDC.cda("src_sensitivities").then(function(r){
    var ssOpts=[{v:"%",t:"All Sensitivities"}].concat(r.rows.slice(1).map(function(x){return{v:String(x[0]),t:String(x[0])};}));
    PDC.filters([{id:"range",label:"Movement Time Range",options:PDC.TIME_RANGE,def:"0"},{id:"srcsens",label:"Source Sensitivity",options:ssOpts,def:"%"}],load);load();
  }).catch(function(){PDC.filters([{id:"range",label:"Movement Time Range",options:PDC.TIME_RANGE,def:"0"},{id:"srcsens",label:"Source Sensitivity",options:[{v:"%",t:"All Sensitivities"}],def:"%"}],load);load();});
})();
