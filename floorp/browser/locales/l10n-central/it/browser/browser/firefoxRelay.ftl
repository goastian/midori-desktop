# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Error messages for failed HTTP web requests.
## https://developer.mozilla.org/en-US/docs/Web/HTTP/Status#client_error_responses
## Variables:
##   $status (Number) - HTTP status code, for example 403

firefox-relay-mask-generation-failed = Non è stato possibile generare un nuovo alias { -relay-brand-name }. Codice di errore HTTP: { $status }.
firefox-relay-get-reusable-masks-failed = { -relay-brand-name } non ha trovato alias riutilizzabili. Codice di errore HTTP: { $status }.

##

firefox-relay-must-login-to-fxa = È necessario accedere all’{ -fxaccount-brand-name } per utilizzare { -relay-brand-name }.
firefox-relay-get-unlimited-masks =
    .label = Gestisci alias
    .accesskey = G
firefox-relay-opt-in-title = Proteggi il tuo indirizzo email
firefox-relay-opt-in-subtitle = Aggiungi { -relay-brand-name }
firefox-relay-generate-mask-title = Proteggi il tuo indirizzo email
firefox-relay-generate-mask-subtitle = Genera un alias { -relay-brand-short-name }
firefox-relay-opt-in-confirmation-enable =
    .label = Continua
    .accesskey = C
firefox-relay-opt-in-confirmation-disable =
    .label = Non mostrare di nuovo questo messaggio
    .accesskey = m
firefox-relay-opt-in-confirmation-postpone =
    .label = Non adesso
    .accesskey = N

# This is followed, on a new line, by firefox-relay-opt-in-subtitle-1
firefox-relay-opt-in-title-1 = Proteggi il tuo indirizzo email:
# This is preceded by firefox-relay-opt-in-title-1 (on a different line), which
# ends with a colon. You might need to adapt the capitalization of this string.
firefox-relay-opt-in-subtitle-1 = utilizza un alias di posta elettronica { -relay-brand-name }
firefox-relay-use-mask-title = Utilizza un alias di posta elettronica { -relay-brand-name }
firefox-relay-opt-in-confirmation-enable-button =
    .label = Utilizza alias di posta elettronica
    .accesskey = U
