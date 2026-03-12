#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#
# Generates the Windows NSIS installer (.installer.exe) and stub installer
# after `mach package` has been run. This is needed because `mach package`
# only generates the .zip and setup.exe, but not the combined installer.
#
# Usage: bash scripts/win-installer.sh [x86_64|aarch64]

set -euo pipefail

ARCH="${1:-x86_64}"
ENGINE_DIR="$(cd "$(dirname "$0")/../engine" && pwd)"
MOZBUILD="${HOME}/.mozbuild"

if [[ "$ARCH" == "aarch64" ]]; then
  OBJ_DIR="$ENGINE_DIR/obj-aarch64-pc-windows-msvc"
  SFX_STUB="$ENGINE_DIR/other-licenses/7zstub/firefox/7zSD.ARM64.sfx"
  PKG_SUFFIX="win64-aarch64"
else
  OBJ_DIR="$ENGINE_DIR/obj-x86_64-pc-windows-msvc"
  SFX_STUB="$ENGINE_DIR/other-licenses/7zstub/firefox/7zSD.Win32.sfx"
  PKG_SUFFIX="win64"
fi

DIST_DIR="$OBJ_DIR/dist"
INSTGEN_DIR="$OBJ_DIR/browser/installer/windows/instgen"
MACH="$ENGINE_DIR/mach"

# Ensure wine/NSIS env is set
export PATH="$MOZBUILD/nsis/bin:$MOZBUILD/wine/bin:$PATH"
export WINEPREFIX="$MOZBUILD/wineprefix"
export WINEDEBUG=-all

# ── 1. Find the package zip ──
ZIP_FILE=$(find "$DIST_DIR" -maxdepth 1 -name "*.${PKG_SUFFIX}.zip" ! -name "*xpt*" | head -1)
if [[ -z "$ZIP_FILE" ]]; then
  echo "✘ Error: No se encontró el paquete .zip en $DIST_DIR"
  echo "  Ejecuta primero: npm run package:win-${ARCH/x86_64/x64}"
  exit 1
fi
echo "→ Paquete encontrado: $(basename "$ZIP_FILE")"

# Get the package name (directory name inside the zip)
PKG_NAME=$(python3 -c "
import zipfile, sys
with zipfile.ZipFile('$ZIP_FILE') as z:
    top = set(n.split('/')[0] for n in z.namelist() if '/' in n)
    print(top.pop() if len(top) == 1 else 'midori')
" 2>/dev/null || echo "midori")
echo "  Nombre del paquete: $PKG_NAME"

# ── 2. Generate uninstaller (helper.exe) if missing ──
if [[ ! -f "$DIST_DIR/bin/uninstall/helper.exe" ]]; then
  echo "→ Generando desinstalador (helper.exe)..."
  gmake -C "$OBJ_DIR/browser/installer/windows" uninstaller 2>&1 | tail -5
fi

# ── 3. Generate setup.exe if missing ──
if [[ ! -f "$INSTGEN_DIR/setup.exe" ]]; then
  echo "→ Generando setup.exe (NSIS)..."
  gmake -C "$OBJ_DIR/browser/installer/windows" "$INSTGEN_DIR/setup.exe" 2>&1 | tail -10
fi

# ── 4. Get version from the zip filename ──
VERSION=$(echo "$(basename "$ZIP_FILE")" | sed -E 's/^[^-]+-([0-9]+\.[0-9]+\.[0-9]+)\..*/\1/')
echo "  Versión: $VERSION"

# ── 5. Build the full installer (.installer.exe) ──
INSTALLER_OUT="$DIST_DIR/${PKG_NAME}-${VERSION}.${PKG_SUFFIX}.installer.exe"
echo "→ Generando instalador completo..."
export AMELIA_PLATFORM=win32
export AMELIA_COMPAT="$ARCH"
export SURFER_COMPAT="$ARCH"
export MIDORI_CROSS_COMPILING=true

cd "$ENGINE_DIR"
"$MACH" repackage installer \
  -o "$INSTALLER_OUT" \
  --package-name "$PKG_NAME" \
  --package "$ZIP_FILE" \
  --tag "$ENGINE_DIR/browser/installer/windows/app.tag" \
  --setupexe "$INSTGEN_DIR/setup.exe" \
  --sfx-stub "$SFX_STUB"

if [[ -f "$INSTALLER_OUT" ]]; then
  echo "✔ Instalador generado: $(basename "$INSTALLER_OUT") ($(du -h "$INSTALLER_OUT" | cut -f1))"
else
  echo "✘ Error: No se generó el instalador."
  exit 1
fi

# ── 6. Build the stub installer (.installer-stub.exe) ──
if [[ -f "$INSTGEN_DIR/setup-stub.exe" ]]; then
  STUB_OUT="$DIST_DIR/${PKG_NAME}-${VERSION}.en-US.${PKG_SUFFIX}.installer-stub.exe"
  echo "→ Generando instalador stub (desde internet)..."
  cd "$ENGINE_DIR"
  "$MACH" repackage installer \
    -o "$STUB_OUT" \
    --tag "$ENGINE_DIR/browser/installer/windows/stub.tag" \
    --setupexe "$INSTGEN_DIR/setup-stub.exe" \
    --sfx-stub "$SFX_STUB"

  if [[ -f "$STUB_OUT" ]]; then
    echo "✔ Stub installer generado: $(basename "$STUB_OUT") ($(du -h "$STUB_OUT" | cut -f1))"
  fi
fi

# ── 7. Copy to project dist/ ──
PROJECT_DIST="$(cd "$ENGINE_DIR/.." && pwd)/dist"
mkdir -p "$PROJECT_DIST"

cp "$INSTALLER_OUT" "$PROJECT_DIST/${PKG_NAME}.installer.exe"
echo "✔ Copiado a dist/${PKG_NAME}.installer.exe"

if [[ -f "${STUB_OUT:-}" ]]; then
  cp "$STUB_OUT" "$PROJECT_DIST/${PKG_NAME}.installer.pretty.exe"
  echo "✔ Copiado a dist/${PKG_NAME}.installer.pretty.exe"
  echo "  ⚠ El stub installer requiere que los binarios estén disponibles desde internet."
fi

echo ""
echo "══════════════════════════════════════════"
echo " Instaladores Windows generados"
echo "══════════════════════════════════════════"
ls -lh "$PROJECT_DIST"/*.exe 2>/dev/null || echo "  (ninguno)"
echo ""
