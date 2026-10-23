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


def run_stage(repository, root, backend, change, stage, negative, privacy=False, permissions=False, extensions=False):
    object_dir = repository / "engine/obj-x86_64-pc-linux-gnu"
    binary = object_dir / "dist/bin/midori"
    profile = root / f"durability-{backend}-profile"
    profile.mkdir(mode=0o700, exist_ok=True)
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    preferences = {
        "marionette.port": port,
        "midori.sync.enabled": False,
        "midori.blocker.enabled": False,
        "browser.backup.enabled": False,
        "browser.shell.checkDefaultBrowser": False,
        "browser.startup.homepage_override.mstone": "ignore",
        "signon.storage.rust.enabled": backend == "rust",
        "signon.storage.rust.active": backend == "rust",
        "extensions.formautofill.addresses.storage.rust.enabled": backend == "rust",
        "extensions.formautofill.creditCards.storage.rust.enabled": backend == "rust",
        "extensions.formautofill.addresses.storage.rust.active": backend == "rust",
        "extensions.formautofill.creditCards.storage.rust.active": backend == "rust",
    }
    profile.joinpath("user.js").write_text("\n".join(
        f"user_pref({json.dumps(name)}, {json.dumps(value)});" for name, value in preferences.items()
    ))
    checkpoint = root / "durability-checkpoint.json"
    checkpoint.unlink(missing_ok=True)
    environment = dict(os.environ, MOZ_HEADLESS="1",
                       MIDORI_SYNC_DURABILITY_BACKEND=backend,
                       MIDORI_SYNC_DURABILITY_CHANGE=change,
                       MIDORI_SYNC_DURABILITY_STAGE=stage,
                       MIDORI_SYNC_DURABILITY_CHECKPOINT=str(checkpoint))
    if negative:
        environment["MIDORI_SYNC_DURABILITY_NEGATIVE_CONTROL"] = "1"
    if extensions:
        environment["TMPDIR"] = str(root)
        fixture = repository / "engine/toolkit/mozapps/extensions/test/xpinstall/amosigned.xpi"
        require(fixture.is_file(), "signed_extension_fixture_missing")
        environment["MIDORI_SYNC_SIGNED_EXTENSION_FIXTURE"] = str(fixture)
    report = {"backend": backend, "change": change, "stage": stage}
    if extensions:
        report["signed_fixture_sha256"] = hashlib.sha256(fixture.read_bytes()).hexdigest()
        report["certificate_override"] = False
    acknowledged = (["native-extensions"] if extensions else ["site-permissions"] if permissions else
                    ["midori-privacy"] if privacy else ["passwords", "addresses", "credit-cards", "browser-settings"])
    test_file = ("test_extension_durability.js" if extensions else "test_permission_durability.js" if permissions else
                 "test_privacy_durability.js" if privacy else "test_native_durability.js")
    watcher_error = []
    killed = threading.Event()
    stop = threading.Event()
    with root.joinpath(f"durability-{backend}-{change}-{stage}.log").open("w") as output:
        process = subprocess.Popen([
            str(binary), "--headless", "--no-remote", "--profile", str(profile),
            "--marionette", "--remote-allow-system-access", "about:blank",
        ], env=environment, stdout=output, stderr=subprocess.STDOUT)
        browser = Marionette(host="127.0.0.1", port=port)
        watcher = None
        try:
            deadline = time.monotonic() + 45
            while True:
                require(process.poll() is None, "durability_browser_exited_before_session")
                try:
                    with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                        break
                except OSError:
                    require(time.monotonic() < deadline, "durability_browser_start_timeout")
                    time.sleep(0.1)
            browser.start_session()
            browser.set_context("chrome")
            browser.timeout.script = 90
            identity = browser.execute_script("return {pid: Services.appinfo.processID, profile: PathUtils.profileDir};")
            require(identity == {"pid": process.pid, "profile": str(profile)}, "unexpected_durability_session")

            def terminate_at_ack():
                try:
                    deadline = time.monotonic() + 80
                    while not stop.wait(0.01):
                        require(time.monotonic() < deadline, "durability_checkpoint_timeout")
                        if not checkpoint.exists():
                            continue
                        state = json.loads(checkpoint.read_text())
                        command = Path(f"/proc/{process.pid}/cmdline").read_bytes().split(b"\0")
                        require(state.get("pid") == process.pid and state.get("profile") == str(profile)
                                and state.get("backend") == backend and state.get("change") == change
                                and state.get("acknowledged") == acknowledged
                                and Path(os.fsdecode(command[0])).resolve() == binary.resolve()
                                and os.fsencode(str(profile)) in command,
                                "unexpected_durability_checkpoint")
                        process.send_signal(signal.SIGKILL)
                        killed.set()
                        report["checkpoint"] = state
                        return
                except Exception as error:
                    watcher_error.append(error)

            if stage == "apply":
                watcher = threading.Thread(target=terminate_at_ack, daemon=True)
                watcher.start()
            try:
                result = browser.execute_async_script("""
                    const [modulePath, testPath, testingPath] = arguments;
                    const done = arguments[arguments.length - 1];
                    (async () => {
                      const resources = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
                      const uri = path => {
                        const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
                        file.initWithPath(path);
                        return Services.io.newFileURI(file);
                      };
                      resources.setSubstitution("midori-sync-test", uri(modulePath));
                      resources.setSubstitution("testing-common", uri(testingPath));
                      resources.setSubstitution("midori-sync-durability-test", uri(testPath.slice(0, testPath.lastIndexOf("/") + 1)));
                      const { Assert: Assertion } = ChromeUtils.importESModule("resource://testing-common/Assert.sys.mjs");
                      const tasks = [], cleanups = [];
                      let checks = 0;
                      const assertion = new Assertion(error => { ++checks; if (error) { throw error; } }, true);
                      const scope = Components.utils.Sandbox(Services.scriptSecurityManager.getSystemPrincipal(), { sandboxPrototype: window });
                      Object.assign(scope, { ChromeUtils, Cc, Ci, Cr, Services, IOUtils, PathUtils,
                        TextEncoder, structuredClone, Assert: assertion, add_task: task => tasks.push(task),
                        registerCleanupFunction: task => cleanups.push(task) });
                      Services.scriptloader.loadSubScript("resource://midori-sync-durability-test/" + testPath.slice(testPath.lastIndexOf("/") + 1), scope);
                      for (const task of tasks) { await task(); }
                      for (const cleanup of cleanups.reverse()) { await cleanup(); }
                      done({ok: true, checks});
                    })().catch(error => done({ok: false, error: String(error), stack: error.stack}));
                """, script_args=[str(object_dir / "dist/bin/browser/modules") + "/",
                                   str(repository / "src/browser/components/sync/test/integration" / test_file),
                                   str(object_dir / "_tests/modules") + "/"])
                require(result.get("ok") and result.get("checks", 0) > 0, f"durability_verification_failed: {result}")
                require(stage == "verify", "durability_apply_returned_without_termination")
                report["checks"] = result["checks"]
            except Exception:
                if watcher:
                    watcher.join(timeout=2)
                require(not watcher_error, f"durability_supervisor_failed: {watcher_error}")
                if stage != "apply" or not killed.is_set():
                    raise
            if stage == "verify":
                browser.delete_session()
                process.terminate()
            process.wait(timeout=15)
            if stage == "apply":
                require(process.returncode == -signal.SIGKILL and killed.is_set(), "durability_was_not_killed")
            report["process_exit"] = process.returncode
        finally:
            stop.set()
            if watcher:
                watcher.join(timeout=2)
            if process.poll() is None:
                process.kill()
                process.wait(timeout=15)
    print(json.dumps(report), flush=True)
    with root.joinpath("durability-results.jsonl").open("a") as output:
        output.write(json.dumps(report) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    scenario = parser.add_mutually_exclusive_group()
    scenario.add_argument("--privacy-filters", action="store_true")
    scenario.add_argument("--site-permissions", action="store_true")
    scenario.add_argument("--extensions", action="store_true")
    args = parser.parse_args()
    root = args.root.resolve()
    require(root.is_dir() and root.name.startswith("midori-sync-native-") and root.parent == Path("/tmp"),
            "durability_requires_private_test_root")
    repository = Path(__file__).resolve().parent.parent
    negative = os.environ.get("MIDORI_SYNC_DURABILITY_NEGATIVE_CONTROL") == "1"
    special = args.privacy_filters or args.site_permissions or args.extensions
    require(not (negative and special), "scenario_negative_control_not_implemented")
    backends = ["native"] if special else ["json", "rust"]
    for backend in backends:
        changes = (["create", "disable", "uninstall-user", "reinstall", "undo", "uninstall-policy", "uninstall-sync"] if args.extensions else
                   ["create", "update", "delete", "expired-offline", "expired-with-stale-marker", "removed-session", "removed-policy"] if args.site_permissions else
                   ["create", "update", "delete"] if args.privacy_filters else ["create", "update", "adopt", "delete"])
        for change in changes:
            for stage in ["apply", "verify"]:
                run_stage(repository, root, backend, change, stage, negative, args.privacy_filters, args.site_permissions, args.extensions)
        shutil.rmtree(root / f"durability-{backend}-profile")
    print("Seven native-extension SIGKILL cases and reopenings passed using the compiled permission backend; no server ACK tested." if args.extensions else
          "Seven site-permission SIGKILL cases and reopenings passed." if args.site_permissions else
          "Three custom-filter SIGKILL cases and reopenings passed." if args.privacy_filters else
          "Eight supervised SIGKILL cases and reopenings passed for four native families.", flush=True)


if __name__ == "__main__":
    main()
