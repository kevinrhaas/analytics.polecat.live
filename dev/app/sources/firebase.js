/* app/sources/firebase.js — Firebase (Cloud Firestore, REST). Ported from
   manager.polecat.live/js/sources/firebase.js.

   Firestore is schemaless: "objects" are collections, created implicitly on
   first write, so browserProvision is true and provision() just stamps the
   marker document. Each workspace table maps to a collection; each row is a
   document keyed by its id, storing the whole row as a single JSON `data`
   field (so arbitrary nested row shapes survive without mapping every field
   to a Firestore typed value).

   Data plane: a dataset against Firestore is kind:'collection' — reads a
   whole collection and flattens each document's fields into columns. */
(function () {
  "use strict";
  var WS = Studio.WS;

  function docBase(cfg) {
    var pid = (cfg.projectId || "").trim();
    if (!pid) throw new Error("Project ID is required");
    return "https://firestore.googleapis.com/v1/projects/" + pid + "/databases/(default)/documents";
  }
  function keyParam(cfg) { return cfg.apiKey ? "?key=" + encodeURIComponent(cfg.apiKey.trim()) : ""; }

  function fsReq(cfg, path, opts) {
    opts = opts || {};
    var base;
    try { base = docBase(cfg); } catch (e) { return Promise.reject(e); }
    var h = { "Content-Type": "application/json" };
    if (opts.headers) Object.keys(opts.headers).forEach(function (k) { h[k] = opts.headers[k]; });
    return fetch(base + path + keyParam(cfg), { method: opts.method || "GET", headers: h, body: opts.body })
      .catch(function (e) { throw new Error("Could not reach Firestore (network or CORS): " + e.message); })
      .then(function (res) {
        if (res.status === 401 || res.status === 403) throw new Error("Firestore denied access (401/403) — check the API key and security rules");
        return res;
      });
  }

  function listCollectionIds(cfg) {
    var base;
    try { base = docBase(cfg); } catch (e) { return Promise.resolve([]); }
    return fetch(base + ":listCollectionIds" + keyParam(cfg), { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(function (res) { return res.ok ? res.json() : { collectionIds: [] }; })
      .then(function (j) { return j.collectionIds || []; })
      .catch(function () { return []; });
  }

  // row <-> Firestore document (single stringValue field `data`)
  function toDoc(row) { return { fields: { data: { stringValue: JSON.stringify(row) } } }; }
  function fromDoc(doc) { return WS.cellsToRow((doc && doc.fields && doc.fields.data && doc.fields.data.stringValue) || ""); }

  function readCollection(cfg, name) {
    var out = [];
    function page(pageToken) {
      return fsReq(cfg, "/" + name + "?pageSize=300" + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "")).then(function (res) {
        if (res.status === 404 || !res.ok) return out;
        return res.json().then(function (j) {
          (j.documents || []).forEach(function (d) { var r = fromDoc(d); if (r) out.push(r); });
          return j.nextPageToken ? page(j.nextPageToken) : out;
        });
      });
    }
    return page("");
  }

  function writeDoc(cfg, coll, id, body) {
    return fsReq(cfg, "/" + coll + "/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify(body) });
  }

  // Flatten a Firestore typed value into a plain JS value (data-plane reads of
  // arbitrary, non-Polecat collections where fields are real typed values).
  function fromTyped(v) {
    if (!v || typeof v !== "object") return v;
    if ("stringValue" in v) return v.stringValue;
    if ("integerValue" in v) return Number(v.integerValue);
    if ("doubleValue" in v) return v.doubleValue;
    if ("booleanValue" in v) return v.booleanValue;
    if ("timestampValue" in v) return v.timestampValue;
    if ("nullValue" in v) return null;
    if (v.mapValue) { var o = {}; var f = v.mapValue.fields || {}; Object.keys(f).forEach(function (k) { o[k] = fromTyped(f[k]); }); return o; }
    if (v.arrayValue) return (v.arrayValue.values || []).map(fromTyped);
    return null;
  }

  Studio.firebaseSource = {
    id: "firebase",
    label: "Firebase",
    blurb: "Cloud Firestore document store. Schemaless — collections appear on first write. Reads/writes run from the browser under your security rules.",
    icon: "db",
    accent: "#ffca28",
    caps: { meta: true, data: true },
    browserProvision: true,
    fields: [
      { key: "projectId", label: "Project ID", placeholder: "your-firebase-project", type: "text",
        hint: "Firebase console → Project settings → Project ID." },
      { key: "apiKey", label: "Web API key", placeholder: "AIza… (optional if rules are open)", type: "password",
        hint: "Project settings → General → Web API key. Access is governed by your Firestore security rules." }
    ],
    docsUrl: "https://firebase.google.com/docs/firestore/use-rest-api",

    test: function (cfg) {
      return fsReq(cfg, "/" + WS.META_TABLE + "/app").then(function () { return { ok: true }; })
        .catch(function (e) { return { ok: false, error: e.message }; });
    },

    probe: function (cfg) {
      var markerOk = false, app = null, schemaVersion = null;
      return fsReq(cfg, "/" + WS.META_TABLE + "/app").then(function (res) {
        if (!res.ok) return null;
        return res.json().then(function (d) {
          var r = fromDoc(d);
          if (r) { markerOk = true; app = r.app; schemaVersion = r.schemaVersion; }
        });
      }).catch(function () {}).then(function () {
        return listCollectionIds(cfg);
      }).then(function (colls) {
        if (markerOk) {
          return Promise.all(WS.TABLE_NAMES.map(function (t) {
            if (colls.indexOf(t) < 0) return Promise.resolve({ name: t, count: 0 });
            return readCollection(cfg, t).then(function (rows) { return { name: t, count: rows.length }; });
          })).then(function (tables) {
            return { state: "polecat", app: app, schemaVersion: schemaVersion, tables: tables };
          });
        }
        if (!colls.length) return { state: "empty", tables: [] };
        return { state: "foreign", tables: colls.map(function (name) { return { name: name, count: 0 }; }) };
      });
    },

    provision: function (cfg, snapshot) {
      return writeDoc(cfg, WS.META_TABLE, "app", toDoc({ id: "app", app: WS.APP_ID, schemaVersion: WS.SCHEMA_VERSION }))
        .then(function () { return writeDoc(cfg, WS.META_TABLE, "settings", toDoc({ id: "settings", settings: (snapshot && snapshot.settings) || {} })); })
        .then(function () { return writeDoc(cfg, WS.META_TABLE, "meta", toDoc({ id: "meta", meta: (snapshot && snapshot.meta) || {} })); })
        .then(function () { return { ok: true }; })
        .catch(function (e) { return { ok: false, error: e.message }; });
    },

    summarize: function (cfg) { return this.probe(cfg); },

    drop: function (cfg) {
      return listCollectionIds(cfg).then(function (colls) {
        var chain = Promise.resolve();
        colls.forEach(function (c) {
          chain = chain.then(function () { return readCollection(cfg, c); }).then(function (docs) {
            var del = Promise.resolve();
            docs.forEach(function (r) {
              del = del.then(function () { return fsReq(cfg, "/" + c + "/" + encodeURIComponent(r.id), { method: "DELETE" }); });
            });
            if (c === WS.META_TABLE) {
              ["app", "settings", "meta"].forEach(function (k) {
                del = del.then(function () { return fsReq(cfg, "/" + WS.META_TABLE + "/" + k, { method: "DELETE" }); });
              });
            }
            return del;
          });
        });
        return chain;
      }).then(function () { return { ok: true }; })
        .catch(function (e) { return { ok: false, error: e.message }; });
    },

    load: function (cfg) {
      var snap = WS.emptySnapshot();
      var reads = WS.TABLE_NAMES.map(function (t) {
        return readCollection(cfg, t).then(function (rows) { snap.tables[t] = rows; });
      });
      return Promise.all(reads).then(function () {
        return fsReq(cfg, "/" + WS.META_TABLE + "/settings").then(function (res) {
          if (!res.ok) return;
          return res.json().then(function (d) { var r = fromDoc(d); if (r && r.settings) snap.settings = r.settings; });
        }).catch(function () {});
      }).then(function () {
        return fsReq(cfg, "/" + WS.META_TABLE + "/meta").then(function (res) {
          if (!res.ok) return;
          return res.json().then(function (d) { var r = fromDoc(d); if (r && r.meta) snap.meta = r.meta; });
        }).catch(function () {});
      }).then(function () { return snap; });
    },

    save: function (cfg, snapshot) {
      var chain = Promise.resolve();
      WS.TABLE_NAMES.forEach(function (t) {
        chain = chain.then(function () {
          var rows = snapshot.tables[t] || [];
          var keep = {};
          var up = Promise.resolve();
          rows.forEach(function (r) {
            keep[r.id] = 1;
            up = up.then(function () { return writeDoc(cfg, t, r.id, toDoc(r)); });
          });
          // upsert current rows; then delete any doc no longer present
          return up.then(function () { return readCollection(cfg, t); }).then(function (existing) {
            var del = Promise.resolve();
            existing.forEach(function (r) {
              if (!keep[r.id]) del = del.then(function () { return fsReq(cfg, "/" + t + "/" + encodeURIComponent(r.id), { method: "DELETE" }); });
            });
            return del;
          });
        });
      });
      return chain.then(function () {
        return writeDoc(cfg, WS.META_TABLE, "settings", toDoc({ id: "settings", settings: snapshot.settings || {} }));
      }).then(function () {
        return writeDoc(cfg, WS.META_TABLE, "meta", toDoc({ id: "meta", meta: snapshot.meta || {} }));
      }).then(function () { return { ok: true }; })
        .catch(function (e) { return { ok: false, error: e.message }; });
    },

    // ---- data plane ---------------------------------------------------------
    testData: function (cfg) {
      return listCollectionIds(cfg).then(function () { return { ok: true }; })
        .catch(function (e) { return { ok: false, error: e.message }; });
    },

    // dataset: { kind:'collection', collection } — reads the whole collection,
    // flattening each document's typed fields into columns.
    queryData: function (cfg, dataset) {
      var coll = (dataset && dataset.collection || "").trim();
      if (!coll) return Promise.resolve({ columns: [], rows: [], error: "Dataset has no collection" });
      var docs = [];
      function page(pageToken) {
        return fsReq(cfg, "/" + coll + "?pageSize=300" + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "")).then(function (res) {
          if (!res.ok) return docs;
          return res.json().then(function (j) {
            (j.documents || []).forEach(function (d) {
              var o = {}, f = d.fields || {};
              Object.keys(f).forEach(function (k) { o[k] = fromTyped(f[k]); });
              docs.push(o);
            });
            return j.nextPageToken ? page(j.nextPageToken) : docs;
          });
        });
      }
      return page("").then(function (list) {
        if (!list.length) return { columns: [], rows: [] };
        var columns = [];
        list.forEach(function (o) { Object.keys(o).forEach(function (k) { if (columns.indexOf(k) < 0) columns.push(k); }); });
        var rows = list.map(function (o) { return columns.map(function (c) { return o[c]; }); });
        return { columns: columns, rows: rows };
      }).catch(function (e) { return { columns: [], rows: [], error: e.message }; });
    }
  };
}());
