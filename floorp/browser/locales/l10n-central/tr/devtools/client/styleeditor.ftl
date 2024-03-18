# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

styleeditor-new-button =
    .tooltiptext = Yeni bir stil sayfası oluştur ve belgeye ekle
    .accesskey = Y
styleeditor-import-button =
    .tooltiptext = Mevcut bir stil sayfasını içe al ve belgeye ekle
    .accesskey = e
styleeditor-filter-input =
    .placeholder = Stil dosyalarını filtrelere
styleeditor-visibility-toggle =
    .tooltiptext = Stil sayfası görünürlüğünü aç/kapat
    .accesskey = K
styleeditor-visibility-toggle-system =
    .tooltiptext = Sistem stil dosyaları devre dışı bırakılamaz
styleeditor-save-button = Kaydet
    .tooltiptext = Bu stil sayfasını bir dosyaya kaydet
    .accesskey = K
styleeditor-options-button =
    .tooltiptext = Stil editörü seçenekleri
styleeditor-at-rules = “At” kuralları
styleeditor-editor-textbox =
    .data-placeholder = CSS’i buraya yazın.
styleeditor-no-stylesheet = Bu sayfanın stil sayfası yok.
styleeditor-no-stylesheet-tip = Belki de <a data-l10n-name="append-new-stylesheet">yeni bir stil sayfası eklemek</a>istersiniz?
styleeditor-open-link-new-tab =
    .label = Bağlantıyı yeni sekmede aç
styleeditor-copy-url =
    .label = URL’yi kopyala
styleeditor-find =
    .label = Bul
    .accesskey = B
styleeditor-find-again =
    .label = Sonrakini bul
    .accesskey = n
styleeditor-go-to-line =
    .label = Satıra git…
    .accesskey = r
# Label displayed when searching a term that is not found in any stylesheet path
styleeditor-stylesheet-all-filtered = Eşleşen stil dosyası bulunamadı.

# This string is shown in the style sheets list
# Variables:
#   $ruleCount (Integer) - The number of rules in the stylesheet.
styleeditor-stylesheet-rule-count =
    { $ruleCount ->
        [one] { $ruleCount } kural.
       *[other] { $ruleCount } kural.
    }
