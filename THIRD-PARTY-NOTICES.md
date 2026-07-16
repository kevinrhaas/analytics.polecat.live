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

*(The geo-analytics track adds `topojson-client` and `d3-geo` (ISC) and `MapLibre GL JS`
(BSD-3-Clause) under `vendor/geo/` — each with its upstream LICENSE file — plus public-domain
US government geometry (US Census Bureau cartographic boundaries, USGS Watershed Boundary
Dataset, USDA NASS district definitions). This table is updated in the same PR that vendors
each component.)*

## Data & geometry sources

| Source | Use | Terms |
|---|---|---|
| — | *(none redistributed yet)* | — |

## Fonts

No third-party fonts are bundled; the UI uses system font stacks.
