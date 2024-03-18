# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

addons-page-title = Додатки
search-header =
    .placeholder = Пошук на addons.mozilla.org
    .searchbuttonlabel = Пошук

## Variables
##   $domain - Domain name where add-ons are available (e.g. addons.mozilla.org)

list-empty-get-extensions-message = Отримати розширення й теми на <a data-l10n-name="get-extensions">{ $domain }</a>
list-empty-get-dictionaries-message = Отримайте словники на <a data-l10n-name="get-extensions">{ $domain }</a>
list-empty-get-language-packs-message = Отримайте мовні пакунки на <a data-l10n-name="get-extensions">{ $domain }</a>

##

list-empty-installed =
    .value = У вас не встановлено жодного додатка цього типу
list-empty-available-updates =
    .value = Оновлень не знайдено
list-empty-recent-updates =
    .value = Ви не оновлювали додатків останнім часом.
list-empty-find-updates =
    .label = Перевірити оновлення
list-empty-button =
    .label = Дізнайтесь більше про додатки
help-button = Підтримка додатків
sidebar-help-button-title =
    .title = Підтримка додатків
addons-settings-button = Налаштування { -brand-short-name }
sidebar-settings-button-title =
    .title = Налаштування { -brand-short-name }
show-unsigned-extensions-button =
    .label = Деякі розширення не можуть бути перевірені
show-all-extensions-button =
    .label = Показати всі розширення
detail-version =
    .label = Версія
detail-last-updated =
    .label = Востаннє оновлено
addon-detail-description-expand = Показати більше
addon-detail-description-collapse = Показати менше
detail-contributions-description = Розробник цього додатка просить вас посприяти його подальшому розвитку невеликим внеском.
detail-contributions-button = Посприяти
    .title = Посприяти розвитку цього додатка
    .accesskey = П
detail-update-type =
    .value = Автоматичні оновлення
detail-update-default =
    .label = Типово
    .tooltiptext = Автоматично встановлювати оновлення лише якщо це типове налаштування
detail-update-automatic =
    .label = Увімкнено
    .tooltiptext = Встановлювати оновлення автоматично
detail-update-manual =
    .label = Вимкнено
    .tooltiptext = Не встановлювати оновлення автоматично
# Used as a description for the option to allow or block an add-on in private windows.
detail-private-browsing-label = Виконувати в приватних вікнах
# Some add-ons may elect to not run in private windows by setting incognito: not_allowed in the manifest.  This
# cannot be overridden by the user.
detail-private-disallowed-label = Не дозволено в приватних вікнах
detail-private-disallowed-description2 = Це розширення не працює під час приватного перегляду. <a data-l10n-name="learn-more">Докладніше</a>
# Some special add-ons are privileged, run in private windows automatically, and this permission can't be revoked
detail-private-required-label = Потребує доступу до приватних вікон
detail-private-required-description2 = Це розширення має доступ до вашої онлайн діяльності під час приватного перегляду. <a data-l10n-name="learn-more">Докладніше</a>
detail-private-browsing-on =
    .label = Дозволити
    .tooltiptext = Увімкнути в приватному перегляді
detail-private-browsing-off =
    .label = Не дозволяти
    .tooltiptext = Вимкнути в приватному перегляді
detail-home =
    .label = Домівка
detail-home-value =
    .value = { detail-home.label }
detail-repository =
    .label = Профіль додатку
detail-repository-value =
    .value = { detail-repository.label }
detail-check-for-updates =
    .label = Перевірити оновлення
    .accesskey = П
    .tooltiptext = Перевірити наявність оновлень для цього додатка
detail-show-preferences =
    .label =
        { PLATFORM() ->
            [windows] Налаштування
           *[other] Налаштування
        }
    .accesskey =
        { PLATFORM() ->
            [windows] Н
           *[other] Н
        }
    .tooltiptext =
        { PLATFORM() ->
            [windows] Змінити налаштування цього додатку
           *[other] Змінити налаштування цього додатку
        }
detail-rating =
    .value = Рейтинг
addon-restart-now =
    .label = Перезапустити зараз
disabled-unsigned-heading =
    .value = Деякі додатки були вимкнені
disabled-unsigned-description = Вказані додатки не були перевірені для використання в { -brand-short-name }. Ви можете <label data-l10n-name="find-addons">знайти їм заміну</label> або попросити розробника виконати їх перевірку.
disabled-unsigned-learn-more = Дізнайтесь більше про наші зусилля в забезпеченні збереження вашої безпеки в Інтернеті.
disabled-unsigned-devinfo = Розробники, зацікавлені в перевірці своїх додатків, можуть продовжити, прочитавши нашу <label data-l10n-name="learn-more">інструкцію</label>.
plugin-deprecation-description = Чогось не вистачає? Деякі плагіни більше не підтримуються в { -brand-short-name }. <label data-l10n-name="learn-more">Докладніше.</label>
legacy-warning-show-legacy = Показати застарілі розширення
legacy-extensions =
    .value = Застарілі розширення
legacy-extensions-description = Ці розширення не відповідають поточним стандартам { -brand-short-name }, тому вони були вимкнені. <label data-l10n-name="legacy-learn-more">Дізнайтеся про зміни, що стосуються додатків</label>
private-browsing-description2 =
    { -brand-short-name } змінює роботу розширень в режимі приватного перегляду. Будь-які нові розширення,
    які ви встановлюєте в { -brand-short-name }, не виконуватимуться в приватних вікнах. Доки ви не встановите дозвіл
    в налаштуваннях, розширення не працюватиме під час приватного перегляду і не матиме доступу до вашої діяльності
    в цьому режимі. Ми зробили цю зміну для захисту вашої приватності.
    <label data-l10n-name="private-browsing-learn-more">Дізнайтеся, як керувати налаштуваннями розширень.</label>
addon-category-discover = Рекомендації
addon-category-discover-title =
    .title = Рекомендації
addon-category-extension = Розширення
addon-category-extension-title =
    .title = Розширення
addon-category-theme = Теми
addon-category-theme-title =
    .title = Теми
addon-category-plugin = Плагіни
addon-category-plugin-title =
    .title = Плагіни
addon-category-dictionary = Словники
addon-category-dictionary-title =
    .title = Словники
addon-category-locale = Мови
addon-category-locale-title =
    .title = Мови
addon-category-available-updates = Доступні оновлення
addon-category-available-updates-title =
    .title = Доступні оновлення
addon-category-recent-updates = Недавні оновлення
addon-category-recent-updates-title =
    .title = Недавні оновлення
addon-category-sitepermission = Дозволи сайтів
addon-category-sitepermission-title =
    .title = Дозволи сайтів
# String displayed in about:addons in the Site Permissions section
# Variables:
#  $host (string) - DNS host name for which the webextension enables permissions
addon-sitepermission-host = Дозволи сайту для { $host }

## These are global warnings

extensions-warning-safe-mode = В безпечному режимі всі додатки вимкнено.
extensions-warning-check-compatibility = Перевірка сумісності додатків вимкнена. У вас можуть бути несумісні додатки.
extensions-warning-safe-mode2 =
    .message = В безпечному режимі всі додатки вимкнено.
extensions-warning-check-compatibility2 =
    .message = Перевірка сумісності додатків вимкнена. У вас можуть бути несумісні додатки.
extensions-warning-check-compatibility-button = Увімкнути
    .title = Увімкнути перевірку сумісності додатків
extensions-warning-update-security = Перевірка безпечного оновлення додатків вимкнена. У процесі оновлення зловмисник може спробувати підмінити їх.
extensions-warning-update-security2 =
    .message = Перевірка безпечного оновлення додатків вимкнена. У процесі оновлення зловмисник може спробувати підмінити їх.
extensions-warning-update-security-button = Увімкнути
    .title = Увімкнути перевірку безпечного оновлення додатків
extensions-warning-imported-addons2 =
    .message = Завершіть встановлення розширень, які було імпортовано до { -brand-short-name }.
extensions-warning-imported-addons-button = Встановити розширення

## Strings connected to add-on updates

addon-updates-check-for-updates = Перевірити оновлення
    .accesskey = П
addon-updates-view-updates = Показати недавні оновлення
    .accesskey = н

# This menu item is a checkbox that toggles the default global behavior for
# add-on update checking.

addon-updates-update-addons-automatically = Оновлювати додатки автоматично
    .accesskey = а

## Specific add-ons can have custom update checking behaviors ("Manually",
## "Automatically", "Use default global behavior"). These menu items reset the
## update checking behavior for all add-ons to the default global behavior
## (which itself is either "Automatically" or "Manually", controlled by the
## extensions-updates-update-addons-automatically.label menu item).

addon-updates-reset-updates-to-automatic = Перемкнути всі додатки на автоматичне оновлення
    .accesskey = к
addon-updates-reset-updates-to-manual = Перемкнути всі додатки на ручне оновлення
    .accesskey = к

## Status messages displayed when updating add-ons

addon-updates-updating = Оновлення додатків
addon-updates-installed = Ваші додатки були оновлені.
addon-updates-none-found = Оновлень не знайдено
addon-updates-manual-updates-found = Переглянути доступні оновлення

## Add-on install/debug strings for page options menu

addon-install-from-file = Встановити додаток з файлу…
    .accesskey = В
addon-install-from-file-dialog-title = Виберіть додаток для встановлення
addon-install-from-file-filter-name = Додатки
addon-open-about-debugging = Налагодження додатків
    .accesskey = г

## Extension shortcut management

# This is displayed in the page options menu
addon-manage-extensions-shortcuts = Керувати комбінаціями клавіш розширень
    .accesskey = б
shortcuts-no-addons = У вас не увімкнено жодного розширення.
shortcuts-no-commands = Такі розширення не мають комбінацій клавіш:
shortcuts-input =
    .placeholder = Введіть комбінацію клавіш
shortcuts-browserAction2 = Активувати кнопку панелі
shortcuts-pageAction = Активувати дію сторінки
shortcuts-sidebarAction = Перемкнути бічну панель
shortcuts-modifier-mac = Додайте Ctrl, Alt, або ⌘
shortcuts-modifier-other = Додайте Ctrl або Alt
shortcuts-invalid = Неправильна комбінація
shortcuts-letter = Введіть літеру
shortcuts-system = Неможливо перевизначити комбінацію клавіш { -brand-short-name }
# String displayed in warning label when there is a duplicate shortcut
shortcuts-duplicate = Дублікат комбінації клавіш
# String displayed when a keyboard shortcut is already assigned to more than one add-on
# Variables:
#   $shortcut (string) - Shortcut string for the add-on
shortcuts-duplicate-warning-message = { $shortcut } використовується більше одного випадку. Дублікати комбінацій клавіш можуть спричинити неочікувану поведінку.
# String displayed when a keyboard shortcut is already assigned to more than one add-on
# Variables:
#   $shortcut (string) - Shortcut string for the add-on
shortcuts-duplicate-warning-message2 =
    .message = { $shortcut } використовується більше одного випадку. Дублікати комбінацій клавіш можуть спричинити неочікувану поведінку.
# String displayed when a keyboard shortcut is already used by another add-on
# Variables:
#   $addon (string) - Name of the add-on
shortcuts-exists = Вже використовується додатком { $addon }
# Variables:
#   $numberToShow (number) - Number of other elements available to show
shortcuts-card-expand-button =
    { $numberToShow ->
        [one] Показати ще { $numberToShow }
        [few] Показати ще { $numberToShow }
       *[many] Показати ще { $numberToShow }
    }
shortcuts-card-collapse-button = Показати менше
header-back-button =
    .title = Назад

## Recommended add-ons page

# Explanatory introduction to the list of recommended add-ons. The action word
# ("recommends") in the final sentence is a link to external documentation.
discopane-intro =
    Розширення і теми - це невеличкі додатки для вашого браузера, які дозволяють
    захищати паролі, завантажувати відео, знаходити пропозиції, блокувати рекламу,
    змінювати зовнішній вигляд браузера та багато іншого. Ці невеликі програми часто
    розробляються сторонніми організаціями.
    Ось декілька <a data-l10n-name="learn-more-trigger">рекомендацій</a> від { -brand-product-name } для виняткової безпеки, швидкодії та функціональності.
# Notice to make user aware that the recommendations are personalized.
discopane-notice-recommendations = Деякі з цих рекомендацій персоналізовані. Вони базуються на ваших вже встановлених розширеннях, налаштуваннях профілю і статистиці використання.
# Notice to make user aware that the recommendations are personalized.
discopane-notice-recommendations2 =
    .message = Деякі з цих рекомендацій персоналізовані. Вони базуються на ваших вже встановлених розширеннях, налаштуваннях профілю і статистиці використання.
discopane-notice-learn-more = Докладніше
privacy-policy = Політика приватності
# Refers to the author of an add-on, shown below the name of the add-on.
# Variables:
#   $author (string) - The name of the add-on developer.
created-by-author = від <a data-l10n-name="author">{ $author }</a>
# Shows the number of daily users of the add-on.
# Variables:
#   $dailyUsers (number) - The number of daily users.
user-count = Користувачі: { $dailyUsers }
install-extension-button = Додати до { -brand-product-name }
install-theme-button = Встановити тему
# The label of the button that appears after installing an add-on. Upon click,
# the detailed add-on view is opened, from where the add-on can be managed.
manage-addon-button = Керувати
find-more-addons = Знайти інші додатки
find-more-themes = Знайти інші теми
# This is a label for the button to open the "more options" menu, it is only
# used for screen readers.
addon-options-button =
    .aria-label = Інші варіанти

## Add-on actions

report-addon-button = Скарга
remove-addon-button = Вилучити
# The link will always be shown after the other text.
remove-addon-disabled-button = Неможливо вилучити <a data-l10n-name="link">Чому?</a>
disable-addon-button = Вимкнути
enable-addon-button = Увімкнути
# This is used for the toggle on the extension card, it's a checkbox and this
# is always its label.
extension-enable-addon-button-label =
    .aria-label = Увімкнути
preferences-addon-button =
    { PLATFORM() ->
        [windows] Налаштування
       *[other] Налаштування
    }
details-addon-button = Подробиці
release-notes-addon-button = Примітки до випуску
permissions-addon-button = Дозволи
extension-enabled-heading = Увімкнено
extension-disabled-heading = Вимкнено
theme-enabled-heading = Увімкнено
theme-disabled-heading2 = Збережені теми
plugin-enabled-heading = Увімкнено
plugin-disabled-heading = Вимкнено
dictionary-enabled-heading = Увімкнено
dictionary-disabled-heading = Вимкнено
locale-enabled-heading = Увімкнено
locale-disabled-heading = Вимкнено
sitepermission-enabled-heading = Увімкнено
sitepermission-disabled-heading = Вимкнено
always-activate-button = Завжди активувати
never-activate-button = Ніколи не активувати
addon-detail-author-label = Автор
addon-detail-version-label = Версія
addon-detail-last-updated-label = Востаннє оновлено
addon-detail-homepage-label = Домівка
addon-detail-rating-label = Оцінка
# Message for add-ons with a staged pending update.
install-postponed-message = Це розширення буде оновлено після перезапуску { -brand-short-name }.
# Message for add-ons with a staged pending update.
install-postponed-message2 =
    .message = Це розширення буде оновлено після перезапуску { -brand-short-name }.
install-postponed-button = Оновити зараз
# The average rating that the add-on has received.
# Variables:
#   $rating (number) - A number between 0 and 5. The translation should show at most one digit after the comma.
five-star-rating =
    .title = Оцінка { NUMBER($rating, maximumFractionDigits: 1) } з 5
# This string is used to show that an add-on is disabled.
# Variables:
#   $name (string) - The name of the add-on
addon-name-disabled = { $name } (вимкнено)
# The number of reviews that an add-on has received on AMO.
# Variables:
#   $numberOfReviews (number) - The number of reviews received
addon-detail-reviews-link =
    { $numberOfReviews ->
        [one] { $numberOfReviews } відгук
        [few] { $numberOfReviews } відгуки
       *[many] { $numberOfReviews } відгуків
    }

## Pending uninstall message bar

# Variables:
#   $addon (string) - Name of the add-on
pending-uninstall-description = <span data-l10n-name="addon-name">{ $addon }</span> було вилучено.
# Variables:
#   $addon (string) - Name of the add-on
pending-uninstall-description2 =
    .message = { $addon } було вилучено.
pending-uninstall-undo-button = Повернути
addon-detail-updates-label = Дозволити автоматичне оновлення
addon-detail-updates-radio-default = Типово
addon-detail-updates-radio-on = Увімкнено
addon-detail-updates-radio-off = Вимкнено
addon-detail-update-check-label = Перевірити оновлення
install-update-button = Оновити
# aria-label associated to the updates row to help screen readers to announce the group
# of input controls being entered.
addon-detail-group-label-updates =
    .aria-label = { addon-detail-updates-label }
# This is the tooltip text for the private browsing badge in about:addons. The
# badge is the private browsing icon included next to the extension's name.
addon-badge-private-browsing-allowed2 =
    .title = Дозволено в приватних вікнах
    .aria-label = { addon-badge-private-browsing-allowed2.title }
addon-detail-private-browsing-help = Якщо дозволено, розширення матиме доступ до вашої діяльності в режимі приватного перегляду. <a data-l10n-name="learn-more">Докладніше</a>
addon-detail-private-browsing-allow = Дозволити
addon-detail-private-browsing-disallow = Не дозволяти
# aria-label associated to the private browsing row to help screen readers to announce the group
# of input controls being entered.
addon-detail-group-label-private-browsing =
    .aria-label = { detail-private-browsing-label }

## "sites with restrictions" (internally called "quarantined") are special domains
## where add-ons are normally blocked for security reasons.

# Used as a description for the option to allow or block an add-on on quarantined domains.
addon-detail-quarantined-domains-label = Запускати на сайтах з обмеженнями
# Used as help text part of the quarantined domains UI controls row.
addon-detail-quarantined-domains-help = Якщо дозволено, розширення матиме доступ до сайтів, обмежених { -vendor-short-name }. Дозволяйте, лише якщо ви довіряєте цьому розширенню.
# Used as label and tooltip text on the radio inputs associated to the quarantined domains UI controls.
addon-detail-quarantined-domains-allow = Дозволити
addon-detail-quarantined-domains-disallow = Не дозволяти
# aria-label associated to the quarantined domains exempt row to help screen readers to announce the group.
addon-detail-group-label-quarantined-domains =
    .aria-label = { addon-detail-quarantined-domains-label }

## This is the tooltip text for the recommended badges for an extension in about:addons. The
## badge is a small icon displayed next to an extension when it is recommended on AMO.

addon-badge-recommended2 =
    .title = { -brand-product-name } рекомендує лише розширення, що задовольняють наші стандарти безпеки та швидкодії
    .aria-label = { addon-badge-recommended2.title }
# We hard code "Mozilla" in the string below because the extensions are built
# by Mozilla and we don't want forks to display "by Fork".
addon-badge-line3 =
    .title = Офіційне розширення, створене Mozilla. Відповідає стандартам безпеки та продуктивності.
    .aria-label = { addon-badge-line3.title }
addon-badge-verified2 =
    .title = Це розширення перевірено на відповідність нашим стандартам безпеки та швидкодії.
    .aria-label = { addon-badge-verified2.title }

##

available-updates-heading = Доступні оновлення
recent-updates-heading = Недавні оновлення
release-notes-loading = Завантаження…
release-notes-error = На жаль, під час завантаження приміток до випуску сталася помилка.
addon-permissions-empty = Це розширення не потребує дозволів
addon-permissions-required = Необхідні дозволи для роботи основних функцій:
addon-permissions-optional = Необов'язкові дозволи для додаткових функцій:
addon-permissions-learnmore = Докладніше про дозволи
recommended-extensions-heading = Рекомендовані розширення
recommended-themes-heading = Рекомендовані теми
# Variables:
#   $hostname (string) - Host where the permissions are granted
addon-sitepermissions-required = Надає для <span data-l10n-name="hostname">{ $hostname }</span> такі можливості:
# A recommendation for the Firefox Color theme shown at the bottom of the theme
# list view. The "Firefox Color" name itself should not be translated.
recommended-theme-1 = Відчуваєте творче натхнення? <a data-l10n-name="link">Створіть власну тему за допомогою Firefox Color.</a>

## Page headings

extension-heading = Керуйте своїми розширеннями
theme-heading = Керуйте своїми темами
plugin-heading = Керуйте своїми плагінами
dictionary-heading = Керуйте своїми словниками
locale-heading = Керуйте своїми мовами
updates-heading = Керуйте своїми оновленнями
sitepermission-heading = Керувати дозволами сайтів
discover-heading = Персоналізуйте свій { -brand-short-name }
shortcuts-heading = Керувати комбінаціями клавіш розширень
default-heading-search-label = Знайти більше додатків
addons-heading-search-input =
    .placeholder = Пошук на addons.mozilla.org
addon-page-options-button =
    .title = Інструменти для всіх додатків

## Detail notifications
## Variables:
##   $name (string) - Name of the add-on.

# Variables:
#   $version (string) - Application version.
details-notification-incompatible = { $name } несумісний з { -brand-short-name } { $version }.
# Variables:
#   $version (string) - Application version.
details-notification-incompatible2 =
    .message = { $name } несумісний з { -brand-short-name } { $version }.
details-notification-incompatible-link = Докладніше
details-notification-unsigned-and-disabled = Додаток { $name } не був перевірений для використання в { -brand-short-name } і був вимкнений.
details-notification-unsigned-and-disabled2 =
    .message = Додаток { $name } не був перевірений для використання в { -brand-short-name } і був вимкнений.
details-notification-unsigned-and-disabled-link = Докладніше
details-notification-unsigned = Додаток { $name } не був перевірений для використання в { -brand-short-name }. Продовжуйте з обережністю.
details-notification-unsigned2 =
    .message = Додаток { $name } не був перевірений для використання в { -brand-short-name }. Продовжуйте з обережністю.
details-notification-unsigned-link = Докладніше
details-notification-blocked = { $name } було вимкнено, у зв'язку з проблемами безпеки чи стабільності.
details-notification-blocked2 =
    .message = { $name } було вимкнено, у зв'язку з проблемами безпеки чи стабільності.
details-notification-blocked-link = Докладніше
details-notification-softblocked = В { $name } є відомі проблеми з безпекою та стабільністю.
details-notification-softblocked2 =
    .message = В { $name } є відомі проблеми з безпекою та стабільністю.
details-notification-softblocked-link = Докладніше
details-notification-gmp-pending = { $name } незабаром буде встановлено.
details-notification-gmp-pending2 =
    .message = { $name } незабаром буде встановлено.
