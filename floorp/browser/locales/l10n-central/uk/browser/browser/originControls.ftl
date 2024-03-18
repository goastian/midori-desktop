# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## These strings appear in Origin Controls for Extensions.  Currently,
## they are visible in the context menu for extension toolbar buttons,
## and are used to inform the user how the extension can access their
## data for the current website, and allow them to control it.

origin-controls-no-access =
    .label = Розширення не може читати й змінювати дані
origin-controls-quarantined =
    .label = Розширенню не дозволено читати та змінювати дані
origin-controls-quarantined-status =
    .label = Розширення не дозволене на обмежуваних сайтах
origin-controls-quarantined-allow =
    .label = Дозволити на обмежуваних сайтах
origin-controls-options =
    .label = Розширення може читати й змінювати дані:
origin-controls-option-all-domains =
    .label = На всіх сайтах
origin-controls-option-when-clicked =
    .label = Лише після натискання
# This string denotes an option that grants the extension access to
# the current site whenever they visit it.
# Variables:
#   $domain (String) - The domain for which the access is granted.
origin-controls-option-always-on =
    .label = Завжди дозволяти на { $domain }

## These strings are used to map Origin Controls states to user-friendly
## messages. They currently appear in the unified extensions panel.

origin-controls-state-no-access = Не може читати й змінювати дані на цьому сайті
origin-controls-state-quarantined = Не дозволено { -vendor-short-name } на цьому сайті
origin-controls-state-always-on = Завжди може читати й змінювати дані на цьому сайті
origin-controls-state-when-clicked = Для читання й зміни даних необхідний дозвіл
origin-controls-state-hover-run-visit-only = Виконати лише для цього відвідування
origin-controls-state-runnable-hover-open = Відкрити розширення
origin-controls-state-runnable-hover-run = Запустити розширення
origin-controls-state-temporary-access = Може читати й змінювати дані для цього відвідування

## Extension's toolbar button.
## Variables:
##   $extensionTitle (String) - Extension name or title message.

origin-controls-toolbar-button =
    .label = { $extensionTitle }
    .tooltiptext = { $extensionTitle }
# Extension's toolbar button when permission is needed.
# Note that the new line is intentionally part of the tooltip.
origin-controls-toolbar-button-permission-needed =
    .label = { $extensionTitle }
    .tooltiptext =
        { $extensionTitle }
        Потрібен дозвіл
# Extension's toolbar button when quarantined.
# Note that the new line is intentionally part of the tooltip.
origin-controls-toolbar-button-quarantined =
    .label = { $extensionTitle }
    .tooltiptext =
        { $extensionTitle }
        Не дозволено { -vendor-short-name } на цьому сайті
