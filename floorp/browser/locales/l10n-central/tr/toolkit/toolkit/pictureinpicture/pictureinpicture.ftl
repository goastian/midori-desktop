# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

pictureinpicture-player-title = Görüntü içinde görüntü

## Variables:
##   $shortcut (String) - Keyboard shortcut to execute the command.

## Note that this uses .tooltip rather than the standard '.title'
## or '.tooltiptext' -  but it has the same effect. Code in the
## picture-in-picture window will read and copy this to an in-document
## DOM node that then shows the tooltip.
##
## Variables:
##   $shortcut (String) - Keyboard shortcut to execute the command.

pictureinpicture-pause-btn =
    .aria-label = Duraklat
    .tooltip = Duraklat (Boşluk)
pictureinpicture-play-btn =
    .aria-label = Oynat
    .tooltip = Oynat (Boşluk)

pictureinpicture-mute-btn =
    .aria-label = Sesi kapat
    .tooltip = Sesi kapat ({ $shortcut })
pictureinpicture-unmute-btn =
    .aria-label = Sesi aç
    .tooltip = Sesi aç ({ $shortcut })

pictureinpicture-unpip-btn =
    .aria-label = Sekmeye geri gönder
    .tooltip = Geri gönder

pictureinpicture-close-btn =
    .aria-label = Kapat
    .tooltip = Kapat ({ $shortcut })

pictureinpicture-subtitles-btn =
    .aria-label = Altyazı
    .tooltip = Altyazı

pictureinpicture-fullscreen-btn2 =
    .aria-label = Tam ekran
    .tooltip = Tam ekran (çift tıklayın veya { $shortcut })

pictureinpicture-exit-fullscreen-btn2 =
    .aria-label = Tam ekrandan çık
    .tooltip = Tam ekrandan çık (çift tıklayın veya { $shortcut })

##

# Keyboard shortcut to toggle fullscreen mode when Picture-in-Picture is open.
pictureinpicture-toggle-fullscreen-shortcut =
    .key = F

## Note that this uses .tooltip rather than the standard '.title'
## or '.tooltiptext' -  but it has the same effect. Code in the
## picture-in-picture window will read and copy this to an in-document
## DOM node that then shows the tooltip.

pictureinpicture-seekbackward-btn =
    .aria-label = Geri sar
    .tooltip = Geri sar (←)

pictureinpicture-seekforward-btn =
    .aria-label = İleri sar
    .tooltip = İleri sar (→)

##

# This string is never displayed on the window. Is intended to be announced by
# a screen reader whenever a user opens the subtitles settings panel
# after selecting the subtitles button.
pictureinpicture-subtitles-panel-accessible = Altyazı ayarları

pictureinpicture-subtitles-label = Altyazı

pictureinpicture-font-size-label = Yazı tipi boyutu

pictureinpicture-font-size-small = Küçük

pictureinpicture-font-size-medium = Orta

pictureinpicture-font-size-large = Büyük
