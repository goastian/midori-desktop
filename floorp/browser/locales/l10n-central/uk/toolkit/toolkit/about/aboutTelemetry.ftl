# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

about-telemetry-ping-data-source = Джерело даних пінгу:
about-telemetry-show-current-data = Поточні дані
about-telemetry-show-archived-ping-data = Дані архівованого пінгу
about-telemetry-show-subsession-data = Показувати дані підсеансу
about-telemetry-choose-ping = Оберіть пінг:
about-telemetry-archive-ping-type = Тип пінгу
about-telemetry-archive-ping-header = Пінг
about-telemetry-option-group-today = Сьогодні
about-telemetry-option-group-yesterday = Вчора
about-telemetry-option-group-older = Раніше
about-telemetry-previous-ping = <<
about-telemetry-next-ping = >>
about-telemetry-page-title = Данні телеметрії
about-telemetry-current-store = Поточне сховище:
about-telemetry-more-information = Шукаєте додаткову інформацію?
about-telemetry-firefox-data-doc = <a data-l10n-name="data-doc-link">Документація даних Firefox</a> містить настанови про те, як працювати з нашими інструментами даних.
about-telemetry-telemetry-client-doc = <a data-l10n-name="client-doc-link">Документація клієнта телеметрії Firefox</a> містить визначення для концептів, документацію API та посилання на дані.
about-telemetry-telemetry-dashboard = <a data-l10n-name="dashboard-link">Панелі огляду телеметрії</a> дозволяють вам візуалізувати дані, які Mozilla отримує через телеметрію.
about-telemetry-telemetry-probe-dictionary = <a data-l10n-name="probe-dictionary-link">Словник вимірювань</a> містить подробиці та описи вимірювань, що збираються Телеметрією.
about-telemetry-show-in-Firefox-json-viewer = Відкрити в засобі перегляду JSON
about-telemetry-home-section = Домівка
about-telemetry-general-data-section = Загальні дані
about-telemetry-environment-data-section = Дані середовища
about-telemetry-session-info-section = Інформація про сеанс
about-telemetry-scalar-section = Величини
about-telemetry-keyed-scalar-section = Ключові величини
about-telemetry-histograms-section = Гістограми
about-telemetry-keyed-histogram-section = Гістограми з ключами
about-telemetry-events-section = Події
about-telemetry-simple-measurements-section = Прості вимірювання
about-telemetry-slow-sql-section = Повільні SQL-запити
about-telemetry-addon-details-section = Подробиці про додатки
about-telemetry-late-writes-section = Пізні записи
about-telemetry-raw-payload-section = Необроблене навантаження
about-telemetry-raw = Необроблений JSON
about-telemetry-full-sql-warning = ПРИМІТКА: Увімкнено повільний режим налагодження SQL. Нижче можуть показуватися повні рядки SQL, але вони не відправлятимуться до телеметрії.
about-telemetry-fetch-stack-symbols = Отримати назви функцій для стеків
about-telemetry-hide-stack-symbols = Показати необроблені дані стеку
# Selects the correct release version
# Variables:
#   $channel (string) - Represents the corresponding release data string
about-telemetry-data-type =
    { $channel ->
        [release] дані про випуск
       *[prerelease] дані про попередній випуск
    }
# Selects the correct upload string
# Variables:
#   $uploadcase (string) - Represents a corresponding upload string
about-telemetry-upload-type =
    { $uploadcase ->
        [enabled] увімкнено
       *[disabled] вимкнено
    }
# Example Output: 1 sample, average = 0, sum = 0
# Variables:
#   $sampleCount (number) - Amount of histogram samples
#   $prettyAverage (number) - Average of histogram samples
#   $sum (number) - Sum of histogram samples
about-telemetry-histogram-stats =
    { $sampleCount ->
        [one] { $sampleCount } зразок, середнє = { $prettyAverage }, сума = { $sum }
        [few] { $sampleCount } зразки, середнє = { $prettyAverage }, сума = { $sum }
       *[many] { $sampleCount } зразків, середнє = { $prettyAverage }, сума = { $sum }
    }
# Variables:
#   $telemetryServerOwner (string) - the value of the toolkit.telemetry.server_owner preference. Typically "Mozilla"
about-telemetry-page-subtitle = Ця сторінка показує інформацію про швидкодію, апаратне забезпечення, використання та налаштування, зібрану за допомогою телеметрії. Ця інформація відправляється до { $telemetryServerOwner }, щоб поліпшити { -brand-full-name }.
about-telemetry-settings-explanation = Телеметрія збирає { about-telemetry-data-type } і вивантаження <a data-l10n-name="upload-link">{ about-telemetry-upload-type }</a>
# Variables:
#   $name (string) - Ping name, e.g. “saved-session”
#   $timestamp (string) - Ping localized timestamp, e.g. “2017/07/08 10:40:46”
about-telemetry-ping-details = Кожна частинка інформації надсилається включеною в “<a data-l10n-name="ping-link">пінг</a>”. Ви дивитесь на пінг { $name }, { $timestamp }.
about-telemetry-data-details-current = Кожен фрагмент інформації надсилається в комплекті з “<a data-l10n-name="ping-link">pings</a>“. Ви переглядаєте поточні дані.
# string used as a placeholder for the search field
# More info about it can be found here:
# https://firefox-source-docs.mozilla.org/toolkit/components/telemetry/telemetry/data/main-ping.html
# Variables:
#   $selectedTitle (string) - The section name from the structure of the ping.
about-telemetry-filter-placeholder =
    .placeholder = Знайти в { $selectedTitle }
about-telemetry-filter-all-placeholder =
    .placeholder = Шукати у всіх розділах
# Variables:
#   $searchTerms (string) - The searched terms
about-telemetry-results-for-search = Результати для “{ $searchTerms }”
# More info about it can be found here: https://firefox-source-docs.mozilla.org/toolkit/components/telemetry/telemetry/data/main-ping.html
# Variables:
#   $sectionName (string) - The section name from the structure of the ping.
#   $currentSearchText (string) - The current text in the search input
about-telemetry-no-search-results = Вибачте! В { $sectionName } немає результатів для “{ $currentSearchText }”
# Variables:
#   $searchTerms (string) - The searched terms
about-telemetry-no-search-results-all = Вибачте! Для “{ $searchTerms }” немає результатів у жодному з розділів
# This message is displayed when a section is empty.
# Variables:
#   $sectionName (string) - Is replaced by the section name.
about-telemetry-no-data-to-display = Вибачте! В “{ $sectionName }” наразі немає доступних даних
# used as a tooltip for the “current” ping title in the sidebar
about-telemetry-current-data-sidebar = поточні дані
# used in the “Ping Type” select
about-telemetry-telemetry-ping-type-all = все
# button label to copy the histogram
about-telemetry-histogram-copy = Копіювати
# these strings are used in the “Slow SQL Statements” section
about-telemetry-slow-sql-main = Повільні SQL запити в головному потоці
about-telemetry-slow-sql-other = Повільні SQL запити в допоміжному потоці
about-telemetry-slow-sql-hits = Попадання
about-telemetry-slow-sql-average = Середній час (мс)
about-telemetry-slow-sql-statement = Інструкція
# these strings are used in the “Add-on Details” section
about-telemetry-addon-table-id = Ідентифікатор додатку
about-telemetry-addon-table-details = Подробиці
# Variables:
#   $addonProvider (string) - The name of an Add-on Provider (e.g. “XPI”, “Plugin”)
about-telemetry-addon-provider = Провайдер { $addonProvider }
about-telemetry-keys-header = Властивість
about-telemetry-names-header = Назва
about-telemetry-values-header = Значення
# Variables:
#   $lateWriteCount (number) - The number of the late writes
about-telemetry-late-writes-title = Пізній запис #{ $lateWriteCount }
about-telemetry-stack-title = Стек:
about-telemetry-memory-map-title = Карта пам'яті:
about-telemetry-error-fetching-symbols = Під час отримання символів сталася помилка. Перевірте з'єднання з Інтернетом і повторіть спробу.
about-telemetry-time-stamp-header = позначка часу
about-telemetry-category-header = категорія
about-telemetry-method-header = спосіб
about-telemetry-object-header = об'єкт
about-telemetry-extra-header = екстра
# Variables:
#  $process (string) - Type of process in subsection headers ( e.g. "content", "parent" )
about-telemetry-process = Процес { $process }
