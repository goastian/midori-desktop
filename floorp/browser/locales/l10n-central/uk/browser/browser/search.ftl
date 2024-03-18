# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## These strings are used for errors when installing OpenSearch engines, e.g.
## via "Add Search Engine" on the address bar or search bar.
## Variables
## $location-url (String) - the URL of the OpenSearch engine that was attempted to be installed.

opensearch-error-duplicate-title = Помилка встановлення
opensearch-error-duplicate-desc = { -brand-short-name } не зміг установити плагін пошуку з «{ $location-url }», оскільки засіб пошуку з таким іменем уже існує.

opensearch-error-format-title = Некоректний формат
opensearch-error-format-desc = { -brand-short-name } не зміг встановити засіб пошуку з: { $location-url }

opensearch-error-download-title = Помилка завантаження
opensearch-error-download-desc = { -brand-short-name } не зміг завантажити плагін пошуку з: { $location-url }

##

searchbar-submit =
    .tooltiptext = Виконати пошук

# This string is displayed in the search box when the input field is empty
searchbar-input =
    .placeholder = Пошук

searchbar-icon =
    .tooltiptext = Пошук

## Infobar shown when search engine is removed and replaced.
## Variables
## $oldEngine (String) - the search engine to be removed.
## $newEngine (String) - the search engine to replace the removed search engine.

removed-search-engine-message = <strong>Ваш типовий засіб пошуку змінено.</strong> { $oldEngine } більше не доступний як типова пошукова система { -brand-short-name }. Відтепер ваш типовий засіб пошуку — { $newEngine }. Щоб змінити його, перейдіть до налаштувань. <label data-l10n-name="remove-search-engine-article">Докладніше</label>
remove-search-engine-button = Гаразд
