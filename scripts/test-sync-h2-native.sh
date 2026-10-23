#!/usr/bin/env bash
set -euo pipefail

h2_repository=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
if [[ ${1:-} == --workspaces ]]; then
  export MIDORI_SYNC_INCLUDE_WORKSPACES=1
elif [[ ${1:-} == --privacy-filters ]]; then
  export MIDORI_SYNC_INCLUDE_PRIVACY_FILTERS=1
elif [[ ${1:-} == --site-permissions ]]; then
  export MIDORI_SYNC_INCLUDE_SITE_PERMISSIONS=1
elif [[ -n ${1:-} && ${1:-} != --session ]]; then
  printf 'Usage: bash scripts/test-sync-h2-native.sh [--workspaces|--privacy-filters|--site-permissions]\n' >&2
  exit 2
fi
if [[ ${1:-} != --session ]]; then
  if [[ ! -f ${MIDORI_SYNC_TEST_FIXTURE:-} ]]; then
    printf 'Set MIDORI_SYNC_TEST_FIXTURE to a fresh sync:test-account --fresh fixture from the existing port 8000 instance.\n' >&2
    exit 2
  fi
  for h2_command in dbus-run-session gnome-keyring-daemon gdbus python3.11; do
    command -v "$h2_command" > /dev/null || { printf 'Missing dependency: %s\n' "$h2_command" >&2; exit 1; }
  done
  h2_root=$(mktemp -d /tmp/midori-sync-h2-XXXXXX)
  mkdir -m 700 "$h2_root/data" "$h2_root/config" "$h2_root/cache" "$h2_root/runtime" "$h2_root/control"
  export XDG_DATA_HOME="$h2_root/data" XDG_CONFIG_HOME="$h2_root/config"
  export XDG_CACHE_HOME="$h2_root/cache" XDG_RUNTIME_DIR="$h2_root/runtime"
  exec dbus-run-session -- bash "$h2_repository/scripts/test-sync-h2-native.sh" --session "$h2_root"
fi

h2_root=$2
case "$h2_root" in
  /tmp/midori-sync-h2-*) ;;
  *) printf 'Invalid private H2 session directory.\n' >&2; exit 2 ;;
esac
h2_prefix=$(basename "$h2_root")
h2_logs="$h2_repository/artifacts/$h2_prefix"
mkdir -m 700 "$h2_logs"
export MIDORI_SYNC_TEST_KEYRING_ROOT="$h2_root"
export MIDORI_SYNC_H2_STATE="$h2_root/profile-state.json"
export MIDORI_SYNC_H2_PROFILE_A="$h2_root/profile-A"
export MIDORI_SYNC_H2_PROFILE_B="$h2_root/profile-B"
printf '%s\n' 'public synthetic h2 keyring test password' |
  gnome-keyring-daemon --foreground --components=secrets --control-directory="$h2_root/control" --unlock > "$h2_root/keyring.log" 2>&1 &
h2_keyring_pid=$!
cleanup_h2() {
  kill "$h2_keyring_pid" 2>/dev/null || true
  wait "$h2_keyring_pid" 2>/dev/null || true
  for h2_stage_cleanup in A B C D E F G H; do
    rm -rf -- "${TMPDIR:-/tmp}/$h2_prefix-$h2_stage_cleanup"
  done
  rm -rf -- "$h2_root"
}
trap cleanup_h2 EXIT
gdbus wait --session --timeout 10 org.freedesktop.secrets
cd "$h2_repository/engine"
h2_object="$h2_repository/engine/obj-x86_64-pc-linux-gnu"
h2_stages=(A B C D E F)
h2_manifest=h2-live.toml
if [[ ${MIDORI_SYNC_INCLUDE_PRIVACY_FILTERS:-} == 1 ]]; then
  h2_stages=(A B C D E F H G)
  h2_manifest=privacy-live.toml
elif [[ ${MIDORI_SYNC_INCLUDE_SITE_PERMISSIONS:-} == 1 ]]; then
  h2_stages=(A B C D E F G)
  h2_manifest=permissions-live.toml
fi
for h2_stage in "${h2_stages[@]}"; do
  export MIDORI_SYNC_H2_STAGE="$h2_stage"
  if ! python3.11 ./mach python -- testing/xpcshell/runxpcshelltests.py \
    --headless --sequential --verbose --no-logfiles \
    --log-raw "$h2_logs/profile-$h2_stage.jsonl" \
    --xpcshell "$h2_object/dist/bin/xpcshell" --xre-path "$h2_object/dist/bin" \
    --app-path "$h2_object/dist/bin/browser" --build-info-json "$h2_object/mozinfo.json" \
    --testing-modules-dir "$h2_object/_tests/modules" --utility-path "$h2_object/dist/bin" \
    --temp-dir "$h2_root" --profile-name "$h2_prefix-$h2_stage" \
    --manifest "$h2_repository/engine/browser/components/sync/test/integration/$h2_manifest" \
    > "$h2_logs/profile-$h2_stage.log" 2>&1; then
    printf 'H2 profile %s failed: %s/profile-%s.log\n' "$h2_stage" "$h2_logs" "$h2_stage" >&2
    exit 1
  fi
  python3.11 "$h2_repository/scripts/check-sync-ui.py" "$h2_logs/profile-$h2_stage.jsonl" \
    "$h2_repository/src/browser/components/sync/test/integration/$h2_manifest" \
    > "$h2_logs/profile-$h2_stage-verification.log" 2>&1
  if [[ $h2_stage == A || $h2_stage == C || ( $h2_stage == E && ( ${MIDORI_SYNC_INCLUDE_PRIVACY_FILTERS:-} == 1 || ${MIDORI_SYNC_INCLUDE_SITE_PERMISSIONS:-} == 1 ) ) ]]; then
    h2_backup="$MIDORI_SYNC_H2_PROFILE_A"
  elif [[ $h2_stage == B || $h2_stage == D || ( $h2_stage == F && ( ${MIDORI_SYNC_INCLUDE_PRIVACY_FILTERS:-} == 1 || ${MIDORI_SYNC_INCLUDE_SITE_PERMISSIONS:-} == 1 ) ) ]]; then
    h2_backup="$MIDORI_SYNC_H2_PROFILE_B"
  else
    continue
  fi
  h2_source="${TMPDIR:-/tmp}/$h2_prefix-$h2_stage/xpcshellprofile"
  if [[ ! -d $h2_source ]]; then
    printf 'H2 profile was not retained: %s\n' "$h2_source" >&2
    exit 1
  fi
  rm -rf -- "$h2_backup"
  cp -a "$h2_source" "$h2_backup"
done
if [[ ${MIDORI_SYNC_INCLUDE_PRIVACY_FILTERS:-} == 1 ]]; then
  printf 'Custom filters passed eight native profile processes against port 8000: %s\n' "$h2_logs"
  exit 0
fi
if [[ ${MIDORI_SYNC_INCLUDE_SITE_PERMISSIONS:-} == 1 ]]; then
  printf 'Site permissions passed seven native profile processes against port 8000: %s\n' "$h2_logs"
  exit 0
fi
printf 'H2 native profiles A-B-A-B-A-B passed against port 8000, including process restart, duplicates, conflicts and encrypted deletions: %s\n' "$h2_logs"
if [[ ${MIDORI_SYNC_INCLUDE_WORKSPACES:-} == 1 ]]; then
  printf 'H5 workspace metadata also passed all six native profile processes.\n'
fi
