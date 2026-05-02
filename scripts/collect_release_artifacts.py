#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path


RELEASE_SUFFIXES = (".tar.xz", ".dmg", ".exe", ".mar", ".AppImage", ".deb", ".rpm")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Collect and validate GitHub Actions artifacts for a release"
    )
    parser.add_argument("--input-dir", required=True, help="Directory from actions/download-artifact")
    parser.add_argument("--output-dir", required=True, help="Directory to populate with release assets")
    parser.add_argument("--version", required=True, help="Release version without leading v")
    parser.add_argument(
        "--linux-mode",
        choices=("hybrid", "gha-only", "obs-only"),
        default="hybrid",
        help="Controls which Linux artifacts are required",
    )
    return parser.parse_args()


def find_files(root: Path, suffix: str) -> list[Path]:
    return sorted(path for path in root.rglob("*") if path.is_file() and path.name.endswith(suffix))


def require_files(root: Path, suffix: str, label: str) -> list[Path]:
    matches = find_files(root, suffix)
    if not matches:
        raise SystemExit(f"Missing required artifact: {label} ({suffix})")
    return matches


def should_keep_name(version: str, file_name: str) -> bool:
    lowered = file_name.lower()
    if lowered.endswith(".mar"):
        return False
    return file_name.startswith("midori-") and version in file_name


def release_name(version: str, platform: str, file_name: str) -> str:
    if should_keep_name(version, file_name):
        return file_name
    return f"midori-{version}-{platform}-{file_name}"


def copy_release_asset(source: Path, output_dir: Path, target_name: str) -> None:
    target = output_dir / target_name
    shutil.copy2(source, target)


def collect_platform_assets(
    version: str,
    artifact_root: Path,
    output_dir: Path,
    platform: str,
) -> None:
    for candidate in sorted(artifact_root.rglob("*")):
        if not candidate.is_file():
            continue
        rel_parts = candidate.relative_to(artifact_root).parts
        if rel_parts and rel_parts[0] == "update":
            target = output_dir / "update-manifests" / platform / Path(*rel_parts[1:])
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(candidate, target)
            continue
        if candidate.name.endswith(RELEASE_SUFFIXES):
            copy_release_asset(candidate, output_dir, release_name(version, platform, candidate.name))


def validate_required_artifacts(input_dir: Path, linux_mode: str) -> None:
    required = {
        "windows-x86_64": (".exe", ".mar"),
        "windows-aarch64": (".exe", ".mar"),
        "macos-x86_64": (".dmg", ".mar"),
        "macos-aarch64": (".dmg", ".mar"),
    }
    if linux_mode != "obs-only":
        required["linux-x86_64"] = (".tar.xz", ".mar", ".AppImage")
        required["linux-aarch64"] = (".tar.xz", ".mar")

    for platform, suffixes in required.items():
        root = input_dir / platform
        if not root.is_dir():
            raise SystemExit(f"Missing artifact directory: {platform}")
        for suffix in suffixes:
            require_files(root, suffix, platform)

    if linux_mode != "gha-only":
        obs_root = input_dir / "obs-linux"
        if not obs_root.is_dir():
            raise SystemExit("Missing OBS artifact directory: obs-linux")
        debs = find_files(obs_root, ".deb")
        rpms = find_files(obs_root, ".rpm")
        if not debs and not rpms:
            raise SystemExit("OBS artifact directory does not contain any .deb or .rpm files")


def copy_obs_assets(version: str, obs_root: Path, output_dir: Path) -> None:
    for candidate in sorted(obs_root.rglob("*")):
        if not candidate.is_file():
            continue
        if candidate.suffix not in {".deb", ".rpm"}:
            continue
        target_name = candidate.name
        if not target_name.startswith("midori-"):
            target_name = f"midori-{version}-obs-{candidate.name}"
        copy_release_asset(candidate, output_dir, target_name)


def copy_source_bundle(version: str, input_dir: Path, output_dir: Path) -> None:
    source_artifacts = sorted(input_dir.glob("midori-src.tar.xz/midori-*-src.tar.xz"))
    if not source_artifacts:
        raise SystemExit("Missing prepared source bundle artifact (midori-*-src.tar.xz)")
    shutil.copy2(source_artifacts[0], output_dir / f"midori-{version}-src.tar.xz")


def main() -> int:
    args = parse_args()
    input_dir = Path(args.input_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    validate_required_artifacts(input_dir, args.linux_mode)

    for platform_root in sorted(path for path in input_dir.iterdir() if path.is_dir()):
        if platform_root.name in {"midori-src.tar.xz", "obs-linux"}:
            continue
        collect_platform_assets(args.version, platform_root, output_dir, platform_root.name)

    copy_source_bundle(args.version, input_dir, output_dir)

    if args.linux_mode != "gha-only":
        copy_obs_assets(args.version, input_dir / "obs-linux", output_dir)

    return 0


if __name__ == "__main__":
    sys.exit(main())
