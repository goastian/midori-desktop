# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

pictureinpicture-player-title = Зображення в зображенні

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
    .aria-label = Пауза
    .tooltip = Пауза (Пробіл)
pictureinpicture-play-btn =
    .aria-label = Відтворити
    .tooltip = Відтворити (Пробіл)

pictureinpicture-mute-btn =
    .aria-label = Вимкнути звук
    .tooltip = Вимкнути звук ({ $shortcut })
pictureinpicture-unmute-btn =
    .aria-label = Увімкнути звук
    .tooltip = Увімкнути звук ({ $shortcut })

pictureinpicture-unpip-btn =
    .aria-label = Відправити назад у вкладку
    .tooltip = Назад у вкладку

pictureinpicture-close-btn =
    .aria-label = Закрити
    .tooltip = Закрити ({ $shortcut })

pictureinpicture-subtitles-btn =
    .aria-label = Субтитри
    .tooltip = Субтитри

pictureinpicture-fullscreen-btn2 =
    .aria-label = Повноекранний режим
    .tooltip = Повноекранний режим (двічі клацніть { $shortcut })

pictureinpicture-exit-fullscreen-btn2 =
    .aria-label = Вийти з повноекранного режиму
    .tooltip = Вийти з повноекранного режиму (двічі клацніть { $shortcut })

##

# Keyboard shortcut to toggle fullscreen mode when Picture-in-Picture is open.
pictureinpicture-toggle-fullscreen-shortcut =
    .key = F

## Note that this uses .tooltip rather than the standard '.title'
## or '.tooltiptext' -  but it has the same effect. Code in the
## picture-in-picture window will read and copy this to an in-document
## DOM node that then shows the tooltip.

pictureinpicture-seekbackward-btn =
    .aria-label = Назад
    .tooltip = Назад (←)

pictureinpicture-seekforward-btn =
    .aria-label = Уперед
    .tooltip = Уперед (→)

##

# This string is never displayed on the window. Is intended to be announced by
# a screen reader whenever a user opens the subtitles settings panel
# after selecting the subtitles button.
pictureinpicture-subtitles-panel-accessible = Налаштування субтитрів

pictureinpicture-subtitles-label = Субтитри

pictureinpicture-font-size-label = Розмір шрифту

pictureinpicture-font-size-small = Маленький

pictureinpicture-font-size-medium = Середній

pictureinpicture-font-size-large = Великий
