// Column Health & Key Discovery — actionable column-level structure profiling:
// key-candidate detection (cardinality≈rows), dead/constant columns, type mix.
(function(){
  function v(res,n){return (res.rows[0]||[])[res.col(n)];}
  function rows(res,a,b){var ia=res.col(a),ib=res.col(b);return res.rows.map(function(r){return{label:String(r[ia]),value:+r[ib]||0};});}
  // pivot long-form (row-key, col-key, value) into {rows, cols, matrix}; rows sorted by row total desc
  function pivotSorted(res,rk,ck,vk){
    var ri=res.col(rk),ci=res.col(ck),vi=res.col(vk),R=[],C=[];
    res.rows.forEach(function(r){if(R.indexOf(String(r[ri]))<0)R.push(String(r[ri]));if(C.indexOf(String(r[ci]))<0)C.push(String(r[ci]));});
    var m=R.map(function(){return C.map(function(){return 0;});});
    res.rows.forEach(function(r){m[R.indexOf(String(r[ri]))][C.indexOf(String(r[ci]))]=+r[vi]||0;});
    var totals=m.map(function(row){return row.reduce(function(s,v){return s+v;},0);});
    var idx=R.map(function(_,i){return i;}).sort(function(a,b){return totals[b]-totals[a];});
    return{rows:idx.map(function(i){return R[i];}),cols:C,matrix:idx.map(function(i){return m[i];}),totals:idx.map(function(i){return totals[i];})};
  }
  // per-bucket color fill (pct = v / rowTotal)
  function hbtFill(v,max,pct,colIdx){
    if(v<=0) return 'var(--panel-subtle-bg)';
    if(colIdx===0) return pct>.5?'#16a085':pct>.15?'#27ae60':'#d5f5e3';  // Key: green
    if(colIdx===1) return pct>.3?'#2471a3':pct>.1?'#3498db':'#d6eaf8';   // High: blue
    if(colIdx===2) return pct>.6?'#6c7a89':pct>.3?'#95a5a6':'#eaecee';   // Low: gray
    return pct>.1?'#c0392b':pct>.02?'#e67e22':'#fde8e8';                  // Dead: red
  }
  var BUCKET_LABELS={'1-Key':'Unique/Key','2-High':'High Card.','3-Low':'Low/Normal','4-Dead':'Dead/Const.'};
  var BUCKET_TIPS={'1-Key':'cardinality ≈ rows — key candidate','2-High':'cardinality ≥ 50% of rows — high diversity','3-Low':'cardinality < 50% of rows — normal/categorical','4-Dead':'cardinality = 1 — constant, zero information'};
  function bucketColor(s){return /Unique|key/i.test(s)?PDC.cssvar("--good"):/High/i.test(s)?PDC.cssvar("--pdc"):/Constant|dead/i.test(s)?PDC.cssvar("--bad"):PDC.cssvar("--c2");}
  function render(d){
    PDC.kpis(PDC.el("kpis"),[
      {value:PDC.fmt.abbr(v(d.kpi,"cols")),label:"Profiled Columns",state:"purple",info:"Columns the catalog has structurally profiled (distinct-value count, data type and null presence captured). This is the denominator for every metric on this board."},
      {value:PDC.fmt.n(v(d.kpi,"key_candidates")),label:"Key Candidates",state:"good",info:"Columns whose number of distinct values ≈ the table's row count — i.e. (near-)unique. These are natural primary-key or join-key candidates worth confirming."},
      {value:PDC.fmt.n(v(d.kpi,"dead_cols")),label:"Dead / Constant Cols",state:(+v(d.kpi,"dead_cols")>0?"bad":"good"),info:"Columns with cardinality = 1: every row holds the same single value, so the column carries no information. Prime candidates to drop or investigate (stuck ETL, defaulted field)."},
      {value:PDC.fmt.n(v(d.kpi,"has_nulls")),label:"Columns w/ Nulls",state:"warn",info:"Columns that contain at least one NULL value. High-null columns may need a default, a backfill, or a NOT-NULL constraint depending on intent."}
    ]);
    var content=PDC.el("content");content.innerHTML="";var g=PDC.grid(3);content.appendChild(g);

    // Column health mix
    var c1=PDC.card("Column Health Mix",{pill:"columns",src:"dim_entity · cardinality vs row_count",info:"Every profiled column bucketed by how its distinct-value count compares to the row count: Unique/key-candidate (≈100%), High cardinality, Low/normal, or Constant/dead (a single value). A healthy table is mostly key + normal columns."});g.appendChild(c1.el);
    PDC.donut(c1.body,{centerCap:"Columns",fmt:PDC.fmt.abbr,data:rows(d.hm,"bucket","cols").map(function(x){x.color=bucketColor(x.label);return x;})});

    // Columns by data type
    var c2=PDC.card("Columns by Data Type",{pill:"count",src:"dim_entity.column_data_type",span:2,info:"How profiled columns split across their declared data types (VARCHAR, BIGINT, DATE…). Useful for spotting type sprawl or unexpected types. Use the Data Type filter to focus the whole board on one type."});g.appendChild(c2.el);
    PDC.bars(c2.body,{horizontal:true,labelW:110,fmt:PDC.fmt.abbr,color:PDC.cssvar("--pdc"),data:rows(d.bt,"dtype","cols")});

    // Tables with most dead/constant columns (cleanup targets) — click a table → its actual dead columns
    var dtype=PDC.filterState.dtype||"%";
    var deadDetail={da:"detail_dead_by_table",param:"tbl",params:{dtype:dtype},noun:"dead / constant columns",
      title:function(tbl){return tbl+" — dead / constant columns";},
      subtitle:"every single-value (cardinality = 1) column in this table"+(dtype!=="%"?(" · "+dtype):""),
      cols:[
        {key:"col",label:"Column",title:true,fmt:function(x){return PDC.fmt.trunc(x,40);}},
        {key:"dtype",label:"Type"},
        {key:"row_count",label:"Rows",num:true,fmt:PDC.fmt.abbr}]};
    var c3=PDC.card("Top Tables by Dead Columns",{pill:"dead cols · click → columns",src:"dim_entity · cardinality=1",span:3,info:"Tables ranked by how many dead/constant columns (cardinality = 1 — one value for every row) they carry. This is your cleanup backlog: the longest bars hold the most no-information columns. Click a bar to see exactly which columns."});g.appendChild(c3.el);
    PDC.bars(c3.body,{horizontal:true,labelW:230,labelChars:42,color:PDC.cssvar("--bad"),fmt:PDC.fmt.n,detail:deadDetail,data:rows(d.dt,"tbl","dead")});

    // Key candidate columns (cardinality ≈ rows)
    var c4=PDC.card("Key Candidate Columns",{pill:"cardinality≈rows",src:"dim_entity · unique columns",span:2,info:"Columns whose distinct-value count is at (or very near) the table's row count — meaning values are effectively unique per row. These are your candidate primary keys / natural join keys."});g.appendChild(c4.el);
    var ki=d.kc.col("col"),pi=d.kc.col("path"),yi=d.kc.col("dtype"),ci=d.kc.col("cardinality"),ri=d.kc.col("row_count");
    PDC.table(c4.body,{cols:[{label:"Column",title:true,fmt:function(x){return PDC.fmt.trunc(x,28);}},
      {label:"Path",fmt:function(x){return PDC.fmt.trunc(x,44);}},{label:"Type"},
      {label:"Cardinality",num:true,bar:true,fmt:PDC.fmt.abbr},{label:"Rows",num:true,fmt:PDC.fmt.abbr}],
      rows:d.kc.rows.map(function(r){return[r[ki],r[pi],String(r[yi]),+r[ci]||0,+r[ri]||0];})});

    // Dead / constant columns (cleanup backlog)
    var c5=PDC.card("Dead / Constant Columns",{pill:"cardinality=1",src:"dim_entity · single-value columns",info:"Individual columns that hold exactly one distinct value across every row (cardinality = 1). They add storage and schema noise without analytical value — review for removal or to find a broken/defaulted pipeline."});g.appendChild(c5.el);
    var di=d.dc.col("col"),dyi=d.dc.col("dtype"),dri=d.dc.col("row_count");
    PDC.table(c5.body,{cols:[{label:"Column",title:true,fmt:function(x){return PDC.fmt.trunc(x,26);}},
      {label:"Type"},{label:"Rows",num:true,bar:true,fmt:PDC.fmt.abbr}],
      rows:d.dc.rows.map(function(r){return[r[di],String(r[dyi]),+r[dri]||0];})});

    // Column Health × Data Type Matrix — heatmap of health buckets per normalized data type
    var ch=PDC.card("Column Health by Data Type",{span:3,pill:"health × type matrix",src:"dim_entity · cardinality thresholds × upper(column_data_type)",
      info:"Cross-tab of column health against data type. Each row is a normalized type (VARCHAR, BIGINT…); each column is a health bucket. Color intensity shows what share of that type's columns fall into the bucket: green = strong key-candidacy, red = dead/constant columns. Reveals if certain types carry more schema noise than others."});g.appendChild(ch.el);
    var piv=pivotSorted(d.hbt,"dtype","bucket","cols");
    var dispCols=piv.cols.map(function(c){return BUCKET_LABELS[c]||c;});
    PDC.heatmap(ch.body,{rows:piv.rows,cols:dispCols,matrix:piv.matrix,
      height:Math.max(160,piv.rows.length*32+52),labelW:90,showVals:true,
      fmt:PDC.fmt.n,
      cellFill:function(v,max,ri,ci){
        var pct=piv.totals[ri]>0?v/piv.totals[ri]:0;
        return hbtFill(v,max,pct,ci);
      },
      cellTip:function(rn,cn,v,ri,ci){
        var tot=piv.totals[ri];
        var pct=tot>0?Math.round(v*100/tot):0;
        var bk=piv.cols[ci];
        return "<b>"+rn+"</b> · <b>"+(BUCKET_LABELS[bk]||bk)+"</b><br>"+PDC.fmt.n(v)+" cols ("+pct+"% of type)<br><i>"+(BUCKET_TIPS[bk]||"")+"</i>";
      }
    });
  }
  function load(){var dt=PDC.filterState.dtype||"%", sc=PDC.filterState.schema||"%";PDC.resetCharts();PDC.el("content").innerHTML='<div class="loading">Loading…</div>';
    PDC.load({kpi:["kpi",{dtype:dt,schema:sc}],hm:["health_mix",{dtype:dt,schema:sc}],bt:["by_type",{schema:sc}],dt:["dead_by_table",{dtype:dt,schema:sc}],
      kc:["key_candidates",{dtype:dt,schema:sc}],dc:["dead_cols",{dtype:dt,schema:sc}],hbt:["health_by_type",{dtype:dt,schema:sc}]}).then(render).catch(function(e){PDC.fail();console.error(e);});}
  Promise.all([PDC.cda("datatypes"),PDC.cda("schemas")]).then(function(rs){
    var dtOpts=[{v:"%",t:"All data types"}].concat(rs[0].rows.map(function(x){return{v:x[0],t:x[0]};}));
    var scOpts=[{v:"%",t:"All schemas"}].concat(rs[1].rows.map(function(x){return{v:x[0],t:x[0]};}));
    PDC.filters([{id:"dtype",label:"Data Type",options:dtOpts,def:"%"},{id:"schema",label:"Schema",options:scOpts,def:"%"}],load);load();
  }).catch(function(){PDC.filters([{id:"dtype",label:"Data Type",options:[{v:"%",t:"All data types"}]},{id:"schema",label:"Schema",options:[{v:"%",t:"All schemas"}]}],load);load();});
})();
