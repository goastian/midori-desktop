#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from datetime import date
from pathlib import Path
import xml.etree.ElementTree as ET


APP_ID = "org.astian.midori_browser"
RUNTIME_VERSION = "25.08"


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


def replace_or_fail(pattern: str, replacement: str, text: str, description: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.MULTILINE)
    if count != 1:
        raise RuntimeError(f"Unable to update {description}")
    return updated


def normalize_generated_sources(text: str) -> str:
    lines = text.splitlines(keepends=True)
    filtered_lines: list[str] = []
    in_modules = False

    for line in lines:
        stripped = line.strip()
        indent = len(line) - len(line.lstrip(" "))

        if stripped == "modules:" and indent == 0:
            in_modules = True
            filtered_lines.append(line)
            continue

        if in_modules and indent <= 1 and stripped and not stripped.startswith("#"):
            in_modules = False

        if in_modules and indent == 2 and stripped == "- generated-sources.json":
            continue

        filtered_lines.append(line)

    lines = filtered_lines

    in_midori_module = False
    insert_at: int | None = None
    has_generated_sources = False

    for index, line in enumerate(lines):
        stripped = line.strip()
        indent = len(line) - len(line.lstrip(" "))

        if stripped == "- name: midori" and indent == 2:
            in_midori_module = True
            continue

        if in_midori_module and indent <= 2 and stripped and not stripped.startswith("#"):
            break

        if not in_midori_module:
            continue

        if stripped == "sources:" and indent == 4:
            insert_at = index + 1
            continue

        if insert_at is not None and indent <= 4 and stripped and not stripped.startswith("#"):
            break

        if stripped == "- generated-sources.json" and indent == 6:
            has_generated_sources = True
            break

    if insert_at is not None and not has_generated_sources:
        lines.insert(insert_at, "      - generated-sources.json\n")

    return "".join(lines)


def update_manifest(
    path: Path,
    version: str,
    source_sha: str | None,
    source_commit: str | None,
) -> None:
    text = path.read_text(encoding="utf-8")
    text = normalize_generated_sources(text)
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


def update_screenshot_urls(root: ET.Element, version: str) -> None:
    prefix_pattern = re.compile(
        r"https://raw\.githubusercontent\.com/goastian/midori-desktop/"
        r"v[^/]+/screenshots/"
    )
    replacement = (
        f"https://raw.githubusercontent.com/goastian/midori-desktop/"
        f"v{version}/screenshots/"
    )

    screenshots = root.find("screenshots")
    if screenshots is None:
        return

    for image in screenshots.findall(".//image"):
        if image.text:
            image.text = prefix_pattern.sub(replacement, image.text)


def update_metainfo(path: Path, version: str) -> None:
    tree = ET.parse(path)
    root = tree.getroot()
    update_screenshot_urls(root, version)

    releases = root.find("releases")
    if releases is None:
        releases = ET.SubElement(root, "releases")

    for rel in releases.findall("release"):
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
    p.text = f"Flatpak source-build update for Midori Browser {version}."

    releases.insert(0, release)

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
    parser.add_argument("--version", required=True, help="Release version, e.g. 11.7")
    parser.add_argument(
        "--source-sha",
        help="SHA256 for the source tarball; omitted values preserve the current manifest sha256",
    )
    parser.add_argument("--source-commit", help="Git commit for the release tag")
    args = parser.parse_args()

    repo = Path(args.repo).resolve()

    manifest = repo / f"{APP_ID}.yml"
    metainfo = repo / f"{APP_ID}.metainfo.xml"
    readme = repo / "README.md"

    if not manifest.exists():
        raise FileNotFoundError(f"Manifest not found: {manifest}")
    if not metainfo.exists():
        raise FileNotFoundError(f"Metainfo not found: {metainfo}")

    update_manifest(manifest, args.version, args.source_sha, args.source_commit)
    update_metainfo(metainfo, args.version)
    update_readme(readme, args.version)

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
