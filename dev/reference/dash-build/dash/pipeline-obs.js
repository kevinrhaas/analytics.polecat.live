// Pipeline & Job Observability — run reliability, throughput, failures, freshness.
(function(){
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  function rows(res,a,b){var ia=res.col(a),ib=res.col(b);return res.rows.map(function(r){return{label:String(r[ia]),value:+r[ib]||0};});}
  function cols(res,a){var i=res.col(a);return res.rows.map(function(r){return String(r[i]);});}
  function vals(res,a){var i=res.col(a);return res.rows.map(function(r){return +r[i]||0;});}

  function render(d){
    var succ=+v(d.kpi,"success_pct")||0;
    PDC.kpis(PDC.el("kpis"),[
      {value:PDC.fmt.abbr(v(d.kpi,"runs")),label:"Runs Launched",state:"purple",info:"Total pipeline/job executions in scope — the throughput of your data-integration layer. The denominator behind the success and failure rates."},
      {value:PDC.fmt.pct(succ),label:"Success Rate",state:succ>=90?"good":succ>=75?"warn":"bad",info:"Share of runs that completed successfully. The headline reliability SLA for the platform — below ~90% means data consumers can't trust freshness."},
      {value:PDC.fmt.n(v(d.kpi,"failures")),label:"Failed / Aborted",state:(+v(d.kpi,"failures")>0?"bad":"good"),info:"Count of runs that failed or were aborted. Each one risks stale or missing downstream data — the operational worklist for DataOps."},
      {value:PDC.fmt.gb(v(d.kpi,"gb")),label:"Data Moved",info:"Total volume (GB) transferred by these runs. Sizes the scale of the integration workload and where throughput concentrates."},
      {value:PDC.fmt.n(v(d.kpi,"jobs")),label:"Distinct Jobs",info:"Number of unique jobs/pipelines observed. A large fleet of jobs is harder to monitor — concentration of failures in a few jobs is the pattern to find."}
    ]);
    var content=PDC.el("content");content.innerHTML="";var g=PDC.grid(3);content.appendChild(g);

    var cc=PDC.card("Pipeline Run Activity Calendar",{pill:"daily events · ⬚ failures ringed",src:"fact_lineage_event · dim_date · cube 79",span:3,info:"A GitHub-style heatmap of daily run volume, with failure days ringed. Spot cadence, gaps (no runs = pipeline down), and clusters of failures at a glance."});g.appendChild(cc.el);
    var cdi=d.cal.col("day"),cei=d.cal.col("events"),cri=d.cal.col("runs"),cfi=d.cal.col("fails");
    PDC.calendar(cc.body,{unit:"events",days:d.cal.rows.map(function(r){return{date:String(r[cdi]),value:+r[cei]||0,runs:+r[cri]||0,fails:+r[cfi]||0};})});

    var c1=PDC.card("Job Success Rate by Month",{pill:"%",src:"fact_lineage_event · cube 79",span:1,info:"Reliability trend over time. A declining line is an early warning that pipeline health is eroding before it becomes a data outage."});g.appendChild(c1.el);
    PDC.line(c1.body,{labels:cols(d.st,"month"),fmt:function(x){return x+"%";},min0:false,series:[{name:"Success %",values:vals(d.st,"success_pct")}]});

    var c2=PDC.card("Run Volume by Month",{pill:"runs",src:"fact_lineage_event · cube 79",info:"How execution volume changes month to month. Growth means rising integration load; a sudden drop can indicate a scheduler or upstream problem."});g.appendChild(c2.el);
    PDC.line(c2.body,{labels:cols(d.rv,"month"),area:true,fmt:PDC.fmt.abbr,series:[{name:"Runs",values:vals(d.rv,"runs")}]});

    var c3=PDC.card("Event Lifecycle Mix",{pill:"events",src:"dim_lineage_event_type · cube 79",info:"Breakdown of run-lifecycle events (START / RUNNING / COMPLETE / ABORT / FAIL). A healthy mix is COMPLETE-dominant; rising ABORT/FAIL shares flag instability."});g.appendChild(c3.el);
    var li=d.lc.col("type"),lv=d.lc.col("events");
    PDC.donut(c3.body,{centerCap:"Events",fmt:PDC.fmt.abbr,data:d.lc.rows.map(function(r){var t=String(r[li]);
      var col=/Complete/i.test(t)?PDC.cssvar("--good"):/Fail|Abort/i.test(t)?PDC.cssvar("--bad"):/Start|Running/i.test(t)?PDC.cssvar("--info"):PDC.cssvar("--text-faint");
      return{label:t,value:+r[lv]||0,color:col};})});

    var c4=PDC.card("Success Rate by Integration",{pill:"%",src:"fact_lineage_event · cube 79",info:"Reliability per integration tool/connector. Low-scoring integrations are the weak links — where to focus hardening and on-call attention."});g.appendChild(c4.el);
    PDC.bars(c4.body,{horizontal:true,labelW:120,fmt:function(x){return x+"%";},data:rows(d.bi,"integ","success_pct")});

    var c5=PDC.card("Failed & Aborted Runs by Integration",{pill:"failures",src:"fact_lineage_event · cube 79",info:"Absolute failure counts per integration. Pairs with success-rate: a high rate can still hide many failures if volume is large. Ranks remediation by raw impact."});g.appendChild(c5.el);
    PDC.bars(c5.body,{horizontal:true,labelW:120,color:PDC.cssvar("--bad"),fmt:PDC.fmt.n,data:rows(d.bi,"integ","failures")});

    var c6=PDC.card("Top Failing Jobs",{pill:"blast radius",src:"fact_lineage_event · cube 79",sub:"click a job → its failed runs",info:"The individual jobs failing most often — your fix-first list. Failures here cascade to every downstream dataset. Click a job to see its actual failed runs."});g.appendChild(c6.el);
    var integ6=PDC.filterState.integration||"%", fromkey6=PDC.fromkey(PDC.filterState.range||"0");
    function fmtDay(x){x=String(x||"");return x.length===8?(x.slice(0,4)+"-"+x.slice(4,6)+"-"+x.slice(6,8)):x;}
    // click a failing job → drawer of its ACTUAL failed/aborted run events (one row per failed run)
    var failDetail={da:"detail_failed_runs",param:"job",params:{integration:integ6,fromkey:fromkey6},noun:"failed runs",
      title:function(job){return PDC.fmt.trunc(job,48)+" — failed runs";},
      subtitle:"every failed or aborted run event for this job"+(integ6!=="%"?(" · "+integ6):""),
      cols:[
        {key:"run_id",label:"Run ID",title:true,fmt:function(x){return PDC.fmt.trunc(x,30);}},
        {key:"event",label:"Event"},
        {key:"day",label:"Date",fmt:fmtDay},
        {key:"integration",label:"Integration",fmt:function(x){return PDC.fmt.trunc(x,16);}},
        {key:"namespace",label:"Namespace",fmt:function(x){return PDC.fmt.trunc(x,28);}},
        {key:"records",label:"Records",num:true,fmt:function(x){return (+x||0).toLocaleString();}}],
      drill:{to:"i-data-flows",param:"integration",value:(integ6!=="%"?integ6:null),label:"Open Data Movement Flows"}};
    PDC.bars(c6.body,{horizontal:true,labelW:170,labelChars:26,color:PDC.cssvar("--bad"),fmt:PDC.fmt.n,data:rows(d.fbj,"job","failures"),detail:failDetail});

    var ct=PDC.card("Job → Dataset Blast-Radius Topology",{pill:"top jobs · ⬤ red = has failures · hover to isolate",src:"fact_lineage_connection · fact_lineage_event · cube 79/80",span:3,info:"Network of jobs to the datasets they write, red nodes = jobs with failures. Shows the blast radius: how many downstream datasets a failing job puts at risk. Hover a node to isolate it."});g.appendChild(ct.el);
    var tji=d.top.col("job"),tdi=d.top.col("dest"),tbi=d.top.col("bytes"),tci=d.top.col("conns"),tfi=d.top.col("fails");
    var destSet={},failJob={};
    d.top.rows.forEach(function(r){destSet[String(r[tdi])]=1; if((+r[tfi]||0)>0)failJob[String(r[tji])]=1;});
    var tlinks=d.top.rows.map(function(r){return{source:String(r[tji]),target:String(r[tdi]),value:+r[tbi]||0,conns:+r[tci]||0};});
    PDC.network(ct.body,{links:tlinks,height:430,fmt:PDC.fmt.gb,caption:"hover to isolate · click a job for its failed runs",
      color:function(name){return destSet[name]?PDC.cssvar("--pdc"):failJob[name]?PDC.cssvar("--bad"):PDC.cssvar("--good");},
      // click a JOB node → its actual failed/aborted runs (reuses failDetail; count IS rows). Dataset nodes have no per-node drill.
      detail:function(node){return destSet[node]?null:failDetail;}});

    var cfr=PDC.card("Failure Rate Trend by Integration",{pill:"% failed or aborted · all integrations · lower is better",src:"fact_lineage_event · dim_date · dim_lineage_job",span:3,info:"Month-by-month failure rate (%) per integration tool — lower is better. Reveals which integrations are improving reliability over time, which are degrading, and whether reliability programs are working uniformly or only for some connectors."});g.appendChild(cfr.el);
    if(d.frt&&d.frt.rows.length){
      var frtMi=d.frt.col("month"),frtIi=d.frt.col("integration"),frtRi=d.frt.col("failure_rate");
      var frtMonths=[],frtSrcMap={};
      d.frt.rows.forEach(function(r){var m=String(r[frtMi]),intg=String(r[frtIi]),rate=+r[frtRi]||0;if(frtMonths.indexOf(m)<0)frtMonths.push(m);if(!frtSrcMap[intg])frtSrcMap[intg]={};frtSrcMap[intg][m]=rate;});
      frtMonths.sort();
      var frtSeries=Object.keys(frtSrcMap).map(function(intg,i){
        var values=frtMonths.map(function(m){return frtSrcMap[intg][m]!==undefined?frtSrcMap[intg][m]:null;});
        return{name:intg,values:values,color:PDC.color(i)};});
      PDC.line(cfr.body,{area:false,fmt:function(v){return v+"%";},min0:true,labels:frtMonths,series:frtSeries});
    }

    var c7=PDC.card("Slowest PDI Pipelines",{pill:"runtime",src:"fact_pipeline_run · cube 76",span:3,info:"Longest-running PDI transformations/jobs by runtime. Slow pipelines delay data freshness and consume compute — the tuning shortlist for performance gains."});g.appendChild(c7.el);
    var ji=d.slow.col("job"),si=d.slow.col("avg_secs"),ri=d.slow.col("runs"),pi=d.slow.col("success_pct");
    PDC.table(c7.body,{cols:[
      {label:"Pipeline / View",title:true,fmt:function(x){return PDC.fmt.trunc(x,46);}},
      {label:"Avg Runtime (s)",num:true,bar:true,fmt:function(x){return PDC.fmt.n(Math.round(x));}},
      {label:"Runs",num:true,fmt:PDC.fmt.n},
      {label:"Success",num:true,badge:function(x){x=+x||0;return x>=90?{cls:"green",text:x+"%"}:x>=75?{cls:"warn",text:x+"%"}:{cls:"bad",text:x+"%"};}}],
      rows:d.slow.rows.map(function(r){return[r[ji],+r[si]||0,+r[ri]||0,+r[pi]||0];})});
  }

  function load(){
    var integ=PDC.filterState.integration||"%", fromkey=PDC.fromkey(PDC.filterState.range||"0");
    PDC.resetCharts();PDC.el("content").innerHTML='<div class="loading">Loading…</div>';
    var pp={integration:integ,fromkey:fromkey};
    PDC.load({kpi:["kpi",pp],st:["success_trend",pp],rv:["run_volume",pp],lc:["lifecycle",pp],cal:["run_calendar",pp],
      bi:["by_integration",{fromkey:fromkey}],fbj:["failures_by_job",pp],top:["job_topology",pp],frt:["failure_rate_trend",{fromkey:fromkey}],slow:["slowest"]}).then(render).catch(function(e){PDC.fail();console.error(e);});
  }
  PDC.cda("integrations").then(function(r){
    var opts=[{v:"%",t:"All integrations"}].concat(r.rows.map(function(x){return{v:x[0],t:x[0]};}));
    PDC.filters([{id:"range",label:"Time Range",options:PDC.TIME_RANGE,def:"0"},{id:"integration",label:"Integration",options:opts,def:"%"}],load);load();
  }).catch(function(){PDC.filters([{id:"range",label:"Time Range",options:PDC.TIME_RANGE,def:"0"}],load);load();});
})();
