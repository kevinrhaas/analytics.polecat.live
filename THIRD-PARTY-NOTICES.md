# Third-party notices — Analytics Dashboard Studio

Analytics is free software under the **GNU GPL v3** (see `LICENSE`, © 2026 Polecat.live). It
vendors and redistributes the third-party and public-domain components listed here, each under
its own license. Vendored files keep their upstream license text alongside the code (never our
own header), and anything the app **inlines into exported dashboards** carries the required
notice inside the export too.

## Vendored libraries

| Component | Path | License | Notes |
|---|---|---|---|
| Polecat Shell | `vendor/polecat-shell/` | © Polecat.live (first-party fleet library) | Synced read-only from kevinrhaas/polecat-platform; not third-party. |
| DashKit dashboard toolkit | `vendor/dashkit.js`, `vendor/dashkit.css` | © Polecat.live (first-party) | Inlined into exported dashboards. |
| fflate v0.8.2 | `vendor/fflate.js` | MIT — © 2023 Arjun Barrett (`vendor/LICENSE-fflate`) | The UMD build, verbatim (banner comment intact). Unzips `.xlsx` workbooks for the spreadsheet importer (`app/xlsx.js` uses `unzipSync` only); loaded by the app and precached, never inlined into an export. |
| topojson-client v3.1.0 | `vendor/geo/topojson-client.min.js` | ISC — © 2012–2019 Michael Bostock (`vendor/geo/LICENSE-topojson-client`) | Inlined (banner comment intact) into any exported dashboard that contains a map panel. |
| us-atlas v3.0.1 | `vendor/geo/counties-albers-10m.json`, `vendor/geo/states-albers-10m.json` | ISC — © Michael Bostock (`vendor/geo/LICENSE-us-atlas`) | Pre-projected TopoJSON; underlying geometry is US Census Bureau cartographic boundary data (public domain). Inlined into exported map dashboards. |
| MapLibre GL JS v5.24.0 | `vendor/maplibre/maplibre-gl.js`, `vendor/maplibre/maplibre-gl.css` | BSD-3-Clause — © 2023 MapLibre contributors (`vendor/maplibre/LICENSE-maplibre-gl`) | Powers the opt-in interactive ("GL") map renderer. Inlined (license banner intact) ONLY into exported dashboards whose map panels choose the GL renderer; SVG-renderer exports carry none of it. |

*(`d3-geo`/`d3-array` (ISC) are used only at BUILD time by `tools/build-geo.mjs`
and are not redistributed.)*

## Data & geometry sources

| Source | Use | Terms |
|---|---|---|
| USGS Watershed Boundary Dataset (via The National Map `wbd` service) | `vendor/geo/us-huc8-albers.json` — nationwide HUC8 subbasins (all 50 states + DC), generalized + reprojected by `tools/build-geo.mjs` | US government work, public domain |
| USDA NASS county list (`county_list.txt`) | `vendor/geo/us-crd-counties.json` — county FIPS → crop reporting district mapping | US government work, public domain |
| US Census Bureau cartographic boundary files | county/state geometry underlying the us-atlas files above | US government work, public domain |
| US Census Bureau TIGERweb (119th Congressional Districts, `Legislative/MapServer`) | `vendor/geo/us-cd-albers.json` — nationwide congressional districts (all 50 states + DC), generalized + reprojected by `tools/build-geo.mjs` | US government work, public domain |
| US Census Bureau TIGERweb (2020 ZIP Code Tabulation Areas, `tigerWMS_Current/MapServer` layer 2) | `vendor/geo/us-zcta-albers.json` — nationwide 5-digit ZCTAs (all 50 states + DC), generalized + reprojected by `tools/build-geo.mjs` | US government work, public domain |
| US Census Bureau — County Business Patterns and American Community Survey | `data/packs/marketcoverage/county-establishments.csv` and `county-demographics.csv` — 1,813 counties, extracted by `tools/pack-extract/marketcoverage.mjs`; the data behind the Market Coverage sample pack | US government work, public domain |
| USASpending.gov — federal contract awards, FY2025 (Treasury Bureau of the Fiscal Service, API v2) | `data/packs/contractawards/agency-totals.csv`, `agency-industry.csv`, `agency-vendor.csv` and `district-awards.csv` — FY2025 federal contract obligations for the 25 largest awarding agencies, extracted by `tools/pack-extract/contractawards.mjs`; the data behind the Federal Contract Awards sample pack | US government work, public domain |
| Federal Election Commission — individual contributions, 2023-2024 cycle (bulk downloads `indiv24`, `cm24`, `cn24`) | `data/packs/campaignfinance/state-donors.csv`, `committees.csv`, `committee-state.csv`, `occupations.csv`, `employers.csv`, `monthly.csv` and `size-bands.csv` — $6.5B of itemized individual contributions for the closed 2023-24 cycle, aggregated (no donor names, no addresses) by `tools/pack-extract/campaignfinance.mjs`; the data behind the Campaign Finance sample pack | US government work, public domain |

### Sample-pack data

Sample packs (`app/demopacks.js`) may ship real outside data as committed CSV under
`data/packs/<id>/` — the contract is **`docs/PACKS.md`**. Every pack declares a `source` on its
registry entry, and every source that is not `kind: "synthetic"` gets a row in the table above in
the same PR that adds it — a `licensed` one because the licence demands it (`tools/validate.mjs`
fails the dev gate without it), a `public` one because a public-domain source still deserves the
credit this document exists to give. `tools/doc-truth.mjs` check 47 holds both.

*Of the five shipped packs, three ship outside data: **Market Coverage** (`marketcoverage`)
commits the US Census extract, **Federal Contract Awards** (`contractawards`) the
USASpending.gov extract and **Campaign Finance** (`campaignfinance`) the FEC extract, all
credited in the table above. **Conservation Insight** and **Data
Management & Governance** are entirely synthetic — generated in JS at install time, as their own
copy says — so they need no credit.*

## Fonts

**Hanken Grotesk** — the Polecat brand face — is bundled and served from this repo, in two
places: `assets/fonts/hanken-grotesk-{400,600,700,800}.woff2`, `@font-face`-declared by
`css/landing.css` (the marketing page) and `docs/index.html` (the Help page); and
`vendor/polecat-shell/fonts/HankenGrotesk-*.woff2`, which arrive with the read-only shell copy
and are published with it (no page here links the shell's own `fonts.css` today, but the files
are redistributed all the same, which is what this document is about).

Licensed under the **SIL Open Font License, Version 1.1** — Copyright 2021 The Hanken Grotesk
Project Authors (<https://github.com/marcologous/hanken-grotesk>). The licence text ships beside
the fonts at `assets/fonts/LICENSE-hanken-grotesk` — the OFL requires the notice to travel with
the font files, so it lives beside them rather than only here.

No other fonts are bundled — everything else falls through to the system stack behind Hanken
Grotesk in `--font`.
