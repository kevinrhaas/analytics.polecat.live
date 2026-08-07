#!/usr/bin/env bash
# Serve the Studio over HTTP (it loads JSON/toolkit via fetch — file:// won't work).
cd "$(dirname "$0")"
PORT="${1:-8000}"
echo "PDC Dashboard Studio → http://localhost:${PORT}/"
exec python3 -m http.server "$PORT"
