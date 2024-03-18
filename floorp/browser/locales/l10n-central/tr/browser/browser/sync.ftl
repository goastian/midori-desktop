# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

fxa-toolbar-sync-syncing2 = Eşitleniyor…

sync-disconnect-dialog-title2 = Bağlantı kesilsin mi?
sync-disconnect-dialog-body = { -brand-product-name } artık hesabınızla eşitlenmeyecektir ama bu cihazdaki mevcut gezinti verileri silinmeyecektir.
sync-disconnect-dialog-button = Bağlatıyı kes

fxa-signout-dialog2-title = { -fxaccount-brand-name }ndan çıkılsın mı?
fxa-signout-dialog-body = Eşitlenmiş veriler hesabınızda kalacaktır.
fxa-signout-dialog2-button = Çıkış yap
fxa-signout-dialog2-checkbox = Bu cihazdaki verileri sil (parolalar, gezinti geçmişi, yer imleri vb.)

fxa-menu-sync-settings =
    .label = Eşitleme ayarları
fxa-menu-turn-on-sync =
    .value = Eşitlemeyi başlat
fxa-menu-turn-on-sync-default = Eşitlemeyi başlat

fxa-menu-connect-another-device =
    .label = Başka bir cihaz bağla…
# Variables:
#   $tabCount (Number): The number of tabs sent to the device.
fxa-menu-send-tab-to-device =
    .label =
        { $tabCount ->
            [one] Sekmeyi cihaza gönder
           *[other] { $tabCount } sekmeyi cihaza gönder
        }

# This is shown dynamically within "Send tab to device" in fxa menu.
fxa-menu-send-tab-to-device-syncnotready =
    .label = Cihazlar eşitleniyor…

# This is shown within "Send tab to device" in fxa menu if account is not configured.
fxa-menu-send-tab-to-device-description = Giriş yaptığınız her cihaza anında sekme gönderin.

fxa-menu-sign-out =
    .label = Çıkış yap…
