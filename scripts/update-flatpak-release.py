#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path


APP_ID = "org.astian.midori_browser"
RUNTIME_VERSION = "25.08"


def replace_or_fail(pattern: str, replacement: str, text: str, description: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.MULTILINE)
    if count != 1:
        raise RuntimeError(f"Unable to update {description}")
    return updated


def update_manifest(
    path: Path,
    version: str,
    source_sha: str | None,
    source_commit: str | None,
) -> None:
    text = path.read_text(encoding="utf-8")
    tag = f"v{version}"
    source_url = (
        "https://github.com/goastian/midori-desktop/releases/download/"
        f"{tag}/midori-{version}-src.tar.xz"
    )

    text = replace_or_fail(
        r"(runtime-version:\s*[\"']?)[0-9.]+([\"']?)",
        rf"\g<1>{RUNTIME_VERSION}\2",
        text,
        "runtime-version",
    )
    text = replace_or_fail(
        r"(tag:\s*)v[0-9A-Za-z.\-]+",
        rf"\g<1>{tag}",
        text,
        "source git tag",
    )
    if source_commit:
        text = replace_or_fail(
            r"(commit:\s*)[0-9a-f]{40}",
            rf"\g<1>{source_commit}",
            text,
            "source git commit",
        )
    text = replace_or_fail(
        r"url:\s+https://github\.com/goastian/midori-desktop/releases/download/v[^/]+/midori-[^/\s]+(?:\.source|-src)\.tar\.xz",
        f"url: {source_url}",
        text,
        "source tarball URL",
    )
    if source_sha:
        text = replace_or_fail(
            r"(url:\s+https://github\.com/goastian/midori-desktop/releases/download/v[^/]+/midori-[^/\s]+(?:\.source|-src)\.tar\.xz\n\s+sha256:\s+)[\"']?[a-f0-9]{64}[\"']?",
            rf"\g<1>{source_sha}",
            text,
            "source tarball sha256",
        )

    path.write_text(text, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Update Flatpak packaging repo files")
    parser.add_argument("--repo", required=True, help="Path to the packaging repository")
    parser.add_argument("--version", required=True, help="Release version, e.g. 11.7")
    parser.add_argument(
        "--source-sha",
        help="SHA256 for the source tarball; omitted values preserve the current manifest sha256",
    )
    parser.add_argument("--source-commit", help="Git commit for the release tag")
    args = parser.parse_args()

    repo = Path(args.repo).resolve()

    manifest = repo / f"{APP_ID}.yml"

    if not manifest.exists():
        raise FileNotFoundError(f"Manifest not found: {manifest}")

    update_manifest(manifest, args.version, args.source_sha, args.source_commit)

    print(f"Updated packaging repo at: {repo}")
    print(f"Version: {args.version}")
    if args.source_sha:
        print(f"Source sha256: {args.source_sha}")
    else:
        print("Source sha256: preserved from existing manifest")
    if args.source_commit:
        print(f"Source commit: {args.source_commit}")


if __name__ == "__main__":
    main()
