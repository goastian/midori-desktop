# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# This label is used by screenreaders and other assistive technology to indicate
# to users how much of the video has been loaded from the network. It will be
# followed by the percentage of the video that has loaded (e.g. "Loading: 13%").
videocontrols-buffer-bar-label = Завантаження:
videocontrols-volume-control =
    .aria-label = Гучність
videocontrols-closed-caption-button =
    .aria-label = Закриті підписи

videocontrols-play-button =
    .aria-label = Відтворити
videocontrols-pause-button =
    .aria-label = Пауза
videocontrols-mute-button =
    .aria-label = Вимкнути звук
videocontrols-unmute-button =
    .aria-label = Увімкнути звук
videocontrols-enterfullscreen-button =
    .aria-label = На весь екран
videocontrols-exitfullscreen-button =
    .aria-label = Вийти з повноекранного режиму
videocontrols-casting-button-label =
    .aria-label = Вивести на екран
videocontrols-closed-caption-off =
    .offlabel = Вимкнено

# This string is used as part of the Picture-in-Picture video toggle button when
# the mouse is hovering it.
videocontrols-picture-in-picture-label = Зображення в зображенні

# This string is used as the label for a variation of the Picture-in-Picture video
# toggle button when the mouse is hovering over the video.
videocontrols-picture-in-picture-toggle-label2 = Відкріпити відео

videocontrols-picture-in-picture-explainer3 = Більше екранів – веселіше. Дивіться це відео, займаючись іншими справами.

videocontrols-error-aborted = Завантаження відео зупинилось.
videocontrols-error-network = Відтворення відео зупинено через мережеву помилку.
videocontrols-error-decode = Відео не може бути відтворене бо файл пошкоджений.
videocontrols-error-src-not-supported = Відеоформат або тип MIME не підтримується.
videocontrols-error-no-source = Не знайдено відео у підтримуваному форматі та типі MIME.
videocontrols-error-generic = Відтворення відео зупинено через невідому помилку.
videocontrols-status-picture-in-picture = Це відео відтворюється в режимі "Зображення в зображенні".

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
    .aria-label = Розташування
    .aria-valuetext = { $position } / { $duration }
