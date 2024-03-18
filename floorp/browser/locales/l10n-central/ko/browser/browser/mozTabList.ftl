# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

mztabrow-open-menu-button =
    .title = 메뉴 열기
# Variables:
#   $date (string) - Date to be formatted based on locale
mztabrow-date = { DATETIME($date, dateStyle: "short") }
# Variables:
#   $time (string) - Time to be formatted based on locale
mztabrow-time = { DATETIME($time, timeStyle: "short") }
# Variables:
#   $targetURI (string) - URL of tab that will be opened in the new tab
mztabrow-tabs-list-tab =
    .title = 새 탭에서 { $targetURI } 열기
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
mztabrow-dismiss-tab-button =
    .title = { $tabTitle } 닫기
# Used instead of the localized relative time when a timestamp is within a minute or so of now
mztabrow-just-now-timestamp = 방금 전

# Strings below are used for context menu options within panel-list.
# For developers, this duplicates command because the label attribute is required.

mztabrow-delete = 삭제
    .accesskey = D
mztabrow-forget-about-this-site = 이 사이트 기록 삭제…
    .accesskey = F
mztabrow-open-in-window = 새 창에서 열기
    .accesskey = N
mztabrow-open-in-private-window = 새 사생활 보호 창에서 열기
    .accesskey = P
mztabrow-add-bookmark = 북마크…
    .accesskey = B
mztabrow-save-to-pocket = { -pocket-brand-name }에 저장
    .accesskey = o
mztabrow-copy-link = 링크 복사
    .accesskey = L
