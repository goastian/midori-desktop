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
    .value = Deze pagina is in het
translation-notification-translate-this-page =
    .value = Deze pagina vertalen?

##

translation-notification-translate-button =
    .label = Vertalen
translation-notification-not-now-button =
    .label = Niet nu
translation-notification-translating-content =
    .value = Pagina-inhoud vertalen…

## These 3 strings are used to construct a sentence that contains 2 dropdowns
## showing the source and target language of a translated web page.
## In en-US it looks like this:
##   This page has been translated from [from language] to [to language]
## "from language" and "to language" here are language names coming from the
## toolkit/intl/languageNames.ftl file; for some locales they may not be in
## the correct grammar case to keep the same structure of the original
## sentence.

translation-notification-translated-from =
    .value = Deze pagina is van het
translation-notification-translated-to =
    .value = naar het
# This string (empty in en-US) is for locales that need to display some text
# after the second drop down for the sentence to be grammatically correct.
translation-notification-translated-to-suffix =
    .value = vertaald

##

translation-notification-show-original-button =
    .label = Origineel tonen
translation-notification-show-translation-button =
    .label = Vertaling tonen
translation-notification-error-translating =
    .value = Er is een fout opgetreden bij het vertalen van deze pagina.
translation-notification-try-again-button =
    .label = Opnieuw proberen
translation-notification-service-unavailable =
    .value = Vertaling is momenteel niet beschikbaar. Probeer het later opnieuw.
translation-notification-options-menu =
    .label = Opties

## The accesskey values used here should not clash with each other

# Variables:
#  $langName (String): a language name coming from the toolkit/intl/languageNames.ftl file.
translation-notification-options-never-for-language =
    .label = { $langName } nooit vertalen
    .accesskey = n
translation-notification-options-never-for-site =
    .label = Deze website nooit vertalen
    .accesskey = D
translation-notification-options-preferences =
    .label = Vertaalvoorkeuren
    .accesskey = V
