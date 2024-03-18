# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

fxviewtabrow-open-menu-button =
    .title = Відкрити меню
# Variables:
#   $date (string) - Date to be formatted based on locale
fxviewtabrow-date = { DATETIME($date, dateStyle: "short") }
# Variables:
#   $time (string) - Time to be formatted based on locale
fxviewtabrow-time = { DATETIME($time, timeStyle: "short") }
# Variables:
#   $targetURI (string) - URL of tab that will be opened in the new tab
fxviewtabrow-tabs-list-tab =
    .title = Відкрити { $targetURI } у новій вкладці
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
fxviewtabrow-dismiss-tab-button =
    .title = Відхилити { $tabTitle }
# Used instead of the localized relative time when a timestamp is within a minute or so of now
fxviewtabrow-just-now-timestamp = Щойно

# Strings below are used for context menu options within panel-list.
# For developers, this duplicates command because the label attribute is required.

fxviewtabrow-delete = Видалити
    .accesskey = В
fxviewtabrow-forget-about-this-site = Забути про цей сайт…
    .accesskey = З
fxviewtabrow-open-in-window = Відкрити в новому вікні
    .accesskey = н
fxviewtabrow-open-in-private-window = Відкрити в приватному вікні
    .accesskey = п
# “Bookmark” is a verb, as in "Bookmark this page" (add to bookmarks).
fxviewtabrow-add-bookmark = Додати закладку…
    .accesskey = к
fxviewtabrow-save-to-pocket = Зберегти в { -pocket-brand-name }
    .accesskey = и
fxviewtabrow-copy-link = Копіювати посилання
    .accesskey = с
fxviewtabrow-close-tab = Закрити вкладку
    .accesskey = З
fxviewtabrow-move-tab = Перемістити вкладку
    .accesskey = м
fxviewtabrow-move-tab-start = Перемістити на початок
    .accesskey = ч
fxviewtabrow-move-tab-end = Перемістити в кінець
    .accesskey = т
fxviewtabrow-move-tab-window = Перенести в нове вікно
    .accesskey = н
fxviewtabrow-send-tab = Надіслати вкладку на пристрій
    .accesskey = с
# Variables:
#   $tabTitle (string) - Title of the tab to which the context menu is associated
fxviewtabrow-options-menu-button =
    .title = Параметри для { $tabTitle }
