// tools/pack-extract/countymigration.mjs — SP-13 "Where America Moved". The contract is
// docs/PACKS.md; this file is the provenance record it demands: every source URL, the
// retrieval date and every filter applied are readable here, and re-running it re-derives
// the same CSV from the same upstream (rows are sorted, nothing is sampled, nothing
// depends on the clock).
//
//   node tools/pack-extract/countymigration.mjs
//
// THE QUESTION THE PACK ASKS: who is winning and losing households — and are the people
// arriving richer or poorer than the people leaving? No single-county table can answer the
// second half, because it needs the income that MOVED, not the income that lives there.
// The IRS publishes exactly that, and almost nobody demos it.
//
// SOURCE: IRS Statistics of Income, US Population Migration Data. The IRS matches each
// year's filed returns to the previous year's by taxpayer id and reports, for every
// origin→destination pair, how many RETURNS moved (a return ≈ a household), how many
// EXEMPTIONS moved (≈ people) and their AGGREGATE ADJUSTED GROSS INCOME. Public domain
// (U.S. Government work), no key, no registration, plain CSV over https.
//
//   countyinflow2223.csv    county pairs, read from the DESTINATION county's side
//   countyoutflow2223.csv   the same pairs, read from the ORIGIN county's side
//   stateinflow2223.csv     state pairs + each state's non-migrants
//   stateoutflow2223.csv    the same, from the origin state's side
//
// 2223 is the most recent published pair of filing years (returns filed in 2022 matched to
// returns filed in 2023 — so "the 2022→2023 move year"). 2324 does not exist yet; the check
// is one constant below and a re-run against a newer vintage is a one-line change.
//
// UNITS, kept exactly as the IRS publishes them so nothing here silently rescales a public
// number: AGI is THOUSANDS of dollars. Every column carrying it says `_agi_k`.
//
// THE FILTERS AND CHOICES, all deliberate and all visible in the output:
//
//   * US MOVES ONLY (the `97/000` "Total Migration-US" row), not US-and-foreign (`96/000`).
//     Foreign inflow has no comparable outflow measurement, so mixing it in would make
//     every coastal county look like a net winner for a reason that is an artefact of what
//     the IRS can observe. Foreign flows are dropped, and the state table's totals are the
//     US ones too, so in and out are always the same universe.
//   * PSEUDO-FIPS ROWS ARE NOT PLACES. The files encode their own subtotals as state codes
//     57-59 and 96-98 ("Total Migration-US", "Other flows - South", "Foreign - Overseas").
//     Only real state codes 01-56 are read as a place; the non-migrant ("stayers") row is
//     the self-pair, where origin and destination are the same FIPS.
//   * IRS DISCLOSURE SUPPRESSION IS DROPPED, NOT ZEROED. A pair too small to publish comes
//     through as -1. A -1 summed as a number would be a quiet lie, so suppressed pairs are
//     excluded from the pair tables and the kept share is printed and recorded in
//     SOURCE.json. County TOTALS are the IRS's own published totals, not a sum of pairs, so
//     they are unaffected by this.
//   * THE PAIR TABLES ARE TOPPED PER STATE, because the full matrix is not affordable.
//     There are ~54,000 published county pairs and ~2,500 state pairs; the whole pack has
//     150KB. So the county file carries every county's NET position (the national
//     choropleth is the point) and the pair tables carry the biggest corridors OUT OF EACH
//     STATE — top STATE_FLOWS_PER_STATE destinations at state grain, top
//     COUNTY_PAIRS_PER_STATE at county grain. Per-state rather than top-N nationally on
//     purpose: a national cut is all Sun Belt, and eight small states dropped out of it
//     entirely, so a reader in Wyoming found their state missing from a flow table. The
//     kept share of households is measured and printed rather than asserted.
//   * COUNTY NAMES DROP THE TYPE WORD ("Autauga County" → "Autauga"), the same convention
//     and the same regex as SP-1's extract, so the two packs' county labels join. The IRS
//     itself truncates the name field at 32 characters, which this does not repair —
//     "Greater Bridgeport Planning Regio" is what the source says.
//
// ONE HONEST GAP, MEASURED HERE RATHER THAN LEFT FOR A READER TO FIND: the app's county
// atlas (vendor/geo/counties-albers-10m.json) predates the 2022 boundary changes, so a
// handful of counties in this data have no shape to draw. They are KEPT — dropping them
// would delete Connecticut's entire county coverage, since its eight counties were replaced
// by nine planning regions the atlas has never had — and the exact list is re-derived from
// the committed atlas on every run and written into SOURCE.json.
import { readFileSync } from "node:fs";
import path from "node:path";
import { writePack, ROOT } from "./lib.mjs";

const RETRIEVED = "2026-08-10";

// Filing-year pair. The IRS names its files by the two-digit ends: 2223 = 2022→2023.
const VINTAGE = "2223";
const YEARS = "2022-2023";
const BASE = "https://www.irs.gov/pub/irs-soi";

// How much of the pair matrix the 150KB budget buys. Both are measured, not guessed: the
// script prints the share of moved households each table keeps, and SOURCE.json records it.
const STATE_FLOWS_PER_STATE = 6;
const COUNTY_PAIRS_PER_STATE = 3;

// The IRS's own pseudo-states. Anything at or above this is a subtotal, not a place.
const FIRST_PSEUDO_STATE = 57;

// SP-1's regex, verbatim, so "Autauga" means the same county in both packs.
const TYPE_WORD = /\s+(County|Parish|Borough|Census Area|Municipality|City and Borough|city|Municipio)$/;

async function fetchCsv(name) {
  const url = `${BASE}/${name}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      const text = await res.text();
      process.stdout.write(`  ${name}: ${(text.length / 1024 / 1024).toFixed(1)}MB\n`);
      return parse(text);
    }
    // A short file is the failure mode this whole directory exists to prevent, so a
    // transient error waits rather than shipping whatever came back.
    if (attempt >= 4) throw new Error(`${url} — HTTP ${res.status} after ${attempt} attempts`);
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
}

// The files are plain comma-separated with no quoting and a BOM on some vintages.
function parse(text) {
  const lines = text.replace(/^﻿/, "").trim().split(/\r?\n/);
  const cols = lines[0].split(",").map((c) => c.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = {};
    cols.forEach((c, i) => { row[c] = (cells[i] || "").trim(); });
    return row;
  });
}

// The biggest N of each group, groups in key order — how both pair tables are cut. Sorting
// inside the group and emitting in key order keeps the output deterministic.
function topPerGroup(rows, keyOf, n, cmp) {
  const groups = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const out = [];
  for (const [, list] of [...groups.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
    list.sort(cmp);
    out.push(...list.slice(0, n));
  }
  return out;
}

const fips = (state, county) => `${state}${county}`;
const isPlace = (state) => Number(state) >= 1 && Number(state) < FIRST_PSEUDO_STATE;
const suppressed = (row) => Number(row.n1) < 0;
const cleanName = (raw) => raw.replace(/\s+Total Migration-.*$/, "").replace(TYPE_WORD, "");

async function main() {
  process.stdout.write(`IRS SOI migration ${YEARS} (files …${VINTAGE}.csv)\n`);
  const [countyIn, countyOut, stateIn, stateOut] = await Promise.all([
    fetchCsv(`countyinflow${VINTAGE}.csv`),
    fetchCsv(`countyoutflow${VINTAGE}.csv`),
    fetchCsv(`stateinflow${VINTAGE}.csv`),
    fetchCsv(`stateoutflow${VINTAGE}.csv`),
  ]);

  /* ---- 1. Every county's net position ------------------------------------------------
     The identity (name, postal state) and both totals come from the IRS's OWN subtotal
     rows, never from summing pairs — summing would silently subtract the suppressed ones. */
  const counties = new Map();
  const county = (id) => {
    if (!counties.has(id)) counties.set(id, { fips: id });
    return counties.get(id);
  };
  for (const r of countyIn) {
    const id = fips(r.y2_statefips, r.y2_countyfips);
    if (r.y1_statefips === "96" && r.y1_countyfips === "000") {
      const c = county(id);
      c.county = cleanName(r.y1_countyname);
      c.state = r.y1_state;
    }
    if (r.y1_statefips === "97" && r.y1_countyfips === "000" && !suppressed(r)) {
      const c = county(id);
      c.in_returns = Number(r.n1);
      c.in_agi_k = Number(r.agi);
    }
  }
  for (const r of countyOut) {
    const id = fips(r.y1_statefips, r.y1_countyfips);
    if (r.y2_statefips === "96" && r.y2_countyfips === "000") {
      const c = county(id);
      if (!c.county) { c.county = cleanName(r.y2_countyname); c.state = r.y2_state; }
    }
    if (r.y2_statefips === "97" && r.y2_countyfips === "000" && !suppressed(r)) {
      const c = county(id);
      c.out_returns = Number(r.n1);
      c.out_agi_k = Number(r.agi);
    }
  }
  // A county with only one direction published cannot answer either of the pack's two
  // questions, so it is dropped rather than shipped with a hole a chart would read as zero.
  const countyRows = [...counties.values()]
    .filter((c) => c.county && c.in_returns != null && c.out_returns != null)
    .sort((a, b) => a.fips.localeCompare(b.fips));
  const dropped = counties.size - countyRows.length;

  /* ---- 2. Each state's totals, including the STAYERS ---------------------------------
     The stayers are the comparison the pack is named for: the non-migrant row is the
     self-pair, and it carries the income of the households that did not move at all. It
     exists at state grain only in these files, which is why the leavers-vs-stayers reading
     is a state one and the county table answers arrivers-vs-leavers instead.

     A state's own subtotal rows name it by its POSTAL code ("AL Non-migrants"), so the
     spelled-out name is read from the rows where the state appears as somebody ELSE's
     counterparty ("Georgia") — the one place these files write it out. */
  const states = new Map();
  const state = (code, postal) => {
    if (!states.has(code)) states.set(code, { code, state: postal || "" });
    const s = states.get(code);
    if (postal && !s.state) s.state = postal;
    return s;
  };
  const isSubtotal = (name) => /Total Migration|Non-migrants|Other flows|^Foreign/.test(name || "");
  const spelled = new Map();
  for (const r of stateIn) {
    if (isPlace(r.y1_statefips) && !isSubtotal(r.y1_state_name)) spelled.set(r.y1_state, r.y1_state_name);
  }
  for (const r of stateOut) {
    if (isPlace(r.y2_statefips) && !isSubtotal(r.y2_state_name)) spelled.set(r.y2_state, r.y2_state_name);
  }
  for (const r of stateIn) {
    const dest = r.y2_statefips;
    if (!isPlace(dest)) continue;
    if (r.y1_statefips === "97" && /Total Migration-US$/.test(r.y1_state_name) && !suppressed(r)) {
      const s = state(dest);
      s.in_returns = Number(r.n1); s.in_people = Number(r.n2); s.in_agi_k = Number(r.agi);
    }
    if (r.y1_statefips === dest && !suppressed(r)) {
      const s = state(dest, r.y1_state);
      s.stay_returns = Number(r.n1); s.stay_people = Number(r.n2); s.stay_agi_k = Number(r.agi);
    }
  }
  for (const r of stateOut) {
    const origin = r.y1_statefips;
    if (!isPlace(origin)) continue;
    if (r.y2_statefips === "97" && /Total Migration-US$/.test(r.y2_state_name) && !suppressed(r)) {
      const s = state(origin);
      s.out_returns = Number(r.n1); s.out_people = Number(r.n2); s.out_agi_k = Number(r.agi);
    }
  }
  const stateRows = [...states.values()]
    .filter((s) => s.state && s.in_returns != null && s.out_returns != null && s.stay_returns != null)
    .map((s) => ({ ...s, state_name: spelled.get(s.state) || s.state }))
    .sort((a, b) => a.state.localeCompare(b.state));

  /* ---- 3. The state→state corridors: the flow hero -----------------------------------
     Read from the OUTFLOW file so a row means "households that left A for B", which is the
     direction a sankey draws. Self-pairs are the non-migrants, not a flow. */
  const stateFlows = [];
  let stateFlowTotal = 0, stateFlowSuppressed = 0;
  const postal = new Map([...states.values()].map((s) => [s.code, s.state]));
  for (const r of stateOut) {
    if (!isPlace(r.y1_statefips) || !isPlace(r.y2_statefips)) continue;
    if (r.y1_statefips === r.y2_statefips) continue;
    if (suppressed(r)) { stateFlowSuppressed++; continue; }
    const from = postal.get(r.y1_statefips), to = postal.get(r.y2_statefips);
    if (!from || !to) continue;
    stateFlowTotal += Number(r.n1);
    stateFlows.push({ from_state: from, to_state: to, returns: Number(r.n1), people: Number(r.n2), agi_k: Number(r.agi) });
  }
  const stateFlowRows = topPerGroup(stateFlows, (r) => r.from_state, STATE_FLOWS_PER_STATE,
    (a, b) => b.returns - a.returns || (a.to_state).localeCompare(b.to_state));
  const stateFlowKept = stateFlowRows.reduce((n, r) => n + r.returns, 0);

  /* ---- 4. The biggest county corridors out of each state ------------------------------
     "Top-N pairs per state" rather than top-N nationally, so the table is not just the
     Sun Belt: every state contributes its own largest moves and a reader can find theirs. */
  const label = new Map(countyRows.map((c) => [c.fips, c]));
  const pairs = [];
  let pairTotal = 0, pairSuppressed = 0;
  for (const r of countyOut) {
    if (!isPlace(r.y1_statefips) || !isPlace(r.y2_statefips)) continue;
    const from = fips(r.y1_statefips, r.y1_countyfips), to = fips(r.y2_statefips, r.y2_countyfips);
    if (from === to) continue;             // the non-migrant self-pair
    if (suppressed(r)) { pairSuppressed++; continue; }
    if (!label.has(from) || !label.has(to)) continue;
    pairTotal += Number(r.n1);
    const f = label.get(from), t = label.get(to);
    pairs.push({
      from_fips: from, from_county: f.county, from_state: f.state,
      to_fips: to, to_county: t.county, to_state: t.state,
      returns: Number(r.n1), people: Number(r.n2), agi_k: Number(r.agi),
    });
  }
  const countyPairRows = topPerGroup(pairs, (r) => r.from_state, COUNTY_PAIRS_PER_STATE,
    (a, b) => b.returns - a.returns || (a.from_fips + a.to_fips).localeCompare(b.from_fips + b.to_fips));
  const pairKept = countyPairRows.reduce((n, r) => n + r.returns, 0);

  /* ---- 5. Which counties the app cannot draw, re-derived rather than remembered --------
     The committed atlas is the geometry the choropleth uses, so the gap between it and this
     data is a fact about the pack and belongs in its provenance record. */
  const atlas = JSON.parse(readFileSync(path.join(ROOT, "vendor", "geo", "counties-albers-10m.json"), "utf8"));
  const drawable = new Set(((atlas.objects.counties || {}).geometries || [])
    .map((g) => `0000${g.id}`.slice(-5)));
  const undrawable = countyRows.filter((c) => !drawable.has(c.fips));

  const pct = (part, whole) => `${((part / whole) * 100).toFixed(1)}%`;
  const notes = [
    `IRS SOI US Population Migration Data, filing years ${YEARS} (files …${VINTAGE}.csv)`,
    "US moves only (the IRS's own Total Migration-US subtotal); foreign flows dropped so inflow and outflow are the same universe",
    "AGI is thousands of dollars, exactly as published — columns carrying it are named _agi_k",
    `county-migration.csv: all ${countyRows.length} counties with both directions published (${dropped} dropped for a missing direction); totals are the IRS's own, never a sum of pairs`,
    `state-migration.csv: ${stateRows.length} rows — the 50 states and DC — including the non-migrant (stayers) row, which is the leavers-versus-stayers comparison`,
    "the two grains measure different universes and do NOT add up: a county's total counts every US move including within its own state, while a state's total counts only moves ACROSS state lines",
    `state-flows.csv: the ${STATE_FLOWS_PER_STATE} largest destinations out of each state, ${stateFlowRows.length} corridors of ${stateFlows.length} published, ${pct(stateFlowKept, stateFlowTotal)} of households moving between states`,
    `county-pairs.csv: the ${COUNTY_PAIRS_PER_STATE} largest destinations out of each state, ${countyPairRows.length} corridors, ${pct(pairKept, pairTotal)} of households moving between published county pairs`,
    `the app's committed county atlas (vendor/geo/counties-albers-10m.json) predates the 2022 boundary changes, so ${undrawable.length} counties in this data have no shape to draw: ${undrawable.map((c) => `${c.fips} ${c.county}, ${c.state}`).join("; ")}. They are kept — dropping them would delete Connecticut's whole county coverage, since its eight counties were replaced by nine planning regions the atlas has never had`,
    "the IRS truncates its county-name field at 32 characters and this extract does not repair it",
    `IRS disclosure suppression: ${stateFlowSuppressed} state pairs and ${pairSuppressed} county pairs came through as -1 and were excluded rather than zeroed. In this vintage that is none of them, because the IRS pools what it cannot publish into its own "Other flows" pseudo-rows, which are dropped as subtotals rather than places — the guard stays because other vintages do publish -1`,
    "county names drop the type word (County/Parish/Borough/Census Area/Municipality/Municipio), the same convention as the Market Coverage pack",
  ];
  notes.forEach((n) => process.stdout.write(`  · ${n}\n`));

  writePack({
    pack: "countymigration",
    source: {
      kind: "public",
      name: `IRS Statistics of Income — US Population Migration Data, ${YEARS}`,
      url: "https://www.irs.gov/statistics/soi-tax-stats-migration-data",
      licence: "Public domain (U.S. Government work)",
      retrieved: RETRIEVED,
    },
    notes,
    files: {
      "county-migration.csv": {
        columns: ["fips", "county", "state", "in_returns", "in_agi_k", "out_returns", "out_agi_k"],
        rows: countyRows,
      },
      "state-migration.csv": {
        columns: ["state", "state_name", "in_returns", "in_people", "in_agi_k",
                  "out_returns", "out_people", "out_agi_k", "stay_returns", "stay_people", "stay_agi_k"],
        rows: stateRows,
      },
      "state-flows.csv": {
        columns: ["from_state", "to_state", "returns", "people", "agi_k"],
        rows: stateFlowRows,
      },
      "county-pairs.csv": {
        columns: ["from_fips", "from_county", "from_state", "to_fips", "to_county", "to_state",
                  "returns", "people", "agi_k"],
        rows: countyPairRows,
      },
    },
  });
}

main().catch((err) => { process.stderr.write(`${err.stack || err}\n`); process.exit(1); });
