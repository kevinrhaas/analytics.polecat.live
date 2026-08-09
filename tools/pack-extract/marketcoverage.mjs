// tools/pack-extract/marketcoverage.mjs — SP-1 "Market Coverage", the first pack that
// ships REAL data. The contract is docs/PACKS.md; this file is the provenance record
// it demands: every source URL, the retrieval date and every filter applied are
// readable here, and re-running it re-derives byte-identical CSV (rows are sorted,
// nothing is sampled, nothing depends on the clock).
//
//   node tools/pack-extract/marketcoverage.mjs
//
// THE QUESTION THE PACK ASKS: where is a category under-represented versus the people
// who live there and the businesses already trading there? That needs two halves that
// arrive from two different Census programs, which is exactly why the pack ships them
// as two datasets joined by a JOB rather than one pre-joined table — the join, and the
// saturation index derived from it, ARE the data-prep story the pack is here to show.
//
// SOURCES (both public domain, both keyless bulk files — api.census.gov now requires an
// API key, and a pack's extract must be reproducible by anyone who clones the repo):
//
//   1. County Business Patterns 2023, county file
//      https://www2.census.gov/programs-surveys/cbp/datasets/2023/cbp23co.zip
//      → establishment counts per county per NAICS level. We keep three rows' worth of
//        it per county: the all-industry total and two consumer categories.
//   2. American Community Survey 2023 5-year, table-based Summary File
//      https://www2.census.gov/programs-surveys/acs/summary_file/2023/table-based-SF/
//      → the demographics Kevin asked for (population, households, median age, median
//        household income, education), one pipe-delimited .dat per table.
//   3. Census Gazetteer 2023 county file
//      https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/
//      → county names + postal state, so a table View reads in English rather than FIPS.
//
// THE TWO FILTERS, both deliberate and both visible in the output:
//
//   * TERRITORIES ARE DROPPED (state FIPS > 56). The app's county choropleth draws the
//     us-atlas AlbersUsa plane, which has no Puerto Rico geometry — shipping rows the
//     map cannot draw would be data that silently disappears.
//   * A POPULATION FLOOR (POP_FLOOR below). Not a budget dodge dressed as analysis: a
//     saturation index is meaningless where the denominator is a few thousand people
//     (one diner in a 900-person county reads as 100x the national rate), and a chain's
//     site-selection universe genuinely starts at a population floor. It is stated on
//     the pack card and in SOURCE.json notes so the reader is never guessing why their
//     county is grey. It also happens to be what keeps the pack inside the 150KB
//     per-pack budget — see the byte report the script prints.
import { writePack, toCsv } from "./lib.mjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const RETRIEVED = "2026-08-09";
const CBP_YEAR = 2023;
const ACS_YEAR = 2023;

// Counties below this many people are dropped (see the header). 20,000 keeps ~60% of
// counties and ~97% of the US population, and every dropped county is one where the
// index would have been noise.
const POP_FLOOR = 20000;

const CBP_URL = `https://www2.census.gov/programs-surveys/cbp/datasets/${CBP_YEAR}/cbp${String(CBP_YEAR).slice(2)}co.zip`;
const ACS_BASE = `https://www2.census.gov/programs-surveys/acs/summary_file/${ACS_YEAR}/table-based-SF/data/5YRData`;
const GAZ_URL = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_counties_national.zip";

// The CBP NAICS codes we keep. CBP pads a code to six characters, and the padding
// character is part of the code: the all-industry total is "------", a two-digit sector
// is "72----", and a three-digit subsector is "722///" (slashes, not dashes — reading
// "722---" as a subsector silently matches nothing).
const CATEGORIES = [
  { code: "------", column: "establishments" }, // every industry — "the businesses already there"
  { code: "722///", column: "food_services" },  // Food services and drinking places
  { code: "445///", column: "grocery" },        // Food and beverage retailers
];

// The ACS tables, and which estimate cells we take out of each. A table-based-SF .dat
// is pipe-delimited with a GEO_ID column and one <TABLE>_E<nnn> / _M<nnn> pair per cell;
// counties are the 0500000US<fips> GEO_IDs. -666666666 is the ACS "no sample" sentinel.
const ACS_TABLES = {
  b01003: ["E001"],                             // total population
  b11001: ["E001"],                             // households
  b01002: ["E001"],                             // median age
  b19013: ["E001"],                             // median household income
  b15003: ["E001", "E022", "E023", "E024", "E025"], // 25+ total, bachelor's, master's, professional, doctorate
};

const tmp = mkdtempSync(path.join(tmpdir(), "marketcoverage-"));

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} — HTTP ${res.status}`);
  return res;
}

// Fetch a zip and return the text of its single member. execFileSync on `unzip` keeps
// this dependency-free; the archives are one-file and the extraction is not the
// interesting part of the provenance.
async function unzipOne(url, name) {
  const file = path.join(tmp, name + ".zip");
  writeFileSync(file, Buffer.from(await (await get(url)).arrayBuffer()));
  return execFileSync("unzip", ["-p", file], { maxBuffer: 1 << 30, encoding: "latin1" });
}

async function text(url) {
  return (await get(url)).text();
}

function num(v) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n > -666666665 ? n : null;
}

// ---- 1. CBP: establishments per county, per kept category ------------------------
async function fetchEstablishments() {
  console.log(`cbp ${CBP_YEAR}: ${CBP_URL}`);
  const raw = await unzipOne(CBP_URL, "cbp");
  const lines = raw.split(/\r?\n/);
  const header = lines[0].split(",").map((s) => s.replace(/"/g, ""));
  const at = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`cbp: no "${name}" column — the file's layout changed`);
    return i;
  };
  const [iState, iCty, iNaics, iEst] = [at("fipstate"), at("fipscty"), at("naics"), at("est")];
  const wanted = new Map(CATEGORIES.map((c) => [c.code, c.column]));
  const out = new Map(); // fips -> { column: count }
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const f = line.split(",").map((s) => s.replace(/"/g, ""));
    const column = wanted.get(f[iNaics]);
    if (!column) continue;
    const fips = f[iState] + f[iCty];
    if (Number(f[iState]) > 56) continue; // territories: no geometry to draw them on
    if (!out.has(fips)) out.set(fips, {});
    out.get(fips)[column] = num(f[iEst]) ?? 0;
  }
  // A NAICS code that matches nothing produces a column of zeros, not an error — which
  // is exactly how the first run of this script shipped an all-zero `food_services`
  // (it padded the subsector with dashes instead of slashes). Every kept category has
  // to actually appear, or the extract fails loudly.
  for (const { code, column } of CATEGORIES) {
    const seen = [...out.values()].filter((r) => r[column] > 0).length;
    if (seen < out.size / 4) throw new Error(`cbp: NAICS "${code}" (${column}) matched ${seen} of ${out.size} counties — check the code's padding against the file`);
  }
  console.log(`cbp: ${out.size} counties`);
  return out;
}

// ---- 2. ACS: the demographic half ------------------------------------------------
async function fetchAcs() {
  const out = new Map(); // fips -> { B01003_E001: n, ... }
  for (const [table, cells] of Object.entries(ACS_TABLES)) {
    const url = `${ACS_BASE}/acsdt5y${ACS_YEAR}-${table}.dat`;
    console.log(`acs ${ACS_YEAR}: ${url}`);
    const body = await text(url);
    const lines = body.split(/\r?\n/);
    const header = lines[0].replace(/^﻿/, "").split("|");
    const iGeo = header.indexOf("GEO_ID");
    const idx = cells.map((c) => {
      const name = `${table.toUpperCase()}_${c}`;
      const i = header.indexOf(name);
      if (i < 0) throw new Error(`acs ${table}: no "${name}" column — the table's layout changed`);
      return [name, i];
    });
    for (let i = 1; i < lines.length; i++) {
      const f = lines[i].split("|");
      const geo = f[iGeo];
      if (!geo || !geo.startsWith("0500000US")) continue; // counties only
      const fips = geo.slice("0500000US".length);
      if (Number(fips.slice(0, 2)) > 56) continue;
      if (!out.has(fips)) out.set(fips, {});
      for (const [name, j] of idx) out.get(fips)[name] = num(f[j]);
    }
  }
  console.log(`acs: ${out.size} counties`);
  return out;
}

// ---- 3. Gazetteer: county names --------------------------------------------------
async function fetchNames() {
  console.log(`gazetteer: ${GAZ_URL}`);
  const raw = await unzipOne(GAZ_URL, "gaz");
  const lines = raw.split(/\r?\n/);
  const header = lines[0].split("\t").map((s) => s.trim());
  const [iUsps, iGeoid, iName] = ["USPS", "GEOID", "NAME"].map((n) => header.indexOf(n));
  const out = new Map();
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split("\t");
    if (f.length < 4) continue;
    const fips = f[iGeoid].trim();
    if (Number(fips.slice(0, 2)) > 56) continue;
    // "Autauga County" / "St. Martin Parish" / "Yukon-Koyukuk Census Area" — the type
    // word is the same for every county in a state and costs ~7 bytes on 3,000 rows,
    // so it is dropped here and the column is named `county` to say what it holds.
    const name = f[iName].trim().replace(/\s+(County|Parish|Borough|Census Area|Municipality|City and Borough|city|Municipio)$/, "");
    out.set(fips, { county: name, state: f[iUsps].trim() });
  }
  console.log(`gazetteer: ${out.size} counties`);
  return out;
}

const [estab, acs, names] = [await fetchEstablishments(), await fetchAcs(), await fetchNames()];

// ---- shape the two datasets ------------------------------------------------------
const round1 = (n) => (n == null ? "" : Math.round(n * 10) / 10);

const demographics = [];
const establishments = [];
let droppedFloor = 0, droppedNoName = 0;

for (const fips of [...acs.keys()].sort()) {
  const a = acs.get(fips);
  const pop = a.B01003_E001;
  if (pop == null || pop < POP_FLOOR) { droppedFloor++; continue; }
  const n = names.get(fips);
  if (!n) { droppedNoName++; continue; } // a county the Gazetteer vintage doesn't carry
  const edu25 = a.B15003_E001;
  const degrees = ["E022", "E023", "E024", "E025"].reduce((s, c) => s + (a[`B15003_${c}`] ?? 0), 0);
  demographics.push({
    fips, county: n.county, state: n.state,
    population: pop,
    households: a.B11001_E001 ?? "",
    median_age: round1(a.B01002_E001),
    median_income: a.B19013_E001 ?? "",
    bachelors_pct: edu25 ? round1((degrees / edu25) * 100) : "",
  });
  const e = estab.get(fips) || {};
  establishments.push({
    fips,
    establishments: e.establishments ?? 0,
    food_services: e.food_services ?? 0,
    grocery: e.grocery ?? 0,
  });
}

const DEMO_COLS = ["fips", "county", "state", "population", "households", "median_age", "median_income", "bachelors_pct"];
const ESTAB_COLS = ["fips", "establishments", "food_services", "grocery"];

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1) + "KB";
console.log(`kept ${demographics.length} counties (dropped ${droppedFloor} below ${POP_FLOOR.toLocaleString("en-US")} people, ${droppedNoName} with no Gazetteer name)`);
console.log(`  county-demographics.csv ${kb(toCsv(DEMO_COLS, demographics))}`);
console.log(`  county-establishments.csv ${kb(toCsv(ESTAB_COLS, establishments))}`);

writePack({
  pack: "marketcoverage",
  source: {
    kind: "public",
    name: "US Census Bureau — County Business Patterns and American Community Survey",
    url: "https://www.census.gov/programs-surveys/cbp.html",
    licence: "Public domain (U.S. Government work)",
    retrieved: RETRIEVED,
  },
  notes: [
    `County Business Patterns ${CBP_YEAR} county file — establishment counts for all industries (NAICS ------), food services and drinking places (722), and food and beverage retailers (445)`,
    `American Community Survey ${ACS_YEAR} 5-year table-based Summary File — B01003 population, B11001 households, B01002 median age, B19013 median household income, B15003 educational attainment (bachelor's degree or higher, share of the 25-and-over population)`,
    "County names and postal states from the 2023 Census Gazetteer county file; the type word (County/Parish/Borough/Census Area/Municipio) is dropped",
    `Counties under ${POP_FLOOR.toLocaleString("en-US")} people are excluded — a saturation index over a few thousand residents is noise, not a finding`,
    "Puerto Rico and the island areas (state FIPS above 56) are excluded: the app's county choropleth has no geometry for them",
  ],
  files: {
    "county-demographics.csv": { columns: DEMO_COLS, rows: demographics },
    "county-establishments.csv": { columns: ESTAB_COLS, rows: establishments },
  },
});

rmSync(tmp, { recursive: true, force: true });
