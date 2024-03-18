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

identity-credential-header-providers = Увійдіть за допомогою постачальника даних для входу
identity-credential-header-accounts = Увійти за допомогою { $provider }
identity-credential-urlbar-anchor =
    .tooltiptext = Відкрити панель входу
identity-credential-cancel-button =
    .label = Скасувати
    .accesskey = С
identity-credential-accept-button =
    .label = Продовжити
    .accesskey = П
identity-credential-sign-in-button =
    .label = Увійти
    .accesskey = У
identity-credential-policy-title = Використати { $provider } як постачальника для входу
identity-credential-policy-description = Вхід до { $host } за допомогою облікового запису { $provider } регулюється їхньою <label data-l10n-name="privacy-url">Політикою приватності</label> та <label data-l10n-name="tos-url">Умовами надання послуг</label>.
