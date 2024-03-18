# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

mztabrow-open-menu-button =
    .title = Άνοιγμα μενού
# Variables:
#   $date (string) - Date to be formatted based on locale
mztabrow-date = { DATETIME($date, dateStyle: "short") }
# Variables:
#   $time (string) - Time to be formatted based on locale
mztabrow-time = { DATETIME($time, timeStyle: "short") }
# Variables:
#   $targetURI (string) - URL of tab that will be opened in the new tab
mztabrow-tabs-list-tab =
    .title = Άνοιγμα { $targetURI } σε νέα καρτέλα
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
mztabrow-dismiss-tab-button =
    .title = Απόρριψη «{ $tabTitle }»
# Used instead of the localized relative time when a timestamp is within a minute or so of now
mztabrow-just-now-timestamp = Μόλις τώρα

# Strings below are used for context menu options within panel-list.
# For developers, this duplicates command because the label attribute is required.

mztabrow-delete = Διαγραφή
    .accesskey = Δ
mztabrow-forget-about-this-site = Διαγραφή δεδομένων ιστοτόπου…
    .accesskey = Δ
mztabrow-open-in-window = Άνοιγμα σε νέο παράθυρο
    .accesskey = γ
mztabrow-open-in-private-window = Άνοιγμα σε νέο ιδιωτικό παράθυρο
    .accesskey = ι
mztabrow-add-bookmark = Σελιδοδείκτης…
    .accesskey = Σ
mztabrow-save-to-pocket = Αποθήκευση στο { -pocket-brand-name }
    .accesskey = ο
mztabrow-copy-link = Αντιγραφή συνδέσμου
    .accesskey = σ
