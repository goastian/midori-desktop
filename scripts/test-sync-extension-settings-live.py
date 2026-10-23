#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import argparse
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


def run_stage(repository, root, stage):
    object_dir = repository / "engine/obj-x86_64-pc-linux-gnu"
    binary = object_dir / "dist/bin/midori"
    side = "A" if stage in {"A", "E", "G"} else "B"
    profile = root / f"settings-live-{side}"
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
    checkpoint = root / "settings-live-checkpoint.json"
    checkpoint.unlink(missing_ok=True)
    environment = dict(os.environ, MOZ_HEADLESS="1", TMPDIR=str(root),
                       MIDORI_SYNC_SETTINGS_STAGE=stage,
                       MIDORI_SYNC_SETTINGS_CHECKPOINT=str(checkpoint))
    report = {"stage": stage, "side": side, "certificate_override": False,
              "catalog_override": False, "catalog": "production AMO repository and download"}
    stop = threading.Event()
    killed = threading.Event()
    errors = []
    with root.joinpath(f"settings-live-{stage}.log").open("w") as output:
        process = subprocess.Popen([
            str(binary), "--headless", "--no-remote", "--profile", str(profile),
            "--marionette", "--remote-allow-system-access", "about:blank",
        ], env=environment, stdout=output, stderr=subprocess.STDOUT)
        browser = Marionette(host="127.0.0.1", port=port)
        watcher = None
        try:
            deadline = time.monotonic() + 45
            while True:
                require(process.poll() is None, "settings_live_browser_exited_before_session")
                try:
                    with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                        break
                except OSError:
                    require(time.monotonic() < deadline, "settings_live_browser_start_timeout")
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
                        require(time.monotonic() < deadline, "settings_live_checkpoint_timeout")
                        if not checkpoint.exists():
                            continue
                        state = json.loads(checkpoint.read_text())
                        command = Path(f"/proc/{process.pid}/cmdline").read_bytes().split(b"\0")
                        phase = "before-native" if stage == "B" else "after-native"
                        require(state == {"pid": process.pid, "profile": str(profile), "stage": stage,
                                          "phase": phase, "acknowledgements": 0, "applications": 1}
                                and Path(os.fsdecode(command[0])).resolve() == binary.resolve()
                                and os.fsencode(str(profile)) in command,
                                "unexpected_extension_live_checkpoint")
                        process.send_signal(signal.SIGKILL)
                        killed.set()
                        report["encrypted_application_checkpoint"] = phase
                        return
                except Exception as error:
                    errors.append(error)

            if stage in {"B", "C"}:
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
                      resources.setSubstitution("midori-sync-settings-live", uri(testDirectory));
                      const { Assert: Assertion } = ChromeUtils.importESModule("resource://testing-common/Assert.sys.mjs");
                      const tasks = [], cleanups = [];
                      let checks = 0;
                      const assertion = new Assertion(error => { ++checks; if (error) { throw error; } }, true);
                      const scope = Components.utils.Sandbox(Services.scriptSecurityManager.getSystemPrincipal(), { sandboxPrototype: window });
                      Object.assign(scope, { ChromeUtils, Cc, Ci, Cr, Services, IOUtils, PathUtils,
                        TextEncoder, structuredClone, Assert: assertion, add_task: task => tasks.push(task),
                        registerCleanupFunction: task => cleanups.push(task) });
                      Services.scriptloader.loadSubScript("resource://midori-sync-settings-live/" + testName, scope);
                      for (const task of tasks) { await task(); }
                      for (const cleanup of cleanups.reverse()) { await cleanup(); }
                      done({ok: true, checks});
                    })().catch(error => done({ok: false, error: String(error), stack: String(error.stack)}));
                """, script_args=[str(repository / "src/browser/components/sync/test/integration") + "/",
                                   str(object_dir / "_tests/modules") + "/",
                                   "test_extension_settings_live_backend.js"])
                require(result.get("ok") and result.get("checks", 0) > 0,
                        f"settings_live_verification_failed: {result}")
                require(stage not in {"B", "C"}, "settings_live_checkpoint_returned_without_termination")
                report["checks"] = result["checks"]
            except Exception:
                if watcher:
                    watcher.join(timeout=2)
                require(not errors, f"settings_live_supervisor_failed: {errors}")
                if stage not in {"B", "C"} or not killed.is_set():
                    raise
            if stage not in {"B", "C"}:
                browser.delete_session()
                process.terminate()
            process.wait(timeout=15)
            if stage in {"B", "C"}:
                require(process.returncode == -signal.SIGKILL and killed.is_set(), "settings_live_was_not_killed")
            report["process_exit"] = process.returncode
        finally:
            stop.set()
            if watcher:
                watcher.join(timeout=2)
            if process.poll() is None:
                process.kill()
                process.wait(timeout=15)
    print(json.dumps(report), flush=True)
    with root.joinpath("settings-live-results.jsonl").open("a") as output:
        output.write(json.dumps(report) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    args = parser.parse_args()
    root = args.root.resolve()
    require(root.is_dir() and root.name.startswith("midori-sync-native-") and root.parent == Path("/tmp"),
            "settings_live_requires_private_test_root")
    repository = Path(__file__).resolve().parent.parent
    for stage in ["A", "B", "C", "D", "E", "F", "G"]:
        run_stage(repository, root, stage)
    for side in ["A", "B"]:
        shutil.rmtree(root / f"settings-live-{side}")
    (root / "settings-live-state.json").unlink()
    print("Two native profiles passed encrypted extension settings against 8000, two native commit interruptions, signed catalog installation, per-key merge and scoped deletion.", flush=True)


if __name__ == "__main__":
    main()
