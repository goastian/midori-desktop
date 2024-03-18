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
    .value = هذه الصفحة باللغة
translation-notification-translate-this-page =
    .value = أتريد ترجمة هذه الصفحة؟

##

translation-notification-translate-button =
    .label = ترجم
translation-notification-not-now-button =
    .label = ليس الآن
translation-notification-translating-content =
    .value = يُترجم محتوى الصفحة…

## These 3 strings are used to construct a sentence that contains 2 dropdowns
## showing the source and target language of a translated web page.
## In en-US it looks like this:
##   This page has been translated from [from language] to [to language]
## "from language" and "to language" here are language names coming from the
## toolkit/intl/languageNames.ftl file; for some locales they may not be in
## the correct grammar case to keep the same structure of the original
## sentence.

translation-notification-translated-from =
    .value = تُرجمت هذه الصفحة من اللغة
translation-notification-translated-to =
    .value = إلى
# This string (empty in en-US) is for locales that need to display some text
# after the second drop down for the sentence to be grammatically correct.
translation-notification-translated-to-suffix =
    .value = { "" }

##

translation-notification-show-original-button =
    .label = اعرض الأصل
translation-notification-show-translation-button =
    .label = اعرض الترجمة
translation-notification-error-translating =
    .value = حدث خطأ أثناء ترجمة هذه الصفحة.
translation-notification-try-again-button =
    .label = حاول مجددًا
translation-notification-service-unavailable =
    .value = الترجمة ليست متوفرة حاليًا. من فضلك أعد المحاولة لاحقًا.
translation-notification-options-menu =
    .label = خيارات

## The accesskey values used here should not clash with each other

# Variables:
#  $langName (String): a language name coming from the toolkit/intl/languageNames.ftl file.
translation-notification-options-never-for-language =
    .label = لا تترجم { $langName } أبدًا
    .accesskey = ت
translation-notification-options-never-for-site =
    .label = لا تترجم هذا الموقع أبدًا
    .accesskey = ه
translation-notification-options-preferences =
    .label = تفضيلات الترجمة
    .accesskey = ت
