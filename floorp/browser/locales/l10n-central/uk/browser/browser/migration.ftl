# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

migration-wizard =
    .title = Майстер імпорту

import-from =
    { PLATFORM() ->
        [windows] Імпортувати налаштування, закладки, історію, паролі та інші дані з:
       *[other] Імпортувати налаштування, закладки, історію, паролі та інші дані з:
    }

import-from-bookmarks = Імпорт закладок з:
import-from-ie =
    .label = Microsoft Internet Explorer
    .accesskey = M
import-from-edge =
    .label = Microsoft Edge
    .accesskey = E
import-from-edge-legacy =
    .label = Microsoft Edge (застарілий)
    .accesskey = л
import-from-edge-beta =
    .label = Microsoft Edge Beta
    .accesskey = d
import-from-nothing =
    .label = Не імпортувати нічого
    .accesskey = Н
import-from-safari =
    .label = Safari
    .accesskey = S
import-from-opera =
    .label = Opera
    .accesskey = O
import-from-vivaldi =
    .label = Vivaldi
    .accesskey = V
import-from-brave =
    .label = Brave
    .accesskey = r
import-from-canary =
    .label = Chrome Canary
    .accesskey = n
import-from-chrome =
    .label = Chrome
    .accesskey = C
import-from-chrome-beta =
    .label = Chrome Beta
    .accesskey = B
import-from-chrome-dev =
    .label = Chrome Dev
    .accesskey = D
import-from-chromium =
    .label = Chromium
    .accesskey = u
import-from-firefox =
    .label = Firefox
    .accesskey = X
import-from-360se =
    .label = 360 Secure Browser
    .accesskey = 3
import-from-opera-gx =
    .label = Opera GX
    .accesskey = G

no-migration-sources = Не знайдено жодної програми із закладками, історією чи паролями.

import-source-page-title = Імпорт налаштувань і даних
import-items-page-title = Елементи для імпорту

import-items-description = Виберіть елементи для імпорту:

import-permissions-page-title = Надайте дозволи для { -brand-short-name }

# Do not translate "Safari" (the name of the browser on Apple devices)
import-safari-permissions-string = macOS вимагає від вас явного дозволу на доступ { -brand-short-name } до даних Safari. Клацніть “Продовжити”, виберіть теку “Safari“ у діалоговому вікні Finder, яке з’явиться, а потім натисніть “Відкрити”.

import-migrating-page-title = Триває імпорт…

import-migrating-description = Наразі триває імпортування зазначених елементів…

import-select-profile-page-title = Вибір профілю

import-select-profile-description = Можна виконати імпортування з таких доступних профілів:

import-done-page-title = Імпорт успішно завершений

import-done-description = Зазначені елементи успішно імпортовано:

import-close-source-browser = Перед продовженням переконайтеся, що вибраний браузер закрито.

source-name-ie = Internet Explorer
source-name-edge = Microsoft Edge
source-name-chrome = Google Chrome

imported-safari-reading-list = Список читання (з Safari)
imported-edge-reading-list = Список читання (з Edge)

## Browser data types
## All of these strings get a $browser variable passed in.
## You can use the browser variable to differentiate the name of items,
## which may have different labels in different browsers.
## The supported values for the $browser variable are:
## 360se
## chrome
## edge
## firefox
## ie
## safari
## The various beta and development versions of edge and chrome all get
## normalized to just "edge" and "chrome" for these strings.

browser-data-cookies-checkbox =
    .label = Куки
browser-data-cookies-label =
    .value = Куки

browser-data-history-checkbox =
    .label =
        { $browser ->
            [firefox] Історія перегляду й закладки
           *[other] Історія перегляду
        }
browser-data-history-label =
    .value =
        { $browser ->
            [firefox] Історія перегляду й закладки
           *[other] Історія перегляду
        }

browser-data-formdata-checkbox =
    .label = Історія збережених форм
browser-data-formdata-label =
    .value = Історія збережених форм

# This string should use the same phrase for "logins and passwords" as the
# label in the main hamburger menu that opens about:logins.
browser-data-passwords-checkbox =
    .label = Збережені паролі
# This string should use the same phrase for "logins and passwords" as the
# label in the main hamburger menu that opens about:logins.
browser-data-passwords-label =
    .value = Збережені паролі

browser-data-bookmarks-checkbox =
    .label = Закладки
browser-data-bookmarks-label =
    .value = Закладки

browser-data-otherdata-checkbox =
    .label = Інші дані
browser-data-otherdata-label =
    .label = Інші дані

browser-data-session-checkbox =
    .label = Вікна і вкладки
browser-data-session-label =
    .value = Вікна і вкладки

browser-data-payment-methods-checkbox =
    .label = Способи оплати
browser-data-payment-methods-label =
    .value = Способи оплати
