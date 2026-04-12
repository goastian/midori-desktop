#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from datetime import date
from pathlib import Path
import xml.etree.ElementTree as ET


RUNTIME_VERSION = "25.08"
BASE_VERSION = "25.08"


def indent(elem: ET.Element, level: int = 0) -> None:
    i = "\n" + level * "  "
    if len(elem):
        if not elem.text or not elem.text.strip():
            elem.text = i + "  "
        for child in elem:
            indent(child, level + 1)
        last = elem[-1]
        if not last.tail or not last.tail.strip():
            last.tail = i
    if level and (not elem.tail or not elem.tail.strip()):
        elem.tail = i


def update_manifest(path: Path, version: str, x86_sha: str, arm_sha: str) -> None:
    text = path.read_text(encoding="utf-8")

    text = re.sub(
        r"(runtime-version:\s*')[^']+(')",
        rf"\g<1>{RUNTIME_VERSION}\2",
        text,
    )
    text = re.sub(
        r"(base-version:\s*')[^']+(')",
        rf"\g<1>{BASE_VERSION}\2",
        text,
    )

    text = re.sub(
        r"url:\s+https://github\.com/goastian/midori-desktop/releases/download/v[^/]+/midori-[^/\s]+\.linux-x86_64\.tar\.xz",
        f"url: https://github.com/goastian/midori-desktop/releases/download/v{version}/midori-{version}.linux-x86_64.tar.xz",
        text,
    )
    text = re.sub(
        r"(url:\s+https://github\.com/goastian/midori-desktop/releases/download/v[^\n]+linux-x86_64\.tar\.xz\n\s+sha256:\s+)[a-f0-9]{64}",
        rf"\g<1>{x86_sha}",
        text,
        count=1,
    )

    text = re.sub(
        r"url:\s+https://github\.com/goastian/midori-desktop/releases/download/v[^/]+/midori-[^/\s]+\.linux-aarch64\.tar\.xz",
        f"url: https://github.com/goastian/midori-desktop/releases/download/v{version}/midori-{version}.linux-aarch64.tar.xz",
        text,
    )
    text = re.sub(
        r"(url:\s+https://github\.com/goastian/midori-desktop/releases/download/v[^\n]+linux-aarch64\.tar\.xz\n\s+sha256:\s+)[a-f0-9]{64}",
        rf"\g<1>{arm_sha}",
        text,
        count=1,
    )

    path.write_text(text, encoding="utf-8")


def update_metainfo(path: Path, version: str) -> None:
    tree = ET.parse(path)
    root = tree.getroot()

    releases = root.find("releases")
    if releases is None:
        releases = ET.SubElement(root, "releases")

    existing = releases.findall("release")
    for rel in existing:
        if rel.get("version") == version:
            releases.remove(rel)

    release = ET.Element(
        "release",
        {
            "version": version,
            "date": date.today().isoformat(),
        },
    )

    details = ET.SubElement(release, "url", {"type": "details"})
    details.text = f"https://github.com/goastian/midori-desktop/releases/tag/v{version}"

    description = ET.SubElement(release, "description")
    p = ET.SubElement(description, "p")
    p.text = f"Automated Flatpak update for Midori Browser {version}."

    releases.insert(0, release)

    # Keep the most recent 20 releases to avoid unbounded growth
    while len(releases.findall("release")) > 20:
        releases.remove(releases.findall("release")[-1])

    indent(root)
    tree.write(path, encoding="utf-8", xml_declaration=True)


def update_readme(path: Path, version: str) -> None:
    if not path.exists():
        return

    text = path.read_text(encoding="utf-8")
    text = re.sub(
        r"(## Current packaged version\s+)([0-9A-Za-z.\-]+)",
        rf"\g<1>{version}",
        text,
        flags=re.MULTILINE,
    )
    path.write_text(text, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Update Flatpak packaging repo files")
    parser.add_argument("--repo", required=True, help="Path to the packaging repository")
    parser.add_argument("--version", required=True, help="Release version, e.g. 11.6.6")
    parser.add_argument("--x86-sha", required=True, help="SHA256 for linux x86_64 tarball")
    parser.add_argument("--arm-sha", required=True, help="SHA256 for linux aarch64 tarball")
    args = parser.parse_args()

    repo = Path(args.repo).resolve()

    manifest = repo / "org.astian.midori_browser.yml"
    metainfo = repo / "org.astian.midori_browser.metainfo.xml"
    readme = repo / "README.md"

    if not manifest.exists():
        raise FileNotFoundError(f"Manifest not found: {manifest}")
    if not metainfo.exists():
        raise FileNotFoundError(f"Metainfo not found: {metainfo}")

    update_manifest(manifest, args.version, args.x86_sha, args.arm_sha)
    update_metainfo(metainfo, args.version)
    update_readme(readme, args.version)

    print(f"Updated packaging repo at: {repo}")
    print(f"Version: {args.version}")
    print(f"x86_64 sha256: {args.x86_sha}")
    print(f"aarch64 sha256: {args.arm_sha}")


if __name__ == "__main__":
    main()