// Cost Optimization & Sustainability.
(function(){
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  function rows(res,a,b){var ia=res.col(a),ib=res.col(b);return res.rows.map(function(r){return{label:String(r[ia]),value:+r[ib]||0};});}
  function sevColor(s){return /high|restrict/i.test(s)?PDC.cssvar("--sev3"):/medium|confiden/i.test(s)?PDC.cssvar("--sev2"):/low|internal/i.test(s)?PDC.cssvar("--info"):PDC.cssvar("--text-faint");}
  function render(d){
    PDC.kpis(PDC.el("kpis"),[
      {value:PDC.fmt.money(v(d.kpi,"monthly")),label:"Monthly Cost",state:"purple",info:"Estimated monthly storage spend for all in-scope objects: each object's size × its source's per-TB rate. The recurring bill to keep this data online."},
      {value:PDC.fmt.money(v(d.kpi,"annual")),label:"Annualized",info:"Monthly cost projected over 12 months — the run-rate you can quote in a budget or compare against an optimization target."},
      {value:(v(d.kpi,"co2e_tonnes")||0)+" t",label:"CO2e / yr",state:"warn",info:"Estimated annual carbon footprint (tonnes CO2e) of storing this data: footprint TB × an energy-intensity factor (10 kg CO2e/TB/yr). Feeds sustainability/ESG reporting."}
    ]);
    var content=PDC.el("content");content.innerHTML="";var g=PDC.grid(3);content.appendChild(g);
    var sens=PDC.filterState.sens||"%";
    // click a source (bar or treemap tile) → drawer of the ACTUAL costed assets behind that spend
    var costDetail={da:"detail_costed",param:"src",params:{sens:sens},noun:"assets",
      title:function(src){return src+" — costed assets";},
      subtitle:"every billed object in this source"+(sens!=="%"?(" · "+sens):""),
      cols:[
        {key:"name",label:"Object",title:true,fmt:function(x){return PDC.fmt.trunc(x,40);}},
        {key:"monthly_usd",label:"$/mo",num:true,fmt:function(x){return "$"+(+x||0).toLocaleString();}},
        {key:"gb",label:"GB",num:true,fmt:function(x){return (+x||0).toLocaleString();}},
        {key:"co2e_kg",label:"CO2e kg",num:true,fmt:function(x){return (+x||0).toLocaleString();}},
        {key:"sensitivity",label:"Sensitivity"},
        {key:"owner",label:"Owner",fmt:function(x){return PDC.fmt.trunc(x,20);}}],
      drill:{to:"pdc-storage",param:"ds",label:"Open Storage for this source"}};
    var c1=PDC.card("Monthly Cost by Data Source",{pill:"$",src:"fact_entity_snapshot × dim_entity.cost_per_tb_usd",sub:"click a bar → its assets",info:"Monthly storage spend attributed to each connected source (size × per-TB rate). Shows where the budget goes and which platforms are the biggest cost levers."});g.appendChild(c1.el);
    PDC.bars(c1.body,{horizontal:true,labelW:150,fmt:PDC.fmt.money,data:rows(d.cs,"src","cost"),detail:costDetail});
    var c2=PDC.card("Cost by Sensitivity",{pill:"$",src:"fact_entity_snapshot × dim_entity",info:"Splits spend across sensitivity tiers (HIGH/MEDIUM/LOW). High spend on highly-sensitive data flags where protection controls — and cost — concentrate."});g.appendChild(c2.el);
    PDC.donut(c2.body,{centerCap:"$/mo",fmt:PDC.fmt.money,data:rows(d.cse,"sens","cost").map(function(x){x.color=sevColor(x.label);return x;})});
    var c4=PDC.card("Cost Treemap by Source",{pill:"$",src:"fact_entity_snapshot × dim_entity.cost_per_tb_usd",span:2,sub:"click a tile → its assets",info:"Same per-source spend as the bar chart, sized by cost — tile area ∝ $/mo. A fast visual read of which sources dominate the bill."});g.appendChild(c4.el);
    PDC.treemap(c4.body,{height:300,fmt:PDC.fmt.money,data:rows(d.cs,"src","cost"),detail:costDetail});
    var c5=PDC.card("Carbon (CO2e) by Source",{pill:"tonnes",src:"fact_entity_snapshot.bytes × 10 kg/TB/yr",info:"Estimated annual CO2e of each source's footprint (footprint TB × 10 kg CO2e/TB/yr). Surfaces the storage decisions with the largest environmental impact for ESG/sustainability goals."});g.appendChild(c5.el);
    PDC.bars(c5.body,{horizontal:true,labelW:150,fmt:function(x){return x+" t";},color:PDC.cssvar("--c3"),data:rows(d.co,"src","tonnes")});
    // Cumulative spend growth — running monthly_cost_usd over the month each asset was first scanned (mirrors the storage footprint-growth trend)
    var c6=PDC.card("Cloud Spend Growth",{pill:"cumulative $ · month",src:"fact_entity_snapshot × dim_entity + first scan · dim_date",span:3,info:"Cumulative monthly spend over time, bucketed by the month each object was first discovered. The slope is your cost-growth rate — steep slopes forecast budget pressure."});g.appendChild(c6.el);
    PDC.line(c6.body,{area:true,fmt:PDC.fmt.money,labels:d.gr.rows.map(function(r){return r[d.gr.col("month")];}),
      series:[{name:"Cumulative $/mo",values:d.gr.rows.map(function(r){return +r[d.gr.col("cum_cost")]||0;}),color:PDC.cssvar("--pdc")}]});
    // Cost vs Governance bubble — first deployment of PDC.scatter; reveals expensive-yet-ungoverned sources
    var c7=PDC.card("Cost vs. Governance Coverage",{span:3,pill:"bubble",src:"fact_entity_snapshot × cost_per_tb_usd + governed_entity_count",info:"Each bubble is one data platform: x = monthly storage cost, y = governance coverage %, size = entity count. Bubbles toward the bottom-right (expensive + ungoverned) are the highest-priority remediation targets — you are paying for data that is not yet governed."});g.appendChild(c7.el);
    PDC.scatter(c7.body,{height:300,xLabel:"Monthly Cost ($)",yLabel:"Governance %",rLabel:"entities",
      fmtX:PDC.fmt.money,fmtY:function(v){return v+"%";},
      points:d.cgs.rows.map(function(r,i){
        return {label:String(r[d.cgs.col("src")]||""),x:+r[d.cgs.col("monthly_cost")]||0,y:+r[d.cgs.col("gov_pct")]||0,r:+r[d.cgs.col("entity_count")]||0,color:PDC.color(i)};
      })});
    // Cost by Source Over Time — cumulative monthly $/mo per top-8 platform (multi-line)
    var c8=PDC.card("Cost by Source Over Time",{pill:"cumulative $/mo \xb7 top 8 platforms",src:"fact_entity_snapshot + first scan \xb7 dim_date \xb7 dim_datasource",span:3,info:"Cumulative spend trajectory for the 8 largest data platforms, month by month. Reveals which sources are driving cost growth — steep slopes signal rapid data onboarding or expanding footprint."});g.appendChild(c8.el);
    if(d.cst&&d.cst.rows.length){
      var cstYmi=d.cst.col("ym"),cstMni=d.cst.col("month"),cstSrci=d.cst.col("src"),cstCi=d.cst.col("cum_cost");
      var cstMonthNums=[],cstMonthNames={},cstSrcMap={};
      d.cst.rows.forEach(function(r){var ym=String(r[cstYmi]),mn=String(r[cstMni]);if(cstMonthNums.indexOf(ym)<0){cstMonthNums.push(ym);cstMonthNames[ym]=mn;}});
      cstMonthNums.sort();
      d.cst.rows.forEach(function(r){var src=String(r[cstSrci]),ym=String(r[cstYmi]),cost=+r[cstCi]||0;if(!cstSrcMap[src])cstSrcMap[src]={};cstSrcMap[src][ym]=cost;});
      var cstLabels=cstMonthNums.map(function(ym){return cstMonthNames[ym];});
      var cstSeries=Object.keys(cstSrcMap).map(function(src,i){
        var values=cstMonthNums.map(function(ym){return cstSrcMap[src][ym]!==undefined?cstSrcMap[src][ym]:null;});
        return{name:src,values:values,color:PDC.color(i)};});
      PDC.line(c8.body,{area:false,fmt:PDC.fmt.money,labels:cstLabels,series:cstSeries});
    }
  }
  function load(){var ds=PDC.filterState.ds||"%",sens=PDC.filterState.sens||"%";PDC.resetCharts();PDC.el("content").innerHTML='<div class="loading">Loading…</div>';
    var p={ds:ds,sens:sens};
    // cse = "Cost by Sensitivity" breakdown — responds to source only, NOT to the sensitivity filter (filtering a by-sensitivity chart to one tier is degenerate)
    PDC.load({kpi:["kpi",p],cs:["cost_by_source",p],cse:["cost_by_sens",{ds:ds}],co:["co2e_by_source",p],gr:["cost_trend",p],cgs:["cost_gov_scatter",p],cst:["cost_by_src_trend",p]}).then(render).catch(function(e){PDC.fail();console.error(e);});}
  Promise.all([PDC.cda("datasources"),PDC.cda("sensitivities")]).then(function(res){
    var dsOpts=[{v:"%",t:"All sources"}].concat(res[0].rows.map(function(x){return{v:x[0],t:x[0]};}));
    var snOpts=[{v:"%",t:"All sensitivities"}].concat(res[1].rows.map(function(x){return{v:x[0],t:x[0]};}));
    PDC.filters([{id:"ds",label:"Data Source",options:dsOpts,def:"%"},{id:"sens",label:"Sensitivity",options:snOpts,def:"%"}],load);load();
  }).catch(function(){PDC.filters([{id:"ds",label:"Data Source",options:[{v:"%",t:"All sources"}]},{id:"sens",label:"Sensitivity",options:[{v:"%",t:"All sensitivities"}]}],load);load();});
})();
