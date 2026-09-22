#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/artifacts/viva-study"
PUBLIC="$APP/dist/public"
UPDATE="$PUBLIC/app-update"
VERSION="${APP_UPDATE_VERSION:-1.0.1}"
rm -rf "$UPDATE"
mkdir -p "$UPDATE"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
# Copy only the web app. Exclude the update directory to avoid recursive bundles.
cp -R "$PUBLIC/." "$TMP/"
rm -rf "$TMP/app-update"
(
  cd "$TMP"
  zip -qr "$UPDATE/web.zip" .
)
cat > "$UPDATE/version.json" <<JSON
{
  "version": "$VERSION",
  "zipUrl": "/app-update/web.zip"
}
JSON
echo "Generated Android web update bundle: version $VERSION"
