# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## App Menu

appmenuitem-banner-update-downloading =
    .label = Завантажується оновлення { -brand-shorter-name }
appmenuitem-banner-update-available =
    .label = Доступне оновлення — завантажити
appmenuitem-banner-update-manual =
    .label = Доступне оновлення — завантажити
appmenuitem-banner-update-unsupported =
    .label = Не вдається оновити — несумісна система
appmenuitem-banner-update-restart =
    .label = Доступне оновлення — перезапустити
appmenuitem-new-tab =
    .label = Нова вкладка
appmenuitem-new-window =
    .label = Нове вікно
appmenuitem-new-private-window =
    .label = Приватне вікно
appmenuitem-history =
    .label = Історія
appmenuitem-downloads =
    .label = Завантаження
appmenuitem-passwords =
    .label = Паролі
appmenuitem-addons-and-themes =
    .label = Додатки й теми
appmenuitem-print =
    .label = Друкувати…
appmenuitem-find-in-page =
    .label = Знайти на сторінці…
appmenuitem-translate =
    .label = Перекласти сторінку…
appmenuitem-zoom =
    .value = Масштаб
appmenuitem-more-tools =
    .label = Інші інструменти
appmenuitem-help =
    .label = Довідка
appmenuitem-exit2 =
    .label =
        { PLATFORM() ->
            [linux] Вийти
           *[other] Вийти
        }
appmenu-menu-button-closed2 =
    .tooltiptext = Відкрити меню програми
    .label = { -brand-short-name }
appmenu-menu-button-opened2 =
    .tooltiptext = Закрити меню програми
    .label = { -brand-short-name }
# Settings is now used to access the browser settings across all platforms,
# instead of Options or Preferences.
appmenuitem-settings =
    .label = Налаштування

## Zoom and Fullscreen Controls

appmenuitem-zoom-enlarge =
    .label = Збільшити
appmenuitem-zoom-reduce =
    .label = Зменшити
appmenuitem-fullscreen =
    .label = На весь екран

## Firefox Account toolbar button and Sync panel in App menu.

appmenu-remote-tabs-sign-into-sync =
    .label = Увійти до Синхронізації…
appmenu-remote-tabs-turn-on-sync =
    .label = Увімкнути синхронізацію…
# This is shown after the tabs list if we can display more tabs by clicking on the button
appmenu-remote-tabs-showmore =
    .label = Показати більше вкладок
    .tooltiptext = Показати більше вкладок з цього пристрою
# This is shown beneath the name of a device when that device has no open tabs
appmenu-remote-tabs-notabs = Немає відкритих вкладок
# This is shown when Sync is configured but syncing tabs is disabled.
appmenu-remote-tabs-tabsnotsyncing = Увімкнути синхронізацію вкладок для можливості перегляду вашого списку вкладок з інших пристроїв.
appmenu-remote-tabs-opensettings =
    .label = Налаштування
# This is shown when Sync is configured but this appears to be the only device attached to
# the account. We also show links to download Firefox for android/ios.
appmenu-remote-tabs-noclients = Хочете побачити тут свої вкладки з інших пристроїв?
appmenu-remote-tabs-connectdevice =
    .label = Під'єднати інший пристрій
appmenu-remote-tabs-welcome = Переглядайте список вкладок з ваших інших пристроїв.
appmenu-remote-tabs-unverified = Ваш обліковий запис потребує підтвердження.
appmenuitem-fxa-toolbar-sync-now2 = Синхронізувати
appmenuitem-fxa-sign-in = Увійти в { -brand-product-name }
appmenuitem-fxa-manage-account = Керувати обліковим записом
appmenu-fxa-header2 = { -fxaccount-brand-name }
appmenu-account-header = Обліковий запис
# Variables
# $time (string) - Localized relative time since last sync (e.g. 1 second ago,
# 3 hours ago, etc.)
appmenu-fxa-last-sync = Востаннє синхронізовано { $time }
    .label = Востаннє синхронізовано { $time }
appmenu-fxa-sync-and-save-data2 = Синхронізувати та зберегти дані
appmenu-fxa-signed-in-label = Увійти
appmenu-fxa-setup-sync =
    .label = Увімкнути синхронізацію…
appmenuitem-save-page =
    .label = Зберегти як…

## What's New panel in App menu.

whatsnew-panel-header = Що нового
# Checkbox displayed at the bottom of the What's New panel, allowing users to
# enable/disable What's New notifications.
whatsnew-panel-footer-checkbox =
    .label = Сповіщати про нові функції
    .accesskey = в

## The Firefox Profiler – The popup is the UI to turn on the profiler, and record
## performance profiles. To enable it go to profiler.firefox.com and click
## "Enable Profiler Menu Button".

profiler-popup-button-idle =
    .label = Profiler
    .tooltiptext = Запис профілю швидкодії
profiler-popup-button-recording =
    .label = Profiler
    .tooltiptext = Profiler записує профіль
profiler-popup-button-capturing =
    .label = Profiler
    .tooltiptext = Profiler захоплює вкладку
profiler-popup-header-text = { -profiler-brand-name }
profiler-popup-reveal-description-button =
    .aria-label = Розкрити більше інформації
profiler-popup-description-title =
    .value = Записуйте, аналізуйте, діліться
profiler-popup-description = Співпрацюйте над проблемами швидкодії, оприлюднюючи профілі для своєї команди.
profiler-popup-learn-more-button =
    .label = Докладніше
profiler-popup-settings =
    .value = Налаштування
# This link takes the user to about:profiling, and is only visible with the Custom preset.
profiler-popup-edit-settings-button =
    .label = Змінити налаштування…
profiler-popup-recording-screen = Запис…
profiler-popup-start-recording-button =
    .label = Почати запис
profiler-popup-discard-button =
    .label = Відхилити
profiler-popup-capture-button =
    .label = Захоплення
profiler-popup-start-shortcut =
    { PLATFORM() ->
        [macos] ⌃⇧1
       *[other] Ctrl+Shift+1
    }
profiler-popup-capture-shortcut =
    { PLATFORM() ->
        [macos] ⌃⇧2
       *[other] Ctrl+Shift+2
    }

## Profiler presets
## They are shown in the popup's select box.


# Presets and their l10n IDs are defined in the file
# devtools/client/performance-new/shared/background.jsm.js
# Please take care that the same values are also defined in devtools' perftools.ftl.

profiler-popup-presets-web-developer-description = Рекомендовані попередні налаштування для налагодження більшості вебзастосунків. З низьким споживанням ресурсів.
profiler-popup-presets-web-developer-label =
    .label = Веброзробник
profiler-popup-presets-firefox-description = Рекомендовані налаштування для профілювання { -brand-shorter-name }.
profiler-popup-presets-firefox-label =
    .label = { -brand-shorter-name }
profiler-popup-presets-graphics-description = Налаштування для виявлення помилок графіки в { -brand-shorter-name }.
profiler-popup-presets-graphics-label =
    .label = Графіка
profiler-popup-presets-media-description2 = Налаштування для виявлення помилок аудіо та відео в { -brand-shorter-name }.
profiler-popup-presets-media-label =
    .label = Медіа
profiler-popup-presets-networking-description = Налаштування для виявлення помилок мережі в { -brand-shorter-name }.
profiler-popup-presets-networking-label =
    .label = Мережа
profiler-popup-presets-power-description = Налаштування для виявлення помилок використання потужності { -brand-shorter-name } із низьким накладанням.
# "Power" is used in the sense of energy (electricity used by the computer).
profiler-popup-presets-power-label =
    .label = Потужність
profiler-popup-presets-custom-label =
    .label = Власний

## History panel

appmenu-manage-history =
    .label = Керувати історією
appmenu-restore-session =
    .label = Відновити попередній сеанс
appmenu-clear-history =
    .label = Стерти недавню історію…
appmenu-recent-history-subheader = Недавня історія
appmenu-recently-closed-tabs =
    .label = Недавно закриті вкладки
appmenu-recently-closed-windows =
    .label = Недавно закриті вікна
# This allows to search through the browser's history.
appmenu-search-history =
    .label = Історія пошуку

## Help panel

appmenu-help-header =
    .title = Довідка { -brand-shorter-name }
appmenu-about =
    .label = Про { -brand-shorter-name }
    .accesskey = о
appmenu-get-help =
    .label = Отримати допомогу
    .accesskey = д
appmenu-help-more-troubleshooting-info =
    .label = Додаткова інформація щодо усунення проблем
    .accesskey = я
appmenu-help-report-site-issue =
    .label = Проблема з сайтом…
appmenu-help-share-ideas =
    .label = Поділіться ідеями та відгуком…
    .accesskey = П
appmenu-help-switch-device =
    .label = Перехід на новий пристрій

## appmenu-help-enter-troubleshoot-mode and appmenu-help-exit-troubleshoot-mode
## are mutually exclusive, so it's possible to use the same accesskey for both.

appmenu-help-enter-troubleshoot-mode2 =
    .label = Режим усунення проблем…
    .accesskey = б
appmenu-help-exit-troubleshoot-mode =
    .label = Вимкнути режим усунення проблем
    .accesskey = и

## appmenu-help-report-deceptive-site and appmenu-help-not-deceptive
## are mutually exclusive, so it's possible to use the same accesskey for both.

appmenu-help-report-deceptive-site =
    .label = Повідомити про шахрайський сайт…
    .accesskey = ш
appmenu-help-not-deceptive =
    .label = Це не шахрайський сайт…
    .accesskey = н

## More Tools

appmenu-customizetoolbar =
    .label = Налаштувати панель інструментів…
appmenu-developer-tools-subheader = Інструменти браузера
appmenu-developer-tools-extensions =
    .label = Розширення для розробників
