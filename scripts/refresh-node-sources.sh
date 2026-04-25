#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 /path/to/midori-desktop/package-lock.json [output-file]" >&2
  exit 2
fi

LOCKFILE="$(realpath "$1")"
PACKAGE_JSON="$(dirname "$LOCKFILE")/package.json"
OUTPUT_FILE="${2:-generated-sources.json}"

if [ ! -f "$LOCKFILE" ]; then
  echo "Lockfile not found: $LOCKFILE" >&2
  exit 1
fi

if [ ! -f "$PACKAGE_JSON" ]; then
  echo "package.json not found next to lockfile: $PACKAGE_JSON" >&2
  exit 1
fi

if ! command -v flatpak-node-generator >/dev/null 2>&1; then
  echo "flatpak-node-generator is required. Install it before running this script." >&2
  exit 1
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

cp "$LOCKFILE" "$tmpdir/package-lock.json"
cp "$PACKAGE_JSON" "$tmpdir/package.json"

node - "$tmpdir/package-lock.json" <<'NODE'
const fs = require('node:fs');
const lockPath = process.argv[2];
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
delete lock.packages['node_modules/is-apple-silicon'];
fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
NODE

flatpak-node-generator npm "$tmpdir/package-lock.json" -o "$OUTPUT_FILE"
