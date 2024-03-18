# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Error messages for failed HTTP web requests.
## https://developer.mozilla.org/en-US/docs/Web/HTTP/Status#client_error_responses
## Variables:
##   $status (Number) - HTTP status code, for example 403

firefox-relay-mask-generation-failed = O { -relay-brand-name } não conseguiu gerar uma nova máscara. Código de erro HTTP: { $status }.
firefox-relay-get-reusable-masks-failed = O { -relay-brand-name } não encontrou máscaras reusáveis. Código de erro HTTP: { $status }.

##

firefox-relay-must-login-to-fxa = Você precisa entrar na { -fxaccount-brand-name } para usar o { -relay-brand-name }.
firefox-relay-get-unlimited-masks =
    .label = Gerenciar máscaras
    .accesskey = G
firefox-relay-opt-in-title = Proteja seu endereço de email
firefox-relay-opt-in-subtitle = Adicione o { -relay-brand-name }
firefox-relay-generate-mask-title = Proteja seu endereço de email
firefox-relay-generate-mask-subtitle = Gerar máscara do { -relay-brand-short-name }
firefox-relay-opt-in-confirmation-enable =
    .label = Avançar
    .accesskey = A
# This is followed, on a new line, by firefox-relay-opt-in-subtitle-1
firefox-relay-opt-in-title-1 = Proteja seu endereço de email:
# This is preceded by firefox-relay-opt-in-title-1 (on a different line), which
# ends with a colon. You might need to adapt the capitalization of this string.
firefox-relay-opt-in-subtitle-1 = Use máscara de email do { -relay-brand-name }
firefox-relay-use-mask-title = Use máscara de email do { -relay-brand-name }
firefox-relay-opt-in-confirmation-enable-button =
    .label = Usar máscara de email
    .accesskey = U
firefox-relay-opt-in-confirmation-disable =
    .label = Não mostrar novamente
    .accesskey = N
firefox-relay-opt-in-confirmation-postpone =
    .label = Agora não
    .accesskey = A
