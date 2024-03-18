# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

mztabrow-open-menu-button =
    .title = 打开菜单
# Variables:
#   $date (string) - Date to be formatted based on locale
mztabrow-date = { DATETIME($date, dateStyle: "short") }
# Variables:
#   $time (string) - Time to be formatted based on locale
mztabrow-time = { DATETIME($time, timeStyle: "short") }
# Variables:
#   $targetURI (string) - URL of tab that will be opened in the new tab
mztabrow-tabs-list-tab =
    .title = 新建标签页打开 { $targetURI }
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
mztabrow-dismiss-tab-button =
    .title = 关闭 { $tabTitle }
# Used instead of the localized relative time when a timestamp is within a minute or so of now
mztabrow-just-now-timestamp = 刚刚

# Strings below are used for context menu options within panel-list.
# For developers, this duplicates command because the label attribute is required.

mztabrow-delete = 删除
    .accesskey = D
mztabrow-forget-about-this-site = 忘记此网站…
    .accesskey = F
mztabrow-open-in-window = 新建窗口打开
    .accesskey = N
mztabrow-open-in-private-window = 新建隐私窗口打开
    .accesskey = P
mztabrow-add-bookmark = 加入书签…
    .accesskey = B
mztabrow-save-to-pocket = 保存到 { -pocket-brand-name }
    .accesskey = o
mztabrow-copy-link = 复制链接
    .accesskey = L
