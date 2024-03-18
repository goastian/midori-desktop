# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Variables:
#  $retriesLeft (Number): number of tries left
webauthn-pin-invalid-long-prompt =
    { $retriesLeft ->
        [one] Неправильний PIN-код. У вас залишилася { $retriesLeft } спроба, до остаточної втратити доступу до облікових даних на цьому пристрої.
        [few] Неправильний PIN-код. У вас залишилося { $retriesLeft } спроби, до остаточної втратити доступу до облікових даних на цьому пристрої.
       *[many] Неправильний PIN-код. У вас залишилося { $retriesLeft } спроб, до остаточної втратити доступу до облікових даних на цьому пристрої.
    }
webauthn-pin-invalid-short-prompt = Неправильний PIN-код. Спробуйте ще раз.
webauthn-pin-required-prompt = Введіть PIN-код свого пристрою.
webauthn-select-sign-result-unknown-account = Невідомий обліковий запис
# Variables:
#  $retriesLeft (Number): number of tries left
webauthn-uv-invalid-long-prompt =
    { $retriesLeft ->
        [one] Не вдалося перевірити користувача. У вас залишилася { $retriesLeft } спроба.
        [few] Не вдалося перевірити користувача. У вас залишилося { $retriesLeft } спроби.
       *[many] Не вдалося перевірити користувача. У вас залишилося { $retriesLeft } спроб.
    }
webauthn-uv-invalid-short-prompt = Помилка перевірки користувача. Повторіть спробу.
