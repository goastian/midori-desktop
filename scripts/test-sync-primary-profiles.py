#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import argparse
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time

from marionette_driver.marionette import Marionette


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def run_stage(repository, root, stage):
    object_dir = repository / "engine/obj-x86_64-pc-linux-gnu"
    binary = object_dir / "dist/bin/midori"
    profile = root / f"primary-profile-{stage}"
    backups = {"C": "A", "D": "B", "E": "legacy", "F": "restart"}
    if stage in backups:
        shutil.copytree(root / f"primary-backup-{backups[stage]}", profile)
    else:
        profile.mkdir(mode=0o700)
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
        "identity.fxaccounts.enabled": False,
        "signon.storage.rust.enabled": False,
        "signon.storage.rust.active": False,
        "extensions.formautofill.addresses.storage.rust.enabled": False,
        "extensions.formautofill.addresses.storage.rust.active": False,
        "extensions.formautofill.creditCards.storage.rust.enabled": False,
        "extensions.formautofill.creditCards.storage.rust.active": False,
    }
    if stage == "F":
        preferences["midori.sync.enabled"] = True
    profile.joinpath("user.js").write_text("\n".join(
        f"user_pref({json.dumps(name)}, {json.dumps(value)});" for name, value in preferences.items()
    ))
    environment = dict(os.environ, MOZ_HEADLESS="1", MIDORI_SYNC_PROFILE_STAGE=stage,
                       MIDORI_SYNC_PROFILE_STATE_FILE=str(root / "primary-state.json"),
                       MIDORI_SYNC_PROFILE_STATUS_FILE=str(root / "primary-status.json"))
    with root.joinpath(f"primary-{stage}.log").open("w") as output:
        process = subprocess.Popen([
            str(binary), "--headless", "--no-remote", "--profile", str(profile),
            "--marionette", "--remote-allow-system-access", "about:blank",
        ], env=environment, stdout=output, stderr=subprocess.STDOUT)
        browser = Marionette(host="127.0.0.1", port=port)
        try:
            deadline = time.monotonic() + 45
            while True:
                require(process.poll() is None, "primary_browser_exited_before_session")
                try:
                    with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                        break
                except OSError:
                    require(time.monotonic() < deadline, "primary_browser_start_timeout")
                    time.sleep(0.1)
            browser.start_session()
            browser.set_context("chrome")
            browser.timeout.script = 360
            identity = browser.execute_script("return {pid: Services.appinfo.processID, profile: PathUtils.profileDir};")
            require(identity == {"pid": process.pid, "profile": str(profile)}, "unexpected_primary_session")
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
                  resources.setSubstitution("midori-sync-primary-test", uri(testDirectory));
                  const { Assert: Assertion } = ChromeUtils.importESModule("resource://testing-common/Assert.sys.mjs");
                  const tasks = [], cleanups = [];
                  const { MidoriSyncService } = ChromeUtils.importESModule("resource:///modules/MidoriSyncService.sys.mjs");
                  const syncHistory = MidoriSyncService.syncHistory;
                  MidoriSyncService.syncHistory = async function(options) {
                    const result = await syncHistory.call(this, options);
                    messages.push(`History page: ${JSON.stringify({capture: result.capture, more: result.more})}`);
                    return result;
                  };
                  cleanups.push(() => { MidoriSyncService.syncHistory = syncHistory; });
                  let checks = 0;
                  const assertion = new Assertion(error => { ++checks; if (error) { throw error; } }, true);
                  const scope = Components.utils.Sandbox(Services.scriptSecurityManager.getSystemPrincipal(), { sandboxPrototype: window });
                  const imports = Object.create(ChromeUtils);
                  imports.importESModule = (path, ...args) => ChromeUtils.importESModule(
                    path.replace("resource://midori-sync-test/", "resource:///modules/"), ...args);
                  Object.assign(scope, { ChromeUtils: imports, Cc, Ci, Cr, Services, IOUtils, PathUtils,
                    TextEncoder, structuredClone, Assert: assertion, add_task: task => tasks.push(task),
                    MidoriSyncTransport: ChromeUtils.importESModule("resource:///modules/MidoriSyncTransport.sys.mjs").MidoriSyncTransport,
                    info: message => messages.push(String(message)),
                    registerCleanupFunction: task => cleanups.push(task) });
                  Services.scriptloader.loadSubScript("resource://midori-sync-primary-test/test_native_profiles.js", scope);
                  for (const task of tasks) { await task(); }
                  for (const cleanup of cleanups.reverse()) { await cleanup(); }
                  done({ok: true, checks});
                })().catch(error => done({ok: false, error: String(error), stack: String(error.stack), messages: messages.slice(-3)}));
            """, script_args=[str(repository / "src/browser/components/sync/test/integration") + "/",
                               str(object_dir / "_tests/modules") + "/"])
            require(result.get("ok") and result.get("checks", 0) > 0, f"primary_browser_verification_failed: {result}")
            browser.delete_session()
            process.terminate()
            process.wait(timeout=15)
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=15)
    if stage in {"A", "B"}:
        shutil.copytree(profile, root / f"primary-backup-{stage}")
    if stage == "B":
        legacy = root / "primary-backup-legacy"
        shutil.copytree(root / "primary-backup-A", legacy)
        legacy.joinpath("signedInUser.json").write_text(json.dumps({"version": 1, "accountData": {
            "uid": "synthetic-fxa-uid", "email": "legacy@example.invalid", "sessionToken": "synthetic-fxa-session", "verified": True}}))
    if stage == "E":
        shutil.copytree(profile, root / "primary-backup-restart")
    return {"stage": stage, "checks": result["checks"], "process_exit": process.returncode,
            "transport": "http", "runtime": "browser", "isolated_profile_verified": True}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    args = parser.parse_args()
    root = args.root.resolve()
    require(root.is_dir() and root.parent == Path("/tmp") and root.name.startswith("midori-sync-native-"), "invalid_primary_test_root")
    repository = Path(__file__).resolve().parent.parent
    rows = []
    for stage in ["A", "B", "G", "H", "E", "F", "C", "D"]:
        report = run_stage(repository, root, stage)
        rows.append(report)
        with root.joinpath("primary-results.jsonl").open("a") as output:
            output.write(json.dumps(report) + "\n")
        print(json.dumps(report), flush=True)
    require([row["stage"] for row in rows] == ["A", "B", "G", "H", "E", "F", "C", "D"], "primary_stages_missing")
    for path in [*root.glob("primary-profile-*"), *root.glob("primary-backup-*")]:
        shutil.rmtree(path)
    root.joinpath("primary-state.json").unlink()


if __name__ == "__main__":
    main()
