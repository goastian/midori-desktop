# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

mztabrow-open-menu-button =
    .title = Открыть меню
# Variables:
#   $date (string) - Date to be formatted based on locale
mztabrow-date = { DATETIME($date, dateStyle: "short") }
# Variables:
#   $time (string) - Time to be formatted based on locale
mztabrow-time = { DATETIME($time, timeStyle: "short") }
# Variables:
#   $targetURI (string) - URL of tab that will be opened in the new tab
mztabrow-tabs-list-tab =
    .title = Открыть { $targetURI } в новой вкладке
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
mztabrow-dismiss-tab-button =
    .title = Убрать { $tabTitle }
# Used instead of the localized relative time when a timestamp is within a minute or so of now
mztabrow-just-now-timestamp = Прямо сейчас

# Strings below are used for context menu options within panel-list.
# For developers, this duplicates command because the label attribute is required.

mztabrow-delete = Удалить
    .accesskey = л
mztabrow-forget-about-this-site = Забыть об этом сайте…
    .accesskey = ы
mztabrow-open-in-window = Открыть в новом окне
    .accesskey = к
mztabrow-open-in-private-window = Открыть в новом приватном окне
    .accesskey = п
mztabrow-add-bookmark = В закладки…
    .accesskey = з
mztabrow-save-to-pocket = Сохранить в { -pocket-brand-name }
    .accesskey = х
mztabrow-copy-link = Копировать ссылку
    .accesskey = с
