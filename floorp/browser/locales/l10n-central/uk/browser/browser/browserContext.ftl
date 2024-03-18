# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

navbar-tooltip-instruction =
    .value =
        { PLATFORM() ->
            [macos] Потягніть вниз, щоб показати історію вкладки
           *[other] Натисніть праву клавішу чи потягніть вниз, щоб показати історію вкладки
        }

## Back

# Variables
#   $shortcut (String) - A keyboard shortcut for the Go Back command.
main-context-menu-back-2 =
    .tooltiptext = Назад на одну сторінку ({ $shortcut })
    .aria-label = Назад
    .accesskey = Н
# This menuitem is only visible on macOS
main-context-menu-back-mac =
    .label = Назад
    .accesskey = Н
navbar-tooltip-back-2 =
    .value = { main-context-menu-back-2.tooltiptext }
toolbar-button-back-2 =
    .label = { main-context-menu-back-2.aria-label }

## Forward

# Variables
#   $shortcut (String) - A keyboard shortcut for the Go Forward command.
main-context-menu-forward-2 =
    .tooltiptext = Вперед на одну сторінку ({ $shortcut })
    .aria-label = Вперед
    .accesskey = В
# This menuitem is only visible on macOS
main-context-menu-forward-mac =
    .label = Вперед
    .accesskey = В
navbar-tooltip-forward-2 =
    .value = { main-context-menu-forward-2.tooltiptext }
toolbar-button-forward-2 =
    .label = { main-context-menu-forward-2.aria-label }

## Reload

main-context-menu-reload =
    .aria-label = Оновити
    .accesskey = О
# This menuitem is only visible on macOS
main-context-menu-reload-mac =
    .label = Оновити
    .accesskey = О
toolbar-button-reload =
    .label = { main-context-menu-reload.aria-label }

## Stop

main-context-menu-stop =
    .aria-label = Зупинити
    .accesskey = З
# This menuitem is only visible on macOS
main-context-menu-stop-mac =
    .label = Зупинити
    .accesskey = З
toolbar-button-stop =
    .label = { main-context-menu-stop.aria-label }

## Stop-Reload Button

toolbar-button-stop-reload =
    .title = { main-context-menu-reload.aria-label }

## Firefox Account Button

toolbar-button-fxaccount =
    .label = { -fxaccount-brand-name }
    .tooltiptext = { -fxaccount-brand-name }

## Save Page

main-context-menu-page-save =
    .label = Зберегти як…
    .accesskey = б

## Simple menu items

main-context-menu-bookmark-page =
    .aria-label = Додати сторінку до закладок…
    .accesskey = з
    .tooltiptext = Додати сторінку до закладок…
# This menuitem is only visible on macOS
# Cannot be shown at the same time as main-context-menu-edit-bookmark-mac,
# so should probably have the same access key if possible.
main-context-menu-bookmark-page-mac =
    .label = Додати сторінку до закладок…
    .accesskey = з
# This menuitem is only visible on macOS
# Cannot be shown at the same time as main-context-menu-bookmark-page-mac,
# so should probably have the same access key if possible.
main-context-menu-edit-bookmark-mac =
    .label = Редагувати закладку…
    .accesskey = Р
# Variables
#   $shortcut (String) - A keyboard shortcut for the add bookmark command.
main-context-menu-bookmark-page-with-shortcut =
    .aria-label = Додати сторінку до закладок…
    .accesskey = з
    .tooltiptext = Додати сторінку до закладок ({ $shortcut })
main-context-menu-edit-bookmark =
    .aria-label = Редагувати закладку…
    .accesskey = Р
    .tooltiptext = Редагувати закладку
# Variables
#   $shortcut (String) - A keyboard shortcut for the edit bookmark command.
main-context-menu-edit-bookmark-with-shortcut =
    .aria-label = Редагувати закладку…
    .accesskey = Р
    .tooltiptext = Редагувати закладку ({ $shortcut })
main-context-menu-open-link =
    .label = Відкрити посилання
    .accesskey = В
main-context-menu-open-link-new-tab =
    .label = Відкрити посилання в новій вкладці
    .accesskey = т
main-context-menu-open-link-container-tab =
    .label = Відкрити посилання в новій вкладці контейнера
    .accesskey = к
main-context-menu-open-link-new-window =
    .label = Відкрити посилання в новому вікні
    .accesskey = к
main-context-menu-open-link-new-private-window =
    .label = Відкрити в приватному вікні
    .accesskey = и
main-context-menu-bookmark-link-2 =
    .label = Додати посилання до закладок
    .accesskey = п
main-context-menu-save-link =
    .label = Зберегти посилання як…
    .accesskey = я
main-context-menu-save-link-to-pocket =
    .label = Зберегти посилання в { -pocket-brand-name }
    .accesskey = б

## The access keys for "Copy Link" and "Copy Email Address"
## should be the same if possible; the two context menu items
## are mutually exclusive.

main-context-menu-copy-email =
    .label = Копіювати адресу е-пошти
    .accesskey = п
main-context-menu-copy-phone =
    .label = Копіювати номер телефону
    .accesskey = о
main-context-menu-copy-link-simple =
    .label = Копіювати посилання
    .accesskey = п
# This command copies the link, removing additional
# query parameters used to track users across sites.
main-context-menu-strip-on-share-link =
    .label = Копіювати посилання без елементів стеження сайту
    .accesskey = е

## Media (video/audio) controls
##
## The accesskey for "Play" and "Pause" are the
## same because the two context-menu items are
## mutually exclusive.

main-context-menu-media-play =
    .label = Відтворити
    .accesskey = т
main-context-menu-media-pause =
    .label = Пауза
    .accesskey = а

##

main-context-menu-media-mute =
    .label = Вимкнути звук
    .accesskey = и
main-context-menu-media-unmute =
    .label = Увімкнути звук
    .accesskey = и
main-context-menu-media-play-speed-2 =
    .label = Швидкість
    .accesskey = Ш
main-context-menu-media-play-speed-slow-2 =
    .label = 0.5×
main-context-menu-media-play-speed-normal-2 =
    .label = 1.0×
main-context-menu-media-play-speed-fast-2 =
    .label = 1.25×
main-context-menu-media-play-speed-faster-2 =
    .label = 1.5×
main-context-menu-media-play-speed-fastest-2 =
    .label = 2×
main-context-menu-media-loop =
    .label = Цикл
    .accesskey = л

## The access keys for "Show Controls" and "Hide Controls" are the same
## because the two context-menu items are mutually exclusive.

main-context-menu-media-show-controls =
    .label = Показати керувальники
    .accesskey = к
main-context-menu-media-hide-controls =
    .label = Сховати елементи керування
    .accesskey = к

##

main-context-menu-media-video-fullscreen =
    .label = На весь екран
    .accesskey = е
main-context-menu-media-video-leave-fullscreen =
    .label = Вийти з повноекранного режиму
    .accesskey = В
# This is used when right-clicking on a video in the
# content area when the Picture-in-Picture feature is enabled.
main-context-menu-media-watch-pip =
    .label = Дивитися в режимі "Зображення в зображенні"
    .accesskey = З
main-context-menu-image-reload =
    .label = Перезавантажити зображення
    .accesskey = з
main-context-menu-image-view-new-tab =
    .label = Відкрити зображення в новій вкладці
    .accesskey = к
main-context-menu-video-view-new-tab =
    .label = Відкрити відео в новій вкладці
    .accesskey = о
main-context-menu-image-copy =
    .label = Копіювати зображення
    .accesskey = з
main-context-menu-image-copy-link =
    .label = Копіювати посилання на зображення
    .accesskey = ж
main-context-menu-video-copy-link =
    .label = Копіювати посилання на відео
    .accesskey = в
main-context-menu-audio-copy-link =
    .label = Копіювати посилання на аудіо
    .accesskey = у
main-context-menu-image-save-as =
    .label = Зберегти зображення як…
    .accesskey = б
main-context-menu-image-email =
    .label = Переслати зображення…
    .accesskey = ж
main-context-menu-image-set-image-as-background =
    .label = Призначити тлом стільниці…
    .accesskey = ч
main-context-menu-image-copy-text =
    .label = Копіювати текст із зображення
    .accesskey = К
main-context-menu-image-info =
    .label = Інформація про зображення
    .accesskey = І
main-context-menu-image-desc =
    .label = Переглянути опис
    .accesskey = о
main-context-menu-video-save-as =
    .label = Зберегти відео як…
    .accesskey = в
main-context-menu-audio-save-as =
    .label = Зберегти аудіо як…
    .accesskey = а
main-context-menu-video-take-snapshot =
    .label = Зробити знімок…
    .accesskey = н
main-context-menu-video-email =
    .label = Переслати відео…
    .accesskey = с
main-context-menu-audio-email =
    .label = Переслати аудіо…
    .accesskey = с
main-context-menu-save-to-pocket =
    .label = Зберегти сторінку в { -pocket-brand-name }
    .accesskey = с
main-context-menu-send-to-device =
    .label = Надіслати сторінку на пристрій
    .accesskey = с

## The access keys for "Use Saved Login" and "Use Saved Password"
## should be the same if possible; the two context menu items
## are mutually exclusive.

main-context-menu-use-saved-login =
    .label = Використати збережене ім'я входу
    .accesskey = б
main-context-menu-use-saved-password =
    .label = Використати збережений пароль
    .accesskey = б

##

main-context-menu-use-relay-mask =
    .label = Використати маску електронної пошти { -relay-brand-short-name }
    .accesskey = е
main-context-menu-suggest-strong-password =
    .label = Запропонувати надійний пароль…
    .accesskey = й
main-context-menu-manage-logins2 =
    .label = Керувати паролями
    .accesskey = К
main-context-menu-keyword =
    .label = Створити скорочення для цього пошуку…
    .accesskey = д
main-context-menu-link-send-to-device =
    .label = Надіслати посилання на пристрій
    .accesskey = Н
main-context-menu-frame =
    .label = У цьому фреймі
    .accesskey = ь
main-context-menu-frame-show-this =
    .label = Показати тільки цей фрейм
    .accesskey = з
main-context-menu-frame-open-tab =
    .label = Відкрити фрейм в новій вкладці
    .accesskey = ц
main-context-menu-frame-open-window =
    .label = Відкрити фрейм в новому вікні
    .accesskey = ф
main-context-menu-frame-reload =
    .label = Оновити фрейм
    .accesskey = в
main-context-menu-frame-add-bookmark =
    .label = Додати фрейм до закладок…
    .accesskey = й
main-context-menu-frame-save-as =
    .label = Зберегти фрейм як…
    .accesskey = ф
main-context-menu-frame-print =
    .label = Друкувати фрейм…
    .accesskey = ф
main-context-menu-frame-view-source =
    .label = Програмний код фрейма
    .accesskey = й
main-context-menu-frame-view-info =
    .label = Інформація про фрейм
    .accesskey = ф
main-context-menu-print-selection-2 =
    .label = Друкувати вибране…
    .accesskey = к
main-context-menu-view-selection-source =
    .label = Програмний код вибірки
    .accesskey = к
main-context-menu-take-screenshot =
    .label = Зробити знімок екрана
    .accesskey = м
main-context-menu-take-frame-screenshot =
    .label = Зробити знімок екрана
    .accesskey = н
main-context-menu-view-page-source =
    .label = Програмний код сторінки
    .accesskey = а
main-context-menu-bidi-switch-text =
    .label = Перемкнути напрям тексту на сторінці
    .accesskey = к
main-context-menu-bidi-switch-page =
    .label = Перемкнути напрям тексту на сторінці
    .accesskey = м
main-context-menu-inspect =
    .label = Дослідити
    .accesskey = л
main-context-menu-inspect-a11y-properties =
    .label = Дослідити властивості доступності
main-context-menu-eme-learn-more =
    .label = Докладніше про DRM…
    .accesskey = Д
# Variables
#   $containerName (String): The name of the current container
main-context-menu-open-link-in-container-tab =
    .label = Відкрити посилання в новій вкладці { $containerName }
    .accesskey = о
main-context-menu-reveal-password =
    .label = Показати пароль
    .accesskey = П
