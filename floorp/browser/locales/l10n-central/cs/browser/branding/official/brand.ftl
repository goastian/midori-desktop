# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Firefox and Mozilla Brand
##
## Firefox and Mozilla must be treated as a brand.
##
## They cannot be:
## - Transliterated.
## - Translated.
##
## Declension should be avoided where possible, leaving the original
## brand unaltered in prominent UI positions.
##
## For further details, consult:
## https://mozilla-l10n.github.io/styleguides/mozilla_general/#brands-copyright-and-trademark

-brand-shorter-name =
    { $case ->
        [gen] Firefoxu
        [dat] Firefoxu
        [acc] Firefox
        [voc] Firefoxe
        [loc] Firefoxu
        [ins] Firefoxem
       *[nom] Firefox
    }
    .gender = masculine
    .case-status = with-cases
-brand-short-name =
    { $case ->
        [gen] Firefoxu
        [dat] Firefoxu
        [acc] Firefox
        [voc] Firefoxe
        [loc] Firefoxu
        [ins] Firefoxem
       *[nom] Firefox
    }
    .gender = masculine
    .case-status = with-cases
-brand-shortcut-name =
    { $case ->
        [gen] Firefoxu
        [dat] Firefoxu
        [acc] Firefox
        [voc] Firefoxe
        [loc] Firefoxu
        [ins] Firefoxem
       *[nom] Firefox
    }
    .gender = masculine
    .case-status = with-cases
-brand-full-name =
    { $case ->
        [gen] Mozilly Firefoxu
        [dat] Mozille Firefoxu
        [acc] Mozillu Firefox
        [voc] Mozillo Firefoxe
        [loc] Mozille Firefoxu
        [ins] Mozillou Firefoxem
       *[nom] Mozilla Firefox
    }
    .gender = masculine
    .case-status = with-cases
# This brand name can be used in messages where the product name needs to
# remain unchanged across different versions (Nightly, Beta, etc.).
-brand-product-name =
    { $case ->
        [gen] Firefoxu
        [dat] Firefoxu
        [acc] Firefox
        [voc] Firefoxe
        [loc] Firefoxu
        [ins] Firefoxem
       *[nom] Firefox
    }
    .gender = masculine
    .case-status = with-cases
-vendor-short-name =
    { $case ->
        [gen] Mozilly
        [dat] Mozille
        [acc] Mozillu
        [voc] Mozillo
        [loc] Mozille
        [ins] Mozillou
       *[nom] Mozilla
    }
    .gender = feminine
    .case-status = with-cases
trademarkInfo = Firefox a jeho loga jsou ochrannými známkami organizace Mozilla Foundation.
