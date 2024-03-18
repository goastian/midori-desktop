# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### These strings are used inside the Accessibility panel.

accessibility-learn-more = Daha fazla bilgi al

accessibility-text-label-header = Metin etiketleri ve adları

accessibility-keyboard-header = Klavye

## Text entries that are used as text alternative for icons that depict accessibility isses.


## These strings are used in the overlay displayed when running an audit in the accessibility panel

accessibility-progress-initializing = başlatılıyor…
    .aria-valuetext = başlatılıyor…

# This string is displayed in the audit progress bar in the accessibility panel.
# Variables:
#   $nodeCount (Integer) - The number of nodes for which the audit was run so far.
accessibility-progress-progressbar =
    { $nodeCount ->
        [one] { $nodeCount } düğüm denetleniyor
       *[other] { $nodeCount } düğüm denetleniyor
    }

accessibility-progress-finishing = Tamamlanıyor…
    .aria-valuetext = Tamamlanıyor…

## Text entries that are used as text alternative for icons that depict accessibility issues.

accessibility-warning =
    .alt = Uyarı

accessibility-fail =
    .alt = Hata

accessibility-best-practices =
    .alt = En iyi uygulamalar

## Text entries for a paragraph used in the accessibility panel sidebar's checks section
## that describe that currently selected accessible object has an accessibility issue
## with its text label or accessible name.

accessibility-text-label-issue-area = <span>href</span> özniteliğine sahip <div>area</div> elemanlarını etiketlemek için <code>alt</code> özniteliğini kullanın. <a>Daha fazla bilgi alın</a>

accessibility-text-label-issue-dialog = İletişim kutuları etiketlenmeli. <a>Daha fazla bilgi alın</a>

accessibility-text-label-issue-document-title = Belgelerin <code>başlığı</code> olmalı. <a>Daha fazla bilgi alın</a>

accessibility-text-label-issue-embed = Gömülü içerikler etiketlenmeli. <a>Daha fazla bilgi alın</a>

accessibility-text-label-issue-figure = İsteğe bağlı caption'ları olan figürler etiketlenmelidir. <a>Daha fazla bilgi alın</a>

accessibility-text-label-issue-fieldset = <code>fieldset</code> elemanları etiketlenmelidir. <a>Daha fazla bilgi alın</a>

accessibility-text-label-issue-fieldset-legend2 = <span>fieldset</span> elemanlarını etiketlemek için <code>legend</code> elemanını kullanın. <a>Daha fazla bilgi alın</a>

accessibility-text-label-issue-form = From elemanları etiketlenmeli. <a>Daha fazla bilgi alın</a>

accessibility-text-label-issue-form-visible = Form elemanlarının görünür metin etiketleri olmalı. <a>Daha fazla bilgi alın</a>

accessibility-text-label-issue-frame = <code>frame</code> elemanları etiketlenmeli. <a>Daha fazla bilgi alın</a>

accessibility-text-label-issue-glyph = <span>mglyph</span> elemanlarını etiketlemek için <code>alt</code> özniteliğini kullanın. <a>Daha fazla bilgi alın</a>

accessibility-text-label-issue-heading = Başlıklar etiketlenmeli. <a>Daha fazla bilgi alın</a>

accessibility-text-label-issue-heading-content = Başlıklar görünür metin içeriğine sahip olmalı. <a>Daha fazla bilgi alın</a>

accessibility-text-label-issue-iframe = <span>iframe</span> içeriğini tanımlamak için <code>title</code> özniteliğini kullanın. <a>Daha fazla bilgi alın</a>

accessibility-text-label-issue-image = Resimli içerikler etiketlenmelidir. <a>Daha fazla bilgi alın</a>

accessibility-text-label-issue-interactive = Etkileşimli elemanlar etiketlenmelidir. <a>Daha fazla bilgi alın</a>

accessibility-text-label-issue-optgroup-label2 = <span>optgroup</span> elemanlarını etiketlemek için <code>label</code> özniteliğini kullanın. <a>Daha fazla bilgi alın</a>

accessibility-text-label-issue-toolbar = birden fazla araç çubuğu varsa araç çubukları etiketlenmeli. <a>Daha fazla bilgi alın</a>

## Text entries for a paragraph used in the accessibility panel sidebar's checks section
## that describe that currently selected accessible object has a keyboard accessibility
## issue.

accessibility-keyboard-issue-semantics = Odaklanabilir elemanlar etkileşimli semantiğe sahip olmalıdır. <a>Daha fazla bilgi alın</a>

accessibility-keyboard-issue-tabindex = Sıfırdan büyük <code>tabindex</code> özniteliğini kullanmaktan kaçının. <a>Daha fazla bilgi alın</a>

accessibility-keyboard-issue-action = Etkileşimli elemanlar klavye ile etkinleştirilebilmelidir. <a>Daha fazla bilgi alın</a>

accessibility-keyboard-issue-focusable = Etkileşimli elemanlar odaklanılabilir olmalı. <a>Daha fazla bilgi alın</a>

accessibility-keyboard-issue-focus-visible = Odaklanabilir elemanın focus stili eksik olabilir. <a>Daha fazla bilgi alın</a>

accessibility-keyboard-issue-mouse-only = Tıklanabilir elemanlar odaklanılabilir olmalı ve etkileşimli semantiğe sahip olmalı. <a>Daha fazla bilgi alın</a>
