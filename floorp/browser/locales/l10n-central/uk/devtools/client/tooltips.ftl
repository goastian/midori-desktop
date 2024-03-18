# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Localization for Developer Tools tooltips.

learn-more = <span data-l10n-name="link">Докладніше</span>

## In the Rule View when a CSS property cannot be successfully applied we display
## an icon. When this icon is hovered this message is displayed to explain why
## the property is not applied.
## Variables:
##   $property (string) - A CSS property name e.g. "color".
##   $display (string) - A CSS display value e.g. "inline-block".

inactive-css-not-grid-or-flex-container = Властивість <strong>{ $property }</strong> не впливає на цей елемент, тому що він не є контейнером flex чи grid.
inactive-css-not-grid-or-flex-container-or-multicol-container = Властивість <strong>{ $property }</strong> не впливає на цей елемент, тому що він не є контейнером flex, grid, чи multi-column.
inactive-css-not-multicol-container = Властивість <strong>{ $property }</strong> не впливає на цей елемент, тому що він не є контейнером multi-column.
inactive-css-not-grid-or-flex-item = Властивість <strong>{ $property }</strong> не впливає на цей елемент, тому що він не є елементом grid чи flex.
inactive-css-not-grid-item = Властивість <strong>{ $property }</strong> не впливає на цей елемент, тому що він не є елементом grid.
inactive-css-not-grid-container = Властивість <strong>{ $property }</strong> не впливає на цей елемент, тому що він не є контейнером grid.
inactive-css-not-flex-item = Властивість <strong>{ $property }</strong> не впливає на цей елемент, тому що він не є елементом flex.
inactive-css-not-flex-container = Властивість <strong>{ $property }</strong> не впливає на цей елемент, тому що він не є контейнером flex.
inactive-css-not-inline-or-tablecell = Властивість <strong>{ $property }</strong> не впливає на цей елемент, тому що він не є inline чи table-cell елементом.
inactive-css-first-line-pseudo-element-not-supported = Властивість <strong>{ $property }</strong> не підтримується в псевдо-елементах ::first-line.
inactive-css-first-letter-pseudo-element-not-supported = Властивість <strong>{ $property }</strong> не підтримується в псевдо-елементах ::first-letter.
inactive-css-placeholder-pseudo-element-not-supported = Властивість <strong>{ $property }</strong> не підтримується у псевдоелементах ::placeholder.
inactive-css-property-because-of-display = Властивість <strong>{ $property }</strong> не впливає на цей елемент, тому що він має відображення <strong>{ $display }</strong>.
inactive-css-not-display-block-on-floated = Значення <strong>display</strong> було замінено рушієм на <strong>block</strong>, тому що цей елемент <strong>floated</strong>.
inactive-css-property-is-impossible-to-override-in-visited = Неможливо перевизначити властивість <strong>{ $property }</strong>, у зв'язку з обмеженням <strong>:visited</strong>.
inactive-css-position-property-on-unpositioned-box = Властивість <strong>{ $property }</strong> не впливає на цей елемент, тому що це не позиціонований елемент.
inactive-text-overflow-when-no-overflow = Властивість <strong>{ $property }</strong> не впливає на цей елемент, оскільки не встановлено <strong>overflow:hidden</strong>.
inactive-css-not-for-internal-table-elements = Властивість <strong>{ $property }</strong> не впливає на внутрішні елементи таблиці.
inactive-css-not-for-internal-table-elements-except-table-cells = Властивість <strong>{ $property }</strong> не впливає на внутрішні елементи таблиці, окрім комірок таблиці.
inactive-css-not-table = Властивість <strong>{ $property }</strong> не впливає на цей елемент, тому що він не є елементом table.
inactive-css-not-table-cell = Властивість <strong>{ $property }</strong> не впливає на цей елемент, оскільки він не є коміркою таблиці.
inactive-scroll-padding-when-not-scroll-container = Властивість <strong>{ $property }</strong> не впливає на цей елемент, тому що він не прокручується.
inactive-css-border-image = Властивість <strong>{ $property }</strong> не впливає на цей елемент, оскільки його не можна застосувати до внутрішньої таблиці елементів, де для <strong>border-collapse</strong> встановлено <strong>collapse</strong> на елементі таблиці вищого рівня.
inactive-css-ruby-element = Властивість <strong>{ $property }</strong> не впливає на цей елемент, оскільки це елемент ruby. Його розмір визначається розміром шрифту тексту ruby.
inactive-css-highlight-pseudo-elements-not-supported = Властивість <strong>{ $property }</strong> не підтримується для виділення псевдоелементів.
inactive-css-cue-pseudo-element-not-supported = Властивість <strong>{ $property }</strong> не підтримується в псевдо-елементах ::cue.
# Variables:
#   $lineCount (integer) - The number of lines the element has.
inactive-css-text-wrap-balance-lines-exceeded =
    { $lineCount ->
        [one] Властивість <strong>{ $property }</strong> не впливає на цей елемент, тому що він має понад { $lineCount } рядок.
        [few] Властивість <strong>{ $property }</strong> не впливає на цей елемент, тому що він має понад { $lineCount } рядки.
       *[many] Властивість <strong>{ $property }</strong> не впливає на цей елемент, тому що він має понад { $lineCount } рядків.
    }
inactive-css-text-wrap-balance-fragmented = Властивість <strong>{ $property }</strong> не впливає на цей елемент, тому що він фрагментований, тобто його вміст розділений на декілька стовпчиків або сторінок.

## In the Rule View when a CSS property cannot be successfully applied we display
## an icon. When this icon is hovered this message is displayed to explain how
## the problem can be solved.

inactive-css-not-grid-or-flex-container-fix = Спробуйте додати <strong>display:grid</strong> або <strong>display:flex</strong>. { learn-more }
inactive-css-not-grid-or-flex-container-or-multicol-container-fix = Спробуйте додати <strong>display:grid</strong>, <strong>display:flex</strong>, або <strong>columns:2</strong>. { learn-more }
inactive-css-not-multicol-container-fix = Спробуйте додати <strong>column-count</strong> або <strong>column-width</strong>. { learn-more }
inactive-css-not-grid-or-flex-item-fix-3 = Спробуйте додати <strong>display:grid</strong>, <strong>display:flex</strong>, <strong>display:inline-grid</strong>, або <strong>display:inline-flex</strong> до елемента вищого рівня. { learn-more }
inactive-css-not-grid-item-fix-2 = Спробуйте додати <strong>display:grid</strong> або <strong>display:inline-grid</strong> до елемента вищого рівня. { learn-more }
inactive-css-not-grid-container-fix = Спробуйте додати <strong>display:grid</strong> або <strong>display:inline-grid</strong>. { learn-more }
inactive-css-not-flex-item-fix-2 = Спробуйте додати <strong>display:flex</strong> або <strong>display:inline-flex</strong> до елемента вищого рівня. { learn-more }
inactive-css-not-flex-container-fix = Спробуйте додати <strong>display:flex</strong> або <strong>display:inline-flex</strong>. { learn-more }
inactive-css-not-inline-or-tablecell-fix = Спробуйте додати <strong>display:inline</strong> або <strong>display:table-cell</strong>. { learn-more }
inactive-css-non-replaced-inline-or-table-row-or-row-group-fix = Спробуйте додати <strong>display:inline-block</strong> або <strong>display:block</strong>. { learn-more }
inactive-css-non-replaced-inline-or-table-column-or-column-group-fix = Спробуйте додати <strong>display:inline-block</strong>. { learn-more }
inactive-css-not-display-block-on-floated-fix = Спробуйте вилучити <strong>float</strong> або додати <strong>display:block</strong>. { learn-more }
inactive-css-position-property-on-unpositioned-box-fix = Спробуйте налаштувати його властивість <strong>позиції</strong> на щось інше, ніж <strong>static</strong>. { learn-more }
inactive-text-overflow-when-no-overflow-fix = Спробуйте додати <strong>overflow:hidden</strong>. { learn-more }
inactive-css-not-for-internal-table-elements-fix = Спробуйте встановити властивість <strong>display</strong> на щось інше, ніж <strong>table-cell</strong>, <strong>table-column</strong>, <strong>table-row</strong>, <strong>table-column-group</strong>, <strong>table-row-group</strong>, або <strong>table-footer-group</strong>. { learn-more }
inactive-css-not-for-internal-table-elements-except-table-cells-fix = Спробуйте встановити властивість <strong>display</strong> на щось інше, ніж <strong>table-column</strong>, <strong>table-row</strong>, <strong>table-column-group</strong>, <strong>table-row-group</strong>, або <strong>table-footer-group</strong>. { learn-more }
inactive-css-not-table-fix = Спробуйте додати <strong>display:table</strong> або <strong>display:inline-table</strong>. { learn-more }
inactive-css-not-table-cell-fix = Спробуйте додати <strong>display:table-cell</strong>. { learn-more }
inactive-scroll-padding-when-not-scroll-container-fix = Спробуйте додати <strong>overflow:auto</strong>, <strong>overflow:scroll</strong>, або <strong>overflow:hidden</strong>. { learn-more }
inactive-css-border-image-fix = На елементі таблиці вищого рівня вилучіть властивість або змініть значення для <strong>border-collapse</strong> на інше, ніж <strong>collapse</strong>. { learn-more }
inactive-css-ruby-element-fix = Спробуйте змінити <strong>font-size</strong> тексту ruby. { learn-more }
inactive-css-text-wrap-balance-lines-exceeded-fix = Спробуйте зменшити кількість рядків. { learn-more }
inactive-css-text-wrap-balance-fragmented-fix = Уникайте розділення вмісту елемента, наприклад, видаливши стовпчики або використавши <strong>page-break-inside:avoid</strong>. { learn-more }

## In the Rule View when a CSS property may have compatibility issues with other browsers
## we display an icon. When this icon is hovered this message is displayed to explain why
## the property is incompatible and the platforms it is incompatible on.
## Variables:
##   $property (string) - A CSS declaration name e.g. "-moz-user-select" that can be a platform specific alias.
##   $rootProperty (string) - A raw CSS property name e.g. "user-select" that is not a platform specific alias.

css-compatibility-default-message = Властивість <strong>{ $property }</strong> не підтримується такими браузерами:
css-compatibility-deprecated-experimental-message = Властивість <strong>{ $property }</strong> була експериментальною властивістю, яка тепер застаріла за стандартами W3C. Не підтримується такими браузерами:
css-compatibility-deprecated-experimental-supported-message = Властивість <strong>{ $property }</strong> була експериментальною, яка тепер застаріла за стандартами W3C.
css-compatibility-deprecated-message = Властивість <strong>{ $property }</strong> застаріла за стандартами W3C. Не підтримується такими браузерами:
css-compatibility-deprecated-supported-message = Властивість <strong>{ $property }</strong> застаріла за стандартами W3C.
css-compatibility-experimental-message = Властивість <strong>{ $property }</strong> є експериментальною. Не підтримується такими браузерами:
css-compatibility-experimental-supported-message = Властивість <strong>{ $property }</strong> є експериментальною.
css-compatibility-learn-more-message = <span data-l10n-name="link">Докладніше</span> про <strong>{ $rootProperty }</strong>
