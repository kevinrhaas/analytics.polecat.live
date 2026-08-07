// Toolkit self-test: render every chart type with mock data (no CDA).
(function(){
  var months=["Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun"];
  var integ=["Snowflake","Kafka","dbt","Spark","PDI","Airflow","Fivetran"];
  PDC.kpis(PDC.el("kpis"),[
    {value:"16.7 TB",label:"Data Moved",state:"",delta:1,deltaText:"8% MoM",spark:[3,4,4,5,6,6,7,8,9,9,11,13]},
    {value:"92.2%",label:"Success Rate",state:"good",delta:1,deltaText:"1.2 pts",spark:[88,89,90,90,91,92,92]},
    {value:"8,230",label:"Runs",state:"",delta:-1,deltaText:"3% WoW"},
    {value:"24",label:"Restricted → Ungoverned",state:"bad"},
    {value:"7,440",label:"Cross-Boundary",state:"warn"},
    {value:"15,549",label:"Assets",state:"purple"}
  ]);
  var content=PDC.el("content"); content.innerHTML="";
  var g=PDC.grid(2); content.appendChild(g);

  var c1=PDC.card("Vertical bars",{pill:"bar"}); g.appendChild(c1.el);
  PDC.bars(c1.body,{data:integ.map(function(n,i){return{label:n,value:[4636,3627,1901,1735,1221,174,74][i]};}),rotate:true,fmt:PDC.fmt.gb});

  var c2=PDC.card("Horizontal bars",{pill:"bar"}); g.appendChild(c2.el);
  PDC.bars(c2.body,{horizontal:true,data:integ.map(function(n,i){return{label:n+" pipeline",value:[4636,3627,1901,1735,1221,174,74][i]};}),fmt:PDC.fmt.gb});

  var c3=PDC.card("Line + area trend",{pill:"line"}); g.appendChild(c3.el);
  PDC.line(c3.body,{labels:months,area:true,fmt:PDC.fmt.gb,series:[{name:"GB Moved",values:[820,910,1040,1180,1260,1390,1450,1600,1720,1810,1990,2200]}]});

  var c4=PDC.card("Multi-line",{pill:"line"}); g.appendChild(c4.el);
  PDC.line(c4.body,{labels:months,series:[
    {name:"Started",values:[600,620,640,660,700,720,740,760,780,800,820,860]},
    {name:"Completed",values:[560,580,600,620,660,680,700,720,740,760,780,820]},
    {name:"Failed",values:[40,40,40,40,40,40,40,40,40,40,40,40]}]});

  var c5=PDC.card("Donut",{pill:"donut"}); g.appendChild(c5.el);
  PDC.donut(c5.body,{centerCap:"Connections",data:[
    {label:"Internal",value:5370,color:PDC.cssvar("--sev1")},
    {label:"Confidential",value:3430,color:PDC.cssvar("--sev2")},
    {label:"Restricted",value:681,color:PDC.cssvar("--sev3")}]});

  var c6=PDC.card("Gauges",{pill:"gauge"}); g.appendChild(c6.el);
  var gg=document.createElement("div");gg.style.display="grid";gg.style.gridTemplateColumns="1fr 1fr";c6.body.appendChild(gg);
  var ga=document.createElement("div"),gb=document.createElement("div");gg.appendChild(ga);gg.appendChild(gb);
  PDC.gauge(ga,{value:92.2,max:100,unit:"%",label:"Success Rate",height:170});
  PDC.gauge(gb,{value:63,max:100,unit:"%",label:"Governed",height:170});

  var c7=PDC.card("Stacked bars",{pill:"stacked",span:2}); g.appendChild(c7.el);
  PDC.stacked(c7.body,{categories:integ,rotate:true,series:[
    {name:"Completed",values:[800,700,600,500,400,300,200]},
    {name:"Failed",values:[40,60,30,50,70,20,10]},
    {name:"Aborted",values:[10,20,5,15,25,5,2]}]});

  var c8=PDC.card("Heatmap",{pill:"matrix",span:1}); g.appendChild(c8.el);
  PDC.heatmap(c8.body,{labelW:90,showVals:true,fmt:PDC.fmt.n,rows:["Restricted","Confidential","Internal"],cols:["Governed","Ungoverned"],
    matrix:[[658,23],[3273,157],[5370,0]]});

  var c9=PDC.card("Treemap",{pill:"treemap"}); g.appendChild(c9.el);
  PDC.treemap(c9.body,{height:280,fmt:PDC.fmt.gb,data:integ.map(function(n,i){return{label:n,value:[4636,3627,1901,1735,1221,174,74][i]};})});

  var c10=PDC.card("Scatter / bubble",{pill:"scatter"}); g.appendChild(c10.el);
  PDC.scatter(c10.body,{xLabel:"Storage TB",yLabel:"Completeness %",rLabel:"assets",points:[
    {x:120,y:88,r:400,label:"AWS"},{x:80,y:72,r:250,label:"Azure"},{x:200,y:95,r:600,label:"Snowflake"},
    {x:40,y:55,r:120,label:"MSSQL"},{x:160,y:80,r:300,label:"Postgres"}]});

  var c11=PDC.card("Data table",{pill:"table",span:2}); g.appendChild(c11.el);
  PDC.table(c11.body,{cols:[
    {label:"Integration"},{label:"GB Moved",num:true,bar:true,fmt:PDC.fmt.gb},
    {label:"Success",num:true,fmt:function(v){return v+"%";}},
    {label:"Status",badge:function(v){return v>=90?{cls:"green",text:"Healthy"}:{cls:"warn",text:"Watch"};}}],
    rows:integ.map(function(n,i){return [n,[4636,3627,1901,1735,1221,174,74][i],[97,91,97,90,87,94,93][i],[97,91,97,90,87,94,93][i]];})});
})();
