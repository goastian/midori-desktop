# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### "Glean" and "Glean SDK" should remain in English.

### "FOG", "Glean", and "Glean SDK" should remain in English.

-fog-brand-name = FOG
-glean-brand-name = Glean
glean-sdk-brand-name = { -glean-brand-name } SDK
glean-debug-ping-viewer-brand-name = { -glean-brand-name } Hata Ayıklama Ping Görüntüleyicisi

about-glean-page-title2 = { -glean-brand-name } Hakkında
about-glean-header = { -glean-brand-name } Hakkında
about-glean-interface-description =
    <a data-l10n-name="glean-sdk-doc-link">{ glean-sdk-brand-name }</a>
    { -vendor-short-name } projelerinde kullanılan bir veri toplama kitaplığıdır.
    Bu arayüz, geliştiriciler ve testçiler tarafından <a data-l10n-name="fog-link"> enstrümantasyonu manuel olarak test etmek</a> amacıyla tasarlanmıştır.

about-glean-upload-enabled = Veri yükleme etkin.
about-glean-upload-disabled = Veri yükleme devre dışı.
about-glean-upload-enabled-local = Veri yükleme yalnızca yerel bir sunucuya göndermek üzere etkin.
about-glean-upload-fake-enabled =
    Veri yükleme kapalı ama verilerin yerel olarak kaydedilmeye devam etmesi için { glean-sdk-brand-name }’e yanlış bilgi vererek açık olduğunu söylüyoruz.
    Not: Hata ayıklama etiketi ayarlarsanız ping’ler ayarlardan bağımsız olarak <a data-l10n-name="glean-debug-ping-viewer">{ glean-debug-ping-viewer-brand-name }</a>’e yüklenir.

# This message is followed by a bulleted list.
about-glean-prefs-and-defines = İlgili <a data-l10n-name="fog-prefs-and-defines-doc-link">tercihler ve tanımlar</a> şunları içeriyor:
# Variables:
#   $data-upload-pref-value (String): the value of the datareporting.healthreport.uploadEnabled pref. Typically "true", sometimes "false"
# Do not translate strings between <code> </code> tags.
about-glean-data-upload = <code>datareporting.healthreport.uploadEnabled</code>: { $data-upload-pref-value }
# Variables:
#   $local-port-pref-value (Integer): the value of the telemetry.fog.test.localhost_port pref. Typically 0. Can be negative.
# Do not translate strings between <code> </code> tags.
about-glean-local-port = <code>telemetry.fog.test.localhost_port</code>: { $local-port-pref-value }
# Variables:
#   $glean-android-define-value (Boolean): the value of the MOZ_GLEAN_ANDROID define. Typically "false", sometimes "true".
# Do not translate strings between <code> </code> tags.
about-glean-glean-android = <code>MOZ_GLEAN_ANDROID</code>: { $glean-android-define-value }
# Variables:
#   $moz-official-define-value (Boolean): the value of the MOZILLA_OFFICIAL define.
# Do not translate strings between <code> </code> tags.
about-glean-moz-official = <code>MOZILLA_OFFICIAL</code>: { $moz-official-define-value }

about-glean-about-testing-header = Test Hakkında

# This message is an option in a dropdown filled with untranslated names of pings.
about-glean-no-ping-label = (hiçbir ping gönderme)
# An in-line text input field precedes this string.
about-glean-label-for-tag-pings = Önceki alanda, pinglerinizi daha sonra tanıyabilmeniz için akılda kalıcı bir hata ayıklama etiketi olduğundan emin olun.


controls-button-label-verbose = Ayarları uygula ve ping gönder

about-glean-about-data-header = Veriler Hakkında
about-glean-about-data-explanation = Toplanan verilerin listesine göz atmak için lütfen <a data-l10n-name="glean-dictionary-link">{ -glean-brand-name } Sözlüğü’nü inceleyin</a>.
