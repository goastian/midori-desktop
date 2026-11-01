#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

set -euo pipefail

clang_bin="${MOZBUILD_STATE_PATH:-$HOME/.mozbuild}/clang/bin/clang"
if [[ ! -x "$clang_bin" ]]; then
  echo "Mozilla Clang is missing at $clang_bin. Run bootstrap first." >&2
  exit 1
fi

rust_info="$(rustc --version --verbose)"
clang_info="$("$clang_bin" --version)"
printf '%s\n' "$rust_info" "$clang_info"

rust_llvm="$(sed -nE 's/^LLVM version: ([0-9]+).*/\1/p' <<< "$rust_info")"
clang_llvm="$(sed -nE 's/.*clang version ([0-9]+).*/\1/p' <<< "$clang_info")"
if [[ -z "$rust_llvm" || -z "$clang_llvm" ]]; then
  echo "Could not determine the Rust and Clang LLVM versions." >&2
  exit 1
fi

if [[ "$rust_llvm" != "$clang_llvm" ]]; then
  echo "Cross-language LTO requires matching LLVM major versions: Rust uses $rust_llvm, Clang uses $clang_llvm. Update .rust-toolchain or the Mozilla Clang toolchain." >&2
  exit 1
fi

echo "Rust and Mozilla Clang both use LLVM $rust_llvm."
