/* Analytics — © 2026 Polecat.live. See LICENSE. */
/* app/sources/postgrest.js — plain PostgreSQL exposed through PostgREST
   (★★★ post-overhaul item 2: the first of the "many more" adapters, and the
   strategic one — Supabase, the suite's planned main backend, IS Postgres +
   PostgREST, so this adapter speaks to any self-hosted PostgREST in front of
   any Postgres, not just Supabase's flavor of it).

   DATA-plane only (caps.meta:false): a warehouse is where dashboard data
   lives; the app's own workspace goes to local/turso/supabase/firebase.
   Datasets against it are kind:'table' — a table (view) name plus an optional
   raw PostgREST query string (select/order/filters/limit), exactly like the
   Supabase data plane, because it IS the same protocol. Auth is an optional
   Bearer token (PostgREST JWT); an optional schema name rides the
   Accept-Profile header (PostgREST v9+ multi-schema support). */
(function () {
  "use strict";

  function restBase(cfg) {
    var u = (cfg.url || "").trim().replace(/\/+$/, "");
    if (!u) throw new Error("PostgREST URL is required");
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return u;
  }
  function headers(cfg) {
    var h = { "Content-Type": "application/json" };
    var tok = (cfg.token || "").trim();
    if (tok) h.Authorization = /^bearer /i.test(tok) ? tok : "Bearer " + tok;
    var schema = (cfg.schema || "").trim();
    if (schema) h["Accept-Profile"] = schema;
    return h;
  }
  function rest(cfg, path) {
    var base;
    try { base = restBase(cfg); } catch (e) { return Promise.reject(e); }
    return fetch(base + path, { headers: headers(cfg) }).catch(function (e) {
      throw new Error("Could not reach PostgREST (network or CORS): " + e.message);
    });
  }

  Studio.registerSource({
    id: "postgrest",
    label: "PostgreSQL (PostgREST)",
    blurb: "Query any Postgres exposed through PostgREST straight from the browser — table + query-string datasets, optional JWT auth.",
    icon: "db",
    accent: "#336791",
    caps: { meta: false, data: true },
    browserProvision: false,
    fields: [
      { key: "url", label: "PostgREST URL", placeholder: "https://api.example.com", type: "text",
        hint: "The PostgREST root — GET on it answers with the OpenAPI document." },
      { key: "token", label: "Bearer token", placeholder: "eyJ… (optional JWT)", type: "password",
        hint: "Optional — sent as Authorization: Bearer. Leave blank for anonymous access." },
      { key: "schema", label: "Schema", placeholder: "public (optional)", type: "text",
        hint: "Optional — sent as Accept-Profile for multi-schema PostgREST deployments." }
    ],
    docsUrl: "https://postgrest.org/en/stable/references/api.html",

    // ---- data plane ---------------------------------------------------------
    testData: function (cfg) {
      // The PostgREST root answers 200 with the OpenAPI doc for any reachable
      // deployment (and 401 when a required token is missing or wrong).
      return rest(cfg, "/").then(function (r) {
        return r.ok ? { ok: true } : { ok: false, error: "HTTP " + r.status + (r.status === 401 || r.status === 403 ? " — check the Bearer token" : "") };
      }).catch(function (e) { return { ok: false, error: e.message }; });
    },

    // dataset: { kind:'table', table, query? } — `query` is a raw PostgREST
    // query string (e.g. "select=region,total&order=total.desc&limit=200");
    // {{params}} in both are applied upstream by dsxRunnableDef.
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
    },

    // ---- meta plane: honest refusals (same shape as data-adapters.js) -------
    test: function (cfg) { return this.testData(cfg); },
    probe: function () { return Promise.resolve({ state: "foreign", tables: [] }); },
    provision: function () { return Promise.resolve({ ok: false, error: "PostgREST holds dashboard data, not the app workspace — pick Local, Turso, Supabase or Firebase for the backend." }); },
    summarize: function () { return Promise.resolve({ tables: [] }); },
    drop: function () { return Promise.resolve({ ok: false, error: "Not a workspace backend" }); },
    load: function () { return Promise.resolve(Studio.WS.emptySnapshot()); },
    save: function () { return Promise.resolve({ ok: false, error: "Not a workspace backend" }); }
  });
}());
