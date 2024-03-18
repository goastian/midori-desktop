# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

mztabrow-open-menu-button =
    .title = メニューを開きます
# Variables:
#   $date (string) - Date to be formatted based on locale
mztabrow-date = { DATETIME($date, dateStyle: "short") }
# Variables:
#   $time (string) - Time to be formatted based on locale
mztabrow-time = { DATETIME($time, timeStyle: "short") }
# Variables:
#   $targetURI (string) - URL of tab that will be opened in the new tab
mztabrow-tabs-list-tab =
    .title = { $targetURI } を新しいタブで開きます
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
mztabrow-dismiss-tab-button =
    .title = { $tabTitle } を閉じます
# Used instead of the localized relative time when a timestamp is within a minute or so of now
mztabrow-just-now-timestamp = 直前
# Strings below are used for context menu options within panel-list.
# For developers, this duplicates command because the label attribute is required.
mztabrow-delete = 削除
    .accesskey = D
mztabrow-forget-about-this-site = このサイトの履歴を消去...
    .accesskey = F
mztabrow-open-in-window = 新しいウィンドウで開く
    .accesskey = N
mztabrow-open-in-private-window = 新しいプライベートウィンドウで開く
    .accesskey = P
# “Bookmark” is a verb, as in "Bookmark this page" (add to bookmarks).
mztabrow-add-bookmark = ブックマークに追加...
    .accesskey = B
mztabrow-save-to-pocket = { -pocket-brand-name } に保存
    .accesskey = o
mztabrow-copy-link = リンクをコピー
    .accesskey = L
