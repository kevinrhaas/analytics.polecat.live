// Sensitive Data Domains — governance risk map: which business glossaries/domains
// carry sensitive (HIGH/MEDIUM/LOW) data. Hero = glossary × sensitivity heatmap.
(function(){
  var ORDER=["HIGH","MEDIUM","LOW","Unclassified"];
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  function rows(res,a,b){var ia=res.col(a),ib=res.col(b);return res.rows.map(function(r){return{label:String(r[ia]),value:+r[ib]||0};});}
  function sensColor(s){return /HIGH/i.test(s)?PDC.cssvar("--bad"):/MEDIUM/i.test(s)?PDC.cssvar("--warn"):/LOW/i.test(s)?PDC.cssvar("--c3"):PDC.cssvar("--text-faint");}
  function render(d){
    PDC.kpis(PDC.el("kpis"),[
      {value:PDC.fmt.n(v(d.kpi,"glossaries_w_sens")),label:"Domains w/ Sensitive Data",state:"purple",info:"Business domains (glossaries) that contain at least one HIGH/MEDIUM-sensitivity asset — i.e. where regulated data lives in your business taxonomy."},
      {value:PDC.fmt.n(v(d.kpi,"high_entities")),label:"HIGH-Sensitivity Entities",state:(+v(d.kpi,"high_entities")>0?"bad":"good"),info:"Domain-tagged entities rated HIGH sensitivity (PII / PHI / PCI) — the most tightly regulated population in the catalog."},
      {value:PDC.fmt.n(v(d.kpi,"hm_entities")),label:"HIGH + MEDIUM Entities",state:"warn",info:"Domain-tagged entities rated HIGH or MEDIUM — the elevated-risk subset that needs stricter handling, access control, and monitoring."},
      {value:(v(d.kpi,"sens_pct")==null?"—":v(d.kpi,"sens_pct")+"%"),label:"Classified Reach",state:"good",info:"Share of domain-tagged entities that carry a sensitivity rating — how much of the classified estate has actually been risk-assessed."}
    ]);
    var content=PDC.el("content");content.innerHTML="";var g=PDC.grid(3);content.appendChild(g);

    // Hero: glossary × sensitivity heatmap
    var c1=PDC.card("Domain × Sensitivity Risk Map",{pill:"entities",src:"fact_entity_term × dim_entity.sensitivity",span:2,info:"Heatmap of business domains (rows) against sensitivity tiers (columns); darker/larger cells = more entities at that risk level in that domain. Your at-a-glance map of where sensitive data concentrates."});g.appendChild(c1.el);
    var glos=[],idx={};
    d.ht.rows.forEach(function(r){var gl=r[d.ht.col("glossary")];if(idx[gl]==null){idx[gl]=glos.length;glos.push(gl);}});
    var cols=ORDER.slice();
    var mat=glos.map(function(){return cols.map(function(){return 0;});});
    d.ht.rows.forEach(function(r){var gi=idx[r[d.ht.col("glossary")]],ci=cols.indexOf(String(r[d.ht.col("sens")]));if(ci<0)ci=cols.indexOf("Unclassified");mat[gi][ci]=+r[d.ht.col("entities")]||0;});
    PDC.heatmap(c1.body,{rows:glos,cols:cols,matrix:mat,labelW:150,showVals:true,fmt:PDC.fmt.abbr,height:Math.max(240,glos.length*30+70)});

    // Sensitivity mix across glossary-tagged entities
    var c2=PDC.card("Sensitivity Mix",{pill:"entities",src:"dim_entity.sensitivity",info:"Domain-tagged entities split across sensitivity tiers (HIGH / MEDIUM / LOW / Unclassified). A larger HIGH+MEDIUM share means more regulated data in your domains."});g.appendChild(c2.el);
    PDC.donut(c2.body,{centerCap:"Entities",fmt:PDC.fmt.abbr,data:rows(d.sm,"sens","entities").map(function(x){x.color=sensColor(x.label);return x;})});

    // Top risk domains (HIGH+MEDIUM) — click a domain → drawer of its actual HIGH/MEDIUM entities
    var domainDetail={da:"detail_risk_domain",param:"glossary",noun:"sensitive entities",
      title:function(gl){return gl+" — sensitive entities";},
      subtitle:"every HIGH / MEDIUM entity tagged in this domain",
      cols:[
        {key:"name",label:"Entity",title:true,fmt:function(x){return PDC.fmt.trunc(x,40);}},
        {key:"term",label:"Sensitive Term",fmt:function(x){return PDC.fmt.trunc(x,28);}},
        {key:"sensitivity",label:"Sensitivity"},
        {key:"owner",label:"Owner",fmt:function(x){return PDC.fmt.trunc(x,18);}}],
      drill:{to:"i-privacy",param:"glossary",label:"Open Privacy for this domain"}};
    var c3=PDC.card("Top Risk Domains",{pill:"HIGH+MED · click → entities",src:"fact_entity_term · sensitivity in (HIGH,MEDIUM)",span:2,info:"Domains ranked by their count of HIGH+MEDIUM entities — where sensitive data concentrates and governance attention should go first. Click a bar for the actual entities."});g.appendChild(c3.el);
    PDC.bars(c3.body,{horizontal:true,labelW:160,labelChars:26,color:PDC.cssvar("--bad"),fmt:PDC.fmt.abbr,detail:domainDetail,data:rows(d.rr,"glossary","hm_entities")});

    // Sensitivity legend / quick scale via small bars
    var c4=PDC.card("Classified vs Unclassified",{pill:"entities",src:"glossary-tagged entities",info:"Of the domain-tagged entities, how many carry a sensitivity rating (HIGH/MEDIUM/LOW) vs none. The unclassified slice is the risk-assessment gap to close."});g.appendChild(c4.el);
    var classified=0,unclassified=0;d.sm.rows.forEach(function(r){var s=String(r[d.sm.col("sens")]);var n=+r[d.sm.col("entities")]||0;if(/HIGH|MEDIUM|LOW/i.test(s))classified+=n;else unclassified+=n;});
    PDC.donut(c4.body,{centerCap:"Entities",fmt:PDC.fmt.abbr,data:[{label:"Classified",value:classified,color:PDC.cssvar("--good")},{label:"Unclassified",value:unclassified,color:PDC.cssvar("--text-faint")}]});

    // Top sensitive terms table
    var c5=PDC.card("Top Sensitive Terms (HIGH / MEDIUM)",{pill:"entities",src:"fact_entity_term · dim_glossary_term",span:3,info:"The individual glossary terms rated HIGH/MEDIUM attached to the most entities — the specific sensitive concepts (SSN, salary, health…) most widespread across the estate."});g.appendChild(c5.el);
    var ti=d.tt.col("term"),gi=d.tt.col("glossary"),pi=d.tt.col("sens"),ei=d.tt.col("entities");
    PDC.table(c5.body,{cols:[{label:"Term",title:true,fmt:function(x){return PDC.fmt.trunc(x,40);}},
      {label:"Domain / Glossary",fmt:function(x){return PDC.fmt.trunc(x,30);}},
      {label:"Sensitivity"},
      {label:"Entities",num:true,bar:true,fmt:PDC.fmt.abbr}],
      rows:d.tt.rows.map(function(r){return[r[ti],r[gi],String(r[pi]),+r[ei]||0];})});
  }
  function load(){var gl=PDC.filterState.glossary||"%",ow=PDC.filterState.owner||"%";PDC.resetCharts();PDC.el("content").innerHTML='<div class="loading">Loading…</div>';
    PDC.load({kpi:["kpi",{glossary:gl,owner:ow}],ht:["heat",{glossary:gl,owner:ow}],rr:["risk_rank",{glossary:gl,owner:ow}],sm:["sens_mix",{glossary:gl,owner:ow}],tt:["top_terms",{glossary:gl,owner:ow}]}).then(render).catch(function(e){PDC.fail();console.error(e);});}
  Promise.all([PDC.cda("glossaries"),PDC.cda("owners")]).then(function(res){
    var opts=[{v:"%",t:"All domains"}].concat(res[0].rows.map(function(x){return{v:x[0],t:x[0]};}));
    var owOpts=[{v:"%",t:"All owners"}].concat(res[1].rows.map(function(x){return{v:x[0],t:x[0]};}));
    PDC.filters([{id:"glossary",label:"Domain",options:opts,def:"%"},{id:"owner",label:"Data Owner",options:owOpts,def:"%"}],load);load();
  }).catch(function(){PDC.filters([{id:"glossary",label:"Domain",options:[{v:"%",t:"All domains"}]},{id:"owner",label:"Data Owner",options:[{v:"%",t:"All owners"}]}],load);load();});
})();
