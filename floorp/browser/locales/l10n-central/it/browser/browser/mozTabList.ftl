# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

mztabrow-open-menu-button =
    .title = Apri menu
# Variables:
#   $date (string) - Date to be formatted based on locale
mztabrow-date = { DATETIME($date, dateStyle: "short") }
# Variables:
#   $time (string) - Time to be formatted based on locale
mztabrow-time = { DATETIME($time, timeStyle: "short") }
# Variables:
#   $targetURI (string) - URL of tab that will be opened in the new tab
mztabrow-tabs-list-tab =
    .title = Apri { $targetURI } in una nuova scheda
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
mztabrow-dismiss-tab-button =
    .title = Rimuovi { $tabTitle }
# Used instead of the localized relative time when a timestamp is within a minute or so of now
mztabrow-just-now-timestamp = adesso

# Strings below are used for context menu options within panel-list.
# For developers, this duplicates command because the label attribute is required.

mztabrow-delete = Elimina
    .accesskey = E
mztabrow-forget-about-this-site = Dimentica questo sito…
    .accesskey = D
mztabrow-open-in-window = Apri in nuova finestra
    .accesskey = A
mztabrow-open-in-private-window = Apri in nuova finestra anonima
    .accesskey = n
mztabrow-add-bookmark = Aggiungi ai segnalibri
    .accesskey = s
mztabrow-save-to-pocket = Salva in { -pocket-brand-name }
    .accesskey = P
mztabrow-copy-link = Copia link
    .accesskey = k
