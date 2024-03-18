# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# The button for "Midori Translations" in the url bar.
urlbar-translations-button =
    .tooltiptext = Traducir esta página
translations-panel-settings-button =
    .aria-label = Gestionar ajustes de traducción
# Text displayed on a language dropdown when the language is in beta
# Variables:
#   $language (string) - The localized display name of the detected language
translations-panel-displayname-beta =
    .label = { $language } BETA

## Options in the Midori Translations settings.

translations-panel-settings-manage-languages =
    .label = Administrar idiomas
translations-panel-settings-about = Acerca de las traducciones en { -brand-shorter-name }
# Text displayed for the option to always translate a given language
# Variables:
#   $language (string) - The localized display name of the detected language
translations-panel-settings-always-translate-language =
    .label = Siempre traducir del { $language }
translations-panel-settings-always-translate-unknown-language =
    .label = Siempre traducir este idioma
# Text displayed for the option to never translate a given language
# Variables:
#   $language (string) - The localized display name of the detected language
translations-panel-settings-never-translate-language =
    .label = Nunca traducir del { $language }
translations-panel-settings-never-translate-unknown-language =
    .label = Nunca traducir este idioma
# Text displayed for the option to never translate this website
translations-panel-settings-never-translate-site =
    .label = No traducir nunca este sitio

## The translation panel appears from the url bar, and this view is the default
## translation view.

translations-panel-header = ¿Traducir esta página?
translations-panel-translate-button =
    .label = Traducir
translations-panel-translate-button-loading =
    .label = Espere…
translations-panel-translate-cancel =
    .label = Cancelar
translations-panel-error-translating = Ha surgido un problema al traducir. Por favor inténtelo de nuevo.
translations-panel-error-load-languages = No se han podido cargar los idiomas
translations-panel-error-load-languages-hint = Compruebe su conexión a Internet e inténtelo de nuevo.
translations-panel-error-load-languages-hint-button =
    .label = Reintentar
translations-panel-error-unsupported = La traducción no está disponible para esta página
translations-panel-error-dismiss-button =
    .label = Entendido
translations-panel-error-change-button =
    .label = Cambiar el idioma de origen
# If your language requires declining the language name, a possible solution
# is to adapt the structure of the phrase, or use a support noun, e.g.
# `Sorry, we don't support the language yet: { $language }
#
# Variables:
#   $language (string) - The language of the document.
translations-panel-error-unsupported-hint-known = Lo sentimos, todavía no admitimos { $language }.
translations-panel-error-unsupported-hint-unknown = Lo sentimos, todavía no admitimos este idioma.

## Each label is followed, on a new line, by a dropdown list of language names.
## If this structure is problematic for your locale, an alternative way is to
## translate them as `Source language:` and `Target language:`

translations-panel-from-label = Traducir del
translations-panel-to-label = Traducir a

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
translations-panel-revisit-header = Esta página está traducida de { $fromLanguage } a { $toLanguage }
translations-panel-choose-language =
    .label = Seleccione un idioma
translations-panel-restore-button =
    .label = Mostrar original

## Midori Translations language management in about:preferences.

translations-manage-header = Traducciones
translations-manage-settings-button =
    .label = Ajustes…
    .accesskey = t
translations-manage-description = Descargar idiomas para traducción sin conexión.
translations-manage-all-language = Todos los idiomas
translations-manage-download-button = Descargar
translations-manage-delete-button = Eliminar
translations-manage-language-download-button =
    .label = Descargar
    .accesskey = D
translations-manage-language-delete-button =
    .label = Eliminar
    .accesskey = E
translations-manage-error-download = Ha habido un problema al descargar los archivos de idioma. Por favor, vuelva a intentarlo.
translations-manage-error-delete = Ha habido un error al eliminar los archivos de idioma. Por favor, vuelva a intentarlo.
translations-manage-error-list = No se ha podido obtener la lista de idiomas disponibles para la traducción. Actualice la página para volver a intentarlo.
translations-settings-title =
    .title = Ajustes de traducción
    .style = min-width: 36em
translations-settings-close-key =
    .key = w
translations-settings-always-translate-langs-description = La traducción se realizará automáticamente para los siguientes idiomas
translations-settings-never-translate-langs-description = No se ofrecerá traducción para los siguientes idiomas
translations-settings-never-translate-sites-description = No se ofrecerá traducción para los siguientes sitios
translations-settings-languages-column =
    .label = Idiomas
translations-settings-remove-language-button =
    .label = Eliminar idioma
    .accesskey = r
translations-settings-remove-all-languages-button =
    .label = Eliminar todos los idiomas
    .accesskey = E
translations-settings-sites-column =
    .label = Sitios web
translations-settings-remove-site-button =
    .label = Eliminar sitio
    .accesskey = s
translations-settings-remove-all-sites-button =
    .label = Eliminar todos los sitios
    .accesskey = m
translations-settings-close-dialog =
    .buttonlabelaccept = Cerrar
    .buttonaccesskeyaccept = C
