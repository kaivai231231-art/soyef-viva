#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/artifacts/viva-study"
DEST="$ROOT/android/app/src/main/assets/www"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$APP/dist/public/." "$DEST/"
python3 - <<'PY'
from pathlib import Path
p=Path('android/app/src/main/assets/www/index.html')
s=p.read_text()
s=s.replace('href="/favicon.svg"','href="/app/favicon.svg"')
s=s.replace('href="/manifest.webmanifest"','href="/app/manifest.webmanifest"')
p.write_text(s)
PY
# The native app serves the entire bundled website at /app/.
echo "Native web assets refreshed."
