# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Variables:
#  $retriesLeft (Number): number of tries left
webauthn-pin-invalid-prompt =
    { $retriesLeft ->
        [0] Hibás PIN! Adja meg az eszközének megfelelő PIN-kódot.
        [one] Hibás PIN! Adja meg az eszközének megfelelő PIN-kódot. Még { $retriesLeft } próbálkozása van hátra.
       *[other] Hibás PIN! Adja meg az eszközének megfelelő PIN-kódot. Még { $retriesLeft } próbálkozása van hátra.
    }
# Variables:
#  $retriesLeft (Number): number of tries left
webauthn-pin-invalid-long-prompt =
    { $retriesLeft ->
        [one] Helytelen PIN-kód. Még { $retriesLeft } próbálkozása van hátra, mielőtt véglegesen elveszíti a hitelesítő adatait ezen az eszközön.
       *[other] Helytelen PIN-kód. Még { $retriesLeft } próbálkozása van hátra, mielőtt véglegesen elveszíti a hitelesítő adatait ezen az eszközön.
    }
webauthn-pin-invalid-short-prompt = Helytelen PIN-kód. Próbálja meg újra.
webauthn-pin-required-prompt = Adja meg az eszköze PIN-kódját.
