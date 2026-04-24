#!/bin/bash
# Download Tor Expert Bundle for embedding in Midori Browser.
#
# This script is called automatically during packaging (npm run package:*)
# and places Tor binaries into the correct obj-*/dist/bin/tor/ directory
# so that `mach package` includes them in the final distributable.
#
# Usage:
#   bash scripts/download-tor.sh [platform] [arch]
#
# Platforms: linux, windows, macos  (auto-detected from env vars or uname)
# Architectures: x86_64, aarch64   (auto-detected from env vars or uname)
#
# Environment variables (set automatically by npm run package:*):
#   AMELIA_PLATFORM  — win32, darwin, linux
#   AMELIA_COMPAT    — x86_64, aarch64
#
# Files installed into <obj-dir>/dist/bin/tor/:
#   - tor (or tor.exe on Windows)
#   - lib*.so* / lib*.dylib (shared libraries, Linux/macOS)
#   - pluggable_transports/ (lyrebird, etc.)
#   - geoip, geoip6 (GeoIP databases)

set -euo pipefail

TOR_VERSION="15.0.7"
BASE_URL="https://archive.torproject.org/tor-package-archive/torbrowser/${TOR_VERSION}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENGINE_DIR="$PROJECT_DIR/engine"

stage_tor_placeholder() {
  local output_dir="$1"
  local reason="${2:-Tor Expert Bundle is not available for ${PLATFORM}-${ARCH}.}"

  mkdir -p "$output_dir"
  find "$output_dir" -mindepth 1 -maxdepth 1 -exec rm -rf {} +

  cat > "$output_dir/tor-unavailable.txt" <<EOF
$reason
Midori packages for this target ship without embedded Tor runtime files.
This marker keeps the package manifest valid and prevents stale Tor artifacts.
EOF
}

resolve_obj_dir() {
  local candidates=()
  local pattern
  local match

  case "$PLATFORM" in
    linux)
      candidates=(
        "$ENGINE_DIR/obj-${ARCH}-unknown-linux-gnu"
        "$ENGINE_DIR/obj-${ARCH}-pc-linux-gnu"
      )
      ;;
    windows | win32)
      candidates=(
        "$ENGINE_DIR/obj-${ARCH}-pc-windows-msvc"
      )
      ;;
    macos | darwin)
      candidates=(
        "$ENGINE_DIR/obj-${ARCH}-apple-darwin"
      )
      ;;
    *)
      return 1
      ;;
  esac

  for match in "${candidates[@]}"; do
    if [ -d "$match" ]; then
      printf '%s\n' "$match"
      return 0
    fi
  done

  case "$PLATFORM" in
    linux) pattern="$ENGINE_DIR/obj-${ARCH}-*-linux-gnu" ;;
    windows | win32) pattern="$ENGINE_DIR/obj-${ARCH}-*-windows-msvc" ;;
    macos | darwin) pattern="$ENGINE_DIR/obj-${ARCH}-*-darwin" ;;
  esac

  for match in $pattern; do
    if [ -d "$match" ]; then
      printf '%s\n' "$match"
      return 0
    fi
  done

  return 1
}

# ── Auto-detect platform ──
if [ -n "${1:-}" ]; then
  PLATFORM="$1"
elif [ -n "${AMELIA_PLATFORM:-}" ]; then
  case "$AMELIA_PLATFORM" in
    win32) PLATFORM="windows" ;;
    darwin) PLATFORM="macos" ;;
    linux) PLATFORM="linux" ;;
    *) PLATFORM="$AMELIA_PLATFORM" ;;
  esac
else
  case "$(uname -s)" in
    Linux*) PLATFORM="linux" ;;
    Darwin*) PLATFORM="macos" ;;
    MINGW* | MSYS* | CYGWIN*) PLATFORM="windows" ;;
    *)
      echo "ERROR: Cannot auto-detect platform. Pass it as argument."
      exit 1
      ;;
  esac
fi

# ── Auto-detect architecture ──
if [ -n "${2:-}" ]; then
  ARCH="$2"
elif [ -n "${AMELIA_COMPAT:-}" ]; then
  ARCH="$AMELIA_COMPAT"
else
  case "$(uname -m)" in
    x86_64 | amd64) ARCH="x86_64" ;;
    aarch64 | arm64) ARCH="aarch64" ;;
    *)
      echo "ERROR: Cannot auto-detect arch. Pass it as argument."
      exit 1
      ;;
  esac
fi

# ── Check availability early ──
# Tor Expert Bundle is NOT available for every platform+arch combination.
# Available: linux-x86_64, linux-i686, macos-x86_64,
#            windows-x86_64, windows-i686
# NOT available: any aarch64 target (linux, windows, macOS)
TOR_AVAILABLE=true

case "$PLATFORM" in
  linux)
    case "$ARCH" in
      x86_64) ARCHIVE="tor-expert-bundle-linux-x86_64-${TOR_VERSION}.tar.gz" ;;
      i686) ARCHIVE="tor-expert-bundle-linux-i686-${TOR_VERSION}.tar.gz" ;;
      aarch64) TOR_AVAILABLE=false ;;
      *)
        echo "ERROR: Unsupported arch '$ARCH' for Linux"
        exit 1
        ;;
    esac
    ;;
  windows | win32)
    case "$ARCH" in
      x86_64) ARCHIVE="tor-expert-bundle-windows-x86_64-${TOR_VERSION}.tar.gz" ;;
      i686) ARCHIVE="tor-expert-bundle-windows-i686-${TOR_VERSION}.tar.gz" ;;
      aarch64) TOR_AVAILABLE=false ;;
      *)
        echo "ERROR: Unsupported arch '$ARCH' for Windows"
        exit 1
        ;;
    esac
    ;;
  macos | darwin)
    case "$ARCH" in
      x86_64) ARCHIVE="tor-expert-bundle-macos-x86_64-${TOR_VERSION}.tar.gz" ;;
      aarch64) TOR_AVAILABLE=false ;;
      *)
        echo "ERROR: Unsupported arch '$ARCH' for macOS"
        exit 1
        ;;
    esac
    ;;
  *)
    echo "ERROR: Unknown platform '$PLATFORM'"
    echo "Usage: $0 [linux|windows|macos] [x86_64|aarch64]"
    exit 1
    ;;
esac

# ── Find obj-* directory (platform-aware for cross-compilation) ──
if ! OBJ_DIR="$(resolve_obj_dir)"; then
  case "$PLATFORM" in
    linux) OBJ_SUFFIX_HINT="${ARCH}-unknown-linux-gnu or ${ARCH}-pc-linux-gnu" ;;
    windows | win32) OBJ_SUFFIX_HINT="${ARCH}-pc-windows-msvc" ;;
    macos | darwin) OBJ_SUFFIX_HINT="${ARCH}-apple-darwin" ;;
  esac

  echo "ERROR: Target objdir not found under $ENGINE_DIR"
  echo "Run the target build first so Tor is copied into the correct package tree."
  echo "Expected target: platform=$PLATFORM arch=$ARCH"
  echo "Expected objdir pattern: obj-$OBJ_SUFFIX_HINT"
  exit 1
fi

OUTPUT_DIR="$OBJ_DIR/dist/bin/tor"

if [ "${MIDORI_FLATPAK:-}" = "1" ]; then
  echo "=== Flatpak build: omitting embedded Tor runtime for ${PLATFORM}-${ARCH}. ==="
  stage_tor_placeholder "$OUTPUT_DIR" \
    "Flatpak builds do not bundle the Tor Expert Bundle runtime."
  exit 0
fi

# If Tor is not available for this platform+arch, stage a clean placeholder tree
# so package-manifest.in can still include bin/tor/* without failing.
# Tor is only available for x86 architectures.
if [ "$TOR_AVAILABLE" = false ]; then
  echo "=== Tor Expert Bundle is not available for ${PLATFORM}-${ARCH}. Skipping. ==="
  echo "The package will be built without Tor integration for this architecture."
  echo "Preparing placeholder Tor staging directory at $OUTPUT_DIR"
  stage_tor_placeholder "$OUTPUT_DIR"
  exit 0
fi

# ── Skip if already downloaded ──
if [ -f "$OUTPUT_DIR/tor" ] || [ -f "$OUTPUT_DIR/tor.exe" ]; then
  echo "=== Tor $TOR_VERSION already present in $OUTPUT_DIR, skipping download ==="
  exit 0
fi

echo "=== Midori Tor Binary Downloader ==="
echo "Platform: $PLATFORM"
echo "Arch:     $ARCH"
echo "Version:  $TOR_VERSION"
echo "Obj dir:  $OBJ_DIR"
echo "Output:   $OUTPUT_DIR"
echo ""

DOWNLOAD_URL="${BASE_URL}/${ARCHIVE}"
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo "[1/4] Downloading $ARCHIVE..."
if command -v wget &> /dev/null; then
  wget -q --show-progress -O "$TEMP_DIR/$ARCHIVE" "$DOWNLOAD_URL"
elif command -v curl &> /dev/null; then
  curl -L --progress-bar -o "$TEMP_DIR/$ARCHIVE" "$DOWNLOAD_URL"
else
  echo "ERROR: Neither wget nor curl found. Install one of them."
  exit 1
fi

echo "[2/4] Verifying download..."
if [ ! -s "$TEMP_DIR/$ARCHIVE" ]; then
  echo "ERROR: Downloaded file is empty or missing."
  exit 1
fi

echo "[3/4] Extracting..."
mkdir -p "$TEMP_DIR/extracted"
tar -xzf "$TEMP_DIR/$ARCHIVE" -C "$TEMP_DIR/extracted"

echo "[4/4] Installing to $OUTPUT_DIR..."
mkdir -p "$OUTPUT_DIR"

# The expert bundle extracts to:
#   tor/tor (binary), tor/lib*.so* (shared libs), tor/pluggable_transports/
#   data/geoip, data/geoip6, data/torrc-defaults

# Copy tor binary and shared libraries
if [ -d "$TEMP_DIR/extracted/tor" ]; then
  # Copy tor binary
  for f in "$TEMP_DIR/extracted/tor/tor" "$TEMP_DIR/extracted/tor/tor.exe"; do
    [ -f "$f" ] && cp -v "$f" "$OUTPUT_DIR/"
  done
  # Copy shared libraries (Linux: .so, macOS: .dylib, Windows: .dll)
  for f in "$TEMP_DIR/extracted/tor/"lib*.so* "$TEMP_DIR/extracted/tor/"lib*.dylib* "$TEMP_DIR/extracted/tor/"*.dll; do
    [ -f "$f" ] && cp -v "$f" "$OUTPUT_DIR/"
  done
  # Copy pluggable transports (lyrebird, conjure-client, etc.)
  if [ -d "$TEMP_DIR/extracted/tor/pluggable_transports" ]; then
    mkdir -p "$OUTPUT_DIR/pluggable_transports"
    find "$TEMP_DIR/extracted/tor/pluggable_transports" -type f | while read -r pt; do
      cp -v "$pt" "$OUTPUT_DIR/pluggable_transports/"
    done
  fi
fi

# Copy GeoIP databases and torrc-defaults
if [ -d "$TEMP_DIR/extracted/data" ]; then
  for f in "$TEMP_DIR/extracted/data/"*; do
    [ -f "$f" ] && cp -v "$f" "$OUTPUT_DIR/"
  done
fi

# Make binaries executable
chmod +x "$OUTPUT_DIR/tor" 2> /dev/null || true
chmod +x "$OUTPUT_DIR/tor.exe" 2> /dev/null || true
chmod +x "$OUTPUT_DIR/pluggable_transports/"* 2> /dev/null || true

echo ""
echo "=== Tor $TOR_VERSION binaries installed ==="
ls -la "$OUTPUT_DIR/"

if [ ! -f "$OUTPUT_DIR/tor" ] && [ ! -f "$OUTPUT_DIR/tor.exe" ]; then
  echo "ERROR: Tor binary was not installed into $OUTPUT_DIR"
  exit 1
fi

if [ ! -f "$OUTPUT_DIR/geoip" ] || [ ! -f "$OUTPUT_DIR/geoip6" ]; then
  echo "ERROR: Tor GeoIP files are missing in $OUTPUT_DIR"
  exit 1
fi

echo ""
echo "Done! Tor ready for packaging."
