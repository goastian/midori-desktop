/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { OSKeyStoreTestUtils } = ChromeUtils.importESModule("resource://testing-common/OSKeyStoreTestUtils.sys.mjs");

add_task(async function a_synchronized_card_is_offered_after_reopening_the_store_and_fills_a_real_page() {
  while (gBrowser.tabs.length > 1) {
    await BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
  OSKeyStoreTestUtils.setup();
  registerCleanupFunction(async () => OSKeyStoreTestUtils.cleanup());
  await SpecialPowers.pushPrefEnv({ set: [
    ["extensions.formautofill.creditCards.enabled", true],
    ["extensions.formautofill.creditCards.supported", "on"],
    ["extensions.formautofill.reauth.enabled", false],
    ["extensions.formautofill.heuristics.enabled", true],
  ] });
  const { MidoriSyncCreditCards } = ChromeUtils.importESModule("resource:///modules/MidoriSyncCreditCards.sys.mjs");
  const { formAutofillStorage } = ChromeUtils.importESModule("resource://autofill/FormAutofillStorage.sys.mjs");
  const { FormAutofillParent } = ChromeUtils.importESModule("resource://autofill/FormAutofillParent.sys.mjs");
  const id = "synccard1234";
  const value = { version: 1, name: "Sync Example", number: "4111111111111111", month: 12, year: 2032 };
  const url = getRootDirectory(gTestPath).replace("chrome://mochitests/content", "https://example.com") + "file_sync_cards.html";
  let adapter = new MidoriSyncCreditCards();
  let observer;
  try {
    Assert.deepEqual(await adapter.apply({ id, deleted: false, value }), { status: "applied" });
    adapter.close();
    adapter = new MidoriSyncCreditCards();
    Assert.deepEqual(await adapter.read(id), value, "The card survives reopening the profile store");
    await BrowserTestUtils.withNewTab({ gBrowser, url }, async browser => {
      await SimpleTest.promiseFocus(browser);
      const identified = new Promise(resolve => {
        observer = { fieldsIdentified: resolve };
        FormAutofillParent.addMessageObserver(observer);
      });
      await SpecialPowers.spawn(browser, [], () => content.document.getElementById("cc-number").focus());
      await identified;
      FormAutofillParent.removeMessageObserver(observer);
      observer = null;
      const shown = BrowserTestUtils.waitForPopupEvent(browser.autoCompletePopup, "shown");
      await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
      await shown;
      ok(browser.autoCompletePopup.richlistbox.itemCount > 0, "The native card suggestion is visible");
      await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
      await BrowserTestUtils.synthesizeKey("VK_RETURN", {}, browser);
      await SpecialPowers.spawn(browser, [value], async card => {
        await ContentTaskUtils.waitForCondition(() => content.document.getElementById("cc-number").value === card.number,
          "The selected synchronized card fills the number");
        Assert.equal(content.document.getElementById("cc-name").value, card.name);
      });
    });
  } finally {
    if (observer) {
      FormAutofillParent.removeMessageObserver(observer);
    }
    adapter.close();
    await formAutofillStorage.creditCards.remove(id, { sourceSync: true });
    await SpecialPowers.popPrefEnv();
  }
});
