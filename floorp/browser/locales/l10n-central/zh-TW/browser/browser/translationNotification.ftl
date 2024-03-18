# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## These 2 strings are used to construct a sentence that contains a dropdown
## showing the detected language of the current web page.
## In en-US it looks like this:
##   This page is in [detected language] Translate this page?
## "detected language" here is a language name coming from the
## toolkit/intl/languageNames.ftl file; for some locales it may not be in
## the correct grammar case to keep the same structure of the original
## sentence.

translation-notification-this-page-is-in =
    .value = 此頁面的語言為
translation-notification-translate-this-page =
    .value = 要翻譯此頁面嗎？

##

translation-notification-translate-button =
    .label = 翻譯
translation-notification-not-now-button =
    .label = 現在不要
translation-notification-translating-content =
    .value = 正在翻譯頁面內容…

## These 3 strings are used to construct a sentence that contains 2 dropdowns
## showing the source and target language of a translated web page.
## In en-US it looks like this:
##   This page has been translated from [from language] to [to language]
## "from language" and "to language" here are language names coming from the
## toolkit/intl/languageNames.ftl file; for some locales they may not be in
## the correct grammar case to keep the same structure of the original
## sentence.

translation-notification-translated-from =
    .value = 將此頁面自
translation-notification-translated-to =
    .value = 翻譯為
# This string (empty in en-US) is for locales that need to display some text
# after the second drop down for the sentence to be grammatically correct.
translation-notification-translated-to-suffix =
    .value = { "" }

##

translation-notification-show-original-button =
    .label = 顯示原始內容
translation-notification-show-translation-button =
    .label = 顯示翻譯結果
translation-notification-error-translating =
    .value = 翻譯此頁面時發生錯誤。
translation-notification-try-again-button =
    .label = 重試
translation-notification-service-unavailable =
    .value = 目前無法翻譯，請稍後再試。
translation-notification-options-menu =
    .label = 選項

## The accesskey values used here should not clash with each other

# Variables:
#  $langName (String): a language name coming from the toolkit/intl/languageNames.ftl file.
translation-notification-options-never-for-language =
    .label = 永不翻譯{ $langName }網頁
    .accesskey = N
translation-notification-options-never-for-site =
    .label = 永不翻譯此網站
    .accesskey = e
translation-notification-options-preferences =
    .label = 翻譯偏好設定
    .accesskey = T
