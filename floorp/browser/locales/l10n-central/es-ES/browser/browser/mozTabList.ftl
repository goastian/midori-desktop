# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

mztabrow-open-menu-button =
    .title = Abrir menú
# Variables:
#   $date (string) - Date to be formatted based on locale
mztabrow-date = { DATETIME($date, dateStyle: "short") }
# Variables:
#   $time (string) - Time to be formatted based on locale
mztabrow-time = { DATETIME($time, timeStyle: "short") }
# Variables:
#   $targetURI (string) - URL of tab that will be opened in the new tab
mztabrow-tabs-list-tab =
    .title = Abrir { $targetURI } en una nueva pestaña
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
mztabrow-dismiss-tab-button =
    .title = Descartar { $tabTitle }
# Used instead of the localized relative time when a timestamp is within a minute or so of now
mztabrow-just-now-timestamp = Ahora mismo

# Strings below are used for context menu options within panel-list.
# For developers, this duplicates command because the label attribute is required.

mztabrow-delete = Eliminar
    .accesskey = E
mztabrow-forget-about-this-site = Olvidar este sitio web…
    .accesskey = O
mztabrow-open-in-window = Abrir en una nueva ventana
    .accesskey = A
mztabrow-open-in-private-window = Abrir en una nueva ventana privada
    .accesskey = p
# “Bookmark” is a verb, as in "Bookmark this page" (add to bookmarks).
mztabrow-add-bookmark = Añadir marcador…
    .accesskey = m
mztabrow-save-to-pocket = Guardar en { -pocket-brand-name }
    .accesskey = G
mztabrow-copy-link = Copiar enlace
    .accesskey = l
