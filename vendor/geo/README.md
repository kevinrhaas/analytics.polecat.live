# vendor/geo — geometry + topology runtime for the Studio's map charts

Everything here is redistributed third-party or public-domain material — see
`THIRD-PARTY-NOTICES.md` at the repo root. **Do not add Polecat license headers
to these files.** Rebuild instructions: `node tools/build-geo.mjs` (dev-time,
needs network; commits the refreshed outputs here).

| File | What | Source / license |
|---|---|---|
| `topojson-client.min.js` | TopoJSON → GeoJSON runtime (feature/merge/mesh), UMD, global `topojson` | topojson-client v3.1.0, ISC (`LICENSE-topojson-client`). Inlined into exported dashboards that contain a map panel — keep its banner comment intact. |
| `counties-albers-10m.json` | US counties TopoJSON, **pre-projected** AlbersUsa 975×610 plane | us-atlas v3.0.1, ISC (`LICENSE-us-atlas`); geometry derived from US Census Bureau cartographic boundary files (public domain) |
| `states-albers-10m.json` | US states TopoJSON, same plane | same as above |
| `us-crd-counties.json` | county FIPS → USDA NASS crop reporting district (CRD) mapping; CRD polygons are derived at runtime by merging county geometry per district (`topojson.mergeArcs`) | USDA NASS `county_list.txt` (US government work, public domain) |
| `us-huc8-cornbelt-albers.json` | HUC8 (subbasin) watersheds for the 12-state Corn Belt, TopoJSON, pre-projected onto the SAME AlbersUsa 975×610 plane | USGS Watershed Boundary Dataset via the National Map `wbd` MapServer (US government work, public domain); generalized server-side (maxAllowableOffset 0.01°), reprojected + quantized by `tools/build-geo.mjs` |

Why pre-projected: with geometry already on the standard `geoAlbersUsa().scale(1300)
.translate([487.5,305])` plane (the d3 / us-atlas convention), the RUNTIME needs only
`topojson-client` (~7 KB) — no projection library ships in the app or in exports. d3-geo
and d3-array are used exclusively at BUILD time inside `tools/build-geo.mjs`.
