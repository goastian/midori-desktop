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
       *[nominative] Firefox
        [accusative] Firefoxot
        [instrumental] Firefoxszal
    }
-brand-short-name =
    { $case ->
       *[nominative] Firefox
        [accusative] Firefoxot
        [instrumental] Firefoxszal
    }
-brand-shortcut-name =
    { $case ->
       *[nominative] Firefox
        [accusative] Firefoxot
        [instrumental] Firefoxszal
    }
-brand-full-name = Midori Browser
# This brand name can be used in messages where the product name needs to
# remain unchanged across different versions (Nightly, Beta, etc.).
-brand-product-name =
    { $case ->
       *[nominative] Firefox
        [accusative] Firefoxot
        [instrumental] Firefoxszal
    }
-vendor-short-name =
    { $ending ->
       *[normal]
            { $case ->
               *[upper] Mozilla
                [lower] mozilla
            }
        [accented]
            { $case ->
               *[upper] Mozillá
                [lower] mozillá
            }
    }
trademarkInfo = A Firefox és a Firefox logó a Mozilla Foundation védjegye.
