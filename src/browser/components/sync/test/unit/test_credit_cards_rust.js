/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global Assert, add_setup, load, do_get_file */

add_setup(async function rust_card_backend_is_active() {
  const { formAutofillStorage } = ChromeUtils.importESModule("resource://autofill/FormAutofillStorage.sys.mjs");
  await formAutofillStorage.initialize();
  Assert.equal(formAutofillStorage.creditCards.constructor.name, "RustAutofillCreditCardsAdapter");
});

load(do_get_file("test_credit_cards.js").path);
