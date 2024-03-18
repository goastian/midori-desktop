# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## The following feature name must be treated as a brand.
##
## They cannot be:
## - Transliterated.
## - Translated.
##
## Declension should be avoided where possible, leaving the original
## brand unaltered in prominent UI positions.
##
## For further details, consult:
## https://mozilla-l10n.github.io/styleguides/mozilla_general/#brands-copyright-and-trademark

-profiler-brand-name = Firefox Profiler

##

# This is the title of the page
about-logging-title = O ukládání protokolů
about-logging-page-title = Správce ukládání protokolů
about-logging-current-log-file = Současný soubor protokolu:
about-logging-current-log-modules = Současné moduly protokolu:
about-logging-new-log-file = Nový soubor protokolu:
about-logging-currently-enabled-log-modules = Povolené moduly protokolů:
about-logging-log-tutorial = Pro informace o používání tohoto nástroje prosím navštivte stránku <a data-l10n-name="logging">HTTP Logging</a>.
# This message is used as a button label, "Open" indicates an action.
about-logging-open-log-file-dir = Otevřít složku
about-logging-set-log-file = Nastavit soubor protokolu
about-logging-set-log-modules = Nastavit moduly protokolu
about-logging-start-logging = Spustit ukládání protokolu
about-logging-stop-logging = Ukončit ukládání protokolu
about-logging-buttons-disabled = Protokolování je nastaveno pomocí proměnných prostředí, dynamické nastavení není dostupné.
about-logging-some-elements-disabled = Protokolování je nastaveno pomocí URL, některé možnosti nejsou dostupné
about-logging-info = Informace:
about-logging-log-modules-selection = Výběr modulu protokolů
about-logging-new-log-modules = Nové moduly protokolů:
about-logging-logging-output-selection = Výstup protokolování
about-logging-logging-to-file = Protokolování do souboru
about-logging-logging-to-profiler = Protokolování do { -profiler-brand-name(case: "gen") }
about-logging-no-log-modules = Žádný
about-logging-no-log-file = Žádný
about-logging-logging-preset-selector-text = Přednastavené protokolování:

## Logging presets

about-logging-preset-networking-label = Síť
about-logging-preset-networking-description = Moduly protokolů pro diagnostiku problémů se sítí
about-logging-preset-media-playback-label = Přehrávání médií
about-logging-preset-media-playback-description = Moduly protokolů pro diagnostiku problémů s přehráváním médií (nikoli problémů s videokonferencemi)
about-logging-preset-custom-label = Vlastní
about-logging-preset-custom-description = Ručně vybrané moduly protokolů
# Error handling
about-logging-error = Chyba:

## Variables:
##   $k (String) - Variable name
##   $v (String) - Variable value

about-logging-invalid-output = Neplatná hodnota „{ $v }“ pro klíč „{ $k }“
about-logging-unknown-logging-preset = Neznámá předvolba protokolování „{ $v }“
about-logging-unknown-profiler-preset = Neznámá předvolba profilování „{ $v }“
about-logging-unknown-option = Neznámá možnost „{ $k }“ stránky about:logging
about-logging-configuration-url-ignored = Konfigurační URL adresa ignorována
about-logging-file-and-profiler-override = Vynucení výstupu do souboru a nastavení profilování není zároveň možné
about-logging-configured-via-url = Možnosti nastavené pomocí URL
