# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

migration-wizard-selection-header = นำเข้าข้อมูลเบราว์เซอร์
migration-wizard-selection-list = เลือกข้อมูลที่คุณต้องการนำเข้า
# Shown in the new migration wizard's dropdown selector for choosing the browser
# to import from. This variant is shown when the selected browser doesn't support
# user profiles, and so we only show the browser name.
#
# Variables:
#  $sourceBrowser (String): the name of the browser to import from.
migration-wizard-selection-option-without-profile = { $sourceBrowser }
# Shown in the new migration wizard's dropdown selector for choosing the browser
# and user profile to import from. This variant is shown when the selected browser
# supports user profiles.
#
# Variables:
#  $sourceBrowser (String): the name of the browser to import from.
#  $profileName (String): the name of the user profile to import from.
migration-wizard-selection-option-with-profile = { $sourceBrowser } — { $profileName }

# Each migrator is expected to include a display name string, and that display
# name string should have a key with "migration-wizard-migrator-display-name-"
# as a prefix followed by the unique identification key for the migrator.

migration-wizard-migrator-display-name-brave = Brave
migration-wizard-migrator-display-name-canary = Chrome Canary
migration-wizard-migrator-display-name-chrome = Chrome
migration-wizard-migrator-display-name-chrome-beta = Chrome Beta
migration-wizard-migrator-display-name-chrome-dev = Chrome Dev
migration-wizard-migrator-display-name-chromium = Chromium
migration-wizard-migrator-display-name-chromium-360se = 360 Secure Browser
migration-wizard-migrator-display-name-chromium-edge = Microsoft Edge
migration-wizard-migrator-display-name-chromium-edge-beta = Microsoft Edge Beta
migration-wizard-migrator-display-name-edge-legacy = Microsoft Edge Legacy
migration-wizard-migrator-display-name-firefox = Firefox
migration-wizard-migrator-display-name-file-password-csv = รหัสผ่านจากไฟล์ CSV
migration-wizard-migrator-display-name-file-bookmarks = ที่คั่นหน้าจากไฟล์ HTML
migration-wizard-migrator-display-name-ie = Microsoft Internet Explorer
migration-wizard-migrator-display-name-opera = Opera
migration-wizard-migrator-display-name-opera-gx = Opera GX
migration-wizard-migrator-display-name-safari = Safari
migration-wizard-migrator-display-name-vivaldi = Vivaldi

## These strings will be displayed based on how many resources are selected to import

migration-all-available-data-label = นำเข้าข้อมูลที่มีอยู่ทั้งหมด
migration-no-selected-data-label = ไม่ได้เลือกข้อมูลใดที่จะนำเข้า
migration-selected-data-label = นำเข้าข้อมูลที่เลือก

##

migration-select-all-option-label = เลือกทั้งหมด
migration-bookmarks-option-label = ที่คั่นหน้า
# Favorites is used for Bookmarks when importing from Internet Explorer or
# Edge, as this is the terminology for bookmarks on those browsers.
migration-favorites-option-label = รายการโปรด
migration-logins-and-passwords-option-label = การเข้าสู่ระบบและรหัสผ่านที่บันทึกไว้
migration-history-option-label = ประวัติการเรียกดู
migration-form-autofill-option-label = ข้อมูลกรอกแบบฟอร์มอัตโนมัติ
migration-payment-methods-option-label = วิธีการชำระเงิน
migration-cookies-option-label = คุกกี้
migration-session-option-label = หน้าต่างและแท็บ
migration-otherdata-option-label = ข้อมูลอื่น ๆ
migration-passwords-from-file-progress-header = นำเข้าไฟล์รหัสผ่าน
migration-passwords-from-file-success-header = นำเข้ารหัสผ่านสำเร็จแล้ว
migration-passwords-from-file = กำลังตรวจสอบหารหัสผ่านในไฟล์
migration-passwords-new = รหัสผ่านใหม่
migration-passwords-updated = รหัสผ่านที่มีอยู่
migration-passwords-from-file-picker-title = นำเข้าไฟล์รหัสผ่าน
# A description for the .csv file format that may be shown as the file type
# filter by the operating system.
migration-passwords-from-file-csv-filter-title =
    { PLATFORM() ->
        [macos] เอกสาร CSV
       *[other] ไฟล์ CSV
    }
# A description for the .tsv file format that may be shown as the file type
# filter by the operating system. TSV is short for 'tab separated values'.
migration-passwords-from-file-tsv-filter-title =
    { PLATFORM() ->
        [macos] เอกสาร TSV
       *[other] ไฟล์ TSV
    }
# Shown in the migration wizard after importing passwords from a file
# has completed, if new passwords were added.
#
# Variables:
#  $newEntries (Number): the number of new successfully imported passwords
migration-wizard-progress-success-new-passwords =
    { $newEntries ->
        [one] เพิ่มแล้ว { $newEntries }
       *[other] เพิ่มแล้ว { $newEntries }
    }
# Shown in the migration wizard after importing passwords from a file
# has completed, if existing passwords were updated.
#
# Variables:
#  $updatedEntries (Number): the number of updated passwords
migration-wizard-progress-success-updated-passwords =
    { $updatedEntries ->
        [one] ปรับปรุงแล้ว { $updatedEntries }
       *[other] ปรับปรุงแล้ว { $updatedEntries }
    }
migration-bookmarks-from-file-picker-title = นำเข้าไฟล์ที่คั่นหน้า
migration-bookmarks-from-file-progress-header = นำเข้าที่คั่นหน้า
migration-bookmarks-from-file = ที่คั่นหน้า
migration-bookmarks-from-file-success-header = นำเข้าที่คั่นหน้าสำเร็จแล้ว
# A description for the .json file format that may be shown as the file type
# filter by the operating system.
migration-bookmarks-from-file-json-filter-title = ไฟล์ JSON
migration-import-button-label = นำเข้า
migration-choose-to-import-from-file-button-label = นำเข้าจากไฟล์
migration-import-from-file-button-label = เลือกไฟล์
migration-cancel-button-label = ยกเลิก
migration-done-button-label = เสร็จสิ้น
migration-continue-button-label = ดำเนินการต่อ
migration-wizard-import-browser-no-browsers = { -brand-short-name } ไม่พบโปรแกรมใดที่มีข้อมูลที่คั่นหน้า ประวัติ หรือรหัสผ่าน
migration-wizard-import-browser-no-resources = มีข้อผิดพลาดเกิดขึ้น { -brand-short-name } ไม่พบข้อมูลใดที่จะนำเข้าจากโปรไฟล์เบราว์เซอร์นั้นได้เลย

## These strings will be used to create a dynamic list of items that can be
## imported. The list will be created using Intl.ListFormat(), so it will
## follow each locale's rules, and the first item will be capitalized by code.
## When applicable, the resources should be in their plural form.
## For example, a possible list could be "Bookmarks, passwords and autofill data".

migration-list-bookmark-label = ที่คั่นหน้า
# “favorites” refers to bookmarks in Edge and Internet Explorer. Use the same terminology
# if the browser is available in your language.
migration-list-favorites-label = รายการโปรด
migration-list-password-label = รหัสผ่าน
migration-list-history-label = ประวัติ
migration-list-autofill-label = ข้อมูลกรอกอัตโนมัติ
migration-list-payment-methods-label = วิธีการชำระเงิน

##

migration-wizard-progress-header = กำลังนำเข้าข้อมูล
migration-wizard-progress-done-header = นำเข้าข้อมูลสำเร็จแล้ว
migration-wizard-progress-icon-in-progress =
    .aria-label = กำลังนำเข้า…
migration-wizard-progress-icon-completed =
    .aria-label = เสร็จสมบูรณ์
migration-safari-password-import-header = นำเข้ารหัสผ่านจาก Safari
migration-safari-password-import-steps-header = หากต้องการนำเข้ารหัสผ่านจาก Safari:
migration-safari-password-import-step1 = ใน Safari ให้เปิดเมนู “Safari” แล้วไปที่ การตั้งค่า > รหัสผ่าน
migration-safari-password-import-step2 = เลือกปุ่ม <img data-l10n-name="safari-icon-3dots"/> แล้วเลือก “ส่งออกรหัสผ่านทั้งหมด”
migration-safari-password-import-step3 = บันทึกไฟล์รหัสผ่าน
migration-safari-password-import-step4 = ใช้ “เลือกไฟล์” ด้านล่างเพื่อเลือกไฟล์รหัสผ่านที่คุณได้บันทึกไว้
migration-safari-password-import-skip-button = ข้าม
migration-safari-password-import-select-button = เลือกไฟล์
# Shown in the migration wizard after importing bookmarks from another
# browser has completed.
#
# Variables:
#  $quantity (Number): the number of successfully imported bookmarks
migration-wizard-progress-success-bookmarks =
    { $quantity ->
        [one] { $quantity } ที่คั่นหน้า
       *[other] { $quantity } ที่คั่นหน้า
    }
# Shown in the migration wizard after importing bookmarks from either
# Internet Explorer or Edge.
#
# Use the same terminology if the browser is available in your language.
#
# Variables:
#  $quantity (Number): the number of successfully imported bookmarks
migration-wizard-progress-success-favorites =
    { $quantity ->
        [one] { $quantity } รายการโปรด
       *[other] { $quantity } รายการโปรด
    }
# Shown in the migration wizard after importing passwords from another
# browser has completed.
#
# Variables:
#  $quantity (Number): the number of successfully imported passwords
migration-wizard-progress-success-passwords =
    { $quantity ->
        [one] { $quantity } รหัสผ่าน
       *[other] { $quantity } รหัสผ่าน
    }
# Shown in the migration wizard after importing history from another
# browser has completed.
#
# Variables:
#  $maxAgeInDays (Number): the maximum number of days of history that might be imported.
migration-wizard-progress-success-history =
    { $maxAgeInDays ->
        [one] จากวันก่อน
       *[other] จาก { $maxAgeInDays } วันก่อน
    }
migration-wizard-progress-success-formdata = ประวัติแบบฟอร์ม
migration-wizard-safari-permissions-sub-header = หากต้องการนำเข้าที่คั่นหน้าและประวัติการเรียกดูจาก Safari:
migration-wizard-safari-instructions-continue = ให้เลือก “ดำเนินการต่อ”
migration-wizard-safari-instructions-folder = เลือกโฟลเดอร์ Safari จากในรายการ แล้วเลือก “เปิด”
