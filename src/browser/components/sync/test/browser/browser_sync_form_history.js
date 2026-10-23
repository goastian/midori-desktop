/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

add_task(async function a_synchronized_form_value_is_offered_and_selected_on_a_real_page() {
  while (gBrowser.tabs.length > 1) {
    await BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
  await SpecialPowers.pushPrefEnv({ set: [["browser.formfill.enable", true]] });
  const { MidoriSyncFormHistory } = ChromeUtils.importESModule("resource:///modules/MidoriSyncFormHistory.sys.mjs");
  const { FormHistory } = ChromeUtils.importESModule("resource://gre/modules/FormHistory.sys.mjs");
  const crypto = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  const handle = await crypto.generateNativeKey(JSON.stringify([
    "https://sync.example.invalid/", "https://accounts.example.invalid/", "h2-form-page",
  ]));
  const deriveRecordId = (collection, bytes) => crypto.deriveNativeRecordId(handle, collection, bytes);
  const adapter = new MidoriSyncFormHistory({ deriveRecordId });
  const value = { version: 1, fieldname: "midori-sync-saved-note", value: "Bogotá 日本語 Sync",
    firstUsed: Date.now() * 1000 - 2000000, lastUsed: Date.now() * 1000 - 1000000, timesUsed: 3 };
  const bytes = new TextEncoder().encode(JSON.stringify([value.fieldname, value.value]));
  const id = `f1:${await deriveRecordId("form-history", bytes)}`;
  bytes.fill(0);
  const url = getRootDirectory(gTestPath).replace("chrome://mochitests/content", "https://example.com") + "file_sync_autofill.html";
  try {
    Assert.deepEqual(await adapter.apply({ id, deleted: false, value }), { status: "applied" });
    await BrowserTestUtils.withNewTab({ gBrowser, url }, async browser => {
      await SimpleTest.promiseFocus(browser);
      await SpecialPowers.spawn(browser, [], () => content.document.getElementById("note").focus());
      const shown = BrowserTestUtils.waitForPopupEvent(browser.autoCompletePopup, "shown");
      await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
      await shown;
      ok(browser.autoCompletePopup.richlistbox.itemCount > 0, "The synchronized form suggestion is visible");
      await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
      await BrowserTestUtils.synthesizeKey("VK_RETURN", {}, browser);
      await SpecialPowers.spawn(browser, [value.value], async expected => {
        await ContentTaskUtils.waitForCondition(() => content.document.getElementById("note").value === expected,
          "The selected form suggestion fills the input");
        Assert.equal(content.document.getElementById("note").value, expected);
      });
    });
  } finally {
    adapter.close();
    crypto.close();
    await FormHistory.update({ op: "remove", fieldname: value.fieldname });
    await SpecialPowers.popPrefEnv();
  }
});
