# View Builder chart hero shots — image session 2026-07-31T15:01:03Z

The View Builder rendering real charts instead of the plain table, for the
"pivot & crosstab, no code" slide. Captured by `node tools/shoot-viewbuilder-charts.mjs`.

- **Image session ran:** 2026-07-31T15:01:03Z (also in each PNG's tEXt metadata)
- **App commit at capture:** 13b6f4ea383673fd2f736fceb110c0c32a90bc07
- **Map** and **Donut** are native View Builder chart types (full builder UI shown).
- **Treemap** is a dashboard chart type, not a View Builder one; it's rendered as a clean standalone export.

| Screenshot | Chart | Notes |
|---|---|---|
| [`01-view-builder-map.png`](01-view-builder-map.png) | View Builder — county Map (choropleth) | cover-crop % by county, avg across providers; Map chart type, dense 144-county render |
| [`02-view-builder-donut.png`](02-view-builder-donut.png) | View Builder — Donut | assets by source; Donut chart type |
| [`03-treemap-standalone.png`](03-treemap-standalone.png) | Treemap (standalone export) | treemap is a DASHBOARD chart type, not a View Builder one — rendered via buildHtml |
