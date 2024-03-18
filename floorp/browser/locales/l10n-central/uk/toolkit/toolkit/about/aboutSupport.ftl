# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

page-title = Інформація для усунення проблем
page-subtitle =
    Ця сторінка містить технічну інформацію, що може стати в пригоді під час усунення проблем.
    Якщо ж вам потрібні відповіді на поширені питання про { -brand-short-name },
    відвідайте наш <a data-l10n-name="support-link">сайт підтримки</a>.
crashes-title = Звіти про збої
crashes-id = ID звіту
crashes-send-date = Надіслано
crashes-all-reports = Усі звіти про збої
crashes-no-config = Ця програма не була налаштована показувати звіти про збої.
support-addons-title = Додатки
support-addons-name = Назва
support-addons-type = Тип
support-addons-enabled = Увімкнено
support-addons-version = Версія
support-addons-id = ID
legacy-user-stylesheets-title = Застарілі користувацькі таблиці стилів
legacy-user-stylesheets-enabled = Активні
legacy-user-stylesheets-stylesheet-types = Таблиці стилів
legacy-user-stylesheets-no-stylesheets-found = Таблиці стилів не знайдено
security-software-title = Програмне забезпечення для захисту
security-software-type = Тип
security-software-name = Назва
security-software-antivirus = Антивірус
security-software-antispyware = Захист від шпигунства
security-software-firewall = Мережевий екран
features-title = Можливості { -brand-short-name }
features-name = Назва
features-version = Версія
features-id = ID
processes-title = Віддалені процеси
processes-type = Тип
processes-count = Кількість
app-basics-title = Інформація про програму
app-basics-name = Назва
app-basics-version = Версія
app-basics-build-id = ID збірки
app-basics-distribution-id = ID дистрибутиву
app-basics-update-channel = Канал оновлення
# This message refers to the folder used to store updates on the device,
# as in "Folder for updates". "Update" is a noun, not a verb.
app-basics-update-dir =
    { PLATFORM() ->
        [linux] Тека оновлення
       *[other] Каталог оновлення
    }
app-basics-update-history = Історія оновлень
app-basics-show-update-history = Показати історію оновлень
# Represents the path to the binary used to start the application.
app-basics-binary = Бінарний файл програми
app-basics-profile-dir =
    { PLATFORM() ->
        [linux] Тека профілю
       *[other] Тека профілю
    }
app-basics-enabled-plugins = Увімкнені плагіни
app-basics-build-config = Конфігурація збірки
app-basics-user-agent = User Agent
app-basics-os = ОС
app-basics-os-theme = Тема ОС
# Rosetta is Apple's translation process to run apps containing x86_64
# instructions on Apple Silicon. This should remain in English.
app-basics-rosetta = Перекладено Rosetta
app-basics-memory-use = Використання пам'яті
app-basics-performance = Швидкодія
app-basics-service-workers = Зареєстровані Service Workers
app-basics-third-party = Сторонні модулі
app-basics-profiles = Профілі
app-basics-launcher-process-status = Процес запуску
app-basics-multi-process-support = Багатопроцесні вікна
app-basics-fission-support = Вікна Fission
app-basics-remote-processes-count = Віддалені процеси
app-basics-enterprise-policies = Корпоративні правила
app-basics-location-service-key-google = Ключ служби Google Location
app-basics-safebrowsing-key-google = Ключ Google Safebrowsing
app-basics-key-mozilla = Ключ Служби визначення розташування від Mozilla
app-basics-safe-mode = Безпечний режим
app-basics-memory-size = Обсяг пам'яті (RAM)
app-basics-disk-available = Доступний простір на диску
app-basics-pointing-devices = Вказівні пристрої
# Variables:
#   $value (number) - Amount of data being stored
#   $unit (string) - The unit of data being stored (e.g. MB)
app-basics-data-size = { $value } { $unit }
show-dir-label =
    { PLATFORM() ->
        [macos] Показати у Finder
        [windows] Відкрити теку
       *[other] Відкрити каталог
    }
environment-variables-title = Змінні середовища
environment-variables-name = Назва
environment-variables-value = Значення
experimental-features-title = Експериментальні можливості
experimental-features-name = Назва
experimental-features-value = Значення
modified-key-prefs-title = Важливі змінені налаштування
modified-prefs-name = Назва
modified-prefs-value = Значення
user-js-title = Вподобання user.js
user-js-description = Ваша папка профілю містить <a data-l10n-name="user-js-link">файл user.js file</a> з вподобаннями, котрі не були створені програмою { -brand-short-name }.
locked-key-prefs-title = Важливі заблоковані налаштування
locked-prefs-name = Назва
locked-prefs-value = Значення
graphics-title = Графіка
graphics-features-title = Можливості
graphics-diagnostics-title = Діагностика
graphics-failure-log-title = Журнал збоїв
graphics-gpu1-title = GPU #1
graphics-gpu2-title = GPU #2
graphics-decision-log-title = Журнал рішень
graphics-crash-guards-title = Можливості, вимкнені захистом від збоїв
graphics-workarounds-title = Способи обходу
graphics-device-pixel-ratios = Піксельне співвідношення вікна пристрою
# Windowing system in use on Linux (e.g. X11, Wayland).
graphics-window-protocol = Віконний протокол
# Desktop environment in use on Linux (e.g. GNOME, KDE, XFCE, etc).
graphics-desktop-environment = Середовище робочого столу
place-database-title = База даних Places
place-database-stats = Статистика
place-database-stats-show = Показати статистику
place-database-stats-hide = Приховати статистику
place-database-stats-entity = Об'єкт
place-database-stats-count = Кількість
place-database-stats-size-kib = Розмір (КіБ)
place-database-stats-size-perc = Розмір (%)
place-database-stats-efficiency-perc = Ефективність (%)
place-database-stats-sequentiality-perc = Послідовність (%)
place-database-integrity = Цілісність
place-database-verify-integrity = Перевірити цілісність
a11y-title = Доступність
a11y-activated = Активовано
a11y-force-disabled = Блокувати можливості доступності
a11y-handler-used = Використовується обробник доступності
a11y-instantiator = Виконуваний файл доступності
library-version-title = Версії бібліотек
copy-text-to-clipboard-label = Копіювати текст у буфер
copy-raw-data-to-clipboard-label = Копіювати необроблені дані в буфер
sandbox-title = Пісочниця
sandbox-sys-call-log-title = Відхилені системні виклики
sandbox-sys-call-index = #
sandbox-sys-call-age = Секунд тому
sandbox-sys-call-pid = PID
sandbox-sys-call-tid = TID
sandbox-sys-call-proc-type = Тип процесу
sandbox-sys-call-number = Системний виклик
sandbox-sys-call-args = Аргументи
troubleshoot-mode-title = Визначення проблем
restart-in-troubleshoot-mode-label = Режим усунення проблем…
clear-startup-cache-title = Спробуйте очистити кеш запуску
clear-startup-cache-label = Очистити кеш запуску…
startup-cache-dialog-title2 = Перезапустити { -brand-short-name } для очищення кешу запуску?
startup-cache-dialog-body2 = Це не змінить ваші налаштування та не вилучить розширення.
restart-button-label = Перезапустити

## Media titles

audio-backend = Обробка аудіо
max-audio-channels = Максимальне число каналів
sample-rate = Основна частота
roundtrip-latency = Затримка в обох напрямках (стандартне відхилення)
media-title = Медіа
media-output-devices-title = Пристрої відтворення
media-input-devices-title = Пристрої введення
media-device-name = Назва
media-device-group = Група
media-device-vendor = Постачальник
media-device-state = Стан
media-device-preferred = Основний
media-device-format = Формат
media-device-channels = Канали
media-device-rate = Частота
media-device-latency = Затримка
media-capabilities-title = Медіа-можливості
media-codec-support-info = Інформація про підтримку кодеків
# List all the entries of the database.
media-capabilities-enumerate = Перерахувати базу даних

## Codec support table

media-codec-support-sw-decoding = Програмне декодування
media-codec-support-hw-decoding = Апаратне декодування
media-codec-support-codec-name = Назва кодека
media-codec-support-supported = Підтримується
media-codec-support-unsupported = Не підтримується
media-codec-support-error = Інформація про підтримку кодеків недоступна. Повторіть спробу після відтворення медіафайлу.

##

intl-title = Інтернаціоналізація та локалізація
intl-app-title = Налаштування програми
intl-locales-requested = Запитані локалі
intl-locales-available = Доступні локалі
intl-locales-supported = Локалі програми
intl-locales-default = Типова локаль
intl-os-title = Операційна система
intl-os-prefs-system-locales = Системні локалі
intl-regional-prefs = Регіональні налаштування

## Remote Debugging
##
## The Firefox remote protocol provides low-level debugging interfaces
## used to inspect state and control execution of documents,
## browser instrumentation, user interaction simulation,
## and for subscribing to browser-internal events.
##
## See also https://firefox-source-docs.mozilla.org/remote/

remote-debugging-title = Віддалене налагодження (Протокол Chromium)
remote-debugging-accepting-connections = Вхідні з'єднання
remote-debugging-url = URL

##

# Variables
# $days (Integer) - Number of days of crashes to log
report-crash-for-days =
    { $days ->
        [one] Звіти за минулий { $days } день
        [few] Звіти за минулі { $days } дні
       *[many] Звіти за минулі { $days } днів
    }
# Variables
# $minutes (integer) - Number of minutes since crash
crashes-time-minutes =
    { $minutes ->
        [one] { $minutes } хвилину тому
        [few] { $minutes } хвилини тому
       *[many] { $minutes } хвилин тому
    }
# Variables
# $hours (integer) - Number of hours since crash
crashes-time-hours =
    { $hours ->
        [one] { $hours } годину тому
        [few] { $hours } години тому
       *[many] { $hours } годин тому
    }
# Variables
# $days (integer) - Number of days since crash
crashes-time-days =
    { $days ->
        [one] { $days } день тому
        [few] { $days } дні тому
       *[many] { $days } днів тому
    }
# Variables
# $reports (integer) - Number of pending reports
pending-reports =
    { $reports ->
        [one] Усі звіти про збої (за вказаний проміжок часу, включно з { $reports }, що очікує надсилання)
        [few] Усі звіти про збої (за вказаний проміжок часу, включно з { $reports }, що очікує надсилання)
       *[many] Усі звіти про збої (за вказаний проміжок часу, включно з { $reports }, що очікують надсилання)
    }
raw-data-copied = Необроблені дані скопійовано в буфер
text-copied = Текст скопійовано в буфер

## The verb "blocked" here refers to a graphics feature such as "Direct2D" or "OpenGL layers".

blocked-driver = Заблоковано для вашої версії графічного драйвера.
blocked-gfx-card = Заблоковано для вашого графічного процесора через нерозв'язані проблеми з драйвером.
blocked-os-version = Заблоковано для вашої версії операційної системи.
blocked-mismatched-version = Заблоковано через невідповідність версії вашого графічного драйвера в реєстрі та DLL.
# Variables
# $driverVersion - The graphics driver version string
try-newer-driver = Заблоковано для вашого графічного драйвера. Спробуйте оновити графічний драйвер до версії { $driverVersion } чи новішої.
# "ClearType" is a proper noun and should not be translated. Feel free to leave English strings if
# there are no good translations, these are only used in about:support
clear-type-parameters = Параметри ClearType
compositing = Композиція
hardware-h264 = Апаратне декодування H264
main-thread-no-omtc = головний потік, не OMTC
yes = Так
no = Ні
unknown = Невідомо
virtual-monitor-disp = Відображення віртуального монітора

## The following strings indicate if an API key has been found.
## In some development versions, it's expected for some API keys that they are
## not found.

found = Знайдено
missing = Відсутнє
gpu-process-pid = GPUProcessPid
gpu-process = GPUProcess
gpu-description = Опис
gpu-vendor-id = ID виробника
gpu-device-id = ID пристрою
gpu-subsys-id = ID підсистеми
gpu-drivers = Драйвери
gpu-ram = RAM
gpu-driver-vendor = Постачальник драйвера
gpu-driver-version = Версія драйвера
gpu-driver-date = Дата драйвера
gpu-active = Активний
webgl1-wsiinfo = WebGL 1 - Інформація WSI драйвера
webgl1-renderer = WebGL 1 - Візуалізатор драйвера
webgl1-version = WebGL 1 - Версія драйвера
webgl1-driver-extensions = WebGL 1 - Розширення драйвера
webgl1-extensions = WebGL 1 - Розширення
webgl2-wsiinfo = WebGL 2 - Інформація WSI драйвера
webgl2-renderer = Засіб візуалізації WebGL2
webgl2-version = WebGL 2 - Версія драйвера
webgl2-driver-extensions = WebGL 2 - Розширення драйвера
webgl2-extensions = WebGL 2 - Розширення
webgpu-default-adapter = Стандартний адаптер WebGPU
webgpu-fallback-adapter = Запасний адаптер WebGPU
# Variables
#   $bugNumber (string) - Bug number on Bugzilla
support-blocklisted-bug = Заблоковано, у зв'язку з відомими проблемами: <a data-l10n-name="bug-link">звіт { $bugNumber }</a>
# Variables
# $failureCode (string) - String that can be searched in the source tree.
unknown-failure = Заблоковано; код помилки { $failureCode }
d3d11layers-crash-guard = Композитор D3D11
glcontext-crash-guard = OpenGL
wmfvpxvideo-crash-guard = Відео декодер WMF VPX
reset-on-next-restart = Скинути за наступного перезапуску
gpu-process-kill-button = Завершити GPU процес
gpu-device-reset = Скидання пристрою
gpu-device-reset-button = Виконати скидання пристрою
uses-tiling = Використовує тайлинг
content-uses-tiling = Використовує тайлінг (вміст)
off-main-thread-paint-enabled = Вимальовування поза основним потоком увімкнено
off-main-thread-paint-worker-count = Число воркерів вимальовування поза основним потоком
target-frame-rate = Цільова частота кадрів
min-lib-versions = Очікувана мінімальна версія
loaded-lib-versions = Поточна версія
has-seccomp-bpf = Seccomp-BPF (Фільтрування системних викликів)
has-seccomp-tsync = Синхронізація потоку Seccomp
has-user-namespaces = Користувацькі простори імен
has-privileged-user-namespaces = Користувацькі простори імен для привілейованих процесів
can-sandbox-content = Пісочниця для процесу вмісту
can-sandbox-media = Пісочниця для плагіна медіа
content-sandbox-level = Рівень пісочниці процесів вмісту
effective-content-sandbox-level = Ефективний рівень ізоляції процесу вмісту
content-win32k-lockdown-state = Стан блокування Win32k для процесу вмісту
support-sandbox-gpu-level = Рівень пісочниці процесів ГП
sandbox-proc-type-content = вміст
sandbox-proc-type-file = вміст файлу
sandbox-proc-type-media-plugin = медіаплагін
sandbox-proc-type-data-decoder = декодер даних
startup-cache-title = Кеш запуску
startup-cache-disk-cache-path = Шлях дискового кешу
startup-cache-ignore-disk-cache = Ігнорувати дисковий кеш
startup-cache-found-disk-cache-on-init = Знайдено дисковий кеш в Init
startup-cache-wrote-to-disk-cache = Записано в дисковий кеш
launcher-process-status-0 = Увімкнено
launcher-process-status-1 = Вимкнено через збій
launcher-process-status-2 = Примусово вимкнено
launcher-process-status-unknown = Невідомий стан
# Variables
# $remoteWindows (integer) - Number of remote windows
# $totalWindows (integer) - Number of total windows
multi-process-windows = { $remoteWindows }/{ $totalWindows }
# Variables
# $fissionWindows (integer) - Number of remote windows
# $totalWindows (integer) - Number of total windows
fission-windows = { $fissionWindows }/{ $totalWindows }
fission-status-experiment-control = Вимкнено експериментом
fission-status-experiment-treatment = Увімкнено експериментом
fission-status-disabled-by-e10s-env = Вимкнено середовищем
fission-status-enabled-by-env = Увімкнено середовищем
fission-status-disabled-by-env = Вимкнено середовищем
fission-status-enabled-by-default = Увімкнено типово
fission-status-disabled-by-default = Вимкнено типово
fission-status-enabled-by-user-pref = Увімкнено користувачем
fission-status-disabled-by-user-pref = Вимкнено користувачем
fission-status-disabled-by-e10s-other = E10s вимкнено
fission-status-enabled-by-rollout = Увімкнено поетапним випуском
async-pan-zoom = Асинхронне панорамування/зум
apz-none = немає
wheel-enabled = введення коліщатком увімкнено
touch-enabled = сенсорне введення увімкнено
drag-enabled = перетягування смуги прокручування увімкнено
keyboard-enabled = клавіатура увімкнена
autoscroll-enabled = авто-прокручування увімкнено
zooming-enabled = smooth pinch-zoom увімкнено

## Variables
## $preferenceKey (string) - String ID of preference

wheel-warning = асинхронне введення коліщатком вимкнене, через непідтримуваний параметр: { $preferenceKey }
touch-warning = асинхронне сенсорне введення вимкнене, через непідтримуваний параметр: { $preferenceKey }

## Strings representing the status of the Enterprise Policies engine.

policies-inactive = Неактивні
policies-active = Активні
policies-error = Помилка

## Printing section

support-printing-title = Друк
support-printing-troubleshoot = Усунення проблем
support-printing-clear-settings-button = Очистити збережені налаштування друку
support-printing-modified-settings = Змінені налаштування друку
support-printing-prefs-name = Назва
support-printing-prefs-value = Значення

## Normandy sections

support-remote-experiments-title = Віддалені експерименти
support-remote-experiments-name = Назва
support-remote-experiments-branch = Гілка експерименту
support-remote-experiments-see-about-studies = Перегляньте <a data-l10n-name="support-about-studies-link">about:studies</a> для докладнішої інформації, включаючи інструкції про те, як вимкнути певні експерименти, або як вимкнути для { -brand-short-name } виконання експериментів такого типу в майбутньому.
support-remote-features-title = Віддалені функції
support-remote-features-name = Назва
support-remote-features-status = Стан

## Pointing devices

pointing-device-mouse = Миша
pointing-device-touchscreen = Сенсорний екран
pointing-device-pen-digitizer = Цифрові ручки
pointing-device-none = Немає вказівних пристроїв
