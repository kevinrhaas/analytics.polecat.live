# Analytics Dashboard Studio — dashboard spec (`.studio.json`)

The **single source model** the builder edits. The live preview, the viewer, the CLI exporter and
every Export ▾ format consume this one shape — there is no separate export model, and no build
step: a spec is plain JSON that `app/model.js` creates, `app/studio.js` edits and
`app/exporters.js` renders.

Charts render through the vendored `DashKit.*` toolkit (`vendor/dashkit.js`). Rows come from the
workspace's **connections → datasets** model — a dashboard imports a dataset as a self-contained
copy that stays LINKED to the workspace row for live runs — or from the built-in offline sample
engine when a data access has no engine behind it.

Sources of truth, all of which the dev gate holds this page to (`tools/doc-truth.mjs`, check 45):
`Studio.emptySpec()` and `Studio.CHARTS` in `app/model.js`, and the Export ▾ menu in
`app/index.html`.

## What reads a spec

| Consumer | What it does with it |
|---|---|
| The builder's canvas + live preview | `Studio.previewHtml()` — the same `buildHtml` pipeline every export uses, with sample rows mocked in |
| Export ▾ in the builder | the seven formats below |
| `app/viewer.html` | opens a saved dashboard read-only; its own export menu offers `Dashboard (.html)`, `PDF (print)` and `Editable spec (.json)` |
| `./deploy.sh <spec.studio.json>` → `tools/export.js` | one self-contained `Dashboard (.html)` per spec, headless, reusing `app/exporters.js` unchanged |

Export ▾ writes seven artifacts from one spec: `Dashboard (.html)`, `Excel workbook (.xlsx)`,
`Word document (.docx)`, `PowerPoint (.pptx)`, `PDF (print)`, `Editable spec (.studio.json)` — this
file — and `All artifacts (bundle)`.

## The shape

```jsonc
{
  "schema": 1,                        // on-disk spec marker; every spec ever written carries 1
  "id": "dash7_41822",                // stable id (Studio.uid)
  "name": "cost-optimization",        // file stem for exports (cost-optimization.html)
  "title": "Cost Optimization & Sustainability",
  "subtitle": "cost by source, tiering candidates, CO2e",
  "group": "Storage & Cost",          // catalog group; "" until the author sets one
  "description": "…",

  // ── DATA LAYER ────────────────────────────────────────────────────────────────
  // `cda` is a historical key name kept for on-disk compatibility — every spec ever
  // saved carries it. It holds the dashboard's own copy of the datasets it binds.
  "cda": {
    "connection": { "id": "pdc" },        // legacy block; still written, nothing reads it —
                                          // a data access names its own connectionId now
    "dataAccesses": [
      { "id": "cost_by_source", "name": "Cost by source",
        "kind": "sql",                        // "sql" | "compound" (a join/union of two others)
        "connectionId": "conn_7c2",           // the workspace Connection this runs against
        "datasetId": "ds_19a",                // the workspace Dataset this was imported from
        "sql": "SELECT datasource_type AS src, SUM(cost) AS cost FROM … GROUP BY 1",
        "columns": ["src", "cost"],           // the column list pickers and charts bind to
        "params": [ { "name": "ds", "default": "%" } ],
        "cache": true, "cacheDuration": 300 }
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
  "gridCols": 3,                      // 1..4 base columns
  "panels": [
    {
      "id": "p1",
      "title": "Monthly Cost by Data Source",
      "span": 1,                      // 1 | 2 | 3 | "full"
      "pill": "$", "sub": "click a bar → its assets", "info": "…",
      "src": "entity_storage_demo",   // provenance caption
      "chart": {
        "type": "bars",               // a key from the registry below
        "da": "cost_by_source",       // the dataAccess id this panel reads
        "map": { "labelCol": "src", "valueCol": "cost" },   // the type's own `fields`
        "opts": { "horizontal": true, "fmt": "money", "height": 300, "color": "--pentaho" }
      }
    }
  ]
}
```

## Top-level keys

Everything `Studio.emptySpec()` creates. A key absent from a saved spec takes its default; the
appearance keys are all `""`/`null` on a new dashboard, meaning "inherit".

| Key | What it is |
|---|---|
| `schema` | spec schema marker (`1`) |
| `id` | stable dashboard id |
| `name` | file stem for exports |
| `title` | banner title |
| `subtitle` | banner subtitle |
| `group` | catalog group; `""` until the author picks one |
| `description` | longer description shown in catalogs |
| `cda` | the data layer — `{ connection, dataAccesses }` (see above) |
| `filters` | cascading header selects |
| `kpis` | KPI tiles |
| `gridCols` | base column count, 1..4 |
| `themeColor` | hex accent override for preview + exported html |
| `dashboardTheme` | look preset key (`Studio.DASHBOARD_THEMES`); `""` = classic, `"custom"` reads `customTheme` |
| `customTheme` | `{light:{bg,panel,text,brand}, dark:{…}}` seed colors when `dashboardTheme` is `"custom"`; `null` otherwise |
| `paletteKey` | series palette key (`Studio.PALETTE_PRESETS`); `""` = default |
| `headerLogo` | `data:` URL image replacing the default banner mark |
| `headerLink` | URL — wraps the banner mark + title in a link |
| `headerBg` | hex banner background (foreground auto-contrasts) |
| `titleSize` | key into `Studio.TITLE_SIZE_PX` |
| `subtitleStyle` | `"italic"` / `"bold"` / `"bold-italic"` |
| `headerAlign` | `"center"` / `"right"`; `""` = flush left |
| `cardSkin` | card material (`Studio.CARD_SKINS`) — `""` raised, `"flat"`, `"sketch"` |
| `renderMode` | fixed light/dark for the EXPORTED html — `""` light, `"dark"`, `"auto"` (match the reader) |
| `templateVars` | `[{key,value}]` — `{{key}}` tokens in the dashboard title/subtitle and panel title/note are substituted at render time |
| `panels` | the card grid |
| `demoPackId` | present on specs a sample pack seeds; identifies the pack that owns them |

## Chart types

The registry is `Studio.CHARTS` in `app/model.js` — **54** types. `chart.map` binds the columns in
the type's own `fields` list; `chart.opts` keys and their defaults come from the same entry's
`opts` (the inspector renders both from it, so a spec never needs to list an opt it leaves alone).
Help's chart gallery is the reader-facing version of this table — one `#ct-<type>` card per type
in `docs/index.html`.

| `type` | Label | `map` fields |
|---|---|---|
| `bars` | Bar chart | `labelCol`, `valueCol` |
| `donut` | Donut / pie | `labelCol`, `valueCol` |
| `line` | Line / area | `labelCol`, `series` |
| `stacked` | Stacked bars | `labelCol`, `series` |
| `areaStacked` | Stacked area | `labelCol`, `series` |
| `streamgraph` | Stream graph | `labelCol`, `series` |
| `parallelCoords` | Parallel coords | `labelCol`, `series` |
| `combo` | Bar + line | `labelCol`, `barCol`, `lineCol` |
| `radar` | Radar / spider | `labelCol`, `series` |
| `radarSectors` | Metrics wheel | `labelCol`, `catCol`, `valueCol` |
| `waterfall` | Waterfall | `labelCol`, `valueCol` |
| `sankey` | Sankey (flow) | `sourceCol`, `targetCol`, `valueCol` |
| `funnel` | Funnel | `labelCol`, `valueCol` |
| `chord` | Chord / wheel | `sourceCol`, `targetCol`, `valueCol` |
| `network` | Network / topology | `sourceCol`, `targetCol`, `valueCol` |
| `sunburst` | Sunburst | `labelCol`, `valueCol`, `groupCol` |
| `bullet` | Bullet chart | `labelCol`, `valueCol`, `targetCol` |
| `calHeatmap` | Calendar heatmap | `dateCol`, `valueCol` |
| `treemap` | Treemap | `labelCol`, `valueCol` |
| `scatter` | Scatter / bubble | `xCol`, `yCol`, `rCol`, `labelCol` |
| `gauge` | Gauge | `valueCol` |
| `heatmap` | Heatmap (pivot) | `rowCol`, `colCol`, `valueCol` |
| `choropleth` | Map (US choropleth) | `idCol`, `valueCol`, `seriesCol` |
| `ensembleSeries` | Ensemble (common estimate) | `labelCol`, `seriesCol`, `valueCol` |
| `table` | Table | `cols` |
| `richtext` | Text / annotation | — (no data binding) |
| `boxplot` | Box plot | `labelCol`, `valueCol` |
| `lollipop` | Lollipop chart | `labelCol`, `valueCol` |
| `dumbbell` | Dumbbell chart | `labelCol`, `startCol`, `endCol` |
| `slope` | Slope chart | `labelCol`, `valueCol1`, `valueCol2` |
| `dotplot` | Dot plot | `labelCol`, `valueCol` |
| `beeswarm` | Beeswarm plot | `labelCol`, `valueCol` |
| `histogram` | Histogram | `valueCol` |
| `polarArea` | Polar area | `labelCol`, `valueCol` |
| `step` | Step chart | `labelCol`, `series` |
| `violin` | Violin plot | `labelCol`, `valueCol` |
| `bump` | Bump chart | `labelCol`, `series` |
| `marimekko` | Marimekko | `labelCol`, `groupCol`, `valueCol` |
| `packedBubble` | Packed bubbles | `labelCol`, `valueCol` |
| `wordCloud` | Word cloud | `labelCol`, `valueCol` |
| `gantt` | Gantt / Timeline | `labelCol`, `startCol`, `endCol` |
| `divergingBar` | Diverging bars | `labelCol`, `valueCol` |
| `candlestick` | Candlestick / OHLC | `labelCol`, `openCol`, `highCol`, `lowCol`, `closeCol` |
| `waffle` | Waffle chart | `labelCol`, `valueCol` |
| `timeline` | Timeline / milestones | `labelCol`, `dateCol` |
| `pyramidBar` | Population pyramid | `labelCol`, `leftCol`, `rightCol` |
| `radialBar` | Radial bar | `labelCol`, `valueCol` |
| `icicle` | Icicle / partition | `labelCol`, `valueCol`, `groupCol` |
| `pareto` | Pareto chart | `labelCol`, `valueCol` |
| `groupedBars` | Grouped bars | `labelCol`, `series` |
| `ridgeline` | Ridgeline plot | `labelCol`, `valueCol` |
| `barNorm` | 100% stacked bars | `labelCol`, `series` |
| `areaRange` | Area range / band | `labelCol`, `lowerCol`, `upperCol`, `centerCol` |
| `quadrant` | Quadrant chart | `xCol`, `yCol`, `labelCol` |

A `series` binding is `[{col, name?, color?}]`; `cols` (table) is `[{col, label?, num?, fmt?}]`.

## Value formats and colors

`fmt` ∈ `abbr` | `n` | `money` | `pct` | `gb` | `bytes` | `plain` (`Studio.FORMATS`).

`color` and series colors take a CSS token — `--pentaho`, `--dk`, `--c1`, `--c2`, `--c3`, `--c4`,
`--c5`, `--c6`, `--c7`, `--c8`, `--c9`, `--c10`, `--good`, `--warn`, `--bad`, `--info`
(`Studio.COLOR_TOKENS`) — or a hex value. The token strings are storage identifiers only: every
picker renders friendly labels ("Accent (theme)", "Series 1"), never the raw token.

KPI `state` ∈ `""` | `purple` | `good` | `warn` | `bad` (`Studio.KPI_STATES`).

## Data resolution

One pipeline, two row sources, and which one a data access uses is a property of the data access
rather than of the output:

- **Engine-less data accesses** (no connection behind them — the built-in samples, the example
  gallery) get deterministic sample rows. The preview and every exported artifact carry them in
  `window.DASHKIT_MOCK`, keyed by data-access id, and `DashKit.cda` returns them directly.
- **Connection-bound data accesses** (`connectionId` set) run for real: the builder resolves the
  workspace Dataset fresh when it still exists — so an edit in the Datasets section flows through
  — and otherwise runs the copy embedded at import time, in both cases through the referenced
  Connection's adapter and stored credentials. An exported dashboard keeps doing this from the
  reader's browser — so a live export asks how to handle credentials rather than deciding for you.

The mock never shadows a live engine, so one dashboard can mix both.
