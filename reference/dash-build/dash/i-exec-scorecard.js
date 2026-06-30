// Unified Executive Scorecard — one leadership-facing board pulling the headline
// metric from every domain, with status colors, trend sparklines, and drill-through
// links to each domain dashboard. v2 hero board.
(function(){
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  // sibling-dashboard URL, derived from this page's path (version-portable)
  function dash(name){try{return location.pathname.replace(/:[^:]+\.html\/content$/,":"+name+".html/content");}catch(e){return "#";}}
  function st(good,warn,val,inv){ // returns status class by threshold (inv=lower is better)
    var x=+val||0; if(inv){return x<=good?"good":x<=warn?"warn":"bad";} return x>=good?"good":x>=warn?"warn":"bad";}
  var COL={good:"--good",warn:"--warn",bad:"--bad",purple:"--c2",pdc:"--pdc"};
  function dot(cls){return '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:var('+(COL[cls]||"--pdc")+');margin-right:6px;vertical-align:middle"></span>';}

  function metric(label,val,cls){
    return '<div style="display:flex;align-items:baseline;justify-content:space-between;padding:3px 0">'+
      '<span style="font-size:12px;color:var(--text-muted)">'+dot(cls)+label+'</span>'+
      '<span style="font-size:15px;font-weight:800;color:var(--text-primary);font-variant-numeric:tabular-nums">'+val+'</span></div>';
  }
  function domainCard(g,title,target,metricsHtml){
    var c=PDC.card(title,{});g.appendChild(c.el);
    c.body.innerHTML='<div style="padding:2px 0 6px">'+metricsHtml+'</div>'+
      '<a href="'+dash(target)+'" style="display:inline-block;margin-top:6px;font-size:12px;font-weight:700;color:var(--pdc);text-decoration:none">Open dashboard &rarr;</a>';
  }

  // Estate Health Radar — pentagon spider chart using headline KPIs
  function radarSVG(h){
    var axes=[
      {label:"Governance",  val:+v(h,"governed_pct")||0},
      {label:"Quality",     val:+v(h,"complete_pct")||0},
      {label:"Freshness",   val:Math.max(0,100-(+v(h,"stale_pct")||0))},
      {label:"Pipelines",   val:+v(h,"pipe_success")||0},
      {label:"Stewardship", val:+v(h,"adoption_pct")||0}
    ];
    var W=520,H=300,cx=260,cy=148,R=108,N=5;
    function ang(i){return(Math.PI*2*i/N)-Math.PI/2;}
    function pt(i,f){var a=ang(i);return[cx+R*f*Math.cos(a),cy+R*f*Math.sin(a)];}
    var s='<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="max-width:540px;display:block;margin:0 auto">';
    // grid rings
    s+='<g opacity=".25">';
    [.25,.5,.75,1].forEach(function(r){
      var pp=[];for(var i=0;i<N;i++){var p=pt(i,r);pp.push(p[0]+","+p[1]);}
      s+='<polygon points="'+pp.join(" ")+'" fill="none" stroke="#1775e0" stroke-width="'+(r===1?1:.7)+'"/>';
    });
    for(var i=0;i<N;i++){var p=pt(i,1);s+='<line x1="'+cx+'" y1="'+cy+'" x2="'+p[0]+'" y2="'+p[1]+'" stroke="#1775e0" stroke-width=".7"/>';}
    s+='</g>';
    // data area
    var dp=[];axes.forEach(function(a,i){var p=pt(i,a.val/100);dp.push(p[0]+","+p[1]);});
    s+='<polygon points="'+dp.join(" ")+'" fill="rgba(23,117,224,.15)" stroke="#1775e0" stroke-width="2.2" stroke-linejoin="round"/>';
    // dots + labels
    axes.forEach(function(a,i){
      var p=pt(i,a.val/100);
      var col=a.val>=75?"#63a621":a.val>=45?"#e68c17":"#d94f3d";
      s+='<circle cx="'+p[0]+'" cy="'+p[1]+'" r="5.5" fill="'+col+'" stroke="#fff" stroke-width="1.5"/>';
      var lp=pt(i,1.28);
      var ca=Math.cos(ang(i)),anch=ca>0.15?"start":ca<-0.15?"end":"middle";
      s+='<text x="'+lp[0]+'" y="'+lp[1]+'" text-anchor="'+anch+'" dominant-baseline="middle" font-size="11" font-weight="700" fill="#0f1d2e" font-family="system-ui,-apple-system">'+a.label+'</text>';
      var vp=pt(i,1.28);vp[1]+=15;
      s+='<text x="'+vp[0]+'" y="'+vp[1]+'" text-anchor="'+anch+'" dominant-baseline="middle" font-size="13" font-weight="850" fill="'+col+'" font-family="system-ui,-apple-system">'+a.val+'%</text>';
    });
    // ring ticks
    [[.25,"25%"],[.5,"50%"],[.75,"75%"]].forEach(function(r){
      var p=pt(1,r[0]);
      s+='<text x="'+(p[0]+3)+'" y="'+(p[1]-3)+'" font-size="8" fill="#90a2b7">'+r[1]+'</text>';
    });
    s+='</svg>';
    return s;
  }

  function render(d){
    var h=d.h;
    PDC.kpis(PDC.el("kpis"),[
      {value:PDC.fmt.abbr(v(h,"assets")),label:"Catalog Assets",state:"purple",info:"Total catalog objects under management across all connected sources — the executive headline for the scale of your data estate."},
      {value:v(h,"governed_pct")+"%",label:"Governed",state:st(50,25,v(h,"governed_pct")),info:"Share of assets covered by a governance policy or glossary term — the single best one-number proxy for catalog maturity."},
      {value:v(h,"pipe_success")+"%",label:"Pipeline Success",state:st(90,75,v(h,"pipe_success")),info:"Share of data-integration job runs that completed successfully (vs failed/aborted) — top-line operational reliability."},
      {value:PDC.fmt.n(v(h,"high_sens")),label:"HIGH-Sensitivity",state:(+v(h,"high_sens")>0?"bad":"good"),info:"Count of assets rated HIGH sensitivity (PII / PHI / PCI). Non-zero means regulated data that demands strict controls and monitoring."},
      {value:PDC.fmt.n(v(h,"storage_tb"))+" TB",label:"Storage Footprint",state:"purple",info:"Total physical size of FILE + TABLE assets (TB), summed from the dimensional model. Files and tables are the storage-bearing grain."},
      {value:"$"+PDC.fmt.abbr(v(h,"monthly_cost"))+"/mo",label:"Est. Storage Cost",state:"warn",info:"Footprint TB × each source's blended $/TB rate = estimated monthly storage spend. A planning estimate, not a billing figure."}
    ]);
    var content=PDC.el("content");content.innerHTML="";var g=PDC.grid(3);content.appendChild(g);

    // Trend sparklines (catalog growth + throughput)
    var c1=PDC.card("Catalog Growth",{pill:"assets / month",src:"fact_entity_snapshot · dim_date",span:2,info:"New catalog assets discovered per month — how fast the managed estate is growing. A steady climb means discovery is keeping pace with your data."});g.appendChild(c1.el);
    PDC.line(c1.body,{area:true,fmt:PDC.fmt.abbr,labels:d.gr.rows.map(function(r){return r[d.gr.col("month")];}),series:[{name:"Assets",values:d.gr.rows.map(function(r){return +r[d.gr.col("assets")]||0;})}]});
    var c2=PDC.card("Data Movement",{pill:"GB / month",src:"fact_lineage_event",info:"Volume of data (GB) moved by integration jobs per month — the throughput of your pipelines. Rising volume signals a busier, more interconnected estate."});g.appendChild(c2.el);
    PDC.line(c2.body,{area:true,fmt:PDC.fmt.abbr,labels:d.tp.rows.map(function(r){return r[d.tp.col("month")];}),series:[{name:"GB",values:d.tp.rows.map(function(r){return +r[d.tp.col("gb")]||0;})}]});

    // Domain scorecard grid
    domainCard(g,"Catalog &amp; Discovery","pdc-command-center",
      metric("Assets",PDC.fmt.abbr(v(h,"assets")),"pdc")+metric("Data Sources",v(h,"sources"),"pdc"));
    domainCard(g,"Governance","pdc-governance",
      metric("Governed",v(h,"governed_pct")+"%",st(50,25,v(h,"governed_pct")))+metric("Policies",v(h,"policies"),"pdc"));
    domainCard(g,"Sensitivity &amp; Privacy","i-sensitive-domains",
      metric("HIGH-Sensitivity Entities",PDC.fmt.n(v(h,"high_sens")),(+v(h,"high_sens")>0?"bad":"good")));
    domainCard(g,"Data Quality","pdc-data-quality",
      metric("Metadata Complete",v(h,"complete_pct")+"%",st(70,40,v(h,"complete_pct")))+metric("Dead Columns",PDC.fmt.n(v(h,"dead_cols")),"warn"));
    domainCard(g,"Freshness","pdc-freshness",
      metric("Stale Assets",v(h,"stale_pct")+"%",st(20,40,v(h,"stale_pct"),true)));
    domainCard(g,"Pipelines &amp; Movement","i-cdf-lineage",
      metric("Pipeline Success",v(h,"pipe_success")+"%",st(90,75,v(h,"pipe_success")))+metric("Data Moved",PDC.fmt.abbr(v(h,"gb_moved"))+" GB","pdc")+metric("Integrations",v(h,"integrations"),"pdc"));
    domainCard(g,"Storage &amp; Cost","pdc-cost",
      metric("Footprint",PDC.fmt.n(v(h,"storage_tb"))+" TB","pdc")+metric("Monthly Cost","$"+PDC.fmt.abbr(v(h,"monthly_cost")),"warn"));
    domainCard(g,"Glossary &amp; Stewardship","i-term-stewardship",
      metric("Defined Terms",PDC.fmt.n(v(h,"terms")),"pdc")+metric("Term Adoption",v(h,"adoption_pct")+"%",st(50,25,v(h,"adoption_pct"))));
    domainCard(g,"Column Health","i-column-health",
      metric("Dead / Constant Columns",PDC.fmt.n(v(h,"dead_cols")),"warn"));

    // Estate health radar — span:3 hero at the bottom
    var cr=PDC.card("Estate Health Radar",{span:3,src:"fact_entity_snapshot · fact_lineage_event · dim_glossary_term",
      info:"Five strategic health dimensions scored 0-100%: Governance (coverage), Quality (metadata completeness), Freshness (100 minus stale %), Pipeline (job success rate), Stewardship (term adoption). Green>=75%, Amber>=45%, Red<45%."});
    g.appendChild(cr.el);
    cr.body.innerHTML=radarSVG(h);
  }
  function load(){PDC.resetCharts();PDC.el("content").innerHTML='<div class="loading">Loading…</div>';
    PDC.load({h:["headline"],gr:["growth"],tp:["throughput"]}).then(render).catch(function(e){PDC.fail();console.error(e);});}
  load();
})();
