#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from datetime import date
from pathlib import Path
import xml.etree.ElementTree as ET


def indent(elem: ET.Element, level: int = 0) -> None:
    i = "\n" + level * "  "
    if len(elem):
        if not elem.text or not elem.text.strip():
            elem.text = i + "  "
        for child in elem:
            indent(child, level + 1)
        if not child.tail or not child.tail.strip():
            child.tail = i
    if level and (not elem.tail or not elem.tail.strip()):
        elem.tail = i


def update_manifest(path: Path, version: str, x86_sha: str, arm_sha: str) -> None:
    text = path.read_text(encoding="utf-8")

    text = re.sub(r"(runtime-version:\s*')[^']+(')", r"\g<1>25.08\2", text)
    text = re.sub(r"(base-version:\s*')[^']+(')", r"\g<1>25.08\2", text)

    text = re.sub(
        r"url:\s+https://github\.com/goastian/midori-desktop/releases/download/v[^/]+/midori-[0-9A-Za-z.\-]+\.linux-x86_64\.tar\.xz",
        f"url: https://github.com/goastian/midori-desktop/releases/download/v{version}/midori-{version}.linux-x86_64.tar.xz",
        text,
    )
    text = re.sub(
        r"(url:\s+https://github\.com/goastian/midori-desktop/releases/download/v[^\n]+linux-x86_64\.tar\.xz\n\s+sha256:\s+)[a-f0-9]{64}",
        rf"\g<1>{x86_sha}",
        text,
    )

    text = re.sub(
        r"url:\s+https://github\.com/goastian/midori-desktop/releases/download/v[^/]+/midori-[0-9A-Za-z.\-]+\.linux-aarch64\.tar\.xz",
        f"url: https://github.com/goastian/midori-desktop/releases/download/v{version}/midori-{version}.linux-aarch64.tar.xz",
        text,
    )
    text = re.sub(
        r"(url:\s+https://github\.com/goastian/midori-desktop/releases/download/v[^\n]+linux-aarch64\.tar\.xz\n\s+sha256:\s+)[a-f0-9]{64}",
        rf"\g<1>{arm_sha}",
        text,
    )

    path.write_text(text, encoding="utf-8")


def update_metainfo(path: Path, version: str) -> None:
    tree = ET.parse(path)
    root = tree.getroot()

    releases = root.find("releases")
    if releases is None:
      releases = ET.SubElement(root, "releases")

    for rel in list(releases.findall("release")):
        if rel.get("version") == version:
            releases.remove(rel)

    release = ET.Element("release", {"version": version, "date": date.today().isoformat()})

    details = ET.SubElement(release, "url", {"type": "details"})
    details.text = f"https://github.com/goastian/midori-desktop/releases/tag/v{version}"

    description = ET.SubElement(release, "description")
    p = ET.SubElement(description, "p")
    p.text = f"Automated Flatpak update for Midori Browser {version}."

    releases.insert(0, release)

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
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--x86-sha", required=True)
    parser.add_argument("--arm-sha", required=True)
    args = parser.parse_args()

    repo = Path(args.repo)

    update_manifest(repo / "org.astian.midori_browser.yml", args.version, args.x86_sha, args.arm_sha)
    update_metainfo(repo / "org.astian.midori_browser.metainfo.xml", args.version)
    update_readme(repo / "README.md", args.version)


if __name__ == "__main__":
    main()