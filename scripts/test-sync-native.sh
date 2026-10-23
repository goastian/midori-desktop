#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

set -euo pipefail

sync_repository=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

if [[ ${1:-} != --session ]]; then
  sync_test_mode=${1:-all}
  case "$sync_test_mode" in
    all|vault|vault-nss|popup|backend|profiles|profiles-xpcshell|h1|h1-live|h4-offline|h4-revoked|h4-epoch|conflicts|pause|workspaces|extensions|extension-settings|extension-policies|permissions|permissions-ui|extensions-ui|extensions-live|extensions-catalog|extension-settings-live|durability|privacy-durability|permissions-durability|extensions-durability|storage|bindings|password-convergence|card-convergence|password-convergence-live|card-convergence-live|password-baseline) ;;
    *) printf 'Usage: bash scripts/test-sync-native.sh [all|vault|vault-nss|popup|backend|profiles|profiles-xpcshell|h1|h1-live|h4-offline|h4-revoked|h4-epoch|conflicts|pause|workspaces|extensions|extension-settings|extension-policies|permissions|permissions-ui|extensions-ui|extensions-live|extensions-catalog|extension-settings-live|durability|privacy-durability|permissions-durability|extensions-durability|storage|bindings|password-convergence|card-convergence|password-convergence-live|card-convergence-live|password-baseline]\n' >&2; exit 2 ;;
  esac
  for sync_command in dbus-run-session gnome-keyring-daemon gdbus python3.11; do
    if ! command -v "$sync_command" > /dev/null; then
      printf 'Missing test dependency: %s\n' "$sync_command" >&2
      exit 1
    fi
  done
  if [[ $sync_test_mode == vault-nss ]] && ! command -v cc > /dev/null; then
    printf 'Missing test dependency: cc\n' >&2
    exit 1
  fi
  if [[ $sync_test_mode == bindings ]] && ! python3 - "$sync_repository/engine/obj-x86_64-pc-linux-gnu/mozilla-config.h" <<'PY'
from pathlib import Path
import sys

header = Path(sys.argv[1])
if not header.is_file() or not any(
    line.startswith("#define MOZ_UNIFFI_FIXTURES ") for line in header.read_text().splitlines()
):
    sys.exit(1)
PY
  then
    printf 'Prepare a Gecko build with MOZ_UNIFFI_FIXTURES enabled before running the bindings suite.\n' >&2
    exit 2
  fi
  if [[ $sync_test_mode == all || $sync_test_mode == vault ]]; then
    sync_gio_python=${MIDORI_SYNC_TEST_GIO_PYTHON:-python3}
    if ! "$sync_gio_python" -c 'from gi.repository import Gio, GLib'; then
      printf 'Set MIDORI_SYNC_TEST_GIO_PYTHON to a Python interpreter with GIO bindings for the isolated keyring test.\n' >&2
      exit 1
    fi
    export MIDORI_SYNC_TEST_GIO_PYTHON
    MIDORI_SYNC_TEST_GIO_PYTHON=$(command -v "$sync_gio_python")
  fi
  if [[ ! -x "$sync_repository/engine/obj-x86_64-pc-linux-gnu/dist/bin/xpcshell" ]]; then
    printf 'Prepare the Linux x86_64 Gecko build before running these tests.\n' >&2
    exit 1
  fi
  sync_test_root=$(mktemp -d /tmp/midori-sync-native-XXXXXX)
  mkdir -m 700 "$sync_test_root/data" "$sync_test_root/config" "$sync_test_root/cache" "$sync_test_root/runtime" "$sync_test_root/control" "$sync_test_root/documents"
  printf 'XDG_DOCUMENTS_DIR="%s"\n' "$sync_test_root/documents" > "$sync_test_root/config/user-dirs.dirs"
  export XDG_DATA_HOME="$sync_test_root/data"
  export XDG_CONFIG_HOME="$sync_test_root/config"
  export XDG_CACHE_HOME="$sync_test_root/cache"
  export XDG_RUNTIME_DIR="$sync_test_root/runtime"
  if [[ $sync_test_mode == password-baseline ]]; then
    mkdir -p "$sync_repository/artifacts"
    export MIDORI_SYNC_BASELINE_PROFILE_ROOT
    MIDORI_SYNC_BASELINE_PROFILE_ROOT=$(mktemp -d "$sync_repository/artifacts/midori-sync-baseline-profiles-XXXXXX")
    export TMPDIR="$MIDORI_SYNC_BASELINE_PROFILE_ROOT"
  fi
  printf 'Private test keyring and logs: %s\n' "$sync_test_root"
  exec dbus-run-session -- bash "$sync_repository/scripts/test-sync-native.sh" --session "$sync_test_root" "$sync_test_mode"
fi

sync_test_root=$2
sync_test_mode=$3
case "$sync_test_root" in
  /tmp/midori-sync-native-*) ;;
  *) printf 'Invalid private native test directory.\n' >&2; exit 2 ;;
esac
sync_profile_prefix="midori-sync-$(basename "$sync_test_root")"
sync_test_archive="$sync_repository/artifacts/$(basename "$sync_test_root")"
mkdir -p -m 700 "$sync_test_archive"
export MIDORI_SYNC_TEST_KEYRING_ROOT="$sync_test_root"
printf '%s\n' 'public synthetic keyring test password' |
  gnome-keyring-daemon --foreground --components=secrets --control-directory="$sync_test_root/control" --unlock > "$sync_test_root/keyring.log" 2>&1 &
sync_keyring_pid=$!
trap 'sync_exit_status=$?
[[ -z ${sync_policy_manifest:-} ]] || rm -f -- "$sync_policy_manifest"
[[ -z ${sync_extensions_fixture:-} ]] || rm -f -- "$sync_extensions_fixture"
printf "%s\n" "$sync_exit_status" > "$sync_test_archive/exit.txt"
if [[ $sync_test_mode == profiles ]]; then
  [[ -z ${MIDORI_SYNC_PROFILE_BACKUP_DIR:-} ]] || rm -rf -- "$MIDORI_SYNC_PROFILE_BACKUP_DIR"
  [[ -z ${MIDORI_SYNC_PROFILE_B_BACKUP_DIR:-} ]] || rm -rf -- "$MIDORI_SYNC_PROFILE_B_BACKUP_DIR"
  [[ -z ${MIDORI_SYNC_PROFILE_LEGACY_BACKUP_DIR:-} ]] || rm -rf -- "$MIDORI_SYNC_PROFILE_LEGACY_BACKUP_DIR"
  [[ -z ${MIDORI_SYNC_PROFILE_RESTART_BACKUP_DIR:-} ]] || rm -rf -- "$MIDORI_SYNC_PROFILE_RESTART_BACKUP_DIR"
  rm -f -- "$sync_test_root/profile-state.json"
  for sync_profile_cleanup in A B G H E F C D; do
    rm -rf -- "${TMPDIR:-/tmp}/$sync_profile_prefix-$sync_profile_cleanup"
  done
fi
kill "$sync_keyring_pid" 2>/dev/null || true
wait "$sync_keyring_pid" 2>/dev/null || true
for sync_test_log in "$sync_test_root"/*.log "$sync_test_root"/*.jsonl "$sync_test_root"/extensions-catalog-proof.json; do
  [[ -f "$sync_test_log" ]] || continue
  cp -- "$sync_test_log" "$sync_test_archive/"
  chmod 600 "$sync_test_archive/$(basename "$sync_test_log")"
done
if [[ $sync_test_mode == h4-* && $sync_exit_status == 0 ]]; then
  for sync_h4_cleanup in A B C D; do
    rm -rf -- "${TMPDIR:-/tmp}/$sync_profile_prefix-offline-$sync_h4_cleanup"
    rm -rf -- "$sync_test_root/offline-$sync_h4_cleanup-backup"
  done
  rm -f -- "$sync_test_root/offline-state.json" "$sync_test_root/receipt-checkpoint.json"
fi
if [[ $sync_test_mode == password-baseline && $sync_exit_status == 0 ]]; then
  case "$MIDORI_SYNC_BASELINE_PROFILE_ROOT" in
    "$sync_repository"/artifacts/midori-sync-baseline-profiles-*) rm -rf -- "$MIDORI_SYNC_BASELINE_PROFILE_ROOT" ;;
    *) printf "Invalid native baseline profile directory.\\n" >&2; sync_exit_status=2 ;;
  esac
fi
printf "Archived native test logs: %s\n" "$sync_test_archive"
exit "$sync_exit_status"' EXIT
gdbus wait --session --timeout 10 org.freedesktop.secrets
cd "$sync_repository/engine"

run_sync_manifest() {
  local sync_object="$sync_repository/engine/obj-x86_64-pc-linux-gnu"
  local sync_manifest=$1
  shift
  sync_native_run_index=$(( ${sync_native_run_index:-0} + 1 ))
  local sync_native_raw="$sync_test_root/native-manifest-$sync_native_run_index.jsonl"
  local sync_native_prefix=()
  if [[ $sync_test_mode == password-baseline && ${MIDORI_SYNC_BASELINE_TRACE:-0} == 1 ]]; then
    sync_native_prefix=(strace -ff -qq -yy -s 0 -e trace=write,pwrite64,writev,pwritev,fsync,fdatasync \
      -o "$sync_test_root/baseline-trace-$MIDORI_SYNC_BASELINE_BACKEND-$MIDORI_SYNC_BASELINE_COUNT-$MIDORI_SYNC_BASELINE_SIDE")
  fi
  if ! "${sync_native_prefix[@]}" python3.11 ./mach python -- testing/xpcshell/runxpcshelltests.py \
    --headless --sequential --verbose --no-logfiles \
    --log-raw "$sync_native_raw" \
    --xpcshell "$sync_object/dist/bin/xpcshell" \
    --xre-path "$sync_object/dist/bin" \
    --app-path "$sync_object/dist/bin/browser" \
    --build-info-json "$sync_object/mozinfo.json" \
    --testing-modules-dir "$sync_object/_tests/modules" \
    --utility-path "$sync_object/dist/bin" \
    --temp-dir "$sync_test_root" --manifest "$sync_manifest" "$@"; then
    return 1
  fi
  python3.11 "$sync_repository/scripts/check-sync-ui.py" "$sync_native_raw" "$sync_manifest"
}

if [[ $sync_test_mode == password-baseline ]]; then
  python3.11 - "$MIDORI_SYNC_BASELINE_PROFILE_ROOT" "$sync_test_archive/baseline-environment.json" <<'PY'
import json
import os
from pathlib import Path
import platform
import re
import time
import configparser
import sys

profile = Path(sys.argv[1]).resolve()
mounts = []
for line in Path("/proc/self/mountinfo").read_text().splitlines():
    location, kind = line.split(" - ", 1)
    mount = location.split()[4]
    if str(profile) == mount or str(profile).startswith(mount.rstrip("/") + "/"):
        mounts.append((len(mount), kind.split()[0]))
cpu = re.search(r"^model name\s*:\s*(.+)$", Path("/proc/cpuinfo").read_text(), re.M)
memory = re.search(r"^MemTotal:\s+(\d+)", Path("/proc/meminfo").read_text(), re.M)
application = configparser.ConfigParser()
application.read("obj-x86_64-pc-linux-gnu/dist/bin/application.ini")
report = {"kernel": platform.release(), "architecture": platform.machine(),
          "cpu_model": cpu.group(1) if cpu else None, "logical_cpus": os.cpu_count(),
          "memory_bytes": int(memory.group(1)) * 1024, "load_average_start": os.getloadavg(),
          "profile_filesystem": max(mounts)[1], "build_id": application["App"]["BuildID"],
          "started_at_unix": time.time(), "transport": "http-loopback-8000", "concurrency": 1,
          "profiled": os.environ.get("MIDORI_SYNC_BASELINE_PROFILER") == "1",
          "traced": os.environ.get("MIDORI_SYNC_BASELINE_TRACE") == "1",
          "journal_page_size": int(os.environ.get("MIDORI_SYNC_BASELINE_PAGE_SIZE", "4096")),
          "scope": "native password engine; no UI, scheduler delay or server CPU measurement"}
Path(sys.argv[2]).write_text(json.dumps(report, indent=2) + "\n")
PY
  chmod 600 "$sync_test_archive/baseline-environment.json"
  export MIDORI_SYNC_BASELINE_CLK_TCK
  MIDORI_SYNC_BASELINE_CLK_TCK=$(python3.11 -c 'import os; print(os.sysconf("SC_CLK_TCK"))')
  read -r -a sync_baseline_counts <<< "${MIDORI_SYNC_BASELINE_COUNTS:-10 100 250}"
  if [[ ${#sync_baseline_counts[@]} == 0 ]]; then exit 2; fi
  for sync_baseline_count in "${sync_baseline_counts[@]}"; do
    if [[ ! $sync_baseline_count =~ ^[1-9][0-9]{0,3}$ ]] || ((sync_baseline_count > 1000)); then
      printf 'Invalid native baseline record count.\n' >&2
      exit 2
    fi
  done
  for sync_baseline_backend in json rust; do
    for sync_baseline_count in "${sync_baseline_counts[@]}"; do
      export MIDORI_SYNC_BASELINE_COUNT=$sync_baseline_count
      export MIDORI_SYNC_BASELINE_BACKEND=$sync_baseline_backend
      export MIDORI_SYNC_BASELINE_STATE="$sync_test_root/baseline-$sync_baseline_backend-$sync_baseline_count-state.json"
      export MIDORI_SYNC_BASELINE_REPORT="$sync_test_root/baseline-$sync_baseline_backend-$sync_baseline_count-report.json"
      export MIDORI_SYNC_BASELINE_FIXTURE="/tmp/midori-sync-h1-${sync_profile_prefix,,}-baseline-$sync_baseline_backend-$sync_baseline_count.json"
      if ! (cd "$sync_repository/midori-sync" && php artisan sync:test-account --fresh \
        --output="$MIDORI_SYNC_BASELINE_FIXTURE" --base-url=http://127.0.0.1:8000) \
        > "$sync_test_root/baseline-$sync_baseline_backend-$sync_baseline_count-fixture.log" 2>&1; then
        printf 'Could not prepare the isolated native baseline fixture.\n' >&2
        exit 1
      fi
      sync_baseline_rust=false
      if [[ $sync_baseline_backend == rust ]]; then sync_baseline_rust=true; fi
      for sync_baseline_side in A B; do
        export MIDORI_SYNC_BASELINE_SIDE=$sync_baseline_side
        sync_baseline_profile="$sync_profile_prefix-baseline-$sync_baseline_backend-$sync_baseline_count-$sync_baseline_side"
        if [[ ${MIDORI_SYNC_BASELINE_PROFILER:-0} == 1 ]]; then
          export MOZ_PROFILER_STARTUP=1 MOZ_PROFILER_STARTUP_FEATURES=js,stackwalk,fileio
          export MOZ_PROFILER_STARTUP_FILTERS='*' MOZ_PROFILER_STARTUP_ENTRIES=1000000 MOZ_PROFILER_STARTUP_INTERVAL=1
          export MOZ_PROFILER_SHUTDOWN="$sync_test_root/baseline-profile-$sync_baseline_backend-$sync_baseline_count-$sync_baseline_side.json"
        fi
        if ! run_sync_manifest "$sync_repository/engine/browser/components/sync/test/integration/password-baseline.toml" \
          --profile-name "$sync_baseline_profile" \
          --setpref "signon.storage.rust.enabled=$sync_baseline_rust" \
          --setpref "signon.storage.rust.active=$sync_baseline_rust" \
          > "$sync_test_root/baseline-$sync_baseline_backend-$sync_baseline_count-$sync_baseline_side.log" 2>&1; then
          printf 'Native password baseline failed. See %s\n' "$sync_test_root" >&2
          exit 1
        fi
        if [[ ${MIDORI_SYNC_BASELINE_PROFILER:-0} == 1 ]]; then
          if [[ ! -s $MOZ_PROFILER_SHUTDOWN ]]; then
            printf 'Native profiler did not produce its shutdown artifact.\n' >&2
            exit 1
          fi
          cp -- "$MOZ_PROFILER_SHUTDOWN" "$sync_test_archive/"
          chmod 600 "$sync_test_archive/$(basename "$MOZ_PROFILER_SHUTDOWN")"
        fi
        rm -rf -- "${TMPDIR:-/tmp}/$sync_baseline_profile"
      done
      python3.11 "$sync_repository/scripts/check-sync-baseline.py" "$MIDORI_SYNC_BASELINE_REPORT" \
        "$sync_baseline_backend" "$sync_baseline_count" "${MIDORI_SYNC_BASELINE_PAGE_SIZE:-4096}" >> "$sync_test_root/baseline-summary.jsonl"
      cp -- "$MIDORI_SYNC_BASELINE_REPORT" "$sync_test_archive/"
      chmod 600 "$sync_test_archive/$(basename "$MIDORI_SYNC_BASELINE_REPORT")"
      rm -f -- "$MIDORI_SYNC_BASELINE_STATE" "$MIDORI_SYNC_BASELINE_REPORT"
      printf 'Native password baseline passed: %s %s records\n' "$sync_baseline_backend" "$sync_baseline_count"
    done
  done
fi

if [[ $sync_test_mode == *convergence* ]]; then
  export MIDORI_SYNC_CONVERGENCE_FAMILY=passwords
  if [[ $sync_test_mode == card-* ]]; then export MIDORI_SYNC_CONVERGENCE_FAMILY=credit-cards; fi
  sync_convergence_transport=simulated
  export MIDORI_SYNC_CONVERGENCE_FIXTURE=
  if [[ $sync_test_mode == *-live ]]; then sync_convergence_transport=http-8000; fi
  sync_convergence_cases=0
  read -r -a sync_convergence_pairs <<< "${MIDORI_SYNC_CONVERGENCE_PAIRS:-json-json rust-rust json-rust rust-json}"
  sync_convergence_seen=" "
  for sync_convergence_pair in "${sync_convergence_pairs[@]}"; do
    case "$sync_convergence_pair" in
      json-json|rust-rust|json-rust|rust-json) ;;
      *) printf 'Invalid native identity backend pair.\n' >&2; exit 2 ;;
    esac
    if [[ $sync_convergence_seen == *" $sync_convergence_pair "* ]]; then
      printf 'Repeated native identity backend pair.\n' >&2
      exit 2
    fi
    sync_convergence_seen+="$sync_convergence_pair "
  done
  for sync_convergence_pair in "${sync_convergence_pairs[@]}"; do
    IFS=- read -r sync_convergence_a sync_convergence_b <<< "$sync_convergence_pair"
    for sync_convergence_order in forward reverse; do
      export MIDORI_SYNC_CONVERGENCE_ORDER=$sync_convergence_order
      sync_convergence_case="$sync_convergence_pair-$sync_convergence_order"
      if [[ -n ${MIDORI_SYNC_CONVERGENCE_CASE:-} && $MIDORI_SYNC_CONVERGENCE_CASE != "$sync_convergence_case" ]]; then
        continue
      fi
      sync_convergence_cases=$((sync_convergence_cases + 1))
      sync_convergence_label="$MIDORI_SYNC_CONVERGENCE_FAMILY-$sync_convergence_case"
      export MIDORI_SYNC_CONVERGENCE_STATE="$sync_test_root/convergence-$sync_convergence_label.json"
      if [[ $sync_convergence_transport == http-8000 ]]; then
        export MIDORI_SYNC_CONVERGENCE_FIXTURE="/tmp/midori-sync-h1-${sync_profile_prefix,,}-$sync_convergence_label.json"
        if ! (cd "$sync_repository/midori-sync" && php artisan sync:test-account --fresh \
          --output="$MIDORI_SYNC_CONVERGENCE_FIXTURE" --base-url=http://127.0.0.1:8000) \
          > "$sync_test_root/convergence-$sync_convergence_label-fixture.log" 2>&1; then
          printf 'Could not prepare the isolated live identity fixture.\n' >&2
          exit 1
        fi
      fi
      for sync_convergence_stage in seed 1 2 3 4 5 edit 6 7 delete 8 9; do
        export MIDORI_SYNC_CONVERGENCE_STAGE=$sync_convergence_stage
        for sync_convergence_side in A B; do
          export MIDORI_SYNC_CONVERGENCE_SIDE=$sync_convergence_side
          export MIDORI_SYNC_CONVERGENCE_BACKUP="$sync_test_root/convergence-$sync_convergence_label-$sync_convergence_side-backup"
          export MIDORI_SYNC_CONVERGENCE_BACKEND=$sync_convergence_a
          if [[ $sync_convergence_side == B ]]; then
            export MIDORI_SYNC_CONVERGENCE_BACKEND=$sync_convergence_b
          fi
          sync_convergence_rust=false
          if [[ $MIDORI_SYNC_CONVERGENCE_BACKEND == rust ]]; then sync_convergence_rust=true; fi
          sync_convergence_profile="$sync_profile_prefix-convergence-$sync_convergence_label-$sync_convergence_side-$sync_convergence_stage"
          sync_convergence_pref=signon.storage.rust
          if [[ $MIDORI_SYNC_CONVERGENCE_FAMILY == credit-cards ]]; then
            sync_convergence_pref=extensions.formautofill.creditCards.storage.rust
          fi
          if ! run_sync_manifest "$sync_repository/engine/browser/components/sync/test/integration/identity-convergence.toml" \
            --profile-name "$sync_convergence_profile" \
            --setpref "$sync_convergence_pref.enabled=$sync_convergence_rust" \
            --setpref "$sync_convergence_pref.active=$sync_convergence_rust" \
            > "$sync_test_root/convergence-$sync_convergence_label-$sync_convergence_side-$sync_convergence_stage.log" 2>&1; then
            printf 'Native identity convergence failed (%s %s %s). See %s\n' \
              "$sync_convergence_case" "$sync_convergence_side" "$sync_convergence_stage" "$sync_test_root" >&2
            exit 1
          fi
          rm -rf -- "$MIDORI_SYNC_CONVERGENCE_BACKUP"
          cp -a "${TMPDIR:-/tmp}/$sync_convergence_profile/xpcshellprofile" "$MIDORI_SYNC_CONVERGENCE_BACKUP"
          rm -rf -- "${TMPDIR:-/tmp}/$sync_convergence_profile"
        done
      done
      python3.11 "$sync_repository/scripts/check-sync-identity-convergence.py" "$MIDORI_SYNC_CONVERGENCE_STATE" \
        "$sync_convergence_case" "$MIDORI_SYNC_CONVERGENCE_FAMILY" "$sync_test_root/convergence-$sync_convergence_label-snapshots.jsonl" \
        "$sync_convergence_transport" \
        >> "$sync_test_root/convergence-summary.jsonl"
      rm -f -- "$MIDORI_SYNC_CONVERGENCE_STATE"
      rm -rf -- "$sync_test_root/convergence-$sync_convergence_label-A-backup" "$sync_test_root/convergence-$sync_convergence_label-B-backup"
      printf 'Native identity convergence passed: %s\n' "$sync_convergence_label"
    done
  done
  if [[ $sync_convergence_cases == 0 ]]; then
    printf 'No native identity convergence case matched the requested selection.\n' >&2
    exit 2
  fi
fi

if [[ $sync_test_mode == bindings ]]; then
  sync_bindings_manifest="$sync_repository/engine/toolkit/components/uniffi-bindgen-gecko-js/tests/xpcshell/xpcshell.toml"
  if ! run_sync_manifest "$sync_bindings_manifest" > "$sync_test_root/bindings.log" 2>&1; then
    printf 'Native UniFFI bindings validation failed. See %s/bindings.log\n' "$sync_test_root" >&2
    exit 1
  fi
  python3.11 "$sync_repository/scripts/check-sync-ui.py" "$sync_test_root/native-manifest-1.jsonl" \
    "$sync_bindings_manifest" > "$sync_test_root/bindings-verification.log" 2>&1
  printf 'Native UniFFI bindings validation passed: %s/bindings.log\n' "$sync_test_root"
fi

if [[ $sync_test_mode == storage ]]; then
  cat > "$sync_test_root/storage.toml" <<'TOML'
["test_passwords.js"]
["test_passwords_rust.js"]
["test_credit_cards.js"]
["test_credit_cards_rust.js"]
["test_persistence.js"]
["test_preference_persistence.js"]
TOML
  cat > "$sync_test_root/preferences.toml" <<'TOML'
["browser_sync_preference_persistence.js"]
TOML
  if ! python3.11 ./mach xpcshell-test --force --headless --sequential --verbose \
    --log-raw "$sync_test_root/storage.jsonl" \
    browser/components/sync/test/unit/test_passwords.js \
    browser/components/sync/test/unit/test_passwords_rust.js \
    browser/components/sync/test/unit/test_credit_cards.js \
    browser/components/sync/test/unit/test_credit_cards_rust.js \
    browser/components/sync/test/unit/test_persistence.js \
    browser/components/sync/test/unit/test_preference_persistence.js > "$sync_test_root/storage.log" 2>&1; then
    printf 'Native storage validation failed. See %s/storage.log\n' "$sync_test_root" >&2
    exit 1
  fi
  python3.11 "$sync_repository/scripts/check-sync-ui.py" "$sync_test_root/storage.jsonl" \
    "$sync_test_root/storage.toml" > "$sync_test_root/storage-verification.log" 2>&1
  if ! python3.11 ./mach mochitest --force --headless --log-raw "$sync_test_root/preferences.jsonl" \
    browser/components/sync/test/browser/browser_sync_preference_persistence.js > "$sync_test_root/preferences.log" 2>&1; then
    printf 'Native preference persistence failed. See %s/preferences.log\n' "$sync_test_root" >&2
    exit 1
  fi
  python3.11 "$sync_repository/scripts/check-sync-ui.py" "$sync_test_root/preferences.jsonl" \
    "$sync_test_root/preferences.toml" > "$sync_test_root/preferences-verification.log" 2>&1
  printf 'Native storage validation passed: %s/storage.log\n' "$sync_test_root"
fi

if [[ $sync_test_mode == conflicts ]]; then
  if ! python3.11 ./mach mochitest --force --headless --log-raw "$sync_test_root/conflicts.jsonl" \
    browser/components/sync/test/browser/browser_sync_native_conflicts.js > "$sync_test_root/conflicts.log" 2>&1; then
    printf 'Native conflict resolution failed. See %s/conflicts.log\n' "$sync_test_root" >&2
    exit 1
  fi
  printf 'Native conflict resolution passed: %s/conflicts.log\n' "$sync_test_root"
fi

if [[ $sync_test_mode == pause ]]; then
  if ! python3.11 ./mach xpcshell-test --force --headless --sequential --verbose \
    browser/components/sync/test/unit/test_pause.js \
    browser/components/sync/test/unit/test_sync_now.js > "$sync_test_root/pause.log" 2>&1; then
    printf 'Native pause validation failed. See %s/pause.log\n' "$sync_test_root" >&2
    exit 1
  fi
  printf 'Native pause validation passed: %s/pause.log\n' "$sync_test_root"
fi

if [[ $sync_test_mode == workspaces ]]; then
  if ! python3.11 ./mach xpcshell-test --force --headless --sequential --verbose \
    browser/components/sync/test/unit/test_workspaces.js > "$sync_test_root/workspaces.log" 2>&1; then
    printf 'Native workspace validation failed. See %s/workspaces.log\n' "$sync_test_root" >&2
    exit 1
  fi
  printf 'Native workspace validation passed: %s/workspaces.log\n' "$sync_test_root"
fi

if [[ $sync_test_mode == extension-policies ]]; then
  sync_policy_manifest=$(mktemp "$sync_repository/engine/obj-x86_64-pc-linux-gnu/_tests/xpcshell/browser/components/enterprisepolicies/tests/xpcshell/midori-sync-policies-XXXXXX.toml")
  cat > "$sync_policy_manifest" <<'TOML'
[DEFAULT]
firefox-appdir = "browser"
midori-appdir = "browser"
head = "head.js"
prefs = ["extensions.experiments.enabled=false", "xpinstall.signatures.required=true", "dom.security.https_only_mode=false", "dom.security.https_only_mode_pbm=false", "dom.security.https_first=false", "dom.security.https_first_pbm=false"]
["test_extensionsettings.js"]
["test_extensions_uninstall.js"]
TOML
  cp -- "$sync_policy_manifest" "$sync_test_root/extension-policies.toml"
  if ! run_sync_manifest "$sync_policy_manifest" > "$sync_test_root/extension-policies.log" 2>&1; then
    printf 'Native extension policies failed. See %s/extension-policies.log\n' "$sync_test_root" >&2
    exit 1
  fi
  printf 'Native extension policies passed: %s/extension-policies.log\n' "$sync_test_root"
fi

if [[ $sync_test_mode == extensions || $sync_test_mode == extension-settings ]]; then
  sync_extensions_unit_file=test_extension_persistence.js
  if [[ $sync_test_mode == extension-settings ]]; then sync_extensions_unit_file=test_extension_settings_storage.js; fi
  printf '["%s"]\n' "$sync_extensions_unit_file" > "$sync_test_root/extensions.toml"
  if ! python3.11 ./mach xpcshell-test --force --headless --sequential --verbose \
    --log-raw "$sync_test_root/extensions.jsonl" \
    "browser/components/sync/test/unit/$sync_extensions_unit_file" > "$sync_test_root/extensions.log" 2>&1; then
    printf 'Native extension persistence failed. See %s/extensions.log\n' "$sync_test_root" >&2
    exit 1
  fi
  python3.11 "$sync_repository/scripts/check-sync-ui.py" "$sync_test_root/extensions.jsonl" \
    "$sync_test_root/extensions.toml" > "$sync_test_root/extensions-verification.log" 2>&1
  printf 'Native extension persistence passed: %s/extensions.log\n' "$sync_test_root"
fi

if [[ $sync_test_mode == permissions-ui || $sync_test_mode == extensions-ui ]]; then
  sync_interface_family=permissions
  if [[ $sync_test_mode == extensions-ui ]]; then sync_interface_family=extensions; fi
  printf '["browser_sync_%s.js"]\n' "$sync_interface_family" > "$sync_test_root/$sync_test_mode.toml"
  if ! python3.11 ./mach mochitest --force --headless --log-raw "$sync_test_root/$sync_test_mode.jsonl" \
    "browser/components/sync/test/browser/browser_sync_$sync_interface_family.js" > "$sync_test_root/$sync_test_mode.log" 2>&1; then
    printf 'Sync %s interface validation failed. See %s/%s.log\n' "$sync_interface_family" "$sync_test_root" "$sync_test_mode" >&2
    exit 1
  fi
  python3.11 "$sync_repository/scripts/check-sync-ui.py" "$sync_test_root/$sync_test_mode.jsonl" \
    "$sync_test_root/$sync_test_mode.toml" > "$sync_test_root/$sync_test_mode-verification.log" 2>&1
  printf 'Sync %s interface validation passed: %s/%s.log\n' "$sync_interface_family" "$sync_test_root" "$sync_test_mode"
fi

if [[ $sync_test_mode == permissions ]]; then
  cat > "$sync_test_root/permissions.toml" <<'TOML'
["test_permission_persistence.js"]
["test_permissions.js"]
TOML
  if ! python3.11 ./mach xpcshell-test --force --headless --sequential --verbose \
    --log-raw "$sync_test_root/permissions.jsonl" \
    browser/components/sync/test/unit/test_permission_persistence.js \
    browser/components/sync/test/unit/test_permissions.js > "$sync_test_root/permissions.log" 2>&1; then
    printf 'Native permission validation failed. See %s/permissions.log\n' "$sync_test_root" >&2
    exit 1
  fi
  python3.11 "$sync_repository/scripts/check-sync-ui.py" "$sync_test_root/permissions.jsonl" \
    "$sync_test_root/permissions.toml" > "$sync_test_root/permissions-verification.log" 2>&1
  printf 'Native permission validation passed: %s/permissions.log\n' "$sync_test_root"
fi

if [[ $sync_test_mode == extensions-live || $sync_test_mode == extensions-catalog || $sync_test_mode == extension-settings-live ]]; then
  sync_extensions_options=()
  sync_extensions_driver="$sync_repository/scripts/test-sync-extensions-live.py"
  if [[ $sync_test_mode == extension-settings-live ]]; then sync_extensions_driver="$sync_repository/scripts/test-sync-extension-settings-live.py"; fi
  if [[ $sync_test_mode == extensions-live || $sync_test_mode == extension-settings-live ]]; then
    sync_extensions_fixture="/tmp/midori-sync-h1-extensions-${sync_test_root##*-}.json"
    sync_extensions_fixture=${sync_extensions_fixture,,}
    if ! (cd "$sync_repository/midori-sync" && php artisan sync:test-account --fresh \
      --output="$sync_extensions_fixture" --base-url=http://127.0.0.1:8000) > "$sync_test_root/extensions-live-fixture.log" 2>&1; then
      printf 'Could not prepare the synthetic extension account on 8000. See %s/extensions-live-fixture.log\n' "$sync_test_root" >&2
      exit 1
    fi
    export MIDORI_SYNC_TEST_FIXTURE="$sync_extensions_fixture"
  else
    sync_extensions_options=(--catalog)
  fi
  if ! python3.11 ./mach python -- "$sync_extensions_driver" \
    --root "$sync_test_root" "${sync_extensions_options[@]}" > "$sync_test_root/extensions-live.log" 2>&1; then
    printf 'Native extension validation failed (%s). See %s/extensions-live.log\n' "$sync_test_mode" "$sync_test_root" >&2
    exit 1
  fi
  printf 'Native extension validation passed (%s): %s/extensions-live.log\n' "$sync_test_mode" "$sync_test_root"
fi

if [[ $sync_test_mode == durability || $sync_test_mode == privacy-durability || $sync_test_mode == permissions-durability || $sync_test_mode == extensions-durability ]]; then
  sync_durability_options=()
  if [[ $sync_test_mode == privacy-durability ]]; then
    sync_durability_options=(--privacy-filters)
  elif [[ $sync_test_mode == permissions-durability ]]; then
    sync_durability_options=(--site-permissions)
  elif [[ $sync_test_mode == extensions-durability ]]; then
    sync_durability_options=(--extensions)
  fi
  if ! python3.11 ./mach python -- "$sync_repository/scripts/test-sync-durability.py" \
    --root "$sync_test_root" "${sync_durability_options[@]}" > "$sync_test_root/durability.log" 2>&1; then
    printf 'Native durability failed. See %s/durability.log\n' "$sync_test_root" >&2
    exit 1
  fi
  printf 'Native durability after SIGKILL passed (%s): %s/durability.log\n' "$sync_test_mode" "$sync_test_root"
fi

if [[ $sync_test_mode == backend || $sync_test_mode == profiles || $sync_test_mode == h1 || $sync_test_mode == h1-live || $sync_test_mode == h4-* ]]; then
  if [[ ! -f ${MIDORI_SYNC_TEST_FIXTURE:-} ]]; then
    if [[ $sync_test_mode == h1 || $sync_test_mode == h1-live || $sync_test_mode == h4-* ]]; then
      printf 'Set MIDORI_SYNC_TEST_FIXTURE to a fresh sync:test-account --fresh fixture from the existing backend.\n' >&2
    else
      printf 'Run npm run test:sync -- --native to prepare isolated Laravel fixtures.\n' >&2
    fi
    exit 2
  fi
fi

if [[ $sync_test_mode == h4-* ]]; then
  sync_h4_scenario=${sync_test_mode#h4-}
  if [[ $sync_h4_scenario == offline ]]; then sync_h4_scenario=recovery; fi
  if ! python3.11 ./mach python -- "$sync_repository/scripts/test-sync-offline.py" \
    --root "$sync_test_root" --scenario "$sync_h4_scenario" > "$sync_test_root/offline-browser.log" 2>&1; then
    printf 'Native browser offline validation failed. See %s/offline-browser.log\n' "$sync_test_root" >&2
    exit 1
  fi
  printf 'Automatic native browser capture and %s validation passed: %s\n' "$sync_h4_scenario" "$sync_test_root"
fi

if [[ $sync_test_mode == h1 || $sync_test_mode == h1-live ]]; then
  export MIDORI_SYNC_TEST_BACKEND_DIR="$sync_repository/midori-sync"
  sync_h1_log_root="$sync_repository/artifacts/h1-$(basename "$sync_test_root")"
  mkdir -m 700 "$sync_h1_log_root"
  if [[ $sync_test_mode == h1 ]] && ! python3.11 ./mach xpcshell-test --headless --sequential --verbose \
    toolkit/components/midori-sync/tests/test_crypto_native.js \
    browser/components/sync/test/unit/test_history_model.js \
    browser/components/sync/test/unit/test_account.js > "$sync_h1_log_root/crypto-history.log" 2>&1; then
    printf 'H1 crypto/history failed. See %s/crypto-history.log\n' "$sync_h1_log_root" >&2
    exit 1
  fi
  if ! run_sync_manifest "$sync_repository/engine/browser/components/sync/test/integration/h1-live.toml" > "$sync_h1_log_root/live-backend.log" 2>&1; then
    printf 'H1 live integration failed. See %s/live-backend.log\n' "$sync_h1_log_root" >&2
    exit 1
  fi
  if [[ $sync_test_mode == h1 ]] && ! python3.11 ./mach mochitest --headless --log-raw "$sync_h1_log_root/keys-panel.jsonl" \
    browser/components/sync/test/browser/browser_sync_keys.js > "$sync_h1_log_root/keys-panel.log" 2>&1; then
    printf 'H1 recovery UI failed. See %s/keys-panel.log\n' "$sync_h1_log_root" >&2
    exit 1
  fi
  if [[ $sync_test_mode == h1 ]]; then
    printf 'H1 Linux crypto, history, live backend and recovery UI passed: %s\n' "$sync_h1_log_root"
  else
    printf 'H1 Linux live backend integration passed: %s\n' "$sync_h1_log_root"
  fi
fi

if [[ $sync_test_mode == backend ]]; then
  if ! run_sync_manifest "$sync_repository/engine/browser/components/sync/test/integration/xpcshell.toml" > "$sync_test_root/backend.log" 2>&1; then
    printf 'Native backend tests failed. See %s/backend.log\n' "$sync_test_root" >&2
    exit 1
  fi
  printf 'Native Laravel integration passed: %s/backend.log\n' "$sync_test_root"
fi

if [[ $sync_test_mode == profiles ]]; then
  if ! python3.11 ./mach python -- "$sync_repository/scripts/test-sync-primary-profiles.py" \
    --root "$sync_test_root" > "$sync_test_root/primary-profiles.log" 2>&1; then
    printf 'Native browser profiles failed. See %s/primary-profiles.log\n' "$sync_test_root" >&2
    exit 1
  fi
  printf 'Primary browser profiles passed: %s/primary-profiles.log\n' "$sync_test_root"
fi

if [[ $sync_test_mode == profiles-xpcshell ]]; then
  export MIDORI_SYNC_PROFILE_STATE_FILE="$sync_test_root/profile-state.json"
  export MIDORI_SYNC_PROFILE_BACKUP_DIR="$sync_test_root/profile-A-backup"
  export MIDORI_SYNC_PROFILE_B_BACKUP_DIR="$sync_test_root/profile-B-backup"
  export MIDORI_SYNC_PROFILE_LEGACY_BACKUP_DIR="$sync_test_root/profile-A-legacy-backup"
  export MIDORI_SYNC_PROFILE_RESTART_BACKUP_DIR="$sync_test_root/profile-E-backup"
  export MIDORI_SYNC_PROFILE_STATUS_FILE="$sync_test_root/profile-status.json"
  for sync_profile_stage in A B G H E F C D; do
    export MIDORI_SYNC_PROFILE_STAGE="$sync_profile_stage"
    if ! run_sync_manifest "$sync_repository/engine/browser/components/sync/test/integration/profiles.toml" --profile-name "$sync_profile_prefix-$sync_profile_stage" > "$sync_test_root/profile-$sync_profile_stage.log" 2>&1; then
      printf 'Native profile %s failed. See %s/profile-%s.log\n' "$sync_profile_stage" "$sync_test_root" "$sync_profile_stage" >&2
      exit 1
    fi
    if [[ $sync_profile_stage == A ]]; then
      sync_profile_source="${TMPDIR:-/tmp}/$sync_profile_prefix-A/xpcshellprofile"
      if [[ ! -d $sync_profile_source ]]; then
        printf 'Native profile A was not retained by xpcshell: %s\n' "$sync_profile_source" >&2
        exit 1
      fi
      cp -a "$sync_profile_source" "$MIDORI_SYNC_PROFILE_BACKUP_DIR"
    elif [[ $sync_profile_stage == B ]]; then
      sync_profile_source="${TMPDIR:-/tmp}/$sync_profile_prefix-B/xpcshellprofile"
      if [[ ! -d $sync_profile_source ]]; then
        printf 'Native profile B was not retained by xpcshell: %s\n' "$sync_profile_source" >&2
        exit 1
      fi
      cp -a "$sync_profile_source" "$MIDORI_SYNC_PROFILE_B_BACKUP_DIR"
      cp -a "$MIDORI_SYNC_PROFILE_BACKUP_DIR" "$MIDORI_SYNC_PROFILE_LEGACY_BACKUP_DIR"
      printf '%s\n' '{"version":1,"accountData":{"uid":"synthetic-fxa-uid","email":"legacy@example.invalid","sessionToken":"synthetic-fxa-session","verified":true}}' > "$MIDORI_SYNC_PROFILE_LEGACY_BACKUP_DIR/signedInUser.json"
      chmod 600 "$MIDORI_SYNC_PROFILE_LEGACY_BACKUP_DIR/signedInUser.json"
    elif [[ $sync_profile_stage == E ]]; then
      sync_profile_source="${TMPDIR:-/tmp}/$sync_profile_prefix-E/xpcshellprofile"
      if [[ ! -d $sync_profile_source ]]; then
        printf 'Native profile E was not retained by xpcshell: %s\n' "$sync_profile_source" >&2
        exit 1
      fi
      cp -a "$sync_profile_source" "$MIDORI_SYNC_PROFILE_RESTART_BACKUP_DIR"
    fi
  done
  printf 'Native Gecko profiles passed against Laravel with code recovery, persisted status, tabs, preferences and rejection of unauthenticated history clear: %s/profile-{A,B,G,H,E,F,C,D}.log\n' "$sync_test_root"
fi

if [[ $sync_test_mode == vault-nss ]]; then
  mkdir -m 700 "$sync_test_root/nss-backend"
  cc -shared -fPIC -x c -o "$sync_test_root/nss-backend/libsecret-1.so.0" - <<'C'
void midori_sync_test_libsecret_unavailable(void) {}
C
  export LD_LIBRARY_PATH="$sync_test_root/nss-backend${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  export MIDORI_SYNC_TEST_EXPECT_NSS=1
fi

if [[ $sync_test_mode == all || $sync_test_mode == vault || $sync_test_mode == vault-nss ]]; then
  if ! python3.11 ./mach xpcshell-test --force --headless --sequential --verbose \
    --log-raw "$sync_test_root/xpcshell.jsonl" browser/components/sync/test/unit > "$sync_test_root/xpcshell.log" 2>&1; then
    printf 'Native tests failed. See %s/xpcshell.log\n' "$sync_test_root" >&2
    exit 1
  fi
  python3.11 "$sync_repository/scripts/check-sync-ui.py" "$sync_test_root/xpcshell.jsonl" \
    "$sync_repository/src/browser/components/sync/test/unit/xpcshell.toml" > "$sync_test_root/xpcshell-verification.log" 2>&1
  printf 'Native account, vault and transport tests passed: %s/xpcshell.log\n' "$sync_test_root"
fi

if [[ $sync_test_mode == all || $sync_test_mode == popup || $sync_test_mode == pause || $sync_test_mode == workspaces ]]; then
  if ! python3.11 ./mach mochitest --force --headless --log-raw "$sync_test_root/popup.jsonl" browser/components/sync/test/browser > "$sync_test_root/popup.log" 2>&1; then
    printf 'Popup tests failed. See %s/popup.log\n' "$sync_test_root" >&2
    exit 1
  fi
  python3.11 "$sync_repository/scripts/check-sync-ui.py" "$sync_test_root/popup.jsonl" \
    "$sync_repository/src/browser/components/sync/test/browser/browser.toml" > "$sync_test_root/popup-verification.log" 2>&1
  printf 'Native popup tests passed: %s/popup.log\n' "$sync_test_root"
fi
