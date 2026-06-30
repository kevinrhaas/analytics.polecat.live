#!/usr/bin/env bash
# deploy-https.sh — deploy the iteration/vN dashboard suite to an HTTPS Pentaho server.
#
# Self-contained companion to deploy.sh (which is http-only). Imports every dashboard
# file (.html/.cda/.wcdf/.cdfde) + launcher thumbnails into /public/pdc-iteration/<VERSION>
# via the repo import API over HTTPS, then clears the CDA cache. Used for the public
# cloud Pentaho (e.g. https://server.pentaho.space/pentaho) where a cloud Claude Code
# session can reach the server (unlike localhost / VPN-gated 193).
#
# Usage:  ./iteration/v2/deploy-https.sh https://server.pentaho.space/pentaho admin 'PASSWORD'
#   arg1 = full Pentaho base URL (scheme + host[:port] + /pentaho)
#   arg2 = username   arg3 = password
#
# The warehouse connection (PDC-BIDB-EXT JNDI → bidb_ext_dev) must already exist on the
# server and point at a reachable Postgres with the dimensional model + demo overlays.
set -euo pipefail
BASE="${1:?usage: deploy-https.sh <pentaho-base-url> <user> <pass>}"; BASE="${BASE%/}"
USER="${2:?user}"; PASS="${3:?pass}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(cat "$HERE/VERSION")"
CONTENT="$HERE/content/dashboards"
REPO="/public/pdc-iteration/$VERSION"
REPO_COLON="${REPO//\//:}"

echo "==> Deploying iteration $VERSION to $BASE  ($REPO)"

# 1. Ensure target dirs (409 = already exists, fine).
for d in ":public:pdc-iteration" "$REPO_COLON" "${REPO_COLON}:thumbs"; do
  curl -s -u "$USER:$PASS" -X PUT "$BASE/api/repo/dirs/$d" -o /dev/null -w "    dir $d HTTP %{http_code}\n" || true
done

# 2. Import every dashboard file (top level) via the import API.
import_file() {  # localfile  repodir
  local f="$1" idir="$2" name; name="$(basename "$f")"
  curl -s -u "$USER:$PASS" \
    -F "importDir=$idir" -F "fileNameOverride=$name" \
    -F "overwriteFile=true" -F "overwriteAclPermissions=true" -F "applyAclPermissions=false" \
    -F "retainOwnership=true" -F "charSet=UTF-8" -F "logLevel=BASIC" \
    -F "fileUpload=@$f;type=application/octet-stream" \
    "$BASE/api/repo/files/import" -o /dev/null -w "    import $name HTTP %{http_code}\n" || true
}
echo "--> publishing dashboards -> $REPO"
n=0
while IFS= read -r f; do import_file "$f" "$REPO"; n=$((n+1)); done < <(find "$CONTENT" -maxdepth 1 -type f \( -name '*.html' -o -name '*.cda' -o -name '*.wcdf' -o -name '*.cdfde' -o -name '*.xdash' -o -name '*.xanalyzer' -o -name '*.locale' \) | sort)
echo "    ($n dashboard files)"

# 3. Launcher thumbnails (subfolder).
if [ -d "$CONTENT/thumbs" ]; then
  echo "--> publishing launcher thumbnails -> $REPO/thumbs"
  t=0
  while IFS= read -r f; do import_file "$f" "$REPO/thumbs"; t=$((t+1)); done < <(find "$CONTENT/thumbs" -maxdepth 1 -type f -name '*.jpg' | sort)
  echo "    ($t thumbnails)"
fi

# 4. Clear the CDA cache so new/changed queries take effect.
echo "--> clearing CDA cache"
curl -s -u "$USER:$PASS" "$BASE/plugin/cda/api/clearCache" -o /dev/null -w "    HTTP %{http_code}\n" || true

echo "==> Done. Launcher: $BASE/api/repos/${REPO_COLON}:i-home.html/content"
