#!/usr/bin/env python3

import argparse
import hashlib
import json
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


def patch_snapshot(project, patch):
    name = patch.relative_to(project).as_posix()
    digest = hashlib.sha256(name.encode()).hexdigest()
    return project / '.amelia' / 'imported-patches' / f'{digest}.patch'


def patch_applies(engine, content, *, reverse=False, check=True):
    command = ['git', 'apply', '--whitespace=nowarn']
    if reverse:
        command.append('--reverse')
    if check:
        command.append('--check')
    return subprocess.run(command, input=content, cwd=engine, capture_output=True).returncode == 0


def patch_targets_match_upstream(engine, content):
    targets = {
        line[6:].split('\t', 1)[0]
        for line in content.decode('utf-8').splitlines()
        if line.startswith(('+++ b/', '--- a/'))
    }
    if not targets:
        return False
    for name in targets:
        relative = Path(name)
        if relative.is_absolute() or '..' in relative.parts:
            return False
        file = engine / relative
        original = subprocess.run(
            ['git', 'show', f'HEAD:{name}'], cwd=engine, capture_output=True
        )
        if original.returncode:
            if file.exists() or file.is_symlink():
                return False
        elif file.is_symlink() or not file.is_file() or file.read_bytes() != original.stdout:
            return False
    return True


def prepare_updated_patches(project):
    engine = project / 'engine'
    inventory = project / '.amelia' / 'imported-patches' / 'index.json'
    if inventory.is_file():
        for name in reversed(json.loads(inventory.read_text())):
            relative = Path(name)
            if (relative.is_absolute() or '..' in relative.parts or not relative.parts
                    or relative.parts[0] != 'src' or relative.suffix != '.patch'):
                raise RuntimeError(f'Invalid recorded patch path: {name}')
            patch = project / relative
            if patch.exists():
                continue
            snapshot = patch_snapshot(project, patch)
            if not snapshot.is_file():
                raise RuntimeError(f'Missing retired patch snapshot: {name}')
            previous = snapshot.read_bytes()
            if patch_targets_match_upstream(engine, previous):
                print(f'[prepare-import] Retired patch already matches updated Firefox: {name}')
            elif patch_applies(engine, previous, reverse=True):
                if not patch_applies(engine, previous, reverse=True, check=False):
                    raise RuntimeError(f'Cannot retire patch: {name}')
                print(f'[prepare-import] Removed retired patch: {name}')
            elif not patch_applies(engine, previous):
                raise RuntimeError(f'Cannot verify retired patch state: {name}')
    for patch in sorted((project / 'src').rglob('*.patch')):
        current = patch.read_bytes()
        snapshot = patch_snapshot(project, patch)
        recorded = snapshot.read_bytes() if snapshot.is_file() else None
        if current == recorded:
            continue
        name = patch.relative_to(project).as_posix()
        if patch_applies(engine, current, reverse=True):
            continue
        previous = recorded
        if previous is None:
            result = subprocess.run(['git', 'show', f'HEAD:{name}'], cwd=project, capture_output=True)
            if result.returncode == 0:
                previous = result.stdout
        if (previous and not patch_targets_match_upstream(engine, previous)
                and patch_applies(engine, previous, reverse=True)):
            if not patch_applies(engine, previous, reverse=True, check=False):
                raise RuntimeError(f'Cannot prepare updated patch: {name}')
            print(f'[prepare-import] Removed previous version of updated patch: {name}')
        elif patch_applies(engine, current) or patch_applies(engine, current, reverse=True):
            continue


def prune_removed_overlay_links(project):
    source_root = project / 'src'
    engine = project / 'engine'
    directories = [source_root, *(path for path in source_root.rglob('*') if path.is_dir())]
    removed = 0
    for source_directory in directories:
        destination = engine / source_directory.relative_to(source_root)
        if not destination.is_dir() or destination.is_symlink():
            continue
        if not destination.resolve().is_relative_to(engine.resolve()):
            continue
        for entry in destination.iterdir():
            if not entry.is_symlink() or entry.exists():
                continue
            source = source_directory / entry.name
            if source.exists() or source.is_symlink():
                continue
            target = (entry.parent / entry.readlink()).resolve()
            if target != source:
                continue
            entry.unlink()
            removed += 1
            print(f'[prepare-import] Removed retired overlay link: {entry.relative_to(engine)}')
    if removed:
        print(f'[prepare-import] Removed {removed} retired overlay links')


def record_patch_inputs(project):
    patches = sorted((project / 'src').rglob('*.patch'))
    for patch in patches:
        target = patch_snapshot(project, patch)
        content = patch.read_bytes()
        if target.is_file() and target.read_bytes() == content:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    inventory = project / '.amelia' / 'imported-patches' / 'index.json'
    content = json.dumps([patch.relative_to(project).as_posix() for patch in patches], indent=2) + '\n'
    if not inventory.is_file() or inventory.read_text() != content:
        inventory.parent.mkdir(parents=True, exist_ok=True)
        inventory.write_text(content)
    print('[prepare-import] Recorded patch inputs for the next import')


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
        parser = argparse.ArgumentParser()
        parser.add_argument('--record', action='store_true')
        arguments = parser.parse_args()
        if arguments.record:
            record_patch_inputs(project)
        else:
            restore_classifier_overlays(project)
            prune_removed_overlay_links(project)
            prepare_updated_patches(project)
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"[prepare-import] ERROR: {error}", file=sys.stderr)
        sys.exit(1)
