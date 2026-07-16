# Third-party notices — Analytics Dashboard Studio

The Studio is proprietary software (see `LICENSE`, © 2026 Polecat.live). It vendors and
redistributes the third-party and public-domain components listed here, each under its own
license. Vendored files keep their upstream license text alongside the code (never our
proprietary header), and anything the Studio **inlines into exported dashboards** carries the
required notice inside the export too.

## Vendored libraries

| Component | Path | License | Notes |
|---|---|---|---|
| Polecat Shell | `vendor/polecat-shell/` | © Polecat.live (first-party fleet library) | Synced read-only from kevinrhaas/polecat-platform; not third-party. |
| PDC dashboard toolkit | `vendor/pdc-ui.js` | © Polecat.live (first-party) | Inlined into exported dashboards. |
| topojson-client v3.1.0 | `vendor/geo/topojson-client.min.js` | ISC — © 2012–2019 Michael Bostock (`vendor/geo/LICENSE-topojson-client`) | Inlined (banner comment intact) into any exported dashboard that contains a map panel. |
| us-atlas v3.0.1 | `vendor/geo/counties-albers-10m.json`, `vendor/geo/states-albers-10m.json` | ISC — © Michael Bostock (`vendor/geo/LICENSE-us-atlas`) | Pre-projected TopoJSON; underlying geometry is US Census Bureau cartographic boundary data (public domain). Inlined into exported map dashboards. |
| MapLibre GL JS v5.24.0 | `vendor/maplibre/maplibre-gl.js`, `vendor/maplibre/maplibre-gl.css` | BSD-3-Clause — © 2023 MapLibre contributors (`vendor/maplibre/LICENSE-maplibre-gl`) | Powers the opt-in interactive ("GL") map renderer. Inlined (license banner intact) ONLY into exported dashboards whose map panels choose the GL renderer; SVG-renderer exports carry none of it. |

*(`d3-geo`/`d3-array` (ISC) are used only at BUILD time by `tools/build-geo.mjs`
and are not redistributed.)*

## Data & geometry sources

| Source | Use | Terms |
|---|---|---|
| USGS Watershed Boundary Dataset (via The National Map `wbd` service) | `vendor/geo/us-huc8-cornbelt-albers.json` — Corn Belt HUC8 subbasins, generalized + reprojected by `tools/build-geo.mjs` | US government work, public domain |
| USDA NASS county list (`county_list.txt`) | `vendor/geo/us-crd-counties.json` — county FIPS → crop reporting district mapping | US government work, public domain |
| US Census Bureau cartographic boundary files | county/state geometry underlying the us-atlas files above | US government work, public domain |

## Fonts

No third-party fonts are bundled; the UI uses system font stacks.
