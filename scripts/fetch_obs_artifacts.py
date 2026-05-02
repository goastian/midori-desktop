#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass
from pathlib import Path


SUCCESS_CODES = {"published", "succeeded", "unchanged"}
IGNORED_CODES = {"disabled", "excluded"}
FAILURE_CODES = {
    "broken",
    "failed",
    "unresolvable",
    "blocked",
    "disabled",
    "excluded",
    "locked",
}
PENDING_CODES = {
    "unknown",
    "scheduled",
    "dispatching",
    "building",
    "signing",
    "finished",
}
SOURCE_SUFFIXES = (".src.rpm", ".dsc", ".changes", ".buildinfo", ".packages")
DEBUG_MARKERS = ("-debuginfo", "-debugsource")


@dataclass
class BuildResult:
    repository: str
    arch: str
    code: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Wait for OBS package results and download publishable binaries"
    )
    parser.add_argument("--api-url", required=True, help="OBS API base URL")
    parser.add_argument("--project", required=True, help="OBS project name")
    parser.add_argument("--package", required=True, help="OBS package name")
    parser.add_argument("--version", required=True, help="Release version without leading v")
    parser.add_argument("--output-dir", required=True, help="Directory to store downloaded files")
    parser.add_argument("--username", help="OBS username for HTTP Basic Auth")
    parser.add_argument("--token", help="OBS token/password for HTTP Basic Auth")
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=10800,
        help="How long to wait for OBS results before failing",
    )
    parser.add_argument(
        "--poll-interval-seconds",
        type=int,
        default=60,
        help="Polling interval while waiting for OBS results",
    )
    return parser.parse_args()


def build_headers(username: str | None, token: str | None) -> dict[str, str]:
    headers = {"Accept": "application/xml"}
    if username or token:
        if not username or not token:
            raise SystemExit("OBS username and token must be provided together")
        raw = f"{username}:{token}".encode("utf-8")
        headers["Authorization"] = f"Basic {base64.b64encode(raw).decode('ascii')}"
    return headers


def request_xml(url: str, headers: dict[str, str]) -> ET.Element:
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=120) as response:
        return ET.fromstring(response.read())


def request_bytes(url: str, headers: dict[str, str]) -> bytes:
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=300) as response:
        return response.read()


def slugify(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("_")


def quote_path(value: str) -> str:
    return urllib.parse.quote(value, safe="")


def result_url(api_url: str, project: str, package: str) -> str:
    query = urllib.parse.urlencode({"package": package, "multibuild": 1})
    return f"{api_url.rstrip('/')}/build/{quote_path(project)}/_result?{query}"


def parse_results(root: ET.Element, package: str) -> list[BuildResult]:
    results: list[BuildResult] = []
    for result in root.findall("result"):
        repository = result.attrib.get("repository")
        arch = result.attrib.get("arch")
        if not repository or not arch:
            continue
        if arch in {"src", "nosrc"}:
            continue
        status = next(
            (item for item in result.findall("status") if item.attrib.get("package") == package),
            None,
        )
        code = ""
        if status is not None:
            code = status.attrib.get("code", "")
        if not code:
            code = result.attrib.get("code", "")
        results.append(BuildResult(repository=repository, arch=arch, code=code))
    return results


def classify_results(results: list[BuildResult]) -> tuple[list[BuildResult], list[BuildResult], list[BuildResult]]:
    active: list[BuildResult] = []
    failures: list[BuildResult] = []
    pending: list[BuildResult] = []
    for item in results:
        if item.code in IGNORED_CODES:
            continue
        active.append(item)
        if item.code in FAILURE_CODES and item.code not in SUCCESS_CODES:
            failures.append(item)
        elif item.code not in SUCCESS_CODES:
            pending.append(item)
    return active, failures, pending


def binaries_url(api_url: str, project: str, repository: str, arch: str, package: str) -> str:
    return (
        f"{api_url.rstrip('/')}/build/{quote_path(project)}/{quote_path(repository)}/"
        f"{quote_path(arch)}/{quote_path(package)}"
    )


def iter_binary_names(root: ET.Element) -> list[str]:
    names: list[str] = []
    for entry in root.findall(".//binary"):
        name = entry.attrib.get("filename") or entry.attrib.get("name")
        if name:
            names.append(name)
    for entry in root.findall(".//entry"):
        name = entry.attrib.get("name")
        if name:
            names.append(name)
    return sorted(set(names))


def keep_binary(name: str) -> bool:
    if any(name.endswith(suffix) for suffix in SOURCE_SUFFIXES):
        return False
    if any(marker in name for marker in DEBUG_MARKERS):
        return False
    return name.endswith(".rpm") or name.endswith(".deb")


def matches_version(name: str, version: str) -> bool:
    candidates = {version, version.replace(".", "_"), version.replace(".", "-")}
    return any(token in name for token in candidates)


def output_name(version: str, repository: str, arch: str, original_name: str) -> str:
    repo_slug = slugify(repository)
    return f"midori-{version}-{repo_slug}-{arch}-{original_name}"


def download_binaries(
    api_url: str,
    project: str,
    package: str,
    version: str,
    output_dir: Path,
    headers: dict[str, str],
    results: list[BuildResult],
) -> dict[str, object]:
    output_dir.mkdir(parents=True, exist_ok=True)
    downloads: list[dict[str, str]] = []

    for item in results:
        root = request_xml(
            binaries_url(api_url, project, item.repository, item.arch, package),
            headers,
        )
        candidates = [
            name
            for name in iter_binary_names(root)
            if keep_binary(name) and matches_version(name, version)
        ]
        if not candidates:
            raise SystemExit(
                "No publishable binaries matching the requested version "
                f"{version} were found for OBS result {item.repository}/{item.arch}"
            )

        for candidate in candidates:
            source = (
                f"{binaries_url(api_url, project, item.repository, item.arch, package)}/"
                f"{quote_path(candidate)}"
            )
            target_name = output_name(version, item.repository, item.arch, candidate)
            target_path = output_dir / target_name
            target_path.write_bytes(request_bytes(source, headers))
            downloads.append(
                {
                    "repository": item.repository,
                    "arch": item.arch,
                    "source_name": candidate,
                    "release_name": target_name,
                }
            )

    summary = {
        "project": project,
        "package": package,
        "version": version,
        "downloads": downloads,
        "results": [asdict(item) for item in results],
    }
    (output_dir / "obs-artifacts-summary.json").write_text(
        json.dumps(summary, indent=2) + "\n",
        encoding="utf-8",
    )
    return summary


def wait_for_results(
    api_url: str,
    project: str,
    package: str,
    version: str,
    headers: dict[str, str],
    timeout_seconds: int,
    poll_interval_seconds: int,
) -> list[BuildResult]:
    deadline = time.time() + timeout_seconds
    last_seen: list[BuildResult] = []
    while time.time() < deadline:
        root = request_xml(result_url(api_url, project, package), headers)
        results = parse_results(root, package)
        active, failures, pending = classify_results(results)
        last_seen = active

        if not active:
            time.sleep(poll_interval_seconds)
            continue

        if failures:
            joined = ", ".join(
                f"{item.repository}/{item.arch}={item.code}" for item in failures
            )
            raise SystemExit(f"OBS reported failing results: {joined}")

        if not pending:
            version_pending: list[str] = []
            for item in active:
                try:
                    binaries_root = request_xml(
                        binaries_url(api_url, project, item.repository, item.arch, package),
                        headers,
                    )
                except urllib.error.HTTPError:
                    version_pending.append(f"{item.repository}/{item.arch}")
                    continue
                candidates = [
                    name
                    for name in iter_binary_names(binaries_root)
                    if keep_binary(name) and matches_version(name, version)
                ]
                if not candidates:
                    version_pending.append(f"{item.repository}/{item.arch}")
            if version_pending:
                print(
                    "OBS results are ready but still exposing older binaries for: "
                    + ", ".join(version_pending),
                    flush=True,
                )
                time.sleep(poll_interval_seconds)
                continue
            return active

        pending_summary = ", ".join(
            f"{item.repository}/{item.arch}={item.code}" for item in pending
        )
        print(f"Waiting for OBS results: {pending_summary}", flush=True)
        time.sleep(poll_interval_seconds)

    if last_seen:
        snapshot = ", ".join(
            f"{item.repository}/{item.arch}={item.code}" for item in last_seen
        )
        raise SystemExit(f"Timed out waiting for OBS results. Last snapshot: {snapshot}")
    raise SystemExit("Timed out waiting for OBS results; no active repositories were detected")


def main() -> int:
    args = parse_args()
    headers = build_headers(args.username, args.token)
    output_dir = Path(args.output_dir).resolve()

    results = wait_for_results(
        api_url=args.api_url,
        project=args.project,
        package=args.package,
        version=args.version,
        headers=headers,
        timeout_seconds=args.timeout_seconds,
        poll_interval_seconds=args.poll_interval_seconds,
    )

    summary = download_binaries(
        api_url=args.api_url,
        project=args.project,
        package=args.package,
        version=args.version,
        output_dir=output_dir,
        headers=headers,
        results=results,
    )
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
