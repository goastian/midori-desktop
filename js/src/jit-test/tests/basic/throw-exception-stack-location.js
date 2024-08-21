function throwValue(value) {
  throw value;
}

// Test for-of loops keep the exception stack.
function testForOfLoop() {
  function f() {
    for (let _ of [null]) {
      throwValue("exception-value");
    }
  }

  let info = getExceptionInfo(f);
  assertEq(info.exception, "exception-value");
  assertEq(info.stack.includes("throwValue"), true);
}
testForOfLoop();

// Test try-finally keep the exception stack.
function testFinally() {
  function f() {
    try {
      throwValue("exception-value");
    } finally {
    }
  }

  let info = getExceptionInfo(f);
  assertEq(info.exception, "exception-value");
  assertEq(info.stack.includes("throwValue"), true);
}
testFinally();

// Test try-catch-finally keep the exception stack.
function testCatchFinally() {
  function f() {
    try {
      throw null;
    } catch {
     throwValue("exception-value");
    } finally {
    }
  }

  let info = getExceptionInfo(f);
  assertEq(info.exception, "exception-value");
  assertEq(info.stack.includes("throwValue"), true);
}
testCatchFinally();
