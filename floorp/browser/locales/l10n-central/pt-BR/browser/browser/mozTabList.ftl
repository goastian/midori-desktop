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
    .title = Abrir { $targetURI } em nova aba
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
mztabrow-dismiss-tab-button =
    .title = Descartar { $tabTitle }
# Used instead of the localized relative time when a timestamp is within a minute or so of now
mztabrow-just-now-timestamp = há pouco

# Strings below are used for context menu options within panel-list.
# For developers, this duplicates command because the label attribute is required.

mztabrow-delete = Excluir
    .accesskey = x
mztabrow-forget-about-this-site = Esquecer este site…
    .accesskey = E
mztabrow-open-in-window = Abrir em nova janela
    .accesskey = n
mztabrow-open-in-private-window = Abrir em nova janela privativa
    .accesskey = p
mztabrow-add-bookmark = Adicionar aos favoritos…
    .accesskey = A
mztabrow-save-to-pocket = Salvar no { -pocket-brand-name }
    .accesskey = o
mztabrow-copy-link = Copiar link
    .accesskey = l
