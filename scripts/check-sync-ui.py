#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import json
from pathlib import Path
import sys
import tomllib


def check_sync_ui(log_path, manifest_path):
    manifest = tomllib.loads(Path(manifest_path).read_text())
    expected = {name for name in manifest if name.endswith(".js")}
    per_file = dict.fromkeys(expected, 0)
    starts = []
    ends = []
    assertions = 0
    failures = 0
    for line in Path(log_path).read_text().splitlines():
        event = json.loads(line)
        if not isinstance(event, dict):
            raise ValueError("sync_ui_invalid_log")
        action = event.get("action")
        if action == "test_start":
            starts.append(Path(event["test"]).name)
        elif action == "test_end":
            ends.append(Path(event["test"]).name)
            failures += event.get("status") not in {"PASS", "OK"}
        elif action == "test_status":
            per_file[Path(event["test"]).name] += 1
            assertions += 1
            failures += event.get("status") != "PASS"
    if (
        not expected
        or not assertions
        or not all(per_file.values())
        or failures
        or set(starts) != expected
        or set(ends) != expected
        or len(starts) != len(expected)
        or len(ends) != len(expected)
    ):
        raise ValueError("sync_ui_incomplete_or_failed")
    return {"files": len(expected), "assertions": assertions, "failures": failures}


if __name__ == "__main__":
    try:
        result = check_sync_ui(sys.argv[1], sys.argv[2])
    except (IndexError, KeyError, TypeError, ValueError, OSError):
        print("Sync UI verification failed; inspect the private JSON log.", file=sys.stderr)
        sys.exit(1)
    print(json.dumps(result))
