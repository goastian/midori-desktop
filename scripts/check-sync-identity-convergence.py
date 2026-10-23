#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import json
from pathlib import Path
import sys


def verify(state_path, case, family, snapshots_path, transport="simulated"):
    if family not in {"passwords", "credit-cards"}:
        raise ValueError("invalid_convergence_family")
    if transport not in {"simulated", "http-8000"}:
        raise ValueError("invalid_convergence_transport")
    first, second, order = case.split("-")
    if first not in {"json", "rust"} or second not in {"json", "rust"} or order not in {"forward", "reverse"}:
        raise ValueError("invalid_convergence_case")
    state = json.loads(Path(state_path).read_text())
    snapshots = state["snapshots"]
    Path(snapshots_path).write_text("\n".join(json.dumps(row) for row in snapshots) + "\n")
    stages = ["seed", "1", "2", "3", "4", "5", "edit", "6", "7", "delete", "8", "9"]
    expected = [(stage, side) for stage in stages for side in ["A", "B"]]
    if [(row["stage"], row["side"]) for row in snapshots] != expected:
        raise ValueError("incomplete_convergence_processes")
    canonical = "card00000001" if family == "credit-cards" else "{11111111-1111-4111-8111-111111111111}"
    deletion = False
    for row in snapshots:
        if row["family"] != family:
            raise ValueError("unexpected_convergence_family")
        if row["transport"] != transport:
            raise ValueError("unexpected_convergence_transport")
        if row["backend"] != {"A": first, "B": second}[row["side"]]:
            raise ValueError("unexpected_native_backend")
        deletion |= row["stage"] == "delete"
        if row["conflicts"] or row["issues"]:
            raise ValueError("unexpected_identity_conflict")
        if len(row["nativeIds"]) != (0 if deletion else 1) or not row["allExpected"]:
            raise ValueError("native_credential_lost_or_changed")
        if row["stage"] in {"5", "7", "9"} and any(row[key] for key in ["pending", "localChanges", "deferred", "more", "trackerMore"]):
            raise ValueError("convergence_work_remains")
        if row["stage"] in {"5", "7"} and (
            row["nativeIds"] != [canonical] or row["liveRemote"] != [canonical] or row["pending"]
        ):
            raise ValueError("identities_did_not_converge")
        if row["stage"] in {"8", "9"} and (row["liveRemote"] or row["pending"]):
            raise ValueError("deliberate_deletion_did_not_converge")
    return {"family": family, "case": case, "transport": transport, "processes": len(snapshots), "failures": 0}


if __name__ == "__main__":
    try:
        result = verify(*sys.argv[1:])
    except (KeyError, TypeError, ValueError, OSError):
        print("Native identity convergence verification failed; inspect private snapshots.", file=sys.stderr)
        sys.exit(1)
    print(json.dumps(result))
