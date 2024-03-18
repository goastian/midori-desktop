# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

mztabrow-open-menu-button =
    .title = Otevřít nabídku
# Variables:
#   $date (string) - Date to be formatted based on locale
mztabrow-date = { DATETIME($date, dateStyle: "short") }
# Variables:
#   $time (string) - Time to be formatted based on locale
mztabrow-time = { DATETIME($time, timeStyle: "short") }
# Variables:
#   $targetURI (string) - URL of tab that will be opened in the new tab
mztabrow-tabs-list-tab =
    .title = Otevřít { $targetURI } v novém panelu
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
mztabrow-dismiss-tab-button =
    .title = Zavřít { $tabTitle }
# Used instead of the localized relative time when a timestamp is within a minute or so of now
mztabrow-just-now-timestamp = Právě teď

# Strings below are used for context menu options within panel-list.
# For developers, this duplicates command because the label attribute is required.

mztabrow-delete = Smazat
    .accesskey = S
mztabrow-forget-about-this-site = Odebrat celý web…
    .accesskey = O
mztabrow-open-in-window = Otevřít v novém okně
    .accesskey = O
mztabrow-open-in-private-window = Otevřít v novém anonymním okně
    .accesskey = O
mztabrow-add-bookmark = Přidat do záložek…
    .accesskey = P
mztabrow-save-to-pocket = Uložit do { -pocket-brand-name(case: "gen") }
    .accesskey = o
mztabrow-copy-link = Kopírovat odkaz
    .accesskey = K
