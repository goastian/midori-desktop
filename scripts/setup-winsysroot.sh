#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#
# Unified cross-compilation setup for Midori Browser.
# Prepares the build environment for the specified target platform.
#
# Usage:
#   bash scripts/setup-winsysroot.sh windows [--force]
#   bash scripts/setup-winsysroot.sh linux-arm64 [--force]
#   bash scripts/setup-winsysroot.sh all [--force]
#   bash scripts/setup-winsysroot.sh              # (legacy: windows only)
#
# The toolchains are placed in ~/.mozbuild/ and reused across builds.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENGINE_DIR="$REPO_ROOT/engine"
MOZBUILD="$HOME/.mozbuild"
WINSYSROOT="$MOZBUILD/vs"
VS_YAML="build/vs/vs2022.yaml"

# ── Parse arguments ──
TARGET="${1:-windows}"
FORCE=0
for arg in "$@"; do
  [[ "$arg" == "--force" ]] && FORCE=1
done

# ── Helpers ──
ensure_rustup() {
  if ! command -v rustup &> /dev/null; then
    echo "  ✘ rustup no encontrado. Instala Rust primero:"
    echo "    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
  fi
}

ensure_rust_target() {
  local target="$1"
  local installed
  installed=$(rustup target list --installed 2> /dev/null)
  if ! echo "$installed" | grep -q "$target"; then
    echo "  Instalando Rust target: $target"
    rustup target add "$target"
  else
    echo "  ✔ Rust target $target"
  fi
}

ensure_engine() {
  if [[ ! -d "$ENGINE_DIR" ]]; then
    echo "✘ Error: No se encontró el directorio engine/."
    echo "  Ejecuta primero: npm run download && npm run import"
    exit 1
  fi
}

check_system_deps() {
  local missing=()
  for dep in "$@"; do
    if ! command -v "$dep" &> /dev/null; then
      # Check via package manager
      if command -v rpm &> /dev/null; then
        rpm -q "$dep" &> /dev/null 2>&1 || missing+=("$dep")
      elif command -v dpkg &> /dev/null; then
        dpkg -s "$dep" &> /dev/null 2>&1 || missing+=("$dep")
      else
        missing+=("$dep")
      fi
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "  ⚠ Faltan paquetes: ${missing[*]}"
    if command -v zypper &> /dev/null; then
      echo "    sudo zypper install ${missing[*]}"
    elif command -v apt-get &> /dev/null; then
      echo "    sudo apt-get install -y ${missing[*]}"
    elif command -v dnf &> /dev/null; then
      echo "    sudo dnf install ${missing[*]}"
    fi
    return 1
  fi
  echo "  ✔ Dependencias del sistema OK"
  return 0
}

# ═══════════════════════════════════════════════════════════════
# Windows cross-compilation setup
# ═══════════════════════════════════════════════════════════════
setup_windows() {
  echo ""
  echo "══════════════════════════════════════════"
  echo " Windows cross-compilation (desde Linux)"
  echo "══════════════════════════════════════════"
  echo ""

  ensure_rustup
  echo "→ Rust targets:"
  ensure_rust_target "x86_64-pc-windows-msvc"
  ensure_rust_target "aarch64-pc-windows-msvc"
  echo ""

  echo "→ Dependencias del sistema:"
  check_system_deps msitools dos2unix wine || true
  echo ""

  ensure_engine

  # ── 3. Windows sysroot (MSVC + Windows SDK) ──
  if [[ -d "$WINSYSROOT/VC" && -d "$WINSYSROOT/Windows Kits" && "$FORCE" -eq 0 ]]; then
    echo "✔ Windows sysroot ya existe en $WINSYSROOT"
  else
    if [[ ! -f "$ENGINE_DIR/$VS_YAML" ]]; then
      echo "✘ Error: No se encontró $VS_YAML en engine/."
      exit 1
    fi

    echo "→ Descargando Windows sysroot (MSVC + Windows SDK)..."
    echo "  Esto puede tardar varios minutos (~2-3 GB)."
    echo ""

    if [[ "$FORCE" -eq 1 && -d "$WINSYSROOT" ]]; then
      echo "→ Eliminando sysroot anterior..."
      rm -rf "$WINSYSROOT"
    fi

    mkdir -p "$WINSYSROOT"

    cd "$ENGINE_DIR"
    "$ENGINE_DIR/mach" python --virtualenv build \
      taskcluster/scripts/misc/get_vs.py \
      "$VS_YAML" \
      "$WINSYSROOT"

    if [[ -d "$WINSYSROOT/VC" && -d "$WINSYSROOT/Windows Kits" ]]; then
      echo ""
      echo "✔ Windows sysroot instalado en $WINSYSROOT"
    else
      echo "✘ Error: La instalación del sysroot parece incompleta."
      exit 1
    fi
  fi
  echo ""

  # ── 4. Windows App SDK (requerido por el build system) ──
  local WINAPPSDK_DIR="$MOZBUILD/winappsdk-x86_64-pc-windows-msvc"
  if [[ -d "$WINAPPSDK_DIR" && "$FORCE" -eq 0 ]]; then
    echo "✔ Windows App SDK ya existe en $WINAPPSDK_DIR"
  else
    echo "→ Descargando Windows App SDK..."
    cd "$MOZBUILD"
    "$ENGINE_DIR/mach" artifact toolchain --from-build win64-WindowsAppSDK 2>&1 || {
      echo "  ⚠ No se pudo descargar el Windows App SDK."
    }
    # mach extracts to cwd; if run from MOZBUILD it lands here directly.
    # If it landed in engine/ instead, move it.
    if [[ -d "$ENGINE_DIR/winappsdk-x86_64-pc-windows-msvc" && ! -d "$WINAPPSDK_DIR" ]]; then
      mv "$ENGINE_DIR/winappsdk-x86_64-pc-windows-msvc" "$WINAPPSDK_DIR"
    fi
    if [[ -d "$WINAPPSDK_DIR" ]]; then
      echo "✔ Windows App SDK instalado"
    else
      echo "✘ Error: No se pudo instalar el Windows App SDK."
      exit 1
    fi
  fi

  # ── 5. DirectX Shader Compiler (para WebGPU) ──
  local DXC_DIR="$MOZBUILD/dxc-x86_64-pc-windows-msvc"
  if [[ -d "$DXC_DIR" && "$FORCE" -eq 0 ]]; then
    echo "✔ DirectX Shader Compiler ya existe en $DXC_DIR"
  else
    echo "→ Descargando DirectX Shader Compiler..."
    cd "$MOZBUILD"
    "$ENGINE_DIR/mach" artifact toolchain --from-build win64-dxc 2>&1 || {
      echo "  ⚠ No se pudo descargar dxc. WebGPU se deshabilitará."
    }
    if [[ -d "$ENGINE_DIR/dxc-x86_64-pc-windows-msvc" && ! -d "$DXC_DIR" ]]; then
      mv "$ENGINE_DIR/dxc-x86_64-pc-windows-msvc" "$DXC_DIR"
    fi
    if [[ -d "$DXC_DIR" ]]; then
      echo "✔ DirectX Shader Compiler instalado"
    fi
  fi

  # ── 6. Windows Rust crate source (windows-rs) ──
  local WINRS_DIR="$MOZBUILD/windows-rs"
  if [[ -d "$WINRS_DIR" && "$FORCE" -eq 0 ]]; then
    echo "✔ Windows Rust crate (windows-rs) ya existe en $WINRS_DIR"
  else
    echo "→ Descargando Windows Rust crate source..."
    cd "$MOZBUILD"
    "$ENGINE_DIR/mach" artifact toolchain --from-build fetch-windows-rs 2>&1 || {
      echo "  ⚠ No se pudo descargar windows-rs."
    }
    if [[ -d "$ENGINE_DIR/windows-rs" && ! -d "$WINRS_DIR" ]]; then
      mv "$ENGINE_DIR/windows-rs" "$WINRS_DIR"
    fi
    if [[ -d "$WINRS_DIR" ]]; then
      echo "✔ Windows Rust crate instalado"
    else
      echo "✘ Error: No se pudo instalar windows-rs."
      exit 1
    fi
  fi

  # ── 7. NSIS (para generar el instalador .exe de Windows) ──
  local NSIS_DIR="$MOZBUILD/nsis"
  if [[ -d "$NSIS_DIR/bin/makensis" && "$FORCE" -eq 0 ]]; then
    echo "✔ NSIS ya existe en $NSIS_DIR"
  else
    echo "→ Descargando NSIS..."
    cd "$MOZBUILD"
    "$ENGINE_DIR/mach" artifact toolchain --from-build nsis 2>&1 || {
      echo "  ⚠ No se pudo descargar NSIS."
    }
    if [[ -d "$ENGINE_DIR/nsis" && ! -d "$NSIS_DIR" ]]; then
      mv "$ENGINE_DIR/nsis" "$NSIS_DIR"
    fi
    if [[ -x "$NSIS_DIR/bin/makensis" ]]; then
      echo "✔ NSIS instalado ($($NSIS_DIR/bin/makensis -version 2> /dev/null))"
    else
      echo "  ⚠ NSIS no disponible. No se podrá generar el instalador .exe."
    fi
  fi

  # ── 8. Windows App SDK (requerido para mica titlebar) ──
  local WINAPPSDK_X64="$MOZBUILD/winappsdk-x86_64-pc-windows-msvc"
  local WINAPPSDK_ARM64="$MOZBUILD/winappsdk-aarch64-pc-windows-msvc"
  if [[ -d "$WINAPPSDK_X64" && "$FORCE" -eq 0 ]]; then
    echo "✔ Windows App SDK (x64) ya existe"
  else
    echo "→ Descargando Windows App SDK (x64)..."
    cd "$MOZBUILD"
    "$ENGINE_DIR/mach" artifact toolchain --from-build winappsdk-x86_64-pc-windows-msvc 2>&1 || {
      echo "  ⚠ No se pudo descargar Windows App SDK (x64)."
    }
    if [[ -d "$ENGINE_DIR/winappsdk-x86_64-pc-windows-msvc" && ! -d "$WINAPPSDK_X64" ]]; then
      mv "$ENGINE_DIR/winappsdk-x86_64-pc-windows-msvc" "$WINAPPSDK_X64"
    fi
    [[ -d "$WINAPPSDK_X64" ]] && echo "✔ Windows App SDK (x64) instalado" || echo "  ⚠ Windows App SDK (x64) no disponible."
  fi
  if [[ -d "$WINAPPSDK_ARM64" && "$FORCE" -eq 0 ]]; then
    echo "✔ Windows App SDK (arm64) ya existe"
  else
    echo "→ Descargando Windows App SDK (arm64)..."
    cd "$MOZBUILD"
    "$ENGINE_DIR/mach" artifact toolchain --from-build winappsdk-aarch64-pc-windows-msvc 2>&1 || {
      echo "  ⚠ No se pudo descargar Windows App SDK (arm64)."
    }
    if [[ -d "$ENGINE_DIR/winappsdk-aarch64-pc-windows-msvc" && ! -d "$WINAPPSDK_ARM64" ]]; then
      mv "$ENGINE_DIR/winappsdk-aarch64-pc-windows-msvc" "$WINAPPSDK_ARM64"
    fi
    [[ -d "$WINAPPSDK_ARM64" ]] && echo "✔ Windows App SDK (arm64) instalado" || echo "  ⚠ Windows App SDK (arm64) no disponible."
  fi

  # ── 9. Mozilla wine (build custom para cross-compilación) ──
  local WINE_DIR="$MOZBUILD/wine"
  if [[ -d "$WINE_DIR/bin/wine" && "$FORCE" -eq 0 ]]; then
    echo "✔ Mozilla wine ya existe en $WINE_DIR"
  else
    echo "→ Descargando Mozilla wine (build custom para cross-compilación)..."
    cd "$MOZBUILD"
    "$ENGINE_DIR/mach" artifact toolchain --from-build linux64-wine 2>&1 || {
      echo "  ⚠ No se pudo descargar Mozilla wine."
      echo "    Asegúrate de tener wine del sistema instalado como alternativa."
    }
    if [[ -d "$ENGINE_DIR/wine" && ! -d "$WINE_DIR" ]]; then
      mv "$ENGINE_DIR/wine" "$WINE_DIR"
    fi
    if [[ -d "$WINE_DIR/bin/wine" ]]; then
      echo "✔ Mozilla wine instalado"
    else
      echo "  ⚠ Mozilla wine no disponible. Se usará wine del sistema."
    fi
  fi

  # ── 10. SELinux: permitir que wine cargue DLLs de Windows ──
  if command -v getenforce &> /dev/null || command -v /usr/sbin/getenforce &> /dev/null; then
    local SELINUX_MODE
    SELINUX_MODE=$(/usr/sbin/getenforce 2> /dev/null || getenforce 2> /dev/null || echo "Disabled")
    if [[ "$SELINUX_MODE" == "Enforcing" || "$SELINUX_MODE" == "Permissive" ]]; then
      echo "→ SELinux detectado ($SELINUX_MODE). Ajustando contexto para wine..."
      if command -v chcon &> /dev/null || command -v /usr/bin/chcon &> /dev/null; then
        sudo chcon -R -t textrel_shlib_t "$WINSYSROOT" 2> /dev/null \
          && echo "✔ Contexto SELinux ajustado en $WINSYSROOT" \
          || echo "  ⚠ No se pudo ajustar SELinux. Si fxc.exe falla, ejecuta:"
        echo "    sudo chcon -R -t textrel_shlib_t $WINSYSROOT"
      fi
    fi
  fi

  # ── 11. Inicializar WINEPREFIX ──
  local WINEPREFIX_DIR="$MOZBUILD/wineprefix"
  local WINE_BIN="${WINE_DIR}/bin/wine"
  if [[ ! -x "$WINE_BIN" ]]; then
    WINE_BIN="$(which wine 2> /dev/null || true)"
  fi
  if [[ -n "$WINE_BIN" && ! -d "$WINEPREFIX_DIR/drive_c" ]]; then
    echo "→ Inicializando WINEPREFIX..."
    WINEPREFIX="$WINEPREFIX_DIR" WINEDEBUG=-all "$WINE_DIR/bin/wineboot" --init 2> /dev/null \
      || WINEPREFIX="$WINEPREFIX_DIR" WINEDEBUG=-all wineboot --init 2> /dev/null || true
    if [[ -d "$WINEPREFIX_DIR/drive_c" ]]; then
      echo "✔ WINEPREFIX inicializado en $WINEPREFIX_DIR"
    fi
  else
    echo "✔ WINEPREFIX ya existe en $WINEPREFIX_DIR"
  fi

  # ── Resumen ──
  echo ""
  echo "══════════════════════════════════════════"
  echo " Setup Windows cross-compilation completo"
  echo "══════════════════════════════════════════"
  echo "  WINSYSROOT:    $WINSYSROOT"
  echo "  Windows SDK:   $(ls "$WINSYSROOT/Windows Kits/10/bin/" 2> /dev/null | head -1)"
  echo "  App SDK:       $MOZBUILD/winappsdk-x86_64-pc-windows-msvc"
  echo "  DXC:           $MOZBUILD/dxc-x86_64-pc-windows-msvc"
  echo "  windows-rs:    $MOZBUILD/windows-rs"
  echo "  NSIS:          $MOZBUILD/nsis/bin/makensis"
  if [[ -x "$WINE_DIR/bin/wine" ]]; then
    echo "  Wine:          $WINE_DIR/bin/wine (Mozilla)"
  else
    echo "  Wine:          $(which wine 2> /dev/null || echo 'NO ENCONTRADO')"
  fi
  echo ""
  echo "Usa: npm run build:win-x64  para compilar."
}

# ═══════════════════════════════════════════════════════════════
# Linux aarch64 cross-compilation setup
# ═══════════════════════════════════════════════════════════════
setup_linux_arm64() {
  echo ""
  echo "══════════════════════════════════════════"
  echo " Linux aarch64 cross-compilation"
  echo "══════════════════════════════════════════"
  echo ""

  ensure_rustup
  echo "→ Rust targets:"
  ensure_rust_target "aarch64-unknown-linux-gnu"
  echo ""

  echo "→ Compilador cross:"
  echo "  ✔ Clang de Mozilla soporta aarch64 nativamente (no se requiere gcc/g++ cross)"
  echo ""

  # Bootstrap will download the aarch64 sysroot automatically via --enable-bootstrap
  # We just verify it exists or instruct to run bootstrap
  local SYSROOT="$MOZBUILD/sysroot-aarch64-linux-gnu"
  if [[ -d "$SYSROOT" && "$FORCE" -eq 0 ]]; then
    echo "✔ Linux aarch64 sysroot ya existe en $SYSROOT"
    return 0
  fi

  ensure_engine

  echo "→ Descargando aarch64 sysroot via mach bootstrap..."
  cd "$ENGINE_DIR"

  # The bootstrap system downloads the sysroot automatically when
  # --enable-bootstrap is set and the target is aarch64-linux-gnu.
  # We trigger it by running a configure with the right target.
  AMELIA_PLATFORM=linux AMELIA_COMPAT=aarch64 SURFER_COMPAT=aarch64 \
    "$ENGINE_DIR/mach" artifact toolchain --from-build toolchain-sysroot-aarch64-linux-gnu 2> /dev/null || {
    echo ""
    echo "  ⚠ No se pudo descargar el sysroot automáticamente."
    echo "    El bootstrap lo descargará durante la primera compilación"
    echo "    si --enable-bootstrap está habilitado en el mozconfig."
    echo ""
    echo "    Alternativa manual:"
    echo "      AMELIA_PLATFORM=linux AMELIA_COMPAT=aarch64 npm run bootstrap"
  }

  # mach artifact toolchain downloads to engine/, move to ~/.mozbuild/
  local ENGINE_SYSROOT="$ENGINE_DIR/sysroot-aarch64-linux-gnu"
  if [[ -d "$ENGINE_SYSROOT" && ! -d "$SYSROOT" ]]; then
    echo "→ Moviendo sysroot a $SYSROOT..."
    mv "$ENGINE_SYSROOT" "$SYSROOT"
  elif [[ -d "$ENGINE_SYSROOT" && -d "$SYSROOT" ]]; then
    echo "→ Actualizando sysroot en $SYSROOT..."
    rm -rf "$SYSROOT"
    mv "$ENGINE_SYSROOT" "$SYSROOT"
  fi

  if [[ -d "$SYSROOT" ]]; then
    echo "✔ Linux aarch64 sysroot instalado en $SYSROOT"
  else
    echo "→ El sysroot se descargará automáticamente durante el primer build."
  fi
}

# ═══════════════════════════════════════════════════════════════
# Main dispatch
# ═══════════════════════════════════════════════════════════════
echo "=== Midori Browser — Setup de Cross-Compilación ==="

case "$TARGET" in
  windows | win)
    setup_windows
    ;;
  linux-arm64 | linux-aarch64)
    setup_linux_arm64
    ;;
  macos | mac | darwin)
    setup_macos
    ;;
  all)
    setup_windows
    setup_linux_arm64
    setup_macos
    ;;
  *)
    echo ""
    echo "Uso: $0 <target> [--force]"
    echo ""
    echo "Targets disponibles:"
    echo "  windows       Prepara MSVC + Windows SDK para cross-compilación"
    echo "  linux-arm64   Prepara sysroot aarch64 para cross-compilación"
    echo "  macos         Muestra info sobre compilación macOS"
    echo "  all           Prepara todos los targets posibles"
    echo ""
    echo "Opciones:"
    echo "  --force       Re-descargar aunque ya exista"
    exit 1
    ;;
esac

echo ""
echo "=== Setup completado ==="
