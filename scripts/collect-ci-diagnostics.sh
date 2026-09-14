#!/usr/bin/env bash

set -u

diagnostics_dir="${1:-ci-diagnostics}"
mkdir -p "$diagnostics_dir"

{
  date --utc --iso-8601=seconds 2>/dev/null || date -u
  uname -a
  git rev-parse HEAD 2>/dev/null || true
  git status --short 2>/dev/null || true
  df -h
  if command -v free >/dev/null 2>&1; then
    free -h
  fi
  ulimit -a
  for tool in node npm python3 rustc cargo sccache; do
    if command -v "$tool" >/dev/null 2>&1; then
      "$tool" --version || true
    fi
  done
  if command -v sccache >/dev/null 2>&1; then
    sccache --show-stats || true
  fi
} > "$diagnostics_dir/runner.txt" 2>&1

if [[ -d engine ]]; then
  find engine -maxdepth 4 \
    \( -name config.status -o -name mozinfo.json -o -name application.ini \) \
    -type f -print > "$diagnostics_dir/engine-files.txt" 2>&1 || true

  while IFS= read -r file; do
    if command -v sha256sum >/dev/null 2>&1; then
      digest="$(printf '%s' "$file" | sha256sum | cut -c1-12)"
    else
      digest="$(printf '%s' "$file" | shasum -a 256 | cut -c1-12)"
    fi
    cp "$file" "$diagnostics_dir/$(basename "$file").$digest" || true
  done < "$diagnostics_dir/engine-files.txt"
fi
