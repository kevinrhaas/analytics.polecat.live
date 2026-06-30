# Reference assets — Pentaho iteration-v2 suite

These are the original **iteration-v2** PDC dashboard assets that **Dashboard Studio (at the repo
root) was derived from**. They were migrated here from
`solution-engineering/iteration/v2/` and are kept as reference — the Studio's query catalog and
example specs (`data/cda-catalog.json`, `data/examples/`) are generated from `dashboards/` below via
`tools/import-v2.py`.

| Folder | What it is |
|--------|------------|
| `dashboards/` | Generated self-contained HTML dashboards + their `.cda` queries, `.xdash`, and `.cdfde`/`.wcdf` CDE editor files, plus thumbnails. The query library and example specs are imported from these. |
| `analyzer/` | Pentaho **Analyzer** reports (`.xanalyzer`) + the Mondrian schema they sit on. |
| `dash-build/` | The **legacy** hand-coded generators (`build.py`, `gen-cde.py`, `gen-home.py`) and the `pdc-ui` toolkit (`pdc-ui.css/js`). Dashboard Studio replaces this build flow with a single visual model; the toolkit itself is vendored into the Studio at `/vendor/pdc-ui.*`. |
| `ITERATION-V2-README.md` | The original iteration-v2 README. |
| `ITERATION-STATUS.md` | The original iteration-v2 working log / status (historical). |

To regenerate the Studio catalog + examples from these dashboards:

```bash
python3 tools/import-v2.py     # reads reference/dashboards → data/cda-catalog.json + data/examples/
```
