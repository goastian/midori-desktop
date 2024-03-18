# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### These strings are used in DevTools’ performance-new panel, about:profiling, and
### the remote profiling panel. There are additional profiler strings in the appmenu.ftl
### file that are used for the profiler popup.

perftools-intro-title = Налаштування Profiler
perftools-intro-description =
    Записи запускають profiler.firefox.com у новій вкладці. Усі дані зберігаються
    локально, але ви можете вивантажити їх для оприлюднення.

## All of the headings for the various sections.

perftools-heading-settings = Усі налаштування
perftools-heading-buffer = Налаштування буфера
perftools-heading-features = Функції
perftools-heading-features-default = Функції (Рекомендовано увімкнути типово)
perftools-heading-features-disabled = Вимкнені функції
perftools-heading-features-experimental = Експериментальне
perftools-heading-threads = Потоки
perftools-heading-threads-jvm = Потоки JVM
perftools-heading-local-build = Локальна збірка

##

perftools-description-intro =
    Записи запускають <a>profiler.firefox.com</a> у новій вкладці. Усі дані зберігаються
    локально, але ви можете вивантажити їх для оприлюднення.
perftools-description-local-build =
    Якщо ви профілюєте збірку, яку склали власноруч на цьому
    комп'ютері, додайте objdir своєї збірки до списку внизу,
    щоб можна було виявляти інформацію про символи.

## The controls for the interval at which the profiler samples the code.

perftools-range-interval-label = Інтервал вибірки:
perftools-range-interval-milliseconds = { NUMBER($interval, maxFractionalUnits: 2) } мс

##

# The size of the memory buffer used to store things in the profiler.
perftools-range-entries-label = Розмір буфера:

perftools-custom-threads-label = Додати власні потоки за назвою:

perftools-devtools-interval-label = Інтервал:
perftools-devtools-threads-label = Потоки:
perftools-devtools-settings-label = Налаштування

## Various statuses that affect the current state of profiling, not typically displayed.

perftools-status-recording-stopped-by-another-tool = Запис було зупинено іншим інструментом.
perftools-status-restart-required = Щоб увімкнути цю функцію, потрібно перезапустити браузер.

## These are shown briefly when the user is waiting for the profiler to respond.

perftools-request-to-stop-profiler = Зупинення запису
perftools-request-to-get-profile-and-stop-profiler = Захоплення профілю

##

perftools-button-start-recording = Почати запис
perftools-button-capture-recording = Захоплення запису
perftools-button-cancel-recording = Скасувати запис
perftools-button-save-settings = Зберегти налаштування і повернутись
perftools-button-restart = Перезапустити
perftools-button-add-directory = Додати директорію
perftools-button-remove-directory = Видалити вибране
perftools-button-edit-settings = Змінити налаштування…

## These messages are descriptions of the threads that can be enabled for the profiler.

perftools-thread-gecko-main =
    .title = Основні процеси для процесу вищого рівня та процесу вмісту
perftools-thread-compositor =
    .title = Складає разом різні розфарбовані елементи на сторінці
perftools-thread-dom-worker =
    .title = Це стосується web workers та service workers
perftools-thread-renderer =
    .title = Коли увімкнено WebRender, потік, який виконує виклики OpenGL
perftools-thread-render-backend =
    .title = Потік WebRender RenderBackend
perftools-thread-timer =
    .title = Таймери обробки потоків (setTimeout, setInterval, nsITimer)
perftools-thread-style-thread =
    .title = Обчислення стилів розділено на декілька потоків
pref-thread-stream-trans =
    .title = Передача мережевого потоку
perftools-thread-socket-thread =
    .title = Потік, де мережевий код виконує будь-які виклики блокування сокета
perftools-thread-img-decoder =
    .title = Потоки декодування зображень
perftools-thread-dns-resolver =
    .title = У цьому потоці відбувається визначення DNS
perftools-thread-task-controller =
    .title = Потоки збірних потоків TaskController
perftools-thread-jvm-gecko =
    .title = Основний потік Gecko JVM
perftools-thread-jvm-nimbus =
    .title = Основні потоки для експериментального Nimbus SDK
perftools-thread-jvm-default-dispatcher =
    .title = Усталений диспетчер для бібліотеки співпрограм Kotlin
perftools-thread-jvm-glean =
    .title = Основні потоки для пакунка телеметрії Glean SDK
perftools-thread-jvm-arch-disk-io =
    .title = Диспетчер IO для бібліотеки співпрограм Kotlin
perftools-thread-jvm-pool =
    .title = Потоки, створені в об'єднанні потоків без назви

##

perftools-record-all-registered-threads = Обходити вибране вгорі й записувати всі зареєстровані потоки

perftools-tools-threads-input-label =
    .title = Назви потоків є розділеним комами списком, що використовується для увімкнення профілювання потоків у Profiler. Для включення, назва повинна мати лише частковий збіг з назвою потоку. Вони чутливі до пробілів.

## Onboarding UI labels. These labels are displayed in the new performance panel UI, when
## devtools.performance.new-panel-onboarding preference is true.

perftools-onboarding-message = <b>Нове</b>: { -profiler-brand-name } тепер вбудовано в Інструменти розробника. <a>Дізнайтеся докладніше</a> про цей потужний новий інструмент.

perftools-onboarding-close-button =
    .aria-label = Закрити вітальне повідомлення

## Profiler presets


# Presets and their l10n IDs are defined in the file
# devtools/client/performance-new/popup/background.jsm.js
# The same labels and descriptions are also defined in appmenu.ftl.


# Presets and their l10n IDs are defined in the file
# devtools/client/performance-new/shared/background.jsm.js
# The same labels and descriptions are also defined in appmenu.ftl.

perftools-presets-web-developer-label = Веброзробник
perftools-presets-web-developer-description = Рекомендовані попередні налаштування для налагодження більшості вебзастосунків. З низьким споживанням ресурсів.

perftools-presets-firefox-label = { -brand-shorter-name }
perftools-presets-firefox-description = Рекомендовані налаштування для профілювання { -brand-shorter-name }.

perftools-presets-graphics-label = Графіка
perftools-presets-graphics-description = Налаштування для виявлення помилок графіки в { -brand-shorter-name }.

perftools-presets-media-label = Медіа
perftools-presets-media-description2 = Налаштування для виявлення помилок аудіо та відео в { -brand-shorter-name }.

perftools-presets-networking-label = Мережа
perftools-presets-networking-description = Налаштування для виявлення помилок мережі в { -brand-shorter-name }.

# "Power" is used in the sense of energy (electricity used by the computer).
perftools-presets-power-label = Потужність
perftools-presets-power-description = Налаштування для виявлення помилок використання потужності { -brand-shorter-name } із низьким накладанням.

perftools-presets-custom-label = Власні

##

