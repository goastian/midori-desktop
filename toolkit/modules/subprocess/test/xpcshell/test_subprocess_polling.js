"use strict";

const { getSubprocessImplForTest } = ChromeUtils.importESModule(
  "resource://gre/modules/Subprocess.sys.mjs"
);

let PYTHON;
const TEST_SCRIPT = do_get_file("data_test_script.py").path;

add_setup(async () => {
  PYTHON = await Subprocess.pathSearch(Services.env.get("PYTHON"));
});

// When the last process exits, we should stop polling.
// This is a regression test for bug 1982950
add_task(async function test_polling_only_when_process_is_running() {
  let worker = getSubprocessImplForTest().Process.getWorker();

  equal(
    await worker.call("getIsPolling", []),
    false,
    "Initially not polling before starting a program"
  );

  let proc = await Subprocess.call({
    command: PYTHON,
    arguments: ["-u", TEST_SCRIPT, "close_pipes_and_wait_for_stdin"],
  });

  equal(
    await worker.call("getIsPolling", []),
    true,
    "Is polling while process is active"
  );

  // TODO bug 1983138: Re-enable this check once readString() resolves on error
  // instead of timing out.
  // // This verifies that read() returns when stdout is closed prematurely.
  // equal(
  //   await proc.stdout.readString(),
  //   "",
  //   "Test program should have closed stdout prematurely without stdout"
  // );

  equal(
    await worker.call("getIsPolling", []),
    true,
    "Is still polling while process is active"
  );

  info("Closing stdin to trigger exit");
  await proc.stdin.close();

  let { exitCode } = await proc.wait();
  equal(exitCode, 0, "Got expected exit code");

  equal(
    await worker.call("getIsPolling", []),
    false,
    "Not polling when last process has exited"
  );
});
