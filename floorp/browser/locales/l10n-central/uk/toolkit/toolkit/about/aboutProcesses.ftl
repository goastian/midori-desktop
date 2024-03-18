# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Page title
about-processes-title = Менеджер процесів

# The Actions column
about-processes-column-action =
    .title = Дії

## Tooltips

about-processes-shutdown-process =
    .title = Розвантажити вкладки та вбити процес
about-processes-shutdown-tab =
    .title = Закрити вкладку

# Profiler icons
# Variables:
#    $duration (Number) The time in seconds during which the profiler will be running.
#                       The value will be an integer, typically less than 10.
about-processes-profile-process =
    .title =
        { $duration ->
            [one] Записати профіль усіх потоків цього процесу впродовж { $duration } секунди
            [few] Записати профіль усіх потоків цього процесу впродовж { $duration } секунд
           *[many] Записати профіль усіх потоків цього процесу впродовж { $duration } секунд
        }

## Column headers

about-processes-column-name = Назва
about-processes-column-memory-resident = Пам'ять
about-processes-column-cpu-total = ЦП

## Process names
## Variables:
##    $pid (String) The process id of this process, assigned by the OS.

about-processes-browser-process = { -brand-short-name } ({ $pid })
about-processes-web-process = Спільний веб процес ({ $pid })
about-processes-file-process = Файли ({ $pid })
about-processes-extension-process = Розширення ({ $pid })
about-processes-privilegedabout-process = Сторінки about ({ $pid })
about-processes-plugin-process = Плагіни ({ $pid })
about-processes-privilegedmozilla-process = { -vendor-short-name } сайти ({ $pid })
about-processes-gmp-plugin-process = Медіа-плагіни Gecko ({ $pid })
about-processes-gpu-process = GPU ({ $pid })
about-processes-vr-process = VR ({ $pid })
about-processes-rdd-process = Декодер даних ({ $pid })
about-processes-socket-process = Мережа ({ $pid })
about-processes-remote-sandbox-broker-process = Віддалений брокер пісочниці ({ $pid })
about-processes-fork-server-process = Сервер розгалуження ({ $pid })
about-processes-preallocated-process = Попередньо розподілено ({ $pid })
about-processes-utility-process = Утиліта ({ $pid })

# Unknown process names
# Variables:
#    $pid (String) The process id of this process, assigned by the OS.
#    $type (String) The raw type for this process.
about-processes-unknown-process = Інше: { $type } ({ $pid })

## Isolated process names
## Variables:
##    $pid (String) The process id of this process, assigned by the OS.
##    $origin (String) The domain name for this process.

about-processes-web-isolated-process = { $origin } ({ $pid })
about-processes-web-serviceworker = { $origin } ({ $pid }, serviceworker)
about-processes-with-coop-coep-process = { $origin } ({ $pid }, ізольовано від сторонніх джерел)
about-processes-web-isolated-process-private = { $origin } — Приватний ({ $pid })
about-processes-with-coop-coep-process-private = { $origin } — Приватний ({ $pid }, ізольовано від сторонніх джерел)

## Details within processes

# Single-line summary of threads (non-idle process)
# Variables:
#    $number (Number) The number of threads in the process. Typically larger
#                     than 30. We don't expect to ever have processes with less
#                     than 5 threads.
#    $active (Number) The number of active threads in the process.
#                     The value will be greater than 0 and will never be
#                     greater than $number.
#    $list (String) Comma separated list of active threads.
#                   Can be an empty string if the process is idle.
about-processes-active-threads =
    { $active ->
        [one] { $active } активний потік з { $number }: { $list }
        [few] { $active } активні потоки з { $number }: { $list }
        [many] { $active } активних потоків з { $number }: { $list }
       *[other] { $active } активних потоків з { $number }: { $list }
    }

# Single-line summary of threads (idle process)
# Variables:
#    $number (Number) The number of threads in the process. Typically larger
#                     than 30. We don't expect to ever have processes with less
#                     than 5 threads.
#                     The process is idle so all threads are inactive.
about-processes-inactive-threads =
    { $number ->
        [one] { $number } неактивний потік
        [few] { $number } неактивні потоки
        [many] { $number } неактивних потоків
       *[other] { $number } неактивних потоків
    }

# Thread details
# Variables:
#   $name (String) The name assigned to the thread.
#   $tid (String) The thread id of this thread, assigned by the OS.
about-processes-thread-name-and-id = { $name }
    .title = Ідентифікатор потоку: { $tid }

# Tab
# Variables:
#   $name (String) The name of the tab (typically the title of the page, might be the url while the page is loading).
about-processes-tab-name = Вкладка: { $name }
about-processes-preloaded-tab = Попередньо завантажена нова вкладка

# Single subframe
# Variables:
#   $url (String) The full url of this subframe.
about-processes-frame-name-one = Підфрейм: { $url }

# Group of subframes
# Variables:
#   $number (Number) The number of subframes in this group. Always ≥ 1.
#   $shortUrl (String) The shared prefix for the subframes in the group.
about-processes-frame-name-many = Підфрейми ({ $number }): { $shortUrl }

## Utility process actor names

about-processes-utility-actor-unknown = Невідомий виконавець
about-processes-utility-actor-audio-decoder-generic = Загальний аудіо декодер
about-processes-utility-actor-audio-decoder-applemedia = Аудіодекодер Apple Media
about-processes-utility-actor-audio-decoder-wmf = Аудіодекодер Windows Media Framework
about-processes-utility-actor-mf-media-engine = Windows Media Foundation Media Engine CDM
# "Oracle" refers to an internal Firefox process and should be kept in English
about-processes-utility-actor-js-oracle = JavaScript Oracle
about-processes-utility-actor-windows-utils = Утиліти Windows

## Displaying CPU (percentage and total)
## Variables:
##    $percent (Number) The percentage of CPU used by the process or thread.
##                      Always > 0, generally <= 200.
##    $total (Number) The amount of time used by the process or thread since
##                    its start.
##    $unit (String) The unit in which to display $total. See the definitions
##                   of `duration-unit-*`.

# Common case.
about-processes-cpu = { NUMBER($percent, maximumSignificantDigits: 2, style: "percent") }
    .title = Загальний час CPU: { NUMBER($total, maximumFractionDigits: 0) }{ $unit }

# Special case: data is not available yet.
about-processes-cpu-user-and-kernel-not-ready = (вимірювання)

# Special case: process or thread is almost idle (using less than 0.1% of a CPU core).
# This case only occurs on Windows where the precision of the CPU times is low.
about-processes-cpu-almost-idle = < 0.1%
    .title = Загальний час CPU: { NUMBER($total, maximumFractionDigits: 0) }{ $unit }

# Special case: process or thread is currently idle.
about-processes-cpu-fully-idle = idle
    .title = Загальний час CPU: { NUMBER($total, maximumFractionDigits: 0) }{ $unit }

## Displaying Memory (total and delta)
## Variables:
##    $total (Number) The amount of memory currently used by the process.
##    $totalUnit (String) The unit in which to display $total. See the definitions
##                        of `memory-unit-*`.
##    $delta (Number) The absolute value of the amount of memory added recently.
##    $deltaSign (String) Either "+" if the amount of memory has increased
##                        or "-" if it has decreased.
##    $deltaUnit (String) The unit in which to display $delta. See the definitions
##                        of `memory-unit-*`.

# Common case.
about-processes-total-memory-size-changed = { NUMBER($total, maximumFractionDigits: 0) }{ $totalUnit }
    .title = Динаміка: { $deltaSign }{ NUMBER($delta, maximumFractionDigits: 0) }{ $deltaUnit }

# Special case: no change.
about-processes-total-memory-size-no-change = { NUMBER($total, maximumFractionDigits: 0) }{ $totalUnit }

## Duration units

duration-unit-ns = нс
duration-unit-us = мкс
duration-unit-ms = мс
duration-unit-s = с
duration-unit-m = хв
duration-unit-h = г
duration-unit-d = д

## Memory units

memory-unit-B = Б
memory-unit-KB = КБ
memory-unit-MB = МБ
memory-unit-GB = ГБ
memory-unit-TB = ТБ
memory-unit-PB = ПБ
memory-unit-EB = ЕБ
