// Business Glossary & Term Reach.
(function(){
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  function rows(res,a,b){var ia=res.col(a),ib=res.col(b);return res.rows.map(function(r){return{label:String(r[ia]),value:+r[ib]||0};});}
  function render(d){
    var total=+v(d.kpi,"total_assets")||0, classified=+v(d.kpi,"classified")||0;
    PDC.kpis(PDC.el("kpis"),[
      {value:PDC.fmt.abbr(v(d.kpi,"terms")),label:"Glossary Terms",state:"purple",info:"Distinct business glossary terms defined (e.g. 'Customer', 'PII - Email Address'). The shared vocabulary used to classify catalog assets."},
      {value:PDC.fmt.abbr(classified),label:"Classified Assets",info:"Catalog assets that have at least one glossary term assigned — i.e. data that has been business-tagged and given meaning."},
      {value:PDC.fmt.pct(total?100*classified/total:0),label:"Classification Coverage",state:(total&&classified/total>=0.3)?"good":"warn",info:"Classified assets ÷ total assets — how much of the estate is mapped to business terms vs still untagged. Higher coverage = a more usable, governed catalog."},
      {value:PDC.fmt.n(v(d.kpi,"glossaries")),label:"Glossaries",info:"Number of distinct glossaries (top-level business domains, e.g. Finance, HR, PII) that the terms are organized under."}
    ]);
    var content=PDC.el("content");content.innerHTML="";var g=PDC.grid(3);content.appendChild(g);
    var sens=PDC.filterState.sens||"%";
    // click a glossary (bar or treemap tile) → drawer of the ACTUAL entities classified under it
    var glossaryDetail={da:"detail_glossary_entities",param:"glossary",params:{sens:sens},noun:"classified entities",
      title:function(gl){return gl+" — classified entities";},
      subtitle:"every entity tagged under this glossary"+(sens!=="%"?(" · "+sens):""),
      cols:[
        {key:"name",label:"Entity",title:true,fmt:function(x){return PDC.fmt.trunc(x,40);}},
        {key:"term",label:"Term",fmt:function(x){return PDC.fmt.trunc(x,28);}},
        {key:"sensitivity",label:"Sensitivity"},
        {key:"owner",label:"Owner",fmt:function(x){return PDC.fmt.trunc(x,18);}}],
      drill:{to:"i-sensitive-domains",param:"glossary",label:"Open Sensitive Domains"}};
    var c1=PDC.card("Term Reach by Glossary",{pill:"entities · click → assets",src:"fact_entity_term · cube 72",info:"How many catalog entities each glossary (business domain) reaches through its assigned terms. The widest bars are your most-applied domains. Click a bar to see the actual classified entities."});g.appendChild(c1.el);
    PDC.bars(c1.body,{horizontal:true,labelW:150,fmt:PDC.fmt.abbr,detail:glossaryDetail,data:rows(d.bg,"glossary","entities")});
    var c2=PDC.card("Classification Coverage",{pill:"assets",src:"fact_entity_term · cube 72",info:"Classified vs unclassified assets — the share of the estate mapped to business terms vs still untagged. A large unclassified slice is your classification backlog."});g.appendChild(c2.el);
    PDC.donut(c2.body,{centerCap:"Assets",fmt:PDC.fmt.abbr,data:rows(d.cl,"label","assets").map(function(x){x.color=/^classified/i.test(x.label)?PDC.cssvar("--good"):PDC.cssvar("--text-faint");return x;})});
    var c3=PDC.card("Glossary Reach Treemap",{pill:"entities · click → assets",src:"fact_entity_term · cube 72",info:"The same per-glossary entity reach shown as proportional tiles — larger tiles are domains that classify more of the catalog. Click a tile for its entities."});g.appendChild(c3.el);
    PDC.treemap(c3.body,{height:260,fmt:PDC.fmt.abbr,detail:glossaryDetail,data:rows(d.bg,"glossary","entities")});
    var c4=PDC.card("Top Terms by Entity Reach",{pill:"entities",src:"dim_glossary_term · cube 72",span:3,info:"The individual glossary terms attached to the most entities — your most-used business definitions, and the ones worth keeping precise and well-governed."});g.appendChild(c4.el);
    var ti=d.tt.col("term"),gi=d.tt.col("glossary"),ei=d.tt.col("entities");
    PDC.table(c4.body,{cols:[{label:"Term",title:true,fmt:function(x){return PDC.fmt.trunc(x,40);}},
      {label:"Glossary",fmt:function(x){return PDC.fmt.trunc(x,20);}},
      {label:"Entity Reach",num:true,bar:true,fmt:PDC.fmt.n}],
      rows:d.tt.rows.map(function(r){return[r[ti],r[gi],+r[ei]||0];})});
  }
  function load(){var glossary=PDC.filterState.glossary||"%",sens=PDC.filterState.sens||"%";PDC.resetCharts();PDC.el("content").innerHTML='<div class="loading">Loading…</div>';
    // glossary filter narrows kpi + top-terms; by_glossary (the cross-glossary breakdown) and the coverage donut stay glossary-agnostic
    PDC.load({kpi:["kpi",{glossary:glossary,sens:sens}],bg:["by_glossary",{sens:sens}],tt:["top_terms",{glossary:glossary,sens:sens}],cl:["classified",{sens:sens}]}).then(render).catch(function(e){PDC.fail();console.error(e);});}
  Promise.all([PDC.cda("glossaries"),PDC.cda("sensitivities")]).then(function(res){
    var glOpts=[{v:"%",t:"All glossaries"}].concat(res[0].rows.map(function(x){return{v:x[0],t:x[0]};}));
    var snOpts=[{v:"%",t:"All sensitivities"}].concat(res[1].rows.map(function(x){return{v:x[0],t:x[0]};}));
    PDC.filters([{id:"glossary",label:"Glossary",options:glOpts,def:"%"},{id:"sens",label:"Sensitivity",options:snOpts,def:"%"}],load);load();
  }).catch(function(){PDC.filters([{id:"glossary",label:"Glossary",options:[{v:"%",t:"All glossaries"}]},{id:"sens",label:"Sensitivity",options:[{v:"%",t:"All sensitivities"}]}],load);load();});
})();
