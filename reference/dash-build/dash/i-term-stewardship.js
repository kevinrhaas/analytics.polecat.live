// Glossary Hierarchy & Term Stewardship — defined-vs-used terms (adoption gap),
// hierarchy composition, term types, depth, and term-to-entity reach.
(function(){
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  function rows(res,a,b){var ia=res.col(a),ib=res.col(b);return res.rows.map(function(r){return{label:String(r[ia]),value:+r[ib]||0};});}
  function render(d){
    var defined=+v(d.kpi,"defined")||0, inUse=+v(d.kpi,"in_use")||0, unused=Math.max(defined-inUse,0);
    var adopt=defined?Math.round(1000*inUse/defined)/10:0;
    PDC.kpis(PDC.el("kpis"),[
      {value:PDC.fmt.n(defined),label:"Defined Terms",state:"purple",info:"Glossary terms that exist in the catalog's vocabulary — whether or not anything uses them yet."},
      {value:PDC.fmt.n(v(d.kpi,"glossaries")),label:"Glossaries",info:"Number of distinct glossaries (top-level business domains) the terms are organized under."},
      {value:PDC.fmt.n(inUse),label:"Terms In Use",state:"good",info:"Defined terms actually applied to at least one asset — the part of the vocabulary that's live and doing work."},
      {value:adopt+"%",label:"Adoption",state:(adopt>=50?"good":adopt>=25?"warn":"bad"),info:"Terms in use ÷ defined terms — the stewardship adoption rate. A low value means lots of defined-but-unused vocabulary. ≥50% good."},
      {value:PDC.fmt.n(unused),label:"Unused / Orphan",state:(unused>0?"bad":"good"),info:"Defined terms not applied to any asset — vocabulary debt. Candidates to retire, merge, or evangelize so they get used."}
    ]);
    var content=PDC.el("content");content.innerHTML="";var g=PDC.grid(3);content.appendChild(g);

    // Term adoption (defined vs used) — the stewardship-gap story
    var c1=PDC.card("Term Adoption",{pill:"terms",src:"fact_entity_term · dim_glossary_term",info:"Defined terms split into in-use vs unused — the headline stewardship gap at a glance. A big unused slice means a vocabulary defined faster than it's adopted."});g.appendChild(c1.el);
    PDC.donut(c1.body,{centerCap:"Defined",fmt:PDC.fmt.n,data:rows(d.ad,"status","n").map(function(x){
      x.color=/in use/i.test(x.label)?PDC.cssvar("--good"):PDC.cssvar("--bad");return x;})});

    // Term hierarchy by glossary (treemap)
    var c2=PDC.card("Terms by Glossary",{pill:"count",src:"dim_glossary_term.level_1_glossary",span:2,info:"How the defined vocabulary is distributed across business domains — larger tiles are richer, more built-out glossaries."});g.appendChild(c2.el);
    PDC.treemap(c2.body,{height:260,fmt:PDC.fmt.n,data:rows(d.bg,"glossary","terms")});

    // Term types
    var c3=PDC.card("Term Types",{pill:"count",src:"dim_glossary_term.term_type",info:"Defined terms by type (e.g. business term, abbreviation, category) — the composition of your vocabulary."});g.appendChild(c3.el);
    PDC.donut(c3.body,{centerCap:"Terms",fmt:PDC.fmt.n,data:rows(d.tt,"term_type","n").map(function(x,i){x.color=PDC.color(i);return x;})});

    // Hierarchy depth distribution
    var c4=PDC.card("Hierarchy Depth",{pill:"terms",src:"dim_glossary_term.hierarchy_depth",info:"Terms grouped by their depth in the glossary hierarchy — a flat spread means shallow taxonomies; deeper levels mean richer parent/child structure."});g.appendChild(c4.el);
    PDC.bars(c4.body,{fmt:PDC.fmt.n,data:rows(d.dp,"depth","n")});

    // Top glossaries by term-to-entity reach — click a glossary → drawer of the entities it classifies
    var glossaryDetail={da:"detail_glossary_entities",param:"glossary",noun:"classified entities",
      title:function(gl){return gl+" — classified entities";},
      subtitle:"every entity reached by this glossary's terms",
      cols:[
        {key:"name",label:"Entity",title:true,fmt:function(x){return PDC.fmt.trunc(x,40);}},
        {key:"term",label:"Term",fmt:function(x){return PDC.fmt.trunc(x,28);}},
        {key:"sensitivity",label:"Sensitivity"},
        {key:"owner",label:"Owner",fmt:function(x){return PDC.fmt.trunc(x,18);}}],
      drill:{to:"i-privacy",param:"glossary",label:"Open Privacy for this domain"}};
    var c5=PDC.card("Top Glossaries by Reach",{pill:"entities · click → assets",src:"fact_entity_term · count(distinct entity)",info:"Which glossaries reach the most entities through their applied terms — the domains doing the most classification work across the estate. Click a bar to list the entities it reaches."});g.appendChild(c5.el);
    PDC.bars(c5.body,{horizontal:true,labelW:150,labelChars:24,color:PDC.cssvar("--pdc"),fmt:PDC.fmt.abbr,detail:glossaryDetail,data:rows(d.rc,"glossary","entities")});

    // Term Adoption Coverage Over Time — dual-line trend (cumulative entities vs classified)
    var cTr=PDC.card("Term Adoption Coverage Over Time",{span:3,pill:"cumulative entities",src:"fact_entity_snapshot · fact_entity_term · dim_date",info:"Cumulative catalog entities discovered (all assets) vs entities with at least one matching term applied — reveals whether classification effort keeps pace with catalog growth. Glossary &amp; Term Type filters scope which vocabulary counts as 'classified'."});g.appendChild(cTr.el);
    PDC.line(cTr.body,{area:false,fmt:PDC.fmt.abbr,labels:d.tr.rows.map(function(r){return String(r[d.tr.col("month")]);}),series:[
      {name:"All Entities",values:d.tr.rows.map(function(r){return +r[d.tr.col("cum_entities")]||0;}),color:PDC.cssvar("--muted")},
      {name:"Classified",values:d.tr.rows.map(function(r){return +r[d.tr.col("cum_classified")]||0;}),color:PDC.cssvar("--pdc")}
    ]});

    // Top applied terms (table)
    var c6=PDC.card("Top Applied Terms",{pill:"reach",src:"fact_entity_term",span:3,info:"The individual terms applied to the most entities, with their glossary, entity reach, and total assignments — your most-used business definitions."});g.appendChild(c6.el);
    var ti=d.tp.col("term"),gi=d.tp.col("glossary"),ei=d.tp.col("entities"),ai=d.tp.col("assigns");
    PDC.table(c6.body,{cols:[{label:"Term",title:true,fmt:function(x){return PDC.fmt.trunc(x,40);}},
      {label:"Glossary",fmt:function(x){return PDC.fmt.trunc(x,32);}},
      {label:"Entities",num:true,bar:true,fmt:PDC.fmt.abbr},
      {label:"Assignments",num:true,fmt:PDC.fmt.n}],
      rows:d.tp.rows.map(function(r){return[r[ti],r[gi],+r[ei]||0,+r[ai]||0];})});
  }
  function load(){var gl=PDC.filterState.glossary||"%", tt=PDC.filterState.ttype||"%";PDC.resetCharts();PDC.el("content").innerHTML='<div class="loading">Loading…</div>';
    PDC.load({kpi:["kpi",{glossary:gl,ttype:tt}],ad:["adoption",{glossary:gl,ttype:tt}],bg:["by_glossary"],tt:["term_types"],dp:["depth"],rc:["reach"],tp:["top_terms",{glossary:gl,ttype:tt}],tr:["term_adoption_trend",{glossary:gl,ttype:tt}]}).then(render).catch(function(e){PDC.fail();console.error(e);});}
  Promise.all([PDC.cda("glossaries"),PDC.cda("ttypes")]).then(function(rs){
    var glOpts=[{v:"%",t:"All glossaries"}].concat(rs[0].rows.map(function(x){return{v:x[0],t:x[0]};}));
    var ttOpts=[{v:"%",t:"All types"}].concat(rs[1].rows.map(function(x){return{v:x[0],t:x[0]};}));
    PDC.filters([{id:"glossary",label:"Glossary",options:glOpts,def:"%"},{id:"ttype",label:"Term Type",options:ttOpts,def:"%"}],load);load();
  }).catch(function(){PDC.filters([{id:"glossary",label:"Glossary",options:[{v:"%",t:"All glossaries"}]},{id:"ttype",label:"Term Type",options:[{v:"%",t:"All types"}]}],load);load();});
})();
