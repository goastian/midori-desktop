# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

tabbrowser-empty-tab-title = Yeni Sekme
tabbrowser-empty-private-tab-title = Yeni gizli sekme

tabbrowser-menuitem-close-tab =
    .label = Sekmeyi kapat
tabbrowser-menuitem-close =
    .label = Kapat

# Displayed as a tooltip on container tabs
# Variables:
#   $title (String): the title of the current tab.
#   $containerName (String): the name of the current container.
tabbrowser-container-tab-title = { $title } — { $containerName }

# Variables:
#   $tabCount (Number): The number of tabs that will be closed.
tabbrowser-close-tabs-tooltip =
    .label =
        { $tabCount ->
            [one] Sekmeyi kapat
           *[other] { $tabCount } sekmeyi kapat
        }

## Tooltips for tab audio control
## Variables:
##   $tabCount (Number): The number of tabs that will be affected.

# Variables:
#   $shortcut (String): The keyboard shortcut for "Mute tab".
tabbrowser-mute-tab-audio-tooltip =
    .label =
        { $tabCount ->
            [one] Sekmenin sesini kapat ({ $shortcut })
           *[other] { $tabCount } sekmenin sesini kapat ({ $shortcut })
        }
# Variables:
#   $shortcut (String): The keyboard shortcut for "Unmute tab".
tabbrowser-unmute-tab-audio-tooltip =
    .label =
        { $tabCount ->
            [one] Sekmenin sesini aç ({ $shortcut })
           *[other] { $tabCount } sekmenin sesini aç ({ $shortcut })
        }
tabbrowser-mute-tab-audio-background-tooltip =
    .label =
        { $tabCount ->
            [one] Sekmenin sesini kapat
           *[other] { $tabCount } sekmenin sesini kapat
        }
tabbrowser-unmute-tab-audio-background-tooltip =
    .label =
        { $tabCount ->
            [one] Sekmenin sesini aç
           *[other] { $tabCount } sekmenin sesini aç
        }
tabbrowser-unblock-tab-audio-tooltip =
    .label =
        { $tabCount ->
            [one] Sekmeyi oynat
           *[other] { $tabCount } sekmeyi oynat
        }

## Confirmation dialog when closing a window with more than one tab open,
## or when quitting when only one window is open.

# The singular form is not considered since this string is used only for multiple tabs.
# Variables:
#   $tabCount (Number): The number of tabs that will be closed.
tabbrowser-confirm-close-tabs-title =
    { $tabCount ->
        [one] { $tabCount } sekme kapatılsın mı?
       *[other] { $tabCount } sekme kapatılsın mı?
    }
tabbrowser-confirm-close-tabs-button = Sekmeleri kapat
tabbrowser-confirm-close-tabs-checkbox = Birden fazla sekmeyi kapatırken onay iste

## Confirmation dialog when quitting using the menu and multiple windows are open.

# The forms for 0 or 1 items are not considered since this string is used only for
# multiple windows.
# Variables:
#   $windowCount (Number): The number of windows that will be closed.
tabbrowser-confirm-close-windows-title =
    { $windowCount ->
        [one] { $windowCount } pencere kapatılsın mı?
       *[other] { $windowCount } pencere kapatılsın mı?
    }
tabbrowser-confirm-close-windows-button =
    { PLATFORM() ->
        [windows] Kapat ve çık
       *[other] Kapat ve çık
    }

## Confirmation dialog when quitting using the keyboard shortcut (Ctrl/Cmd+Q)
## Windows does not show a prompt on quit when using the keyboard shortcut by default.

tabbrowser-confirm-close-tabs-with-key-title = Pencere kapatılıp { -brand-short-name } tarayıcısından çıkılsın mı?
tabbrowser-confirm-close-tabs-with-key-button = { -brand-short-name } uygulamasından çık
# Variables:
#   $quitKey (String): the text of the keyboard shortcut for quitting.
tabbrowser-confirm-close-tabs-with-key-checkbox = { $quitKey } ile çıkış yaparken onay iste

## Confirmation dialog when opening multiple tabs simultaneously

tabbrowser-confirm-open-multiple-tabs-title = Açış onayı
# Variables:
#   $tabCount (Number): The number of tabs that will be opened.
tabbrowser-confirm-open-multiple-tabs-message =
    { $tabCount ->
       *[other] { $tabCount } sekme açmak üzeresiniz. Sayfalar yüklenirken { -brand-short-name } yavaşlayabilir. Devam etmek istediğinizden emin misiniz?
    }
tabbrowser-confirm-open-multiple-tabs-button = Sekmeleri aç
tabbrowser-confirm-open-multiple-tabs-checkbox = Birden çok sekme açarken { -brand-short-name } yavaşlayacak olursa beni uyar

## Confirmation dialog for enabling caret browsing

tabbrowser-confirm-caretbrowsing-title = Klavye ile Gezinti
tabbrowser-confirm-caretbrowsing-message = F7 tuşu Klavye ile Gezinti özelliğini açar ve kapatır. Bu özellik, web sayfalarına, hareket edebilen bir işaretçi ekleyerek metinleri klavyeyle seçebilmenizi sağlar. Klavye ile Gezinti’yi açmak istiyor musunuz?
tabbrowser-confirm-caretbrowsing-checkbox = Bu iletişim kutusunu bir daha gösterme.

##

# Variables:
#   $domain (String): URL of the page that is trying to steal focus.
tabbrowser-allow-dialogs-to-get-focus =
    .label = { $domain } sitesinden gelen bildirimlerin beni kendi sekmesine götürmesine izin ver

tabbrowser-customizemode-tab-title = { -brand-short-name } tarayıcısını özelleştir

## Context menu buttons, of which only one will be visible at a time

tabbrowser-context-mute-tab =
    .label = Sekmenin sesini kapat
    .accesskey = m
tabbrowser-context-unmute-tab =
    .label = Sekmenin sesini aç
    .accesskey = m
# The accesskey should match the accesskey for tabbrowser-context-mute-tab
tabbrowser-context-mute-selected-tabs =
    .label = Sekmelerin sesini kapat
    .accesskey = m
# The accesskey should match the accesskey for tabbrowser-context-unmute-tab
tabbrowser-context-unmute-selected-tabs =
    .label = Sekmelerin sesini aç
    .accesskey = m

# This string is used as an additional tooltip and accessibility description for tabs playing audio
tabbrowser-tab-audio-playing-description = Ses çalınıyor

## Ctrl-Tab dialog

# Variables:
#   $tabCount (Number): The number of tabs in the current browser window. It will always be 2 at least.
tabbrowser-ctrl-tab-list-all-tabs =
    .label = { $tabCount } sekmenin tümünü listele

## Tab manager menu buttons

tabbrowser-manager-mute-tab =
    .tooltiptext = Sekmenin sesini kapat
tabbrowser-manager-unmute-tab =
    .tooltiptext = Sekmenin sesini aç
tabbrowser-manager-close-tab =
    .tooltiptext = Sekmeyi kapat
