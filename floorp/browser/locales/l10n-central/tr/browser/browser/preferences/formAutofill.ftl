# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## The address and credit card autofill management dialog in browser preferences

autofill-manage-addresses-title = Kayıtlı Adresler
autofill-manage-addresses-list-header = Adresler

autofill-manage-credit-cards-title = Kayıtlı Kredi Kartları
autofill-manage-credit-cards-list-header = Kredi kartları

autofill-manage-dialog =
    .style = min-width: 560px
autofill-manage-remove-button = Sil
autofill-manage-add-button = Ekle…
autofill-manage-edit-button = Düzenle…

##

# The dialog title for creating addresses in browser preferences.
autofill-add-new-address-title = Yeni Adres Ekle
# The dialog title for editing addresses in browser preferences.
autofill-edit-address-title = Adresi Düzenle

autofill-address-given-name = Ad
autofill-address-additional-name = İkinci ad
autofill-address-family-name = Soyadı
autofill-address-organization = Şirket
autofill-address-street = Sokak adresi

## address-level-3 (Sublocality) names

# Used in IR, MX
autofill-address-neighborhood = Mahalle
# Used in MY
autofill-address-village-township = Köy veya kasaba
autofill-address-island = Ada
# Used in IE
autofill-address-townland = Kasaba

## address-level-2 names

autofill-address-city = Şehir
# Used in HK, SD, SY, TR as Address Level-2 and used in KR as Sublocality.
autofill-address-district = İlçe
# Used in GB, NO, SE
autofill-address-post-town = Posta kasabası
# Used in AU as Address Level-2 and used in ZZ as Sublocality.
autofill-address-suburb = Yörekent

## address-level-1 names

autofill-address-province = İl
autofill-address-state = Eyalet
autofill-address-county = İlçe
# Used in BB, JM
autofill-address-parish = Mahalle
# Used in JP
autofill-address-prefecture = Vilayet
# Used in HK
autofill-address-area = Bölge
# Used in KR
autofill-address-do-si = Do/Si
# Used in NI, CO
autofill-address-department = Bölüm
# Used in AE
autofill-address-emirate = Emirlik
# Used in RU and UA
autofill-address-oblast = Oblast

## Postal code name types

# Used in IN
autofill-address-pin = Pin
autofill-address-postal-code = Posta kodu
autofill-address-zip = ZIP kodu
# Used in IE
autofill-address-eircode = Eircode

##

autofill-address-country = Ülke
autofill-address-tel = Telefon
autofill-address-email = E-posta

autofill-cancel-button = Vazgeç
autofill-save-button = Kaydet
autofill-country-warning-message = Otomatik form doldurma şimdilik yalnızca belli ülkelerde kullanılabilir.

# The dialog title for creating credit cards in browser preferences.
autofill-add-new-card-title = Yeni Kredi Kartı Ekle
# The dialog title for editing credit cards in browser preferences.
autofill-edit-card-title = Kredi Kartını Düzenle

# In macOS, this string is preceded by the operating system with "Firefox is trying to ",
# and has a period added to its end. Make sure to test in your locale.
autofill-edit-card-password-prompt =
    { PLATFORM() ->
        [macos] kredi kartı bilgilerini gösterme
        [windows] { -brand-short-name } kredi kartı bilgilerini göstermeye çalışıyor. Bu Windows hesabına erişimi onaylayın.
       *[other] { -brand-short-name } kredi kartı bilgilerini göstermeye çalışıyor.
    }

autofill-card-number = Kart numarası
autofill-card-invalid-number = Lütfen geçerli bir kart numarası yazın
autofill-card-name-on-card = Kart üzerindeki ad
autofill-card-expires-month = Son kul. ayı
autofill-card-expires-year = Son kul. yılı
autofill-card-billing-address = Fatura adresi
autofill-card-network = Kart türü

## These are brand names and should only be translated when a locale-specific name for that brand is in common use

autofill-card-network-amex = American Express
autofill-card-network-cartebancaire = Carte Bancaire
autofill-card-network-diners = Diners Club
autofill-card-network-discover = Discover
autofill-card-network-jcb = JCB
autofill-card-network-mastercard = MasterCard
autofill-card-network-mir = MIR
autofill-card-network-unionpay = Union Pay
autofill-card-network-visa = Visa
