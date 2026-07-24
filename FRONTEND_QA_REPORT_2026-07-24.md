# Frontend QA report — 2026-07-24

## Executive summary

The application has unusually broad automated coverage and the current `main` branch passed its full Playwright regression suite. Production exploratory testing still found two high-priority problems:

1. Connection credential fields can be populated by an unrelated browser password-manager entry.
2. The UI says credentials stay in the browser, but a connected workspace backend can sync them to the backend as plaintext unless the optional encryption feature is enabled.

The most visible functional defect is in Explore: the featured **County cover-crop adoption (demo)** dataset opens as a choropleth but guesses `statecode` as the numeric value. The result is an empty map until the user manually changes **Value** to `pct`.

No application code was changed as part of this review.

## Test context

- Production URL: `https://analytics.polecat.live/app/`
- Test date: 2026-07-24
- Production browser: authenticated Google Chrome desktop session
- Production footer observed: `v513`
- Repository tested: `kevinrhaas/analytics.polecat.live`
- Repository commit: `76337ec30e30fcfea873dd7c6fed2e19f9a56253`
- Repository changelog at that commit: `v514`
- Automated baseline:
  - Command: `PW_CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" NODE_PATH=<bundled-node-modules> <bundled-node> tests/run.js`
  - Result: exit code `0`
  - Coverage includes the workspace shell, Home, Explore, Dashboards, Datasets, Connections, Repository, Studio, Jobs, Admin, Settings, adapters, imports/exports, all chart families, responsive layouts, PWA behavior, Back/Forward handling, privacy, and accessibility assertions.
- Console warnings/errors observed during the exploratory flows described below: none.

## User use cases exercised

| Area | Primary use case | Result |
|---|---|---|
| Global shell | Navigate every workspace section; use Back/Forward; reach Search and Help | Automated pass; desktop navigation worked |
| Home | Resume recent work, open featured content, browse examples, find recent dashboards | Loaded successfully; content and live previews rendered |
| Explore | Pick a dataset, inspect rows, choose a chart, map columns, preview, save/add to dashboard | Functional after manual correction; default mapping defect found |
| Dashboards | Search, filter by workbook, switch view, compare, export/import entry points | Search and compare opened; duplicate-item ambiguity found |
| Datasets | Search/filter, inspect status and usage, open editor, preview/run/save entry points | Catalog and editor opened correctly |
| Connections | Search/filter, inspect status, choose adapter, inspect credentialed connector setup | Adapter chooser worked; credential autofill and security-copy issues found |
| Repository | Search/filter all workspace objects, browse folders, open/quick-edit an object | Loaded correctly; duplicate-item ambiguity found |
| Studio | Open a dashboard, inspect preview, data rail, examples, export menu, advanced actions, command palette | Core surfaces rendered; accessibility gaps found |
| Jobs | Create/edit/run transformation jobs, joins, unions, SQL, refresh reminders | Automated pass; no live destructive run |
| Admin | Account and rights management, privacy enforcement | Automated pass; no live account mutation |
| Settings | Appearance/defaults, branding, workspace backend, encryption, import/export settings | Automated pass; copy conflicts with actual sync behavior |
| Responsive/PWA | Phone/tablet navigation, drawers, modals, exported dashboards, offline shell | Automated pass at 360/390/800 px cases |
| Distribution | HTML/spec/bundle export, PNG/CSV, URL/file imports, sharing/version history | Automated pass; no production download/upload performed |

## Findings

### QA-01 — P1 — Credential inputs accept unrelated password-manager autofill

**Area:** Connections → New connection → BigQuery

**Observed**

Opening the BigQuery connection form caused the OAuth access-token field to contain an unrelated saved credential from the browser password manager. The value was not entered by the tester and did not resemble a Google OAuth token.

The rendered field had:

- `type="password"`
- `autocomplete="off"`
- no `name`
- no `id`
- a non-empty value immediately after opening the form

The credential was not submitted, copied into this report, or otherwise transmitted.

**Why it matters**

- A user may unknowingly save or test a connection with the wrong secret.
- A saved credential could be synced to the workspace backend.
- `autocomplete="off"` is commonly ignored by password managers on password-like fields.

**Likely implementation area**

- `app/studio.js`, connection wizard field creation in `credsStep()`
- `app/sources/data-adapters.js`, password-typed adapter fields

**Recommendation**

- Give every credential input a stable, connector-specific `id` and `name`.
- Use an autofill token suited to a new secret, such as `autocomplete="new-password"`, rather than `off`.
- Consider initially rendering secret fields empty and read-only until explicit user interaction, then remove `readonly` on focus.
- Never treat an autofilled value as user-confirmed. Require explicit interaction before enabling **Test connection** or **Add connection** when a secret is present on first render.
- Add a browser test that simulates a pre-populated secret input and proves it cannot be silently persisted.

**Acceptance criteria**

- Opening any new credentialed adapter always shows an empty secret field.
- Editing an existing connection still shows only the intended saved secret behavior.
- No credential is persisted or tested until the user explicitly interacts with the field/form.

---

### QA-02 — P1 — “Credentials stay in this browser” conflicts with backend sync behavior

**Area:** Connections header, tutorial copy, workspace backend

**Observed**

Connections states: **“Credentials stay in this browser.”** Similar language appears in the tutorial. However, the workspace sync implementation mirrors connection rows to the selected backend. Settings explicitly states that, when encryption is off, **connection credential values are written to the backend unencrypted**.

Relevant implementation/docs:

- `app/index.html`
- `app/tutorial.js`
- `app/sources/sync.js`
- `app/studio.js` workspace-backend secrets card
- `README.md`

**Why it matters**

This is a security expectation mismatch. A user could connect a remote workspace backend believing credentials remain local, while they are actually stored remotely as plaintext unless optional encryption has been enabled.

**Recommendation**

- Replace unconditional copy with state-aware language:
  - Local-only workspace: “Credentials are stored in this browser.”
  - Remote backend + encryption on: “Credentials sync as encrypted ciphertext.”
  - Remote backend + encryption off: “Credentials sync to the backend as plaintext,” with a prominent warning and direct encryption action.
- Consider making encryption opt-out rather than opt-in when the first secret-bearing connection is synced.
- Show the current secret-storage state in the Connections section, not only in Settings.
- Add a first-sync confirmation that states exactly where credentials will be stored.

**Acceptance criteria**

- No screen claims credentials remain browser-only when a remote backend is connected.
- Users receive a clear warning before the first plaintext secret sync.
- The current encryption state is visible from Connections.

---

### QA-03 — P1 — Featured county dataset opens with an invalid choropleth value mapping

**Area:** Explore

**Reproduction**

1. Open **Explore**.
2. Select **County cover-crop adoption (demo)**.
3. Observe that the app correctly selects **Map (US choropleth)**.
4. Inspect the mapping:
   - Region id: `geoid`
   - Value: `statecode`
   - Series/provider: `provider`
   - Region scale: Counties (FIPS)
5. The preview displays: **“No region values — map an id column and a value column.”**
6. Change **Value** to `pct`.
7. After the preview refresh, the county map renders successfully with a numeric legend.

Dataset columns observed:

`geoid`, `statecode`, `provider`, `pct`, `acres`

**Why it matters**

This is a broken first-run path in the primary Explore workflow and in featured demo content. It makes the product appear unable to chart its own curated dataset.

**Likely cause**

`xpGuessMapping()` delegates to `Studio.newPanel()`, whose default positional mapping chooses the second column for `valueCol`. The stronger name-based numeric heuristic used by `autoPickCols()` is not applied here.

**Recommendation**

- Reuse one canonical column-typing/selection routine for both Explore defaults and Studio’s **Auto-pick**.
- Prefer numeric data based on observed row values, not only column position or name.
- For choropleths, explicitly prefer value-like names (`value`, `pct`, `rate`, `amount`, `count`, `acres`) and reject columns whose sampled values are non-numeric.
- Add this exact workspace demo dataset to the regression suite, not only catalog-generated geo samples.

**Acceptance criteria**

- Selecting **County cover-crop adoption (demo)** immediately renders a populated county map.
- `geoid` maps to Region id, `pct` maps to Value, and `provider` maps to Series/provider.
- No text column can be auto-selected as a required numeric value when sampled data proves it is non-numeric.

---

### QA-04 — P2 — Duplicate names are indistinguishable in pickers and repository results

**Areas:** Dashboard comparison, Repository, Dashboard catalog, saved analyses

**Observed**

The workspace contains duplicate visible names, including:

- two **Untitled Dashboard** entries
- two **Conservation Insight — cover crop & tillage adoption** dashboards
- two **State Map** analyses

In the comparison dialog, duplicate options have the same label. In Repository, the two State Map analyses show the same type and date. A user cannot reliably know which object will open or be compared.

**Recommendation**

- Enrich every object picker with a stable disambiguator: workbook/folder, owner, updated time, panel count, source dataset, or a shortened object id.
- Warn during save when the same object type already has the same name in the same scope.
- Prefer a default unique name such as `Untitled Dashboard 2`.
- In compare selectors, use explicit labels such as “Left dashboard” and “Right dashboard.”

**Acceptance criteria**

- Every duplicate option is distinguishable without opening it.
- Newly created untitled objects receive unique display names.

---

### QA-05 — P2 — Several icon/action controls lack object-specific accessible names

**Areas:** Explore saved analyses, Studio data rail, Compare dashboards

**Observed**

Explore exposes saved-analysis buttons to assistive technology only as:

- `★`
- `▦`
- `✕`

The Studio data rail repeats buttons named only **Duplicate** and **Delete** for each query. The compare dialog’s two native selects have no accessible labels.

Mouse-hover `title` text is not an adequate accessible name and is unavailable to many touch and keyboard users.

**Recommendation**

- Add object-specific `aria-label` values, for example:
  - “Pin State Map to Home”
  - “Add State Map to the current dashboard”
  - “Delete State Map”
  - “Duplicate cost_by_source”
- Label compare selects **Left dashboard** and **Right dashboard**.
- Extend the existing accessibility regression checks to these dynamic lists and dialogs.

**Acceptance criteria**

- Automated accessibility inspection finds no symbol-only or repeated ambiguous action names.
- Screen-reader output identifies both the action and its target.

---

### QA-06 — P2 — Restore banner obscures active controls across unrelated sections

**Area:** Global restore-unsaved-work banner

**Observed**

The fixed restore banner remained visible across Home, Explore, Dashboards, Datasets, Connections, Repository, and Studio. At the tested desktop viewport it covered:

- saved-analysis rows in Explore
- the Explore analysis name/save/add-to-dashboard controls
- lower Studio content

This forces a decision about unrelated unsaved work before the user can comfortably use other sections.

**Recommendation**

- Reserve layout space for the banner instead of overlaying content, or place it in a non-blocking notification area.
- Collapse it to a smaller recoverable notice after navigation away from Studio.
- Consider showing the full prompt only in Studio/Home and a compact indicator elsewhere.

**Acceptance criteria**

- The banner never overlaps an interactive control at supported desktop, tablet, or phone sizes.
- Users can continue browsing without discarding or restoring work.

---

### QA-07 — P2 — Clickable rows contain nested interactive actions

**Areas:** Datasets, Connections, Repository

**Observed**

Catalog rows are exposed as `role="button"` while also containing Test, Edit, Delete, privacy, pin, or quick-edit buttons. This produces button-like containers with interactive descendants in the accessibility tree.

The application includes event guards to prevent most mouse clicks from bubbling to the row, but the semantic structure remains confusing and is fragile for keyboard and assistive-technology behavior.

**Recommendation**

- Use a non-interactive row container.
- Make the object title a link/button for the primary open/edit action.
- Keep secondary actions as sibling buttons in a clearly labeled action group.

**Acceptance criteria**

- No element with button semantics contains another interactive control.
- Tab order and Enter/Space behavior are predictable for both the row’s primary action and its secondary actions.

---

### QA-08 — P3 — New-connection intro text is stale

**Area:** Connections → New connection

**Observed**

The chooser says: **“More adapters (Postgres, Redshift, Azure, files) join this list over time.”**

The same dialog already lists PostgreSQL/PostgREST, Amazon Redshift, and CSV/JSON files. Azure is not listed.

**Recommendation**

Replace the roadmap sentence with current guidance, such as: “Choose a source below. Some connectors require browser CORS access or a link-shared file.”

---

### QA-09 — P3 — README entry point conflicts with the deployed application path

**Area:** Developer documentation

**Observed**

`README.md` says the Studio app lives at the repository root, describes `index.html` as the app shell, and tells developers to open `http://localhost:8000/`. Current repository guidance in `CLAUDE.md` correctly says:

- root `/` is the public marketing page
- the application is `/app/`
- `app/index.html` is the app shell

**Why it matters**

A developer following README can believe the application failed to start when they see the marketing page.

**Recommendation**

Update README run and layout sections to use `http://localhost:8000/app/` and the current root/app split.

---

### QA-10 — Verify — Production was one changelog version behind repository main

**Observed**

- Production footer: `v513`
- Current repository changelog: `v514`

This may have been a normal deployment window or service-worker cache delay rather than a defect.

**Recommendation**

- Confirm the Pages deployment for commit `76337ec30e30fcfea873dd7c6fed2e19f9a56253`.
- Verify a fresh/private browser receives v514.
- If stale clients remain on v513, inspect the service-worker update/activation path and footer build stamping.

## What was intentionally not changed or destructively tested

- No source code was corrected.
- Existing dashboards, datasets, connections, analyses, jobs, accounts, workbooks, settings, and backend data were not deleted.
- **Clear local data**, **Sign out**, account/rights mutations, workspace overwrite/adopt/wipe, and demo-pack removal were not executed in production.
- No real Snowflake, Databricks, BigQuery, Redshift, PostgREST, Google Sheets, Turso, Firebase, or generic HTTP credentials/endpoints were supplied, so production connectivity for those systems was not exercised.
- Production file upload/import and download/export actions were not completed. Their implementation paths passed the automated suite.
- No CAPTCHA, browser permission prompt, or secret submission was encountered or accepted.

## Suggested implementation order

1. QA-01 and QA-02 together: credential autofill prevention and accurate secret-storage disclosure.
2. QA-03: fix Explore’s column inference and add the exact regression case.
3. QA-04 and QA-05: make duplicate objects and dynamic actions unambiguous.
4. QA-06 and QA-07: remove overlay obstruction and nested interactive semantics.
5. QA-08 and QA-09: correct stale product/developer guidance.
6. Verify QA-10 after the current deployment window.

## Regression tests to add

- Opening every new credentialed adapter yields empty secret inputs with appropriate autocomplete metadata.
- Remote backend state changes the Connections credential-storage message.
- The county demo opens directly to a rendered choropleth with `pct` as Value.
- Duplicate-name compare/repository entries expose distinct accessible labels.
- All saved-analysis and Studio data-rail action buttons include the target object in their accessible name.
- Restore banner intersection checks prove it does not cover focusable controls at desktop/tablet/phone breakpoints.
- Accessibility assertion that button-role rows contain no interactive descendants.
