# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### "FOG", "Glean", and "Glean SDK" should remain in English.

-fog-brand-name = FOG
-glean-brand-name = Glean
glean-sdk-brand-name = { -glean-brand-name } SDK
glean-debug-ping-viewer-brand-name = Перегляд пінгу налагодження { -glean-brand-name }
about-glean-page-title2 = Про { -glean-brand-name }
about-glean-header = Про { -glean-brand-name }
about-glean-interface-description =
    <a data-l10n-name="glean-sdk-doc-link">{ glean-sdk-brand-name }</a>
    – це бібліотека збору даних, що використовується в проєктах { -vendor-short-name }.
    Цей інтерфейс розроблений для ручного <a data-l10n-name="fog-link">тестування інструментарію</a>
    розробниками й тестувальниками.
about-glean-upload-enabled = Вивантаження даних увімкнено.
about-glean-upload-disabled = Вивантаження даних вимкнено.
about-glean-upload-enabled-local = Вивантаження даних увімкнено лише для надсилання на локальний сервер.
about-glean-upload-fake-enabled =
    Вивантаження даних вимкнено,
    але ми обходимо це, повідомляючи { glean-sdk-brand-name }, що його увімкнено,
    тому дані все одно записуються локально.
    Примітка: Якщо ви встановили мітку налагодження, пінги вивантажуватимуться до
    <a data-l10n-name="glean-debug-ping-viewer">{ glean-debug-ping-viewer-brand-name }</a> незалежно від налаштувань.
# This message is followed by a bulleted list.
about-glean-prefs-and-defines = Відповідні <a data-l10n-name="fog-prefs-and-defines-doc-link">параметри та визначення</a> включають:
# Variables:
#   $data-upload-pref-value (String): the value of the datareporting.healthreport.uploadEnabled pref. Typically "true", sometimes "false"
# Do not translate strings between <code> </code> tags.
about-glean-data-upload = <code>datareporting.healthreport.uploadEnabled</code>: { $data-upload-pref-value }
# Variables:
#   $local-port-pref-value (Integer): the value of the telemetry.fog.test.localhost_port pref. Typically 0. Can be negative.
# Do not translate strings between <code> </code> tags.
about-glean-local-port = <code>telemetry.fog.test.localhost_port</code>: { $local-port-pref-value }
# Variables:
#   $glean-android-define-value (Boolean): the value of the MOZ_GLEAN_ANDROID define. Typically "false", sometimes "true".
# Do not translate strings between <code> </code> tags.
about-glean-glean-android = <code>MOZ_GLEAN_ANDROID</code>: { $glean-android-define-value }
# Variables:
#   $moz-official-define-value (Boolean): the value of the MOZILLA_OFFICIAL define.
# Do not translate strings between <code> </code> tags.
about-glean-moz-official = <code>MOZILLA_OFFICIAL</code>: { $moz-official-define-value }
about-glean-about-testing-header = Про тестування
# This message is followed by a numbered list.
about-glean-manual-testing =
    Повні інструкції викладено в
    <a data-l10n-name="fog-instrumentation-test-doc-link"> документації з тестування інструментарію { -fog-brand-name }</a>
    та <a data-l10n-name="glean-sdk-doc-link">документації { glean-sdk-brand-name }</a>,
    але, простіше кажучи, для ручного тестування роботи вашого інструментарію, виконайте такі дії:
# This message is an option in a dropdown filled with untranslated names of pings.
about-glean-no-ping-label = (не надсилати жодного пінгу)
# An in-line text input field precedes this string.
about-glean-label-for-tag-pings = Переконайтеся, що в попередньому полі є мітка налагодження, яку легко запам'ятати, щоб згодом ви могли розпізнавати ваші пінги.
# An in-line drop down list precedes this string.
# Do not translate strings between <code> </code> tags.
about-glean-label-for-ping-names =
    Оберіть із попереднього списку пінг, у якому є ваш інструментарій.
    Якщо він у <a data-l10n-name="custom-ping-link">власному пінгу</a>, оберіть його.
    В інших випадках типовий для показників <code>event</code>
    – пінг <code>events</code>,
    а типовий для всіх інших показників
    – пінг <code>metrics</code>.
# An in-line check box precedes this string.
about-glean-label-for-log-pings =
    (Необов'язково. Установіть попередній прапорець, якщо ви хочете, щоб пінги також реєструвалися під час надсилання.
    Вам додатково потрібно буде <a data-l10n-name="enable-logging-link">увімкнути журналювання</a>.)
# Variables
#   $debug-tag (String): The user-set value of the debug tag input on this page. Like "about-glean-kV"
# An in-line button labeled "Apply settings and submit ping" precedes this string.
about-glean-label-for-controls-submit =
    Натисніть попередню кнопку, щоб позначити всі пінги { -glean-brand-name } своєю міткою і надіслати вибраний пінг.
    (Усі пінги, надіслані з того часу до перезапуску застосунку, будуть позначені міткою
    <code>{ $debug-tag }</code>.)
about-glean-li-for-visit-gdpv =
    <a data-l10n-name="gdpv-tagged-pings-link">Відвідайте сторінку { glean-debug-ping-viewer-brand-name }, щоб побачити пінги з вашою міткою</a>.
    Після натискання кнопки має пройти не більш ніж кілька секунд до отримання ваших пінгів.
    Іноді це може тривати декілька хвилин.
# Do not translate strings between <code> </code> tags.
about-glean-adhoc-explanation =
    Для додаткового тестування <i>ad hoc</i>
    ви також можете вказати поточне значення конкретної частини інструментарію,
    відкривши консоль інструментів розробника <code>about:glean</code>
    та скориставшись <code>testGetValue()</code> API, наприклад,
    <code>Glean.metricCategory.metricName.testGetValue()</code>.
# Do not translate strings between <code> </code> tags.
about-glean-adhoc-note =
    Зауважте, що ви використовуєте Glean JS API в консолі devtools.
    Це означає, що категорія та назва метрики має формат
    <code>camelCase</code>, на відміну від Rust і C++ API.
controls-button-label-verbose = Застосувати налаштування та відправити ping
about-glean-about-data-header = Про дані
about-glean-about-data-explanation =
    Щоб переглянути список зібраних даних, зверніться до
    <a data-l10n-name="glean-dictionary-link">Словника { -glean-brand-name }</a>.
