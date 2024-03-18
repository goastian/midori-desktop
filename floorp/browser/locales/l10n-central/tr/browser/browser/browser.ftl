# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## The main browser window's title

# These are the default window titles everywhere except macOS.
# .data-title-default and .data-title-private are used when the web content
# opened has no title:
#
# default - "Mozilla Firefox"
# private - "Mozilla Firefox (Private Browsing)"
#
# .data-content-title-default and .data-content-title-private are for use when
# there *is* a content title.
# Variables:
#  $content-title (String): the title of the web content.
browser-main-window-window-titles =
    .data-title-default = { -brand-full-name }
    .data-title-private = { -brand-full-name } Gizli Gezinti
    .data-content-title-default = { $content-title } — { -brand-full-name }
    .data-content-title-private = { $content-title } — { -brand-full-name } Gizli Gezinti
# These are the default window titles on macOS.
# .data-title-default and .data-title-private are used when the web content
# opened has no title:
#
#
# "default" - "Mozilla Firefox"
# "private" - "Mozilla Firefox — (Private Browsing)"
#
# .data-content-title-default and .data-content-title-private are for use when
# there *is* a content title.
# Do not use the brand name in these, as we do on non-macOS.
#
# Also note the other subtle difference here: we use a `-` to separate the
# brand name from `(Private Browsing)`, which does not happen on other OSes.
#
# Variables:
#  $content-title (String): the title of the web content.
browser-main-window-mac-window-titles =
    .data-title-default = { -brand-full-name }
    .data-title-private = { -brand-full-name } — Gizli Gezinti
    .data-content-title-default = { $content-title }
    .data-content-title-private = { $content-title } — Gizli Gezinti
# This gets set as the initial title, and is overridden as soon as we start
# updating the titlebar based on loaded tabs or private browsing state.
# This should match the `data-title-default` attribute in both
# `browser-main-window` and `browser-main-window-mac`.
browser-main-window-title = { -brand-full-name }
# The non-variable portion of this MUST match the translation of
# "PRIVATE_BROWSING_SHORTCUT_TITLE" in custom.properties
private-browsing-shortcut-text-2 = { -brand-shortcut-name } Gizli Gezinti

##

urlbar-identity-button =
    .aria-label = Site bilgilerini göster

## Tooltips for images appearing in the address bar

urlbar-services-notification-anchor =
    .tooltiptext = Yükleme mesajı panelini aç
urlbar-web-notification-anchor =
    .tooltiptext = Sitenin bildirim gönderip gönderemeyeceğini ayarlayın
urlbar-midi-notification-anchor =
    .tooltiptext = MIDI panelini aç
urlbar-eme-notification-anchor =
    .tooltiptext = DRM yazılımı kullanımını yönet
urlbar-web-authn-anchor =
    .tooltiptext = Web kimlik doğrulaması panelini aç
urlbar-canvas-notification-anchor =
    .tooltiptext = Kanvas çıkarma iznini yönetme
urlbar-web-rtc-share-microphone-notification-anchor =
    .tooltiptext = Siteyle mikrofonumu paylaşmayı yönet
urlbar-default-notification-anchor =
    .tooltiptext = Mesaj panelini aç
urlbar-geolocation-notification-anchor =
    .tooltiptext = Konum isteği panelini aç
urlbar-xr-notification-anchor =
    .tooltiptext = Sanal gerçeklik izin panelini aç
urlbar-storage-access-anchor =
    .tooltiptext = Gezinme etkinliği izin panelini aç
urlbar-web-rtc-share-screen-notification-anchor =
    .tooltiptext = Siteyle pencerelerimi veya ekranımı paylaşmayı yönet
urlbar-indexed-db-notification-anchor =
    .tooltiptext = Çevrimdışı depolama mesajı panelini aç
urlbar-password-notification-anchor =
    .tooltiptext = Parolayı kaydet mesajı panelini aç
urlbar-plugins-notification-anchor =
    .tooltiptext = Yan uygulama kullanımını yönet
urlbar-web-rtc-share-devices-notification-anchor =
    .tooltiptext = Siteyle kamera ve/veya mikrofonumu paylaşmayı yönet
# "Speakers" is used in a general sense that might include headphones or
# another audio output connection.
urlbar-web-rtc-share-speaker-notification-anchor =
    .tooltiptext = Siteyle diğer ses aygıtlarımı paylaşmayı yönet
urlbar-autoplay-notification-anchor =
    .tooltiptext = Otomatik oynatma panelini aç
urlbar-persistent-storage-notification-anchor =
    .tooltiptext = Kalıcı depolamada veri depola
urlbar-addons-notification-anchor =
    .tooltiptext = Eklenti yükleme mesajı panelini aç
urlbar-tip-help-icon =
    .title = Yardım al
urlbar-search-tips-confirm = Tamam, anladım
urlbar-search-tips-confirm-short = Anladım
# Read out before Urlbar Tip text content so screenreader users know the
# subsequent text is a tip offered by the browser. It should end in a colon or
# localized equivalent.
urlbar-tip-icon-description =
    .alt = İpucu:
urlbar-result-menu-button =
    .title = Menüyü aç
urlbar-result-menu-button-feedback = Görüş bildir
    .title = Menüyü aç
urlbar-result-menu-learn-more =
    .label = Daha fazla bilgi al
    .accesskey = D
urlbar-result-menu-remove-from-history =
    .label = Geçmişten kaldır
    .accesskey = G
urlbar-result-menu-tip-get-help =
    .label = Yardım al
    .accesskey = Y

## Prompts users to use the Urlbar when they open a new tab or visit the
## homepage of their default search engine.
## Variables:
##  $engineName (String): The name of the user's default search engine. e.g. "Google" or "DuckDuckGo".

urlbar-search-tips-onboard = Daha az yazın, daha çok bulun: Adres çubuğunuzdan { $engineName } ile arama yapın.
urlbar-search-tips-redirect-2 = { $engineName } ve gezinti geçmişinizden gelen önerileri görmek için adres çubuğunda arama yapmaya başlayın.
# Make sure to match the name of the Search panel in settings.
urlbar-search-tips-persist = Arama yapmak artık daha basit. Aramanızı doğrudan adres çubuğunda düzenlemeyi deneyin. Bunun yerine adresi görmek isterseniz ayarlardaki Arama kısmına bakın.
# Prompts users to use the Urlbar when they are typing in the domain of a
# search engine, e.g. google.com or amazon.com.
urlbar-tabtosearch-onboard = Aradığınızı daha hızlı bulmak için bu kısayolu seçin.

## Local search mode indicator labels in the urlbar

urlbar-search-mode-bookmarks = Yer imleri
urlbar-search-mode-tabs = Sekmeler
urlbar-search-mode-history = Geçmiş
urlbar-search-mode-actions = Eylemler

##

urlbar-geolocation-blocked =
    .tooltiptext = Bu sitenin konumunuzu öğrenmesini engellediniz.
urlbar-xr-blocked =
    .tooltiptext = Bu sitenin sanal gerçeklik cihazlarına erişimini engellediniz.
urlbar-web-notifications-blocked =
    .tooltiptext = Bu sitenin bildirim göndermesini engellediniz.
urlbar-camera-blocked =
    .tooltiptext = Bu sitenin kameranızı kullanmasını engellediniz.
urlbar-microphone-blocked =
    .tooltiptext = Bu sitenin mikrofonunuzu kullanmasını engellediniz.
urlbar-screen-blocked =
    .tooltiptext = Bu sitenin ekranınızı paylaşmasını engellediniz.
urlbar-persistent-storage-blocked =
    .tooltiptext = Bu sitenin kalıcı veri depolamasını engellediniz.
urlbar-popup-blocked =
    .tooltiptext = Bu sitedeki açılır pencereleri engellediniz.
urlbar-autoplay-media-blocked =
    .tooltiptext = Bu sitenin sesli medya dosyalarını otomatik oynatmasını engellediniz.
urlbar-canvas-blocked =
    .tooltiptext = Bu sitenin kanvastan veri ayıklamasını engellediniz.
urlbar-midi-blocked =
    .tooltiptext = Bu sitenin MIDI erişimini engellediniz.
urlbar-install-blocked =
    .tooltiptext = Bu sitenin eklenti yüklemesini engellediniz.
# Variables
#   $shortcut (String) - A keyboard shortcut for the edit bookmark command.
urlbar-star-edit-bookmark =
    .tooltiptext = Bu yer imini düzenle ({ $shortcut })
# Variables
#   $shortcut (String) - A keyboard shortcut for the add bookmark command.
urlbar-star-add-bookmark =
    .tooltiptext = Bu sayfayı yer imlerine ekle ({ $shortcut })

## Page Action Context Menu

page-action-manage-extension2 =
    .label = Uzantıyı yönet…
    .accesskey = U
page-action-remove-extension2 =
    .label = Uzantıyı kaldır
    .accesskey = k

## Auto-hide Context Menu

full-screen-autohide =
    .label = Araç çubuklarını gizle
    .accesskey = A
full-screen-exit =
    .label = Tam ekran kipinden çık
    .accesskey = T

## Search Engine selection buttons (one-offs)

# This string prompts the user to use the list of search shortcuts in
# the Urlbar and searchbar.
search-one-offs-with-title = Bir de bununla aramayı deneyin:
search-one-offs-change-settings-compact-button =
    .tooltiptext = Arama ayarlarını değiştir
search-one-offs-context-open-new-tab =
    .label = Yeni sekmede ara
    .accesskey = s
search-one-offs-context-set-as-default =
    .label = Varsayılan arama motoru yap
    .accesskey = m
search-one-offs-context-set-as-default-private =
    .label = Gizli pencerelerde varsayılan arama motoru olarak ayarla
    .accesskey = G
# Search engine one-off buttons with an @alias shortcut/keyword.
# Variables:
#  $engineName (String): The name of the engine.
#  $alias (String): The @alias shortcut/keyword.
search-one-offs-engine-with-alias =
    .tooltiptext = { $engineName } ({ $alias })
# Shown when adding new engines from the address bar shortcut buttons or context
# menu, or from the search bar shortcut buttons.
# Variables:
#  $engineName (String): The name of the engine.
search-one-offs-add-engine =
    .label = “{ $engineName }” arama motorunu ekle
    .tooltiptext = “{ $engineName }” arama motorunu ekle
    .aria-label = “{ $engineName }” arama motorunu ekle
# When more than 5 engines are offered by a web page, they are grouped in a
# submenu using this as its label.
search-one-offs-add-engine-menu =
    .label = Arama motoru ekle

## Local search mode one-off buttons
## Variables:
##  $restrict (String): The restriction token corresponding to the search mode.
##    Restriction tokens are special characters users can type in the urlbar to
##    restrict their searches to certain sources (e.g., "*" to search only
##    bookmarks).

search-one-offs-bookmarks =
    .tooltiptext = Yer imleri ({ $restrict })
search-one-offs-tabs =
    .tooltiptext = Sekmeler ({ $restrict })
search-one-offs-history =
    .tooltiptext = Geçmiş ({ $restrict })
search-one-offs-actions =
    .tooltiptext = Eylemler ({ $restrict })

## QuickActions are shown in the urlbar as the user types a matching string
## The -cmd- strings are comma separated list of keywords that will match
## the action.

# Opens the about:addons page in the home / recommendations section
quickactions-addons = Eklentileri görüntüle
quickactions-cmd-addons2 = eklentiler
# Opens the bookmarks library window
quickactions-bookmarks2 = Yer imlerini yönet
quickactions-cmd-bookmarks = yer imleri
# Opens a SUMO article explaining how to clear history
quickactions-clearhistory = Geçmişi temizle
quickactions-cmd-clearhistory = geçmişi temizle
# Opens about:downloads page
quickactions-downloads2 = İndirilenleri göster
quickactions-cmd-downloads = indirilenler
# Opens about:addons page in the extensions section
quickactions-extensions = Uzantıları yönet
quickactions-cmd-extensions = uzantılar
# Opens the devtools web inspector
quickactions-inspector2 = Geliştirici araçlarını aç
quickactions-cmd-inspector = denetçi, geliştirici araçları
# Opens about:logins
quickactions-logins2 = Parolaları yönet
quickactions-cmd-logins = hesaplar, parolalar
# Opens about:addons page in the plugins section
quickactions-plugins = Yan uygulamaları yönet
quickactions-cmd-plugins = yan uygulamalar
# Opens the print dialog
quickactions-print2 = Sayfayı yazdır
quickactions-cmd-print = yazdır
# Opens a new private browsing window
quickactions-private2 = Gizli pencere aç
quickactions-cmd-private = gizli gezinti
# Opens a SUMO article explaining how to refresh
quickactions-refresh = { -brand-short-name } tarayıcısını yenile
quickactions-cmd-refresh = tazele
# Restarts the browser
quickactions-restart = { -brand-short-name } tarayıcısını yeniden başlat
quickactions-cmd-restart = yeniden başlat
# Opens the screenshot tool
quickactions-screenshot3 = Ekran görüntüsü al
quickactions-cmd-screenshot = ekran görüntüsü
# Opens about:preferences
quickactions-settings2 = Ayarları yönet
quickactions-cmd-settings = ayarlar, tercihler, seçenekler
# Opens about:addons page in the themes section
quickactions-themes = Temaları yönet
quickactions-cmd-themes = temalar
# Opens a SUMO article explaining how to update the browser
quickactions-update = { -brand-short-name } tarayıcısını güncelle
quickactions-cmd-update = güncelle
# Opens the view-source UI with current pages source
quickactions-viewsource2 = Sayfa kaynağını göster
quickactions-cmd-viewsource = kaynağı görüntüle, kaynak
# Tooltip text for the help button shown in the result.
quickactions-learn-more =
    .title = Hızlı eylemler hakkında daha fazla bilgi alın

## Bookmark Panel

bookmarks-add-bookmark = Yer imi ekle
bookmarks-edit-bookmark = Yer imini düzenle
bookmark-panel-cancel =
    .label = Vazgeç
    .accesskey = z
# Variables:
#  $count (number): number of bookmarks that will be removed
bookmark-panel-remove =
    .label =
        { $count ->
            [one] Yer imini sil
           *[other] { $count } yer imini sil
        }
    .accesskey = s
bookmark-panel-show-editor-checkbox =
    .label = Kaydederken düzenleyiciyi göster
    .accesskey = K
bookmark-panel-save-button =
    .label = Kaydet
# Width of the bookmark panel.
# Should be large enough to fully display the Done and
# Cancel/Remove Bookmark buttons.
bookmark-panel =
    .style = min-width: 23em

## Identity Panel

# Variables
#  $host (String): the hostname of the site that is being displayed.
identity-site-information = { $host } site bilgileri
# Variables
#  $host (String): the hostname of the site that is being displayed.
identity-header-security-with-host =
    .title = { $host } bağlantı güvenliği
identity-connection-not-secure = Bağlantı güvenli değil
identity-connection-secure = Bağlantı güvenli
identity-connection-failure = Bağlantı hatası
identity-connection-internal = Burası güvenli bir { -brand-short-name } sayfasıdır.
identity-connection-file = Bu sayfa bilgisayarınızda depolanıyor.
identity-extension-page = Bu sayfa bir uzantı üzerinden yüklendi.
identity-active-blocked = { -brand-short-name } bu sayfanın güvenli olmayan kısımlarını engelledi.
identity-custom-root = Bağlantı, Mozilla’nın tanımadığı bir sertifika yayıncısı tarafından doğrulandı.
identity-passive-loaded = Bu sayfanın bazı kısımları (örneğin resimler) güvenli değil.
identity-active-loaded = Bu sayfada korumayı devre dışı bıraktınız.
identity-weak-encryption = Bu sayfada zayıf şifreleme kullanılıyor.
identity-insecure-login-forms = Bu sayfaya girilen hesap bilgileri ele geçirilebilir.
identity-https-only-connection-upgraded = (HTTPS’e yükseltildi)
identity-https-only-label = Yalnızca HTTPS modu
identity-https-only-label2 = Bu siteyi otomatik olarak güvenli bağlantıya yükselt
identity-https-only-dropdown-on =
    .label = Açık
identity-https-only-dropdown-off =
    .label = Kapalı
identity-https-only-dropdown-off-temporarily =
    .label = Geçici olarak kapalı
identity-https-only-info-turn-on2 = Mümkün olduğunda { -brand-short-name } tarayıcınızın güvenli bağlantıya geçmesini istiyorsanız bu site için Yalnızca HTTPS modunu açın.
identity-https-only-info-turn-off2 = Sayfa düzgün çalışmazsa bu site için Yalnızca HTTPS modunu kapatarak siteyi güvensiz HTTP ile yüklemeyi deneyebilirsiniz.
identity-https-only-info-turn-on3 = Mümkün olduğunda { -brand-short-name } tarayıcınızın güvenli bağlantıya geçmesini istiyorsanız bu site için HTTPS yükseltmelerini açın.
identity-https-only-info-turn-off3 = Sayfa düzgün çalışmazsa bu site için HTTPS yükseltmelerini kapatarak siteyi güvensiz HTTP ile yüklemeyi deneyebilirsiniz.
identity-https-only-info-no-upgrade = HTTP bağlantısı yükseltilemedi.
identity-permissions-storage-access-header = Siteler arası çerezler
identity-permissions-storage-access-hint = Aşağıdaki siteler, siz bu sitedeyken başka sitelerin çerezlerini ve site verilerini kullanabilir.
identity-permissions-storage-access-learn-more = Daha fazla bilgi al
identity-permissions-reload-hint = Değişikliklerin uygulanması için bu sayfayı tazelemeniz gerekebilir.
identity-clear-site-data =
    .label = Çerezleri ve site verilerini temizle…
identity-connection-not-secure-security-view = Bu siteye güvenli bir şekilde bağlanmadınız.
identity-connection-verified = Bu siteye güvenli bir şekilde bağlandınız.
identity-ev-owner-label = Sertifika sahibi:
identity-description-custom-root2 = Mozilla bu sertifika yayıncısını tanımıyor. İşletim sisteminiz üzerinden veya sistem yöneticiniz tarafından eklenmiş olabilir.
identity-remove-cert-exception =
    .label = Ayrıcalığı kaldır
    .accesskey = k
identity-description-insecure = Bu siteye bağlantınız size özel değil. Gönderdiğiniz bilgiler (parolalar, mesajlar, kredi kartı bilgileri vb.) başkaları tarafından görülebilir.
identity-description-insecure-login-forms = Bu sayfaya yazdığınız hesap bilgileri güvende değildir ve saldırganlar tarafından ele geçirilebilir.
identity-description-weak-cipher-intro = Bu siteye bağlatnınız zayıf bir şifreleme kullanıyor ve size özel değil.
identity-description-weak-cipher-risk = Başkaları bilgilerinizi görebilir veya web sitesinin davranışını değiştirebilir.
identity-description-active-blocked2 = { -brand-short-name } bu sayfanın güvenli olmayan kısımlarını engelledi.
identity-description-passive-loaded = Bağlantınız size özel değil ve bu siteyle paylaştığınız bilgiler başkaları tarafından görülebilir.
identity-description-passive-loaded-insecure2 = Bu sitede güvenli olmayan içerikler (resimler vb.) var.
identity-description-passive-loaded-mixed2 = { -brand-short-name } bazı içerikleri engellemiş olmasına rağmen bu sayfada hâlâ güvenli olmayan içerikler (örn. resimler) var.
identity-description-active-loaded = Bu web sitesinde güvenli olmayan içerikler var (örn. betikler) ve siteye olan bağlantınız gizli değil.
identity-description-active-loaded-insecure = Bu siteyle paylaştığınız bilgiler (örn. parolalar, mesajlar, kredi kartı bilgileri vb.) başkaları tarafından görülebilir.
identity-disable-mixed-content-blocking =
    .label = Korumayı şimdilik devre dışı bırak
    .accesskey = d
identity-enable-mixed-content-blocking =
    .label = Korumayı etkinleştir
    .accesskey = e
identity-more-info-link-text =
    .label = Daha fazla bilgi

## Window controls

browser-window-minimize-button =
    .tooltiptext = Küçült
browser-window-maximize-button =
    .tooltiptext = Ekranı kapla
browser-window-restore-down-button =
    .tooltiptext = Geri küçült
browser-window-close-button =
    .tooltiptext = Kapat

## Tab actions

# This label should be written in all capital letters if your locale supports them.
browser-tab-audio-playing2 = OYNATILIYOR
# This label should be written in all capital letters if your locale supports them.
browser-tab-audio-muted2 = SESSİZ
# This label should be written in all capital letters if your locale supports them.
browser-tab-audio-blocked = OTOMATİK OYNATMA ENGELLENDİ
# This label should be written in all capital letters if your locale supports them.
browser-tab-audio-pip = GÖRÜNTÜ İÇİNDE GÖRÜNTÜ

## These labels should be written in all capital letters if your locale supports them.
## Variables:
##  $count (number): number of affected tabs

browser-tab-mute =
    { $count ->
        [1] SEKMENİN SESİNİ KAPAT
       *[other] { $count } SEKMENİN SESİNİ KAPAT
    }
browser-tab-unmute =
    { $count ->
        [1] SEKMENİN SESİNİ AÇ
        [one] SEKMENİN SESİNİ AÇ
       *[other] { $count } SEKMENİN SESİNİ AÇ
    }
browser-tab-unblock =
    { $count ->
        [1] SEKMEYİ OYNAT
        [one] SEKMEYİ OYNAT
       *[other] { $count } SEKMEYİ OYNAT
    }

## Bookmarks toolbar items

browser-import-button2 =
    .label = Yer imlerini içe aktar…
    .tooltiptext = Başka bir tarayıcıdaki yer imlerini { -brand-short-name } tarayıcısına aktar.
bookmarks-toolbar-empty-message = Hızlıca erişmek istediğiniz yer imlerinizi yer imleri araç çubuğuna yerleştirebilirsiniz. <a data-l10n-name="manage-bookmarks">Yer imlerini yönet…</a>

## WebRTC Pop-up notifications

popup-select-camera-device =
    .value = Kamera:
    .accesskey = K
popup-select-camera-icon =
    .tooltiptext = Kamera
popup-select-microphone-device =
    .value = Mikrofon:
    .accesskey = M
popup-select-microphone-icon =
    .tooltiptext = Mikrofon
popup-select-speaker-icon =
    .tooltiptext = Hoparlör
popup-select-window-or-screen =
    .label = Pencere veya ekran:
    .accesskey = P
popup-all-windows-shared = Ekranınızdaki tüm görünür pencereler paylaşılacaktır.

## WebRTC window or screen share tab switch warning

sharing-warning-window = { -brand-short-name } tarayıcınızı paylaşıyorsunuz. Yeni bir sekmeye geçerseniz diğer kullanıcılar bunu görebilir.
sharing-warning-screen = Tüm ekranınızı paylaşıyorsunuz. Yeni bir sekmeye geçerseniz diğer kullanıcılar bunu görebilir.
sharing-warning-proceed-to-tab =
    .label = Sekmeye devam et
sharing-warning-disable-for-session =
    .label = Bu oturumda paylaşım korumasını devre dışı bırak

## DevTools F12 popup

enable-devtools-popup-description2 = F12 kısayolunu kullanmak için önce tarayıcı araçları menüsünden geliştirici araçlarını açın.

## URL Bar

# This placeholder is used when not in search mode and the user's default search
# engine is unknown.
urlbar-placeholder =
    .placeholder = Arama yapın veya adres yazın
# This placeholder is used in search mode with search engines that search the
# entire web.
# Variables
#  $name (String): the name of a search engine that searches the entire Web
#  (e.g. Google).
urlbar-placeholder-search-mode-web-2 =
    .placeholder = Web’de ara
    .aria-label = { $name } ile ara
# This placeholder is used in search mode with search engines that search a
# specific site (e.g., Amazon).
# Variables
#  $name (String): the name of a search engine that searches a specific site
#  (e.g. Amazon).
urlbar-placeholder-search-mode-other-engine =
    .placeholder = Aranacak terimleri yazın
    .aria-label = { $name } ile ara
# This placeholder is used when searching bookmarks.
urlbar-placeholder-search-mode-other-bookmarks =
    .placeholder = Aranacak terimleri yazın
    .aria-label = Yer imlerinde ara
# This placeholder is used when searching history.
urlbar-placeholder-search-mode-other-history =
    .placeholder = Aranacak terimleri yazın
    .aria-label = Geçmişte ara
# This placeholder is used when searching open tabs.
urlbar-placeholder-search-mode-other-tabs =
    .placeholder = Aranacak terimleri yazın
    .aria-label = Sekmelerde ara
# This placeholder is used when searching quick actions.
urlbar-placeholder-search-mode-other-actions =
    .placeholder = Aranacak terimleri yazın
    .aria-label = Eylemlerde ara
# Variables
#  $name (String): the name of the user's default search engine
urlbar-placeholder-with-name =
    .placeholder = { $name } ile arama yapın veya adres yazın
# Variables
#  $component (String): the name of the component which forces remote control.
#    Example: "DevTools", "Marionette", "RemoteAgent".
urlbar-remote-control-notification-anchor2 =
    .tooltiptext = Tarayıcı uzaktan kontrol ediliyor (sebep: { $component })
urlbar-permissions-granted =
    .tooltiptext = Bu siteye ek izinler verdiniz.
urlbar-switch-to-tab =
    .value = Sekmeye geç:
# Used to indicate that a selected autocomplete entry is provided by an extension.
urlbar-extension =
    .value = Uzantı:
urlbar-go-button =
    .tooltiptext = Konum çubuğundaki adrese git
urlbar-page-action-button =
    .tooltiptext = Sayfa eylemleri

## Action text shown in urlbar results, usually appended after the search
## string or the url, like "result value - action text".

# Used when the private browsing engine differs from the default engine.
# The "with" format was chosen because the search engine name can end with
# "Search", and we would like to avoid strings like "Search MSN Search".
# Variables
#  $engine (String): the name of a search engine
urlbar-result-action-search-in-private-w-engine = Gizli pencerede { $engine } ile ara
# Used when the private browsing engine is the same as the default engine.
urlbar-result-action-search-in-private = Gizli pencerede ara
# The "with" format was chosen because the search engine name can end with
# "Search", and we would like to avoid strings like "Search MSN Search".
# Variables
#  $engine (String): the name of a search engine
urlbar-result-action-search-w-engine = { $engine } ile ara
urlbar-result-action-sponsored = Sponsorlu
urlbar-result-action-switch-tab = Sekmeye geç
urlbar-result-action-visit = Ziyaret et
# Directs a user to press the Tab key to perform a search with the specified
# engine.
# Variables
#  $engine (String): the name of a search engine that searches the entire Web
#  (e.g. Google).
urlbar-result-action-before-tabtosearch-web = { $engine } ile aramak için Tab tuşuna basın
# Directs a user to press the Tab key to perform a search with the specified
# engine.
# Variables
#  $engine (String): the name of a search engine that searches a specific site
#  (e.g. Amazon).
urlbar-result-action-before-tabtosearch-other = { $engine } ile aramak için Tab tuşuna basın
# Variables
#  $engine (String): the name of a search engine that searches the entire Web
#  (e.g. Google).
urlbar-result-action-tabtosearch-web = { $engine } ile doğrudan adres çubuğundan arama yapın
# Variables
#  $engine (String): the name of a search engine that searches a specific site
#  (e.g. Amazon).
urlbar-result-action-tabtosearch-other-engine = { $engine } ile doğrudan adres çubuğundan arama yapın
# Action text for copying to clipboard.
urlbar-result-action-copy-to-clipboard = Kopyala
# Shows the result of a formula expression being calculated, the last = sign will be shown
# as part of the result (e.g. "= 2").
# Variables
#  $result (String): the string representation for a formula result
urlbar-result-action-calculator-result = = { $result }

## Action text shown in urlbar results, usually appended after the search
## string or the url, like "result value - action text".
## In these actions "Search" is a verb, followed by where the search is performed.

urlbar-result-action-search-bookmarks = Yer imlerinde ara
urlbar-result-action-search-history = Geçmişte ara
urlbar-result-action-search-tabs = Sekmelerde ara
urlbar-result-action-search-actions = İşlemlerde ara

## Labels shown above groups of urlbar results

# A label shown above the "Firefox Suggest" (bookmarks/history) group in the
# urlbar results.
urlbar-group-firefox-suggest =
    .label = { -firefox-suggest-brand-name }
# A label shown above the search suggestions group in the urlbar results. It
# should use sentence case.
# Variables
#  $engine (String): the name of the search engine providing the suggestions
urlbar-group-search-suggestions =
    .label = { $engine } Önerileri
# A label shown above Quick Actions in the urlbar results.
urlbar-group-quickactions =
    .label = Hızlı Eylemler

## Reader View toolbar buttons

# This should match menu-view-enter-readerview in menubar.ftl
reader-view-enter-button =
    .aria-label = Okuyucu Görünümü'ne geç
# This should match menu-view-close-readerview in menubar.ftl
reader-view-close-button =
    .aria-label = Okuyucu Görünümü'nü kapat

## Picture-in-Picture urlbar button
## Variables:
##   $shortcut (String) - Keyboard shortcut to execute the command.

picture-in-picture-urlbar-button-open =
    .tooltiptext = Görüntü içinde görüntüyü aç ({ $shortcut })
picture-in-picture-urlbar-button-close =
    .tooltiptext = Görüntü içinde görüntüyü kapat ({ $shortcut })
picture-in-picture-panel-header = Görüntü içinde görüntü
picture-in-picture-panel-headline = Bu web sitesi görüntü içinde görüntüyü önermiyor
picture-in-picture-panel-body = Görüntü içinde görüntüyü açarsanız videolar geliştiricinin amaçladığı gibi görünmeyebilir.
picture-in-picture-enable-toggle =
    .label = Yine de etkinleştir

## Full Screen and Pointer Lock UI

# Please ensure that the domain stays in the `<span data-l10n-name="domain">` markup.
# Variables
#  $domain (String): the domain that is full screen, e.g. "mozilla.org"
fullscreen-warning-domain = <span data-l10n-name="domain">{ $domain }</span> artık tam ekran
fullscreen-warning-no-domain = Bu belge artık tam ekran
fullscreen-exit-button = Tam ekrandan çık (Esc)
# "esc" is lowercase on mac keyboards, but uppercase elsewhere.
fullscreen-exit-mac-button = Tam ekrandan çık (esc)
# Please ensure that the domain stays in the `<span data-l10n-name="domain">` markup.
# Variables
#  $domain (String): the domain that is using pointer-lock, e.g. "mozilla.org"
pointerlock-warning-domain = <span data-l10n-name="domain">{ $domain }</span> işaretçinizi kontrol ediyor. Kontrolü geri almak için Esc tuşuna basın.
pointerlock-warning-no-domain = Bu belge işaretçinizi kontrol ediyor. Kontrolü geri almak için Esc tuşuna basın.

## Bookmarks panels, menus and toolbar

bookmarks-manage-bookmarks =
    .label = Yer imlerini yönet
bookmarks-recent-bookmarks-panel-subheader = Son yer imleri
bookmarks-toolbar-chevron =
    .tooltiptext = Daha fazla yer imi göster
bookmarks-sidebar-content =
    .aria-label = Yer imleri
bookmarks-menu-button =
    .label = Yer imleri menüsü
bookmarks-other-bookmarks-menu =
    .label = Diğer yer imleri
bookmarks-mobile-bookmarks-menu =
    .label = Mobil yer imleri

## Variables:
##   $isVisible (boolean): if the specific element (e.g. bookmarks sidebar,
##                         bookmarks toolbar, etc.) is visible or not.

bookmarks-tools-sidebar-visibility =
    .label =
        { $isVisible ->
            [true] Yer imleri kenar çubuğunu gizle
           *[other] Yer imleri kenar çubuğunu göster
        }
bookmarks-tools-toolbar-visibility-menuitem =
    .label =
        { $isVisible ->
            [true] Yer imleri kenar çubuğunu gizle
           *[other] Yer imleri araç çubuğunu göster
        }
bookmarks-tools-toolbar-visibility-panel =
    .label =
        { $isVisible ->
            [true] Yer imleri araç çubuğunu gizle
           *[other] Yer imleri araç çubuğunu göster
        }
bookmarks-tools-menu-button-visibility =
    .label =
        { $isVisible ->
            [true] Yer imleri menüsünü araç çubuğundan çıkar
           *[other] Yer imleri menüsünü araç çubuğuna ekle
        }

##

bookmarks-search =
    .label = Yer imlerinde ara
bookmarks-tools =
    .label = Yer imi araçları
bookmarks-subview-edit-bookmark =
    .label = Bu yer imini düzenle…
# The aria-label is a spoken label that should not include the word "toolbar" or
# such, because screen readers already know that this container is a toolbar.
# This avoids double-speaking.
bookmarks-toolbar =
    .toolbarname = Yer imleri araç çubuğu
    .accesskey = Y
    .aria-label = Yer imleri
bookmarks-toolbar-menu =
    .label = Yer imleri araç çubuğu
bookmarks-toolbar-placeholder =
    .title = Yer imleri araç çubuğu öğeleri
bookmarks-toolbar-placeholder-button =
    .label = Yer imleri araç çubuğu öğeleri
# "Bookmark" is a verb, as in "Add current tab to bookmarks".
bookmarks-subview-bookmark-tab =
    .label = Bu sekmeyi yer imlerine ekle…

## Library Panel items

library-bookmarks-menu =
    .label = Yer imleri
library-recent-activity-title =
    .value = Son etkinlikler

## Pocket toolbar button

save-to-pocket-button =
    .label = { -pocket-brand-name }’a kaydet
    .tooltiptext = { -pocket-brand-name }’a kaydet

## Repair text encoding toolbar button

repair-text-encoding-button =
    .label = Metin kodlamasını onar
    .tooltiptext = Sayfa içeriğinden doğru metin kodlamasını tahmin et

## Customize Toolbar Buttons

# Variables:
#  $shortcut (String): keyboard shortcut to open settings (only on macOS)
toolbar-settings-button =
    .label = Ayarlar
    .tooltiptext =
        { PLATFORM() ->
            [macos] Ayarları aç ({ $shortcut })
           *[other] Ayarları aç
        }
toolbar-overflow-customize-button =
    .label = Araç çubuğunu özelleştir…
    .accesskey = u
toolbar-button-email-link =
    .label = Bağlantıyı e-postala
    .tooltiptext = Bu sayfanın linkini e-postayla gönder
toolbar-button-logins =
    .label = Parolalar
    .tooltiptext = Kayıtlı parolalarımı görüntüle ve yönet
# Variables:
#  $shortcut (String): keyboard shortcut to save a copy of the page
toolbar-button-save-page =
    .label = Sayfayı kaydet
    .tooltiptext = Bu sayfayı kaydet ({ $shortcut })
# Variables:
#  $shortcut (String): keyboard shortcut to open a local file
toolbar-button-open-file =
    .label = Dosya aç
    .tooltiptext = Dosya aç ({ $shortcut })
toolbar-button-synced-tabs =
    .label = Eşitlenmiş sekmeler
    .tooltiptext = Diğer cihazlardaki sekmeleri göster
# Variables
# $shortcut (string) - Keyboard shortcut to open a new private browsing window
toolbar-button-new-private-window =
    .label = Yeni gizli pencere
    .tooltiptext = Yeni bir Gizli Gezinti penceresi aç ({ $shortcut })

## EME notification panel

eme-notifications-drm-content-playing = Bu sitedeki bazı ses veya videolar DRM yazılımı kullanıyor. Bu yazılım, { -brand-short-name } ile yapabileceklerinizi kısıtlayabilir.
eme-notifications-drm-content-playing-manage = Ayarları yönet
eme-notifications-drm-content-playing-manage-accesskey = A
eme-notifications-drm-content-playing-dismiss = Kapat
eme-notifications-drm-content-playing-dismiss-accesskey = K

## Password save/update panel

panel-save-update-username = Kullanıcı adı
panel-save-update-password = Parola

##

# "More" item in macOS share menu
menu-share-more =
    .label = Daha fazla…
ui-tour-info-panel-close =
    .tooltiptext = Kapat

## Variables:
##  $uriHost (String): URI host for which the popup was allowed or blocked.

popups-infobar-allow =
    .label = { $uriHost } açılır pencerelerine izin ver
    .accesskey = p
popups-infobar-block =
    .label = { $uriHost } açılır pencerelerini engelle
    .accesskey = p

##

popups-infobar-dont-show-message =
    .label = Açılır pencereler engellendiğinde bu iletiyi gösterme
    .accesskey = m
edit-popup-settings =
    .label = Açılır pencere ayarlarını yönet…
    .accesskey = A
picture-in-picture-hide-toggle =
    .label = Görüntü içinde görüntü düğmesini gizle
    .accesskey = G

## Since the default position for PiP controls does not change for RTL layout,
## right-to-left languages should use "Left" and "Right" as in the English strings,

picture-in-picture-move-toggle-right =
    .label = Görüntü içinde görüntü düğmesini sağa taşı
    .accesskey = G
picture-in-picture-move-toggle-left =
    .label = Görüntü içinde görüntü düğmesini sola taşı
    .accesskey = ö

##


# Navigator Toolbox

# This string is a spoken label that should not include
# the word "toolbar" or such, because screen readers already know that
# this container is a toolbar. This avoids double-speaking.
navbar-accessible =
    .aria-label = Gezinme
navbar-downloads =
    .label = İndirilenler
navbar-overflow =
    .tooltiptext = Daha fazla araç…
# Variables:
#   $shortcut (String): keyboard shortcut to print the page
navbar-print =
    .label = Yazdır
    .tooltiptext = Bu sayfayı yazdır… ({ $shortcut })
navbar-home =
    .label = Başlangıç
    .tooltiptext = { -brand-short-name } Giriş Sayfası
navbar-library =
    .label = Arşiv
    .tooltiptext = Geçmişinize, kayıtlı yer imlerinize ve daha fazlasına bakın
navbar-search =
    .title = Ara
# Name for the tabs toolbar as spoken by screen readers. The word
# "toolbar" is appended automatically and should not be included in
# in the string
tabs-toolbar =
    .aria-label = Tarayıcı sekmeleri
tabs-toolbar-new-tab =
    .label = Yeni sekme
tabs-toolbar-list-all-tabs =
    .label = Tüm sekmeleri listele
    .tooltiptext = Tüm sekmeleri listele

## Infobar shown at startup to suggest session-restore

# <img data-l10n-name="icon"/> will be replaced by the application menu icon
restore-session-startup-suggestion-message = <strong>Önceki sekmeler açılsın mı?</strong> Önceki oturumunuzu { -brand-short-name } menüsündeki (<img data-l10n-name="icon"/>) “Geçmiş” kısmından geri yükleyebilirsiniz.
restore-session-startup-suggestion-button = Nasıl yapacağımı göster

## Mozilla data reporting notification (Telemetry, Firefox Health Report, etc)

data-reporting-notification-message = { -brand-short-name }, deneyiminizi geliştirebilmemiz için bazı verileri otomatik olarak { -vendor-short-name } sunucularına gönderir.
data-reporting-notification-button =
    .label = Ne paylaşacağımı seç
    .accesskey = N
# Label for the indicator shown in the private browsing window titlebar.
private-browsing-indicator-label = Gizli gezinti

## Unified extensions (toolbar) button

unified-extensions-button =
    .label = Uzantılar
    .tooltiptext = Uzantılar

## Unified extensions button when permission(s) are needed.
## Note that the new line is intentionally part of the tooltip.

unified-extensions-button-permissions-needed =
    .label = Uzantılar
    .tooltiptext =
        Uzantılar
        İzin gerekli

## Unified extensions button when some extensions are quarantined.
## Note that the new line is intentionally part of the tooltip.

unified-extensions-button-quarantined =
    .label = Uzantılar
    .tooltiptext = Bazı uzantılara izin verilmiyor

## Autorefresh blocker

refresh-blocked-refresh-label = { -brand-short-name } bu sayfanın kendiliğinden yenilenmesini önledi.
refresh-blocked-redirect-label = { -brand-short-name } bu sayfanın başka sayfaya yönlenmesini önledi.
refresh-blocked-allow =
    .label = İzin ver
    .accesskey = z

## Firefox Relay integration

firefox-relay-offer-why-to-use-relay = Güvenli, kullanımı kolay maskelerimiz kimliğinizi korur ve e-posta adresinizi gizleyerek istenmeyen e-postaları önler.
# Variables:
#  $useremail (String): user email that will receive messages
firefox-relay-offer-what-relay-provides = E-posta maskelerinize gönderilen tüm e-postalar <strong>{ $useremail }</strong> adresine yönlendirilecektir (siz engellemeye karar vermediğiniz sürece).
firefox-relay-offer-legal-notice = “E-posta maskesi kullan”a tıkladığınızda <label data-l10n-name="tos-url">Hizmet Koşulları</label>’nı ve <label data-l10n-name="privacy-url">Gizlilik Bildirimi</label>’ni kabul etmiş sayılırsınız.

## Add-on Pop-up Notifications

popup-notification-addon-install-unsigned =
    .value = (Doğrulanmamış)
popup-notification-xpinstall-prompt-learn-more = Eklentileri güvenle yükleme hakkında daha fazla bilgi alın

## Pop-up warning

# Variables:
#   $popupCount (Number): the number of pop-ups blocked.
popup-warning-message =
    { $popupCount ->
        [one] { -brand-short-name } bu sitenin açılır pencere açmasını engelledi.
       *[other] { -brand-short-name } bu sitenin { $popupCount } açılır pencere açmasını engelledi.
    }
# The singular form is left out for English, since the number of blocked pop-ups is always greater than 1.
# Variables:
#   $popupCount (Number): the number of pop-ups blocked.
popup-warning-exceeded-message =
    { $popupCount ->
        [one] { -brand-short-name } bu sitenin { $popupCount } açılır pencere açmasını engelledi.
       *[other] { -brand-short-name } bu sitenin { $popupCount } açılır pencere açmasını engelledi.
    }
popup-warning-button =
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
# Variables:
#   $popupURI (String): the URI for the pop-up window
popup-show-popup-menuitem =
    .label = “{ $popupURI }” penceresini göster
