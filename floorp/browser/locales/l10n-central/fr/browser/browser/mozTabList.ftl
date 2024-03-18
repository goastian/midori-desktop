# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

mztabrow-open-menu-button =
    .title = Ouvrir le menu
# Variables:
#   $date (string) - Date to be formatted based on locale
mztabrow-date = { DATETIME($date, dateStyle: "short") }
# Variables:
#   $time (string) - Time to be formatted based on locale
mztabrow-time = { DATETIME($time, timeStyle: "short") }
# Variables:
#   $targetURI (string) - URL of tab that will be opened in the new tab
mztabrow-tabs-list-tab =
    .title = Ouvrir { $targetURI } dans un nouvel onglet
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
mztabrow-dismiss-tab-button =
    .title = Fermer { $tabTitle }
# Used instead of the localized relative time when a timestamp is within a minute or so of now
mztabrow-just-now-timestamp = À l’instant

# Strings below are used for context menu options within panel-list.
# For developers, this duplicates command because the label attribute is required.

mztabrow-delete = Supprimer
    .accesskey = S
mztabrow-forget-about-this-site = Oublier ce site…
    .accesskey = O
mztabrow-open-in-window = Ouvrir dans une nouvelle fenêtre
    .accesskey = f
mztabrow-open-in-private-window = Ouvrir dans une nouvelle fenêtre privée
    .accesskey = p
mztabrow-add-bookmark = Marquer cette page…
    .accesskey = M
mztabrow-save-to-pocket = Enregistrer dans { -pocket-brand-name }
    .accesskey = E
mztabrow-copy-link = Copier le lien
    .accesskey = C
