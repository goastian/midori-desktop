# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Localization for about:webrtc, a troubleshooting and diagnostic page
### for WebRTC calls. See https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API.

# The text "WebRTC" is a proper noun and should not be translated.
about-webrtc-document-title = WebRTC iç bilgileri
# "about:webrtc" is a internal browser URL and should not be
# translated. This string is used as a title for a file save dialog box.
about-webrtc-save-page-dialog-title = about:webrtc'yi farklı kaydet

## These labels are for a disclosure which contains the information for closed PeerConnection sections

about-webrtc-closed-peerconnection-disclosure-show-msg = Kapalı PeerConnection’ları göster
about-webrtc-closed-peerconnection-disclosure-hide-msg = Kapalı PeerConnection’ları gizle

## AEC is an abbreviation for Acoustic Echo Cancellation.

about-webrtc-aec-logging-msg-label = AEC günlük kaydı
about-webrtc-aec-logging-off-state-label = AEC kaydını başlat
about-webrtc-aec-logging-on-state-label = AEC kaydını durdur
about-webrtc-aec-logging-on-state-msg = AEC kaydı etkin (Arayanla birkaç dakika konuştuktan sonra yakalamayı durdurun)
about-webrtc-aec-logging-toggled-on-state-msg = AEC kaydı etkin (Arayanla birkaç dakika konuştuktan sonra yakalamayı durdurun)
# Variables:
#  $path (String) - The path to which the aec log file is saved.
about-webrtc-aec-logging-toggled-off-state-msg = Yakalanan günlük dosyaları şurada bulunabilir: { $path }

##

# The autorefresh checkbox causes a stats section to autorefresh its content when checked
about-webrtc-auto-refresh-label = Otomatik yenile
# Determines the default state of the Auto Refresh check boxes
about-webrtc-auto-refresh-default-label = Varsayılan olarak otomatik yenile
# A button which forces a refresh of displayed statistics
about-webrtc-force-refresh-button = Yenile
# "PeerConnection" is a proper noun associated with the WebRTC module. "ID" is
# an abbreviation for Identifier. This string should not normally be translated
# and is used as a data label.
about-webrtc-peerconnection-id-label = PeerConnection ID:
# The number of DataChannels that a PeerConnection has opened
about-webrtc-data-channels-opened-label = Açılan veri kanalları:
# The number of once open DataChannels that a PeerConnection has closed
about-webrtc-data-channels-closed-label = Kapatılan veri kanalları:

## "SDP" is an abbreviation for Session Description Protocol, an IETF standard.
## See http://wikipedia.org/wiki/Session_Description_Protocol

about-webrtc-sdp-heading = SDP
about-webrtc-local-sdp-heading = Yerel SDP
about-webrtc-local-sdp-heading-offer = Yerel SDP (Teklif)
about-webrtc-local-sdp-heading-answer = Yerel SDP (Yanıt)
about-webrtc-remote-sdp-heading = Uzak SDP
about-webrtc-remote-sdp-heading-offer = Uzak SDP (Teklif)
about-webrtc-remote-sdp-heading-answer = Uzak SDP (Yanıt)
about-webrtc-sdp-history-heading = SDP geçmişi
about-webrtc-sdp-parsing-errors-heading = SDP ayrıştırma hataları

##

# "RTP" is an abbreviation for the Real-time Transport Protocol, an IETF
# specification, and should not normally be translated. "Stats" is an
# abbreviation for Statistics.
about-webrtc-rtp-stats-heading = RTP istatistikleri

## "ICE" is an abbreviation for Interactive Connectivity Establishment, which
## is an IETF protocol, and should not normally be translated.

about-webrtc-ice-state = ICE durumu
# "Stats" is an abbreviation for Statistics.
about-webrtc-ice-stats-heading = ICE istatistikleri
about-webrtc-ice-restart-count-label = ICE yeniden başlatma:
about-webrtc-ice-rollback-count-label = ICE geri döndürme:
about-webrtc-ice-pair-bytes-sent = Gönderilen bayt:
about-webrtc-ice-pair-bytes-received = Alınan bayt:
about-webrtc-ice-component-id = Bileşen kimliği

## These adjectives are used to label a line of statistics collected for a peer
## connection. The data represents either the local or remote end of the
## connection.

about-webrtc-type-local = Yerel
about-webrtc-type-remote = Uzak

##

# This adjective is used to label a table column. Cells in this column contain
# the localized javascript string representation of "true" or are left blank.
about-webrtc-nominated = Aday
# This adjective is used to label a table column. Cells in this column contain
# the localized javascript string representation of "true" or are left blank.
# This represents an attribute of an ICE candidate.
about-webrtc-selected = Seçildi
about-webrtc-save-page-label = Sayfayı kaydet
about-webrtc-debug-mode-msg-label = Hata ayıklama modu
about-webrtc-debug-mode-off-state-label = Hata ayıklama modunu başlat
about-webrtc-debug-mode-on-state-label = Hata ayıklama modunu durdur
about-webrtc-stats-heading = Oturum istatistikleri
about-webrtc-stats-clear = Geçmişi temizle
about-webrtc-log-heading = Bağlantı günlüğü
about-webrtc-log-clear = Günlüğü temizle
about-webrtc-log-show-msg = günlüğü göster
    .title = bu bölümü genişletmek için tıklayın
about-webrtc-log-hide-msg = günlüğü gizle
    .title = bu bölümü daraltmak için tıklayın
about-webrtc-log-section-show-msg = Günlüğü göster
    .title = Bu bölümü genişletmek için tıklayın
about-webrtc-log-section-hide-msg = Günlüğü gizle
    .title = Bu bölümü daraltmak için tıklayın
about-webrtc-copy-report-button = Raporu kopyala
about-webrtc-copy-report-history-button = Rapor geçmişini kopyala

## These are used to display a header for a PeerConnection.
## Variables:
##  $browser-id (Number) - A numeric id identifying the browser tab for the PeerConnection.
##  $id (String) - A globally unique identifier for the PeerConnection.
##  $url (String) - The url of the site which opened the PeerConnection.
##  $now (Date) - The JavaScript timestamp at the time the report was generated.

about-webrtc-connection-open = [ { $browser-id } | { $id } ] { $url } { $now }
about-webrtc-connection-closed = [ { $browser-id } | { $id } ] { $url } (kapatıldı) { $now }

## These are used to indicate what direction media is flowing.
## Variables:
##  $codecs - a list of media codecs

about-webrtc-short-send-receive-direction = Gönderme/alma: { $codecs }
about-webrtc-short-send-direction = Gönderme: { $codecs }
about-webrtc-short-receive-direction = Alma: { $codecs }

##

about-webrtc-local-candidate = Yerel aday
about-webrtc-remote-candidate = Uzak aday
about-webrtc-raw-candidates-heading = Tüm ham adaylar
about-webrtc-raw-local-candidate = Ham yerel aday
about-webrtc-raw-remote-candidate = Ham uzak aday
about-webrtc-raw-cand-show-msg = ham adayları göster
    .title = bu bölümü genişletmek için tıklayın
about-webrtc-raw-cand-hide-msg = ham adayları gizle
    .title = bu bölümü daraltmak için tıklayın
about-webrtc-raw-cand-section-show-msg = Ham adayları göster
    .title = Bu bölümü genişletmek için tıklayın
about-webrtc-raw-cand-section-hide-msg = Ham adayları gizle
    .title = Bu bölümü daraltmak için tıklayın
about-webrtc-priority = Öncelik
about-webrtc-fold-show-msg = ayrıntıları göster
    .title = bu bölümü genişletmek için tıklayın
about-webrtc-fold-hide-msg = ayrıntıları gizle
    .title = bu bölümü daraltmak için tıklayın
about-webrtc-fold-default-show-msg = Ayrıntıları göster
    .title = Bu bölümü genişletmek için tıklayın
about-webrtc-fold-default-hide-msg = Ayrıntıları gizle
    .title = Bu bölümü daraltmak için tıklayın
about-webrtc-dropped-frames-label = Atlanan kareler:
about-webrtc-discarded-packets-label = Atılan paketler:
about-webrtc-decoder-label = Çözücü
about-webrtc-encoder-label = Kodlayıcı
about-webrtc-show-tab-label = Sekmeyi göster
about-webrtc-current-framerate-label = Kare hızı
about-webrtc-width-px = Genişlik (piksel)
about-webrtc-height-px = Yükseklik (piksel)
about-webrtc-consecutive-frames = Ardışık kareler
about-webrtc-time-elapsed = Geçen süre (sn)
about-webrtc-estimated-framerate = Tahmini kare hızı
about-webrtc-rotation-degrees = Rotasyon (derece)
about-webrtc-first-frame-timestamp = İlk kare alım zaman damgası
about-webrtc-last-frame-timestamp = Son kare alım zaman damgası

## SSRCs are identifiers that represent endpoints in an RTP stream

# This is an SSRC on the local side of the connection that is receiving RTP
about-webrtc-local-receive-ssrc = Yerel alıcı SSRC
# This is an SSRC on the remote side of the connection that is sending RTP
about-webrtc-remote-send-ssrc = Uzak gönderici SSRC

## These are displayed on the button that shows or hides the
## PeerConnection configuration disclosure

about-webrtc-pc-configuration-show-msg = Yapılandırmayı göster
about-webrtc-pc-configuration-hide-msg = Yapılandırmayı gizle

##

# An option whose value will not be displayed but instead noted as having been
# provided
about-webrtc-configuration-element-provided = Sağlandı
# An option whose value will not be displayed but instead noted as having not
# been provided
about-webrtc-configuration-element-not-provided = Sağlanmadı
# The options set by the user in about:config that could impact a WebRTC call
about-webrtc-custom-webrtc-configuration-heading = Kullanıcı tanımlı WebRTC tercihleri
# Section header for estimated bandwidths of WebRTC media flows
about-webrtc-bandwidth-stats-heading = Tahmini bant genişliği
# The ID of the MediaStreamTrack
about-webrtc-track-identifier = İz kimliği
# The estimated bandwidth available for sending WebRTC media in bytes per second
about-webrtc-send-bandwidth-bytes-sec = Gönderme bant genişliği (bayt/sn)
# The estimated bandwidth available for receiving WebRTC media in bytes per second
about-webrtc-receive-bandwidth-bytes-sec = Alma bant genişliği (bayt/sn)
# Maximum number of bytes per second that will be padding zeros at the ends of packets
about-webrtc-max-padding-bytes-sec = Maksimum dolgu (bayt/sn)
# The amount of time inserted between packets to keep them spaced out
about-webrtc-pacer-delay-ms = Pacer gecikmesi ms
# The amount of time it takes for a packet to travel from the local machine to the remote machine,
# and then have a packet return
about-webrtc-round-trip-time-ms = RTT ms
# This is a section heading for video frame statistics for a MediaStreamTrack.
# see https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack.
# Variables:
#   $track-identifier (String) - The unique identifier for the MediaStreamTrack.
about-webrtc-frame-stats-heading = Video Karesi İstatistikleri - MediaStreamTrack ID: { $track-identifier }

## These are paths used for saving the about:webrtc page or log files so
## they can be attached to bug reports.
## Variables:
##  $path (String) - The path to which the file is saved.

about-webrtc-save-page-msg = sayfa { $path } konumuna kaydedildi
about-webrtc-debug-mode-off-state-msg = izleme günlüğü { $path } konumunda bulunabilir
about-webrtc-debug-mode-on-state-msg = hata ayıklama modu etkin, izleme günlük konumu: { $path }
about-webrtc-aec-logging-off-state-msg = yakalanan günlük dosyaları şurada bulunabilir: { $path }
about-webrtc-save-page-complete-msg = Sayfa { $path } konumuna kaydedildi
about-webrtc-debug-mode-toggled-off-state-msg = Izleme günlüğü { $path } konumunda bulunabilir
about-webrtc-debug-mode-toggled-on-state-msg = Hata ayıklama modu etkin, izleme günlük konumu: { $path }

##

# This is the total number of frames encoded or decoded over an RTP stream.
# Variables:
#  $frames (Number) - The number of frames encoded or decoded.
about-webrtc-frames =
    { $frames ->
        [one] { $frames } kare
       *[other] { $frames } kare
    }
# This is the number of audio channels encoded or decoded over an RTP stream.
# Variables:
#  $channels (Number) - The number of channels encoded or decoded.
about-webrtc-channels =
    { $channels ->
        [one] { $channels } kanal
       *[other] { $channels } kanal
    }
# This is the total number of packets received on the PeerConnection.
# Variables:
#  $packets (Number) - The number of packets received.
about-webrtc-received-label =
    { $packets ->
        [one] { $packets } paket alındı
       *[other] { $packets } paket alındı
    }
# This is the total number of packets lost by the PeerConnection.
# Variables:
#  $packets (Number) - The number of packets lost.
about-webrtc-lost-label =
    { $packets ->
        [one] { $packets } paket kayboldu
       *[other] { $packets } paket kayboldu
    }
# This is the total number of packets sent by the PeerConnection.
# Variables:
#  $packets (Number) - The number of packets sent.
about-webrtc-sent-label =
    { $packets ->
        [one] { $packets } paket gönderildi
       *[other] { $packets } paket gönderildi
    }
# Jitter is the variance in the arrival time of packets.
# See: https://w3c.github.io/webrtc-stats/#dom-rtcreceivedrtpstreamstats-jitter
# Variables:
#   $jitter (Number) - The jitter.
about-webrtc-jitter-label = Kararsızlık { $jitter }
# ICE candidates arriving after the remote answer arrives are considered trickled
# (an attribute of an ICE candidate). These are highlighted in the ICE stats
# table with light blue background.
about-webrtc-trickle-caption-msg = Sızan (yanıttan sonra gelen) adaylar mavi ile işaretlenmiştir

## "SDP" is an abbreviation for Session Description Protocol, an IETF standard.
## See http://wikipedia.org/wiki/Session_Description_Protocol

# This is used as a header for local SDP.
# Variables:
#  $timestamp (Number) - The Unix Epoch time at which the SDP was set.
about-webrtc-sdp-set-at-timestamp-local = { NUMBER($timestamp, useGrouping: "false") } zaman damgasıyla Yerel SDP ayarlandı
# This is used as a header for remote SDP.
# Variables:
#  $timestamp (Number) - The Unix Epoch time at which the SDP was set.
about-webrtc-sdp-set-at-timestamp-remote = { NUMBER($timestamp, useGrouping: "false") } zaman damgasıyla Uzak SDP ayarlandı
# This is used as a header for an SDP section contained in two columns allowing for side-by-side comparisons.
# Variables:
#  $timestamp (Number) - The Unix Epoch time at which the SDP was set.
#  $relative-timestamp (Number) - The timestamp relative to the timestamp of the earliest received SDP.
about-webrtc-sdp-set-timestamp = Zaman damgası { NUMBER($timestamp, useGrouping: "false") } (+ { $relative-timestamp } ms)

## These are displayed on the button that shows or hides the SDP information disclosure

about-webrtc-show-msg-sdp = SDP’yi göster
about-webrtc-hide-msg-sdp = SDP’yi gizle

## These are displayed on the button that shows or hides the Media Context information disclosure.
## The Media Context is the set of preferences and detected capabilities that informs
## the negotiated CODEC settings.

about-webrtc-media-context-show-msg = Medya bağlamını göster
about-webrtc-media-context-hide-msg = Medya bağlamını gizle
about-webrtc-media-context-heading = Medya bağlamı

##

