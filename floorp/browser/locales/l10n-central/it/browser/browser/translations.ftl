# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# The button for "Midori Translations" in the url bar.
urlbar-translations-button =
    .tooltiptext = Traduci questa pagina

# If your language requires declining the language name, a possible solution
# is to adapt the structure of the phrase, or use a support noun, e.g.
# `Page translated from: { $fromLanguage }. Current target language: { $toLanguage }`
#
# Variables:
#   $fromLanguage (string) - The original language of the document.
#   $toLanguage (string) - The target language of the translation.
urlbar-translations-button-translated =
  .tooltiptext = Pagina tradotta da { $fromLanguage } a { $toLanguage }

urlbar-translations-button-loading =
  .tooltiptext = Traduzione in corso

translations-panel-settings-button =
    .aria-label = Gestisci impostazioni per la traduzione
# Text displayed on a language dropdown when the language is in beta
# Variables:
#   $language (string) - The localized display name of the detected language
translations-panel-displayname-beta =
    .label = { $language } BETA

## Options in the Midori Translations settings.

translations-panel-settings-manage-languages =
    .label = Gestisci lingue
translations-panel-settings-about = Informazioni sulle traduzioni in { -brand-shorter-name }
# Text displayed for the option to always translate a given language
# Variables:
#   $language (string) - The localized display name of the detected language
translations-panel-settings-always-translate-language =
    .label = Traduci sempre da { $language }
translations-panel-settings-always-translate-unknown-language =
    .label = Traduci sempre da questa lingua
# Text displayed for the option to never translate a given language
# Variables:
#   $language (string) - The localized display name of the detected language
translations-panel-settings-never-translate-language =
    .label = Non tradurre mai da { $language }
translations-panel-settings-never-translate-unknown-language =
    .label = Non tradurre mai da questa lingua
# Text displayed for the option to never translate this website
translations-panel-settings-never-translate-site =
    .label = Non tradurre mai questo sito

## The translation panel appears from the url bar, and this view is the default
## translation view.

translations-panel-header = Tradurre questa pagina?
translations-panel-translate-button =
    .label = Traduci
translations-panel-translate-button-loading =
  .label = Attendere…
translations-panel-translate-cancel =
    .label = Annulla
translations-panel-error-translating = Si è verificato un problema durante la traduzione. Riprova.
translations-panel-error-load-languages = Impossibile caricare le lingue
translations-panel-error-load-languages-hint = Verifica la connessione a Internet e riprova.
translations-panel-error-load-languages-hint-button =
    .label = Riprova
translations-panel-error-unsupported = La traduzione non è disponibile per questa pagina
translations-panel-error-dismiss-button =
    .label = OK
translations-panel-error-change-button =
    .label = Cambia la lingua di origine
# If your language requires declining the language name, a possible solution
# is to adapt the structure of the phrase, or use a support noun, e.g.
# `Sorry, we don't support the language yet: { $language }
#
# Variables:
#   $language (string) - The language of the document.
translations-panel-error-unsupported-hint-known = Siamo spiacenti, ma { $language } non è ancora supportato.
translations-panel-error-unsupported-hint-unknown = Siamo spiacenti, questa lingua non è ancora supportata.

## Each label is followed, on a new line, by a dropdown list of language names.
## If this structure is problematic for your locale, an alternative way is to
## translate them as `Source language:` and `Target language:`

translations-panel-from-label = Traduci da
translations-panel-to-label = Traduci in

## The translation panel appears from the url bar, and this view is the "restore" view
## that lets a user restore a page to the original language, or translate into another
## language.

# If your language requires declining the language name, a possible solution
# is to adapt the structure of the phrase, or use a support noun, e.g.
# `The page is translated from: { $fromLanguage }. Current target language: { $toLanguage }`
#
# Variables:
#   $fromLanguage (string) - The original language of the document.
#   $toLanguage (string) - The target language of the translation.
translations-panel-revisit-header = Questa pagina è stata tradotta da { $fromLanguage } a { $toLanguage }
translations-panel-choose-language =
    .label = Scegli una lingua
translations-panel-restore-button =
    .label = Mostra originale

## Midori Translations language management in about:preferences.

translations-manage-header = Traduzioni
translations-manage-settings-button =
    .label = Impostazioni
    .accesskey = m
translations-manage-description = Scarica le lingue per la traduzione non in linea.
translations-manage-all-language = Tutte le lingue
translations-manage-download-button = Scarica
translations-manage-delete-button = Elimina
translations-manage-language-download-button =
    .label = Scarica
    .accesskey = S
translations-manage-language-delete-button =
    .label = Elimina
    .accesskey = E
translations-manage-error-download = Si è verificato un errore durante il download dei file. Riprova.
translations-manage-error-delete = Si è verificato un errore durante l’eliminazione dei file della lingua. Riprova.
translations-manage-error-list = Impossibile ottenere l’elenco delle lingue disponibili per la traduzione. Aggiorna la pagina per riprovare.
translations-settings-title =
    .title = Impostazioni traduzione
    .style = min-width: 36em
translations-settings-close-key =
    .key = w
translations-settings-always-translate-langs-description = La traduzione verrà eseguita automaticamente per le seguenti lingue
translations-settings-never-translate-langs-description = La traduzione non sarà disponibile per le seguenti lingue
translations-settings-never-translate-sites-description = La traduzione non sarà disponibile per i seguenti siti
translations-settings-languages-column =
    .label = Lingue
translations-settings-remove-language-button =
    .label = Rimuovi lingua
    .accesskey = R
translations-settings-remove-all-languages-button =
    .label = Rimuovi tutte le lingue
    .accesskey = u
translations-settings-sites-column =
    .label = Siti web
translations-settings-remove-site-button =
    .label = Rimuovi sito
    .accesskey = s
translations-settings-remove-all-sites-button =
    .label = Rimuovi tutti i siti
    .accesskey = v
translations-settings-close-dialog =
    .buttonlabelaccept = Chiudi
    .buttonaccesskeyaccept = C


