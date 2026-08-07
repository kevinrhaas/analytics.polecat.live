// Catalog Adoption — how actively the catalog is classified, governed and used.
(function(){
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  function rows(res,a,b){var ia=res.col(a),ib=res.col(b);return res.rows.map(function(r){return{label:String(r[ia]),value:+r[ib]||0};});}
  function render(d){
    PDC.kpis(PDC.el("kpis"),[
      {value:PDC.fmt.n(v(d.kpi,"apps")),label:"Applications",state:"purple",info:"Distinct applications/tools observed using catalog data — a proxy for how actively the data is consumed across the organization."},
      {value:PDC.fmt.n(v(d.kpi,"terms")),label:"Glossary Terms Applied",info:"Total glossary-term assignments across assets — how much business meaning has been attached to the catalog."},
      {value:PDC.fmt.n(v(d.kpi,"policies")),label:"Policies Assigned",info:"Total governance-policy assignments across assets — the reach of active governance rules in the catalog."},
      {value:PDC.fmt.pct(v(d.kpi,"classified_pct")),label:"Classification Coverage",state:(+v(d.kpi,"classified_pct")>=30?"good":"warn"),info:"Share of assets carrying at least one glossary term — how much of the estate is business-classified. ≥30% is healthy at this stage."}
    ]);
    var content=PDC.el("content");content.innerHTML="";var g=PDC.grid(3);content.appendChild(g);
    var c1=PDC.card("Adoption Coverage",{pill:"assets",src:"fact_entity_term/policy/application · cubes 72/73/74",info:"Assets touched by each adoption signal — classified (glossary terms), governed (policies), and accessed (applications). Shows which forms of catalog adoption have the widest reach."});g.appendChild(c1.el);
    PDC.bars(c1.body,{horizontal:true,labelW:160,fmt:PDC.fmt.abbr,data:rows(d.cv,"dim","assets").map(function(x,i){x.label=x.label.replace(/^\d+\.\s*/,'');x.color=[PDC.cssvar('--good'),PDC.cssvar('--pentaho'),PDC.cssvar('--pdc')][i]||PDC.cssvar('--c4');return x;})});
    var c2=PDC.card("Top Applications by Access",{pill:"events",src:"fact_entity_application · cube 74",info:"Which applications generate the most data access — the heaviest catalog consumers, and where access governance matters most."});g.appendChild(c2.el);
    PDC.bars(c2.body,{horizontal:true,labelW:180,labelChars:28,fmt:PDC.fmt.abbr,data:rows(d.ta,"app","acc")});
    var c3=PDC.card("Top Policies by Assignment",{pill:"assignments",src:"fact_entity_policy · cube 73",info:"Which governance policies are assigned to the most assets — your most broadly-applied rules and where governance has real coverage."});g.appendChild(c3.el);
    PDC.bars(c3.body,{horizontal:true,labelW:180,labelChars:28,color:PDC.cssvar("--pdc"),fmt:PDC.fmt.abbr,data:rows(d.tp,"pol","assigns")});
    var c4=PDC.card("Classified Assets by Source",{pill:"entities",src:"fact_entity_term · cube 72",span:2,info:"Count of business-classified entities per source — which platforms are well-covered by glossary terms vs which are lagging on classification."});g.appendChild(c4.el);
    PDC.bars(c4.body,{horizontal:true,labelW:160,fmt:PDC.fmt.abbr,data:rows(d.bs,"src","classified")});
    var c5=PDC.card("Application Reach",{pill:"detail",src:"dim_application · cube 74",info:"Per-application access totals as a ranked table — the detailed numbers behind the top-applications chart."});g.appendChild(c5.el);
    var ai=d.ta.col("app"),ci=d.ta.col("acc");
    PDC.table(c5.body,{cols:[{label:"Application",title:true,fmt:function(x){return PDC.fmt.trunc(x,26);}},{label:"Accesses",num:true,bar:true,fmt:PDC.fmt.n}],
      rows:d.ta.rows.map(function(r){return[r[ai],+r[ci]||0];})});

    var c6=PDC.card("Application ↔ Data Source Access Interconnect",{pill:"chord · access count · hover to isolate",src:"fact_entity_application × dim_application × dim_datasource · cube 74",span:3,info:"A circular interconnect diagram showing which applications access which data sources. Each arc represents an app or source — sized by total accesses; hover to isolate its connections. Reveals which apps are cross-platform consumers vs. source-specific."});g.appendChild(c6.el);
    var aci=d.asc.col("app"),asi=d.asc.col("src"),avi=d.asc.col("accesses");
    var ascLinks=d.asc.rows.map(function(r){return{source:String(r[aci]),target:String(r[asi]),value:+r[avi]||0};});
    PDC.chord(c6.body,{links:ascLinks,height:380,fmt:PDC.fmt.abbr,caption:"hover an arc to isolate"});
  }
  PDC.resetCharts();
  PDC.load({kpi:["kpi"],cv:["coverage"],ta:["top_apps"],tp:["top_policies"],bs:["by_source"],asc:["app_src_chord"]}).then(render).catch(function(e){PDC.fail();console.error(e);});
})();
