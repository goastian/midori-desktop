#!/usr/bin/env python3

import hashlib
from pathlib import Path
import subprocess
import sys


LEGACY_CLASSIFIER_OVERLAYS = {
    "Cargo.toml": "0066f11f2fd0f45e3aa90741ba05b1f2ead4af8d46f4a63a42a1cb0bcc90424c",
    "ContentClassifierEngine.h": "dbac942ba22130a727c44e86d8c8884a4d927bb410ed4e72acda3a6de827869d",
    "ContentClassifierEngine.cpp": "f8185eb6b315f98939aa85afd9284957787f1b20574e10e8ba37eb8cf9670c52",
    "src/lib.rs": "35923e6fdf5c8f3f0c5c6550ea0be6e28a0b6c2593694c913f41947798aae5bc",
}
CLASSIFIER_PATH = Path("toolkit/components/content-classifier/content_classifier_engine")


def restore_classifier_overlays(project):
    engine = project / "engine"
    for name, checksum in LEGACY_CLASSIFIER_OVERLAYS.items():
        relative = CLASSIFIER_PATH / name
        file = engine / relative
        source = project / "src" / relative
        if file.is_symlink():
            if file.resolve() != source or source.exists():
                continue
        elif not file.is_file() or hashlib.sha256(
            file.read_bytes().replace(b"\r\n", b"\n")
        ).hexdigest() != checksum:
            continue
        original = subprocess.run(
            ["git", "show", f"HEAD:{relative.as_posix()}"],
            cwd=engine, capture_output=True, check=True,
        ).stdout
        if file.is_symlink():
            file.unlink()
        file.write_bytes(original)
        print(f"[prepare-import] Restored Firefox source: {relative}")


if __name__ == "__main__":
    try:
        project = Path(__file__).resolve().parent.parent
        restore_classifier_overlays(project)
    except (OSError, subprocess.CalledProcessError) as error:
        print(f"[prepare-import] ERROR: {error}", file=sys.stderr)
        sys.exit(1)
