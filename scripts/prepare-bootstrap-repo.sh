#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE_DIR="$REPO_ROOT/engine"

if [[ ! -d "$ENGINE_DIR/.git" ]]; then
  exit 0
fi

if git -C "$ENGINE_DIR" rev-parse --verify HEAD >/dev/null 2>&1; then
  exit 0
fi

echo "[bootstrap-prep] engine git checkout has no commits yet; creating an empty seed commit for mach bootstrap."
git -C "$ENGINE_DIR" \
  -c user.name="Midori Bootstrap" \
  -c user.email="midori-bootstrap@users.noreply.github.com" \
  commit --allow-empty -m "chore: seed bootstrap revision" >/dev/null
