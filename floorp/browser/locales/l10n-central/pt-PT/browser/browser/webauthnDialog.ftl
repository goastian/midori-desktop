# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Variables:
#  $retriesLeft (Number): number of tries left
webauthn-pin-invalid-prompt =
    { $retriesLeft ->
        [0] PIN incorreto! Por favor, insira o PIN correto para o seu dispositivo.
        [one] PIN incorreto! Por favor, insira o PIN correto para o seu dispositivo. Tem mais { $retriesLeft } tentativa.
       *[other] PIN incorreto! Por favor, insira o PIN correto para o seu dispositivo. Tem mais { $retriesLeft } tentativas.
    }
# Variables:
#  $retriesLeft (Number): number of tries left
webauthn-pin-invalid-long-prompt =
    { $retriesLeft ->
        [one] PIN incorreto. Tem { $retriesLeft } tentativa remanescente antes de perder, de forma permanente, o acesso às credenciais neste dispositivo.
       *[other] PIN incorreto. Tem { $retriesLeft } tentativas remanescentes antes de perder, de forma permanente, o acesso às credenciais neste dispositivo.
    }
webauthn-pin-invalid-short-prompt = PIN incorreto. Tente novamente.
webauthn-pin-required-prompt = Por favor, insira o PIN para o seu dispositivo.
