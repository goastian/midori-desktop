# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Variables:
#  $retriesLeft (Number): number of tries left
webauthn-pin-invalid-long-prompt =
    { $retriesLeft ->
        [one] Yanlış PIN. { $retriesLeft } kere daha yanlış PIN girerseniz bu cihazdaki kimlik bilgilerine erişiminizi kalıcı olarak kaybedeceksiniz.
       *[other] Yanlış PIN. { $retriesLeft } kere daha yanlış PIN girerseniz bu cihazdaki kimlik bilgilerine erişiminizi kalıcı olarak kaybedeceksiniz.
    }
webauthn-pin-invalid-short-prompt = Yanlış PIN. Yeniden deneyin.
webauthn-pin-required-prompt = Lütfen cihazınızın PIN’ini yazın.

# Variables:
#  $retriesLeft (Number): number of tries left
webauthn-uv-invalid-long-prompt =
    { $retriesLeft ->
        [one] Kullanıcı doğrulaması başarısız oldu. { $retriesLeft } deneme hakkınız kaldı. Yeniden deneyin.
       *[other] Kullanıcı doğrulaması başarısız oldu. { $retriesLeft } deneme hakkınız kaldı. Yeniden deneyin.
    }
webauthn-uv-invalid-short-prompt = Kullanıcı doğrulaması başarısız oldu. Yeniden deneyin.
