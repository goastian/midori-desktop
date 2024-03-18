# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Error messages for failed HTTP web requests.
## https://developer.mozilla.org/en-US/docs/Web/HTTP/Status#client_error_responses
## Variables:
##   $status (Number) - HTTP status code, for example 403

firefox-relay-mask-generation-failed = { -relay-brand-name } kan geen nieuw masker aanmaken. HTTP-foutcode: { $status }.
firefox-relay-get-reusable-masks-failed = { -relay-brand-name } kan geen herbruikbare maskers vinden. HTTP-foutcode: { $status }.

##

firefox-relay-must-login-to-fxa = U dient zich aan te melden bij { -fxaccount-brand-name } om { -relay-brand-name } te kunnen gebruiken.
firefox-relay-get-unlimited-masks =
    .label = Maskers beheren
    .accesskey = b
firefox-relay-opt-in-title = Bescherm uw e-mailadres
firefox-relay-opt-in-subtitle = Voeg { -relay-brand-name } toe
firefox-relay-generate-mask-title = Bescherm uw e-mailadres
firefox-relay-generate-mask-subtitle = { -relay-brand-short-name }-masker aanmaken
firefox-relay-opt-in-confirmation-enable =
    .label = Doorgaan
    .accesskey = D
firefox-relay-opt-in-confirmation-disable =
    .label = Dit niet meer tonen
    .accesskey = n
firefox-relay-opt-in-confirmation-postpone =
    .label = Niet nu
    .accesskey = N
