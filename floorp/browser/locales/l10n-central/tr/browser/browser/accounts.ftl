# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Used as the FxA toolbar menu item value when user has not
# finished setting up an account.
account-finish-account-setup = Hesap kurulumunu tamamla

# Used as the FxA toolbar menu item title when the user
# needs to reconnect their account.
account-disconnected2 = Hesabın bağlantısı kesildi

# Menu item that sends a tab to all synced devices.
account-send-to-all-devices = Tüm cihazlara gönder

# Menu item that links to the Firefox Accounts settings for connected devices.
account-manage-devices = Cihazları yönet…

## Variables:
##   $email (String): = Email address of user's Firefox Account.

account-reconnect = { $email } adresini yeniden bağla
account-verify = { $email } adresini doğrulayın

## Displayed in the Send Tab/Page/Link to Device context menu when right clicking a tab, a page or a link.

account-send-to-all-devices-titlecase = Tüm cihazlara gönder
account-manage-devices-titlecase = Cihazları yönet…

## Displayed in the Send Tabs context menu when right clicking a tab, a page or a link
## and the account has only 1 device connected.

# Redirects to a marketing page.
account-send-tab-to-device-singledevice-status = Bağlı cihaz yok

# Redirects to a marketing page.
account-send-tab-to-device-singledevice-learnmore = Sekme gönderme hakkında bilgi alın…

# Redirects to an FxAccounts page that tells to you to connect another device.
account-send-tab-to-device-connectdevice = Başka bir cihaz bağla…

## Displayed in the Send Tabs context menu when right clicking a tab, a page or a link
## and the Sync account is unverified. Redirects to the Sync preferences page.

account-send-tab-to-device-verify-status = Hesap doğrulanmamış
account-send-tab-to-device-verify = Hesabınızı doğrulayın…

## These strings are used in a notification shown when a new device joins the Firefox account.

# The title shown in a notification when either this device or another device
# has connected to, or disconnected from, a Firefox account.
account-connection-title = { -fxaccount-brand-name(capitalization: "title") }

# Variables:
#   $deviceName (String): the name of the new device
account-connection-connected-with = Bu bilgisayar artık { $deviceName } ile bağlı.

# Used when the name of the new device is not known.
account-connection-connected-with-noname = Bu bilgisayar yeni bir cihaza bağlandı.

# Used in a notification shown after a Firefox account is connected to the current device.
account-connection-connected = Başarıyla giriş yaptınız

# Used in a notification shown after the Firefox account was disconnected remotely.
account-connection-disconnected = Bu bilgisayarın bağlantısı kesildi.

## These strings are used in a notification shown when we're opening
## a single tab another device sent us to display.
## The body for this notification is the URL of the received tab.

account-single-tab-arriving-title = Sekme alındı
# Variables:
#   $deviceName (String): the device name.
account-single-tab-arriving-from-device-title = { $deviceName } üzerinden gelen sekme

# Used when a tab from a remote device arrives but the URL must be truncated.
# Should display the URL with an indication that it's been truncated.
# Variables:
#   $url (String): the portion of the URL that remains after truncation.
account-single-tab-arriving-truncated-url = { $url }…

## These strings are used in a notification shown when we're opening
## multiple tabs another device or devices sent us to display.
## Variables:
##   $tabCount (Number): the number of tabs received

account-multiple-tabs-arriving-title = Sekmeler alındı

# Variables:
#   $deviceName (String): the device name.
account-multiple-tabs-arriving-from-single-device =
    { $tabCount ->
        [one] { $deviceName } adlı cihazdan { $tabCount } sekme geldi
       *[other] { $deviceName } adlı cihazdan { $tabCount } sekme geldi
    }
account-multiple-tabs-arriving-from-multiple-devices =
    { $tabCount ->
        [one] Bağlı cihazlarınızdan { $tabCount } sekme geldi
       *[other] Bağlı cihazlarınızdan { $tabCount } sekme geldi
    }
# This version is used when we don't know any device names.
account-multiple-tabs-arriving-from-unknown-device =
    { $tabCount ->
        [one] { $tabCount } sekme geldi
       *[other] { $tabCount } sekme geldi
    }
