# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


# Note: This is currently placed under browser/base/content so that we can
# get the strings to appear without having our localization community need
# to go through and translate everything. Once these strings are ready for
# translation, we'll move it to the locales folder.


## These strings are used so that the window has a title in tools that
## enumerate/look for window titles. It is not normally visible anywhere.

webrtc-indicator-title = { -brand-short-name } — Paylaşım Göstergesi
webrtc-indicator-window =
    .title = { -brand-short-name } — Paylaşım Göstergesi

## Used as list items in sharing menu

webrtc-item-camera = kamera
webrtc-item-microphone = mikrofon
webrtc-item-audio-capture = sekme sesi
webrtc-item-application = uygulama
webrtc-item-screen = ekran
webrtc-item-window = pencere
webrtc-item-browser = sekme

##

# This is used for the website origin for the sharing menu if no readable origin could be deduced from the URL.
webrtc-sharing-menuitem-unknown-host = Bilinmeyen kaynak

# Variables:
#   $origin (String): The website origin (e.g. www.mozilla.org)
#   $itemList (String): A formatted list of items (e.g. "camera, microphone and tab audio")
webrtc-sharing-menuitem =
    .label = { $origin } ({ $itemList })
webrtc-sharing-menu =
    .label = Sekme paylaşan cihazlar
    .accesskey = c

webrtc-sharing-window = Başka bir uygulama penceresini paylaşıyorsunuz.
webrtc-sharing-browser-window = { -brand-short-name } tarayıcınızı paylaşıyorsunuz.
webrtc-sharing-screen = Tüm ekranınızı paylaşıyorsunuz.
webrtc-stop-sharing-button = Paylaşmayı durdur
webrtc-microphone-unmuted =
    .title = Mikrofonu kapat
webrtc-microphone-muted =
    .title = Mikrofonu aç
webrtc-camera-unmuted =
    .title = Kamerayı kapat
webrtc-camera-muted =
    .title = Kamerayı aç
webrtc-minimize =
    .title = Göstergeyi küçült

## These strings will display as a tooltip on supported systems where we show
## device sharing state in the OS notification area. We do not use these strings
## on macOS, as global menu bar items do not have native tooltips.

webrtc-camera-system-menu =
    .label = Kameranızı paylaşıyorsunuz. Paylaşımı yönetmek için tıklayın.
webrtc-microphone-system-menu =
    .label = Mikrofonunuzu paylaşıyorsunuz. Paylaşımı yönetmek için tıklayın.
webrtc-screen-system-menu =
    .label = Bir pencereyi veya ekranı paylaşıyorsunuz. Paylaşımı yönetmek için tıklayın.

## Tooltips used by the legacy global sharing indicator

webrtc-indicator-sharing-camera-and-microphone =
    .tooltiptext = Kamera ve mikrofununuz paylaşılıyor. Paylaşımı yönetmek için tıklayın.
webrtc-indicator-sharing-camera =
    .tooltiptext = Kameranız paylaşılıyor. Paylaşımı yönetmek için tıklayın.
webrtc-indicator-sharing-microphone =
    .tooltiptext = Mikrofununuz paylaşılıyor. Paylaşımı yönetmek için tıklayın.
webrtc-indicator-sharing-application =
    .tooltiptext = Bir uygulama paylaşılıyor. Paylaşımı yönetmek için tıklayın.
webrtc-indicator-sharing-screen =
    .tooltiptext = Ekranınız paylaşılıyor. Paylaşımı yönetmek için tıklayın.
webrtc-indicator-sharing-window =
    .tooltiptext = Bir pencere paylaşılıyor. Paylaşımı yönetmek için tıklayın.
webrtc-indicator-sharing-browser =
    .tooltiptext = Bir sekme paylaşılıyor. Paylaşımı yönetmek için tıklayın.

## These strings are only used on Mac for menus attached to icons
## near the clock on the mac menubar.
## Variables:
##   $streamTitle (String): the title of the tab using the share.
##   $tabCount (Number): the title of the tab using the share.

webrtc-indicator-menuitem-control-sharing =
    .label = Paylaşımı yönet
webrtc-indicator-menuitem-control-sharing-on =
    .label = “{ $streamTitle }” üzerinde paylaşımı yönet

webrtc-indicator-menuitem-sharing-camera-with =
    .label = Kamera “{ $streamTitle }” ile paylaşılıyor
webrtc-indicator-menuitem-sharing-camera-with-n-tabs =
    .label =
        { $tabCount ->
            [one] Kamera { $tabCount } sekme ile paylaşıyor
           *[other] Kamera { $tabCount } sekme ile paylaşıyor
        }

webrtc-indicator-menuitem-sharing-microphone-with =
    .label = Mikrofon “{ $streamTitle }” ile paylaşılıyor
webrtc-indicator-menuitem-sharing-microphone-with-n-tabs =
    .label =
        { $tabCount ->
            [one] Mikrofon { $tabCount } sekme ile paylaşıyor
           *[other] Mikrofon { $tabCount } sekme ile paylaşıyor
        }

webrtc-indicator-menuitem-sharing-application-with =
    .label = “{ $streamTitle }” ile bir uygulama paylaşılıyor
webrtc-indicator-menuitem-sharing-application-with-n-tabs =
    .label =
        { $tabCount ->
            [one] { $tabCount } sekmeyle bir uygulama paylaşılıyor
           *[other] { $tabCount } sekmeyle uygulamalar paylaşılıyor
        }

webrtc-indicator-menuitem-sharing-screen-with =
    .label = Ekran “{ $streamTitle }” ile paylaşılıyor
webrtc-indicator-menuitem-sharing-screen-with-n-tabs =
    .label =
        { $tabCount ->
            [one] Ekran { $tabCount } sekme ile paylaşıyor
           *[other] Ekran { $tabCount } sekme ile paylaşıyor
        }

webrtc-indicator-menuitem-sharing-window-with =
    .label = “{ $streamTitle }” ile bir pencere paylaşılıyor
webrtc-indicator-menuitem-sharing-window-with-n-tabs =
    .label =
        { $tabCount ->
            [one] Bir pencere { $tabCount } sekme ile paylaşıyor
           *[other] Pencereler { $tabCount } sekme ile paylaşıyor
        }

webrtc-indicator-menuitem-sharing-browser-with =
    .label = “{ $streamTitle }” ile bir sekme paylaşılıyor
# This message is shown when the contents of a tab is shared during a WebRTC
# session, which currently is only possible with Loop/Hello.
webrtc-indicator-menuitem-sharing-browser-with-n-tabs =
    .label =
        { $tabCount ->
            [one] { $tabCount } sekmeyle bir sekme paylaşılıyor
           *[other] { $tabCount } sekmeyle sekmeler paylaşılıyor
        }

## Variables:
##   $origin (String): the website origin (e.g. www.mozilla.org).

webrtc-allow-share-audio-capture = { $origin } bu sekmenin sesini dinleyebilsin mi?
webrtc-allow-share-camera = { $origin } kameranızı kullanabilsin mi?
webrtc-allow-share-microphone = { $origin } mikrofonunuzu kullanabilsin mi?
webrtc-allow-share-screen = { $origin } ekranınızı görebilsin mi?
# "Speakers" is used in a general sense that might include headphones or
# another audio output connection.
webrtc-allow-share-speaker = { $origin } diğer ses aygıtlarınızı kullanabilsin mi?
webrtc-allow-share-camera-and-microphone = { $origin } kameranızı ve mikrofonunuzu kullanabilsin mi?
webrtc-allow-share-camera-and-audio-capture = { $origin } kameranızı kullanabilsin ve bu sekmenin sesini dinleyebilsin mi?
webrtc-allow-share-screen-and-microphone = { $origin } mikrofonunuzu kullanabilsin ve ekranınızı görebilsin mi?
webrtc-allow-share-screen-and-audio-capture = { $origin } bu sekmenin sesini dinleyebilsin ve ekranınızı görebilsin mi?

## Variables:
##   $origin (String): the first party origin.
##   $thirdParty (String): the third party origin.

webrtc-allow-share-audio-capture-unsafe-delegation = { $origin } { $thirdParty } sitesinin bu sekmenin sesini dinlemesine izin versin mi?
webrtc-allow-share-camera-unsafe-delegation = { $origin } { $thirdParty } sitesinin kameranıza erişmesine izin versin mi?
webrtc-allow-share-microphone-unsafe-delegation = { $origin } { $thirdParty } sitesinin mikrofonunuza erişmesine izin versin mi?
webrtc-allow-share-screen-unsafe-delegation = { $origin } { $thirdParty } sitesinin ekranınızı görmesine izin versin mi?
# "Speakers" is used in a general sense that might include headphones or
# another audio output connection.
webrtc-allow-share-speaker-unsafe-delegation = { $origin } { $thirdParty } sitesinin diğer ses aygıtlarınıza erişmesine izin versin mi?
webrtc-allow-share-camera-and-microphone-unsafe-delegation = { $origin } { $thirdParty } sitesinin kameranıza ve mikrofonunuza erişmesine izin versin mi?
webrtc-allow-share-camera-and-audio-capture-unsafe-delegation = { $origin } { $thirdParty } sitesinin kameranıza erişmesine ve bu sekmenin sesini dinlemesine izin versin mi?
webrtc-allow-share-screen-and-microphone-unsafe-delegation = { $origin } { $thirdParty } sitesinin mikrofonunuza erişmesine ve ekranınızı görmesine izin versin mi?
webrtc-allow-share-screen-and-audio-capture-unsafe-delegation = { $origin } { $thirdParty } sitesinin bu sekmenin sesini dinlemesine ve ekranınızı görmesine izin versin mi?

##

webrtc-share-screen-warning = Yalnızca güvendiğiniz sitelerle ekranınızı paylaşın. Paylaşım, aldatıcı sitelerin sizin adınıza web’de dolaşmasına ve özel verilerinizi çalmasına olanak tanıyabilir.
webrtc-share-browser-warning = { -brand-short-name } tarayıcınızı yalnızca güvendiğiniz sitelerle paylaşın. Paylaşım, aldatıcı sitelerin sizin adınıza web’de gezinmesine ve özel verilerinizi çalmasına olanak tanıyabilir.

webrtc-share-screen-learn-more = Daha fazla bilgi alın
webrtc-pick-window-or-screen = Pencere veya ekranı seçin
webrtc-share-entire-screen = Tüm ekran
webrtc-share-pipe-wire-portal = İşletim sistemi ayarlarını kullan
# Variables:
#   $monitorIndex (String): screen number (digits 1, 2, etc).
webrtc-share-monitor = Ekran { $monitorIndex }
# Variables:
#   $windowCount (Number): the number of windows currently displayed by the application.
#   $appName (String): the name of the application.
webrtc-share-application =
    { $windowCount ->
        [one] { $appName } ({ $windowCount } pencere)
       *[other] { $appName } ({ $windowCount } pencere)
    }

## These buttons are the possible answers to the various prompts in the "webrtc-allow-share-*" strings.

webrtc-action-allow =
    .label = İzin ver
    .accesskey = z
webrtc-action-block =
    .label = Engelle
    .accesskey = E
webrtc-action-always-block =
    .label = Her zaman engelle
    .accesskey = H
webrtc-action-not-now =
    .label = Şimdi değil
    .accesskey = m

##

webrtc-remember-allow-checkbox = Bu kararı hatırla
webrtc-mute-notifications-checkbox = Paylaşırken web sitesi bildirimlerini sessize al

webrtc-reason-for-no-permanent-allow-screen = { -brand-short-name } ekranınıza kalıcı erişim izni veremiyor.
webrtc-reason-for-no-permanent-allow-audio = { -brand-short-name } hangi sekmeyi paylacağınızı sormadan sekme sesine kalıcı erişim izni vermez.
webrtc-reason-for-no-permanent-allow-insecure = Bu siteye bağlantınız güvenli değil. { -brand-short-name } sizi korumak için yalnızca bu oturum boyunca erişime izin verecek.
