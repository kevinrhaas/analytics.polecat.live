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
      status: state.status, isRemote: !src.local, lastError: state.lastError, lastPushAt: state.lastPushAt };
  }
  function emit() { listeners.forEach(function (fn) { try { fn(publicState()); } catch (e) {} }); }
  function setStatus(status, err) { state.status = status; state.lastError = err || ""; emit(); }

  function saveConn() {
    try {
      if (state.sourceId === "local") localStorage.removeItem(CONN_KEY);
      else localStorage.setItem(CONN_KEY, JSON.stringify({ sourceId: state.sourceId, cfg: state.cfg, at: Date.now() }));
    } catch (e) {}
  }
  function loadConn() { try { return JSON.parse(localStorage.getItem(CONN_KEY) || "null"); } catch (e) { return null; } }

  function schedulePush() {
    if (state.sourceId === "local") return; // local needs no mirror
    _dirty = true;
    clearTimeout(_timer);
    _timer = setTimeout(flushPush, DEBOUNCE_MS);
  }
  function flushPush() {
    if (state.sourceId === "local" || _inflight || !_dirty) return Promise.resolve();
    var src = Studio.sourceById(state.sourceId);
    if (!src) return Promise.resolve();
    _inflight = true; _dirty = false;
    setStatus("syncing");
    return encTransform(W().snapshot()).then(function (snap) {
      return src.save(state.cfg, snap);
    }).then(function (res) {
      if (res && res.ok === false) throw new Error(res.error || "write failed");
      state.lastPushAt = Date.now();
      setStatus("connected");
    }).catch(function (e) {
      _dirty = true; // keep pending for a retry
      setStatus("error", e.message || "sync failed");
    }).then(function () {
      _inflight = false;
      if (_dirty && state.status !== "error") schedulePush();
    });
  }

  var Sync = {
    onSync: function (fn) { listeners.push(fn); return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
    syncState: publicState,
    // credentials for the Edit form — kept out of syncState so secrets don't feed the rail
    currentConfig: function () { return state.cfg ? JSON.parse(JSON.stringify(state.cfg)) : null; },
    secretsState: function () { return { available: C().cryptoAvailable(), enabled: _sec.enabled, locked: _sec.enabled && !_sec.key }; },

    pushNow: function () { clearTimeout(_timer); return flushPush(); },

    // Pull the remote's contents and adopt them (the one thing automation can't
    // do — there's no live subscription). Flushes pending local writes first.
    pullNow: function () {
      if (state.sourceId === "local") return Promise.resolve(publicState());
      var src = Studio.sourceById(state.sourceId);
      if (!src) return Promise.resolve(publicState());
      return Sync.pushNow().then(function () {
        setStatus("connecting");
        _suspend = true;
        return src.load(state.cfg).then(decTransform).then(function (snap) {
          W().replaceAll(snap);
          setStatus("connected");
        }).catch(function (e) { setStatus("error", e.message || "refresh failed"); })
          .then(function () { _suspend = false; return publicState(); });
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
      return src.load(conn.cfg).then(decTransform).then(function (snap) {
        W().replaceAll(snap);
        setStatus("connected");
      }).catch(function (e) {
        setStatus("error", (e.message || "could not reach source") + " — working from the local mirror");
      }).then(function () { _suspend = false; return publicState(); });
    }
  };

  Studio.Sync = Sync;
}());
