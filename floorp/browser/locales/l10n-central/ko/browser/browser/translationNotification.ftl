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
    .value = { "" }
translation-notification-translate-this-page =
    .value = 로 된 페이지를 번역해서 보시겠습니까?

##

translation-notification-translate-button =
    .label = 번역 돌리기
translation-notification-not-now-button =
    .label = 나중에
translation-notification-translating-content =
    .value = 페이지 내용을 번역하고 있습니다…

## These 3 strings are used to construct a sentence that contains 2 dropdowns
## showing the source and target language of a translated web page.
## In en-US it looks like this:
##   This page has been translated from [from language] to [to language]
## "from language" and "to language" here are language names coming from the
## toolkit/intl/languageNames.ftl file; for some locales they may not be in
## the correct grammar case to keep the same structure of the original
## sentence.

translation-notification-translated-from =
    .value = 이 페이지의
translation-notification-translated-to =
    .value = 는
# This string (empty in en-US) is for locales that need to display some text
# after the second drop down for the sentence to be grammatically correct.
translation-notification-translated-to-suffix =
    .value = 로 번역되었습니다.

##

translation-notification-show-original-button =
    .label = 원본 보기
translation-notification-show-translation-button =
    .label = 번역본 보기
translation-notification-error-translating =
    .value = 번역을 돌리다 오류가 발생했습니다.
translation-notification-try-again-button =
    .label = 다시 시도
translation-notification-service-unavailable =
    .value = 지금은 번역을 사용할 수 없습니다. 나중에 다시 시도하세요.
translation-notification-options-menu =
    .label = 옵션

## The accesskey values used here should not clash with each other

# Variables:
#  $langName (String): a language name coming from the toolkit/intl/languageNames.ftl file.
translation-notification-options-never-for-language =
    .label = { $langName }는 항상 번역하지 않음
    .accesskey = N
translation-notification-options-never-for-site =
    .label = 이 사이트는 항상 번역하지 않기
    .accesskey = e
translation-notification-options-preferences =
    .label = 번역 환경 설정
    .accesskey = T
