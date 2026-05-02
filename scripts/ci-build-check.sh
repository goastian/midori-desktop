#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${REPO_ROOT}/.ci-logs"
LOG_FILE="${LOG_DIR}/build-check.log"
mkdir -p "$LOG_DIR"

if [[ -f "${HOME}/.cargo/env" ]]; then
  # shellcheck disable=SC1090
  . "${HOME}/.cargo/env"
fi

echo "=== Build check starting ==="
echo "Log file: ${LOG_FILE}"
echo "Timestamp (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Working directory: ${REPO_ROOT}"

set +e
npm run build 2>&1 | tee "$LOG_FILE"
build_status=${PIPESTATUS[0]}
set -e

if [[ "$build_status" -eq 0 ]]; then
  echo "=== Build check completed successfully ==="
  exit 0
fi

echo "=== Build check failed (exit ${build_status}) ==="
echo "=== Failure summary: matched error patterns ==="
grep -En \
  '(^error:| error: |FAILED|Killed$|signal 9|SIGKILL|undefined reference|collect2: error|ld(\.lld)?: error|clang(\+\+)?: error|rustc.*error|gmake(\[[0-9]+\])?: \*\*\*)' \
  "$LOG_FILE" | tail -n 200 || true

echo "=== Failure summary: last 200 log lines ==="
tail -n 200 "$LOG_FILE" || true

echo "=== System diagnostics ==="
echo "-- memory --"
free -h || true
echo "-- disk --"
df -h || true
echo "-- top processes by RSS --"
ps -eo pid,ppid,%cpu,%mem,rss,vsz,comm --sort=-rss | head -n 15 || true
echo "-- ulimit --"
ulimit -a || true

exit "$build_status"
