# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

migration-wizard-selection-header = Імпорт даних браузера
migration-wizard-selection-list = Виберіть дані, які потрібно імпортувати.
# Shown in the new migration wizard's dropdown selector for choosing the browser
# to import from. This variant is shown when the selected browser doesn't support
# user profiles, and so we only show the browser name.
#
# Variables:
#  $sourceBrowser (String): the name of the browser to import from.
migration-wizard-selection-option-without-profile = { $sourceBrowser }
# Shown in the new migration wizard's dropdown selector for choosing the browser
# and user profile to import from. This variant is shown when the selected browser
# supports user profiles.
#
# Variables:
#  $sourceBrowser (String): the name of the browser to import from.
#  $profileName (String): the name of the user profile to import from.
migration-wizard-selection-option-with-profile = { $sourceBrowser } — { $profileName }

# Each migrator is expected to include a display name string, and that display
# name string should have a key with "migration-wizard-migrator-display-name-"
# as a prefix followed by the unique identification key for the migrator.

migration-wizard-migrator-display-name-brave = Brave
migration-wizard-migrator-display-name-canary = Chrome Canary
migration-wizard-migrator-display-name-chrome = Chrome
migration-wizard-migrator-display-name-chrome-beta = Chrome Beta
migration-wizard-migrator-display-name-chrome-dev = Chrome Dev
migration-wizard-migrator-display-name-chromium = Chromium
migration-wizard-migrator-display-name-chromium-360se = 360 Secure Browser
migration-wizard-migrator-display-name-chromium-edge = Microsoft Edge
migration-wizard-migrator-display-name-chromium-edge-beta = Microsoft Edge Beta
migration-wizard-migrator-display-name-edge-legacy = Microsoft Edge (застарілий)
migration-wizard-migrator-display-name-firefox = Firefox
migration-wizard-migrator-display-name-file-password-csv = Паролі з файлу CSV
migration-wizard-migrator-display-name-file-bookmarks = Закладки з файлу HTML
migration-wizard-migrator-display-name-ie = Microsoft Internet Explorer
migration-wizard-migrator-display-name-opera = Opera
migration-wizard-migrator-display-name-opera-gx = Opera GX
migration-wizard-migrator-display-name-safari = Safari
migration-wizard-migrator-display-name-vivaldi = Vivaldi

## These strings are shown if the selected browser data directory is unreadable.
## In practice, this tends to only occur on Linux when Firefox
## is installed as a Snap.

migration-no-permissions-message = { -brand-short-name } не має доступу до інших профілів браузера, встановленого на цьому пристрої.
migration-no-permissions-instructions = Щоб продовжити імпорт даних з іншого браузера, надайте { -brand-short-name } доступ до теки його профілів.
migration-no-permissions-instructions-step1 = Виберіть “Продовжити”
# The second step in getting permissions to read data for the selected
# browser type.
#
# Variables:
#  $permissionsPath (String): the file system path that the user will need to grant read permission to.
migration-no-permissions-instructions-step2 = У засобі вибору файлів перейдіть до <code>{ $permissionsPath }</code> і натисніть «Вибрати»

## These strings will be displayed based on how many resources are selected to import

migration-all-available-data-label = Імпортувати всі доступні дані
migration-no-selected-data-label = Дані для імпорту не вибрано
migration-selected-data-label = Імпортувати вибрані дані

##

migration-select-all-option-label = Вибрати все
migration-bookmarks-option-label = Закладки
# Favorites is used for Bookmarks when importing from Internet Explorer or
# Edge, as this is the terminology for bookmarks on those browsers.
migration-favorites-option-label = Обране
migration-logins-and-passwords-option-label = Збережені паролі
migration-history-option-label = Історія перегляду
migration-extensions-option-label = Розширення
migration-form-autofill-option-label = Дані автозаповнення форм
migration-payment-methods-option-label = Способи оплати
migration-cookies-option-label = Куки
migration-session-option-label = Вікна та вкладки
migration-otherdata-option-label = Інші дані
migration-passwords-from-file-progress-header = Імпортувати паролі з файлу
migration-passwords-from-file-success-header = Паролі успішно імпортовано
migration-passwords-from-file = Перевірка файлу на наявність паролів
migration-passwords-new = Нові паролі
migration-passwords-updated = Наявні паролі
migration-passwords-from-file-no-valid-data = Файл не містить даних про паролі. Виберіть інший файл.
migration-passwords-from-file-picker-title = Імпортувати файл з паролями
# A description for the .csv file format that may be shown as the file type
# filter by the operating system.
migration-passwords-from-file-csv-filter-title =
    { PLATFORM() ->
        [macos] Документ CSV
       *[other] Файл CSV
    }
# A description for the .tsv file format that may be shown as the file type
# filter by the operating system. TSV is short for 'tab separated values'.
migration-passwords-from-file-tsv-filter-title =
    { PLATFORM() ->
        [macos] Документ TSV
       *[other] Файл TSV
    }
# Shown in the migration wizard after importing passwords from a file
# has completed, if new passwords were added.
#
# Variables:
#  $newEntries (Number): the number of new successfully imported passwords
migration-wizard-progress-success-new-passwords =
    { $newEntries ->
        [one] Додано { $newEntries }
        [few] Додано { $newEntries }
       *[many] Додано { $newEntries }
    }
# Shown in the migration wizard after importing passwords from a file
# has completed, if existing passwords were updated.
#
# Variables:
#  $updatedEntries (Number): the number of updated passwords
migration-wizard-progress-success-updated-passwords =
    { $updatedEntries ->
        [one] Оновлено { $updatedEntries }
        [few] Оновлено { $updatedEntries }
       *[many] Оновлено { $updatedEntries }
    }
migration-bookmarks-from-file-picker-title = Імпортувати файл закладок
migration-bookmarks-from-file-progress-header = Імпортування закладок
migration-bookmarks-from-file = Закладки
migration-bookmarks-from-file-success-header = Закладки успішно імпортовано
migration-bookmarks-from-file-no-valid-data = Файл не містить даних закладок. Виберіть інший файл.
# A description for the .html file format that may be shown as the file type
# filter by the operating system.
migration-bookmarks-from-file-html-filter-title =
    { PLATFORM() ->
        [macos] HTML-документ
       *[other] HTML-файл
    }
# A description for the .json file format that may be shown as the file type
# filter by the operating system.
migration-bookmarks-from-file-json-filter-title = Файл JSON
# Shown in the migration wizard after importing bookmarks from a file
# has completed.
#
# Variables:
#  $newEntries (Number): the number of imported bookmarks.
migration-wizard-progress-success-new-bookmarks =
    { $newEntries ->
        [one] { $newEntries } закладка
        [few] { $newEntries } закладки
       *[many] { $newEntries } закладок
    }
migration-import-button-label = Імпорт
migration-choose-to-import-from-file-button-label = Імпортувати з файлу
migration-import-from-file-button-label = Вибрати файл
migration-cancel-button-label = Скасувати
migration-done-button-label = Готово
migration-continue-button-label = Продовжити
migration-wizard-import-browser-no-browsers = { -brand-short-name } не зміг знайти програми, які містять закладки, історію чи паролі.
migration-wizard-import-browser-no-resources = Сталася помилка. { -brand-short-name } не зміг знайти дані для імпорту з цього профілю браузера.

## These strings will be used to create a dynamic list of items that can be
## imported. The list will be created using Intl.ListFormat(), so it will
## follow each locale's rules, and the first item will be capitalized by code.
## When applicable, the resources should be in their plural form.
## For example, a possible list could be "Bookmarks, passwords and autofill data".

migration-list-bookmark-label = закладки
# “favorites” refers to bookmarks in Edge and Internet Explorer. Use the same terminology
# if the browser is available in your language.
migration-list-favorites-label = обране
migration-list-password-label = паролі
migration-list-history-label = історія
migration-list-extensions-label = розширення
migration-list-autofill-label = дані автозаповнення
migration-list-payment-methods-label = способи оплати

##

migration-wizard-progress-header = Імпортування даних
# This header appears in the final page of the migration wizard only if
# all resources were imported successfully.
migration-wizard-progress-done-header = Дані успішно імпортовано
# This header appears in the final page of the migration wizard if only
# some of the resources were imported successfully. This is meant to be
# distinct from migration-wizard-progress-done-header, which is only shown
# if all resources were imported successfully.
migration-wizard-progress-done-with-warnings-header = Імпорт даних завершено
migration-wizard-progress-icon-in-progress =
    .aria-label = Імпортування…
migration-wizard-progress-icon-completed =
    .aria-label = Завершено
migration-safari-password-import-header = Імпорт паролів із Safari
migration-safari-password-import-steps-header = Щоб імпортувати паролі з Safari:
migration-safari-password-import-step1 = У Safari відкрийте меню “Safari” та перейдіть до Параметри > Паролі.
migration-safari-password-import-step2 = Натисніть кнопку <img data-l10n-name="safari-icon-3dots"/> і виберіть “Експортувати всі паролі”
migration-safari-password-import-step3 = Збережіть файл з паролями
migration-safari-password-import-step4 = Натисніть “Вибрати файл” нижче, щоб вибрати збережений файл з паролями
migration-safari-password-import-skip-button = Пропустити
migration-safari-password-import-select-button = Вибрати файл
# Shown in the migration wizard after importing bookmarks from another
# browser has completed.
#
# Variables:
#  $quantity (Number): the number of successfully imported bookmarks
migration-wizard-progress-success-bookmarks =
    { $quantity ->
        [one] { $quantity } закладка
        [few] { $quantity } закладки
       *[many] { $quantity } закладок
    }
# Shown in the migration wizard after importing bookmarks from either
# Internet Explorer or Edge.
#
# Use the same terminology if the browser is available in your language.
#
# Variables:
#  $quantity (Number): the number of successfully imported bookmarks
migration-wizard-progress-success-favorites =
    { $quantity ->
        [one] { $quantity } обране
        [few] { $quantity } обрані
       *[many] { $quantity } обраних
    }

## The import process identifies extensions installed in other supported
## browsers and installs the corresponding (matching) extensions compatible
## with Firefox, if available.

# Shown in the migration wizard after importing all matched extensions
# from supported browsers.
#
# Variables:
#   $quantity (Number): the number of successfully imported extensions
migration-wizard-progress-success-extensions =
    { $quantity ->
        [one] { $quantity } розширення
        [few] { $quantity } розширення
       *[many] { $quantity } розширень
    }
# Shown in the migration wizard after importing a partial amount of
# matched extensions from supported browsers.
#
# Variables:
#   $matched (Number): the number of matched imported extensions
#   $quantity (Number): the number of total extensions found during import
migration-wizard-progress-partial-success-extensions = { $matched } із { $quantity } розширень
migration-wizard-progress-extensions-support-link = Дізнайтеся, як { -brand-product-name } знаходить відповідні розширення
# Shown in the migration wizard if there are no matched extensions
# on import from supported browsers.
migration-wizard-progress-no-matched-extensions = Немає відповідних розширень
migration-wizard-progress-extensions-addons-link = Перегляньте розширення для { -brand-short-name }

##

# Shown in the migration wizard after importing passwords from another
# browser has completed.
#
# Variables:
#  $quantity (Number): the number of successfully imported passwords
migration-wizard-progress-success-passwords =
    { $quantity ->
        [one] { $quantity } пароль
        [few] { $quantity } паролі
       *[many] { $quantity } паролів
    }
# Shown in the migration wizard after importing history from another
# browser has completed.
#
# Variables:
#  $maxAgeInDays (Number): the maximum number of days of history that might be imported.
migration-wizard-progress-success-history =
    { $maxAgeInDays ->
        [one] За останній день
        [few] За останні { $maxAgeInDays } дні
       *[many] За останні { $maxAgeInDays } днів
    }
migration-wizard-progress-success-formdata = Історія форм
# Shown in the migration wizard after importing payment methods from another
# browser has completed.
#
# Variables:
#  $quantity (Number): the number of successfully imported payment methods
migration-wizard-progress-success-payment-methods =
    { $quantity ->
        [one] { $quantity } спосіб оплати
        [few] { $quantity } способи оплати
       *[many] { $quantity } способів оплати
    }
migration-wizard-safari-permissions-sub-header = Щоб імпортувати закладки з Safari та історію перегляду:
migration-wizard-safari-instructions-continue = Виберіть “Продовжити”
migration-wizard-safari-instructions-folder = Виберіть теку Safari у списку та виберіть “Відкрити”
