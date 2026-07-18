/* app/sources/sigv4.js — AWS Signature Version 4 request signing, pure WebCrypto,
   no dependencies (post-overhaul backlog item 2: the Redshift Data API connector
   needs this — unlike Snowflake/Databricks/BigQuery's simple bearer tokens, every
   AWS API call must be individually signed with the caller's access key).

   Studio.AwsSigV4.sign(opts) -> Promise<{headers, amzDate, credentialScope}>
     opts: { accessKeyId, secretAccessKey, sessionToken?, region, service,
             host, method, path, query, body, headers:{name:value}, date? }
     `headers` are the extra request headers to sign (e.g. content-type,
     x-amz-target) — lowercase keys, already-final values. `date` is an
     injectable Date (tests only; real calls omit it and get "now").
     Resolves the COMPLETE header set to send as-is (host is deliberately
     excluded — browsers forbid setting it manually, and fetch() sets it from
     the request URL, which must equal opts.host for the signature to match).

   Algorithm: https://docs.aws.amazon.com/general/latest/gr/sigv4-signing-nodes.html
   (canonical request -> string to sign -> derived signing key -> signature). */
(function () {
  "use strict";
  window.Studio = window.Studio || {};
  var enc = new TextEncoder();

  function toHex(buf) {
    var b = new Uint8Array(buf), s = "";
    for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? "0" : "") + b[i].toString(16);
    return s;
  }
  function sha256Hex(str) {
    return crypto.subtle.digest("SHA-256", enc.encode(str)).then(toHex);
  }
  // keyBytes: Uint8Array | ArrayBuffer; msg: string. Resolves a raw signature (Uint8Array).
  function hmac(keyBytes, msg) {
    return crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
      .then(function (key) { return crypto.subtle.sign("HMAC", key, enc.encode(msg)); })
      .then(function (buf) { return new Uint8Array(buf); });
  }
  function hmacHex(keyBytes, msg) { return hmac(keyBytes, msg).then(toHex); }

  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function amzTimestamps(d) {
    d = d || new Date();
    var dateStamp = "" + d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
    var amzDate = dateStamp + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z";
    return { amzDate: amzDate, dateStamp: dateStamp };
  }

  Studio.AwsSigV4 = {
    sha256Hex: sha256Hex,
    hmacHex: hmacHex,

    sign: function (opts) {
      var method = (opts.method || "POST").toUpperCase();
      var path = opts.path || "/";
      var query = opts.query || "";
      var body = opts.body || "";
      var region = opts.region, service = opts.service;
      var ts = amzTimestamps(opts.date);

      var allHeaders = { host: opts.host, "x-amz-date": ts.amzDate };
      Object.keys(opts.headers || {}).forEach(function (k) { allHeaders[k.toLowerCase()] = String(opts.headers[k]).trim(); });
      if (opts.sessionToken) allHeaders["x-amz-security-token"] = opts.sessionToken;

      var signedHeaderNames = Object.keys(allHeaders).sort();
      var canonicalHeaders = signedHeaderNames.map(function (k) { return k + ":" + allHeaders[k] + "\n"; }).join("");
      var signedHeaders = signedHeaderNames.join(";");

      return sha256Hex(body).then(function (payloadHash) {
        var canonicalRequest = [method, path, query, canonicalHeaders, signedHeaders, payloadHash].join("\n");
        var credentialScope = ts.dateStamp + "/" + region + "/" + service + "/aws4_request";
        return sha256Hex(canonicalRequest).then(function (crHash) {
          var stringToSign = ["AWS4-HMAC-SHA256", ts.amzDate, credentialScope, crHash].join("\n");
          return hmac(enc.encode("AWS4" + opts.secretAccessKey), ts.dateStamp)
            .then(function (kDate) { return hmac(kDate, region); })
            .then(function (kRegion) { return hmac(kRegion, service); })
            .then(function (kService) { return hmac(kService, "aws4_request"); })
            .then(function (kSigning) { return hmac(kSigning, stringToSign); })
            .then(function (sigBytes) {
              var signature = toHex(sigBytes);
              var outHeaders = {};
              signedHeaderNames.forEach(function (k) { if (k !== "host") outHeaders[k] = allHeaders[k]; });
              outHeaders.authorization = "AWS4-HMAC-SHA256 Credential=" + opts.accessKeyId + "/" + credentialScope +
                ", SignedHeaders=" + signedHeaders + ", Signature=" + signature;
              return { headers: outHeaders, amzDate: ts.amzDate, credentialScope: credentialScope, signature: signature, canonicalRequest: canonicalRequest };
            });
        });
      });
    }
  };
}());
