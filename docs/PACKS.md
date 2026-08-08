# PACKS.md — how a sample pack ships its data (the contract)

The registry in `app/demopacks.js` is the operating manual for what a pack *is*
(`Studio.DEMO_PACKS`, one entry, nothing outside it may name a pack — SP-0 slice 1).
This file is the contract for what a pack's **data** may be and how it gets here.
It exists because the rule up to 2026-08-08 was unwritten and absolute — *synthetic,
deterministic, generated in JS, never fetched* — and the moment a pack carries real
public data (SP-1 is the first) that rule stops answering the questions that matter:
whose data is this, under what terms, and can anyone reproduce it?

## The two kinds of pack data

**Synthetic** — generated in JS at install time, as both shipped packs do today. No
files, no fetch, no licence question. It must still say so in plain words: the entry
declares `source: { kind: "synthetic", label: "…" }` and the app shows that line.

**Real** — a genuine outside dataset. Four rules, all enforced:

1. **Embedded, never fetched.** Data ships as committed CSV in `data/packs/<id>/`
   and is inlined at install. The app is local-first and works offline; a pack must
   not break because a government site moved a URL, and installing one must not
   depend on the network.
2. **Extracted by a committed script.** `tools/pack-extract/<id>.mjs` fetches the
   public source, subsets/aggregates it, and writes the CSV through
   `writePack()` in `tools/pack-extract/lib.mjs`. **The script is the provenance
   record** — source URL, retrieval date, and every filter applied are readable in
   it, and re-running it re-derives the data byte-for-byte (sort your rows; keep
   every step deterministic, so a re-run that changes nothing is an empty diff).
   `writePack()` also emits `data/packs/<id>/SOURCE.json`, the machine-readable
   half of the same record.
3. **≤150 KB of CSV per pack.** The whole workspace is one localStorage blob and
   twelve packs have to coexist in it. `writePack()` refuses to exceed it and
   `tools/validate.mjs` fails the dev gate on it — the same treatment `sw.js` gets,
   for the same reason: make the regression loud instead of invisible. Subset or
   aggregate harder; do not raise the budget to fit a lazy extract.
4. **Credited where it is read.** The entry's `source` carries `name`, `url`,
   `licence` and an ISO `retrieved` date. That line renders on the pack's Settings
   card AND in the subtitle of every dashboard the pack seeds (backfilled by
   `reconcilePackDashboards`, idempotently, so an existing install heals without a
   reinstall). Anything **not** public domain is `kind: "licensed"` and must also
   have a `THIRD-PARTY-NOTICES.md` line.

## The registry entry

```js
source: { kind: "public",
          name: "US Census County Business Patterns",
          url: "https://www.census.gov/programs-surveys/cbp.html",
          licence: "Public domain (U.S. Government work)",
          retrieved: "2026-08-08" },
```

`kind` is `synthetic` | `public` | `licensed`. `Studio.packSourceIssues(entry)` is
the shape rule as code — the suite drives it with fixtures, and
`tools/pack-extract/lib.mjs` applies the same rules to what a script is about to
write, so the data and its registry entry can never describe different sources.

## What is checked, and where

| Rule | Enforced by |
|---|---|
| every entry declares a well-formed `source` | `tools/validate.mjs` (dev gate) + the SP-0 conformance loop in `tests/run.js` |
| data has an extract script; a script has a registered pack | `tools/validate.mjs` |
| `data/packs/<id>/` holds only CSV + `SOURCE.json` | `tools/validate.mjs` |
| ≤150 KB CSV per pack | `writePack()` at extract time, `tools/validate.mjs` at gate time |
| licensed data is in `THIRD-PARTY-NOTICES.md` | `tools/validate.mjs` |
| the source line reaches the Settings card and pack dashboards' subtitles | `tests/run.js` |

## Adding a real-data pack (the checklist)

1. Write `tools/pack-extract/<id>.mjs`; run it from the repo root; commit
   `data/packs/<id>/`.
2. Register the pack in `app/demopacks.js` with its `source` (and the usual
   `folder`/`seeds`/`install` — the SP-0 entry contract).
3. `kind: "licensed"`? Add the `THIRD-PARTY-NOTICES.md` row in the same PR.
4. `node tools/validate.mjs`, then the suite. The SP-0 conformance loop already
   covers install/tagging/folders/uninstall for any registered pack — a new pack is
   covered by construction, not by someone remembering to write it a test.
