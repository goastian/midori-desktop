#!/usr/bin/env bash
set -euo pipefail

# Firefox/Mach currently supports Python up to 3.12. Some rolling distros
# such as openSUSE Tumbleweed expose Python 3.13 as `python3`, while keeping
# Python 3.11 available as `python3.11`.
if command -v python3 >/dev/null 2>&1; then
  PY_MINOR="$(python3 -c 'import sys; print(sys.version_info.minor)' 2>/dev/null || echo 0)"
  if [[ "$PY_MINOR" -ge 13 ]] && command -v python3.11 >/dev/null 2>&1; then
    WRAPPER_DIR="${TMPDIR:-/tmp}/midori-mach-python311-bin"
    mkdir -p "$WRAPPER_DIR"
    ln -sf "$(command -v python3.11)" "$WRAPPER_DIR/python3"
    export PATH="$WRAPPER_DIR:$PATH"
    echo "[with-mach-python] Using python3.11 for Mach because system python3 is 3.${PY_MINOR}."
  fi
fi

exec "$@"
