# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Strings used in about:unloads, allowing users to manage the "tab unloading"
### feature.

about-unloads-page-title = Вивантаження вкладки
about-unloads-intro =
    { -brand-short-name } може автоматично вивантажувати з пам'яті вкладки,
    щоб запобігти збою програми через брак системної пам'яті, коли це необхідно.
    Вкладка для вивантаження обирається на основі багатьох властивостей.
    Ця сторінка показує, як { -brand-short-name } пріоритизує вкладки та яку вкладку
    буде вивантажено під час спрацювання цієї функції. Ви можете активувати
    вивантаження вкладки вручну натиснувши кнопку <em>Вивантажити</em> внизу.

# The link points to a Firefox documentation page, only available in English,
# with title "Tab Unloading"
about-unloads-learn-more =
    Докладніше про функцію <a data-l10n-name="doc-link">Вивантаження вкладок</a>
    і цю сторінку.

about-unloads-last-updated = Востаннє оновлено: { DATETIME($date, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hour12: "false") }
about-unloads-button-unload = Вивантажити
    .title = Вивантажити вкладку з найвищим пріоритетом
about-unloads-no-unloadable-tab = Немає вкладок для вивантаження.

about-unloads-column-priority = Пріоритет
about-unloads-column-host = Хост
about-unloads-column-last-accessed = Останній доступ
about-unloads-column-weight = Навантаженіші
    .title = Вкладки спершу впорядковуються за цим значенням, яке походить від певних спеціальних властивостей, наприклад, відтворення звуку, WebRTC тощо.
about-unloads-column-sortweight = Менш навантажені
    .title = Якщо доступно, вкладки впорядковуються за цим значенням після впорядкування за навантаженістю. Значення походить від використання пам'яті та кількості процесів.
about-unloads-column-memory = Пам'ять
    .title = Розраховане споживання пам'яті вкладкою
about-unloads-column-processes = Ідентифікатори процесів
    .title = Ідентифікатори процесів вмісту розміщеної вкладки

about-unloads-last-accessed = { DATETIME($date, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hour12: "false") }
about-unloads-memory-in-mb = { NUMBER($mem, maxFractionalUnits: 2) } МБ
about-unloads-memory-in-mb-tooltip =
    .title = { NUMBER($mem, maxFractionalUnits: 2) } МБ
