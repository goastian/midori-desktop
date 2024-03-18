# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

download-ui-confirm-title = Скасувати всі завантаження?

## Variables:
##   $downloadsCount (Number): The current downloads count.

download-ui-confirm-quit-cancel-downloads =
    { $downloadsCount ->
        [1] Якщо ви вийдете зараз, завантаження буде скасовано. Ви дійсно бажаєте вийти?
       *[other] Якщо ви вийдете зараз, буде скасовано { $downloadsCount } завантажень. Ви дійсно бажаєте вийти?
    }
download-ui-confirm-quit-cancel-downloads-mac =
    { $downloadsCount ->
        [1] Якщо ви вийдете зараз, завантаження буде скасовано. Ви дійсно бажаєте вийти?
       *[other] Якщо ви вийдете зараз, буде скасовано { $downloadsCount } завантажень. Ви дійсно бажаєте вийти?
    }
download-ui-dont-quit-button =
    { PLATFORM() ->
        [mac] Не завершувати роботу
       *[other] Не завершувати роботу
    }

download-ui-confirm-offline-cancel-downloads =
    { $downloadsCount ->
        [1] Якщо ви зараз перейдете в автономний режим роботи, буде скасовано одне завантаження. Продовжити?
       *[other] Якщо ви зараз перейдете в автономний режим роботи, буде скасовано { $downloadsCount } завантажень. Ви дійсно цього бажаєте?
    }
download-ui-dont-go-offline-button = Залишатися онлайн

download-ui-confirm-leave-private-browsing-windows-cancel-downloads =
    { $downloadsCount ->
        [1] Якщо ви закриєте всі вікна приватного перегляду, 1 завантаження буде скасоване. Ви дійсно хочете вийти з режиму приватного перегляду?
       *[other] Якщо ви закриєте всі вікна приватного перегляду, { $downloadsCount } завантажень будуть скасовані. Ви дійсно хочете вийти з режиму приватного перегляду?
    }
download-ui-dont-leave-private-browsing-button = Залишитись в режимі приватного перегляду

download-ui-cancel-downloads-ok =
    { $downloadsCount ->
        [1] Скасувати завантаження
       *[other] Скасувати { $downloadsCount } завантажень
    }

##

download-ui-file-executable-security-warning-title = Відкрити виконуваний файл?
# Variables:
#   $executable (String): The executable file to be opened.
download-ui-file-executable-security-warning = “{ $executable }” є виконуваним файлом. Виконувані файли можуть містити віруси або інший небезпечний код, що може нашкодити вашому комп'ютеру. Будьте обережні, відкриваючи цей файл. Ви справді хочете запустити файл “{ $executable }”?
