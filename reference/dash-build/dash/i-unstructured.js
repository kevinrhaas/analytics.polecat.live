// Document & Unstructured Insights — files, extensions, folders across the estate.
(function(){
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  function rows(res,a,b){var ia=res.col(a),ib=res.col(b);return res.rows.map(function(r){return{label:String(r[ia]),value:+r[ib]||0};});}
  function render(d){
    PDC.kpis(PDC.el("kpis"),[
      {value:PDC.fmt.abbr(v(d.kpi,"files")),label:"File Assets",state:"purple",info:"Catalog objects of type FILE (documents, images, logs, exports…) — the unstructured-data population, as opposed to tables and columns."},
      {value:PDC.fmt.n(v(d.kpi,"folders")),label:"Folders",info:"Distinct folders / directories the file assets live in — the organizational structure of your unstructured estate."},
      {value:PDC.fmt.n(v(d.kpi,"extensions")),label:"File Extensions",info:"Number of distinct file extensions seen (.csv, .pdf, .parquet…) — the variety of file formats in the catalog."},
      {value:PDC.fmt.abbr(v(d.kpi,"scanned_files")),label:"Files Scanned",info:"File assets the catalog has actually profiled/scanned — a coverage check on the unstructured estate."}
    ]);
    var content=PDC.el("content");content.innerHTML="";var g=PDC.grid(3);content.appendChild(g);
    // click an extension (bar or treemap tile) → drawer of the ACTUAL files of that type
    var extDetail={da:"detail_files_by_ext",param:"ext",noun:"files",
      title:function(x){return x+" files";},
      subtitle:"individual file assets of this type (up to 500)",
      cols:[
        {key:"name",label:"File",title:true,fmt:function(x){return PDC.fmt.trunc(x,46);}},
        {key:"src",label:"Source",fmt:function(x){return PDC.fmt.trunc(x,16);}},
        {key:"owner",label:"Owner",fmt:function(x){return PDC.fmt.trunc(x,18);}},
        {key:"sensitivity",label:"Sensitivity"}],
      drill:{to:"pdc-storage",param:"ds",label:"Open Storage"}};
    var c1=PDC.card("Files by Extension",{pill:"files · click → files",src:"fact_extension_daily · cube 77",span:1,info:"File count per extension — which formats dominate your unstructured data (and which may need special governance or parsing). Click a bar to list the actual files of that type."});g.appendChild(c1.el);
    PDC.bars(c1.body,{horizontal:true,labelW:90,fmt:PDC.fmt.abbr,detail:extDetail,data:rows(d.be,"ext","files")});
    var c2=PDC.card("File Type Treemap",{pill:"files · click → files",src:"fact_extension_daily · cube 77",span:1,info:"The same per-extension file counts shown as proportional tiles — a quick visual of your format mix; the biggest tiles are the dominant file types. Click a tile for its files."});g.appendChild(c2.el);
    PDC.treemap(c2.body,{height:260,fmt:PDC.fmt.abbr,detail:extDetail,data:rows(d.be,"ext","files")});
    var c3=PDC.card("File Assets by Source",{pill:"files",src:"dim_entity.entity_type=FILE · cube 71",info:"How file assets split across connected sources — which platforms (object stores, file shares…) hold the most unstructured data."});g.appendChild(c3.el);
    PDC.donut(c3.body,{centerCap:"Files",fmt:PDC.fmt.abbr,data:rows(d.bs,"src","files").map(function(x,i){x.color=PDC.color(i);return x;})});
    var c4=PDC.card("Unstructured Scan Volume Trend",{pill:"files / month",src:"fact_extension_daily · cube 77",span:3,info:"Files scanned per month — the discovery rate of unstructured data over time. Rising volume signals growing file sprawl to keep governed."});g.appendChild(c4.el);
    PDC.line(c4.body,{area:true,fmt:PDC.fmt.abbr,labels:d.tr.rows.map(function(r){return String(r[d.tr.col("month")]);}),series:[{name:"Files Scanned",values:d.tr.rows.map(function(r){return +r[d.tr.col("files")]||0;})}]});
  }
  PDC.resetCharts();
  PDC.load({kpi:["kpi"],be:["by_extension"],bs:["by_source"],tr:["trend"]}).then(render).catch(function(e){PDC.fail();console.error(e);});
})();
