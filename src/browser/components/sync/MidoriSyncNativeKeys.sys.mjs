/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MidoriSyncKeys } from "./MidoriSyncKeys.sys.mjs";

export function createNativeSyncKeys(account) {
  return new MidoriSyncKeys({
    account,
    cryptoFactory: () => Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto),
    randomBytes(length) {
      const random = Cc["@mozilla.org/security/random-generator;1"].getService(Ci.nsIRandomGenerator)
        .generateRandomBytes(length);
      const bytes = Uint8Array.from(random);
      random.fill(0);
      return bytes;
    },
  });
}
