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


def run_stage(repository, root, scenario, stage):
    object_dir = repository / "engine/obj-x86_64-pc-linux-gnu"
    binary = object_dir / "dist/bin/midori"
    profile = root / "offline-browser-profile"
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
        "signon.storage.rust.enabled": False,
        "signon.storage.rust.active": False,
        "extensions.formautofill.addresses.storage.rust.enabled": False,
        "extensions.formautofill.addresses.storage.rust.active": False,
        "extensions.formautofill.creditCards.storage.rust.enabled": False,
        "extensions.formautofill.creditCards.storage.rust.active": False,
    }
    profile.joinpath("user.js").write_text("\n".join(
        f"user_pref({json.dumps(name)}, {json.dumps(value)});" for name, value in preferences.items()
    ))
    checkpoint = root / "receipt-checkpoint.json"
    checkpoint.unlink(missing_ok=True)
    environment = dict(os.environ, MOZ_HEADLESS="1", MIDORI_SYNC_H4_STAGE=stage,
                       MIDORI_SYNC_H4_CASE=scenario,
                       MIDORI_SYNC_H4_STATE=str(root / "offline-state.json"),
                       MIDORI_SYNC_H4_CHECKPOINT=str(checkpoint))
    report = {"scenario": scenario, "stage": stage}
    stop = threading.Event()
    killed = threading.Event()
    watcher_errors = []
    command = [str(binary), "--headless", "--no-remote", "--profile", str(profile),
               "--marionette", "--remote-allow-system-access"]
    if stage in {"B", "C"}:
        command.append("--offline")
    command.append("about:blank")
    with root.joinpath(f"offline-{stage}.log").open("w") as output:
        process = subprocess.Popen(command, env=environment, stdout=output, stderr=subprocess.STDOUT)
        browser = Marionette(host="127.0.0.1", port=port)
        watcher = None
        try:
            deadline = time.monotonic() + 45
            while True:
                require(process.poll() is None, "offline_browser_exited_before_session")
                try:
                    with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                        break
                except OSError:
                    require(time.monotonic() < deadline, "offline_browser_start_timeout")
                    time.sleep(0.1)
            browser.start_session()
            browser.set_context("chrome")
            browser.timeout.script = 240
            identity = browser.execute_script("return {pid: Services.appinfo.processID, profile: PathUtils.profileDir};")
            require(identity == {"pid": process.pid, "profile": str(profile)}, "unexpected_offline_session")
            if stage in {"B", "C"}:
                require(browser.execute_script("return Services.io.offline;"), "offline_startup_was_online")

            def terminate_at_receipt():
                try:
                    deadline = time.monotonic() + 220
                    while not stop.wait(0.01):
                        require(time.monotonic() < deadline, "offline_receipt_checkpoint_timeout")
                        if not checkpoint.exists():
                            continue
                        state = json.loads(checkpoint.read_text())
                        actual = Path(f"/proc/{process.pid}/cmdline").read_bytes().split(b"\0")
                        require(state == {"pid": process.pid, "profile": str(profile), "stage": "C",
                                          "scenario": scenario, "receiptReceived": True}
                                and Path(os.fsdecode(actual[0])).resolve() == binary.resolve()
                                and os.fsencode(str(profile)) in actual,
                                "unexpected_offline_receipt_checkpoint")
                        process.send_signal(signal.SIGKILL)
                        killed.set()
                        report["receipt_checkpoint"] = True
                        return
                except Exception as error:
                    watcher_errors.append(error)

            if stage == "C":
                watcher = threading.Thread(target=terminate_at_receipt, daemon=True)
                watcher.start()
            try:
                result = browser.execute_async_script("""
                    const [testDirectory, testingDirectory] = arguments;
                    const done = arguments[arguments.length - 1];
                    const messages = [];
                    (async () => {
                      const resources = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
                      const uri = path => {
                        const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
                        file.initWithPath(path);
                        return Services.io.newFileURI(file);
                      };
                      resources.setSubstitution("testing-common", uri(testingDirectory));
                      resources.setSubstitution("midori-sync-offline-test", uri(testDirectory));
                      const { Assert: Assertion } = ChromeUtils.importESModule("resource://testing-common/Assert.sys.mjs");
                      const tasks = [], cleanups = [];
                      let checks = 0;
                      const assertion = new Assertion(error => { ++checks; if (error) { throw error; } }, true);
                      const scope = Components.utils.Sandbox(Services.scriptSecurityManager.getSystemPrincipal(), { sandboxPrototype: window });
                      Object.assign(scope, { ChromeUtils, Cc, Ci, Cr, Services, IOUtils, PathUtils,
                        TextEncoder, structuredClone, Assert: assertion, add_task: task => tasks.push(task),
                        info: message => messages.push(String(message)),
                        registerCleanupFunction: task => cleanups.push(task) });
                      Services.scriptloader.loadSubScript("resource://midori-sync-offline-test/test_h4_offline.js", scope);
                      for (const task of tasks) { await task(); }
                      for (const cleanup of cleanups.reverse()) { await cleanup(); }
                      done({ok: true, checks});
                    })().catch(error => done({ok: false, error: String(error), stack: String(error.stack), messages: messages.slice(-3)}));
                """, script_args=[str(repository / "src/browser/components/sync/test/integration") + "/",
                                   str(object_dir / "_tests/modules") + "/"])
                require(result.get("ok") and result.get("checks", 0) > 0,
                        f"offline_browser_verification_failed: {result}")
                require(stage != "C", "offline_receipt_stage_returned_without_termination")
                report["checks"] = result["checks"]
            except Exception:
                if watcher:
                    watcher.join(timeout=2)
                require(not watcher_errors, f"offline_supervisor_failed: {watcher_errors}")
                if stage != "C" or not killed.is_set():
                    raise
            if stage != "C":
                browser.delete_session()
                process.terminate()
            process.wait(timeout=15)
            if stage == "C":
                require(process.returncode == -signal.SIGKILL and killed.is_set(), "offline_process_was_not_killed")
            report["process_exit"] = process.returncode
        finally:
            stop.set()
            if watcher:
                watcher.join(timeout=2)
            if process.poll() is None:
                process.kill()
                process.wait(timeout=15)
    print(json.dumps(report), flush=True)
    with root.joinpath("offline-results.jsonl").open("a") as output:
        output.write(json.dumps(report) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--scenario", choices=["recovery", "revoked", "epoch"], required=True)
    args = parser.parse_args()
    root = args.root.resolve()
    require(root.is_dir() and root.name.startswith("midori-sync-native-") and root.parent == Path("/tmp"),
            "offline_requires_private_test_root")
    require(Path(os.environ.get("MIDORI_SYNC_TEST_FIXTURE", "")).is_file()
            and os.environ.get("MIDORI_SYNC_TEST_KEYRING_ROOT") == str(root), "offline_requires_private_fixture_and_keyring")
    repository = Path(__file__).resolve().parent.parent
    for stage in (["A", "B", "C", "D"] if args.scenario == "recovery" else ["A", "B", "D"]):
        run_stage(repository, root, args.scenario, stage)
    shutil.rmtree(root / "offline-browser-profile")
    root.joinpath("offline-state.json").unlink()
    root.joinpath("receipt-checkpoint.json").unlink(missing_ok=True)
    print("Native browser offline stages passed without manual synchronization after startup.", flush=True)


if __name__ == "__main__":
    main()
