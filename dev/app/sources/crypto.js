/* app/sources/crypto.js — at-rest encryption for secret values, keyed by a
   passphrase. Ported from manager.polecat.live/js/crypto.js.

   Used to encrypt the connection-credentials vault BEFORE it's written to a
   remote workspace backend, so secrets never sit in plaintext in the remote
   database. Zero-knowledge: the passphrase and the plaintext never leave the
   browser — the remote only ever holds AES-256-GCM ciphertext + a (non-secret)
   salt, so a leaked database dump reveals nothing without the passphrase.

   Standard WebCrypto, no dependencies. PBKDF2(SHA-256) stretches the
   passphrase into an AES-GCM key; each value gets its own random 96-bit IV. */
(function () {
  "use strict";
  window.Studio = window.Studio || {};
  var PBKDF2_ITERS = 150000;
  var enc = new TextEncoder();
  var dec = new TextDecoder();

  function b64(buf) { var s = "", b = new Uint8Array(buf); for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function unb64(s) { var bin = atob(s), b = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; }

  Studio.SecretsCrypto = {
    ITERS: PBKDF2_ITERS,
    cryptoAvailable: function () { return !!(window.crypto && crypto.subtle && crypto.getRandomValues); },
    // A fresh random salt (base64) — public, stored alongside the ciphertext so
    // any browser with the passphrase can re-derive the same key.
    newSalt: function () { return b64(crypto.getRandomValues(new Uint8Array(16))); },
    deriveKey: function (passphrase, saltB64, iters) {
      return crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]).then(function (base) {
        return crypto.subtle.deriveKey(
          { name: "PBKDF2", salt: unb64(saltB64), iterations: iters || PBKDF2_ITERS, hash: "SHA-256" },
          base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      });
    },
    // { __enc:1, iv, ct } — a self-describing ciphertext envelope for one string.
    encryptStr: function (key, plain) {
      var iv = crypto.getRandomValues(new Uint8Array(12));
      return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, enc.encode(String(plain))).then(function (ct) {
        return { __enc: 1, iv: b64(iv), ct: b64(ct) };
      });
    },
    decryptStr: function (key, env) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.iv) }, key, unb64(env.ct)).then(function (pt) {
        return dec.decode(pt);
      });
    },
    isEnvelope: function (v) { return !!(v && typeof v === "object" && v.__enc === 1 && typeof v.ct === "string" && typeof v.iv === "string"); },
    // Verify a passphrase against a known envelope (unlocking on another
    // browser) — resolves the plaintext, or rejects if the key is wrong.
    verifyKey: function (key, env) { return Studio.SecretsCrypto.decryptStr(key, env); }
  };
}());
