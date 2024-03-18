# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## The title and aria-label attributes are used by screen readers to describe
## the Downloads Panel.

downloads-window =
    .title = İndirilenler
downloads-panel =
    .aria-label = İndirilenler

##

# The style attribute has the width of the Downloads Panel expressed using
# a CSS unit. The longest labels that should fit are usually those of
# in-progress and blocked downloads.
downloads-panel-items =
    .style = width: 35em

downloads-cmd-pause =
    .label = Duraklat
    .accesskey = r
downloads-cmd-resume =
    .label = Devam et
    .accesskey = m
downloads-cmd-cancel =
    .tooltiptext = İptal
downloads-cmd-cancel-panel =
    .aria-label = İptal

downloads-cmd-show-menuitem-2 =
    .label =
        { PLATFORM() ->
            [macos] Finder’da göster
           *[other] Klasörde göster
        }
    .accesskey = ö

## Displayed in the downloads context menu for files that can be opened.
## Variables:
##   $handler (String) - The name of the mime type's default file handler.
##   Example: "Notepad", "Acrobat Reader DC", "7-Zip File Manager"

downloads-cmd-use-system-default =
    .label = Sistem görüntüleyicisinde aç
    .accesskey = S
# This version is shown when the download's mime type has a valid file handler.
downloads-cmd-use-system-default-named =
    .label = { $handler } ile aç
    .accesskey = i

# We can use the same accesskey as downloads-cmd-always-open-similar-files.
# Both should not be visible in the downloads context menu at the same time.
downloads-cmd-always-use-system-default =
    .label = Her zaman sistem görüntüleyicisinde aç
    .accesskey = H
# We can use the same accesskey as downloads-cmd-always-open-similar-files.
# Both should not be visible in the downloads context menu at the same time.
# This version is shown when the download's mime type has a valid file handler.
downloads-cmd-always-use-system-default-named =
    .label = Her zaman { $handler } ile aç
    .accesskey = e

##

# We can use the same accesskey as downloads-cmd-always-use-system-default.
# Both should not be visible in the downloads context menu at the same time.
downloads-cmd-always-open-similar-files =
    .label = Benzer dosyaları her zaman aç
    .accesskey = B

downloads-cmd-show-button-2 =
    .tooltiptext =
        { PLATFORM() ->
            [macos] Finder’da göster
           *[other] Klasörde göster
        }

downloads-cmd-show-panel-2 =
    .aria-label =
        { PLATFORM() ->
            [macos] Finder’da göster
           *[other] Klasörde göster
        }
downloads-cmd-show-description-2 =
    .value =
        { PLATFORM() ->
            [macos] Finder’da göster
           *[other] Klasörde göster
        }

downloads-cmd-show-downloads =
    .label = İndirilenler klasörünü göster
downloads-cmd-retry =
    .tooltiptext = Yeniden dene
downloads-cmd-retry-panel =
    .aria-label = Yeniden dene
downloads-cmd-go-to-download-page =
    .label = İndirme sayfasına git
    .accesskey = s
downloads-cmd-copy-download-link =
    .label = İndirme bağlantısını kopyala
    .accesskey = b
downloads-cmd-remove-from-history =
    .label = Geçmişten kaldır
    .accesskey = e
downloads-cmd-clear-list =
    .label = Ön izleme panelini temizle
    .accesskey = a
downloads-cmd-clear-downloads =
    .label = İndirmeleri temizle
    .accesskey = t
downloads-cmd-delete-file =
    .label = Sil
    .accesskey = S

# This command is shown in the context menu when downloads are blocked.
downloads-cmd-unblock =
    .label = İndirmeye izin ver
    .accesskey = z

# This is the tooltip of the action button shown when malware is blocked.
downloads-cmd-remove-file =
    .tooltiptext = Dosyayı sil

downloads-cmd-remove-file-panel =
    .aria-label = Dosyayı sil

# This is the tooltip of the action button shown when potentially unwanted
# downloads are blocked. This opens a dialog where the user can choose
# whether to unblock or remove the download. Removing is the default option.
downloads-cmd-choose-unblock =
    .tooltiptext = Dosyayı sil ve indirmeye izin ver

downloads-cmd-choose-unblock-panel =
    .aria-label = Dosyayı sil ve indirmeye izin ver

# This is the tooltip of the action button shown when uncommon downloads are
# blocked.This opens a dialog where the user can choose whether to open the
# file or remove the download. Opening is the default option.
downloads-cmd-choose-open =
    .tooltiptext = Dosyayı aç veya sil

downloads-cmd-choose-open-panel =
    .aria-label = Dosyayı aç veya sil

# Displayed when hovering a blocked download, indicates that it's possible to
# show more information for user to take the next action.
downloads-show-more-information =
    .value = Daha fazla bilgi ver

# Displayed when hovering a complete download, indicates that it's possible to
# open the file using an app available in the system.
downloads-open-file =
    .value = Dosyayı aç

## Displayed when the user clicked on a download in process. Indicates that the
## downloading file will be opened after certain amount of time using an app
## available in the system.
## Variables:
##   $hours (number) - Amount of hours left till the file opens.
##   $seconds (number) - Amount of seconds left till the file opens.
##   $minutes (number) - Amount of minutes till the file opens.

downloading-file-opens-in-hours-and-minutes-2 =
    .value = { $hours } saat { $minutes } dk sonra açılacak…
downloading-file-opens-in-minutes-2 =
    .value = { $minutes } dk sonra açılacak…
downloading-file-opens-in-minutes-and-seconds-2 =
    .value = { $minutes } dk { $seconds } sn sonra açılacak…
downloading-file-opens-in-seconds-2 =
    .value = { $seconds } sn sonra açılacak…
downloading-file-opens-in-some-time-2 =
    .value = Tamamlandığında açılacak…
downloading-file-click-to-open =
    .value = Tamamlandığında aç

##

# Displayed when hovering a download which is able to be retried by users,
# indicates that it's possible to download this file again.
downloads-retry-download =
    .value = İndirmeyi yeniden dene

# Displayed when hovering a download which is able to be cancelled by users,
# indicates that it's possible to cancel and stop the download.
downloads-cancel-download =
    .value = İndirmekten vazgeç

# This string is shown at the bottom of the Downloads Panel when all the
# downloads fit in the available space, or when there are no downloads in
# the panel at all.
downloads-history =
    .label = Tüm indirmeleri göster
    .accesskey = T

# This string is shown at the top of the Download Details Panel, to indicate
# that we are showing the details of a single download.
downloads-details =
    .title = İndirme ayrıntıları

## Displayed when a site attempts to automatically download many files.
## Variables:
##   $num (number) - Number of blocked downloads.
##   $url (string) - The url of the suspicious site, stripped of http, https and www prefix.

downloads-files-not-downloaded =
    { $num ->
        [one] Dosya indirilmedi.
       *[other] { $num } dosya indirilmedi.
    }
downloads-blocked-from-url = { $url } adresinden indirmeler engellendi.
downloads-blocked-download-detailed-info = { $url } otomatik olarak birden çok dosya indirmeye çalıştı. Site bozuk olabilir veya cihazınızda spam dosyalar depolamaya çalışıyor olabilir.

##

downloads-clear-downloads-button =
    .label = İndirmeleri temizle
    .tooltiptext = Tamamlanan, iptal edilen ve başarısız olan indirmeleri temizler

# This string is shown when there are no items in the Downloads view, when it
# is displayed inside a browser tab.
downloads-list-empty =
    .value = İndirme yok.

# This string is shown when there are no items in the Downloads Panel.
downloads-panel-empty =
    .value = Bu oturumda indirme yapılmadı.

# This is displayed in an item at the bottom of the Downloads Panel when there
# are more downloads than can fit in the list in the panel.
#   $count (number) - number of files being downloaded that are not shown in the
#                     panel list.
downloads-more-downloading =
    { $count ->
        [one] { $count } dosya daha indiriliyor
       *[other] { $count } dosya daha indiriliyor
    }

## Download errors

downloads-error-alert-title = İndirme hatası
# Variables:
#   $extension (String): the name of the blocking extension.
downloads-error-blocked-by = İndirme { $extension } tarafından engellendiği için kaydedilemiyor.
# Used when the name of the blocking extension is unavailable.
downloads-error-extension = İndirme bir uzantı tarafından engellendiği için kaydedilemiyor.
# Line breaks in this message are meaningful, and should be maintained.
downloads-error-generic =
    Bilinmeyen bir hata oluştuğu için indirilen dosya kaydedilemiyor.
    
    Lütfen tekrar deneyin.
