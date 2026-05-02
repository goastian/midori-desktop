#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

set -euo pipefail

ARCH="${1:-x86_64}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$REPO_ROOT/dist"

case "$ARCH" in
  x86_64)
    PACKAGE_PATTERN="*linux-x64*.tar.xz"
    APPIMAGE_ARCH="x86_64"
    ;;
  aarch64 | arm64)
    echo "Skipping AppImage generation for ${ARCH}; CI only publishes AppImage for x86_64."
    exit 0
    ;;
  *)
    echo "Unsupported architecture: ${ARCH}" >&2
    exit 1
    ;;
esac

PACKAGE_ARCHIVE="$(find "$DIST_DIR" -maxdepth 1 -type f -name "$PACKAGE_PATTERN" | sort | head -n 1)"
if [[ -z "$PACKAGE_ARCHIVE" ]]; then
  echo "No Linux archive matching ${PACKAGE_PATTERN} was found in ${DIST_DIR}" >&2
  exit 1
fi

VERSION="${MIDORI_RELEASE_VERSION:-}"
if [[ -z "$VERSION" ]]; then
  VERSION="$(python3 - "$PACKAGE_ARCHIVE" <<'PY'
import re
import sys
name = sys.argv[1].split('/')[-1]
match = re.match(r'^[^-]+-([0-9]+(?:\.[0-9A-Za-z]+)*)', name)
if not match:
    raise SystemExit(1)
print(match.group(1))
PY
)"
fi
if [[ -z "$VERSION" ]]; then
  echo "Unable to derive version from $(basename "$PACKAGE_ARCHIVE")" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

APPDIR="$TMP_DIR/AppDir"
mkdir -p "$APPDIR"
cp -R "$REPO_ROOT/build/AppDir/." "$APPDIR/"
chmod +x "$APPDIR/AppRun"

tar -xJf "$PACKAGE_ARCHIVE" -C "$APPDIR" --strip-components=1

install -Dm0644 "$REPO_ROOT/build/AppDir/midori.desktop" "$APPDIR/midori.desktop"
install -Dm0644 "$REPO_ROOT/configs/branding/release/logo512.png" "$APPDIR/midori.png"

APPIMAGETOOL_PATH="${APPIMAGETOOL_PATH:-$TMP_DIR/appimagetool.AppImage}"
if [[ ! -f "$APPIMAGETOOL_PATH" ]]; then
  curl -fsSL \
    "https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage" \
    -o "$APPIMAGETOOL_PATH"
  chmod +x "$APPIMAGETOOL_PATH"
fi

OUTPUT_FILE="$DIST_DIR/midori-${VERSION}-linux-${APPIMAGE_ARCH}.AppImage"
ARCH="$APPIMAGE_ARCH" "$APPIMAGETOOL_PATH" --appimage-extract-and-run "$APPDIR" "$OUTPUT_FILE"
chmod +x "$OUTPUT_FILE"

echo "Generated AppImage: $OUTPUT_FILE"
