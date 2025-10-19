//
// Run test script in content process instead of chrome (xpcshell's default)
//

const overrideService = Cc[
  "@mozilla.org/network/native-dns-override;1"
].getService(Ci.nsINativeDNSResolverOverride);

// This domain used to resolve. We fake the response to avoid
// depending on the network for automated tests.
overrideService.addIPOverride("xn--bcher-kva.org", "127.0.0.1");

function run_test() {
  run_test_in_child("../unit/test_dns_service.js");
}
