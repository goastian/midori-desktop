#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Midori Browser"
APP_ID="org.astian.midori_browser"
APP_BINARY="midori"
APPDIR_BASE="$ROOT_DIR/build/appimage"
OUTPUT_DIR="$ROOT_DIR/dist/appimage"
BRAND_DIR="$ROOT_DIR/configs/branding/release"
RUNTIME_FILE="${APPIMAGE_RUNTIME_FILE:-}"
SKIP_BUILD=0
RUN_TEST=1
ARCH="${AMELIA_COMPAT:-$(uname -m)}"

usage() {
  cat <<'USAGE'
Usage: bash scripts/generate-appimage.sh [options]

Options:
  --arch x86_64|aarch64   Target architecture. Defaults to AMELIA_COMPAT or host arch.
  --skip-build            Reuse an existing engine/obj-*/dist/midori directory.
  --no-test               Generate the AppImage without executing the smoke test.
  --output-dir DIR        Directory where the AppImage will be written.
  -h, --help              Show this help.

By default this script builds, packages, stages an AppDir, generates an
AppImage, and runs a smoke test. User profiles are kept outside the AppImage:
AppRun sets MOZ_LEGACY_PROFILES=1 so replacing the AppImage does not create a
new per-installation profile.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --arch)
      ARCH="${2:?Missing value for --arch}"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --no-test)
      RUN_TEST=0
      shift
      ;;
    --output-dir)
      OUTPUT_DIR="${2:?Missing value for --output-dir}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$ARCH" in
  x86_64|amd64)
    ARCH="x86_64"
    NPM_BUILD="build:linux-x64"
    NPM_PACKAGE="package:linux-x64"
    OBJ_DIR="$ROOT_DIR/engine/obj-x86_64-pc-linux-gnu"
    PACKAGE_GLOB="midori-*.linux-x86_64.tar.xz"
    ;;
  aarch64|arm64)
    ARCH="aarch64"
    NPM_BUILD="build:linux-arm64"
    NPM_PACKAGE="package:linux-arm64"
    OBJ_DIR="$ROOT_DIR/engine/obj-aarch64-unknown-linux-gnu"
    PACKAGE_GLOB="midori-*.linux-aarch64.tar.xz"
    ;;
  *)
    echo "Unsupported AppImage architecture: $ARCH" >&2
    exit 2
    ;;
esac

DIST_DIR="$OBJ_DIR/dist"
SOURCE_DIR="$DIST_DIR/midori"
APPDIR="$APPDIR_BASE/Midori-${ARCH}.AppDir"

version_from_amelia() {
  node -e "const c=require('./amelia.json'); console.log(c.brands.release.release.displayVersion || c.version.version)"
}

copy_icon() {
  local size="$1"
  local src="$BRAND_DIR/logo${size}.png"
  if [[ "$size" == "1024" ]]; then
    src="$BRAND_DIR/logo1024.png"
  fi
  [[ -f "$src" ]] || return 0
  install -Dm0644 "$src" "$APPDIR/usr/share/icons/hicolor/${size}x${size}/apps/${APP_ID}.png"
  install -Dm0644 "$src" "$APPDIR/usr/share/icons/hicolor/${size}x${size}/apps/midori.png"
}

require_tool() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required tool not found: $1" >&2
    echo "Install it first and re-run this script." >&2
    exit 1
  fi
}

cd "$ROOT_DIR"
require_tool node
require_tool appimagetool

VERSION="$(version_from_amelia)"
OUTPUT_NAME="Midori-${VERSION}-${ARCH}.AppImage"
OUTPUT_PATH="$OUTPUT_DIR/$OUTPUT_NAME"
if [[ -z "$RUNTIME_FILE" ]]; then
  RUNTIME_FILE="$APPDIR_BASE/runtime-${ARCH}"
fi

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  npm run "$NPM_BUILD"
  npm run "$NPM_PACKAGE"
fi

if [[ ! -x "$SOURCE_DIR/$APP_BINARY" ]]; then
  PACKAGE_PATH="$(find "$DIST_DIR" -maxdepth 1 -type f -name "$PACKAGE_GLOB" | sort | tail -n 1 || true)"
  if [[ -z "$PACKAGE_PATH" ]]; then
    echo "Could not find a packaged Midori directory or tarball in $DIST_DIR" >&2
    echo "Run npm run $NPM_PACKAGE first, or omit --skip-build." >&2
    exit 1
  fi
  mkdir -p "$SOURCE_DIR"
  tar -xJf "$PACKAGE_PATH" -C "$DIST_DIR"
fi

if [[ ! -x "$SOURCE_DIR/$APP_BINARY" ]]; then
  echo "Midori binary not found at $SOURCE_DIR/$APP_BINARY" >&2
  exit 1
fi

rm -rf "$APPDIR"
mkdir -p "$APPDIR" "$APPDIR/usr/bin" "$APPDIR/usr/share/applications" \
  "$APPDIR/usr/share/metainfo" "$OUTPUT_DIR"

cp -a "$SOURCE_DIR"/. "$APPDIR/"

cat > "$APPDIR/AppRun" <<'APPRUN'
#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"

export PATH="${HERE}:${PATH}"
export LD_LIBRARY_PATH="${HERE}:${HERE}/usr/lib:${LD_LIBRARY_PATH:-}"

# Keep profiles stable across AppImage updates. Without this, Mozilla apps can
# bind a profile to the installation path, which changes when the AppImage file
# name changes.
export MOZ_LEGACY_PROFILES=1
export MOZ_APP_LAUNCHER="${APPIMAGE:-$0}"

exec "${HERE}/midori" "$@"
APPRUN
chmod 0755 "$APPDIR/AppRun"

cat > "$APPDIR/${APP_ID}.desktop" <<DESKTOP
[Desktop Entry]
Name=${APP_NAME}
Comment=A privacy-focused browser by Astian
Exec=midori %u
Icon=${APP_ID}
Type=Application
MimeType=text/html;text/xml;application/xhtml+xml;x-scheme-handler/http;x-scheme-handler/https;application/x-xpinstall;application/pdf;application/json;
StartupWMClass=midori
Categories=Network;WebBrowser;
StartupNotify=true
Terminal=false
X-MultipleArgs=false
Keywords=Internet;WWW;Browser;Web;Explorer;
X-AppImage-Name=Midori Browser
X-AppImage-Version=${VERSION}
Actions=new-window;new-private-window;profilemanager;

[Desktop Action new-window]
Name=Open a New Window
Exec=midori %u

[Desktop Action new-private-window]
Name=Open a New Private Window
Exec=midori --private-window %u

[Desktop Action profilemanager]
Name=Open the Profile Manager
Exec=midori --ProfileManager %u
DESKTOP

install -Dm0644 "$APPDIR/${APP_ID}.desktop" "$APPDIR/midori.desktop"
install -Dm0644 "$APPDIR/${APP_ID}.desktop" "$APPDIR/usr/share/applications/${APP_ID}.desktop"
install -Dm0644 "$APPDIR/${APP_ID}.desktop" "$APPDIR/usr/share/applications/midori.desktop"

for size in 16 22 24 32 48 64 128 256 512 1024; do
  copy_icon "$size"
done
install -Dm0644 "$BRAND_DIR/logo.png" "$APPDIR/${APP_ID}.png"
install -Dm0644 "$BRAND_DIR/logo.png" "$APPDIR/midori.png"
ln -sfn "${APP_ID}.png" "$APPDIR/.DirIcon"

if [[ -f "$ROOT_DIR/build/AppDir/distribution/policies.json" ]]; then
  install -Dm0644 "$ROOT_DIR/build/AppDir/distribution/policies.json" \
    "$APPDIR/distribution/policies.json"
fi

if [[ -f "$ROOT_DIR/build/flatpak/${APP_ID}.metainfo.xml" ]]; then
  install -Dm0644 "$ROOT_DIR/build/flatpak/${APP_ID}.metainfo.xml" \
    "$APPDIR/usr/share/metainfo/${APP_ID}.appdata.xml"
fi

find "$APPDIR" -type f \( -name '*.so' -o -path '*/midori' -o -path '*/midori-bin' -o -path '*/updater' -o -path '*/pingsender' \) \
  -exec chmod u+rwX,go+rX {} +

rm -f "$OUTPUT_PATH"
if [[ ! -f "$RUNTIME_FILE" ]]; then
  require_tool curl
  mkdir -p "$(dirname "$RUNTIME_FILE")"
  RUNTIME_URL="https://github.com/AppImage/type2-runtime/releases/download/continuous/runtime-${ARCH}"
  echo "Downloading AppImage runtime: $RUNTIME_URL"
  curl -fL --retry 3 --connect-timeout 20 -o "$RUNTIME_FILE" "$RUNTIME_URL"
fi
chmod 0755 "$RUNTIME_FILE"

ARCH="$ARCH" appimagetool --no-appstream --runtime-file "$RUNTIME_FILE" "$APPDIR" "$OUTPUT_PATH"
chmod 0755 "$OUTPUT_PATH"

if [[ "$RUN_TEST" -eq 1 ]]; then
  TEST_HOME="$(mktemp -d)"
  trap 'rm -rf "$TEST_HOME"' EXIT
  APPIMAGE_EXTRACT_AND_RUN=1 HOME="$TEST_HOME" "$OUTPUT_PATH" --version
fi

echo "Generated AppImage: $OUTPUT_PATH"
