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

# ── Find obj-* directory (platform-aware for cross-compilation) ──
# Determine the expected obj-* suffix for the target platform
case "$PLATFORM" in
  linux) OBJ_SUFFIX="${ARCH}-pc-linux-gnu" ;;
  windows) OBJ_SUFFIX="${ARCH}-pc-windows-msvc" ;;
  macos) OBJ_SUFFIX="${ARCH}-apple-darwin" ;;
esac

OBJ_DIR="$ENGINE_DIR/obj-${OBJ_SUFFIX}"

# If the platform-specific obj dir doesn't exist, try to find any obj-* dir
if [ ! -d "$OBJ_DIR" ]; then
  for d in "$ENGINE_DIR"/obj-*; do
    if [ -d "$d" ]; then
      OBJ_DIR="$d"
      break
    fi
  done
fi

OUTPUT_DIR="$OBJ_DIR/dist/bin/tor"

# ── Skip if already downloaded or placeholder exists ──
if [ -f "$OUTPUT_DIR/tor" ] || [ -f "$OUTPUT_DIR/tor.exe" ]; then
  echo "=== Tor $TOR_VERSION already present in $OUTPUT_DIR, skipping download ==="
  exit 0
fi
if [ -f "$OUTPUT_DIR/NO_TOR_AVAILABLE.txt" ]; then
  echo "=== Tor placeholder already present (arch not supported), skipping ==="
  exit 0
fi

echo "=== Midori Tor Binary Downloader ==="
echo "Platform: $PLATFORM"
echo "Arch:     $ARCH"
echo "Version:  $TOR_VERSION"
echo "Obj dir:  $OBJ_DIR"
echo "Output:   $OUTPUT_DIR"
echo ""

# ── Check availability and determine archive filename ──
# Tor Expert Bundle is NOT available for every platform+arch combination.
# Available: linux-x86_64, linux-i686, macos-x86_64, macos-aarch64,
#            windows-x86_64, windows-i686
# NOT available: linux-aarch64, windows-aarch64
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
      aarch64) ARCHIVE="tor-expert-bundle-macos-aarch64-${TOR_VERSION}.tar.gz" ;;
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

# If Tor is not available for this platform+arch, create a placeholder
# so that package-manifest.in's bin/tor/* glob does not fail.
if [ "$TOR_AVAILABLE" = false ]; then
  echo "=== WARNING: Tor Expert Bundle is not available for ${PLATFORM}-${ARCH} ==="
  echo "Creating placeholder in $OUTPUT_DIR so packaging does not fail."
  echo "Tor features will be disabled at runtime on this architecture."
  mkdir -p "$OUTPUT_DIR"
  echo "Tor Expert Bundle not available for ${PLATFORM}-${ARCH}" > "$OUTPUT_DIR/NO_TOR_AVAILABLE.txt"
  exit 0
fi

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
echo ""
echo "Done! Tor ready for packaging."
