#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import json
import math
from pathlib import Path
import sys


def numeric(value, positive=False):
    return type(value) in {int, float} and math.isfinite(value) and (value > 0 if positive else value >= 0)


def verify(path, backend, count, page_size=4096):
    count = int(count)
    page_size = int(page_size)
    if backend not in {"json", "rust"} or not 1 <= count <= 1000 or page_size not in {4096, 32768}:
        raise ValueError("invalid_baseline_selection")
    rows = json.loads(Path(path).read_text())
    if not isinstance(rows, list) or [row["side"] for row in rows] != ["A", "B"]:
        raise ValueError("incomplete_baseline_profiles")
    for row in rows:
        if row["backend"] != backend or row["count"] != count or row["nativeRecords"] != count or row["runtime"] != "xpcshell":
            raise ValueError("unexpected_baseline_profile")
        for phase in ["session", "transfer"] + (["seed"] if row["side"] == "A" else []):
            sample = row[phase]
            for field in ["elapsedMs", "cpuMs", "physicalReadBytes", "physicalWriteBytes"]:
                if not numeric(sample[field]):
                    raise ValueError("invalid_baseline_counter")
            for field in ["rssBeforeBytes", "rssAfterBytes", "peakRssBytes"]:
                if not numeric(sample[field], positive=True):
                    raise ValueError("invalid_baseline_memory")
            if sample["peakRssBytes"] < sample["rssAfterBytes"]:
                raise ValueError("invalid_baseline_memory")
        if not numeric(row["logicalRequestJsonBytes"]) or not numeric(row["logicalResponseJsonBytes"], positive=True):
            raise ValueError("invalid_baseline_bytes")
        if not row["calls"] or any(call["route"] not in {"changes", "operations", "ack"}
                                   or not numeric(call["elapsedMs"]) for call in row["calls"]):
            raise ValueError("invalid_baseline_calls")
        for field in ["journalFilesBeforeClose", "journalFilesAfterClose"]:
            if not row[field] or any(not numeric(size) for size in row[field].values()) or sum(row[field].values()) <= 0:
                raise ValueError("invalid_baseline_storage")
        if row.get("journalPageSize") != page_size:
            raise ValueError("unexpected_baseline_page_size")
        operations = sum(call["route"] == "operations" for call in row["calls"])
        if (row["side"] == "A" and operations == 0) or (row["side"] == "B" and operations != 0):
            raise ValueError("unexpected_baseline_operations")
    return {"backend": backend, "records": count, "journal_page_size": page_size, "profiles": 2, "failures": 0}


if __name__ == "__main__":
    try:
        result = verify(*sys.argv[1:])
    except (KeyError, TypeError, ValueError, OSError):
        print("Native baseline verification failed; inspect its private report.", file=sys.stderr)
        sys.exit(1)
    print(json.dumps(result))
