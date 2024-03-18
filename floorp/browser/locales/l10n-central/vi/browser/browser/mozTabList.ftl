# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

mztabrow-open-menu-button =
    .title = Mở menu
# Variables:
#   $date (string) - Date to be formatted based on locale
mztabrow-date = { DATETIME($date, dateStyle: "short") }
# Variables:
#   $time (string) - Time to be formatted based on locale
mztabrow-time = { DATETIME($time, timeStyle: "short") }
# Variables:
#   $targetURI (string) - URL of tab that will be opened in the new tab
mztabrow-tabs-list-tab =
    .title = Mở { $targetURI } trong một thẻ mới
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
mztabrow-dismiss-tab-button =
    .title = Bỏ qua { $tabTitle }
# Used instead of the localized relative time when a timestamp is within a minute or so of now
mztabrow-just-now-timestamp = Vừa xong

# Strings below are used for context menu options within panel-list.
# For developers, this duplicates command because the label attribute is required.

mztabrow-delete = Xóa
    .accesskey = D
mztabrow-forget-about-this-site = Quên trang này…
    .accesskey = F
mztabrow-open-in-window = Mở trong cửa sổ mới
    .accesskey = N
mztabrow-open-in-private-window = Mở trong cửa sổ riêng tư mới
    .accesskey = P
mztabrow-add-bookmark = Đánh dấu…
    .accesskey = B
mztabrow-save-to-pocket = Lưu vào { -pocket-brand-name }
    .accesskey = o
mztabrow-copy-link = Sao chép liên kết
    .accesskey = L
