# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

privatebrowsingpage-open-private-window-label = Gizli pencere aç
    .accesskey = G
about-private-browsing-search-placeholder = Web’de ara
about-private-browsing-info-title = Gizli penceredesiniz
about-private-browsing-search-btn =
    .title = Web’de ara
# Variables
#  $engine (String): the name of the user's default search engine
about-private-browsing-handoff =
    .title = { $engine } ile arama yapın veya adres yazın
about-private-browsing-handoff-no-engine =
    .title = Arama yapın veya adres yazın
# Variables
#  $engine (String): the name of the user's default search engine
about-private-browsing-handoff-text = { $engine } ile arama yapın veya adres yazın
about-private-browsing-handoff-text-no-engine = Arama yapın veya adres yazın
about-private-browsing-not-private = Şu anda gizli bir pencerede değilsiniz.
about-private-browsing-info-description-private-window = Gizli pencere: { -brand-short-name }, tüm gizli pencereleri kapattığınızda arama ve gezinti geçmişinizi temizler. Unutmayın ki bu sizi anonim yapmaz.
about-private-browsing-info-description-simplified = { -brand-short-name }, tüm gizli pencereleri kapattığınızda arama ve gezinti geçmişinizi temizler ama bu sizi anonim yapmaz.
about-private-browsing-learn-more-link = Daha fazla bilgi al

about-private-browsing-hide-activity = İnternette gezinirken yaptıklarınızı ve konumunuzu gizleyin
about-private-browsing-get-privacy = Gezindiğiniz her yerde gizliliğinizi koruyun
about-private-browsing-hide-activity-1 = { -mozilla-vpn-brand-name } ile gezdiğiniz sayfaları ve konumunuzu gizleyebilirsiniz. Tek bir tıklamayla halka açık Wi-Fi ağlarında bile güvenli bir bağlantı kurabilirsiniz.
about-private-browsing-prominent-cta = { -mozilla-vpn-brand-name } ile gizli kalın

about-private-browsing-focus-promo-cta = { -focus-brand-name }’u indir
about-private-browsing-focus-promo-header = { -focus-brand-name }: Yolda gizli gezinti
about-private-browsing-focus-promo-text = Mobil gizlilik tarayıcımız her seferinde geçmişinizi ve çerezlerinizi temizler.

## The following strings will be used for experiments in Fx99 and Fx100

about-private-browsing-focus-promo-header-b = Gizli gezintiyi telefonunuza taşıyın
about-private-browsing-focus-promo-text-b = Ana mobil tarayıcınızda görünmesini istemediğiniz aramalar için { -focus-brand-name } kullanabilirsiniz.
about-private-browsing-focus-promo-header-c = Mobil cihazlarda üst düzey gizlilik
about-private-browsing-focus-promo-text-c = { -focus-brand-name } reklamları ve takip kodlarını engeller, her seferinde geçmişinizi temizler.

# This string is the title for the banner for search engine selection
# in a private window.
# Variables:
#   $engineName (String) - The engine name that will currently be used for the private window.
about-private-browsing-search-banner-title = Gizli pencerelerde varsayılan arama motorunuz { $engineName }
about-private-browsing-search-banner-description =
    { PLATFORM() ->
        [windows] Farklı bir arama motoru seçmek için <a data-l10n-name="link-options">Seçenekler</a>’e gidebilirsiniz
       *[other] Farklı bir arama motoru seçmek için <a data-l10n-name="link-options">Tercihler</a>’e gidebilirsiniz
    }
about-private-browsing-search-banner-close-button =
    .aria-label = Kapat

about-private-browsing-promo-close-button =
    .title = Kapat

## Strings used in a “pin promotion” message, which prompts users to pin a private window

about-private-browsing-pin-promo-header = Tek tıklamayla gizli gezinti
about-private-browsing-pin-promo-link-text =
    { PLATFORM() ->
        [macos] Dock’ta tut
       *[other] Görev çubuğuna sabitle
    }
about-private-browsing-pin-promo-title = Çerezleriniz ve geçmişiniz kaydedilmesin. Hiç kimse izlemiyormuş gibi gezin.

## Strings used in a promotion message for cookie banner reduction

# Simplified version of the headline if the original text doesn't work
# in your language: `See fewer cookie requests`.
about-private-browsing-cookie-banners-promo-header = Çerez bildirimlerine son!
about-private-browsing-cookie-banners-promo-button = Çerez bildirimlerini azaltın
about-private-browsing-cookie-banners-promo-message = Dikkatiniz dağılmadan gezinmeniz için { -brand-short-name }, çerez bildirimlerini otomatik olarak yanıtlayabilir. { -brand-short-name }, mümkün olduğu sürece tüm istekleri reddedecektir.
