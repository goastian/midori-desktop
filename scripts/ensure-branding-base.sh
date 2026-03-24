#!/bin/bash

set -euo pipefail

BRANDING_ROOT="engine/browser/branding"

if [ ! -d "$BRANDING_ROOT" ]; then
  echo "[ensure-branding-base] Branding root not found: $BRANDING_ROOT (skipping)"
  exit 0
fi

find_branding_source() {
  local target="$1"
  local candidate
  for candidate in unofficial official nightly aurora; do
    if [ "$candidate" = "$target" ]; then
      continue
    fi
    if [ -d "$BRANDING_ROOT/$candidate" ] && [ -f "$BRANDING_ROOT/$candidate/branding.nsi" ]; then
      echo "$BRANDING_ROOT/$candidate"
      return 0
    fi
  done

  # Last-resort fallback: any branding directory that looks complete enough.
  while IFS= read -r dir; do
    if [ -f "$dir/branding.nsi" ]; then
      echo "$dir"
      return 0
    fi
  done < <(find "$BRANDING_ROOT" -mindepth 1 -maxdepth 1 -type d | sort)

  return 1
}

ensure_target_branding() {
  local target="$1"
  local target_dir="$BRANDING_ROOT/$target"

  if [ -d "$target_dir" ] && [ -f "$target_dir/branding.nsi" ]; then
    echo "[ensure-branding-base] $target already present"
    return 0
  fi

  local source_dir
  if ! source_dir="$(find_branding_source "$target")"; then
    echo "[ensure-branding-base] ERROR: could not find source branding directory to create $target"
    return 1
  fi

  rm -rf "$target_dir"
  cp -a "$source_dir" "$target_dir"
  echo "[ensure-branding-base] Created $target from $(basename "$source_dir")"
}

ensure_target_branding "official"
ensure_target_branding "unofficial"
