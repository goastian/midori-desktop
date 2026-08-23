#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

set -euo pipefail

APP_ID="${FLATPAK_ID:-org.astian.midori_browser}"
PREFIX="${FLATPAK_DEST:-/app}"

if [ -z "${FLATPAK_DEST:-}" ] && [ ! -w /app ]; then
  PREFIX="$PWD/build/flatpak/app"
  echo "Using local Flatpak destination: $PREFIX"
fi
FLATPAK_BUILD_ARCH="${FLATPAK_ARCH:-$(uname -m)}"

case "$FLATPAK_BUILD_ARCH" in
  x86_64)
    export SURFER_COMPAT=x86_64
    ;;
  aarch64 | arm64)
    export SURFER_COMPAT=aarch64
    ;;
  *)
    echo "Unsupported Flatpak architecture: $FLATPAK_BUILD_ARCH" >&2
    exit 1
    ;;
esac

export AMELIA_PLATFORM=linux
export AMELIA_COMPAT="$SURFER_COMPAT"
export MIDORI_RELEASE=1
export MIDORI_RELEASE_BRANCH=release
export MIDORI_GA_RELEASE=1
export MIDORI_GA_RELEASE_BRANCH=release
export MIDORI_GA_DISABLE_PGO=1
export MIDORI_DISABLE_LTO=1
export MIDORI_FLATPAK=1
export SCCACHE_GHA_ENABLED=false
export MOZ_AUTOMATION=1
export MOZBUILD_STATE_PATH="$PWD/.mozbuild"
export npm_config_audit=false
export npm_config_fund=false
export npm_config_offline=true
export npm_config_cache="$PWD/flatpak-node/npm-cache"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is unavailable in the Flatpak SDK. Add the Node SDK extension to the manifest." >&2
  exit 1
fi

arch_pattern_primary="linux-${SURFER_COMPAT}"
arch_pattern_alt="linux-${SURFER_COMPAT/x86_64/x64}"
arch_pattern_alt="${arch_pattern_alt/aarch64/arm64}"
package_archive=""
if [ -d dist ]; then
  package_archive="$(find dist -maxdepth 1 -type f \( -name "*${arch_pattern_primary}*.tar.xz" -o -name "*${arch_pattern_alt}*.tar.xz" \) | sort | tail -n 1)"
fi

if [ -n "$package_archive" ] && [ "${MIDORI_FLATPAK_REUSE_DIST:-1}" = "1" ]; then
  echo "Reusing existing Linux package archive: $package_archive"
else
  if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
    git init -q
    git config user.name "Flatpak Builder"
    git config user.email "flatpak-builder@localhost"
    git commit --allow-empty -qm "Flatpak source snapshot"
  fi

  node scripts/flatpak-patch-npm-git-deps.mjs
  if ! npm ci --offline --ignore-scripts --cache "$npm_config_cache"; then
    echo "npm ci --offline failed, retrying with npm install fallback"
    npm_config_offline=false npm install --ignore-scripts --cache "$npm_config_cache"
  fi
  bash scripts/patch-amelia.sh
  npm run brand
  if [ "${MIDORI_FLATPAK_SKIP_BOOTSTRAP:-1}" = "1" ]; then
    echo "Skipping bootstrap for Flatpak packaging (MIDORI_FLATPAK_SKIP_BOOTSTRAP=1)"
  else
    npm run bootstrap
  fi

  if [ "${MIDORI_FLATPAK_DISABLE_WASM_SANDBOXED_LIBS:-1}" = "1" ]; then
    FLATPAK_MOZCONFIG="$PWD/engine/mozconfig.flatpak"
    cat > "$FLATPAK_MOZCONFIG" <<EOF
. "$PWD/engine/mozconfig"
ac_add_options --without-wasm-sandboxed-libraries
EOF
    export MOZCONFIG="$FLATPAK_MOZCONFIG"
    echo "Using Flatpak mozconfig override: $MOZCONFIG"
  fi

  if [ "$SURFER_COMPAT" = "aarch64" ]; then
    npm run build:linux-arm64
  else
    npm run build:linux-x64
  fi

  amelia package
  if [ -d dist ]; then
    package_archive="$(find dist -maxdepth 1 -type f \( -name "*${arch_pattern_primary}*.tar.xz" -o -name "*${arch_pattern_alt}*.tar.xz" \) | sort | tail -n 1)"
  fi
fi

if [ -z "$package_archive" ]; then
  echo "No Linux package archive was produced under dist/" >&2
  exit 1
fi

rm -rf "$PREFIX/lib/midori"
mkdir -p "$PREFIX/lib/midori"
tar -xJf "$package_archive" -C "$PREFIX/lib/midori" --strip-components=1

install -d "$PREFIX/bin"
cat > "$PREFIX/bin/midori" <<'EOF'
#!/bin/sh
export MOZ_LEGACY_PROFILES=1
exec /app/lib/midori/midori "$@"
EOF
chmod 0755 "$PREFIX/bin/midori"

metadata_dir="flatpak-packaging"
if [ ! -f "$metadata_dir/org.astian.midori_browser.desktop" ]; then
  metadata_dir="build/flatpak"
fi

install -Dm0644 "$metadata_dir/org.astian.midori_browser.desktop" \
  "$PREFIX/share/applications/$APP_ID.desktop"
install -Dm0644 "$metadata_dir/org.astian.midori_browser.metainfo.xml" \
  "$PREFIX/share/metainfo/$APP_ID.metainfo.xml"
install -Dm0644 build/flatpak/distribution/policies.json \
  "$PREFIX/lib/midori/distribution/policies.json"

install -Dm0644 configs/branding/release/logo128.png \
  "$PREFIX/share/icons/hicolor/128x128/apps/$APP_ID.png"
install -Dm0644 configs/branding/release/logo256.png \
  "$PREFIX/share/icons/hicolor/256x256/apps/$APP_ID.png"
install -Dm0644 configs/branding/release/logo512.png \
  "$PREFIX/share/icons/hicolor/512x512/apps/$APP_ID.png"
install -Dm0644 configs/branding/release/logo1024.png \
  "$PREFIX/share/icons/hicolor/1024x1024/apps/$APP_ID.png"

install -Dm0644 LICENSE "$PREFIX/share/licenses/$APP_ID/LICENSE"
