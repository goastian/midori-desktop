# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Variables:
#   $expiryDate (string) - date on which the colorway collection expires. When formatting this, you may omit the year, only exposing the month and day, as colorway collections will always expire within a year.
colorway-collection-expiry-label = หมดอายุ { DATETIME($expiryDate, month: "long", day: "numeric") }
# Document title, not shown in the UI but exposed through accessibility APIs
colorways-modal-title = เลือกชุดรูปแบบสีของคุณ
colorway-intensity-selector-label = ความเข้ม
colorway-intensity-soft = อ่อน
colorway-intensity-balanced = สมดุล
# "Bold" is used in the sense of bravery or courage, not in the sense of
# emphasized text.
colorway-intensity-bold = ตัวหนา
# Label for the button to keep using the selected colorway in the browser
colorway-closet-set-colorway-button = ตั้งค่าชุดรูปแบบสี
colorway-closet-cancel-button = ยกเลิก
colorway-homepage-reset-prompt = ทำให้ { -firefox-home-brand-name } เป็นหน้าแรกที่เต็มไปด้วยสีสันของคุณ
colorway-homepage-reset-success-message = ตอนนี้ { -firefox-home-brand-name } เป็นหน้าแรกของคุณแล้ว
colorway-homepage-reset-apply-button = นำไปใช้
colorway-homepage-reset-undo-button = เลิกทำ
