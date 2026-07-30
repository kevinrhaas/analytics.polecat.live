/* app/sources/sync.js — the workspace-backend connection manager + write-
   through mirror, ported from manager.polecat.live/js/sync.js.

   Glue between Studio.Workspace (synchronous, localStorage-backed) and a
   pluggable remote meta-capable source. The model is a WRITE-THROUGH MIRROR:
     • the working copy the app reads/writes is ALWAYS local + synchronous
       (no view ever has to become async), and
     • when a remote is connected, every mutation mirrors up on a short
       debounce; reconnecting from another browser pulls it back.

   The active connection (source id + credentials) lives in localStorage — a
   static app has nowhere else to keep it. Called out in the UI.

   Secrets at rest: where manager encrypts its credentials vault, THIS app's
   secrets are the password-typed cfg fields on connection rows (tokens, API
   keys). When enabled, those values are AES-GCM encrypted before the snapshot
   is written to the remote and decrypted on load — zero-knowledge, passphrase
   never leaves the browser. */
(function () {
  "use strict";
  var W = function () { return Studio.Workspace; };
  var C = function () { return Studio.SecretsCrypto; };

  var CONN_KEY = "analytics.datasource.v1";
  var SECRET_KEY = "analytics.datasource.secret.v1"; // cached passphrase (this browser)
  var DEBOUNCE_MS = 1200;

  var _sec = { enabled: false, salt: null, iters: 150000, key: null };

  function cachedPass() { try { return localStorage.getItem(SECRET_KEY) || ""; } catch (e) { return ""; } }
  function cachePass(p) { try { if (p) localStorage.setItem(SECRET_KEY, p); else localStorage.removeItem(SECRET_KEY); } catch (e) {} }

  // Which cfg keys on a connection row are secret = its adapter's password fields.
  function secretKeysFor(row) {
    var src = Studio.sourceById(row.adapter);
    return ((src && src.fields) || []).filter(function (f) { return f.type === "password"; }).map(function (f) { return f.key; });
  }

  // Encrypt secret cfg values on the way OUT (already-encrypted envelopes and
  // empties pass through, so a locked browser round-trips ciphertext without
  // double-encrypting). Stamps the marker into snapshot.meta.
  function encTransform(snap) {
    if (!_sec.enabled) return Promise.resolve(snap);
    var out = JSON.parse(JSON.stringify(snap));
    out.meta = out.meta || {};
    out.meta.secretsEnc = { v: 1, salt: _sec.salt, iters: _sec.iters };
    if (!_sec.key) return Promise.resolve(out);
    var jobs = [];
    (out.tables.connections || []).forEach(function (row) {
      secretKeysFor(row).forEach(function (k) {
        var v = row.cfg && row.cfg[k];
        if (v == null || v === "" || C().isEnvelope(v)) return;
        jobs.push(C().encryptStr(_sec.key, v).then(function (env) { row.cfg[k] = env; }));
      });
    });
    return Promise.all(jobs).then(function () { return out; });
  }

  // Decrypt secret cfg values coming IN. Picks up the marker and tries the
  // cached passphrase; absent/wrong key leaves envelopes in place (the
  // Connections view still renders — the values just stay locked).
  function decTransform(snap) {
    var marker = snap.meta && snap.meta.secretsEnc;
    var ready = Promise.resolve();
    if (marker) {
      _sec.enabled = true; _sec.salt = marker.salt; _sec.iters = marker.iters || 150000;
      if (!_sec.key) {
        var p = cachedPass();
        if (p) ready = C().deriveKey(p, _sec.salt, _sec.iters).then(function (k) { _sec.key = k; }).catch(function () {});
      }
    } else { _sec.enabled = false; _sec.key = null; }
    return ready.then(function () {
      if (!_sec.enabled || !_sec.key) return snap;
      var jobs = [];
      (snap.tables.connections || []).forEach(function (row) {
        secretKeysFor(row).forEach(function (k) {
          var v = row.cfg && row.cfg[k];
          if (!C().isEnvelope(v)) return;
          jobs.push(C().decryptStr(_sec.key, v).then(function (plain) { row.cfg[k] = plain; }).catch(function () {}));
        });
      });
      return Promise.all(jobs).then(function () { return snap; });
    });
  }

  // status: 'local' | 'connecting' | 'connected' | 'syncing' | 'error'
  var state = { sourceId: "local", status: "local", lastError: "", lastPushAt: 0, cfg: null };
  var _suspend = false, _timer = null, _inflight = false, _dirty = false;
  var listeners = [];

  function publicState() {
    var src = Studio.sourceById(state.sourceId) || Studio.localSource;
    return { sourceId: state.sourceId, label: src.label, source: src,
      status: state.status, isRemote: !src.local, lastError: state.lastError, lastPushAt: state.lastPushAt,
      // DURABLE-1: consumers (the push-failure banner) need to know that local
      // edits exist which the backend keeps refusing — a quiet rail dot wasn't
      // enough warning that work was one stale pull away from being clobbered.
      pendingEdits: _dirty, pushFails: state.pushFails || 0 };
  }
  // DURABLE-1 (Kevin live, 2026-07-30 — vanished + duplicated dashboards): a pull
  // ADOPTION replaces the whole workspace with the remote snapshot. When that
  // remote is stale (failed pushes, another device's older union), adoption
  // silently resurrects duplicates and drops rows the boot heals had seeded —
  // and because the heals ran BEFORE the async adoption landed, their work was
  // clobbered on every load. So: after EVERY adoption, re-run the registered
  // heals (studio.js registers its pack reconcile/dedupe/backfills). The heals'
  // own edits run with _suspend already cleared, so they schedule a push and the
  // healed state finally persists remotely instead of being re-clobbered.
  var _adoptHeals = [];
  function healAfterAdopt() { _adoptHeals.forEach(function (fn) { try { fn(); } catch (e) {} }); }
  function emit() { listeners.forEach(function (fn) { try { fn(publicState()); } catch (e) {} }); }
  function setStatus(status, err) {
    state.status = status; state.lastError = err || "";
    // Self-heal (Kevin's "connect → save a View → red forever" repro): a failed
    // push used to park the mirror in 'error' with retries explicitly disabled,
    // so ONE hiccup silently stopped all write-through until a manual Refresh.
    // Now every error state arms a backoff retry, and any recovery resets it.
    if (status === "error") scheduleRetry();
    else if (status === "connected" || status === "local") { clearTimeout(_retryTimer); _retryMs = RETRY_START_MS; }
    emit();
  }

  // ---- error-state retry (backoff) ----------------------------------------
  var RETRY_START_MS = 15000, RETRY_MAX_MS = 120000;
  var _retryTimer = null, _retryMs = RETRY_START_MS;
  function scheduleRetry() {
    if (state.sourceId === "local") return;
    clearTimeout(_retryTimer);
    _retryTimer = setTimeout(retryNow, _retryMs);
    _retryMs = Math.min(_retryMs * 2, RETRY_MAX_MS);
  }
  // Re-attempt whatever failed: pending local edits push up (write-through
  // semantics — local wins while dirty); with nothing pending, re-pull the
  // remote (same adoption a boot/Refresh does — safe, since no local edits
  // exist to clobber; a wrong guess can't lose work because any edit made
  // while red sets _dirty and routes this through flushPush instead).
  function retryNow() {
    if (state.sourceId === "local") return Promise.resolve();
    if (_inflight) { scheduleRetry(); return Promise.resolve(); }
    if (_dirty) return flushPush(true);
    var src = Studio.sourceById(state.sourceId);
    if (!src) return Promise.resolve();
    _suspend = true;
    return src.load(state.cfg).then(decTransform).then(function (snap) {
      W().replaceAll(snap);
      logSync("pull", true);
      setStatus("connected");
    }).catch(function (e) {
      logSync("pull", false, e.message || "sync failed");
      setStatus("error", e.message || "sync failed");
    }).then(function () { _suspend = false; healAfterAdopt(); });
  }

  function saveConn() {
    try {
      if (state.sourceId === "local") localStorage.removeItem(CONN_KEY);
      else localStorage.setItem(CONN_KEY, JSON.stringify({ sourceId: state.sourceId, cfg: state.cfg, at: Date.now() }));
    } catch (e) {}
  }
  function loadConn() { try { return JSON.parse(localStorage.getItem(CONN_KEY) || "null"); } catch (e) { return null; } }

  // Rolling sync-activity log (newest first, capped): the rail dot alone can't
  // explain a flaky backend — the Settings card renders this so the actual
  // failure text is readable and reportable.
  var _log = [];
  function logSync(kind, isOk, err) {
    _log.unshift({ at: Date.now(), kind: kind, ok: !!isOk, error: err || "" });
    if (_log.length > 12) _log.length = 12;
  }

  // A full mirror is a burst of requests per table — pushing on every 1.2s
  // debounce during rapid editing can trip backend rate limits (a big source of
  // "flaky" red flaps). Debounced pushes keep a minimum spacing; bursts
  // coalesce into the next slot. pushNow/pagehide bypass via force.
  var MIN_PUSH_GAP_MS = 4000;
  var _lastPushEnd = 0;

  function schedulePush() {
    if (state.sourceId === "local") return; // local needs no mirror
    _dirty = true;
    clearTimeout(_timer);
    _timer = setTimeout(flushPush, DEBOUNCE_MS);
  }
  function flushPush(force) {
    if (state.sourceId === "local" || _inflight || !_dirty) return Promise.resolve();
    if (force !== true) {
      var wait = MIN_PUSH_GAP_MS - (Date.now() - _lastPushEnd);
      if (wait > 0) { clearTimeout(_timer); _timer = setTimeout(flushPush, wait); return Promise.resolve(); }
    }
    var src = Studio.sourceById(state.sourceId);
    if (!src) return Promise.resolve();
    _inflight = true; _dirty = false;
    setStatus("syncing");
    return encTransform(W().snapshot()).then(function (snap) {
      return src.save(state.cfg, snap);
    }).then(function (res) {
      if (res && res.ok === false) throw new Error(res.error || "write failed");
      state.lastPushAt = Date.now();
      state.pushFails = 0; // DURABLE-1: recovery clears the failure streak
      logSync("push", true);
      setStatus("connected");
    }).catch(function (e) {
      _dirty = true; // keep pending — setStatus('error') arms the backoff retry
      state.pushFails = (state.pushFails || 0) + 1; // DURABLE-1: feeds the loud banner
      logSync("push", false, e.message || "sync failed");
      setStatus("error", e.message || "sync failed");
    }).then(function () {
      _inflight = false;
      _lastPushEnd = Date.now();
      // more edits arrived while this push was in flight — mirror them too
      // (the error case is already queued on the retry timer, don't double up)
      if (_dirty && state.status !== "error") schedulePush();
    });
  }

  var Sync = {
    onSync: function (fn) { listeners.push(fn); return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
    // DURABLE-1: register a heal to re-run after every remote adoption (see
    // healAfterAdopt above). studio.js registers its pack reconcile here.
    // healAfterAdopt is exported so the suite can exercise the registered
    // heals without a live remote round-trip.
    onAdopt: function (fn) { _adoptHeals.push(fn); },
    healAfterAdopt: healAfterAdopt,
    syncState: publicState,
    // credentials for the Edit form — kept out of syncState so secrets don't feed the rail
    currentConfig: function () { return state.cfg ? JSON.parse(JSON.stringify(state.cfg)) : null; },
    secretsState: function () { return { available: C().cryptoAvailable(), enabled: _sec.enabled, locked: _sec.enabled && !_sec.key }; },

    pushNow: function () { clearTimeout(_timer); return flushPush(true); },
    // immediate self-heal attempt (also what the backoff timer fires)
    retryNow: retryNow,
    // recent sync attempts (newest first) — the Settings card renders these
    syncLog: function () { return _log.slice(); },

    // Pull the remote's contents and adopt them (the one thing automation can't
    // do — there's no live subscription). Flushes pending local writes first.
    pullNow: function () {
      if (state.sourceId === "local") return Promise.resolve(publicState());
      var src = Studio.sourceById(state.sourceId);
      if (!src) return Promise.resolve(publicState());
      return Sync.pushNow().then(function () {
        // DATA-LOSS GUARD (Kevin live, 2026-07-30): if that push FAILED, local
        // edits are still pending — adopting the remote now would replaceAll
        // OVER the very rows the backend just refused (save a View → push 403s
        // → hit Refresh → the View silently vanishes and the card reads
        // "Connected"). Keep local as-is and keep the honest error instead;
        // the backoff retry (or a fixed backend) pushes the edits later.
        if (_dirty) return publicState();
        setStatus("connecting");
        _suspend = true;
        return src.load(state.cfg).then(decTransform).then(function (snap) {
          W().replaceAll(snap);
          logSync("pull", true);
          setStatus("connected");
        }).catch(function (e) { logSync("pull", false, e.message || "refresh failed"); setStatus("error", e.message || "refresh failed"); })
          .then(function () { _suspend = false; healAfterAdopt(); return publicState(); });
      });
    },

    updateConnection: function (cfg) {
      if (state.sourceId === "local") return Promise.resolve(publicState());
      return Sync.connectAdopt(state.sourceId, cfg);
    },

    // Adopt an EXISTING workspace on a remote: pull it down as the working copy.
    connectAdopt: function (sourceId, cfg) {
      var src = Studio.sourceById(sourceId);
      if (!src) return Promise.reject(new Error("unknown source"));
      setStatus("connecting");
      _suspend = true;
      return src.load(cfg).then(decTransform).then(function (snap) {
        W().replaceAll(snap);
      }).then(function () {
        _suspend = false;
        state.sourceId = sourceId; state.cfg = cfg; saveConn();
        setStatus("connected");
        healAfterAdopt();
        return publicState();
      }, function (e) { _suspend = false; setStatus("error", e.message); throw e; });
    },

    // Connect to an EMPTY (freshly provisioned) remote by pushing local up.
    connectPush: function (sourceId, cfg) {
      var src = Studio.sourceById(sourceId);
      if (!src) return Promise.reject(new Error("unknown source"));
      setStatus("connecting");
      state.sourceId = sourceId; state.cfg = cfg;
      return encTransform(W().snapshot()).then(function (snap) {
        return src.save(cfg, snap);
      }).then(function (res) {
        if (res && res.ok === false) throw new Error(res.error || "initial push failed");
        state.lastPushAt = Date.now(); saveConn(); setStatus("connected");
        return publicState();
      }).catch(function (e) {
        state.sourceId = "local"; state.cfg = null; // roll back on failure
        setStatus("error", e.message);
        throw e;
      });
    },

    // WORKSPACE-LOGIN: bind a connection WITHOUT pulling. The sign-in screen
    // uses this — under authenticated-only RLS an unauthenticated pull reads
    // the remote as EMPTY, and adopting that would replaceAll a device's real
    // local work away. The post-sign-in pull (direct-auth's pullNow) adopts
    // with the user's own session instead.
    bindConnection: function (sourceId, cfg) {
      var src = Studio.sourceById(sourceId);
      if (!src) return Promise.reject(new Error("unknown source"));
      state.sourceId = sourceId; state.cfg = cfg ? JSON.parse(JSON.stringify(cfg)) : null;
      saveConn();
      setStatus("connected"); // optimistic — the first real pull/push corrects it
      return Promise.resolve(publicState());
    },

    // Detach and go back to local-only; the working copy stays as-is.
    disconnect: function () {
      clearTimeout(_timer);
      state.sourceId = "local"; state.cfg = null; state.lastError = ""; state.lastPushAt = 0;
      _sec.enabled = false; _sec.key = null; _sec.salt = null; // forget the encryption context
      saveConn();
      setStatus("local");
      return publicState();
    },

    // ---- secrets controls --------------------------------------------------
    enableSecrets: function (passphrase) {
      if (!C().cryptoAvailable()) return Promise.reject(new Error("encryption isn't supported in this browser"));
      if (state.sourceId === "local") return Promise.reject(new Error("connect a workspace backend first"));
      if (!passphrase || passphrase.length < 4) return Promise.reject(new Error("choose a longer passphrase"));
      _sec.enabled = true; _sec.salt = C().newSalt(); _sec.iters = 150000;
      return C().deriveKey(passphrase, _sec.salt, _sec.iters).then(function (k) {
        _sec.key = k;
        cachePass(passphrase);
        _dirty = true;
        return Sync.pushNow();
      }).then(function () { emit(); return Sync.secretsState(); });
    },
    unlockSecrets: function (passphrase) {
      if (!_sec.enabled || !_sec.salt) return Promise.reject(new Error("nothing to unlock"));
      var key;
      return C().deriveKey(passphrase, _sec.salt, _sec.iters).then(function (k) {
        key = k;
        var withEnv = W().all("connections").filter(function (r) {
          return secretKeysFor(r).some(function (fk) { return C().isEnvelope(r.cfg && r.cfg[fk]); });
        })[0];
        if (!withEnv) return null;
        var fk = secretKeysFor(withEnv).filter(function (k2) { return C().isEnvelope(withEnv.cfg[k2]); })[0];
        return C().decryptStr(key, withEnv.cfg[fk]); // throws on a wrong passphrase
      }).then(function () {
        _sec.key = key; cachePass(passphrase);
        _suspend = true;
        var jobs = [];
        W().all("connections").forEach(function (r) {
          secretKeysFor(r).forEach(function (fk) {
            if (!C().isEnvelope(r.cfg && r.cfg[fk])) return;
            jobs.push(C().decryptStr(key, r.cfg[fk]).then(function (plain) {
              r.cfg[fk] = plain;
              W().put("connections", r, { silent: true });
            }).catch(function () {}));
          });
        });
        return Promise.all(jobs);
      }).then(function () {
        _suspend = false;
        W().notify("connections");
        emit();
        return Sync.secretsState();
      }, function (e) { _suspend = false; throw e; });
    },
    disableSecrets: function () {
      if (state.sourceId === "local") return Promise.resolve(Sync.secretsState());
      _sec.enabled = false; _sec.key = null; _sec.salt = null; cachePass("");
      _dirty = true;
      return Sync.pushNow().then(function () { emit(); return Sync.secretsState(); });
    },

    // ---- boot ---------------------------------------------------------------
    // Restores a saved remote by pulling it fresh (the remote is the source of
    // truth) and starts the write-through subscription. On failure we stay
    // usable on the local mirror and surface the error.
    initSync: function () {
      W().on("change", function () { if (!_suspend) schedulePush(); });
      var conn = loadConn();
      if (!conn || !conn.sourceId || conn.sourceId === "local") { setStatus("local"); return Promise.resolve(publicState()); }
      var src = Studio.sourceById(conn.sourceId);
      if (!src) { setStatus("local"); return Promise.resolve(publicState()); }
      state.sourceId = conn.sourceId; state.cfg = conn.cfg;
      setStatus("connecting");
      _suspend = true;
      // Boot self-heal (#111): a fresh page has no cached GoTrue session, and the
      // very first authenticated read can race the session/secrets setup and come
      // back 401/403 ("rejected the API key") — the exact flap a manual Refresh
      // fixes. So auto-retry the connect a couple times with a short backoff
      // before surfacing red: the workspace just connects on entry instead of
      // needing a click. Only recoverable auth/session errors retry; a genuinely
      // unreachable/misconfigured source falls through to the local mirror as before.
      var RETRY_MS = [500, 1500];
      function connectOnce(attempt) {
        return src.load(state.cfg).then(decTransform).then(function (snap) {
          W().replaceAll(snap);
          logSync("boot pull", true);
          setStatus("connected");
        }).catch(function (e) {
          var msg = e.message || "could not reach source";
          var recoverable = /401|403|rejected the api key|sign-in failed|session|jwt/i.test(msg);
          if (recoverable && attempt < RETRY_MS.length) {
            setStatus("connecting");
            return new Promise(function (res) { setTimeout(res, RETRY_MS[attempt]); }).then(function () { return connectOnce(attempt + 1); });
          }
          logSync("boot pull", false, msg);
          setStatus("error", msg + " — working from the local mirror");
        });
      }
      return connectOnce(0).then(function () { _suspend = false; healAfterAdopt(); return publicState(); });
    }
  };

  Studio.Sync = Sync;
}());
