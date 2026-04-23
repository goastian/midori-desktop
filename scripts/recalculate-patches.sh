#!/bin/bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#
# Safe patch recalculation script for Midori.
# This script re-exports all .patch files from the current engine/ state.
#
# SAFETY: Before overwriting any patch, it verifies that the new content
# is not empty. If a patch would become empty (meaning the target file
# has no diff in engine/), the original patch is preserved and a warning
# is printed. This prevents accidental patch destruction after updates.
#
# Usage: bash scripts/recalculate-patches.sh [--force]
#   --force: Overwrite patches even if the new content is empty

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENGINE_DIR="$PROJECT_DIR/engine"
SRC_DIR="$PROJECT_DIR/src"

FORCE=false
if [[ "${1:-}" == "--force" ]]; then
  FORCE=true
fi

IGNORE_FILES=(
  "shared.nsh"
  "ignorePrefs.json"
)

# Verify engine/ exists and has a git repo
if [[ ! -d "$ENGINE_DIR/.git" ]]; then
  echo "ERROR: engine/ directory does not have a git repository."
  echo "Run 'npm run import' first to set up the engine with patches applied."
  exit 1
fi

# Verify engine has uncommitted changes (patches should be applied)
CHANGED_FILES=$(cd "$ENGINE_DIR" && git diff --name-only 2>/dev/null | wc -l)
if [[ "$CHANGED_FILES" -eq 0 ]]; then
  echo "WARNING: engine/ has no uncommitted changes."
  echo "This likely means patches have NOT been applied."
  echo "Running recalculate-patches now would DESTROY all patches."
  echo ""
  echo "Run 'npm run import' first, then re-run this script."
  if [[ "$FORCE" != true ]]; then
    echo "Use --force to override this safety check (NOT RECOMMENDED)."
    exit 1
  fi
  echo "--force flag set, continuing anyway..."
fi

TOTAL=0
UPDATED=0
SKIPPED=0
EMPTY_WARNED=0
FAILED=0

echo "=== Recalculating patches ==="
echo ""

while read -r patch_file; do
  TOTAL=$((TOTAL + 1))

  # Extract all target files from the patch (multi-file patches have multiple +++ lines)
  target_files=$(grep -oP '(?<=\+\+\+ b/).+' "$patch_file" 2>/dev/null || true)

  if [[ -z "$target_files" ]]; then
    # Patch is already empty or malformed — skip it
    echo "SKIP (empty/malformed): $patch_file"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Use only the first target file for export (amelia export uses single file)
  first_target=$(echo "$target_files" | head -1)
  new_file_base=$(basename "$first_target")

  # Check ignore list
  if [[ " ${IGNORE_FILES[*]} " =~ " ${new_file_base} " ]]; then
    echo "SKIP (ignored): $patch_file"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Check if the target file exists in engine/
  if [[ ! -f "$ENGINE_DIR/$first_target" ]]; then
    echo "SKIP (target not found in engine): $first_target"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Generate the new patch content using git diff
  new_content=$(cd "$ENGINE_DIR" && git diff --src-prefix=a/ --dst-prefix=b/ --full-index "$first_target" 2>/dev/null || true)

  # For multi-file patches, concatenate diffs for all targets
  if [[ $(echo "$target_files" | wc -l) -gt 1 ]]; then
    new_content=""
    while IFS= read -r tf; do
      if [[ -f "$ENGINE_DIR/$tf" ]]; then
        file_diff=$(cd "$ENGINE_DIR" && git diff --src-prefix=a/ --dst-prefix=b/ --full-index "$tf" 2>/dev/null || true)
        if [[ -n "$file_diff" ]]; then
          new_content="${new_content}${file_diff}"$'\n'
        fi
      fi
    done <<< "$target_files"
  fi

  # Safety check: if new content is empty, do NOT overwrite the original
  if [[ -z "$new_content" || ${#new_content} -lt 10 ]]; then
    echo "WARNING: Empty diff for $patch_file"
    echo "  Target: $first_target"
    echo "  The original patch is PRESERVED (not overwritten)."
    EMPTY_WARNED=$((EMPTY_WARNED + 1))
    if [[ "$FORCE" == true ]]; then
      echo "  --force: Overwriting anyway (patch will be empty)."
      echo "" > "$patch_file"
    fi
    continue
  fi

  # Write the updated patch
  echo "$new_content" > "$patch_file"
  echo "OK: $(basename "$patch_file")"
  UPDATED=$((UPDATED + 1))
done < <(find "$SRC_DIR" -type f -name "*.patch" | sort)

echo ""
echo "=== Patch recalculation complete ==="
echo "  Updated: $UPDATED"
echo "  Skipped: $SKIPPED"
echo "  Empty (preserved): $EMPTY_WARNED"
if [[ $FAILED -gt 0 ]]; then
  echo "  Failed: $FAILED"
fi
