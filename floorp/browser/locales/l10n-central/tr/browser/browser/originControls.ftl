# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## These strings appear in Origin Controls for Extensions.  Currently,
## they are visible in the context menu for extension toolbar buttons,
## and are used to inform the user how the extension can access their
## data for the current website, and allow them to control it.

origin-controls-no-access =
    .label = Uzantı verileri okuyamaz ve değiştiremez
origin-controls-quarantined =
    .label = Uzantının verileri okumasına ve değiştirmesine izin verilmiyor
origin-controls-quarantined-allow =
    .label = Kısıtlı sitelerde izin ver
origin-controls-options =
    .label = Uzantı şu verileri okuyabilir ve değiştirebilir:
origin-controls-option-all-domains =
    .label = Tüm sitelerde
origin-controls-option-when-clicked =
    .label = Yalnızca tıklandığında
# This string denotes an option that grants the extension access to
# the current site whenever they visit it.
# Variables:
#   $domain (String) - The domain for which the access is granted.
origin-controls-option-always-on =
    .label = { $domain } sitesinde her zaman izin ver

## These strings are used to map Origin Controls states to user-friendly
## messages. They currently appear in the unified extensions panel.

origin-controls-state-no-access = Bu sitedeki verileri okuyamaz ve değiştiremez
origin-controls-state-quarantined = { -vendor-short-name } bu sitede izin vermiyor
origin-controls-state-always-on = Bu sitedeki verileri her zaman okuyabilir ve değiştirebilir
origin-controls-state-when-clicked = Verileri okumak ve değiştirmek için izin gerekli
origin-controls-state-hover-run-visit-only = Yalnızca bu ziyaret boyunca çalıştır
origin-controls-state-runnable-hover-open = Uzantıyı aç
origin-controls-state-runnable-hover-run = Uzantıyı çalıştır
origin-controls-state-temporary-access = Bu ziyaret boyunca verileri okuyabilir ve değiştirebilir

## Extension's toolbar button.
## Variables:
##   $extensionTitle (String) - Extension name or title message.

origin-controls-toolbar-button =
    .label = { $extensionTitle }
    .tooltiptext = { $extensionTitle }
# Extension's toolbar button when permission is needed.
# Note that the new line is intentionally part of the tooltip.
origin-controls-toolbar-button-permission-needed =
    .label = { $extensionTitle }
    .tooltiptext =
        { $extensionTitle }
        İzin gerekli
# Extension's toolbar button when quarantined.
# Note that the new line is intentionally part of the tooltip.
origin-controls-toolbar-button-quarantined =
    .label = { $extensionTitle }
    .tooltiptext =
        { $extensionTitle }
        Bu sitede { -vendor-short-name } tarafından izin verilmiyor
