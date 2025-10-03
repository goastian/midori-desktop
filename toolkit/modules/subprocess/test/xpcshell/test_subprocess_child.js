"use strict";

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
const { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

let PYTHON;

add_setup(async () => {
  PYTHON = await Subprocess.pathSearch(Services.env.get("PYTHON"));
});

// Send a request to the test server. We expect a non-empty response. Any error
// is caught and returned as an empty string.
async function fetchResponseText(url, method) {
  const timeoutCtrl = new AbortController();

  // We expect the (localhost) server to respond soon. If the server is not
  // listening, we will eventually time out. Let's have a generous deadlines:
  // - DELETE is given plenty of time, because the request is expected to
  //   always be accepted, followed by IPC and process termination.
  // - GET is given a short deadline, because we expect either an immediate
  //   response (server is around) or no response (server was closed).
  const timeout = method === "DELETE" ? 10000 : 1000;
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  setTimeout(() => timeoutCtrl.abort(), timeout);
  // (^ AbortSignal.timeout() would be nicer but cannot be used, because it
  //    throws: "The current global does not support timeout".)

  try {
    let res = await fetch(url, { method, signal: timeoutCtrl.signal });
    return await res.text();
  } catch (e) {
    info(`fetch() request to kill parent failed: ${e}`);
    if (
      e.name !== "AbortError" &&
      e.message !== "NetworkError when attempting to fetch resource."
    ) {
      ok(false, `Unexpected error: ${e}`);
    }
    return "";
  }
}

async function do_test_spawn_parent_with_child(isBreakAwayJob) {
  let testCmd;
  if (isBreakAwayJob) {
    Assert.equal(AppConstants.platform, "win", "Breakaway is Windows-only");
    testCmd = "spawn_child_in_breakaway_job_and_exit";
  } else {
    testCmd = "spawn_child_and_exit";
  }
  const TEST_SCRIPT = do_get_file("data_test_child.py").path;
  info(`Launching proc: ${PYTHON} -u ${TEST_SCRIPT} ${testCmd}`);
  const proc = await Subprocess.call({
    command: PYTHON,
    arguments: ["-u", TEST_SCRIPT, testCmd],
  });
  const exitPromise = proc.wait();
  let exited = false;
  exitPromise.then(() => {
    exited = true;
  });

  info(`Spawned process with pid ${proc.pid}, waiting for child`);

  // We'll accumulate stdout, and reset what we've received so far after
  // checking that the content matches with our expectations.
  let stdoutText = "";
  let stdoutDonePromise = (async () => {
    let seenParentExit = false;
    for (let s; (s = await proc.stdout.readString()); ) {
      // On Windows, print() uses \r\n instead of \n. Drop it.
      s = s.replaceAll("\r", "");
      stdoutText += s;
      dump(`Received stdout from test script: ${s}\n`);

      seenParentExit ||= stdoutText.includes("parent_exit");
      if (!seenParentExit) {
        Assert.ok(!exited, "Process should not have exited yet");
      }
    }
  })();

  const EXPECTED_STDOUT_UNTIL_LISTENING = `\
1. parent_start
2. first_child_start_and_exit
3. parent_after_first_child_exit
4. spawned_child_start
5. Listening at `; // followed by http://127.0.0.1:<digits>\n
  const EXPECTED_STDOUT_AT_PARENT_EXIT = `\
6. child_received_http_request
7. data_from_child:kill_parent
8. parent_exit
`;
  const EXPECTED_STDOUT_AT_CHILD_EXIT = `\
9. spawned_child_exit
`;

  await TestUtils.waitForCondition(
    () => stdoutText.startsWith(EXPECTED_STDOUT_UNTIL_LISTENING),
    "Waiting for (parent) process to start child with listening HTTP server"
  );

  const url = stdoutText.replace(EXPECTED_STDOUT_UNTIL_LISTENING, "").trim();
  ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(url), `Found server URL: ${url}`);
  stdoutText = ""; // Reset now that we have confirmed its content.

  // When the server receives this request, it triggers exit of the process.
  const promiseResponseToExitParent = fetchResponseText(url, "DELETE");

  info("Waiting for spawned (parent) process to exit");
  const { exitCode } = await exitPromise;
  equal(exitCode, 0, "Got expected exit code");
  equal(stdoutText, EXPECTED_STDOUT_AT_PARENT_EXIT, "stdout before exit");
  stdoutText = ""; // Reset again after checking its content.

  // Now two things can happen:
  // - Either the child lives on, and we can send a request to it to ask the
  //   child to exit as well.
  // - Or the process tree rooted at the parent dies, and the child is taken
  //   with it. The initial fetch() might succeed or reject. A new fetch() is
  //   most likely going to reject.
  // On Linux and macOS, the child appears to live on.
  // On Windows, the whole process tree dies, when run under this test
  //  (but somehow not when the Python script is run in isolation...?).

  const responseToExitParent = await promiseResponseToExitParent;
  if (!responseToExitParent) {
    info("fetch() request to kill parent failed");
  }

  info("Checking whether the child process is still alive...");
  const responseToChildAlive = await fetchResponseText(url, "GET");
  const wasChildAlive = !!responseToChildAlive;

  if (wasChildAlive) {
    // Mainly a sanity check: If the second request gots through, then the
    // first request should have received the expected response.
    equal(responseToExitParent, "child_process_still_alive_1", "Still alive 1");
    equal(responseToChildAlive, "child_process_still_alive_2", "Still alive 2");
  } else {
    info("fetch() request to check child liveness failed");
  }

  if (AppConstants.platform === "win" && !isBreakAwayJob) {
    ok(!wasChildAlive, "Child process exits when the parent exits");
  } else {
    ok(wasChildAlive, "Child process outlives parent");
  }

  await stdoutDonePromise;

  // On Windows, we close the pipes as soon as the parent process was detected
  // to have exited. This prevents the child's write to be read.
  if (wasChildAlive && AppConstants.platform !== "win") {
    equal(stdoutText, EXPECTED_STDOUT_AT_CHILD_EXIT, "Stdout from child");
  } else {
    equal(stdoutText, "", "No more stdout after parent exited (with child)");
  }
}

// Tests spawning a process that exits after spawning a child process, and
// verify that the parent process is detected as exited, while the child
// process is still running.
add_task(async function test_spawn_child_outliving_parent_process() {
  // Our subprocess implementation (subprocess_win.worker.js) puts the spawned
  // process in a job, and cleans up that job upon process exit by calling
  // TerminateJobObject. This causes all other (child) processes that are part
  // of the job to terminate. To make sure that the child process outlives the
  // parent, we have to launch it with the CREATE_BREAKAWAY_FROM_JOB flag.
  const isBreakAwayJob = AppConstants.platform == "win";
  await do_test_spawn_parent_with_child(isBreakAwayJob);
});

// On Windows, child processes are terminated along with the parent by default,
// because our subprocess implementation puts the process in a Job, and the
// TerminateJobObject call terminates all associated child processes. This
// test confirms the default behavior, as opposed to what we see in
// test_spawn_child_outliving_parent_process.
add_task(
  { skip_if: () => AppConstants.platform != "win" },
  async function test_child_terminated_on_process_termination() {
    await do_test_spawn_parent_with_child(false);
  }
);

add_task(async function test_cleanup() {
  let { getSubprocessImplForTest } = ChromeUtils.importESModule(
    "resource://gre/modules/Subprocess.sys.mjs"
  );

  let worker = getSubprocessImplForTest().Process.getWorker();

  let openFiles = await worker.call("getOpenFiles", []);
  let processes = await worker.call("getProcesses", []);

  equal(openFiles.size, 0, "No remaining open files");
  equal(processes.size, 0, "No remaining processes");
});
