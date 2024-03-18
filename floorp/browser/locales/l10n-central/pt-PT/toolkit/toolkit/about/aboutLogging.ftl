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
about-logging-title = Sobre o registo
about-logging-page-title = Gestor de registo
about-logging-current-log-file = Ficheiro de registo atual:
about-logging-current-log-modules = Módulos de registo atual:
about-logging-new-log-file = Novo ficheiro de registo:
about-logging-currently-enabled-log-modules = Módulos de registo atualmente ativos:
about-logging-log-tutorial = Consulte <a data-l10n-name="logging">HTTP Logging</a> para instruções sobre como utilizar esta ferramenta.
# This message is used as a button label, "Open" indicates an action.
about-logging-open-log-file-dir = Abrir diretório
about-logging-set-log-file = Definir ficheiro de registo
about-logging-set-log-modules = Definir módulos de registo
about-logging-start-logging = Começar a registar
about-logging-stop-logging = Parar de registar
about-logging-buttons-disabled = Registo ativado através de variáveis de ambiente; configuração dinâmica indisponível.
about-logging-some-elements-disabled = Registo configurado via URL; algumas opções de configuração estão indisponíveis
about-logging-info = Informação:
about-logging-log-modules-selection = Seleção do módulo de registo
about-logging-new-log-modules = Novos módulos de registo:
about-logging-logging-output-selection = Saída do registo
about-logging-logging-to-file = A registar para um ficheiro
about-logging-logging-to-profiler = A registar para { -profiler-brand-name }
about-logging-no-log-modules = Nenhum
about-logging-no-log-file = Nenhum
about-logging-logging-preset-selector-text = Modelo de registo:

## Logging presets

about-logging-preset-networking-label = Rede
about-logging-preset-networking-description = Módulos de registo para diagnosticar problemas de rede
about-logging-preset-media-playback-label = Reprodução de multimédia
about-logging-preset-media-playback-description = Módulos de registo para diagnosticar problemas de reprodução de media (não incluí problemas de videoconferência)
about-logging-preset-custom-label = Personalizar
about-logging-preset-custom-description = Módulos de registo selecionados manualmente
# Error handling
about-logging-error = Erro:

## Variables:
##   $k (String) - Variable name
##   $v (String) - Variable value

about-logging-invalid-output = Valor inválido “{ $v }“ para a chave “{ $k }“
about-logging-unknown-logging-preset = Modelo de registo desconhecida “{ $v }“
about-logging-unknown-profiler-preset = Modelo de gerador de perfis desconhecido “{ $v }“
about-logging-unknown-option = Opção about:logging “{ $k }“ desconhecida
about-logging-configuration-url-ignored = URL de configuração ignorado
about-logging-file-and-profiler-override = Não é possível forçar a saída para ficheiro e substituir as opções do gerador de perfis em simultâneo
about-logging-configured-via-url = Opção configurada via URL
