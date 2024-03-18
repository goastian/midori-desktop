# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Variables:
#  $retriesLeft (Number): number of tries left
webauthn-pin-invalid-prompt =
    { $retriesLeft ->
        [0] PIN salah! Masukkan PIN yang benar untuk perangkat Anda.
       *[other] PIN salah! Masukkan PIN yang benar untuk perangkat Anda. Anda memiliki { $retriesLeft } percobaan tersisa.
    }
webauthn-pin-required-prompt = Masukkan PIN untuk perangkat Anda.
