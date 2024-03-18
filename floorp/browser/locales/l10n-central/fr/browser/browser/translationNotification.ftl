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
    .value = Cette page est en
translation-notification-translate-this-page =
    .value = Traduire cette page ?

##

translation-notification-translate-button =
    .label = Traduire
translation-notification-not-now-button =
    .label = Plus tard
translation-notification-translating-content =
    .value = Traduction du contenu de la page…

## These 3 strings are used to construct a sentence that contains 2 dropdowns
## showing the source and target language of a translated web page.
## In en-US it looks like this:
##   This page has been translated from [from language] to [to language]
## "from language" and "to language" here are language names coming from the
## toolkit/intl/languageNames.ftl file; for some locales they may not be in
## the correct grammar case to keep the same structure of the original
## sentence.

translation-notification-translated-from =
    .value = Cette page en
translation-notification-translated-to =
    .value = a été traduite en
# This string (empty in en-US) is for locales that need to display some text
# after the second drop down for the sentence to be grammatically correct.
translation-notification-translated-to-suffix =
    .value = { "" }

##

translation-notification-show-original-button =
    .label = Afficher la page d’origine
translation-notification-show-translation-button =
    .label = Afficher la traduction
translation-notification-error-translating =
    .value = Une erreur s’est produite lors de la traduction de cette page.
translation-notification-try-again-button =
    .label = Réessayer
translation-notification-service-unavailable =
    .value = Le service de traduction est actuellement indisponible. Veuillez réessayer plus tard.
translation-notification-options-menu =
    .label = Options

## The accesskey values used here should not clash with each other

# Variables:
#  $langName (String): a language name coming from the toolkit/intl/languageNames.ftl file.
translation-notification-options-never-for-language =
    .label = Ne jamais traduire les pages en { $langName }
    .accesskey = N
translation-notification-options-never-for-site =
    .label = Ne jamais traduire ce site
    .accesskey = e
translation-notification-options-preferences =
    .label = Préférences de traduction
    .accesskey = t
