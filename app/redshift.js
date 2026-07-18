/* Analytics — © 2026 Polecat.live. See LICENSE. */
/* Post-overhaul backlog item 2 ("more data adapters") — Amazon Redshift connector: query a
   provisioned cluster or a Serverless workgroup directly from the browser via the Redshift Data
   API (https://docs.aws.amazon.com/redshift-data/latest/APIReference/Welcome.html), no
   backend/proxy. Unlike Snowflake/Databricks/BigQuery's bearer tokens, every AWS API call must be
   individually signed (SigV4, app/sources/sigv4.js) with an access key + secret key (optionally a
   temporary STS session token) — there is no simpler auth mode for this API.
   Studio.Redshift is a small façade over the REST calls, no engine to lazy-load:
     testConnection(cfg) — runs "SELECT 1" to prove credentials + target are all valid
     query(cfg, sql)     — run an arbitrary SQL string against the configured cluster/workgroup
   cfg = { region, accessKeyId, secretAccessKey, sessionToken, database, clusterIdentifier, dbUser,
           workgroupName, endpoint }
     region            — AWS region, e.g. "us-east-1"
     accessKeyId / secretAccessKey / sessionToken — SigV4 credentials (sessionToken optional, for
                         temporary/STS creds)
     database          — database name to run the statement against
     clusterIdentifier + dbUser — target a provisioned cluster (temporary credentials, no stored
                         DB password); leave both blank when using workgroupName
     workgroupName     — target a Redshift Serverless workgroup instead of a provisioned cluster
     endpoint          — optional full https:// override (VPC PrivateLink); defaults to
                         https://redshift-data.<region>.amazonaws.com */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  var POLL_MS = 1000, POLL_MAX = 25; // ExecuteStatement is always async; poll up to ~25s

  function baseUrl(cfg) {
    var ep = (cfg.endpoint || "").trim();
    if (ep) return ep.replace(/\/+$/, "");
    return "https://redshift-data." + String(cfg.region || "").trim() + ".amazonaws.com";
  }

  // Every action is a signed POST with an X-Amz-Target header naming the RPC (the "AWS JSON 1.1"
  // protocol every redshift-data/dynamodb-style API uses) — host/path/query come from the actual
  // request URL (not hardcoded to "/") so a custom VPC-PrivateLink endpoint with its own path still
  // signs correctly.
  function callAction(cfg, action, bodyObj) {
    var region = String(cfg.region || "").trim();
    if (!region) return Promise.reject(new Error("Enter an AWS region first."));
    if (!cfg.accessKeyId || !cfg.secretAccessKey) return Promise.reject(new Error("Enter an access key ID and secret access key first."));
    var url = baseUrl(cfg);
    var u;
    try { u = new URL(url); } catch (e) { return Promise.reject(new Error("Invalid Redshift Data API endpoint URL")); }
    var body = JSON.stringify(bodyObj);
    return Studio.AwsSigV4.sign({
      accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, sessionToken: cfg.sessionToken,
      region: region, service: "redshift-data", host: u.host, method: "POST", path: u.pathname || "/",
      query: (u.search || "").replace(/^\?/, ""), body: body,
      headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": "RedshiftData." + action }
    }).then(function (sig) {
      return fetch(url, { method: "POST", headers: sig.headers, body: body });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) throw new Error(json.message || json.Message || res.statusText || ("HTTP " + res.status));
        return json;
      });
    });
  }

  function executeStatementBody(cfg, sql) {
    var body = { Sql: sql };
    if (cfg.database) body.Database = cfg.database;
    if (cfg.workgroupName) {
      body.WorkgroupName = cfg.workgroupName;
    } else {
      if (cfg.clusterIdentifier) body.ClusterIdentifier = cfg.clusterIdentifier;
      if (cfg.dbUser) body.DbUser = cfg.dbUser;
    }
    return body;
  }

  // A Field is a single-key union: {stringValue}|{longValue}|{doubleValue}|{booleanValue}|
  // {blobValue}|{isNull:true} — decode to the plain JS scalar every other connector's rows carry.
  function decodeField(f) {
    if (!f || f.isNull) return null;
    if ("stringValue" in f) return f.stringValue;
    if ("longValue" in f) return f.longValue;
    if ("doubleValue" in f) return f.doubleValue;
    if ("booleanValue" in f) return f.booleanValue;
    if ("blobValue" in f) return f.blobValue;
    return null;
  }

  function fetchAllResults(cfg, id, nextToken, cols, rows, pages) {
    if (pages > 200) throw new Error("Result set has too many pages — narrow the query.");
    var body = { Id: id };
    if (nextToken) body.NextToken = nextToken;
    return callAction(cfg, "GetStatementResult", body).then(function (json) {
      if (!cols) cols = (json.ColumnMetadata || []).map(function (c) { return c.name || c.label; });
      (json.Records || []).forEach(function (rec) { rows.push(rec.map(decodeField)); });
      if (json.NextToken) return fetchAllResults(cfg, id, json.NextToken, cols, rows, pages + 1);
      return { cols: cols, rows: rows };
    });
  }

  function poll(cfg, id, attempt) {
    if (attempt >= POLL_MAX) throw new Error("Statement is still executing after " + (POLL_MAX * POLL_MS / 1000) + "s — try again or simplify the query.");
    return new Promise(function (resolve) { setTimeout(resolve, POLL_MS); }).then(function () {
      return callAction(cfg, "DescribeStatement", { Id: id }).then(function (json) {
        var status = json.Status;
        if (status === "FINISHED") return json.HasResultSet === false ? { cols: [], rows: [] } : fetchAllResults(cfg, id, null, null, [], 0);
        if (status === "FAILED" || status === "ABORTED") throw new Error(json.Error || ("Statement " + String(status).toLowerCase()));
        return poll(cfg, id, attempt + 1); // SUBMITTED / PICKED / STARTED
      });
    });
  }

  function runStatement(cfg, sql) {
    return Studio.withTimeout(
      callAction(cfg, "ExecuteStatement", executeStatementBody(cfg, sql)).then(function (json) {
        return poll(cfg, json.Id, 0);
      }),
      35000, "Querying Redshift"
    );
  }

  Studio.Redshift = {
    // Never rejects — resolves {ok:false, error} on any failure (bad credentials, unreachable
    // cluster/workgroup, network unreachable) so the inspector shows a clear message instead of a
    // stuck spinner.
    testConnection: function (cfg) {
      return runStatement(cfg, "SELECT 1 AS ok").then(function (result) {
        return { ok: true, cols: result.cols, rows: result.rows };
      }).catch(function (e) {
        return { ok: false, error: Studio.friendlyConnectorError((e && e.message) || String(e)) };
      });
    },

    // Rejects on failure (mirrors Studio.Snowflake.query()'s contract) so callers reuse the same
    // .then/.catch pattern as the existing "Run live" preview.
    query: function (cfg, sql) {
      return runStatement(cfg, (sql && sql.trim()) || "SELECT 1 AS ok");
    }
  };
})();
