# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# This label is used by screenreaders and other assistive technology to indicate
# to users how much of the video has been loaded from the network. It will be
# followed by the percentage of the video that has loaded (e.g. "Loading: 13%").
videocontrols-buffer-bar-label = Yükleniyor:
videocontrols-volume-control =
    .aria-label = Ses
videocontrols-closed-caption-button =
    .aria-label = Altyazılar

videocontrols-play-button =
    .aria-label = Oynat
videocontrols-pause-button =
    .aria-label = Duraklat
videocontrols-mute-button =
    .aria-label = Sesi kapat
videocontrols-unmute-button =
    .aria-label = Sesi aç
videocontrols-enterfullscreen-button =
    .aria-label = Tam ekran
videocontrols-exitfullscreen-button =
    .aria-label = Tam ekrandan çık
videocontrols-casting-button-label =
    .aria-label = Ekrana yansıt
videocontrols-closed-caption-off =
    .offlabel = Kapalı

# This string is used as part of the Picture-in-Picture video toggle button when
# the mouse is hovering it.
videocontrols-picture-in-picture-label = Görüntü içinde görüntü

# This string is used as the label for a variation of the Picture-in-Picture video
# toggle button when the mouse is hovering over the video.
videocontrols-picture-in-picture-toggle-label2 = Bu videoyu dışarı çıkar

videocontrols-picture-in-picture-explainer3 = Daha çok ekran, daha çok eğlence. Başka şeyler yaparken bu videoyu da oynatın.

videocontrols-error-aborted = Video yükleme durduruldu.
videocontrols-error-network = Bir ağ hatası nedeniyle video oynatması iptal edildi.
videocontrols-error-decode = Dosya hasarlı olduğu için video oynatılamıyor.
videocontrols-error-src-not-supported = Video biçimi veya MIME türü desteklenmiyor.
videocontrols-error-no-source = Desteklenen biçimlerde veya MIME türlerinde video bulunamadı.
videocontrols-error-generic = Bilinmeyen bir hata nedeniyle video oynatma iptal edildi.
videocontrols-status-picture-in-picture = Bu video, görüntü içinde görüntü modunda oynatılıyor.

# This message shows the current position and total video duration
#
# Variables:
#   $position (String): The current media position
#   $duration (String): The total video duration
#
# For example, when at the 5 minute mark in a 6 hour long video,
# $position would be "5:00" and $duration would be "6:00:00", result
# string would be "5:00 / 6:00:00". Note that $duration is not always
# available. For example, when at the 5 minute mark in an unknown
# duration video, $position would be "5:00" and the string which is
# surrounded by <span> would be deleted, result string would be "5:00".
videocontrols-position-and-duration-labels = { $position }<span data-l10n-name="position-duration-format"> / { $duration }</span>

# This is a plain text version of the videocontrols-position-and-duration-labels
# string, used by screenreaders.
#
# Variables:
#   $position (String): The current media position
#   $duration (String): The total video duration
videocontrols-scrubber-position-and-duration =
    .aria-label = Konum
    .aria-valuetext = { $position } / { $duration }
