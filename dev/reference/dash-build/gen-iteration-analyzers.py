#!/usr/bin/env python3
"""
gen-iteration-analyzers.py
Pentaho-native iteration content: new .xanalyzer views on the existing Mondrian
virtual cube "01. Data Asset Analysis" (known-good field formulas reused from the
baseline cube-01 analyzers, so render risk is low) + an .xdash that assembles them.
Outputs to iteration/v1/analyzer/. Deploy target on the server:
/public/pdc-analysis/iteration/ (publish, then open the .xdash). Re-runnable.
"""
import os, datetime
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "analyzer"))
os.makedirs(OUT, exist_ok=True)
SRV = "/public/pdc-analysis/iteration"            # server folder the content is published to
TS = "2026-06-20T00:00:00.000Z"
CUBE = "01. Data Asset Analysis"

CHART = ('vizApiVersion="3.0" chartType="CUSTOM" customChartType="pentaho/visual/models/{model}" '
  'showMultiChart="false" legendPosition="RIGHT" showLegend="{sl}" autoRange="true" displayUnits="UNITS_0" '
  'autoRangeSecondary="true" displayUnitsSecondary="UNITS_0" lineWidth="2" lineShape="CIRCLE" maxValues="{maxv}" '
  'backgroundColor="#ffffff" labelColor="#000000" labelSize="12" backgroundFill="NONE" maxChartsPerRow="3" '
  'multiChartMax="50" multiChartRangeScope="GLOBAL" emptyCellMode="GAP" sizeByNegativesMode="NEG_LOWEST" '
  'backgroundColorEnd="#ffffff" labelStyle="PLAIN" legendBackgroundColor="#ffffff" legendSize="12" '
  'legendColor="#000000" legendStyle="PLAIN" labelFontFamily="Default" legendFontFamily="Default" scatterReverseColors="false"')

def meas(f,i,g="measures"):
    return (f'            <measure formula="{f}" showSum="true" showAggregate="false" showAverage="false" '
            f'showCount="false" showMax="false" showMin="false" hideInChart="false" measureTypeEnum="VALUE" '
            f'sortOrderEnum="DESC" id="[MEASURE:{i}]" gembarId="{g}" gembarOrdinal="{i}"/>')
def attr(f,g,i,sub=False):
    return (f'            <attribute formula="{f}" showSubtotal="{str(sub).lower()}" sortOrderEnum="ASC" '
            f'wordWrap="false" gembarId="{g}" gembarOrdinal="{i}"/>')

def analyzer(s):
    name=s["name"]; model=s.get("model","Bar"); rtype=s.get("rtype","JSON")
    gm = "size" if model=="Treemap" else "measures"
    sl = "true" if model in ("Donut","Pie","Line","HeatGrid","BarStacked") else "false"
    measures="\n".join(meas(f,i,gm) for i,f in enumerate(s["measures"]))
    rows="\n".join(attr(f,"rows",i,(rtype=="PIVOT" and i==0)) for i,f in enumerate(s.get("rows",[])))
    cols="\n".join(attr(f,"columns",i) for i,f in enumerate(s.get("cols",[])))
    chart=CHART.format(model=model,sl=sl,maxv=s.get("maxv",100))
    rs="true" if rtype=="PIVOT" else "false"
    xml=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<reportRecord xmlns="http://www.pentaho.com">
    <commonStorageAttributes createdBy="admin" updatedBy="admin" created="{TS}" update="{TS}">
        <path name="{name}" folder="{SRV}/{name}.xanalyzer"/>
    </commonStorageAttributes>
    <report catalog="PDC" cube="{CUBE}" reportTypeEnum="{rtype}" showRowGrandTotal="{rs}" showColumnGrandTotal="false" showSubTotals="{rs}" totalsOnTopLeft="false" useNonVisualTotals="false" showEmptyCells="false" showEmptyEnum="SHOW_MEASURE" emptyCellDisplay="-" showDrillLinks="true" version="15" autoRefresh="true" freezeColumns="true" freezeRows="true">
        <measures>
{measures}
        </measures>
        <columnAttributes>
{cols}
        </columnAttributes>
        <rowAttributes>
{rows}
        </rowAttributes>
        <filters defaultFiltersAvailable="false"/>
        <chartOptions {chart}/>
        <selectionFilters/>
        <selectionItems/>
        <pageSetup excelPageSize="LETTER" pdfPageSize="LETTER" excelOrientation="LANDSCAPE" pdfOrientation="LANDSCAPE" excelScalingType="PERCENT" excelScalingPercent="100" excelScalingPageWide="1" excelScalingPageTall="1" excelMergePivotCells="true" csvIncludeSubtotals="true" csvFormatNumbers="true"/>
        <drillColumns/>
    </report>
    <uiAttributes showFieldList="true" showFieldLayout="true" showFilterPanel="true" fieldListView="CMDVIEWCATEGORY"><rowFieldWidths actualWidths="280"/><columnDataFieldWidths actualWidths="120"/><pluginData>[{{}}]</pluginData></uiAttributes>
</reportRecord>
'''
    open(os.path.join(OUT,name+".xanalyzer"),"w").write(xml)
    loc=f"#Locale = default\n#{datetime.datetime.utcnow().strftime('%a %b %d 00:00:00 UTC %Y')}\nfile.title={s['title']}\ntitle={s['title']}\n"
    open(os.path.join(OUT,name+".xanalyzer.locale"),"w").write(loc)
    return name

def xdash(fname,title,desc,panels):
    boxes="\n".join(f'<box id="Panel_{i+1}" pho:title="{t}" flex="1" collapsed="false" type="titled-panel"/>' for i,(t,_) in enumerate(panels))
    widgets="\n".join(
        (f'<widget jsonType="object"><xactionPath jsonType="string">{SRV}/{n}.xanalyzer</xactionPath>'
         f'<localizedName jsonType="string">{n}</localizedName><refreshPeriod jsonType="string">0</refreshPeriod>'
         f'<GUID jsonType="string">{9100+i}</GUID><type jsonType="string">AnalyzerComponent</type>'
         f'<path jsonType="string">{SRV}/{n}.xanalyzer</path><isDirty jsonType="string">false</isDirty>'
         f'<htmlObject jsonType="string">content-area-Panel_{i+1}</htmlObject><solution jsonType="string"/>'
         f'<name jsonType="string">widget{i+1}</name><action jsonType="string">{n}.xanalyzer</action>'
         f'<iframe jsonType="string">true</iframe><parameters jsonType="object"/><outputParameters jsonType="object"/></widget>')
        for i,(_,n) in enumerate(panels))
    xml=f'''<?xml version="1.0" encoding="UTF-8"?>
<dashboard>
<title>{title}</title>
<heading/>
<enableWidgetPrinting>false</enableWidgetPrinting>
<documentation><author>admin</author><description>{desc}</description><icon/></documentation>
<template-ref>xul/04-1-then-2.xul</template-ref>
<theme-ref>0-Ruby</theme-ref>
<layout>
<overlay xmlns:pho="http://www.pentaho.com" pho:fixie="withme">
{boxes}
</overlay>
</layout>
<parameters>
</parameters>
<widgetJavascript><![CDATA[]]></widgetJavascript>
<widgets>
{widgets}
</widgets>
</dashboard>
'''
    open(os.path.join(OUT,fname+".xdash"),"w").write(xml)
    open(os.path.join(OUT,fname+".xdash.locale"),"w").write(f"#Locale = default\n#Sat Jun 20 00:00:00 UTC 2026\nfile.title={title}\ntitle={title}\n")
    return fname

M=lambda x:f"[Measures].[{x}]"
DST="[Data Source].[Data Source Type]"; RT="[Resource Type].[Resource Type]"
BG2="[Business Glossary].[Level 2]"; BG3="[Business Glossary].[Level 3]"

SPECS=[
  dict(name="i1-assets-by-source", title="Assets by Data Source", model="Bar", measures=[M("Entity Count")], rows=[DST]),
  dict(name="i1-assets-by-resource", title="Assets by Resource Type", model="Donut", measures=[M("Entity Count")], rows=[RT]),
  dict(name="i1-source-resource-matrix", title="Assets by Source and Resource Type", model="HeatGrid", measures=[M("Entity Count")], rows=[DST], cols=[RT], maxv=250),
  dict(name="i1-terms-by-glossary", title="Distinct Terms by Glossary", model="BarHorizontal", measures=[M("Distinct Terms")], rows=[BG2]),
  dict(name="i1-glossary-treemap", title="Catalog Coverage by Glossary", model="Treemap", measures=[M("Entity Count")], rows=[BG2, BG3], maxv=250),
  dict(name="i1-catalog-pivot", title="Catalog Summary by Source and Resource", rtype="PIVOT", model="Bar",
       measures=[M("Entity Count"), M("Distinct Entities"), M("Distinct Terms")], rows=[DST, RT]),
]

if __name__=="__main__":
    made=[analyzer(s) for s in SPECS]
    xdash("i1-catalog-overview","i1 Catalog Composition Overview",
          "Pentaho-native Analyzer dashboard over cube 01 (Data Asset Analysis): assets by source and resource type, glossary coverage, and a catalog summary pivot.",
          [("Assets by Data Source","i1-assets-by-source"),
           ("Assets by Resource Type","i1-assets-by-resource"),
           ("Assets by Source and Resource Type","i1-source-resource-matrix"),
           ("Distinct Terms by Glossary","i1-terms-by-glossary"),
           ("Catalog Coverage by Glossary","i1-glossary-treemap"),
           ("Catalog Summary Pivot","i1-catalog-pivot")])
    print("analyzers:", made)
    print("xdash: i1-catalog-overview")
