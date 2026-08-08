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
  var _sessions = {}; // "url|email" -> { accessToken, userId, expiresAt, refreshToken }
  function sessionKey(cfg) { return (cfg.url || "") + "|" + (cfg.authEmail || ""); }

  // ---- N2 slice 4 (M7, the last of it): the refresh token, not the password --
  // The password used to be the thing we kept, because `ensureSession` re-minted
  // an expired JWT from it — which meant `cfg.authPassword` rode the connection
  // record into localStorage and sat there at rest forever. It never had to:
  // GoTrue hands back a REFRESH TOKEN with every grant, so THAT is what we keep,
  // in sessionStorage — the same posture AUD-03 gave the secrets-vault
  // passphrase. One sign-in per browser session, silent re-minting in between,
  // nothing left behind when the tab closes. A refresh token is also strictly
  // weaker than a password: it is scoped to this project + account and can be
  // revoked server-side without changing anyone's password.
  var REFRESH_KEY = "analytics.supabase.refresh.v1"; // sessionStorage: { "url|email": token }
  function refreshStore() {
    try { return JSON.parse(sessionStorage.getItem(REFRESH_KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  function rememberRefresh(cfg, token) {
    try {
      var all = refreshStore();
      if (token) all[sessionKey(cfg)] = token; else delete all[sessionKey(cfg)];
      sessionStorage.setItem(REFRESH_KEY, JSON.stringify(all));
    } catch (e) {}
  }
  function refreshTokenFor(cfg) {
    var cached = _sessions[sessionKey(cfg)];
    if (cached && cached.refreshToken) return cached.refreshToken;
    return refreshStore()[sessionKey(cfg)] || "";
  }
  // "Can this connection still sign its requests in?" — a password in hand for
  // this turn, OR a refresh token from earlier in this browser session. Every
  // place that used to test `cfg.authEmail && cfg.authPassword` asks this
  // instead, so a reloaded page with no stored password still counts as an
  // authenticated workspace rather than silently falling back to anon.
  function hasAuthSession(cfg) {
    return !!(cfg && cfg.authEmail && (cfg.authPassword || refreshTokenFor(cfg)));
  }

  // N14: "did the project ANSWER, or did the infrastructure in front of it give
  // up?" — the status codes that carry no verdict about the credential. 408 is a
  // proxy timing the request out, 429 is rate limiting (the caller is asked to
  // come back, not turned away), and every 5xx is the server saying it could not
  // handle the request at all. Everything else — including 400 invalid_grant,
  // 401, 403 and 422 — is GoTrue speaking for itself and stays authoritative.
  function transportStatus(status) { return status === 408 || status === 429 || status >= 500; }

  // One request shape, two grants (`password` and `refresh_token`) — both hit
  // /auth/v1/token and both answer with the same session envelope.
  function gotrueToken(cfg, grant, body) {
    var base;
    try { base = projectBase(cfg); } catch (e) { return Promise.reject(e); }
    return fetch(base + "/auth/v1/token?grant_type=" + grant, {
      method: "POST",
      headers: { apikey: (cfg.key || "").trim(), "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).catch(function (e) {
      // N2 slice 3: the caller has to tell "the database refused you" apart from
      // "we never reached the database" — the first must never fall back to a
      // locally-stored password hash, the second must (an offline device).
      var err = new Error("Could not reach Supabase Auth (network or CORS): " + e.message);
      err.unreachable = true;
      throw err;
    }).then(function (res) {
      // N11: reading the BODY can fail on its own — the headers arrived, then the
      // connection dropped (a flaky network, a tab navigating away mid-flight) and
      // res.json() rejects on a truncated payload. That used to be swallowed into
      // `{}`, which then read as "a 200 with no access_token" and was reported as
      // `HTTP 200` — a REFUSAL. It is not one: we never got an answer, so it is
      // UNREACHABLE, exactly like the fetch failure above. The distinction is not
      // cosmetic — ensureSession DELETES the stored refresh token on a refusal, so
      // one truncated response used to sign a user out of their workspace.
      return res.json().then(function (data) { return { data: data || {}, read: true }; },
        function () { return { data: {}, read: false }; }).then(function (r) {
        if (!r.read) {
          var err = new Error("Could not reach Supabase Auth (the connection dropped before its answer finished arriving).");
          err.unreachable = true;
          throw err;
        }
        var data = r.data;
        if (!res.ok || !data.access_token) {
          var refusal = new Error("Supabase Auth sign-in failed: " + (data.error_description || data.msg || data.error || ("HTTP " + res.status)));
          // N14: the third and last way this call can come back without being an
          // ANSWER. N2 slice 3 covered the fetch rejecting, N11 covered the body
          // never finishing — but a status that arrived and parsed was still read
          // as GoTrue's authoritative "no", whatever the number was. It isn't: an
          // overloaded project answers 429, a restarting or wedged one answers
          // 500/502/503/504, a proxy gives up with 408. None of those are the
          // workspace refusing this credential; they are the workspace being
          // unable to say. Since ensureSession DELETES the stored refresh token on
          // a refusal, treating them as one signs the user out for the duration of
          // a blip they had nothing to do with — the very failure N2 slice 3 and
          // N11 each closed one door on. Only a real verdict (400 invalid_grant,
          // 401/403, 422) may dispose of a credential.
          if (transportStatus(res.status)) refusal.unreachable = true;
          throw refusal;
        }
        return data;
      });
    });
  }
  function gotrueSignIn(cfg) { return gotrueToken(cfg, "password", { email: cfg.authEmail, password: cfg.authPassword }); }
  function gotrueRefresh(cfg, token) { return gotrueToken(cfg, "refresh_token", { refresh_token: token }); }

  // Cache a fresh grant and keep its refresh token for the rest of the session.
  // GoTrue ROTATES refresh tokens, so a grant that issues a new one replaces the
  // old; a grant that doesn't (some configurations) keeps what we came in with.
  function adoptSession(cfg, data) {
    var carried = refreshTokenFor(cfg);
    var session = {
      accessToken: data.access_token,
      userId: (data.user && data.user.id) || null,
      expiresAt: Date.now() + ((data.expires_in || 3600) * 1000),
      refreshToken: data.refresh_token || carried
    };
    _sessions[sessionKey(cfg)] = session;
    rememberRefresh(cfg, session.refreshToken);
    return session;
  }

  // ---- N12: one grant at a time, per connection ------------------------------
  // A cached session was always shared, but a cache MISS used to start a fresh
  // grant every time it was asked. The post-sign-in boot asks twice, ~55ms
  // apart: both flows read `refreshTokenFor(cfg)` before either wrote the
  // rotated one back, so both spent the SAME refresh token. GoTrue ROTATES
  // refresh tokens — outside its reuse-detection grace window the second spend
  // is REFUSED, and a refusal is final (N2 slice 3): the token is dropped and
  // the user is asked for the workspace password mid-session. So a second
  // caller now awaits the grant already in flight instead of starting its own.
  // The entry is dropped the moment that grant settles, in both directions — a
  // FAILED grant is never left behind as the shared answer, so the next call
  // asks again honestly rather than inheriting a stale rejection.
  var _inflight = {}; // sessionKey -> the grant Promise currently in flight
  function singleFlight(key, start) {
    if (_inflight[key]) return _inflight[key];
    var p = start();
    _inflight[key] = p;
    var clear = function () { if (_inflight[key] === p) delete _inflight[key]; };
    p.then(clear, clear);
    return p;
  }

  // force=true bypasses the cached token and re-mints a brand-new JWT. Admin
  // actions (callAdminFn / seedAdmin) pass it so a token that expired
  // server-side earlier than our cached expiresAt can't surface as the relay's
  // misleading "That sign-in session is no longer valid" — every privileged call
  // mints a fresh session first. It still bypasses the CACHE; what it joins (if
  // one is already running) is a grant that is being minted right now anyway,
  // which is exactly what it asked for — and joining is what keeps a privileged
  // call from being the second spender of a token a boot pull is already using.
  function ensureSession(cfg, force) {
    if (!cfg || !cfg.authEmail) return Promise.resolve(null);
    var key = sessionKey(cfg);
    var cached = _sessions[key];
    if (!force && cached && cached.expiresAt > Date.now() + 5000) return Promise.resolve(cached);
    return singleFlight(key, function () {
      var token = refreshTokenFor(cfg);
      var grant;
      if (token) {
        // Prefer the refresh token: after a reload it is the ONLY credential we
        // still hold. A REFUSED refresh (revoked, rotated out, password changed in
        // the workspace) is final — unless a password happens to be in hand this
        // turn, in which case fall through to the password grant. An UNREACHABLE
        // project stays unreachable so callers keep telling the two apart.
        grant = gotrueRefresh(cfg, token).catch(function (e) {
          if (e && e.unreachable) throw e;
          delete _sessions[key];
          rememberRefresh(cfg, "");
          if (!cfg.authPassword) throw e;
          return gotrueSignIn(cfg);
        });
      } else if (cfg.authPassword) {
        grant = gotrueSignIn(cfg);
      } else {
        return Promise.resolve(null); // anon-key-only connection — unchanged
      }
      return grant.then(function (data) { return adoptSession(cfg, data); });
    });
  }

  // ---- polecat-admin Edge Function relay (M7 slice 7) ------------------------
  // Optional: cfg.adminFnUrl points at a deployed `supabase/functions/
  // polecat-admin` (see tools/M7-RLS-GOLIVE-RUNBOOK.md Path C). It's the only
  // way to run DDL/RLS from the browser (PostgREST can't, even with the
  // service key) — never raw SQL, only these four named actions. Leaving the
  // field blank keeps this adapter's existing anon-key-only behavior exactly
  // as before; the manual SQL runbook (Path A/B) remains the fallback.
  function adminFnBase(cfg) {
    var u = (cfg.adminFnUrl || "").trim().replace(/\/+$/, "");
    if (!u) return null;
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return u;
  }
  function callAdminFn(cfg, action, params, opts) {
    opts = opts || {};
    var base = adminFnBase(cfg);
    if (!base) return Promise.resolve({ ok: false, error: "No admin function URL configured — deploy supabase/functions/polecat-admin (see tools/M7-RLS-GOLIVE-RUNBOOK.md Path C) and paste its URL into this connection's settings." });
    return ensureSession(cfg, true).then(function (session) {
      var h = { "Content-Type": "application/json" };
      if (opts.secret) h["x-provision-secret"] = opts.secret;
      if (session && session.accessToken) h.Authorization = "Bearer " + session.accessToken;
      return fetch(base, { method: "POST", headers: h, body: JSON.stringify({ action: action, params: params || {} }) });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) { return { res: res, data: data }; });
    }, function (e) {
      return { networkError: "Could not reach the admin function (network/CORS, or it isn't deployed yet): " + e.message };
    }).then(function (r) {
      if (r.networkError) return { ok: false, error: r.networkError };
      var res = r.res, data = r.data;
      if (res.status === 401 || res.status === 403) return { ok: false, error: data.error || "The admin function rejected this request (wrong provision secret, or you're not signed in as an admin)." };
      if (res.status === 404) return { ok: false, error: "No admin function found at that URL — deploy it (supabase functions deploy polecat-admin) and check the URL." };
      if (!res.ok) return { ok: false, error: data.error || ("Admin function error: HTTP " + res.status) };
      return Object.assign({ ok: true }, data);
    });
  }

  function rest(cfg, path, opts) {
    opts = opts || {};
    var base;
    try { base = restBase(cfg); } catch (e) { return Promise.reject(e); }
    // Once RLS is live, reads carry the GoTrue bearer — and a token cached from
    // an earlier session can expire server-side before our estimated expiresAt,
    // so the next read gets a 401 and the whole connection reads as "not
    // connected" until a manual Refresh re-signs-in. Self-heal instead: on a
    // 401/403 with Auth creds in play, drop the cached session, mint a fresh one
    // and retry the request ONCE. Anon-only connections (no authEmail/Password)
    // keep the old behavior exactly — a 401 there is a real key problem, not a
    // stale token, so there's nothing to refresh.
    var hasAuth = hasAuthSession(cfg);
    function attempt(session, isRetry) {
      return fetch(base + path, {
        method: opts.method || "GET",
        headers: headers(cfg, opts.headers, session && session.accessToken),
        body: opts.body,
        // ACTIVITY-1: lets the one session-end log event survive pagehide
        keepalive: !!opts.keepalive
      }).catch(function (e) {
        throw new Error("Could not reach Supabase (network or CORS): " + e.message);
      }).then(function (res) {
        if ((res.status === 401 || res.status === 403) && hasAuth && !isRetry) {
          delete _sessions[sessionKey(cfg)];
          return ensureSession(cfg, true).then(function (fresh) { return attempt(fresh, true); });
        }
        return res;
      });
    }
    // Transient-fault absorption (Kevin: "supabase seems very flaky"): a single
    // 429/5xx or network hiccup used to fail the WHOLE write-through push (12+
    // requests per mirror), flapping the rail to Reconnecting… until the 15s
    // backoff retry. Retry the one blipped request once after a beat instead —
    // safe here because every workspace write is idempotent (merge-duplicates
    // upserts + by-filter DELETEs).
    function transientRetry(session) {
      return attempt(session, false).then(function (res) {
        if (res.status !== 429 && res.status < 500) return res;
        return new Promise(function (r) { setTimeout(r, 800); }).then(function () { return attempt(session, false); });
      }, function (e) {
        return new Promise(function (r) { setTimeout(r, 800); })
          .then(function () { return attempt(session, false); })
          .catch(function () { throw e; }); // surface the ORIGINAL error, not the retry's
      });
    }
    return ensureSession(cfg).then(function (session) {
      return transientRetry(session);
    }).then(function (res) {
      // A final 401/403 used to throw a bare "rejected the API key" — but
      // PostgREST's body says WHY (e.g. "new row violates row-level security
      // policy", "permission denied for table x") and that difference is the
      // whole diagnosis: RLS-without-a-write-policy reads as empty-but-ok on
      // pull while every push 403s. Surface the body so the sync log and the
      // Settings error card can actually explain the failure.
      if (res.status === 401 || res.status === 403) {
        return res.text().then(function (b) {
          var msg = "";
          try { msg = (JSON.parse(b) || {}).message || ""; } catch (e) { msg = String(b || "").slice(0, 160); }
          throw new Error("Supabase rejected the request (HTTP " + res.status + ")" + (msg ? ": " + msg : " — bad API key or missing permissions"));
        }, function () {
          throw new Error("Supabase rejected the request (HTTP " + res.status + ") — bad API key or missing permissions");
        });
      }
      return res;
    });
  }
  function sqlLit(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

  // Local copy of Studio.WS.postgrestQueryData (app/sources/schema.js) — post-overhaul backlog
  // item 3's "connection-bound dataset adapters get an exported-runtime path" treatment, third
  // adapter after Turso and PostgREST. This file is bundled STANDALONE into exported/deployed
  // dashboards (see exporters.js's redactSecrets + studio-render.js's CONN_ENGINES), and that
  // bundle never loads schema.js, so `Studio.WS` doesn't exist there — the same "builder-only
  // module, never inlined into the exported bundle" gap postgrest.js's own copy was written to
  // close. Kept byte-identical in shape to postgrest.js's version, but calls THIS file's own
  // `rest()` (apikey + optional GoTrue session bearer) rather than a passed-in restFn — the
  // in-app callers (Explore/preview, where Studio.WS exists) behave exactly as before.
  function pgQueryData(cfg, dataset) {
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

  // AUTH-AWARE remedy for RLS write-refusals (2026-07-30 live incident, hardened
  // KEVIN-LIVE-2 2026-07-31): this workspace counts as an AUTHENTICATED one when
  // the cfg carries stamped credentials OR the signed-in app account is a real
  // Supabase Auth user (gotrueId) — Kevin's packaged-workspace connection had
  // just lost its credential stamp to a re-bind, so the old cfg.authEmail-only
  // test fell through and handed him the open-policy SQL (polecat_open_rw), the
  // exact statement that defeated the whole per-user posture once before. Never
  // emit weakening SQL when any auth signal is present; explain the real causes.
  function rlsRemedyMessage(cfg, msg) {
    var authModel = !!(cfg && cfg.authEmail);
    try {
      var acct = window.PolecatAuth && window.PolecatAuth.current && window.PolecatAuth.current();
      if (acct && acct.gotrueId) authModel = true;
    } catch (e) {}
    if (authModel) {
      return msg + " — this workspace's database enforces per-user Row-Level Security, so this usually means the sign-in session expired or this device's connection lost its sign-in (sign out and back in with your email — that re-attaches your credentials), or this account doesn't own some of the rows being pushed (shared/sample rows sync from an ADMIN account). If this is a brand-new project, apply the canonical policy script (tools/supabase-rls-real.sql) once in Supabase → SQL editor.";
    }
    // RLS on, no write policy, anon-key-only workspace: reads return empty
    // (pull looks fine), every write 401/403s forever — no retry can fix a
    // policy. Hand over the one-time paste-me policy SQL.
    return msg + " — a workspace table has Row-Level Security enabled without a write policy for the app's key, so reads look fine but every save is refused. Run this once in Supabase → SQL editor: " + WS.rlsPolicySQL();
  }
  window.__studioRlsRemedy = rlsRemedyMessage; // KEVIN-LIVE-2 test hook

  // ---- AUD-01: saving the workspace (audit §1.2) -----------------------------
  // Two shapes, one behaviour. saveAtomic() hands the WHOLE snapshot to the
  // polecat_workspace_save() Postgres function (WS.atomicSaveSQL) — a PL/pgSQL
  // function is a single transaction, so the push either fully lands or fully
  // rolls back. saveSequential() is the historical per-table push, kept
  // verbatim for workspaces that have not installed the function: it is a
  // SEQUENCE of independent PostgREST writes, so a connection dropped part-way
  // leaves the workspace HALF SAVED — some tables new, some old, nothing to
  // roll it back. That was the AUD-01 finding, and Supabase (the default
  // backend) was the only adapter with it: Turso batches, Firebase
  // upserts-then-prunes.
  // Resolved lazily, never at load: this file is also bundled STANDALONE into
  // exported dashboards, where schema.js is absent and `WS` is undefined (see
  // pgQueryData's note above). Only the builder ever calls the save path.
  function atomicRpc() { return "/rpc/" + WS.ATOMIC_SAVE_FN; }
  var _atomic = {};        // project URL -> true (function present) | false (absent)
  var _atomicPending = {}; // project URL -> the one in-flight capability probe
  function atomicKey(cfg) {
    try { return projectBase(cfg); } catch (e) { return String((cfg && cfg.url) || ""); }
  }
  // The snapshot in the shape the function expects: rows per table, the
  // explicitly-tombstoned ids per table (never users — sync is upsert-only
  // there, v787), and the meta key/value rows.
  function atomicPayload(snapshot, byTable) {
    var tables = {}, tombstones = {};
    var tombs = (snapshot.meta && snapshot.meta.tombstones) || {};
    WS.TABLE_NAMES.forEach(function (t) {
      tables[t] = byTable[t].map(function (rec) {
        var o = { id: rec.id, data: rec.data };
        Object.keys(rec.cols).forEach(function (k) { o[k] = rec.cols[k]; });
        return o;
      });
      if (t === "users") return;
      var prefix = t + "|";
      var dead = Object.keys(tombs)
        .filter(function (k) { return k.indexOf(prefix) === 0; })
        .map(function (k) { return k.slice(prefix.length); });
      if (dead.length) tombstones[t] = dead;
    });
    return {
      tables: tables,
      tombstones: tombstones,
      meta: WS.metaRows(snapshot).map(function (m) { return { key: m.key, value: m.value }; })
    };
  }
  function saveAtomic(cfg, snapshot, byTable) {
    return rest(cfg, atomicRpc(), { method: "POST", body: JSON.stringify(atomicPayload(snapshot, byTable)) })
      .then(function (r) {
        if (r.status === 404) return { rpcMissing: true }; // not installed — fall back
        if (!r.ok) {
          return r.text().then(function (b) {
            throw new Error("HTTP " + r.status + " in " + WS.ATOMIC_SAVE_FN + "(): " + String(b || "").slice(0, 140));
          });
        }
        return { ok: true, atomic: true };
      });
  }
  function saveSequential(cfg, snapshot, byTable) {
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
      // USERS-DURABLE (Kevin live, 2026-07-31): the old shape here was
      // DELETE-ALL then bulk insert. On the users table, under the admin-arm
      // RLS posture, that SELF-DESTRUCTS: the delete succeeds (pusher is
      // admin), which removes the very row that made them admin — the
      // re-insert is then refused (users INSERT policy is admin-only), the
      // wipe sticks, and with zero users rows NOBODY is admin, so no client
      // can ever repair it. It emptied the live users table twice tonight.
      // DURABLE-2 shape for EVERY table (generalizes USERS-DURABLE):
      //   1) UPSERT the local rows FIRST — privilege state never vanishes
      //      mid-push;
      //   2) then delete ONLY ids the workspace explicitly TOMBSTONED
      //      (meta.tombstones, written by Workspace.remove and synced in
      //      the snapshot). ABSENCE IS NOT DELETION — a stale mirror that
      //      never saw another device's rows has no tombstones for them,
      //      so it can no longer target-delete them as "stale" (the exact
      //      class that killed the freshly-provisioned fntest account).
      //      This also retires the per-table ?select=id read the old
      //      remote-vs-local diff needed, and the old trade-off where
      //      deleting a table's LAST row never propagated.
      //   3) users stays UPSERT-ONLY with NO deletes ever (v787) — account
      //      removal is only the Admin flow's explicit deleteRows().
      chain = chain.then(function () {
        var rows = byTable[t].map(function (rec) {
          var o = { id: rec.id, data: rec.data };
          Object.keys(rec.cols).forEach(function (k) { o[k] = rec.cols[k]; });
          return o;
        });
        var upsert = rows.length
          ? rest(cfg, "/" + t, { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(rows) }).then(mustOk(t))
          : Promise.resolve(null);
        return upsert.then(function () {
          if (t === "users") return null;
          var tombs = (snapshot.meta && snapshot.meta.tombstones) || {};
          var prefix = t + "|";
          var dead = Object.keys(tombs)
            .filter(function (k) { return k.indexOf(prefix) === 0; })
            .map(function (k) { return k.slice(prefix.length); });
          var dp = Promise.resolve();
          for (var i = 0; i < dead.length; i += 40) {
            (function (chunk) {
              dp = dp.then(function () {
                var list = chunk.map(function (id) { return "%22" + encodeURIComponent(id) + "%22"; }).join(",");
                return rest(cfg, "/" + t + "?id=in.(" + list + ")", { method: "DELETE" }).then(mustOk(t));
              });
            })(dead.slice(i, i + 40));
          }
          return dp;
        });
      });
    });
    return chain.then(function () {
      var meta = WS.metaRows(snapshot).map(function (m) { return { key: m.key, value: m.value }; });
      return rest(cfg, "/" + WS.META_TABLE, { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(meta) }).then(mustOk(WS.META_TABLE));
    }).then(function () { return { ok: true }; });
  }
  // One place that turns a thrown save error into the message the Settings
  // card shows — including, when this workspace is still on the per-table
  // push, the one-time SQL that makes its saves atomic. At most ONE paste-me
  // block is ever attached: the card splits the message on "SQL editor: ".
  function saveErrorMessage(cfg, e, sequential) {
    var msg = e.message || String(e);
    // v1 → v2 → v3 delta: Supabase can't DDL over REST, so a workspace that
    // predates the analyses or jobs table needs one paste-me statement —
    // say so instead of a bare 404.
    if (/row-level security|permission denied/i.test(msg)) {
      msg = rlsRemedyMessage(cfg, msg);
    } else if (/analyses|jobs/.test(msg)) {
      msg += " — your workspace predates the analyses/jobs tables. Run this once in Supabase → SQL editor: " + WS.provisionDeltaSQL();
    } else if (sequential) {
      msg += " — this workspace saves one table at a time, so a failure part-way through can leave it half-written. Run this once in Supabase → SQL editor: " + WS.atomicSaveSQL();
    }
    return msg;
  }

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
        hint: "Paired with the email above. Only ever sent to this project's own /auth/v1/token endpoint." },
      { key: "adminFnUrl", label: "Admin function URL (optional)", placeholder: "https://YOUR-REF.functions.supabase.co/polecat-admin", type: "text",
        hint: "Only needed to run Go live / admin actions from the app instead of the SQL editor — deploy supabase/functions/polecat-admin once (tools/M7-RLS-GOLIVE-RUNBOOK.md Path C), then paste its URL here." }
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

    // ---- N2 slice 4: session resumability, read + forget -------------------
    // hasResumableSession answers "could this connection sign in again WITHOUT
    // a password?" — i.e. is there a refresh token from earlier in this browser
    // session. Sync.needsSignIn() asks this to decide whether the gate must
    // re-prompt after a browser restart (app/sources/sync.js, app/gate.js).
    hasResumableSession: function (cfg) { return !!(cfg && cfg.authEmail && refreshTokenFor(cfg)); },
    // Drop everything that could re-authenticate this connection — signing out
    // and disconnecting both call it, so the next visitor to this browser has to
    // present the workspace's own credentials again.
    forgetSession: function (cfg) {
      if (!cfg) return;
      try { delete _sessions[sessionKey(cfg)]; } catch (e) {}
      rememberRefresh(cfg, "");
    },

    // ---- one-step direct sign-in (LF39 item 2 / M7) ------------------------
    // Verify FORM-supplied email + password straight against GoTrue's password
    // grant and hand back the resulting auth.uid — WITHOUT touching the
    // connection's own cached session (cfg.authEmail/authPassword). This is what
    // lets a teammate on a fresh device authenticate against the REAL backend
    // instead of a mirrored local password hash (GoTrue becomes authoritative;
    // no hash ever has to leave a browser). `creds` is {email, password},
    // deliberately separate from cfg.authEmail/authPassword (which sign the
    // connection owner in). Resolves (never rejects) with the uniform
    // {ok, userId?, error?} shape the other auth methods use.
    authenticate: function (cfg, creds) {
      if (!cfg || !cfg.url || !cfg.key) return Promise.resolve({ ok: false, error: "No Supabase workspace is connected." });
      if (!creds || !creds.email || !creds.password) return Promise.resolve({ ok: false, error: "Enter your email and password." });
      // Reuse gotrueSignIn with a synthetic cfg so the connection's _sessions
      // cache (keyed on cfg.authEmail) is left untouched by a sign-in attempt.
      var synth = { url: cfg.url, key: cfg.key, authEmail: creds.email, authPassword: creds.password };
      return gotrueSignIn(synth).then(function (data) {
        var uid = (data && data.user && data.user.id) || null;
        if (!uid) return { ok: false, error: "Sign-in failed." };
        // N2 slice 4: keep this grant's refresh token (session-scoped). It is
        // keyed on the same "url|email" the connection will use once the gate
        // stamps the credentials, so every later JWT can be re-minted from it
        // and the password never has to be written down. The _sessions cache
        // itself is still left untouched — only the token is remembered.
        rememberRefresh(synth, (data && data.refresh_token) || "");
        return { ok: true, userId: uid };
      }, function (e) {
        // `unreachable` distinguishes a network/CORS failure from a genuine
        // rejection (N2 slice 3) — a REJECTION is the database's authoritative
        // "no" and callers must honour it; UNREACHABLE means we simply never
        // asked, so an offline caller may still fall back to its local path.
        return { ok: false, unreachable: !!(e && e.unreachable), error: (e && e.message) || "Sign-in failed." };
      });
    },

    // ---- browser self-signup (M7 slice 6) ----------------------------------
    // Creates a real Supabase Auth (GoTrue) account via its PUBLIC signup
    // endpoint (no service key needed) so the Admin console can provision
    // accounts without ever visiting the Supabase dashboard. `creds` is
    // {email, password} — deliberately separate from cfg.authEmail/
    // authPassword above (those sign the CALLER in; this creates a NEW user).
    // Resolves (never rejects) with a uniform {ok, userId?, error?, ...} shape
    // so callers never need a .catch — the two known "stuck" cases each get a
    // clear, distinct explanation instead of a bare error string:
    //   - the project has signups turned off entirely (`disabled:true`), or
    //   - the account WAS created but this project still requires email
    //     confirmation (`needsConfirmation:true`) — the account can't sign in
    //     until an admin flips that one-time Supabase setting.
    signUp: function (cfg, creds) {
      var base;
      try { base = projectBase(cfg); } catch (e) { return Promise.resolve({ ok: false, error: e.message }); }
      return fetch(base + "/auth/v1/signup", {
        method: "POST",
        headers: { apikey: (cfg.key || "").trim(), "Content-Type": "application/json" },
        body: JSON.stringify({ email: creds.email, password: creds.password })
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) { return { res: res, data: data }; });
      }, function (e) {
        return { networkError: "Could not reach Supabase Auth (network or CORS): " + e.message };
      }).then(function (r) {
        if (r.networkError) return { ok: false, error: r.networkError };
        var res = r.res, data = r.data;
        if (!res.ok) {
          var msg = data.msg || data.error_description || data.error || ("HTTP " + res.status);
          if (data.error_code === "signup_disabled" || /signups? (is |are )?(not allowed|disabled)/i.test(msg)) {
            return { ok: false, disabled: true, error: "Sign-ups are turned off on this Supabase project — enable them in Authentication → Providers → Email, then try again." };
          }
          return { ok: false, error: "Supabase sign-up failed: " + msg };
        }
        var userId = (data.user && data.user.id) || data.id || null;
        if (!data.access_token) {
          return { ok: false, needsConfirmation: true, userId: userId, error: "Account created, but this Supabase project still requires email confirmation before it can sign in — turn off “Confirm email” in Authentication → Providers → Email (one-time setting), then try again." };
        }
        return { ok: true, userId: userId };
      });
    },

    // ---- first-admin bootstrap (pre-go-live) ------------------------------
    // Plants the CALLER's own `users` row (role:"admin", stamped with their
    // verified GoTrue id) straight into the backend `users` table via REST,
    // while RLS is still allow-all so an authenticated insert is permitted.
    // This is the row the polecat-admin relay's requireAdmin() (and, once RLS
    // is live, polecat_is_admin()) recognizes — without it, the very first
    // go-live/create-user can't run because nobody is an admin yet (the
    // chicken-and-egg: go-live seeds the admin but its own gate demands one
    // first). Idempotent (merge-duplicates on the id PK); a no-op replay just
    // re-affirms the same row. Runs before adminGoLive in the go-live flow so
    // the fresh workspace has an admin the relay can verify.
    seedAdmin: function (cfg, params) {
      params = params || {};
      var username = String(params.username || "").trim();
      if (!username) return Promise.resolve({ ok: false, error: "Missing the local admin username to seed." });
      var name = String(params.name || username).trim() || username;
      return ensureSession(cfg, true).then(function (session) {
        if (!session || !session.userId) {
          return { ok: false, error: "Sign in with this connection's Supabase Auth email/password first — the first admin is stamped with that account's identity." };
        }
        var data = { id: "user_" + username, u: username, name: name, role: "admin", demo: false, hash: "", gotrueId: session.userId };
        var row = { id: "user_" + username, name: name, role: "admin", updatedAt: Date.now(), data: JSON.stringify(data) };
        return rest(cfg, "/users", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify([row]) }).then(function (r) {
          if (!r.ok) return r.text().then(function (b) { return { ok: false, error: "Couldn't seed the admin row (HTTP " + r.status + "): " + String(b || "").slice(0, 160) }; });
          return { ok: true, gotrueId: session.userId };
        });
      }).catch(function (e) { return { ok: false, error: (e && e.message) || String(e) }; });
    },

    // ---- polecat-admin Edge Function relay (M7 slice 7) --------------------
    // Runs the whole go-live runbook (bootstrap DDL if needed → truncate →
    // seed the admin `users` row, owned by the CALLER's own verified
    // identity → apply real RLS → verify) via ONE relay call. Requires this
    // connection's Auth email/password to already be signed in as the
    // account that should become the first admin (same GoTrue identity the
    // connect wizard already establishes) — the function reads the admin
    // identity off that session's JWT, never off a client-supplied id, so a
    // tampered request can't hand admin to an arbitrary uid. `secret` is the
    // one-time PROVISION_SECRET — pass it straight through, never store it.
    adminGoLive: function (cfg, secret) {
      var Auth = window.PolecatAuth, me = Auth && Auth.current();
      if (!hasAuthSession(cfg)) {
        return Promise.resolve({ ok: false, error: "Sign in as the admin's Supabase Auth account first (this connection's Auth email/password fields above) — Go live needs to know who becomes the first admin." });
      }
      if (!me) return Promise.resolve({ ok: false, error: "No signed-in local account to seed as the workspace admin." });
      return callAdminFn(cfg, "go-live", { username: me.u, name: me.name || me.u }, { secret: secret });
    },

    // Admin-creates a real Supabase Auth account (no email-confirmation step,
    // unlike the public self-signup in `signUp` above) via the relay, gated
    // by the CALLER's own admin JWT (this connection's signed-in session) —
    // the secure path once the relay is deployed; `signUp` remains the
    // fallback for deployments that never deploy the function.
    adminCreateUser: function (cfg, user) {
      return callAdminFn(cfg, "create-user", user, {});
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
        .concat(["", WS.atomicSaveSQL()]) // AUD-01: atomic from day one
        .concat(["", "-- Then enable Row-Level Security policies appropriate to your project", "-- before exposing the anon key beyond your own use."])
        .join("\n");
      return Promise.resolve({ ok: false, manual: true, sql: sql });
    },

    // N16 slice 2: upgrade an older workspace. PostgREST cannot DDL even with
    // the service key, so this returns the paste-me script rather than
    // pretending — the caller renders it as a first-class "Upgrade workspace"
    // step with a Copy button and an "I've run it" re-check, which is the same
    // remedy the failed-save error string carries today, offered BEFORE the
    // save fails instead of after.
    //
    // DELIBERATELY NOT routed through the polecat-admin Edge Function, even
    // when `cfg.adminFnUrl` is bound. That function CAN run DDL — but its only
    // schema action is `provision`, whose BOOTSTRAP_DDL ends by (re-)creating
    // the demo-posture `polecat_anon_all` policy on every table. Postgres ORs
    // permissive policies together, so calling it on a workspace that has been
    // through go-live would silently re-open it to anon reads: a one-click
    // "upgrade" that quietly undoes the security posture is worse than a
    // paste. The fix is an additive, posture-preserving `upgrade` action on the
    // function (STATUS.md N26); until that ships and is deployed, this path
    // stays honest about needing the SQL editor.
    upgradeWorkspace: function (cfg) {
      var sql = WS.provisionDeltaSQL() +
        "\n\n-- Record that this workspace now carries the v" + WS.SCHEMA_VERSION + " shape, so the app\n" +
        "-- stops offering the upgrade. (Nothing else here touches your data, your\n" +
        "-- Row-Level Security policies or your grants.)\n" +
        'INSERT INTO "' + WS.META_TABLE + '"(key,value) VALUES(' + sqlLit("schema_version") + ", " + sqlLit(String(WS.SCHEMA_VERSION)) + ")\n" +
        "  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;\n" +
        "NOTIFY pgrst, 'reload schema';\n";
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
      // AUD-04: a FAILED read must be distinguishable from an EMPTY table.
      // The old shape caught every per-table error into "leave the table
      // empty" — so a transient 500/RLS hiccup came back as a successful
      // empty-table snapshot, replaceAll adopted it as truth, and the next
      // push could propagate the emptiness. Now: a 404 (table doesn't exist —
      // the legitimate v1→vN schema delta, save() has the paste-me SQL for
      // it) still reads as empty, but ANY OTHER failure rejects the whole
      // load, so sync's existing error paths keep the local mirror and show
      // the honest red "working from the local mirror" state instead.
      var snap = WS.emptySnapshot();
      var failed = [];
      function readFail(what, why) { failed.push(what + " (" + why + ")"); }
      var reads = WS.TABLE_NAMES.map(function (t) {
        return rest(cfg, "/" + t + "?select=data").then(function (r) {
          if (!r.ok) { if (r.status !== 404) readFail(t, "HTTP " + r.status); return; }
          return r.json().then(function (rows) {
            snap.tables[t] = rows.map(function (x) {
              return WS.cellsToRow(typeof x.data === "string" ? x.data : JSON.stringify(x.data));
            }).filter(Boolean);
          });
        }).catch(function (e) { readFail(t, (e && e.message) || "read failed"); });
      });
      return Promise.all(reads).then(function () {
        return rest(cfg, "/" + WS.META_TABLE + "?select=key,value").then(function (r) {
          if (!r.ok) { if (r.status !== 404) readFail(WS.META_TABLE, "HTTP " + r.status); return; }
          return r.json().then(function (meta) {
            meta.forEach(function (m) {
              if (m.key === "settings") { try { snap.settings = JSON.parse(m.value); } catch (e) {} }
              if (m.key === "meta") { try { snap.meta = JSON.parse(m.value); } catch (e) {} }
              // N16: report what the BACKEND is, not what this app is — the
              // handshake in sync.js compares it against WS.SCHEMA_VERSION.
              if (m.key === "schema_version") snap.schemaVersion = Number(m.value) || snap.schemaVersion;
            });
          });
        }).catch(function (e) { readFail(WS.META_TABLE, (e && e.message) || "read failed"); });
      }).then(function () {
        if (failed.length) throw new Error("workspace read incomplete — " + failed.join(", "));
        return snap;
      });
    },

    // AUD-01 (audit §1.2): the whole workspace in ONE transaction when this
    // project carries the atomic-save function, the historical per-table push
    // when it does not. See saveAtomic / saveSequential above.
    save: function (cfg, snapshot) {
      var byTable;
      try { byTable = WS.snapshotToRows(snapshot); } catch (e) { return Promise.resolve({ ok: false, error: e.message }); }
      var key = atomicKey(cfg);
      var sequential = _atomic[key] === false;
      var run = sequential
        ? saveSequential(cfg, snapshot, byTable)
        : saveAtomic(cfg, snapshot, byTable).then(function (r) {
            // ONLY a missing function falls back — an RLS refusal or a 5xx
            // must never be retried as a half-write.
            if (r && r.rpcMissing) {
              _atomic[key] = false; sequential = true;
              return saveSequential(cfg, snapshot, byTable);
            }
            _atomic[key] = true;
            return r;
          });
      return run.catch(function (e) { return { ok: false, error: saveErrorMessage(cfg, e, sequential) }; });
    },

    // Does this project carry the atomic-save function? "yes" | "no" |
    // "unknown" (nothing has asked yet). Drives the Settings card row.
    atomicState: function (cfg) {
      var v = _atomic[atomicKey(cfg)];
      return v === true ? "yes" : v === false ? "no" : "unknown";
    },

    // One cheap, side-effect-free round-trip that answers the same question
    // before any save has run — the function s probe branch writes nothing.
    // Concurrent callers share the one in-flight request; a network/auth
    // fault answers nothing rather than guessing.
    checkAtomic: function (cfg) {
      var key = atomicKey(cfg);
      if (_atomic[key] !== undefined) return Promise.resolve(_atomic[key]);
      if (_atomicPending[key]) return _atomicPending[key];
      _atomicPending[key] = rest(cfg, atomicRpc(), { method: "POST", body: JSON.stringify({ probe: true }) })
        .then(function (r) { _atomic[key] = !!r.ok; }, function () {})
        .then(function () { delete _atomicPending[key]; return _atomic[key]; });
      return _atomicPending[key];
    },

    // ---- data plane ---------------------------------------------------------
    // GOLIVE-CARD (Kevin live, 2026-07-30): read `users` with ONLY the anon key —
    // deliberately NO user session. Under the authenticated-only RLS posture this
    // returns zero rows (or an outright 401/403); under the open demo posture it
    // returns real rows. Admin's per-user-security card contrasts this with the
    // local mirror to tell whether the database is actually enforcing RLS,
    // instead of forever showing the go-live CTA on an already-live project.
    anonProbe: function (cfg) {
      if (!cfg || !cfg.url || !cfg.key) return Promise.resolve(null);
      return fetch(String(cfg.url).replace(/\/$/, "") + "/rest/v1/users?select=id&limit=1", {
        headers: { apikey: cfg.key, Authorization: "Bearer " + cfg.key }
      }).then(function (r) {
        if (!r.ok) return { denied: true, rows: 0 };
        return r.json().then(function (j) { return { denied: false, rows: Array.isArray(j) ? j.length : 0 }; });
      }).catch(function () { return null; }); // network trouble → unknown, card stays as-is
    },

    // GATE-FIX (Kevin live, 2026-07-31): read the users rows THIS SESSION can
    // see — under the tightened select policy that's the caller's own row (an
    // admin sees all). The sign-in adopt path uses this as its fallback: the
    // whole-workspace pull can be guarded (dirty local edits) or the local
    // mirror stale/wiped, but a signed-in user can ALWAYS read their own row —
    // so a verified password must never dead-end in "isn't in your workspace".
    fetchUsers: function (cfg) {
      return rest(cfg, "/users?select=data").then(function (r) {
        if (!r.ok) return [];
        return r.json().then(function (rows) {
          return (rows || []).map(function (row) {
            try { var p = JSON.parse(row.data); return (p && p.id) ? p : null; } catch (e) { return null; }
          }).filter(Boolean);
        });
      }).catch(function () { return []; });
    },

    // ACTIVITY-1 (Kevin, 2026-07-30): append ONE row to a log table
    // (polecat_activity / polecat_feedback), riding the connection's signed-in
    // session — the tables are INSERT-only for authenticated users, admin-read.
    // Fire-and-forget callers (app/activity.js) swallow rejections and queue.
    insertRow: function (cfg, table, row, opts) {
      return rest(cfg, "/" + table, {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify([row]),
        keepalive: !!(opts && opts.keepalive)
      }).then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error("HTTP " + r.status + " " + String(t).slice(0, 120)); });
        return { ok: true };
      });
    },

    // USERS-DURABLE 2: the explicit, targeted row delete — the ONLY way users
    // rows leave the backend (sync is upsert-only for users; the Admin
    // remove-user flow calls this at click time, as the acting admin).
    deleteRows: function (cfg, table, ids) {
      if (!ids || !ids.length) return Promise.resolve({ ok: true });
      var list = ids.map(function (id) { return "%22" + encodeURIComponent(String(id)) + "%22"; }).join(",");
      return rest(cfg, "/" + table + "?id=in.(" + list + ")", { method: "DELETE" }).then(function (r) {
        if (r && r.ok === false) {
          return r.text().then(function (b) { return { ok: false, error: "HTTP " + r.status + ": " + String(b || "").slice(0, 140) }; });
        }
        return { ok: true };
      });
    },

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
      return pgQueryData(cfg, dataset);
    }
  };
}());
