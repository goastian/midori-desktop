# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
# NOTE: New strings should use the about-logins- prefix.

about-logins-page-title = Паролі
about-logins-login-filter =
    .placeholder = Шукати паролі
    .key = F
create-new-login-button =
    .title = Створити новий запис
fxaccounts-sign-in-text = Отримайте доступ до своїх паролів на інших пристроях
fxaccounts-sign-in-sync-button = Увійти до синхронізації
fxaccounts-avatar-button =
    .title = Керувати обліковим записом

## The ⋯ menu that is in the top corner of the page

menu =
    .title = Відкрити меню
# This menuitem is only visible on Windows and macOS
about-logins-menu-menuitem-import-from-another-browser = Імпортувати з іншого браузера…
about-logins-menu-menuitem-import-from-a-file = Імпортувати з файлу…
about-logins-menu-menuitem-export-logins = Експортувати паролі…
about-logins-menu-menuitem-remove-all-logins = Видалити всі паролі…
menu-menuitem-preferences =
    { PLATFORM() ->
        [windows] Налаштування
       *[other] Налаштування
    }
about-logins-menu-menuitem-help = Допомога

## Login List

login-list =
    .aria-label = Паролі, що відповідають пошуковому запиту
# Variables
#   $count (number) - Number of logins
login-list-count =
    { $count ->
        [one] { $count } запис
        [few] { $count } записи
       *[many] { $count } записів
    }
# Variables
#   $count (number) - Number of filtered logins
#   $total (number) - Total number of logins
login-list-filtered-count =
    { $total ->
        [one] { $count } запис входу з { $total }
        [few] { $count } записи входу з { $total }
        [many] { $count } записів входу з { $total }
       *[other] { $count } записів входу з { $total }
    }
login-list-sort-label-text = Сортувати:
login-list-name-option = Ім'я (А-Я)
login-list-name-reverse-option = Назва (Я-А)
login-list-username-option = Ім'я користувача (А-Я)
login-list-username-reverse-option = Ім'я користувача (Я-А)
about-logins-login-list-alerts-option = Попередження
login-list-last-changed-option = Змінено
login-list-last-used-option = Використано
login-list-intro-title = Паролів не знайдено
login-list-intro-description = Коли ви зберігаєте пароль в { -brand-product-name }, він з'являтиметься тут.
about-logins-login-list-empty-search-title = Паролів не знайдено
about-logins-login-list-empty-search-description = Немає результатів, які відповідають вашому пошуку.
login-list-item-title-new-login = Новий запис
login-list-item-subtitle-new-login = Введіть облікові дані
login-list-item-subtitle-missing-username = (без імені користувача)
about-logins-list-item-breach-icon =
    .title = Зламаний вебсайт
about-logins-list-item-vulnerable-password-icon =
    .title = Ненадійний пароль
about-logins-list-section-breach = Вебсайти з витоками
about-logins-list-section-vulnerable = Вразливі паролі
about-logins-list-section-nothing = Без попередження
about-logins-list-section-today = Сьогодні
about-logins-list-section-yesterday = Вчора
about-logins-list-section-week = Останні 7 днів

## Introduction screen

about-logins-login-intro-heading-logged-out2 = Шукаєте збережені паролі? Увімкніть синхронізацію або імпортуйте їх.
about-logins-login-intro-heading-logged-in = Не знайдено синхронізованих паролів.
login-intro-description = Якщо ви зберегли паролі в { -brand-product-name } на іншому пристрої, ось як отримати їх тут:
login-intro-instructions-fxa = Зареєструйтеся чи увійдіть до свого { -fxaccount-brand-name(case: "gen") } на пристрої, де збережено ваші паролі
login-intro-instructions-fxa2 = Зареєструйтеся чи ввійдіть до облікового запису на пристрої, де збережено паролі.
login-intro-instructions-fxa-settings = Перейдіть до Налаштування > Синхронізація > Увімкнути синхронізацію… Позначте паролі.
login-intro-instructions-fxa-passwords-help = Перейдіть до <a data-l10n-name="passwords-help-link">підтримки щодо паролів</a>, щоб отримати допомогу.
about-logins-intro-browser-only-import = Якщо ваші паролі збережено в іншому браузері, ви можете <a data-l10n-name="import-link">імпортувати їх у { -brand-product-name }</a>
about-logins-intro-import2 = Якщо ваші паролі зберігаються не в { -brand-product-name }, ви можете <a data-l10n-name="import-browser-link">імпортувати їх з іншого браузера</a> або <a data-l10n-name="import-file-link">з файлу</a>

## Login

login-item-new-login-title = Створити новий запис
login-item-edit-button = Змінити
about-logins-login-item-remove-button = Вилучити
login-item-origin-label = Адреса вебсайту
login-item-tooltip-message = Переконайтесь, що це точно відповідає адресі вебсайту, на який ви входите.
login-item-origin =
    .placeholder = https://www.example.com
login-item-username-label = Ім'я користувача
about-logins-login-item-username =
    .placeholder = (без імені користувача)
login-item-copy-username-button-text = Копіювати
login-item-copied-username-button-text = Скопійовано!
login-item-password-label = Пароль
login-item-password-reveal-checkbox =
    .aria-label = Показати пароль
login-item-copy-password-button-text = Копіювати
login-item-copied-password-button-text = Скопійовано!
login-item-save-changes-button = Зберегти зміни
login-item-save-new-button = Зберегти
login-item-cancel-button = Скасувати

## The date is displayed in a timeline showing the password evolution.
## A label is displayed under the date to describe the type of change.
## (e.g. updated, created, etc.)

# Variables
#   $datetime (date) - Event date
login-item-timeline-point-date = { DATETIME($datetime, day: "numeric", month: "short", year: "numeric") }
login-item-timeline-action-created = Створено
login-item-timeline-action-updated = Оновлено
login-item-timeline-action-used = Використано

## OS Authentication dialog

about-logins-os-auth-dialog-caption = { -brand-full-name }

## The macOS strings are preceded by the operating system with "Firefox is trying to "
## and includes subtitle of "Enter password for the user "xxx" to allow this." These
## notes are only valid for English. Please test in your respected locale.

# This message can be seen when attempting to edit a login in about:logins on Windows.
about-logins-edit-login-os-auth-dialog-message-win = Щоб змінити запис, введіть свої облікові дані входу для Windows. Це допомагає захистити ваші збережені паролі.
# This message can be seen when attempting to edit a login in about:logins
# On MacOS, only provide the reason that account verification is needed. Do not put a complete sentence here.
about-logins-edit-login-os-auth-dialog-message-macosx = редагувати збережений пароль
# This message can be seen when attempting to reveal a password in about:logins on Windows.
about-logins-reveal-password-os-auth-dialog-message-win = Щоб переглянути пароль, введіть свої облікові дані входу для Windows. Це допомагає захистити ваші збережені паролі.
# This message can be seen when attempting to reveal a password in about:logins
# On MacOS, only provide the reason that account verification is needed. Do not put a complete sentence here.
about-logins-reveal-password-os-auth-dialog-message-macosx = відобразити збережений пароль
# This message can be seen when attempting to copy a password in about:logins on Windows.
about-logins-copy-password-os-auth-dialog-message-win = Щоб скопіювати пароль, введіть свої облікові дані входу для Windows. Це допомагає захистити ваші збережені паролі.
# This message can be seen when attempting to copy a password in about:logins
# On MacOS, only provide the reason that account verification is needed. Do not put a complete sentence here.
about-logins-copy-password-os-auth-dialog-message-macosx = копіювати збережений пароль
# This message can be seen when attempting to export a password in about:logins on Windows.
about-logins-export-password-os-auth-dialog-message-win = Щоб експортувати паролі, введіть свої облікові дані входу для Windows. Це допомагає захистити ваші збережені паролі.
# This message can be seen when attempting to export a password in about:logins
# On MacOS, only provide the reason that account verification is needed. Do not put a complete sentence here.
about-logins-export-password-os-auth-dialog-message-macosx = експортувати збережені паролі

## Primary Password notification

about-logins-primary-password-notification-message = Введіть головний пароль, щоб переглянути збережені дані входу і паролі
master-password-reload-button =
    .label = Увійти
    .accesskey = в

## Dialogs

confirmation-dialog-cancel-button = Скасувати
confirmation-dialog-dismiss-button =
    .title = Скасувати
about-logins-confirm-remove-dialog-title = Вилучити цей запис?
confirm-delete-dialog-message = Це незворотна дія.
about-logins-confirm-remove-dialog-confirm-button = Вилучити

## Variables
##   $count (number) - Number of items

about-logins-confirm-remove-all-dialog-confirm-button-label =
    { $count ->
        [one] Вилучити
        [few] Вилучити { $count }
        [many] Вилучити { $count }
       *[other] Вилучити все
    }
about-logins-confirm-remove-all-dialog-checkbox-label =
    { $count ->
        [1] Так, вилучити цей пароль
        [one] Так, вилучити цей пароль
        [few] Так, вилучити ці паролі
       *[many] Так, вилучити ці паролі
    }
about-logins-confirm-remove-all-dialog-title =
    { $count ->
        [one] Вилучити { $count } пароль?
        [few] Вилучити всі { $count } паролі?
       *[many] Вилучити всі { $count } паролів?
    }
about-logins-confirm-remove-all-dialog-message =
    { $count ->
        [one] Це призведе до вилучення пароля, який ви зберегли до { -brand-short-name } та будь-яких сповіщень про витоки, які з'являються тут. Ви не зможете скасувати цю дію.
        [few] Це призведе до вилучення паролів, які ви зберегли до { -brand-short-name } та будь-яких сповіщень про витоки, які з'являються тут. Ви не зможете скасувати цю дію.
       *[many] Це призведе до вилучення паролів, які ви зберегли до { -brand-short-name } та будь-яких сповіщень про витоки, які з'являються тут. Ви не зможете скасувати цю дію.
    }
about-logins-confirm-remove-all-sync-dialog-title =
    { $count ->
        [one] Вилучити { $count } пароль з усіх пристроїв?
        [few] Вилучити усі { $count } паролі з усіх пристроїв?
       *[many] Вилучити усі { $count } паролів з усіх пристроїв?
    }
about-logins-confirm-remove-all-sync-dialog-message =
    { $count ->
        [one] Це призведе до вилучення збереженого в { -brand-short-name } пароля з усіх пристроїв, синхронізованих з вашим { -fxaccount-brand-name(case: "abl") }. Це також вилучить попередження про витоки, які з'являються тут. Ви не зможете скасувати цю дію.
        [few] Це призведе до вилучення всіх збережених у { -brand-short-name } паролів з усіх пристроїв, синхронізованих з вашим { -fxaccount-brand-name(case: "abl") }. Це також вилучить попередження про витоки, які з'являються тут. Ви не зможете скасувати цю дію.
       *[many] Це призведе до вилучення всіх збережених у { -brand-short-name } паролів з усіх пристроїв, синхронізованих з вашим { -fxaccount-brand-name(case: "abl") }. Це також вилучить попередження про витоки, які з'являються тут. Ви не зможете скасувати цю дію.
    }
about-logins-confirm-remove-all-sync-dialog-message2 =
    { $count ->
        [1] Це призведе до вилучення збереженого у { -brand-short-name } пароля з усіх пристроїв, синхронізованих з вашим обліковим записом. Це також вилучить попередження про витоки, які з'являються тут. Ви не зможете скасувати цю дію.
        [one] Це призведе до вилучення всіх збережених у { -brand-short-name } паролів з усіх пристроїв, синхронізованих з вашим обліковим записом. Це також вилучить попередження про витоки, які з'являються тут. Ви не зможете скасувати цю дію.
        [few] Це призведе до вилучення всіх збережених у { -brand-short-name } паролів з усіх пристроїв, синхронізованих з вашим обліковим записом. Це також вилучить попередження про витоки, які з'являються тут. Ви не зможете скасувати цю дію.
       *[many] Це призведе до вилучення всіх збережених у { -brand-short-name } паролів з усіх пристроїв, синхронізованих з вашим обліковим записом. Це також вилучить попередження про витоки, які з'являються тут. Ви не зможете скасувати цю дію.
    }

##

about-logins-confirm-export-dialog-title = Експортувати паролі
about-logins-confirm-export-dialog-message = Ваші паролі буде збережено у вигляді звичайного тексту (наприклад, BadP@ssw0rd), тож кожен, хто може відкрити експортований файл, зможе їх переглянути.
about-logins-confirm-export-dialog-confirm-button = Експорт…
about-logins-alert-import-title = Імпорт завершено
about-logins-alert-import-message = Переглянути детальний підсумок імпорту
confirm-discard-changes-dialog-title = Відхилити незбережені зміни?
confirm-discard-changes-dialog-message = Усі незбережені зміни будуть втрачені.
confirm-discard-changes-dialog-confirm-button = Відхилити

## Breach Alert notification

about-logins-breach-alert-title = Витік даних із сайту
breach-alert-text = З часу останнього оновлення облікових даних, з цього вебсайту було викрито або викрадено паролі. Змініть пароль, щоб захистити свій обліковий запис.
about-logins-breach-alert-date = Витік даних відбувся { DATETIME($date, day: "numeric", month: "long", year: "numeric") }
# Variables:
#   $hostname (String) - The hostname of the website associated with the login, e.g. "example.com"
about-logins-breach-alert-link = Перейти до { $hostname }

## Vulnerable Password notification

about-logins-vulnerable-alert-title = Ненадійний пароль
about-logins-vulnerable-alert-text2 = Цей пароль було використано в іншому обліковому записі, який, ймовірно, потрапив до витоку даних. Повторне використання облікових даних загрожує безпеці ваших інших облікових записів. Змініть цей пароль.
# Variables:
#   $hostname (String) - The hostname of the website associated with the login, e.g. "example.com"
about-logins-vulnerable-alert-link = Перейти до { $hostname }
about-logins-vulnerable-alert-learn-more-link = Докладніше

## Error Messages

# This is an error message that appears when a user attempts to save
# a new login that is identical to an existing saved login.
# Variables:
#   $loginTitle (String) - The title of the website associated with the login.
about-logins-error-message-duplicate-login-with-link = Запис для { $loginTitle } з таким іменем користувача вже існує. <a data-l10n-name="duplicate-link">Перейти до того запису?</a>
# This is a generic error message.
about-logins-error-message-default = При збереженні цього пароля сталася помилка.

## Login Export Dialog

# Title of the file picker dialog
about-logins-export-file-picker-title = Файл експорту паролів
# The default file name shown in the file picker when exporting saved logins.
# This must end in .csv
about-logins-export-file-picker-default-filename = паролі.csv
about-logins-export-file-picker-export-button = Експорт
# A description for the .csv file format that may be shown as the file type
# filter by the operating system.
about-logins-export-file-picker-csv-filter-title =
    { PLATFORM() ->
        [macos] Документ CSV
       *[other] Файл CSV
    }

## Login Import Dialog

# Title of the file picker dialog
about-logins-import-file-picker-title = Імпорт паролів з файлу
about-logins-import-file-picker-import-button = Імпортувати
# A description for the .csv file format that may be shown as the file type
# filter by the operating system.
about-logins-import-file-picker-csv-filter-title =
    { PLATFORM() ->
        [macos] Документ CSV
       *[other] Файл CSV
    }
# A description for the .tsv file format that may be shown as the file type
# filter by the operating system. TSV is short for 'tab separated values'.
about-logins-import-file-picker-tsv-filter-title =
    { PLATFORM() ->
        [macos] Документ TSV
       *[other] Файл TSV
    }

##
## Variables:
##  $count (number) - The number of affected elements

about-logins-import-dialog-title = Імпорт завершено
about-logins-import-dialog-items-added =
    { $count ->
       *[other] <span>Додано нових записів:</span> <span data-l10n-name="count">{ $count }</span>
    }
about-logins-import-dialog-items-modified =
    { $count ->
       *[other] <span>Оновлено наявних записів:</span> <span data-l10n-name="count">{ $count }</span>
    }
about-logins-import-dialog-items-no-change =
    { $count ->
       *[other] <span>Знайдено дублікатів:</span> <span data-l10n-name="count">{ $count }</span> <span data-l10n-name="meta">(not imported)</span>
    }
about-logins-import-dialog-items-error =
    { $count ->
       *[other] <span>Помилки:</span> <span data-l10n-name="count">{ $count }</span> <span data-l10n-name="meta">(not imported)</span>
    }
about-logins-import-dialog-done = Готово
about-logins-import-dialog-error-title = Помилка імпорту
about-logins-import-dialog-error-conflicting-values-title = Кілька суперечливих значень для одного облікового запису
about-logins-import-dialog-error-conflicting-values-description = Наприклад: кілька імен користувачів, паролів, URL-адрес тощо для одного облікового запису.
about-logins-import-dialog-error-file-format-title = Помилка формату файлу
about-logins-import-dialog-error-file-format-description = Неправильні або відсутні заголовки стовпців. Переконайтеся, що файл містить стовпці для імені користувача, пароля та URL-адреси.
about-logins-import-dialog-error-file-permission-title = Не вдалося прочитати файл
about-logins-import-dialog-error-file-permission-description = { -brand-short-name } не має дозволу на читання файлу. Спробуйте змінити дозволи на файл.
about-logins-import-dialog-error-unable-to-read-title = Не вдалося проаналізувати файл
about-logins-import-dialog-error-unable-to-read-description = Переконайтеся, що вибрали файл CSV або TSV.
about-logins-import-dialog-error-no-logins-imported = Жоден пароль не імпортовано
about-logins-import-dialog-error-learn-more = Дізнатися більше
about-logins-import-dialog-error-try-import-again = Повторити спробу імпорту…
about-logins-import-dialog-error-cancel = Скасувати
about-logins-import-report-title = Підсумок імпорту
about-logins-import-report-description = Паролі, імпортовані до { -brand-short-name }.
#
# Variables:
#  $number (number) - The number of the row
about-logins-import-report-row-index = Рядок { $number }
about-logins-import-report-row-description-no-change = Дублікат: Точний збіг з наявним паролем
about-logins-import-report-row-description-modified = Наявний пароль оновлено
about-logins-import-report-row-description-added = Новий пароль додано
about-logins-import-report-row-description-error = Помилка: відсутнє поле

##
## Variables:
##  $field (String) - The name of the field from the CSV file for example url, username or password

about-logins-import-report-row-description-error-multiple-values = Помилка: кілька значень для { $field }
about-logins-import-report-row-description-error-missing-field = Помилка: відсутнє поле { $field }

##
## Variables:
##  $count (number) - The number of affected elements

about-logins-import-report-added =
    { $count ->
        [one] <div data-l10n-name="count">{ $count }</div> <div data-l10n-name="details">новий пароль додано</div>
        [few] <div data-l10n-name="count">{ $count }</div> <div data-l10n-name="details">нових паролі додано</div>
       *[many] <div data-l10n-name="count">{ $count }</div> <div data-l10n-name="details">нових паролів додано</div>
    }
about-logins-import-report-modified =
    { $count ->
        [one] <div data-l10n-name="count">{ $count }</div> <div data-l10n-name="details">наявний пароль оновлено</div>
        [few] <div data-l10n-name="count">{ $count }</div> <div data-l10n-name="details">наявні паролі оновлено</div>
       *[many] <div data-l10n-name="count">{ $count }</div> <div data-l10n-name="details">наявних паролів оновлено</div>
    }
about-logins-import-report-no-change =
    { $count ->
        [one] <div data-l10n-name="count">{ $count }</div> <div data-l10n-name="details">дублікат пароля</div> <div data-l10n-name="not-imported">(не імпортовано)</div>
        [few] <div data-l10n-name="count">{ $count }</div> <div data-l10n-name="details">дублікати паролів</div> <div data-l10n-name="not-imported">(не імпортовано)</div>
       *[many] <div data-l10n-name="count">{ $count }</div> <div data-l10n-name="details">дублікатів паролів</div> <div data-l10n-name="not-imported">(не імпортовано)</div>
    }
about-logins-import-report-error =
    { $count ->
        [one] <div data-l10n-name="count">{ $count }</div> <div data-l10n-name="details">помилка</div> <div data-l10n-name="not-imported">(не імпортовано)</div>
        [few] <div data-l10n-name="count">{ $count }</div> <div data-l10n-name="details">помилки</div> <div data-l10n-name="not-imported">(не імпортовано)</div>
       *[many] <div data-l10n-name="count">{ $count }</div> <div data-l10n-name="details">помилок</div> <div data-l10n-name="not-imported">(не імпортовано)</div>
    }

## Logins import report page

about-logins-import-report-page-title = Звіт про імпорт
