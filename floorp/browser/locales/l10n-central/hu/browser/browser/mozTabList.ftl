# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

mztabrow-open-menu-button =
    .title = Menü megnyitása
# Variables:
#   $date (string) - Date to be formatted based on locale
mztabrow-date = { DATETIME($date, dateStyle: "short") }
# Variables:
#   $time (string) - Time to be formatted based on locale
mztabrow-time = { DATETIME($time, timeStyle: "short") }
# Variables:
#   $targetURI (string) - URL of tab that will be opened in the new tab
mztabrow-tabs-list-tab =
    .title = A(z) { $targetURI } megnyitása új lapon
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
mztabrow-dismiss-tab-button =
    .title = A(z) { $tabTitle } eltüntetése
# Used instead of the localized relative time when a timestamp is within a minute or so of now
mztabrow-just-now-timestamp = Épp most

# Strings below are used for context menu options within panel-list.
# For developers, this duplicates command because the label attribute is required.

mztabrow-delete = Törlés
    .accesskey = T
mztabrow-forget-about-this-site = Webhely elfelejtése…
    .accesskey = f
mztabrow-open-in-window = Megnyitás új ablakban
    .accesskey = j
mztabrow-open-in-private-window = Megnyitás új privát ablakban
    .accesskey = p
mztabrow-add-bookmark = Könyvjelzőzés…
    .accesskey = K
mztabrow-save-to-pocket = Mentés a { -pocket-brand-name }be
    .accesskey = M
mztabrow-copy-link = Hivatkozás másolása
    .accesskey = H
