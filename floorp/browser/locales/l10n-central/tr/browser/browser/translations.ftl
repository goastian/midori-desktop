# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# The button for "Firefox Translations" in the url bar.
urlbar-translations-button =
    .tooltiptext = Bu sayfayı çevir
# The button for "Firefox Translations" in the url bar. Note that here "Beta" should
# not be translated, as it is a reflection of the un-localized BETA icon that is in the
# panel.
urlbar-translations-button2 =
    .tooltiptext = Bu sayfayı çevir - Beta
# If your language requires declining the language name, a possible solution
# is to adapt the structure of the phrase, or use a support noun, e.g.
# `Page translated from: { $fromLanguage }. Current target language: { $toLanguage }`
#
# Variables:
#   $fromLanguage (string) - The original language of the document.
#   $toLanguage (string) - The target language of the translation.
urlbar-translations-button-translated =
    .tooltiptext = Sayfa { $fromLanguage } dilinden { $toLanguage } diline çevrilmiştir
urlbar-translations-button-loading =
    .tooltiptext = Çeviri devam ediyor
translations-panel-settings-button =
    .aria-label = Çeviri ayarlarını yönet
# Text displayed on a language dropdown when the language is in beta
# Variables:
#   $language (string) - The localized display name of the detected language
translations-panel-displayname-beta =
    .label = { $language } BETA

## Options in the Firefox Translations settings.

translations-panel-settings-manage-languages =
    .label = Dilleri yönet
translations-panel-settings-about = { -brand-shorter-name } çevirileri hakkında
translations-panel-settings-about2 =
    .label = { -brand-shorter-name } çevirileri hakkında
# Text displayed for the option to always translate a given language
# Variables:
#   $language (string) - The localized display name of the detected language
translations-panel-settings-always-translate-language =
    .label = { $language } dilini her zaman çevir
translations-panel-settings-always-translate-unknown-language =
    .label = Bu dili her zaman çevir
# Text displayed for the option to never translate a given language
# Variables:
#   $language (string) - The localized display name of the detected language
translations-panel-settings-never-translate-language =
    .label = { $language } dilini asla çevirme
translations-panel-settings-never-translate-unknown-language =
    .label = Bu dili asla çevirme
# Text displayed for the option to never translate this website
translations-panel-settings-never-translate-site =
    .label = Bu siteyi asla çevirme

## The translation panel appears from the url bar, and this view is the default
## translation view.

translations-panel-header = Bu sayfa çevrilsin mi?
translations-panel-translate-button =
    .label = Çevir
translations-panel-translate-button-loading =
    .label = Lütfen bekleyin…
translations-panel-translate-cancel =
    .label = Vazgeç
translations-panel-learn-more-link = Daha fazla bilgi al
translations-panel-error-translating = Çeviri sırasında bir sorun oluştu. Lütfen yeniden deneyin.
translations-panel-error-load-languages = Diller yüklenemedi
translations-panel-error-load-languages-hint = İnternet bağlantınızı kontrol edip yeniden deneyin.
translations-panel-error-load-languages-hint-button =
    .label = Yeniden dene
translations-panel-error-unsupported = Bu sayfanın çevirisi yapılamıyor
translations-panel-error-dismiss-button =
    .label = Anladım
translations-panel-error-change-button =
    .label = Kaynak dili değiştir
# If your language requires declining the language name, a possible solution
# is to adapt the structure of the phrase, or use a support noun, e.g.
# `Sorry, we don't support the language yet: { $language }
#
# Variables:
#   $language (string) - The language of the document.
translations-panel-error-unsupported-hint-known = Maalesef henüz { $language } dilini desteklemiyoruz.
translations-panel-error-unsupported-hint-unknown = Ne yazık ki henüz bu dili desteklemiyoruz.

## Each label is followed, on a new line, by a dropdown list of language names.
## If this structure is problematic for your locale, an alternative way is to
## translate them as `Source language:` and `Target language:`

translations-panel-from-label = Bu dilden
translations-panel-to-label = Bu dile

## The translation panel appears from the url bar, and this view is the "restore" view
## that lets a user restore a page to the original language, or translate into another
## language.

# If your language requires declining the language name, a possible solution
# is to adapt the structure of the phrase, or use a support noun, e.g.
# `The page is translated from: { $fromLanguage }. Current target language: { $toLanguage }`
#
# Variables:
#   $fromLanguage (string) - The original language of the document.
#   $toLanguage (string) - The target language of the translation.
translations-panel-revisit-header = Bu sayfa { $fromLanguage } dilinden { $toLanguage } diline çevrilmiştir
translations-panel-choose-language =
    .label = Dil seçin
translations-panel-restore-button =
    .label = Orijinalini göster

## Firefox Translations language management in about:preferences.

translations-manage-header = Çeviriler
translations-manage-settings-button =
    .label = Ayarlar…
    .accesskey = A
translations-manage-description = Çevrimdışı çeviri için dilleri indir.
translations-manage-all-language = Tüm diller
translations-manage-download-button = İndir
translations-manage-delete-button = Sil
translations-manage-language-download-button =
    .label = İndir
    .accesskey = i
translations-manage-language-delete-button =
    .label = Sil
    .accesskey = S
translations-manage-error-download = Dil dosyaları indirilirken bir sorun oluştu. Lütfen yeniden deneyin.
translations-manage-error-delete = Dil dosyaları silinirken bir hata oluştu. Lütfen yeniden deneyin.
translations-manage-install-description = Çevrimdışı çeviri için dilleri yükle
translations-manage-language-install-button =
    .label = Yükle
translations-manage-language-install-all-button =
    .label = Tümünü yükle
    .accesskey = T
translations-manage-language-remove-button =
    .label = Kaldır
translations-manage-language-remove-all-button =
    .label = Tümünü kaldır
    .accesskey = k
translations-manage-error-install = Dil dosyaları yüklenirken bir sorun oluştu. Lütfen yeniden deneyin.
translations-manage-error-remove = Dil dosyaları kaldırılırken bir hata oluştu. Lütfen yeniden deneyin.
translations-manage-error-list = Çeviri için mevcut dillerin listesi alınamadı. Yeniden denemek için sayfayı tazeleyin.
translations-settings-title =
    .title = Çeviri Ayarları
    .style = min-width: 36em
translations-settings-close-key =
    .key = w
translations-settings-always-translate-langs-description = Aşağıdaki diller otomatik olarak çevrilecektir
translations-settings-never-translate-langs-description = Aşağıdaki diller için çeviri önerisi yapılmayacaktır
translations-settings-never-translate-sites-description = Aşağıdaki siteler için çeviri önerisi yapılmayacaktır
translations-settings-languages-column =
    .label = Diller
translations-settings-remove-language-button =
    .label = Dili kaldır
    .accesskey = D
translations-settings-remove-all-languages-button =
    .label = Tüm dilleri kaldır
    .accesskey = T
translations-settings-sites-column =
    .label = Web siteleri
translations-settings-remove-site-button =
    .label = Siteyi kaldır
    .accesskey = S
translations-settings-remove-all-sites-button =
    .label = Tüm siteleri kaldır
    .accesskey = m
translations-settings-close-dialog =
    .buttonlabelaccept = Kapat
    .buttonaccesskeyaccept = K
