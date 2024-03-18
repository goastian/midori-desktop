# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.

places-open =
    .label = Відкрити
    .accesskey = В
places-open-in-tab =
    .label = Відкрити в новій вкладці
    .accesskey = н
places-open-in-container-tab =
    .label = Відкрити в новій вкладці контейнера
    .accesskey = в
places-open-all-bookmarks =
    .label = Відкрити всі закладки
    .accesskey = с
places-open-all-in-tabs =
    .label = Відкрити все у вкладках
    .accesskey = і
places-open-in-window =
    .label = Відкрити в новому вікні
    .accesskey = о
places-open-in-private-window =
    .label = Відкрити в приватному вікні
    .accesskey = п
places-empty-bookmarks-folder =
    .label = (Порожньо)
places-add-bookmark =
    .label = Додати закладку…
    .accesskey = з
places-add-folder-contextmenu =
    .label = Додати теку…
    .accesskey = е
places-add-folder =
    .label = Додати теку…
    .accesskey = е
places-add-separator =
    .label = Додати роздільник
    .accesskey = ь
places-view =
    .label = Перегляд
    .accesskey = е
places-by-date =
    .label = За датою
    .accesskey = т
places-by-site =
    .label = За сайтом
    .accesskey = с
places-by-most-visited =
    .label = За частотою відвідування
    .accesskey = ч
places-by-last-visited =
    .label = За останнім відвідуванням
    .accesskey = о
places-by-day-and-site =
    .label = За датою і сайтом
    .accesskey = й
places-history-search =
    .placeholder = Шукати в історії
places-history =
    .aria-label = Історія
places-bookmarks-search =
    .placeholder = Шукати закладки
places-delete-domain-data =
    .label = Забути про цей сайт
    .accesskey = З
places-sortby-name =
    .label = Впорядкувати за назвою
    .accesskey = н
# places-edit-bookmark and places-edit-generic will show one or the other and can have the same access key.
places-edit-bookmark =
    .label = Редагувати закладку…
    .accesskey = г
places-edit-generic =
    .label = Редагувати…
    .accesskey = г
places-edit-folder2 =
    .label = Редагувати теку…
    .accesskey = г
# Variables
#   $count (number) - Number of folders to delete
places-delete-folder =
    .label =
        { $count ->
            [one] Видалити теку
            [few] Видалити теки
           *[many] Видалити теки
        }
    .accesskey = л
# Variables:
#   $count (number) - The number of pages selected for removal.
places-delete-page =
    .label =
        { $count ->
            [1] Видалити сторінку
           *[other] Видалити сторінки
        }
    .accesskey = В
# Managed bookmarks are created by an administrator and cannot be changed by the user.
managed-bookmarks =
    .label = Керовані закладки
# This label is used when a managed bookmarks folder doesn't have a name.
managed-bookmarks-subfolder =
    .label = Підтека
# This label is used for the "Other Bookmarks" folder that appears in the bookmarks toolbar.
other-bookmarks-folder =
    .label = Інші закладки
places-show-in-folder =
    .label = Показати у теці
    .accesskey = т
# Variables:
# $count (number) - The number of elements being selected for removal.
places-delete-bookmark =
    .label =
        { $count ->
            [one] Видалити закладку
            [few] Видалити закладки
           *[many] Видалити закладки
        }
    .accesskey = з
# Variables:
#   $count (number) - The number of bookmarks being added.
places-create-bookmark =
    .label =
        { $count ->
            [1] Додати сторінку до закладок…
           *[other] Додати сторінки до закладок…
        }
    .accesskey = з
places-untag-bookmark =
    .label = Вилучити мітку
    .accesskey = ч
places-manage-bookmarks =
    .label = Керувати закладками
    .accesskey = К
places-forget-about-this-site-confirmation-title = Забути цей сайт
# Variables:
# $hostOrBaseDomain (string) - The base domain (or host in case there is no base domain) for which data is being removed
places-forget-about-this-site-confirmation-msg = Ця дія вилучить дані, пов'язані з { $hostOrBaseDomain }, включно з історією, куками, кешем і налаштуваннями вмісту. Пов'язані закладки та паролі не буде вилучено. Ви дійсно хочете продовжити?
places-forget-about-this-site-forget = Забути
places-library3 =
    .title = Бібліотека
places-organize-button =
    .label = Керування
    .tooltiptext = Керування закладками
    .accesskey = К
places-organize-button-mac =
    .label = Керування
    .tooltiptext = Керування закладками
places-file-close =
    .label = Закрити
    .accesskey = к
places-cmd-close =
    .key = w
places-view-button =
    .label = Вигляд
    .tooltiptext = Зміна вигляду
    .accesskey = В
places-view-button-mac =
    .label = Вигляд
    .tooltiptext = Зміна вигляду
places-view-menu-columns =
    .label = Показати стовпчики
    .accesskey = к
places-view-menu-sort =
    .label = Впорядкувати
    .accesskey = п
places-view-sort-unsorted =
    .label = Без впорядкування
    .accesskey = Б
places-view-sort-ascending =
    .label = За зростанням
    .accesskey = з
places-view-sort-descending =
    .label = За спаданням
    .accesskey = с
places-maintenance-button =
    .label = Імпорт і резервні копії
    .tooltiptext = Імпорт і резервне копіювання закладок
    .accesskey = І
places-maintenance-button-mac =
    .label = Імпорт і резервні копії
    .tooltiptext = Імпорт і резервне копіювання закладок
places-cmd-backup =
    .label = Створити резервну копію…
    .accesskey = С
places-cmd-restore =
    .label = Відновити
    .accesskey = В
places-cmd-restore-from-file =
    .label = Вибрати файл…
    .accesskey = ф
places-import-bookmarks-from-html =
    .label = Імпорт закладок з HTML…
    .accesskey = І
places-export-bookmarks-to-html =
    .label = Експорт закладок в HTML…
    .accesskey = Е
places-import-other-browser =
    .label = Імпортувати дані з іншого браузера…
    .accesskey = п
places-view-sort-col-name =
    .label = Назва
places-view-sort-col-tags =
    .label = Мітки
places-view-sort-col-url =
    .label = Адреса
places-view-sort-col-most-recent-visit =
    .label = Останнє відвідування
places-view-sort-col-visit-count =
    .label = Відвідувань
places-view-sort-col-date-added =
    .label = Додано
places-view-sort-col-last-modified =
    .label = Остання зміна
places-view-sortby-name =
    .label = Впорядкувати за назвою
    .accesskey = н
places-view-sortby-url =
    .label = Впорядкувати за адресою
    .accesskey = з
places-view-sortby-date =
    .label = Впорядкувати за останнім відвідуванням
    .accesskey = в
places-view-sortby-visit-count =
    .label = Впорядкувати за кількістю відвідувань
    .accesskey = к
places-view-sortby-date-added =
    .label = Впорядкувати за часом додавання
    .accesskey = ч
places-view-sortby-last-modified =
    .label = Впорядкувати за останньою зміною
    .accesskey = ю
places-view-sortby-tags =
    .label = Впорядкувати за мітками
    .accesskey = т
places-cmd-find-key =
    .key = f
places-back-button =
    .tooltiptext = Назад
places-forward-button =
    .tooltiptext = Перейти вперед
places-details-pane-select-an-item-description = Додати елемент до перегляду та редагувати його властивості
places-details-pane-no-items =
    .value = Жодного елементу
# Variables:
#   $count (Number): number of items
places-details-pane-items-count =
    .value =
        { $count ->
            [one] Один елемент
            [few] { $count } елемента
           *[many] { $count } елементів
        }

## Strings used as a placeholder in the Library search field. For example,
## "Search History" stands for "Search through the browser's history".

places-search-bookmarks =
    .placeholder = Шукати в закладках
places-search-history =
    .placeholder = Шукати в історії
places-search-downloads =
    .placeholder = Шукати в завантаженнях

##

places-locked-prompt = Система закладок та історії не функціонує через те, що один з файлiв { -brand-short-name } використовується іншою програмою. Дії деяких захисних програм (скажімо, антивірусів) можуть бути причиною.
