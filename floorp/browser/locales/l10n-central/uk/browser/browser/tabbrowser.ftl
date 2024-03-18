# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

tabbrowser-empty-tab-title = Нова вкладка
tabbrowser-empty-private-tab-title = Приватна вкладка

tabbrowser-menuitem-close-tab =
    .label = Закрити вкладку
tabbrowser-menuitem-close =
    .label = Закрити

# Displayed as a tooltip on container tabs
# Variables:
#   $title (String): the title of the current tab.
#   $containerName (String): the name of the current container.
tabbrowser-container-tab-title = { $title } - { $containerName }

# Variables:
#   $tabCount (Number): The number of tabs that will be closed.
tabbrowser-close-tabs-tooltip =
    .label =
        { $tabCount ->
            [one] Закрити вкладку
            [few] Закрити { $tabCount } вкладки
           *[many] Закрити { $tabCount } вкладок
        }

## Tooltips for tab audio control
## Variables:
##   $tabCount (Number): The number of tabs that will be affected.

# Variables:
#   $shortcut (String): The keyboard shortcut for "Mute tab".
tabbrowser-mute-tab-audio-tooltip =
    .label =
        { $tabCount ->
            [one] Вимкнути звук вкладки ({ $shortcut })
            [few] Вимкнути звук { $tabCount } вкладок ({ $shortcut })
           *[many] Вимкнути звук { $tabCount } вкладок ({ $shortcut })
        }
# Variables:
#   $shortcut (String): The keyboard shortcut for "Unmute tab".
tabbrowser-unmute-tab-audio-tooltip =
    .label =
        { $tabCount ->
            [one] Увімкнути звук вкладки ({ $shortcut })
            [few] Увімкнути звук { $tabCount } вкладок ({ $shortcut })
           *[many] Увімкнути звук { $tabCount } вкладок ({ $shortcut })
        }
tabbrowser-mute-tab-audio-background-tooltip =
    .label =
        { $tabCount ->
            [one] Вимкнути звук вкладки
            [few] Вимкнути звук { $tabCount } вкладок
           *[many] Вимкнути звук { $tabCount } вкладок
        }
tabbrowser-unmute-tab-audio-background-tooltip =
    .label =
        { $tabCount ->
            [one] Увімкнути звук вкладки
            [few] Увімкнути звук { $tabCount } вкладок
           *[many] Увімкнути звук { $tabCount } вкладок
        }
tabbrowser-unblock-tab-audio-tooltip =
    .label =
        { $tabCount ->
            [one] Відтворити звук вкладки
            [few] Відтворити звук { $tabCount } вкладок
           *[many] Відтворити звук { $tabCount } вкладок
        }

## Confirmation dialog when closing a window with more than one tab open,
## or when quitting when only one window is open.

# The singular form is not considered since this string is used only for multiple tabs.
# Variables:
#   $tabCount (Number): The number of tabs that will be closed.
tabbrowser-confirm-close-tabs-title =
    { $tabCount ->
        [one] Закрити { $tabCount } вкладку?
        [few] Закрити { $tabCount } вкладки?
       *[many] Закрити { $tabCount } вкладок?
    }
tabbrowser-confirm-close-tabs-button = Закрити вкладки
tabbrowser-confirm-close-tabs-checkbox = Підтверджувати перед закриттям кількох вкладок

## Confirmation dialog when quitting using the menu and multiple windows are open.

# The forms for 0 or 1 items are not considered since this string is used only for
# multiple windows.
# Variables:
#   $windowCount (Number): The number of windows that will be closed.
tabbrowser-confirm-close-windows-title =
    { $windowCount ->
        [one] Закрити { $windowCount } вікно?
        [few] Закрити { $windowCount } вікна?
       *[many] Закрити { $windowCount } вікон?
    }
tabbrowser-confirm-close-windows-button =
    { PLATFORM() ->
        [windows] Закрити й вийти
       *[other] Закрити й вийти
    }

## Confirmation dialog when quitting using the keyboard shortcut (Ctrl/Cmd+Q)
## Windows does not show a prompt on quit when using the keyboard shortcut by default.

tabbrowser-confirm-close-tabs-with-key-title = Закрити вікно та вийти з { -brand-short-name }?
tabbrowser-confirm-close-tabs-with-key-button = Закрити { -brand-short-name }
# Variables:
#   $quitKey (String): the text of the keyboard shortcut for quitting.
tabbrowser-confirm-close-tabs-with-key-checkbox = Підтверджувати перед виходом за допомогою { $quitKey }

## Confirmation dialog when opening multiple tabs simultaneously

tabbrowser-confirm-open-multiple-tabs-title = Підтвердьте відкриття
# Variables:
#   $tabCount (Number): The number of tabs that will be opened.
tabbrowser-confirm-open-multiple-tabs-message =
    { $tabCount ->
       *[other] Ви збираєтесь відкрити { $tabCount } вкладок. Це може сповільнити { -brand-short-name } доки сторінки будуть завантажуватись. Ви справді хочете продовжити?
    }
tabbrowser-confirm-open-multiple-tabs-button = Відкрити вкладки
tabbrowser-confirm-open-multiple-tabs-checkbox = Попереджати, коли відкриття декількох вкладок може сповільнити { -brand-short-name }

## Confirmation dialog for enabling caret browsing

tabbrowser-confirm-caretbrowsing-title = Перегляд з курсором
tabbrowser-confirm-caretbrowsing-message = Натискання F7 вмикає та вимикає Перегляд з курсором. Це дає можливість помістити рухомий курсор на вебсторінку, дозволяючи вам вибирати блоки тексту клавіатурою. Хочете увімкнути Перегляд з курсором?
tabbrowser-confirm-caretbrowsing-checkbox = Більше не показувати це вікно.

##

# Variables:
#   $domain (String): URL of the page that is trying to steal focus.
tabbrowser-allow-dialogs-to-get-focus =
    .label = Дозволити таким сповіщенням від { $domain } перемикати вас на їхню вкладку

tabbrowser-customizemode-tab-title = Пристосування { -brand-short-name }

## Context menu buttons, of which only one will be visible at a time

tabbrowser-context-mute-tab =
    .label = Вимкнути звук вкладки
    .accesskey = В
tabbrowser-context-unmute-tab =
    .label = Увімкнути звук вкладки
    .accesskey = У
# The accesskey should match the accesskey for tabbrowser-context-mute-tab
tabbrowser-context-mute-selected-tabs =
    .label = Вимкнути звук вкладок
    .accesskey = м
# The accesskey should match the accesskey for tabbrowser-context-unmute-tab
tabbrowser-context-unmute-selected-tabs =
    .label = Увімкнути звук вкладок
    .accesskey = в

# This string is used as an additional tooltip and accessibility description for tabs playing audio
tabbrowser-tab-audio-playing-description = Відтворення аудіо

## Ctrl-Tab dialog

# Variables:
#   $tabCount (Number): The number of tabs in the current browser window. It will always be 2 at least.
tabbrowser-ctrl-tab-list-all-tabs =
    .label =
        { $tabCount ->
            [one] Показати { $tabCount } вкладку
            [few] Показати всі { $tabCount } вкладки
           *[many] Показати всі { $tabCount } вкладок
        }

## Tab manager menu buttons

tabbrowser-manager-mute-tab =
    .tooltiptext = Вимкнути звук вкладки
tabbrowser-manager-unmute-tab =
    .tooltiptext = Увімкнути звук вкладки
tabbrowser-manager-close-tab =
    .tooltiptext = Закрити вкладку
