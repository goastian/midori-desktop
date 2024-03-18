# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

title-label = Yan Uygulamalar Hakkında

installed-plugins-label = Kurulu yan uygulamalar
no-plugins-are-installed-label = Yüklenmiş yan uygulama bulunamadı

deprecation-description = Bir şeyler mi eksik? Bazı yan uygulamalar artık desteklenmiyor. <a data-l10n-name="deprecation-link">Daha fazla bilgi alın.</a>

## The information of plugins
##
## Variables:
##   $pluginLibraries: the plugin library
##   $pluginFullPath: path of the plugin
##   $version: version of the plugin

file-dd = <span data-l10n-name="file">Dosya:</span> { $pluginLibraries }
path-dd = <span data-l10n-name="path">Yol:</span> { $pluginFullPath }
version-dd = <span data-l10n-name="version">Sürüm:</span> { $version }

## These strings describe the state of plugins
##
## Variables:
##   $blockListState: show some special state of the plugin, such as blocked, outdated

state-dd-enabled = <span data-l10n-name="state">Durum:</span> Etkinleştirildi
state-dd-enabled-block-list-state = <span data-l10n-name="state">Durum:</span> Etkinleştirildi ({ $blockListState })
state-dd-Disabled = <span data-l10n-name="state">Durum:</span> Devre dışı
state-dd-Disabled-block-list-state = <span data-l10n-name="state">Durum:</span> Devre dışı ({ $blockListState })

mime-type-label = MIME türü
description-label = Tanım
suffixes-label = Son ekler

## Gecko Media Plugins (GMPs)

plugins-gmp-license-info = Lisans bilgileri
plugins-gmp-privacy-info = Gizlilik bilgileri

plugins-openh264-name = OpenH264 Video Çözücü (sağlayan: Cisco Systems, Inc.)
plugins-openh264-description = Bu yan uygulama, WebRTC şartnamesine uyum sağlamak ve H.264 video çözücüye ihtiyaç duyan cihazlarda WebRTC görüşmeleri yapabilmek amacıyla Mozilla tarafından otomatik yüklenir. Çözücünün kaynak kodlarını görmek ve daha fazla bilgi almak için http://www.openh264.org/ adresini ziyaret edin.

plugins-widevine-name = Widevine İçerik Çözme Modülü (sağlayan: Google Inc.)
plugins-widevine-description = Bu yan uygulama, Encrypted Media Extensions şartnamesine uygun olarak şifrelenmiş ortamların oynatılmasını sağlar. Şifrelenmiş ortamlar genellikle ücretli içeriklerin kopyalanmasını engellemek isteyen siteler tarafından kullanılır. Encrypted Media Extensions hakkında daha fazla bilgi için https://www.w3.org/TR/encrypted-media/ adresini ziyaret edebilirsiniz.
