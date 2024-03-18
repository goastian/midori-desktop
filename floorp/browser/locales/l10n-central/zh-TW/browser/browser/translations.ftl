# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# The button for "Midori Translations" in the url bar.
urlbar-translations-button =
    .tooltiptext = 翻譯此頁面
translations-panel-settings-button =
    .aria-label = 管理翻譯設定
# Text displayed on a language dropdown when the language is in beta
# Variables:
#   $language (string) - The localized display name of the detected language
translations-panel-displayname-beta =
    .label = { $language } BETA

## Options in the Midori Translations settings.

translations-panel-settings-manage-languages =
    .label = 管理語言
translations-panel-settings-about = 關於 { -brand-shorter-name } 的翻譯功能
# Text displayed for the option to always translate a given language
# Variables:
#   $language (string) - The localized display name of the detected language
translations-panel-settings-always-translate-language =
    .label = 總是翻譯 { $language }
translations-panel-settings-always-translate-unknown-language =
    .label = 總是翻譯此語言
# Text displayed for the option to never translate a given language
# Variables:
#   $language (string) - The localized display name of the detected language
translations-panel-settings-never-translate-language =
    .label = 永不翻譯 { $language }
translations-panel-settings-never-translate-unknown-language =
    .label = 永不翻譯此語言
# Text displayed for the option to never translate this website
translations-panel-settings-never-translate-site =
    .label = 永不翻譯此網站

## The translation panel appears from the url bar, and this view is the default
## translation view.

translations-panel-header = 要翻譯此頁面嗎？
translations-panel-translate-button =
    .label = 翻譯
translations-panel-translate-button-loading =
    .label = 請稍候…
translations-panel-translate-cancel =
    .label = 取消
translations-panel-error-translating = 翻譯時發生問題，請再試一次。
translations-panel-error-load-languages = 無法載入語言清單
translations-panel-error-load-languages-hint = 請確認網路連線正常後再試一次。
translations-panel-error-load-languages-hint-button =
    .label = 重試
translations-panel-error-unsupported = 無法翻譯此頁面
translations-panel-error-dismiss-button =
    .label = 知道了！
translations-panel-error-change-button =
    .label = 更改原始語言
# If your language requires declining the language name, a possible solution
# is to adapt the structure of the phrase, or use a support noun, e.g.
# `Sorry, we don't support the language yet: { $language }
#
# Variables:
#   $language (string) - The language of the document.
translations-panel-error-unsupported-hint-known = 抱歉，我們尚未支援 { $language }。
translations-panel-error-unsupported-hint-unknown = 抱歉，我們尚未支援此語言。

## Each label is followed, on a new line, by a dropdown list of language names.
## If this structure is problematic for your locale, an alternative way is to
## translate them as `Source language:` and `Target language:`

translations-panel-from-label = 原始語言：
translations-panel-to-label = 翻譯語言：

## The translation panel appears from the url bar, and this view is the "restore" view
## that lets a user restore a page to the original language, or translate into another
## language.

# If your language requires declining the language name, a possible solution
# is to adapt the structure of the phrase, or use a support noun, e.g.
# `The page is translated from: { $fromLanguage }. Current target language: { $toLanguage }`
#
# Variables:
#   $fromLanguage (string) - The original language of the document.
#   $toLanguage (string) - The target language of the translation.
translations-panel-revisit-header = 已將此頁面從 { $fromLanguage } 翻譯為 { $toLanguage }
translations-panel-choose-language =
    .label = 選擇一種語言
translations-panel-restore-button =
    .label = 顯示原始內容

## Midori Translations language management in about:preferences.

translations-manage-header = 翻譯
translations-manage-settings-button =
    .label = 設定…
    .accesskey = t
translations-manage-description = 下載語言檔案，進行離線翻譯。
translations-manage-all-language = 所有語言
translations-manage-download-button = 下載
translations-manage-delete-button = 刪除
translations-manage-language-download-button =
    .label = 下載
    .accesskey = D
translations-manage-language-delete-button =
    .label = 刪除
    .accesskey = e
translations-manage-error-download = 下載語言檔案時發生問題，請再試一次。
translations-manage-error-delete = 刪除語言檔案時發生錯誤，請再試一次。
translations-manage-error-list = 取得可下載語言清單時發生錯誤，請重新整理頁面後再試一次。
translations-settings-title =
    .title = 翻譯設定
    .style = min-width: 36em
translations-settings-close-key =
    .key = w
translations-settings-always-translate-langs-description = 自動翻譯下列語言頁面
translations-settings-never-translate-langs-description = 不對下列語言提供翻譯
translations-settings-never-translate-sites-description = 不對下列網站進行翻譯
translations-settings-languages-column =
    .label = 語言
translations-settings-remove-language-button =
    .label = 移除語言
    .accesskey = R
translations-settings-remove-all-languages-button =
    .label = 移除所有語言
    .accesskey = e
translations-settings-sites-column =
    .label = 網站
translations-settings-remove-site-button =
    .label = 移除網站
    .accesskey = S
translations-settings-remove-all-sites-button =
    .label = 移除全部網站
    .accesskey = m
translations-settings-close-dialog =
    .buttonlabelaccept = 關閉
    .buttonaccesskeyaccept = C
