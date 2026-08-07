// Sensitive Data & Privacy — PII/classification reach across sources.
(function(){
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  function rows(res,a,b){var ia=res.col(a),ib=res.col(b);return res.rows.map(function(r){return{label:String(r[ia]),value:+r[ib]||0};});}
  function render(d){
    PDC.kpis(PDC.el("kpis"),[
      {value:PDC.fmt.abbr(v(d.kpi,"priv_assets")),label:"Privacy-Classified Assets",state:"bad",info:"Assets tagged with a privacy/PII glossary term (e.g. Email, SSN, Date of Birth). The regulated population that data-protection controls must cover."},
      {value:PDC.fmt.n(v(d.kpi,"terms")),label:"Privacy Terms",info:"Distinct privacy/PII glossary terms in use (Email, Phone, National ID…) — the vocabulary for identifying personal data across the catalog."},
      {value:PDC.fmt.n(v(d.kpi,"elevated")),label:"Med/High Sensitivity",state:"warn",info:"Assets rated MEDIUM or HIGH sensitivity — the elevated-risk subset that needs stricter handling, access control, and monitoring."},
      {value:PDC.fmt.n(v(d.kpi,"high")),label:"High Sensitivity",state:"bad",info:"Assets rated HIGH sensitivity (PII / PHI / PCI). The most tightly regulated data; any ungoverned movement of it is a top compliance risk."}
    ]);
    var content=PDC.el("content");content.innerHTML="";var g=PDC.grid(3);content.appendChild(g);
    var ds=PDC.filterState.ds||"%",sens=PDC.filterState.sens||"%";
    var c1=PDC.card("Privacy Classification Reach",{pill:"entities",src:"fact_entity_term + glossary · cube 72",info:"How many entities each privacy term reaches — which kinds of personal data (email, phone, ID…) are most widespread across the estate."});g.appendChild(c1.el);
    PDC.bars(c1.body,{horizontal:true,labelW:170,labelChars:26,color:PDC.cssvar("--bad"),fmt:PDC.fmt.abbr,data:rows(d.bt,"term","entities")});
    var c2=PDC.card("Privacy Exposure by Source",{pill:"entities",src:"fact_entity_term · cube 72",info:"Count of privacy-classified entities per source — which platforms hold the most personal data, and therefore carry the most exposure to protect."});g.appendChild(c2.el);
    PDC.bars(c2.body,{horizontal:true,labelW:150,fmt:PDC.fmt.abbr,data:rows(d.bs,"src","entities")});
    var c3=PDC.card("Sensitivity Scale",{pill:"assets",src:"dim_entity.sensitivity · cube 71",info:"Rated assets split across the sensitivity scale (HIGH / MEDIUM / LOW). A larger HIGH slice means more of your data is regulated and needs strict controls."});g.appendChild(c3.el);
    PDC.donut(c3.body,{centerCap:"Rated",fmt:PDC.fmt.abbr,data:rows(d.sc,"s","n").map(function(x){x.color=/HIGH/.test(x.label)?PDC.cssvar("--bad"):/MEDIUM/.test(x.label)?PDC.cssvar("--warn"):PDC.cssvar("--c3");return x;})});
    // Heatmap term x source
    var c4=PDC.card("Privacy Term × Source",{pill:"entities",src:"fact_entity_term · cube 72",span:3,info:"A heatmap of privacy terms (rows) against sources (columns); darker cells = more entities of that personal-data type in that source. Pinpoints exactly where specific PII concentrates."});g.appendChild(c4.el);
    var terms=[],srcs=[];
    d.mx.rows.forEach(function(r){var t=r[d.mx.col("term")],s=r[d.mx.col("src")];if(terms.indexOf(t)<0&&terms.length<8)terms.push(t);if(srcs.indexOf(s)<0)srcs.push(s);});
    var mat=terms.map(function(){return srcs.map(function(){return 0;});});
    d.mx.rows.forEach(function(r){var ti=terms.indexOf(r[d.mx.col("term")]),si=srcs.indexOf(r[d.mx.col("src")]);if(ti>=0&&si>=0)mat[ti][si]=+r[d.mx.col("entities")]||0;});
    PDC.heatmap(c4.body,{rows:terms,cols:srcs,matrix:mat,labelW:180,showVals:true,fmt:PDC.fmt.n,color:PDC.cssvar("--bad"),height:terms.length*34+70});
    // Privacy Exposure Trend — cumulative discovery of privacy-classified assets over time
    var c5=PDC.card("Privacy Exposure Growth",{pill:"cumulative entities · month",src:"fact_entity_snapshot first-scan · fact_entity_term privacy filter",span:3,info:"Cumulative count of privacy-classified entities discovered over time — how your regulated population has grown month by month. A steep climb signals a major data-source onboarding or a reclassification sweep. Filter by source or sensitivity to isolate a specific risk track."});g.appendChild(c5.el);
    var mi=d.pt.col("month"),ci=d.pt.col("cum_entities"),ni=d.pt.col("new_entities");
    var labels=d.pt.rows.map(function(r){return String(r[mi]);});
    var cumVals=d.pt.rows.map(function(r){return +r[ci]||0;});
    var newVals=d.pt.rows.map(function(r){return +r[ni]||0;});
    PDC.line(c5.body,{area:true,fmt:PDC.fmt.abbr,labels:labels,
      series:[
        {name:"Cumulative PII entities",values:cumVals,color:PDC.cssvar("--bad")},
        {name:"New this month",values:newVals,color:PDC.cssvar("--warn")}
      ]});
  }
  function load(){
    var ds=PDC.filterState.ds||"%",sens=PDC.filterState.sens||"%";
    PDC.resetCharts();PDC.el("content").innerHTML='<div class="loading">Loading…</div>';
    var p={ds:ds,sens:sens};
    PDC.load({kpi:["kpi",p],bt:["by_term",p],bs:["by_source",p],sc:["scale",p],mx:["matrix",p],pt:["privacy_trend",p]}).then(render).catch(function(e){PDC.fail();console.error(e);});
  }
  Promise.all([PDC.cda("datasources"),PDC.cda("sensitivities")]).then(function(res){
    var dsOpts=[{v:"%",t:"All sources"}].concat(res[0].rows.map(function(x){return{v:x[0],t:x[0]};}));
    var snOpts=[{v:"%",t:"All sensitivities"}].concat(res[1].rows.map(function(x){return{v:x[0],t:x[0]};}));
    PDC.filters([{id:"ds",label:"Data Source",options:dsOpts,def:"%"},{id:"sens",label:"Sensitivity",options:snOpts,def:"%"}],load);load();
  }).catch(function(){PDC.filters([{id:"ds",label:"Data Source",options:[{v:"%",t:"All sources"}]},{id:"sens",label:"Sensitivity",options:[{v:"%",t:"All sensitivities"}]}],load);load();});
})();
