# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Headers used in the webextension permissions dialog,
## See https://bug1308309.bmoattachments.org/attachment.cgi?id=8814612
## for an example of the full dialog.
## Note: This string will be used as raw markup. Avoid characters like <, >, &
## Variables:
##   $extension (String): replaced with the localized name of the extension.

webext-perms-header = เพิ่ม { $extension }?
webext-perms-header-with-perms = ต้องการเพิ่ม { $extension } หรือไม่ ส่วนขยายนี้จะได้รับอนุญาตให้:
webext-perms-header-unsigned = ต้องการเพิ่ม { $extension } หรือไม่ ส่วนขยายนี้ยังไม่ถูกยืนยัน ส่วนขยายที่เป็นอันตรายอาจขโมยข้อมูลส่วนตัวของคุณหรือทำให้คอมพิวเตอร์ของคุณเสียหายได้ โปรดเพิ่มส่วนขยายนี้ก็ต่อเมื่อคุณเชื่อถือแหล่งที่มาเท่านั้น
webext-perms-header-unsigned-with-perms = ต้องการเพิ่ม { $extension } หรือไม่ ส่วนขยายนี้ยังไม่ถูกยืนยัน ส่วนขยายที่เป็นอันตรายอาจขโมยข้อมูลส่วนตัวของคุณหรือทำให้คอมพิวเตอร์ของคุณเสียหายได้ โปรดเพิ่มส่วนขยายนี้ก็ต่อเมื่อคุณเชื่อถือแหล่งที่มาเท่านั้น ส่วนขยายนี้จะได้รับอนุญาตให้:
webext-perms-sideload-header = เพิ่ม { $extension } แล้ว
webext-perms-optional-perms-header = { $extension } ขอสิทธิอนุญาตเพิ่มเติม

##

webext-perms-add =
    .label = เพิ่ม
    .accesskey = พ
webext-perms-cancel =
    .label = ยกเลิก
    .accesskey = ย
webext-perms-sideload-text = โปรแกรมอื่น ๆ บนคอมพิวเตอร์ของคุณได้ทำการติดตั้งส่วนเสริมที่อาจส่งผลกระทบต่อเบราว์เซอร์ของคุณ โปรดตรวจสอบคำขอการอนุญาตของส่วนเสริมและเลือก เปิดใช้งาน หรือ ยกเลิก (เพื่อปล่อยให้ปิดใช้งานต่อไป)
webext-perms-sideload-text-no-perms = โปรแกรมอื่น ๆ บนคอมพิวเตอร์ของคุณได้ทำการติดตั้งส่วนเสริมที่อาจส่งผลกระทบต่อเบราว์เซอร์ของคุณ โปรดเลือก เปิดใช้งาน หรือ ยกเลิก (เพื่อปล่อยให้ปิดใช้งานต่อไป)
webext-perms-sideload-enable =
    .label = เปิดใช้งาน
    .accesskey = ป
webext-perms-sideload-cancel =
    .label = ยกเลิก
    .accesskey = ย
# Variables:
#   $extension (String): replaced with the localized name of the extension.
webext-perms-update-text = { $extension } ได้รับการอัปเดตแล้ว คุณต้องอนุมัติสิทธิอนุญาตใหม่ก่อนที่รุ่นอัปเดตจะติดตั้ง การเลือก “ยกเลิก” จะคงรุ่นส่วนขยายปัจจุบันของคุณไว้ ส่วนขยายนี้จะได้รับอนุญาตให้:
webext-perms-update-accept =
    .label = อัปเดต
    .accesskey = อ
webext-perms-optional-perms-list-intro = ส่วนขยายต้องการ:
webext-perms-optional-perms-allow =
    .label = อนุญาต
    .accesskey = อ
webext-perms-optional-perms-deny =
    .label = ปฏิเสธ
    .accesskey = ป
webext-perms-host-description-all-urls = เข้าถึงข้อมูลของคุณสำหรับเว็บไซต์ทั้งหมด
# Variables:
#   $domain (String): will be replaced by the DNS domain for which a webextension is requesting access (e.g., mozilla.org)
webext-perms-host-description-wildcard = เข้าถึงข้อมูลของคุณสำหรับไซต์ในโดเมน { $domain }
# Variables:
#   $domainCount (Number): Integer indicating the number of additional
#     hosts for which this webextension is requesting permission.
webext-perms-host-description-too-many-wildcards = เข้าถึงข้อมูลของคุณใน { $domainCount } โดเมนอื่น ๆ
# Variables:
#   $domain (String): will be replaced by the DNS host name for which a webextension is requesting access (e.g., www.mozilla.org)
webext-perms-host-description-one-site = เข้าถึงข้อมูลของคุณสำหรับ { $domain }
# Variables:
#   $domainCount (Number): Integer indicating the number of additional
#     hosts for which this webextension is requesting permission.
webext-perms-host-description-too-many-sites = เข้าถึงข้อมูลของคุณใน { $domainCount } ไซต์อื่น ๆ

## Headers used in the webextension permissions dialog for synthetic add-ons.
## The part of the string describing what privileges the extension gives should be consistent
## with the value of webext-site-perms-description-gated-perms-{sitePermission}.
## Note, this string will be used as raw markup. Avoid characters like <, >, &
## Variables:
##   $hostname (String): the hostname of the site the add-on is being installed from.

webext-site-perms-header-with-gated-perms-midi = ส่วนเสริมนี้จะให้ { $hostname } เข้าถึงอุปกรณ์ MIDI ของคุณได้
webext-site-perms-header-with-gated-perms-midi-sysex = ส่วนเสริมนี้จะให้ { $hostname } เข้าถึงอุปกรณ์ MIDI ของคุณได้ (พร้อมการรองรับ SysEx)

##

# This string is used as description in the webextension permissions dialog for synthetic add-ons.
# Note, the empty line is used to create a line break between the two sections.
# Note, this string will be used as raw markup. Avoid characters like <, >, &
webext-site-perms-description-gated-perms-midi =
    อุปกรณ์เหล่านี้มักเป็นอุปกรณ์เสริม เช่น เครื่องสังเคราะห์เสียง แต่ก็อาจติดตั้งมาพร้อมกับคอมพิวเตอร์ของคุณได้เช่นกัน
    
    โดยปกติแล้ว เว็บไซต์ต่างๆ จะไม่ได้รับอนุญาตให้เข้าถึงอุปกรณ์ MIDI การใช้งานอย่างไม่ถูกต้องอาจทำให้เกิดความเสียหายหรือช่องโหว่ด้านความปลอดภัยได้

## Headers used in the webextension permissions dialog.
## Note: This string will be used as raw markup. Avoid characters like <, >, &
## Variables:
##   $extension (String): replaced with the localized name of the extension being installed.
##   $hostname (String): will be replaced by the DNS host name for which a webextension enables permissions.

webext-site-perms-header-with-perms = ต้องการเพิ่ม { $extension } หรือไม่ ส่วนขยายนี้มอบความสามารถต่อไปนี้ให้ { $hostname }:
webext-site-perms-header-unsigned-with-perms = ต้องการเพิ่ม { $extension } หรือไม่ ส่วนขยายนี้ยังไม่ถูกยืนยัน ส่วนขยายที่เป็นอันตรายอาจขโมยข้อมูลส่วนตัวของคุณหรือทำให้คอมพิวเตอร์ของคุณเสียหายได้ โปรดเพิ่มส่วนขยายนี้ก็ต่อเมื่อคุณเชื่อถือแหล่งที่มาเท่านั้น ส่วนขยายนี้มอบความสามารถต่อไปนี้ให้ { $hostname }:

## These should remain in sync with permissions.NAME.label in sitePermissions.properties

webext-site-perms-midi = เข้าถึงอุปกรณ์ MIDI
webext-site-perms-midi-sysex = เข้าถึงอุปกรณ์ MIDI พร้อมการสนับสนุน SysEx
