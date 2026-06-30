#!/bin/bash
################################################################################
# deploy.sh — publish THIS iteration's full self-contained suite to the server.
#
# Each iteration deploys to its OWN repo folder /public/pdc-iteration/<VERSION>,
# so v1 and v2 coexist and run independently. Run from anywhere; paths resolve
# relative to this script.
#
# Usage: ./deploy.sh [server] [user] [password]
#   server   host or host:port   (default localhost:8080)
#   user/pass                     (default admin/password)
################################################################################
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(cat "$HERE/VERSION")"
SERVER="${1:-localhost:8080}"
USER="${2:-admin}"
PASS="${3:-password}"
REPO="/public/pdc-iteration/$VERSION"
REPO_COLON="${REPO//\//:}"
BASE="http://$SERVER/pentaho"
UTIL="$HERE/../../pdc-analysis/utility"
CONTENT="$HERE/content/dashboards"

echo "==> Deploying iteration $VERSION to $BASE  ($REPO)"

# 1. Ensure the managed JDBC datasource exists (CDA sql.jndi resolves the MANAGED
#    registry, not simple-jndi — without this every doQuery 500s). Idempotent.
#
#    PORTABILITY CONTRACT: every dashboard's CDA connects to the *named* datasource
#    PDC-BIDB-EXT, and the queries use UNQUALIFIED table names (no schema prefix).
#    The real host + schema are resolved by THIS connection on each server via
#    POSTGRESQL.currentSchema — so the same content runs on any server that has a
#    PDC-BIDB-EXT pointing at the right DB/schema. We therefore only (re)create the
#    connection for the LOCAL dev box; on remote servers the connection is assumed
#    pre-provisioned (do NOT clobber it). Override with FORCE_CONN=1 if you really
#    want deploy.sh to (re)write the connection on a remote server.
if [[ "$SERVER" == localhost* || "$SERVER" == 127.0.0.1* || "${FORCE_CONN:-0}" == "1" ]]; then
  echo "--> ensuring managed connection PDC-BIDB-EXT (local dev → test-db, currentSchema=bidb_ext_dev)"
  curl -s -u "$USER:$PASS" -X PUT \
    "$BASE/plugin/data-access/api/datasource/jdbc/connection/PDC-BIDB-EXT" \
    -H "Content-Type: application/json" \
    --data '{"name":"PDC-BIDB-EXT","accessType":"NATIVE","databaseType":{"shortName":"POSTGRESQL"},"hostname":"test-db","databaseName":"bidb_ext_dev","databasePort":"5432","username":"postgres","password":"password","using_pool":true,"connectionPoolingProperties":{},"extraOptions":{"POSTGRESQL.currentSchema":"bidb_ext_dev"},"attributes":{}}' \
    -o /dev/null -w "    HTTP %{http_code}\n" || true
else
  echo "--> remote server: assuming PDC-BIDB-EXT is already provisioned (host+schema resolved server-side); not clobbering it. (FORCE_CONN=1 to override.)"
fi

# 2. Create the iteration repo folder (push-content 403s on the compare-download
#    if the target folder does not yet exist).
echo "--> ensuring repo folder $REPO"
curl -s -u "$USER:$PASS" -X PUT "$BASE/api/repo/dirs/:public:pdc-iteration" -o /dev/null -w "    pdc-iteration HTTP %{http_code}\n" || true
curl -s -u "$USER:$PASS" -X PUT "$BASE/api/repo/dirs/$REPO_COLON" -o /dev/null -w "    $VERSION HTTP %{http_code}\n" || true

# 3. Publish the full suite (HTML dashboards + per-dashboard .cda + lineage html).
echo "--> publishing $CONTENT -> $REPO"
"$UTIL/push-content.sh" "$CONTENT" "$REPO" "$SERVER" "$USER" "$PASS"

# 3b. Publish the launcher thumbnails (subfolder; push-content does not recurse).
if [ -d "$CONTENT/thumbs" ]; then
  echo "--> publishing launcher thumbnails -> $REPO/thumbs"
  curl -s -u "$USER:$PASS" -X PUT "$BASE/api/repo/dirs/${REPO_COLON}:thumbs" -o /dev/null || true
  "$UTIL/push-content.sh" "$CONTENT/thumbs" "$REPO/thumbs" "$SERVER" "$USER" "$PASS" >/dev/null 2>&1 || true
fi

# 3c. Publish the versioned data-creation suite: the utility (Pentaho jobs + HTML
#     console + variable-manager + properties) and the DDL tree. These are now part
#     of the iteration so the warehouse build process is versioned with the dashboards.
#     Their repo self-references are stamped to /public/pdc-iteration/$VERSION/utility.
#     push-content recurses into subfolders (main/ lineage/ properties/, ddl/NN-*/).
# DDL (.sql) + utility static files (.html/.properties) go via push-content (raw files).
# Pentaho JOBS/TRANSFORMS (.kjb/.ktr) are repository objects — raw PUT leaves an invalid
# node, so they MUST be sent through the import API (POST /api/repo/files/import, which
# requires fileNameOverride). import_kettle() walks a dir and imports every .kjb/.ktr.
import_kettle() {  # localdir  repodir
  local d="$1" repodir="$2"
  find "$d" -type f \( -name '*.kjb' -o -name '*.ktr' \) | while read -r f; do
    local rel="${f#"$d"/}" sub="${rel%/*}" name; name="$(basename "$f")"
    local idir="$repodir"; [ "$sub" != "$rel" ] && idir="$repodir/$sub"
    curl -s -u "$USER:$PASS" \
      -F "importDir=$idir" -F "fileNameOverride=$name" \
      -F "overwriteFile=true" -F "overwriteAclPermissions=true" -F "applyAclPermissions=false" \
      -F "retainOwnership=true" -F "charSet=UTF-8" -F "logLevel=BASIC" \
      -F "fileUpload=@$f;type=application/octet-stream" \
      "$BASE/api/repo/files/import" -o /dev/null -w "    import $rel HTTP %{http_code}\n" || true
  done
}
if [ -d "$HERE/content/ddl" ]; then
  echo "--> publishing data-creation ddl -> $REPO/ddl"
  curl -s -u "$USER:$PASS" -X PUT "$BASE/api/repo/dirs/${REPO_COLON}:ddl" -o /dev/null || true
  "$UTIL/push-content.sh" "$HERE/content/ddl" "$REPO/ddl" "$SERVER" "$USER" "$PASS"
fi
if [ -d "$HERE/content/utility" ]; then
  echo "--> publishing data-creation utility (static files) -> $REPO/utility"
  curl -s -u "$USER:$PASS" -X PUT "$BASE/api/repo/dirs/${REPO_COLON}:utility" -o /dev/null || true
  "$UTIL/push-content.sh" "$HERE/content/utility" "$REPO/utility" "$SERVER" "$USER" "$PASS" 2>/dev/null || true
  echo "--> importing utility Pentaho jobs/transforms (.kjb/.ktr via import API)"
  import_kettle "$HERE/content/utility" "$REPO/utility"
fi

# 4. Clear the CDA cache so new/changed queries take effect.
echo "--> clearing CDA cache"
curl -s -u "$USER:$PASS" "$BASE/plugin/cda/api/clearCache" -o /dev/null -w "    HTTP %{http_code}\n" || true

echo "==> Done. Launcher: $BASE/api/repos/${REPO_COLON}:i-home.html/content"

# 5. Database provisioning is a SEPARATE, companion step (it needs direct DB access
#    + PGPASSWORD, which the box running deploy.sh may not have). The dashboards need a
#    fixed set of warehouse objects to exist in whatever schema the server's PDC-BIDB-EXT
#    resolves to. Ensure them with:
#        PGPASSWORD=<pw> ./deploy-db.sh [--dry-run] [--upgrade-stale] <target_schema>
#    e.g. local=bidb_ext_dev, 193=bidb_ext_dev, 225=bidb_ext. Additive + idempotent;
#    --upgrade-stale also refreshes pre-existing objects that are missing newer columns
#    (rename-backup + recreate, transactional). See deploy-db.sh header.
echo "==> DB: ensure warehouse objects with  PGPASSWORD=… ./deploy-db.sh --upgrade-stale <schema>  (see deploy-db.sh)"
