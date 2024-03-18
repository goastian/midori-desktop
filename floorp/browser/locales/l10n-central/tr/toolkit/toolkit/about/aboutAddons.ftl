# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

addons-page-title = Eklenti Yöneticisi
search-header =
    .placeholder = addons.mozilla.org’da ara
    .searchbuttonlabel = Ara

## Variables
##   $domain - Domain name where add-ons are available (e.g. addons.mozilla.org)

list-empty-get-extensions-message = Uzantıları ve temaları <a data-l10n-name="get-extensions">{ $domain }</a> adresinden indirebilirsiniz.
list-empty-get-dictionaries-message = Sözlükleri <a data-l10n-name="get-extensions">{ $domain }</a> adresinden indirebilirsiniz.
list-empty-get-language-packs-message = Dil paketlerini <a data-l10n-name="get-extensions">{ $domain }</a> adresinden indirebilirsiniz.

##

list-empty-installed =
    .value = Bu türden kurulmuş bir eklentiniz yok
list-empty-available-updates =
    .value = Güncelleme bulunamadı
list-empty-recent-updates =
    .value = Yakın zamanda herhangi bir eklenti güncellemediniz
list-empty-find-updates =
    .label = Güncellemeleri denetle
list-empty-button =
    .label = Eklentiler hakkında daha fazlasını öğrenin
help-button = Eklenti Desteği
sidebar-help-button-title =
    .title = Eklenti Desteği
addons-settings-button = { -brand-short-name } Ayarları
sidebar-settings-button-title =
    .title = { -brand-short-name } Ayarları
show-unsigned-extensions-button =
    .label = Bazı uzantılar doğrulanamadı
show-all-extensions-button =
    .label = Tüm uzantıları göster
detail-version =
    .label = Sürüm
detail-last-updated =
    .label = Son güncelleme
addon-detail-description-expand = Daha fazla göster
addon-detail-description-collapse = Daha az göster
detail-contributions-description = Bu eklentinin geliştiricisi, sizden ufak bir katkıda bulunarak süregelen geliştirme faaliyetlerini desteklemenizi istiyor.
detail-contributions-button = Katkıda bulunun
    .title = Bu eklentinin geliştirilmesine katkıda bulunun
    .accesskey = K
detail-update-type =
    .value = Otomatik güncellemeler
detail-update-default =
    .label = Varsayılan
    .tooltiptext = Güncellemeleri sadece varsayılan ayar buysa kendiliğinden kur
detail-update-automatic =
    .label = Açık
    .tooltiptext = Güncellemeleri kendiliğinden kur
detail-update-manual =
    .label = Kapalı
    .tooltiptext = Güncellemeleri kendiliğinden kurma
# Used as a description for the option to allow or block an add-on in private windows.
detail-private-browsing-label = Gizli pencerede çalışabilir
# Some add-ons may elect to not run in private windows by setting incognito: not_allowed in the manifest.  This
# cannot be overridden by the user.
detail-private-disallowed-label = Gizli pencerelerde izin verilmiyor
detail-private-disallowed-description2 = Gizli gezinti sırasında bu uzantı çalışmaz. <a data-l10n-name="learn-more">Daha fazla bilgi alın</a>
# Some special add-ons are privileged, run in private windows automatically, and this permission can't be revoked
detail-private-required-label = Gizli pencerelere erişmesi gerekiyor
detail-private-required-description2 = Bu uzantı, gizli gezinti sırasında yaptıklarınıza erişebilir. <a data-l10n-name="learn-more">Daha fazla bilgi alın</a>
detail-private-browsing-on =
    .label = İzin ver
    .tooltiptext = Gizli gezintide izin ver
detail-private-browsing-off =
    .label = İzin verme
    .tooltiptext = Gizli gezintide etkisizleştir
detail-home =
    .label = Ana sayfa
detail-home-value =
    .value = { detail-home.label }
detail-repository =
    .label = Eklenti profili
detail-repository-value =
    .value = { detail-repository.label }
detail-check-for-updates =
    .label = Güncellemeleri denetle
    .accesskey = m
    .tooltiptext = Bu eklentinin güncellemelerini denetle
detail-show-preferences =
    .label =
        { PLATFORM() ->
            [windows] Seçenekler
           *[other] Tercihler
        }
    .accesskey =
        { PLATFORM() ->
            [windows] S
           *[other] T
        }
    .tooltiptext =
        { PLATFORM() ->
            [windows] Bu eklentinin seçeneklerini değiştir
           *[other] Bu eklentinin tercihlerini değiştir
        }
detail-rating =
    .value = Beğeni
addon-restart-now =
    .label = Şimdi yeniden başlat
disabled-unsigned-heading =
    .value = Bazı eklentiler etkisizleştirildi
disabled-unsigned-description = Aşağıdaki eklentiler { -brand-short-name } üzerinde kullanılmak üzere doğrulanmamıştır. <label data-l10n-name="find-addons">Yerlerine başkalarını bulabilir</label> veya geliştiriciden eklentilerini doğrulamasını isteyebilirsiniz.
disabled-unsigned-learn-more = Sizi internette daha güvende tutma çabalarımız hakkında bilgi alın.
disabled-unsigned-devinfo = Eklentilerini doğrulamak için isteyen geliştiriciler <label data-l10n-name="learn-more">rehberimizi</label> okuyabilir.
plugin-deprecation-description = Bir şeyler mi eksik? Bazı yan uygulamalar artık { -brand-short-name } tarafından desteklenmiyor. <label data-l10n-name="learn-more">Daha fazla bilgi alın.</label>
legacy-warning-show-legacy = Eski teknoloji uzantıları göster
legacy-extensions =
    .value = Eski teknoloji uzantılar
legacy-extensions-description = Bu uzantılar yeni { -brand-short-name } standartlarını karşılamadığı için etkisiz hale getirilmiştir. <label data-l10n-name="legacy-learn-more">Uzantılarda yaptığımız değişiklikler hakkında bilgi alın</label>
private-browsing-description2 =
    { -brand-short-name } gizli gezinti modunda uzantıların çalışma şekli değişiyor. Bundan sonra
    { -brand-short-name } tarayıcınıza ekleceğiniz uzantılar varsayılan olarak gizli pencerelerde çalışmayacak.
    Böylece, siz ayarlara girip özellikle izin vermedikçe uzantılar gizli gezinti sırasında yaptıklarınızı göremeyecekler.
    Bu değişikliği, gizli gezintinizin daha da gizli kalması için yapıyoruz.
    <label data-l10n-name="private-browsing-learn-more">Uzantı ayarlarınızı yönetmeyi öğrenin.</label>
addon-category-discover = Öneriler
addon-category-discover-title =
    .title = Öneriler
addon-category-extension = Uzantılar
addon-category-extension-title =
    .title = Uzantılar
addon-category-theme = Temalar
addon-category-theme-title =
    .title = Temalar
addon-category-plugin = Yan Uygulamalar
addon-category-plugin-title =
    .title = Yan Uygulamalar
addon-category-dictionary = Sözlükler
addon-category-dictionary-title =
    .title = Sözlükler
addon-category-locale = Diller
addon-category-locale-title =
    .title = Diller
addon-category-available-updates = Mevcut güncellemeler
addon-category-available-updates-title =
    .title = Mevcut güncellemeler
addon-category-recent-updates = Yakın zamandaki güncellemeler
addon-category-recent-updates-title =
    .title = Yakın zamandaki güncellemeler
addon-category-sitepermission = Site İzinleri
addon-category-sitepermission-title =
    .title = Site İzinleri
# String displayed in about:addons in the Site Permissions section
# Variables:
#  $host (string) - DNS host name for which the webextension enables permissions
addon-sitepermission-host = { $host } site izinleri

## These are global warnings

extensions-warning-safe-mode = Tüm uzantılar güvenli kipte devre dışı bırakıldı.
extensions-warning-check-compatibility = Uzantı uyumluluk denetimi devre dışı. Uyumsuz uzantılarınız olabilir.
extensions-warning-check-compatibility-button = Etkinleştir
    .title = Eklenti uyumluluk denetimini devreye sok
extensions-warning-update-security = Eklenti güncelleme güvenliği denetimi devre dışı. Güncellemelerle tehlikeye düşebilirsiniz.
extensions-warning-update-security-button = Etkinleştir
    .title = Eklenti güncelleme güvenliği denetimini devreye sok
extensions-warning-imported-addons = Lütfen { -brand-short-name } tarayıcınıza aktarılan uzantıların kurulumunu bitirin.
extensions-warning-imported-addons-button = Uzantıları yükle

## Strings connected to add-on updates

addon-updates-check-for-updates = Güncellemeleri denetle
    .accesskey = G
addon-updates-view-updates = En son güncellemelere bak
    .accesskey = b

# This menu item is a checkbox that toggles the default global behavior for
# add-on update checking.

addon-updates-update-addons-automatically = Eklentileri kendiliğinden güncelle
    .accesskey = n

## Specific add-ons can have custom update checking behaviors ("Manually",
## "Automatically", "Use default global behavior"). These menu items reset the
## update checking behavior for all add-ons to the default global behavior
## (which itself is either "Automatically" or "Manually", controlled by the
## extensions-updates-update-addons-automatically.label menu item).

addon-updates-reset-updates-to-automatic = Tüm eklentileri kendiliğinden güncellenecek şekilde ayarla
    .accesskey = a
addon-updates-reset-updates-to-manual = Tüm eklentileri elle güncellenecek şekilde ayarla
    .accesskey = a

## Status messages displayed when updating add-ons

addon-updates-updating = Eklentiler güncelleniyor
addon-updates-installed = Eklentileriniz güncellendi.
addon-updates-none-found = Güncelleme bulunamadı
addon-updates-manual-updates-found = Yüklenebilir güncellemelere bak

## Add-on install/debug strings for page options menu

addon-install-from-file = Dosyadan eklenti kur...
    .accesskey = k
addon-install-from-file-dialog-title = Kurulacak eklentiyi seçin
addon-install-from-file-filter-name = Eklentiler
addon-open-about-debugging = Eklentilerde hata ayıkla
    .accesskey = h

## Extension shortcut management

# This is displayed in the page options menu
addon-manage-extensions-shortcuts = Uzantı kısayollarını yönet
    .accesskey = U
shortcuts-no-addons = Herhangi bir uzantıyı etkinleştirmediniz.
shortcuts-no-commands = Aşağıdaki uzantıların kısayolları yok:
shortcuts-input =
    .placeholder = Bir kısayol girin
shortcuts-browserAction2 = Araç çubuğu düğmesini etkinleştir
shortcuts-pageAction = Sayfa eylemini etkinleştir
shortcuts-sidebarAction = Kenar çubuğunu aç/kapat
shortcuts-modifier-mac = Ctrl, Alt veya ⌘ kullanmalısınız
shortcuts-modifier-other = Ctrl veya Alt kullanmalısınız
shortcuts-invalid = Geçersiz kombinasyon
shortcuts-letter = Bir harf yazın
shortcuts-system = { -brand-short-name } kısayollarını değiştiremezsiniz
# String displayed in warning label when there is a duplicate shortcut
shortcuts-duplicate = Yinelenen kısayol
# String displayed when a keyboard shortcut is already assigned to more than one add-on
# Variables:
#   $shortcut (string) - Shortcut string for the add-on
shortcuts-duplicate-warning-message = { $shortcut } birden fazla yerde kısayol olarak kullanılıyor. Yinelenen kısayollar beklenmeyen davranışlara neden olabilir.
# String displayed when a keyboard shortcut is already used by another add-on
# Variables:
#   $addon (string) - Name of the add-on
shortcuts-exists = { $addon } tarafından zaten kullanılıyor
# Variables:
#   $numberToShow (number) - Number of other elements available to show
shortcuts-card-expand-button =
    { $numberToShow ->
        [one] { $numberToShow } tane daha göster
       *[other] { $numberToShow } tane daha göster
    }
shortcuts-card-collapse-button = Daha az göster
header-back-button =
    .title = Geri dön

## Recommended add-ons page

# Explanatory introduction to the list of recommended add-ons. The action word
# ("recommends") in the final sentence is a link to external documentation.
discopane-intro = Uzantılar ve temalar tarayıcınızın içinde çalışan uygulamalar gibidir. Parolalarınızı saklamanıza, video indirmenize, indirimleri bulmanıza, sinir bozucu reklamları engellemenize, tarayıcınızın görünümü değiştirmenize ve çok daha birçok şey yapmanıza olanak tanırlar. Bu küçük yazılımlar genellikle üçüncü şahıslar tarafından geliştirilir. Ekstra güvenlik, performans ve işlevsellik için { -brand-product-name } tarafından <a data-l10n-name="learn-more-trigger">önerilen</a> uzantı ve temaları aşağıda bulabilirsiniz.
# Notice to make user aware that the recommendations are personalized.
discopane-notice-recommendations =
    Bu önerilerden bazıları size özeldir. Önerilerimiz; yüklediğiniz
    diğer uzantıları, profil tercihlerinizi ve kullanım istatistiklerinizi temel alır.
discopane-notice-learn-more = Daha fazla bilgi al
privacy-policy = Gizlilik İlkeleri
# Refers to the author of an add-on, shown below the name of the add-on.
# Variables:
#   $author (string) - The name of the add-on developer.
created-by-author = geliştiren: <a data-l10n-name="author">{ $author }</a>
# Shows the number of daily users of the add-on.
# Variables:
#   $dailyUsers (number) - The number of daily users.
user-count = Kullanıcı: { $dailyUsers }
install-extension-button = { -brand-product-name }’a ekle
install-theme-button = Temayı yükle
# The label of the button that appears after installing an add-on. Upon click,
# the detailed add-on view is opened, from where the add-on can be managed.
manage-addon-button = Yönet
find-more-addons = Daha fazla eklenti bul
find-more-themes = Daha fazla tema bul
# This is a label for the button to open the "more options" menu, it is only
# used for screen readers.
addon-options-button =
    .aria-label = Diğer seçenekler

## Add-on actions

report-addon-button = Şikâyet et
remove-addon-button = Kaldır
# The link will always be shown after the other text.
remove-addon-disabled-button = Kaldırılamıyor <a data-l10n-name="link">Neden?</a>
disable-addon-button = Etkisizleştir
enable-addon-button = Etkinleştir
# This is used for the toggle on the extension card, it's a checkbox and this
# is always its label.
extension-enable-addon-button-label =
    .aria-label = Etkinleştir
preferences-addon-button =
    { PLATFORM() ->
        [windows] Seçenekler
       *[other] Tercihler
    }
details-addon-button = Ayrıntılar
release-notes-addon-button = Sürüm notları
permissions-addon-button = İzinler
extension-enabled-heading = Etkin
extension-disabled-heading = Devre dışı
theme-enabled-heading = Etkin
theme-disabled-heading2 = Kayıtlı temalar
plugin-enabled-heading = Etkin
plugin-disabled-heading = Devre dışı
dictionary-enabled-heading = Etkin
dictionary-disabled-heading = Devre dışı
locale-enabled-heading = Etkin
locale-disabled-heading = Devre dışı
sitepermission-enabled-heading = Etkin
sitepermission-disabled-heading = Devre dışı
always-activate-button = Her zaman etkinleştir
never-activate-button = Asla etkinleştirme
addon-detail-author-label = Geliştiren
addon-detail-version-label = Sürüm
addon-detail-last-updated-label = Son güncelleme
addon-detail-homepage-label = Web sitesi
addon-detail-rating-label = Puan
# Message for add-ons with a staged pending update.
install-postponed-message = { -brand-short-name } yeniden başlatılınca bu uzantı güncellenecek.
install-postponed-button = Şimdi güncelle
# The average rating that the add-on has received.
# Variables:
#   $rating (number) - A number between 0 and 5. The translation should show at most one digit after the comma.
five-star-rating =
    .title = 5 üzerinden { NUMBER($rating, maximumFractionDigits: 1) } puan
# This string is used to show that an add-on is disabled.
# Variables:
#   $name (string) - The name of the add-on
addon-name-disabled = { $name } (devre dışı)
# The number of reviews that an add-on has received on AMO.
# Variables:
#   $numberOfReviews (number) - The number of reviews received
addon-detail-reviews-link =
    { $numberOfReviews ->
        [one] { $numberOfReviews } inceleme
       *[other] { $numberOfReviews } inceleme
    }

## Pending uninstall message bar

# Variables:
#   $addon (string) - Name of the add-on
pending-uninstall-description = <span data-l10n-name="addon-name">{ $addon }</span> kaldırıldı.
pending-uninstall-undo-button = Geri al
addon-detail-updates-label = Otomatik güncellemelere izin ver
addon-detail-updates-radio-default = Varsayılan
addon-detail-updates-radio-on = Açık
addon-detail-updates-radio-off = Kapalı
addon-detail-update-check-label = Güncellemeleri denetle
install-update-button = Güncelle
# aria-label associated to the updates row to help screen readers to announce the group
# of input controls being entered.
addon-detail-group-label-updates =
    .aria-label = { addon-detail-updates-label }
# This is the tooltip text for the private browsing badge in about:addons. The
# badge is the private browsing icon included next to the extension's name.
addon-badge-private-browsing-allowed2 =
    .title = Gizli pencerelerde izinli
    .aria-label = { addon-badge-private-browsing-allowed2.title }
addon-detail-private-browsing-help = İzin verirseniz bu uzantı, gizli gezinti sırasında çevrimiçi etkinliklerinize erişebilir. <a data-l10n-name="learn-more">Daha fazla bilgi alın</a>
addon-detail-private-browsing-allow = İzin ver
addon-detail-private-browsing-disallow = İzin verme
# aria-label associated to the private browsing row to help screen readers to announce the group
# of input controls being entered.
addon-detail-group-label-private-browsing =
    .aria-label = { detail-private-browsing-label }

## "sites with restrictions" (internally called "quarantined") are special domains
## where add-ons are normally blocked for security reasons.

# Used as a description for the option to allow or block an add-on on quarantined domains.
addon-detail-quarantined-domains-label = Kısıtlamalara sahip sitelerde çalıştır
# Used as label and tooltip text on the radio inputs associated to the quarantined domains UI controls.
addon-detail-quarantined-domains-allow = İzin ver
addon-detail-quarantined-domains-disallow = İzin verme
# aria-label associated to the quarantined domains exempt row to help screen readers to announce the group.
addon-detail-group-label-quarantined-domains =
    .aria-label = { addon-detail-quarantined-domains-label }

## This is the tooltip text for the recommended badges for an extension in about:addons. The
## badge is a small icon displayed next to an extension when it is recommended on AMO.

addon-badge-recommended2 =
    .title = { -brand-product-name } yalnızca güvenlik ve performans standartlarımızı karşılayan uzantıları önerir
    .aria-label = { addon-badge-recommended2.title }
# We hard code "Mozilla" in the string below because the extensions are built
# by Mozilla and we don't want forks to display "by Fork".
addon-badge-line3 =
    .title = Resmi Mozilla uzantısı. Güvenlik ve performans standartlarını karşılar.
    .aria-label = { addon-badge-line3.title }
addon-badge-verified2 =
    .title = Bu uzantı incelendi, güvenlik ve performans standartlarımızı karşıladığı onaylandı
    .aria-label = { addon-badge-verified2.title }

##

available-updates-heading = Mevcut güncellemeler
recent-updates-heading = Son güncellenenler
release-notes-loading = Yükleniyor…
release-notes-error = Üzgünüz, sürüm notları yüklenirken bir hata meydana geldi.
addon-permissions-empty = Bu uzantı herhangi bir izin gerektirmiyor
addon-permissions-required = Temel işlevler için gerekli izinler:
addon-permissions-optional = Ek işlevler için isteğe bağlı izinler:
addon-permissions-learnmore = İzinler hakkında daha fazla bilgi alın
recommended-extensions-heading = Önerilen uzantılar
recommended-themes-heading = Önerilen temalar
# Variables:
#   $hostname (string) - Host where the permissions are granted
addon-sitepermissions-required = <span data-l10n-name="hostname">{ $hostname }</span> sitesine aşağıdaki izinleri verir:
# A recommendation for the Firefox Color theme shown at the bottom of the theme
# list view. The "Firefox Color" name itself should not be translated.
recommended-theme-1 = Yaratıcı gününüzde misiniz? <a data-l10n-name="link">Firefox Color ile kendi temanızı oluşturun.</a>

## Page headings

extension-heading = Uzantılarınızı yönetin
theme-heading = Temalarınızı yönetin
plugin-heading = Yan uygulamalarınızı yönetin
dictionary-heading = Sözlüklerinizi yönetin
locale-heading = Dillerinizi yönetin
updates-heading = Güncellemelerinizi yönetin
sitepermission-heading = Site izinlerinizi yönetin
discover-heading = { -brand-short-name } tarayıcınızı kişiselleştirin
shortcuts-heading = Uzantı kısayollarını yönet
default-heading-search-label = Daha fazla eklenti bul
addons-heading-search-input =
    .placeholder = addons.mozilla.org’da ara
addon-page-options-button =
    .title = Tüm eklentiler için araçlar

## Detail notifications
## Variables:
##   $name (string) - Name of the add-on.

# Variables:
#   $version (string) - Application version.
details-notification-incompatible = { $name } eklentisi { -brand-short-name } { $version } ile uyumsuz.
details-notification-incompatible-link = Daha fazla bilgi
details-notification-unsigned-and-disabled = { $name } { -brand-short-name } üzerinde kullanım için doğrulanamadı ve etkisizleştirildi.
details-notification-unsigned-and-disabled-link = Daha fazla bilgi
details-notification-unsigned = { $name } { -brand-short-name } üzerinde kullanım için doğrulanamadı. Lütfen dikkatli olun.
details-notification-unsigned-link = Daha fazla bilgi
details-notification-blocked = { $name } güvenlik veya kararlılık gerekçesiyle devre dışı bırakıldı.
details-notification-blocked-link = Daha fazla bilgi
details-notification-softblocked = { $name } eklentisinin güvenlik veya kararlılık sorunlarına yol açtığı biliniyor.
details-notification-softblocked-link = Daha fazla bilgi
details-notification-gmp-pending = { $name } az sonra yüklenecektir.
