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
    .value = 此页面使用
translation-notification-translate-this-page =
    .value = 翻译此页面？

##

translation-notification-translate-button =
    .label = 翻译
translation-notification-not-now-button =
    .label = 暂不
translation-notification-translating-content =
    .value = 正在翻译页面内容…

## These 3 strings are used to construct a sentence that contains 2 dropdowns
## showing the source and target language of a translated web page.
## In en-US it looks like this:
##   This page has been translated from [from language] to [to language]
## "from language" and "to language" here are language names coming from the
## toolkit/intl/languageNames.ftl file; for some locales they may not be in
## the correct grammar case to keep the same structure of the original
## sentence.

translation-notification-translated-from =
    .value = 此页面已被翻译，从
translation-notification-translated-to =
    .value = 译至
# This string (empty in en-US) is for locales that need to display some text
# after the second drop down for the sentence to be grammatically correct.
translation-notification-translated-to-suffix =
    .value = { "" }

##

translation-notification-show-original-button =
    .label = 显示原文
translation-notification-show-translation-button =
    .label = 显示翻译
translation-notification-error-translating =
    .value = 翻译此页面时出错。
translation-notification-try-again-button =
    .label = 重试
translation-notification-service-unavailable =
    .value = 暂时无法翻译。请稍后再试。
translation-notification-options-menu =
    .label = 选项

## The accesskey values used here should not clash with each other

# Variables:
#  $langName (String): a language name coming from the toolkit/intl/languageNames.ftl file.
translation-notification-options-never-for-language =
    .label = 不翻译 { $langName }
    .accesskey = N
translation-notification-options-never-for-site =
    .label = 不翻译此网站
    .accesskey = e
translation-notification-options-preferences =
    .label = 翻译首选项
    .accesskey = T
