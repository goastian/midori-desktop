# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Error messages for failed HTTP web requests.
## https://developer.mozilla.org/en-US/docs/Web/HTTP/Status#client_error_responses
## Variables:
##   $status (Number) - HTTP status code, for example 403

firefox-relay-mask-generation-failed = { -relay-brand-name } не вдалося згенерувати нову маску. Код помилки HTTP: { $status }.
firefox-relay-get-reusable-masks-failed = { -relay-brand-name } не вдалося знайти багаторазові маски. Код помилки HTTP: { $status }.

##

firefox-relay-must-login-to-fxa = Ви повинні увійти в { -fxaccount-brand-name }, щоб використовувати { -relay-brand-name }.
firefox-relay-must-login-to-account = Увійдіть в обліковий запис, щоб використовувати маски електронної пошти { -relay-brand-name }.
firefox-relay-get-unlimited-masks =
    .label = Керувати масками
    .accesskey = К
# This is followed, on a new line, by firefox-relay-opt-in-subtitle-1
firefox-relay-opt-in-title-1 = Захистити свою електронну адресу:
# This is preceded by firefox-relay-opt-in-title-1 (on a different line), which
# ends with a colon. You might need to adapt the capitalization of this string.
firefox-relay-opt-in-subtitle-1 = Використати маску електронної пошти { -relay-brand-name }
firefox-relay-use-mask-title = Використати маску електронної пошти { -relay-brand-name }
firefox-relay-opt-in-confirmation-enable-button =
    .label = Використовувати маску електронної пошти
    .accesskey = В
firefox-relay-opt-in-confirmation-disable =
    .label = Не показувати це знову
    .accesskey = Н
firefox-relay-opt-in-confirmation-postpone =
    .label = Не зараз
    .accesskey = е
