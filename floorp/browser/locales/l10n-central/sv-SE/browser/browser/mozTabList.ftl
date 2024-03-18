# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

mztabrow-open-menu-button =
    .title = Öppna meny
# Variables:
#   $date (string) - Date to be formatted based on locale
mztabrow-date = { DATETIME($date, dateStyle: "short") }
# Variables:
#   $time (string) - Time to be formatted based on locale
mztabrow-time = { DATETIME($time, timeStyle: "short") }
# Variables:
#   $targetURI (string) - URL of tab that will be opened in the new tab
mztabrow-tabs-list-tab =
    .title = Öppna { $targetURI } i en ny flik
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
mztabrow-dismiss-tab-button =
    .title = Ignorera { $tabTitle }
# Used instead of the localized relative time when a timestamp is within a minute or so of now
mztabrow-just-now-timestamp = Nyss

# Strings below are used for context menu options within panel-list.
# For developers, this duplicates command because the label attribute is required.

mztabrow-delete = Ta bort
    .accesskey = T
mztabrow-forget-about-this-site = Glöm den här sidan…
    .accesskey = G
mztabrow-open-in-window = Öppna i nytt fönster
    .accesskey = n
mztabrow-open-in-private-window = Öppna i nytt privat fönster
    .accesskey = p
mztabrow-add-bookmark = Bokmärk…
    .accesskey = B
mztabrow-save-to-pocket = Spara till { -pocket-brand-name }
    .accesskey = r
mztabrow-copy-link = Kopiera länk
    .accesskey = K
