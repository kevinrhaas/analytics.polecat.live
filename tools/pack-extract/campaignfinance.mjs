// tools/pack-extract/campaignfinance.mjs — SP-5 "Campaign Finance". The contract is
// docs/PACKS.md; this file is the provenance record it demands: every source URL, the
// retrieval date and every filter applied are readable here, and re-running it re-derives
// the same CSV from the same upstream (rows are sorted, nothing is sampled, nothing
// depends on the clock).
//
//   node --max-old-space-size=8192 tools/pack-extract/campaignfinance.mjs
//
// The heap flag is not decoration: the pass below counts every distinct employer and
// occupation string in ~14 million rows of free text, and Node's default old-space is
// smaller than that on most machines. It needs `unzip` on PATH (the archive is ZIP64 and
// streaming it in-process would be a zip parser this repo has no reason to own), ~4.3 GB
// of scratch space for the download, and about ten minutes.
//
// THE QUESTION THE PACK ASKS: who funds federal politics? Four readings of it, which are
// the four Views the item names — donor geography, industry concentration (employer and
// occupation), small-dollar versus max-out, and the out-of-state share.
//
// SOURCE: Federal Election Commission bulk downloads for the 2023-2024 election cycle.
// Public domain (U.S. Government work), no API key, no registration.
//
//   https://www.fec.gov/files/bulk-downloads/2024/indiv24.zip  contributions by individuals
//   https://www.fec.gov/files/bulk-downloads/2024/cm24.zip     committee master
//   https://www.fec.gov/files/bulk-downloads/2024/cn24.zip     candidate master
//
// WHY THE 2024 CYCLE AND NOT THE CURRENT ONE: a closed cycle is a frozen file, so a
// re-run is byte-identical forever. The in-flight cycle's file grows every week, which
// would make "re-run the extract, get an empty diff" false the day after it shipped.
//
// ---------------------------------------------------------------------------------
// THE PRIVACY LINE, because this pack is the one in the program where it is a real
// question. Kevin decided the scope on 2026-08-08 (STATUS.md § SP-5) and it is binding:
// individual donor NAMES were on the table and he chose them. This extract nevertheless
// ships NO NAMES AT ALL — not because it overrides that decision, but because everything
// it produces is an AGGREGATE, and an aggregate has no name column to carry. Every file
// below is a group-by: by state, by committee, by occupation, by employer, by month, by
// size band. If a later slice wants a donor-level table, that is where the decision gets
// spent; nothing here needs it.
//
// STREET ADDRESSES: the item's binding constraint is that the extract may READ a street
// address to resolve geography (Census Geocoder) and must then DROP it, never
// redistributing it. MEASURED, 2026-08-10: the FEC bulk individual-contributions file has
// no street address to read. Its 21 fields are CMTE_ID, AMNDT_IND, RPT_TP,
// TRANSACTION_PGI, IMAGE_NUM, TRANSACTION_TP, ENTITY_TP, NAME, CITY, STATE, ZIP_CODE,
// EMPLOYER, OCCUPATION, TRANSACTION_DT, TRANSACTION_AMT, OTHER_ID, TRAN_ID, FILE_NUM,
// MEMO_CD, MEMO_TEXT, SUB_ID — city/state/ZIP and nothing finer. The street line exists
// only in the per-filing Schedule A records behind the OpenFEC API, which needs a key.
// So the geocoding half of the item is unreachable from this source rather than skipped,
// the pack's geography is ZIP-derived throughout, and there is no rooftop-derived tract
// anywhere in it to mix with a ZIP-derived one. That is why nothing here carries a
// `geo_precision` column: the column exists to disclose a MIXTURE, and there is none.
// ---------------------------------------------------------------------------------
//
// THE FILTERS, all deliberate, all visible in the output, and all stated in SOURCE.json:
//
//   * INDIVIDUALS ONLY (ENTITY_TP = IND). The same file carries receipts from
//     candidates, committees, organizations and partnerships; they are a different
//     question with a different unit.
//   * RECEIPTS ONLY, POSITIVE AMOUNTS ONLY (transaction types 15, 15E, 15J; amount > 0).
//     15 is a direct contribution, 15E an earmarked one passed through a conduit, 15J a
//     joint-fundraiser share. Refunds (22Y) are negative rows and are dropped rather than
//     netted: this pack reads money raised, not money kept, and saying so is cheaper than
//     a column nobody would notice.
//   * MEMO ROWS DROPPED (MEMO_CD = X). Those are informational restatements of money
//     itemized elsewhere in the same report; keeping them double-counts by construction.
//   * EVERY RECIPIENT COMMITTEE, not just the campaigns — and that is a deliberate
//     correction of the obvious-looking filter. MEASURED, 2026-08-10: restricting
//     recipients to candidate committees puts HARRIS FOR PRESIDENT at $390M and the
//     Trump campaign nowhere in the top fifty, because the Trump operation raised through
//     JOINT FUNDRAISING committees (Trump 47, $349M; Trump National Committee JFC,
//     $290M) which then transfer to the campaign, while the Harris operation's earmarked
//     money was itemized directly against the campaign. Same money, different plumbing —
//     and a headline chart built on that filter would read as a landslide that never
//     happened. So every committee is counted, and WHICH KIND of committee it is becomes
//     a column instead of a silent filter.
//   * NO DOUBLE COUNT, measured rather than assumed. Each individual dollar is itemized
//     by the committee that received it: a joint fundraiser's transfers to its
//     participants are committee-to-committee rows (not ENTITY_TP = IND) and the
//     participants' restatements of the original donors are memo rows, both dropped
//     above. The two big conduits appear only as recipients of contributions to their own
//     committees — ActBlue $33.9M and WinRed $7.4M, together 0.6% of the cycle's total
//     here — because the money they pass through is itemized by the committee that
//     ultimately received it, as transaction type 15E, which is where this counts it.
//   * TOP N COMMITTEES for the per-state flow table. The long tail is bytes, not insight,
//     and the pack has a 150 KB budget. The kept share is measured, printed, and stated
//     in SOURCE.json so a reader knows how much of the cycle is in front of them.
//
// THE ONE THING A READER MUST KNOW, and the reason the pack says it on every dashboard
// it will ever seed: THIS FILE IS ITEMIZED CONTRIBUTIONS ONLY. A committee itemizes a
// donor once that donor's cycle total passes $200; everything below that line is reported
// as an unitemized lump sum and never appears here. So the small-dollar rows in this
// extract are small GIFTS from donors who crossed $200 in aggregate — not the small-dollar
// universe, which is invisible in this source. Anything the pack builds on the size bands
// has to say that out loud, because the honest version of "small-dollar vs max-out" is a
// comparison of two kinds of itemized giving, not of two kinds of donor.
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import os from "node:os";
import path from "node:path";
import { writePack, toCsv } from "./lib.mjs";

const RETRIEVED = "2026-08-10";

// The 2023-2024 election cycle: closed, final, and therefore frozen.
const CYCLE = 2024;
const BULK = `https://www.fec.gov/files/bulk-downloads/${CYCLE}`;
const CYCLE_MONTHS = ["2023-01", "2024-12"]; // the window monthly.csv reports, inclusive

const RECEIPT_TYPES = new Set(["15", "15E", "15J"]);

// WHICH KIND of committee received the money — the column that replaced the filter this
// extract started with (see the header). Designation is read first because it is the field
// that identifies a JOINT FUNDRAISER, and a joint fundraiser is the whole reason the naive
// filter was wrong; type answers the rest. Both are the FEC's own codes, not a judgement.
const CMTE_DESIGNATIONS = { J: "Joint fundraising committee", D: "Leadership PAC" };
const CMTE_TYPES = {
  H: "Candidate committee", S: "Candidate committee", P: "Candidate committee",
  X: "Party committee", Y: "Party committee", Z: "Party committee",
  O: "Independent-expenditure committee", U: "Independent-expenditure committee",
  V: "Hybrid PAC", W: "Hybrid PAC",
  N: "PAC", Q: "PAC", C: "PAC", E: "PAC", I: "PAC"
};
const committeeType = (dsgn, tp) => CMTE_DESIGNATIONS[dsgn] || CMTE_TYPES[tp] || "Other committee";

const TOP_COMMITTEES = 50;   // committees in the per-state flow table
const TOP_OCCUPATIONS = 200;
const TOP_EMPLOYERS = 200;

// The 2024 per-election limit on an individual contribution to a candidate committee.
// A donor may give it twice (primary and general), which is why the top band is "3,300+"
// rather than "over the limit" — two maximum gifts are two rows here, not one illegal one.
const MAX_PER_ELECTION = 3300;
const SMALL_DOLLAR = 200; // the itemization threshold, and the standard small-dollar line

const BANDS = [
  { order: 1, label: "Under $50", min: 0 },
  { order: 2, label: "$50–$199", min: 50 },
  { order: 3, label: "$200–$499", min: 200 },
  { order: 4, label: "$500–$999", min: 500 },
  { order: 5, label: "$1,000–$2,499", min: 1000 },
  { order: 6, label: "$2,500–$3,299", min: 2500 },
  { order: 7, label: "$3,300 and over (the per-election limit)", min: MAX_PER_ELECTION }
];
const bandOf = (amt) => {
  for (let i = BANDS.length - 1; i >= 0; i--) if (amt >= BANDS[i].min) return BANDS[i];
  return BANDS[0];
};

// Free text, typed by thousands of different filers. Normalising is not cosmetic: without
// it "SELF EMPLOYED", "Self-Employed" and "SELF  EMPLOYED " are three occupations and the
// concentration story is wrong. Upper-cased, punctuation-collapsed, whitespace-collapsed —
// and nothing cleverer, because a synonym table would be an editorial judgement this file
// has no way to defend.
const norm = (s) => s.toUpperCase().replace(/[.,\-]/g, " ").replace(/\s+/g, " ").trim();

// What filers write when they have nothing to report. These are not employers, and left in
// they would take the top of the table and say nothing.
const NON_ANSWERS = new Set([
  "", "N/A", "NA", "NONE", "NOT APPLICABLE", "INFORMATION REQUESTED",
  "INFORMATION REQUESTED PER BEST EFFORTS", "REQUESTED", "REQUESTED INFORMATION",
  "BEST EFFORTS MADE", "UNKNOWN", "UNEMPLOYED/N A", "-", "--"
]);

const cacheDir = process.env.FEC_CACHE || path.join(os.tmpdir(), "fec-bulk-" + CYCLE);

async function bulkFile(name) {
  mkdirSync(cacheDir, { recursive: true });
  const zip = path.join(cacheDir, `${name}.zip`);
  if (existsSync(zip) && statSync(zip).size > 0) {
    console.log(`${name}.zip: cached (${(statSync(zip).size / 1e6).toFixed(1)} MB) — delete ${zip} to re-fetch`);
    return zip;
  }
  const url = `${BULK}/${name}.zip`;
  console.log(`${name}.zip: fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} — HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(zip + ".part"));
  execFileSync("mv", [zip + ".part", zip]);
  console.log(`${name}.zip: ${(statSync(zip).size / 1e6).toFixed(1)} MB`);
  return zip;
}

const unzipText = (zip, member) =>
  execFileSync("unzip", ["-p", zip, member], { maxBuffer: 512 * 1024 * 1024 }).toString("latin1");

// ---- 1. who the recipients are ----------------------------------------------------
// The committee master says what each committee IS; the candidate master says, for the
// ones attached to a candidate, that candidate's party, office and the state they are
// running IN — which is the whole basis of the out-of-state story, and the one fact no
// contribution row carries.
function loadCommittees(cmZip, cnZip) {
  const candidates = new Map();
  for (const line of unzipText(cnZip, "cn.txt").split("\n")) {
    if (!line) continue;
    const f = line.split("|");
    candidates.set(f[0], { name: f[1], party: f[2], officeState: f[4], office: f[5], district: f[6] });
  }
  const committees = new Map();
  let withCandidate = 0;
  for (const line of unzipText(cmZip, "cm.txt").split("\n")) {
    if (!line) continue;
    const f = line.split("|");
    const type = committeeType(f[8], f[9]);
    // A candidate's SEAT is attributed only to the candidate's own committee. The master
    // links some party committees to a candidate id too — the NRSC carries an Alaska Senate
    // one — and reading that as a seat would file the NRSC under Alaska and give a national
    // party committee an out-of-state share. Measured on the 2024 master, not guessed at.
    const cand = f[14] && type === "Candidate committee" ? candidates.get(f[14]) : null;
    if (cand) withCandidate++;
    committees.set(f[0], {
      committee: f[1],
      type: type,
      // Party, in the FEC's own order of authority: what the committee registered as,
      // then its candidate's affiliation, then blank. Blank is left BLANK rather than
      // filled with "other" — most joint fundraisers register no party at all, and
      // labelling the Trump 47 Committee "other party" would be an invention.
      party: party3(f[10] || (cand ? cand.party : "")),
      candidate: cand ? cand.name : "",
      office: cand ? (OFFICE[cand.office] || cand.office || "") : "",
      officeState: cand ? cand.officeState || "" : "",
      district: cand && cand.office === "H" ? cand.district || "" : ""
    });
  }
  console.log(`recipients: ${committees.size} committees, ${withCandidate} attached to one of ${candidates.size} candidates`);
  return committees;
}

const OFFICE = { H: "House", S: "Senate", P: "President" };
// Three buckets and a blank. DFL and DNL are the Minnesota and North Dakota Democratic
// parties' own registered names — folding them in is a fact, not an editorial call, and
// leaving them out put Amy Klobuchar in "other party". Everything else that is neither
// DEM nor REP is OTH; an unregistered party stays EMPTY, which is not the same claim.
const party3 = (p) => (!p ? "" : p === "DEM" || p === "DFL" || p === "DNL" ? "DEM" : p === "REP" ? "REP" : "OTH");

// A ZIP-derived, two-letter donor state. The file's STATE column is what the filer typed,
// so it carries the odd stray; anything that is not two letters is counted as unknown
// rather than guessed at, and the unknown total is reported.
const stateOf = (raw) => (/^[A-Z]{2}$/.test(raw) ? raw : "");

// ---- 2. the pass over 14 million contributions ------------------------------------
async function aggregate(indivZip, committees) {
  const stats = { lines: 0, kept: 0, amount: 0, notIndividual: 0, memo: 0, notReceipt: 0, nonPositive: 0, unknownCommittee: 0, unknownState: 0, outOfWindow: 0 };
  const byState = new Map();      // state -> [contributions, amount, smallN, smallAmt, maxN, maxAmt]
  const byCommittee = new Map();  // cmteId -> [contributions, amount]
  const byCmteState = new Map();  // cmteId + "\t" + state -> [contributions, amount]
  const byOccupation = new Map(); // occupation -> [contributions, amount]
  const byEmployer = new Map();   // employer -> [contributions, amount]
  const byMonth = new Map();      // month + "\t" + committee type -> [contributions, amount]
  const byBand = new Map();       // band order + "\t" + committee type -> [contributions, amount]

  const bump = (map, key, n, amt) => {
    const cur = map.get(key);
    if (cur) { cur[0] += n; cur[1] += amt; } else map.set(key, [n, amt]);
  };

  const child = spawn("unzip", ["-p", indivZip, "itcont.txt"], { stdio: ["ignore", "pipe", "inherit"] });
  let tail = "";
  for await (const chunk of child.stdout) {
    const text = tail + chunk.toString("latin1");
    const lines = text.split("\n");
    tail = lines.pop();
    for (const line of lines) handle(line);
  }
  if (tail) handle(tail);
  const code = await new Promise((r) => child.on("close", r));
  if (code !== 0) throw new Error(`unzip exited ${code} — the archive or its member name changed`);

  function handle(line) {
    if (!line) return;
    if (++stats.lines % 10_000_000 === 0) console.log(`  ${(stats.lines / 1e6).toFixed(0)}M rows read, ${(stats.kept / 1e6).toFixed(1)}M kept`);
    const f = line.split("|");
    if (f.length < 21) return;
    if (f[6] !== "IND") { stats.notIndividual++; return; }
    if (f[18] === "X") { stats.memo++; return; }
    if (!RECEIPT_TYPES.has(f[5])) { stats.notReceipt++; return; }
    const amt = Number(f[14]);
    if (!(amt > 0)) { stats.nonPositive++; return; }
    const cmte = committees.get(f[0]);
    // A receipt to a committee the master file does not list — a filer typo, or a committee
    // registered after the master was cut. Counted out loud rather than bucketed as "other".
    if (!cmte) { stats.unknownCommittee++; return; }

    stats.kept++;
    stats.amount += amt;

    const state = stateOf(f[9]);
    if (!state) stats.unknownState++;
    else {
      let s = byState.get(state);
      if (!s) byState.set(state, (s = [0, 0, 0, 0, 0, 0]));
      s[0]++; s[1] += amt;
      if (amt < SMALL_DOLLAR) { s[2]++; s[3] += amt; }
      if (amt >= MAX_PER_ELECTION) { s[4]++; s[5] += amt; }
      bump(byCmteState, f[0] + "\t" + state, 1, amt);
    }
    bump(byCommittee, f[0], 1, amt);

    const occ = norm(f[12]);
    if (!NON_ANSWERS.has(occ)) bump(byOccupation, occ, 1, amt);
    const emp = norm(f[11]);
    if (!NON_ANSWERS.has(emp)) bump(byEmployer, emp, 1, amt);

    bump(byBand, bandOf(amt).order + "\t" + cmte.type, 1, amt);

    // TRANSACTION_DT is MMDDYYYY, and filers do typo it — a cycle file carries dates from
    // the 1990s and the 2080s. Anything outside the cycle window is counted out loud
    // rather than clamped into a month it does not belong to.
    const dt = f[13];
    if (/^\d{8}$/.test(dt)) {
      const month = dt.slice(4) + "-" + dt.slice(0, 2);
      if (month >= CYCLE_MONTHS[0] && month <= CYCLE_MONTHS[1]) bump(byMonth, month + "\t" + cmte.type, 1, amt);
      else stats.outOfWindow++;
    } else stats.outOfWindow++;
  }

  return { stats, byState, byCommittee, byCmteState, byOccupation, byEmployer, byMonth, byBand };
}

// ---- 3. shape the seven tables ----------------------------------------------------
const whole = (n) => Math.round(n);
const byAmountThen = (key) => (a, b) => b.amount - a.amount || (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);

function build(agg, committees) {
  const { byState, byCommittee, byCmteState, byOccupation, byEmployer, byMonth, byBand } = agg;

  const states = [...byState.entries()]
    .map(([state, v]) => ({
      state, contributions: v[0], amount: whole(v[1]),
      small_dollar_contributions: v[2], small_dollar_amount: whole(v[3]),
      max_out_contributions: v[4], max_out_amount: whole(v[5])
    }))
    .sort((a, b) => (a.state < b.state ? -1 : 1));

  const rankedCmtes = [...byCommittee.entries()]
    .map(([cmteId, v]) => ({ cmteId, contributions: v[0], amount: v[1] }))
    .sort((a, b) => b.amount - a.amount || (a.cmteId < b.cmteId ? -1 : 1));
  const keptCmtes = rankedCmtes.slice(0, TOP_COMMITTEES);
  const keptIds = new Set(keptCmtes.map((c) => c.cmteId));
  const cycleTotal = rankedCmtes.reduce((s, c) => s + c.amount, 0);
  const keptTotal = keptCmtes.reduce((s, c) => s + c.amount, 0);

  // The committee table is the DIMENSION — who the recipient is, what KIND of committee,
  // which party, which seat and which state that seat is in — plus its own totals, which
  // are what the flow table joins to in order to read one state's share of one committee.
  // The flow table deliberately carries the id and nothing readable: the name lives here
  // once, and the pack's JOB is what brings it across (SP-6's call, one pack over).
  const cmteRows = keptCmtes
    .map((c) => {
      const m = committees.get(c.cmteId);
      return {
        cmte_id: c.cmteId, committee: m.committee, committee_type: m.type,
        candidate: m.candidate, party: m.party, office: m.office,
        office_state: m.officeState, district: m.district,
        total_contributions: c.contributions, total_amount: whole(c.amount)
      };
    })
    .sort((a, b) => (a.cmte_id < b.cmte_id ? -1 : 1));

  const flow = [];
  for (const [key, v] of byCmteState) {
    const [cmteId, state] = key.split("\t");
    if (!keptIds.has(cmteId)) continue;
    // is_home_state is a FACT the extract knows and the job engine cannot compute: its
    // derive step does arithmetic on numbers, not string comparison, so "did this money come
    // from the state the candidate is running in" has to arrive as a 0/1 the job can
    // multiply by. It is 0 for every committee with no seat to be home to — a joint
    // fundraiser, a party committee, a PAC — which is what office_state marks, and why the
    // out-of-state reading is only meaningful over the rows that have one.
    const officeState = committees.get(cmteId).officeState;
    flow.push({
      cmte_id: cmteId, state, is_home_state: officeState && officeState === state ? 1 : 0,
      contributions: v[0], amount: whole(v[1])
    });
  }
  flow.sort((a, b) => (a.cmte_id < b.cmte_id ? -1 : a.cmte_id > b.cmte_id ? 1 : a.state < b.state ? -1 : 1));

  const topOf = (map, keyName, limit) =>
    [...map.entries()]
      .map(([k, v]) => ({ [keyName]: k, contributions: v[0], amount: whole(v[1]) }))
      .sort(byAmountThen(keyName))
      .slice(0, limit);

  const occupations = topOf(byOccupation, "occupation", TOP_OCCUPATIONS);
  const employers = topOf(byEmployer, "employer", TOP_EMPLOYERS);

  const months = [...byMonth.entries()]
    .map(([k, v]) => {
      const [month, committee_type] = k.split("\t");
      return { month, committee_type, contributions: v[0], amount: whole(v[1]) };
    })
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : a.committee_type < b.committee_type ? -1 : 1));

  const bands = [...byBand.entries()]
    .map(([k, v]) => {
      const [order, committee_type] = k.split("\t");
      return {
        band_order: Number(order), band: BANDS[Number(order) - 1].label, committee_type,
        contributions: v[0], amount: whole(v[1])
      };
    })
    .sort((a, b) => a.band_order - b.band_order || (a.committee_type < b.committee_type ? -1 : 1));

  return { states, cmteRows, flow, occupations, employers, months, bands, cycleTotal, keptTotal, cmteCount: rankedCmtes.length };
}

// ---- run --------------------------------------------------------------------------
const [indivZip, cmZip, cnZip] = [
  await bulkFile(`indiv${String(CYCLE).slice(2)}`),
  await bulkFile(`cm${String(CYCLE).slice(2)}`),
  await bulkFile(`cn${String(CYCLE).slice(2)}`)
];

const committees = loadCommittees(cmZip, cnZip);
console.log("contributions: one pass over itcont.txt (~11 GB uncompressed) — this takes a few minutes");
const agg = await aggregate(indivZip, committees);
const t = build(agg, committees);
const s = agg.stats;

const coverage = (t.keptTotal / t.cycleTotal) * 100;
console.log(`rows: ${s.lines.toLocaleString()} read, ${s.kept.toLocaleString()} kept ($${(s.amount / 1e9).toFixed(2)}B)`);
console.log(`  dropped: ${s.notIndividual.toLocaleString()} non-individual, ${s.memo.toLocaleString()} memo, ` +
  `${s.notReceipt.toLocaleString()} non-receipt, ${s.nonPositive.toLocaleString()} refund/zero, ` +
  `${s.unknownCommittee.toLocaleString()} to a committee the master file does not list`);
console.log(`  ${s.unknownState.toLocaleString()} kept rows carry no two-letter state; ${s.outOfWindow.toLocaleString()} fall outside ${CYCLE_MONTHS[0]}..${CYCLE_MONTHS[1]}`);
console.log(`committees: kept ${t.cmteRows.length} of ${t.cmteCount} (${coverage.toFixed(1)}% of $${(t.cycleTotal / 1e9).toFixed(2)}B)`);

const STATE_COLS = ["state", "contributions", "amount", "small_dollar_contributions", "small_dollar_amount", "max_out_contributions", "max_out_amount"];
const CMTE_COLS = ["cmte_id", "committee", "committee_type", "candidate", "party", "office", "office_state", "district", "total_contributions", "total_amount"];
const FLOW_COLS = ["cmte_id", "state", "is_home_state", "contributions", "amount"];
const OCC_COLS = ["occupation", "contributions", "amount"];
const EMP_COLS = ["employer", "contributions", "amount"];
const MONTH_COLS = ["month", "committee_type", "contributions", "amount"];
const BAND_COLS = ["band_order", "band", "committee_type", "contributions", "amount"];

const kb = (str) => (Buffer.byteLength(str) / 1024).toFixed(1) + "KB";
console.log(`  state-donors.csv      ${kb(toCsv(STATE_COLS, t.states))} (${t.states.length} rows)`);
console.log(`  committees.csv        ${kb(toCsv(CMTE_COLS, t.cmteRows))} (${t.cmteRows.length} rows)`);
console.log(`  committee-state.csv   ${kb(toCsv(FLOW_COLS, t.flow))} (${t.flow.length} rows)`);
console.log(`  occupations.csv       ${kb(toCsv(OCC_COLS, t.occupations))} (${t.occupations.length} rows)`);
console.log(`  employers.csv         ${kb(toCsv(EMP_COLS, t.employers))} (${t.employers.length} rows)`);
console.log(`  monthly.csv           ${kb(toCsv(MONTH_COLS, t.months))} (${t.months.length} rows)`);
console.log(`  size-bands.csv        ${kb(toCsv(BAND_COLS, t.bands))} (${t.bands.length} rows)`);

writePack({
  pack: "campaignfinance",
  source: {
    kind: "public",
    name: `Federal Election Commission — individual contributions, ${CYCLE - 1}-${CYCLE} cycle`,
    url: "https://www.fec.gov/data/browse-data/?tab=bulk-data",
    licence: "Public domain (U.S. Government work)",
    retrieved: RETRIEVED
  },
  notes: [
    `FEC bulk downloads for the ${CYCLE - 1}-${CYCLE} election cycle (indiv${String(CYCLE).slice(2)}, cm${String(CYCLE).slice(2)}, cn${String(CYCLE).slice(2)}), a CLOSED cycle — the files are frozen, so a re-run of this extract reproduces these bytes`,
    "Contributions from INDIVIDUALS only (ENTITY_TP = IND), receipt types 15, 15E and 15J, positive amounts only. Refunds are dropped rather than netted, so these are dollars raised, not dollars kept",
    "Memo rows (MEMO_CD = X) are dropped: they restate money itemized elsewhere in the same report and keeping them would double-count",
    "EVERY recipient committee is counted, not just the campaigns. Restricting recipients to candidate committees measures the plumbing rather than the money: the Trump operation raised through joint fundraising committees that transfer onward (Trump 47, $349M; Trump National Committee JFC, $290M) while the Harris operation's earmarked money was itemized directly against the campaign, so that filter shows Harris For President at $390M and no Trump campaign at all. committee_type carries the distinction instead",
    "Each dollar is counted once: a joint fundraiser's transfers to its participants are committee-to-committee rows rather than individual ones, and the participants' restatements of the original donors are memo rows. The conduits appear only as recipients of contributions to their own committees (ActBlue $33.9M, WinRed $7.4M, together 0.6% of the total) because the money they pass through is itemized by the committee that ultimately received it",
    "ITEMIZED CONTRIBUTIONS ONLY. A committee itemizes a donor once their cycle total passes $200; everything below that is reported as an unitemized lump and is absent from this source entirely. The small-dollar rows here are therefore small GIFTS from itemized donors, not the small-dollar donor universe",
    "NO DONOR NAMES, and no street addresses: every table is an aggregate (by state, committee, occupation, employer, month, size band), and the FEC bulk file carries no street address in the first place — city, state and ZIP are its finest geography",
    "Donor geography is the contributor's own reported state; rows without a two-letter state are excluded from the state and committee-state tables and counted here",
    `The committee-state flow table covers the top ${TOP_COMMITTEES} committees by itemized individual receipts, which is ${coverage.toFixed(2)}% of the cycle's; the rest are excluded to stay inside the pack's 150KB budget`,
    "committee-state.csv carries the committee ID and no readable name: the name, kind, party, office and totals live once in committees.csv and the pack's job is what joins them. is_home_state is the one fact denormalized into it, because the job engine derives arithmetic and cannot compare two strings — it is 0 for every committee with no seat (a joint fundraiser, a party committee, a PAC), so the out-of-state reading applies to the rows with an office_state",
    `The top ${TOP_OCCUPATIONS} occupations and top ${TOP_EMPLOYERS} employers by dollars. Both are free text typed by the filer, upper-cased with punctuation and whitespace collapsed and nothing more — so "SELF-EMPLOYED" and "SELF EMPLOYED" merge, while "SELF", "RETIRED" and "NOT EMPLOYED" stay apart: a synonym table would be an editorial judgement the extract cannot defend. Blanks and the "information requested" family are excluded`,
    `Monthly rows cover ${CYCLE_MONTHS[0]} to ${CYCLE_MONTHS[1]}; ${s.outOfWindow.toLocaleString()} kept rows carry a transaction date outside it (filer typos reach the 1990s and the 2080s) and are excluded from that table only`,
    "Party is the committee's own FEC registration, falling back to its candidate's affiliation, folded to DEM, REP and OTH — DFL and DNL are the Minnesota and North Dakota Democratic parties' registered names and count as DEM. A committee that registers no party is left BLANK rather than called \"other\": most joint fundraisers register none",
    "committee_type is the FEC's own designation and type codes (joint fundraising committee, leadership PAC, candidate committee, party committee, independent-expenditure committee, hybrid PAC, PAC)",
    "Amounts are rounded to whole dollars"
  ],
  files: {
    "state-donors.csv": { columns: STATE_COLS, rows: t.states },
    "committees.csv": { columns: CMTE_COLS, rows: t.cmteRows },
    "committee-state.csv": { columns: FLOW_COLS, rows: t.flow },
    "occupations.csv": { columns: OCC_COLS, rows: t.occupations },
    "employers.csv": { columns: EMP_COLS, rows: t.employers },
    "monthly.csv": { columns: MONTH_COLS, rows: t.months },
    "size-bands.csv": { columns: BAND_COLS, rows: t.bands }
  }
});
