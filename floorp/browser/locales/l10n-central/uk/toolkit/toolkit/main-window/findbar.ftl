# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### This file contains the entities needed to use the Find Bar.

findbar-next =
    .tooltiptext = Знайти наступне входження фрази
findbar-previous =
    .tooltiptext = Знайти попереднє входження фрази

findbar-find-button-close =
    .tooltiptext = Закрити панель пошуку

findbar-highlight-all2 =
    .label = Підсвітити все
    .accesskey =
        { PLATFORM() ->
            [macos] с
           *[other] с
        }
    .tooltiptext = Підсвітити всі збіги фрази

findbar-case-sensitive =
    .label = З урахуванням регістру
    .accesskey = р
    .tooltiptext = Шукати з урахуванням регістру

findbar-match-diacritics =
    .label = Відповідність діакритичних знаків
    .accesskey = к
    .tooltiptext = Розрізняти літери з апострофом і їхні основні літери (наприклад, при пошуку "resume", "résumé" не береться до уваги)

findbar-entire-word =
    .label = Цілі слова
    .accesskey = Ц
    .tooltiptext = Шукати лише цілі слова

findbar-not-found = Фразу не знайдено

findbar-wrapped-to-top = Досягнуто кінця сторінки, продовжено з початку
findbar-wrapped-to-bottom = Досягнуто початку сторінки, продовжено з кінця

findbar-normal-find =
    .placeholder = Знайти на сторінці
findbar-fast-find =
    .placeholder = Швидкий пошук
findbar-fast-find-links =
    .placeholder = Швидкий пошук (лише посилання)

findbar-case-sensitive-status =
    .value = (З урахуванням регістру)
findbar-match-diacritics-status =
    .value = (Відповідність діакритичних знаків)
findbar-entire-word-status =
    .value = (лише цілі слова)

# Variables:
#   $current (Number): Index of the currently selected match
#   $total (Number): Total count of matches
findbar-found-matches =
    .value =
        { $total ->
            [one] { $current } із { $total } входження
            [few] { $current } із { $total } входжень
           *[many] { $current } із { $total } входжень
        }

# Variables:
#   $limit (Number): Total count of matches allowed before counting stops
findbar-found-matches-count-limit =
    .value =
        { $limit ->
            [one] Більше ніж { $limit } входження
            [few] Більше ніж { $limit } входження
           *[many] Більше ніж { $limit } входжень
        }
