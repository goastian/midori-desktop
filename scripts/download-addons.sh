#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#
# download-addons.sh — Downloads and integrates addons from amelia.json
# into engine/browser/extensions/ as builtin-addons for the Mozilla build system.
#
# Usage: bash scripts/download-addons.sh [--force]
#   --force: Re-download and overwrite even if addon files already exist

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AMELIA_JSON="$PROJECT_DIR/amelia.json"
ENGINE_DIR="$PROJECT_DIR/engine"
EXTENSIONS_DIR="$ENGINE_DIR/browser/extensions"
TMP_DIR="$PROJECT_DIR/.tmp-addons"

FORCE=false
if [[ "${1:-}" == "--force" ]]; then
    FORCE=true
fi

# Check dependencies
for cmd in jq curl unzip; do
    if ! command -v "$cmd" &>/dev/null; then
        echo "ERROR: '$cmd' is required but not found. Please install it."
        exit 1
    fi
done

if [[ ! -f "$AMELIA_JSON" ]]; then
    echo "ERROR: amelia.json not found at $AMELIA_JSON"
    exit 1
fi

if [[ ! -d "$ENGINE_DIR" ]]; then
    echo "ERROR: engine/ directory not found. Run 'amelia download' first."
    exit 1
fi

# Read addons from amelia.json
ADDON_KEYS=$(jq -r '.addons // {} | keys[]' "$AMELIA_JSON" 2>/dev/null)
if [[ -z "$ADDON_KEYS" ]]; then
    echo "INFO: No addons defined in amelia.json"
    exit 0
fi

mkdir -p "$TMP_DIR"

# Track which addons we process for moz.build registration
PROCESSED_ADDONS=()

for ADDON_KEY in $ADDON_KEYS; do
    echo ""
    echo "=== Processing addon: $ADDON_KEY ==="

    # Read addon config
    ADDON_ID=$(jq -r ".addons[\"$ADDON_KEY\"].id" "$AMELIA_JSON")
    PLATFORM=$(jq -r ".addons[\"$ADDON_KEY\"].platform // \"unknown\"" "$AMELIA_JSON")
    ADDON_DIR="$EXTENSIONS_DIR/$ADDON_KEY"

    # Check if addon already has files (not just empty dir)
    FILE_COUNT=0
    if [[ -d "$ADDON_DIR" ]]; then
        FILE_COUNT=$(find "$ADDON_DIR" -type f ! -name "moz.build" ! -name "jar.mn" | wc -l)
    fi

    if [[ "$FILE_COUNT" -gt 0 ]] && [[ "$FORCE" != "true" ]]; then
        echo "INFO: $ADDON_KEY already has $FILE_COUNT files. Skipping download (use --force to re-download)."
    else
        # Resolve download URL based on platform
        DOWNLOAD_URL=""
        case "$PLATFORM" in
            url)
                DOWNLOAD_URL=$(jq -r ".addons[\"$ADDON_KEY\"].url" "$AMELIA_JSON")
                ;;
            github)
                REPO=$(jq -r ".addons[\"$ADDON_KEY\"].repo" "$AMELIA_JSON")
                VERSION=$(jq -r ".addons[\"$ADDON_KEY\"].version" "$AMELIA_JSON")
                FILE_GLOB=$(jq -r ".addons[\"$ADDON_KEY\"].fileGlob" "$AMELIA_JSON")

                echo "INFO: Fetching release info from GitHub: $REPO @ $VERSION"
                RELEASE_JSON=$(curl -sL \
                    -H "User-Agent: midori-build-addon-downloader" \
                    "https://api.github.com/repos/$REPO/releases/tags/$VERSION")

                # Find matching asset
                DOWNLOAD_URL=$(echo "$RELEASE_JSON" | jq -r \
                    --arg glob "$FILE_GLOB" \
                    '.assets[] | select(.name == $glob) | .browser_download_url' 2>/dev/null | head -1)

                if [[ -z "$DOWNLOAD_URL" || "$DOWNLOAD_URL" == "null" ]]; then
                    echo "WARNING: Could not find asset matching '$FILE_GLOB' in $REPO @ $VERSION"
                    echo "WARNING: Available assets:"
                    echo "$RELEASE_JSON" | jq -r '.assets[].name' 2>/dev/null || echo "  (none)"
                    continue
                fi
                ;;
            amo)
                AMO_ID=$(jq -r ".addons[\"$ADDON_KEY\"].amoId" "$AMELIA_JSON")
                echo "INFO: Fetching from AMO: $AMO_ID"
                DOWNLOAD_URL=$(curl -sL "https://addons.mozilla.org/api/v4/addons/addon/$AMO_ID/versions/" | \
                    jq -r '.results[0].files[0].url' 2>/dev/null)
                ;;
            *)
                echo "ERROR: Unknown platform '$PLATFORM' for addon $ADDON_KEY"
                continue
                ;;
        esac

        if [[ -z "$DOWNLOAD_URL" || "$DOWNLOAD_URL" == "null" ]]; then
            echo "ERROR: Could not resolve download URL for $ADDON_KEY"
            continue
        fi

        echo "INFO: Downloading from $DOWNLOAD_URL"
        TEMP_FILE="$TMP_DIR/$ADDON_KEY.zip"
        curl -sL -o "$TEMP_FILE" "$DOWNLOAD_URL"

        if [[ ! -f "$TEMP_FILE" ]] || [[ ! -s "$TEMP_FILE" ]]; then
            echo "ERROR: Download failed for $ADDON_KEY"
            continue
        fi

        # Clean existing addon directory but preserve moz.build and jar.mn if they exist
        if [[ -d "$ADDON_DIR" ]]; then
            # Save moz.build and jar.mn if they exist
            SAVED_MOZBUILD=""
            SAVED_JARMN=""
            if [[ -f "$ADDON_DIR/moz.build" ]]; then
                SAVED_MOZBUILD=$(cat "$ADDON_DIR/moz.build")
            fi
            if [[ -f "$ADDON_DIR/jar.mn" ]]; then
                SAVED_JARMN=$(cat "$ADDON_DIR/jar.mn")
            fi

            rm -rf "$ADDON_DIR"
        fi

        mkdir -p "$ADDON_DIR"
        echo "INFO: Unpacking $ADDON_KEY..."
        unzip -q -o "$TEMP_FILE" -d "$ADDON_DIR"

        # Restore saved build files
        if [[ -n "${SAVED_MOZBUILD:-}" ]]; then
            echo "$SAVED_MOZBUILD" > "$ADDON_DIR/moz.build"
        fi
        if [[ -n "${SAVED_JARMN:-}" ]]; then
            echo "$SAVED_JARMN" > "$ADDON_DIR/jar.mn"
        fi
    fi

    # Generate moz.build if missing
    if [[ ! -f "$ADDON_DIR/moz.build" ]]; then
        echo "INFO: Generating moz.build for $ADDON_KEY"
        cat > "$ADDON_DIR/moz.build" << 'MOZBUILD'
DEFINES["MOZ_APP_VERSION"] = CONFIG["MOZ_APP_VERSION"]
DEFINES["MOZ_APP_MAXVERSION"] = CONFIG["MOZ_APP_MAXVERSION"]

JAR_MANIFESTS += ["jar.mn"]
MOZBUILD
    fi

    # Generate jar.mn if missing
    if [[ ! -f "$ADDON_DIR/jar.mn" ]]; then
        echo "INFO: Generating jar.mn for $ADDON_KEY"

        {
            echo "browser.jar:"
            echo "    builtin-addons/$ADDON_KEY/manifest.json (manifest.json)"

            # Add root-level files (excluding manifest.json, moz.build, jar.mn)
            while IFS= read -r -d '' file; do
                BASENAME=$(basename "$file")
                if [[ "$BASENAME" != "manifest.json" && "$BASENAME" != "moz.build" && "$BASENAME" != "jar.mn" ]]; then
                    echo "    builtin-addons/$ADDON_KEY/$BASENAME ($BASENAME)"
                fi
            done < <(find "$ADDON_DIR" -maxdepth 1 -type f -print0 | sort -z)

            # Add directories with glob patterns
            while IFS= read -r -d '' dir; do
                DIRNAME=$(basename "$dir")
                # Use ** glob for directories that may have subdirs (like _locales)
                if find "$dir" -mindepth 2 -type f -print -quit 2>/dev/null | grep -q .; then
                    echo "    builtin-addons/$ADDON_KEY/$DIRNAME/ ($DIRNAME/**/*)"
                else
                    echo "    builtin-addons/$ADDON_KEY/$DIRNAME/ ($DIRNAME/*)"
                fi
            done < <(find "$ADDON_DIR" -maxdepth 1 -type d ! -path "$ADDON_DIR" -print0 | sort -z)

        } > "$ADDON_DIR/jar.mn"
    fi

    # Verify manifest.json exists and has required gecko ID
    if [[ ! -f "$ADDON_DIR/manifest.json" ]]; then
        echo "ERROR: $ADDON_KEY has no manifest.json — extension won't load!"
        continue
    fi

    GECKO_ID=$(jq -r '.browser_specific_settings.gecko.id // empty' "$ADDON_DIR/manifest.json" 2>/dev/null)
    if [[ -z "$GECKO_ID" ]]; then
        echo "WARNING: $ADDON_KEY manifest.json has no browser_specific_settings.gecko.id"
        echo "WARNING: The extension may not load correctly as a builtin addon"
    else
        echo "INFO: $ADDON_KEY gecko ID: $GECKO_ID"
    fi

    PROCESSED_ADDONS+=("$ADDON_KEY")
    echo "OK: $ADDON_KEY is ready"
done

# Register addons in moz.build if not already present
MOZBUILD_FILE="$EXTENSIONS_DIR/moz.build"
if [[ -f "$MOZBUILD_FILE" ]]; then
    CHANGED=false
    for ADDON in "${PROCESSED_ADDONS[@]}"; do
        if ! grep -q "\"$ADDON\"" "$MOZBUILD_FILE"; then
            echo ""
            echo "INFO: Adding '$ADDON' to $MOZBUILD_FILE DIRS"
            # Insert before the closing bracket of DIRS
            sed -i "/^]/i\\    \"$ADDON\"," "$MOZBUILD_FILE"
            CHANGED=true
        fi
    done

    if [[ "$CHANGED" == "true" ]]; then
        echo "INFO: Updated $MOZBUILD_FILE"
    else
        echo "INFO: All addons already registered in moz.build"
    fi
fi

# Cleanup temp dir
rm -rf "$TMP_DIR"

echo ""
echo "=== Addon integration complete ==="
echo "Processed addons: ${PROCESSED_ADDONS[*]}"
echo ""
echo "Next steps:"
echo "  1. Build: npm run build"
echo "  2. Run: npm run browser"
