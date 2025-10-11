"use strict";

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

// eslint-disable-next-line no-unused-vars
ChromeUtils.defineESModuleGetters(this, {
  Subprocess: "resource://gre/modules/Subprocess.sys.mjs",
});

// Given the full path to a python executable (pathToPython), this function
// looks up the ultimate "real" Python program that runs the Python script.
// By default, pathToPython runs Python in a virtualenv, which on Windows
// results in two python.exe being spawned: python.exe (at pathToPython) spawns
// a new python.exe (outside the virtualenv, but configured by the parent
// python.exe to use the virtualenv modules).
//
// In test_subprocess_stdin_closed_by_program test below in test_subprocess.js,
// we run a script that closes stdin. This closed stdin does not propagate back
// via the parent python.exe, so to make sure that it does, we directly launch
// the real Python interpreter. This runs outside the virtualenv.
//
// Similarly, test_subprocess_stdout_closed_by_program in test_subprocess.js
// runs a script that closes stdout, which only propagates back to the program
// when the real Python interpreter is launched instead of a wrapper.
async function getRealPythonExecutable(pathToPython) {
  const TEST_SCRIPT = do_get_file("data_test_script.py").path;
  let proc = await Subprocess.call({
    command: pathToPython,
    arguments: ["-u", TEST_SCRIPT, "print_python_executable_path"],
  });
  let { exitCode } = await proc.wait();
  equal(exitCode, 0, "Successfully got executable path");
  let count = await proc.stdout.readUint32();
  let realPythonPath = await proc.stdout.readString(count);
  ok(realPythonPath, `Found path to Python program: ${realPythonPath}`);
  return realPythonPath;
}
