# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

aboutDialog-title =
    .title = { -brand-full-name } hakkında

releaseNotes-link = Yeni neler var?

update-checkForUpdatesButton =
    .label = Güncellemeleri denetle
    .accesskey = G

update-updateButton =
    .label = { -brand-shorter-name } tarayıcısını güncellemek için yeniden başlat
    .accesskey = G

update-checkingForUpdates = Güncellemeler denetleniyor…

## Variables:
##   $transfer (string) - Transfer progress.

settings-update-downloading = <img data-l10n-name="icon"/>Güncelleme indiriliyor — <label data-l10n-name="download-status">{ $transfer }</label>
aboutdialog-update-downloading = Güncelleme indiriliyor — <label data-l10n-name="download-status">{ $transfer }</label>

##

update-applying = Güncelleme uygulanıyor…

update-failed = Güncelleme başarısız. <label data-l10n-name="failed-link">Son sürümü indirin</label>
update-failed-main = Güncelleme başarısız. <a data-l10n-name="failed-link-main">Son sürümü indirin</a>

update-adminDisabled = Güncellemeler sistem yöneticiniz tarafından devre dışı bırakılmış
update-noUpdatesFound = { -brand-short-name } güncel
aboutdialog-update-checking-failed = Güncellemeler kontrol edilemedi.
update-otherInstanceHandlingUpdates = { -brand-short-name } başka bir kopyası tarafından şu an güncelleniyor

## Variables:
##   $displayUrl (String): URL to page with download instructions. Example: www.mozilla.org/firefox/nightly/

aboutdialog-update-manual-with-link = Güncelleme adresi: <label data-l10n-name="manual-link">{ $displayUrl }</label>
settings-update-manual-with-link = Güncelleme adresi: <a data-l10n-name="manual-link">{ $displayUrl }</a>

update-unsupported = Bu sistemde yeni güncellemeleri kullanamazsınız.<label data-l10n-name="unsupported-link">Daha fazla bilgi al</label>

update-restarting = Yeniden başlatılıyor…

update-internal-error2 = Dahili bir hata nedeniyle güncellemeler kontrol edilemiyor. Güncellemeleri <label data-l10n-name="manual-link">{ $displayUrl }</label> adresinde bulabilirsiniz.

##

# Variables:
#   $channel (String): description of the update channel (e.g. "release", "beta", "nightly" etc.)
aboutdialog-channel-description = Şu anda <label data-l10n-name="current-channel">{ $channel }</label> güncelleme kanalındasınız.

warningDesc-version = { -brand-short-name } deneyseldir ve kararsız olabilir.

aboutdialog-help-user = { -brand-product-name } yardımı
aboutdialog-submit-feedback = Görüş bildir

community-exp = <label data-l10n-name="community-exp-mozillaLink">{ -vendor-short-name }</label> Web’i açık, kamusal ve herkesçe erişilebilir kılmak için birlikte çalışan <label data-l10n-name="community-exp-creditsLink">küresel bir topluluktur</label>.

community-2 = { -brand-short-name }, <label data-l10n-name="community-mozillaLink">{ -vendor-short-name }</label> tarafından tasarlanmıştır. { -vendor-short-name }, interneti daha iyiye taşımak için birlikte çalışan <label data-l10n-name="community-creditsLink">küresel bir topluluktur</label>.

helpus = Yardım etmek ister misiniz? <label data-l10n-name="helpus-donateLink">Bağış yapın</label> veya <label data-l10n-name="helpus-getInvolvedLink">aramıza katılın!</label>

bottomLinks-license = Lisans Bilgileri
bottomLinks-rights = Son Kullanıcı Hakları
bottomLinks-privacy = Gizlilik İlkesi

# Example of resulting string: 66.0.1 (64-bit)
# Variables:
#   $version (String): version of Firefox, e.g. 66.0.1
#   $bits (Number): bits of the architecture (32 or 64)
aboutDialog-version = { $version } ({ $bits } bit)

# Example of resulting string: 66.0a1 (2019-01-16) (64-bit)
# Variables:
#   $version (String): version of Firefox for Nightly builds, e.g. 66.0a1
#   $isodate (String): date in ISO format, e.g. 2019-01-16
#   $bits (Number): bits of the architecture (32 or 64)
aboutDialog-version-nightly = { $version } ({ $isodate }) ({ $bits } bit)
