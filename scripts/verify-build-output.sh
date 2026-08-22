#!/usr/bin/env bash

set -euo pipefail

platform="${1:?missing platform}"
arch="${2:?missing architecture}"

case "$platform" in
  linux)
    binary_name="midori"
    binary_path_pattern='*/dist/bin/midori'
    ;;
  macos)
    binary_name="Midori.app"
    binary_path_pattern='*/dist/Midori.app/Contents/MacOS/midori'
    ;;
  windows)
    binary_name="midori.exe"
    binary_path_pattern='*/dist/bin/midori.exe'
    ;;
  *)
    echo "Unsupported platform: $platform" >&2
    exit 2
    ;;
esac

binary_path="$(find engine/obj-* -type f -path "$binary_path_pattern" -print -quit)"

if [[ -z "$binary_path" ]]; then
  echo "No $binary_name output found for $platform/$arch" >&2
  exit 1
fi

echo "Verified $platform/$arch output: $binary_path"
