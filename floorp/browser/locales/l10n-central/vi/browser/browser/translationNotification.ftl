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
    .value = Trang này sử dụng tiếng
translation-notification-translate-this-page =
    .value = Dịch trang này?

##

translation-notification-translate-button =
    .label = Dịch
translation-notification-not-now-button =
    .label = Không phải bây giờ
translation-notification-translating-content =
    .value = Đang dịch nội dung trang…

## These 3 strings are used to construct a sentence that contains 2 dropdowns
## showing the source and target language of a translated web page.
## In en-US it looks like this:
##   This page has been translated from [from language] to [to language]
## "from language" and "to language" here are language names coming from the
## toolkit/intl/languageNames.ftl file; for some locales they may not be in
## the correct grammar case to keep the same structure of the original
## sentence.

translation-notification-translated-from =
    .value = Trang này đã được dịch từ tiếng
translation-notification-translated-to =
    .value = sang tiếng
# This string (empty in en-US) is for locales that need to display some text
# after the second drop down for the sentence to be grammatically correct.
translation-notification-translated-to-suffix =
    .value = { "" }

##

translation-notification-show-original-button =
    .label = Xem bản gốc
translation-notification-show-translation-button =
    .label = Xem bản dịch
translation-notification-error-translating =
    .value = Có lỗi khi đang dịch trang này.
translation-notification-try-again-button =
    .label = Thử lại
translation-notification-service-unavailable =
    .value = Hiện tại không thể dịch được. Vui lòng thử lại sau.
translation-notification-options-menu =
    .label = Tùy chọn

## The accesskey values used here should not clash with each other

# Variables:
#  $langName (String): a language name coming from the toolkit/intl/languageNames.ftl file.
translation-notification-options-never-for-language =
    .label = Không bao giờ dịch { $langName }
    .accesskey = N
translation-notification-options-never-for-site =
    .label = Không bao giờ dịch trang này
    .accesskey = e
translation-notification-options-preferences =
    .label = Tùy chọn dịch
    .accesskey = T
