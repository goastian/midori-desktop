# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

title-label = Про плагіни
installed-plugins-label = Встановлені плагіни
no-plugins-are-installed-label = Встановлених плагінів не знайдено
deprecation-description = Чогось не вистачає? Деякі плагіни більше не підтримуються. <a data-l10n-name="deprecation-link">Докладніше.</a>
deprecation-description2 =
    .message = Чогось не вистачає? Деякі плагіни більше не підтримуються.

## The information of plugins
##
## Variables:
##   $pluginLibraries: the plugin library
##   $pluginFullPath: path of the plugin
##   $version: version of the plugin

file-dd = <span data-l10n-name="file">Файл:</span> { $pluginLibraries }
path-dd = <span data-l10n-name="path">Шлях:</span> { $pluginFullPath }
version-dd = <span data-l10n-name="version">Версія:</span> { $version }

## These strings describe the state of plugins
##
## Variables:
##   $blockListState: show some special state of the plugin, such as blocked, outdated

state-dd-enabled = <span data-l10n-name="state">Стан:</span> Увімкнений
state-dd-enabled-block-list-state = <span data-l10n-name="state">Стан:</span> Увімкнений ({ $blockListState })
state-dd-Disabled = <span data-l10n-name="state">Стан:</span> Вимкнений
state-dd-Disabled-block-list-state = <span data-l10n-name="state">Стан:</span> Вимкнений ({ $blockListState })
mime-type-label = Тип MIME
description-label = Опис
suffixes-label = Суфікси

## Gecko Media Plugins (GMPs)

plugins-gmp-license-info = Інформація про ліцензію
plugins-gmp-privacy-info = Інформація про приватність
plugins-openh264-name = Відеокодек OpenH264 наданий Cisco Systems, Inc.
plugins-openh264-description = Цей плагін автоматично встановлений Mozilla для взаємодії зі специфікацією WebRTC та увімкнення викликів WebRTC з пристроями, які потребують відеокодек H.264. Відвідайте http://www.openh264.org/ для перегляду програмного коду кодека та докладної інформації про його застосування.
plugins-widevine-name = Модуль розшифрування вмісту Widevine наданий Google Inc.
plugins-widevine-description = Цей плагін активує відтворення зашифрованого медіа у відповідності до специфікації Encrypted Media Extensions (EME). Зашифровані медіа зазвичай використовуються сайтами для захисту від копіювання преміум медіа-вмісту. Відвідайте https://www.w3.org/TR/encrypted-media/ для отримання докладної інформації про Encrypted Media Extensions (EME).
