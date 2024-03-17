/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Bug 947 - Misskey.io doesn't work with Firefox ESR 115. This is a temporary fix for cannot react to user posts.
// docs: https://developer.mozilla.org/docs/Web/API/Navigator/userActivation

navigator.userActivation = {
    isActive: true,
    hasBeenActive: true,
};
