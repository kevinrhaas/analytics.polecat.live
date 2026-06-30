# PDC Dashboard Studio — dashboard spec (`.studio.json`)

The **single source model** the builder edits. Every exporter (CDF html, CDE `.cdfde`/`.wcdf`,
`.cda`) and the live preview consume this one shape. Inspired by the v2 `dash-build` toolkit:
charts render through `PDC.*` (vendor/pdc-ui.js), data comes from CDA data accesses.

```jsonc
{
  "schema": 1,
  "id": "cde-cost",                 // stable id
  "name": "cde-cost",               // file stem for exports (cde-cost.html / .cdfde / .cda)
  "title": "Cost Optimization & Sustainability",
  "subtitle": "cost by source, tiering candidates, CO2e",
  "group": "Storage & Cost",        // launcher group
  "description": "…",               // wcdf description

  // ── DATA LAYER (the existing CDA queries — input to the builder) ───────────────
  "cda": {
    "connection": { "id": "pdc", "jndi": "PDC-BIDB-EXT" },
    "dataAccesses": [
      { "id": "cost_by_source", "name": "CostBySource",
        "params": [ { "name": "ds", "type": "String", "default": "%" } ],
        "cache": true, "cacheDuration": 120,
        "sql": "SELECT datasource_type AS src, ... GROUP BY 1 ORDER BY 2 DESC",
        "columns": ["src", "cost"] }        // derived (SELECT aliases) — used for column pickers
    ]
  },

  // ── FILTERS (cascading header selects; optional) ──────────────────────────────
  "filters": [
    { "id": "ds", "label": "Data Source", "da": "datasources",
      "valueCol": "src", "textCol": "src", "allLabel": "All sources", "def": "%" }
  ],

  // ── KPI TILES (top row; optional) ─────────────────────────────────────────────
  "kpis": [
    { "da": "kpi", "valueCol": "monthly", "label": "Monthly Cost",
      "fmt": "money", "state": "purple", "info": "…" }
  ],

  // ── PANELS (the card grid) ────────────────────────────────────────────────────
  "gridCols": 3,                    // 1..4 base columns
  "panels": [
    {
      "id": "p1",
      "title": "Monthly Cost by Data Source",
      "span": 1,                    // 1 | 2 | 3 | "full"
      "pill": "$", "sub": "click a bar → its assets", "info": "…",
      "src": "entity_storage_demo · cube 71",
      "chart": {
        "type": "bars",            // see registry below
        "da": "cost_by_source",
        "map": { "labelCol": "src", "valueCol": "cost" },
        "opts": { "horizontal": true, "fmt": "money", "height": 300, "color": "--pentaho" }
      }
    }
  ]
}
```

## Chart-type registry (keys + required mapping)

| type      | mapping fields                          | CDF (`PDC.*`)        | CDE / CCC component        |
|-----------|-----------------------------------------|----------------------|----------------------------|
| `kpi`     | valueCol (+ label/fmt/state/info)       | `PDC.kpis`           | (HTML)                     |
| `bars`    | labelCol, valueCol                      | `PDC.bars`           | `cccBarChart`              |
| `donut`   | labelCol, valueCol                      | `PDC.donut`          | `cccPieChart`              |
| `line`    | labelCol, series:[{col,name,color}]     | `PDC.line`           | `cccLineChart`             |
| `stacked` | labelCol, series:[{col,name,color}]     | `PDC.stacked`        | `cccBarChart` (stacked)    |
| `areaStacked` | labelCol, series:[{col,name,color}] | `PDC.areaStacked`  | `cccStackedAreaChart`      |
| `treemap` | labelCol, valueCol                      | `PDC.treemap`        | `cccTreemapChart`          |
| `scatter` | xCol, yCol, rCol?, labelCol?            | `PDC.scatter`        | `cccMetricDotChart`        |
| `gauge`   | valueCol, max                           | `PDC.gauge`          | CDF-only                   |
| `heatmap` | rowCol, colCol, valueCol (pivoted)      | `PDC.heatmap`        | `cccHeatGridChart`         |
| `table`   | cols:[{col,label,num,fmt}]              | `PDC.table`          | `Table`                    |

`fmt` ∈ `n | abbr | pct | gb | bytes | money | plain`.
`color`/series colors ∈ CSS token (`--pentaho`,`--pdc`,`--c1`…`--c10`,`--good`,`--warn`,`--bad`,`--info`) or hex.
`opts` keys are chart-specific: `horizontal, rotate, area, height, centerCap, valuesVisible, max, showVals`.

## Data resolution
Preview sets `window.PDC_MOCK = { <dataAccessId>: {cols, rows} }` (from `data/sample-data.json`);
`PDC.cda` returns it (params ignored). Live preview clears the mock and sets `PDC.cdaPath` so
`PDC.cda` hits the real `/pentaho/plugin/cda/api/doQuery`. Same code path either way.
