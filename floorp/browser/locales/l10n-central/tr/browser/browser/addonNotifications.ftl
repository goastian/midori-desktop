# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

xpinstall-prompt = { -brand-short-name } bu sitenin bilgisayarınıza yazılım yüklemeyi istemesini engelledi.

## Variables:
##   $host (String): The hostname of the site the add-on is being installed from.

xpinstall-prompt-header = { $host } eklenti yükleyebilsin mi?
xpinstall-prompt-message = { $host } adresinden bir eklenti yüklemeye çalışıyorsunuz. Devam etmeden önce bu siteye güvendiğinizden emin olun.

##

xpinstall-prompt-header-unknown = Bilinmeyen bir sitenin eklenti yüklemesine izin verilsin mi?
xpinstall-prompt-message-unknown = Bilinmeyen bir siteden eklenti yüklemeye çalışıyorsunuz. Devam etmeden önce bu siteye güvendiğinizden emin olun.

xpinstall-prompt-dont-allow =
    .label = İzin verme
    .accesskey = m
xpinstall-prompt-never-allow =
    .label = Asla izin verme
    .accesskey = A
# Long text in this context make the dropdown menu extend awkwardly to the left,
# avoid a localization that's significantly longer than the English version.
xpinstall-prompt-never-allow-and-report =
    .label = Şüpheli siteyi raporla
    .accesskey = R
# Accessibility Note:
# Be sure you do not choose an accesskey that is used elsewhere in the active context (e.g. main menu bar, submenu of the warning popup button)
# See https://website-archive.mozilla.org/www.mozilla.org/access/access/keyboard/ for details
xpinstall-prompt-install =
    .label = Yüklemeye devam et
    .accesskey = Y

# These messages are shown when a website invokes navigator.requestMIDIAccess.

site-permission-install-first-prompt-midi-header = Bu site, MIDI (Müzik Enstrümanı Dijital Arabirimi) cihazlarınıza erişmek istiyor. Bir eklenti kurularak cihaz erişimi etkinleştirilebilir.
site-permission-install-first-prompt-midi-message = Bu erişimin güvenli olduğunu garanti edemiyoruz. Yalnızca bu siteye güveniyorsanız devam edin.

##

xpinstall-disabled-locked = Yazılım yüklenmesi, sistem yöneticiniz tarafından devre dışı bırakılmıştır.
xpinstall-disabled = Yazılım yüklenmesi şu anda devre dışı. Etkinleştir düğmesine tıklayıp yeniden deneyin.
xpinstall-disabled-button =
    .label = Etkinleştir
    .accesskey = n

# This message is shown when the installation of an add-on is blocked by enterprise policy.
# Variables:
#   $addonName (String): the name of the add-on.
#   $addonId (String): the ID of add-on.
addon-install-blocked-by-policy = { $addonName } ({ $addonId }) sistem yöneticiniz tarafından engellenmiş.
# This message is shown when the installation of add-ons from a domain is blocked by enterprise policy.
addon-domain-blocked-by-policy = Sistem yöneticiniz bu sitenin bilgisayarınıza yazılım yüklemeyi istemesini engelledi.
addon-install-full-screen-blocked = Tam ekran modundayken veya tam ekran moduna girerken eklenti kurulamaz.

# Variables:
#   $addonName (String): the localized name of the sideloaded add-on.
webext-perms-sideload-menu-item = { $addonName } { -brand-short-name } uygulamasına eklendi
# Variables:
#   $addonName (String): the localized name of the extension which has been updated.
webext-perms-update-menu-item = { $addonName } yeni izinler istiyor

# This message is shown when one or more extensions have been imported from a
# different browser into Firefox, and the user needs to complete the import to
# start these extensions. This message is shown in the appmenu.
webext-imported-addons = { -brand-short-name } tarayıcınıza aktarılan uzantıları yüklemeyi bitirin

## Add-on removal warning

# Variables:
#  $name (String): The name of the add-on that will be removed.
addon-removal-title = { $name } kaldırılsın mı?
# Variables:
#   $name (String): the name of the extension which is about to be removed.
addon-removal-message = { $name }, { -brand-shorter-name } tarayıcınızdan kaldırılsın mı?
addon-removal-button = Kaldır
addon-removal-abuse-report-checkbox = Bu uzantıyı { -vendor-short-name }’ya şikâyet et

# Variables:
#   $addonCount (Number): the number of add-ons being downloaded
addon-downloading-and-verifying =
    { $addonCount ->
        [one] Eklenti indiriliyor ve doğrulanıyor…
       *[other] { $addonCount } eklenti indiriliyor ve doğrulanıyor…
    }
addon-download-verifying = Doğrulanıyor

addon-install-cancel-button =
    .label = İptal
    .accesskey = a
addon-install-accept-button =
    .label = Ekle
    .accesskey = E

## Variables:
##   $addonCount (Number): the number of add-ons being installed

addon-confirm-install-message =
    { $addonCount ->
        [one] Bu site { -brand-short-name } tarayıcınıza bir eklenti yüklemek istiyor:
       *[other] Bu site { -brand-short-name } tarayıcınıza { $addonCount } eklenti yüklemek istiyor:
    }
addon-confirm-install-unsigned-message = Uyarı: Bu site { -brand-short-name } üzerinde doğrulanmamış { $addonCount } eklenti yüklemek istiyor. Devam ederseniz risk size aittir.
# Variables:
#   $addonCount (Number): the number of add-ons being installed (at least 2)
addon-confirm-install-some-unsigned-message = Uyarı: Bu site { -brand-short-name } üzerinde bazıları doğrulanmamış { $addonCount } eklenti yüklemek istiyor. Devam ederseniz risk size aittir.

## Add-on install errors
## Variables:
##   $addonName (String): the add-on name.

addon-install-error-network-failure = Bir bağlantı sorunu nedeniyle eklenti indirilemedi.
addon-install-error-incorrect-hash = Bu eklenti yüklenemedi çünkü { -brand-short-name } tarafından beklenen eklenti ile eşleşmiyor.
addon-install-error-corrupt-file = Bu siteden indirilen eklenti yüklenemiyor çünkü görünüşe göre eklenti bozuk.
addon-install-error-file-access = { $addonName } yüklenemedi çünkü { -brand-short-name } gerekli dosyayı değiştiremiyor.
addon-install-error-not-signed = { -brand-short-name } bu sitenin doğrulanmamış bir eklenti yüklemesini önledi.
addon-install-error-invalid-domain = { $addonName } eklentisi bu konumdan yüklenemez.
addon-local-install-error-network-failure = Bu eklenti, bir dosya sistemi hatası nedeniyle yüklenemedi.
addon-local-install-error-incorrect-hash = Bu eklenti yüklenemedi çünkü { -brand-short-name } tarafından beklenen eklenti ile eşleşmiyor.
addon-local-install-error-corrupt-file = Bu eklenti yüklenemedi çünkü görünüşe göre eklenti bozuk.
addon-local-install-error-file-access = { $addonName } yüklenemedi çünkü { -brand-short-name } gerekli dosyayı değiştiremiyor.
addon-local-install-error-not-signed = Bu eklenti doğrulanmadığı için yüklenemiyor.
# Variables:
#   $appVersion (String): the application version.
addon-install-error-incompatible = { $addonName } yüklenemedi çünkü { -brand-short-name } { $appVersion } ile uyumlu değil.
addon-install-error-blocklisted = { $addonName } yüklenemedi çünkü kararsızlık veya güvenlik sorunlarına yol açma riski yüksek.
