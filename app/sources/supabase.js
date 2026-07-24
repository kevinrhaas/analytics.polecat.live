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

  function projectBase(cfg) {
    var u = (cfg.url || "").trim().replace(/\/+$/, "");
    if (!u) throw new Error("Project URL is required");
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return u;
  }
  function restBase(cfg) { return projectBase(cfg) + "/rest/v1"; }
  function headers(cfg, extra, bearer) {
    var key = (cfg.key || "").trim();
    var h = { apikey: key, Authorization: "Bearer " + (bearer || key), "Content-Type": "application/json" };
    if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    return h;
  }

  // ---- optional Supabase Auth (GoTrue) sign-in (M7 slice 2) ------------------
  // cfg.authEmail/authPassword are OPTIONAL fields on this adapter only — when
  // both are set, every REST call below exchanges them for a real GoTrue JWT
  // (via /auth/v1/token, a sibling of /rest/v1 under the same project URL) and
  // sends it as the Bearer token instead of the plain anon key, so Postgres'
  // auth.uid() resolves to a real user for RLS. Omitting them keeps the exact
  // pre-existing anon-key-only behavior — nothing else about this adapter, or
  // any other backend (Turso/Firebase), changes.
  var _sessions = {}; // "url|email" -> { accessToken, userId, expiresAt }
  function sessionKey(cfg) { return (cfg.url || "") + "|" + (cfg.authEmail || ""); }
  function gotrueSignIn(cfg) {
    var base;
    try { base = projectBase(cfg); } catch (e) { return Promise.reject(e); }
    return fetch(base + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { apikey: (cfg.key || "").trim(), "Content-Type": "application/json" },
      body: JSON.stringify({ email: cfg.authEmail, password: cfg.authPassword })
    }).catch(function (e) {
      throw new Error("Could not reach Supabase Auth (network or CORS): " + e.message);
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok || !data.access_token) throw new Error("Supabase Auth sign-in failed: " + (data.error_description || data.msg || data.error || ("HTTP " + res.status)));
        return data;
      });
    });
  }
  function ensureSession(cfg) {
    if (!cfg.authEmail || !cfg.authPassword) return Promise.resolve(null);
    var key = sessionKey(cfg);
    var cached = _sessions[key];
    if (cached && cached.expiresAt > Date.now() + 5000) return Promise.resolve(cached);
    return gotrueSignIn(cfg).then(function (data) {
      var session = { accessToken: data.access_token, userId: (data.user && data.user.id) || null, expiresAt: Date.now() + ((data.expires_in || 3600) * 1000) };
      _sessions[key] = session;
      return session;
    });
  }

  function rest(cfg, path, opts) {
    opts = opts || {};
    var base;
    try { base = restBase(cfg); } catch (e) { return Promise.reject(e); }
    return ensureSession(cfg).then(function (session) {
      return fetch(base + path, {
        method: opts.method || "GET",
        headers: headers(cfg, opts.headers, session && session.accessToken),
        body: opts.body
      }).catch(function (e) {
        throw new Error("Could not reach Supabase (network or CORS): " + e.message);
      });
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
      { key: "key", label: "anon / publishable key", placeholder: "sb_publishable_… or eyJ… (anon)", type: "password",
        hint: "Settings → API → Project API keys → publishable key (new projects) or anon public (legacy JWT format). Row-Level Security governs what it can touch." },
      { key: "authEmail", label: "Supabase Auth email (optional)", placeholder: "you@example.com", type: "text",
        hint: "Sign in with a real Supabase Auth (GoTrue) account so requests carry your identity — Postgres' auth.uid() resolves to a real user instead of NULL. Only needed for enforced per-user privacy (Row-Level Security); leave blank to keep using the shared anon key as before." },
      { key: "authPassword", label: "Supabase Auth password (optional)", placeholder: "", type: "password",
        hint: "Paired with the email above. Only ever sent to this project's own /auth/v1/token endpoint." }
    ],
    docsUrl: "https://supabase.com/docs/guides/api",

    // Optional: exchanges authEmail/authPassword for a session and reports the
    // resulting auth.uid() (or userId:null when those fields aren't set) — the
    // connect wizard uses this to stamp the id onto the signed-in local
    // identity. Every rest() call above already establishes this session on
    // its own, so this is mostly a way to read the id back out.
    signIn: function (cfg) {
      return ensureSession(cfg).then(function (s) { return { ok: true, userId: s ? s.userId : null }; })
        .catch(function (e) { return { ok: false, error: e.message }; });
    },

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
      // A data connection is valid even without our workspace tables — but we
      // can't hit the REST root to prove it: Supabase's new-format publishable
      // keys get a 401 "Secret API key required" there (only the secret key can
      // fetch the OpenAPI/introspection doc now; the legacy eyJ… anon key could).
      // Querying a table that can't exist sidesteps introspection entirely —
      // PostgREST answers 404 (relation not found) for ANY valid key and 401
      // only for a genuinely bad one, which rest() already turns into a rejection.
      return rest(cfg, "/_polecat_key_probe?select=1&limit=1").then(function (r) {
        return (r.ok || r.status === 404) ? { ok: true } : { ok: false, error: "HTTP " + r.status };
      }).catch(function (e) { return { ok: false, error: e.message }; });
    },

    // dataset: { kind:'table', table, query? } — `query` is a raw PostgREST
    // query string (e.g. "select=name,total&order=total.desc&limit=200").
    queryData: function (cfg, dataset) {
      return Studio.WS.postgrestQueryData(rest, cfg, dataset);
    }
  };
}());
