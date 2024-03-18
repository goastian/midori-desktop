# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

mztabrow-open-menu-button =
    .title = Abrir menu
# Variables:
#   $date (string) - Date to be formatted based on locale
mztabrow-date = { DATETIME($date, dateStyle: "short") }
# Variables:
#   $time (string) - Time to be formatted based on locale
mztabrow-time = { DATETIME($time, timeStyle: "short") }
# Variables:
#   $targetURI (string) - URL of tab that will be opened in the new tab
mztabrow-tabs-list-tab =
    .title = Abrir { $targetURI } num novo separador
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
mztabrow-dismiss-tab-button =
    .title = Ignorar { $tabTitle }
# Used instead of the localized relative time when a timestamp is within a minute or so of now
mztabrow-just-now-timestamp = Agora mesmo

# Strings below are used for context menu options within panel-list.
# For developers, this duplicates command because the label attribute is required.

mztabrow-delete = Eliminar
    .accesskey = E
mztabrow-forget-about-this-site = Esquecer este site…
    .accesskey = q
mztabrow-open-in-window = Abrir numa nova janela
    .accesskey = n
mztabrow-open-in-private-window = Abrir numa nova janela privada
    .accesskey = p
# “Bookmark” is a verb, as in "Bookmark this page" (add to bookmarks).
mztabrow-add-bookmark = Adicionar aos marcadores…
    .accesskey = m
mztabrow-save-to-pocket = Guardar no { -pocket-brand-name }
    .accesskey = u
mztabrow-copy-link = Copiar ligação
    .accesskey = l
