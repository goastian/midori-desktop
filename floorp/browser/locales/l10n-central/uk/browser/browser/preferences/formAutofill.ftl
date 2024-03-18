# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## The address and credit card autofill management dialog in browser preferences

autofill-manage-addresses-title = Збережені адреси
autofill-manage-addresses-list-header = Адреси

autofill-manage-credit-cards-title = Збережені кредитні картки
autofill-manage-credit-cards-list-header = Кредитні картки

autofill-manage-dialog =
    .style = min-width: 560px
autofill-manage-remove-button = Вилучити
autofill-manage-add-button = Додати…
autofill-manage-edit-button = Змінити…

##

# The dialog title for creating addresses in browser preferences.
autofill-add-new-address-title = Додати нову адресу
# The dialog title for editing addresses in browser preferences.
autofill-edit-address-title = Змінити адресу

autofill-address-given-name = Ім'я
autofill-address-additional-name = По батькові
autofill-address-family-name = Прізвище
autofill-address-organization = Організація
autofill-address-street = Вулиця

## address-level-3 (Sublocality) names

# Used in IR, MX
autofill-address-neighborhood = Околиці
# Used in MY
autofill-address-village-township = Село чи селище
autofill-address-island = Острів
# Used in IE
autofill-address-townland = Містечко

## address-level-2 names

autofill-address-city = Місто
# Used in HK, SD, SY, TR as Address Level-2 and used in KR as Sublocality.
autofill-address-district = Округ
# Used in GB, NO, SE
autofill-address-post-town = Поштове містечко
# Used in AU as Address Level-2 and used in ZZ as Sublocality.
autofill-address-suburb = Передмістя

## address-level-1 names

autofill-address-province = Область
autofill-address-state = Штат
autofill-address-county = Країна
# Used in BB, JM
autofill-address-parish = Парафія
# Used in JP
autofill-address-prefecture = Префектура
# Used in HK
autofill-address-area = Область
# Used in KR
autofill-address-do-si = Do/Si
# Used in NI, CO
autofill-address-department = Відділ
# Used in AE
autofill-address-emirate = Емірат
# Used in RU and UA
autofill-address-oblast = Область

## Postal code name types

# Used in IN
autofill-address-pin = Pin
autofill-address-postal-code = Поштовий індекс
autofill-address-zip = Поштовий індекс
# Used in IE
autofill-address-eircode = Eircode

##

autofill-address-country = Країна
autofill-address-tel = Телефон
autofill-address-email = Електронна пошта

autofill-cancel-button = Скасувати
autofill-save-button = Зберегти
autofill-country-warning-message = Автозаповнення форм наразі доступне лише для певних країн.

# The dialog title for creating credit cards in browser preferences.
autofill-add-new-card-title = Додати нову кредитну картку
# The dialog title for editing credit cards in browser preferences.
autofill-edit-card-title = Змінити кредитну картку

# In macOS, this string is preceded by the operating system with "Firefox is trying to ",
# and has a period added to its end. Make sure to test in your locale.
autofill-edit-card-password-prompt =
    { PLATFORM() ->
        [macos] показати інформацію про кредитну карту
        [windows] { -brand-short-name } намагається показати інформацію кредитної картки. Підтвердьте доступ до цього облікового запису Windows внизу.
       *[other] { -brand-short-name } намагається показати інформацію кредитної картки.
    }

autofill-card-number = Номер картки
autofill-card-invalid-number = Введіть правильний номер картки
autofill-card-name-on-card = Ім'я на картці
autofill-card-expires-month = Місяць завершення
autofill-card-expires-year = Рік завершення
autofill-card-billing-address = Платіжний адреса
autofill-card-network = Тип картки

## These are brand names and should only be translated when a locale-specific name for that brand is in common use

autofill-card-network-amex = Аmerican Express
autofill-card-network-cartebancaire = Сarte Bancaire
autofill-card-network-diners = Dіners Club
autofill-card-network-discover = Dіscover
autofill-card-network-jcb = JCB
autofill-card-network-mastercard = MasterCаrd
autofill-card-network-mir = MIR
autofill-card-network-unionpay = Uniоn Pay
autofill-card-network-visa = Vіsa
