/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

add_task(async function a_synchronized_address_is_offered_and_fills_a_real_page() {
  while (gBrowser.tabs.length > 1) {
    await BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
  await SpecialPowers.pushPrefEnv({ set: [
    ["extensions.formautofill.addresses.enabled", true],
    ["extensions.formautofill.addresses.supported", "on"],
    ["extensions.formautofill.heuristics.enabled", true],
  ] });
  const { MidoriSyncAddresses } = ChromeUtils.importESModule("resource:///modules/MidoriSyncAddresses.sys.mjs");
  const { formAutofillStorage } = ChromeUtils.importESModule("resource://autofill/FormAutofillStorage.sys.mjs");
  const { FormAutofillParent } = ChromeUtils.importESModule("resource://autofill/FormAutofillParent.sys.mjs");
  const adapter = new MidoriSyncAddresses();
  const id = "syncpage1234";
  const value = { version: 1, nativeVersion: 1, fields: {
    name: "María Sync Example", "street-address": "123 Main Street", "address-level2": "Mountain View",
    "address-level1": "CA", "postal-code": "94043", country: "US", email: "sync@example.invalid", tel: "+16505550123",
  }, timeCreated: Date.now() - 1000, timeLastModified: Date.now(), timeLastUsed: 0, timesUsed: 0 };
  const url = getRootDirectory(gTestPath).replace("chrome://mochitests/content", "https://example.com") + "file_sync_autofill.html";
  let observer;
  try {
    Assert.deepEqual(await adapter.apply({ id, deleted: false, value }), { status: "applied" });
    await BrowserTestUtils.withNewTab({ gBrowser, url }, async browser => {
      await SimpleTest.promiseFocus(browser);
      const identified = new Promise(resolve => {
        observer = { fieldsIdentified: resolve };
        FormAutofillParent.addMessageObserver(observer);
      });
      await SpecialPowers.spawn(browser, [], () => content.document.getElementById("name").focus());
      await identified;
      FormAutofillParent.removeMessageObserver(observer);
      observer = null;
      const shown = BrowserTestUtils.waitForPopupEvent(browser.autoCompletePopup, "shown");
      await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
      await shown;
      ok(browser.autoCompletePopup.richlistbox.itemCount > 0, "The native address suggestion is visible");
      await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
      await BrowserTestUtils.synthesizeKey("VK_RETURN", {}, browser);
      await SpecialPowers.spawn(browser, [value.fields], async fields => {
        await ContentTaskUtils.waitForCondition(() => content.document.getElementById("name").value === fields.name,
          "The selected synchronized address fills the page");
        for (const [element, field] of [["name", "name"], ["street", "street-address"], ["city", "address-level2"],
          ["state", "address-level1"], ["postal", "postal-code"], ["country", "country"], ["email", "email"]]) {
          const expected = element === "state" ? "California" : fields[field];
          Assert.equal(content.document.getElementById(element).value, expected, `${field} fills from native storage`);
        }
      });
    });
  } finally {
    if (observer) {
      FormAutofillParent.removeMessageObserver(observer);
    }
    adapter.close();
    await formAutofillStorage.addresses.remove(id, { sourceSync: true });
    await SpecialPowers.popPrefEnv();
  }
});
