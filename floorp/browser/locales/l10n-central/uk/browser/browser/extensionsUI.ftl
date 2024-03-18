# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

webext-perms-learn-more = Докладніше
# Variables:
#   $addonName (String): localized named of the extension that is asking to change the default search engine.
#   $currentEngine (String): name of the current search engine.
#   $newEngine (String): name of the new search engine.
webext-default-search-description = { $addonName } бажає змінити ваш типовий засіб пошуку з { $currentEngine } на { $newEngine }. Ви згодні?
webext-default-search-yes =
    .label = Так
    .accesskey = Т
webext-default-search-no =
    .label = Ні
    .accesskey = Н
# Variables:
#   $addonName (String): localized named of the extension that was just installed.
addon-post-install-message = { $addonName } додано.

## A modal confirmation dialog to allow an extension on quarantined domains.

# Variables:
#   $addonName (String): localized name of the extension.
webext-quarantine-confirmation-title = Запускати { $addonName } на обмежуваних сайтах?
webext-quarantine-confirmation-line-1 = Щоб захистити ваші дані, це розширення не дозволено на цьому сайті.
webext-quarantine-confirmation-line-2 = Якщо ви довіряєте цьому розширенню, дозвольте йому читати та змінювати ваші дані на сайтах, доступ до яких обмежує { -vendor-short-name }.
webext-quarantine-confirmation-allow =
    .label = Дозволити
    .accesskey = о
webext-quarantine-confirmation-deny =
    .label = Не дозволяти
    .accesskey = Н
