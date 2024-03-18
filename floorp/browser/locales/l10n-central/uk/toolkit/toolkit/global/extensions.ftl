# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Headers used in the webextension permissions dialog,
## See https://bug1308309.bmoattachments.org/attachment.cgi?id=8814612
## for an example of the full dialog.
## Note: This string will be used as raw markup. Avoid characters like <, >, &
## Variables:
##   $extension (String): replaced with the localized name of the extension.

webext-perms-header = Додати { $extension }?
webext-perms-header-with-perms = Додати { $extension }? Це розширення матиме дозвіл:
webext-perms-header-unsigned = Додати { $extension }? Це розширення неперевірене. Зловмисні розширення можуть викрадати вашу особисту інформацію, або компрометувати ваш комп'ютер. Додавайте його лише якщо ви впевнені в надійності джерела.
webext-perms-header-unsigned-with-perms = Додати { $extension }? Це розширення неперевірене. Зловмисні розширення можуть викрадати вашу особисту інформацію, або компрометувати ваш комп'ютер. Додавайте його лише якщо ви впевнені в надійності джерела. Це розширення матиме дозвіл:
webext-perms-sideload-header = { $extension } додано
webext-perms-optional-perms-header = { $extension } запитує додаткові дозволи.

##

webext-perms-add =
    .label = Додати
    .accesskey = о
webext-perms-cancel =
    .label = Скасувати
    .accesskey = С

webext-perms-sideload-text = Інша програма на вашому комп'ютері встановила додаток, що може вплинути на ваш браузер. Ознайомтесь із запитами дозволів для цього додатка й оберіть Увімкнути чи Скасувати (щоб залишити його вимкненим).
webext-perms-sideload-text-no-perms = Інша програма на вашому комп'ютері встановила додаток, що може вплинути на ваш браузер. Оберіть Увімкнути чи Скасувати (щоб залишити його вимкненим).
webext-perms-sideload-enable =
    .label = Увімкнути
    .accesskey = У
webext-perms-sideload-cancel =
    .label = Скасувати
    .accesskey = С

# Variables:
#   $extension (String): replaced with the localized name of the extension.
webext-perms-update-text = { $extension } було оновлено. Ви повинні схвалити нові дозволи перед встановленням оновленої версії. Вибравши “Скасувати”, розширення не оновиться і ви продовжите користуватися поточною версією. Це розширення матиме дозвіл:
webext-perms-update-accept =
    .label = Оновити
    .accesskey = н

webext-perms-optional-perms-list-intro = Він хоче отримати дозвіл на:
webext-perms-optional-perms-allow =
    .label = Дозволити
    .accesskey = в
webext-perms-optional-perms-deny =
    .label = Заборонити
    .accesskey = б

webext-perms-host-description-all-urls = Доступ до ваших даних для всіх вебсайтів

# Variables:
#   $domain (String): will be replaced by the DNS domain for which a webextension is requesting access (e.g., mozilla.org)
webext-perms-host-description-wildcard = Доступ до ваших даних для сайтів у домені { $domain }

# Variables:
#   $domainCount (Number): Integer indicating the number of additional
#     hosts for which this webextension is requesting permission.
webext-perms-host-description-too-many-wildcards =
    { $domainCount ->
        [one] Доступ до ваших даних для ще { $domainCount } домену
        [few] Доступ до ваших даних для ще { $domainCount } доменів
       *[many] Доступ до ваших даних для ще { $domainCount } доменів
    }
# Variables:
#   $domain (String): will be replaced by the DNS host name for which a webextension is requesting access (e.g., www.mozilla.org)
webext-perms-host-description-one-site = Доступ до ваших даних для { $domain }

# Variables:
#   $domainCount (Number): Integer indicating the number of additional
#     hosts for which this webextension is requesting permission.
webext-perms-host-description-too-many-sites =
    { $domainCount ->
        [one] Доступ до ваших даних для ще { $domainCount } сайту
        [few] Доступ до ваших даних для ще { $domainCount } сайтів
       *[many] Доступ до ваших даних для ще { $domainCount } сайтів
    }

## Headers used in the webextension permissions dialog for synthetic add-ons.
## The part of the string describing what privileges the extension gives should be consistent
## with the value of webext-site-perms-description-gated-perms-{sitePermission}.
## Note, this string will be used as raw markup. Avoid characters like <, >, &
## Variables:
##   $hostname (String): the hostname of the site the add-on is being installed from.

webext-site-perms-header-with-gated-perms-midi = Цей додаток надає { $hostname } доступ до MIDI-пристроїв.
webext-site-perms-header-with-gated-perms-midi-sysex = Цей додаток надає { $hostname } доступ до MIDI-пристроїв (з підтримкою SysEx).

##

# This string is used as description in the webextension permissions dialog for synthetic add-ons.
# Note, the empty line is used to create a line break between the two sections.
# Note, this string will be used as raw markup. Avoid characters like <, >, &
webext-site-perms-description-gated-perms-midi =
    Зазвичай це підключені пристрої, як-от синтезатори, але також можуть бути вбудовані в комп'ютер засоби.
    
    Зазвичай вебсайтам не дозволяється отримувати доступ до пристроїв MIDI. Неналежне використання може пошкодити систему або поставити під загрозу безпеку.

## Headers used in the webextension permissions dialog.
## Note: This string will be used as raw markup. Avoid characters like <, >, &
## Variables:
##   $extension (String): replaced with the localized name of the extension being installed.
##   $hostname (String): will be replaced by the DNS host name for which a webextension enables permissions.

webext-site-perms-header-with-perms = Додати { $extension }? Це розширення надає для { $hostname } такі можливості:
webext-site-perms-header-unsigned-with-perms = Додати { $extension }? Це розширення неперевірене. Зловмисні розширення можуть викрадати вашу особисту інформацію або створювати ризик для вашого комп'ютера. Додавайте його лише якщо ви впевнені в його надійності. Це розширення надає для { $hostname } такі можливості:

## These should remain in sync with permissions.NAME.label in sitePermissions.properties

webext-site-perms-midi = Доступ до пристроїв MIDI
webext-site-perms-midi-sysex = Доступ до пристроїв MIDI з підтримкою SysEx
