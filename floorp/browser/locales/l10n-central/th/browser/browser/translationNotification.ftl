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
    .value = หน้านี้เป็นภาษา
translation-notification-translate-this-page =
    .value = แปลหน้านี้?

##

translation-notification-translate-button =
    .label = แปล
translation-notification-not-now-button =
    .label = ไม่ใช่ตอนนี้
translation-notification-translating-content =
    .value = กำลังแปลเนื้อหาของหน้า…

## These 3 strings are used to construct a sentence that contains 2 dropdowns
## showing the source and target language of a translated web page.
## In en-US it looks like this:
##   This page has been translated from [from language] to [to language]
## "from language" and "to language" here are language names coming from the
## toolkit/intl/languageNames.ftl file; for some locales they may not be in
## the correct grammar case to keep the same structure of the original
## sentence.

translation-notification-translated-from =
    .value = หน้านี้ถูกแปลจาก
translation-notification-translated-to =
    .value = เป็น
# This string (empty in en-US) is for locales that need to display some text
# after the second drop down for the sentence to be grammatically correct.
translation-notification-translated-to-suffix =
    .value = { "" }

##

translation-notification-show-original-button =
    .label = แสดงต้นฉบับ
translation-notification-show-translation-button =
    .label = แสดงการแปล
translation-notification-error-translating =
    .value = เกิดข้อผิดพลาดในการแปลหน้านี้
translation-notification-try-again-button =
    .label = ลองอีกครั้ง
translation-notification-service-unavailable =
    .value = การแปลไม่พร้อมใช้งานในขณะนี้ โปรดลองอีกครั้งในภายหลัง
translation-notification-options-menu =
    .label = ตัวเลือก

## The accesskey values used here should not clash with each other

# Variables:
#  $langName (String): a language name coming from the toolkit/intl/languageNames.ftl file.
translation-notification-options-never-for-language =
    .label = ไม่แปล { $langName } เสมอ
    .accesskey = ม
translation-notification-options-never-for-site =
    .label = ไม่แปลไซต์นี้เสมอ
    .accesskey = ป
translation-notification-options-preferences =
    .label = การตั้งค่าการแปล
    .accesskey = ค
