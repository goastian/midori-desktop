# Firefox Mod Blur integration notes

Midori's Blur modules are a selective adaptation of
[Firefox-Mod-Blur](https://github.com/datguypiko/Firefox-Mod-Blur), not a
verbatim import.

- Audited snapshot: [`c34ddbaac4f16e2b9bcbaaf0ebfe146e20fc5492`](https://github.com/datguypiko/Firefox-Mod-Blur/commit/c34ddbaac4f16e2b9bcbaaf0ebfe146e20fc5492)
- Snapshot date: 2026-10-27
- Compatibility audit date: 2026-10-30
- Upstream target stated by the commit: Firefox 159
- Midori source target during this audit: Firefox 159
- Previous reference: `8860f7d38cf6ea1f0eea58bee521cfd5cf897c27` (Firefox 152)

The selected commit changes only `userChrome.css`. The cumulative comparison
from the previous reference contains 26 commits; it also changes upstream
New Tab styles, optional bookmark/window-control modules, and icon assets.
This audit updates compatibility with the selected commit, without claiming
that every new upstream visual feature is implemented in Midori.

## Firefox 159 compatibility decisions

| Upstream change | Midori adaptation |
| --- | --- |
| Toolbar/toolbox color variable names | Already uses `--toolbar-background-color` and `--toolbox-background-color`; retain the existing legacy alias for consumers that still need it. |
| Search result hover and selection variables | Already uses lowercase `--urlbarview-*` variables and Midori theme colors. |
| Search result rounding variable | Define `--urlbarview-row-border-radius` from Midori's existing search-result radius, including nested Nova result surfaces. |
| Logical menu item padding | Split Midori density into block/inline tokens, wire them to `--menuitem-padding-block` / `--menuitem-padding-inline` and panel equivalents, and retain the compound compatibility token. |
| Panel separator variable rename | No obsolete separator-padding override exists in Midori; retain native spacing. |
| Result button ancestry and `aria-expanded` | Midori has no outdated button override; preserve Firefox's current hover, keyboard-selection, and expanded-menu behavior. |
| Loading icon variable rename | Midori does not override the retired loading-fill variable; retain native loading feedback. |
| Tracker-count feature gates | Midori's compact-identity rules already preserve active tracking/security indicators without depending on the retired gate; do not copy upstream hiding rules. |
| Invalid nested `var()` fallbacks | The affected upstream declarations are not present in Midori. |
| Removed Acrylic import | Midori has no such import; its explicitly selected Acrylic option remains an independent Midori extension. |

The changed rules are shared across Linux, Windows, and macOS. Native Windows
and macOS rendering still requires validation on those operating systems.

## Validation on 2026-10-30

Rebuilt the browser UI resources with `python3.11 ./mach build faster` from
`engine/`, then exercised the packaged styles in the local Midori binary with
Gecko 159.0 and a disposable headless Linux profile. No upstream stylesheet
was registered in the browser and no personal profile was opened.

The integration passed 159 assertions across 12 combinations of Nova/Proton,
Jade/Midnight, and compact/balanced/comfortable density. It opens native context
menus and the real application menu, queries a synthetic Places entry in the
real address bar, and checks computed padding, result rounding, selected/hover
color tokens, expanded result-button visibility, reduced motion, and reduced
transparency. The application menu is checked with and without Midori's custom
menu icons; its intentional 10px icon-mode inline spacing is preserved.

Local evidence and the reproducible harness are in
`artifacts/modblur-c34ddbaa/`: `build-faster.log`, `check-integration.py`,
`integration.log`, and `integration-results.json`. These are local audit
artifacts, not an additional unit-test suite.

The browser chrome implementation maps upstream behavior to namespaced
`midori.modblur.*` preferences and current Midori/Firefox selectors. Security
warnings, active permissions, keyboard focus, high-contrast rendering, reduced
motion, and reduced transparency take precedence over decorative hiding or
blur.

The bundled `noise-512x512.png`, `spill.svg`, and `spill-light.svg` assets were
verified against the previous reference. The cumulative upstream comparison
does not modify those assets. The New Tab variants
`spill-main.svg` and `spill-main-light.svg` preserve the audited snapshot's
geometry and colors. Grain and Acrylic controls are Midori extensions; the
upstream snapshot contains the noise asset but does not enable it from its CSS.

New Tab styles are packaged as `resource:///modules/midori-newtab-modblur.css`
and registered as a privileged user sheet. `scripts/download-addons.sh` marks
only the bundled Midori New Tab document, while the stylesheet also restricts
itself to `moz-extension://` URLs. This is required because `-moz-pref()` is not
enabled in a normal extension author sheet. The rules target stable semantic
classes including `speed-dial-*`, `bookmark-grid`, and `widget-card__surface`;
tests must be updated if the add-on changes those class contracts.

Panel blur intentionally follows upstream's supported-popup allow-list and
disables popup entrance animation to avoid exposing the compositor's gray
paint phase. Wallpaper blur uses a pseudo-element backdrop rather than
filtering and scaling the image itself.

The audited upstream snapshot has no `LICENSE` or `COPYING` file. Do not label
this adaptation as an exact or relicensed copy, and confirm distribution terms
with the upstream author before importing substantial blocks verbatim.
