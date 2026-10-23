#!/usr/bin/env python3

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys


PROJECT_DIR = Path(__file__).resolve().parent.parent


def cargo_metadata(engine, locked=True):
    vendor = (engine / "third_party/rust").as_posix()
    command = [
        os.environ.get("CARGO", "cargo"),
        "metadata",
        "--format-version", "1",
        "--offline",
        "--manifest-path", str(engine / "Cargo.toml"),
        "--config", str(engine / ".cargo/config.toml.in"),
        "--config", f"source.vendored-sources.directory={json.dumps(vendor)}",
    ]
    if locked:
        command.append("--locked")
    result = subprocess.run(command, cwd=engine, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(
            f"{result.stderr.strip()}\n"
            "Rust dependency resolution failed. After updating Firefox or Rust "
            "dependencies, run npm run rust:refresh and review src/Cargo.lock."
        )
    return json.loads(result.stdout)


def verify_vendor_overlays(metadata, engine, source):
    vendor = engine / "third_party/rust"
    checked = 0
    for package in metadata["packages"]:
        directory = Path(package["manifest_path"]).parent
        if not directory.is_relative_to(vendor):
            continue
        relative = directory.relative_to(vendor)
        if not (source / "third_party/rust" / relative / "Cargo.toml").is_file():
            continue
        checksums = json.loads((directory / ".cargo-checksum.json").read_text())
        for name, expected in checksums["files"].items():
            file = directory / name
            if not file.is_file():
                raise RuntimeError(f"Missing vendored file: {file}")
            actual = hashlib.sha256(file.read_bytes()).hexdigest()
            if actual != expected:
                raise RuntimeError(f"Vendored checksum mismatch: {file}")
            checked += 1
    return checked


def refresh_lock(engine, source):
    result = subprocess.run(
        ["git", "show", "HEAD:Cargo.lock"], cwd=engine, capture_output=True
    )
    if result.returncode:
        raise RuntimeError("Refreshing Cargo.lock requires the original Firefox Git checkout.")
    lock = engine / "Cargo.lock"
    source_lock = source / "Cargo.lock"
    previous_lock = lock.read_bytes()
    previous_source = source_lock.read_bytes()
    try:
        lock.write_bytes(result.stdout)
        metadata = cargo_metadata(engine, locked=False)
        verify_vendor_overlays(metadata, engine, source)
        source_lock.write_bytes(lock.read_bytes())
    except BaseException:
        lock.write_bytes(previous_lock)
        source_lock.write_bytes(previous_source)
        raise


def main():
    parser = argparse.ArgumentParser(description="Check Firefox and Midori Rust dependencies offline.")
    parser.add_argument(
        "--refresh", action="store_true",
        help="Rebase Midori's lock file on the original Firefox lock and resolve offline.",
    )
    args = parser.parse_args()
    engine = PROJECT_DIR / "engine"
    source = PROJECT_DIR / "src"
    try:
        if args.refresh:
            refresh_lock(engine, source)
        metadata = cargo_metadata(engine)
        checked = verify_vendor_overlays(metadata, engine, source)
    except (OSError, ValueError, RuntimeError) as error:
        print(f"[rust-integrity] ERROR: {error}", file=sys.stderr)
        return 1
    print(
        f"[rust-integrity] OK: {len(metadata['packages'])} resolved packages; "
        f"{checked} Midori vendor file checksums verified."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
