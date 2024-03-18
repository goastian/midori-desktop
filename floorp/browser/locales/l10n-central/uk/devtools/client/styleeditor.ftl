# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

styleeditor-new-button =
    .tooltiptext = Створити і додати нову таблицю стилів у документ
    .accesskey = С
styleeditor-import-button =
    .tooltiptext = Імпортувати і додати наявну таблицю стилів у документ
    .accesskey = І
styleeditor-filter-input =
    .placeholder = Фільтрувати таблиці стилів
styleeditor-visibility-toggle =
    .tooltiptext = Перемкнути видимість таблиці стилів
    .accesskey = З
styleeditor-visibility-toggle-system =
    .tooltiptext = Системні таблиці стилів не можна вимкнути
styleeditor-save-button = Зберегти
    .tooltiptext = Зберегти цю таблицю стилів у файл
    .accesskey = З
styleeditor-options-button =
    .tooltiptext = Налаштування редактора стилів
styleeditor-at-rules = At-правила
styleeditor-editor-textbox =
    .data-placeholder = Введіть код CSS тут.
styleeditor-no-stylesheet = Ця сторінка не має таблиці стилів.
styleeditor-no-stylesheet-tip = Можливо, бажаєте <a data-l10n-name="append-new-stylesheet">додати нову таблицю стилів</a>?
styleeditor-open-link-new-tab =
    .label = Відкрити посилання в новій вкладці
styleeditor-copy-url =
    .label = Копіювати URL
styleeditor-find =
    .label = Знайти
    .accesskey = З
styleeditor-find-again =
    .label = Знайти знову
    .accesskey = т
styleeditor-go-to-line =
    .label = Перейти до рядка…
    .accesskey = й
# Label displayed when searching a term that is not found in any stylesheet path
styleeditor-stylesheet-all-filtered = Не знайдено відповідної таблиці стилів.
# This string is shown in the style sheets list
# Variables:
#   $ruleCount (Integer) - The number of rules in the stylesheet.
styleeditor-stylesheet-rule-count =
    { $ruleCount ->
        [one] { $ruleCount } правило.
        [few] { $ruleCount } правила.
       *[many] { $ruleCount } правил.
    }
# Title for the pretty print button in the editor footer.
styleeditor-pretty-print-button =
    .title = Охайний друк таблиці стилів
# Title for the pretty print button in the editor footer, when it's disabled
styleeditor-pretty-print-button-disabled =
    .title = Може охайно друкувати лише файли CSS
