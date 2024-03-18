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

permission-dialog-description = Bu site { $scheme } bağlantısını açabilsin mi?

permission-dialog-description-file = Bu dosya { $scheme } bağlantısını açabilsin mi?

permission-dialog-description-host = { $host } sitesi { $scheme } bağlantısını açabilsin mi?

permission-dialog-description-extension = { $extension } uzantısı { $scheme } bağlantısını açabilsin mi?

permission-dialog-description-app = Bu site { $scheme } bağlantısını { $appName } ile açabilsin mi?

permission-dialog-description-host-app = { $host } sitesi { $scheme } bağlantısını { $appName } ile açabilsin mi?

permission-dialog-description-file-app = Bu dosya { $scheme } bağlantısını { $appName } ile açabilsin mi?

permission-dialog-description-extension-app = { $extension } uzantısının { $scheme } bağlantısını { $appName } ile açmasına izin verilsin mi?

## Please keep the emphasis around the hostname and scheme (ie the
## `<strong>` HTML tags). Please also keep the hostname as close to the start
## of the sentence as your language's grammar allows.

## Please keep the emphasis around the hostname and scheme (ie the
## `<strong>` HTML tags). Please also keep the hostname as close to the start
## of the sentence as your language's grammar allows.
## Variables:
##  $host (string) - The hostname that is initiating the request
##  $scheme (string) - The type of link that's being opened.

permission-dialog-remember = <strong>{ $host }</strong> sitesinin <strong>{ $scheme }</strong> bağlantılarını açmasına her zaman izin ver

permission-dialog-remember-file = <strong>{ $scheme }</strong> bağlantılarını açmak için bu dosyaya her zaman izin ver

permission-dialog-remember-extension = Bu uzantının <strong>{ $scheme }</strong> bağlantılarını açmasına her zaman izin ver

##

permission-dialog-btn-open-link =
    .label = Bağlantıyı aç
    .accessKey = B

permission-dialog-btn-choose-app =
    .label = Uygulama seç
    .accessKey = U

permission-dialog-unset-description = Bir uygulama seçmelisiniz.

permission-dialog-set-change-app-link = Başka bir uygulama seçin.

## Chooser dialog
## Variables:
##  $scheme - the type of link that's being opened.

## Chooser dialog
## Variables:
##  $scheme (string) - The type of link that's being opened.

chooser-window =
    .title = Uygulama seçimi
    .style = min-width: 26em; min-height: 26em;

chooser-dialog =
    .buttonlabelaccept = Bağlantıyı aç
    .buttonaccesskeyaccept = B

chooser-dialog-description = { $scheme } bağlantısını açmak için bir uygulama seçin.

# Please keep the emphasis around the scheme (ie the `<strong>` HTML tags).
chooser-dialog-remember = <strong>{ $scheme }</strong> bağlantılarını açmak için her zaman bu uygulamayı kullan

chooser-dialog-remember-extra =
    { PLATFORM() ->
        [windows] Bu ayarı { -brand-short-name } seçeneklerinden değiştirebilirsiniz.
       *[other] Bu ayarı { -brand-short-name } tercihlerinden değiştirebilirsiniz.
    }

choose-other-app-description = Başka bir uygulama seç
choose-app-btn =
    .label = Seç…
    .accessKey = S
choose-other-app-window-title = Başka bir uygulama…

# Displayed under the name of a protocol handler in the Launch Application dialog.
choose-dialog-privatebrowsing-disabled = Gizli pencerelerde devre dışı
