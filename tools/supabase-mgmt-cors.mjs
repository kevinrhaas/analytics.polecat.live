// supabase-mgmt-cors.mjs — can a BROWSER at our origin call the Supabase
// Management API? (N22a: the spike that decides how N22 gets built.)
//
//   node tools/supabase-mgmt-cors.mjs                    # header probe, no deps
//   NODE_PATH=$(npm root -g) node tools/supabase-mgmt-cors.mjs --browser
//   node tools/supabase-mgmt-cors.mjs --origin https://example.test
//
// WHY THIS EXISTS. N22 wants a blank Supabase project provisioned entirely
// from Analytics — no SQL editor, no CLI. The Management API
// (`api.supabase.com`) would make that trivial: `POST /v1/projects/{ref}/
// database/query` runs arbitrary SQL with a Personal Access Token, and the
// same API creates projects and deploys Edge Functions. Analytics is a static
// Pages app with no server to proxy through, so the whole option lives or dies
// on one question — does `api.supabase.com` send usable CORS headers to an
// arbitrary origin? N22 says to MEASURE that rather than assume it either way.
// This is the measurement, committed and re-runnable, so the answer can be
// re-checked when someone doubts it or when Supabase changes policy.
//
// WHAT IT MEASURES. A CORS preflight is an OPTIONS request the browser sends
// before any request carrying an `Authorization` header. The browser then
// allows the real request ONLY if the response carries an
// `Access-Control-Allow-Origin` matching the caller's origin (and, when
// `Access-Control-Allow-Credentials: true` is present, `*` does not count —
// it must be the literal origin). Everything else in the response is noise.
// So for each endpoint we send that exact preflight and read that one header.
//
// THE CONTROL, and it is the point. `https://supabase.com` — the origin of
// Supabase's own dashboard, whose SQL editor is built on this endpoint — is
// probed alongside ours. Without it, a missing header could mean "this API
// does no CORS at all" (a fact about the API) or "this API allowlists origins
// and we are not on it" (a fact about US). The control separates them, and
// only the second reading tells you the option is closed to every third-party
// browser app rather than merely unimplemented.
//
// CREDENTIAL-FREE BY CONSTRUCTION. A preflight carries no Authorization header
// — that is the whole point of it — so this probe needs no Personal Access
// Token and can never leak one. It also never sends the real request, so it
// creates nothing, changes nothing, and cannot be rate-limited into mattering.
// The project ref below is a syntactically valid placeholder that resolves to
// no project; CORS headers are emitted by the edge before any auth or routing,
// which is exactly why the placeholder is sufficient.
//
// --browser ADDS THE GROUND TRUTH. Header reading tells you what the server
// said; only a browser tells you what a browser DOES with it. With the flag,
// Chromium loads the real app origin and attempts the fetch from a page there.
// A blocked preflight surfaces in JS as a bare `TypeError: Failed to fetch`
// with no status — indistinguishable, from inside the page, from the network
// being down, which is precisely why the browser stage carries the SAME
// control as the header probe: it repeats the identical fetch from a page at
// `supabase.com`. If that one comes back with a status (a 401 on the
// deliberately invalid token), then the browser can reach the host, the
// request is well-formed, and the only difference left is which origin asked.
// Playwright is loaded lazily, so the default path stays dependency-free.
//
// EXIT CODES. 0 = measured (the verdict is in the output, and BOTH verdicts
// are a successful measurement — this is a spike, not a gate). 2 = the
// measurement failed to complete (network unreachable), because "we never
// asked" must never be recorded as "we asked and it was fine" — the same
// distinction tests/rls-verify.mjs draws.
"use strict";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

// The app's real production origin — the one that would have to make these
// calls. Overridable so anyone can re-measure from a different deployment.
const ORIGIN = opt("--origin", "https://analytics.polecat.live");
const CONTROL_ORIGIN = "https://supabase.com";
const REF = "aaaaaaaaaaaaaaaaaaaa"; // valid ref shape, no such project

// The four Management API calls N22 would need to reach its stated end state:
// create the project, run the DDL, deploy the admin Edge Function, and set the
// three secrets that function needs. Any one of them being blocked in a
// browser is enough to sink the design; all four are probed so the answer
// covers the whole flow rather than one endpoint.
const ENDPOINTS = [
  { method: "POST", path: `/v1/projects`, what: "create a project" },
  { method: "POST", path: `/v1/projects/${REF}/database/query`, what: "run SQL (the DDL linchpin)" },
  { method: "POST", path: `/v1/projects/${REF}/functions/deploy`, what: "deploy the admin Edge Function" },
  { method: "POST", path: `/v1/projects/${REF}/secrets`, what: "set that function's secrets" },
];

async function preflight(origin, ep) {
  const url = `https://api.supabase.com${ep.path}`;
  let res;
  try {
    res = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": ep.method,
        // The two headers the real call would carry. Requesting them matters:
        // a server may allow the origin but refuse `authorization`, which
        // blocks the request just as completely.
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
  } catch (e) {
    return { state: "unreachable", detail: (e && e.message) || String(e) };
  }
  const allow = res.headers.get("access-control-allow-origin");
  const creds = res.headers.get("access-control-allow-credentials") === "true";
  if (!allow) return { state: "BLOCKED", detail: `HTTP ${res.status}, no Access-Control-Allow-Origin`, creds };
  // With credentials allowed, a wildcard is rejected by the browser; without
  // them it is fine. Report the distinction rather than flattening it.
  if (allow === "*") {
    return creds
      ? { state: "BLOCKED", detail: "wildcard ACAO with credentials — browsers reject this", creds }
      : { state: "OPEN", detail: "ACAO: * (no credentials)", creds };
  }
  if (allow.toLowerCase() !== origin.toLowerCase()) {
    return { state: "BLOCKED", detail: `ACAO: ${allow} — does not match ${origin}`, creds };
  }
  return { state: "OPEN", detail: `ACAO: ${allow}`, creds };
}

console.log(`supabase-mgmt-cors: preflighting api.supabase.com as a browser at ${ORIGIN}\n`);

let blocked = 0, open = 0, unreachable = 0;
const controlOpen = [];

for (const ep of ENDPOINTS) {
  const mine = await preflight(ORIGIN, ep);
  const control = await preflight(CONTROL_ORIGIN, ep);
  if (mine.state === "unreachable" || control.state === "unreachable") unreachable++;
  else if (mine.state === "OPEN") open++;
  else blocked++;
  if (control.state === "OPEN") controlOpen.push(ep.path);

  const mark = mine.state === "OPEN" ? "OPEN " : mine.state === "BLOCKED" ? "BLOCK" : "??   ";
  console.log(`  ${mark} ${ep.method} ${ep.path}`);
  console.log(`        ${ep.what}`);
  console.log(`        ours:    ${mine.detail}`);
  console.log(`        control: ${control.detail}   (${CONTROL_ORIGIN})`);
}

console.log("");
if (unreachable) {
  console.error(`supabase-mgmt-cors: INCONCLUSIVE — ${unreachable} endpoint(s) gave no answer.`);
  console.error("  Nothing was measured; do not record this run as a result.");
  process.exit(2);
}
if (blocked && controlOpen.length) {
  console.log(`VERDICT: BLOCKED for ${ORIGIN} — ${blocked}/${ENDPOINTS.length} endpoint(s) send no`);
  console.log("  usable Access-Control-Allow-Origin, while the SAME endpoints answer");
  console.log(`  ${CONTROL_ORIGIN} with one. The API does CORS; it allowlists who gets it,`);
  console.log("  and a third-party origin is not on the list. A static browser app cannot");
  console.log("  call the Management API, and no amount of client-side work changes that.");
} else if (blocked) {
  console.log(`VERDICT: BLOCKED for ${ORIGIN} — and the ${CONTROL_ORIGIN} control is blocked too,`);
  console.log("  so this endpoint appears to do no browser CORS at all rather than allowlisting.");
} else {
  console.log(`VERDICT: OPEN for ${ORIGIN} — every probed endpoint would permit the preflight.`);
  console.log("  Re-open the N22 design: a browser-side Management API flow is possible.");
}

if (!flag("--browser")) {
  console.log("\n  (header probe only — add --browser for the enforcement check)");
  process.exit(0);
}

/* ── ground truth: what a real browser actually does ─────────────────────── */

const { createRequire } = await import("node:module");
const { chromium } = createRequire(import.meta.url)("playwright");
const launchOpts = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);

// The one call N22 cannot do without: run SQL. The token is deliberately
// invalid — a 401 is the SUCCESS shape here, because it means the browser let
// the request through and only the credential was refused.
async function fetchFromPage(origin) {
  const page = await browser.newPage();
  try {
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 45000 });
  } catch (e) {
    await page.close();
    return { loaded: false, error: (e && e.message) || String(e) };
  }
  const out = await page.evaluate(async (ref) => {
    try {
      const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: "POST",
        headers: { Authorization: "Bearer sbp_not_a_real_token", "Content-Type": "application/json" },
        body: JSON.stringify({ query: "select 1" }),
      });
      return { loaded: true, reached: true, status: r.status };
    } catch (e) {
      return { loaded: true, reached: false, error: String((e && e.message) || e) };
    }
  }, REF);
  await page.close();
  return out;
}

console.log(`\nbrowser check: the same POST …/database/query, made from a page at each origin`);
const mine = await fetchFromPage(ORIGIN);
const control = await fetchFromPage(CONTROL_ORIGIN);
await browser.close();

const describe = (label, r) =>
  !r.loaded ? `  ??      ${label} — page would not load: ${r.error}`
  : r.reached ? `  REACHED ${label} — HTTP ${r.status}; the browser permitted the call`
  : `  BLOCKED ${label} — the fetch threw before any response: ${r.error}`;

console.log(describe(ORIGIN, mine));
console.log(describe(CONTROL_ORIGIN, control));

if (!mine.loaded || !control.loaded) {
  console.error("\n  INCONCLUSIVE — one of the two pages never loaded, so the comparison is void.");
  process.exit(2);
}
if (!mine.reached && control.reached) {
  console.log("\n  CONFIRMED: the block is about WHICH ORIGIN ASKED. Identical request, identical");
  console.log("  browser, identical host — refused from ours, admitted from Supabase's own.");
} else if (!mine.reached && !control.reached) {
  console.log("\n  INCONCLUSIVE for the browser stage — the control was blocked too, so this may");
  console.log("  be reachability rather than CORS. Trust the header probe above and re-run.");
} else {
  console.log("\n  The browser permitted our origin's call. Re-open the N22 design.");
}
process.exit(0);
