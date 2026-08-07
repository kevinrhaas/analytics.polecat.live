#!/usr/bin/env bash
# Generate deployable Pentaho artifacts (.cda/.html/.cdfde/.wcdf) from Studio specs.
#   ./deploy.sh <spec.studio.json> [outDir] [deployPath]
#   ./deploy.sh --all            [outDir] [deployPath]   # export every example
# Defaults: outDir=dist  deployPath=/public/pdc-iteration/v2
# To drop straight into the v2 suite, pass its dashboards dir as outDir.
cd "$(dirname "$0")"
SPEC="$1"
if [ -z "$SPEC" ]; then
  echo "usage: ./deploy.sh <spec.studio.json> [outDir] [deployPath]"
  echo "       ./deploy.sh --all [outDir] [deployPath]"
  exit 1
fi
OUT="${2:-dist}"; DEPLOY="${3:-/public/pdc-iteration/v2}"
mkdir -p "$OUT"
if [ "$SPEC" = "--all" ]; then
  for f in data/examples/*.studio.json; do node tools/export.js "$f" "$OUT" "$DEPLOY"; done
else
  node tools/export.js "$SPEC" "$OUT" "$DEPLOY"
fi
echo "→ wrote artifacts to $OUT (deploy path $DEPLOY)"
