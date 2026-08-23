#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from datetime import date
from pathlib import Path
import xml.etree.ElementTree as ET


APP_ID = "org.astian.midori_browser"
RUNTIME_VERSION = "25.08"
NODE_SDK_EXTENSION = "org.freedesktop.Sdk.Extension.node22"
NODE_SDK_PATH = "/usr/lib/sdk/node22"


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


def ensure_node_sdk(text: str) -> str:
    if NODE_SDK_EXTENSION not in text:
        if re.search(r"^sdk-extensions:\s*$", text, flags=re.MULTILINE):
            text = replace_or_fail(
                r"^(sdk-extensions:\s*\n)",
                rf"\g<1>  - {NODE_SDK_EXTENSION}\n",
                text,
                "Node SDK extension",
            )
        else:
            text = replace_or_fail(
                r"^(sdk:\s+org\.freedesktop\.Sdk\s*\n)",
                rf"\g<1>sdk-extensions:\n  - {NODE_SDK_EXTENSION}\n",
                text,
                "Node SDK extension",
            )

    if f"{NODE_SDK_PATH}/bin" not in text:
        text = replace_or_fail(
            r"^(sdk-extensions:\s*\n(?:[ \t]+-\s+[^\n]+\n)+)",
            rf"\g<1>build-options:\n  append-path: {NODE_SDK_PATH}/bin\n  env:\n    npm_config_nodedir: {NODE_SDK_PATH}\n",
            text,
            "Node SDK build path",
        )

    return text


def update_manifest(
    path: Path,
    version: str,
    source_sha: str | None,
    source_commit: str | None,
    source_path: str | None,
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
    text = ensure_node_sdk(text)
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
    if source_path:
        text = replace_or_fail(
            r"(?P<indent>^[ \t]+)(?:url:\s+https://github\.com/goastian/midori-desktop/releases/download/v[^/]+/midori-[^/\s]+(?:\.source|-src)\.tar\.xz\n(?P=indent)sha256:\s+[\"']?[a-f0-9]{64}[\"']?|path:\s+[^\n]+)",
            rf"\g<indent>path: {source_path}",
            text,
            "local source tarball path",
        )
    else:
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
    parser.add_argument(
        "--source-path",
        help="Local source tarball path for a non-published Flatpak validation build",
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

    if args.source_sha and args.source_path:
        parser.error("--source-sha and --source-path cannot be used together")

    update_manifest(
        manifest,
        args.version,
        args.source_sha,
        args.source_commit,
        args.source_path,
    )
    update_metainfo(metainfo, args.version)
    update_readme(readme, args.version)

    print(f"Updated packaging repo at: {repo}")
    print(f"Version: {args.version}")
    if args.source_path:
        print(f"Source path: {args.source_path}")
    elif args.source_sha:
        print(f"Source sha256: {args.source_sha}")
    else:
        print("Source sha256: preserved from existing manifest")
    if args.source_commit:
        print(f"Source commit: {args.source_commit}")


if __name__ == "__main__":
    main()
