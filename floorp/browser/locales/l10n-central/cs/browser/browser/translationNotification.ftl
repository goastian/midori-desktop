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
    .value = Tato stránka je v jazyce
translation-notification-translate-this-page =
    .value = Chcete tuto stránku přeložit?

##

translation-notification-translate-button =
    .label = Přeložit
translation-notification-not-now-button =
    .label = Teď ne
translation-notification-translating-content =
    .value = Probíhá překlad stránky…

## These 3 strings are used to construct a sentence that contains 2 dropdowns
## showing the source and target language of a translated web page.
## In en-US it looks like this:
##   This page has been translated from [from language] to [to language]
## "from language" and "to language" here are language names coming from the
## toolkit/intl/languageNames.ftl file; for some locales they may not be in
## the correct grammar case to keep the same structure of the original
## sentence.

translation-notification-translated-from =
    .value = Tato stránka byla přeložena z jazyka
translation-notification-translated-to =
    .value = do jazyka
# This string (empty in en-US) is for locales that need to display some text
# after the second drop down for the sentence to be grammatically correct.
translation-notification-translated-to-suffix =
    .value = { "" }

##

translation-notification-show-original-button =
    .label = Zobrazit původní obsah
translation-notification-show-translation-button =
    .label = Zobrazit překlad
translation-notification-error-translating =
    .value = Během překladu této stránky došlo k chybě.
translation-notification-try-again-button =
    .label = Zkusit znovu
translation-notification-service-unavailable =
    .value = Překlady nejsou v současné době dostupné. Zkuste to prosím později.
translation-notification-options-menu =
    .label = Možnosti

## The accesskey values used here should not clash with each other

# Variables:
#  $langName (String): a language name coming from the toolkit/intl/languageNames.ftl file.
translation-notification-options-never-for-language =
    .label = Nikdy nepřekládat z jazyka { $langName }
    .accesskey = N
translation-notification-options-never-for-site =
    .label = Nikdy nepřekládat tuto stránku
    .accesskey = e
translation-notification-options-preferences =
    .label = Nastavení překladu
    .accesskey = t
