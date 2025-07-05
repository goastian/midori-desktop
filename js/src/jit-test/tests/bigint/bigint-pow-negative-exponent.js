// Fallible BigInt exponentiation should bail out when the power is negative.
function resumeAfterException(t) {
  for (var i = 0; i < 2; i++) {
    try {
      var x = 1;
      1n ** 1n;
      x = 2;
      1n ** t;
    } catch (e) {
      assertEq(x, 2);
    }
  }
}
resumeAfterException(1n);
resumeAfterException(-1n);
