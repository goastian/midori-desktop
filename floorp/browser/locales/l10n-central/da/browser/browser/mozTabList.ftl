# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

mztabrow-open-menu-button =
    .title = Åbn menu
# Variables:
#   $date (string) - Date to be formatted based on locale
mztabrow-date = { DATETIME($date, dateStyle: "short") }
# Variables:
#   $time (string) - Time to be formatted based on locale
mztabrow-time = { DATETIME($time, timeStyle: "short") }
# Variables:
#   $targetURI (string) - URL of tab that will be opened in the new tab
mztabrow-tabs-list-tab =
    .title = Åbn { $targetURI } i et nyt faneblad
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
mztabrow-dismiss-tab-button =
    .title = Afvis { $tabTitle }
# Used instead of the localized relative time when a timestamp is within a minute or so of now
mztabrow-just-now-timestamp = Nu

# Strings below are used for context menu options within panel-list.
# For developers, this duplicates command because the label attribute is required.

mztabrow-delete = Slet
    .accesskey = S
mztabrow-forget-about-this-site = Glem dette websted…
    .accesskey = G
mztabrow-open-in-window = Åbn i nyt vindue
    .accesskey = n
mztabrow-open-in-private-window = Åbn i et nyt privat vindue
    .accesskey = p
mztabrow-add-bookmark = Gem bogmærke…
    .accesskey = b
mztabrow-save-to-pocket = Gem til { -pocket-brand-name }
    .accesskey = e
mztabrow-copy-link = Kopier link
    .accesskey = k
