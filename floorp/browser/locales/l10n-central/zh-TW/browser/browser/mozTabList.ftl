# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

mztabrow-open-menu-button =
    .title = 開啟選單
# Variables:
#   $date (string) - Date to be formatted based on locale
mztabrow-date = { DATETIME($date, dateStyle: "short") }
# Variables:
#   $time (string) - Time to be formatted based on locale
mztabrow-time = { DATETIME($time, timeStyle: "short") }
# Variables:
#   $targetURI (string) - URL of tab that will be opened in the new tab
mztabrow-tabs-list-tab =
    .title = 用新分頁開啟 { $targetURI }
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
mztabrow-dismiss-tab-button =
    .title = 關閉 { $tabTitle }
# Used instead of the localized relative time when a timestamp is within a minute or so of now
mztabrow-just-now-timestamp = 剛剛

# Strings below are used for context menu options within panel-list.
# For developers, this duplicates command because the label attribute is required.

mztabrow-delete = 刪除
    .accesskey = D
mztabrow-forget-about-this-site = 忘記此網站…
    .accesskey = F
mztabrow-open-in-window = 用新視窗開啟
    .accesskey = N
mztabrow-open-in-private-window = 用新隱私視窗開啟
    .accesskey = P
mztabrow-add-bookmark = 加入書籤…
    .accesskey = B
mztabrow-save-to-pocket = 儲存至 { -pocket-brand-name }
    .accesskey = o
mztabrow-copy-link = 複製鏈結
    .accesskey = L
