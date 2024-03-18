# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

migration-wizard-selection-header = Tarayıcı verilerini içe aktar
migration-wizard-selection-list = İçe aktarmak istediğiniz verileri seçin.
# Shown in the new migration wizard's dropdown selector for choosing the browser
# to import from. This variant is shown when the selected browser doesn't support
# user profiles, and so we only show the browser name.
#
# Variables:
#  $sourceBrowser (String): the name of the browser to import from.
migration-wizard-selection-option-without-profile = { $sourceBrowser }
# Shown in the new migration wizard's dropdown selector for choosing the browser
# and user profile to import from. This variant is shown when the selected browser
# supports user profiles.
#
# Variables:
#  $sourceBrowser (String): the name of the browser to import from.
#  $profileName (String): the name of the user profile to import from.
migration-wizard-selection-option-with-profile = { $sourceBrowser } — { $profileName }

# Each migrator is expected to include a display name string, and that display
# name string should have a key with "migration-wizard-migrator-display-name-"
# as a prefix followed by the unique identification key for the migrator.

migration-wizard-migrator-display-name-brave = Brave
migration-wizard-migrator-display-name-canary = Chrome Canary
migration-wizard-migrator-display-name-chrome = Chrome
migration-wizard-migrator-display-name-chrome-beta = Chrome Beta
migration-wizard-migrator-display-name-chrome-dev = Chrome Dev
migration-wizard-migrator-display-name-chromium = Chromium
migration-wizard-migrator-display-name-chromium-360se = 360 Secure Browser
migration-wizard-migrator-display-name-chromium-edge = Microsoft Edge
migration-wizard-migrator-display-name-chromium-edge-beta = Microsoft Edge Beta
migration-wizard-migrator-display-name-edge-legacy = Microsoft Edge (Eski Sürüm)
migration-wizard-migrator-display-name-firefox = Firefox
migration-wizard-migrator-display-name-file-password-csv = CSV dosyasındaki parolalar
migration-wizard-migrator-display-name-file-bookmarks = HTML dosyasından yer imleri
migration-wizard-migrator-display-name-ie = Microsoft Internet Explorer
migration-wizard-migrator-display-name-opera = Opera
migration-wizard-migrator-display-name-opera-gx = Opera GX
migration-wizard-migrator-display-name-safari = Safari
migration-wizard-migrator-display-name-vivaldi = Vivaldi

## These strings will be displayed based on how many resources are selected to import

migration-all-available-data-label = Mevcut tüm verileri içe aktar
migration-no-selected-data-label = İçe aktarılacak veriler seçilmedi
migration-selected-data-label = Seçilen verileri içe aktar

##

migration-select-all-option-label = Tümünü seç
migration-bookmarks-option-label = Yer imleri
# Favorites is used for Bookmarks when importing from Internet Explorer or
# Edge, as this is the terminology for bookmarks on those browsers.
migration-favorites-option-label = Sık kullanılanlar
migration-logins-and-passwords-option-label = Kayıtlı hesaplar ve parolalar
migration-history-option-label = Gezinti geçmişi
migration-extensions-option-label = Uzantılar
migration-form-autofill-option-label = Otomatik form doldurma verileri
migration-payment-methods-option-label = Ödeme yöntemleri
migration-cookies-option-label = Çerezler
migration-session-option-label = Pencereler ve sekmeler
migration-otherdata-option-label = Diğer veriler
migration-passwords-from-file-progress-header = Parola dosyasını içe aktar
migration-passwords-from-file-success-header = Parolalar başarıyla içe aktarıldı
migration-passwords-from-file = Dosyadaki parolalar kontrol ediliyor
migration-passwords-new = Yeni parolalar
migration-passwords-updated = Mevcut parolalar
migration-passwords-from-file-no-valid-data = Bu dosya hiç geçerli parola verisi içermiyor. Başka bir dosya seçin.
migration-passwords-from-file-picker-title = Parola dosyasını içe aktar
# A description for the .csv file format that may be shown as the file type
# filter by the operating system.
migration-passwords-from-file-csv-filter-title =
    { PLATFORM() ->
        [macos] CSV belgesi
       *[other] CSV dosyası
    }
# A description for the .tsv file format that may be shown as the file type
# filter by the operating system. TSV is short for 'tab separated values'.
migration-passwords-from-file-tsv-filter-title =
    { PLATFORM() ->
        [macos] TSV belgesi
       *[other] TSV dosyası
    }
# Shown in the migration wizard after importing passwords from a file
# has completed, if new passwords were added.
#
# Variables:
#  $newEntries (Number): the number of new successfully imported passwords
migration-wizard-progress-success-new-passwords =
    { $newEntries ->
        [one] { $newEntries } parola eklendi
       *[other] { $newEntries } parola eklendi
    }
# Shown in the migration wizard after importing passwords from a file
# has completed, if existing passwords were updated.
#
# Variables:
#  $updatedEntries (Number): the number of updated passwords
migration-wizard-progress-success-updated-passwords =
    { $updatedEntries ->
        [one] { $updatedEntries } parola güncellendi
       *[other] { $updatedEntries } parola güncellendi
    }
migration-bookmarks-from-file-picker-title = Yer İmi Dosyasını İçe Aktar
migration-bookmarks-from-file-progress-header = Yer imleri içe aktarılıyor
migration-bookmarks-from-file = Yer imleri
migration-bookmarks-from-file-success-header = Yer imleri başarıyla içe aktarıldı
migration-bookmarks-from-file-no-valid-data = Bu dosya hiç yer imi verisi içermiyor. Başka bir dosya seçin.
# A description for the .html file format that may be shown as the file type
# filter by the operating system.
migration-bookmarks-from-file-html-filter-title =
    { PLATFORM() ->
        [macos] HTML belgesi
       *[other] HTML dosyası
    }
# A description for the .json file format that may be shown as the file type
# filter by the operating system.
migration-bookmarks-from-file-json-filter-title = JSON dosyası
# Shown in the migration wizard after importing bookmarks from a file
# has completed.
#
# Variables:
#  $newEntries (Number): the number of imported bookmarks.
migration-wizard-progress-success-new-bookmarks =
    { $newEntries ->
        [one] { $newEntries } yer imi
       *[other] { $newEntries } yer imi
    }
migration-import-button-label = İçe aktar
migration-choose-to-import-from-file-button-label = Dosyadan içe aktar
migration-import-from-file-button-label = Dosya seç
migration-cancel-button-label = Vazgeç
migration-done-button-label = Tamam
migration-continue-button-label = Devam
migration-wizard-import-browser-no-browsers = { -brand-short-name } yer imi, geçmiş veya parola verileri içeren herhangi bir program bulamadı.
migration-wizard-import-browser-no-resources = Bir hata oluştu. { -brand-short-name } bu tarayıcı profilinden içe aktarılacak herhangi bir veri bulamıyor.

## These strings will be used to create a dynamic list of items that can be
## imported. The list will be created using Intl.ListFormat(), so it will
## follow each locale's rules, and the first item will be capitalized by code.
## When applicable, the resources should be in their plural form.
## For example, a possible list could be "Bookmarks, passwords and autofill data".

migration-list-bookmark-label = yer imleri
# “favorites” refers to bookmarks in Edge and Internet Explorer. Use the same terminology
# if the browser is available in your language.
migration-list-favorites-label = sık kullanılanlar
migration-list-password-label = parolalar
migration-list-history-label = geçmiş
migration-list-extensions-label = uzantılar
migration-list-autofill-label = otomatik doldurma verileri
migration-list-payment-methods-label = ödeme yöntemleri

##

migration-wizard-progress-header = Veriler içe aktarılıyor
# This header appears in the final page of the migration wizard only if
# all resources were imported successfully.
migration-wizard-progress-done-header = Veriler başarıyla içe aktarıldı
# This header appears in the final page of the migration wizard if only
# some of the resources were imported successfully. This is meant to be
# distinct from migration-wizard-progress-done-header, which is only shown
# if all resources were imported successfully.
migration-wizard-progress-done-with-warnings-header = Verileri içe aktarma tamamlandı
migration-wizard-progress-icon-in-progress =
    .aria-label = İçe aktarılıyor…
migration-wizard-progress-icon-completed =
    .aria-label = Tamamlandı
migration-safari-password-import-header = Parolaları Safari’den içe aktar
migration-safari-password-import-steps-header = Safari parolalarını içe aktarmak için:
migration-safari-password-import-step1 = Safari’de “Safari” menüsünü açıp Tercihler > Parolalar’a gidin
migration-safari-password-import-step2 = <img data-l10n-name="safari-icon-3dots"/> düğmesini seçip “Tüm Parolaları Dışa Aktar”ı seçin
migration-safari-password-import-step3 = Parola dosyasını kaydedin
migration-safari-password-import-step4 = Aşağıdaki “Dosya seç”i kullanarak kaydettiğiniz parola dosyasını seçin
migration-safari-password-import-skip-button = Geç
migration-safari-password-import-select-button = Dosya seç
# Shown in the migration wizard after importing bookmarks from another
# browser has completed.
#
# Variables:
#  $quantity (Number): the number of successfully imported bookmarks
migration-wizard-progress-success-bookmarks =
    { $quantity ->
        [one] { $quantity } yer imi
       *[other] { $quantity } yer imi
    }
# Shown in the migration wizard after importing bookmarks from either
# Internet Explorer or Edge.
#
# Use the same terminology if the browser is available in your language.
#
# Variables:
#  $quantity (Number): the number of successfully imported bookmarks
migration-wizard-progress-success-favorites =
    { $quantity ->
        [one] { $quantity } sık kullanılan
       *[other] { $quantity } sık kullanılan
    }

## The import process identifies extensions installed in other supported
## browsers and installs the corresponding (matching) extensions compatible
## with Firefox, if available.

# Shown in the migration wizard after importing all matched extensions
# from supported browsers.
#
# Variables:
#   $quantity (Number): the number of successfully imported extensions
migration-wizard-progress-success-extensions =
    { $quantity ->
        [one] { $quantity } uzantı
       *[other] { $quantity } uzantı
    }
# Shown in the migration wizard after importing a partial amount of
# matched extensions from supported browsers.
#
# Variables:
#   $matched (Number): the number of matched imported extensions
#   $quantity (Number): the number of total extensions found during import
migration-wizard-progress-partial-success-extensions = { $matched }/{ $quantity } uzantı
migration-wizard-progress-extensions-support-link = { -brand-product-name }’un uzantıları nasıl eşleştirdiğini öğrenin
# Shown in the migration wizard if there are no matched extensions
# on import from supported browsers.
migration-wizard-progress-no-matched-extensions = Eşleşen uzantı bulunamadı
migration-wizard-progress-extensions-addons-link = { -brand-short-name } uzantılarına göz atın

##

# Shown in the migration wizard after importing passwords from another
# browser has completed.
#
# Variables:
#  $quantity (Number): the number of successfully imported passwords
migration-wizard-progress-success-passwords =
    { $quantity ->
        [one] { $quantity } parola
       *[other] { $quantity } parola
    }
# Shown in the migration wizard after importing history from another
# browser has completed.
#
# Variables:
#  $maxAgeInDays (Number): the maximum number of days of history that might be imported.
migration-wizard-progress-success-history =
    { $maxAgeInDays ->
        [one] Son 1 gün
       *[other] Son { $maxAgeInDays } gün
    }
migration-wizard-progress-success-formdata = Form geçmişi
# Shown in the migration wizard after importing payment methods from another
# browser has completed.
#
# Variables:
#  $quantity (Number): the number of successfully imported payment methods
migration-wizard-progress-success-payment-methods =
    { $quantity ->
        [one] { $quantity } ödeme yöntemi
       *[other] { $quantity } ödeme yöntemi
    }
migration-wizard-safari-permissions-sub-header = Safari yer işaretlerini ve gezinti geçmişini içe aktarmak için:
migration-wizard-safari-instructions-continue = “Devam Et”i seçin
migration-wizard-safari-instructions-folder = Listeden Safari klasörünü seçip “Aç”ı seçin
