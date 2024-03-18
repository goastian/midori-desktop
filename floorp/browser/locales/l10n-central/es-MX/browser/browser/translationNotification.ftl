# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## These 2 strings are used to construct a sentence that contains a dropdown
## showing the detected language of the current web page.
## In en-US it looks like this:
##   This page is in [detected language] Translate this page?
## "detected language" here is a language name coming from the
## toolkit/intl/languageNames.ftl file; for some locales it may not be in
## the correct grammar case to keep the same structure of the original
## sentence.

translation-notification-this-page-is-in =
    .value = Esta página está en
translation-notification-translate-this-page =
    .value = ¿Traducir esta página?

##

translation-notification-translate-button =
    .label = Traducir
translation-notification-not-now-button =
    .label = Ahora no
translation-notification-translating-content =
    .value = Traducir contenido de la página…

## These 3 strings are used to construct a sentence that contains 2 dropdowns
## showing the source and target language of a translated web page.
## In en-US it looks like this:
##   This page has been translated from [from language] to [to language]
## "from language" and "to language" here are language names coming from the
## toolkit/intl/languageNames.ftl file; for some locales they may not be in
## the correct grammar case to keep the same structure of the original
## sentence.

translation-notification-translated-from =
    .value = Esta página ha sido traducida del
translation-notification-translated-to =
    .value = para
# This string (empty in en-US) is for locales that need to display some text
# after the second drop down for the sentence to be grammatically correct.
translation-notification-translated-to-suffix =
    .value = { "" }

##

translation-notification-show-original-button =
    .label = Mostrar original
translation-notification-show-translation-button =
    .label = Mostrar traducción
translation-notification-error-translating =
    .value = Ha habido un error al traducir esta página.
translation-notification-try-again-button =
    .label = Intentar de nuevo
translation-notification-service-unavailable =
    .value = La traducción no está disponible por el momento. Por favor intenta de nuevo más tarde.
translation-notification-options-menu =
    .label = Opciones

## The accesskey values used here should not clash with each other

# Variables:
#  $langName (String): a language name coming from the toolkit/intl/languageNames.ftl file.
translation-notification-options-never-for-language =
    .label = Nunca traducir { $langName }
    .accesskey = N
translation-notification-options-never-for-site =
    .label = Nunca traducir este sitio
    .accesskey = e
translation-notification-options-preferences =
    .label = Preferencias de Traducción
    .accesskey = T
