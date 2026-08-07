// Schema & Structure Explorer — structured assets: schemas, tables, columns, types, keys.
(function(){
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  function rows(res,a,b){var ia=res.col(a),ib=res.col(b);return res.rows.map(function(r){return{label:String(r[ia]),value:+r[ib]||0};});}
  function render(d){
    PDC.kpis(PDC.el("kpis"),[
      {value:PDC.fmt.abbr(v(d.kpi,"structured_assets")),label:"Structured Assets",state:"purple",info:"Catalog objects that are structured — schemas, tables and columns (as opposed to files). The relational/tabular side of the estate."},
      {value:PDC.fmt.n(v(d.kpi,"schemas")),label:"Schemas",info:"Distinct schemas / namespaces containing tables — the top-level structural grouping in your databases."},
      {value:PDC.fmt.n(v(d.kpi,"tables")),label:"Tables",info:"Distinct tables (and views) discovered across all connected sources."},
      {value:PDC.fmt.abbr(v(d.kpi,"columns")),label:"Columns",info:"Total columns across all tables — the finest grain of the structured catalog."}
    ]);
    var content=PDC.el("content");content.innerHTML="";var g=PDC.grid(3);content.appendChild(g);
    var c1=PDC.card("Catalog Composition",{pill:"assets",src:"dim_entity.entity_type · cube 71",info:"All catalog assets split by type (schema, table, column, file…) — the structural makeup of what's under management."});g.appendChild(c1.el);
    PDC.donut(c1.body,{centerCap:"Assets",fmt:PDC.fmt.abbr,data:rows(d.bt,"etype","n").map(function(x,i){x.color=PDC.color(i);return x;})});
    var c2=PDC.card("Column Data Types",{pill:"columns",src:"dim_entity.column_data_type · cube 71",info:"Columns grouped by declared data type (VARCHAR, BIGINT, DATE…) — the type profile of your structured data. Use the Data Source filter to focus one platform."});g.appendChild(c2.el);
    PDC.bars(c2.body,{horizontal:true,labelW:110,fmt:PDC.fmt.abbr,data:rows(d.dt,"dt","n")});
    var c3=PDC.card("Key Coverage",{pill:"columns",src:"dim_entity is_primary/foreign_key",info:"Columns split by key role — primary key, foreign key, or neither. More keys means better-modeled, more joinable tables; few keys can signal under-modeled data."});g.appendChild(c3.el);
    PDC.donut(c3.body,{centerCap:"Columns",fmt:PDC.fmt.abbr,data:rows(d.ky,"k","n").map(function(x){x.color=/Primary/.test(x.label)?PDC.cssvar("--good"):/Foreign/.test(x.label)?PDC.cssvar("--pentaho"):PDC.cssvar("--text-faint");return x;})});
    // click a schema bar → drawer of every column in that schema (table · type · cardinality · rows)
    var schemaDetail={da:"detail_schema_columns",param:"schema",noun:"columns",
      title:function(s){return s+" — columns";},
      subtitle:"every column in this schema, with its table, type, cardinality and row count",
      cols:[
        {key:"tbl",label:"Table",title:true,fmt:function(x){return PDC.fmt.trunc(x,26);}},
        {key:"col",label:"Column",fmt:function(x){return PDC.fmt.trunc(x,26);}},
        {key:"dtype",label:"Type"},
        {key:"cardinality",label:"Cardinality",num:true,fmt:PDC.fmt.abbr},
        {key:"row_count",label:"Rows",num:true,fmt:PDC.fmt.abbr}]};
    var c4=PDC.card("Largest Schemas by Columns",{pill:"columns · click → its columns",src:"dim_entity.structured_schema · cube 71",span:2,info:"Schemas ranked by total column count — your biggest and most structurally complex areas, where modeling and documentation effort concentrates. Click a bar to list every column in that schema."});g.appendChild(c4.el);
    PDC.bars(c4.body,{horizontal:true,labelW:230,labelChars:38,fmt:PDC.fmt.abbr,color:PDC.cssvar("--pdc"),detail:schemaDetail,data:rows(d.ts,"schema","cols")});
    var c5=PDC.card("Schema Detail",{pill:"structure",src:"dim_entity · cube 71",info:"Per-schema table and column counts as a ranked table — the detail behind the largest-schemas chart."});g.appendChild(c5.el);
    var si=d.ts.col("schema"),ci=d.ts.col("cols"),ti=d.ts.col("tables");
    PDC.table(c5.body,{cols:[{label:"Schema",title:true,fmt:function(x){return PDC.fmt.trunc(x,30);}},
      {label:"Tables",num:true,fmt:PDC.fmt.n},{label:"Columns",num:true,bar:true,fmt:PDC.fmt.n}],
      rows:d.ts.rows.map(function(r){return[r[si],+r[ti]||0,+r[ci]||0];})});

    // Schema Discovery Growth — cumulative tables & columns cataloged by month
    var cg=PDC.card("Schema Discovery Growth",{pill:"cumulative · tables &amp; columns",src:"fact_entity_snapshot · dim_entity · dim_date · cube 71",span:3,
      info:"Cumulative tables and columns discovered by month — when did schema objects first enter the catalog? A steep climb marks a large source onboarding; a plateau means no new objects cataloged that month. Filters scope the timeline to one source or schema."});g.appendChild(cg.el);
    var gyi=d.sg.col("ym"),gti=d.sg.col("total_tables"),gci=d.sg.col("total_cols");
    PDC.line(cg.body,{labels:d.sg.rows.map(function(r){return String(r[gyi]);}),area:false,fmt:PDC.fmt.abbr,
      series:[{name:"Tables",values:d.sg.rows.map(function(r){return +r[gti]||0;}),color:PDC.cssvar("--pdc")},
              {name:"Columns",values:d.sg.rows.map(function(r){return +r[gci]||0;}),color:PDC.cssvar("--pdc2")}]});
  }
  function load(){var ds=PDC.filterState.ds||"%",sc=PDC.filterState.schema||"%";PDC.resetCharts();PDC.el("content").innerHTML='<div class="loading">Loading…</div>';
    // Data Source + Schema cross-filter the asset/type/data-type panels; schema ranking + key mix stay estate-wide
    PDC.load({kpi:["kpi",{ds:ds,schema:sc}],bt:["by_type",{ds:ds,schema:sc}],dt:["data_types",{ds:ds,schema:sc}],ts:["top_schemas"],ky:["keys"],sg:["schema_growth",{ds:ds,schema:sc}]}).then(render).catch(function(e){PDC.fail();console.error(e);});}
  Promise.all([PDC.cda("datasources"),PDC.cda("schemas")]).then(function(res){
    var opts=[{v:"%",t:"All sources"}].concat(res[0].rows.map(function(x){return{v:x[0],t:x[0]};}));
    var scOpts=[{v:"%",t:"All schemas"}].concat(res[1].rows.map(function(x){return{v:x[0],t:x[0]};}));
    PDC.filters([{id:"ds",label:"Data Source",options:opts,def:"%"},{id:"schema",label:"Schema",options:scOpts,def:"%"}],load);load();
  }).catch(function(){PDC.filters([{id:"ds",label:"Data Source",options:[{v:"%",t:"All sources"}]},{id:"schema",label:"Schema",options:[{v:"%",t:"All schemas"}]}],load);load();});
})();
