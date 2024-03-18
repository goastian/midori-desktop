# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

printui-title = Друк
# Dialog title to prompt the user for a filename to save print to PDF.
printui-save-to-pdf-title = Зберегти як

# Variables
# $sheetCount (integer) - Number of paper sheets
printui-sheets-count =
    { $sheetCount ->
        [one] { $sheetCount } аркуш паперу
        [few] { $sheetCount } аркуші паперу
       *[many] { $sheetCount } аркушів паперу
    }

printui-page-range-all = Усі
printui-page-range-current = Поточний
printui-page-range-odd = Непарні
printui-page-range-even = Парні
printui-page-range-custom = Вибірково
printui-page-range-label = Сторінки
printui-page-range-picker =
    .aria-label = Вибір діапазону сторінок
printui-page-custom-range-input =
    .aria-label = Введіть власний діапазон сторінок
    .placeholder = наприклад, 2-6, 9, 12-16

# Section title for the number of copies to print
printui-copies-label = Копії

printui-orientation = Орієнтація
printui-landscape = Альбомна
printui-portrait = Книжкова

# Section title for the printer or destination device to target
printui-destination-label = Пристрій
printui-destination-pdf-label = Зберегти до PDF

printui-more-settings = Ще налаштування
printui-less-settings = Згорнути налаштування

printui-paper-size-label = Розмір паперу

# Section title (noun) for the print scaling options
printui-scale = Масштаб
printui-scale-fit-to-page-width = Заповнити по ширині аркуша
# Label for input control where user can set the scale percentage
printui-scale-pcent = Масштаб

# Section title (noun) for the two-sided print options
printui-two-sided-printing = Двосторонній друк
printui-two-sided-printing-off = Вимкнено
# Flip the sheet as if it were bound along its long edge.
printui-two-sided-printing-long-edge = Перевернути на довгий край
# Flip the sheet as if it were bound along its short edge.
printui-two-sided-printing-short-edge = Перевернути на короткий край

# Section title for miscellaneous print options
printui-options = Параметри
printui-headers-footers-checkbox = Друкувати колонтитули
printui-backgrounds-checkbox = Друкувати тло

## The "Format" section, select a version of the website to print. Radio
## options to select between the original page, selected text only, or a version
## where the page is processed with "Reader View".

# The section title.
printui-source-label = Формат
# Option for printing the original page.
printui-source-radio = Оригінал
# Option for printing just the content a user selected prior to printing.
printui-selection-radio = Вибраний фрагмент
# Option for "simplifying" the page by printing the Reader View version.
printui-simplify-page-radio = Спрощений

##

printui-color-mode-label = Кольоровий режим
printui-color-mode-color = Кольоровий
printui-color-mode-bw = Чорно-білий

printui-margins = Поля
printui-margins-default = Типово
printui-margins-min = Якнайменше
printui-margins-none = Немає
printui-margins-custom-inches = Власне (дюймів)
printui-margins-custom-mm = Власне (мм)
printui-margins-custom-top = Вгорі
printui-margins-custom-top-inches = Вгорі (дюймів)
printui-margins-custom-top-mm = Вгорі (мм)
printui-margins-custom-bottom = Внизу
printui-margins-custom-bottom-inches = Внизу (дюймів)
printui-margins-custom-bottom-mm = Внизу (мм)
printui-margins-custom-left = Ліворуч
printui-margins-custom-left-inches = Ліворуч (дюймів)
printui-margins-custom-left-mm = Ліворуч (мм)
printui-margins-custom-right = Праворуч
printui-margins-custom-right-inches = Праворуч (дюймів)
printui-margins-custom-right-mm = Праворуч (мм)

printui-system-dialog-link = Друк за допомогою засобу системи…

printui-primary-button = Надрукувати
printui-primary-button-save = Зберегти
printui-cancel-button = Скасувати
printui-close-button = Закрити

printui-loading = Підготовка до попереднього перегляду

# Reported by screen readers and other accessibility tools to indicate that
# the print preview has focus.
printui-preview-label =
    .aria-label = Попередній перегляд

printui-pages-per-sheet = Сторінок на аркуші

# This is shown next to the Print button with an indefinite loading spinner
# when the user prints a page and it is being sent to the printer.
printui-print-progress-indicator = Друк…
printui-print-progress-indicator-saving = Збереження…

## Paper sizes that may be supported by the Save to PDF destination:

printui-paper-a5 = A5
printui-paper-a4 = A4
printui-paper-a3 = A3
printui-paper-a2 = A2
printui-paper-a1 = A1
printui-paper-a0 = A0
printui-paper-b5 = B5
printui-paper-b4 = B4
printui-paper-jis-b5 = JIS-B5
printui-paper-jis-b4 = JIS-B4
printui-paper-letter = US Letter
printui-paper-legal = US Legal
printui-paper-tabloid = Tabloid

## Error messages shown when a user has an invalid input

printui-error-invalid-scale = Масштаб повинен бути числом від 10 до 200.
printui-error-invalid-margin = Введіть дійсне значення поля для вибраного формату паперу.
printui-error-invalid-copies = Копії повинні бути числом від 1 до 10000.

# Variables
# $numPages (integer) - Number of pages
printui-error-invalid-range = Діапазон повинен бути числом від 1 до { $numPages }.
printui-error-invalid-start-overflow = Номер сторінки “від” повинен бути меншим, ніж номер сторінки “до”.
