# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Credential panel
##
## Identity providers are websites you use to log in to another website, for
## example: Google when you Log in with Google.
##
## Variables:
##  $host (String): the hostname of the site that is being displayed.
##  $provider (String): the hostname of another website you are using to log in to the site being displayed

identity-credential-header-providers = Oturum açma sağlayıcısıyla giriş yap
identity-credential-header-accounts = { $provider } ile giriş yap
identity-credential-urlbar-anchor =
    .tooltiptext = Giriş panelini aç
identity-credential-cancel-button =
    .label = Vazgeç
    .accesskey = V
identity-credential-accept-button =
    .label = Devam et
    .accesskey = D
identity-credential-sign-in-button =
    .label = Giriş yap
    .accesskey = G
identity-credential-policy-title = Oturum açma sağlayıcısı olarak { $provider } kullan
