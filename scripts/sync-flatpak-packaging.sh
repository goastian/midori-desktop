#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_REPO_DIR="${1:-$REPO_ROOT/org.astian.midori_browser}"
APP_ID="org.astian.midori_browser"
RELEASE_METADATA="$REPO_ROOT/release-output/flatpak-release.json"
VERSION="${VERSION:-}"
SOURCE_SHA="${SOURCE_SHA:-}"
SOURCE_COMMIT="${SOURCE_COMMIT:-}"

for cmd in git node python3; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: '$cmd' is required to sync Flatpak packaging" >&2
    exit 1
  fi
done

if [ ! -f "$PKG_REPO_DIR/$APP_ID.yml" ]; then
  echo "error: Flatpak manifest not found: $PKG_REPO_DIR/$APP_ID.yml" >&2
  exit 1
fi

if [ -z "$VERSION" ]; then
  if [ -f "$RELEASE_METADATA" ]; then
    VERSION="$(node -e "const c=require('$RELEASE_METADATA'); console.log(c.version || '')")"
  fi
fi

if [ -z "$VERSION" ]; then
  VERSION="$(node -e "const c=require('$REPO_ROOT/amelia.json'); console.log(c.brands.release.release.displayVersion)")"
fi

if [ -z "$SOURCE_COMMIT" ]; then
  if [ -f "$RELEASE_METADATA" ]; then
    SOURCE_COMMIT="$(node -e "const c=require('$RELEASE_METADATA'); console.log(c.source_commit || '')")"
  fi
fi

if [ -z "$SOURCE_COMMIT" ]; then
  SOURCE_COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD)"
fi

if [ -z "$SOURCE_SHA" ]; then
  if [ -f "$RELEASE_METADATA" ]; then
    SOURCE_SHA="$(node -e "const c=require('$RELEASE_METADATA'); console.log(c.source_sha256 || '')")"
  fi
fi

if [ -z "$SOURCE_SHA" ]; then
  source_bundle="$REPO_ROOT/release-output/midori-$VERSION-src.tar.xz"
  if [ -f "$source_bundle" ]; then
    SOURCE_SHA="$(sha256sum "$source_bundle" | awk '{print $1}')"
  else
    echo "No source bundle found yet; preserving the manifest sha256"
  fi
fi

release_args=(
  --repo "$PKG_REPO_DIR"
  --version "$VERSION"
  --source-commit "$SOURCE_COMMIT"
)

if [ -n "$SOURCE_SHA" ]; then
  release_args+=(--source-sha "$SOURCE_SHA")
fi

echo "Updating Flatpak release metadata for $VERSION"
python3 "$REPO_ROOT/scripts/update-flatpak-release.py" "${release_args[@]}"

echo "Regenerating Flatpak npm sources"
bash "$REPO_ROOT/scripts/refresh-node-sources.sh" \
  "$REPO_ROOT/package-lock.json" \
  "$PKG_REPO_DIR/generated-sources.json"

echo "Flatpak packaging synced: $PKG_REPO_DIR"
