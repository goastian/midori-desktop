# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


# Note: This is currently placed under browser/base/content so that we can
# get the strings to appear without having our localization community need
# to go through and translate everything. Once these strings are ready for
# translation, we'll move it to the locales folder.


## These strings are used so that the window has a title in tools that
## enumerate/look for window titles. It is not normally visible anywhere.

webrtc-indicator-title = { -brand-short-name } - Покажчик спільного доступу
webrtc-indicator-window =
    .title = { -brand-short-name } - Покажчик спільного доступу

## Used as list items in sharing menu

webrtc-item-camera = камера
webrtc-item-microphone = мікрофон
webrtc-item-audio-capture = аудіо вкладки
webrtc-item-application = програма
webrtc-item-screen = екран
webrtc-item-window = вікно
webrtc-item-browser = вкладка

##

# This is used for the website origin for the sharing menu if no readable origin could be deduced from the URL.
webrtc-sharing-menuitem-unknown-host = Невідоме джерело

# Variables:
#   $origin (String): The website origin (e.g. www.mozilla.org)
#   $itemList (String): A formatted list of items (e.g. "camera, microphone and tab audio")
webrtc-sharing-menuitem =
    .label = { $origin } ({ $itemList })
webrtc-sharing-menu =
    .label = Спільне використання вкладок пристроями
    .accesskey = с

webrtc-sharing-window = Ви надаєте спільний доступ до іншого вікна програми.
webrtc-sharing-browser-window = Ви надаєте спільний доступ до { -brand-short-name }.
webrtc-sharing-screen = Ви надаєте спільний доступ до цілого екрана.
webrtc-stop-sharing-button = Припинити спільний доступ.
webrtc-microphone-unmuted =
    .title = Вимкнути мікрофон
webrtc-microphone-muted =
    .title = Увімкнути мікрофон
webrtc-camera-unmuted =
    .title = Вимкнути камеру
webrtc-camera-muted =
    .title = Увімкнути камеру
webrtc-minimize =
    .title = Згорнути покажчик

## These strings will display as a tooltip on supported systems where we show
## device sharing state in the OS notification area. We do not use these strings
## on macOS, as global menu bar items do not have native tooltips.

webrtc-camera-system-menu =
    .label = Ви надаєте доступ до своєї камери. Натисніть для керування спільним доступом.
webrtc-microphone-system-menu =
    .label = Ви надаєте доступ до свого мікрофона. Натисніть для керування спільним доступом.
webrtc-screen-system-menu =
    .label = Ви надаєте доступ до вікна. Натисніть для керування спільним доступом.

## Tooltips used by the legacy global sharing indicator

webrtc-indicator-sharing-camera-and-microphone =
    .tooltiptext = Ваші камера та мікрофон використовуються спільно. Клацніть, щоб керувати.
webrtc-indicator-sharing-camera =
    .tooltiptext = Ваша камера використовується спільно. Клацніть, щоб керувати.
webrtc-indicator-sharing-microphone =
    .tooltiptext = Ваш мікрофон використовується спільно. Клацніть, щоб керувати.
webrtc-indicator-sharing-application =
    .tooltiptext = Програма використовується спільно. Клацніть, щоб керувати.
webrtc-indicator-sharing-screen =
    .tooltiptext = Ваш еркан використовується спільно. Клацніть, щоб керувати.
webrtc-indicator-sharing-window =
    .tooltiptext = Вікно використовується спільно. Клацніть, щоб керувати.
webrtc-indicator-sharing-browser =
    .tooltiptext = Вкладка використовується спільно. Клацніть, щоб керувати.

## These strings are only used on Mac for menus attached to icons
## near the clock on the mac menubar.
## Variables:
##   $streamTitle (String): the title of the tab using the share.
##   $tabCount (Number): the title of the tab using the share.

webrtc-indicator-menuitem-control-sharing =
    .label = Керувати спільним використанням
webrtc-indicator-menuitem-control-sharing-on =
    .label = Керувати спільним використанням на "{ $streamTitle }"

webrtc-indicator-menuitem-sharing-camera-with =
    .label = Спільне використання камери з "{ $streamTitle }"
webrtc-indicator-menuitem-sharing-camera-with-n-tabs =
    .label =
        { $tabCount ->
            [one] Спільне використання камери з { $tabCount } вкладкою
            [few] Спільне використання камери з { $tabCount } вкладками
           *[many] Спільне використання камери з { $tabCount } вкладками
        }

webrtc-indicator-menuitem-sharing-microphone-with =
    .label = Спільне використання мікрофону з "{ $streamTitle }"
webrtc-indicator-menuitem-sharing-microphone-with-n-tabs =
    .label =
        { $tabCount ->
            [one] Спільне використання мікрофону з { $tabCount } вкладкою
            [few] Спільне використання мікрофону з { $tabCount } вкладками
           *[many] Спільне використання мікрофону з { $tabCount } вкладками
        }

webrtc-indicator-menuitem-sharing-application-with =
    .label = Спільне використання програми з "{ $streamTitle }"
webrtc-indicator-menuitem-sharing-application-with-n-tabs =
    .label =
        { $tabCount ->
            [one] Спільне використання програми з { $tabCount } вкладкою
            [few] Спільне використання програми з { $tabCount } вкладками
           *[many] Спільне використання програми з { $tabCount } вкладками
        }

webrtc-indicator-menuitem-sharing-screen-with =
    .label = Спільне використання екрана з "{ $streamTitle }"
webrtc-indicator-menuitem-sharing-screen-with-n-tabs =
    .label =
        { $tabCount ->
            [one] Спільне використання екрана з { $tabCount } вкладкою
            [few] Спільне використання екрана з { $tabCount } вкладками
           *[many] Спільне використання екрана з { $tabCount } вкладками
        }

webrtc-indicator-menuitem-sharing-window-with =
    .label = Спільне використання вікна з "{ $streamTitle }"
webrtc-indicator-menuitem-sharing-window-with-n-tabs =
    .label =
        { $tabCount ->
            [one] Спільне використання вікна з { $tabCount } вкладкою
            [few] Спільне використання вікна з { $tabCount } вкладками
           *[many] Спільне використання вікна з { $tabCount } вкладками
        }

webrtc-indicator-menuitem-sharing-browser-with =
    .label = Спільне використання вкладки з "{ $streamTitle }"
# This message is shown when the contents of a tab is shared during a WebRTC
# session, which currently is only possible with Loop/Hello.
webrtc-indicator-menuitem-sharing-browser-with-n-tabs =
    .label =
        { $tabCount ->
            [one] Спільне використання вкладки з { $tabCount } вкладкою
            [few] Спільне використання вкладок з { $tabCount } вкладками
           *[many] Спільне використання вкладок з { $tabCount } вкладками
        }

## Variables:
##   $origin (String): the website origin (e.g. www.mozilla.org).

webrtc-allow-share-audio-capture = Дозволити { $origin } прослуховувати аудіо цієї вкладки?
webrtc-allow-share-camera = Дозволити { $origin } використовувати вашу камеру?
webrtc-allow-share-microphone = Дозволити { $origin } використовувати ваш мікрофон?
webrtc-allow-share-screen = Дозволити { $origin } бачити ваш екран?
# "Speakers" is used in a general sense that might include headphones or
# another audio output connection.
webrtc-allow-share-speaker = Дозволити { $origin } використовувати інші гучномовці?
webrtc-allow-share-camera-and-microphone = Дозволити { $origin } використовувати ваші камеру та мікрофон?
webrtc-allow-share-camera-and-audio-capture = Дозволити { $origin } використовувати вашу камеру і прослуховувати аудіо цієї вкладки?
webrtc-allow-share-screen-and-microphone = Дозволити { $origin } використовувати ваш мікрофон і бачити ваш екран?
webrtc-allow-share-screen-and-audio-capture = Дозволити { $origin } прослуховувати аудіо цієї вкладки та бачити ваш екран?

## Variables:
##   $origin (String): the first party origin.
##   $thirdParty (String): the third party origin.

webrtc-allow-share-audio-capture-unsafe-delegation = Дозволити { $origin } надати для { $thirdParty } дозвіл прослуховувати аудіо цієї вкладки?
webrtc-allow-share-camera-unsafe-delegation = Дозволити { $origin } надати для { $thirdParty } доступ до вашої камери?
webrtc-allow-share-microphone-unsafe-delegation = Дозволити { $origin } надати для { $thirdParty } доступ до вашого мікрофону?
webrtc-allow-share-screen-unsafe-delegation = Дозволити { $origin } надати для { $thirdParty } дозвіл на перегляд вашого екрана?
# "Speakers" is used in a general sense that might include headphones or
# another audio output connection.
webrtc-allow-share-speaker-unsafe-delegation = Дозволити { $origin } надати для { $thirdParty } доступ до інших гучномовців?
webrtc-allow-share-camera-and-microphone-unsafe-delegation = Дозволити { $origin } надати для { $thirdParty } доступ до ваших камери та мікрофону?
webrtc-allow-share-camera-and-audio-capture-unsafe-delegation = Дозволити { $origin } надати для { $thirdParty } доступ до вашої камери та прослуховування аудіо цієї вкладки?
webrtc-allow-share-screen-and-microphone-unsafe-delegation = Дозволити { $origin } надати для { $thirdParty } доступ до вашого мікрофону та перегляду вашого екрана?
webrtc-allow-share-screen-and-audio-capture-unsafe-delegation = Дозволити { $origin } надати для { $thirdParty } дозвіл прослуховувати аудіо цієї вкладки та бачити ваш екран?

##

webrtc-share-screen-warning = Діліться екраном лише з сайтами, яким ви довіряєте. Спільний доступ може дозволити несправжнім сайтам перегляд від вашого імені та викрадення особистих даних.
webrtc-share-browser-warning = Діліться { -brand-short-name } лише з сайтами, яким ви довіряєте. Спільний доступ може дозволити несправжнім сайтам перегляд від вашого імені та викрадення особистих даних.

webrtc-share-screen-learn-more = Докладніше
webrtc-pick-window-or-screen = Оберіть вікно чи екран
webrtc-share-entire-screen = Увесь екран
webrtc-share-pipe-wire-portal = Використовувати налаштування операційної системи
# Variables:
#   $monitorIndex (String): screen number (digits 1, 2, etc).
webrtc-share-monitor = Екран { $monitorIndex }
# Variables:
#   $windowCount (Number): the number of windows currently displayed by the application.
#   $appName (String): the name of the application.
webrtc-share-application =
    { $windowCount ->
        [one] { $appName } ({ $windowCount } вікно)
        [few] { $appName } ({ $windowCount } вікна)
       *[many] { $appName } ({ $windowCount } вікон)
    }

## These buttons are the possible answers to the various prompts in the "webrtc-allow-share-*" strings.

webrtc-action-allow =
    .label = Дозволити
    .accesskey = з
webrtc-action-block =
    .label = Блокувати
    .accesskey = Б
webrtc-action-always-block =
    .label = Завжди блокувати
    .accesskey = ж
webrtc-action-not-now =
    .label = Не зараз
    .accesskey = Н

##

webrtc-remember-allow-checkbox = Запам'ятати це рішення
webrtc-mute-notifications-checkbox = Вимкнути сповіщення вебсайту під час спільного доступу

webrtc-reason-for-no-permanent-allow-screen = { -brand-short-name } не може дозволити постійний доступ до вашого екрана.
webrtc-reason-for-no-permanent-allow-audio = { -brand-short-name } не може дозволити постійний доступ до аудіо вашої вкладки без запиту.
webrtc-reason-for-no-permanent-allow-insecure = Ваше з'єднання з цим сайтом незахищене. Для вашого захисту { -brand-short-name } дозволить доступ лише для цього сеансу.
