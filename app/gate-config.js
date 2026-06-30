/* Access gate config. Empty = open (no gate).
   Accepts ONE SHA-256 hash, or an ARRAY of them so you can issue/revoke several
   access codes (remove a hash + commit/push to revoke that code).
   Default passcode: "pentaho-studio".

   Generate a code's hash:   node tools/gen-code.js "MY ACCESS CODE"
   then set it below and commit/push (GitHub Pages redeploys this repo).

   This is a soft gate (static assets stay downloadable). For real, managed
   access — email/SSO, one-time codes, expiry — front the site with Cloudflare
   Access; see PUBLISH.md. */
window.STUDIO_GATE_SHA256 = [
  "d6370b6be69ea249b0b30d57e90b9ee2b35e599b16e175c111c8cf9ca2c4a338", // private access code (set 2026-06-25)
  "f42b91ee017ccca093436fb9068fd888307bcf263c0eb4296af03752a195e375"  // master code — always works (rotated 2026-06-26)
];
