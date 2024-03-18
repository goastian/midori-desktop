# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## The following feature name must be treated as a brand.
##
## They cannot be:
## - Transliterated.
## - Translated.
##
## Declension should be avoided where possible, leaving the original
## brand unaltered in prominent UI positions.
##
## For further details, consult:
## https://mozilla-l10n.github.io/styleguides/mozilla_general/#brands-copyright-and-trademark

-profiler-brand-name = Firefox Profiler

##

# This is the title of the page
about-logging-title = เกี่ยวกับการบันทึก
about-logging-page-title = ตัวจัดการการบันทึก
about-logging-current-log-file = ไฟล์รายการบันทึกปัจจุบัน:
about-logging-current-log-modules = โมดูลรายการบันทึกปัจจุบัน:
about-logging-new-log-file = ไฟล์บันทึกใหม่:
about-logging-currently-enabled-log-modules = โมดูลบันทึกที่เปิดใช้งานในขณะนี้:
about-logging-log-tutorial = ดู<a data-l10n-name="logging">การบันทึกล็อก HTTP</a>สำหรับคำแนะนำเกี่ยวกับวิธีการใช้เครื่องมือนี้
# This message is used as a button label, "Open" indicates an action.
about-logging-open-log-file-dir = เปิดไดเรกทอรี
about-logging-set-log-file = ตั้งไฟล์รายการบันทึก
about-logging-set-log-modules = ตั้งโมดูลรายการบันทึก
about-logging-start-logging = เริ่มการบันทึก
about-logging-stop-logging = หยุดการบันทึก
about-logging-buttons-disabled = การบันทึกถูกกำหนดค่าผ่านตัวแปรสภาพแวดล้อม การกำหนดค่าแบบไดนามิกไม่พร้อมใช้งาน
about-logging-some-elements-disabled = การบันทึกถูกกำหนดค่าผ่าน URL ตัวเลือกการกำหนดค่าบางอย่างไม่สามารถใช้งานได้
about-logging-info = ข้อมูล:
about-logging-log-modules-selection = การเลือกโมดูลบันทึก
about-logging-new-log-modules = โมดูลบันทึกใหม่:
about-logging-logging-output-selection = ผลลัพธ์การบันทึก
about-logging-logging-to-file = การบันทึกลงไฟล์
about-logging-logging-to-profiler = การบันทึกลง { -profiler-brand-name }
about-logging-no-log-modules = ไม่มี
about-logging-no-log-file = ไม่มี
about-logging-logging-preset-selector-text = ค่าที่ตั้งไว้ล่วงหน้าของการบันทึก:

## Logging presets

about-logging-preset-networking-label = ระบบเครือข่าย
about-logging-preset-networking-description = โมดูลรายการบันทึกที่จะใช้วินิจฉัยปัญหาระบบเครือข่าย
about-logging-preset-media-playback-label = การเล่นสื่อ
about-logging-preset-media-playback-description = โมดูลรายการบันทึกที่จะใช้วินิจฉัยปัญหาการเล่นสื่อ (ไม่ใช่ปัญหาการประชุมทางวิดีโอ)
about-logging-preset-custom-label = กำหนดเอง
about-logging-preset-custom-description = โมดูลรายการบันทึกที่เลือกด้วยตนเอง
# Error handling
about-logging-error = ข้อผิดพลาด:

## Variables:
##   $k (String) - Variable name
##   $v (String) - Variable value

about-logging-invalid-output = ค่า “{ $v }“ ไม่ถูกต้องสำหรับคีย์ “{ $k }“
about-logging-unknown-logging-preset = ไม่รู้จักค่าที่ตั้งไว้ล่วงหน้าของการบันทึก “{ $v }“
about-logging-unknown-profiler-preset = ไม่รู้จักค่าที่ตั้งไว้ล่วงหน้าของตัวสร้างโปรไฟล์ “{ $v }“
about-logging-unknown-option = ไม่รู้จักตัวเลือก about:logging “{ $k }“
about-logging-configuration-url-ignored = เพิกเฉย URL การกำหนดค่าแล้ว
about-logging-file-and-profiler-override = ไม่สามารถบังคับให้ส่งออกไฟล์และแทนที่ตัวเลือกตัวสร้างโปรไฟล์พร้อมกันได้
about-logging-configured-via-url = ตัวเลือกที่กำหนดค่าผ่าน URL
