/* app/sources/supabase.js — Supabase (Postgres + PostgREST). Ported from
   manager.polecat.live/js/sources/supabase.js.

   Supabase's browser-facing API is PostgREST, which does DATA (select /
   insert / upsert / delete) but NOT schema DDL — you can't CREATE TABLE with
   an anon key. So this adapter splits the difference the honest way:
     • provisioning is a ONE-TIME "paste this SQL into the Supabase SQL editor"
       step (browserProvision:false → provision() returns the script), and
     • everything after that — probe, load, save, drop — is native browser REST.

   Data plane: PostgREST can read any table the anon key's RLS allows, so a
   dataset against Supabase is kind:'table' — table name + optional PostgREST
   filter/select/order query string (not arbitrary SQL). */
(function () {
  "use strict";
  var WS = Studio.WS;

  function restBase(cfg) {
    var u = (cfg.url || "").trim().replace(/\/+$/, "");
    if (!u) throw new Error("Project URL is required");
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return u + "/rest/v1";
  }
  function headers(cfg, extra) {
    var key = (cfg.key || "").trim();
    var h = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };
    if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    return h;
  }
  function rest(cfg, path, opts) {
    opts = opts || {};
    var base;
    try { base = restBase(cfg); } catch (e) { return Promise.reject(e); }
    return fetch(base + path, {
      method: opts.method || "GET",
      headers: headers(cfg, opts.headers),
      body: opts.body
    }).catch(function (e) {
      throw new Error("Could not reach Supabase (network or CORS): " + e.message);
    }).then(function (res) {
      if (res.status === 401 || res.status === 403) throw new Error("Supabase rejected the API key (401/403)");
      return res;
    });
  }
  function sqlLit(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

  Studio.supabaseSource = {
    id: "supabase",
    label: "Supabase",
    blurb: "Postgres with a REST API. Data reads/writes run from the browser; first-time setup is a one-time SQL script you paste into Supabase.",
    icon: "db",
    accent: "#3ecf8e",
    caps: { meta: true, data: true },
    browserProvision: false,
    fields: [
      { key: "url", label: "Project URL", placeholder: "https://YOUR-REF.supabase.co", type: "text",
        hint: "Settings → API → Project URL." },
      { key: "key", label: "anon public key", placeholder: "eyJ… (anon public)", type: "password",
        hint: "Settings → API → Project API keys → anon public. Row-Level Security governs what it can touch." }
    ],
    docsUrl: "https://supabase.com/docs/guides/api",

    test: function (cfg) {
      return rest(cfg, "/" + WS.META_TABLE + "?select=key&limit=1")
        .then(function () { return { ok: true }; })
        .catch(function (e) { return { ok: false, error: e.message }; });
    },

    probe: function (cfg) {
      // PostgREST can't enumerate tables with an anon key, so we probe our marker
      // directly: present + app row → ours; absent → treat as not-yet-provisioned.
      return rest(cfg, "/" + WS.META_TABLE + "?select=key,value").then(function (res) {
        if (res.status === 404 || res.status === 400) return { state: "empty" }; // relation missing
        if (!res.ok) return { state: "empty", note: "HTTP " + res.status };
        return res.json().catch(function () { return []; }).then(function (meta) {
          var app = null, schemaVersion = null;
          (meta || []).forEach(function (m) {
            if (m.key === "app") app = m.value;
            if (m.key === "schema_version") schemaVersion = Number(m.value) || null;
          });
          return Promise.all(WS.TABLE_NAMES.map(function (t) {
            return rest(cfg, "/" + t + "?select=id", { headers: { Prefer: "count=exact", Range: "0-0" } })
              .then(function (r) {
                var cr = r.headers.get("content-range"); // "0-0/123"
                return { name: t, count: cr ? Number(cr.split("/")[1]) || 0 : 0 };
              }).catch(function () { return { name: t, count: 0 }; });
          })).then(function (tables) {
            return { state: "polecat", app: app, schemaVersion: schemaVersion, tables: tables };
          });
        });
      }).catch(function (e) { return { state: "empty", note: e.message }; });
    },

    // Can't DDL from the browser — hand back a ready-to-paste bootstrap. The
    // caller shows it with an "I've run it" button that re-probes.
    provision: function (cfg, snapshot) {
      var meta = WS.metaRows(snapshot);
      var sql = ["-- Polecat workspace bootstrap — run once in Supabase → SQL editor."]
        .concat(WS.provisionDDL().map(function (s) { return s + ";"; }))
        .concat(meta.map(function (m) {
          return 'INSERT INTO "' + WS.META_TABLE + '"(key,value) VALUES(' + sqlLit(m.key) + ", " + sqlLit(m.value) + ") ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;";
        }))
        .concat(["", "-- Then enable Row-Level Security policies appropriate to your project", "-- before exposing the anon key beyond your own use."])
        .join("\n");
      return Promise.resolve({ ok: false, manual: true, sql: sql });
    },

    summarize: function (cfg) { return this.probe(cfg); },

    drop: function (cfg) {
      // No DDL over REST — deleting the DATA is the browser-reachable "reset".
      var chain = Promise.resolve();
      WS.TABLE_NAMES.forEach(function (t) {
        chain = chain.then(function () { return rest(cfg, "/" + t + "?id=not.is.null", { method: "DELETE" }); });
      });
      return chain.then(function () { return { ok: true, dataOnly: true }; })
        .catch(function (e) { return { ok: false, error: e.message }; });
    },

    load: function (cfg) {
      var snap = WS.emptySnapshot();
      var reads = WS.TABLE_NAMES.map(function (t) {
        return rest(cfg, "/" + t + "?select=data").then(function (r) {
          if (!r.ok) return;
          return r.json().then(function (rows) {
            snap.tables[t] = rows.map(function (x) {
              return WS.cellsToRow(typeof x.data === "string" ? x.data : JSON.stringify(x.data));
            }).filter(Boolean);
          });
        }).catch(function () {});
      });
      return Promise.all(reads).then(function () {
        return rest(cfg, "/" + WS.META_TABLE + "?select=key,value").then(function (r) {
          if (!r.ok) return;
          return r.json().then(function (meta) {
            meta.forEach(function (m) {
              if (m.key === "settings") { try { snap.settings = JSON.parse(m.value); } catch (e) {} }
              if (m.key === "meta") { try { snap.meta = JSON.parse(m.value); } catch (e) {} }
            });
          });
        }).catch(function () {});
      }).then(function () { return snap; });
    },

    save: function (cfg, snapshot) {
      var byTable;
      try { byTable = WS.snapshotToRows(snapshot); } catch (e) { return Promise.resolve({ ok: false, error: e.message }); }
      var chain = Promise.resolve();
      // a write that lands on a missing table (v1 workspace, v2 client) must
      // FAIL LOUDLY, not silently skip — rest() only throws on auth errors.
      function mustOk(t) {
        return function (r) {
          if (r && r.ok === false) {
            return r.text().then(function (b) {
              throw new Error('HTTP ' + r.status + ' writing "' + t + '": ' + String(b || "").slice(0, 140));
            });
          }
          return r;
        };
      }
      WS.TABLE_NAMES.forEach(function (t) {
        // replace-all: clear then bulk upsert (metadata-sized, so this is fine)
        chain = chain.then(function () {
          return rest(cfg, "/" + t + "?id=not.is.null", { method: "DELETE" }).then(mustOk(t));
        }).then(function () {
          var rows = byTable[t].map(function (rec) {
            var o = { id: rec.id, data: rec.data };
            Object.keys(rec.cols).forEach(function (k) { o[k] = rec.cols[k]; });
            return o;
          });
          if (!rows.length) return null;
          return rest(cfg, "/" + t, { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(rows) }).then(mustOk(t));
        });
      });
      return chain.then(function () {
        var meta = WS.metaRows(snapshot).map(function (m) { return { key: m.key, value: m.value }; });
        return rest(cfg, "/" + WS.META_TABLE, { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(meta) }).then(mustOk(WS.META_TABLE));
      }).then(function () { return { ok: true }; })
        .catch(function (e) {
          var msg = e.message || String(e);
          // v1 → v2 → v3 delta: Supabase can't DDL over REST, so a workspace that
          // predates the analyses or jobs table needs one paste-me statement —
          // say so instead of a bare 404.
          if (/analyses|jobs/.test(msg)) {
            msg += " — your workspace predates the analyses/jobs tables. Run this once in Supabase → SQL editor: " + WS.provisionDeltaSQL();
          }
          return { ok: false, error: msg };
        });
    },

    // ---- data plane ---------------------------------------------------------
    testData: function (cfg) {
      // A data connection is valid even without our workspace tables — hit the
      // REST root, which answers 200 with the OpenAPI doc for any valid key.
      return rest(cfg, "/").then(function (r) {
        return r.ok ? { ok: true } : { ok: false, error: "HTTP " + r.status };
      }).catch(function (e) { return { ok: false, error: e.message }; });
    },

    // dataset: { kind:'table', table, query? } — `query` is a raw PostgREST
    // query string (e.g. "select=name,total&order=total.desc&limit=200").
    queryData: function (cfg, dataset) {
      var table = (dataset && dataset.table || "").trim();
      if (!table) return Promise.resolve({ columns: [], rows: [], error: "Dataset has no table" });
      var qs = (dataset.query || "select=*").replace(/^\?/, "");
      return rest(cfg, "/" + encodeURIComponent(table) + "?" + qs).then(function (r) {
        if (!r.ok) return { columns: [], rows: [], error: "HTTP " + r.status };
        return r.json().then(function (list) {
          if (!Array.isArray(list) || !list.length) return { columns: [], rows: [] };
          var columns = Object.keys(list[0]);
          var rows = list.map(function (o) { return columns.map(function (c) { return o[c]; }); });
          return { columns: columns, rows: rows };
        });
      }).catch(function (e) { return { columns: [], rows: [], error: e.message }; });
    }
  };
}());
