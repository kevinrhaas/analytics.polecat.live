// tools/pack-extract/contractawards.mjs — SP-6 "Federal Contract Awards". The contract
// is docs/PACKS.md; this file is the provenance record it demands: every source URL, the
// retrieval date and every filter applied are readable here, and re-running it re-derives
// the same CSV from the same upstream (rows are sorted, nothing is sampled, nothing
// depends on the clock).
//
//   node tools/pack-extract/contractawards.mjs
//
// THE QUESTION THE PACK ASKS: where does federal contract money actually go — which
// agencies buy what, from whom, and how much of each agency's spend lands with small
// business? That is a FLOW (agency → industry, agency → vendor), which is the one shape
// no other pack in the program supplies and the one sankey/marimekko charts are for.
//
// SOURCE: USASpending.gov API v2, the official public record of federal award spending,
// published by the Treasury Bureau of the Fiscal Service. Public domain (U.S. Government
// work), no API key, no rate-limit registration.
//
//   POST /api/v2/search/spending_by_category/awarding_agency/   agency marginals
//   POST /api/v2/search/spending_by_category/naics/             industry, per agency
//   POST /api/v2/search/spending_by_category/recipient/         vendors, per agency
//   POST /api/v2/search/spending_by_geography/                  place of performance, by CD
//
// A NOTE ON REPRODUCIBILITY, because it differs from SP-1's and pretending otherwise
// would be the dishonest kind of provenance. SP-1 reads frozen bulk FILES, so a re-run
// is byte-identical forever. This pack reads a LIVE API over a CLOSED fiscal year: the
// query is fully pinned (fiscal year, award types, category, ranking, row counts — every
// knob is a constant below), so the same request always asks the same question, but
// agencies do file corrections to closed years and those move the cents. Expect a re-run
// to reproduce the same rows in the same order with amounts that may drift slightly.
// RETRIEVED below is the date the committed CSV was taken, and it is what the pack card
// and every dashboard subtitle credit.
//
// THE FILTERS, all deliberate and all visible in the output:
//
//   * CONTRACTS ONLY (award types A/B/C/D — definitive contracts, purchase orders,
//     delivery orders, BPA calls). Grants, loans and direct payments are a different
//     question with a different unit of analysis, and mixing them would make "who wins
//     federal work" mean nothing.
//   * ONE FISCAL YEAR, the most recent CLOSED one. A part-year would make every agency
//     look like it collapsed, and the whole point of the pack is comparability.
//   * TOP N AGENCIES, TOP M ROWS EACH. The long tail of small agencies is bytes, not
//     insight, and the pack has a 150KB budget to live in. The kept share is measured
//     and printed, and stated in SOURCE.json, so a reader knows exactly how much of the
//     year is in front of them.
//   * TERRITORIES ARE DROPPED from the district table (state FIPS > 56 — AS, GU, MP, PR,
//     VI, whose at-large delegates USASpending codes as district 98). Same reason SP-1
//     drops them: the app's congressional-district map has no geometry for them, so those
//     rows would be data that silently disappears. It is 0.6% of the year's dollars and
//     it is stated in SOURCE.json rather than left for a reader to notice.
import { writePack, toCsv } from "./lib.mjs";

const RETRIEVED = "2026-08-10";

// The most recent CLOSED federal fiscal year (Oct 1 – Sep 30). Bump both together.
const FY = 2025;
const FY_START = `${FY - 1}-10-01`;
const FY_END = `${FY}-09-30`;

// Contracts. Not grants (award types 02-05), not loans (07/08), not direct payments (06,10).
const CONTRACT_TYPES = ["A", "B", "C", "D"];

const TOP_AGENCIES = 25;   // agencies kept, by total contract obligations
const TOP_PER_AGENCY = 12; // industries and vendors kept per agency

// USASpending's own name for the small-business recipient class. The share is computed by
// asking the SAME agency question twice — once unfiltered, once with this filter — rather
// than by summing vendor rows, which would only ever see the top of each agency's list.
const SMALL_BUSINESS = ["small_business"];

const API = "https://api.usaspending.gov";

const baseFilters = (extra) => ({
  time_period: [{ start_date: FY_START, end_date: FY_END }],
  award_type_codes: CONTRACT_TYPES,
  ...extra,
});

// One polite, retrying POST. The API is free and unauthenticated; a 429 or a 5xx is a
// reason to wait, not a reason to ship a short file — a silently truncated extract is the
// failure mode this whole directory exists to prevent.
let calls = 0;
async function post(path, body) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(API + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    calls++;
    if (res.ok) return res.json();
    if (attempt >= 5 || (res.status < 500 && res.status !== 429)) {
      throw new Error(`${path} — HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

const category = (name, filters, limit) =>
  post(`/api/v2/search/spending_by_category/${name}/`, { filters, limit });

// Whole dollars. The API reports cents; nobody reads a contract portfolio to the cent, and
// the rounding is what keeps a 150KB budget spent on rows rather than on ".14".
const dollars = (n) => Math.round(Number(n) || 0);

// ---- 1. the agencies, and their small-business half ------------------------------
async function fetchAgencies() {
  console.log(`agencies: FY${FY} contract obligations, top ${TOP_AGENCIES}`);
  const all = await category("awarding_agency", baseFilters(), 100);
  const small = await category("awarding_agency", baseFilters({ recipient_type_names: SMALL_BUSINESS }), 100);
  const smallBy = new Map(small.results.map((r) => [r.name, r.amount]));

  const ranked = all.results.slice().sort((a, b) => b.amount - a.amount);
  const kept = ranked.slice(0, TOP_AGENCIES);
  const total = ranked.reduce((s, r) => s + r.amount, 0);
  const keptTotal = kept.reduce((s, r) => s + r.amount, 0);
  if (!kept.length) throw new Error("agencies: no results — the query or the API changed");

  console.log(`agencies: kept ${kept.length} of ${ranked.length} (${((keptTotal / total) * 100).toFixed(1)}% of $${(total / 1e9).toFixed(1)}B)`);
  return {
    rows: kept.map((r) => ({
      agency_code: r.code || r.agency_slug || String(r.id),
      agency: r.name,
      total_obligations: dollars(r.amount),
      small_business_obligations: dollars(smallBy.get(r.name) || 0),
    })),
    coverage: (keptTotal / total) * 100,
    yearTotal: total,
  };
}

// The two per-agency flows. Both ask the same filtered question of two categories, so they
// are one function with the category name and the row shaper passed in — keeping them
// symmetrical is what makes "top 12 of this agency's spend" mean the same thing on both
// sides of the pack.
//
// Neither flow table carries the agency's full NAME, only its code. That is deliberate and
// it is the pack's data-prep story: the readable name and the agency's own total live in
// agency-totals.csv, and the pack's JOB is what brings them together — which is also what
// turns a vendor's raw obligations into a share of the agency that paid them. Denormalizing
// the name into both flow tables would have made the join decorative, and cost 18KB of the
// pack's 150KB budget to do it.
async function fetchPerAgency(agencies, categoryName, shape) {
  const out = [];
  for (const a of agencies) {
    const filters = baseFilters({ agencies: [{ type: "awarding", tier: "toptier", name: a.agency }] });
    const res = await category(categoryName, filters, TOP_PER_AGENCY);
    if (!res.results.length) throw new Error(`${categoryName}: "${a.agency}" returned nothing — the agency name no longer matches the API's`);
    for (const r of res.results) out.push({ agency_code: a.agency_code, ...shape(r) });
    process.stdout.write(".");
  }
  process.stdout.write("\n");
  console.log(`${categoryName}: ${out.length} rows over ${agencies.length} agencies`);
  return out;
}

// ---- 2. where the work is performed, by congressional district -------------------
// The app's choropleth `cd` scale keys on a 4-character state-FIPS + district id
// (app/studio-charts.js geoNormalizeId), which is exactly USASpending's `shape_code` —
// so this table drops straight onto the map with no crosswalk.
async function fetchDistricts() {
  console.log("districts: place of performance, congressional district");
  const res = await post("/api/v2/search/spending_by_geography/", {
    filters: baseFilters(),
    scope: "place_of_performance",
    geo_layer: "district",
  });
  const all = res.results.filter((r) => /^\d{4}$/.test(String(r.shape_code || "")));
  const rows = all
    .filter((r) => Number(String(r.shape_code).slice(0, 2)) <= 56) // territories: no geometry to draw them on
    .map((r) => ({
      district_id: r.shape_code,
      district: r.display_name,
      state: String(r.display_name || "").split("-")[0],
      obligations: dollars(r.aggregated_amount),
      population: r.population == null ? "" : Math.round(r.population),
    }))
    .sort((a, b) => (a.district_id < b.district_id ? -1 : a.district_id > b.district_id ? 1 : 0));
  if (rows.length < 400) throw new Error(`districts: only ${rows.length} districts — expected ~436, the layer or its codes changed`);
  console.log(`districts: ${rows.length} districts (${all.length - rows.length} territory delegations dropped)`);
  return rows;
}

// ---- run --------------------------------------------------------------------------
const { rows: agencies, coverage, yearTotal } = await fetchAgencies();

const industries = await fetchPerAgency(agencies, "naics", (r) => ({
  naics: r.code,
  industry: r.name,
  obligations: dollars(r.amount),
}));
const vendors = await fetchPerAgency(agencies, "recipient", (r) => ({
  vendor: r.name,
  vendor_uei: r.uei || "",
  obligations: dollars(r.amount),
}));
const districts = await fetchDistricts();

// Deterministic order everywhere: agency code, then descending obligations, then name as
// the tie-break so two equal amounts can never swap between runs.
const byAgencyThenAmount = (nameKey) => (a, b) =>
  a.agency_code < b.agency_code ? -1 : a.agency_code > b.agency_code ? 1 :
  b.obligations - a.obligations ||
  (a[nameKey] < b[nameKey] ? -1 : a[nameKey] > b[nameKey] ? 1 : 0);

agencies.sort((a, b) => b.total_obligations - a.total_obligations || (a.agency_code < b.agency_code ? -1 : 1));
industries.sort(byAgencyThenAmount("industry"));
vendors.sort(byAgencyThenAmount("vendor"));

const AGENCY_COLS = ["agency_code", "agency", "total_obligations", "small_business_obligations"];
const INDUSTRY_COLS = ["agency_code", "naics", "industry", "obligations"];
const VENDOR_COLS = ["agency_code", "vendor", "vendor_uei", "obligations"];
const DISTRICT_COLS = ["district_id", "district", "state", "obligations", "population"];

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1) + "KB";
console.log(`${calls} API calls; FY${FY} contract obligations $${(yearTotal / 1e9).toFixed(1)}B`);
console.log(`  agency-totals.csv    ${kb(toCsv(AGENCY_COLS, agencies))}`);
console.log(`  agency-industry.csv  ${kb(toCsv(INDUSTRY_COLS, industries))}`);
console.log(`  agency-vendor.csv    ${kb(toCsv(VENDOR_COLS, vendors))}`);
console.log(`  district-awards.csv  ${kb(toCsv(DISTRICT_COLS, districts))}`);

writePack({
  pack: "contractawards",
  source: {
    kind: "public",
    name: "USASpending.gov — federal contract awards, FY" + FY,
    url: "https://www.usaspending.gov/",
    licence: "Public domain (U.S. Government work)",
    retrieved: RETRIEVED,
  },
  notes: [
    `USASpending.gov API v2, fiscal year ${FY} (${FY_START} to ${FY_END}), the most recent closed federal fiscal year`,
    "Contract awards only — award type codes A, B, C and D (definitive contracts, purchase orders, delivery orders and BPA calls). Grants, loans and direct payments are excluded",
    `The top ${TOP_AGENCIES} awarding agencies by obligations, which is ${coverage.toFixed(2)}% of the year's contract dollars; the remaining agencies are excluded to stay inside the pack's 150KB budget`,
    `Per agency, the top ${TOP_PER_AGENCY} NAICS industries and the top ${TOP_PER_AGENCY} recipients by obligations`,
    "The industry and vendor tables carry the agency CODE only; the readable agency name and the agency's own total live in agency-totals.csv, and the pack's job is what joins them",
    "The small-business figure is the same agency query re-run with USASpending's small_business recipient filter, so it counts every small-business dollar and not just the ones in the top-12 vendor list",
    "District rows are PLACE OF PERFORMANCE (where the work happens), not the recipient's headquarters; district_id is state FIPS + district number, the id the app's congressional-district map keys on",
    "The territories' at-large delegations (American Samoa, Guam, Northern Mariana Islands, Puerto Rico, US Virgin Islands — 0.6% of the year's contract dollars) are excluded from the district table: the app's congressional-district map has no geometry for them",
    "Amounts are obligations rounded to whole dollars",
  ],
  files: {
    "agency-totals.csv": { columns: AGENCY_COLS, rows: agencies },
    "agency-industry.csv": { columns: INDUSTRY_COLS, rows: industries },
    "agency-vendor.csv": { columns: VENDOR_COLS, rows: vendors },
    "district-awards.csv": { columns: DISTRICT_COLS, rows: districts },
  },
});
