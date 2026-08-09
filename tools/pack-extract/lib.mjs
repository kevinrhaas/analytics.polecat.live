// tools/pack-extract/lib.mjs — the shared half of a sample pack's extract script.
//
// THE CONVENTION (docs/PACKS.md is the contract; this file is how you obey it):
// a pack that ships REAL data ships it as COMMITTED CSV under `data/packs/<id>/`,
// produced by a committed, re-runnable `tools/pack-extract/<id>.mjs`. That script is
// the provenance record — it names the source URL, the retrieval date and every
// filter/aggregation applied, so "where did this column come from?" is answered by
// reading it and "is it still right?" is answered by running it again. Nothing is
// fetched at runtime: the app is offline-first and local-first, and a pack must not
// break because a government site moved a URL.
//
// A script does its own fetching and shaping (the interesting, source-specific part)
// and hands the finished rows to writePack(), which owns the boring, uniform half:
// deterministic CSV, the SOURCE.json provenance record, and the per-pack byte budget.
//
//   import { writePack } from "./lib.mjs";
//   const rows = await fetchAndShape();                 // your work
//   writePack({
//     pack: "marketcoverage",
//     source: { kind: "public", name: "US Census County Business Patterns",
//               url: "https://www.census.gov/programs-surveys/cbp.html",
//               licence: "Public domain (U.S. Government work)", retrieved: "2026-08-08" },
//     notes: ["counties only (state totals dropped)", "NAICS 44-45, 2023 release"],
//     files: { "establishments.csv": { columns: ["fips", "naics", "estab"], rows } },
//   });
//
// Run it from the repo root: `node tools/pack-extract/<id>.mjs`. Re-running is
// expected to be a no-op in git when the upstream data hasn't changed — that is what
// makes the extract auditable, so keep every step deterministic (sort your rows).
import { mkdirSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// The whole workspace is ONE localStorage blob and twelve packs have to coexist in
// it, so a pack's data is budgeted rather than merely discouraged. Mirrored in
// tools/validate.mjs (the dev gate) — change both together, deliberately.
export const PACK_CSV_BUDGET = 150 * 1024;

// Deterministic CSV: LF endings, a trailing newline, and quoting only where the
// value needs it. Same bytes for the same rows on every machine, so a re-run that
// changes nothing produces an empty diff.
export function toCsv(columns, rows) {
  const cell = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const line = (values) => values.map(cell).join(",");
  const body = rows.map((r) => line(Array.isArray(r) ? r : columns.map((c) => r[c])));
  return [line(columns), ...body].join("\n") + "\n";
}

// The shape rules that app/demopacks.js's Studio.packSourceIssues() applies to a
// registry entry, applied here to the same object — a pack's data and its registry
// entry describe one source, so they answer to one rule.
export function sourceIssues(s) {
  const out = [];
  if (!s) return ["no source declared"];
  if (!["synthetic", "public", "licensed"].includes(s.kind)) {
    return [`unknown source kind ${JSON.stringify(s.kind)} — one of synthetic/public/licensed`];
  }
  if (s.kind === "synthetic") return ["synthetic data is generated in the app — it does not ship CSV"];
  if (!s.name) out.push("a real source needs a name");
  if (!/^https:\/\//.test(s.url || "")) out.push("a real source needs an https url");
  if (!s.licence) out.push("a real source needs a licence");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.retrieved || "")) out.push("a real source needs an ISO retrieval date (YYYY-MM-DD)");
  return out;
}

// Write one pack's data directory: the CSVs plus SOURCE.json. Refuses rather than
// truncates when something is wrong — a half-written pack directory that still
// passes the gate is worse than a failed extract.
export function writePack({ pack, source, files, notes = [], root = ROOT }) {
  if (!/^[a-z][a-z0-9]*$/.test(pack || "")) throw new Error(`pack id ${JSON.stringify(pack)} must be lowercase alphanumeric`);
  const issues = sourceIssues(source);
  if (issues.length) throw new Error(`${pack}: source declaration — ${issues.join("; ")}`);

  const names = Object.keys(files || {});
  if (!names.length) throw new Error(`${pack}: no files to write`);
  const bodies = {};
  let total = 0;
  for (const name of names) {
    if (!/^[a-z0-9][a-z0-9._-]*\.csv$/.test(name)) throw new Error(`${pack}: ${name} — pack data files are lowercase .csv`);
    const { columns, rows } = files[name];
    if (!Array.isArray(columns) || !columns.length) throw new Error(`${pack}: ${name} — needs a columns array`);
    const body = toCsv(columns, rows || []);
    bodies[name] = body;
    total += Buffer.byteLength(body);
  }
  if (total > PACK_CSV_BUDGET) {
    throw new Error(`${pack}: ${(total / 1024).toFixed(1)}KB of CSV is over the ${PACK_CSV_BUDGET / 1024}KB per-pack budget — ` +
      "subset or aggregate harder in the extract; the workspace is one localStorage blob shared by every installed pack");
  }

  const dir = path.join(root, "data", "packs", pack);
  mkdirSync(dir, { recursive: true });
  // Anything this pack wrote on a previous run that it is not writing now is stale
  // data with no provenance — say so loudly rather than leaving it to ship.
  if (existsSync(dir)) {
    const stale = readdirSync(dir).filter((f) => f !== "SOURCE.json" && !bodies[f] && statSync(path.join(dir, f)).isFile());
    if (stale.length) throw new Error(`${pack}: ${stale.join(", ")} left over from an earlier extract — delete it or write it`);
  }
  for (const name of names) writeFileSync(path.join(dir, name), bodies[name]);
  writeFileSync(path.join(dir, "SOURCE.json"), JSON.stringify({
    pack, source, notes,
    files: names.sort().map((n) => ({ name: n, bytes: Buffer.byteLength(bodies[n]), rows: (files[n].rows || []).length })),
    script: `tools/pack-extract/${pack}.mjs`,
  }, null, 2) + "\n");

  console.log(`${pack}: wrote ${names.length} file(s), ${(total / 1024).toFixed(1)}KB of ${PACK_CSV_BUDGET / 1024}KB budget → data/packs/${pack}/`);
  return { dir, bytes: total };
}
