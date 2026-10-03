/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

do_get_profile();

const { HttpServer } = ChromeUtils.importESModule("resource://testing-common/httpd.sys.mjs");
const modules = Services.dirsvc.get("GreD", Ci.nsIFile);
modules.append("browser");
modules.append("modules");
Assert.ok(modules.isDirectory(), "Browser modules are available in the test build");
const resourceHandler = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
const modulesURI = Services.io.newURI(`${Services.io.newFileURI(modules).spec.replace(/\/$/, "")}/`);
resourceHandler.setSubstitution("midori-sync-test", modulesURI);
registerCleanupFunction(() => resourceHandler.setSubstitution("midori-sync-test", null));
const { MidoriSyncTransport } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncTransport.sys.mjs");

async function withSyncServer(task) {
  const server = new HttpServer();
  server.start(-1);
  const transport = new MidoriSyncTransport(`http://localhost:${server.identity.primaryPort}/`, {
    allowLocalHTTP: true,
  });
  try {
    await task(server, transport);
  } finally {
    transport.close();
    await new Promise(resolve => server.stop(resolve));
  }
}

function respondJSON(response, data, status = 200) {
  response.setStatusLine("1.1", status, "Test");
  response.setHeader("Content-Type", "application/json", false);
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  response.write(Array.from(bytes, byte => String.fromCharCode(byte)).join(""));
}
