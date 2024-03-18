# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

tab-context-new-tab =
    .label = Нова вкладка
    .accesskey = Н
reload-tab =
    .label = Оновити вкладку
    .accesskey = О
select-all-tabs =
    .label = Обрати всі вкладки
    .accesskey = О
tab-context-play-tab =
    .label = Відтворити вкладку
    .accesskey = т
tab-context-play-tabs =
    .label = Відтворити вкладки
    .accesskey = т
duplicate-tab =
    .label = Дублювати вкладку
    .accesskey = ю
duplicate-tabs =
    .label = Дублювати вкладки
    .accesskey = ю
# The following string is displayed on a menuitem that will close the tabs from the start of the tabstrip to the currently targeted tab (excluding the currently targeted and any other selected tabs).
# In left-to-right languages this should use "Left" and in right-to-left languages this should use "Right".
close-tabs-to-the-start =
    .label = Закрити вкладки ліворуч
    .accesskey = і
# The following string is displayed on a menuitem that will close the tabs from the end of the tabstrip to the currently targeted tab (excluding the currently targeted and any other selected tabs).
# In left-to-right languages this should use "Right" and in right-to-left languages this should use "Left".
close-tabs-to-the-end =
    .label = Закрити вкладки праворуч
    .accesskey = п
close-other-tabs =
    .label = Закрити інші вкладки
    .accesskey = З
reload-tabs =
    .label = Оновити вкладки
    .accesskey = н
pin-tab =
    .label = Прикріпити вкладку
    .accesskey = П
unpin-tab =
    .label = Відкріпити вкладку
    .accesskey = В
pin-selected-tabs =
    .label = Прикріпити вкладки
    .accesskey = П
unpin-selected-tabs =
    .label = Відкріпити вкладки
    .accesskey = В
bookmark-selected-tabs =
    .label = Додати закладки вкладок…
    .accesskey = к
tab-context-bookmark-tab =
    .label = Додати вкладку до закладок
    .accesskey = и
tab-context-open-in-new-container-tab =
    .label = Відкрити в новій вкладці контейнера
    .accesskey = й
move-to-start =
    .label = Перемістити на початок
    .accesskey = ч
move-to-end =
    .label = Перемістити в кінець
    .accesskey = е
move-to-new-window =
    .label = Перенести в нове вікно
    .accesskey = е
tab-context-close-multiple-tabs =
    .label = Закрити кілька вкладок
    .accesskey = к
tab-context-share-url =
    .label = Поділитися
    .accesskey = я

## Variables:
##  $tabCount (Number): the number of tabs that are affected by the action.

tab-context-reopen-closed-tabs =
    .label =
        { $tabCount ->
            [one] Відновити закриту вкладку
            [few] Відновити { $tabCount } закриті вкладки
           *[many] Відновити { $tabCount } закритих вкладок
        }
    .accesskey = і
tab-context-close-n-tabs =
    .label =
        { $tabCount ->
            [one] Закрити вкладку
            [few] Закрити { $tabCount } вкладки
           *[many] Закрити { $tabCount } вкладок
        }
    .accesskey = к
tab-context-move-tabs =
    .label =
        { $tabCount ->
            [one] Перемістити вкладку
            [few] Перемістити { $tabCount } вкладки
           *[many] Перемістити { $tabCount } вкладок
        }
    .accesskey = м

tab-context-send-tabs-to-device =
    .label =
        { $tabCount ->
            [one] Надіслати вкладку на пристрій
            [few] Надіслати { $tabCount } вкладки на пристрій
           *[many] Надіслати { $tabCount } вкладок на пристрій
        }
    .accesskey = с
