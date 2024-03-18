# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Variables:
#  $retriesLeft (Number): number of tries left
webauthn-pin-invalid-prompt =
    { $retriesLeft ->
        [0] PIN 碼錯誤！請輸入正確的 PIN 碼。
       *[other] PIN 碼錯誤！請輸入正確的 PIN 碼。您還剩下 { $retriesLeft } 次機會。
    }
# Variables:
#  $retriesLeft (Number): number of tries left
webauthn-pin-invalid-long-prompt = PIN 碼不正確，剩下 { $retriesLeft } 次機會。仍錯誤就會永久失去此裝置上儲存的登入資訊的存取權限。
webauthn-pin-invalid-short-prompt = PIN 碼不正確，請再試一次。
webauthn-pin-required-prompt = 請輸入您裝置的 PIN 碼。
