import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/check-rust-integrity.py"
spec = importlib.util.spec_from_file_location("rust_integrity", SCRIPT)
integrity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(integrity)

prepare_spec = importlib.util.spec_from_file_location(
    "prepare_import", SCRIPT.with_name("prepare-import.py")
)
prepare = importlib.util.module_from_spec(prepare_spec)
prepare_spec.loader.exec_module(prepare)


class RustIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.engine = self.root / "engine"
        self.source = self.root / "src"
        self.engine.mkdir()
        self.source.mkdir()

    def vendor_fixture(self):
        directory = self.engine / "third_party/rust/example"
        directory.mkdir(parents=True)
        overlay = self.source / "third_party/rust/example"
        overlay.mkdir(parents=True)
        (overlay / "Cargo.toml").write_text("")
        file = directory / "lib.rs"
        file.write_text("pub fn example() {}\n")
        (directory / ".cargo-checksum.json").write_text(json.dumps({
            "files": {"lib.rs": hashlib.sha256(file.read_bytes()).hexdigest()}
        }))
        metadata = {"packages": [{"manifest_path": str(directory / "Cargo.toml")}]}
        return file, metadata

    def test_resolution_is_locked_offline_and_uses_firefox_vendor_config(self):
        result = subprocess.CompletedProcess([], 0, '{"packages": []}', "")
        with patch.object(integrity.subprocess, "run", return_value=result) as run:
            integrity.cargo_metadata(self.engine)
        command = run.call_args.args[0]
        self.assertIn("--locked", command)
        self.assertIn("--offline", command)
        self.assertIn(str(self.engine / ".cargo/config.toml.in"), command)
        self.assertIn(
            "source.vendored-sources.directory="
            + json.dumps((self.engine / "third_party/rust").as_posix()), command
        )

    def test_resolution_failure_preserves_cargo_diagnostics(self):
        result = subprocess.CompletedProcess([], 101, "", "glean-build v70 needs a lock file")
        with patch.object(integrity.subprocess, "run", return_value=result):
            with self.assertRaisesRegex(RuntimeError, "glean-build v70.*lock file"):
                integrity.cargo_metadata(self.engine)

    def test_valid_overlay_checksums(self):
        _, metadata = self.vendor_fixture()
        self.assertEqual(integrity.verify_vendor_overlays(metadata, self.engine, self.source), 1)

    def test_changed_vendor_file_is_rejected(self):
        file, metadata = self.vendor_fixture()
        file.write_text("modified")
        with self.assertRaisesRegex(RuntimeError, "checksum mismatch"):
            integrity.verify_vendor_overlays(metadata, self.engine, self.source)

    def test_missing_vendor_file_is_rejected(self):
        file, metadata = self.vendor_fixture()
        file.unlink()
        with self.assertRaisesRegex(RuntimeError, "Missing vendored file"):
            integrity.verify_vendor_overlays(metadata, self.engine, self.source)

    def test_firefox_patched_vendor_files_are_not_rejected(self):
        file, metadata = self.vendor_fixture()
        (self.source / "third_party/rust/example/Cargo.toml").unlink()
        file.write_text("Firefox patch")
        self.assertEqual(integrity.verify_vendor_overlays(metadata, self.engine, self.source), 0)

    def test_refresh_seeds_from_firefox_and_preserves_symlink(self):
        source_lock = self.source / "Cargo.lock"
        source_lock.write_bytes(b"previous Midori lock")
        lock = self.engine / "Cargo.lock"
        lock.symlink_to(source_lock)

        def resolve(engine, locked):
            self.assertFalse(locked)
            self.assertEqual(lock.read_bytes(), b"Firefox lock")
            lock.write_bytes(b"resolved Midori lock")
            return {"packages": []}

        git = subprocess.CompletedProcess([], 0, b"Firefox lock", b"")
        with patch.object(integrity.subprocess, "run", return_value=git):
            with patch.object(integrity, "cargo_metadata", side_effect=resolve):
                integrity.refresh_lock(self.engine, self.source)
        self.assertTrue(lock.is_symlink())
        self.assertEqual(source_lock.read_bytes(), b"resolved Midori lock")

    def test_failed_refresh_restores_both_lock_files(self):
        source_lock = self.source / "Cargo.lock"
        source_lock.write_bytes(b"source lock")
        lock = self.engine / "Cargo.lock"
        lock.write_bytes(b"engine lock")

        for exception in [RuntimeError, KeyboardInterrupt]:
            with self.subTest(exception=exception):
                def resolve(engine, locked):
                    lock.write_bytes(b"partial resolution")
                    raise exception("interrupted resolution")

                git = subprocess.CompletedProcess([], 0, b"Firefox lock", b"")
                with patch.object(integrity.subprocess, "run", return_value=git):
                    with patch.object(integrity, "cargo_metadata", side_effect=resolve):
                        with self.assertRaises(exception):
                            integrity.refresh_lock(self.engine, self.source)
                self.assertEqual(source_lock.read_bytes(), b"source lock")
                self.assertEqual(lock.read_bytes(), b"engine lock")


class PrepareImportTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.project = Path(temporary.name)
        self.relative = prepare.CLASSIFIER_PATH / "Cargo.toml"
        self.engine_file = self.project / "engine" / self.relative
        self.source_file = self.project / "src" / self.relative
        self.engine_file.parent.mkdir(parents=True)
        self.source_file.parent.mkdir(parents=True)
        legacy = {"Cargo.toml": hashlib.sha256(b"old overlay\n").hexdigest()}
        patcher = patch.object(prepare, "LEGACY_CLASSIFIER_OVERLAYS", legacy)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_removed_overlay_symlink_is_restored_from_firefox(self):
        self.engine_file.symlink_to(self.source_file)
        original = subprocess.CompletedProcess([], 0, b"Firefox source", b"")
        with patch.object(prepare.subprocess, "run", return_value=original):
            prepare.restore_classifier_overlays(self.project)
        self.assertFalse(self.engine_file.is_symlink())
        self.assertEqual(self.engine_file.read_bytes(), b"Firefox source")
        self.assertFalse(self.source_file.exists())

    def test_copied_legacy_overlay_is_restored_from_firefox(self):
        self.engine_file.write_bytes(b"old overlay\r\n")
        original = subprocess.CompletedProcess([], 0, b"Firefox source", b"")
        with patch.object(prepare.subprocess, "run", return_value=original):
            prepare.restore_classifier_overlays(self.project)
        self.assertEqual(self.engine_file.read_bytes(), b"Firefox source")

    def test_user_edits_and_live_overlays_are_preserved(self):
        self.engine_file.write_bytes(b"user changes")
        with patch.object(prepare.subprocess, "run") as git:
            prepare.restore_classifier_overlays(self.project)
            self.assertEqual(self.engine_file.read_bytes(), b"user changes")
            self.engine_file.unlink()
            self.source_file.write_bytes(b"old overlay")
            self.engine_file.symlink_to(self.source_file)
            prepare.restore_classifier_overlays(self.project)
            self.assertTrue(self.engine_file.is_symlink())
            self.assertEqual(self.source_file.read_bytes(), b"old overlay")
            git.assert_not_called()


if __name__ == "__main__":
    unittest.main()
