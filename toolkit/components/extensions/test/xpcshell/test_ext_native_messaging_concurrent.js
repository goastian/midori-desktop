/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
"use strict";

AddonTestUtils.init(this);

const ECHO_BODY = String.raw`
  import struct
  import sys

  stdin = getattr(sys.stdin, 'buffer', sys.stdin)
  stdout = getattr(sys.stdout, 'buffer', sys.stdout)

  while True:
    rawlen = stdin.read(4)
    if len(rawlen) == 0:
      sys.exit(0)
    msglen = struct.unpack('@I', rawlen)[0]
    msg = stdin.read(msglen)

    stdout.write(struct.pack('@I', msglen))
    stdout.write(msg)
`;

const SCRIPTS = [
  {
    name: "echo",
    description: "a native app that echoes back messages it receives",
    script: ECHO_BODY.replace(/^ {2}/gm, ""),
  },
];

function loadTestExtension({ background }) {
  return ExtensionTestUtils.loadExtension({
    background,
    manifest: {
      browser_specific_settings: { gecko: { id: ID } },
      permissions: ["nativeMessaging"],
    },
  });
}

add_setup(async () => {
  await ExtensionTestUtils.startAddonManager();
  await setupHosts(SCRIPTS);
});

// Regression test for https://bugzilla.mozilla.org/show_bug.cgi?id=1979546
add_task(async function test_many_connectNative_calls() {
  let extension = loadTestExtension({
    async background() {
      // Prior to bug 1979546 being fixed, the test got stuck on Windows at 16.
      // Let's verify that things run smoothly even if we launch "many" more,
      // e.g. 70 (arbitrarily chosen, higher than 64).
      const NUMBER_OF_CONCURRENT_NATIVE_MESSAGING_APPS = 70;

      const openPorts = [];
      const remainingMsgs = new Set();
      const firstMessagePromises = [];
      for (let i = 0; i < NUMBER_OF_CONCURRENT_NATIVE_MESSAGING_APPS; ++i) {
        const dummyMsg = `pingpong-${i}`;
        const port = browser.runtime.connectNative("echo");
        openPorts[i] = port;
        remainingMsgs.add(i);
        firstMessagePromises[i] = new Promise(resolve => {
          port.onMessage.addListener(msg => {
            browser.test.assertEq(dummyMsg, msg, `Echoed back message ${i}`);
            remainingMsgs.delete(i);
            browser.test.log(`Remaining: ${Array.from(remainingMsgs)}`);
            resolve();
          });
          port.onDisconnect.addListener(() => {
            if (remainingMsgs.delete(i)) {
              // If the program somehow exits before it responded, note the
              // failure and continue (do not stay stuck).
              browser.test.fail(`onDisconnect fired before onMessage: ${i}`);
              resolve();
            } else {
              // onDisconnect should not fire when we call port.disconnect()
              // below.
              browser.test.fail(`Unexpected port.onDisconnect: ${i}`);
            }
          });
        });
        port.postMessage(dummyMsg);
      }
      browser.test.log(`Awaiting replies to: ${Array.from(remainingMsgs)}`);
      await Promise.all(firstMessagePromises);

      browser.test.log("Now verifying sendNativeMessage behavior");
      browser.test.assertEq(
        await browser.runtime.sendNativeMessage("echo", "one_off_msg"),
        "one_off_msg",
        "sendNativeMessage can still roundtrip after so many connectNative"
      );
      for (const port of openPorts) {
        port.disconnect();
      }
      browser.test.sendMessage("done");
    },
  });
  await extension.startup();
  await extension.awaitMessage("done");
  info("Waiting for all echo processes to have exit");
  await waitForSubprocessExit();
  await extension.unload();
});
