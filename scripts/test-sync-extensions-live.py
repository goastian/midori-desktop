#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import threading
import time

from marionette_driver.marionette import Marionette


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def run_stage(repository, root, stage, catalog=False):
    object_dir = repository / "engine/obj-x86_64-pc-linux-gnu"
    binary = object_dir / "dist/bin/midori"
    side = "A" if catalog or stage in {"A", "D", "F"} else "B"
    profile = root / f"extensions-live-{side}"
    profile.mkdir(mode=0o700, exist_ok=True)
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    preferences = {
        "marionette.port": port,
        "midori.sync.enabled": False,
        "midori.sync.background.enabled": False,
        "midori.blocker.enabled": False,
        "browser.backup.enabled": False,
        "browser.shell.checkDefaultBrowser": False,
        "browser.startup.homepage_override.mstone": "ignore",
        "network.trr.mode": 5,
    }
    profile.joinpath("user.js").write_text("\n".join(
        f"user_pref({json.dumps(name)}, {json.dumps(value)});" for name, value in preferences.items()
    ))
    fixture = repository / "engine/toolkit/mozapps/extensions/test/xpinstall/amosigned.xpi"
    require(fixture.is_file(), "signed_extension_fixture_missing")
    checkpoint = root / "extensions-live-checkpoint.json"
    checkpoint.unlink(missing_ok=True)
    environment = dict(os.environ, MOZ_HEADLESS="1", TMPDIR=str(root),
                       MIDORI_SYNC_EXTENSIONS_STAGE=stage,
                       MIDORI_SYNC_EXTENSIONS_CHECKPOINT=str(checkpoint),
                       MIDORI_SYNC_SIGNED_EXTENSION_FIXTURE=str(fixture))
    report = {"stage": stage, "side": side, "certificate_override": False,
              "catalog": "production AMO repository and download" if catalog else "synthetic URL resolved to real signed fixture"}
    if not catalog:
        report["signed_fixture_sha256"] = hashlib.sha256(fixture.read_bytes()).hexdigest()
    stop = threading.Event()
    killed = threading.Event()
    errors = []
    with root.joinpath(f"extensions-live-{stage}.log").open("w") as output:
        process = subprocess.Popen([
            str(binary), "--headless", "--no-remote", "--profile", str(profile),
            "--marionette", "--remote-allow-system-access", "about:blank",
        ], env=environment, stdout=output, stderr=subprocess.STDOUT)
        browser = Marionette(host="127.0.0.1", port=port)
        watcher = None
        try:
            deadline = time.monotonic() + 45
            while True:
                require(process.poll() is None, "extension_live_browser_exited_before_session")
                try:
                    with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                        break
                except OSError:
                    require(time.monotonic() < deadline, "extension_live_browser_start_timeout")
                    time.sleep(0.1)
            browser.start_session()
            browser.set_context("chrome")
            browser.timeout.script = 180
            identity = browser.execute_script("return {pid: Services.appinfo.processID, profile: PathUtils.profileDir};")
            require(identity == {"pid": process.pid, "profile": str(profile)}, "unexpected_extension_live_session")

            def terminate_at_checkpoint():
                try:
                    deadline = time.monotonic() + 160
                    while not stop.wait(0.01):
                        require(time.monotonic() < deadline, "extension_live_checkpoint_timeout")
                        if not checkpoint.exists():
                            continue
                        state = json.loads(checkpoint.read_text())
                        command = Path(f"/proc/{process.pid}/cmdline").read_bytes().split(b"\0")
                        require(state == {"pid": process.pid, "profile": str(profile), "stage": "B",
                                          "phase": "awaiting-user", "acknowledgements": 0, "prompts": 0}
                                and Path(os.fsdecode(command[0])).resolve() == binary.resolve()
                                and os.fsencode(str(profile)) in command,
                                "unexpected_extension_live_checkpoint")
                        process.send_signal(signal.SIGKILL)
                        killed.set()
                        report["encrypted_application_checkpoint"] = True
                        return
                except Exception as error:
                    errors.append(error)

            if stage == "B":
                watcher = threading.Thread(target=terminate_at_checkpoint, daemon=True)
                watcher.start()
            try:
                result = browser.execute_async_script("""
                    const [testDirectory, testingDirectory, testName] = arguments;
                    const done = arguments[arguments.length - 1];
                    (async () => {
                      const resources = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
                      const uri = path => {
                        const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
                        file.initWithPath(path);
                        return Services.io.newFileURI(file);
                      };
                      resources.setSubstitution("testing-common", uri(testingDirectory));
                      resources.setSubstitution("midori-sync-extensions-live", uri(testDirectory));
                      const { Assert: Assertion } = ChromeUtils.importESModule("resource://testing-common/Assert.sys.mjs");
                      const tasks = [], cleanups = [];
                      let checks = 0;
                      const assertion = new Assertion(error => { ++checks; if (error) { throw error; } }, true);
                      const scope = Components.utils.Sandbox(Services.scriptSecurityManager.getSystemPrincipal(), { sandboxPrototype: window });
                      Object.assign(scope, { ChromeUtils, Cc, Ci, Cr, Services, IOUtils, PathUtils,
                        TextEncoder, structuredClone, Assert: assertion, add_task: task => tasks.push(task),
                        registerCleanupFunction: task => cleanups.push(task) });
                      Services.scriptloader.loadSubScript("resource://midori-sync-extensions-live/" + testName, scope);
                      for (const task of tasks) { await task(); }
                      for (const cleanup of cleanups.reverse()) { await cleanup(); }
                      done({ok: true, checks});
                    })().catch(error => done({ok: false, error: String(error), stack: String(error.stack)}));
                """, script_args=[str(repository / "src/browser/components/sync/test/integration") + "/",
                                   str(object_dir / "_tests/modules") + "/",
                                   "test_extensions_catalog.js" if catalog else "test_extensions_live_backend.js"])
                require(result.get("ok") and result.get("checks", 0) > 0,
                        f"extension_live_verification_failed: {result}")
                require(stage != "B", "extension_live_checkpoint_returned_without_termination")
                report["checks"] = result["checks"]
            except Exception:
                if watcher:
                    watcher.join(timeout=2)
                require(not errors, f"extension_live_supervisor_failed: {errors}")
                if stage != "B" or not killed.is_set():
                    raise
            if stage != "B":
                browser.delete_session()
                process.terminate()
            process.wait(timeout=15)
            if stage == "B":
                require(process.returncode == -signal.SIGKILL and killed.is_set(), "extension_live_was_not_killed")
            report["process_exit"] = process.returncode
        finally:
            stop.set()
            if watcher:
                watcher.join(timeout=2)
            if process.poll() is None:
                process.kill()
                process.wait(timeout=15)
    print(json.dumps(report), flush=True)
    with root.joinpath("extensions-live-results.jsonl").open("a") as output:
        output.write(json.dumps(report) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--catalog", action="store_true")
    args = parser.parse_args()
    root = args.root.resolve()
    require(root.is_dir() and root.name.startswith("midori-sync-native-") and root.parent == Path("/tmp"),
            "extension_live_requires_private_test_root")
    repository = Path(__file__).resolve().parent.parent
    if args.catalog:
        run_stage(repository, root, "catalog", catalog=True)
        shutil.rmtree(root / "extensions-live-A")
        print("Production AMO lookup, signed download and native permission confirmation passed.", flush=True)
        return
    for stage in ["A", "B", "C", "D", "E", "F", "G"]:
        run_stage(repository, root, stage)
    for side in ["A", "B"]:
        shutil.rmtree(root / f"extensions-live-{side}")
    (root / "extensions-live-state.json").unlink()
    print("Two native profiles passed encrypted extension references against 8000, interrupted-prompt recovery, local review, bidirectional changes, deletion and reinstall.", flush=True)


if __name__ == "__main__":
    main()
