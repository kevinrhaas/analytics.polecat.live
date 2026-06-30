#!/usr/bin/env node
/* gen-code.js — turn an access code into the SHA-256 you paste into
   app/gate-config.js (so the plaintext code is never in the source).

   Usage:  node tools/gen-code.js "MY ACCESS CODE"
   Then add the printed hash to window.STUDIO_GATE_SHA256 (string or array)
   in app/gate-config.js and re-publish (tools/publish-pages.sh).            */
"use strict";
var crypto = require("crypto");
var code = process.argv.slice(2).join(" ");
if (!code) { console.error('usage: node tools/gen-code.js "YOUR ACCESS CODE"'); process.exit(2); }
var hash = crypto.createHash("sha256").update(code).digest("hex");
console.log(hash);
console.error('\nAccess code: "' + code + '"\nAdd the hash above to app/gate-config.js → window.STUDIO_GATE_SHA256, then re-publish.');
