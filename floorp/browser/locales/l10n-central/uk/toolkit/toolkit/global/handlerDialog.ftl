# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Permission Dialog
## Variables:
##  $host - the hostname that is initiating the request
##  $scheme - the type of link that's being opened.
##  $appName - Name of the application that will be opened.


## Permission Dialog
## Variables:
##  $host - the hostname that is initiating the request
##  $scheme - the type of link that's being opened.
##  $appName - Name of the application that will be opened.
##  $extension - Name of extension that initiated the request

## Permission Dialog
## Variables:
##  $host (string) - The hostname that is initiating the request
##  $scheme (string) - The type of link that's being opened.
##  $appName (string) - Name of the application that will be opened.
##  $extension (string) - Name of extension that initiated the request

permission-dialog-description = Дозволити цьому сайту відкрити посилання { $scheme }?

permission-dialog-description-file = Дозволити цьому файлу відкрити посилання { $scheme }?

permission-dialog-description-host = Дозволити { $host } відкрити посилання { $scheme }?

permission-dialog-description-extension = Дозволити розширенню { $extension } відкрити посилання { $scheme }?

permission-dialog-description-app = Дозволити цьому сайту відкрити посилання { $scheme } в { $appName }?

permission-dialog-description-host-app = Дозволити { $host } відкрити посилання { $scheme } в { $appName }?

permission-dialog-description-file-app = Дозволити цьому файлу відкрити посилання { $scheme } в { $appName }?

permission-dialog-description-extension-app = Дозволити розширенню { $extension } відкрити посилання { $scheme } за допомогою { $appName }?

## Please keep the emphasis around the hostname and scheme (ie the
## `<strong>` HTML tags). Please also keep the hostname as close to the start
## of the sentence as your language's grammar allows.

## Please keep the emphasis around the hostname and scheme (ie the
## `<strong>` HTML tags). Please also keep the hostname as close to the start
## of the sentence as your language's grammar allows.
## Variables:
##  $host (string) - The hostname that is initiating the request
##  $scheme (string) - The type of link that's being opened.

permission-dialog-remember = Завжди дозволяти <strong>{ $host }</strong> відкривати посилання <strong>{ $scheme }</strong>

permission-dialog-remember-file = Завжди дозволяти цьому файлу відкривати посилання <strong>{ $scheme }</strong>

permission-dialog-remember-extension = Завжди дозволяти цьому розширенню відкривати посилання <strong>{ $scheme }</strong>

##

permission-dialog-btn-open-link =
    .label = Відкрити посилання
    .accessKey = к

permission-dialog-btn-choose-app =
    .label = Вибрати програму
    .accessKey = б

permission-dialog-unset-description = Вам необхідно вибрати програму.

permission-dialog-set-change-app-link = Вибрати іншу програму.

## Chooser dialog
## Variables:
##  $scheme - the type of link that's being opened.

## Chooser dialog
## Variables:
##  $scheme (string) - The type of link that's being opened.

chooser-window =
    .title = Вибрати програму
    .style = min-width: 26em; min-height: 26em;

chooser-dialog =
    .buttonlabelaccept = Відкрити посилання
    .buttonaccesskeyaccept = к

chooser-dialog-description = Виберіть програму для відкриття посилання { $scheme }.

# Please keep the emphasis around the scheme (ie the `<strong>` HTML tags).
chooser-dialog-remember = Завжди використовувати цю програму для відкриття посилань <strong>{ $scheme }</strong>

chooser-dialog-remember-extra =
    { PLATFORM() ->
        [windows] Це можна змінити в налаштуваннях { -brand-short-name }.
       *[other] Це можна змінити в налаштуваннях { -brand-short-name }.
    }

choose-other-app-description = Вибір іншої програми
choose-app-btn =
    .label = Вибрати…
    .accessKey = В
choose-other-app-window-title = Інша програма…

# Displayed under the name of a protocol handler in the Launch Application dialog.
choose-dialog-privatebrowsing-disabled = Вимкнено в приватних вікнах
