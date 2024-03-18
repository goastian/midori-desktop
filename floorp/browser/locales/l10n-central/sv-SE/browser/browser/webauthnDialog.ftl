# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Variables:
#  $retriesLeft (Number): number of tries left
webauthn-pin-invalid-prompt =
    { $retriesLeft ->
        [0] Fel PIN-kod! Ange rätt PIN-kod för din enhet.
        [one] Fel PIN-kod! Ange rätt PIN-kod för din enhet. Du har { $retriesLeft } försök kvar.
       *[other] Fel PIN-kod! Ange rätt PIN-kod för din enhet. Du har { $retriesLeft } försök kvar.
    }
# Variables:
#  $retriesLeft (Number): number of tries left
webauthn-pin-invalid-long-prompt =
    { $retriesLeft ->
        [one] Felaktig PIN-kod. Du har { $retriesLeft } försök kvar innan du permanent förlorar åtkomsten till användaruppgifterna på den här enheten.
       *[other] Felaktig PIN-kod. Du har { $retriesLeft } försök kvar innan du permanent förlorar åtkomsten till användaruppgifterna på den här enheten.
    }
webauthn-pin-invalid-short-prompt = Felaktig PIN-kod. Försök igen.
webauthn-pin-required-prompt = Ange PIN-koden för din enhet.
# Variables:
#  $retriesLeft (Number): number of tries left
webauthn-uv-invalid-long-prompt =
    { $retriesLeft ->
        [one] Användarverifiering misslyckades. Du har { $retriesLeft } försök kvar. Försök igen.
       *[other] Användarverifiering misslyckades. Du har { $retriesLeft } försök kvar. Försök igen.
    }
webauthn-uv-invalid-short-prompt = Användarverifiering misslyckades. Försök igen.
